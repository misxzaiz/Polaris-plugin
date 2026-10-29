'use strict';
/**
 * snapshot.js —— 数据备份快照引擎（零依赖，node >= 18）
 *
 * 设计要点（生产级约束）：
 *  1. 内容寻址存储（CAS）：对象 = objects/<h2>/<sha256>.gz，全库去重——
 *     不变的文件（如语音克隆、历史会话）在所有快照间只存一份。
 *  2. 增量判定三级：上一份 manifest 的 (size,mtime) 一致 → 不读文件直接继承哈希；
 *     需要时先流式哈希（快），对象已存在则免压缩；仅新内容才走 gzip 写入。
 *  3. 热文件协议：单遍流式（hash 与 gzip 同读一遍）+ 前后双 stat 比对，
 *     不一致重试 ≤3 次，仍不稳定记 skipped（诚实标注），绝不因此炸整份快照。
 *  4. 原子性：对象/manifest 一律 tmp + rename；manifest 最后写——
 *     崩溃最多留下孤儿对象（GC 回收），不会留下"看起来完整"的坏快照。
 *  5. 恢复只落 restored/<stamp>/ 暂存目录，本引擎没有任何写入数据根的路径。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const core = require('../shared/ark-core.js');

const ARK_VERSION = 1;
const HASH_RETRY = 3;
const HASH_RETRY_DELAY = 250;
/** 单遍流式读块大小（1MB：哈希更新粒度与吞吐折中） */
const STREAM_CHUNK = 1024 * 1024;
/** 启动时清理的 tmp 文件年龄 */
const TMP_STALE_MS = 60 * 60 * 1000;

function sha256OfFileObject(hash) { return hash; } // 语义标记：对象名即内容 sha256

function objPath(libDir, hash) {
  return path.join(libDir, 'objects', hash.slice(0, 2), `${hash}.gz`);
}

function snapManifestPath(libDir, snapId) {
  return path.join(libDir, 'snapshots', `${snapId}.manifest.json`);
}

function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

/** 扫描数据根 → 候选文件 [{abs, rel, size, mtimeMs}]（排除规则已在此时生效） */
function scanSource(dataRoot, settings, log) {
  const out = [];
  const walk = (dir, rel) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      log('warn', `scan 跳过不可读目录 ${rel || '.'}: ${e.message}`);
      return;
    }
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (core.isExcluded(`${r}/`, settings)) continue;
        walk(abs, r);
      } else if (e.isFile()) {
        if (core.isExcluded(r, settings)) continue;
        try {
          const st = fs.statSync(abs);
          out.push({ abs, rel: r, size: st.size, mtimeMs: st.mtimeMs });
        } catch (_) { /* 竞态消失的文件：本轮跳过 */ }
      }
    }
  };
  walk(dataRoot, '');
  out.sort((a, b) => a.size - b.size); // 小文件先行：早期进度快、大文件热窗口短
  return out;
}

/** 单遍流式：读文件同时算 sha256；返回 { hash, bytes } 或抛错 */
function hashStream(abs) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    let bytes = 0;
    const st = fs.createReadStream(abs, { highWaterMark: STREAM_CHUNK });
    st.on('data', (c) => { h.update(c); bytes += c.length; });
    st.on('end', () => resolve({ hash: h.digest('hex'), bytes }));
    st.on('error', reject);
  });
}

/** 单遍流式：hash + gzip 同读一遍，写 <hash>.gz.tmp；返回 { hash, bytes, gzBytes } */
function hashGzipStream(abs, tmpFile) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    let bytes = 0;
    const gz = zlib.createGzip({ level: 1 });
    const out = fs.createWriteStream(tmpFile);
    let readErr = null;
    const st = fs.createReadStream(abs, { highWaterMark: STREAM_CHUNK });
    st.on('data', (c) => { h.update(c); bytes += c.length; });
    st.on('error', (e) => { readErr = e; out.destroy(); });
    st.pipe(gz).pipe(out);
    out.on('finish', () => {
      if (readErr) reject(readErr);
      else resolve({ hash: h.digest('hex'), bytes, gzBytes: out.bytesWritten });
    });
    out.on('error', reject);
    st.on('error', () => { /* 已记录，等 out close */ });
  });
}

function statQuiet(abs) {
  try {
    const st = fs.statSync(abs);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch (_) {
    return null;
  }
}

const yieldToLoop = () => new Promise((r) => setImmediate(r));

/**
 * 读取+哈希+入 CAS 库（带热文件协议）。
 * @returns {entry: {p,h,s,m,c}, skipped?: {p, reason}}
 */
async function ingestFile(cand, libDir, log) {
  const pre = { size: cand.size, mtimeMs: cand.mtimeMs };
  for (let attempt = 0; attempt < HASH_RETRY; attempt++) {
    try {
      // Pass 1：纯哈希（对象往往已存在——改 mtime 不改内容的文件走这条快路）
      const { hash } = await hashStream(cand.abs);
      const post = statQuiet(cand.abs);
      if (!post) return { skipped: { p: cand.rel, reason: '读取中途消失' } };
      if (post.size !== pre.size || Math.abs(post.mtimeMs - pre.mtimeMs) > 1) {
        // 读取期间文件在变：以新 stat 重试（尽量追上稳定点）
        pre.size = post.size;
        pre.mtimeMs = post.mtimeMs;
        await new Promise((r) => setTimeout(r, HASH_RETRY_DELAY * (attempt + 1)));
        continue;
      }
      const dest = objPath(libDir, hash);
      if (fs.existsSync(dest)) {
        return { entry: { p: cand.rel, h: hash, s: post.size, m: post.mtimeMs, c: 1 } };
      }
      // Pass 2：新内容 → hash+gzip 同一遍流式写入 tmp
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.tmp-${process.pid}`;
      const r2 = await hashGzipStream(cand.abs, tmp);
      const post2 = statQuiet(cand.abs);
      if (!post2 || post2.size !== pre.size || Math.abs(post2.mtimeMs - pre.mtimeMs) > 1) {
        try { fs.unlinkSync(tmp); } catch (_) { /* 尽力清理 */ }
        pre.size = (post2 || pre).size;
        pre.mtimeMs = (post2 || pre).mtimeMs;
        await new Promise((r) => setTimeout(r, HASH_RETRY_DELAY * (attempt + 1)));
        continue;
      }
      if (r2.hash !== hash) {
        // 压缩遍读到的内容与哈希遍不一致（仍在写）：丢弃重来
        try { fs.unlinkSync(tmp); } catch (_) { /* 尽力清理 */ }
        await new Promise((r) => setTimeout(r, HASH_RETRY_DELAY * (attempt + 1)));
        continue;
      }
      if (!fs.existsSync(dest)) fs.renameSync(tmp, dest);
      else { try { fs.unlinkSync(tmp); } catch (_) { /* 并发已写入，丢 tmp */ } }
      return { entry: { p: cand.rel, h: hash, s: post.size, m: post.mtimeMs, c: 1, gz: r2.gzBytes } };
    } catch (e) {
      log('warn', `ingest ${cand.rel} 第 ${attempt + 1} 次失败: ${e.message}`);
      await new Promise((r) => setTimeout(r, HASH_RETRY_DELAY * (attempt + 1)));
    }
  }
  return { skipped: { p: cand.rel, reason: '持续变化（热文件），本份快照跳过' } };
}

/** 创建快照引擎 */
function createArkFs({ log }) {
  /** 解析备份库目录（设置 targetDir 空 → <数据根>/../polaris-ark） */
  function resolveLibDir(dataRoot, settings) {
    const t = String(settings.targetDir || '').trim();
    const base = t || path.join(path.dirname(dataRoot), 'polaris-ark');
    return path.resolve(base);
  }

  /** 磁盘剩余空间（不可用时返回 null，不阻塞备份） */
  function freeBytes(dir) {
    try {
      const st = fs.statfsSync(dir);
      return st.bsize * st.bavail;
    } catch (_) {
      return null;
    }
  }

  /** 库内全部 manifest（按 finishedAt 新→旧），坏文件忽略并记录 */
  function listManifests(libDir) {
    const dir = path.join(libDir, 'snapshots');
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.manifest.json') && !f.includes('.tmp-'));
    } catch (_) { /* 目录不存在 = 空库 */ }
    const mans = [];
    for (const f of files) {
      const m = readJsonSafe(path.join(dir, f));
      if (m && m.id && Array.isArray(m.files)) mans.push(m);
      else if (m) log('warn', `manifest 损坏忽略: ${f}`);
    }
    mans.sort((a, b) => Number(b.finishedAt) - Number(a.finishedAt));
    return mans;
  }

  function loadManifest(libDir, snapId) {
    if (!/^[\w.-]+$/.test(String(snapId))) return null; // id 白名单，防路径注入
    return readJsonSafe(snapManifestPath(libDir, snapId));
  }

  /**
   * 执行一次快照。
   * @returns {{ok:true, manifest, summary}} | {ok:false, error, partialId?}
   */
  async function runSnapshot({ dataRoot, settings, libDir }) {
    const startedAt = Date.now();
    const snapId = `S${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    fs.mkdirSync(path.join(libDir, 'snapshots'), { recursive: true });
    fs.mkdirSync(path.join(libDir, 'objects'), { recursive: true });

    const candidates = scanSource(dataRoot, settings, log);
    if (candidates.length > 200000) {
      return { ok: false, error: `候选文件 ${candidates.length} 超过 20 万，疑似排除规则失效，拒绝快照` };
    }
    const mans = listManifests(libDir);
    const prev = mans.find((m) => m.ok !== false) || null;
    const prevMap = new Map();
    if (prev) for (const f of prev.files || []) prevMap.set(f.p, f);

    // 空间预检：保守估计本轮新增 ≤ 逻辑总量（首份）/上一份 changedBytes×3（增量）
    const logical = candidates.reduce((a, c) => a + c.size, 0);
    const free = freeBytes(libDir);
    const estimate = prev ? Math.min(logical, Math.max(64 * 1024 * 1024, logical * 0.2)) : logical;
    if (free != null && free < estimate * 1.2) {
      return { ok: false, error: `目标盘剩余 ${core.formatBytes(free)}，预估需 ${core.formatBytes(estimate * 1.2)}，已中止（可清理备份库或换目标目录）` };
    }

    const files = [];
    const skipped = [];
    const stats = { candidates: candidates.length, hashed: 0, reusedPrev: 0, reusedObject: 0, newObjects: 0, storedBytes: 0, logicalBytes: logical };
    let processed = 0;
    for (const cand of candidates) {
      processed += 1;
      if (processed % 50 === 0) await yieldToLoop(); // 让出事件循环，保健康检查响应
      const prevEntry = prevMap.get(cand.rel);
      if (prevEntry && !core.needsHash(prevEntry, cand)) {
        files.push({ p: cand.rel, h: prevEntry.h, s: cand.size, m: cand.mtimeMs, c: 0 });
        stats.reusedPrev += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const r = await ingestFile(cand, libDir, log);
      if (r.skipped) { skipped.push(r.skipped); continue; }
      files.push(r.entry);
      stats.hashed += 1;
      if (r.entry.gz !== undefined) { stats.newObjects += 1; stats.storedBytes += r.entry.gz; }
      else stats.reusedObject += 1;
    }

    const manifest = {
      arkVersion: ARK_VERSION,
      id: snapId,
      root: dataRoot,
      startedAt,
      finishedAt: Date.now(),
      baseId: prev ? prev.id : null,
      files,
      skipped,
      stats,
      ok: true,
    };
    // manifest 最后写（tmp+rename）：崩溃不会留下"完整假象"
    atomicWriteJson(snapManifestPath(libDir, snapId), manifest);
    return { ok: true, manifest, summary: core.summarizeManifest(manifest) };
  }

  /**
   * 校验快照：mode='quick' 只查对象存在与大小；'deep' 逐对象 gunzip 重哈希。
   */
  async function verifySnapshot({ libDir, snapId, mode = 'quick' }) {
    const manifest = snapId === 'latest' ? (listManifests(libDir).find((m) => m.ok !== false) || null) : loadManifest(libDir, snapId);
    if (!manifest) return { ok: false, error: `找不到快照 ${snapId}` };
    const startedAt = Date.now();
    const missing = [];
    const corrupt = [];
    let checked = 0;
    for (const f of manifest.files) {
      checked += 1;
      if (checked % 100 === 0) await yieldToLoop();
      const obj = objPath(libDir, f.h);
      let st = null;
      try { st = fs.statSync(obj); } catch (_) { /* missing */ }
      if (!st) { missing.push(f.p); continue; }
      if (mode === 'deep') {
        try {
          // eslint-disable-next-line no-await-in-loop
          const h = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const src = fs.createReadStream(obj);
            const gun = zlib.createGunzip();
            src.on('error', reject);
            gun.on('error', reject);
            gun.on('data', (c) => hash.update(c));
            gun.on('end', () => resolve(hash.digest('hex')));
            src.pipe(gun);
          });
          if (h !== f.h) corrupt.push(f.p);
        } catch (_) {
          corrupt.push(f.p);
        }
      }
    }
    return {
      ok: missing.length === 0 && corrupt.length === 0,
      snapId: manifest.id, mode, checked,
      missing, corrupt,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * 恢复：把快照里的文件解压到 <libDir>/restored/<stamp>/（保持相对结构）。
   * paths 为空/缺省 = 全量。绝不写数据根。
   */
  async function restoreFiles({ libDir, snapId, paths }) {
    const manifest = snapId === 'latest' ? (listManifests(libDir).find((m) => m.ok !== false) || null) : loadManifest(libDir, snapId);
    if (!manifest) return { ok: false, error: `找不到快照 ${snapId}` };
    const want = Array.isArray(paths) && paths.length ? new Set(paths.map((p) => String(p).replace(/\\/g, '/'))) : null;
    const stamp = core.restoreStamp(Date.now());
    const staging = path.join(libDir, 'restored', stamp);
    const restored = [];
    const notFound = [];
    for (const f of manifest.files) {
      if (want && !want.has(f.p)) continue;
      const obj = objPath(libDir, f.h);
      if (!fs.existsSync(obj)) { notFound.push(f.p); continue; }
      const dest = path.join(staging, f.p);
      if (!dest.startsWith(staging)) { notFound.push(f.p); continue; } // rel 路径防逃逸
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve, reject) => {
        const src = fs.createReadStream(obj);
        const gun = zlib.createGunzip();
        const out = fs.createWriteStream(dest);
        src.on('error', reject); gun.on('error', reject); out.on('error', reject);
        out.on('finish', resolve);
        src.pipe(gun).pipe(out);
      });
      restored.push(f.p);
    }
    return { ok: true, stagingDir: staging, restored: restored.length, notFound, total: manifest.files.length };
  }

  /** 列出快照文件（供面板/恢复选择；query 子串过滤，limit 截断） */
  function listSnapshotFiles({ libDir, snapId, query, limit = 200 }) {
    const manifest = snapId === 'latest' ? (listManifests(libDir).find((m) => m.ok !== false) || null) : loadManifest(libDir, snapId);
    if (!manifest) return { ok: false, error: `找不到快照 ${snapId}` };
    const q = String(query || '').toLowerCase();
    let files = manifest.files;
    if (q) files = files.filter((f) => f.p.toLowerCase().includes(q));
    return {
      ok: true,
      snapId: manifest.id,
      total: manifest.files.length,
      matched: files.length,
      files: files.slice(0, Math.min(500, Math.max(1, Number(limit) || 200))).map((f) => ({ p: f.p, s: f.s, m: f.m, c: f.c })),
      skipped: manifest.skipped || [],
    };
  }

  /**
   * 轮换 + GC：按 GFS 决策删 manifest，再删无引用且超过 1 天的对象
   * （1 天护栏防与进行中的快照竞态）。
   */
  async function gc({ libDir, retention, keepIds = [] }) {
    const mans = listManifests(libDir);
    const plan = core.planRotation(mans.map((m) => ({ id: m.id, finishedAt: m.finishedAt, ok: m.ok })), retention, Date.now());
    const prune = new Set([...plan.prune.filter((id) => !keepIds.includes(id))]);
    let manifestsDeleted = 0;
    for (const id of prune) {
      try { fs.unlinkSync(snapManifestPath(libDir, id)); manifestsDeleted += 1; } catch (_) { /* 已删 */ }
    }
    // 存活对象集
    const live = new Set();
    for (const m of listManifests(libDir)) for (const f of m.files || []) live.add(f.h);
    // 扫对象目录，删未引用且 mtime > 1 天
    const objectsDir = path.join(libDir, 'objects');
    let objectsDeleted = 0;
    let bytesFreed = 0;
    let objectsTotal = 0;
    let storeBytes = 0;
    let dirs = [];
    try { dirs = fs.readdirSync(objectsDir).filter((d) => d.length === 2); } catch (_) { /* 空库 */ }
    for (const d of dirs) {
      const sub = path.join(objectsDir, d);
      let ents = [];
      try { ents = fs.readdirSync(sub); } catch (_) { continue; }
      for (const f of ents) {
        const full = path.join(sub, f);
        if (f.includes('.tmp-')) {
          try {
            const st = fs.statSync(full);
            if (Date.now() - st.mtimeMs > TMP_STALE_MS) { fs.unlinkSync(full); }
          } catch (_) { /* 尽力 */ }
          continue;
        }
        let st = null;
        try { st = fs.statSync(full); } catch (_) { continue; }
        objectsTotal += 1;
        storeBytes += st.size;
        const hash = f.replace(/\.gz$/, '');
        if (!live.has(hash) && Date.now() - st.mtimeMs > 86400000) {
          try { fs.unlinkSync(full); objectsDeleted += 1; bytesFreed += st.size; storeBytes -= st.size; objectsTotal -= 1; } catch (_) { /* 尽力 */ }
        }
      }
    }
    return { ok: true, manifestsDeleted, objectsDeleted, bytesFreed, objectsTotal, storeBytes };
  }

  /** 库占用统计（对象数/字节 + manifest 数），供状态展示 */
  function storeStats(libDir) {
    const objectsDir = path.join(libDir, 'objects');
    let objectsTotal = 0;
    let storeBytes = 0;
    let dirs = [];
    try { dirs = fs.readdirSync(objectsDir).filter((d) => d.length === 2); } catch (_) { /* 空库 */ }
    for (const d of dirs) {
      let ents = [];
      try { ents = fs.readdirSync(path.join(objectsDir, d)); } catch (_) { continue; }
      for (const f of ents) {
        if (f.includes('.tmp-')) continue;
        try { const st = fs.statSync(path.join(objectsDir, d, f)); objectsTotal += 1; storeBytes += st.size; } catch (_) { /* 竞态 */ }
      }
    }
    return { objectsTotal, storeBytes, manifests: listManifests(libDir).length };
  }

  /** 启动清理：超过 1 小时的 tmp 残留 */
  function cleanupTmp(libDir) {
    for (const sub of ['objects', 'snapshots']) {
      const dir = path.join(libDir, sub);
      let dirs = [];
      let files = [];
      try { dirs = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const e of dirs) {
        if (e.isFile()) files.push(path.join(dir, e.name));
        else if (e.isDirectory()) {
          try { files.push(...fs.readdirSync(path.join(dir, e.name)).map((f) => path.join(dir, e.name, f))); } catch (_) { continue; }
        }
      }
      for (const f of files) {
        if (!path.basename(f).includes('.tmp-')) continue;
        try {
          const st = fs.statSync(f);
          if (Date.now() - st.mtimeMs > TMP_STALE_MS) fs.unlinkSync(f);
        } catch (_) { /* 尽力 */ }
      }
    }
  }

  return {
    resolveLibDir, freeBytes, listManifests, loadManifest,
    runSnapshot, verifySnapshot, restoreFiles, listSnapshotFiles, gc, storeStats, cleanupTmp,
    objPath,
  };
}

module.exports = { createArkFs, ARK_VERSION, objPath, scanSource, hashStream, hashGzipStream, atomicWriteJson, readJsonSafe };
