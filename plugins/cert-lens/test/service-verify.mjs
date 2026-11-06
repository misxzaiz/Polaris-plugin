/**
 * service-verify.mjs —— 真进程冒烟：bundle 后的 service/main.js 拉起 → HTTP 全 API 打一遍
 * 探测目标一律本地 hermetic TLS 服务器（fixture 证书），不连外网。
 * watch API 依赖宿主 cap.kv 桥（无宿主环境会桥降级），此处只验证「返回可预期的错误」
 * 而非数据正确性（watch 数据正确性在真宿主 realbridge 验证）。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
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

// ── hermetic TLS 服务器（自签链：leaf+inter+root）────────────────────────────
const tlsServer = await new Promise((resolve, reject) => {
  const s = https.createServer({ key: fx('chain-leaf.key'), cert: fx('chain-full.pem') }, (req, res) => { res.writeHead(200); res.end('ok'); });
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const tlsPort = tlsServer.address().port;

// ── 拉 service ──────────────────────────────────────────────────────────────
const TOKEN = 'test-token-service-verify';
const child = spawn(process.execPath, [path.join(root, 'service', 'main.js'), '0', ''], {
  env: { ...process.env, CERT_LENS_TEST_TOKEN: TOKEN },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let svcPort = null;
child.stderr.on('data', (d) => {
  const m = String(d).match(/listening on 127\.0\.0\.1:(\d+)/);
  if (m) svcPort = Number(m[1]);
});
await new Promise((resolve, reject) => {
  const t0 = Date.now();
  const poll = setInterval(() => {
    if (svcPort) { clearInterval(poll); resolve(); }
    else if (Date.now() - t0 > 15000) { clearInterval(poll); reject(new Error('service 启动超时')); }
  }, 100);
});

function api(p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1', port: svcPort, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-cert-lens-token': TOKEN },
      timeout: 20000,
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(b) }); }
        catch (e) { reject(new Error(`非 JSON: ${b.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

try {
  // health
  const h = await api('/__health');
  ok('health 200 + version', h.status === 200 && h.json.ok === true && h.json.version === '0.1.0', JSON.stringify(h.json));

  // token 鉴权
  const noauth = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: svcPort, path: '/api/parse', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 }, timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(b) }));
    });
    req.on('error', reject); req.write('{}'); req.end();
  });
  ok('无 token 401', noauth.status === 401, JSON.stringify(noauth.json));

  // parse：good-leaf + 配对 + host 核对
  const p1 = await api('/api/parse', { pem: fx('good-leaf.pem'), key: fx('good-leaf.key'), host: 'good.test' });
  ok('parse 200', p1.status === 200 && p1.json.ok === true, JSON.stringify(p1.json).slice(0, 200));
  ok('parse CN/SAN', p1.json.certs[0].cn === 'good.test' && p1.json.certs[0].san.dns.includes('good.test'));
  ok('parse 配对成功', p1.json.keyMatch && p1.json.keyMatch.matched === true, JSON.stringify(p1.json.keyMatch));
  ok('parse host 匹配体检', p1.json.certs[0].findings.some((f) => f.id === 'san.host-match'));

  // parse：链 + 乱序
  const p2 = await api('/api/parse', { pem: fx('chain-full-mixed.pem') });
  ok('parse 乱序链自动排序', p2.json.chain && p2.json.certs[p2.json.chain.ordered[0]].cn === 'localhost', JSON.stringify(p2.json.chain && p2.json.chain.ordered));

  // parse：垃圾输入 400
  const p3 = await api('/api/parse', { pem: 'garbage no pem' });
  ok('parse 垃圾输入 400 user error', p3.status === 400 && /没有解析出/.test(p3.json.error || ''), JSON.stringify(p3.json));

  // parse：不配对
  const p4 = await api('/api/parse', { pem: fx('good-leaf.pem'), key: fx('unmatched-key.pem') });
  ok('parse 不配对拒绝', p4.json.keyMatch && p4.json.keyMatch.matched === false);

  // probe：hermetic TLS（自签链）
  const pr = await api('/api/probe', { target: `127.0.0.1:${tlsPort}` });
  ok('probe 200', pr.status === 200 && pr.json.ok === true, JSON.stringify(pr.json).slice(0, 200));
  ok('probe 连通+链 3 级', pr.json.connected === true && pr.json.chain.length === 3, `chain=${pr.json.chain.length}`);
  ok('probe 严格校验失败(自签)', pr.json.verified === false && /SELF_SIGNED|UNABLE_TO/.test(pr.json.strict.error.code), JSON.stringify(pr.json.strict));
  ok('probe 诊断非空', pr.json.diagnosis.length > 0, JSON.stringify(pr.json.diagnosis.map((d) => d.id)));
  ok('probe 主机匹配', pr.json.hostMatch.matched === true);

  // probe：错误目标 400
  const pr2 = await api('/api/probe', { target: 'bad:port' });
  ok('probe 非法目标 400', pr2.status === 400);

  // diagnose
  const d1 = await api('/api/diagnose', { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
  ok('diagnose 缺中间证书', d1.json.ok === true && d1.json.rule === 'untrusted-leaf', JSON.stringify(d1.json.rule));
  const d2 = await api('/api/diagnose', { text: 'NET::ERR_CERT_COMMON_NAME_INVALID' });
  ok('diagnose 浏览器文本', d2.json.rule === 'hostname-mismatch', d2.json.rule);
  const d3 = await api('/api/diagnose', {});
  ok('diagnose 空输入 400', d3.status === 400);

  // watch：无宿主 kv 桥降级（返回 500/400 或降级信息，都必须是可预期 JSON）
  const w1 = await api('/api/watch/add', { target: `127.0.0.1:${tlsPort}` });
  const wDegraded = w1.status === 200 || w1.status === 400 || w1.status === 500;
  ok('watch/add 无宿主时行为可预期', wDegraded, JSON.stringify(w1.json).slice(0, 160));

  // selftest（试金石走真实 fixture + hermetic 服务器）
  const st = await api('/api/selftest');
  ok('selftest 全通过', st.status === 200 && st.json.fail === 0, `pass=${st.json.pass}/${st.json.total} ${JSON.stringify((st.json.results || []).filter((r) => !r.pass))}`);
} finally {
  tlsServer.close();
  child.kill();
}

const pass = results.filter((r) => r.pass).length;
console.log(`\nservice-verify: ${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
