#!/usr/bin/env node
/**
 * history-desk 离线单测（node test/run-tests.mjs）
 *
 * 策略：pure.ts 为纯逻辑核，测试直接以 node:module 的 TypeScript 剥离能力
 * （node 24 内建 --experimental-strip-types 语义）加载；不引入运行时依赖。
 * 覆盖：日期分组 / 相对时间 / snippet 解析 / 继续工作卡 / Fork 统计 /
 * 树构建与扁平化 / 删除确认门槛 / 引擎筛选 / 生命周期信封解析 / 精简渲染模型。
 * 另含 manifest 契约检查（overlays 声明、panel entry、样式同步）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = dirname(fileURLToPath(new URL(import.meta.url)));
const pluginRoot = dirname(root);

// ── pure.ts 加载：typescript transpile（devDependency；无则失败明确）────────
let pure;
{
  const tsSrc = readFileSync(join(pluginRoot, 'src/pure.ts'), 'utf-8');
  let js;
  try {
    // eslint-disable-next-line import/no-unresolved
    const tsmod = (await import('typescript')).default;
    const out = tsmod.transpileModule(tsSrc, {
      compilerOptions: { target: 'ES2022', module: 'ESNext' },
    });
    js = out.outputText;
  } catch {
    throw new Error('需要 typescript 依赖转译 pure.ts（npm install 后重试）');
  }
  const tmpDir = mkdtempSync(join(tmpdir(), 'history-desk-'));
  const tmpFile = join(tmpDir, 'pure.mjs');
  writeFileSync(tmpFile, js);
  pure = await import(`file://${tmpFile.split('\\').join('/')}`);
}

// ── 日期分组 ────────────────────────────────────────────────────────────────
test('getDateGroup: 今天/昨天/本周/更早', () => {
  const now = new Date(2026, 10, 13, 12, 0, 0); // 2026-11-13 12:00
  assert.equal(pure.getDateGroup('2026-11-13T09:00:00', now), 'today');
  assert.equal(pure.getDateGroup('2026-11-12T23:00:00', now), 'yesterday');
  assert.equal(pure.getDateGroup('2026-11-08T08:00:00', now), 'thisWeek');
  assert.equal(pure.getDateGroup('2026-11-01T08:00:00', now), 'earlier');
});

test('getDateGroup: 非法时间戳安全回落 earlier', () => {
  assert.equal(pure.getDateGroup('not-a-date'), 'earlier');
});

test('groupByDate: 全组归位且不丢条目', () => {
  const now = new Date(2026, 10, 13, 12, 0, 0);
  const items = [
    { id: 'a', timestamp: '2026-11-13T09:00:00' },
    { id: 'b', timestamp: '2026-11-12T09:00:00' },
    { id: 'c', timestamp: '2026-11-10T09:00:00' },
    { id: 'd', timestamp: '2026-10-01T09:00:00' },
  ];
  const groups = pure.groupByDate(items, now);
  assert.deepEqual(groups.today.map((x) => x.id), ['a']);
  assert.deepEqual(groups.yesterday.map((x) => x.id), ['b']);
  assert.deepEqual(groups.thisWeek.map((x) => x.id), ['c']);
  assert.deepEqual(groups.earlier.map((x) => x.id), ['d']);
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  assert.equal(total, 4);
});

// ── 相对时间 ────────────────────────────────────────────────────────────────
test('relativeTimeParts: 刚刚/分钟/小时', () => {
  const now = new Date(2026, 10, 13, 12, 0, 0);
  assert.equal(pure.relativeTimeParts('2026-11-13T11:59:30', now).key, 'history.justNow');
  const mins = pure.relativeTimeParts('2026-11-13T11:30:00', now);
  assert.equal(mins.key, 'history.minutesAgo');
  assert.equal(mins.count, 30);
  const hours = pure.relativeTimeParts('2026-11-13T06:00:00', now);
  assert.equal(hours.key, 'history.hoursAgo');
  assert.equal(hours.count, 6);
});

// ── 文件大小 ────────────────────────────────────────────────────────────────
test('formatFileSize: 0/空 → 空串，1024 → 1 KB', () => {
  assert.equal(pure.formatFileSize(0), '');
  assert.equal(pure.formatFileSize(null), '');
  assert.equal(pure.formatFileSize(1024), '1 KB');
  assert.equal(pure.formatFileSize(1536), '1.5 KB');
});

// ── snippet 解析（[hit] 包裹）──────────────────────────────────────────────
test('parseSnippet: 命中片段切分', () => {
  const parts = pure.parseSnippet('前文[命中词]后文');
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], { hit: false, s: '前文' });
  assert.deepEqual(parts[1], { hit: true, s: '命中词' });
  assert.deepEqual(parts[2], { hit: false, s: '后文' });
});

test('parseSnippet: 无命中整段 plain', () => {
  assert.deepEqual(pure.parseSnippet('普通文本'), [{ hit: false, s: '普通文本' }]);
});

test('parseSnippet: 20 段防死循环护栏', () => {
  const text = Array.from({ length: 50 }, () => '[x]').join('');
  const parts = pure.parseSnippet(text);
  assert.ok(parts.length <= 21, `parts=${parts.length}`);
});

// ── 继续工作卡 ──────────────────────────────────────────────────────────────
test('pickContinueItems: 置顶优先 + 最近 N + 筛选态清空', () => {
  const items = [
    { id: 'r1', timestamp: '2026-11-13T09:00:00', pinned: false },
    { id: 'r2', timestamp: '2026-11-13T08:00:00', pinned: true },
    { id: 'r3', timestamp: '2026-11-13T07:00:00', pinned: false },
  ];
  const picked = pure.pickContinueItems(items, 2, { searching: false, starredOnly: false, showArchived: false });
  // 置顶优先 + 最近 N：r2 置顶，非置顶取最近 2 条（r1、r3）→ 合并后截断 max(2, 1+1)=2
  assert.deepEqual(picked.map((x) => x.id), ['r2', 'r1']);
  // 搜索/星标/归档筛选态不显示
  assert.equal(pure.pickContinueItems(items, 2, { searching: true, starredOnly: false, showArchived: false }).length, 0);
  assert.equal(pure.pickContinueItems(items, 2, { searching: false, starredOnly: true, showArchived: false }).length, 0);
  assert.equal(pure.pickContinueItems(items, 2, { searching: false, starredOnly: false, showArchived: true }).length, 0);
  // recentCards=0 关闭
  assert.equal(pure.pickContinueItems(items, 0, { searching: false, starredOnly: false, showArchived: false }).length, 0);
});

// ── Fork 统计 ───────────────────────────────────────────────────────────────
test('forkStats: fork 与 pr 计数', () => {
  const items = [
    { id: 'a', timestamp: '', parentSessionId: 'p' },
    { id: 'b', timestamp: '', childSessionIds: ['c1'] },
    { id: 'c', timestamp: '', linkedPr: { number: 1 } },
    { id: 'd', timestamp: '' },
  ];
  const s = pure.forkStats(items);
  assert.equal(s.forkCount, 2);
  assert.equal(s.prCount, 1);
});

// ── 树构建 ──────────────────────────────────────────────────────────────────
test('buildTree: 父子挂接 + 时间倒序 + 层级', () => {
  const sessions = [
    { id: 'root1', timestamp: '2026-11-13T09:00:00' },
    { id: 'child1', timestamp: '2026-11-13T10:00:00', parentSessionId: 'root1' },
    { id: 'root2', timestamp: '2026-11-13T11:00:00' },
    { id: 'grandchild', timestamp: '2026-11-13T12:00:00', parentSessionId: 'child1' },
    { id: 'orphan', timestamp: '2026-11-13T13:00:00', parentSessionId: 'missing-parent' },
  ];
  const tree = pure.buildTree(sessions);
  // root2(11:00) 最新在前；orphan 父缺失 → 根
  assert.deepEqual(tree.map((n) => n.session.id), ['orphan', 'root2', 'root1']);
  const root1 = tree.find((n) => n.session.id === 'root1');
  assert.equal(root1.children.length, 1);
  const child1 = root1.children[0];
  assert.equal(child1.session.id, 'child1');
  assert.equal(child1.level, 1);
  assert.equal(child1.children[0].session.id, 'grandchild');
  assert.equal(child1.children[0].level, 2);
});

test('flattenTree: 展开深度优先', () => {
  const tree = pure.buildTree([
    { id: 'root', timestamp: '2026-01-01T00:00:00' },
    { id: 'c1', timestamp: '2026-01-01T00:00:00', parentSessionId: 'root' },
    { id: 'c2', timestamp: '2026-01-01T00:00:00', parentSessionId: 'root' },
  ]);
  const flat = pure.flattenTree(tree, new Set(['root']));
  assert.deepEqual(flat.map((n) => n.session.id), ['root', 'c1', 'c2']);
  const flatClosed = pure.flattenTree(tree, new Set());
  assert.deepEqual(flatClosed.map((n) => n.session.id), ['root']);
});

// ── 删除确认门槛（UX-4）────────────────────────────────────────────────────
test('needsDeleteConfirm: ≤2 条消息跳过确认', () => {
  assert.equal(pure.needsDeleteConfirm({ messageCount: 0 }), false);
  assert.equal(pure.needsDeleteConfirm({ messageCount: 2 }), false);
  assert.equal(pure.needsDeleteConfirm({ messageCount: 3 }), true);
});

// ── 引擎筛选 ────────────────────────────────────────────────────────────────
test('historyEnginesForFilter: all 空数组、已知插件引擎、未知回落空', () => {
  assert.deepEqual(pure.historyEnginesForFilter('all', ['x']), []);
  assert.deepEqual(pure.historyEnginesForFilter('claude-code', []), ['claude-code']);
  assert.deepEqual(pure.historyEnginesForFilter('simple-ai', []), ['simple-ai']);
  assert.deepEqual(pure.historyEnginesForFilter('my-engine', ['my-engine']), ['my-engine']);
  assert.deepEqual(pure.historyEnginesForFilter('unknown-engine', ['claude-code']), []);
});

// ── 生命周期事件信封 ────────────────────────────────────────────────────────
test('parseLifecycleEnvelope: session_start/end 解析', () => {
  const ok = pure.parseLifecycleEnvelope({
    payload: { payload: { type: 'session_start', sessionId: 's1', engineId: 'claude-code' } },
  });
  assert.deepEqual(ok, { type: 'session_start', sessionId: 's1', engineId: 'claude-code', reason: undefined });
  const end = pure.parseLifecycleEnvelope({
    payload: { payload: { type: 'session_end', sessionId: 's1', reason: 'completed' } },
  });
  assert.equal(end.type, 'session_end');
  assert.equal(end.reason, 'completed');
});

test('parseLifecycleEnvelope: 非生命周期/缺 sessionId 拒绝', () => {
  assert.equal(pure.parseLifecycleEnvelope({ payload: { payload: { type: 'token' } } }), null);
  assert.equal(pure.parseLifecycleEnvelope({ payload: { payload: { type: 'session_start' } } }), null);
  assert.equal(pure.parseLifecycleEnvelope(null), null);
  assert.equal(pure.parseLifecycleEnvelope({}), null);
});

// ── 精简渲染模型 ────────────────────────────────────────────────────────────
test('toRenderMessage: text 块拼接 + user/assistant 分流', () => {
  const m = pure.toRenderMessage(
    { id: 'm1', type: 'assistant', blocks: [{ type: 'text', content: '你好' }, { type: 'text', content: '世界' }] },
    'fb',
  );
  assert.equal(m.id, 'm1');
  assert.equal(m.role, 'assistant');
  assert.equal(m.text, '你好世界');
  const u = pure.toRenderMessage({ id: 'u1', type: 'user', content: '问题' }, 'fb');
  assert.equal(u.role, 'user');
  assert.equal(u.text, '问题');
});

test('toRenderMessage: thinking 块 + 工具调用摘要', () => {
  const m = pure.toRenderMessage(
    {
      id: 'm2',
      type: 'assistant',
      blocks: [
        { type: 'thinking', content: '思考中' },
        { type: 'tool_call', id: 't1', name: 'read_file', status: 'completed', output: 'ok' },
        { type: 'text', content: '结果' },
      ],
    },
    'fb',
  );
  assert.equal(m.thinking, '思考中');
  assert.equal(m.toolCalls.length, 1);
  assert.equal(m.toolCalls[0].name, 'read_file');
  assert.equal(m.toolCalls[0].status, 'completed');
});

test('toRenderMessage: 非消息类型 / 缺 id 兜底', () => {
  assert.equal(pure.toRenderMessage({ type: 'system' }, 'fb'), null);
  const m = pure.toRenderMessage({ type: 'user', content: 'x' }, 'fallback-id');
  assert.equal(m.id, 'fallback-id');
});

// ── manifest 契约 ───────────────────────────────────────────────────────────
test('plugin.json: overlays 声明 session-history shadow + panel entry', () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf-8'));
  assert.equal(manifest.id, 'history-desk');
  // P2 起翻默认接管（P0-P1 共存期为 false；翻默认经 P2 对照清单 12 项全过后落定）
  assert.equal(manifest.enabledByDefault, true, 'P2 接管版默认启用');
  const overlays = manifest.contributes.overlays;
  assert.ok(Array.isArray(overlays) && overlays.length === 1);
  assert.equal(overlays[0].slot, 'session-history');
  assert.equal(overlays[0].mode, 'shadow');
  assert.equal(overlays[0].panelType, 'history-desk');
  assert.equal(manifest.contributes.panel.entry, './dist/panel.js');
  // 权限最小面：仅 appConfigRead（偏好持久化）
  assert.deepEqual(manifest.permissions, { appConfigRead: true });
  // 无 views（纯 overlay，不占活动栏）
  assert.equal(manifest.contributes.views, undefined);
});

test('styles.css 与 plugin.json 内联样式同步（构建后必须一致）', () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf-8'));
  const inline = manifest.contributes.styles.find((s) => s.id === 'panel');
  assert.ok(inline, 'styles[panel] 缺失');
  // 源文件是占位说明；内联应是完整样式（构建脚本同步）。检查关键前缀存在。
  assert.ok(inline.css.includes('.hd-root'), '内联样式缺 .hd-root');
  assert.ok(inline.css.includes('hd-row'), '内联样式缺行样式');
});

test('样式纪律：无硬编码 HEX / 无裸 border 变量 / 无外联 url', () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf-8'));
  const css = manifest.contributes.styles.find((s) => s.id === 'panel').css;
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const hex = [...code.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
  assert.equal(hex.length, 0, `硬编码 HEX: ${[...new Set(hex)].join(', ')}`);
  const bareBorder = [...code.matchAll(/rgb\(\s*var\(\s*--c-border\s*\)\s*\)/gi)];
  assert.equal(bareBorder.length, 0, 'border 变量必须带 alpha');
  assert.ok(!/url\(\s*['"]?https?:/i.test(code), '禁止外联 url');
  assert.ok(!/@import\b/i.test(code), '禁止 @import');
});
