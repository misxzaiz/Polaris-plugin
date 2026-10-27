#!/usr/bin/env node
'use strict';
/**
 * paper-radar MCP Server —— 论文雷达的 AI 工具层（stdio，零依赖）
 *
 * 职责：
 *   - 向 AI 暴露论文检索/解读/收藏工具，全部经 Polaris bus 透传：
 *       · 搜索 arXiv 走 cap.http（宿主统一出口，无 CORS；审计可查）
 *       · 关注主题 / 收藏 / feed 走 cap.kv（与后台服务共享同一事实库）
 *   - AI 可直接在对话中：查论文、读摘要、收藏、统计今日榜单
 *
 * 连接方式（与 page-sentinel / news-curator 同套路）：
 *   1. env POLARIS_HOST + POLARIS_PORT + POLARIS_TOKEN
 *   2. anchor.json → dataRoot/config.json（web.port/token）
 *   3. 端口扫描 /api/health
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVER_NAME = 'paper-radar';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

let contract = null;
try {
  contract = require(path.join(__dirname, '..', 'shared', 'contract.js'));
} catch (_) { /* 独立运行兜底 */ }
const K = contract ? contract.K : null;
const DEFAULT_SETTINGS = (contract && contract.DEFAULT_SETTINGS) || {};
const ARXIV_API = 'https://export.arxiv.org/api/query';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 page-sentinel）──────────────────────────────────
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
      if (typeof web.port === 'number' && web.port > 0) {
        return { host: web.host || '', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthOnce(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/api/health', timeout: 1200 },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _endpointPromise = null;
function resolveEndpoint() {
  if (!_endpointPromise) {
    _endpointPromise = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) {
        return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN, via: 'env' };
      }
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await healthOnce(host, basePort + i)) {
          return { host, port: basePort + i, token, via: 'scan' };
        }
      }
      return { host, port: basePort, token, via: 'fallback' };
    })();
  }
  return _endpointPromise;
}

function polarisIpc(command, args = {}, { retries = 2, retryDelay = 300, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      resolveEndpoint()
        .then((ep) => {
          const data = JSON.stringify(args);
          const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          };
          if (ep.token) {
            headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
          }
          const req = http.request(
            {
              hostname: ep.host, port: ep.port,
              path: `/api/${command.replace(/_/g, '-')}`,
              method: 'POST', headers, timeout,
            },
            (res) => {
              let responseData = '';
              res.on('data', (chunk) => { responseData += chunk; });
              res.on('end', () => {
                try { resolve(JSON.parse(responseData)); } catch (_) { resolve(responseData); }
              });
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
        })
        .catch((e) => reject(e));
    };
    attempt(0);
  });
}

// ── cap.* 封装 ─────────────────────────────────────────────────────────────
async function capDispatch(target, payload) {
  const res = await polarisIpc('router_dispatch', { req: { target, payload } });
  if (!res || res.ok === false) throw new Error((res && res.error) || `${target} 调用失败`);
  return res.result;
}

async function kvGet(key) {
  const r = await capDispatch('cap.kv', { action: 'get', key });
  return r && r.value !== undefined ? r.value : null;
}
async function kvSet(key, value) {
  await capDispatch('cap.kv', { action: 'set', key, value });
  return true;
}
async function kvDel(key) {
  await capDispatch('cap.kv', { action: 'delete', key });
  return true;
}
async function kvKeys() {
  const r = await capDispatch('cap.kv', { action: 'list' });
  return r && Array.isArray(r.keys) ? r.keys : [];
}

/** 经 cap.http 转发到 arXiv（宿主统一出口，无 CORS，可审计） */
async function arxivViaHttp(query) {
  const params = new URLSearchParams({
    search_query: query,
    sortBy: 'relevance',
    sortOrder: 'descending',
    max_results: String(12),
  });
  const url = `${ARXIV_API}?${params.toString()}`;
  const r = await capDispatch('cap.http', { action: 'request', method: 'GET', url, timeoutMs: 20000 });
  if (!r || !r.ok) throw new Error((r && r.error) || 'cap.http arxiv 请求失败');
  const body = r.body || '';
  if (r.isBase64) {
    const buf = Buffer.from(body, 'base64');
    return buf.toString('utf8');
  }
  return body;
}

/** 从 arXiv Atom XML 提取条目（与 service 同解析，独立实现防耦合） */
function parseEntries(xml) {
  const out = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const seg = m[1];
    const grab = (tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
      const mm = seg.match(r);
      return mm ? mm[1].trim() : '';
    };
    const id = ((grab('id').match(/arxiv\.org\/abs\/(.+)$/) || [])[1] || '').replace(/v\d+$/, '');
    const title = grab('title').replace(/\s+/g, ' ').trim();
    if (!id || !title) continue;
    const authors = [];
    const aRe = /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g;
    let am;
    while ((am = aRe.exec(seg)) !== null) authors.push(am[1].trim());
    const cats = [];
    const cRe = /<category term="([^"]+)"/g;
    let cm;
    while ((cm = cRe.exec(seg)) !== null) cats.push(cm[1]);
    out.push({
      id,
      title,
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`,
      abstract: grab('summary').replace(/\s+/g, ' ').trim(),
      authors,
      categories: cats,
      published: new Date(grab('published')).getTime(),
      updated: new Date(grab('updated')).getTime(),
    });
  }
  return out;
}

// ── 工具实现 ├──────────────────────────────────────────────────────────────
function ok(text) { return { content: [{ type: 'text', text }] }; }
function err(msg) { return ok('⚠ ' + msg); }

function shortText(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** 简单排版一篇论文 */
function fmtPaper(p, i, withAbstract) {
  const authors = (p.authors || []).slice(0, 6).join(', ') + ((p.authors || []).length > 6 ? ` 等${p.authors.length}人` : '');
  const cats = (p.categories || []).slice(0, 4).join(' ');
  const date = p.published ? new Date(p.published).toISOString().slice(0, 10) : '';
  let s = `${i}. [${p.id}] ${p.title}\n`;
  s += `   作者：${authors || '未知'}\n`;
  s += `   分类：${cats || '—'}  |  ${date}  |  score=${p.score || 0}\n`;
  s += `   ${p.url}\n`;
  if (p.verdict) s += `   解读：${p.verdict}\n`;
  if (withAbstract && p.abstract) s += `   摘要：${shortText(p.abstract, 600)}\n`;
  return s;
}

async function getSettings() {
  const raw = await kvGet(K.settings);
  return Object.assign({}, DEFAULT_SETTINGS, raw || {});
}

async function getTopics() {
  const raw = await kvGet(K.topics);
  return (Array.isArray(raw) ? raw : []).map((t) => contract.normalizeTopic(t)).filter(Boolean);
}

async function listFavs() {
  const keys = await kvKeys();
  return keys.filter((k) => K.isFav(k)).map((k) => k.slice(K.PREFIX.length + 4)).sort();
}

const tools = [
  {
    name: 'paper_search',
    description: '搜索 arXiv 论文（论文雷达）。支持关键词/Lucene 语法（如 "LLM agent"、"cat:cs.CL AND langchain"）。返回按相关性排序的前若干条，含标题/作者/分类/日期/链接/一句话解读。搜索走宿主 cap.http 转发，无跨域限制；结果不会落库。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索词，如 "retrieval augmented generation" 或 "all:\"chain of thought\""' },
        maxResults: { type: 'integer', description: '返回条数（默认 8，上限 20）' },
      },
      required: ['query'],
    },
    async call(args) {
      const q = String(args.query || '').trim();
      if (!q) return err('请输入搜索词');
      try {
        const xml = await arxivViaHttp(q);
        const entries = parseEntries(xml);
        if (!entries.length) return ok('没有找到匹配论文，试试更通用的词或 Lucene 语法。');
        const topics = await getTopics();
        const max = Math.min(20, Math.max(1, Number(args.maxResults) || 8));
        const scored = contract
          ? contract.mergeAndRank(entries, topics, max)
          : entries.slice(0, max);
        const lines = scored.map((p, i) => fmtPaper(p, i + 1, false));
        return ok(`搜到 ${entries.length} 篇（返回前 ${scored.length} 篇）：\n${lines.join('\n')}\n\n想看某篇摘要/收藏，用 paper_get 或 paper_favorite。`);
      } catch (e) {
        log('error', `paper_search 失败: ${e.message}`);
        return err('搜索失败：' + e.message);
      }
    },
  },
  {
    name: 'paper_get',
    description: '获取单篇论文完整信息（arxiv id 或 URL）：完整摘要、作者、分类、链接。可评分并给出相关性解读（结合当前关注主题）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'arXiv id（如 2601.12345）或完整 abs/pdf URL' },
      },
      required: ['id'],
    },
    async call(args) {
      let id = String(args.id || '').trim();
      if (!id) return err('请输入 arXiv id 或 URL');
      const m = id.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
      if (m) id = m[1];
      if (!/^\d{4}\.\d{4,5}$/.test(id)) return err(`无法识别的 arXiv id：${args.id}`);
      try {
        const query = `id_list=${id}&max_results=1`;
        const xml = await arxivViaHttp(query);
        const entries = parseEntries(xml);
        if (!entries.length) return ok(`未找到 id=${id}，可能不存在或尚未收录。`);
        const p = entries[0];
        const topics = await getTopics();
        // 手动评分（不落库）
        const title = p.title.toLowerCase();
        const abs = p.abstract.toLowerCase();
        let score = 0; const matches = [];
        for (const t of topics) {
          for (const w of t.keywords) {
            const inT = title.indexOf(w) >= 0;
            const inA = abs.indexOf(w) >= 0;
            if (inT || inA) { const wt = inT ? 3 : 1; score += wt; matches.push({ topic: t.name, word: w, weight: wt, hit: inT ? 'title' : 'abstract' }); }
          }
        }
        p.score = score; p.topMatches = matches;
        p.verdict = contract.buildVerdict(p, matches, topics);
        const authors = p.authors.join(', ');
        let s = `【${p.title}】\n`;
        s += `ID: ${p.id}  |  ${new Date(p.published).toISOString().slice(0, 10)}  |  相关度 ${score}\n`;
        s += `作者：${authors}\n`;
        s += `分类：${(p.categories || []).join(' ')}\n`;
        s += `链接：${p.url}\nPDF: ${p.pdfUrl}\n`;
        s += `解读：${p.verdict}\n\n摘要：\n${shortText(p.abstract, 1200)}\n`;
        return ok(s);
      } catch (e) {
        log('error', `paper_get 失败: ${e.message}`);
        return err('获取失败：' + e.message);
      }
    },
  },
  {
    name: 'paper_today',
    description: '查看「今日值得读」榜单——后台服务按你的关注主题定时抓取 arXiv 并评分生成的当日论文清单。也显示最近三天历史榜单。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
      },
    },
    async call(args) {
      const today = new Date().toISOString().slice(0, 10);
      const dates = args.date ? [String(args.date)] : [today];
      // 补近三天
      if (!args.date) {
        for (let i = 1; i <= 3; i++) {
          const d = new Date(Date.now() - i * 86400000);
          dates.push(d.toISOString().slice(0, 10));
        }
      }
      const out = [];
      for (const date of dates) {
        const feed = await kvGet(K.feed(date));
        if (!feed || !Array.isArray(feed.items) || !feed.items.length) continue;
        const lines = feed.items.map((p, i) => fmtPaper(p, i + 1, false));
        out.push(`【${date}】共 ${feed.items.length} 篇（主题：${(feed.topicNames || []).join('/') || '各主题'}）\n${lines.join('\n')}`);
      }
      if (!out.length) {
        return ok('今日榜单还没生成。可先用后台服务（设置→插件→论文雷达 查看服务状态），或在对话里说「帮我搜今天的论文」。生成后会自动出现在这里。');
      }
      return ok(out.join('\n\n'));
    },
  },
  {
    name: 'paper_list_topics',
    description: '查看当前论文雷达关注的主题列表（含关键词与启停状态）。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const topics = await getTopics();
      if (!topics.length) return ok('还没有关注主题。用 paper_add_topic 添加（如「多模态」「diffusion」「RLHF」）。');
      return ok(topics.map((t, i) => `${i + 1}. ${t.name}（${t.id}）${t.enabled ? '启用' : '暂停'}  关键词：${t.keywords.join(', ')}`).join('\n'));
    },
  },
  {
    name: 'paper_add_topic',
    description: '添加一个关注主题（论文雷达会定时抓取相关新论文）。keywords 是匹配词，标题命中权重高。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '主题名称，如「多模态模型」' },
        keywords: { type: 'array', items: { type: 'string' }, description: '匹配关键词（小写），如 ["multimodal", "vision language model"]' },
      },
      required: ['name', 'keywords'],
    },
    async call(args) {
      const topics = await getTopics();
      const id = 't' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const t = contract.normalizeTopic({ id, name: args.name, keywords: args.keywords, enabled: true, createdAt: Date.now() });
      if (!t) return err('至少需要一个非空关键词');
      topics.push(t);
      await kvSet(K.topics, topics);
      return ok(`已添加主题「${t.name}」（${t.id}），关键词：${t.keywords.join(', ')}。后台服务下次扫描会抓取相关论文。可在面板「论文雷达」或 paper_list_topics 查看。`);
    },
  },
  {
    name: 'paper_remove_topic',
    description: '删除一个关注主题（按 id，paper_list_topics 可查）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '主题 id' } },
      required: ['id'],
    },
    async call(args) {
      const topics = await getTopics();
      const next = topics.filter((t) => t.id !== args.id);
      if (next.length === topics.length) return err(`未找到主题 id=${args.id}`);
      await kvSet(K.topics, next);
      return ok(`已删除主题 ${args.id}。`);
    },
  },
  {
    name: 'paper_favorite',
    description: '收藏一篇论文到论文雷达（本地，cap.kv），可写笔记。之后面板/工具可见。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'arXiv id' },
        note: { type: 'string', description: '可选笔记/批注（如为什么想读）' },
      },
      required: ['id'],
    },
    async call(args) {
      const id = String(args.id || '').trim().replace(/(^\s*|\s*$)/g, '');
      if (!id) return err('请输入 arXiv id');
      const existing = await kvGet(K.fav(id));
      const now = Date.now();
      await kvSet(K.fav(id), {
        id,
        note: args.note ? String(args.note).slice(0, 2000) : (existing && existing.note) || '',
        read: existing && existing.read ? existing.read : false,
        favoritedAt: existing && existing.favoritedAt ? existing.favoritedAt : now,
        updatedAt: now,
      });
      return ok(`已收藏 ${id}${args.note ? `（备注：${args.note}）` : ''}。用 paper_list_favs 查看全部收藏。`);
    },
  },
  {
    name: 'paper_unfavorite',
    description: '取消收藏一篇论文。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'arXiv id' } },
      required: ['id'],
    },
    async call(args) {
      const id = String(args.id || '').trim();
      if (!id) return err('请输入 arXiv id');
      await kvDel(K.fav(id));
      return ok(`已取消收藏 ${id}。`);
    },
  },
  {
    name: 'paper_list_favs',
    description: '列出全部收藏的论文（含笔记与已读状态）。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const ids = await listFavs();
      if (!ids.length) return ok('还没有收藏。用 paper_favorite 收藏第一篇论文。');
      const rows = await Promise.all(ids.map(async (id) => {
        const f = await kvGet(K.fav(id));
        return f || { id, note: '', read: false };
      }));
      const lines = rows.map((f, i) => `${i + 1}. ${f.id}${f.read ? ' ✅' : ''}${f.note ? ` — ${shortText(f.note, 60)}` : ''}（https://arxiv.org/abs/${f.id}）`);
      return ok(`共 ${rows.length} 篇收藏：\n${lines.join('\n')}`);
    },
  },
];

// ── MCP 协议（JSON-RPC 2.0 over stdio）───────────────────────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { /* 丢弃非法行 */ continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handle message error: ${e.message}`);
    });
  }
});

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

async function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
      break;
    }
    case 'notifications/initialized': {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      break;
    }
    case 'tools/list': {
      send({
        jsonrpc: '2.0', id,
        result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      });
      break;
    }
    case 'tools/call': {
      const tool = tools.find((t) => t.name === (params && params.name));
      if (!tool) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${params && params.name}` } });
        break;
      }
      try {
        const output = await tool.call((params && params.arguments) || {});
        send({ jsonrpc: '2.0', id, result: output });
      } catch (e) {
        log('error', `tool ${tool.name} error: ${e.message}`);
        send({ jsonrpc: '2.0', id, error: { code: -32603, message: `工具执行失败: ${e.message}` } });
      }
      break;
    }
    case 'ping': {
      send({ jsonrpc: '2.0', id, result: {} });
      break;
    }
    default: {
      if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method: ${method}` } });
      break;
    }
  }
}

log('info', `MCP server 就绪（${SERVER_NAME} v${SERVER_VERSION}）`);