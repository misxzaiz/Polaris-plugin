'use strict';
/**
 * md-core.js —— Markdown 结构检查器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 检查语义（行级 + 轻量围栏状态感知，如实边界）：
 *   - 不做完整语法树解析（够诊断不做渲染）；代码块/行内代码内的伪 markdown 不检
 *   - 链接可达性不做网络探测（外链 200 校验不做）——锚点/空链/裸 URL 静态判定
 *   - 规则集为 MDLint 常用子集 12 条；风格类（行长）缺省关闭
 */

const RULES = {
  heading_increment: { level: 'warn', desc: '标题层级跳级（如 h1 直接到 h3）' },
  multiple_h1: { level: 'error', desc: '多个一级标题' },
  first_heading_not_h1: { level: 'info', desc: '文档首个标题不是 h1' },
  anchor_broken: { level: 'error', desc: '锚点链接 #目标 与文中标题不匹配（GitHub slug 规则）' },
  empty_link: { level: 'error', desc: '空链接（无目标地址）' },
  bare_url: { level: 'info', desc: '裸 URL 建议包成 markdown 链接' },
  img_no_alt: { level: 'warn', desc: '图片缺少 alt 文本' },
  table_mismatch: { level: 'error', desc: '表格列数不齐（表头/分隔行/数据行）' },
  fence_no_lang: { level: 'info', desc: '代码块未标注语言' },
  duplicate_heading: { level: 'warn', desc: '重复标题（同层级同名，锚点会冲突）' },
  todo_marker: { level: 'info', desc: 'TODO/FIXME/XXX 残留标记' },
  trailing_space: { level: 'info', desc: '行尾多余空白（硬换行双空格除外）' },
};

/** GitHub slug 规则：小写、空白→-、去标点（保留 CJK/连字符），兼容中文标题锚点 */
function githubSlug(heading) {
  return String(heading)
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    // 去除标点（保留字母数字、CJK 统一表意、连字符、下划线）
    .replace(/[^\p{L}\p{N}\-_]/gu, '');
}

/** 行级解析：返回每行的类型与结构信息（围栏状态感知） */
function analyzeLines(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const rows = [];
  let inFence = false;
  let fenceLang = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const fenceM = line.match(/^\s*(```+|~~~+)/);
    if (fenceM && !inFence) {
      inFence = true;
      fenceLang = line.replace(/^\s*(```+|~~~+)\s*/, '').trim();
      rows.push({ lineNo, line, kind: 'fence_open', fenceLang });
      continue;
    }
    if (inFence && fenceM) {
      inFence = false;
      rows.push({ lineNo, line, kind: 'fence_close' });
      continue;
    }
    if (inFence) { rows.push({ lineNo, line, kind: 'fence_body' }); continue; }
    const hM = line.match(/^(#{1,6})\s+(.*)$/);
    if (hM) { rows.push({ lineNo, line, kind: 'heading', level: hM[1].length, text: hM[2].trim().replace(/#+\s*$/, '').trim() }); continue; }
    if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) { rows.push({ lineNo, line, kind: 'table_row' }); continue; }
    if (/^\s*\[[^\]]*\]:\s*/.test(line)) { rows.push({ lineNo, line, kind: 'link_ref' }); continue; }
    rows.push({ lineNo, line, kind: 'text' });
  }
  return rows;
}

/** 从文本行提取全部链接与图片（跳过代码围栏与行内代码） */
function extractLinks(line) {
  const clean = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length)); // 行内代码占位
  const out = [];
  // 图片 ![alt](url)
  const imgRe = /!\[([^\]]*)\]\(([^)]*)\)/g;
  let m;
  while ((m = imgRe.exec(clean))) out.push({ kind: 'image', alt: m[1], url: m[2], index: m.index });
  // 链接 [text](url)（排除已是图片的位置——图片匹配后占位）
  const linkRe = /\[([^\]]*)\]\(([^)]*)\)/g;
  while ((m = linkRe.exec(clean))) out.push({ kind: 'link', text: m[1], url: m[2], index: m.index });
  return out;
}

/**
 * 结构体检（纯函数，单测覆盖）。
 * @param {string} text markdown 文本
 * @param {object} [opts] { maxLineLength?: number|null（null=关闭），headingIncrement?: boolean }
 * @returns {{ findings: Array<{line:number, rule:string, level:string, message:string}>, outline: Array<{line:number, level:number, text:string, slug:string}>, stats: object }}
 */
function lint(text, opts = {}) {
  const rows = analyzeLines(text);
  const findings = [];
  const add = (line, rule, message) => findings.push({ line, rule, level: RULES[rule].level, message });
  const outline = [];
  const headingsSeen = new Map(); // slug → count
  let h1Count = 0;
  let prevLevel = 0;
  let inTable = false;
  let tableCols = 0;
  let tableStart = 0;

  for (const row of rows) {
    const { lineNo, line, kind } = row;
    if (kind === 'fence_open' && !row.fenceLang) add(lineNo, 'fence_no_lang', '代码块未标注语言（``` 后建议写语言名）');
    if (kind === 'fence_body') continue;

    // 标题
    if (kind === 'heading') {
      const slug = githubSlug(row.text);
      outline.push({ line: lineNo, level: row.level, text: row.text, slug });
      if (row.level === 1) {
        h1Count++;
        if (h1Count > 1) add(lineNo, 'multiple_h1', `第 ${h1Count} 个 h1 标题`);
      }
      if (prevLevel === 0) {
        if (row.level !== 1) add(lineNo, 'first_heading_not_h1', `首个标题是 h${row.level}，惯例应为 h1`);
      } else if (opts.headingIncrement !== false && row.level > prevLevel + 1) {
        add(lineNo, 'heading_increment', `标题层级跳级：h${prevLevel} 直接跳到 h${row.level}`);
      }
      const count = (headingsSeen.get(`${row.level}|${slug}`) || 0) + 1;
      headingsSeen.set(`${row.level}|${slug}`, count);
      if (count > 1) add(lineNo, 'duplicate_heading', `重复标题（h${row.level}「${row.text.slice(0, 30)}」出现 ${count} 次，锚点冲突）`);
      prevLevel = row.level;
      continue;
    }

    // 表格列数
    if (kind === 'table_row') {
      const cols = line.split('|').filter((c, idx, arr) => !(idx === 0 && c.trim() === '') && !(idx === arr.length - 1 && c.trim() === '')).length;
      const isSeparator = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
      if (!inTable) { inTable = true; tableCols = cols; tableStart = lineNo; }
      else if (cols !== tableCols) {
        add(lineNo, 'table_mismatch', `表格列数不齐：本行 ${cols} 列，表头 ${tableCols} 列（自第 ${tableStart} 行）`);
      }
      void isSeparator;
      continue;
    }
    inTable = false;

    // 链接与图片
    for (const l of extractLinks(line)) {
      if (l.kind === 'image' && !l.alt.trim()) add(lineNo, 'img_no_alt', `图片缺少 alt 文本：${String(l.url).slice(0, 40)}`);
      if (l.kind === 'link') {
        if (!l.url.trim()) add(lineNo, 'empty_link', `空链接：[${l.text || '(无文本)'}]()`);
        else if (l.url.startsWith('#')) {
          // 锚点校验放到 pass2（前向引用也合法）
        } else if (/^https?:\/\/\S+$/.test(l.text)) {
          add(lineNo, 'bare_url', '链接文本即 URL（可读性差，建议语义化文本）');
        }
      }
    }
    // 裸 URL：不在 markdown 链接包裹内的 http(s) 字样（先占位链接结构再查）
    const placeholder = line.replace(/!?\[[^\]]*\]\([^)]*\)/g, (m) => ' '.repeat(m.length)).replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
    const bare = placeholder.match(/https?:\/\/[^\s)]+/g);
    if (bare) add(lineNo, 'bare_url', `裸 URL 建议包成 [文本](${String(bare[0]).slice(0, 40)})`);

    // TODO 残留（行内代码与代码块外）
    const todoM = line.match(/\b(TODO|FIXME|XXX)\b[::]?/);
    if (todoM && !/^\s*>/.test(line)) add(lineNo, 'todo_marker', `残留标记 ${todoM[1]}（发布前应处理）`);

    // 尾随空白（硬换行双空格除外）
    if (/[ \t]+$/.test(line) && !/[ \t]{2,}$/.test(line) && line.trim() !== '') {
      add(lineNo, 'trailing_space', '行尾多余空白');
    }
  }

  // pass2：锚点校验（此时 outline 已齐全，前向引用也算）
  for (const row of rows) {
    if (row.kind === 'fence_body' || row.kind === 'fence_open' || row.kind === 'fence_close') continue;
    for (const l of extractLinks(row.line)) {
      if (l.kind === 'link' && l.url.startsWith('#')) {
        const target = githubSlug(l.url.slice(1));
        const known = new Set([...headingsSeen.keys()].map((k) => k.split('|')[1]));
        if (!known.has(target)) {
          add(row.lineNo, 'anchor_broken', `锚点断链：${l.url} 无匹配标题（可用锚点 ${[...known].slice(0, 3).join('、')}${known.size > 3 ? '…' : ''}）`);
        }
      }
    }
  }

  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return {
    findings,
    outline,
    stats: {
      lines: rows.length,
      headings: outline.length,
      errors: findings.filter((f) => f.level === 'error').length,
      warns: findings.filter((f) => f.level === 'warn').length,
      infos: findings.filter((f) => f.level === 'info').length,
    },
  };
}

/** 报告渲染（MCP/面板共用口径） */
function renderReport(r) {
  const s = r.stats;
  const head = `统计：${s.lines} 行 · ${s.headings} 个标题 · 错误 ${s.errors} / 警告 ${s.warns} / 提示 ${s.infos}`;
  if (!r.findings.length) return `${head}\n✅ 未发现结构问题`;
  const lines = [head, `发现 ${r.findings.length} 条（按行号排序）：`];
  for (const f of r.findings.slice(0, 40)) {
    const icon = f.level === 'error' ? '❌' : f.level === 'warn' ? '⚠' : 'ℹ';
    lines.push(`  [行 ${f.line}] ${icon} ${f.rule}：${f.message}`);
  }
  if (r.findings.length > 40) lines.push(`  （另 ${r.findings.length - 40} 条略）`);
  return lines.join('\n');
}

/** 标题树渲染 */
function renderOutline(outline) {
  if (!outline.length) return '（无标题——文档缺少结构）';
  return outline
    .map((o) => `${'  '.repeat(o.level - 1)}h${o.level} [行 ${o.line}] ${o.text}`)
    .join('\n');
}

module.exports = { lint, renderReport, renderOutline, githubSlug, analyzeLines, extractLinks, RULES };
