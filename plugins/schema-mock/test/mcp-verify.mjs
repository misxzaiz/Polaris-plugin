/**
 * Mock 数据生成器 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实生成语义全离线验证（含生成→036 校验器闭环）。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schemaCore from '../../schema-check/shared/schema-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* ignore */ }
  }
});

function rpc(method, params, timeoutMs = 8000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc 超时: ${method}`)), timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function text(res) {
  return String(res.result?.content?.[0]?.text || '');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

const SCHEMA = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'integer', minimum: 1, maximum: 999 },
    name: { type: 'string', minLength: 3 },
    role: { enum: ['admin', 'user', 'guest'] },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    active: { type: 'boolean' },
  },
  additionalProperties: false,
};

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'schema-mock');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('schemamock_generate') && names.includes('schemamock_batch'));

  // generate：产物对象形态 + 独立闭环校验
  const gen = await rpc('tools/call', { name: 'schemamock_generate', arguments: { schema: SCHEMA, seed: 42 } });
  check('generate isError=false', gen.result?.isError === false, text(gen).slice(0, 150));
  const jsonMatch = text(gen).match(/生成的假数据：\n([\s\S]+)$/);
  check('generate 输出 JSON', !!jsonMatch);
  let item = null;
  if (jsonMatch) {
    item = JSON.parse(jsonMatch[1]);
    const v = schemaCore.validate(item, SCHEMA);
    check('闭环：产物过 036 校验器', v.valid, JSON.stringify(v.errors).slice(0, 200));
  }

  // seed 复现
  const gen2 = await rpc('tools/call', { name: 'schemamock_generate', arguments: { schema: SCHEMA, seed: 42 } });
  check('seed 复现（同 seed 同结果）', text(gen2) === text(gen));

  // batch：count 数量 + 每组闭环
  const batch = await rpc('tools/call', { name: 'schemamock_batch', arguments: { schema: SCHEMA, seed: 7, count: 5 } });
  check('batch isError=false', batch.result?.isError === false, text(batch).slice(0, 150));
  const bMatch = text(batch).match(/闭环自检）：\n([\s\S]+)$/);
  if (bMatch) {
    const items = JSON.parse(bMatch[1]);
    check('batch count=5', Array.isArray(items) && items.length === 5);
    const allValid = items.every((it) => schemaCore.validate(it, SCHEMA).valid);
    check('batch 每组过校验器', allValid);
  } else {
    check('batch 输出 JSON', false, text(batch).slice(0, 150));
  }

  // $ref 如实报错
  const ref = await rpc('tools/call', { name: 'schemamock_generate', arguments: { schema: { type: 'object', properties: { x: { $ref: '#/d' } }, required: ['x'] } } });
  check('$ref 如实报错', ref.result?.isError === true && text(ref).includes('$ref'));

  // pattern 不可满足如实报错
  const pat = await rpc('tools/call', { name: 'schemamock_generate', arguments: { schema: { type: 'string', pattern: '^zzz-never-[0-9]{500}$' } } });
  check('pattern 不可满足如实报错', pat.result?.isError === true && text(pat).includes('pattern'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'schemamock_generate', arguments: {} });
  check('缺 schema isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
