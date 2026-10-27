/**
 * 离线单元测试（node test/run-tests.mjs，不需要 Polaris 在跑）
 *
 * 覆盖 service/lib.js 全部纯逻辑：设置/目标规范化、命令校验、分钟聚合、
 * 小时桶操作、保留清扫计划、在线判定、连接错误分类、事件状态机
 * （断网/恢复/失联/劣化/限频）、网关三平台解析、SSRF 守卫、展示辅助。
 */
import assert from 'node:assert/strict';
import lib from '../service/lib.js';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};
const pending = [];
const t = (name, fn) => {
  try { fn(); record(name, true); } catch (e) { record(name, false, e.message); }
};
const ta = (name, fn) => {
  // 异步用例先登记再统一等待，保证汇总在全部用例结束后输出
  pending.push(
    (async () => {
      try { await fn(); record(name, true); } catch (e) { record(name, false, e.message); }
    })(),
  );
};

// ── normalizeSettings ──────────────────────────────────────────────────────
t('settings: 越界回落边界值', () => {
  const s = lib.normalizeSettings({ tickSec: 999, timeoutMs: 1, latencyMs: 99999, sustainRounds: 0, retentionHours: 99999, speedMb: 100 });
  assert.equal(s.tickSec, 120);
  assert.equal(s.timeoutMs, 1000);
  assert.equal(s.latencyMs, 10000);
  assert.equal(s.sustainRounds, 2);
  assert.equal(s.retentionHours, 2160);
  assert.equal(s.speedMb, 25);
});
t('settings: 脏值回落默认', () => {
  const s = lib.normalizeSettings({ tickSec: 'abc', paused: 'yes' });
  assert.equal(s.tickSec, 10);
  assert.equal(s.paused, false);
  assert.equal(s.speedUrl, '');
});
t('settings: speedUrl 截断 300', () => {
  const s = lib.normalizeSettings({ speedUrl: 'x'.repeat(400) });
  assert.equal(s.speedUrl.length, 300);
});

// ── normalizeTarget / normalizeTargets ────────────────────────────────────
t('target: 合法站点目标', () => {
  const t1 = lib.normalizeTarget({ label: '我的NAS', host: 'nas.local', port: 5000, kind: 'normal' });
  assert.ok(!t1.error);
  assert.equal(t1.label, '我的NAS');
  assert.equal(t1.port, 5000);
  assert.equal(t1.enabled, true);
  assert.ok(t1.id.length > 0);
});
t('target: host 非法拒绝', () => {
  assert.ok(lib.normalizeTarget({ host: 'bad host!', port: 80 }).error);
  assert.ok(lib.normalizeTarget({ host: 'a..b', port: 80 }).error);
  assert.ok(lib.normalizeTarget({ host: '', port: 80 }).error);
});
t('target: port 越界拒绝', () => {
  assert.ok(lib.normalizeTarget({ host: 'a.com', port: 0 }).error);
  assert.ok(lib.normalizeTarget({ host: 'a.com', port: 70000 }).error);
  assert.ok(lib.normalizeTarget({ host: 'a.com', port: 'x' }).error);
});
t('target: gateway 允许空 host（自动发现）', () => {
  const g = lib.normalizeTarget({ label: '网关', host: '', port: 80, kind: 'gateway' });
  assert.ok(!g.error);
  assert.equal(g.host, '');
});
t('target: 大写 host 归一化 + 非法 kind 回 normal', () => {
  const x = lib.normalizeTarget({ host: 'GitHub.COM', port: 443, kind: 'weird' });
  assert.equal(x.host, 'github.com');
  assert.equal(x.kind, 'normal');
});
t('targets: 列表去重 id + 上限 12', () => {
  const one = { label: 'a', host: 'a.com', port: 80, kind: 'normal' };
  const a = lib.normalizeTarget(one);
  const list = lib.normalizeTargets({ targets: [one, one, { ...one, id: a.id }] });
  assert.equal(list.targets.length, 1);
  const twelve = Array.from({ length: 20 }, (_, i) => lib.normalizeTarget({ host: `h${i}.com`, port: 80 }));
  assert.equal(lib.normalizeTargets(twelve).targets.length, 12);
});
t('targets: 坏条目丢弃不致命', () => {
  const list = lib.normalizeTargets({ targets: [{ host: 'ok.com', port: 80 }, { host: 'x', port: 0 }, null] });
  assert.equal(list.targets.length, 1);
});

// ── normalizeTargetsCmd / normalizeSpeedCmd ───────────────────────────────
t('targetsCmd: add 校验目标', () => {
  assert.ok(lib.normalizeTargetsCmd({ action: 'add', target: { host: 'bad host', port: 80 } }).error);
  const okCmd = lib.normalizeTargetsCmd({ action: 'add', target: { host: 'ok.com', port: 443 } });
  assert.equal(okCmd.action, 'add');
  assert.equal(okCmd.target.host, 'ok.com');
});
t('targetsCmd: remove 需要 id', () => {
  assert.ok(lib.normalizeTargetsCmd({ action: 'remove' }).error);
  assert.equal(lib.normalizeTargetsCmd({ action: 'remove', id: 'x-1' }).id, 'x-1');
  assert.ok(lib.normalizeTargetsCmd({ action: 'nuke' }).error);
});
t('speedCmd: 缺 confirm 拒绝', () => {
  assert.ok(lib.normalizeSpeedCmd({ mb: 10 }, null).error);
  const c = lib.normalizeSpeedCmd({ confirm: true, mb: 999 }, { speedMb: 5 });
  assert.equal(c.mb, 25);
  assert.equal(c.confirm, true);
});

// ── RoundAgg / aggStats / p95 ─────────────────────────────────────────────
t('RoundAgg: 混合成功与丢包的分钟记录', () => {
  const agg = new lib.RoundAgg();
  agg.add(true, 100); agg.add(true, 200); agg.add(false, null);
  const rec = agg.take(5);
  assert.deepEqual(rec, [5, 1500, 200, 1, 3]); // avg=150ms → 1500
});
t('RoundAgg: 全丢 avg=null', () => {
  const agg = new lib.RoundAgg();
  agg.add(false); agg.add(false);
  const rec = agg.take(1);
  assert.equal(rec[1], null);
  assert.equal(rec[3], 2);
  assert.equal(rec[4], 2);
});
t('RoundAgg: take 复位', () => {
  const agg = new lib.RoundAgg();
  agg.add(true, 50);
  agg.take(0);
  assert.equal(agg.has, false);
});
t('aggStats: 跨分钟聚合', () => {
  const st = lib.aggStats([[0, 1000, 150, 0, 2], [1, 2000, 300, 1, 3]]);
  assert.equal(st.cnt, 5);
  assert.equal(st.loss, 1);
  assert.equal(st.avg, 150); // (100 + 200) / 2
  assert.equal(st.max, 300);
});
t('aggStats: 空输入', () => {
  const st = lib.aggStats([]);
  assert.equal(st.cnt, 0);
  assert.equal(st.avg, null);
});
t('p95: 排序取 95 分位', () => {
  assert.equal(lib.p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]), 100);
  assert.equal(lib.p95([10, 20, 30]), 30);
});

// ── hourKey / bucketUpsert ────────────────────────────────────────────────
t('hourKey: 本地时 10 位', () => {
  const ts = new Date(2026, 9, 28, 15, 30).getTime();
  assert.equal(lib.hourKey(ts), '2026102815');
  assert.equal(lib.minuteIdxOf(ts), 30);
  assert.equal(lib.hourKeyToTs('2026102815'), new Date(2026, 9, 28, 15).getTime());
});
t('bucketUpsert: 同分钟覆盖（重启续写语义）', () => {
  let b = lib.bucketUpsert(null, 't1', [5, 100, 120, 0, 1]);
  b = lib.bucketUpsert(b, 't1', [5, 200, 240, 0, 2]);
  b = lib.bucketUpsert(b, 't2', [7, 50, 60, 0, 1]);
  assert.equal(b.byTarget.t1.length, 1);
  assert.equal(b.byTarget.t1[0][1], 200);
  assert.equal(b.byTarget.t2.length, 1);
});
t('bucketUpsert: 保留最近 60 条分钟', () => {
  let b = null;
  for (let i = 0; i < 65; i++) b = lib.bucketUpsert(b, 't', [i, 100, 100, 0, 1]);
  assert.equal(b.byTarget.t.length, 60);
  assert.equal(b.byTarget.t[0][0], 5);
  assert.equal(b.byTarget.t[59][0], 64);
});

// ── retentionPlan ─────────────────────────────────────────────────────────
t('retention: 旧桶删除 + 新桶保留', () => {
  const now = new Date(2026, 9, 28, 12, 0).getTime();
  const old = `netmon.h.${lib.hourKey(now - 73 * 3600 * 1000)}`; // 73h 前（>72）
  const fresh = `netmon.h.${lib.hourKey(now - 1 * 3600 * 1000)}`;
  const del = lib.retentionPlan([old, fresh, 'netmon.snapshot'], { retentionHours: 72, now });
  assert.ok(del.includes(old));
  assert.ok(!del.includes(fresh));
  assert.ok(!del.includes('netmon.snapshot'));
});
t('retention: 事件/测速超 cap 删最旧', () => {
  const evs = Array.from({ length: 205 }, (_, i) => `netmon.event.${String(i).padStart(13, '0')}`);
  const sps = Array.from({ length: 52 }, (_, i) => `netmon.speed.${String(i).padStart(13, '0')}`);
  const del = lib.retentionPlan([...evs, ...sps], { retentionHours: 72 });
  assert.equal(del.length, 5 + 2);
  assert.ok(del.includes('netmon.event.0000000000000'));
  assert.ok(!del.includes('netmon.event.0000000000204'));
});
t('retention: result 键（nonce 名）不在计划内（孤儿由服务读值清扫）', () => {
  const del = lib.retentionPlan(['netmon.result.sabc123', 'netmon.cmd.speed.x1'], { retentionHours: 72 });
  assert.equal(del.length, 0);
});

// ── computeOnline / classifyConnectError ──────────────────────────────────
t('computeOnline: 锚点 ≥2 可达算在线', () => {
  assert.equal(lib.computeOnline([{ ok: true }, { ok: true }, { ok: false }, { ok: false }], 2), true);
  assert.equal(lib.computeOnline([{ ok: true }, { ok: false }, { ok: false }, { ok: false }], 2), false);
  assert.equal(lib.computeOnline([{ ok: true }], 2), true); // 不足 2 个锚点时要求全部
  assert.equal(lib.computeOnline([], 2), null);
});
t('classifyConnectError: RST 类=可达', () => {
  assert.equal(lib.classifyConnectError({ code: 'ECONNREFUSED' }).alive, true);
  assert.equal(lib.classifyConnectError({ code: 'ECONNRESET' }).alive, true);
  assert.equal(lib.classifyConnectError({ code: 'EPROTO' }).alive, true);
});
t('classifyConnectError: 超时/不可达/DNS=丢包', () => {
  assert.equal(lib.classifyConnectError({ code: 'ETIMEDOUT' }).alive, false);
  assert.equal(lib.classifyConnectError({ code: 'EHOSTUNREACH' }).alive, false);
  assert.equal(lib.classifyConnectError({ code: 'ENETUNREACH' }).alive, false);
  assert.equal(lib.classifyConnectError({ message: 'getaddrinfo ENOTFOUND x.com' }).alive, false);
  assert.equal(lib.classifyConnectError({ message: 'getaddrinfo ENOTFOUND x.com' }).note, 'dns');
});

// ── NetEventMachine ───────────────────────────────────────────────────────
function mkMachine() {
  let now = 1_000_000;
  const m = new lib.NetEventMachine(() => now);
  return { m, advance: (ms) => { now += ms; } };
}
const S = { sustainRounds: 3, latencyMs: 400, tickSec: 10 };
const ANCHORS = [
  { id: 'a1', label: '锚1', kind: 'anchor', enabled: true },
  { id: 'a2', label: '锚2', kind: 'anchor', enabled: true },
];
const UP = { a1: { ok: true, ms: 20 }, a2: { ok: true, ms: 20 } };
const DOWN = { a1: { ok: false, ms: null }, a2: { ok: false, ms: null } };

ta('事件机: 首轮只回填状态不发事件', async () => {
  const { m } = mkMachine();
  assert.deepEqual(m.feed(UP, ANCHORS, S), []);
  assert.deepEqual(m.feed(DOWN, ANCHORS, S), []); // 在线→失联第 1 轮
});
ta('事件机: 连续 2 轮全失联 → net_down；恢复 2 轮 → net_recovered 带时长', async () => {
  const { m, advance } = mkMachine();
  m.feed(UP, ANCHORS, S);
  m.feed(DOWN, ANCHORS, S);
  advance(10_000);
  const downEv = m.feed(DOWN, ANCHORS, S);
  assert.equal(downEv.length, 1);
  assert.equal(downEv[0].type, 'net_down');
  advance(60_000);
  m.feed(UP, ANCHORS, S); // 恢复第 1 轮
  advance(10_000);
  const recEv = m.feed(UP, ANCHORS, S);
  assert.equal(recEv.length, 1);
  assert.equal(recEv[0].type, 'net_recovered');
  assert.ok(recEv[0].durMs >= 60_000);
});
ta('事件机: 4 锚点下单锚点失联 → 不判网，但该锚点记 target_down', async () => {
  const { m, advance } = mkMachine();
  const four = [
    { id: 'a1', label: '锚1', kind: 'anchor', enabled: true },
    { id: 'a2', label: '锚2', kind: 'anchor', enabled: true },
    { id: 'a3', label: '锚3', kind: 'anchor', enabled: true },
    { id: 'a4', label: '锚4', kind: 'anchor', enabled: true },
  ];
  const allUp = { a1: { ok: true, ms: 20 }, a2: { ok: true, ms: 20 }, a3: { ok: true, ms: 20 }, a4: { ok: true, ms: 20 } };
  m.feed(allUp, four, S);
  const partial = { a1: { ok: false, ms: null }, a2: { ok: true, ms: 20 }, a3: { ok: true, ms: 20 }, a4: { ok: true, ms: 20 } };
  let sawDown = false;
  for (let i = 0; i < 6; i++) {
    advance(10_000);
    const evs = m.feed(partial, four, S);
    assert.ok(!evs.some((e) => e.type === 'net_down'), '单锚点失联（4 选 3）不应判断网');
    if (evs.some((e) => e.type === 'target_down' && e.targetId === 'a1')) sawDown = true;
  }
  assert.ok(sawDown, '失联锚点应在 sustain 轮后记 target_down（其余目标正常）');
});
ta('事件机: 仅剩 2 锚点且 1 失联 → 判离线（≥2 可达规则）', async () => {
  const { m, advance } = mkMachine();
  m.feed(UP, ANCHORS, S);
  const partial = { a1: { ok: false, ms: null }, a2: { ok: true, ms: 20 } };
  m.feed(partial, ANCHORS, S);
  advance(10_000);
  const evs = m.feed(partial, ANCHORS, S);
  assert.ok(evs.some((e) => e.type === 'net_down'), '2 锚点坏 1 → 在线数 1 < 2，应判离线');
  assert.ok(!evs.some((e) => e.type === 'target_down'), '断网语义吞掉锚点的单目标失联');
});
ta('事件机: 站点失联 sustainRounds 轮 → target_down（其余正常）', async () => {
  const { m, advance } = mkMachine();
  const targets = [...ANCHORS, { id: 'gh', label: 'GitHub', kind: 'normal', enabled: true }];
  m.feed({ ...UP, gh: { ok: true, ms: 100 } }, targets, S);
  advance(10_000);
  const fail = { ...UP, gh: { ok: false, ms: null } };
  m.feed(fail, targets, S);
  m.feed(fail, targets, S);
  advance(10_000);
  const evs = m.feed(fail, targets, S);
  const td = evs.find((e) => e.type === 'target_down');
  assert.ok(td, `应有 target_down，实际 ${JSON.stringify(evs)}`);
  assert.equal(td.targetId, 'gh');
  assert.ok(td.summary.includes('可能目标侧问题'));
});
ta('事件机: 延迟劣化触发与回落', async () => {
  const { m, advance } = mkMachine();
  const targets = [...ANCHORS, { id: 'slow', label: '慢站', kind: 'normal', enabled: true }];
  m.feed({ ...UP, slow: { ok: true, ms: 100 } }, targets, S);
  const slow = { ...UP, slow: { ok: true, ms: 900 } };
  const all = [];
  for (let i = 0; i < 5; i++) { advance(10_000); all.push(...m.feed(slow, targets, S)); }
  const high = all.find((e) => e.type === 'latency_high');
  assert.ok(high, `应有 latency_high，实际 ${JSON.stringify(all.map((e) => e.type))}`);
  assert.equal(high.value, 900);
  assert.ok(all.filter((e) => e.type === 'latency_high').length === 1, '劣化事件只发一次（不重复轰炸）');
  advance(10_000);
  m.feed({ ...UP, slow: { ok: true, ms: 50 } }, targets, S); // 一个好样本：窗口均值仍高，不恢复（防抖）
  advance(10_000);
  const back = m.feed({ ...UP, slow: { ok: true, ms: 50 } }, targets, S);
  assert.ok(back.some((e) => e.type === 'latency_recovered'), `窗口均值回落后应发 recovered，实际 ${JSON.stringify(back.map((e) => e.type))}`);
});
ta('事件机: 同类型 30 分钟内限频', async () => {
  const { m, advance } = mkMachine();
  m.feed(UP, ANCHORS, S);
  m.feed(DOWN, ANCHORS, S);
  advance(10_000);
  assert.equal(m.feed(DOWN, ANCHORS, S).filter((e) => e.type === 'net_down').length, 1);
  // 恢复再断（间隔 <30min）→ net_down 被限频吞掉
  advance(10_000);
  m.feed(UP, ANCHORS, S);
  advance(10_000);
  m.feed(UP, ANCHORS, S);
  advance(5 * 60 * 1000); // 仅 5 分钟
  m.feed(DOWN, ANCHORS, S);
  advance(10_000);
  const evs = m.feed(DOWN, ANCHORS, S);
  assert.ok(!evs.some((e) => e.type === 'net_down'), '30 分钟内重复断网应被限频');
});
ta('事件机: 网关防抖加倍（sustain×2）', async () => {
  const { m, advance } = mkMachine();
  const targets = [...ANCHORS, { id: 'gw', label: '网关', host: '', port: 80, kind: 'gateway', enabled: true }];
  const gwFail = { ...UP, gw: { ok: false, ms: null } };
  m.feed({ ...UP, gw: { ok: true, ms: 2 } }, targets, S);
  let sawDown = false;
  for (let i = 0; i < 5; i++) { advance(10_000); if (m.feed(gwFail, targets, S).some((e) => e.type === 'target_down')) sawDown = true; }
  assert.ok(!sawDown, `sustain=3 时网关前 5 轮失联不应报（需 sustain×2=6 轮）`);
  advance(10_000);
  const evs = m.feed(gwFail, targets, S);
  const td = evs.find((e) => e.type === 'target_down');
  assert.ok(td && td.targetId === 'gw' && /改网关端口或停用/.test(td.summary), '第 6 轮报网关失联并带误报提示');
});
ta('事件机: paused 时不产事件', async () => {
  const { m } = mkMachine();
  m.feed(UP, ANCHORS, S);
  m.feed(DOWN, ANCHORS, S);
  assert.deepEqual(m.feed(DOWN, ANCHORS, { ...S, paused: true }), []);
});

// ── 网关解析 ───────────────────────────────────────────────────────────────
t('gateway: 三平台解析', () => {
  assert.equal(lib.parseGatewayWin('192.168.1.1'), '192.168.1.1');
  assert.equal(lib.parseGatewayWin('0.0.0.0'), '');
  assert.equal(lib.parseGatewayWin(''), '');
  assert.equal(lib.parseGatewayMac('   gateway: 192.168.1.254\n'), '192.168.1.254');
  assert.equal(lib.parseGatewayLinux('default via 10.0.0.1 dev eth0 proto dhcp\n'), '10.0.0.1');
  assert.equal(lib.parseGatewayLinux(''), '');
});

// ── SSRF 守卫 ─────────────────────────────────────────────────────────────
ta('guardSpeedUrl: 拒绝非 http(s)', async () => {
  assert.ok(lib.guardSpeedUrl('ftp://x.com/f').error);
  assert.ok(lib.guardSpeedUrl('file:///etc/passwd').error);
  assert.ok(lib.guardSpeedUrl('not a url').error);
});
ta('guardSpeedUrl: 拒绝本机/私网（默认）', async () => {
  for (const h of ['http://127.0.0.1/x', 'http://localhost/x', 'http://192.168.1.1/x', 'http://10.0.0.2/x', 'http://172.16.0.1/x', 'http://172.31.255.255/x', 'http://169.254.1.1/x', 'http://nas.local/x', 'http://[::1]/x', 'http://0.0.0.0/x']) {
    assert.ok(lib.guardSpeedUrl(h).error, `应拒绝 ${h}`);
  }
});
ta('guardSpeedUrl: 公网放行 + allowPrivate 放行', async () => {
  const pub = lib.guardSpeedUrl('https://speed.cloudflare.com/__down?bytes={bytes}');
  assert.ok(!pub.error);
  assert.equal(pub.hostname, 'speed.cloudflare.com');
  const priv = lib.guardSpeedUrl('http://192.168.1.1:5000/dl', { allowPrivate: true });
  assert.ok(!priv.error);
  assert.ok(!lib.guardSpeedUrl('http://8.8.8.8/big.bin').error, '公网 IP 放行');
  assert.ok(lib.guardSpeedUrl('http://224.0.0.1/x').error, '组播段拒绝');
  assert.ok(lib.guardSpeedUrl('http://100.64.0.1/x').error === undefined, 'CGNAT 100.64/10 非私网保留段（放行）');
});

// ── 展示辅助 ───────────────────────────────────────────────────────────────
t('formatMs/formatDur', () => {
  assert.equal(lib.formatMs(80), '80ms');
  assert.equal(lib.formatMs(1234), '1.23s');
  assert.equal(lib.formatMs(null), '—');
  assert.equal(lib.formatDur(30 * 1000), '30 秒');
  assert.equal(lib.formatDur(5 * 60 * 1000), '5 分钟');
  assert.equal(lib.formatDur(2 * 3600 * 1000), '2 小时 0 分钟');
  assert.equal(lib.formatDur(26 * 3600 * 1000), '26 小时 0 分钟');
  assert.equal(lib.formatDur(50 * 3600 * 1000), '2 天');
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
await Promise.all(pending);
const failed = results.filter((r) => !r.pass);
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
if (failed.length) {
  console.error('失败项：', failed.map((f) => f.name).join('；'));
  process.exit(1);
}
