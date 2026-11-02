'use strict';
/**
 * tarball.js —— npm tarball（.tgz）逐文件提取（零依赖）。
 *
 * 真权威哈希源：npm registry 的 dist.tarball 才是「官方发布内容」本体；
 * jsDelivr data API 是 CDN 自报口径。二者并存、互为对照，是本插件「双源核验」的根基。
 *
 * 支持的 tar 形态：ustar（含 prefix 扩展）、GNU 长名（typeflag 'L'）、PAX 头（typeflag 'x'
 * 的 path 覆盖）。npm CLI 打包产物三类都会出现。安全护栏：条目数/总字节上限、
 * 路径穿越拒绝（../ 与绝对路径）、非 regular 文件跳过。
 */
const zlib = require('zlib');

const BLOCK = 512;

/**
 * 解析 .tgz，返回 Map<filePath, Buffer>（路径已剥 package/ 前缀与 './'）。
 * @param {Buffer} gzBuf
 * @param {{maxFiles?:number, maxTotalBytes?:number}} opts
 */
function extractTarGz(gzBuf, opts) {
  const maxFiles = (opts && opts.maxFiles) || 4000;
  const maxTotalBytes = (opts && opts.maxTotalBytes) || 64 * 1024 * 1024;
  const raw = zlib.gunzipSync(gzBuf); // 非法 gzip 抛错由调用方兜
  const out = new Map();
  let offset = 0;
  let total = 0;
  let paxPath = null;
  let longName = null;
  while (offset + BLOCK <= raw.length) {
    const header = raw.subarray(offset, offset + BLOCK);
    // 全零块 = 结束（继续扫可容忍双零块结尾）
    if (header.every((b) => b === 0)) break;
    const name = readStr(header, 0, 100);
    const size = parseInt(readStr(header, 124, 12).replace(/[^0-7]/g, ''), 8) || 0;
    const typeflag = String.fromCharCode(header[156] || 0x20);
    const prefix = readStr(header, 345, 155);
    offset += BLOCK;
    const dataStart = offset;
    const dataEnd = dataStart + size;
    if (dataEnd > raw.length) throw new Error('tar 数据越界（文件不完整或被截断）');
    const data = raw.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK; // 512 对齐
    let path = name;
    if (typeflag === 'L') { longName = data.toString('utf8').replace(/\0+$/, ''); continue; }
    if (typeflag === 'x') { paxPath = readPaxPath(data); continue; }
    if (typeflag === 'g') continue; // 全局 pax 头，忽略
    if (longName) { path = longName; longName = null; }
    else if (paxPath) { path = paxPath; paxPath = null; }
    else if (prefix) path = `${prefix}/${name}`;
    path = normalizeEntryPath(path);
    // 仅 regular 文件（'0' / '\0' 旧写法 / '7' 连续文件；npm 产物只有 '0'）
    if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '7') continue;
    if (!path || path.endsWith('/')) continue;
    if (path.includes('..') || path.startsWith('/')) continue; // 路径穿越拒绝
    if (out.size >= maxFiles) throw new Error(`tar 文件数超上限（${maxFiles}）`);
    total += size;
    if (total > maxTotalBytes) throw new Error(`tar 解包总字节超上限（${Math.round(maxTotalBytes / 1024 / 1024)}MB）`);
    out.set(path, Buffer.from(data)); // subarray 引用底层大 buffer，复制防泄漏
  }
  return out;
}

function readStr(buf, off, len) {
  const end = buf.subarray(off, off + len).indexOf(0);
  return buf.subarray(off, end === -1 ? off + len : off + end).toString('utf8');
}

/** PAX 记录："<len> <key>=<value>\n" 序列，取 path 键 */
function readPaxPath(data) {
  const s = data.toString('utf8');
  let i = 0;
  while (i < s.length) {
    const sp = s.indexOf(' ', i);
    if (sp === -1) break;
    const len = parseInt(s.slice(i, sp), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = s.slice(i + sp + 1, i + len - 1); // 去掉自身长度占位与结尾 \n
    const eq = rec.indexOf('=');
    if (eq > 0 && rec.slice(0, eq) === 'path') return rec.slice(eq + 1).replace(/\n+$/, '');
    i += len;
  }
  return null;
}

function normalizeEntryPath(p) {
  let s = String(p || '').replace(/\\/g, '/');
  s = s.replace(/^\.\/+/, '');
  s = s.replace(/^package\//, ''); // npm tarball 顶层目录惯例
  return s;
}

module.exports = { extractTarGz, normalizeEntryPath };
