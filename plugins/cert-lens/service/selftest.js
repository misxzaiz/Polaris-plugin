'use strict';
/**
 * selftest.js —— cert-lens 试金石（service /api/selftest 与 MCP cert_selftest 同一实现）
 * fixture PEM 随包分发（service/fixtures/），断言矩阵与 test/run-tests.mjs 的
 * 离线单测互补：这里偏「部署环境真实可用」（本地 hermetic TLS 服务器全链路握手）。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const certmodel = require('../shared/certmodel.js');
const audit = require('../shared/audit.js');
const { diagnoseError } = require('../shared/diagnose.js');
const { tlsProbe } = require('./probe.js');

function fixturePem(name) {
  // 双 bundle 复用：service/main.js 时 __dirname=service/；mcp/server.js 时 __dirname=mcp/（zip 内 ../service/fixtures）
  const cands = [path.join(__dirname, 'fixtures', name), path.join(__dirname, '..', 'service', 'fixtures', name)];
  for (const f of cands) {
    try { return fs.readFileSync(f, 'utf8'); } catch (_) { /* 试下一候选 */ }
  }
  throw new Error(`fixture 不存在：${name}（查找 ${cands.join(' / ')}）`);
}

async function doSelftest() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: Boolean(cond), detail: String(detail || '').slice(0, 160) });
  const now = Date.now();
  const cm = certmodel;

  // 1) 正常证书解析
  try {
    const good = cm.parseCertificate(fixturePem('good-leaf.pem'), 0, now);
    ok('good-leaf 解析 CN/SAN', good.cn === 'good.test' && good.san.dns.includes('good.test') && good.san.ips.includes('127.0.0.1'), `${good.cn} ${good.san.dns.join(',')}`);
    ok('good-leaf 剩余天数合理', good.daysLeft > 100 && good.daysLeft < 160, `daysLeft=${good.daysLeft}`);
    ok('good-leaf 密钥 RSA-2048', good.keyInfo.algo === 'RSA' && good.keyInfo.bits === 2048, JSON.stringify(good.keyInfo));
    ok('good-leaf 签名 SHA-256', /sha256/i.test(good.sigAlg || ''), good.sigAlg);
  } catch (e) { ok('good-leaf 解析', false, e.message); }
  // 2) 过期证书
  try {
    const exp = cm.parseCertificate(fixturePem('expired.pem'), 0, now);
    ok('expired 判定过期', exp.daysLeft < 0, `daysLeft=${exp.daysLeft}`);
    const f = audit.auditCert(exp, { now }).find((x) => x.id === 'expiry.expired');
    ok('expired 体检 crit', f && f.severity === 'crit', f && f.title);
  } catch (e) { ok('expired 判定', false, e.message); }
  // 3) 链拼装（正确序 + 乱序）
  try {
    const full = cm.parseInput(fixturePem('chain-full.pem'), now);
    const ch = cm.assembleChain(full.certs);
    ok('链拼装 3 张有序', ch.ordered.length === 3 && ch.issues.filter((x) => x.kind !== 'order').length === 0, JSON.stringify(ch.ordered));
    ok('链找到自签根', ch.rootFound === true, `rootFound=${ch.rootFound}`);
  } catch (e) { ok('链拼装', false, e.message); }
  try {
    const mixed = cm.parseInput(fixturePem('chain-full-mixed.pem'), now);
    const ch2 = cm.assembleChain(mixed.certs);
    ok('乱序链自动排序', ch2.ordered.length === 3 && mixed.certs[ch2.ordered[0]].cn === 'localhost', JSON.stringify(ch2.ordered));
  } catch (e) { ok('乱序链', false, e.message); }
  // 4) 配对
  try {
    const good = cm.parseCertificate(fixturePem('good-leaf.pem'), 0, now);
    const m1 = cm.matchKey(good, fixturePem('unmatched-key.pem'));
    ok('不配对私钥被拒', m1.matched === false, m1.error || '');
  } catch (e) { ok('配对(不匹配)', false, e.message); }
  // 5) 错误映射
  const d1 = diagnoseError({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
  ok('错误映射: 缺中间证书', d1.id === 'untrusted-leaf', d1.id);
  const d2 = diagnoseError('NET::ERR_CERT_COMMON_NAME_INVALID');
  ok('错误映射: 浏览器 SAN 报错', d2.id === 'hostname-mismatch', d2.id);
  const d3 = diagnoseError('ECONNREFUSED 127.0.0.1:443');
  ok('错误映射: 连接拒绝', d3.id === 'econnrefused', d3.id);
  // 6) hermetic TLS 服务器全链路（链: leaf+inter+root；SAN=localhost,127.0.0.1）
  let server = null;
  try {
    const fullChain = fixturePem('chain-full.pem');
    const key = fixturePem('chain-leaf.key');
    await new Promise((resolve, reject) => {
      server = https.createServer({ key, cert: fullChain }, (req, res) => { res.writeHead(200); res.end('ok'); });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    const probe = await tlsProbe({ host: '127.0.0.1', port, timeoutMs: 5000, now });
    ok('hermetic 握手连通', probe.connected === true, JSON.stringify(probe.error));
    ok('hermetic 链 3 张', probe.chain.length === 3, `chain=${probe.chain.length}`);
    ok('hermetic 严格校验失败(自签链)', probe.verified === false && probe.strict.error && /SELF_SIGNED|UNABLE_TO/.test(probe.strict.error.code), JSON.stringify(probe.strict.error));
    ok('hermetic 协议识别', /TLS/.test(String(probe.relaxed && probe.relaxed.protocol)), String(probe.relaxed && probe.relaxed.protocol));
    const dm = diagnoseError(probe.strict.error);
    ok('hermetic 错误可诊断', dm.id !== 'fallback', dm.id);
  } catch (e) {
    ok('hermetic 服务器', false, e.message);
  } finally {
    if (server) { try { server.close(); } catch (_) { /* ignore */ } }
  }
  // 7) host 匹配
  try {
    const leaf = cm.parseCertificate(fixturePem('chain-leaf.pem'), 0, now);
    ok('host 匹配 localhost', cm.hostnameMatches(leaf, 'localhost') === true);
    ok('host 匹配 127.0.0.1', cm.hostnameMatches(leaf, '127.0.0.1') === true);
    ok('host 不匹配 other', cm.hostnameMatches(leaf, 'other.test') === false);
    ok('通配符匹配', cm.hostnameMatches({ san: { dns: ['*.example.com'], ips: [], emails: [], uris: [], others: [] } }, 'a.example.com') === true);
    ok('通配符不跨级', cm.hostnameMatches({ san: { dns: ['*.example.com'], ips: [], emails: [], uris: [], others: [] } }, 'a.b.example.com') === false);
  } catch (e) { ok('host 匹配', false, e.message); }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  return { pass, fail, total: results.length, results };
}

module.exports = { doSelftest, fixturePem };
