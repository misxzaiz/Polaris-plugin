/**
 * 离线单测（零依赖零网络）：node test/run-tests.mjs
 * 覆盖：目标校验矩阵（URL/方法/headers/body/数值护栏/托管头拒绝）、敏感头掩码、
 *       目标圈层判定、实时分位窗口、报告摘要（分位/状态码/样本裁剪）、
 *       中文结论派生规则、A/B 对比方向语义。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/bench-core.js');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── sanitizeTarget：URL ─────────────────────────────────────────────────────
await t('URL：正常 http 通过并归一', () => {
  const r = core.sanitizeTarget({ url: 'http://127.0.0.1:8080/api' });
  assert.ok(r.ok);
  assert.strictEqual(r.value.url, 'http://127.0.0.1:8080/api');
});
await t('URL：https 通过', () => {
  const r = core.sanitizeTarget({ url: 'https://api.example.com/v1/users' });
  assert.ok(r.ok);
});
await t('URL：ftp/file 协议拒绝', () => {
  for (const u of ['ftp://x.com/a', 'file:///C:/x', 'ws://x.com']) {
    const r = core.sanitizeTarget({ url: u });
    assert.strictEqual(r.ok, false, u);
  }
});
await t('URL：无法解析拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'not a url' }).ok, false);
});
await t('URL：缺 host 拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'http://' }).ok, false);
});
await t('URL：缺失拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({}).ok, false);
});
await t('URL：超长拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: `http://x.com/${'a'.repeat(3000)}` }).ok, false);
});

// ── sanitizeTarget：method ──────────────────────────────────────────────────
await t('method：小写归一大写', () => {
  const r = core.sanitizeTarget({ url: 'http://x.com', method: 'post' });
  assert.ok(r.ok);
  assert.strictEqual(r.value.method, 'POST');
});
await t('method：非法字符拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', method: 'GET;' }).ok, false);
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', method: 'DROP TABLE' }).ok, false);
});

// ── sanitizeTarget：headers ─────────────────────────────────────────────────
await t('headers：正常对象通过', () => {
  const r = core.sanitizeTarget({ url: 'http://x.com', headers: { 'X-Test': '1', 'content-type': 'application/json' } });
  assert.ok(r.ok);
  assert.strictEqual(r.value.headers['X-Test'], '1');
});
await t('headers：托管头 host/content-length/connection 拒绝', () => {
  for (const h of [{ host: 'x.com' }, { 'content-length': '10' }, { connection: 'keep-alive' }]) {
    const r = core.sanitizeTarget({ url: 'http://x.com', headers: h });
    assert.strictEqual(r.ok, false, JSON.stringify(h));
  }
});
await t('headers：非对象拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', headers: 'a: b' }).ok, false);
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', headers: ['a'] }).ok, false);
});
await t('headers：header 名带空格/控制符拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', headers: { 'bad name': 'v' } }).ok, false);
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', headers: { 'a\tb': 'v' } }).ok, false);
});

// ── sanitizeTarget：body ────────────────────────────────────────────────────
await t('body：GET 携带 body 拒绝', () => {
  const r = core.sanitizeTarget({ url: 'http://x.com', method: 'GET', body: '{"a":1}' });
  assert.strictEqual(r.ok, false);
});
await t('body：HEAD 携带 body 拒绝', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'http://x.com', method: 'HEAD', body: 'x' }).ok, false);
});
await t('body：POST 对象自动 JSON 序列化', () => {
  const r = core.sanitizeTarget({ url: 'http://x.com', method: 'POST', body: { a: 1 } });
  assert.ok(r.ok);
  assert.strictEqual(r.value.body, '{"a":1}');
  assert.strictEqual(r.value.bodyBytes, 7);
});
await t('body：超过 1MB 拒绝', () => {
  const r = core.sanitizeTarget({ url: 'http://x.com', method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) });
  assert.strictEqual(r.ok, false);
});

// ── sanitizeTarget：数值护栏 ────────────────────────────────────────────────
await t('护栏：connections 超上限钳制到 1000', () => {
  const r = core.sanitizeTarget({ url: 'http://127.0.0.1:1', connections: 99999 });
  assert.ok(r.ok);
  assert.strictEqual(r.value.connections, 1000);
});
await t('护栏：connections 0/负数钳制到 1', () => {
  const r = core.sanitizeTarget({ url: 'http://127.0.0.1:1', connections: 0 });
  assert.ok(r.ok);
  assert.strictEqual(r.value.connections, 1);
});
await t('护栏：durationS 钳制 1~300 并默认 10', () => {
  const r0 = core.sanitizeTarget({ url: 'http://127.0.0.1:1' });
  assert.strictEqual(r0.value.durationS, 10);
  const r1 = core.sanitizeTarget({ url: 'http://127.0.0.1:1', durationS: 99999 });
  assert.strictEqual(r1.value.durationS, 300);
  const r2 = core.sanitizeTarget({ url: 'http://127.0.0.1:1', durationS: -5 });
  assert.strictEqual(r2.value.durationS, 1);
});
await t('护栏：rate 越界拒绝、合法通过', () => {
  assert.strictEqual(core.sanitizeTarget({ url: 'http://127.0.0.1:1', rate: 0 }).ok, false);
  assert.strictEqual(core.sanitizeTarget({ url: 'http://127.0.0.1:1', rate: 2000000 }).ok, false);
  const r = core.sanitizeTarget({ url: 'http://127.0.0.1:1', rate: 500 });
  assert.ok(r.ok);
  assert.strictEqual(r.value.rate, 500);
});
await t('护栏：timeoutS 0.5~60', () => {
  const r = core.sanitizeTarget({ url: 'http://127.0.0.1:1', timeoutS: 0.5 });
  assert.strictEqual(r.value.timeoutS, 0.5);
  const r2 = core.sanitizeTarget({ url: 'http://127.0.0.1:1', timeoutS: 61 });
  assert.strictEqual(r2.value.timeoutS, 60);
});
await t('默认值：面板设置作为 defaults 生效', () => {
  const r = core.sanitizeTarget({ url: 'http://127.0.0.1:1' }, { connections: 25, durationS: 8, timeoutS: 5 });
  assert.strictEqual(r.value.connections, 25);
  assert.strictEqual(r.value.durationS, 8);
  assert.strictEqual(r.value.timeoutS, 5);
});

// ── 敏感头掩码 ──────────────────────────────────────────────────────────────
await t('掩码：authorization 掩为 ****后4位', () => {
  const m = core.maskHeaders({ Authorization: 'Bearer abcdef1234', 'Content-Type': 'application/json' });
  assert.strictEqual(m.Authorization, '****1234');
  assert.strictEqual(m['Content-Type'], 'application/json');
});
await t('掩码：大小写不敏感覆盖全部敏感头名单', () => {
  for (const h of ['authorization', 'COOKIE', 'proxy-authorization', 'x-api-key', 'x-auth-token']) {
    const m = core.maskHeaders({ [h]: 'secretvalue99' });
    assert.strictEqual(m[h], '****ue99', h);
  }
});
await t('掩码：短值全掩码', () => {
  assert.strictEqual(core.maskHeaders({ authorization: 'abc' }).authorization, '****');
});

// ── 圈层判定 ────────────────────────────────────────────────────────────────
await t('圈层：loopback/private/public 判定', () => {
  assert.strictEqual(core.scopeOf('http://127.0.0.1:8080/x'), 'loopback');
  assert.strictEqual(core.scopeOf('http://localhost:3000/x'), 'loopback');
  assert.strictEqual(core.scopeOf('http://192.168.1.5/x'), 'private');
  assert.strictEqual(core.scopeOf('http://10.0.0.2/x'), 'private');
  assert.strictEqual(core.scopeOf('http://172.16.0.1/x'), 'private');
  assert.strictEqual(core.scopeOf('http://172.32.0.1/x'), 'public');
  assert.strictEqual(core.scopeOf('http://nas.local/x'), 'private');
  assert.strictEqual(core.scopeOf('https://api.example.com/x'), 'public');
});

// ── 实时分位窗口 ────────────────────────────────────────────────────────────
await t('分位：最近邻秩计算', () => {
  const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.strictEqual(core.percentileOf(arr, 50), 50);
  assert.strictEqual(core.percentileOf(arr, 90), 90);
  assert.strictEqual(core.percentileOf([], 50), null);
});
await t('窗口：只取 windowMs 内样本', () => {
  const now = 100000;
  const ring = [
    { t: now - 10000, v: 999 },
    { t: now - 1000, v: 10 },
    { t: now - 500, v: 20 },
    { t: now - 100, v: 30 },
  ];
  const w = core.windowPercentiles(ring, 5000, now);
  assert.strictEqual(w.count, 3);
  assert.strictEqual(w.mean, 20);
});
await t('窗口：空样本返回 null', () => {
  assert.strictEqual(core.windowPercentiles([{ t: 1, v: 5 }], 1000, 100000), null);
});

// ── summarize ───────────────────────────────────────────────────────────────
const fakeResult = {
  duration: 3.02,
  statusCodeStats: { 200: { count: 300 }, 500: { count: 10 } },
  '1xx': 0, '2xx': 300, '3xx': 0, '4xx': 5, '5xx': 10,
  non2xx: 15,
  errors: 2, timeouts: 1, mismatches: 0, resets: 0,
  latency: { mean: 33, stddev: 5, min: 10, max: 99, p50: 30, p75: 35, p90: 45, p97_5: 60, p99: 80, p99_9: 95 },
  requests: { mean: 102.34, sent: 320, total: 315 },
  throughput: { mean: 20480, total: 61440 },
};
await t('summarize：分位/状态码/吞吐映射', () => {
  const s = core.summarize(fakeResult, [], { durationS: 3, connections: 10, timeoutS: 10, rate: null, url: 'http://x', method: 'GET', headers: {}, scope: 'loopback', pipelining: 1, bodyBytes: 0 }, false);
  assert.strictEqual(s.rpsMean, 102.3);
  assert.strictEqual(s.totalRequests, 315);
  assert.strictEqual(s.latencies.p97_5, 60);
  assert.strictEqual(s.statusDist['200'], 300);
  assert.strictEqual(s.non2xxPct, 4.8);
  assert.strictEqual(s.bytesMean, 20480);
});
await t('summarize：样本裁剪到 reportSamplesKeep', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ t: i, rps: 1, bytes: 2, latMean: 3, latP97_5: 4, errs: 0 }));
  const s = core.summarize(fakeResult, many, { durationS: 3, connections: 10, timeoutS: 10, rate: null, url: 'http://x', method: 'GET', headers: {}, scope: 'loopback', pipelining: 1, bodyBytes: 0 }, false);
  assert.ok(s.samples.length <= core.LIMITS.reportSamplesKeep);
});

// ── verdictOf ───────────────────────────────────────────────────────────────
const targetOk = { durationS: 3, connections: 10, timeoutS: 10, rate: null, url: 'http://127.0.0.1:1', method: 'GET', headers: {}, scope: 'loopback', pipelining: 1, bodyBytes: 0 };
await t('结论：全绿给稳定文案', () => {
  const s = core.summarize({ ...fakeResult, errors: 0, timeouts: 0, non2xx: 0, statusCodeStats: { 200: { count: 300 } }, '4xx': 0, '5xx': 0 }, [], targetOk, false);
  const v = core.verdictOf(s, targetOk);
  assert.ok(v.oneLine.includes('/s'));
  assert.ok(v.notes.some((n) => n.includes('稳定')));
  assert.strictEqual(v.notes.length, 1);
});
await t('结论：超时/错误/非2xx 各出一行', () => {
  const s = core.summarize(fakeResult, [], targetOk, false);
  const v = core.verdictOf(s, targetOk);
  assert.ok(v.notes.some((n) => n.includes('超时')));
  assert.ok(v.notes.some((n) => n.includes('连接/请求错误')));
  assert.ok(v.notes.some((n) => n.includes('非 2xx')));
});
await t('结论：公网目标提示授权', () => {
  const s = core.summarize(fakeResult, [], { ...targetOk, scope: 'public' }, false);
  const v = core.verdictOf(s, { ...targetOk, scope: 'public' });
  assert.ok(v.notes.some((n) => n.includes('授权')));
});
await t('结论：限速提示', () => {
  const s = core.summarize(fakeResult, [], { ...targetOk, rate: 100 }, false);
  const v = core.verdictOf(s, { ...targetOk, rate: 100 });
  assert.ok(v.notes.some((n) => n.includes('限速')));
});
await t('结论：中止提示', () => {
  const s = core.summarize(fakeResult, [], targetOk, true);
  const v = core.verdictOf(s, targetOk);
  assert.ok(v.notes.some((n) => n.includes('中止')));
});

// ── compareReports 方向语义 ─────────────────────────────────────────────────
const mkReport = (rps, p50, p97_5, p99, mean, errs, non2xx) => ({
  runId: 'x',
  summary: { rpsMean: rps, errors: errs, timeouts: 0, non2xx },
  latencies: { p50, p97_5, p99, mean },
});
await t('对比：B 吞吐升/延迟降 → B 胜（错误项双方为 0 判 na）', () => {
  const a = mkReport(100, 50, 80, 100, 55, 0, 0);
  const b = mkReport(150, 30, 50, 70, 35, 0, 0);
  const cmp = core.compareReports(a, b);
  assert.strictEqual(cmp.bWins, 5);
  assert.strictEqual(cmp.aWins, 0);
  assert.strictEqual(cmp.rows.find((r) => r.key === 'errors').better, 'na');
  const rpsRow = cmp.rows.find((r) => r.key === 'rpsMean');
  assert.strictEqual(rpsRow.deltaPct, 50);
  const p50Row = cmp.rows.find((r) => r.key === 'lat.p50');
  assert.strictEqual(p50Row.deltaPct, -40);
});
await t('对比：错误数纳入方向语义（降为优）', () => {
  const a = mkReport(100, 50, 80, 100, 55, 5, 10);
  const b = mkReport(100, 50, 80, 100, 55, 0, 0);
  const cmp = core.compareReports(a, b);
  const errRow = cmp.rows.find((r) => r.key === 'errors');
  assert.strictEqual(errRow.better, 'b');
  const n2Row = cmp.rows.find((r) => r.key === 'non2xx');
  assert.strictEqual(n2Row.better, 'b');
});
await t('对比：A 为 0 时 delta 为 n/a 且判 na', () => {
  const a = mkReport(0, 0, 0, 0, 0, 0, 0);
  const b = mkReport(100, 50, 80, 100, 55, 0, 0);
  const cmp = core.compareReports(a, b);
  assert.strictEqual(cmp.rows.find((r) => r.key === 'rpsMean').better, 'na');
});
await t('对比：完全相同 → 吞吐延迟 5 项 tie、0 值项 na', () => {
  const a = mkReport(100, 50, 80, 100, 55, 0, 0);
  const cmp = core.compareReports(a, a);
  assert.strictEqual(cmp.ties, 5);
  assert.strictEqual(cmp.rows.filter((r) => r.better === 'na').length, 2);
});

// ── 格式化 ──────────────────────────────────────────────────────────────────
await t('格式化：fmtMs/fmtRate/fmtBytes 分档', () => {
  assert.strictEqual(core.fmtMs(5.2), '5.2ms');
  assert.strictEqual(core.fmtMs(123.4), '123ms');
  assert.strictEqual(core.fmtMs(15000), '15.0s');
  assert.strictEqual(core.fmtRate(1500), '1500/s');
  assert.strictEqual(core.fmtRate(25000), '25k/s');
  assert.strictEqual(core.fmtBytes(512), '512B/s');
  assert.strictEqual(core.fmtBytes(2048), '2.0KB/s');
  assert.strictEqual(core.fmtBytes(3 * 1024 * 1024), '3.0MB/s');
});

// ── 汇总 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const r of results) {
  if (r.pass) pass++;
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
}
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
