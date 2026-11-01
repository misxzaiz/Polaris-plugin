#!/usr/bin/env node
/**
 * 生成扫描式 PDF 夹具（纯 Node，无依赖）：
 *   scan-dct.pdf    —— DCTDecode（JPEG）单页，即真实扫描仪最常见的编码
 *   scan-flate.pdf  —— FlateDecode RGB24 原始像素页
 *   scan-1bpp.pdf   —— FlateDecode 1bpp 打包位页（黑白传真扫描形态）
 *   scan-rot90.pdf  —— 横放图像 + /Rotate 90（旋转校正路径）
 *   native-text.pdf —— Helvetica 文本层页（文字层直读路径，不烧 OCR）
 *   mixed.pdf       —— 1 页文字层 + 1 页扫描（mixed 判定路径）
 *   corrupt.pdf     —— 非法字节（解析失败错误路径）
 * 夹具图片由 render-images.ps1 渲染并随仓库提交；本脚本可重复执行幂等重建。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const jpg = (name) => fs.readFileSync(path.join(dir, name));

/** 极简 PDF 构造：对象按序编号，xref 自动计算 */
function buildPdf(pages) {
  // pages: [{ width, height, rotate?, contentOps: string, imageObj?: {dict, stream: Buffer} , fontObj?: bool }]
  const objects = []; // 1-based；objects[i-1] = string|Buffer
  const add = (o) => (objects.push(o), objects.length); // 返回编号
  const catalogId = add('<< /Type /Catalog >>');
  const pagesId = add('<< /Type /Pages /Pages %PAGES% >>'); // 占位
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  let xobjCounter = 0;
  for (const p of pages) {
    let xobjRef = '';
    if (p.imageObj) {
      xobjCounter += 1;
      const xid = add([`<< /Type /XObject /Subtype /Image ${p.imageObj.dict} /Length ${p.imageObj.stream.length} >>\nstream\n`, p.imageObj.stream, '\nendstream']);
      xobjRef = `/XObject << /Im${xid} ${xid} 0 R >>`;
      p._drawImage = `q ${p.width} 0 0 ${p.height} 0 0 cm /Im${xid} Do Q`;
    }
    const res = `<< /Font << /F1 ${fontId} 0 R >>${xobjRef ? ` ${xobjRef}` : ''} >>`;
    const content = (p.imageObj ? p._drawImage + '\n' : '') + (p.contentOps || '');
    const cid = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const rot = p.rotate ? ` /Rotate ${p.rotate}` : '';
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${p.width} ${p.height}]${rot} /Resources ${res} /Contents ${cid} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  // 序列化
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  let pos = 9;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pos);
    const head = `${i + 1} 0 obj\n`;
    const tail = '\nendobj\n';
    chunks.push(head);
    pos += Buffer.byteLength(head);
    const o = objects[i];
    if (Array.isArray(o)) {
      for (const part of o) {
        chunks.push(part);
        pos += Buffer.isBuffer(part) ? part.length : Buffer.byteLength(part);
      }
    } else {
      chunks.push(o);
      pos += Buffer.byteLength(o);
    }
    chunks.push(tail);
    pos += Buffer.byteLength(tail);
  }
  const xrefPos = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(xref);
  return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))));
}

const imgDict = (w, h, cs, bpc, filter) => `/Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent ${bpc}${filter ? ` /Filter ${filter}` : ''}`;

// 1. DCTDecode 扫描页
{
  const buf = jpg('fixture-page.jpg');
  const pdf = buildPdf([{ width: 1000, height: 400, imageObj: { dict: imgDict(1000, 400, '/DeviceRGB', 8, '/DCTDecode'), stream: buf } }]);
  fs.writeFileSync(path.join(dir, 'scan-dct.pdf'), pdf);
}

// 2. FlateDecode RGB24：从 fixture-page.jpg 解码 JPEG？无解码器——改用 PNG 灰度像素。
//    这里用 fixture-gray.png（PowerShell 已渲染灰阶文本）；PNG 解码复用 pdfjs（引擎同款路径，
//    同时验证 pdfjs 也能解 PNG 页）。构造：灰度 PNG → pdfjs getTextContent? 不行，PNG 不是 PDF。
//    简化：fixture-gray.png 通过 PowerShell 输出原始像素到 fixture-gray.raw（800x260 RGB）。
//    若 raw 不存在则跳过该夹具（保持脚本幂等可用）。
const rawPath = path.join(dir, 'fixture-gray.raw');
if (fs.existsSync(rawPath)) {
  const raw = fs.readFileSync(rawPath); // RGB24 800x260
  const pdf = buildPdf([{ width: 800, height: 260, imageObj: { dict: `${imgDict(800, 260, '/DeviceRGB', 8, '/FlateDecode')}`, stream: zlib.deflateSync(raw) } }]);
  fs.writeFileSync(path.join(dir, 'scan-flate.pdf'), pdf);

  // 3. 1bpp：按阈值转打包位
  const w = 800, h = 260;
  const bits = Buffer.alloc(((w + 7) >> 3) * h, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const lum = 0.299 * raw[o] + 0.587 * raw[o + 1] + 0.114 * raw[o + 2];
      if (lum >= 128) bits[y * ((w + 7) >> 3) + (x >> 3)] |= 0x80 >> (x & 7); // 1=白
    }
  }
  const pdf1 = buildPdf([{ width: w, height: h, imageObj: { dict: `${imgDict(w, h, '/DeviceGray', 1, '/FlateDecode')}`, stream: zlib.deflateSync(bits) } }]);
  fs.writeFileSync(path.join(dir, 'scan-1bpp.pdf'), pdf1);
}

// 4. 旋转页：横放图像（文字已逆时针躺倒）+ /Rotate 90 + 竖版 MediaBox
{
  const buf = jpg('fixture-rot.jpg');
  // fixture-rot.jpg 是 300x900（已物理旋转）；页面竖版 300x900 + /Rotate 90 → 显示横版
  const pdf = buildPdf([{ width: 300, height: 900, rotate: 90, imageObj: { dict: imgDict(300, 900, '/DeviceRGB', 8, '/DCTDecode'), stream: buf } }]);
  fs.writeFileSync(path.join(dir, 'scan-rot90.pdf'), pdf);
}

// 5. 文字层直读页（Helvetica base-14，无需嵌入字体）
{
  const ops = ['BT /F1 24 Tf 72 700 Td (Hello Native Text Layer) Tj ET', 'BT /F1 18 Tf 72 650 Td (invoice total 12345) Tj ET'].join('\n');
  const pdf = buildPdf([{ width: 612, height: 792, contentOps: ops }]);
  fs.writeFileSync(path.join(dir, 'native-text.pdf'), pdf);
}

// 6. 混合：页1文字层（>30 字符触发 native 判定）+ 页2扫描
{
  const buf = jpg('fixture-page.jpg');
  const ops = 'BT /F1 20 Tf 72 700 Td (This native first page carries more than thirty characters of real text.) Tj ET';
  const pdf = buildPdf([
    { width: 612, height: 792, contentOps: ops },
    { width: 1000, height: 400, imageObj: { dict: imgDict(1000, 400, '/DeviceRGB', 8, '/DCTDecode'), stream: buf } },
  ]);
  fs.writeFileSync(path.join(dir, 'mixed.pdf'), pdf);
}

// 7. 损坏 PDF（错误路径）
fs.writeFileSync(path.join(dir, 'corrupt.pdf'), Buffer.from('%PDF-1.4\nnot a real pdf body'));

console.log('pdf fixtures generated');
