'use strict';
/**
 * core.js —— 包体积透视台分析引擎（纯逻辑 + 目录分析，零外部依赖）
 *
 * 职责：把「一个构建产物目录」变成字节级透视报告。
 *   sourcemap VLQ 解码 → 生成文件逐行（UTF-16 列 → UTF-8 字节）归因
 *   → 源文件/包分组（npm/pnpm(.pnpm 版本提取)/yarn 嵌套/webpack:// 归一）
 *   → 重复三连检（同包多版本多来源 / 同源文件多 chunk / 异路径同内容）
 *   → 确定性建议 → treemap 布局 → 报告 diff（优化前后逐包对比）。
 *
 * 归因口径（诚实边界，写进报告 totals）：
 *   - mappedBytes：被 sourcemap 段覆盖的生成字节（UTF-8 计）
 *   - unmappedBytes：换行符 + 无映射段 + 段间空隙，如实单列
 *   - 无 map 的 chunk 只做文件级统计（hasMap=false），不伪造归因
 *
 * 安全模型：只读 fs（walk + read），零网络，零写入（selftest 的临时目录除外，
 * 建在 os.tmpdir() 且 finally 清理）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = '0.1.0';
const KV_PREFIX = 'bundlelens.';

// ── 扫描上限（防失控；触顶截断并在 warnings 明示，不静默）──────────────────
const LIMITS = {
  maxChunks: 400,              // 参与归因的 chunk 上限
  maxTotalMapBytes: 200 * 1024 * 1024,
  maxMapBytes: 60 * 1024 * 1024,
  maxWalkFiles: 3000,
  maxWalkDepth: 4,
  maxSuggestions: 14,
  contentDupMinBytes: 2048,    // 内容重复检测的最小源文件字节
  contentDupBudget: 80 * 1024 * 1024, // sourcesContent 总量预算，超出则跳过内容查重
};

// ── Base64 VLQ ───────────────────────────────────────────────────────────────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_TABLE = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
  return t;
})();

/** 解码一段 VLQ 序列（mappings 的一行），返回绝对值数组（每个字段的 delta 已累加语义由调用方处理） */
function decodeVlqLine(str, start, end, out) {
  let i = start;
  while (i < end) {
    let result = 0;
    let shift = 0;
    let cont = true;
    while (cont) {
      if (i >= end) throw new Error('VLQ 序列在字段中间截断');
      const c = str.charCodeAt(i);
      const digit = c < 128 ? B64_TABLE[c] : -1;
      if (digit < 0) throw new Error(`非法 VLQ 字符：${str[i]}`);
      i++;
      cont = (digit & 32) !== 0;
      result += (digit & 31) * Math.pow(2, shift);
      shift += 5;
    }
    const negate = result & 1;
    result = Math.floor(result / 2);
    out.push(negate ? -result : result);
  }
  return i;
}

/**
 * 解析 sourcemap 的 mappings 字符串。
 * 返回 lines：lines[genLine] = [col0, src0, col1, src1, ...]（扁平数组；src=-1 表示无源映射）。
 * 语义：genCol 每行重置；srcIdx/srcLine/srcCol/nameIdx 全 map 连续累加（spec 语义）。
 * @param {string} mappings
 * @param {number} lineOffset 段式 map（sections）时该 section 的起始行偏移
 * @param {number} firstColOffset 段式 map 首行的列偏移
 */
function decodeMappings(mappings, lineOffset, firstColOffset) {
  const lines = new Map(); // genLine → 扁平数组（稀疏，段式合并需要）
  if (!mappings) return lines;
  const fields = [];
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  let nameIdx = 0;
  let pos = 0;
  let genLine = lineOffset;
  let col = firstColOffset;
  const len = mappings.length;
  while (pos <= len) {
    // 找行分隔
    let semi = mappings.indexOf(';', pos);
    if (semi === -1) semi = len;
    if (semi > pos || pos < len) {
      fields.length = 0;
      // 行内按逗号分段
      let segStart = pos;
      while (segStart <= semi) {
        let comma = mappings.indexOf(',', segStart);
        if (comma === -1 || comma > semi) comma = semi;
        if (comma > segStart) {
          fields.length = 0;
          decodeVlqLine(mappings, segStart, comma, fields);
          if (fields.length !== 1 && fields.length !== 4 && fields.length !== 5) {
            throw new Error(`sourcemap 段字段数非法：${fields.length}`);
          }
          col += fields[0];
          let src = -1;
          if (fields.length >= 4) {
            srcIdx += fields[1];
            srcLine += fields[2];
            srcCol += fields[3];
            if (fields.length === 5) nameIdx += fields[4];
            src = srcIdx;
          }
          let arr = lines.get(genLine);
          if (!arr) { arr = []; lines.set(genLine, arr); }
          arr.push(col, src);
        }
        segStart = comma + 1;
        if (comma === semi) break;
      }
    }
    if (semi === len) break;
    pos = semi + 1;
    genLine++;
    col = 0;
  }
  return lines;
}

/** 解析整个 map 对象（支持普通与 sections 段式），返回 Map<genLine, flat[]> */
function decodeMapLines(mapObj) {
  if (Array.isArray(mapObj.sections)) {
    const merged = new Map();
    let srcOffset = 0; // 每个 section 有独立 sources 数组，合并时统一重映射下标
    for (const sec of mapObj.sections) {
      if (!sec || !sec.map || typeof sec.map !== 'object') continue;
      const offLine = Math.max(0, Number(sec.offset && sec.offset.line) || 0);
      const offCol = Math.max(0, Number(sec.offset && sec.offset.column) || 0);
      const secSources = Array.isArray(sec.map.sources) ? sec.map.sources.length : 0;
      const sub = decodeMapLines(sec.map);
      for (const [line, arr] of sub) {
        const target = offLine + line;
        let dst = merged.get(target);
        if (!dst) { dst = []; merged.set(target, dst); }
        for (let i = 0; i < arr.length; i += 2) {
          const src = arr[i + 1];
          dst.push((line === 0 ? arr[i] + offCol : arr[i]), src === -1 ? -1 : src + srcOffset);
        }
      }
      srcOffset += secSources;
    }
    return merged;
  }
  return decodeMappings(String(mapObj.mappings || ''), 0, 0);
}

// ── 生成文件字节模型 ──────────────────────────────────────────────────────────
/**
 * 把生成文件 Buffer 按行拆开，返回每行的 { str, bytes, nlBytes }。
 * bytes = 行内容 UTF-8 字节数（不含行终止符）；nlBytes = \r\n/\n 的真实字节数（文件末尾无换行则 0）。
 * 0x0A 不可能出现在多字节 UTF-8 序列内部，按字节切分安全。
 */
function splitGeneratedLines(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    const isEnd = i === buf.length;
    if (isEnd || buf[i] === 0x0a) {
      if (i > start) {
        let contentEnd = i;
        if (buf[contentEnd - 1] === 0x0d) contentEnd--;
        const nlBytes = (i - contentEnd) + (isEnd ? 0 : 1);
        lines.push({ str: buf.toString('utf8', start, contentEnd), bytes: contentEnd - start, nlBytes });
      }
      start = i + 1;
    }
  }
  return lines;
}

/**
 * 为一行生成代码构建「UTF-16 列 → UTF-8 字节偏移」表。
 * 返回 Uint32Array，长度 = UTF-16 单元数 + 1；byteAt[units] = 行字节数。
 * 代理对（astral）两列共享同一字节起点。
 */
function buildColByteTable(lineStr, lineBytes) {
  const units = lineStr.length;
  const table = new Uint32Array(units + 1);
  let acc = 0;
  let i = 0;
  while (i < units) {
    const code = lineStr.charCodeAt(i);
    table[i] = acc;
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < units) {
      const next = lineStr.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        table[i + 1] = acc;
        acc += 4; // astral → 4 字节
        i += 2;
        continue;
      }
    }
    acc += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdfff ? 0 : code >= 0x10000 ? 4 : 3;
    i++;
  }
  table[units] = Math.max(acc, lineBytes);
  return table;
}

/**
 * 字节归因：把生成文件的字节分配到 sources 下标。
 * @returns {{perSource: Float64Array, mappedBytes: number, unmappedBytes: number}}
 */
function attributeChunk(buf, linesMap, sourceCount) {
  const perSource = new Float64Array(sourceCount);
  const genLines = splitGeneratedLines(buf);
  let mapped = 0;
  let unmapped = 0;
  for (let li = 0; li < genLines.length; li++) {
    const seg = linesMap.get(li);
    const { str, bytes, nlBytes } = genLines[li];
    unmapped += nlBytes;
    if (!seg || seg.length === 0) { unmapped += bytes; continue; }
    // 段按列排序（spec 保证有序，但段式合并后需重排）
    const pairs = [];
    for (let i = 0; i < seg.length; i += 2) pairs.push([seg[i], seg[i + 1]]);
    pairs.sort((a, b) => a[0] - b[0]);
    const byteAt = buildColByteTable(str, bytes);
    const units = str.length;
    // 首段之前的空隙
    const firstCol = Math.min(Math.max(0, pairs[0][0]), units);
    if (firstCol > 0) unmapped += byteAt[firstCol] - byteAt[0];
    for (let i = 0; i < pairs.length; i++) {
      const startCol = Math.min(Math.max(0, pairs[i][0]), units);
      const endCol = i + 1 < pairs.length
        ? Math.min(Math.max(startCol, pairs[i + 1][0]), units)
        : units;
      const span = byteAt[endCol] - byteAt[startCol];
      if (span <= 0) continue;
      const src = pairs[i][1];
      if (src >= 0 && src < sourceCount) { perSource[src] += span; mapped += span; }
      else unmapped += span;
    }
  }
  // residual 兜底（模型误差应≈0）：保持 mapped + unmapped = 文件字节的守恒口径
  const total = buf.length;
  const residual = total - mapped - unmapped;
  if (residual > 0) unmapped += residual;
  else if (residual < 0) {
    const cut = Math.min(mapped, -residual);
    mapped -= cut;
    const still = total - mapped - unmapped;
    if (still < 0) unmapped = Math.max(0, unmapped + still);
  }
  return { perSource, mappedBytes: Math.round(mapped), unmappedBytes: Math.round(unmapped) };
}

// ── 源路径归一与包解析 ────────────────────────────────────────────────────────
/** 归一 sourcemap 的 sources 条目：剥 scheme、统一分隔符、剥查询串 */
function normalizeSourcePath(raw) {
  let p = String(raw || '');
  if (!p) return '(anonymous)';
  p = p.replace(/\\/g, '/');
  // 剥 scheme：webpack://[context/]、webpack-internal:///、file:///、vite 产物相对路径保持
  const wm = p.match(/^webpack(?:-internal)?:\/\/(?:[^/]+\/)?\.?\/?(.*)$/);
  if (wm) p = wm[1] || p;
  else {
    const fm = p.match(/^file:\/\/\/?(.*)$/);
    if (fm) p = fm[1];
  }
  p = p.replace(/[?#].*$/, ''); // 剥 ?query 与 #hash
  p = p.replace(/^\.\//, '');
  while (p.startsWith('../')) p = p.slice(3);
  p = p.replace(/^\/+/, '');
  return p || '(anonymous)';
}

/**
 * 从归一化源路径解析 npm 包信息。
 * 返回 { name, version, rootKey } 或 null（应用源码）。
 * 支持：npm/yarn 平铺与嵌套、pnpm（.pnpm/<pkg>@<ver>[_<peer>] 段提取真实版本）、scope 包。
 */
function parseSourcePackage(normPath) {
  const marker = 'node_modules/';
  const idx = normPath.lastIndexOf(marker);
  if (idx === -1) return null;
  const rest = normPath.slice(idx + marker.length);
  let name;
  if (rest.startsWith('@')) {
    const cut = rest.indexOf('/', rest.indexOf('/') + 1);
    if (cut === -1) return null;
    name = rest.slice(0, cut);
  } else {
    const cut = rest.indexOf('/');
    if (cut === -1) return null;
    name = rest.slice(0, cut);
  }
  if (!name) return null;
  const rootKey = normPath.slice(0, idx + marker.length + name.length);
  // pnpm：.../.pnpm/<pkg>@<ver>[_<peer>]/node_modules/<name>/...
  let version = '';
  const pnpmPos = normPath.lastIndexOf('/.pnpm/');
  if (pnpmPos !== -1 && pnpmPos < idx) {
    const after = normPath.slice(pnpmPos + 7);
    const nmPos = after.indexOf('/node_modules/');
    if (nmPos > 0) {
      const seg = after.slice(0, nmPos); // 如 react-dom@18.2.0_react@18.2.0 或 @babel+core@7.23.0_xxx
      const uCut = seg.indexOf('_');
      const head = uCut > 0 ? seg.slice(0, uCut) : seg;
      const at = head.lastIndexOf('@');
      if (at > 0) {
        const vn = head.slice(at + 1);
        const pn = head.slice(0, at).replace(/\+/g, '/');
        if (pn && /^[\w.\-+]+$/.test(vn) && pn.replace(/^@/, '').split('/')[0]) version = vn;
      }
    }
  }
  return { name, version, rootKey };
}

// ── VLQ 编码（selftest/测试造 fixture 用）────────────────────────────────────
function encodeVlqValue(value) {
  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += B64_CHARS[digit];
  } while (vlq > 0);
  return out;
}

/**
 * 由 [genCol, srcIdx, srcLine, srcCol] 四元组行数组构建 mappings 字符串。
 * lines: Array<Array<[col, src, srcLine, srcCol]>>
 */
function buildMappings(lines) {
  const parts = [];
  let prevSrc = 0;
  let prevLine = 0;
  let prevCol = 0;
  let prevGenCol = 0;
  lines.forEach((segs, lineIdx) => {
    if (lineIdx > 0) parts.push(';');
    prevGenCol = 0;
    const sorted = [...segs].sort((a, b) => a[0] - b[0]);
    sorted.forEach((seg, i) => {
      if (i > 0) parts.push(',');
      parts.push(encodeVlqValue(seg[0] - prevGenCol));
      prevGenCol = seg[0];
      if (seg.length >= 4) {
        parts.push(encodeVlqValue(seg[1] - prevSrc));
        parts.push(encodeVlqValue(seg[2] - prevLine));
        parts.push(encodeVlqValue(seg[3] - prevCol));
        prevSrc = seg[1]; prevLine = seg[2]; prevCol = seg[3];
      }
    });
  });
  return parts.join('');
}

// ── 目录扫描 ─────────────────────────────────────────────────────────────────
const ASSET_RE = /\.(js|mjs|cjs|css)$/i;

/** 递归收集（深度受限），返回 {assets: [{abs, rel, size}], orphanMaps: [rel]} */
function walkDist(dir, limits, warnings) {
  const assets = [];
  const mapSet = new Set();
  let walked = 0;
  let truncWarned = false;
  const visit = (cur, rel, depth) => {
    if (walked >= limits.maxWalkFiles || depth > limits.maxWalkDepth) return;
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) {
      warnings.push(`目录不可读：${rel || '.'}（${e.code || e.message}）`);
      return;
    }
    for (const ent of entries) {
      if (walked >= limits.maxWalkFiles) {
        if (!truncWarned) { truncWarned = true; warnings.push(`目录文件数超过 ${limits.maxWalkFiles}，扫描截断`); }
        return;
      }
      walked++;
      const abs = path.join(cur, ent.name);
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue; // 产物目录里嵌套源码树不扫
        visit(abs, relPath, depth + 1);
      } else if (ent.isFile()) {
        if (/\.map$/i.test(ent.name)) { mapSet.add(relPath); continue; }
        if (ASSET_RE.test(ent.name)) {
          let size = 0;
          try { size = fs.statSync(abs).size; } catch (_) { continue; }
          assets.push({ abs, rel: relPath, size });
        }
      }
    }
  };
  visit(dir, '', 0);
  return { assets, mapSet, walked };
}

// ── 聚合与重复检测 ────────────────────────────────────────────────────────────
function aggregate(chunks, warnings, limits) {
  const pkgMap = new Map(); // name → { name, bytes, files:Map(path→{bytes,chunkIdx}), roots:Set, versions:Set }
  const moduleMap = new Map(); // normPath → { source, pkg, bytes, chunks:Set }
  const contentHash = new Map(); // sha1 → { bytes, paths:Map(path→true) }
  let contentBudgetLeft = limits.contentDupBudget;
  let vendorBytes = 0;
  let appBytes = 0;

  chunks.forEach((ch, chunkIdx) => {
    for (const s of ch.sources) {
      const pkgInfo = s.pkg;
      if (pkgInfo) {
        let p = pkgMap.get(pkgInfo.name);
        if (!p) { p = { name: pkgInfo.name, bytes: 0, files: new Map(), roots: new Set(), versions: new Set() }; pkgMap.set(pkgInfo.name, p); }
        p.bytes += s.bytes;
        p.roots.add(pkgInfo.rootKey);
        if (pkgInfo.version) p.versions.add(pkgInfo.version);
        const prev = p.files.get(s.source) || { bytes: 0, chunkIdxs: [] };
        prev.bytes += s.bytes;
        prev.chunkIdxs.push(chunkIdx);
        p.files.set(s.source, prev);
        vendorBytes += s.bytes;
      } else {
        appBytes += s.bytes;
      }
      let m = moduleMap.get(s.source);
      if (!m) { m = { source: s.source, pkg: pkgInfo ? pkgInfo.name : null, bytes: 0, chunks: new Set() }; moduleMap.set(s.source, m); }
      m.bytes += s.bytes;
      m.chunks.add(chunkIdx);
      if (s.contentHash && s.bytes >= limits.contentDupMinBytes) {
        let h = contentHash.get(s.contentHash);
        if (!h) { h = { bytes: 0, paths: new Map() }; contentHash.set(s.contentHash, h); }
        if (!h.paths.has(s.source)) h.paths.set(s.source, true);
        h.bytes = Math.max(h.bytes, s.bytes);
      }
    }
  });

  // 同一源文件打进多个 chunk → 重复体积（按超出最大 chunk 的部分保守计）
  const chunkDupes = [];
  for (const m of moduleMap.values()) {
    if (m.chunks.size >= 2) {
      const per = [];
      let maxBytes = 0;
      for (const ci of m.chunks) {
        const ch = chunks[ci];
        const b = (ch.sourceBytes.get(m.source) || 0);
        per.push({ file: ch.relPath, bytes: b });
        if (b > maxBytes) maxBytes = b;
      }
      const total = per.reduce((a, b) => a + b.bytes, 0);
      per.sort((a, b) => b.bytes - a.bytes);
      chunkDupes.push({ source: m.source, pkg: m.pkg, chunkCount: m.chunks.size, totalBytes: total, wasteBytes: total - maxBytes, chunks: per });
    }
  }
  chunkDupes.sort((a, b) => b.wasteBytes - a.wasteBytes);

  // 异路径同内容
  const contentDupes = [];
  for (const [hash, h] of contentHash) {
    if (h.paths.size >= 2) {
      const paths = [...h.paths.keys()];
      contentDupes.push({ hash, bytes: h.bytes, paths, wasteBytes: (paths.length - 1) * h.bytes });
    }
  }
  contentDupes.sort((a, b) => b.wasteBytes - a.wasteBytes);

  const packages = [...pkgMap.values()].map((p) => ({
    name: p.name,
    bytes: p.bytes,
    fileCount: p.files.size,
    roots: [...p.roots],
    versions: [...p.versions].sort(),
    topFiles: [...p.files.entries()]
      .map(([source, f]) => ({ source, bytes: f.bytes, chunkCount: new Set(f.chunkIdxs).size }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5),
  })).sort((a, b) => b.bytes - a.bytes);

  // 版本/来源冲突
  const versionConflicts = packages
    .filter((p) => p.roots.length >= 2)
    .map((p) => {
      // 重复体积 = 该包在非最大 root 的部分难精确切分，保守用「多 root 事实」+ 全包字节呈现
      return { name: p.name, bytes: p.bytes, roots: p.roots.length, versions: p.versions, files: p.fileCount };
    })
    .sort((a, b) => b.bytes - a.bytes);

  return {
    packages, vendorBytes, appBytes, versionConflicts, chunkDupes, contentDupes,
    modules: [...moduleMap.values()].sort((a, b) => b.bytes - a.bytes),
  };
}

// ── 确定性建议 ───────────────────────────────────────────────────────────────
function buildSuggestions(chunks, agg, totals, warnings) {
  const out = [];
  const push = (id, level, title, detail) => { if (out.length < LIMITS.maxSuggestions) out.push({ id, level, title, detail }); };
  const noMap = chunks.filter((c) => !c.hasMap).length;
  const withMap = chunks.length - noMap;

  if (chunks.length > 0 && noMap === chunks.length) {
    push('no-map', 'warn', '全部产物都没有 sourcemap，本次只有文件级体积',
      '开启后重扫可做包级归因：vite 设 build.sourcemap=true；webpack 设 devtool="source-map"；esbuild 加 --sourcemap');
  } else if (noMap > 0) {
    push('partial-map', 'info', `${noMap}/${chunks.length} 个 chunk 没有 sourcemap，未参与归因`,
      '常见原因：动态 import 的独立构建产物、第三方预构建文件、或构建配置只对部分入口开 map');
  }

  const mappedRatio = totals.totalBytes > 0 ? totals.mappedBytes / totals.totalBytes : 1;
  if (withMap > 0 && mappedRatio < 0.85) {
    push('unmapped-high', 'info', `${Math.round((1 - mappedRatio) * 100)}% 的字节无法归因到源文件`,
      '通常是 sourcemap 不完整（转换链截断）或运行时注入代码；归因数字偏保守，比例仅供参考');
  }

  for (const c of agg.versionConflicts.slice(0, 5)) {
    push('dup-version', 'warn',
      `包 ${c.name} 有 ${c.roots} 份独立安装${c.versions.length ? `（${c.versions.join(' / ')}）` : ''}`,
      `共 ${c.files} 个源文件、${Math.round(c.bytes / 1024)}KB。用包管理器 dedupe 或 resolution 收敛到单份`);
  }

  for (const d of agg.chunkDupes) {
    if (d.wasteBytes >= 20 * 1024) {
      push('dup-chunk', 'info', `源文件 ${d.source} 被打进 ${d.chunkCount} 个 chunk`,
        `重复约 ${Math.round(d.wasteBytes / 1024)}KB。检查是否被动态 import 静态混用，或手动 bundle 重复引用`);
      if (out.length >= LIMITS.maxSuggestions) break;
    }
  }

  for (const d of agg.contentDupes.slice(0, 5)) {
    if (d.wasteBytes >= 20 * 1024) {
      push('dup-content', 'info', `${d.paths.length} 个不同路径包含完全相同的源内容（各 ~${Math.round(d.bytes / 1024)}KB）`,
        `重复约 ${Math.round(d.wasteBytes / 1024)}KB：${d.paths.slice(0, 3).join('、')}${d.paths.length > 3 ? ' …' : ''}`);
    }
  }

  const top = agg.packages[0];
  if (top && totals.totalBytes > 0 && top.bytes / totals.totalBytes >= 0.3) {
    push('top-pkg', 'info', `包 ${top.name} 独占总体积的 ${Math.round((top.bytes / totals.totalBytes) * 100)}%`,
      `${Math.round(top.bytes / 1024)}KB / 总 ${Math.round(totals.totalBytes / 1024)}KB。优先评估：按需引入子包、懒加载、或更轻替代`);
  }

  for (const ch of chunks) {
    if (ch.bytes >= 700 * 1024 && ch.pkgCount >= 3) {
      push('big-chunk', 'info', `chunk ${ch.relPath} 达 ${Math.round(ch.bytes / 1024)}KB 且混合 ${ch.pkgCount} 个包`,
        '考虑路由级懒加载（React.lazy/dynamic import）或手动分包把低频依赖移出首屏');
      if (out.length >= LIMITS.maxSuggestions) break;
    }
  }

  let momentLocales = 0;
  let corejsModules = 0;
  for (const m of agg.modules) {
    if (/node_modules\/moment\/locale\//.test(m.source)) momentLocales++;
    if (/node_modules\/core-js\//.test(m.source)) corejsModules++;
  }
  if (momentLocales >= 10) {
    push('moment-locale', 'warn', `moment 全量 locale 被打包（${momentLocales} 个语言文件）`,
      '用 ContextReplacementPlugin 只留所需语言，或直接换 dayjs（体积 ~2KB vs moment ~70KB）');
  }
  if (corejsModules >= 30) {
    push('corejs-full', 'info', `core-js polyfill 模块 ${corejsModules} 个（全量注入特征）`,
      '@babel/preset-env 设 useBuiltIns:"usage" + corejs 版本号，按需注入');
  }

  if (totals.vendorBytes >= 300 * 1024 && totals.totalBytes > 0 && agg.vendorBytes / totals.totalBytes >= 0.85) {
    push('vendor-heavy', 'info', `依赖代码占 ${Math.round((agg.vendorBytes / totals.totalBytes) * 100)}%，应用代码仅 ${Math.round((agg.appBytes / totals.totalBytes) * 100)}%`,
      '体积大头在依赖：审查 top 包的必要性与替代品');
  }
  return out;
}

// ── treemap（squarified）─────────────────────────────────────────────────────
/**
 * 面积图布局。items: [{key, value}]，返回 [{key, value, x, y, w, h}]（归一化到给定矩形）。
 */
function treemapLayout(items, x, y, w, h) {
  const sorted = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, b) => a + b.value, 0);
  const out = [];
  if (total <= 0 || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let cx = x;
  let cy = y;
  let cw = w;
  let chh = h;
  let i = 0;
  const row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.value, 0) * scale;
    const max = Math.max(...r.map((it) => it.value * scale));
    const min = Math.min(...r.map((it) => it.value * scale));
    const s2 = s * s;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };
  while (i < sorted.length) {
    const side = Math.min(cw, chh);
    row.push(sorted[i]);
    while (i + 1 < sorted.length) {
      const next = [...row, sorted[i + 1]];
      if (worst(next, side) <= worst(row, side)) { row.push(sorted[i + 1]); i++; } else break;
    }
    const rowSum = row.reduce((a, b) => a + b.value, 0) * scale;
    const thick = rowSum / side;
    let off = 0;
    for (const it of row) {
      const len = (it.value * scale) / thick;
      if (cw >= chh) out.push({ key: it.key, value: it.value, x: cx, y: cy + off, w: thick, h: len });
      else out.push({ key: it.key, value: it.value, x: cx + off, y: cy, w: len, h: thick });
      off += len;
    }
    if (cw >= chh) { cx += thick; cw -= thick; } else { cy += thick; chh -= thick; }
    row.length = 0;
    i++;
  }
  return out;
}

// ── 报告 diff ────────────────────────────────────────────────────────────────
/** 对比两次扫描（按包名对齐），返回逐包增减。 */
function diffReports(prev, cur) {
  const prevMap = new Map((prev.packages || []).map((p) => [p.name, p.bytes]));
  const curMap = new Map((cur.packages || []).map((p) => [p.name, p.bytes]));
  const names = new Set([...prevMap.keys(), ...curMap.keys()]);
  const rows = [];
  const added = [];
  const removed = [];
  for (const name of names) {
    const pv = prevMap.get(name);
    const nv = curMap.get(name);
    if (pv == null && nv != null) { added.push({ name, bytes: nv }); continue; }
    if (pv != null && nv == null) { removed.push({ name, bytes: pv }); continue; }
    rows.push({ name, prev: pv, now: nv, delta: nv - pv, pct: pv > 0 ? (nv - pv) / pv : 1 });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  added.sort((a, b) => b.bytes - a.bytes);
  removed.sort((a, b) => b.bytes - a.bytes);
  const totalNow = (cur.totals && cur.totals.totalBytes) || 0;
  const totalPrev = (prev.totals && prev.totals.totalBytes) || 0;
  return {
    prevRunId: prev.runId || '',
    totalPrev, totalNow, totalDelta: totalNow - totalPrev,
    packages: rows.slice(0, 60),
    added: added.slice(0, 20),
    removed: removed.slice(0, 20),
  };
}

// ── 主流程：分析一个产物目录 ──────────────────────────────────────────────────
const yieldNow = () => new Promise((r) => setImmediate(r));

/**
 * @param {string} dir 绝对路径（构建产物目录）
 * @param {{onProgress?: (p:{done:number,total:number,phase:string,message:string})=>void, limits?: Partial<LIMITS>}} opts
 */
async function analyzeDist(dir, opts) {
  const startedAt = Date.now();
  const warnings = [];
  const limits = { ...LIMITS, ...(opts && opts.limits) };
  const onProgress = (opts && opts.onProgress) || (() => {});

  let stat;
  try { stat = fs.statSync(dir); } catch (e) { throw new Error(`目录不存在或不可访问：${dir}`); }
  if (!stat.isDirectory()) throw new Error(`不是目录：${dir}`);

  onProgress({ done: 0, total: 0, phase: 'walk', message: '遍历目录…' });
  const { assets, mapSet, walked } = walkDist(dir, limits, warnings);
  if (walked >= limits.maxWalkFiles) warnings.push(`目录项超过 ${limits.maxWalkFiles}，可能漏文件`);
  assets.sort((a, b) => b.size - a.size);
  let workList = assets;
  if (workList.length > limits.maxChunks) {
    warnings.push(`产物文件 ${workList.length} 个，仅分析体积最大的 ${limits.maxChunks} 个`);
    workList = workList.slice(0, limits.maxChunks);
  }
  if (workList.length === 0) {
    throw new Error(`目录里没有找到 .js/.mjs/.cjs/.css 产物文件：${dir}（请确认指向的是构建输出目录，如 dist/build/out）`);
  }

  // 配对 map
  const pairs = [];
  let totalMapBytes = 0;
  let mapBudgetExceeded = false;
  for (const a of workList) {
    const mapRel = `${a.rel}.map`;
    const hasMap = mapSet.has(mapRel);
    let mapAbs = hasMap ? path.join(dir, mapRel) : '';
    if (hasMap) {
      let msz = 0;
      try { msz = fs.statSync(mapAbs).size; } catch (_) { mapAbs = ''; }
      if (msz > limits.maxMapBytes) {
        warnings.push(`${mapRel} 超过单文件上限 ${Math.round(limits.maxMapBytes / 1048576)}MB，跳过归因（仅文件级统计）`);
        mapAbs = '';
      } else if (totalMapBytes + msz > limits.maxTotalMapBytes) {
        mapBudgetExceeded = true;
        mapAbs = '';
      } else totalMapBytes += msz;
    }
    pairs.push({ asset: a, mapAbs });
  }
  if (mapBudgetExceeded) warnings.push(`map 总量超过 ${Math.round(limits.maxTotalMapBytes / 1048576)}MB 预算，部分 chunk 降级为仅文件级统计`);

  onProgress({ done: 0, total: pairs.length, phase: 'analyze', message: `开始归因 ${pairs.length} 个产物…` });
  const chunks = [];
  let contentDupSkipped = false;
  let contentDupSkippedMsg = '';
  let contentBudgetLeft = limits.contentDupBudget;
  for (let i = 0; i < pairs.length; i++) {
    const { asset, mapAbs } = pairs[i];
    onProgress({ done: i + 1, total: pairs.length, phase: 'analyze', message: asset.rel });
    const chunk = {
      relPath: asset.rel,
      bytes: asset.size,
      hasMap: !!mapAbs,
      mappedBytes: 0,
      unmappedBytes: asset.size,
      pkgCount: 0,
      sourceBytes: new Map(), // normPath → bytes（chunkDupes 用）
      sources: [],            // {source, bytes, pkg, contentHash}
      topPkgs: [],
    };
    if (mapAbs) {
      try {
        const mapText = fs.readFileSync(mapAbs, 'utf8');
        const mapObj = JSON.parse(mapText);
        const linesMap = decodeMapLines(mapObj);
        const sources = Array.isArray(mapObj.sources) ? mapObj.sources : [];
        const contents = Array.isArray(mapObj.sourcesContent) ? mapObj.sourcesContent : [];
        const buf = fs.readFileSync(asset.abs);
        const { perSource, mappedBytes, unmappedBytes } = attributeChunk(buf, linesMap, sources.length);
        chunk.mappedBytes = mappedBytes;
        chunk.unmappedBytes = Math.min(unmappedBytes, asset.size);
        const pkgAgg = new Map();
        for (let si = 0; si < sources.length; si++) {
          const bytes = perSource[si] || 0;
          if (bytes <= 0) continue;
          const norm = normalizeSourcePath(sources[si]);
          const pkg = parseSourcePackage(norm);
          let contentHash = '';
          if (!contentDupSkipped && contents[si]) {
            const c = contents[si];
            const cBytes = Buffer.byteLength(c, 'utf8');
            if (contentBudgetLeft - cBytes >= 0) {
              contentBudgetLeft -= cBytes;
              contentHash = crypto.createHash('sha1').update(c).digest('hex').slice(0, 16);
            } else {
              contentDupSkipped = true;
              contentDupSkippedMsg = `sourcesContent 总量超过 ${Math.round(limits.contentDupBudget / 1048576)}MB 预算，内容查重部分跳过`;
            }
          }
          chunk.sources.push({ source: norm, bytes, pkg, contentHash });
          chunk.sourceBytes.set(norm, (chunk.sourceBytes.get(norm) || 0) + bytes);
          if (pkg) pkgAgg.set(pkg.name, (pkgAgg.get(pkg.name) || 0) + bytes);
        }
        chunk.pkgCount = pkgAgg.size;
        chunk.topPkgs = [...pkgAgg.entries()].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
      } catch (e) {
        warnings.push(`${asset.rel} 的 sourcemap 解析失败（${e.message}），按无 map 处理`);
        chunk.hasMap = false;
        chunk.sources = [];
        chunk.unmappedBytes = asset.size;
      }
    }
    chunks.push(chunk);
    if (i % 4 === 3) await yieldNow();
  }
  if (contentDupSkippedMsg) warnings.push(contentDupSkippedMsg);

  onProgress({ done: pairs.length, total: pairs.length, phase: 'aggregate', message: '聚合分组与重复检测…' });
  const agg = aggregate(chunks, warnings, limits);
  const mappedTotal = chunks.reduce((a, c) => a + c.mappedBytes, 0);
  const unmappedTotal = chunks.reduce((a, c) => a + c.unmappedBytes, 0);
  const totalBytes = chunks.reduce((a, c) => a + c.bytes, 0);
  const totals = {
    chunks: chunks.length,
    chunksNoMap: chunks.filter((c) => !c.hasMap).length,
    totalBytes,
    mappedBytes: mappedTotal,
    unmappedBytes: unmappedTotal,
    mapCoverage: totalBytes > 0 ? mappedTotal / totalBytes : 0,
    vendorBytes: agg.vendorBytes,
    appBytes: agg.appBytes,
    pkgCount: agg.packages.length,
    moduleCount: agg.modules.length,
    filesWalked: walked,
    durationMs: Date.now() - startedAt,
  };
  const suggestions = buildSuggestions(chunks, agg, totals, warnings);
  onProgress({ done: pairs.length, total: pairs.length, phase: 'done', message: '完成' });

  return {
    dir,
    totals,
    chunks: chunks.map((c) => ({
      relPath: c.relPath, bytes: c.bytes, hasMap: c.hasMap, mappedBytes: c.mappedBytes,
      unmappedBytes: c.unmappedBytes, pkgCount: c.pkgCount,
      topPkgs: c.topPkgs,
    })),
    packages: agg.packages,
    modules: agg.modules,
    duplicates: { versionConflicts: agg.versionConflicts, chunkDupes: agg.chunkDupes.slice(0, 40), contentDupes: agg.contentDupes.slice(0, 40) },
    suggestions,
    warnings,
  };
}

// ── 报告裁剪（kv 投影用）─────────────────────────────────────────────────────
function trimReport(report) {
  return {
    ...report,
    packages: (report.packages || []).slice(0, 120),
    modules: (report.modules || []).slice(0, 300),
    duplicates: {
      versionConflicts: (report.duplicates.versionConflicts || []).slice(0, 30),
      chunkDupes: (report.duplicates.chunkDupes || []).slice(0, 20),
      contentDupes: (report.duplicates.contentDupes || []).slice(0, 20),
    },
  };
}

// ── 内置自检（运行时自造临时 dist → 全链路断言）───────────────────────────────
function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
}

async function selfTest() {
  const checks = [];
  const add = (name, ok, error) => checks.push({ name, ok, error: error || '' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-lens-selftest-'));
  try {
    // chunk A：app.js —— 应用码 / lodash / 中文多字节 / ×10 moment locale / 无映射尾巴
    const appLine = '//'.repeat(30);                       // 60 字节
    const lodashLine = '/*lodash*/'.repeat(13) + 'l';      // 10*13+1 = 131 字节
    const cjkLine = '中文测试'.repeat(5) + 'abcde';        // 3*20 + 5 = 65 字节
    const localeLines = Array.from({ length: 10 }, (_, i) => `/*L${i}*/`); // 各 6 字节
    const tailLine = 'unmapped-tail'.repeat(2);            // 28 字节
    const contentA = [appLine, lodashLine, cjkLine, ...localeLines, tailLine].join('\n') + '\n';
    const srcA = ['src/app.tsx', 'node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js', 'node_modules/moment/locale/zh-cn.js'];
    const linesA = [
      [[0, 0, 0, 0]],
      [[0, 1, 5, 0]],
      [[0, 2, 9, 0]],
    ];
    for (let i = 0; i < 10; i++) {
      srcA.push(`node_modules/moment/locale/lo-${i}.js`);
      linesA.push([[0, srcA.length - 1, 12 + i, 0]]);
    }
    linesA.push([]); // 尾行无映射
    srcA.push('node_modules/moment/locale/extra.js'); // 占位，尾行无段不会用到
    // chunk B：lib.js —— 行 1 lodash@4.17.20（版本冲突）、行 2 应用 util
    const lodashB = '/*lodash-old*/'.repeat(8) + 'ld';     // 14*8+2 = 114 字节
    const utilLine = '//'.repeat(25);                      // 50 字节
    const contentB = [lodashB, utilLine].join('\n') + '\n';
    const srcB = ['node_modules/.pnpm/lodash@4.17.20/node_modules/lodash/lodash.js', 'src/util.ts'];
    const linesB = [
      [[0, 0, 0, 0]],
      [[0, 1, 3, 0]],
    ];
    fs.writeFileSync(path.join(tmp, 'app.js'), contentA);
    fs.writeFileSync(path.join(tmp, 'app.js.map'), JSON.stringify({
      version: 3, file: 'app.js', sources: srcA, sourcesContent: srcA.map(() => null),
      names: [], mappings: buildMappings(linesA),
    }));
    fs.writeFileSync(path.join(tmp, 'lib.js'), contentB);
    fs.writeFileSync(path.join(tmp, 'lib.js.map'), JSON.stringify({
      version: 3, file: 'lib.js', sources: srcB, sourcesContent: srcB.map(() => null),
      names: [], mappings: buildMappings(linesB),
    }));
    fs.writeFileSync(path.join(tmp, 'plain.js'), '// no map here\n'.repeat(10));

    const report = await analyzeDist(tmp, {});
    const t = report.totals;
    add('chunks=3', t.chunks === 3, `实际 ${t.chunks}`);
    add('lodash 字节=A行2+B行1', (() => {
      const p = report.packages.find((x) => x.name === 'lodash');
      return p && p.bytes === Buffer.byteLength(lodashLine) + Buffer.byteLength(lodashB);
    })(), JSON.stringify(report.packages.find((x) => x.name === 'lodash')));
    add('中文多字节归因=65', (() => {
      const m = report.modules.find((x) => x.source === 'node_modules/moment/locale/zh-cn.js');
      return m && m.bytes === 65;
    })(), JSON.stringify(report.modules.find((x) => x.source && x.source.includes('moment'))));
    add('版本冲突检出 lodash 4.17.21/4.17.20', (() => {
      const c = report.duplicates.versionConflicts.find((x) => x.name === 'lodash');
      return c && c.roots >= 2 && c.versions.length === 2 && c.versions.includes('4.17.21') && c.versions.includes('4.17.20');
    })(), JSON.stringify(report.duplicates.versionConflicts));
    add('moment locale 建议触发', report.suggestions.some((s) => s.id === 'moment-locale'), JSON.stringify(report.suggestions.map((s) => s.id)));
    add('moment 包字节=65+10×6', (() => {
      const p = report.packages.find((x) => x.name === 'moment');
      return p && p.bytes === 65 + 60;
    })(), JSON.stringify(report.packages.find((x) => x.name === 'moment')));
    add('无 map chunk 降级', t.chunksNoMap === 1 && !!report.chunks.find((c) => c.relPath === 'plain.js' && !c.hasMap), JSON.stringify(report.chunks.map((c) => c.relPath)));
    add('map 覆盖率 < 1（有换行与尾巴）', t.mapCoverage > 0.5 && t.mapCoverage < 1, String(t.mapCoverage));
    // treemap 面积守恒
    const area = (r) => r.reduce((a, it) => a + it.w * it.h, 0);
    const layout = treemapLayout(report.packages.map((p) => ({ key: p.name, value: p.bytes })), 0, 0, 200, 100);
    add('treemap 面积守恒 ±2%', Math.abs(area(layout) - 200 * 100) / (200 * 100) < 0.02, String(area(layout)));
    // diff 自比 = 0
    const d = diffReports(report, report);
    add('diff 自比全 0', d.totalDelta === 0 && d.packages.every((p) => p.delta === 0) && d.added.length === 0 && d.removed.length === 0, JSON.stringify(d));
  } catch (e) {
    add('selftest 未抛异常', false, e.stack || e.message);
  } finally {
    rmrf(tmp);
  }
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, total: checks.length, failed, checks };
}

module.exports = {
  VERSION, KV_PREFIX, LIMITS,
  decodeMappings, decodeMapLines, decodeVlqLine, buildMappings, encodeVlqValue,
  splitGeneratedLines, buildColByteTable, attributeChunk,
  normalizeSourcePath, parseSourcePackage,
  walkDist, aggregate, buildSuggestions, treemapLayout, diffReports,
  analyzeDist, trimReport, selfTest,
};
