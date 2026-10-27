/**
 * sources.js 单元测试（node --test，零外部依赖；全部用临时目录合成数据）
 *
 * 覆盖：claude JSONL 解析（侧链/标题回填/命令注入剥壳/坏行跳过/首用户消息兜底）、
 * polaris dialogs 首行 meta 扫描、zcode db.sqlite 只读扫描（合成库）。
 * 只读铁律的断言：scanZcode 打开为 readOnly，扫后文件 mtime 不变。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sources = require('../service/sources.js');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── claude JSONL 解析 ───────────────────────────────────────────────────────

test('parseClaudeFile：usage 提取 / 侧链计入 / summary 回填 / 坏行跳过', () => {
  const dir = tmpDir('abacus-claude-');
  const file = path.join(dir, 'p1', 'a.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = '2026-10-28T01:00:00.000Z';
  const lines = [
    JSON.stringify({ type: 'user', sessionId: 's-c1', cwd: 'D:\\work\\projA', message: { content: '帮我修宽度计算的问题' } }),
    JSON.stringify({ type: 'assistant', uuid: 'u1', sessionId: 's-c1', cwd: 'D:\\work\\projA', timestamp: ts, message: { model: 'claude-sonnet-4', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 } } }),
    JSON.stringify({ type: 'summary', summary: '修宽度' }),
    '{ this is not json',
    JSON.stringify({ type: 'assistant', uuid: 'u2', sessionId: 's-c1', isSidechain: true, timestamp: ts, message: { model: 'claude-haiku-4', usage: { input_tokens: 200, output_tokens: 30 } } }),
    JSON.stringify({ type: 'assistant', uuid: 'u3', sessionId: 's-c1', timestamp: ts, message: { model: 'no-usage-model' } }), // 无 usage 跳过
  ];
  fs.writeFileSync(file, lines.join('\n'));
  const entries = sources.parseClaudeFile(file, 'p1/a');
  assert.equal(entries.length, 2);
  // summary 行在 assistant 之后仍应回填标题
  assert.equal(entries[0].title, '修宽度');
  assert.equal(entries[1].title, '修宽度');
  assert.equal(entries[0].agent, 'claude-main');
  assert.equal(entries[1].agent, 'claude-subagent'); // 侧链计入成本账
  assert.equal(entries[0].fin, 100); // Anthropic 口径：input 不含缓存
  assert.equal(entries[0].cr, 900);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseClaudeFile：标题兜底链 = summary → 首条真实用户消息；命令注入与 hook 壳不算标题', () => {
  const dir = tmpDir('abacus-claude2-');
  const file = path.join(dir, 'p2', 'b.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = '2026-10-28T01:00:00.000Z';
  const lines = [
    JSON.stringify({ type: 'user', sessionId: 's1', message: { content: '<command-name>/clear</command-name>' } }), // 命令注入，不当标题
    JSON.stringify({ type: 'user', sessionId: 's1', message: { content: 'A session-scoped Stop hook is now active with condition: "写完冒烟"' } }), // hook 壳剥出意图
    JSON.stringify({ type: 'assistant', uuid: 'u1', sessionId: 's1', timestamp: ts, message: { model: 'm', usage: { input_tokens: 10, output_tokens: 1 } } }),
  ];
  fs.writeFileSync(file, lines.join('\n'));
  const entries = sources.parseClaudeFile(file, 'p2/b');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, '写完冒烟'); // 剥壳 + 兜底
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanClaude：mtime/size 缓存命中跳过解析；变更文件进 changedHints', async () => {
  const dir = tmpDir('abacus-claude3-');
  const file = path.join(dir, 'p1', 'a.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = '2026-10-28T01:00:00.000Z';
  const line = JSON.stringify({ type: 'assistant', uuid: 'u1', sessionId: 's1', timestamp: ts, message: { model: 'm', usage: { input_tokens: 1, output_tokens: 1 } } });
  fs.writeFileSync(file, line);
  const first = await sources.scanClaude(dir, {});
  assert.equal(first.entries.length, 1);
  assert.equal(first.filesScanned, 1);
  const second = await sources.scanClaude(dir, first.cache);
  assert.equal(second.entries.length, 0, '缓存命中不重解析');
  assert.equal(second.filesScanned, 0);
  fs.appendFileSync(file, '\n' + line); // 文件增长
  const third = await sources.scanClaude(dir, second.cache);
  assert.equal(third.filesScanned, 1);
  assert.equal(third.changedHints.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── polaris dialogs 首行 meta ───────────────────────────────────────────────

test('scanPolaris：首行 meta tokenUsage 提取 / 无 tokenUsage 与坏首行跳过', () => {
  const dir = tmpDir('abacus-polaris-');
  const droot = path.join(dir, 'dialogs');
  fs.mkdirSync(droot, { recursive: true });
  fs.writeFileSync(path.join(droot, 'd1.jsonl'), JSON.stringify({
    type: 'meta', externalId: 'p1', title: '记账', engineId: 'zcode',
    workspacePath: 'D:\\work\\projB', updatedAt: '2026-10-28T02:00:00.000Z',
    tokenUsage: { input: 200, output: 80, cacheRead: 50, cacheCreation: 10, costUsd: 0.0123 },
  }) + '\n{"type":"msg"}\n');
  fs.writeFileSync(path.join(droot, 'd2.jsonl'), JSON.stringify({ type: 'meta', externalId: 'p2', title: '无用量', tokenUsage: null }) + '\n');
  fs.writeFileSync(path.join(droot, 'd3.jsonl'), '{"type":"msg"}\n'); // 首行非 meta
  fs.writeFileSync(path.join(droot, 'd4.txt'), '不是 jsonl');
  const r = sources.scanPolaris(dir);
  assert.equal(r.error, '');
  assert.equal(r.files, 3);
  assert.equal(r.withTU, 1);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].hostCost, 0.0123);
  assert.equal(r.entries[0].proj, 'projB');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── zcode db.sqlite（node:sqlite 合成库）───────────────────────────────────

test('scanZcode：合成库逐行归一 / session 软删剔除 / 工具遥测 / since 游标 / 只读', { skip: !sources.sqliteAvailable() && 'node:sqlite 不可用' }, () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = tmpDir('abacus-zcode-');
  const dbFile = path.join(dir, 'zcode', 'db.sqlite');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT, time_deleted INTEGER);
    CREATE TABLE model_usage (
      id INTEGER PRIMARY KEY, session_id TEXT, turn_id TEXT, assistant_message_id TEXT,
      attempt_index INTEGER DEFAULT 0, model_id TEXT, provider_id TEXT, agent TEXT, mode TEXT,
      input_tokens INTEGER DEFAULT 0, cache_read_input_tokens INTEGER DEFAULT 0,
      cache_creation_input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      started_at INTEGER DEFAULT 0, error_type TEXT, retry_count INTEGER DEFAULT 0,
      time_to_first_token_ms INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0
    );
    CREATE TABLE tool_usage (tool_name TEXT, destructive INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0);
  `);
  db.prepare('INSERT INTO session VALUES (?,?,?,?)').run('s-z1', '重构账房', 'D:\\work\\Polaris', 0);
  db.prepare('INSERT INTO session VALUES (?,?,?,?)').run('s-del', '已删除', 'D:\\work\\gone', 12345);
  const ins = db.prepare(`INSERT INTO model_usage (session_id, turn_id, assistant_message_id, attempt_index, model_id, provider_id, agent, mode,
    input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens, started_at, error_type, retry_count, time_to_first_token_ms, duration_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  ins.run('s-z1', 't1', 'm1', 0, 'GLM-5.3-Flash', 'zhipu', 'main', 'ask', 73451, 70464, 0, 241, now - 3600e3, null, 1, 812, 5200);
  ins.run('s-z1', 't2', 'm2', 0, 'mystery-model', 'x', 'main', 'ask', 500, 0, 0, 100, now - 7200e3, 'rate_limited', 0, 0, 0);
  ins.run('s-del', 't3', 'm3', 0, 'GLM-5.3-Flash', 'zhipu', 'main', 'ask', 1000, 0, 0, 500, now - 10 * 86400e3, null, 0, 0, 0);
  ins.run('s-z1', 't4', 'm4', 0, 'GLM-5.3-Flash', 'zhipu', 'main', 'ask', 10, 0, 0, 1, now - 86400e3 - 5000, null, 0, 0, 0);
  const ti = db.prepare('INSERT INTO tool_usage (tool_name, destructive, duration_ms) VALUES (?,?,?)');
  ti.run('Read', 0, 120); ti.run('Read', 0, 80); ti.run('Bash', 1, 3000); ti.run('Edit', 1, 500);
  db.close();

  const before = fs.statSync(dbFile).mtimeMs;
  const r = sources.scanZcode(dbFile, 0);
  assert.equal(r.error, '');
  assert.equal(r.entries.length, 4);
  const e1 = r.entries.find((e) => e.k === 'z:s-z1:t1:m1:0');
  assert.equal(e1.fin, 2987); // 口径实证行
  assert.equal(e1.title, '重构账房');
  assert.equal(e1.proj, 'Polaris');
  assert.equal(e1.retry, 1);
  const e2 = r.entries.find((e) => e.sid === 's-del');
  assert.equal(e2.title, '', '软删 session 不供标题/目录');
  assert.equal(e2.proj, '');
  assert.equal(r.turns, 4);
  assert.equal(r.tools.total, 4);
  assert.equal(r.tools.destructive, 2);
  assert.deepEqual(r.tools.byName[0], { name: 'Read', n: 2, destructive: 0, avgDurMs: 100 });

  // 增量游标：只取 started_at > since
  const r2 = sources.scanZcode(dbFile, now - 7200e3);
  assert.equal(r2.entries.length, 2);
  assert.equal(r2.maxTs, now - 3600e3);

  // 只读铁律：扫描不改变库文件
  assert.equal(fs.statSync(dbFile).mtimeMs, before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanZcode：库缺失返回零条目而非错误；sqlite 不可用时如实降级', () => {
  const r = sources.scanZcode(path.join(os.tmpdir(), 'abacus-nonexistent', 'db.sqlite'), 0);
  assert.equal(r.error, '');
  assert.equal(r.entries.length, 0);
  if (!sources.sqliteAvailable()) {
    const r2 = sources.scanZcode(undefined, 0);
    assert.match(r2.error, /node:sqlite/);
  }
});
