'use strict';
/**
 * render.js —— 矩阵渲染层（service / MCP / 测试用；面板 SVG 预览由 service 返回）
 *
 *   - qrMatrix(text, ecl) → {size, modules}（qrcode 纯核心，无 canvas/pngjs 依赖）
 *   - svgFromMatrix(matrix, {margin, dark, light}) → SVG 字符串（形状渲染 shape-rendering=crispEdges）
 *   - pngFromMatrix(matrix, {margin, scale}) → PNG Buffer（pngjs）
 *   - textArt(matrix) → 终端块字符预览（██/空格），面板降级预览用
 */

const { create } = require('qrcode/lib/core/qrcode');
const { PNG } = require('pngjs');

const ECLS = ['L', 'M', 'Q', 'H'];

/** 生成模块矩阵。ecl ∈ L/M/Q/H（默认 M）；text 已由上层校验非空。 */
function qrMatrix(text, ecl) {
  const level = (ecl == null ? 'M' : String(ecl).toUpperCase());
  if (!ECLS.includes(level)) throw new Error(`纠错级别仅支持 L/M/Q/H，收到 ${level}`);
  const qr = create(text, { errorCorrectionLevel: level });
  return { size: qr.modules.size, data: qr.modules.data };
}

function darkAt(m, x, y) { return m.data[y * m.size + x]; }

/** SVG 字符串；margin 为模块数（默认 4，QR 规范建议静区 ≥4 模块）。 */
function svgFromMatrix(m, { margin = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const size = m.size;
  const total = size + margin * 2;
  const rects = [];
  let runStart = -1;
  for (let y = 0; y < size; y++) {
    runStart = -1;
    for (let x = 0; x <= size; x++) {
      const on = x < size && darkAt(m, x, y);
      if (on && runStart < 0) runStart = x;
      else if (!on && runStart >= 0) {
        rects.push(`<rect x="${runStart + margin}" y="${y + margin}" width="${x - runStart}" height="1"/>`);
        runStart = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<g fill="${dark}">${rects.join('')}</g></svg>`;
}

/** PNG Buffer；scale 为每模块像素（默认 8，总尺寸 = (size+2*margin)*scale）。 */
function pngFromMatrix(m, { margin = 4, scale = 8, dark = 0, light = 255 } = {}) {
  const size = m.size;
  const dim = (size + margin * 2) * scale;
  const png = new PNG({ width: dim, height: dim });
  // 整幅填浅色
  for (let i = 0; i < dim * dim; i++) {
    png.data[i * 4] = light; png.data[i * 4 + 1] = light; png.data[i * 4 + 2] = light; png.data[i * 4 + 3] = 255;
  }
  // 逐模块填深色（scale 块）
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      if (!darkAt(m, mx, my)) continue;
      for (let dy = 0; dy < scale; dy++) {
        const py = (my + margin) * scale + dy;
        for (let dx = 0; dx < scale; dx++) {
          const px = (mx + margin) * scale + dx;
          const idx = (py * dim + px) * 4;
          png.data[idx] = dark; png.data[idx + 1] = dark; png.data[idx + 2] = dark;
        }
      }
    }
  }
  return PNG.sync.write(png);
}

/** 终端/纯文本预览：██ 与 空格，含静区。 */
function textArt(m, { margin = 2 } = {}) {
  const lines = [];
  const blank = ' '.repeat(m.size + margin * 2);
  for (let i = 0; i < margin; i++) lines.push(blank);
  for (let y = 0; y < m.size; y++) {
    let line = '';
    for (let i = 0; i < margin; i++) line += ' ';
    for (let x = 0; x < m.size; x++) line += darkAt(m, x, y) ? '██' : '  ';
    for (let i = 0; i < margin; i++) line += ' ';
    lines.push(line);
  }
  for (let i = 0; i < margin; i++) lines.push(blank);
  return lines.join('\n');
}

module.exports = { qrMatrix, svgFromMatrix, pngFromMatrix, textArt, ECLS };
