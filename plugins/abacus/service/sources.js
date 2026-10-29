'use strict';
/**
 * sources.js —— AI 用量账三路数据源读取器（service 进程专用，全部只读）
 *
 * 只读铁律：zcode / session 库用 node:sqlite readOnly 打开；claude JSONL 与
 * polaris dialogs 用 fs 只读。对源数据零写入。
 * 口径归一在 shared/abacus-core.js（normalize* 三函数），本文件只负责
 * 「把行捞出来、喂进去」与增量游标。
 *
 * node:sqlite 需 node ≥22.5；缺失时 zcode 源降级（sqliteAvailable=false），
 * 降级事实由调用方写进 meta，不静默。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/abacus-core.js');

let sqliteModule = null;
let sqliteProbed = false;

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

// ── 源 1：zcode（~/.zcode/cli/db/db.sqlite）────────────────────────────────

/**
 * 扫 zcode model_usage（逐模型请求）+ tool_usage 聚合。
 * since: ms 游标（增量）；0/undefined = 全量。
 * 返回 { entries, tools, maxTs, turns, error }
 */
function scanZcode(dbPath, since) {
  if (!sqliteAvailable()) return { entries: [], tools: { total: 0, byName: [], destructive: 0 }, maxTs: 0, turns: 0, error: 'node:sqlite 不可用（需 node ≥22.5）' };
  const file = dbPath || path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite');
  if (!fs.existsSync(file)) return { entries: [], tools: { total: 0, byName: [], destructive: 0 }, maxTs: 0, turns: 0, error: '' };

  let db;
  try {
    db = openReadonly(file);
  } catch (e) {
    return { entries: [], tools: { total: 0, byName: [], destructive: 0 }, maxTs: 0, turns: 0, error: `db.sqlite 打开失败: ${e.message}` };
  }

  const entries = [];
  let error = '';
  let maxTs = 0;
  let turns = 0;
  try {
    // session 标题/目录映射（排除软删）
    const sessMap = new Map();
    try {
      for (const s of db.prepare('SELECT id, title, directory, time_deleted FROM session').all()) {
        if (s.time_deleted) continue;
        sessMap.set(s.id, { title: String(s.title || ''), directory: String(s.directory || '') });
      }
    } catch (_) { /* session 表异常：标题/项目留空 */ }

    const sinceNum = Number(since) || 0;
    const rows = sinceNum > 0
      ? db.prepare('SELECT * FROM model_usage WHERE started_at > ?').all(sinceNum)
      : db.prepare('SELECT * FROM model_usage').all();
    for (const r of rows) {
      const e = core.normalizeZcodeRow(r, sessMap.get(r.session_id));
      if (e) {
        entries.push(e);
        if (e.ts > maxTs) maxTs = e.ts;
      }
    }
    try {
      const t = db.prepare('SELECT COUNT(DISTINCT turn_id) n FROM model_usage').get();
      turns = Number(t && t.n) || 0;
    } catch (_) { /* 容忍 */ }

    // 工具遥测聚合（全量重算，万行级即时）
    const tools = { total: 0, byName: [], destructive: 0 };
    try {
      const total = db.prepare('SELECT COUNT(*) n FROM tool_usage').get();
      tools.total = Number(total && total.n) || 0;
      const rows2 = db.prepare(
        'SELECT tool_name, COUNT(*) n, SUM(destructive) d, AVG(duration_ms) avgDur FROM tool_usage GROUP BY tool_name ORDER BY n DESC LIMIT 12',
      ).all();
      tools.byName = rows2.map((r2) => ({ name: String(r2.tool_name || '(unknown)'), n: Number(r2.n) || 0, destructive: Number(r2.d) || 0, avgDurMs: Math.round(Number(r2.avgDur) || 0) }));
      const d = db.prepare('SELECT COUNT(*) n FROM tool_usage WHERE destructive = 1').get();
      tools.destructive = Number(d && d.n) || 0;
    } catch (_) { /* tool_usage 表可能缺失 */ }
    return { entries, tools, maxTs, turns, error };
  } catch (e) {
    error = `model_usage 读取失败: ${e.message}`;
  } finally {
    try { db.close(); } catch (_) { /* 已关 */ }
  }
  return { entries, tools: { total: 0, byName: [], destructive: 0 }, maxTs, turns, error };
}

// ── 源 2：claude（~/.claude/projects/**/**.jsonl）──────────────────────────

/** path → {mtimeMs, size} 缓存（调用方持久化），变更文件才重解析 */
function claudeFiles(root) {
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
        out.push({ path: full, hint: `${proj}/${name.slice(0, -'.jsonl'.length)}`, mtimeMs: st.mtimeMs, size: st.size });
      } catch (_) { /* 竞态删除，跳过 */ }
    }
  }
  return out;
}

/** 解析单个 claude JSONL → entries（含侧链：成本账必须收侧链，与索引口径相反） */
function parseClaudeFile(fullPath, hint) {
  let raw = '';
  try {
    raw = fs.readFileSync(fullPath, 'utf8');
  } catch (_) {
    return [];
  }
  const entries = [];
  let cwd = '';
  let sessionId = '';
  let summary = '';
  let firstUser = '';
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let o;
    try {
      o = JSON.parse(l);
    } catch (_) {
      continue; // 坏行静默跳过
    }
    if (!summary && o.type === 'summary' && typeof o.summary === 'string' && o.summary) {
      summary = o.summary; // 会话标题（Claude Code 自动摘要）
    }
    if (!cwd && typeof o.cwd === 'string' && o.cwd) cwd = o.cwd;
    if (!sessionId && typeof o.sessionId === 'string' && o.sessionId) sessionId = o.sessionId;
    if (!firstUser && o.type === 'user' && o.isSidechain !== true && o.message) {
      const c = o.message.content;
      let text = '';
      if (typeof c === 'string') text = c;
      else if (Array.isArray(c)) {
        for (const b of c) {
          if (b && b.type === 'text' && typeof b.text === 'string') { text = b.text; break; }
        }
      }
      text = text.trim();
      // 命令注入类伪用户消息不配当标题；Stop hook 包装消息剥壳留真实意图
      if (/^A session-scoped Stop hook is now active with condition:\s*"?/.test(text)) {
        text = text.replace(/^A session-scoped Stop hook is now active with condition:\s*"?/, '').replace(/"\s*$/, '').trim();
      }
      if (text && !/^<(command-name|local-command|ide_[a-z]+)/.test(text)) firstUser = text.replace(/\s+/g, ' ').slice(0, 80);
    }
    if (o.type !== 'assistant' || !o.message) continue;
    const msg = o.message;
    const u = msg.usage;
    if (!u || typeof u !== 'object') continue;
    const ts = Date.parse(o.timestamp) || 0;
    const e = core.normalizeClaudeMsg({
      id: o.uuid || '',
      ts,
      model: msg.model || '',
      title: summary,
      isSidechain: o.isSidechain === true,
      cwd,
      sessionId,
      usage: {
        input: Number(u.input_tokens) || 0,
        output: Number(u.output_tokens) || 0,
        cacheRead: Number(u.cache_read_input_tokens) || 0,
        cacheWrite: Number(u.cache_creation_input_tokens) || 0,
      },
    }, hint);
    if (e && (e.fin || e.cr || e.cw || e.out)) entries.push(e);
  }
  // summary 行可能出现在文件末尾（压缩时写入）：回填到本文件所有条目；
  // 没有摘要的会话用首条用户消息兜底
  const title = summary || firstUser;
  if (title) {
    for (const e of entries) if (!e.title) e.title = title;
  }
  return entries;
}

/**
 * 扫 claude 源。cache: { [path]: {mtimeMs, size} }（调用方持有并持久化）。
 * 返回 { entries, changedHints, cache, filesScanned, error }；entries 只含本次
 * 新增或变更文件的解析结果，changedHints 供调用方先丢弃这些文件的旧条目
 * （文件被压缩/清理后不能留幽灵账）。
 */
async function scanClaude(root, cache, { yieldEvery = 20, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const claudeRoot = root || path.join(os.homedir(), '.claude', 'projects');
  const files = claudeFiles(claudeRoot);
  const entries = [];
  const changedHints = [];
  let filesScanned = 0;
  const nextCache = {};
  let i = 0;
  for (const f of files) {
    const prev = cache[f.path];
    if (!prev || prev.mtimeMs !== f.mtimeMs || prev.size !== f.size) {
      const parsed = parseClaudeFile(f.path, f.hint);
      entries.push(...parsed);
      changedHints.push(f.hint);
      filesScanned += 1;
      i += 1;
      if (i % yieldEvery === 0) await sleep(0); // 让出事件循环，健康检查不能饿死
    }
    nextCache[f.path] = { mtimeMs: f.mtimeMs, size: f.size };
  }
  return { entries, changedHints, cache: nextCache, filesScanned, error: '' };
}

// ── 源 3：polaris（<dataRoot>/dialogs/*.jsonl 首行 meta）───────────────────

/** 读首行 meta（v3 含 tokenUsage）；旧格式无 tokenUsage 返回 null 条目跳过 */
function scanPolaris(dataRoot) {
  const dir = path.join(dataRoot || '', 'dialogs');
  const out = [];
  let files = 0;
  let withTU = 0;
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return { entries: [], files: 0, withTU: 0, error: 'dialogs 目录不可读' };
  }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const full = path.join(dir, name);
    files += 1;
    let head = '';
    try {
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(65536);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      head = buf.slice(0, n).toString('utf8');
    } catch (_) {
      continue; // 竞态删除，跳过
    }
    const nl = head.indexOf('\n');
    const firstLine = (nl >= 0 ? head.slice(0, nl) : head).trim();
    if (!firstLine.includes('"type":"meta"')) continue;
    let meta;
    try {
      meta = JSON.parse(firstLine);
    } catch (_) {
      continue;
    }
    if (!meta || meta.type !== 'meta') continue;
    const e = core.normalizePolarisMeta({
      externalId: meta.externalId || name.slice(0, -'.jsonl'.length),
      title: meta.title || meta.firstUserText || '',
      engineId: meta.engineId || '',
      workspacePath: meta.workspacePath || '',
      workspaceId: meta.workspaceId || '',
      updatedAt: Date.parse(meta.updatedAt) || 0,
      tokenUsage: meta.tokenUsage || null,
    });
    if (e) {
      out.push(e);
      withTU += 1;
    }
  }
  return { entries: out, files, withTU, error: '' };
}

module.exports = {
  sqliteAvailable,
  scanZcode,
  claudeFiles,
  parseClaudeFile,
  scanClaude,
  scanPolaris,
};
