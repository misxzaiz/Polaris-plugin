#!/usr/bin/env node
'use strict';
/**
 * changqi MCP Server —— 常契（订阅契约账簿）的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的订阅管理意图翻译为 cap.kv 的 changqi.* 读写；
 * 全部计算逻辑走 shared/subs-core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无网络请求——纯本地账本，数据不出设备。
 *
 * 工具一览：
 *   changqi_add          入册一笔订阅（支持 trialEndsAt 建试用）
 *   changqi_list         台账列表（状态/关键词过滤，按下期排序）
 *   changqi_update       改字段（部分补丁）
 *   changqi_advance      确认"这期已扣"（红条消退，下期顺延）
 *   changqi_cancel       软取消（附该渠道取消自动续费路径引导）
 *   changqi_delete       硬删（需 confirm=true）
 *   changqi_upcoming     即将扣费窗口（默认 7 天，含试用转正预警）
 *   changqi_summary      透视（月均/年化/本月将扣/渠道/分类/Top）
 *   changqi_cancel_guide 渠道取消路径指引（不改动数据）
 *
 * 连接方式与 pocket-ledger / page-sentinel 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/subs-core.js');

const SERVER_NAME = 'changqi';
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

// ── 数据访问 ───────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

/** 全部订阅（扁平） */
async function loadSubs() {
  const keys = await kvKeys();
  const subKeys = keys.filter((k) => k.startsWith(core.K.subPrefix)).sort();
  const subs = [];
  for (const sk of subKeys) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(sk);
    if (v && typeof v === 'object' && v.id) subs.push(v);
  }
  return subs;
}

async function loadSub(id) {
  if (!id || typeof id !== 'string') return null;
  const v = await kvGet(core.K.sub(id));
  return v && typeof v === 'object' && v.id ? v : null;
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/** 解析日期参数：today/tomorrow/YYYY-MM-DD → 'YYYY-MM-DD' */
function resolveDayStr(input, now) {
  if (!input || input === 'today' || input === '今天') return core.todayStr(now);
  if (input === 'tomorrow' || input === '明天') return core.todayStr(now + 86400000);
  const s = String(input).trim();
  if (core.parseYMD(s)) return s;
  return null;
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'changqi_add',
    description: '常契·订阅入册。从对话提取订阅信息后调用（"我在 iCloud 开了月度会员 6 元"→ name=iCloud会员 amount=6 cycle=monthly channel=apple）。amount 为每期金额；cycle 为扣费周期；anchorDate 为上次扣费日或账单上的下次扣费日（缺省今天）；channel 为扣费渠道（决定取消引导文案）；trialEndsAt 提供则入为试用期（转正前会预警）。入册成功即回报月均支出。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '订阅名称（如"网易云音乐黑胶VIP"）' },
        amount: { type: 'number', description: '每期金额（正数）' },
        cycle: { type: 'string', enum: core.CYCLES, description: '扣费周期，缺省 monthly' },
        cycleDays: { type: 'integer', description: 'cycle=custom 时的周期天数（≥1）' },
        anchorDate: { type: 'string', description: '上次扣费日/下次扣费日，today/tomorrow/YYYY-MM-DD，缺省 today' },
        channel: { type: 'string', enum: core.CHANNELS, description: '扣费渠道，缺省 other' },
        category: { type: 'string', description: '分类（影视音乐/软件工具/云存储/AI 订阅/电商会员/游戏/学习/生活服务/其他），缺省其他' },
        trialEndsAt: { type: 'string', description: '试用期截止日（YYYY-MM-DD），提供则入为试用期' },
        note: { type: 'string', description: '备注' },
      },
      required: ['name', 'amount'],
    },
    async call(args) {
      const now = Date.now();
      const anchor = resolveDayStr(args.anchorDate, now);
      if (anchor === null) return err('anchorDate 格式应为 today/tomorrow/YYYY-MM-DD');
      let trialEndsAt;
      if (args.trialEndsAt != null && args.trialEndsAt !== '') {
        trialEndsAt = resolveDayStr(args.trialEndsAt, now);
        if (!trialEndsAt) return err('trialEndsAt 格式应为 YYYY-MM-DD');
      }
      const norm = core.normalizeSub({ ...args, anchorDate: anchor, trialEndsAt }, now);
      if (norm.error) return err(norm.error);
      const sub = norm.sub;
      const existing = await loadSub(sub.id);
      if (existing) return err(`订阅 ${sub.id} 已存在（重复生成，请重试）`);
      await kvSet(core.K.sub(sub.id), sub);
      const settings = await loadSettings();
      const today = core.todayStr(now);
      const next = core.nextChargeDateOf(sub, today);
      const cyc = sub.cycle === 'custom' ? `每${sub.cycleDays}天` : core.CYCLE_LABELS[sub.cycle];
      return ok([
        `已入册 [${sub.id}]：${sub.name} ${core.fmtMoney(sub.amount, settings.currencySymbol)}/${cyc}（${core.CHANNEL_LABELS[sub.channel]} · ${sub.category}）`,
        `月均支出 ${core.fmtMoney(core.monthlyEquivalent(sub), settings.currencySymbol)}`,
        sub.status === 'trial'
          ? `试用期至 ${sub.trialEndsAt}（转正前 ${settings.trialWarnDays} 天内会预警）`
          : next ? `下期扣费 ${next}（${core.diffDays(today, next)} 天后）` : '',
      ].filter(Boolean).join('\n'));
    },
  },
  {
    name: 'changqi_list',
    description: '常契·台账列表。按状态（active/trial/cancelled，缺省全部非取消=进行中+试用）与关键词过滤，按下期扣费日排序。适合"我有哪些订阅""看看已取消的"。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', ...core.STATUSES], description: '缺省进行中+试用（不含已取消）' },
        keyword: { type: 'string', description: '名称/分类/备注模糊匹配' },
      },
    },
    async call(args) {
      const settings = await loadSettings();
      const today = core.todayStr();
      const subs = await loadSubs();
      const status = args.status || 'active+trial';
      let list;
      if (status === 'all') list = subs;
      else if (status === 'active') list = subs.filter((s) => s.status === 'active');
      else if (status === 'trial') list = subs.filter((s) => s.status === 'trial');
      else if (status === 'cancelled') list = subs.filter((s) => s.status === 'cancelled');
      else list = subs.filter((s) => s.status === 'active' || s.status === 'trial');
      if (args.keyword) {
        const kw = String(args.keyword).toLowerCase();
        list = list.filter((s) => [s.name, s.category, s.note].some((f) => f && String(f).toLowerCase().includes(kw)));
      }
      if (!list.length) return ok('没有符合条件的订阅。');
      const withNext = list.map((s) => ({ s, next: core.nextChargeDateOf(s, today) }));
      withNext.sort((x, y) => {
        const dx = x.next || '9999-12-31'; const dy = y.next || '9999-12-31';
        return dx < dy ? -1 : dx > dy ? 1 : 0;
      });
      const head = [`共 ${withNext.length} 笔，月均 ${core.fmtMoney(withNext.reduce((acc, r) => acc + core.monthlyEquivalent(r.s), 0), settings.currencySymbol)}：`];
      return ok([...head, ...withNext.map((r) => core.fmtSubLine(r.s, settings, today))].join('\n'));
    },
  },
  {
    name: 'changqi_update',
    description: '常契·修改订阅字段（部分补丁）。可改 name/amount/cycle/cycleDays/anchorDate/channel/category/trialEndsAt/note；trialEndsAt 传空串退出试用。改金额/周期后立即回报新月均。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅 id（changqi_list 里方括号内）' },
        name: { type: 'string' },
        amount: { type: 'number' },
        cycle: { type: 'string', enum: core.CYCLES },
        cycleDays: { type: 'integer' },
        anchorDate: { type: 'string', description: 'YYYY-MM-DD（修正扣费日漂移时用）' },
        channel: { type: 'string', enum: core.CHANNELS },
        category: { type: 'string' },
        trialEndsAt: { type: 'string', description: 'YYYY-MM-DD 或空串（退出试用）' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
    async call(args) {
      const sub = await loadSub(args.id);
      if (!sub) return err(`未找到订阅 ${args.id}（用 changqi_list 确认 id）`);
      const patch = { ...args };
      delete patch.id;
      if (patch.anchorDate != null) {
        const a = resolveDayStr(patch.anchorDate, Date.now());
        if (!a) return err('anchorDate 格式应为 YYYY-MM-DD');
        patch.anchorDate = a;
      }
      if (patch.trialEndsAt != null && patch.trialEndsAt !== '') {
        const t = resolveDayStr(patch.trialEndsAt, Date.now());
        if (!t) return err('trialEndsAt 格式应为 YYYY-MM-DD 或空串');
        patch.trialEndsAt = t;
      }
      const merged = core.applyPatch(sub, patch, Date.now());
      if (merged.error) return err(merged.error);
      await kvSet(core.K.sub(sub.id), merged.sub);
      const settings = await loadSettings();
      const today = core.todayStr();
      const next = core.nextChargeDateOf(merged.sub, today);
      return ok([
        `已更新 ${merged.sub.name}：`,
        `${core.fmtMoney(merged.sub.amount, settings.currencySymbol)}/${merged.sub.cycle === 'custom' ? `每${merged.sub.cycleDays}天` : core.CYCLE_LABELS[merged.sub.cycle]}（月均 ${core.fmtMoney(core.monthlyEquivalent(merged.sub), settings.currencySymbol)}）`,
        merged.sub.status === 'trial' ? `试用期至 ${merged.sub.trialEndsAt}` : next ? `下期扣费 ${next}` : '已取消',
      ].join('\n'));
    },
  },
  {
    name: 'changqi_advance',
    description: '常契·确认"这期已经扣过了"。红条消退、下期自动顺延（保留原扣费节奏）。适合用户说"这个扣过了""刚续费了"。paidDate 缺省今天。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅 id' },
        paidDate: { type: 'string', description: '已扣费日期，today/YYYY-MM-DD，缺省 today' },
      },
      required: ['id'],
    },
    async call(args) {
      const sub = await loadSub(args.id);
      if (!sub) return err(`未找到订阅 ${args.id}（用 changqi_list 确认 id）`);
      if (sub.status === 'cancelled') return err('该订阅已取消，无需推进');
      if (sub.status === 'trial') return err('试用期订阅无"已扣"概念；转正后用 changqi_update 处理');
      const paid = resolveDayStr(args.paidDate, Date.now());
      if (!paid) return err('paidDate 格式应为 today/YYYY-MM-DD');
      const merged = core.applyPatch(sub, { lastConfirmedDate: paid }, Date.now());
      if (merged.error) return err(merged.error);
      await kvSet(core.K.sub(sub.id), merged.sub);
      const settings = await loadSettings();
      const today = core.todayStr();
      const next = core.nextChargeDateOf(merged.sub, today);
      return ok(`已确认 ${sub.name} 在 ${paid} 已扣费。下期扣费 ${next}（${core.diffDays(today, next)} 天后）。`);
    },
  },
  {
    name: 'changqi_cancel',
    description: '常契·取消订阅（软取消：状态置为已取消，台账留档可查，不再提醒）。返回会附带该渠道关闭自动续费的路径指引（App 内取消往往不彻底）。用户说"取消 xx 订阅""退订"时调用。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '订阅 id' } },
      required: ['id'],
    },
    async call(args) {
      const sub = await loadSub(args.id);
      if (!sub) return err(`未找到订阅 ${args.id}（用 changqi_list 确认 id）`);
      if (sub.status === 'cancelled') return err(`${sub.name} 已是取消状态`);
      const merged = core.applyPatch(sub, { status: 'cancelled' }, Date.now());
      if (merged.error) return err(merged.error);
      await kvSet(core.K.sub(sub.id), merged.sub);
      const settings = await loadSettings();
      return ok([
        `已取消 ${sub.name}（月均省下 ${core.fmtMoney(core.monthlyEquivalent(sub), settings.currencySymbol)}）。台账留档，可随时在面板查看。`,
        '关闭自动续费路径：',
        core.cancelGuide(sub.channel),
      ].join('\n'));
    },
  },
  {
    name: 'changqi_delete',
    description: '常契·彻底删除订阅记录（不可恢复，与软取消不同）。必须 confirm=true 才执行；一般场景建议 changqi_cancel（留档）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅 id' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['id', 'confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('删除不可恢复，需显式 confirm=true（若只想停止提醒请用 changqi_cancel）');
      const sub = await loadSub(args.id);
      if (!sub) return err(`未找到订阅 ${args.id}`);
      await kvDel(core.K.sub(args.id));
      return ok(`已彻底删除 ${sub.name}（${args.id}）。`);
    },
  },
  {
    name: 'changqi_upcoming',
    description: '常契·即将扣费窗口：未来 N 天（缺省 7）内会扣费的订阅清单，含今天将扣与试用转正预警。适合"这周要扣什么""最近有什么要续费"。',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', description: '窗口天数（缺省 7，上限 90）' } },
    },
    async call(args) {
      const settings = await loadSettings();
      const today = core.todayStr();
      const days = Math.min(90, Math.max(1, Math.floor(Number(args.days) || 7)));
      const subs = await loadSubs();
      const ov = core.computeOverview(subs, settings, today, today.slice(0, 7));
      const inWindow = ov.rows
        .filter((r) => r.daysUntil != null && r.daysUntil <= days)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      if (!inWindow.length) return ok(`未来 ${days} 天没有订阅扣费。`);
      const sym = settings.currencySymbol;
      const sum = inWindow.reduce((acc, r) => acc + r.sub.amount, 0);
      const lines = inWindow.map((r) => {
        const tag = r.urgency === 'today' ? '【今天】' : r.urgency === 'trial' ? '【试用转正】' : r.urgency === 'soon' ? '【即将】' : '';
        const trial = r.sub.status === 'trial' ? `（试用期至 ${r.sub.trialEndsAt}，转正扣费）` : '';
        return `${tag}${r.sub.name} ${core.fmtMoney(r.sub.amount, sym)} · ${r.nextChargeDate}（${r.daysUntil === 0 ? '今天' : `${r.daysUntil} 天后`}）${trial}`;
      });
      return ok([`未来 ${days} 天将扣 ${inWindow.length} 笔，合计约 ${core.fmtMoney(sum, sym)}：`, ...lines].join('\n'));
    },
  },
  {
    name: 'changqi_summary',
    description: '常契·订阅透视：月均/年化总额、本月将扣笔数与金额、渠道分布、分类分布、最大三笔、试用期占用。适合"我订阅一年花多少""钱都花在哪类订阅上"。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const settings = await loadSettings();
      const today = core.todayStr();
      const subs = await loadSubs();
      if (!subs.length) return ok('台账为空——对话里说"帮我把 xx 记入订阅"即可入册。');
      const ov = core.computeOverview(subs, settings, today, today.slice(0, 7));
      const sym = settings.currencySymbol;
      const lines = [
        `订阅透视（进行中 ${ov.activeCount} 笔${ov.trialCount ? `，其中试用 ${ov.trialCount} 笔` : ''}${ov.cancelledCount ? `；已取消 ${ov.cancelledCount} 笔留档` : ''}）：`,
        `月均支出 ${core.fmtMoney(ov.monthlyTotal, sym)} · 年化 ${core.fmtMoney(ov.yearlyTotal, sym)}`,
        `本月将扣 ${ov.monthCharge.count} 笔 ${core.fmtMoney(ov.monthCharge.sum, sym)}`,
      ];
      if (ov.todayCharge.count) lines.push(`⚠ 今天将扣 ${ov.todayCharge.count} 笔 ${core.fmtMoney(ov.todayCharge.sum, sym)}`);
      if (ov.byChannel.length) {
        lines.push('按渠道（月均）：');
        for (const c of ov.byChannel) lines.push(`  ${c.label} ${core.fmtMoney(c.monthlySum, sym)} ×${c.count}`);
      }
      if (ov.byCategory.length) {
        lines.push('按分类（月均）：');
        for (const c of ov.byCategory) lines.push(`  ${c.category} ${core.fmtMoney(c.monthlySum, sym)} ×${c.count}`);
      }
      if (ov.top.length) lines.push(`最大三笔：${ov.top.map((t) => `${t.name} ${core.fmtMoney(t.monthlyEquiv, sym)}/月`).join('、')}`);
      if (ov.trialExpiring.length) {
        lines.push(`⚠ ${ov.trialExpiring.length} 笔试用临近转正：${ov.trialExpiring.map((t) => `${t.name}（${t.trialEndsAt}）`).join('、')}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'changqi_cancel_guide',
    description: '常契·查询某渠道关闭自动续费的路径（不改数据）。渠道：alipay 支付宝 / wechat 微信 / apple Apple / card 银行卡 / other 其他。',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', enum: core.CHANNELS, description: '扣费渠道' } },
      required: ['channel'],
    },
    async call(args) {
      const ch = core.CHANNELS.includes(args.channel) ? args.channel : 'other';
      return ok(`${core.CHANNEL_LABELS[ch]}：${core.cancelGuide(ch)}`);
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
