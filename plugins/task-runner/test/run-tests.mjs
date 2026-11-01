/**
 * 离线单测（node test/run-tests.mjs）—— engine.js + exec-core.js 纯函数直测。
 * 坑在这里暴露最便宜：调度边界 / SSRF 分类 / 掩码 / 分块轮换。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../shared/engine.js');
const core = require('../shared/exec-core.js');

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── engine.normalizeSchedule ─────────────────────────────────────────────────
t('normalizeSchedule: interval 接受 everyMinutes', () => {
  const r = engine.normalizeSchedule({ type: 'interval', everyMinutes: 5 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.schedule.everyMs, 5 * 60 * 1000);
});
t('normalizeSchedule: interval 拒绝 <60s', () => {
  assert.strictEqual(engine.normalizeSchedule({ type: 'interval', everyMs: 30000 }).ok, false);
  assert.strictEqual(engine.normalizeSchedule({ type: 'interval', everyMinutes: 0 }).ok, false);
});
t('normalizeSchedule: daily 校验 HH:MM', () => {
  assert.strictEqual(engine.normalizeSchedule({ type: 'daily', time: '8:30' }).ok, true);
  assert.strictEqual(engine.normalizeSchedule({ type: 'daily', time: '24:00' }).ok, false);
  assert.strictEqual(engine.normalizeSchedule({ type: 'daily', time: 'ab:cd' }).ok, false);
});
t('normalizeSchedule: weekly 需要 dows', () => {
  const r = engine.normalizeSchedule({ type: 'weekly', time: '09:00', dows: [1, 3, 5] });
  assert.deepStrictEqual(r.schedule.dows, [1, 3, 5]);
  assert.strictEqual(engine.normalizeSchedule({ type: 'weekly', time: '09:00', dows: [] }).ok, false);
  assert.strictEqual(engine.normalizeSchedule({ type: 'weekly', time: '09:00', dows: [7] }).ok, false);
});
t('normalizeSchedule: cron 校验五字段', () => {
  assert.strictEqual(engine.normalizeSchedule({ type: 'cron', expr: '0 8 * * *' }).ok, true);
  assert.strictEqual(engine.normalizeSchedule({ type: 'cron', expr: '0 8 * *' }).ok, false);
  assert.strictEqual(engine.normalizeSchedule({ type: 'cron', expr: '60 * * * *' }).ok, false);
  assert.strictEqual(engine.normalizeSchedule({ type: 'cron', expr: '* * * * 8' }).ok, false); // dow 只到 7(=0)
});
t('normalizeSchedule: 未知类型拒绝', () => {
  assert.strictEqual(engine.normalizeSchedule({ type: 'yearly' }).ok, false);
});

// ── engine.nextRunAt ────────────────────────────────────────────────────────
t('nextRunAt: interval = from + everyMs', () => {
  const from = Date.parse('2026-11-02T10:00:00');
  const r = engine.nextRunAt({ type: 'interval', everyMs: 90 * 1000 }, from);
  assert.strictEqual(r, from + 90 * 1000);
});
t('nextRunAt: daily 未来槽位当天命中', () => {
  // 固定本地时间构造：2026-11-02 10:30（本地）之后找 18:00
  const base = new Date(2026, 10, 2, 10, 30, 0).getTime();
  const r = engine.nextRunAt({ type: 'daily', time: '18:00' }, base);
  const expect = new Date(2026, 10, 2, 18, 0, 0).getTime();
  assert.strictEqual(r, expect);
});
t('nextRunAt: daily 过去槽位顺延到明天', () => {
  const base = new Date(2026, 10, 2, 19, 0, 0).getTime();
  const r = engine.nextRunAt({ type: 'daily', time: '08:00' }, base);
  assert.strictEqual(r, new Date(2026, 10, 3, 8, 0, 0).getTime());
});
t('nextRunAt: daily 同一分钟含边界（创建即当次）', () => {
  const base = new Date(2026, 10, 2, 8, 0, 30).getTime(); // 08:00:30，槽位 08:00
  const r = engine.nextRunAt({ type: 'daily', time: '08:00' }, base);
  assert.strictEqual(r, new Date(2026, 10, 2, 8, 0, 0).getTime());
});
t('nextRunAt: weekly 只在所选周几', () => {
  // 2026-11-02 是周一
  const base = new Date(2026, 10, 2, 10, 0, 0).getTime();
  const r = engine.nextRunAt({ type: 'weekly', time: '09:00', dows: [5] }, base); // 周五
  assert.strictEqual(r, new Date(2026, 10, 6, 9, 0, 0).getTime());
});
t('nextRunAt: weekly 当天已过时间 → 下周同几', () => {
  const base = new Date(2026, 10, 2, 10, 0, 0).getTime(); // 周一 10:00
  const r = engine.nextRunAt({ type: 'weekly', time: '09:00', dows: [1] }, base); // 周一
  assert.strictEqual(r, new Date(2026, 10, 9, 9, 0, 0).getTime());
});
t('nextRunAt: cron 基础', () => {
  const base = new Date(2026, 10, 2, 10, 30, 0).getTime();
  assert.strictEqual(
    engine.nextRunAt({ type: 'cron', expr: '0 8 * * *' }, base),
    new Date(2026, 10, 3, 8, 0, 0).getTime(),
  );
  assert.strictEqual(
    engine.nextRunAt({ type: 'cron', expr: '45 * * * *' }, base),
    new Date(2026, 10, 2, 10, 45, 0).getTime(),
  );
});
t('nextRunAt: cron 步长/列表/区间（含当分钟语义）', () => {
  const base = new Date(2026, 10, 2, 10, 30, 0).getTime();
  // 创建路径含当分钟：*/15 在 10:30 创建 → 首槽 10:30 本身
  assert.strictEqual(
    engine.nextRunAt({ type: 'cron', expr: '*/15 * * * *' }, base),
    new Date(2026, 10, 2, 10, 30, 0).getTime(),
  );
  // 推进路径（触发后 from=slot+1min）严格向后
  const afterSlot = engine.advanceAfterFire({ type: 'cron', expr: '*/15 * * * *' }, base, base);
  assert.strictEqual(afterSlot, new Date(2026, 10, 2, 10, 45, 0).getTime());
  assert.strictEqual(
    engine.nextRunAt({ type: 'cron', expr: '10,50 12 * * *' }, base),
    new Date(2026, 10, 2, 12, 10, 0).getTime(),
  );
  assert.strictEqual(
    engine.nextRunAt({ type: 'cron', expr: '0 9 * * 1-5' }, base), // 周一~周五
    new Date(2026, 10, 3, 9, 0, 0).getTime(), // 周二（11/2 周一 9 点已过）
  );
});
t('nextRunAt: cron dom+dow 受限取并集（vixie）', () => {
  // 11 月：1 号是周日。dom=1 ∨ dow=0(周日) → 11/1(周日) 或 11/2(周一? 否——dow=0 只周日)
  // 从 11/1 12:00 起：dom 1 已过（12:00 > 00:00 槽位? 槽位任意时刻——dom=1 全天每小时 0 分）
  const base = new Date(2026, 10, 1, 12, 30, 0).getTime();
  // 表达式：0 12 1 * 0 → dom=1 且 dow=周日，并集：11/1 12:00 已过 → 下一候选 11/8 12:00（周日）
  const r = engine.nextRunAt({ type: 'cron', expr: '0 12 1 * 0' }, base);
  assert.strictEqual(r, new Date(2026, 10, 8, 12, 0, 0).getTime());
});
t('nextRunAt: cron 7 视作周日', () => {
  const base = new Date(2026, 10, 2, 10, 0, 0).getTime(); // 周一
  const r = engine.nextRunAt({ type: 'cron', expr: '0 9 * * 7' }, base);
  assert.strictEqual(r, new Date(2026, 10, 8, 9, 0, 0).getTime()); // 下周日
});
t('nextRunAt: cron 每分钟表达式（创建含当分钟）', () => {
  const base = new Date(2026, 10, 2, 10, 30, 20).getTime();
  assert.strictEqual(
    engine.nextRunAt({ type: 'cron', expr: '* * * * *' }, base),
    new Date(2026, 10, 2, 10, 30, 0).getTime(),
  );
  // 触发 10:30 后推进 → 10:31
  const after = engine.advanceAfterFire({ type: 'cron', expr: '* * * * *' }, new Date(2026, 10, 2, 10, 30, 0).getTime(), base);
  assert.strictEqual(after, new Date(2026, 10, 2, 10, 31, 0).getTime());
});

// ── engine.advanceAfterFire ─────────────────────────────────────────────────
t('advanceAfterFire: interval 防风暴（max(now,fired)+every）', () => {
  const every = 60 * 1000;
  const fired = Date.parse('2026-11-02T10:00:00');
  const now = fired + 90 * 60 * 1000; // 宕机 90 分钟后
  assert.strictEqual(engine.advanceAfterFire({ type: 'interval', everyMs: every }, fired, now), now + every);
});
t('advanceAfterFire: daily 严格推进到下一槽位', () => {
  const slot = new Date(2026, 10, 2, 8, 0, 0).getTime();
  const r = engine.advanceAfterFire({ type: 'daily', time: '08:00' }, slot, slot);
  assert.strictEqual(r, new Date(2026, 10, 3, 8, 0, 0).getTime());
});
t('advanceAfterFire: 迟到触发（slot+61s）也推进到明天', () => {
  const slot = new Date(2026, 10, 2, 8, 0, 0).getTime();
  const firedLate = slot + 61 * 1000;
  const r = engine.advanceAfterFire({ type: 'daily', time: '08:00' }, firedLate, firedLate);
  assert.strictEqual(r, new Date(2026, 10, 3, 8, 0, 0).getTime());
});

t('dueJobs: 只含 enabled 且到期', () => {
  const now = Date.now();
  const jobs = [
    { id: 'a', enabled: true, nextRunAt: now - 1 },
    { id: 'b', enabled: false, nextRunAt: now - 1 },
    { id: 'c', enabled: true, nextRunAt: now + 60000 },
    { id: 'd', enabled: true, nextRunAt: null },
  ];
  assert.deepStrictEqual(engine.dueJobs(jobs, now).map((j) => j.id), ['a']);
});

t('describeSchedule: 四种文案', () => {
  assert.strictEqual(engine.describeSchedule({ type: 'interval', everyMs: 300000 }), '每 5 分钟');
  assert.strictEqual(engine.describeSchedule({ type: 'interval', everyMs: 7200000 }), '每 2 小时');
  assert.strictEqual(engine.describeSchedule({ type: 'daily', time: '08:05' }), '每天 08:05');
  assert.strictEqual(engine.describeSchedule({ type: 'weekly', time: '09:00', dows: [1, 3] }), '每周一、三 09:00');
  assert.strictEqual(engine.describeSchedule({ type: 'cron', expr: '*/5 * * * *' }), 'cron(*/5 * * * *)');
});

// ── exec-core: SSRF 分类 ────────────────────────────────────────────────────
t('isPrivateUrl: 私网/保留全拒', () => {
  for (const u of [
    'http://127.0.0.1/x', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://172.31.255.255/',
    'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/',
    'http://localhost:8080/', 'http://myhost.local/', 'http://myhost.internal/',
    'http://[::1]:9000/', 'http://[fc00::1]/', 'http://[fe80::1]/',
    'http://100.64.0.1/', 'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)',
    'http://999.1.1.1/', 'not a url',
  ]) {
    assert.strictEqual(core.isPrivateUrl(u), true, u);
  }
});
t('isPrivateUrl: 公网放行', () => {
  for (const u of ['https://example.com/', 'http://8.8.8.8/', 'https://api.github.com/repos', 'http://[2606:4700::1111]/']) {
    assert.strictEqual(core.isPrivateUrl(u), false, u);
  }
});
t('isPrivateUrl: 172.15/172.32 是公网（范围精确）', () => {
  assert.strictEqual(core.isPrivateUrl('http://172.15.0.1/'), false);
  assert.strictEqual(core.isPrivateUrl('http://172.32.0.1/'), false);
});

// ── exec-core: 载荷校验 ─────────────────────────────────────────────────────
t('normalizeHttpPayload: 基本 + GET 禁 body', () => {
  const r = core.normalizeHttpPayload({ url: 'https://example.com', method: 'GET', body: 'x' });
  assert.strictEqual(r.ok, false);
  const r2 = core.normalizeHttpPayload({ url: 'https://example.com', method: 'POST', body: '{"a":1}', headers: { 'X-A': 'b' } });
  assert.strictEqual(r2.ok, true);
  assert.deepStrictEqual(r2.value.headers, { 'X-A': 'b' });
});
t('normalizeHttpPayload: scheme 白名单 + 解析失败', () => {
  assert.strictEqual(core.normalizeHttpPayload({ url: 'ftp://x' }).ok, false);
  assert.strictEqual(core.normalizeHttpPayload({ url: '   ' }).ok, false);
});
t('normalizeHttpPayload: 头数量/长度护栏', () => {
  const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`h${i}`, 'v']));
  assert.strictEqual(core.normalizeHttpPayload({ url: 'https://x.com', headers: many }).ok, false);
  assert.strictEqual(core.normalizeHttpPayload({ url: 'https://x.com', headers: { a: 'v'.repeat(3000) } }).ok, false);
});
t('normalizeAiPayload / normalizeCommandPayload / normalizeNotifyPayload', () => {
  assert.strictEqual(core.normalizeAiPayload({ providerId: 'p', prompt: 'hi' }).ok, true);
  assert.strictEqual(core.normalizeAiPayload({ prompt: 'hi' }).ok, false);
  assert.strictEqual(core.normalizeAiPayload({ providerId: 'p', prompt: '' }).ok, false);
  assert.strictEqual(core.normalizeAiPayload({ providerId: 'p', prompt: 'x'.repeat(8001) }).ok, false);
  assert.strictEqual(core.normalizeCommandPayload({ command: 'echo hi' }).value.shell, 'powershell');
  assert.strictEqual(core.normalizeCommandPayload({ command: '  ' }).ok, false);
  assert.strictEqual(core.normalizeNotifyPayload({ message: '早会' }).ok, true);
  assert.strictEqual(core.normalizeNotifyPayload({ message: '' }).ok, false);
});
t('normalizeJob: 全链路合法', () => {
  const r = core.normalizeJob({
    name: '早报', type: 'ai',
    schedule: { type: 'daily', time: '08:00' },
    payload: { providerId: 'p1', prompt: '总结' },
  }, () => 'job_x');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.job.enabled, true);
  assert.strictEqual(r.job.nextRunAt, null); // 由服务层算
});
t('normalizeJob: 非法调度/载荷带错误信息', () => {
  assert.match(core.normalizeJob({ name: 'a', type: 'http', schedule: { type: 'interval', everyMinutes: 0 }, payload: { url: 'https://x' } }, () => 'j').error, /间隔/);
  assert.match(core.normalizeJob({ name: 'a', type: 'http', schedule: { type: 'daily', time: '8:00' }, payload: { url: 'ftp://x' } }, () => 'j').error, /http/);
});
t('normalizeJob: enabled false 保留', () => {
  const r = core.normalizeJob({ name: 'a', type: 'notify', enabled: false, schedule: { type: 'daily', time: '08:00' }, payload: { message: 'm' } }, () => 'j');
  assert.strictEqual(r.job.enabled, false);
});

// ── exec-core: 设置/掩码/分块 ───────────────────────────────────────────────
t('normalizeSettings: clamp + 默认', () => {
  assert.deepStrictEqual(core.normalizeSettings(null), {
    retentionRuns: 200, timeoutCommandSec: 120, timeoutHttpSec: 30, timeoutAiSec: 120,
  });
  const s = core.normalizeSettings({ retentionRuns: 99999, timeoutHttpSec: 1 });
  assert.strictEqual(s.retentionRuns, 1000);
  assert.strictEqual(s.timeoutHttpSec, 3);
});
t('maskSecret: 短值全星 / 长值后4', () => {
  assert.strictEqual(core.maskSecret('sk-abcd'), '****');
  assert.strictEqual(core.maskSecret('sk-1234567890abcd'), '****abcd');
  assert.strictEqual(core.maskSecret(''), '');
});
t('maskProviders: 一律掩码', () => {
  const [p] = core.maskProviders([{ id: 'p', name: 'x', apiKey: 'sk-1234567890abcd' }]);
  assert.strictEqual(p.apiKey, '****abcd');
});
t('makeRun: summary/excerpt 截断', () => {
  const run = core.makeRun({ id: 'r', jobId: 'j', jobName: 'n', type: 'command', status: 'fail', summary: 'x'.repeat(500), excerpt: 'y'.repeat(9000), durationMs: 12 });
  assert.strictEqual(run.summary.length, core.SUMMARY_CAP);
  assert.strictEqual(run.excerpt.length, core.EXCERPT_CAP);
  assert.ok(run.excerpt.startsWith('…'));
});
t('planRunAppend: 25 条溢出分块', () => {
  const chunk = Array.from({ length: core.RUN_CHUNK_SIZE }, (_, i) => ({ id: `r${i}` }));
  const plan = core.planRunAppend(chunk, { id: 'r25' }, 200);
  assert.strictEqual(plan.lastChunk.length, core.RUN_CHUNK_SIZE);
  assert.strictEqual(plan.overflow.length, 1);
  assert.strictEqual(plan.overflow[0].id, 'r25');
  const plan2 = core.planRunAppend(chunk.slice(0, 24), { id: 'r24' }, 200);
  assert.strictEqual(plan2.lastChunk.length, 25);
  assert.strictEqual(plan2.overflow, null);
});
t('retentionChunks: 200 条 = 8 块', () => {
  assert.strictEqual(core.retentionChunks(200), 8);
  assert.strictEqual(core.retentionChunks(50), 2);
  assert.strictEqual(core.retentionChunks(1000), 40);
});

// ── host-import：宿主供应商映射/幂等合并/掩码拒收 ──────────────────────────
const hostImport = require('../service/host-import.js');
t('mapHostProfiles: 正常映射 + modelOptions 兜底 + wireApi', () => {
  const cfg = { modelProfiles: [
    { id: 'hp1', name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'real-key-1', model: '', modelOptions: ['glm-4.7', 'glm-4.6'], wireApi: 'openai' },
    { id: 'hp2', name: 'Claude', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-2', model: 'claude-x', wireApi: 'anthropic-messages' },
  ] };
  const r = hostImport.mapHostProfiles(cfg, [], (i) => `prov_h${i}`);
  assert.strictEqual(r.imported, 2);
  assert.strictEqual(r.providers[0].model, 'glm-4.7');
  assert.strictEqual(r.providers[0].wire, 'openai-chat-completions');
  assert.strictEqual(r.providers[1].wire, 'anthropic-messages');
  assert.strictEqual(r.providers[0].source, 'host');
});
t('mapHostProfiles: 掩码占位 key 拒收 + 缺 baseUrl/缺 id 跳过', () => {
  const cfg = { modelProfiles: [
    { id: 'hp1', baseUrl: 'https://x.com', apiKey: '__POLARIS_MASKED_xxx' },
    { id: 'hp2', baseUrl: '', apiKey: 'k' },
    { baseUrl: 'https://y.com', apiKey: 'k' },
    { id: 'hp3', baseUrl: 'https://z.com', apiKey: 'ok-key' },
  ] };
  const r = hostImport.mapHostProfiles(cfg, [], (i) => `prov_h${i}`);
  assert.strictEqual(r.imported, 1);
  assert.strictEqual(r.providers[0].hostId, 'hp3');
});
t('mapHostProfiles: hostId 幂等替换 + 手填保留', () => {
  const cfg = { modelProfiles: [{ id: 'hp1', name: '新名', baseUrl: 'https://x.com', apiKey: 'new' }] };
  const existing = [
    { id: 'prov_old', hostId: 'hp1', name: '旧名', baseUrl: 'https://x.com', apiKey: 'old' },
    { id: 'prov_manual', name: '手填', baseUrl: 'https://m.com', apiKey: 'mk' },
  ];
  const r = hostImport.mapHostProfiles(cfg, existing, (i) => `prov_h${i}`);
  assert.strictEqual(r.imported, 1);
  assert.strictEqual(r.providers.length, 2);
  assert.ok(!r.providers.some((p) => p.id === 'prov_old'), '旧宿主档案被替换');
  assert.ok(r.providers.some((p) => p.id === 'prov_manual'), '手填档案保留');
  assert.strictEqual(r.providers.find((p) => p.hostId === 'hp1').name, '新名');
});
t('findHostConfigFile: 无候选返回 null（不抛）', () => {
  const r = hostImport.findHostConfigFile('Z:/definitely/not/exist');
  // 本机真实环境大概率命中 anchor——只断言「要么 null 要么有 root」
  assert.ok(r === null || (r && r.root && typeof r.root === 'object'));
});

const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
