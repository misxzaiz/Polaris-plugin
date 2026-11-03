'use strict';
/**
 * gitignore-core.js —— .gitignore 检查器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 语义（gitignore 官方常用子集，边界如实声明）：
 *   - 行处理：空行跳过；# 开头注释；尾随空格剥离（行尾反斜杠转义保留）
 *   - ! 前缀否定（忽略→不忽略）；/ 开头锚定仓库根（相对 .gitignore 所在目录）
 *   - / 结尾只匹配目录；中间/结尾的 / 使模式锚定相对路径（否则匹配任意层级的 basename）
 *   - 通配：*（不含 /）、?（不含 /）、[...]（字符类，! 或 ^ 开头取反）
 *   - 双星：前导双星斜杠匹配任意层级；尾随双星匹配目录下全部；中段双星零或多层目录
 *   - 判定顺序：最后一条匹配规则胜出（git 语义）；但「父目录被忽略则其下文件不可
 *     经否定复活」（git 官方规则：不能重新包含被忽略目录内的文件——目录级排除生效后
 *     git 根本不会进入该目录）
 *   - 不支持（如实边界）：嵌套 .gitignore/.git/info/exclude/全局配置（只解析单一清单）；
 *     反斜杠转义仅支持行尾空格场景
 */

// ── 规则解析 ───────────────────────────────────────────────────────────────

/**
 * 解析 .gitignore 文本 → 规则数组。
 * @param {string} text .gitignore 内容
 * @returns {{ rules: Array<{line:number, raw:string, negated:boolean, anchored:boolean, dirOnly:boolean, pattern:string, regex:RegExp, dirRegex?:RegExp}>, errors: Array<{line:number, content:string}> }}
 *   dirRegex：目录规则（/ 结尾）的额外形态——匹配路径任意前缀段
 */
function parseGitignore(text) {
  const rawLines = String(text == null ? '' : text).split(/\r?\n/);
  const rules = [];
  const errors = [];
  rawLines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    let line = String(rawLine);
    // 尾随空格剥离（转义的尾随空格保留：\  结尾 → 空格）
    let trailingEscaped = false;
    if (/\\$/.test(line)) { trailingEscaped = true; line = line.replace(/\\$/, ' '); }
    else line = line.replace(/\s+$/, '');
    if (!line.trim()) return; // 空行
    if (line.startsWith('#')) return; // 注释行
    let negated = false;
    if (line.startsWith('!')) { negated = true; line = line.slice(1); }
    if (!line) { errors.push({ line: lineNo, content: '!' }); return; }
    let anchored = false;
    let dirOnly = false;
    // / 结尾 → 目录限定（先剥，避免影响锚定判断）
    if (line.endsWith('/')) { dirOnly = true; line = line.slice(0, -1); }
    if (!line) { errors.push({ line: lineNo, content: '/' }); return; }
    // 锚定：/ 开头，或（无 / 开头但）中间含 / ——两者都锚定相对根
    if (line.startsWith('/')) { anchored = true; line = line.slice(1); }
    else if (line.slice(1).includes('/')) { anchored = true; }
    if (!line) { errors.push({ line: lineNo, content: String(rawLine).trim() }); return; }
    rules.push({
      line: lineNo,
      raw: String(rawLine).trim(),
      negated, anchored, dirOnly,
      pattern: line,
      regex: globToRegex(line, { anchored, dirOnly }),
      dirRegex: dirOnly ? globToRegex(line, { anchored, dirOnly: false }) : null,
    });
  });
  return { rules, errors };
}

/** gitignore glob → RegExp（不含锚定语义，锚定由匹配函数按路径段处理） */
function globToRegex(pattern, { anchored, dirOnly }) {
  let re = '';
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** ：跨目录。形态：前导 **/ 、尾随 /** 、中间 a/**/b
        if (pattern[i + 2] === '/') {
          if (i === 0) { re += '(?:[^/]+/)*'; i += 3; continue; } // **/ 任意层级目录
          re += '(?:.*/)?'; i += 3; continue; // a/**/b 中段（零或多层）
        }
        // 尾随 /** 或裸 ** → 任意内容
        re += '.*'; i += 2; continue;
      }
      re += '[^/]*'; i++; continue;
    }
    if (ch === '?') { re += '[^/]'; i++; continue; }
    if (ch === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close === -1) { re += '\\['; i++; continue; }
      let cls = pattern.slice(i + 1, close);
      const neg = cls.startsWith('!') || cls.startsWith('^');
      if (neg) cls = cls.slice(1);
      cls = cls.replace(/\\/g, '\\\\');
      re += `[${neg ? '^' : ''}${cls}]`;
      i = close + 1; continue;
    }
    re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i++;
  }
  // dirOnly 非 anchored 的目录规则：匹配任意层级下该目录段
  // 锚定语义：anchored 规则只从根（^）匹配——用 (?:^|/) 会让 /root.txt 误配 sub/root.txt
  const body = anchored ? `^${re}(?:/|$)` : `(^|/)${re}(/|$)`;
  void dirOnly;
  return new RegExp(body);
}

// ── 判定 ───────────────────────────────────────────────────────────────────

/**
 * 逐路径判定（纯函数，单测覆盖）。
 * @param {ReturnType<typeof parseGitignore>} parsed parseGitignore 产物
 * @param {string[]} paths 路径列表（相对仓库根，/ 分隔；不以 / 开头）
 * @returns {{ results: Array<{ path:string, ignored:boolean, ruleLine:number|null, reason:string, trap?:string }> }}
 */
function judgePaths(parsed, paths) {
  const { rules } = parsed;
  const results = [];
  // 预先收集"被忽略的目录"（dirOnly 或无 / 的裸模式也可能指目录——git 对无 / 模式
  // 同时匹配文件与目录；目录匹配成立时其下内容整体排除）
  const ignoredDirPatterns = rules.filter((r) => !r.negated);
  for (const p of paths) {
    const path = String(p || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!path) { results.push({ path: String(p), ignored: false, ruleLine: null, reason: '空路径' }); continue; }
    const segments = path.split('/');
    // 逐级判定：父目录被忽略 → git 不进入目录 → 文件"不可见"（否定不可复活）
    let parentIgnoredBy = null;
    for (let d = 1; d < segments.length; d++) {
      const prefix = segments.slice(0, d).join('/');
      for (const r of rules) {
        if (r.negated) continue; // 否定规则不忽略目录
        const m = matchRule(r, prefix, true);
        if (m) { parentIgnoredBy = r; break; }
      }
      if (parentIgnoredBy) break;
    }
    // 全路径匹配（最后匹配胜出）
    let matched = null; // { rule, isDir }  最后一条命中
    for (const r of rules) {
      if (matchRule(r, path, false)) matched = { rule: r };
      // 目录规则也以其目录形态命中文件路径（git：dir/ 规则匹配目录及其内容）
      if (r.dirRegex && matchRule(r, path, true)) matched = { rule: r };
    }
    let ignored, ruleLine, reason, trap;
    if (parentIgnoredBy) {
      // 父目录被忽略：默认忽略；若最终匹配是否定规则 → 触发经典坑提示
      ignored = true;
      ruleLine = matched && matched.rule.negated ? matched.rule.line : parentIgnoredBy.line;
      reason = matched && matched.rule.negated
        ? `父目录被第 ${parentIgnoredBy.line} 行规则忽略，git 不进入该目录——否定规则（第 ${matched.rule.line} 行）无法复活其中的文件`
        : `父目录被第 ${parentIgnoredBy.line} 行规则忽略，其下内容整体排除`;
      if (matched && matched.rule.negated) {
        trap = 'negated-under-ignored-dir';
      }
    } else if (matched) {
      ignored = !matched.rule.negated;
      ruleLine = matched.rule.line;
      reason = matched.rule.negated
        ? `被第 ${matched.rule.line} 行否定规则复活（!${'…'}）`
        : `被第 ${matched.rule.line} 行规则忽略`;
    } else {
      ignored = false;
      ruleLine = null;
      reason = '无规则命中（未被忽略）';
    }
    results.push({ path, ignored, ruleLine, reason, trap });
  }
  return { results };
}

/** 单规则对路径匹配（isDirContext：作为目录前缀匹配时用宽松形态） */
function matchRule(rule, path, isDirContext) {
  if (rule.dirOnly && !isDirContext) {
    // dirOnly 规则只匹配目录——对文件路径不直接命中（但其 dirRegex 前缀命中由调用方处理）
    return rule.regex.test(path) && rule.regex.test(path + '/');
    // 简化：dirOnly 对文件本体不命中（内容由父目录前缀逻辑处理）
  }
  return rule.regex.test(path);
}

/**
 * 坑检测（解析级静态提示，与逐路径判定互补）。
 * @returns {string[]} 提示行
 */
function detectTraps(parsed) {
  const notes = [];
  const { rules } = parsed;
  for (const r of rules) {
    if (r.negated && r.line > 1) {
      // 否定规则之前是否有同段目录忽略（dirOnly 与非 dirOnly 的目录名规则都算忽略源）
      const earlierDirRule = rules.find(
        (x) => !x.negated && x.line < r.line && x.pattern === r.pattern.split('/')[0],
      );
      if (earlierDirRule) {
        notes.push(`第 ${r.line} 行否定规则可能无效：第 ${earlierDirRule.line} 行先忽略了其父目录段「${earlierDirRule.pattern}/」——git 不进入被忽略目录，否定无法复活其中文件（用 /* 代替目录名可让否定生效）`);
      }
    }
    if (r.pattern === '**') {
      notes.push(`第 ${r.line} 行裸 ** 等效于忽略一切（含自身），通常不是预期写法`);
    }
  }
  return notes;
}

module.exports = { parseGitignore, judgePaths, detectTraps, globToRegex, matchRule };
