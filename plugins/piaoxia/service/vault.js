'use strict';
/**
 * vault.js —— 发票保险库 IO 助手（service 与 MCP 共用的唯一实现；engine 保持零 IO）
 *
 * 职责：目录扫描（只读）、原件归档（复制非移动、永不覆盖）、文件指纹。
 * 安全约束：
 *   - 扫描仅限调用方显式给出的目录；跳过隐藏目录/node_modules/.git/系统回收站。
 *   - 归档目标是 <dataRoot>/piaoxia/，内容寻址命名（发票号码优先），同名冲突 -2/-3
 *     递增，绝不覆盖既有文件；失败返回 null 由调用方降级（只记 srcPath），不阻塞入账。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveDataRootCandidates } = require('./kvclient.js');

const INVOICE_EXTS = new Set(['.pdf', '.xml']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SCAN_FILES = 200;
const SKIP_DIRS = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information', '.polaris-tmp']);

function sha256FileBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** dataRoot 候选链（anchor.json 优先），返回第一个可读的 dataRoot 绝对路径 */
function resolveDataRoot(appConfigDir) {
  for (const dir of resolveDataRootCandidates(appConfigDir)) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch (_) { /* 下一个候选 */ }
  }
  return null;
}

/** 归档目录：<dataRoot>/piaoxia；不可用返回 null */
function archiveDir(dataRoot) {
  if (!dataRoot) return null;
  const dir = path.join(dataRoot, 'piaoxia');
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (_) {
    return null;
  }
}

/** 永不覆盖的落盘名：存在即 -2/-3 递增 */
function pickArchiveName(dir, stem, ext) {
  let name = stem + ext;
  for (let i = 2; i < 1000; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      fs.accessSync(path.join(dir, name));
      name = stem + '-' + i + ext;
    } catch (_) {
      return name; // 不存在，可用
    }
  }
  return stem + '-' + Date.now() + ext;
}

/**
 * 归档原件（复制非移动）。命名优先发票号码，无号码用指纹前缀。
 * @returns {string|null} 归档绝对路径；失败 null
 */
function archiveOriginal(dataRoot, invoice, bytes, srcName) {
  const dir = archiveDir(dataRoot);
  if (!dir) return null;
  const ext = path.extname(srcName || '').toLowerCase() === '.xml' ? '.xml' : '.pdf';
  const stem = (invoice && invoice.number) ? String(invoice.number) : 'manual-' + String((invoice && invoice.fileSha256) || sha256FileBytes(bytes)).slice(0, 16);
  try {
    const name = pickArchiveName(dir, stem, ext);
    const dest = path.join(dir, name);
    // 同字节同号重收 → 已存在文件内容一致，直接复用（幂等）
    try {
      const st = fs.statSync(dest);
      if (st && st.size === bytes.length) return dest;
    } catch (_) { /* 不存在，正常写入 */ }
    fs.writeFileSync(dest, bytes);
    return dest;
  } catch (_) {
    return null;
  }
}

/** 读发票文件字节（带大小上限；路径存在性校验） */
function readInvoiceFile(p) {
  const st = fs.statSync(p); // 不存在会抛，由调用方兜
  if (!st.isFile() || st.size > MAX_FILE_BYTES || st.size === 0) return null;
  return fs.readFileSync(p);
}

/** 扫描目录下的 .pdf/.xml（含子目录可选），返回 [{path, name, size}] */
function scanInvoices(dir, opts) {
  const o = opts || {};
  const maxDepth = Math.max(0, Math.min(6, Number(o.maxDepth === undefined ? 4 : o.maxDepth)));
  const out = [];
  const root = path.resolve(dir);
  function walk(d, depth) {
    if (out.length >= MAX_SCAN_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_SCAN_FILES) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!o.recursive || depth >= maxDepth) continue;
        if (SKIP_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        if (!INVOICE_EXTS.has(path.extname(e.name).toLowerCase())) continue;
        if (e.name.startsWith('~$')) continue; // Office 临时文件
        let size = 0;
        try { size = fs.statSync(full).size; } catch (_) { continue; }
        if (size === 0 || size > MAX_FILE_BYTES) continue;
        out.push({ path: full, name: e.name, size });
      }
    }
  }
  let st;
  try {
    st = fs.statSync(root);
  } catch (_) {
    return { error: '目录不存在：' + dir, files: [] };
  }
  if (!st.isDirectory()) return { error: '不是目录：' + dir, files: [] };
  walk(root, 0);
  return { files: out };
}

module.exports = {
  INVOICE_EXTS, MAX_FILE_BYTES, MAX_SCAN_FILES,
  sha256FileBytes, resolveDataRoot, archiveDir, archiveOriginal, readInvoiceFile, scanInvoices,
};
