'use strict';
/**
 * matrix-core.js —— 提示词矩阵台核心（零依赖，service 与测试共用）
 *
 * 职责（纯逻辑层，网络经注入的 fetchImpl，可离线全测）：
 *   1. 模板插值：{{var}} 语法，未知变量保留原样并产生警告（诚实优于静默吞掉）
 *   2. 数据集解析：JSONL 行级容错（错误行报告不中断，有效行照收）
 *   3. 确定性检查器 7 种：contains/not_contains/regex/json_valid/equals/min_length/max_length
 *   4. 字级 diff：前后缀裁剪 + 中段 LCS（上限保护，超限截断标注）
 *   5. 聚合统计：per variant 成功率/检查通过率/judge 分/token 合计
 *   6. judge：pointwise 消息构造 + 输出容错解析（抽第一个平衡 JSON 对象）
 *   7. LLM 非流式调用：双 wire API（openai-chat-completions / anthropic-messages），
 *      temperature 透传，max_completion_tokens 兼容重试，错误分类
 *
 * 安全不变量：本文件任何输出不得包含完整 apiKey（掩码函数见 maskKey）。
 * 结果投影（makeCellProjection）保证落 kv 的格子文本有界（1.2KB）。
 */

const VERSION = '0.1.0';

const MAX_SAMPLES = 200;          // 数据集样本上限
const MAX_JSONL_BYTES = 256 * 1024; // 数据集原文上限
const MAX_VAR_VALUE = 64 * 1024;  // 单变量值上限
const CELL_PROJECT_BYTES = 1200;  // kv 投影单格文本上限（全量在结果文件）
const CELL_STORE_BYTES = 64 * 1024; // 单格全文落盘上限
const DIFF_MAX_MID = 3000;        // diff 中段字符上限（超出截断标注）
const PATTERN_MAX = 500;          // regex 模式长度上限

// ── 掩码（与宿主 mask_value 同形态）─────────────────────────────────────────
function maskKey(key) {
  const s = String(key || '');
  if (!s) return '';
  const m = s.match(/^\$\{([^}]+)\}$/);
  if (m) return `env:${m[1]}`;
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

// ── 模板插值 ────────────────────────────────────────────────────────────────
/**
 * {{name}} 插值（含 {{ name }} 空格形态）。
 * 未知变量保留原样（诚实优于静默替换空串），收集进 warnings。
 * vars 值：字符串直用；number/boolean 转字符串；object/array JSON 序列化。
 * 返回 { text, warnings: string[] }
 */
function renderTemplate(tpl, vars) {
  const warnings = [];
  const text = String(tpl == null ? '' : tpl).replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (whole, name) => {
    if (!vars || !(name in vars)) {
      warnings.push(`变量 {{${name}}} 在样本中未定义（已保留原样）`);
      return whole;
    }
    const v = vars[name];
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  });
  return { text, warnings };
}

/** 从模板提取引用的变量名集合（去重保序） */
function extractVars(tpl) {
  const out = [];
  const seen = new Set();
  const s = String(tpl == null ? '' : tpl);
  let m;
  const re = /\{\{\s*([\w.$-]+)\s*\}\}/g;
  while ((m = re.exec(s))) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

// ── 数据集解析 ──────────────────────────────────────────────────────────────
/**
 * JSONL → 样本列表。行规则：
 *  - 空行 / # 开头注释行跳过
 *  - 对象含顶层 `vars` 键 → 变量取 vars；顶层 `expect`（数组）→ 检查器
 *  - 无 vars 键 → 除 `expect` 外的顶层键全部作为变量（expect 若为非数组则当普通变量）
 * 行级错误收集进 errors（{line, msg}），不中断其余行。
 */
function parseDataset(jsonlText, opts) {
  const o = opts || {};
  const maxSamples = o.maxSamples || MAX_SAMPLES;
  const errors = [];
  const samples = [];
  const text = String(jsonlText == null ? '' : jsonlText);
  if (text.length > MAX_JSONL_BYTES) {
    return { samples, errors: [{ line: 0, msg: `数据集超过 ${Math.round(MAX_JSONL_BYTES / 1024)}KB 上限` }] };
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    let obj;
    try { obj = JSON.parse(raw); } catch (e) {
      errors.push({ line: i + 1, msg: `JSON 解析失败：${String(e.message).slice(0, 80)}` });
      continue;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      errors.push({ line: i + 1, msg: '不是 JSON 对象' });
      continue;
    }
    let vars;
    let expect;
    if ('vars' in obj) {
      if (!obj.vars || typeof obj.vars !== 'object' || Array.isArray(obj.vars)) {
        errors.push({ line: i + 1, msg: 'vars 必须是对象' });
        continue;
      }
      vars = { ...obj.vars };
      expect = Array.isArray(obj.expect) ? obj.expect : undefined;
    } else {
      vars = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'expect' && Array.isArray(v)) { expect = v; continue; }
        vars[k] = v;
      }
    }
    let bad = false;
    for (const [k, v] of Object.entries(vars)) {
      const size = typeof v === 'string' ? v.length : JSON.stringify(v == null ? '' : v).length;
      if (size > MAX_VAR_VALUE) {
        errors.push({ line: i + 1, msg: `变量 ${k} 超过 ${Math.round(MAX_VAR_VALUE / 1024)}KB 上限` });
        bad = true;
        break;
      }
    }
    if (bad) continue;
    const checks = normalizeChecks(expect, (msg) => errors.push({ line: i + 1, msg }));
    if (checks === null && expect) continue; // 检查器定义非法，该行已报错
    samples.push({ vars, checks: checks || [] });
    if (samples.length >= maxSamples) {
      errors.push({ line: 0, msg: `样本超过 ${maxSamples} 条上限，已截断` });
      break;
    }
  }
  return { samples, errors };
}

/** 样本列表 → JSONL 文本（导出用） */
function serializeDataset(samples) {
  const lines = (samples || []).map((s) => {
    const o = { vars: s.vars || {} };
    if (s.checks && s.checks.length) o.expect = s.checks;
    return JSON.stringify(o);
  });
  return lines.join('\n') + (lines.length ? '\n' : '');
}

// ── 确定性检查器 ────────────────────────────────────────────────────────────
/**
 * 7 种检查器。check = {type, value?, label?}
 *   contains     value: string | string[]（全部包含）
 *   not_contains  value: string | string[]（全部不包含）
 *   regex        value: string（| {pattern, flags}）
 *   json_valid   value: 无 | {extract: true}（先从 ```json 代码块提取）
 *   equals       value: string（trim 后全等）
 *   min_length   value: number
 *   max_length   value: number
 */
const CHECK_TYPES = ['contains', 'not_contains', 'regex', 'json_valid', 'equals', 'min_length', 'max_length'];

/** 检查定义归一：非法返回 null 并调用 onErr */
function normalizeChecks(raw, onErr) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    if (onErr) onErr('expect 必须是检查器数组');
    return null;
  }
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object' || !CHECK_TYPES.includes(c.type)) {
      if (onErr) onErr(`未知检查器类型：${c && c.type}（支持：${CHECK_TYPES.join('/')}）`);
      return null;
    }
    const item = { type: c.type, label: String(c.label || c.type) };
    if (c.type === 'regex') {
      const pattern = typeof c.value === 'string' ? c.value : (c.value && c.value.pattern);
      if (!pattern || String(pattern).length > PATTERN_MAX) {
        if (onErr) onErr(`regex 检查器需要 1~${PATTERN_MAX} 字符的模式`);
        return null;
      }
      let flags = typeof c.value === 'object' && c.value ? String(c.value.flags || '') : '';
      flags = flags.replace(/[^gimsuy]/g, '');
      try { new RegExp(pattern, flags); } catch (e) {
        if (onErr) onErr(`regex 模式非法：${String(e.message).slice(0, 80)}`);
        return null;
      }
      item.value = { pattern, flags };
    } else if (c.type === 'json_valid') {
      item.value = c.value && typeof c.value === 'object' ? { extract: !!c.value.extract } : {};
    } else if (c.type === 'min_length' || c.type === 'max_length') {
      const n = Number(c.value);
      if (!Number.isFinite(n) || n < 0) {
        if (onErr) onErr(`${c.type} 需要非负数字`);
        return null;
      }
      item.value = n;
    } else {
      // contains / not_contains / equals
      let v = c.value;
      if (c.type !== 'equals') {
        if (typeof v === 'string') v = [v];
        if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'string' || !x.length)) {
          if (onErr) onErr(`${c.type} 需要非空字符串或字符串数组`);
          return null;
        }
        if (v.length > 20) {
          if (onErr) onErr(`${c.type} 关键词最多 20 个`);
          return null;
        }
      } else if (typeof v !== 'string') {
        if (onErr) onErr('equals 需要字符串');
        return null;
      }
      item.value = v;
    }
    out.push(item);
  }
  return out;
}

/** 从 markdown 代码块提取（```json ... ``` 或 ``` ... ```） */
function extractJsonBlock(text) {
  const m = String(text || '').match(/```(?:json)?\s*\r?\n?([\s\S]*?)```/i);
  return m ? m[1] : null;
}

/** 单格执行全部检查。返回 [{type, label, pass, detail}] */
function runChecks(content, checks) {
  const text = String(content == null ? '' : content);
  const out = [];
  for (const c of checks || []) {
    try {
      if (c.type === 'contains') {
        const missing = (c.value || []).filter((kw) => !text.includes(kw));
        out.push({ type: c.type, label: c.label, pass: missing.length === 0, detail: missing.length ? `缺少：${missing.map((x) => x.slice(0, 40)).join('、')}` : '全部命中' });
      } else if (c.type === 'not_contains') {
        const hit = (c.value || []).filter((kw) => text.includes(kw));
        out.push({ type: c.type, label: c.label, pass: hit.length === 0, detail: hit.length ? `不应出现：${hit.map((x) => x.slice(0, 40)).join('、')}` : '无违禁词' });
      } else if (c.type === 'regex') {
        const re = new RegExp(c.value.pattern, c.value.flags.includes('g') ? c.value.flags : c.value.flags + '');
        const ok = re.test(text);
        out.push({ type: c.type, label: c.label, pass: ok, detail: ok ? '正则命中' : '正则未命中' });
      } else if (c.type === 'json_valid') {
        const src = (c.value && c.value.extract) ? (extractJsonBlock(text) || text) : text;
        let parsed = null;
        let err = null;
        try { parsed = JSON.parse(src.trim()); } catch (e) { err = e; }
        out.push({ type: c.type, label: c.label, pass: !err, detail: err ? `JSON 解析失败：${String(err.message).slice(0, 60)}` : `JSON 有效（${Array.isArray(parsed) ? 'array' : typeof parsed}）` });
      } else if (c.type === 'equals') {
        const ok = text.trim() === c.value;
        out.push({ type: c.type, label: c.label, pass: ok, detail: ok ? '精确匹配' : '不等于期望文本' });
      } else if (c.type === 'min_length') {
        const ok = text.length >= c.value;
        out.push({ type: c.type, label: c.label, pass: ok, detail: `${text.length} 字符（下限 ${c.value}）` });
      } else if (c.type === 'max_length') {
        const ok = text.length <= c.value;
        out.push({ type: c.type, label: c.label, pass: ok, detail: `${text.length} 字符（上限 ${c.value}）` });
      }
    } catch (e) {
      out.push({ type: c.type, label: c.label, pass: false, detail: `检查器异常：${String(e.message).slice(0, 60)}` });
    }
  }
  return out;
}

// ── 字级 diff（前后缀裁剪 + 中段 LCS，上限保护）─────────────────────────────
/**
 * 返回 segments [{t:'same'|'del'|'add', s}]。a 为旧（被删/被替换），b 为新（新增）。
 * 中段超 DIFF_MAX_MID 时截断并插入 {t:'same', s:'…（中段过长已省略）…'}。
 * segments 数上限 400（超限合并相邻）。
 */
function textDiff(aRaw, bRaw) {
  const a = String(aRaw == null ? '' : aRaw);
  const b = String(bRaw == null ? '' : bRaw);
  if (a === b) return [{ t: 'same', s: a }];
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) { endA--; endB--; }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const segs = [];
  if (start) segs.push({ t: 'same', s: a.slice(0, start) });
  // 中段 LCS（限长）
  const A = midA.length > DIFF_MAX_MID ? midA.slice(0, DIFF_MAX_MID) : midA;
  const B = midB.length > DIFF_MAX_MID ? midB.slice(0, DIFF_MAX_MID) : midB;
  if (midA.length > DIFF_MAX_MID || midB.length > DIFF_MAX_MID) {
    segs.push({ t: 'same', s: '…（差异中段过长，已省略显示）…' });
  }
  const n = A.length;
  const m = B.length;
  if (n === 0) { segs.push({ t: 'add', s: midB }); }
  else if (m === 0) { segs.push({ t: 'del', s: midA }); }
  else {
    // LCS DP：n,m ≤ 3000 → 9M 格；行优先一维数组省内存
    const dp = new Int32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * (m + 1) + j] = A.charCodeAt(i) === B.charCodeAt(j)
          ? dp[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    const raw = [];
    while (i < n && j < m) {
      if (A.charCodeAt(i) === B.charCodeAt(j)) { raw.push({ t: 'same', s: A[i] }); i++; j++; }
      else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) { raw.push({ t: 'del', s: A[i] }); i++; }
      else { raw.push({ t: 'add', s: B[j] }); j++; }
    }
    while (i < n) { raw.push({ t: 'del', s: A[i] }); i++; }
    while (j < m) { raw.push({ t: 'add', s: B[j] }); j++; }
    // 合并相邻同类型段（段数压缩，单段不设上限——diff 总输出本就有界）
    let cur = null;
    for (const seg of raw) {
      if (cur && cur.t === seg.t) cur.s += seg.s;
      else { if (cur) segs.push(cur); cur = { t: seg.t, s: seg.s }; }
    }
    if (cur) segs.push(cur);
  }
  if (endA < a.length) segs.push({ t: 'same', s: a.slice(endA) });
  return segs;
}

// ── 聚合统计 ────────────────────────────────────────────────────────────────
/**
 * cells: [{variantIdx, ok, ms, usage:{prompt_tokens,completion_tokens}, checks:[...], judge:{score}, error}]
 * 返回 { variants: [{idx, total, ok, failed, checkAllPass, judgeAvg, judgeN, avgMs, tokIn, tokOut}], totals }
 */
function aggregateRuns(cells, variantCount) {
  const per = [];
  for (let v = 0; v < variantCount; v++) {
    per.push({ idx: v, total: 0, ok: 0, failed: 0, checkAllPass: 0, judgeSum: 0, judgeN: 0, avgMs: 0, msSum: 0, tokIn: 0, tokOut: 0 });
  }
  for (const c of cells || []) {
    const p = per[c.variantIdx];
    if (!p) continue;
    p.total += 1;
    if (c.ok) {
      p.ok += 1;
      p.msSum += c.ms || 0;
      const checks = c.checks || [];
      if (checks.length && checks.every((x) => x.pass)) p.checkAllPass += 1;
      if (c.usage) {
        p.tokIn += Number(c.usage.prompt_tokens) || 0;
        p.tokOut += Number(c.usage.completion_tokens) || 0;
      }
      if (c.judge && Number.isFinite(c.judge.score)) {
        p.judgeSum += c.judge.score;
        p.judgeN += 1;
      }
    } else {
      p.failed += 1;
    }
  }
  for (const p of per) {
    p.avgMs = p.ok ? Math.round(p.msSum / p.ok) : 0;
    p.judgeAvg = p.judgeN ? Math.round((p.judgeSum / p.judgeN) * 10) / 10 : null;
    delete p.msSum;
    delete p.judgeSum;
  }
  const totals = {
    cells: per.reduce((a, b) => a + b.total, 0),
    ok: per.reduce((a, b) => a + b.ok, 0),
    failed: per.reduce((a, b) => a + b.failed, 0),
    tokIn: per.reduce((a, b) => a + b.tokIn, 0),
    tokOut: per.reduce((a, b) => a + b.tokOut, 0),
  };
  return { variants: per, totals };
}

// ── judge ───────────────────────────────────────────────────────────────────
const JUDGE_SYSTEM = '你是严格的 LLM 输出评测员。根据任务要求对输出打 1-10 分（10=完全满足任务，1=完全离题或无用），并给出不超过 60 字的中文理由。只输出一个 JSON 对象，格式：{"score": <1-10 整数>, "reason": "<理由>"}，不要输出任何其他内容。';

/**
 * 构造 judge 消息（pointwise）。ctx: {vars, userTemplate, output, checks?}
 * 返回 openai messages 数组（anthropic 线路由 chatBody 转换）。
 */
function buildJudgeMessages(ctx, customUserTpl) {
  const vars = ctx.vars || {};
  const varLines = Object.entries(vars).map(([k, v]) => {
    const vs = typeof v === 'string' ? v : JSON.stringify(v);
    return `- ${k} = ${vs.length > 300 ? vs.slice(0, 300) + '…' : vs}`;
  });
  const user = customUserTpl && customUserTpl.trim()
    ? renderTemplate(customUserTpl, { output: ctx.output || '', ...vars }).text
    : [
      '## 任务',
      ctx.userTemplate || '（无模板）',
      varLines.length ? `## 输入变量\n${varLines.join('\n')}` : '',
      '## 模型输出',
      String(ctx.output || '').slice(0, 8000),
      '## 请打分',
      '只输出 {"score": <1-10>, "reason": "<理由>"}。',
    ].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: JUDGE_SYSTEM },
    { role: 'user', content: user },
  ];
}

/** judge 输出容错解析：抽第一个平衡 {}，clamp 1-10。失败返回 null。 */
function parseJudgeOutput(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const j = JSON.parse(s.slice(start, i + 1));
          const score = Math.round(Number(j.score));
          if (!Number.isFinite(score)) return null;
          return { score: Math.min(10, Math.max(1, score)), reason: String(j.reason || '').slice(0, 300) };
        } catch (_) { return null; }
      }
    }
  }
  return null;
}

// ── 结果投影（kv 瘦身）──────────────────────────────────────────────────────
/** cell → kv 投影：全文截 1.2KB，标注截断；error.hint 截 200 */
function makeCellProjection(cell) {
  const c = { ...cell };
  if (typeof c.content === 'string' && c.content.length > CELL_PROJECT_BYTES) {
    c.content = c.content.slice(0, CELL_PROJECT_BYTES);
    c.truncated = true;
  }
  if (c.error && typeof c.error.hint === 'string' && c.error.hint.length > 200) {
    c.error = { ...c.error, hint: c.error.hint.slice(0, 200) };
  }
  return c;
}

// ── LLM 非流式调用（双 wire API，自包含）────────────────────────────────────
/** baseUrl → chat 终点（与 probe-core 同规则：# 逃生舱/版本段/裸域补 /v1） */
function resolveUrls(baseUrl, wire) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('baseUrl 为空');
  if (raw.endsWith('#')) {
    const chat = raw.slice(0, -1);
    return { chat, note: '逐字模式（baseUrl 以 # 结尾）' };
  }
  const hasVersion = /\/(v1|v1beta|v2|openai|api|anthropic|compatible\/v1)(\/|$)/.test(raw);
  const endsChat = /\/(chat\/completions|messages|completions)$/.test(raw);
  if (wire === 'anthropic-messages') {
    return { chat: endsChat ? raw : raw + (hasVersion ? '/messages' : '/v1/messages'), note: hasVersion ? '含版本段' : '裸域补 /v1' };
  }
  return { chat: endsChat ? raw : raw + (hasVersion ? '/chat/completions' : '/v1/chat/completions'), note: hasVersion ? '含版本段' : '裸域补 /v1' };
}

/** 剥离模型名 CLI 私有后缀（deepseek-flash[1m] → deepseek-flash；对齐宿主 strip_cli_model_suffix） */
function stripCliModelSuffix(model) {
  const s = String(model || '');
  const i = s.indexOf('[');
  if (i < 0) return { base: s, beta: null, query: null };
  const base = s.slice(0, i).trimEnd();
  if (!base) return { base: s, beta: null, query: null };
  const suffix = s.slice(i + 1).replace(/\]+$/, '');
  const isOneM = suffix === '1m' || suffix === '1M';
  return {
    base,
    beta: isOneM ? 'claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14' : null,
    query: isOneM ? 'beta=true' : null,
  };
}

function upstreamModel(profile) {
  return stripCliModelSuffix(profile.model).base || profile.model;
}

function buildHeaders(profile) {
  const h = { 'Content-Type': 'application/json' };
  if (profile.wire === 'anthropic-messages') {
    h['x-api-key'] = profile.apiKey;
    h['anthropic-version'] = profile.anthropicVersion || '2023-06-01';
    const sfx = stripCliModelSuffix(profile.model);
    if (sfx.beta) h['anthropic-beta'] = sfx.beta;
  } else {
    h['Authorization'] = `Bearer ${profile.apiKey}`;
  }
  return h;
}

function chatUrlOf(profile, urls) {
  const sfx = stripCliModelSuffix(profile.model);
  if (profile.wire === 'anthropic-messages' && sfx.query && !urls.chat.includes('?')) {
    return `${urls.chat}?${sfx.query}`;
  }
  return urls.chat;
}

/** messages: [{role, content}] → wire 请求体；temperature 透传（clamp 0-2） */
function chatBody(profile, opts) {
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic' : 'openai';
  const maxTokens = Math.min(Math.max(Number(opts.maxTokens) || 1024, 1), 32768);
  const msgs = Array.isArray(opts.messages) ? opts.messages : [{ role: 'user', content: String(opts.prompt || '') }];
  const temperature = opts.temperature == null ? null : Math.min(Math.max(Number(opts.temperature), 0), 2);
  let body;
  if (wire === 'anthropic') {
    const system = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const rest = msgs.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
    body = { model: upstreamModel(profile), max_tokens: maxTokens, messages: rest };
    if (system) body.system = system;
  } else {
    body = { model: upstreamModel(profile), max_tokens: maxTokens, messages: msgs };
  }
  if (temperature != null) body.temperature = temperature;
  return body;
}

/** max_tokens 兼容（o 系要求 max_completion_tokens） */
function maxTokensRetryHint(bodyText) {
  return /max_completion_tokens/i.test(bodyText) && /max_tokens/i.test(bodyText) && /deprecat|unsupported|use |instead/i.test(bodyText);
}

function classifyNetworkErr(err) {
  const msg = String((err && (err.message || (err.cause && err.cause.message))) || err || '');
  const code = String((err && (err.code || (err.cause && err.cause.code))) || '');
  if (/ENOTFOUND|EAI_AGAIN/i.test(code + msg)) return { code: 'dns', cn: '域名解析失败', hint: '检查 baseUrl 拼写与 DNS' };
  if (/ECONNREFUSED|bad port/i.test(code + msg)) return { code: 'refused', cn: '连接被拒绝（端口未开）', hint: '服务未启动或端口错误' };
  if (/CERT|SSL|TLS|DEPTH_ZERO|SELF_SIGNED/i.test(code + msg)) return { code: 'tls', cn: 'TLS 证书错误', hint: '自签名/过期证书' };
  if (/ECONNRESET|EPIPE/i.test(code + msg)) return { code: 'reset', cn: '连接被重置', hint: '网络中断或代理掐断' };
  if (/ETIMEDOUT|ECONNABORTED|AbortError|TIMEOUT/i.test(code + msg)) return { code: 'timeout', cn: '响应超时', hint: '端点无响应或生成过慢，可在设置里放宽超时' };
  return { code: 'network', cn: '网络错误', hint: msg.slice(0, 160) };
}

function classifyHttp(status, bodyText) {
  const short = String(bodyText || '').slice(0, 400);
  let upstream = '';
  try {
    const j = JSON.parse(short || '{}');
    upstream = String((j.error && (j.error.message || j.error.type)) || j.message || j.detail || '');
  } catch (_) { upstream = short.slice(0, 160); }
  if (status === 401 || status === 403) return { code: status === 401 ? 'auth' : 'forbidden', cn: '鉴权失败', hint: '检查 apiKey/额度；' + upstream.slice(0, 120) };
  if (status === 404) return { code: 'not_found', cn: '404 路径或模型不存在', hint: '检查 baseUrl 拼接与模型名' + (upstream ? '；' + upstream.slice(0, 120) : '') };
  if (status === 429) return { code: 'rate_limit', cn: '限流（429）', hint: '降低并发或稍后重试' + (upstream ? '；' + upstream.slice(0, 120) : '') };
  if (status === 400) return { code: 'bad_request', cn: '400 请求被拒', hint: '参数不兼容（模型名/wire 协议）；' + upstream.slice(0, 160) };
  if (status === 402) return { code: 'payment', cn: '402 需要付费', hint: '余额/配额不足' };
  if (status >= 500) return { code: 'server', cn: `上游服务错误（${status}）`, hint: '供应商侧故障/过载' + (upstream ? '；' + upstream.slice(0, 120) : '') };
  return { code: 'http_other', cn: `HTTP ${status}`, hint: upstream.slice(0, 160) };
}

async function readBody(res, cap) {
  try {
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) return await res.text();
    const dec = new TextDecoder();
    let out = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
      if (out.length > cap) { try { reader.cancel(); } catch (_) { /* 忽略 */ } break; }
    }
    return out;
  } catch (_) { return ''; }
}

/**
 * 非流式对话一次。opts: {messages|prompt, maxTokens, temperature, timeoutMs, signal, fetchImpl}
 * 返回 {ok, ms, status, content, finishReason, usage, error, retried}
 * 重试语义（retryable=true 时由调用方决定是否重试）：429/5xx/网络层错误可重试；4xx 语义错误不重试。
 */
async function chatOnce(profile, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions';
  let urls;
  try { urls = resolveUrls(profile.baseUrl, wire); } catch (e) {
    return { ok: false, ms: 0, error: { code: 'config', cn: String(e.message || e), hint: '修正档案 baseUrl' } };
  }
  const body = chatBody(profile, opts);
  const headers = buildHeaders(profile);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`timeout ${opts.timeoutMs}ms`)), opts.timeoutMs || 60000);
  const onOuterAbort = () => ac.abort(new Error('cancelled'));
  if (opts.signal) {
    if (opts.signal.aborted) { clearTimeout(timer); return { ok: false, ms: 0, error: { code: 'cancelled', cn: '已取消', hint: '' } }; }
    opts.signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  const t0 = Date.now();
  try {
    let res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    let retried = false;
    if (res.status === 400) {
      const et = await readBody(res.clone ? res.clone() : res, 4096);
      if (maxTokensRetryHint(et)) {
        const body2 = JSON.parse(JSON.stringify(body));
        body2.max_completion_tokens = body2.max_tokens;
        delete body2.max_tokens;
        res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers, body: JSON.stringify(body2), signal: ac.signal });
        retried = true;
      }
    }
    if (!res.ok) {
      const text = await readBody(res, 8192);
      return { ok: false, ms: Date.now() - t0, status: res.status, retried, error: classifyHttp(res.status, text) };
    }
    const text = await readBody(res, 131072);
    const ms = Date.now() - t0;
    let j;
    try { j = JSON.parse(text); } catch (_) {
      return { ok: false, ms, status: res.status, retried, error: { code: 'schema', cn: '200 但响应非 JSON', hint: '端点可能指向网页/登录页' } };
    }
    if (wire === 'anthropic-messages') {
      if (!Array.isArray(j.content) || j.type !== 'message') {
        return { ok: false, ms, status: res.status, retried, error: { code: 'schema', cn: 'Anthropic schema 不符', hint: '缺少 content[]/message' } };
      }
      const content = j.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
      return { ok: true, ms, status: res.status, retried, content, finishReason: j.stop_reason || null, usage: j.usage || null };
    }
    const ch = Array.isArray(j.choices) && j.choices[0];
    if (!ch) {
      return { ok: false, ms, status: res.status, retried, error: { code: 'schema', cn: 'OpenAI schema 不符', hint: '缺少 choices[]' } };
    }
    const content = ch.message && typeof ch.message.content === 'string' ? ch.message.content : '';
    return { ok: true, ms, status: res.status, retried, content, finishReason: ch.finish_reason || null, usage: j.usage || null };
  } catch (e) {
    if (opts.signal && opts.signal.aborted) return { ok: false, ms: Date.now() - t0, error: { code: 'cancelled', cn: '已取消', hint: '' } };
    if (/timeout/i.test(String((e && e.message) || ''))) return { ok: false, ms: Date.now() - t0, error: { code: 'timeout', cn: `超时（${opts.timeoutMs || 60000}ms）`, hint: '可在设置里放宽单格超时' } };
    return { ok: false, ms: Date.now() - t0, error: classifyNetworkErr(e) };
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener('abort', onOuterAbort);
  }
}

/** 可重试判定：429/5xx/网络层（dns/refused/tls/reset/timeout/network） */
function isRetryable(r) {
  if (!r || r.ok) return false;
  const c = r.error && r.error.code;
  if (['dns', 'refused', 'tls', 'reset', 'timeout', 'network'].includes(c)) return true;
  if (c === 'rate_limit' || c === 'server') return true;
  return false;
}

module.exports = {
  VERSION,
  MAX_SAMPLES,
  MAX_JSONL_BYTES,
  CELL_PROJECT_BYTES,
  CELL_STORE_BYTES,
  CHECK_TYPES,
  JUDGE_SYSTEM,
  maskKey,
  renderTemplate,
  extractVars,
  parseDataset,
  serializeDataset,
  normalizeChecks,
  runChecks,
  extractJsonBlock,
  textDiff,
  aggregateRuns,
  buildJudgeMessages,
  parseJudgeOutput,
  makeCellProjection,
  resolveUrls,
  stripCliModelSuffix,
  upstreamModel,
  buildHeaders,
  chatUrlOf,
  chatBody,
  maxTokensRetryHint,
  classifyNetworkErr,
  classifyHttp,
  chatOnce,
  isRetryable,
};
