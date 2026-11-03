'use strict';
/**
 * env-core.js —— .env 漂移检查器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 解析语义（对齐 dotenv 常见惯例，如实取舍）：
 *   - KEY=VAL；键名 [A-Za-z_][A-Za-z0-9_.]*；行内注释（值外的 # 起始）；# 注释行
 *   - export KEY=VAL 前缀剥离；引号值（'不插值' / "双引号"）剥离引号
 *   - 值内 # 不当注释切（仅引号外 # 前有空格才算行内注释——dotenv 惯例）
 *   - 重复键：后者覆盖前者，但记录重复事件（报告面暴露）
 *   - 格式错误行（无 = 或键名非法）：原样记录行号与内容，不中断解析
 *
 * 脱敏红线：diff 报告只含「已设/未设/不同」判定，绝不含 actual 值原文；
 * example 值（占位符语义）可显示。两侧 parse 结果各自返回，diff 纯函数可单测。
 */

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * 解析 .env 文本（纯函数）。
 * @param {string} text .env 文本
 * @returns {{ vars: Record<string,string>, order: string[], duplicates: string[], errors: Array<{line:number,content:string,reason:string}> }}
 *   vars: 键→值（后值覆盖前值）；order: 首次出现顺序；errors: 格式错误行
 */
function parseEnv(text) {
  const raw = String(text == null ? '' : text);
  const vars = {};
  const order = [];
  const firstSeen = new Set();
  const duplicates = [];
  const errors = [];
  const lines = raw.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    let line = String(rawLine).trim();
    if (!line || line.startsWith('#')) return; // 空行/注释行
    // export 前缀剥离
    const exportM = line.match(/^export\s+/);
    if (exportM) line = line.slice(exportM[0].length).trim();
    const eq = line.indexOf('=');
    if (eq === -1) {
      errors.push({ line: lineNo, content: truncate(String(rawLine).trim(), 60), reason: '缺少 =' });
      return;
    }
    const key = line.slice(0, eq).trim();
    if (!KEY_RE.test(key)) {
      errors.push({ line: lineNo, content: truncate(String(rawLine).trim(), 60), reason: '键名非法' });
      return;
    }
    let value = line.slice(eq + 1).trim();
    // 引号值剥离（'单引号' / "双引号"，须成对且覆盖全值）
    if (value.length >= 2 && ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    // 行内注释：引号外且 # 前有空白（dotenv 惯例：值内 # 不切）
    if (!/^['"]/.test(String(rawLine).trim().slice(eq + 1))) {
      const hashIdx = value.search(/\s#/);
      if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
    }
    if (firstSeen.has(key)) {
      duplicates.push(key);
    } else {
      firstSeen.add(key);
      order.push(key);
    }
    vars[key] = value;
  });

  return { vars, order, duplicates, errors };
}

/**
 * 双侧对比（纯函数，脱敏红线：不含 actual 值原文）。
 * @param {ReturnType<typeof parseEnv>} example .env.example 解析产物（占位符语义，值可显示）
 * @param {ReturnType<typeof parseEnv>} actual 实际 .env 解析产物
 * @returns {{
 *   missing: string[], extra: string[],
 *   valueDiff: Array<{ key: string, exampleValue: string }>,
 *   emptyInActual: string[],
 *   summary: { missing: number, extra: number, valueDiff: number, emptyInActual: number, ok: boolean }
 * }}
 */
function diffEnv(example, actual) {
  const exKeys = Object.keys(example.vars);
  const acKeys = Object.keys(actual.vars);
  const missing = exKeys.filter((k) => !(k in actual.vars));
  const extra = acKeys.filter((k) => !(k in example.vars));
  const valueDiff = exKeys
    .filter((k) => k in actual.vars && actual.vars[k] !== example.vars[k])
    .map((k) => ({ key: k, exampleValue: example.vars[k] }));
  const emptyInActual = acKeys.filter((k) => actual.vars[k] === '');
  const summary = {
    missing: missing.length,
    extra: extra.length,
    valueDiff: valueDiff.length,
    emptyInActual: emptyInActual.length,
    ok: missing.length === 0 && valueDiff.length === 0,
  };
  return { missing, extra, valueDiff, emptyInActual, summary };
}

/**
 * 渲染对比报告（脱敏：不含 actual 值原文）。
 * @returns {string} 多行文本报告
 */
function renderReport(example, actual, parsed) {
  const d = diffEnv(example, actual);
  const lines = [];
  const head = d.summary.ok && d.summary.extra === 0 && d.summary.emptyInActual === 0
    ? '✅ 无漂移'
    : `⚠️ 发现漂移`;
  lines.push(`${head}：缺失 ${d.summary.missing} / 多余 ${d.summary.extra} / 值差异 ${d.summary.valueDiff} / 实际空值 ${d.summary.emptyInActual}`);
  if (d.missing.length) {
    lines.push(`缺失键（example 有、实际无——部署会缺配置）：${d.missing.join(', ')}`);
  }
  if (d.valueDiff.length) {
    lines.push('值差异（同名键值不同；实际值脱敏不展示）：');
    for (const v of d.valueDiff.slice(0, 20)) {
      lines.push(`  - ${v.key}: example=${v.exampleValue || '(空)'} ≠ 实际值(已隐藏)`);
    }
    if (d.valueDiff.length > 20) lines.push(`  （另 ${d.valueDiff.length - 20} 项略）`);
  }
  if (d.extra.length) {
    lines.push(`多余键（实际有、example 无——建议回填 example）：${d.extra.join(', ')}`);
  }
  if (d.emptyInActual.length) {
    lines.push(`实际空值键（易导致运行时空配置）：${d.emptyInActual.join(', ')}`);
  }
  if (parsed.actual.duplicates.length) {
    lines.push(`实际文件重复键（后者覆盖前者）：${[...new Set(parsed.actual.duplicates)].join(', ')}`);
  }
  if (parsed.example.errors.length || parsed.actual.errors.length) {
    lines.push(`格式错误行：example ${parsed.example.errors.length} 处 / 实际 ${parsed.actual.errors.length} 处`);
    for (const e of parsed.example.errors.slice(0, 5)) lines.push(`  [example:${e.line}] ${e.reason}：${e.content}`);
    for (const e of parsed.actual.errors.slice(0, 5)) lines.push(`  [actual:${e.line}] ${e.reason}：${e.content}`);
  }
  return lines.join('\n');
}

function truncate(s, cap) {
  const t = String(s == null ? '' : s);
  return t.length <= cap ? t : t.slice(0, cap) + '…';
}

module.exports = { parseEnv, diffEnv, renderReport, truncate, KEY_RE };
