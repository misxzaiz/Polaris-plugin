'use strict';
/**
 * sources.js —— 四路会话数据源读取器（service 进程专用，全部只读）
 *
 * 只读铁律：本模块对源数据零写入。dialogs JSONL / ~/.claude 用 fs 只读；
 * session-v2 与 zcode 用 node:sqlite 只读打开（readOnly:true）。
 * 输出统一为「会话草稿」draft，由调用方经 sift-core.assembleSession 归一化。
 *
 * node:sqlite 需 node ≥22.5；缺失时 v2/zcode 两路自动降级（sqliteAvailable=false），
 * JSONL 两路不受影响——降级事实写进 meta，不静默。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/sift-core.js');

let sqliteModule = null;
let sqliteProbed = false;

/** node:sqlite 可用性探测（缓存结果；失败不抛） */
function sqliteAvailable() {
  if (!sqliteProbed) {
    try {
      // eslint-disable-next-line global-require
      sqliteModule = require('node:sqlite');
      sqliteProbed = true;
    } catch (_) {
      sqliteModule = null;
      sqliteProbed = true;
    }
  }
  return !!(sqliteModule && sqliteModule.DatabaseSync);
}

function openReadonly(dbPath) {
  const { DatabaseSync } = sqliteModule;
  return new DatabaseSync(dbPath, { readOnly: true });
}

// ── 源 1：polaris dialogs JSONL（<dataRoot>/dialogs/*.jsonl，v3 格式）────────

function listPolarisFiles(dataRoot) {
  const dir = path.join(dataRoot, 'dialogs');
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      out.push({ key: name.slice(0, -'.jsonl'.length), path: full, mtimeMs: st.mtimeMs, size: st.size });
    } catch (_) { /* 竞态删除，跳过 */ }
  }
  return out;
}

/** 读单个 dialogs 会话 → draft | null */
function readPolarisFile(filePath) {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
  const lines = raw.split('\n');
  let meta = null;
  const messages = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (!meta && l.includes('"type":"meta"')) {
      meta = core.parsePolarisMetaLine(l);
      continue;
    }
    const m = core.parsePolarisMsgLine(l);
    if (m) messages.push(m);
  }
  if (!meta && messages.length === 0) return null;
  return {
    source: 'polaris',
    stableKey: (meta && meta.externalId) || path.basename(filePath, '.jsonl'),
    title: (meta && meta.title) || (messages.find((m) => m.role === 'user') || {}).text || '',
    engineId: (meta && meta.engineId) || '',
    workspace: (meta && meta.workspace) || '',
    createdAt: meta ? meta.createdAt : 0,
    updatedAt: meta ? meta.updatedAt : 0,
    messages,
    tokens: meta ? meta.tokens : null,
    costUsd: meta ? meta.costUsd : 0,
  };
}

// ── 源 2：claude 原生（~/.claude/projects/<项目>/<sessionId>.jsonl）──────────

function listClaudeFiles(claudeDir) {
  const root = claudeDir || path.join(os.homedir(), '.claude', 'projects');
  const out = [];
  let projects = [];
  try {
    projects = fs.readdirSync(root);
  } catch (_) {
    return out;
  }
  for (const proj of projects) {
    const pdir = path.join(root, proj);
    let entries = [];
    try {
      entries = fs.readdirSync(pdir);
    } catch (_) {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const full = path.join(pdir, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        out.push({ key: `${proj}/${name.slice(0, -'.jsonl'.length)}`, path: full, mtimeMs: st.mtimeMs, size: st.size });
      } catch (_) { /* 跳过 */ }
    }
  }
  return out;
}

/** 读单个 claude 会话 → draft | null（usage 按消息聚合为 tokens） */
function readClaudeFile(filePath) {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
  const messages = [];
  let summary = '';
  let workspace = '';
  let firstTs = 0;
  let lastTs = 0;
  let stableKey = path.basename(filePath, '.jsonl');
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let hasUsage = false;
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const parsed = core.parseClaudeLine(l);
    if (!parsed) continue;
    if (parsed.kind === 'summary') {
      if (!summary) summary = parsed.summary;
      continue;
    }
    if (!workspace) {
      // cwd 在行顶层而非 message 里；解析器没带出来，回读一次
      try {
        const o = JSON.parse(l);
        if (typeof o.cwd === 'string' && o.cwd) workspace = o.cwd;
        if (typeof o.sessionId === 'string' && o.sessionId) stableKey = o.sessionId;
      } catch (_) { /* 容错跳过 */ }
    }
    if (parsed.usage) {
      hasUsage = true;
      tokens.input += parsed.usage.input;
      tokens.output += parsed.usage.output;
      tokens.cacheRead += parsed.usage.cacheRead;
      tokens.cacheWrite += parsed.usage.cacheWrite;
    }
    const ts = parsed.ts ? (typeof parsed.ts === 'number' ? parsed.ts : 0) : 0;
    if (ts && (!firstTs || ts < firstTs)) firstTs = ts;
    if (ts && ts > lastTs) lastTs = ts;
    messages.push({ id: parsed.id, role: parsed.role, ts: parsed.ts, text: parsed.text });
  }
  if (messages.length === 0) return null;
  const firstUser = messages.find((m) => m.role === 'user');
  return {
    source: 'claude',
    stableKey,
    title: summary || (firstUser ? firstUser.text.slice(0, 80) : ''),
    engineId: 'claude-code',
    workspace,
    createdAt: firstTs,
    updatedAt: lastTs || firstTs,
    messages,
    tokens: hasUsage ? tokens : null,
    costUsd: 0,
  };
}

// ── 源 3：session-v2（<dataRoot>/session-v2/messages.db + state.db）─────────

/**
 * 全量拉取 v2 会话（服务每 sqliteRefreshMin 跑一次；5745 行级数据流式遍历，
 * content 提取成散文后即刻丢弃，内存峰值可控）。
 */
function readV2All(dataRoot) {
  if (!sqliteAvailable()) return { error: 'node:sqlite 不可用（需 node ≥22.5）', drafts: [] };
  const dbDir = path.join(dataRoot, 'session-v2');
  const messagesDb = path.join(dbDir, 'messages.db');
  const stateDb = path.join(dbDir, 'state.db');
  if (!fs.existsSync(messagesDb)) return { error: '', drafts: [] };

  let titles = new Map();
  try {
    const st = openReadonly(stateDb);
    const rows = st.prepare('SELECT conversation_id, title, engine_id, workspace_id, created_at, updated_at FROM sessions_index').all();
    for (const r of rows) {
      titles.set(r.conversation_id, {
        title: String(r.title || ''),
        engineId: String(r.engine_id || ''),
        workspace: String(r.workspace_id || ''),
        createdAt: core.normalizeTs(r.created_at) || 0,
        updatedAt: core.normalizeTs(r.updated_at) || 0,
      });
    }
    st.close();
  } catch (_) { /* state.db 缺失/损坏：标题走首条用户消息兜底 */ }

  const tombstoned = new Set();
  const byConv = new Map(); // conversation_id → { rows: [], title, engineId, workspace, createdAt, updatedAt }
  try {
    const db = openReadonly(messagesDb);
    try {
      for (const r of db.prepare('SELECT conversation_id FROM tombstoned_conversations').all()) {
        tombstoned.add(r.conversation_id);
      }
    } catch (_) { /* 表可能不存在 */ }
    const stmt = db.prepare('SELECT id, conversation_id, role, timestamp_ms, content, version FROM session_messages WHERE deleted_at IS NULL');
    for (const row of stmt.iterate()) {
      if (tombstoned.has(row.conversation_id)) continue;
      let bucket = byConv.get(row.conversation_id);
      if (!bucket) {
        const t = titles.get(row.conversation_id) || {};
        bucket = {
          rows: [],
          title: t.title || '',
          engineId: t.engineId || '',
          workspace: t.workspace || '',
          createdAt: t.createdAt || 0,
          updatedAt: t.updatedAt || 0,
        };
        byConv.set(row.conversation_id, bucket);
      }
      bucket.rows.push(row);
    }
    db.close();
  } catch (e) {
    return { error: `messages.db 读取失败: ${e.message}`, drafts: [] };
  }

  const drafts = [];
  for (const [convId, bucket] of byConv) {
    const deduped = core.dedupeV2Rows(bucket.rows);
    const messages = [];
    for (const row of deduped) {
      const m = core.parseV2Row(row);
      if (m) messages.push(m);
    }
    if (messages.length === 0) continue;
    messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const firstUser = messages.find((m) => m.role === 'user');
    let updatedAt = bucket.updatedAt;
    if (!updatedAt) {
      for (const m of messages) {
        const t = typeof m.ts === 'number' ? m.ts : 0;
        if (t > updatedAt) updatedAt = t;
      }
    }
    drafts.push({
      source: 'v2',
      stableKey: convId,
      title: bucket.title || (firstUser ? firstUser.text.slice(0, 80) : ''),
      engineId: bucket.engineId,
      workspace: bucket.workspace,
      createdAt: bucket.createdAt,
      updatedAt,
      messages,
      tokens: null,
      costUsd: 0,
    });
  }
  return { error: '', drafts };
}

// ── 源 4：zcode（~/.zcode/cli/db/db.sqlite）─────────────────────────────────

/** 全量拉取 zcode 会话（session + message + part + turn_usage 四表联装） */
function readZcodeAll(dbPath) {
  if (!sqliteAvailable()) return { error: 'node:sqlite 不可用（需 node ≥22.5）', drafts: [] };
  const dbFile = dbPath || path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite');
  if (!fs.existsSync(dbFile)) return { error: '', drafts: [] };

  let db;
  try {
    db = openReadonly(dbFile);
  } catch (e) {
    return { error: `db.sqlite 打开失败: ${e.message}`, drafts: [] };
  }

  // 会话清单（排除软删）
  const sessions = [];
  try {
    for (const r of db.prepare('SELECT id, title, directory, time_created, time_updated, time_deleted FROM session').all()) {
      if (r.time_deleted) continue;
      sessions.push(r);
    }
  } catch (e) {
    db.close();
    return { error: `session 表读取失败: ${e.message}`, drafts: [] };
  }

  // tokens 聚合（一查一得，472 行级）
  const usageBySession = new Map();
  try {
    for (const r of db.prepare(
      'SELECT session_id, SUM(input_tokens) i, SUM(output_tokens) o, SUM(cache_read_input_tokens) cr, SUM(cache_creation_input_tokens) cw FROM turn_usage GROUP BY session_id',
    ).all()) {
      usageBySession.set(r.session_id, { input: r.i || 0, output: r.o || 0, cacheRead: r.cr || 0, cacheWrite: r.cw || 0 });
    }
  } catch (_) { /* 表缺失容忍 */ }

  // message 流式扫描：role/ts/hidden 判定（hidden 的模型内部消息整条跳过）
  const msgMeta = new Map(); // message.id → { sessionId, role, ts, keep }
  const msgOrder = new Map(); // sessionId → [{id, ts, seq}]
  try {
    const stmt = db.prepare('SELECT id, session_id, data, sequence FROM message');
    for (const row of stmt.iterate()) {
      const meta = core.parseZcodeMessage(row.data);
      if (!meta || meta.hidden) continue;
      msgMeta.set(row.id, { sessionId: row.session_id, role: meta.role, ts: meta.ts, keep: true });
      let arr = msgOrder.get(row.session_id);
      if (!arr) msgOrder.set(row.session_id, (arr = []));
      arr.push({ id: row.id, ts: meta.ts, seq: Number(row.sequence) || 0 });
    }
  } catch (_) { /* message 表异常：本轮 zcode 源产出为空 */ }

  // part 流式扫描：只收 text part，按 message 归组
  const partsByMsg = new Map(); // message.id → [{seq, text}]
  try {
    const stmt = db.prepare('SELECT message_id, data, sequence FROM part');
    for (const row of stmt.iterate()) {
      const text = core.parseZcodePart(row.data);
      if (!text) continue;
      const meta = msgMeta.get(row.message_id);
      if (!meta || !meta.keep) continue;
      let arr = partsByMsg.get(row.message_id);
      if (!arr) partsByMsg.set(row.message_id, (arr = []));
      arr.push({ seq: Number(row.sequence) || 0, text });
    }
  } catch (_) { /* part 表异常：已收消息照常出稿 */ }
  db.close();

  const drafts = [];
  for (const s of sessions) {
    const order = msgOrder.get(s.id);
    if (!order || order.length === 0) continue;
    order.sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.seq - b.seq);
    const messages = [];
    for (const m of order) {
      const parts = partsByMsg.get(m.id);
      if (!parts || parts.length === 0) continue;
      parts.sort((a, b) => a.seq - b.seq);
      const text = parts.map((p) => p.text).join('\n').trim();
      if (!text) continue;
      const meta = msgMeta.get(m.id);
      messages.push({ id: m.id, role: meta.role, ts: meta.ts, text });
    }
    if (messages.length === 0) continue;
    const firstUser = messages.find((m) => m.role === 'user');
    const usage = usageBySession.get(s.id);
    const created = core.normalizeTs(s.time_created) || 0;
    const updated = core.normalizeTs(s.time_updated) || created;
    drafts.push({
      source: 'zcode',
      stableKey: s.id,
      title: String(s.title || '') || (firstUser ? firstUser.text.slice(0, 80) : ''),
      engineId: 'zcode',
      workspace: String(s.directory || ''),
      createdAt: created,
      updatedAt: updated,
      messages,
      tokens: usage || null,
      costUsd: 0,
    });
  }
  return { error: '', drafts };
}

module.exports = {
  sqliteAvailable,
  listPolarisFiles,
  readPolarisFile,
  listClaudeFiles,
  readClaudeFile,
  readV2All,
  readZcodeAll,
};
