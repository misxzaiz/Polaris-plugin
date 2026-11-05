'use strict';
/**
 * worker.js —— jq 引擎工作线程（一个线程终身只服务一种 flags 组合）
 *
 * 为什么一个线程一个 flags-key（本插件的引擎级修复，勿删）：
 *   1. jq-web 的 WASM 调用是同步阻塞的，死查询（[repeat(.+1)]）会卡死所在线程——
 *      worker 隔离让主进程可超时 terminate + 重生成，永不挂死。
 *   2. jq-web 0.6.2 存在**跨调用 flags 粘连**（实验实证：前一条不带 -r 的查询会污染
 *      后一条带 -r 的查询，双向皆然），且粘连点在**进程级共享状态**（glue 的 Module
 *      隐式全局），同一进程内删除 require 缓存重建 WASM 实例也无法清除。
 *   3. 修法：engine.js 按 flags 序列化 key 池化 worker——每个 worker 出生即绑定一种
 *      flags 组合，终身只跑该组合的查询，杜绝任何跨调用状态迁移。
 *
 * 协议（parentPort 消息，全部 JSON）：
 *   出生参数：workerData.flagsKey（JSON 序列化后的 flags 数组）
 *   主 → 线程：{ id, input, query, flags }（flags 必须与 flagsKey 一致，否则报错）
 *   线程 → 主：{ ready: true } 可接收查询（WASM 懒加载挂在首条查询上）
 *              { id, ok: true, out, ms } 查询成功（out = jq raw stdout，空流归一为 ''）
 *              { id, ok: false, err, ms } 查询失败（jq stderr / 编译错误 / 引擎异常）
 *              { fatal } 引擎加载失败
 */
const { parentPort, workerData } = require('worker_threads');
const path = require('path');

const JQ_GLUE = path.join(__dirname, 'vendor', 'jqweb', 'jq.js');
// flagsKey 从引擎传来是 JSON 字符串（如 '["-r"]'）；兼容数组形态传入
const rawKey = workerData && workerData.flagsKey;
const MY_KEY = Array.isArray(rawKey) ? JSON.stringify(rawKey.map(String)) : String(rawKey || '[]');

let api = null;    // { json, raw }（jq-web 0.6.x：module.exports 为 Promise）
let chain = Promise.resolve(); // 线程内串行兜底

if (parentPort) {
  // 立即宣告就绪：引擎可先 adopt；WASM 懒加载挂在首条查询（5s 默认超时内完成）
  parentPort.postMessage({ ready: true });

  parentPort.on('message', (m) => {
    if (!m || typeof m.id === 'undefined') return;
    chain = chain.then(async () => {
      const t0 = Date.now();
      try {
        const flags = Array.isArray(m.flags) ? m.flags.map(String) : [];
        if (JSON.stringify(flags) !== MY_KEY) {
          parentPort.postMessage({ id: m.id, ok: false, err: `flags 与本 worker 绑定不符（引擎池故障）：${JSON.stringify(flags)} ≠ ${MY_KEY}` });
          return;
        }
        if (!api) api = await require(JQ_GLUE);
        const out = await api.raw(
          String(m.input == null ? '' : m.input),
          String(m.query == null ? '.' : m.query),
          flags,
        );
        // jq-web：查询产出空流时 raw() 以 JS undefined resolve——归一为空串（空流≠错误）
        parentPort.postMessage({ id: m.id, ok: true, out: out == null ? '' : String(out), ms: Date.now() - t0 });
      } catch (e) {
        // jq-web 把「非零退出 + stderr」包装成一个 Error：消息即 stderr（含编译/运行错误与 exit code）
        parentPort.postMessage({ id: m.id, ok: false, err: String(e && e.message || e), ms: Date.now() - t0 });
      }
    });
    chain = chain.catch(() => {}); // 队列自愈
  });
}
