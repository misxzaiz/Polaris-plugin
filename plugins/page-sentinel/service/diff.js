'use strict';
/**
 * diff.js —— 行级 LCS 对比（零依赖）
 *
 * 输出统一为 [{kind:'-'|'+'|' ', text}]；对超长输入退化为摘要行，
 * 对未变化区段做上下文折叠（保留 changes 前后 context 行）。
 */

const MAX_DIFF_LINES = 1200;   // 单侧超过则不做行级对比
const MAX_DIFF_OPS = 80;       // 输出 op 数上限

/**
 * @param a {string} 旧文本（已 normalize）
 * @param b {string} 新文本
 * @param opts {{context?: number}}
 * @returns {{ops: Array<{kind:string, text:string}>, truncated:boolean}}
 */
function diffLines(a, b, opts) {
  const context = (opts && opts.context) != null ? opts.context : 2;
  const A = typeof a === 'string' ? a.split('\n') : [];
  const B = typeof b === 'string' ? b.split('\n') : [];
  if (A.length > MAX_DIFF_LINES || B.length > MAX_DIFF_LINES) {
    return {
      truncated: true,
      ops: [{ kind: '±', text: `内容变化（超长文本 ${A.length} → ${B.length} 行，未做行级对比）` }],
    };
  }
  const ops = lcsOps(A, B);
  return { truncated: false, ops: fold(ops, context) };
}

/** 经典 DP LCS → op 序列（合并相邻同 kind） */
function lcsOps(A, B) {
  const n = A.length, m = B.length;
  // Int32Array DP 表：(n+1)*(m+1)
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = A[i] === B[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const raw = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { raw.push({ kind: ' ', text: A[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { raw.push({ kind: '-', text: A[i] }); i++; }
    else { raw.push({ kind: '+', text: B[j] }); j++; }
  }
  while (i < n) { raw.push({ kind: '-', text: A[i] }); i++; }
  while (j < m) { raw.push({ kind: '+', text: B[j] }); j++; }
  // 合并相邻同 kind
  const ops = [];
  for (const op of raw) {
    const last = ops[ops.length - 1];
    if (last && last.kind === op.kind) last.text += '\n' + op.text;
    else ops.push({ kind: op.kind, text: op.text });
  }
  return ops;
}

/** 折叠未变化区段：只保留变更上下文各 context 行 */
function fold(ops, context) {
  // ops 内 kind=' ' 的 text 可能是多行——先拆开处理更直观
  const flat = [];
  for (const op of ops) {
    if (op.kind === ' ' && op.text.indexOf('\n') !== -1) {
      for (const line of op.text.split('\n')) flat.push({ kind: ' ', text: line });
    } else flat.push(op);
  }
  const keep = new Array(flat.length).fill(false);
  flat.forEach((op, idx) => {
    if (op.kind !== ' ') {
      for (let k = Math.max(0, idx - context); k <= Math.min(flat.length - 1, idx + context); k++) keep[k] = true;
    }
  });
  const out = [];
  let run = null; // {count}
  for (let idx = 0; idx < flat.length; idx++) {
    if (keep[idx]) {
      if (run) {
        out.push({ kind: '…', text: `…… 省略 ${run.count} 行未变化 ……` });
        run = null;
      }
      out.push(flat[idx]);
    } else {
      run = run || { count: 0 };
      run.count++;
    }
  }
  if (run) out.push({ kind: '…', text: `…… 省略 ${run.count} 行未变化 ……` });
  // 变更段过多时截断（保留头尾）
  if (out.length > MAX_DIFF_OPS) {
    const half = Math.floor(MAX_DIFF_OPS / 2);
    const head = out.slice(0, half);
    const tail = out.slice(out.length - half);
    head.push({ kind: '…', text: `…… 变更过多，略去 ${out.length - MAX_DIFF_OPS} 行 ……` });
    return head.concat(tail);
  }
  return out;
}

module.exports = { diffLines, lcsOps, fold, MAX_DIFF_LINES, MAX_DIFF_OPS };
