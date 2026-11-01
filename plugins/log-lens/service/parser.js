'use strict';
/**
 * parser.js —— 日志行解析（零依赖）
 *
 * 四级格式：
 *   tracing —— Rust tracing 标准输出：`2026-11-01T00:04:41.05Z  INFO target: msg`
 *              （Polaris 宿主 / 多数 Rust 服务的原生格式，主格式）
 *   common  —— 通用时间戳头：`2026-11-01 10:00:00.123 [thread] INFO com.foo - msg`
 *   jsonl   —— 每行一个 JSON 对象（ts/level/msg 等常见字段名自适应）
 *   plain   —— 以上都不匹配：整行作消息，级别按关键词推断
 *
 * 多行归并：不以时间戳头开头的行（span 展开、pretty JSON、调用栈）归并进
 * 上一条 entry 的 message（保留换行），endOffset 随之推进——分页以 entry 为
 * 原子，不会把同一 entry 拆到两页。
 */

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const LEVEL_RANK = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 };

// tracing target 可含冒号（polaris_lib::services::x），以「: 」（冒号+空格）定界；
// target 懒惰匹配到第一个「: 」处（target 本身不含 ": "，首个即分隔符）
const RE_TRACING = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s+(.+?): (.*)$/;
const RE_COMMON = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+(?:\[([^\]]*)\]\s+)?(?:(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|NOTICE)\s+)?(?:(?<target>[\w.$:/\\-]+)\s+-\s+)?(?<rest>[\s\S]*)$/;

const LEVEL_ALIASES = {
  TRACE: 'TRACE', DEBUG: 'DEBUG', INFO: 'INFO', NOTICE: 'INFO',
  WARN: 'WARN', WARNING: 'WARN', ERROR: 'ERROR', ERR: 'ERROR',
  FATAL: 'FATAL', CRITICAL: 'FATAL', PANIC: 'FATAL',
};

function normalizeLevel(raw) {
  if (!raw) return null;
  return LEVEL_ALIASES[String(raw).toUpperCase()] || null;
}

/** 从自由文本推断级别（plain 格式 / 无级别字段的行；大小写不敏感；FATAL 优先） */
function inferLevel(text) {
  if (/\b(FATAL|CRITICAL|PANIC)\b/i.test(text)) return 'FATAL';
  if (/\b(ERROR|ERR|Exception)\b/i.test(text)) return 'ERROR';
  if (/\b(WARN|WARNING)\b/i.test(text)) return 'WARN';
  if (/\bDEBUG\b/i.test(text)) return 'DEBUG';
  if (/\bTRACE\b/i.test(text)) return 'TRACE';
  return 'INFO';
}

function parseTs(s) {
  if (!s) return null;
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

/** 解析 ISO/常见时间戳之外，兼容纯数字秒/毫秒 */
function tsFromValue(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 1e12 ? v : v > 1e9 ? v * 1000 : null; // 秒 → 毫秒
  }
  if (typeof v === 'string') return parseTs(v);
  return null;
}

function parseTracingLine(line) {
  const m = RE_TRACING.exec(line);
  if (!m) return null;
  return { ts: parseTs(m[1]), level: m[2], target: m[3] || '', message: m[4] || '' };
}

function parseCommonLine(line) {
  const m = RE_COMMON.exec(line);
  if (!m || !m[1]) return null;
  const rest = m.groups && m.groups.rest !== undefined ? m.groups.rest : m[4] || '';
  const target = (m.groups && m.groups.target) || '';
  const level = normalizeLevel(m[3]) || inferLevel(rest || line);
  return { ts: parseTs(m[1]), level, target, message: rest };
}

const JSONL_TS_KEYS = ['ts', 'timestamp', 'time', '@timestamp', 't', 'date', 'datetime'];
const JSONL_LEVEL_KEYS = ['level', 'lvl', 'severity', 'level_name', 'levelname'];
const JSONL_MSG_KEYS = ['msg', 'message', 'event', 'text', 'detail'];
const JSONL_TARGET_KEYS = ['target', 'logger', 'component', 'module', 'source', 'service'];

function parseJsonlLine(line) {
  const t = line.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  let obj;
  try { obj = JSON.parse(t); } catch (_) { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  let ts = null;
  for (const k of JSONL_TS_KEYS) {
    if (obj[k] !== undefined) { ts = tsFromValue(obj[k]); if (ts !== null) break; }
  }
  let level = null;
  for (const k of JSONL_LEVEL_KEYS) {
    if (obj[k] !== undefined) { level = normalizeLevel(obj[k]); if (level) break; }
  }
  let message = '';
  for (const k of JSONL_MSG_KEYS) {
    const v = obj[k];
    if (v !== undefined) {
      message = typeof v === 'string' ? v : JSON.stringify(v);
      break;
    }
  }
  if (!message) {
    // 无 msg 字段：除时间戳/级别外的全部键值作为消息（保留信息不丢弃）
    const rest = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!JSONL_TS_KEYS.includes(k) && !JSONL_LEVEL_KEYS.includes(k)) rest[k] = v;
    }
    message = Object.keys(rest).length ? JSON.stringify(rest) : t;
  }
  let target = '';
  for (const k of JSONL_TARGET_KEYS) {
    if (typeof obj[k] === 'string') { target = obj[k]; break; }
  }
  return { ts, level: level || inferLevel(message), target, message };
}

/**
 * 采样探测格式：返回 'tracing' | 'common' | 'jsonl' | 'plain'。
 * 各格式统计「头行」命中率，≥40% 且最高者胜出；全低则 plain。
 */
function detectFormat(lines) {
  // CRLF 文件按 \n split 后行尾残留 \r（JS 正则 . 不匹配 \r，会破坏头行判定）→ 先剥
  const sample = lines
    .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
    .filter((l) => l && l.trim())
    .slice(0, 200);
  if (!sample.length) return 'plain';
  let tracing = 0, common = 0, jsonl = 0;
  for (const line of sample) {
    if (RE_TRACING.test(line)) tracing++;
    else if (RE_COMMON.test(line)) common++;
    if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
      try { JSON.parse(line); jsonl++; } catch (_) { /* 非 JSONL */ }
    }
  }
  const n = sample.length;
  if (tracing / n >= 0.4) return 'tracing';
  if (jsonl / n >= 0.4) return 'jsonl';
  if (common / n >= 0.4) return 'common';
  return 'plain';
}

/**
 * 前向解析器：逐行喂入，输出完整 entry。
 * 语义：遇到头行时，先吐出上一条暂存 entry（含其全部 continuation），再开新条；
 * 遇到 continuation 行，归并进暂存 entry；无暂存（窗口起始的孤儿行）→
 * 以 level=null 的独立 entry 输出（不静默丢数据）。
 *
 * @returns {{ addLine(text:string, offset:number, endOffset:number): Entry|null, flush(): Entry|null }}
 */
function createParser(format) {
  let pending = null;
  const pick = format === 'tracing' ? parseTracingLine
    : format === 'common' ? parseCommonLine
      : format === 'jsonl' ? parseJsonlLine
        : (line) => ({ ts: null, level: inferLevel(line), target: '', message: line });

  function finish(entry, endOffset) {
    entry.endOffset = endOffset;
    if (entry.message.length > 64 * 1024) {
      entry.message = `${entry.message.slice(0, 64 * 1024)}…（超长截断）`;
      entry.truncatedMsg = true;
    }
    return entry;
  }

  return {
    addLine(text, offset, endOffset) {
      const head = pick(text);
      if (!head) {
        // continuation：归并进暂存 entry
        if (pending) {
          pending.message += `${pending.message ? '\n' : ''}${text}`;
          return null;
        }
        // 孤儿 continuation（窗口起点没有头行）：不丢数据，独立输出
        return finish({ offset, ts: null, level: null, target: '', message: text, continuation: true }, endOffset);
      }
      const done = pending ? finish(pending, offset) : null; // 上一条止于本行行首
      pending = {
        offset,
        ts: head.ts,
        level: head.level || (format === 'plain' ? inferLevel(text) : 'INFO'),
        target: head.target || '',
        message: head.message || '',
      };
      return done;
    },
    flush() {
      if (!pending) return null;
      const done = pending;
      pending = null;
      return finish(done, done.endOffset || done.offset);
    },
  };
}

module.exports = {
  LEVELS, LEVEL_RANK, detectFormat, createParser,
  parseTracingLine, parseCommonLine, parseJsonlLine, inferLevel, normalizeLevel,
};
