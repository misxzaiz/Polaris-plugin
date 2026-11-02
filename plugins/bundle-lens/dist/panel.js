// src/Panel.tsx
import { useCallback, useEffect, useRef, useState } from "react";

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res && res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r && r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function restartService(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}

// src/model.ts
var SvcError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
var META_KEY = "bundlelens.meta";
var metaCache = null;
function invalidateMeta() {
  metaCache = null;
}
async function readMeta() {
  if (metaCache) return metaCache;
  const m = await kvGet(META_KEY);
  if (m && typeof m.port === "number" && m.token) {
    metaCache = m;
    return m;
  }
  return null;
}
async function svc(method, apiPath, body, timeoutMs = 35e3) {
  const meta = await readMeta();
  if (!meta) throw new SvcError("\u670D\u52A1\u672A\u6CE8\u518C\uFF1A\u540E\u53F0\u670D\u52A1\u5C1A\u672A\u62C9\u8D77\u6216 kv \u4E0D\u53EF\u8FBE\uFF08\u7A0D\u5019\u81EA\u52A8\u91CD\u8BD5\uFF09");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${apiPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${meta.token}`
      },
      body: body != null ? JSON.stringify(body) : void 0,
      signal: ctrl.signal
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = null;
    }
    if (!res.ok) throw new SvcError(parsed && parsed.error || `HTTP ${res.status}`, res.status);
    return parsed;
  } catch (e) {
    if (e instanceof SvcError) throw e;
    if (e.name === "AbortError") throw new SvcError("\u8BF7\u6C42\u8D85\u65F6");
    throw new SvcError(`\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}
var api = {
  meta: () => svc("GET", "/api/meta"),
  scan: (path) => svc("POST", "/api/scan", { path }, 15e3),
  scanStatus: (runId) => svc("GET", `/api/scan/${encodeURIComponent(runId)}`),
  runs: () => svc("GET", "/api/runs"),
  report: (runId) => svc("GET", `/api/report/${encodeURIComponent(runId)}`),
  settings: () => svc("GET", "/api/settings"),
  saveSettings: (patch) => svc("POST", "/api/settings", patch),
  selftest: () => svc("POST", "/api/selftest", {}, 12e4)
};

// src/treemap.ts
function treemapLayout(items, x, y, w, h) {
  const sorted = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, b) => a + b.value, 0);
  const out = [];
  if (total <= 0 || w <= 0 || h <= 0 || sorted.length === 0) return out;
  const scale = w * h / total;
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  let i = 0;
  const row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.value, 0) * scale;
    const max = Math.max(...r.map((it) => it.value * scale));
    const min = Math.min(...r.map((it) => it.value * scale));
    const s2 = s * s;
    const side2 = side * side;
    return Math.max(side2 * max / s2, s2 / (side2 * min));
  };
  while (i < sorted.length) {
    const side = Math.min(cw, ch);
    row.push(sorted[i]);
    while (i + 1 < sorted.length) {
      const next = [...row, sorted[i + 1]];
      if (worst(next, side) <= worst(row, side)) {
        row.push(sorted[i + 1]);
        i++;
      } else break;
    }
    const rowSum = row.reduce((a, b) => a + b.value, 0) * scale;
    const thick = rowSum / side;
    let off = 0;
    for (const it of row) {
      const len = it.value * scale / thick;
      if (cw >= ch) out.push({ key: it.key, value: it.value, x: cx, y: cy + off, w: thick, h: len });
      else out.push({ key: it.key, value: it.value, x: cx + off, y: cy, w: len, h: thick });
      off += len;
    }
    if (cw >= ch) {
      cx += thick;
      cw -= thick;
    } else {
      cy += thick;
      ch -= thick;
    }
    row.length = 0;
    i++;
  }
  return out;
}

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var STYLE = `
.bl-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.bl-panel * { box-sizing: border-box; }
.bl-panel input, .bl-panel textarea, .bl-panel select, .bl-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.bl-panel input:focus, .bl-panel textarea:focus, .bl-panel select:focus { border-color: #3B82F6; }
.bl-panel button { cursor: pointer; background: #2A2A31; }
.bl-panel button:hover { background: #33333B; }
.bl-panel button:disabled { opacity: .45; cursor: not-allowed; }
.bl-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.bl-panel button.primary:hover { background: #1D4ED8; }
.bl-panel button.small { padding: 2px 8px; border-radius: 4px; }
.bl-panel code, .bl-panel pre, .bl-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.bl-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.bl-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.bl-tab.active { background: #232329; color: #fff; }
.bl-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.bl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.bl-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.bl-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.bl-row { display: flex; align-items: center; gap: 6px; }
.bl-grow { flex: 1; min-width: 0; }
.bl-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.bl-scroll { overflow-y: auto; }
.bl-err { color: #F87171; }
.bl-warn { color: #FBBF24; }
.bl-ok { color: #34D399; }
.bl-muted { color: #6B7280; }
.bl-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.bl-path { font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bl-table { width: 100%; border-collapse: collapse; }
.bl-table th { text-align: left; font-size: 10.5px; color: #9CA3AF; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #2A2A31; position: sticky; top: 0; background: #1A1A1F; z-index: 1; }
.bl-table td { padding: 5px 8px; border-bottom: 1px solid #202027; font-size: 11.5px; vertical-align: middle; }
.bl-table tr.click { cursor: pointer; }
.bl-table tr.click:hover { background: #202028; }
.bl-barwrap { background: #26262C; border-radius: 3px; height: 8px; min-width: 60px; overflow: hidden; }
.bl-bar { height: 100%; border-radius: 3px; }
.bl-section { margin-bottom: 14px; }
.bl-h3 { font-size: 12.5px; font-weight: 600; margin: 0 0 6px; color: #D4D4D8; }
/* treemap */
.bl-treemap { position: relative; width: 100%; border: 1px solid #2A2A31; border-radius: 6px; overflow: hidden; background: #141418; }
.bl-tile { position: absolute; overflow: hidden; padding: 4px 6px; border: 1px solid #17171B; border-radius: 2px; cursor: default; }
.bl-tile:hover { filter: brightness(1.18); }
.bl-tile .t-name { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bl-tile .t-size { font-size: 9.5px; color: rgba(255,255,255,.62); white-space: nowrap; }
.bl-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; font-size: 10.5px; color: #9CA3AF; }
.bl-legend span { display: inline-flex; align-items: center; gap: 4px; }
.bl-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
`;
function PanelStyle() {
  return /* @__PURE__ */ jsx("style", { children: STYLE });
}
function dateTimeStr(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function durStr(ms) {
  if (ms === null || ms === void 0) return "\u2014";
  if (ms < 1e3) return `${ms}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.floor(ms / 6e4)}m${Math.round(ms % 6e4 / 1e3)}s`;
}
function fmtBytes(n) {
  const v = n || 0;
  if (v < 1024) return `${v}B`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)}KB`;
  if (v < 1073741824) return `${(v / 1048576).toFixed(1)}MB`;
  return `${(v / 1073741824).toFixed(2)}GB`;
}
function fmtDelta(n) {
  if (n === 0) return "\xB10";
  return `${n > 0 ? "+" : "-"}${fmtBytes(Math.abs(n))}`;
}
function deltaColor(n) {
  if (n > 0) return "#F87171";
  if (n < 0) return "#34D399";
  return "#9CA3AF";
}
function tileColor(name, isApp, conflicted) {
  if (conflicted) return "hsl(0, 62%, 38%)";
  if (isApp) return "#1D4ED8";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  const hue = 90 + h % 180;
  return `hsl(${hue}, 46%, 34%)`;
}
function StatChips({ items }) {
  const toneColor = (t) => t === "ok" ? "#34D399" : t === "warn" ? "#FBBF24" : t === "err" ? "#F87171" : t === "muted" ? "#9CA3AF" : "#E4E4E7";
  return /* @__PURE__ */ jsx("div", { className: "bl-row", style: { flexWrap: "wrap", gap: 6 }, children: items.map((it, i) => /* @__PURE__ */ jsxs("span", { className: "bl-badge", style: { background: "#232329", color: toneColor(it.tone), fontWeight: 500, padding: "3px 10px" }, children: [
    it.label,
    " ",
    /* @__PURE__ */ jsx("b", { style: { color: "#fff" }, children: it.value })
  ] }, i)) });
}
function Bar({ value, max = 100, color }) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /* @__PURE__ */ jsx("div", { className: "bl-barwrap", children: /* @__PURE__ */ jsx("div", { className: "bl-bar", style: { width: `${pct}%`, background: color || "#3B82F6" } }) });
}

// src/Panel.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PLUGIN_ID = "bundle-lens";
var SERVICE_ID = "bundle-lens-server";
var APP_KEY = "(\u5E94\u7528\u4EE3\u7801)";
function buildTreemapItems(report) {
  const conflicted = new Set((report.duplicates.versionConflicts || []).map((c) => c.name));
  const items = (report.packages || []).slice(0, 40).map((p) => ({
    key: p.name,
    value: p.bytes,
    isApp: false,
    conflicted: conflicted.has(p.name)
  }));
  if (report.totals.appBytes > 0) {
    items.push({ key: APP_KEY, value: report.totals.appBytes, isApp: true, conflicted: false });
  }
  return items;
}
function Treemap({ report }) {
  const [size, setSize] = useState({ w: 0, h: 260 });
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: 260 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const items = buildTreemapItems(report);
  const rects = size.w > 0 ? treemapLayout(items, 0, 0, size.w, size.h) : [];
  const minPixels = 60;
  return /* @__PURE__ */ jsx2("div", { ref, className: "bl-treemap", style: { height: 260 }, children: rects.map((r) => {
    const it = items.find((x) => x.key === r.key);
    return /* @__PURE__ */ jsx2(
      "div",
      {
        className: "bl-tile",
        title: `${r.key}\uFF1A${fmtBytes(r.value)}\uFF08${Math.round(r.value / Math.max(1, report.totals.totalBytes) * 100)}%\uFF09${it.conflicted ? "\uFF0C\u26A0 \u591A\u4EFD\u5B89\u88C5" : ""}`,
        style: { left: r.x, top: r.y, width: r.w, height: r.h, background: tileColor(it.key, it.isApp, it.conflicted) },
        children: r.w > minPixels && r.h > 26 ? /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx2("div", { className: "t-name", children: r.key }),
          /* @__PURE__ */ jsx2("div", { className: "t-size", children: fmtBytes(r.value) })
        ] }) : null
      },
      r.key
    );
  }) });
}
function Panel({ onSendToChat }) {
  const [tab, setTab] = useState("scan");
  const [svcDown, setSvcDown] = useState(null);
  const [degraded, setDegraded] = useState(false);
  const [meta, setMeta] = useState(null);
  const [path, setPath] = useState("");
  const [recentPaths, setRecentPaths] = useState([]);
  const [busy, setBusy] = useState(null);
  const [scanErr, setScanErr] = useState(null);
  const [report, setReport] = useState(null);
  const [moduleFilter, setModuleFilter] = useState("");
  const [runs, setRuns] = useState([]);
  const [selftest, setSelftest] = useState(null);
  const [selftesting, setSelftesting] = useState(false);
  const pollRef = useRef(null);
  const loadRuns = useCallback(async () => {
    try {
      const r = await api.runs();
      setRuns(r.runs);
      setDegraded(!!r.degraded);
    } catch (_) {
    }
  }, []);
  const loadReport = useCallback(async (runId) => {
    try {
      const r = await api.report(runId);
      setReport(r.report);
      setDegraded(false);
    } catch (e) {
      setScanErr(e.message);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < 20 && alive; i++) {
        const m = await readMeta();
        if (m) break;
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!alive) return;
      try {
        const m = await api.meta();
        setMeta({ version: m.version, uptime: m.uptime });
        setDegraded(m.degraded);
        setSvcDown(null);
        if (m.settings) {
          setRecentPaths(m.settings.recentPaths);
          if (m.settings.recentPaths[0]) setPath(m.settings.recentPaths[0]);
        }
        if (m.lastRunId) await loadReport(m.lastRunId);
      } catch (e) {
        setSvcDown(e.message);
      }
      await loadRuns();
    })();
    return () => {
      alive = false;
    };
  }, [loadReport]);
  useEffect(() => {
    if (!busy) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await api.scanStatus(busy.runId);
        setBusy((prev) => prev ? { ...prev, ...st } : prev);
        if (st.status && st.status !== "running") {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
          invalidateMeta();
          if (st.status === "ok") {
            setBusy(null);
            setTab("overview");
            await loadReport(busy.runId);
            await loadRuns();
          } else {
            setBusy(null);
            setScanErr(st.error || st.message || `\u626B\u63CF\u5931\u8D25\uFF08${st.status}\uFF09`);
            await loadRuns();
          }
        }
      } catch (e) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(null);
        setScanErr(e.message);
      }
    }, 1e3);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [busy && busy.runId, loadReport, loadRuns]);
  const startScan = useCallback(async () => {
    setScanErr(null);
    if (!path.trim()) {
      setScanErr("\u8BF7\u586B\u5199\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\u8DEF\u5F84\uFF08\u5982 D:\\proj\\dist\uFF09");
      return;
    }
    try {
      const r = await api.scan(path.trim());
      setBusy({ runId: r.runId, status: "running", phase: "queued", progress: 0, message: "\u6392\u961F\u4E2D" });
    } catch (e) {
      if (e instanceof SvcError && e.status === 409) {
        setScanErr("\u5DF2\u6709\u626B\u63CF\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
        return;
      }
      setScanErr(e.message);
    }
  }, [path]);
  const runSelftest = useCallback(async () => {
    setSelftesting(true);
    setSelftest(null);
    try {
      setSelftest(await api.selftest());
    } catch (e) {
      setScanErr(e.message);
    } finally {
      setSelftesting(false);
    }
  }, []);
  const retrySvc = useCallback(async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID);
      invalidateMeta();
      setSvcDown(null);
    } catch (e) {
      setSvcDown(e.message);
    }
  }, []);
  const sendSummary = useCallback(async () => {
    if (!report || !onSendToChat) return;
    const t2 = report.totals;
    const kb = (n) => fmtBytes(n);
    const top = (report.packages || []).slice(0, 8).map((p, i) => `${i + 1}. ${p.name}${p.versions.length ? `@${p.versions.join("/")}` : ""}\uFF1A${kb(p.bytes)}\uFF08${p.fileCount} \u6587\u4EF6${p.roots.length > 1 ? `\uFF0C\u26A0 ${p.roots.length} \u4EFD\u5B89\u88C5` : ""}\uFF09`).join("\n");
    const conflicts = (report.duplicates.versionConflicts || []).slice(0, 5).map((c) => `- ${c.name}${c.versions.length ? `\uFF08${c.versions.join("/")}\uFF09` : ""}\uFF1A${c.roots} \u4EFD\u72EC\u7ACB\u5B89\u88C5\uFF0C\u5171 ${kb(c.bytes)}`).join("\n");
    const text = [
      `\u5305\u4F53\u79EF\u900F\u89C6\uFF08${report.dir}\uFF09`,
      `\u603B\u4F53\u79EF ${kb(t2.totalBytes)}\uFF1A${t2.chunks} chunks\uFF08${t2.chunksNoMap} \u65E0 map\uFF09\uFF0C\u6620\u5C04\u8986\u76D6 ${Math.round(t2.mapCoverage * 100)}%`,
      `\u4F9D\u8D56 ${kb(t2.vendorBytes)} vs \u5E94\u7528 ${kb(t2.appBytes)}\uFF1B${t2.pkgCount} \u4E2A\u5305 / ${t2.moduleCount} \u4E2A\u6E90\u6A21\u5757`,
      report.diff ? `\u5BF9\u6BD4\u4E0A\u6B21\uFF1A${fmtDelta(report.diff.totalDelta)}\uFF08${kb(report.diff.totalPrev)} \u2192 ${kb(report.diff.totalNow)}\uFF09` : "",
      conflicts ? `\u26A0 \u540C\u5305\u591A\u4EFD\u5B89\u88C5\uFF1A
${conflicts}` : "\u91CD\u590D\u5B89\u88C5\uFF1A\u65E0",
      "",
      "Top \u5305\uFF1A",
      top,
      report.suggestions.length ? `
\u5EFA\u8BAE\uFF1A
${report.suggestions.slice(0, 5).map((s) => `- [${s.level}] ${s.title}`).join("\n")}` : "",
      report.warnings.length ? `
\u26A0 ${report.warnings.join("\uFF1B")}` : ""
    ].filter(Boolean).join("\n");
    await onSendToChat(text);
  }, [report, onSendToChat]);
  const t = report && report.totals;
  const conflictedNames = new Set(report ? (report.duplicates.versionConflicts || []).map((c) => c.name) : []);
  return /* @__PURE__ */ jsxs2("div", { className: "bl-panel", children: [
    /* @__PURE__ */ jsx2(PanelStyle, {}),
    /* @__PURE__ */ jsx2("div", { className: "bl-tabs", children: [["scan", "\u626B\u63CF"], ["overview", "\u603B\u89C8"], ["composition", "\u6784\u6210"], ["dups", "\u91CD\u590D\xB7\u5EFA\u8BAE"], ["history", "\u5386\u53F2"]].map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `bl-tab ${tab === k ? "active" : ""}`, onClick: () => setTab(k), children: label }, k)) }),
    /* @__PURE__ */ jsxs2("div", { className: "bl-statusbar", children: [
      /* @__PURE__ */ jsx2("span", { className: "bl-dot", style: { background: degraded ? "#FBBF24" : svcDown ? "#F87171" : "#34D399" } }),
      /* @__PURE__ */ jsx2("span", { className: "bl-grow", children: svcDown ? `\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${svcDown}` : degraded ? "\u5BBF\u4E3B kv \u6865\u964D\u7EA7\uFF08\u670D\u52A1\u53EF\u7528\uFF0C\u62A5\u544A\u4E0D\u6295\u5F71\u4E09\u7AEF\uFF09" : meta ? `\u670D\u52A1 v${meta.version} \xB7 \u8FD0\u884C ${durStr(meta.uptime)}` : "\u8FDE\u63A5\u670D\u52A1\u4E2D\u2026" }),
      (svcDown || degraded) && /* @__PURE__ */ jsx2("button", { className: "small", onClick: retrySvc, children: "\u91CD\u542F\u670D\u52A1" }),
      report && tab !== "scan" && onSendToChat && /* @__PURE__ */ jsx2("button", { className: "small", onClick: sendSummary, children: "\u53D1\u9001\u5230\u804A\u5929" })
    ] }),
    tab === "scan" && /* @__PURE__ */ jsxs2("div", { className: "bl-scroll", style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "bl-card", children: [
        /* @__PURE__ */ jsx2("label", { className: "bl-label", children: "\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\uFF08vite/webpack/esbuild/rollup \u4EA7\u7269\u5747\u53EF\uFF0C\u5982 D:\\proj\\dist\uFF1B\u4E0D\u662F\u6E90\u7801\u76EE\u5F55\uFF09" }),
        /* @__PURE__ */ jsxs2("div", { className: "bl-row", children: [
          /* @__PURE__ */ jsx2("input", { className: "bl-grow mono", value: path, placeholder: "D:\\space\\base\\Polaris\\dist", onChange: (e) => setPath(e.target.value), onKeyDown: (e) => {
            if (e.key === "Enter" && !busy) startScan();
          } }),
          /* @__PURE__ */ jsx2("button", { className: "primary", disabled: !!busy, onClick: startScan, children: busy ? "\u900F\u89C6\u4E2D\u2026" : "\u5F00\u59CB\u900F\u89C6" })
        ] }),
        recentPaths.length > 0 && /* @__PURE__ */ jsx2("div", { className: "bl-row", style: { flexWrap: "wrap", marginTop: 6 }, children: recentPaths.map((p) => /* @__PURE__ */ jsx2("button", { className: "small", onClick: () => setPath(p), title: p, children: p.length > 42 ? `\u2026${p.slice(-40)}` : p }, p)) }),
        busy && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "bl-row", style: { justifyContent: "space-between", fontSize: 11, color: "#9CA3AF" }, children: [
            /* @__PURE__ */ jsx2("span", { children: busy.message || busy.phase }),
            /* @__PURE__ */ jsxs2("span", { children: [
              Math.round((busy.progress || 0) * 100),
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx2(Bar, { value: (busy.progress || 0) * 100 })
        ] }),
        scanErr && /* @__PURE__ */ jsx2("div", { className: "bl-err", style: { marginTop: 8 }, children: scanErr })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-card bl-hint", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          "\xB7 \u89E3\u6790\u7684\u662F sourcemap\uFF08",
          /* @__PURE__ */ jsx2("code", { children: "*.js.map" }),
          "\uFF09\uFF1B\u6784\u5EFA\u6CA1\u5F00 sourcemap \u4E5F\u80FD\u626B\uFF08\u4EC5\u6587\u4EF6\u7EA7\u4F53\u79EF\uFF0Cvite \u5F00\u542F\uFF1A",
          /* @__PURE__ */ jsxs2("code", { children: [
            "build: ",
            "{ sourcemap: true }"
          ] }),
          "\uFF09"
        ] }),
        /* @__PURE__ */ jsx2("div", { children: "\xB7 sourcemap \u542B\u6E90\u7801\u2014\u2014\u5168\u7A0B\u4E0D\u51FA\u672C\u673A\uFF0C\u53EA\u8BFB\u626B\u63CF\uFF0C\u96F6\u7F51\u7EDC\u51FA\u7AD9" }),
        /* @__PURE__ */ jsx2("div", { children: "\xB7 \u5BF9\u540C\u4E00\u76EE\u5F55\u7B2C\u4E8C\u6B21\u626B\u63CF\u8D77\uFF0C\u81EA\u52A8\u4E0E\u4E0A\u6B21\u751F\u6210\u9010\u5305 diff\uFF08\u4F18\u5316\u524D\u540E\u9A8C\u6536\uFF09" }),
        /* @__PURE__ */ jsxs2("div", { className: "bl-row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx2("button", { className: "small", onClick: runSelftest, disabled: selftesting, children: selftesting ? "\u81EA\u68C0\u4E2D\u2026" : "\u8FD0\u884C\u5185\u7F6E\u81EA\u68C0" }),
          selftest && /* @__PURE__ */ jsxs2("span", { className: selftest.ok ? "bl-ok" : "bl-err", children: [
            "\u81EA\u68C0 ",
            selftest.ok ? "\u901A\u8FC7" : "\u5931\u8D25",
            "\uFF1A",
            selftest.total - selftest.failed.length,
            "/",
            selftest.total,
            !selftest.ok && `\uFF08${selftest.failed.map((f) => `${f.name}: ${f.error}`).join("\uFF1B")}\uFF09`
          ] })
        ] })
      ] })
    ] }),
    tab === "overview" && /* @__PURE__ */ jsx2("div", { className: "bl-scroll", style: { padding: 12 }, children: !report || !t ? /* @__PURE__ */ jsx2("div", { className: "bl-muted", style: { padding: 20, textAlign: "center" }, children: "\u8FD8\u6CA1\u6709\u62A5\u544A\u2014\u2014\u5148\u53BB\u300C\u626B\u63CF\u300DTab \u900F\u89C6\u4E00\u4E2A\u4EA7\u7269\u76EE\u5F55" }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "bl-card bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-h3 bl-row", style: { justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsx2("span", { className: "bl-path bl-grow", title: report.dir, children: report.dir }),
          /* @__PURE__ */ jsxs2("span", { className: "bl-muted", children: [
            dateTimeStr(report.finishedAt),
            " \xB7 ",
            durStr(t.durationMs)
          ] })
        ] }),
        /* @__PURE__ */ jsx2(StatChips, { items: [
          { label: "\u603B\u4F53\u79EF", value: fmtBytes(t.totalBytes) },
          { label: "chunks", value: `${t.chunks}${t.chunksNoMap ? `\uFF08${t.chunksNoMap} \u65E0map\uFF09` : ""}`, tone: t.chunksNoMap ? "warn" : void 0 },
          { label: "\u6620\u5C04\u8986\u76D6", value: `${Math.round(t.mapCoverage * 100)}%`, tone: t.mapCoverage < 0.85 ? "warn" : "ok" },
          { label: "\u4F9D\u8D56/\u5E94\u7528", value: `${Math.round(t.vendorBytes / Math.max(1, t.totalBytes) * 100)}% / ${Math.round(t.appBytes / Math.max(1, t.totalBytes) * 100)}%`, tone: t.vendorBytes / Math.max(1, t.totalBytes) > 0.85 ? "warn" : void 0 },
          { label: "npm \u5305", value: String(t.pkgCount) },
          { label: "\u6E90\u6A21\u5757", value: String(t.moduleCount) }
        ] }),
        report.diff && /* @__PURE__ */ jsxs2("div", { className: "bl-row", style: { marginTop: 8, fontSize: 11.5 }, children: [
          /* @__PURE__ */ jsxs2("span", { className: "bl-muted", children: [
            "vs \u4E0A\u6B21\uFF08",
            report.diff.prevRunId,
            "\uFF09\uFF1A"
          ] }),
          /* @__PURE__ */ jsx2("b", { style: { color: deltaColor(report.diff.totalDelta) }, children: fmtDelta(report.diff.totalDelta) }),
          /* @__PURE__ */ jsxs2("span", { className: "bl-muted", children: [
            "\uFF08",
            fmtBytes(report.diff.totalPrev),
            " \u2192 ",
            fmtBytes(report.diff.totalNow),
            "\uFF09"
          ] }),
          report.diff.packages.slice(0, 4).map((p) => /* @__PURE__ */ jsxs2("span", { className: "bl-badge", style: { background: "#232329", color: deltaColor(p.delta) }, children: [
            p.name,
            " ",
            fmtDelta(p.delta)
          ] }, p.name))
        ] }),
        report.warnings.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "bl-warn bl-hint", style: { marginTop: 8 }, children: [
          "\u26A0 ",
          report.warnings.join("\uFF1B")
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsx2("div", { className: "bl-h3", children: "\u5305\u4F53\u79EF\u6392\u884C\uFF08Top 30\uFF09" }),
        /* @__PURE__ */ jsxs2("table", { className: "bl-table", children: [
          /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
            /* @__PURE__ */ jsx2("th", { children: "#" }),
            /* @__PURE__ */ jsx2("th", { children: "\u5305" }),
            /* @__PURE__ */ jsx2("th", { children: "\u4F53\u79EF" }),
            /* @__PURE__ */ jsx2("th", { style: { width: "34%" } }),
            /* @__PURE__ */ jsx2("th", { children: "\u5360\u6BD4" }),
            /* @__PURE__ */ jsx2("th", { children: "\u6587\u4EF6" }),
            /* @__PURE__ */ jsx2("th", { children: "\u7248\u672C" })
          ] }) }),
          /* @__PURE__ */ jsxs2("tbody", { children: [
            report.packages.slice(0, 30).map((p, i) => /* @__PURE__ */ jsxs2("tr", { children: [
              /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: i + 1 }),
              /* @__PURE__ */ jsxs2("td", { className: "bl-path", title: p.name, style: { maxWidth: 240 }, children: [
                p.roots.length > 1 ? /* @__PURE__ */ jsx2("span", { className: "bl-warn", children: "\u26A0 " }) : null,
                p.name
              ] }),
              /* @__PURE__ */ jsx2("td", { className: "mono", children: fmtBytes(p.bytes) }),
              /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsx2(Bar, { value: p.bytes, max: report.packages[0].bytes, color: tileColor(p.name, false, conflictedNames.has(p.name)) }) }),
              /* @__PURE__ */ jsxs2("td", { className: "bl-muted", children: [
                Math.round(p.bytes / Math.max(1, t.totalBytes) * 100),
                "%"
              ] }),
              /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: p.fileCount }),
              /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: p.versions.join("/") || "\u2014" })
            ] }, p.name)),
            /* @__PURE__ */ jsxs2("tr", { children: [
              /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: "\u2014" }),
              /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsx2("b", { children: APP_KEY }) }),
              /* @__PURE__ */ jsx2("td", { className: "mono", children: fmtBytes(t.appBytes) }),
              /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsx2(Bar, { value: t.appBytes, max: report.packages[0].bytes, color: "#1D4ED8" }) }),
              /* @__PURE__ */ jsxs2("td", { className: "bl-muted", children: [
                Math.round(t.appBytes / Math.max(1, t.totalBytes) * 100),
                "%"
              ] }),
              /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: "\u2014" }),
              /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: "\u2014" })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
          "chunk \u6E05\u5355\uFF08",
          report.chunks.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ jsxs2("table", { className: "bl-table", children: [
          /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
            /* @__PURE__ */ jsx2("th", { children: "\u6587\u4EF6" }),
            /* @__PURE__ */ jsx2("th", { children: "\u4F53\u79EF" }),
            /* @__PURE__ */ jsx2("th", { children: "\u6620\u5C04" }),
            /* @__PURE__ */ jsx2("th", { children: "\u5305\u6570" }),
            /* @__PURE__ */ jsx2("th", { children: "\u91CC\u9762\u7684\u5927\u5934" })
          ] }) }),
          /* @__PURE__ */ jsx2("tbody", { children: report.chunks.slice(0, 40).map((c) => /* @__PURE__ */ jsxs2("tr", { children: [
            /* @__PURE__ */ jsx2("td", { className: "bl-path", title: c.relPath, style: { maxWidth: 260 }, children: c.relPath }),
            /* @__PURE__ */ jsx2("td", { className: "mono", children: fmtBytes(c.bytes) }),
            /* @__PURE__ */ jsx2("td", { children: c.hasMap ? /* @__PURE__ */ jsxs2("span", { className: c.mappedBytes / Math.max(1, c.bytes) > 0.85 ? "bl-ok" : "bl-warn", children: [
              Math.round(c.mappedBytes / Math.max(1, c.bytes) * 100),
              "%"
            ] }) : /* @__PURE__ */ jsx2("span", { className: "bl-err", children: "\u65E0 map" }) }),
            /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: c.pkgCount || "\u2014" }),
            /* @__PURE__ */ jsx2("td", { className: "bl-hint", children: (c.topPkgs || []).slice(0, 3).map((p) => `${p.name} ${fmtBytes(p.bytes)}`).join("\u3001") || "\u2014" })
          ] }, c.relPath)) })
        ] })
      ] })
    ] }) }),
    tab === "composition" && /* @__PURE__ */ jsx2("div", { className: "bl-scroll", style: { padding: 12 }, children: !report ? /* @__PURE__ */ jsx2("div", { className: "bl-muted", style: { padding: 20, textAlign: "center" }, children: "\u8FD8\u6CA1\u6709\u62A5\u544A\u2014\u2014\u5148\u53BB\u300C\u626B\u63CF\u300DTab" }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsx2("div", { className: "bl-h3", children: "\u9762\u79EF\u56FE\uFF08\u5305 Top40 + \u5E94\u7528\u4EE3\u7801\uFF1B\u7EA2\u8272 = \u6709\u591A\u4EFD\u5B89\u88C5\uFF09" }),
        /* @__PURE__ */ jsx2(Treemap, { report }),
        /* @__PURE__ */ jsxs2("div", { className: "bl-legend", children: [
          /* @__PURE__ */ jsxs2("span", { children: [
            /* @__PURE__ */ jsx2("i", { style: { background: "#1D4ED8" } }),
            "\u5E94\u7528\u4EE3\u7801"
          ] }),
          /* @__PURE__ */ jsxs2("span", { children: [
            /* @__PURE__ */ jsx2("i", { style: { background: "hsl(0, 62%, 38%)" } }),
            "\u591A\u4EFD\u5B89\u88C5\uFF08\u91CD\u590D\u4F9D\u8D56\uFF09"
          ] }),
          /* @__PURE__ */ jsxs2("span", { children: [
            /* @__PURE__ */ jsx2("i", { style: { background: "hsl(180, 46%, 34%)" } }),
            "npm \u5305\uFF08\u6309\u540D\u914D\u8272\uFF09"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-row", style: { justifyContent: "space-between", marginBottom: 4 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
            "\u6E90\u6A21\u5757\uFF08",
            report.modules.length,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx2("input", { className: "mono", style: { width: 200 }, placeholder: "\u8FC7\u6EE4\u8DEF\u5F84/\u5305\u540D\u2026", value: moduleFilter, onChange: (e) => setModuleFilter(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("table", { className: "bl-table", children: [
          /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
            /* @__PURE__ */ jsx2("th", { children: "\u6E90\u6587\u4EF6 / \u5305\u5185\u6A21\u5757" }),
            /* @__PURE__ */ jsx2("th", { children: "\u5F52\u5C5E" }),
            /* @__PURE__ */ jsx2("th", { children: "\u4F53\u79EF" }),
            /* @__PURE__ */ jsx2("th", { children: "\u6240\u5728 chunk" })
          ] }) }),
          /* @__PURE__ */ jsx2("tbody", { children: report.modules.filter((m) => !moduleFilter || m.source.toLowerCase().includes(moduleFilter.toLowerCase()) || (m.pkg || "").toLowerCase().includes(moduleFilter.toLowerCase())).slice(0, 120).map((m) => /* @__PURE__ */ jsxs2("tr", { children: [
            /* @__PURE__ */ jsx2("td", { className: "bl-path", title: m.source, style: { maxWidth: 340 }, children: m.source }),
            /* @__PURE__ */ jsx2("td", { children: m.pkg ? /* @__PURE__ */ jsx2("span", { className: "bl-badge", style: { background: "#232329" }, children: m.pkg }) : /* @__PURE__ */ jsx2("span", { className: "bl-badge", style: { background: "#1D4ED8", color: "#fff" }, children: "app" }) }),
            /* @__PURE__ */ jsx2("td", { className: "mono", children: fmtBytes(m.bytes) }),
            /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: m.chunks.length > 1 ? /* @__PURE__ */ jsxs2("span", { className: "bl-warn", children: [
              m.chunks.length,
              " \u4E2A chunk \u26A0"
            ] }) : report.chunks[m.chunks[0]] ? report.chunks[m.chunks[0]].relPath : "\u2014" })
          ] }, `${m.source}`)) })
        ] }),
        report.modules.length > 120 && /* @__PURE__ */ jsx2("div", { className: "bl-muted bl-hint", style: { marginTop: 4 }, children: "\u53EA\u663E\u793A\u524D 120 \u4E2A\uFF08\u6309\u4F53\u79EF\u964D\u5E8F\uFF09\uFF0C\u7528\u8FC7\u6EE4\u7F29\u5C0F\u8303\u56F4" })
      ] })
    ] }) }),
    tab === "dups" && /* @__PURE__ */ jsx2("div", { className: "bl-scroll", style: { padding: 12 }, children: !report ? /* @__PURE__ */ jsx2("div", { className: "bl-muted", style: { padding: 20, textAlign: "center" }, children: "\u8FD8\u6CA1\u6709\u62A5\u544A\u2014\u2014\u5148\u53BB\u300C\u626B\u63CF\u300DTab" }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
          "\u786E\u5B9A\u6027\u5EFA\u8BAE\uFF08",
          report.suggestions.length,
          "\uFF09"
        ] }),
        report.suggestions.length === 0 && /* @__PURE__ */ jsx2("div", { className: "bl-ok bl-hint", children: "\u6CA1\u6709\u53D1\u73B0\u660E\u663E\u95EE\u9898 \u2713" }),
        report.suggestions.map((s) => /* @__PURE__ */ jsxs2("div", { className: "bl-card", style: { marginBottom: 6, borderLeft: `3px solid ${s.level === "warn" ? "#FBBF24" : "#3B82F6"}` }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "bl-row", children: [
            /* @__PURE__ */ jsx2("span", { className: `bl-badge ${s.level === "warn" ? "bl-warn" : ""}`, style: { background: s.level === "warn" ? "#3A2E12" : "#16233B" }, children: s.level === "warn" ? "\u8B66\u544A" : "\u4F18\u5316" }),
            /* @__PURE__ */ jsx2("b", { children: s.title })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "bl-hint", style: { marginTop: 4 }, children: s.detail })
        ] }, s.id + s.title))
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
          "\u540C\u5305\u591A\u4EFD\u72EC\u7ACB\u5B89\u88C5\uFF08",
          report.duplicates.versionConflicts.length,
          "\uFF09"
        ] }),
        report.duplicates.versionConflicts.length === 0 && /* @__PURE__ */ jsx2("div", { className: "bl-ok bl-hint", children: "\u65E0 \u2713" }),
        /* @__PURE__ */ jsx2("table", { className: "bl-table", children: /* @__PURE__ */ jsx2("tbody", { children: report.duplicates.versionConflicts.map((c) => /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsxs2("td", { className: "bl-path", title: c.name, style: { maxWidth: 220 }, children: [
            /* @__PURE__ */ jsx2("span", { className: "bl-warn", children: "\u26A0" }),
            " ",
            c.name
          ] }),
          /* @__PURE__ */ jsx2("td", { className: "mono", children: fmtBytes(c.bytes) }),
          /* @__PURE__ */ jsxs2("td", { className: "bl-muted", children: [
            c.roots,
            " \u4EFD\u5B89\u88C5"
          ] }),
          /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: c.versions.join(" / ") || "\u7248\u672C\u672A\u77E5" }),
          /* @__PURE__ */ jsxs2("td", { className: "bl-muted", children: [
            c.files,
            " \u4E2A\u6587\u4EF6"
          ] })
        ] }, c.name)) }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
          "\u540C\u6E90\u6587\u4EF6\u6253\u8FDB\u591A\u4E2A chunk\uFF08",
          report.duplicates.chunkDupes.length,
          "\uFF09"
        ] }),
        report.duplicates.chunkDupes.length === 0 && /* @__PURE__ */ jsx2("div", { className: "bl-ok bl-hint", children: "\u65E0 \u2713" }),
        /* @__PURE__ */ jsx2("table", { className: "bl-table", children: /* @__PURE__ */ jsx2("tbody", { children: report.duplicates.chunkDupes.slice(0, 20).map((d) => /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx2("td", { className: "bl-path", title: d.source, style: { maxWidth: 280 }, children: d.source }),
          /* @__PURE__ */ jsx2("td", { className: "mono", children: fmtBytes(d.totalBytes) }),
          /* @__PURE__ */ jsxs2("td", { className: "bl-muted", children: [
            d.chunkCount,
            " chunks"
          ] }),
          /* @__PURE__ */ jsxs2("td", { className: "bl-warn", children: [
            "\u91CD\u590D ~",
            fmtBytes(d.wasteBytes)
          ] })
        ] }, d.source)) }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bl-section", children: [
        /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
          "\u5F02\u8DEF\u5F84\u5B8C\u5168\u540C\u5185\u5BB9\uFF08",
          report.duplicates.contentDupes.length,
          "\uFF09"
        ] }),
        report.duplicates.contentDupes.length === 0 && /* @__PURE__ */ jsx2("div", { className: "bl-ok bl-hint", children: "\u65E0 \u2713" }),
        report.duplicates.contentDupes.slice(0, 20).map((d) => /* @__PURE__ */ jsxs2("div", { className: "bl-card", style: { marginBottom: 6 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "bl-row", style: { justifyContent: "space-between" }, children: [
            /* @__PURE__ */ jsxs2("b", { children: [
              d.paths.length,
              " \u4EFD \xD7 ",
              fmtBytes(d.bytes)
            ] }),
            /* @__PURE__ */ jsxs2("span", { className: "bl-warn", children: [
              "\u91CD\u590D ~",
              fmtBytes(d.wasteBytes)
            ] })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "bl-hint", style: { wordBreak: "break-all" }, children: d.paths.join("\n") })
        ] }, d.hash))
      ] })
    ] }) }),
    tab === "history" && /* @__PURE__ */ jsxs2("div", { className: "bl-scroll", style: { padding: 12 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "bl-h3", children: [
        "\u626B\u63CF\u5386\u53F2\uFF08",
        runs.length,
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsxs2("table", { className: "bl-table", children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx2("th", { children: "\u65F6\u95F4" }),
          /* @__PURE__ */ jsx2("th", { children: "\u76EE\u5F55" }),
          /* @__PURE__ */ jsx2("th", { children: "\u72B6\u6001" }),
          /* @__PURE__ */ jsx2("th", { children: "\u603B\u4F53\u79EF" }),
          /* @__PURE__ */ jsx2("th", { children: "\u5305\u6570" }),
          /* @__PURE__ */ jsx2("th", { children: "\u8986\u76D6" }),
          /* @__PURE__ */ jsx2("th", { children: "\u8017\u65F6" }),
          /* @__PURE__ */ jsx2("th", {})
        ] }) }),
        /* @__PURE__ */ jsxs2("tbody", { children: [
          runs.length === 0 && /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsx2("td", { colSpan: 8, className: "bl-muted", children: "\u6682\u65E0\u626B\u63CF\u8BB0\u5F55" }) }),
          runs.map((r) => /* @__PURE__ */ jsxs2("tr", { className: report && report.runId === r.runId ? "click sel" : "click", children: [
            /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: dateTimeStr(r.startedAt) }),
            /* @__PURE__ */ jsx2("td", { className: "bl-path", title: r.path, style: { maxWidth: 240 }, children: r.path }),
            /* @__PURE__ */ jsx2("td", { children: r.status === "ok" ? /* @__PURE__ */ jsx2("span", { className: "bl-ok", children: "\u5B8C\u6210" }) : r.status === "error" ? /* @__PURE__ */ jsx2("span", { className: "bl-err", title: r.error, children: "\u5931\u8D25" }) : /* @__PURE__ */ jsx2("span", { className: "bl-warn", children: "\u8FDB\u884C\u4E2D" }) }),
            /* @__PURE__ */ jsx2("td", { className: "mono", children: r.totalBytes != null ? fmtBytes(r.totalBytes) : "\u2014" }),
            /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: r.pkgCount ?? "\u2014" }),
            /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: r.mapCoverage != null ? `${Math.round(r.mapCoverage * 100)}%` : "\u2014" }),
            /* @__PURE__ */ jsx2("td", { className: "bl-muted", children: durStr(r.durationMs) }),
            /* @__PURE__ */ jsx2("td", { children: r.status === "ok" && /* @__PURE__ */ jsx2("button", { className: "small", onClick: () => {
              setTab("overview");
              loadReport(r.runId);
            }, children: "\u67E5\u770B" }) })
          ] }, r.runId))
        ] })
      ] }),
      degraded && /* @__PURE__ */ jsx2("div", { className: "bl-warn bl-hint", style: { marginTop: 8 }, children: "\u5BBF\u4E3B kv \u6865\u964D\u7EA7\uFF1A\u5386\u53F2\u7D22\u5F15\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF08\u670D\u52A1\u5185\u5B58\u91CC\u7684\u4ECD\u53EF\u770B\uFF09" })
    ] })
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
