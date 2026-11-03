'use strict';
/**
 * yaml-core.js —— YAML 调试台共享核心（单一权威，运行时零依赖、零 node 内置模块）。
 * 被 MCP server（esbuild bundle）与面板（browser bundle）共用。
 *
 * 职责（解析基座 js-yaml 4.1.0 由宿主侧各自引入，本文件不 require 任何解析器）：
 *  1. lintYaml：行状态机静态扫描 —— 坑检测（跨实现语义漂移 / 数据变形 / 解析失败风险）
 *     + 锚点别名清单 + 文档统计。
 *  2. jsonSafe：js-yaml load 产物的 JSON 安全化（.inf/.nan/Date → 字符串）。
 *     依据：实测 js-yaml 4.1.0 load('a: .inf') 返回 Infinity，JSON.stringify 静默变 null。
 *  3. normalizeYamlError：js-yaml 异常 → 结构化错误（1 基行列；e.mark 是 0 基，实测确认）。
 *
 * 行为差异参照（2026-11-04 实测 js-yaml 4.1.0 + YAML 1.1/1.2 文档语义）：
 *  - YAML 1.2 core（js-yaml 4 默认）：no/on/off → 字符串；02134 → 十进制 2134；12:34:56 → 字符串
 *  - YAML 1.1（PyYAML / Go yaml.v2 / Ansible / kubectl 生态）：no/on/off → 布尔；
 *    02134 → 八进制 1116；12:34:56 → 整数 45296
 *
 * 边界（如实声明）：不做领域 schema 校验；跨行 flow 集合内的重复键不检测（解析器抛错兜底）；
 * 跨行引用续行只做注释/智能引号检查；多行纯标量续行按独立标量检查规则（无键语义）。
 */

const MAX_SAFE = 9007199254740991; // 2^53-1，js-yaml 大整数以 double 解析必丢精度（实测 9007199254740993→…992）

// YAML 1.1 布尔词三态形式（PyYAML resolver 实际集合，大小写敏感）
const BOOL11_WARN = new Set();
for (const w of ['yes', 'no', 'on', 'off']) {
  BOOL11_WARN.add(w);
  BOOL11_WARN.add(w[0].toUpperCase() + w.slice(1));
  BOOL11_WARN.add(w.toUpperCase());
}
// 单字母 y/n：YAML 1.1 收录、PyYAML 5.1+ 已弃用单字母形式，仅部分实现认作布尔 → 降为 info
const BOOL11_SINGLE = new Set(['y', 'Y', 'n', 'N']);

const SMART_QUOTE_RE = /[\u201C\u201D\u2018\u2019]/;
const NULL_TOKENS = new Set(['~']);

/** 首个智能引号（全角/排版引号）的位置，无则 -1 */
function findSmartQuote(s) {
  const m = SMART_QUOTE_RE.exec(s);
  return m ? m.index : -1;
}

/** 计算整数 token 的六十进制值（调用方保证已匹配 sexagesimal 形态），如 12:34:56 → 45296 */
function sexagesimalToInt(s) {
  const neg = s[0] === '-';
  const body = s.replace(/^[-+]/, '');
  const parts = body.split(':').map((p) => parseInt(p.replace(/_/g, ''), 10));
  let v = 0;
  for (const p of parts) v = v * 60 + p;
  return neg ? -v : v;
}

/** 前导零整数的 YAML 1.1 八进制值（如 0755 → 493；含 8/9 数字则八进制非法返回 null） */
function octalValue(s) {
  const body = s.replace(/^[-+]/, '').replace(/_/g, '');
  if (/[^0-7]/.test(body)) return null;
  const v = parseInt(body, 8);
  return Number.isNaN(v) ? null : v;
}

/** 行内引用/注释切分：返回 {code, comment, openQuote}（openQuote 表示行尾引用未闭合） */
function splitComment(content) {
  let q = null;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (q === "'" && c === "'" && content[i + 1] === "'") { i++; continue; } // '' 转义
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; continue; }
    // YAML 规范：# 只在行首或空白之后开启注释（http://x#f 安全）
    if (c === '#' && (i === 0 || content[i - 1] === ' ' || content[i - 1] === '\t')) {
      return { code: content.slice(0, i), comment: content.slice(i), openQuote: false };
    }
  }
  return { code: content, comment: '', openQuote: q };
}

/** 解开一对闭合引号 token 的内层（处理 \" 与 '' 转义） */
function unquoteToken(tok) {
  const q = tok[0];
  if (tok.length >= 2 && tok.endsWith(q) && (q === '"' || q === "'")) {
    let inner = tok.slice(1, -1);
    inner = q === '"' ? inner.replace(/\\(["\\])/g, '$1') : inner.replace(/''/g, "'");
    return inner;
  }
  return tok;
}

/** 统计行内 flow 括号深度（引用内不计），正值表示行尾 flow 未闭合 */
function flowDepth(s) {
  let depth = 0;
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return depth;
}

/** 单行 flow 映射内键抽取（用于 {a:1, a:2} 重复键检测） */
function flowMapKeys(s) {
  const keys = [];
  const re = /[{,]\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^:{}\[\],]+?))\s*:/g;
  let m;
  while ((m = re.exec(s)) !== null) keys.push({ name: m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3].trim()), col: m.index + 1 });
  return keys;
}

/** JSON 安全化：Infinity/NaN → '.inf'/'.nan' 字符串、Date → ISO 字符串（JSON.stringify 对二者分别静默产出 null / ISO） */
function jsonSafe(value) {
  if (typeof value === 'number') {
    if (value === Infinity) return '.inf';
    if (value === -Infinity) return '-.inf';
    if (Number.isNaN(value)) return '.nan';
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = jsonSafe(value[k]);
    return out;
  }
  return value;
}

/** js-yaml 异常 → {line, column, message, hint?}（行列转 1 基展示） */
function normalizeYamlError(e) {
  const line = e && e.mark && typeof e.mark.line === 'number' ? e.mark.line + 1 : null;
  const column = e && e.mark && typeof e.mark.column === 'number' ? e.mark.column + 1 : null;
  const reason = (e && e.reason) || (e && e.message && String(e.message).split('\n')[0]) || '未知解析错误';
  let hint = '';
  if (/duplicated mapping key/.test(reason)) {
    hint = '重复键：多数解析器（js-yaml / Go yaml.v3 strict）直接拒绝，另一些静默覆盖——键语义未定义，改键名或删掉后者。';
  } else if (/tab characters/.test(reason)) {
    hint = 'YAML 缩进只允许空格；把缩进里的 Tab 换成空格（常见于从终端/编辑器复制粘贴）。';
  } else if (/unidentified alias/.test(reason)) {
    hint = '别名 *name 需要先在同一文档中定义同名锚点 &name（且定义在引用之前）。';
  } else if (/flow collection/.test(reason)) {
    hint = 'flow 集合（{...} / [...]）没有闭合，检查是否缺了收尾括号。';
  } else if (/could not find expected/.test(reason)) {
    hint = '标量形态不完整：常见于缺空格（key:value）、引号未闭合或缩进错位。';
  }
  return { line, column, message: reason, hint };
}

/**
 * 静态扫描主入口。返回：
 * { issues:[{rule,severity,line,col,message,hint}], anchors:[{name,line,col,doc}],
 *   aliases:[{name,line,col,doc,resolved}], merges:number, docs:number, stats:{lines,bytes} }
 * severity：'error'（大概率解析失败/键语义未定义）、'warn'（跨实现漂移或数据变形）、'info'（语义说明）。
 */
function lintYaml(text) {
  const issues = [];
  const seen = new Set();
  const push = (rule, severity, line, col, message, hint) => {
    const key = `${rule}|${line}|${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ rule, severity, line, col, message, hint: hint || '' });
  };

  const bom = typeof text === 'string' && text.charCodeAt(0) === 0xfeff;
  if (bom) push('bom', 'info', 1, 1, '文件以 BOM 开头', '多数实现兼容，但规范不建议；建议保存为 UTF-8 无 BOM。');
  const body = bom ? text.slice(1) : String(text == null ? '' : text);
  const lines = body.split(/\r\n|\r|\n/);
  const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(body).length : body.length;

  const anchors = []; // {name,line,col,doc}
  const aliases = []; // {name,line,col,doc,resolved}
  let merges = 0;
  let docIdx = 0;
  const anchorNamesByDoc = new Map(); // doc -> Set(name)
  anchorNamesByDoc.set(0, new Set());

  let scopes = []; // 块映射键作用域栈 [{indent, keys:Set}]
  let quote = null; // 跨行引用 {type:'"'|"'"}
  let block = null; // 块标量 {parentIndent, contentIndent:number|null}
  let flowCarry = false; // 跨行 flow 集合
  let firstContentLineOfDoc = 0;

  for (let li = 0; li < lines.length; li++) {
    const lineNo = li + 1;
    const raw = lines[li];

    // —— 块标量内容：原样数据，一切规则不适用 ——
    if (block) {
      if (/^\s*$/.test(raw)) continue;
      const ind = (/(^[ \t]*)/.exec(raw) || ['', ''])[1].length;
      if (block.contentIndent === null) {
        if (ind > block.parentIndent) { block.contentIndent = ind; continue; }
        block = null; // 无内容行 → 回落按普通行处理
      } else if (ind >= block.contentIndent) {
        continue;
      } else {
        block = null;
      }
    }

    // —— 跨行引用续行：只查智能引号，不查键/注释规则 ——
    if (quote) {
      let i = 0;
      let closed = -1;
      while (i < raw.length) {
        const c = raw[i];
        if (quote === '"' && c === '\\') { i += 2; continue; }
        if (quote === "'" && c === "'" && raw[i + 1] === "'") { i += 2; continue; }
        if (c === quote) { closed = i; break; }
        i++;
      }
      if (closed === -1) continue;
      quote = null;
      // 引号闭合后同一行剩余部分按普通内容继续（罕见形态，只做保守检查）
      const restLine = raw.slice(closed + 1);
      const sq = findSmartQuote(restLine);
      if (sq !== -1) push('smart-quote', 'error', lineNo, closed + 2 + sq, '智能引号（“”‘’）不是 YAML 引号', '它们会成为字符串数据的一部分；本意是加引号请用 ASCII 半角引号。');
      continue;
    }

    // —— 跨行 flow：只做注释切分与智能引号检查 ——
    if (flowCarry) {
      const { code } = splitComment(raw);
      const sq = findSmartQuote(code);
      if (sq !== -1) push('smart-quote', 'error', lineNo, sq + 1, '智能引号（“”‘’）不是 YAML 引号', '它们会成为字符串数据的一部分；本意是加引号请用 ASCII 半角引号。');
      if (flowDepth(code) <= 0) flowCarry = false;
      continue;
    }

    // —— 制表符缩进（YAML 禁止）——
    const ws = (/(^[ \t]*)/.exec(raw) || ['', ''])[1];
    const tabIdx = ws.indexOf('\t');
    const trimmedFull = raw.trim();
    if (trimmedFull !== '' && tabIdx !== -1) {
      push('tab-indent', 'error', lineNo, tabIdx + 1, '缩进包含制表符 Tab', 'YAML 禁止 Tab 缩进（只允许空格）；编辑器「Tab 转空格」或替换粘贴残留。');
    }
    if (trimmedFull === '' || trimmedFull.startsWith('#')) {
      if (trimmedFull !== '') firstContentLineOfDoc = firstContentLineOfDoc; // 纯注释行不计
      continue;
    }

    const contentStart = raw.length - raw.replace(/^\s+/, '').length;
    const content = trimmedFull;

    // —— 文档边界 ——
    if (content === '---' || content.startsWith('--- ')) {
      docIdx++;
      anchorNamesByDoc.set(docIdx, new Set());
      scopes = [];
      firstContentLineOfDoc = 0;
      continue;
    }
    if (content === '...') continue;

    const { code, comment } = splitComment(content);
    if (code.trim() === '') {
      // 整行是注释，无动作
      continue;
    }
    if (firstContentLineOfDoc === 0) firstContentLineOfDoc = lineNo;

    // —— 智能引号（代码部分）——
    const sqIdx = findSmartQuote(code);
    if (sqIdx !== -1) {
      push('smart-quote', 'error', lineNo, contentStart + sqIdx + 1, '智能引号（“”‘’）不是 YAML 引号', '它们会成为字符串数据的一部分（实测 js-yaml：a: “x” → "“x”"）；本意是加引号请用 ASCII 半角引号。');
    }

    // —— 指令行（% 必须在文档首行）——
    if (code[0] === '%') {
      if (!/^%(YAML|TAG)\b/.test(code) || firstContentLineOfDoc !== lineNo) {
        push('percent-middoc', 'error', lineNo, contentStart + 1, '「%」开头的内容只在文档首行作为指令（%YAML/%TAG）合法', '普通数据以 % 开头必须加引号。');
      }
      continue;
    }

    // —— 剥离序列短横（支持嵌套 `- - a`）——
    let rest = code;
    let colBase = contentStart;
    let dashCount = 0;
    for (;;) {
      const m = /^(-\s+|-\s*$)/.exec(rest);
      if (!m) break;
      if (m[0] === '-' && rest.trim() === '-') { rest = ''; break; }
      colBase += m[0].length;
      rest = rest.slice(m[0].length);
      dashCount++;
      if (m[0].trimEnd() === '-' && rest.trim() === '') { rest = ''; break; }
    }
    if (rest.trim() === '') continue;

    // —— 键值对形态 ——
    const keyRe = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^:\s#"'][^:#]*?)\s*:(?:\s+|$)/;
    const km = keyRe.exec(rest);
    if (km) {
      const keyTok = km[1];
      const keyQuoted = keyTok[0] === '"' || keyTok[0] === "'";
      const keyName = keyQuoted ? unquoteToken(keyTok) : keyTok.trim();
      const keyCol = colBase + 1; // 键起始列（1 基）
      const valuePart = rest.slice(km[0].length).replace(/^[ \t]+/, '');
      const valueCol = colBase + km[0].length + (rest.slice(km[0].length).length - rest.slice(km[0].length).replace(/^[ \t]+/, '').length) + 1;

      // 重复键作用域：序列项（dashCount>0）在进入时弹出 >= keyCol 的作用域（不同列表项是不同映射）
      const popGE = dashCount > 0 ? keyCol : keyCol + 1;
      while (scopes.length && scopes[scopes.length - 1].indent >= popGE) scopes.pop();
      let top = scopes[scopes.length - 1];
      if (!top || top.indent !== keyCol) {
        top = { indent: keyCol, keys: new Set() };
        scopes.push(top);
      }
      if (!keyQuoted && top.keys.has(keyName)) {
        push('dup-key', 'error', lineNo, keyCol, `重复键「${keyName}」（同层已出现过）`, '多数解析器拒绝或静默覆盖，键语义未定义；改键名或删掉后者。');
      }
      top.keys.add(keyName);

      if (keyName === '<<') {
        merges++;
        push('merge-key', 'info', lineNo, keyCol, '合并键「<<」：把锚点映射的键并入当前映射（本映射同名键优先）', '等价展开由解析器完成；改用显式键可读性更好。js-yaml DEFAULT_SCHEMA 支持该语义（实测）。');
      }

      if (valuePart === '') {
        push('empty-value', 'info', lineNo, keyCol, `键「${keyName}」的值为空 → 解析为 null`, comment ? '冒号后直接跟注释也是 null；要空字符串请写 key: \'\'。' : '要空字符串请写 key: \'\'；null 与空串在下游判断（if key: / != ""）里行为不同。');
      } else {
        // 值非空且其后跟注释：# 会吞掉其后的内容（实测 js-yaml：cmd: echo # x → "echo"）
        if (comment) {
          const vTrim = valuePart.trim();
          if (vTrim[0] !== '"' && vTrim[0] !== "'") {
            const hashOffset = content.length - comment.length; // 0 基 # 位置
            push('comment-swallow', 'info', lineNo, contentStart + hashOffset + 1, `「#」从这里开始是注释：注释内容不会进入数据（值 = ${vTrim}）`, '要保留值中的 #，请给值加引号（实测 a: "x # y" → "x # y"）。');
          }
        }
        applyValue(valuePart, valueCol, lineNo, keyCol, false);
      }
      continue;
    }

    // —— 独立标量 / flow 行 ——
    const token = rest.trim();
    const tokenCol = colBase + (rest.length - rest.replace(/^\s+/, '').length) + 1;
    if (token[0] === '{' || token[0] === '[') {
      // 单行 flow：重复键检测；行尾未闭合 → 进入跨行 flow
      const singleLine = token[0] === '{' && token.endsWith('}');
      if (singleLine) {
        const fkeys = flowMapKeys(token);
        const fseen = new Map();
        for (const k of fkeys) {
          if (fseen.has(k.name)) push('dup-key', 'error', lineNo, tokenCol + k.col - 1, `flow 映射内重复键「${k.name}」`, '解析器会直接抛错（实测 js-yaml：duplicated mapping key 带行列）。');
          fseen.set(k.name, true);
        }
      }
      if (flowDepth(token) > 0) flowCarry = true;
      continue;
    }
    applyValue(token, tokenCol, lineNo, null, true);

    // —— 值/标量规则 ——
    function applyValue(tokenRaw, tokCol, lineNo, keyCol, standalone) {
      const tok = tokenRaw.trim();
      if (tok === '') return;

      // 单行 flow 映射值（a: {x: 1, x: 2}）：重复键检测（解析器同样抛错，实测确认）
      if (tok[0] === '{' && tok.endsWith('}')) {
        const fkeys = flowMapKeys(tok);
        const fseen = new Set();
        for (const k of fkeys) {
          if (fseen.has(k.name)) push('dup-key', 'error', lineNo, tokCol + k.col - 1, `flow 映射内重复键「${k.name}」`, '解析器会直接抛错（实测 js-yaml：duplicated mapping key 带行列）。');
          fseen.add(k.name);
        }
        if (flowDepth(tok) > 0) flowCarry = true;
        return;
      }

      // 闭合/未闭合引用
      if (tok[0] === '"' || tok[0] === "'") {
        const q = tok[0];
        let i = 1;
        let closed = false;
        while (i < tok.length) {
          const c = tok[i];
          if (q === '"' && c === '\\') { i += 2; continue; }
          if (q === "'" && c === "'" && tok[i + 1] === "'") { i += 2; continue; }
          if (c === q) { closed = true; break; }
          i++;
        }
        if (!closed) { quote = q; return; }
        return; // 闭合引用：内层数据合法，规则不适用
      }

      // 块标量指示符（| 与 >）。父缩进：键形态取键位（内容须比键更缩进）；
      // 独立序列项形态取短横位+1（节点缩进=横位+2，内容须 ≥ 横位+2）
      if (/^[|>][0-9]*[+-]?$/.test(tok) || /^[|>][+-]?[0-9]*$/.test(tok)) {
        block = { parentIndent: keyCol !== null ? keyCol - 1 : tokCol - 2, contentIndent: null };
        return;
      }

      // 保留字符：不能作为纯标量开头
      if (tok[0] === '`' || tok[0] === '@') {
        push('reserved-char', 'error', lineNo, tokCol, `「${tok[0]}」是 YAML 保留字符，不能作为标量开头`, '加引号可表达字面量（如 \'`cmd`\'）。');
        return;
      }

      // 别名
      if (tok[0] === '*') {
        const am = /^[\w.-]+/.exec(tok.slice(1));
        const name = am ? am[0] : tok.slice(1);
        const anchor = anchors.find((a) => a.doc === docIdx && a.name === name && (a.line < lineNo || (a.line === lineNo && a.col < tokCol)));
        aliases.push({ name, line: lineNo, col: tokCol, doc: docIdx, resolved: !!anchor });
        if (!anchor) push('unresolved-alias', 'error', lineNo, tokCol, `别名 *${name} 没有前置同名锚点`, '解析器会抛错（实测 js-yaml：unidentified alias 带行列）；确认锚点名拼写与顺序。');
        return;
      }

      // 锚点
      if (tok[0] === '&') {
        const am = /^[\w.-]+/.exec(tok.slice(1));
        const name = am ? am[0] : tok.slice(1);
        const set = anchorNamesByDoc.get(docIdx);
        if (set.has(name)) push('anchor-dup', 'warn', lineNo, tokCol, `锚点 &${name} 在同一文档内重复定义`, '引用解析到最近一个定义；重名易误读，建议改名。');
        else set.add(name);
        anchors.push({ name, line: lineNo, col: tokCol, doc: docIdx });
        const remainder = tok.slice(1 + name.length).trim();
        if (remainder !== '') applyValue(remainder, tokCol + 1 + name.length, lineNo, keyCol, standalone);
        return;
      }

      // 显式 tag：值语义被覆盖，规则不适用
      if (tok[0] === '!') return;

      // 智能引号已在行级检查；此处查纯标量的值形态规则
      if (BOOL11_WARN.has(tok)) {
        push('bool-lookalike', 'warn', lineNo, tokCol, `「${tok}」在本工具（YAML 1.2 core）解析为字符串 "${tok}"，但 PyYAML / Go yaml.v2 / Ansible / kubectl 等 YAML 1.1 实现解析为布尔 ${tok.toLowerCase() === 'no' || tok.toLowerCase() === 'off' ? 'false' : 'true'}`, '这是「Norway problem」：同一份文件在不同实现里类型相反。要固定为字符串请加引号；要固定为布尔请写 true/false。');
        return;
      }
      if (BOOL11_SINGLE.has(tok)) {
        push('bool-single', 'info', lineNo, tokCol, `单字母「${tok}」在 YAML 1.1 规范里是布尔，但 PyYAML 5.1+ 已弃用单字母形式（按字符串）`, '多数现代实现按字符串处理；跨实现稳定请加引号或写全词。');
        return;
      }
      if (/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+$/.test(tok)) {
        const v = sexagesimalToInt(tok);
        push('sexagesimal', 'warn', lineNo, tokCol, `「${tok}」是 YAML 1.1 六十进制数字：PyYAML 等解析为整数 ${v}，本工具（1.2 core）解析为字符串`, '时间/比分类字符串务必加引号——旧实现里 12:34:56 会静默变成 45296。');
        return;
      }
      if (/^[-+]?0[0-9_]+$/.test(tok)) {
        const oct = octalValue(tok);
        push('leading-zero', 'warn', lineNo, tokCol, `前导零数字「${tok}」：YAML 1.1（PyYAML）按八进制解析为 ${oct === null ? '（含 8/9，八进制非法，部分实现报错）' : oct}，本工具（1.2 core）按十进制 ${parseInt(tok.replace(/^[-+]/, '').replace(/_/g, ''), 10)} 解析`, '文件权限（0755）、区号、编号类值务必加引号。');
        return;
      }
      if (/^[-+]?[0-9][0-9_]*\.[0-9]*0$/.test(tok)) {
        push('float-form', 'warn', lineNo, tokCol, `「${tok}」解析为数值 ${parseFloat(tok.replace(/_/g, ''))}——尾零丢失（1.10 → 1.1）`, '版本号、金额、编号请加引号保留书写形态。');
        return;
      }
      if (/^[-+]?[0-9][0-9_]*$/.test(tok)) {
        // 判据用 Number 阈值而非位数启发式：>2^53-1 的整数经 double 舍入后仍 > 2^53-1，
        // 而 16 位的 2^53-1 本体（9007199254740991）是安全整数不该误报（测试锁定）
        if (Number(tok.replace(/_/g, '')) > MAX_SAFE) {
          push('big-int', 'warn', lineNo, tokCol, `整数「${tok}」超过 JS 安全整数 2^53-1，js-yaml 按双精度浮点解析必然丢精度（实测 9007199254740993 → 9007199254740992）`, '雪花 ID / 订单号 / 纳秒时间戳请加引号按字符串传输。');
          return;
        }
      }
      if (/^[-+]?[0-9][0-9_]*(\.[0-9_]+)?[eE][-+]?[0-9]+$/.test(tok)) {
        push('sci-note', 'info', lineNo, tokCol, `「${tok}」被解析为数值 ${Number(tok.replace(/_/g, ''))}（科学计数法生效）`, '要保留书写形态请加引号。');
        return;
      }
      if (/^[-+]?\.(inf|Inf|INF)$/.test(tok) || /^\.(nan|NaN|NAN)$/.test(tok)) {
        push('special-float', 'info', lineNo, tokCol, `「${tok}」解析为非有限浮点数（${tok.endsWith('nan') || tok.endsWith('NaN') || tok.endsWith('NAN') ? 'NaN' : tok[0] === '-' ? '-Infinity' : 'Infinity'}）`, 'JSON 没有对应字面量，序列化会变 null（本工具预览已按字符串呈现）。');
        return;
      }
      if (/^[-+]?\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.test(tok)) {
        push('timestamp', 'info', lineNo, tokCol, `「${tok}」被识别为时间戳：js-yaml 默认解析为 Date 对象（JSON 序列化成 ISO 字符串）`, '编号/版本类「长得像日期」的值（如 2024-01-02）务必加引号，否则类型漂移。');
        return;
      }
      if (NULL_TOKENS.has(tok)) {
        push('null-tilde', 'info', lineNo, tokCol, '「~」解析为 null', '要字面波浪线或空串请加引号。');
        return;
      }
      // 键后缺空格（整行恰为单 token 时才提示，避免误伤 host:port 之外的合法标量）
      if (standalone && /^[A-Za-z0-9_.\-/]{1,64}:(?![/\s])\S+$/.test(tok)) {
        push('colon-nospace', 'info', lineNo, tokCol, `「${tok}」是单个字符串标量，不是键值对`, '若想表达映射必须写成「key: value」（冒号后有空格）；若本意就是 host:port 形态字符串，当前解析合法。');
      }
    }
  }

  // 别名解析标记（引用必须在定义之后：按 (doc,line,col) 流序）
  for (const a of aliases) {
    const ok = anchors.some((x) => x.doc === a.doc && x.name === a.name && (x.line < a.line || (x.line === a.line && x.col < a.col)));
    a.resolved = ok;
  }

  issues.sort((x, y) => x.line - y.line || x.col - y.col);
  return {
    issues,
    anchors,
    aliases,
    merges,
    docs: docIdx + 1,
    stats: { lines: lines.length, bytes },
  };
}

module.exports = { lintYaml, jsonSafe, normalizeYamlError, sexagesimalToInt, octalValue };
