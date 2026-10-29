// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect3, useRef, useState as useState4 } from "react";

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
var K = {
  target: (id) => `sentinel.target.${id}`,
  state: (id) => `sentinel.state.${id}`,
  snap: (id) => `sentinel.snap.${id}`,
  eventPrefix: (id) => `sentinel.event.${id}.`,
  cmdCheck: (id) => `sentinel.cmd.check.${id}`,
  cmdTest: (nonce) => `sentinel.cmd.test.${nonce}`,
  test: (nonce) => `sentinel.test.${nonce}`,
  settings: "sentinel.settings",
  meta: "sentinel.meta",
  readAt: "sentinel.readAt"
};
var DEFAULT_SETTINGS = {
  pausedAll: false,
  maxConcurrency: 3,
  retentionDays: 30,
  maxEventsPerTarget: 50,
  userAgent: ""
};
var MODE_OPTIONS = [
  { value: "text", label: "\u6574\u9875\u6587\u672C", hint: "\u76EF\u6574\u9875\u4EFB\u610F\u53D8\u5316\uFF0C\u6700\u7701\u5FC3" },
  { value: "selector", label: "CSS \u9009\u62E9\u5668", hint: "\u53EA\u76EF\u5C40\u90E8\u5143\u7D20\uFF08\u5982 .price\uFF09\uFF0C\u6700\u51C6" },
  { value: "regex", label: "\u6B63\u5219\u63D0\u53D6", hint: "\u7528\u6B63\u5219\u6355\u83B7\u7EC41\u62BD\u53D6\u6587\u672C" },
  { value: "json", label: "JSON \u63A5\u53E3", hint: "\u76EF JSON \u63A5\u53E3\u7684\u67D0\u4E2A\u5B57\u6BB5" },
  { value: "headers", label: "\u54CD\u5E94\u5934", hint: "\u76EF etag / last-modified \u53D8\u5316" }
];
var CONDITION_OPTIONS = [
  { value: "any", label: "\u5185\u5BB9\u53D8\u5316\u5C31\u62A5" },
  { value: "contains", label: "\u51FA\u73B0\u5173\u952E\u8BCD\u65F6\u62A5" },
  { value: "notContains", label: "\u5173\u952E\u8BCD\u6D88\u5931\u65F6\u62A5" },
  { value: "lt", label: "\u6570\u503C\u4F4E\u4E8E\u9608\u503C\u65F6\u62A5" },
  { value: "gt", label: "\u6570\u503C\u9AD8\u4E8E\u9608\u503C\u65F6\u62A5" }
];
var EVENT_TYPE_META = {
  change: { label: "\u53D8\u5316", color: "#58A6FF" },
  match: { label: "\u547D\u4E2D", color: "#3FB950" },
  unmatch: { label: "\u89E3\u9664", color: "#D29922" },
  error: { label: "\u9519\u8BEF", color: "#F85149" },
  recovered: { label: "\u6062\u590D", color: "#3FB950" }
};
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
async function loadSnapshot(readAt = 0) {
  const keys = await kvKeys();
  const targetIds = keys.filter((k) => k.startsWith("sentinel.target.")).map((k) => k.slice("sentinel.target.".length));
  const [targets, states, meta, settings] = await Promise.all([
    Promise.all(targetIds.map((id) => kvGet(K.target(id)))),
    Promise.all(targetIds.map((id) => kvGet(K.state(id)))),
    kvGet(K.meta),
    kvGet(K.settings)
  ]);
  const rows = targetIds.map((id, i) => ({ target: targets[i], state: states[i] ?? void 0 })).filter((r) => r.target && typeof r.target === "object").sort((a, b) => (a.target.createdAt || 0) - (b.target.createdAt || 0));
  let newCount = 0;
  if (readAt > 0) {
    for (const k of keys) {
      if (!k.startsWith("sentinel.event.")) continue;
      const at = Number(k.slice(k.lastIndexOf(".") + 1));
      if (Number.isFinite(at) && at > readAt) newCount++;
    }
  }
  return {
    rows,
    meta,
    settings: { ...DEFAULT_SETTINGS, ...settings && typeof settings === "object" ? settings : {} },
    newCount
  };
}
async function loadEvents(limit = 60, targetId) {
  const keys = await kvKeys();
  let evKeys = keys.filter((k) => k.startsWith("sentinel.event."));
  if (targetId) evKeys = evKeys.filter((k) => k.startsWith(K.eventPrefix(targetId)));
  evKeys.sort();
  evKeys = evKeys.slice(-limit).reverse();
  const events = await Promise.all(evKeys.map((k) => kvGet(k)));
  return events.filter((e) => !!e && typeof e === "object").sort((a, b) => b.at - a.at);
}
async function loadReadAt() {
  const v = await kvGet(K.readAt);
  return typeof v === "number" ? v : 0;
}
function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return "w" + c.randomUUID().replace(/-/g, "").slice(0, 12);
  return "w" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function validateTarget(t) {
  if (!t.url || !/^https?:\/\//i.test(t.url.trim())) return "URL \u5FC5\u987B\u4EE5 http(s):// \u5F00\u5934";
  const mode = t.mode || "text";
  if (mode === "selector" && !(t.selector || "").trim()) return "CSS \u9009\u62E9\u5668\u6A21\u5F0F\u9700\u8981\u586B\u5199\u9009\u62E9\u5668";
  if (mode === "regex" && !(t.regex || "").trim()) return "\u6B63\u5219\u6A21\u5F0F\u9700\u8981\u586B\u5199\u6B63\u5219\u8868\u8FBE\u5F0F";
  if (mode === "json" && !(t.jsonPath || "").trim()) return "JSON \u6A21\u5F0F\u9700\u8981\u586B\u5199\u53D6\u503C\u8DEF\u5F84";
  const cond = t.condition || "any";
  if ((cond === "contains" || cond === "notContains") && !(t.keyword || "").trim()) return "\u8BE5\u6761\u4EF6\u9700\u8981\u586B\u5199\u5173\u952E\u8BCD";
  if ((cond === "lt" || cond === "gt") && !Number.isFinite(Number(t.threshold))) return "\u8BE5\u6761\u4EF6\u9700\u8981\u586B\u5199\u6570\u503C\u9608\u503C";
  return null;
}
async function saveTarget(t) {
  await kvSet(K.target(t.id), { ...t, updatedAt: Date.now() });
}
async function triggerCheck(id) {
  await kvSet(K.cmdCheck(id), { op: "check", at: Date.now() });
}
async function removeTarget(id) {
  const keys = await kvKeys();
  const related = keys.filter((k) => k === K.target(id) || k === K.state(id) || k === K.snap(id) || k.startsWith(K.eventPrefix(id)) || k === K.cmdCheck(id));
  await Promise.all(related.map((k) => kvDel(k)));
}
async function testFetch(spec, onProgress) {
  const nonce = "p" + uid().slice(1);
  await kvSet(K.cmdTest(nonce), { ...spec, at: Date.now() });
  const deadline = Date.now() + 3e4;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, 1200));
    onProgress?.(Date.now());
    const r = await kvGet(K.test(nonce)).catch(() => null);
    if (r) {
      kvDel(K.test(nonce)).catch(() => {
      });
      return r;
    }
  }
  return { ok: false, error: "\u8BD5\u6293\u8D85\u65F6\uFF1A\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u7F51\u9875\u76D1\u6D4B \u67E5\u770B\u670D\u52A1\u72B6\u6001\uFF09" };
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
function timeAgo(ts) {
  if (!ts) return "\u4ECE\u672A";
  const d = Date.now() - ts;
  if (d < 15 * 1e3) return "\u521A\u521A";
  if (d < 60 * 1e3) return `${Math.floor(d / 1e3)} \u79D2\u524D`;
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function inDelta(ts) {
  if (!ts) return "\u2014";
  const d = ts - Date.now();
  if (d <= 0) return "\u5373\u5C06";
  if (d < 60 * 1e3) return `${Math.ceil(d / 1e3)} \u79D2\u540E`;
  if (d < 3600 * 1e3) return `${Math.ceil(d / 6e4)} \u5206\u949F\u540E`;
  return `${Math.ceil(d / 36e5)} \u5C0F\u65F6\u540E`;
}
function fmtInterval(sec) {
  if (sec % 3600 === 0) return `${sec / 3600} \u5C0F\u65F6`;
  if (sec % 60 === 0) return `${sec / 60} \u5206\u949F`;
  return `${sec} \u79D2`;
}
function modeLabel(mode, target) {
  if (mode === "selector" && target?.selector) return `\u9009\u62E9\u5668 ${target.selector}`;
  if (mode === "regex" && target?.regex) return `\u6B63\u5219 ${target.regex}`;
  if (mode === "json" && target?.jsonPath) return `JSON ${target.jsonPath}`;
  return MODE_OPTIONS.find((m) => m.value === mode)?.label || mode;
}
function conditionLabel(t) {
  switch (t.condition) {
    case "contains":
      return `\u51FA\u73B0\u300C${t.keyword}\u300D`;
    case "notContains":
      return `\u6D88\u5931\u300C${t.keyword}\u300D`;
    case "lt":
      return `\u4F4E\u4E8E ${t.threshold}`;
    case "gt":
      return `\u9AD8\u4E8E ${t.threshold}`;
    default:
      return "\u5185\u5BB9\u53D8\u5316";
  }
}

// src/WatchTab.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var INTERVAL_OPTIONS = [
  { v: 60, label: "\u6BCF 1 \u5206\u949F" },
  { v: 300, label: "\u6BCF 5 \u5206\u949F" },
  { v: 600, label: "\u6BCF 10 \u5206\u949F" },
  { v: 1800, label: "\u6BCF 30 \u5206\u949F" },
  { v: 3600, label: "\u6BCF 1 \u5C0F\u65F6" },
  { v: 21600, label: "\u6BCF 6 \u5C0F\u65F6" }
];
function emptyForm() {
  return {
    id: null,
    name: "",
    url: "",
    mode: "text",
    selector: "",
    regex: "",
    jsonPath: "",
    intervalSec: 600,
    condition: "any",
    keyword: "",
    threshold: "",
    headers: ""
  };
}
function fromTarget(t) {
  return {
    id: t.id,
    name: t.name,
    url: t.url,
    mode: t.mode,
    selector: t.selector || "",
    regex: t.regex || "",
    jsonPath: t.jsonPath || "",
    intervalSec: t.intervalSec,
    condition: t.condition,
    keyword: t.keyword || "",
    threshold: t.threshold !== void 0 ? String(t.threshold) : "",
    headers: t.headers ? Object.entries(t.headers).map(([k, v]) => `${k}: ${v}`).join("\n") : ""
  };
}
function buildTarget(f) {
  const headers = {};
  for (const line of f.headers.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k && v) headers[k] = v;
    }
  }
  return {
    id: f.id || uid(),
    name: f.name.trim() || f.url.trim(),
    url: f.url.trim(),
    mode: f.mode,
    selector: f.mode === "selector" ? f.selector.trim() : void 0,
    regex: f.mode === "regex" ? f.regex.trim() : void 0,
    jsonPath: f.mode === "json" ? f.jsonPath.trim() : void 0,
    headers: Object.keys(headers).length ? headers : void 0,
    intervalSec: Math.max(30, Math.floor(f.intervalSec) || 600),
    condition: f.condition,
    keyword: f.condition === "contains" || f.condition === "notContains" ? f.keyword.trim() : void 0,
    threshold: f.condition === "lt" || f.condition === "gt" ? Number(f.threshold) : void 0,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
var MODE_FIELD = {
  text: null,
  selector: { label: "CSS \u9009\u62E9\u5668", key: "selector", placeholder: ".price \u6216 a.item@href" },
  regex: { label: "\u6B63\u5219\u8868\u8FBE\u5F0F", key: "regex", placeholder: "\u4EF7\u683C[^0-9]*([0-9.]+)  \uFF08\u6355\u83B7\u7EC41\u4F18\u5148\uFF09" },
  json: { label: "JSON \u8DEF\u5F84", key: "jsonPath", placeholder: "data.items[0].price" },
  headers: null
};
function WatchTab({ snap, reload, showToast, markRead, goFeed }) {
  const [form, setForm] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [expandedDiff, setExpandedDiff] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testOut, setTestOut] = useState("");
  const set = (patch) => setForm((f) => f ? { ...f, ...patch } : f);
  const save = async () => {
    if (!form) return;
    const t = buildTarget(form);
    const bad = validateTarget(t);
    if (bad) {
      showToast(bad, true);
      return;
    }
    try {
      await saveTarget(t);
      await triggerCheck(t.id);
      setForm(null);
      await reload();
      showToast(`\u5DF2\u4FDD\u5B58\u300C${t.name}\u300D\uFF0C\u6B63\u5728\u9996\u67E5\u2026`);
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const doTest = async () => {
    if (!form) return;
    const t = buildTarget(form);
    const bad = validateTarget(t);
    if (bad) {
      showToast(bad, true);
      return;
    }
    setTesting(true);
    setTestOut("\u6293\u53D6\u4E2D\u2026\uFF08\u540E\u53F0\u670D\u52A1\u539F\u751F\u8BF7\u6C42\uFF0C\u6700\u957F 30 \u79D2\uFF09");
    const r = await testFetch({ url: t.url, mode: t.mode, selector: t.selector, regex: t.regex, jsonPath: t.jsonPath });
    setTesting(false);
    setTestOut(r.ok ? `\u2713 \u6293\u53D6\u6210\u529F\uFF08HTTP ${r.status}\uFF0C${r.elapsedMs}ms\uFF09\uFF0C\u62BD\u53D6\u5185\u5BB9\u9884\u89C8\uFF1A
${(r.text || "(\u7A7A)").slice(0, 500)}` : `\u2717 ${r.error}`);
  };
  const checkNow = async (id) => {
    setBusyId(id);
    try {
      await triggerCheck(id);
      showToast("\u5DF2\u89E6\u53D1\u68C0\u67E5\uFF0C\u51E0\u79D2\u540E\u5237\u65B0\u53EF\u89C1\u7ED3\u679C");
      setTimeout(() => {
        reload();
        setBusyId(null);
      }, 2500);
    } catch (e) {
      showToast(`\u89E6\u53D1\u5931\u8D25\uFF1A${e.message}`, true);
      setBusyId(null);
    }
  };
  const togglePause = async (t) => {
    try {
      await saveTarget({ ...t, enabled: !t.enabled });
      await reload();
      showToast(t.enabled ? `\u5DF2\u6682\u505C\u300C${t.name}\u300D` : `\u5DF2\u6062\u590D\u300C${t.name}\u300D`);
    } catch (e) {
      showToast(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const del = async (t) => {
    if (!window.confirm(`\u5220\u9664\u76D1\u63A7\u300C${t.name}\u300D\uFF1F\u5176\u5386\u53F2\u4E8B\u4EF6\u4E0E\u5FEB\u7167\u5C06\u4E00\u5E76\u5220\u9664\u3002`)) return;
    try {
      await removeTarget(t.id);
      await reload();
      showToast(`\u5DF2\u5220\u9664\u300C${t.name}\u300D`);
    } catch (e) {
      showToast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const expandDiff = async (t) => {
    if (expanded === t.id) {
      setExpanded(null);
      setExpandedDiff(null);
      return;
    }
    setExpanded(t.id);
    setExpandedDiff(null);
    try {
      const evs = await loadEvents(1, t.id);
      const ev = evs[0];
      setExpandedDiff(ev && ev.diff && ev.diff.length ? { summary: ev.summary, diff: ev.diff, at: ev.at } : { summary: "\u6700\u8FD1\u4E00\u6B21\u4E8B\u4EF6\u65E0\u884C\u7EA7\u5DEE\u5F02\uFF08\u6216\u5C1A\u65E0\u4E8B\u4EF6\uFF09", diff: [], at: ev?.at || 0 });
    } catch {
      setExpandedDiff({ summary: "\u4E8B\u4EF6\u8BFB\u53D6\u5931\u8D25", diff: [], at: 0 });
    }
  };
  const checkAll = async () => {
    if (!snap) return;
    const ids = snap.rows.filter((r) => r.target.enabled && !snap.settings.pausedAll).map((r) => r.target.id);
    try {
      await Promise.all(ids.map((id) => triggerCheck(id)));
      showToast(`\u5DF2\u89E6\u53D1 ${ids.length} \u4E2A\u76EE\u6807\u7684\u68C0\u67E5`);
      setTimeout(() => reload(), 2500);
    } catch (e) {
      showToast(`\u89E6\u53D1\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const pauseAll = async () => {
    if (!snap) return;
    await kvSet(K.settings, { ...snap.settings, pausedAll: !snap.settings.pausedAll });
    await reload();
    showToast(snap.settings.pausedAll ? "\u5DF2\u6062\u590D\u5168\u5C40\u8C03\u5EA6" : "\u5DF2\u5168\u5C40\u6682\u505C\u8C03\u5EA6");
  };
  const rows = snap?.rows ?? [];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "ps-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "ps-bar" }),
      "\u76D1\u63A7\u76EE\u6807",
      /* @__PURE__ */ jsx("span", { className: "ps-hint", children: snap?.settings.pausedAll ? "\u5168\u5C40\u5DF2\u6682\u505C" : `${rows.filter((r) => r.target.enabled).length}/${rows.length} \u8FD0\u884C\u4E2D` })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ps-row", style: { padding: "0 16px 10px" }, children: [
      /* @__PURE__ */ jsx("button", { className: "ps-btn", onClick: () => {
        setForm(emptyForm());
        setTestOut("");
      }, children: "\uFF0B \u65B0\u5EFA\u76D1\u63A7" }),
      /* @__PURE__ */ jsx("button", { className: "ps-btn ghost", disabled: !rows.length, onClick: checkAll, children: "\u5168\u90E8\u68C0\u67E5" }),
      /* @__PURE__ */ jsx("button", { className: "ps-btn ghost", disabled: !rows.length, onClick: pauseAll, children: snap?.settings.pausedAll ? "\u6062\u590D\u5168\u5C40" : "\u5168\u5C40\u6682\u505C" }),
      rows.some((r) => r.state?.lastChangeAt) && /* @__PURE__ */ jsx("button", { className: "ps-btn ghost", onClick: () => {
        markRead();
        goFeed();
      }, children: "\u770B\u52A8\u6001 \u2192" })
    ] }),
    form && /* @__PURE__ */ jsx("div", { className: "ps-card", children: /* @__PURE__ */ jsxs("div", { className: "ps-card-b", children: [
      /* @__PURE__ */ jsx("b", { children: form.id ? "\u7F16\u8F91\u76D1\u63A7" : "\u65B0\u5EFA\u76D1\u63A7" }),
      /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx("input", { className: "ps-inp", value: form.name, onChange: (e) => set({ name: e.target.value }), placeholder: "\u5982\uFF1A3080 \u663E\u5361\u5E93\u5B58 / \u67D0\u6587\u6863\u66F4\u65B0" }),
      /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "URL" }),
      /* @__PURE__ */ jsx("input", { className: "ps-inp", value: form.url, onChange: (e) => set({ url: e.target.value }), placeholder: "https://\u2026" }),
      /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "\u6293\u53D6\u6A21\u5F0F" }),
      /* @__PURE__ */ jsx("select", { className: "ps-sel", value: form.mode, onChange: (e) => set({ mode: e.target.value }), children: MODE_OPTIONS.map((m) => /* @__PURE__ */ jsxs("option", { value: m.value, children: [
        m.label,
        " \u2014\u2014 ",
        m.hint
      ] }, m.value)) }),
      MODE_FIELD[form.mode] && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: MODE_FIELD[form.mode].label }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "ps-inp",
            value: form[MODE_FIELD[form.mode].key],
            onChange: (e) => set({ [MODE_FIELD[form.mode].key]: e.target.value }),
            placeholder: MODE_FIELD[form.mode].placeholder
          }
        )
      ] }),
      /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "\u544A\u8B66\u6761\u4EF6" }),
      /* @__PURE__ */ jsx("select", { className: "ps-sel", value: form.condition, onChange: (e) => set({ condition: e.target.value }), children: CONDITION_OPTIONS.map((c) => /* @__PURE__ */ jsx("option", { value: c.value, children: c.label }, c.value)) }),
      (form.condition === "contains" || form.condition === "notContains") && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "\u5173\u952E\u8BCD\uFF08\u5927\u5C0F\u5199\u4E0D\u654F\u611F\uFF09" }),
        /* @__PURE__ */ jsx("input", { className: "ps-inp", value: form.keyword, onChange: (e) => set({ keyword: e.target.value }), placeholder: "\u5982\uFF1A\u73B0\u8D27 / v1.0 / \u62A5\u540D\u622A\u6B62" })
      ] }),
      (form.condition === "lt" || form.condition === "gt") && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "\u6570\u503C\u9608\u503C\uFF08\u53D6\u62BD\u53D6\u6587\u672C\u4E2D\u7684\u7B2C\u4E00\u4E2A\u6570\u5B57\u6BD4\u8F83\uFF09" }),
        /* @__PURE__ */ jsx("input", { className: "ps-inp", value: form.threshold, onChange: (e) => set({ threshold: e.target.value }), placeholder: "\u5982\uFF1A5000" })
      ] }),
      /* @__PURE__ */ jsx("label", { className: "ps-lbl", children: "\u68C0\u67E5\u95F4\u9694" }),
      /* @__PURE__ */ jsx("select", { className: "ps-sel", value: form.intervalSec, onChange: (e) => set({ intervalSec: Number(e.target.value) }), children: INTERVAL_OPTIONS.map((o) => /* @__PURE__ */ jsx("option", { value: o.v, children: o.label }, o.v)) }),
      /* @__PURE__ */ jsxs("label", { className: "ps-lbl", style: { cursor: "pointer" }, onClick: () => set({ headers: form.headers === "" ? "User-Agent: \u2026\nCookie: \u2026" : "" }), children: [
        "\u9AD8\u7EA7\uFF1A\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934\uFF08\u70B9\u51FB",
        form.headers ? "\u6536\u8D77" : "\u5C55\u5F00",
        "\uFF09"
      ] }),
      form.headers !== "" && /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "ps-inp",
          rows: 3,
          value: form.headers,
          onChange: (e) => set({ headers: e.target.value }),
          placeholder: "\u6BCF\u884C\u4E00\u6761\uFF0C\u683C\u5F0F Header-Name: value\n\u5982\uFF1ACookie: xxx=yyy"
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "ps-actions", children: [
        /* @__PURE__ */ jsxs("button", { className: "ps-btn ghost", disabled: testing, onClick: doTest, children: [
          testing ? /* @__PURE__ */ jsx("span", { className: "ps-spin" }) : null,
          " \u8BD5\u6293\u9884\u89C8"
        ] }),
        /* @__PURE__ */ jsx("button", { className: "ps-btn", onClick: save, children: "\u4FDD\u5B58\u5E76\u9996\u67E5" }),
        /* @__PURE__ */ jsx("button", { className: "ps-btn ghost", onClick: () => {
          setForm(null);
          setTestOut("");
        }, children: "\u53D6\u6D88" })
      ] }),
      testOut && /* @__PURE__ */ jsx("pre", { className: "ps-diff", style: { whiteSpace: "pre-wrap" }, children: testOut })
    ] }) }),
    !rows.length && !form && /* @__PURE__ */ jsxs("div", { className: "ps-empty", children: [
      "\u8FD8\u6CA1\u6709\u76D1\u63A7\u76EE\u6807\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u70B9\u300C\uFF0B \u65B0\u5EFA\u76D1\u63A7\u300D\u76EF\u4E00\u4E2A\u7F51\u9875\u7684\u4EF7\u683C / \u5E93\u5B58 / \u66F4\u65B0\uFF1B",
      /* @__PURE__ */ jsx("br", {}),
      "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u804A\u5929\u91CC\u8BA9 AI \u5E2E\u4F60\u52A0\u76D1\u63A7\u3002"
    ] }),
    rows.map(({ target: t, state: st }) => {
      const err = st?.status === "error";
      const paused = !t.enabled || !!snap?.settings.pausedAll;
      const dotCls = paused ? "stale" : err ? "down" : "ok";
      return /* @__PURE__ */ jsx("div", { className: "ps-card", children: /* @__PURE__ */ jsxs("div", { className: "ps-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "ps-row", style: { flexWrap: "nowrap" }, children: [
          /* @__PURE__ */ jsx("i", { className: `ps-dot ${dotCls}`, style: { marginTop: 5 } }),
          /* @__PURE__ */ jsx("b", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: t.name }),
          paused && /* @__PURE__ */ jsx("span", { className: "ps-badge-txt", style: { background: "#2a2417", color: "#D29922", borderColor: "#3d3519" }, children: "\u5DF2\u6682\u505C" }),
          err && /* @__PURE__ */ jsx("span", { className: "ps-badge-txt", style: { background: "#2d1a1e", color: "#F85149", borderColor: "#54262c" }, children: "\u51FA\u9519" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "ps-url", children: t.url }),
        /* @__PURE__ */ jsxs("div", { className: "ps-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ jsx("span", { className: "ps-tag", children: modeLabel(t.mode, t) }),
          /* @__PURE__ */ jsx("span", { className: "ps-tag", children: conditionLabel(t) }),
          /* @__PURE__ */ jsx("span", { className: "ps-tag", children: fmtInterval(t.intervalSec) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ps-state", children: [
          /* @__PURE__ */ jsxs("span", { className: "ps-kv", children: [
            "\u4E0A\u6B21\u68C0\u67E5 ",
            /* @__PURE__ */ jsx("b", { children: timeAgo(st?.lastCheckedAt) })
          ] }),
          !paused && /* @__PURE__ */ jsxs("span", { className: "ps-kv", children: [
            "\xB7 \u4E0B\u6B21 ",
            /* @__PURE__ */ jsx("b", { children: inDelta(st?.nextCheckAt) })
          ] }),
          !!st?.checkCount && /* @__PURE__ */ jsxs("span", { className: "ps-kv", children: [
            "\xB7 \u5DF2\u67E5 ",
            /* @__PURE__ */ jsx("b", { children: st.checkCount }),
            " \u6B21",
            st.errorCount ? `\uFF08\u9519 ${st.errorCount}\uFF09` : ""
          ] })
        ] }),
        err && st?.lastError && /* @__PURE__ */ jsx("div", { className: "ps-sub", style: { color: "#F85149", marginTop: 4 }, children: st.lastError }),
        !err && st?.lastEventSummary && /* @__PURE__ */ jsxs("div", { className: "ps-sub", style: { marginTop: 4 }, children: [
          "\u23F1 ",
          st.lastEventSummary,
          "\uFF08",
          timeAgo(st?.lastChangeAt),
          "\uFF09"
        ] }),
        expanded === t.id && /* @__PURE__ */ jsx("div", { className: "ps-diff", style: { whiteSpace: "pre-wrap" }, children: expandedDiff ? expandedDiff.diff.length ? expandedDiff.diff.map((d, i) => /* @__PURE__ */ jsxs("div", { className: `ps-dl ${d.kind === "+" ? "add" : d.kind === "-" ? "del" : d.kind === "\u2026" ? "fold" : "ctx"}`, children: [
          d.kind === "\xB1" ? "\u2248 " : d.kind,
          d.kind !== " " ? "" : " ",
          d.text
        ] }, i)) : `\uFF08${expandedDiff.summary}\uFF09` : "\u8BFB\u53D6\u4E2D\u2026" }),
        /* @__PURE__ */ jsxs("div", { className: "ps-actions", children: [
          /* @__PURE__ */ jsxs("button", { className: "ps-btn sm", disabled: busyId === t.id || paused, onClick: () => checkNow(t.id), children: [
            busyId === t.id ? /* @__PURE__ */ jsx("span", { className: "ps-spin" }) : null,
            " \u7ACB\u5373\u68C0\u67E5"
          ] }),
          /* @__PURE__ */ jsx("button", { className: "ps-btn sm ghost", onClick: () => expandDiff(t), children: expanded === t.id ? "\u6536\u8D77\u5DEE\u5F02" : "\u6700\u8FD1\u5DEE\u5F02" }),
          /* @__PURE__ */ jsx("button", { className: "ps-btn sm ghost", onClick: () => togglePause(t), children: t.enabled ? "\u6682\u505C" : "\u6062\u590D" }),
          /* @__PURE__ */ jsx("button", { className: "ps-btn sm ghost", onClick: () => {
            setForm(fromTarget(t));
            setTestOut("");
            window.scrollTo(0, 0);
          }, children: "\u7F16\u8F91" }),
          /* @__PURE__ */ jsx("button", { className: "ps-btn sm danger", onClick: () => del(t), children: "\u5220\u9664" })
        ] })
      ] }) }, t.id);
    })
  ] });
}

// src/FeedTab.tsx
import { useCallback, useEffect, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function FeedTab({ onSendToChat, showToast, markRead, unread }) {
  const [events, setEvents] = useState2(null);
  const [filter, setFilter] = useState2("");
  const reload = useCallback(async () => {
    try {
      setEvents(await loadEvents(80));
    } catch (e) {
      showToast(`\u4E8B\u4EF6\u52A0\u8F7D\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [showToast]);
  useEffect(() => {
    reload();
  }, [reload]);
  const targets = Array.from(new Set((events || []).map((e) => e.targetName || e.targetId)));
  const shown = filter ? (events || []).filter((e) => (e.targetName || e.targetId) === filter) : events || [];
  const sendToChat = async (ev) => {
    const lines = [
      `\u3010\u7F51\u9875\u76D1\u6D4B\u3011\u76D1\u63A7\u300C${ev.targetName || ev.targetId}\u300D${EVENT_TYPE_META[ev.type]?.label || ev.type}\uFF1A${ev.summary}`,
      `\u65F6\u95F4\uFF1A${new Date(ev.at).toLocaleString("zh-CN", { hour12: false })}`
    ];
    if (ev.diff && ev.diff.length) {
      lines.push("\u5DEE\u5F02\uFF1A", ...ev.diff.slice(0, 20).map((d) => `${d.kind} ${d.text}`));
    }
    if (ev.extract) lines.push(`\u5F53\u524D\u62BD\u53D6\u5185\u5BB9\uFF1A${ev.extract.slice(0, 300)}`);
    lines.push("\u8BF7\u5E2E\u6211\u5206\u6790\u8FD9\u6B21\u53D8\u5316\u3002");
    if (onSendToChat) {
      await onSendToChat(lines.join("\n"));
      showToast("\u5DF2\u53D1\u9001\u5230\u804A\u5929");
    } else {
      showToast("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u9001\u5230\u804A\u5929", true);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "ps-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "ps-bar" }),
      "\u52A8\u6001",
      /* @__PURE__ */ jsx2("span", { className: "ps-hint", children: unread > 0 ? `${unread} \u6761\u672A\u8BFB` : "\u5DF2\u5168\u90E8\u9605\u8BFB" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ps-row", style: { padding: "0 16px 10px" }, children: [
      /* @__PURE__ */ jsxs2("select", { className: "ps-sel", style: { maxWidth: 200 }, value: filter, onChange: (e) => setFilter(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u76EE\u6807" }),
        targets.map((t) => /* @__PURE__ */ jsx2("option", { value: t, children: t }, t))
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "ps-btn ghost sm", onClick: reload, children: "\u5237\u65B0" }),
      unread > 0 && /* @__PURE__ */ jsx2("button", { className: "ps-btn sm", onClick: () => {
        markRead();
        showToast("\u5DF2\u6807\u8BB0\u4E3A\u5DF2\u8BFB");
      }, children: "\u5168\u90E8\u5DF2\u8BFB" })
    ] }),
    !shown.length && /* @__PURE__ */ jsxs2("div", { className: "ps-empty", children: [
      "\u8FD8\u6CA1\u6709\u4E8B\u4EF6\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u670D\u52A1\u68C0\u67E5\u51FA\u53D8\u5316\u6216\u6761\u4EF6\u547D\u4E2D\u65F6\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"
    ] }),
    shown.map((ev) => {
      const meta = EVENT_TYPE_META[ev.type] || { label: ev.type, color: "#8B95A7" };
      return /* @__PURE__ */ jsxs2("div", { className: "ps-ev", children: [
        /* @__PURE__ */ jsxs2("div", { className: "ps-ev-h", children: [
          /* @__PURE__ */ jsx2("span", { className: "ps-badge-txt", style: { background: "rgba(255,255,255,.04)", color: meta.color, borderColor: "rgba(255,255,255,.08)" }, children: meta.label }),
          /* @__PURE__ */ jsx2("b", { children: ev.targetName || ev.targetId }),
          /* @__PURE__ */ jsx2("span", { children: timeAgo(ev.at) })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "ps-ev-sum", children: ev.summary }),
        ev.diff && ev.diff.length > 0 && /* @__PURE__ */ jsx2("div", { className: "ps-diff", children: ev.diff.map((d, i) => /* @__PURE__ */ jsxs2("div", { className: `ps-dl ${d.kind === "+" ? "add" : d.kind === "-" ? "del" : d.kind === "\u2026" ? "fold" : d.kind === "\xB1" ? "fold" : "ctx"}`, children: [
          d.kind === "\xB1" ? "\u2248 " : d.kind,
          " ",
          d.text
        ] }, i)) }),
        /* @__PURE__ */ jsx2("div", { className: "ps-actions", children: /* @__PURE__ */ jsx2("button", { className: "ps-btn sm ghost", onClick: () => sendToChat(ev), children: "\u53D1\u5230\u804A\u5929\u5206\u6790" }) })
      ] }, ev.id);
    })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ pluginId, snap, reload, showToast }) {
  const SERVICE_ID = "sentinel-service";
  const [status, setStatus] = useState3(null);
  const [statusErr, setStatusErr] = useState3("");
  const [busy, setBusy] = useState3("");
  const [draft, setDraft] = useState3(snap?.settings ?? null);
  useEffect2(() => {
    setDraft(snap?.settings ?? null);
  }, [snap?.settings]);
  const refreshStatus = async () => {
    try {
      const all = await listServiceStatus();
      setStatus(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID) ?? null);
      setStatusErr("");
    } catch (e) {
      setStatusErr(e.message);
    }
  };
  useEffect2(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 8e3);
    return () => clearInterval(t);
  }, [pluginId]);
  const doService = async (action) => {
    setBusy(action);
    try {
      await serviceAction(action, pluginId, SERVICE_ID);
      showToast(`\u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}\u670D\u52A1`);
      setTimeout(refreshStatus, 2e3);
    } catch (e) {
      showToast(`\u670D\u52A1${action === "start" ? "\u542F\u52A8" : "\u64CD\u4F5C"}\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const saveSettings = async () => {
    if (!draft) return;
    try {
      await kvSet(K.settings, {
        ...draft,
        maxConcurrency: Math.min(6, Math.max(1, Math.floor(Number(draft.maxConcurrency) || 3))),
        retentionDays: Math.max(1, Math.floor(Number(draft.retentionDays) || 30)),
        maxEventsPerTarget: Math.max(10, Math.floor(Number(draft.maxEventsPerTarget) || 50))
      });
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 60 \u79D2\u5185\u751F\u6548\uFF09");
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const clearEvents = async () => {
    if (!window.confirm("\u6E05\u7406\u5168\u90E8\u4E8B\u4EF6\uFF08\u4FDD\u7559\u76D1\u63A7\u76EE\u6807\u4E0E\u5FEB\u7167\uFF09\uFF1F")) return;
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("sentinel.event."));
      await Promise.all(keys.map((k) => kvDel(k)));
      showToast(`\u5DF2\u6E05\u7406 ${keys.length} \u6761\u4E8B\u4EF6`);
      await reload();
    } catch (e) {
      showToast(`\u6E05\u7406\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const clearAll = async () => {
    if (!window.confirm("\u5220\u9664\u7F51\u9875\u76D1\u6D4B\u7684\u5168\u90E8\u6570\u636E\uFF08\u76EE\u6807/\u72B6\u6001/\u5FEB\u7167/\u4E8B\u4EF6/\u8BBE\u7F6E\uFF09\uFF1F\u4E0D\u53EF\u6062\u590D\u3002")) return;
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("sentinel."));
      await Promise.all(keys.map((k) => kvDel(k)));
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u54E8\u5175\u6570\u636E");
      await reload();
    } catch (e) {
      showToast(`\u6E05\u7406\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const stateCls = (s) => s === "running" ? "#3FB950" : s === "error" ? "#F85149" : s === "starting" ? "#D29922" : "#8B95A7";
  const meta = snap?.meta;
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "ps-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "ps-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ps-card", children: /* @__PURE__ */ jsxs3("div", { className: "ps-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "ps-row", children: [
        /* @__PURE__ */ jsx3("i", { className: "ps-dot", style: { background: stateCls(status?.state) } }),
        /* @__PURE__ */ jsx3("b", { style: { flex: 1 }, children: status ? {
          starting: "\u542F\u52A8\u4E2D",
          running: "\u8FD0\u884C\u4E2D",
          stopping: "\u505C\u6B62\u4E2D",
          stopped: "\u5DF2\u505C\u6B62",
          error: "\u5F02\u5E38"
        }[status.state] || status.state : statusErr ? "\u72B6\u6001\u672A\u77E5" : "\u672A\u6CE8\u518C\uFF08\u63D2\u4EF6\u521A\u88C5\uFF1F\u7A0D\u5019\u5237\u65B0\uFF09" }),
        busy && /* @__PURE__ */ jsx3("span", { className: "ps-spin" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-state", children: [
        status?.pid && /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
          "PID ",
          /* @__PURE__ */ jsx3("b", { children: status.pid })
        ] }),
        status?.port ? /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
          "\xB7 \u7AEF\u53E3 ",
          /* @__PURE__ */ jsx3("b", { children: status.port })
        ] }) : null,
        status?.uptime ? /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
          "\xB7 \u5DF2\u8FD0\u884C ",
          /* @__PURE__ */ jsxs3("b", { children: [
            Math.floor(status.uptime / 60),
            " \u5206\u949F"
          ] })
        ] }) : null,
        !!status?.restartCount && /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
          "\xB7 \u91CD\u542F ",
          /* @__PURE__ */ jsx3("b", { children: status.restartCount }),
          " \u6B21"
        ] })
      ] }),
      status?.lastError && /* @__PURE__ */ jsx3("div", { className: "ps-sub", style: { color: "#F85149", marginTop: 4 }, children: status.lastError }),
      /* @__PURE__ */ jsx3("div", { className: "ps-state", children: meta ? /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
        "\u5FC3\u8DF3 ",
        /* @__PURE__ */ jsx3("b", { children: timeAgo(meta.lastTickAt) }),
        " \xB7 \u6865 ",
        /* @__PURE__ */ jsx3("b", { children: meta.bridge }),
        " \xB7 v",
        meta.version
      ] }) : /* @__PURE__ */ jsx3("span", { className: "ps-kv", children: "\u5C1A\u65E0\u5FC3\u8DF3\uFF08\u670D\u52A1\u672A\u8FD0\u884C\u65F6\u6B63\u5E38\uFF09" }) }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-actions", children: [
        /* @__PURE__ */ jsx3("button", { className: "ps-btn sm", disabled: busy !== "" || status?.state === "running" || status?.state === "starting", onClick: () => doService("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx3("button", { className: "ps-btn sm ghost", disabled: busy !== "" || !status || status.state !== "running" && status.state !== "error" && status.state !== "starting", onClick: () => doService("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx3("button", { className: "ps-btn sm ghost", disabled: busy !== "" || !status || status.state !== "running" && status.state !== "starting" && status.state !== "error", onClick: () => doService("stop"), children: "\u505C\u6B62" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "ps-sub", style: { marginTop: 8 }, children: "\u6293\u53D6\u5168\u90E8\u7531\u672C\u670D\u52A1\u5728\u540E\u53F0\u539F\u751F\u6267\u884C\uFF08\u65E0\u6D4F\u89C8\u5668\u8DE8\u57DF\u9650\u5236\uFF09\uFF1B\u684C\u9762\u4E0E\u624B\u673A Web \u9762\u677F\u901A\u8FC7 cap.kv \u770B\u5230\u540C\u4E00\u4EFD\u72B6\u6001\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ps-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "ps-bar" }),
      "\u8C03\u5EA6\u8BBE\u7F6E"
    ] }),
    draft && /* @__PURE__ */ jsx3("div", { className: "ps-card", children: /* @__PURE__ */ jsxs3("div", { className: "ps-card-b", style: { padding: 0 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "ps-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "ps-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u5168\u5C40\u6682\u505C\u8C03\u5EA6" }),
          /* @__PURE__ */ jsx3("small", { children: "\u6682\u505C\u540E\u4E0D\u53D1\u8D77\u4EFB\u4F55\u68C0\u67E5\uFF0C\u5DF2\u6709\u6570\u636E\u4FDD\u7559" })
        ] }),
        /* @__PURE__ */ jsx3(
          "button",
          {
            className: `ps-toggle ${draft.pausedAll ? "on" : ""}`,
            onClick: () => setDraft({ ...draft, pausedAll: !draft.pausedAll }),
            children: /* @__PURE__ */ jsx3("i", {})
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "ps-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u5E76\u53D1\u6293\u53D6\u6570" }),
          /* @__PURE__ */ jsx3("small", { children: "\u540C\u65F6\u6700\u591A\u53D1\u8D77\u51E0\u4E2A\u8BF7\u6C42\uFF081\u20136\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "ps-num",
            type: "number",
            min: 1,
            max: 6,
            value: draft.maxConcurrency,
            onChange: (e) => setDraft({ ...draft, maxConcurrency: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "ps-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u4E8B\u4EF6\u4FDD\u7559\u5929\u6570" }),
          /* @__PURE__ */ jsx3("small", { children: "\u8D85\u671F\u4E8B\u4EF6\u81EA\u52A8\u6E05\u7406\uFF08\u5929\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "ps-num",
            type: "number",
            min: 1,
            value: draft.retentionDays,
            onChange: (e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "ps-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u6BCF\u76EE\u6807\u4E8B\u4EF6\u4E0A\u9650" }),
          /* @__PURE__ */ jsx3("small", { children: "\u8D85\u51FA\u540E\u6700\u65E7\u7684\u88AB\u6E05\u7406\uFF08\u6761\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "ps-num",
            type: "number",
            min: 10,
            value: draft.maxEventsPerTarget,
            onChange: (e) => setDraft({ ...draft, maxEventsPerTarget: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-field", style: { flexDirection: "column", alignItems: "stretch" }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "ps-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u81EA\u5B9A\u4E49 User-Agent" }),
          /* @__PURE__ */ jsx3("small", { children: "\u7559\u7A7A\u7528\u9ED8\u8BA4\u6D4F\u89C8\u5668 UA\uFF08\u67D0\u4E9B\u7AD9\u70B9\u9700\u8981\u7279\u5B9A UA/Cookie \u65F6\u914D\u5408\u76EE\u6807\u7EA7\u8BF7\u6C42\u5934\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "ps-inp",
            value: draft.userAgent,
            placeholder: "\uFF08\u9ED8\u8BA4\uFF09",
            onChange: (e) => setDraft({ ...draft, userAgent: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "ps-actions", style: { padding: "10px 13px" }, children: /* @__PURE__ */ jsx3("button", { className: "ps-btn sm", onClick: saveSettings, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ps-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "ps-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ps-card", children: /* @__PURE__ */ jsxs3("div", { className: "ps-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "ps-state", style: { marginTop: 0 }, children: [
        /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
          "\u76EE\u6807 ",
          /* @__PURE__ */ jsx3("b", { children: snap?.rows.length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "ps-kv", children: [
          "\xB7 \u5B58\u50A8 ",
          /* @__PURE__ */ jsx3("b", { children: "cap.kv\uFF08sentinel.* \u952E\u7A7A\u95F4\uFF09" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ps-actions", children: [
        /* @__PURE__ */ jsx3("button", { className: "ps-btn sm ghost", onClick: clearEvents, children: "\u6E05\u7406\u5168\u90E8\u4E8B\u4EF6" }),
        /* @__PURE__ */ jsx3("button", { className: "ps-btn sm danger", onClick: clearAll, children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ps-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "ps-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ps-card", children: /* @__PURE__ */ jsxs3("div", { className: "ps-card-b ps-sub", children: [
      "\u7F51\u9875\u76D1\u6D4B page-sentinel v0.1.0 \u2014\u2014 \u76EF\u7F51\u9875\u53D8\u5316\u7684\u540E\u53F0\u54E8\u5175\uFF1A\u4EF7\u683C / \u5E93\u5B58 / \u653E\u53F7 / \u8003\u4F4D / release / \u6587\u6863\u66F4\u65B0\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u6D4F\u89C8\u5668\u6709\u540C\u6E90\u7B56\u7565\uFF0C\u672C\u63D2\u4EF6\u628A\u6293\u53D6\u4E0B\u6C89\u5230\u540E\u53F0\u670D\u52A1\u539F\u751F\u6267\u884C\uFF0C\u5929\u7136\u65E0\u8DE8\u57DF\u95EE\u9898\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u624B\u673A\u7AEF\u8BBF\u95EE\u65F6\u9762\u677F\u7ECF\u5BBF\u4E3B\u7EDF\u4E00\u901A\u9053\uFF08\u81EA\u52A8\u5E26 token\uFF09\u8BFB\u5199 cap.kv\uFF0C\u4E0E\u684C\u9762\u770B\u5230\u540C\u4E00\u4EFD\u6570\u636E\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u5728\u804A\u5929\u91CC\u53EF\u76F4\u63A5\u8BA9 AI \u7BA1\u7406\u76D1\u63A7\uFF08sentinel_add_watch \u7B49\u5DE5\u5177\uFF09\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u6293\u53D6\u793C\u8C8C\u7B56\u7565\uFF1A\u540C\u4E00\u4E3B\u673A\u81F3\u5C11\u95F4\u9694 15 \u79D2\uFF0C\u5355\u673A\u5E76\u53D1\u9ED8\u8BA4 3\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.ps-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ps-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ps-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ps-body::-webkit-scrollbar{width:9px;height:9px}
.ps-body::-webkit-scrollbar-track{background:transparent}
.ps-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ps-page{max-width:520px;margin:0 auto}

/* \u5934\u90E8 */
.ps-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ps-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2EA98C,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ps-tt{flex:1;min-width:0}
.ps-tt b{font-size:15px;display:block}
.ps-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ps-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ps-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ps-dot.stale{background:#D29922}
.ps-dot.down{background:#F85149}
.ps-tabs{display:flex;gap:4px}
.ps-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.ps-tab:hover{color:#E6EAF2}
.ps-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ps-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.ps-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ps-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ps-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2EA98C,#58A6FF);flex-shrink:0}
.ps-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ps-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ps-card-b{padding:11px 13px}
.ps-card-b b{font-size:13px}
.ps-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ps-url{font-size:10.5px;color:#5C6678;word-break:break-all;line-height:1.5}
.ps-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ps-badge-txt{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.ps-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ps-btn:hover{filter:brightness(1.1)}
.ps-btn:disabled{opacity:.45;cursor:not-allowed}
.ps-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ps-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ps-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ps-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ps-inp:focus{outline:none;border-color:#2b6cb0}
.ps-inp::placeholder{color:#4d5566}
.ps-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.ps-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.ps-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ps-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ps-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ps-toast.bad{border-color:#54262c;color:#FF8A9A}
.ps-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:ps-spin .8s linear infinite;vertical-align:-1px}
@keyframes ps-spin{to{transform:rotate(360deg)}}

/* \u72B6\u6001\u884C */
.ps-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.ps-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.ps-kv{color:#5C6678}
.ps-kv b{color:#B4B4B8;font-weight:600}

/* diff */
.ps-diff{background:#0d1017;border:1px solid #212836;border-radius:8px;padding:7px 0;margin-top:8px;font:11px/1.6 Consolas,Menlo,monospace;overflow-x:auto;max-height:260px;overflow-y:auto}
.ps-dl{padding:0 10px;white-space:pre-wrap;word-break:break-all}
.ps-dl.add{color:#3FB950;background:rgba(63,185,80,.08)}
.ps-dl.del{color:#F85149;background:rgba(248,81,73,.08)}
.ps-dl.fold{color:#4d5566}
.ps-dl.ctx{color:#7d8590}

/* \u4E8B\u4EF6\u6D41 */
.ps-ev{border-left:2px solid #242C3A;padding:8px 12px 8px 12px;margin:0 16px 8px;background:#141821;border-radius:0 10px 10px 0}
.ps-ev-h{display:flex;align-items:center;gap:7px;font-size:11px;color:#5C6678}
.ps-ev-h b{color:#E6EAF2;font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-ev-sum{font-size:12px;color:#C9D1D9;margin-top:3px;line-height:1.5}

/* \u8BBE\u7F6E */
.ps-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.ps-field:first-child{border-top:none}
.ps-field-l{flex:1;min-width:0}
.ps-field-l b{font-size:12.5px;display:block}
.ps-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ps-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ps-toggle.on{background:#2b6cb0}
.ps-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ps-toggle.on i{left:18px}
.ps-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`;
function SentinelPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("watch");
  const [snap, setSnap] = useState4(null);
  const [readAt, setReadAt] = useState4(0);
  const [newCount, setNewCount] = useState4(0);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const readAtRef = useRef(0);
  const toastTimer = useRef(null);
  const showToast = useCallback2((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback2(async () => {
    try {
      const s = await loadSnapshot(readAtRef.current);
      setSnap(s);
      setLoadErr("");
      setNewCount(s.newCount);
      return s;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  const refreshReadAt = useCallback2(async () => {
    const r = await loadReadAt().catch(() => 0);
    readAtRef.current = r;
    setReadAt(r);
  }, []);
  useEffect3(() => {
    refreshReadAt();
  }, [refreshReadAt]);
  useEffect3(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 5e3);
    const onVis = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const markRead = useCallback2(async () => {
    const now = Date.now();
    await kvSet(K.readAt, now).catch(() => {
    });
    readAtRef.current = now;
    setReadAt(now);
    setNewCount(0);
  }, []);
  const heartbeat = (() => {
    if (!snap) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = snap.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const age = Date.now() - last;
    if (age < 120 * 1e3) return { cls: "ok", text: `\u54E8\u5175\u5728\u7EBF \xB7 \u6865 ${snap.meta?.bridge || "?"}` };
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  return /* @__PURE__ */ jsxs4("div", { className: "ps-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "ps-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "ps-logo", children: "\u{1F6E1}\uFE0F" }),
      /* @__PURE__ */ jsxs4("div", { className: "ps-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u7F51\u9875\u76D1\u6D4B" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          /* @__PURE__ */ jsx4("i", { className: `ps-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "ps-tabs", children: [
        ["watch", "\u76D1\u63A7"],
        ["feed", "\u52A8\u6001"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs4("button", { className: `ps-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "feed" && newCount > 0 && /* @__PURE__ */ jsx4("span", { className: "ps-badge", children: newCount > 99 ? "99+" : newCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ps-body", children: /* @__PURE__ */ jsxs4("div", { className: "ps-page", children: [
      loadErr && /* @__PURE__ */ jsxs4("div", { className: "ps-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "watch" && /* @__PURE__ */ jsx4(WatchTab, { snap, reload, showToast, markRead, goFeed: () => setTab("feed") }),
      tab === "feed" && /* @__PURE__ */ jsx4(FeedTab, { onSendToChat, showToast, markRead, unread: newCount }),
      tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { pluginId, snap, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx4("div", { className: `ps-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function PageSentinelEntry(props) {
  return /* @__PURE__ */ jsx5(SentinelPanel, { ...props });
}
export {
  PageSentinelEntry as default
};
