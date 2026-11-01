#!/usr/bin/env node
/**
 * 第 2 层：引擎产物级测试（真实 fixture → 真实 Tesseract 识别 → 逐项断言）
 * 运行：node test/engine-tests.mjs（首次约 30~60s：加载 worker + 逐夹具识别）
 */
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, 'fixtures');
const core = require('../shared/core.js');
const { createEngine } = require('../service/ocr-engine.js');

const cacheDir = path.join(os.tmpdir(), 'ocr-bench-engine-tests-cache');
const engine = createEngine({
  langsDirBuiltin: path.join(__dirname, '..', 'service', 'vendor', 'tessdata'),
  cacheDir,
  limits: core.LIMITS,
  log: () => {},
});

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { failed += 1; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}: ${e.message}`); }
}

const scheduler = await engine.spawnScheduler(['chi_sim', 'eng'], 3);
const signal = { aborted: false };
const run = (name, type) => engine.recognizeFile({ path: path.join(FIX, name), type }, { signal, scheduler });
const squash = (s) => String(s || '').replace(/\s+/g, '');

try {
  await test('图片直识：中英混排 PNG 全文正确', async () => {
    const r = await run('fixture-zh.png', 'image');
    assert.equal(r.ok, true, r.error);
    const t = squash(r.text);
    assert.ok(t.includes('检验报告单'), t);
    assert.ok(t.includes('患者姓名'), t);
    assert.ok(t.includes('45'), t);
    assert.ok(t.includes('A-2026-1102'), t);
    assert.ok(t.includes('1,234.56'), t);
    assert.ok(r.pages[0].confidence >= 60, `conf=${r.pages[0].confidence}`);
    assert.equal(r.pages[0].mode, 'ocr');
  });

  await test('扫描 PDF（DCTDecode/JPEG）：整卷识别', async () => {
    const r = await run('scan-dct.pdf', 'pdf');
    assert.equal(r.ok, true, r.error);
    const t = squash(r.text);
    assert.ok(t.includes('住院费用清单'), t);
    assert.ok(t.includes('骨科'), t);
    assert.ok(t.includes('8765'), t);
    assert.ok(r.pages[0].confidence >= 60);
  });

  await test('扫描 PDF（FlateDecode RGB24）：原始像素页', async () => {
    const r = await run('scan-flate.pdf', 'pdf');
    assert.equal(r.ok, true, r.error);
    const t = squash(r.text);
    assert.ok(t.includes('FAXLINE6620') || t.includes('6620'), t);
  });

  await test('扫描 PDF（FlateDecode 1bpp）：黑白传真形态（kind=1 路径）', async () => {
    const r = await run('scan-1bpp.pdf', 'pdf');
    assert.equal(r.ok, true, r.error);
    const t = squash(r.text);
    assert.ok(t.includes('6620'), t);
  });

  await test('/Rotate 90 旋转校正：横放图像转正后识别', async () => {
    const r = await run('scan-rot90.pdf', 'pdf');
    assert.equal(r.ok, true, r.error);
    const t = squash(r.text);
    assert.ok(t.includes('ROTATEDPAGECHECK90'), t);
    assert.ok(t.includes('7741'), t);
  });

  await test('文字版 PDF：native 直读不烧 OCR（conf=100）', async () => {
    const r = await run('native-text.pdf', 'pdf');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.pages[0].mode, 'native');
    assert.equal(r.pages[0].confidence, 100);
    assert.ok(squash(r.text).includes('HelloNativeTextLayer'));
  });

  await test('混合 PDF：页1 native + 页2 ocr 逐页模式正确', async () => {
    const r = await run('mixed.pdf', 'pdf');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.pages.length, 2);
    assert.equal(r.pages[0].mode, 'native');
    assert.equal(r.pages[1].mode, 'ocr');
    assert.ok(squash(r.text).includes('Thisnativefirstpage'));
    assert.ok(squash(r.text).includes('住院费用清单'));
  });

  await test('损坏 PDF：中文可操作错误，不抛未捕获异常', async () => {
    const r = await run('corrupt.pdf', 'pdf');
    assert.equal(r.ok, false);
    assert.match(r.error || '', /PDF 解析失败|PDF 打开失败/);
  });

  await test('文本层判定与引擎页元数据一致（chars 计数）', async () => {
    const r = await run('mixed.pdf', 'pdf');
    assert.ok(r.pages[0].chars >= 30, `chars=${r.pages[0].chars}`);
    assert.equal(r.pages[1].chars, 0);
  });

  await test('语言包：installedLangs 含内置双语言；非法下载码拒绝（离线断言，不依赖外网）', async () => {
    const installed = engine.installedLangs();
    assert.ok(installed.has('chi_sim'));
    assert.ok(installed.has('eng'));
    await assert.rejects(() => engine.downloadLang('../evil'), /非法语言代码/);
    await assert.rejects(() => engine.downloadLang('x'), /非法语言代码/);
    // 合法代码但语言不存在（zzz）会走真实网络——离线测试不做，由真桥冒烟按需覆盖
  });
} finally {
  await engine.killScheduler(scheduler);
}

console.log(`\n第 2 层引擎产物级测试：${passed} 通过 / ${failed} 失败`);
// tesseract worker 线程即便 terminate 后也可能保留事件循环句柄：显式退出
process.exit(failed ? 1 : 0);
