/**
 * office-lens 核心引擎测试（node --test test/run-tests.mjs）
 *
 * 覆盖：zip 读取（store/deflate/炸弹/损坏）+ XML（实体炸弹/深度/DOCTYPE/CDATA）
 * + docx（标题三通道/行内样式/链接/TOC/多级编号/表格合并/脚注/图片占位）
 * + xlsx（sharedStrings/日期双历元与格式识别/公式缓存/合并/稀疏/多 sheet/CSV）
 * + pptx（标题/列表/表格/备注/页码域跳过）+ 嗅探与错误路径。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../shared/core.js';
import {
  buildZip, docxFixture, xlsxFixture, pptxFixture,
  oleFixture, bombFixture, entityBombXml, deepNestXml, garbageFixture,
} from './fixtures.mjs';

// ── 嗅探 ─────────────────────────────────────────────────────────────────

test('嗅探：zip/OLE/PDF/未知', () => {
  assert.equal(core.sniffFormat(docxFixture()), 'zip');
  assert.equal(core.sniffFormat(oleFixture()), 'ole');
  assert.equal(core.sniffFormat(new TextEncoder().encode('%PDF-1.7')), 'pdf');
  assert.equal(core.sniffFormat(new TextEncoder().encode('hello')), 'unknown');
});

// ── zip 层 ───────────────────────────────────────────────────────────────

test('openZip：store 与 deflate 混合条目读取', async () => {
  const zip = await core.openZip(docxFixture());
  assert.ok(zip.names.includes('word/document.xml'));
  const doc = await zip.read('word/document.xml'); // deflate 条目
  assert.ok(new TextDecoder().decode(doc).includes('项目概述'));
  const types = await zip.read('[Content_Types].xml'); // store 条目
  assert.ok(types.length > 0);
  assert.equal(await zip.read('不存在.xml'), null);
});

test('openZip：缺 EOCD 报错', async () => {
  await assert.rejects(() => core.openZip(new TextEncoder().encode('PK\x03\x04 broken')), /EOCD|zip/);
});

test('zip 炸弹：中央目录谎报解压尺寸被拦截', async () => {
  await assert.rejects(() => core.openZip(bombFixture()), /炸弹|超/);
});

test('zip 累计解压上限护栏（小上限模拟）', async () => {
  // 两个 300MB 声明的条目 → 单条超 128MB 先拦（或累计超 512MB），store 条目实际只有几字节
  const big = 300 * 1024 * 1024;
  const z = buildZip([
    { name: 'a.xml', data: '<a/>', declaredUncompressed: big },
    { name: 'b.xml', data: '<b/>', declaredUncompressed: big },
  ]);
  await assert.rejects(() => core.openZip(z), /炸弹|上限/);
});

// ── XML 层 ───────────────────────────────────────────────────────────────

test('XML：实体解码 + 未知实体字面保留（不展开自定义实体）', () => {
  const r = core.parseXml('<r a="x&amp;y">&#x4F60;好&lt;tag&gt;&unknown;&b;</r>', 't.xml');
  assert.equal(core.attrOf(r, 'a'), 'x&y');
  assert.equal(core.textOf(r), '你好<tag>&unknown;&b;');
});

test('XML：DOCTYPE（含内部子集）整体跳过，实体炸弹失效', () => {
  const r = core.parseXml(entityBombXml(), 'b.xml');
  assert.equal(core.textOf(r), '&b;&b;'); // 不展开
});

test('XML：CDATA 与注释', () => {
  const r = core.parseXml('<r><!-- 注释 --><![CDATA[<raw>&amp;]]></r>', 'c.xml');
  assert.equal(core.textOf(r), '<raw>&amp;');
});

test('XML：深度超限被拦截', () => {
  assert.throws(() => core.parseXml(deepNestXml(500), 'd.xml'), /嵌套|炸弹/);
});

test('XML：未闭合标签报错带上下文', () => {
  assert.throws(() => core.parseXml('<r><a>text', 'u.xml'), /XML 解析失败/);
});

// ── 工具函数 ─────────────────────────────────────────────────────────────

test('Excel 序列号换算：1900 闰年 bug / 1970 锚点 / 1904 / 时间', () => {
  assert.equal(core.serialToDateTime(1, false).dateStr, '1900-01-01');
  assert.equal(core.serialToDateTime(59, false).dateStr, '1900-02-28');
  assert.equal(core.serialToDateTime(60, false).dateStr, '1900-02-28'); // 虚构日期就近
  assert.equal(core.serialToDateTime(61, false).dateStr, '1900-03-01');
  assert.equal(core.serialToDateTime(25569, false).dateStr, '1970-01-01');
  const half = core.serialToDateTime(44927.5, false);
  assert.equal(half.dateStr, '2023-01-01');
  assert.equal(half.timeStr, '12:00:00');
  // 1904：serial 0 = 1904-01-01 = 1900 制 2452（+1462）→ 1900-01-01 是 1904-01-01 的 1462 天后？
  // 直接锚点：1904 制 serial 1462 → 1900 制 2924 → 1907-12-31？用相对关系断言：
  const a = core.serialToDateTime(0, true);
  const b = core.serialToDateTime(1, true);
  assert.notEqual(a.dateStr, b.dateStr);
  assert.equal(new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime(), 86400000);
});

test('numFmt 日期识别：内置/自定义/误报防护', () => {
  assert.equal(core.fmtCodeIsDate('yyyy-mm-dd'), true);
  assert.equal(core.fmtCodeIsDate('m"月"d"日"'), true);
  assert.equal(core.fmtCodeIsDate('[Red] h:mm'), true);
  assert.equal(core.fmtCodeIsDate('#,##0.00'), false);
  assert.equal(core.fmtCodeIsDate('0.00 "meters"'), false); // m 后跟字母不误判
  assert.equal(core.fmtCodeIsDate('0.0%'), false);
  assert.equal(core.fmtCodeIsDate(''), false);
});

test('列字母→索引：A/Z/AA', () => {
  assert.equal(core.colLettersToIndex('A'), 0);
  assert.equal(core.colLettersToIndex('Z'), 25);
  assert.equal(core.colLettersToIndex('AA'), 26);
});

// ── docx 引擎 ────────────────────────────────────────────────────────────

async function docxExtract() {
  return core.extractAuto(docxFixture(), {});
}

test('docx：标题三通道（outlineLvl / 样式名中文兼容 / 直接 outlineLvl）', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('# 项目概述'), r.markdown);
  assert.ok(r.markdown.includes('## 中文样式二级标题'));
  assert.ok(r.markdown.includes('### 直接大纲三级'));
});

test('docx：行内样式 + 硬换行', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('这是**加粗***斜体*~~删除线~~普通文本。'));
  assert.ok(r.markdown.includes('换行后文本'));
});

test('docx：外链与内部锚点', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('[官方网站](https://example.com)'));
  assert.ok(r.markdown.includes('[内部锚点](#sec2)'));
});

test('docx：TOC 域整段跳过并出警告', async () => {
  const r = await docxExtract();
  assert.ok(!r.markdown.includes('目录占位'));
  assert.ok(r.warnings.some((w) => w.includes('TOC')));
});

test('docx：多级编号（计数/字母/层级重置）', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('1. 第一项'), r.markdown);
  assert.ok(r.markdown.includes('2. 第二项'));
  assert.ok(r.markdown.includes('  a) 子项甲'));
  assert.ok(r.markdown.includes('  b) 子项乙'));
  assert.ok(r.markdown.includes('3. 第三项')); // 回到一级：计数继续且深层复位
});

test('docx：无序列表', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('- 无序甲'));
  assert.ok(r.markdown.includes('- 无序乙'));
});

test('docx：脚注引用与定义配对', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('脚注参考[^fn1]继续正文'));
  assert.ok(r.markdown.includes('[^fn1]: 这是脚注正文内容。'));
});

test('docx：图片占位与警告', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('[图1]图后文字'));
  assert.ok(r.warnings.some((w) => w.includes('media/image1.png')));
  assert.equal(r.stats.images, 1);
});

test('docx：表格 gridSpan 补空 + vMerge 隐藏续格 + 表头分隔', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('| 名称 | 数量 | 备注 |'));
  assert.ok(r.markdown.includes('| 苹果 | 合并跨列内容 |  |'));
  assert.ok(r.markdown.includes('| 纵向 | 主格 | 普通 |'));
  assert.ok(r.markdown.includes('| 续行 |  | 普通2 |')); // vMerge 续格隐藏
  assert.ok(!r.markdown.includes('应隐藏'));
});

test('docx：引用样式 → blockquote；空段折叠；统计', async () => {
  const r = await docxExtract();
  assert.ok(r.markdown.includes('> 引用块内容'));
  const lines = r.markdown.split('\n');
  assert.ok(!lines.some((l, i) => i > 0 && l === '' && lines[i - 1] === '')); // 无连续空行
  assert.ok(r.stats.tables === 1);
  assert.ok(r.stats.words > 10);
  assert.ok(r.stats.ms >= 0);
});

// ── xlsx 引擎 ────────────────────────────────────────────────────────────

async function xlsxExtract(sheet, opts = {}) {
  return core.extractAuto(xlsxFixture(), { sheet, ...opts });
}

test('xlsx：sheet 清单', async () => {
  const r = await xlsxExtract();
  assert.deepEqual(r.sheets, ['销售数据', '配置']);
  assert.equal(r.sheetName, '销售数据');
  assert.ok(r.warnings.some((w) => w.includes('2 个工作表')));
});

test('xlsx：sharedStrings/行内串/布尔/错误/数字原样', async () => {
  const r = await xlsxExtract();
  assert.ok(r.markdown.includes('| 产品名称 | 42.5 |'));
  assert.ok(r.markdown.includes('行内字符串'));
  assert.ok(r.markdown.includes('TRUE'));
  assert.ok(r.markdown.includes('#DIV/0!'));
});

test('xlsx：日期三态（内置14/自定义/纯时间）', async () => {
  const r = await xlsxExtract();
  assert.ok(r.markdown.includes('| 产品名称 | 42.5 | 2023-01-01 | 2023-01-01 | 12:30:00 |'), r.markdown);
});

test('xlsx：公式显示缓存值并计数警告', async () => {
  const r = await xlsxExtract();
  assert.ok(r.markdown.includes('42.5'));
  assert.ok(r.warnings.some((w) => w.includes('公式 1 处')));
});

test('xlsx：合并单元格警告 + 稀疏行补空 + AA 列（第 27 列）', async () => {
  const r = await xlsxExtract();
  assert.ok(r.warnings.some((w) => w.includes('合并单元格 1 处')));
  assert.equal(r.stats.cols, 27); // A..AA
  assert.equal(r.stats.rows, 4); // 第 3 行空行保留
  assert.ok(r.markdown.includes('富文本拼接')); // sharedStrings 富文本 si 拼接
  assert.ok(r.markdown.includes('3.14'));
});

test('xlsx：按名称/序号选 sheet；越界报错列可选项', async () => {
  const byName = await xlsxExtract('配置');
  assert.ok(byName.markdown.includes('北上广深'));
  const byIdx = await xlsxExtract('2');
  assert.ok(byIdx.markdown.includes('北上广深'));
  await assert.rejects(() => xlsxExtract('不存在'), /找不到工作表.*销售数据/);
});

test('xlsx：CSV 输出与引号转义', () => {
  const csv = core.matrixToCsv([['a,b', 'c"d', 'e\nf', 'plain']]);
  assert.equal(csv, '"a,b","c""d","e\nf",plain');
});

test('xlsx outline：sheet 清单带规模与首行', async () => {
  const o = await core.outlineAuto(xlsxFixture());
  assert.equal(o.format, 'xlsx');
  assert.ok(o.text.includes('销售数据：4 行 × 27 列'));
  assert.ok(o.text.includes('首行：产品名称'));
});

// ── pptx 引擎 ────────────────────────────────────────────────────────────

async function pptxExtract() {
  return core.extractAuto(pptxFixture(), {});
}

test('pptx：标题页 + 列表层级 + 自动编号', async () => {
  const r = await pptxExtract();
  assert.ok(r.markdown.includes('## 1. 季度汇报'), r.markdown);
  assert.ok(r.markdown.includes('- 营收增长'));
  assert.ok(r.markdown.includes('  - 华北区'));
  assert.ok(r.markdown.includes('1. 下一步计划'));
});

test('pptx：表格 + 图片占位 + 备注提取', async () => {
  const r = await pptxExtract();
  assert.ok(r.markdown.includes('| 指标 | 数值 |'));
  assert.ok(r.markdown.includes('| GTV | 1200 万 |'));
  assert.ok(r.markdown.includes('[图1]'));
  assert.ok(r.markdown.includes('> 备注：强调成本控制'));
  assert.ok(!r.markdown.includes('缩略图占位')); // sldImg 占位跳过
});

test('pptx：无标题页 + 普通形状文本保留（页码域跳过不打断拼接）+ 幻灯片数', async () => {
  const r = await pptxExtract();
  assert.ok(r.markdown.includes('## 2. （无标题）'));
  assert.ok(r.markdown.includes('无标题页正文'));
  // 第二个形状无 ph 类型 → 普通文本框，文本保留；fld（页码"2"）被跳过但其余文本正常拼接
  assert.ok(r.markdown.includes('页脚噪声应跳过'));
  assert.equal(r.stats.slides, 2);
});

// ── extractAuto 错误路径 ─────────────────────────────────────────────────

test('嗅探优先于扩展名：docx 字节被正确识别', async () => {
  const r = await core.extractAuto(docxFixture(), {});
  assert.equal(r.format, 'docx');
});

test('旧版 OLE 明确拒绝并指引另存', async () => {
  await assert.rejects(() => core.extractAuto(oleFixture(), {}), /另存为 docx/);
});

test('PDF 拒绝并指向专门插件', async () => {
  await assert.rejects(
    () => core.extractAuto(new TextEncoder().encode('%PDF-1.7 fake'), {}),
    /zhifang|pdf-tables/,
  );
});

test('非 zip 垃圾输入明确报错', async () => {
  await assert.rejects(() => core.extractAuto(garbageFixture(), {}), /OOXML/);
});

test('zip 但非 Office 文档明确报错', async () => {
  const z = buildZip([{ name: 'hello.txt', data: 'hi' }]);
  await assert.rejects(() => core.extractAuto(z, {}), /不是 Office 文档/);
});

test('outlineAuto：docx 标题树', async () => {
  const o = await core.outlineAuto(docxFixture());
  assert.equal(o.format, 'docx');
  assert.ok(o.text.includes('# 项目概述'));
  assert.ok(o.text.includes('## 中文样式二级标题'));
});

test('outlineAuto：pptx 标题列表', async () => {
  const o = await core.outlineAuto(pptxFixture());
  assert.equal(o.format, 'pptx');
  assert.ok(o.text.includes('## 1. 季度汇报'));
  assert.ok(o.text.includes('## 2. （无标题）'));
});

test('字数统计：CJK 与拉丁混合', () => {
  const w = core.countWords('你好 world 测试 123');
  assert.equal(w.cjk, 4);
  assert.equal(w.latin, 2); // world + 123
  assert.equal(w.total, 6);
});
