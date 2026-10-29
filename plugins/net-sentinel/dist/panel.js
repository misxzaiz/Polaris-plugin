// src/Panel.tsx
import { useCallback, useEffect as useEffect4, useRef, useState as useState4 } from "react";

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
var EVENT_TYPE_META = {
  net_down: { label: "\u65AD\u7F51", color: "#F85149" },
  net_recovered: { label: "\u7F51\u7EDC\u6062\u590D", color: "#3FB950" },
  target_down: { label: "\u76EE\u6807\u5931\u8054", color: "#F85149" },
  target_recovered: { label: "\u76EE\u6807\u6062\u590D", color: "#3FB950" },
  latency_high: { label: "\u5EF6\u8FDF\u52A3\u5316", color: "#D29922" },
  latency_recovered: { label: "\u5EF6\u8FDF\u56DE\u843D", color: "#3FB950" }
};
var DEFAULT_SETTINGS = {
  tickSec: 10,
  timeoutMs: 3e3,
  latencyMs: 400,
  sustainRounds: 6,
  retentionHours: 720,
  speedMb: 10,
  speedUrl: "",
  paused: false
};
var K = {
  snapshot: "netmon.snapshot",
  meta: "netmon.meta",
  settings: "netmon.settings",
  targets: "netmon.targets",
  hour: (key) => `netmon.h.${key}`,
  eventPrefix: "netmon.event.",
  speedPrefix: "netmon.speed.",
  cmdSpeed: (nonce2) => `netmon.cmd.speed.${nonce2}`,
  cmdTargets: (nonce2) => `netmon.cmd.targets.${nonce2}`,
  result: (nonce2) => `netmon.result.${nonce2}`,
  readAt: "netmon.readAt"
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
async function loadPanelData(readAt = 0) {
  const [rawSnap, rawMeta, rawSettings, keys] = await Promise.all([
    kvGet(K.snapshot),
    kvGet(K.meta),
    kvGet(K.settings),
    kvKeys()
  ]);
  let newCount = 0;
  if (readAt > 0) {
    for (const k of keys) {
      if (!k.startsWith(K.eventPrefix)) continue;
      const at = Number(k.slice(K.eventPrefix.length));
      if (Number.isFinite(at) && at > readAt) newCount++;
    }
  }
  return {
    snap: rawSnap && typeof rawSnap === "object" ? rawSnap : null,
    meta: rawMeta && typeof rawMeta === "object" ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...rawSettings && typeof rawSettings === "object" ? rawSettings : {} },
    newCount
  };
}
async function loadEvents(limit = 60) {
  const keys = await kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort().slice(-limit).reverse();
  const events = await Promise.all(evKeys.map((k) => kvGet(k)));
  return events.filter((e) => !!e && typeof e === "object" && typeof e.at === "number").sort((a, b) => b.at - a.at);
}
async function loadReadAt() {
  const v = await kvGet(K.readAt);
  return typeof v === "number" ? v : 0;
}
async function markAllRead() {
  await kvSet(K.readAt, Date.now());
}
async function clearEvents() {
  const keys = await kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix));
  await Promise.all(evKeys.map((k) => kvDel(k)));
  return evKeys.length;
}
function hourKeyOf(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
}
async function loadHourBuckets(hours) {
  const keys = [];
  const now = Date.now();
  for (let i = 0; i < hours; i++) keys.push(hourKeyOf(now - i * 3600 * 1e3));
  const uniq = [...new Set(keys)];
  const out = /* @__PURE__ */ new Map();
  const CHUNK = 24;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    const vals = await Promise.all(part.map((k) => kvGet(K.hour(k)).catch(() => null)));
    part.forEach((k, j) => {
      const v = vals[j];
      if (v && typeof v === "object" && v.byTarget) out.set(k, v);
    });
  }
  return out;
}
async function loadSpeeds(limit = 8) {
  const keys = await kvKeys();
  const spKeys = keys.filter((k) => k.startsWith(K.speedPrefix)).sort().slice(-limit).reverse();
  const recs = await Promise.all(spKeys.map((k) => kvGet(k)));
  return recs.filter((s) => !!s && typeof s === "object" && typeof s.at === "number");
}
async function clearAllData() {
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith("netmon."));
  for (const k of mine) await kvDel(k).catch(() => {
  });
  return mine.length;
}
function nonce(prefix) {
  const c = globalThis.crypto;
  const id = c && typeof c.randomUUID === "function" ? c.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix + id;
}
async function waitResult(n, timeoutMs, stepMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, stepMs));
    const r = await kvGet(K.result(n)).catch(() => null);
    if (r) {
      kvDel(K.result(n)).catch(() => {
      });
      return r;
    }
  }
  return null;
}
async function runSpeedtest(payload) {
  const n = nonce("s");
  await kvSet(K.cmdSpeed(n), { ...payload, confirm: true, at: Date.now() });
  const r = await waitResult(n, 70 * 1e3);
  if (!r) return { ok: false, error: "\u7B49\u5F85\u6D4B\u901F\u7ED3\u679C\u8D85\u65F6\uFF1A\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E Tab \u53EF\u67E5\u770B/\u542F\u52A8\u670D\u52A1\uFF09\uFF0C\u6216\u6D4B\u901F\u8D85\u8FC7 70s" };
  if (r.ok) return { ok: true, ...r.payload ?? {} };
  return { ok: false, error: String(r.error || "\u6D4B\u901F\u5931\u8D25") };
}
async function mutateTargets(payload) {
  const n = nonce("t");
  await kvSet(K.cmdTargets(n), { ...payload, at: Date.now() });
  const r = await waitResult(n, 20 * 1e3);
  if (!r) return { ok: false, error: "\u7B49\u5F85\u7ED3\u679C\u8D85\u65F6\uFF1A\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E Tab \u53EF\u67E5\u770B/\u542F\u52A8\u670D\u52A1\uFF09" };
  if (r.ok) return { ok: true };
  return { ok: false, error: String(r.error || "\u64CD\u4F5C\u5931\u8D25") };
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
var SERVICE_ID = "net-service";
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
function msColor(ms) {
  if (ms === null || ms === void 0 || !Number.isFinite(ms)) return "#8B95A7";
  if (ms < 150) return "#3FB950";
  if (ms < 400) return "#58A6FF";
  if (ms < 800) return "#D29922";
  return "#F85149";
}
function fmtMs(ms) {
  if (ms === null || ms === void 0 || !Number.isFinite(ms)) return "\u2014";
  return ms >= 1e3 ? `${(ms / 1e3).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
function fmtMbps(v) {
  if (v === null || v === void 0 || !Number.isFinite(v)) return "\u2014";
  return v >= 100 ? `${Math.round(v)} Mbps` : `${v.toFixed(1)} Mbps`;
}
function snapAge(snap) {
  if (!snap || typeof snap.at !== "number") return Infinity;
  return Math.max(0, Math.round((Date.now() - snap.at) / 1e3));
}
function heartbeatOf(snap, meta) {
  const age = snapAge(snap);
  if (!snap || age === Infinity) {
    if (meta?.lastTickAt && Date.now() - meta.lastTickAt < 150 * 1e3) {
      return { state: "stale", text: "\u670D\u52A1\u542F\u52A8\u4E2D\uFF0C\u5FEB\u7167\u672A\u5C31\u7EEA" };
    }
    return { state: "down", text: "\u670D\u52A1\u672A\u8FD0\u884C\u6216\u65E0\u5FEB\u7167" };
  }
  const tick = Math.max(5, snap.tickSec || 10);
  if (age <= tick * 3) {
    return { state: "ok", text: `${snap.online ? "\u7F51\u7EDC\u5728\u7EBF" : "\u7F51\u7EDC\u79BB\u7EBF"} \xB7 \u6BCF ${tick}s \u63A2\u6D4B` };
  }
  return { state: "stale", text: `\u5FEB\u7167\u505C\u6EDE ${age >= 90 ? `${Math.round(age / 60)} \u5206\u949F` : `${age} \u79D2`}` };
}

// src/OverviewTab.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var KIND_META = {
  gateway: "\u7F51\u5173",
  anchor: "\u951A\u70B9",
  normal: "\u7AD9\u70B9"
};
function Spark({ recent, color }) {
  const pts = recent.slice(-60);
  if (pts.length < 2) return /* @__PURE__ */ jsx("svg", { className: "ns-spark" });
  const vals = pts.map((p) => p[1]);
  const known = vals.filter((v) => v !== null && Number.isFinite(v));
  const max = known.length ? Math.max(...known, 50) : 100;
  const w = 100;
  const hgt = 30;
  const xStep = w / Math.max(1, pts.length - 1);
  const segments = [];
  let cur = [];
  pts.forEach((p, i) => {
    if (p[1] === null || !Number.isFinite(p[1])) {
      if (cur.length > 1) segments.push(cur.join(" "));
      cur = [];
      return;
    }
    const y = hgt - 2 - p[1] / max * (hgt - 6);
    cur.push(`${(i * xStep).toFixed(1)},${y.toFixed(1)}`);
  });
  if (cur.length > 1) segments.push(cur.join(" "));
  return /* @__PURE__ */ jsx("svg", { className: "ns-spark", viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none", children: segments.map((s, i) => /* @__PURE__ */ jsx("polyline", { points: s, fill: "none", stroke: color, strokeWidth: "1.4", strokeLinejoin: "round", strokeLinecap: "round" }, i)) });
}
function lossPctOf(recent) {
  const win = recent.slice(-30);
  if (!win.length) return null;
  const okN = win.filter((p) => p[1] !== null && Number.isFinite(p[1])).length;
  return Math.round((win.length - okN) / win.length * 100);
}
function TargetCard({ t, snap }) {
  const r = snap.round[t.id];
  const recent = snap.recent[t.id] || [];
  const loss = lossPctOf(recent);
  const dns = r && Number.isFinite(r.dnsMs) ? r.dnsMs : null;
  return /* @__PURE__ */ jsxs("div", { className: `ns-tcard ${r && !r.ok ? "dead" : ""}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "ns-tc-h", children: [
      /* @__PURE__ */ jsx("span", { className: "ns-tc-name", children: t.label }),
      /* @__PURE__ */ jsxs("span", { className: "ns-tc-host", children: [
        t.host || "(\u81EA\u52A8\u7F51\u5173)",
        ":",
        t.port,
        " \xB7 ",
        KIND_META[t.kind] || t.kind
      ] }),
      /* @__PURE__ */ jsx("span", { className: "ns-tc-ms", style: { color: r && r.ok ? msColor(r.ms) : "#F85149" }, children: r ? r.ok ? fmtMs(r.ms) : "\u2717" : "\u2026" })
    ] }),
    /* @__PURE__ */ jsx(Spark, { recent, color: r && r.ok ? msColor(r.ms) : "#F85149" }),
    /* @__PURE__ */ jsxs("div", { className: "ns-tc-meta", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "\u8FD130\u8F6E\u4E22\u5305 ",
        loss === null ? "\u2014" : `${loss}%`
      ] }),
      dns !== null && /* @__PURE__ */ jsxs("span", { children: [
        "DNS ",
        fmtMs(dns)
      ] }),
      r && !r.ok && /* @__PURE__ */ jsxs("span", { style: { color: "#FF8A9A" }, children: [
        "\u5931\u8054\uFF1A",
        r.err || "\u65E0\u5E94\u7B54"
      ] }),
      !t.enabled && /* @__PURE__ */ jsx("span", { className: "ns-tag", children: "\u5DF2\u505C\u7528" })
    ] })
  ] });
}
function OverviewTab({ data, goHistory, goFeed }) {
  const snap = data?.snap ?? null;
  if (!snap) {
    return /* @__PURE__ */ jsxs("div", { className: "ns-empty", children: [
      "\u6682\u65E0\u5FEB\u7167\uFF1A\u540E\u53F0\u63A2\u6D4B\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5230\u300C\u8BBE\u7F6E\u300DTab \u67E5\u770B\u670D\u52A1\u72B6\u6001\u5E76\u542F\u52A8\u3002"
    ] });
  }
  const best = snap.targets.filter((t) => t.enabled !== false).map((t) => snap.round[t.id]).filter((r) => r && r.ok && Number.isFinite(r.ms)).map((r) => r.ms);
  const bestMs = best.length ? Math.min(...best) : null;
  const online = snap.online;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: `ns-online ${online ? "up" : "down"}`, children: [
      /* @__PURE__ */ jsx("span", { className: "ns-online-i", children: online ? "\u{1F7E2}" : "\u{1F534}" }),
      /* @__PURE__ */ jsxs("span", { className: "ns-online-t", children: [
        /* @__PURE__ */ jsx("b", { children: online ? "\u7F51\u7EDC\u5728\u7EBF" : "\u7F51\u7EDC\u79BB\u7EBF" }),
        /* @__PURE__ */ jsxs("small", { children: [
          "\u951A\u70B9\u5224\u5B9A \xB7 \u672C\u4F1A\u8BDD ",
          snap.counts.rounds,
          " \u8F6E / ",
          snap.counts.probes,
          " \u6B21\u63A2\u6D4B / \u4E22\u5305 ",
          snap.counts.probes ? Math.round(snap.counts.losses / snap.counts.probes * 100) : 0,
          "%",
          snap.speeding ? " \xB7 \u6D4B\u901F\u8FDB\u884C\u4E2D\u2026" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "ns-online-ms", style: { color: msColor(bestMs) }, children: [
        bestMs !== null ? fmtMs(bestMs) : "\u2014",
        /* @__PURE__ */ jsx("small", { children: "\u6700\u5FEB\u76EE\u6807" })
      ] })
    ] }),
    !online && /* @__PURE__ */ jsx("div", { className: "ns-strip", onClick: goFeed, children: "\u26A0 \u7F51\u7EDC\u5F53\u524D\u5224\u5B9A\u4E3A\u79BB\u7EBF\uFF08\u951A\u70B9\u5168\u90E8\u6216\u591A\u6570\u5931\u8054\uFF09\u3002\u67E5\u770B\u4E8B\u4EF6\u7EBF \u2192" }),
    /* @__PURE__ */ jsx("div", { className: "ns-cards", children: snap.targets.map((t) => /* @__PURE__ */ jsx(TargetCard, { t, snap }, t.id)) }),
    snap.speeds.length > 0 && /* @__PURE__ */ jsx("div", { children: snap.speeds.slice(0, 3).map((s) => /* @__PURE__ */ jsxs("div", { className: "ns-kv", children: [
      /* @__PURE__ */ jsx("span", { style: { color: s.ok ? "#3FB950" : "#F85149" }, children: s.ok ? "\u26A1" : "\u2717" }),
      /* @__PURE__ */ jsx("b", { style: { color: s.ok ? "#58A6FF" : "#F85149" }, children: s.ok ? `${s.mbps} Mbps` : "\u6D4B\u901F\u5931\u8D25" }),
      /* @__PURE__ */ jsxs("small", { children: [
        new Date(s.at).toLocaleString("zh-CN", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        s.ok && Number.isFinite(s.latencyMs) ? ` \xB7 \u9996\u5B57\u8282 ${Math.round(s.latencyMs)}ms` : "",
        s.err ? ` \xB7 ${s.err}` : ""
      ] })
    ] }, s.at)) })
  ] });
}

// src/HistoryTab.tsx
import { useEffect, useMemo, useState } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function aggHour(recs) {
  const okMs = [];
  let loss = 0;
  let cnt = 0;
  let max = 0;
  for (const r of recs) {
    if (!Array.isArray(r) || r.length < 5) continue;
    cnt += r[4];
    loss += r[3];
    if (r[1] !== null && Number.isFinite(r[1])) okMs.push(r[1] / 10);
    if (Number.isFinite(r[2]) && r[2] > max) max = r[2];
  }
  return {
    avg: okMs.length ? okMs.reduce((a, b) => a + b, 0) / okMs.length : null,
    max: max || null,
    loss,
    cnt
  };
}
function heatColor(cell) {
  if (!cell || cell.cnt === 0) return "#1a2029";
  if (cell.lossPct >= 50) return "#F85149";
  if (cell.lossPct > 0) return "#8c3a35";
  if (cell.avg === null) return "#1a2029";
  return msColor(cell.avg);
}
function Chart({ cells, color }) {
  const w = 100;
  const hgt = 90;
  const vals = cells.map((c) => c && c.avg !== null && Number.isFinite(c.avg) ? c.avg : null);
  const known = vals.filter((v) => v !== null);
  const max = Math.max(200, ...known.length ? known : [0]) * 1.15;
  const xStep = w / Math.max(1, cells.length - 1);
  const segments = [];
  let cur = [];
  vals.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) segments.push(cur.join(" "));
      cur = [];
      return;
    }
    const y = hgt - 4 - v / max * (hgt - 10);
    cur.push(`${(i * xStep).toFixed(2)},${y.toFixed(2)}`);
  });
  if (cur.length > 1) segments.push(cur.join(" "));
  return /* @__PURE__ */ jsxs2("svg", { width: "100%", height: hgt, viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none", style: { display: "block" }, children: [
    [0.25, 0.5, 0.75].map((f) => /* @__PURE__ */ jsx2("line", { x1: "0", x2: w, y1: hgt - 4 - f * (hgt - 10), y2: hgt - 4 - f * (hgt - 10), stroke: "#1d2330", strokeWidth: "0.4" }, f)),
    segments.map((s, i) => /* @__PURE__ */ jsx2("polyline", { points: s, fill: "none", stroke: color, strokeWidth: "1.4", strokeLinejoin: "round", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" }, i))
  ] });
}
function HistoryTab({ data }) {
  const [range, setRange] = useState(24);
  const [buckets, setBuckets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState("");
  const targets = data?.snap?.targets ?? [];
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadHourBuckets(range).then((m) => {
      if (!alive) return;
      setBuckets(m);
      setLoading(false);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [range]);
  const hourKeys = useMemo(() => {
    const now = Date.now();
    const out = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now - i * 3600 * 1e3);
      const p = (n) => String(n).padStart(2, "0");
      out.push(`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`);
    }
    return out;
  }, [range]);
  const perTarget = useMemo(() => {
    const out = /* @__PURE__ */ new Map();
    if (!buckets) return out;
    for (const tid of new Set([...buckets.values()].flatMap((b) => Object.keys(b.byTarget)))) {
      const cells = hourKeys.map((k) => {
        const b = buckets.get(k);
        if (!b || !b.byTarget[tid]) return null;
        const a = aggHour(b.byTarget[tid]);
        if (!a.cnt) return null;
        return { key: k, avg: a.avg, max: a.max, lossPct: a.cnt ? Math.round(a.loss / a.cnt * 1e3) / 10 : 0, cnt: a.cnt };
      });
      out.set(tid, cells);
    }
    return out;
  }, [buckets, hourKeys]);
  const selId = sel || [...perTarget.keys()][0] || "";
  const selCells = perTarget.get(selId) || [];
  const selTarget = targets.find((t) => t.id === selId);
  const tableRows = useMemo(() => {
    const rows = [];
    for (const t of targets) {
      const cells = perTarget.get(t.id);
      if (!cells) continue;
      const recs = [];
      for (const k of hourKeys) {
        const b = buckets?.get(k);
        if (b && b.byTarget[t.id]) recs.push(...b.byTarget[t.id]);
      }
      const allOk = [];
      let loss = 0;
      let cnt = 0;
      let max = 0;
      for (const r of recs) {
        if (!Array.isArray(r) || r.length < 5) continue;
        cnt += r[4];
        loss += r[3];
        if (r[1] !== null && Number.isFinite(r[1])) allOk.push(r[1] / 10);
        if (Number.isFinite(r[2]) && r[2] > max) max = r[2];
      }
      if (!cnt) continue;
      allOk.sort((a, b) => a - b);
      rows.push({
        tid: t.id,
        label: t.label,
        avg: allOk.length ? Math.round(allOk.reduce((a, b) => a + b, 0) / allOk.length * 10) / 10 : null,
        p95v: allOk.length ? allOk[Math.min(allOk.length - 1, Math.ceil(allOk.length * 0.95) - 1)] : null,
        max: max || null,
        lossPct: Math.round(loss / cnt * 1e3) / 10,
        cnt
      });
    }
    rows.sort((a, b) => b.lossPct - a.lossPct || (b.avg ?? 0) - (a.avg ?? 0));
    return rows;
  }, [targets, perTarget, buckets, hourKeys]);
  if (!data?.snap) {
    return /* @__PURE__ */ jsx2("div", { className: "ns-empty", children: "\u6682\u65E0\u5FEB\u7167\uFF1A\u540E\u53F0\u63A2\u6D4B\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\u3002" });
  }
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "ns-h-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "ns-h-bar" }),
      "\u65F6\u95F4\u8303\u56F4",
      /* @__PURE__ */ jsx2("span", { className: "ns-hint", children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : `${[...buckets?.keys() ?? []].length} \u4E2A\u5C0F\u65F6\u6876` })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ns-h-range", children: [24, 72, 168].map((r) => /* @__PURE__ */ jsx2("button", { className: `ns-h-chip ${range === r ? "on" : ""}`, onClick: () => setRange(r), children: r === 24 ? "24 \u5C0F\u65F6" : r === 72 ? "72 \u5C0F\u65F6" : "7 \u5929" }, r)) }),
    targets.length > 0 && /* @__PURE__ */ jsx2("div", { className: "ns-h-range", style: { flexWrap: "wrap" }, children: targets.map((t) => /* @__PURE__ */ jsx2(
      "button",
      {
        className: `ns-h-chip ${selId === t.id ? "on" : ""}`,
        onClick: () => setSel(t.id),
        children: t.label
      },
      t.id
    )) }),
    /* @__PURE__ */ jsxs2("div", { className: "ns-h-heat", children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 12.5 }, children: selTarget ? selTarget.label : "\uFF08\u65E0\u6570\u636E\uFF09" }),
        /* @__PURE__ */ jsx2("span", { style: { color: "#5C6678", fontSize: 10.5 }, children: "\u9010\u5C0F\u65F6\uFF1A\u989C\u8272=\u5E73\u5747\u5EF6\u8FDF\uFF0C\u7EA2=\u4E22\u5305" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "ns-h-heat-row", children: selCells.map((c, i) => /* @__PURE__ */ jsx2("span", { className: "ns-h-cell", style: { background: heatColor(c) }, title: `${c ? `${c.key} \xB7 avg ${fmtMs(c.avg)} \xB7 \u4E22\u5305 ${c.lossPct}% \xB7 ${c.cnt} \u6B21` : "\u65E0\u6570\u636E"}` }, i)) }),
      /* @__PURE__ */ jsxs2("div", { className: "ns-h-heat-l", children: [
        /* @__PURE__ */ jsx2("span", { children: range === 24 ? "\u6BCF\u683C=1\u5C0F\u65F6" : `${Math.round(range / 24)}\u5929\u6BCF\u683C=1\u5C0F\u65F6` }),
        /* @__PURE__ */ jsx2("span", { children: "\u4F18<150ms \xB7 \u826F<400ms \xB7 \u7F13<800ms \xB7 \u52A3\u2265800ms" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ns-h-chart", children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 12.5 }, children: "\u5E73\u5747\u5EF6\u8FDF\u8D70\u52BF" }),
        /* @__PURE__ */ jsx2("span", { style: { color: "#5C6678", fontSize: 10.5 }, children: selTarget ? `${selTarget.host}:${selTarget.port}` : "" }),
        /* @__PURE__ */ jsxs2("span", { style: { color: "#5C6678", fontSize: 10.5, marginLeft: "auto" }, children: [
          "\u5CF0\u503C ",
          fmtMs(Math.max(0, ...selCells.map((c) => c && c.max || 0)))
        ] })
      ] }),
      /* @__PURE__ */ jsx2(Chart, { cells: selCells, color: msColor(selCells.length ? selCells[selCells.length - 1]?.avg ?? null : null) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ns-h-table", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ns-h-tr n", children: [
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c1", children: "\u76EE\u6807" }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", children: "\u5747\u503C" }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", children: "P95" }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", children: "\u5CF0\u503C" }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", children: "\u4E22\u5305" })
      ] }),
      tableRows.length === 0 && /* @__PURE__ */ jsx2("div", { className: "ns-empty", style: { padding: 18 }, children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u8BE5\u8303\u56F4\u5185\u6682\u65E0\u63A2\u6D4B\u6570\u636E\uFF08\u670D\u52A1\u521A\u542F\u52A8\u6216\u5DF2\u6E05\u7A7A\uFF09" }),
      tableRows.map((r) => /* @__PURE__ */ jsxs2("div", { className: "ns-h-tr", children: [
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c1", children: r.label }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", style: { color: msColor(r.avg) }, children: fmtMs(r.avg) }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", children: fmtMs(r.p95v) }),
        /* @__PURE__ */ jsx2("span", { className: "ns-h-c", children: fmtMs(r.max) }),
        /* @__PURE__ */ jsxs2("span", { className: "ns-h-c", style: { color: r.lossPct > 0 ? "#F85149" : "#3FB950" }, children: [
          r.lossPct,
          "%"
        ] })
      ] }, r.tid))
    ] })
  ] });
}

// src/FeedTab.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function FeedTab({ onSendToChat, showToast, markRead, unread, reload }) {
  const [events, setEvents] = useState2(null);
  const refresh = async () => {
    try {
      setEvents(await loadEvents(60));
    } catch (e) {
      showToast(`\u4E8B\u4EF6\u52A0\u8F7D\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  useEffect2(() => {
    refresh();
  }, []);
  const doClear = async () => {
    if (!window.confirm("\u6E05\u7A7A\u5168\u90E8\u7F51\u7EDC\u4E8B\u4EF6\u8BB0\u5F55\uFF1F\uFF08\u4E0D\u5F71\u54CD\u63A2\u6D4B\u4E0E\u5386\u53F2\u6876\uFF09")) return;
    const n = await clearEvents().catch(() => 0);
    showToast(`\u5DF2\u6E05\u7A7A ${n} \u6761\u4E8B\u4EF6`);
    await refresh();
    await reload();
  };
  const doSend = (ev) => {
    if (!onSendToChat) return;
    onSendToChat(`\u3010\u7F51\u7EDC\u54E8\u5175\u4E8B\u4EF6\u3011${new Date(ev.at).toLocaleString("zh-CN", { hour12: false })} ${ev.summary}`);
  };
  if (events === null) return /* @__PURE__ */ jsx3("div", { className: "ns-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "ns-feed-hint", children: [
      "\u6700\u8FD1 ",
      events.length,
      " \u6761\u4E8B\u4EF6\uFF08\u8FB9\u6CBF\u89E6\u53D1\uFF0C\u540C\u7C7B\u81F3\u5C11\u95F4\u9694 30 \u5206\u949F\uFF09",
      unread > 0 && /* @__PURE__ */ jsxs3("button", { className: "ns-btn sm", onClick: () => {
        markRead();
        showToast("\u5DF2\u5168\u90E8\u6807\u8BB0\u5DF2\u8BFB");
      }, children: [
        "\u6807\u8BB0\u5DF2\u8BFB(",
        unread,
        ")"
      ] }),
      events.length > 0 && /* @__PURE__ */ jsx3("button", { className: "ns-btn sm danger", onClick: doClear, children: "\u6E05\u7A7A" })
    ] }),
    events.length === 0 && /* @__PURE__ */ jsxs3("div", { className: "ns-empty", children: [
      "\u8FD8\u6CA1\u6709\u7F51\u7EDC\u4E8B\u4EF6\u2014\u2014\u8BF4\u660E\u7F51\u7EDC\u4E00\u76F4\u5B89\u7A33\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      /* @__PURE__ */ jsx3("span", { style: { fontSize: 10.5, color: "#5C6678" }, children: "\u65AD\u7F51\u3001\u76EE\u6807\u5931\u8054\u3001\u5EF6\u8FDF\u52A3\u5316\u53D1\u751F\u65F6\u4F1A\u8BB0\u5F55\u5728\u8FD9\u91CC\u3002" })
    ] }),
    events.map((ev) => {
      const meta = EVENT_TYPE_META[ev.type] || { label: ev.type, color: "#8B95A7" };
      const bad = ev.type.endsWith("_down") || ev.type === "latency_high";
      return /* @__PURE__ */ jsxs3("div", { className: "ns-ev", style: { borderLeftColor: meta.color }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "ns-ev-h", children: [
          /* @__PURE__ */ jsx3("b", { style: { color: meta.color }, children: meta.label }),
          /* @__PURE__ */ jsx3("span", { children: new Date(ev.at).toLocaleString("zh-CN", { hour12: false }) }),
          onSendToChat && /* @__PURE__ */ jsx3("button", { className: "ns-btn sm ghost", style: { marginLeft: "auto" }, onClick: () => doSend(ev), children: "\u95EE AI" })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "ns-ev-sum", children: ev.summary })
      ] }, ev.at);
    })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var NUM_FIELDS = [
  { key: "tickSec", label: "\u63A2\u6D4B\u95F4\u9694\uFF08\u79D2\uFF09", hint: "\u6BCF N \u79D2\u5BF9\u5168\u90E8\u76EE\u6807\u63A2\u4E00\u8F6E\uFF085-120\uFF09", min: 5, max: 120 },
  { key: "timeoutMs", label: "\u5355\u6B21\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09", hint: "TCP \u63E1\u624B\u8D85\u65F6\u5373\u8BB0\u4E22\u5305\uFF081000-10000\uFF09", min: 1e3, max: 1e4 },
  { key: "latencyMs", label: "\u52A3\u5316\u9608\u503C\uFF08\u6BEB\u79D2\uFF09", hint: "\u6301\u7EED\u9AD8\u4E8E\u6B64\u5E73\u5747\u5EF6\u8FDF\u8BB0\u300C\u5EF6\u8FDF\u52A3\u5316\u300D\u4E8B\u4EF6\uFF08100-10000\uFF09", min: 100, max: 1e4 },
  { key: "sustainRounds", label: "\u6301\u7EED\u8F6E\u6570", hint: "\u8FDE\u7EED N \u8F6E\u5F02\u5E38\u624D\u89E6\u53D1\u4E8B\u4EF6\uFF0C\u9632\u6296\uFF082-12\uFF09", min: 2, max: 12 },
  { key: "retentionHours", label: "\u5386\u53F2\u4FDD\u7559\uFF08\u5C0F\u65F6\uFF09", hint: "\u5C0F\u65F6\u6876\u4FDD\u7559\u65F6\u957F\uFF0C\u4E0A\u9650 2160\uFF0890 \u5929\uFF09", min: 24, max: 2160 }
];
var KIND_LABEL = { gateway: "\u7F51\u5173", anchor: "\u951A\u70B9", normal: "\u7AD9\u70B9" };
function SettingsTab({ pluginId, data, reload, showToast }) {
  const settings = data?.settings;
  const [draft, setDraft] = useState3(null);
  const [svc, setSvc] = useState3(null);
  const [speeds, setSpeeds] = useState3([]);
  const [speeding, setSpeeding] = useState3(false);
  const [addForm, setAddForm] = useState3({ label: "", host: "", port: "443", kind: "normal" });
  useEffect3(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);
  const refreshSides = async () => {
    try {
      const list = await listServiceStatus();
      setSvc(list.find((s) => s.serviceId === SERVICE_ID && s.pluginId === pluginId) ?? null);
    } catch (_) {
    }
    try {
      setSpeeds(await loadSpeeds(6));
    } catch (_) {
    }
  };
  useEffect3(() => {
    refreshSides();
  }, [pluginId]);
  if (!draft) return /* @__PURE__ */ jsx4("div", { className: "ns-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const setNum = (key, v, min, max) => {
    const n = Math.min(max, Math.max(min, Math.floor(Number(v) || min)));
    setDraft({ ...draft, [key]: n });
  };
  const saveSettings = async () => {
    try {
      await kvSet(K.settings, { ...draft });
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 10s \u5185\u751F\u6548\uFF09");
      await reload();
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const togglePaused = async () => {
    const next = { ...draft, paused: !draft.paused };
    setDraft(next);
    try {
      await kvSet(K.settings, next);
      showToast(next.paused ? "\u63A2\u6D4B\u5DF2\u6682\u505C" : "\u63A2\u6D4B\u5DF2\u6062\u590D");
      await reload();
    } catch (e) {
      showToast(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const doTarget = async (payload, okMsg) => {
    const r = await mutateTargets(payload);
    if (r.ok) {
      showToast(okMsg);
      await reload();
    } else {
      showToast(r.error || "\u64CD\u4F5C\u5931\u8D25", true);
    }
  };
  const doAdd = async () => {
    const host = addForm.host.trim();
    const port = Math.floor(Number(addForm.port));
    if (!host && addForm.kind !== "gateway") {
      showToast("host \u4E0D\u80FD\u4E3A\u7A7A", true);
      return;
    }
    if (addForm.kind === "gateway" && host) {
      showToast("\u7F51\u5173\u76EE\u6807 host \u7559\u7A7A\u5373\u81EA\u52A8\u53D1\u73B0\uFF1B\u5982\u8981\u624B\u52A8\u6307\u5B9A\u8BF7\u9009\u300C\u7AD9\u70B9\u300D\u7C7B\u578B", true);
      return;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      showToast("\u7AEF\u53E3\u975E\u6CD5", true);
      return;
    }
    await doTarget({ action: "add", target: { label: addForm.label.trim() || host, host, port, kind: addForm.kind } }, `\u5DF2\u6DFB\u52A0 ${addForm.label || host}`);
    setAddForm({ label: "", host: "", port: "443", kind: "normal" });
  };
  const doSpeed = async () => {
    if (!window.confirm(`\u5F00\u59CB\u6D4B\u901F\uFF1F\u5C06\u4E0B\u8F7D\u7EA6 ${draft.speedMb}MB \u6D41\u91CF\uFF08\u8017\u65F6 10-30s\uFF09\u3002`)) return;
    setSpeeding(true);
    try {
      const r = await runSpeedtest({ mb: draft.speedMb, url: draft.speedUrl || void 0 });
      if (r.ok) showToast(`\u6D4B\u901F\u5B8C\u6210\uFF1A${fmtMbps(r.mbps)}\uFF08\u9996\u5B57\u8282 ${fmtMs(r.latencyMs)}\uFF09`);
      else showToast(r.error || "\u6D4B\u901F\u5931\u8D25", true);
      await refreshSides();
      await reload();
    } finally {
      setSpeeding(false);
    }
  };
  const doService = async (action) => {
    try {
      await serviceAction(action, pluginId, SERVICE_ID);
      showToast(`\u670D\u52A1\u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}`);
      setTimeout(refreshSides, 2500);
    } catch (e) {
      showToast(`\u670D\u52A1${action}\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const doClearAll = async () => {
    if (!window.confirm("\u6E05\u7A7A\u5168\u90E8\u7F51\u7EDC\u54E8\u5175\u6570\u636E\uFF1F\uFF08\u5FEB\u7167/\u5386\u53F2\u6876/\u4E8B\u4EF6/\u6D4B\u901F\u8BB0\u5F55\uFF1B\u670D\u52A1\u4F1A\u81EA\u52A8\u91CD\u5EFA\u9ED8\u8BA4\u76EE\u6807\uFF09")) return;
    const n = await clearAllData().catch(() => 0);
    showToast(`\u5DF2\u6E05\u7A7A ${n} \u4E2A\u952E\uFF0C\u670D\u52A1\u5C06\u5728\u4E0B\u8F6E\u91CD\u5EFA`);
    setTimeout(reload, 3e3);
  };
  const stateText = svc ? { running: "\u8FD0\u884C\u4E2D", starting: "\u542F\u52A8\u4E2D", stopping: "\u505C\u6B62\u4E2D", stopped: "\u5DF2\u505C\u6B62", error: "\u5F02\u5E38" }[svc.state] : "\u72B6\u6001\u672A\u77E5";
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "ns-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ns-sec-bar" }),
      "\u63A2\u6D4B\u53C2\u6570",
      /* @__PURE__ */ jsx4("span", { className: "ns-sec-hint", children: "\u670D\u52A1 10s \u5185\u751F\u6548" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "ns-card", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ns-field", children: [
        /* @__PURE__ */ jsxs4("span", { className: "ns-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u6682\u505C\u63A2\u6D4B" }),
          /* @__PURE__ */ jsx4("small", { children: "\u6682\u505C\u671F\u95F4\u4E0D\u63A2\u6D4B\u3001\u4E0D\u4EA7\u751F\u4E8B\u4EF6\u4E0E\u5386\u53F2" })
        ] }),
        /* @__PURE__ */ jsx4("button", { className: `ns-toggle ${draft.paused ? "on" : ""}`, onClick: togglePaused, children: /* @__PURE__ */ jsx4("i", {}) })
      ] }),
      NUM_FIELDS.map((f) => /* @__PURE__ */ jsxs4("div", { className: "ns-field", children: [
        /* @__PURE__ */ jsxs4("span", { className: "ns-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: f.label }),
          /* @__PURE__ */ jsx4("small", { children: f.hint })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "ns-num",
            type: "number",
            value: String(draft[f.key]),
            min: f.min,
            max: f.max,
            onChange: (e) => setNum(f.key, e.target.value, f.min, f.max)
          }
        )
      ] }, f.key)),
      /* @__PURE__ */ jsx4("div", { className: "ns-field", children: /* @__PURE__ */ jsxs4("span", { className: "ns-field-l", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u6D4B\u901F\u5730\u5740\uFF08\u53EF\u9009\uFF09" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          "\u7559\u7A7A\u7528\u9ED8\u8BA4 Cloudflare \u7AEF\u70B9\uFF1B\u542B ",
          "{bytes}",
          " \u5360\u4F4D\u7B26\u4F1A\u88AB\u66FF\u6362\u4E3A\u5B57\u8282\u6570"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx4("div", { className: "ns-speedrow", children: /* @__PURE__ */ jsx4("input", { className: "ns-inp", placeholder: "https://speed.cloudflare.com/__down?bytes={bytes}", value: draft.speedUrl, onChange: (e) => setDraft({ ...draft, speedUrl: e.target.value }) }) }),
      /* @__PURE__ */ jsxs4("div", { className: "ns-field", children: [
        /* @__PURE__ */ jsxs4("span", { className: "ns-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u6D4B\u901F\u4E0B\u8F7D\u91CF" }),
          /* @__PURE__ */ jsx4("small", { children: "1-25 MB\uFF1B\u6BCF\u6B21\u6D4B\u901F\u90FD\u4F1A\u771F\u5B9E\u4E0B\u8F7D\u6D41\u91CF" })
        ] }),
        /* @__PURE__ */ jsx4("input", { className: "ns-num", type: "number", min: 1, max: 25, value: String(draft.speedMb), onChange: (e) => setNum("speedMb", e.target.value, 1, 25) }),
        /* @__PURE__ */ jsx4("button", { className: "ns-btn", disabled: speeding, onClick: doSpeed, children: speeding ? "\u6D4B\u901F\u4E2D\u2026" : "\u7ACB\u5373\u6D4B\u901F" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "ns-field", children: /* @__PURE__ */ jsx4("button", { className: "ns-btn", onClick: saveSettings, children: "\u4FDD\u5B58\u53C2\u6570" }) })
    ] }),
    speeds.length > 0 && /* @__PURE__ */ jsxs4(Fragment4, { children: [
      /* @__PURE__ */ jsxs4("div", { className: "ns-sec", children: [
        /* @__PURE__ */ jsx4("span", { className: "ns-sec-bar" }),
        "\u6700\u8FD1\u6D4B\u901F"
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "ns-card", children: speeds.map((s) => /* @__PURE__ */ jsxs4("div", { className: "ns-sprec", children: [
        /* @__PURE__ */ jsx4("b", { style: { color: s.ok ? "#58A6FF" : "#F85149" }, children: s.ok ? fmtMbps(s.mbps) : "\u5931\u8D25" }),
        /* @__PURE__ */ jsxs4("span", { style: { color: "#5C6678", fontSize: 10 }, children: [
          new Date(s.at).toLocaleString("zh-CN", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          " \xB7 ",
          s.mb,
          "MB",
          s.ok && Number.isFinite(s.latencyMs) ? ` \xB7 \u9996\u5B57\u8282 ${Math.round(s.latencyMs)}ms` : "",
          s.err ? ` \xB7 ${s.err}` : ""
        ] })
      ] }, s.at)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "ns-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ns-sec-bar" }),
      "\u63A2\u6D4B\u76EE\u6807",
      /* @__PURE__ */ jsxs4("span", { className: "ns-sec-hint", children: [
        data?.snap?.targets.length ?? 0,
        "/12 \xB7 \u6539\u52A8\u7531\u670D\u52A1\u539F\u5B50\u5E94\u7528"
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "ns-card", children: [
      (data?.snap?.targets ?? []).map((t) => /* @__PURE__ */ jsxs4("div", { className: "ns-trow", children: [
        /* @__PURE__ */ jsx4("span", { className: "ns-trow-name", children: t.label }),
        /* @__PURE__ */ jsxs4("span", { className: "ns-trow-host", children: [
          t.host || "(\u81EA\u52A8\u7F51\u5173)",
          ":",
          t.port,
          " \xB7 ",
          KIND_LABEL[t.kind] || t.kind
        ] }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            className: "ns-btn sm ghost",
            onClick: () => doTarget({ action: t.enabled ? "disable" : "enable", id: t.id }, t.enabled ? `\u5DF2\u505C\u7528 ${t.label}` : `\u5DF2\u542F\u7528 ${t.label}`),
            children: t.enabled ? "\u505C\u7528" : "\u542F\u7528"
          }
        ),
        /* @__PURE__ */ jsx4(
          "button",
          {
            className: "ns-btn sm danger",
            onClick: () => {
              if (window.confirm(`\u79FB\u9664\u76EE\u6807\u300C${t.label}\u300D\uFF1F`)) doTarget({ action: "remove", id: t.id }, `\u5DF2\u79FB\u9664 ${t.label}`);
            },
            children: "\u79FB\u9664"
          }
        )
      ] }, t.id)),
      /* @__PURE__ */ jsxs4("div", { className: "ns-add", children: [
        /* @__PURE__ */ jsxs4("div", { className: "ns-add-row", children: [
          /* @__PURE__ */ jsx4("input", { className: "ns-inp", placeholder: "\u540D\u79F0\uFF08\u5982 \u6211\u7684NAS\uFF09", value: addForm.label, onChange: (e) => setAddForm({ ...addForm, label: e.target.value }), style: { flex: 1 } }),
          /* @__PURE__ */ jsxs4("select", { className: "ns-select", value: addForm.kind, onChange: (e) => setAddForm({ ...addForm, kind: e.target.value }), children: [
            /* @__PURE__ */ jsx4("option", { value: "normal", children: "\u7AD9\u70B9" }),
            /* @__PURE__ */ jsx4("option", { value: "anchor", children: "\u951A\u70B9" }),
            /* @__PURE__ */ jsx4("option", { value: "gateway", children: "\u7F51\u5173" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "ns-add-row", children: [
          /* @__PURE__ */ jsx4("input", { className: "ns-inp", placeholder: addForm.kind === "gateway" ? "\u7559\u7A7A=\u81EA\u52A8\u53D1\u73B0\u7F51\u5173" : "\u57DF\u540D\u6216 IP\uFF08\u5982 nas.local\uFF09", value: addForm.host, onChange: (e) => setAddForm({ ...addForm, host: e.target.value }), style: { flex: 2 } }),
          /* @__PURE__ */ jsx4("input", { className: "ns-inp", placeholder: "\u7AEF\u53E3", value: addForm.port, onChange: (e) => setAddForm({ ...addForm, port: e.target.value }), style: { flex: 1 } }),
          /* @__PURE__ */ jsx4("button", { className: "ns-btn", onClick: doAdd, children: "\u6DFB\u52A0" })
        ] }),
        /* @__PURE__ */ jsx4("small", { className: "ns-sub", children: "\u951A\u70B9\u53C2\u4E0E\u300C\u5728\u7EBF/\u79BB\u7EBF\u300D\u5224\u5B9A\uFF08\u81F3\u5C11 2 \u4E2A\u53EF\u8FBE\u624D\u7B97\u5728\u7EBF\uFF09\uFF1B\u7AD9\u70B9\u53EA\u8BB0\u5F55\u81EA\u8EAB\u5EF6\u8FDF\u4E0E\u4E8B\u4EF6\u3002" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "ns-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ns-sec-bar" }),
      "\u670D\u52A1\u7BA1\u7406"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ns-card", children: /* @__PURE__ */ jsxs4("div", { className: "ns-field", children: [
      /* @__PURE__ */ jsxs4("span", { className: "ns-field-l", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u63A2\u6D4B\u670D\u52A1\uFF08net-service\uFF09" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          stateText,
          svc?.pid ? ` \xB7 PID ${svc.pid}` : "",
          svc?.restartCount ? ` \xB7 \u91CD\u542F ${svc.restartCount} \u6B21` : "",
          data?.meta?.gateway ? ` \xB7 \u7F51\u5173 ${data.meta.gateway}` : "",
          data?.meta?.degraded ? " \xB7 \u26A0 \u6865\u964D\u7EA7" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "ns-btn sm ghost", onClick: () => doService("restart"), children: "\u91CD\u542F" }),
      /* @__PURE__ */ jsx4("button", { className: "ns-btn sm ghost", onClick: () => doService("stop"), children: "\u505C\u6B62" }),
      /* @__PURE__ */ jsx4("button", { className: "ns-btn sm", onClick: () => doService("start"), children: "\u542F\u52A8" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ns-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ns-sec-bar" }),
      "\u5371\u9669\u533A"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ns-card", children: /* @__PURE__ */ jsxs4("div", { className: "ns-field", children: [
      /* @__PURE__ */ jsxs4("span", { className: "ns-field-l", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" }),
        /* @__PURE__ */ jsx4("small", { children: "\u5220\u9664\u5FEB\u7167/\u5386\u53F2\u6876/\u4E8B\u4EF6/\u6D4B\u901F\u8BB0\u5F55\uFF08\u8BBE\u7F6E\u4F1A\u4FDD\u7559\u5F53\u524D\u8349\u7A3F\u503C\u4E4B\u5916\u7684\u670D\u52A1\u9ED8\u8BA4\uFF09" })
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "ns-btn danger", onClick: doClearAll, children: "\u6E05\u7A7A" })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.ns-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ns-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ns-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ns-body::-webkit-scrollbar{width:9px;height:9px}
.ns-body::-webkit-scrollbar-track{background:transparent}
.ns-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ns-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.ns-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ns-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7C5CFF,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ns-tt{flex:1;min-width:0}
.ns-tt b{font-size:15px;display:block}
.ns-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ns-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ns-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ns-dot.stale{background:#D29922}
.ns-dot.down{background:#F85149}
.ns-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ns-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ns-tab:hover{color:#E6EAF2}
.ns-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ns-badge{position:absolute;top:0;right:1px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.ns-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ns-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ns-card-b{padding:11px 13px}
.ns-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ns-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ns-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ns-btn:hover{filter:brightness(1.1)}
.ns-btn:disabled{opacity:.45;cursor:not-allowed}
.ns-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ns-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ns-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ns-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ns-inp:focus{outline:none;border-color:#2b6cb0}
.ns-inp::placeholder{color:#4d5566}
.ns-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ns-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ns-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ns-toast.bad{border-color:#54262c;color:#FF8A9A}
.ns-toast-wrap{white-space:normal;max-height:130px;overflow-y:auto}
.ns-confirm{display:flex;align-items:center;gap:8px;padding:8px 13px;background:#241318;border-top:1px solid #54262c;font-size:11.5px;color:#FF8A9A}
.ns-confirm b{flex:1;min-width:0}

/* \u4E8B\u4EF6\u6D41 */
.ns-ev{border-left:2px solid #242C3A;padding:8px 12px;margin:0 16px 8px;background:#141821;border-radius:0 10px 10px 0}
.ns-ev-h{display:flex;align-items:center;gap:7px;font-size:11px;color:#5C6678}
.ns-ev-h b{font-size:10px;font-weight:700;white-space:nowrap}
.ns-ev-sum{font-size:12px;color:#C9D1D9;margin-top:3px;line-height:1.5}

/* \u8BBE\u7F6E */
.ns-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.ns-field:first-child{border-top:none}
.ns-field-l{flex:1;min-width:0}
.ns-field-l b{font-size:12.5px;display:block}
.ns-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ns-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ns-toggle.on{background:#2b6cb0}
.ns-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ns-toggle.on i{left:18px}
.ns-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.ns-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
.ns-select{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`;
function NetSentinelPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("overview");
  const [data, setData] = useState4(null);
  const [readAt, setReadAt] = useState4(0);
  const [newCount, setNewCount] = useState4(0);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const readAtRef = useRef(0);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad, wrap: (msg || "").length > 46 });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadPanelData(readAtRef.current);
      setData(d);
      setLoadErr("");
      setNewCount(d.newCount);
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  const refreshReadAt = useCallback(async () => {
    const r = await loadReadAt().catch(() => 0);
    readAtRef.current = r;
    setReadAt(r);
  }, []);
  useEffect4(() => {
    refreshReadAt();
  }, [refreshReadAt]);
  useEffect4(() => {
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
  const markRead = useCallback(async () => {
    await markAllRead().catch(() => {
    });
    readAtRef.current = Date.now();
    setReadAt(readAtRef.current);
    setNewCount(0);
  }, []);
  const hb = heartbeatOf(data?.snap ?? null, data?.meta ?? null);
  return /* @__PURE__ */ jsxs5("div", { className: "ns-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "ns-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "ns-logo", children: "\u{1F4E1}" }),
      /* @__PURE__ */ jsxs5("div", { className: "ns-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u7F51\u7EDC\u54E8\u5175" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `ns-dot ${hb.state}` }),
          hb.text
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "ns-tabs", children: [
        ["overview", "\u6982\u89C8"],
        ["history", "\u5386\u53F2"],
        ["feed", "\u52A8\u6001"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `ns-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "feed" && newCount > 0 && /* @__PURE__ */ jsx5("span", { className: "ns-badge", children: newCount > 99 ? "99+" : newCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ns-body", children: /* @__PURE__ */ jsxs5("div", { className: "ns-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "ns-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx5(OverviewTab, { data, goHistory: () => setTab("history"), goFeed: () => setTab("feed") }),
      tab === "history" && /* @__PURE__ */ jsx5(HistoryTab, { data }),
      tab === "feed" && /* @__PURE__ */ jsx5(
        FeedTab,
        {
          onSendToChat,
          showToast,
          markRead,
          unread: newCount,
          reload
        }
      ),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { pluginId, data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `ns-toast ${toast.bad ? "bad" : ""} ${toast.wrap ? "ns-toast-wrap" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function NetSentinelEntry(props) {
  return /* @__PURE__ */ jsx6(NetSentinelPanel, { ...props });
}
export {
  NetSentinelEntry as default
};
