'use strict';
/**
 * usage-core.js —— 插件运营（watchtower）共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、计量记录、插件归一化、冷热分级、日级/近 N 天聚合、治理建议。
 * 所有"计算"必须放这里，两侧只做 IO（cap.kv / cap.pluginDiscovery /
 * cap.pluginServiceManager 读写），防止口径漂移。
 *
 * 计量口径（面板通道双源合并，分账记录避免混淆）：
 *   source = 'mcp'  ：AI 经本插件 MCP 工具触发的一次调用（本插件自记）
 *   source = 'panel'：用户打开插件面板的一次打开
 *     - 宿主 0.x 观测版起，面板打开由宿主在 PluginPanelHost 挂载点自动观测
 *       （cap.kv `plugin.usage.<pluginId>`，宿主自有键空间），插件运营**读时合并**
 *       进 panel 通道，不回写自有账本（plans/plugin-usage-observation.md）；
 *     - 插件运营自身面板不再自记（同事实单写者=宿主）。
 * 两种来源写入同一账本的不同计数位，聚合时可选合并或分看。
 *
 * 数据契约（cap.kv，权威描述见 README）：
 *   watchtower.usage.<pluginId> → UsageRecord
 *     { count, lastUsed, firstUsed, panelOpens, trends: { 'YYYY-MM-DD': { mcp, panel } } }
 *   plugin.usage.<pluginId> → 宿主观测
 *     { v: 1, pluginId, count, firstUsed, lastUsed, days: { 'YYYY-MM-DD': n } }
 *   watchtower.settings → { schemaVersion: 1 }
 *
 * 治理建议（派生自聚合结果，纯函数）：
 *   - cold： 近 N 天零使用（工具 + 面板都零）→ 可停用/卸载候选
 *   - idle： 近 N 天未用但历史有用过 → 沉睡，可停用
 *   - active：今天或近期有用 → 保持
 */

// ── 常量 ────────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;

/** 活跃度判定窗口（天） */
const COLD_DAYS = 30; // 超过 30 天零使用 = 冷
const SLEEP_DAYS = 7; // 超过 7 天未用但曾用过 = 沉睡

/** 聚合窗口预设（近 N 天） */
const TREND_WINDOWS = [1, 7, 30];

/** 面板打开与工具调用的相对权重（成本口径：工具调用 = 2，面板打开 = 1） */
const COST_MCP_WEIGHT = 2;
const COST_PANEL_WEIGHT = 1;

const DEFAULT_SETTINGS = { schemaVersion: 1 };

// ── 工具函数 ────────────────────────────────────────────────────────────────
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 时间戳 → 本地日期字符串 YYYY-MM-DD */
function fmtDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地日期 YYYY-MM-DD → 当日 0 点时间戳 */
function dayStart(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function nowMs() {
  return Date.now();
}

/** 生成轻量随机 id（无碰撞要求，仅计数用） */
function makeId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 取近 N 天窗口的起始日字符串（含今天）；now 可注入（测试确定性，勿用真实时钟写死用例） */
function windowStartDay(nDays, now = nowMs()) {
  return fmtDay(now - (nDays - 1) * DAY_MS);
}

// ── 键空间 ──────────────────────────────────────────────────────────────────
const K = {
  usagePrefix: 'watchtower.usage.',
  usage(pluginId) {
    return this.usagePrefix + pluginId;
  },
  /** 宿主自有键空间（宿主 pluginUsageObserver 写入，插件运营只读）：面板打开观测 */
  hostUsagePrefix: 'plugin.usage.',
  settings: 'watchtower.settings',
};

// ── UsageRecord 归一化 ─────────────────────────────────────────────────────
function emptyUsage(pluginId) {
  return {
    pluginId,
    count: 0,
    panelOpens: 0,
    firstUsed: null,
    lastUsed: null,
    trends: {},
  };
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function toTs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.pluginId !== 'string' && typeof raw.pluginId !== 'undefined') return null;
  const rec = {
    pluginId: typeof raw.pluginId === 'string' ? raw.pluginId : 'unknown',
    count: toInt(raw.count),
    panelOpens: toInt(raw.panelOpens),
    firstUsed: toTs(raw.firstUsed),
    lastUsed: toTs(raw.lastUsed),
    trends: {},
  };
  if (raw.trends && typeof raw.trends === 'object') {
    for (const [day, val] of Object.entries(raw.trends)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const v = val && typeof val === 'object' ? val : {};
      rec.trends[day] = {
        mcp: toInt(v.mcp),
        panel: toInt(v.panel),
      };
    }
  }
  return rec;
}

/**
 * 记录一次使用。
 * @param {string} pluginId
 * @param {'mcp'|'panel'} source
 * @param {UsageRecord|null} prev 现有记录（null = 首次）
 * @param {number} [at] 时间戳，默认现在
 * @returns {UsageRecord} 新记录（调用方负责持久化）
 */
function recordUsage(pluginId, source, prev, at = nowMs()) {
  const base = normalizeUsage(prev) || emptyUsage(pluginId);
  base.pluginId = pluginId;
  const day = fmtDay(at);
  const slot = base.trends[day] || { mcp: 0, panel: 0 };
  if (source === 'panel') {
    base.panelOpens += 1;
    slot.panel += 1;
  } else {
    base.count += 1;
    slot.mcp += 1;
  }
  base.trends[day] = slot;
  if (base.firstUsed === null) base.firstUsed = at;
  base.lastUsed = at;
  return base;
}

/**
 * 计算某天的来源次数。
 * @param {UsageRecord} rec
 * @param {string} day YYYY-MM-DD
 * @returns {{mcp:number, panel:number, total:number}}
 */
function dayBreakdown(rec, day) {
  if (!rec || typeof rec !== 'object') return { mcp: 0, panel: 0, total: 0 };
  const slot = (rec.trends && rec.trends[day]) || { mcp: 0, panel: 0 };
  return { mcp: slot.mcp, panel: slot.panel, total: slot.mcp + slot.panel };
}

/** 取记录中全部有数据的日期（升序）；null/undefined 记录返回空数组 */
function daysWithData(rec) {
  if (!rec || typeof rec !== 'object') return [];
  return Object.keys(rec.trends || {}).sort();
}

/**
 * 近 N 天聚合。
 * @param {UsageRecord} rec
 * @param {number} nDays
 * @param {number} [now] 可注入当前时间（测试确定性）
 * @returns {{ mcp:number, panel:number, total:number, firstDay:string, lastDay:string|null }}
 */
function aggregateWindow(rec, nDays, now = nowMs()) {
  const start = windowStartDay(nDays, now);
  const days = daysWithData(rec).filter((d) => d >= start);
  let mcp = 0;
  let panel = 0;
  for (const d of days) {
    const slot = rec.trends[d] || { mcp: 0, panel: 0 };
    mcp += slot.mcp;
    panel += slot.panel;
  }
  return {
    mcp,
    panel,
    total: mcp + panel,
    firstDay: start,
    lastDay: days.length ? days[days.length - 1] : null,
  };
}

/** 加权成本（工具调用 > 面板打开），用于排序"活跃度" */
function costOf(rec, nDays, now = nowMs()) {
  const w = aggregateWindow(rec, nDays, now);
  return w.mcp * COST_MCP_WEIGHT + w.panel * COST_PANEL_WEIGHT;
}

// ── 宿主观测（cap.kv `plugin.usage.` 键空间，plans/plugin-usage-observation.md）──
/**
 * 归一化宿主写入的面板打开观测。
 *
 * 宿主在权威观测点（面板模块加载成功）自动记录"用户打开了某插件的面板"，
 * 落 cap.kv 宿主自有键空间 `plugin.usage.<pluginId>`（宿主不写插件运营私有键）。
 * @param {unknown} raw cap.kv get 的 value
 * @returns {{ pluginId:string, count:number, firstUsed:number, lastUsed:number, days:Record<string,number> }|null}
 */
function normalizeHostObservation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pluginId = typeof raw.pluginId === 'string' ? raw.pluginId : null;
  if (!pluginId) return null;
  const count = toInt(raw.count);
  const days = {};
  if (raw.days && typeof raw.days === 'object') {
    for (const [day, n] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const v = toInt(n);
      if (v > 0) days[day] = v;
    }
  }
  return {
    pluginId,
    count,
    firstUsed: toTs(raw.firstUsed),
    lastUsed: toTs(raw.lastUsed),
    days,
  };
}

/**
 * 把宿主观测合并进插件运营账本（**读时合并，不回写**）。
 *
 * 语义：宿主观测的就是"面板打开"，计入 panel 通道（trends[day].panel 与
 * panelOpens）。只允许对"刚从 watchtower.usage.* 读出的自有账本"合并一次——
 * 合并结果不落盘，下次读取重新从两处原始键合并，天然幂等。
 * @param {UsageRecord|null} rec 插件运营自有账本（normalizeUsage 产物或 null）
 * @param {{ count:number, firstUsed:number|null, lastUsed:number|null, days:Record<string,number> }|null} obs normalizeHostObservation 产物
 * @param {string} pluginId
 * @returns {UsageRecord}
 */
function mergeHostIntoUsage(rec, obs, pluginId) {
  const base = normalizeUsage(rec) || emptyUsage(pluginId);
  base.pluginId = pluginId;
  if (!obs) return base;
  for (const [day, n] of Object.entries(obs.days)) {
    const slot = base.trends[day] || { mcp: 0, panel: 0 };
    slot.panel += n;
    base.trends[day] = slot;
  }
  base.panelOpens += obs.count;
  if (obs.firstUsed && (base.firstUsed === null || obs.firstUsed < base.firstUsed)) base.firstUsed = obs.firstUsed;
  if (obs.lastUsed && (base.lastUsed === null || obs.lastUsed > base.lastUsed)) base.lastUsed = obs.lastUsed;
  return base;
}

// ── 活跃度分级 ──────────────────────────────────────────────────────────────
/**
 * 插件活跃度分级。
 * @returns {('active'|'idle'|'cold'|'never')}
 *   active：近 7 天有使用
 *   idle ：7 天前用过、近 7 天没有（沉睡）
 *   cold ：从未用过或近 30 天零使用
 *   never：完全没有任何使用记录
 */
function activityOf(rec, now = nowMs()) {
  if (!rec || typeof rec.pluginId !== 'string') return 'never';
  const last = rec.lastUsed;
  if (last === null || typeof last !== 'number') return 'never';
  const idleSince = now - SLEEP_DAYS * DAY_MS;
  if (last >= idleSince) return 'active';
  const coldSince = now - COLD_DAYS * DAY_MS;
  if (last >= coldSince) return 'idle';
  return 'cold';
}

const ACTIVITY_LABELS = {
  active: { label: '活跃', color: '#2f9e44', desc: '近 7 天有用过' },
  idle: { label: '沉睡', color: '#e8590c', desc: '超过 7 天未用' },
  cold: { label: '冷门', color: '#868e96', desc: '超过 30 天未用' },
  never: { label: '从未', color: '#adb5bd', desc: '没有任何使用记录' },
};

function activityLabel(activity) {
  return ACTIVITY_LABELS[activity] || ACTIVITY_LABELS.never;
}

// ── 插件归一化（与 cap.pluginDiscovery.discover 返回对齐）───────────────────
/**
 * 归一化宿主 discover 返回的插件记录。
 * @param {unknown} raw 宿主返回的单条 plugin（cap.pluginDiscovery discover 产物）
 * @returns {object|null} 归一化插件描述
 */
function normalizePlugin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  const name = typeof raw.name === 'string' ? raw.name : null;
  if (!id || !name) return null;
  return {
    id,
    name,
    version: typeof raw.version === 'string' ? raw.version : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    builtin: raw.builtin === true,
    enabledByDefault: raw.enabledByDefault === true,
    installPath: typeof raw.installPath === 'string' ? raw.installPath : '',
    contributes: raw.contributes && typeof raw.contributes === 'object' ? raw.contributes : {},
    origin: raw.origin && typeof raw.origin === 'object' ? raw.origin : {},
    source: raw.source && typeof raw.source === 'object' ? raw.source : {},
  };
}

/** 该插件是否声明了后台服务 */
function hasServices(plugin) {
  return Array.isArray(plugin.contributes?.services) && plugin.contributes.services.length > 0;
}

/** 该插件声明的服务 id 列表（contributes.services[].id）——启动服务的可靠来源。
 *  注意：cap.pluginServiceManager.list_status 只返回"正在管理"的服务，已停止的不在
 *  其中；启动某服务必须用**声明的 serviceId**，否则停掉后拿不到 id（面板启动按钮
 *  曾因此报"缺参数"）。 */
function serviceIdsOf(plugin) {
  if (!Array.isArray(plugin.contributes?.services)) return [];
  return plugin.contributes.services
    .map((s) => (s && typeof s.id === 'string' ? s.id : null))
    .filter((id) => id !== null);
}

/** 该插件声明的 MCP server 数量 */
function mcpServerCount(plugin) {
  return Array.isArray(plugin.contributes?.mcpServers) ? plugin.contributes.mcpServers.length : 0;
}

// ── 服务状态归一化（与 cap.pluginServiceManager.list_status 对齐）───────────
/**
 * 归一化宿主返回的服务状态。
 * @param {unknown} raw 宿主返回的单条 ServiceStatus（camelCase 字段）
 */
function normalizeServiceStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const serviceId = typeof raw.serviceId === 'string' ? raw.serviceId : null;
  const pluginId = typeof raw.pluginId === 'string' ? raw.pluginId : null;
  if (!serviceId || !pluginId) return null;
  return {
    serviceId,
    pluginId,
    state: typeof raw.state === 'string' ? raw.state : 'unknown',
    port: typeof raw.port === 'number' ? raw.port : null,
    pid: typeof raw.pid === 'number' ? raw.pid : null,
    uptime: typeof raw.uptime === 'number' ? raw.uptime : null,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    restartCount: typeof raw.restartCount === 'number' ? raw.restartCount : 0,
  };
}

// ── 治理建议 ────────────────────────────────────────────────────────────────
/**
 * 对全部插件生成治理建议。
 * @param {object[]} plugins 归一化插件列表（来自 normalizePlugin）
 * @param {Record<string, UsageRecord>} usageByPlugin pluginId → 归一化 UsageRecord
 * @param {object[]} [services] 归一化服务状态列表
 * @returns {object[]} 治理建议数组（按紧急度排序）
 */
function governanceSuggestions(plugins, usageByPlugin, services = []) {
  const out = [];
  const runningServices = new Set(
    services
      .filter((s) => s && s.state === 'running')
      .map((s) => s.pluginId),
  );
  for (const p of plugins) {
    const rec = usageByPlugin[p.id] || null;
    const activity = activityOf(rec);
    // 冷门且后台服务在跑 → 最值得停用（省资源）
    if ((activity === 'cold' || activity === 'never') && runningServices.has(p.id)) {
      out.push({
        pluginId: p.id,
        name: p.name,
        activity,
        suggestion: 'stop',
        reason: `${activityLabel(activity).label}插件仍在运行后台服务，建议停用以释放资源`,
        weight: 90,
      });
      continue;
    }
    if (activity === 'cold' && !p.builtin) {
      out.push({
        pluginId: p.id,
        name: p.name,
        activity,
        suggestion: 'disable',
        reason: `近 ${COLD_DAYS} 天零使用，建议停用或卸载`,
        weight: 60,
      });
      continue;
    }
    if (activity === 'idle' && runningServices.has(p.id)) {
      out.push({
        pluginId: p.id,
        name: p.name,
        activity,
        suggestion: 'disable',
        reason: '超过 7 天未用且后台服务在跑，建议停用省资源',
        weight: 40,
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ── 汇总统计 ────────────────────────────────────────────────────────────────
/**
 * 汇总全部插件的用量视图（供面板/AI 展示）。
 * @param {object[]} plugins 归一化插件列表
 * @param {Record<string, UsageRecord>} usageByPlugin
 * @param {object[]} [services] 服务状态列表
 */
function summarize(plugins, usageByPlugin, services = []) {
  const serviceByPlugin = new Map();
  for (const s of services) {
    if (!serviceByPlugin.has(s.pluginId)) serviceByPlugin.set(s.pluginId, []);
    serviceByPlugin.get(s.pluginId).push(s);
  }

  const rows = plugins.map((p) => {
    // 无记录插件兜底为空账本：normalizeUsage(undefined)=null，会令后续
    // aggregateWindow/costOf 读 null.trends 崩溃（真桥冒烟实测踩到）。
    const rec = normalizeUsage(usageByPlugin[p.id]) || emptyUsage(p.id);
    const activity = activityOf(rec);
    const wins = TREND_WINDOWS.map((n) => ({ days: n, ...aggregateWindow(rec, n) }));
    return {
      plugin: p,
      usage: rec,
      activity,
      activityMeta: activityLabel(activity),
      windows: wins,
      cost30: costOf(rec, 30),
      cost7: costOf(rec, 7),
      services: serviceByPlugin.get(p.id) || [],
      hasServices: hasServices(p),
      serviceIds: serviceIdsOf(p),
      mcpServerCount: mcpServerCount(p),
    };
  });

  // 活跃榜（近 7 天加权成本降序）
  const byActivity = [...rows].sort((a, b) => b.cost7 - a.cost7);
  // 冷门榜（近 30 天加权成本升序 + 从未在前）
  const byCold = [...rows].sort((a, b) => {
    if (a.activity === 'never') return -1;
    if (b.activity === 'never') return 1;
    return a.cost30 - b.cost30;
  });

  return {
    rows,
    byActivity,
    byCold,
    suggestions: governanceSuggestions(plugins, usageByPlugin, services),
    windows: TREND_WINDOWS,
    totals: {
      plugins: rows.length,
      active: rows.filter((r) => r.activity === 'active').length,
      idle: rows.filter((r) => r.activity === 'idle').length,
      cold: rows.filter((r) => r.activity === 'cold').length,
      never: rows.filter((r) => r.activity === 'never').length,
      runningServices: services.filter((s) => s.state === 'running').length,
    },
  };
}

module.exports = {
  K, DAY_MS, COLD_DAYS, SLEEP_DAYS, TREND_WINDOWS,
  COST_MCP_WEIGHT, COST_PANEL_WEIGHT, DEFAULT_SETTINGS,
  fmtDay, dayStart, nowMs, makeId, windowStartDay,
  emptyUsage, normalizeUsage, recordUsage, dayBreakdown,
  daysWithData, aggregateWindow, costOf,
  normalizeHostObservation, mergeHostIntoUsage,
  activityOf, ACTIVITY_LABELS, activityLabel,
  normalizePlugin, hasServices, mcpServerCount, serviceIdsOf,
  normalizeServiceStatus, governanceSuggestions, summarize,
};
