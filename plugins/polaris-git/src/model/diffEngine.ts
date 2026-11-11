/**
 * 自包含 diff 引擎（纯函数、零依赖、erasable TS —— node 原生 type-stripping 可直测）。
 *
 * 两条入口：
 * 1. computeLineDiff(oldText, newText)：GitDiffEntry 携带 old/new 全文时，Myers 算法
 *    计算行级差异 → 带上下文的 hunk 序列 + 行内（词级）高亮。
 * 2. parseUnifiedPatch(text)：stash_show / 未来 patch 文本入口，解析 unified diff 文本。
 *
 * 大文件护栏：MAX_DIFF_LINES 以上不计算行内高亮；超大由调用方在渲染层截断。
 */

export type DiffLineType = 'ctx' | 'add' | 'del';

export interface DiffLine {
  type: DiffLineType;
  /** 旧文件行号（1 起；ctx/del 有值） */
  aLine?: number;
  /** 新文件行号（1 起；ctx/add 有值） */
  bLine?: number;
  text: string;
  /** 词级高亮段（仅 add/del 且与相邻行配对时） */
  segments?: Array<{ text: string; changed: boolean }>;
}

export interface DiffHunk {
  aStart: number;
  bStart: number;
  lines: DiffLine[];
}

export interface LineDiffResult {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  truncated: boolean;
}

const CONTEXT = 3;
/** 词级高亮与 hunk 计算的总行数上限；超过则降级为「仅统计不渲染」 */
export const MAX_DIFF_LINES = 20000;

interface Op {
  type: DiffLineType;
  text: string;
}

/**
 * Myers O(ND) 行级 diff（带公共前后缀裁剪）。返回对齐操作序列。
 * 输入为行数组（不含行尾换行）。
 */
export function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // 公共前缀
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  // 公共后缀
  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'ctx', text: a[i] });
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  if (midA.length === 0 && midB.length === 0) {
    // 全等
  } else if (midA.length === 0) {
    for (const t of midB) ops.push({ type: 'add', text: t });
  } else if (midB.length === 0) {
    for (const t of midA) ops.push({ type: 'del', text: t });
  } else {
    ops.push(...myersMid(midA, midB));
  }
  for (let i = endA + 1; i < n; i++) ops.push({ type: 'ctx', text: a[i] });
  return ops;
}

function myersMid(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max > MAX_DIFF_LINES * 2) {
    // 兜底：不比较，整段替换
    return [
      ...a.map((t) => ({ type: 'del' as const, text: t })),
      ...b.map((t) => ({ type: 'add' as const, text: t })),
    ];
  }
  const offset = max;
  const size = max * 2 + 1;
  // V 数组按轮次快照，用于回溯（注意：TypedArray 元素读写必须用下标，set() 是批量拷贝语义）
  const trace: Int32Array[] = [];
  const v = new Int32Array(size);
  v[offset] = 0;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(Int32Array.from(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1]; // 下移（insert）
      } else {
        x = v[offset + k - 1] + 1; // 右移（delete）
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }
  // 回溯
  const path: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const vv = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vv[offset + k - 1] < vv[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vv[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      path.push({ type: 'ctx', text: a[x - 1] });
      x--;
      y--;
    }
    if (x === prevX) {
      path.push({ type: 'add', text: b[prevY] });
      y--;
    } else {
      path.push({ type: 'del', text: a[prevX] });
      x--;
    }
  }
  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
    path.push({ type: 'ctx', text: a[x - 1] });
    x--;
    y--;
  }
  path.reverse();
  return path;
}

/** 把操作序列切成带 CONTEXT 行上下文的 hunk（行号在此处回填） */
export function buildHunks(ops: Op[], context: number = CONTEXT): DiffHunk[] {
  // 先折叠成「变更块 + 前后 context」的区间
  const changedIdx: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== 'ctx') changedIdx.push(i);
  }
  if (changedIdx.length === 0) return [];
  const ranges: Array<[number, number]> = [];
  let rs = Math.max(0, changedIdx[0] - context);
  let re = Math.min(ops.length - 1, changedIdx[0] + context);
  for (let i = 1; i < changedIdx.length; i++) {
    const s = Math.max(0, changedIdx[i] - context);
    const e = Math.min(ops.length - 1, changedIdx[i] + context);
    if (s <= re + 1) {
      re = e;
    } else {
      ranges.push([rs, re]);
      rs = s;
      re = e;
    }
  }
  ranges.push([rs, re]);

  let aLine = 1;
  let bLine = 1;
  const lineNo: Array<{ a?: number; b?: number }> = ops.map((op) => {
    const cur = { a: undefined as number | undefined, b: undefined as number | undefined };
    if (op.type === 'ctx') {
      cur.a = aLine++;
      cur.b = bLine++;
    } else if (op.type === 'del') {
      cur.a = aLine++;
    } else {
      cur.b = bLine++;
    }
    return cur;
  });

  return ranges.map(([s, e]) => {
    const lines: DiffLine[] = [];
    for (let i = s; i <= e; i++) {
      const op = ops[i];
      lines.push({
        type: op.type,
        aLine: lineNo[i].a,
        bLine: lineNo[i].b,
        text: op.text,
      });
    }
    const first = lines[0];
    const hunk: DiffHunk = {
      aStart: first.aLine ?? 1,
      bStart: first.bLine ?? 1,
      lines,
    };
    return hunk;
  });
}

// ── 词级高亮 ─────────────────────────────────────────────────────────────────

const WORD_RE = /(\s+|[A-Za-z0-9_$]+|.)/g;

/** 相邻 del/add 行对的行内差异高亮（成对出现才启用） */
export function wordSegments(delText: string, addText: string): {
  del: Array<{ text: string; changed: boolean }>;
  add: Array<{ text: string; changed: boolean }>;
} {
  const delWords = delText.match(WORD_RE) ?? [];
  const addWords = addText.match(WORD_RE) ?? [];
  const ops = diffLines(delWords, addWords);
  const del: Array<{ text: string; changed: boolean }> = [];
  const add: Array<{ text: string; changed: boolean }> = [];
  for (const op of ops) {
    if (op.type === 'ctx') {
      del.push({ text: op.text, changed: false });
      add.push({ text: op.text, changed: false });
    } else if (op.type === 'del') {
      del.push({ text: op.text, changed: true });
    } else {
      add.push({ text: op.text, changed: true });
    }
  }
  return { del, add };
}

// ── 对外主入口 ───────────────────────────────────────────────────────────────

export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** GitDiffEntry（old/new 全文）→ 渲染用 hunk。change 端缺失视为空文本 */
export function computeLineDiff(
  oldText: string | null | undefined,
  newText: string | null | undefined,
  context: number = CONTEXT,
): LineDiffResult {
  const a = splitLines(oldText ?? '');
  const b = splitLines(newText ?? '');
  const total = a.length + b.length;
  if (total > MAX_DIFF_LINES) {
    return {
      hunks: [],
      additions: b.length,
      deletions: a.length,
      truncated: true,
    };
  }
  const ops = diffLines(a, b);
  const hunks = buildHunks(ops, context);
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.type === 'add') additions++;
    else if (op.type === 'del') deletions++;
  }
  // 词级高亮：把相邻 del 后紧跟 add 的行对配对（同一起始 hunk 内）
  for (const hunk of hunks) {
    let i = 0;
    while (i < hunk.lines.length) {
      const line = hunk.lines[i];
      if (line.type === 'del' && i + 1 < hunk.lines.length && hunk.lines[i + 1].type === 'add') {
        const addLine = hunk.lines[i + 1];
        const delLen = line.text.length + addLine.text.length;
        if (delLen <= 400) {
          const seg = wordSegments(line.text, addLine.text);
          line.segments = seg.del;
          addLine.segments = seg.add;
        }
        i += 2;
      } else {
        i += 1;
      }
    }
  }
  return { hunks, additions, deletions, truncated: false };
}

// ── unified patch 文本解析（stash_show 等）──────────────────────────────────

/** 解析 unified diff 文本 → hunk（用于 stash_show 返回的 patch 字符串） */
export function parseUnifiedPatch(text: string): LineDiffResult {
  const rows = text.split('\n');
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  let cur: DiffHunk | null = null;
  let aLine = 0;
  let bLine = 0;
  for (const row of rows) {
    const hunkHead = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (hunkHead) {
      aLine = parseInt(hunkHead[1], 10);
      bLine = parseInt(hunkHead[3], 10);
      cur = { aStart: aLine, bStart: bLine, lines: [] };
      hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (row.startsWith('diff ') || row.startsWith('index ') || row.startsWith('--- ') || row.startsWith('+++ ')) {
      continue;
    }
    if (row.startsWith('+')) {
      cur.lines.push({ type: 'add', bLine: bLine++, text: row.slice(1) });
      additions++;
    } else if (row.startsWith('-')) {
      cur.lines.push({ type: 'del', aLine: aLine++, text: row.slice(1) });
      deletions++;
    } else if (row.startsWith('\\')) {
      // "\ No newline at end of file" 忽略
    } else if (row.startsWith(' ') || row === '') {
      cur.lines.push({ type: 'ctx', aLine: aLine++, bLine: bLine++, text: row.startsWith(' ') ? row.slice(1) : row });
    }
  }
  return { hunks, additions, deletions, truncated: false };
}
