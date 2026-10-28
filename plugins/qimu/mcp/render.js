'use strict';
/**
 * render.js —— 启幕渲染器：core.layout() 的几何盒 → 原生 PPTX（pptxgenjs 适配层）
 *
 * 只做映射不做计算：位置/字号/颜色/数据全部来自 shared/core.js 的几何输出，
 * 主题 token 在此解析为十六进制色。文本"透明度"用向背景色的确定性混色实现
 * （避免依赖 pptxgenjs 版本相关的 transparency 行为）。
 */
const PptxGenJS = require('../vendor/pptxgen.full.cjs');
const core = require('../shared/core.js');

/** hex 混色：a 向 b 靠拢 pct%（0-100） */
function blend(a, b, pct) {
  const pa = parseInt(a, 16);
  const pb = parseInt(b, 16);
  const ch = (sa, sb) => {
    const va = (pa >> sa) & 255;
    const vb = (pb >> sa) & 255;
    return Math.round(va + ((vb - va) * pct) / 100);
  };
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `${to2(ch(16, 16))}${to2(ch(8, 8))}${to2(ch(0, 0))}`.toUpperCase();
}

const CHART_MAP = { bar: 'bar', line: 'line', pie: 'pie' };

function resolveColor(t, token) {
  return t[token] || token; // token 名 → 主题色；直接给 hex 也放行
}

/** 单个几何盒 → pptxgenjs 调用 */
function drawBox(pptx, slide, box, t) {
  if (box.k === 'rect') {
    const fill = resolveColor(t, box.fill);
    const color = box.transparency != null ? blend(fill, t.bg, box.transparency) : fill;
    slide.addShape(box.shape === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect, {
      x: box.x, y: box.y, w: box.w, h: box.h,
      fill: { color, transparency: box.transparency != null ? 0 : undefined },
    });
    return;
  }
  if (box.k === 'text') {
    const base = resolveColor(t, box.color);
    const color = box.transparency != null ? blend(base, t.bg, box.transparency) : base;
    slide.addText(box.text, {
      x: box.x, y: box.y, w: box.w, h: box.h,
      fontSize: box.fontSize,
      bold: !!box.bold,
      color,
      align: box.align || 'left',
      valign: box.valign || 'top',
      fontFace: t[box.fontKey] || t.bodyFont,
      ...(box.shrink ? { fit: 'shrink' } : {}),
      wrap: true,
    });
    return;
  }
  if (box.k === 'chart') {
    const c = box.chart;
    const kind = CHART_MAP[c.kind] || 'bar';
    const data = c.series.map((sr) => ({ name: sr.name, labels: c.labels, values: sr.values }));
    const axisColor = box.themeDark ? blend(t.sub, t.bg, 0) : t.sub;
    const gridColor = box.themeDark ? blend(t.hairline, t.bg, 0) : t.hairline;
    const opts = {
      x: box.x, y: box.y, w: box.w, h: box.h,
      chartColors: box.colors,
      chartColorsOpacity: box.themeDark ? 92 : 100,
      showLegend: c.series.length > 1 || c.kind === 'pie',
      legendPos: 'b',
      legendFontSize: 10,
      legendColor: t.sub,
      catAxisLabelColor: axisColor,
      catAxisLabelFontSize: 10,
      valAxisLabelColor: axisColor,
      valAxisLabelFontSize: 9,
      valGridLine: { color: gridColor, style: 'solid', size: 0.5 },
      catGridLine: { style: 'none' },
      dataBorder: { pt: 0, color: 'FFFFFF' },
    };
    if (c.kind === 'pie') {
      opts.showPercent = true;
      opts.dataLabelColor = t.text;
      opts.dataLabelFontSize = 10;
      opts.legendFontSize = 11;
    } else {
      opts.barGapWidthPct = 80;
      opts.showValue = false;
    }
    // pptxgenjs 的图表枚举值即 'bar' | 'line' | 'pie'
    slide.addChart(kind, data, opts);
    return;
  }
  if (box.k === 'table') {
    const tb = box.table;
    const colW = Array.from({ length: tb.head.length }, () => box.w / tb.head.length);
    const headRow = tb.head.map((h) => ({
      text: h,
      options: { bold: true, color: box.onAccent, fill: { color: resolveColor(t, box.headerFill) }, fontSize: 11.5, valign: 'middle' },
    }));
    const rows = tb.rows.map((r, i) => r.map((cell) => ({
      text: cell,
      options: {
        color: t.text, fontSize: 11, valign: 'middle',
        fill: { color: i % 2 === 1 ? resolveColor(t, box.zebra) : resolveColor(t, 'bgAlt') },
      },
    })));
    slide.addTable([headRow, ...rows], {
      x: box.x, y: box.y, w: box.w, colW, rowH: box.rowH,
      border: { type: 'solid', pt: 0.5, color: resolveColor(t, box.hairline) },
      fontFace: t.bodyFont, align: 'left', margin: 0.06,
    });
  }
}

/**
 * deck → PPTX。
 * @returns Promise<Buffer|Blob> outputType: 'nodebuffer'（node）| 'blob'（浏览器面板）
 */
async function renderDeck(deck, { outputType = 'nodebuffer' } = {}) {
  const t = core.THEMES[deck.theme] || core.THEMES.midnight;
  const g = core.layout(deck);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'QIMU_W16x9', width: g.W, height: g.H });
  pptx.layout = 'QIMU_W16x9';
  pptx.author = deck.author || 'Polaris 启幕';
  pptx.title = deck.title;
  pptx.subject = deck.subtitle || deck.title;
  pptx.company = 'Polaris';

  for (const page of g.pages) {
    const slide = pptx.addSlide();
    slide.background = { color: t.bg };
    for (const box of page.boxes) drawBox(pptx, slide, box, t);
  }
  return pptx.write({ outputType });
}

module.exports = { renderDeck, blend };
