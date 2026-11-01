#!/usr/bin/env node
/**
 * 第一层：core + pixel 纯逻辑单测（零 IO、零 OCR，秒级）
 * 运行：node test/run-tests.mjs
 */
import assert from 'node:assert';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');
const pixel = require('../service/pixel.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed += 1; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}: ${e.message}`); });
}

// ── discoverInputs ──────────────────────────────────────────────────────────
function fsLike(tree) {
  // tree: { 'C:/dir': ['a.png', 'sub'], 'C:/dir/a.png': {size: 10, file: true}, ... }
  return {
    statSync(p) {
      const norm = p.replace(/\\/g, '/');
      if (tree[norm] === undefined) throw new Error('ENOENT');
      const t = tree[norm];
      if (typeof t === 'object') return { isDirectory: () => !!t.dir, isFile: () => !t.dir, size: t.size || 0 };
      return { isDirectory: () => false, isFile: () => true, size: t };
    },
    readDirSync(p) {
      const norm = p.replace(/\\/g, '/');
      return tree[norm] && typeof tree[norm] === 'object' ? tree[norm].entries || [] : [];
    },
  };
}

await test('发现器：文件输入直收，类型按扩展名', () => {
  const fs = fsLike({ 'C:/a.png': 100, 'C:/b.pdf': 200, 'C:/c.txt': 5 });
  const r = core.discoverInputs(['C:/a.png', 'C:/b.pdf'], fs);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].type, 'pdf'); // pdf 排前
  assert.equal(r.items[1].type, 'image');
});

await test('发现器：目录递归收集 + 不识别条目计数 + 大小写去重', () => {
  const fs = fsLike({
    'C:/docs': { dir: true, entries: ['a.PNG', 'sub', 'note.txt'] },
    'C:/docs/sub': { dir: true, entries: ['b.Pdf', 'deep'] },
    'C:/docs/sub/deep': { dir: true, entries: ['c.jpg'] },
    'C:/docs/a.PNG': 10,
    'C:/docs/sub/b.Pdf': 20,
    'C:/docs/sub/deep/c.jpg': 30,
    'C:/docs/note.txt': 5,
    'C:/DOCS/a.png': 10, // 同一文件的大小写别名（Windows 真实 fs 可 stat 到）
  });
  const r = core.discoverInputs(['C:/docs', 'C:/DOCS/a.png'], fs);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 3);
  assert.equal(r.scanned, 1);
  assert.ok(r.items.some((i) => i.path === 'C:/docs/sub/deep/c.jpg'));
});

await test('发现器：不存在的路径报错；不支持扩展名报错', () => {
  const fs = fsLike({ 'C:/a.png': 1, 'C:/a.exe': 1 });
  assert.equal(core.discoverInputs(['C:/missing'], fs).ok, false);
  assert.match(core.discoverInputs(['C:/a.png', 'C:/a.exe'], fs).error || '', /不支持的文件类型/);
  assert.match(core.discoverInputs([], fs).error || '', /未提供任何输入路径/);
});

await test('发现器：单目录条目超上限截断', () => {
  const entries = [];
  const tree = { 'C:/m': { dir: true, entries } };
  for (let i = 0; i < 600; i++) { entries.push(`f${i}.png`); tree[`C:/m/f${i}.png`] = 1; }
  const r = core.discoverInputs(['C:/m'], fsLike(tree));
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 400); // maxFilesPerJob.max * 2 硬顶
});

// ── isPathInside（路径根边界）───────────────────────────────────────────────
await test('路径边界：内部/外部/大小写/尾分隔符', () => {
  assert.ok(core.isPathInside('C:\\out\\a.txt', 'C:\\out'));
  assert.ok(core.isPathInside('C:/out/sub/', 'C:\\OUT'));
  assert.ok(core.isPathInside('C:\\out', 'C:\\out'));
  assert.equal(core.isPathInside('C:\\out2\\x', 'C:\\out'), false);      // 前缀相同但非子目录
  assert.equal(core.isPathInside('D:\\out\\x', 'C:\\out'), false);
  assert.equal(core.isPathInside('', 'C:\\out'), false);
  assert.equal(core.isPathInside('C:\\out\\..\\evil\\x', 'C:\\out'), false); // .. 未归一 → 拒绝
});

// ── judgeTextLayer ──────────────────────────────────────────────────────────
await test('文本层判定：native/scanned/mixed/empty', () => {
  assert.equal(core.judgeTextLayer([{ page: 1, chars: 500 }, { page: 2, chars: 100 }]).mode, 'native');
  assert.equal(core.judgeTextLayer([{ page: 1, chars: 3 }, { page: 2, chars: 0 }]).mode, 'scanned');
  assert.equal(core.judgeTextLayer([{ page: 1, chars: 500 }, { page: 2, chars: 2 }]).mode, 'mixed');
  assert.equal(core.judgeTextLayer([{ page: 1, chars: 500 }, { page: 2, chars: 2 }]).nativePages.length, 1);
  assert.equal(core.judgeTextLayer([]).mode, 'empty');
  assert.equal(core.judgeTextLayer([{ page: 1, chars: 29 }]).mode, 'scanned'); // 阈值边界
  assert.equal(core.judgeTextLayer([{ page: 1, chars: 30 }]).mode, 'native');
});

// ── normalizeLangs ──────────────────────────────────────────────────────────
await test('语言归一：默认/字符串格式/去重/未知/未安装/超4个', () => {
  const installed = new Set(['chi_sim', 'eng', 'jpn']);
  assert.deepEqual(core.normalizeLangs(undefined, installed).langs, ['chi_sim', 'eng']);
  assert.deepEqual(core.normalizeLangs('chi_sim+eng', installed).langs, ['chi_sim', 'eng']);
  assert.deepEqual(core.normalizeLangs(['jpn', 'jpn', 'eng'], installed).langs, ['jpn', 'eng']);
  assert.match(core.normalizeLangs(['xx_yy'], installed).error || '', /不支持的语言代码/);
  assert.match(core.normalizeLangs(['fra'], installed).error || '', /语言包未安装/);
  assert.match(core.normalizeLangs(['chi_sim', 'eng', 'jpn', 'fra', 'deu'], new Set(['chi_sim', 'eng', 'jpn', 'fra', 'deu'])).error || '', /最多组合 4 个/);
});

await test('PSM 归一：合法值保留、非法回 3', () => {
  assert.equal(core.normalizePsm(6), 6);
  assert.equal(core.normalizePsm('11'), 11);
  assert.equal(core.normalizePsm(99), 3);
  assert.equal(core.normalizePsm(undefined), 3);
  assert.equal(core.normalizePsm('abc'), 3);
});

// ── shapeFileResult + summarizeJob ──────────────────────────────────────────
await test('结果整形：字段归一/文本截断标记', () => {
  const long = 'x'.repeat(core.LIMITS.maxOutTextBytes + 10);
  const s = core.shapeFileResult({ path: 'C:/a.png', type: 'image', ok: true, pages: [{ page: 1, chars: 3, confidence: 88.44, mode: 'ocr' }], text: long, durationMs: 12.6 });
  assert.equal(s.chars, long.length);
  assert.ok(s.truncated);
  assert.equal(s.durationMs, 13);
  assert.equal(s.pages[0].confidence, 88.4);
  const bad = core.shapeFileResult({ path: '', type: 'weird', ok: false, pages: 'nope', text: null });
  assert.equal(bad.type, 'image');
  assert.deepEqual(bad.pages, []);
  assert.equal(bad.chars, 0);
});

await test('任务汇总：聚合数字与中文结论/低置信提示', () => {
  const job = {
    aborted: false,
    durationMs: 1500,
    results: [
      core.shapeFileResult({ path: 'C:/a.png', type: 'image', ok: true, text: 'hello world foo', pages: [{ page: 1, chars: 15, confidence: 55, mode: 'ocr' }] }),
      core.shapeFileResult({ path: 'C:/b.pdf', type: 'pdf', ok: true, text: 'x'.repeat(100), pages: [{ page: 1, chars: 100, confidence: 100, mode: 'native' }, { page: 2, chars: 50, confidence: 92, mode: 'ocr' }] }),
      core.shapeFileResult({ path: 'C:/c.png', type: 'image', ok: false, text: '', pages: [], error: '文件读取失败' }),
    ],
  };
  const s = core.summarizeJob(job);
  assert.equal(s.files, 3);
  assert.equal(s.okFiles, 2);
  assert.equal(s.failFiles, 1);
  assert.equal(s.ocrPages, 2);
  assert.equal(s.nativePages, 1);
  assert.equal(s.totalChars, 115);
  assert.equal(s.meanConfidence, 82.3); // (55+100+92)/3
  assert.equal(s.lowConfPages, 1);
  assert.ok(s.oneLine.includes('2/3'));
  assert.ok(s.notes.some((n) => n.includes('置信度')));
  assert.ok(s.notes.some((n) => n.includes('1 个文件识别失败')));
  const ab = core.summarizeJob({ ...job, aborted: true });
  assert.ok(ab.oneLine.includes('已中止'));
});

// ── maskPath ────────────────────────────────────────────────────────────────
await test('路径脱敏：中段折叠、短路径原样', () => {
  assert.equal(core.maskPath('C:\\a\\b\\c\\d\\file.png'), 'C:/…/d/file.png');
  assert.equal(core.maskPath('C:\\file.png'), 'C:\\file.png');
  assert.equal(core.maskPath(''), '');
});

// ── pixel: crc32 已知值 ─────────────────────────────────────────────────────
await test('crc32 已知向量（"123456789" → 0xCBF43926）', () => {
  assert.equal(pixel.crc32(Buffer.from('123456789')), 0xCBF43926);
});

// ── pixel: PNG 编码器结构级验证（签名/块序/CRC/IDAT 解压回读）────────────────
await test('rgbaToPng：合法 PNG 结构 + 解压回读逐像素一致', () => {
  const w = 3; const h = 2;
  const rgba = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
  ]);
  const png = pixel.rgbaToPng(rgba, w, h);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  // 解析块
  let off = 8;
  const chunks = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    const crc = png.readUInt32BE(off + 8 + len);
    assert.equal(crc, pixel.crc32(png.subarray(off + 4, off + 8 + len)), `chunk ${type} CRC`);
    chunks.push({ type, data });
    off += 12 + len;
  }
  assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  const ihdr = chunks[0].data;
  assert.equal(ihdr.readUInt32BE(0), w);
  assert.equal(ihdr.readUInt32BE(4), h);
  assert.equal(ihdr[8], 8);
  assert.equal(ihdr[9], 6);
  const raw = zlib.inflateSync(chunks[1].data);
  assert.equal(raw.length, (w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (w * 4 + 1)], 0); // filter None
    assert.deepEqual([...raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1))], [...rgba.subarray(y * w * 4, (y + 1) * w * 4)]);
  }
});

// ── pixel: 颜色空间转换 ─────────────────────────────────────────────────────
await test('gray1bppToRgba：打包位展开（1=白 0=黑）', () => {
  const w = 8; const h = 2;
  const packed = Buffer.from([0b10101010, 0b01010101]);
  const rgba = pixel.gray1bppToRgba(packed, w, h);
  assert.equal(rgba[0], 255);   // bit1=白
  assert.equal(rgba[4], 0);     // bit0=黑
  assert.equal(rgba[1 * 8 * 4], 0);      // 第二行 bit0=0 → 黑
  assert.equal(rgba[1 * 8 * 4 + 4], 255);
  assert.equal(rgba.length, w * h * 4);
});

await test('rgb24ToRgba：三通道扩四通道且 alpha=255', () => {
  const rgb = Buffer.from([1, 2, 3, 4, 5, 6]);
  const rgba = pixel.rgb24ToRgba(rgb, 2, 1);
  assert.deepEqual([...rgba], [1, 2, 3, 255, 4, 5, 6, 255]);
});

await test('pdfImageToRgba：kind 分派与坏输入拒绝', () => {
  assert.equal(pixel.pdfImageToRgba(null), null);
  assert.equal(pixel.pdfImageToRgba({ width: 2, height: 2, kind: 2, data: Buffer.alloc(4) }), null); // 长度不足
  assert.equal(pixel.pdfImageToRgba({ width: 2, height: 2, kind: 9, data: Buffer.alloc(16) }), null); // 未知 kind
  const okImg = pixel.pdfImageToRgba({ width: 1, height: 1, kind: 3, data: Buffer.from([9, 8, 7, 6]) });
  assert.deepEqual([...okImg], [9, 8, 7, 6]);
});

// ── pixel: 旋转与缩放 ───────────────────────────────────────────────────────
await test('rotateCw90：2x3 矩阵像素级正确（宽高互换）', () => {
  // 2 宽 3 高：列优先排 [A B / C D / E F]
  const W = 2; const H = 3;
  const src = Buffer.alloc(W * H * 4);
  const at = (x, y, r, g, b) => { const o = (y * W + x) * 4; src[o] = r; src[o + 1] = g; src[o + 2] = b; src[o + 3] = 255; };
  at(0, 0, 1, 0, 0); at(1, 0, 2, 0, 0);
  at(0, 1, 3, 0, 0); at(1, 1, 4, 0, 0);
  at(0, 2, 5, 0, 0); at(1, 2, 6, 0, 0);
  const out = pixel.rotateCw90(src, W, H);
  assert.equal(out.width, 3);
  assert.equal(out.height, 2);
  // CW 后 (x,y)→(H-1-y, x)：新图 3 宽 2 高；原 (0,0) 红应到新 (2,0)
  const get = (img, x, y) => img.data[(y * img.width + x) * 4];
  assert.equal(get(out, 2, 0), 1); // 原左上 → 右上
  assert.equal(get(out, 0, 0), 5); // 原左下 → 左上
  assert.equal(get(out, 1, 1), 4);
});

await test('clampEdge：超长边缩放、短边不动、小图原样', () => {
  const small = pixel.clampEdge(Buffer.alloc(10 * 10 * 4), 10, 10, 5000);
  assert.equal(small.scaled, false);
  const big = pixel.clampEdge(Buffer.alloc(8000 * 100 * 4), 8000, 100, 5000);
  assert.equal(big.scaled, true);
  assert.equal(big.width, 5000);
  assert.equal(big.height, 62); // floor(100 * 5000/8000)
});

await test('rotationsFor：90/270 转 1 次，0/180/异常 转 0 次', () => {
  assert.equal(pixel.rotationsFor(90), 1);
  assert.equal(pixel.rotationsFor(270), 1);
  assert.equal(pixel.rotationsFor(0), 0);
  assert.equal(pixel.rotationsFor(180), 0);
  assert.equal(pixel.rotationsFor(-90), 1); // 归一化后 270
  assert.equal(pixel.rotationsFor(undefined), 0);
});

// ── 汇总 ────────────────────────────────────────────────────────────────────
console.log(`\n第 1 层 core+pixel 单测：${passed} 通过 / ${failed} 失败`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
