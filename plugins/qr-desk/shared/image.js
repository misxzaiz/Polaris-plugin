'use strict';
/**
 * image.js —— 解码输入层：PNG / JPEG 字节 → RGBA 像素（jsQR 直接可用）
 *
 * 安全护栏（解码对象是不可信文件）：
 *   - 魔数识别（PNG \x89PNG / JPEG \xFF\xD8\xFF），其余格式明确拒绝并给出原因。
 *   - 字节上限 10MB；解码后宽高上限 4096×4096（jsQR O(w·h)，防解压炸弹/内存放大）。
 *   - 纯 JS 解码（pngjs / jpeg-js），零原生依赖；解码失败返回结构化错误不抛穿。
 */

const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const jsQR = require('jsqr');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DIM = 4096;

function detectFormat(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

/** 字节 → RGBA {data(Uint8ClampedArray), width, height, format}；格式不符/超限抛 Error(user) */
function decodeImage(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) {
    const e = new Error('图像数据为空'); e.user = true; throw e;
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    const e = new Error(`图像超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 上限（收到 ${(buf.length / 1024 / 1024).toFixed(1)}MB）`);
    e.user = true; throw e;
  }
  const format = detectFormat(buf);
  if (!format) {
    const e = new Error('仅支持 PNG / JPEG 图片（GIF/WebP/HEIC 等请先转格式）；已按魔数识别失败');
    e.user = true; throw e;
  }
  let width, height, rgba;
  try {
    if (format === 'png') {
      const png = PNG.sync.read(buf);
      width = png.width; height = png.height; rgba = png.data;
    } else {
      // useTArray→Array；以 true 开启容忍截断（部分截图工具产出尾帧不完整）
      const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true });
      width = j.width; height = j.height; rgba = j.data;
    }
  } catch (err) {
    const e = new Error(`${format.toUpperCase()} 解码失败：${err && err.message ? err.message : '数据损坏'}`);
    e.user = true; throw e;
  }
  if (!width || !height) { const e = new Error('图像尺寸为 0'); e.user = true; throw e; }
  if (width > MAX_DIM || height > MAX_DIM) {
    const e = new Error(`图像尺寸 ${width}×${height} 超过 ${MAX_DIM}×${MAX_DIM} 上限，请缩小后重试`);
    e.user = true; throw e;
  }
  return { data: rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba), width, height, format };
}

/** RGBA → QR 解码结果；未找到返回 null（不抛），解析出的载荷由上层 inspect。 */
function decodeQrFromImage(buf) {
  const img = decodeImage(buf);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  if (!code) return { found: false, width: img.width, height: img.height, format: img.format };
  return {
    found: true,
    payload: code.data,
    format: img.format,
    width: img.width, height: img.height,
    // 码在图中的四角（原图坐标），供面板框选提示
    corners: code.location
      ? { topLeft: code.location.topLeftCorner, topRight: code.location.topRightCorner,
          bottomLeft: code.location.bottomLeftCorner, bottomRight: code.location.bottomRightCorner }
      : null,
  };
}

module.exports = { decodeImage, decodeQrFromImage, detectFormat, MAX_IMAGE_BYTES, MAX_DIM };
