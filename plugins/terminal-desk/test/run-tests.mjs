/**
 * terminal-desd core 逻辑测试（node --test test/run-tests.mjs）
 * 离线、零宿主依赖。覆盖：
 *  - 会话表 upsert/markExited/remove/自动命名
 *  - 危险命令确认（含大小写与边界：'format ' 带尾空格、'git clean -fd' 前缀族）
 *  - 自定义命令 schema 脏数据防御（非对象/缺字段/createdAt 归零）
 *  - makeCustomCommand 空名回落命令截断
 *  - setRuntime 保留未指定字段
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../shared/td-core.js';

const readSrc = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('upsertSession: 不存在追加；存在合并且不改引用外元素', () => {
  const a = { id: 's1', name: 'A', exitCode: null };
  const b = { id: 's2', name: 'B', exitCode: null };
  let list = core.upsertSession([], a);
  assert.equal(list.length, 1);
  list = core.upsertSession(list, b);
  assert.equal(list.length, 2);
  const merged = core.upsertSession(list, { id: 's1', name: 'A2', exitCode: 0 });
  assert.equal(merged[0].name, 'A2');
  assert.equal(merged[0].exitCode, 0);
  assert.equal(merged[1], b); // 其余元素引用保持
  assert.equal(list[0].name, 'A'); // 原表不可变
});

test('markExited: 命中标记 exitCode；未命中原样返回等值', () => {
  const list = [{ id: 's1', name: 'A', exitCode: null }, { id: 's2', name: 'B', exitCode: null }];
  const next = core.markExited(list, 's2', 1);
  assert.equal(next[1].exitCode, 1);
  assert.equal(next[0].exitCode, null);
  assert.equal(list[1].exitCode, null);
});

test('removeSession: 只删命中', () => {
  const list = [{ id: 's1', name: 'A', exitCode: null }, { id: 's2', name: 'B', exitCode: null }];
  assert.equal(core.removeSession(list, 's1').length, 1);
  assert.equal(core.removeSession(list, 'nope').length, 2);
});

test('nextSessionName: Terminal N = 数量 + 1（与内置一致）', () => {
  assert.equal(core.nextSessionName([]), 'Terminal 1');
  assert.equal(core.nextSessionName([{ id: 'a', name: 'x', exitCode: null }]), 'Terminal 2');
});

test('isDangerousCommand: 六类命中 + 大小写无关 + 无误杀普通命令', () => {
  assert.equal(core.isDangerousCommand('rm -rf /'), true);
  assert.equal(core.isDangerousCommand('RM -RF /'), true);
  assert.equal(core.isDangerousCommand('del /s /q C:\\x'), true);
  assert.equal(core.isDangerousCommand('rmdir /s build'), true);
  assert.equal(core.isDangerousCommand('git clean -fdx'), true);
  assert.equal(core.isDangerousCommand('format c:'), true); // 'format ' 带尾空格模式
  assert.equal(core.isDangerousCommand('git clean -n'), false);
  assert.equal(core.isDangerousCommand('pnpm test'), false);
  assert.equal(core.isDangerousCommand(''), false);
});

test('confirmMessageFor: 危险带文案含命令原文；安全返回空串', () => {
  assert.ok(core.confirmMessageFor('rm -rf /').includes('rm -rf /'));
  assert.equal(core.confirmMessageFor('ls'), '');
});

test('parseCustomCommands: 非数组/缺字段丢弃；createdAt 脏数据归零；合法保留', () => {
  const parsed = core.parseCustomCommands({
    customCommands: [
      { id: 'user:1', name: 't', command: 'pnpm test', createdAt: 123 },
      { id: 'user:2', name: 'bad' }, // 缺 command
      { id: 'user:3', command: 'x' }, // 缺 name
      'junk',
      null,
      { id: 42, name: 'n', command: 'c' }, // id 非字符串
      { id: 'user:4', name: 't2', command: 'ls', createdAt: 'yesterday' }, // createdAt 脏
    ],
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].createdAt, 123);
  assert.equal(parsed[1].createdAt, 0);
  assert.deepEqual(core.parseCustomCommands(null), []);
  assert.deepEqual(core.parseCustomCommands({ customCommands: 'nope' }), []);
  assert.deepEqual(core.parseCustomCommands('junk'), []);
});

test('makeCustomCommand: 空名回落命令截断 40；id 形状 user:', () => {
  const c = core.makeCustomCommand('', 'x'.repeat(60));
  assert.ok(c.id.startsWith('user:'));
  assert.equal(c.name.length, 40);
  assert.equal(c.command, 'x'.repeat(60));
  const named = core.makeCustomCommand('  测试  ', ' ls ');
  assert.equal(named.name, '测试');
  assert.equal(named.command, 'ls');
});

test('setRuntime: patch 合并保留未指定字段；lastRunAt 刷新', () => {
  const rt = core.setRuntime({}, 's1', { status: 'running' });
  assert.equal(rt.s1.status, 'running');
  const rt2 = core.setRuntime(rt, 's1', { terminalSessionId: 't1' });
  assert.equal(rt2.s1.status, 'running'); // 保留
  assert.equal(rt2.s1.terminalSessionId, 't1');
  assert.ok(rt2.s1.lastRunAt >= rt.s1.lastRunAt);
});

// ---------------------------------------------------------------------------
// v0.3 改造：配置 schema / 会话恢复 / 旧数据导入 / 自动运行
// ---------------------------------------------------------------------------

test('parsePluginConfig: 汇总六个分区并对脏数据兜底', () => {
  const parsed = core.parsePluginConfig({
    customCommands: [{ id: 'user:1', name: 'test', command: 'pnpm test' }],
    hiddenScriptIds: ['pkg:build', 42, null],
    autoRunRules: { 'pkg:dev': { enabled: true, trigger: 'app_start', confirm: true }, bad: null },
    sessionNames: { s1: '  我的终端  ', s2: '', s3: 9 },
    uiState: { scriptCenterCollapsed: false, scriptTab: 'custom', focusMode: true },
    legacyMigration: 'v1',
  });
  assert.equal(parsed.customCommands.length, 1);
  assert.equal(parsed.customCommands[0].autoRun, false);
  assert.equal(parsed.customCommands[0].enabled, true);
  assert.deepEqual(parsed.hiddenScriptIds, ['pkg:build']);
  assert.deepEqual(parsed.autoRunRules['pkg:dev'], { enabled: true, trigger: 'app_start', confirm: true });
  assert.deepEqual(parsed.sessionNames, { s1: '我的终端' });
  assert.deepEqual(parsed.uiState, { scriptCenterCollapsed: false, scriptTab: 'custom', focusMode: true });
  assert.equal(parsed.legacyMigration, 'v1');
  const empty = core.parsePluginConfig(null);
  assert.deepEqual(empty.customCommands, []);
  assert.equal(empty.uiState.scriptCenterCollapsed, true); // 默认折叠（v4 基线）
  assert.equal(empty.uiState.scriptTab, 'project');
  assert.equal(empty.uiState.focusMode, false);
});

test('parseCustomCommands: 扩展字段规范化（autoRun/trigger/env/enabled）', () => {
  const parsed = core.parseCustomCommands({
    customCommands: [
      { id: 'user:1', name: 'dev', command: 'pnpm dev', autoRun: true, autoRunTrigger: 'bad', env: { A: '1' }, tags: ['x', 3] },
      { id: 'user:2', name: 'off', command: 'ls', enabled: false, confirmBeforeAutoRun: 'yes' },
    ],
  });
  assert.equal(parsed[0].autoRunTrigger, 'workspace_open');
  assert.deepEqual(parsed[0].env, { A: '1' });
  assert.deepEqual(parsed[0].tags, ['x']);
  assert.equal(parsed[1].enabled, false);
  assert.equal(parsed[1].confirmBeforeAutoRun, false);
});

test('mergeRecoveredSessions: 过滤 closed / 保留本地退出态 / 丢弃孤立 / 追加新会话', () => {
  const local = [
    { id: 'a', name: 'A', exitCode: 2 },
    { id: 'ghost', name: 'G', exitCode: null },
  ];
  const remote = [
    { id: 'a', name: 'A-remote', closed: false, scriptId: 'script:1', cwd: '/repo' },
    { id: 'b', name: 'B', closed: false },
    { id: 'c', name: 'C', closed: true },
  ];
  const { sessions, recoveredIds } = core.mergeRecoveredSessions(local, remote);
  assert.deepEqual(sessions.map((s) => s.id), ['a', 'b']);
  assert.equal(sessions[0].exitCode, 2); // 本地 UI 态保留
  assert.equal(sessions[0].name, 'A-remote'); // 名称以宿主为准
  assert.equal(sessions[1].scriptId, undefined);
  assert.deepEqual(recoveredIds, ['b']);
  assert.deepEqual(core.mergeRecoveredSessions([], null).sessions, []);
});

test('selectRecentScript: 运行中优先，其次最近运行，最后首项', () => {
  const scripts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(core.selectRecentScript(scripts, { b: { status: 'running', lastRunAt: 1 } }).id, 'b');
  assert.equal(core.selectRecentScript(scripts, { c: { status: 'success', lastRunAt: 99 } }).id, 'c');
  assert.equal(core.selectRecentScript(scripts, {}).id, 'a');
  assert.equal(core.selectRecentScript([], {}), null);
});

test('autoRunCandidates: 触发器匹配 / seenKeys 去重 / 确认标记 / 规则表合并', () => {
  const commands = [
    { id: 'user:1', autoRun: true, autoRunTrigger: 'app_start', confirmBeforeAutoRun: true },
    { id: 'user:2', autoRun: true, autoRunTrigger: 'workspace_open' },
    { id: 'user:3', autoRun: false, autoRunTrigger: 'terminal_open' },
  ];
  const rules = { 'pkg:dev': { enabled: true, trigger: 'workspace_open', confirm: false } };
  const first = core.autoRunCandidates(commands, rules, 'app_start', '/repo', new Set());
  assert.equal(first.length, 1);
  assert.equal(first[0].needsConfirm, true);
  assert.equal(first[0].key, 'app_start|/repo|user:1');
  const second = core.autoRunCandidates(commands, rules, 'workspace_open', '/repo', new Set());
  assert.deepEqual(second.map((c) => c.id).sort(), ['pkg:dev', 'user:2']);
  const seen = new Set(second.map((c) => c.key));
  assert.equal(core.autoRunCandidates(commands, rules, 'workspace_open', '/repo', seen).length, 0);
  assert.equal(core.autoRunCandidates(commands, rules, 'bad-trigger', '/repo', new Set()).length, 0);
});

test('parseLegacyTerminalScripts: 只导 user / 路径归一 / hidden 带出 / 幂等 id', () => {
  const raw = {
    terminalScripts: {
      'D:\\repo\\': {
        scripts: [
          { id: 'user:1', name: '本地测试', command: 'pnpm test', source: 'user', cwd: 'D:\\repo', env: { CI: '1' }, autoRun: true, autoRunTrigger: 'app_start' },
          { id: 'pkg:dev', name: 'dev', command: 'pnpm dev', source: 'package.json' },
          { id: 'user:2', name: '空命令', command: '   ', source: 'user' },
        ],
        hiddenDiscoveredScriptIds: ['pkg:build'],
      },
      '/other': {
        scripts: [{ id: 'user:3', name: '别的仓库', command: 'ls', source: 'user' }],
      },
    },
  };
  const result = core.parseLegacyTerminalScripts(raw, 'd:/repo');
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].name, '本地测试');
  assert.equal(result.commands[0].source, 'legacy');
  assert.equal(result.commands[0].autoRunTrigger, 'app_start');
  assert.deepEqual(result.commands[0].env, { CI: '1' });
  assert.deepEqual(result.hiddenScriptIds, ['pkg:build']);
  assert.deepEqual(core.parseLegacyTerminalScripts(raw, 'd:/repo').commands[0].id, result.commands[0].id);
  assert.equal(core.parseLegacyTerminalScripts(raw, null).commands.length, 2);
  assert.deepEqual(core.parseLegacyTerminalScripts('junk', null), { commands: [], hiddenScriptIds: [] });
});

test('mergeImportedCommands / mergeHiddenIds: 按 id 幂等，返回新增数量', () => {
  const existing = [{ id: 'user:1' }];
  const merged = core.mergeImportedCommands(existing, [{ id: 'user:1' }, { id: 'legacy:a' }, null]);
  assert.equal(merged.addedCount, 1);
  assert.deepEqual(merged.commands.map((c) => c.id), ['user:1', 'legacy:a']);
  assert.equal(core.mergeImportedCommands(merged.commands, [{ id: 'legacy:a' }]).addedCount, 0);
  assert.deepEqual(core.mergeHiddenIds(['a', 3], ['b', 'a']), ['a', 'b']);
});

test('isLightThemeId: 兼容 light / 自定义浅色主题命名，不误判 dark', () => {
  assert.equal(core.isLightThemeId('light'), true);
  assert.equal(core.isLightThemeId('my-light-soft'), true);
  assert.equal(core.isLightThemeId('dark'), false);
  assert.equal(core.isLightThemeId(''), false);
  assert.equal(core.isLightThemeId('high-contrast-dark'), false);
});

test('stableHash / normalizePath: 稳定且跨平台归一', () => {
  assert.equal(core.stableHash('abc'), core.stableHash('abc'));
  assert.notEqual(core.stableHash('abc'), core.stableHash('abd'));
  assert.equal(core.normalizePath('D:\\Repo\\'), 'd:/repo');
  assert.equal(core.normalizePath(''), '');
});

test('右键菜单：按面板坐标域换算，且边界按域而非 window 收敛', () => {
  // 宿主 LeftPanel 的 contain:paint 让 fixed 后代以面板为基准；内置
  // TerminalScriptPanel.tsx:238-249 已做换算，插件不得直接塞 clientX/Y。
  const overlays = readSrc('Overlays.tsx');
  assert.match(overlays, /data-panel-coordinate-domain/);
  assert.match(overlays, /clientX\s*-\s*\(rect\?\.left/);
  assert.match(overlays, /anchor\.width/);
  assert.doesNotMatch(overlays, /window\.innerWidth\s*-\s*196/);
  for (const file of ['Panel.tsx', 'ScriptCenter.tsx']) {
    const src = readSrc(file);
    assert.match(src, /menuPointFromEvent\(e\)/, `${file} 未使用坐标域换算`);
    assert.doesNotMatch(src, /x:\s*e\.clientX/, `${file} 仍把 clientX 直接当 fixed 坐标`);
  }
});

test('右键菜单：脚本项覆盖内置终端的复制命令与重跑语义', () => {
  const src = readSrc('ScriptCenter.tsx');
  assert.match(src, /label: '复制命令'/);
  assert.match(src, /label: running \? '重新运行' : '运行'/);
  assert.match(src, /label: '在外部终端运行'/);
});
