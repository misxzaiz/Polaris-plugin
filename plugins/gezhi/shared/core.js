'use strict';
/**
 * gezhi-core —— 格致（AI Excel 工厂）的唯一计算权威（CommonJS，零依赖）
 *
 * 被 MCP（require）与面板（esbuild 打包）与测试三方共用，
 * 保证「CSV 解析 / 类型推断 / spec 归一化 / 列宽与格式数学 / 主题」口径不漂移。
 *
 * 产品核心：交付真实可编辑的 .xlsx——原生表头样式 / 列宽 / 数字格式 / 真公式
 * （=SUM、行公式）/ 条件格式 / 冻结表头 / 筛选，而不是 AI 直出的 CSV 裸数据
 * （UTF-8 CSV 在 Excel 按 GBK 打开即乱码——本引擎从根上解决：直接产 xlsx）。
 *
 * Sheet Spec（camelCase，权威定义见 README）：
 *   { title, theme?, sheets: [ { name, caption?, columns: [{h,type,fmt?,formula?}],
 *       rows, stats?, conditional?, zebra?, freeze?, autofilter? } ] }
 *
 * 键空间契约（与 mcp/server.js 一致）：gezhi.book.<id> 登记作品；gezhi.settings 设置。
 */

// ── 常量 ───────────────────────────────────────────────────────────────────
const THEMES = {
  slate: { label: '石墨', headerFill: '334155', headerColor: 'FFFFFF', zebraFill: 'F1F5F9', border: 'CBD5E1', textColor: '0F172A', subText: '64748B', statsFill: 'E2E8F0' },
  indigo: { label: '靛青', headerFill: '4338CA', headerColor: 'FFFFFF', zebraFill: 'EEF2FF', border: 'C7D2FE', textColor: '1E1B4B', subText: '6366F1', statsFill: 'E0E7FF' },
  forest: { label: '林绿', headerFill: '15803D', headerColor: 'FFFFFF', zebraFill: 'F0FDF4', border: 'BBF7D0', textColor: '14532D', subText: '16A34A', statsFill: 'DCFCE7' },
  crimson: { label: '绛红', headerFill: 'B91C1C', headerColor: 'FFFFFF', zebraFill: 'FEF2F2', border: 'FECACA', textColor: '450A0A', subText: 'DC2626', statsFill: 'FEE2E2' },
  plain: { label: '素简', headerFill: 'E2E8F0', headerColor: '1E293B', zebraFill: 'F8FAFC', border: 'CBD5E1', textColor: '0F172A', subText: '64748B', statsFill: 'EDF2F7' },
};
const THEME_KEYS = Object.keys(THEMES);

const TYPES = ['text', 'number', 'int', 'money', 'percent', 'date'];
/** 类型 → 默认 Excel numFmt（fmt 显式指定则覆盖） */
const TYPE_FMT = {
  text: 'General',
  number: 'General',
  int: '0',
  money: '#,##0.00',
  percent: '0.0%',
  date: 'yyyy-mm-dd',
};
/** 类型 → 水平对齐（Excel 默认文本左/数字右，显式声明防漂移） */
const TYPE_ALIGN = {
  text: 'left', number: 'right', int: 'right',
  money: 'right', percent: 'right', date: 'center',
};

const COND_OPS = ['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'contains'];
const COND_STYLES = {
  warn: { fill: 'FEF3C7', color: '92400E' },
  good: { fill: 'D1FAE5', color: '065F46' },
  bad: { fill: 'FEE2E2', color: '991B1B' },
};
const STATS_FNS = { sum: 'SUM', avg: 'AVERAGE', count: 'COUNTA', max: 'MAX', min: 'MIN' };

/** 容量护栏（超限=报错引导，绝不静默截断数据——表格错一行就是错账） */
const CAPS = {
  title: 50, fileName: 40,
  sheets: 6, sheetName: 31, caption: 80,
  cols: 32, colH: 24,
  rows: 2000, cellLen: 200, formulaLen: 120,
  stats: 4, conditionals: 6,
  fmtLen: 24,
};

const DEFAULT_SETTINGS = { schemaVersion: 1, exportDir: '', theme: 'slate' };

const K = {
  bookPrefix: 'gezhi.book.',
  book(id) { return `gezhi.book.${id}`; },
  settings: 'gezhi.settings',
};

// ── 小工具 ─────────────────────────────────────────────────────────────────
function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  return 'g' + t.toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 显示宽度（Excel 宽度单位≈字符数）：CJK/全角=2，其余=1 */
function dispWidth(text) {
  let w = 0;
  for (const ch of String(text == null ? '' : text)) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 2 : 1;
  }
  return w;
}

function clampText(text, max) {
  const s = String(text == null ? '' : text).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** 文件名净化：剥路径与非法字符（防目录穿越），留 CJK，带时间戳 */
function safeFileName(title, now) {
  const d = typeof now === 'number' ? new Date(now) : new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  let name = String(title || '未命名表格')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CAPS.fileName);
  if (!name) name = '未命名表格';
  return { stamp, name, file: `gezhi-${stamp}-${name}.xlsx` };
}

/** 列索引 → Excel 列字母（0→A，26→AA） */
function colLetter(idx) {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 列宽：max(表头, 单元格显示宽)×1.05+2.5，夹在 [7,55] */
function computeWidth(header, values) {
  let m = dispWidth(header) + 2;
  for (const v of values) m = Math.max(m, dispWidth(typeof v === 'number' ? formatNumberPreview(v) : v));
  return Math.round(Math.min(55, Math.max(7, m * 1.05 + 2.5)) * 10) / 10;
}
function formatNumberPreview(n) {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const s = abs >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Math.round(n * 100) / 100);
  return s;
}

// ── CSV / TSV 解析（RFC4180 + 编码探测 + 定界符探测）────────────────────────
/** 解码表格文件字节：UTF-8 严格解码失败 → GB18030（Excel 导出的中文 CSV 默认 GBK 系） */
function decodeTableBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.slice(2)), encoding: 'utf-16le' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.slice(3)), encoding: 'utf-8-sig' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch (_) {
    try {
      return { text: new TextDecoder('gb18030').decode(bytes), encoding: 'gb18030' };
    } catch (_2) {
      return { text: Buffer.from(bytes).toString('utf8'), encoding: 'utf-8-lenient' };
    }
  }
}

/** 定界符探测：在非引号区统计候选符出现次数，多者胜（\t > ; > | > , 缺省序仅作并列裁决） */
function detectDelimiter(text) {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = { '\t': 0, ';': 0, '|': 0, ',': 0 };
  let inQ = false;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  let best = ',';
  let bestN = -1;
  const order = ['\t', ';', '|', ','];
  for (const d of order) {
    if (counts[d] > bestN) { best = d; bestN = counts[d]; }
  }
  return bestN > 0 ? best : ',';
}

/** RFC4180 状态机：引号字段（"" 转义）、内嵌换行/定界符；返回 {rows, errors} */
function parseDSV(text, delimiter) {
  const rows = [];
  const errors = [];
  let row = [];
  let field = '';
  let inQ = false;
  const src = String(text == null ? '' : text);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQ = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (inQ) errors.push('引号未闭合（最后一行）');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // 去掉全空行（拖尾换行产生的空记录）
  const cleaned = rows.filter((r) => r.length > 1 || (r[0] != null && String(r[0]).trim() !== ''));
  return { rows: cleaned, errors };
}

// ── 类型推断与值转换 ────────────────────────────────────────────────────────
const RE_PERCENT = /^-?\d+(\.\d+)?\s*%$/;
const RE_MONEY = /^[¥￥$€£]\s*-?[\d,]+(\.\d+)?$/;
const RE_NUMBER = /^-?\d+(\.\d+)?$/;
const RE_THOUSANDS = /^-?[\d,]+(\.\d+)?$/;
const RE_DATE = /^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/;

function parseLooseNumber(s) {
  const t = String(s).trim();
  if (RE_MONEY.test(t)) return Number(t.replace(/^[¥￥$€£]\s*/, '').replace(/,/g, ''));
  if (RE_THOUSANDS.test(t) && t.includes(',')) return Number(t.replace(/,/g, ''));
  if (RE_NUMBER.test(t)) return Number(t);
  if (RE_PERCENT.test(t)) return Number(t.replace(/%$/, '')) / 100;
  return NaN;
}

function parseDateValue(s) {
  const m = RE_DATE.exec(String(s).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12)); // 正午 UTC：全球时区序列化后日期不漂移
}

/** 对一列推断类型：票数过半的非常规类型胜，否则 number/text */
function inferColumnType(values) {
  const vals = values.map((v) => String(v == null ? '' : v).trim()).filter((v) => v !== '');
  if (!vals.length) return { type: 'text', reason: '空列' };
  const n = vals.length;
  const votes = { percent: 0, money: 0, number: 0, date: 0 };
  for (const v of vals) {
    if (RE_PERCENT.test(v)) votes.percent++;
    else if (RE_MONEY.test(v)) votes.money++;
    else if (RE_DATE.test(v)) votes.date++;
    else if (RE_NUMBER.test(v)) votes.number++;
    else if (RE_THOUSANDS.test(v) && v.includes(',')) votes.number++;
  }
  const half = n / 2;
  if (votes.date >= half && vals.every((v) => RE_DATE.test(v))) return { type: 'date' };
  if (votes.percent >= half) return { type: 'percent' };
  if (votes.money >= half) return { type: 'money' };
  if (votes.number >= half && vals.every((v) => Number.isFinite(parseLooseNumber(v)))) {
    const allInt = vals.every((v) => Number.isInteger(parseLooseNumber(v)));
    return { type: allInt && vals.every((v) => Math.abs(parseLooseNumber(v)) < 1e12) ? 'int' : 'number' };
  }
  return { type: 'text' };
}

/** 按列类型把原始字符串值转成正式值（number/money/percent → Number，date → Date） */
function coerceCell(raw, type) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;
  if (type === 'number' || type === 'int' || type === 'money' || type === 'percent') {
    const n = parseLooseNumber(s);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'date') return parseDateValue(s);
  return s;
}

/**
 * 面板/AI 共用入口：粘贴的表格文本 → 规范化 sheet 草稿。
 * 首行视为表头；列类型自动推断；定界符自动探测（也可显式传）。
 */
function ingestTable(text, opts) {
  const src = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  const trimmed = src.trim();
  if (!trimmed) return { error: '内容为空' };
  const delim = (opts && opts.delimiter) || detectDelimiter(trimmed);
  const { rows, errors } = parseDSV(trimmed, delim);
  if (!rows.length) return { error: '没有解析到任何行' };
  if (!rows[0].length) return { error: '首行（表头）为空' };
  const head = rows[0].map((h, i) => clampText(h || `列${i + 1}`, CAPS.colH));
  const body = rows.slice(1);
  const cols = head.length;
  const types = [];
  for (let c = 0; c < cols; c++) {
    const colVals = body.map((r) => r[c]);
    types.push(inferColumnType(colVals));
  }
  const warnings = [...errors.map((e) => `解析：${e}`)];
  if (delim !== ',') warnings.push(`检测到定界符「${delim === '\t' ? 'Tab' : delim}」`);
  const sheet = {
    name: 'Sheet1',
    columns: head.map((h, c) => ({ h, type: types[c].type })),
    rows: body.map((r) => {
      const out = [];
      for (let c = 0; c < cols; c++) out.push(r[c] == null ? '' : String(r[c]));
      return out;
    }),
  };
  return { sheet, ...(warnings.length ? { warnings } : {}), delimiter: delim };
}

// ── Sheet Spec 归一化（容量护栏）───────────────────────────────────────────
function _normColumn(c, ctx, errs) {
  if (!c || typeof c !== 'object') { errs.push(`${ctx} 必须是 {h,type} 对象`); return null; }
  const h = clampText(c.h, CAPS.colH);
  if (!h) { errs.push(`${ctx}.h 必填（≤${CAPS.colH} 字）`); return null; }
  let type = c.type || 'text';
  if (!TYPES.includes(type)) { errs.push(`${ctx}.type 须为 ${TYPES.join('/')}`); return null; }
  const out = { h, type };
  if (c.fmt != null && c.fmt !== '') {
    const f = clampText(c.fmt, CAPS.fmtLen);
    if (/[\\"]/.test(f)) { errs.push(`${ctx}.fmt 含非法字符`); return null; }
    out.fmt = f;
  }
  if (c.formula != null && c.formula !== '') {
    const f = String(c.formula).trim();
    if (!f.startsWith('=')) { errs.push(`${ctx}.formula 必须以 = 开头（如 "=B{r}*C{r}"）`); return null; }
    if (f.length > CAPS.formulaLen) { errs.push(`${ctx}.formula 过长（≤${CAPS.formulaLen}）`); return null; }
    if (!/\{r\}/.test(f)) { errs.push(`${ctx}.formula 缺少 {r} 行号占位符`); return null; }
    if (/[";]/.test(f)) { errs.push(`${ctx}.formula 含非法字符（" 或 ;）`); return null; }
    out.formula = f;
  }
  return out;
}

function _normSheet(s, errs, idx) {
  const at = `sheets[${idx}]`;
  if (!s || typeof s !== 'object') { errs.push(`${at} 必须是对象`); return null; }
  const name = clampText(s.name, CAPS.sheetName) || `Sheet${idx + 1}`;
  // Excel sheet 名硬限制：不可含 : \ / ? * [ ]，不可为空
  if (/[\\/:*?[\]]/.test(name)) { errs.push(`${at}.name「${name}」含 Excel 禁用字符（: \\ / ? * [ ]）`); return null; }
  const out = { name, ...(s.caption ? { caption: clampText(s.caption, CAPS.caption) } : {}) };
  if (!Array.isArray(s.columns) || !s.columns.length) { errs.push(`${at}.columns 必须是非空数组`); return null; }
  if (s.columns.length > CAPS.cols) { errs.push(`${at}.columns 共 ${s.columns.length} 列，上限 ${CAPS.cols}`); return null; }
  const columns = s.columns.map((c, i) => _normColumn(c, `${at}.columns[${i}]`, errs));
  if (errs.length) return null;
  if (!Array.isArray(s.rows) || !s.rows.length) { errs.push(`${at}.rows 必须是非空数组`); return null; }
  if (s.rows.length > CAPS.rows) { errs.push(`${at}.rows 共 ${s.rows.length} 行，上限 ${CAPS.rows}——请拆分文件或先在对话里汇总`); return null; }
  const colCount = columns.length;
  const rows = s.rows.map((r, ri) => {
    if (!Array.isArray(r)) { errs.push(`${at}.rows[${ri}] 必须是数组`); return null; }
    if (r.length > colCount) { errs.push(`${at}.rows[${ri}] 有 ${r.length} 个值，超过列数 ${colCount}`); return null; }
    return r.map((v) => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const t = clampText(v, CAPS.cellLen);
      return t;
    });
  });
  if (rows.some((r) => r === null)) return null;
  out.columns = columns;
  out.rows = rows;

  // 类型补全：formula 列的行值忽略（每行生成公式）；typed 列做值转换
  for (let ci = 0; ci < colCount; ci++) {
    const col = columns[ci];
    if (col.formula) continue;
    for (let ri = 0; ri < rows.length; ri++) {
      const raw = rows[ri][ci];
      if (typeof raw === 'string') {
        const cv = coerceCell(raw, col.type);
        rows[ri][ci] = cv === null && raw.trim() !== '' ? raw : cv; // 转不动就保留原文（并在渲染时按文本对待）
      }
    }
  }

  // stats：真实公式汇总行
  if (Array.isArray(s.stats) && s.stats.length) {
    if (s.stats.length > CAPS.stats) { errs.push(`${at}.stats 共 ${s.stats.length} 条，上限 ${CAPS.stats}`); return null; }
    const stats = s.stats.map((st, si) => {
      const sat = `${at}.stats[${si}]`;
      if (!st || typeof st !== 'object') { errs.push(`${sat} 必须是对象`); return null; }
      const type = st.type || 'sum';
      if (!STATS_FNS[type]) { errs.push(`${sat}.type 须为 ${Object.keys(STATS_FNS).join('/')}`); return null; }
      let cols2 = st.cols;
      if (!Array.isArray(cols2) || !cols2.length) {
        // 缺省：对全部数值列生效
        cols2 = columns.map((c, i) => (['number', 'int', 'money', 'percent'].includes(c.type) && !c.formula ? i : -1)).filter((i) => i >= 0);
      }
      cols2 = cols2.map((x) => Number(x));
      if (cols2.some((x) => !Number.isInteger(x) || x < 0 || x >= colCount)) { errs.push(`${sat}.cols 含越界列索引`); return null; }
      const label = clampText(st.label, 20) || { sum: '合计', avg: '平均', count: '计数', max: '最大', min: '最小' }[type];
      return { type, label, cols: cols2 };
    });
    if (stats.some((x) => x === null)) return null;
    out.stats = stats;
  }

  // conditional：条件格式
  if (Array.isArray(s.conditional) && s.conditional.length) {
    if (s.conditional.length > CAPS.conditionals) { errs.push(`${at}.conditional 共 ${s.conditional.length} 条，上限 ${CAPS.conditionals}`); return null; }
    const conds = s.conditional.map((cd, ci) => {
      const cat = `${at}.conditional[${ci}]`;
      if (!cd || typeof cd !== 'object') { errs.push(`${cat} 必须是对象`); return null; }
      const col = Number(cd.col);
      if (!Number.isInteger(col) || col < 0 || col >= colCount) { errs.push(`${cat}.col 列索引越界`); return null; }
      const op = cd.op || 'gt';
      if (!COND_OPS.includes(op)) { errs.push(`${cat}.op 须为 ${COND_OPS.join('/')}`); return null; }
      const style = cd.style || 'warn';
      if (!COND_STYLES[style]) { errs.push(`${cat}.style 须为 warn/good/bad`); return null; }
      let value = cd.value;
      if (op === 'contains') {
        value = clampText(value, 60);
        if (!value) { errs.push(`${cat}.value 必填（contains 的关键词）`); return null; }
      } else {
        value = Number(value);
        if (!Number.isFinite(value)) { errs.push(`${cat}.value 必须是数字（op=${op}）`); return null; }
      }
      return { col, op, value, style };
    });
    if (conds.some((x) => x === null)) return null;
    out.conditional = conds;
  }

  out.zebra = s.zebra !== false;
  out.freeze = s.freeze !== false;
  out.autofilter = s.autofilter !== false;
  return out;
}

/**
 * 归一化 Sheet Spec。非法返回 { error }（全部问题行，AI 可据此修正）；
 * 合法返回 { book, warnings? }。
 */
function normalizeBook(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少 sheet spec' };
  const errs = [];
  const warnings = [];
  const title = clampText(raw.title, CAPS.title);
  if (!title) errs.push('title 必填（≤50 字）');
  let theme = raw.theme || 'slate';
  if (!THEMES[theme]) { warnings.push(`未知主题「${theme}」，已回退 slate（可用：${THEME_KEYS.join('/')}）`); theme = 'slate'; }
  if (!Array.isArray(raw.sheets) || !raw.sheets.length) errs.push('sheets 必须是非空数组');
  if (errs.length) return { error: errs.join('；') };
  if (raw.sheets.length > CAPS.sheets) return { error: `sheets 共 ${raw.sheets.length} 个，上限 ${CAPS.sheets}` };
  const sheets = raw.sheets.map((s, i) => _normSheet(s, errs, i));
  if (errs.length) return { error: errs.join('；') };
  // sheet 名查重（Excel 硬限制）
  const seen = new Set();
  for (const sh of sheets) {
    const k = sh.name.toLowerCase();
    if (seen.has(k)) return { error: `sheet 名「${sh.name}」重复` };
    seen.add(k);
  }
  return {
    book: {
      title,
      theme,
      sheets,
      createdAt: Date.now(),
    },
    ...(warnings.length ? { warnings } : {}),
  };
}

// ── 布局数学（确定性；渲染器只消费不计算）─────────────────────────────────
/**
 * book → 布局模型。每 sheet：
 *   headerRow（表头所在 Excel 行号，1-based）、dataStart、dataEnd、statsRows、
 *   columns 的 width/fmt/align、ranges（autofilter/conditional 引用）、
 *   预览用 typedRows。
 */
function layout(book) {
  const t = THEMES[book.theme] || THEMES.slate;
  const sheets = book.sheets.map((sh) => {
    const headerRow = sh.caption ? 2 : 1;
    const dataStart = headerRow + 1;
    const dataEnd = dataStart + sh.rows.length - 1;
    const colCount = sh.columns.length;

    const columns = sh.columns.map((c, ci) => {
      const vals = sh.rows.map((r) => r[ci]);
      const width = computeWidth(c.h, vals.filter((v) => typeof v !== 'object'));
      return {
        h: c.h, type: c.type,
        fmt: c.fmt || TYPE_FMT[c.type] || 'General',
        align: TYPE_ALIGN[c.type] || 'left',
        width,
        ...(c.formula ? { formula: c.formula } : {}),
      };
    });

    // formula 列：行值 → 公式串（{r} → 实际行号）
    const typedRows = sh.rows.map((r, ri) => {
      const rowNo = dataStart + ri;
      return r.map((v, ci) => {
        const col = sh.columns[ci];
        if (col && col.formula) return col.formula.replace(/\{r\}/g, String(rowNo));
        return v;
      });
    });

    // stats 行（真实公式）
    const statsRows = (sh.stats || []).map((st) => ({
      label: st.label,
      cells: Array.from({ length: colCount }, (_, ci) => {
        if (ci === 0) return st.label;
        if (!st.cols.includes(ci)) return null;
        const L = colLetter(ci);
        return `=${STATS_FNS[st.type]}(${L}${dataStart}:${L}${dataEnd})`;
      }),
    }));

    const lastRow = dataEnd + statsRows.length;
    const firstCol = colLetter(0);
    const lastCol = colLetter(colCount - 1);
    const ranges = {
      header: `A${headerRow}:${lastCol}${headerRow}`,
      data: `A${dataStart}:${lastCol}${dataEnd}`,
      full: `A${headerRow}:${lastCol}${lastRow}`,
    };

    const conditional = (sh.conditional || []).map((cd) => {
      const L = colLetter(cd.col);
      const ref = `${L}${dataStart}:${L}${dataEnd}`;
      let formula;
      if (cd.op === 'contains') formula = `ISNUMBER(SEARCH("${cd.value}",${L}${dataStart}))`;
      else formula = `${L}${dataStart}${{ gt: '>', lt: '<', ge: '>=', le: '<=', eq: '=', ne: '<>' }[cd.op]}${cd.value}`;
      return { ref, formula, style: COND_STYLES[cd.style] };
    });

    return {
      name: sh.name, caption: sh.caption || null,
      headerRow, dataStart, dataEnd, lastRow,
      columns, rows: typedRows, statsRows,
      ranges, conditional,
      zebra: sh.zebra, freeze: sh.freeze, autofilter: sh.autofilter,
      colCount, rowCount: sh.rows.length,
    };
  });

  return { theme: book.theme, themes: t, sheets, title: book.title };
}

module.exports = {
  THEMES, THEME_KEYS, TYPES, TYPE_FMT, TYPE_ALIGN,
  COND_OPS, COND_STYLES, STATS_FNS, CAPS, DEFAULT_SETTINGS, K,
  makeId, dispWidth, clampText, safeFileName, colLetter, computeWidth,
  decodeTableBytes, detectDelimiter, parseDSV, inferColumnType, coerceCell,
  ingestTable, normalizeBook, layout,
};
