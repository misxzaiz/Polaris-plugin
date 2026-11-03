'use strict';
/**
 * core.js —— 数据查询台纯逻辑层（服务/测试共用；零依赖、零 IO）
 *
 * 这里放所有"必须可单测"的规则：SQL 只读护（注释/字符串感知）、表名清洗、
 * 编码探测、导出路径护栏、结果表格渲染。
 * 引擎装配与 IO 一律在 engine.js / server.js，不进本文件。
 */

const VERSION = '0.1.0';
const MANIFEST_PORT = 9875;
const KV_META_KEY = 'dq.meta';

// 引擎钉版（2026-11-04 换底座 @duckdb/node-api，needs/013 实证：wasm dev 版重开持久化不可用）
// vendor 随包 win32-x64 binding，无下载链路；换版本必须同步 package.json 依赖与 vendor 拷贝
const NATIVE = {
  VERSION: '2.0.0-r.1',
  PLATFORM: 'win32-x64',
};

const LIMITS = {
  UPLOAD_BYTES: 8 * 1024 * 1024,          // /import/upload 原始字节上限
  PATH_IMPORT_BYTES: 512 * 1024 * 1024,   // 路径导入默认上限（服务可覆盖）
  QUERY_ROWS_DEFAULT: 500,
  QUERY_ROWS_MAX: 5000,
  PREVIEW_ROWS_MAX: 50,
  SQL_TEXT_MAX: 256 * 1024,
  EXPORT_FORMATS: ['csv', 'json', 'ndjson'],
  EXPORT_EXTS: ['.csv', '.json', '.ndjson', '.txt'],
};

// ── 字符串/注释感知扫描 ────────────────────────────────────────────────────
/**
 * 逐字符扫描 SQL，产出用于**护栏判断**的骨架：
 * - 单引号字符串字面量 → 占位 ''（内容不参与关键词判断，防误杀/防藏词）
 * - 双引号/反引号标识符 → 占位 ""（标识符内容不参与判断，合法列名如 "delete" 不误杀）
 * - -- 与 // 行注释、块注释 → 空格（注释里藏关键词无效）
 * 只用于 assertReadOnlySelect；执行仍用原始 SQL。
 */
function sqlSkeleton(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const c2 = i + 1 < n ? sql[i + 1] : '';
    if (c === "'" || c === '"' || c === '`') {
      const close = c === "'" ? "''" : '""';
      out += close;
      i += 1;
      while (i < n) {
        if (sql[i] === c && sql[i + 1] === c) { i += 2; continue; } // 转义（'' 或 ""）
        if (sql[i] === c) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if ((c === '-' && c2 === '-') || (c === '/' && c2 === '/')) {
      while (i < n && sql[i] !== '\n') i += 1;
      out += ' ';
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      out += ' ';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// 写/装载类关键词。语句级（INSERT/CREATE… 开头）已被 ^select|with 拦住，
// 这里拦的是"藏在 SELECT 主体里的调用"，如 SELECT copy(...)、duckdb 隐式写函数。
// 注意 keep：不含 comment/summarize/secret/use 等会被合法列名触发的词。
const FORBIDDEN_KEYWORDS = [
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'attach', 'detach',
  'copy', 'pragma', 'install', 'load', 'export', 'import', 'call',
  'set', 'reset', 'begin', 'commit', 'rollback', 'vacuum', 'checkpoint',
  'grant', 'revoke', 'merge', 'truncate',
];

/**
 * 只读 SELECT 护（/query 与 MCP dq_query 共用）。
 * 规则（docs §2.4-1）：剥注释后必须以 select/with 开头；单语句；
 * 字符串字面量与标识符之外不得出现写/装载类关键词。
 * 注：这是"防误操作/防越权写"护栏，不是安全沙箱——服务本身是同机进程。
 */
function assertReadOnlySelect(sql) {
  if (typeof sql !== 'string' || !sql.trim()) return { ok: false, error: 'SQL 为空' };
  if (sql.length > LIMITS.SQL_TEXT_MAX) return { ok: false, error: `SQL 过长（>${LIMITS.SQL_TEXT_MAX} 字节）` };
  const skeleton = sqlSkeleton(sql);
  const noTrailing = skeleton.trim().replace(/[;\s]+$/, '');
  if (/;\s*\S/.test(noTrailing)) {
    return { ok: false, error: '只允许单条语句（语句中间出现分号）' };
  }
  if (!/^(select|with)\b/i.test(noTrailing)) {
    return { ok: false, error: '只读查询必须以 SELECT 或 WITH 开头（导入/导出请走对应工具）' };
  }
  const lowered = ` ${noTrailing.toLowerCase()} `;
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`[^a-z0-9_]${kw}[^a-z0-9_]`, 'i');
    if (re.test(lowered)) return { ok: false, error: `只读查询禁止关键词：${kw.toUpperCase()}` };
  }
  return { ok: true, skeleton: noTrailing };
}

// ── 表名清洗 ───────────────────────────────────────────────────────────────
/**
 * 文件名主干 → 合法 SQL 标识符。
 * CJK 字符转 `u+码点`（订单 → u8ba2u5355）：保可辨识、防中文文件名塌缩成 table；
 * 其余非 [A-Za-z0-9_] 连续段归单下划线；数字开头加前缀；上限 60 字符。
 */
function sanitizeTableName(stem) {
  let s = String(stem || '').trim();
  s = s.replace(/[\u00a1-\uffff]/g, (ch) => `u${ch.codePointAt(0).toString(16).padStart(4, '0')}`)
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = 'table';
  if (/^[0-9]/.test(s)) s = `t_${s}`;
  if (s.length > 60) s = s.slice(0, 60).replace(/_+$/, '');
  if (!s) s = 'table';
  return s;
}

/** 注册表内查重：name → name_2 / name_3 …（大小写不敏感） */
function dedupeTableName(name, taken) {
  const lower = new Set((taken || []).map((t) => String(t).toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 2; i < 1000; i += 1) {
    const cand = `${name}_${i}`;
    if (!lower.has(cand.toLowerCase())) return cand;
  }
  return `${name}_${Date.now()}`;
}

// ── 编码探测 ───────────────────────────────────────────────────────────────
/** BOM 探测 → 严格 UTF-8 试解码（采样）→ GBK 试解码 → 回退 utf-8（后续解析显式报错） */
function detectEncoding(buf) {
  if (!buf || buf.length < 2) return { encoding: 'utf-8', bom: false };
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { encoding: 'utf-8', bom: true };
  if (buf[0] === 0xff && buf[1] === 0xfe) return { encoding: 'utf-16le', bom: true };
  if (buf[0] === 0xfe && buf[1] === 0xff) return { encoding: 'utf-16be', bom: true };
  const sample = buf.subarray(0, Math.min(buf.length, 256 * 1024));
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return { encoding: 'utf-8', bom: false };
  } catch (_) { /* 非严格 UTF-8，继续 */ }
  try {
    new TextDecoder('gbk', { fatal: true }).decode(sample);
    return { encoding: 'gbk', bom: false };
  } catch (_) { /* 非 GBK */ }
  return { encoding: 'utf-8', bom: false };
}

function makeTextDecoder(encoding) {
  if (encoding === 'utf-16le') return new TextDecoder('utf-16le');
  if (encoding === 'utf-16be') return new TextDecoder('utf-16be');
  if (encoding === 'gbk') return new TextDecoder('gbk'); // tiny-ICU Node 会抛 RangeError，由调用方引导
  return new TextDecoder('utf-8');
}

/** 扩展名 → 数据 kind；.txt 按首行是否含 \t 细分 tsv/csv */
function sniffKind(filename, sampleText) {
  const m = /\.([a-z0-9]+)$/i.exec(String(filename || '').trim());
  const ext = m ? m[1].toLowerCase() : '';
  if (ext === 'csv') return 'csv';
  if (ext === 'tsv' || ext === 'tab') return 'tsv';
  if (ext === 'txt') {
    const firstLine = String(sampleText || '').split(/\r?\n/, 1)[0] || '';
    return firstLine.indexOf('\t') >= 0 ? 'tsv' : 'csv';
  }
  if (ext === 'json') return 'json';
  if (ext === 'jsonl' || ext === 'ndjson') return 'jsonl';
  if (ext === 'parquet') return 'parquet';
  return null;
}

// ── 导出路径护栏 ───────────────────────────────────────────────────────────
/**
 * 导出路径校验（docs §2.4-3）。exists/isDir 由调用方注入，本函数保持纯逻辑。
 * 返回 { ok, error }。
 */
function exportPathGuard(p, { exists, isDir, protectedPaths } = {}) {
  if (typeof p !== 'string' || !p.trim()) return { ok: false, error: '导出路径为空' };
  const path = p.trim();
  if (!/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(path)) {
    return { ok: false, error: '必须是绝对路径（如 C:\\Users\\you\\Desktop\\out.csv）' };
  }
  const lower = path.toLowerCase();
  // 内部文件保护先行：workspace.duckdb 等内部路径在扩展名检查前就应明确拒绝
  for (const prot of protectedPaths || []) {
    if (lower === String(prot).toLowerCase()) return { ok: false, error: '不允许写入插件内部文件（工作区/引擎）' };
  }
  if (!LIMITS.EXPORT_EXTS.some((e) => lower.endsWith(e))) {
    return { ok: false, error: `扩展名必须是 ${LIMITS.EXPORT_FORMATS.join('/')}（或 .txt）` };
  }
  if (isDir(path)) return { ok: false, error: '目标已是目录' };
  if (exists(path)) return { ok: false, error: '文件已存在（默认拒绝覆盖；确认覆盖请带 overwrite:true）' };
  const parent = path.replace(/[\\/][^\\/]+$/, '');
  if (!parent || !exists(parent)) return { ok: false, error: `父目录不存在：${parent}` };
  if (!isDir(parent)) return { ok: false, error: `父路径不是目录：${parent}` };
  if (/^c:\\(windows|program files(\s\(x86\))?)\b/i.test(lower)) {
    return { ok: false, error: '拒绝写入系统目录' };
  }
  return { ok: true };
}

// ── 结果渲染 ───────────────────────────────────────────────────────────────
/** 单元格序列化：bigint → 数字串、null/undefined → NULL、对象 → JSON 串 */
function stringifyCell(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }
  return String(v);
}

/** 行集 → markdown 表（MCP 输出；行数与字节双上限，截断必须显式声明） */
function rowsToMarkdown(columns, rows, { maxRows = 60, maxBytes = 6000 } = {}) {
  if (!columns || !columns.length) return '（无列）';
  const header = `| ${columns.join(' | ')} |`;
  const sep = `|${columns.map(() => ' --- ').join('|')}|`;
  const lines = [header, sep];
  let bytes = header.length + sep.length;
  let shown = 0;
  let truncated = false;
  for (const row of rows) {
    if (shown >= maxRows) { truncated = true; break; }
    const cells = columns.map((c) => stringifyCell(row ? row[c] : ''));
    const line = `| ${cells.join(' | ')} |`;
    if (bytes + line.length > maxBytes) { truncated = true; break; }
    lines.push(line);
    bytes += line.length;
    shown += 1;
  }
  let out = lines.join('\n');
  if (truncated) out += `\n…（已截断：显示 ${shown}/${rows.length} 行，导出/调大 maxRows 可取全量）`;
  return out;
}

module.exports = {
  VERSION, MANIFEST_PORT, KV_META_KEY, NATIVE, LIMITS,
  sqlSkeleton, assertReadOnlySelect,
  sanitizeTableName, dedupeTableName,
  detectEncoding, makeTextDecoder, sniffKind,
  exportPathGuard, stringifyCell, rowsToMarkdown,
};
