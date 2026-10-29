#!/usr/bin/env node
'use strict';
/**
 * feed-radar MCP Server —— RSS 订阅的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 radar.* 键空间的读写。本进程**不直接抓外网**——抓取与正文拉取全部
 * 需要外网的动作都通过命令信箱（radar.cmd.*）委托给后台服务执行
 * （浏览器同源策略管不到服务进程；同时保证"单一抓取路径"不出现第二条写法）。
 *
 * 工具一览：
 *   radar_add_feed     添加订阅源（幂等：同一 URL 永远同一 id）
 *   radar_list_feeds   列出订阅源（含未读数/最近状态/抓取间隔）
 *   radar_remove_feed  删除订阅源（联动清理文章与正文）
 *   radar_refresh      触发刷新（指定某源或不指定=全部）
 *   radar_unread       看未读文章流（按天数/源/关键词过滤）——「AI 读报」主入口
 *   radar_read_article 拉取并阅读某篇完整正文（命令信箱 + 轮询结果）
 *   radar_mark         标记已读/未读、加星（用户状态收敛）
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const lib = require('../service/lib');

const SERVER_NAME = 'feed-radar';
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
  feedPrefix: 'radar.feed.',
  articlePrefix: 'radar.article.',
  content: (aid) => `radar.content.${aid}`,
  cmdRefreshAll: (n) => `radar.cmd.refreshAll.${n}`,
  cmdRefreshFeed: (fid) => `radar.cmd.refreshFeed.${fid}`,
  cmdPull: (aid) => `radar.cmd.pull.${aid}`,
  cmdForget: (fid) => `radar.cmd.forget.${fid}`,
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

/** 分布式约定：MCP 写完文章后 bump feed.rev——设备的文章缓存靠该信号失效 */
async function bumpFeedRev(fid) {
  try {
    const f = await kv.kvGet(K.feedPrefix + fid);
    if (f && typeof f === 'object') {
      await kv.kvSet(K.feedPrefix + fid, { ...f, rev: (Number(f.rev) || 1) + 1 });
    }
  } catch (_) { /* rev 丢了不影响正确性（90s 全量兜底） */ }
}

/** 列出全部订阅源定义 */
async function listFeeds() {
  const keys = await kv.kvKeys();
  const feedKeys = keys.filter((k) => k.startsWith(K.feedPrefix));
  const out = await Promise.all(feedKeys.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** 全文键扫描（aid → key）与文章定位 */
async function findArticleKey(aid) {
  const keys = await kv.kvKeys();
  const k = keys.find((kk) => kk.startsWith(K.articlePrefix) && kk.endsWith('.' + aid));
  return k || '';
}

async function readArticle(aid) {
  const k = await findArticleKey(aid);
  if (!k) return null;
  return await kv.kvGet(k).catch(() => null);
}

async function fmtFeedLine(f) {
  const time = f.lastFetchAt
    ? new Date(f.lastFetchAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '从未抓取';
  const status = f.lastStatus === 'error' ? `⚠ ${oneLine(f.lastError, 60)}` : (f.lastStatus === 'never' ? '等待首抓' : '正常');
  return `[${f.id}]${f.enabled === false ? ' ⏸' : ''} ${oneLine(f.title || f.url, 40)}${f.category ? `（${f.category}）` : ''}\n   未读 ${Number(f.unreadCount) || 0} / 共 ${Number(f.itemCount) || 0} · ${f.intervalMin > 0 ? `${f.intervalMin} 分钟` : '跟随全局'} · 上次 ${time} · ${status}\n   ${f.url}`;
}

function oneLine(s, n) {
  const t = lib.decodeEntities(String(s || '')).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function fmtArticleBrief(a, feedTitleMap, withFull) {
  const d = a.publishedAt ? new Date(a.publishedAt) : null;
  const dd = d ? `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '未知时间';
  const head = oneLine(a.title, withFull ? 300 : 80);
  const feedName = feedTitleMap.get(a.feedId) || '';
  const body = withFull
    ? `\n   链接：${a.link || a.guid || '（无）'}${a.author ? `\n   作者：${a.author}` : ''}${a.excerpt ? `\n   摘要：${oneLine(a.excerpt, 380)}` : ''}`
    : (a.excerpt ? `\n   ${oneLine(a.excerpt, 110)}` : '');
  return `[${a.id}]${a.star ? ' ★' : ''}${a.read ? '' : '🔵'} ${head}\n   ${feedName} · ${dd}${body}`;
}

// ── 工具定义 ───────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'radar_add_feed',
    description: '给RSS 订阅（feed-radar）添加一个 RSS/Atom 订阅源。适用：「订阅 https://example.com/feed.xml」「以后这个博客更新了第一时间让我知道」。同一 URL 幂等（重复添加不会产生双份）。后台服务会在下一个抓取周期（全局默认 15 分钟、命令刷新可立即）抓取入库。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'RSS/Atom 订阅地址（公网 http(s)）' },
        title: { type: 'string', description: '显示名（可选；缺省由抓取结果自动补）' },
        category: { type: 'string', description: '分组标签（可选，如 技术/新闻/购物）' },
        intervalMin: { type: 'integer', description: '独立抓取间隔分钟数（可选，5-240，缺省跟随全局设置）' },
      },
      required: ['url'],
    },
    async call(args) {
      const fid = lib.feedIdFor(args.url);
      const existing = await kv.kvGet(K.feedPrefix + fid).catch(() => null);
      const r = lib.normalizeFeed({ ...args, url: args.url, id: fid }, existing && typeof existing === 'object' ? existing : null);
      if (r.error) return err(r.error);
      await kv.kvSet(K.feedPrefix + fid, r.feed);
      if (existing) {
        return ok(`已更新订阅源定义（该 URL 之前就订阅过，id 不变）：\n${fmtFeedLine(r.feed)}\n要立即抓一次可接着调 radar_refresh { id: "${fid}" }。`);
      }
      await kv.kvSet(K.cmdRefreshFeed(fid), { op: 'refreshFeed', fid, at: Date.now() });
      return ok(`已添加订阅源（新）：\n${fmtFeedLine(r.feed)}\n已下发立即抓取命令，通常十几秒内可入库（之后按间隔自动更新）。radar_list_feeds 可看抓取结果。`);
    },
  },
  {
    name: 'radar_list_feeds',
    description: '列出RSS 订阅的全部订阅源（含未读数/共几条/状态）。用于「我订阅了哪些」「哪个源挂了」。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '按标题/URL/分组子串过滤（大小写不敏感）' },
      },
    },
    async call(args) {
      let feeds = await listFeeds();
      const f = String(args.filter || '').trim().toLowerCase();
      if (f) feeds = feeds.filter((x) => `${x.title}|${x.url}|${x.category}`.toLowerCase().includes(f));
      if (!feeds.length) return ok(f ? `没有匹配「${args.filter}」的订阅源。` : '还没有任何订阅源（radar_add_feed 添加，或面板里加）。');
      const totalUnread = feeds.reduce((s, x) => s + (Number(x.unreadCount) || 0), 0);
      return ok(`共 ${feeds.length} 个订阅源，总未读 ${totalUnread}：\n${(await Promise.all(feeds.map(fmtFeedLine))).join('\n')}`);
    },
  },
  {
    name: 'radar_remove_feed',
    description: '删除RSS 订阅的一个订阅源（可传 id 或 URL），联动删除其全部文章与已拉取的正文。星标文章也会删除——删除是针对整个订阅源。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅源 id（radar_list_feeds 可查）' },
        url: { type: 'string', description: '或直接传订阅 URL（与 id 二选一）' },
      },
    },
    async call(args) {
      let fid = args.id || '';
      if (!fid && args.url) fid = lib.feedIdFor(args.url);
      if (!fid) return err('需要 id 或 url 二选一');
      const f = await kv.kvGet(K.feedPrefix + fid).catch(() => null);
      if (!f) {
        await kv.kvDel(K.cmdForget(fid)).catch(() => {});
        return err(`未找到订阅源 ${fid}（radar_list_feeds 可查 id）`);
      }
      // 直接删除可枚举的键 + 下发 forget 命令兜底清理面板不可见的历史键
      const keys = await kv.kvKeys();
      const artKeys = keys.filter((k) => k.startsWith(`radar.article.${fid}.`));
      const aidSet = new Set(artKeys.map((k) => k.split('.').pop()));
      await kv.kvDel(K.feedPrefix + fid);
      for (const k of artKeys) await kv.kvDel(k).catch(() => {});
      for (const aid of aidSet) await kv.kvDel(K.content(aid)).catch(() => {});
      await kv.kvSet(K.cmdForget(fid), { op: 'forget', fid, at: Date.now() });
      return ok(`已删除订阅源「${oneLine(f.title || f.url, 50)}」及其 ${artKeys.length} 篇文章。`);
    },
  },
  {
    name: 'radar_refresh',
    description: '触发RSS 订阅立即抓取刷新。不传参=全部订阅源；传 id=只刷该源。命令经信箱由后台服务执行（抓取的单一权威，Escape 浏览器跨域限制靠它）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅源 id（可选；不传=全部）' },
        waitSec: { type: 'integer', description: '等待抓取完成的秒数（默认 25，最长 40；0=不等）' },
      },
    },
    async call(args) {
      const waitSec = Math.min(40, Math.max(0, Math.floor(Number(args.waitSec ?? 25))));
      if (args.id) {
        const fid = String(args.id);
        const f = await kv.kvGet(K.feedPrefix + fid).catch(() => null);
        if (!f) return err(`未找到订阅源 ${fid}（radar_list_feeds 可查 id）`);
        await kv.kvSet(K.cmdRefreshFeed(fid), { op: 'refreshFeed', fid, at: Date.now() });
      } else {
        await kv.kvSet(K.cmdRefreshAll(nonce()), { op: 'refreshAll', at: Date.now() });
      }
      const t0 = Date.now();
      const snapshot0 = args.id ? await kv.kvGet(K.feedPrefix + args.id).catch(() => null) : null;
      while (waitSec > 0 && Date.now() - t0 < waitSec * 1000) {
        await sleep(2000);
        if (args.id) {
          const now = await kv.kvGet(K.feedPrefix + args.id).catch(() => null);
          if (now && Number(now.lastFetchAt || 0) > Math.max(t0, snapshot0?.lastFetchAt ?? 0)) break;
        }
      }
      return ok('已下发刷新命令。' + (waitSec > 0 && args.id ? '等待窗口内若完成，radar_list_feeds 将看到最新 lastFetchAt。' : 'radar_list_feeds 稍后可以看到抓取结果。'));
    },
  },
  {
    name: 'radar_unread',
    description: '读RSS 订阅的未读/最新文章流（「AI 读报」主入口）。默认列最近 3 天未读，按发布时间从新到旧；返回 id 可供 radar_read_article 拉正文、radar_mark 标记。适用：「看看今天订阅里有什么值得读的」「把技术源的新文章总结一下」。',
    inputSchema: {
      type: 'object',
      properties: {
        feedId: { type: 'string', description: '只看某订阅源（可选）' },
        query: { type: 'string', description: '标题/摘要子串过滤（大小写不敏感）' },
        sinceDays: { type: 'integer', description: '只看最近 N 天（默认 3，上限 30）' },
        includeRead: { type: 'boolean', description: '是否包含已读（默认 false）' },
        withFullExcerpt: { type: 'boolean', description: '摘要加长（默认短摘要）' },
        limit: { type: 'integer', description: '最多返回几条（默认 25，上限 60）' },
      },
    },
    async call(args) {
      const keys = await kv.kvKeys();
      const artKeys = keys.filter((k) => k.startsWith(K.articlePrefix) && (!args.feedId || k.startsWith(`radar.article.${args.feedId}.`)));
      const sinceMs = Math.min(30, Math.max(0, Math.floor(Number(args.sinceDays ?? 3)))) * 86400000;
      const q = String(args.query || '').trim().toLowerCase();
      const feedTitles = new Map();
      for (const f of await listFeeds()) feedTitles.set(f.id, f.title || f.url);
      const arts = [];
      for (const k of artKeys) {
        const a = await kv.kvGet(k).catch(() => null);
        if (!a || typeof a !== 'object') continue;
        if (args.includeRead !== true && a.read) continue;
        if (sinceMs && (a.publishedAt || a.createdAt || 0) < Date.now() - sinceMs) continue;
        if (q && !`${a.title}|${a.excerpt}|${a.link}`.toLowerCase().includes(q)) continue;
        arts.push(a);
      }
      arts.sort((x, y) => (y.publishedAt || y.createdAt || 0) - (x.publishedAt || x.createdAt || 0));
      if (!arts.length) {
        const hint = args.feedId ? '（也许该源还没抓取或没有新文章）' : '';
        return ok(q || args.feedId ? `没有匹配 ${JSON.stringify(q || args.feedId)} 的未读文章${hint}` : `没有未读文章${hint}`);
      }
      const limit = Math.min(60, Math.max(1, Math.floor(Number(args.limit) || 25)));
      const shown = arts.slice(0, limit);
      const withFull = args.withFullExcerpt === true;
      return ok([
        `未读 ${arts.length} 条（显示 ${shown.length} 条，从新到旧；radar_read_article 拉正文，radar_mark 标记已读）：`,
        ...shown.map((a) => fmtArticleBrief(a, feedTitles, withFull)),
      ].join('\n'));
    },
  },
  {
    name: 'radar_read_article',
    description: '读取RSS 订阅某篇文章的完整正文（radar_unread 可查 id）。正文由后台服务抓原文链接并抽取主干——如正文缺失会写命令触发后台抓取并轮询等待。适用：AI 真正读文章内容后做总结/观点/对比。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文章 id（radar_unread 可查）' },
        maxChars: { type: 'integer', description: '最多返回正文字符数（默认 8000，上限 20000）' },
      },
      required: ['id'],
    },
    async call(args) {
      const aid = String(args.id || '').toLowerCase();
      const maxChars = Math.min(20000, Math.max(500, Math.floor(Number(args.maxChars) || 8000)));
      const art = await readArticle(aid);
      if (!art || typeof art !== 'object') return err(`未找到文章 ${aid}（radar_unread 可查 id）`);
      const meta = `标题：${art.title}\n来源：${(feedTitleOf(art.feedId))} · ${art.link || art.guid || '（无链接）'}${art.author ? `\n作者：${art.author}` : ''}\n发布：${art.publishedAt ? new Date(art.publishedAt).toLocaleString('zh-CN', { hour12: false }) : '未知'}`;

      let content = await kv.kvGet(K.content(aid)).catch(() => null);
      if (!content || typeof content !== 'object' || (!content.ok && !content.error)) content = null;
      if (!content) {
        // 正文未拉取：命令信箱 + 轮询（monkey式阻塞上限 30s；抓取由服务单一权威执行）
        await kv.kvSet(K.cmdPull(aid), { op: 'pull', id: aid, at: Date.now() });
        const t0 = Date.now();
        while (Date.now() - t0 < 30000) {
          await sleep(1600);
          const c = await kv.kvGet(K.content(aid)).catch(() => null);
          if (c && typeof c === 'object' && (c.ok || c.error)) { content = c; break; }
        }
        if (!content) {
          return ok(`${meta}\n\n正文仍在后台抓取队列中（已入队，下次重试该工具或稍后在面板打开即可）。`);
        }
      }
      if (content.ok && content.text) {
        return ok(`${meta}\n\n正文（${Math.min(maxChars, content.text.length)}/${content.text.length} 字）：\n\n${content.text.slice(0, maxChars)}`);
      }
      return ok(`${meta}\n\n正文抓取失败：${content.error || '未知原因'}\n（面板阅读视图可继续重试；或直接用链接请用户在浏览器打开）`);
    },
  },
  {
    name: 'radar_mark',
    description: '标记RSS 订阅文章的已读/未读或加星/取消星。适用：「这篇看过了，标已读」「这篇存个星标」。两个动作可同时指定。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文章 id' },
        read: { type: 'boolean', description: '是否已读（不传=不动）' },
        star: { type: 'boolean', description: '是否星标（不传=不动）' },
      },
      required: ['id'],
    },
    async call(args) {
      const aid = String(args.id || '').toLowerCase();
      const k = await findArticleKey(aid);
      if (!k) return err(`未找到文章 ${aid}（radar_unread 可查 id）`);
      const art = await kv.kvGet(k).catch(() => null);
      if (!art || typeof art !== 'object') return err(`文章已被清理：${aid}`);
      const upd = { ...art };
      if (args.read !== undefined) upd.read = args.read === true;
      if (args.star !== undefined) upd.star = args.star === true;
      await kv.kvSet(k, upd);
      await bumpFeedRev(art.feedId);
      return ok(`已更新 [${aid}] ${oneLine(art.title, 60)} → ${upd.read ? '已读' : '未读'}${upd.star ? ' ★' : ''}`);
    },
  },
];

async function feedTitleOf(fid) {
  const f = await kv.kvGet(K.feedPrefix + fid).catch(() => null);
  return (f && (f.title || f.url)) || f || '（源已删除）';
}

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
