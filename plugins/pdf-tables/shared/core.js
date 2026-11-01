'use strict';
/**
 * core.js —— 表格提取台（pdf-tables）纯函数核心（零依赖）
 *
 * 面板 / service / MCP 三方同源：CSV 转义、数值归一、单元格合并、
 * 输出命名、输入校验、设置归一化、人类可读格式化全部在这里，口径不漂移。
 *
 * 安全底线（三个「永不」）：
 *   永不覆盖已有文件（pickOutputName 冲突自动 -2/-3 递增）
 *   永不删除/修改输入（引擎只读输入、另存输出）
 *   输出名永不携带路径成分（sanitizeStem 消毒）
 */

// ── 输出命名 ────────────────────────────────────────────────────────────────

/** 去掉文件名里的 Windows 非法字符与路径成分，返回安全 stem（不含扩展名） */
function sanitizeStem(name) {
  const base = String(name == null ? '' : name).split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const cleaned = (stem.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'output');
  // Windows 保留设备名（即使带扩展名也无法作为文件名，如 CON.xlsx）
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) return '_' + cleaned;
  return cleaned;
}

/**
 * 生成不冲突的输出绝对路径：dir/stem[-N].ext，N 从 2 递增（永不覆盖）。
 * @param {string} dir 输出目录（绝对路径）
 * @param {string} stem 已消毒的文件主名
 * @param {string} ext 扩展名（带点，如 '.xlsx'）
 * @param {(p: string) => boolean} existsSync 存在性探测（注入便于测试）
 */
function pickOutputName(dir, stem, ext, existsSync) {
  const safeExt = ext && ext.charAt(0) === '.' ? ext : '.' + ext;
  let candidate = joinPath(dir, stem + safeExt);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = joinPath(dir, stem + '-' + n + safeExt);
    n++;
    if (n > 9999) throw new Error('输出命名冲突超过 9999 次：请清理输出目录');
  }
  return candidate;
}

/** 简单路径拼接（不依赖 path 模块，按目录内已有分隔符风格选择，面板 bundle 安全） */
function joinPath(dir, name) {
  const d = String(dir || '').replace(/[\\/]+$/, '');
  if (!d) return name;
  const sep = d.indexOf('\\') !== -1 ? '\\' : '/';
  return d + sep + name;
}

// ── 输入校验 ────────────────────────────────────────────────────────────────

/** PDF 魔数：头 1024 字节内含 %PDF-（容忍前导垃圾字节）。
 *  用字节模式搜索而非 indexOf(string)：引擎返回纯 Uint8Array 时
 *  其 indexOf 不接受字符串（Buffer 独有），曾致二次读取误判非 PDF。 */
function isPdfBytes(buf) {
  if (!buf || buf.length < 5) return false;
  const limit = Math.min(buf.length, 1024);
  for (let i = 0; i + 5 <= limit; i++) {
    if (buf[i] === 0x25 && buf[i + 1] === 0x50 && buf[i + 2] === 0x44 && buf[i + 3] === 0x46 && buf[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}

/**
 * 校验上传/传入的输入文件清单，返回消毒后的描述数组。
 * @param {{name:string,size:number}[]} files
 * @param {{maxBytes:number}} limits
 * @throws {Error} 任一文件非法即整单拒绝（中文错误）
 */
function validateInputs(files, limits) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('没有收到任何输入文件');
  }
  if (files.length > 50) throw new Error('一次最多处理 50 个文件，收到 ' + files.length + ' 个');
  let total = 0;
  return files.map((f, idx) => {
    if (!f || typeof f.name !== 'string' || !f.name.trim()) {
      throw new Error('第 ' + (idx + 1) + ' 个文件缺少文件名');
    }
    const size = Number(f.size);
    if (!Number.isFinite(size) || size < 0) throw new Error('文件 ' + f.name + ' 的大小非法');
    total += size;
    if (total > limits.maxBytes) {
      throw new Error('输入总大小 ' + formatBytes(total) + ' 超过上限 ' + formatBytes(limits.maxBytes) + '（可在面板设置调整）');
    }
    const stem = sanitizeStem(f.name);
    const ext = (String(f.name).split('.').pop() || '').toLowerCase();
    if (ext !== 'pdf') {
      throw new Error('文件 ' + f.name + ' 不是 PDF（只接受 .pdf）');
    }
    return { name: f.name, stem, ext, size, index: idx };
  });
}

// ── 设置归一化 ──────────────────────────────────────────────────────────────

function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const outDir = typeof r.outDir === 'string' ? r.outDir.trim() : '';
  let maxUploadMB = Number(r.maxUploadMB);
  if (!Number.isFinite(maxUploadMB)) maxUploadMB = 128;
  maxUploadMB = Math.min(1024, Math.max(1, Math.round(maxUploadMB)));
  let historyCap = Number(r.historyCap);
  if (!Number.isFinite(historyCap)) historyCap = 200;
  historyCap = Math.min(1000, Math.max(10, Math.round(historyCap)));
  const format = ['xlsx', 'csv', 'json', 'all'].indexOf(r.format) >= 0 ? r.format : 'xlsx';
  let mergePages = !!r.mergePages;
  if (r.mergePages === undefined) mergePages = true;
  return { outDir, maxUploadMB, historyCap, format, mergePages };
}

// ── 页码规格解析（与 zhifang 同口径）───────────────────────────────────────

/**
 * 解析页码规格为页号数组（1-based）。
 * @param {string|number|number[]} spec 如 '1-3,5' / 'all' / '3-end' / 2 / [3,1,2]
 * @param {number} pageCount 文档总页数（> 0）
 * @param {{mode?: 'ordered'|'set'}} opts set：排序去重（默认）；ordered：严格保序
 * @returns {number[]}
 * @throws {Error} 中文错误信息（非法输入直接报，不静默钳制）
 */
function parsePageSpec(spec, pageCount, opts) {
  const mode = (opts && opts.mode) || 'set';
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error('页码规格解析失败：文档页数必须是正整数，收到 ' + JSON.stringify(pageCount));
  }
  let tokens;
  if (spec === 'all' || spec === '全部') {
    tokens = Array.from({ length: pageCount }, (_, i) => i + 1);
  } else if (typeof spec === 'number') {
    tokens = [spec];
  } else if (Array.isArray(spec)) {
    const arr = spec.map((n) => {
      if (!Number.isInteger(n) || n < 1) {
        throw new Error('页码数组含非法项 ' + JSON.stringify(n) + '：页码从 1 开始');
      }
      return n;
    });
    return finalize(arr, pageCount, mode, '页码数组');
  } else if (typeof spec === 'string') {
    const s = spec.trim();
    if (!s) throw new Error('页码规格为空：请填写如 1-3,5 或 all');
    tokens = [];
    for (const rawPart of s.split(',')) {
      const part = rawPart.trim();
      if (!part) throw new Error('页码规格含空段：' + JSON.stringify(spec) + '（检查是否有多余逗号）');
      const m = part.match(/^(\d+)(?:\s*-\s*(\d+|end|末尾))?$/i);
      if (!m) {
        throw new Error('页码片段 ' + JSON.stringify(part) + ' 无法识别：支持 5、1-3、3-end、all');
      }
      const a = parseInt(m[1], 10);
      const bRaw = m[2];
      let b;
      let endKeyword = false;
      if (!bRaw) {
        b = a;
      } else if (bRaw.toLowerCase() === 'end' || bRaw === '末尾') {
        b = pageCount;
        endKeyword = true;
      } else {
        b = parseInt(bRaw, 10);
      }
      if (a > b) throw new Error('页码区间 ' + part + ' 起始页大于结束页');
      if (!endKeyword && b > pageCount) {
        throw new Error('页码超出范围：片段 ' + part + ' 的结束页 ' + b + ' 超过文档总页数 ' + pageCount);
      }
      for (let i = a; i <= b; i++) tokens.push(i);
    }
    return finalize(tokens, pageCount, mode, '页码规格');
  } else {
    throw new Error('页码规格类型不支持：' + typeof spec);
  }
  return finalize(tokens, pageCount, mode, '页码规格');
}

function finalize(tokens, pageCount, mode, label) {
  if (!tokens.length) throw new Error(label + '解析结果为空');
  for (const n of tokens) {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(label + '含非法页码 ' + JSON.stringify(n) + '：页码从 1 开始');
    }
    if (n > pageCount) {
      throw new Error(label + '页码 ' + n + ' 超出文档总页数 ' + pageCount);
    }
  }
  if (mode === 'ordered') {
    const seen = new Set();
    for (const n of tokens) {
      if (seen.has(n)) throw new Error(label + '页码 ' + n + ' 重复：重排模式下每页只能出现一次');
      seen.add(n);
    }
    return tokens.slice();
  }
  return Array.from(new Set(tokens)).sort((a, b) => a - b);
}

/** 把页号数组压成人类可读的紧凑形式：[1,2,3,7] → '1-3,7' */
function compactRanges(pages) {
  if (!Array.isArray(pages) || !pages.length) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) { prev = cur; continue; }
    parts.push(start === prev ? String(start) : start + '-' + prev);
    start = cur; prev = cur;
  }
  return parts.join(',');
}

// ── 表格数据口径（三方共用）────────────────────────────────────────────────

/**
 * 数值归一：把「1,234.56」「-12.00」「¥3,000」「(500)」形态解析为数值；
 * 其余（日期/摘要/混合）返回 null（保留原文，不猜）。
 *
 * ID 形态护栏：无小数点、无千分位分隔的 ≥11 位纯数字（手机号/账号/流水号）
 * 不判数值——写进 xlsx 会变科学计数法，展示即损坏。
 * @param {string} cell
 * @returns {number|null}
 */
function parseNumeric(cell) {
  if (typeof cell !== 'string') return null;
  let s = cell.trim();
  if (!s) return null;
  let neg = false;
  // 财务负数括号形态 (500) → -500
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) { neg = true; s = paren[1].trim(); }
  if (/^-/.test(s)) { neg = true; s = s.slice(1).trim(); }
  s = s.replace(/^[¥$€£￥]/, '').trim();
  if (!s) return null;
  const hadSeparator = /[,.]/.test(s);
  s = s.replace(/[, ]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const digits = s.replace('.', '');
  if (digits.length > 15) return null;
  if (!hadSeparator && digits.length >= 11) return null; // ID 形态：保留原文
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** RFC4180 CSV 单元格转义：含 引号/逗号/换行 即包裹并双写引号 */
function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** 二维网格 → CSV 文本（不含 BOM；调用方落盘时决定编码） */
function gridToCSV(rows) {
  return (rows || []).map((r) => (r || []).map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/** CSV 文件字节：UTF-8 + BOM（中文 Excel/WPS 双击打开不乱码） */
function csvBytes(rows) {
  return Buffer.from('\ufeff' + gridToCSV(rows), 'utf8');
}

/**
 * 规范化单元格文本：合并内部换行为空格、去首尾空白。
 * PDF 文本项自带换行碎片，网格单元格里不该再有换行。
 */
function cleanCell(v) {
  return String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * 判断两行表头是否同构（跨页续表去重判据）：
 * 去除全部空白后逐格相等，且列数一致。空表头（全空行）不算同构。
 * 跨页表头的内部空格数会漂移（「金 额」vs「金额」），故按无空白口径比较。
 */
function sameHeader(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return false;
  let nonEmpty = 0;
  for (let i = 0; i < a.length; i++) {
    const x = cleanCell(a[i]).replace(/\s+/g, '');
    const y = cleanCell(b[i]).replace(/\s+/g, '');
    if (x !== y) return false;
    if (x) nonEmpty++;
  }
  return nonEmpty > 0;
}

// ── 人类可读格式化 ──────────────────────────────────────────────────────────

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '?';
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
  return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

module.exports = {
  sanitizeStem,
  pickOutputName,
  joinPath,
  isPdfBytes,
  validateInputs,
  normalizeSettings,
  parsePageSpec,
  compactRanges,
  parseNumeric,
  csvEscape,
  gridToCSV,
  csvBytes,
  cleanCell,
  sameHeader,
  formatBytes,
};
