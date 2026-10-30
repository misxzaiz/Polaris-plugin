'use strict';
/**
 * core.js —— needs 需求库逻辑核（零依赖；stdio MCP 与 http 服务两个薄壳共用）
 *
 * 公约（状态机/字段/硬规则）的唯一权威在需求库根目录 README.md；本模块只实现。
 * 约定：所有操作严格限制在根目录内（防穿越）；写入 tmp+rename 原子；错误一律 throw（中文消息）。
 */
const fs = require('fs');
const path = require('path');

// 与 needs/README.md 公约同步（README 是唯一权威；此处仅校验）
const STATUSES = ['idea', 'analyzed', 'specd', 'approved', 'building', 'delivered', 'published', 'shelved'];
const PRIORITIES = ['high', 'medium', 'low'];
const STAGES = ['analyze', 'write-spec', 'build-plugin'];
const ORIGINS = ['polaris-chat', 'manual', 'zcode'];
const ENTRY_RE = /^\d{3,}-[a-z0-9][a-z0-9-]*\.md$/i;

function createCore(opts) {
  const rootArg = (opts && opts.rootArg) || '';
  const appConfigDir = (opts && opts.appConfigDir) || '';

  // ── 根目录解析：--needs-root 参数 > <appConfigDir>/needs-root.json > 相对探测（源码仓）──
  let cachedConfigRoot = null;
  let configReadAt = 0;
  function configRoot() {
    if (!appConfigDir) return null;
    const now = Date.now();
    if (cachedConfigRoot !== null && now - configReadAt < 5000) return cachedConfigRoot;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(appConfigDir, 'needs-root.json'), 'utf8'));
      cachedConfigRoot = typeof j.needsRoot === 'string' && j.needsRoot ? j.needsRoot : null;
    } catch (_) { cachedConfigRoot = null; }
    configReadAt = now;
    return cachedConfigRoot;
  }

  function rootInfo() {
    if (rootArg) return { root: path.resolve(rootArg), source: 'arg' };
    const c = configRoot();
    if (c) return { root: path.resolve(c), source: 'config' };
    return { root: path.resolve(__dirname, '..', '..', '..', 'needs'), source: 'default' };
  }

  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ── 路径守卫与原子写 ──
  function entryPath(file) {
    if (!ENTRY_RE.test(file || '')) throw new Error(`非法条目文件名：${file}（应为 NNN-slug.md）`);
    const rootR = path.resolve(rootInfo().root);
    const full = path.resolve(rootR, file);
    if (full !== rootR && !full.startsWith(rootR + path.sep)) throw new Error('路径越界（只允许根目录内）');
    return full;
  }

  function atomicWrite(file, text) {
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  }

  // ── frontmatter（保序解析：未知键原样保留）──
  function parseEntry(raw) {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { fm: null, body: raw };
    const fm = [];
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
      fm.push(kv ? [kv[1], kv[2]] : [null, line]);
    }
    return { fm, body: m[2] };
  }

  function fmGet(fm, key) {
    if (!fm) return undefined;
    const hit = fm.find(([k]) => k === key);
    return hit ? hit[1] : undefined;
  }

  function fmSet(fm, key, value) {
    const hit = fm.find(([k]) => k === key);
    if (hit) hit[1] = value;
    else fm.push([key, value]);
  }

  function fmSerialize(fm) {
    return fm.map(([k, v]) => (k === null ? v : `${k}: ${v}`)).join('\n');
  }

  function parseTags(raw) {
    if (raw == null) return [];
    const inner = String(raw).trim().replace(/^\[/, '').replace(/\]$/, '');
    return inner ? inner.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }

  function scanEntries() {
    const { root } = rootInfo();
    let names;
    try { names = fs.readdirSync(root); } catch (_) { return { root, files: [] }; }
    return { root, files: names.filter((n) => ENTRY_RE.test(n)).sort() };
  }

  function slugify(title, explicit) {
    const t = String(explicit || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return t ? t.slice(0, 40) : 'need'; // 纯中文标题无 ASCII slug，回落 need，可读性靠文件内 title
  }

  // ── 操作 ──
  function configGet() {
    const { root, source } = rootInfo();
    const { files } = scanEntries();
    const hasReadme = fs.existsSync(path.join(root, 'README.md'));
    const prompts = fs.existsSync(path.join(root, 'prompts', 'analyze.md'));
    return { root, source, entryCount: files.length, hasReadme, hasPrompts: prompts };
  }

  function configSet(target) {
    if (!appConfigDir) throw new Error('当前为参数/源码模式（ZCode 侧用 --needs-root 指定），不需要也无法保存配置。');
    const resolved = path.resolve(String(target || ''));
    fs.mkdirSync(resolved, { recursive: true });
    const cfgFile = path.join(appConfigDir, 'needs-root.json');
    const tmp = `${cfgFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ needsRoot: resolved }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, cfgFile);
    cachedConfigRoot = null;
    configReadAt = 0;
    return { root: resolved };
  }

  function probeDir(target) {
    const p = path.resolve(String(target || ''));
    let exists = false;
    let isDir = false;
    try { exists = fs.existsSync(p); isDir = exists && fs.statSync(p).isDirectory(); } catch (_) { /* 保持 false */ }
    return { path: p, exists, isDir };
  }

  function renderEntry(idNum, a) {
    const t = today();
    const tags = Array.isArray(a.tags) ? a.tags : parseTags(a.tags || '');
    const origin = ORIGINS.includes(a.origin) ? a.origin : 'polaris-chat';
    return `---
id: "${String(idNum).padStart(3, '0')}"
title: ${a.title}
status: idea
priority: ${PRIORITIES.includes(a.priority) ? a.priority : 'medium'}
tags: [${tags.join(', ')}]
origin: ${origin}
created: ${t}
updated: ${t}
spec: ""
delivered: ""
---
## 一句话

${a.oneLiner || '（待补）'}

## 目标（做什么）

- ${a.goal || '（待补）'}

## 边界（明确不做什么）

- ${a.boundary || '（待补）'}

## 验收（怎么算完成）

- ${a.acceptance || '（待补）'}

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- ${t} 由 ${origin} 记录。
`;
  }

  function add(args) {
    const title = String((args && args.title) || '').trim();
    if (!title) throw new Error('缺少 title。');
    const { root, files } = scanEntries();
    let max = 0;
    for (const f of files) max = Math.max(max, parseInt(f.match(/^(\d+)/)[1], 10));
    let idNum = max + 1;
    for (let tries = 0; tries < 20; tries++) {
      const file = `${String(idNum).padStart(3, '0')}-${slugify(title, args.slug)}.md`;
      const full = path.join(root, file);
      try {
        const fd = fs.openSync(full, 'wx');            // 排他创建：双端并发 add 撞号自动递增
        fs.writeSync(fd, renderEntry(idNum, args), 'utf8');
        fs.closeSync(fd);
        const mtimeMs = fs.statSync(full).mtimeMs;
        return { id: String(idNum).padStart(3, '0'), file, title, mtimeMs };
      } catch (e) {
        if (e && e.code === 'EEXIST') { idNum++; continue; }
        if (e && e.code === 'ENOENT') throw new Error(`根目录不存在：${root}\n请先在设置里指定有效根目录。`);
        throw e;
      }
    }
    throw new Error('连续 20 次撞号，放弃');
  }

  function list(filter) {
    const { root, files } = scanEntries();
    const wantStatus = (filter && filter.status) || '';
    const wantTag = ((filter && filter.tag) || '').toLowerCase();
    const wantQ = ((filter && filter.q) || '').toLowerCase();
    const rows = [];
    for (const f of files) {
      let raw; try { raw = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
      const { fm } = parseEntry(raw);
      const status = (fmGet(fm, 'status') || '').trim();
      const tags = parseTags(fmGet(fm, 'tags'));
      const title = (fmGet(fm, 'title') || '').trim();
      if (wantStatus && status !== wantStatus) continue;
      if (wantTag && !tags.some((t) => t.toLowerCase() === wantTag)) continue;
      if (wantQ && !(title.toLowerCase().includes(wantQ) || raw.toLowerCase().includes(wantQ))) continue;
      const pending = countPending(raw);
      rows.push({
        id: (fmGet(fm, 'id') || '').replace(/"/g, '').trim(),
        file: f,
        title,
        status,
        priority: (fmGet(fm, 'priority') || '').trim(),
        tags,
        origin: (fmGet(fm, 'origin') || '').trim(),
        created: (fmGet(fm, 'created') || '').trim(),
        updated: (fmGet(fm, 'updated') || '').trim(),
        spec: (fmGet(fm, 'spec') || '').trim(),
        delivered: (fmGet(fm, 'delivered') || '').trim(),
        pendingClarify: pending,
        mtimeMs: fs.statSync(path.join(root, f)).mtimeMs,
      });
    }
    return { root, rows };
  }

  function countPending(raw) {
    const m = raw.match(/##\s+待澄清([\s\S]*?)(?=\n##\s|$)/);
    if (!m) return 0;
    const body = m[1];
    const q = body.match(/^\s*(?!A\d*[:：])([-*]|\d+[.、])?\s*\S.*$/gm) || [];
    return q.filter((l) => l.trim() && !l.includes('（夜班分析时补写')).length;
  }

  function findFile(id) {
    const { root, files } = scanEntries();
    const hit = files.find((f) => f.startsWith(`${String(id).replace(/^0+/, '').padStart(3, '0')}-`))
      || files.find((f) => parseInt(f.match(/^(\d+)/)[1], 10) === parseInt(id, 10));
    if (!hit) throw new Error(`找不到条目 id=${id}（根目录：${root}）。`);
    return { root, file: hit };
  }

  function show(id) {
    const { root, file } = findFile(id);
    const full = entryPath(file);
    const raw = fs.readFileSync(full, 'utf8');
    const { fm } = parseEntry(raw);
    return { root, file, title: (fmGet(fm, 'title') || '').trim(), mtimeMs: fs.statSync(full).mtimeMs, raw };
  }

  function appendToSection(body, section, text) {
    const lines = body.split('\n');
    const esc = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hi = lines.findIndex((l) => new RegExp(`^##\\s+${esc}\\s*$`).test(l.trim()));
    if (hi === -1) return `${body.replace(/\s*$/, '')}\n\n## ${section}\n\n${text}\n`;
    let j = hi + 1;
    while (j < lines.length && !/^##\s+/.test(lines[j])) j++;
    lines.splice(j, 0, text, '');
    return lines.join('\n');
  }

  function update(id, args) {
    const fields = (args && args.fields) || {};
    const append = (args && args.append) || null;
    const expected = args && args.expectedMtimeMs != null ? Number(args.expectedMtimeMs) : null;
    if (!Object.keys(fields).length && !append) throw new Error('无事可做：fields 与 append 至少给一个。');
    if (fields.status != null && !STATUSES.includes(fields.status)) {
      throw new Error(`非法 status：${fields.status}（枚举见需求库 README.md：${STATUSES.join(' → ')} / shelved）`);
    }
    if (fields.priority != null && !PRIORITIES.includes(fields.priority)) {
      throw new Error(`非法 priority：${fields.priority}（${PRIORITIES.join(' | ')}）`);
    }
    const { file } = findFile(id);
    const full = entryPath(file);
    const st = fs.statSync(full);
    if (expected != null && Math.abs(st.mtimeMs - expected) > 1) {
      const e = new Error(`乐观锁冲突：条目在你读取后被改过（期望 mtimeMs=${expected}，实际 ${st.mtimeMs}）。请重新读取后再更新。`);
      e.code = 'NEEDS_CONFLICT';
      e.actualMtimeMs = st.mtimeMs;
      throw e;
    }
    const raw = fs.readFileSync(full, 'utf8');
    const { fm, body } = parseEntry(raw);
    if (!fm) throw new Error('条目缺 frontmatter（--- 头），拒绝盲改；请人工检查该文件。');
    for (const key of Object.keys(fields)) {
      let v = fields[key];
      if (key === 'tags') v = `[${(Array.isArray(v) ? v : parseTags(v)).join(', ')}]`;
      if (typeof v === 'string' && /[\r\n]/.test(v)) throw new Error(`字段 ${key} 不允许换行（正文内容请用 append 写进对应节）。`);
      fmSet(fm, key, String(v));
    }
    fmSet(fm, 'updated', today());
    let newBody = body;
    if (append && append.section && append.text) newBody = appendToSection(body, String(append.section), String(append.text));
    atomicWrite(full, `---\n${fmSerialize(fm)}\n---\n${newBody}`);
    return { file, done: Object.keys(fields).map((k) => `${k}=${fields[k]}`).join(' ') + (append ? ` +追加[${append.section}]` : ''), mtimeMs: fs.statSync(full).mtimeMs };
  }

  function handoff(id, stage) {
    if (!STAGES.includes(stage)) throw new Error(`stage 须为 ${STAGES.join(' | ')} 之一。`);
    const { root: rootR } = rootInfo();
    const promptFile = path.join(rootR, 'prompts', `${stage}.md`);
    if (!fs.existsSync(promptFile)) throw new Error(`提示词模板缺失：${promptFile}`);
    const info = show(id);
    const text = fs.readFileSync(promptFile, 'utf8')
      .split('{{ROOT}}').join(rootR)
      .split('{{ENTRY_PATH}}').join(path.join(rootR, info.file))
      .split('{{ID}}').join(String(id))
      .split('{{TITLE}}').join(info.title)
      .split('{{BODY}}').join(info.raw.trim());
    return { file: info.file, stage, text };
  }

  return { STATUSES, PRIORITIES, STAGES, ORIGINS, rootInfo, configGet, configSet, probeDir, add, list, show, update, handoff };
}

module.exports = { createCore, STATUSES, PRIORITIES, STAGES, ORIGINS };
