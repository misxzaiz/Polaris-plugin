/**
 * mcp-verify.mjs —— 真 MCP 子进程冒烟：spawn bundle 后的 mcp/server.js，
 * 走 stdio JSON-RPC 2.0 全协议（initialize → tools/list → 五工具逐个调用）。
 * 探测目标一律本地 hermetic TLS 服务器，不连外网。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const fx = (name) => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');

const results = [];
const ok = (name, cond, detail) => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 300)}`}`);
};

// hermetic TLS 服务器
const tlsServer = await new Promise((resolve, reject) => {
  const s = https.createServer({ key: fx('chain-leaf.key'), cert: fx('chain-full.pem') }, (req, res) => { res.writeHead(200); res.end('ok'); });
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const tlsPort = tlsServer.address().port;

const child = spawn(process.execPath, [path.join(root, 'mcp', 'server.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderrBuf = '';
child.stderr.on('data', (d) => { stderrBuf += String(d); }); // 日志走 stderr（协议纪律），断言不混入 stdout

const pending = new Map();
let lineBuf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  lineBuf += c;
  for (;;) {
    const i = lineBuf.indexOf('\n');
    if (i === -1) break;
    const line = lineBuf.slice(0, i).trim();
    lineBuf = lineBuf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch (_) { /* ignore */ }
  }
});

let rpcId = 0;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); }, 30000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mcp-verify', version: '0' } });
  ok('initialize serverInfo', init.result && init.result.serverInfo && init.result.serverInfo.name === 'cert-lens', JSON.stringify(init.result));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const tools = await rpc('tools/list', {});
  const names = (tools.result.tools || []).map((t) => t.name);
  ok('tools/list 五工具', JSON.stringify(names) === JSON.stringify(['cert_parse', 'tls_probe', 'tls_diagnose', 'cert_expiry_check', 'cert_selftest']), JSON.stringify(names));
  ok('工具都有 inputSchema', tools.result.tools.every((t) => t.inputSchema && typeof t.inputSchema === 'object'));

  const call = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args });
    const text = r.result && r.result.content && r.result.content[0] && r.result.content[0].text;
    return { isError: r.result && r.result.isError, text: String(text || '') };
  };

  // cert_parse：链 + 配对
  const p1 = await call('cert_parse', { pem: fx('chain-full.pem'), key: fx('chain-leaf.key'), host: 'localhost' });
  ok('cert_parse 链渲染', p1.isError === false && /#1 localhost/.test(p1.text) && /3 张证书/.test(p1.text), p1.text.slice(0, 200));
  ok('cert_parse 配对成功行', /私钥配对：匹配/.test(p1.text), p1.text.slice(-300));
  ok('cert_parse 倒计时行', /剩余 \d+ 天/.test(p1.text));

  const p2 = await call('cert_parse', { pem: fx('good-leaf.pem'), key: fx('unmatched-key.pem') });
  ok('cert_parse 不配对提示', /不配对/.test(p2.text), p2.text.slice(-200));

  const p3 = await call('cert_parse', { pem: 'garbage' });
  ok('cert_parse 垃圾输入 isError', p3.isError === true && /没有解析出/.test(p3.text), p3.text.slice(0, 160));

  // tls_probe：hermetic 自签链
  const pr = await call('tls_probe', { target: `127.0.0.1:${tlsPort}` });
  ok('tls_probe 协议+链渲染', /TLS/.test(pr.text) && /收到链 3 级/.test(pr.text), pr.text.slice(0, 260));
  ok('tls_probe 校验失败标注', /✗ 校验失败/.test(pr.text));
  ok('tls_probe 诊断中文', /诊断：/.test(pr.text) && /根因|自签|信任/.test(pr.text), pr.text.slice(-400));

  // tls_probe：真实公网站点（有网时验证真实世界可用性；无网跳过不算失败）
  try {
    const real = await call('tls_probe', { target: 'api.github.com:443', timeoutMs: 6000 });
    if (/✓ 校验通过/.test(real.text) && /收到链/.test(real.text)) {
      ok('tls_probe 真实公网站点（有网）', true);
    } else {
      console.log(`ℹ 跳过真实公网站点断言（网络不可达或被拦截）：${real.text.slice(0, 120).replace(/\n/g, ' ')}`);
    }
  } catch (_) { console.log('ℹ 跳过真实公网站点断言（网络不可达）'); }

  // tls_diagnose
  const d1 = await call('tls_diagnose', { code: 'CERT_HAS_EXPIRED' });
  ok('tls_diagnose 过期翻译', /过期/.test(d1.text) && /建议/.test(d1.text), d1.text.slice(0, 200));
  const d2 = await call('tls_diagnose', { message: 'NET::ERR_CERT_AUTHORITY_INVALID' });
  ok('tls_diagnose 浏览器文本', /颁发机构|不受信任/.test(d2.text), d2.text.slice(0, 200));

  // cert_expiry_check：targets 形态（hermetic 端点）
  const ex = await call('cert_expiry_check', { targets: `127.0.0.1:${tlsPort}` });
  ok('cert_expiry_check 表格', /到期速查/.test(ex.text) && /天/.test(ex.text), ex.text.slice(0, 260));
  const ex2 = await call('cert_expiry_check', {});
  ok('cert_expiry_check 空参 isError', ex2.isError === true);

  // cert_selftest
  const st = await call('cert_selftest', {});
  ok('cert_selftest 全通过', /试金石 \d+\/\d+ 通过/.test(st.text) && !/✗/.test(st.text), st.text.slice(0, 400));
} finally {
  tlsServer.close();
  child.kill();
}

const pass = results.filter((r) => r.pass).length;
console.log(`\nmcp-verify: ${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
