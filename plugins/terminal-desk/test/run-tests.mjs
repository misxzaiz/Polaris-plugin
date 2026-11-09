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
import * as core from '../shared/td-core.js';

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
