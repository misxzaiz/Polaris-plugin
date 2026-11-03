'use strict';
/**
 * regex-core.js —— 正则调试台共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 语义边界（如实）：
 *   - 仅 JS RegExp 真实语义（V8 引擎实测），不做 PCRE/RE2 方言模拟。
 *   - ReDoS 检测 = 静态模式识别（有限规则、可能漏报）+ 可疑时输入长度阶梯实测复核。
 *     静态 0 命中 ≠ 绝对安全；报告如实标注局限。
 *   - JS 同步 RegExp 执行无法中断（无超时 API），因此实测阶梯只对静态可疑者进行，
 *     且阶梯长度与累计耗时设上限防挂死——这是设计约束，不是能力缺陷的掩盖。
 *
 * 分级：redos 结论 safe / caution / high（high = 静态高危或实测确认指数增长）。
 */

const MAX_TEXT_LEN = 256 * 1024; // test/replace 输入上限（同步引擎无法中断，先限输入）
const MAX_MATCHES = 500;         // 匹配明细截断护栏
const LADDER_MAX_TOTAL_MS = 800; // 实测阶梯累计耗时上限（防挂死）
const LADDER_NS = [8, 10, 12, 14, 16, 18, 20]; // 输入长度阶梯（指数回溯下步数≈2^n）

// ── flags 校验 ───────────────────────────────────────────────────────────────

/** 校验 flags（纯函数）。返回 null 或中文错误。 */
function checkFlags(flags) {
  if (flags == null || flags === '') return null;
  if (typeof flags !== 'string') return 'flags 必须是字符串';
  if (!/^[dgimsuvy]*$/.test(flags)) return `flags 含非法字符（仅允许 d g i m s u v y）：${flags}`;
  const seen = new Set();
  for (const f of flags) {
    if (seen.has(f)) return `flags 重复：${f}`;
    seen.add(f);
  }
  if (seen.has('u') && seen.has('v')) return 'u 与 v 模式互斥，不能同时使用';
  return null;
}

// ── tokenizer（宽容模式：只切分不校验语法，语法错误交给真实 RegExp 报） ──────

/**
 * 把 pattern 切成 token 序列。
 * @returns {{ tokens: Array, error: {message:string, pos:number}|null }}
 * token: { kind, raw, start, end, depth, groupKind, groupName, negated,
 *          quantMin, quantMax(Infinity 可), lazy, possessive, branchesIndex }
 * kind: char/escape/class/dot/quant/groupOpen/groupClose/anchor/alt/assertion
 */
function tokenize(pattern) {
  const src = String(pattern == null ? '' : pattern);
  const tokens = [];
  let depth = 0;
  // 组栈：记录每组 { startTokenIndex, kind, name, branchStarts:[tokenIdx...] }
  const groupStack = [];
  let i = 0;
  const push = (t) => { tokens.push(t); return tokens[tokens.length - 1]; };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n === undefined) { push({ kind: 'escape', raw: '\\', start: i, end: i + 1, depth }); i += 1; continue; }
      // \b 类内外语义不同：类外词边界、类内 backspace——解释层区分，这里记类外
      push({ kind: 'escape', raw: src.slice(i, i + 2), start: i, end: i + 2, depth, inClass: false });
      i += 2;
      continue;
    }
    if (c === '[') {
      // 字符类：Annex B 宽容——遇到未转义 ] 即结束（无 u flag 下 []] 合法）
      let j = i + 1;
      let negated = false;
      if (src[j] === '^') { negated = true; j += 1; }
      if (src[j] === ']') { j += 1; } // 首位 ] 视为字面（Annex B）
      while (j < src.length && src[j] !== ']') {
        if (src[j] === '\\') j += 1; // 跳过转义对
        j += 1;
      }
      const end = Math.min(j + 1, src.length);
      push({ kind: 'class', raw: src.slice(i, end), start: i, end, depth, negated });
      i = end;
      continue;
    }
    if (c === '(') {
      let rest = src.slice(i, i + 4);
      let groupKind = 'capture';
      let name = null;
      if (rest.startsWith('(?')) {
        if (src.startsWith('(?<', i) && src[i + 2] !== '=' && src[i + 2] !== '!') {
          // 命名组 (?<name>...)
          const close = src.indexOf('>', i + 3);
          if (close === -1) { groupKind = 'named'; name = src.slice(i + 3); }
          else { groupKind = 'named'; name = src.slice(i + 3, close); i = close + 1; }
        } else if (src.startsWith('(?!', i)) { groupKind = 'negLookahead'; }
        else if (src.startsWith('(?=', i)) { groupKind = 'lookahead'; }
        else if (src.startsWith('(?!<', i) || src.startsWith('(?<!', i)) { groupKind = 'negLookbehind'; }
        else if (src.startsWith('(?<=', i)) { groupKind = 'lookbehind'; }
        else { groupKind = 'noncapture'; }
      }
      const open = push({ kind: 'groupOpen', raw: '', start: i, end: i + 1, depth, groupKind, groupName: name });
      if (groupKind !== 'named' || name === null) { /* named 已推进 i */ }
      groupStack.push({ token: open, branchStarts: [tokens.length] });
      if (groupKind !== 'named') i += 1;
      else open.end = i; // named: i 已在 '>'
      depth += 1;
      continue;
    }
    if (c === ')') {
      depth = Math.max(0, depth - 1);
      const g = groupStack.pop();
      push({ kind: 'groupClose', raw: ')', start: i, end: i + 1, depth, groupToken: g ? g.token : null });
      if (g) g.closeIndex = tokens.length - 1;
      i += 1;
      continue;
    }
    if (c === '|') {
      const g = groupStack[groupStack.length - 1];
      if (g) g.branchStarts.push(tokens.length + 1); // 下一 token 起新分支
      push({ kind: 'alt', raw: '|', start: i, end: i + 1, depth });
      i += 1;
      continue;
    }
    if (c === '*') { push({ kind: 'quant', raw: '*', start: i, end: i + 1, depth, quantMin: 0, quantMax: Infinity }); i += 1; continue; }
    if (c === '+') { push({ kind: 'quant', raw: '+', start: i, end: i + 1, depth, quantMin: 1, quantMax: Infinity }); i += 1; continue; }
    if (c === '?') {
      // 可能是前一 token 的惰性/占有后缀（prev 是 quant 时）——宽容处理：标记
      const prev = tokens[tokens.length - 1];
      if (prev && prev.kind === 'quant' && prev.end === i) {
        // *? +? {m,n}? —— 惰性；*+ ++ +? 中 ? 在占有后无意义，按惰性记（真实语义由引擎定）
        prev.lazy = true;
        prev.raw = prev.raw + '?';
        prev.end = i + 1;
        i += 1;
        continue;
      }
      push({ kind: 'quant', raw: '?', start: i, end: i + 1, depth, quantMin: 0, quantMax: 1 });
      i += 1;
      continue;
    }
    if (c === '{') {
      // {n} {n,} {n,m}；不构成合法量词时 JS 按 Annex B 视作字面 {——宽容：匹配量词形态才记量词
      const close = src.indexOf('}', i);
      const inner = close > i ? src.slice(i + 1, close) : '';
      const m = /^(\d+)(?:,(\d*)?)?$/.exec(inner);
      if (m && close !== -1) {
        push({
          kind: 'quant', raw: src.slice(i, close + 1), start: i, end: close + 1, depth,
          quantMin: parseInt(m[1], 10),
          quantMax: m[2] === undefined ? parseInt(m[1], 10) : (m[2] === '' ? Infinity : parseInt(m[2], 10)),
        });
        i = close + 1;
        continue;
      }
      push({ kind: 'char', raw: '{', start: i, end: i + 1, depth });
      i += 1;
      continue;
    }
    if (c === '^' || c === '$') { push({ kind: 'anchor', raw: c, start: i, end: i + 1, depth }); i += 1; continue; }
    if (c === '.') { push({ kind: 'dot', raw: '.', start: i, end: i + 1, depth }); i += 1; continue; }
    push({ kind: 'char', raw: c, start: i, end: i + 1, depth });
    i += 1;
  }
  return { tokens, error: null };
}

// ── ReDoS 静态检测 ───────────────────────────────────────────────────────────

const isUnbounded = (t) => t && t.kind === 'quant' && t.quantMax === Infinity;

/**
 * 静态检测（纯函数，有限规则、可能漏报——报告如实标注）。
 * 规则：
 *  R1 nested-quantifier：组被量词修饰 且 组内某分支以无限量词结尾。
 *    分支恰为「单个元素+无限量词」（内外层可匹配同一字符 → 指数）→ high；
 *    分支末尾量词前还有强制消耗元素（如 (?:\w+:)+ 的 ':' 定界）→ caution（需实测确认）。
 *  R2 duplicate-alternation：组被量词修饰 且 两个分支规范化序列完全相同（(a|a)+）→ high。
 *  R3 quantified-lookaround：对环视施加无限量词 → caution（JS 允许但无回溯收益，纯开销）。
 *  R4 adjacent-unbounded：相邻两个无限量词（a*b* 不危险但 a[^x]*[^y]* 类需人工看）→ info。
 */
function staticRedos(tokens) {
  const rules = [];
  // 建组区间映射：groupOpen token → { closeToken, bodyStart, bodyEnd }
  const stack = [];
  const groups = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === 'groupOpen') stack.push({ open: t, openIdx: k, branchStarts: [k + 1] });
    else if (t.kind === 'alt') { const g = stack[stack.length - 1]; if (g) g.branchStarts.push(k + 1); }
    else if (t.kind === 'groupClose') {
      const g = stack.pop();
      if (g) groups.push({ open: g.open, openIdx: g.openIdx, closeIdx: k, branchStarts: g.branchStarts });
    }
  }
  for (const g of groups) {
    // 组后的量词（紧邻 groupClose）
    const q = tokens[g.closeIdx + 1];
    const outerUnbounded = isUnbounded(q);
    const outerQuantified = !!q && q.kind === 'quant';
    if (!outerQuantified) continue;
    // 组合爆炸需要组可迭代多轮：外层 max<=1（如 ? / {0,1}）时无迭代组合，不构成嵌套回溯
    // （常见合法形态 (\/\S*)? 、(https?:\/\/)? 均属此类，报了就是误报）
    if (!(q.quantMax >= 2)) continue;
    // 切分支
    const branches = [];
    for (let b = 0; b < g.branchStarts.length; b++) {
      const from = g.branchStarts[b];
      const to = b + 1 < g.branchStarts.length ? g.branchStarts[b + 1] - 1 : g.closeIdx;
      branches.push(tokens.slice(from, to));
    }
    // R2 分支完全相同（规范化 raw 拼接）
    const sigs = branches.map((bt) => bt.map((t) => t.raw).join(''));
    const dup = sigs.length >= 2 && sigs.some((s, x) => sigs.indexOf(s) !== x);
    if (dup) {
      rules.push({
        id: 'duplicate-alternation', level: outerUnbounded ? 'high' : 'caution',
        pattern: g.open.raw + '…' + q.raw,
        desc: `组内存在完全相同的分支且组可多轮迭代——回溯组合爆炸${outerUnbounded ? '（无限量词，经典 ReDoS 形态如 (a|a)+）' : '（有界量词，多项式风险）'}`,
      });
    }
    // R2b 分支前缀重叠：一分支是另一分支的前缀（(a|aa)+ 形态）——同一段输入有多种切分方式
    if (!dup && outerUnbounded && sigs.length >= 2) {
      const prefixDup = sigs.some((s, x) => s !== '' && sigs.some((t, y) => x !== y && (s.startsWith(t) || t.startsWith(s))));
      if (prefixDup) {
        rules.push({
          id: 'prefix-alternation', level: 'high',
          pattern: g.open.raw + '…' + q.raw,
          desc: `组内存在前缀重叠的分支且组被无限量词修饰——同段输入有多种切分方式，回溯组合爆炸（如 (a|aa)+，输入 a×N 即触发）`,
        });
      }
    }
    // R1 分支内存在无限量词：
    //   末尾即无限量词（内外层无定界，同字符直接叠加）→ high（(a+)+ 形态）
    //   量词后有定界元素 → caution（定界若与量词字符集互斥则安全，如 (?:\w+:)+；需实测确认）
    for (const bt of branches) {
      const qi = bt.findIndex(isUnbounded);
      if (qi === -1) continue;
      const after = bt.slice(qi + 1);
      const hasDelimiter = after.some((t) => t.kind === 'char' || t.kind === 'class' || t.kind === 'dot');
      rules.push({
        id: 'nested-quantifier',
        level: hasDelimiter ? 'caution' : 'high',
        pattern: g.open.raw + '…' + q.raw,
        desc: hasDelimiter
          ? `组被量词修饰且组内无限量词后有定界元素——若定界字符与量词字符集互斥（如 (?:\\w+:)+ 的冒号）则安全，否则指数风险；建议用实测阶梯或人工确认`
          : `组被量词修饰且分支以无限量词裸结尾——内外层可匹配同一字符，回溯组合爆炸（如 (a+)+，输入 a×N+失配尾即触发）`,
      });
    }
  }
  // R3 环视被无限量词修饰
  for (let k = 0; k < tokens.length - 1; k++) {
    const t = tokens[k];
    if ((t.kind === 'groupOpen') && /look/.test(t.groupKind || '') && isUnbounded(tokens[k + 1])) {
      rules.push({ id: 'quantified-lookaround', level: 'caution', pattern: t.raw + '…' + tokens[k + 1].raw, desc: '对环视断言施加无限量词——断言不消耗输入，量词只能原地循环，纯开销且有引擎差异风险' });
    }
  }
  // R4 相邻无限量词（info 级，宁少勿滥）
  for (let k = 0; k < tokens.length - 1; k++) {
    if (isUnbounded(tokens[k]) && isUnbounded(tokens[k + 1]) && tokens[k].depth === tokens[k + 1].depth) {
      rules.push({ id: 'adjacent-unbounded', level: 'info', pattern: tokens[k].raw + tokens[k + 1].raw, desc: '相邻两个无限量词——若两者可匹配相同字符集，长输入下有多项式回溯风险，建议人工确认字符集是否互斥' });
    }
  }
  // 去重（同 id 同 pattern 合并计数）
  const seen = new Map();
  for (const r of rules) {
    const key = r.id + '|' + r.pattern;
    if (seen.has(key)) seen.get(key).hits += 1;
    else seen.set(key, Object.assign({ hits: 1 }, r));
  }
  return Array.from(seen.values());
}

/** 由静态规则推导综合结论级 */
function staticVerdict(rules) {
  if (rules.some((r) => r.level === 'high')) return 'high';
  if (rules.some((r) => r.level === 'caution')) return 'caution';
  return 'safe';
}

// ── 实测阶梯（真实计时，非模拟） ─────────────────────────────────────────────

/**
 * 对 pattern 跑输入长度阶梯。只应在静态可疑时调用（同步 RegExp 无法中断）。
 * 触发串：'a'.repeat(n)+'b'（经典失配尾）；累计耗时超上限即停。
 * @returns {{ ladder: Array<{n:number, ms:number, growth:number}>, confirmed:boolean, note:string }}
 *   confirmed：连续两次增长比 >3 判指数特征（真实测量，非阈值模拟）。
 */
function ladderTiming(compile, opts) {
  const now = (opts && opts.now) || (() => performance.now());
  const ladder = [];
  let total = 0;
  let confirmed = false;
  let consecHigh = 0;
  for (const n of LADDER_NS) {
    if (total > LADDER_MAX_TOTAL_MS) {
      return { ladder, confirmed: true, note: `累计实测耗时超 ${LADDER_MAX_TOTAL_MS}ms 上限提前终止——本身已是危险信号` };
    }
    const input = 'a'.repeat(n) + 'b';
    const t0 = now();
    let ok = true;
    try { compile(input); } catch (_) { ok = false; }
    const ms = now() - t0;
    total += ms;
    const prev = ladder[ladder.length - 1];
    const growth = prev ? ms / Math.max(prev.ms, 0.01) : 1;
    ladder.push({ n, ms: Math.round(ms * 1000) / 1000, growth: Math.round(growth * 100) / 100, ran: ok });
    if (!ok) break;
    if (growth > 3) { consecHigh += 1; if (consecHigh >= 2) confirmed = true; }
    else consecHigh = 0;
  }
  return {
    ladder,
    confirmed,
    note: confirmed
      ? '实测耗时随输入长度指数级增长——ReDoS 实锤（真实计时，非模拟）'
      : '阶梯内未见指数增长特征；静态可疑仍建议人工评估更长输入',
  };
}

// ── 综合 redos 报告 ──────────────────────────────────────────────────────────

/**
 * @param {string} pattern
 * @param {string} flags
 * @param {{now?:Function}} opts  now 注入口（测试定格用；阶梯测量口径可注入）
 */
function analyzeRedos(pattern, flags, opts) {
  const flagErr = checkFlags(flags);
  if (flagErr) return { ok: false, error: flagErr };
  let compiled;
  try { compiled = new RegExp(String(pattern == null ? '' : pattern), flags || ''); }
  catch (e) { return { ok: false, error: `正则语法错误：${e.message}` }; }
  const { tokens } = tokenize(pattern);
  const rules = staticRedos(tokens);
  const verdict = staticVerdict(rules);
  let timing = null;
  if (verdict !== 'safe') {
    timing = ladderTiming((input) => compiled.exec(input), opts);
  }
  const finalVerdict = timing && timing.confirmed ? 'high' : verdict;
  return { ok: true, verdict: finalVerdict, rules, timing, notes: buildRedosNotes(finalVerdict, rules, timing) };
}

function buildRedosNotes(verdict, rules, timing) {
  const notes = [];
  if (rules.length === 0) notes.push('静态规则 0 命中——未识别已知 ReDoS 形态；但静态检测有限规则、可能漏报，不等于绝对安全。');
  if (timing) notes.push(timing.note);
  if (verdict === 'high') notes.push('建议：不要用该 pattern 处理不可信长输入；改写思路——用占有量词（V8 支持 x++ 形态需 u/v flag）、削减嵌套、用更窄字符类代替 [.\\s\\S]。');
  if (verdict === 'caution') notes.push('建议：用接近真实的恶意样例（重复前缀+失配尾）自测一次再上线。');
  return notes;
}

// ── test（匹配测试） ─────────────────────────────────────────────────────────

/** 执行匹配（纯计算）。返回结构化结果或 { ok:false, error }。 */
function runMatch(pattern, flags, text) {
  const flagErr = checkFlags(flags);
  if (flagErr) return { ok: false, error: flagErr };
  if (typeof text !== 'string') return { ok: false, error: 'text 必须是字符串' };
  if (text.length > MAX_TEXT_LEN) return { ok: false, error: `文本过大（${text.length} 字符 > ${MAX_TEXT_LEN}），请截取后测试` };
  let re;
  try { re = new RegExp(String(pattern == null ? '' : pattern), flags || ''); }
  catch (e) {
    // 定位语法错误附近的 token（宽容 tokenizer 的视角，仅供参考）
    return { ok: false, error: `正则语法错误：${e.message}` };
  }
  const t0 = performance.now();
  const matches = [];
  const isGlobal = re.global;
  if (isGlobal) {
    for (const m of text.matchAll(re)) {
      matches.push(packMatch(m));
      if (matches.length >= MAX_MATCHES) break;
    }
  } else {
    const m = re.exec(text);
    if (m) matches.push(packMatch(m));
  }
  const ms = Math.round((performance.now() - t0) * 1000) / 1000;
  return {
    ok: true,
    matchCount: matches.length,
    truncated: isGlobal && matches.length >= MAX_MATCHES,
    singleNote: isGlobal ? null : '未加 g flag：只报告第一个匹配（JS 语义如此，非截断）',
    elapsedMs: ms,
    matches,
  };
}

function packMatch(m) {
  const groups = [];
  if (m.length > 1) for (let i = 1; i < m.length; i++) groups.push(m[i] === undefined ? null : m[i]);
  return {
    index: m.index,
    end: m.index + m[0].length,
    text: m[0],
    groups,
    named: m.groups ? Object.assign({}, m.groups) : null,
  };
}

// ── replace（替换预览） ──────────────────────────────────────────────────────

function runReplace(pattern, flags, replacement, text) {
  const base = runMatch(pattern, flags, text);
  if (!base.ok) return base;
  if (typeof replacement !== 'string') return { ok: false, error: 'replacement 必须是字符串（$1 / $<name> 按 JS 原生语义透传）' };
  let re;
  try { re = new RegExp(String(pattern), flags || ''); } catch (e) { return { ok: false, error: e.message }; }
  const result = text.replace(re, replacement);
  return { ok: true, replaceCount: base.matchCount, result };
}

// ── explain（逐 token 中文解释） ─────────────────────────────────────────────

const ESCAPE_MEANINGS = {
  '\\d': '数字 [0-9]', '\\D': '非数字', '\\w': '词字符 [A-Za-z0-9_]', '\\W': '非词字符',
  '\\s': '空白（含空格/制表/换行等）', '\\S': '非空白', '\\b': '词边界（类外）', '\\B': '非词边界',
  '\\n': '换行 LF', '\\r': '回车 CR', '\\t': '制表 Tab', '\\0': 'NUL (U+0000)',
  '\\f': '换页 FF', '\\v': '垂直制表 VT', '\\k': '命名组反向引用 \\k<name>',
};

function explainToken(t) {
  switch (t.kind) {
    case 'char': return { raw: t.raw, meaning: `字面字符 ${t.raw}` };
    case 'escape': {
      if (ESCAPE_MEANINGS[t.raw]) return { raw: t.raw, meaning: ESCAPE_MEANINGS[t.raw] };
      if (/^\\u\{[0-9a-fA-F]+\}$/.test(t.raw)) return { raw: t.raw, meaning: `Unicode 码点转义（需 u/v flag）` };
      if (/^\\u[0-9a-fA-F]{4}$/.test(t.raw)) return { raw: t.raw, meaning: `Unicode 转义 U+${t.raw.slice(2).toUpperCase()}` };
      if (/^\\x[0-9a-fA-F]{2}$/.test(t.raw)) return { raw: t.raw, meaning: `十六进制转义 U+00${t.raw.slice(2).toUpperCase()}` };
      if (/^\\[1-9]/.test(t.raw)) return { raw: t.raw, meaning: `反向引用第 ${t.raw[1]} 个捕获组` };
      if (t.raw === '\\p' || t.raw === '\\P') return { raw: t.raw, meaning: `Unicode 属性类 ${t.raw}{...}（需 u/v flag）` };
      if (t.raw === '\\c') return { raw: t.raw, meaning: '控制字符转义 \\cX' };
      return { raw: t.raw, meaning: `字面字符 ${t.raw.slice(1)}（转义）` };
    }
    case 'class': {
      const neg = t.negated ? '（取反：不匹配其中任何一个）' : '';
      return { raw: t.raw, meaning: `字符类：匹配其中任意一个字符${neg}；注意类内 \\b 是退格符不是词边界` };
    }
    case 'dot': return { raw: '.', meaning: '任意字符（除行终止符；s flag 下含行终止符）' };
    case 'anchor': return { raw: t.raw, meaning: t.raw === '^' ? '行首锚点（m flag 下每行行首）' : '行尾锚点（m flag 下每行行尾）' };
    case 'quant': {
      const q = t.quantMax === Infinity
        ? `重复 ${t.quantMin} 次或更多`
        : (t.quantMin === t.quantMax ? `恰好重复 ${t.quantMin} 次` : `重复 ${t.quantMin} 到 ${t.quantMax} 次`);
      const mode = t.lazy ? '（惰性：尽量少匹配）' : (t.possessive ? '（占有：不回溯）' : '（贪婪：尽量多匹配，可回溯）');
      return { raw: t.raw, meaning: `量词：${q}${mode}${t.quantMax === Infinity ? '；无限量词是 ReDoS 回溯风险的参与要素' : ''}` };
    }
    case 'groupOpen': {
      const k = t.groupKind;
      if (k === 'capture') return { raw: '(', meaning: '捕获组开始（序号按左括号计，$1 可引用）' };
      if (k === 'named') return { raw: `(?<${t.groupName}>`, meaning: `命名捕获组「${t.groupName}」开始（$<${t.groupName}> / m.groups.${t.groupName} 引用）` };
      if (k === 'noncapture') return { raw: '(?:', meaning: '非捕获组开始（只分组不捕获，不占组号）' };
      if (k === 'lookahead') return { raw: '(?=', meaning: '顺序环视开始：右侧必须能匹配，但不消耗输入' };
      if (k === 'negLookahead') return { raw: '(?!', meaning: '否定顺序环视开始：右侧必须不能匹配，不消耗输入' };
      if (k === 'lookbehind') return { raw: '(?<=', meaning: '逆序环视开始：左侧必须能匹配，不消耗输入' };
      if (k === 'negLookbehind') return { raw: '(?<!', meaning: '否定逆序环视开始：左侧必须不能匹配，不消耗输入' };
      return { raw: '(', meaning: '组开始' };
    }
    case 'groupClose': return { raw: ')', meaning: '组结束' };
    case 'alt': return { raw: '|', meaning: '分支交替：左右任一匹配即可（分支重叠+外层量词是 ReDoS 高危形态）' };
    default: return { raw: t.raw, meaning: '（未知构造）' };
  }
}

/** 逐 token 解释列表（附组深度，便于面板缩进展示） */
function explain(pattern, flags) {
  const flagErr = checkFlags(flags);
  if (flagErr) return { ok: false, error: flagErr };
  // 真实编译一次：语法错误如实报（tokenizer 是宽容模式，不背书语法）
  try { new RegExp(String(pattern == null ? '' : pattern), flags || ''); }
  catch (e) { return { ok: false, error: `正则语法错误：${e.message}（以下解释不可用）` }; }
  const { tokens } = tokenize(pattern);
  const items = [];
  for (const t of tokens) {
    const ex = explainToken(t);
    items.push({ depth: t.depth, raw: ex.raw, meaning: ex.meaning });
  }
  return { ok: true, tokenCount: items.length, items };
}

// ── 渲染（MCP 与面板共用的中文报告口径） ─────────────────────────────────────

const VERDICT_LABELS = { safe: '安全', caution: '需注意', high: '高危' };

function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function renderRedosReport(r) {
  const lines = [`ReDoS 结论：${VERDICT_LABELS[r.verdict] || r.verdict}（${r.verdict}）`];
  if (r.rules.length === 0) lines.push('静态规则 0 命中');
  for (const rule of r.rules) {
    lines.push(`- [${rule.level}] ${rule.id}${rule.hits > 1 ? ` ×${rule.hits}` : ''}：${rule.desc}（形态 ${rule.pattern}）`);
  }
  if (r.timing) {
    const ladder = r.timing.ladder.map((l) => `n=${l.n}:${fmt(l.ms)}ms${l.growth > 1 ? `（×${fmt(l.growth)}）` : ''}`).join(' ');
    lines.push(`实测阶梯：${ladder}`);
    lines.push(`实测结论：${r.timing.note}`);
  }
  for (const n of r.notes) lines.push(n);
  return lines.join('\n');
}

function renderTestReport(r) {
  const lines = [`匹配 ${r.matchCount} 处，耗时 ${fmt(r.elapsedMs)}ms${r.truncated ? `（明细截断至 ${MAX_MATCHES} 条）` : ''}`];
  if (r.singleNote) lines.push(r.singleNote);
  for (const m of r.matches.slice(0, 20)) {
    const g = m.groups.length ? `，捕获组 [${m.groups.map((x) => (x === null ? '∅' : JSON.stringify(x))).join(', ')}]` : '';
    const nm = m.named && Object.keys(m.named).length ? `，命名组 ${JSON.stringify(m.named)}` : '';
    lines.push(`- @${m.index}..${m.end} ${JSON.stringify(m.text)}${g}${nm}`);
  }
  if (r.matches.length > 20) lines.push(`（另 ${r.matches.length - 20} 条略）`);
  return lines.join('\n');
}

function renderReplaceReport(r) {
  return `替换 ${r.replaceCount} 处，结果：\n${r.result}`;
}

function renderExplainReport(r) {
  const lines = [`共 ${r.tokenCount} 个构造：`];
  for (const it of r.items) {
    lines.push(`${'  '.repeat(it.depth)}- ${JSON.stringify(it.raw)} → ${it.meaning}`);
  }
  return lines.join('\n');
}

module.exports = {
  MAX_TEXT_LEN, MAX_MATCHES, LADDER_NS,
  checkFlags, tokenize, staticRedos, staticVerdict, ladderTiming,
  analyzeRedos, runMatch, runReplace, explain,
  VERDICT_LABELS,
  renderRedosReport, renderTestReport, renderReplaceReport, renderExplainReport,
};
