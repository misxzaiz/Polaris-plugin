'use strict';
/**
 * filemask.js —— 文件/目录脱敏引擎（服务端 fs 层，零依赖）
 *
 * 安全设计：
 *   - 永不覆盖原文件：输出一律写 <name>.masked.<ext> / <dir>.masked/ 镜像树；
 *   - 二进制嗅探（前 8KB NUL）与大小上限，不做伪装成文本的二进制破坏；
 *   - 返回给调用方（面板/MCP/日志）的发现条目只含掩码预览（displayPreview），
 *     原值不出本模块（不泄露不变量，见 shared/mask-core.js 铁律 2）。
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/mask-core');

const SKIP_DIRS = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '__pycache__', '.venv', 'venv', 'target', '.idea', '.gradle', 'vendor',
];
const SKIP_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'heic',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'ogg', 'm4a',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'apk', 'ipa',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'msi', 'deb', 'rpm',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'wasm', 'class', 'pyc', 'pdb',
  'sqlite', 'db', 'db3', 'mdb', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'psd',
]);
/** 目录批量模式的文本扩展白名单（明确点名 mask_file 的单文件不受此限） */
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'ndjson', 'csv', 'tsv', 'log', 'env',
  'ini', 'conf', 'cfg', 'yaml', 'yml', 'toml', 'xml', 'html', 'htm', 'sql',
  'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rb', 'php', 'c', 'h', 'cpp', 'cs',
  'http', 'har', 'properties', 'sh', 'bat', 'ps1', 'gitignore', 'dockerfile',
]);
const TEXT_BASENAMES = new Set(['.env', '.gitignore', 'dockerfile', 'makefile', 'license', 'readme']);

function extOf(name) {
  const i = String(name || '').lastIndexOf('.');
  return i <= 0 ? '' : String(name).slice(i + 1).toLowerCase();
}
function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}
/** 唯一化输出路径：<base>.masked.<ext>，被占则 -2/-3 递增 */
function uniqueOutPath(p) {
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  let out = p;
  for (let i = 2; fs.existsSync(out); i++) out = path.join(dir, `${base}-${i}${ext}`);
  return out;
}

/**
 * 脱敏单个文件 → 写 <name>.masked.<ext>（绝不覆盖原件）。
 * 返回 { ok, out?, stats?, previews?, bytes?, error? } —— previews 全为掩码形态。
 */
function maskFile(absPath, opts, log) {
  const o = opts || {};
  const maxKB = (o.maxFileKB || 2048) * 1024;
  let st;
  try { st = fs.statSync(absPath); } catch (_) { return { ok: false, error: `文件不存在或不可读：${absPath}` }; }
  if (!st.isFile()) return { ok: false, error: `不是常规文件：${absPath}` };
  if (st.size > maxKB) return { ok: false, error: `文件 ${Math.round(st.size / 1024)}KB 超过上限 ${o.maxFileKB || 2048}KB（可在设置调大）` };

  let buf;
  try { buf = fs.readFileSync(absPath); } catch (e) { return { ok: false, error: `读取失败：${e && e.message}` }; }
  if (looksBinary(buf)) return { ok: false, error: '疑似二进制文件（前 8KB 含 NUL），拒绝按文本脱敏' };

  const text = buf.toString('utf8');
  const r = core.maskText(text, {
    ...o,
    exposeOriginal: false, // 铁律：服务侧永远不暴露原值
  });

  const outPath = uniqueOutPath(`${absPath}.masked`);
  try { fs.writeFileSync(outPath, r.output, 'utf8'); } catch (e) { return { ok: false, error: `写入失败：${e && e.message}` }; }
  if (log) log('info', `maskFile ${absPath} → ${outPath} stats=${JSON.stringify(r.stats)}`);

  return {
    ok: true,
    out: outPath,
    stats: r.stats,
    previews: r.hits.slice(0, 20).map((h) => ({ type: h.type, preview: h.preview, mode: h.mode, confirm: h.confirm })),
    hitCount: r.hits.length,
    bytes: Buffer.byteLength(r.output, 'utf8'),
    truncated: r.truncated,
    newEntries: r.newEntries, // 台账增量（服务负责持久化；内容含原值，永不外传）
  };
}

/** 目录递归收集文本文件（跳过二进制/依赖/构建目录；目录模式走扩展白名单） */
function collectTextFiles(root, maxFiles) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 12 || out.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.includes(ent.name.toLowerCase()) && !ent.name.endsWith('.masked')) walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = extOf(ent.name);
      const base = ent.name.toLowerCase();
      const isText = TEXT_EXT.has(ext) || TEXT_BASENAMES.has(base) || base.startsWith('.env');
      if (!isText || SKIP_EXT.has(ext)) continue;
      out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

/**
 * 目录批量脱敏 → 输出镜像树 <dir>.masked/<相对路径>。
 * 返回 { ok, outDir?, manifest?, error? }；onProgress({files, done, current}) 每 20 个回调一次。
 */
function maskDir(absDir, opts, onProgress, log) {
  const o = opts || {};
  const maxFiles = Math.min(o.maxFiles || 2000, 5000);
  const maxKB = (o.maxFileKB || 2048) * 1024;
  let st;
  try { st = fs.statSync(absDir); } catch (_) { return { ok: false, error: `目录不存在或不可访问：${absDir}` }; }
  if (!st.isDirectory()) return { ok: false, error: `不是目录：${absDir}` };

  const files = collectTextFiles(absDir, maxFiles);
  const outDir = `${absDir.replace(/[\\/]+$/, '')}.masked`;
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { return { ok: false, error: `建输出目录失败：${e && e.message}` }; }

  const manifest = { at: Date.now(), source: absDir, outDir, files: files.length, masked: 0, skippedBinary: 0, skippedSize: 0, skippedEmpty: 0, errors: 0, outputs: [], truncated: files.length >= maxFiles };
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const fst = fs.statSync(f);
      if (fst.size === 0) { manifest.skippedEmpty++; continue; }
      if (fst.size > maxKB) { manifest.skippedSize++; continue; }
      const buf = fs.readFileSync(f);
      if (looksBinary(buf)) { manifest.skippedBinary++; continue; }
      const r = core.maskText(buf.toString('utf8'), { ...o, exposeOriginal: false });
      const rel = path.relative(absDir, f);
      const outPath = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      // 镜像树内同相对路径唯一（从同一源遍历），无需 uniqueOutPath
      fs.writeFileSync(outPath, r.output, 'utf8');
      manifest.masked++;
      if (manifest.outputs.length < 200) manifest.outputs.push({ rel, out: outPath, stats: r.stats });
      if (log && manifest.masked % 100 === 0) log('info', `maskDir 进度 ${manifest.masked}/${files.length}`);
    } catch (_) {
      manifest.errors++;
    }
    if (onProgress && (i % 20 === 0 || i === files.length - 1)) {
      onProgress({ files: files.length, done: i + 1, current: f });
    }
  }
  if (log) log('info', `maskDir ${absDir} 完成：${manifest.masked}/${manifest.files} 个文件 → ${outDir}`);
  return { ok: true, outDir, manifest };
}

module.exports = { maskFile, maskDir, collectTextFiles, looksBinary, uniqueOutPath, SKIP_DIRS, TEXT_EXT };
