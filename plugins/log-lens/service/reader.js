'use strict';
/**
 * reader.js —— 日志流式读取核（零依赖）
 *
 * 铁律：绝不整载文件。所有读取都走 offset/chunk：
 *   - forwardRead   正向分页（offset→limit 条匹配或扫描上限即停）
 *   - tailRead      尾部反读（从 EOF/指定位置向前找 N 个头行，再前向解析归并）
 *   - watchIncrement增量轮询（live tail；只读新增完整行，半行不吐）
 *   - searchFiles   多文件流式搜索（每文件扫描上限）
 *
 * 字节级换行分割：utf8/gbk 换行 = 0x0A；utf16le 换行 = 0A 00（两字节序列，
 * 用 Buffer.indexOf(NLBuf) 定位，避免把高位字节 0x0A 误判为换行）。
 * 行边界在字节层确定后逐行解码——多字节字符不会被 chunk 边界切断。
 *
 * 每响应预算由调用方（main.js）控制：行数 ≤500、字节 ≤2MB、单请求扫描上限。
 */

const fs = require('fs');
const { detectEncoding, lineDecoder } = require('./charset');
const { detectFormat, createParser } = require('./parser');

const CHUNK_FORWARD = 256 * 1024;
const CHUNK_REVERSE = 64 * 1024;
const DETECT_HEAD_BYTES = 256 * 1024;
const NL_UTF16LE = Buffer.from('\n', 'utf16le');

// ── 文件元信息缓存（编码/格式探测按 mtime 失效）─────────────────────────────
const metaCache = new Map(); // path → {mtimeMs, size, encoding, format}
const META_CACHE_MAX = 64;

function readHeadBuf(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(DETECT_HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/** 取文件元信息（编码/格式），mtime 变化自动重探；文件不存在抛错 */
function fileMeta(file) {
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error(`不是常规文件: ${file}`);
  const hit = metaCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
  const head = readHeadBuf(file);
  const encoding = detectEncoding(head);
  // 探测格式用解码后的前若干行（TextDecoder 默认剥 BOM）
  const text = lineDecoder(encoding)(head);
  const lines = text.split('\n').slice(0, 200);
  const format = detectFormat(lines);
  const meta = { mtimeMs: st.mtimeMs, size: st.size, encoding, format };
  if (metaCache.size >= META_CACHE_MAX) {
    const first = metaCache.keys().next().value;
    metaCache.delete(first);
  }
  metaCache.set(file, meta);
  return meta;
}

// ── 字节级行迭代 ────────────────────────────────────────────────────────────
function newlineInfo(encoding) {
  return encoding === 'utf16le' ? NL_UTF16LE : null; // null → 单字节 0x0A
}

function findNewline(buf, from, nlBuf) {
  const i = nlBuf ? buf.indexOf(nlBuf, from) : buf.indexOf(0x0a, from);
  return i === -1 ? null : { index: i, length: nlBuf ? 2 : 1 };
}

function stripCr(lineBuf, encoding) {
  if (encoding === 'utf16le') {
    if (lineBuf.length >= 2 && lineBuf[lineBuf.length - 2] === 0x0d && lineBuf[lineBuf.length - 1] === 0x00) {
      return lineBuf.subarray(0, lineBuf.length - 2);
    }
    return lineBuf;
  }
  if (lineBuf.length > 0 && lineBuf[lineBuf.length - 1] === 0x0d) {
    return lineBuf.subarray(0, lineBuf.length - 1);
  }
  return lineBuf;
}

/**
 * 正向逐行迭代（字节级，含跨 chunk 行拼接）。
 * utf8 走批量解码快路径：整块解码一次 + 文本切行 + Buffer.byteLength 回算
 * 字节偏移（行边界是合法 utf8 边界，逐行解码慢 5 倍以上——81MB 实测 8s→~3s）。
 * BOM：TextDecoder 默认剥 BOM，byteRel 需补 3 字节偏移保持 offset 对齐。
 * @yields {{start:number, end:number, text:string}} end = 行尾换行符之后
 * @param opts {{endOffset?:number, finalPartial:'skip'|'yield', maxBytes?:number}}
 */
function* iterateLines(file, encoding, startOffset, opts) {
  const finalPartial = (opts && opts.finalPartial) || 'yield';
  const endLimit = (opts && opts.endOffset) !== undefined ? opts.endOffset : Infinity;
  const maxBytes = (opts && opts.maxBytes) || Infinity;
  const nlBuf = newlineInfo(encoding);
  const batchUtf8 = encoding === 'utf8';
  const decode8 = batchUtf8 ? new TextDecoder('utf-8', { fatal: false }) : null;
  const decode = batchUtf8 ? null : lineDecoder(encoding);
  const fd = fs.openSync(file, 'r');
  try {
    let pos = startOffset;
    let carry = Buffer.alloc(0);
    let carryStart = startOffset; // carry 首字节的绝对偏移
    let yieldedBytes = 0;
    let eof = false;
    let bomPad = 0; // 批量路径：首块 BOM 字节数（offset 对齐用）
    while (!eof) {
      if (pos >= endLimit || yieldedBytes >= maxBytes) return;
      const want = Math.min(CHUNK_FORWARD, endLimit - pos, maxBytes - yieldedBytes + carry.length);
      if (want <= 0) return;
      const buf = Buffer.alloc(want);
      const n = fs.readSync(fd, buf, 0, want, pos);
      if (n <= 0) { eof = true; break; }
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n);
      const dataStart = carryStart;
      pos += n;
      yieldedBytes += n;
      if (batchUtf8) {
        if (dataStart === 0 && data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) bomPad = 3;
        const text = decode8.decode(data);
        let lineStart = 0;
        let byteRel = bomPad;
        for (;;) {
          const nl = text.indexOf('\n', lineStart);
          if (nl === -1) break;
          let lineText = text.slice(lineStart, nl);
          let lineBytes = Buffer.byteLength(lineText);
          let sep = 1;
          if (lineText.endsWith('\r')) { lineText = lineText.slice(0, -1); lineBytes -= 1; sep = 2; }
          yield { start: dataStart + byteRel, end: dataStart + byteRel + lineBytes + sep, text: lineText };
          byteRel += lineBytes + sep;
          lineStart = nl + 1;
        }
        carry = data.subarray(byteRel);
        carryStart = dataStart + byteRel;
      } else {
        // 扫描换行
        let from = 0;
        for (;;) {
          const nl = findNewline(data, from, nlBuf);
          if (!nl) break;
          const lineEnd = nl.index + nl.length;
          yield {
            start: dataStart + from,
            end: dataStart + lineEnd,
            text: decode(stripCr(data.subarray(from, nl.index), encoding)),
          };
          from = lineEnd;
        }
        carry = data.subarray(from);
        carryStart = dataStart + from;
      }
      if (pos >= endLimit || yieldedBytes >= maxBytes) eof = true;
    }
    // EOF 收尾：carry 是最后一行（可能无换行符）
    if (carry.length) {
      if (finalPartial === 'yield') {
        const text = batchUtf8 ? decode8.decode(carry) : decode(stripCr(carry, encoding));
        const clean = batchUtf8 && text.endsWith('\r') ? text.slice(0, -1) : text;
        yield { start: carryStart, end: carryStart + carry.length, text: clean };
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

// ── 过滤器 ──────────────────────────────────────────────────────────────────
/**
 * @param filters {{levels?:string[], q?:string, regex?:string}}
 * 级别过滤含派生：选 ERROR 不含 WARN；continuation 孤儿行（level=null）跟随时附进
 * 上一条 entry，不会被单独过滤掉。
 */
function makeFilter(filters) {
  const levels = filters && filters.levels && filters.levels.length ? new Set(filters.levels.map((l) => String(l).toUpperCase())) : null;
  const q = filters && filters.q ? String(filters.q).toLowerCase() : '';
  let re = null;
  if (filters && filters.regex) {
    try { re = new RegExp(filters.regex, 'i'); } catch (_) { throw new Error(`正则无效: ${filters.regex}`); }
  }
  if (!levels && !q && !re) return null;
  return (entry) => {
    if (entry.continuation) return true; // 孤儿行不参与过滤（信息不丢）
    if (levels && !levels.has(entry.level)) return false;
    const hay = `${entry.target} ${entry.message}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (re && !re.test(`${entry.target} ${entry.message}`)) return false;
    return true;
  };
}

// ── 正向分页读取 ────────────────────────────────────────────────────────────
/**
 * @param opts {{offset?:number, limit?:number, levels?:string[], q?:string, regex?:string, scanCap?:number}}
 * @returns {{entries, nextOffset, eof, scannedBytes, fileSize, encoding, format, truncated}}
 * nextOffset 语义：最后一条已输出 entry 的 endOffset（未满 limit 时为 fileSize）。
 * limit 截断时解析器中暂存的 entry 不输出，下一页从其行首重读——不丢不重。
 */
function forwardRead(file, opts) {
  const meta = fileMeta(file);
  const offset = Math.max(0, parseInt(opts && opts.offset, 10) || 0);
  const limit = Math.min(Math.max(parseInt(opts && opts.limit, 10) || 200, 1), 500);
  const scanCap = Math.min(Math.max(parseInt(opts && opts.scanCap, 10) || 16 * 1024 * 1024, 64 * 1024), 512 * 1024 * 1024);
  const filter = makeFilter(opts);
  const parser = createParser(meta.format);
  const decode = lineDecoder(meta.encoding);
  const entries = [];
  let scanned = 0;
  let lastEnd = offset;
  let eof = false;
  const it = iterateLines(file, meta.encoding, offset, { maxBytes: scanCap });
  for (const line of it) {
    scanned = line.end - offset;
    lastEnd = line.end;
    const entry = parser.addLine(line.text, line.start, line.end);
    if (!entry) continue; // 归并进暂存
    if (!filter || filter(entry)) {
      entries.push(entry);
      lastEnd = entry.endOffset;
      if (entries.length >= limit) break;
    }
  }
  // 扫描上限耗尽 ≠ EOF（文件还有剩余字节）——不能当成读完
  if (scanned < scanCap && entries.length < limit) {
    const rest = parser.flush();
    if (rest && (!filter || filter(rest))) entries.push(rest);
    eof = true;
    lastEnd = meta.size;
  }
  return {
    entries, nextOffset: eof ? meta.size : lastEnd, eof, scannedBytes: scanned,
    fileSize: meta.size, encoding: meta.encoding, format: meta.format,
    truncated: !eof,
  };
}

// ── 尾部反读 ────────────────────────────────────────────────────────────────
/**
 * 从 startAbs（默认 EOF）向前收集原始行（字节级），再前向解析归并出 entry，
 * 取最后 maxLines 条。窗口上限 maxBytes=4MB / maxRawLines=maxHeaders*2+16。
 * @param opts {{beforeOffset?:number, maxLines?:number, levels?, q?, regex?}}
 */
function tailRead(file, opts) {
  const meta = fileMeta(file);
  const maxLines = Math.min(Math.max(parseInt(opts && opts.maxLines, 10) || 200, 1), 500);
  const filter = makeFilter(opts);
  const beforeOffset = opts && opts.beforeOffset !== undefined && opts.beforeOffset !== null
    ? Math.max(0, Math.min(parseInt(opts.beforeOffset, 10) || 0, meta.size))
    : meta.size;
  const maxBytes = 4 * 1024 * 1024;
  const maxRaw = maxLines * 2 + 16;
  const nlBuf = newlineInfo(meta.encoding);
  const decode = lineDecoder(meta.encoding);
  const fd = fs.openSync(file, 'r');
  const raw = []; // {buf, start, end} 新→旧
  try {
    let pos = beforeOffset;
    let carry = Buffer.alloc(0); // 区间头部的不完整行（属更早的字节区，拼到下一块末尾）
    let scanned = 0;
    while (pos > 0 && raw.length < maxRaw && scanned < maxBytes) {
      const a = Math.max(0, pos - CHUNK_REVERSE);
      const len = pos - a;
      const chunk = Buffer.alloc(len);
      const n = fs.readSync(fd, chunk, 0, len, a);
      if (n <= 0) break;
      const data = Buffer.concat([chunk.subarray(0, n), carry]);
      // 完整行分段：content [contentStart, nl.index)，行尾含换行止于 nl.index+nlLen
      const lines = [];
      let from = 0;
      for (;;) {
        const nl = findNewline(data, from, nlBuf);
        if (!nl) break;
        lines.push({ contentStart: from, contentEnd: nl.index, endAfterNL: nl.index + nl.length });
        from = nl.index + nl.length;
      }
      const tailPartial = from < data.length ? { contentStart: from, contentEnd: data.length, endAfterNL: data.length } : null;
      // carry：a 侧被切断行的尾部（必须带上其终止换行符，拼到下一块之后该行才完整；
      // 整块无换行 → 整段带入，跨多块长行逐块累积）。a===0 时无更早字节，carry 清空。
      if (a === 0) {
        carry = Buffer.alloc(0);
      } else if (lines.length) {
        carry = data.subarray(0, lines[0].endAfterNL);
      } else {
        carry = data.subarray(0, data.length);
      }
      // 完整行收集（新→旧）：a>0 时 lines[0] 是被切断行（头部缺失→进 carry），
      // 其余段完整；a===0 时全部段完整（首段即文件第一行）。
      const complete = a === 0 ? lines.slice() : lines.slice(1);
      // 尾部残段仅当「扫描区已到 EOF（行由文件尾终止）」且头部在本块内时是完整行；
      // readBack（beforeOffset < size）时边界行延伸出扫描区 → 永不完整，正确排除
      if (tailPartial && beforeOffset === meta.size && (lines.length > 0 || a === 0)) {
        complete.push(tailPartial);
      }
      for (let i = complete.length - 1; i >= 0 && raw.length < maxRaw; i--) {
        const L = complete[i];
        raw.push({ buf: data.subarray(L.contentStart, L.contentEnd), start: a + L.contentStart, end: a + L.endAfterNL });
      }
      scanned += n;
      pos = a;
      if (raw.length >= maxRaw || scanned >= maxBytes) break;
    }
    // BOF 剩余 carry 是文件第一行
    if (pos === 0 && carry.length && raw.length < maxRaw) {
      raw.push({ buf: carry, start: 0, end: carry.length });
    }
  } finally {
    fs.closeSync(fd);
  }
  // 前向解析（时间顺序）
  const parser = createParser(meta.format);
  const entries = [];
  const chrono = raw.slice().reverse();
  for (const r of chrono) {
    const entry = parser.addLine(decode(stripCr(r.buf, meta.encoding)), r.start, r.end);
    if (entry) entries.push(entry);
  }
  const rest = parser.flush();
  if (rest) entries.push(rest);
  const matched = filter ? entries.filter(filter) : entries;
  const window = matched.slice(-maxLines);
  return {
    entries: window,
    oldestOffset: window.length ? window[0].offset : Math.max(0, beforeOffset),
    fileSize: meta.size,
    encoding: meta.encoding,
    format: meta.format,
    bofReached: beforeOffset === 0 || (window.length > 0 && window[0].offset === 0),
    hasMore: matched.length > window.length,
  };
}

// ── live tail 增量 ──────────────────────────────────────────────────────────
/**
 * 读取 offset 之后的新增完整行（文件写入中的半行不吐，等下次）。
 * @returns {{rotated:boolean, grown:boolean, entries, newOffset, size}}
 */
function watchIncrement(file, offset, maxBytes) {
  const meta = fileMeta(file);
  const cap = Math.min(maxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024);
  if (meta.size < offset) {
    return { rotated: true, grown: false, entries: [], newOffset: 0, size: meta.size, encoding: meta.encoding, format: meta.format };
  }
  if (meta.size === offset) {
    return { rotated: false, grown: false, entries: [], newOffset: offset, size: meta.size, encoding: meta.encoding, format: meta.format };
  }
  const readEnd = Math.min(meta.size, offset + cap);
  const parser = createParser(meta.format);
  const entries = [];
  let lastComplete = offset;
  for (const line of iterateLines(file, meta.encoding, offset, { endOffset: readEnd, finalPartial: 'skip' })) {
    const entry = parser.addLine(line.text, line.start, line.end);
    lastComplete = line.end;
    if (entry) entries.push(entry);
  }
  const rest = parser.flush();
  if (rest && lastComplete >= rest.endOffset) entries.push(rest);
  return {
    rotated: false, grown: true, entries, newOffset: lastComplete, size: meta.size,
    encoding: meta.encoding, format: meta.format,
  };
}

// ── 多文件搜索 ──────────────────────────────────────────────────────────────
/**
 * @param files string[]
 * @param opts {{q?, regex?, levels?, limitPerFile?, scanCapPerFile?}}
 * @returns Array<{file, matches, truncated, scannedBytes, error?}>
 */
function searchFiles(files, opts) {
  const limitPerFile = Math.min(Math.max(parseInt(opts && opts.limitPerFile, 10) || 30, 1), 200);
  const scanCap = Math.min(parseInt(opts && opts.scanCapPerFile, 10) || 32 * 1024 * 1024, 512 * 1024 * 1024);
  const out = [];
  for (const file of files) {
    try {
      const r = forwardRead(file, {
        offset: 0, limit: limitPerFile, scanCap: scanCap,
        q: opts && opts.q, regex: opts && opts.regex, levels: opts && opts.levels,
      });
      out.push({
        file, matches: r.entries, truncated: r.truncated || !r.eof,
        scannedBytes: r.scannedBytes, encoding: r.encoding, format: r.format,
      });
    } catch (e) {
      out.push({ file, matches: [], truncated: false, scannedBytes: 0, error: e.message });
    }
  }
  return out;
}

module.exports = {
  fileMeta, iterateLines, forwardRead, tailRead, watchIncrement, searchFiles, makeFilter,
};
