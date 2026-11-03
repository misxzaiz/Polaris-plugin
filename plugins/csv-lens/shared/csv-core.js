'use strict';
/**
 * CSV 检查台 core —— 纯函数核心（单一权威，零 require）
 *
 * 只用纯 JS 逻辑（无全局 API 依赖，浏览器与 Node 双端一致，可安全打进面板 bundle）。
 * 文件读取等 IO 能力收敛到 mcp/server.js 单侧。
 *
 * 四大能力：
 *   parseCsv        RFC 4180 容错状态机（引号内逗号/换行/""转义；裸引号/引号后尾随
 *                   字符等非标形态不中断解析、定位进 issues——「调试台」语义：
 *                   用户要的是哪坏了 + 能解析出什么，不是一句"解析失败"）
 *   diagnose        方言诊断（分隔符/引号风格/换行风格/列数漂移/BOM/EOF）
 *   inferColumns    逐列类型推断（int/float/bool/date/空/混合）+ 数字列统计
 *   convert/serialize  转 JSON/SQL/Markdown + RFC 规范化重序列化（round-trip 可断言）
 */

// ── 解析状态机 ──────────────────────────────────────────────────────────────

const DEFAULT_DELIMITER = ',';

/**
 * 引号感知的字符扫描：统计各候选分隔符在引号外出现次数。
 * 返回 { counts, detected }——detected 取最高计数且 >0 者，全 0 则回退逗号。
 */
function detectDelimiter(text) {
  const candidates = [',', ';', '\t', '|'];
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++; // "" 转义，跳过成对引号
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (counts[ch] !== undefined) counts[ch]++;
  }
  let best = null, bestCount = 0;
  for (const c of candidates) {
    if (counts[c] > bestCount) { best = c; bestCount = counts[c]; }
  }
  return { counts, detected: best || DEFAULT_DELIMITER };
}

/**
 * RFC 4180 容错解析主入口。
 * opts: { delimiter?: string }
 * 返回 {
 *   ok, rows: string[][], header: string[], delimiter,
 *   issues: [{ severity: 'error'|'warn'|'info', type, row?, field?, message }],
 *   stats: { dataRows, cols, quotedFields, emptyLines, hadBom, lineEndings: {crlf,lf,cr} }
 * }
 * 行号口径：header 是数据第 0 行；issue.row 指数据行（1-based，不含表头）。
 */
function parseCsv(text, opts) {
  if (typeof text !== 'string' || text.length === 0) {
    // 失败分支与成功分支同形（stats 空形状而非 null）：CJS allowJs 推断下双分支
    // 不对称会让 TS 收窄失效（cron-lens 实证坑），运行时零成本
    return {
      ok: false, error: '输入为空', rows: [], header: [], issues: [],
      stats: { dataRows: 0, cols: 0, quotedFields: null, emptyLines: 0, hadBom: false, lineEndings: { crlf: 0, lf: 0, cr: 0 }, totalLines: 0 },
      delimiter: opts && opts.delimiter || DEFAULT_DELIMITER, hasError: false,
    };
  }
  const delimiter = (opts && opts.delimiter) || DEFAULT_DELIMITER;
  const delimChar = delimiter.length === 1 ? delimiter : ',';
  const issues = [];
  const lineEndings = { crlf: 0, lf: 0, cr: 0 };

  let hadBom = false;
  let src = text;
  if (src.charCodeAt(0) === 0xFEFF) { hadBom = true; src = src.slice(1); }

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;      // 正处于引号字段内部
  let fieldQuoted = false;   // 当前字段以引号开头
  let afterQuoted = false;   // 已离开引号字段（其后只允许分隔符/换行）
  let fieldStartLine = 1;    // 字段起始行（未闭合引号定位用）
  let curLine = 1;

  const pushField = () => { row.push(field); field = ''; fieldQuoted = false; afterQuoted = false; };
  const pushRow = () => {
    pushField();
    // 纯空行（单空字段、无引号）跳过并计数——Excel/主流方言行为，如实报告
    if (row.length === 1 && row[0] === '' && !fieldQuoted) {
      issues.push({ severity: 'info', type: 'empty-line', line: curLine, message: `第 ${curLine} 行是空行，已跳过` });
    } else {
      rows.push(row);
    }
    row = [];
  };

  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // "" 转义
        inQuotes = false; afterQuoted = true; i++; continue;
      }
      if (ch === '\n') { curLine++; lineEndings.lf++; field += ch; i++; continue; } // 引号内换行是字面量
      if (ch === '\r') {
        // 引号内 \r：CRLF 则只计 CR+LF 一次的换行计数留给 \n；孤立 \r 是字面量
        field += ch; i++; continue;
      }
      field += ch; i++; continue;
    }
    // 引号外
    if (ch === '"') {
      if (afterQuoted) {
        issues.push({
          severity: 'error', type: 'trailing-after-quote', line: curLine, field: row.length,
          message: `第 ${curLine} 行第 ${row.length + 1} 个字段：引号闭合后又出现字符「"」（RFC 4180 不允许；这里保留原字符并报告）`,
        });
        field += '"'; afterQuoted = false; i++; continue;
      }
      if (field === '' && !fieldQuoted) { inQuotes = true; fieldQuoted = true; i++; continue; }
      // 裸字段中途出现引号
      issues.push({
        severity: 'error', type: 'bare-quote', line: curLine, field: row.length,
        message: `第 ${curLine} 行第 ${row.length + 1} 个字段：未加引号的字段内出现「"」（应成对转义或整字段加引号）`,
      });
      field += '"'; i++; continue;
    }
    if (afterQuoted && ch !== delimChar && ch !== '\r' && ch !== '\n') {
      // 引号闭合后又跟普通字符（如 "a"b 的 b）——同样非法，保留原字符并报告一次
      issues.push({
        severity: 'error', type: 'trailing-after-quote', line: curLine, field: row.length,
        message: `第 ${curLine} 行第 ${row.length + 1} 个字段：引号闭合后又出现字符「${ch}」（RFC 4180 不允许；这里保留原字符并报告）`,
      });
      afterQuoted = false;
    }
    if (ch === delimChar) { pushField(); i++; continue; }
    if (ch === '\r') {
      if (src[i + 1] === '\n') { lineEndings.crlf++; i += 2; }
      else { lineEndings.cr++; i++; }
      curLine++;
      pushRow();
      continue;
    }
    if (ch === '\n') { lineEndings.lf++; curLine++; pushRow(); i++; continue; }
    field += ch; i++; continue;
  }
  // EOF 收尾
  if (inQuotes) {
    issues.push({
      severity: 'error', type: 'unterminated-quote', line: fieldStartLine, field: row.length,
      message: `第 ${fieldStartLine} 行：引号字段未闭合，文件在引号内结束`,
    });
  }
  const trailingNoNewline = row.length > 0 || field !== '';
  if (trailingNoNewline) pushRow();
  if (trailingNoNewline && n > 0) {
    issues.push({ severity: 'info', type: 'no-trailing-newline', line: curLine, message: `末行无换行符（EOF 直接结束）——合法但跨工具易踩` });
  }

  if (hadBom) issues.push({ severity: 'info', type: 'bom', line: 1, message: '检测到 UTF-8 BOM（已剥离解析；Excel 导出常见，部分解析器会把 BOM 混进首列表头）' });
  const neTotal = lineEndings.crlf + lineEndings.lf + lineEndings.cr;
  if (lineEndings.crlf > 0 && lineEndings.lf > 0) {
    issues.push({ severity: 'warn', type: 'mixed-line-endings', line: 0, message: `换行风格混杂：CRLF×${lineEndings.crlf} 与裸 LF×${lineEndings.lf}（行号统计可能漂移）` });
  }

  const header = rows.length > 0 ? rows[0] : [];
  const headerLen = header.length;
  rows.forEach((r, idx) => {
    if (idx > 0 && r.length !== headerLen) {
      issues.push({
        severity: 'error', type: 'ragged-row', line: idx + 1,
        message: `数据第 ${idx} 行（文件约第 ${idx + 1} 行）：字段数 ${r.length} ≠ 表头 ${headerLen}`,
      });
    }
  });

  const quotedFields = src.includes('"') ? null : 0; // 精确计数在扫描时统计成本高，用存在性粗报
  const stats = {
    dataRows: Math.max(0, rows.length - 1),
    cols: headerLen,
    quotedFields,
    emptyLines: issues.filter((x) => x.type === 'empty-line').length,
    hadBom,
    lineEndings,
    totalLines: curLine,
  };
  const hasError = issues.some((x) => x.severity === 'error');
  return { ok: true, rows, header, delimiter: delimChar, issues, stats, hasError };
}

// ── 类型推断 ────────────────────────────────────────────────────────────────

const INT_RE = /^[+-]?\d+$/;
const FLOAT_RE = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)$|^[+-]?\d+\.\d+$|^[+-]?\.\d+$/;
const BOOL_SET = new Set(['true', 'false']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DATE_SLASH_RE = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

function classifyValue(v) {
  if (v === '') return 'empty';
  const t = v.trim();
  if (t === '') return 'empty';
  if (BOOL_SET.has(t.toLowerCase())) return 'bool';
  if (INT_RE.test(t)) return 'int';
  if (FLOAT_RE.test(t)) return 'float';
  if (DATE_RE.test(t) || DATE_SLASH_RE.test(t)) return 'date';
  return 'string';
}

/**
 * 逐列类型推断。rows 含表头行（rows[0]）。
 * 返回 { ok, columns: [{ name, index, inferred, distribution: {type:count}, empties, min?, max?, sum? }] }
 * inferred ∈ int/float/bool/date/string/mixed/empty；数字列附 min/max/sum。
 */
function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: '无数据行（先解析）', columns: [] };
  }
  const header = rows[0];
  const body = rows.slice(1);
  const nCols = header.length;
  const columns = [];
  for (let c = 0; c < nCols; c++) {
    const dist = {};
    let min = null, max = null, sum = 0, numeric = 0;
    for (let r = 1; r < rows.length; r++) {
      const v = rows[r][c] !== undefined ? rows[r][c] : '';
      const k = classifyValue(v);
      dist[k] = (dist[k] || 0) + 1;
      if (k === 'int' || k === 'float') {
        const num = Number(v.trim());
        numeric++;
        sum += num;
        if (min === null || num < min) min = num;
        if (max === null || num > max) max = num;
      }
    }
    const nonEmpty = Object.entries(dist).filter(([k]) => k !== 'empty');
    let inferred;
    if (nonEmpty.length === 0) inferred = 'empty';
    else if (nonEmpty.length === 1) inferred = nonEmpty[0][0];
    else {
      // int 与 float 同列 → float（数值列的合理归并）
      const kinds = nonEmpty.map(([k]) => k);
      if (kinds.every((k) => k === 'int' || k === 'float')) inferred = 'float';
      else inferred = 'mixed';
    }
    const col = {
      name: header[c] !== undefined ? header[c] : `列${c + 1}`,
      index: c,
      inferred,
      distribution: dist,
      empties: dist.empty || 0,
    };
    if (inferred === 'float' || inferred === 'int' || (inferred === 'mixed' && numeric > 0)) {
      col.min = min; col.max = max; col.sum = sum;
    }
    columns.push(col);
  }
  return { ok: true, columns };
}

// ── 转换 ────────────────────────────────────────────────────────────────────

/** 表头去重：重名第 n 次出现追加 _2/_3（如实标注） */
function dedupeHeader(header) {
  const seen = new Map();
  const out = [];
  const renamed = [];
  header.forEach((h, i) => {
    const base = h !== undefined && h !== '' ? h : `列${i + 1}`;
    const cnt = (seen.get(base) || 0) + 1;
    seen.set(base, cnt);
    if (cnt === 1) out.push(base);
    else { out.push(`${base}_${cnt}`); renamed.push({ index: i, from: base, to: `${base}_${cnt}` }); }
  });
  return { names: out, renamed };
}

function jsonEscape(s) {
  return JSON.stringify(s);
}

/**
 * rows → JSON 字符串。mode: 'records'（对象数组，表头为键）| 'rows'（二维数组）。
 * 返回 { ok, output, renamed }。
 */
function toJson(rows, mode) {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '无数据行（先解析）' };
  if (mode === 'rows') {
    return { ok: true, output: JSON.stringify(rows, null, 2), renamed: [] };
  }
  const { names, renamed } = dedupeHeader(rows[0]);
  const lines = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    for (let c = 0; c < names.length; c++) {
      obj[names[c]] = rows[r][c] !== undefined ? rows[r][c] : '';
    }
    lines.push('  ' + jsonEscape(obj).replace(/\n/g, '\n  '));
  }
  return { ok: true, output: '[\n' + lines.join(',\n') + '\n]', renamed };
}

/**
 * rows → SQL INSERT 语句。
 * opts: { tableName?: string }——数字/布尔列按推断裸值，其余加引号转义，空串→NULL。
 */
function toSql(rows, opts) {
  if (!Array.isArray(rows) || rows.length < 1) return { ok: false, error: '无数据行（先解析）' };
  const tableName = (opts && opts.tableName) || 'my_table';
  const { names } = dedupeHeader(rows[0]);
  const inferred = inferColumns(rows);
  const isNum = new Map();
  const isBool = new Map();
  inferred.columns.forEach((c) => { isNum.set(c.index, c.inferred === 'int' || c.inferred === 'float'); isBool.set(c.index, c.inferred === 'bool'); });
  const sqlVal = (v, c) => {
    if (v === undefined || v === '') return 'NULL';
    const t = v.trim();
    if (isBool.get(c) && BOOL_SET.has(t.toLowerCase())) return t.toLowerCase();
    if (isNum.get(c) && (INT_RE.test(t) || FLOAT_RE.test(t))) return t;
    return `'${v.replace(/'/g, "''")}'`;
  };
  const colList = names.map((n) => `"${String(n).replace(/"/g, '""')}"`).join(', ');
  const lines = [`INSERT INTO "${String(tableName).replace(/"/g, '""')}" (${colList}) VALUES`];
  for (let r = 1; r < rows.length; r++) {
    const vals = names.map((_, c) => sqlVal(rows[r][c], c)).join(', ');
    lines.push(`  (${vals})${r < rows.length - 1 ? ',' : ';'}`);
  }
  return { ok: true, output: lines.join('\n') };
}

/**
 * rows → Markdown 表格。单元格内 | 转义、换行折成空格（如实标注）。
 */
function toMarkdown(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '无数据行（先解析）' };
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, ' ');
  const { names } = dedupeHeader(rows[0]);
  const lines = [`| ${names.map(esc).join(' | ')} |`, `| ${names.map(() => '---').join(' | ')} |`];
  for (let r = 1; r < rows.length; r++) {
    lines.push(`| ${names.map((_, c) => esc(rows[r][c] !== undefined ? rows[r][c] : '')).join(' | ')} |`);
  }
  return { ok: true, output: lines.join('\n') };
}

// ── RFC 规范化重序列化 ──────────────────────────────────────────────────────

/**
 * rows → 规范 CSV（RFC 4180）：CRLF 换行、minimal 引号（含分隔符/引号/换行的字段才加引号）、
 * 引号内 " 转义为 ""。
 * 不变式：parseCsv(serialize(parseCsv(x)).output).rows 与 parseCsv(x).rows 字段矩阵相等。
 */
function serialize(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '无数据行' };
  const needQuote = (s) => /["\r\n,]/.test(s);
  const enc = (s) => {
    const v = s !== undefined && s !== null ? String(s) : '';
    return needQuote(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = rows.map((r) => r.map((v) => enc(v)).join(','));
  return { ok: true, output: lines.join('\r\n') + '\r\n' };
}

// ── 报告渲染（MCP 文本输出） ────────────────────────────────────────────────

function renderParseReport(r) {
  const lines = [];
  lines.push(`解析 OK：数据行 ${r.stats.dataRows}，列 ${r.stats.cols}，分隔符「${r.delimiter === '\t' ? '\\t' : r.delimiter}」`);
  const le = r.stats.lineEndings;
  const leStr = [`CRLF×${le.crlf}`, `LF×${le.lf}`, `CR×${le.cr}`].filter((s) => !s.endsWith('×0')).join(' + ');
  lines.push(`换行风格：${leStr || '无'}；空行 ${r.stats.emptyLines}；${r.stats.hadBom ? '有 BOM' : '无 BOM'}`);
  if (r.issues.length === 0) {
    lines.push('未发现结构问题（引号/换行/列数全部合规）');
    return lines.join('\n');
  }
  lines.push(`问题清单（${r.issues.length} 条）：`);
  for (const it of r.issues) {
    const tag = it.severity === 'error' ? '[错误]' : it.severity === 'warn' ? '[警告]' : '[提示]';
    lines.push(`  ${tag} ${it.message}`);
  }
  return lines.join('\n');
}

function renderInferReport(inf) {
  const lines = [`逐列类型推断（${inf.columns.length} 列）：`];
  for (const c of inf.columns) {
    const dist = Object.entries(c.distribution).map(([k, v]) => `${k}×${v}`).join(', ');
    let extra = '';
    if (c.min !== undefined && c.min !== null) extra = `；min=${c.min} max=${c.max} sum=${c.sum}`;
    lines.push(`  第 ${c.index + 1} 列「${c.name}」：${c.inferred}${extra}（${dist}）`);
  }
  return lines.join('\n');
}

module.exports = {
  DEFAULT_DELIMITER,
  detectDelimiter,
  parseCsv,
  classifyValue,
  inferColumns,
  dedupeHeader,
  toJson,
  toSql,
  toMarkdown,
  serialize,
  renderParseReport,
  renderInferReport,
};
