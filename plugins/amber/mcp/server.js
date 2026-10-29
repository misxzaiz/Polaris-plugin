#!/usr/bin/env node
'use strict';
/**
 * amber MCP Server —— 网页封存的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 amber.* 键空间的读写。本进程**不直接抓外网**——封存抓取全部通过命令
 * 信箱（amber.cmd.*）委托给后台服务执行（浏览器同源策略管不到服务进程；
 * 同时保证"单一抓取路径"不出现第二条写法）。
 *
 * 工具一览：
 *   amber_save     封存网页 URL（幂等：同 URL 永远同一网页封存；重复调用=层积重封）
 *   amber_list     列收藏（未读/星标/标签/来源/异常过滤）——「翻收藏库」入口
 *   amber_search   全文检索语料库（BM25-lite，命令信箱 + 轮询结果槽）
 *   amber_read     读某条网页封存的完整封存正文（AI 精读主入口）
 *   amber_mark     标记已读/星标、增删标签
 *   amber_quote    存金句摘录 / 列出某条的摘录
 *   amber_delete   删除网页封存（联动清理正文与摘录）
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const lib = require('../service/lib');
const { sha256Hex } = require('../shared/sha256');

const SERVER_NAME = 'amber';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

const K = {
  item: (id) => `amber.item.${id}`,
  itemPrefix: 'amber.item.',
  body: (id) => `amber.body.${id}`,
  bodyPrefix: 'amber.body.',
  quotePrefix: 'amber.quote.',
  cmdAmberize: (n) => `amber.cmd.amberize.${n}`,
  cmdRefresh: (id) => `amber.cmd.refresh.${id}`,
  cmdForget: (id) => `amber.cmd.forget.${id}`,
  cmdSearch: (n) => `amber.cmd.search.${n}`,
  search: (n) => `amber.search.${n}`,
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function nonce() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function timeStr(ts) {
  if (!ts) return '未封存';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** 解析 idOrUrl → 条目 id（URL 走稳定哈希；id 原样） */
function idFor(idOrUrl) {
  const s = String(idOrUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('b') && s.length <= 16 && !/[:/.]/.test(s)) return s.toLowerCase();
  return lib.itemIdFor(s);
}

/** 列出全部条目（值逐键读） */
async function listItems() {
  const keys = await kv.kvKeys();
  const out = await Promise.all(keys.filter((k) => k.startsWith(K.itemPrefix)).map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean).sort((a, b) => (b.sealedAt || b.createdAt || 0) - (a.sealedAt || a.createdAt || 0));
}

async function getItem(id) {
  return await kv.kvGet(K.item(id)).catch(() => null);
}

async function bumpItem(id, patch) {
  const it = await getItem(id);
  if (!it || typeof it !== 'object') return null;
  const upd = { ...it, ...patch, rev: (Number(it.rev) || 1) + 1 };
  await kv.kvSet(K.item(id), upd);
  return upd;
}

function fmtItemLine(it, withBody) {
  const state = it.status === 'pending' ? '⏳ 封存中'
    : it.status === 'error' ? `⚠ ${oneLine(it.error, 50)}`
    : `${it.sealCount || 1} 次封存 · ${Number(it.wordCount) || 0} 字`;
  const tags = (it.tags && it.tags.length) ? `（${it.tags.join('/')}）` : '';
  const head = oneLine(it.title || it.url, withBody ? 200 : 60);
  const body = withBody
    ? `\n   ${it.host} · ${timeStr(it.sealedAt || it.createdAt)} · ${state}${it.byline ? `\n   作者：${it.byline}` : ''}${it.excerpt ? `\n   摘要：${oneLine(it.excerpt, 240)}` : ''}\n   ${it.url}`
    : `\n   ${it.host} · ${timeStr(it.sealedAt || it.createdAt)} · ${state}`;
  return `[${it.id}]${it.star ? ' ★' : ''}${it.read ? '' : ' 🔵'} ${head}${tags}${body}`;
}

/** 摘录定位：qid → 键（scan 法） */
async function findQuoteKeys() {
  const keys = await kv.kvKeys();
  return keys.filter((k) => k.startsWith(K.quotePrefix));
}

// ── 工具定义 ───────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'amber_save',
    description: '把一个网页 URL 封存进网页封存（网页封藏馆）：后台服务抓取原文、抽取干净正文、生成永久可读快照。适用：「把这篇文章存进网页封存」「收藏 https://… 以后读」。同一 URL 幂等（重复封存=更新快照并+1 封存次数，阅读状态与标签保留）。原网页日后失效也不影响已封存的快照。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要封存的网页地址（公网 http(s)）' },
        tags: { type: 'string', description: '标签（可选，逗号/空格分隔，如「技术,AI」）' },
        force: { type: 'boolean', description: '已封存过时是否强制重抓更新快照（默认 false：已封存过就直接返回现有网页封存）' },
        waitSec: { type: 'integer', description: '等待封存完成的秒数（默认 25，最长 45；0=只入队不等）' },
      },
      required: ['url'],
    },
    async call(args) {
      const n = lib.normalizeUrl(args.url);
      if (n.error) return err(n.error);
      const id = lib.itemIdFor(n.url);
      const existing = await getItem(id).catch(() => null);
      if (existing && typeof existing === 'object' && existing.status === 'ok' && args.force !== true) {
        return ok(`该网页之前已封存过（网页封存不会重复制造）：\n${fmtItemLine(existing, true)}\n要更新快照可传 force: true 重新抓取。`);
      }
      // 登记 pending（幂等：已有则保留用户状态）+ 下发封存命令
      const norm = lib.normalizeItem({ url: n.url, tags: args.tags, id }, existing && typeof existing === 'object' ? existing : null);
      if (norm.error) return err(norm.error);
      const item = { ...norm.item, status: 'pending', rev: (Number(norm.item.rev) || 1) + 1 };
      await kv.kvSet(K.item(id), item);
      await kv.kvSet(K.cmdAmberize(nonce()), { op: 'amberize', url: n.url, tags: lib.normalizeTags(args.tags), at: Date.now() });

      const waitSec = Math.min(45, Math.max(0, Math.floor(Number(args.waitSec ?? 25))));
      const t0 = Date.now();
      while (waitSec > 0 && Date.now() - t0 < waitSec * 1000) {
        await sleep(1600);
        const now = await getItem(id).catch(() => null);
        if (now && now.status !== 'pending') break;
      }
      const done = await getItem(id).catch(() => null);
      if (!done) return ok('已下发封存命令但条目丢失（异常，请重试）。');
      if (done.status === 'pending') {
        return ok(`已登记并下发封存命令，服务仍在抓取中（面板收藏页可见进度）：\n${fmtItemLine(done, false)}`);
      }
      if (done.status === 'error') {
        return ok(`封存失败：${done.error}\n（旧快照不受影响；可稍后重试或检查链接是否为 JS 渲染页）\n${fmtItemLine(done, false)}`);
      }
      return ok(`已封存（第 ${done.sealCount} 次封存，快照已更新）：\n${fmtItemLine(done, true)}\namber_read 可读全文，amber_quote 可存金句。`);
    },
  },
  {
    name: 'amber_list',
    description: '列出网页封存（网页封藏馆）里的收藏。适用：「我存了哪些关于 X 的文章」「最近的收藏」「看看没读的」。支持未读/星标/标签/来源/异常过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '按标题/URL/摘要子串过滤（大小写不敏感）' },
        tag: { type: 'string', description: '按标签过滤（精确匹配一个标签）' },
        host: { type: 'string', description: '按来源域名过滤（子串，如 github.com）' },
        status: { type: 'string', description: 'unread=只看未读；starred=只看星标；pending=封存中；error=封存失败' },
        limit: { type: 'integer', description: '最多返回几条（默认 20，上限 60）' },
      },
    },
    async call(args) {
      let arr = await listItems();
      const f = String(args.filter || '').trim().toLowerCase();
      if (f) arr = arr.filter((x) => `${x.title}|${x.url}|${x.excerpt}`.toLowerCase().includes(f));
      if (args.tag) arr = arr.filter((x) => (x.tags || []).includes(String(args.tag)));
      if (args.host) arr = arr.filter((x) => String(x.host || '').includes(String(args.host).toLowerCase()));
      const st = String(args.status || '');
      if (st === 'unread') arr = arr.filter((x) => !x.read);
      else if (st === 'starred') arr = arr.filter((x) => x.star);
      else if (st === 'pending') arr = arr.filter((x) => x.status === 'pending');
      else if (st === 'error') arr = arr.filter((x) => x.status === 'error');
      if (!arr.length) {
        const hint = st === 'unread' ? '（都读完了，真棒）' : '';
        return ok(`没有匹配的收藏${hint}。用 amber_save 封存第一个网页吧。`);
      }
      const limit = Math.min(60, Math.max(1, Math.floor(Number(args.limit) || 20)));
      const shown = arr.slice(0, limit);
      return ok([
        `收藏 ${arr.length} 条（显示 ${shown.length} 条，按封存时间从新到旧；amber_read 读全文，amber_search 检索全文）：`,
        ...shown.map((x) => fmtItemLine(x, false)),
      ].join('\n'));
    },
  },
  {
    name: 'amber_search',
    description: '全文检索网页封存语料库（BM25-lite，覆盖封存正文的全部文字）。适用：「我记得收藏过讲 XX 的文章」「我存过的内容里有没有提到 YY」。返回命中条目 + 命中上下文片段，amber_read 可继续读全文。',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '检索词（支持中文与英文，可多个词）' },
        limit: { type: 'integer', description: '最多返回几条（默认 8，上限 30）' },
        waitSec: { type: 'integer', description: '等待检索完成的秒数（默认 20，最长 40）' },
      },
      required: ['q'],
    },
    async call(args) {
      const q = String(args.q || '').trim();
      if (!q) return err('需要检索词 q');
      const n = nonce();
      await kv.kvSet(K.cmdSearch(n), { op: 'search', q, limit: Math.min(30, Math.max(1, Math.floor(Number(args.limit) || 8))), at: Date.now() });
      const waitSec = Math.min(40, Math.max(2, Math.floor(Number(args.waitSec ?? 20))));
      const t0 = Date.now();
      let result = null;
      while (Date.now() - t0 < waitSec * 1000) {
        await sleep(1600);
        result = await kv.kvGet(K.search(n)).catch(() => null);
        if (result && typeof result === 'object' && (result.doneAt || result.error)) break;
      }
      await kv.kvDel(K.search(n)).catch(() => {});
      if (!result) return ok(`检索已下发但 ${waitSec}s 内未完成（语料大时首检偏慢，稍后重试）。`);
      if (result.error) return err(`检索失败：${result.error}`);
      if (!result.hits || !result.hits.length) return ok(`网页封存里 ${result.total || 0} 篇正文中没有命中「${q}」。`);
      const lines = result.hits.map((h, i) => `${i + 1}. [${h.id}] ${oneLine(h.title, 70)}（${h.host} · 相关度 ${h.score}）\n   ${oneLine(h.snippet, 240)}`);
      return ok([
        `「${q}」命中 ${result.hits.length}/${result.total} 篇：`,
        ...lines,
        '',
        'amber_read { id } 可读全文后作答（引用请标注来源文章）。',
      ].join('\n'));
    },
  },
  {
    name: 'amber_read',
    description: '读取网页封存某条的完整封存正文（amber_list / amber_search 可查 id）。正文是封存时抽取的干净 Markdown-lite 文本——原网页即使已失效，这里仍是可读副本。适用：AI 真正读完全文后做总结/观点/对比/引用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id 或原始 URL（二选一）' },
        maxChars: { type: 'integer', description: '最多返回正文字符数（默认 12000，上限 40000）' },
      },
      required: ['id'],
    },
    async call(args) {
      const id = idFor(args.id);
      if (!id) return err('需要 id（amber_list/amber_search 可查）或原始 URL');
      const it = await getItem(id);
      if (!it || typeof it !== 'object') return err(`未找到条目 ${id}（amber_list 可查）`);
      let body = await kv.kvGet(K.body(id)).catch(() => null);
      if (!body || typeof body !== 'object' || !body.ok) {
        // 没有正文（pending/曾失败）：下发重封存并轮询等待
        await kv.kvSet(K.cmdRefresh(id), { op: 'refresh', id, at: Date.now() });
        const t0 = Date.now();
        while (Date.now() - t0 < 30000) {
          await sleep(1800);
          body = await kv.kvGet(K.body(id)).catch(() => null);
          if (body && typeof body === 'object' && body.ok) break;
        }
      }
      const meta = `标题：${it.title || it.url}\n来源：${it.host} · ${it.url}${it.byline ? `\n作者：${it.byline}` : ''}\n封存：第 ${it.sealCount || 1} 次 · ${timeStr(it.sealedAt)}${(it.tags || []).length ? `\n标签：${it.tags.join('/')}` : ''}`;
      if (!body || typeof body !== 'object' || !body.ok) {
        const st = it.status === 'error' ? `上次封存失败：${it.error}` : '正文尚未抓取完成';
        return ok(`${meta}\n\n${st}（已再次下发封存命令，稍后重试本工具或看面板进度）`);
      }
      const maxChars = Math.min(40000, Math.max(500, Math.floor(Number(args.maxChars) || 12000)));
      return ok(`${meta}\n\n正文（${Math.min(maxChars, body.text.length)}/${body.text.length} 字，封存于 ${timeStr(body.fetchedAt)}）：\n\n${body.text.slice(0, maxChars)}`);
    },
  },
  {
    name: 'amber_mark',
    description: '更新网页封存条目的状态：已读/未读、星标/取消星标、增删标签。适用：「这篇读过了」「这篇很重要存个星」「给它打个 AI 标签」。不传的动作不动。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id 或原始 URL' },
        read: { type: 'boolean', description: '是否已读（不传=不动）' },
        star: { type: 'boolean', description: '是否星标（不传=不动）' },
        tagsAdd: { type: 'string', description: '要追加的标签（逗号/空格分隔，可选）' },
        tagsRemove: { type: 'string', description: '要移除的标签（逗号/空格分隔，可选）' },
      },
      required: ['id'],
    },
    async call(args) {
      const id = idFor(args.id);
      if (!id) return err('需要 id 或 url');
      const it = await getItem(id);
      if (!it || typeof it !== 'object') return err(`未找到条目 ${id}（amber_list 可查）`);
      const patch = {};
      if (args.read !== undefined) patch.read = args.read === true;
      if (args.star !== undefined) patch.star = args.star === true;
      if (args.tagsAdd !== undefined || args.tagsRemove !== undefined) {
        const cur = new Map((it.tags || []).map((t) => [t.toLowerCase(), t]));
        for (const t of lib.normalizeTags(args.tagsAdd || '')) cur.set(t.toLowerCase(), t);
        for (const t of lib.normalizeTags(args.tagsRemove || '')) cur.delete(t.toLowerCase());
        patch.tags = [...cur.values()];
      }
      if (!Object.keys(patch).length) return err('没有要更新的动作（read/star/tagsAdd/tagsRemove 至少传一个）');
      const upd = await bumpItem(id, patch);
      return ok(`已更新 [${id}] ${oneLine((upd && upd.title) || '', 60)} → ${upd.read ? '已读' : '未读'}${upd.star ? ' ★' : ''}${(upd.tags || []).length ? `（标签：${upd.tags.join('/')}）` : ''}`);
    },
  },
  {
    name: 'amber_quote',
    description: '金句摘录：把一段文字存为网页封存摘录（默认带上来源条目），或列出某条（/全部）已有摘录。适用：「把这段话摘下来」「这篇里我摘过哪些金句」。摘录是网页封存的独立层，AI 后续可经 amber_search 之外的引用素材。',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: '来源条目 id 或 URL（存摘录时必填；list 时可选过滤）' },
        text: { type: 'string', description: '摘录原文（≤2000 字）' },
        note: { type: 'string', description: '备注/感想（可选）' },
        list: { type: 'boolean', description: 'true=只列出不存' },
      },
    },
    async call(args) {
      if (args.list === true) {
        const keys = await findQuoteKeys();
        const quotes = [];
        for (const k of keys) {
          const v = await kv.kvGet(k).catch(() => null);
          if (v && typeof v === 'object') quotes.push(v);
        }
        const filtered = args.itemId
          ? quotes.filter((q) => q.itemId === idFor(args.itemId))
          : quotes;
        filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (!filtered.length) return ok(args.itemId ? '该条目还没有摘录。' : '还没有任何摘录。');
        return ok([
          `摘录 ${filtered.length} 条：`,
          ...filtered.map((q) => `· [${q.qid}] ${oneLine(q.itemTitle || q.itemId, 40)}：${oneLine(q.text, 120)}${q.note ? ` —— ${oneLine(q.note, 60)}` : ''}`),
        ].join('\n'));
      }
      const text = String(args.text || '').trim();
      if (!text) return err('存摘录需要 text（列摘录传 list: true）');
      const iid = idFor(args.itemId || '');
      if (!iid) return err('存摘录需要 itemId（amber_list/amber_search 可查）');
      const it = await getItem(iid);
      // qid 由 itemId+内容哈希而来：面板与 MCP 同规则（shared/sha256），跨写者天然去重
      const qid = 'q' + sha256Hex(iid + '|' + text).slice(0, 10);
      const existing = await kv.kvGet(K.quotePrefix + qid).catch(() => null);
      if (existing) return ok(`这段话已经摘录过了：[${qid}] ${oneLine(text, 80)}`);
      const quote = {
        qid,
        itemId: iid,
        itemTitle: (it && it.title) || '',
        itemHost: (it && it.host) || '',
        text: lib.clip(text, lib.QUOTE_CAP),
        note: lib.clip(args.note, lib.NOTE_CAP),
        createdAt: Date.now(),
      };
      await kv.kvSet(K.quotePrefix + qid, quote);
      return ok(`已存摘录 [${qid}] ← ${oneLine((it && it.title) || iid, 50)}：\n「${oneLine(quote.text, 160)}」${quote.note ? `\n备注：${quote.note}` : ''}`);
    },
  },
  {
    name: 'amber_delete',
    description: '删除网页封存条目（联动清理封存正文与该条全部摘录）。星标条目也会删除——删除就是删除，不可恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id 或原始 URL' },
      },
      required: ['id'],
    },
    async call(args) {
      const id = idFor(args.id);
      if (!id) return err('需要 id 或 url');
      const it = await getItem(id);
      if (!it || typeof it !== 'object') {
        await kv.kvDel(K.cmdForget(id)).catch(() => {});
        return err(`未找到条目 ${id}（amber_list 可查 id）`);
      }
      // 直接删除可枚举的键 + 下发 forget 命令兜底清理摘录等不可枚举关联
      const keys = await kv.kvKeys();
      let quotes = 0;
      for (const k of keys.filter((k2) => k2.startsWith(K.quotePrefix))) {
        const v = await kv.kvGet(k).catch(() => null);
        if (v && typeof v === 'object' && v.itemId === id) { await kv.kvDel(k).catch(() => {}); quotes++; }
      }
      await Promise.all([kv.kvDel(K.item(id)), kv.kvDel(K.body(id))].map((p) => p.catch(() => {})));
      await kv.kvSet(K.cmdForget(id), { op: 'forget', id, at: Date.now() });
      return ok(`已删除 [${id}] ${oneLine(it.title || it.url, 60)}（含摘录 ${quotes} 条）。`);
    },
  },
];

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
