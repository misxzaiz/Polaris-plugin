#!/usr/bin/env node
'use strict';
/**
 * time-trail MCP Server —— 刻漏的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 timetrail.* 键空间的读数/归类/控制。归集/落盘全部由后台服务单权威执行
 * （service/trail.js 是天账本唯一写者）——MCP 只读快照/天记录、写分类规则
 * 与暂停设置，不自行采集，与服务共享同一事实库。
 *
 * 工具一览：
 *   timetrail_today          今日实况：当前应用/分类耗时/时段分布/焦点指标
 *   timetrail_query          区间查询：最近 N 天或指定日期，按应用/分类过滤
 *   timetrail_apps           应用清单（含未分类清单，AI 归类的工作面）
 *   timetrail_set_categories 把应用归入七类之一（写 timetrail.cats，历史即时生效）
 *   timetrail_control        暂停/恢复/状态（隐私模式）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现（env → anchor → config → 扫描）。
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/trail-core');

const SERVER_NAME = 'time-trail';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 数据装载 ───────────────────────────────────────────────────────────────
async function loadSnapshot() {
  return kv.kvGet(core.K.snapshot).catch(() => null);
}
async function loadCats() {
  return kv.kvGet(core.K.cats).catch(() => null);
}
async function loadDay(dateKey) {
  const raw = await kv.kvGet(core.K.day(dateKey)).catch(() => null);
  return raw && typeof raw === 'object' ? core.hydrateDay(raw, dateKey) : null;
}
/** 最近 N 天（含今天）的天记录 */
async function loadRecentDays(n) {
  const dates = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) dates.push(core.dateKeyOf(now - i * 86400000));
  const uniq = [...new Set(dates)];
  const days = await Promise.all(uniq.map((d) => loadDay(d)));
  return days.filter(Boolean);
}

function freshAge(snap) {
  if (!snap || typeof snap.at !== 'number') return Infinity;
  return Math.max(0, Math.round((Date.now() - snap.at) / 1000));
}

async function snapshotHealthHint() {
  const snap = await loadSnapshot();
  if (!snap || typeof snap !== 'object') {
    return { snap: null, hint: '暂无快照：刻漏后台服务可能未运行（Polaris 设置→插件→刻漏 查看服务状态；面板设置 Tab 可一键启动）' };
  }
  const age = freshAge(snap);
  if (age > 120) {
    return { snap, hint: `快照已停滞 ${age}s（>120s）：后台服务可能已停止，历史数据仍可查询` };
  }
  return { snap, hint: '' };
}

// ── 渲染 ───────────────────────────────────────────────────────────────────
function bar(pct, width = 14) {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function renderCurrent(snap) {
  if (!snap || snap.paused) return '⏸ 已暂停（隐私模式）——暂停期间不采集';
  const c = snap.current;
  if (!c || !c.app) return '○ 当前无前台应用（锁定屏/桌面）';
  const name = core.displayName(c.app);
  const mins = Math.max(0, Math.round((Date.now() - (c.since || Date.now())) / 60000));
  const idleTxt = c.idle
    ? `已空闲 ${core.fmtDur(Math.round((c.idleMs || 0) / 1000))}`
    : `已 ${mins < 1 ? '不到 1 分钟' : `${mins} 分钟`}`;
  const titleTxt = c.title ? ` — ${String(c.title).slice(0, 50)}` : '';
  return `▶ 当前：${name}（${c.app}）${idleTxt}${titleTxt}`;
}

function renderCategories(agg, totalSec) {
  const bars = core.categoryBars(agg);
  if (!bars.length) return '  （暂无记录）';
  return bars.map((b) => {
    const pct = totalSec > 0 ? Math.round((b.sec / totalSec) * 100) : 0;
    return `  ${b.emoji} ${b.label} ${core.fmtDur(b.sec)} ${bar(pct)} ${pct}%`;
  }).join('\n');
}

function renderTopApps(agg, limit = 10) {
  const entries = Object.entries(agg.byApp).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!entries.length) return '  （暂无记录）';
  return entries.map(([app, sec], i) => `  ${i + 1}. ${core.displayName(app)}（${app}）${core.fmtDur(sec)}`).join('\n');
}

/** 时段分布（非空小时，含主分类） */
function renderHours(day, rules) {
  const hours = day && day.hours ? Object.keys(day.hours).map(Number).sort((a, b) => a - b) : [];
  if (!hours.length) return '  （暂无记录）';
  return hours.map((h) => {
    const bucket = day.hours[h];
    let active = 0;
    const byCat = {};
    for (const [app, sec] of Object.entries(bucket)) {
      if (app === '_idle') continue;
      const s = Number(sec) || 0;
      active += s;
      const cat = core.classifyApp(app, rules);
      byCat[cat] = (byCat[cat] || 0) + s;
    }
    if (active <= 0) return null;
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const meta = core.CATEGORIES[topCat ? topCat[0] : 'other'];
    const idle = Number(bucket._idle) || 0;
    const idleTxt = idle > 60 ? `（空闲 ${core.fmtDur(Math.round(idle))}）` : '';
    return `  ${String(h).padStart(2, '0')}时 ${meta.emoji}${meta.label}为主 ${core.fmtDur(Math.round(active))}${idleTxt}`;
  }).filter(Boolean).join('\n');
}

function dayLine(day, rules) {
  const agg = core.aggregateDays([day], { rules });
  const top = Object.entries(agg.byApp).sort((a, b) => b[1] - a[1])[0];
  const topTxt = top ? `，主打 ${core.displayName(top[0])}` : '';
  return `  ${day.date}：活跃 ${core.fmtDur(agg.totalSec)}，空闲 ${core.fmtDur(day.idleSec)}，切换 ${day.switches} 次${topTxt}`;
}

// ── 工具定义 ───────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'timetrail_today',
    description: '看今天（运行 Polaris 的这台机器）的时间流向：当前前台应用、今日各分类与应用耗时排行、小时级时段分布、空闲与切换次数。适用于「我今天干了啥」「现在在用什么」「上午都在干嘛」。手机上通过 Polaris 查问时看到的是桌面机的实时状态。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const { snap, hint } = await snapshotHealthHint();
      if (!snap) return err(hint);
      const cats = await loadCats();
      const day = await loadDay(core.dateKeyOf(Date.now()));
      if (!day) {
        return ok(`${hint}\n\n今日（${core.dateKeyOf(Date.now())}）暂无记录：${snap.paused ? '刻漏处于暂停（隐私模式）' : '服务刚启动或采集器未运行'}`);
      }
      const agg = core.aggregateDays([day], { rules: cats });
      const lines = [];
      lines.push(`刻漏 · ${day.date} · 采集器${snap.collector === 'alive' ? '正常' : snap.collector === 'dead' ? '离线' : '不支持'}（${snap.tickSec}s 采样，空闲阈值 ${snap.idleSec}s）`);
      if (hint) lines.push(`⚠ ${hint}`);
      lines.push(renderCurrent(snap));
      lines.push('');
      lines.push(`今日活跃 ${core.fmtDur(agg.totalSec)} · 空闲 ${core.fmtDur(day.idleSec)} · 应用切换 ${day.switches} 次 · 记录到 ${Object.keys(day.apps).length} 个应用`);
      lines.push('');
      lines.push('分类：');
      lines.push(renderCategories(agg, agg.totalSec));
      lines.push('');
      lines.push('Top 应用：');
      lines.push(renderTopApps(agg, 10));
      lines.push('');
      lines.push('时段分布：');
      lines.push(renderHours(day, cats));
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'timetrail_query',
    description: '查询一段时间的时间流向：最近 N 天（默认 7，上限 90）或指定日期；可按应用或分类过滤。返回各日活跃/空闲/切换、分类合计、应用排行与日明细。适用于「这周写代码多久了」「上周五用了什么」「最近一个月娱乐时间多少」。',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '最近 N 天（含今天），默认 7，上限 90' },
        date: { type: 'string', description: '指定日期 YYYY-MM-DD（与 days 二选一，优先）' },
        app: { type: 'string', description: '按应用过滤（进程名小写，如 code）' },
        cat: { type: 'string', description: '按分类过滤：dev/create/meet/browse/media/play/other' },
      },
    },
    async call(args) {
      const rules = await loadCats();
      let dates = [];
      if (args && typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
        dates = [args.date];
      } else {
        const n = Math.min(90, Math.max(1, Math.round(Number(args && args.days) || 7)));
        const now = Date.now();
        for (let i = 0; i < n; i++) dates.push(core.dateKeyOf(now - i * 86400000));
      }
      const days = (await Promise.all(dates.map((d) => loadDay(d)))).filter(Boolean);
      if (!days.length) return ok(`区间 ${dates[0]} ~ ${dates[dates.length - 1]} 暂无记录（刻漏可能刚安装，或处于暂停）。`);
      const agg = core.aggregateDays(days, {
        rules,
        app: args && args.app ? String(args.app) : undefined,
        cat: args && args.cat ? String(args.cat) : undefined,
      });
      const filterTxt = [
        args && args.app ? `应用=${args.app}` : '',
        args && args.cat ? `分类=${args.cat}（${core.CATEGORIES[args.cat] ? core.CATEGORIES[args.cat].label : args.cat}）` : '',
      ].filter(Boolean).join('，');
      const lines = [];
      lines.push(`刻漏查询 · ${days.length} 天（${dates[dates.length - 1]} ~ ${dates[0]}）${filterTxt ? ` · 过滤：${filterTxt}` : ''}`);
      lines.push(`合计活跃 ${core.fmtDur(agg.totalSec)} · 空闲 ${core.fmtDur(agg.idleSec)} · 切换 ${agg.switches} 次 · 日均 ${core.fmtDur(Math.round(agg.totalSec / days.length))}`);
      lines.push('');
      lines.push('分类合计：');
      lines.push(renderCategories(agg, agg.totalSec));
      lines.push('');
      lines.push('应用排行：');
      lines.push(renderTopApps(agg, 15));
      lines.push('');
      lines.push('日明细：');
      const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : -1));
      lines.push(sorted.map((d) => dayLine(d, rules)).join('\n'));
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'timetrail_apps',
    description: '列出记录到的应用及其累计时长与分类状态（已分类/未分类/分类名）。unknownOnly=true 时只列未分类应用——配合 timetrail_set_categories 做「AI 归类」。适用于「帮我归类这些新应用」「有哪些应用没分类」。',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '统计最近 N 天，默认 7，上限 90' },
        unknownOnly: { type: 'boolean', description: '只列未分类应用，默认 false' },
      },
    },
    async call(args) {
      const cats = await loadCats();
      const n = Math.min(90, Math.max(1, Math.round(Number(args && args.days) || 7)));
      const days = await loadRecentDays(n);
      if (!days.length) return ok(`最近 ${n} 天暂无记录。`);
      const agg = core.aggregateDays(days, { rules: cats });
      const entries = Object.entries(agg.byApp).sort((a, b) => b[1] - a[1]);
      const unknown = core.unknownApps(days, cats, 200);
      const unknownSet = new Set(unknown.map((u) => u.app));
      const lines = [];
      if (args && args.unknownOnly === true) {
        if (!unknown.length) return ok(`最近 ${n} 天共 ${entries.length} 个应用，全部已分类，无需归类。`);
        lines.push(`最近 ${n} 天有 ${unknown.length} 个未分类应用（按累计时长降序）：`);
        lines.push(unknown.map((u) => `  ${u.app}（${core.displayName(u.app)}）${core.fmtDur(u.sec)}`).join('\n'));
        lines.push('');
        lines.push('可用 timetrail_set_categories 把它们归入：dev（开发）/ create（创作）/ meet（沟通）/ browse（浏览）/ media（影音）/ play（娱乐）/ other（其他）');
      } else {
        lines.push(`最近 ${n} 天共 ${entries.length} 个应用（${unknownSet.size} 个未分类）：`);
        lines.push(entries.slice(0, 40).map(([app, sec]) => {
          const cat = core.classifyApp(app, cats);
          const meta = core.CATEGORIES[cat];
          const mark = unknownSet.has(app) ? ' ⚠未分类' : '';
          return `  ${meta.emoji} ${core.displayName(app)}（${app}）${core.fmtDur(sec)} → ${meta.label}${mark}`;
        }).join('\n'));
        if (entries.length > 40) lines.push(`  … 其余 ${entries.length - 40} 个见 timetrail_query 过滤`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'timetrail_set_categories',
    description: '把应用归入七类之一（dev 开发 / create 创作 / meet 沟通 / browse 浏览 / media 影音 / play 娱乐 / other 其他）。规则按应用进程名精确匹配，写入后对全部历史即时生效。先经 timetrail_apps(unknownOnly=true) 拿到未分类清单，再批量归类。',
    inputSchema: {
      type: 'object',
      properties: {
        cats: {
          type: 'object',
          description: '应用 → 分类映射，如 {"code":"dev","cloudmusic":"media"}；键为进程名小写',
        },
      },
      required: ['cats'],
    },
    async call(args) {
      const map = args && args.cats && typeof args.cats === 'object' ? args.cats : null;
      if (!map) return err('缺少 cats 参数（应用 → 分类对象）');
      const raw = (await loadCats()) || {};
      const rules = core.normalizeRules(raw);
      const applied = [];
      const rejected = [];
      for (const [app0, cat0] of Object.entries(map)) {
        const app = String(app0).trim().toLowerCase();
        const cat = String(cat0).trim();
        if (!app) { rejected.push(`${app0}: 空应用名`); continue; }
        if (!core.CAT_IDS.includes(cat)) { rejected.push(`${app}: 未知分类「${cat}」（只允许 ${core.CAT_IDS.join('/')}）`); continue; }
        const prev = rules.find((r) => r.kind === 'exact' && r.match === app);
        if (prev) {
          prev.cat = cat;
        } else {
          rules.push({ match: app, kind: 'exact', cat });
        }
        applied.push(`${app} → ${core.CATEGORIES[cat].label}`);
      }
      if (!applied.length) return err(`没有可用归类。被拒：${rejected.join('；') || '无'}`);
      if (rules.length > 500) return err(`规则已达上限 500 条`);
      await kv.kvSet(core.K.cats, { v1: 1, rules });
      const lines = [`已归类 ${applied.length} 项（对全部历史即时生效）：`, ...applied.map((a) => `  ${a}`)];
      if (rejected.length) lines.push(`被拒 ${rejected.length} 项：${rejected.join('；')}`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'timetrail_control',
    description: '刻漏控制：status 查看服务/采集器健康与隐私设置；pause 暂停采集（隐私模式，期间什么都不记）；resume 恢复采集。适用于「先别记了」「现在采集正常吗」。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'pause', 'resume'], description: '默认 status' },
      },
    },
    async call(args) {
      const action = (args && args.action) || 'status';
      const raw = await kv.kvGet(core.K.settings).catch(() => null);
      const settings = core.normalizeSettings(raw);
      if (action === 'pause' || action === 'resume') {
        const nextPaused = action === 'pause';
        if (settings.paused !== nextPaused) {
          settings.paused = nextPaused;
          await kv.kvSet(core.K.settings, settings);
        }
        const snap = await loadSnapshot();
        return ok(`${nextPaused ? '已暂停采集（隐私模式）' : '已恢复采集'}。服务侧约 ${snap ? Math.max(1, Math.round(freshAge(snap) / 1)) : '——'} 内生效（设置轮询 60s + 面板可见快照刷新）。`);
      }
      // status
      const { snap, hint } = await snapshotHealthHint();
      const meta = await kv.kvGet(core.K.meta).catch(() => null);
      const lines = ['刻漏状态：'];
      if (meta && typeof meta === 'object') {
        lines.push(`  服务：pid=${meta.pid}，运行 ${core.fmtDur(Math.round((Date.now() - (meta.startedAt || Date.now())) / 1000))}，桥=${meta.bridge || '未连接'}`);
        lines.push(`  采集器：${snap ? snap.collector : '?'}（重启 ${meta.collectorRestarts || 0} 次）`);
        lines.push(`  参数：${meta.tickSec}s 采样 / 空闲阈值 ${meta.idleSec}s / 标题采集=${meta.captureTitles ? '开' : '关（默认隐私）'} / 保留 ${meta.retentionDays} 天`);
        lines.push(`  暂停：${meta.paused ? '是（隐私模式）' : '否'}`);
      } else {
        lines.push('  服务：无心跳（可能未运行）');
      }
      if (snap && typeof snap === 'object') {
        lines.push(`  ${renderCurrent(snap)}`);
        lines.push(`  今日：活跃 ${core.fmtDur(snap.today ? snap.today.activeSec : 0)} / 空闲 ${core.fmtDur(snap.today ? snap.today.idleSec : 0)}`);
      }
      if (hint) lines.push(`  ⚠ ${hint}`);
      return ok(lines.join('\n'));
    },
  },
];

// ── JSON-RPC stdio 主循环 ──────────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handle ${msg && msg.method}: ${e.message}`);
      if (msg && msg.id !== undefined) {
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `内部错误: ${e.message}` }], isError: true } });
      }
    });
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (!msg || msg.id === undefined) return;
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id, result: {
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
      jsonrpc: '2.0', id: msg.id, result: {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具: ${name}`) });
      return;
    }
    try {
      const result = await tool.call((msg.params && msg.params.arguments) || {});
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`工具执行失败: ${e.message}`) });
    }
    return;
  }
  send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
}
