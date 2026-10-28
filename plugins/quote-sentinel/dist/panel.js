var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  ALERT_TYPE_OPTIONS: () => ALERT_TYPE_OPTIONS,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  K: () => K,
  describeAlert: () => describeAlert,
  fetchQuotesNow: () => fetchQuotesNow,
  fmtAmountWan: () => fmtAmountWan,
  fmtNum: () => fmtNum,
  fmtQuoteTime: () => fmtQuoteTime,
  fmtVolumeHand: () => fmtVolumeHand,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet,
  listServiceStatus: () => listServiceStatus,
  loadMinuteViaService: () => loadMinuteViaService,
  loadReadAt: () => loadReadAt,
  loadSnapshot: () => loadSnapshot,
  markFeedRead: () => markFeedRead,
  normalizeCode: () => normalizeCode,
  removeAlert: () => removeAlert,
  removeWatch: () => removeWatch,
  saveAlert: () => saveAlert,
  savePosition: () => savePosition,
  saveSettings: () => saveSettings,
  saveWatch: () => saveWatch,
  searchWithService: () => searchWithService,
  serviceAction: () => serviceAction,
  timeAgo: () => timeAgo,
  uid: () => uid
});
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
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return "a" + c.randomUUID().replace(/-/g, "").slice(0, 10);
  return "a" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
async function loadSnapshot(readAt = 0) {
  const keys = await kvKeys();
  const watchIds = keys.filter((k) => k.startsWith("qsent.watch.")).map((k) => k.slice("qsent.watch.".length));
  const alertIds = keys.filter((k) => k.startsWith("qsent.alert.") && k !== K.alertFeed).map((k) => k.slice("qsent.alert.".length));
  const [defs, states, positions, alerts, feed, meta, settings] = await Promise.all([
    Promise.all(watchIds.map((id) => kvGet(K.watch(id)))),
    Promise.all(watchIds.map((id) => kvGet(K.state(id)))),
    Promise.all(watchIds.map((id) => kvGet(K.position(id)))),
    Promise.all(alertIds.map((aid) => kvGet(K.alert(aid)))),
    kvGet(K.alertFeed),
    kvGet(K.meta),
    kvGet(K.settings)
  ]);
  const validAlerts = alerts.filter((a) => !!a && typeof a === "object" && typeof a.id === "string");
  const idxList = settings && Array.isArray(settings.indexes) && settings.indexes.length ? settings.indexes : DEFAULT_SETTINGS.indexes;
  const idxStates = await Promise.all(idxList.map((id) => kvGet(K.state(id)).catch(() => null)));
  const rows = watchIds.map((id, i) => ({
    def: defs[i],
    state: states[i] ?? void 0,
    position: positions[i] ?? void 0,
    alertCount: validAlerts.filter((a) => a.code === id && a.enabled !== false).length
  })).filter((r) => r.def && typeof r.def === "object").sort((a, b) => (a.def.createdAt || 0) - (b.def.createdAt || 0));
  let newCount = 0;
  if (readAt > 0) {
    for (const f of feed ?? []) if (f && f.at > readAt) newCount++;
  }
  return {
    rows,
    indexes: idxList.map((id, i) => ({ id, state: idxStates[i] ?? void 0 })),
    meta,
    settings: { ...DEFAULT_SETTINGS, ...settings && typeof settings === "object" ? settings : {} },
    alerts: validAlerts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    feed: (feed ?? []).filter((f) => f && typeof f === "object"),
    newCount
  };
}
async function loadReadAt() {
  const v = await kvGet(K.readAt);
  return typeof v === "number" ? v : 0;
}
function normalizeCode(input) {
  const raw = String(input || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return { error: "\u8BF7\u8F93\u5165\u4EE3\u7801\uFF08\u5982 600519 / 510300\uFF09\u6216\u5E26\u524D\u7F00\uFF08\u5982 sh000001\uFF09" };
  const m = raw.match(/^(sh|sz|bj)?(\d{6})$/);
  if (!m) return { error: "\u65E0\u6CD5\u8BC6\u522B\uFF1A" + raw + "\uFF086 \u4F4D\u6570\u5B57\uFF0C\u53EF\u5E26 sh/sz/bj \u524D\u7F00\uFF1B\u6309\u540D\u79F0\u8BF7\u7528\u641C\u7D22\uFF09" };
  const code = m[2];
  if (m[1]) return { id: m[1] + code, code, market: m[1] };
  const p2 = code.slice(0, 2);
  const p3 = code.slice(0, 3);
  let market = null;
  if (["600", "601", "603", "605", "688", "689"].includes(p3) || ["51", "56", "58", "50"].includes(p2)) market = "sh";
  else if (["00", "30"].includes(p2) || ["12", "15", "16", "18"].includes(p2)) market = "sz";
  else if (["43", "83", "87", "92"].includes(p2)) market = "bj";
  if (!market) return { error: `\u65E0\u6CD5\u63A8\u65AD ${code} \u6240\u5C5E\u5E02\u573A\uFF08\u53EF\u5E26\u524D\u7F00\u91CD\u8BD5\uFF09` };
  return { id: market + code, code, market };
}
async function saveWatch(def) {
  await kvSet(K.watch(def.id), def);
}
async function removeWatch(id) {
  await Promise.all([
    kvDel(K.watch(id)),
    kvDel(K.state(id)).catch(() => {
    }),
    kvDel(K.minute(id)).catch(() => {
    }),
    kvDel(K.position(id)).catch(() => {
    })
  ]);
}
async function savePosition(id, cost, shares) {
  if (cost > 0 && shares > 0) {
    await kvSet(K.position(id), { code: id, cost, shares, updatedAt: Date.now() });
  } else {
    await kvDel(K.position(id)).catch(() => {
    });
  }
}
async function saveAlert(a) {
  await kvSet(K.alert(a.id), a);
}
async function removeAlert(aid) {
  await kvDel(K.alert(aid));
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function markFeedRead(at) {
  await kvSet(K.readAt, at);
}
async function runServiceCommand(cmdKey, resultKey, payload, { timeoutMs = 15e3, pollMs = 1e3 } = {}) {
  await kvSet(cmdKey, { ...payload, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, pollMs));
    const r = await kvGet(resultKey).catch(() => null);
    if (r && typeof r === "object") {
      kvDel(resultKey).catch(() => {
      });
      kvDel(cmdKey).catch(() => {
      });
      return r;
    }
  }
  throw new Error("\u540E\u53F0\u670D\u52A1\u672A\u54CD\u5E94\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF1A\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u76D8\u54E8 \u67E5\u770B\u670D\u52A1\u72B6\u6001\uFF09");
}
async function searchWithService(q) {
  const nonce = uid().slice(1) + "s";
  const r = await runServiceCommand(
    K.cmdSearch(nonce),
    K.search(nonce),
    { q }
  );
  if (!r.ok) throw new Error(r.error || "\u641C\u7D22\u5931\u8D25");
  return r.results ?? [];
}
async function fetchQuotesNow(codes) {
  const nonce = uid().slice(1) + "q";
  return runServiceCommand(K.cmdQuote(nonce), K.quote(nonce), { codes });
}
async function loadMinuteViaService(id) {
  const cached = await kvGet(K.minute(id)).catch(() => null);
  const today = bjDate();
  if (cached && cached.ok && cached.date === today) return cached;
  const nonce = uid().slice(1) + "m";
  const r = await runServiceCommand(K.cmdMinute(id), K.minute(id), { op: "minute" }, { timeoutMs: 12e3 });
  return r;
}
function bjDate() {
  const d = new Date(Date.now() + 8 * 3600 * 1e3);
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
async function discoverSelf(pluginId) {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId);
  if (!self || !self.installPath) return null;
  const services = self.contributes?.services ?? [];
  return { installPath: self.installPath, services };
}
function toBackendContribution(c) {
  return {
    id: c.id,
    type: c.type ?? c.serviceType,
    command: c.command,
    argsTemplate: Array.isArray(c.argsTemplate) ? c.argsTemplate : [],
    port: c.port ?? null,
    healthCheck: c.healthCheck ?? null,
    healthCheckTimeout: c.healthCheckTimeout ?? null,
    autoStart: c.autoStart ?? true,
    restartOnFailure: c.restartOnFailure ?? true,
    maxRestarts: c.maxRestarts ?? 3,
    description: c.description ?? null
  };
}
async function serviceAction(action, pluginId, serviceId) {
  if (action === "start") {
    const self = await discoverSelf(pluginId);
    const svc = self?.services.find((s) => s.id === serviceId);
    if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u4E2D\u627E\u4E0D\u5230\u672C\u63D2\u4EF6\u7684\u670D\u52A1\u8D21\u732E\uFF08\u8BF7\u5237\u65B0\u63D2\u4EF6\u5217\u8868\u540E\u91CD\u8BD5\uFF09");
    await capDispatch("cap.pluginServiceManager", {
      action: "start",
      pluginId,
      installPath: self.installPath,
      contribution: toBackendContribution(svc)
    });
    return;
  }
  await capDispatch("cap.pluginServiceManager", { action, pluginId, serviceId });
}
function fmtNum(v, digits = 2) {
  if (v === null || v === void 0 || !Number.isFinite(Number(v))) return "\u2014";
  return Number(v).toFixed(digits);
}
function fmtAmountWan(wan) {
  const v = Number(wan);
  if (!Number.isFinite(v) || v <= 0) return "\u2014";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + " \u4EBF";
  return Math.round(v).toLocaleString("en-US") + " \u4E07";
}
function fmtVolumeHand(hand) {
  const v = Number(hand);
  if (!Number.isFinite(v) || v <= 0) return "\u2014";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + " \u767E\u4E07\u624B";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + " \u4E07\u624B";
  return Math.round(v) + " \u624B";
}
function fmtQuoteTime(ts) {
  const s = String(ts || "");
  if (!/^\d{14}$/.test(s)) return "\u2014";
  return `${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}
function timeAgo(ts) {
  if (!ts) return "\u4ECE\u672A";
  const d = Date.now() - ts;
  if (d < 15 * 1e3) return "\u521A\u521A";
  if (d < 60 * 1e3) return `${Math.floor(d / 1e3)} \u79D2\u524D`;
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function describeAlert(a) {
  const v = a.value;
  switch (a.type) {
    case "price_above":
      return `\u4EF7\u683C \u2265 ${v}`;
    case "price_below":
      return `\u4EF7\u683C \u2264 ${v}`;
    case "pct_above":
      return `\u6DA8\u5E45 \u2265 ${v}%`;
    case "pct_below":
      return `\u8DCC\u5E45 \u2265 ${Math.abs(v)}%\uFF08${v}%\uFF09`;
    default:
      return String(a.type);
  }
}
var K, DEFAULT_SETTINGS, ALERT_TYPE_OPTIONS;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    K = {
      watch: (id) => `qsent.watch.${id}`,
      state: (id) => `qsent.state.${id}`,
      minute: (id) => `qsent.minute.${id}`,
      cmdQuote: (n) => `qsent.cmd.quote.${n}`,
      quote: (n) => `qsent.quote.${n}`,
      cmdSearch: (n) => `qsent.cmd.search.${n}`,
      search: (n) => `qsent.search.${n}`,
      cmdMinute: (id) => `qsent.cmd.minute.${id}`,
      alert: (aid) => `qsent.alert.${aid}`,
      alertFeed: "qsent.alert.feed",
      position: (id) => `qsent.position.${id}`,
      settings: "qsent.settings",
      meta: "qsent.meta",
      readAt: "qsent.readAt"
    };
    DEFAULT_SETTINGS = {
      pollSec: 20,
      offHoursPollSec: 300,
      redUp: true,
      indexes: ["sh000001", "sz399001", "sz399006"]
    };
    ALERT_TYPE_OPTIONS = [
      { value: "price_above", label: "\u4EF7\u683C\u5347\u5230", ph: "\u5982 1350" },
      { value: "price_below", label: "\u4EF7\u683C\u8DCC\u5230", ph: "\u5982 1200" },
      { value: "pct_above", label: "\u6DA8\u5E45\u8FBE\u5230 %", ph: "\u5982 3" },
      { value: "pct_below", label: "\u8DCC\u5E45\u8FBE\u5230 %", ph: "\u5982 -3" }
    ];
  }
});

// src/Panel.tsx
init_model();
import { useCallback, useEffect, useState as useState4 } from "react";

// src/MarketTab.tsx
init_model();
import { useState } from "react";

// src/bits.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var UP_RED = "#F85149";
var DOWN_GREEN = "#3FB950";
var FLAT = "#8B95A7";
function colorFor(pct, redUp) {
  const p = Number(pct);
  if (!Number.isFinite(p) || p === 0) return FLAT;
  const up = p > 0;
  return up === redUp ? UP_RED : DOWN_GREEN;
}
function PctBadge({ pct, redUp, big }) {
  const p = Number(pct);
  const text = Number.isFinite(p) ? `${p > 0 ? "+" : ""}${p.toFixed(2)}%` : "\u2014";
  return /* @__PURE__ */ jsx(
    "span",
    {
      style: {
        background: colorFor(p, redUp) + "22",
        color: colorFor(p, redUp),
        border: `1px solid ${colorFor(p, redUp)}55`,
        borderRadius: 6,
        padding: big ? "2px 9px" : "1px 7px",
        fontSize: big ? 12.5 : 10,
        fontWeight: 700,
        whiteSpace: "nowrap"
      },
      children: text
    }
  );
}
function Sparkline({ points, prevClose, color, width = 300, height = 96 }) {
  if (!points.length) {
    return /* @__PURE__ */ jsx("div", { style: { color: "#5C6678", fontSize: 11, padding: "14px 0" }, children: "\u6682\u65E0\u5206\u65F6\u6570\u636E" });
  }
  const prices = points.map((p) => p.p);
  const lo = Math.min(...prices, prevClose ?? Infinity);
  const hi = Math.max(...prices, prevClose ?? -Infinity);
  const pad = (hi - lo) * 0.08 || hi * 2e-3 || 0.01;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const x = (i) => i / Math.max(points.length - 1, 1) * (width - 8) + 4;
  const y = (v) => height - 6 - (v - yMin) / (yMax - yMin) * (height - 12);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${height - 4} L${x(0).toFixed(1)},${height - 4} Z`;
  const base = prevClose !== null && Number.isFinite(prevClose) ? /* @__PURE__ */ jsx("line", { x1: 4, x2: width - 4, y1: y(prevClose), y2: y(prevClose), stroke: "#5C6678", strokeWidth: 1, strokeDasharray: "4 3" }) : null;
  return /* @__PURE__ */ jsxs("svg", { width: "100%", viewBox: `0 0 ${width} ${height}`, style: { display: "block" }, preserveAspectRatio: "none", children: [
    /* @__PURE__ */ jsx("path", { d: area, fill: color, fillOpacity: 0.1 }),
    base,
    /* @__PURE__ */ jsx("path", { d: path, fill: "none", stroke: color, strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" })
  ] });
}
function StatCell({ label, value, color }) {
  return /* @__PURE__ */ jsxs("div", { style: { minWidth: 0 }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 9.5, color: "#5C6678" }, children: label }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: color || "#C9D1D9", fontWeight: 600 }, children: value })
  ] });
}

// src/MarketTab.tsx
init_model();
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function MarketTab({ snap, busy, setBusy, reload, showToast }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const redUp = snap?.settings.redUp ?? true;
  async function doSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(null);
    try {
      const r = await searchWithService(q);
      setResults(r);
      if (!r.length) showToast("\u6CA1\u6709\u5339\u914D\u7ED3\u679C");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setSearching(false);
    }
  }
  async function addResult(r) {
    if (!r.tradable) {
      showToast(`\u300C${r.name}\u300D(${r.id}) \u6682\u4E0D\u652F\u6301\uFF1A${r.market === "hk" ? "\u6E2F\u80A1" : r.market === "jj" ? "\u573A\u5916\u57FA\u91D1" : "\u8BE5\u5E02\u573A"}\u884C\u60C5`, true);
      return;
    }
    try {
      await saveWatch({ id: r.id, code: r.code, market: r.market, name: r.name, createdAt: Date.now() });
      setResults(null);
      setQuery("");
      await reload();
      showToast(`\u5DF2\u6DFB\u52A0 ${r.name}(${r.id})`);
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function addDirect() {
    const r = normalizeCode(query);
    if (!r.id) {
      showToast(r.error || "\u65E0\u6CD5\u8BC6\u522B", true);
      return;
    }
    try {
      await saveWatch({ id: r.id, code: r.code, market: r.market, name: r.code, createdAt: Date.now() });
      setQuery("");
      await reload();
      showToast(`\u5DF2\u6DFB\u52A0 ${r.id}\uFF08\u540D\u79F0\u5C06\u968F\u9996\u6761\u884C\u60C5\u81EA\u52A8\u8865\u5168\uFF09`);
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function refreshNow() {
    if (!snap) return;
    const codes = [...snap.indexes.map((i) => i.id), ...snap.rows.map((r) => r.def.id)];
    if (!codes.length) return;
    setBusy(true);
    try {
      const r = await fetchQuotesNow(codes);
      if (!r.ok && !r.quotes?.length) throw new Error(r.error || "\u5237\u65B0\u5931\u8D25");
      showToast(r.source === "cache" ? `\u5B9E\u65F6\u6E90\u4E0D\u53EF\u7528\uFF0C\u5DF2\u663E\u793A\u7F13\u5B58\uFF1A${r.error || ""}` : `\u5DF2\u5237\u65B0\uFF08${r.source}\uFF09`, r.source === "cache");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: { padding: "6px 16px 10px" }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "qs-inp",
            placeholder: "\u4EE3\u7801\u6216\u540D\u79F0\uFF0C\u5982 600519 / \u8305\u53F0 / 510300 / sh000001",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") void doSearch();
            }
          }
        ),
        /* @__PURE__ */ jsx2("button", { className: "qs-btn", style: { flexShrink: 0 }, disabled: searching, onClick: () => void doSearch(), children: searching ? /* @__PURE__ */ jsx2("span", { className: "qs-spin" }) : "\u641C\u7D22" })
      ] }),
      results && results.length > 0 && /* @__PURE__ */ jsx2("div", { style: { marginTop: 8, border: "1px solid #242C3A", borderRadius: 10, overflow: "hidden" }, children: results.slice(0, 12).map((r) => /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", background: "#161B22", borderBottom: "1px solid #1E2530" }, children: [
        /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: [
            r.name,
            " ",
            /* @__PURE__ */ jsx2("span", { style: { color: "#5C6678", fontWeight: 400, fontSize: 10.5 }, children: r.id })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "qs-sub", children: [
            r.tradable ? "\u53EF\u884C\u60C5" : r.market === "hk" ? "\u6E2F\u80A1\uFF08\u6682\u4E0D\u652F\u6301\uFF09" : r.market === "jj" ? "\u573A\u5916\u57FA\u91D1\uFF08\u6682\u4E0D\u652F\u6301\uFF09" : "\u6682\u4E0D\u652F\u6301",
            " \xB7 ",
            r.type || "\u672A\u77E5\u7C7B\u578B"
          ] })
        ] }),
        r.tradable && /* @__PURE__ */ jsx2("button", { className: "qs-btn sm", onClick: () => void addResult(r), children: "\u52A0\u81EA\u9009" })
      ] }, r.id + r.name)) }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "qs-btn ghost sm", disabled: busy || !snap?.rows.length, onClick: () => void refreshNow(), children: busy ? "\u5237\u65B0\u4E2D\u2026" : "\u7ACB\u5373\u5237\u65B0" }),
        /* @__PURE__ */ jsx2("button", { className: "qs-btn ghost sm", onClick: () => void addDirect(), children: "\u6309\u4EE3\u7801\u76F4\u63A5\u6DFB\u52A0" })
      ] })
    ] }),
    snap && snap.indexes.length > 0 && /* @__PURE__ */ jsx2("div", { className: "qs-idx", children: snap.indexes.map(({ id, state }) => /* @__PURE__ */ jsxs2("div", { className: "qs-idx-chip", children: [
      /* @__PURE__ */ jsx2("div", { className: "n", children: state?.name || id }),
      /* @__PURE__ */ jsx2("div", { className: "v", style: { color: colorFor(state?.pct, redUp) }, children: fmtNum(state?.price) }),
      /* @__PURE__ */ jsx2("div", { className: "p", style: { color: colorFor(state?.pct, redUp) }, children: state ? `${state.pct > 0 ? "+" : ""}${state.pct.toFixed(2)}%` : "\u2014" })
    ] }, id)) }),
    /* @__PURE__ */ jsxs2("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "qs-bar" }),
      "\u81EA\u9009",
      snap ? ` ${snap.rows.length}` : "",
      /* @__PURE__ */ jsx2("span", { className: "qs-hint", children: "\u70B9\u51FB\u884C\u5C55\u5F00\u8BE6\u60C5" })
    ] }),
    !snap?.rows.length && /* @__PURE__ */ jsxs2("div", { className: "qs-empty", children: [
      "\u8FD8\u6CA1\u6709\u81EA\u9009\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u641C\u7D22\u300C\u8305\u53F0\u300D\u300C510300\u300D\u6216\u8F93\u5165\u4EE3\u7801\u6DFB\u52A0\uFF0C",
      /* @__PURE__ */ jsx2("br", {}),
      "\u6DFB\u52A0\u540E\u540E\u53F0\u670D\u52A1\u4F1A\u81EA\u52A8\u5F00\u59CB\u8DDF\u8E2A\u884C\u60C5\u3002"
    ] }),
    snap?.rows.map((row) => /* @__PURE__ */ jsx2(
      WatchCard,
      {
        row,
        alerts: snap.alerts,
        redUp,
        expanded: expanded === row.def.id,
        onToggle: () => setExpanded(expanded === row.def.id ? null : row.def.id),
        reload,
        showToast
      },
      row.def.id
    ))
  ] });
}
function WatchCard({ row, alerts, redUp, expanded, onToggle, reload, showToast }) {
  const { def, state } = row;
  const c = colorFor(state?.pct, redUp);
  let pnl = null;
  if (state && row.position && row.position.shares > 0) {
    pnl = (state.price - row.position.cost) * row.position.shares;
  }
  return /* @__PURE__ */ jsxs2("div", { className: "qs-card", children: [
    /* @__PURE__ */ jsxs2("div", { className: "qs-row", onClick: onToggle, children: [
      /* @__PURE__ */ jsxs2("div", { className: "qs-name", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          state?.name || def.name || def.id,
          row.alertCount > 0 && /* @__PURE__ */ jsxs2("span", { className: "qs-bell", title: `${row.alertCount} \u6761\u63D0\u9192\u751F\u6548\u4E2D`, children: [
            "\u{1F514}",
            row.alertCount
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("small", { children: [
          def.id,
          def.note ? ` \xB7 ${def.note}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "qs-price", children: [
        /* @__PURE__ */ jsx2("b", { style: { color: c }, children: fmtNum(state?.price) }),
        /* @__PURE__ */ jsx2("span", { className: "qs-chg", style: { color: c }, children: state ? `${state.chg > 0 ? "+" : ""}${state.chg.toFixed(2)}  ` : "" })
      ] }),
      /* @__PURE__ */ jsx2(PctBadge, { pct: state?.pct, redUp, big: true })
    ] }),
    expanded && /* @__PURE__ */ jsx2(
      Detail,
      {
        row,
        alerts,
        redUp,
        reload,
        showToast
      }
    )
  ] });
}
function Detail({ row, alerts, redUp, reload, showToast }) {
  const { def, state } = row;
  const [minute, setMinute] = useState(null);
  const [loadingMinute, setLoadingMinute] = useState(false);
  const [cost, setCost] = useState(row.position ? String(row.position.cost) : "");
  const [shares, setShares] = useState(row.position ? String(row.position.shares) : "");
  const [alertType, setAlertType] = useState("price_above");
  const [alertValue, setAlertValue] = useState("");
  async function loadMinute() {
    setLoadingMinute(true);
    try {
      const m = await loadMinuteViaService(def.id);
      setMinute(m);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setLoadingMinute(false);
    }
  }
  if (!minute && !loadingMinute) void loadMinute();
  const color = colorFor(state?.pct, redUp);
  const ph = ALERT_TYPE_OPTIONS.find((o) => o.value === alertType)?.ph || "";
  async function savePos() {
    const c = Number(cost);
    const s = Number(shares);
    try {
      await savePosition(def.id, c, s);
      await reload();
      showToast(c > 0 && s > 0 ? "\u6301\u4ED3\u5DF2\u4FDD\u5B58" : "\u6301\u4ED3\u5DF2\u6E05\u9664");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function addAlert() {
    const v = Number(alertValue);
    if (!Number.isFinite(v) || v === 0) {
      showToast("\u8BF7\u586B\u5199\u6709\u6548\u7684\u63D0\u9192\u9608\u503C", true);
      return;
    }
    if (alertType === "pct_above" && v < 0 || alertType === "pct_below" && v > 0) {
      showToast("\u6DA8\u5E45\u9608\u503C\u5E94\u4E3A\u6B63\u6570\uFF0C\u8DCC\u5E45\u9608\u503C\u5E94\u4E3A\u8D1F\u6570\uFF08\u5982 -3\uFF09", true);
      return;
    }
    try {
      const existing = alerts.find((a) => a.code === def.id && a.type === alertType);
      const alertId = existing ? existing.id : uid();
      await saveAlert({ id: alertId, code: def.id, type: alertType, value: +v.toFixed(4), enabled: true, createdAt: existing?.createdAt || Date.now() });
      setAlertValue("");
      await reload();
      showToast(existing ? "\u540C\u7C7B\u578B\u63D0\u9192\u5DF2\u66F4\u65B0" : "\u63D0\u9192\u5DF2\u521B\u5EFA\uFF08\u6BCF\u4E2A\u4EA4\u6613\u65E5\u6700\u591A\u89E6\u53D1\u4E00\u6B21\uFF09");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function doRemove() {
    try {
      await removeWatch(def.id);
      await reload();
      showToast(`\u5DF2\u79FB\u9664 ${def.id}`);
    } catch (e) {
      showToast(e.message, true);
    }
  }
  return /* @__PURE__ */ jsxs2("div", { className: "qs-detail", children: [
    loadingMinute && /* @__PURE__ */ jsxs2("div", { className: "qs-sub", children: [
      /* @__PURE__ */ jsx2("span", { className: "qs-spin" }),
      " \u5206\u65F6\u52A0\u8F7D\u4E2D\u2026"
    ] }),
    minute && !loadingMinute && (minute.ok === false || !minute.points?.length ? /* @__PURE__ */ jsx2("div", { className: "qs-sub", children: minute.error || "\u6682\u65E0\u5206\u65F6\u6570\u636E" }) : /* @__PURE__ */ jsx2(Sparkline, { points: minute.points, prevClose: minute.prevClose ?? state?.prevClose ?? null, color })),
    /* @__PURE__ */ jsxs2("div", { className: "qs-grid", children: [
      /* @__PURE__ */ jsx2(StatCell, { label: "\u4ECA\u5F00", value: fmtNum(state?.open) }),
      /* @__PURE__ */ jsx2(StatCell, { label: "\u6628\u6536", value: fmtNum(state?.prevClose) }),
      /* @__PURE__ */ jsx2(StatCell, { label: "\u6700\u9AD8", value: fmtNum(state?.high), color: colorFor(state?.high && state.prevClose ? state.high - state.prevClose : null, redUp) }),
      /* @__PURE__ */ jsx2(StatCell, { label: "\u6700\u4F4E", value: fmtNum(state?.low), color: colorFor(state?.low && state.prevClose ? state.low - state.prevClose : null, redUp) }),
      /* @__PURE__ */ jsx2(StatCell, { label: "\u6210\u4EA4\u91CF", value: fmtVolumeHand(state?.volume) }),
      /* @__PURE__ */ jsx2(StatCell, { label: "\u6210\u4EA4\u989D", value: fmtAmountWan(state?.amount) }),
      state?.turnover != null && /* @__PURE__ */ jsx2(StatCell, { label: "\u6362\u624B", value: `${state.turnover}%` }),
      state?.mktcap != null && state.mktcap > 0 && /* @__PURE__ */ jsx2(StatCell, { label: "\u603B\u5E02\u503C", value: `${state.mktcap} \u4EBF` })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "qs-sub", style: { marginTop: 6 }, children: [
      "\u884C\u60C5\u65F6\u95F4 ",
      fmtQuoteTime(state?.time),
      " \xB7 \u6570\u636E\u6E90 ",
      state?.source || "\u2014"
    ] }),
    state && row.position && /* @__PURE__ */ jsxs2("div", { className: "qs-sub", style: { marginTop: 4, color: pnlColor(state.price - row.position.cost, redUp) }, children: [
      "\u6301\u4ED3 ",
      row.position.shares,
      " @ \u6210\u672C ",
      row.position.cost,
      " \xB7 \u6D6E\u52A8\u76C8\u4E8F",
      " ",
      ((state.price - row.position.cost) * row.position.shares).toFixed(2),
      "\uFF08",
      ((state.price - row.position.cost) / row.position.cost * 100).toFixed(2),
      "%\uFF09"
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "qs-lbl", children: "\u6301\u4ED3\u6210\u672C\uFF08\u7528\u4E8E\u76C8\u4E8F\u663E\u793A\uFF0C\u7559\u7A7A\u6E05\u9664\uFF09" }),
    /* @__PURE__ */ jsxs2("div", { className: "qs-formrow", children: [
      /* @__PURE__ */ jsx2("input", { className: "qs-inp sm", placeholder: "\u6210\u672C\u4EF7", value: cost, onChange: (e) => setCost(e.target.value), inputMode: "decimal" }),
      /* @__PURE__ */ jsx2("input", { className: "qs-inp sm", placeholder: "\u6570\u91CF(\u80A1)", value: shares, onChange: (e) => setShares(e.target.value), inputMode: "numeric" }),
      /* @__PURE__ */ jsx2("button", { className: "qs-btn sm", onClick: () => void savePos(), children: "\u4FDD\u5B58" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "qs-lbl", children: "\u5FEB\u6377\u63D0\u9192\uFF08\u6BCF\u4EA4\u6613\u65E5\u5355\u6B21\u89E6\u53D1\uFF09" }),
    /* @__PURE__ */ jsxs2("div", { className: "qs-formrow", children: [
      /* @__PURE__ */ jsx2("select", { className: "qs-sel", value: alertType, onChange: (e) => setAlertType(e.target.value), children: ALERT_TYPE_OPTIONS.map((o) => /* @__PURE__ */ jsx2("option", { value: o.value, children: o.label }, o.value)) }),
      /* @__PURE__ */ jsx2("input", { className: "qs-inp sm", placeholder: ph, value: alertValue, onChange: (e) => setAlertValue(e.target.value), inputMode: "decimal" }),
      /* @__PURE__ */ jsx2("button", { className: "qs-btn sm", onClick: () => void addAlert(), children: "\u521B\u5EFA" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "qs-formrow", children: [
      /* @__PURE__ */ jsx2("button", { className: "qs-btn danger sm", onClick: () => void doRemove(), children: "\u79FB\u9664\u81EA\u9009" }),
      /* @__PURE__ */ jsx2("span", { className: "qs-sub", children: "\u4E0D\u4F1A\u5220\u9664\u8BE5\u6807\u7684\u7684\u63D0\u9192\u89C4\u5219" })
    ] })
  ] });
}
function pnlColor(diff, redUp) {
  if (!Number.isFinite(diff) || diff === 0) return "#8B95A7";
  return diff > 0 === redUp ? "#F85149" : "#3FB950";
}

// src/AlertsTab.tsx
init_model();
import { useState as useState2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function AlertsTab({ snap, reload, showToast }) {
  const [code, setCode] = useState2("");
  const [type, setType] = useState2("price_above");
  const [value, setValue] = useState2("");
  const [note, setNote] = useState2("");
  const watches = snap?.rows ?? [];
  const alerts = snap?.alerts ?? [];
  const feed = snap?.feed ?? [];
  const nameOf = (id) => watches.find((w) => w.def.id === id)?.state?.name || watches.find((w) => w.def.id === id)?.def.name || id;
  async function addRule() {
    const norm = code.trim();
    if (!norm) {
      showToast("\u8BF7\u5148\u5728\u884C\u60C5\u9875\u6DFB\u52A0\u81EA\u9009\uFF0C\u518D\u4E3A\u5176\u5EFA\u63D0\u9192", true);
      return;
    }
    const v = Number(value);
    if (!Number.isFinite(v) || v === 0) {
      showToast("\u8BF7\u586B\u5199\u6709\u6548\u9608\u503C", true);
      return;
    }
    if (type === "pct_above" && v < 0 || type === "pct_below" && v > 0) {
      showToast("\u6DA8\u5E45\u9608\u503C\u5E94\u4E3A\u6B63\u6570\uFF0C\u8DCC\u5E45\u9608\u503C\u5E94\u4E3A\u8D1F\u6570\uFF08\u5982 -3\uFF09", true);
      return;
    }
    try {
      const existing = alerts.find((a) => a.code === norm && a.type === type);
      const id = existing ? existing.id : uid();
      const rule = {
        id,
        code: norm,
        type,
        value: +v.toFixed(4),
        enabled: true,
        createdAt: existing?.createdAt || Date.now()
      };
      if (note.trim()) rule.note = note.trim().slice(0, 120);
      await saveAlert(rule);
      setValue("");
      setNote("");
      await reload();
      showToast(existing ? "\u540C\u7C7B\u578B\u63D0\u9192\u5DF2\u66F4\u65B0" : "\u63D0\u9192\u5DF2\u521B\u5EFA");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function toggle(a) {
    try {
      await saveAlert({ ...a, enabled: a.enabled === false });
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function del(a) {
    try {
      await removeAlert(a.id);
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "qs-bar" }),
      "\u65B0\u5EFA\u63D0\u9192",
      /* @__PURE__ */ jsx3("span", { className: "qs-hint", children: "\u76D8\u4E2D\u81EA\u52A8\u8BC4\u4F30\uFF0C\u6BCF\u4EA4\u6613\u65E5\u5355\u6B21\u89E6\u53D1" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "qs-card", children: /* @__PURE__ */ jsxs3("div", { style: { padding: "10px 13px" }, children: [
      /* @__PURE__ */ jsx3("label", { className: "qs-lbl", children: "\u6807\u7684\uFF08\u81EA\u9009\u4EE3\u7801\uFF09" }),
      watches.length ? /* @__PURE__ */ jsxs3("select", { className: "qs-sel", style: { width: "100%" }, value: code, onChange: (e) => setCode(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009\u62E9\u81EA\u9009\u2026" }),
        watches.map((w) => /* @__PURE__ */ jsxs3("option", { value: w.def.id, children: [
          w.def.id,
          " ",
          w.state?.name || w.def.name
        ] }, w.def.id))
      ] }) : /* @__PURE__ */ jsx3("div", { className: "qs-sub", children: "\u8FD8\u6CA1\u6709\u81EA\u9009\u6807\u7684\u2014\u2014\u5148\u5230\u300C\u884C\u60C5\u300D\u9875\u6DFB\u52A0\uFF0C\u518D\u56DE\u6765\u5EFA\u63D0\u9192\u3002" }),
      /* @__PURE__ */ jsxs3("div", { className: "qs-formrow", children: [
        /* @__PURE__ */ jsx3("select", { className: "qs-sel", value: type, onChange: (e) => setType(e.target.value), children: ALERT_TYPE_OPTIONS.map((o) => /* @__PURE__ */ jsx3("option", { value: o.value, children: o.label }, o.value)) }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "qs-inp sm",
            placeholder: ALERT_TYPE_OPTIONS.find((o) => o.value === type)?.ph,
            value,
            onChange: (e) => setValue(e.target.value),
            inputMode: "decimal"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "qs-formrow", children: [
        /* @__PURE__ */ jsx3("input", { className: "qs-inp", placeholder: "\u5907\u6CE8\uFF08\u53EF\u9009\uFF0C\u5982\u300C\u51CF\u4ED3\u4F4D\u300D\u300C\u5173\u6CE8\u7A81\u7834\u300D\uFF09", value: note, onChange: (e) => setNote(e.target.value) }),
        /* @__PURE__ */ jsx3("button", { className: "qs-btn", style: { flexShrink: 0 }, onClick: () => void addRule(), children: "\u521B\u5EFA" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "qs-bar" }),
      "\u89C4\u5219 ",
      alerts.length
    ] }),
    !alerts.length && /* @__PURE__ */ jsxs3("div", { className: "qs-empty", children: [
      "\u6682\u65E0\u63D0\u9192\u89C4\u5219\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u793A\u4F8B\uFF1A\u8D35\u5DDE\u8305\u53F0 \u4EF7\u683C\u5347\u5230 1350 \u2192 \u51CF\u4ED3\u63D0\u9192\u3002"
    ] }),
    alerts.map((a) => /* @__PURE__ */ jsx3("div", { className: "qs-card", children: /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 13px" }, children: [
      /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { fontSize: 12.5, fontWeight: 600 }, children: [
          /* @__PURE__ */ jsxs3("span", { style: { color: a.enabled === false ? "#5C6678" : void 0 }, children: [
            nameOf(a.code),
            " ",
            describeAlert(a)
          ] }),
          a.enabled === false && /* @__PURE__ */ jsx3("span", { className: "qs-tag", style: { marginLeft: 6 }, children: "\u5DF2\u6682\u505C" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "qs-sub", children: [
          a.code,
          a.note ? ` \xB7 ${a.note}` : "",
          a.lastFiredDate ? ` \xB7 \u4E0A\u6B21\u89E6\u53D1 ${a.lastFiredDate.slice(4, 6)}-${a.lastFiredDate.slice(6, 8)}` : " \xB7 \u4ECE\u672A\u89E6\u53D1"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "qs-btn ghost sm", onClick: () => void toggle(a), children: a.enabled === false ? "\u542F\u7528" : "\u6682\u505C" }),
      /* @__PURE__ */ jsx3("button", { className: "qs-btn danger sm", onClick: () => void del(a), children: "\u5220\u9664" })
    ] }) }, a.id)),
    /* @__PURE__ */ jsxs3("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "qs-bar" }),
      "\u89E6\u53D1\u5386\u53F2 ",
      feed.length,
      /* @__PURE__ */ jsx3("span", { className: "qs-hint", children: "\u6700\u591A\u4FDD\u7559 100 \u6761" })
    ] }),
    !feed.length && /* @__PURE__ */ jsx3("div", { className: "qs-empty", children: "\u8FD8\u6CA1\u6709\u89E6\u53D1\u8BB0\u5F55\u3002" }),
    feed.slice(0, 30).map((f, i) => /* @__PURE__ */ jsxs3("div", { style: {
      borderLeft: `2px solid ${f.price != null && f.pct != null && f.pct >= 0 ? "#F85149" : "#3FB950"}`,
      padding: "7px 12px",
      margin: "0 16px 7px",
      background: "#141821",
      borderRadius: "0 10px 10px 0"
    }, children: [
      /* @__PURE__ */ jsx3("div", { style: { fontSize: 12.5, color: "#C9D1D9" }, children: f.msg || `${f.code} \u63D0\u9192\u89E6\u53D1` }),
      /* @__PURE__ */ jsxs3("div", { className: "qs-sub", children: [
        new Date(f.at).toLocaleString("zh-CN", { hour12: false }),
        f.price != null ? ` \xB7 \u89E6\u53D1\u65F6\u4EF7 ${fmtNum(f.price)}` : "",
        f.alertId ? ` \xB7 [${f.alertId}]` : ""
      ] })
    ] }, `${f.at}-${f.alertId}-${i}`))
  ] });
}

// src/SettingsTab.tsx
init_model();
import { useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ snap, reload, showToast, pluginId }) {
  const [pollSec, setPollSec] = useState3(String(snap?.settings.pollSec ?? 20));
  const [offHours, setOffHours] = useState3(String(snap?.settings.offHoursPollSec ?? 300));
  const [redUp, setRedUp] = useState3(snap?.settings.redUp ?? true);
  const [indexes, setIndexes] = useState3((snap?.settings.indexes ?? []).join(", "));
  const [saving, setSaving] = useState3(false);
  const [svc, setSvc] = useState3(null);
  const [svcBusy, setSvcBusy] = useState3(false);
  async function save() {
    const ps = Number(pollSec);
    const oh = Number(offHours);
    if (!Number.isFinite(ps) || ps < 10 || ps > 300) {
      showToast("\u76D8\u4E2D\u8F6E\u8BE2\u95F4\u9694\u9700\u5728 10\u2013300 \u79D2", true);
      return;
    }
    if (!Number.isFinite(oh) || oh < 60 || oh > 3600) {
      showToast("\u76D8\u5916\u8F6E\u8BE2\u95F4\u9694\u9700\u5728 60\u20133600 \u79D2", true);
      return;
    }
    const idxList = [];
    for (const part of indexes.split(/[,，;；\s]+/).filter(Boolean)) {
      const r = normalizeCode(part);
      if (!r.id) {
        showToast(`\u6307\u6570\u6761\u8BBE\u7F6E\u6709\u8BEF\uFF1A${r.error}`, true);
        return;
      }
      if (!idxList.includes(r.id)) idxList.push(r.id);
    }
    if (idxList.length > 8) {
      showToast("\u6307\u6570\u6761\u6700\u591A 8 \u4E2A", true);
      return;
    }
    setSaving(true);
    try {
      const s = { pollSec: Math.floor(ps), offHoursPollSec: Math.floor(oh), redUp, indexes: idxList };
      await saveSettings(s);
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u5C06\u5728 5 \u79D2\u5185\u751F\u6548\uFF09");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setSaving(false);
    }
  }
  async function loadSvc() {
    try {
      const list = await listServiceStatus();
      setSvc(list.filter((s) => s.pluginId === pluginId));
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function svcAction(action) {
    setSvcBusy(true);
    try {
      await serviceAction(action, pluginId, "quotes-service");
      showToast(`\u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}\u670D\u52A1`);
      setTimeout(() => {
        void loadSvc();
        void reload();
      }, 1500);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setSvcBusy(false);
    }
  }
  const meta = snap?.meta;
  const mySvc = svc?.find((s) => s.pluginId === pluginId);
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qs-bar" }),
      "\u8F6E\u8BE2\u4E0E\u663E\u793A"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qs-card", children: /* @__PURE__ */ jsxs4("div", { style: { padding: "10px 13px" }, children: [
      /* @__PURE__ */ jsx4("label", { className: "qs-lbl", children: "\u76D8\u4E2D\u8F6E\u8BE2\u95F4\u9694\uFF08\u79D2\uFF0C10\u2013300\uFF1B\u9ED8\u8BA4 20\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "qs-inp sm", value: pollSec, onChange: (e) => setPollSec(e.target.value), inputMode: "numeric" }),
      /* @__PURE__ */ jsx4("label", { className: "qs-lbl", children: "\u76D8\u5916\u8F6E\u8BE2\u95F4\u9694\uFF08\u79D2\uFF0C60\u20133600\uFF1B\u9ED8\u8BA4 300\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "qs-inp sm", value: offHours, onChange: (e) => setOffHours(e.target.value), inputMode: "numeric" }),
      /* @__PURE__ */ jsxs4("label", { className: "qs-lbl", style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: redUp, onChange: (e) => setRedUp(e.target.checked) }),
        "\u7EA2\u6DA8\u7EFF\u8DCC\uFF08A \u80A1\u4E60\u60EF\uFF1B\u53D6\u6D88\u5219\u7EFF\u6DA8\u7EA2\u8DCC\uFF0C\u6E2F\u7F8E\u4E60\u60EF\uFF09"
      ] }),
      /* @__PURE__ */ jsx4("label", { className: "qs-lbl", children: "\u6307\u6570\u6761\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u6700\u591A 8 \u4E2A\uFF1B\u6307\u6570\u4EE3\u7801\u9700\u5E26 sh/sz \u524D\u7F00\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "qs-inp", value: indexes, onChange: (e) => setIndexes(e.target.value), placeholder: "sh000001, sz399001, sz399006" }),
      /* @__PURE__ */ jsx4("div", { className: "qs-formrow", children: /* @__PURE__ */ jsx4("button", { className: "qs-btn", disabled: saving, onClick: () => void save(), children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qs-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qs-card", children: /* @__PURE__ */ jsxs4("div", { style: { padding: "10px 13px" }, children: [
      /* @__PURE__ */ jsx4("div", { className: "qs-sub", children: "\u6293\u53D6\u7531\u540E\u53F0\u670D\u52A1\u539F\u751F\u6267\u884C\uFF08\u9762\u677F/AI \u4E0D\u76F4\u8FDE\u5916\u7F51\uFF09\u3002\u670D\u52A1\u672A\u8FD0\u884C\u65F6\u884C\u60C5\u4E0D\u4F1A\u66F4\u65B0\u3002" }),
      mySvc && /* @__PURE__ */ jsxs4("div", { className: "qs-sub", style: { marginTop: 4 }, children: [
        "\u72B6\u6001 ",
        /* @__PURE__ */ jsx4("b", { style: { color: mySvc.state === "running" ? "#3FB950" : "#D29922" }, children: mySvc.state }),
        mySvc.pid ? ` \xB7 pid ${mySvc.pid}` : "",
        mySvc.uptime ? ` \xB7 \u5DF2\u8FD0\u884C ${Math.floor(mySvc.uptime / 60)} \u5206\u949F` : "",
        mySvc.restartCount ? ` \xB7 \u91CD\u542F ${mySvc.restartCount} \u6B21` : "",
        mySvc.lastError ? ` \xB7 ${mySvc.lastError}` : ""
      ] }),
      meta && /* @__PURE__ */ jsxs4("div", { className: "qs-sub", style: { marginTop: 4 }, children: [
        "\u5FC3\u8DF3 ",
        timeAgo(meta.wroteAt),
        " \xB7 \u6700\u8FD1\u8F6E\u8BE2 ",
        timeAgo(meta.lastPollAt ?? void 0),
        " ",
        "\xB7 \u6570\u636E\u6E90 ",
        meta.lastSource || "\u2014",
        " \xB7 \u6865 ",
        meta.bridge || "\u2014",
        meta.lastError ? ` \xB7 ${meta.lastError}` : ""
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qs-formrow", children: [
        /* @__PURE__ */ jsx4("button", { className: "qs-btn sm", disabled: svcBusy, onClick: () => void svcAction("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { className: "qs-btn ghost sm", disabled: svcBusy, onClick: () => void svcAction("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx4("button", { className: "qs-btn ghost sm", disabled: svcBusy, onClick: () => void svcAction("stop"), children: "\u505C\u6B62" }),
        /* @__PURE__ */ jsx4("button", { className: "qs-btn ghost sm", disabled: svcBusy, onClick: () => void loadSvc(), children: "\u5237\u65B0\u72B6\u6001" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "qs-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qs-bar" }),
      "\u6570\u636E\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qs-card", children: /* @__PURE__ */ jsxs4("div", { style: { padding: "10px 13px" }, className: "qs-sub", children: [
      "\xB7 \u5B9E\u65F6\u884C\u60C5\uFF1A\u817E\u8BAF\u8D22\u7ECF\uFF08\u4E3B\u6E90\uFF09\u2192 \u4E1C\u65B9\u8D22\u5BCC\uFF08\u5907\u6E90\uFF09\u81EA\u52A8\u964D\u7EA7\uFF1B\u4E24\u6E90\u5747\u4E0D\u53EF\u7528\u65F6\u4FDD\u7559\u6700\u8FD1\u7F13\u5B58\u5E76\u5728\u884C\u60C5\u884C\u6807\u6CE8 ",
      /* @__PURE__ */ jsx4("b", { children: "cache" }),
      "\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5206\u65F6\uFF1A\u817E\u8BAF ifzq \u5F53\u65E5\u6570\u636E\uFF0C\u5C55\u5F00\u8BE6\u60C5\u65F6\u6309\u9700\u62C9\u53D6\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u652F\u6301\uFF1A\u6CAA/\u6DF1/\u5317 \u573A\u5185\u80A1\u7968\u3001ETF/LOF\u3001\u6307\u6570\u3002\u6682\u4E0D\u652F\u6301\uFF1A\u573A\u5916\u57FA\u91D1\u51C0\u503C\u3001\u6E2F\u80A1\u3001\u7F8E\u80A1\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u63D0\u9192\u5728\u670D\u52A1\u8F6E\u8BE2\u65F6\u8BC4\u4F30\uFF0C\u4EC5\u5BF9\u300C\u884C\u60C5\u65F6\u95F4\u4E3A\u4ECA\u5929\u300D\u7684\u6570\u636E\u751F\u6548\uFF08\u8282\u5047\u65E5\u4E0D\u8BEF\u89E6\uFF09\uFF0C\u6BCF\u89C4\u5219\u6BCF\u4EA4\u6613\u65E5\u6700\u591A\u89E6\u53D1\u4E00\u6B21\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u672C\u63D2\u4EF6\u53EA\u8BFB\u516C\u5F00\u884C\u60C5\u6570\u636E\uFF0C\u4E0D\u6536\u96C6\u4EFB\u4F55\u4E2A\u4EBA\u4FE1\u606F\uFF0C\u65E0\u4EFB\u4F55\u4EA4\u6613\u529F\u80FD\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.qs-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qs-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qs-body{flex:1;overflow-y:auto;padding:0 0 20px}
.qs-body::-webkit-scrollbar{width:9px;height:9px}
.qs-body::-webkit-scrollbar-track{background:transparent}
.qs-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

/* \u5934\u90E8 */
.qs-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.qs-ttrow{display:flex;align-items:center;gap:10px}
.qs-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C2410C,#F85149);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qs-tt{flex:1;min-width:0}
.qs-tt b{font-size:15px;display:block}
.qs-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;flex-wrap:wrap}
.qs-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.qs-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.qs-dot.stale{background:#D29922}
.qs-dot.down{background:#F85149}
.qs-tabs{display:flex;gap:4px;margin-top:9px}
.qs-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer;position:relative}
.qs-tab:hover{color:#E6EAF2}
.qs-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qs-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u6307\u6570\u6761 */
.qs-idx{display:flex;gap:8px;overflow-x:auto;padding:2px 16px 8px}
.qs-idx-chip{background:#161B22;border:1px solid #242C3A;border-radius:10px;padding:6px 10px;flex-shrink:0;min-width:104px}
.qs-idx-chip .n{font-size:10px;color:#8B95A7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px}
.qs-idx-chip .v{font-size:13px;font-weight:700;white-space:nowrap}
.qs-idx-chip .p{font-size:10px;font-weight:600;white-space:nowrap}

/* \u81EA\u9009\u5361\u7247 */
.qs-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 9px;overflow:hidden}
.qs-row{display:flex;align-items:center;gap:10px;padding:10px 13px;cursor:pointer;min-width:0}
.qs-row:hover{background:#1A2029}
.qs-name{min-width:0;flex:1}
.qs-name b{font-size:13px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qs-name small{color:#5C6678;font-size:10px}
.qs-price{text-align:right;flex-shrink:0}
.qs-price b{font-size:14.5px;display:block;font-variant-numeric:tabular-nums}
.qs-chg{font-size:10px;font-variant-numeric:tabular-nums}
.qs-bell{font-size:11px;color:#D29922;flex-shrink:0}
.qs-detail{border-top:1px solid #242C3A;padding:10px 13px;background:#12161E}
.qs-grid{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
.qs-formrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.qs-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;width:100%;min-width:0}
.qs-inp:focus{outline:none;border-color:#2b6cb0}
.qs-inp::placeholder{color:#4d5566}
.qs-inp.sm{width:90px;flex:none}
.qs-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px}
.qs-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.qs-btn:hover{filter:brightness(1.1)}
.qs-btn:disabled{opacity:.45;cursor:not-allowed}
.qs-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qs-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qs-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qs-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.qs-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qs-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F97316,#F85149);flex-shrink:0}
.qs-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qs-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.qs-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.qs-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qs-err{color:#F85149;font-size:11.5px;padding:2px 16px 8px}
.qs-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qs-toast.bad{border-color:#54262c;color:#FF8A9A}
.qs-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#F97316;border-radius:50%;animation:qs-spin .8s linear infinite;vertical-align:-1px}
@keyframes qs-spin{to{transform:rotate(360deg)}}
.qs-foot{text-align:center;color:#454E5E;font-size:9.5px;padding:6px 16px 10px}
`;
function Panel({ pluginId }) {
  const [tab, setTab] = useState4("market");
  const [snap, setSnap] = useState4(null);
  const [toast, setToast] = useState4(null);
  const [busy, setBusy] = useState4(false);
  const showToast = useCallback((text, bad) => {
    setToast({ text, bad });
    setTimeout(() => setToast((cur) => cur && cur.text === text ? null : cur), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const readAt = await loadReadAt();
      const s = await loadSnapshot(readAt);
      setSnap(s);
    } catch (e) {
      showToast(e.message, true);
    }
  }, [showToast]);
  useEffect(() => {
    let timer;
    let stopped = false;
    const loop = async () => {
      if (!stopped && document.visibilityState === "visible") await reload();
      if (!stopped) timer = window.setTimeout(loop, 5e3);
    };
    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [reload]);
  const meta = snap?.meta;
  const dotCls = !meta ? "down" : meta.lastError ? "stale" : meta.lastPollAt && Date.now() - meta.lastPollAt < Math.max((meta.pollSec || 30) * 2.5, 90) * 1e3 ? "ok" : "stale";
  const newCount = snap?.newCount ?? 0;
  return /* @__PURE__ */ jsxs5("div", { className: "qs-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "qs-top", children: [
      /* @__PURE__ */ jsxs5("div", { className: "qs-ttrow", children: [
        /* @__PURE__ */ jsx5("div", { className: "qs-logo", children: "\u76E4" }),
        /* @__PURE__ */ jsxs5("div", { className: "qs-tt", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u76D8\u54E8" }),
          /* @__PURE__ */ jsxs5("small", { children: [
            /* @__PURE__ */ jsx5("span", { className: `qs-dot ${dotCls}` }),
            meta ? `${meta.inSession ? "\u76D8\u4E2D" : "\u76D8\u5916"} \xB7 ${meta.lastSource || "\u65E0\u6570\u636E"} \xB7 ${meta.lastPollAt ? agoStr(meta.lastPollAt) : "\u672A\u8F6E\u8BE2"}${meta.lastError ? ` \xB7 ${meta.lastError}` : ""}` : "\u540E\u53F0\u670D\u52A1\u672A\u8FDE\u63A5"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "qs-tabs", children: [["market", "\u884C\u60C5"], ["alerts", "\u63D0\u9192"], ["settings", "\u8BBE\u7F6E"]].map(([t, label]) => /* @__PURE__ */ jsxs5("button", { className: `qs-tab ${tab === t ? "on" : ""}`, onClick: () => {
        setTab(t);
        if (t === "alerts") void refreshRead(snap, setSnap);
      }, children: [
        label,
        t === "alerts" && newCount > 0 && /* @__PURE__ */ jsx5("span", { className: "qs-badge", children: newCount > 99 ? "99+" : newCount })
      ] }, t)) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "qs-body", children: [
      tab === "market" && /* @__PURE__ */ jsx5(MarketTab, { snap, busy, setBusy, reload, showToast }),
      tab === "alerts" && /* @__PURE__ */ jsx5(AlertsTab, { snap, reload, showToast }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { snap, reload, showToast, pluginId }),
      /* @__PURE__ */ jsx5("div", { className: "qs-foot", children: "\u884C\u60C5\u6570\u636E\u6765\u81EA\u516C\u5F00\u63A5\u53E3\uFF0C\u53EF\u80FD\u6709\u5EF6\u8FDF\u6216\u9519\u8BEF \xB7 \u4EC5\u4F9B\u4E2A\u4EBA\u53C2\u8003\uFF0C\u975E\u6295\u8D44\u5EFA\u8BAE" })
    ] }),
    toast && /* @__PURE__ */ jsx5("div", { className: `qs-toast ${toast.bad ? "bad" : ""}`, children: toast.text })
  ] });
}
function agoStr(ts) {
  const d = Date.now() - ts;
  if (d < 15 * 1e3) return "\u521A\u521A\u66F4\u65B0";
  if (d < 60 * 1e3) return `${Math.floor(d / 1e3)} \u79D2\u524D\u66F4\u65B0`;
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D\u66F4\u65B0`;
  return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D\u66F4\u65B0`;
}
async function refreshRead(snap, setSnap) {
  if (!snap) return;
  const latest = snap.feed.reduce((m, f) => Math.max(m, f.at || 0), 0);
  if (latest <= 0) return;
  const readAt = await Promise.resolve().then(() => (init_model(), model_exports)).then((m) => m.loadReadAt());
  if (latest > readAt) {
    const { markFeedRead: markFeedRead2 } = await Promise.resolve().then(() => (init_model(), model_exports));
    await markFeedRead2(latest);
    setSnap({ ...snap, newCount: 0 });
  }
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function QuoteSentinelPanel(props) {
  return /* @__PURE__ */ jsx6(Panel, { pluginId: props.pluginId });
}
export {
  QuoteSentinelPanel as default
};
