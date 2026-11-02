'use strict';
/**
 * sources.js —— 权威哈希源（单文件单缓存，零依赖）。
 *
 * 三源定位（互为对照，防单源被俘获）：
 *   1. npm tarball（真权威）：registry.npmjs.org 元数据 dist.tarball → 下载解包逐文件 sha256。
 *      失败回退 registry.npmmirror.com 同一 tarball 镜像。
 *   2. jsDelivr data API（CDN 自报口径）：data.jsdelivr.com/v1/packages/npm/<pkg>@<ver>?structure=flat
 *      逐文件 base64-sha256。无版本号时先经 /resolved 解析最新版。
 *   3. cdnjs API（cdnjs 仓库权威）：api.cdnjs.com/libraries/<lib>/<ver>?fields=sri → 逐文件 sha512-SRI。
 *
 * 缓存：进程内 TTL 10min + 容量上限；tarball 级缓存按 pkg@ver（体积护栏内）。
 * 测试钩子：setTestAuthority(fn) 仅供 selftest 注入本地权威（生产调用点为空即关闭）。
 */
const crypto = require('crypto');
const zlib = require('zlib');
const { fencedFetch } = require('./fetcher');
const { extractTarGz } = require('./tarball');

const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 40;

const cache = new Map(); // key → {at, value}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { at: Date.now(), value });
}

function shaB64(alg, buf) {
  return crypto.createHash(alg).update(buf).digest('base64');
}

/* ── jsDelivr data API ──────────────────────────────────────────────────── */

/** 解析 pkg 的最新版本（无 @ver 的 URL 用）。失败抛错 */
async function resolveLatestVersion(pkg, { timeoutMs } = {}) {
  const key = `resolved:${pkg}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const res = await fencedFetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}/resolved`, { timeoutMs: timeoutMs || 15000, maxBytes: 256 * 1024 });
  if (res.status !== 200) throw new Error(`data.jsdelivr resolved HTTP ${res.status}`);
  const json = JSON.parse(res.buf.toString('utf8'));
  if (!json || typeof json.version !== 'string') throw new Error('resolved 响应无 version');
  cacheSet(key, json.version);
  return json.version;
}

/**
 * pkg@ver 的逐文件 sha256（base64）。返回 Map<file(无前导斜杠), hashB64>。
 * 注意：文件名前导斜杠在 flat 结构中存在（/assert.d.ts），统一剥掉。
 */
async function jsdelivrFileHashes(pkg, ver, { timeoutMs } = {}) {
  const key = `jdflat:${pkg}@${ver}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const res = await fencedFetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}@${ver}?structure=flat`, { timeoutMs: timeoutMs || 15000, maxBytes: 8 * 1024 * 1024 });
  if (res.status === 404) throw Object.assign(new Error(`jsDelivr 未收录 ${pkg}@${ver}`), { code: 'not-found' });
  if (res.status !== 200) throw new Error(`data.jsdelivr HTTP ${res.status}`);
  const json = JSON.parse(res.buf.toString('utf8'));
  const map = new Map();
  for (const f of Array.isArray(json.files) ? json.files : []) {
    if (typeof f.name !== 'string' || typeof f.hash !== 'string') continue;
    map.set(f.name.replace(/^\/+/, ''), f.hash);
  }
  if (!map.size) throw new Error('flat 文件表为空');
  cacheSet(key, map);
  return map;
}

/* ── npm tarball（真权威）───────────────────────────────────────────────── */

/**
 * pkg@ver 的 tarball 逐文件 sha256（base64）。主源 registry.npmjs.org，
 * 回退 registry.npmmirror.com。返回 { map: Map<file, sha256B64>, tarballUrl, bytes }。
 */
async function npmTarballFileHashes(pkg, ver, { timeoutMs, maxTarballBytes } = {}) {
  const key = `tar:${pkg}@${ver}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const cap = maxTarballBytes || 30 * 1024 * 1024;
  // ① 元数据拿 dist.tarball（权威装配路径）
  let tarballUrl = null;
  const metaRes = await fencedFetch(`https://registry.npmjs.org/${pkg}/${ver}`, { timeoutMs: timeoutMs || 20000, maxBytes: 4 * 1024 * 1024 });
  if (metaRes.status === 200) {
    try {
      const meta = JSON.parse(metaRes.buf.toString('utf8'));
      if (meta && meta.dist && typeof meta.dist.tarball === 'string') tarballUrl = meta.dist.tarball;
    } catch (_) { /* 元数据坏则走回退 */ }
  }
  const fallbackUrl = `https://registry.npmmirror.com/${pkg}/-/${pkg.split('/').pop()}-${ver}.tgz`;
  const attempts = [tarballUrl, fallbackUrl].filter(Boolean);
  const errors = [];
  for (const url of attempts) {
    try {
      const tgz = await fencedFetch(url, { timeoutMs: timeoutMs || 45000, maxBytes: cap });
      if (tgz.status !== 200) { errors.push(`${url} → HTTP ${tgz.status}`); continue; }
      const map = extractTarGz(tgz.buf, { maxTotalBytes: cap });
      const hashed = new Map();
      for (const [file, buf] of map) hashed.set(file, shaB64('sha256', buf));
      const out = { map: hashed, tarballUrl: url, bytes: tgz.byteLength };
      cacheSet(key, out);
      return out;
    } catch (e) {
      errors.push(`${url} → ${String((e && e.message) || e).slice(0, 120)}`);
    }
  }
  throw Object.assign(new Error(`npm tarball 获取失败：${errors.join('; ')}`), { code: 'tarball-failed' });
}

/* ── cdnjs API ──────────────────────────────────────────────────────────── */

/**
 * cdnjs 库版本的逐文件 sha512 SRI。返回 Map<file, 'sha512-...'>；库/版本不存在 → null。
 */
async function cdnjsSriMap(lib, ver, { timeoutMs } = {}) {
  const key = `cjs:${lib}@${ver}`;
  const hit = cacheGet(key);
  if (hit !== null) {
    return hit; // null 也缓存（404 是确定事实），但 TTL 内重复 404 直接返回
  }
  const res = await fencedFetch(`https://api.cdnjs.com/libraries/${encodeURIComponent(lib)}/${encodeURIComponent(ver)}?fields=sri`, { timeoutMs: timeoutMs || 15000, maxBytes: 2 * 1024 * 1024 });
  if (res.status === 404) { cacheSet(key, null); return null; }
  if (res.status !== 200) throw new Error(`api.cdnjs.com HTTP ${res.status}`);
  const json = JSON.parse(res.buf.toString('utf8'));
  const sri = json && json.sri && typeof json.sri === 'object' ? json.sri : null;
  if (!sri) { cacheSet(key, null); return null; }
  const map = new Map(Object.entries(sri));
  cacheSet(key, map);
  return map;
}

/* ── 汇总：某资源的权威口径 ──────────────────────────────────────────────── */

/**
 * 计算一个 npm 资源的权威哈希。
 * 返回 { ver, genuine: boolean,
 *        tarball: {sha256} | null,        // 真权威
 *        dataapi: {sha256} | null,        // jsDelivr 自报
 *        sourceNote: string }
 */
async function npmAuthority(ref, opts) {
  const out = { ver: ref.ver, genuine: false, tarball: null, dataapi: null, sourceNote: '' };
  // 无版本 → 解析最新版（权威哈希必须钉版本，否则每次发版哈希全变）
  let ver = ref.ver;
  if (!ver || ver === 'latest') {
    ver = await resolveLatestVersion(ref.pkg, opts);
    out.ver = ver;
  }
  const notes = [];
  try {
    const flat = await jsdelivrFileHashes(ref.pkg, ver, opts);
    const h = flat.get(ref.file);
    if (h) { out.dataapi = { sha256: h }; out.genuine = true; }
    else notes.push('文件不在 jsDelivr 包清单（可能是 CDN 现场生成的 min 变体）');
  } catch (e) {
    notes.push(`jsDelivr data API：${String((e && e.message) || e).slice(0, 80)}`);
  }
  try {
    const tar = await npmTarballFileHashes(ref.pkg, ver, opts);
    const h = tar.map.get(ref.file);
    if (h) { out.tarball = { sha256: h }; out.genuine = true; }
    else if (!out.genuine) notes.push('文件不在 npm tarball 内');
  } catch (e) {
    notes.push(`npm tarball：${String((e && e.message) || e).slice(0, 80)}`);
  }
  out.sourceNote = notes.join('；');
  return out;
}

/* ── 测试钩子（仅 selftest）─────────────────────────────────────────────── */

let testAuthority = null; // (ref) => {ver, genuine, tarball, dataapi, sourceNote} | null

function setTestAuthority(fn) { testAuthority = typeof fn === 'function' ? fn : null; }

async function authorityFor(ref, opts) {
  if (testAuthority) {
    const injected = testAuthority(ref);
    if (injected) return injected;
  }
  return npmAuthority(ref, opts);
}

function clearCachesForTest() { cache.clear(); }

module.exports = {
  resolveLatestVersion,
  jsdelivrFileHashes,
  npmTarballFileHashes,
  cdnjsSriMap,
  npmAuthority,
  authorityFor,
  setTestAuthority,
  clearCachesForTest,
  shaB64,
};
