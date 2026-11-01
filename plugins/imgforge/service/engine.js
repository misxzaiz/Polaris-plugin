'use strict';
/**
 * engine.js —— 图片工坊（imgforge）sharp 引擎（服务与 MCP 共用，口径不漂移）
 *
 * 职责：目录扫描（魔数+尺寸+GPS）、单图信息、批量变换管线（并发池）、
 *       「目标体积」二分逼近、永不覆盖落盘。
 * 纪律：输入永不修改/删除；输出永不覆盖（-2/-3 递增）；零外网请求。
 *       stripMetadata=true 时 sharp 默认不回写元数据（即剥离）；false 时 withMetadata 保留。
 */

const fs = require('fs');
const path = require('path');
const core = require('../shared/core.js');

let sharpLib = null;
function getSharp() {
  if (!sharpLib) {
    try {
      sharpLib = require('sharp');
    } catch (e) {
      throw new Error('sharp 引擎加载失败：' + (e && e.message) + '（插件目录需包含 node_modules/sharp）');
    }
  }
  return sharpLib;
}

/** 单文件输入上限硬顶（设置可收紧，不可越过） */
const HARD_MAX_FILE_BYTES = 1024 * 1024 * 1024;

// ── 探测 ─────────────────────────────────────────────────────────────────────

/** 读文件头部（EXIF 检测窗口；JPEG APP1/EXIF 几乎总在前 1MB） */
function readHead(p, size) {
  const want = Math.min(size, 1024 * 1024);
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(want);
    const got = fs.readSync(fd, buf, 0, want, 0);
    return got === want ? buf : buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

/** 读文件头 n 字节（魔数预筛只需 4KB；EXIF 检测窗口另行 1MB） */
function readHeadN(p, n) {
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return got === n ? buf : buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 快速列目录图片（默认魔数预筛：假扩展名文件不算图片，进 skippedNonImage）。
 * 返回 { files: [{path,name,ext,size}], skippedNonImage: string[] }
 */
function listImageFiles(dir, { recursive = false, maxScan = 2000, verifyMagic = true } = {}) {
  const out = [];
  const skippedNonImage = [];
  const walk = (d, depth) => {
    if (out.length >= maxScan) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      throw new Error('目录不可读：' + d + '（' + (e && e.code || e.message) + '）');
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (out.length >= maxScan) return;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (recursive && depth < 8) walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (core.SUPPORTED_SCAN_EXTS.indexOf(ext) < 0) continue;
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch (_) {
        continue; // 瞬时消失的文件直接跳过
      }
      if (verifyMagic) {
        try {
          if (!core.imageKind(readHeadN(full, 4096))) {
            skippedNonImage.push(ent.name + '（扩展名是图片但内容不是）');
            continue;
          }
        } catch (_) {
          continue; // 读不了的头当作不存在
        }
      }
      out.push({ path: full, name: ent.name, ext, size });
    }
  };
  walk(dir, 0);
  return { files: out, skippedNonImage };
}

/**
 * 探测单图元信息：{path,name,size,format,width,height,hasGps,exif}
 * format 以 sharp 元数据为准（魔数只做兜底）；hasGps: true/false/null(未知)。
 */
async function probeImage(item) {
  const sharp = getSharp();
  const st = fs.statSync(item.path);
  const head = readHead(item.path, st.size);
  const magic = core.imageKind(head);
  const meta = { hasGps: null, exif: {} };
  let dims = { width: null, height: null, format: magic || core.extToFormat(item.ext) };
  try {
    const m = await sharp(item.path, { failOn: 'none' }).metadata();
    dims = { width: m.width || null, height: m.height || null, format: m.format || dims.format };
    if (m.exif && Buffer.isBuffer(m.exif) && m.exif.length > 8 && (m.exif[0] === 0x49 || m.exif[0] === 0x4d)) {
      // sharp 的 exif 是裸 TIFF Buffer：直接按 TIFF 解析（与 core.exifOf 同一实现）
      meta.hasGps = core.tiffHasGps(m.exif);
      meta.exif = core.tiffIfd0Ascii(m.exif);
    } else {
      // 兜底：按文件头魔数自行定位 EXIF（覆盖 sharp 未透出的容器形态）
      const parsed = core.exifOf(head);
      meta.hasGps = parsed.hasGps;
      meta.exif = parsed.exif;
    }
  } catch (e) {
    dims.error = '无法解析（' + String((e && e.message) || e).slice(0, 80) + '）';
  }
  return Object.assign({}, item, dims, meta);
}

/** 目录扫描：先列（快+魔数预筛）再并发探测尺寸/GPS（受 probeLimit 约束，防止万张目录卡死） */
async function scanDir(dir, { recursive = false, maxScan = 2000, probeLimit = 500, concurrency = 8 } = {}) {
  const { files: listed, skippedNonImage } = listImageFiles(dir, { recursive, maxScan });
  const truncated = listed.length >= maxScan;
  const bySizeDesc = listed.slice().sort((a, b) => b.size - a.size);
  const toProbe = bySizeDesc.slice(0, probeLimit);
  const probed = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < toProbe.length) {
      const it = toProbe[cursor++];
      try {
        probed.set(it.path, await probeImage(it));
      } catch (_) { /* 单文件探测失败：保留基础信息 */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toProbe.length) }, worker));
  const files = listed.map((it) => probed.get(it.path) || it);
  const summary = {
    count: files.length,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    byFormat: {},
    gpsCount: 0,
    gpsUnknown: 0,
  };
  for (const f of files) {
    const k = f.format || '未知';
    summary.byFormat[k] = (summary.byFormat[k] || 0) + 1;
    if (f.hasGps === true) summary.gpsCount++;
    else if (f.hasGps === null) summary.gpsUnknown++;
  }
  return { dir, files, truncated, summary, skippedNonImage };
}

// ── 编码 ─────────────────────────────────────────────────────────────────────

/** 目标格式解析：keep 时沿用原格式；无编码器格式（bmp/svg）给中文口径错误 */
function resolveTarget(origFormat, pipeline) {
  let target = pipeline.format === 'keep' ? origFormat : pipeline.format;
  if (!target) target = 'png';
  if (target === 'bmp' || target === 'svg') {
    throw new Error(target === 'bmp'
      ? 'BMP 没有原生压缩编码器：请显式选择 PNG/WebP/JPEG 输出'
      : 'SVG 是矢量文本格式：请选择 PNG/WebP 等栅格输出（本引擎可把 SVG 渲染成位图）');
  }
  return target;
}

/** 构造一个 sharp 链（每次编码独立构造，避免实例复用副作用；rotate()=按 EXIF orientation 先回正） */
async function buildChain(bytes, pipeline, scale) {
  const sharp = getSharp();
  const chain = sharp(bytes, { failOn: 'none', limitInputPixels: 268402687 }).rotate();
  let out = pipeline.stripMetadata === false ? chain.withMetadata() : chain;
  if (pipeline.maxWidth || pipeline.maxHeight) {
    out = out.resize({
      width: pipeline.maxWidth || undefined,
      height: pipeline.maxHeight || undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  if (scale && scale < 1) {
    // 尺寸二分降级：先探测原尺寸，再按比例缩边（探测失败则跳过缩放，质量二分兜底）
    let w = 0;
    let h = 0;
    try {
      const m = await sharp(bytes, { failOn: 'none' }).metadata();
      w = m.width || 0;
      h = m.height || 0;
    } catch (_) { /* 保持不缩 */ }
    if (w > 0 && h > 0) {
      out = out.resize({ width: Math.max(16, Math.round(w * scale)), height: Math.max(16, Math.round(h * scale)) });
    }
  }
  return out;
}

/** 按目标格式编码（quality 已归一） */
async function encodeWith(bytes, target, quality, pipeline, scale) {
  const chain = await buildChain(bytes, pipeline, scale);
  switch (target) {
    case 'jpeg': return { buf: await chain.jpeg({ quality, mozjpeg: true }).toBuffer(), q: quality };
    case 'webp': return { buf: await chain.webp({ quality }).toBuffer(), q: quality };
    case 'avif': return { buf: await chain.avif({ quality, effort: 4 }).toBuffer(), q: quality };
    case 'tiff': return { buf: await chain.tiff({ quality }).toBuffer(), q: quality };
    case 'png': return quality < 100
      ? { buf: await chain.png({ palette: true, quality, effort: 7 }).toBuffer(), q: quality }
      : { buf: await chain.png({ compressionLevel: 9 }).toBuffer(), q: 100 };
    case 'gif': return { buf: await chain.gif().toBuffer(), q: quality }; // 动图取首帧（口径见 README）
    default: throw new Error('不支持的输出格式：' + target);
  }
}

/**
 * 目标体积二分：在 [8, startQ] 里找 ≤targetBytes 的最大质量；q=8 仍超则按比例逐级降尺寸重试。
 * 返回 { buf, q, scaled } 或 null（保底也达不到 → 调用方用保底参数结果并注明未达标）。
 */
async function bisectTarget(bytes, target, pipeline, targetBytes, startQ) {
  let best = null;
  const scales = [1, 0.85, 0.72, 0.6, 0.5, 0.4, 0.3];
  for (const scale of scales) {
    let lo = 8;
    let hi = Math.max(8, startQ);
    while (lo <= hi) {
      const q = Math.round((lo + hi) / 2);
      // eslint-disable-next-line no-await-in-loop
      const r = await encodeWith(bytes, target, q, pipeline, scale);
      if (r.buf.length <= targetBytes) {
        best = { buf: r.buf, q, scaled: scale < 1 ? scale : null };
        lo = q + 1;
      } else {
        hi = q - 1;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * 变换单图（内存内）：返回 { bytes, target, qualityUsed, scaled, note }
 * 不落盘——落盘由调用方按「永不覆盖」纪律执行（service/main.js 与 mcp/server.js 各自实现）。
 */
async function transformOne(item, pipeline) {
  const st = fs.statSync(item.path);
  if (st.size > HARD_MAX_FILE_BYTES) {
    throw new Error('文件 ' + core.formatBytes(st.size) + ' 超过硬顶上限 1 GB，拒绝处理');
  }
  const bytes = fs.readFileSync(item.path);
  const magic = core.imageKind(bytes);
  if (!magic) throw new Error('不是可识别的图片（魔数不匹配）');
  const origFormat = magic;
  const target = resolveTarget(origFormat, pipeline);
  const note = [];
  if (origFormat === 'gif' && target === 'gif') note.push('GIF 按首帧处理（本引擎不做动图重编码）');
  if (origFormat === 'svg') note.push('SVG 已渲染为 ' + target.toUpperCase() + ' 位图');
  const qDefault = pipeline.quality || core.DEFAULT_QUALITY[target] || 82;
  let out;
  if (pipeline.targetKB && core.BISECTABLE[target]) {
    const hit = await bisectTarget(bytes, target, pipeline, pipeline.targetKB * 1024, Math.min(qDefault, 95));
    if (hit) {
      out = { buf: hit.buf, q: hit.q, scaled: hit.scaled };
    } else {
      const floor = await encodeWith(bytes, target, 8, pipeline, 0.3);
      out = floor;
      note.push('已用保底参数（质量 8 + 缩至 30%）仍 ' + core.formatBytes(floor.buf.length) + '，未达 ' + pipeline.targetKB + 'KB 目标');
    }
  } else {
    const r = await encodeWith(bytes, target, qDefault, pipeline, 1);
    out = r;
  }
  if (pipeline.stripMetadata === false && (origFormat === 'jpeg' || origFormat === 'png' || origFormat === 'tiff' || origFormat === 'webp')) {
    note.push('EXIF 已保留（含 GPS——外发前请确认）');
  }
  return {
    bytes: out.buf,
    target,
    ext: core.formatToExt(target) || '.' + target,
    qualityUsed: out.q,
    scaled: out.scaled || null,
    note: note.join('；'),
    origFormat,
  };
}

/**
 * 批量变换 + 落盘（永不覆盖）+ 逐文件结果。
 * @param items {path,name}[]  @param opts {outDir, concurrency, maxFileMB, onProgress, isCancelled}
 * @returns {results[], summary}
 */
async function runPipeline(items, pipeline, opts) {
  const concurrency = Math.max(1, Math.min(8, Number(opts.concurrency) || 3));
  const maxFileBytes = Math.max(1, Number(opts.maxFileMB) || 100) * 1024 * 1024;
  const existsFn = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < items.length) {
      if (opts.isCancelled && opts.isCancelled()) return;
      const idx = cursor++;
      const it = items[idx];
      const started = Date.now();
      try {
        const st = fs.statSync(it.path);
        if (st.size > maxFileBytes) throw new Error('文件 ' + core.formatBytes(st.size) + ' 超过单文件上限 ' + core.formatBytes(maxFileBytes));
        const r = await transformOne(it, pipeline);
        const stem = core.sanitizeStem(it.name);
        const target = core.pickOutputName(opts.outDir, stem, r.ext, existsFn);
        fs.writeFileSync(target, r.bytes);
        results[idx] = {
          name: it.name,
          path: it.path,
          ok: true,
          inSize: st.size,
          outSize: r.bytes.length,
          outPath: target,
          outName: path.basename(target),
          format: r.target,
          quality: r.qualityUsed,
          scaled: r.scaled,
          note: r.note,
          ms: Date.now() - started,
        };
      } catch (e) {
        let inSize = 0;
        try { inSize = fs.statSync(it.path).size; } catch (_) { /* 文件已消失：0 */ }
        results[idx] = {
          name: it.name,
          path: it.path,
          ok: false,
          error: String((e && e.message) || e),
          inSize,
          ms: Date.now() - started,
        };
      }
      done++;
      if (opts.onProgress) {
        try { opts.onProgress({ done, total: items.length, latest: results[idx] }); } catch (_) { /* 进度回调失败不影响主流程 */ }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  const okResults = results.filter(Boolean).filter((r) => r.ok);
  const summary = {
    total: items.length,
    ok: okResults.length,
    fail: results.filter(Boolean).length - okResults.length,
    inBytes: results.filter(Boolean).reduce((s, r) => s + (r.inSize || 0), 0),
    outBytes: okResults.reduce((s, r) => s + r.outSize, 0),
    ms: undefined,
  };
  summary.savedBytes = summary.inBytes - summary.outBytes;
  return { results: results.filter(Boolean), summary };
}

module.exports = { listImageFiles, probeImage, scanDir, transformOne, runPipeline, resolveTarget, HARD_MAX_FILE_BYTES };
