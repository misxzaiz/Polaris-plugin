'use strict';
/**
 * repair-core.js —— LLM JSON 修复器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 修复语义（如实声明）：
 *   - 策略式修复覆盖 LLM 常见错误模式，**不保证修复任意坏 JSON**——不可修时
 *     返回 { ok:false }，绝不输出半成品。
 *   - 修复的是语法合法性，不保证值的语义正确（值含义调用方自行判断）。
 *   - 每处修改记录 { pos, type, excerpt }（位置字符偏移 + 修复类型 + 原样摘录），
 *     报告可审计；原样合法 JSON 走快速通道零修改。
 *
 * 策略（按 LLM 输出真实错误频率排序）：
 *   1. markdown 围栏剥离（```json ... ``` / ``` ... ```）与前后装饰文本
 *   2. // 行注释与 /* 块注释剥离（字符串字面量内的不动）
 *   3. 单引号 → 双引号（键与字符串值；含转义配对）
 *   4. 尾逗号剥离（对象/数组闭合前的 ,）
 *   5. 未转义控制字符转义（字符串字面量内的裸换行/制表符）
 *   6. 非法字面量归一（NaN/Infinity/-Infinity → null；单引号 True/False → true/false? 不改——只处理 JSON 边界）
 *   7. 未闭合括号/引号补全（按栈配对：{ [ " 逆序补闭合）
 */

const FIX_TYPES = {
  fence: 'markdown 代码围栏剥离',
  preamble: '围栏外装饰文本剥离',
  comment: '注释剥离',
  quote: '单引号转双引号',
  trailing: '尾逗号剥离',
  control: '字符串内控制字符转义',
  literal: '非法字面量归一（NaN/Infinity → null）',
  close: '未闭合括号/引号补全',
};

const PREVIEW_CAP = 40;

/**
 * 修复 JSON 文本（纯函数，单测覆盖）。
 * @param {string} text 坏 JSON 文本
 * @returns {{ ok: true, json: string, fixes: Array<{pos:number,type:string,typeLabel:string,excerpt:string}>, changed: boolean } |
 *           { ok: false, error: string, fixes: Array }}
 */
function repair(text) {
  const raw = String(text == null ? '' : text);
  if (!raw.trim()) return { ok: false, error: '输入为空', fixes: [] };
  const fixes = [];
  const addFix = (pos, type, excerpt) => fixes.push({ pos, type, typeLabel: FIX_TYPES[type] || type, excerpt: truncate(excerpt, PREVIEW_CAP) });
  let s = raw;

  // 快速通道：原样合法且非空——零修改
  if (isValidJson(s)) {
    return { ok: true, json: s, fixes: [], changed: false };
  }

  // 1) markdown 围栏剥离（```json ... ``` 或 ``` ... ```，取第一段围栏内容）
  const fence = s.match(/^\s*```(?:json)?\s*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/);
  if (fence) {
    addFix(s.indexOf('```'), 'fence', s.slice(0, 12) + '…');
    s = fence[1];
  }

  // 2) 围栏外装饰文本：首行（{ 或 [ 之前）与尾行（} 或 ] 之后）的裸文本
  const firstBrace = s.search(/[{[]/);
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (firstBrace > 0 || (lastBrace !== -1 && lastBrace < s.length - 1)) {
    const trimmed = s.slice(firstBrace >= 0 ? firstBrace : 0, lastBrace >= 0 ? lastBrace + 1 : s.length);
    if (trimmed !== s && firstBrace >= 0) {
      addFix(0, 'preamble', s.slice(0, Math.min(firstBrace + 8, 40)).replace(/\n/g, '\\n'));
      s = trimmed;
    }
  }

  // 3) 字符串感知的字符级扫描与改写（一次遍历处理 3/4/5/6 + 引号补全素材）
  const out = [];
  const stack = []; // 引号外结构栈：'{' '['
  let i = 0;
  let inStr = false; // 当前在双引号字符串内
  let strEscaped = false;
  const strStart = { idx: -1, quote: '' };
  let singleQuoted = false; // 当前在单引号字符串内（待转换）

  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (strEscaped) { strEscaped = false; out.push(ch); i++; continue; }
      if (ch === '\\') { strEscaped = true; out.push(ch); i++; continue; }
      if (singleQuoted) {
        if (ch === "'") { inStr = false; singleQuoted = false; out.push('"'); i++; continue; }
        if (ch === '"') { out.push('\\"'); i++; continue; } // 单引号串内的双引号须转义
        // 字符串内裸控制字符转义（type=control）
        if (ch === '\n') { addFix(i, 'control', '裸换行'); out.push('\\n'); i++; continue; }
        if (ch === '\r') { addFix(i, 'control', '裸回车'); out.push('\\r'); i++; continue; }
        if (ch === '\t') { addFix(i, 'control', '裸制表符'); out.push('\\t'); i++; continue; }
        out.push(ch); i++; continue;
      }
      // 双引号字符串内
      if (ch === '"') {
        // 闭合前检查尾逗号场景放后处理；这里仅闭合
        inStr = false; out.push('"'); i++; continue;
      }
      if (ch === '\n') { addFix(i, 'control', '裸换行'); out.push('\\n'); i++; continue; }
      if (ch === '\r') { addFix(i, 'control', '裸回车'); out.push('\\r'); i++; continue; }
      if (ch === '\t') { addFix(i, 'control', '裸制表符'); out.push('\\t'); i++; continue; }
      out.push(ch); i++; continue;
    }
    // 引号外：注释检测（// 行注释与 /* 块注释，type=comment）——必须先于引号分支（/ 不是引号字符）
    if (ch === '/' && s[i + 1] === '/') {
      const end = s.indexOf('\n', i);
      addFix(i, 'comment', s.slice(i, end === -1 ? Math.min(i + 30, s.length) : Math.min(end, i + 30)));
      i = end === -1 ? s.length : end; // 保留换行由下轮处理
      continue;
    }
    if (ch === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      addFix(i, 'comment', s.slice(i, end === -1 ? Math.min(i + 40, s.length) : end + 2));
      i = end === -1 ? s.length : end + 2;
      continue;
    }
    // 引号开始
    if (ch === '"' || ch === "'") {
      if (ch === "'") {
        // 单引号字符串 → 转 JSON 双引号（type=quote）
        addFix(i, 'quote', "'");
        inStr = true; singleQuoted = true;
        strStart.idx = i; strStart.quote = "'";
        out.push('"'); i++; continue;
      }
      inStr = true; singleQuoted = false;
      strStart.idx = i; strStart.quote = '"';
      out.push('"'); i++; continue;
    }
    // 引号外结构字符
    if (ch === '{' || ch === '[') { stack.push(ch); out.push(ch); i++; continue; }
    if (ch === '}' || ch === ']') {
      stack.pop();
      // 尾逗号检测：紧邻闭合的 ,（上一位输出是 ,）→ 删除（type=trailing）
      const lastOut = trimOutTail(out);
      if (lastOut === ',') {
        out.length = findTrailingCommaIndex(out);
        addFix(i, 'trailing', ', 前于 ' + ch);
      }
      out.push(ch); i++; continue;
    }
    if (ch === ',') {
      // 非法字面量：, NaN, / , Infinity, —— 识别引号外裸 NaN/Infinity（type=literal）
      out.push(ch); i++; continue;
    }
    if (isLetter(ch)) {
      // 读整词：true/false/null 合法；NaN/Infinity/-Infinity/None/undefined → null
      let j = i;
      while (j < s.length && /[\w]/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (word === 'true' || word === 'false' || word === 'null') {
        out.push(word);
      } else if (word === 'NaN' || word === 'Infinity' || word === 'None' || word === 'undefined') {
        addFix(i, 'literal', word);
        out.push('null');
      } else if (word === '-Infinity' || (word === 'Infinity' && out[out.length - 1] === '-')) {
        addFix(i, 'literal', word);
        out.push('null');
      } else {
        // 裸词（未加引号的键或值）→ 加引号（归类 quote 修复的一种：裸字面量引号补全）
        addFix(i, 'quote', word.slice(0, 20));
        out.push('"' + word + '"');
      }
      i = j; continue;
    }
    out.push(ch); i++; continue;
  }

  // 4) 字符串未闭合：扫描结束仍 inStr → 补闭合引号（type=close）
  if (inStr) {
    addFix(s.length, 'close', `未闭合的 ${singleQuoted ? '单引号' : '双引号'}字符串`);
    out.push('"');
  }

  // 5) 括号未闭合：按栈逆序补全（type=close）
  while (stack.length) {
    const open = stack.pop();
    const close = open === '{' ? '}' : ']';
    // 补全前清尾逗号
    const lastOut = trimOutTail(out);
    if (lastOut === ',') out.length = findTrailingCommaIndex(out);
    addFix(out.length, 'close', `未闭合的 ${open}`);
    out.push(close);
  }

  let json = out.join('');

  // 6) 终验：修复产物必须合法——不合法如实报错（不输出半成品）
  if (!isValidJson(json)) {
    // 最后尝试：剥离首尾空白再验一次
    const trimmed = json.trim();
    if (isValidJson(trimmed)) json = trimmed;
    else return { ok: false, error: `修复后仍非法（策略覆盖不到该错误形态，如实放弃）：${firstError(trimmed)}`, fixes };
  }
  return { ok: true, json, fixes, changed: true };
}

// ── 辅助 ───────────────────────────────────────────────────────────────────

function isLetter(ch) {
  return /[A-Za-z_]/.test(ch);
}

/** 输出缓冲尾部最后一个非空白字符 */
function trimOutTail(out) {
  for (let i = out.length - 1; i >= 0; i--) {
    if (!/\s/.test(out[i])) return out[i];
  }
  return '';
}

/** 尾逗号在输出缓冲中的索引（最后一个非空白是 ,）——返回应截断的位置 */
function findTrailingCommaIndex(out) {
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === ',') return i;
    if (!/\s/.test(out[i])) return out.length; // 尾部非逗号（异常调用），原样
  }
  return out.length;
}

function isValidJson(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  try {
    JSON.parse(s);
    return true;
  } catch (_) {
    return false;
  }
}

function firstError(s) {
  try {
    JSON.parse(s);
    return '(未知)';
  } catch (e) {
    return String(e.message || e).slice(0, 120);
  }
}

function truncate(s, cap) {
  const t = String(s);
  return t.length <= cap ? t : t.slice(0, cap) + '…';
}

/** 修复报告文本渲染（MCP/面板共用口径） */
function renderReport(r) {
  if (!r.ok) return `❌ 无法修复：${r.error}`;
  if (!r.changed) return '✅ 输入已是合法 JSON（快速通道，零修改）';
  const lines = [`✅ 修复完成：${r.fixes.length} 处修改`, '修改点：'];
  for (const f of r.fixes.slice(0, 20)) {
    lines.push(`  [pos ${f.pos}] ${f.typeLabel}：${f.excerpt}`);
  }
  if (r.fixes.length > 20) lines.push(`  （另 ${r.fixes.length - 20} 处略）`);
  return lines.join('\n');
}

module.exports = { repair, renderReport, isValidJson, FIX_TYPES, truncate };
