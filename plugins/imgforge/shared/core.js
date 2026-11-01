'use strict';
/**
 * core.js —— 图片工坊（imgforge）三端同源纯函数层（面板/服务/MCP 共用，口径不漂移）
 *
 * 职责：格式识别（魔数）、EXIF GPS 检测（JPEG APP1 / PNG eXIf / WebP EXIF / 裸 TIFF）、
 *       管道与设置归一、输出命名（永不覆盖）、stem 消毒、路径护栏、字节格式化。
 * 纪律：本文件不 require 任何第三方依赖（node 内置以外），保持可在面板 bundle 中内联。
 */

// ── 格式常量 ─────────────────────────────────────────────────────────────────

/** 可扫描（识别）的扩展名 */
const SUPPORTED_SCAN_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif', '.svg'];
/** 变换目标格式（sharp 原生支持的编码器；bmp/svg 无编码器，不提供输出） */
const TRANSFORM_TARGETS = ['webp', 'jpeg', 'png', 'avif', 'tiff'];
/** 各目标格式默认质量 */
const DEFAULT_QUALITY = { webp: 82, jpeg: 82, png: 82, avif: 50, tiff: 82 };
/** 各目标格式对「目标体积二分」的支持（png 走 palette 质量二分；gif 不支持） */
const BISECTABLE = { webp: true, jpeg: true, avif: true, tiff: true, png: true };

function extToFormat(ext) {
  const e = String(ext || '').toLowerCase();
  return { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp', '.gif': 'gif', '.bmp': 'bmp', '.tif': 'tiff', '.tiff': 'tiff', '.avif': 'avif', '.svg': 'svg' }[e] || null;
}

function formatToExt(fmt) {
  return { webp: '.webp', jpeg: '.jpg', png: '.png', avif: '.avif', tiff: '.tiff', gif: '.gif' }[fmt] || null;
}

/**
 * 魔数识别（扩展名只是线索，内容才是真相）。
 * 返回 'jpeg'|'png'|'webp'|'gif'|'bmp'|'tiff'|'avif'|'svg'|null
 */
function imageKind(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  // RIFF....WEBP
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // GIF8
  if (bytes.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  // TIFF II*/MM*
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 0x2a)) return 'tiff';
  // AVIF/HEIC: ftyp box + brand
  if (bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (/^(avif|avis|heic|mif1|msf1)/.test(brand)) return 'avif';
  }
  // SVG: 前导空白后的 <?xml 或 <svg
  const head = bytes.toString('utf8', 0, Math.min(bytes.length, 256)).replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';
  return null;
}

// ── EXIF GPS 检测（隐私信号，best-effort：无法判定返回 null=未知） ──────────────

function leReaders(buf) {
  return { u16: (o) => buf.readUInt16LE(o), u32: (o) => buf.readUInt32LE(o) };
}
function beReaders(buf) {
  return { u16: (o) => buf.readUInt16BE(o), u32: (o) => buf.readUInt32BE(o) };
}

/**
 * 在 TIFF 缓冲中找 IFD0 的 GPS Info IFD（tag 0x8825）。
 * 有指针且 GPS IFD 条目数 > 0 → true；明确无 → false；解析不了 → null。
 */
function tiffHasGps(buf) {
  try {
    if (!buf || buf.length < 8) return null;
    const le = buf[0] === 0x49;
    if (!le && buf[0] !== 0x4d) return null;
    if (buf[1] !== buf[0]) return null;
    const { u16, u32 } = le ? leReaders(buf) : beReaders(buf);
    if (u16(2) !== 42) return null;
    const off0 = u32(4);
    if (off0 + 2 > buf.length) return null;
    const n = u16(off0);
    for (let i = 0; i < n; i++) {
      const e = off0 + 2 + i * 12;
      if (e + 12 > buf.length) return null;
      if (u16(e) === 0x8825) {
        const gpsOff = u32(e + 8);
        if (!gpsOff || gpsOff + 2 > buf.length) return false;
        return u16(gpsOff) > 0; // GPS IFD 有条目 → 含定位信息
      }
    }
    return false; // IFD0 无 GPS 指针（IFD1 缩略图不再跟进）
  } catch (_) {
    return null;
  }
}

/**
 * 读 IFD0 上的 ASCII 字段（Make 0x010F / Model 0x0110 / DateTime 0x0132 / Software 0x0131）。
 * 返回 { make?, model?, dateTime?, software? }（尽力而为，异常给空对象）。
 */
function tiffIfd0Ascii(buf) {
  const out = {};
  try {
    if (!buf || buf.length < 8) return out;
    const le = buf[0] === 0x49;
    if ((buf[0] !== 0x49 && buf[0] !== 0x4d) || buf[1] !== buf[0]) return out;
    const { u16, u32 } = le ? leReaders(buf) : beReaders(buf);
    if (u16(2) !== 42) return out;
    const off0 = u32(4);
    if (off0 + 2 > buf.length) return out;
    const n = u16(off0);
    const tags = { 0x010f: 'make', 0x0110: 'model', 0x0132: 'dateTime', 0x0131: 'software' };
    for (let i = 0; i < n; i++) {
      const e = off0 + 2 + i * 12;
      if (e + 12 > buf.length) break;
      const key = tags[u16(e)];
      if (!key) continue;
      const cnt = u32(e + 4);
      if (cnt <= 0 || cnt > 4096) continue;
      let voff = e + 8;
      if (cnt > 4) voff = u32(e + 8);
      if (voff + cnt > buf.length) continue;
      const s = buf.toString('latin1', voff, voff + cnt).replace(/\0+$/, '').trim();
      if (s) out[key] = s;
    }
  } catch (_) { /* 尽力而为 */ }
  return out;
}

/** JPEG APP1 Exif 段定位 → TIFF 缓冲（无则 null） */
function jpegExifTiff(buf) {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let o = 2;
    while (o + 4 <= buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
      if (marker === 0xda || marker === 0xd9) return null; // 进入像素数据/EOI，后面不再有 APP1
      const len = buf.readUInt16BE(o + 2);
      if (len < 2) return null;
      if (marker === 0xe1 && buf.toString('ascii', o + 4, o + 10) === 'Exif\0\0') {
        return buf.subarray(o + 10, o + 2 + len);
      }
      o += 2 + len;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** PNG eXIf chunk 定位 → TIFF 缓冲（无则 null；扫全 chunk 直到 IEND——eXIf 位置因写入器而异） */
function pngExifTiff(buf) {
  try {
    if (buf.length < 8) return null;
    let o = 8;
    for (let hops = 0; o + 8 <= buf.length && hops < 1024; hops++) {
      const len = buf.readUInt32BE(o);
      const type = buf.toString('ascii', o + 4, o + 8);
      if (type === 'eXIf') return buf.subarray(o + 8, Math.min(o + 8 + len, buf.length));
      if (type === 'IEND' || len > buf.length) return null; // IEND / 越界长度（长度读到截断区）
      o += 12 + len;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** WebP EXIF chunk 定位 → TIFF 缓冲（兼容 4 字节偏移前缀变体） */
function webpExifTiff(buf) {
  try {
    if (buf.length < 12) return null;
    let o = 12;
    while (o + 8 <= buf.length) {
      const fourcc = buf.toString('ascii', o, o + 4);
      const size = buf.readUInt32LE(o + 4);
      if (fourcc === 'EXIF') {
        let d = buf.subarray(o + 8, o + 8 + size);
        if (d.length >= 4 && d[0] !== 0x49 && d[0] !== 0x4d && d.length >= 8 && (d[4] === 0x49 || d[4] === 0x4d)) d = d.subarray(4);
        return d;
      }
      // EXIF chunk 在 WebP 里位于图像数据之后，继续向后扫（不因 VP8 提前放弃）
      o += 8 + size + (size % 2);
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * 图片字节 → { hasGps: boolean|null, exif: {make?,model?,dateTime?,software?} }
 * 覆盖 JPEG/PNG/WebP/裸 TIFF——这四种容器的 GPS 只可能经 EXIF 携带，
 * 无 EXIF 容器 = 无 GPS（自信 false）；AVIF/GIF/BMP/SVG → null（未知口径）。
 */
function exifOf(bytes) {
  const kind = imageKind(bytes);
  let tiff = null;
  if (kind === 'jpeg') tiff = jpegExifTiff(bytes);
  else if (kind === 'png') tiff = pngExifTiff(bytes);
  else if (kind === 'webp') tiff = webpExifTiff(bytes);
  else if (kind === 'tiff') tiff = bytes;
  if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp' && kind !== 'tiff') {
    return { hasGps: null, exif: {} };
  }
  if (!tiff) return { hasGps: false, exif: {} };
  return { hasGps: tiffHasGps(tiff), exif: tiffIfd0Ascii(tiff) };
}

// ── 设置与管道归一 ───────────────────────────────────────────────────────────

/**
 * 设置归一：{ outDir, concurrency, maxBatch, maxFileMB, historyCap }
 * 语义：outDir 空 = 自动派生（<输入目录>/imgforge-out/）；maxFileMB 单文件上限。
 */
function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const num = (v, d, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    outDir: typeof r.outDir === 'string' ? r.outDir.trim() : '',
    concurrency: num(r.concurrency, 3, 1, 8),
    maxBatch: num(r.maxBatch, 300, 1, 2000),
    maxFileMB: num(r.maxFileMB, 100, 1, 2048),
    historyCap: num(r.historyCap, 100, 10, 1000),
  };
}

/**
 * 管道归一（面板/ MCP 参数 → 引擎执行口径）。
 * format 'keep' 表示保持原格式（svg/bmp 等无编码器格式在引擎里给中文报错/降级说明）。
 */
function normalizePipeline(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const fmt = TRANSFORM_TARGETS.indexOf(r.format) >= 0 ? r.format : 'keep';
  const q = Math.round(Number(r.quality));
  const quality = Number.isFinite(q) ? Math.min(100, Math.max(1, q)) : null; // null=按格式默认
  const uintOpt = (v, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(max, n) : null;
  };
  const kb = uintOpt(r.targetKB, 512 * 1024);
  return {
    format: fmt,
    quality,
    maxWidth: uintOpt(r.maxWidth, 100000),
    maxHeight: uintOpt(r.maxHeight, 100000),
    targetKB: kb,
    stripMetadata: r.stripMetadata !== false, // 默认 true：隐私默认
  };
}

/** 格式显示名（驼峰规范写法） */
const FORMAT_DISPLAY = { webp: 'WebP', jpeg: 'JPEG', png: 'PNG', avif: 'AVIF', tiff: 'TIFF' };

/** 管道摘要（历史/报告用，一句话说清做了什么） */
function pipelineLabel(p) {
  const parts = [];
  parts.push(p.format === 'keep' ? '保持原格式' : '转 ' + (FORMAT_DISPLAY[p.format] || p.format.toUpperCase()));
  parts.push('质量 ' + (p.quality || DEFAULT_QUALITY[p.format] || 82));
  if (p.maxWidth) parts.push('宽≤' + p.maxWidth);
  if (p.maxHeight) parts.push('高≤' + p.maxHeight);
  if (p.targetKB) parts.push('目标 ' + p.targetKB + 'KB');
  parts.push(p.stripMetadata ? '剥 EXIF' : '保留 EXIF');
  return parts.join(' · ');
}

// ── 输出命名（永不覆盖）与消毒 ───────────────────────────────────────────────

/** 文件名 stem 消毒：去路径成分、Windows 保留名、非法字符、控制字符、尾部点空格 */
function sanitizeStem(name) {
  let stem = String(name || '');
  stem = stem.replace(/\\/g, '/').split('/').pop() || '';
  const dot = stem.lastIndexOf('.');
  if (dot > 0) stem = stem.slice(0, dot);
  else if (dot === 0) stem = '';
  stem = stem.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) stem = '_' + stem;
  return stem || 'image';
}

/**
 * 冲突回避命名：exists(dir/name) 时 name-2、name-3 递增（永不覆盖）。
 * @param existsFn {(p:string)=>boolean} 存在性判断（便于测试注入）
 */
function pickOutputName(dir, stem, ext, existsFn) {
  const clean = ext && ext.startsWith('.') ? ext.toLowerCase() : '.' + String(ext || 'bin');
  let p = pathJoin(dir, stem + clean);
  if (!existsFn(p)) return p;
  for (let i = 2; i < 100000; i++) {
    p = pathJoin(dir, stem + '-' + i + clean);
    if (!existsFn(p)) return p;
  }
  throw new Error('输出命名冲突无法回避：' + dir);
}

function pathJoin(dir, name) {
  const sep = dir.includes('\\') || /^[A-Za-z]:/.test(dir) ? '\\' : '/';
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + sep + name;
}

/** 绝对路径护栏：非绝对/带空字节 → 报错；返回 trim 后路径 */
function guardAbsolute(p, label) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('缺少' + label + '路径：请提供绝对路径（如 C:\\Users\\me\\Pictures）');
  const t = p.trim();
  if (t.indexOf('\0') >= 0) throw new Error(label + '路径含非法字符（空字节）');
  if (!/^[A-Za-z]:[\\/]/.test(t) && !t.startsWith('\\\\') && !t.startsWith('/')) {
    throw new Error(label + '路径必须是绝对路径（如 C:\\Users\\me\\Pictures），收到：' + t);
  }
  return t;
}

/** 字节格式化（1 位小数，中文习惯单位） */
function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '?';
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

module.exports = {
  SUPPORTED_SCAN_EXTS,
  TRANSFORM_TARGETS,
  DEFAULT_QUALITY,
  BISECTABLE,
  extToFormat,
  formatToExt,
  imageKind,
  exifOf,
  tiffHasGps,
  tiffIfd0Ascii,
  jpegExifTiff,
  pngExifTiff,
  webpExifTiff,
  normalizeSettings,
  normalizePipeline,
  pipelineLabel,
  sanitizeStem,
  pickOutputName,
  guardAbsolute,
  formatBytes,
};
