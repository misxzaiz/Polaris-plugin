/**
 * version-lens MCP 协议离线验证（node test/mcp-verify.mjs）
 * 纯本地无宿主依赖——stdio JSON-RPC 握手 + 三工具真实调用全离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑：双重包裹会变成"未知工具：undefined"）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
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
    } catch (_) { /* 忽略非 JSON 行 */ }
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
// 通知无 id、服务端不回包——只能写不能等（rpc() 会永久挂起）
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

let failed = 0;
let harnessError = false;
try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: serverInfo.name=version-lens', init.result?.serverInfo?.name === 'version-lens');
  notify('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 恰好三工具', JSON.stringify(names) === JSON.stringify(['version_lens_explain', 'version_lens_check', 'version_lens_sort']), `实际 ${names.join(',')}`);
  check('tools/list: schema required 齐全', (list.result?.tools || []).every((t) => (t.inputSchema.required || []).length >= 1));

  // explain
  const ex = await rpc('tools/call', { name: 'version_lens_explain', arguments: { range: '^1.2.3' } });
  check('explain ^1.2.3: 无错误', ex.result?.isError === false, String(ex.result?.isError));
  check('explain ^1.2.3: 含两个比较器', /`>=1\.2\.3`/.test(ex.result?.content?.[0]?.text || '') && /`<2\.0\.0-0`/.test(ex.result?.content?.[0]?.text || ''));
  check('explain ^1.2.3: 门控坑提示', (ex.result?.content?.[0]?.text || '').includes('预发布门控') || (ex.result?.content?.[0]?.text || '').includes('预发布'));

  const ex0 = await rpc('tools/call', { name: 'version_lens_explain', arguments: { range: '^0.2.3' } });
  check('explain ^0.2.3: 0.x 锁次版本坑', (ex0.result?.content?.[0]?.text || '').includes('锁定次版本'));

  const exBad = await rpc('tools/call', { name: 'version_lens_explain', arguments: { range: '>abc' } });
  check('explain 非法范围: isError 且含原因', ex0.result !== undefined && exBad.result?.isError === true && (exBad.result?.content?.[0]?.text || '').includes('无法解析'));

  // check
  const ck = await rpc('tools/call', {
    name: 'version_lens_check',
    arguments: { range: '^1.2.3', versions: ['1.2.3', '1.9.9', '2.0.0', '1.2.3-beta.4', '1.2.4-beta.1', '1.2.4'] },
  });
  const ckText = ck.result?.content?.[0]?.text || '';
  check('check ^1.2.3: 表格 6 行', (ckText.match(/\| /g) || []).length >= 6, ckText.slice(0, 200));
  check('check: 1.9.9 匹配', /1\.9\.9\s*\|\s*✅/.test(ckText));
  check('check: 2.0.0 不匹配且给出拒绝比较器', /2\.0\.0\s*\|\s*❌/.test(ckText) && ckText.includes('<2.0.0-0'));
  check('check: 1.2.3-beta.4 低于同号正式版被下界拒绝', /1\.2\.3-beta\.4\s*\|\s*❌/.test(ckText) && ckText.includes('低于同号正式版'));
  check('check: 1.2.4-beta.1 被预发布门控拦截（数值在区间内）', /1\.2\.4-beta\.1\s*\|/.test(ckText) && ckText.includes('门控'));

  const ckPre = await rpc('tools/call', {
    name: 'version_lens_check',
    arguments: { range: '^1.2.3-beta.2', versions: ['1.2.3-beta.4', '1.2.3-beta.1', '1.3.0-alpha'] },
  });
  const ckPreText = ckPre.result?.content?.[0]?.text || '';
  check('check 显式 beta 范围: beta.4 匹配', /1\.2\.3-beta\.4\s*\|\s*✅/.test(ckPreText));
  check('check 显式 beta 范围: beta.1 不匹配（低于下界）', /1\.2\.3-beta\.1\s*\|\s*❌/.test(ckPreText));

  // 中文链路（Node fetch 纪律同样适用：构造参数走 JSON.stringify，不经控制台编码）
  const ckZh = await rpc('tools/call', { name: 'version_lens_check', arguments: { range: '>=2.0.0 <2.0.0', versions: ['2.0.1'] } });
  check('check 空范围组: 如实提示空交集', (ckZh.result?.content?.[0]?.text || '').includes('空') && /2\.0\.1\s*\|\s*❌/.test(ckZh.result?.content?.[0]?.text || ''));

  // sort
  const st = await rpc('tools/call', { name: 'version_lens_sort', arguments: { versions: ['1.0.0', '1.0.0-rc.1', '0.9.0', '2.0.0', 'bad ver'] } });
  const stText = st.result?.content?.[0]?.text || '';
  check('sort: 升序且 rc 在正式版前', stText.indexOf('0.9.0') < stText.indexOf('`1.0.0-rc.1`') && stText.indexOf('`1.0.0-rc.1`') < stText.indexOf('`1.0.0`'));
  check('sort: 无效版本单列', stText.includes('bad ver') && stText.includes('无效版本'));

  // 未知工具
  const unk = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
  check('未知工具: isError', unk.result?.isError === true);
} catch (e) {
  harnessError = true;
  console.error('harness 异常:', e);
  failed++;
}

if (!harnessError) {
  failed = results.filter((r) => !r.pass).length;
}
console.log(`\n共 ${results.length} 项断言：${results.length - failed} 通过 / ${failed} 失败`);
mcp.kill();
process.exit(failed > 0 || harnessError ? 1 : 0);
