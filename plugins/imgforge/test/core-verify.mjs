/**
 * core 纯函数测试（node --test test/core-verify.mjs）
 * 覆盖：魔数识别、EXIF GPS 检测（手工构造 JPEG APP1/PNG eXIf/WebP EXIF/裸 TIFF）、
 *       设置与管道归一、输出命名冲突链、stem 消毒、路径护栏、字节格式化、管道摘要。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

// ── 手工构造最小 EXIF/TIFF（含 GPS IFD）──────────────────────────────────────

/** 最小 TIFF：IFD0 带 GPS 指针 → GPS IFD 1 条目（GPSLatitudeRef='N'） */
function makeTiff({ withGps = true } = {}) {
  const buf = Buffer.alloc(48);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4); // IFD0 offset
  if (withGps) {
    buf.writeUInt16LE(1, 8); // IFD0 entry count = 1
    buf.writeUInt16LE(0x8825, 10); // GPS Info IFD pointer
    buf.writeUInt16LE(4, 12); // type LONG
    buf.writeUInt32LE(1, 14); // count
    buf.writeUInt32LE(30, 18); // value = GPS IFD offset
    buf.writeUInt32LE(0, 22); // next IFD = 0
    buf.writeUInt16LE(1, 30); // GPS IFD entry count = 1
    buf.writeUInt16LE(0x0001, 32); // GPSLatitudeRef
    buf.writeUInt16LE(2, 34); // type ASCII
    buf.writeUInt32LE(2, 36); // count
    buf.write('N\0\0\0', 38, 'latin1'); // inline value
    buf.writeUInt32LE(0, 42); // next = 0
  } else {
    buf.writeUInt16LE(0, 8); // IFD0 无条目
    buf.writeUInt32LE(0, 10);
  }
  return buf;
}

/** JPEG 包裹：SOI + APP1(Exif) + EOI */
function makeJpeg(tiff) {
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(2 + app1.length, 4);
  return Buffer.concat([head, app1, Buffer.from([0xff, 0xd9])]);
}

/** PNG 包裹：签名 + IHDR 壳 + eXIf + IEND（CRC32 真算） */
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
function makePng(tiff) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25); // len(4) + 'IHDR'(4) + data(13) + crc(4)
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  // 数据 13 字节全 0（壳即可，core 不解析 IHDR）
  ihdr.writeUInt32LE(crc32(ihdr.subarray(4, 17)), 21);
  const exifData = tiff;
  const exif = Buffer.alloc(12 + exifData.length);
  exif.writeUInt32BE(exifData.length, 0);
  exif.write('eXIf', 4, 'ascii');
  exifData.copy(exif, 8);
  exif.writeUInt32LE(crc32(exif.subarray(4, 8 + exifData.length)), 8 + exifData.length);
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([sig, ihdr, exif, iend]);
}

/** WebP 包裹：RIFF + WEBP + EXIF chunk（带 4 字节偏移前缀变体） */
function makeWebp(tiff, { offsetPrefix = false } = {}) {
  const payload = offsetPrefix ? Buffer.concat([Buffer.from([0, 0, 0, 0]), tiff]) : tiff;
  const exifChunk = Buffer.alloc(8 + payload.length + (payload.length % 2));
  exifChunk.write('EXIF', 0, 'ascii');
  exifChunk.writeUInt32LE(payload.length, 4);
  payload.copy(exifChunk, 8);
  const vp8 = Buffer.alloc(8 + 16);
  vp8.write('VP8 ', 0, 'ascii');
  vp8.writeUInt32LE(16, 4);
  const riffSize = 4 + vp8.length + exifChunk.length;
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(riffSize, 4);
  head.write('WEBP', 8, 'ascii');
  return Buffer.concat([head, vp8, exifChunk]);
}

// ── imageKind ───────────────────────────────────────────────────────────────

test('imageKind：八种魔数与未知', () => {
  const j = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const p = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const w = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
  const g = Buffer.from('GIF89a\x00\x00\x00\x00\x00\x00\x00\x00', 'ascii');
  const b = Buffer.from('BM\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'ascii');
  const t = Buffer.from('II\x2a\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'ascii');
  const a = Buffer.from('....ftypavif....', 'ascii');
  const s = Buffer.from('<?xml version="1.0"?><svg/>', 'ascii');
  assert.equal(core.imageKind(j), 'jpeg');
  assert.equal(core.imageKind(p), 'png');
  assert.equal(core.imageKind(w), 'webp');
  assert.equal(core.imageKind(g), 'gif');
  assert.equal(core.imageKind(b), 'bmp');
  assert.equal(core.imageKind(t), 'tiff');
  assert.equal(core.imageKind(a), 'avif');
  assert.equal(core.imageKind(s), 'svg');
  assert.equal(core.imageKind(Buffer.from('not an image at all!')), null);
  assert.equal(core.imageKind(Buffer.alloc(4)), null);
});

// ── EXIF GPS 检测（隐私主张的核心断言）─────────────────────────────────────

test('exifOf：JPEG APP1 含 GPS → true；不含 → false；损坏 → null', () => {
  assert.equal(core.exifOf(makeJpeg(makeTiff({ withGps: true }))).hasGps, true);
  assert.equal(core.exifOf(makeJpeg(makeTiff({ withGps: false }))).hasGps, false);
  assert.equal(core.exifOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 'JF', 0].flat())).hasGps, null);
  assert.equal(core.exifOf(Buffer.from([0xff, 0xd8])).hasGps, null);
});

test('exifOf：PNG eXIf 含 GPS → true', () => {
  assert.equal(core.exifOf(makePng(makeTiff({ withGps: true }))).hasGps, true);
  assert.equal(core.exifOf(makePng(makeTiff({ withGps: false }))).hasGps, false);
});

test('exifOf：WebP EXIF（含 4 字节偏移前缀变体）', () => {
  assert.equal(core.exifOf(makeWebp(makeTiff({ withGps: true }))).hasGps, true);
  assert.equal(core.exifOf(makeWebp(makeTiff({ withGps: true }), { offsetPrefix: true })).hasGps, true);
  assert.equal(core.exifOf(makeWebp(makeTiff({ withGps: false }))).hasGps, false);
});

test('exifOf：AVIF/GIF → hasGps=null（未知口径），裸 TIFF 直接判', () => {
  const avif = Buffer.from('....ftypavif....', 'ascii');
  assert.equal(core.exifOf(avif).hasGps, null);
  assert.equal(core.exifOf(makeTiff({ withGps: true })).hasGps, true);
});

test('tiffIfd0Ascii：读 Make/Model', () => {
  // IFD0 大端：Make(0x010F) count=4 内联 'ABC\0'；Model(0x0110) count=2 内联 'XY\0\0'
  const buf = Buffer.alloc(48);
  buf.write('MM', 0, 'ascii');
  buf.writeUInt16BE(42, 2);
  buf.writeUInt32BE(8, 4);
  buf.writeUInt16BE(2, 8);      // IFD0 条目数 2
  buf.writeUInt16BE(0x010f, 10); // Make
  buf.writeUInt16BE(2, 12);      // ASCII
  buf.writeUInt32BE(4, 14);      // count 4
  buf.write('ABC\0', 18, 'latin1'); // 值内联（count=4 恰好占满值字段）
  buf.writeUInt16BE(0x0110, 22); // Model
  buf.writeUInt16BE(2, 24);
  buf.writeUInt32BE(2, 26);      // count 2
  buf.writeUInt32BE(0x58590000, 30); // 'XY\0\0' 内联（BE）
  buf.writeUInt32BE(0, 34);      // next IFD = 0
  const r = core.tiffIfd0Ascii(buf);
  assert.equal(r.make, 'ABC');
  assert.equal(r.model, 'XY');
});

// ── 设置与管道归一 ──────────────────────────────────────────────────────────

test('normalizeSettings：默认值/钳制/非法输入', () => {
  const d = core.normalizeSettings(null);
  assert.deepEqual(d, { outDir: '', concurrency: 3, maxBatch: 300, maxFileMB: 100, historyCap: 100 });
  assert.equal(core.normalizeSettings({ concurrency: 99 }).concurrency, 8);
  assert.equal(core.normalizeSettings({ concurrency: -5 }).concurrency, 1);
  assert.equal(core.normalizeSettings({ maxBatch: 'x' }).maxBatch, 300);
  assert.equal(core.normalizeSettings({ outDir: '  C:\\out  ' }).outDir, 'C:\\out');
  assert.equal(core.normalizeSettings('junk').concurrency, 3);
});

test('normalizePipeline：格式白名单/质量钳制/stripMetadata 默认 true', () => {
  const p = core.normalizePipeline({ format: 'webp', quality: 500, maxWidth: -3, targetKB: 0 });
  assert.equal(p.format, 'webp');
  assert.equal(p.quality, 100);
  assert.equal(p.maxWidth, null);
  assert.equal(p.targetKB, null);
  assert.equal(p.stripMetadata, true);
  assert.equal(core.normalizePipeline({ format: 'exe' }).format, 'keep');
  assert.equal(core.normalizePipeline({}).stripMetadata, true);
  assert.equal(core.normalizePipeline({ stripMetadata: false }).stripMetadata, false);
  const p2 = core.normalizePipeline({ quality: 'nan' });
  assert.equal(p2.quality, null);
});

test('pipelineLabel：说清做了什么', () => {
  const label = core.pipelineLabel(core.normalizePipeline({ format: 'webp', quality: 80, maxWidth: 1920, targetKB: 200 }));
  assert.ok(label.includes('WebP'), label);
  assert.ok(label.includes('质量 80'), label);
  assert.ok(label.includes('宽≤1920'), label);
  assert.ok(label.includes('目标 200KB'), label);
  assert.ok(label.includes('剥 EXIF'), label);
  assert.ok(core.pipelineLabel(core.normalizePipeline({ format: 'keep' })).includes('保持原格式'));
});

// ── 命名与消毒 ──────────────────────────────────────────────────────────────

test('pickOutputName：冲突链 -2/-3，永不覆盖', () => {
  const taken = new Set(['C:\\out\\a.webp', 'C:\\out\\a-2.webp']);
  const exists = (p) => taken.has(p);
  assert.equal(core.pickOutputName('C:\\out', 'a', '.webp', exists), 'C:\\out\\a-3.webp');
  assert.equal(core.pickOutputName('C:\\out', 'a', '.webp', () => false), 'C:\\out\\a.webp');
  assert.equal(core.pickOutputName('C:\\out', 'a', 'webp', () => false), 'C:\\out\\a.webp', '缺点号自动补');
});

test('sanitizeStem：路径成分/保留名/非法字符/空回退', () => {
  assert.equal(core.sanitizeStem('C:\\evil\\path\\img.png'), 'img');
  assert.equal(core.sanitizeStem('a<b>:c?.png'), 'a_b__c_');
  assert.equal(core.sanitizeStem('CON.png'), '_CON');
  assert.equal(core.sanitizeStem('com1.jpg'), '_com1');
  assert.equal(core.sanitizeStem('.hidden.png'), 'hidden');
  assert.equal(core.sanitizeStem(''), 'image');
  assert.equal(core.sanitizeStem('...'), 'image');
  assert.equal(core.sanitizeStem('normal-name_1.webp'), 'normal-name_1');
});

// ── 路径护栏 ────────────────────────────────────────────────────────────────

test('guardAbsolute：相对路径/空/空字节拒绝，绝对放行', () => {
  assert.throws(() => core.guardAbsolute('', '目录'), /缺少目录路径/);
  assert.throws(() => core.guardAbsolute('pics/sub', '目录'), /绝对路径/);
  assert.throws(() => core.guardAbsolute('C:\\a\0b', '目录'), /空字节/);
  assert.equal(core.guardAbsolute(' C:\\pics ', '目录'), 'C:\\pics');
  assert.equal(core.guardAbsolute('\\\\server\\share', '目录'), '\\\\server\\share');
  assert.equal(core.guardAbsolute('/home/me/pics', '目录'), '/home/me/pics');
});

// ── 字节格式化 ──────────────────────────────────────────────────────────────

test('formatBytes：B/KB/MB/GB 与非法值', () => {
  assert.equal(core.formatBytes(512), '512 B');
  assert.equal(core.formatBytes(2048), '2.0 KB');
  assert.equal(core.formatBytes(3 * 1024 * 1024), '3.0 MB');
  assert.equal(core.formatBytes(1.5 * 1024 ** 3), '1.50 GB');
  assert.equal(core.formatBytes(-1), '?');
  assert.equal(core.formatBytes(NaN), '?');
});
