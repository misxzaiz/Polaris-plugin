'use strict';
/**
 * pixel.js —— 扫描 PDF 页面图像 → PNG 的纯 JS 像素管线（零原生依赖）
 *
 * pdfjs 的 paintImageXObject 解码产物是 {width, height, kind, data}：
 *   kind 1 = GRAYSCALE_1BPP（CCITT/JBIG2 传真扫描常见，按位打包）
 *   kind 2 = RGB_24BPP（DCTDecode/JPEG 扫描常见）
 *   kind 3 = RGBA_32BPP（带透明的合成图）
 * tesseract.js 在 Node 只认图像文件字节（png/jpg/bmp/...），因此把原始像素
 * 重新编码为 PNG（zlib deflate + 手写 crc32，Node 内置 zlib，零依赖）。
 *
 * 页面 /Rotate 90/270 时嵌入图像是未旋转的原始扫描方向，直接 OCR 会全错——
 * 在像素层做一次转置校正（宽高互换）。180° 对 OCR 无影响（tesseract 自检测）。
 */

const zlib = require('zlib');

// ── PNG 编码（RGBA → PNG 字节）──────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA 像素 → PNG Buffer。data: Uint8Array/Buffer（width*height*4） */
function rgbaToPng(data, width, height) {
  if (!(data instanceof Buffer)) data = Buffer.from(data);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width >>> 0, 0);
  ihdr.writeUInt32BE(height >>> 0, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── pdfjs kind → RGBA ───────────────────────────────────────────────────────

/** 1bpp 打包位（pdfjs GRAYSCALE_1BPP：1=黑? pdfjs 约定 0 位=黑即 0 值为黑……实际 pdfjs
 *  内部 1bpp 数据：bit=1 → 白(255)。按 pdfjs 源码 fillRgbjs 语义：0 → 0(黑)，1 → 255(白)。*/
function gray1bppToRgba(data, width, height) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  const rowBytes = (width + 7) >> 3;
  for (let y = 0; y < height; y++) {
    const rowOff = y * rowBytes;
    const dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      const bit = (data[rowOff + (x >> 3)] >> (7 - (x & 7))) & 1;
      const v = bit ? 255 : 0;
      const o = dst + x * 4;
      rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function rgb24ToRgba(data, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const n = width * height;
  for (let p = 0; p < n; p++) {
    rgba[p * 4] = data[p * 3];
    rgba[p * 4 + 1] = data[p * 3 + 1];
    rgba[p * 4 + 2] = data[p * 3 + 2];
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
}

function rgba32ToRgba(data, width, height) {
  return Buffer.from(data.buffer, data.byteOffset, width * height * 4);
}

/**
 * pdfjs 图像对象 → RGBA Buffer（不认识的 kind 返回 null，由上层报错）。
 * kind: 1=GRAYSCALE_1BPP 2=RGB_24BPP 3=RGBA_32BPP
 */
function pdfImageToRgba(img) {
  if (!img || !img.data || !img.width || !img.height) return null;
  const { width, height, kind } = img;
  if (width <= 0 || height <= 0) return null;
  if (kind === 1) return gray1bppToRgba(img.data, width, height);
  if (kind === 2) {
    if (img.data.length < width * height * 3) return null;
    return rgb24ToRgba(img.data, width, height);
  }
  if (kind === 3) {
    if (img.data.length < width * height * 4) return null;
    return rgba32ToRgba(img.data, width, height);
  }
  return null;
}

// ── 几何变换 ────────────────────────────────────────────────────────────────

/** 顺时针旋转 90°（宽高互换） */
function rotateCw90(rgba, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 目标图：新宽=height，新高=width；(x,y) → (height-1-y, x)
      const dst = ((x * height) + (height - 1 - y)) * 4;
      const src = (y * width + x) * 4;
      out[dst] = rgba[src]; out[dst + 1] = rgba[src + 1]; out[dst + 2] = rgba[src + 2]; out[dst + 3] = rgba[src + 3];
    }
  }
  return { data: out, width: height, height: width };
}

/**
 * 长边超过 maxEdge 时等比缩小（最近邻，OCR 前的内存护栏；短边不动）。
 * 返回 {data,width,height,scaled:boolean}
 */
function clampEdge(rgba, width, height, maxEdge) {
  if (width <= maxEdge && height <= maxEdge) return { data: rgba, width, height, scaled: false };
  const ratio = Math.min(maxEdge / width, maxEdge / height);
  const nw = Math.max(1, Math.floor(width * ratio));
  const nh = Math.max(1, Math.floor(height * ratio));
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(height - 1, Math.floor(y / ratio));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(width - 1, Math.floor(x / ratio));
      const dst = (y * nw + x) * 4;
      const src = (sy * width + sx) * 4;
      out[dst] = rgba[src]; out[dst + 1] = rgba[src + 1]; out[dst + 2] = rgba[src + 2]; out[dst + 3] = rgba[src + 3];
    }
  }
  return { data: out, width: nw, height: nh, scaled: true };
}

/** 依据页面 /Rotate 值决定需要的变换次数（90/270 → 1 次；180 → 0 次） */
function rotationsFor(pageRotate) {
  const r = ((Number(pageRotate) || 0) % 360 + 360) % 360;
  return r === 90 || r === 270 ? 1 : 0;
}

module.exports = { rgbaToPng, gray1bppToRgba, rgb24ToRgba, rgba32ToRgba, pdfImageToRgba, rotateCw90, clampEdge, rotationsFor, crc32 };
