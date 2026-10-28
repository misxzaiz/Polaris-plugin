'use strict';
/**
 * make-fixtures.mjs —— 生成仿真电子发票 fixture（测试专用，不进发布包）
 *
 * 为什么手写 PDF 而不用 pdf-lib：真实电子发票 PDF 用 Type0 CID 字体 + Identity-H
 * 编码 + ToUnicode CMap + FlateDecode 内容流，手写生成器可以精确复刻这条最难的
 * 解析路径（pdf-lib 标准字体只有 WinAnsi，写不了中文，反而是假捷径）。
 *
 * 结构：CID = Unicode BMP 码位（自映射），ToUnicode 做恒等映射，FontFile2 内嵌
 * 本机 C:\Windows\Fonts\simhei.ttf（仅生成期读取，不进 zip）。无该字体时生成
 * 无 FontFile2 的版本（pdfjs 仍可凭 ToUnicode 抽取）。
 *
 * 用法：node test/make-fixtures.mjs   → 在 test/fixtures/ 下产出 8 个文件
 */
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'fixtures');

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttc',
];

function loadFont() {
  for (const p of FONT_CANDIDATES) {
    try {
      if (existsSync(p)) return { bytes: readFileSync(p), name: path.basename(p).replace(/\.[^.]+$/, '') };
    } catch (_) { /* 下一个候选 */ }
  }
  return null;
}

/** 把字符串编码成 Identity-H 的十六进制 CID 串（CID=Unicode 码位，BMP） */
function toCidHex(text) {
  let out = '';
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) continue; // fixture 文本保证 BMP
    out += cp.toString(16).padStart(4, '0');
  }
  return out;
}

/** ToUnicode CMap：恒等映射（CID=Unicode），每块最多 100 条 bfchar */
function toUnicodeCmap(text) {
  const cps = new Set();
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xffff) cps.add(cp);
  }
  const list = Array.from(cps).sort((a, b) => a - b);
  let s = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Custom def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    s += chunk.length + ' beginbfchar\n';
    for (const cp of chunk) {
      const hex = cp.toString(16).padStart(4, '0');
      s += `<${hex}> <${hex}>\n`;
    }
    s += 'endbfchar\n';
  }
  s += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
  return Buffer.from(s, 'latin1');
}

/** 最小 PDF 写入器：单页，文本行 [{x, y, size, text}]（PDF 坐标，原点左下） */
let FIX_FONT = null;
function mkPdf(lines, opts = {}) {
  const font = opts.font || FIX_FONT;
  const contentLines = [];
  for (const l of lines) {
    const size = l.size || 10;
    contentLines.push(`BT /F1 ${size} Tf 1 0 0 1 ${l.x} ${l.y} Tm <${toCidHex(l.text)}> Tj ET`);
  }
  const contentZ = deflateSync(Buffer.from(contentLines.join('\n'), 'latin1'));
  const cmapZ = deflateSync(toUnicodeCmap(lines.map((l) => l.text).join('')));

  // 对象编号：1 catalog, 2 pages, 3 page, 4 type0, 5 cidfont, 6 descriptor, 7 content, 8 tounicode, [9 fontfile]
  const fontName = font ? font.name : 'Custom';
  const objs = [
    { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    { dict: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>' },
    { dict: `<< /Type /Font /Subtype /Type0 /BaseFont /${fontName} /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 8 0 R >>` },
    { dict: `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${fontName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 1000 /CIDToGIDMap /Identity >>` },
    { dict: `<< /Type /FontDescriptor /FontName /${fontName} /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 828 /Descent -238 /CapHeight 728 /StemV 50${font ? ' /FontFile2 9 0 R' : ''} >>` },
    { dict: `<< /Length ${contentZ.length} /Filter /FlateDecode >>`, stream: contentZ },
    { dict: `<< /Length ${cmapZ.length} /Filter /FlateDecode >>`, stream: cmapZ },
  ];
  if (font) objs.push({ dict: `<< /Length ${font.bytes.length} /Length1 ${font.bytes.length} >>`, stream: font.bytes });

  const chunks = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let len = chunks[0].length;
  const offsets = []; // offsets[对象号]
  for (let i = 0; i < objs.length; i++) {
    const objNo = i + 1;
    offsets[objNo] = len;
    const head = Buffer.from(`${objNo} 0 obj\n${objs[i].dict}\n`, 'latin1');
    chunks.push(head);
    len += head.length;
    if (objs[i].stream) {
      const s1 = Buffer.from('stream\n', 'latin1');
      const s2 = Buffer.from('\nendstream\n', 'latin1');
      chunks.push(s1, objs[i].stream, s2);
      len += s1.length + objs[i].stream.length + s2.length;
    }
    const tail = Buffer.from('endobj\n', 'latin1');
    chunks.push(tail);
    len += tail.length;
  }
  const xrefAt = len;
  const n = objs.length + 1; // 含 0 号对象
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

// ── 仿真版式 ────────────────────────────────────────────────────────────────

/** 数电普票（竖排买卖方信息块；标签与值分离 item 模拟真实字距） */
function shudianCommon() {
  const num = '24312000000123456789';
  const lines = [
    { x: 200, y: 790, size: 16, text: '电子发票（普通发票）' },
    { x: 60, y: 755, size: 10, text: '发票号码：' },
    { x: 130, y: 755, size: 10, text: num },
    { x: 340, y: 755, size: 10, text: '开票日期：' },
    { x: 410, y: 755, size: 10, text: '2026年10月15日' },
    { x: 60, y: 715, size: 11, text: '购买方信息' },
    { x: 60, y: 695, size: 10, text: '名称：' },
    { x: 110, y: 695, size: 10, text: '杭州某某网络科技有限公司' },
    { x: 60, y: 675, size: 10, text: '统一社会信用代码/纳税人识别号：' },
    { x: 230, y: 675, size: 10, text: '91330106MA27XW1234' },
    { x: 60, y: 640, size: 11, text: '销售方信息' },
    { x: 60, y: 620, size: 10, text: '名称：' },
    { x: 110, y: 620, size: 10, text: '杭州某某餐饮管理有限公司' },
    { x: 60, y: 600, size: 10, text: '统一社会信用代码/纳税人识别号：' },
    { x: 230, y: 600, size: 10, text: '91330105MA2ABCD1XY' },
    { x: 60, y: 560, size: 10, text: '项目名称' },
    { x: 300, y: 560, size: 10, text: '金额' },
    { x: 400, y: 560, size: 10, text: '税率' },
    { x: 480, y: 560, size: 10, text: '税额' },
    { x: 60, y: 535, size: 10, text: '*餐饮服务*午餐费' },
    { x: 300, y: 535, size: 10, text: '280.00' },
    { x: 400, y: 535, size: 10, text: '6%' },
    { x: 480, y: 535, size: 10, text: '16.80' },
    { x: 60, y: 490, size: 10, text: '合  计' },
    { x: 290, y: 490, size: 10, text: '¥280.00' },
    { x: 470, y: 490, size: 10, text: '¥16.80' },
    { x: 60, y: 450, size: 10, text: '价税合计（大写）贰佰玖拾陆圆捌角整（小写）¥296.80' },
    { x: 60, y: 380, size: 9, text: '收款人：管理员  复核：管理员  销售方（章）：杭州某某餐饮管理有限公司' },
  ];
  return { name: 'shudian-common.pdf', bytes: mkPdf(lines) };
}

/** 旧版增值税电子普通发票（买卖方双栏同行，货物或应税劳务表头，12 位代码+8 位号码） */
function oldECommon() {
  const lines = [
    { x: 180, y: 790, size: 16, text: '增值税电子普通发票' },
    { x: 60, y: 755, size: 10, text: '发票代码：044032000110' },
    { x: 260, y: 755, size: 10, text: '发票号码：' },
    { x: 330, y: 755, size: 10, text: '12345678' },
    { x: 420, y: 755, size: 10, text: '开票日期：2026年09月30日' },
    { x: 60, y: 720, size: 10, text: '购买方' },
    { x: 300, y: 720, size: 10, text: '销售方' },
    { x: 60, y: 700, size: 10, text: '名  称：杭州某某网络科技有限公司' },
    { x: 300, y: 700, size: 10, text: '名  称：上海某某软件技术有限公司' },
    { x: 60, y: 680, size: 10, text: '纳税人识别号：91330106MA27XW1234' },
    { x: 300, y: 680, size: 10, text: '纳税人识别号：91310000MA1FL8888X' },
    { x: 60, y: 640, size: 10, text: '货物或应税劳务、服务名称' },
    { x: 350, y: 640, size: 10, text: '金额' },
    { x: 450, y: 640, size: 10, text: '税额' },
    { x: 60, y: 615, size: 10, text: '*信息技术服务*软件开发服务费' },
    { x: 350, y: 615, size: 10, text: '5000.00' },
    { x: 450, y: 615, size: 10, text: '150.00' },
    { x: 60, y: 590, size: 10, text: '*办公用品*复印纸A4' },
    { x: 350, y: 590, size: 10, text: '100.00' },
    { x: 450, y: 590, size: 10, text: '13.00' },
    { x: 60, y: 550, size: 10, text: '合  计' },
    { x: 340, y: 550, size: 10, text: '¥5100.00' },
    { x: 440, y: 550, size: 10, text: '¥163.00' },
    { x: 60, y: 510, size: 10, text: '价税合计（大写）伍仟贰佰陆拾叁圆整（小写）¥5263.00' },
    { x: 60, y: 460, size: 9, text: '收款人：复核：开票人：管理员  销售方（章）：上海某某软件技术有限公司' },
  ];
  return { name: 'old-e-common.pdf', bytes: mkPdf(lines) };
}

/** 数电专票（含"专用"字样；规格/单位列更宽，测试行剥离） */
function shudianSpecial() {
  const num = '24122000000198765432';
  const lines = [
    { x: 200, y: 790, size: 16, text: '电子发票（增值税专用发票）' },
    { x: 60, y: 755, size: 10, text: '发票号码：' },
    { x: 130, y: 755, size: 10, text: num },
    { x: 340, y: 755, size: 10, text: '开票日期：' },
    { x: 410, y: 755, size: 10, text: '2026年10月01日' },
    { x: 60, y: 715, size: 11, text: '购买方信息' },
    { x: 60, y: 695, size: 10, text: '名称：' },
    { x: 110, y: 695, size: 10, text: '杭州某某网络科技有限公司' },
    { x: 60, y: 675, size: 10, text: '统一社会信用代码/纳税人识别号：' },
    { x: 230, y: 675, size: 10, text: '91330106MA27XW1234' },
    { x: 60, y: 640, size: 11, text: '销售方信息' },
    { x: 60, y: 620, size: 10, text: '名称：' },
    { x: 110, y: 620, size: 10, text: '深圳某某电子设备有限公司' },
    { x: 60, y: 600, size: 10, text: '统一社会信用代码/纳税人识别号：' },
    { x: 230, y: 600, size: 10, text: '91440300MA5ABCDE12' },
    { x: 60, y: 560, size: 10, text: '项目名称' },
    { x: 200, y: 560, size: 10, text: '规格型号' },
    { x: 300, y: 560, size: 10, text: '金额' },
    { x: 400, y: 560, size: 10, text: '税率' },
    { x: 480, y: 560, size: 10, text: '税额' },
    { x: 60, y: 535, size: 10, text: '*电子计算机*服务器' },
    { x: 200, y: 535, size: 10, text: 'X-2000型' },
    { x: 300, y: 535, size: 10, text: '10000.00' },
    { x: 400, y: 535, size: 10, text: '13%' },
    { x: 480, y: 535, size: 10, text: '1300.00' },
    { x: 60, y: 490, size: 10, text: '合  计' },
    { x: 290, y: 490, size: 10, text: '¥10000.00' },
    { x: 470, y: 490, size: 10, text: '¥1300.00' },
    { x: 60, y: 450, size: 10, text: '价税合计（大写）壹万壹仟叁佰圆整（小写）¥11300.00' },
  ];
  return { name: 'shudian-special.pdf', bytes: mkPdf(lines) };
}

/** 铁路电子客票（新版=数电格式；无销售方税号） */
function railTicket() {
  const num = '24319000000011234567';
  const lines = [
    { x: 180, y: 790, size: 16, text: '电子发票（铁路电子客票）' },
    { x: 60, y: 755, size: 10, text: '发票号码：' },
    { x: 130, y: 755, size: 10, text: num },
    { x: 340, y: 755, size: 10, text: '开票日期：' },
    { x: 410, y: 755, size: 10, text: '2026年10月20日' },
    { x: 60, y: 715, size: 11, text: '购买方信息' },
    { x: 60, y: 695, size: 10, text: '名称：' },
    { x: 110, y: 695, size: 10, text: '杭州某某网络科技有限公司' },
    { x: 60, y: 675, size: 10, text: '统一社会信用代码/纳税人识别号：' },
    { x: 230, y: 675, size: 10, text: '91330106MA27XW1234' },
    { x: 60, y: 560, size: 10, text: '项目名称' },
    { x: 300, y: 560, size: 10, text: '金额' },
    { x: 400, y: 560, size: 10, text: '税率' },
    { x: 480, y: 560, size: 10, text: '税额' },
    { x: 60, y: 535, size: 10, text: '*运输服务*杭州东-上海虹桥二等座' },
    { x: 300, y: 535, size: 10, text: '67.29' },
    { x: 400, y: 535, size: 10, text: '9%' },
    { x: 480, y: 535, size: 10, text: '6.06' },
    { x: 60, y: 490, size: 10, text: '合  计' },
    { x: 290, y: 490, size: 10, text: '¥67.29' },
    { x: 470, y: 490, size: 10, text: '¥6.06' },
    { x: 60, y: 450, size: 10, text: '价税合计（大写）柒拾叁圆叁角伍分（小写）¥73.35' },
  ];
  return { name: 'rail.pdf', bytes: mkPdf(lines) };
}

/** 航空行程单（无价税合计栏，走"合计"行；无买卖方名称行） */
function airItinerary() {
  const lines = [
    { x: 160, y: 790, size: 16, text: '航空运输电子客票行程单' },
    { x: 60, y: 750, size: 10, text: '旅客姓名：张三  身份证号：330106199001011234' },
    { x: 60, y: 720, size: 10, text: '电子客票号：999-2412345678' },
    { x: 340, y: 720, size: 10, text: '填开日期：2026-10-12' },
    { x: 60, y: 690, size: 10, text: '行程  2026-10-18  杭州HU7601Y  北京  800.00  50.00  120.00' },
    { x: 60, y: 640, size: 10, text: '合计  ¥970.00' },
    { x: 60, y: 600, size: 9, text: '销售单位：中国南方航空股份有限公司' },
  ];
  return { name: 'air.pdf', bytes: mkPdf(lines) };
}

/** 扫描件（无文字层）→ 必须报「没有可读的文字层」 */
function scanned() {
  return { name: 'scanned.pdf', bytes: mkPdf([]) };
}

/** 非发票 PDF（有文字层但无票据要素）→ 必须报读不出票据要素 */
function notInvoice() {
  const lines = [
    { x: 60, y: 790, size: 14, text: '购物清单' },
    { x: 60, y: 760, size: 10, text: '牛奶 x2  面包 x1  鸡蛋 x30' },
  ];
  return { name: 'not-invoice.pdf', bytes: mkPdf(lines) };
}

// ── 数电票 XML（两种标签风格 + GBK 编码变体）──────────────────────────────

function xmlOfficial() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ElecInvoice xmlns="http://www.chinatax.gov.cn/dfpv/schema/elecinvoice">
  <InvoiceNo>24312000000123456789</InvoiceNo>
  <IssueDate>2026-10-15</IssueDate>
  <InvoiceType>10</InvoiceType>
  <BuyerInfo>
    <BuyerName>杭州某某网络科技有限公司</BuyerName>
    <BuyerTaxId>91330106MA27XW1234</BuyerTaxId>
  </BuyerInfo>
  <SellerInfo>
    <SellerName>杭州某某餐饮管理有限公司</SellerName>
    <SellerTaxId>91330105MA2ABCD1XY</SellerTaxId>
  </SellerInfo>
  <GoodsInfo>
    <ItemName>*餐饮服务*午餐费</ItemName>
    <Amount>280.00</Amount>
  </GoodsInfo>
  <TotalTaxExclusiveAmount>280.00</TotalTaxExclusiveAmount>
  <TotalTaxAmount>16.80</TotalTaxAmount>
  <TotalTaxInclusiveAmount>296.80</TotalTaxInclusiveAmount>
</ElecInvoice>
`;
  return { name: 'shudian-common.xml', bytes: Buffer.from(xml, 'utf8') };
}

function xmlAltTags() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<发票>
  <发票号码>24312000000123456789</发票号码>
  <开票日期>2026年10月15日</开票日期>
  <购买方名称>杭州某某网络科技有限公司</购买方名称>
  <购买方纳税人识别号>91330106MA27XW1234</购买方纳税人识别号>
  <销售方名称>杭州某某餐饮管理有限公司</销售方名称>
  <销售方纳税人识别号>91330105MA2ABCD1XY</销售方纳税人识别号>
  <项目名称>*餐饮服务*午餐费</项目名称>
  <合计金额>280.00</合计金额>
  <税额>16.80</税额>
  <价税合计>296.80</价税合计>
</发票>
`;
  return { name: 'alt-tags.xml', bytes: Buffer.from(xml, 'utf8') };
}

function xmlGbkSource() {
  const xml = `<?xml version="1.0" encoding="GBK"?>
<发票>
  <发票号码>24312000000123456789</发票号码>
  <开票日期>2026-10-15</开票日期>
  <销售方名称>杭州某某餐饮管理有限公司</销售方名称>
  <价税合计>296.80</价税合计>
  <合计金额>280.00</合计金额>
  <税额>16.80</税额>
</发票>
`;
  return { name: 'gbk.xml', text: xml };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });
const font = loadFont();
FIX_FONT = process.argv.includes("--no-font") ? null : font;
const fixtures = [
  shudianCommon(), oldECommon(), shudianSpecial(), railTicket(), airItinerary(), scanned(), notInvoice(),
  xmlOfficial(), xmlAltTags(),
];
for (const f of fixtures) {
  writeFileSync(path.join(OUT, f.name), f.bytes);
  console.log('wrote', f.name, f.bytes.length, 'bytes', font ? '(font: ' + font.name + ')' : '(no CJK font: ToUnicode only)');
}
// GBK 变体：Node Buffer 不支持 gbk 编码（legacy encodings 已移除），经 PowerShell 代码页 936 转码
const gbk = xmlGbkSource();
const tmpUtf = path.join(OUT, 'gbk.utf8.tmp');
writeFileSync(tmpUtf, gbk.text, 'utf8');
const { execFileSync } = await import('node:child_process');
try {
  execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `$t = [System.IO.File]::ReadAllText('${tmpUtf.replace(/\//g, '\\')}', [System.Text.Encoding]::UTF8); ` +
    `[System.IO.File]::WriteAllBytes('${path.join(OUT, 'gbk.xml').replace(/\//g, '\\')}', [System.Text.Encoding]::GetEncoding(936).GetBytes($t))`,
  ], { stdio: 'pipe' });
  console.log('wrote gbk.xml (via PowerShell cp936)');
} catch (e) {
  console.log('WARN: GBK fixture 生成失败（非致命）:', String(e.message).slice(0, 200));
} finally {
  try { execFileSync('node', ['-e', `require('fs').unlinkSync(${JSON.stringify(tmpUtf)})`]); } catch (_) { /* 清理失败无害 */ }
}
if (!font) console.log('WARN: 未找到中文字体，PDF fixture 无内嵌字体（pdfjs 凭 ToUnicode 抽取，理论上可行）');
