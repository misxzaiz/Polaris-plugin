'use strict';
/**
 * forge-core.js —— 闪造 FlashForge 唯一计算权威（CJS 零依赖）
 *
 * 面板与 MCP server 共用本模块，保证限额/扫描/分块/索引/成绩口径不漂移。
 * 纯逻辑模块：不碰网络、不碰 fs、不算 sha256（Node 侧用 crypto、面板侧用
 * crypto.subtle，各自实现；core 只校验 sha 形状与装配后比对交给调用方）。
 *
 * 数据面纪律：应用索引 ff.apps 是唯一权威（绝不调 cap.kv list——实测会拖垮宿主）；
 * 版本源码分块存 ff.ver.<id>.<v>.p.<i>；版本只增不改，回退=复制为新版本。
 */

const LIMITS = {
  MAX_APPS: 60,                 // 应用总数上限（超限拒绝并引导整理）
  MAX_SOURCE_BYTES: 200 * 1024, // 单版源码 UTF-8 字节上限
  MIN_SOURCE_BYTES: 30,         // 低于此值视为空壳拒绝
  MAX_TITLE: 60,
  MAX_CHANGELOG: 500,
  MAX_TAGS: 5,
  MAX_TAG_LEN: 12,
  MAX_SCORES: 200,              // 每应用成绩保留条数（新者胜截尾）
  CHUNK_CHARS: 24 * 1024,       // 源码分块大小（JS 字符）
  MAX_SCORE_ABS: 1e15,          // 成绩数值绝对值上限（防 NaN/Infinity/溢出脏数据）
};

const KINDS = ['game', 'tool', 'teach'];
const KIND_LABELS = { game: '游戏', tool: '工具', teach: '教具' };

const K = {
  PREFIX: 'ff.',
  INDEX: 'ff.apps',
  SETTINGS: 'ff.settings',
  verPart: (id, v, i) => `ff.ver.${id}.${v}.p.${i}`,
  verPartPrefix: (id, v) => `ff.ver.${id}.${v}.p.`,
  score: (id) => `ff.score.${id}`,
};

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** UTF-8 字节数（分块上限与体积口径的唯一权威） */
function byteLength(str) {
  if (encoder) return encoder.encode(str).length;
  // 兜底（极老环境）：按 UTF-8 手工计数
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

function validId(id) {
  return typeof id === 'string' && /^f[a-z0-9]{1,15}$/.test(id);
}

/** 生成应用 id：f + 10 位小写 base36（调用方负责碰撞重试） */
function genId(rand) {
  const rnd = rand || Math.random;
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(rnd() * 36).toString(36);
  return `f${s}`;
}

// ── 静态扫描（入库闸；沙箱是硬边界，扫描是合作作者的规则线） ────────────────

const SCAN_RULES = [
  // BLOCK：联网/逃逸面（合作作者不允许出现；沙箱兜底）
  { rule: 'fetch调用', severity: 'block', re: /\bfetch\s*\(/, hint: '禁止 fetch()——应用必须完全离线。' },
  { rule: 'XMLHttpRequest', severity: 'block', re: /\bXMLHttpRequest\b/, hint: '禁止 XMLHttpRequest——应用必须完全离线。' },
  { rule: 'WebSocket', severity: 'block', re: /\bnew\s+WebSocket\b/, hint: '禁止 WebSocket——应用必须完全离线。' },
  { rule: 'EventSource', severity: 'block', re: /\bEventSource\b/, hint: '禁止 EventSource——应用必须完全离线。' },
  { rule: 'sendBeacon', severity: 'block', re: /\bsendBeacon\s*\(/, hint: '禁止 sendBeacon——应用必须完全离线。' },
  { rule: 'serviceWorker', severity: 'block', re: /\bserviceWorker\b|\bnavigator\.serviceWorker\b/, hint: '禁止 serviceWorker（不透明 origin 下不可用）。' },
  { rule: '动态import', severity: 'block', re: /\bimport\s*\(/, hint: '禁止动态 import()——逻辑全部内联。' },
  { rule: 'importScripts', severity: 'block', re: /\bimportScripts\b/, hint: '禁止 importScripts——逻辑全部内联。' },
  { rule: '外链资源', severity: 'block', re: /\b(?:src|href|action|poster|data)\s*=\s*["']\s*(?:https?:)?\/\//i, hint: '禁止外链 src/href/action——样式与资源全部内联（data: 或相对引用亦不可出网）。' },
  { rule: 'CSS外链', severity: 'block', re: /url\(\s*["']?\s*(?:https?:)?\/\/|@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//i, hint: '禁止 CSS url()/@import 指向外部——资源内联为 data:。' },
  { rule: '动态外链赋值', severity: 'block', re: /\.\s*(?:src|href|action)\s*=\s*["'`]\s*(?:https?:)?\/\//i, hint: '禁止运行时把 .src/.href/.action 指向外部地址。' },
  { rule: 'window.open', severity: 'block', re: /\bwindow\.open\s*\(/, hint: '禁止 window.open——沙箱无 allow-popups。' },
  { rule: 'document.domain', severity: 'block', re: /\bdocument\.domain\b/, hint: '禁止 document.domain。' },
  { rule: '顶层导航', severity: 'block', re: /\b(?:top|parent)\.location\b/, hint: '禁止访问 top/parent.location——沙箱无顶层导航权。' },
  { rule: 'http跳转', severity: 'block', re: /\blocation(?:\.(?:href|assign|replace))?\s*(?:=\s*|\(\s*)["'`]?\s*(?:https?:)?\/\//i, hint: '禁止把 location 指向外部地址（应用内跳转请用内部状态）。' },
  // WARN：不透明 origin 下必然失效/被静默拦截的用法（引导作者修正）
  { rule: 'localStorage', severity: 'warn', re: /\blocalStorage\b/, hint: '沙箱为不透明 origin，localStorage 会抛 SecurityError——请改用内存变量。' },
  { rule: 'sessionStorage', severity: 'warn', re: /\bsessionStorage\b/, hint: '沙箱为不透明 origin，sessionStorage 会抛 SecurityError——请改用内存变量。' },
  { rule: 'indexedDB', severity: 'warn', re: /\bindexedDB\b/i, hint: '不透明 origin 下 indexedDB 不可用——请改用内存变量。' },
  { rule: 'document.cookie', severity: 'warn', re: /\bdocument\.cookie\b/, hint: '不透明 origin 下 cookie 不可用——请移除。' },
  { rule: '模态对话框', severity: 'warn', re: /\b(?:alert|confirm|prompt)\s*\(/, hint: '沙箱内 alert/confirm/prompt 被静默拦截——请用页面内提示替代。' },
  // WARN：创作契约（手机可玩性）
  { rule: '缺DOCTYPE', severity: 'warn', re: /<!doctype\s+html/i, want: true, hint: '缺少 <!DOCTYPE html>——请补上以保证一致渲染。' },
  { rule: '缺viewport', severity: 'warn', re: /name\s*=\s*["']viewport["']/i, want: true, hint: '缺少 <meta name="viewport">——手机端会按 980px 桌面宽度渲染，务必补上。' },
];

/**
 * 扫描源码。返回 { ok, blocked, warnings, sizeBytes }：
 * blocked/warnings 均为 [{rule, hint}]；ok=false 表示有 BLOCK 项拒绝入库。
 * want:true 的规则语义反转（命中才通过，缺失则告警）。
 */
function scanSource(html) {
  if (typeof html !== 'string' || !html.includes('<')) {
    return { ok: false, blocked: [{ rule: '非HTML', hint: '源码必须是包含标签的 HTML 字符串。' }], warnings: [], sizeBytes: typeof html === 'string' ? byteLength(html) : 0 };
  }
  const sizeBytes = byteLength(html);
  if (sizeBytes > LIMITS.MAX_SOURCE_BYTES) {
    return { ok: false, blocked: [{ rule: '超体积', hint: `源码 ${sizeBytes} 字节超过上限 ${LIMITS.MAX_SOURCE_BYTES}（200KB）——请精简或拆分功能。` }], warnings: [], sizeBytes };
  }
  if (sizeBytes < LIMITS.MIN_SOURCE_BYTES) {
    return { ok: false, blocked: [{ rule: '空壳', hint: `源码仅 ${sizeBytes} 字节，低于最小可运行体积。` }], warnings: [], sizeBytes };
  }
  const blocked = [];
  const warnings = [];
  for (const r of SCAN_RULES) {
    const hit = r.re.test(html);
    const flagged = r.want ? !hit : hit;
    if (!flagged) continue;
    const item = { rule: r.rule, hint: r.hint };
    if (r.severity === 'block') blocked.push(item);
    else warnings.push(item);
  }
  return { ok: blocked.length === 0, blocked, warnings, sizeBytes };
}

/** 扫描报告 → 人类可读文本（MCP 回包用） */
function scanReportText(report) {
  const lines = [`体积 ${report.sizeBytes} 字节`];
  for (const b of report.blocked) lines.push(`[拒绝] ${b.rule}：${b.hint}`);
  for (const w of report.warnings) lines.push(`[提醒] ${w.rule}：${w.hint}`);
  return lines.join('\n');
}

// ── 源码分块（版本源码存 ff.ver.<id>.<v>.p.<i>，24K 字符/块） ────────────────

function chunkSource(html) {
  const parts = [];
  for (let i = 0; i < html.length; i += LIMITS.CHUNK_CHARS) {
    parts.push(html.slice(i, i + LIMITS.CHUNK_CHARS));
  }
  return parts.length ? parts : [''];
}

function assembleParts(parts) {
  if (!Array.isArray(parts)) return null;
  let out = '';
  for (const p of parts) {
    if (typeof p !== 'string') return null;
    out += p;
  }
  return out;
}

// ── 应用与版本（只增不改；回退=复制为新版本） ───────────────────────────────

function validSha(s) {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const v = t.trim().slice(0, LIMITS.MAX_TAG_LEN);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= LIMITS.MAX_TAGS) break;
  }
  return out;
}

function cleanTitle(title) {
  if (typeof title !== 'string') return '';
  return title.trim().replace(/\s+/g, ' ');
}

function cleanChangelog(text, fallback) {
  if (typeof text !== 'string' || !text.trim()) return fallback;
  return text.trim().slice(0, LIMITS.MAX_CHANGELOG);
}

/**
 * 新建应用对象（v1）。sha256 由调用方按 UTF-8 字节计算后传入。
 * 返回 { app, version, parts } 或 { error }。
 */
function newApp(input, ctx) {
  const now = (ctx && ctx.now) || Date.now();
  const rand = ctx && ctx.rand;
  const title = cleanTitle(input && input.title);
  if (!title) return { error: '标题不能为空。' };
  if (title.length > LIMITS.MAX_TITLE) return { error: `标题超长（> ${LIMITS.MAX_TITLE} 字）。` };
  const kind = input && input.kind;
  if (!KINDS.includes(kind)) return { error: `kind 必须是 ${KINDS.join('/')} 之一。` };
  const html = input && input.html;
  if (typeof html !== 'string') return { error: 'html 必须是字符串。' };
  const sha = input && input.sha256;
  if (!validSha(sha)) return { error: 'sha256 缺失或形状非法（64 位小写十六进制）。' };
  const id = genId(rand);
  const report = scanSource(html);
  if (!report.ok) return { error: `扫描未通过，未入库：\n${scanReportText(report)}` };
  const version = {
    v: 1,
    changelog: cleanChangelog(input.changelog, '初版'),
    createdAt: now,
    size: report.sizeBytes,
    sha256: sha,
    warns: report.warnings.length,
  };
  const app = {
    id,
    title,
    kind,
    tags: cleanTags(input.tags),
    createdAt: now,
    updatedAt: now,
    head: 1,
    size: report.sizeBytes,
    pushedAt: null,
    versions: [version],
  };
  return { app, version, parts: chunkSource(html) };
}

/**
 * 追加新版本（只增不改）。scan 已由调用方先行（本函数只复核限额）。
 * 返回 { app, version, parts } 或 { error }。
 */
function appendVersion(app, input) {
  if (!app || !Array.isArray(app.versions)) return { error: '应用数据损坏。' };
  if (app.versions.length >= LIMITS.MAX_APPS * 4) return { error: `版本数已达上限 ${app.versions.length}，请回退整理。` };
  const html = input && input.html;
  if (typeof html !== 'string') return { error: 'html 必须是字符串。' };
  const sha = input && input.sha256;
  if (!validSha(sha)) return { error: 'sha256 缺失或形状非法。' };
  const now = (input && input.now) || Date.now();
  const prev = app.versions[app.versions.length - 1];
  const version = {
    v: prev.v + 1,
    changelog: cleanChangelog(input.changelog, `迭代自 v${prev.v}`),
    createdAt: now,
    size: byteLength(html),
    sha256: sha,
    warns: (input.warnCount != null) ? input.warnCount : 0,
  };
  const next = {
    ...app,
    updatedAt: now,
    head: version.v,
    size: version.size,
    versions: [...app.versions, version],
  };
  return { app: next, version, parts: chunkSource(html) };
}

/** 回退 = 把 vOld 源码复制为新版本（配合 chunkSource 已存的旧块；不复制数据，只换指针语义） */
function rollbackVersion(app, vOld, now) {
  if (!app || !Array.isArray(app.versions)) return { error: '应用数据损坏。' };
  const src = app.versions.find((x) => x && x.v === vOld);
  if (!src) return { error: `版本 v${vOld} 不存在。` };
  const prev = app.versions[app.versions.length - 1];
  const version = {
    v: prev.v + 1,
    changelog: `回退自 v${vOld}（${src.changelog}）`,
    createdAt: now,
    size: src.size,
    sha256: src.sha256,
    warns: src.warns || 0,
  };
  const next = {
    ...app,
    updatedAt: now,
    head: version.v,
    size: src.size,
    versions: [...app.versions, version],
  };
  // 回退版本复用旧块：partCount 沿用旧版块数（调用方按 verPartPrefix(id, vOld) 读块）
  return { app: next, version, reuseFrom: vOld };
}

// ── 索引（唯一权威；读-合并-写抗并发） ──────────────────────────────────────

function sanitizeVersion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const v = Number(raw.v);
  if (!Number.isInteger(v) || v < 1 || v > 1e6) return null;
  if (!validSha(raw.sha256)) return null;
  const size = Number(raw.size);
  return {
    v,
    changelog: typeof raw.changelog === 'string' ? raw.changelog.slice(0, LIMITS.MAX_CHANGELOG) : '',
    createdAt: Number(raw.createdAt) || 0,
    size: Number.isFinite(size) ? size : 0,
    sha256: raw.sha256,
    warns: Number(raw.warns) || 0,
  };
}

/** 索引读时愈合：坏条目就地剔除，字段收口 */
function sanitizeIndex(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    if (!validId(it.id) || seen.has(it.id)) continue;
    const title = cleanTitle(it.title);
    if (!title) continue;
    const versions = Array.isArray(it.versions)
      ? it.versions.map(sanitizeVersion).filter(Boolean).sort((a, b) => a.v - b.v)
      : [];
    if (!versions.length) continue;
    seen.add(it.id);
    out.push({
      id: it.id,
      title,
      kind: KINDS.includes(it.kind) ? it.kind : 'tool',
      tags: cleanTags(it.tags),
      createdAt: Number(it.createdAt) || 0,
      updatedAt: Number(it.updatedAt) || versions[versions.length - 1].createdAt,
      head: Number(it.head) || versions[versions.length - 1].v,
      size: Number(it.size) || versions[versions.length - 1].size,
      pushedAt: Number(it.pushedAt) || null,
      versions,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

function upsertIndex(index, entry) {
  const rest = index.filter((x) => x.id !== entry.id);
  return [entry, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

function removeIndex(index, id) {
  return index.filter((x) => x.id !== id);
}

/**
 * 双端并发写合并：按 id 取 updatedAt 新者；被删除端（本地无此 id）不动远端条目——
 * 删除以显式 removeIndex + 立即回写表达，合并窗口内新增条目两侧都保留。
 */
function mergeIndex(local, remote) {
  const a = sanitizeIndex(local);
  const b = sanitizeIndex(remote);
  const map = new Map();
  for (const it of b) map.set(it.id, it);
  for (const it of a) {
    const cur = map.get(it.id);
    if (!cur || it.updatedAt > cur.updatedAt) map.set(it.id, it);
  }
  return [...map.values()].sort((x, y) => y.updatedAt - x.updatedAt);
}

// ── 成绩（沙箱 postMessage 协议的落库侧） ───────────────────────────────────

function sanitizeScores(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const score = Number(s.score);
    if (!Number.isFinite(score) || Math.abs(score) > LIMITS.MAX_SCORE_ABS) continue;
    out.push({
      score,
      player: typeof s.player === 'string' ? s.player.slice(0, 24) : '匿名',
      device: typeof s.device === 'string' ? s.device.slice(0, 24) : '',
      ts: Number(s.ts) || 0,
    });
  }
  return out.slice(-LIMITS.MAX_SCORES);
}

function addScore(list, entry) {
  const score = Number(entry && entry.score);
  if (!Number.isFinite(score) || Math.abs(score) > LIMITS.MAX_SCORE_ABS) {
    return { error: '成绩必须是有限数值。' };
  }
  const next = sanitizeScores([...(list || []), {
    score,
    player: entry.player,
    device: entry.device,
    ts: (entry && entry.ts) || Date.now(),
  }]);
  return { scores: next };
}

/** 榜单：score 降序，同分先到先得（ts 升序） */
function topScores(list, limit) {
  const n = Number(limit) || 10;
  return [...(list || [])]
    .sort((a, b) => (b.score - a.score) || (a.ts - b.ts))
    .slice(0, Math.max(1, Math.min(n, LIMITS.MAX_SCORES)));
}

// ── 设置 ───────────────────────────────────────────────────────────────────

function sanitizeSettings(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  return {
    nickname: typeof s.nickname === 'string' ? s.nickname.trim().slice(0, 24) : '',
    deviceName: typeof s.deviceName === 'string' ? s.deviceName.trim().slice(0, 24) : '',
  };
}

module.exports = {
  LIMITS, KINDS, KIND_LABELS, K, SCAN_RULES,
  byteLength, validId, genId,
  scanSource, scanReportText,
  chunkSource, assembleParts,
  validSha, cleanTitle, cleanTags, cleanChangelog,
  newApp, appendVersion, rollbackVersion,
  sanitizeIndex, upsertIndex, removeIndex, mergeIndex, sanitizeVersion,
  sanitizeScores, addScore, topScores, sanitizeSettings,
};
