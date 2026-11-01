'use strict';
/**
 * core.js —— 服务 / MCP / 面板共享的纯逻辑（零依赖、零 IO）
 *
 * 单一权威：设置归一化、路径校验、响应封顶、敏感信息掩码、entry 摘要——
 * 三端共用同一份实现，杜绝口径漂移（house 范式，同 webhook-station shared/core）。
 */

const PLUGIN_ID = 'log-lens';
const KV_PREFIX = 'lls';
const MANIFEST_PORT = 9870;
const VERSION = '0.1.0';

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const MAX_LINES_PER_RESPONSE = 500;
const MAX_BYTES_PER_RESPONSE = 2 * 1024 * 1024;
const SCAN_CAP_DEFAULT = 16 * 1024 * 1024;
const LOG_FILE_RE = /\.(log|log\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.log|out|txt|err)$/i;

// ── 设置 ────────────────────────────────────────────────────────────────────
/** @returns {{sources:Array<{path:string,kind:string,addedAt:number}>, liveIntervalMs:number}} */
function normalizeSettings(v) {
  const s = v && typeof v === 'object' ? v : {};
  const sources = Array.isArray(s.sources)
    ? s.sources
      .filter((x) => x && typeof x.path === 'string' && x.path.trim())
      .slice(0, 50)
      .map((x) => ({
        path: String(x.path),
        kind: x.kind === 'file' ? 'file' : 'dir',
        addedAt: Number(x.addedAt) || 0,
      }))
    : [];
  const liveIntervalMs = Math.min(Math.max(Number(s.liveIntervalMs) || 1500, 500), 30000);
  return { sources, liveIntervalMs };
}

// ── 路径 ────────────────────────────────────────────────────────────────────
/** 路径入参校验：字符串、长度、空字节；返回 trim 后的路径或抛错 */
function sanitizePath(p) {
  const s = String(p == null ? '' : p).trim();
  if (!s) throw new Error('路径为空');
  if (s.length > 500) throw new Error('路径过长（>500 字符）');
  if (s.includes('\0')) throw new Error('路径含非法字符');
  if (/^(https?|ftp):\/\//i.test(s)) throw new Error('仅支持本地路径');
  return s;
}

// ── 敏感信息掩码 ────────────────────────────────────────────────────────────
const RE_SECRET_KV = /((?:token|key|secret|password|passwd|authorization|credential|apikey|api_key|access_token|refresh_token|signature|sig)["']?\s*[:=]\s*["']?)([^\s"',;&}]{8,})/gi;
const RE_BEARER = /\b(bearer\s+)[A-Za-z0-9._\-]{8,}/gi;

/** 复制脱敏：token/key/password 等键值打掩码（面板复制 & AI 提示共用） */
function maskSensitive(text) {
  return String(text || '')
    .replace(RE_BEARER, '$1***')
    .replace(RE_SECRET_KV, (m, p1) => `${p1}***`);
}

// ── entry 摘要（MCP 文本输出用）────────────────────────────────────────────
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function formatTs(ts) {
  if (!ts) return '-';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

/** entry → 一行摘要（时间 级别 目标 消息） */
function summarizeEntry(e, maxLen) {
  const lvl = (e.level || 'CONT').padEnd(5);
  const ts = formatTs(e.ts).slice(11, 19); // HH:MM:SS
  const target = e.target ? `${e.target}: ` : '';
  return `[${ts}] ${lvl} ${target}${oneLine(e.message, maxLen || 160)}`;
}

/** 文件名（跨平台） */
function baseName(p) {
  return String(p || '').split(/[\\/]/).pop() || p;
}

module.exports = {
  PLUGIN_ID, KV_PREFIX, MANIFEST_PORT, VERSION, LEVELS,
  MAX_LINES_PER_RESPONSE, MAX_BYTES_PER_RESPONSE, SCAN_CAP_DEFAULT, LOG_FILE_RE,
  normalizeSettings, sanitizePath, maskSensitive,
  oneLine, formatBytes, formatTs, summarizeEntry, baseName,
};
