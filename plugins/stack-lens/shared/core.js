'use strict';
/**
 * core.js —— 堆栈还原台引擎（纯逻辑 + 只读 fs，零外部依赖）
 *
 * 职责：把「minified 错误栈 + sourcemap」还原成「可读源码位置 + 代码帧」。
 *   栈文本解析（Chrome/Node/Safari/Firefox 格式，未知行优雅降级）
 *   → sourcemap v3 解析（VLQ / 段式 index map / names / sourcesContent）
 *   → map 配对（file 字段精确 / 同名 basename / sourceMappingURL 注释）
 *   → 逐帧 originalPositionFor（同生成行内取 ≤ 查询列的最大映射段）
 *   → 代码帧渲染（UTF-16 口径，与 sourcemap 列口径一致）。
 *
 * 口径与诚实边界（写进报告 totals，不伪造）：
 *   - resolved / unresolved / skipped(internal) 三态逐帧明示，未还原必带原因
 *   - sourcesContent 缺失时尝试磁盘读源文件（webpack:// 剥前缀 + map 目录相对），
 *     再缺失则只还原位置不出代码帧，绝不编造内容
 *   - 列口径：栈里的列与 sourcemap 的列同为 UTF-16 code unit，直接可比
 *
 * 安全模型：只读 fs（scanMapsDir + source 文件读取），零网络（URL 抓取在 service 层，
 * 引擎只接收已抓取的文本）；不写任何文件（selftest 临时目录除外且 finally 清理）。
 */
const fs = require('fs');
const path = require('path');

const VERSION = '0.1.0';

// ── 上限（防失控；触顶截断并在 warnings 明示，不静默）─────────────────────
const LIMITS = {
  maxStackChars: 512 * 1024,     // 栈文本上限
  maxStackFrames: 500,           // 解析帧数上限
  maxMaps: 150,                  // 一次 resolve 装入的 map 上限
  maxMapBytes: 60 * 1024 * 1024, // 单 map 上限
  maxDirFiles: 4000,             // 目录扫描文件数上限
  maxDirDepth: 5,                // 目录扫描深度
  maxJsTailProbe: 120,           // sourceMappingURL 注释探测的 .js 文件数
  maxPreviewLines: 12,           // 代码帧行数（上下各 5 + 命中 1 + 余量）
  maxSourceName: 300,            // source 名称截断
};

// ── Base64 VLQ（与 bundle-lens 同款已验证实现，本插件补 nameIdx 通道）───────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_TABLE = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
  return t;
})();

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
 * 解析 sourcemap 的 mappings。
 * 返回 Map<genLine, number[]>，行内扁平数组 [genCol, srcIdx, srcLine, srcCol, nameIdx, ...]
 * （srcIdx=-1 表示无源映射，其后字段省略）。genCol 每行重置，其余全 map 连续累加（spec 语义）。
 * lineOffset/firstColOffset：段式 map（sections）时该 section 的起始偏移。
 */
function decodeMappings(mappings, lineOffset, firstColOffset) {
  const lines = new Map();
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
    let semi = mappings.indexOf(';', pos);
    if (semi === -1) semi = len;
    if (semi > pos || pos < len) {
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
          let s = -1, nm = -1;
          if (fields.length >= 4) {
            srcIdx += fields[1];
            srcLine += fields[2];
            srcCol += fields[3];
            if (fields.length === 5) { nameIdx += fields[4]; nm = nameIdx; }
            s = srcIdx;
          }
          let arr = lines.get(genLine);
          if (!arr) { arr = []; lines.set(genLine, arr); }
          // 统一 5 步长（无源映射段占位 -1,0,0,-1）：保证行内与跨行遍历口径一致
          // 注意 push 的是全 map 连续累加的 srcLine/srcCol（spec 语义），不是局部占位
          if (s >= 0) arr.push(col, s, srcLine, srcCol, nm);
          else arr.push(col, -1, 0, 0, -1);
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

/** 归一 sourcemap 的 sources 条目：剥 webpack:// 等前缀、统一分隔符、剥查询串（bundle-lens 同款） */
function normalizeSourceName(raw) {
  let s = String(raw || '');
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, ''); // scheme
  s = s.replace(/^webpack[^:]*:/, ''); // webpack:// 内部命名空间
  s = s.replace(/^\.\//, '');
  s = s.replace(/[?].*$/, ''); // 查询串
  s = s.replace(/\\/g, '/');
  return s;
}

// ── sourcemap 解析 ──────────────────────────────────────────────────────────

/**
 * 解析 map JSON 文本为可查询对象。
 * 返回 {version, file, sourceRoot, sources, sourcesContent, names, lines, segCount,
 *       sections, warnings, error}
 * 支持段式 index map（sections[].map 递归展平，行/列偏移合并）。
 */
function parseSourceMap(jsonText, label) {
  const warnings = [];
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch (e) {
    return { error: `map JSON 解析失败（${label || 'map'}）：${e.message}` };
  }
  if (!obj || typeof obj !== 'object') return { error: 'map 内容不是 JSON 对象' };
  const version = obj.version;
  if (version !== 3 && !(obj.sections && Array.isArray(obj.sections))) {
    return { error: `不支持的 sourcemap 版本：${String(version)}（仅支持 v3 与段式 index map）` };
  }
  const out = {
    version: 3,
    file: typeof obj.file === 'string' ? obj.file : '',
    sourceRoot: typeof obj.sourceRoot === 'string' ? obj.sourceRoot : '',
    sources: [],
    sourcesContent: null,
    names: [],
    lines: new Map(),
    segCount: 0,
    sections: 0,
    warnings,
    error: null,
  };
  try {
    if (Array.isArray(obj.sections)) {
      out.sections = obj.sections.length;
      if (obj.sections.length > 64) warnings.push(`段式 map 含 ${obj.sections.length} 个 section（>64，超出部分已截断）`);
      for (const sec of obj.sections.slice(0, 64)) {
        if (!sec || !sec.map || typeof sec.map !== 'object') { warnings.push('存在无 map 的 section，已跳过'); continue; }
        const off = sec.offset || { line: 0, column: 0 };
        const sub = decodeMappings(String(sec.map.mappings || ''), off.line || 0, off.column || 0);
        const sourcesBase = out.sources.length;
        const namesBase = out.names.length;
        const subSources = Array.isArray(sec.map.sources) ? sec.map.sources : [];
        const subNames = Array.isArray(sec.map.names) ? sec.map.names : [];
        for (const s of subSources) out.sources.push(normalizeSourceName(s));
        for (const n of subNames) out.names.push(String(n));
        // 段式 map：每段有独立 sources/names 索引空间，合并时重定位到全局数组
        mergeLines(out.lines, sub, sourcesBase, namesBase);
        out.segCount += countSegs(sub);
      }
      if (obj.sourcesContent || obj.mappings) warnings.push('段式 map 顶层附带普通 map 字段，已按 sections 口径处理');
      // sourcesContent：段式 map 顶层一般没有；收集各 section 的（如有）
      collectSectionContents(obj, out, warnings);
    } else {
      out.sources = (Array.isArray(obj.sources) ? obj.sources : []).map(normalizeSourceName);
      out.names = (Array.isArray(obj.names) ? obj.names : []).map(String);
      if (Array.isArray(obj.sourcesContent)) {
        out.sourcesContent = obj.sourcesContent.map((c) => (typeof c === 'string' ? c : null));
        if (out.sourcesContent.length !== out.sources.length) {
          warnings.push(`sourcesContent(${out.sourcesContent.length}) 与 sources(${out.sources.length}) 数量不一致，缺失的将尝试磁盘读取`);
        }
      } else {
        warnings.push('map 无 sourcesContent：只还原位置，代码帧尝试磁盘读取');
      }
      out.lines = decodeMappings(String(obj.mappings || ''), 0, 0);
      out.segCount = countSegs(out.lines);
    }
  } catch (e) {
    return { error: `mappings 解析失败：${e.message}`, warnings };
  }
  return out;
}

function countSegs(lines) {
  let n = 0;
  for (const arr of lines.values()) n += arr.filter((v, i) => i % 5 === 0).length;
  return n;
}

/** 段式合并：拷贝 sub 行进 target，并把每段局部 sources/names 索引重定位到全局数组 */
function mergeLines(target, sub, sourcesBase, namesBase) {
  for (const [line, arr] of sub) {
    const copy = arr.slice();
    for (let i = 0; i < copy.length; i += 5) {
      if (copy[i + 1] >= 0) {
        copy[i + 1] += sourcesBase;
        if (copy[i + 4] >= 0) copy[i + 4] += namesBase;
      }
    }
    target.set(line, copy);
  }
}

function collectSectionContents(obj, out, warnings) {
  const contents = [];
  let total = 0;
  for (const sec of (obj.sections || []).slice(0, 64)) {
    const m = sec && sec.map;
    if (m && Array.isArray(m.sourcesContent)) {
      for (let i = 0; i < m.sources.length; i++) contents.push(typeof m.sourcesContent[i] === 'string' ? m.sourcesContent[i] : null);
    } else if (m && Array.isArray(m.sources)) {
      for (let i = 0; i < m.sources.length; i++) contents.push(null);
    }
  }
  if (contents.length) {
    out.sourcesContent = contents;
    total = contents.filter((c) => typeof c === 'string').length;
    if (total === 0) warnings.push('段式 map 无 sourcesContent：代码帧尝试磁盘读取');
  }
}

// ── 位置还原 ────────────────────────────────────────────────────────────────

/**
 * 同生成行内取 genCol ≤ 查询列的最大映射段（spec 惯例：列区间左闭右开）。
 * 返回 {source, sourceIndex, line, column, name} 或 null（该行无任何带源映射段）。
 */
function originalPositionFor(map, genLine, genCol) {
  const arr = map.lines.get(genLine);
  if (!arr) return null;
  let best = -1;
  for (let i = 0; i < arr.length; i += 5) {
    if (arr[i + 1] < 0) continue; // 无源映射段
    if (arr[i] <= genCol && (best < 0 || arr[i] > arr[best])) best = i;
  }
  if (best < 0) return null;
  const srcIdx = arr[best + 1];
  const source = map.sources[srcIdx] != null ? map.sources[srcIdx] : `(source#${srcIdx})`;
  const nameIdx = arr[best + 4];
  return {
    source,
    sourceIndex: srcIdx,
    line: arr[best + 2],
    column: arr[best + 3],
    name: nameIdx >= 0 && map.names[nameIdx] != null ? map.names[nameIdx] : null,
  };
}

// ── 栈解析 ──────────────────────────────────────────────────────────────────

/**
 * 解析错误栈文本。覆盖格式：
 *   Chrome/Node:  at fn (url:line:col) / at fn [as alias] (url:line:col) / at url:line:col
 *   Chrome eval:  at fn (eval at fn2 (url:l:c), <anonymous>:l:c)
 *   Safari/Firefox: fn@url:line:col / fn@url:line（旧 Safari 无列）
 *   Node 内部:    node:internal/... 标记 isInternal
 * 未知行保留 raw 并标注 unparsed；首条非 at 行识别为 message。
 * @returns {{message: string|null, format: string, frames: Array, truncated: boolean, notes: string[]}}
 */
function parseStack(text) {
  const notes = [];
  if (typeof text !== 'string' || !text.trim()) {
    return { message: null, format: 'empty', frames: [], truncated: false, notes: ['栈文本为空'] };
  }
  let t = text;
  let truncated = false;
  if (t.length > LIMITS.maxStackChars) {
    t = t.slice(0, LIMITS.maxStackChars);
    truncated = true;
    notes.push(`栈文本超 ${LIMITS.maxStackChars} 字符，已截断`);
  }
  const lines = t.split(/\r?\n/);
  const frames = [];
  let message = null;
  let formatHits = { v8: 0, spidermonkey: 0 };
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const f = parseStackLine(line);
    if (f.kind === 'frame') {
      formatHits[f.engine] += 1;
      if (frames.length < LIMITS.maxStackFrames) frames.push(f);
      else { truncated = true; }
    } else if (f.kind === 'message') {
      if (message == null) message = line.trim();
      // 其余非 at 行（如 Caused by: / ... N more）忽略计数
    } else if (f.kind === 'skip') {
      // 空转/异步 tick 行
    }
  }
  let format = 'unknown';
  if (formatHits.v8 && formatHits.spidermonkey) format = 'mixed';
  else if (formatHits.v8) format = 'v8';
  else if (formatHits.spidermonkey) format = 'spidermonkey';
  if (format === 'unknown' && frames.length) format = 'unknown-but-frames';
  if (frames.length >= LIMITS.maxStackFrames) notes.push(`帧数达上限 ${LIMITS.maxStackFrames}，已截断`);
  return { message, format, frames, truncated, notes };
}

/** 单行解析。kind: frame | message | skip | unparsed */
function parseStackLine(line) {
  const trimmed = line.trim();
  // V8 家族：at ...
  if (/^at\s/.test(trimmed) || /^at$/.test(trimmed)) {
    const body = trimmed.replace(/^at\s+/, '');
    // at fn (url:line:col) —— fn 可能带 [as alias]
    let m = body.match(/^(.*?)\s*\((.+)\)\s*$/);
    let fn = '';
    let loc = body;
    if (m) { fn = m[1]; loc = m[2]; }
    // eval 帧：eval at fn (url:l:c), <anonymous>:l:c —— 取 <anonymous>:l:c 为真实位置
    const evalM = loc.match(/^eval at .*?,\s*(.+)$/) || loc.match(/^new Promise \(.*?,\s*(.+)\)$/);
    if (evalM) loc = evalM[1];
    const isInternal = /^node:internal\//.test(loc) || /^internal\//.test(loc);
    const pos = parseLocation(loc);
    if (pos) {
      return {
        kind: 'frame', engine: 'v8', raw: line,
        fn: fn.replace(/\s*\[as .*?\]\s*$/, '').replace(/^async\s+/, '') || null,
        url: pos.url, line: pos.line, col: pos.col,
        isInternal, evalFrame: Boolean(evalM),
      };
    }
    return { kind: 'unparsed', raw: line, reason: 'at 行无法提取 file:line:col' };
  }
  // SpiderMonkey 家族：fn@url:line:col（fn 可空）
  const smM = trimmed.match(/^(.*?)@(\S+?)(?::(\d+))?(?::(\d+))?$/);
  if (smM && /[@]/.test(trimmed)) {
    const loc = smM[2];
    const isInternal = /^node:internal\//.test(loc) || /^resource:\/\//.test(loc);
    return {
      kind: 'frame', engine: 'spidermonkey', raw: line,
      fn: smM[1] || null, url: loc,
      line: smM[3] ? parseInt(smM[3], 10) : null,
      col: smM[4] ? parseInt(smM[4], 10) : null,
      isInternal, evalFrame: false,
    };
  }
  // 忽略行：分隔/省略（"... 3 more"）
  if (/^\.\.\.(?:\s*\d+\s*more)?$/.test(trimmed)) {
    return { kind: 'skip', raw: line };
  }
  return { kind: 'message', raw: line };
}

/** 从 loc 提取 url/line/col。location 末尾应为 :line:col 或 :line（列可缺）。 */
function parseLocation(loc) {
  if (!loc) return null;
  // 括号内的位置可能带行号；URL 自身可能含 :port，从右往左取两段数字
  const m = loc.match(/^(.*?)(?::(\d+))(?::(\d+))?$/);
  if (!m) {
    // 只有 url（无行号）——Safari 老格式
    if (/^[^:]*\S/.test(loc)) return { url: loc, line: null, col: null };
    return null;
  }
  const url = m[1];
  const line = m[2] != null ? parseInt(m[2], 10) : null;
  const col = m[3] != null ? parseInt(m[3], 10) : null;
  if (!url || (!line && line !== 0)) return null;
  return { url, line, col };
}

// ── map 配对 ────────────────────────────────────────────────────────────────

function basenameOf(urlOrPath) {
  const s = String(urlOrPath || '').split(/[\\/]/).pop() || '';
  return s.replace(/[?].*$/, '');
}

function stripQuery(u) {
  return String(u || '').replace(/[?].*$/, '');
}

/**
 * 从 map 集合中为生成文件 url 选 map。
 * 优先级：① map.file 与 url basename 一致
 *        ② map 来源路径 basename === url.basename + '.map'（app.abc.js ↔ app.abc.js.map）
 *        ③ sourceMappingURL 显式关系：fromFile（map 来自哪个 js）=== url.basename，
 *          或 fromJs 值本身 === url.basename + '.map'
 * @param {Array<{map:object, originPath?:string, fromJs?:string, fromFile?:string}>} mapSet
 */
function matchMap(mapSet, url) {
  const urlB = basenameOf(stripQuery(url));
  // ① map.file 字段
  for (const item of mapSet) {
    if (item.map && item.map.file && stripQuery(item.map.file) === urlB) return item;
  }
  // ② 来源路径 basename：app.abc.js ↔ app.abc.js.map
  for (const item of mapSet) {
    if (!item.originPath) continue;
    const base = basenameOf(item.originPath);
    if (base === `${urlB}.map` || base === `${urlB}`) return item;
  }
  // ③ sourceMappingURL 显式指向
  for (const item of mapSet) {
    if (item.fromFile && item.fromFile === urlB) return item;
    if (item.fromJs && basenameOf(stripQuery(item.fromJs)) === `${urlB}.map`) return item;
  }
  return null;
}

/**
 * 目录扫描：收集 *.map + 相邻 .js 的 sourceMappingURL 注释。
 * 返回 {maps: [{originPath, fromJs?, jsonText, bytes}], walked, warnings}
 * 只读；超限截断并写入 warnings。
 */
function scanMapsDir(dir) {
  const warnings = [];
  const maps = [];
  const jsCandidates = [];
  let walked = 0;
  if (!dir || typeof dir !== 'string') return { maps, walked, warnings: ['目录为空'] };
  const root = path.resolve(dir);
  let rootStat;
  try { rootStat = fs.statSync(root); } catch (_) { return { maps, walked, warnings: [`目录不可读：${dir}`] }; }
  if (!rootStat.isDirectory()) return { maps, walked, warnings: [`不是目录：${dir}`] };
  const stack = [{ p: root, d: 0 }];
  while (stack.length) {
    const { p, d } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { warnings.push(`跳过不可读目录：${p}（${e.code || e.message}）`); continue; }
    for (const ent of entries) {
      walked += 1;
      if (walked > LIMITS.maxDirFiles) { warnings.push(`目录文件数超 ${LIMITS.maxDirFiles}，扫描已截断`); stack.length = 0; break; }
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) {
        if (d < LIMITS.maxDirDepth && !/^node_modules$|^\.git$|^\.svn$/.test(ent.name)) stack.push({ p: full, d: d + 1 });
        continue;
      }
      if (!ent.isFile()) continue;
      if (/\.map$/i.test(ent.name)) {
        try {
          const st = fs.statSync(full);
          if (st.size > LIMITS.maxMapBytes) { warnings.push(`map 超大跳过（${st.size}B）：${ent.name}`); continue; }
          const jsonText = fs.readFileSync(full, 'utf8');
          maps.push({ originPath: full, jsonText, bytes: st.size });
        } catch (e) { warnings.push(`map 读取失败：${ent.name}（${e.message}）`); }
      } else if (/\.(js|mjs|cjs)$/i.test(ent.name) && jsCandidates.length < LIMITS.maxJsTailProbe) {
        jsCandidates.push(full);
      }
    }
  }
  // sourceMappingURL 注释探测：读尾部 4KB（记录来自哪个 js，供 matchMap ③ 显式配对）
  for (const js of jsCandidates) {
    try {
      const st = fs.statSync(js);
      if (st.size > LIMITS.maxMapBytes) continue;
      const fd = fs.openSync(js, 'r');
      const tailLen = Math.min(4096, st.size);
      const buf = Buffer.alloc(tailLen);
      fs.readSync(fd, buf, 0, tailLen, st.size - tailLen);
      fs.closeSync(fd);
      const tail = buf.toString('utf8');
      const m = tail.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)/);
      if (m && m[1] && !/^(?:data:|https?:)/.test(m[1])) {
        maps.push({ originPath: null, fromJs: m[1], fromFile: basenameOf(js), jsonText: null, pendingPath: path.dirname(js), bytes: 0 });
      }
    } catch (_) { /* 探测失败不致命 */ }
  }
  // 把 fromJs 相对路径解析为真实 map 文件内容（已直读过的去重：同一文件只收一条）
  const seenPaths = new Set();
  const resolved = [];
  for (const item of maps) {
    if (item.jsonText != null) {
      if (item.originPath) seenPaths.add(path.resolve(item.originPath));
      resolved.push(item);
      continue;
    }
    const target = path.resolve(item.pendingPath, item.fromJs);
    if (seenPaths.has(target)) continue; // 直读已覆盖，跳过 fromJs 重复条目
    try {
      const st = fs.statSync(target);
      if (st.size > LIMITS.maxMapBytes) { warnings.push(`sourceMappingURL 指向的 map 超大跳过：${item.fromJs}`); continue; }
      seenPaths.add(target);
      resolved.push({ originPath: target, fromJs: item.fromJs, fromFile: item.fromFile, jsonText: fs.readFileSync(target, 'utf8'), bytes: st.size });
    } catch (_) { warnings.push(`sourceMappingURL=${item.fromJs} 指向的文件不存在`); }
  }
  if (resolved.length > LIMITS.maxMaps) {
    warnings.push(`map 数量超 ${LIMITS.maxMaps}，只取前 ${LIMITS.maxMaps} 个`);
    resolved.length = LIMITS.maxMaps;
  }
  return { maps: resolved, walked, warnings };
}

// ── 代码帧 ──────────────────────────────────────────────────────────────────

/** 代码帧：命中行上下各 context 行，行号 + 竖线 + 列指针。content 按行拆（\r\n 归一）。 */
function codeFrame(content, line1, col1, context) {
  if (typeof content !== 'string' || !content) return null;
  const ctx = Math.min(Math.max(context == null ? 2 : context, 0), 5);
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const ln = line1; // 1-based
  if (!Number.isInteger(ln) || ln < 1 || ln > lines.length) return null;
  const from = Math.max(1, ln - ctx);
  const to = Math.min(lines.length, ln + ctx);
  const width = String(to).length;
  const out = [];
  for (let i = from; i <= to; i++) {
    const text = lines[i - 1];
    const num = String(i).padStart(width, ' ');
    if (i === ln) {
      out.push(`${num} | ${text}`);
      if (Number.isInteger(col1) && col1 >= 1) {
        const caretPad = ' '.repeat(Math.min(col1 - 1, text.length));
        out.push(`${' '.repeat(width)} | ${caretPad}^`);
      }
    } else {
      out.push(`${num} | ${text}`);
    }
  }
  return out.join('\n');
}

// ── 总编排：解析栈 + 配 map + 逐帧还原 ──────────────────────────────────────

/**
 * @param {string} stackText 错误栈
 * @param {Array<{jsonText?:string, originPath?:string, fromJs?:string, mapText?:string, label?:string}>} mapInputs
 *   —— jsonText/mapText 二选一；originPath/fromJs 用于配对与展示
 * @param {{fsReader?: (p:string)=>string|null, wantFrames?: boolean}} opts
 *   fsReader：磁盘读源文件（service 传真读；纯引擎测试传 null）；wantFrames 默认 true
 * @returns {{stack:*, maps:[{label,ok,error?,segCount?,sources?}], frames:[...], summary, warnings}}
 */
function resolveStack(stackText, mapInputs, opts) {
  const options = opts || {};
  const warnings = [];
  const stack = parseStack(stackText);
  for (const n of stack.notes) warnings.push(n);

  // 装载 maps
  const loaded = [];
  const mapReports = [];
  for (const inp of (mapInputs || []).slice(0, LIMITS.maxMaps)) {
    const label = inp.label || inp.originPath || inp.fromJs || `map#${loaded.length + 1}`;
    const text = inp.jsonText != null ? inp.jsonText : inp.mapText;
    if (text == null) { mapReports.push({ label, ok: false, error: '无 map 内容' }); continue; }
    const parsed = parseSourceMap(text, label);
    if (parsed.error) { mapReports.push({ label, ok: false, error: parsed.error }); warnings.push(`${label}：${parsed.error}`); continue; }
    for (const w of parsed.warnings) mapReports.push({ label, ok: true, warning: w });
    loaded.push({ map: parsed, originPath: inp.originPath, fromJs: inp.fromJs, label });
    mapReports.push({ label, ok: true, segCount: parsed.segCount, sources: parsed.sources.length });
  }
  if ((mapInputs || []).length > LIMITS.maxMaps) warnings.push(`map 输入超 ${LIMITS.maxMaps}，已截断`);

  // 逐帧还原
  const wantFrames = options.wantFrames !== false;
  const fsReader = typeof options.fsReader === 'function' ? options.fsReader : null;
  const frames = stack.frames.map((f) => resolveFrame(f, loaded, { wantFrames, fsReader }));

  let resolved = 0;
  let internal = 0;
  let noMap = 0;
  for (const fr of frames) {
    if (fr.state === 'resolved') resolved += 1;
    else if (fr.state === 'internal') internal += 1;
    else if (fr.reason === '未找到匹配的 sourcemap') noMap += 1;
  }
  const eligible = frames.length - internal;
  const summary = {
    frames: frames.length,
    resolved,
    internal,
    noMap,
    eligible,
    rate: eligible > 0 ? Math.round((resolved / eligible) * 100) : 0,
    format: stack.format,
    message: stack.message,
    truncated: stack.truncated,
  };
  return { stack, maps: mapReports, frames, summary, warnings };
}

function resolveFrame(f, loaded, opts) {
  const base = { raw: f.raw, fn: f.fn, url: f.url, line: f.line, col: f.col, engine: f.engine, isInternal: f.isInternal };
  if (f.kind !== 'frame') return { ...base, state: 'unparsed', reason: f.reason || '无法解析该行' };
  if (f.isInternal) return { ...base, state: 'internal', reason: '运行时内部帧（node:internal 等），跳过还原' };
  if (f.line == null || f.line < 1) return { ...base, state: 'unresolved', reason: '栈帧无有效行号（老格式），无法定位' };
  const item = matchMap(loaded, f.url);
  if (!item) {
    return { ...base, state: 'unresolved', reason: '未找到匹配的 sourcemap' };
  }
  const pos = originalPositionFor(item.map, f.line - 1, f.col == null ? 0 : f.col - 1);
  if (!pos) {
    return { ...base, state: 'unresolved', reason: `map（${item.label}）在生成行 ${f.line} 无带源映射的段`, mapLabel: item.label };
  }
  const out = {
    ...base,
    state: 'resolved',
    mapLabel: item.label,
    source: pos.source,
    sourceLine: pos.line + 1,
    sourceCol: pos.column + 1,
    name: pos.name,
    displayName: pos.name || f.fn || null,
  };
  if (opts.wantFrames) {
    out.codeFrameSource = null;
    const content = contentFor(item.map, pos.sourceIndex, pos.source, opts.fsReader, item);
    if (content != null) {
      out.codeFrameSource = content.from;
      out.codeFrame = codeFrame(content.text, out.sourceLine, out.sourceCol, 2);
      if (out.codeFrame == null) out.codeFrameNote = '源内容存在但行号越界（源文件与 map 不同步？）';
    } else {
      out.codeFrameNote = '无 sourcesContent 且磁盘不可得：只还原位置';
    }
  }
  return out;
}

/** map 里取源内容：sourcesContent 优先，退化磁盘读（相对 map 目录 / 绝对路径） */
function contentFor(map, sourceIndex, sourceName, fsReader, mapItem) {
  if (map.sourcesContent && map.sourcesContent[sourceIndex] != null) {
    return { from: 'sourcesContent', text: map.sourcesContent[sourceIndex] };
  }
  if (!fsReader) return null;
  // 尝试磁盘：webpack:// 剥前缀后的相对名，相对 map 所在目录解析
  const candidates = [];
  if (mapItem && mapItem.originPath) {
    const dir = path.dirname(mapItem.originPath);
    const rel = sourceName.replace(/^\//, '');
    candidates.push(path.resolve(dir, rel));
  }
  if (path.isAbsolute(sourceName)) candidates.push(sourceName);
  for (const c of candidates) {
    try {
      const text = fsReader(c);
      if (typeof text === 'string') return { from: c, text };
    } catch (_) { /* 下一候选 */ }
  }
  return null;
}

// ── map 体检 ────────────────────────────────────────────────────────────────

/** 结构校验 + 覆盖率。返回 {ok, error?, stats, warnings} */
function validateMap(jsonText, label) {
  const parsed = parseSourceMap(jsonText, label || 'map');
  if (parsed.error) return { ok: false, error: parsed.error, stats: null, warnings: parsed.warnings || [] };
  const stats = {
    segCount: parsed.segCount,
    genLines: parsed.lines.size,
    sources: parsed.sources.length,
    names: parsed.names.length,
    hasSourcesContent: Boolean(parsed.sourcesContent && parsed.sourcesContent.some((c) => c != null)),
    sourcesContentCount: parsed.sourcesContent ? parsed.sourcesContent.filter((c) => c != null).length : 0,
    sections: parsed.sections,
    file: parsed.file || null,
  };
  const warnings = parsed.warnings.slice();
  if (stats.segCount === 0) warnings.push('mappings 为空：该 map 不含任何映射段');
  if (stats.sources === 0) warnings.push('sources 为空');
  return { ok: true, stats, warnings };
}

/** map 清单预览（面板/MCP 列表用）：不展开 mappings 全解析，只读头字段 */
function mapBrief(jsonText, originPath) {
  try {
    const obj = JSON.parse(jsonText);
    const isSections = Array.isArray(obj.sections);
    return {
      originPath: originPath || null,
      file: typeof obj.file === 'string' ? obj.file : null,
      version: obj.version,
      sections: isSections ? obj.sections.length : 0,
      sources: isSections
        ? (obj.sections || []).reduce((n, s) => n + ((s && s.map && Array.isArray(s.map.sources)) ? s.map.sources.length : 0), 0)
        : (Array.isArray(obj.sources) ? obj.sources.length : 0),
      hasContent: isSections
        ? (obj.sections || []).some((s) => s && s.map && Array.isArray(s.map.sourcesContent) && s.map.sourcesContent.some((c) => typeof c === 'string'))
        : Array.isArray(obj.sourcesContent) && obj.sourcesContent.some((c) => typeof c === 'string'),
      bytes: Buffer.byteLength(jsonText),
      names: !isSections && Array.isArray(obj.names) ? obj.names.length : 0,
    };
  } catch (e) {
    return { originPath: originPath || null, error: e.message };
  }
}

module.exports = {
  VERSION, LIMITS,
  decodeVlqLine, decodeMappings, parseSourceMap, originalPositionFor,
  normalizeSourceName, parseStack, parseStackLine, parseLocation,
  matchMap, scanMapsDir, codeFrame, resolveStack, resolveFrame,
  contentFor, validateMap, mapBrief,
  basenameOf, stripQuery,
};
