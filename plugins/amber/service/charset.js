'use strict';
/**
 * charset.js —— 响应字节 → 字符串（网页封存服务专用）
 *
 * feed-radar 直接 Buffer.toString('utf8')，GBK 页面到手就是乱码——网页封存是收藏库，
 * 封错编码 = 永久乱码，必须把 legacy 编码读对。探测顺序：
 *   1. BOM（utf-8 / utf-16le / utf-16be）
 *   2. Content-Type 响应头的 charset=
 *   3. HTML 头部 <meta charset> / <meta http-equiv=Content-Type>（前 4KB 扫描）
 *   4. 默认 utf-8
 *
 * TextDecoder 标签按 WHATWG Encoding Standard 归一（gb2312/gbk → gb18030 解码器族；
 * 构造失败的标签一律回落 utf-8，绝不抛错）。
 */

/** 常见历史别名的最小归一表（其余标签原样交给 TextDecoder） */
const LABEL_ALIAS = {
  gb2312: 'gb18030',
  gbk: 'gb18030',
  gb_2312: 'gb18030',
  'x-gbk': 'gb18030',
  big5hkscs: 'big5-hkscs',
  'shift-jis': 'shift_jis',
  'shiftjs': 'shift_jis',
  'sjis': 'shift_jis',
  'cp932': 'shift_jis',
  'ms932': 'shift_jis',
  'euc-cn': 'gb18030',
  'csgb2312': 'gb18030',
  'ansi_x3.4-1968': 'windows-1252',
  'ascii': 'windows-1252',
  'latin1': 'windows-1252',
  'iso88591': 'windows-1252',
  'iso-8859-1': 'windows-1252',
  'utf8': 'utf-8',
  'utf16': 'utf-16le',
};

function normalizeLabel(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!s) return '';
  return LABEL_ALIAS[s] || s;
}

/** 从 Content-Type 头取 charset */
function charsetFromHeader(header) {
  const m = /charset\s*=\s*"?([A-Za-z0-9_\-.:]+)"?/i.exec(String(header || ''));
  return m ? m[1] : '';
}

/** 从 HTML 前 4KB 的 meta 声明取 charset（属性顺序两个方向都容） */
function charsetFromMeta(head) {
  const s = String(head || '').slice(0, 4096);
  let m = /<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_\-.:]+)/i.exec(s);
  if (m) return m[1];
  m = /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]+content\s*=\s*["']([^"']*)["']/i.exec(s)
    || /<meta[^>]+content\s*=\s*["']([^"']*charset[^"']*)["'][^>]*http-equiv\s*=\s*["']?content-type["']?/i.exec(s);
  if (m) return charsetFromHeader(m[1]);
  return '';
}

/**
 * 字节 → 文本。
 * @param {Buffer} buf 响应体
 * @param {string} contentType Content-Type 响应头（可空）
 * @returns {{ text: string, charset: string, declared: string }}
 *   charset=实际用于解码的标签；declared=探测到的声明（供调试/落库展示）
 */
function decodeBuffer(buf, contentType) {
  const body = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'utf8');
  if (!body.length) return { text: '', charset: 'utf-8', declared: '' };

  // 1) BOM 优先（BOM 是字节级自描述，压过一切声明）
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    return { text: body.subarray(3).toString('utf8'), charset: 'utf-8', declared: 'bom' };
  }
  if (body[0] === 0xff && body[1] === 0xfe) {
    return { text: body.subarray(2).toString('utf16le'), charset: 'utf-16le', declared: 'bom' };
  }
  if (body[0] === 0xfe && body[1] === 0xff) {
    // utf-16be 手工换序（Node 无原生 be 解码）
    const be = Buffer.from(body);
    be.swap16();
    return { text: be.subarray(2).toString('utf16le'), charset: 'utf-16be', declared: 'bom' };
  }

  // 2) 响应头声明 → 3) meta 声明
  const declared = charsetFromHeader(contentType) || charsetFromMeta(body.toString('latin1'));
  const label = normalizeLabel(declared);
  if (label && label !== 'utf-8') {
    try {
      const text = new TextDecoder(label, { fatal: false }).decode(body);
      return { text, charset: label, declared };
    } catch (_) { /* 未知标签回落 utf-8 */ }
  }
  return { text: body.toString('utf8'), charset: 'utf-8', declared: declared || '' };
}

module.exports = { decodeBuffer, charsetFromHeader, charsetFromMeta, normalizeLabel };
