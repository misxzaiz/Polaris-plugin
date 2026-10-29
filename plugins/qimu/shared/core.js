'use strict';
/**
 * core.js —— PPT 工坊（AI PPT 工厂）共享核心（单一权威，零依赖）
 *
 * 被 MCP 渲染器（CJS require）与面板（esbuild 打包）共用。
 * 职责链：Deck Spec 归一化（容量护栏）→ 几何布局（确定性数学）→ 主题 token。
 * 渲染器（pptxgenjs 适配 / 面板 HTML 预览）只消费 layout() 输出的几何盒，
 * 不做任何计算——口径不漂移，预览≈成品的保证来源。
 *
 * 产品核心（与"AI 生成图片式幻灯片"的本质区别）：
 *   直接产出原生 OOXML 排版——每页版式是确定性布局函数，不是画布截图转换；
 *   容量护栏超限即报错拆页（不缩字硬塞），从源头杜绝"导出后排版崩坏"。
 *
 * Deck Spec（camelCase，权威定义见 README）：
 *   { title, subtitle?, author?, theme, slides: [ {type,...} ] }
 *   版式七类：cover / section / bullets / two / quote / chart / table / end
 *
 * 几何盒（layout 输出，单位英寸，画布 13.333×7.5）：
 *   { k:'rect', x,y,w,h, fill, shape? }                    // 色块/装饰
 *   { k:'text', x,y,w,h, text, fontSize, bold?, color, align?, valign?, shrink? }
 *   { k:'chart', x,y,w,h, chart:{kind,labels,series}, colors }
 *   { k:'table', x,y,w,h, table:{head,rows,rowH,headerFill,...} }
 */

// ── 常量 ───────────────────────────────────────────────────────────────────
/** cap.kv 键空间（唯一权威，与 README 契约一致） */
const K = {
  deck: (id) => `qimu.deck.${id}`,
  deckPrefix: 'qimu.deck.',
  settings: 'qimu.settings',
};

const PAGE = { W: 13.333, H: 7.5 };
const MARGIN = 0.9;
const CONTENT_W = PAGE.W - MARGIN * 2;

const THEMES = {
  midnight: {
    label: '午夜蓝', dark: true,
    bg: '10141C', bgAlt: '161B22', card: '1C2330',
    accent: '3E7BFA', accent2: '7EE2A0', text: 'E6EAF2', sub: '8B95A7',
    hairline: '2A2F3A', onAccent: 'FFFFFF',
    titleFont: '微软雅黑', bodyFont: '微软雅黑',
  },
  ink: {
    label: '鎏金墨', dark: true,
    bg: '1C1A17', bgAlt: '26231F', card: '2C2822',
    accent: 'D4A24E', accent2: 'C96F4A', text: 'F2EDE4', sub: '9A9184',
    hairline: '3A352C', onAccent: '1C1A17',
    titleFont: '微软雅黑', bodyFont: '微软雅黑',
  },
  ember: {
    label: '烬红', dark: true,
    bg: '1A1416', bgAlt: '241B1E', card: '2A2024',
    accent: 'F25C54', accent2: 'F2C063', text: 'F7EFEA', sub: 'B39E97',
    hairline: '3A2C30', onAccent: 'FFFFFF',
    titleFont: '微软雅黑', bodyFont: '微软雅黑',
  },
  sky: {
    label: '晴空', dark: false,
    bg: 'F5F8FF', bgAlt: 'FFFFFF', card: 'FFFFFF',
    accent: '2563EB', accent2: '0EA5A6', text: '1E293B', sub: '64748B',
    hairline: 'E2E8F0', onAccent: 'FFFFFF',
    titleFont: '微软雅黑', bodyFont: '微软雅黑',
  },
  paper: {
    label: '纸本', dark: false,
    bg: 'FAF7F2', bgAlt: 'FFFFFF', card: 'FFFFFF',
    accent: '8A5A2B', accent2: '2F6B4F', text: '2B2620', sub: '7A7265',
    hairline: 'E8E2D8', onAccent: 'FFFFFF',
    titleFont: '微软雅黑', bodyFont: '微软雅黑',
  },
};
const THEME_KEYS = Object.keys(THEMES);

const SLIDE_TYPES = ['cover', 'section', 'bullets', 'two', 'quote', 'chart', 'table', 'end'];

/** 容量护栏（超限=报错拆页，绝不缩字硬塞） */
const CAPS = {
  totalSlides: 60,
  title: 60, subtitle: 90, author: 24,
  sectionTitle: 40, sectionNote: 120,
  bulletsCount: 6, bulletPlain: 90, bulletH: 24, bulletD: 110, bulletsTitle: 40,
  twoH: 20, twoPoints: 5, twoPoint: 70, twoTitle: 40,
  quoteText: 130, quoteAuthor: 24,
  chartLabels: 8, chartLabelLen: 12, chartSeries: 3, chartSeriesName: 16,
  chartTitle: 40, chartNote: 90,
  tableCols: 6, tableHeadLen: 12, tableRows: 8, tableCellLen: 40, tableTitle: 40,
  endNote: 130,
  fileName: 40,
};

const CHART_KINDS = ['bar', 'line', 'pie'];
const CHART_COLORS = ['accent', 'accent2', 'sub', 'hairline', 'card'];

const DEFAULT_SETTINGS = { schemaVersion: 1, exportDir: '', theme: 'midnight' };

// ── 小工具 ─────────────────────────────────────────────────────────────────
function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  return 'd' + t.toString(36) + Math.random().toString(36).slice(2, 8);
}

/** CJK≈1em / ASCII≈0.52em 的估宽（字符数）——溢出判断的唯一定义 */
function estChars(text) {
  let w = 0;
  for (const ch of String(text || '')) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.52;
  }
  return w;
}

/** 标题字号阶梯：字数越多字号越小（确定性，可测） */
function titleFontSize(text, base, min) {
  const n = estChars(text);
  if (n <= 10) return base;
  if (n <= 16) return Math.round(base * 0.88);
  if (n <= 24) return Math.round(base * 0.76);
  return min;
}

function clampText(text, max) {
  const s = String(text == null ? '' : text).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** 文件名净化：剥路径与非法字符（防目录穿越），连续点折叠，留 CJK */
function safeFileName(title, now) {
  const d = typeof now === 'number' ? new Date(now) : new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  let name = String(title || '未命名')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CAPS.fileName);
  if (!name) name = '未命名';
  return { stamp, name, file: `qimu-${stamp}-${name}.pptx` };
}

// ── Deck Spec 归一化（容量护栏）───────────────────────────────────────────
function _numArray(v, ctx, errs) {
  if (!Array.isArray(v)) { errs.push(`${ctx} 必须是数组`); return null; }
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const n = Number(v[i]);
    if (!Number.isFinite(n)) { errs.push(`${ctx}[${i}] 不是数字（${v[i]}）`); return null; }
    out.push(n);
  }
  return out;
}

function _normSlide(s, errs, idx) {
  const at = `slides[${idx}]`;
  if (!s || typeof s !== 'object') { errs.push(`${at} 必须是对象`); return null; }
  const type = s.type;
  if (!SLIDE_TYPES.includes(type)) {
    errs.push(`${at}.type 须为 ${SLIDE_TYPES.join('/')}（收到：${type}）`);
    return null;
  }
  if (type === 'cover') return { type };
  if (type === 'end') return { type: 'end', ...(s.note ? { note: clampText(s.note, CAPS.endNote) } : {}) };
  if (type === 'section') {
    const title = clampText(s.title, CAPS.sectionTitle);
    if (!title) { errs.push(`${at}.title 必填`); return null; }
    return { type, title, ...(s.note ? { note: clampText(s.note, CAPS.sectionNote) } : {}) };
  }
  if (type === 'quote') {
    const text = clampText(s.text, CAPS.quoteText);
    if (!text) { errs.push(`${at}.text 必填`); return null; }
    return { type, text, ...(s.author ? { author: clampText(s.author, CAPS.quoteAuthor) } : {}) };
  }
  if (type === 'bullets') {
    const title = clampText(s.title, CAPS.bulletsTitle);
    if (!title) { errs.push(`${at}.title 必填`); return null; }
    if (!Array.isArray(s.bullets) || !s.bullets.length) { errs.push(`${at}.bullets 必须是非空数组`); return null; }
    if (s.bullets.length > CAPS.bulletsCount) {
      errs.push(`${at}.bullets 共 ${s.bullets.length} 条，上限 ${CAPS.bulletsCount}——请拆成两页（内容过多时缩字会崩版）`);
      return null;
    }
    const items = [];
    for (let i = 0; i < s.bullets.length; i++) {
      const b = s.bullets[i];
      if (typeof b === 'string') {
        const t = clampText(b, CAPS.bulletPlain);
        if (!t) { errs.push(`${at}.bullets[${i}] 为空`); return null; }
        items.push({ t });
      } else if (b && typeof b === 'object') {
        const h = clampText(b.h, CAPS.bulletH);
        const d = clampText(b.d, CAPS.bulletD);
        if (!h && !d) { errs.push(`${at}.bullets[${i}] 的 h/d 至少填一个`); return null; }
        items.push({ ...(h ? { h } : {}), ...(d ? { d } : {}) });
      } else { errs.push(`${at}.bullets[${i}] 须为字符串或 {h,d}`); return null; }
    }
    return { type, title, bullets: items };
  }
  if (type === 'two') {
    const title = clampText(s.title, CAPS.twoTitle);
    if (!title) { errs.push(`${at}.title 必填`); return null; }
    const cols = [];
    for (const side of ['left', 'right']) {
      const c = s[side];
      if (!c || typeof c !== 'object') { errs.push(`${at}.${side} 必须是 {h, points}`); return null; }
      const h = clampText(c.h, CAPS.twoH);
      if (!h) { errs.push(`${at}.${side}.h 必填`); return null; }
      if (!Array.isArray(c.points) || !c.points.length) { errs.push(`${at}.${side}.points 必须是非空数组`); return null; }
      if (c.points.length > CAPS.twoPoints) {
        errs.push(`${at}.${side}.points 共 ${c.points.length} 条，上限 ${CAPS.twoPoints}——请拆页`);
        return null;
      }
      cols.push({ h, points: c.points.map((p, i) => clampText(p, CAPS.twoPoint)) });
    }
    return { type, title, left: cols[0], right: cols[1] };
  }
  if (type === 'chart') {
    const title = clampText(s.title, CAPS.chartTitle);
    if (!title) { errs.push(`${at}.title 必填`); return null; }
    const c = s.chart;
    if (!c || typeof c !== 'object') { errs.push(`${at}.chart 必须是 {kind,labels,series}`); return null; }
    if (!CHART_KINDS.includes(c.kind)) { errs.push(`${at}.chart.kind 须为 ${CHART_KINDS.join('/')}`); return null; }
    if (!Array.isArray(c.labels) || !c.labels.length) { errs.push(`${at}.chart.labels 必须是非空数组`); return null; }
    if (c.labels.length > CAPS.chartLabels) {
      errs.push(`${at}.chart.labels 共 ${c.labels.length} 个，上限 ${CAPS.chartLabels}——图表可读性优先`);
      return null;
    }
    const labels = c.labels.map((l) => clampText(l, CAPS.chartLabelLen));
    if (!Array.isArray(c.series) || !c.series.length) { errs.push(`${at}.chart.series 必须是非空数组`); return null; }
    if (c.series.length > CAPS.chartSeries) {
      errs.push(`${at}.chart.series 共 ${c.series.length} 个，上限 ${CAPS.chartSeries}`);
      return null;
    }
    let len = null;
    const series = [];
    for (let i = 0; i < c.series.length; i++) {
      const sr = c.series[i];
      const name = clampText(sr && sr.name, CAPS.chartSeriesName);
      const values = _numArray(sr && sr.values, `${at}.chart.series[${i}].values`, errs);
      if (values === null) return null;
      if (len === null) len = values.length;
      else if (values.length !== len) {
        errs.push(`${at}.chart.series[${i}].values 长度（${values.length}）与首个系列（${len}）不一致`);
        return null;
      }
      if (!values.length) { errs.push(`${at}.chart.series[${i}].values 为空`); return null; }
      series.push({ name, values });
    }
    if (labels.length !== len) {
      errs.push(`${at}.chart.labels 数量（${labels.length}）与系列值数量（${len}）不一致`);
      return null;
    }
    return { type, title, chart: { kind: c.kind, labels, series }, ...(s.note ? { note: clampText(s.note, CAPS.chartNote) } : {}) };
  }
  // table
  const title = clampText(s.title, CAPS.tableTitle);
  if (!title) { errs.push(`${at}.title 必填`); return null; }
  if (!Array.isArray(s.head) || !s.head.length) { errs.push(`${at}.head 必须是非空数组`); return null; }
  if (s.head.length > CAPS.tableCols) {
    errs.push(`${at}.head 共 ${s.head.length} 列，上限 ${CAPS.tableCols}`);
    return null;
  }
  if (!Array.isArray(s.rows) || !s.rows.length) { errs.push(`${at}.rows 必须是非空数组`); return null; }
  if (s.rows.length > CAPS.tableRows) {
    errs.push(`${at}.rows 共 ${s.rows.length} 行，上限 ${CAPS.tableRows}——请拆成两页表格`);
    return null;
  }
  const head = s.head.map((h) => clampText(h, CAPS.tableHeadLen));
  const rows = s.rows.map((r, i) => {
    if (!Array.isArray(r)) { errs.push(`${at}.rows[${i}] 必须是数组`); return null; }
    if (r.length !== head.length) {
      errs.push(`${at}.rows[${i}] 列数（${r.length}）与表头（${head.length}）不一致`);
      return null;
    }
    return r.map((cell) => clampText(cell, CAPS.tableCellLen));
  });
  if (rows.some((r) => r === null)) return null;
  return { type, title, head, rows };
}

/**
 * 归一化 Deck Spec。非法返回 { error }（含全部问题行，AI 可据此修正）；
 * 合法返回 { deck, warnings? }（未知主题回退为警告不致命）。
 * cover 若未显式提供则自动加在开头，end 自动加在结尾。
 */
function normalizeDeck(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少 deck spec' };
  const errs = [];
  const warnings = [];
  const title = clampText(raw.title, CAPS.title);
  if (!title) errs.push('title 必填（≤60 字）');
  const theme = THEMES[raw.theme] ? raw.theme : 'midnight';
  if (raw.theme && !THEMES[raw.theme]) warnings.push(`未知主题「${raw.theme}」，已回退 midnight（可用：${THEME_KEYS.join('/')}）`);
  if (!Array.isArray(raw.slides) || !raw.slides.length) errs.push('slides 必须是非空数组');
  if (errs.length) return { error: errs.join('；') };

  let slides = raw.slides.map((s, i) => _normSlide(s, errs, i));
  if (errs.length) return { error: errs.join('；') };
  slides = slides.filter(Boolean);
  if (slides.length > CAPS.totalSlides) {
    return { error: `slides 共 ${slides.length} 页，上限 ${CAPS.totalSlides}` };
  }
  if (slides[0].type !== 'cover') slides.unshift({ type: 'cover' });
  if (slides[slides.length - 1].type !== 'end') slides.push({ type: 'end', ...(raw.epilogue ? { note: clampText(raw.epilogue, CAPS.endNote) } : {}) });

  return {
    deck: {
      title,
      subtitle: raw.subtitle ? clampText(raw.subtitle, CAPS.subtitle) : undefined,
      author: raw.author ? clampText(raw.author, CAPS.author) : undefined,
      theme,
      slides,
      createdAt: Date.now(),
    },
    ...(warnings.length ? { warnings } : {}),
  };
}

// ── 几何布局（确定性，渲染器只消费不计算）─────────────────────────────────
function _headerBoxes(t, title, pageIdx, opts) {
  const fontSize = titleFontSize(title, 25, 19);
  const boxes = [
    { k: 'text', x: MARGIN, y: 0.5, w: opts && opts.titleW ? opts.titleW : 9.6, h: 0.72, text: title, fontSize, bold: true, color: 'text', fontKey: 'titleFont', shrink: true },
    { k: 'rect', x: MARGIN, y: 1.3, w: 0.85, h: 0.065, fill: 'accent' },
  ];
  if (opts && opts.note) {
    boxes.push({ k: 'text', x: 7.6, y: 0.58, w: 4.83, h: 0.5, text: opts.note, fontSize: 11, color: 'sub', align: 'right', valign: 'top', shrink: true });
  }
  // 页码（内容页右下角）
  boxes.push({ k: 'text', x: 12.45, y: 7.08, w: 0.7, h: 0.3, text: String(pageIdx), fontSize: 9, color: 'sub', align: 'right' });
  return boxes;
}

/** bullets 行几何：n 行自适应行高，溢出护栏（h+d 总宽超限截断已在归一化保证） */
function _bulletRows(n) {
  const top = 1.72;
  const bottom = 7.05;
  const gap = 0.14;
  const rowH = Math.min((bottom - top - gap * (n - 1)) / n, 1.42);
  return { top, rowH, gap };
}

/** two 列几何 */
function _twoCols() {
  const colW = (CONTENT_W - 0.5) / 2;
  return {
    left: { x: MARGIN, w: colW },
    right: { x: MARGIN + colW + 0.5, w: colW },
    top: 1.78,
  };
}

/**
 * 布局主函数：deck → 几何模型（每页一个盒子数组）。
 * 渲染器（pptxgenjs / 面板预览）只消费本输出。
 */
function layout(deck) {
  const t = THEMES[deck.theme] || THEMES.midnight;
  const pages = [];

  for (let idx = 0; idx < deck.slides.length; idx++) {
    const s = deck.slides[idx];
    const pageIdx = idx + 1;
    const boxes = [];

    if (s.type === 'cover') {
      // 深色主题用背景色 + 两个低透明度装饰圆（浅色主题省略装饰）
      if (t.dark) {
        boxes.push({ k: 'rect', shape: 'ellipse', x: 9.4, y: -2.1, w: 6.4, h: 6.4, fill: 'accent', transparency: 88 });
        boxes.push({ k: 'rect', shape: 'ellipse', x: 11.2, y: 4.6, w: 3.9, h: 3.9, fill: 'accent2', transparency: 90 });
      } else {
        boxes.push({ k: 'rect', shape: 'ellipse', x: 9.8, y: -1.9, w: 5.8, h: 5.8, fill: 'accent', transparency: 93 });
      }
      boxes.push({ k: 'rect', x: MARGIN, y: 2.02, w: 1.7, h: 0.09, fill: 'accent' });
      const fs = titleFontSize(deck.title, 40, 26);
      boxes.push({ k: 'text', x: MARGIN, y: 2.32, w: 11.3, h: 1.3, text: deck.title, fontSize: fs, bold: true, color: 'text', fontKey: 'titleFont', shrink: true });
      if (deck.subtitle) {
        boxes.push({ k: 'text', x: MARGIN, y: 3.62, w: 10.8, h: 0.55, text: deck.subtitle, fontSize: 17, color: 'sub', fontKey: 'bodyFont', shrink: true });
      }
      if (deck.author) {
        boxes.push({ k: 'text', x: MARGIN, y: 6.55, w: 6, h: 0.4, text: deck.author, fontSize: 12, color: 'sub' });
      }
      boxes.push({ k: 'text', x: 11.5, y: 6.55, w: 0.93, h: 0.4, text: String(deck.slides.length), fontSize: 11, color: 'sub', align: 'right' });
      pages.push({ type: 'cover', boxes });

    } else if (s.type === 'section') {
      const numText = String(pageIdx).padStart(2, '0');
      boxes.push({ k: 'text', x: MARGIN, y: 1.35, w: 4, h: 1.1, text: numText, fontSize: 54, bold: true, color: 'accent', transparency: 55, fontKey: 'titleFont' });
      boxes.push({ k: 'rect', x: MARGIN, y: 2.78, w: 1.15, h: 0.075, fill: 'accent' });
      const fs = titleFontSize(s.title, 33, 24);
      boxes.push({ k: 'text', x: MARGIN, y: 3.05, w: 11.3, h: 0.95, text: s.title, fontSize: fs, bold: true, color: 'text', fontKey: 'titleFont', shrink: true });
      if (s.note) boxes.push({ k: 'text', x: MARGIN, y: 4.15, w: 10.5, h: 0.5, text: s.note, fontSize: 14, color: 'sub', shrink: true });
      pages.push({ type: 'section', boxes });

    } else if (s.type === 'bullets') {
      boxes.push(..._headerBoxes(t, s.title, pageIdx));
      const { top, rowH, gap } = _bulletRows(s.bullets.length);
      s.bullets.forEach((b, i) => {
        const y = top + i * (rowH + gap);
        boxes.push({ k: 'rect', x: MARGIN + 0.02, y: y + 0.115, w: 0.1, h: 0.1, fill: 'accent' });
        if (b.h && b.d) {
          boxes.push({ k: 'text', x: MARGIN + 0.34, y, w: CONTENT_W - 0.34, h: 0.34, text: b.h, fontSize: 15.5, bold: true, color: 'text', fontKey: 'bodyFont', shrink: true });
          boxes.push({ k: 'text', x: MARGIN + 0.34, y: y + 0.36, w: CONTENT_W - 0.34, h: rowH - 0.4, text: b.d, fontSize: 12.5, color: 'sub', fontKey: 'bodyFont', shrink: true });
        } else {
          const text = b.h || b.d || b.t || '';
          boxes.push({ k: 'text', x: MARGIN + 0.34, y: y + 0.03, w: CONTENT_W - 0.34, h: Math.max(rowH * 0.62, 0.4), text, fontSize: 14.5, color: 'text', fontKey: 'bodyFont', shrink: true });
        }
      });
      pages.push({ type: 'bullets', boxes });

    } else if (s.type === 'two') {
      boxes.push(..._headerBoxes(t, s.title, pageIdx));
      const { left, right, top } = _twoCols();
      [['left', left], ['right', right]].forEach(([side, col]) => {
        const c = s[side];
        let y = top;
        boxes.push({ k: 'rect', x: col.x, y, w: 0.075, h: 0.3, fill: side === 'left' ? 'accent' : 'accent2' });
        boxes.push({ k: 'text', x: col.x + 0.2, y: y - 0.02, w: col.w - 0.2, h: 0.36, text: c.h, fontSize: 16, bold: true, color: 'text', fontKey: 'bodyFont', shrink: true });
        y += 0.52;
        c.points.forEach((p) => {
          boxes.push({ k: 'text', x: col.x + 0.02, y, w: col.w - 0.02, h: 0.62, text: `· ${p}`, fontSize: 12.5, color: 'sub', fontKey: 'bodyFont', shrink: true });
          y += 0.7;
        });
      });
      pages.push({ type: 'two', boxes });

    } else if (s.type === 'quote') {
      boxes.push({ k: 'text', x: 0.72, y: 0.85, w: 2.2, h: 1.6, text: '“', fontSize: 100, bold: true, color: 'accent', transparency: 62, fontKey: 'titleFont' });
      const fs = titleFontSize(s.text, 23, 16);
      boxes.push({ k: 'text', x: 1.5, y: 2.35, w: 10.3, h: 2.4, text: s.text, fontSize: fs, color: 'text', fontKey: 'bodyFont', align: 'center', valign: 'top', shrink: true });
      boxes.push({ k: 'rect', x: 6.29, y: 5.15, w: 0.75, h: 0.06, fill: 'accent2' });
      if (s.author) boxes.push({ k: 'text', x: 1.5, y: 5.42, w: 10.3, h: 0.4, text: `—— ${s.author}`, fontSize: 12.5, color: 'sub', align: 'center' });
      boxes.push({ k: 'text', x: 12.45, y: 7.08, w: 0.7, h: 0.3, text: String(pageIdx), fontSize: 9, color: 'sub', align: 'right' });
      pages.push({ type: 'quote', boxes });

    } else if (s.type === 'chart') {
      boxes.push(..._headerBoxes(t, s.title, pageIdx, { note: s.note }));
      const colors = CHART_COLORS.map((key) => t[key]).slice(0, Math.max(2, s.chart.series.length));
      boxes.push({
        k: 'chart', x: MARGIN, y: 1.72, w: CONTENT_W, h: 5.15,
        chart: s.chart, colors, themeDark: t.dark, onAccent: t.onAccent,
      });
      pages.push({ type: 'chart', boxes });

    } else if (s.type === 'table') {
      boxes.push(..._headerBoxes(t, s.title, pageIdx));
      const rowH = Math.min(0.64, 4.85 / (s.rows.length + 1));
      boxes.push({
        k: 'table', x: MARGIN, y: 1.72, w: CONTENT_W, rowH,
        table: { head: s.head, rows: s.rows }, headerFill: 'accent', onAccent: t.onAccent,
        zebra: t.dark ? 'card' : 'bgAlt', hairline: t.hairline,
      });
      pages.push({ type: 'table', boxes });

    } else { // end
      if (t.dark) {
        boxes.push({ k: 'rect', shape: 'ellipse', x: -1.8, y: 4.9, w: 5.2, h: 5.2, fill: 'accent', transparency: 90 });
      }
      boxes.push({ k: 'rect', x: 6.27, y: 2.6, w: 0.8, h: 0.08, fill: 'accent' });
      boxes.push({ k: 'text', x: 1.5, y: 2.95, w: 10.3, h: 0.9, text: s.note || '谢谢观看', fontSize: 30, bold: true, color: 'text', align: 'center', fontKey: 'titleFont', shrink: true });
      if (deck.author) boxes.push({ k: 'text', x: 1.5, y: 4.1, w: 10.3, h: 0.4, text: deck.author, fontSize: 12.5, color: 'sub', align: 'center' });
      pages.push({ type: 'end', boxes });
    }
  }

  return { W: PAGE.W, H: PAGE.H, theme: deck.theme, themes: t, pages, title: deck.title };
}

// ── 大纲 DSL（面板独立构建入口，AI 也可用）────────────────────────────────
/**
 * 极简大纲语法（逐行解析，错误行收集不中断）：
 *   @theme midnight            可选：主题（缺省 midnight）
 *   @title 标题                可选：封面标题（缺省取第一个 ## 或"未命名演示"）
 *   @subtitle 副标题           可选
 *   @author 署名               可选
 *   # 章节标题 | 补充说明      章节页
 *   ## 内容页标题              开启一个内容页（bullets/two/chart/table 由内容行决定）
 *   - 要点                     bullets 纯文本要点
 *   - 小标题::说明             bullets 结构化要点
 *   [L] 左栏标题 / [R] 右栏标题  two 双栏（其后的 - 归属本栏）
 *   > 引言 | 署名              quote 引用页
 *   %bar|图表标题|标签1,标签2|系列A:1,2|系列B:3,4   chart 页（kind: bar/line/pie）
 *   |表头1,表头2               table 页首行（其后 | 行为数据行，页标题取最近的 ## 或"数据表"）
 *   === 结束语                 end 页（可自定义结束语）
 */
function parseOutline(text) {
  const errors = [];
  const meta = { theme: '', title: '', subtitle: '', author: '' };
  const slides = [];
  let cur = null;          // 当前内容页（bullets/two/table 壳）
  let twoSide = null;      // two 当前栏
  let tableTitle = '';
  const flush = () => {
    if (!cur) return;
    if (cur.type === 'bullets' && !cur.bullets.length) errors.push(`「${cur.title}」没有任何要点（- 行），已跳过`);
    else if (cur.type === 'two' && (!cur.left || !cur.right)) errors.push(`「${cur.title}」双栏需 [L] 与 [R] 都有内容`);
    else if (cur.type === 'table' && (!cur.head || !cur.rows.length)) errors.push(`「${cur.title}」表格至少需要一个表头行和一个数据行`);
    else slides.push(cur);
    cur = null;
    twoSide = null;
  };
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line === '---') continue;
    const ln = i + 1;
    if (line.startsWith('@theme ')) { meta.theme = line.slice(7).trim(); continue; }
    if (line.startsWith('@title ')) { meta.title = line.slice(7).trim(); continue; }
    if (line.startsWith('@subtitle ')) { meta.subtitle = line.slice(10).trim(); continue; }
    if (line.startsWith('@author ')) { meta.author = line.slice(8).trim(); continue; }
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      flush();
      const [t, note] = line.slice(2).split('|');
      slides.push({ type: 'section', title: t.trim(), ...(note && note.trim() ? { note: note.trim() } : {}) });
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      cur = { type: 'bullets', title: line.slice(3).trim(), bullets: [] };
      tableTitle = cur.title;
      continue;
    }
    if (line.startsWith('> ')) {
      flush();
      const [t, a] = line.slice(2).split('|');
      slides.push({ type: 'quote', text: t.trim(), ...(a && a.trim() ? { author: a.trim() } : {}) });
      continue;
    }
    if (line.startsWith('%')) {
      flush();
      // %kind|标题|标签1,标签2|系列A:1,2|系列B:3,4
      const parts = line.slice(1).split('|').map((p) => p.trim());
      const kind = (parts[0] || 'bar').toLowerCase();
      const chartTitle = parts[1] || tableTitle || '图表';
      const labels = (parts[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
      const series = parts.slice(3).map((p) => {
        const [name, vals] = p.split(':');
        return { name: (name || '系列').trim(), values: (vals || '').split(',').map((v) => Number(v.trim())) };
      }).filter((sr) => sr.values.length && sr.values.every((v) => Number.isFinite(v)));
      if (!labels.length || !series.length) {
        errors.push(`第 ${ln} 行图表语法应为 %${kind}|标题|标签1,标签2|系列A:1,2`);
        continue;
      }
      slides.push({ type: 'chart', title: chartTitle, chart: { kind, labels, series } });
      continue;
    }
    if (line.startsWith('|')) {
      // 表格行：首个 | 行为表头
      if (!cur || cur.type !== 'table') {
        flush();
        cur = { type: 'table', title: tableTitle || '数据表', head: null, rows: [] };
      }
      const cells = line.slice(1).split(',').map((c) => c.trim());
      if (!cur.head) cur.head = cells;
      else cur.rows.push(cells);
      continue;
    }
    if (line.startsWith('[L]') || line.startsWith('[R]')) {
      if (!cur || (cur.type !== 'two' && cur.type !== 'bullets')) {
        const title = cur && cur.title ? cur.title : tableTitle || '对比';
        flush();
        cur = { type: 'two', title, left: null, right: null };
      }
      twoSide = line.startsWith('[L]') ? 'left' : 'right';
      const h = line.slice(3).trim();
      cur[twoSide] = { h: h || (twoSide === 'left' ? '左栏' : '右栏'), points: [] };
      if (cur.type === 'bullets') { // 从 bullets 升级为 two
        cur = { type: 'two', title: cur.title, left: twoSide === 'left' ? cur[twoSide] : { h: '左栏', points: [] }, right: twoSide === 'right' ? cur[twoSide] : { h: '右栏', points: [] } };
      }
      continue;
    }
    if (line.startsWith('- ')) {
      if (!cur) { errors.push(`第 ${ln} 行的「-」前面需要一个 ## 页标题`); continue; }
      const body = line.slice(2).trim();
      if (cur.type === 'two') {
        if (!twoSide || !cur[twoSide]) { errors.push(`第 ${ln} 行的「-」前面需要 [L] 或 [R] 栏标题`); continue; }
        cur[twoSide].points.push(body);
      } else if (cur.type === 'bullets') {
        const m = body.split('::');
        cur.bullets.push(m.length === 2 ? { h: m[0].trim(), d: m[1].trim() } : body);
      } else {
        errors.push(`第 ${ln} 行的「-」不能用在${cur.type}页`);
      }
      continue;
    }
    if (line.startsWith('===')) {
      flush();
      const note = line.slice(3).trim();
      slides.push({ type: 'end', ...(note ? { note } : {}) });
      continue;
    }
    errors.push(`第 ${ln} 行无法识别（${line.slice(0, 24)}…）——以 #、##、-、>、%、|、[L]、[R]、===、@ 开头`);
  }
  flush();
  if (errors.length) return { errors, spec: null };
  const spec = {
    title: meta.title || (slides.find((s) => s.type === 'section') || {}).title || '未命名演示',
    ...(meta.subtitle ? { subtitle: meta.subtitle } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    theme: meta.theme || 'midnight',
    slides,
  };
  return { errors: null, spec };
}

module.exports = {
  K, PAGE, THEMES, THEME_KEYS, SLIDE_TYPES, CAPS, CHART_KINDS, DEFAULT_SETTINGS,
  makeId, estChars, titleFontSize, clampText, safeFileName,
  normalizeDeck, layout, parseOutline,
};
