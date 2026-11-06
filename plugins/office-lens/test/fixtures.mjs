/**
 * 测试夹具生成器：手写 OOXML zip（store + deflate 混合），确定性、无外部产物。
 * 这里构造的 zip 与 Word/Excel/PowerPoint 产出的结构一致（local header + central dir + EOCD）。
 */
import zlib from 'node:zlib';

// ── CRC32（夹具真实性：写入真实 CRC，虽然 reader 不校验）─────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 构建 zip。entries: [{name, data: string|Uint8Array, deflate?: boolean, declaredUncompressed?: number}]
 * declaredUncompressed 仅用于炸弹夹具：让中央目录谎报解压尺寸。
 */
export function buildZip(entries) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const method = e.deflate ? 8 : 0;
    const payload = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const declared = e.declaredUncompressed != null ? e.declaredUncompressed : raw.length;
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6); // utf8 名字
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0x21, 12); // date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(declared, 22);
    lh.writeUInt16LE(nameBytes.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBytes, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(declared, 24);
    ch.writeUInt16LE(nameBytes.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBytes);
    offset += lh.length + nameBytes.length + payload.length;
  }
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

const XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ── docx 夹具 ────────────────────────────────────────────────────────────

export function docxFixture() {
  const documentXml = XMLDECL + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>项目概述</w:t></w:r></w:p>
  <w:p><w:r><w:t>这是</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>加粗</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>斜体</w:t></w:r><w:r><w:rPr><w:strike/></w:rPr><w:t>删除线</w:t></w:r>普通文本。</w:p>
  <w:p><w:r><w:br/><w:t>换行后文本</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>中文样式二级标题</w:t></w:r></w:p>
  <w:p><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:r><w:t>直接大纲三级</w:t></w:r></w:p>
  <w:p><w:r><w:t>访问 </w:t></w:r><w:hyperlink r:id="rId5"><w:r><w:t>官方网站</w:t></w:r></w:hyperlink><w:r><w:t> 与 </w:t></w:r><w:hyperlink w:anchor="sec2"><w:r><w:t>内部锚点</w:t></w:r></w:hyperlink><w:r><w:t>。</w:t></w:r></w:p>
  <w:p><w:fldSimple w:instr=" TOC \\o &quot;1-3&quot; "><w:r><w:t>目录占位</w:t></w:r></w:fldSimple></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>第一项</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>第二项</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>子项甲</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>子项乙</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>第三项</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>无序甲</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>无序乙</w:t></w:r></w:p>
  <w:p><w:r><w:t>脚注参考</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r><w:r><w:t>继续正文</w:t></w:r></w:p>
  <w:p><w:r><w:drawing><wp:inline xmlns:wp="p"><a:graphic xmlns:a="g"><a:graphicData><pic:pic xmlns:pic="p"><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t>图后文字</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数量</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>备注</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>苹果</w:t></w:r></w:p></w:tc><w:tc gridSpan="2"><w:p><w:r><w:t>合并跨列内容</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>纵向</w:t></w:r></w:p></w:tc><w:tc><w:vMerge w:val="restart"/><w:p><w:r><w:t>主格</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>普通</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>续行</w:t></w:r></w:p></w:tc><w:tc><w:vMerge/><w:p><w:r><w:t>应隐藏</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>普通2</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
  <w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr><w:r><w:t>引用块内容</w:t></w:r></w:p>
  <w:p><w:r><w:t>结尾段落</w:t></w:r></w:p>
  <w:p/>
  <w:p/>
  <w:sectPr/>
</w:body>
</w:document>`;

  const stylesXml = XMLDECL + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
<w:style w:type="paragraph" w:styleId="a3"><w:name w:val="Normal"/></w:style>
</w:styles>`;

  const numberingXml = XMLDECL + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="10">
  <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:start w:val="1"/></w:lvl>
  <w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/><w:start w:val="1"/></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="11">
  <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="11"/></w:num>
</w:numbering>`;

  const relsXml = XMLDECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId5" Type="hyperlink" Target="https://example.com" TargetMode="External"/>
<Relationship Id="rId7" Type="image" Target="media/image1.png"/>
</Relationships>`;

  const footnotesXml = XMLDECL + `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:footnote w:id="-1"><w:p><w:r><w:t>分隔符</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="0"><w:p><w:r><w:t>续分隔符</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="2"><w:p><w:r><w:t>这是脚注正文内容。</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

  return buildZip([
    { name: '[Content_Types].xml', data: XMLDECL + '<Types/>' },
    { name: 'word/document.xml', data: documentXml, deflate: true },
    { name: 'word/styles.xml', data: stylesXml, deflate: true },
    { name: 'word/numbering.xml', data: numberingXml, deflate: true },
    { name: 'word/_rels/document.xml.rels', data: relsXml, deflate: true },
    { name: 'word/footnotes.xml', data: footnotesXml, deflate: true },
    { name: 'word/media/image1.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) },
  ]);
}

// ── xlsx 夹具 ────────────────────────────────────────────────────────────

export function xlsxFixture() {
  const workbookXml = XMLDECL + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<sheets>
  <sheet name="销售数据" sheetId="1" r:id="rId1"/>
  <sheet name="配置" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>`;
  const wbRels = XMLDECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="s" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="s" Target="worksheets/sheet2.xml"/>
</Relationships>`;
  const sharedStrings = XMLDECL + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3">
<si><t>产品名称</t></si>
<si><t>北上广深</t></si>
<si><r><t>富文本</t></r><r><t>拼接</t></r></si>
</sst>`;
  const styles = XMLDECL + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
  <numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>
  <numFmt numFmtId="165" formatCode="h:mm:ss AM/PM"/>
</numFmts>
<cellXfs count="4">
  <xf numFmtId="0"/>
  <xf numFmtId="14"/>
  <xf numFmtId="164"/>
  <xf numFmtId="165"/>
</cellXfs>
</styleSheet>`;
  // sheet1：
  //  A1 共享串 | B1 数字 | C1 日期(内置14) | D1 自定义日期 | E1 时间
  //  A2 行内串 | B2 布尔 | C2 错误 | D2 公式缓存 | E2 (空)
  //  A4 稀疏行 AA 列 | 富文本
  const sheet1 = XMLDECL + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:AA4"/>
<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
<sheetData>
  <row r="1">
    <c r="A1" t="s" s="0"><v>0</v></c>
    <c r="B1" s="0"><v>42.5</v></c>
    <c r="C1" s="1"><v>44927</v></c>
    <c r="D1" s="2"><v>44927</v></c>
    <c r="E1" s="3"><v>0.520833333</v></c>
  </row>
  <row r="2">
    <c r="A2" t="inlineStr"><is><t>行内字符串</t></is></c>
    <c r="B2" t="b"><v>1</v></c>
    <c r="C2" t="e"><v>#DIV/0!</v></c>
    <c r="D2"><f>SUM(B1:B1)</f><v>42.5</v></c>
  </row>
  <row r="4">
    <c r="AA4" t="s"><v>2</v></c>
    <c r="C4"><v>3.14</v></c>
  </row>
</sheetData>
</worksheet>`;
  const sheet2 = XMLDECL + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData>
</worksheet>`;
  return buildZip([
    { name: '[Content_Types].xml', data: XMLDECL + '<Types/>' },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    { name: 'xl/sharedStrings.xml', data: sharedStrings, deflate: true },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: sheet1, deflate: true },
    { name: 'xl/worksheets/sheet2.xml', data: sheet2 },
  ]);
}

// ── pptx 夹具 ────────────────────────────────────────────────────────────

export function pptxFixture() {
  const pres = XMLDECL + `<p:presentation xmlns:p="p" xmlns:r="r">
<p:sldIdLst>
  <p:sldId id="256" r:id="rId2"/>
  <p:sldId id="257" r:id="rId3"/>
</p:sldIdLst>
</p:presentation>`;
  const presRels = XMLDECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId2" Type="s" Target="slides/slide1.xml"/>
<Relationship Id="rId3" Type="s" Target="slides/slide2.xml"/>
</Relationships>`;
  const slide1 = XMLDECL + `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r">
<p:cSld>
  <p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>季度汇报</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
      <p:txBody>
        <a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>营收增长</a:t></a:r></a:p>
        <a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr><a:r><a:t>华北区</a:t></a:r></a:p>
        <a:p><a:pPr lvl="0"><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:t>下一步计划</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
    <p:graphicFrame>
      <a:graphic><a:graphicData><a:tbl>
        <a:tr><a:tc><p:txBody><a:p><a:r><a:t>指标</a:t></a:r></a:p></p:txBody></a:tc><a:tc><p:txBody><a:p><a:r><a:t>数值</a:t></a:r></a:p></p:txBody></a:tc></a:tr>
        <a:tr><a:tc><p:txBody><a:p><a:r><a:t>GTV</a:t></a:r></a:p></p:txBody></a:tc><a:tc gridSpan="1"><p:txBody><a:p><a:r><a:t>1200 万</a:t></a:r></a:p></p:txBody></a:tc></a:tr>
      </a:tbl></a:graphicData></a:graphic>
    </p:graphicFrame>
    <p:pic><p:nvPicPr/></p:pic>
  </p:spTree>
</p:cSld>
<p:clrMapOvr/>
</p:sld>`;
  const slide1Rels = XMLDECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="n" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`;
  const slide2 = XMLDECL + `<p:sld xmlns:p="p" xmlns:a="a">
<p:cSld><p:spTree>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p><a:r><a:t>无标题页正文</a:t></a:r></a:p></p:txBody>
  </p:sp>
  <p:sp>
    <p:nvSpPr><p:nvPr/></p:nvSpPr>
    <p:txBody><a:p><a:fld id="{F}" type="slidenum"><a:t>2</a:t></a:fld><a:r><a:t> 页脚噪声应跳过</a:t></a:r></a:p></p:txBody>
  </p:sp>
</p:spTree></p:cSld>
</p:sld>`;
  const notes1 = XMLDECL + `<p:notes xmlns:p="p" xmlns:a="a">
<p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>缩略图占位</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>强调成本控制</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld>
</p:notes>`;
  return buildZip([
    { name: '[Content_Types].xml', data: XMLDECL + '<Types/>' },
    { name: 'ppt/presentation.xml', data: pres },
    { name: 'ppt/_rels/presentation.xml.rels', data: presRels },
    { name: 'ppt/slides/slide1.xml', data: slide1, deflate: true },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: slide1Rels },
    { name: 'ppt/slides/slide2.xml', data: slide2 },
    { name: 'ppt/notesSlides/notesSlide1.xml', data: notes1, deflate: true },
  ]);
}

// ── 非法/边界夹具 ────────────────────────────────────────────────────────

/** 旧版 OLE（.doc/.xls/.ppt 魔数 D0 CF 11 E0） */
export function oleFixture() {
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
}

/** zip 炸弹：中央目录谎报 1GB 解压尺寸 */
export function bombFixture() {
  return buildZip([{ name: 'word/document.xml', data: '<x/>', declaredUncompressed: 1024 * 1024 * 1024 }]);
}

/** 自定义实体膨胀 XML（billion laughs 变体） */
export function entityBombXml() {
  return '<!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><r>&b;&b;</r>';
}

/** 深度嵌套 XML */
export function deepNestXml(depth) {
  let s = '<r>';
  for (let i = 0; i < depth; i++) s += '<a>';
  for (let i = 0; i < depth; i++) s += '</a>';
  return s + '</r>';
}

/** 不是 zip 的随机字节 */
export function garbageFixture() {
  return Buffer.from('这不是压缩文件，只是一段普通文本内容，用来测非 OOXML 输入的报错路径。');
}
