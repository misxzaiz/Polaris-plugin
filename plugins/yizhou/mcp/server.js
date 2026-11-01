#!/usr/bin/env node
'use strict';
/**
 * server.js —— 双语阅读 MCP server（stdio JSON-RPC，零依赖）
 *
 * 六个工具：yz_fetch / yz_more / yz_save / yz_list / yz_read / yz_delete
 *
 * 数据流：
 *   yz_fetch：SSRF 守卫 → 原生 fetch（20s/3MB/浏览器 UA）→ 三级字符集探测 →
 *             琥珀同款打分抽取 → markdown-lite 分段 → cap.kv yz.* 入库 →
 *             返回「批次 0 原文 + 翻译契约」；AI 逐批翻译并 yz_save（幂等续译）。
 *   面板从同一 yz.* 键空间读（yz.idx / yz.art.<id>.p.<c>），零服务进程。
 *
 * 键空间（权威契约见 README；写者纪律）：
 *   yz.idx            仅本进程写（索引数组）
 *   yz.art.<id>.p.<c> 仅本进程写（段落分块，100 段/块，译文随段落存）
 *   yz.pos.<id>       仅面板写（阅读进度；删文时由本进程一并清理）
 *   yz.settings       仅面板写
 *
 * 协议纪律（kb/mcp.md）：stdout 只出 JSON-RPC 协议数据；日志一律 stderr。
 */
const VERSION = '0.1.0';
const appConfigDir = process.argv[2] || '';

const core = require('../shared/core');
const lib = require('../shared/lib');
const charset = require('../shared/charset');
const ex = require('../shared/extract');
const { createKvClient } = require('../shared/kvclient');

function log(level, msg) {
  try { process.stderr.write(`[yizhou][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// 测试钩子：内存桥冒烟需要 yz_fetch 能抓本地 stub 页面。仅当进程显式带此 env
// （测试注入）时放行环回地址；生产 MCP 进程不带 env，SSRF 守卫永远生效。
const TEST_ALLOW_LOCAL = process.env.YIZOU_ALLOW_LOCAL === '1';
function fetchable(url) {
  return TEST_ALLOW_LOCAL ? /^https?:\/\//i.test(String(url || '')) : lib.isFetchableUrl(url);
}

// ── 读取包装：kv 读失败一律容忍（键可能刚被并发删掉，kb/data 层坑） ──────────
const IDX_KEY = 'yz.idx';
const READ_CAP_CHARS = 40000;          // yz_read 返回上限（超出截断并如实标注）

async function kvGet(key) {
  try { return await kv.kvGet(key); } catch (_) { return null; }
}
async function loadIdx() {
  const v = await kvGet(IDX_KEY);
  return Array.isArray(v) ? v : [];
}
async function saveIdx(arr) {
  await kv.kvSet(IDX_KEY, arr);
}
function artChunkKeys(id, segCount) {
  const n = core.chunkCount(segCount) + 1; // 多扫一块防陈旧残留
  const keys = [];
  for (let c = 0; c < n; c++) keys.push(core.chunkKey(id, c));
  return keys;
}
async function loadSegs(id, segCount) {
  const keys = artChunkKeys(id, segCount);
  const parts = await Promise.all(keys.map((k) => kvGet(k)));
  return core.assembleSegs(parts);
}
async function saveSegs(id, segs) {
  const map = core.splitChunks(segs);
  for (const [c, arr] of map) {
    // eslint-disable-next-line no-await-in-loop
    await kv.kvSet(core.chunkKey(id, c), arr);
  }
}
async function deleteArticleKeys(id, segCount) {
  const keys = artChunkKeys(id, segCount || 0);
  keys.push(`yz.pos.${id}`); // 阅读进度随文章生命周期清理（键空间契约注明）
  for (const k of keys) {
    // eslint-disable-next-line no-await-in-loop
    await kv.kvDel(k).catch(() => {});
  }
}

// ── 工具返回包装 ─────────────────────────────────────────────────────────────
function okText(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function errText(text) {
  return { content: [{ type: 'text', text: `【失败】${text}` }], isError: true };
}
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

const TGT_LANGS = new Set(['zh', 'en', 'ja', 'ko']);
function normalizeTgtLang(v) {
  const s = String(v || '').trim().toLowerCase();
  return TGT_LANGS.has(s) ? s : 'zh';
}

// ── 渲染：给 AI 的批次原文 + 翻译契约 ────────────────────────────────────────
function contractLines(entry) {
  return [
    '翻译契约（务必遵守）：',
    '1) 逐段翻译：items 的 i 对应下面 [i] 段号；不要合并、拆分或跳过段落。',
    '2) "#"/"##" 开头的标题段：保留井号与空格前缀，只译标题文字。',
    '3) "- " 列表段、"> " 引用段：保留前缀再译。',
    '4) ``` 代码段：系统自动原样收编，你无需返回。',
    '5) 含 " ｜ " 的表格行：逐格翻译并保留 " ｜ " 分隔。',
    '6) 每译完一批就调用 yz_save（items=[{i,dst}]，dst=该段译文）。',
    '7) 全部批次保存完成后：告诉用户「打开双语阅读面板阅读」即可，不要在对话里粘贴全文。',
  ];
}

function renderBatchHeader(entry, batch, batchIdx) {
  const pct = entry.segCount ? Math.round((entry.translated / entry.segCount) * 100) : 0;
  return `《${entry.title}》 ｜ [id] ${entry.id} ｜ ${entry.site} ｜ `
    + `原文:${core.langLabel(entry.srcLang)} → 译入:${core.langLabel(entry.tgtLang)} ｜ `
    + `共 ${entry.segCount} 段 / ${entry.totalChars} 字符 ｜ 进度 ${entry.translated}/${entry.segCount}（${pct}%） ｜ `
    + `本批=第 ${batchIdx}/${entry.batches - 1} 批（段 ${batch.start}..${batch.end - 1}）`
    + (entry.truncated ? ' ｜ ⚠ 正文超长已截断' : '');
}

function renderBatch(entry, segs, batch, batchIdx, withContract) {
  const lines = [];
  lines.push(renderBatchHeader(entry, batch, batchIdx));
  if (withContract) lines.push('', ...contractLines(entry));
  lines.push('', `—— 第 ${batchIdx} 批原文 ——`);
  for (let i = batch.start; i < batch.end; i++) {
    const seg = segs[i];
    if (!seg) continue;
    lines.push(`[${seg.i}] ${seg.src}`);
  }
  if (batchIdx + 1 < entry.batches) {
    lines.push('', `译完本批请 yz_save，然后 yz_more 取第 ${batchIdx + 1} 批。`);
  } else {
    lines.push('', '这是最后一批，译完 yz_save 即全部完成。');
  }
  return lines.join('\n');
}

/** 找第一个还有未译段的批号（断点续译入口；全译完返回 -1） */
function nextUntranslatedBatch(segs, batches) {
  for (let b = 0; b < batches.length; b++) {
    for (let i = batches[b].start; i < batches[b].end; i++) {
      if (segs[i] && !segs[i].dst) return b;
    }
  }
  return -1;
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolFetch(args) {
  const nurl = lib.normalizeUrl(args && args.url);
  if (nurl.error) return errText(nurl.error);
  if (!fetchable(nurl.url)) {
    return errText('仅支持公网 http(s) 地址（内网/环回/云元数据地址不允许抓取）');
  }
  const tgtLang = normalizeTgtLang(args && args.targetLang);

  const f = await lib.fetchUrl(nurl.url);
  if (!f.ok) return errText(`抓取失败：${f.error}`);
  const ct = f.contentType || '';
  if (ct && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(ct)) {
    return errText(`不支持的内容类型：${oneLine(ct, 80)}（双语阅读只翻译网页正文；PDF/图片请用对应工具）`);
  }
  const decoded = charset.decodeBuffer(f.buffer, ct);
  const r = ex.extractBlocks(decoded.text);
  if (!r.ok) return errText(`抽取失败：${r.error}（页面可能是 JS 渲染空壳，可在浏览器打开后复制正文让我直接翻译）`);
  const segs = core.normalizeSegments(r.blocks);
  if (!segs.length) return errText('抽取结果为空，没有可翻译的正文');
  const totalChars = segs.reduce((n, s) => n + s.src.length, 0);
  if (totalChars > core.MAX_TOTAL_CHARS) {
    return errText(`正文 ${totalChars} 字符超出单篇上限 ${core.MAX_TOTAL_CHARS}；请分篇翻译或先让用户摘选`);
  }

  const id = core.articleId(nurl.url);
  const idx0 = await loadIdx();
  const prev = core.findInIndex(idx0, id);
  if (prev) await deleteArticleKeys(id, prev.segCount); // 重抓同 URL = 替换正文并清空旧译文

  const batches = core.planBatches(segs);
  await saveSegs(id, segs);
  const entry = core.idxEntry({
    id,
    url: nurl.url,
    site: lib.safeHost(nurl.url),
    title: r.title || '(无标题)',
    byline: r.byline || '',
    srcLang: core.detectSrcLang(segs.map((s) => s.src).join('\n')),
    tgtLang,
    segCount: segs.length,
    totalChars,
    batches: batches.length,
    translated: 0,
    truncated: !!r.truncated || !!f.truncated,
  });
  await saveIdx(core.upsertIndex(idx0, entry));

  log('info', `fetched ${entry.site} 《${oneLine(entry.title, 40)}》 ${segs.length} 段 → ${id}`);
  return okText(renderBatch(entry, segs, batches[0], 0, true)
    + (prev ? `\n（该 URL 此前已入库，本次为重新抓取：正文已替换，旧译文已清空）` : ''));
}

async function toolMore(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return errText('缺少 id（用 yz_list 查询）');
  const idx = await loadIdx();
  const entry = core.findInIndex(idx, id);
  if (!entry) return errText(`未找到文章 ${id}`);
  const segs = await loadSegs(id, entry.segCount);
  if (!segs.length) return errText('文章段落数据缺失（可能被清理），请重新 yz_fetch');

  let b = args && args.batch !== undefined && args.batch !== null
    ? core.clampInt(args.batch, 0, entry.batches - 1, -1) : -1;
  const batches = core.planBatches(segs); // 与入库同规则重算，段长未变则边界一致
  if (b < 0) b = nextUntranslatedBatch(segs, batches);
  if (b < 0) {
    return okText(`${renderBatchHeader(entry, { start: 0, end: 0 }, 0)}\n\n全部段落已翻译完成，打开双语阅读面板阅读即可。`);
  }
  const batch = batches[b];
  if (!batch) return errText(`批号 ${b} 不存在（共 ${entry.batches} 批）`);
  return okText(renderBatch(entry, segs, batch, b, false));
}

async function toolSave(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return errText('缺少 id');
  const items = args && args.items;
  if (!Array.isArray(items) || !items.length) return errText('缺少 items（[{i, dst}]）');
  const idx = await loadIdx();
  const entry = core.findInIndex(idx, id);
  if (!entry) return errText(`未找到文章 ${id}（先 yz_fetch 入库）`);
  const segs = await loadSegs(id, entry.segCount);
  if (!segs.length) return errText('文章段落数据缺失，请重新 yz_fetch');

  const autoFilled = core.autoFillCodeSegs(segs);
  const merged = core.mergeTranslations(segs, items);
  if (!merged.applied && !autoFilled) {
    const detail = merged.invalid ? `，其中 ${merged.invalid} 条译文为空被拒收` : '';
    return errText(`没有生效的译文（skipped=${merged.skipped} 段号未命中${detail}）`);
  }
  await saveSegs(id, merged.segs);
  entry.translated = core.translatedCount(merged.segs);
  entry.updatedAt = core.nowIso();
  await saveIdx(core.upsertIndex(idx, entry));

  const pct = core.progressPct(merged.segs);
  const batches = core.planBatches(merged.segs);
  const lines = [`已保存 ${merged.applied} 段${autoFilled ? `（另自动收编代码段 ${autoFilled} 段）` : ''}`
    + `${merged.invalid ? `，拒收空译文 ${merged.invalid} 条` : ''}${merged.skipped ? `，未命中 ${merged.skipped} 条` : ''}。`];
  lines.push(renderBatchHeader(entry, { start: 0, end: 0 }, 0));
  if (pct >= 100) {
    lines.push('✅ 全部翻译完成！告诉用户：打开「双语阅读」面板即可阅读双语全文（手机端同库）。');
  } else {
    const nb = nextUntranslatedBatch(merged.segs, batches);
    lines.push(`进度 ${pct}%。还有剩余批次${nb >= 0 ? `（下一批=第 ${nb} 批，用 yz_more 取）` : ''}，继续翻译。`);
  }
  return okText(lines.join('\n'));
}

async function toolList() {
  const idx = await loadIdx();
  if (!idx.length) {
    return okText('双语阅读暂无文章。对用户说：发我一个网页链接，说「帮我把这篇翻译成双语」即可。');
  }
  const lines = [`双语阅读共 ${idx.length} 篇（新→旧）：`];
  for (const e of idx) {
    const pct = e.segCount ? Math.round(((e.translated || 0) / e.segCount) * 100) : 0;
    lines.push(`[${e.id}] ${oneLine(e.title, 60)} ｜ ${e.site} ｜ ${e.segCount}段 ｜ 已译${pct}% ｜ ${String(e.addedAt || '').slice(0, 10)}`);
  }
  return okText(lines.join('\n'));
}

async function toolRead(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return errText('缺少 id（用 yz_list 查询）');
  const modeRaw = String((args && args.mode) || 'bilingual').toLowerCase();
  const mode = ['bilingual', 'src', 'dst'].includes(modeRaw) ? modeRaw : 'bilingual';
  const idx = await loadIdx();
  const entry = core.findInIndex(idx, id);
  if (!entry) return errText(`未找到文章 ${id}`);
  const segs = await loadSegs(id, entry.segCount);
  if (!segs.length) return errText('文章段落数据缺失，请重新 yz_fetch');
  let text = core.bilingualMarkdown(entry, segs, mode);
  let note = '';
  if (text.length > READ_CAP_CHARS) {
    text = text.slice(0, READ_CAP_CHARS);
    note = `\n\n（全文超 ${READ_CAP_CHARS} 字符已截断；完整版请让用户打开双语阅读面板）`;
  }
  const pct = core.progressPct(segs);
  return okText(`《${entry.title}》（${pct}% 已译，mode=${mode}）\n\n${text}${note}`);
}

async function toolDelete(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return errText('缺少 id（用 yz_list 查询）');
  if (!(args && args.confirm === true)) {
    return errText('删除会连同全部译文一起移除且不可恢复。请先与用户确认，然后带 confirm:true 重试。');
  }
  const idx = await loadIdx();
  const entry = core.findInIndex(idx, id);
  if (!entry) return errText(`未找到文章 ${id}（可能已删除）`);
  await deleteArticleKeys(id, entry.segCount);
  const rest = core.removeFromIndex(idx, id);
  if (rest.length) await saveIdx(rest);
  else await kv.kvDel(IDX_KEY).catch(() => {}); // 空库不留索引键（卸载即净）
  log('info', `deleted ${id}`);
  return okText(`已删除《${oneLine(entry.title, 60)}》及其全部译文。`);
}

// ── 工具清单（description 写「适用句式」，AI 靠它匹配意图） ───────────────────
const TOOLS = [
  {
    name: 'yz_fetch',
    description: '把一个网页链接抓取、抽出正文、分好段入库，返回第一批原文供你翻译。'
      + '适用：用户发来链接说「帮我把这篇翻译成双语」「翻译这个网页」「中英对照读一下」。'
      + '返回文本里带翻译契约与段号，按契约逐批翻译并 yz_save。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '网页 URL（http/https，仅公网地址）' },
        targetLang: { type: 'string', description: '译入语言：zh（默认）/en/ja/ko' },
      },
      required: ['url'],
    },
  },
  {
    name: 'yz_more',
    description: '取双语阅读文章的下一批原文段（batch 缺省=第一个还有未译段的批，即断点续译）。'
      + '适用：yz_fetch/yz_save 返回提示取下一批时；用户说「继续翻译」时先 yz_list 找到 id 再用本工具。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文章 id（yz_list 可查）' },
        batch: { type: 'number', description: '批号（0 起）；缺省=自动跳到第一个未译批' },
      },
      required: ['id'],
    },
  },
  {
    name: 'yz_save',
    description: '保存一批译文：items=[{i,dst}]，i=段号（与原文 [i] 对应），dst=该段译文。幂等可重试；返回进度与下一步提示。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文章 id' },
        items: {
          type: 'array',
          description: '译文数组',
          items: {
            type: 'object',
            properties: {
              i: { type: 'number', description: '段号' },
              dst: { type: 'string', description: '该段译文（遵守翻译契约的标记前缀）' },
            },
            required: ['i', 'dst'],
          },
        },
      },
      required: ['id', 'items'],
    },
  },
  {
    name: 'yz_list',
    description: '列出双语阅读全部文章（id/标题/站点/翻译进度）。适用：「我翻译过哪些」「双语阅读里有什么」「继续翻译之前那篇」。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'yz_read',
    description: '读一篇已入库文章的双语全文（供引用、总结、朗读脚本）。mode=bilingual（默认）/src/dst。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文章 id' },
        mode: { type: 'string', description: 'bilingual 中外对照 / src 原文 / dst 译文' },
      },
      required: ['id'],
    },
  },
  {
    name: 'yz_delete',
    description: '从双语阅读删除一篇文章（连同全部译文，不可恢复）。confirm 必须为 true；删前先与用户确认。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文章 id' },
        confirm: { type: 'boolean', description: '确认删除（必须显式 true）' },
      },
      required: ['id', 'confirm'],
    },
  },
];

// ── 调度 ────────────────────────────────────────────────────────────────────
async function callTool(name, args) {
  switch (name) {
    case 'yz_fetch': return toolFetch(args);
    case 'yz_more': return toolMore(args);
    case 'yz_save': return toolSave(args);
    case 'yz_list': return toolList();
    case 'yz_read': return toolRead(args);
    case 'yz_delete': return toolDelete(args);
    default: return errText(`未知工具 ${name}`);
  }
}

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handle(msg) {
  const method = msg && msg.method;
  if (method === 'initialize') {
    return write({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'yizhou', version: VERSION },
      },
    });
  }
  if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return; // 通知无响应
  if (method === 'tools/list') {
    return write({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
  }
  if (method === 'tools/call') {
    const params = msg.params || {};
    let result;
    try {
      result = await callTool(String(params.name || ''), params.arguments || {});
    } catch (e) {
      log('error', `tool ${params.name}: ${e && e.stack || e}`);
      result = errText(`工具执行异常：${(e && e.message) || e}`);
    }
    return write({ jsonrpc: '2.0', id: msg.id, result });
  }
  if (msg && msg.id !== undefined) {
    return write({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let idx = buf.indexOf('\n');
  while (idx >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) {
      let msg = null;
      try { msg = JSON.parse(line); } catch (e) { log('warn', `bad json line: ${oneLine(line, 80)}`); }
      if (msg) handle(msg).catch((e) => log('error', `handle: ${e && e.stack || e}`));
    }
    idx = buf.indexOf('\n');
  }
});
process.stdin.on('end', () => process.exit(0));

log('info', `yizhou mcp v${VERSION} ready (appConfigDir=${appConfigDir || 'none'})`);
