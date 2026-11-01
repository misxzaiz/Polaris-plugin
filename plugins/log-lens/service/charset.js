'use strict';
/**
 * charset.js —— 日志字符集探测（零依赖）
 *
 * 顺序：BOM（UTF-8 / UTF-16LE）→ UTF-8 严格解码校验 → GBK 回退。
 * 背景：中文 Windows 上 PowerShell / 部分工具写日志不带 BOM 且用 GBK
 * （time-trail 实证坑），纯 UTF-8 解码会出现大量 U+FFFD 替换符；
 * Node 内置 TextDecoder 带 full-ICU 时支持 'gbk'。
 *
 * 返回 encoding 名（'utf8' | 'utf16le' | 'gbk'），供 reader 构造解码器与
 * 行分割策略（utf16le 的换行是两字节 0A 00，需按字节模式处理）。
 */

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];

function hasBom(buf, bom) {
  return buf.length >= bom.length && bom.every((b, i) => buf[i] === b);
}

const DECODER_LABELS = { utf8: 'utf-8', utf16le: 'utf-16le', gbk: 'gbk' };

function makeDecoder(encoding) {
  return new TextDecoder(DECODER_LABELS[encoding] || 'utf-8', { fatal: false });
}

/** 统计解码结果里的替换符比例（UTF-8 误读 GBK 的典型症状） */
function replacementRatio(text) {
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) n++;
  }
  return n / text.length;
}

function decodeSample(buf, encoding) {
  try {
    const dec = new TextDecoder(DECODER_LABELS[encoding] || 'utf-8', { fatal: false });
    return dec.decode(buf);
  } catch (_) {
    return null; // 编码不受支持（如 Node 无 full-ICU 时的 gbk）
  }
}

/**
 * 探测缓冲区（应为文件头部 ≤256KB 的原始字节）的编码。
 * 不确定时保守返回 'utf8'（大多数现代日志是 UTF-8）。
 */
function detectEncoding(buf) {
  if (!buf || buf.length === 0) return 'utf8';
  if (hasBom(buf, BOM_UTF8)) return 'utf8';
  if (hasBom(buf, BOM_UTF16LE)) return 'utf16le';
  // BOM 后去掉 BOM 字节再校验；无 BOM 则整段参与校验
  const sample = buf.length > 64 * 1024 ? buf.subarray(0, 64 * 1024) : buf;
  const utf8Text = decodeSample(sample, 'utf8');
  if (utf8Text !== null && replacementRatio(utf8Text) <= 0.02) return 'utf8';
  // UTF-8 失败 → 试 GBK（解码成功且替换符更少才采用）
  const gbkText = decodeSample(sample, 'gbk');
  if (gbkText !== null && replacementRatio(gbkText) < 0.05) {
    // GBK 解出大量控制字符也算失败（二进制误判）
    let ctrl = 0;
    for (let i = 0; i < gbkText.length; i++) {
      const c = gbkText.charCodeAt(i);
      if (c < 9 || (c > 13 && c < 32)) ctrl++;
    }
    if (ctrl / gbkText.length < 0.02) return 'gbk';
  }
  return 'utf8';
}

/** 按 encoding 构造 Buffer → string 解码函数（单行级解码，行边界由 reader 保证） */
function lineDecoder(encoding) {
  const dec = makeDecoder(encoding);
  return (buf) => dec.decode(buf);
}

module.exports = { detectEncoding, lineDecoder, replacementRatio };
