import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const engine = require('../shared/engine.js');

// ── validatePipeline ─────────────────────────────────────────────────────────
test('validatePipeline: 最小合法定义', () => {
  const r = engine.validatePipeline({
    name: '每日摘要',
    steps: [{ type: 'template', text: 'hello {{env.today}}', saveAs: 'out' }],
  });
  assert.equal(r.ok, true, r.errors.join(';'));
  assert.equal(r.def.trigger.type, 'manual');
  assert.equal(r.def.enabled, true);
  assert.equal(r.def.steps[0].name, 'template 步骤');
});

test('validatePipeline: 逐字段点名', () => {
  const r = engine.validatePipeline({ name: '', steps: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('name 必填')));
  assert.ok(r.errors.some((e) => e.includes('steps 必填：至少 1 个步骤')));
  const r2 = engine.validatePipeline({ name: 'x', steps: [{ type: 'wat' }] });
  assert.ok(r2.errors.some((e) => e.includes('type 不合法')));
  const r3 = engine.validatePipeline({ name: 'x', steps: [{ type: 'http', url: 'ftp://x' }] });
  assert.ok(r3.errors.some((e) => e.includes('http:// 或 https://')));
});

test('validatePipeline: interval 下限 5 分钟 + daily 格式', () => {
  const bad = engine.validatePipeline({ name: 'x', trigger: { type: 'interval', everyMinutes: 1 }, steps: [{ type: 'template', text: 'a', saveAs: 'o' }] });
  assert.ok(bad.errors.some((e) => e.includes('≥5')));
  const bad2 = engine.validatePipeline({ name: 'x', trigger: { type: 'daily', at: '25:00' }, steps: [{ type: 'template', text: 'a', saveAs: 'o' }] });
  assert.ok(bad2.errors.some((e) => e.includes('HH:MM')));
  const good = engine.validatePipeline({ name: 'x', trigger: { type: 'daily', at: '08:30' }, steps: [{ type: 'template', text: 'a', saveAs: 'o' }] });
  assert.equal(good.ok, true);
});

test('validatePipeline: saveAs 标识符/根作用域/重复', () => {
  const mk = (saveAs) => engine.validatePipeline({ name: 'x', steps: [{ type: 'template', text: 'a', saveAs }] });
  assert.ok(mk('params').errors.some((e) => e.includes('根作用域重名')));
  assert.ok(mk('a b').errors.some((e) => e.includes('不合法')));
  const dup = engine.validatePipeline({ name: 'x', steps: [
    { type: 'template', text: 'a', saveAs: 'o' },
    { type: 'template', text: 'b', saveAs: 'o' },
  ] });
  assert.ok(dup.errors.some((e) => e.includes('重复')));
});

test('validatePipeline: mcp/ai/extract/kv/file/notify 各自必填', () => {
  const r = engine.validatePipeline({ name: 'x', steps: [
    { type: 'mcp', serverId: '' },
    { type: 'ai', prompt: 'hi' },
    { type: 'extract', from: 'resp', paths: {} },
    { type: 'kv', action: 'set', key: 'k' },
    { type: 'file', action: 'write', path: '/x', content: 'c' },
    { type: 'notify', url: 'notaurl' },
    { type: 'script', code: 'return 1' },
  ] });
  assert.equal(r.ok, false);
  const joined = r.errors.join('|');
  assert.ok(joined.includes('serverId'));
  assert.ok(joined.includes('providerId'));
  assert.ok(joined.includes('paths'));
  assert.ok(joined.includes('kv set 必填 value'));
  assert.ok(joined.includes('file 步骤必填 path') === false); // 有 path 应不报 path 错
  assert.ok(joined.includes('notify url 必须以 http'));
  // script 有 code 无 saveAs → saveAs 报错
  assert.ok(joined.includes('script 步骤必填 saveAs'));
});

test('validatePipeline: arguments JSON 字符串合法性', () => {
  const bad = engine.validatePipeline({ name: 'x', steps: [{ type: 'mcp', serverId: 's', tool: 't', arguments: '{bad' }] });
  assert.ok(bad.errors.some((e) => e.includes('arguments 的 JSON')));
  const good = engine.validatePipeline({ name: 'x', steps: [{ type: 'mcp', serverId: 's', tool: 't', arguments: { a: 1 } }] });
  assert.equal(good.ok, true, good.errors.join(';'));
});

// ── resolveTemplate / resolveDeep ────────────────────────────────────────────
const ctx = {
  vars: { host: 'http://example.test', token: 'abc123' },
  steps: {
    resp: { status: 200, json: { code: 0, items: [{ id: 'a' }, { id: 'b' }], note: 'n' } },
  },
  params: { body: { title: 'T' }, query: { q: 'x' } },
  env: { today: '2026-11-03', now: '2026-11-03T10:00:00Z' },
};

test('resolveTemplate: 整串占位保持类型', () => {
  const r = engine.resolveTemplate('{{resp.json}}', ctx);
  assert.deepEqual(r.value, ctx.steps.resp.json);
  assert.equal(r.warnings.length, 0);
});

test('resolveTemplate: 部分嵌入字符串化 + 根作用域回落 vars', () => {
  const r = engine.resolveTemplate('host={{host}} code={{resp.json.code}}', ctx);
  assert.equal(r.value, 'host=http://example.test code=0');
});

test('resolveTemplate: 未命中补 warning 换空串', () => {
  const r = engine.resolveTemplate('{{resp.json.missing}}!', ctx);
  assert.equal(r.value, '!');
  assert.equal(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('missing'));
});

test('resolveDeep: 嵌套对象逐字段插值', () => {
  const r = engine.resolveDeep({ url: '{{host}}/api', opts: { q: '{{params.query.q}}' }, n: 5 }, ctx);
  assert.deepEqual(r.value, { url: 'http://example.test/api', opts: { q: 'x' }, n: 5 });
});

// ── getPath ──────────────────────────────────────────────────────────────────
test('getPath: 点路径/下标/负下标', () => {
  assert.equal(engine.getPath(ctx, 'steps.resp.json.code').value, 0);
  assert.equal(engine.getPath(ctx, 'steps.resp.json.items.1.id').value, 'b');
  assert.equal(engine.getPath(ctx, 'steps.resp.json.items[-1].id').value, 'b');
  assert.equal(engine.getPath(ctx, 'steps.resp.status').found, true);
  assert.equal(engine.getPath(ctx, 'steps.resp.status.x').found, false);
});

test('getPath: 通配聚合数组', () => {
  assert.deepEqual(engine.getPath(ctx, 'steps.resp.json.items[*].id').value, ['a', 'b']);
  const all = engine.getPath(ctx, 'steps.resp.json.items[*]');
  assert.deepEqual(all.value, ctx.steps.resp.json.items);
});

test('getPath: [?k=v] 过滤（过滤段恒聚合数组）', () => {
  const data = { users: [{ name: 'a', age: 1 }, { name: 'b', age: 2 }] };
  assert.deepEqual(engine.getPath(data, 'users[?name=b].age').value, [2]);
  assert.deepEqual(engine.getPath(data, 'users[?name=b]').value, [data.users[1]]);
  assert.deepEqual(engine.getPath(data, 'users[?age=1].name').value, ['a']);
});

// ── evaluateExpr ─────────────────────────────────────────────────────────────
test('evaluateExpr: 比较与逻辑', () => {
  assert.equal(engine.evaluateExpr('{{resp.json.code}} == 0', ctx), true);
  assert.equal(engine.evaluateExpr('{{resp.json.code}} != 0', ctx), false);
  assert.equal(engine.evaluateExpr('{{resp.status}} == 200 && {{resp.json.code}} == 0', ctx), true);
  assert.equal(engine.evaluateExpr('{{resp.json.note}} contains n', ctx), true);
  assert.equal(engine.evaluateExpr('{{resp.json.note}} !contains x', ctx), true);
  assert.equal(engine.evaluateExpr('{{resp.status}} >= 200', ctx), true);
  assert.equal(engine.evaluateExpr('{{host}} startswith http', ctx), true);
  assert.equal(engine.evaluateExpr(`{{host}} endswith '.test'`, ctx), true);
});

test('evaluateExpr: exists / ! / 括号 / 缺失路径', () => {
  assert.equal(engine.evaluateExpr('exists {{resp.json.code}}', ctx), true);
  assert.equal(engine.evaluateExpr('exists {{resp.json.nope}}', ctx), false);
  assert.equal(engine.evaluateExpr('!exists {{resp.json.nope}}', ctx), true);
  assert.equal(engine.evaluateExpr('({{resp.status}} == 200 || {{resp.status}} == 404) && exists {{vars.token}}', ctx), true);
  // 缺失路径与 null 比较
  assert.equal(engine.evaluateExpr('{{resp.json.nope}} == null', ctx), true);
});

test('evaluateExpr: 语法错误抛出可读信息', () => {
  assert.throws(() => engine.evaluateExpr('{{a}} == ', ctx), /语法错误/);
  assert.throws(() => engine.evaluateExpr('(a == 1', ctx), /括号未闭合/);
});

test('evaluateExpr: 数字比较 vs 字符串比较', () => {
  assert.equal(engine.evaluateExpr('{{params.n}} > 5', { ...ctx, params: { n: '10' } }), true);
  assert.equal(engine.evaluateExpr('{{params.s}} > 5', { ...ctx, params: { s: 'abc' } }), true); // 字符串字典序 'abc' > '5'
});

// ── 掩码 ─────────────────────────────────────────────────────────────────────
test('maskString / maskDeep', () => {
  const masked = engine.maskString('key=sk-abcdef123456 and sk-abcdef123456 again', ['sk-abcdef123456']);
  assert.ok(!masked.includes('sk-abcdef123456'));
  assert.ok(masked.includes('sk-a***56'));
  const deep = engine.maskDeep({ a: 'sk-abcdef123456', list: ['sk-abcdef123456'], n: 1 }, ['sk-abcdef123456']);
  assert.deepEqual(deep, { a: 'sk-a***56', list: ['sk-a***56'], n: 1 });
});

// ── finalizePipeline ─────────────────────────────────────────────────────────
test('finalizePipeline: 补 id 与 webhook token', () => {
  const v = engine.validatePipeline({
    name: 'wh',
    trigger: { type: 'webhook' },
    steps: [{ type: 'template', text: 'x', saveAs: 'o' }],
  });
  const def = engine.finalizePipeline(v.def);
  assert.ok(def.id.startsWith('pl_'));
  assert.ok(def.trigger.token.length >= 16);
});
