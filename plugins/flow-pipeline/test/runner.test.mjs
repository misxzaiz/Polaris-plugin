import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { createRunner } = require('../service/runner.js');
const engine = require('../shared/engine.js');

function fakeKv() {
  const m = new Map();
  return {
    async kvGet(k) { return m.has(k) ? m.get(k) : null; },
    async kvSet(k, v) { m.set(k, v); return true; },
    async kvDel(k) { m.delete(k); return true; },
    _map: m,
  };
}

function mkRunner(kv, overrides = {}) {
  return createRunner({
    kv,
    getSettings: () => ({ providers: [{ id: 'p1', apiKey: 'sk-provider-key-9999' }] }),
    getProviders: () => [{ id: 'p1', apiKey: 'sk-provider-key-9999' }],
    appConfigDir: '',
    log: () => {},
    ...overrides,
  });
}

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function waitRun(kv, plId, runId, timeoutMs = 5000) {
  const t0 = Date.now();
  for (;;) {
    const list = (await kv.kvGet(`flowpipe.runs.${plId}`)) || [];
    const run = list.find((r) => r.id === runId);
    if (run && run.status !== 'queued' && run.status !== 'running') return run;
    if (Date.now() - t0 > timeoutMs) throw new Error(`运行 ${runId} 超时未完成：${run && run.status}`);
    await wait(30);
  }
}

function pl(name, steps, extra = {}) {
  const v = engine.validatePipeline({ name, steps, ...extra });
  assert.equal(v.ok, true, v.errors.join(';'));
  return engine.finalizePipeline(v.def);
}

test('runner: 顺序执行 + saveAs 链 + 摘要', async () => {
  const kv = fakeKv();
  const runner = mkRunner(kv);
  const pipeline = pl('链式', [
    { type: 'template', text: 'A-{{env.today}}', saveAs: 'a' },
    { type: 'template', text: 'B={{a}}!', saveAs: 'b' },
  ]);
  const runId = runner.enqueue(pipeline, 'manual', {});
  const run = await waitRun(kv, pipeline.id, runId);
  assert.equal(run.status, 'ok');
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0].status, 'ok');
  assert.match(run.steps[1].excerpt, /B=A-/);
  assert.ok(run.durationMs != null);
});

test('runner: when 门控跳过 + continueOnError 继续', async () => {
  const kv = fakeKv();
  const runner = mkRunner(kv);
  const pipeline = pl('门控', [
    { type: 'template', text: 'no', saveAs: 'flag', when: '{{params.go}} == yes' },
    { type: 'script', code: 'throw new Error("炸了")', saveAs: 'x', continueOnError: true },
    { type: 'template', text: '到底了', saveAs: 'end' },
  ]);
  const runId = runner.enqueue(pipeline, 'manual', { go: 'no' });
  const run = await waitRun(kv, pipeline.id, runId);
  assert.equal(run.status, 'ok');
  assert.equal(run.steps[0].status, 'skipped');
  assert.equal(run.steps[1].status, 'error');
  assert.equal(run.steps[2].status, 'ok');
});

test('runner: 默认失败即停，错误含步骤定位', async () => {
  const kv = fakeKv();
  const runner = mkRunner(kv);
  const pipeline = pl('即停', [
    { type: 'template', text: 'first', saveAs: 'a' },
    { type: 'script', code: 'throw new Error("boom")', saveAs: 'x' },
    { type: 'template', text: 'never', saveAs: 'z' },
  ]);
  const runId = runner.enqueue(pipeline, 'manual', {});
  const run = await waitRun(kv, pipeline.id, runId);
  assert.equal(run.status, 'error');
  assert.match(run.error, /第 2 步/);
  assert.match(run.error, /boom/);
  assert.equal(run.steps.length, 2); // 第 3 步未执行（中断于第 2 步，记录不出现）
});

test('runner: 敏感值出口掩码（vars.secrets + 供应商 key）', async () => {
  const kv = fakeKv();
  const runner = mkRunner(kv);
  const pipeline = pl('掩码', [
    { type: 'template', text: 'tok={{vars.secret1}} key={{vars.pk}}', saveAs: 'leak' },
  ], { vars: { secret1: 'super-secret-value-88', pk: 'sk-provider-key-9999' }, secrets: ['secret1'] });
  const runId = runner.enqueue(pipeline, 'manual', {});
  const run = await waitRun(kv, pipeline.id, runId);
  const raw = JSON.stringify(run);
  assert.ok(!raw.includes('super-secret-value-88'), 'vars secret 不应出现在记录中');
  assert.ok(!raw.includes('sk-provider-key-9999'), '供应商 key 不应出现在记录中');
  assert.match(run.steps[0].excerpt, /supe\*\*\*88/);
});

test('runner: 停止（在途 HTTP 中断）', async () => {
  const server = http.createServer(() => { /* 永不响应 */ });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  try {
    const kv = fakeKv();
    const runner = mkRunner(kv);
    const pipeline = pl('停止', [
      { type: 'template', text: 'x', saveAs: 'a' },
      { type: 'http', method: 'GET', url: `http://127.0.0.1:${server.address().port}/hang`, timeoutSec: 30, saveAs: 'slow', continueOnError: true },
      { type: 'template', text: 'after', saveAs: 'b' },
    ], { allowLocal: true });
    const runId = runner.enqueue(pipeline, 'manual', {});
    await wait(300); // 等第一步完成、第二步在途
    assert.equal(runner.requestStop(runId), true);
    const run = await waitRun(kv, pipeline.id, runId);
    assert.equal(run.status, 'stopped', `实际 ${run.status}: ${run.error || ''}`);
  } finally {
    server.close();
  }
});

test('runner: 历史滚动上限 30 条', async () => {
  const kv = fakeKv();
  const runner = mkRunner(kv);
  const pipeline = pl('滚动', [{ type: 'template', text: 'x', saveAs: 'a' }]);
  for (let i = 0; i < 33; i++) {
    const id = runner.enqueue(pipeline, 'manual', {});
    await waitRun(kv, pipeline.id, id);
  }
  const list = (await kv.kvGet(`flowpipe.runs.${pipeline.id}`)) || [];
  assert.equal(list.length, 30);
  // 最新在前
  assert.ok(list[0].startedAt >= list[list.length - 1].startedAt);
});

test('runner: 队列串行（并发=1）', async () => {
  const kv = fakeKv();
  const runner = mkRunner(kv);
  const pipeline = pl('串行', [{ type: 'script', code: 'return 1', saveAs: 'x' }]);
  const ids = [runner.enqueue(pipeline, 'manual', {}), runner.enqueue(pipeline, 'manual', {}), runner.enqueue(pipeline, 'manual', {})];
  const runs = [];
  for (const id of ids) runs.push(await waitRun(kv, pipeline.id, id));
  // 开始时间不早于上一条的结束时间（粗粒度串行断言）
  const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = Date.parse(sorted[i - 1].startedAt) + (sorted[i - 1].durationMs || 0);
    assert.ok(Date.parse(sorted[i].startedAt) >= prevEnd - 50, `第 ${i} 条开始早于上一条结束（未串行）`);
  }
});
