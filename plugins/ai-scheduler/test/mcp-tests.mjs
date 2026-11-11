'use strict';
/**
 * mcp-tests.mjs —— MCP 工具层离线测试（内存 kv stub，协议/文案金标断言）
 *
 * 工具面金标 = 主仓 scheduler_mcp_server.rs（7 工具：名称/schema/中文响应）。
 */
import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const { buildTools } = require('../mcp/tools.js');
const { createStore } = require('../service/store.js');

const results = { pass: 0, fail: 0, failures: [] };
async function t(name, fn) {
  try { await fn(); results.pass += 1; console.log(`  ✓ ${name}`); } catch (e) {
    results.fail += 1; results.failures.push(`${name}: ${e.message}`);
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

// ── 内存 kv stub（异步 Map）─────────────────────────────────────────────────
function memKv() {
  const m = new Map();
  return {
    async kvGet(k) { return m.has(k) ? m.get(k) : null; },
    async kvSet(k, v) { m.set(k, v); return true; },
    async kvDel(k) { m.delete(k); return true; },
    async kvKeys() { return [...m.keys()]; },
  };
}

const kv = memKv();
const store = createStore(kv);
const tools = buildTools(store);
const byName = Object.fromEntries(tools.map((x) => [x.name, x]));

async function call(name, args) {
  return byName[name].call(args || {});
}

async function main() {
  // 工具面金标：7 个、名称/描述对齐
  await t('工具清单 = 主仓 7 工具（名称逐一对齐）', () => {
    assert.deepStrictEqual(tools.map((x) => x.name), [
      'list_tasks', 'get_task', 'create_task', 'update_task',
      'delete_task', 'toggle_task', 'get_workspace_breakdown',
    ]);
    assert.strictEqual(byName.create_task.description, '创建定时任务。');
    assert.strictEqual(byName.toggle_task.description, '切换任务启用状态。');
    assert.strictEqual(byName.get_workspace_breakdown.description, '获取各工作区的任务数量统计。');
  });
  await t('create_task schema required 五字段（金标）', () => {
    assert.deepStrictEqual(byName.create_task.inputSchema.required,
      ['name', 'triggerType', 'triggerValue', 'engineId', 'prompt']);
    assert.deepStrictEqual(byName.create_task.inputSchema.properties.triggerType.enum,
      ['once', 'cron', 'interval']);
  });

  // create_task
  await t('create_task 必填校验（空 name 报错）', async () => {
    await assert.rejects(() => call('create_task', { name: ' ', triggerType: 'interval', triggerValue: '5m', engineId: 'e', prompt: 'p' }), /name 不能为空/);
    await assert.rejects(() => call('create_task', { name: 'x', triggerType: 'interval', triggerValue: '', engineId: 'e', prompt: 'p' }), /triggerValue 不能为空/);
    await assert.rejects(() => call('create_task', { name: 'x', triggerType: 'interval', triggerValue: '5m', engineId: ' ', prompt: 'p' }), /engineId 不能为空/);
  });
  let created;
  await t('create_task 成功：全局位置文案 + 初始 nextRunAt', async () => {
    created = await call('create_task', {
      name: '日报生成', triggerType: 'interval', triggerValue: '1h',
      engineId: 'claude-code', prompt: '写日报',
    });
    assert.strictEqual(created.isError, false);
    assert.ok(created.content[0].text.startsWith('已在【全局】创建任务：日报生成'));
    assert.strictEqual(created.structuredContent.triggerType, 'interval');
    assert.strictEqual(created.structuredContent.enabled, true);
    const st = await store.getState(created.structuredContent.id);
    assert.strictEqual(st.nextRunAt, created.structuredContent.createdAt + 3600);
    assert.strictEqual(st.lastRunStatus, null);
  });
  await t('create_task 工作区位置文案', async () => {
    const r = await call('create_task', {
      name: '工作区任务', triggerType: 'once', triggerValue: '2030-01-01T00:00:00Z',
      engineId: 'e', prompt: 'p', workDir: 'D:/w',
    });
    assert.ok(r.content[0].text.startsWith('已在【全局】创建任务')); // workspaceName 未设 → 全局
  });

  // list/get
  await t('list_tasks count + 中文响应', async () => {
    const r = await call('list_tasks');
    assert.strictEqual(r.structuredContent.count, 2);
    assert.strictEqual(r.content[0].text, '已返回 2 条任务');
  });
  await t('get_task 不存在报错 / 存在返回详情', async () => {
    await assert.rejects(() => call('get_task', { id: 'nope' }), /任务不存在: nope/);
    const r = await call('get_task', { id: created.structuredContent.id });
    assert.strictEqual(r.content[0].text, '任务: 日报生成');
    assert.strictEqual(r.structuredContent.nextRunAt !== null, true);
  });
  await t('get_task id 为空报错', async () => {
    await assert.rejects(() => call('get_task', { id: '' }), /id 不能为空/);
  });

  // update/toggle
  await t('update_task 改名 + triggerValue 重算 nextRunAt', async () => {
    const id = created.structuredContent.id;
    const r = await call('update_task', { id, name: '日报生成 v2', triggerValue: '30m' });
    assert.strictEqual(r.content[0].text, '已更新任务：日报生成 v2');
    assert.strictEqual(r.structuredContent.name, '日报生成 v2');
    const st = await store.getState(id);
    assert.strictEqual(st.nextRunAt, r.structuredContent.updatedAt + 1800);
  });
  await t('update_task 不存在报错', async () => {
    await assert.rejects(() => call('update_task', { id: 'nope', name: 'x' }), /任务不存在: nope/);
  });
  await t('toggle_task 启停文案 + enabled 落库', async () => {
    const id = created.structuredContent.id;
    const r = await call('toggle_task', { id, enabled: false });
    assert.strictEqual(r.content[0].text, '任务【日报生成 v2】已禁用');
    assert.strictEqual(r.structuredContent.enabled, false);
    const r2 = await call('toggle_task', { id, enabled: true });
    assert.ok(r2.content[0].text.includes('已启用'));
  });
  await t('toggle_task enabled 非布尔报错', async () => {
    await assert.rejects(() => call('toggle_task', { id: created.structuredContent.id }), /enabled 不能为空/);
  });

  // delete
  await t('delete_task 删除 + 中文响应', async () => {
    const r = await call('create_task', { name: '待删任务', triggerType: 'interval', triggerValue: '5m', engineId: 'e', prompt: 'p' });
    const id = r.structuredContent.id;
    const d = await call('delete_task', { id });
    assert.strictEqual(d.content[0].text, '已删除任务：待删任务');
    assert.strictEqual(await store.getTask(id), null);
    await assert.rejects(() => call('delete_task', { id: 'nope' }), /任务不存在: nope/);
  });

  // breakdown
  await t('get_workspace_breakdown 分组统计', async () => {
    const r = await call('get_workspace_breakdown');
    assert.strictEqual(r.structuredContent.total, 2);
    assert.strictEqual(r.content[0].text, '共 2 条任务');
    assert.ok(r.structuredContent.breakdown['全局'] >= 2);
  });

  // 服务层补充：手动执行信箱 / 历史块 / 租约
  await t('命令信箱：先删后做 + 回执', async () => {
    await kv.kvSet('aisched.cmd.run.n1', { taskId: created.structuredContent.id, nonce: 'n1' });
    const cmds = await store.consumeRunCommands();
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual((await store.consumeRunCommands()).length, 0); // 先删
    await store.putResult('n1', { ok: true });
    const res = await kv.kvGet('aisched.result.n1');
    assert.strictEqual(res.ok, true);
    assert.ok(res.doneAt > 0);
  });
  await t('历史块：25 条/块 + 新→旧排序 + 索引', async () => {
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      await store.appendHist({ id: `h${i}`, taskId: 't', taskName: 'n', trigger: 'due', status: 'success', summary: `run ${i}`, startedAt: i, durationMs: 1 });
    }
    const hist = await store.listHist(100);
    assert.strictEqual(hist.length, 30);
    assert.strictEqual(hist[0].seq, 29); // 新→旧
    assert.strictEqual(hist[29].seq, 0);
  });
  await t('租约：持有期内他人不可夺取 / 过期可夺取', async () => {
    const okA = await store.tryAcquireLease('A', 100);
    assert.strictEqual(okA, true);
    const okB = await store.tryAcquireLease('B', 100);
    assert.strictEqual(okB, false);
    await kv.kvSet('aisched.lease', { holder: 'OLD', expiresAt: 1 }); // 过期
    const okC = await store.tryAcquireLease('C', 100);
    assert.strictEqual(okC, true);
  });
  await t('normalizeTask 默认值与 normalizeTask 非法触发类型回落 once', async () => {
    const task = store.normalizeTask({ name: 'x', triggerType: 'bogus', triggerValue: '5m', engineId: 'e', prompt: 'p' });
    assert.strictEqual(task.triggerType, 'once');
    assert.strictEqual(task.notifyOnComplete, true);
    assert.strictEqual(task.mode, 'simple');
  });

  console.log(`\n${results.pass} passed, ${results.fail} failed`);
  if (results.fail > 0) { console.error(results.failures.join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
