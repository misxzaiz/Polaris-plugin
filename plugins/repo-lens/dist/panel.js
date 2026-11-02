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
var META_KEY = "repolens.meta";
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
async function svc(method, path, body, timeoutMs = 35e3) {
  const meta = await readMeta();
  if (!meta) throw new SvcError("\u670D\u52A1\u672A\u6CE8\u518C\uFF1A\u540E\u53F0\u670D\u52A1\u5C1A\u672A\u62C9\u8D77\u6216 kv \u4E0D\u53EF\u8FBE\uFF08\u7A0D\u5019\u81EA\u52A8\u91CD\u8BD5\uFF09");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
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
  scan: (path, days, maxCommits) => svc("POST", "/api/scan", { path, days, maxCommits }, 15e3),
  scanStatus: (runId) => svc("GET", `/api/scan/${encodeURIComponent(runId)}`),
  runs: () => svc("GET", "/api/runs"),
  report: (runId) => svc("GET", `/api/report/${encodeURIComponent(runId)}`),
  fileDetail: (runId, path) => svc("GET", `/api/file?runId=${encodeURIComponent(runId)}&path=${encodeURIComponent(path)}`),
  settings: () => svc("GET", "/api/settings"),
  saveSettings: (patch) => svc("POST", "/api/settings", patch),
  selftest: () => svc("POST", "/api/selftest", {}, 6e4)
};

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var STYLE = `
.rl-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.rl-panel * { box-sizing: border-box; }
.rl-panel input, .rl-panel textarea, .rl-panel select, .rl-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.rl-panel input:focus, .rl-panel textarea:focus, .rl-panel select:focus { border-color: #3B82F6; }
.rl-panel button { cursor: pointer; background: #2A2A31; }
.rl-panel button:hover { background: #33333B; }
.rl-panel button:disabled { opacity: .45; cursor: not-allowed; }
.rl-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.rl-panel button.primary:hover { background: #1D4ED8; }
.rl-panel button.small { padding: 2px 8px; border-radius: 4px; }
.rl-panel code, .rl-panel pre, .rl-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.rl-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.rl-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.rl-tab.active { background: #232329; color: #fff; }
.rl-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.rl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.rl-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.rl-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.rl-row { display: flex; align-items: center; gap: 6px; }
.rl-grow { flex: 1; min-width: 0; }
.rl-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.rl-scroll { overflow-y: auto; }
.rl-err { color: #F87171; }
.rl-warn { color: #FBBF24; }
.rl-ok { color: #34D399; }
.rl-muted { color: #6B7280; }
.rl-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.rl-path { font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-table { width: 100%; border-collapse: collapse; }
.rl-table th { text-align: left; font-size: 10.5px; color: #9CA3AF; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #2A2A31; position: sticky; top: 0; background: #1A1A1F; z-index: 1; }
.rl-table td { padding: 5px 8px; border-bottom: 1px solid #202027; font-size: 11.5px; vertical-align: middle; }
.rl-table tr.click { cursor: pointer; }
.rl-table tr.click:hover { background: #202028; }
.rl-table tr.sel { background: #2A2230; }
.rl-barwrap { background: #26262C; border-radius: 3px; height: 8px; min-width: 60px; overflow: hidden; }
.rl-bar { height: 100%; border-radius: 3px; }
.rl-detail { background: #141418; border-top: 1px solid #2A2A31; padding: 8px 12px; max-height: 300px; overflow: auto; }
.rl-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; font-size: 11.5px; line-height: 1.5; }
.rl-section { margin-bottom: 14px; }
.rl-h3 { font-size: 12.5px; font-weight: 600; margin: 0 0 6px; color: #D4D4D8; }
.rl-spark { display: flex; align-items: flex-end; gap: 1px; height: 42px; }
.rl-spark > div { flex: 1; min-width: 2px; background: #3B82F6; border-radius: 1px 1px 0 0; }
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
function dateStr(unixSec) {
  if (!unixSec) return "\u2014";
  const d = new Date(unixSec * 1e3);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function durStr(ms) {
  if (!ms && ms !== 0) return "\u2014";
  if (ms < 1e3) return `${ms}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.floor(ms / 6e4)}m${Math.round(ms % 6e4 / 1e3)}s`;
}
function scoreColor(s) {
  if (s >= 75) return "#34D399";
  if (s >= 50) return "#FBBF24";
  return "#F87171";
}
function hotspotColor(score) {
  if (score >= 55) return "#F87171";
  if (score >= 25) return "#FBBF24";
  return "#34D399";
}
function StatChips({ items }) {
  const toneColor = (t) => t === "ok" ? "#34D399" : t === "warn" ? "#FBBF24" : t === "err" ? "#F87171" : t === "muted" ? "#9CA3AF" : "#E4E4E7";
  return /* @__PURE__ */ jsx("div", { className: "rl-row", style: { flexWrap: "wrap", gap: 6 }, children: items.map((it, i) => /* @__PURE__ */ jsxs("span", { className: "rl-badge", style: { background: "#232329", color: toneColor(it.tone), fontWeight: 500, padding: "3px 10px" }, children: [
    it.label,
    " ",
    /* @__PURE__ */ jsx("b", { style: { color: "#fff" }, children: it.value })
  ] }, i)) });
}
function Bar({ value, max = 100, color }) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /* @__PURE__ */ jsx("div", { className: "rl-barwrap", children: /* @__PURE__ */ jsx("div", { className: "rl-bar", style: { width: `${pct}%`, background: color || "#3B82F6" } }) });
}
function HealthRing({ total, size = 96 }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(100, total)) / 100;
  const color = scoreColor(total);
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [
    /* @__PURE__ */ jsx("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "#26262C", strokeWidth: 9 }),
    /* @__PURE__ */ jsx(
      "circle",
      {
        cx: size / 2,
        cy: size / 2,
        r,
        fill: "none",
        stroke: color,
        strokeWidth: 9,
        strokeDasharray: `${c * frac} ${c}`,
        strokeLinecap: "round",
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        style: { transition: "stroke-dasharray .5s ease" }
      }
    ),
    /* @__PURE__ */ jsx("text", { x: "50%", y: "47%", textAnchor: "middle", fill: "#fff", fontSize: size * 0.26, fontWeight: "700", children: total }),
    /* @__PURE__ */ jsx("text", { x: "50%", y: "66%", textAnchor: "middle", fill: "#9CA3AF", fontSize: size * 0.11, children: "\u5065\u5EB7\u5206" })
  ] });
}
function PartBar({ label, value, weight }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "rl-row", style: { justifyContent: "space-between", fontSize: 11 }, children: [
      /* @__PURE__ */ jsxs("span", { style: { color: "#9CA3AF" }, children: [
        label,
        " ",
        /* @__PURE__ */ jsxs("span", { className: "rl-muted", children: [
          "\xD7",
          weight
        ] })
      ] }),
      /* @__PURE__ */ jsx("b", { style: { color: scoreColor(value) }, children: value })
    ] }),
    /* @__PURE__ */ jsx(Bar, { value, color: scoreColor(value) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PLUGIN_ID = "repo-lens";
var SERVICE_ID = "repo-lens-server";
function Panel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState("scan");
  const [svcDown, setSvcDown] = useState(null);
  const [degraded, setDegraded] = useState(false);
  const [meta, setMeta] = useState(null);
  const [path, setPath] = useState("");
  const [days, setDays] = useState("365");
  const [maxCommits, setMaxCommits] = useState("5000");
  const [recentPaths, setRecentPaths] = useState([]);
  const [busy, setBusy] = useState(null);
  const [scanErr, setScanErr] = useState(null);
  const [report, setReport] = useState(null);
  const [selFile, setSelFile] = useState(null);
  const [fileDetail, setFileDetail] = useState(null);
  const [runs, setRuns] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selftest, setSelftest] = useState(null);
  const [selftesting, setSelftesting] = useState(false);
  const runIdRef = useRef(null);
  const pollRef = useRef(null);
  const loadRuns = useCallback(async () => {
    try {
      const r = await api.runs();
      setRuns(r.runs);
      setDegraded(!!r.degraded);
    } catch (_) {
    }
  }, []);
  const loadSettings = useCallback(async () => {
    try {
      const r = await api.settings();
      setSettings(r.settings);
      setDegraded(r.degraded);
      if (r.settings.recentPaths[0] && !path) setPath(r.settings.recentPaths[0]);
    } catch (_) {
    }
  }, [path]);
  const loadReport = useCallback(async (runId) => {
    try {
      const r = await api.report(runId);
      setReport(r.report);
      runIdRef.current = runId;
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
          setSettings(m.settings);
          setDays(String(m.settings.defaults.days));
          setMaxCommits(String(m.settings.defaults.maxCommits));
          setRecentPaths(m.settings.recentPaths);
          if (m.settings.recentPaths[0]) setPath(m.settings.recentPaths[0]);
        }
        if (m.lastRunId) {
          runIdRef.current = m.lastRunId;
          await loadReport(m.lastRunId);
        }
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
      setScanErr("\u8BF7\u586B\u5199\u4ED3\u5E93\u8DEF\u5F84");
      return;
    }
    const d = Number(days);
    const mc = Number(maxCommits);
    try {
      const r = await api.scan(path.trim(), Number.isFinite(d) && d > 0 ? d : void 0, Number.isFinite(mc) && mc > 0 ? mc : void 0);
      setBusy({ runId: r.runId, status: "running", phase: "queued", progress: 0, message: "\u6392\u961F\u4E2D" });
    } catch (e) {
      if (e instanceof SvcError && e.status === 409) {
        setScanErr("\u5DF2\u6709\u626B\u63CF\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
        return;
      }
      setScanErr(e.message);
    }
  }, [path, days, maxCommits]);
  const openFile = useCallback(async (p) => {
    setSelFile(p);
    setFileDetail(null);
    if (!runIdRef.current) return;
    try {
      setFileDetail(await api.fileDetail(runIdRef.current, p));
    } catch (e) {
      setScanErr(e.message);
    }
  }, []);
  useEffect(() => {
    openFileGlobal = openFile;
    return () => {
      openFileGlobal = () => {
      };
    };
  }, [openFile]);
  const sendSummary = useCallback(async () => {
    if (!report || !onSendToChat) return;
    const t = report.totals;
    const top = (report.hotspots || []).slice(0, 8).map((h, i) => `${i + 1}. ${h.path}\uFF08${h.score} \u5206\uFF0C${h.commits} \u6B21\u63D0\u4EA4\uFF0C\u590D\u6742\u5EA6 ${h.cxScore}\uFF09`).join("\n");
    const couples = (report.couples || []).slice(0, 5).map((c) => `- ${c.a} \u21C4 ${c.b}\uFF08${c.co} \u6B21\u540C\u63D0\u4EA4\uFF09`).join("\n");
    const text = [
      `\u4ED3\u5E93\u4F53\u68C0\u62A5\u544A\uFF08${report.repo ? report.repo.top : "?"}\uFF0C${report.repo ? report.repo.branch : "?"} \u5206\u652F\uFF09`,
      `\u5065\u5EB7\u5206 ${report.health ? report.health.total : "?"}/100\uFF1B\u7A97\u53E3 ${report.window ? report.window.days : "?"} \u5929 / ${t ? t.commits : "?"} \u63D0\u4EA4 / ${t ? t.filesTracked : "?"} \u4E2A\u5DE5\u4F5C\u533A\u6587\u4EF6 / ${t ? t.codeLines : "?"} \u884C\u4EE3\u7801`,
      `\u63D0\u4EA4\u536B\u751F\uFF1Aconventional ${Math.round((report.hygiene ? report.hygiene.conventionalRate : 0) * 100)}%\uFF0C\u8349\u7387 ${report.hygiene ? report.hygiene.sloppy : 0} \u6761\uFF0C\u5DE8\u63D0\u4EA4 ${report.hygiene ? report.hygiene.bigCommits : 0} \u4E2A\uFF1B\u5DF4\u58EB\u56E0\u5B50 ${report.busFactor ? report.busFactor.busFactor : "?"}\uFF08${report.busFactor ? report.busFactor.totalAuthors : "?"} \u4F4D\u4F5C\u8005\uFF09`,
      `\u91CD\u590D\u4EE3\u7801 ${report.dupSummary ? report.dupSummary.totalDupLines : 0} \u884C\uFF08${report.dupSummary ? (report.dupSummary.ratio * 100).toFixed(1) : "?"}%\uFF09\uFF1B\u5386\u53F2\u5927\u5BF9\u8C61 ${report.blobs.length} \u4E2A`,
      "",
      "\u91CD\u6784\u4F18\u5148\u7EA7\uFF08\u70ED\u70B9 Top8\uFF09\uFF1A",
      top,
      couples ? `
\u65F6\u95F4\u8026\u5408\uFF08\u603B\u662F\u4E00\u8D77\u6539\uFF09\uFF1A
${couples}` : "",
      report.warnings && report.warnings.length ? `
\u26A0 ${report.warnings.join("\uFF1B")}` : ""
    ].filter(Boolean).join("\n");
    await onSendToChat(text);
  }, [report, onSendToChat]);
  const saveDefaults = useCallback(async () => {
    const d = Number(days);
    const mc = Number(maxCommits);
    try {
      const r = await api.saveSettings({ defaults: { days: Number.isFinite(d) && d > 0 ? d : 365, maxCommits: Number.isFinite(mc) && mc > 0 ? mc : 5e3 } });
      setSettings(r.settings);
    } catch (e) {
      setScanErr(e.message);
    }
  }, [days, maxCommits]);
  const runSelftest = useCallback(async () => {
    setSelftesting(true);
    try {
      setSelftest(await api.selftest());
    } catch (e) {
      setScanErr(e.message);
    } finally {
      setSelftesting(false);
    }
  }, []);
  const doRestart = useCallback(async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID);
      invalidateMeta();
      setSvcDown(null);
      setMeta(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setScanErr(`\u91CD\u542F\u670D\u52A1\u5931\u8D25\uFF1A${e.message}`);
    }
  }, []);
  return /* @__PURE__ */ jsxs2("div", { className: "rl-panel", children: [
    /* @__PURE__ */ jsx2(PanelStyle, {}),
    /* @__PURE__ */ jsxs2("div", { className: "rl-tabs", children: [
      [["scan", "\u626B\u63CF"], ["overview", "\u603B\u89C8"], ["hotspots", "\u70ED\u70B9"], ["audit", "\u4F53\u68C0"], ["history", "\u5386\u53F2/\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `rl-tab ${tab === k ? "active" : ""}`, onClick: () => {
        setTab(k);
        if (k === "history") loadRuns();
      }, children: label }, k)),
      /* @__PURE__ */ jsx2("div", { className: "rl-grow" }),
      report && tab !== "scan" && /* @__PURE__ */ jsx2(
        "button",
        {
          className: "small",
          style: { margin: "4px 8px" },
          onClick: sendSummary,
          disabled: !onSendToChat,
          title: onSendToChat ? "\u628A\u62A5\u544A\u6458\u8981\u53D1\u5230\u804A\u5929" : "\u5BBF\u4E3B\u672A\u63D0\u4F9B\u53D1\u9001\u901A\u9053",
          children: "\u53D1\u5230\u804A\u5929"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-statusbar", children: [
      /* @__PURE__ */ jsx2("span", { className: "rl-dot", style: { background: svcDown ? "#F87171" : degraded ? "#FBBF24" : "#34D399" } }),
      /* @__PURE__ */ jsx2("span", { children: svcDown ? "\u670D\u52A1\u4E0D\u53EF\u8FBE" : degraded ? "\u964D\u7EA7\uFF08\u5BBF\u4E3B kv \u6865\u79BB\u7EBF\uFF0C\u62A5\u544A\u4E0D\u6295\u5F71\uFF09" : "\u670D\u52A1\u6B63\u5E38" }),
      meta && /* @__PURE__ */ jsxs2("span", { className: "rl-muted", children: [
        "v",
        meta.version,
        " \xB7 \u8FD0\u884C ",
        durStr(meta.uptime)
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "rl-grow" }),
      runIdRef.current && /* @__PURE__ */ jsxs2("span", { className: "rl-muted mono", children: [
        "run ",
        runIdRef.current
      ] })
    ] }),
    scanErr && /* @__PURE__ */ jsxs2("div", { style: { padding: "8px 12px", background: "#2A1B1E", borderBottom: "1px solid #7F1D1D" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "rl-err", children: scanErr }),
      /* @__PURE__ */ jsx2("button", { className: "small", style: { marginLeft: 8 }, onClick: () => setScanErr(null), children: "\u5173\u95ED" })
    ] }),
    tab === "scan" && /* @__PURE__ */ jsx2(
      ScanTab,
      {
        path,
        setPath,
        days,
        setDays,
        maxCommits,
        setMaxCommits,
        recentPaths,
        busy,
        onStart: startScan
      }
    ),
    tab === "overview" && /* @__PURE__ */ jsx2(OverviewTab, { report }),
    tab === "hotspots" && /* @__PURE__ */ jsx2(
      HotspotsTab,
      {
        report,
        selFile,
        fileDetail,
        onOpenFile: openFile,
        onClose: () => {
          setSelFile(null);
          setFileDetail(null);
        }
      }
    ),
    tab === "audit" && /* @__PURE__ */ jsx2(AuditTab, { report }),
    tab === "history" && /* @__PURE__ */ jsx2(
      HistoryTab,
      {
        runs,
        settings,
        days,
        maxCommits,
        setDays,
        setMaxCommits,
        onLoadRun: async (id) => {
          await loadReport(id);
          setTab("overview");
        },
        onSaveDefaults: saveDefaults,
        onSelftest: runSelftest,
        selftest,
        selftesting,
        onRestart: doRestart,
        onClearRecents: async () => {
          try {
            await api.saveSettings({ recentPaths: [] });
            await loadSettings();
          } catch (_) {
          }
        }
      }
    )
  ] });
}
function ScanTab(props) {
  const { path, setPath, days, setDays, maxCommits, setMaxCommits, recentPaths, busy, onStart } = props;
  const running = !!busy && busy.status === "running";
  return /* @__PURE__ */ jsxs2("div", { className: "rl-scroll", style: { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "rl-card", children: [
      /* @__PURE__ */ jsx2("label", { className: "rl-label", children: "\u4ED3\u5E93\u8DEF\u5F84\uFF08\u4ED3\u5E93\u6839\u6216\u5176\u4E2D\u4EFB\u610F\u5B50\u76EE\u5F55\uFF1B\u672C\u673A\u9700\u5DF2\u5B89\u88C5 git\uFF09" }),
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "rl-grow mono",
            value: path,
            placeholder: "\u4F8B\u5982 D:\\space\\base\\Polaris",
            onChange: (e) => setPath(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !running) onStart();
            },
            list: "rl-recent-paths"
          }
        ),
        /* @__PURE__ */ jsx2("datalist", { id: "rl-recent-paths", children: recentPaths.map((p) => /* @__PURE__ */ jsx2("option", { value: p }, p)) }),
        /* @__PURE__ */ jsx2("button", { className: "primary", onClick: onStart, disabled: running, children: running ? "\u4F53\u68C0\u4E2D\u2026" : "\u5F00\u59CB\u4F53\u68C0" })
      ] }),
      recentPaths.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { flexWrap: "wrap", gap: 4, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { fontSize: 10.5 }, children: "\u6700\u8FD1\uFF1A" }),
        recentPaths.slice(0, 4).map((p) => /* @__PURE__ */ jsx2("button", { className: "small", onClick: () => setPath(p), title: p, children: p.split(/[\\/]/).pop() }, p))
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { marginTop: 8, gap: 12 }, children: [
        /* @__PURE__ */ jsxs2("label", { className: "rl-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", children: "\u65F6\u95F4\u7A97\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx2("input", { style: { width: 80 }, value: days, onChange: (e) => setDays(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "rl-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", children: "\u6700\u591A\u63D0\u4EA4\u6570" }),
          /* @__PURE__ */ jsx2("input", { style: { width: 90 }, value: maxCommits, onChange: (e) => setMaxCommits(e.target.value) })
        ] })
      ] })
    ] }),
    running && /* @__PURE__ */ jsxs2("div", { className: "rl-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx2("b", { children: phaseLabel(busy && busy.phase || "") }),
        /* @__PURE__ */ jsxs2("span", { className: "rl-muted", children: [
          Math.round((busy && busy.progress || 0) * 100),
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ jsx2(Bar, { value: (busy && busy.progress || 0) * 100, color: "#3B82F6" }) }),
      /* @__PURE__ */ jsx2("div", { className: "rl-hint", style: { marginTop: 6 }, children: busy && busy.message })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-card rl-hint", children: [
      /* @__PURE__ */ jsx2("b", { style: { color: "#D4D4D8" }, children: "\u516B\u4E2A\u4F53\u68C0\u7EF4\u5EA6" }),
      /* @__PURE__ */ jsxs2("div", { style: { marginTop: 6 }, children: [
        "\u2460 \u70ED\u70B9 = \u53D8\u66F4\u9891\u7387 \xD7 \u590D\u6742\u5EA6\uFF08\u91CD\u6784\u4F18\u5148\u7EA7\uFF09\u3000\u2461 \u65F6\u95F4\u8026\u5408 = \u603B\u662F\u88AB\u4E00\u8D77\u6539\u7684\u6587\u4EF6\u5BF9\uFF08\u9690\u85CF\u4F9D\u8D56\uFF09 \u2462 \u91CD\u590D\u4EE3\u7801\u5757\u3000\u2463 \u5386\u53F2\u5927\u5BF9\u8C61\u3000\u2464 \u63D0\u4EA4\u536B\u751F\uFF08conventional \u9075\u5FAA\u7387/\u8349\u7387\u6D88\u606F/\u5DE8\u63D0\u4EA4\uFF09 \u2465 \u5DF4\u58EB\u56E0\u5B50\u3000\u2466 \u9648\u65E7\u5206\u652F\u3000\u2467 \u8BED\u8A00\u6784\u6210\u4E0E\u7EFC\u5408\u5065\u5EB7\u5206\u3002 \u590D\u6742\u5EA6\u4E3A",
        /* @__PURE__ */ jsx2("b", { children: "\u542F\u53D1\u5F0F\u8FD1\u4F3C" }),
        "\uFF08\u5206\u652F\u5173\u952E\u8BCD + \u5D4C\u5957\u6DF1\u5EA6\uFF09\uFF0C\u53E3\u5F84\u8BDA\u5B9E\u6807\u6CE8\uFF0C\u975E\u7CBE\u786E\u5708\u590D\u6742\u5EA6\u3002"
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 6 }, className: "rl-muted", children: "\u53EA\u8BFB\u4F53\u68C0\uFF1Agit \u5B50\u547D\u4EE4\u5168\u53EA\u8BFB\u767D\u540D\u5355\uFF0C\u4E0D\u5199\u4ED3\u5E93\u4EFB\u4F55\u6587\u4EF6\uFF0C\u96F6\u7F51\u7EDC\u51FA\u7AD9\u3002" })
    ] })
  ] });
}
function phaseLabel(phase) {
  const map = {
    queued: "\u6392\u961F\u4E2D",
    probe: "\u6821\u9A8C\u4ED3\u5E93",
    history: "\u8BFB\u53D6\u63D0\u4EA4\u5386\u53F2",
    analyze: "\u5F52\u5E76\u5206\u6790",
    files: "\u8BFB\u53D6\u5DE5\u4F5C\u533A",
    duplicate: "\u91CD\u590D\u68C0\u6D4B",
    hotspots: "\u70ED\u70B9\u5408\u5E76",
    couples: "\u65F6\u95F4\u8026\u5408",
    blobs: "\u5386\u53F2\u5927\u5BF9\u8C61",
    assemble: "\u6C47\u603B\u8BC4\u5206"
  };
  return map[phase] || phase || "\u8FDB\u884C\u4E2D";
}
function OverviewTab({ report }) {
  if (!report || report.status !== "ok") {
    return /* @__PURE__ */ jsx2(EmptyReport, {});
  }
  const t = report.totals;
  const health = report.health;
  const maxCommits = Math.max(1, ...report.hotspots.map((h) => h.commits));
  const bubble = report.hotspots.filter((h) => h.complexityKnown && h.loc > 0).slice(0, 60);
  return /* @__PURE__ */ jsxs2("div", { className: "rl-scroll", style: { flex: 1, padding: 12 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "rl-card", style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { gap: 12, flexWrap: "wrap" }, children: [
        health && /* @__PURE__ */ jsx2(HealthRing, { total: health.total }),
        /* @__PURE__ */ jsxs2("div", { className: "rl-grow", style: { minWidth: 260 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "rl-path", style: { color: "#fff", fontSize: 13, marginBottom: 4 }, children: [
            report.repo ? report.repo.top : "?",
            " ",
            /* @__PURE__ */ jsxs2("span", { className: "rl-muted", children: [
              "@",
              report.repo ? report.repo.branch : "?"
            ] })
          ] }),
          /* @__PURE__ */ jsx2(StatChips, { items: [
            { label: "\u63D0\u4EA4", value: String(t.commits) },
            { label: "\u5DE5\u4F5C\u533A\u6587\u4EF6", value: String(t.filesTracked) },
            { label: "\u4EE3\u7801\u884C", value: t.codeLines.toLocaleString() },
            { label: "\u7A97\u53E3", value: `${report.window ? report.window.days : "?"} \u5929` },
            { label: "\u8017\u65F6", value: durStr(t.durationMs) },
            { label: "\u4F5C\u8005", value: String(report.busFactor ? report.busFactor.totalAuthors : "?") }
          ] }),
          health && /* @__PURE__ */ jsxs2("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 10 }, children: [
            /* @__PURE__ */ jsx2(PartBar, { label: "\u70ED\u70B9\u96C6\u4E2D\u5EA6", value: health.parts.hotspot, weight: 0.25 }),
            /* @__PURE__ */ jsx2(PartBar, { label: "\u91CD\u590D\u7387", value: health.parts.duplication, weight: 0.2 }),
            /* @__PURE__ */ jsx2(PartBar, { label: "\u63D0\u4EA4\u536B\u751F", value: health.parts.hygiene, weight: 0.25 }),
            /* @__PURE__ */ jsx2(PartBar, { label: "\u5DF4\u58EB\u56E0\u5B50", value: health.parts.busFactor, weight: 0.15 }),
            /* @__PURE__ */ jsx2(PartBar, { label: "\u5386\u53F2\u5927\u5BF9\u8C61", value: health.parts.bigBlobs, weight: 0.15 })
          ] })
        ] })
      ] }),
      report.warnings.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "rl-warn rl-hint", style: { marginTop: 8 }, children: [
        "\u26A0 ",
        report.warnings.join("\uFF1B")
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-card", style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u70ED\u70B9\u6C14\u6CE1\u56FE\uFF08x=\u53D8\u66F4\u9891\u7387\uFF0Cy=\u590D\u6742\u5EA6\uFF0C\u70B9\u5927\u5C0F=\u4EE3\u7801\u884C\u6570\uFF1B\u53F3\u4E0A\u52A0\u4EAE\u7684 = \u91CD\u6784\u4F18\u5148\uFF09" }),
      /* @__PURE__ */ jsx2(BubbleChart, { rows: bubble, maxCommits, onPick: openFileGlobal })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u8BED\u8A00\u6784\u6210\uFF08\u6309\u4EE3\u7801\u884C\uFF09" }),
      report.languages.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u65E0\u53EF\u8BFB\u6587\u672C\u8BED\u8A00" }),
      report.languages.slice(0, 8).map((l) => /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { marginBottom: 4, gap: 8 }, children: [
        /* @__PURE__ */ jsx2("span", { className: "mono", style: { width: 90, flex: "none", fontSize: 11 }, children: l.lang }),
        /* @__PURE__ */ jsx2("div", { className: "rl-grow", children: /* @__PURE__ */ jsx2(Bar, { value: l.codeLines, max: report.languages[0].codeLines, color: "#60A5FA" }) }),
        /* @__PURE__ */ jsxs2("span", { className: "rl-muted", style: { width: 130, textAlign: "right", flex: "none", fontSize: 11 }, children: [
          l.files,
          " \u6587\u4EF6 \xB7 ",
          l.codeLines.toLocaleString(),
          " \u884C"
        ] })
      ] }, l.lang))
    ] })
  ] });
}
var openFileGlobal = () => {
};
function BubbleChart({ rows, maxCommits, onPick }) {
  const W = 620;
  const H = 300;
  const PAD = 34;
  const maxLoc = Math.max(1, ...rows.map((r) => r.loc));
  const rOf = (loc) => 4 + Math.sqrt(loc / maxLoc) * 16;
  const xOf = (commits) => PAD + commits / maxCommits * (W - PAD - 12);
  const yOf = (cx) => H - PAD - cx / 100 * (H - PAD - 14);
  const medCommits = rows.length ? [...rows].sort((a, b) => a.commits - b.commits)[Math.floor(rows.length / 2)].commits : 1;
  return /* @__PURE__ */ jsxs2("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: "auto", background: "#141418", borderRadius: 6 }, children: [
    /* @__PURE__ */ jsx2("line", { x1: xOf(medCommits), y1: 12, x2: xOf(medCommits), y2: H - PAD, stroke: "#2F2F37", strokeDasharray: "4 4" }),
    /* @__PURE__ */ jsx2("line", { x1: PAD, y1: yOf(50), x2: W - 12, y2: yOf(50), stroke: "#2F2F37", strokeDasharray: "4 4" }),
    /* @__PURE__ */ jsx2("text", { x: W - 14, y: 20, textAnchor: "end", fill: "#F87171", fontSize: 10.5, children: "\u9AD8\u9891 \xD7 \u9AD8\u590D\u6742 = \u91CD\u6784\u4F18\u5148" }),
    /* @__PURE__ */ jsx2("text", { x: PAD + 4, y: yOf(50) - 6, fill: "#6B7280", fontSize: 10, children: "\u4F4E\u9891 \xD7 \u9AD8\u590D\u6742 = \u7A33\u5B9A\u4F46\u96BE\u8BFB" }),
    /* @__PURE__ */ jsx2("text", { x: PAD + 4, y: H - PAD + 14, fill: "#6B7280", fontSize: 10, children: "\u4F4E\u9891 \xD7 \u4F4E\u590D\u6742" }),
    /* @__PURE__ */ jsx2("text", { x: xOf(medCommits) + 6, y: H - PAD + 14, fill: "#6B7280", fontSize: 10, children: "\u9AD8\u9891 \xD7 \u4F4E\u590D\u6742 = \u6D3B\u8DC3\u5065\u5EB7" }),
    /* @__PURE__ */ jsx2("text", { x: PAD - 6, y: yOf(100) + 4, fill: "#9CA3AF", fontSize: 9.5, textAnchor: "end", children: "100" }),
    /* @__PURE__ */ jsx2("text", { x: PAD - 6, y: yOf(0) + 4, fill: "#9CA3AF", fontSize: 9.5, textAnchor: "end", children: "0" }),
    rows.map((r) => {
      const c = hotspotColor(r.score);
      return /* @__PURE__ */ jsx2(
        "circle",
        {
          cx: xOf(r.commits),
          cy: yOf(r.cxScore),
          r: rOf(r.loc),
          fill: `${c}55`,
          stroke: c,
          strokeWidth: 1.2,
          style: { cursor: "pointer" },
          onClick: () => onPick(r.path),
          children: /* @__PURE__ */ jsx2("title", { children: `${r.path}
\u70ED\u70B9\u5206 ${r.score}\uFF5C\u63D0\u4EA4 ${r.commits}\uFF5C\u590D\u6742\u5EA6 ${r.cxScore}\uFF5C${r.loc} \u884C\uFF5C${r.authors} \u4F4D\u4F5C\u8005` })
        },
        r.path
      );
    })
  ] });
}
function EmptyReport() {
  return /* @__PURE__ */ jsxs2("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsx2("div", { className: "rl-muted", children: "\u8FD8\u6CA1\u6709\u4F53\u68C0\u62A5\u544A" }),
    /* @__PURE__ */ jsx2("div", { className: "rl-hint", children: "\u5728\u300C\u626B\u63CF\u300DTab \u586B\u5165\u4ED3\u5E93\u8DEF\u5F84\u5F00\u59CB\u4F53\u68C0" })
  ] });
}
function HotspotsTab({ report, selFile, fileDetail, onOpenFile, onClose }) {
  if (!report || report.status !== "ok") return /* @__PURE__ */ jsx2(EmptyReport, {});
  const rows = report.hotspots.slice(0, 200);
  const maxScore = Math.max(1, ...rows.map((r) => r.score));
  return /* @__PURE__ */ jsxs2("div", { style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }, children: [
    /* @__PURE__ */ jsx2("div", { className: "rl-scroll", style: { flex: 1 }, children: /* @__PURE__ */ jsxs2("table", { className: "rl-table", children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("th", { style: { width: 60 }, children: "\u70ED\u70B9\u5206" }),
        /* @__PURE__ */ jsx2("th", { children: "\u6587\u4EF6" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 56, textAlign: "right" }, children: "\u63D0\u4EA4" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 90, textAlign: "right" }, children: "\u589E/\u5220\u884C" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 64, textAlign: "right" }, children: "\u4EE3\u7801\u884C" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 66, textAlign: "right" }, children: "\u590D\u6742\u5EA6" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 44, textAlign: "right" }, children: "\u4F5C\u8005" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 84 }, children: "\u6700\u8FD1\u6539\u52A8" })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: rows.map((h) => /* @__PURE__ */ jsxs2("tr", { className: `click ${selFile === h.path ? "sel" : ""}`, onClick: () => onOpenFile(h.path), children: [
        /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx2("b", { style: { color: hotspotColor(h.score), width: 26, textAlign: "right" }, children: h.score }),
          /* @__PURE__ */ jsx2("div", { style: { width: 30 }, children: /* @__PURE__ */ jsx2(Bar, { value: h.score, max: maxScore, color: hotspotColor(h.score) }) })
        ] }) }),
        /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsx2("div", { className: "rl-path", title: `${h.path}\uFF08${h.lang}${h.complexityKnown ? "" : "\uFF0C\u5185\u5BB9\u672A\u8BFB"}\uFF09`, children: h.path }) }),
        /* @__PURE__ */ jsx2("td", { style: { textAlign: "right" }, children: h.commits }),
        /* @__PURE__ */ jsxs2("td", { style: { textAlign: "right" }, className: "rl-muted", children: [
          "+",
          h.addedLines,
          "/\u2212",
          h.deletedLines
        ] }),
        /* @__PURE__ */ jsx2("td", { style: { textAlign: "right" }, children: h.loc || "\u2014" }),
        /* @__PURE__ */ jsx2("td", { style: { textAlign: "right", color: h.cxScore >= 60 ? "#FBBF24" : void 0 }, children: h.complexityKnown ? h.cxScore : "\u2014" }),
        /* @__PURE__ */ jsx2("td", { style: { textAlign: "right" }, children: h.authors }),
        /* @__PURE__ */ jsx2("td", { className: "rl-muted", children: dateStr(h.lastTouch) })
      ] }, h.path)) })
    ] }) }),
    selFile && /* @__PURE__ */ jsxs2("div", { className: "rl-detail", children: [
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx2("b", { className: "rl-path", style: { color: "#fff" }, children: selFile }),
        /* @__PURE__ */ jsx2("button", { className: "small", onClick: onClose, children: "\u6536\u8D77" })
      ] }),
      !fileDetail && /* @__PURE__ */ jsx2("div", { className: "rl-hint", children: "\u52A0\u8F7D\u4E2D\u2026" }),
      fileDetail && /* @__PURE__ */ jsx2(FileDetailView, { d: fileDetail })
    ] })
  ] });
}
function FileDetailView({ d }) {
  const s = d.summary;
  const maxChurn = Math.max(1, ...d.timeline.map((b) => b.churn));
  return /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
    s && /* @__PURE__ */ jsx2(StatChips, { items: [
      { label: "\u70ED\u70B9\u5206", value: String(s.score), tone: s.score >= 55 ? "err" : s.score >= 25 ? "warn" : "ok" },
      { label: "\u63D0\u4EA4", value: String(s.commits) },
      { label: "\u589E/\u5220", value: `+${s.addedLines}/\u2212${s.deletedLines}` },
      { label: "\u4EE3\u7801\u884C", value: String(s.loc) },
      { label: "\u590D\u6742\u5EA6", value: String(s.cxScore) },
      { label: "\u4F5C\u8005", value: `${s.authors}\uFF08\u4E3B ${s.topAuthor} ${Math.round(s.topAuthorShare * 100)}%\uFF09` },
      { label: "\u6700\u8FD1", value: dateStr(s.lastTouch) }
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "rl-label", style: { marginTop: 8 }, children: "\u8FD1 52 \u5468\u53D8\u66F4\uFF08\u67F1\u9AD8 = \u589E\u5220\u884C\u6570\uFF09" }),
    /* @__PURE__ */ jsx2("div", { className: "rl-spark", children: d.timeline.map((b, i) => /* @__PURE__ */ jsx2(
      "div",
      {
        style: { height: `${Math.max(2, b.churn / maxChurn * 100)}%`, opacity: b.churn ? 1 : 0.25 },
        title: `${b.weekStartIso}\uFF1A${b.commits} \u6B21\u63D0\u4EA4\uFF0C\xB1${b.churn} \u884C`
      },
      i
    )) }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { gap: 16, marginTop: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { minWidth: 220 }, className: "rl-grow", children: [
        /* @__PURE__ */ jsx2("div", { className: "rl-label", children: "\u5171\u53D8\u4F19\u4F34\uFF08\u540C\u4E00\u63D0\u4EA4\u4E2D\u4E00\u8D77\u51FA\u73B0\u7684\u6587\u4EF6 Top\uFF09" }),
        d.coPartners.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u65E0" }),
        d.coPartners.slice(0, 6).map((p) => /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { fontSize: 11, gap: 6 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", children: p.path }),
          /* @__PURE__ */ jsxs2("span", { className: "rl-muted", style: { flex: "none" }, children: [
            "\xD7",
            p.coCommits
          ] })
        ] }, p.path))
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { minWidth: 200 }, children: [
        /* @__PURE__ */ jsx2("div", { className: "rl-label", children: "\u4F5C\u8005\u5206\u5E03" }),
        d.authors.map((a) => /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { fontSize: 11, gap: 6 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "rl-grow", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }),
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { flex: "none" }, children: a.commits })
        ] }, a.name))
      ] })
    ] }),
    d.duplications.length > 0 && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-label", children: "\u6D89\u53CA\u7684\u91CD\u590D\u5757" }),
      d.duplications.slice(0, 5).map((p, i) => /* @__PURE__ */ jsxs2("div", { className: "rl-hint", children: [
        p.a === d.path ? p.b : p.a,
        " \xB7 ",
        p.lines,
        " \u884C\u91CD\u590D"
      ] }, i))
    ] })
  ] });
}
function AuditTab({ report }) {
  const [dupOpen, setDupOpen] = useState(null);
  if (!report || report.status !== "ok") return /* @__PURE__ */ jsx2(EmptyReport, {});
  const stale = report.branches.filter((b) => Date.now() / 1e3 - b.date > 30 * 86400);
  return /* @__PURE__ */ jsxs2("div", { className: "rl-scroll", style: { flex: 1, padding: 12 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u65F6\u95F4\u8026\u5408\uFF08\u540C\u7A97\u5185\u603B\u662F\u88AB\u4E00\u8D77\u6539\u7684\u6587\u4EF6\u5BF9\u2014\u2014\u8868\u9762\u72EC\u7ACB\u3001\u5B9E\u9645\u4E00\u4F53\uFF09" }),
      report.couples.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u65E0\u663E\u8457\u5171\u53D8\u5BF9\uFF08\u22653 \u6B21\u540C\u63D0\u4EA4\u4E14\u5360\u6BD4 \u22650.5\uFF09" }),
      report.couples.slice(0, 20).map((c, i) => /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { fontSize: 11.5, padding: "3px 0", gap: 8, borderBottom: "1px solid #202027" }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "rl-badge", style: { background: "#312A1A", color: "#FBBF24", flex: "none" }, children: [
          c.co,
          "\u6B21"
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", title: c.a, children: c.a }),
        /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { flex: "none" }, children: "\u21C4" }),
        /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", title: c.b, children: c.b }),
        /* @__PURE__ */ jsxs2("span", { className: "rl-muted", style: { flex: "none", width: 46, textAlign: "right" }, children: [
          Math.round(c.ratio * 100),
          "%"
        ] })
      ] }, i))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u91CD\u590D\u4EE3\u7801\u5757\uFF08\u5F52\u4E00\u5316\u884C\u54C8\u5E0C\uFF0C6 \u884C\u7A97\u53E3\uFF09" }),
      /* @__PURE__ */ jsxs2("div", { className: "rl-hint", style: { marginBottom: 6 }, children: [
        "\u5171 ",
        report.dupSummary ? report.dupSummary.totalDupLines : 0,
        " \u884C\u91CD\u590D \uFF08\u5360\u4EE3\u7801 ",
        report.dupSummary ? (report.dupSummary.ratio * 100).toFixed(1) : "?",
        "%\uFF09",
        report.dupSummary && report.dupSummary.filesSkipped > 0 ? `\uFF1B\u8DF3\u8FC7\u5927\u6587\u4EF6 ${report.dupSummary.filesSkipped} \u4E2A` : ""
      ] }),
      report.duplications.pairs.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u672A\u68C0\u51FA \u22656 \u884C\u7684\u91CD\u590D\u5757" }),
      report.duplications.pairs.slice(0, 30).map((p, i) => /* @__PURE__ */ jsxs2("div", { style: { borderBottom: "1px solid #202027" }, children: [
        /* @__PURE__ */ jsxs2("div", { className: "rl-row click", style: { padding: "4px 0", cursor: "pointer", gap: 8 }, onClick: () => setDupOpen(dupOpen === i ? null : i), children: [
          /* @__PURE__ */ jsxs2("span", { className: "rl-badge", style: { background: "#1E2A3A", color: "#93C5FD", flex: "none" }, children: [
            p.lines,
            " \u884C"
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", title: p.a, children: p.a }),
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { flex: "none" }, children: "\u21C4" }),
          /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", title: p.b, children: p.b })
        ] }),
        dupOpen === i && /* @__PURE__ */ jsx2("pre", { style: { margin: "2px 0 8px", background: "#141418", padding: 6, borderRadius: 6, fontSize: 11 }, children: p.preview.join("\n") })
      ] }, i))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u63D0\u4EA4\u536B\u751F \xD7 \u5DF4\u58EB\u56E0\u5B50" }),
      /* @__PURE__ */ jsx2(StatChips, { items: [
        { label: "conventional", value: `${Math.round((report.hygiene ? report.hygiene.conventionalRate : 0) * 100)}%`, tone: (report.hygiene ? report.hygiene.conventionalRate : 0) >= 0.6 ? "ok" : "warn" },
        { label: "\u8349\u7387\u6D88\u606F", value: String(report.hygiene ? report.hygiene.sloppy : 0), tone: (report.hygiene ? report.hygiene.sloppyRate : 0) > 0.2 ? "warn" : "ok" },
        { label: "\u5DE8\u63D0\u4EA4(\u226520\u6587\u4EF6)", value: String(report.hygiene ? report.hygiene.bigCommits : 0), tone: (report.hygiene ? report.hygiene.bigRate : 0) > 0.1 ? "warn" : "ok" },
        { label: "\u5E73\u5747\u6807\u9898", value: `${report.hygiene ? report.hygiene.avgSubjectLen : 0} \u5B57\u7B26` },
        { label: "\u5DF4\u58EB\u56E0\u5B50", value: String(report.busFactor ? report.busFactor.busFactor : "?"), tone: (report.busFactor ? report.busFactor.busFactor : 9) <= 2 ? "warn" : "ok" }
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 8 }, children: (report.busFactor && report.busFactor.authors || []).map((a) => /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { fontSize: 11, gap: 8, marginBottom: 3 }, children: [
        /* @__PURE__ */ jsx2("span", { style: { width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "none" }, children: a.name }),
        /* @__PURE__ */ jsx2("div", { className: "rl-grow", children: /* @__PURE__ */ jsx2(Bar, { value: a.commits, max: report.busFactor && report.busFactor.authors[0].commits || 1, color: "#8B5CF6" }) }),
        /* @__PURE__ */ jsxs2("span", { className: "rl-muted", style: { width: 90, textAlign: "right", flex: "none" }, children: [
          a.commits,
          " \u6B21 \xB7 ",
          Math.round(a.share * 100),
          "%"
        ] })
      ] }, a.name)) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u5386\u53F2\u5927\u5BF9\u8C61\uFF08.git \u91CC\u7684\u4F53\u79EF\u5927\u6237\uFF09" }),
      report.blobs.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u65E0\u663E\u8457\u5927\u5BF9\u8C61" }),
      report.blobs.slice(0, 15).map((b) => /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { fontSize: 11.5, gap: 8, padding: "3px 0" }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "rl-badge", style: { background: b.mb >= 10 ? "#3A1E1E" : "#232329", color: b.mb >= 10 ? "#F87171" : "#A1A1AA", width: 62, textAlign: "center", flex: "none" }, children: [
          b.mb,
          "MB"
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", title: b.path, children: b.path }),
        /* @__PURE__ */ jsxs2("span", { className: "rl-muted", style: { flex: "none" }, children: [
          b.versions,
          " \u7248\u672C"
        ] })
      ] }, b.path))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "rl-h3", children: [
        "\u5206\u652F\uFF08",
        stale.length,
        " / ",
        report.branches.length,
        " \u4E2A\u8D85\u8FC7 30 \u5929\u672A\u52A8\uFF09"
      ] }),
      report.branches.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u65E0\u672C\u5730\u5206\u652F\u4FE1\u606F" }),
      report.branches.slice(0, 20).map((b) => {
        const ageDays = Math.floor((Date.now() / 1e3 - b.date) / 86400);
        return /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { fontSize: 11.5, gap: 8, padding: "3px 0" }, children: [
          /* @__PURE__ */ jsxs2("span", { className: "rl-badge", style: { background: ageDays > 30 ? "#3A1E1E" : "#1E2A22", color: ageDays > 30 ? "#F87171" : "#34D399", flex: "none" }, children: [
            ageDays,
            "\u5929"
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "mono", style: { flex: "none", color: "#93C5FD" }, children: b.branch }),
          /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow rl-muted", children: b.subject }),
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { flex: "none" }, children: b.author })
        ] }, b.branch);
      })
    ] })
  ] });
}
function HistoryTab(props) {
  const { runs, settings, days, maxCommits, setDays, setMaxCommits, onLoadRun, onSaveDefaults, onSelftest, selftest, selftesting, onRestart, onClearRecents } = props;
  return /* @__PURE__ */ jsxs2("div", { className: "rl-scroll", style: { flex: 1, padding: 12 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "rl-h3", children: [
        "\u626B\u63CF\u5386\u53F2\uFF08\u6700\u8FD1 ",
        runs.length,
        " \u6B21\uFF09"
      ] }),
      runs.length === 0 && /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u8FD8\u6CA1\u6709\u626B\u63CF\u8BB0\u5F55" }),
      runs.map((r) => /* @__PURE__ */ jsxs2("div", { className: "rl-row click", style: { fontSize: 11.5, gap: 8, padding: "5px 0", cursor: "pointer", borderBottom: "1px solid #202027" }, onClick: () => r.status === "ok" && onLoadRun(r.runId), children: [
        /* @__PURE__ */ jsx2("span", { className: "rl-dot", style: { background: r.status === "ok" ? "#34D399" : "#F87171", flex: "none" } }),
        /* @__PURE__ */ jsx2("span", { className: "rl-badge", style: { background: "#232329", flex: "none", width: 64, textAlign: "center" }, children: r.status === "ok" ? `${r.health != null ? r.health : "?"}\u5206` : "\u5931\u8D25" }),
        /* @__PURE__ */ jsx2("span", { className: "rl-path rl-grow", title: r.path, children: r.path }),
        /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { flex: "none" }, children: r.commits != null ? `${r.commits} \u63D0\u4EA4` : "" }),
        /* @__PURE__ */ jsx2("span", { className: "rl-muted", style: { flex: "none", width: 90, textAlign: "right" }, children: dateTimeStr(r.startedAt) })
      ] }, r.runId))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u9ED8\u8BA4\u626B\u63CF\u53C2\u6570" }),
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { gap: 12 }, children: [
        /* @__PURE__ */ jsxs2("label", { className: "rl-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", children: "\u65F6\u95F4\u7A97\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx2("input", { style: { width: 80 }, value: days, onChange: (e) => setDays(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "rl-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "rl-muted", children: "\u6700\u591A\u63D0\u4EA4\u6570" }),
          /* @__PURE__ */ jsx2("input", { style: { width: 90 }, value: maxCommits, onChange: (e) => setMaxCommits(e.target.value) })
        ] }),
        /* @__PURE__ */ jsx2("button", { className: "primary", onClick: onSaveDefaults, children: "\u4FDD\u5B58\u9ED8\u8BA4" })
      ] }),
      settings && settings.recentPaths.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "rl-muted", children: [
          "\u6700\u8FD1\u8DEF\u5F84 ",
          settings.recentPaths.length,
          " \u6761"
        ] }),
        /* @__PURE__ */ jsx2("button", { className: "small", onClick: onClearRecents, children: "\u6E05\u9664" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "rl-section rl-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "rl-h3", children: "\u79BB\u7EBF\u81EA\u68C0\u4E0E\u670D\u52A1" }),
      /* @__PURE__ */ jsxs2("div", { className: "rl-row", style: { gap: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "primary", onClick: onSelftest, disabled: selftesting, children: selftesting ? "\u81EA\u68C0\u4E2D\u2026" : "\u8DD1\u81EA\u68C0" }),
        /* @__PURE__ */ jsx2("button", { onClick: onRestart, children: "\u91CD\u542F\u670D\u52A1" })
      ] }),
      selftest && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("div", { className: selftest.ok ? "rl-ok" : "rl-err", children: selftest.ok ? `\u2713 \u81EA\u68C0 ${selftest.total}/${selftest.total} \u901A\u8FC7` : `\u2717 ${selftest.total - selftest.failed.length}/${selftest.total} \u901A\u8FC7` }),
        /* @__PURE__ */ jsxs2("div", { className: "rl-hint rl-muted", children: [
          "git\uFF1A",
          selftest.git
        ] }),
        selftest.failed.map((f) => /* @__PURE__ */ jsxs2("div", { className: "rl-err rl-hint", children: [
          "\u2717 ",
          f.name,
          ": ",
          f.error
        ] }, f.name))
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "rl-hint rl-muted", children: "\u4E0A\u9650\u53E3\u5F84\uFF1A\u6587\u4EF6 3000 / \u5355\u6587\u4EF6 1MB / \u5185\u5BB9 30MB / \u63D0\u4EA4 2 \u4E07 / git log \u8F93\u51FA 64MB\uFF0C\u8D85\u51FA\u5373\u622A\u65AD\u5E76\u5728\u8B66\u544A\u4E2D\u660E\u793A\u3002 \u5386\u53F2\u62A5\u544A\u5728\u670D\u52A1\u91CD\u542F\u540E\u4E22\u5931\uFF08kv \u6295\u5F71\u4ECD\u53EF\u67E5\u6982\u51B5\uFF0C\u6587\u4EF6\u4E0B\u94BB\u9700\u91CD\u626B\uFF09\u3002" })
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
