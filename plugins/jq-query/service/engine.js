'use strict';
/**
 * engine.js —— jq 查询引擎池（按 flags-key 池化 worker + 超时护栏 + 崩溃重生成 + 串行队列）
 *
 * 单一权威：service HTTP API 与 MCP server 都经 createEngine().run() 执行查询；
 * 查询语义 = 真实 jq（jq-web WASM，jq 1.7；raw 通道 = 命令行完整等价）。
 *
 * 为什么按 flags-key 池化（勿删）：jq-web 0.6.2 存在跨调用 flags 粘连（-r 双向污染实验实证），
 * 且粘连点在同进程共享状态——同一 worker 内换 flags 会拿到上一条查询的输出模式。
 * 因此每个 worker 终身只服务一种 flags 组合；flags 变化 = 取/起新 worker；组合上限 4 个（LRU）。
 *
 * 事件顺序（全局串行队列）：
 *   run() 入队 → 取/起该 flags-key 的 worker（懒加载）→ postMessage →
 *   等待响应或超时 → 超时/线程死亡则 terminate + 从池中摘除（下次该 key 重生成）。
 * 幂等边界：查询是纯计算（无外部副作用），超时不自动重试——避免「用户以为跑一次、实际跑两次」。
 */
const path = require('path');
const { Worker } = require('worker_threads');

const DEFAULT_WORKER_PATH = path.join(__dirname, 'worker.js');
const IDLE_TTL_MS = 10 * 60 * 1000; // 空闲 worker 10 分钟后回收，释放 WASM 内存
const MAX_POOLED_KEYS = 4;          // 最多同时保留 4 种 flags 组合（LRU 淘汰）

function createEngine(opts) {
  const log = opts && opts.log ? opts.log : () => {};
  const workerPath = (opts && opts.workerPath) || DEFAULT_WORKER_PATH;

  /** flagsKey → { worker, readyPromise, lastUsed } */
  const pool = new Map();
  let seq = 0;
  let chain = Promise.resolve(); // 全局串行：一次只跑一条查询
  let sweeper = null;
  const stats = { queries: 0, timeouts: 0, respawns: 0, errors: 0 };

  function spawnWorker(flagsKey) {
    const readyPromise = new Promise((resolve, reject) => {
      const w = new Worker(workerPath, { workerData: { flagsKey } });
      const cleanup = () => {
        w.off('message', onMsg);
        w.off('error', onErr);
        w.off('exit', onExit);
      };
      const onMsg = (d) => {
        if (d && d.ready) { cleanup(); resolve(w); }
        else if (d && d.fatal) { cleanup(); pool.delete(flagsKey); reject(new Error(`jq 引擎加载失败: ${d.fatal}`)); }
      };
      const onErr = (e) => { cleanup(); pool.delete(flagsKey); reject(new Error(`jq worker 错误: ${e && e.message}`)); };
      const onExit = (code) => {
        if (!pool.has(flagsKey)) return; // 主动击杀路径，预期内
        cleanup(); pool.delete(flagsKey);
        reject(new Error(`jq worker 提前退出 code=${code}`));
      };
      w.on('message', onMsg);
      w.on('error', onErr);
      w.on('exit', onExit);
    });
    readyPromise.catch(() => { pool.delete(flagsKey); });
    pool.set(flagsKey, { worker: null, readyPromise, lastUsed: Date.now() });
    return readyPromise.then((w) => {
      const entry = pool.get(flagsKey);
      if (entry) entry.worker = w;
      return w;
    });
  }

  function evictLRU() {
    while (pool.size > MAX_POOLED_KEYS) {
      let oldestKey = null;
      let oldestTs = Infinity;
      for (const [k, e] of pool) {
        if (e.lastUsed < oldestTs) { oldestTs = e.lastUsed; oldestKey = k; }
      }
      if (!oldestKey) break;
      killWorker(oldestKey, 'LRU 淘汰');
    }
  }

  function killWorker(flagsKey, reason) {
    const entry = pool.get(flagsKey);
    if (!entry) return;
    pool.delete(flagsKey);
    stats.respawns += 1;
    if (entry.worker) {
      entry.worker.removeAllListeners('message');
      entry.worker.removeAllListeners('error');
      entry.worker.removeAllListeners('exit');
      entry.worker.terminate().catch(() => {});
    }
    log('warn', `jq worker 回收（key=${flagsKey}）: ${reason}`);
  }

  function armSweeper() {
    if (sweeper) clearTimeout(sweeper);
    sweeper = setTimeout(() => {
      const now = Date.now();
      for (const [k, e] of pool) {
        if (now - e.lastUsed > IDLE_TTL_MS) killWorker(k, 'idle');
      }
    }, IDLE_TTL_MS);
    if (sweeper.unref) sweeper.unref();
  }

  /** 单次查询（假定 worker 已就绪） */
  function runOnce(w, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      let settled = false;
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        w.off('message', onMsg);
        w.off('exit', onExit);
        fn(arg);
      };
      const timer = setTimeout(() => {
        finish(() => reject(Object.assign(
          new Error(`查询超时（${timeoutMs}ms）已终止。死循环/超大范围查询请加 limit(…)、first 或缩小 range；超时不自动重试。`),
          { user: true, timeout: true },
        )));
      }, timeoutMs);
      const onMsg = (d) => {
        if (d && d.id === id) {
          if (d.ok) finish(() => resolve({ ok: true, out: d.out, ms: d.ms }));
          else finish(() => reject(Object.assign(new Error(d.err || 'jq 执行失败'), { user: true, jq: true })));
        }
      };
      const onExit = (code) => {
        finish(() => reject(new Error(`jq 引擎线程在查询中退出 code=${code}（查询可能触发内存耗尽，引擎将重生成）`)));
      };
      w.on('message', onMsg);
      w.on('exit', onExit);
      w.postMessage({ id, ...payload });
    });
  }

  /**
   * 执行一次 jq 查询。payload = { input, query, flags, timeoutMs }
   * 返回 { ok, out, ms }；失败 throw（.user=true 用户层错误，.timeout=true 超时击杀，.jq=true jq 原生错误）。
   */
  function run(payload) {
    stats.queries += 1;
    const flags = Array.isArray(payload.flags) ? payload.flags.map(String) : [];
    const flagsKey = JSON.stringify(flags);
    const task = chain.then(async () => {
      let entry = pool.get(flagsKey);
      if (!entry) {
        evictLRU();
        try {
          await spawnWorker(flagsKey);
          entry = pool.get(flagsKey);
        } catch (e) {
          stats.errors += 1;
          throw e;
        }
      }
      entry.lastUsed = Date.now();
      try {
        const r = await runOnce(entry.worker, { input: payload.input, query: payload.query, flags }, payload.timeoutMs);
        armSweeper();
        return r;
      } catch (e) {
        armSweeper();
        if (e && e.timeout) { stats.timeouts += 1; killWorker(flagsKey, 'timeout'); }
        else if (!(e && e.jq)) { stats.errors += 1; killWorker(flagsKey, 'crash'); }
        throw e;
      }
    });
    // 队列自愈：前一个任务失败不阻塞后续查询
    chain = task.then(() => {}, () => {});
    return task;
  }

  async function shutdown() {
    if (sweeper) clearTimeout(sweeper);
    const kills = [...pool.keys()];
    for (const k of kills) {
      const entry = pool.get(k);
      pool.delete(k);
      if (entry && entry.worker) {
        entry.worker.removeAllListeners('exit');
        await entry.worker.terminate().catch(() => {});
      }
    }
  }

  return {
    run,
    shutdown,
    stats: () => ({ ...stats, pooledKeys: pool.size }),
  };
}

module.exports = { createEngine, DEFAULT_WORKER_PATH };
