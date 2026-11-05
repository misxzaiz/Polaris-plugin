'use strict';
/**
 * generate.js —— 生成总入口（service 与 MCP 唯一权威实现；面板经 service 调用）
 *
 * generateOne(body)：
 *   body = { text? | template?, ecl?, margin?, scale?, save?: {outDir, fileName?, withSvg?} }
 *   → { payload, svg, pngBase64, textArt, meta:{modules,bytes,ecl,pixelSize}, savedTo? }
 *
 * 输出纪律：outDir 必须绝对路径；同名永不覆盖（-2 递增）；文件名清洗 Windows 非法字符。
 */

const fs = require('fs');
const path = require('path');
const core = require('./core.js');
const render = require('./render.js');

function uniquePath(dir, fileName) {
  const base = path.basename(String(fileName || 'qr.png'));
  let target = path.join(dir, base);
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  for (let i = 2; i < 1000; i++) {
    target = path.join(dir, `${stem}-${i}${ext}`);
    if (!fs.existsSync(target)) return target;
  }
  const e = new Error('目标目录同名文件过多（>999），请换目录'); e.user = true; throw e;
}

function generateOne(body) {
  const payload = body.text != null && body.text !== ''
    ? String(body.text)
    : core.buildPayload(body.template);
  if (!payload.length) { const e = new Error('载荷为空'); e.user = true; throw e; }
  const bytes = Buffer.byteLength(payload, 'utf8');
  if (bytes > core.MAX_QR_BYTES) {
    const e = new Error(`载荷 ${bytes} 字节超过 QR 容量上限 ${core.MAX_QR_BYTES}，请缩短内容`);
    e.user = true; throw e;
  }
  const ecl = body.ecl || 'M';
  const margin = Math.max(0, Math.min(10, Number(body.margin == null ? 4 : body.margin)));
  const scale = Math.max(2, Math.min(20, Number(body.scale == null ? 8 : body.scale)));
  const m = render.qrMatrix(payload, ecl);
  const svg = render.svgFromMatrix(m, { margin });
  const png = render.pngFromMatrix(m, { margin, scale });
  const out = {
    payload, svg,
    pngBase64: png.toString('base64'),
    textArt: render.textArt(m, { margin: 2 }),
    meta: { modules: m.size, bytes, ecl, pixelSize: (m.size + margin * 2) * scale },
  };
  if (body.save && body.save.outDir) {
    const dir = body.save.outDir;
    if (!path.isAbsolute(dir)) { const e = new Error(`outDir 必须是绝对路径，收到 ${dir}`); e.user = true; throw e; }
    if (dir.includes('\0')) { const e = new Error('outDir 含非法字符'); e.user = true; throw e; }
    fs.mkdirSync(dir, { recursive: true });
    const stem = String(body.save.fileName || 'qr').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'qr';
    const pngPath = uniquePath(dir, stem + '.png');
    fs.writeFileSync(pngPath, png);
    out.savedTo = [pngPath];
    if (body.save.withSvg) {
      const svgPath = uniquePath(dir, stem + '.svg');
      fs.writeFileSync(svgPath, svg, 'utf8');
      out.savedTo.push(svgPath);
    }
  }
  return out;
}

module.exports = { generateOne, uniquePath };
