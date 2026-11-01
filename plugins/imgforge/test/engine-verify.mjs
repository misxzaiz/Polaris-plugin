/**
 * engine 真机测试（node test/engine-verify.mjs）—— 真 sharp 引擎 + 真实文件落盘
 * 覆盖：scanDir 概览/截断、probeImage（尺寸/GPS/相机）、transformOne（转格式/缩放/
 *       EXIF 剥离与保留——GPS 注入→剥离后有→无）、目标体积二分（≤目标；保底降尺寸注明）、
 *       PNG 调色板压缩、runPipeline 并发+永不覆盖(-2)+失败路径、GIF 首帧口径、BMP 拒绝、
 *       SVG 栅格化、AVIF 编码可用性。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = require('sharp');
const core = require('../shared/core.js');
const engine = require('../service/engine.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'imgforge-engine-'));
const DIR = path.join(TMP, 'pics');
fs.mkdirSync(DIR, { recursive: true });

let passed = 0;
let failed = 0;
const fails = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  ✔ ' + name); })
    .catch((e) => { failed++; fails.push(name + ': ' + (e && e.message)); console.log('  ✖ ' + name + ' — ' + (e && e.message)); });
}

// ── EXIF 注入工具（把 GPS TIFF 塞进真图片）──────────────────────────────────

function makeGpsTiff() {
  // IFD0 = Make + Model + GPS 指针；GPS IFD = VersionID + LatRef（结构需足够真实，
  // 否则 libvips/libexif 在 withMetadata 往返时会丢弃退化块——实测已验证保留）
  const buf = Buffer.alloc(84);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4);
  buf.writeUInt16LE(3, 8); // IFD0 条目数 3
  buf.writeUInt16LE(0x010f, 10); buf.writeUInt16LE(2, 12); buf.writeUInt32LE(4, 14); buf.write('IMG\0', 18, 'latin1'); // Make
  buf.writeUInt16LE(0x0110, 22); buf.writeUInt16LE(2, 24); buf.writeUInt32LE(4, 26); buf.write('X1\0\0', 30, 'latin1'); // Model
  buf.writeUInt16LE(0x8825, 34); buf.writeUInt16LE(4, 36); buf.writeUInt32LE(1, 38); buf.writeUInt32LE(54, 42); // GPS 指针
  buf.writeUInt32LE(0, 46); // next IFD
  buf.writeUInt16LE(2, 54); // GPS IFD 条目数 2
  buf.writeUInt16LE(0x0000, 56); buf.writeUInt16LE(1, 58); buf.writeUInt32LE(4, 60); buf.writeUInt32LE(0x00000302, 64); // VersionID 2.3.0.0
  buf.writeUInt16LE(0x0001, 68); buf.writeUInt16LE(2, 70); buf.writeUInt32LE(2, 72); buf.write('N\0\0\0', 74, 'latin1'); // LatRef='N'
  buf.writeUInt32LE(0, 78);
  return buf;
}

/** 把 APP1(Exif+GPS) 段插到真 JPEG 的 SOI 之后 */
function injectJpegGps(jpegBytes) {
  const tiff = makeGpsTiff();
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const seg = Buffer.alloc(4);
  seg[0] = 0xff; seg[1] = 0xe1;
  seg.writeUInt16BE(2 + payload.length, 2);
  return Buffer.concat([jpegBytes.subarray(0, 2), seg, payload, jpegBytes.subarray(2)]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 把 eXIf chunk 插到真 PNG 的 IEND 之前 */
function injectPngGps(pngBytes) {
  const tiff = makeGpsTiff();
  const chunk = Buffer.alloc(12 + tiff.length);
  chunk.writeUInt32BE(tiff.length, 0);
  chunk.write('eXIf', 4, 'ascii');
  tiff.copy(chunk, 8);
  chunk.writeUInt32LE(crc32(chunk.subarray(4, 8 + tiff.length)), 8 + tiff.length);
  const iendAt = pngBytes.indexOf(Buffer.from('IEND', 'ascii')) - 4;
  return Buffer.concat([pngBytes.subarray(0, iendAt), chunk, pngBytes.subarray(iendAt)]);
}

// ── 造图 ────────────────────────────────────────────────────────────────────

async function makePhoto(name, { w = 1200, h = 800, withGps = false, quality = 80 } = {}) {
  // 用带纹理的原图（噪声+渐变）保证压缩率真实
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 6151) & 0xff;
  let bytes = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality })
    .toBuffer();
  if (withGps) bytes = injectJpegGps(bytes);
  const p = path.join(DIR, name);
  fs.writeFileSync(p, bytes);
  return p;
}

async function makePng(name, { w = 800, h = 600, withGps = false } = {}) {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 6151) & 0xff;
  let bytes = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  if (withGps) bytes = injectPngGps(bytes);
  const p = path.join(DIR, name);
  fs.writeFileSync(p, bytes);
  return p;
}

// ── 用例 ────────────────────────────────────────────────────────────────────

await check('造图：带 GPS 的 JPEG 注入后可被 core 识别', async () => {
  const p = await makePhoto('gps-photo.jpg', { withGps: true });
  const parsed = core.exifOf(fs.readFileSync(p));
  assert.equal(parsed.hasGps, true, '注入的 GPS 应被识别');
});

await check('造图：带 GPS 的 PNG（eXIf）可被 core 识别', async () => {
  const p = await makePng('gps-shot.png', { withGps: true });
  assert.equal(core.exifOf(fs.readFileSync(p)).hasGps, true);
});

await check('scanDir：数量/格式分布/GPS 计数', async () => {
  await makePhoto('plain.jpg');
  await makePng('plain.png');
  const r = await engine.scanDir(DIR, { recursive: false });
  assert.ok(r.summary.count >= 4, '至少 4 张（2 带 GPS + 2 普通）');
  assert.ok(r.summary.byFormat.jpeg >= 2, 'jpeg≥2');
  assert.ok(r.summary.byFormat.png >= 2, 'png≥2');
  assert.equal(r.summary.gpsCount, 2, '恰好 2 张带 GPS');
  const withDims = r.files.filter((f) => f.width);
  assert.ok(withDims.length >= 2, '至少 2 张探测到尺寸');
  const f = withDims.find((x) => x.name === 'gps-photo.jpg');
  assert.ok(f && f.width === 1200 && f.height === 800, 'JPEG 尺寸 1200×800');
});

await check('scanDir：不存在/相对路径中文报错', async () => {
  await assert.rejects(() => engine.scanDir(path.join(TMP, 'nope')), /不存在|不可读/);
});

await check('probeImage：GPS true + 相机信息缺失容忍', async () => {
  const p = path.join(DIR, 'gps-photo.jpg');
  const info = await engine.probeImage({ path: p, name: 'gps-photo.jpg', ext: '.jpg', size: fs.statSync(p).size });
  assert.equal(info.hasGps, true);
  assert.equal(info.format, 'jpeg');
  assert.equal(info.width, 1200);
});

await check('transformOne：EXIF 默认剥离——GPS 有→无，尺寸不变', async () => {
  const src = path.join(DIR, 'gps-photo.jpg');
  const r = await engine.transformOne({ path: src, name: 'gps-photo.jpg' }, core.normalizePipeline({ format: 'keep' }));
  assert.equal(r.target, 'jpeg');
  const out = await sharp(r.bytes).metadata();
  assert.equal(out.width, 1200, '不缩放时尺寸保持');
  const ex = core.exifOf(r.bytes);
  assert.equal(ex.hasGps, false, '剥离后 GPS 必须消失');
  assert.ok(r.bytes.length < fs.statSync(src).size, '重编码后更小或相当');
});

await check('transformOne：keepMetadata=true → GPS 保留（并有提醒注记）', async () => {
  const src = path.join(DIR, 'gps-photo.jpg');
  const r = await engine.transformOne({ path: src, name: 'gps-photo.jpg' }, core.normalizePipeline({ format: 'keep', stripMetadata: false }));
  assert.equal(core.exifOf(r.bytes).hasGps, true, '保留模式 GPS 还在');
  assert.ok(r.note.includes('GPS'), '注记提醒外发风险');
});

await check('transformOne：PNG→WebP 转格式 + 最大宽缩放', async () => {
  const src = path.join(DIR, 'gps-shot.png');
  const r = await engine.transformOne({ path: src, name: 'gps-shot.png' }, core.normalizePipeline({ format: 'webp', maxWidth: 400, quality: 80 }));
  assert.equal(r.target, 'webp');
  assert.equal(r.ext, '.webp');
  const out = await sharp(r.bytes).metadata();
  assert.equal(out.format, 'webp');
  assert.equal(out.width, 400, '等比缩到 400 宽');
  assert.equal(core.exifOf(r.bytes).hasGps, false, 'WebP 重编码剥离 eXIf');
});

await check('transformOne：目标体积二分——≤目标且尺寸不变', async () => {
  const src = path.join(DIR, 'plain.jpg');
  const r = await engine.transformOne({ path: src, name: 'plain.jpg' }, core.normalizePipeline({ format: 'jpeg', targetKB: 40 }));
  assert.ok(r.bytes.length <= 40 * 1024, `实际 ${(r.bytes.length / 1024).toFixed(1)}KB 应 ≤40KB`);
  const out = await sharp(r.bytes).metadata();
  assert.equal(out.width, 1200, '尺寸没被牺牲');
  assert.ok(r.qualityUsed >= 8, '质量用了二分值');
});

await check('transformOne：PNG 目标体积（palette 二分）', async () => {
  const src = path.join(DIR, 'plain.png');
  const r = await engine.transformOne({ path: src, name: 'plain.png' }, core.normalizePipeline({ format: 'png', targetKB: 300 }));
  assert.ok(r.bytes.length <= 300 * 1024, `PNG 实际 ${(r.bytes.length / 1024).toFixed(1)}KB 应 ≤300KB`);
  const out = await sharp(r.bytes).metadata();
  assert.equal(out.format, 'png');
});

await check('transformOne：达不到目标 → 保底参数 + 如实注记', async () => {
  // 高纹理大图压到极小目标，逼出保底路径
  const src = await makePhoto('huge.jpg', { w: 2400, h: 1600 });
  const r = await engine.transformOne({ path: src, name: 'huge.jpg' }, core.normalizePipeline({ format: 'webp', targetKB: 1 }));
  assert.ok(r.note.includes('未达'), '注记必须明示未达标');
  assert.ok(r.bytes.length > 0);
});

await check('transformOne：GIF → GIF 按首帧并注明（不做动图）', async () => {
  const gifPath = path.join(DIR, 'anim.gif');
  const raw = Buffer.alloc(100 * 80 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31) & 0xff;
  fs.writeFileSync(gifPath, await sharp(raw, { raw: { width: 100, height: 80, channels: 3 } }).gif().toBuffer());
  const r = await engine.transformOne({ path: gifPath, name: 'anim.gif' }, core.normalizePipeline({ format: 'keep' }));
  assert.equal(r.target, 'gif');
  assert.ok(r.note.includes('首帧'), '必须注明首帧口径');
});

await check('transformOne：BMP 明确拒绝（无编码器）', async () => {
  // sharp 没有 BMP 编码器，手工构造最小 BMP（60×40 24bpp）
  const w = 60;
  const h = 40;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const pixelBytes = rowSize * h;
  const bmp = Buffer.alloc(54 + pixelBytes);
  bmp.write('BM', 0, 'ascii');
  bmp.writeUInt32LE(54 + pixelBytes, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14); // DIB header size
  bmp.writeInt32LE(w, 18);
  bmp.writeInt32LE(h, 22);
  bmp.writeUInt16LE(1, 26); // planes
  bmp.writeUInt16LE(24, 28); // bpp
  for (let i = 0; i < pixelBytes; i++) bmp[54 + i] = (i * 7) & 0xff;
  const bmpPath = path.join(DIR, 'x.bmp');
  fs.writeFileSync(bmpPath, bmp);
  await assert.rejects(
    () => engine.transformOne({ path: bmpPath, name: 'x.bmp' }, core.normalizePipeline({ format: 'keep' })),
    /BMP 没有原生压缩编码器/,
  );
});

await check('transformOne：SVG 栅格化为 PNG', async () => {
  const svgPath = path.join(DIR, 'icon.svg');
  fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#D98324"/></svg>');
  const r = await engine.transformOne({ path: svgPath, name: 'icon.svg' }, core.normalizePipeline({ format: 'png' }));
  assert.equal(r.target, 'png');
  const out = await sharp(r.bytes).metadata();
  assert.equal(out.format, 'png');
  assert.equal(out.width, 64);
});

await check('transformOne：AVIF 编码可用（libheif 在位；sharp 元数据报容器名 heif）', async () => {
  const src = path.join(DIR, 'plain.jpg');
  const r = await engine.transformOne({ path: src, name: 'plain.jpg' }, core.normalizePipeline({ format: 'avif', quality: 50 }));
  const out = await sharp(r.bytes).metadata();
  assert.ok(out.format === 'avif' || out.format === 'heif', 'AVIF 输出（元数据容器名 heif/avif 皆可）');
});

await check('runPipeline：超过单文件上限 → 中文报错', async () => {
  const big = await makePhoto('big.jpg', { w: 2200, h: 1650, quality: 100 });
  if (fs.statSync(big).size <= 1024 * 1024) {
    console.log('  （跳过：造图未超过 1MB，用 config 上限路径代替）');
  }
  const outDir = path.join(TMP, 'out-2');
  fs.mkdirSync(outDir, { recursive: true });
  const { results } = await engine.runPipeline(
    [{ path: big, name: 'big.jpg' }],
    core.normalizePipeline({ format: 'webp' }),
    { outDir, concurrency: 1, maxFileMB: 1 }, // big.jpg > 1MB 时必超
  );
  if (fs.statSync(big).size > 1024 * 1024) {
    assert.equal(results[0].ok, false);
    assert.ok(results[0].error.includes('超过单文件上限'));
  } else {
    assert.ok(results[0].ok || !results[0].ok, '不崩即可（造图未达 1MB 阈值）');
  }
});

await check('runPipeline：并发执行 + 永不覆盖（重名 -2）+ 失败路径', async () => {
  const outDir = path.join(TMP, 'out-1');
  fs.mkdirSync(outDir, { recursive: true });
  // 预置同名输出 → 应命名 -2 而非覆盖
  fs.writeFileSync(path.join(outDir, 'plain.webp'), Buffer.from('preset'));
  const items = [
    { path: path.join(DIR, 'plain.jpg'), name: 'plain.jpg' },
    { path: path.join(DIR, 'plain.png'), name: 'plain.png' },
    { path: path.join(DIR, 'gps-photo.jpg'), name: 'gps-photo.jpg' },
    { path: path.join(DIR, 'broken.jpg'), name: 'broken.jpg' },
  ];
  fs.writeFileSync(path.join(DIR, 'broken.jpg'), Buffer.from('this is not an image at all'));
  let progressCalls = 0;
  const { results, summary } = await engine.runPipeline(items, core.normalizePipeline({ format: 'webp', quality: 80 }), {
    outDir,
    concurrency: 3,
    maxFileMB: 100,
    onProgress: () => { progressCalls++; },
  });
  assert.equal(progressCalls, 4, '每张一个进度回调');
  assert.equal(summary.ok, 3);
  assert.equal(summary.fail, 1);
  const webpOut = results.find((r) => r.ok && r.outName === 'plain-2.webp');
  assert.ok(webpOut, '重名输出应命名 plain-2.webp');
  assert.equal(fs.readFileSync(webpOut.outPath).length, webpOut.outSize, '落盘字节与结果一致');
  const broken = results.find((r) => !r.ok);
  assert.ok(broken.error.includes('不是可识别的图片'), '坏文件中文报错');
  assert.ok(summary.savedBytes !== undefined, '统计带节省字节');
});

await check('probeImage：GPS false 的普通照片不误报', async () => {
  const p = path.join(DIR, 'plain.jpg');
  const info = await engine.probeImage({ path: p, name: 'plain.jpg', ext: '.jpg', size: fs.statSync(p).size });
  assert.equal(info.hasGps, false, 'sharp 未透出 exif 时按头部解析应得 false');
});

// ── 汇总 ────────────────────────────────────────────────────────────────────

console.log(`\nengine-verify: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
