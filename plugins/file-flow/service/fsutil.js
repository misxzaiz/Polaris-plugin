'use strict';
/**
 * fsutil.js —— 文件管家 fs 工具层（零依赖，可用真实临时目录离线单测）
 *
 * 从 flow.js 拆出的纯 fs 语义（不碰 kv/网络）：
 *   - statEntry / walkRoot（预算内递归遍历，跳过隐藏目录与排除子树）
 *   - fingerprint（size + 首/尾 64KB md5 内容指纹，供去重）
 *   - moveFile（同盘 rename；EXDEV 回退 copy+校验+unlink，校验不过不动源）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WALK_ENTRY_CAP = 8000;
const WALK_DEPTH = 6;
const HASH_CHUNK = 64 * 1024;
const HASH_CAP_BYTES = 2 * 1024 * 1024 * 1024;

function statEntry(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    return { size: st.size, mtime: st.mtimeMs };
  } catch (_) {
    return null;
  }
}

/**
 * 预算内递归 walk（浅层手动遍历，不依赖 node 20 的 recursive readdir）。
 * excludeTop：顶层目录名集合（小写，如规则目的子树/回收站）——不进入也不收集。
 * 返回 { entries: [{rel,name,abs,size,mtime}], truncated }。
 */
function walkRoot(rootPath, excludeTop, { entryCap = WALK_ENTRY_CAP, depth = WALK_DEPTH } = {}) {
  const entries = [];
  let truncated = false;
  const excluded = new Set(Array.from(excludeTop || []).map((s) => String(s).toLowerCase()));
  const walk = (dir, relBase, d) => {
    if (entries.length >= entryCap) { truncated = true; return; }
    let names;
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return; // 目录不可读：如实跳过（权限/占用）
    }
    for (const de of names) {
      if (entries.length >= entryCap) { truncated = true; return; }
      const name = de.name;
      const abs = path.join(dir, name);
      const rel = relBase ? `${relBase}\\${name}` : name;
      if (de.isDirectory()) {
        if (name.startsWith('.') || excluded.has(name.toLowerCase())) continue;
        if (d >= depth) continue;
        walk(abs, rel, d + 1);
      } else if (de.isFile()) {
        const st = statEntry(abs);
        if (!st) continue;
        entries.push({ rel, name, abs, size: st.size, mtime: st.mtime });
      }
    }
  };
  walk(rootPath, '', 0);
  return { entries, truncated };
}

/** 内容指纹：size + 首/尾 64KB md5（超 2GB 不做指纹，返回 null） */
function fingerprint(abs, size) {
  try {
    if (size > HASH_CAP_BYTES) return null;
    const fd = fs.openSync(abs, 'r');
    try {
      const head = Buffer.alloc(Math.min(HASH_CHUNK, size));
      fs.readSync(fd, head, 0, head.length, 0);
      const h = crypto.createHash('md5').update(head);
      if (size > HASH_CHUNK) {
        const tail = Buffer.alloc(Math.min(HASH_CHUNK, size));
        fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
        h.update(tail);
      }
      h.update(`|${size}`);
      return h.digest('hex');
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return null;
  }
}

/** 移动单文件：同盘 rename；EXDEV 回退 copy+校验+unlink（校验不过不动源） */
function moveFile(fromAbs, toAbs) {
  const destDir = path.dirname(toAbs);
  fs.mkdirSync(destDir, { recursive: true });
  try {
    fs.renameSync(fromAbs, toAbs);
    return { ok: true, how: 'rename' };
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    const st = fs.statSync(fromAbs);
    const tmp = `${toAbs}.fileflow-tmp`;
    fs.copyFileSync(fromAbs, tmp);
    if (fs.statSync(tmp).size !== st.size) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw new Error('跨盘复制校验失败');
    }
    fs.renameSync(tmp, toAbs);
    fs.unlinkSync(fromAbs);
    return { ok: true, how: 'copy' };
  }
}

module.exports = { statEntry, walkRoot, fingerprint, moveFile, HASH_CHUNK, WALK_DEPTH };
