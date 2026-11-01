'use strict';
/**
 * table-engine.js —— 表格提取台引擎（service 与 MCP 共用的唯一实现）
 *
 * 从 PDF 文本层的「坐标级文本项」重建表格网格（stream/对齐策略）：
 *   1. pdfjs getTextContent 取每项精确 bbox（四角经 viewport 变换，天然处理页面旋转）
 *   2. 视觉 y 中心聚类成行（容差 = 中位字高的一半）
 *   3. 行内相邻项按横向间距合并成「段」（cell 候选），段间空隙保留为列边界证据
 *   4. 跨行对段做「区间重叠」聚类成列（中位数代表框，右对齐数字列天然可聚）
 *   5. 行-列匹配：段按重叠率归入列；落单段并入左侧邻格（换行续文）或判噪
 *   6. 连续合格行块（≥minRows 行、≥2 列、填充率达标）= 表格候选
 *
 * 设计约束：
 *   - 输入只读：bytes 进、网格/输出字节出；落盘由调用方经 core.pickOutputName（永不覆盖）
 *   - 全本地：vendor/pdfjs.min.js（文本抽取）+ vendor/exceljs.min.js（xlsx），零外网、零原生依赖
 *   - 明确不做：OCR（无文字层明示拒绝）、加密 PDF（拒绝，不破解）、线格(lattice)专用策略
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/core.js');

const pdfjsLib = getPdfjs();

function getPdfjs() {
  // pdfjs legacy 在 Node 缺 DOMMatrix/Path2D 时仅影响渲染（告警刷屏）；文本抽取不需要，stub 消音
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix { };
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { };
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { };
  return require('../vendor/pdfjs.min.js');
}

const CMAP_DIR = path.join(__dirname, '..', 'vendor', 'cmaps');

/** 读入并解析 PDF（pdfjs 侧）；加密/损坏/扫描件给出中文可操作错误 */
async function openPdf(bytes, label) {
  if (!core.isPdfBytes(bytes)) {
    throw new Error((label || '文件') + ' 不是 PDF（文件头缺少 %PDF- 标识）');
  }
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    useSystemFonts: true,
    isEvalSupported: false,
    cMapUrl: fs.existsSync(CMAP_DIR) ? CMAP_DIR + path.sep : '',
    cMapPacked: true,
  }).promise;
  return doc;
}

// ── 第 1 步：坐标级文本项（视觉坐标系，y 自顶向下）─────────────────────────

/**
 * 提取一页的文本项，返回视觉 bbox 数组。
 * 四角经 viewport 变换取 min/max：页面旋转（0/90/180/270）天然归一。
 * @returns {{items:{text:string,x0:number,x1:number,cy:number,h:number}[], vw:number, vh:number}}
 */
async function extractPageItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const w = Number(it.width) || 0;
    const h = Number(it.height) || Math.hypot(tr[2], tr[3]) || 10;
    // 用户空间文本运行的方向单位向量（标准横排为 (1,0)；竖排/斜排取实际矩阵）
    const lx = Math.hypot(tr[0], tr[1]) || 1;
    const ly = Math.hypot(tr[2], tr[3]) || 1;
    const ux = tr[0] / lx, uy = tr[1] / lx;
    const vx = tr[2] / ly, vy = tr[3] / ly;
    const ex = tr[4], ey = tr[5];
    const corners = [
      [ex, ey],
      [ex + w * ux, ey + w * uy],
      [ex + w * ux + h * vx, ey + w * uy + h * vy],
      [ex + h * vx, ey + h * vy],
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of corners) {
      const [vx1, vy1] = viewport.convertToViewportPoint(px, py);
      if (vx1 < minX) minX = vx1;
      if (vx1 > maxX) maxX = vx1;
      if (vy1 < minY) minY = vy1;
      if (vy1 > maxY) maxY = vy1;
    }
    items.push({ text: it.str, x0: minX, x1: maxX, cy: (minY + maxY) / 2, h: Math.max(maxY - minY, 1) });
  }
  items.sort((a, b) => (a.cy - b.cy) || (a.x0 - b.x0)); // 视觉 y 向下增长：升序=自顶向下、行内自左向右
  return { items, vw: viewport.width, vh: viewport.height };
}

// ── 第 2 步：行聚类 ─────────────────────────────────────────────────────────

/** y 中心聚类成行；容差 = max(2.5, 0.55×中位字高)。返回行数组（自顶向下） */
function buildRows(items) {
  if (!items.length) return [];
  const heights = items.map((i) => i.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 10;
  const tol = Math.max(2.5, 0.55 * medianH);
  const rows = [];
  let cur = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const it = items[i];
    const anchor = cur[cur.length - 1].cy;
    if (Math.abs(it.cy - anchor) <= tol) {
      cur.push(it);
    } else {
      rows.push(cur);
      cur = [it];
    }
  }
  rows.push(cur);
  for (const row of rows) row.sort((a, b) => a.x0 - b.x0);
  return rows;
}

// ── 第 3 步：行内分段（cell 候选）──────────────────────────────────────────

/** 判断拼接时是否需要补空格（拉丁词界，CJK 直接相连） */
function needsSpace(prevText, nextText, gap, rowH) {
  if (gap < 0.18 * rowH) return false;
  return /[\w)\].,%￥¥]$/.test(prevText) && /^[\w(\[.“"$￥¥]/.test(nextText);
}

/**
 * 行内合并相邻项为段：横向间隙 ≤ mergeGap（= max(1.5, 0.45×行高)）视为同格碎片。
 * @returns {{x0:number,x1:number,text:string}[]}
 */
function rowSegments(row) {
  if (!row.length) return [];
  const hs = row.map((i) => i.h).sort((a, b) => a - b);
  const rowH = hs[Math.floor(hs.length / 2)] || 10;
  const mergeGap = Math.max(1.5, 0.45 * rowH);
  const segs = [];
  let cur = { ...row[0], text: row[0].text };
  for (let i = 1; i < row.length; i++) {
    const it = row[i];
    const gap = it.x0 - cur.x1;
    if (gap <= mergeGap) {
      const joiner = gap > 0 && needsSpace(cur.text, it.text, gap, rowH) ? ' ' : '';
      cur = { x0: Math.min(cur.x0, it.x0), x1: Math.max(cur.x1, it.x1), text: cur.text + joiner + it.text };
    } else {
      segs.push(cur);
      cur = { x0: it.x0, x1: it.x1, text: it.text };
    }
  }
  segs.push(cur);
  return segs;
}

// ── 第 4 步：跨行列聚类（区间重叠 + 中位数代表框）─────────────────────────

function overlapRatio(a0, a1, b0, b1) {
  const ov = Math.min(a1, b1) - Math.max(a0, b0);
  if (ov <= 0) return 0;
  return ov / Math.max(1e-6, Math.min(a1 - a0, b1 - b0));
}

/**
 * 全部段按「区间重叠」聚成列：段与列代表框（成员中位数）重叠 ≥ 0.5 归入。
 * 列支持数 < 2 的判为孤段噪声（页脚页码等）丢弃。
 * @returns {{x0:number,x1:number,support:number}[]} 自左向右
 */
function buildColumns(allSegs) {
  const clusters = [];
  for (const seg of allSegs) {
    let best = null;
    let bestRatio = 0;
    for (const c of clusters) {
      const r = overlapRatio(seg.x0, seg.x1, c.x0, c.x1);
      if (r > bestRatio) { bestRatio = r; best = c; }
    }
    if (best && bestRatio >= 0.5) {
      best.members.push(seg);
      const xs0 = best.members.map((m) => m.x0).sort((a, b) => a - b);
      const xs1 = best.members.map((m) => m.x1).sort((a, b) => a - b);
      best.x0 = xs0[Math.floor(xs0.length / 2)];
      best.x1 = xs1[Math.floor(xs1.length / 2)];
    } else {
      clusters.push({ x0: seg.x0, x1: seg.x1, members: [seg] });
    }
  }
  // 漂移重复列合并：代表框互相重叠 ≥ 0.6 或中心距 ≤ 2pt
  clusters.sort((a, b) => a.x0 - b.x0);
  const merged = [];
  for (const c of clusters) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const ov = overlapRatio(prev.x0, prev.x1, c.x0, c.x1);
      const centerGap = Math.abs((prev.x0 + prev.x1) / 2 - (c.x0 + c.x1) / 2);
      if (ov >= 0.6 || centerGap <= 2) {
        prev.members.push(...c.members);
        const xs0 = prev.members.map((m) => m.x0).sort((a, b) => a - b);
        const xs1 = prev.members.map((m) => m.x1).sort((a, b) => a - b);
        prev.x0 = xs0[Math.floor(xs0.length / 2)];
        prev.x1 = xs1[Math.floor(xs1.length / 2)];
        continue;
      }
    }
    merged.push(c);
  }
  return merged
    .filter((c) => c.members.length >= 2)
    .map((c) => ({ x0: c.x0, x1: c.x1, support: c.members.length }));
}

// ── 第 5 步：行-列匹配 → 网格 ───────────────────────────────────────────────

/**
 * 把每行的段归入列；落单段（与任何列重叠 < 0.5）并入左侧最近邻格（换行续文），
 * 距离过远（> 3×列间隙中位）则判噪丢弃。
 * @returns {{cells:string[][], filled:number[][], rowSegCount:number[]}[]}
 *   每行一个对象：cells=文本网格行，filled=每格是否有值（0/1）
 */
function assignRows(rowSegList, columns) {
  const gapMids = [];
  for (let i = 1; i < columns.length; i++) {
    gapMids.push((columns[i - 1].x1 + columns[i].x0) / 2);
  }
  const sortedGaps = gapMids.slice().sort((a, b) => a - b);
  const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
  const farNoise = Math.max(12, medianGap * 1.5);

  return rowSegList.map((segs) => {
    const cells = columns.map(() => '');
    const filled = columns.map(() => 0);
    for (const seg of segs) {
      let bestCol = -1;
      let bestRatio = 0;
      for (let c = 0; c < columns.length; c++) {
        const r = overlapRatio(seg.x0, seg.x1, columns[c].x0, columns[c].x1);
        if (r > bestRatio) { bestRatio = r; bestCol = c; }
      }
      if (bestCol >= 0 && bestRatio >= 0.5) {
        cells[bestCol] = cells[bestCol] ? cells[bestCol] + (needsSpace(cells[bestCol], seg.text, 2, 10) ? ' ' : '') + seg.text : seg.text;
      } else {
        // 落单段：并入其左侧最近的已填格（续文）；左侧太远或无格 → 噪声丢弃
        const mid = (seg.x0 + seg.x1) / 2;
        let target = -1;
        for (let c = columns.length - 1; c >= 0; c--) {
          if (!filled[c] && !cells[c]) continue;
          const colMid = (columns[c].x0 + columns[c].x1) / 2;
          if (mid >= colMid - farNoise) { target = c; break; }
        }
        if (target >= 0) {
          const colMid = (columns[target].x0 + columns[target].x1) / 2;
          if (mid - colMid <= farNoise * 3) {
            cells[target] = cells[target] + ' ' + seg.text;
          }
        }
      }
    }
    let filledCount = 0;
    for (let c = 0; c < columns.length; c++) {
      cells[c] = core.cleanCell(cells[c]);
      if (cells[c]) filled[c] = 1;
      filledCount += filled[c];
    }
    return { cells, filledCount };
  });
}

// ── 第 6 步：连续块取表 ─────────────────────────────────────────────────────

/**
 * 从行列网格里找连续「合格行」块：合格 = filledCount ≥ 2。
 * 块内容忍 ≤ 2 行的 1 格行（换行续文，文本并入上方同列格）。
 * @param {{minRows?:number}} opts minRows 默认 2（表头+1 数据行）
 * @returns {{rows:string[][], startRow:number, endRow:number}[]} 候选块（自上而下）
 */
function findBlocks(gridRows, opts) {
  const minRows = Math.max(1, Number(opts && opts.minRows) || 2);
  const qualify = (r) => r.filledCount >= 2;
  const blocks = [];
  let i = 0;
  while (i < gridRows.length) {
    if (!qualify(gridRows[i])) { i++; continue; }
    let end = i;
    let j = i + 1;
    let gap = 0;
    while (j < gridRows.length) {
      if (qualify(gridRows[j])) { end = j; gap = 0; j++; continue; }
      gap++;
      if (gap > 2) break;
      j++;
    }
    const span = end - i + 1;
    const qualifiedCount = gridRows.slice(i, end + 1).filter(qualify).length;
    if (qualifiedCount >= minRows && span >= minRows) {
      blocks.push({ startRow: i, endRow: end });
    }
    i = end + 1;
  }
  return blocks;
}

/** 块内网格成型：续行并入、裁掉空列、计算填充率 */
function materializeBlock(gridRows, block) {
  const rows = [];
  for (let r = block.startRow; r <= block.endRow; r++) {
    const gr = gridRows[r];
    if (rows.length && gr.filledCount === 1) {
      // 续文行：并入上方行同列（非空则追加空格连接）
      const prev = rows[rows.length - 1];
      for (let c = 0; c < gr.cells.length; c++) {
        if (gr.cells[c]) prev[c] = prev[c] ? prev[c] + ' ' + gr.cells[c] : gr.cells[c];
      }
    } else {
      rows.push(gr.cells.slice());
    }
  }
  // 裁掉块内全空列
  const colCount = rows[0] ? rows[0].length : 0;
  const keep = [];
  for (let c = 0; c < colCount; c++) {
    if (rows.some((r) => r[c])) keep.push(c);
  }
  const trimmed = rows.map((r) => keep.map((c) => r[c]));
  let filledCells = 0;
  for (const r of trimmed) for (const v of r) if (v) filledCells++;
  const fillRatio = trimmed.length && trimmed[0].length ? filledCells / (trimmed.length * trimmed[0].length) : 0;
  return { rows: trimmed, fillRatio };
}

// ── 单页检测 ────────────────────────────────────────────────────────────────

/** 单页表格检测：文本项 → 行 → 段 → 列 → 网格 → 块 */
async function detectPage(page) {
  const { items } = await extractPageItems(page);
  const charCount = items.reduce((s, i) => s + i.text.length, 0);
  if (!items.length) {
    return { charCount: 0, tables: [], textLess: true };
  }
  const rows = buildRows(items);
  const rowSegList = rows.map(rowSegments);
  const allSegs = rowSegList.flat();
  if (!allSegs.length) return { charCount, tables: [], textLess: false };
  const columns = buildColumns(allSegs);
  if (columns.length < 2) return { charCount, tables: [], textLess: false };
  const gridRows = assignRows(rowSegList, columns);
  const blocks = findBlocks(gridRows, {});
  const tables = blocks.map((b) => {
    const m = materializeBlock(gridRows, b);
    return {
      header: m.rows[0] || [],
      rowsCount: Math.max(0, m.rows.length - 1),
      colCount: m.rows[0] ? m.rows[0].length : 0,
      fillRatio: Math.round(m.fillRatio * 100) / 100,
      grid: m.rows,
    };
  }).filter((t) => t.colCount >= 2 && t.rowsCount >= 1);
  return { charCount, tables, textLess: false };
}

// ── 文档级检测与 op 实现 ────────────────────────────────────────────────────

/**
 * 文档检测：逐页跑 detectPage。
 * @returns {{pages:number, pageResults:{page:number,charCount:number,textLess:boolean,tables:{header,rowsCount,colCount,fillRatio,grid}[]}[], hasText:boolean, totalTables:number}}
 */
async function detectDocument(bytes, label, pagesSpec) {
  const doc = await openPdf(bytes, label);
  try {
    const total = doc.numPages;
    const pages = pagesSpec ? core.parsePageSpec(pagesSpec, total, { mode: 'set' }) : Array.from({ length: total }, (_, i) => i + 1);
    const pageResults = [];
    let hasText = false;
    let totalTables = 0;
    for (const n of pages) {
      const page = await doc.getPage(n);
      const r = await detectPage(page);
      pageResults.push({ page: n, charCount: r.charCount, textLess: !!r.textLess, tables: r.tables || [] });
      if (r.charCount > 0) hasText = true;
      totalTables += (r.tables || []).length;
    }
    return { pages: total, pageResults, hasText, totalTables };
  } finally {
    try { doc.destroy(); } catch (_) { /* 释放尽力而为 */ }
  }
}

/**
 * 跨页续表合并：同构表头（sameHeader）连续出现的表格合并为一张（去掉重复表头）。
 * @param {{page:number,tables:{header,grid}[]}[]} pageResults 已按页升序
 * @returns {{header:string[],rows:string[][],sourcePages:number[]}[]}
 */
function mergeContinued(pageResults) {
  const groups = [];
  for (const pr of pageResults) {
    for (const t of pr.tables) {
      const grid = t.grid || [];
      if (!grid.length) continue;
      const last = groups[groups.length - 1];
      if (last && core.sameHeader(last.header, grid[0])) {
        last.rows.push(...grid.slice(1));
        if (last.sourcePages[last.sourcePages.length - 1] !== pr.page) last.sourcePages.push(pr.page);
      } else {
        groups.push({ header: grid[0].slice(), rows: grid.slice(1).map((r) => r.slice()), sourcePages: [pr.page] });
      }
    }
  }
  return groups;
}

/** 网格 → xlsx 字节（表头加粗冻结、列宽自适应、数字列自动转数值） */
async function gridToXlsx(sheets) {
  const ExcelJS = require('../vendor/exceljs.min.js');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'pdf-tables (表格提取台)';
  wb.created = new Date();
  for (const sh of sheets) {
    const name = sh.name;
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const widths = [];
    for (const row of sh.rows) {
      ws.addRow(row.map((v) => {
        const n = core.parseNumeric(v);
        return n === null ? String(v) : n;
      }));
      for (let c = 0; c < row.length; c++) {
        const w = displayWidth(row[c]);
        widths[c] = Math.max(widths[c] || 0, w);
      }
    }
    if (sh.rows.length) {
      const head = ws.getRow(1);
      head.font = { bold: true };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    }
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = Math.min(42, Math.max(8, w + 2));
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** 列宽估算：CJK 算 2，其余算 1 */
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s == null ? '' : s)) w += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return w;
}

/** 安全 sheet 名：≤31 字符，去掉 Excel 非法字符 []:*?/\ */
function safeSheetName(name, used) {
  let base = String(name || 'Sheet').replace(/[\\[\]:*?/]/g, '_').slice(0, 28) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = base.slice(0, 26) + '_' + n;
    n++;
  }
  used.add(candidate);
  return candidate;
}

// ── op 分发 ────────────────────────────────────────────────────────────────

const OPS = new Set(['detect', 'read', 'extract']);

/**
 * 统一入口：runOp(op, inputs, params)
 * @param {'detect'|'read'|'extract'} op
 * @param {{name:string,bytes:Buffer}[]} inputs
 * @param {object} params
 *   detect: { pages? }
 *   read:   { pages?, blockIndex?, maxRows?, format? 'markdown'|'tsv' }
 *   extract:{ pages?, format? 'xlsx'|'csv'|'json'|'all', mergePages?, minRows? }
 * @returns {Promise<object>} 各 op 结果（bytes 输出由调用方落盘）
 */
async function runOp(op, inputs, params) {
  const p = params && typeof params === 'object' ? params : {};
  try {
    return await runOpInner(op, inputs, p);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (e && e.friendly) throw e;
    if (/[\u4e00-\u9fff]/.test(msg)) throw e; // 引擎/核心自身的中文业务错误原样透传
    // pdfjs 底层英文异常统一收口为可操作中文错误——不带堆栈地暴露给 AI/面板毫无自纠价值
    const label = Array.isArray(inputs) && inputs[0] ? inputs[0].name + ' ' : '';
    throw new Error(label + '处理失败：文件可能损坏、加密或不是标准 PDF（' + msg.slice(0, 140) + '）');
  }
}

async function runOpInner(op, inputs, p) {
  if (!OPS.has(op)) {
    throw new Error('未知操作 ' + JSON.stringify(op) + '：支持 detect/read/extract');
  }
  const first = Array.isArray(inputs) ? inputs[0] : null;
  if (!first) throw new Error('没有收到任何输入文件');

  if (op === 'detect') {
    const det = await detectDocument(first.bytes, first.name, p.pages);
    if (!det.hasText) {
      throw new Error(first.name + ' 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）');
    }
    return {
      op: 'detect',
      pages: det.pages,
      totalTables: det.totalTables,
      pageResults: det.pageResults.map((pr) => ({
        page: pr.page,
        charCount: pr.charCount,
        textLess: pr.textLess,
        tables: pr.tables.map((t) => ({
          header: t.header,
          rowsCount: t.rowsCount,
          colCount: t.colCount,
          fillRatio: t.fillRatio,
          preview: t.grid.slice(0, 6),
        })),
      })),
      note: det.totalTables ? '' : '未检出表格：页面文字存在但没有对齐的列结构（可能是不规则排版/双栏/图片表格）',
    };
  }

  if (op === 'read') {
    const det = await detectDocument(first.bytes, first.name, p.pages);
    if (!det.hasText) {
      throw new Error(first.name + ' 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）');
    }
    const blockIndex = Math.max(0, Number(p.blockIndex) || 0);
    const maxRows = Math.min(2000, Math.max(1, Number(p.maxRows) || 200));
    const found = det.pageResults.filter((pr) => pr.tables.length);
    if (!found.length) {
      throw new Error(first.name + ' 未检出表格：文字存在但没有对齐的列结构');
    }
    // 跨页合并优先：同构表头连成一张表读出（对流水最常见）；否则取第 blockIndex 个块
    const merged = mergeContinued(found);
    const target = merged[blockIndex] || merged[0];
    const allRows = [target.header, ...target.rows];
    const truncated = allRows.length > maxRows;
    const rows = allRows.slice(0, maxRows);
    const fmt = p.format === 'tsv' ? 'tsv' : 'markdown';
    let text;
    if (fmt === 'tsv') {
      text = rows.map((r) => r.map((v) => String(v).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    } else {
      const esc = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      text = rows.map((r, i) => '| ' + r.map(esc).join(' | ') + ' |' + (i === 0 ? '\n|' + r.map(() => ' --- ').join('|') + '|' : '')).join('\n');
    }
    return {
      op: 'read',
      pages: det.pages,
      blockIndexUsed: blockIndex,
      sourcePages: target.sourcePages,
      rowsTotal: allRows.length,
      truncated,
      colCount: target.header.length,
      text,
      note: (merged.length > 1 ? '共检出 ' + merged.length + ' 张表（跨页合并后），当前读第 ' + (blockIndex + 1) + ' 张；' : '')
        + (truncated ? '已截断到 ' + maxRows + ' 行（完整 ' + allRows.length + ' 行，extract 可全量落盘）' : ''),
    };
  }

  // extract
  const det = await detectDocument(first.bytes, first.name, p.pages);
  if (!det.hasText) {
    throw new Error(first.name + ' 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）');
  }
  const found = det.pageResults.filter((pr) => pr.tables.length);
  if (!found.length) {
    throw new Error(first.name + ' 未检出表格：文字存在但没有对齐的列结构（可能是不规则排版/双栏/图片表格）');
  }
  const doMerge = p.mergePages === undefined ? true : !!p.mergePages;
  const groups = doMerge ? mergeContinued(found) : [];
  const sheets = [];
  if (doMerge) {
    groups.forEach((g, i) => {
      sheets.push({ name: '表格' + (i + 1), rows: [g.header, ...g.rows], sourcePages: g.sourcePages });
    });
  } else {
    found.forEach((pr) => {
      pr.tables.forEach((t, bi) => {
        const label = '第' + pr.page + '页' + (pr.tables.length > 1 ? '-' + (bi + 1) : '');
        sheets.push({ name: '表格-' + label, rows: t.grid, sourcePages: [pr.page] });
      });
    });
  }
  const format = ['xlsx', 'csv', 'json', 'all'].indexOf(p.format) >= 0 ? p.format : 'xlsx';
  const stem = core.sanitizeStem(first.name);
  const outputs = [];
  const usedSheetNames = new Set();
  if (format === 'xlsx' || format === 'all') {
    const xlsxRows = sheets.map((s) => ({ name: safeSheetName(s.name, usedSheetNames), rows: s.rows }));
    outputs.push({ name: stem + '-表格.xlsx', bytes: await gridToXlsx(xlsxRows) });
  }
  usedSheetNames.clear();
  if (format === 'csv' || format === 'all') {
    sheets.forEach((s, i) => {
      const suffix = sheets.length > 1 ? '-表格' + (i + 1) : '-表格';
      outputs.push({ name: stem + suffix + '.csv', bytes: core.csvBytes(s.rows) });
    });
  }
  if (format === 'json' || format === 'all') {
    const json = sheets.map((s) => ({ name: s.name, sourcePages: s.sourcePages, header: s.rows[0] || [], rows: s.rows.slice(1) }));
    outputs.push({ name: stem + '-表格.json', bytes: Buffer.from(JSON.stringify(json, null, 2), 'utf8') });
  }
  const rowsTotal = sheets.reduce((s, x) => s + x.rows.length, 0);
  return {
    op: 'extract',
    pages: det.pages,
    format,
    mergedPages: doMerge,
    tablesExtracted: sheets.length,
    rowsTotal,
    outputs,
    sourcePages: sheets.map((s) => s.sourcePages),
    note: doMerge && sheets.length ? '同构表头已跨页合并（如需逐页独立输出请关掉「跨页合并」）' : '',
  };
}

module.exports = {
  runOp,
  detectDocument,
  detectPage,
  buildRows,
  rowSegments,
  buildColumns,
  assignRows,
  findBlocks,
  materializeBlock,
  mergeContinued,
  gridToXlsx,
  safeSheetName,
  displayWidth,
  OPS,
};
