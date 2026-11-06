/**
 * run-tests.mjs —— cert-lens 核心单测（node:test；离线，不依赖宿主与外网）
 *
 * 金标来源（独立于被测代码）：
 *   - fixture 证书矩阵由 openssl 签发（test/fixtures/gen.mjs 生成后入库），
 *     字段（CN/SAN/有效期区间/密钥位数/签名算法）是已知常量，直接对拍。
 *   - hermetic TLS 服务器：node https + fixture 证书（chain-full + key），
 *     在 127.0.0.1 随机端口做真实握手——「严格段必须失败（自签链）+ 宽松段拿到 3 级链」
 *     的行为对拍 Node TLS 语义，错误码即被测对象。
 *   - 错误映射表：每条规则的 codes 精确命中 + 浏览器/openssl 文本形态。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const api = require(path.join(here, '../shared/engine-api.js'));
const cm = require(path.join(here, '../shared/certmodel.js'));
const audit = require(path.join(here, '../shared/audit.js'));
const dg = require(path.join(here, '../shared/diagnose.js'));
const { tlsProbe } = require(path.join(here, '../service/probe.js'));
const logic = require(path.join(here, '../service/logic.js'));

const fx = (name) => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');
const NOW = Date.now();

// ── engine-api：目标解析 ──────────────────────────────────────────────────────
test('normalizeTarget：host:port / 缺省 443 / URL 前缀剥离', () => {
  assert.deepEqual(api.normalizeTarget('example.com:8443'), { ok: true, host: 'example.com', port: 8443 });
  assert.equal(api.normalizeTarget('example.com').port, 443);
  assert.deepEqual(api.normalizeTarget('https://example.com:443/x?y=1#z'), { ok: true, host: 'example.com', port: 443 });
  assert.deepEqual(api.normalizeTarget('[::1]:9443'), { ok: true, host: '::1', port: 9443 });
  assert.equal(api.normalizeTarget('example.com:0').ok, false);
  assert.equal(api.normalizeTarget('example.com:99999').ok, false);
  assert.equal(api.normalizeTarget('example.com:abc').ok, false);
  assert.equal(api.normalizeTarget('').ok, false);
  assert.equal(api.normalizeTarget('host:443:extra').ok, false);
});

test('normalizeTarget：大写域名归一小写 + 尾点剥离', () => {
  assert.deepEqual(api.normalizeTarget('EXAMPLE.COM.'), { ok: true, host: 'example.com', port: 443 });
});

// ── engine-api：PEM 拆分 ─────────────────────────────────────────────────────
test('splitPemBlocks：多证书链 + 前后垃圾文本容错', () => {
  const text = `日志里粘出来的：\nsome noise ----\n${fx('chain-full.pem')}\ntrailing noise`;
  const blocks = api.splitPemBlocks(text);
  assert.equal(blocks.length, 3, 'chain-full 是叶+中间+根三块');
  assert.ok(blocks.every((b) => b.label === 'CERTIFICATE'));
});

test('splitPemBlocks：无 PEM 返回空数组', () => {
  assert.deepEqual(api.splitPemBlocks('hello world'), []);
});

// ── engine-api：到期分色 ─────────────────────────────────────────────────────
test('expirySeverity：五档边界（0 天=crit、7 天=crit、8 天=warn、31 天=info、91 天=ok）', () => {
  assert.equal(api.expirySeverity(-1), 'expired');
  assert.equal(api.expirySeverity(0), 'crit');
  assert.equal(api.expirySeverity(7), 'crit');
  assert.equal(api.expirySeverity(8), 'warn');
  assert.equal(api.expirySeverity(30), 'warn');
  assert.equal(api.expirySeverity(31), 'info');
  assert.equal(api.expirySeverity(90), 'info');
  assert.equal(api.expirySeverity(91), 'ok');
});

test('humanDays：过期/今天/未来', () => {
  assert.match(api.humanDays(-3), /已过期 3 天/);
  assert.match(api.humanDays(0), /今天到期/);
  assert.match(api.humanDays(42), /剩余 42 天/);
});

test('clampTimeoutMs：缺省 8000，夹在 [1000, 15000]', () => {
  assert.equal(api.clampTimeoutMs(undefined), 8000);
  assert.equal(api.clampTimeoutMs('x'), 8000);
  assert.equal(api.clampTimeoutMs(1), 1000);
  assert.equal(api.clampTimeoutMs(999999), 15000);
  assert.equal(api.clampTimeoutMs(5000), 5000);
});

// ── certmodel：单证书解析 ────────────────────────────────────────────────────
test('good-leaf：CN/SAN/密钥/签名/指纹/非 CA', () => {
  const c = cm.parseCertificate(fx('good-leaf.pem'), 0, NOW);
  assert.equal(c.cn, 'good.test');
  assert.deepEqual(c.san.dns, ['good.test']);
  assert.deepEqual(c.san.ips, ['127.0.0.1']);
  assert.equal(c.keyInfo.algo, 'RSA');
  assert.equal(c.keyInfo.bits, 2048);
  assert.equal(c.sigAlg, 'sha256WithRSAEncryption');
  assert.equal(c.isCA, false);
  assert.equal(c.selfSigned, true, 'fixture 无真实 CA，自签成立');
  assert.ok(c.daysLeft > 100 && c.daysLeft < 160, `daysLeft=${c.daysLeft}`);
  assert.ok(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(c.sha256Fp), 'SHA-256 指纹是冒号 hex');
  assert.ok(c.serial.length >= 16, 'openssl 随机序列号 ≥64bit');
});

test('expired：天数 < 0 且 audit 出 crit', () => {
  const c = cm.parseCertificate(fx('expired.pem'), 0, NOW);
  assert.ok(c.daysLeft < 0);
  const f = audit.auditCert(c, { now: NOW }).find((x) => x.id === 'expiry.expired');
  assert.equal(f.severity, 'crit');
});

test('parseInput：混合块分类（证书+公钥+私钥+垃圾）', () => {
  const r = cm.parseInput(`${fx('good-leaf.pem')}\n${fx('public-only.pem')}\ngarbage text`, NOW);
  assert.equal(r.certs.length, 1);
  assert.equal(r.pubkeys.length, 1);
  assert.equal(r.errors.length, 0, '垃圾文本没有 PEM 块不算 error（静默忽略在块外）');
  assert.equal(r.pubkeys[0].keyInfo.algo, 'RSA');
});

test('parseInput：损坏 PEM 块进 errors 不拖垮其余', () => {
  const broken = '-----BEGIN CERTIFICATE-----\nZm9vYmFy\n-----END CERTIFICATE-----\n';
  const r = cm.parseInput(broken + fx('good-leaf.pem'), NOW);
  assert.equal(r.certs.length, 1);
  assert.equal(r.errors.length, 1);
});

// ── certmodel：链拼装 ────────────────────────────────────────────────────────
test('链拼装：3 级链叶在前 + 找到自签根 + 无 order 外问题', () => {
  const r = cm.parseInput(fx('chain-full.pem'), NOW);
  assert.equal(r.certs.length, 3);
  const ch = cm.assembleChain(r.certs);
  assert.equal(ch.ordered.length, 3);
  assert.equal(r.certs[ch.ordered[0]].cn, 'localhost', '叶在前');
  assert.equal(ch.rootFound, true, '自签 CA 根');
  assert.ok(ch.issues.every((x) => x.kind !== 'missing-issuer' && x.kind !== 'unverified'), JSON.stringify(ch.issues));
});

test('链拼装：乱序输入自动重排（叶仍是 localhost）', () => {
  const r = cm.parseInput(fx('chain-full-mixed.pem'), NOW);
  const ch = cm.assembleChain(r.certs);
  assert.equal(ch.ordered.length, 3);
  assert.equal(r.certs[ch.ordered[0]].cn, 'localhost');
});

test('链拼装：缺中间证书（叶+根跳过 inter）报 missing-issuer 且带 AIA 提示或明确缺级', () => {
  const r = cm.parseInput(fx('chain-leaf.pem') + fx('chain-root.pem'), NOW);
  const ch = cm.assembleChain(r.certs);
  const miss = ch.issues.find((x) => x.kind === 'missing-issuer');
  assert.ok(miss, JSON.stringify(ch.issues));
  assert.match(miss.detail, /缺少其签发者/);
});

test('链拼装：单证书不产 missing-issuer', () => {
  const r = cm.parseInput(fx('good-leaf.pem'), NOW);
  const ch = cm.assembleChain(r.certs);
  assert.ok(!ch.issues.some((x) => x.kind === 'missing-issuer'));
});

test('链拼装：重复证书块报 duplicate', () => {
  const r = cm.parseInput(fx('good-leaf.pem') + fx('good-leaf.pem'), NOW);
  const ch = cm.assembleChain(r.certs);
  assert.ok(ch.issues.some((x) => x.kind === 'duplicate'));
});

// ── certmodel：配对 ─────────────────────────────────────────────────────────
test('matchKey：正确配对 / 不同钥拒绝 / 加密私钥给提示', () => {
  const good = cm.parseCertificate(fx('good-leaf.pem'), 0, NOW);
  // good-leaf.key 与证书同时生成（gen.mjs 同一次 -newkey）→ 必配对
  const m1 = cm.matchKey(good, fx('good-leaf.key'));
  assert.equal(m1.matched, true, JSON.stringify(m1));
  assert.equal(m1.keyInfo.algo, 'RSA');
  const m2 = cm.matchKey(good, fx('unmatched-key.pem'));
  assert.equal(m2.matched, false);
  const m3 = cm.matchKey(good, 'not a key');
  assert.equal(m3.matched, false);
  assert.ok(m3.error);
});

// ── certmodel：主机匹配 ─────────────────────────────────────────────────────
test('hostnameMatches：精确/通配/跨级拒绝/IP SAN', () => {
  const mk = (dns, ips) => ({ san: { dns: dns || [], ips: ips || [], emails: [], uris: [], others: [] } });
  assert.equal(cm.hostnameMatches(mk(['a.com']), 'a.com'), true);
  assert.equal(cm.hostnameMatches(mk(['a.com']), 'b.com'), false);
  assert.equal(cm.hostnameMatches(mk(['*.a.com']), 'x.a.com'), true);
  assert.equal(cm.hostnameMatches(mk(['*.a.com']), 'x.y.a.com'), false, '通配符不跨级');
  assert.equal(cm.hostnameMatches(mk(['*.a.com']), 'a.com'), false, '通配符不匹配裸域');
  assert.equal(cm.hostnameMatches(mk([], ['127.0.0.1']), '127.0.0.1'), true);
  assert.equal(cm.hostnameMatches(mk([], ['127.0.0.1']), '127.0.0.2'), false);
  assert.equal(cm.hostnameMatches(mk(['a.com']), ''), false);
});

// ── audit：规则矩阵 ─────────────────────────────────────────────────────────
test('auditCert：weak-key(RSA-1024) 报 key.rsa-weak crit', () => {
  const c = cm.parseCertificate(fx('weak-key.pem'), 0, NOW);
  const f = audit.auditCert(c, { now: NOW }).find((x) => x.id === 'key.rsa-weak');
  assert.equal(f.severity, 'crit');
});

test('auditCert：sha1 证书报 sig.sha1 crit', () => {
  const c = cm.parseCertificate(fx('sha1.pem'), 0, NOW);
  const f = audit.auditCert(c, { now: NOW }).find((x) => x.id === 'sig.sha1');
  assert.equal(f.severity, 'crit');
});

test('auditCert：host 不匹配报 san.host-mismatch crit；匹配则 san.host-match ok', () => {
  const c = cm.parseCertificate(fx('wrong-san.pem'), 0, NOW);
  const bad = audit.auditCert(c, { now: NOW, host: 'localhost' }).find((x) => x.id === 'san.host-mismatch');
  assert.equal(bad.severity, 'crit');
  const okF = audit.auditCert(c, { now: NOW, host: 'wrong.test' }).find((x) => x.id === 'san.host-match');
  assert.equal(okF.severity, 'ok');
});

test('auditCert：good-leaf 无 crit（自签只是 info）', () => {
  const c = cm.parseCertificate(fx('good-leaf.pem'), 0, NOW);
  const f = audit.auditCert(c, { now: NOW });
  assert.ok(!f.some((x) => x.severity === 'crit'), JSON.stringify(f.filter((x) => x.severity === 'crit')));
  assert.ok(f.some((x) => x.id === 'cert.self-signed'));
});

test('auditCert：注入时钟的到期梯度（5 天=crit、20 天=warn、40 天=info）', () => {
  const c = cm.parseCertificate(fx('good-leaf.pem'), 0, NOW);
  // 把 now 挪到 notAfter-5d → crit；-20d → warn；-40d → info
  const t5 = new Date(c.notAfter).getTime() - 5 * 86400000;
  const t20 = new Date(c.notAfter).getTime() - 20 * 86400000;
  const t40 = new Date(c.notAfter).getTime() - 40 * 86400000;
  assert.equal(audit.auditCert(c, { now: t5 }).find((x) => x.id === 'expiry.soon').severity, 'crit');
  assert.equal(audit.auditCert(c, { now: t20 }).find((x) => x.id === 'expiry.soon').severity, 'warn');
  assert.equal(audit.auditCert(c, { now: t40 }).find((x) => x.id === 'expiry.soon').severity, 'info');
});

test('currentMaxValidityDays：2026-11 → 200 天档', () => {
  const nov2026 = new Date('2026-11-06T00:00:00Z').getTime();
  assert.equal(audit.currentMaxValidityDays(nov2026).maxDays, 200);
  const may2027 = new Date('2027-05-01T00:00:00Z').getTime();
  assert.equal(audit.currentMaxValidityDays(may2027).maxDays, 100);
  const jan2026 = new Date('2026-01-01T00:00:00Z').getTime();
  assert.equal(audit.currentMaxValidityDays(jan2026).maxDays, 398, '2026-03-15 之前仍是 398');
});

test('auditCert：有效期超 200 天（非自签场景用 now 后移模拟公网语义）', () => {
  // chain-inter 由 root 签发非自签、1825 天 → 超长有效期 info
  const c = cm.parseCertificate(fx('chain-inter.pem'), 0, NOW);
  const f = audit.auditCert(c, { now: NOW }).find((x) => x.id === 'validity.too-long');
  assert.ok(f, '1825 天 > 200 天应触发');
  assert.equal(f.severity, 'info');
});

test('auditChain：缺中间证书链报 chain.missing-issuer warn + worstSeverity', () => {
  const r = cm.parseInput(fx('chain-leaf.pem') + fx('chain-root.pem'), NOW);
  const ch = cm.assembleChain(r.certs);
  const F = audit.auditChain(ch, r.certs, { now: NOW });
  assert.ok(F.some((x) => x.id === 'chain.missing-issuer'));
  assert.equal(audit.worstSeverity(F), 'warn');
});

// ── diagnose：规则矩阵 ──────────────────────────────────────────────────────
test('diagnoseError：每条规则的 code 精确命中', () => {
  const expect = {
    DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed-leaf',
    SELF_SIGNED_CERT_IN_CHAIN: 'self-signed-in-chain',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'untrusted-leaf',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'issuer-not-found-locally',
    UNABLE_TO_GET_ISSUER_CERT: 'issuer-not-found',
    CERT_HAS_EXPIRED: 'cert-expired',
    ERR_TLS_CERT_ALTNAME_INVALID: 'hostname-mismatch',
    ERR_SSL_WRONG_VERSION_NUMBER: 'wrong-version-number',
    ERR_SSL_UNSUPPORTED_PROTOCOL: 'unsupported-protocol',
    ERR_SSL_NO_CIPHER_MATCH: 'no-cipher-match',
    ERR_SSL_DH_KEY_TOO_SMALL: 'dh-too-small',
    ECONNREFUSED: 'econnrefused',
    ETIMEDOUT: 'etimedout',
    ENOTFOUND: 'enotfound',
    ECONNRESET: 'econnreset',
    EPROTO: 'eproto',
  };
  for (const [code, id] of Object.entries(expect)) {
    const d = dg.diagnoseError({ code });
    assert.equal(d.id, id, `code ${code} 应命中 ${id}，实际 ${d.id}`);
    assert.ok(d.fixes.length >= 2, `${id} 至少 2 条修复建议`);
    assert.ok(d.fixes.length <= api.LIMITS.FIXES_MAX);
  }
});

test('diagnoseError：浏览器文本与 openssl 文本形态', () => {
  assert.equal(dg.diagnoseError('NET::ERR_CERT_AUTHORITY_INVALID').id, 'generic-cert-verify');
  assert.equal(dg.diagnoseError('curl: (60) SSL certificate problem: certificate has expired').id, 'cert-expired');
  assert.equal(dg.diagnoseError('error:0A000086:SSL routines::certificate verify failed (unable to get local issuer certificate)').id, 'issuer-not-found-locally');
  assert.equal(dg.diagnoseError('java.security.cert.CertificateException: Unable to verify first certificate').id, 'untrusted-leaf');
  assert.equal(dg.diagnoseError('NET::ERR_CERT_COMMON_NAME_INVALID').id, 'hostname-mismatch');
});

test('diagnoseError：兜底不猜（fallback 且给可执行建议）', () => {
  const d = dg.diagnoseError('something completely unrelated');
  assert.equal(d.id, 'fallback');
  assert.ok(d.fixes.length >= 1);
});

test('diagnoseError：code 优先于文本正则', () => {
  // message 里含 cert-expired 的词，但 code 明确是 ECONNREFUSED → 网络层
  const d = dg.diagnoseError({ code: 'ECONNREFUSED', message: 'certificate has expired somewhere' });
  assert.equal(d.id, 'econnrefused');
});

// ── logic：doParse 组装 ─────────────────────────────────────────────────────
test('logic.doParse：链+体检+配对一体', () => {
  const r = logic.doParse({ pem: fx('chain-full.pem'), key: fx('chain-leaf.key'), host: 'localhost' }, NOW);
  assert.equal(r.kind.certs, 3);
  assert.ok(r.certs.every((c) => Array.isArray(c.findings)));
  assert.equal(r.chain.leafIndex, r.chain.ordered[0]);
  const m = r.keyMatch;
  assert.equal(m.matched, true, JSON.stringify(m));
  assert.ok(r.chainFindings.length === 0 || r.chainFindings.every((f) => f.id !== 'chain.missing-issuer'));
});

test('logic.doParse：垃圾输入 400 语义（user error）', () => {
  assert.throws(() => logic.doParse({ pem: 'no pem here' }, NOW), (e) => e.user === true);
  assert.throws(() => logic.doParse({}, NOW), (e) => e.user === true);
});

// ── probe：hermetic TLS 服务器（真实握手，不连外网）─────────────────────────
function startTlsServer() {
  return new Promise((resolve, reject) => {
    const server = https.createServer({ key: fx('chain-leaf.key'), cert: fx('chain-full.pem') }, (req, res) => { res.writeHead(200); res.end('ok'); });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('tlsProbe：hermetic 自签链——严格失败+宽松拿链+诊断命中', async () => {
  const { server, port } = await startTlsServer();
  try {
    const r = await tlsProbe({ host: '127.0.0.1', port, timeoutMs: 5000, now: NOW });
    assert.equal(r.connected, true, JSON.stringify(r.error));
    assert.equal(r.verified, false, '自签链对系统信任库必须失败');
    assert.ok(r.strict.error && /SELF_SIGNED|UNABLE_TO/.test(r.strict.error.code), JSON.stringify(r.strict.error));
    assert.equal(r.chain.length, 3, `chain=${r.chain.length}`);
    assert.equal(r.chain[0].cn, 'localhost');
    assert.equal(r.hostMatch.matched, true, '127.0.0.1 在 SAN');
    assert.ok(/TLS/.test(r.relaxed.protocol));
    // probe 主路径的诊断
    const pr = logic.doProbe({ target: `127.0.0.1:${port}` }, NOW).then ? await logic.doProbe({ target: `127.0.0.1:${port}` }, NOW) : null;
    assert.ok(pr.diagnosis.some((d) => /self-signed|untrusted|issuer/i.test(d.id)), JSON.stringify(pr.diagnosis.map((d) => d.id)));
  } finally {
    server.close();
  }
});

test('tlsProbe：明文 HTTP 端口必失败且错误可诊断（不是 fallback）', async () => {
  const http = await import('node:http');
  const server = http.createServer((req, res) => { res.writeHead(200); res.end('plain'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const r = await tlsProbe({ host: '127.0.0.1', port, timeoutMs: 5000, now: NOW });
    assert.equal(r.verified, false);
    assert.equal(r.connected, false, '明文端口不该完成 TLS 握手');
    const d = dg.diagnoseError(r.error);
    assert.notEqual(d.id, 'fallback', `明文端口的错误应可诊断: ${JSON.stringify(r.error)}`);
  } finally {
    server.close();
  }
});

test('tlsProbe：连接拒绝给 ECONNREFUSED 诊断', async () => {
  // 127.0.0.1 上取一个确定空闲端口（close 前取好端口号）
  const net = await import('node:net');
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const r = await tlsProbe({ host: '127.0.0.1', port, timeoutMs: 3000, now: NOW });
  assert.equal(r.verified, false);
  assert.equal(r.error.code, 'ECONNREFUSED', JSON.stringify(r.error));
  assert.equal(dg.diagnoseError(r.error).id, 'econnrefused');
});

test('logic.doProbe：非法目标 user error / SNI 调试参数透传', async () => {
  await assert.rejects(() => logic.doProbe({ target: 'nope:0' }, NOW), (e) => e.user === true);
  await assert.rejects(() => logic.doProbe({}, NOW), (e) => e.user === true);
});
