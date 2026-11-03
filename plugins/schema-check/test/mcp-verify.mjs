/**
 * JSON Schema 校验器 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实校验语义全离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  required: ['name', 'age'],
  properties: {
    name: { type: 'string', minLength: 2 },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    role: { enum: ['admin', 'user'] },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  },
  additionalProperties: false,
};

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'schema-check');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('schemacheck_validate') && names.includes('schemacheck_explain'));

  // 合法数据（对象形态）
  const good = await rpc('tools/call', { name: 'schemacheck_validate', arguments: { schema: SCHEMA, data: { name: 'Alice', age: 30, role: 'admin', tags: ['a'] } } });
  check('合法数据 ✅', good.result?.isError === false && text(good).includes('✅'), text(good).slice(0, 120));

  // 非法数据（对象形态）：多类错误一次报全 + 路径定位
  const bad = await rpc('tools/call', { name: 'schemacheck_validate', arguments: { schema: SCHEMA, data: { name: 'A', age: -1, role: 'boss', tags: [1, 'x'], extra: true } } });
  check('非法数据 ❌', text(bad).includes('❌'), text(bad).slice(0, 150));
  check('/name minLength', text(bad).includes('/name') && text(bad).includes('minLength'));
  check('/age minimum', text(bad).includes('/age') && text(bad).includes('minimum'));
  check('/role enum', text(bad).includes('/role') && text(bad).includes('enum'));
  check('/tags/0 类型', text(bad).includes('/tags/0'));
  check('additionalProperties 拒绝 extra', text(bad).includes('extra') && text(bad).includes('additionalProperties'));
  check('一次报全（≥5 条错误）', (text(bad).match(/\n  - /g) || []).length >= 5, text(bad));

  // JSON 字符串形态参数（LLM 常用）
  const strForm = await rpc('tools/call', { name: 'schemacheck_validate', arguments: { schema: JSON.stringify(SCHEMA), data: '{"name":"Bob","age":20}' } });
  check('JSON 字符串形态参数', strForm.result?.isError === false && text(strForm).includes('✅'), text(strForm).slice(0, 120));

  // 坏 JSON 字符串
  const badJson = await rpc('tools/call', { name: 'schemacheck_validate', arguments: { schema: SCHEMA, data: '{not-json' } });
  check('坏 JSON 字符串报错', badJson.result?.isError === true && text(badJson).includes('解析失败'));

  // $ref 如实报错
  const ref = await rpc('tools/call', { name: 'schemacheck_validate', arguments: { schema: { type: 'object', properties: { x: { $ref: '#/defs/y' } } }, data: { x: 1 } } });
  check('$ref 如实报错不假绿', text(ref).includes('$ref') && text(ref).includes('不支持'), text(ref).slice(0, 150));

  // explain
  const explain = await rpc('tools/call', { name: 'schemacheck_explain', arguments: { schema: SCHEMA } });
  check('explain isError=false', explain.result?.isError === false);
  check('explain 含必填与路径', text(explain).includes('必填 [name, age]') && text(explain).includes('/name'));
  check('explain 含枚举', text(explain).includes('枚举'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'schemacheck_validate', arguments: { schema: SCHEMA } });
  check('缺 data isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
