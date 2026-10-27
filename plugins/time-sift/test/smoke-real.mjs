#!/usr/bin/env node
'use strict';
/**
 * 拾光机真实桥冒烟：node test/smoke-real.mjs
 *
 * 前置：本机 Polaris 在跑（kvclient 自发现：anchor.json → config.json → 端口扫描）。
 * 流程：护栏检查（生产 sift.* 键存在即拒跑）→ 构建四源临时 fixture（含版本去重/
 * sidechain/工具块/tombstone 等陷阱样本）→ 起真服务（SIFT_DATA_ROOT_OVERRIDE 限定
 * 临时目录，不碰真实数据根）→ 心跳/目录入库 → 命令信箱 search/open → 起真 MCP
 * stdio 全闭环 → 清理全部 sift.* 键 → N/N 报告。
 *
 * node:sqlite 不可用时（<22.5）自动降级为 JSONL 双源 fixture。
 */
import { createRequire } from 'node:module';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createKvClient } = require('../shared/kvclient.js');

const POLL_MS = 40000;
const KEYWORD = '拾光冒烟紫电';
const LATIN = 'smokeSiftKeyword';

let pass = 0;
let fail = 0;
function step(name, ok, extra) {
  if (ok) { pass++; console.log('  ok', name, extra || ''); }
  else { fail++; console.error('  FAIL', name, extra || ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kv = createKvClient({ appConfigDir: '', log: () => {} });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'time-sift-smoke-'));
const tmpAppConfig = path.join(tmp, 'appconfig');
const root = path.join(tmp, 'root');
fs.mkdirSync(tmpAppConfig);
fs.mkdirSync(path.join(root, 'dialogs'), { recursive: true });
fs.mkdirSync(path.join(root, 'session-v2'), { recursive: true });
fs.mkdirSync(path.join(root, 'claude-projects', 'smoke-proj'), { recursive: true });

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch (_) { /* 降级 */ }
const hasSqlite = !!(sqlite && sqlite.DatabaseSync);

function freePort() {
  return new Promise((resolve) => {
    const net = require('node:net');
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

// ── fixtures ────────────────────────────────────────────────────────────────

function writeDialogFixtures() {
  // 会话 1：meta + 消息（含关键词，英文词 Latin 大小写混合）
  const meta1 = { v: 3, type: 'meta', externalId: 'smoke-1', engineId: 'simple-ai', title: '冒烟会话一', workspacePath: 'D:\\smoke', createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-21T09:00:00.000Z', messageCount: 3, tokenUsage: { input: 100, output: 50, cacheCreation: 5, cacheRead: 10, costUsd: 0.01 } };
  const lines1 = [JSON.stringify(meta1)];
  const msgs1 = [
    { type: 'msg', seq: 0, message: { id: 'm1', type: 'user', content: `帮我查一下 ${KEYWORD} 这个问题`, timestamp: '2026-10-20T08:00:01.000Z' } },
    { type: 'msg', seq: 1, message: { id: 'm2', type: 'assistant', content: [{ type: 'text', content: `关于${KEYWORD}：答案在这里。` }], timestamp: '2026-10-20T08:00:02.000Z' } },
    { type: 'msg', seq: 1, message: { id: 'm2', type: 'assistant', content: [{ type: 'text', content: `关于${KEYWORD}：答案在这里。（重复行应被去重）` }], timestamp: '2026-10-20T08:00:02.000Z' } },
    { type: 'msg', seq: 2, message: { id: 'm3', type: 'user', content: `${LATIN} 大小写归一`, timestamp: '2026-10-20T08:00:03.000Z' } },
  ];
  lines1.push(...msgs1.map((m) => JSON.stringify(m)));
  fs.writeFileSync(path.join(root, 'dialogs', 'smoke-1.jsonl'), lines1.join('\n'));

  // 会话 2：只有干扰词，验证不被误命中
  const meta2 = { v: 3, type: 'meta', externalId: 'smoke-2', engineId: 'simple-ai', title: '无关会话', createdAt: '2026-10-22T08:00:00.000Z', updatedAt: '2026-10-22T09:00:00.000Z', messageCount: 1 };
  fs.writeFileSync(
    path.join(root, 'dialogs', 'smoke-2.jsonl'),
    [JSON.stringify(meta2), JSON.stringify({ type: 'msg', seq: 0, message: { id: 'n1', type: 'user', content: '今天天气不错', timestamp: '2026-10-22T08:00:01.000Z' } })].join('\n'),
  );
}

function writeClaudeFixture() {
  const lines = [
    JSON.stringify({ type: 'summary', summary: '冒烟 Claude 会话' }),
    JSON.stringify({ type: 'user', uuid: 'cu1', sessionId: 'smoke-claude-1', cwd: 'D:\\smoke-proj', timestamp: '2026-10-23T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: `${KEYWORD} 在 claude 原生里` }] } }),
    // sidechain 行必须被跳过
    JSON.stringify({ type: 'user', uuid: 'cu2x', sessionId: 'smoke-claude-1', isSidechain: true, timestamp: '2026-10-23T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'sidechain 泄漏检测词' }] } }),
    // tool_result-only 用户行必须被跳过
    JSON.stringify({ type: 'user', uuid: 'cu3x', sessionId: 'smoke-claude-1', timestamp: '2026-10-23T10:00:02.000Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'tool output' }] } }),
    JSON.stringify({ type: 'assistant', uuid: 'ca1', sessionId: 'smoke-claude-1', timestamp: '2026-10-23T10:00:03.000Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: '内部思考不应入索引' }, { type: 'text', text: `claude 回复：${KEYWORD} 已确认` }], usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 500, cache_creation_input_tokens: 20 } } }),
    // 命令注入伪用户消息
    JSON.stringify({ type: 'user', uuid: 'cu4x', sessionId: 'smoke-claude-1', timestamp: '2026-10-23T10:00:04.000Z', message: { role: 'user', content: '<command-name>/clear</command-name>' } }),
  ];
  fs.writeFileSync(path.join(root, 'claude-projects', 'smoke-proj', 'smoke-claude-1.jsonl'), lines.join('\n'));
}

function writeV2Fixtures() {
  const st = new sqlite.DatabaseSync(path.join(root, 'session-v2', 'state.db'));
  st.exec('CREATE TABLE sessions_index (workspace_key TEXT, session_id TEXT, conversation_id TEXT, title TEXT, status TEXT, seq INTEGER, updated_at INTEGER, engine_id TEXT, workspace_id TEXT, last_error TEXT, started_by_device TEXT, created_at INTEGER)');
  st.prepare('INSERT INTO sessions_index VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('wk', 'sid1', 'conv-1', '冒烟 v2 会话', 'active', 1, 1794430000000, 'claude-code', 'ws1', null, 'dev', 1794420000000);
  st.close();
  const db = new sqlite.DatabaseSync(path.join(root, 'session-v2', 'messages.db'));
  db.exec('CREATE TABLE session_messages (id TEXT, conversation_id TEXT, role TEXT, timestamp_ms INTEGER, device_id TEXT, content TEXT, version INTEGER, parent_version INTEGER, deleted_at INTEGER)');
  db.exec('CREATE TABLE tombstoned_conversations (conversation_id TEXT, deleted_at_ms INTEGER)');
  db.prepare('INSERT INTO tombstoned_conversations VALUES (?,?)').run('conv-tomb', Date.now());
  const ins = db.prepare('INSERT INTO session_messages VALUES (?,?,?,?,?,?,?,?,?)');
  const content = (text, type = 'user') => JSON.stringify({ type, blocks: [{ type: 'text', content: text }] });
  ins.run('v1', 'conv-1', 'user', 1794430001000, 'dev', content(`v2 里也提到 ${KEYWORD}`), 1, null, null);
  ins.run('v1', 'conv-1', 'user', 1794430001000, 'dev', content(`v2 里也提到 ${KEYWORD}（旧版本应被去重）`), 2, 1, null); // 新版本胜
  ins.run('v2', 'conv-1', 'assistant', 1794430002000, 'dev', content('v2 回复：收到', 'assistant'), 1, null, null);
  ins.run('v3', 'conv-1', 'assistant', 1794430003000, 'dev', content('这条已删除不应出现', 'assistant'), 1, null, Date.now()); // deleted
  ins.run('t1', 'conv-tomb', 'user', 1794430004000, 'dev', content('墓碑会话不应出现'), 1, null, null);
  db.close();
}

function writeZcodeFixture() {
  const db = new sqlite.DatabaseSync(path.join(root, 'zcode-db.sqlite'));
  db.exec('CREATE TABLE session (id TEXT, title TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER, time_deleted INTEGER)');
  db.exec('CREATE TABLE message (id TEXT, session_id TEXT, data TEXT, sequence INTEGER)');
  db.exec('CREATE TABLE part (id TEXT, message_id TEXT, session_id TEXT, data TEXT, sequence INTEGER)');
  db.exec('CREATE TABLE turn_usage (session_id TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_input_tokens INTEGER, cache_creation_input_tokens INTEGER)');
  db.prepare('INSERT INTO session VALUES (?,?,?,?,?,?)').run('zs1', '冒烟 ZCode 会话', 'D:\\smoke-zs', 1794510000000, 1794510100000, null);
  db.prepare('INSERT INTO session VALUES (?,?,?,?,?,?)').run('zs2', '软删不应出现', 'x', 1, 2, 1794510200000);
  const msg = (id, role, ts, seq, hidden) => db.prepare('INSERT INTO message VALUES (?,?,?,?)').run(id, 'zs1', JSON.stringify({ role, time: { created: ts }, semantics: { uiVisibility: hidden ? 'hidden' : 'visible' } }), seq);
  msg('zm1', 'user', 1794510001000, 0, false);
  msg('zm2', 'assistant', 1794510002000, 1, false);
  msg('zm3', 'user', 1794510003000, 2, true); // hidden 整条跳过
  const part = (mid, type, text, seq) => db.prepare('INSERT INTO part VALUES (?,?,?,?,?)').run(`p_${mid}_${seq}`, mid, 'zs1', JSON.stringify({ type, text }), seq);
  part('zm1', 'text', `zcode 里问了 ${KEYWORD}`, 0);
  part('zm2', 'reasoning', 'reasoning 不应入索引', 0);
  part('zm2', 'text', 'zcode 回复：已处理', 1);
  db.prepare('INSERT INTO turn_usage VALUES (?,?,?,?,?)').run('zs1', 1000, 200, 3000, 100);
  db.close();
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

let serviceProc = null;
let mcpProc = null;

try {
  // 1. 桥连通
  await kv.kvSet('sift.smoke.probe', { at: Date.now() });
  await kv.kvDel('sift.smoke.probe');
  step('1 桥连通（kv 写删探针）', true);

  // 2. 护栏：已有生产 sift.* 业务键 → 拒跑
  const keysBefore = (await kv.kvKeys()).filter((k) => k.startsWith('sift.'));
  const prodKeys = keysBefore.filter((k) => !k.startsWith('sift.smoke.'));
  const staleMeta = prodKeys.includes('sift.meta') ? await kv.kvGet('sift.meta') : null;
  if (prodKeys.length > 0 && !(staleMeta && staleMeta.smoke === true)) {
    console.error('生产环境检测到 sift.* 业务键（如 sift.meta/sift.cat.*），冒烟拒跑以防误伤。');
    process.exit(1);
  }
  for (const k of prodKeys) await kv.kvDel(k).catch(() => {});
  step('2 护栏通过（无生产键，或上次冒烟残留已清）', true, `清理 ${prodKeys.length} 个残留键`);

  // 3. fixtures
  writeDialogFixtures();
  writeClaudeFixture();
  if (hasSqlite) {
    writeV2Fixtures();
    writeZcodeFixture();
  }
  step('3 fixtures 就绪', true, hasSqlite ? '四源（含 node:sqlite）' : 'JSONL 双源（node:sqlite 不可用，降级）');

  // 4. 起真服务
  const svcPort = await freePort();
  serviceProc = spawn(process.execPath, [path.join('service', 'sift.js'), String(svcPort), tmpAppConfig], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, SIFT_DATA_ROOT_OVERRIDE: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let svcLog = '';
  serviceProc.stderr.on('data', (c) => { svcLog += c; });

  // 5. 心跳与目录入库
  const waitFor = async (fn, ms, label) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await fn();
      if (v) return v;
      await sleep(700);
    }
    throw new Error(`冒烟超时：${label}\n--- service log ---\n${svcLog}`);
  };

  const meta = await waitFor(async () => {
    const m = await kv.kvGet('sift.meta');
    return m && m.smoke === true ? m : null;
  }, POLL_MS, '服务心跳（sift.meta）');
  step('4 服务心跳出现（smoke 模式）', true, `v${meta.version}`);

  const expectedMin = hasSqlite ? 4 : 3; // polaris2 + claude1 + v2(1) + zcode(1) / 无 sqlite 时 3
  const head = await waitFor(async () => {
    const h = await kv.kvGet('sift.cat.head');
    return h && h.count >= expectedMin ? h : null;
  }, POLL_MS, `目录入库 ≥${expectedMin}`);
  step(`5 目录入库 ${head.count} 条（≥${expectedMin}）`, true, `${head.chunks} 块 rev=${head.rev}`);

  const catAll = [];
  for (let i = 0; i < head.chunks; i++) {
    const c = await kv.kvGet(`sift.cat.${i}`);
    if (Array.isArray(c)) catAll.push(...c);
  }
  const bySource = {};
  for (const e of catAll) bySource[e.source] = (bySource[e.source] || 0) + 1;
  const v2Entry = catAll.find((e) => e.source === 'v2');
  const claudeEntry = catAll.find((e) => e.source === 'claude');
  step('5.1 版本去重（v2 会话 2 条消息，无旧版/已删/墓碑）', !!v2Entry && v2Entry.msgCount === 2, v2Entry ? `msgCount=${v2Entry.msgCount}` : 'v2 会话缺失');
  step('5.2 sidechain/工具块/命令注入全过滤（claude 会话 2 条消息）', !!claudeEntry && claudeEntry.msgCount === 2, claudeEntry ? `msgCount=${claudeEntry.msgCount}` : 'claude 会话缺失');
  step('5.3 墓碑会话被排除', !catAll.some((e) => e.title === '软删不应出现'), '');

  // 6. 统计键
  const totals = await kv.kvGet('sift.stats.total');
  step('6 stats.total 生成', !!totals && totals.sessions === head.count, totals ? `tokens.covered=${totals.tokens.sessionsCovered}` : 'missing');

  // 7. 命令信箱 search
  const nonce1 = `${Date.now().toString(36)}-aaaa`;
  await kv.kvSet('sift.cmd.search.' + nonce1, { op: 'search', nonce: nonce1, query: KEYWORD, limit: 10, at: Date.now() });
  const searchRes = await waitFor(async () => {
    const r = await kv.kvGet('sift.result.' + nonce1);
    return r || null;
  }, POLL_MS, 'search 命令结果');
  step('7 cmd.search 返回', !!searchRes.ok, searchRes.error || '');
  const hits = (searchRes.data && searchRes.data.hits) || [];
  step('7.1 命中含关键词会话（含 claude/v2/zcode 三源）', hits.length >= (hasSqlite ? 4 : 2), `hits=${hits.length} sources=[${hits.map((h) => h.source).join(',')}]`);
  step('7.2 无关会话未误命中', !hits.some((h) => h.title === '无关会话'), '');
  const top = hits[0] || {};
  step('7.3 片段含关键词', !!(top.snippet && top.snippet.text.includes('冒烟')), JSON.stringify(top.snippet && top.snippet.text).slice(0, 120));

  // 8. cmd open（围绕命中消息）
  const nonce2 = `${Date.now().toString(36)}-bbbb`;
  await kv.kvSet('sift.cmd.open.' + nonce2, { op: 'open', nonce: nonce2, sid: top.sid, around: top.snippet ? top.snippet.msgIndex : 0, limit: 10, at: Date.now() });
  const openRes = await waitFor(async () => {
    const r = await kv.kvGet('sift.result.' + nonce2);
    return r || null;
  }, POLL_MS, 'open 命令结果');
  const openMsgs = (openRes.ok && openRes.data && openRes.data.messages) || [];
  step('8 cmd.open 返回消息', openRes.ok && openMsgs.length > 0, `${openMsgs.length} 条`);
  step('8.1 消息正文含关键词', openMsgs.some((m) => m.text.includes('冒烟') || m.text.includes(KEYWORD)), '');

  // 9. 真实 MCP stdio 闭环
  mcpProc = spawn(process.execPath, [path.join('mcp', 'server.js'), tmpAppConfig], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let mcpBuf = '';
  const mcpRpc = (obj) => new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      mcpProc.stdout.off('data', handler);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('MCP 响应超时'));
    }, 30000);
    const handler = (c) => {
      mcpBuf += c.toString();
      const i = mcpBuf.indexOf('\n');
      if (i < 0) return;
      const line = mcpBuf.slice(0, i).trim();
      mcpBuf = mcpBuf.slice(i + 1);
      if (!line) return;
      cleanup();
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(e);
      }
    };
    mcpProc.stdout.on('data', handler);
    mcpProc.stdin.write(JSON.stringify(obj) + '\n');
  });

  const initRes = await mcpRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  step('9 MCP initialize', !!initRes.result && initRes.result.serverInfo.name === 'time-sift', `v${initRes.result && initRes.result.serverInfo.version}`);
  mcpProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listRes = await mcpRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const toolNames = (listRes.result.tools || []).map((t) => t.name);
  step('9.1 tools/list 5 个 sift_*', ['sift_search', 'sift_open_session', 'sift_timeline', 'sift_stats', 'sift_reindex'].every((n) => toolNames.includes(n)), toolNames.join(','));
  const callRes = await mcpRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sift_search', arguments: { query: KEYWORD, limit: 5 } } });
  const searchText = callRes.result && callRes.result.content && callRes.result.content[0] && callRes.result.content[0].text;
  step('9.2 MCP sift_search 命中', !!searchText && searchText.includes('「' + KEYWORD + '」') && searchText.includes('sid'), searchText ? searchText.split('\n')[0] : 'empty');
  const tlRes = await mcpRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'sift_timeline', arguments: { days: 30 } } });
  const tlText = tlRes.result && tlRes.result.content && tlRes.result.content[0] && tlRes.result.content[0].text;
  step('9.3 MCP sift_timeline 直读目录', !!tlText && tlText.includes('smokeSift') === false && tlText.includes('【'), tlText ? tlText.split('\n')[0] : 'empty');
  const stRes = await mcpRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'sift_stats', arguments: {} } });
  const stText = stRes.result && stRes.result.content && stRes.result.content[0] && stRes.result.content[0].text;
  step('9.4 MCP sift_stats 汇总', !!stText && stText.includes('会话'), stText ? stText.split('\n')[0] : 'empty');
} catch (e) {
  fail++;
  console.error('  FAIL 流程异常 —', e.message);
} finally {
  if (serviceProc) serviceProc.kill();
  if (mcpProc) mcpProc.kill();
  await sleep(500);
  // 清理：本冒烟模式下 sift.* 全部是测试产物
  try {
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith('sift.'));
    for (const k of keys) await kv.kvDel(k).catch(() => {});
    const left = (await kv.kvKeys()).filter((k) => k.startsWith('sift.'));
    step('10 清理（kv 无 sift.* 残留）', left.length === 0, `删除 ${keys.length} 键`);
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    step('10 清理', false, e.message);
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
