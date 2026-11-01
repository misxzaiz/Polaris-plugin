/**
 * MCP 工具层离线测试（node test/mcp-tests.mjs）
 *
 * buildTools(kv) 注入内存 kv；stub 在「命令键被写」时模拟服务立刻写回执
 * （先删后做），覆盖：工具清单形态 / confirm 三闸 / 增删改查流程 /
 * 任务定义校验错误 / 回执超时降级文案。stdio 协议接线由真桥冒烟覆盖。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const toolsMod = require('../mcp/tools.js');
const { buildTools, sendCommand, K } = toolsMod;

const results = [];
async function t(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
}

/** 模拟服务的内存 kv：命令键写入 → 先删命令键 → 立即写回执 */
function makeStubKv(opts = {}) {
  const store = new Map();
  const kv = {
    async kvGet(key) { return store.has(key) ? store.get(key) : null; },
    async kvSet(key, value) {
      store.set(key, value);
      if (key.startsWith(K.cmdPrefix)) {
        const nonce = key.slice(K.cmdPrefix.length).split('.').pop();
        const cmd = value;
        store.delete(key); // 模拟服务「先删后做」
        const handler = opts.onCommand || (() => ({ ok: true }));
        const ret = handler(cmd, nonce);
        if (ret) store.set(K.resultPrefix + nonce, { at: Date.now(), ...ret });
      }
      return true;
    },
    async kvDel(key) { store.delete(key); return true; },
    async kvKeys() { return [...store.keys()]; },
  };
  return { kv, store };
}

const pick = (name, kv) => buildTools(kv).find((x) => x.name === name);

// ── 工具清单形态 ─────────────────────────────────────────────────────────────
await t('工具清单：六个工具 + 中文 description + confirm 入参', async () => {
  const tools = buildTools(null);
  assert.strictEqual(tools.length, 6);
  assert.deepStrictEqual(tools.map((x) => x.name), ['task_list', 'task_add', 'task_run', 'task_history', 'task_set', 'task_remove']);
  for (const x of tools) {
    assert.ok(/[\u4e00-\u9fa5]/.test(x.description), `${x.name} description 须中文`);
    assert.strictEqual(x.inputSchema.type, 'object');
  }
  assert.ok(pick('task_add', null).inputSchema.properties.confirm);
  assert.deepStrictEqual(pick('task_run', null).inputSchema.required, ['id', 'confirm']);
  assert.deepStrictEqual(pick('task_remove', null).inputSchema.required, ['id', 'confirm']);
});

// ── confirm 三闸 ────────────────────────────────────────────────────────────
await t('task_add: command 无 confirm → isError 拒绝', async () => {
  const { kv } = makeStubKv();
  const add = pick('task_add', kv);
  const r = await add.call({ name: '清理', type: 'command', schedule: { type: 'daily', time: '23:00' }, payload: { shell: 'powershell', command: 'Remove-Item x' } });
  assert.strictEqual(r.isError, true);
  assert.ok(/confirm/.test(r.content[0].text));
});
await t('task_run / task_remove: 无 confirm → isError 拒绝', async () => {
  const { kv } = makeStubKv();
  assert.strictEqual((await pick('task_run', kv).call({ id: 'job_x' })).isError, true);
  assert.strictEqual((await pick('task_remove', kv).call({ id: 'job_x' })).isError, true);
});
await t('task_add: command 带 confirm=true → 放行', async () => {
  const seen = [];
  const { kv } = makeStubKv({ onCommand(cmd) { seen.push(cmd); return { ok: true, jobId: 'job_cmd' }; } });
  const r = await pick('task_add', kv).call({
    name: '夜扫', type: 'command', confirm: true,
    schedule: { type: 'cron', expr: '0 23 * * *' },
    payload: { shell: 'cmd', command: 'echo done' },
  });
  assert.strictEqual(r.isError, false);
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].job.payload.command, 'echo done');
});

// ── 正常流程 ────────────────────────────────────────────────────────────────
await t('task_add: notify 创建 → 命令键带 op=add，回执含 jobId，命令键已消费', async () => {
  const seen = [];
  const { kv, store } = makeStubKv({ onCommand(cmd) { seen.push(cmd); return { ok: true, jobId: 'job_abc', nextRunAt: Date.now() + 60000 }; } });
  const r = await pick('task_add', kv).call({ name: '早会提醒', type: 'notify', schedule: { type: 'daily', time: '08:00' }, payload: { message: '站会' } });
  assert.strictEqual(r.isError, false);
  assert.ok(/job_abc/.test(r.content[0].text));
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].op, 'add');
  assert.strictEqual(seen[0].job.name, '早会提醒');
  assert.strictEqual([...store.keys()].filter((k) => k.startsWith(K.cmdPrefix)).length, 0);
});
await t('task_add: 非法定义 → 业务校验错误且不写命令键', async () => {
  let written = 0;
  const { kv } = makeStubKv({ onCommand() { written += 1; return { ok: true }; } });
  const r = await pick('task_add', kv).call({ name: 'x', type: 'http', schedule: { type: 'interval', everyMinutes: 0 }, payload: { url: 'https://x' } });
  assert.strictEqual(r.isError, true);
  assert.ok(/间隔/.test(r.content[0].text));
  assert.strictEqual(written, 0);
});
await t('task_list: 空态 / 有任务含 id、调度、上次结果', async () => {
  const { kv } = makeStubKv();
  assert.ok(/暂无定时任务/.test((await pick('task_list', kv).call({})).content[0].text));

  const store = new Map();
  store.set(K.jobs, {
    jobs: [{
      id: 'job_1', name: '接口心跳', type: 'http', enabled: true,
      schedule: { type: 'interval', everyMs: 600000 },
      payload: { url: 'https://example.com', method: 'GET' },
      nextRunAt: Date.now() + 60000, lastRunAt: Date.now() - 60000,
      lastStatus: 'ok', lastSummary: 'HTTP 200 · 88ms',
      createdAt: Date.now(), updatedAt: Date.now(),
    }],
  });
  const kv2 = { kvGet: async (k) => (store.has(k) ? store.get(k) : null), kvSet: async () => true, kvDel: async () => true, kvKeys: async () => [...store.keys()] };
  const text = (await pick('task_list', kv2).call({})).content[0].text;
  assert.ok(/job_1/.test(text));
  assert.ok(/每 10 分钟/.test(text));
  assert.ok(/HTTP 200/.test(text));

  const store2 = new Map();
  store2.set(K.jobs, {
    jobs: [{
      id: 'job_2', name: '夜扫', type: 'command', enabled: true,
      schedule: { type: 'cron', expr: '0 23 * * *' }, payload: { shell: 'cmd', command: 'echo 1' },
      nextRunAt: Date.now() + 60000, lastRunAt: null, lastStatus: null, lastSummary: '',
      createdAt: Date.now(), updatedAt: Date.now(),
    }],
  });
  const kv3 = { kvGet: async (k) => (store2.has(k) ? store2.get(k) : null), kvSet: async () => true, kvDel: async () => true, kvKeys: async () => [...store2.keys()] };
  assert.ok(/\[命令\]/.test((await pick('task_list', kv3).call({})).content[0].text));
});
await t('task_history: 分块倒序 + 补跑/手动标记 + jobId 过滤', async () => {
  const store = new Map();
  store.set(K.runChunk(0), [
    { id: 'r1', jobId: 'j1', jobName: 'A', type: 'notify', trigger: 'auto', missed: false, status: 'ok', summary: 's1', excerpt: '', startedAt: 1000, durationMs: 1 },
    { id: 'r2', jobId: 'j1', jobName: 'A', type: 'notify', trigger: 'auto', missed: true, status: 'fail', summary: 's2', excerpt: '', startedAt: 2000, durationMs: 2 },
  ]);
  store.set(K.runChunk(1), [
    { id: 'r3', jobId: 'j2', jobName: 'B', type: 'command', trigger: 'manual', missed: false, status: 'ok', summary: '退出码 0', excerpt: 'done', startedAt: 3000, durationMs: 5 },
  ]);
  store.set(K.runsIdx, { chunkCount: 2, total: 3 });
  const kv = { kvGet: async (k) => (store.has(k) ? store.get(k) : null), kvSet: async () => true, kvDel: async () => true, kvKeys: async () => [...store.keys()] };
  const text = (await pick('task_history', kv).call({ limit: 10 })).content[0].text;
  assert.ok(text.indexOf('B（command）') < text.indexOf('s2'), '新块应排在旧块前');
  assert.ok(/\[补跑\]/.test(text));
  assert.ok(/\[手动\]/.test(text));
  const filtered = (await pick('task_history', kv).call({ jobId: 'j1', limit: 10 })).content[0].text;
  assert.ok(/A（notify）/.test(filtered));
  assert.ok(!/B（command）/.test(filtered));
});
await t('task_set: enabled=false 走命令键', async () => {
  const seen = [];
  const { kv } = makeStubKv({ onCommand(cmd) { seen.push(cmd); return { ok: true, enabled: false }; } });
  const r = await pick('task_set', kv).call({ id: 'job_1', enabled: false });
  assert.strictEqual(r.isError, false);
  assert.ok(/已停用/.test(r.content[0].text));
  assert.strictEqual(seen[0].op, 'setEnabled');
});
await t('task_remove: confirm 后走命令键并回执 jobId', async () => {
  const seen = [];
  const { kv } = makeStubKv({ onCommand(cmd) { seen.push(cmd); return { ok: true, jobId: cmd.id }; } });
  const r = await pick('task_remove', kv).call({ id: 'job_9', confirm: true });
  assert.strictEqual(r.isError, false);
  assert.strictEqual(seen[0].op, 'remove');
  assert.ok(/job_9/.test(r.content[0].text));
});
await t('sendCommand: 服务未回执 → 降级文案（waitMs 注入缩短）', async () => {
  const { kv } = makeStubKv({ onCommand() { return null; } });
  const t0 = Date.now();
  const r = await sendCommand(kv, 'add', { job: {} }, { waitMs: 1200 });
  assert.strictEqual(r.ok, false);
  assert.ok(/未回执|历史/.test(r.error));
  assert.ok(Date.now() - t0 >= 1100);
});
await t('sendCommand: queued=true 时等待最终结果', async () => {
  const store = new Map();
  let phase = 0;
  let latestResultKey = '';
  const kv = {
    async kvGet(k) {
      if (k === latestResultKey && phase >= 1) return { at: Date.now(), ok: true, runId: 'run_1', status: 'ok', summary: 'done' };
      return store.has(k) ? store.get(k) : null;
    },
    async kvSet(k, v) {
      store.set(k, v);
      if (k.startsWith(K.cmdPrefix)) {
        const nonce = k.slice(K.cmdPrefix.length).split('.').pop();
        latestResultKey = K.resultPrefix + nonce;
        store.set(latestResultKey, { at: Date.now(), ok: true, queued: true });
        setTimeout(() => { phase = 1; }, 1100);
      }
      return true;
    },
    async kvDel(k) { store.delete(k); return true; },
    async kvKeys() { return [...store.keys()]; },
  };
  const r = await sendCommand(kv, 'runNow', { id: 'job_1' }, { waitMs: 8000 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.runId, 'run_1');
});

const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
