'use strict';
/**
 * office-lens 核心引擎（零依赖；Node ≥ 20.16 / Chromium ≥ 103 同源）
 *
 * 单一权威：面板（esbuild 打包进 dist/panel.js）与 MCP server（node 直跑）
 * 共用本文件。纯字节→Markdown 变换，零网络、零 kv、零磁盘写。
 *
 * 结构：
 *   1. 通用护栏常量
 *   2. zip 读取器（EOCD/中央目录/本地头，方法 0/8；ZIP64 明确拒绝）
 *   3. XML 拉解析器（实体白名单防膨胀炸弹；节点/深度/文本上限）
 *   4. OOXML 三引擎：docx / xlsx / pptx → Markdown
 *   5. 魔数嗅探 + extractAuto 单一入口
 *
 * 安全姿态：
 *   - 不解压落盘 → 无 zip-slip 面；
 *   - 解压总量/单条/条目数三重上限（zip 炸弹）；
 *   - XML 只解析预定义+数字实体，自定义实体不展开（billion laughs 失效）；
 *   - 旧版 Office 二进制（OLE CFB）明确拒绝并指引另存。
 */

// ── 1. 护栏常量 ──────────────────────────────────────────────────────────

const LIMITS = {
  MAX_FILE_BYTES: 100 * 1024 * 1024,       // 输入文件上限 100MB
  MAX_ENTRIES: 20000,                       // zip 条目数上限
  MAX_ENTRY_UNCOMPRESSED: 128 * 1024 * 1024, // 单条解压上限 128MB
  MAX_TOTAL_UNCOMPRESSED: 512 * 1024 * 1024, // 累计解压上限 512MB（炸弹护栏）
  MAX_XML_CHARS: 64 * 1024 * 1024,          // 单个 XML 部件字符上限
  MAX_XML_NODES: 400000,                    // XML 节点总数上限
  MAX_XML_DEPTH: 400,                       // XML 嵌套深度上限
  MAX_OUTPUT_CHARS: 400000,                 // MCP 输出上限（上下文安全）
  MAX_PANEL_PREVIEW_CHARS: 1000000,         // 面板预览上限
};

// ── 2. zip 读取器 ────────────────────────────────────────────────────────

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/** 解压 deflate-raw：优先 DecompressionStream（双端一致），退级 Node zlib（无静态 require，浏览器打包安全） */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  if (typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') {
    const zlib = process.getBuiltinModule('zlib');
    return zlib.inflateRawSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }
  throw new Error('运行环境缺少 inflate 能力（需 Node ≥ 20.16 或 Chromium ≥ 103）');
}

function decodeZipName(bytes, utf8Flag) {
  if (utf8Flag) return new TextDecoder('utf-8').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (_) { return new TextDecoder('latin1').decode(bytes); }
}

/**
 * 解析 zip 中央目录。返回 { names, read(name), stats }。
 * 仅支持方法 0（store）/ 8（deflate）；ZIP64 / 加密明确拒绝。
 */
async function openZip(bytes, log) {
  const warn = log || (() => {});
  if (bytes.length < 22) throw new Error('文件太小，不是有效的 zip 容器');
  // 找 EOCD（从尾部扫；注释最长 65535）
  let eocd = -1;
  const scanFrom = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= scanFrom; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      const commentLen = u16(bytes, i + 20);
      if (i + 22 + commentLen <= bytes.length) { eocd = i; break; }
    }
  }
  if (eocd < 0) throw new Error('未找到 zip 中央目录（EOCD）——文件损坏或不是 OOXML 文档');

  const entryCount = u16(bytes, eocd + 10);
  let cdSize = u32(bytes, eocd + 12);
  let cdOffset = u32(bytes, eocd + 16);
  if (entryCount === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 格式暂不支持（超出常规 zip 容量）');
  }
  if (entryCount > LIMITS.MAX_ENTRIES) throw new Error(`zip 条目数 ${entryCount} 超上限 ${LIMITS.MAX_ENTRIES}（zip 炸弹防护）`);
  if (cdOffset + cdSize > bytes.length) throw new Error('zip 中央目录越界——文件被截断或损坏');

  const entries = new Map(); // name → {method, csize, usize, localOff}
  let p = cdOffset;
  let totalUncompressed = 0;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new Error(`zip 中央目录第 ${i + 1} 条损坏`);
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const usize = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const localOff = u32(bytes, p + 42);
    const name = decodeZipName(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    if (usize === 0xffffffff || localOff === 0xffffffff) throw new Error(`ZIP64 条目（${name}）暂不支持`);
    if (usize > LIMITS.MAX_ENTRY_UNCOMPRESSED) throw new Error(`条目 ${name} 解压后 ${usize}B 超单条上限（zip 炸弹防护）`);
    totalUncompressed += usize;
    if (totalUncompressed > LIMITS.MAX_TOTAL_UNCOMPRESSED) throw new Error('zip 累计解压体积超上限 512MB（炸弹防护）');
    entries.set(name, { method, csize, usize, localOff, flags });
    p += 46 + nameLen + extraLen + commentLen;
  }
  void cdSize; void warn;

  let totalRead = 0;
  async function read(name) {
    const e = entries.get(name);
    if (!e) return null;
    if (e.method !== 0 && e.method !== 8) throw new Error(`条目 ${name} 压缩方法 ${e.method} 不支持（仅 store/deflate）`);
    const off = e.localOff;
    if (off + 30 > bytes.length || u32(bytes, off) !== 0x04034b50) throw new Error(`条目 ${name} 本地头损坏`);
    const nameLen = u16(bytes, off + 26);
    const extraLen = u16(bytes, off + 28);
    const dataStart = off + 30 + nameLen + extraLen;
    if (dataStart + e.csize > bytes.length) throw new Error(`条目 ${name} 数据越界`);
    const raw = bytes.subarray(dataStart, dataStart + e.csize);
    let out;
    if (e.method === 0) out = raw.slice();
    else out = await inflateRaw(raw);
    if (out.length !== e.usize) throw new Error(`条目 ${name} 解压长度不符（${out.length} ≠ ${e.usize}）`);
    totalRead += out.length;
    if (totalRead > LIMITS.MAX_TOTAL_UNCOMPRESSED) throw new Error('累计解压体积超上限（炸弹防护）');
    return out;
  }

  return { names: Array.from(entries.keys()), read };
}

// ── 3. XML 拉解析器 ──────────────────────────────────────────────────────

const PREDEFINED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const amp = s.indexOf('&', i);
    if (amp < 0) { out += s.slice(i); break; }
    out += s.slice(i, amp);
    const semi = s.indexOf(';', amp + 1);
    if (semi < 0 || semi - amp > 32) { out += '&'; i = amp + 1; continue; }
    const name = s.slice(amp + 1, semi);
    if (name[0] === '#') {
      const cp = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
        try { out += String.fromCodePoint(cp); } catch (_) { /* 非法码点丢弃 */ }
      }
      i = semi + 1;
    } else if (Object.prototype.hasOwnProperty.call(PREDEFINED_ENTITIES, name)) {
      out += PREDEFINED_ENTITIES[name];
      i = semi + 1;
    } else {
      // 自定义实体不展开（防 billion laughs），按字面保留
      out += s.slice(amp, semi + 1);
      i = semi + 1;
    }
  }
  return out;
}

/**
 * 解析 XML 为树。节点：{ name, local, attrs, kids }；文本节点：{ t:'#', s }。
 * 按限定名（prefix:local）存原始名，local 为去前缀名（引擎按 local 匹配）。
 * 抛错时带近似偏移，方便定位。
 */
function parseXml(text, partName) {
  if (text.length > LIMITS.MAX_XML_CHARS) throw new Error(`XML 部件 ${partName} 过大（${text.length} 字符）`);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let nodes = 0;
  let i = 0;
  const n = text.length;

  function fail(msg) {
    const ctx = text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
    throw new Error(`XML 解析失败（${partName} @${i}）：${msg} …「${ctx}」`);
  }

  function skipUntil(str) {
    const j = text.indexOf(str, i);
    if (j < 0) fail(`未找到闭合 ${str}`);
    i = j + str.length;
  }

  function parseName() {
    const m = /^[^\s/>]+/.exec(text.slice(i));
    if (!m) fail('标签名缺失');
    i += m[0].length;
    return m[0];
  }

  function parseAttrs() {
    const attrs = {};
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (i >= n) fail('属性区未闭合');
      if (text[i] === '/' || text[i] === '>') return attrs;
      const m = /^[^\s=/>]+/.exec(text.slice(i));
      if (!m) fail('属性名缺失');
      const key = m[0];
      i += key.length;
      while (i < n && /\s/.test(text[i])) i++;
      if (text[i] !== '=') { attrs[key] = ''; continue; } // 无值属性
      i++;
      while (i < n && /\s/.test(text[i])) i++;
      const quote = text[i];
      if (quote === '"' || quote === "'") {
        const end = text.indexOf(quote, i + 1);
        if (end < 0) fail('属性值引号未闭合');
        attrs[key] = decodeEntities(text.slice(i + 1, end));
        i = end + 1;
      } else {
        const m2 = /^[^\s>]+/.exec(text.slice(i));
        attrs[key] = decodeEntities(m2 ? m2[0] : '');
        i += m2 ? m2[0].length : 0;
      }
    }
  }

  function makeEl(name, attrs) {
    const local = name.indexOf(':') >= 0 ? name.slice(name.indexOf(':') + 1) : name;
    return { name, local, attrs, kids: [] };
  }

  function parseInto(el, depth) {
    if (depth > LIMITS.MAX_XML_DEPTH) fail(`嵌套超 ${LIMITS.MAX_XML_DEPTH} 层（炸弹防护）`);
    while (i < n) {
      if (text[i] !== '<') {
        const next = text.indexOf('<', i);
        const chunk = next < 0 ? text.slice(i) : text.slice(i, next);
        if (chunk) {
          if ((nodes += 1) > LIMITS.MAX_XML_NODES) fail('节点数超上限（炸弹防护）');
          el.kids.push({ t: '#', s: decodeEntities(chunk) });
        }
        i += chunk.length;
        if (next < 0) return; // 文本到尾（容错：未闭合由外层报）
        continue;
      }
      if (text.startsWith('<!--', i)) { i += 4; skipUntil('-->'); continue; }
      if (text.startsWith('<![CDATA[', i)) {
        const end = text.indexOf(']]>', i + 9);
        if (end < 0) fail('CDATA 未闭合');
        if ((nodes += 1) > LIMITS.MAX_XML_NODES) fail('节点数超上限');
        el.kids.push({ t: '#', s: text.slice(i + 9, end) });
        i = end + 3;
        continue;
      }
      if (text.startsWith('<?', i)) { i += 2; skipUntil('?>'); continue; }
      if (text.startsWith('<!', i)) { // DOCTYPE（内部子集一并跳过，不展开实体）
        let depth2 = 0;
        let j = i + 2;
        for (; j < n; j++) {
          const c = text[j];
          if (c === '[') depth2++;
          else if (c === ']') depth2--;
          else if (c === '>' && depth2 <= 0) break;
        }
        if (j >= n) fail('DOCTYPE 未闭合');
        i = j + 1;
        continue;
      }
      if (text.startsWith('</', i)) {
        const j = text.indexOf('>', i);
        if (j < 0) fail('结束标签未闭合');
        const closing = text.slice(i + 2, j).trim();
        if (closing !== el.name && closing.indexOf(':') >= 0 && closing.slice(closing.indexOf(':') + 1) !== el.local) fail(`闭合不匹配 ${closing} ≠ ${el.name}`);
        i = j + 1;
        return; // 本元素结束
      }
      // 开始标签
      i++;
      const name = parseName();
      const attrs = parseAttrs();
      const selfClose = text[i] === '/';
      if (selfClose) i++;
      if (text[i] !== '>') fail('开始标签未闭合');
      i++;
      if ((nodes += 1) > LIMITS.MAX_XML_NODES) fail('节点数超上限（炸弹防护）');
      const child = makeEl(name, attrs);
      el.kids.push(child);
      if (!selfClose) parseInto(child, depth + 1);
    }
    if (depth > 0) fail('文档在元素中间结束');
  }

  const root = makeEl('#doc', {});
  parseInto(root, 0);
  // 直接返回文档根元素（包装层不外泄；根元素前的空白/注释按 XML 规范忽略）
  const firstEl = root.kids.find((k) => k.t !== '#');
  if (!firstEl) throw new Error(`XML 无根元素（${partName}）`);
  return firstEl;
}

// 树工具：按 local 名取子/全部子；取属性（前缀无关）；取全部文本
function kidsOf(el, local) {
  return el.kids.filter((k) => k.t !== '#' && k.local === local);
}
function kidOf(el, local) {
  return kidsOf(el, local)[0] || null;
}
function textOf(el) {
  let out = '';
  for (const k of el.kids) {
    if (k.t === '#') out += k.s;
    else out += textOf(k);
  }
  return out;
}
function attrOf(el, local) {
  const attrs = el.attrs;
  if (Object.prototype.hasOwnProperty.call(attrs, local)) return attrs[local];
  const suf = ':' + local;
  for (const k of Object.keys(attrs)) if (k.endsWith(suf)) return attrs[k];
  return undefined;
}

// ── 4a. OOXML 关系解析 ───────────────────────────────────────────────────

/** 解析 .rels 部件：Id → { target, external } */
function parseRels(xmlText, partName) {
  const root = parseXml(xmlText, partName);
  const rels = {};
  for (const rel of kidsOf(root, 'Relationship')) {
    const id = attrOf(rel, 'Id');
    const target = attrOf(rel, 'Target') || '';
    const mode = attrOf(rel, 'TargetMode');
    if (id) rels[id] = { target, external: mode === 'External' };
  }
  return rels;
}

/** 相对目标解析：baseDir 形如 'word' / 'ppt/slides'；target 以 '/' 开头为包内绝对 */
function resolveTarget(baseDir, target) {
  if (target.charAt(0) === '/') return target.slice(1);
  const parts = baseDir ? baseDir.split('/') : [];
  const tParts = target.split('/');
  for (const seg of tParts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

// ── 4b. docx 引擎 ────────────────────────────────────────────────────────

const BULLET_LEVELS = ['-', '-', '-'];

function fmtListMarker(fmt, counter, lvlText) {
  function toLetters(nn, upper) {
    let s = '';
    while (nn > 0) { const r = (nn - 1) % 26; s = String.fromCharCode((upper ? 65 : 97) + r) + s; nn = Math.floor((nn - 1) / 26); }
    return s || 'a';
  }
  function toRoman(nn, upper) {
    const pairs = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    for (const [v, sym] of pairs) { while (nn >= v) { s += sym; nn -= v; } }
    return upper ? s.toUpperCase() : s;
  }
  const suffix = lvlText && /%\d/.test(lvlText) ? lvlText.replace(/%\d/g, '') : '.';
  switch (fmt) {
    case 'decimal': return counter + suffix;
    case 'lowerLetter': return toLetters(counter, false) + suffix;
    case 'upperLetter': return toLetters(counter, true) + suffix;
    case 'lowerRoman': return toRoman(counter, false) + suffix;
    case 'upperRoman': return toRoman(counter, true) + suffix;
    case 'none': return '';
    default: return counter + suffix; // chiMan/ordinal 等回退十进制
  }
}

/** 解析 numbering.xml：numId → abstractNum；abstractNum.ilvl → {fmt, lvlText, start} */
function parseNumbering(xmlText) {
  if (!xmlText) return null;
  const root = parseXml(xmlText, 'word/numbering.xml');
  const abstracts = {};
  for (const an of kidsOf(root, 'abstractNum')) {
    const aid = attrOf(an, 'abstractNumId');
    if (aid == null) continue;
    const lvls = {};
    for (const lvl of kidsOf(an, 'lvl')) {
      const ilvl = attrOf(lvl, 'ilvl');
      if (ilvl == null) continue;
      const fmtEl = kidOf(lvl, 'numFmt');
      const txtEl = kidOf(lvl, 'lvlText');
      const startEl = kidOf(lvl, 'start');
      lvls[ilvl] = {
        fmt: fmtEl ? attrOf(fmtEl, 'val') : 'decimal',
        lvlText: txtEl ? attrOf(txtEl, 'val') : '',
        start: startEl ? parseInt(attrOf(startEl, 'val') || '1', 10) || 1 : 1,
      };
    }
    abstracts[aid] = lvls;
  }
  const nums = {};
  for (const num of kidsOf(root, 'num')) {
    const nid = attrOf(num, 'numId');
    const ref = kidOf(num, 'abstractNumId');
    if (nid == null || !ref) continue;
    const lvls = abstracts[attrOf(ref, 'val')] || {};
    // startOverride：覆盖对应级别起始值
    for (const ov of kidsOf(num, 'lvlOverride')) {
      const ilvl = attrOf(ov, 'ilvl');
      const so = kidOf(ov, 'startOverride');
      if (ilvl != null && so && lvls[ilvl]) lvls[ilvl] = { ...lvls[ilvl], start: parseInt(attrOf(so, 'val') || '1', 10) || 1 };
    }
    nums[nid] = lvls;
  }
  return nums;
}

/** styles.xml：styleId → { outlineLvl, name, isQuote, isList } */
function parseStyles(xmlText) {
  if (!xmlText) return {};
  const root = parseXml(xmlText, 'word/styles.xml');
  const map = {};
  for (const st of kidsOf(root, 'style')) {
    const id = attrOf(st, 'styleId');
    if (!id) continue;
    const nameEl = kidOf(st, 'name');
    const name = nameEl ? attrOf(nameEl, 'val') || '' : '';
    const pPr = kidOf(st, 'pPr');
    let outlineLvl = null;
    if (pPr) {
      const ol = kidOf(pPr, 'outlineLvl');
      if (ol) outlineLvl = parseInt(attrOf(ol, 'val') || '', 10);
    }
    map[id] = { name, outlineLvl, isQuote: /quote|引用/i.test(name) };
  }
  return map;
}

/** heading 等级（1-6）或 null：样式 outlineLvl / 样式名 heading N / 标题 N 双通道 */
function headingLevel(styleId, styleMap, pPr) {
  const info = styleId ? styleMap[styleId] : null;
  if (info && info.outlineLvl != null && info.outlineLvl >= 0 && info.outlineLvl <= 5) return info.outlineLvl + 1;
  const nMatch = info ? /(?:heading|标题)\s*([1-9])/i.exec(info.name) : null;
  if (nMatch) return parseInt(nMatch[1], 10);
  if (pPr) {
    const ol = kidOf(pPr, 'outlineLvl');
    if (ol) {
      const v = parseInt(attrOf(ol, 'val') || '', 10);
      if (v >= 0 && v <= 5) return v + 1;
    }
  }
  return null;
}

/** 行内内容提取：跨 hyperlink/fldSimple/smartTag 递归收集 md 行内片段；返回 {md, images, footnotes, hasToc} */
function inlineFromParagraph(p, ctx) {
  const out = [];
  let images = 0;
  const footnotes = [];
  let hasToc = false;

  // 片段格式键：相邻同格式片段合并，不同格式互不污染（run 各自持有格式对象）
  function fmtKey(f) {
    return (f.bold ? 'b' : '') + (f.italic ? 'i' : '') + (f.strike ? 's' : '') + (f.code ? 'c' : '');
  }
  function push(text, f) {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.k === fmtKey(f)) last.s += text;
    else out.push({ s: text, k: fmtKey(f), f: { ...f } });
  }

  function walk(node, f) {
    if (node.t === '#') { push(node.s, f); return; }
    switch (node.local) {
      case 'r': {
        const rPr = kidOf(node, 'rPr');
        const nf = { ...f }; // 每 run 独立格式对象，杜绝样式跨 run 泄漏
        if (rPr) {
          const b = kidOf(rPr, 'b');
          const i2 = kidOf(rPr, 'i');
          const strike = kidOf(rPr, 'strike') || kidOf(rPr, 'dstrike');
          if (b && attrOf(b, 'val') !== '0' && attrOf(b, 'val') !== 'false') nf.bold = true;
          if (i2 && attrOf(i2, 'val') !== '0' && attrOf(i2, 'val') !== 'false') nf.italic = true;
          if (strike) nf.strike = true;
        }
        for (const c of node.kids) {
          if (c.t === '#') { push(c.s, nf); continue; }
          switch (c.local) {
            case 't': push(textOf(c), nf); break;
            case 'tab': push(' ', nf); break;
            case 'br': case 'cr': push('\n', nf); break;
            case 'noBreakHyphen': push('-', nf); break;
            case 'sym': push('', nf); break; // 符号字体字符保真不可行，跳过
            case 'footnoteReference': {
              const id = attrOf(c, 'id');
              let idx = ctx.footnoteOrder.indexOf(id);
              if (idx < 0) { ctx.footnoteOrder.push(id); idx = ctx.footnoteOrder.length - 1; }
              footnotes.push(idx + 1);
              push(`[^fn${idx + 1}]`, nf);
              break;
            }
            case 'endnoteReference': break; // 尾注同源结构，MVP 跳过内容只留空
            case 'instrText': case 'fldChar': case 'delText': break; // 域指令/修订删除文本不进输出
            case 'drawing': case 'pict': case 'object': {
              images += countImages(c, ctx);
              push(`[图${ctx.imageSeq}]`, nf);
              break;
            }
            default: walk(c, nf);
          }
        }
        break;
      }
      case 'hyperlink': {
        const rid = attrOf(node, 'id');
        const anchor = attrOf(node, 'anchor');
        let url = null;
        if (rid && ctx.rels[rid] && ctx.rels[rid].external) url = ctx.rels[rid].target;
        const sub = inlineFromParagraph(node, ctx);
        images += sub.images;
        footnotes.push(...sub.footnotes);
        const text = sub.md.trim();
        if (url) push(`[${text || url}](${url})`, f);
        else if (anchor) push(`[${text || anchor}](#${anchor})`, f);
        else { push(text, f); }
        break;
      }
      case 'fldSimple': {
        const instr = attrOf(node, 'instr') || '';
        if (/\bTOC\b/i.test(instr)) { hasToc = true; break; }
        const sub = inlineFromParagraph(node, ctx);
        images += sub.images;
        push(sub.md, f);
        break;
      }
      case 'instrText': {
        if (/\bTOC\b/i.test(textOf(node))) hasToc = true;
        break;
      }
      case 'smartTag': case 'sdtContent': case 'ins': {
        for (const c of node.kids) walk(c, f);
        break;
      }
      case 'sdt': {
        const content = kidOf(node, 'sdtContent');
        if (content) for (const c of content.kids) walk(c, f);
        break;
      }
      default: break; // proofErr/bookmarkStart 等噪声忽略
    }
  }

  for (const c of p.kids) walk(c, {});
  return { md: out.map((o) => formatInline(o.s, o.f)).join(''), images, footnotes, hasToc };

  function formatInline(s, f) {
    let t = s;
    if (t === '') return t;
    if (f.code) t = '`' + t + '`';
    if (f.bold) t = '**' + t + '**';
    if (f.italic) t = '*' + t + '*';
    if (f.strike) t = '~~' + t + '~~';
    return t;
  }
}

function countImages(node, ctx) {
  let count = 0;
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (cur.t === '#') continue;
    if (cur.local === 'blip') {
      const rid = attrOf(cur, 'embed');
      const rel = rid ? ctx.rels[rid] : null;
      ctx.imageSeq += 1;
      ctx.images.push(rel ? rel.target : '(未解析)');
      count += 1;
      continue;
    }
    if (cur.local === 'imagedata') { // 旧 v:imagedata
      const rid = attrOf(cur, 'id');
      const rel = rid ? ctx.rels[rid] : null;
      ctx.imageSeq += 1;
      ctx.images.push(rel ? rel.target : '(未解析)');
      count += 1;
      continue;
    }
    for (const k of cur.kids) if (k.t !== '#') stack.push(k);
  }
  return count;
}

/** 表格 → markdown 行数组（含表头分隔）；gridSpan 首格占位补空；vMerge 续行置空 */
function tableToMd(tbl, ctx) {
  const rows = [];
  let warnings = [];
  let nested = 0;
  for (const tr of kidsOf(tbl, 'tr')) {
    const cells = [];
    for (const tc of kidsOf(tr, 'tc')) {
      const span = parseInt(attrOf(tc, 'gridSpan') || '1', 10) || 1;
      const vmerge = kidOf(tc, 'vMerge');
      const isContinue = vmerge && attrOf(vmerge, 'val') !== 'restart';
      let content = '';
      if (!isContinue) {
        const parts = [];
        for (const block of tc.kids) {
          if (block.t !== '#') {
            if (block.local === 'p') {
              const r = inlineFromParagraph(block, ctx);
              if (r.md.trim()) parts.push(r.md.replace(/\n/g, ' ').trim());
            } else if (block.local === 'tbl') {
              nested += 1;
              parts.push(textOf(block).replace(/\s+/g, ' ').trim());
            }
          }
        }
        content = parts.join('<br>');
      }
      cells.push(escapeCell(content));
      for (let s = 1; s < span; s++) cells.push('');
    }
    rows.push(cells);
  }
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const ragged = rows.some((r) => r.length !== cols);
  for (const r of rows) while (r.length < cols) r.push('');
  const lines = [];
  rows.forEach((r, idx) => {
    lines.push('| ' + r.join(' | ') + ' |');
    if (idx === 0) lines.push('|' + Array(cols).fill(' --- ').join('|') + '|');
  });
  if (nested) warnings.push(`表格内有嵌套表格 ${nested} 处，已摊平为文本`);
  if (ragged) warnings.push('表格存在不规则列（合并单元格降级为空位）');
  return { lines, warnings };

  function escapeCell(s) {
    return s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  }
}

/** docx 主入口：parts = {name: Uint8Array}（zip.read 结果）。返回 {markdown, warnings, stats} */
async function docxToMarkdown(zip, opts) {
  const warnings = [];
  const docBytes = await zip.read('word/document.xml');
  if (!docBytes) throw new Error('缺少 word/document.xml——不是有效的 docx');
  const ctx = {
    rels: {},
    footnoteOrder: [],
    images: [],
    imageSeq: 0,
  };
  // rels
  const relsBytes = await zip.read('word/_rels/document.xml.rels');
  if (relsBytes) ctx.rels = parseRels(new TextDecoder().decode(relsBytes), 'document.xml.rels');
  // styles / numbering
  const styleBytes = await zip.read('word/styles.xml');
  const styleMap = parseStyles(styleBytes ? new TextDecoder().decode(styleBytes) : null);
  const numberingBytes = await zip.read('word/numbering.xml');
  const numbering = parseNumbering(numberingBytes ? new TextDecoder().decode(numberingBytes) : null);

  const docRoot = parseXml(new TextDecoder().decode(docBytes), 'word/document.xml');
  const body = kidOf(docRoot, 'body');
  if (!body) throw new Error('document.xml 缺少 body');
  const blocks = [];
  let paraCount = 0;
  let tableCount = 0;
  const counters = {}; // numId:ilvl → 计数
  let tocSkipped = false;

  function visitBlocks(container) {
    for (const node of container.kids) {
      if (node.t === '#') continue;
      switch (node.local) {
        case 'p': emitParagraph(node); break;
        case 'tbl': {
          tableCount += 1;
          const t = tableToMd(node, ctx);
          warnings.push(...t.warnings);
          blocks.push(t.lines.join('\n'));
          break;
        }
        case 'sdt': {
          const content = kidOf(node, 'sdtContent');
          if (content) visitBlocks(content);
          break;
        }
        default: break; // sectPr/bookmark 等跳过
      }
    }
  }

  function emitParagraph(p) {
    const pPr = kidOf(p, 'pPr');
    const styleEl = pPr ? kidOf(pPr, 'pStyle') : null;
    const styleId = styleEl ? attrOf(styleEl, 'val') || '' : '';
    const numPr = pPr ? kidOf(pPr, 'numPr') : null;
    let numId = null;
    let ilvl = 0;
    if (numPr) {
      const nidEl = kidOf(numPr, 'numId');
      const ilvlEl = kidOf(numPr, 'ilvl');
      numId = nidEl ? attrOf(nidEl, 'val') : null;
      ilvl = ilvlEl ? parseInt(attrOf(ilvlEl, 'val') || '0', 10) || 0 : 0;
    }
    const r = inlineFromParagraph(p, ctx);
    if (r.hasToc) { tocSkipped = true; return; }
    paraCount += 1;
    const level = headingLevel(styleId, styleMap, pPr);
    const styleInfo = styleMap[styleId];
    const text = r.md.trim();

    if (!text && r.images === 0) return; // 空段折叠

    if (level) {
      blocks.push('#'.repeat(Math.min(level, 6)) + ' ' + text.replace(/\n/g, ' '));
      return;
    }
    if (numId != null && numbering && numbering[numId]) {
      const lvls = numbering[numId];
      const info = lvls[ilvl] || lvls[0] || { fmt: 'bullet', lvlText: '', start: 1 };
      const key = numId + ':' + ilvl;
      if (!(key in counters)) counters[key] = info.start;
      else counters[key] += 1;
      // 深层计数在浅层新条目出现时复位
      for (const k of Object.keys(counters)) {
        const kParts = k.split(':');
        if (kParts[0] === String(numId) && parseInt(kParts[1], 10) > ilvl) delete counters[k];
      }
      let marker;
      if (info.fmt === 'bullet' || (info.lvlText && !/%\d/.test(info.lvlText))) {
        marker = BULLET_LEVELS[Math.min(ilvl, 2)] || '-';
      } else {
        marker = fmtListMarker(info.fmt, counters[key], info.lvlText);
        if (info.fmt !== 'decimal' && info.fmt !== 'lowerLetter' && info.fmt !== 'upperLetter' && info.fmt !== 'lowerRoman' && info.fmt !== 'upperRoman' && info.fmt !== 'none') {
          if (!warnings.some((w) => w.includes(info.fmt))) warnings.push(`列表编号格式 ${info.fmt} 以十进制回退显示`);
        }
      }
      const indent = '  '.repeat(Math.min(ilvl, 5));
      blocks.push(indent + (marker ? marker + ' ' : '') + text.replace(/\n/g, ' '));
      return;
    }
    const isQuote = styleInfo && styleInfo.isQuote;
    const body2 = text.replace(/\n/g, '  \n');
    if (isQuote) {
      for (const line of body2.split('\n')) blocks.push('> ' + line);
    } else {
      blocks.push(body2);
    }
  }

  visitBlocks(body);

  // 脚注定义：必须在正文遍历之后（footnoteReference 先在正文里注册顺序）
  const footnotesText = {};
  const fnBytes = await zip.read('word/footnotes.xml');
  if (fnBytes) {
    const fnRoot = parseXml(new TextDecoder().decode(fnBytes), 'word/footnotes.xml');
    for (const fn of kidsOf(fnRoot, 'footnote')) {
      const id = attrOf(fn, 'id');
      if (id == null || id === '0' || id === '-1') continue;
      const idx = ctx.footnoteOrder.indexOf(id);
      if (idx < 0) continue;
      const parts = [];
      for (const p of kidsOf(fn, 'p')) parts.push(inlineFromParagraph(p, ctx).md.trim());
      footnotesText[`fn${idx + 1}`] = parts.filter(Boolean).join(' ');
    }
  }
  const fnIds = Object.keys(footnotesText);
  if (fnIds.length) {
    blocks.push('');
    for (const id of fnIds) blocks.push(`[^${id}]: ${footnotesText[id]}`);
  }
  if (tocSkipped) warnings.push('目录（TOC）域已跳过——markdown 目录由标题树天然承担');
  if (ctx.images.length) warnings.push(`图片 ${ctx.images.length} 张未提取内容（已用 [图N] 占位）：${ctx.images.slice(0, 5).join('、')}${ctx.images.length > 5 ? ' 等' : ''}`);

  const markdown = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  const stats = { paragraphs: paraCount, tables: tableCount, images: ctx.images.length, footnotes: fnIds.length };
  return { markdown, warnings, stats };
}

// ── 4c. xlsx 引擎 ────────────────────────────────────────────────────────

// 日期相关内置 numFmtId（数字格式 → 日期/时间）
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** numFmt 代码是否日期/时间：剥引号与 [括号] 段后找 y/d/h/s 或独立 m 运行 */
function fmtCodeIsDate(code) {
  if (!code) return false;
  const stripped = code.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '').replace(/\[[^\]]*\]/g, '');
  if (/[ydhs]/i.test(stripped)) return true;
  return /(^|[^a-z])m{1,2}([^a-z]|$)/i.test(stripped);
}

/** Excel 序列号 → {dateStr, timeStr}（1900/1904 双历元 + 1900 闰年 bug 处理） */
function serialToDateTime(serial, date1904) {
  let s = serial;
  if (date1904) s += 1462;
  const days = Math.floor(s);
  let frac = s - days;
  let unixDays;
  if (days < 60) unixDays = days - 25568;   // 1900-01-01 = serial 1
  else unixDays = days - 25569;             // 跳过虚构的 1900-02-29
  const d = new Date(unixDays * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const pad = (x) => String(x).padStart(2, '0');
  const dateStr = `${String(y).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  let secs = Math.round(frac * 86400);
  if (secs >= 86400) { secs -= 86400; /* 序列号进位日 */ }
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  const timeStr = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return { dateStr, timeStr };
}

function colLettersToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function cellRefToRC(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '');
  if (!m) return null;
  return { row: parseInt(m[2], 10) - 1, col: colLettersToIndex(m[1]) };
}

/** 解析 styles.xml → { xfNumFmtId: [], customFmt: {id: code}, date1904 不在此 } */
function parseXlsxStyles(xmlText) {
  const out = { xfNumFmtId: [], customFmt: {}, builtinFmt: {} };
  if (!xmlText) return out;
  const root = parseXml(xmlText, 'xl/styles.xml');
  const numFmts = kidOf(root, 'numFmts') || root;
  for (const nf of kidsOf(numFmts, 'numFmt')) {
    const id = attrOf(nf, 'numFmtId');
    const code = attrOf(nf, 'formatCode');
    if (id != null && code) out.customFmt[id] = code;
  }
  const cellXfs = kidOf(root, 'cellXfs');
  if (cellXfs) {
    for (const xf of kidsOf(cellXfs, 'xf')) {
      const id = attrOf(xf, 'numFmtId');
      const apply = attrOf(xf, 'applyNumberFormat');
      out.xfNumFmtId.push(id != null ? { id, apply: apply !== '0' && apply !== 'false' } : null);
    }
  }
  return out;
}

/** workbook.xml + rels → [{name, target}]（按簿内顺序） */
function parseWorkbook(xmlText, relsText) {
  const root = parseXml(xmlText, 'xl/workbook.xml');
  const rels = relsText ? parseRels(relsText, 'workbook.xml.rels') : {};
  const date1904El = kidOf(root, 'workbookPr');
  const date1904 = !!(date1904El && attrOf(date1904El, 'date1904') && attrOf(date1904El, 'date1904') !== '0' && attrOf(date1904El, 'date1904') !== 'false');
  const sheets = [];
  for (const sh of kidsOf(kidOf(root, 'sheets') || root, 'sheet')) {
    const name = attrOf(sh, 'name') || `Sheet${sheets.length + 1}`;
    const rid = attrOf(sh, 'id');
    const rel = rid ? rels[rid] : null;
    if (!rel || rel.external) continue;
    sheets.push({ name, target: resolveTarget('xl', rel.target) });
  }
  return { sheets, date1904 };
}

/** 单 sheet → 矩阵（字符串二维数组）；返回 {rows, formulaCount, mergedCount} */
async function readSheetMatrix(zip, target, sharedStrings, styles, date1904) {
  const bytes = await zip.read(target);
  if (!bytes) throw new Error(`工作表部件缺失：${target}`);
  const root = parseXml(new TextDecoder().decode(bytes), target);
  const sheetData = kidOf(root, 'sheetData');
  const grid = {};
  let maxCol = -1;
  let maxRow = -1;
  let formulaCount = 0;
  if (sheetData) {
    for (const row of kidsOf(sheetData, 'row')) {
      const rIdx = parseInt(attrOf(row, 'r') || '0', 10) - 1;
      const rowIdx = Number.isFinite(rIdx) && rIdx >= 0 ? rIdx : maxRow + 1;
      for (const c of kidsOf(row, 'c')) {
        const rc = cellRefToRC(attrOf(c, 'r'));
        const colIdx = rc ? rc.col : -1;
        const r2 = rc ? rc.row : rowIdx;
        if (colIdx < 0) continue;
        const t = attrOf(c, 't') || 'n';
        const sRef = attrOf(c, 's');
        let value;
        if (t === 'inlineStr') {
          const is = kidOf(c, 'is');
          value = is ? textOf(is) : '';
        } else {
          const vEl = kidOf(c, 'v');
          const v = vEl ? vEl.kids.filter((k) => k.t === '#').map((k) => k.s).join('') : '';
          const fEl = kidOf(c, 'f');
          if (fEl) formulaCount += 1;
          if (t === 's') value = sharedStrings[parseInt(v, 10)] != null ? sharedStrings[parseInt(v, 10)] : v;
          else if (t === 'str') value = v;
          else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else if (t === 'e') value = v || '#VALUE!';
          else {
            // 数字：按样式判定日期
            const num = parseFloat(v);
            const styleInfo = sRef != null ? styles.xfNumFmtId[parseInt(sRef, 10)] : null;
            const fmtId = styleInfo ? parseInt(styleInfo.id, 10) : NaN;
            let isDate = false;
            let isTimeOnly = false;
            if (Number.isFinite(fmtId)) {
              if (BUILTIN_DATE_FMTS.has(fmtId)) isDate = true;
              else if (styles.customFmt[fmtId] && fmtCodeIsDate(styles.customFmt[fmtId])) isDate = true;
              if (isDate && fmtId >= 45 && fmtId <= 47) isTimeOnly = true;
              if (isDate && styles.customFmt[fmtId]) {
                const code = styles.customFmt[fmtId];
                isTimeOnly = isTimeOnly || (!/[yd]/i.test(code.replace(/"[^"]*"/g, '')) && /[hs]/i.test(code.replace(/"[^"]*"/g, '')));
              }
            }
            if (isDate && Number.isFinite(num)) {
              const dt = serialToDateTime(num, date1904);
              value = dt ? (isTimeOnly ? dt.timeStr : (dt.timeStr === '00:00:00' ? dt.dateStr : `${dt.dateStr} ${dt.timeStr}`)) : v;
            } else {
              value = v;
            }
          }
        }
        if (grid[r2]) grid[r2][colIdx] = value; else grid[r2] = { [colIdx]: value };
        if (r2 > maxRow) maxRow = r2;
        if (colIdx > maxCol) maxCol = colIdx;
      }
    }
  }
  // 合并单元格：值在左上，其余置空已天然成立（我们只输出实际值）——统计供警告
  let mergedCount = 0;
  const mergeCells = kidOf(root, 'mergeCells');
  if (mergeCells) mergedCount = parseInt(attrOf(mergeCells, 'count') || '0', 10) || kidsOf(mergeCells, 'mergeCell').length;
  const matrix = [];
  for (let r = 0; r <= maxRow; r++) {
    const line = [];
    for (let c2 = 0; c2 <= maxCol; c2++) line.push(grid[r] && grid[r][c2] != null ? String(grid[r][c2]) : '');
    matrix.push(line);
  }
  return { matrix, formulaCount, mergedCount };
}

async function parseSharedStrings(zip) {
  const bytes = await zip.read('xl/sharedStrings.xml');
  if (!bytes) return [];
  const root = parseXml(new TextDecoder().decode(bytes), 'xl/sharedStrings.xml');
  const arr = [];
  for (const si of kidsOf(root, 'si')) arr.push(textOf(si));
  return arr;
}

async function xlsxLoad(zip) {
  const wbBytes = await zip.read('xl/workbook.xml');
  if (!wbBytes) throw new Error('缺少 xl/workbook.xml——不是有效的 xlsx');
  const relsBytes = await zip.read('xl/_rels/workbook.xml.rels');
  const { sheets, date1904 } = parseWorkbook(new TextDecoder().decode(wbBytes), relsBytes ? new TextDecoder().decode(relsBytes) : null);
  const styleBytes = await zip.read('xl/styles.xml');
  const styles = parseXlsxStyles(styleBytes ? new TextDecoder().decode(styleBytes) : null);
  const sharedStrings = await parseSharedStrings(zip);
  return { sheets, date1904, styles, sharedStrings };
}

async function xlsxSheetNames(zip) {
  const { sheets } = await xlsxLoad(zip);
  return sheets.map((s) => s.name);
}

/** sheet 参数：名称或 1 起序号；返回矩阵与元数据 */
async function xlsxToMatrix(zip, sheetParam) {
  const model = await xlsxLoad(zip);
  if (!model.sheets.length) throw new Error('workbook 无工作表');
  let pick = 0;
  if (sheetParam != null && sheetParam !== '') {
    const byName = model.sheets.findIndex((s) => s.name === String(sheetParam));
    if (byName >= 0) pick = byName;
    else {
      const idx = parseInt(String(sheetParam), 10);
      if (Number.isFinite(idx) && idx >= 1 && idx <= model.sheets.length) pick = idx - 1;
      else throw new Error(`找不到工作表「${sheetParam}」；可用：${model.sheets.map((s) => s.name).join('、')}`);
    }
  }
  const sh = model.sheets[pick];
  const m = await readSheetMatrix(zip, sh.target, model.sharedStrings, model.styles, model.date1904);
  return { ...m, sheetName: sh.name, sheetIndex: pick, total: model.sheets.length, sheetNames: model.sheets.map((s) => s.name) };
}

function matrixToMarkdown(matrix) {
  const cols = matrix.reduce((m, r) => Math.max(m, r.length), 0);
  if (!cols) return '（空表）';
  const esc = (s) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const lines = [];
  matrix.forEach((row, idx) => {
    const cells = [];
    for (let c = 0; c < cols; c++) cells.push(esc(row[c] != null ? row[c] : ''));
    lines.push('| ' + cells.join(' | ') + ' |');
    if (idx === 0) lines.push('|' + Array(cols).fill(' --- ').join('|') + '|');
  });
  return lines.join('\n');
}

function matrixToCsv(matrix) {
  const q = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return matrix.map((row) => row.map((cell) => q(cell != null ? String(cell) : '')).join(',')).join('\r\n');
}

// ── 4d. pptx 引擎 ────────────────────────────────────────────────────────

async function pptxSlideTargets(zip) {
  const presBytes = await zip.read('ppt/presentation.xml');
  if (!presBytes) throw new Error('缺少 ppt/presentation.xml——不是有效的 pptx');
  const relsBytes = await zip.read('ppt/_rels/presentation.xml.rels');
  const rels = relsBytes ? parseRels(new TextDecoder().decode(relsBytes), 'presentation.xml.rels') : {};
  const root = parseXml(new TextDecoder().decode(presBytes), 'ppt/presentation.xml');
  const targets = [];
  const sldLst = kidOf(root, 'sldIdLst');
  if (sldLst) {
    for (const sid of kidsOf(sldLst, 'sldId')) {
      // sldId 同时有无前缀 id="256"（幻灯片号）与 r:id="rId2"（关系）——必须取带前缀的关系 id
      let rid;
      for (const k of Object.keys(sid.attrs)) {
        if (k.indexOf(':') > 0 && k.slice(k.indexOf(':') + 1) === 'id') { rid = sid.attrs[k]; break; }
      }
      if (rid == null) rid = sid.attrs['id'];
      const rel = rid ? rels[rid] : null;
      if (rel && !rel.external) targets.push(resolveTarget('ppt', rel.target));
    }
  }
  if (!targets.length) throw new Error('presentation.xml 无幻灯片列表');
  return targets;
}

/** 一个 txBody → markdown 行（列表层级/项目符号） */
function txBodyToLines(txBody) {
  const lines = [];
  const counters = {};
  for (const p of kidsOf(txBody, 'p')) {
    const pPr = kidOf(p, 'pPr');
    const lvl = pPr ? parseInt(attrOf(pPr, 'lvl') || '0', 10) || 0 : 0;
    const buChar = pPr ? kidOf(pPr, 'buChar') : null;
    const buAuto = pPr ? kidOf(pPr, 'buAutoNum') : null;
    const buNone = pPr ? !!kidOf(pPr, 'buNone') : false;
    // 收集文本（a:t 元素文本在其子文本节点里；a:fld 页码/日期域跳过）
    let text = '';
    (function walk(node) {
      if (node.t === '#') { text += node.s; return; }
      if (node.local === 't') { text += textOf(node); return; }
      if (node.local === 'br') { text += ' '; return; }
      if (node.local === 'fld') return; // 页码/日期域跳过
      for (const k of node.kids) walk(k);
    })(p);
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (buNone) lines.push(text);
    else if (buAuto) {
      const key = 'n' + lvl;
      counters[key] = (counters[key] || 0) + 1;
      for (const k of Object.keys(counters)) if (k[0] === 'n' && parseInt(k.slice(1), 10) > lvl) delete counters[k];
      lines.push('  '.repeat(Math.min(lvl, 4)) + counters[key] + '. ' + text);
    } else if (buChar) {
      lines.push('  '.repeat(Math.min(lvl, 4)) + '- ' + text);
    } else {
      // 清理深层计数（切回普通段落）
      for (const k of Object.keys(counters)) delete counters[k];
      lines.push(text);
    }
  }
  return lines;
}

async function pptxToMarkdown(zip) {
  const targets = await pptxSlideTargets(zip);
  const blocks = [];
  const warnings = [];
  let images = 0;
  let tables = 0;
  for (let i = 0; i < targets.length; i++) {
    const bytes = await zip.read(targets[i]);
    if (!bytes) { warnings.push(`幻灯片部件缺失：${targets[i]}`); continue; }
    const baseDir = targets[i].includes('/') ? targets[i].slice(0, targets[i].lastIndexOf('/')) : 'ppt';
    const relsBytes = await zip.read(`${baseDir}/_rels/${targets[i].slice(baseDir.length + 1)}.rels`);
    const rels = relsBytes ? parseRels(new TextDecoder().decode(relsBytes), targets[i] + '.rels') : {};
    const slideRoot = parseXml(new TextDecoder().decode(bytes), targets[i]);
    const spTree = kidOf(kidOf(slideRoot, 'cSld') || slideRoot, 'spTree');
    const lines = [];
    let title = '';
    const notes = [];
    const ctxLocal = { rels };

    function visitShapes(container) {
      for (const sp of container.kids) {
        if (sp.t === '#') continue;
        switch (sp.local) {
          case 'sp': {
            const nvPr = kidOf(kidOf(kidOf(sp, 'nvSpPr') || sp, 'nvPr') || sp, 'ph');
            const phType = nvPr ? attrOf(nvPr, 'type') || '' : '';
            if (phType === 'sldNum' || phType === 'ftr' || phType === 'dt') break; // 页脚/页码/日期噪声
            const txBody = kidOf(sp, 'txBody');
            if (!txBody) break;
            const ls = txBodyToLines(txBody);
            if (phType === 'title' || phType === 'ctrTitle') {
              title = ls.join(' ').trim();
            } else if (ls.length) {
              if (phType === 'subTitle') for (const l of ls) lines.push('> ' + l);
              else lines.push(...ls);
            }
            break;
          }
          case 'graphicFrame': {
            const tbl = (function find(node) {
              for (const k of node.kids) {
                if (k.t === '#') continue;
                if (k.local === 'tbl') return k;
                const r = find(k);
                if (r) return r;
              }
              return null;
            })(sp);
            if (tbl) {
              tables += 1;
              const rows = [];
              let cols = 0;
              for (const tr of kidsOf(tbl, 'tr')) {
                const cells = [];
                for (const tc of kidsOf(tr, 'tc')) {
                  const span = parseInt(attrOf(tc, 'gridSpan') || '1', 10) || 1;
                  const isHMerge = attrOf(tc, 'hMerge') != null || (attrOf(tc, 'vMerge') != null && attrOf(tc, 'vMerge') !== '0');
                  const txBody = kidOf(tc, 'txBody');
                  const content = txBody ? txBodyToLines(txBody).join('<br>') : '';
                  if (!isHMerge) cells.push(content.replace(/\|/g, '\\|'));
                  for (let s = 1; s < span; s++) cells.push('');
                }
                cols = Math.max(cols, cells.length);
                rows.push(cells);
              }
              if (rows.length) {
                for (const r of rows) while (r.length < cols) r.push('');
                for (let ri = 0; ri < rows.length; ri++) {
                  lines.push('| ' + rows[ri].join(' | ') + ' |');
                  if (ri === 0) lines.push('|' + Array(cols).fill(' --- ').join('|') + '|');
                }
              }
            }
            break;
          }
          case 'pic': {
            images += 1;
            lines.push(`[图${images}]`);
            break;
          }
          case 'grpSp': visitShapes(sp); break;
          default: break;
        }
      }
    }
    if (spTree) visitShapes(spTree);

    // 演讲者备注
    const rel = Object.values(rels).find((r) => !r.external && /notesSlide\d*\.xml$/.test(r.target));
    if (rel) {
      const notesTarget = resolveTarget(baseDir, rel.target);
      const notesBytes = await zip.read(notesTarget);
      if (notesBytes) {
        const notesRoot = parseXml(new TextDecoder().decode(notesBytes), notesTarget);
        for (const sp of kidsOf(kidOf(kidOf(notesRoot, 'cSld') || notesRoot, 'spTree') || notesRoot, 'sp')) {
          const nvPr = kidOf(kidOf(kidOf(sp, 'nvSpPr') || sp, 'nvPr') || sp, 'ph');
          const phType = nvPr ? attrOf(nvPr, 'type') || '' : '';
          if (phType === 'sldNum' || phType === 'ftr' || phType === 'dt' || phType === 'sldImg') continue;
          const txBody = kidOf(sp, 'txBody');
          if (txBody) {
            const ls = txBodyToLines(txBody);
            if (ls.length) notes.push(...ls);
          }
        }
      }
    }

    blocks.push(`## ${i + 1}. ${title || '（无标题）'}`);
    if (lines.length) blocks.push(lines.join('\n'));
    if (notes.length) blocks.push('> 备注：' + notes.join('；'));
  }
  if (images) warnings.push(`图片 ${images} 张未提取内容（已用 [图N] 占位）`);
  return { markdown: blocks.join('\n\n'), warnings, stats: { slides: targets.length, tables, images } };
}

// ── 5. 嗅探 + 单一入口 ───────────────────────────────────────────────────

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function sniffFormat(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'zip';
  if (bytes.length >= 8 && OLE_MAGIC.every((b, i) => bytes[i] === b)) return 'ole';
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  return 'unknown';
}

function countWords(text) {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (text.match(/[A-Za-z0-9]+/g) || []).length;
  return { cjk, latin, total: cjk + latin };
}

function truncateOutput(md) {
  if (md.length <= LIMITS.MAX_OUTPUT_CHARS) return md;
  return md.slice(0, LIMITS.MAX_OUTPUT_CHARS) + `\n\n---\n（输出已截断：原始 ${md.length} 字符，超 MCP 上限 ${LIMITS.MAX_OUTPUT_CHARS}；可指定 sheet/缩小范围）`;
}

/** 单一入口：字节 → {format, markdown, warnings, stats, sheets?} */
async function extractAuto(bytes, opts) {
  const options = opts || {};
  const t0 = Date.now();
  if (bytes.length > LIMITS.MAX_FILE_BYTES) throw new Error(`文件 ${bytes.length}B 超上限 ${LIMITS.MAX_FILE_BYTES}B（100MB）`);
  const sniffed = sniffFormat(bytes);
  if (sniffed === 'ole') {
    throw new Error('这是旧版 Office 二进制格式（.doc/.xls/.ppt，OLE 复合文档）——请先在 Office/WPS 中另存为 docx/xlsx/pptx');
  }
  if (sniffed === 'pdf') {
    throw new Error('这是 PDF——PDF 场景请使用纸坊（zhifang）或表格提取台（pdf-tables）');
  }
  if (sniffed !== 'zip') {
    throw new Error('不是 OOXML 文档（缺少 PK zip 头）——请确认文件为 docx/xlsx/pptx');
  }
  const zip = await openZip(bytes);
  const names = zip.names;
  const has = (n) => names.indexOf(n) >= 0;
  let format = null;
  if (has('word/document.xml')) format = 'docx';
  else if (has('xl/workbook.xml')) format = 'xlsx';
  else if (has('ppt/presentation.xml')) format = 'pptx';
  if (!format) {
    throw new Error('是 zip 容器但不是 Office 文档（未发现 word/ xl/ ppt/ 部件）——请确认文件为 docx/xlsx/pptx');
  }

  if (format === 'docx') {
    const r = await docxToMarkdown(zip, options);
    const words = countWords(r.markdown);
    return {
      format, markdown: r.markdown, warnings: r.warnings,
      stats: { ...r.stats, words: words.total, cjk: words.cjk, chars: r.markdown.length, ms: Date.now() - t0 },
    };
  }
  if (format === 'xlsx') {
    const m = await xlsxToMatrix(zip, options.sheet);
    const body = options.csv ? matrixToCsv(m.matrix) : matrixToMarkdown(m.matrix);
    const warnings = [];
    if (m.formulaCount) warnings.push(`公式 ${m.formulaCount} 处：显示的是打开文件时的缓存计算值`);
    if (m.mergedCount) warnings.push(`合并单元格 ${m.mergedCount} 处：值保留在左上角，其余位置为空`);
    if (m.total > 1 && !options.sheet) warnings.push(`共 ${m.total} 个工作表，当前为第 ${m.sheetIndex + 1} 个「${m.sheetName}」；其余：${m.sheetNames.filter((n, i) => i !== m.sheetIndex).slice(0, 8).join('、')}`);
    const words = countWords(body);
    return {
      format, markdown: body, warnings,
      sheets: m.sheetNames.map((n) => n),
      sheetName: m.sheetName,
      stats: { rows: m.matrix.length, cols: m.matrix[0] ? m.matrix[0].length : 0, formulas: m.formulaCount, words: words.total, chars: body.length, ms: Date.now() - t0 },
    };
  }
  const r = await pptxToMarkdown(zip);
  const words = countWords(r.markdown);
  return {
    format, markdown: r.markdown, warnings: r.warnings,
    stats: { ...r.stats, words: words.total, cjk: words.cjk, chars: r.markdown.length, ms: Date.now() - t0 },
  };
}

/** 概览（不产全文）：docx 标题树 / pptx 标题列表 / xlsx sheet 清单+规模 */
async function outlineAuto(bytes) {
  if (bytes.length > LIMITS.MAX_FILE_BYTES) throw new Error('文件超上限 100MB');
  const sniffed = sniffFormat(bytes);
  if (sniffed === 'ole') throw new Error('旧版 Office 二进制格式（.doc/.xls/.ppt）——请先另存为 docx/xlsx/pptx');
  if (sniffed !== 'zip') throw new Error('不是 OOXML 文档（docx/xlsx/pptx）');
  const zip = await openZip(bytes);
  const names = zip.names;
  const has = (n) => names.indexOf(n) >= 0;
  const lines = [];
  if (has('word/document.xml')) {
    const r = await docxToMarkdown(zip, {});
    const hs = r.markdown.split('\n').filter((l) => /^#{1,6} /.test(l));
    for (const h of hs) lines.push(h);
    return { format: 'docx', text: lines.join('\n') || '（无标题）', stats: r.stats };
  }
  if (has('xl/workbook.xml')) {
    const model = await xlsxLoad(zip);
    for (const s of model.sheets) {
      const m = await readSheetMatrix(zip, s.target, model.sharedStrings, model.styles, model.date1904);
      const head = m.matrix[0] ? m.matrix[0].slice(0, 6).join(' | ') : '';
      lines.push(`- ${s.name}：${m.matrix.length} 行 × ${m.matrix[0] ? m.matrix[0].length : 0} 列${head ? `；首行：${head}` : ''}`);
    }
    return { format: 'xlsx', text: lines.join('\n') || '（空簿）' };
  }
  if (has('ppt/presentation.xml')) {
    const r = await pptxToMarkdown(zip);
    for (const l of r.markdown.split('\n')) if (/^## /.test(l)) lines.push(l);
    return { format: 'pptx', text: lines.join('\n') || '（无幻灯片）', stats: r.stats };
  }
  throw new Error('不是 Office 文档（未发现 word/ xl/ ppt/ 部件）');
}

module.exports = {
  LIMITS,
  openZip,
  parseXml,
  sniffFormat,
  countWords,
  docxToMarkdown,
  xlsxToMatrix,
  xlsxSheetNames,
  matrixToMarkdown,
  matrixToCsv,
  pptxToMarkdown,
  extractAuto,
  outlineAuto,
  fmtCodeIsDate,
  serialToDateTime,
  colLettersToIndex,
  // 树工具（测试用）
  kidsOf,
  kidOf,
  textOf,
  attrOf,
  parseRels,
  resolveTarget,
};
