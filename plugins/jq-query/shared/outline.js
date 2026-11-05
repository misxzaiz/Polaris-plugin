'use strict';
/**
 * outline.js —— JSON 结构大纲（纯 JS，不依赖 jq 引擎）
 *
 * 用途：帮人类/AI 在写查询之前先看懂一份大 JSON 的形状：
 *   根类型、键集合、数组长度与元素类型、嵌套深度、样本值（截断）。
 * 单一权威：/api/outline（service）与 MCP json_outline 工具共用。
 */

const DEFAULT_DEPTH = 3;
const DEFAULT_MAX_CHILDREN = 24;
const SAMPLE_MAX_CHARS = 48;

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v === 'object' ? 'object' : typeof v; // string/number/boolean
}

function clip(s, n) {
  const t = String(s);
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function sampleOf(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return clip(JSON.stringify(v), SAMPLE_MAX_CHARS);
  if (t === 'number' || t === 'boolean') return String(v);
  return '';
}

/**
 * 生成结构大纲节点。
 * @param value 解析后的 JSON 值
 * @param opts { depth?, maxChildren? }
 * 节点形状：{ type, path, length?, keys?, childTypes?, elementKeys?, children?, sample?, truncated? }
 */
function outlineOf(value, opts) {
  const maxDepth = Math.max(1, Math.min(8, Number(opts && opts.depth) || DEFAULT_DEPTH));
  const maxChildren = Math.max(1, Math.min(64, Number(opts && opts.maxChildren) || DEFAULT_MAX_CHILDREN));
  function walk(v, path, depth) {
    const t = typeOf(v);
    if (t === 'array') {
      const node = { type: 'array', path, length: v.length };
      if (v.length === 0) return node;
      // 元素类型统计（最多看前 200 个元素，避免巨型数组全扫）
      const seen = new Map();
      const scanCount = Math.min(v.length, 200);
      for (let i = 0; i < scanCount; i++) {
        const et = typeOf(v[i]);
        seen.set(et, (seen.get(et) || 0) + 1);
      }
      node.childTypes = [...seen.entries()].map(([k, c]) => `${k}×${c}`).join(' ');
      if (v.length > scanCount) node.sampledFirst = scanCount;
      // 对象元素：给出键并集（对写 .[] | select 很有用）
      const objKeys = [];
      for (let i = 0; i < Math.min(v.length, 50); i++) {
        if (typeOf(v[i]) === 'object') {
          for (const k of Object.keys(v[i])) if (!objKeys.includes(k)) objKeys.push(k);
        }
      }
      if (objKeys.length) node.elementKeys = objKeys.slice(0, maxChildren);
      if (depth < maxDepth) {
        const shown = Math.min(v.length, maxChildren);
        node.children = [];
        for (let i = 0; i < shown; i++) node.children.push(walk(v[i], `${path}[${i}]`, depth + 1));
        if (v.length > shown) node.truncated = true;
      }
      return node;
    }
    if (t === 'object') {
      const keys = Object.keys(v);
      const node = { type: 'object', path, length: keys.length, keys: keys.slice(0, maxChildren) };
      if (keys.length > maxChildren) node.truncated = true;
      if (depth < maxDepth) {
        node.children = [];
        for (const k of keys.slice(0, maxChildren)) node.children.push(walk(v[k], path ? `${path}.${k}` : `.${k}`, depth + 1));
      }
      return node;
    }
    return { type: t, path, sample: sampleOf(v) };
  }
  return walk(value, '.', 1);
}

/** 大纲→缩进文本（MCP 输出用） */
function renderOutline(node) {
  const lines = [];
  function emit(n, indent) {
    const pad = '  '.repeat(indent);
    if (n.type === 'array' || n.type === 'object') {
      const head = n.type === 'array'
        ? `array(${n.length})${n.childTypes ? ` 元素: ${n.childTypes}` : ''}`
        : `object(${n.length})`;
      lines.push(`${pad}${n.path}: ${head}`);
      if (n.elementKeys) lines.push(`${pad}  元素键并集: ${n.elementKeys.join(', ')}`);
      if (n.keys) lines.push(`${pad}  键: ${n.keys.join(', ')}${n.truncated ? ' …(截断)' : ''}`);
      for (const c of n.children || []) emit(c, indent + 1);
      if (n.truncated && n.type === 'array') lines.push(`${pad}  …共 ${n.length} 项，仅展开前 ${(n.children || []).length}`);
    } else {
      lines.push(`${pad}${n.path}: ${n.type}${n.sample != null && n.sample !== '' ? ` = ${n.sample}` : ''}`);
    }
  }
  emit(node, 0);
  return lines.join('\n');
}

/** 快捷入口：文本 → 大纲+渲染；解析失败返回 null（由调用方报错） */
function outlineFromText(text, opts) {
  let value;
  try { value = JSON.parse(String(text == null ? '' : text)); } catch (_) { return null; }
  const node = outlineOf(value, opts);
  return { node, text: renderOutline(node) };
}

module.exports = { outlineOf, renderOutline, outlineFromText, typeOf };
