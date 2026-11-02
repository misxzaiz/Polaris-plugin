'use strict';
/**
 * core.js —— Diff 对比台三端共享纯逻辑（零依赖、零 IO、零网络）。
 *
 * 权威实现（CJS）。面板侧仅允许“同规则 TS 孪生”的轻量渲染辅助；
 * 一切 diff 语义以本文件为准（面板/MCP/服务共用）。
 *
 * 模块（按依赖序）：
 *   1. myersOps            —— O(ND) Myers 行/序列 diff（带 D 上限回退）
 *   2. textDiff            —— 行级 diff：共前后缀裁剪 + Myers + 修改行配对（字级高亮）
 *   3. buildHunks / buildSideBySide / makeUnifiedPatch —— 渲染模型
 *   4. parseJsonLoose      —— 宽容 JSON 解析（BOM 剥离 + 错误行列定位）
 *   5. semanticJsonDiff    —— 键序无关 + 数组相似度对齐的语义 diff（忽略路径 glob）
 *   6. dirDiffTrees        —— 目录树对比（存在性/大小/哈希三态）
 *   7. 摘要与工具          —— MCP 文本摘要 / 截断 / oneLine
 */

/* ============================ 通用工具 ============================ */

function truncate(s, n) {
  const str = String(s == null ? '' : s);
  if (str.length <= n) return str;
  return str.slice(0, Math.max(0, n - 1)) + '…';
}

function oneLine(s, n) {
  return truncate(String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), n);
}

function isPrim(v) {
  return v === null || typeof v !== 'object';
}

/** 键序无关的规范化字符串（用于相似度与相等判断） */
function canonical(value, depth) {
  const d = depth || 0;
  if (d > 64) return '…';
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number' || t === 'boolean') return String(value);
  if (t !== 'object') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonical(v, d + 1)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k], d + 1)).join(',') + '}';
}

/** 廉价相似度：共前后缀占比。阈值语义：>=0.5 视为“同一物的两个版本”。 */
function similarity(a, b) {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const cap = 2000;
  let x = a;
  let y = b;
  if (la > cap) x = x.slice(0, cap >> 1) + x.slice(-cap >> 1);
  if (lb > cap) y = y.slice(0, cap >> 1) + y.slice(-cap >> 1);
  let pre = 0;
  const minLen = Math.min(x.length, y.length);
  while (pre < minLen && x[pre] === y[pre]) pre++;
  if (pre === minLen && x.length === y.length) return 1;
  let suf = 0;
  while (
    suf < minLen - pre &&
    x[x.length - 1 - suf] === y[y.length - 1 - suf]
  ) suf++;
  return (pre + suf) / Math.max(x.length, y.length);
}

/* ============================ 1. Myers diff ============================ */

const MYERS_D_CAP = 2000; // 超出回退朴素分块（共前后缀裁剪后极少触达）

/**
 * 序列 diff，返回 op 数组：{type:'equal'|'delete', a} / {type:'insert', b}
 * （a/b 为各自序列下标）。eq 为相等谓词。超预算时返回 null（调用方回退）。
 */
function myersOps(a, b, eq) {
  const N = a.length;
  const M = b.length;
  const max = N + M;
  if (max === 0) return [];
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace = [];
  let foundD = -1;
  for (let d = 0; d <= max; d++) {
    if (d > MYERS_D_CAP) return null;
    // 记录 d-1 状态（回溯用）；按需切片省内存：本轮只读 [-d, d]
    const slice = new Int32Array(2 * d + 1);
    for (let k = -d; k <= d; k++) slice[k + d] = v[offset + k];
    trace.push(slice);
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < N && y < M && eq(a[x], b[y])) { x++; y++; }
      v[offset + k] = x;
      if (x >= N && y >= M) { foundD = d; break; }
    }
    if (foundD >= 0) break;
  }
  if (foundD < 0) return null;
  const ops = [];
  let x = N;
  let y = M;
  for (let d = foundD; d > 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && vPrev[k - 1 + d] < vPrev[k + 1 + d])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vPrev[prevK + d];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ type: 'equal', a: x - 1, b: y - 1 }); x--; y--; }
    if (x === prevX) { ops.push({ type: 'insert', b: y - 1 }); y--; }
    else { ops.push({ type: 'delete', a: x - 1 }); x--; }
  }
  while (x > 0 && y > 0) { ops.push({ type: 'equal', a: x - 1, b: y - 1 }); x--; y--; }
  while (x > 0) { ops.push({ type: 'delete', a: x - 1 }); x--; }
  while (y > 0) { ops.push({ type: 'insert', b: y - 1 }); y--; }
  ops.reverse();
  return ops;
}

/* ============================ 2. 行级文本 diff ============================ */

const CHAR_DIFF_CAP = 2000; // 行内字级 diff 的单行长度上限

function splitLines(text) {
  if (text === '') return [];
  return String(text).split(/\r\n|\r|\n/);
}

function normalizeLine(line, opts) {
  let s = line;
  if (opts && opts.ignoreWhitespace) s = s.replace(/\s+/g, ' ').trim();
  if (opts && opts.ignoreCase) s = s.toLowerCase();
  return s;
}

/** 行内字级差异 spans：[{text, type:'equal'|'del'|'ins'}]（等价子串成对给左右两侧） */
function charDiff(aStr, bStr) {
  const a = Array.from(aStr.slice(0, CHAR_DIFF_CAP));
  const b = Array.from(bStr.slice(0, CHAR_DIFF_CAP));
  const ops = myersOps(a, b, (x, y) => x === y);
  if (!ops) {
    return {
      left: aStr ? [{ text: aStr, type: 'del' }] : [],
      right: bStr ? [{ text: bStr, type: 'ins' }] : [],
    };
  }
  const left = [];
  const right = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      pushSpan(left, a[op.a], 'equal');
      pushSpan(right, b[op.b], 'equal');
    } else if (op.type === 'delete') {
      pushSpan(left, a[op.a], 'del');
    } else {
      pushSpan(right, b[op.b], 'ins');
    }
  }
  return { left: mergeSpans(left), right: mergeSpans(right) };
}

function pushSpan(arr, ch, type) {
  const last = arr.length ? arr[arr.length - 1] : null;
  if (last && last.type === type) last.text += ch;
  else arr.push({ text: ch, type });
}

function mergeSpans(spans) {
  const out = [];
  for (const sp of spans) {
    const last = out.length ? out[out.length - 1] : null;
    if (last && last.type === sp.type) last.text += sp.text;
    else out.push({ text: sp.text, type: sp.type });
  }
  return out;
}

/**
 * 行级 diff 主入口。
 * @returns {{items, stats}} items: [{type:'equal'|'delete'|'insert'|'modify',
 *   aNo?, bNo?, text?, aText?, bText?, spans?（modify 专用 {left,right}）}]
 */
function lineDiff(aText, bText, opts) {
  const o = opts || {};
  const aLines = splitLines(aText);
  const bLines = splitLines(bText);
  const aNorm = aLines.map((l) => normalizeLine(l, o));
  const bNorm = bLines.map((l) => normalizeLine(l, o));

  // 共前后缀裁剪（等价比较基于规范化行，展示用原文）
  let pre = 0;
  while (pre < aNorm.length && pre < bNorm.length && aNorm[pre] === bNorm[pre]) pre++;
  let suf = 0;
  while (
    suf < aNorm.length - pre &&
    suf < bNorm.length - pre &&
    aNorm[aNorm.length - 1 - suf] === bNorm[bNorm.length - 1 - suf]
  ) suf++;

  const midA = aNorm.slice(pre, aNorm.length - suf);
  const midB = bNorm.slice(pre, bNorm.length - suf);
  let ops = myersOps(midA, midB, (x, y) => x === y);
  if (!ops) {
    // 回退：整体一块替换（正确性优先，视图粒度变粗）
    ops = [];
    for (let i = 0; i < midA.length; i++) ops.push({ type: 'delete', a: i });
    for (let j = 0; j < midB.length; j++) ops.push({ type: 'insert', b: j });
  }

  // 组装 items（真实行号基于 aLines/bLines；共前缀行数同时是 A/B 中段的偏移）
  const items = [];
  for (let i = 0; i < pre; i++) {
    items.push({ type: 'equal', aNo: i + 1, bNo: i + 1, text: aLines[i] });
  }
  collectMid(items, ops, aLines, bLines, pre);
  for (let i = 0; i < suf; i++) {
    const ai = aLines.length - suf + i;
    const bi = bLines.length - suf + i;
    items.push({ type: 'equal', aNo: ai + 1, bNo: bi + 1, text: aLines[ai] });
  }

  let additions = 0;
  let deletions = 0;
  let modifies = 0;
  for (const it of items) {
    if (it.type === 'insert') additions++;
    else if (it.type === 'delete') deletions++;
    else if (it.type === 'modify') modifies++;
  }
  return {
    items,
    stats: {
      additions,
      deletions,
      modifies,
      equal: items.length - additions - deletions - modifies,
      aLines: aLines.length,
      bLines: bLines.length,
    },
  };
}

/**
 * Myers 中段 ops → items（含相邻 delete+insert 的修改行配对）。
 * midOffset：共前缀行数——midA/midB 的 0 基下标加它才是全文 0 基行号（A/B 两侧相同）。
 */
function collectMid(items, ops, aLines, bLines, midOffset) {
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'equal') {
      const aIdx = op.a + midOffset;
      const bIdx = op.b + midOffset;
      items.push({ type: 'equal', aNo: aIdx + 1, bNo: bIdx + 1, text: aLines[aIdx] });
      i++;
      continue;
    }
    // 收集连续的非 equal 块
    let j = i;
    const dels = [];
    const inss = [];
    while (j < ops.length && ops[j].type !== 'equal') {
      if (ops[j].type === 'delete') dels.push(ops[j]);
      else inss.push(ops[j]);
      j++;
    }
    const pairCount = Math.min(dels.length, inss.length);
    // 配对顺序：就近配对（前 del 配前 ins）
    for (let p = 0; p < pairCount; p++) {
      const aIdx = dels[p].a + midOffset;
      const bIdx = inss[p].b + midOffset;
      const aText = aLines[aIdx];
      const bText = bLines[bIdx];
      const spans = charDiff(aText, bText);
      items.push({ type: 'modify', aNo: aIdx + 1, bNo: bIdx + 1, aText, bText, spans });
    }
    for (let p = pairCount; p < dels.length; p++) {
      const aIdx = dels[p].a + midOffset;
      items.push({ type: 'delete', aNo: aIdx + 1, text: aLines[aIdx] });
    }
    for (let p = pairCount; p < inss.length; p++) {
      const bIdx = inss[p].b + midOffset;
      items.push({ type: 'insert', bNo: bIdx + 1, text: bLines[bIdx] });
    }
    i = j;
  }
}

/* ============================ 3. 渲染模型 ============================ */

/** 统一视图 hunks（context 行上下文），超 maxLines 时保留前 maxLines 行并标记截断 */
function buildHunks(items, contextLines, maxLines) {
  const ctx = Math.max(0, Math.min(10, contextLines == null ? 3 : contextLines));
  const cap = Math.max(10, maxLines || 400);
  const changedIdx = [];
  items.forEach((it, i) => { if (it.type !== 'equal') changedIdx.push(i); });
  if (!changedIdx.length) {
    return { hunks: [], stats: { hunkCount: 0, lines: 0 }, truncated: false };
  }
  // 合并区间
  const ranges = [];
  let start = Math.max(0, changedIdx[0] - ctx);
  let end = Math.min(items.length - 1, changedIdx[0] + ctx);
  for (let k = 1; k < changedIdx.length; k++) {
    const s = changedIdx[k] - ctx;
    if (s <= end + 1) {
      end = Math.min(items.length - 1, changedIdx[k] + ctx);
    } else {
      ranges.push([start, end]);
      start = Math.max(0, s);
      end = Math.min(items.length - 1, changedIdx[k] + ctx);
    }
  }
  ranges.push([start, end]);

  const hunks = [];
  let lines = 0;
  let truncated = false;
  for (const [s, e] of ranges) {
    if (lines >= cap) { truncated = true; break; }
    const hunkLines = [];
    for (let i = s; i <= e && lines < cap; i++) {
      const it = items[i];
      hunkLines.push({ type: it.type, aNo: it.aNo, bNo: it.bNo, item: it });
      lines++;
    }
    if (e - s + 1 > hunkLines.length) truncated = true;
    const first = items[s];
    const last = items[e];
    hunks.push({
      aStart: first.aNo == null ? (hunkLines.find((l) => l.item.aNo != null) || {}).item?.aNo ?? 0 : first.aNo,
      bStart: first.bNo == null ? (hunkLines.find((l) => l.item.bNo != null) || {}).item?.bNo ?? 0 : first.bNo,
      lines: hunkLines,
    });
  }
  return { hunks, stats: { hunkCount: hunks.length, lines }, truncated };
}

/** 并排视图行：[{left,right}]；modify 行带 spans */
function buildSideBySide(items) {
  const rows = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.type === 'equal' || it.type === 'modify') {
      rows.push({
        left: it.aNo != null ? { no: it.aNo, text: it.type === 'modify' ? it.aText : it.text, type: it.type === 'modify' ? 'modify' : 'equal', spans: it.type === 'modify' ? it.spans.left : null } : null,
        right: it.bNo != null ? { no: it.bNo, text: it.type === 'modify' ? it.bText : it.text, type: it.type === 'modify' ? 'modify' : 'equal', spans: it.type === 'modify' ? it.spans.right : null } : null,
      });
      i++;
    } else if (it.type === 'delete') {
      // 向后看是否紧跟 insert → 成对行
      if (i + 1 < items.length && items[i + 1].type === 'insert') {
        rows.push({
          left: { no: it.aNo, text: it.text, type: 'delete', spans: null },
          right: { no: items[i + 1].bNo, text: items[i + 1].text, type: 'insert', spans: null },
        });
        i += 2;
      } else {
        rows.push({ left: { no: it.aNo, text: it.text, type: 'delete', spans: null }, right: null });
        i++;
      }
    } else {
      rows.push({ left: null, right: { no: it.bNo, text: it.text, type: 'insert', spans: null } });
      i++;
    }
  }
  return rows;
}

/** 统一格式 patch 文本（git apply 可读的简化 unified diff） */
function makeUnifiedPatch(items, contextLines, aName, bName, maxLines) {
  const { hunks, truncated } = buildHunks(items, contextLines, maxLines);
  const out = [];
  out.push(`--- ${aName || 'a'}`);
  out.push(`+++ ${bName || 'b'}`);
  for (const h of hunks) {
    const aCount = h.lines.filter((l) => l.item.type !== 'insert').length;
    const bCount = h.lines.filter((l) => l.item.type !== 'delete').length;
    out.push(`@@ -${h.aStart},${aCount} +${h.bStart},${bCount} @@`);
    for (const l of h.lines) {
      const it = l.item;
      if (it.type === 'equal') out.push(' ' + (it.text == null ? '' : it.text));
      else if (it.type === 'delete') out.push('-' + (it.text == null ? '' : it.text));
      else if (it.type === 'insert') out.push('+' + (it.text == null ? '' : it.text));
      else {
        out.push('-' + (it.aText == null ? '' : it.aText));
        out.push('+' + (it.bText == null ? '' : it.bText));
      }
    }
  }
  return { patch: out.join('\n'), truncated };
}

/* ============================ 4. 宽容 JSON 解析 ============================ */

/**
 * 轻量 JSON 结构扫描器：定位第一个结构性错误位置（0 基）。
 * 新版 V8 的 JSON.parse 错误消息不再含 "position N"，自扫兜底。
 * 只做结构级校验（不校验 \u 转义合法性等——那些场景回落到 1/1，消息仍取自 JSON.parse）。
 */
function scanJsonError(s) {
  const n = s.length;
  // 帧栈：{type:'obj'|'arr', state}（常量在下方声明）
  const OBJ_KEY = 0;
  const OBJ_COLON = 1;
  const OBJ_VALUE = 3;
  const OBJ_AFTER = 2;
  const ARR_VALUE = 3;
  const ARR_AFTER = 4;
  const stack = [];
  let docDone = false;

  function completeValue() {
    const parent = stack.length ? stack[stack.length - 1] : null;
    if (!parent) docDone = true;
    else if (parent.type === 'arr') parent.state = ARR_AFTER;
    else parent.state = OBJ_AFTER;
  }
  function scanStringFrom(i) {
    // s[i] === '"'；返回结束下标，未闭合返回 -1
    let j = i + 1;
    while (j < n) {
      const c = s[j];
      if (c === '\\') j += 2;
      else if (c === '"') return j;
      else j++;
    }
    return -1;
  }
  const NUM_RE = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/;

  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (i >= n) return n > 0 ? n - 1 : 0; // 戛然而止（栈未清空）
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (docDone) return i; // 顶层值之后仍有内容（含尾逗号场景）
    const frame = stack.length ? stack[stack.length - 1] : null;

    if (!frame) {
      // 顶层：期望唯一值
      if (c === '{') { stack.push({ type: 'obj', state: OBJ_KEY }); i++; continue; }
      if (c === '[') { stack.push({ type: 'arr', state: ARR_VALUE }); i++; continue; }
      const r = scanPrimitive(s, i, n, NUM_RE);
      if (r < 0) return i;
      i = r;
      completeValue();
      continue;
    }
    if (frame.type === 'obj') {
      if (frame.state === OBJ_KEY) {
        if (c === '"') {
          const end = scanStringFrom(i);
          if (end < 0) return i;
          i = end + 1;
          frame.state = OBJ_COLON;
          continue;
        }
        if (c === '}') { stack.pop(); completeValue(); i++; continue; } // 空对象
        return i;
      }
      if (frame.state === OBJ_COLON) {
        if (c === ':') { frame.state = OBJ_VALUE; i++; continue; }
        return i;
      }
      if (frame.state === OBJ_VALUE) {
        // 对象值位置：期待完整值
        if (c === '{') { stack.push({ type: 'obj', state: OBJ_KEY }); i++; continue; }
        if (c === '[') { stack.push({ type: 'arr', state: ARR_VALUE }); i++; continue; }
        const r = scanPrimitive(s, i, n, NUM_RE);
        if (r < 0) return i;
        i = r;
        frame.state = OBJ_AFTER;
        continue;
      }
      // OBJ_AFTER
      if (c === ',') { frame.state = OBJ_KEY; i++; continue; }
      if (c === '}') { stack.pop(); completeValue(); i++; continue; }
      return i;
    }
    // arr
    if (frame.state === ARR_VALUE) {
      if (c === ']') { stack.pop(); completeValue(); i++; continue; } // 空数组
      if (c === '{') { stack.push({ type: 'obj', state: OBJ_KEY }); i++; continue; }
      if (c === '[') { stack.push({ type: 'arr', state: ARR_VALUE }); i++; continue; }
      const r = scanPrimitive(s, i, n, NUM_RE);
      if (r < 0) return i;
      i = r;
      frame.state = ARR_AFTER;
      continue;
    }
    // ARR_AFTER
    if (c === ',') { frame.state = ARR_VALUE; i++; continue; }
    if (c === ']') { stack.pop(); completeValue(); i++; continue; }
    return i;
  }
}

function scanPrimitive(s, i, n, NUM_RE) {
  const c = s[i];
  if (c === '"') {
    let j = i + 1;
    while (j < n) {
      const ch = s[j];
      if (ch === '\\') j += 2;
      else if (ch === '"') return j + 1;
      else j++;
    }
    return -1;
  }
  if (s.startsWith('true', i)) return i + 4;
  if (s.startsWith('false', i)) return i + 5;
  if (s.startsWith('null', i)) return i + 4;
  if (c === '-' || (c >= '0' && c <= '9')) {
    const m = NUM_RE.exec(s.slice(i, i + 64));
    if (m) return i + m[0].length;
    return -1;
  }
  return -1;
}

/** 解析 JSON（剥 BOM / 剥首尾空白；错误给行列）。单引号/尾逗号不做——如实报错。 */
function parseJsonLoose(text) {
  let s = String(text == null ? '' : text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.trim();
  if (!s) return { ok: false, error: { line: 1, col: 1, msg: '内容为空' } };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    // 位置：优先自扫；回落到旧式消息 position；再回落 1/1
    let pos = scanJsonError(s);
    if (pos < 0 || pos >= s.length) {
      const m = /position (\d+)/.exec(e.message || '');
      pos = m ? Math.min(parseInt(m[1], 10), s.length - 1) : 0;
    }
    let line = 1;
    let col = 1;
    for (let k = 0; k < pos && k < s.length; k++) {
      if (s[k] === '\n') { line++; col = 1; } else col++;
    }
    return { ok: false, error: { line, col, msg: truncate(e.message, 200) } };
  }
}

/* ============================ 5. JSON 语义 diff ============================ */

const JSON_MAX_NODES = 100000;
const JSON_MAX_DEPTH = 64;
const ARRAY_ALIGN_CELL_CAP = 250000; // n*m 超出 → 位置对气回退
const VALUE_DISPLAY_CAP = 2000;

/**
 * 语义 diff：对象键序无关；数组默认「等值 LCS 对齐 + 相似度配对」，
 * 纯重排报 order 提示；opts.arrayAlign=false 时按位置对齐。
 * opts.ignorePaths: ['$.meta.updatedAt', '$.items[*].ts', '$.**.traceId']
 * @returns {{changes, stats, truncated}}
 */
function semanticJsonDiff(a, b, opts) {
  const o = opts || {};
  const ignoreGlobs = (o.ignorePaths || []).map(parseIgnoreGlob);
  const state = {
    changes: [],
    nodes: 0,
    truncated: false,
    align: o.arrayAlign !== false,
  };
  walkJson(a, b, [{ root: true }], state, ignoreGlobs, 0);
  const stats = { added: 0, removed: 0, changed: 0, order: 0 };
  for (const c of state.changes) {
    if (stats[c.type] != null) stats[c.type]++;
  }
  return { changes: state.changes, stats, truncated: state.truncated };
}

function pathJoinDisplay(segs) {
  if (segs.length <= 1) return '$';
  let out = '$';
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.index != null) out += '[' + seg.index + ']';
    else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg.key)) out += '.' + seg.key;
    else out += '[' + JSON.stringify(seg.key) + ']';
  }
  return out;
}

function parseIgnoreGlob(g) {
  let s = String(g || '').trim();
  if (!s) return [];
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  // '$.a.b[*].c' / '$.a.**.c' / 'a.b'（允许省略 $ 前缀）
  const parts = s.replace(/^\$\.?/, '').split('.');
  const segs = [{ root: true }];
  for (const part of parts) {
    if (part === '') continue;
    const m = /^(.*)\[(\*|\d+)\]$/.exec(part);
    if (m) {
      if (m[1]) segs.push({ key: m[1] });
      segs.push(m[2] === '*' ? { star: true } : { index: parseInt(m[2], 10) });
    } else if (part === '*') {
      segs.push({ star: true });
    } else if (part === '**') {
      segs.push({ anyDeep: true });
    } else {
      segs.push({ key: part });
    }
  }
  return segs;
}

function segsMatch(pathSegs, globSegs) {
  // globSegs 与 pathSegs 前缀匹配；支持 ** 吞噬
  function match(pi, gi) {
    if (gi >= globSegs.length) return true; // 前缀命中即忽略
    if (pi >= pathSegs.length) return false;
    const g = globSegs[gi];
    if (g.anyDeep) {
      // ** 可吞 0..n 段
      for (let np = pi; np <= pathSegs.length; np++) {
        if (match(np, gi + 1)) return true;
      }
      return false;
    }
    const p = pathSegs[pi];
    if (g.root) return p.root ? match(pi + 1, gi + 1) : false;
    if (g.star) return match(pi + 1, gi + 1);
    if (g.index != null) return p.index === g.index ? match(pi + 1, gi + 1) : false;
    if (g.key != null) return p.key === g.key ? match(pi + 1, gi + 1) : false;
    return false;
  }
  return match(0, 0);
}

function isIgnored(segs, globs) {
  for (const g of globs) {
    if (g.length && segsMatch(segs, g)) return true;
  }
  return false;
}

function displayValue(v) {
  if (v === undefined) return null;
  return truncate(typeof v === 'string' ? v : JSON.stringify(v), VALUE_DISPLAY_CAP);
}

function walkJson(a, b, segs, state, globs, depth) { // segs[0] 恒为 {root:true}
  if (state.truncated) return;
  state.nodes++;
  if (state.nodes > JSON_MAX_NODES) {
    state.truncated = true;
    state.changes.push({
      path: pathJoinDisplay(segs),
      type: 'changed',
      oldText: null,
      newText: null,
      note: '节点数超出上限，diff 在此截断（可用忽略路径缩小范围）',
    });
    return;
  }
  if (isPrim(a) || isPrim(b)) {
    if (!primEqual(a, b)) {
      const note = typeof a !== typeof b && String(a) === String(b) ? '值文本相同，仅类型不同' : undefined;
      state.changes.push({
        path: pathJoinDisplay(segs),
        type: 'changed',
        oldText: displayValue(a),
        newText: displayValue(b),
        note,
      });
    }
    return;
  }
  if (depth >= JSON_MAX_DEPTH) {
    state.changes.push({
      path: pathJoinDisplay(segs),
      type: 'changed',
      oldText: null,
      newText: null,
      note: `嵌套超过 ${JSON_MAX_DEPTH} 层，停止下钻`,
    });
    return;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) {
    state.changes.push({
      path: pathJoinDisplay(segs),
      type: 'changed',
      oldText: aArr ? 'Array' : 'Object',
      newText: bArr ? 'Array' : 'Object',
      note: '容器类型不同',
    });
    return;
  }
  if (aArr) diffArray(a, b, segs, state, globs, depth);
  else diffObject(a, b, segs, state, globs, depth);
}

function primEqual(a, b) {
  if (a === b) return true;
  // NaN 不会出现在合法 JSON 中；0/-0 视为相等
  return false;
}

function diffObject(a, b, segs, state, globs, depth) {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  for (const key of keys) {
    if (state.truncated) return;
    const childSegs = segs.concat([{ key }]);
    if (isIgnored(childSegs, globs)) continue;
    const inA = Object.prototype.hasOwnProperty.call(a, key);
    const inB = Object.prototype.hasOwnProperty.call(b, key);
    if (inA && !inB) {
      state.changes.push({ path: pathJoinDisplay(childSegs), type: 'removed', oldText: displayValue(a[key]), newText: null });
    } else if (!inA && inB) {
      state.changes.push({ path: pathJoinDisplay(childSegs), type: 'added', oldText: null, newText: displayValue(b[key]) });
    } else {
      walkJson(a[key], b[key], childSegs, state, globs, depth + 1);
    }
  }
}

function diffArray(a, b, segs, state, globs, depth) {
  const n = a.length;
  const m = b.length;
  // 标量数组也走对齐路径（等值 LCS 天然支持「顺序无关+增删定位」）；
  // 仅 arrayAlign=false 或 n*m 超预算时退位置对齐。
  if (!state.align || n * m > ARRAY_ALIGN_CELL_CAP) {
    diffArrayPositional(a, b, segs, state, globs, depth);
    return;
  }

  const canonA = a.map((v) => canonical(v));
  const canonB = b.map((v) => canonical(v));

  // 第一步：等值 LCS 对齐（顺序无关地保住相同元素）
  const pairs = lcsPairs(canonA, canonB, (x, y) => x === y);
  const aUsed = new Set(pairs.map((p) => p[0]));
  const bUsed = new Set(pairs.map((p) => p[1]));

  // 纯重排检测：其余元素左右多重集一致 → 一条 order 提示
  const restA = canonA.filter((_, i) => !aUsed.has(i)).sort();
  const restB = canonB.filter((_, i) => !bUsed.has(i)).sort();
  const pureReorder =
    restA.length === restB.length && restA.length > 0 && restA.every((s, i) => s === restB[i]);
  if (pureReorder) {
    state.changes.push({
      path: pathJoinDisplay(segs),
      type: 'order',
      oldText: null,
      newText: null,
      note: `数组元素相同，仅顺序不同（${n} 项）`,
    });
    return;
  }

  // 第二步：剩余元素按相似度配对（LCS with predicate）
  const restAIdx = [];
  const restBIdx = [];
  canonA.forEach((s, i) => { if (!aUsed.has(i)) restAIdx.push(i); });
  canonB.forEach((s, i) => { if (!bUsed.has(i)) restBIdx.push(i); });
  const simPairs = lcsPairs(
    restAIdx.map((i) => canonA[i]),
    restBIdx.map((i) => canonB[i]),
    (x, y) => similarity(x, y) >= 0.5,
  );
  const aUsed2 = new Set();
  const bUsed2 = new Set();
  for (const [si, sj] of simPairs) {
    const ai = restAIdx[si];
    const bj = restBIdx[sj];
    aUsed2.add(ai);
    bUsed2.add(bj);
    walkJson(a[ai], b[bj], segs.concat([{ index: ai }]), state, globs, depth + 1);
  }
  for (let i = 0; i < n; i++) {
    if (!aUsed.has(i) && !aUsed2.has(i)) {
      state.changes.push({
        path: pathJoinDisplay(segs.concat([{ index: i }])),
        type: 'removed',
        oldText: displayValue(a[i]),
        newText: null,
      });
    }
  }
  for (let j = 0; j < m; j++) {
    if (!bUsed.has(j) && !bUsed2.has(j)) {
      state.changes.push({
        path: pathJoinDisplay(segs.concat([{ index: j }])),
        type: 'added',
        oldText: null,
        newText: displayValue(b[j]),
      });
    }
  }
}

function diffArrayPositional(a, b, segs, state, globs, depth) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (state.truncated) return;
    const childSegs = segs.concat([{ index: i }]);
    const inA = i < a.length;
    const inB = i < b.length;
    if (inA && !inB) {
      state.changes.push({ path: pathJoinDisplay(childSegs), type: 'removed', oldText: displayValue(a[i]), newText: null });
    } else if (!inA && inB) {
      state.changes.push({ path: pathJoinDisplay(childSegs), type: 'added', oldText: null, newText: displayValue(b[i]) });
    } else {
      walkJson(a[i], b[i], childSegs, state, globs, depth + 1);
    }
  }
}

/** 经典 LCS 配对（eq 为谓词）；返回升序 pair [i, j] */
function lcsPairs(a, b, eq) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = eq(a[i], b[j])
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/* ============================ 6. 目录对比 ============================ */

/**
 * 目录树对比。entries 形如 [{path:'rel/a.txt', kind:'file'|'dir', size, mtimeMs, sha256?}]
 * （path 为相对路径、'/' 分隔；sha256 由服务端按需填充）。
 * @returns {{onlyLeft, onlyRight, changed, same, unknown, dirCount}}
 */
function dirDiffTrees(aEntries, bEntries) {
  const mapA = new Map(aEntries.map((e) => [e.path, e]));
  const mapB = new Map(bEntries.map((e) => [e.path, e]));
  const onlyLeft = [];
  const onlyRight = [];
  const changed = [];
  let same = 0;
  let unknown = 0;
  let dirCount = 0;
  const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const p of Array.from(allPaths).sort()) {
    const ea = mapA.get(p);
    const eb = mapB.get(p);
    if (ea && !eb) { onlyLeft.push(p); continue; }
    if (!ea && eb) { onlyRight.push(p); continue; }
    if (ea.kind === 'dir' || eb.kind === 'dir') { dirCount++; continue; }
    if (ea.size !== eb.size) { changed.push(p); continue; }
    if (ea.sha256 && eb.sha256) {
      if (ea.sha256 === eb.sha256) same++;
      else changed.push(p);
      continue;
    }
    // 同大小无哈希：mtime 接近视为同，否则标记未知（不读内容就不可判）
    if (Math.abs((ea.mtimeMs || 0) - (eb.mtimeMs || 0)) <= 2000) same++;
    else unknown++;
  }
  return { onlyLeft, onlyRight, changed, same, unknown, dirCount };
}

/* ============================ 7. 摘要（MCP 文本） ============================ */

/** 文本 diff → 紧凑文本摘要（给 AI 读）。入参兼容 core 原始 diff（items）与服务整形结果（hunks）。 */
function summarizeTextDiff(diff, opts) {
  const cap = (opts && opts.maxLines) || 60;
  const st = diff.stats;
  const out = [];
  out.push(`统计：+${st.additions} 新增 / -${st.deletions} 删除 / ~${st.modifies} 修改 / ${st.equal} 行相同（A ${st.aLines} 行，B ${st.bLines} 行）`);
  if (!st.additions && !st.deletions && !st.modifies) {
    out.push('结论：两份文本在当前忽略规则下没有差异。');
    return out.join('\n');
  }
  let hunks;
  let truncated;
  if (Array.isArray(diff.hunks)) {
    hunks = diff.hunks;
    truncated = diff.truncated === true;
  } else {
    const built = buildHunks(diff.items, 1, cap);
    hunks = built.hunks;
    truncated = built.truncated;
  }
  for (const h of hunks) {
    // core buildHunks 行是 {type,aNo,bNo,item} 包装；服务整形行直接是 item——两者兼容
    const lines = h.lines.map((l) => (l && l.item ? l.item : l));
    const aCount = lines.filter((l) => l.type !== 'insert').length;
    const bCount = lines.filter((l) => l.type !== 'delete').length;
    out.push(`@@ A:${h.aStart || 1}(${aCount}) B:${h.bStart || 1}(${bCount})`);
    for (const it of lines) {
      if (it.type === 'equal') out.push('  ' + truncate(it.text == null ? '' : it.text, 160));
      else if (it.type === 'delete') out.push('- ' + truncate(it.text == null ? '' : it.text, 160));
      else if (it.type === 'insert') out.push('+ ' + truncate(it.text == null ? '' : it.text, 160));
      else {
        out.push('- ' + truncate(it.aText == null ? '' : it.aText, 120));
        out.push('+ ' + truncate(it.bText == null ? '' : it.bText, 120));
      }
    }
  }
  if (truncated) out.push('（差异行数超出摘要上限，完整差异请在面板查看）');
  return out.join('\n');
}

/** JSON 语义 diff → 紧凑文本摘要（给 AI 读） */
function summarizeJsonDiff(result, opts) {
  const cap = (opts && opts.maxChanges) || 40;
  const st = result.stats;
  const out = [];
  out.push(`统计：${st.changed} 处值变更 / ${st.added} 处新增 / ${st.removed} 处删除 / ${st.order} 处顺序变化${result.truncated ? '（已截断）' : ''}`);
  if (!result.changes.length) {
    out.push('结论：两个 JSON 在语义上完全一致（键序/数组顺序差异不计）。');
    return out.join('\n');
  }
  for (const c of result.changes.slice(0, cap)) {
    if (c.type === 'added') out.push(`+ ${c.path} = ${truncate(c.newText == null ? '' : c.newText, 120)}`);
    else if (c.type === 'removed') out.push(`- ${c.path}（原 ${truncate(c.oldText == null ? '' : c.oldText, 120)}）`);
    else if (c.type === 'order') out.push(`~ ${c.path}：${c.note}`);
    else out.push(`~ ${c.path}: ${truncate(c.oldText == null ? '' : c.oldText, 80)} → ${truncate(c.newText == null ? '' : c.newText, 80)}${c.note ? `（${c.note}）` : ''}`);
  }
  if (result.changes.length > cap) out.push(`（其余 ${result.changes.length - cap} 处差异未列出，完整清单请在面板查看）`);
  return out.join('\n');
}

/** 目录 diff → 紧凑文本摘要。入参兼容裸数组与服务的 DirList 包装（{items,total,truncated}）。 */
function summarizeDirDiff(result, opts) {
  const cap = (opts && opts.maxEntries) || 40;
  const unwrap = (x) => (Array.isArray(x) ? { items: x, total: x.length, truncated: false } : x);
  const onlyLeft = unwrap(result.onlyLeft);
  const onlyRight = unwrap(result.onlyRight);
  const changed = unwrap(result.changed);
  const out = [];
  out.push(`统计：A 独有 ${onlyLeft.total} / B 独有 ${onlyRight.total} / 有差异 ${changed.total} / 相同 ${result.same} / 未知 ${result.unknown}（目录 ${result.dirCount}）`);
  const take = (list, tag) => {
    for (const p of list.items.slice(0, cap)) out.push(`${tag} ${p}`);
    if (list.total > cap) out.push(`${tag} …（其余 ${list.total - cap} 项未列出）`);
  };
  take(changed, 'Δ');
  take(onlyLeft, '<');
  take(onlyRight, '>');
  return out.join('\n');
}

module.exports = {
  // 工具
  truncate, oneLine, isPrim, canonical, similarity,
  // 文本 diff
  myersOps, splitLines, lineDiff, charDiff,
  buildHunks, buildSideBySide, makeUnifiedPatch,
  // JSON
  parseJsonLoose, semanticJsonDiff, canonicalizeValue: canonical,
  // 目录
  dirDiffTrees,
  // 摘要
  summarizeTextDiff, summarizeJsonDiff, summarizeDirDiff,
};
