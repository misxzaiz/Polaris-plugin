#!/usr/bin/env node
'use strict';
/**
 * lingxi MCP Server —— 灵犀灵感孵化池的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的捕获/孵化/回访意图翻译为 cap.kv 的 lingxi.* 读写；
 * 全部计算逻辑走 shared/pond-core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无外网请求——纯本地想法池。
 *
 * 工具一览：
 *   lingxi_catch         捕获想法入池（自动关联旧想法，防重复、促相遇）
 *   lingxi_search        检索想法池（关键词/标签/类型/成熟度）
 *   lingxi_get           看一个想法的完整卡片（正文/时间线/回访态）
 *   lingxi_deepen        深化一个想法（沉淀一段思考，回访间隔翻倍）
 *   lingxi_promote       推进成熟度（种子→嫩芽→轮廓→蓝图→落地）
 *   lingxi_revisit       到期回访队列 / 记录回访结果
 *   lingxi_constellation 星系报告（按主标签聚类 + 合并候选）
 *   lingxi_collide       随机碰撞（抽想法 + 视角卡，AI 主持头脑风暴）
 *   lingxi_archive       归档 / 恢复
 *
 * 连接方式与 pocket-ledger / page-sentinel 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/pond-core.js');

const SERVER_NAME = 'lingxi';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 pocket-ledger / page-sentinel）─────────────────
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
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : [];
}

// ── 想法池数据访问（一想法一键，读改写幂等）───────────────────────────────
async function loadAllIdeas() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(core.K.ideaPrefix)).map((k) => k.slice(core.K.ideaPrefix.length));
  const ideas = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(core.K.idea(id));
    if (v && typeof v === 'object' && typeof v.id === 'string') ideas.push(v);
  }
  return ideas;
}

async function getIdea(id) {
  if (!id || typeof id !== 'string') return null;
  const v = await kvGet(core.K.idea(id));
  return v && typeof v === 'object' && typeof v.id === 'string' ? v : null;
}

async function saveIdea(idea) {
  await kvSet(core.K.idea(idea.id), idea);
}

function kindLabel(k) { return (core.KINDS.find((x) => x.key === k) || core.KINDS[0]).label; }
function matLabel(m) { return (core.MATURITIES[m] || core.MATURITIES[0]).label; }

function pipelineBar(maturity) {
  // 种子○ 嫩芽◔ 轮廓◑ 蓝图◕ 落地●
  return ['○', '◔', '◑', '◕', '●'].map((c, i) => (i <= maturity ? c : '·')).join('');
}

/** 最新一条「视角/追问」事件文本（捕获时 AI 留的深化抓手） */
function latestQuestion(idea) {
  const ev = (idea.timeline || []).find((e) => e && e.kind === 'question');
  return ev ? ev.text : '';
}

const EVENT_LABELS = {
  catch: '捕获', question: '追问', deepen: '深化', promote: '推进',
  revisit: '回访', archive: '归档', restore: '恢复', edit: '改题', collide: '碰撞',
};

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'lingxi_catch',
    description: '灵犀·捕获想法入池。用户冒出任何念头/点子/问题/素材时调用（一句「我突然想到…」「记个想法」即触发）。title 为一句话概括；tags 建议 1-3 个主题词（决定星图星系归属）；question 建议留一个你生成的深化追问（下次回访时帮用户重启思考）。捕获结果会自动附上池中可能相关的旧想法——务必向用户提及，避免重复、促成相遇。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '一句话概括（≤60字）' },
        raw: { type: 'string', description: '想法原文/细节，可空' },
        kind: { type: 'string', enum: ['idea', 'problem', 'resource', 'observation'], description: '点子/问题/素材/观察，缺省 idea' },
        tags: { type: 'array', items: { type: 'string' }, description: '主题标签 1-3 个（如 [「插件」,「效率」]）' },
        question: { type: 'string', description: 'AI 生成的一个深化追问，供下次回访时重启思考' },
        url: { type: 'string', description: '来源链接（素材类常见；只存线索不做抓取）' },
      },
      required: ['title'],
    },
    async call(args) {
      const now = Date.now();
      const norm = core.normalizeIdea({ ...args, origin: 'ai', now });
      if (norm.error) return err(norm.error);
      const idea = norm.idea;
      if (args.question && String(args.question).trim()) {
        core.pushEvent(idea, 'question', String(args.question).trim(), now);
      }
      // 相关匹配在写入前做（不含自身）
      const all = await loadAllIdeas();
      const related = core.findRelated(idea, all.filter((i) => i.status !== 'archived'), 3);
      await saveIdea(idea);
      const lines = [
        `已入池 [${idea.id}]「${idea.title}」 ${kindLabel(idea.kind)}·${matLabel(idea.maturity)}${idea.tags.length ? ` #${idea.tags.join(' #')}` : ''}`,
        `下次回访：${core.fmtDay(idea.revisit.dueAt)}（${core.REVISIT_BASE_DAYS} 天后首访）`,
      ];
      if (related.length) {
        lines.push('⚠️ 池中已有可能相关的想法（请向用户提及，看是否重复或可合并/关联）：');
        for (const r of related) lines.push(`  ${core.fmtIdeaLine(r.idea, now)}  相关度 ${r.score.toFixed(1)}`);
      }
      const due = core.dueRevisits(all, now);
      if (due.length >= 3) {
        lines.push(`（另：回访队列已积压 ${due.length} 条到期想法，可提醒用户来一次「翻牌回访」）`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'lingxi_search',
    description: '灵犀·检索想法池。可按关键词/标签/类型/成熟度过滤。适合「我之前是不是想过…」「把关于 XX 的想法都列出来」「看看已经到轮廓以上的想法」。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '关键词（标题/正文/标签模糊匹配）' },
        tag: { type: 'string', description: '按标签精确过滤' },
        kind: { type: 'string', enum: ['idea', 'problem', 'resource', 'observation'] },
        minMaturity: { type: 'integer', description: '成熟度下限 0-4' },
        status: { type: 'string', enum: ['active', 'archived', 'done'], description: '缺省只看在池（active）' },
        limit: { type: 'integer', description: '最多返回条数（默认 20，上限 50）' },
      },
    },
    async call(args) {
      const now = Date.now();
      const all = await loadAllIdeas();
      const found = core.searchIdeas(all, args)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.min(50, Math.max(1, Number(args.limit) || 20)));
      if (!found.length) return ok('没有符合条件的思想（试试放宽关键词，或查归档 status=archived）。');
      const head = `${args.keyword ? `「${args.keyword}」` : ''}命中 ${found.length} 条：`;
      return ok([head, ...found.map((i) => core.fmtIdeaLine(i, now))].join('\n'));
    },
  },
  {
    name: 'lingxi_get',
    description: '灵犀·看一个想法的完整卡片：正文、标签、成熟度、回访状态、时间线（含历次深化/推进记录与捕获时留下的追问）。讨论某个想法之前先调它。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '想法 id' } },
      required: ['id'],
    },
    async call(args) {
      const idea = await getIdea(args.id);
      if (!idea) return err(`想法 ${args.id} 不存在`);
      const now = Date.now();
      const lines = [
        `「${idea.title}」 [${idea.id}] ${kindLabel(idea.kind)}·${matLabel(idea.maturity)} ${pipelineBar(idea.maturity)}`,
        idea.raw ? `正文：${idea.raw}` : '（无正文）',
        idea.tags.length ? `标签：#${idea.tags.join(' #')}` : '标签：无',
        idea.url ? `来源：${idea.url}` : '',
        idea.status === 'active'
          ? `回访：${core.fmtDueRelative(idea.revisit.dueAt, now)}（间隔 ${idea.revisit.interval} 天，已回访 ${idea.revisit.history.length} 次）`
          : `状态：${idea.status === 'done' ? '已落地' : '归档中'}`,
        '时间线：',
        ...(idea.timeline || []).slice(0, 10).map((e) => `  ${core.fmtDateTime(e.at)} [${EVENT_LABELS[e.kind] || e.kind}] ${e.text}`),
      ].filter(Boolean);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'lingxi_deepen',
    description: '灵犀·深化一个想法：把讨论中新产生的理解/补充/方案沉淀进去（追加时间线，回访间隔翻倍）。与用户聊完某个想法有新结论时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '想法 id' },
        text: { type: 'string', description: '沉淀内容（讨论结论/补充/方案）' },
      },
      required: ['id', 'text'],
    },
    async call(args) {
      const idea = await getIdea(args.id);
      if (!idea) return err(`想法 ${args.id} 不存在`);
      const res = core.deepenIdea(idea, args.text, Date.now());
      if (res.error) return err(res.error);
      await saveIdea(res.idea);
      return ok([
        `已沉淀进「${res.idea.title}」（${matLabel(res.idea.maturity)}）`,
        `下次回访：${core.fmtDay(res.idea.revisit.dueAt)}（间隔翻倍至 ${res.idea.revisit.interval} 天）`,
      ].join('\n'));
    },
  },
  {
    name: 'lingxi_promote',
    description: '灵犀·推进成熟度：种子→嫩芽→轮廓→蓝图→落地。用户对想法有了更进一步的把握（怎么做清楚了/决定动手了）时调用。到「落地」即收口，不再回访。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '想法 id' },
        note: { type: 'string', description: '推进依据（一句话，如「方案已定：先做 CLI」）' },
      },
      required: ['id'],
    },
    async call(args) {
      const idea = await getIdea(args.id);
      if (!idea) return err(`想法 ${args.id} 不存在`);
      const res = core.promoteIdea(idea, Date.now(), args.note);
      if (res.error) return err(res.error);
      await saveIdea(res.idea);
      const lines = [
        `「${res.idea.title}」推进至「${matLabel(res.idea.maturity)}」 ${pipelineBar(res.idea.maturity)}`,
      ];
      if (res.idea.maturity >= 4) {
        lines.push('🎉 恭喜，想法落地了！它将离开回访队列。可以看看 lingxi_constellation，也许星系里还有能接力的想法。');
      } else {
        lines.push(`下次回访：${core.fmtDay(res.idea.revisit.dueAt)}（推进期保持 3 天活跃节奏）`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'lingxi_revisit',
    description: '灵犀·到期回访。action=list 列出今天到期待访的想法（含捕获时留下的追问，帮用户重启思考）；action=record 记录回访结果。用户说「翻翻旧想法」「回访」「这个想法再等等/归档了吧」时走这里。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'record'], description: '缺省 list' },
        id: { type: 'string', description: 'record 时的想法 id' },
        outcome: { type: 'string', enum: ['deepen', 'promote', 'snooze', 'archive'], description: 'record 时：深化/推进/再等等/归档' },
        note: { type: 'string', description: 'record 时的备注（deepen 时为沉淀内容）' },
      },
    },
    async call(args) {
      const now = Date.now();
      const action = args.action || 'list';
      if (action === 'list') {
        const all = await loadAllIdeas();
        const due = core.dueRevisits(all, now);
        if (!due.length) {
          const next = core.nextRevisitAt(all);
          return ok(next
            ? `回访队列干净，下一次到期：${core.fmtDay(next)}。`
            : '回访队列干净，池子里也没有活跃想法——去捕几个念头吧。');
        }
        const lines = [`今天 ${due.length} 条想法到期，值得再见面：`];
        for (const i of due) {
          const q = latestQuestion(i);
          lines.push(`  ${core.fmtIdeaLine(i, now)}（逾期 ${Math.max(0, Math.floor((now - i.revisit.dueAt) / core.DAY_MS))} 天）`);
          if (q) lines.push(`    追问：${q}`);
          if (i.raw) lines.push(`    原文：${i.raw.slice(0, 80)}${i.raw.length > 80 ? '…' : ''}`);
        }
        lines.push('逐条问用户：推进 / 深化 / 再等等 / 归档？然后用 action=record 记结果。');
        return ok(lines.join('\n'));
      }
      const idea = await getIdea(args.id);
      if (!idea) return err(`想法 ${args.id} 不存在`);
      const res = core.applyRevisitOutcome(idea, args.outcome, now, args.note);
      if (res.error) return err(res.error);
      await saveIdea(res.idea);
      const o = args.outcome;
      const tail = o === 'archive'
        ? '已归档（可随时恢复）。'
        : o === 'promote'
          ? `推进至「${matLabel(res.idea.maturity)}」。`
          : `下次回访：${core.fmtDay(res.idea.revisit.dueAt)}（间隔 ${res.idea.revisit.interval} 天）。`;
      return ok(`回访已记录（${o}）：「${res.idea.title}」 ${tail}`);
    },
  },
  {
    name: 'lingxi_constellation',
    description: '灵犀·星系报告：池中想法按主标签聚类成星系，每簇给数量/成熟度分布/存龄；并标出「值得合并成项目」的候选星系（≥3 条且 ≥2 条到轮廓以上）。适合定期盘点「池子里哪些想法可以合流了」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const now = Date.now();
      const all = await loadAllIdeas();
      if (!all.filter((i) => i.status !== 'archived').length) return ok('池子还空着（归档除外），先捕获几个想法吧。');
      const { clusters, mergeCandidates } = core.clusterConstellations(all, now);
      const lines = ['星系分布（按主标签聚类，活跃 + 已落地）：'];
      for (const c of clusters.slice(0, 12)) {
        const mat = c.byMaturity.map((n, i) => (n ? `${matLabel(i)}×${n}` : '')).filter(Boolean).join('/');
        lines.push(`  #${c.tag}：${c.count} 条（${mat}），最老 ${c.oldestDays} 天${c.matureCount >= 2 ? ' ★' : ''}`);
      }
      if (mergeCandidates.length) {
        lines.push('★ 合并候选（想法已成簇、部分已到轮廓——建议向用户提议合流成项目）：');
        for (const c of mergeCandidates) {
          const members = all.filter((i) => c.ideaIds.includes(i.id) && i.maturity >= 2);
          lines.push(`  #${c.tag}：${members.map((m) => `「${m.title}」[${m.id}]`).join('、')}`);
        }
      } else {
        lines.push('暂无合并候选：让子弹再飞一会，或用 lingxi_deepen 把成簇的想法往轮廓推进。');
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'lingxi_collide',
    description: '灵犀·随机碰撞头脑风暴：从池中随机抽几个想法 + 一张创意视角卡（强制嫁接/反转假设/缩放/减半/迁地他用…），由你主持这场碰撞并给出具体碰撞产出。用户说「头脑风暴」「来一场碰撞」「帮我把旧想法盘出点新东西」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'integer', description: '抽几个想法（2-5，默认 3）' },
        scope: { type: 'string', enum: ['all', 'active', 'mature'], description: 'all 含已落地；mature 只抽轮廓以上；缺省 active' },
      },
    },
    async call(args) {
      const all = await loadAllIdeas();
      const res = core.pickCollisions(all, { count: args.count, scope: args.scope });
      if (res.error) return err(res.error);
      const now = Date.now();
      const lines = [
        `碰撞开场（视角卡：${res.technique.name}）`,
        `规则：${res.technique.hint}`,
        '抽中的想法：',
        ...res.picks.map((p) => `  ${core.fmtIdeaLine(p, now)}${p.raw ? `\n    ${p.raw.slice(0, 100)}` : ''}`),
        '请按视角卡规则主持这场碰撞：给出 2-3 个具体的碰撞产出（新想法/新角度），有价值的当场问用户要不要 lingxi_catch 入池。',
      ];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'lingxi_archive',
    description: '灵犀·归档/恢复想法。归档＝沉寂（不删除，可检索可恢复，退出回访）；restore=true 从归档恢复入池（回访重置为 3 天节奏）。用户说「这个先放着/没兴趣了」→归档；「把 XX 捞回来」→恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '想法 id' },
        restore: { type: 'boolean', description: 'true=从归档恢复，缺省归档' },
      },
      required: ['id'],
    },
    async call(args) {
      const idea = await getIdea(args.id);
      if (!idea) return err(`想法 ${args.id} 不存在`);
      const res = args.restore ? core.restoreIdea(idea, Date.now()) : core.archiveIdea(idea, Date.now());
      if (res.error) return err(res.error);
      await saveIdea(res.idea);
      return ok(args.restore
        ? `「${res.idea.title}」已恢复入池，回访重置：${core.fmtDay(res.idea.revisit.dueAt)}。`
        : `「${res.idea.title}」已归档沉寂（未删除，可 lingxi_search status=archived 找到，可恢复）。`);
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
