'use strict';
/**
 * pdf-engine.js —— PDF 工坊 PDF 操作引擎（service 与 MCP 共用的唯一实现）
 *
 * 设计约束：
 *   - 输入只读：所有 op 读内存字节 → 新建文档 → 返回输出字节缓冲；落盘由调用方
 *     （service/main.js 或 mcp/server.js）经 core.pickOutputName 决定（永不覆盖）。
 *   - 全本地：vendor/pdf-lib.min.js（结构操作）+ vendor/pdfjs.min.js（文本抽取），
 *     零外网请求、零原生依赖。
 *   - 加密/损坏文件：加载即失败，错误信息中文且可操作（不尝试破解）。
 *   - 明确不做：压缩（纯 JS 无法真实重压图片，不做假压缩）、OCR（扫描件无文字层时
 *     明示「需 OCR，本工具不做」）、密码去除。
 */
const core = require('../shared/core.js');

const PDFLib = require('../vendor/pdf-lib.min.js');
const { PDFDocument, degrees, StandardFonts } = PDFLib;

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

// ── 加载与校验 ──────────────────────────────────────────────────────────────

/** 读入并解析 PDF；加密/损坏给出中文可操作错误 */
async function loadPdf(bytes, label) {
  if (!core.isPdfBytes(bytes)) {
    throw new Error((label || '文件') + ' 不是 PDF（文件头缺少 %PDF- 标识）');
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/encrypt/i.test(msg)) {
      throw new Error((label || '文件') + ' 是密码保护的 PDF：本工具不支持加密文件（也不做破解），请先解除密码');
    }
    throw new Error((label || '文件') + ' 无法解析：文件可能损坏或不是标准 PDF');
  }
}

/** 校验输出角度参数并返回 0/90/180/270 */
function checkedAngle(angle) {
  return core.normalizeAngle(angle);
}

// ── 各操作（bytes 进、bytes 出）─────────────────────────────────────────────

/** info：结构信息（只读，无输出文件） */
async function opInfo(input) {
  const doc = await loadPdf(input.bytes, input.name);
  const pages = doc.getPageCount();
  const sizes = doc.getPages().slice(0, 5).map((p) => {
    const { width, height } = p.getSize();
    return Math.round(width) + 'x' + Math.round(height) + 'pt';
  });
  return {
    op: 'info',
    pages,
    outputs: [],
    info: {
      name: input.name,
      pages,
      pageSize: pages > 5 ? sizes.join(', ') + ' …（前 5 页）' : sizes.join(', '),
      encrypted: false,
      title: doc.getTitle() || '',
      author: doc.getAuthor() || '',
      subject: doc.getSubject() || '',
      creator: doc.getCreator() || '',
      producer: doc.getProducer() || '',
      createdAt: isoDate(doc.getCreationDate()),
      modifiedAt: isoDate(doc.getModificationDate()),
    },
  };
}

/** merge：按给定顺序合并为一份 */
async function opMerge(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new Error('合并至少需要 2 个 PDF 文件');
  }
  const out = await PDFDocument.create();
  for (const item of inputs) {
    const doc = await loadPdf(item.bytes, item.name);
    const copied = await out.copyPages(doc, doc.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  const bytes = await out.save({ useObjectStreams: true });
  return {
    op: 'merge',
    pages: out.getPageCount(),
    outputs: [{ name: core.sanitizeStem(inputs[0].name) + '-合并.pdf', bytes }],
  };
}

/** extract：按序抽取/重排页（ordered，允许 3,1,2 重排） */
async function opExtract(input, params) {
  const doc = await loadPdf(input.bytes, input.name);
  const pages = core.parsePageSpec(params.pages, doc.getPageCount(), { mode: 'ordered' });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, pages.map((n) => n - 1));
  copied.forEach((p) => out.addPage(p));
  // 新文档不携带原文档元数据：天然满足「去痕迹分享」
  const bytes = await out.save({ useObjectStreams: true });
  return {
    op: 'extract',
    pages: out.getPageCount(),
    outputs: [{ name: core.sanitizeStem(input.name) + '-p' + orderedRangeLabel(pages) + '.pdf', bytes }],
    note: '输出为新文档，不携带原文档的标题/作者等元数据',
  };
}

/** 抽页输出名：升序用紧凑区间（p2-5），重排序保留给定顺序（4,2 → p4,2，逗号合法且无区间歧义） */
function orderedRangeLabel(pages) {
  const ascending = pages.every((n, i) => i === 0 || n > pages[i - 1]);
  const label = ascending ? core.compactRanges(pages) : pages.join(',');
  return label.length > 60 ? label.slice(0, 57) + '…' : label;
}

/** split：按 every 页一份均分 */
async function opSplit(input, params) {
  const doc = await loadPdf(input.bytes, input.name);
  const total = doc.getPageCount();
  let every = Number(params.every);
  if (!Number.isInteger(every) || every < 1) {
    throw new Error('拆分间隔 every 必须是正整数（每几页一份），收到 ' + JSON.stringify(params.every));
  }
  if (every > total) {
    throw new Error('拆分间隔 ' + every + ' 大于文档总页数 ' + total + '，拆不出多份');
  }
  const partCount = Math.ceil(total / every);
  const pad = Math.max(2, String(partCount).length); // 至少两位：文件管理器里正确排序
  const stem = core.sanitizeStem(input.name);
  const outputs = [];
  for (let part = 0; part < partCount; part++) {
    const out = await PDFDocument.create();
    const from = part * every;
    const to = Math.min(from + every, total);
    const copied = await out.copyPages(doc, range(from, to - 1));
    copied.forEach((p) => out.addPage(p));
    const no = String(part + 1).padStart(pad, '0');
    outputs.push({ name: stem + '-part' + no + '-of-' + String(partCount).padStart(pad, '0') + '.pdf', bytes: await out.save({ useObjectStreams: true }) });
  }
  return { op: 'split', pages: total, outputs };
}

/** rotate：对选中页累计旋转 angle 度 */
async function opRotate(input, params) {
  const doc = await loadPdf(input.bytes, input.name);
  const pages = core.parsePageSpec(params.pages, doc.getPageCount(), { mode: 'set' });
  const angle = checkedAngle(params.angle);
  for (const n of pages) {
    const page = doc.getPage(n - 1);
    const cur = page.getRotation().angle || 0;
    page.setRotation(degrees((cur + angle) % 360));
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return {
    op: 'rotate',
    pages: doc.getPageCount(),
    outputs: [{ name: core.sanitizeStem(input.name) + '-旋转' + angle + '.pdf', bytes }],
    note: '已旋转第 ' + core.compactRanges(pages) + ' 页 ' + angle + ' 度',
  };
}

/** delete：删页（重建文档，避开原地删页的索引漂移） */
async function opDelete(input, params) {
  const doc = await loadPdf(input.bytes, input.name);
  const pages = core.parsePageSpec(params.pages, doc.getPageCount(), { mode: 'set' });
  const keep = [];
  const removed = new Set(pages);
  for (let i = 1; i <= doc.getPageCount(); i++) {
    if (!removed.has(i)) keep.push(i - 1);
  }
  if (!keep.length) throw new Error('不能删除全部页面');
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, keep);
  copied.forEach((p) => out.addPage(p));
  const bytes = await out.save({ useObjectStreams: true });
  return {
    op: 'delete',
    pages: out.getPageCount(),
    outputs: [{ name: core.sanitizeStem(input.name) + '-删' + pages.length + '页.pdf', bytes }],
    note: '已删除第 ' + core.compactRanges(pages) + ' 页，剩余 ' + keep.length + ' 页',
  };
}

/** images2pdf：jpg/png 依给定顺序合成一份 PDF（页尺寸=图片原始尺寸+边距） */
async function opImages2Pdf(inputs, params) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('没有收到任何图片');
  let margin = Number(params && params.margin);
  if (!Number.isFinite(margin)) margin = 0;
  if (margin < 0 || margin > 200) throw new Error('页边距 margin 需在 0-200pt 之间');
  const out = await PDFDocument.create();
  for (const item of inputs) {
    const kind = core.imageKind(item.bytes);
    if (kind === 'jpg') {
      const img = await out.embedJpg(item.bytes);
      const page = out.addPage([img.width + margin * 2, img.height + margin * 2]);
      page.drawImage(img, { x: margin, y: margin, width: img.width, height: img.height });
    } else if (kind === 'png') {
      const img = await out.embedPng(item.bytes);
      const page = out.addPage([img.width + margin * 2, img.height + margin * 2]);
      page.drawImage(img, { x: margin, y: margin, width: img.width, height: img.height });
    } else {
      throw new Error('文件 ' + item.name + ' 不是 JPG/PNG 图片（HEIC/WebP 等格式请先转换）');
    }
  }
  const bytes = await out.save({ useObjectStreams: true });
  return {
    op: 'images2pdf',
    pages: out.getPageCount(),
    outputs: [{ name: core.sanitizeStem(inputs[0].name) + '-图片转PDF.pdf', bytes }],
  };
}

/** text：抽取文字层（扫描件无文字层时明示，不做 OCR） */
async function opText(input, params) {
  const pdfjs = getPdfjs();
  // 先经 pdf-lib 校验（加密/损坏的报错口径与其它 op 一致）
  const doc = await loadPdf(input.bytes, input.name);
  const pages = core.parsePageSpec(params.pages || 'all', doc.getPageCount(), { mode: 'set' });
  let text = '';
  try {
    const task = pdfjs.getDocument({ data: new Uint8Array(input.bytes), verbosity: 0, useSystemFonts: true, isEvalSupported: false });
    const pdf = await task.promise;
    for (const n of pages) {
      if (n > pdf.numPages) continue;
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      let pageText = '';
      for (const item of tc.items) {
        if (typeof item.str !== 'string') continue;
        pageText += item.str;
        if (item.hasEOL) pageText += '\n';
      }
      text += (pages.length > 1 ? '── 第 ' + n + ' 页 ──\n' : '') + pageText.replace(/\n{3,}/g, '\n\n') + (pageText && !pageText.endsWith('\n') ? '\n' : '');
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/password/i.test(msg)) {
      throw new Error((input.name || '文件') + ' 是密码保护的 PDF：本工具不支持加密文件（也不做破解）');
    }
    throw new Error((input.name || '文件') + ' 文字抽取失败：文件可能损坏或使用了极旧的字型编码');
  }
  if (!text.trim()) {
    throw new Error((input.name || '文件') + ' 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）');
  }
  const maxChars = Number(params.maxChars) > 0 ? Number(params.maxChars) : 200000;
  const truncated = text.length > maxChars;
  return {
    op: 'text',
    pages: doc.getPageCount(),
    outputs: [],
    text: truncated ? text.slice(0, maxChars) : text,
    textTotalChars: text.length,
    truncated,
    note: truncated ? '文字超长已截断到 ' + maxChars + ' 字（完整 ' + text.length + ' 字，writeTxt 可落盘完整版）' : '',
  };
}

// ── 分发 ────────────────────────────────────────────────────────────────────

const PDF_OPS = new Set(['info', 'merge', 'extract', 'split', 'rotate', 'delete', 'text']);

/**
 * 统一入口：runOp(op, inputs, params)
 * @param {string} op info|merge|extract|split|rotate|delete|images2pdf|text
 * @param {{name:string, bytes:Buffer}[]} inputs
 * @param {object} params
 * @returns {{op, pages?, outputs:{name,bytes}[], info?, text?, note?, truncated?}}
 */
async function runOp(op, inputs, params) {
  const p = params && typeof params === 'object' ? params : {};
  try {
    if (op === 'images2pdf') return await opImages2Pdf(inputs, p);
    if (!PDF_OPS.has(op)) {
      throw new Error('未知操作 ' + JSON.stringify(op) + '：支持 info/merge/extract/split/rotate/delete/images2pdf/text');
    }
    const first = Array.isArray(inputs) ? inputs[0] : null;
    if (!first) throw new Error('没有收到任何输入文件');
    if (op === 'info') return await opInfo(first);
    if (op === 'merge') return await opMerge(inputs);
    if (op === 'extract') return await opExtract(first, p);
    if (op === 'split') return await opSplit(first, p);
    if (op === 'rotate') return await opRotate(first, p);
    if (op === 'delete') return await opDelete(first, p);
    return await opText(first, p);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (e && e.friendly) throw e;
    if (/[\u4e00-\u9fff]/.test(msg)) throw e; // 引擎/核心自身的中文业务错误原样透传
    // pdf-lib/pdfjs 的底层英文异常（含惰性代理在 load 之后才触发的 TypeError）统一
    // 收口为可操作中文错误——不带堆栈地暴露给 AI/面板毫无自纠价值
    const label = Array.isArray(inputs) && inputs[0] ? inputs[0].name + ' ' : '';
    throw new Error(label + '处理失败：文件可能损坏、加密或不是标准 PDF（' + msg.slice(0, 140) + '）');
  }
}

function range(a, b) {
  const r = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}

function isoDate(d) {
  try {
    if (!d) return '';
    const dt = typeof d === 'string' ? new Date(d) : d;
    return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 19).replace('T', ' ');
  } catch (_) {
    return '';
  }
}

module.exports = { runOp, loadPdf, PDF_OPS, StandardFonts, PDFDocument };
