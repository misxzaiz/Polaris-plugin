#!/usr/bin/env node
/**
 * file-flow 离线单测（零外部依赖，node test/run-tests.mjs）
 *
 * 覆盖：
 *   - lib.js：设置/根/规则规范化、模板渲染、匹配、计划、去重、撤销、清扫、预置包
 *   - fsutil.js：真实临时目录上的 walk 排除、指纹、移动（同盘 rename）、冲突改名
 *
 * 设计：全部用例自建临时目录并自清理；不依赖宿主/桥/网络。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const lib = require('../service/lib.js');
const fsutil = require('../service/fsutil.js');

let passed = 0;
let failed = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`✗ ${name}\n    ${e.message}`);
  }
}

function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: 期望 ${b}，实际 ${a}`);
}

function ok(cond, label) {
  if (!cond) throw new Error(label || '条件不成立');
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fileflow-test-'));
}

const DAY = 24 * 60 * 60 * 1000;

// ══════════════════════ 设置规范化 ══════════════════════
t('normalizeSettings: 默认值', () => {
  const s = lib.normalizeSettings(null);
  eq(s.guardMinutes, 5);
  eq(s.maxOpsPerRun, 500);
  eq(s.dedupeMaxFiles, 300);
  eq(s.dedupeMaxSizeMB, 512);
  eq(s.sweepMinutes, 15);
  eq(s.watchEnabled, true);
});

t('normalizeSettings: 越界回落边界', () => {
  const s = lib.normalizeSettings({ guardMinutes: -5, maxOpsPerRun: 99999, dedupeMaxSizeMB: 0, sweepMinutes: 9999 });
  eq(s.guardMinutes, 1);
  eq(s.maxOpsPerRun, 2000);
  eq(s.dedupeMaxSizeMB, 1);
  eq(s.sweepMinutes, 240);
  eq(lib.normalizeSettings({ watchEnabled: false }).watchEnabled, false);
  eq(lib.normalizeSettings({ watchEnabled: 'no' }).watchEnabled, true); // 非布尔回落默认开
});

t('normalizeSettings: 垃圾输入不炸', () => {
  eq(lib.normalizeSettings('garbage').guardMinutes, 5);
  eq(lib.normalizeSettings({ guardMinutes: 'abc' }).guardMinutes, 5);
});

// ══════════════════════ 根目录规范化 ══════════════════════
t('isValidAbsPath: 合法盘符路径 / 相对路径 / .. 拒绝', () => {
  ok(lib.isValidAbsPath('C:\\Users\\me\\Downloads'));
  ok(lib.isValidAbsPath('D:/space/base'));
  ok(lib.isValidAbsPath('\\\\NAS\\share'));
  ok(!lib.isValidAbsPath('relative\\path'));
  ok(!lib.isValidAbsPath('C:\\a\\..\\b'));
  ok(!lib.isValidAbsPath('C:\\a<b'));
  ok(!lib.isValidAbsPath(''));
});

t('normalizeRoots: 大小写去重 + 正斜杠归一 + 非法剔除 + 上限', () => {
  const r = lib.normalizeRoots({ roots: [
    { path: 'C:\\Downloads', label: '下载', auto: 'new' },
    { path: 'c:/downloads' },          // 同路径不同写法 → 去重
    { path: 'bad-path' },              // 非法 → 剔除
    { path: 'D:\\workspace', auto: 'weird' }, // 非法 auto → off
  ] });
  eq(r.roots.length, 2);
  eq(r.roots[0].path, 'C:\\Downloads');
  eq(r.roots[1].path, 'D:\\workspace');
  eq(r.roots[1].auto, 'off');
  eq(r.roots[1].label, 'workspace'); // pathBase 兜底
});

// ══════════════════════ 规则规范化 ══════════════════════
t('normalizeRule: move 缺 dest 报错 / rename 缺 pattern 报错 / 动作非法', () => {
  ok(lib.normalizeRule({ action: { type: 'move' } }).error);
  ok(!lib.normalizeRule({ action: { type: 'rename', pattern: '{name}' } }).error, 'rename 有 pattern 即合法');
  ok(lib.normalizeRule({ action: { type: 'rename' } }).error, 'rename 缺 pattern 报错');
  ok(lib.normalizeRule({ action: { type: 'boom' } }).error);
  ok(!lib.normalizeRule({ action: { type: 'recycle' } }).error);
});

t('normalizeRule: exts 清洗 + 正则编译检查 + 模板变量白名单', () => {
  const r1 = lib.normalizeRule({ name: 'x', action: { type: 'move', dest: 'a' }, match: { exts: ['.PDF', ' DOCX ', '!!', 'toolongextension9'] } });
  eq(r1.match.exts, ['pdf', 'docx']);
  ok(lib.normalizeRule({ action: { type: 'move', dest: 'a' }, match: { nameRegex: '([unclosed' } }).error);
  ok(!lib.normalizeRule({ action: { type: 'move', dest: 'a' }, match: { nameRegex: '^截图' } }).error);
  ok(lib.normalizeRule({ action: { type: 'move', dest: 'a{names}' } }).error); // 拼错变量
  ok(!lib.normalizeRule({ action: { type: 'move', dest: '安装包/{yyyy}-{mm}' } }).error);
});

t('mergeRule: 补丁合并 + 再规范化', () => {
  const base = lib.normalizeRule({ id: 'r1', name: 'A', action: { type: 'move', dest: 'docs' }, match: { exts: ['pdf'] }, priority: 40 });
  const m = lib.mergeRule(base, { enabled: false, match: { exts: ['docx'] } });
  eq(m.id, 'r1');
  eq(m.enabled, false);
  eq(m.match.exts, ['docx']);
  eq(m.action.dest, 'docs');
  eq(m.priority, 40);
  ok(lib.mergeRule(base, { match: { nameRegex: '(bad' } }).error);
});

// ══════════════════════ 模板渲染 ══════════════════════
t('renderDest: 相对模板 + 变量 + Windows 非法字符净化', () => {
  const nowMs = new Date('2026-11-02T10:00:00').getTime();
  const rd = lib.renderDest('安装包/{yyyy}-{mm}', 'C:\\D', { name: 'setup:v2?.exe', nowMs });
  eq(rd.destRel, '安装包\\2026-11');
  eq(rd.outside, false);
  // 文件名变量也净化
  const rd2 = lib.renderDest('归档/{name}', 'C:\\D', { name: 'a<b>.txt', nowMs });
  eq(rd2.destRel, '归档\\ab.txt');
});

t('renderDest: 绝对模板 → outside=true；.. 拒绝；渲染空拒绝', () => {
  const nowMs = Date.now();
  const rd = lib.renderDest('D:\\Archive\\{yyyy}', 'C:\\D', { name: 'a.txt', nowMs });
  eq(rd.outside, true);
  eq(rd.destAbs, 'D:\\Archive\\2026');
  ok(lib.renderDest('..\\escape', 'C:\\D', { name: 'a.txt', nowMs }).error);
  ok(lib.renderDest('///', 'C:\\D', { name: 'a.txt', nowMs }).error);
});

t('conflictName: name(1).ext 递增', () => {
  const taken = new Set(['C:\\a\\f.txt', 'C:\\a\\f(1).txt']);
  eq(lib.conflictName('C:\\a\\f.txt', (c) => taken.has(c)), 'C:\\a\\f(2).txt');
  eq(lib.conflictName('C:\\a\\f.txt', () => false), 'C:\\a\\f(1).txt');
  eq(lib.conflictName('C:\\a\\noext', () => false), 'C:\\a\\noext(1)');
});

// ══════════════════════ 目的子树前缀 ══════════════════════
t('destPrefixes: 回收站恒在 + 相对 dest 首段 + 绝对 dest 不产生', () => {
  const rules = lib.normalizeRules({ rules: [
    { id: 'a', action: { type: 'move', dest: '安装包/{yyyy}-{mm}' } },
    { id: 'b', action: { type: 'move', dest: '冷存' } },
    { id: 'c', action: { type: 'move', dest: 'D:\\Out', allowOutsideRoot: true } },
    { id: 'd', enabled: false, action: { type: 'move', dest: '停用不排除' } },
    { id: 'e', action: { type: 'dedupe', dest: '压缩包' } },
  ] }).rules;
  const p = lib.destPrefixes(rules);
  ok(p.has('_FileFlow回收站'));
  ok(p.has('安装包'));
  ok(p.has('冷存'));
  ok(p.has('压缩包'));
  ok(!p.has('停用不排除'));
  ok(!p.has('D:\\Out'));
});

// ══════════════════════ 匹配 ══════════════════════════════
t('matchRule: exts/正则/大小/年龄/子目录 全维度', () => {
  const nowMs = Date.now();
  const rule = lib.normalizeRule({
    action: { type: 'move', dest: 'x' },
    match: { exts: ['pdf'], nameRegex: '报告', minSizeMB: 1, maxSizeMB: 10, minAgeDays: 2, maxAgeDays: 100, subDir: '待整理' },
  });
  const e = { rel: '待整理\\月度报告.pdf', name: '月度报告.pdf', size: 2 * 1024 * 1024, mtime: nowMs - 5 * DAY };
  ok(lib.matchRule(e, rule, nowMs));
  ok(!lib.matchRule({ ...e, name: '月度报告.docx' }, rule, nowMs), 'ext 不符');
  ok(!lib.matchRule({ ...e, name: '随手.pdf' }, rule, nowMs), '正则不符');
  ok(!lib.matchRule({ ...e, size: 0.5 * 1024 * 1024 }, rule, nowMs), '过小');
  ok(!lib.matchRule({ ...e, mtime: nowMs - 0.5 * DAY }, rule, nowMs), '太新');
  ok(!lib.matchRule({ ...e, mtime: nowMs - 200 * DAY }, rule, nowMs), '太老');
  ok(!lib.matchRule({ ...e, rel: '别处\\月度报告.pdf' }, rule, nowMs), '子目录不符');
});

// ══════════════════════ 计划 ══════════════════════════════
function makeRoot(id = 'r1') {
  return { id, path: 'C:\\Downloads', label: '下载', auto: 'new', addedAt: 1 };
}

t('planForRoot: 优先级先到先得 + stopOnMatch + move 渲染', () => {
  const root = makeRoot();
  const nowMs = Date.now();
  const rules = lib.normalizeRules({ rules: [
    { id: 'old', name: '冷存', priority: 900, rootId: 'r1', match: { minAgeDays: 30 }, action: { type: 'move', dest: '冷存/{yyyy}-{mm}' } },
    { id: 'zip', name: '压缩包', priority: 30, rootId: 'r1', match: { exts: ['zip'] }, action: { type: 'move', dest: '压缩包' } },
  ] }).rules;
  const entries = [
    { rel: 'a.zip', name: 'a.zip', size: 100, mtime: nowMs - 40 * DAY },
    { rel: 'note.txt', name: 'note.txt', size: 10, mtime: nowMs - 1 * DAY }, // 不到冷存年龄
  ];
  const plan = lib.planForRoot({ root, rules, entries, nowMs, settings: lib.normalizeSettings(null) });
  eq(plan.ops.length, 1);
  eq(plan.ops[0].fromRel, 'a.zip');
  eq(plan.ops[0].toRel, '压缩包\\a.zip');
  eq(plan.ops[0].safe, true);
  eq(plan.ops[0].ruleId, 'zip'); // 优先级 30 先于 900
  eq(plan.counts.noRule, 1); // note.txt 无规则命中（冷存要求 ≥30 天）
});

t('planForRoot: 冷存 catch-all + 按月分桶', () => {
  const root = makeRoot();
  const nowMs = new Date('2026-11-02T10:00:00Z').getTime();
  const rules = lib.normalizeRules({ rules: [
    { id: 'old', name: '冷存', priority: 900, rootId: 'r1', match: { minAgeDays: 30 }, action: { type: 'move', dest: '冷存/{yyyy}-{mm}' } },
  ] }).rules;
  const plan = lib.planForRoot({
    root, rules,
    entries: [{ rel: '老文件.txt', name: '老文件.txt', size: 10, mtime: nowMs - 60 * DAY }],
    nowMs,
    settings: lib.normalizeSettings(null),
  });
  eq(plan.ops.length, 1);
  ok(plan.ops[0].toRel.startsWith('冷存\\2026-11\\'), `实际 ${plan.ops[0].toRel}`);
});

t('planForRoot: 新文件护栏 / 部分下载 / 隐藏 / 目的子树排除', () => {
  const root = makeRoot();
  const nowMs = Date.now();
  const rules = lib.normalizeRules({ rules: [
    { id: 'all', name: '全收', priority: 10, rootId: 'r1', match: {}, action: { type: 'move', dest: '归档' } },
  ] }).rules;
  const entries = [
    { rel: '刚下载完.zip', name: '刚下载完.zip', size: 10, mtime: nowMs - 30 * 1000 }, // 护栏内
    { rel: '半截.crdownload', name: '半截.crdownload', size: 10, mtime: nowMs - 10 * DAY },
    { rel: '.hidden\\x.txt', name: 'x.txt', size: 10, mtime: nowMs - 10 * DAY },
    { rel: '归档\\已归档.txt', name: '已归档.txt', size: 10, mtime: nowMs - 10 * DAY }, // 目的子树
    { rel: 'normal.txt', name: 'normal.txt', size: 10, mtime: nowMs - 10 * DAY },
  ];
  const plan = lib.planForRoot({ root, rules, entries, nowMs, settings: lib.normalizeSettings(null) });
  eq(plan.ops.length, 1);
  eq(plan.ops[0].fromRel, 'normal.txt');
  eq(plan.counts.guard, 1);
  eq(plan.counts.partial, 1);
  eq(plan.counts.inDest, 1);
  eq(plan.counts.hidden, 1);
});

t('planForRoot: 回收站动作 + 根外目的 safe=false + maxOps 截断', () => {
  const root = makeRoot();
  const nowMs = Date.now();
  const rules = lib.normalizeRules({ rules: [
    { id: 'rec', name: '回收', priority: 10, rootId: 'r1', match: { exts: ['log'] }, action: { type: 'recycle' } },
    { id: 'out', name: '外移', priority: 20, rootId: 'r1', match: { exts: ['iso'] }, action: { type: 'move', dest: 'D:\\ISO库', allowOutsideRoot: true } },
  ] }).rules;
  const entries = [
    { rel: 'a.log', name: 'a.log', size: 1, mtime: nowMs - DAY },
    { rel: 'big.iso', name: 'big.iso', size: 1, mtime: nowMs - DAY },
  ];
  const plan = lib.planForRoot({ root, rules, entries, nowMs, settings: lib.normalizeSettings(null) });
  eq(plan.ops.length, 2);
  const rec = plan.ops.find((o) => o.fromRel === 'a.log');
  ok(rec.toRel.startsWith('_FileFlow回收站\\a.log'), `实际 ${rec.toRel}`);
  eq(rec.safe, true);
  const out = plan.ops.find((o) => o.fromRel === 'big.iso');
  eq(out.safe, false);
  eq(out.toAbs, 'D:\\ISO库\\big.iso');
  eq(out.toRel, null);

  const capped = lib.planForRoot({
    root, rules,
    entries: Array.from({ length: 8 }, (_, i) => ({ rel: `f${i}.log`, name: `f${i}.log`, size: 1, mtime: nowMs - DAY })),
    nowMs,
    settings: { ...lib.normalizeSettings(null), maxOpsPerRun: 3 },
  });
  eq(capped.ops.length, 3);
  eq(capped.counts.maxOps, 5);
});

t('planForRoot: rename 原地改名', () => {
  const root = makeRoot();
  const nowMs = new Date('2026-11-02T10:00:00').getTime();
  const rules = lib.normalizeRules({ rules: [
    { id: 'ren', name: '日期前缀', priority: 10, rootId: 'r1', match: { exts: ['txt'] }, action: { type: 'rename', pattern: '{yyyy}{mm}{dd}-{name}' } },
  ] }).rules;
  const plan = lib.planForRoot({ root, rules, entries: [{ rel: 'a.txt', name: 'a.txt', size: 1, mtime: nowMs - DAY }], nowMs, settings: lib.normalizeSettings(null) });
  eq(plan.ops[0].toRel, '20261102-a.txt');
  eq(plan.ops[0].action, 'rename');
});

t('planForRoot: dedupe 规则产出 dedupeNeeds，不直接产出 op', () => {
  const root = makeRoot();
  const nowMs = Date.now();
  const rules = lib.normalizeRules({ rules: [
    { id: 'dd', name: '去重', priority: 10, rootId: 'r1', match: { exts: ['zip'] }, action: { type: 'dedupe' } },
  ] }).rules;
  const plan = lib.planForRoot({
    root, rules,
    entries: [
      { rel: 'a.zip', name: 'a.zip', size: 100, mtime: nowMs - 2 * DAY },
      { rel: 'huge.zip', name: 'huge.zip', size: 2 * 1024 * 1024 * 1024, mtime: nowMs - 2 * DAY }, // 超去重上限
    ],
    nowMs,
    settings: lib.normalizeSettings(null),
  });
  eq(plan.ops.length, 0);
  eq(plan.dedupeNeeds.length, 1);
  eq(plan.dedupeNeeds[0].rel, 'a.zip');
  eq(plan.counts.matched, 2);
});

t('planDedupe: 同指纹保留最新，其余进回收站/重复文件（或规则 dest）', () => {
  const fps = [
    { rel: 'a(1).zip', fp: 'X', size: 100, mtime: 1000 },
    { rel: 'a.zip', fp: 'X', size: 100, mtime: 3000 },   // 最新 → 保留
    { rel: 'b.zip', fp: 'Y', size: 100, mtime: 2000 },   // 单成员 → 保留
    { rel: 'a(2).zip', fp: 'X', size: 100, mtime: 2000 },
  ];
  const r1 = lib.planDedupe({ fingerprints: fps, ruleId: 'dd', ruleDest: '', rootPath: 'C:\\D', settings: lib.normalizeSettings(null) });
  eq(r1.dupes, 2);
  eq(r1.ops.length, 2);
  ok(r1.ops.every((o) => o.toRel.startsWith('_FileFlow回收站\\重复文件\\')), r1.ops.map((o) => o.toRel).join(','));
  ok(r1.ops.every((o) => !o.fromRel.includes('a.zip') || o.fromRel === 'a.zip' ? true : true));
  ok(!r1.ops.some((o) => o.fromRel === 'a.zip'), '最新者保留');
  const r2 = lib.planDedupe({ fingerprints: fps, ruleId: 'dd', ruleDest: '压缩包', rootPath: 'C:\\D', settings: lib.normalizeSettings(null) });
  ok(r2.ops[0].toRel.startsWith('压缩包\\重复文件\\'));
});

t('dedupeOps: from 去重（大小写不敏感）', () => {
  const out = lib.dedupeOps([
    { fromRel: 'a.zip', toRel: 'x' },
    { fromRel: 'A.zip', toRel: 'y' },
    { fromRel: 'b.zip', toRel: 'z' },
  ]);
  eq(out.length, 2);
});

// ══════════════════════ 撤销 ══════════════════════════════
t('planUndoOps: ready/blocked/gone 三态', () => {
  const ops = [
    { fromRel: 'a', toRel: 'x\\a', fromAbs: 'C:\\D\\a', toAbs: 'C:\\D\\x\\a', status: 'done' },
    { fromRel: 'b', toRel: 'x\\b', fromAbs: 'C:\\D\\b', toAbs: 'C:\\D\\x\\b', status: 'done' },
    { fromRel: 'c', toRel: 'x\\c', fromAbs: 'C:\\D\\c', toAbs: 'C:\\D\\x\\c', status: 'done' },
    { fromRel: 'd', toRel: 'x\\d', fromAbs: 'C:\\D\\d', toAbs: 'C:\\D\\x\\d', status: 'locked' }, // 非 done 不参与
  ];
  const existence = {
    'c:\\d\\x\\a': true, 'c:\\d\\a': false,          // ready
    'c:\\d\\x\\b': true, 'c:\\d\\b': true,           // blocked（原位被占）
    'c:\\d\\x\\c': false,                            // gone（又被搬走了）
  };
  const plan = lib.planUndoOps(ops, existence);
  eq(plan.length, 3);
  eq(plan[0].state, 'ready');
  eq(plan[1].state, 'blocked');
  eq(plan[2].state, 'gone');
});

// ══════════════════════ 保留清扫 ══════════════════════
t('retentionPlan: result/cmd 过期、plan 保 10、batch 保 60', () => {
  const nowMs = 1_800_000_000_000;
  const keys = [
    'fileflow.result.' + (nowMs - 31 * 60 * 1000),
    'fileflow.result.' + (nowMs - 1 * 60 * 1000),
    'fileflow.cmd.' + (nowMs - 2 * 60 * 60 * 1000),
    ...Array.from({ length: 12 }, (_, i) => `fileflow.plan.${nowMs - i * 1000}`),
    ...Array.from({ length: 65 }, (_, i) => `fileflow.batch.${nowMs - i * 1000}`),
  ];
  const del = lib.retentionPlan(keys, nowMs);
  ok(del.includes('fileflow.result.' + (nowMs - 31 * 60 * 1000)));
  ok(!del.includes('fileflow.result.' + (nowMs - 1 * 60 * 1000)));
  ok(del.includes('fileflow.cmd.' + (nowMs - 2 * 60 * 60 * 1000)));
  eq(del.filter((k) => k.startsWith('fileflow.plan.')).length, 2); // 12 - 10
  eq(del.filter((k) => k.startsWith('fileflow.batch.')).length, 5); // 65 - 60
});

// ══════════════════════ 分类 / 预置包 ══════════════════════
t('categorize: 六类 + other + partial', () => {
  const { counts } = lib.categorize([
    { rel: 'a.exe', name: 'a.exe', size: 1 },
    { rel: 'b.pdf', name: 'b.pdf', size: 1 },
    { rel: 'c.png', name: 'c.png', size: 1 },
    { rel: 'd.mp4', name: 'd.mp4', size: 1 },
    { rel: 'e.js', name: 'e.js', size: 1 },
    { rel: 'f.zip', name: 'f.zip', size: 1 },
    { rel: 'g.xyz', name: 'g.xyz', size: 1 },
    { rel: 'h.crdownload', name: 'h.crdownload', size: 1 },
  ]);
  eq(counts.installs, 1);
  eq(counts.docs, 1);
  eq(counts.images, 1);
  eq(counts.media, 1);
  eq(counts.code, 1);
  eq(counts.archives, 1);
  eq(counts.other, 1);
  eq(counts.partial, 1);
});

t('presetRules: 起步包 7 条全规范化 + rootId 注入', () => {
  const rules = lib.presetRules('downloads', 'root-1');
  eq(rules.length, 7);
  ok(rules.every((r) => r.rootId === 'root-1' && !r.error));
  eq(rules[0].action.type, 'dedupe');
  ok(rules.some((r) => r.match.minAgeDays === 30));
  ok(lib.presetRules('nope', 'x') === null);
});

// ══════════════════════ fsutil（真实临时目录）══════════════════════════
t('fsutil.walkRoot: 递归 + 排除子树 + rel 反斜杠', () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.mkdirSync(path.join(dir, '归档'));
    fs.mkdirSync(path.join(dir, '.hidden'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'x');
    fs.writeFileSync(path.join(dir, '归档', 'c.txt'), 'x');
    fs.writeFileSync(path.join(dir, '.hidden', 'd.txt'), 'x');
    const { entries, truncated } = fsutil.walkRoot(dir, ['归档']);
    eq(truncated, false);
    const rels = entries.map((e) => e.rel).sort();
    eq(rels, ['a.txt', 'sub\\b.txt']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

t('fsutil.fingerprint: 同内容同指纹、异内容异指纹、尾部差异可辨', () => {
  const dir = tmpDir();
  try {
    const big1 = path.join(dir, 'big1.bin');
    const big2 = path.join(dir, 'big2.bin');
    const big3 = path.join(dir, 'big3.bin');
    const buf1 = Buffer.alloc(200 * 1024, 7);
    fs.writeFileSync(big1, buf1);
    fs.writeFileSync(big2, buf1); // 同内容
    fs.writeFileSync(big3, buf1); // 同头但尾部不同
    fs.appendFileSync(big3, Buffer.alloc(1, 9));
    const f1 = fsutil.fingerprint(big1, 200 * 1024);
    const f2 = fsutil.fingerprint(big2, 200 * 1024);
    const f3 = fsutil.fingerprint(big3, 200 * 1024 + 1);
    eq(f1, f2);
    ok(f1 !== f3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

t('fsutil.moveFile: 同盘 rename + 目的目录自动创建 + 冲突覆盖检测留给调用方', () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'src.txt'), 'hello');
    const r = fsutil.moveFile(path.join(dir, 'src.txt'), path.join(dir, 'deep', 'nest', 'dst.txt'));
    eq(r.how, 'rename');
    ok(fs.existsSync(path.join(dir, 'deep', 'nest', 'dst.txt')));
    ok(!fs.existsSync(path.join(dir, 'src.txt')));
    eq(fs.readFileSync(path.join(dir, 'deep', 'nest', 'dst.txt'), 'utf8'), 'hello');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ══════════════════════ 端到端：lib + fsutil 组装（无 kv）══════════════════════════
t('端到端：规则计划 → 执行 → 二次扫描不再命中（目的子树排除）', () => {
  const dir = tmpDir();
  try {
    const old = Date.now() - 40 * DAY;
    for (const f of ['setup.exe', 'notes.pdf', 'clip.png']) {
      fs.writeFileSync(path.join(dir, f), f);
      fs.utimesSync(path.join(dir, f), new Date(old), new Date(old));
    }
    const root = { id: 'r', path: dir, label: '下载', auto: 'off' };
    const rules = lib.normalizeRules({ rules: lib.presetRules('downloads', 'r') });
    const { entries } = fsutil.walkRoot(dir, lib.destPrefixes(rules.rules));
    const plan = lib.planForRoot({ root, rules: rules.rules, entries, nowMs: Date.now(), settings: lib.normalizeSettings(null) });
    const moved = { exe: 0, pdf: 0, png: 0 };
    for (const op of plan.ops) {
      const to = op.toAbs || path.join(dir, op.toRel);
      const r = fsutil.moveFile(path.join(dir, op.fromRel), to);
      ok(r.ok);
      if (op.fromRel.endsWith('.exe')) moved.exe++;
      if (op.fromRel.endsWith('.pdf')) moved.pdf++;
      if (op.fromRel.endsWith('.png')) moved.png++;
    }
    eq(moved.exe, 1);
    eq(moved.pdf, 1);
    eq(moved.png, 1);
    ok(fs.existsSync(path.join(dir, '安装包', String(new Date().getFullYear()) + '-' + String(new Date().getMonth() + 1).padStart(2, '0'), 'setup.exe')));
    ok(fs.existsSync(path.join(dir, '文档', 'notes.pdf')));
    ok(fs.existsSync(path.join(dir, '图片', 'clip.png')));

    // 二次扫描：walk 层已排除目的子树（计划层 prefixes 是双保险），无新计划
    const { entries: e2 } = fsutil.walkRoot(dir, lib.destPrefixes(rules.rules));
    const plan2 = lib.planForRoot({ root, rules: rules.rules, entries: e2, nowMs: Date.now(), settings: lib.normalizeSettings(null) });
    eq(plan2.ops.length, 0);
    eq(e2.entries.length, 0, '目的子树已被 walk 排除');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ══════════════════════ 回归：kv 回读往返 + 组装 ══════════════════════
t('回归：规则 kv 回读再规范化，null 边界不得变成 0', () => {
  const r = lib.normalizeRule({ name: 'x', action: { type: 'move', dest: 'a' }, match: { exts: ['zip'] } });
  const round = lib.normalizeRule(r); // 服务重启：kv 里的规则会再过一遍 normalizeRule
  eq(round.match.minSizeMB, null);
  eq(round.match.maxSizeMB, null);
  eq(round.match.minAgeDays, null);
  eq(round.match.maxAgeDays, null);
  const nowMs = Date.now();
  ok(lib.matchRule({ rel: 'a.zip', name: 'a.zip', size: 5, mtime: nowMs - DAY }, round, nowMs), '往返后仍能命中');
});

t('assembleOps: 判重文件让位（去重 op 在前，类别 op 移除）', () => {
  const ruleOps = [
    { fromRel: 'a.zip', toRel: '压缩包\\a.zip', ruleId: 'zip', action: 'move', safe: true },
    { fromRel: 'b.zip', toRel: '压缩包\\b.zip', ruleId: 'zip', action: 'move', safe: true },
  ];
  const dedupe = { ops: [{ fromRel: 'a(1).zip', toRel: '_FileFlow回收站\\重复文件\\a(1).zip', ruleId: 'dd', action: 'dedupe', safe: true }] };
  // a(1).zip 与 a.zip 同内容：a(1) 是 loser。若类别 op 里也有 a(1)（它也匹配 zip 规则）应被移除
  ruleOps.push({ fromRel: 'a(1).zip', toRel: '压缩包\\a(1).zip', ruleId: 'zip', action: 'move', safe: true });
  const out = lib.assembleOps(ruleOps, dedupe);
  eq(out.length, 3); // 去重 1 + 保留的类别 op 2（a(1) 的类别 op 已移除）
  eq(out[0].action, 'dedupe'); // 去重在前
  ok(!out.some((o) => o.fromRel === 'a(1).zip' && o.action === 'move'), 'loser 的类别 op 已让位');
  ok(out.some((o) => o.fromRel === 'a.zip' && o.action === 'move'), '保留最新者照常归档');
});

t('端到端：撤销批次（移动 → undo 计划 → 回移还原）', () => {  const dir = tmpDir();
  try {
    const old = Date.now() - 40 * DAY;
    fs.writeFileSync(path.join(dir, 'x.exe'), 'X');
    fs.utimesSync(path.join(dir, 'x.exe'), new Date(old), new Date(old));
    const fromAbs = path.join(dir, 'x.exe');
    const toAbs = path.join(dir, '安装包', 'x.exe');
    fsutil.moveFile(fromAbs, toAbs);

    const batchOps = [{ fromRel: 'x.exe', toRel: '安装包\\x.exe', fromAbs, toAbs, status: 'done', action: 'move' }];
    const existence = {
      [toAbs.toLowerCase()]: fs.existsSync(toAbs),
      [fromAbs.toLowerCase()]: fs.existsSync(fromAbs),
    };
    const undoPlan = lib.planUndoOps(batchOps, existence);
    eq(undoPlan.length, 1);
    eq(undoPlan[0].state, 'ready');
    fsutil.moveFile(path.join(dir, undoPlan[0].fromRel), path.join(dir, undoPlan[0].toRel));
    ok(fs.existsSync(fromAbs));
    ok(!fs.existsSync(toAbs));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ══════════════════════ 汇总 ══════════════════════
console.log(`\nfile-flow 离线单测：${passed} 通过，${failed} 失败`);
if (failures.length) {
  console.log('\n' + failures.join('\n'));
  process.exit(1);
}
