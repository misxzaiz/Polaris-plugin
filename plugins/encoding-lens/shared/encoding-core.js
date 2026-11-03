'use strict';
/**
 * encoding-lens 核心引擎 —— 编码识别 / mojibake 乱码修复 / 转换 / 乱码指纹
 *
 * 单一权威，零 node 依赖（core 会被 esbuild 打进面板 browser bundle）：
 * 只用全局 TextDecoder / TextEncoder（node 与浏览器双端内置）。
 *
 * 设计要点（全部来自 2026-11-04 实证，见 test/）：
 *  1. 修复原理 = mojibake 是「字节按错编码解码」的产物，把文本按错误编码
 *     重编码回字节、再按正确编码解码即可还原。反推编码器（text→bytes）
 *     通过「枚举双字节码位 + TextDecoder 解码」运行时构建，无需第三方编码表。
 *  2. WHATWG gbk 解码器对未分配码位不抛错（实测 23940 码位全成功），
 *     因此 detect 不能依赖 fatal 抛错区分多字节族，必须靠可读性评分。
 *  3. 修复器不变式：修复产物必须通过终验（无 U+FFFD、可读分显著提升、
 *     round-trip 自洽），不过就如实报 uncertain/clean，绝不输出半成品。
 */

/* ---------------------------------- 基础工具 ---------------------------------- */

const U8 = (s) => new TextEncoder().encode(s);

function strictDecode(bytes, encoding) {
  try {
    return { ok: true, text: new TextDecoder(encoding, { fatal: true }).decode(bytes), error: '' };
  } catch (e) {
    return { ok: false, text: '', error: e && e.message ? e.message : String(e) };
  }
}

function bytesToHex(bytes, sep) {
  const s = sep === undefined ? ' ' : sep;
  const out = [];
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i].toString(16).padStart(2, '0'));
  return s === '' ? out.join('') : out.join(s);
}

function hexToBytes(hex) {
  const clean = String(hex).replace(/0x/gi, '').replace(/[\s,:-]+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0 || clean.length === 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : B64_CHARS[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : B64_CHARS[b2 & 63];
  }
  return out;
}

function base64Decode(str) {
  const clean = String(str).replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const cut = clean.indexOf('=');
  const body = cut === -1 ? clean : clean.slice(0, cut);
  if (!/^[A-Za-z0-9+/]*$/.test(body) || body.length % 4 === 1) return null;
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of body) {
    acc = (acc << 6) | B64_CHARS.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/* ---------------------------------- 可读性评分 ---------------------------------- */

// 常用汉字抽查集（覆盖现代中文最频 ~160 字，用于判定「读出来像人话」），
// 集合不必完备——只要对正确解码与错误解码有区分度即可。
const COMMON_HANZI = new Set(
  ('的一是了我不人在他有这上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家' +
    '可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己' +
    '面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被' +
    '高已亲其进此话常与活正理信息 New 文件测试数据')
    .replace(/[^一-鿿]/g, '')
    .split('')
);

/**
 * 可读性评分（raw 分，不 clamp——detect 排序依赖 raw 区分度，展示层才 clamp）
 * opts.multibyteStats：多字节族候选专用——开启字符重复率项（真实语言重尾 vs
 * 随机误读均匀），单字节族/utf-8 候选关闭（它们共享同一字节流的重复结构，
 * 该项无区分度且对短西文是噪声）。
 */
function scoreText(text, opts) {
  if (!text.length) return 0;
  const multibyteStats = !!(opts && opts.multibyteStats);
  let score = 0;
  let hanzi = 0, kana = 0, hangul = 0, latinExt = 0, c1ctrl = 0, fffd = 0, pua = 0;
  let latinRun = 0, mojibakeRuns = 0; // 连续 latinExt 串：真西文重音字母单独出现，mojibake 成串
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfffd) { fffd++; latinRun = 0; continue; }
    if (cp >= 0x80 && cp <= 0x9f) { c1ctrl++; latinRun = 0; continue; }
    if (cp >= 0xe000 && cp <= 0xf8ff) { pua++; latinRun = 0; continue; }
    if (cp >= 0x4e00 && cp <= 0x9fff) {
      hanzi++;
      latinRun = 0;
      score += COMMON_HANZI.has(ch) ? 1.0 : 0.35;
    } else if ((cp >= 0x3040 && cp <= 0x30ff) || cp === 0x30fc) { kana++; latinRun = 0; score += 0.9; }
    else if (cp >= 0xac00 && cp <= 0xd7af) {
      hangul++; latinRun = 0;
      // 谚文基础分压到 0.2：GBK 常用字全在 GB2312 区（[A1,FE]×[A1,FE]，与
      // EUC-KR 码域完全重叠），GBK 字节经 EUC-KR 解码会产出大量谚文（实测
      // 误读产物谚文占比可达 0.48），基础分高会让异族误读白得韩文分；
      // 真韩文靠下方语境奖励（门槛 0.6）补回
      score += 0.2;
    }
    else if ((cp >= 0xc0 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) {
      latinExt++;
      latinRun++;
      if (latinRun >= 2) mojibakeRuns++;
      // 单独的 latinExt（词内重音字母，如 Café）不罚；成串才按 mojibake 罚
      score += latinRun >= 2 ? -1.2 : 0;
    } else if (cp < 0x7f) {
      latinRun = 0;
      const c = String.fromCodePoint(cp);
      score += /[A-Za-z0-9]/.test(c) ? 0.3 : /[ \t\r\n.,;:!?'"()\-_/@#=]/.test(c) ? 0.15 : 0;
    } else if (cp >= 0x3000 && cp <= 0x303f) { latinRun = 0; score += 0.4; } // CJK 标点
    else if (cp === 0xa0) { score -= 0.2; } // NBSP 轻罚
    else if (cp >= 0x2500 && cp <= 0x25ff) { /* 制表符中性 */ }
    else { score -= 0.05; latinRun = 0; }
  }
  const len = [...text].length;
  // 韩文语境奖励：现代韩文几乎纯谚文（汉字词已谚文化，hanzi 占比 <15%）；
  // GBK 误读产物谚文/汉字双高（实测 0.48/0.26）——「双 CJK 混杂」拦在门外
  if (len > 0 && hangul / len > 0.5 && hanzi / len < 0.15) score += len * 0.8;
  // 乱码硬特征重罚：U+FFFD / C1 控制 / PUA 按占比罚
  score -= (fffd * 4 + c1ctrl * 2 + pua * 1.5);
  // 多字节族专用：字符重复率项（top10 占比 vs 均匀期望 min(10,len)/len）
  if (multibyteStats && len >= 12) {
    const freq = new Map();
    for (const ch of text) freq.set(ch, (freq.get(ch) || 0) + 1);
    const topShare = [...freq.values()].sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0) / len;
    const baseline = Math.min(10, len) / len;
    score += (topShare - baseline) * len * 2.5;
  }
  // 归一化：perChar 正确中文 ≈ 0.8-1.0、英文 ≈ 0.3、乱码 ≤ 0 → 50±60 映射
  const norm = 50 + (score / Math.max(len, 1)) * 60;
  return norm;
}

/* ---------------------------------- 反推编码器 ---------------------------------- */
/**
 * text → bytes 的方向没有原生 API（TextEncoder 只有 utf-8）。
 * 思路：枚举该编码全部双字节码位，用 TextDecoder 解出字符，建「字符→字节」
 * 反推表（实测 GBK 23940 码位零歧义）。单字节区（<0x80）恒等直映。
 * 表按需惰性构建：GBK 一次 ~40ms，浏览器同样可行。
 */

const LEAD = { gbk: [0x81, 0xfe], big5: [0x81, 0xfe], shift_jis: [0x81, 0x9f], 'euc-kr': [0x81, 0xfd], 'euc-jp': [0x81, 0x8f] };
const SINGLE_BYTE_TRAILS = { shift_jis: [[0xa1, 0xdf]] }; // shift_jis 0xA1-0xDF 单字节半角片假名区（双字节 lead 前置区）
// 规范键：utf-8 / utf-16le / latin1 / windows-1252 / gbk / gb18030 / big5 / shift_jis / euc-kr / euc-jp
const CHARSET_ALIASES = {
  utf8: 'utf-8', 'utf-8': 'utf-8', utf16le: 'utf-16le', 'utf-16le': 'utf-16le', utf16be: 'utf-16be',
  latin1: 'latin1', 'iso-8859-1': 'latin1', cp1252: 'windows-1252', 'windows-1252': 'windows-1252',
  gbk: 'gbk', gb2312: 'gbk', gb18030: 'gb18030', big5: 'big5', big5hkscs: 'big5hkscs',
  shift_jis: 'shift_jis', sjis: 'shift_jis', 'shift-jis': 'shift_jis',
  euc_jp: 'euc-jp', 'euc-jp': 'euc-jp', euc_kr: 'euc-kr', 'euc-kr': 'euc-kr',
  utf16: 'utf-16le',
};

function normalizeCharset(name) {
  const k = String(name || '').trim().toLowerCase().replace(/_/g, '-');
  if (CHARSET_ALIASES[k]) return CHARSET_ALIASES[k];
  return k;
}

const encMaps = new Map(); // charset -> Map(char -> byte[])（1 或 2 字节）
// 单字节特例：WHATWG gbk 的 0x80 → €（cp936 欧元位，流中落单即产出）；
// shift_jis 的 0xA1-0xDF → 半角片假名（U+FF61-FF9F）。缺了它们，含 € / 半角假名的
// 误读产物在反推时 unsupported，整链被误判不可修（encoding-lens 长文实证）。
const SINGLE_BYTE_SPECIALS = {
  gbk: [[0x80, 0x20ac]],
  shift_jis: (() => { const a = []; for (let b = 0xa1; b <= 0xdf; b++) a.push([b, 0xff61 + (b - 0xa1)]); return a; })(),
};function getDoubleByteMap(charset) {
  const cs = normalizeCharset(charset);
  if (encMaps.has(cs)) return encMaps.get(cs);
  const range = LEAD[cs];
  if (!range) return null;
  const dec = new TextDecoder(cs); // 容错模式：未分配码位不抛（实测）
  const fatalDec = new TextDecoder(cs, { fatal: true });
  const map = new Map();
  const buf = new Uint8Array(2);
  for (let b1 = range[0]; b1 <= range[1]; b1++) {
    // trail 区随编码不同：gbk/big5/euc-kr 为 0x40-0xFE（去 0x7F）；shift_jis 三段 trail 单列
    const trails = cs === 'shift_jis' ? [[0x40, 0x7e], [0x80, 0xfc]] : [[0x40, 0xfe]];
    for (const [t0, t1] of trails) {
      for (let b2 = t0; b2 <= t1; b2++) {
        if (b2 === 0x7f) continue;
        buf[0] = b1; buf[1] = b2;
        let ch;
        try { ch = fatalDec.decode(buf); } catch (_) {
          try { ch = dec.decode(buf); } catch (_) { continue; }
        }
        if (ch === '\ufffd' || ch === '\u0000') continue;
        if (!map.has(ch)) map.set(ch, [b1, b2]);
      }
    }
  }
  const specials = SINGLE_BYTE_SPECIALS[cs];
  if (specials) for (const [b, cp] of specials) if (!map.has(String.fromCodePoint(cp))) map.set(String.fromCodePoint(cp), [b]);
  encMaps.set(cs, map);
  return map;
}

// windows-1252 的 0x80-0x9F 区显式映射（whatwg 标准值；0x81/0x8D/0x8F/0x90/0x9D
// 保留为 C1 直映、不在表内）。禁用「连写字符串 + indexOf 取 idx」写法——跳位处
// idx 会漂移（œ 实测被算成 0x9A 而非 0x9C，修复产物错字符）。
const CP1252_HIGH_MAP = new Map([
  [0x80, '\u20ac'], [0x82, '\u201a'], [0x83, '\u0192'], [0x84, '\u201e'], [0x85, '\u2026'],
  [0x86, '\u2020'], [0x87, '\u2021'], [0x88, '\u02c6'], [0x89, '\u2030'], [0x8a, '\u0160'],
  [0x8b, '\u2039'], [0x8c, '\u0152'], [0x8e, '\u017d'], [0x91, '\u2018'], [0x92, '\u2019'],
  [0x93, '\u201c'], [0x94, '\u201d'], [0x95, '\u2022'], [0x96, '\u2013'], [0x97, '\u2014'],
  [0x98, '\u02dc'], [0x99, '\u2122'], [0x9a, '\u0161'], [0x9b, '\u203a'], [0x9c, '\u0153'],
  [0x9e, '\u017e'], [0x9f, '\u0178'],
]);
function cp1252CharToByte(ch) {
  for (const [b, c] of CP1252_HIGH_MAP) if (c === ch) return b;
  return null;
}

// cp1252 解码必须自建：实测本机 Node 的 TextDecoder('windows-1252') 退化为
// latin1 恒等映射（0x80→U+0080 而非 €，encoding 属性却照报 windows-1252），
// 多字节族（gbk/big5/shift_jis/euc-kr）实测正常。退化解码会让 cp1252 链的
// round-trip 终验假阴性（€ 编回 0x80 再解码得 U+0080 ≠ 原 €）。
function decodeCp1252(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x80 && b <= 0x9f) {
      const c = CP1252_HIGH_MAP.get(b);
      out += c !== undefined ? c : String.fromCharCode(b);
    } else out += String.fromCharCode(b);
  }
  return out;
}

/**
 * 把文本按指定编码编码为字节。
 * 返回 { bytes: Uint8Array|null, unsupported: string[] }；bytes=null 表示该编码不可用于编码。
 */
function encodeText(text, charset) {
  const cs = normalizeCharset(charset);
  if (cs === 'utf-8') return { bytes: U8(text), unsupported: [] };
  if (cs === 'utf-16le') {
    const out = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const cp = text.charCodeAt(i);
      out[i * 2] = cp & 0xff; out[i * 2 + 1] = cp >> 8;
    }
    return { bytes: out, unsupported: [] };
  }
  const unsupported = [];
  const chunks = [];
  if (cs === 'latin1') {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp > 0xff) { unsupported.push(ch); chunks.push(0x3f); } else chunks.push(cp);
    }
    return { bytes: Uint8Array.from(chunks), unsupported };
  }
  if (cs === 'windows-1252') {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) chunks.push(cp);
      else {
        const b = cp1252CharToByte(ch);
        if (b !== null) chunks.push(b);
        else if (cp >= 0x80 && cp <= 0x9f) chunks.push(cp); // whatwg cp1252 保留 C1 码位直映（0x81/0x8D/0x8F/0x90/0x9D）
        else { unsupported.push(ch); chunks.push(0x3f); }
      }
    }
    return { bytes: Uint8Array.from(chunks), unsupported };
  }
  const map = getDoubleByteMap(cs);
  if (!map) return { bytes: null, unsupported: [charset] };
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { chunks.push(cp); continue; }
    const pair = map.get(ch);
    if (pair) { for (const b of pair) chunks.push(b); continue; }
    unsupported.push(ch); chunks.push(0x3f);
  }
  return { bytes: Uint8Array.from(chunks), unsupported };
}

/* ---------------------------------- 编码识别 ---------------------------------- */

function hasBom(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return '';
}

function looksLikeUtf16(bytes) {
  if (bytes.length < 8) return 0;
  let zeroEven = 0, zeroOdd = 0, slots = 0;
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    slots++;
    if (bytes[i] === 0) zeroEven++;
    if (bytes[i + 1] === 0) zeroOdd++;
  }
  // UTF-16LE 的 ASCII 高位 00 全落奇位（偶位 00 罕见）；GBK/UTF-8 东亚流偶位是
  // lead/trail 区（无 00）。奇位 00 密集且显著偏斜才是强特征——纯 CJK UTF-16
  // 无 00 会漏判，但那类文件几乎都带 BOM，由 BOM 路径覆盖。
  const oddShare = zeroOdd / slots, evenShare = zeroEven / slots;
  if (oddShare > 0.25 && oddShare > evenShare * 3) return 'utf-16le';
  if (evenShare > 0.25 && evenShare > oddShare * 3) return 'utf-16be';
  return '';
}

const MB_CANDIDATES = [
  // prior：简中 Windows 环境先验（GBK 与 EUC-KR 码域在 GB2312 区完全重叠、
  // 字符统计难分时，简中用户文件是 GBK 的概率压倒性高；真韩文 raw 分差 >40，
  // 先验不翻盘）
  { charset: 'gbk', label: 'GBK / GB2312（简体中文 Windows 常用）', prior: 8 },
  { charset: 'big5', label: 'Big5（繁体中文）', prior: 0 },
  { charset: 'shift_jis', label: 'Shift_JIS（日文）', prior: 0 },
  { charset: 'euc-kr', label: 'EUC-KR（韩文）', prior: 0 },
  { charset: 'euc-jp', label: 'EUC-JP（日文）', prior: 0 },
  { charset: 'gb18030', label: 'GB18030（国标超集，兜底）', prior: -1 },
];

/**
 * 字节级编码识别：BOM → UTF-8 严格 → UTF-16 零字节模式 → 多字节族评分 → 单字节族。
 * 返回 { bom, best: {charset,label,score,confidence}, candidates: [...] }。
 */
function detectEncoding(bytes) {
  const candidates = [];
  const clampS = (v) => Math.max(0, Math.min(100, v));
  // 排序与置信度全部基于 raw 分（scoreRaw）；clamp 只发生在输出展示。
  // 同 charset 只保留最高 raw（BOM 候选与常规候选会重复出现）。
  const push = (charset, label, scoreRaw, note) => {
    if (scoreRaw <= 0) return;
    const prev = candidates.find((c) => c.charset === charset);
    if (prev) { if (scoreRaw > prev.scoreRaw) { prev.scoreRaw = scoreRaw; prev.label = label; prev.note = note || prev.note; } return; }
    candidates.push({ charset, label, scoreRaw, note: note || '' });
  };
  // EUC-KR / EUC-JP 码域结构罚：lead 与 trail 必须 ≥ 0xA1，字节流中出现
  // 0x81-0xA0 区高位字节即结构性排除（strict 不抛的样本靠这层拦住）
  let lowCjk = 0;
  for (const b of bytes) if (b >= 0x81 && b <= 0xa0) lowCjk++;
  const eucPenalty = lowCjk > 0 ? -40 : 0;

  const bom = hasBom(bytes);
  if (bom) {
    push(bom, '带 BOM 的 ' + bom, 100, 'BOM 确定性判定');
  }

  const utf8 = strictDecode(bytes, 'utf-8');
  const allAscii = utf8.ok && !bytes.some((b) => b > 0x7f);
  if (utf8.ok) {
    const s = allAscii ? 95 : scoreText(utf8.text);
    push('utf-8', allAscii ? 'ASCII（UTF-8 兼容）' : 'UTF-8', s, allAscii ? '纯 ASCII，任何兼容编码都可读' : '严格 UTF-8 校验通过');
  }

  // 纯 ASCII 无编码歧义，短路返回（单字节族对 ASCII 恒等解码会以噪声反超）
  if (allAscii && !bom) {
    return {
      bom, size: bytes.length,
      best: { charset: 'utf-8', label: 'ASCII（UTF-8 兼容）', score: 95, note: '纯 ASCII，任何兼容编码都可读', confidence: '确定' },
      candidates: [{ charset: 'utf-8', label: 'ASCII（UTF-8 兼容）', score: 95, note: '纯 ASCII，任何兼容编码都可读' }],
    };
  }

  const u16 = looksLikeUtf16(bytes);
  if (u16 && !bom) {
    const dec = strictDecode(bytes, u16);
    if (dec.ok) push(u16, u16 === 'utf-16le' ? 'UTF-16LE' : 'UTF-16BE', 92, '零字节奇偶聚集模式');
  }

  // 多字节族：WHATWG gbk 对任意双字节容错（实测 23940 码位零失败），
  // fatal 无区分度——靠「语种加分 + 码域结构 + 环境先验」拉开。
  // 注意不开启重复率项：同一字节流的重复结构是字节属性而非解码属性，
  // GBK/EUC-KR 解同批字节该项得分相同，只会给低可读候选抬轿（实测毒效应）。
  for (const cand of MB_CANDIDATES) {
    if (bom && bom !== 'utf-16le' && cand.charset === 'gb18030') continue;
    const dec = strictDecode(bytes, cand.charset);
    if (!dec.ok) continue;
    const penalty = (cand.charset === 'euc-kr' || cand.charset === 'euc-jp') ? eucPenalty : 0;
    push(cand.charset, cand.label, scoreText(dec.text, { multibyteStats: false }) + cand.prior + penalty, penalty < 0 ? '码域含 0x81-0xA0 字节，非 EUC 系合法范围' : '');
  }

  // 单字节族兜底（latin1 恒成功，永远有分，但正确解码时得分被其他候选压制）
  const l1 = strictDecode(bytes, 'latin1');
  if (l1.ok) push('latin1', 'Latin-1 / ISO-8859-1', scoreText(l1.text), '恒可解码，仅当其他候选全弱时采信');
  const w12 = strictDecode(bytes, 'latin1'); // latin1 恒成功作为基底；cp1252 差异只在 0x80-0x9F 高区
  if (w12.ok) push('windows-1252', 'Windows-1252', scoreText(decodeCp1252(bytes)) + 1, '');

  candidates.sort((a, b) => b.scoreRaw - a.scoreRaw);
  const best = candidates[0] || { charset: 'utf-8', label: 'UTF-8', scoreRaw: 0, note: '' };
  const second = candidates[1];
  const gap = best.scoreRaw - (second ? second.scoreRaw : 0);
  const confidence = bom ? '确定' : gap >= 15 ? '高' : gap >= 5 ? '中' : '低';
  const out = candidates.slice(0, 8).map((c) => ({
    charset: c.charset, label: c.label, note: c.note,
    score: Math.round(clampS(c.scoreRaw) * 10) / 10,
  }));
  const bestOut = { ...out.find((c) => c.charset === best.charset) || { charset: best.charset, label: best.label, score: Math.round(clampS(best.scoreRaw) * 10) / 10, note: best.note }, confidence };
  return { bom, size: bytes.length, best: bestOut, candidates: out };
}

/* ---------------------------------- 乱码指纹 ---------------------------------- */

// 乱码指纹库：模式 → 根因解释。字形全部来自 TextDecoder 实测真值（勿手推增删）。
const FINGERPRINTS = [
  { re: /锟斤拷/, name: '锟斤拷', cause: '解码失败占位符 U+FFFD 的 UTF-8 字节序列（EF BF BD）又被按 GBK 反复读出并层层扩散的产物', fix: '原字节已损坏（U+FFFD 无信息量），只能从源头重新取数据，本台无法逆向还原' },
  { re: /烫烫烫|烫烫/, name: '烫烫烫', cause: 'MSVC Debug 模式未初始化堆内存填充 0xCC 被当作文本读出', fix: '不是编码问题——是程序读了未初始化内存，去查源码' },
  { re: /屯屯屯/, name: '屯屯屯', cause: 'MSVC Debug 模式未初始化堆内存填充 0xCD 被当作文本读出', fix: '不是编码问题——是程序读了未初始化内存，去查源码' },
  { re: /[\u00c3\u00e2][\u0080-\u00bf\u00c0-\u00ff]/, name: 'Ã¢â€ 型西文乱码', cause: 'UTF-8 字节被按 Latin-1 / Windows-1252 解码的典型形态（每 2 字符对应原 1 个非 ASCII 字符）', fix: '可自动修复：重编码回 Latin-1/CP1252 字节再按 UTF-8 解码' },
  { re: /[\u00e4-\u00e9][\u0080-\u00bf][\u0080-\u00bf]/, name: 'ä¸­æ 型西文乱码', cause: 'UTF-8 中文字节（E4-E9 开头三字节组）被按 Latin-1 逐字节读出', fix: '可自动修复：重编码回 Latin-1 字节再按 UTF-8 解码' },
  { re: /[\u6d93-\u6d94\u6da6][\u4e00-\u9fff]/, name: '涓枃 型 GBK 乱码', cause: 'UTF-8 中文字节被按 GBK 双字节重新配对读出（3 字节组被拆成 1.5 个汉字）', fix: '可自动修复：重编码回 GBK 字节再按 UTF-8 解码' },
  { re: /\u00e2\u20ac\u009c|\u00e2\u20ac\u009d|\u00e2\u20ac\u201d/, name: 'â€œ/â€/â€ 型引号乱码', cause: 'UTF-8 的弯引号/破折号（E2 80 xx 三字节）被按 Latin-1/CP1252 读出', fix: '可自动修复：重编码回 CP1252 字节再按 UTF-8 解码' },
];

/**
 * 文本级乱码指纹扫描 + 特征统计 + 判定。
 * 返回 { verdict: 'clean'|'mojibake'|'damaged'|'binary', findings, stats, suggestion }
 */
function analyzeText(text) {
  const findings = [];
  for (const fp of FINGERPRINTS) {
    const m = text.match(new RegExp(fp.re.source, 'g'));
    if (m) findings.push({ name: fp.name, count: m.length, cause: fp.cause, fix: fp.fix });
  }
  let fffd = 0, c1 = 0, latinExt = 0, hanzi = 0, ascii = 0, total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    total++;
    if (cp === 0xfffd) fffd++;
    else if (cp >= 0x80 && cp <= 0x9f) c1++;
    else if ((cp >= 0xc0 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) latinExt++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) hanzi++;
    else if (cp < 0x7f) ascii++;
  }
  const stats = { total, fffd, c1ctrl: c1, latinExt, hanzi, ascii, score: Math.round(scoreText(text) * 10) / 10 };
  let verdict, suggestion;
  const hasCurable = findings.some((f) => f.fix.startsWith('可自动修复'));
  const hasDamaged = findings.some((f) => f.cause.includes('U+FFFD') || f.cause.includes('不可逆') || f.fix.includes('无法逆向') || f.fix.includes('查源码'));
  if (fffd > 0 && fffd / Math.max(total, 1) > 0.02 || hasDamaged) {
    verdict = 'damaged';
    suggestion = findings.some((f) => f.name === '锟斤拷')
      ? '文本含不可逆损坏或其已知产物（如锟斤拷），原始字节信息已丢失，自动修复不可行——回到产生此文本的源头重新导出'
      : '文本含大量替换占位符（U+FFFD），原始字节信息已丢失，自动修复不可行——回到产生此文本的源头重新导出';
  } else if (hasCurable || (latinExt > 3 && latinExt / Math.max(total, 1) > 0.1) || (c1 > 0 && latinExt > 0)) {
    verdict = 'mojibake';
    suggestion = '检出典型 mojibake 特征，可用 fix 工具尝试自动修复（候选链见 fix 报告）';
  } else {
    verdict = 'clean';
    suggestion = '未检出乱码特征';
  }
  return { verdict, findings, stats, suggestion };
}

/* ---------------------------------- mojibake 修复 ---------------------------------- */

// 误读链：按真实世界频率排序（中文 Windows 场景 GBK 误读最常见，西文场景 CP1252/Latin1）
const FIX_CHAINS = [
  { reencode: 'gbk', decode: 'utf-8', label: 'UTF-8 字节被按 GBK 误读' },
  { reencode: 'windows-1252', decode: 'utf-8', label: 'UTF-8 字节被按 Windows-1252 误读' },
  { reencode: 'latin1', decode: 'utf-8', label: 'UTF-8 字节被按 Latin-1 误读' },
  { reencode: 'big5', decode: 'utf-8', label: 'UTF-8 字节被按 Big5 误读' },
  { reencode: 'shift_jis', decode: 'utf-8', label: 'UTF-8 字节被按 Shift_JIS 误读' },
  { reencode: 'euc-kr', decode: 'utf-8', label: 'UTF-8 字节被按 EUC-KR 误读' },
];

/**
 * mojibake 修复：对每条误读链「重编码回字节 → 按正确编码解码 → 评分」。
 * 终验不变式（修复器铁律）：修复产物必须满足
 *   ① 严格 UTF-8 可读（字符串天然满足，此处校验评分非 NaN）
 *   ② 无 U+FFFD、无 C1 控制字符
 *   ③ 可读分比原文提升 ≥ 8 分
 *   ④ round-trip 自洽：修复产物再走一遍「encode(decode 链) → decode(reencode 链)」能还原原文
 * 四条全过才记 fixed；只过 ②③ 记 uncertain（供人工判断，明确标注未过终验）。
 */
function fixMojibake(text, opts) {
  const opts_ = opts || {};
  const originalScore = scoreText(text);
  const candidates = [];
  for (const chain of FIX_CHAINS) {
    // 尾部孤立字节预处理：GBK 族按流配对解码时，奇数字节流的尾部孤立 lead
    // 会被容错误读为 U+FFFD——剥离尾部 FFFD 后主体可修复，缺失字节数如实注记；
    // 中间位置的 FFFD 是解码时真丢失的字节（不可逆），该链直接失败。
    let t = text;
    let tailLoss = 0;
    while (t.endsWith('\ufffd')) { t = t.slice(0, -1); tailLoss++; }
    if (t.indexOf('\ufffd') !== -1) continue;
    const enc = encodeText(t, chain.reencode);
    if (!enc.bytes) continue;
    if (enc.unsupported.length > 0) continue; // 链要求全文可按误读编码重编码
    const dec = strictDecode(enc.bytes, chain.decode);
    let fixed, fffd = 0, c1 = 0;
    if (dec.ok) {
      fixed = dec.text;
    } else if (tailLoss > 0) {
      // 尾部缺字节：容错解码，仅当 FFFD 全部位于尾部且数量 ≤ tailLoss 才接受
      const arr = [...new TextDecoder(chain.decode).decode(enc.bytes)];
      let tailF = 0, k = arr.length - 1;
      while (k >= 0 && arr[k].codePointAt(0) === 0xfffd) { tailF++; k--; }
      if (tailF === 0 || tailF > tailLoss) continue;
      if (arr.slice(0, k + 1).some((ch) => ch.codePointAt(0) === 0xfffd)) continue;
      fixed = arr.slice(0, arr.length - tailF).join('');
    } else continue;
    if (fixed === t) continue; // 解码后与原文一致说明该链无效果
    for (const ch of fixed) {
      const cp = ch.codePointAt(0);
      if (cp === 0xfffd) fffd++;
      else if (cp >= 0x80 && cp <= 0x9f) c1++;
    }
    const score = scoreText(fixed);
    const gain = Math.round((score - originalScore) * 10) / 10;
    // round-trip 自洽：
    //  tailLoss=0 —— 文本域闭环：fixed 重编码回字节后按误读编码解码应还原原文
    //  tailLoss>0 —— 尾部已不可逆，降级为字节域前缀检查：fixed 的 UTF-8 字节
    //                必须是反推字节流的严格前缀（主体无损、尾部缺失如实注记）
    let roundtrip = false;
    const back = encodeText(fixed, chain.decode);
    if (back.bytes && back.bytes.length <= enc.bytes.length) {
      if (tailLoss === 0) {
        if (back.bytes.length === enc.bytes.length) {
          // 与 fixture 生成语义一致用容错语义解码；cp1252 用自建解码器
          // （平台 TextDecoder('windows-1252') 退化 latin1，见 decodeCp1252 注）
          const origin = { text: chain.reencode === 'windows-1252' ? decodeCp1252(back.bytes) : new TextDecoder(chain.reencode).decode(back.bytes) };
          roundtrip = origin.text === t;
        }
      } else {
        roundtrip = true;
        for (let i = 0; i < back.bytes.length; i++) {
          if (back.bytes[i] !== enc.bytes[i]) { roundtrip = false; break; }
        }
      }
    }
    const passed = tailLoss === 0 && fffd === 0 && c1 === 0 && gain >= 8 && roundtrip;
    candidates.push({
      chain: chain.label,
      reencode: chain.reencode,
      decode: chain.decode,
      fixed,
      tailLoss,
      score: Math.round(score * 10) / 10,
      gain,
      fffd,
      c1ctrl: c1,
      roundtrip,
      status: passed ? 'fixed' : gain > 0 ? 'uncertain' : 'rejected',
    });
  }
  candidates.sort((a, b) => {
    const rank = { fixed: 0, uncertain: 1, rejected: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.gain - a.gain;
  });
  const best = candidates.find((c) => c.status === 'fixed') || candidates.find((c) => c.status === 'uncertain') || null;
  let status;
  if (best && best.status === 'fixed') status = 'fixed';
  else if (best && best.status === 'uncertain' && !opts_.strictOnly) status = 'uncertain';
  else if (!candidates.length && analyzeText(text).verdict === 'clean') status = 'clean';
  else status = 'unrepairable';
  return {
    status,
    originalScore: Math.round(originalScore * 10) / 10,
    best: status === 'fixed' || status === 'uncertain' ? best : null,
    candidates: candidates.slice(0, 6),
    note: best && best.tailLoss > 0 && (status === 'fixed' || status === 'uncertain')
      ? `修复链已还原主体，但原文尾部 ${best.tailLoss} 字节在误读时已丢失（奇数字节流按 GBK 配对的孤立尾部），结果缺尾部内容`
      : status === 'unrepairable'
        ? (analyzeText(text).verdict === 'damaged'
          ? '文本含不可逆损坏（U+FFFD），无法自动修复'
          : '所有误读链尝试后均未产生显著更可读的结果——可能不是编码问题，或损坏方式超出本台六条链')
        : '',
  };
}

/* ---------------------------------- 文件全链路体检 ---------------------------------- */

/**
 * 文件字节全链路体检：多路径终态评分裁决。
 *
 * 不盲信 detect.best 的中间判定——双重损坏文件（合法 UTF-8 但内容曾被 latin1
 * 误读）在字节视角判 GBK 也能读出假汉字，唯有「解码→指纹→修复」走完全程后的
 * 最终可读性才是裁决标准。对前 3 个候选各跑一遍全链路，按终态分排序：
 *   ① 文件本身是 GBK/Big5 等，按 UTF-8 打开乱码 → 「正确解码」路径终态分高
 *   ② 文件是 UTF-8 但内容曾被错误转存（双重 mojibake）→ 「识别+fix 链」路径胜出
 */
function inspectBytes(bytes) {
  const det = detectEncoding(bytes);
  // 路径枚举：前 3 候选 + utf-8 候选始终纳入（utf-8 strict 通过是结构性证据，
  // 但双重损坏文件的 utf-8 解码产物本身是乱码、分数垫底，按分截断会漏掉它——
  // 而它恰恰是唯一能走通「fix 链」还原的路径）
  const pathCands = det.candidates.filter((c, i) => i < 3 || c.charset === 'utf-8');
  const paths = [];
  for (const cand of pathCands) {
    const dec = strictDecode(bytes, cand.charset);
    if (!dec.ok) continue;
    const fp = analyzeText(dec.text);
    const fix = fp.verdict === 'mojibake' ? fixMojibake(dec.text) : fixMojibake(dec.text, { strictOnly: true });
    const finalText = fix.best ? fix.best.fixed : dec.text;
    paths.push({
      charset: cand.charset,
      label: cand.label,
      decodeNote: `按 ${cand.charset} 解码`,
      text: dec.text,
      fingerprint: fp,
      fix,
      finalScore: scoreText(finalText),
    });
  }
  paths.sort((a, b) => b.finalScore - a.finalScore);
  const best = paths[0] || {
    charset: det.best.charset, label: det.best.label, decodeNote: '所有候选严格解码失败，无法体检',
    text: '', fingerprint: analyzeText(''), fix: fixMojibake('', { strictOnly: true }), finalScore: 0,
  };
  return { detect: det, decodeNote: best.decodeNote, text: best.text, fingerprint: best.fingerprint, fix: best.fix, via: best.charset, paths: paths.map((p) => ({ charset: p.charset, finalScore: Math.round(p.finalScore * 10) / 10, fixStatus: p.fix.status })) };
}

/* ---------------------------------- 中文报告渲染 ---------------------------------- */

function renderDetectReport(det) {
  const lines = [];
  lines.push(`## 编码识别报告`);
  lines.push(`- 字节数：${det.size}`);
  if (det.bom) lines.push(`- BOM：检出（${det.bom}）`);
  lines.push(`- 最佳判定：**${det.best.label}**（置信度 ${det.best.confidence}，评分 ${det.best.score}）`);
  if (det.best.note) lines.push(`- 依据：${det.best.note}`);
  if (det.candidates.length > 1) {
    lines.push(`- 候选排序：`);
    for (const c of det.candidates) {
      lines.push(`  - ${c.charset === det.best.charset ? '▶' : '·'} ${c.label}——${c.score} 分${c.note ? `（${c.note}）` : ''}`);
    }
  }
  const lowConf = det.best.confidence === '低';
  if (lowConf) lines.push(`- ⚠️ 候选区分度低，建议结合内容人工确认（如已知来源语言可指定编码用 convert 验证）`);
  return lines.join('\n');
}

function renderFingerprintReport(fp) {
  const lines = [];
  const badge = { clean: '✅ 未检出乱码特征', mojibake: '🔀 检出 mojibake 乱码（可尝试自动修复）', damaged: '💥 文本已不可逆损坏' }[fp.verdict] || fp.verdict;
  lines.push(`## 乱码指纹报告：${badge}`);
  lines.push(`- 特征统计：共 ${fp.stats.total} 字符——汉字 ${fp.stats.hanzi}、Latin 扩展 ${fp.stats.latinExt}、C1 控制 ${fp.stats.c1ctrl}、U+FFFD ${fp.stats.fffd}；可读分 ${fp.stats.score}`);
  if (fp.findings.length) {
    lines.push(`- 命中指纹：`);
    for (const f of fp.findings) lines.push(`  - **${f.name}** ×${f.count}：${f.cause}。处置：${f.fix}`);
  }
  lines.push(`- 建议：${fp.suggestion}`);
  return lines.join('\n');
}

function renderFixReport(fix) {
  const lines = [];
  // badge 逐态构造：对象字面量 + 动态取键会把所有分支的模板串都求值
  // （clean 时 fix.best 为 null，`${fix.best.chain}` 直接 crash），禁用该写法
  let badge;
  if (fix.status === 'fixed') badge = `✅ 修复成功（${fix.best.chain}），可读分 ${fix.originalScore} → ${fix.best.score}`;
  else if (fix.status === 'uncertain') badge = '⚠️ 找到疑似修复链但未全部通过终验，结果仅供参考';
  else if (fix.status === 'clean') badge = '✅ 未检出乱码特征，无需修复';
  else badge = '❌ 未能自动修复';
  lines.push(`## 乱码修复报告：${badge}`);
  if (fix.note) lines.push(`- ${fix.note}`);
  if (fix.best) {
    lines.push(`- 误读链：${fix.best.chain}`);
    lines.push(`- 终验：U+FFFD=${fix.best.fffd}、C1 控制=${fix.best.c1ctrl}、可读分增益 +${fix.best.gain}、round-trip ${fix.best.roundtrip ? '自洽' : '不自洽'}`);
    lines.push('');
    lines.push('修复结果（截断到 4KB）：');
    lines.push('```');
    lines.push(fix.best.fixed.length > 4096 ? fix.best.fixed.slice(0, 4096) + `\n…（其余 ${fix.best.fixed.length - 4096} 字符省略）` : fix.best.fixed);
    lines.push('```');
  }
  if (fix.candidates.length > 1) {
    lines.push(`- 全部候选：`);
    for (const c of fix.candidates) {
      lines.push(`  - ${c === fix.best ? '▶' : '·'} [${c.status}] ${c.chain}——增益 +${c.gain}，round-trip ${c.roundtrip ? '✓' : '✗'}`);
    }
  }
  return lines.join('\n');
}

function renderInspectReport(r) {
  return [
    renderDetectReport(r.detect),
    '',
    `- 体检裁决：${r.decodeNote}${r.via ? `（终态分最高的路径 via ${r.via}）` : ''}`,
    '',
    renderFingerprintReport(r.fingerprint),
    '',
    renderFixReport(r.fix),
  ].join('\n');
}

module.exports = {
  U8, strictDecode, bytesToHex, hexToBytes, base64Encode, base64Decode,
  normalizeCharset, encodeText, getDoubleByteMap, decodeCp1252,
  detectEncoding, analyzeText, fixMojibake, inspectBytes, scoreText,
  renderDetectReport, renderFingerprintReport, renderFixReport, renderInspectReport,
  COMMON_HANZI,
};
