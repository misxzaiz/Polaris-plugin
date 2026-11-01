/**
 * run-tests.mjs —— mcp-probe 离线单测（probe-core 纯函数，零依赖）
 * 运行：node test/run-tests.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/probe-core.js');

let pass = 0;
let fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (e) {
    fail += 1;
    failures.push(`${name}: ${e.message}`);
    console.error(`✗ ${name}\n  ${e.message}`);
  }
}

/* ---------------- newId / stableStringify ---------------- */

t('newId: 前缀+唯一性', () => {
  const a = core.newId('srv');
  const b = core.newId('srv');
  assert.ok(a.startsWith('srv-'));
  assert.notEqual(a, b);
});

t('stableStringify: 键序无关', () => {
  assert.equal(core.stableStringify({ a: 1, b: 2 }), core.stableStringify({ b: 2, a: 1 }));
});

t('stableStringify: 嵌套与数组', () => {
  const x = { list: [{ y: 1, z: 2 }], m: { k: 'v' } };
  assert.equal(core.stableStringify(x), core.stableStringify({ m: { k: 'v' }, list: [{ z: 2, y: 1 }] }));
});

t('stableStringify: 基础类型', () => {
  assert.equal(core.stableStringify(null), 'null');
  assert.equal(core.stableStringify(5), '5');
  assert.equal(core.stableStringify('x'), '"x"');
  assert.equal(core.stableStringify(undefined), undefined);
});

/* ---------------- deriveFormModel ---------------- */

t('deriveFormModel: 平铺 object → fields 模式', () => {
  const m = core.deriveFormModel({
    type: 'object',
    properties: {
      text: { type: 'string', description: '文本' },
      count: { type: 'integer', default: 3 },
      flag: { type: 'boolean' },
      mode: { type: 'string', enum: ['fast', 'slow'] },
    },
    required: ['text'],
  });
  assert.equal(m.mode, 'fields');
  assert.equal(m.fields.length, 4);
  const text = m.fields.find((f) => f.name === 'text');
  assert.equal(text.required, true);
  assert.equal(text.type, 'string');
  const mode = m.fields.find((f) => f.name === 'mode');
  assert.equal(mode.type, 'enum');
  assert.deepEqual(mode.enum, ['fast', 'slow']);
  const count = m.fields.find((f) => f.name === 'count');
  assert.equal(count.default, 3);
  assert.equal(count.type, 'integer');
});

t('deriveFormModel: 嵌套 object 回退 json 模式', () => {
  const m = core.deriveFormModel({
    type: 'object',
    properties: { nested: { type: 'object', properties: { x: { type: 'string' } } } },
  });
  assert.equal(m.mode, 'fields');
  const nested = m.fields.find((f) => f.name === 'nested');
  assert.equal(nested.type, 'json');
  assert.ok(nested.placeholder.includes('{'));
});

t('deriveFormModel: 顶层非 object → json 模式', () => {
  assert.equal(core.deriveFormModel({ type: 'array', items: { type: 'string' } }).mode, 'json');
  assert.equal(core.deriveFormModel(null).mode, 'json');
  assert.equal(core.deriveFormModel('x').mode, 'json');
});

t('deriveFormModel: 数组类型字段回退 json', () => {
  const m = core.deriveFormModel({
    type: 'object',
    properties: { tags: { type: 'array', items: { type: 'string' } } },
  });
  assert.equal(m.fields[0].type, 'json');
});

t('deriveFormModel: union 类型取非 null 单支', () => {
  const m = core.deriveFormModel({
    type: 'object',
    properties: { v: { type: ['string', 'null'] } },
  });
  assert.equal(m.fields[0].type, 'string');
});

/* ---------------- diffToolsets ---------------- */

t('diffToolsets: 增/删/不变', () => {
  const a = [{ name: 'x', description: 'd', inputSchema: { type: 'object' } }];
  const b = [
    { name: 'x', description: 'd', inputSchema: { type: 'object' } },
    { name: 'y', description: 'new' },
  ];
  const d = core.diffToolsets(a, b);
  assert.deepEqual(d.added, ['y']);
  assert.deepEqual(d.removed, []);
  assert.equal(d.unchangedCount, 1);
  const d2 = core.diffToolsets(b, a);
  assert.deepEqual(d2.removed, ['y']);
  assert.deepEqual(d2.added, []);
});

t('diffToolsets: description / schema 变更检出', () => {
  const a = [{ name: 'x', description: 'old', inputSchema: { type: 'object', properties: { p: { type: 'string' } } } }];
  const b1 = [{ name: 'x', description: 'new', inputSchema: { type: 'object', properties: { p: { type: 'string' } } } }];
  const d1 = core.diffToolsets(a, b1);
  assert.equal(d1.changed.length, 1);
  assert.deepEqual(d1.changed[0].fields, ['description']);
  const b2 = [{ name: 'x', description: 'old', inputSchema: { type: 'object', properties: { p: { type: 'number' } } } }];
  const d2 = core.diffToolsets(a, b2);
  assert.deepEqual(d2.changed[0].fields, ['schema']);
});

t('diffToolsets: schema 键序不同不算漂移', () => {
  const a = [{ name: 'x', description: 'd', inputSchema: { properties: { p: { type: 'string', description: 'q' } }, type: 'object' } }];
  const b = [{ name: 'x', description: 'd', inputSchema: { type: 'object', properties: { p: { description: 'q', type: 'string' } } } }];
  const d = core.diffToolsets(a, b);
  assert.equal(d.changed.length, 0);
  assert.equal(d.unchangedCount, 1);
});

/* ---------------- assessToolset ---------------- */

t('assessToolset: 全合规清单零问题', () => {
  const issues = core.assessToolset([
    { name: 'a', description: '一段足够长的描述文字', inputSchema: { type: 'object', properties: {} } },
  ]);
  assert.equal(issues.length, 0);
});

t('assessToolset: 缺 description 与短 description', () => {
  const issues = core.assessToolset([
    { name: 'a', inputSchema: { type: 'object' } },
    { name: 'b', description: '短', inputSchema: { type: 'object' } },
  ]);
  assert.equal(issues.filter((i) => i.tool === 'a' && i.level === 'warn').length, 1);
  assert.equal(issues.filter((i) => i.tool === 'b' && i.msg.includes('过短')).length, 1);
});

t('assessToolset: 重名是 error', () => {
  const issues = core.assessToolset([
    { name: 'a', description: '描述一段话', inputSchema: { type: 'object' } },
    { name: 'a', description: '描述一段话', inputSchema: { type: 'object' } },
  ]);
  assert.ok(issues.some((i) => i.level === 'error' && i.msg.includes('重名')));
});

t('assessToolset: 缺 name / 非法 schema', () => {
  const issues = core.assessToolset([
    { description: '没有名字的工具', inputSchema: {} },
    { name: 'b', description: '描述一段话', inputSchema: 'not-object' },
    { name: 'c', description: '描述一段话' },
    { name: 'd', description: '描述一段话', inputSchema: { foo: 1 } },
  ]);
  assert.ok(issues.some((i) => i.level === 'error' && i.tool === '(未知名工具)'));
  assert.ok(issues.some((i) => i.level === 'error' && i.tool === 'b'));
  assert.ok(issues.some((i) => i.tool === 'c' && i.msg.includes('inputSchema')));
  assert.ok(issues.some((i) => i.tool === 'd' && i.msg.includes('type')));
});

/* ---------------- parseSseMessages ---------------- */

t('parseSseMessages: 单条 data', () => {
  const out = core.parseSseMessages('data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 1);
});

t('parseSseMessages: 多行 data 拼接 + 注释/事件字段忽略', () => {
  const out = core.parseSseMessages(': keep-alive\nevent: message\ndata: {"a":\ndata: 1}\n\n');
  assert.deepEqual(out, [{ a: 1 }]);
});

t('parseSseMessages: 非 JSON data 保留 raw', () => {
  const out = core.parseSseMessages('data: hello\n\n');
  assert.deepEqual(out, [{ raw: 'hello' }]);
});

t('parseSseMessages: \\r\\n 归一', () => {
  const out = core.parseSseMessages('data: {"x":1}\r\n\r\n');
  assert.deepEqual(out, [{ x: 1 }]);
});

t('parseSseMessages: 空输入', () => {
  assert.deepEqual(core.parseSseMessages(''), []);
  assert.deepEqual(core.parseSseMessages(null), []);
});

/* ---------------- buildSpawnPlan / quoteWinArg ---------------- */

t('buildSpawnPlan: win32 npx → cmd shell', () => {
  const p = core.buildSpawnPlan('npx', ['-y', 'server'], 'win32');
  assert.equal(p.mode, 'shell');
  assert.ok(p.commandline.startsWith('npx'));
  assert.ok(p.commandline.includes('-y'));
});

t('buildSpawnPlan: win32 .cmd 后缀 → shell；node → direct', () => {
  assert.equal(core.buildSpawnPlan('C:\\x\\my.cmd', [], 'win32').mode, 'shell');
  assert.equal(core.buildSpawnPlan('node', ['x.js'], 'win32').mode, 'direct');
  assert.equal(core.buildSpawnPlan('C:\\Program Files\\node\\node.exe', [], 'win32').mode, 'direct');
});

t('buildSpawnPlan: 非 win32 一律 direct', () => {
  assert.deepEqual(core.buildSpawnPlan('npx', ['-y'], 'linux'), { mode: 'direct', file: 'npx', args: ['-y'] });
});

t('buildSpawnPlan: 空命令', () => {
  const p = core.buildSpawnPlan('', [], 'win32');
  assert.equal(p.mode, 'direct');
  assert.equal(p.file, '');
});

t('quoteWinArg: 普通字符不加引号，特殊字符加引号并转义', () => {
  assert.equal(core.quoteWinArg('abc-1_2.3'), 'abc-1_2.3');
  assert.equal(core.quoteWinArg('a b'), '"a b"');
  assert.equal(core.quoteWinArg('say "hi"'), '"say \\"hi\\""');
  assert.equal(core.quoteWinArg(''), '""');
});

/* ---------------- parseClaudeConfig ---------------- */

t('parseClaudeConfig: mcpServers 映射 stdio/http/sse', () => {
  const r = core.parseClaudeConfig(JSON.stringify({
    mcpServers: {
      local: { command: 'node', args: ['srv.js'], env: { TOKEN: 't' } },
      remote: { type: 'http', url: 'https://x/mcp', headers: { Authorization: 'Bearer t' } },
      old: { type: 'sse', url: 'https://y/sse' },
    },
  }, null, 0), 'p');
  assert.equal(r.servers.length, 3);
  const local = r.servers.find((s) => s.name === 'local');
  assert.equal(local.transport, 'stdio');
  assert.deepEqual(local.args, ['srv.js']);
  assert.equal(local.env.TOKEN, 't');
  const remote = r.servers.find((s) => s.name === 'remote');
  assert.equal(remote.transport, 'http');
  assert.equal(remote.legacy, false);
  const old = r.servers.find((s) => s.name === 'old');
  assert.equal(old.legacy, true);
  assert.equal(r.skipped.length, 0);
});

t('parseClaudeConfig: 顶层映射（无 mcpServers 键）', () => {
  const r = core.parseClaudeConfig(JSON.stringify({ a: { command: 'x' } }));
  assert.equal(r.servers.length, 1);
  assert.equal(r.servers[0].name, 'a');
});

t('parseClaudeConfig: 非法条目进 skipped', () => {
  const r = core.parseClaudeConfig(JSON.stringify({
    mcpServers: {
      bad1: 'string-entry',
      bad2: { type: 'http' },
      bad3: { url: 'ftp://x', command: 'also' },
    },
  }));
  assert.equal(r.servers.length, 0);
  assert.equal(r.skipped.length, 3);
});

t('parseClaudeConfig: 坏 JSON 整文件跳过', () => {
  const r = core.parseClaudeConfig('{oops');
  assert.equal(r.servers.length, 0);
  assert.ok(r.skipped[0].reason.includes('JSON 解析失败'));
});

t('parseClaudeConfig: url 非法拒绝', () => {
  const r = core.parseClaudeConfig(JSON.stringify({ mcpServers: { x: { url: 'javascript:alert(1)' } } }));
  assert.equal(r.servers.length, 0);
  assert.ok(r.skipped[0].reason.includes('http'));
});

/* ---------------- redactValue / capList ---------------- */

t('redactValue: 疑似密钥键脱敏，普通键保留', () => {
  const out = core.redactValue({ API_KEY: 'abc', token: 't', Authorization: 'Bearer x', name: 'n', count: 3, nested: { token: 'deep' } });
  assert.equal(out.API_KEY, '******');
  assert.equal(out.token, '******');
  assert.equal(out.Authorization, '******');
  assert.equal(out.name, 'n');
  assert.equal(out.count, 3);
  assert.equal(out.nested.token, 'deep'); // 浅层：嵌套不处理（headers/env 都是平的）
});

t('redactValue: 非对象原样', () => {
  assert.equal(core.redactValue('x'), 'x');
  assert.equal(core.redactValue(null), null);
  assert.deepEqual(core.redactValue([1]), [1]);
});

t('capList: 封顶从头部保留', () => {
  const arr = [1, 2, 3, 4, 5];
  assert.deepEqual(core.capList(arr, 3), [1, 2, 3]);
  assert.deepEqual(core.capList(arr, 10), [1, 2, 3, 4, 5]);
  assert.deepEqual(core.capList(null, 3), []);
});

/* ---------------- 汇总 ---------------- */

console.log(`\n离线单测: ${pass} 通过, ${fail} 失败`);
if (fail > 0) {
  process.exit(1);
}
