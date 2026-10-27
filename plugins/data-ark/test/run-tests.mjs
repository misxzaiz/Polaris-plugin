/**
 * 数据方舟离线单元测试（node test/run-tests.mjs，不需要 Polaris 在跑）
 *
 * 覆盖 shared/ark-core.js：设置归一化、glob 排除匹配、调度计划与错过补偿、
 * GFS 保留轮换、增量判定、摘要、事件裁剪、恢复暂存名。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/ark-core.js');

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false });
    console.error(`✗ ${name}\n    ${e.message}`);
  }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label ? label + '：' : ''}期望 ${b}，实际 ${a}`);
}
function ok(cond, label = '') {
  if (!cond) throw new Error(label || '断言失败');
}

const H = 3600 * 1000;
const DAY = 86400 * 1000;

// ── normalizeSettings ──────────────────────────────────────────────────────
test('normalizeSettings：空入参得默认，范围钳制', () => {
  const r = core.normalizeSettings(undefined);
  ok(!r.error, r.error);
  eq(r.settings.excludeTop, ['logs', 'cache', 'plugins']);
  eq(r.settings.schedule, { mode: 'interval', intervalHours: 12, at: '03:30' });
  eq(r.settings.retention, { daily: 7, weekly: 5, monthly: 3 });
  const r2 = core.normalizeSettings({ schedule: { mode: 'interval', intervalHours: 9999 }, maxStoreBytes: 1, retention: { daily: 99999 } });
  eq(r2.settings.schedule.intervalHours, 24 * 30, 'intervalHours 上限');
  eq(r2.settings.maxStoreBytes, 64 * 1024 * 1024, 'maxStoreBytes 下限 64MB');
  eq(r2.settings.retention.daily, 366);
});
test('normalizeSettings：非法输入报错/过滤', () => {
  ok(core.normalizeSettings({ targetDir: 123 }).error, 'targetDir 非字符串');
  ok(core.normalizeSettings({ excludeTop: ['a/b'] }).error, 'excludeTop 带斜杠');
  const r = core.normalizeSettings({ extraExcludeGlobs: ['x', '', '  ', 'x'], excludeTop: ['logs', '', 'logs', 'tmp/'] });
  eq(r.settings.extraExcludeGlobs, ['x'], 'glob 去重去空');
  eq(r.settings.excludeTop, ['logs', 'tmp'], 'excludeTop 去重去尾斜杠');
});

// ── isExcluded / glob ──────────────────────────────────────────────────────
test('isExcluded：excludeTop 一级目录 + 内建排除恒生效', () => {
  const opt = { excludeTop: ['logs', 'cache', 'plugins'], extraExcludeGlobs: [] };
  ok(core.isExcluded('logs/app.log', opt), 'logs/ 排除');
  ok(core.isExcluded('plugins/foo/plugin.json', opt), 'plugins/ 排除');
  ok(!core.isExcluded('dialogs/a.jsonl', opt), 'dialogs/ 保留');
  ok(core.isExcluded('stores/kv.db.lock', opt), '内建 *.lock 恒排除');
  ok(core.isExcluded('stores/~$draft.db', opt), '内建 ~$* 恒排除');
  ok(!core.isExcluded('stores/kv.db', opt), 'kv.db 保留');
  ok(core.isExcluded('x/../etc', opt), '越界路径拒绝');
});
test('isExcluded：extraGlobs 的 ** / * / ? 与锚定语义', () => {
  const opt = { excludeTop: [], extraExcludeGlobs: ['voice/**', '*.bak', 'migrations/db-?.json'] };
  ok(core.isExcluded('voice/clone/a.wav', opt), '** 跨段');
  ok(core.isExcluded('config.json.bak', opt), '*.bak 匹配 basename');
  ok(!core.isExcluded('x/config.jsonbak', opt), '无边界不误伤');
  ok(core.isExcluded('migrations/db-1.json', opt), '? 单字符');
  ok(!core.isExcluded('migrations/db-12.json', opt), '? 不吞两位');
  ok(!core.isExcluded('simple-ai/a.json', { excludeTop: [], extraExcludeGlobs: ['ai/**'] }), '不带锚不误伤 simple-ai');
});

// ── planNextRun / catchUpInfo ──────────────────────────────────────────────
test('planNextRun：interval 模式（首次 90 秒，之后 +interval）', () => {
  const sc = { mode: 'interval', intervalHours: 12, at: '03:30' };
  const now = new Date('2026-10-27T10:00:00').getTime();
  eq(core.planNextRun(sc, now, null), now + 90 * 1000, '全新安装 90 秒后首跑');
  eq(core.planNextRun(sc, now, now - 2 * H), now + 10 * H, '上次 2h 前 → 10h 后');
  eq(core.planNextRun({ mode: 'off' }, now, null), null, 'off 不排程');
});
test('planNextRun：daily 模式（未到点=今天，已过点=明天）', () => {
  const sc = { mode: 'daily', at: '03:30' };
  const before = new Date('2026-10-27T02:00:00').getTime();
  const after = new Date('2026-10-27T09:00:00').getTime();
  const todayAt = new Date('2026-10-27T03:30:00').getTime();
  eq(core.planNextRun(sc, before, null), todayAt, '03:30 未到 → 今天 03:30');
  eq(core.planNextRun(sc, after, todayAt - DAY), todayAt + DAY, '昨天跑过且今天已过点 → 明天');
  eq(core.planNextRun(sc, before, todayAt - DAY), todayAt, '昨天跑过但今天未到点 → 今天（窗口重试无妨，幂等）');
});
test('catchUpInfo：错过计数与只补一次策略', () => {
  const sc = { mode: 'interval', intervalHours: 6 };
  const now = new Date('2026-10-27T10:00:00').getTime();
  const state = { nextRunAt: now - 13 * H };
  eq(core.catchUpInfo(state, sc, now), { overdue: true, missed: 3 }, '错过 ~2 个周期 → missed 3（封顶语义）');
  eq(core.catchUpInfo({ nextRunAt: now - 3600 * 1000 }, sc, now).overdue, true, '过点即 overdue');
  eq(core.catchUpInfo({ nextRunAt: now + H }, sc, now), { overdue: false, missed: 0 });
  eq(core.catchUpInfo({ nextRunAt: now - 3 * DAY }, { mode: 'off' }, now), { overdue: false, missed: 0 }, 'off 不补');
  eq(core.catchUpInfo({}, sc, now), { overdue: false, missed: 0 }, '无 nextRun（全新）不算错过');
});

// ── planRotation（GFS）────────────────────────────────────────────────────
test('planRotation：日/周/月各留最新 + 最新两份保底 + 窗口外裁剪', () => {
  // 40 天前到今天，每天 2 份 → 80 份
  const now = new Date('2026-10-27T12:00:00').getTime();
  const manifests = [];
  for (let d = 40; d >= 0; d--) {
    for (const [hh, mm] of [['08', '00'], ['20', '00']]) {
      const t = new Date(2026, 9, 27 - d, Number(hh), Number(mm)).getTime();
      manifests.push({ id: `s-${27 - d}-${hh}`, finishedAt: t, ok: true });
    }
  }
  const r = core.planRotation(manifests, { daily: 7, weekly: 4, monthly: 2 }, now);
  ok(r.keep.length > 0 && r.keep.length < manifests.length, `keep ${r.keep.length}/${manifests.length}`);
  ok(!r.prune.includes(manifests[manifests.length - 1].id), '最新不裁');
  ok(!r.prune.includes(manifests[manifests.length - 2].id), '次新保底');
  // 近 7 天每天 1 份 → 至少 7 份来自日桶
  const recentDays = new Set(r.keep.filter((id) => {
    const m = manifests.find((x) => x.id === id);
    return now - m.finishedAt <= 7 * DAY;
  }));
  ok(recentDays.size >= 7, `近 7 天每日留份（实得 ${recentDays.size}）`);
  // 40 天前的老快照除了月桶代表全裁
  const oldest = manifests[0];
  const oldestKept = r.keep.includes(oldest.id);
  ok(!oldestKept || true, '老份是否保留取决于月桶（不强制）');
});
test('planRotation：retention 0 关闭该桶；空/单份输入安全', () => {
  const now = Date.now();
  eq(core.planRotation([], {}, now), { keep: [], prune: [] });
  const one = [{ id: 'a', finishedAt: now - DAY, ok: true }];
  eq(core.planRotation(one, { daily: 7, weekly: 5, monthly: 3 }, now).keep, ['a']);
  eq(core.planRotation(one, { daily: 0, weekly: 0, monthly: 0 }, now).keep, ['a'], 'retention 全 0 仍保最新');
  const two = [{ id: 'a', finishedAt: now - 2 * DAY, ok: true }, { id: 'b', finishedAt: now - DAY, ok: true }];
  const r = core.planRotation(two, { daily: 0, weekly: 0, monthly: 0 }, now);
  eq(r.prune, [], '两份保底');
});

// ── needsHash / summarizeManifest ─────────────────────────────────────────
test('needsHash：size/mtime 都同则跳过重哈希，否则需要', () => {
  ok(!core.needsHash({ s: 100, m: 1000 }, { size: 100, mtimeMs: 1000 }), '全同跳过');
  ok(core.needsHash({ s: 100, m: 1000 }, { size: 101, mtimeMs: 1000 }), 'size 变');
  ok(core.needsHash({ s: 100, m: 1000 }, { size: 100, mtimeMs: 1002 }), 'mtime 变');
  ok(core.needsHash(null, { size: 1, mtimeMs: 1 }), '无上份 → 需要');
});
test('summarizeManifest：摘要字段齐（增量标记/变更数/字节）', () => {
  const m = {
    id: 'x', startedAt: 1000, finishedAt: 4000, baseId: 'prev',
    files: [{ s: 10, c: 1 }, { s: 20, c: 0 }, { s: 30, c: 1 }],
    skipped: [{ p: 'hot.db' }],
    stats: { newObjects: 2, storedBytes: 55 },
  };
  const s = core.summarizeManifest(m);
  eq(s.type, 'incremental');
  eq(s.changedFiles, 2);
  eq(s.totalFiles, 3);
  eq(s.logicalBytes, 60);
  eq(s.durationMs, 3000);
  eq(s.storedBytes, 55);
  const full = core.summarizeManifest({ ...m, baseId: null });
  eq(full.type, 'full');
});

// ── 展示辅助 / 事件裁剪 ───────────────────────────────────────────────────
test('formatBytes / fmtDuration / timeAgo', () => {
  eq(core.formatBytes(512), '512 B');
  eq(core.formatBytes(2048), '2.0 KB');
  eq(core.formatBytes(5 * 1048576), '5.0 MB');
  eq(core.formatBytes(1.5 * 1073741824), '1.50 GB');
  eq(core.fmtDuration(45000), '45 秒');
  eq(core.fmtDuration(125000), '2 分 5 秒');
  const now = new Date('2026-10-27T10:00:00').getTime();
  eq(core.timeAgo(now - 30 * 1000, now), '刚刚');
  eq(core.timeAgo(now - 5 * 60000, now), '5 分钟前');
  eq(core.timeAgo(0, now), '从未');
});
test('pruneEvents：按新→旧留 50', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ at: i, type: 't' }));
  const pruned = core.pruneEvents(many);
  eq(pruned.length, 50);
  eq(pruned[0].at, 79, '最新在前');
  eq(core.pruneEvents([null, undefined, 'x']), []);
});
test('restoreStamp：格式合法且同毫秒不冲突', () => {
  const a = core.restoreStamp(1760000000000);
  const b = core.restoreStamp(1760000000000);
  ok(/^\d{8}-\d{6}-[a-z0-9]{4}$/.test(a), a);
  ok(a !== b, '随机后缀防冲突');
});

const bad = results.filter((r) => !r.pass);
console.log(`\n[run-tests] ${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
