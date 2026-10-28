/**
 * 纸坊引擎产物级验收（node test/engine-verify.mjs）
 * 直接驱动 service/pdf-engine.js：自造多页 PDF（带可回读文字标记）+ 真实 PNG/JPG，
 * 对每个 op 的「产物」断言——不是接口能调通，而是输出文件本身合格：
 *   merge 页数与页序、extract 保序重排+元数据剥离、split 份数与编号、rotate 角度读回、
 *   delete 页数、images2pdf 页尺寸、text 逐字比对、损坏/加密口径、输出名与覆盖防线。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');
const engine = require('../service/pdf-engine.js');
const { PDFDocument, StandardFonts, rgb } = require('../vendor/pdf-lib.min.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zhifang-engine-'));

// 1x1 经典 fixture（baseline JPEG / 32-bit PNG，pdf-lib 可直接内嵌）
const JPEG_1PX_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
const PNG_1PX_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 造一个 n 页 PDF：第 i 页含 marker-<base+i> 文字（base 保证多文件时标记唯一）；可带元数据 */
async function makePdf(n, { title, author, base = 1000 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Zhifang page ${i} marker-${base + i}`, { x: 50, y: 700, size: 20, font, color: rgb(0.1, 0.2, 0.3) });
  }
  if (title) doc.setTitle(title);
  if (author) doc.setAuthor(author);
  doc.setProducer('zhifang-fixture');
  return Buffer.from(await doc.save());
}

async function extractText(bytes, { firstPageOnly = false } = {}) {
  const r = await engine.runOp('text', [{ name: 'x.pdf', bytes }], firstPageOnly ? { pages: '1' } : {});
  return r.text;
}

test('info：页数/尺寸/元数据只读', async () => {
  const bytes = await makePdf(3, { title: '合同正文', author: '张三' });
  const r = await engine.runOp('info', [{ name: 'contract.pdf', bytes }], {});
  assert.equal(r.pages, 3);
  assert.equal(r.info.title, '合同正文');
  assert.equal(r.info.author, '张三');
  assert.equal(r.info.producer, 'zhifang-fixture');
  assert.match(r.info.pageSize, /595x842pt/);
  assert.equal(r.outputs.length, 0);
});

test('merge：三份按序合并，页序逐页可回读', async () => {
  const a = await makePdf(2, { base: 1000 }); const b = await makePdf(1, { base: 2000 }); const c = await makePdf(3, { base: 3000 });
  const r = await engine.runOp('merge', [
    { name: 'a.pdf', bytes: a }, { name: 'b.pdf', bytes: b }, { name: 'c.pdf', bytes: c },
  ], {});
  assert.equal(r.op, 'merge');
  assert.equal(r.pages, 6);
  assert.equal(r.outputs.length, 1);
  assert.equal(r.outputs[0].name, 'a-合并.pdf');
  const full = await extractText(r.outputs[0].bytes);
  assert.match(full, /marker-1001[\s\S]*marker-1002[\s\S]*marker-2001[\s\S]*marker-3001[\s\S]*marker-3003/);
  // 输出不含输入的元数据（新文档）
  const out = await PDFDocument.load(r.outputs[0].bytes);
  assert.equal(out.getTitle(), undefined);
});

test('extract：保序抽页 + 重排 + 元数据剥离（去痕迹分享）', async () => {
  const src = await makePdf(5, { title: '内部文件', author: '王五' });
  const r = await engine.runOp('extract', [{ name: 'full.pdf', bytes: src }], { pages: '4,2' });
  assert.equal(r.pages, 2);
  assert.equal(r.outputs[0].name, 'full-p4,2.pdf');
  const text = await extractText(r.outputs[0].bytes);
  const i4 = text.indexOf('marker-1004');
  const i2 = text.indexOf('marker-1002');
  assert.ok(i4 >= 0 && i2 > i4, '页序 4 在前 2 在后（重排生效）');
  const out = await PDFDocument.load(r.outputs[0].bytes);
  assert.equal(out.getTitle(), undefined, '新文档不携带原 title');
  assert.equal(out.getAuthor(), undefined, '新文档不携带原 author');
});

test('extract：越界页码拒绝且不产生半成品', async () => {
  const src = await makePdf(3);
  await assert.rejects(() => engine.runOp('extract', [{ name: 'a.pdf', bytes: src }], { pages: '1-99' }), /超过文档总页数/);
});

test('split：每 2 页一份 → 份数/编号/页数分配', async () => {
  const src = await makePdf(5);
  const r = await engine.runOp('split', [{ name: 'big.pdf', bytes: src }], { every: 2 });
  assert.equal(r.outputs.length, 3);
  assert.deepEqual(r.outputs.map((o) => o.name), ['big-part01-of-03.pdf', 'big-part02-of-03.pdf', 'big-part03-of-03.pdf']);
  const counts = [];
  for (const o of r.outputs) counts.push((await PDFDocument.load(o.bytes)).getPageCount());
  assert.deepEqual(counts, [2, 2, 1]);
});

test('split：every 非法/超过总页数拒绝', async () => {
  const src = await makePdf(3);
  await assert.rejects(() => engine.runOp('split', [{ name: 'a.pdf', bytes: src }], { every: 0 }), /every/);
  await assert.rejects(() => engine.runOp('split', [{ name: 'a.pdf', bytes: src }], { every: 9 }), /拆不出多份/);
  await assert.rejects(() => engine.runOp('split', [{ name: 'a.pdf', bytes: src }], { every: 1.5 }), /every/);
});

test('rotate：选中页角度读回（累计），其余页不动', async () => {
  const src = await makePdf(3);
  const r = await engine.runOp('rotate', [{ name: 'scan.pdf', bytes: src }], { pages: '1,3', angle: 90 });
  const out = await PDFDocument.load(r.outputs[0].bytes);
  assert.equal(out.getPage(0).getRotation().angle, 90);
  assert.equal(out.getPage(1).getRotation().angle, 0);
  assert.equal(out.getPage(2).getRotation().angle, 90);
  assert.match(r.note, /1,3/);
});

test('rotate：累计旋转（在 90 基础上再 -90 归零）', async () => {
  const src = await makePdf(1);
  const once = await engine.runOp('rotate', [{ name: 'a.pdf', bytes: src }], { pages: 'all', angle: 90 });
  const twice = await engine.runOp('rotate', [{ name: 'a.pdf', bytes: once.outputs[0].bytes }], { pages: 'all', angle: -90 });
  const out = await PDFDocument.load(twice.outputs[0].bytes);
  assert.equal(out.getPage(0).getRotation().angle, 0);
  assert.equal(twice.outputs[0].name, 'a-旋转270.pdf', '-90 归一为 270 命名');
});

test('delete：删中间页重建，剩余页内容完好', async () => {
  const src = await makePdf(4);
  const r = await engine.runOp('delete', [{ name: 'a.pdf', bytes: src }], { pages: '2-3' });
  assert.equal(r.pages, 2);
  const text = await extractText(r.outputs[0].bytes);
  assert.match(text, /marker-1001/);
  assert.match(text, /marker-1004/);
  assert.doesNotMatch(text, /marker-100[23]/);
  await assert.rejects(() => engine.runOp('delete', [{ name: 'a.pdf', bytes: src }], { pages: 'all' }), /不能删除全部/);
});

test('images2pdf：页尺寸=图片尺寸+边距，顺序=给定顺序', async () => {
  const jpg = Buffer.from(JPEG_1PX_B64, 'base64');
  const png = Buffer.from(PNG_1PX_B64, 'base64');
  const r = await engine.runOp('images2pdf', [
    { name: 'shot1.png', bytes: png }, { name: 'shot2.jpg', bytes: jpg },
  ], { margin: 10 });
  assert.equal(r.pages, 2);
  assert.equal(r.outputs[0].name, 'shot1-图片转PDF.pdf');
  const out = await PDFDocument.load(r.outputs[0].bytes);
  assert.deepEqual([out.getPage(0).getWidth(), out.getPage(0).getHeight()], [21, 21], '1px 图 + 10pt 边距 = 21pt');
  assert.deepEqual([out.getPage(1).getWidth(), out.getPage(1).getHeight()], [21, 21]);
  // 无边距默认 0
  const r2 = await engine.runOp('images2pdf', [{ name: 's.png', bytes: png }], {});
  const out2 = await PDFDocument.load(r2.outputs[0].bytes);
  assert.equal(out2.getPage(0).getWidth(), 1);
});

test('images2pdf：非 JPG/PNG 内容拒绝（HEIC/WebP 引导转换）', async () => {
  const fake = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]); // ICO 头
  await assert.rejects(() => engine.runOp('images2pdf', [{ name: 'a.png', bytes: fake }], {}), /不是 JPG\/PNG/);
});

test('text：marker 逐字比对、单页模式、长文截断标注', async () => {
  const src = await makePdf(2);
  const r = await engine.runOp('text', [{ name: 'doc.pdf', bytes: src }], {});
  assert.match(r.text, /Zhifang page 1 marker-1001/);
  assert.match(r.text, /Zhifang page 2 marker-1002/);
  assert.equal(r.truncated, false);
  const single = await engine.runOp('text', [{ name: 'doc.pdf', bytes: src }], { pages: '2' });
  assert.match(single.text, /marker-1002/);
  assert.doesNotMatch(single.text, /marker-1001/);
  const tiny = await engine.runOp('text', [{ name: 'doc.pdf', bytes: src }], { maxChars: 10 });
  assert.equal(tiny.truncated, true);
  assert.ok(tiny.text.length <= 10);
});

test('text：无文字层（扫描件口径）与损坏文件给出可操作错误', async () => {
  // 造一个只有图形没有文字的 PDF（模拟扫描件）
  const blank = await PDFDocument.create();
  blank.addPage([100, 100]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
  const blankBytes = Buffer.from(await blank.save());
  await assert.rejects(() => engine.runOp('text', [{ name: 'scan.pdf', bytes: blankBytes }], {}), /文字层|OCR/);
  // %PDF 头但内容损坏
  const broken = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('broken-body-not-a-pdf'.repeat(10))]);
  await assert.rejects(() => engine.runOp('text', [{ name: 'bad.pdf', bytes: broken }], {}), /无法解析|损坏/);
  await assert.rejects(() => engine.runOp('info', [{ name: 'bad.pdf', bytes: broken }], {}), /无法解析|损坏/);
});

test('安全底线：输入缓冲不被修改（只读保证）', async () => {
  const src = await makePdf(2);
  const before = Buffer.from(src);
  await engine.runOp('rotate', [{ name: 'a.pdf', bytes: src }], { pages: 'all', angle: 90 });
  await engine.runOp('delete', [{ name: 'a.pdf', bytes: src }], { pages: '1' });
  assert.ok(src.equals(before), '引擎处理后输入字节必须与处理前完全一致');
});

test('输出名与覆盖防线：pickOutputName 与落盘联动（永不覆盖）', () => {
  const dir = path.join(TMP, 'never-overwrite');
  fs.mkdirSync(dir, { recursive: true });
  const exists = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
  const first = core.pickOutputName(dir, 'a-合并', '.pdf', exists);
  fs.writeFileSync(first, Buffer.from('%PDF-1.4 fake'));
  const second = core.pickOutputName(dir, 'a-合并', '.pdf', exists);
  assert.notEqual(first, second);
  assert.match(second, /-2\.pdf$/);
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟容忍 */ }
});
console.log('engine-verify: fixtures dir', TMP);
