'use strict';
/**
 * files.js —— 本机文件/目录只读访问（零依赖）。
 *
 * 安全边界：
 *   - 只读：本模块不出现任何写调用（测试静态断言守护）。
 *   - 大小上限：单文件读取 ≤ fileBytes；目录遍历 ≤ maxEntries / maxDepth。
 *   - 字符集：UTF-8（严格）→ GBK → latin1 三级回退，BOM 剥离。
 *   - 路径要求绝对路径（面板/MCP 侧负责给全），拒 NUL 与空串。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKIP_NAMES = new Set([
  'node_modules', '.git', '.hg', '.svn', '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);

function assertSafePath(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('路径为空');
  if (p.includes('\0')) throw new Error('路径包含非法字符');
  if (!path.isAbsolute(p)) throw new Error(`需要绝对路径：${p}`);
  return path.normalize(p);
}

/** 按字节上限读文件并解码为文本。超限抛 LIMIT_SIZE。 */
function readFileLimited(p, maxBytes) {
  const full = assertSafePath(p);
  let st;
  try {
    st = fs.statSync(full);
  } catch (e) {
    throw new Error(`文件不可读：${full}（${e.code || e.message}）`);
  }
  if (st.isDirectory()) throw new Error(`路径是目录不是文件：${full}`);
  if (st.size > maxBytes) {
    const err = new Error(`文件 ${(st.size / 1048576).toFixed(1)}MB 超过上限 ${(maxBytes / 1048576).toFixed(0)}MB：${path.basename(full)}`);
    err.code = 'LIMIT_SIZE';
    throw err;
  }
  const buf = fs.readFileSync(full);
  const { text, charset } = decodeBuffer(buf);
  return { text, size: st.size, charset, mtimeMs: st.mtimeMs, path: full };
}

function decodeBuffer(buf) {
  let body = buf;
  let hadBom = false;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    body = buf.subarray(3);
    hadBom = true;
  }
  // UTF-8 严格解码失败 → GBK → latin1
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), charset: hadBom ? 'utf-8(bom)' : 'utf-8' };
  } catch (_) { /* 落到 GBK */ }
  try {
    return { text: new TextDecoder('gbk').decode(body), charset: 'gbk' };
  } catch (_) { /* 落到 latin1 */ }
  return { text: body.toString('latin1'), charset: 'latin1' };
}

/**
 * 只读遍历目录（先序，名字排序）。返回 [{path, kind, size, mtimeMs}]，
 * path 为 '/' 分隔的相对路径。跳过 SKIP_NAMES 与隐藏项由调用方决定。
 */
function walkDir(root, opts) {
  const o = opts || {};
  const maxEntries = o.maxEntries || 20000;
  const maxDepth = o.maxDepth || 16;
  const skipNames = o.skipNames || SKIP_NAMES;
  const includeHidden = !!o.includeHidden;
  const out = [];
  let skipped = 0;
  let truncated = false;

  function visit(abs, rel, depth) {
    if (truncated || depth > maxDepth) { truncated = truncated || depth > maxDepth; return; }
    let names;
    try {
      names = fs.readdirSync(abs, { withFileTypes: true });
    } catch (_) {
      skipped++;
      return;
    }
    names.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of names) {
      if (truncated) return;
      if (skipNames.has(ent.name)) continue;
      if (!includeHidden && ent.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const childAbs = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        out.push({ path: childRel, kind: 'dir', size: 0, mtimeMs: safeMtime(childAbs) });
        visit(childAbs, childRel, depth + 1);
      } else if (ent.isFile()) {
        if (out.length >= maxEntries) { truncated = true; return; }
        let size = 0;
        let mtimeMs = 0;
        try {
          const st = fs.statSync(childAbs);
          size = st.size;
          mtimeMs = st.mtimeMs;
        } catch (_) { skipped++; }
        out.push({ path: childRel, kind: 'file', size, mtimeMs });
      }
      if (out.length >= maxEntries) truncated = true;
    }
  }

  const base = assertSafePath(root);
  let baseSt;
  try {
    baseSt = fs.statSync(base);
  } catch (e) {
    throw new Error(`目录不可读：${base}（${e.code || e.message}）`);
  }
  if (!baseSt.isDirectory()) throw new Error(`路径不是目录：${base}`);
  visit(base, '', 1);
  return { entries: out, skipped, truncated };
}

function safeMtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch (_) { return 0; }
}

/** 小文件 sha256（哈希对比用）。超过 cap 或不可读返回 null。 */
function sha256File(p, capBytes) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > capBytes) return null;
    const buf = fs.readFileSync(p);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (_) {
    return null;
  }
}

module.exports = { assertSafePath, readFileLimited, decodeBuffer, walkDir, sha256File, SKIP_NAMES };
