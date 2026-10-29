#!/usr/bin/env node
'use strict';
/**
 * shouzha MCP Server —— 续费管家（订阅与续费管家）的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的登记/查询/对账/透视意图翻译为 cap.kv 的 shouzha.* 读写；
 * 全部计算逻辑走 shared/core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无外网请求——纯本地订阅账。
 *
 * 工具一览：
 *   sub_add      登记订阅（金额/周期/下次扣费日/自动续费/试用）
 *   sub_list     检索订阅（关键字/分类/状态），带月均/年化
 *   sub_due      三榜：逾期待对账 / 即将扣费 / 试用转正（回答「最近要扣哪些钱」）
 *   sub_renew    对账：确认续费(记实付)/跳过/暂停/恢复/取消
 *   sub_update   修改字段（改价/改周期/改扣费日/备注…）
 *   sub_stats    成本透视：月均年化/分类/年化排行/12月现金流/已省/涨价
 *   sub_history  单订阅价格史与事件流水
 *   sub_delete   彻底删除（confirm=true 二次确认）
 *
 * 连接方式与 pocket-ledger / lingxi 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/core.js');

const SERVER_NAME = 'shouzha';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 pocket-ledger / lingxi）─────────────────────────
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
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay);
          else reject(new Error(`IPC ${command} 失败: ${e.message}`));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`IPC ${command} 超时`)); });
        req.write(data);
        req.end();
      }).catch(reject);
    };
    attempt(0);
  });
}

// ── cap.kv 访问 ────────────────────────────────────────────────────────────
async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv get 失败');
  return (res.result && res.result.value) ?? null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
}
async function kvDel(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv delete 失败');
}
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  return (res.result && res.result.keys) || [];
}

async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

async function loadSubs() {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.subPrefix));
  const arrs = await Promise.all(keys.map((k) => kvGet(k).catch(() => null)));
  const subs = [];
  for (const v of arrs) {
    if (v && typeof v === 'object' && typeof v.id === 'string') subs.push(v);
  }
  return subs;
}

function parseId(raw) {
  const id = String(raw || '').trim();
  return /^s[a-z0-9]{6,20}$/.test(id) ? id : null; // makeId 形如 s<base36><rand>
}

function findSub(subs, idOrName) {
  const q = String(idOrName || '').trim();
  if (!q) return null;
  const byId = subs.find((s) => s.id === q);
  if (byId) return byId;
  const exact = subs.filter((s) => s.name === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return { __ambiguous: exact };
  const fuzzy = subs.filter((s) => (s.name + (s.vendor || '')).toLowerCase().includes(q.toLowerCase()));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) return { __ambiguous: fuzzy };
  return null;
}

function subLine(s, symbol) {
  const m = core.monthlyCost(s);
  const state = core.renewState(s, core.todayStr());
  const stateMark = { overdue: '🔴逾期待对账', dueSoon: '🟠即将扣费', trialUrgent: '🧪试用将转正', trial: '试用中', ok: '' }[state] || '';
  return `${s.name}（${s.vendor || '未知服务商'}）· ${core.fmtMoney(s.amount, symbol)}/${core.cycleLabel(s)} · 月均 ${core.fmtMoney(m, symbol)} · 下次扣费 ${s.nextRenewalDate} · ${s.autoRenew ? '自动续费' : '手动续费'}${core.STATUS_LABELS[s.status] !== '生效中' ? ` · ${core.STATUS_LABELS[s.status]}` : ''}${stateMark ? ` · ${stateMark}` : ''} · id=${s.id}`;
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const tools = [
  {
    name: 'sub_add',
    description: '续费管家·登记订阅。用户说「我订了 xx 月费/年费 xx 元」「开了 xx 会员」时调用。amount 为每周期金额；cycle 周期；nextRenewalDate 缺省=今天推进一周期；status=trial 时必须给 trialEndsAt。返回登记结果与当前订阅成本概况。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '订阅名称（≤40 字，如「腾讯视频」）' },
        vendor: { type: 'string', description: '服务商（≤24 字，如「腾讯」）' },
        plan: { type: 'string', description: '套餐名（如「超级会员」「连续包年」）' },
        amount: { type: 'number', description: '每周期金额（正数）' },
        cycle: { type: 'string', enum: ['month', 'year', 'quarter', 'week', 'custom'], description: '扣费周期' },
        customDays: { type: 'number', description: 'cycle=custom 时的周期天数（1..3650）' },
        nextRenewalDate: { type: 'string', description: '下次扣费日 YYYY-MM-DD；缺省=开通今天推进一周期' },
        autoRenew: { type: 'boolean', description: '是否自动续费，缺省 true' },
        status: { type: 'string', enum: ['active', 'trial'], description: '缺省 active；试用中传 trial（必须给 trialEndsAt）' },
        trialEndsAt: { type: 'string', description: '试用到期日 YYYY-MM-DD（status=trial 必填）' },
        category: { type: 'string', description: '分类，建议从：视频娱乐/音乐/云盘存储/软件工具/生活服务/新闻资讯/游戏/通信/金融会员/其他 中选' },
        paymentMethod: { type: 'string', description: '支付方式（支付宝/微信/Apple/银行卡…）' },
        manageUrl: { type: 'string', description: '管理/取消入口链接（http/https）' },
        note: { type: 'string', description: '备注（勿存密码等敏感信息）' },
        remindDaysBefore: { type: 'number', description: '提前提醒天数（0..30），缺省用设置默认 3' },
      },
      required: ['name', 'amount', 'cycle'],
    },
    async call(args) {
      const settings = await loadSettings();
      const raw = { ...args, remindDaysBefore: args.remindDaysBefore ?? settings.defaultRemindDays, source: 'ai' };
      const norm = core.normalizeSub(raw);
      if (norm.error) return err(norm.error);
      const sub = norm.sub;
      if (await kvGet(core.K.sub(sub.id)) !== null) return err('id 撞键（极小概率），请重试');
      await kvSet(core.K.sub(sub.id), sub);
      const subs = await loadSubs();
      const st = core.stats(subs, core.todayStr());
      return ok([
        `已登记：${sub.name}${sub.plan ? `（${sub.plan}）` : ''} · ${core.fmtMoney(sub.amount, settings.currencySymbol)}/${core.cycleLabel(sub)} · 下次扣费 ${sub.nextRenewalDate} · ${sub.autoRenew ? '自动续费' : '手动续费'}${sub.status === 'trial' ? ` · 试用至 ${sub.trialEndsAt}` : ''} · id=${sub.id}`,
        `记账口径：月均 ${core.fmtMoney(st.monthlyAll, settings.currencySymbol)}，年化 ${core.fmtMoney(st.annualAll, settings.currencySymbol)}（含试用转正预估）`,
        sub.status === 'trial' ? `🧪 试用订阅：转正前 ${sub.remindDaysBefore ?? settings.defaultRemindDays} 天会红榜提醒，别忘试完就决定去留` : '到期前会进「即将扣费」榜；扣费日过境后需对账（sub_renew）',
      ].join('\n'));
    },
  },
  {
    name: 'sub_list',
    description: '续费管家·检索订阅列表。可按关键字/分类/状态过滤，返回每条的金额、周期、月均、年化、下次扣费日与对账状态。用户问「我有哪些订阅」「视频会员有哪些」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '关键字（匹配名称/服务商/套餐/备注/支付方式）' },
        category: { type: 'string', description: '按分类过滤' },
        status: { type: 'string', enum: ['active', 'trial', 'paused', 'cancelled'], description: '按状态过滤；缺省返回全部（含已取消）' },
      },
    },
    async call(args) {
      const settings = await loadSettings();
      let subs = await loadSubs();
      const total = subs.length;
      subs = core.filterSubs(subs, args);
      if (!subs.length) return ok(total ? '没有匹配的订阅（可放宽过滤条件）' : '订阅库还是空的，可以让用户说「我订了 xx 月费 xx」来登记第一笔');
      subs.sort((a, b) => (core.annualCost(b) || 0) - (core.annualCost(a) || 0));
      const head = `共 ${subs.length} 笔订阅${total !== subs.length ? `（库内总 ${total} 笔）` : ''}，按年化降序：`;
      return ok([head, ...subs.map((s) => `- ${subLine(s, settings.currencySymbol)}`)].join('\n'));
    },
  },
  {
    name: 'sub_due',
    description: '续费管家·到期三榜：逾期待对账（扣费日已过未确认，沉默扣款高危）/ 即将扣费 / 试用转正红榜。用户问「最近要扣哪些钱」「有没有快到期的」「有没有忘关的试用」时调用；也建议在其他订阅话题收尾时顺带检查。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const settings = await loadSettings();
      const subs = await loadSubs();
      const board = core.dueBoard(subs, core.todayStr());
      const sym = settings.currencySymbol;
      if (!board.overdue.length && !board.upcoming.length && !board.trials.length) {
        return ok('当前干净：没有逾期未对账、近期扣费或试用转正的订阅。');
      }
      const parts = [];
      if (board.overdue.length) {
        parts.push(`🔴 逾期待对账 ${board.overdue.length} 笔（扣费日已过，未确认是否真被扣费——这是沉默扣款的高危区）：`);
        for (const s of board.overdue) {
          const late = core.daysBetween(s.nextRenewalDate, core.todayStr());
          parts.push(`- ${s.name} ${core.fmtMoney(s.amount, sym)}/${core.cycleLabel(s)} · 原定 ${s.nextRenewalDate}（已过 ${late} 天）· id=${s.id}`);
        }
        parts.push('  处理：确认被扣了→sub_renew op=renew；已取消没扣→sub_renew op=skip');
      }
      if (board.upcoming.length) {
        parts.push(`📅 即将扣费 ${board.upcoming.length} 笔：`);
        for (const s of board.upcoming) {
          const inDays = core.daysBetween(core.todayStr(), s.nextRenewalDate);
          parts.push(`- ${s.name} ${core.fmtMoney(s.amount, sym)}/${core.cycleLabel(s)} · ${s.nextRenewalDate}（${inDays === 0 ? '今天' : `${inDays} 天后`}）${s.autoRenew ? ' · 自动续费' : ' · 需手动续'} · id=${s.id}`);
        }
        parts.push('  不想续的话现在就是取消窗口：sub_renew op=cancel');
      }
      if (board.trials.length) {
        parts.push(`🧪 试用转正 ${board.trials.length} 笔（到期不处理通常自动转正扣费）：`);
        for (const s of board.trials) {
          const inDays = core.daysBetween(core.todayStr(), s.trialEndsAt || s.nextRenewalDate);
          parts.push(`- ${s.name} ${core.fmtMoney(s.amount, sym)}/${core.cycleLabel(s)} · 试用至 ${s.trialEndsAt}（${inDays <= 0 ? '今天到期' : `${inDays} 天后`}）· id=${s.id}`);
        }
      }
      return ok(parts.join('\n'));
    },
  },
  {
    name: 'sub_renew',
    description: '续费管家·对账与状态操作。op=renew 确认续费（推进下一周期，可记实付金额，价格变化会记入价格史）；op=skip 逾期对账时「这次没续」（转取消）；op=cancel 主动取消（记原因）；op=pause 暂停；op=resume 恢复（必须给 nextRenewalDate）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅 id（sub_due/sub_list 返回）；也可用唯一名称' },
        op: { type: 'string', enum: ['renew', 'skip', 'cancel', 'pause', 'resume'], description: '操作类型，缺省 renew' },
        amount: { type: 'number', description: 'op=renew 时可给实付金额（≠现价则记价格史，涨价/降价会被检出）' },
        nextRenewalDate: { type: 'string', description: 'op=renew 可覆盖本次基准扣费日；op=resume 必填（恢复后的首次扣费日）' },
        reason: { type: 'string', description: 'op=skip/cancel 的原因（如「太贵」「不再用」）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['id'],
    },
    async call(args) {
      const settings = await loadSettings();
      const subs = await loadSubs();
      const found = findSub(subs, args.id);
      if (!found) return err(`找不到订阅「${args.id}」，可先 sub_list 检索`);
      if (found.__ambiguous) {
        return err(`名称「${args.id}」匹配到多笔，请用 id 指定：${found.__ambiguous.map((s) => `${s.name}(${s.id})`).join('、')}`);
      }
      const sub = found;
      const key = core.K.sub(sub.id);
      const op = args.op || 'renew';
      const wasTrial = sub.status === 'trial';
      let r;
      if (op === 'renew') r = core.renewSub(sub, { amount: args.amount, date: args.nextRenewalDate, note: args.note });
      else if (op === 'skip') r = core.skipSub(sub, { reason: args.reason, note: args.note });
      else if (op === 'cancel') r = core.cancelSub(sub, { reason: args.reason, note: args.note });
      else if (op === 'pause') r = core.pauseSub(sub, { note: args.note });
      else if (op === 'resume') r = core.resumeSub(sub, args.nextRenewalDate);
      else return err(`未知操作：${op}`);
      if (r.error) return err(r.error);
      await kvSet(key, r.sub);
      const sym = settings.currencySymbol;
      const s = r.sub;
      if (op === 'renew') {
        const priceNote = args.amount !== undefined && Number(args.amount) !== sub.amount
          ? `实付 ${core.fmtMoney(s.amount, sym)}（原 ${core.fmtMoney(sub.amount, sym)}，价格变化已记入价格史）`
          : `金额 ${core.fmtMoney(s.amount, sym)}`;
        return ok(`已对账续费：${s.name} · ${priceNote} · 下一期扣费 ${s.nextRenewalDate}${wasTrial ? '（试用已转正）' : ''}`);
      }
      if (op === 'skip' || op === 'cancel') {
        const saved = core.annualCost(sub);
        return ok(`「${s.name}」已标记取消（${op === 'skip' ? '本次未续' : '主动取消'}${s.cancelReason ? `，原因：${s.cancelReason}` : ''}）。按原价折算，年化省下 ${core.fmtMoney(saved, sym)}。反悔可用 sub_renew op=resume 恢复（需给下次扣费日）。`);
      }
      if (op === 'pause') return ok(`「${s.name}」已暂停（不计入成本与榜单）。恢复用 sub_renew op=resume + nextRenewalDate。`);
      return ok(`「${s.name}」已恢复生效，下次扣费 ${s.nextRenewalDate}。`);
    },
  },
  {
    name: 'sub_update',
    description: '续费管家·修改订阅字段。改价（会记价格史）、改周期、改下次扣费日、改分类/支付方式/备注等。金额变化自动记价格史与 price 事件。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅 id 或唯一名称' },
        name: { type: 'string', description: '名称' },
        vendor: { type: 'string', description: '服务商' },
        plan: { type: 'string', description: '套餐名' },
        amount: { type: 'number', description: '每周期金额（变化会记价格史）' },
        cycle: { type: 'string', enum: ['month', 'year', 'quarter', 'week', 'custom'], description: '周期' },
        customDays: { type: 'number', description: 'cycle=custom 时的天数' },
        nextRenewalDate: { type: 'string', description: '下次扣费日 YYYY-MM-DD' },
        autoRenew: { type: 'boolean', description: '自动续费开关' },
        category: { type: 'string', description: '分类' },
        trialEndsAt: { type: 'string', description: '试用到期日（空串清除）' },
        paymentMethod: { type: 'string', description: '支付方式' },
        manageUrl: { type: 'string', description: '管理入口链接' },
        note: { type: 'string', description: '备注' },
        remindDaysBefore: { type: 'number', description: '提前提醒天数 0..30' },
      },
      required: ['id'],
    },
    async call(args) {
      const subs = await loadSubs();
      const found = findSub(subs, args.id);
      if (!found) return err(`找不到订阅「${args.id}」，可先 sub_list 检索`);
      if (found.__ambiguous) return err(`名称「${args.id}」匹配到多笔，请用 id 指定：${found.__ambiguous.map((s) => `${s.name}(${s.id})`).join('、')}`);
      const patch = { ...args };
      delete patch.id;
      const r = core.applyUpdate(found, patch);
      if (r.error) return err(r.error);
      await kvSet(core.K.sub(r.sub.id), r.sub);
      return ok(`已更新「${r.sub.name}」：${Object.keys(patch).filter((k) => k !== 'id').join('、') || '（无字段变化）'}。当前 ${core.fmtMoney(r.sub.amount)}/${core.cycleLabel(r.sub)}，下次扣费 ${r.sub.nextRenewalDate}`);
    },
  },
  {
    name: 'sub_stats',
    description: '续费管家·成本透视。回答「我订阅一年花多少」「哪个订阅最贵」「下个月要扣多少」「取消后省了多少」这类问题。返回月均/年化、分类占比、年化排行、未来逐月现金流、已取消节省、价格变动。',
    inputSchema: {
      type: 'object',
      properties: {
        focus: { type: 'string', enum: ['overview', 'cashflow', 'top'], description: '缺省 overview 全量；cashflow 只看现金流；top 只看排行' },
      },
    },
    async call(args) {
      const settings = await loadSettings();
      const subs = await loadSubs();
      const st = core.stats(subs, core.todayStr());
      const sym = settings.currencySymbol;
      const focus = (args && args.focus) || 'overview';
      const lines = [];
      if (focus === 'overview' || focus === 'top') {
        lines.push(`订阅 ${st.counts.active} 笔生效中（试用 ${st.counts.trial}，暂停 ${st.counts.paused}，已取消 ${st.counts.cancelled}）`);
        lines.push(`生效中月均 ${core.fmtMoney(st.monthlyActive, sym)}，年化 ${core.fmtMoney(st.annualActive, sym)}；含试用转正预估月均 ${core.fmtMoney(st.monthlyAll, sym)}`);
        if (st.savedAnnual > 0) lines.push(`已取消订阅年化止损 ${core.fmtMoney(st.savedAnnual, sym)}`);
        lines.push('年化排行（前 8）：');
        for (const t of st.topAnnual.slice(0, 8)) {
          lines.push(`- ${t.name}${t.vendor ? `（${t.vendor}）` : ''} · ${core.fmtMoney(t.amount, sym)}/${t.cycleLabel} → 年化 ${core.fmtMoney(t.annual, sym)} · 下次 ${t.nextRenewalDate}${t.status === 'trial' ? '（试用）' : ''}`);
        }
        if (st.priceChanges.length) {
          lines.push('价格变动：');
          for (const p of st.priceChanges.slice(0, 5)) lines.push(`- ${p.name} ${core.fmtMoney(p.from, sym)} → ${core.fmtMoney(p.to, sym)}（${p.date}）`);
        }
      }
      if (focus === 'overview' || focus === 'cashflow') {
        lines.push('未来 12 个月现金流（逐月将扣）：');
        for (const c of st.cashflow) {
          const names = c.items.map((i) => `${i.name} ${core.fmtMoney(i.amount, sym)}`).slice(0, 6);
          lines.push(`- ${c.month}：${core.fmtMoney(c.amount, sym)}${names.length ? `（${names.join('、')}${c.items.length > 6 ? ' 等' : ''}）` : ''}`);
        }
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'sub_history',
    description: '续费管家·单订阅档案：价格史（开通价→现价）与事件流水（续费/取消/暂停/调价…）。用户问「xx 涨价了吗」「xx 我什么时候订的」时调用。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '订阅 id 或唯一名称' } },
      required: ['id'],
    },
    async call(args) {
      const settings = await loadSettings();
      const subs = await loadSubs();
      const found = findSub(subs, args.id);
      if (!found) return err(`找不到订阅「${args.id}」`);
      if (found.__ambiguous) return err(`名称「${args.id}」匹配到多笔，请用 id 指定：${found.__ambiguous.map((s) => `${s.name}(${s.id})`).join('、')}`);
      const s = found;
      const sym = settings.currencySymbol;
      const lines = [subLine(s, sym)];
      if (s.manageUrl) lines.push(`管理入口：${s.manageUrl}`);
      if (s.note) lines.push(`备注：${s.note}`);
      lines.push(`价格史：${(s.priceHistory || []).map((p) => `${p.date} ${core.fmtMoney(p.amount, sym)}`).join(' → ') || '无'}`);
      lines.push('事件流水：');
      for (const e of (s.events || []).slice(-15).reverse()) {
        lines.push(`- ${core.dayKeyOf(e.ts)} ${core.STATUS_LABELS[e.kind] || e.kind}${e.note ? `（${e.note}）` : ''}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'sub_delete',
    description: '续费管家·彻底删除订阅档案（不可恢复）。与取消不同：删除会连价格史一起清掉。需要 confirm=true 才执行；一般建议用 sub_renew op=cancel（可逆、可统计止损）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '订阅 id 或唯一名称' },
        confirm: { type: 'boolean', description: '必须为 true 才执行删除' },
      },
      required: ['id'],
    },
    async call(args) {
      if (args.confirm !== true) return err('删除是不可逆操作：请向用户确认后，带 confirm=true 重新调用。若只是不想续费，建议用 sub_renew op=cancel（可逆且计入止损统计）。');
      const subs = await loadSubs();
      const found = findSub(subs, args.id);
      if (!found) return err(`找不到订阅「${args.id}」`);
      if (found.__ambiguous) return err(`名称「${args.id}」匹配到多笔，请用 id 指定：${found.__ambiguous.map((s) => `${s.name}(${s.id})`).join('、')}`);
      await kvDel(core.K.sub(found.id));
      return ok(`已彻底删除「${found.name}」（含价格史与事件流水）。`);
    },
  },
];

// ── JSON-RPC stdio 骨架（与 pocket-ledger/lingxi 相同）─────────────────────
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    void handle(msg);
  }
});

async function handle(msg) {
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
  if (msg.method === 'notifications/initialized' || String(msg.method || '').startsWith('notifications/')) {
    return; // 通知无需应答
  }
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
