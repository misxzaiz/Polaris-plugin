'use strict';
/**
 * store.js —— taskrun.* 键空间操作（服务进程 = jobs/runs 唯一写者）
 *
 * 纪律（插件工坊 single-writer / keyspace 主题）：
 *  - 所有 get 包 .catch(() => null)，读到已删键容忍 null
 *  - 历史分块追加/轮换只在本进程（租约持有者）发生
 *  - 命令回执写 result.<nonce>，消费方轮询
 */
const core = require('../shared/exec-core');
const engine = require('../shared/engine');

const K = {
  settings: 'taskrun.settings',
  providers: 'taskrun.providers',
  jobs: 'taskrun.jobs',
  meta: 'taskrun.meta',
  lease: 'taskrun.lease',
  runsIdx: 'taskrun.runsIdx',
  cmdPrefix: 'taskrun.cmd.',
  resultPrefix: 'taskrun.result.',
  runChunk: (n) => `taskrun.run.${n}`,
};

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function createStore(kv) {
  // ── 基础键 ────────────────────────────────────────────────────────────────
  const getSettings = async () => core.normalizeSettings(await kv.kvGet(K.settings).catch(() => null));

  const getProviders = async () => {
    const v = await kv.kvGet(K.providers).catch(() => null);
    return Array.isArray(v) ? v.filter((p) => p && typeof p === 'object') : [];
  };

  const getJobsRaw = async () => {
    const v = await kv.kvGet(K.jobs).catch(() => null);
    if (!v || typeof v !== 'object' || !Array.isArray(v.jobs)) return { jobs: [] };
    return v;
  };

  /** 保存任务表（仅本进程调用）。任务数护栏 MAX_JOBS。 */
  const saveJobs = async (jobs) => {
    await kv.kvSet(K.jobs, { jobs: jobs.slice(0, core.MAX_JOBS) });
  };

  // ── 历史分块 ──────────────────────────────────────────────────────────────
  const readRunsIdx = async () => {
    const v = await kv.kvGet(K.runsIdx).catch(() => null);
    if (v && typeof v === 'object' && Number.isFinite(v.chunkCount)) return v;
    return { chunkCount: 0, total: 0 };
  };

  const readChunk = async (n) => {
    const v = await kv.kvGet(K.runChunk(n)).catch(() => null);
    return Array.isArray(v) ? v : [];
  };

  /** 追加一条运行记录（含轮换）。返回最终 idx。 */
  const appendRun = async (run, retentionRuns) => {
    const rec = core.makeRun(run);
    const idx = await readRunsIdx();
    const newestIndex = idx.chunkCount > 0 ? idx.chunkCount - 1 : 0;
    const newest = idx.chunkCount > 0 ? await readChunk(newestIndex) : [];
    const plan = core.planRunAppend(newest, rec, retentionRuns);
    await kv.kvSet(K.runChunk(newestIndex), plan.lastChunk);
    let chunkCount = Math.max(idx.chunkCount, 1);
    if (plan.overflow) {
      await kv.kvSet(K.runChunk(chunkCount), plan.overflow);
      chunkCount += 1;
    }
    const nextIdx = { chunkCount, total: (idx.total || 0) + 1, updatedAt: Date.now() };
    await kv.kvSet(K.runsIdx, nextIdx);
    // 轮换：超出保留块数的旧块删除
    const keep = core.retentionChunks(retentionRuns);
    if (chunkCount > keep) {
      const drop = chunkCount - keep;
      for (let i = 0; i < drop; i++) {
        await kv.kvDel(K.runChunk(i)).catch(() => {});
      }
      // 重排剩余块编号（0..keep-1），避免编号洞导致读序错乱
      for (let i = 0; i < keep; i++) {
        const from = drop + i;
        if (from === i) continue;
        const data = await readChunk(from);
        await kv.kvSet(K.runChunk(i), data);
        await kv.kvDel(K.runChunk(from)).catch(() => {});
      }
      nextIdx.chunkCount = keep;
      await kv.kvSet(K.runsIdx, nextIdx);
    }
    return { idx: nextIdx, run: rec };
  };

  /** 从新到旧读运行记录（可按 jobId 过滤），limit 上限 200 */
  const readRuns = async ({ limit = 50, jobId = '' } = {}) => {
    const idx = await readRunsIdx();
    const out = [];
    const cap = Math.min(Math.max(1, limit), 200);
    for (let n = idx.chunkCount - 1; n >= 0 && out.length < cap; n--) {
      const chunk = await readChunk(n);
      for (let i = chunk.length - 1; i >= 0 && out.length < cap; i--) {
        const r = chunk[i];
        if (!r || typeof r !== 'object') continue;
        if (jobId && r.jobId !== jobId) continue;
        out.push(r);
      }
    }
    return out;
  };

  // ── 命令回执 ──────────────────────────────────────────────────────────────
  const writeResult = async (nonce, value) => {
    if (!nonce) return;
    await kv.kvSet(K.resultPrefix + String(nonce), { at: Date.now(), ...value }).catch(() => {});
  };

  const delResult = async (nonce) => {
    if (!nonce) return;
    await kv.kvDel(K.resultPrefix + String(nonce)).catch(() => {});
  };

  // ── 租约（多实例防双跑；无 CAS，靠「写入后延时复核」收窄竞态窗口）─────────
  const LEASE_TTL = 90 * 1000;
  const holder = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  const tryAcquireLease = async () => {
    const now = Date.now();
    const cur = await kv.kvGet(K.lease).catch(() => null);
    if (cur && typeof cur === 'object' && cur.holder !== holder && Number.isFinite(cur.expiresAt) && cur.expiresAt > now) {
      return false;
    }
    await kv.kvSet(K.lease, { holder, expiresAt: now + LEASE_TTL }).catch(() => false);
    // 复核：若期间被别人覆盖，让位（无 CAS 下的收敛手段）
    await new Promise((r) => setTimeout(r, 1200));
    const again = await kv.kvGet(K.lease).catch(() => null);
    return !!(again && again.holder === holder);
  };

  const renewLease = async () => {
    await kv.kvSet(K.lease, { holder, expiresAt: Date.now() + LEASE_TTL }).catch(() => {});
  };

  return {
    K,
    holder,
    genId,
    getSettings,
    getProviders,
    getJobsRaw,
    saveJobs,
    readRunsIdx,
    readChunk,
    appendRun,
    readRuns,
    writeResult,
    delResult,
    tryAcquireLease,
    renewLease,
  };
}

/** 面板/MCP 侧调度辅助：给 job 计算 nextRunAt（不落盘，展示用） */
function withPreviewNext(job, fromMs) {
  return { ...job, nextRunAt: engine.nextRunAt(job.schedule, fromMs) };
}

module.exports = { createStore, K, genId, withPreviewNext };
