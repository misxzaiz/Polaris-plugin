var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/usage-core.js
var require_usage_core = __commonJS({
  "shared/usage-core.js"(exports, module) {
    "use strict";
    var DAY_MS = 24 * 60 * 60 * 1e3;
    var COLD_DAYS2 = 30;
    var SLEEP_DAYS2 = 7;
    var TREND_WINDOWS2 = [1, 7, 30];
    var COST_MCP_WEIGHT = 2;
    var COST_PANEL_WEIGHT = 1;
    var DEFAULT_SETTINGS = { schemaVersion: 1 };
    function pad(n) {
      return n < 10 ? "0" + n : "" + n;
    }
    function fmtDay3(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    function dayStart(dayStr) {
      const [y, m, d] = dayStr.split("-").map(Number);
      return new Date(y, m - 1, d).getTime();
    }
    function nowMs() {
      return Date.now();
    }
    function makeId() {
      return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    function windowStartDay(nDays) {
      return fmtDay3(nowMs() - (nDays - 1) * DAY_MS);
    }
    var K2 = {
      usagePrefix: "watchtower.usage.",
      usage(pluginId) {
        return this.usagePrefix + pluginId;
      },
      settings: "watchtower.settings"
    };
    function emptyUsage(pluginId) {
      return {
        pluginId,
        count: 0,
        panelOpens: 0,
        firstUsed: null,
        lastUsed: null,
        trends: {}
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
    function normalizeUsage2(raw) {
      if (!raw || typeof raw !== "object") return null;
      if (typeof raw.pluginId !== "string" && typeof raw.pluginId !== "undefined") return null;
      const rec = {
        pluginId: typeof raw.pluginId === "string" ? raw.pluginId : "unknown",
        count: toInt(raw.count),
        panelOpens: toInt(raw.panelOpens),
        firstUsed: toTs(raw.firstUsed),
        lastUsed: toTs(raw.lastUsed),
        trends: {}
      };
      if (raw.trends && typeof raw.trends === "object") {
        for (const [day, val] of Object.entries(raw.trends)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
          const v = val && typeof val === "object" ? val : {};
          rec.trends[day] = {
            mcp: toInt(v.mcp),
            panel: toInt(v.panel)
          };
        }
      }
      return rec;
    }
    function recordUsage2(pluginId, source, prev, at = nowMs()) {
      const base = normalizeUsage2(prev) || emptyUsage(pluginId);
      base.pluginId = pluginId;
      const day = fmtDay3(at);
      const slot = base.trends[day] || { mcp: 0, panel: 0 };
      if (source === "panel") {
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
    function dayBreakdown(rec, day) {
      const slot = rec.trends && rec.trends[day] || { mcp: 0, panel: 0 };
      return { mcp: slot.mcp, panel: slot.panel, total: slot.mcp + slot.panel };
    }
    function daysWithData(rec) {
      return Object.keys(rec.trends || {}).sort();
    }
    function aggregateWindow2(rec, nDays) {
      const start = windowStartDay(nDays);
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
        lastDay: days.length ? days[days.length - 1] : null
      };
    }
    function costOf2(rec, nDays) {
      const w = aggregateWindow2(rec, nDays);
      return w.mcp * COST_MCP_WEIGHT + w.panel * COST_PANEL_WEIGHT;
    }
    function activityOf2(rec, now = nowMs()) {
      if (!rec || typeof rec.pluginId !== "string") return "never";
      const last = rec.lastUsed;
      if (last === null || typeof last !== "number") return "never";
      const idleSince = now - SLEEP_DAYS2 * DAY_MS;
      if (last >= idleSince) return "active";
      const coldSince = now - COLD_DAYS2 * DAY_MS;
      if (last >= coldSince) return "idle";
      return "cold";
    }
    var ACTIVITY_LABELS = {
      active: { label: "\u6D3B\u8DC3", color: "#2f9e44", desc: "\u8FD1 7 \u5929\u6709\u7528\u8FC7" },
      idle: { label: "\u6C89\u7761", color: "#e8590c", desc: "\u8D85\u8FC7 7 \u5929\u672A\u7528" },
      cold: { label: "\u51B7\u95E8", color: "#868e96", desc: "\u8D85\u8FC7 30 \u5929\u672A\u7528" },
      never: { label: "\u4ECE\u672A", color: "#adb5bd", desc: "\u6CA1\u6709\u4EFB\u4F55\u4F7F\u7528\u8BB0\u5F55" }
    };
    function activityLabel2(activity) {
      return ACTIVITY_LABELS[activity] || ACTIVITY_LABELS.never;
    }
    function normalizePlugin2(raw) {
      if (!raw || typeof raw !== "object") return null;
      const id = typeof raw.id === "string" ? raw.id : null;
      const name = typeof raw.name === "string" ? raw.name : null;
      if (!id || !name) return null;
      return {
        id,
        name,
        version: typeof raw.version === "string" ? raw.version : "",
        description: typeof raw.description === "string" ? raw.description : "",
        builtin: raw.builtin === true,
        enabledByDefault: raw.enabledByDefault === true,
        installPath: typeof raw.installPath === "string" ? raw.installPath : "",
        contributes: raw.contributes && typeof raw.contributes === "object" ? raw.contributes : {},
        origin: raw.origin && typeof raw.origin === "object" ? raw.origin : {},
        source: raw.source && typeof raw.source === "object" ? raw.source : {}
      };
    }
    function hasServices(plugin) {
      return Array.isArray(plugin.contributes?.services) && plugin.contributes.services.length > 0;
    }
    function mcpServerCount(plugin) {
      return Array.isArray(plugin.contributes?.mcpServers) ? plugin.contributes.mcpServers.length : 0;
    }
    function normalizeServiceStatus2(raw) {
      if (!raw || typeof raw !== "object") return null;
      const serviceId = typeof raw.serviceId === "string" ? raw.serviceId : null;
      const pluginId = typeof raw.pluginId === "string" ? raw.pluginId : null;
      if (!serviceId || !pluginId) return null;
      return {
        serviceId,
        pluginId,
        state: typeof raw.state === "string" ? raw.state : "unknown",
        port: typeof raw.port === "number" ? raw.port : null,
        pid: typeof raw.pid === "number" ? raw.pid : null,
        uptime: typeof raw.uptime === "number" ? raw.uptime : null,
        lastError: typeof raw.lastError === "string" ? raw.lastError : null,
        restartCount: typeof raw.restartCount === "number" ? raw.restartCount : 0
      };
    }
    function governanceSuggestions(plugins, usageByPlugin, services = []) {
      const out = [];
      const runningServices = new Set(
        services.filter((s) => s && s.state === "running").map((s) => s.pluginId)
      );
      for (const p of plugins) {
        const rec = usageByPlugin[p.id] || null;
        const activity = activityOf2(rec);
        if ((activity === "cold" || activity === "never") && runningServices.has(p.id)) {
          out.push({
            pluginId: p.id,
            name: p.name,
            activity,
            suggestion: "stop",
            reason: `${activityLabel2(activity).label}\u63D2\u4EF6\u4ECD\u5728\u8FD0\u884C\u540E\u53F0\u670D\u52A1\uFF0C\u5EFA\u8BAE\u505C\u7528\u4EE5\u91CA\u653E\u8D44\u6E90`,
            weight: 90
          });
          continue;
        }
        if (activity === "cold" && !p.builtin) {
          out.push({
            pluginId: p.id,
            name: p.name,
            activity,
            suggestion: "disable",
            reason: `\u8FD1 ${COLD_DAYS2} \u5929\u96F6\u4F7F\u7528\uFF0C\u5EFA\u8BAE\u505C\u7528\u6216\u5378\u8F7D`,
            weight: 60
          });
          continue;
        }
        if (activity === "idle" && runningServices.has(p.id)) {
          out.push({
            pluginId: p.id,
            name: p.name,
            activity,
            suggestion: "disable",
            reason: "\u8D85\u8FC7 7 \u5929\u672A\u7528\u4E14\u540E\u53F0\u670D\u52A1\u5728\u8DD1\uFF0C\u5EFA\u8BAE\u505C\u7528\u7701\u8D44\u6E90",
            weight: 40
          });
        }
      }
      return out.sort((a, b) => b.weight - a.weight);
    }
    function summarize2(plugins, usageByPlugin, services = []) {
      const serviceByPlugin = /* @__PURE__ */ new Map();
      for (const s of services) {
        if (!serviceByPlugin.has(s.pluginId)) serviceByPlugin.set(s.pluginId, []);
        serviceByPlugin.get(s.pluginId).push(s);
      }
      const rows = plugins.map((p) => {
        const rec = normalizeUsage2(usageByPlugin[p.id]);
        const activity = activityOf2(rec);
        const wins = TREND_WINDOWS2.map((n) => ({ days: n, ...aggregateWindow2(rec, n) }));
        return {
          plugin: p,
          usage: rec,
          activity,
          activityMeta: activityLabel2(activity),
          windows: wins,
          cost30: costOf2(rec, 30),
          cost7: costOf2(rec, 7),
          services: serviceByPlugin.get(p.id) || [],
          hasServices: hasServices(p),
          mcpServerCount: mcpServerCount(p)
        };
      });
      const byActivity = [...rows].sort((a, b) => b.cost7 - a.cost7);
      const byCold = [...rows].sort((a, b) => {
        if (a.activity === "never") return -1;
        if (b.activity === "never") return 1;
        return a.cost30 - b.cost30;
      });
      return {
        rows,
        byActivity,
        byCold,
        suggestions: governanceSuggestions(plugins, usageByPlugin, services),
        windows: TREND_WINDOWS2,
        totals: {
          plugins: rows.length,
          active: rows.filter((r) => r.activity === "active").length,
          idle: rows.filter((r) => r.activity === "idle").length,
          cold: rows.filter((r) => r.activity === "cold").length,
          never: rows.filter((r) => r.activity === "never").length,
          runningServices: services.filter((s) => s.state === "running").length
        }
      };
    }
    module.exports = {
      K: K2,
      DAY_MS,
      COLD_DAYS: COLD_DAYS2,
      SLEEP_DAYS: SLEEP_DAYS2,
      TREND_WINDOWS: TREND_WINDOWS2,
      COST_MCP_WEIGHT,
      COST_PANEL_WEIGHT,
      DEFAULT_SETTINGS,
      fmtDay: fmtDay3,
      dayStart,
      nowMs,
      makeId,
      windowStartDay,
      emptyUsage,
      normalizeUsage: normalizeUsage2,
      recordUsage: recordUsage2,
      dayBreakdown,
      daysWithData,
      aggregateWindow: aggregateWindow2,
      costOf: costOf2,
      activityOf: activityOf2,
      ACTIVITY_LABELS,
      activityLabel: activityLabel2,
      normalizePlugin: normalizePlugin2,
      hasServices,
      mcpServerCount,
      normalizeServiceStatus: normalizeServiceStatus2,
      governanceSuggestions,
      summarize: summarize2
    };
  }
});

// src/Panel.tsx
import { useEffect, useMemo, useRef, useState } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}

// src/model.ts
var core = __toESM(require_usage_core());
var fmtDay2 = core.fmtDay;
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r.value ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
async function loadAllUsage() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(core.K.usagePrefix)).map((k) => k.slice(core.K.usagePrefix.length));
  const byPlugin = {};
  for (const id of ids) {
    const v = await kvGet(core.K.usage(id));
    const rec = core.normalizeUsage(v);
    if (rec && rec.pluginId) byPlugin[rec.pluginId] = rec;
  }
  return byPlugin;
}
async function loadPluginList() {
  const res = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  return (Array.isArray(res.plugins) ? res.plugins : []).map((p) => core.normalizePlugin(p)).filter((p) => p !== null);
}
async function loadServiceList() {
  const res = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  const arr = Array.isArray(res) ? res : [];
  return arr.map((s) => core.normalizeServiceStatus(s)).filter((s) => s !== null);
}
async function loadSummary() {
  const [plugins, usage, services] = await Promise.all([loadPluginList(), loadAllUsage(), loadServiceList()]);
  return core.summarize(plugins, usage, services);
}
async function notePanelOpen() {
  const k = core.K.usage("watchtower");
  const prev = core.normalizeUsage(await kvGet(k));
  await kvSet(k, core.recordUsage("watchtower", "panel", prev));
}
async function serviceAction(action, pluginId, serviceId) {
  const r = await capDispatch("cap.pluginServiceManager", { action, pluginId, serviceId });
  return core.normalizeServiceStatus(r);
}
async function uninstallPlugin(installPath) {
  const r = await capDispatch(
    "cap.pluginDiscovery",
    { action: "uninstall_local", installPath }
  );
  return r;
}
function timeAgo(ts) {
  if (ts == null || !ts) return "\u2014";
  const d = Date.now() - ts;
  if (d < 60 * 1e3) return "\u521A\u521A";
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var css = `
.wt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6E9F2;height:100%;display:flex;flex-direction:column;background:transparent}
.wt-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wt-body{flex:1;overflow-y:auto;padding:0 0 24px}
.wt-body::-webkit-scrollbar{width:9px;height:9px}
.wt-body::-webkit-scrollbar-track{background:transparent}
.wt-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.wt-page{max-width:620px;margin:0 auto}
.wt-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E1220 75%,rgba(14,18,32,0))}
.wt-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0b3b2f,#12203a 60%,#0E1220);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid #1f5a49}
.wt-tt{flex:1;min-width:0}
.wt-tt b{font-size:15px;display:block}
.wt-tt small{color:#8B94A9;font-size:10.5px;display:block;margin-top:1px;cursor:pointer}
.wt-tabs{display:flex;gap:4px}
.wt-tab{background:transparent;border:none;color:#8B94A9;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.wt-tab:hover{color:#E6E9F2}
.wt-tab.on{background:#1D2436;color:#E6E9F2;font-weight:600}
.wt-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.wt-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#4fd1a0,#1e7a63);flex-shrink:0}
.wt-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.wt-card{background:#141927;border:1px solid #232B40;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.wt-card-b{padding:11px 13px}
.wt-sub{font-size:10.5px;color:#8B94A9;line-height:1.6}
.wt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wt-btn{background:#1e7a63;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.wt-btn:hover{filter:brightness(1.12)}
.wt-btn:disabled{opacity:.45;cursor:not-allowed}
.wt-btn.ghost{background:#20263A;color:#E6E9F2;border:1px solid #2a3145}
.wt-btn.danger{background:#3a2030;color:#F08AA8;border:1px solid #542c3e}
.wt-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.wt-chip{background:#1D2436;border:1px solid #2a3145;border-radius:999px;color:#B4B8C4;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.wt-chip:hover{border-color:#3a4356}
.wt-chip.on{background:#14352a;border-color:#4fd1a0;color:#b7efdc;font-weight:600}
.wt-empty{color:#8B94A9;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.wt-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(18,22,34,.96);border:1px solid #232B40;color:#E6E9F2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:220;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.wt-toast.bad{border-color:#542c3e;color:#F08AA8}
.wt-toast.good{border-color:#2b4a35;color:#7EE2A0}
.wt-badge{display:inline-block;font-size:10px;padding:1px 7px;border-radius:999px;background:#223047;color:#9FB6DD;white-space:nowrap}
.wt-badge.act{background:#1e3a2b;color:#7EE2A0}
.wt-badge.idl{background:#3a2b1c;color:#F0B47A}
.wt-badge.cold{background:#252a36;color:#6E7686}
.wt-badge.never{background:#252a36;color:#5C6678}
.wt-badge.builtin{background:#2b2a4a;color:#9f9aF0}
.wt-badge.off{background:#252a36;color:#6E7686}
.wt-tbl{width:100%;border-collapse:collapse;font-size:12px}
.wt-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:7px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.wt-tbl td{padding:8px 10px;border-bottom:1px solid #161c2a;vertical-align:top}
.wt-tbl tr:last-child td{border-bottom:none}
.wt-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.wt-pname{display:flex;align-items:center;gap:6px;min-width:0}
.wt-pname b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-pname small{color:#5C6678;font-size:10px}
.wt-prog{height:5px;border-radius:3px;background:#20263A;overflow:hidden;min-width:60px}
.wt-prog i{display:block;height:100%;background:linear-gradient(90deg,#4fd1a0,#2f9e44);border-radius:3px}
.wt-subrow{font-size:10.5px;color:#8B94A9;margin-top:2px;line-height:1.5}
.wt-srv{display:flex;align-items:center;gap:6px;padding:7px 13px;border-top:1px solid #1c2333;flex-wrap:wrap}
.wt-srv:first-child{border-top:none}
.wt-srv b{white-space:nowrap}
.wt-reason{font-size:11px;color:#B4B8C4;line-height:1.6;flex:1;min-width:140px}
.wt-actions{display:flex;gap:5px}
.wt-about{font-size:11.5px;color:#8B94A9;line-height:1.7;padding:12px 10px}
.wt-about b{color:#E6E9F2}
.wt-about ul{margin:6px 0 0;padding-left:18px}
`;
function ActivityBadge({ activity }) {
  const cls = activity === "active" ? "act" : activity === "idle" ? "idl" : activity === "cold" ? "cold" : "never";
  const label = activity === "active" ? "\u6D3B\u8DC3" : activity === "idle" ? "\u6C89\u7761" : activity === "cold" ? "\u51B7\u95E8" : "\u4ECE\u672A";
  return /* @__PURE__ */ jsx("span", { className: `wt-badge ${cls}`, children: label });
}
function WatchtowerPanel(props) {
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [opBusy, setOpBusy] = useState(null);
  const [confirmUninstall, setConfirmUninstall] = useState(null);
  const [toast, setToast] = useState(null);
  const noteRef = useRef(false);
  const timerRef = useRef(null);
  const toastFn = (text, kind) => {
    setToast({ text, kind });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2600);
  };
  const refresh = () => {
    setLoading(true);
    loadSummary().then((s) => {
      setSummary(s);
      setError(null);
    }).catch((e) => setError(e.message || String(e))).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!noteRef.current) {
      noteRef.current = true;
      notePanelOpen().catch(() => {
      });
    }
    refresh();
  }, []);
  const topLines = useMemo(() => {
    if (!summary) return { cold: 0, active: 0, running: 0 };
    return {
      cold: summary.totals.cold + summary.totals.never,
      active: summary.totals.active,
      running: summary.totals.runningServices
    };
  }, [summary]);
  async function doService(row, s, action) {
    const key = `${s.pluginId}/${s.serviceId}/${action}`;
    setOpBusy(key);
    try {
      const next = await serviceAction(action, s.pluginId, s.serviceId);
      toastFn(`${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"} ${s.serviceId} \u2192 ${next?.state || "?"}`, "good");
      refresh();
    } catch (e) {
      toastFn(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`, "bad");
    } finally {
      setOpBusy(null);
    }
  }
  async function doUninstall(row) {
    setOpBusy(`uninstall:${row.plugin.id}`);
    try {
      const r = await uninstallPlugin(row.plugin.installPath);
      if (r && (r.success === false || r.error)) {
        toastFn(`\u5378\u8F7D\u5931\u8D25\uFF1A${r.error || r.message || "\u672A\u77E5\u9519\u8BEF"}`, "bad");
      } else {
        toastFn(`\u5DF2\u5378\u8F7D ${row.plugin.name}`, "good");
      }
      setConfirmUninstall(null);
      refresh();
    } catch (e) {
      toastFn(`\u5378\u8F7D\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`, "bad");
    } finally {
      setOpBusy(null);
    }
  }
  const runningServices = summary?.rows.flatMap((r) => r.services)?.filter((s) => s.state === "running") ?? [];
  return /* @__PURE__ */ jsxs("div", { className: "wt-root", children: [
    css ? /* @__PURE__ */ jsx("style", { children: css }) : null,
    /* @__PURE__ */ jsxs("div", { className: "wt-top", children: [
      /* @__PURE__ */ jsx("div", { className: "wt-logo", children: "\u{1F441}" }),
      /* @__PURE__ */ jsxs("div", { className: "wt-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "\u5B88\u671B\u53F0" }),
        /* @__PURE__ */ jsx("small", { onClick: () => setTab("overview"), children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : `${summary?.totals.plugins ?? 0} \u63D2\u4EF6 \xB7 ${topLines.active} \u6D3B\u8DC3 \xB7 ${topLines.running} \u670D\u52A1\u5728\u8DD1` })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wt-tabs", children: [["overview", "\u603B\u89C8"], ["services", "\u670D\u52A1"], ["advice", "\u6CBB\u7406"], ["about", "\u53E3\u5F84"]].map(([k, l]) => /* @__PURE__ */ jsx("button", { className: `wt-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: l }, k)) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wt-body", children: /* @__PURE__ */ jsxs("div", { className: "wt-page", children: [
      error ? /* @__PURE__ */ jsx("div", { className: "wt-card", children: /* @__PURE__ */ jsxs("div", { className: "wt-card-b", style: { color: "#F08AA8" }, children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        error
      ] }) }) : null,
      tab === "overview" ? /* @__PURE__ */ jsx(OverviewTab, { summary, loading }) : tab === "services" ? /* @__PURE__ */ jsx(
        ServicesTab,
        {
          summary,
          loading,
          runningServices,
          opBusy,
          onService: doService
        }
      ) : tab === "advice" ? /* @__PURE__ */ jsx(
        AdviceTab,
        {
          summary,
          loading,
          confirmUninstall,
          opBusy,
          onUninstall: doUninstall,
          setConfirmUninstall
        }
      ) : /* @__PURE__ */ jsx(AboutTab, {})
    ] }) }),
    toast ? /* @__PURE__ */ jsx("div", { className: `wt-toast ${toast.kind || ""}`, children: toast.text }) : null
  ] });
}
function OverviewTab({ summary, loading }) {
  if (loading && !summary) return /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u52A0\u8F7D\u63D2\u4EF6\u7528\u91CF\u2026" });
  if (!summary || summary.rows.length === 0) return /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u6CA1\u6709\u53EF\u663E\u793A\u7684\u63D2\u4EF6\uFF08\u7ECF\u5BBF\u4E3B discover \u53D1\u73B0\u5230\u7684\u4E3A\u7A7A\uFF0C\u8BF7\u786E\u8BA4\u5BBF\u4E3B\u5DF2\u88C5\u63D2\u4EF6\uFF09\u3002" });
  const activeRows = summary.byActivity.filter((r) => r.activity !== "never");
  const coldRows = summary.byCold;
  const maxCost = Math.max(1, ...activeRows.map((r) => r.cost7));
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u6D3B\u8DC3\u699C",
      /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u8FD1 7 \u5929\u52A0\u6743\u6210\u672C\uFF08\u5DE5\u5177\u8C03\u7528\xD72 + \u9762\u677F\u6253\u5F00\uFF09" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wt-card", children: /* @__PURE__ */ jsxs("table", { className: "wt-tbl", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { children: "\u63D2\u4EF6" }),
        /* @__PURE__ */ jsx("th", { children: "\u5206\u7EA7" }),
        /* @__PURE__ */ jsx("th", { children: "\u8FD17\u5929" }),
        /* @__PURE__ */ jsx("th", { children: "\u7D2F\u8BA1" }),
        /* @__PURE__ */ jsx("th", { children: "\u672B\u6B21" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        activeRows.slice(0, 12).map((r) => {
          const w7 = r.windows.find((w) => w.days === 7);
          const pct = Math.round(r.cost7 / maxCost * 100);
          return /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsxs("td", { children: [
              /* @__PURE__ */ jsxs("div", { className: "wt-pname", children: [
                /* @__PURE__ */ jsx("b", { children: r.plugin.name }),
                r.plugin.builtin ? /* @__PURE__ */ jsx("span", { className: "wt-badge builtin", children: "\u5185\u7F6E" }) : null
              ] }),
              /* @__PURE__ */ jsx("div", { className: "wt-prog", children: /* @__PURE__ */ jsx("i", { style: { width: `${Math.max(4, pct)}%` } }) })
            ] }),
            /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(ActivityBadge, { activity: r.activity }) }),
            /* @__PURE__ */ jsx("td", { className: "num", children: w7 ? w7.total : 0 }),
            /* @__PURE__ */ jsxs("td", { className: "num", children: [
              r.usage.count,
              " \u5DE5\u5177",
              /* @__PURE__ */ jsx("br", {}),
              r.usage.panelOpens,
              " \u9762\u677F"
            ] }),
            /* @__PURE__ */ jsx("td", { className: "num", children: timeAgo(r.usage.lastUsed) })
          ] }, r.plugin.id);
        }),
        activeRows.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 5, className: "wt-empty", children: "\u8FD8\u6CA1\u6709\u4F7F\u7528\u8BB0\u5F55\u3002" }) }) : null
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u51B7\u95E8\u699C",
      /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u8FD1 30 \u5929\u51E0\u4E4E\u6CA1\u7528\u8FC7\u7684\u63D2\u4EF6\uFF0C\u53EF\u8003\u8651\u505C\u7528/\u5378\u8F7D" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wt-card", children: /* @__PURE__ */ jsxs("table", { className: "wt-tbl", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { children: "\u63D2\u4EF6" }),
        /* @__PURE__ */ jsx("th", { children: "\u5206\u7EA7" }),
        /* @__PURE__ */ jsx("th", { children: "\u8FD130\u5929" }),
        /* @__PURE__ */ jsx("th", { children: "\u672B\u6B21" }),
        /* @__PURE__ */ jsx("th", { children: "\u670D\u52A1" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: coldRows.slice(0, 12).map((r) => {
        const w30 = r.windows.find((w) => w.days === 30);
        const run = r.services.some((s) => s.state === "running");
        return /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsxs("td", { children: [
            /* @__PURE__ */ jsxs("div", { className: "wt-pname", children: [
              /* @__PURE__ */ jsx("b", { children: r.plugin.name }),
              r.plugin.builtin ? /* @__PURE__ */ jsx("span", { className: "wt-badge builtin", children: "\u5185\u7F6E" }) : null
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "wt-subrow", children: [
              r.plugin.id,
              r.hasServices ? " \xB7 \u6709\u540E\u53F0\u670D\u52A1" : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(ActivityBadge, { activity: r.activity }) }),
          /* @__PURE__ */ jsx("td", { className: "num", children: w30 ? w30.total : 0 }),
          /* @__PURE__ */ jsx("td", { className: "num", children: r.usage.lastUsed ? fmtDay2(r.usage.lastUsed) : "\u4ECE\u672A" }),
          /* @__PURE__ */ jsx("td", { children: run ? /* @__PURE__ */ jsx("span", { className: "wt-badge act", children: "\u8FD0\u884C\u4E2D" }) : /* @__PURE__ */ jsx("span", { className: "wt-badge off", children: "\u65E0" }) })
        ] }, r.plugin.id);
      }) })
    ] }) })
  ] });
}
function ServicesTab({
  summary,
  loading,
  runningServices,
  opBusy,
  onService
}) {
  if (loading && !summary) return /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u52A0\u8F7D\u670D\u52A1\u72B6\u6001\u2026" });
  const rows = summary?.rows ?? [];
  if (runningServices.length === 0 && !rows.some((r) => r.hasServices)) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
        "\u540E\u53F0\u670D\u52A1",
        /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u58F0\u660E contributes.services \u7684\u63D2\u4EF6" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u5F53\u524D\u6CA1\u6709\u63D2\u4EF6\u58F0\u660E\u540E\u53F0\u670D\u52A1\uFF0C\u4E5F\u6CA1\u6709\u670D\u52A1\u5728\u8FD0\u884C\u3002" })
    ] });
  }
  const withServices = rows.filter((r) => r.hasServices);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u6B63\u5728\u8FD0\u884C",
      /* @__PURE__ */ jsxs("span", { className: "wt-hint", children: [
        runningServices.length,
        " \u4E2A"
      ] })
    ] }),
    runningServices.length === 0 ? /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u65E0\u8FD0\u884C\u4E2D\u7684\u670D\u52A1\u3002" }) : /* @__PURE__ */ jsx("div", { className: "wt-card", children: runningServices.map((s) => {
      const row = rows.find((r) => r.plugin.id === s.pluginId);
      return /* @__PURE__ */ jsxs("div", { className: "wt-srv", children: [
        /* @__PURE__ */ jsx("b", { children: row?.plugin.name ?? s.pluginId }),
        /* @__PURE__ */ jsx("span", { className: "wt-badge act", children: s.serviceId }),
        /* @__PURE__ */ jsxs("span", { className: "wt-sub", children: [
          s.port ? `\u7AEF\u53E3 ${s.port}` : "",
          s.uptime != null ? ` \xB7 up ${Math.round(s.uptime / 1e3)}s` : "",
          s.restartCount ? ` \xB7 \u91CD\u542F\xD7${s.restartCount}` : ""
        ] }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsxs("div", { className: "wt-actions", children: [
          /* @__PURE__ */ jsx("button", { className: "wt-btn ghost sm", disabled: !!opBusy, onClick: () => onService(row, s, "restart"), children: "\u91CD\u542F" }),
          /* @__PURE__ */ jsx("button", { className: "wt-btn sm", disabled: !!opBusy, onClick: () => onService(row, s, "stop"), children: "\u505C\u6B62" })
        ] })
      ] }, `${s.pluginId}/${s.serviceId}`);
    }) }),
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u5DF2\u58F0\u660E\u670D\u52A1",
      /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u672A\u5728\u8FD0\u884C\u7684\u4E5F\u53EF\u624B\u52A8\u542F\u52A8" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wt-card", children: withServices.map((r) => /* @__PURE__ */ jsxs("div", { className: "wt-srv", children: [
      /* @__PURE__ */ jsx("b", { children: r.plugin.name }),
      /* @__PURE__ */ jsxs("span", { className: `wt-badge ${r.services.some((s) => s.state === "running") ? "act" : "off"}`, children: [
        r.services.filter((s) => s.state === "running").length,
        "/",
        r.services.length,
        " \u8FD0\u884C\u4E2D"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      r.services.filter((s) => s.state !== "running").length > 0 ? /* @__PURE__ */ jsx("div", { className: "wt-actions", children: /* @__PURE__ */ jsx(
        "button",
        {
          className: "wt-btn sm",
          disabled: !!opBusy,
          onClick: () => onService(r, r.services.find((s) => s.state !== "running"), "start"),
          children: "\u542F\u52A8"
        }
      ) }) : null
    ] }, r.plugin.id)) })
  ] });
}
function AdviceTab({
  summary,
  loading,
  confirmUninstall,
  opBusy,
  onUninstall,
  setConfirmUninstall
}) {
  if (loading && !summary) return /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u8BA1\u7B97\u6CBB\u7406\u5EFA\u8BAE\u2026" });
  const suggestions = summary?.suggestions ?? [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u6CBB\u7406\u5EFA\u8BAE",
      /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u53EA\u8BFB \xB7 \u5378\u8F7D\u9700\u4E8C\u6B21\u786E\u8BA4" })
    ] }),
    suggestions.length === 0 ? /* @__PURE__ */ jsx("div", { className: "wt-empty", children: "\u6CA1\u6709\u5F85\u6CBB\u7406\u7684\u63D2\u4EF6\u2014\u2014\u90FD\u7528\u5F97\u597D\u597D\u7684\u3002" }) : /* @__PURE__ */ jsx("div", { className: "wt-card", children: suggestions.map((s) => /* @__PURE__ */ jsxs("div", { className: "wt-srv", children: [
      /* @__PURE__ */ jsx(ActivityBadge, { activity: s.activity }),
      /* @__PURE__ */ jsx("b", { children: s.name }),
      /* @__PURE__ */ jsx("span", { className: "wt-reason", children: s.reason }),
      /* @__PURE__ */ jsxs("div", { className: "wt-actions", children: [
        s.suggestion === "disable" ? /* @__PURE__ */ jsx("span", { className: "wt-sub", children: "\u53EF\u5728\u5BBF\u4E3B\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u505C\u7528" }) : null,
        s.suggestion === "uninstall" || s.activity === "cold" || s.activity === "never" ? /* @__PURE__ */ jsx("button", { className: "wt-btn danger sm", disabled: !!opBusy, onClick: () => setConfirmUninstall((summary?.rows ?? []).find((r) => r.plugin.id === s.pluginId) ?? null), children: "\u5378\u8F7D" }) : null
      ] })
    ] }, s.pluginId)) }),
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u6279\u91CF\u6CBB\u7406",
      /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u53EA\u8BFB\u6307\u5F15" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wt-card", children: /* @__PURE__ */ jsx("div", { className: "wt-card-b", children: /* @__PURE__ */ jsx("div", { className: "wt-sub", children: "\u4E3A\u907F\u514D\u8D8A\u6743\uFF0C\u672C\u63D2\u4EF6\u7684 MCP \u5DE5\u5177\u53EA\u505A\u53EA\u8BFB\u7EDF\u8BA1\u4E0E\u5355\u63D2\u4EF6\u64CD\u4F5C\uFF1B\u6279\u91CF\u505C\u7528/\u5378\u8F7D\u8BF7\u5728\u5BBF\u4E3B\u63D2\u4EF6\u7BA1\u7406\uFF08\u8BBE\u7F6E\uFF09\u91CC\u6267\u884C\u3002Made for \u8FD0\u8425\u63D2\u4EF6\u7684\u540C\u5B66\u3002" }) }) }),
    confirmUninstall ? /* @__PURE__ */ jsx("div", { className: "wt-card", children: /* @__PURE__ */ jsxs("div", { className: "wt-card-b", children: [
      /* @__PURE__ */ jsxs("div", { style: { fontWeight: 700, marginBottom: 6 }, children: [
        "\u786E\u8BA4\u5378\u8F7D\u300C",
        confirmUninstall.plugin.name,
        "\u300D\uFF1F"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "wt-sub", children: [
        "\u5C06\u8C03\u7528\u5BBF\u4E3B uninstall\uFF08\u5148\u7EC8\u6B62\u76F8\u5173\u8FDB\u7A0B\u518D\u5220\u76EE\u5F55\uFF09\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u9006\uFF0C\u5378\u8F7D\u540E\u9700\u8981\u91CD\u65B0\u5B89\u88C5\u3002",
        confirmUninstall.plugin.builtin ? "\u8FD9\u662F\u5185\u7F6E\u63D2\u4EF6\uFF0C\u5B9E\u9645\u4E0A\u5BBF\u4E3B\u4F1A\u62D2\u7EDD\u3002" : ""
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "wt-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx("button", { className: "wt-btn danger", disabled: !!opBusy, onClick: () => onUninstall(confirmUninstall), children: "\u786E\u8BA4\u5378\u8F7D" }),
        /* @__PURE__ */ jsx("button", { className: "wt-btn ghost", disabled: !!opBusy, onClick: () => setConfirmUninstall(null), children: "\u53D6\u6D88" })
      ] })
    ] }) }) : null
  ] });
}
function AboutTab() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "wt-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wt-bar" }),
      "\u8BA1\u91CF\u53E3\u5F84",
      /* @__PURE__ */ jsx("span", { className: "wt-hint", children: "\u5982\u5B9E\u4EA4\u4EE3" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wt-card", children: /* @__PURE__ */ jsx("div", { className: "wt-card-b", children: /* @__PURE__ */ jsxs("div", { className: "wt-about", children: [
      /* @__PURE__ */ jsx("b", { children: "\u672C\u63D2\u4EF6\u7EDF\u8BA1\u4EC0\u4E48" }),
      /* @__PURE__ */ jsxs("ul", { children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("b", { children: "AI \u7ECF\u672C\u63D2\u4EF6 MCP \u5DE5\u5177\u8C03\u7528" }),
          "\uFF1A\u6BCF\u6B21 watchtower_* \u5DE5\u5177\u8C03\u7528\u81EA\u52A8 +1\uFF08source=mcp\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("b", { children: "\u{1F52D} \u9762\u677F\u81EA\u8EAB\u6253\u5F00" }),
          "\uFF1A\u672C\u9762\u677F\u6253\u5F00\u4E00\u6B21\u8BB0 +1\uFF08source=panel\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("b", { children: "\u5176\u5B83\u63D2\u4EF6\u7684\u7528\u91CF" }),
          "\uFF1A\u4EC5\u5F53 AI \u4E3B\u52A8\u7528 ",
          /* @__PURE__ */ jsx("code", { children: "watchtower_report_usage" }),
          " \u8865\u8BB0\u65F6\u624D\u8BA1\u5165\u2014\u2014\u5BBF\u4E3B\u76EE\u524D",
          /* @__PURE__ */ jsx("b", { children: "\u4E0D\u5E7F\u64AD" }),
          "\u5176\u5B83\u63D2\u4EF6\u5DE5\u5177/\u9762\u677F\u4E8B\u4EF6\uFF0C\u6240\u4EE5\u9ED8\u8BA4\u4E0D\u8986\u76D6\u3002"
        ] })
      ] }),
      /* @__PURE__ */ jsx("b", { children: "\u4E0D\u5439\u7684\u8FB9\u754C" }),
      /* @__PURE__ */ jsxs("ul", { children: [
        /* @__PURE__ */ jsxs("li", { children: [
          "\u7EDF\u8BA1\u662F",
          /* @__PURE__ */ jsx("b", { children: "\u89C2\u6D4B\u91CF" }),
          "\uFF0C\u4E0D\u662F\u5BBF\u4E3B\u6743\u5A01\u5BA1\u8BA1\uFF1A\u6539\u7ED5\u8FC7\u672C\u63D2\u4EF6\u5165\u53E3\u7684\u4F7F\u7528\u4F1A\u88AB\u6F0F\u8BB0\uFF08\u5982\u5B9E\uFF0C\u4E0D\u4F2A\u88C5\u5168\u91CF\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "\u670D\u52A1\u72B6\u6001\u6765\u81EA\u5BBF\u4E3B ",
          /* @__PURE__ */ jsx("code", { children: "cap.pluginServiceManager" }),
          "\uFF0C\u53EA\u7ED9 running/exited\u3001\u7AEF\u53E3\u3001pid\u3001uptime\u3001\u91CD\u542F\u6B21\u6570\u3001\u6700\u8FD1\u9519\u8BEF\uFF0C",
          /* @__PURE__ */ jsx("b", { children: "\u65E0 CPU/\u5185\u5B58\u6307\u6807" }),
          "\u3002"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "\u505C\u7528/\u5378\u8F7D\u7B49\u5199\u64CD\u4F5C\u53EA\u505A",
          /* @__PURE__ */ jsx("b", { children: "\u5355\u63D2\u4EF6\u7EA7" }),
          "\uFF1B\u6279\u91CF\u7BA1\u7406\u5EFA\u8BAE\u53BB\u5BBF\u4E3B\u8BBE\u7F6E\uFF0C\u7981\u6BD2\u8D8A\u6743\u3002"
        ] })
      ] })
    ] }) }) })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function WatchtowerEntry(props) {
  return /* @__PURE__ */ jsx2(WatchtowerPanel, { ...props });
}
export {
  WatchtowerEntry as default
};
