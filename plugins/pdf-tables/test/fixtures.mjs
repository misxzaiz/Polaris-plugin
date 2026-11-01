/**
 * fixtures.mjs —— 引擎验收用真实 PDF 表格 fixture 生成器（pdf-lib + 等线 CJK 字体）
 *
 * 用真实坐标绘制表格（含右对齐金额、中文摘要、可选格线、跨页续表），
 * 让引擎在「真 PDF → 真 pdfjs 坐标 → 真网格」链路上做产物级断言。
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

/** 候选 CJK 单文件字体（.ttc 集合 pdf-lib/embedFont 不支持，优先单 TTF） */
const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\Deng.ttf',      // 等线（Win10/11 自带）
  'C:\\Windows\\Fonts\\simhei.ttf',    // 黑体
  'C:\\Windows\\Fonts\\STZHONGS.TTF',  // 华文中宋
];

export async function loadCjkFont() {
  for (const p of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return { bytes: fs.readFileSync(p), path: p };
    } catch (_) { /* 下一个候选 */ }
  }
  throw new Error('测试环境缺 CJK 单文件字体（Deng.ttf/simhei.ttf），无法生成中文 fixture：' + FONT_CANDIDATES.join(', '));
}

/**
 * 造一页表格（pdf-lib drawText 精确坐标）。
 * cols: [{left?:number, right?:number}]，left=左对齐列起点，right=右对齐列终点
 */
export async function makeTableDoc({ pages, withLines = true, size = 10.5 }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const { bytes: fontBytes } = await loadCjkFont();
  let font;
  try {
    font = await doc.embedFont(fontBytes, { subset: true });
  } catch (_) {
    font = await doc.embedFont(fontBytes, { subset: false }); // 子集化失败的字体全量内嵌
  }
  const W = 595, H = 842;
  for (const pageSpec of pages) {
    const page = doc.addPage([W, H]);
    let y = pageSpec.yTop ?? 780;
    for (const row of pageSpec.rows) {
      const cells = row.cells || row; // {cells, kind:'header'|'data'}
      const kind = row.kind || 'data';
      for (let c = 0; c < pageSpec.cols.length && c < cells.length; c++) {
        const col = pageSpec.cols[c];
        const text = String(cells[c] ?? '');
        if (!text) continue;
        let x;
        if (col.right !== undefined) x = col.right - font.widthOfTextAtSize(text, size);
        else x = col.left;
        page.drawText(text, { x, y, size, font, color: rgb(0.05, 0.05, 0.08) });
      }
      if (withLines) {
        const top = y + size + 4;
        page.drawLine({ start: { x: 40, y: top }, end: { x: 555, y: top }, thickness: 0.6, color: rgb(0.75, 0.75, 0.78) });
        // 竖线（列分隔）
        for (const col of pageSpec.cols) {
          const vx = col.left !== undefined ? col.left - 6 : col.right + 6;
          page.drawLine({ start: { x: vx, y: top }, end: { x: vx, y: top - (pageSpec.rowH ?? 22) }, thickness: 0.6, color: rgb(0.82, 0.82, 0.85) });
        }
      }
      y -= pageSpec.rowH ?? 22;
    }
    if (pageSpec.footer) {
      page.drawText(pageSpec.footer, { x: 40, y: 40, size: 9, font, color: rgb(0.45, 0.45, 0.5) });
    }
  }
  return Buffer.from(await doc.save());
}

/** 标准流水表列：日期(左) 摘要(左) 收入(右) 支出(右) 余额(右) */
export function statementCols() {
  return [
    { left: 50 },
    { left: 125 },
    { right: 320 },
    { right: 430 },
    { right: 545 },
  ];
}

export const STATEMENT_HEADER = ['交易日期', '摘要', '收入(元)', '支出(元)', '余额(元)'];

export function statementRows(n, startBalance = 10000) {
  const samples = [
    ['2026-01-02', '工资代发', '12,500.00', '', ''],
    ['2026-01-03', '超市购物', '', '286.50', ''],
    ['2026-01-05', '转账-房租', '', '3,800.00', ''],
    ['2026-01-08', '理财赎回', '5,000.00', '', ''],
    ['2026-01-12', '餐饮-外卖', '', '45.80', ''],
    ['2026-01-15', '转账-水电煤', '', '328.00', ''],
    ['2026-01-18', '红包收入', '888.00', '', ''],
    ['2026-01-22', '话费充值', '', '100.00', ''],
  ];
  const rows = [];
  let bal = startBalance;
  for (let i = 0; i < n; i++) {
    const [date, memo, inV, outV] = samples[i % samples.length];
    const inN = inV ? Number(inV.replace(/,/g, '')) : 0;
    const outN = outV ? Number(outV.replace(/,/g, '')) : 0;
    bal = bal + inN - outN;
    rows.push([date, memo, inV, outV, bal.toFixed(2)]);
  }
  return rows;
}
