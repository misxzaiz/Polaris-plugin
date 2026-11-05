/**
 * mcp-verify.mjs —— jq 查询台 MCP 真桥验证（spawn 独立进程，stdio JSON-RPC 全链路）
 * 断言：initialize / tools/list=5 / jq_query（内联+NDJSON+flags+filePath）/ jq_check 双态 /
 *       jq_reference / json_outline / jq_selftest 14 断言 / 错误路径 isError。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, '../mcp/server.js');

const child = spawn('node', [serverJs], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
child.stderr.on('data', (c) => process.stderr.write(`[mcp-stderr] ${c}`));

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); } }, 60000);
  });
}

async function call(name, args) {
  const msg = await rpc('tools/call', { name, arguments: args });
  const r = msg.result || {};
  return { isError: !!r.isError, text: (r.content?.[0]?.text || '') };
}

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

const tmp = mkdtempSync(path.join(tmpdir(), 'jq-query-mcp-'));
const ndjsonPath = path.join(tmp, 'events.ndjson');
writeFileSync(ndjsonPath, [
  '{"event":"login","user":"u1","ms":5}',
  '{"event":"buy","user":"u2","ms":120}',
  '{"event":"login","user":"u3","ms":7}',
].join('\n'), 'utf8');

try {
  // initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize 返回 serverInfo', init.result?.serverInfo?.name === 'jq-query', JSON.stringify(init.result).slice(0, 120));

  const tools = await rpc('tools/list', {});
  const names = (tools.result?.tools || []).map((t) => t.name);
  check('tools/list = 5 工具', names.length === 5 && names.includes('jq_query') && names.includes('jq_check')
    && names.includes('jq_reference') && names.includes('json_outline') && names.includes('jq_selftest'), JSON.stringify(names));
  check('每个工具都有 inputSchema', (tools.result?.tools || []).every((t) => t.inputSchema && typeof t.inputSchema === 'object'));

  // jq_query：内联
  const q1 = await call('jq_query', { query: '.users[] | select(.age > 30) | .name', json: '{"users":[{"name":"a","age":25},{"name":"b","age":40}]}' });
  check('jq_query 内联 select', !q1.isError && q1.text.includes('"b"'), q1.text.slice(0, 200));

  // jq_query：NDJSON 文件 + --slurp
  const q2 = await call('jq_query', { query: 'length', filePath: ndjsonPath, flags: ['--slurp'] });
  check('jq_query filePath NDJSON --slurp', !q2.isError && /输出 1 项/.test(q2.text) && q2.text.includes('3'), q2.text.slice(0, 240));

  // jq_query：-r 输出
  const q3 = await call('jq_query', { query: '["a","b"] | @csv', json: '"x"', flags: ['-r'] });
  check('jq_query -r @csv', !q3.isError && q3.text.includes('"a","b"'), q3.text.slice(0, 160));

  // jq_query：聚合式 flags + 变量
  const q4 = await call('jq_query', { query: '$x * 2', json: 'null', flags: ['-n', '--argjson', 'x', '21'] });
  check('jq_query 聚合式 -n --argjson', !q4.isError && q4.text.includes('42'), q4.text.slice(0, 160));

  // jq_query：运行期错误 → isError + jq 原生报错
  const q5 = await call('jq_query', { query: '.a | tonumber', json: '{"a":"s"}' });
  check('jq_query 运行错误 isError', q5.isError && /tonumber|Cannot|pars|numeric/i.test(q5.text), q5.text.slice(0, 200));

  // jq_query：坏输入
  const q6 = await call('jq_query', { query: '.', json: '{bad' });
  check('jq_query 坏输入 isError 带人话', q6.isError && /合法 JSON/.test(q6.text), q6.text.slice(0, 160));

  // jq_check：语法错与语法 OK 双态
  const c1 = await call('jq_check', { query: '.a ++' });
  check('jq_check 语法错误报错', c1.isError && /语法错误/.test(c1.text), c1.text.slice(0, 160));
  const c2 = await call('jq_check', { query: '.a | select(. > 1)' });
  check('jq_check 语法 OK', !c2.isError && c2.text.includes('语法 OK'), c2.text.slice(0, 160));

  // jq_reference
  const r1 = await call('jq_reference', { keyword: 'group' });
  check('jq_reference 搜索命中', !r1.isError && r1.text.includes('group_by'), r1.text.slice(0, 160));
  const r2 = await call('jq_reference', {});
  check('jq_reference 全量带说明', !r2.isError && r2.text.includes('速查表'), r2.text.slice(0, 160));

  // json_outline
  const o1 = await call('json_outline', { json: '{"rows":[{"id":1},{"id":2}],"cfg":{"a":1}}', depth: 3 });
  check('json_outline 键并集+文本', !o1.isError && o1.text.includes('元素键并集') && o1.text.includes('rows[0]'), o1.text.slice(0, 240));
  const o2 = await call('json_outline', { json: 'not json' });
  check('json_outline 非法输入报错', o2.isError && /合法 JSON/.test(o2.text), o2.text.slice(0, 160));

  // jq_selftest：14 断言全绿
  const s1 = await call('jq_selftest', {});
  const m = s1.text.match(/试金石 (\d+)\/(\d+) 通过（fail=(\d+)/);
  check('jq_selftest 14/14 全绿', m && Number(m[1]) === Number(m[2]) && Number(m[3]) === 0, s1.text.slice(0, 300));

  // 未知工具
  const u1 = await call('no_such_tool', {});
  check('未知工具 isError', u1.isError && /未知工具/.test(u1.text), u1.text.slice(0, 120));
} catch (e) {
  failures++;
  console.error('✗ 异常中断:', e);
} finally {
  child.kill();
  try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log(failures === 0 ? '\nMCP 验证全部通过' : `\nMCP 验证失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
