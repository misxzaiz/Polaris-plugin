'use strict';
/**
 * unicode-lens 核心 —— Unicode 隐形字符/同形字/混排检测与清洗引擎
 *
 * 零依赖纯函数（禁 require 任何 node 内置——本文件会被 esbuild 打进面板 browser bundle，
 * exec-sandbox 实证：shared 顶层 require('os') 直接炸 bundle）。
 * 与 MCP（mcp/server.js）和面板（src/Panel.tsx）共用同一权威。
 *
 * 检测域：
 *   ① 隐形注入载体：双向控制（Trojan Source CVE-2021-42574）、Unicode Tag 隐形标签
 *      （提示词隐形注入实证载体）、不可见填充、零宽字符、变体选择符、控制字符、
 *      异常空白、私有使用区
 *   ② 同形异码字：西里尔/希腊/全角字母数字/数学字母变体（附 ASCII 建议映射）
 *   ③ 混合文字系统：同一行内 Latin 与西里尔/希腊字母混排（正常中英混排不受影响）
 *   ④ 归一化：NFC 未归一化序列；编码损坏标志（U+FFFD）
 *
 * 设计取舍：
 *   - U+200D ZWJ 是 emoji 序列的合法成分，emoji 上下文（相邻字符 ≥U+1F000）按低提示处理，
 *     脱离 emoji 上下文按中危处理——避免对正常 emoji 文本误报。
 *   - U+3000 全角空格在中文排版合法，默认保留（keepIdeographicSpace 可改）。
 *   - 全角「标点」（：！？等）在中文文本合法，不报；只报全角字母/数字（标识符灾难）。
 *   - 不做全量 TR39 confusables 表（2 万+条目），内置高频混淆子集 + 整行混排启发式兜底。
 */

// ── 类别定义（风险分级 + 中文说明；渲染顺序按此数组） ──────────────────────

const CAT_ORDER = [
  'bidi', 'tag', 'filler',
  'zerowidth', 'variation', 'control', 'replacement', 'homoglyph', 'mixed_script',
  'zwj', 'space', 'pua', 'nonnormal',
];

const CATS = {
  bidi: {
    risk: 'high',
    title: '双向控制字符',
    desc: '可见顺序可能与真实逻辑顺序不一致：Trojan Source（CVE-2021-42574）标准载体；进入 AI 提示词时同样是隐形注入载体。',
  },
  tag: {
    risk: 'high',
    title: 'Unicode Tag 隐形标签',
    desc: '人眼不可见而 LLM 分词器可见的隐形指令载体（隐形提示注入攻击实证），常被用来把整段隐藏指令塞进提示词、文档或代码注释。',
  },
  filler: {
    risk: 'high',
    title: '不可见填充字符',
    desc: '视觉上等同空格的字母位填充（韩文填充符/盲文空白等），可制造看不见的用户名/标识符碰撞，绕过判重与审核。',
  },
  zerowidth: {
    risk: 'medium',
    title: '零宽字符',
    desc: '零宽空格/不连字/文字连接符等：正常文本中通常不合法，常见于隐形水印、隐藏指令与绕过敏感词检测。',
  },
  variation: {
    risk: 'medium',
    title: '变体选择符/组合连接符',
    desc: '改变前一字符呈现形式的不可见字符；正常文本极少出现，可用于隐藏标记或制造字符串判重差异。',
  },
  control: {
    risk: 'medium',
    title: '控制字符',
    desc: 'C0/C1 控制字符（Tab/换行/回车除外）：可能破坏解析器、终端呈现与日志分析。',
  },
  replacement: {
    risk: 'medium',
    title: '编码损坏替换符 U+FFFD',
    desc: '出现替换符说明文本可能不是 UTF-8（GBK/GB18030 被误读常见）或已损坏；本工具不做转码，请确认源编码后重新导出。',
  },
  homoglyph: {
    risk: 'medium',
    title: '同形异码字',
    desc: '与 ASCII 字母/数字视觉等价的其他文字字符（西里尔/希腊/全角/数学变体）：钓鱼域名与代码标识符混淆的经典手法。',
  },
  mixed_script: {
    risk: 'medium',
    title: '混合文字系统',
    desc: '同一行内拉丁字母与西里尔/希腊字母混排：同形词攻击的典型特征；中文与英文的正常混排不受影响。',
  },
  zwj: {
    risk: 'low',
    title: '零宽连接符 ZWJ',
    desc: 'emoji 序列的合法成分；脱离 emoji 上下文出现则可疑（隐形拼接/绕过判重）。',
  },
  space: {
    risk: 'low',
    title: '异常空白字符',
    desc: 'NBSP/窄空格等：多为排版来源，但会让字符串比较、判重与复制出现「看起来一样实际不同」。',
  },
  pua: {
    risk: 'low',
    title: '私有使用区字符',
    desc: 'Unicode 未定义语义的私有区（字体图标等合法用途也存在），跨环境呈现不可预期。',
  },
  nonnormal: {
    risk: 'low',
    title: 'NFC 未归一化序列',
    desc: '存在可归一化的组合序列：字符串比较/判重可能不一致，建议统一为 NFC 形式。',
  },
};

// ── 关键字符名称表（中文，覆盖高频检出字符；其余按类别/区间生成） ───────────

const NAMES = {
  0x200B: '零宽空格 ZWSP',
  0x200C: '零宽不连字 ZWNJ',
  0x200D: '零宽连接符 ZWJ',
  0x2060: '文字连接符 WORD JOINER',
  0x2061: '函数应用符号（不可见）',
  0x2062: '不可见乘号',
  0x2063: '不可见分隔符',
  0x2064: '不可见加号',
  0xFEFF: '零宽不换行空格（BOM）',
  0x200E: '左到右标记 LRM',
  0x200F: '右到左标记 RLM',
  0x061C: '阿拉伯字母标记 ALM',
  0x202A: '左到右嵌入 LRE',
  0x202B: '右到左嵌入 RLE',
  0x202C: '弹出方向格式 PDF',
  0x202D: '左到右覆盖 LRO',
  0x202E: '右到左覆盖 RLO（Trojan Source 核心）',
  0x2066: '左到右隔离 LRI',
  0x2067: '右到左隔离 RLI',
  0x2068: '第一强隔离 FSI',
  0x2069: '弹出隔离 PDI',
  0x00AD: '软连字符',
  0x034F: '组合字素连接符 CGJ',
  0x00A0: '不换行空格 NBSP',
  0x3000: '全角空格',
  0x3164: '韩文填充符（隐形用户名攻击经典）',
  0x115F: '韩文声母填充符',
  0x1160: '韩文韵母填充符',
  0xFFA0: '半角韩文填充符',
  0x2800: '盲文空白图案',
  0x180E: '蒙古语元音分隔符',
  0xFFFD: '替换字符（编码损坏标志）',
};

// 同形混淆映射：西里尔/希腊 → ASCII（手工整理高频子集）
const CONFUSABLES = {
  // 西里尔小写
  0x0430: 'a', 0x0435: 'e', 0x043E: 'o', 0x0440: 'p', 0x0441: 'c', 0x0443: 'y',
  0x0445: 'x', 0x0456: 'i', 0x0455: 's', 0x0458: 'j',
  // 西里尔大写
  0x0410: 'A', 0x0412: 'B', 0x0415: 'E', 0x041A: 'K', 0x041C: 'M', 0x041D: 'H',
  0x041E: 'O', 0x0420: 'P', 0x0421: 'C', 0x0422: 'T', 0x0423: 'Y', 0x0425: 'X',
  // 希腊大写
  0x0391: 'A', 0x0392: 'B', 0x0395: 'E', 0x0396: 'Z', 0x0397: 'H', 0x0399: 'I',
  0x039A: 'K', 0x039C: 'M', 0x039D: 'N', 0x039F: 'O', 0x03A1: 'P', 0x03A4: 'T',
  0x03A5: 'Y', 0x03A7: 'X',
  // 希腊小写
  0x03BF: 'o', 0x03C1: 'p', 0x03B9: 'i', 0x03BD: 'v', 0x03F5: 'e',
};

const SCRIPT_TITLES = { latin: '拉丁', cyrillic: '西里尔', greek: '希腊' };

// ── 基础工具函数 ──────────────────────────────────────────────────────────

function cpHex(cp) {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

function isCyrillic(cp) { return cp >= 0x0400 && cp <= 0x04FF; }
function isGreek(cp) { return (cp >= 0x0370 && cp <= 0x03FF) || (cp >= 0x1F00 && cp <= 0x1FFF); }
function isLatinLetter(cp) { return (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A); }

function fullwidthAscii(cp) {
  if (cp >= 0xFF10 && cp <= 0xFF19) return String.fromCharCode(cp - 0xFEE0); // 全角数字
  if ((cp >= 0xFF21 && cp <= 0xFF3A) || (cp >= 0xFF41 && cp <= 0xFF5A)) {
    return String.fromCharCode(cp - 0xFEE0); // 全角字母
  }
  return null;
}

function isEmojiNeighbor(cp) {
  // emoji 上下文粗判：主 emoji 区/补充符号区。够用即可——目的是降低 ZWJ 误报。
  return cp >= 0x1F000 || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x1F1E6 && cp <= 0x1F1FF);
}

/** 上下文无关分类（ZWJ 的风险分级在扫描循环里按邻接上下文细化） */
function classifyBase(cp) {
  // 双向控制（Trojan Source）
  if (cp === 0x200E || cp === 0x200F || cp === 0x061C ||
      (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069)) {
    return { cat: 'bidi', name: NAMES[cp] || '双向控制字符' };
  }
  // Unicode Tag 区（隐形标签）
  if (cp >= 0xE0000 && cp <= 0xE007F) {
    let name = 'Tag 字符（隐形标签区）';
    if (cp >= 0xE0020 && cp <= 0xE007E) name += `，解码为 "${String.fromCharCode(cp - 0xE0000)}"`;
    if (cp === 0xE007F) name += '（标签终止符）';
    return { cat: 'tag', name };
  }
  // 不可见填充
  if (cp === 0x3164 || cp === 0x115F || cp === 0x1160 || cp === 0xFFA0 ||
      cp === 0x2800 || cp === 0x180E) {
    return { cat: 'filler', name: NAMES[cp] || '不可见填充字符' };
  }
  // 零宽字符（ZWJ 单列）
  if (cp === 0x200D) return { cat: 'zwj', name: NAMES[0x200D] };
  if (cp === 0x200B || cp === 0x200C || cp === 0x2060 ||
      (cp >= 0x2061 && cp <= 0x2064) || cp === 0xFEFF) {
    return { cat: 'zerowidth', name: NAMES[cp] || '零宽字符' };
  }
  // 变体选择符 / 组合连接符 / 软连字符
  if (cp >= 0xFE00 && cp <= 0xFE0F) {
    return { cat: 'variation', name: `变体选择符 VS${cp - 0xFE00 + 1}` };
  }
  if (cp >= 0xE0100 && cp <= 0xE01EF) {
    return { cat: 'variation', name: `变体选择符补充 VS${cp - 0xE0100 + 17}` };
  }
  if (cp === 0x034F || cp === 0x00AD) {
    return { cat: 'variation', name: NAMES[cp] };
  }
  // 控制字符（Tab 0x09 / LF 0x0A / CR 0x0D 合法豁免）
  if (cp === 0x09 || cp === 0x0A || cp === 0x0D) return null;
  if (cp <= 0x1F || cp === 0x7F) return { cat: 'control', name: `C0 控制字符 ${cpHex(cp)}` };
  if (cp >= 0x80 && cp <= 0x9F) return { cat: 'control', name: `C1 控制字符 ${cpHex(cp)}` };
  // 编码损坏替换符
  if (cp === 0xFFFD) return { cat: 'replacement', name: NAMES[0xFFFD] };
  // 同形异码字：显式映射 → 全角字母数字 → 数学字母变体
  if (CONFUSABLES[cp] !== undefined) {
    const sub = isCyrillic(cp) ? 'cyrillic' : 'greek';
    return { cat: 'homoglyph', sub, suggest: CONFUSABLES[cp], name: `${String.fromCodePoint(cp)}（${SCRIPT_TITLES[sub]}字母，形似 "${CONFUSABLES[cp]}"）` };
  }
  const fw = fullwidthAscii(cp);
  if (fw) {
    return { cat: 'homoglyph', sub: 'fullwidth', suggest: fw, name: `${String.fromCodePoint(cp)}（全角字符，对应 "${fw}"）` };
  }
  if (cp >= 0x1D400 && cp <= 0x1D7FF) {
    const nfc = String.fromCodePoint(cp).normalize('NFKC');
    const suggest = /^[\x21-\x7E]$/.test(nfc) ? nfc : null;
    return { cat: 'homoglyph', sub: 'math', suggest, name: `数学字母变体 ${cpHex(cp)}${suggest ? `（对应 "${suggest}"）` : '（常来自 Word/公式编辑器复制）'}` };
  }
  // 异常空白（全角空格 0x3000 单列——中文排版合法）
  if (cp === 0x3000) return { cat: 'space', name: NAMES[0x3000] };
  if ((cp >= 0x2000 && cp <= 0x200A) || cp === 0x202F || cp === 0x205F || cp === 0x00A0) {
    return { cat: 'space', name: NAMES[cp] || '异常空白字符' };
  }
  // 私有使用区（BMP PUA + 补面 PUA-A/B；Tag 区已在上方先行处理）
  if ((cp >= 0xE000 && cp <= 0xF8FF) ||
      (cp >= 0xF0000 && cp <= 0xFFFFD) || (cp >= 0x100000 && cp <= 0x10FFFD)) {
    return { cat: 'pua', name: `私有使用区字符 ${cpHex(cp)}` };
  }
  return null;
}

/** 判定风险（ZWJ 按 emoji 上下文细化；其余查类别表） */
function riskOf(base, prevCp, nextCp) {
  if (base.cat === 'zwj') {
    return (isEmojiNeighbor(prevCp) || isEmojiNeighbor(nextCp)) ? 'low' : 'medium';
  }
  return CATS[base.cat].risk;
}

// ── 扫描 ──────────────────────────────────────────────────────────────────

const MAX_CHARS = 2_000_000; // 扫描上限（约 2M code unit），超出直接拒绝
const MAX_FINDINGS = 5000;   // 明细上限（对抗性输入防爆炸；计数不受影响）

/**
 * 扫描文本，返回：
 * {
 *   verdict: 'clean'|'low'|'medium'|'high',
 *   counts: { 类别: 出现次数 },
 *   riskCounts: { high, medium, low },
 *   findings: [{ index, end, cp, cat, risk, name, suggest?, sub?, line, col, context, hiddenMessage? }],
 *   truncated: bool,
 *   stats: { chars, units, lines },
 *   hiddenMessages: ['...'],   // Tag 字符解码出的隐藏内容
 * }
 */
function scanText(text) {
  if (typeof text !== 'string') throw new TypeError('text 必须是字符串');
  if (text.length > MAX_CHARS) throw new Error(`文本过长（${text.length} 字符，上限 ${MAX_CHARS}），请分段扫描`);

  const findings = [];
  const counts = {};
  const hiddenMessages = [];
  let truncated = false;

  let line = 1;
  let col = 1;
  let i = 0; // code unit 索引（供面板/定位切片用）

  // 行级混排统计
  let lineScripts = null; // { latin, cyrillic, greek, first: {cyrillic, greek} }
  const resetLine = () => { lineScripts = { latin: 0, cyrillic: 0, greek: 0, first: {} }; };
  resetLine();
  let totalLines = 1;

  // Tag 字符连读解码（运行中收集，遇非 Tag 收口）
  let tagRun = null; // { findingIdx, chars: [] }
  const flushTagRun = () => {
    if (tagRun && tagRun.chars.length >= 2 && tagRun.findingIdx >= 0) {
      const msg = tagRun.chars.join('');
      hiddenMessages.push(msg);
      const f = findings[tagRun.findingIdx];
      if (f) f.hiddenMessage = msg;
    }
    tagRun = null;
  };

  const pushFinding = (f) => {
    counts[f.cat] = (counts[f.cat] || 0) + 1;
    if (findings.length >= MAX_FINDINGS) { truncated = true; return -1; }
    findings.push(f);
    return findings.length - 1;
  };

  let prevCp = 0;
  for (const ch of text) { // code point 迭代，正确处理代理对
    const cp = ch.codePointAt(0);
    const width = cp > 0xFFFF ? 2 : 1;

    if (cp === 0x0A) {
      flushTagRun();
      flushMixed();
      totalLines += 1;
      line += 1; col = 1; i += 1;
      prevCp = 0;
      resetLine();
      continue;
    }

    const base = classifyBase(cp);
    if (base) {
      const risk = riskOf(base, prevCp, text.codePointAt(i + width));
      const f = {
        index: i,
        end: i + width,
        cp: cpHex(cp),
        cat: base.cat,
        sub: base.sub,
        suggest: base.suggest,
        risk,
        name: base.name,
        line,
        col,
        context: buildContext(text, i, i + width),
      };
      const idx = pushFinding(f);
      if (base.cat === 'tag') {
        // 收集可解码 ASCII（E0020–E007E ↔ 0x20–0x7E）；终止符/不可解码变体收口
        if (cp >= 0xE0020 && cp <= 0xE007E) {
          if (!tagRun) tagRun = { findingIdx: idx, chars: [] };
          tagRun.chars.push(String.fromCharCode(cp - 0xE0000));
        } else {
          flushTagRun();
        }
      } else {
        flushTagRun();
      }
    } else {
      flushTagRun();
      if (isLatinLetter(cp)) lineScripts.latin += 1;
      else if (isCyrillic(cp)) {
        lineScripts.cyrillic += 1;
        if (lineScripts.first.cyrillic === undefined) lineScripts.first.cyrillic = { index: i, line, col };
      } else if (isGreek(cp)) {
        lineScripts.greek += 1;
        if (lineScripts.first.greek === undefined) lineScripts.first.greek = { index: i, line, col };
      }
    }

    prevCp = cp;
    i += width;
    col += width;
  }
  flushTagRun();
  flushMixed();
  totalLines = line;

  /** 行内混排收口：≥2 个文字系统即报（定位到少数派脚本的首字母） */
  function flushMixed() {
    const s = lineScripts;
    const present = ['latin', 'cyrillic', 'greek'].filter((k) => s[k] > 0);
    if (present.length < 2) { resetLine(); return; }
    // 少数派 = 计数最小者（平局取非拉丁者，拉丁通常是主体）
    let minority = present[0];
    for (const k of present) {
      if (s[k] < s[minority] || (s[k] === s[minority] && k !== 'latin' && minority === 'latin')) minority = k;
    }
    const pos = s.first[minority] || s.first[present.find((k) => s.first[k])] || { index: i, line, col };
    const desc = present.map((k) => `${SCRIPT_TITLES[k]}×${s[k]}`).join(' + ');
    const posWidth = text.codePointAt(pos.index) > 0xFFFF ? 2 : 1;
    pushFinding({
      index: pos.index, end: pos.index + posWidth,
      cp: cpHex(text.codePointAt(pos.index)),
      cat: 'mixed_script', sub: minority, risk: 'medium',
      name: `混合文字系统混排（${desc}）`,
      line: pos.line, col: pos.col,
      context: buildContext(text, pos.index, pos.index + posWidth),
    });
    resetLine();
  }

  // NFC 归一化检查（按行；组合序列不跨行）
  const linesArr = text.split('\n');
  let lineStart = 0;
  for (let li = 0; li < linesArr.length; li++) {
    const ln = linesArr[li];
    if (ln.length > 0 && ln.normalize('NFC') !== ln) {
      const idx = lineStart + firstNfcDiffPos(ln);
      pushFinding({
        index: idx, end: idx + (text.codePointAt(idx) > 0xFFFF ? 2 : 1),
        cp: cpHex(text.codePointAt(idx)),
        cat: 'nonnormal', risk: 'low',
        name: 'NFC 未归一化序列',
        line: li + 1, col: idx - lineStart + 1,
        context: buildContext(text, idx, idx + 2),
      });
    }
    lineStart += ln.length + 1;
  }

  const riskCounts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) riskCounts[f.risk] += 1;
  const verdict = riskCounts.high > 0 ? 'high'
    : riskCounts.medium > 0 ? 'medium'
      : riskCounts.low > 0 ? 'low' : 'clean';

  let charCount = 0;
  for (const _ of text) charCount += 1; // code point 计数

  return {
    verdict,
    counts,
    riskCounts,
    findings,
    truncated,
    stats: { chars: charCount, units: text.length, lines: totalLines },
    hiddenMessages,
  };
}

/** 找到该行首个「NFC 归一化后会变化」的 code unit 位置 */
function firstNfcDiffPos(lineText) {
  const nfc = lineText.normalize('NFC');
  if (nfc === lineText) return 0;
  let k = 0;
  for (const ch of lineText) {
    const w = ch.codePointAt(0) > 0xFFFF ? 2 : 1;
    if (nfc[k] !== lineText[k]) return k;
    k += w;
    if (k > nfc.length) return 0;
  }
  return 0;
}

function isInvisibleCat(cat) {
  return cat !== 'homoglyph' && cat !== 'mixed_script' && cat !== 'nonnormal';
}

/** 上下文片段：不可见字符渲染为 {U+XXXX}，换行渲染为 ⏎ */
function buildContext(text, start, stop) {
  const from = Math.max(0, start - 24);
  const to = Math.min(text.length, stop + 24);
  let out = '';
  for (let k = from; k < to;) {
    const cp = text.codePointAt(k);
    const w = cp > 0xFFFF ? 2 : 1;
    const base = classifyBase(cp);
    if (base && isInvisibleCat(base.cat)) out += `{${cpHex(cp)}}`;
    else if (cp === 0x0A || cp === 0x0D) out += '⏎';
    else if (cp === 0x09) out += '\\t';
    else out += String.fromCodePoint(cp);
    k += w;
  }
  return out;
}

// ── 清洗 ──────────────────────────────────────────────────────────────────

/**
 * 清洗文本。策略（保守优先）：
 *   - 删除：bidi / tag / filler / zerowidth / variation / control / 非emoji上下文ZWJ
 *   - 替换为普通空格：NBSP 与 U+2000–U+200A / U+202F / U+205F
 *   - 保留：全角空格（keepIdeographicSpace，默认 true）、PUA（dropPua 才删）、
 *           emoji 上下文 ZWJ（保护 emoji 序列）、同形字（fixHomoglyph 才映射回 ASCII）
 *   - NFC 归一化：nfcNormalize 为 true 时对结果整体归一
 */
function scrubText(text, opts = {}) {
  const {
    fixHomoglyph = false,
    nfcNormalize = false,
    keepIdeographicSpace = true,
    dropPua = false,
  } = opts;
  if (typeof text !== 'string') throw new TypeError('text 必须是字符串');
  if (text.length > MAX_CHARS) throw new Error(`文本过长（${text.length} 字符，上限 ${MAX_CHARS}）`);

  /** @type {Record<string, number>} */
  const deleted = {};
  /** @type {Record<string, number>} */
  const replaced = {};
  let homoglyphFixed = 0;
  let out = '';
  let i = 0;
  let prevCp = 0;

  const bump = (map, key) => { map[key] = (map[key] || 0) + 1; };

  while (i < text.length) {
    const cp = text.codePointAt(i);
    const width = cp > 0xFFFF ? 2 : 1;
    const ch = String.fromCodePoint(cp);
    const base = classifyBase(cp);

    if (!base) { out += ch; prevCp = cp; i += width; continue; }

    switch (base.cat) {
      case 'bidi':
      case 'tag':
      case 'filler':
      case 'zerowidth':
      case 'variation':
      case 'control':
        bump(deleted, base.cat);
        break; // 删除（不追加）
      case 'zwj': {
        // emoji 序列合法成分：前或后邻 emoji 则保留；孤立 ZWJ 删除
        const nextCp = text.codePointAt(i + width);
        if (isEmojiNeighbor(prevCp) || isEmojiNeighbor(nextCp)) out += ch;
        else bump(deleted, 'zwj');
        break;
      }
      case 'replacement':
        out += ch; // 无法还原，保留并已在报告中提示
        break;
      case 'space':
        if (cp === 0x3000) {
          if (keepIdeographicSpace) out += ch;
          else { out += ' '; bump(replaced, 'space'); }
        } else {
          out += ' ';
          bump(replaced, 'space');
        }
        break;
      case 'pua':
        if (dropPua) bump(deleted, 'pua');
        else out += ch;
        break;
      case 'homoglyph':
      case 'mixed_script':
      case 'nonnormal':
        if (base.cat === 'homoglyph' && fixHomoglyph && base.suggest) {
          out += base.suggest;
          homoglyphFixed += 1;
        } else {
          out += ch;
        }
        break;
      default:
        out += ch;
    }
    prevCp = cp;
    i += width;
  }

  let normalized = false;
  if (nfcNormalize) {
    const nfc = out.normalize('NFC');
    if (nfc !== out) { out = nfc; normalized = true; }
  }

  return {
    cleaned: out,
    changed: out !== text,
    deleted,
    replaced,
    homoglyphFixed,
    normalized,
  };
}

// ── 单字符解释 ────────────────────────────────────────────────────────────

const CHAR_INFO_LIMIT = 32;

/** 逐字符解释（≤32 个 code point），供 AI/面板查单个可疑字符 */
function charInfo(text) {
  if (typeof text !== 'string') throw new TypeError('chars 必须是字符串');
  const items = [];
  let n = 0;
  for (const ch of text) {
    if (items.length >= CHAR_INFO_LIMIT) { n += 1; continue; }
    const cp = ch.codePointAt(0);
    const base = classifyBase(cp);
    if (base) {
      items.push({
        cp: cpHex(cp),
        char: ch,
        name: base.name,
        cat: base.cat,
        catTitle: CATS[base.cat].title,
        risk: CATS[base.cat].risk,
        desc: CATS[base.cat].desc,
        suggest: base.suggest || null,
        scrub: scrubActionOf(base.cat),
      });
    } else if (cp === 0x09) {
      items.push({ cp: cpHex(cp), char: ch, name: '水平制表符 Tab', cat: 'ok', catTitle: '合法字符', risk: 'none', desc: '制表符，属正常控制字符。', suggest: null, scrub: '保留' });
    } else if (cp === 0x0A) {
      items.push({ cp: cpHex(cp), char: ch, name: '换行 LF', cat: 'ok', catTitle: '合法字符', risk: 'none', desc: '换行符。', suggest: null, scrub: '保留' });
    } else {
      items.push({ cp: cpHex(cp), char: ch, name: `字符 ${ch}`, cat: 'ok', catTitle: '常规字符', risk: 'none', desc: '未检出风险类别。', suggest: null, scrub: '保留' });
    }
    n += 1;
  }
  return { items, total: n, truncated: n > CHAR_INFO_LIMIT };
}

function scrubActionOf(cat) {
  switch (cat) {
    case 'bidi': case 'tag': case 'filler': case 'zerowidth': case 'variation': case 'control': case 'zwj':
      return '清洗时删除';
    case 'replacement': return '无法还原，保留并提示';
    case 'space': return '清洗时替换为普通空格（全角空格默认保留）';
    case 'pua': return '默认保留（dropPua 选项删除）';
    case 'homoglyph': return '默认保留（fixHomoglyph 选项映射回 ASCII）';
    case 'mixed_script': case 'nonnormal': return '按行报告，不做字符级处理';
    default: return '保留';
  }
}

// ── 报告渲染（中文，AI 与面板共用） ───────────────────────────────────────

const VERDICT_LABEL = {
  clean: '✅ 干净',
  low: '🟡 低提示',
  medium: '🟠 中危',
  high: '🔴 高危（隐形注入载体检出）',
};

function renderReport(scan) {
  const lines = [];
  lines.push(`判定：${VERDICT_LABEL[scan.verdict]}`);
  lines.push(`扫描 ${scan.stats.chars} 字符（${scan.stats.lines} 行）；检出 高危 ${scan.riskCounts.high} 项 / 中危 ${scan.riskCounts.medium} 项 / 提示 ${scan.riskCounts.low} 项`);
  if (scan.truncated) lines.push('⚠️ 明细超出上限已截断（计数仍为全量）');

  for (const cat of CAT_ORDER) {
    const n = scan.counts[cat];
    if (!n) continue;
    const meta = CATS[cat];
    lines.push('');
    lines.push(`[${meta.risk === 'high' ? '高危' : meta.risk === 'medium' ? '中危' : '提示'}] ${meta.title} ×${n}`);
    lines.push(`  ${meta.desc}`);
    const sample = scan.findings.filter((f) => f.cat === cat).slice(0, 5);
    for (const f of sample) {
      lines.push(`  - 行${f.line} 列${f.col} ${f.cp}${f.name ? ` ${f.name}` : ''}｜上下文: ${f.context}`);
      if (f.hiddenMessage) lines.push(`    └ 隐藏内容解码: "${f.hiddenMessage}"`);
    }
    const rest = scan.counts[cat] - sample.length;
    if (rest > 0) lines.push(`  （另 ${rest} 处略）`);
  }

  if (scan.hiddenMessages.length) {
    lines.push('');
    lines.push(`🔍 Tag 隐形标签解码出 ${scan.hiddenMessages.length} 段隐藏内容（人眼不可见、AI 可读）——务必审查其语义：`);
    for (const m of scan.hiddenMessages.slice(0, 3)) lines.push(`  "${m}"`);
  }

  lines.push('');
  lines.push(renderAdvice(scan));
  return lines.join('\n');
}

function renderAdvice(scan) {
  const tips = [];
  if (scan.counts.bidi) tips.push('双向控制字符：代码文件中立即删除并审查该行真实逻辑（Trojan Source）；提示词/文档中一并清洗。');
  if (scan.counts.tag) tips.push('Tag 隐形标签：用清洗（scrub）删除；若解码出指令性内容，按提示词注入处置。');
  if (scan.counts.filler) tips.push('不可见填充：出现在用户名/标识符中通常为刻意构造，建议清洗后核对判重逻辑。');
  if (scan.counts.zerowidth) tips.push('零宽字符：用清洗（scrub）删除；若为自有水印可保留。');
  if (scan.counts.homoglyph) tips.push('同形异码字：scrub 加 fixHomoglyph=true 可映射回 ASCII；涉及域名/账号时人工核对。');
  if (scan.counts.mixed_script) tips.push('混排行：逐行人工确认是否刻意混入西里尔/希腊字母。');
  if (scan.counts.replacement) tips.push('U+FFFD：源文件可能不是 UTF-8，确认编码后重新导出，勿直接在替换符基础上修补。');
  if (scan.counts.nonnormal) tips.push('NFC 未归一化：scrub 加 nfcNormalize=true 统一形式。');
  if (!tips.length) tips.push('未检出风险类别，文本可放心使用。');
  return `建议：\n${tips.map((t) => `  - ${t}`).join('\n')}`;
}

// ── 专项：同形字/混排报告（身份混淆场景：用户名/域名/代码标识符） ──────────

function renderConfusablesReport(scan) {
  const h = scan.counts.homoglyph || 0;
  const m = scan.counts.mixed_script || 0;
  const nn = scan.counts.nonnormal || 0;
  const lines = [];
  const verdict = (h || m) ? '🟠 检出同形混淆风险' : nn ? '🟡 仅归一化提示' : '✅ 未检出同形混淆';
  lines.push(`判定：${verdict}`);
  lines.push(`同形异码字 ${h} 处 / 混排行 ${m} 行 / NFC 未归一化 ${nn} 行`);
  const rel = scan.findings.filter((f) => f.cat === 'homoglyph' || f.cat === 'mixed_script' || f.cat === 'nonnormal');
  for (const f of rel.slice(0, 10)) {
    lines.push(`- 行${f.line} 列${f.col} ${f.cp} ${f.name}｜上下文: ${f.context}`);
    if (f.suggest) lines.push(`  └ 建议替换为 "${f.suggest}"`);
  }
  if (rel.length > 10) lines.push(`（另 ${rel.length - 10} 处略）`);
  if (h || m) {
    lines.push('建议：域名/用户名/代码标识符场景优先人工核对；scrub 加 fixHomoglyph=true 一键映射回 ASCII。');
  } else {
    lines.push('未检出西里尔/希腊/全角/数学变体混淆。');
  }
  return lines.join('\n');
}

// ── 通用小工具 ────────────────────────────────────────────────────────────

function truncate(s, max = 60) {
  if (typeof s !== 'string') return '';
  return s.length <= max ? s : s.slice(0, max) + '…';
}

module.exports = {
  CAT_ORDER,
  CATS,
  scanText,
  scrubText,
  charInfo,
  renderReport,
  renderConfusablesReport,
  renderAdvice,
  cpHex,
  buildContext,
  truncate,
  MAX_CHARS,
  MAX_FINDINGS,
};
