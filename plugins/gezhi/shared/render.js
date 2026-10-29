'use strict';
/**
 * render.js —— Excel 工坊的渲染适配层（sheet spec + layout → exceljs Workbook）
 *
 * 只消费 shared/core.js 的 layout() 输出，不做任何计算——
 * 与面板预览同一几何权威，预览≈成品的保证来源。
 *
 * 安全设计：非公式列的单元格文本若以 = + - @ 开头，用 richText 强制按文本存储
 * （Excel 会把这几个前缀当公式求值——CSV/公式注入的经典面）。公式只允许来自
 * spec 的 formula 列与 stats 汇总行（由引擎生成，模板已过校验）。
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('../vendor/exceljs.min.js');

function argb(hex6) {
  const s = String(hex6 || '').replace('#', '');
  return ('FF' + s).slice(-8).toUpperCase();
}

const THIN = 'thin';
function cellBorder(color) {
  return {
    top: { style: THIN, color: { argb: argb(color) } },
    left: { style: THIN, color: { argb: argb(color) } },
    bottom: { style: THIN, color: { argb: argb(color) } },
    right: { style: THIN, color: { argb: argb(color) } },
  };
}

/** 数据文本的公式注入防护：= + - @ 前缀 → richText（显示不变，不作为公式） */
function safeTextValue(v) {
  if (typeof v === 'string' && /^[=+@-]/.test(v)) {
    return { richText: [{ text: v }] };
  }
  return v;
}

/**
 * 构建 Workbook（不落盘、不触发浏览器下载——由调用方决定 writeBuffer 后的出路）。
 * @returns {{workbook: object, meta: object}} meta: {sheets:[{name,rows,cols}], cellCount}
 */
function buildWorkbook(book, g) {
  const t = g.themes;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Polaris Excel 工坊';
  wb.created = new Date();
  // 引擎不写公式缓存值：让 Excel/WPS 打开时全量重算（否则新公式显示 0）
  wb.calcProperties.fullCalcOnLoad = true;

  const meta = { sheets: [], cellCount: 0 };

  for (const sh of g.sheets) {
    const ws = wb.addWorksheet(sh.name, {
      properties: { tabColor: { argb: argb(t.headerFill) }, defaultRowHeight: 16 },
      ...(sh.freeze ? { views: [{ state: 'frozen', xSplit: 0, ySplit: sh.headerRow }] } : {}),
    });

    for (let ci = 0; ci < sh.colCount; ci++) {
      ws.getColumn(ci + 1).width = sh.columns[ci].width;
    }

    // 标题行（可选，合并整行）
    if (sh.caption) {
      ws.mergeCells(1, 1, 1, sh.colCount);
      const c1 = ws.getCell(1, 1);
      c1.value = sh.caption;
      c1.font = { name: '微软雅黑', size: 12, bold: true, color: { argb: argb(t.textColor) } };
      c1.alignment = { vertical: 'middle', horizontal: 'left' };
      ws.getRow(1).height = 24;
    }

    // 表头
    const hr = sh.headerRow;
    ws.getRow(hr).height = 20;
    for (let ci = 0; ci < sh.colCount; ci++) {
      const cell = ws.getCell(hr, ci + 1);
      cell.value = sh.columns[ci].h;
      cell.font = { name: '微软雅黑', size: 10.5, bold: true, color: { argb: argb(t.headerColor) } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(t.headerFill) } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = cellBorder(t.border);
    }

    // 数据行
    for (let ri = 0; ri < sh.rows.length; ri++) {
      const rowNo = sh.dataStart + ri;
      const zebra = sh.zebra && ri % 2 === 1;
      for (let ci = 0; ci < sh.colCount; ci++) {
        const col = sh.columns[ci];
        const raw = sh.rows[ri][ci];
        const cell = ws.getCell(rowNo, ci + 1);
        // exceljs 对 '=' 开头字符串不自动转公式：必须显式 { formula }（且去掉 = 前缀）
        const isFormula = typeof raw === 'string' && col.formula;
        cell.value = isFormula ? { formula: raw.slice(1) } : safeTextValue(raw);
        const isNum = typeof raw === 'number' || raw instanceof Date;
        if (isNum || isFormula) {
          cell.numFmt = col.fmt || 'General';
          cell.alignment = { vertical: 'middle', horizontal: col.align };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
        cell.font = { name: '微软雅黑', size: 10.5, color: { argb: argb(t.textColor) } };
        if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(t.zebraFill) } };
        cell.border = cellBorder(t.border);
        meta.cellCount++;
      }
    }

    // 汇总行（真实公式）
    sh.statsRows.forEach((st, si) => {
      const rowNo = sh.dataEnd + 1 + si;
      ws.getRow(rowNo).height = 18;
      for (let ci = 0; ci < sh.colCount; ci++) {
        const cell = ws.getCell(rowNo, ci + 1);
        const v = st.cells[ci];
        const col = sh.columns[ci];
        const isFormula = typeof v === 'string' && v.startsWith('=');
        cell.value = v == null ? '' : (isFormula ? { formula: v.slice(1) } : safeTextValue(v));
        if (isFormula) { cell.numFmt = col.fmt || 'General'; cell.alignment = { vertical: 'middle', horizontal: col.align }; }
        else cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.font = { name: '微软雅黑', size: 10.5, bold: true, color: { argb: argb(t.textColor) } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(t.statsFill) } };
        cell.border = {
          ...cellBorder(t.border),
          top: { style: 'double', color: { argb: argb(t.subText) } },
        };
        meta.cellCount++;
      }
    });

    // 筛选（含表头到数据末行）
    if (sh.autofilter && sh.rows.length > 0) {
      ws.autoFilter = sh.ranges.data;
    }

    // 条件格式（expression 规则；dxf 样式用 bgColor）
    for (const cd of sh.conditional) {
      ws.addConditionalFormatting({
        ref: cd.ref,
        rules: [{
          type: 'expression',
          formulae: [cd.formula],
          style: {
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(cd.style.fill) } },
            font: { color: { argb: argb(cd.style.color) }, bold: true },
          },
        }],
      });
    }

    meta.sheets.push({ name: sh.name, rows: sh.rowCount, cols: sh.colCount });
  }

  return { workbook: wb, meta };
}

/** Sheet Spec → xlsx ArrayBuffer（MCP 与面板共用的唯一出口） */
async function renderToBuffer(book, g) {
  const { workbook } = buildWorkbook(book, g);
  const buf = await workbook.xlsx.writeBuffer();
  return buf;
}

module.exports = { buildWorkbook, renderToBuffer, argb };
