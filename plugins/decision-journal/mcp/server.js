#!/usr/bin/env node
'use strict';
/**
 * decision-journal MCP Server —— 谋定的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI「立此存照 / 复盘 / 校准」的意图翻译为 cap.kv 的 decision.* 读写；
 * 全部计算逻辑走 shared/decision-core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无网络请求（仅本机桥）——纯本地决策日记。
 *
 * 工具一览：
 *   decision_create   立此存照/记下纠结（decided 必须带可检验预期+把握）
 *   decision_settle   纠结中 → 定案（补 chosen/预期/把握/复盘期限）
 *   decision_resolve  复盘打分 hit/partial/miss/void
 *   decision_list     查询（status/tag/keyword/due）
 *   decision_get      全文详情
 *   decision_update   编辑字段（不改状态）
 *   decision_shelve   搁置
 *   decision_stats    校准报告（分桶命中率/Brier/bias/教训）
 *   decision_delete   删除（confirm 必带）
 *
 * 连接方式与 pocket-ledger / page-sentinel 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/decision-core.js');

const SERVER_NAME = 'decision-journal';
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

// ── 决策数据访问 ───────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

/** 全部决策（扁平，updatedAt 降序） */
async function loadAll() {
  const keys = await kvKeys();
  const dKeys = keys.filter((k) => typeof k === 'string' && k.startsWith(core.K.dPrefix)).sort();
  const all = [];
  for (const dk of dKeys) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(dk);
    if (v && typeof v === 'object' && typeof v.id === 'string') all.push(v);
  }
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function getDecision(id) {
  const v = await kvGet(core.K.d(String(id || '').trim()));
  return v && typeof v === 'object' && v.id ? v : null;
}

async function saveDecision(d) {
  await kvSet(core.K.d(d.id), d);
}

/** 幂等写工具共用：出错返回 err 文本，成功返回 null */
function firstError(...results) {
  for (const r of results) if (r && r.error) return r.error;
  return null;
}

function fmtDecisionFull(d, now) {
  const chosen = d.chosenId && d.options ? (d.options.find((o) => o.id === d.chosenId) || {}).name : '';
  const lines = [
    `[${d.id}] ${d.title}（${core.STATUS_META[d.status].label}）`,
    d.question ? `问题：${d.question}` : '',
    d.context ? `背景：${d.context}` : '',
    d.options.length ? `选项：${d.options.map((o) => `${o.name}${o.id === d.chosenId ? ' ✓已选' : ''}${o.note ? `（${o.note}）` : ''}`).join(' / ')}` : '',
    chosen ? `已选：${chosen}` : '',
    d.rationale ? `理由：${d.rationale}` : '',
    d.expected ? `预期（把握 ${d.expected.confidence}%）：${d.expected.text}` : '',
    d.reviewAt && d.status === 'decided' ? `复盘期限：${core.dayKeyOf(d.reviewAt)}${core.isDue(d, now) ? ' ⚠️ 已到期' : ''}` : '',
    d.status === 'shelved' && d.shelvedReason ? `搁置原因：${d.shelvedReason}` : '',
    d.resolution ? [
      `复盘（${new Date(d.resolution.resolvedAt).toLocaleDateString('zh-CN')}）：${core.OUTCOME_META[d.resolution.outcome].label}`,
      d.resolution.note ? `  经过：${d.resolution.note}` : '',
      d.resolution.surprise ? `  意外：${d.resolution.surprise}` : '',
      d.resolution.lesson ? `  教训：${d.resolution.lesson}` : '',
    ].filter(Boolean).join('\n') : '',
    d.tags.length ? `标签：${d.tags.join('/')}` : '',
    d.links.length ? `关联：${d.links.join(', ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'decision_create',
    description: [
      '谋定·立此存照：记录一个刚做出的决定（decided），或一个纠结中的问题（open）。',
      '方法论（必须遵守）：',
      '1) decided 必须带 expectedText——一条「可检验的预期」：含时间范围与可观察判据（如「三个月内迁移完成且零数据丢失」），拒绝「会更好」「应该没问题」这类空话；',
      '2) confidence 是 0-100 的真实把握。用户说「挺有把握」「大概率」这类模糊表述时，先追问一个数字再落库，不要替用户编；',
      '3) 用户带着倾向诉说两难而尚未拍板时，用 open 模式记下（question + options），后续 decision_settle 定案；',
      '4) 创建后向用户复述：标题、所选项、预期、把握、复盘日期——确认无误。reviewInDays 缺省 90 天（0=不定期）。',
      '从对话识别：用户说「我决定…」「就选…」「先…再说」= decided；说「我在纠结 A 还是 B」= open。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '一句短语概括这个决定，如「迁移 RouterBus」「换工作」' },
        question: { type: 'string', description: '待决问题（open 模式必填；decided 可留空）' },
        context: { type: 'string', description: '背景与约束（为什么现在要决定、有哪些限制）' },
        options: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, note: { type: 'string' } } }, description: '候选方案（≤6 个）' },
        chosen: { type: 'string', description: '所选项：选项名或 1 基序号。提供即视为已定案（decided）' },
        rationale: { type: 'string', description: '为什么选它（一两句）' },
        expectedText: { type: 'string', description: '可检验的预期（decided 必填）：时间范围+可观察判据' },
        confidence: { type: 'number', description: '把握 0-100（decided 必填，真实把握而非愿望）' },
        reviewInDays: { type: 'number', description: '复盘期限（天），缺省 90；0=不定期' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签，如 ["架构","迁移"]' },
        links: { type: 'array', items: { type: 'string' }, description: '关联决策 id（decision_list 可查）' },
        source: { type: 'string', enum: ['ai', 'panel'], description: '来源标记，AI 调用保持缺省' },
      },
      required: ['title'],
    },
    async call(args) {
      const settings = await loadSettings();
      const now = Date.now();
      const expected = args.expectedText || args.confidence != null
        ? { text: args.expectedText || '', confidence: args.confidence }
        : null;
      const norm = core.normalizeDecision(
        { ...args, expected, source: args.source || 'ai' },
        { now, defaultReviewDays: settings.reviewDefaultDays },
      );
      if (norm.error) return err(norm.error);
      await saveDecision(norm.decision);
      const d = norm.decision;
      const review = d.reviewAt ? `复盘日期 ${core.dayKeyOf(d.reviewAt)}` : '未设复盘期限';
      return ok([
        `已立此存照：${d.title}（${core.STATUS_META[d.status].label}）`,
        d.expected ? `预期（把握 ${d.expected.confidence}%）：${d.expected.text}` : d.question ? `问题：${d.question}` : '',
        `${review} · id=${d.id}`,
        d.status === 'decided' ? '到期后用 decision_resolve 复盘打分。' : '定案时用 decision_settle 补预期与把握。',
      ].filter(Boolean).join('\n'));
    },
  },
  {
    name: 'decision_settle',
    description: '谋定·定案：把纠结中（open）的决策拍板——补 chosen / 可检验预期 / 把握，进入存照等待复盘。预期与把握的方法论同 decision_create：先追问数字，不编造。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '决策 id（decision_list 可查）' },
        chosen: { type: 'string', description: '所选项：选项名或 1 基序号' },
        rationale: { type: 'string', description: '为什么选它' },
        expectedText: { type: 'string', description: '可检验的预期（必填）' },
        confidence: { type: 'number', description: '把握 0-100（必填）' },
        reviewInDays: { type: 'number', description: '复盘期限（天），缺省 90；0=不定期' },
      },
      required: ['id', 'chosen', 'expectedText', 'confidence'],
    },
    async call(args) {
      const settings = await loadSettings();
      const existing = await getDecision(args.id);
      if (!existing) return err(`决策 ${args.id} 不存在（decision_list 可查）`);
      const patch = {
        chosen: args.chosen,
        rationale: args.rationale,
        expected: { text: args.expectedText || '', confidence: args.confidence },
        ...(args.reviewInDays !== undefined ? { reviewInDays: args.reviewInDays } : {}),
      };
      const res = core.settleDecision(existing, patch, { now: Date.now(), defaultReviewDays: settings.reviewDefaultDays });
      const e = firstError(res);
      if (e) return err(e);
      await saveDecision(res.decision);
      const d = res.decision;
      return ok([
        `已定案：${d.title}`,
        `预期（把握 ${d.expected.confidence}%）：${d.expected.text}`,
        d.reviewAt ? `复盘日期 ${core.dayKeyOf(d.reviewAt)}` : '未设复盘期限',
      ].join('\n'));
    },
  },
  {
    name: 'decision_resolve',
    description: [
      '谋定·复盘：到期（或用户主动提起）时对一条存照打分。先 decision_get 取原文，把 expected 与现实逐条对照后再打分：',
      '- hit 兑现：预期基本如数发生；',
      '- partial 部分兑现：方向对但打折（记 note 说明打了几折）；',
      '- miss 落空：预期没发生；',
      '- void 作废：前提消失/决定被推翻，不计入校准分。',
      '复盘时帮用户找偏差来源（信息不足？执行走样？运气？），surprise 记意料之外的事，lesson 沉淀成一句可复用的教训（会进经验卡，decision_stats 可引用）。',
      '用户说「复盘一下 X」「那个决定结果如何」时调用；重复盘会覆盖旧复盘。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '决策 id' },
        outcome: { type: 'string', enum: ['hit', 'partial', 'miss', 'void'], description: '兑现/部分兑现/落空/作废' },
        note: { type: 'string', description: '实际发生了什么（对照预期）' },
        surprise: { type: 'string', description: '意料之外的事（可选）' },
        lesson: { type: 'string', description: '一句可复用的教训（可选，强烈建议）' },
      },
      required: ['id', 'outcome'],
    },
    async call(args) {
      const existing = await getDecision(args.id);
      if (!existing) return err(`决策 ${args.id} 不存在（decision_list 可查）`);
      const res = core.resolveDecision(existing, args, { now: Date.now() });
      const e = firstError(res);
      if (e) return err(e);
      await saveDecision(res.decision);
      const d = res.decision;
      const exp = d.expected ? `原预期（把握 ${d.expected.confidence}%）：${d.expected.text}\n` : '';
      return ok([
        `已复盘：${d.title} → ${core.OUTCOME_META[d.resolution.outcome].label}`,
        exp + (d.resolution.note ? `经过：${d.resolution.note}` : ''),
        d.resolution.lesson ? `教训已入经验卡：${d.resolution.lesson}` : '',
        d.resolution.outcome !== 'void' ? `把握 ${d.expected ? d.expected.confidence : '?'}% vs 结果 ${d.resolution.score}` : '',
        'decision_stats 可看整体校准。',
      ].filter(Boolean).join('\n'));
    },
  },
  {
    name: 'decision_list',
    description: '谋定·查询决策列表。status：due=到期待复盘（做晨报/提醒时先查这个）、open=纠结中、decided=存照中、resolved=已复盘、shelved=搁置、all=全部（缺省）。用户问「有什么该复盘了」→ status=due；「我纠结中的事」→ open。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'open', 'decided', 'resolved', 'shelved', 'due'] },
        tag: { type: 'string', description: '按标签过滤' },
        keyword: { type: 'string', description: '标题/问题/背景/预期模糊匹配' },
        limit: { type: 'integer', description: '最多返回条数（默认 20，上限 50）' },
      },
    },
    async call(args) {
      const all = await loadAll();
      const now = Date.now();
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      let list = all;
      if (args.status === 'due') list = all.filter((d) => core.isDue(d, now));
      else if (args.status && args.status !== 'all') list = all.filter((d) => d.status === args.status);
      if (args.tag) list = list.filter((d) => d.tags.includes(String(args.tag)));
      if (args.keyword) {
        const kw = String(args.keyword).toLowerCase();
        list = list.filter((d) => [d.title, d.question, d.context, d.expected ? d.expected.text : '', d.rationale]
          .join(' ').toLowerCase().includes(kw));
      }
      if (!list.length) return ok(args.status === 'due' ? '没有到期待复盘的决策。' : '没有符合条件的决策。');
      const head = list.slice(0, limit).map((d) => core.summarize(d, now));
      const cal = core.computeCalibration(all);
      return ok([
        `共 ${list.length} 条${list.length > limit ? `（显示 ${limit}）` : ''}：`,
        ...head,
        '',
        `存照 ${cal.nScored + cal.nVoid} 已复盘 · 整体命中率 ${(cal.hitRate * 100).toFixed(0)}%（平均把握 ${(cal.avgConf * 100).toFixed(0)}%），decision_stats 看校准详情。`,
      ].join('\n'));
    },
  },
  {
    name: 'decision_get',
    description: '谋定·读取一条决策全文（背景/选项/预期/复盘/关联）。复盘或引用前先调用。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '决策 id' } },
      required: ['id'],
    },
    async call(args) {
      const d = await getDecision(args.id);
      if (!d) return err(`决策 ${args.id} 不存在`);
      return ok(fmtDecisionFull(d, Date.now()));
    },
  },
  {
    name: 'decision_update',
    description: '谋定·编辑决策字段（不改状态）：标题/问题/背景/选项/理由/预期(text+confidence)/复盘期限/标签/关联。改预期要向用户确认（改了预期等于改了校准口径）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        question: { type: 'string' },
        context: { type: 'string' },
        options: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, note: { type: 'string' } } } },
        rationale: { type: 'string' },
        expected: { type: 'object', properties: { text: { type: 'string' }, confidence: { type: 'number' } } },
        reviewInDays: { type: 'number', description: '重设复盘期限（天）；0=不定期' },
        tags: { type: 'array', items: { type: 'string' } },
        links: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
    async call(args) {
      const settings = await loadSettings();
      const existing = await getDecision(args.id);
      if (!existing) return err(`决策 ${args.id} 不存在`);
      const res = core.updateDecision(existing, args, { now: Date.now(), defaultReviewDays: settings.reviewDefaultDays });
      const e = firstError(res);
      if (e) return err(e);
      await saveDecision(res.decision);
      return ok(`已更新：${res.decision.title}（${core.STATUS_META[res.decision.status].label}）`);
    },
  },
  {
    name: 'decision_shelve',
    description: '谋定·搁置：纠结中或存照中的决策不再跟进（前提消失、优先级让位）。搁置不计入校准。已复盘的不可搁置。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        reason: { type: 'string', description: '搁置原因（可选）' },
      },
      required: ['id'],
    },
    async call(args) {
      const existing = await getDecision(args.id);
      if (!existing) return err(`决策 ${args.id} 不存在`);
      const res = core.shelveDecision(existing, args.reason, { now: Date.now() });
      const e = firstError(res);
      if (e) return err(e);
      await saveDecision(res.decision);
      return ok(`已搁置：${res.decision.title}${res.decision.shelvedReason ? `（${res.decision.shelvedReason}）` : ''}`);
    },
  },
  {
    name: 'decision_stats',
    description: '谋定·校准报告：各状态计数、分桶校准表（自称把握 vs 实际命中率）、Brier 分数（越低越准，0=完美）、bias 解读（过度自信/保守）、最近教训。用户问「我判断准不准」「我的直觉靠谱吗」时调用。写新决定前也可引用历史教训。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const all = await loadAll();
      const now = Date.now();
      const ov = core.buildOverview(all, now);
      const cal = core.computeCalibration(all);
      const lessons = core.recentLessons(all, 5);
      const lines = [
        `决策台账：纠结中 ${ov.counts.open} · 存照中 ${ov.counts.decided}（到期 ${ov.due.length}）· 已复盘 ${ov.counts.resolved} · 搁置 ${ov.counts.shelved}`,
        '',
        `校准（可计分样本 ${cal.nScored}${cal.nVoid ? `，另有 ${cal.nVoid} 条作废不计分` : ''}）：`,
        `  整体：命中率 ${(cal.hitRate * 100).toFixed(0)}% vs 平均把握 ${(cal.avgConf * 100).toFixed(0)}% · Brier ${cal.brier}（越低越准）`,
        '  分桶（自称把握 → 实际命中率）：',
      ];
      for (const b of cal.buckets) {
        lines.push(`    ${b.label.padEnd(8)} n=${String(b.n).padEnd(3)} 命中 ${(b.hitRate * 100).toFixed(0)}%（把握 ${(b.avgConf * 100).toFixed(0)}%）`);
      }
      lines.push(`  解读：${cal.verdict}`);
      if (lessons.length) {
        lines.push('', '最近教训：');
        for (const l of lessons) lines.push(`  · ${l.title}：${l.lesson}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'decision_delete',
    description: '谋定·删除一条决策（不可恢复）。必须显式 confirm=true。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['id', 'confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('删除需要显式 confirm=true');
      const existing = await getDecision(args.id);
      if (!existing) return err(`决策 ${args.id} 不存在`);
      await kvDel(core.K.d(existing.id));
      return ok(`已删除：${existing.title}（${existing.id}）`);
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
