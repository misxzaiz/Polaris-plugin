#!/usr/bin/env node
'use strict';
/**
 * sundial MCP Server —— 日程提醒的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 sundial.* 键空间的读写。本进程**不直接抓外网**——ICS 订阅的抓取同步
 * 全部通过命令信箱（sundial.cmd.ics.*）委托给后台服务执行（服务进程原生
 * fetch 无同源策略；同时保证「单一抓取路径」不出现第二条写法）。
 *
 * 工具一览：
 *   sundial_add     添加日程/习惯打卡/倒数日（AI 负责把「周五下午3点」解析成结构化时间）
 *   sundial_query   查日程（今天/明天/本周/即将到来/全部 + 关键词）
 *   sundial_update  修改日程（改时间/重复规则/提醒等）
 *   sundial_delete  删除日程（confirm 门）
 *   sundial_done    打卡/完成/跳过某次发生（习惯连击的记账动作）
 *   sundial_ics     外部日历（ICS/Webcal）订阅管理：add/list/remove/refresh
 *   sundial_today   今日摘要：今天+明天安排、习惯打卡状态、当前到期提醒
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'sundial';
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
  ev: (id) => `sundial.ev.${id}`,
  evPrefix: 'sundial.ev.',
  ics: (id) => `sundial.ics.${id}`,
  icsPrefix: 'sundial.ics.',
  reminders: 'sundial.reminders',
  cmdIcsAdd: (n) => `sundial.cmd.ics.add.${n}`,
  cmdIcsRefresh: (cid) => `sundial.cmd.ics.refresh.${cid}`,
  cmdIcsRemove: (cid) => `sundial.cmd.ics.remove.${cid}`,
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

function nonce() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// ── 数据访问 ────────────────────────────────────────────────────────────────
async function listEvents() {
  const keys = await kv.kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(K.evPrefix));
  const out = await Promise.all(evKeys.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}

async function getEvent(id) {
  if (!id) return null;
  return await kv.kvGet(K.ev(String(id))).catch(() => null);
}

async function listIcs() {
  const keys = await kv.kvKeys();
  const defKeys = keys.filter((k) => k.startsWith(K.icsPrefix));
  const out = await Promise.all(defKeys.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}

async function readReminders() {
  const r = await kv.kvGet(K.reminders).catch(() => null);
  return r && Array.isArray(r.items) ? r.items : [];
}

// ── 格式化 ──────────────────────────────────────────────────────────────────
function wdName(ts) {
  return '周' + core.WD_CN[new Date(ts).getDay()];
}
function fmtOcc(e, occ, opts) {
  const o = opts || {};
  const parts = [];
  if (e.allDay) {
    parts.push(core.fmtOccWhen(occ.start, true, e.durationMin));
  } else {
    parts.push(`${core.fmtDay(occ.start)}（${wdName(occ.start)}）${core.fmtClock(occ.start)}`);
    const dur = Number(e.durationMin) || 0;
    if (dur > 0) parts.push(`时长 ${dur % 60 === 0 ? `${dur / 60} 小时` : `${dur} 分钟`}`);
  }
  if (e.rrule) parts.push(core.describeRrule(e.rrule));
  const marks = [];
  const v = e.done ? e.done[occ.key] : undefined;
  if (v === 'done') marks.push('✅已完成');
  if (v === 'skip') marks.push('⏭已跳过');
  const streak = e.kind === 'habit' ? core.computeStreak(e, Date.now()) : 0;
  return `[${e.id}] occ=${occ.key}${marks.length ? ' ' + marks.join(' ') : ''}${streak ? ` 🔥连击${streak}` : ''} ${e.title}${e.tags.length ? `（${e.tags.join('/')}）` : ''}\n   ${parts.join(' · ')}`;
}

function rangeToWindow(range, now) {
  const p = core.localParts(now);
  const todayStart = new Date(p.y, p.m - 1, p.d).getTime();
  const dayEnd = (ts) => ts + 86400000 - 1;
  switch (String(range || 'today')) {
    case 'today': return { t0: todayStart, t1: dayEnd(todayStart) };
    case 'tomorrow': return { t0: todayStart + 86400000, t1: dayEnd(todayStart + 86400000) };
    case 'week': return { t0: todayStart, t1: dayEnd(todayStart + 6 * 86400000) };
    case 'upcoming': return { t0: now, t1: now + 60 * 86400000 };
    case 'past': return { t0: now - 60 * 86400000, t1: now };
    case 'all': return { t0: now - 365 * 86400000, t1: now + 365 * 86400000 };
    default: return { t0: todayStart, t1: dayEnd(todayStart) };
  }
}

// ── 工具定义 ───────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'sundial_add',
    description: '给日程提醒（sundial）添加一条日程、习惯打卡或倒数日。适用：「周五下午3点提醒我取快递」「从明天起每天晚上10点提醒背单词（习惯打卡）」「帮我记着距离高考还有多少天」。时间参数由你解析成结构化格式：全天用 2026-11-05，时刻用 2026-10-30 15:00（24 小时制）。重复规则写友好格式：daily/每天、weekdays/工作日、weekly:MO,WE/每周一三、monthly:15/每月15号、yearly/每年，可接 ;COUNT=10 或 ;UNTIL=20271231。同一标题+时间重复添加会生成不同事件（不幂等），先 sundial_query 查重。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '日程标题（简短，如「取快递」「周会」）' },
        start: { type: 'string', description: '开始时间：全天 2026-11-05；时刻 2026-10-30 15:00（用户说「下午3点」→ 15:00；「明天」等相对日期按今天推算）' },
        durationMin: { type: 'integer', description: '持续分钟数（可选，默认 0=时刻点；全天默认 1 天）' },
        allDay: { type: 'boolean', description: '是否全天（纯日期输入自动为全天）' },
        rrule: { type: 'string', description: '重复规则（可选）：daily/每天、weekdays/工作日、weekly:MO,WE/每周一三、monthly:15/每月15号、yearly/每年；不传=不重复' },
        remind: { type: 'array', items: { type: 'integer' }, description: '提前提醒分钟数组（可选，如 [30] 或 [1440,30]；默认 [30]；0=准时提醒）' },
        kind: { type: 'string', enum: ['event', 'habit', 'countdown'], description: '类型：event=日程（默认）、habit=习惯打卡、countdown=倒数日/纪念日' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签（可选，最多 5 个）' },
        notes: { type: 'string', description: '备注（可选）' },
      },
      required: ['title', 'start'],
    },
    async call(args) {
      const remind = args.remind !== undefined ? args.remind : [30];
      const r = core.normalizeEvent({ ...args, remind });
      if (r.error) return err(r.error);
      await kv.kvSet(K.ev(r.event.id), r.event);
      const e = r.event;
      const when = e.allDay ? core.fmtOccWhen(e.start, true, e.durationMin) : `${core.fmtDay(e.start)}（${wdName(e.start)}）${core.fmtClock(e.start)}`;
      const rr = e.rrule ? ` · ${core.describeRrule(e.rrule)}` : '';
      const rd = e.remind.length ? ` · 提前 ${e.remind.map((n) => (n >= 1440 ? `${Math.round(n / 1440)} 天` : n >= 60 ? `${n / 60} 小时` : `${n} 分钟`)).join('、')}` : '';
      const svcHint = e.remind.length ? '后台服务会把到期提醒投到面板（「今日」页横幅），sundial_today 也能看到。' : '';
      return ok(`已添加${e.kind === 'habit' ? '习惯打卡' : e.kind === 'countdown' ? '倒数日' : '日程'}：\n[${e.id}] ${e.title}\n   ${when}${rr}${rd}${e.tags.length ? ` · 标签：${e.tags.join('/')}` : ''}\n${svcHint}`);
    },
  },
  {
    name: 'sundial_query',
    description: '查询日程提醒日程。适用：「这周有什么安排」「周五要干嘛」「我有哪些习惯在打卡」「下次牙医复诊是什么时候」。返回带事件 id 与 occ=发生键，供 sundial_update / sundial_done / sundial_delete 按键操作。',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', enum: ['today', 'tomorrow', 'week', 'upcoming', 'past', 'all'], description: '查询范围（默认 today）：today=今天、tomorrow=明天、week=未来 7 天、upcoming=未来 60 天、past=过去 60 天、all=前后一年' },
        query: { type: 'string', description: '标题/备注/标签子串过滤（大小写不敏感）' },
        kind: { type: 'string', enum: ['event', 'habit', 'countdown'], description: '只看某类型（可选）' },
        limit: { type: 'integer', description: '最多返回几条（默认 20，上限 50）' },
      },
    },
    async call(args) {
      const events = await listEvents();
      const { t0, t1 } = rangeToWindow(args.range, Date.now());
      const q = String(args.query || '').trim().toLowerCase();
      const now = Date.now();
      const rows = [];
      for (const e of events) {
        if (e.enabled === false) continue;
        if (args.kind && e.kind !== args.kind) continue;
        if (q && !`${e.title}|${e.notes}|${e.tags.join('/')}`.toLowerCase().includes(q)) continue;
        const occs = core.expandOccurrences(e, t0, t1);
        for (const occ of occs.slice(0, 8)) {
          rows.push({ e, occ });
        }
      }
      rows.sort((a, b) => a.occ.start - b.occ.start);
      if (!rows.length) return ok(`${args.range || 'today'} 没有日程${q ? `（过滤：${args.query}）` : ''}。空列表时可引导用户 sundial_add。`);
      const limit = Math.min(50, Math.max(1, Math.floor(Number(args.limit) || 20)));
      const shown = rows.slice(0, limit);
      const head = args.range === 'upcoming' ? '即将到来' : args.range === 'week' ? '未来 7 天' : args.range === 'all' ? '全部（±1 年）' : args.range === 'past' ? '过去 60 天' : args.range === 'tomorrow' ? '明天' : '今天';
      return ok(`${head}共 ${rows.length} 条（显示 ${shown.length}）：\n${shown.map(({ e, occ }) => fmtOcc(e, occ)).join('\n')}`);
    },
  },
  {
    name: 'sundial_update',
    description: '修改日程提醒的一条日程（sundial_query 可查 id）。适用：「把周会改到下午4点」「这个提醒改成提前一天」「取消重复，改成一次性」。只传想改的字段，其余保持不变。ICS 订阅同步来的事件（source=ics）改定义字段会被下次同步覆盖，只建议改提醒（remind）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '事件 id（sundial_query 可查）' },
        title: { type: 'string', description: '新标题' },
        start: { type: 'string', description: '新开始时间（格式同 sundial_add）' },
        durationMin: { type: 'integer', description: '新时长（分钟）' },
        allDay: { type: 'boolean', description: '是否全天' },
        rrule: { type: 'string', description: '新重复规则（空串 = 取消重复）' },
        remind: { type: 'array', items: { type: 'integer' }, description: '新提醒提前分钟数组（[] = 关闭提醒）' },
        tags: { type: 'array', items: { type: 'string' }, description: '新标签' },
        notes: { type: 'string', description: '新备注' },
        enabled: { type: 'boolean', description: '启用/停用' },
      },
      required: ['id'],
    },
    async call(args) {
      const prev = await getEvent(args.id);
      if (!prev || typeof prev !== 'object') return err(`未找到日程 ${args.id}（sundial_query 可查 id）`);
      const r = core.normalizeEvent(args, prev);
      if (r.error) return err(r.error);
      await kv.kvSet(K.ev(r.event.id), r.event);
      return ok(`已更新 [${r.event.id}] ${r.event.title}\n   ${core.fmtOccWhen(r.event.start, r.event.allDay, r.event.durationMin)}${r.event.rrule ? ` · ${core.describeRrule(r.event.rrule)}` : ''} · 提醒 ${r.event.remind.length ? r.event.remind.join('/') + ' 分钟前' : '关'}`);
    },
  },
  {
    name: 'sundial_delete',
    description: '删除日程提醒的一条日程（联动清掉其提醒与打卡记录）。危险操作需 confirm。适用：「把取快递那条删了」。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '事件 id（sundial_query 可查）' },
        confirm: { type: 'boolean', description: '危险操作确认，必须为 true' },
      },
      required: ['id', 'confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('删除是危险操作，请先与用户确认后带 confirm: true 重试。');
      const prev = await getEvent(args.id);
      if (!prev || typeof prev !== 'object') return err(`未找到日程 ${args.id}（sundial_query 可查 id）`);
      await kv.kvDel(K.ev(String(args.id)));
      return ok(`已删除 [${prev.id}] ${prev.title}。`);
    },
  },
  {
    name: 'sundial_done',
    description: '给日程提醒的一次发生打卡：标记完成 / 跳过 / 撤销。适用：「今天单词打过了」「今天的跑步算跳过」「昨天那个打卡记错了，撤掉」。习惯（habit）打卡会累积连击（面板显示 🔥N）。id 与 occ 都来自 sundial_query 输出。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '事件 id' },
        occ: { type: 'string', description: '发生键 occ（sundial_query 可查；不传=最近一次已排期发生）' },
        state: { type: 'string', enum: ['done', 'skip', 'none'], description: 'done=完成、skip=跳过、none=撤销标记（默认 done）' },
      },
      required: ['id'],
    },
    async call(args) {
      const prev = await getEvent(args.id);
      if (!prev || typeof prev !== 'object') return err(`未找到日程 ${args.id}（sundial_query 可查 id）`);
      let occKey = String(args.occ || '');
      if (!occKey) {
        // 默认取最近一次已排期发生（今天及以前）
        const now = Date.now();
        const occs = core.expandOccurrences(prev, now - 31 * 86400000, now + 86400000, { max: 400 });
        const past = occs.filter((o) => o.start <= now + 86400000 - 1);
        if (!past.length) return err('该日程最近没有可打卡的发生（可先 sundial_query 看 occ）。');
        occKey = past[past.length - 1].key;
      }
      const st = ['done', 'skip', 'none'].includes(args.state) ? args.state : 'done';
      const done = { ...(prev.done || {}) };
      if (st === 'none') delete done[occKey];
      else done[occKey] = st;
      const r = core.normalizeEvent({ done }, prev);
      if (r.error) return err(r.error);
      await kv.kvSet(K.ev(r.event.id), r.event);
      const streak = r.event.kind === 'habit' ? core.computeStreak(r.event, Date.now()) : 0;
      return ok(`[${r.event.id}] ${r.event.title} 的发生 ${occKey} → ${st === 'none' ? '已撤销' : st === 'done' ? '✅完成' : '⏭跳过'}${streak ? `（🔥连击 ${streak}）` : ''}`);
    },
  },
  {
    name: 'sundial_ics',
    description: '日程提醒的外部日历（ICS/Webcal）订阅管理。适用：「订阅我的 Google 日历公开链接」「看看订阅了哪些日历」「刷新一下课表日历」「退订这个日历」。添加后由后台服务按间隔（默认 6 小时）原生抓取同步——跨域由服务进程根治，面板与手机端都能看到同一份日历。remove 是危险操作需 confirm。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'remove', 'refresh'], description: 'add=添加订阅、list=列出、remove=退订、refresh=立刷（可带 id 只刷一个）' },
        url: { type: 'string', description: 'ICS/Webcal 订阅地址（action=add 必填；webcal:// 自动转 https）' },
        name: { type: 'string', description: '订阅显示名（可选）' },
        id: { type: 'string', description: '订阅 id（remove/refresh 可选定位）' },
        confirm: { type: 'boolean', description: 'remove 的危险操作确认' },
      },
      required: ['action'],
    },
    async call(args) {
      const action = String(args.action || '');
      if (action === 'add') {
        if (!args.url) return err('需要 url（ICS/Webcal 订阅地址）');
        const r = core.normalizeIcs({ url: args.url, name: args.name }, null);
        if (r.error) return err(r.error);
        const existing = await kv.kvGet(K.ics(r.ics.id)).catch(() => null);
        await kv.kvSet(K.ics(r.ics.id), r.ics);
        await kv.kvSet(K.cmdIcsAdd(nonce()), { op: 'icsAdd', url: r.ics.url, name: r.ics.name, at: Date.now() });
        return ok(`${existing ? '订阅已存在（id 不变），已触发立即同步' : '已添加订阅并触发立即同步'}：\n[${r.ics.id}] ${r.ics.name} · ${r.ics.url}\n后台服务通常十几秒内完成首次抓取；sundial_query range=all 可看到导入的事件。`);
      }
      if (action === 'list') {
        const defs = await listIcs();
        if (!defs.length) return ok('还没有外部日历订阅。可让用户把 ICS/Webcal 链接给你，用 sundial_ics action=add 添加。');
        return ok(`共 ${defs.length} 个订阅：\n${defs.map((d) => {
          const time = d.lastFetchAt ? new Date(d.lastFetchAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '从未抓取';
          const status = d.lastStatus === 'error' ? `⚠ ${core.oneLine(d.lastError, 60)}` : (d.lastStatus === 'never' ? '等待首抓' : '正常');
          return `[${d.id}]${d.enabled === false ? ' ⏸' : ''} ${core.oneLine(d.name, 30)} · ${d.eventCount || 0} 事件 · 上次 ${time} · ${status}\n   ${d.url}`;
        }).join('\n')}`);
      }
      if (action === 'refresh') {
        if (args.id) {
          const def = await kv.kvGet(K.ics(String(args.id))).catch(() => null);
          if (!def) return err(`未找到订阅 ${args.id}（action=list 可查）`);
          await kv.kvSet(K.cmdIcsRefresh(def.id), { op: 'icsRefresh', cid: def.id, at: Date.now() });
          return ok(`已下发刷新命令：[${def.id}] ${def.name}。服务通常几秒内完成。`);
        }
        await kv.kvSet(`sundial.cmd.ics.refreshAll.${nonce()}`, { op: 'icsRefreshAll', at: Date.now() });
        return ok('已下发全部订阅刷新命令。');
      }
      if (action === 'remove') {
        if (args.confirm !== true) return err('退订会同时删除该日历导入的全部事件，是危险操作，请先与用户确认后带 confirm: true 重试。');
        const cid = String(args.id || '');
        if (!cid) return err('需要订阅 id（action=list 可查）');
        const def = await kv.kvGet(K.ics(cid)).catch(() => null);
        await kv.kvSet(K.cmdIcsRemove(cid), { op: 'icsRemove', cid, at: Date.now() });
        return ok(`已下发退订命令：${def ? `[${def.id}] ${def.name}` : cid}，其导入的事件将一并删除。`);
      }
      return err(`未知 action：${action}（支持 add/list/remove/refresh）`);
    },
  },
  {
    name: 'sundial_today',
    description: '日程提醒今日摘要——用户问「今天有什么安排」「我现在要干嘛」时的第一入口。返回：今天与明天的日程（含已完成标记）、习惯今日打卡状态与连击、当前到期的提醒（横幅未确认的）、最近的倒数日。也适合作为一天开始时主动调用的工具。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async call() {
      const now = Date.now();
      const events = await listEvents();
      const { t0, t1 } = rangeToWindow('today', now);
      const today = [];
      for (const e of events) {
        if (e.enabled === false) continue;
        for (const occ of core.expandOccurrences(e, t0, t1)) today.push({ e, occ });
      }
      today.sort((a, b) => a.occ.start - b.occ.start);
      const tmr = [];
      const tm = rangeToWindow('tomorrow', now);
      for (const e of events) {
        if (e.enabled === false) continue;
        for (const occ of core.expandOccurrences(e, tm.t0, tm.t1)) tmr.push({ e, occ });
      }
      tmr.sort((a, b) => a.occ.start - b.occ.start);
      const reminders = await readReminders();
      const cds = [];
      for (const e of events) {
        if (e.enabled === false || (e.kind !== 'countdown' && e.kind !== 'event')) continue;
        const c = core.countdownInfo(e, now);
        if (c && c.days >= 0 && c.days <= 60) cds.push({ e, c });
      }
      cds.sort((a, b) => a.c.days - b.c.days);
      const habits = events.filter((e) => e.kind === 'habit' && e.enabled !== false);
      const lines = [];
      lines.push(`【当前提醒 ${reminders.length} 条】`);
      if (reminders.length) {
        for (const r of reminders.slice(0, 8)) {
          lines.push(`  ⏰ ${core.oneLine(r.title, 40)}（${r.allDay ? '全天' : core.fmtClock(r.start)} 开始，提前 ${r.offsetMin} 分钟的提醒）`);
        }
      } else lines.push('  （无）');
      lines.push(`【今天 ${today.length} 条】`);
      lines.push(...(today.length ? today.slice(0, 15).map(({ e, occ }) => `  ${fmtOcc(e, occ)}`) : ['  （今天没有安排）']));
      lines.push(`【明天 ${tmr.length} 条】`);
      lines.push(...(tmr.length ? tmr.slice(0, 8).map(({ e, occ }) => `  ${fmtOcc(e, occ)}`) : ['  （明天没有安排）']));
      if (habits.length) {
        lines.push(`【习惯打卡 ${habits.length} 个】`);
        for (const h of habits) {
          const streak = core.computeStreak(h, now);
          const todayOcc = core.expandOccurrences(h, t0, t1)[0];
          const v = todayOcc && h.done ? h.done[todayOcc.key] : undefined;
          lines.push(`  ${v === 'done' ? '✅' : v === 'skip' ? '⏭' : '⬜'} ${h.title}${streak ? ` 🔥连击${streak}` : ''}${h.rrule ? `（${core.describeRrule(h.rrule)}）` : ''}`);
        }
      }
      if (cds.length) {
        lines.push(`【倒数日（60 天内）】`);
        for (const { e, c } of cds.slice(0, 6)) {
          lines.push(`  ${c.days === 0 ? '🎉 就是今天' : `D-${c.days}`} ${core.oneLine(e.title, 40)}（${core.fmtDay(c.targetTs)}）`);
        }
      }
      return ok(lines.join('\n'));
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
