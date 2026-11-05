'use strict';
/**
 * escape-core.js —— Shell 转义对照台共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 语义（各 shell 引用/解析的常用安全子集，边界如实声明）：
 *   - bash：单引号内无转义（POSIX 安全策略——' → '\'' 闭合续接）；双引号内 $ ` " \
 *     需反斜杠转义（! 历史展开交互 shell 才触发，脚本安全故仅标注）
 *   - powershell：单引号内 ' 翻倍 ''；双引号内 ` 反引号转义 $ ` "
 *   - cmd：双引号包裹；内部 " 无干净转义（""/\" 形态依调用方而异——如实标注为模糊区）；
 *     ^ 转义 & | < > ( )；%VAR% 展开警告
 *   - parse（反向）：按 shell 分词规则还原 argv（引号/转义），看"实际收到的参数"
 *
 * 验证锚定：bash 产物经本机 bash round-trip 实测（test 内 spawn bash -c echo）。
 */

const SHELLS = ['bash', 'powershell', 'cmd'];

// ── 引用（文本 → 各 shell 安全字面量）──────────────────────────────────────

/**
 * bash 引用：POSIX 单引号安全策略（无例外：' → '\'' 闭合续接）。
 * @returns {string} 安全字面量
 */
function quoteBash(text) {
  const s = String(text == null ? '' : text);
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * bash 双引号策略（展示差异用）：$ ` " \ 转义，! 标注交互历史展开。
 */
const BASH_DQ_SPECIAL = '$' + '`' + '"\\';
function quoteBashDouble(text) {
  const s = String(text == null ? '' : text);
  // 固定字面正则：[$ ` " \] 四字符（动态拼接字符类的转义复杂度高于收益）
  return '"' + s.replace(/[$`"\\]/g, '\\$&') + '"';
}

/**
 * powershell 引用：单引号（' → '' 翻倍，无其它转义——确定性最好）。
 */
function quotePowerShell(text) {
  const s = String(text == null ? '' : text);
  return "'" + s.replace(/'/g, "''") + "'";
}

/**
 * powershell 双引号策略：` 转义 $ ` "。
 */
const PWSH_DQ_SPECIAL = '$' + '`' + '"';
function quotePowerShellDouble(text) {
  const s = String(text == null ? '' : text);
  // 固定字面正则：[$ ` "] 三字符
  return '"' + s.replace(/[$`"]/g, '`$&') + '"';
}

/**
 * cmd 引用：双引号包裹 + ^ 转义引号外特殊字符；内部 " 无法干净转义（如实标注）。
 * cmd 安全引用本就是模糊区——产出为「最常用可行形态」，含 " 的文本标注 caveat。
 */
function quoteCmd(text) {
  const s = String(text == null ? '' : text);
  if (s.includes('"')) {
    return { text: '"' + s.replace(/"/g, '""') + '"', caveat: 'cmd 内部双引号无干净转义："" 形态在多数调用方可行，但不同程序解析不一——建议改写避免双引号' };
  }
  // 特殊字符 ^ 转义（引号包裹已保护大部分；这里产出包裹形态 + 特殊字符说明）
  return { text: '"' + s + '"', caveat: '' };
}

/** 特殊字符在各 shell 的语义对照（引用形态说明表） */
const BT = '`'; // 反引号字符（对象键经变量构造，避免字面量与模板/正则冲突）
function specialCharTable(text) {
  const s = String(text == null ? '' : text);
  const chars = ['$' + BT + '"\\\'!%|&;<>()^*', ' ', '\t', '\n'];
  const notes = {
    '$': { bash: '双引号内变量展开（单引号安全）', powershell: '双引号内变量展开', cmd: '仅 %VAR% 形式展开' },
    [BT]: { bash: '双引号内命令替换', powershell: '转义符（兼双引号转义前缀）', cmd: '无特殊义' },
    '"': { bash: '双引号定界（内需反斜杠转义）', powershell: '双引号定界（内需反引号转义）', cmd: '定界符——内部转义模糊区' },
    "'": { bash: '单引号定界（闭合续接转义）', powershell: "单引号定界（'' 翻倍）", cmd: '无特殊义' },
    '\\': { bash: '双引号内转义前缀', powershell: '无特殊义（除路径尾）', cmd: '双重处理，路径慎用' },
    '!': { bash: '交互 shell 历史展开（脚本安全）', powershell: '无特殊义', cmd: '无特殊义' },
    '%': { bash: '无特殊义', powershell: '无特殊义', cmd: '%VAR% 变量展开' },
    '|': { bash: '管道（引号外）', powershell: '管道（引号外）', cmd: '管道（^| 转义）' },
    '&': { bash: '后台/顺序（引号外）', powershell: '调用运算符', cmd: '顺序执行（^& 转义）' },
    ';': { bash: '命令分隔', powershell: '命令分隔', cmd: '无分隔义' },
    '<': { bash: '重定向', powershell: '保留（未实现重定向）', cmd: '重定向（^< 转义）' },
    '>': { bash: '重定向', powershell: '重定向', cmd: '重定向（^> 转义）' },
    '(': { bash: '子 shell', powershell: '表达式', cmd: '分组（^( 转义）' },
    ')': { bash: '子 shell', powershell: '表达式', cmd: '分组（^) 转义）' },
    '^': { bash: '无特殊义', powershell: '转义字符', cmd: '转义字符' },
    ' ': { bash: '参数分隔（引号包裹）', powershell: '参数分隔', cmd: '参数分隔' },
    '\t': { bash: '分隔（引号包裹）', powershell: '分隔', cmd: '分隔' },
    '\n': { bash: '命令结束（单引号内安全）', powershell: '命令结束', cmd: '命令结束（无法引用）' },
  };
  const found = [];
  const seen = new Set();
  for (const ch of s) {
    if (notes[ch] && !seen.has(ch)) {
      seen.add(ch);
      found.push({ char: ch === ' ' ? '(空格)' : ch === '\t' ? '(制表符)' : ch === '\n' ? '(换行)' : ch, ...notes[ch] });
    }
  }
  return found;
}

/** 三 shell 引用对照（MCP/面板主视图） */
function quoteAll(text) {
  const bash = quoteBash(text);
  const pwsh = quotePowerShell(text);
  const cmdRes = quoteCmd(text);
  return {
    bash,
    bashDouble: quoteBashDouble(text),
    powershell: pwsh,
    powershellDouble: quotePowerShellDouble(text),
    cmd: typeof cmdRes === 'string' ? cmdRes : cmdRes.text,
    cmdCaveat: typeof cmdRes === 'string' ? '' : cmdRes.caveat,
    specials: specialCharTable(text),
  };
}

// ── 解析（命令行 → argv）──────────────────────────────────────────────────

/**
 * bash 分词解析（POSIX 常用子集）：单引号无转义 / 双引号内 \ 转义 $`" 按字面收（不展开）/
 * 引号外 \x 转义。变量/命令替换不展开（标记 literal——本工具看"字面参数"）。
 * @returns {{ ok: true, argv: string[] } | { ok: false, error: string }}
 */
function parseBash(line) {
  const s = String(line == null ? '' : line);
  const argv = [];
  let cur = '';
  let hasCur = false;
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < s.length) {
    const ch = s[i];
    if (inSingle) {
      if (ch === "'") { inSingle = false; }
      else { cur += ch; hasCur = true; }
      i++; continue;
    }
    if (inDouble) {
      if (ch === '"') { inDouble = false; i++; continue; }
      // 双引号内 \ 仅转义 $ ` " \ —— 其余 \ 按字面保留（POSIX 双引号语义）
      if (ch === '\\' && BASH_DQ_SPECIAL.includes(s[i + 1])) { cur += s[i + 1]; hasCur = true; i += 2; continue; }
      cur += ch; hasCur = true; i++; continue;
    }
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === '\\') {
      if (i + 1 < s.length) { cur += s[i + 1]; hasCur = true; i += 2; continue; }
      i++; continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (hasCur) { argv.push(cur); cur = ''; hasCur = false; }
      i++; continue;
    }
    if (ch === '#' && !hasCur) break; // 注释
    cur += ch; hasCur = true; i++;
  }
  if (inSingle || inDouble) return { ok: false, error: `未闭合的 ${inSingle ? '单引号' : '双引号'}字符串` };
  if (hasCur) argv.push(cur);
  return { ok: true, argv };
}

/**
 * powershell 分词解析（常用子集）：单引号（'' 翻倍）/ 双引号（` 转义）/ 引号外空白分隔。
 */
function parsePowerShell(line) {
  const s = String(line == null ? '' : line);
  const argv = [];
  let cur = '';
  let hasCur = false;
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < s.length) {
    const ch = s[i];
    if (inSingle) {
      if (ch === "'" && s[i + 1] === "'") { cur += "'"; hasCur = true; i += 2; continue; }
      if (ch === "'") { inSingle = false; i++; continue; }
      cur += ch; hasCur = true; i++; continue;
    }
    if (inDouble) {
      // powershell 双引号内 ` 反引号转义（转义 $ ` "）
      if (ch === BT && i + 1 < s.length) { cur += s[i + 1]; hasCur = true; i += 2; continue; }
      if (ch === '"') {
        if (s[i + 1] === '"') { cur += '"'; hasCur = true; i += 2; continue; } // "" 转义（部分语境）
        inDouble = false; i++; continue;
      }
      cur += ch; hasCur = true; i++; continue;
    }
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (hasCur) { argv.push(cur); cur = ''; hasCur = false; }
      i++; continue;
    }
    if (ch === '#' && !hasCur) break;
    cur += ch; hasCur = true; i++;
  }
  if (inSingle || inDouble) return { ok: false, error: `未闭合的 ${inSingle ? '单引号' : '双引号'}字符串` };
  if (hasCur) argv.push(cur);
  return { ok: true, argv };
}

/**
 * cmd 分词解析（近似子集，如实声明）：双引号包裹（"" 字面）+ 空白分隔；^ 转义引号外特殊字符。
 * cmd 真实解析由被调用程序决定（std 非法形态多）——本解析为「多数程序收到的近似 argv」。
 */
function parseCmd(line) {
  const s = String(line == null ? '' : line);
  const argv = [];
  let cur = '';
  let hasCur = false;
  let i = 0;
  let inDouble = false;
  while (i < s.length) {
    const ch = s[i];
    if (inDouble) {
      if (ch === '"') { inDouble = false; i++; continue; }
      cur += ch; hasCur = true; i++; continue;
    }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === '^' && i + 1 < s.length) { cur += s[i + 1]; hasCur = true; i += 2; continue; }
    if (ch === ' ' || ch === '\t') {
      if (hasCur) { argv.push(cur); cur = ''; hasCur = false; }
      i++; continue;
    }
    cur += ch; hasCur = true; i++;
  }
  if (inDouble) return { ok: false, error: '未闭合的双引号字符串' };
  if (hasCur) argv.push(cur);
  return { ok: true, argv };
}

const PARSERS = { bash: parseBash, powershell: parsePowerShell, cmd: parseCmd };

/** 渲染引用对照报告 */
function renderQuoteReport(text) {
  const q = quoteAll(text);
  const lines = ['三 shell 安全引用对照：', `  bash:       ${q.bash}`];
  if (q.bashDouble !== q.bash) lines.push(`  bash(双引号): ${q.bashDouble}  （$ \` " \\ 需转义）`);
  lines.push(`  powershell: ${q.powershell}`, `  cmd:        ${q.cmd}`);
  if (q.cmdCaveat) lines.push(`  ⚠ cmd: ${q.cmdCaveat}`);
  if (q.specials.length) {
    lines.push('文本中的特殊字符语义：');
    for (const sp of q.specials) {
      lines.push(`  ${sp.char}  bash=${sp.bash} · powershell=${sp.powershell} · cmd=${sp.cmd}`);
    }
  }
  return lines.join('\n');
}

// 小工具：避免上面模板里写错
function pwshSafe(q) { return q.powershell; }

module.exports = {
  SHELLS,
  quoteBash, quoteBashDouble, quotePowerShell, quotePowerShellDouble, quoteCmd,
  specialCharTable, quoteAll, renderQuoteReport, pwshSafe,
  parseBash, parsePowerShell, parseCmd, PARSERS,
};
