/**
 * MCP stdio JSON-RPC 喂包冒烟(node test/mcp-verify.mjs)
 * 纪律(platform-constraints 实证坑):
 *  - notifications/initialized 是通知(无 id)不回包——write-only 不进 pending 表
 *  - tools/call 参数是 { name, arguments } 平铺,不再包一层 params
 *  - 服务日志走 stderr;本 harness 只消费 stdout 协议行
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '../mcp/server.js');

const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
proc.stderr.on('data', () => {}); // stderr 静默(服务诊断日志,非协议)

const pending = new Map();
let buf = '';
proc.stdout.setEncoding('utf8');
proc.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params, timeoutMs = 5000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc 超时: ${method}`)); }, timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); // 通知无回包,不进 pending
}

const results = [];
let exitCode = 0;
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  if (!cond) { exitCode = 1; console.log(`  ✖ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

function textOf(res) {
  return res && res.result && res.result.content && res.result.content[0] ? res.result.content[0].text : '';
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize 返回协议版本', init.result && init.result.protocolVersion === '2024-11-05');
  check('serverInfo 名称', init.result && init.result.serverInfo && init.result.serverInfo.name === 'id-lens');
  notify('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  check('四工具注册', ['id_lens_parse', 'id_lens_bits', 'id_lens_validate', 'id_lens_convert'].every((n) => names.includes(n)), names.join(','));
  check('工具 schema 有 inputSchema', list.result.tools.every((t) => t.inputSchema && t.inputSchema.type === 'object'));

  // parse:UUIDv7(时间还原进文本)
  let res = await rpc('tools/call', { name: 'id_lens_parse', arguments: { id: '01890a5d-ac96-774b-bcce-b302099a8057' } });
  check('parse v7 非错误', res.result && res.result.isError === false);
  check('parse v7 文本含家族与版本', textOf(res).includes('UUID') && textOf(res).includes('v7'));
  check('parse v7 时间还原(高 48 位=Unix 毫秒,独立换算定标 0x01890a5dac96)', textOf(res).includes('2023-06-30T03:34:18.518Z'), textOf(res));

  // parse:Snowflake discord 布局
  res = await rpc('tools/call', { name: 'id_lens_parse', arguments: { id: '175928847299117063', layout: 'discord' } });
  check('parse snowflake discord 纪元', textOf(res).includes('Discord'));
  res = await rpc('tools/call', { name: 'id_lens_parse', arguments: { id: '175928847299117063' } });
  check('parse snowflake 缺省 twitter', textOf(res).includes('Twitter'));

  // parse:失败给原因
  res = await rpc('tools/call', { name: 'id_lens_parse', arguments: { id: 'not-an-id' } });
  check('parse 失败 isError', res.result && res.result.isError === true);
  check('parse 失败文本含原因', textOf(res).includes('解析失败'));

  // bits:位段表(markdown 表 + 位号)
  res = await rpc('tools/call', { name: 'id_lens_bits', arguments: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' } });
  check('bits ULID 位段表', textOf(res).includes('unix_ts_ms') && textOf(res).includes('randomness'));
  check('bits 位图 128 位', /```/.test(textOf(res)));
  res = await rpc('tools/call', { name: 'id_lens_bits', arguments: { id: '175928847299117063' } });
  check('bits snowflake 64 位段', textOf(res).includes('delta_ms') && textOf(res).includes('seq'));

  // validate:清单 + 混淆字母
  res = await rpc('tools/call', { name: 'id_lens_validate', arguments: { id: '01ARZ3NDEKTSO4RRFFQ69G5FAV' } });
  check('validate 混淆字母 isError 提示', textOf(res).includes('Crockford 排除字母'));
  res = await rpc('tools/call', { name: 'id_lens_validate', arguments: { id: '{a6b07d06-6dbd-11ed-9a5c-325096b39f47}' } });
  check('validate braces info', textOf(res).includes('shape-braces'));
  res = await rpc('tools/call', { name: 'id_lens_validate', arguments: { id: '175928847299117063' } });
  check('validate 纪元歧义对照', textOf(res).includes('epoch-ambiguous'));

  // convert:全链路
  res = await rpc('tools/call', { name: 'id_lens_convert', arguments: { id: 'a6b07d06-6dbd-11ed-9a5c-325096b39f47', to: 'ulid' } });
  check('convert uuid→ulid', textOf(res).includes('2VCFBNGBN-') === false && /```/.test(textOf(res)));
  const ulidOut = (textOf(res).match(/```[\s\S]*?\n([^\n`]+)\n/)) ? textOf(res).match(/```[\s\S]*?\n([^\n`]+)\n/)[1].trim() : '';
  check('convert 产物 26 字符', /^[0-9A-HJKMNP-TV-Z]{26}$/.test(ulidOut), ulidOut);
  res = await rpc('tools/call', { name: 'id_lens_convert', arguments: { id: ulidOut, to: 'canonical' } });
  const canonOut = textOf(res).match(/```[\s\S]*?\n([^\n`]+)\n/)[1].trim();
  check('convert ulid→canonical round-trip', canonOut === 'a6b07d06-6dbd-11ed-9a5c-325096b39f47', canonOut);
  res = await rpc('tools/call', { name: 'id_lens_convert', arguments: { id: '175928847299117063', to: 'canonical' } });
  check('convert snowflake→canonical 位宽拒绝', textOf(res).includes('64 位') && textOf(res).includes('128 位'));
  res = await rpc('tools/call', { name: 'id_lens_convert', arguments: { id: 'a6b07d06-6dbd-11ed-9a5c-325096b39f47', to: 'nope' } });
  check('convert 未知目标报错', textOf(res).includes('未知目标形态'));

  // ping + 未知方法
  res = await rpc('ping', {});
  check('ping 回包', !!res.result);
  res = await rpc('bogus/method', {});
  check('未知方法 -32601', res.error && res.error.code === -32601);
  res = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
  check('未知工具 isError', res.result && res.result.isError === true && textOf(res).includes('未知工具'));
} catch (e) {
  exitCode = 1;
  console.log('  ✖ harness 异常:', e && e.message);
} finally {
  proc.stdin.end();
  proc.kill();
}

const pass = results.filter((x) => x.pass).length;
console.log(`\nMCP 冒烟:${results.length} 断言,${pass} 通过 / ${results.length - pass} 失败`);
// 退出码收集后在 finally 之外 exit(text-triage 实证:try 内 process.exit 跳过 finally 清理)
process.exit(exitCode);
