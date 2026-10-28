'use strict';
/**
 * engine.js —— 票匣解析引擎（service 与 MCP 共用的唯一实现）
 *
 * 职责：把一份电子发票文件（PDF / 数电票 XML）解析成 shared/core 可归一化的字段草稿。
 * 设计约束：
 *   - 全本地：vendor/pdfjs.min.js 抽取 PDF 文本层，零外网、零 OCR。
 *   - 解析失败永不抛给上层崩溃，统一返回 { ok:false, error } + 中文可操作原因；
 *     「是扫描件没有文字层」是明确告知的边界（票匣不做 OCR），引导手动录入。
 *   - 提取策略：标签锚定（发票号码/价税合计/开票日期…）优先，位置配对（买卖方
 *     名称与税号按出现顺序对齐）兜底；全文与去空白两种视图配合匹配。
 *   - 金额只取「确实读到的」，绝不编造：缺字段宁缺勿造，cross-check 不一致仅告警。
 *   - 调用方拿到 draft 后经 core.normalizeInvoice 归一化 + 判重，引擎不做 IO。
 */

const core = require('../shared/core.js');

// ── pdfjs 惰性加载（Node 缺 DOM 矢量类时 stub 消音，文本抽取不需要渲染）────

let pdfjsLib = null;
function getPdfjs() {
  if (!pdfjsLib) {
    if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix { };
    if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { };
    if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { };
    pdfjsLib = require('../vendor/pdfjs.min.js');
  }
  return pdfjsLib;
}

// ── PDF 文本层 → 行（坐标感知重建）────────────────────────────────────────

/**
 * 把 getTextContent 的 items 重建为视觉行：
 *   - 按 y（transform[5]）聚类成行（容差 = 行高 40%）；
 *   - 行内按 x 排序，相邻间距 ≤ max(1.2×字号, 2) 直接连写，否则补空格。
 * 直接连写是关键：中文发票的「发票号码：」与号码常是两个 item，连写后正则才能吃到。
 */
function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str) continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4];
    const y = tr[5];
    const h = Math.abs(tr[3]) || it.height || 10;
    let row = null;
    for (const r of rows) {
      if (Math.abs(r.y - y) <= Math.max(h * 0.4, 1.5)) { row = r; break; }
    }
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str: it.str, w: it.width || h * it.str.length, h });
  }
  rows.sort((a, b) => b.y - a.y);
  const lines = [];
  for (const r of rows) {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd = null;
    let prevH = 10;
    for (const p of r.parts) {
      if (prevEnd !== null) {
        const gap = p.x - prevEnd;
        if (gap > Math.max(prevH * 1.2, 2)) line += ' ';
      }
      line += p.str;
      prevEnd = p.x + (p.w || p.str.length * p.h);
      prevH = p.h;
    }
    const t = line.trim();
    if (t) lines.push(t);
  }
  return lines;
}

async function pdfLines(bytes, label) {
  const pdfjs = getPdfjs();
  let pdf;
  try {
    // new Uint8Array(u8) 是拷贝语义：pdfjs 可能 transfer 底层 buffer，不能让它碰调用方的原字节
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, useSystemFonts: true, isEvalSupported: false });
    pdf = await task.promise;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/password/i.test(msg)) throw new Error((label || '文件') + ' 是密码保护的 PDF：票匣不做破解，请先解除密码后再收');
    throw new Error((label || '文件') + ' 无法解析为 PDF：文件可能损坏或不是标准 PDF');
  }
  try {
    const all = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      for (const line of itemsToLines(tc.items)) all.push(line);
    }
    if (!all.length) {
      throw new Error((label || '文件') + ' 没有可读的文字层：它很可能是扫描件/图片型 PDF。票匣不做 OCR，请在票册手动录入这张票');
    }
    return all;
  } finally {
    try { pdf.destroy(); } catch (_) { /* 释放失败不影响结果 */ }
  }
}

// ── 提取辅助 ────────────────────────────────────────────────────────────────

const MONEY = '([0-9][0-9,]*(?:\\.[0-9]{2})?)';
const YUAN = '[¥￥]?\\s*' + MONEY;

function toNum(s) {
  const n = Number(String(s).replace(/,/g, ''));
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function moneyAfter(text, re) {
  const m = text.match(re);
  if (!m) return null;
  return toNum(m[1]);
}

/** 找名称行：排除「项目名称」「单位名称」表头；一行可能有多个「名称：」值（旧版票买卖方同行） */
function partyNamesFromLines(lines) {
  const out = [];
  for (const line of lines) {
    if (/项目名称|货物或应税劳务|规格型号|单位名称/.test(line)) continue;
    const re = /名\s{0,3}称\s*[:：]\s*/g;
    const marks = []; // 每个标签的 {labelStart, valueStart}
    let m;
    while ((m = re.exec(line)) !== null) {
      marks.push({ labelStart: m.index, valueStart: m.index + m[0].length });
    }
    if (!marks.length) continue;
    for (let i = 0; i < marks.length; i++) {
      // 值的边界 = 下一个「名称」标签的起点（不是值起点）或行尾
      const end = i + 1 < marks.length ? marks[i + 1].labelStart : line.length;
      const seg = line.slice(marks[i].valueStart, end);
      const v = seg.split(/\s{2,}|\s*销售方\s*|\s*购买方\s*/)[0].trim();
      if (v) out.push(v);
    }
  }
  return out;
}

function taxIdsFromLines(lines) {
  const out = [];
  const re = /(?:统一社会信用代码|纳税人识别号)\s*[:：/]?\s*([0-9A-Z]{15,20})/gi;
  for (const line of lines) {
    let m;
    const lre = new RegExp(re.source, 'gi');
    while ((m = lre.exec(line)) !== null) out.push(m[1]);
  }
  return out;
}

function detectKind(text) {
  const cond = text.replace(/\s+/g, '');
  const condHalf = cond.replace(/（/g, '(').replace(/）/g, ')');
  for (const [key, words] of core.KIND_KEYWORDS) {
    for (const w of words) {
      const wc = w.replace(/\s+/g, '');
      if (cond.indexOf(wc) !== -1 || condHalf.indexOf(wc.replace(/（/g, '(').replace(/）/g, ')')) !== -1) return key;
    }
  }
  return 'other';
}

// ── PDF 字段提取 ────────────────────────────────────────────────────────────

function extractFromLines(lines, label) {
  const warnings = [];
  const raw = lines.join('\n');
  const cond = raw.replace(/\s+/g, '');

  const fields = {
    title: '',
    kind: 'other',
    number: '',
    code: '',
    date: '',
    buyer: { name: '', taxId: '' },
    seller: { name: '', taxId: '' },
    items: [],
    amount: null,
    tax: null,
    total: null,
  };

  // 标题：第一行含「发票/客票/行程单」的行
  for (const line of lines) {
    if (/发票|客票|行程单/.test(line) && line.length <= 40) { fields.title = line.trim(); break; }
  }

  fields.kind = detectKind(raw);

  // 发票号码：标签锚定 → 宽松锚定 → 兜底 20 位独立数字串
  let m = cond.match(/发票号码[:：]?(\d{20})/);
  if (m) fields.number = m[1];
  if (!fields.number) {
    m = cond.match(/发票号码[:：]?(\d{8})/);
    if (m) fields.number = m[1];
  }
  if (!fields.number) {
    m = cond.match(/电子客票号[:：]?\s*([0-9]{3}[-－]?[0-9]{10})/);
    if (m) { fields.number = core.digitsOnly(m[1]); warnings.push('号码取自电子客票号（行程单版式）'); }
  }
  if (!fields.number) {
    m = cond.match(/(?<!\d)(\d{20})(?!\d)/);
    if (m && /发票|客票/.test(cond)) { fields.number = m[1]; warnings.push('发票号码未带标签，取自文中独立 20 位数字串——请核对'); }
  }

  // 发票代码（旧版票 12 位）
  m = cond.match(/发票代码[:：]?(\d{12})/);
  if (m) fields.code = m[1];

  // 开票日期
  m = cond.match(/开票日期[:：]?(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) m = cond.match(/(?:航班日期|乘车日期|填开日期)[:：]?(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const p = (x) => String(Number(x)).padStart(2, '0');
    fields.date = m[1] + '-' + p(m[2]) + '-' + p(m[3]);
  }

  // 买卖方：名称按出现顺序（购买方版式在前），税号同序对齐
  const names = partyNamesFromLines(lines);
  const taxIds = taxIdsFromLines(lines);
  if (names.length >= 1) fields.buyer.name = names[0].slice(0, 120);
  if (names.length >= 2) fields.seller.name = names[1].slice(0, 120);
  if (names.length > 2) warnings.push('识别到 ' + names.length + ' 个名称行，只取前两个（购买方/销售方）');
  if (taxIds.length >= 1) fields.buyer.taxId = taxIds[0];
  if (taxIds.length >= 2) fields.seller.taxId = taxIds[1];

  // 价税合计（小写）
  let total = moneyAfter(cond, new RegExp('价税合计.*?小写[）)]*\\s*' + YUAN));
  if (total === null) total = moneyAfter(cond, new RegExp('价税合计[^0-9¥￥]{0,20}' + YUAN));
  if (total === null) {
    // 行程单/客票没有「价税合计」：找「合计」行
    total = moneyAfter(cond, new RegExp('合计[^0-9¥￥]{0,12}' + YUAN));
    if (total !== null) warnings.push('合计金额取自「合计」行（本版式无价税合计栏）');
  }
  fields.total = total;

  // 金额与税额：合计行（不含「价税合计」）里按顺序取两个金额
  for (const line of lines) {
    if (/合\s*计/.test(line) && !/价税合计/.test(line)) {
      const nums = line.match(new RegExp('[¥￥]\\s*' + MONEY, 'g'));
      if (nums && nums.length >= 2) {
        fields.amount = toNum(nums[0]);
        fields.tax = toNum(nums[1]);
      } else if (nums && nums.length === 1) {
        fields.amount = toNum(nums[0]);
      }
      break;
    }
  }
  // 旧版票合计行金额可能不带 ¥：退而求其次取行尾数字对
  if (fields.amount === null) {
    for (const line of lines) {
      if (/^合\s*计/.test(line) && !/价税合计/.test(line)) {
        const nums = line.match(new RegExp(MONEY, 'g'));
        if (nums && nums.length >= 2) { fields.amount = toNum(nums[0]); fields.tax = toNum(nums[1]); }
        break;
      }
    }
  }

  // 项目行：表头（项目名称/货物或应税劳务）与合计行之间
  const startRe = /项目名称|货物或应税劳务|货物及劳务名称/;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) { start = i; continue; }
    if (start >= 0 && /^合\s*计/.test(lines[i])) { end = i; break; }
  }
  for (let i = start + 1; i < end && i < lines.length; i++) {
    let name = lines[i]
      .replace(new RegExp('[¥￥]\\s*' + MONEY, 'g'), '')
      .replace(/(\s+[0-9][0-9,.%¥￥]*)+\s*$/g, '') // 去行尾数量/单价/金额/税率数字列（品名含数字的从尾部剥离不受影响）
      .trim();
    name = name.split(/\s{2,}/)[0].trim();
    // 保留 *税收分类* 前缀（如 *运输服务*）：它是分类器的重要信号，也是票面真实内容
    if (!name || /^[0-9%.,\s]+$/.test(name)) continue;
    if (/^(税率|征收率|税额|金额|单价|数量)$/.test(name)) continue;
    if (fields.items.length < 30) fields.items.push({ name: name.slice(0, 120) });
  }

  // 一致性核验：金额+税额 与 价税合计 矛盾只告警不裁断
  if (fields.amount !== null && fields.tax !== null && fields.total !== null) {
    const sum = Math.round((fields.amount + fields.tax) * 100) / 100;
    if (Math.abs(sum - fields.total) > 0.05) {
      warnings.push('金额+税额（' + core.num2(sum) + '）与价税合计（' + core.num2(fields.total) + '）不一致，请人工核对');
    }
  }
  // 数电票号码必为 20 位：8 位号码且无代码 → 提示可疑
  if (fields.number && fields.number.length === 8 && !fields.code) {
    warnings.push('号码只有 8 位且未识别到发票代码（旧版票应有 12 位代码）——请人工核对');
  }
  if (!fields.number) warnings.push('未提取到发票号码');
  if (!fields.date) warnings.push('未提取到开票日期');
  if (!fields.seller.name) warnings.push('未提取到销售方名称');
  if (fields.total === null) warnings.push('未提取到价税合计');

  return { fields, warnings, cond };
}

// ── 数电票 XML ─────────────────────────────────────────────────────────────

/** 别名表：官方/常见导出工具的标签名（小写）；中文标签直接可做 XML 标签名 */
const XML_ALIASES = {
  number: ['invoiceno', 'invoicenumber', 'fphm', 'invoicenum', '发票号码'],
  code: ['invoicecode', 'fpdm', 'oldinvoicecode', '发票代码'],
  date: ['issuedate', 'invoicedate', 'kprq', 'billingdate', '开票日期'],
  buyerName: ['buyername', 'purchasername', 'gfmc', 'buyernamecn', '购买方名称'],
  buyerTaxId: ['buyertaxid', 'buyertaxno', 'purchasertaxid', 'gfsbh', 'buyertaxpayeridentificationno', '购买方税号', '购买方纳税人识别号'],
  sellerName: ['sellername', 'salename', 'xfmc', 'salesname', '销售方名称'],
  sellerTaxId: ['sellertaxid', 'sellertaxno', 'salertaxid', 'xfsbh', '销售方税号', '销售方纳税人识别号'],
  total: ['totaltaxinclusiveamount', 'totalpriceandtax', 'pricetaxtotal', 'totalamountwithtax', '价税合计', 'totalamount'],
  amount: ['totaltaxexclusiveamount', 'amountwithouttax', 'totalamountwithouttax', '合计金额', 'totalamount'],
  tax: ['totaltaxamount', 'totaltax', 'taxamount', 'tax', '税额合计', '税额'],
  kindFlag: ['invoicetype', 'invoicedatatype', 'fpzl', '发票种类'],
};

function decodeXmlBytes(bytes) {
  const head = bytes.slice(0, 200).toString('latin1');
  let enc = 'utf-8';
  const m = head.match(/encoding\s*=\s*["']([^"']+)["']/i);
  if (m && /gb2312|gbk|gb18030/i.test(m[1])) enc = m[1];
  try {
    return { text: new TextDecoder(enc).decode(bytes), enc };
  } catch (_) {
    return { text: bytes.toString('utf8'), enc: 'utf-8(fallback)' };
  }
}

function extractFromXml(text, label) {
  const warnings = [];
  // 标签抓表：小写键；同标签重复取第一个非空
  const tags = {};
  const re = /<([\w.\-:\u4e00-\u9fa5]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase().replace(/^.*:/, ''); // 去命名空间前缀
    const val = m[2].trim();
    if (!(key in tags) && val !== '') tags[key] = val;
  }

  const pick = (aliases) => {
    for (const a of aliases) {
      if (tags[a] !== undefined) return tags[a];
    }
    return '';
  };

  const fields = {
    title: pick(['invoicetitle', 'title', '标题']) || '',
    kind: 'other',
    number: core.digitsOnly(pick(XML_ALIASES.number)).slice(0, 30),
    code: core.digitsOnly(pick(XML_ALIASES.code)).slice(0, 20),
    date: '',
    buyer: { name: pick(XML_ALIASES.buyerName).slice(0, 120), taxId: core.digitsOnly(pick(XML_ALIASES.buyerTaxId)).toUpperCase().slice(0, 32) },
    seller: { name: pick(XML_ALIASES.sellerName).slice(0, 120), taxId: core.digitsOnly(pick(XML_ALIASES.sellerTaxId)).toUpperCase().slice(0, 32) },
    items: [],
    amount: toNum(pick(XML_ALIASES.amount)),
    tax: toNum(pick(XML_ALIASES.tax)),
    total: toNum(pick(XML_ALIASES.total)),
  };

  // 日期宽容：YYYY-MM-DD / YYYYMMDD / YYYY年M月D日
  const dateRaw = pick(XML_ALIASES.date);
  let dm = dateRaw.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!dm) dm = dateRaw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dm) {
    const p = (x) => String(Number(x)).padStart(2, '0');
    fields.date = dm[1] + '-' + p(dm[2]) + '-' + p(dm[3]);
  }

  // 种类：值或全文含「专用/普通」
  const kindRaw = pick(XML_ALIASES.kindFlag);
  const hay = (kindRaw + '|' + text.slice(0, 2000)).replace(/\s+/g, '');
  if (/专用/.test(hay)) fields.kind = 'dpt_special';
  else if (/普通/.test(hay)) fields.kind = 'dpt_common';

  // 项目块：<...Item...>/<...Goods...> 容器内的名称
  const blockRe = /<(\w*?(?:item|goods|product)\w*?)>([\s\S]*?)<\/\1>/gi;
  let bm;
  while ((bm = blockRe.exec(text)) !== null && fields.items.length < 30) {
    const inner = bm[2];
    const nm = inner.match(/<(?:[\w.:-]*?)?(?:itemname|goodsname|productname)[\w.:-]*>([^<]*)</i) ||
      inner.match(/<项目名称|名称>([^<]*)</i) ||
      inner.match(/<[\w.:-]*name[\w.:-]*>([^<]*)</i);
    const name = nm ? nm[1].replace(/^\*[^*]{0,20}\*/, '').trim() : '';
    if (name) {
      const it = { name: name.slice(0, 120) };
      const am = inner.match(/<(?:[\w.:-]*?)amount[\w.:-]*>([^<]*)</i);
      if (am && isFinite(Number(am[1]))) it.amount = Number(am[1]);
      fields.items.push(it);
    }
  }

  // 兜底：total 缺失但 amount+tax 齐全 → 算术合成（发票恒等式，注明来源）
  if (fields.total === null && fields.amount !== null && fields.tax !== null) {
    fields.total = Math.round((fields.amount + fields.tax) * 100) / 100;
    warnings.push('价税合计由 金额+税额 合成（XML 未含合计标签）');
  }
  // total 与 amount+tax 矛盾 → 告警
  if (fields.amount !== null && fields.tax !== null && fields.total !== null) {
    const sum = Math.round((fields.amount + fields.tax) * 100) / 100;
    if (Math.abs(sum - fields.total) > 0.05) {
      warnings.push('金额+税额（' + core.num2(sum) + '）与价税合计（' + core.num2(fields.total) + '）不一致，请人工核对');
    }
  }

  if (!fields.number) warnings.push('未提取到发票号码');
  if (!fields.date) warnings.push('未提取到开票日期');
  if (!fields.seller.name) warnings.push('未提取到销售方名称');
  if (fields.total === null) warnings.push('未提取到价税合计');

  return { fields, warnings };
}

// ── 统一入口 ────────────────────────────────────────────────────────────────

function sniffType(name, bytes) {
  const head = bytes.slice(0, 8).toString('latin1');
  if (head.startsWith('%PDF')) return 'pdf';
  if (head.startsWith('PK')) return 'zip'; // OFD/压缩包
  const lower = String(name || '').toLowerCase();
  if (head.trimStart().startsWith('<')) return 'xml';
  if (/\.(xml|pdf)$/.test(lower)) return lower.endsWith('.xml') ? 'xml' : 'pdf';
  return 'unknown';
}

/**
 * 解析一份发票文件。
 * @param {{name: string, bytes: Buffer}} input
 * @returns {Promise<{ok: boolean, draft?: object, warnings?: string[], error?: string, type?: string}>}
 *   draft 为 shared/core.normalizeInvoice 可接受的字段草稿（不含 id/source/sha）。
 */
async function parseAuto(input) {
  const label = input && input.name ? input.name : '文件';
  if (!input || !Buffer.isBuffer(input.bytes) || !input.bytes.length) {
    return { ok: false, error: label + ' 是空文件', type: 'unknown' };
  }
  const type = sniffType(input.name, input.bytes);
  try {
    if (type === 'pdf') {
      const lines = await pdfLines(input.bytes, label);
      const { fields, warnings } = extractFromLines(lines, label);
      if (fields.total === null && !fields.number) {
        return { ok: false, error: label + ' 读不出有效票据要素（无号码也无金额）——若为扫描件请手动录入', type, warnings };
      }
      return { ok: true, draft: fields, warnings, type };
    }
    if (type === 'xml') {
      const { text } = decodeXmlBytes(input.bytes);
      const { fields, warnings } = extractFromXml(text, label);
      if (fields.total === null && !fields.number) {
        return { ok: false, error: label + ' 里找不到发票号码与金额——可能不是数电票 XML 原件', type, warnings };
      }
      return { ok: true, draft: fields, warnings, type };
    }
    if (type === 'zip') {
      return { ok: false, error: label + ' 是压缩包（OFD 版式/zip）。票匣暂只支持 PDF 与 XML，请从税务局下载 PDF 或 XML 版式', type };
    }
    return { ok: false, error: label + ' 不是可识别的电子发票文件（需要 PDF 或 XML）', type };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), type };
  }
}

module.exports = {
  parseAuto,
  itemsToLines,
  extractFromLines,
  extractFromXml,
  sniffType,
  decodeXmlBytes,
};
