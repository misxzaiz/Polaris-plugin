#!/usr/bin/env node
'use strict';
/**
 * memoryforge MCP Server —— 记忆卡片的 AI 工具层（零依赖，node >= 18）
 *
 * 职责：把 AI 的"制卡/复习/查库"意图翻译为 cap.kv 的 memoryforge.* 读写；
 * 全部调度/统计计算走 shared/srs-core.js（与面板同一权威，口径不漂移）。
 * URL 抓取（memoryforge_extract_url）由本进程原生 fetch 执行——浏览器面板有
 * 同源限制而这里没有，这是插件解决"App 内抓外网页面跨域"的落点。
 *
 * 工具一览：
 *   memoryforge_import_cards   批量导入 AI 生成的问答卡（核心制卡入口）
 *   memoryforge_extract_url    抓取网页正文（原生 fetch，免跨域），供制卡前阅读
 *   memoryforge_list_due       拉当前应学队列（到期卡 + 新卡，按每日限额）
 *   memoryforge_grade_card     给一张卡评分（0 重来/1 困难/2 良好/3 轻松）
 *   memoryforge_search_cards   检索卡库（关键词/牌组/标签/状态）
 *   memoryforge_stats          全局统计（到期/留存/连击/7 天预报）
 *   memoryforge_remove_cards   删除卡片
 *
 * 连接方式与 page-sentinel / pocket-ledger 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/srs-core.js');

const SERVER_NAME = 'memoryforge';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 page-sentinel / pocket-ledger）──────────────────
const APP_CONFIG_DIR = process.argv[2] || '';
const ENV_HOST = process.env.POLARIS_HOST || '';
const ENV_PORT = parseInt(process.env.POLARIS_PORT || '', 10);
const ENV_TOKEN = process.env.POLARIS_TOKEN || '';

function configCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过 */ }
  }
  if (APP_CONFIG_DIR) cands.push(path.join(APP_CONFIG_DIR, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number') return { host: web.host || '', port: web.port, token: web.token || '' };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/api/health', timeout: 1200 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _ep = null;
function resolveEndpoint() {
  if (!_ep) {
    _ep = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await healthCheck(host, basePort + i)) return { host, port: basePort + i, token };
      }
      return { host, port: basePort, token };
    })();
  }
  return _ep;
}

function polarisIpc(command, args = {}, { retries = 2, retryDelay = 300, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      resolveEndpoint().then((ep) => {
        const data = JSON.stringify(args);
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (ep.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
        const req = http.request(
          { hostname: ep.host, port: ep.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(body); } });
          },
        );
        req.on('error', (e) => {
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error(`Polaris IPC ${command} 失败: ${e.message}`));
        });
        req.on('timeout', () => {
          req.destroy();
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error('Polaris IPC timeout'));
        });
        req.write(data);
        req.end();
      }).catch(reject);
    };
    attempt(0);
  });
}

async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv get 失败');
  return res.result && res.result.value !== undefined ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
  return true;
}
async function kvDel(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv delete 失败');
  return true;
}
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : [];
}

// ── 熔炉数据访问 ───────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

async function loadMeta() {
  const m = await kvGet(core.K.meta).catch(() => null);
  return m && typeof m === 'object' ? m : {};
}

/** 全量卡片（键前缀过滤后并行读取） */
async function loadAllCards() {
  const keys = await kvKeys();
  const cardKeys = keys.filter((k) => k.startsWith(core.K.cardPrefix));
  const vals = await Promise.all(cardKeys.map((k) => kvGet(k).catch(() => null)));
  return vals.filter((v) => v && typeof v === 'object' && typeof v.front === 'string');
}

async function loadAllDecks() {
  const keys = await kvKeys();
  const deckKeys = keys.filter((k) => k.startsWith(core.K.deckPrefix));
  const vals = await Promise.all(deckKeys.map((k) => kvGet(k).catch(() => null)));
  return vals.filter((v) => v && typeof v === 'object' && typeof v.name === 'string');
}

/** 按名称找牌组，找不到就创建（默认牌组 id 固定 default） */
async function ensureDeck(name) {
  const wanted = String(name || '').trim() || core.DEFAULT_DECK_NAME;
  const decks = await loadAllDecks();
  const found = decks.find((d) => d.name === wanted);
  if (found) return found;
  const id = wanted === core.DEFAULT_DECK_NAME ? core.DEFAULT_DECK_ID : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const deck = { id, name: wanted.slice(0, 30), createdAt: Date.now() };
  await kvSet(core.K.deck(id), deck);
  return deck;
}

// ── 网页正文提取（原生 fetch，免跨域的落点）────────────────────────────────
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const EXTRACT_TEXT_LIMIT = 12000;

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', copy: '©', reg: '®', trade: '™' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch (_) { return ''; } })
    .replace(/&([a-z]+);/gi, (_, n) => named[n.toLowerCase()] ?? `&${n};`);
}

/** 粗粒度可读性提取：去 script/style/nav、块级标签折行、去标签、压空行 */
function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(nav|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s);
  const titleText = title ? decodeEntities(title[1]).replace(/\s+/g, ' ').trim() : '';
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre|br)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\u00a0]+/g, ' ');
  s = s.replace(/\n\s*\n\s*\n+/g, '\n\n');
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  return { title: titleText, text: lines.join('\n') };
}

async function extractUrl(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch (_) {
    throw new Error(`URL 不合法：${url}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('只支持 http/https');
  // SSRF 防护：拒绝打本机/内网地址（抓取只对外网内容源）
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || /^127\./.test(host) || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '::1' || host.endsWith('.local')) {
    throw new Error('拒绝抓取内网地址（仅允许公网内容源）');
  }
  const res = await fetch(u.href, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polaris-MemoryForge/0.1; +https://github.com/misxzaiz/Polaris-plugin)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ctype = String(res.headers.get('content-type') || '');
  const buf = Buffer.from(await res.arrayBuffer());
  const body = buf.subarray(0, MAX_BODY_BYTES).toString('utf8');
  let title = '';
  let text = '';
  if (/html/i.test(ctype) || /^\s*<(!doctype|html)/i.test(body)) {
    const parsed = htmlToText(body);
    title = parsed.title;
    text = parsed.text;
  } else {
    text = body; // JSON / 纯文本直接给 AI
  }
  const truncated = text.length > EXTRACT_TEXT_LIMIT;
  return { url: u.href, status: res.status, contentType: ctype, title, text: truncated ? text.slice(0, EXTRACT_TEXT_LIMIT) : text, truncated, bytes: buf.length };
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'memoryforge_import_cards',
    description: [
      '记忆卡片·批量制卡（核心入口）。把要记的知识点写成问答卡存入卡库，按 SM-2 间隔重复排期。',
      '制卡原则：一卡一原子知识点；front 是能独立成立的问题/提示，back 是精炼答案（不看上下文也能答）。',
      '优先做"问答/填空"，避免"是/否"题；同一主题放同一 deck（牌组），可加 tags。',
      '适用：「把这篇文章做成卡片」「把我们刚才聊的 OAuth 流程出 10 张卡」「这些单词帮我做成卡」。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          description: '卡片数组（1-50 张/次，多了分批）',
          items: {
            type: 'object',
            properties: {
              front: { type: 'string', description: '问题面（≤500 字）' },
              back: { type: 'string', description: '答案面（≤2000 字）' },
              tags: { type: 'array', items: { type: 'string' }, description: '标签（可选，≤8 个）' },
            },
            required: ['front', 'back'],
          },
        },
        deck: { type: 'string', description: '牌组名（缺省「默认」；不存在会自动创建，如「英语词汇」「Rust 所有权」）' },
        source: { type: 'string', description: '来源说明（如文章标题/对话主题，写入卡片便于溯源）' },
      },
      required: ['cards'],
    },
    async call(args) {
      const list = Array.isArray(args.cards) ? args.cards : [];
      if (!list.length) return err('cards 不能为空：请提供 [{front, back, tags?}]');
      if (list.length > 50) return err(`一次最多 50 张（收到 ${list.length}），请分批导入`);
      const deck = await ensureDeck(args.deck);
      const now = Date.now();
      const made = [];
      const problems = [];
      for (const raw of list) {
        const norm = core.normalizeCard({
          deckId: deck.id,
          front: raw && raw.front,
          back: raw && raw.back,
          tags: raw && raw.tags,
          source: args.source,
          now,
        });
        if (norm.error) { problems.push(`「${String((raw && raw.front) || '').slice(0, 30)}…」：${norm.error}`); continue; }
        made.push(norm.card);
      }
      if (!made.length) return err(`全部卡片都不合法，未导入。\n${problems.join('\n')}`);
      await Promise.all(made.map((c) => kvSet(core.K.card(c.id), c)));
      const all = await loadAllCards();
      const q = core.computeQueue(all, await loadSettings(), Date.now());
      const lines = [
        `已导入 ${made.length} 张卡片到牌组「${deck.name}」${args.source ? `（来源：${args.source}）` : ''}。`,
        problems.length ? `有 ${problems.length} 张被拒：\n${problems.join('\n')}` : '',
        `卡库现有 ${all.length} 张；现在到期 ${q.dueTotal} 张、新卡待学 ${q.newRemaining} 张——去面板「复习」页开始，或让我用 memoryforge_list_due 出题。`,
      ].filter(Boolean);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'memoryforge_extract_url',
    description: '记忆卡片·抓网页正文。原生 fetch 抓取公网 URL 并提取正文文本（无浏览器跨域限制），供制卡前阅读内容。只支持 http/https 公网地址；HTML 自动去壳取正文（截断至 12000 字符），JSON/纯文本原样返回。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '完整的 http(s) 网址' },
      },
      required: ['url'],
    },
    async call(args) {
      const r = await extractUrl(args.url);
      const head = [
        `标题：${r.title || '（无）'}`,
        `URL：${r.url}（HTTP ${r.status}，${r.bytes} 字节${r.truncated ? '，正文已截断' : ''}）`,
        '———',
      ];
      return ok([...head, r.text].join('\n'));
    },
  },
  {
    name: 'memoryforge_list_due',
    description: '记忆卡片·出题。返回当前应学的卡片（到期卡在前、新卡在后，受每日限额约束），适合"今天该复习什么""带我过一遍卡片"。用户答后逐张用 memoryforge_grade_card 记录评分。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '最多返回几张（默认 10，上限 50）' },
      },
    },
    async call(args) {
      const all = await loadAllCards();
      const q = core.computeQueue(all, await loadSettings(), Date.now());
      if (!q.queue.length) {
        return ok(`当前没有该学的卡片（到期 ${q.dueTotal}，新卡剩余 ${q.newRemaining}）。${q.dueTotal ? '今日复习限额已用完。' : '明天再来，或让我导入新内容做卡。'}`);
      }
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 10));
      const lines = [
        `队列 ${q.queue.length} 张（到期 ${q.dueTotal} · 新卡剩余 ${q.newRemaining}；今日已复习 ${q.today.reviews}/已学新卡 ${q.today.newCards}）。出题：`,
      ];
      q.queue.slice(0, limit).forEach((c, i) => {
        const kind = c.status === 'new' ? '新' : core.fmtIvl(c.intervalMin);
        lines.push(`${i + 1}. [${c.id}]（${kind}）${c.front}`);
      });
      if (q.queue.length > limit) lines.push(`…其余 ${q.queue.length - limit} 张略。`);
      lines.push('用户作答后，按回忆质量调用 memoryforge_grade_card（0 重来/1 困难/2 良好/3 轻松）。');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'memoryforge_grade_card',
    description: '记忆卡片·评分。用户对某张卡作了回忆后，按质量评分并写入 SM-2 排期：0=想不起来（重来）；1=想起但费劲（困难）；2=正常想起（良好）；3=秒答（轻松）。返回下次复习时间。',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: '卡片 id（memoryforge_list_due / search_cards 里的 [id]）' },
        grade: { type: 'integer', description: '0 重来 / 1 困难 / 2 良好 / 3 轻松' },
      },
      required: ['cardId', 'grade'],
    },
    async call(args) {
      const key = core.K.card(String(args.cardId || ''));
      const card = await kvGet(key);
      if (!card || typeof card !== 'object') return err(`找不到卡片 ${args.cardId}（可用 memoryforge_search_cards 确认 id）`);
      const now = Date.now();
      const g = core.gradeCard(card, args.grade, now);
      if (g.error) return err(g.error);
      await kvSet(key, g.card);
      const meta = await loadMeta();
      const st = core.updateStreak(meta, now);
      if (st.changed) await kvSet(core.K.meta, { ...meta, streak: st.streak });
      return ok([
        `${core.GRADE_LABELS[args.grade]} →「${card.front.slice(0, 40)}」`,
        `下次复习：${core.fmtIvl(g.card.intervalMin)}后（${new Date(g.card.due).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}）`,
        `连击 ${st.streak.count} 天`,
      ].join('\n'));
    },
  },
  {
    name: 'memoryforge_search_cards',
    description: '记忆卡片·查卡库。按关键词（问题/答案/标签/来源）/牌组/标签/状态检索卡片，适合"我有多少张 Rust 卡""找一下昨天那批卡"。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词（模糊匹配 front/back/tags/来源）' },
        deck: { type: 'string', description: '牌组名' },
        tag: { type: 'string', description: '标签' },
        status: { type: 'string', enum: ['new', 'learning', 'review', 'suspended'], description: '卡片状态' },
        limit: { type: 'integer', description: '最多返回条数（默认 20，上限 100）' },
      },
    },
    async call(args) {
      const all = await loadAllCards();
      let decks = await loadAllDecks();
      let deckId;
      if (args.deck) {
        const d = decks.find((x) => x.name === args.deck);
        if (!d) return err(`牌组「${args.deck}」不存在。现有：${decks.map((x) => x.name).join('、') || '（无）'}`);
        deckId = d.id;
      }
      const found = core.searchCards(all, { query: args.query, deckId, tag: args.tag, status: args.status });
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
      const deckName = (id) => (decks.find((x) => x.id === id) || {}).name || id;
      const statusLabel = { new: '新', learning: '学', review: '复', suspended: '停' };
      const lines = found.slice(0, limit).map((c) => `[${c.id}]（${deckName(c.deckId)}/${statusLabel[c.status] || c.status}${c.tags.length ? '/#' + c.tags.join(' #') : ''}）${c.front} → ${c.back.slice(0, 60)}${c.back.length > 60 ? '…' : ''}`);
      return ok(found.length
        ? `命中 ${found.length} 张${found.length > limit ? `（显示前 ${limit}）` : ''}：\n${lines.join('\n')}`
        : '没有符合条件的卡片。');
    },
  },
  {
    name: 'memoryforge_stats',
    description: '记忆卡片·统计概览。卡库总量、各状态分布、当前到期数、今日进度、30 天留存率、连击天数、7 天到期预报与牌组分布。适合"我学得怎么样""记忆卡片现在什么情况"。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const [all, decks, meta, settings] = [await loadAllCards(), await loadAllDecks(), await loadMeta(), await loadSettings()];
      const s = core.computeStats(all, decks, meta, Date.now());
      if (!all.length) return ok('卡库还是空的。把要记的内容发给我（或给个 URL），我来做成卡片。');
      const lines = [
        `卡库 ${s.total} 张：新 ${s.byStatus.new} · 学习中 ${s.byStatus.learning} · 复习中 ${s.byStatus.review}${s.byStatus.suspended ? ` · 暂停 ${s.byStatus.suspended}` : ''}`,
        `现在到期 ${s.dueNow} 张；今日已复习 ${s.today.reviews} 次（答对 ${s.today.correct}）、新学 ${s.today.newCards} 张（每日限额：新 ${settings.dailyNewLimit}/复习 ${settings.dailyReviewLimit}）`,
        `连击 ${s.streak} 天（最佳 ${s.bestStreak}）${s.retention30 != null ? `；30 天留存率 ${s.retention30}%` : ''}`,
      ];
      const f = s.forecast.filter((x) => x.count > 0).slice(0, 5);
      if (f.length) lines.push(`到期预报：${f.map((x) => `${x.date} ${x.count} 张`).join('，')}`);
      const ds = s.byDeck.filter((d) => d.total > 0).slice(0, 8);
      if (ds.length > 1 || ds[0]?.name !== core.DEFAULT_DECK_NAME) {
        lines.push(`牌组：${ds.map((d) => `${d.name} ${d.total} 张（到期 ${d.due}）`).join('，')}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'memoryforge_remove_cards',
    description: '记忆卡片·删卡。按 id 列表永久删除卡片（先 search_cards 确认 id）。可先列出将删的卡向用户确认。',
    inputSchema: {
      type: 'object',
      properties: {
        cardIds: { type: 'array', items: { type: 'string' }, description: '卡片 id 数组' },
      },
      required: ['cardIds'],
    },
    async call(args) {
      const ids = Array.isArray(args.cardIds) ? args.cardIds.map(String).filter(Boolean) : [];
      if (!ids.length) return err('cardIds 不能为空');
      const res = await Promise.all(ids.map(async (id) => {
        const key = core.K.card(id);
        const card = await kvGet(key).catch(() => null);
        if (!card) return { id, deleted: false };
        await kvDel(key);
        return { id, deleted: true, front: card.front };
      }));
      const deleted = res.filter((r) => r.deleted);
      const missing = res.filter((r) => !r.deleted).map((r) => r.id);
      return ok([
        `已删除 ${deleted.length} 张${deleted.length ? '：' + deleted.map((d) => `「${String(d.front).slice(0, 30)}」`).join('、') : ''}`,
        missing.length ? `未找到 ${missing.length} 张：${missing.join('、')}` : '',
      ].filter(Boolean).join('\n'));
    },
  },
];

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

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
    if (!tool) { send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) }); return; }
    try {
      send({ jsonrpc: '2.0', id: msg.id, result: await tool.call(args) });
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
