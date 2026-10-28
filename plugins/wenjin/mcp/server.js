#!/usr/bin/env node
'use strict';
/**
 * wenjin MCP Server —— 问津（求职投递与面试作战台账）的 AI 工具层
 *
 * 职责：把 AI 的求职记录意图翻译为 cap.kv 的 wenjin.* 读写；
 * 全部计算逻辑走 shared/core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无网络请求（仅宿主 IPC）——纯本地台账，数据不出设备。
 *
 * 工具一览：
 *   wenjin_today     今日作战板（状态分布/跟进到期/近期日程/渠道一句话/offer 概况）
 *   wenjin_add_app   建投递档（公司 find-or-create；同公司同职位幂等）
 *   wenjin_log_event 记进展事件（面试/笔试/沟通/结果…，联动推进状态，可挂提醒）
 *   wenjin_add_offer 录 offer（年化对比；联动 offered 状态）
 *   wenjin_query     查询（投递列表/漏斗/复盘问题库/offer 对比）
 *   wenjin_update    改字段（部分补丁；kind + id 或 find 定位）
 *   wenjin_delete    删（需 confirm=true；投递级联删事件与 offer）
 *
 * 连接方式与 changqi / pocket-ledger 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/core.js');

const SERVER_NAME = 'wenjin';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 changqi / pocket-ledger）─────────────────────
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

// ── 数据访问 ─────────────────────────────────────────────────────────────

function beat(by) {
  kvSet(core.K.meta, { at: core.nowIso(), by }).catch(() => {});
}

async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return core.normalizeSettings(s && typeof s === 'object' ? s : {}, null);
}

/** 按前缀扁平加载实体（一条一键，规避列表并发覆盖） */
async function loadByPrefix(prefix, validFn) {
  const keys = await kvKeys();
  const hit = keys.filter((k) => k.startsWith(prefix)).sort();
  const out = [];
  for (const k of hit) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(k);
    if (v && typeof v === 'object' && validFn(v)) out.push(v);
  }
  return out;
}

const loadCompanies = () => loadByPrefix(core.K.companyPrefix, (v) => !!v.id);
const loadApps = () => loadByPrefix(core.K.appPrefix, (v) => !!v.id && !!v.companyId);
const loadResumes = () => loadByPrefix(core.K.resumePrefix, (v) => !!v.id);
const loadEvents = () => loadByPrefix(core.K.eventPrefix, (v) => !!v.id && !!v.appId);
const loadOffers = () => loadByPrefix(core.K.offerPrefix, (v) => !!v.id && !!v.appId);

async function loadAll() {
  const [companies, apps, resumes, events, offers, settings] = await Promise.all([
    loadCompanies(), loadApps(), loadResumes(), loadEvents(), loadOffers(), loadSettings(),
  ]);
  return { companies, apps, resumes, events, offers, settings };
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/** 定位投递：appId 优先；否则按 公司+职位 normName 判重 */
function findApp(apps, args) {
  if (args.appId) {
    const hit = apps.find((a) => a.id === String(args.appId));
    if (hit) return { app: hit };
    if (!args.company && !args.title) return { error: `找不到投递 ${args.appId}` };
  }
  if (args.company && args.title) {
    const hit = apps.find((a) => core.normName(a.companyName) === core.normName(String(args.company))
      && core.normName(a.title) === core.normName(String(args.title)));
    if (hit) return { app: hit };
  }
  return { error: null }; // 未找到但允许自动建档
}

/** 公司 find-or-create（按 normName 判重） */
async function ensureCompany(companies, name) {
  const key = core.normName(name);
  const hit = companies.find((c) => core.normName(c.name) === key);
  if (hit) return hit;
  const c = core.normalizeCompany({ name }, null);
  await kvSet(core.K.company(c.id), c);
  return c;
}

async function ensureResume(resumes, label) {
  const key = core.normName(label);
  const hit = resumes.find((r) => core.normName(r.label) === key);
  if (hit) return hit;
  const r = core.normalizeResume({ label }, null);
  await kvSet(core.K.resume(r.id), r);
  return r;
}

/** 描述一次状态推进 */
function statusNote(before, after) {
  if (before === after) return '';
  return `状态：${core.describeStatus(before)} → ${core.describeStatus(after)}`;
}

// ── 工具 ─────────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'wenjin_today',
    description: '问津·今日作战板。返回：状态分布、跟进到期（N 天无进展的投递，该催了）、近期面试/笔试日程与到点提醒、渠道一句话洞察、offer 概况。适合「今天求职上有什么要注意的」「有什么该跟进的」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const d = await loadAll();
      const now = Date.now();
      const p = core.pipeline(d.apps);
      const due = core.followUps(d.apps, d.events, d.settings, now);
      const u = core.upcoming(d.events, d.settings, now);
      const funnel = core.funnelBy(d.apps, d.events, 'channel');
      const offers = core.offerCompare(d.offers, d.apps);
      const lines = [];
      const activeCounts = core.ACTIVE_STATUSES.filter((s) => p.counts[s] > 0)
        .map((s) => `${core.STATUS_LABELS[s]} ${p.counts[s]}`).join(' · ');
      lines.push(activeCounts ? `在途：${activeCounts}` : '在途：暂无投递记录');
      if (p.counts.rejected || p.counts.withdrawn || p.counts.accepted) {
        lines.push(`终态：被拒 ${p.counts.rejected} · 放弃 ${p.counts.withdrawn} · 已接受 ${p.counts.accepted}`);
      }
      if (due.length) {
        lines.push('');
        lines.push(`⏰ 跟进到期 ${due.length} 条（超过 ${d.settings.followUpDays} 天无进展）：`);
        for (const f of due.slice(0, 8)) {
          lines.push(`  - ${f.app.companyName} · ${f.app.title}（${core.describeStatus(f.app.status)}）已 ${f.daysSince} 天无进展`);
        }
      } else {
        lines.push('✅ 暂无到期的跟进（所有在投投递都有近期动静）');
      }
      if (u.schedule.length || u.reminders.length) {
        lines.push('');
        lines.push('📅 近期日程：');
        for (const e of u.schedule.slice(0, 6)) {
          const a = d.apps.find((x) => x.id === e.appId);
          lines.push(`  - ${core.fmtDateTime(core.parseTs(e.at))} ${a ? a.companyName + ' · ' + a.title : ''} ${core.EVENT_LABELS[e.type]}${e.title ? '（' + e.title + '）' : ''}`);
        }
        for (const e of u.reminders.slice(0, 6)) {
          const a = d.apps.find((x) => x.id === e.appId);
          lines.push(`  - ⏰ 提醒：${a ? a.companyName + ' · ' + a.title : ''} ${e.title || e.detail ? clipText(e.title || e.detail, 40) : ''}`);
        }
      }
      const best = funnel.filter((g) => g.responded > 0)
        .sort((x, y) => (y.respondedRate ? parseInt(y.respondedRate) : 0) - (x.respondedRate ? parseInt(x.respondedRate) : 0)
          || y.responded - x.responded)[0];
      if (best) {
        lines.push('');
        lines.push(`📈 渠道一句话：${best.key} 已投 ${best.submitted}、有回音 ${best.responded}${best.respondedRate ? `（回复率 ${best.respondedRate}）` : '（样本 <5 不出百分比）'}${best.interviewed ? `、面试 ${best.interviewed}` : ''}`);
      }
      if (offers.length) {
        lines.push(`💰 offer 档案 ${offers.length} 份，当前最优年化 ${offers[0].annual} 元（${offers[0].companyName}）`);
      }
      lines.push('');
      lines.push('（问津只做求职记录与提醒，洞察不构成职业建议）');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'wenjin_add_app',
    description: '问津·建档投递。从对话提取后调用（"投了字节的前端岗"→ company=字节跳动 title=前端工程师 channel=boss；给了 JD 全文就存 jd）。同公司同职位重复建档会报错并提示改用 log_event/update。status=wish 表「想投还没投」；给了 appliedAt 或 status 非 wish 会自动补一条投递事件。',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: '公司名' },
        title: { type: 'string', description: '职位名称' },
        channel: { type: 'string', enum: core.CHANNELS, description: '渠道，缺省 other' },
        status: { type: 'string', enum: core.STATUSES, description: '缺省 applied（已投）；想投还没投用 wish' },
        jd: { type: 'string', description: 'JD 全文（存档用，可长）' },
        salaryPosted: { type: 'string', description: '期望/挂出的薪资，如 "25-35k·16薪"' },
        location: { type: 'string', description: '工作地点' },
        appliedAt: { type: 'string', description: '投递时间（YYYY-MM-DD[ HH:mm]），缺省现在；status=wish 时留空' },
        resumeLabel: { type: 'string', description: '使用的简历版本名（自动建到简历库）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['company', 'title'],
    },
    async call(args) {
      if (!args.company || !String(args.company).trim()) return err('company 不能为空');
      if (!args.title || !String(args.title).trim()) return err('title 不能为空');
      const now = Date.now();
      const d = await loadAll();
      let status = args.status != null ? String(args.status) : 'applied';
      if (!core.STATUSES.includes(status)) status = 'applied';
      const key = core.normName(args.company) + '|' + core.normName(args.title);
      const dup = d.apps.find((a) => core.normName(a.companyName) + '|' + core.normName(a.title) === key);
      if (dup) {
        return err(`已存在同公司同职位投递：${dup.companyName} · ${dup.title}（[${dup.id}]，当前 ${core.describeStatus(dup.status)}）。记进展用 wenjin_log_event，改信息用 wenjin_update。`);
      }
      const company = await ensureCompany(d.companies, args.company);
      const resume = args.resumeLabel ? await ensureResume(d.resumes, args.resumeLabel) : null;
      const app = core.normalizeApp({
        title: args.title, companyId: company.id, companyName: company.name,
        channel: args.channel, status,
        jd: args.jd, salaryPosted: args.salaryPosted, location: args.location,
        resumeId: resume ? resume.id : '', note: args.note,
        appliedAt: status === 'wish' ? '' : (args.appliedAt != null ? args.appliedAt : now),
      }, null, company.name);
      await kvSet(core.K.app(app.id), app);
      if (status !== 'wish') {
        const ev = core.normalizeEvent({
          type: 'applied',
          at: app.appliedAt || now,
          detail: args.channel && args.channel !== 'other' ? `经${core.describeChannel(app.channel)}投递` : '',
        }, null, app.id);
        await kvSet(core.K.event(ev.id), ev);
      }
      beat('mcp');
      const bits = [`已建档 [${app.id}]：${app.companyName} · ${app.title}`];
      bits.push(`${core.describeChannel(app.channel)} · ${core.describeStatus(app.status)}${app.appliedAt ? ` · 投递于 ${core.fmtDateTime(core.parseTs(app.appliedAt))}` : ''}`);
      if (app.jd) bits.push(`JD 已存档（${app.jd.length} 字）`);
      if (resume) bits.push(`简历版本：${resume.label}`);
      if (app.salaryPosted) bits.push(`薪资：${app.salaryPosted}`);
      if (app.status === 'wish') bits.push('（想投状态，不计入漏斗；投出后记一条 wenjin_log_event type=applied）');
      return ok(bits.join('\n'));
    },
  },
  {
    name: 'wenjin_log_event',
    description: '问津·记进展事件。面试/笔试/HR沟通/offer/被拒/备注全走这里（"字节二面过了"→ company=字节跳动 title=前端工程师 type=interview label=二面 detail=通过 outcome=pass）。title 永远是职位名（用于定位投递），事件的短标题用 label。事件会联动推进投递状态（offer 事件→已有offer；result+fail→被拒）。remindAt 可挂提醒（如"一周后还没回音提醒我问下"）。投递不存在时用 company+title 自动建档（status=applied）。',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: '投递 id（有就用它）' },
        company: { type: 'string', description: '公司名（无 appId 时用公司+职位定位；不存在则自动建档）' },
        title: { type: 'string', description: '职位名称（定位投递用，与建档口径一致）' },
        type: { type: 'string', enum: core.EVENT_TYPES, description: '事件类型' },
        at: { type: 'string', description: '事件时间（YYYY-MM-DD[ HH:mm]），缺省现在' },
        label: { type: 'string', description: '事件短标题（如"二面"、"技术面"、"HR 终面"）' },
        detail: { type: 'string', description: '详情（过程记录/复盘）' },
        questions: { type: 'any', description: '面试被问的问题（字符串数组或换行分隔字符串，进复盘问题库）' },
        outcome: { type: 'string', enum: core.OUTCOMES, description: 'result 事件的结果：pass/fail' },
        remindAt: { type: 'string', description: '提醒时间（YYYY-MM-DD[ HH:mm]），到点在今日板与面板显示' },
        status: { type: 'string', enum: core.STATUSES, description: '显式指定投递状态（缺省按事件类型自动推进）' },
      },
      required: ['type'],
    },
    async call(args) {
      if (!core.EVENT_TYPES.includes(args.type)) return err(`type 应为 ${core.EVENT_TYPES.join('/')}`);
      if (args.outcome != null && args.outcome !== '' && !core.OUTCOMES.includes(args.outcome)) {
        return err(`outcome 应为 ${core.OUTCOMES.join('/')}`);
      }
      const now = Date.now();
      const d = await loadAll();
      const found = findApp(d.apps, args);
      if (found.error) return err(found.error);
      let app = found.app;
      if (!app) {
        if (!args.company || !args.title) return err('投递不存在，且未提供 company+title 无法自动建档');
        const company = await ensureCompany(d.companies, args.company);
        app = core.normalizeApp({
          title: args.title, companyId: company.id, companyName: company.name,
          status: 'applied',
          appliedAt: args.type === 'applied' ? (args.at != null ? args.at : now) : '',
        }, null, company.name);
        await kvSet(core.K.app(app.id), app);
      }
      const ev = core.normalizeEvent({
        type: args.type, at: args.at, title: args.label, detail: args.detail,
        questions: args.questions, outcome: args.outcome, remindAt: args.remindAt,
      }, null, app.id);
      await kvSet(core.K.event(ev.id), ev);
      // 状态联动：显式 status > result:fail → rejected > 事件类型映射 > 保持
      const before = app.status;
      let nextStatus = before;
      let dirty = false;
      if (args.status != null && core.STATUSES.includes(args.status)) nextStatus = args.status;
      else if (args.type === 'result' && args.outcome === 'fail') nextStatus = 'rejected';
      else if (core.EVENT_STATUS_MAP[args.type]) nextStatus = core.EVENT_STATUS_MAP[args.type];
      if (args.type === 'applied' && !app.appliedAt) {
        app.appliedAt = new Date(core.parseTs(ev.at)).toISOString();
        dirty = true;
      }
      if (nextStatus !== before) {
        app.status = nextStatus;
        dirty = true;
      }
      if (dirty) {
        app.updatedAt = core.nowIso();
        await kvSet(core.K.app(app.id), app);
      }
      beat('mcp');
      const a = d.apps.find((x) => x.id === app.id) || app;
      const lines = [`已记录 [${ev.id}]：${a.companyName} · ${a.title} — ${core.EVENT_LABELS[ev.type]}${ev.title ? `（${ev.title}）` : ''} @ ${core.fmtDateTime(core.parseTs(ev.at))}`];
      const sn = statusNote(before, nextStatus);
      if (sn) lines.push(sn);
      if (ev.questions && ev.questions.length) lines.push(`已收录 ${ev.questions.length} 个面试问题进复盘库`);
      if (ev.remindAt) lines.push(`提醒已挂：${core.fmtDateTime(core.parseTs(ev.remindAt))}`);
      if (args.type === 'offer') lines.push('薪资结构建议用 wenjin_add_offer 录入，才能参与年化对比');
      if (args.type === 'result' && args.outcome === 'pass') lines.push('通过后下一轮安排好了记得再记一条（type=interview，可挂 remindAt）');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'wenjin_add_offer',
    description: '问津·录 offer。baseMonthly 必填（元/月）；months 总月数（缺省 12）、bonusMonths 年终奖月数；commuteMin 单程通勤分钟、remoteDays 每周远程天数、stockNote 期权/股票说明（只记文本不计价）。同一投递重复调用=更新该 offer。返回年化对比。',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: '投递 id（有就用它）' },
        company: { type: 'string', description: '公司名（无 appId 时定位/建档）' },
        title: { type: 'string', description: '职位名称' },
        baseMonthly: { type: 'number', description: '月薪（元，正数）' },
        months: { type: 'number', description: '合同月数，缺省 12' },
        bonusMonths: { type: 'number', description: '年终奖月数，缺省 0' },
        commuteMin: { type: 'number', description: '单程通勤分钟数' },
        remoteDays: { type: 'number', description: '每周远程天数 0-7' },
        stockNote: { type: 'string', description: '期权/股票/签字费说明（文本）' },
        deadline: { type: 'string', description: '答复截止时间（YYYY-MM-DD[ HH:mm]）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['baseMonthly'],
    },
    async call(args) {
      const now = Date.now();
      const d = await loadAll();
      const found = findApp(d.apps, args);
      if (found.error) return err(found.error);
      let app = found.app;
      if (!app) {
        if (!args.company || !args.title) return err('投递不存在，且未提供 company+title 无法自动建档');
        const company = await ensureCompany(d.companies, args.company);
        app = core.normalizeApp({ title: args.title, companyId: company.id, companyName: company.name, status: 'offered', appliedAt: '' }, null, company.name);
        await kvSet(core.K.app(app.id), app);
      }
      const offer = core.normalizeOffer(args, null, app.id);
      await kvSet(core.K.offer(offer.id), offer);
      const before = app.status;
      if (before !== 'offered' && before !== 'accepted') {
        app.status = 'offered';
        app.updatedAt = core.nowIso();
        await kvSet(core.K.app(app.id), app);
      }
      // 顺手挂 deadline 提醒（若给了且没有同刻提醒）
      if (offer.deadline) {
        const ev = core.normalizeEvent({ type: 'offer', at: now, title: 'offer 答复截止', remindAt: offer.deadline, detail: `${app.companyName} offer 答复截止` }, null, app.id);
        await kvSet(core.K.event(ev.id), ev);
      }
      beat('mcp');
      const rows = core.offerCompare([offer, ...d.offers.filter((o) => o.appId !== app.id)], d.apps);
      const lines = [`已录 offer [${offer.id}]：${app.companyName} · ${app.title}`];
      lines.push(`年化 ${offer.baseMonthly} × ${offer.months + offer.bonusMonths} 月 = ${Math.round(offer.baseMonthly * (offer.months + offer.bonusMonths))} 元${offer.bonusMonths ? `（含 ${offer.bonusMonths} 个月奖金）` : ''}`);
      if (offer.commuteMin > 0) lines.push(`年通勤约 ${rows.find((r) => r.offer.id === offer.id)?.commuteHoursPerYear ?? '?'} 小时`);
      if (rows.length > 1) {
        lines.push('');
        lines.push('offer 对比（按年化）：');
        for (const r of rows.slice(0, 5)) {
          lines.push(`  ${r.deltaVsBest === 0 ? '⭐' : '  '}${r.companyName} · ${r.title}：${r.annual} 元/年${r.deltaVsBest ? `（${r.deltaVsBest > 0 ? '+' : ''}${r.deltaVsBest}）` : ''}`);
        }
      }
      lines.push('（对比只算钱与通勤，不构成职业建议）');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'wenjin_query',
    description: '问津·查询。kind=apps（缺省）按状态/渠道/关键词/最近天数过滤投递，附每条最新进展；kind=funnel 渠道与简历版本漏斗；kind=questions 复盘问题库；kind=offers offer 对比。适合"投了 60 份有多少回音""哪版简历回复率高""被问过哪些问题"。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['apps', 'funnel', 'questions', 'offers'], description: '缺省 apps' },
        status: { type: 'string', enum: ['all', ...core.STATUSES], description: 'kind=apps：状态过滤，缺省 all（不含 wish 时另说）' },
        channel: { type: 'string', enum: core.CHANNELS, description: 'kind=apps：渠道过滤' },
        keyword: { type: 'string', description: 'kind=apps：公司/职位/备注模糊匹配' },
        days: { type: 'number', description: 'kind=apps：只看最近 N 天内有动静的' },
        limit: { type: 'number', description: '最多返回条数，缺省 30' },
      },
    },
    async call(args) {
      const d = await loadAll();
      const kind = args.kind || 'apps';
      if (kind === 'funnel') {
        const ch = core.funnelBy(d.apps, d.events, 'channel');
        const rs = core.funnelBy(d.apps, d.events, 'resumeId');
        const rname = new Map(d.resumes.map((r) => [r.id, r.label]));
        const lines = ['渠道漏斗（投递→回音→面试→offer）：'];
        for (const g of ch) {
          lines.push(`  ${g.key}：${g.submitted} / ${g.responded}${g.respondedRate ? `（${g.respondedRate}）` : ''} / ${g.interviewed}${g.interviewedRate ? `（${g.interviewedRate}）` : ''} / ${g.offered}${g.offeredRate ? `（${g.offeredRate}）` : ''}`);
        }
        if (rs.length) {
          lines.push('');
          lines.push('简历版本漏斗：');
          for (const g of rs) {
            const label = rname.get(g.key) || g.key;
            lines.push(`  ${label}：${g.submitted} / ${g.responded}${g.respondedRate ? `（${g.respondedRate}）` : ''} / ${g.interviewed} / ${g.offered}`);
          }
          if (rs.some((g) => g.submitted < 5)) lines.push('（样本 <5 的版本只给计数，不给出百分比）');
        }
        return ok(lines.join('\n'));
      }
      if (kind === 'questions') {
        const bank = core.questionBank(d.events, d.apps).slice(0, 30);
        if (!bank.length) return ok('复盘问题库还是空的——面试后用 wenjin_log_event 的 questions 字段记下被问的问题');
        const lines = [`复盘问题库（Top ${bank.length}）：`];
        for (const q of bank) {
          lines.push(`  ×${q.count} ${q.q}（${clipText(q.companies.join('、'), 40)}）`);
        }
        return ok(lines.join('\n'));
      }
      if (kind === 'offers') {
        const rows = core.offerCompare(d.offers, d.apps);
        if (!rows.length) return ok('还没有 offer 档案（wenjin_add_offer 录入）');
        const lines = ['offer 对比（按年化降序）：'];
        for (const r of rows) {
          lines.push(`  ${r.companyName} · ${r.title}：月薪 ${r.offer.baseMonthly} × ${r.totalMonths} 月 = ${r.annual} 元/年${r.offer.stockNote ? ` | 股票/期权：${clipText(r.offer.stockNote, 40)}` : ''}${r.commuteHoursPerYear != null ? ` | 年通勤 ${r.commuteHoursPerYear}h` : ''}`);
        }
        return ok(lines.join('\n'));
      }
      // kind=apps
      let list = d.apps.slice();
      const status = args.status || 'all';
      if (status !== 'all') list = list.filter((a) => a.status === status);
      if (args.channel && core.CHANNELS.includes(args.channel)) list = list.filter((a) => a.channel === args.channel);
      if (args.keyword) {
        const kw = core.normName(args.keyword);
        list = list.filter((a) => core.normName(a.companyName).includes(kw) || core.normName(a.title).includes(kw) || core.normName(a.note).includes(kw));
      }
      if (args.days && Number.isFinite(args.days) && args.days > 0) {
        const since = Date.now() - args.days * core.DAY_MS;
        list = list.filter((a) => {
          const last = core.lastEventAt(a.id, d.events);
          const t = last || core.parseTs(a.appliedAt) || core.parseTs(a.createdAt) || 0;
          return t >= since;
        });
      }
      list.sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
      const limit = Math.min(Math.max(Math.round(Number(args.limit) || 30), 1), 100);
      if (!list.length) return ok('没有符合条件的投递');
      const lines = [`投递 ${list.length} 条（显示前 ${Math.min(limit, list.length)}）：`];
      for (const a of list.slice(0, limit)) {
        const last = d.events.filter((e) => e.appId === a.id)
          .sort((x, y) => core.parseTs(y.at) - core.parseTs(x.at))[0];
        const lastDesc = last ? `${core.EVENT_LABELS[last.type]}${last.outcome ? `(${core.OUTCOME_LABELS[last.outcome]})` : ''} @ ${core.fmtDateTime(core.parseTs(last.at))}` : '暂无事件';
        lines.push(`  [${a.id}] ${a.companyName} · ${a.title}（${core.describeChannel(a.channel)}，${core.describeStatus(a.status)}）— ${lastDesc}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'wenjin_update',
    description: '问津·改字段。kind 定实体，id 或 find 定位（app 的 find={company,title}，resume 的 find={label}），patch 为部分补丁。app 可改：title/channel/status/jd/salaryPosted/location/appliedAt/resumeLabel/note/archived。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['app', 'company', 'resume', 'event', 'offer', 'settings'] },
        id: { type: 'string', description: '实体 id' },
        find: { type: 'object', description: '定位：{company,title} 或 {label}' },
        patch: { type: 'object', description: '要改的字段' },
      },
      required: ['kind', 'patch'],
    },
    async call(args) {
      const patch = args.patch && typeof args.patch === 'object' ? args.patch : null;
      if (!patch) return err('patch 必须是对象');
      const d = await loadAll();
      const now = Date.now();
      if (args.kind === 'settings') {
        const s = core.normalizeSettings(patch, d.settings);
        await kvSet(core.K.settings, s);
        beat('mcp');
        return ok(`设置已更新：跟进阈值 ${s.followUpDays} 天，提醒提前 ${s.remindLeadHours} 小时`);
      }
      if (args.kind === 'app') {
        const app = locateApp(d.apps, args);
        if (!app) return err('找不到要改的投递（用 id 或 find={company,title}）');
        if (patch.companyName || patch.company) {
          const c = await ensureCompany(d.companies, patch.companyName || patch.company);
          app.companyId = c.id;
          app.companyName = c.name;
        }
        if (patch.resumeLabel != null) {
          const r = patch.resumeLabel === '' ? null : await ensureResume(d.resumes, patch.resumeLabel);
          app.resumeId = r ? r.id : '';
        }
        const next = core.normalizeApp({ ...app, ...patch, companyId: app.companyId, companyName: app.companyName, resumeId: app.resumeId }, app, app.companyName);
        await kvSet(core.K.app(next.id), next);
        beat('mcp');
        return ok(`已更新 [${next.id}]：${next.companyName} · ${next.title}（${core.describeStatus(next.status)}）`);
      }
      if (args.kind === 'company') {
        const c = args.id ? d.companies.find((x) => x.id === args.id) : null;
        if (!c) return err('找不到公司（公司改动只支持 industry/note，需提供 id）');
        const next = core.normalizeCompany({ ...c, industry: patch.industry != null ? patch.industry : c.industry, note: patch.note != null ? patch.note : c.note }, c);
        await kvSet(core.K.company(next.id), next);
        beat('mcp');
        return ok(`公司已更新：${next.name}`);
      }
      if (args.kind === 'resume') {
        const r = args.id ? d.resumes.find((x) => x.id === args.id)
          : (args.find && args.find.label ? d.resumes.find((x) => core.normName(x.label) === core.normName(String(args.find.label))) : null);
        if (!r) return err('找不到简历版本（用 id 或 find={label}）');
        const next = core.normalizeResume({ ...r, ...patch, label: patch.label != null ? patch.label : r.label }, r);
        if (core.normName(next.label) !== core.normName(r.label)) {
          // 改名 = 新 id 的语义会造成引用断裂，禁止；改名请删了重建
          return err('简历版本名不可改（会破坏投递引用）；可新增版本或删除重建');
        }
        await kvSet(core.K.resume(next.id), next);
        beat('mcp');
        return ok(`简历版本已更新：${next.label}（${next.content ? next.content.length + ' 字' : '无正文'}）`);
      }
      if (args.kind === 'event') {
        const e = args.id ? d.events.find((x) => x.id === args.id) : null;
        if (!e) return err('找不到事件（需提供 id）');
        const next = core.normalizeEvent({ ...e, ...patch }, e, e.appId);
        await kvSet(core.K.event(next.id), next);
        beat('mcp');
        return ok(`事件已更新 [${next.id}]：${core.EVENT_LABELS[next.type]} @ ${core.fmtDateTime(core.parseTs(next.at))}`);
      }
      if (args.kind === 'offer') {
        const o = args.id ? d.offers.find((x) => x.id === args.id)
          : (args.find && args.find.company && args.find.title
            ? d.offers.find((x) => {
              const a = d.apps.find((ap) => ap.id === x.appId);
              return a && core.normName(a.companyName) === core.normName(String(args.find.company)) && core.normName(a.title) === core.normName(String(args.find.title));
            })
            : null);
        if (!o) return err('找不到 offer（用 id 或 find={company,title}）');
        const next = core.normalizeOffer({ ...o, ...patch }, o, o.appId);
        await kvSet(core.K.offer(next.id), next);
        beat('mcp');
        return ok(`offer 已更新 [${next.id}]：月薪 ${next.baseMonthly} × ${next.months + next.bonusMonths} 月`);
      }
      return err(`kind 应为 app/company/resume/event/offer/settings`);
    },
  },
  {
    name: 'wenjin_delete',
    description: '问津·删除（不可恢复，需 confirm=true）。kind=app 级联删除其事件与 offer 并回报删除数；kind=resume 会先解除投递引用再删；kind=company 只允许删无投递的空公司。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['app', 'company', 'resume', 'event', 'offer'] },
        id: { type: 'string', description: '实体 id' },
        find: { type: 'object', description: 'app 可用 {company,title}；resume 可用 {label}' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['kind'],
    },
    async call(args) {
      if (args.confirm !== true) return err('删除需要 confirm=true（不可恢复，请先向用户确认）');
      const d = await loadAll();
      if (args.kind === 'app') {
        const app = locateApp(d.apps, args);
        if (!app) return err('找不到要删的投递');
        const evs = d.events.filter((e) => e.appId === app.id);
        const offs = d.offers.filter((o) => o.appId === app.id);
        await kvDel(core.K.app(app.id));
        for (const e of evs) await kvDel(core.K.event(e.id));
        for (const o of offs) await kvDel(core.K.offer(o.id));
        beat('mcp');
        return ok(`已删除投递 [${app.id}] ${app.companyName} · ${app.title}，级联删除事件 ${evs.length} 条、offer ${offs.length} 份`);
      }
      if (args.kind === 'resume') {
        const r = args.id ? d.resumes.find((x) => x.id === args.id)
          : (args.find && args.find.label ? d.resumes.find((x) => core.normName(x.label) === core.normName(String(args.find.label))) : null);
        if (!r) return err('找不到简历版本');
        const refs = d.apps.filter((a) => a.resumeId === r.id);
        for (const a of refs) {
          a.resumeId = '';
          a.updatedAt = core.nowIso();
          await kvSet(core.K.app(a.id), a);
        }
        await kvDel(core.K.resume(r.id));
        beat('mcp');
        return ok(`已删除简历版本 ${r.label}，解除 ${refs.length} 条投递引用`);
      }
      if (args.kind === 'company') {
        const c = args.id ? d.companies.find((x) => x.id === args.id) : null;
        if (!c) return err('找不到公司（需 id）');
        const refs = d.apps.filter((a) => a.companyId === c.id);
        if (refs.length) return err(`公司 ${c.name} 名下还有 ${refs.length} 条投递，先删投递或改挂公司`);
        await kvDel(core.K.company(c.id));
        beat('mcp');
        return ok(`已删除公司 ${c.name}`);
      }
      if (args.kind === 'event') {
        const e = args.id ? d.events.find((x) => x.id === args.id) : null;
        if (!e) return err('找不到事件（需 id）');
        await kvDel(core.K.event(e.id));
        beat('mcp');
        return ok(`已删除事件 [${e.id}]`);
      }
      if (args.kind === 'offer') {
        const o = args.id ? d.offers.find((x) => x.id === args.id) : null;
        if (!o) return err('找不到 offer（需 id）');
        await kvDel(core.K.offer(o.id));
        beat('mcp');
        return ok(`已删除 offer [${o.id}]`);
      }
      return err('kind 应为 app/company/resume/event/offer');
    },
  },
];

function clipText(s, n) {
  s = String(s == null ? '' : s);
  return s.length <= n ? s : s.slice(0, n) + '…';
}

function locateApp(apps, args) {
  if (args.id) return apps.find((a) => a.id === String(args.id)) || null;
  if (args.find && args.find.company && args.find.title) {
    return apps.find((a) => core.normName(a.companyName) === core.normName(String(args.find.company))
      && core.normName(a.title) === core.normName(String(args.find.title))) || null;
  }
  return null;
}

// ── JSON-RPC stdio 主循环（同 changqi）──────────────────────────────────

process.stdout.write('');
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handleMessage(line).catch((e) => log('error', `handle: ${e.message}`));
  }
});
process.stdin.on('end', () => process.exit(0));

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
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
  if (msg.method === 'notifications/initialized' || (msg.method || '').startsWith('notifications/')) return;
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具 ${name}`) });
      return;
    }
    try {
      const result = await tool.call(args || {});
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `未知方法 ${msg.method}` } });
  }
}

log('info', `wenjin MCP v${SERVER_VERSION} 已启动（stdio，等宿主 initialize）`);
