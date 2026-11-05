'use strict';
/**
 * engine-api.js —— jq 查询台纯逻辑层（service / mcp / test 共用的单一权威）
 *
 * 职责：flags 白名单与规范化、JSON 流切分（多文档 NDJSON / 多输出解析）、
 *       输入统计、超时钳制。纯函数零依赖，不做任何 IO。
 * 常量即契约：输入 ≤64MB、结果 ≤8MB 截断、超时缺省 5s 上限 30s。
 */

const LIMITS = {
  INPUT_MAX_BYTES: 64 * 1024 * 1024,
  RESULT_MAX_BYTES: 8 * 1024 * 1024,
  TIMEOUT_DEFAULT_MS: 5000,
  TIMEOUT_MIN_MS: 100,
  TIMEOUT_MAX_MS: 30000,
  REFERENCE_RESULT_CAP: 40,
};

// 单字符 flag 白名单（jq CLI 语义；-R 原样行输入用于日志文本场景）
const BARE_FLAGS = new Set([
  '-r', '--raw-output',
  '-j', '--join-output',
  '-c', '--compact-output',
  '-a', '--ascii-output',
  '-S', '--sort-keys',
  '--tab',
  '-s', '--slurp',
  '-n', '--null-input',
  '-R', '--raw-input',
]);
// 单字符 flag 集合（聚合式 -rn 展开用）
const SHORT_FLAGS = new Set([...BARE_FLAGS].filter((f) => !f.startsWith('--')));

/**
 * 规范化 flags：支持空格式 args（['--arg', 'k', 'v']）与 POSIX 聚合式（['-rn']）。
 * 返回 { ok, flags, error }；--arg/--argjson 校验必须带两个参数。
 */
function normalizeFlags(raw) {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f === '--arg' || f === '--argjson') {
      const name = list[i + 1];
      const value = list[i + 2];
      if (name == null || value == null) {
        return { ok: false, flags: [], error: `${f} 需要两个参数：<名称> <值>` };
      }
      if (f === '--argjson') {
        try { JSON.parse(value); } catch (_) {
          return { ok: false, flags: [], error: `--argjson ${name} 的值不是合法 JSON：${String(value).slice(0, 60)}` };
        }
      }
      out.push(f, String(name), String(value));
      i += 2;
      continue;
    }
    if (BARE_FLAGS.has(f)) { out.push(f); continue; }
    // 聚合式：-rn / -rnS 等（全部字符都能映射到已知单字符 flag 才放行）
    if (/^-[a-zA-Z]{2,}$/.test(f)) {
      const chars = [...f.slice(1)].map((c) => '-' + c);
      if (chars.every((c) => SHORT_FLAGS.has(c))) { out.push(...chars); continue; }
    }
    return { ok: false, flags: [], error: `不支持的 flag：${f}（白名单：-r -j -c -a -S --tab -s -n -R 及 --arg/--argjson）` };
  }
  return { ok: true, flags: out };
}

/** 超时钳制：缺省 5s，范围 [100, 30000] */
function clampTimeoutMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return LIMITS.TIMEOUT_DEFAULT_MS;
  return Math.min(LIMITS.TIMEOUT_MAX_MS, Math.max(LIMITS.TIMEOUT_MIN_MS, Math.round(n)));
}

/**
 * 切分一段文本中的顶层 JSON 值（ NDJSON / 空白分隔的多文档 / jq 多输出通用）。
 * 返回 [{ value?, error?, start, end }]；解析失败的片段带 error，绝不抛异常。
 * 迷你词法：跟踪 {} [] 深度与字符串（含转义），在深度 0 的边界切分。
 */
function splitJsonStream(text, cap = 100000) {
  const s = String(text == null ? '' : text);
  const items = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /\s/.test(s[i])) i++;
    if (i >= n) break;
    if (items.length >= cap) {
      items.push({ error: `文档数超过上限 ${cap}，已截断`, start: i, end: n });
      break;
    }
    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let done = false;
    for (; i < n && !done; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth <= 0 && (c === '}' || c === ']')) { i++; done = true; }
      } else if (depth === 0) {
        // 标量值：读到空白为止
        if (/\s/.test(c)) { done = true; }
      }
    }
    const raw = s.slice(start, done ? i : n).trim();
    if (!raw) break;
    let item = { start, end: done ? i : n };
    try { item = { ...item, value: JSON.parse(raw) }; } catch (e) {
      item = { ...item, error: (e && e.message) || 'JSON 解析失败' };
    }
    items.push(item);
  }
  return items;
}

/** 输入统计：字节数 + 文档数 + 首个解析错误（用于面板信息条与错误提示） */
function inputStats(text) {
  const s = String(text == null ? '' : text);
  const bytes = Buffer ? Buffer.byteLength(s, 'utf8') : s.length;
  const parts = splitJsonStream(s);
  const firstErr = parts.find((p) => p.error);
  return {
    bytes,
    chars: s.length,
    docCount: parts.filter((p) => !p.error).length,
    hasParseError: Boolean(firstErr && s.trim().length > 0),
    parseError: firstErr ? firstErr.error : null,
    empty: s.trim().length === 0,
  };
}

/**
 * 解析 jq 输出流为值数组（raw 通道输出即 JSON 流）。
 * 带解析失败容错：单段失败保留 error 项，不炸整批。
 */
function parseOutputs(rawText) {
  const parts = splitJsonStream(String(rawText == null ? '' : rawText));
  const outputs = [];
  for (const p of parts) {
    if (p.error) outputs.push({ error: p.error, raw: String(rawText).slice(p.start, p.end).slice(0, 200) });
    else outputs.push({ value: p.value });
  }
  return outputs;
}

/** 安全截断提示语 */
function truncationNotice(bytes, limit) {
  return `输出 ${bytes} 字节超过上限 ${limit}，已截断（可用 -c 压缩输出或加 limit/first 缩小结果）`;
}

module.exports = {
  LIMITS,
  BARE_FLAGS,
  normalizeFlags,
  clampTimeoutMs,
  splitJsonStream,
  inputStats,
  parseOutputs,
  truncationNotice,
};
