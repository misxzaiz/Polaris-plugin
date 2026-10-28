'use strict';
/**
 * extract.js —— 韦编文档文本提取器（零外部依赖；PDF 走 zhifang 同款 vendor/pdfjs）
 *
 * 输出统一为纯文本（供 tokenize）。所有提取器只读输入，永不修改源文件。
 *   - text 类：BOM 探测 → UTF-8 严格解码 → 失败回退 GBK（Windows 中文环境常见）；
 *     替换符/控制符比例过高判为二进制 → null（调用方跳过并计数）。
 *   - pdf：pdfjs 文字层（zhifang 验证过的 Node stub 消音套路）；无文字层/加密 → null + 原因。
 *   - docx：最小 zip 读取器（EOCD 扫描 + 中央目录 + zlib.inflateRaw）取
 *     word/document.xml 的 w:t/w:p；ZIP64 不支持（如实降级）。
 *   - html：script/style/注释剥离 → 块级标签转行 → 实体解码。
 */
const zlib = require('zlib');

// ── 文本类：编码探测 ──────────────────────────────────────────────────────────
let gbkDecoder = null;
function getGbk() {
  if (!gbkDecoder) {
    try { gbkDecoder = new TextDecoder('gbk'); } catch (_) { gbkDecoder = false; }
  }
  return gbkDecoder || null;
}

function looksBinary(s) {
  if (!s) return true;
  let bad = 0;
  const n = Math.min(s.length, 4096);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 0xFFFD || (c < 9) || (c > 13 && c < 32)) bad++;
  }
  return bad / n > 0.05;
}

/**
 * 文本类字节 → 字符串；判定为二进制返回 null（附 reason 由调用方计数）。
 */
function decodeText(buf) {
  if (!buf || buf.length === 0) return { text: '', reason: '' };
  // BOM
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return { text: buf.slice(3).toString('utf8'), reason: '' };
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(buf.slice(2)), reason: '' };
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(buf.slice(2)), reason: '' };
  }
  // UTF-8 严格优先
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { text, reason: '' };
  } catch (_) { /* 非 UTF-8，回落 */ }
  // 二进制快速通道：含 NUL 直接判废
  const probe = buf.length > 4096 ? buf.slice(0, 4096) : buf;
  if (probe.includes(0)) return { text: null, reason: 'binary' };
  const gbk = getGbk();
  if (gbk) {
    const text = gbk.decode(buf);
    if (looksBinary(text)) return { text: null, reason: 'binary' };
    return { text, reason: '' };
  }
  const text = buf.toString('utf8'); // 环境 GBK 不可用时尽力而为
  if (looksBinary(text)) return { text: null, reason: 'binary' };
  return { text, reason: 'encoding' };
}

// ── PDF ──────────────────────────────────────────────────────────────────────
let pdfjsLib = null;
function getPdfjs() {
  if (!pdfjsLib) {
    // pdfjs legacy 在 Node 缺 DOMMatrix/Path2D 时仅影响渲染（告警刷屏）；文本抽取不需要，stub 消音
    if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix { };
    if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { };
    if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { };
    pdfjsLib = require('../vendor/pdfjs.min.js');
  }
  return pdfjsLib;
}

function isPdfBytes(buf) {
  return buf && buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2D;
}

/** PDF → 文本；失败返回 {text:null, reason}（reason 供计数与面板口径） */
async function extractPdf(buf, maxTextBytes) {
  if (!isPdfBytes(buf)) return { text: null, reason: 'not-pdf' };
  let pdf;
  try {
    const pdfjs = getPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, useSystemFonts: true, isEvalSupported: false });
    pdf = await task.promise;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/password/i.test(msg)) return { text: null, reason: 'encrypted' };
    return { text: null, reason: 'broken' };
  }
  try {
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      let pageText = '';
      for (const item of tc.items) {
        if (typeof item.str !== 'string') continue;
        pageText += item.str;
        if (item.hasEOL) pageText += '\n';
      }
      if (pageText.trim()) text += '── 第 ' + n + ' 页 ──\n' + pageText.replace(/\n{3,}/g, '\n\n') + (pageText && !pageText.endsWith('\n') ? '\n' : '');
    }
    if (!text.trim()) return { text: null, reason: 'no-text-layer' };
    const cap = maxTextBytes || 2 * 1024 * 1024;
    if (text.length > cap) text = text.slice(0, cap);
    return { text, reason: '' };
  } catch (_) {
    return { text: null, reason: 'broken' };
  }
}

// ── docx：最小 zip 读取器 ────────────────────────────────────────────────────
function readU16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function readU32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }

/**
 * 从 zip 字节里按名字取一个成员（仅 store/deflate；ZIP64 不支持）。
 * 找不到/结构异常 → null。
 */
function zipReadEntry(buf, wantedName) {
  if (!buf || buf.length < 22) return null;
  // 找 EOCD（PK\x05\x06）：从尾部向前扫注释区上限 64KB+22
  let eocd = -1;
  const lo = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= lo; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  let count = readU16(buf, eocd + 10);
  let cdOff = readU32(buf, eocd + 16);
  if (cdOff === 0xFFFFFFFF) return null; // ZIP64
  const want = Buffer.from(wantedName, 'utf8');
  let p = cdOff;
  while (count-- > 0) {
    if (p + 46 > buf.length) return null;
    if (!(buf[p] === 0x50 && buf[p + 1] === 0x4B && buf[p + 2] === 0x01 && buf[p + 3] === 0x02)) return null;
    const method = readU16(buf, p + 10);
    const csize = readU32(buf, p + 20);
    const nameLen = readU16(buf, p + 28);
    const extraLen = readU16(buf, p + 30);
    const commentLen = readU16(buf, p + 32);
    const lho = readU32(buf, p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen);
    if (name.equals(want)) {
      if (lho + 30 > buf.length) return null;
      if (!(buf[lho] === 0x50 && buf[lho + 1] === 0x4B && buf[lho + 2] === 0x03 && buf[lho + 3] === 0x04)) return null;
      const lNameLen = readU16(buf, lho + 26);
      const lExtraLen = readU16(buf, lho + 28);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      if (dataStart + csize > buf.length) return null;
      const data = buf.slice(dataStart, dataStart + csize);
      if (method === 0) return data;
      if (method === 8) {
        try { return zlib.inflateRawSync(data); } catch (_) { return null; }
      }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', ldquo: '「', rdquo: '」' };

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; } })
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] !== undefined ? ENTITIES[name] : m);
}

/** docx → 段落文本（w:p 分段、w:t 取词、w:tab/w:br 转换） */
function extractDocx(buf, maxTextBytes) {
  const xml = zipReadEntry(buf, 'word/document.xml');
  if (!xml) return { text: null, reason: 'not-docx' };
  let out = '';
  try {
    const body = xml.toString('utf8');
    const paras = body.split(/<\/w:p>/);
    const parts = [];
    for (const para of paras) {
      const withBreaks = para
        .replace(/<w:tab\b[^>]*\/?>/g, '\t')
        .replace(/<w:br\b[^>]*\/?>/g, '\n');
      let line = '';
      for (const m of withBreaks.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) line += m[1];
      if (line.trim()) parts.push(decodeEntities(line));
    }
    out = parts.join('\n');
  } catch (_) {
    return { text: null, reason: 'broken' };
  }
  if (!out.trim()) return { text: null, reason: 'empty' };
  const cap = maxTextBytes || 2 * 1024 * 1024;
  if (out.length > cap) out = out.slice(0, cap);
  return { text: out, reason: '' };
}

// ── html ─────────────────────────────────────────────────────────────────────
const BLOCK_TAGS = /<\/?(?:p|div|section|article|header|footer|h[1-6]|li|tr|table|ul|ol|blockquote|pre|br|hr)\b[^>]*>/gi;

function extractHtml(raw, maxTextBytes) {
  let s = String(raw || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  if (!s) return { text: null, reason: 'empty' };
  const cap = maxTextBytes || 2 * 1024 * 1024;
  if (s.length > cap) s = s.slice(0, cap);
  return { text: s, reason: '' };
}

module.exports = { decodeText, looksBinary, extractPdf, extractDocx, extractHtml, zipReadEntry, decodeEntities, isPdfBytes };
