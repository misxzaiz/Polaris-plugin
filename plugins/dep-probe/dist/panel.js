// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState2 } from "react";

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
var metaCache = null;
async function readMeta(force = false) {
  if (!force && metaCache) return metaCache;
  const m = await kvGet("depprobe.meta");
  if (m && typeof m.port === "number" && m.token) {
    metaCache = m;
    return m;
  }
  metaCache = null;
  return null;
}
function invalidateMeta() {
  metaCache = null;
}
var SvcError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
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
  scan: (paths) => svc("POST", "/api/scan", { paths }, 15e3),
  scanStatus: (runId) => svc("GET", `/api/scan/${encodeURIComponent(runId)}`),
  runs: () => svc("GET", "/api/runs"),
  report: (runId) => svc("GET", `/api/report/${encodeURIComponent(runId)}`),
  settings: () => svc("GET", "/api/settings"),
  saveSettings: (patch) => svc("POST", "/api/settings", patch),
  selftest: () => svc("POST", "/api/selftest", {}, 2e4),
  checkPkg: (ecosystem, pkg, version) => svc("POST", "/api/check", { ecosystem, pkg, version }, 6e4)
};

// src/ui.tsx
import React, { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var STYLE = `
.depprobe-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.depprobe-panel * { box-sizing: border-box; }
.depprobe-panel input, .depprobe-panel textarea, .depprobe-panel select, .depprobe-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.depprobe-panel input:focus, .depprobe-panel textarea:focus, .depprobe-panel select:focus { border-color: #3B82F6; }
.depprobe-panel button { cursor: pointer; background: #2A2A31; }
.depprobe-panel button:hover { background: #33333B; }
.depprobe-panel button:disabled { opacity: .45; cursor: not-allowed; }
.depprobe-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.depprobe-panel button.primary:hover { background: #1D4ED8; }
.depprobe-panel button.danger { background: #7F1D1D; border-color: #991B1B; color: #FECACA; }
.depprobe-panel button.small { padding: 2px 8px; border-radius: 4px; }
.depprobe-panel textarea { font-family: ui-monospace, Consolas, monospace; }
.depprobe-panel code, .depprobe-panel pre, .depprobe-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.dp-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.dp-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.dp-tab.active { background: #232329; color: #fff; }
.dp-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.dp-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dp-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.dp-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.dp-row { display: flex; align-items: center; gap: 6px; }
.dp-grow { flex: 1; min-width: 0; }
.dp-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.dp-scroll { overflow-y: auto; }
.dp-chip { background: #232329; border: 1px solid #2A2A31; border-radius: 6px; padding: 4px 10px; font-size: 11px; }
.dp-chip b { color: #fff; font-weight: 600; }
.dp-err { color: #F87171; }
.dp-warn { color: #FBBF24; }
.dp-ok { color: #34D399; }
.dp-muted { color: #6B7280; }
.dp-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.dp-find { padding: 5px 10px; border-bottom: 1px solid #202027; cursor: pointer; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.dp-find:hover { background: #202028; }
.dp-find.sel { background: #2A2230; }
.dp-find .dp-pkg { flex: none; min-width: 130px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; }
.dp-find .dp-id { color: #93C5FD; font-family: ui-monospace, Consolas, monospace; font-size: 11px; flex: none; }
.dp-find .dp-sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #A1A1AA; font-size: 11.5px; }
.dp-detail { background: #141418; border-top: 1px solid #2A2A31; padding: 8px 12px; max-height: 240px; overflow: auto; }
.dp-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; font-size: 11.5px; line-height: 1.5; }
`;
function PanelStyle() {
  return /* @__PURE__ */ jsx("style", { children: STYLE });
}
var SEV_LABEL = {
  critical: "\u4E25\u91CD",
  high: "\u9AD8",
  medium: "\u4E2D",
  low: "\u4F4E",
  unknown: "\u672A\u5206\u7EA7"
};
function sevColor(s) {
  switch (s) {
    case "critical":
      return "#F87171";
    case "high":
      return "#FB923C";
    case "medium":
      return "#FBBF24";
    case "low":
      return "#60A5FA";
    default:
      return "#9CA3AF";
  }
}
function SevBadge({ sev }) {
  const c = sevColor(sev);
  return /* @__PURE__ */ jsx("span", { className: "dp-badge", style: { background: `${c}22`, color: c }, children: SEV_LABEL[sev] || sev });
}
function timeStr(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function dateTimeStr(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function StatChips({ items }) {
  const toneColor = (t) => t === "ok" ? "#34D399" : t === "warn" ? "#FBBF24" : t === "err" ? "#F87171" : t === "muted" ? "#9CA3AF" : "#E4E4E7";
  return /* @__PURE__ */ jsx("div", { className: "dp-row", style: { flexWrap: "wrap", gap: 6 }, children: items.map((it) => /* @__PURE__ */ jsxs("span", { className: "dp-chip", children: [
    /* @__PURE__ */ jsxs("span", { className: "dp-muted", children: [
      it.label,
      " "
    ] }),
    /* @__PURE__ */ jsx("b", { style: { color: toneColor(it.tone) }, children: it.value })
  ] }, it.label)) });
}
function FindingList({ findings, emptyHint, onIgnore }) {
  const [sel, setSel] = useState(null);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", minHeight: 0 }, children: [
    findings.length === 0 && /* @__PURE__ */ jsx("div", { className: "dp-hint", style: { padding: 14 }, children: emptyHint || "\uFF08\u65E0\u53D1\u73B0\uFF09" }),
    findings.map((f) => {
      const key = `${f.pkg}@${f.version}|${f.vulnId}`;
      return /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `dp-find ${sel === key ? "sel" : ""}`, onClick: () => setSel(sel === key ? null : key), children: [
          /* @__PURE__ */ jsx(SevBadge, { sev: f.severity }),
          /* @__PURE__ */ jsxs("span", { className: "dp-pkg", title: `${f.pkg}@${f.version}`, children: [
            f.pkg,
            /* @__PURE__ */ jsxs("span", { className: "dp-muted", children: [
              "@",
              f.version
            ] })
          ] }),
          /* @__PURE__ */ jsx("span", { className: "dp-id", children: f.vulnId }),
          /* @__PURE__ */ jsx("span", { className: "dp-sum", children: f.summary || (f.detailOk ? "" : "\uFF08\u8BE6\u60C5\u83B7\u53D6\u5931\u8D25\uFF09") }),
          f.fixed.length > 0 && /* @__PURE__ */ jsxs("span", { className: "dp-ok", style: { flex: "none", fontSize: 11 }, children: [
            "\u2192 ",
            f.fixed[0]
          ] })
        ] }),
        sel === key && /* @__PURE__ */ jsx(FindingDetail, { f, onIgnore })
      ] }, key);
    })
  ] });
}
function FindingDetail({ f, onIgnore }) {
  return /* @__PURE__ */ jsxs("div", { className: "dp-detail", children: [
    /* @__PURE__ */ jsxs("div", { className: "dp-row", style: { marginBottom: 4 }, children: [
      /* @__PURE__ */ jsx("span", { className: "dp-badge", style: { background: `${sevColor(f.severity)}18`, color: sevColor(f.severity) }, children: f.vulnId }),
      f.url && /* @__PURE__ */ jsx("a", { href: f.url, target: "_blank", rel: "noreferrer", style: { color: "#93C5FD", fontSize: 11 }, children: "\u516C\u544A\u9875 \u2197" }),
      onIgnore && /* @__PURE__ */ jsx("button", { className: "small", style: { marginLeft: "auto" }, onClick: (e) => {
        e.stopPropagation();
        onIgnore(f);
      }, children: "\u5FFD\u7565\u6B64\u5305\u6B64\u6F0F\u6D1E\u2026" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "dp-hint", style: { marginBottom: 4 }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "dp-muted", children: "\u5305\uFF1A" }),
        /* @__PURE__ */ jsxs("span", { className: "mono", children: [
          f.pkg,
          "@",
          f.version
        ] }),
        "\uFF08",
        f.ecosystem,
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "dp-muted", children: "\u6765\u6E90\uFF1A" }),
        /* @__PURE__ */ jsx("span", { className: "mono", children: f.file })
      ] }),
      f.aliases.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "dp-muted", children: "\u522B\u540D\uFF1A" }),
        f.aliases.join(", ")
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "dp-muted", children: "\u4FEE\u590D\u7248\u672C\uFF1A" }),
        f.fixed.length ? /* @__PURE__ */ jsx("span", { className: "dp-ok mono", children: f.fixed.join(" / ") }) : /* @__PURE__ */ jsx("span", { className: "dp-warn", children: "\u5B98\u65B9\u672A\u63D0\u4F9B fixed \u7248\u672C" })
      ] }),
      !f.detailOk && /* @__PURE__ */ jsx("div", { className: "dp-warn", children: "\u8BE6\u60C5\u83B7\u53D6\u5931\u8D25\uFF08\u4E25\u91CD\u5EA6\u6309\u672A\u5206\u7EA7\u8BA1\uFF09" })
    ] }),
    f.summary && /* @__PURE__ */ jsx("pre", { children: f.summary })
  ] });
}

// src/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PLUGIN_ID = "dep-probe";
var SERVICE_ID = "dep-probe-server";
var SEVS = ["critical", "high", "medium", "low", "unknown"];
function Panel({ pluginId }) {
  const [tab, setTab] = useState2("scan");
  const [svcDown, setSvcDown] = useState2(null);
  const [degraded, setDegraded] = useState2(false);
  const [metaInfo, setMetaInfo] = useState2(null);
  const [pathsText, setPathsText] = useState2("");
  const [busy, setBusy] = useState2(null);
  const [scanErr, setScanErr] = useState2(null);
  const [report, setReport] = useState2(null);
  const [reportLoading, setReportLoading] = useState2(false);
  const [runs, setRuns] = useState2([]);
  const [settings, setSettings] = useState2(null);
  const [selftest, setSelftest] = useState2(null);
  const runIdRef = useRef(null);
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
    } catch (_) {
    }
  }, []);
  const loadReport = useCallback(async (runId) => {
    setReportLoading(true);
    try {
      const r = await api.report(runId);
      setReport(r.report);
      setDegraded(false);
    } catch (e) {
      setScanErr(e.message);
    } finally {
      setReportLoading(false);
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
        const meta = await api.meta();
        setMetaInfo({ version: meta.version, uptime: meta.uptime, kvEndpoint: meta.kvEndpoint, osvBase: meta.osvBase });
        setDegraded(meta.degraded);
        setSvcDown(null);
      } catch (e) {
        setSvcDown(e.message);
      }
      try {
        const s = await api.settings();
        if (alive) {
          setSettings(s.settings);
          if (s.settings.recentPaths.length) setPathsText(s.settings.recentPaths.join("\n"));
        }
      } catch (_) {
      }
      try {
        const r = await api.runs();
        if (alive && r.runs.length) {
          setRuns(r.runs);
          await loadReport("latest");
        }
      } catch (_) {
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      if (!alive) return;
      try {
        const rid = runIdRef.current;
        if (rid) {
          const st = await api.scanStatus(rid);
          if (!alive) return;
          setBusy(st.status === "running" ? st : null);
          if (st.status === "done" && st.report) {
            runIdRef.current = null;
            setReport(st.report);
            setScanErr(null);
            loadRuns();
          } else if (st.status === "error") {
            runIdRef.current = null;
            setScanErr(st.progress.error || st.error || "\u626B\u63CF\u5931\u8D25");
            loadRuns();
          }
        } else {
          const meta = await api.meta();
          if (!alive) return;
          setSvcDown(null);
          setMetaInfo({ version: meta.version, uptime: meta.uptime, kvEndpoint: meta.kvEndpoint, osvBase: meta.osvBase });
          setDegraded(meta.degraded);
        }
      } catch (e) {
        if (alive) setSvcDown(e.message);
      }
      timer = setTimeout(tick, runIdRef.current ? 1e3 : 3e3);
    };
    timer = setTimeout(tick, 1200);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [loadRuns]);
  const startScan = useCallback(async () => {
    const paths = pathsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!paths.length) {
      setScanErr("\u8BF7\u5148\u586B\u5165\u81F3\u5C11\u4E00\u4E2A\u8DEF\u5F84\uFF08\u76EE\u5F55\u6216 lockfile \u6587\u4EF6\uFF0C\u6BCF\u884C\u4E00\u4E2A\uFF09");
      return;
    }
    setScanErr(null);
    try {
      const { runId } = await api.scan(paths);
      runIdRef.current = runId;
      const st = await api.scanStatus(runId);
      setBusy(st);
    } catch (e) {
      if (e instanceof SvcError && e.status === 409) setScanErr("\u5DF2\u6709\u626B\u63CF\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
      else setScanErr(e.message);
    }
  }, [pathsText]);
  const openRun = useCallback((runId) => {
    setTab("report");
    void loadReport(runId);
  }, [loadReport]);
  const addIgnore = useCallback(async (f) => {
    const reason = window.prompt(`\u5FFD\u7565 ${f.pkg} / ${f.vulnId} \u7684\u7406\u7531\uFF08\u4F1A\u7559\u6863\uFF09`, "\u8BEF\u62A5/\u5DF2\u786E\u8BA4\u65E0\u98CE\u9669");
    if (reason == null) return;
    const rule = { pkg: f.pkg, vulnId: f.vulnId, reason: reason || "\uFF08\u672A\u586B\u5199\uFF09", at: Date.now() };
    const next = { ...settings || { ignores: [], recentPaths: [] }, ignores: [...settings?.ignores || [], rule] };
    try {
      const r = await api.saveSettings({ ignores: next.ignores });
      setSettings(r.settings);
      setReport((rep) => rep ? {
        ...rep,
        findings: rep.findings.filter((x) => !(x.pkg === f.pkg && x.vulnId === f.vulnId)),
        findingCount: Math.max(0, rep.findingCount - 1),
        ignoredCount: rep.ignoredCount + 1
      } : rep);
    } catch (e) {
      setScanErr(e.message);
    }
  }, [settings]);
  const removeIgnore = useCallback(async (rule) => {
    if (!settings) return;
    const next = settings.ignores.filter((x) => !(x.pkg === rule.pkg && x.vulnId === rule.vulnId && x.at === rule.at));
    try {
      const r = await api.saveSettings({ ignores: next });
      setSettings(r.settings);
    } catch (e) {
      setScanErr(e.message);
    }
  }, [settings]);
  const doRestart = useCallback(async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID);
      invalidateMeta();
      setSvcDown(null);
      setBusy(null);
      runIdRef.current = null;
    } catch (e) {
      setScanErr(`\u91CD\u542F\u5931\u8D25\uFF1A${e.message}`);
    }
  }, []);
  const doSelftest = useCallback(async () => {
    try {
      setSelftest(await api.selftest());
    } catch (e) {
      setSelftest({ ok: false, checks: [e.message] });
    }
  }, []);
  return /* @__PURE__ */ jsxs2("div", { className: "depprobe-panel", children: [
    /* @__PURE__ */ jsx2(PanelStyle, {}),
    /* @__PURE__ */ jsx2("div", { className: "dp-tabs", children: [["scan", "\u626B\u63CF"], ["report", "\u62A5\u544A"], ["history", "\u5386\u53F2"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `dp-tab ${tab === k ? "active" : ""}`, onClick: () => {
      setTab(k);
      if (k === "history") loadRuns();
      if (k === "settings") loadSettings();
    }, children: label }, k)) }),
    /* @__PURE__ */ jsxs2("div", { className: "dp-statusbar", children: [
      /* @__PURE__ */ jsx2("span", { className: "dp-dot", style: { background: svcDown ? "#F87171" : degraded ? "#FBBF24" : "#34D399" } }),
      /* @__PURE__ */ jsx2("span", { children: svcDown ? `\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${svcDown}` : degraded ? "\u964D\u7EA7\u6A21\u5F0F\uFF08kv \u4E0D\u53EF\u8FBE\uFF0C\u4EC5\u5F53\u524D\u4F1A\u8BDD\u53EF\u89C1\uFF09" : `\u670D\u52A1\u6B63\u5E38 v${metaInfo?.version || "\u2026"} \xB7 OSV: ${metaInfo?.osvBase || "\u2026"}` }),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      busy && /* @__PURE__ */ jsx2("span", { className: "dp-badge", style: { background: "#1D4ED822", color: "#60A5FA" }, children: "\u626B\u63CF\u4E2D" })
    ] }),
    tab === "scan" && /* @__PURE__ */ jsx2(
      ScanTab,
      {
        pathsText,
        setPathsText,
        busy,
        scanErr,
        onStart: startScan,
        lastReport: report,
        onOpenReport: () => setTab("report")
      }
    ),
    tab === "report" && /* @__PURE__ */ jsx2(ReportTab, { report, loading: reportLoading, onIgnore: addIgnore }),
    tab === "history" && /* @__PURE__ */ jsx2(HistoryTab, { runs, onOpen: openRun }),
    tab === "settings" && /* @__PURE__ */ jsx2(
      SettingsTab,
      {
        settings,
        metaInfo,
        degraded,
        selftest,
        onSelftest: doSelftest,
        onRestart: doRestart,
        onRemoveIgnore: removeIgnore
      }
    )
  ] });
}
function ScanTab({ pathsText, setPathsText, busy, scanErr, onStart, lastReport, onOpenReport }) {
  return /* @__PURE__ */ jsxs2("div", { className: "dp-scroll", style: { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsx2("label", { className: "dp-label", children: "\u4F53\u68C0\u8303\u56F4\uFF08\u6BCF\u884C\u4E00\u4E2A\u76EE\u5F55\u6216 lockfile \u6587\u4EF6\uFF1B\u76EE\u5F55\u9012\u5F52\u53D1\u73B0 lockfile\uFF0C\u6700\u591A 4 \u5C42\u6DF1\uFF0C\u81EA\u52A8\u8DF3\u8FC7 node_modules / target \u7B49\uFF09" }),
      /* @__PURE__ */ jsx2(
        "textarea",
        {
          style: { width: "100%", minHeight: 88, resize: "vertical" },
          placeholder: "D:\\space\\base\\Polaris-plugin\nD:\\space\\base\\Polaris\\src-tauri\\Cargo.lock",
          value: pathsText,
          onChange: (e) => setPathsText(e.target.value),
          disabled: !!busy
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "dp-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "primary", disabled: !!busy || !pathsText.trim(), onClick: onStart, children: "\u5F00\u59CB\u4F53\u68C0" }),
        /* @__PURE__ */ jsx2("span", { className: "dp-hint", children: "\u53D7\u652F\u6301\uFF1Apackage-lock.json / pnpm-lock.yaml / Cargo.lock / requirements*.txt / go.mod" })
      ] }),
      scanErr && /* @__PURE__ */ jsx2("div", { className: "dp-err", style: { marginTop: 6 }, children: scanErr })
    ] }),
    busy && /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "dp-row", style: { marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx2("span", { className: "dp-badge", style: { background: "#1D4ED822", color: "#60A5FA" }, children: phaseLabel(busy.progress.phase) }),
        /* @__PURE__ */ jsxs2("span", { className: "dp-hint", children: [
          Math.round(busy.elapsedMs / 1e3),
          "s \xB7 runId ",
          busy.runId
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "dp-hint", children: phaseDetail(busy.progress) })
    ] }),
    lastReport && !busy && /* @__PURE__ */ jsx2("div", { className: "dp-card", children: /* @__PURE__ */ jsxs2("div", { className: "dp-row", children: [
      /* @__PURE__ */ jsxs2("span", { className: "dp-hint", children: [
        "\u6700\u8FD1\u62A5\u544A\uFF1A",
        lastReport.error ? /* @__PURE__ */ jsx2("span", { className: "dp-err", children: "\u5931\u8D25" }) : `${lastReport.findingCount} \u6761\u53D1\u73B0\uFF08${lastReport.repos.length} \u4ED3 / ${lastReport.packageCount} \u5305\uFF09`
      ] }),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("button", { className: "small", onClick: onOpenReport, children: "\u67E5\u770B\u62A5\u544A \u2192" })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "dp-label", children: "\u5DE5\u4F5C\u65B9\u5F0F" }),
      /* @__PURE__ */ jsxs2("div", { className: "dp-hint", children: [
        "\u672C\u63D2\u4EF6\u628A lockfile \u91CC\u7684\u4F9D\u8D56\u7248\u672C\u4E0E ",
        /* @__PURE__ */ jsx2("b", { children: "OSV.dev" }),
        "\uFF08Google \u8FD0\u8425\u7684\u5F00\u6E90\u6F0F\u6D1E\u5E93\uFF0C\u805A\u5408 GitHub Advisory / RustSec / PyPI \u7B49\uFF09\u6BD4\u5BF9\u3002 \u7F51\u7EDC\u53EA\u51FA\u7AD9\u5230 api.osv.dev\uFF1B\u6587\u4EF6\u53EA\u8BFB\uFF1B\u62A5\u544A\u843D\u672C\u673A\uFF08cap.kv\uFF09\uFF0C\u53EF\u88AB AI \u7ECF MCP \u4E03\u5DE5\u5177\u8BFB\u53D6\u89E3\u8BFB\u3002\u62A5\u544A\u2260\u5B89\u5168\u4FDD\u8BC1\uFF1A\u53EA\u8986\u76D6\u5DF2\u77E5\u6F0F\u6D1E\u4E0E\u5DF2\u9489\u7248\u672C\u3002"
      ] })
    ] })
  ] });
}
function phaseLabel(phase) {
  switch (phase) {
    case "discover":
      return "\u2460 \u53D1\u73B0 lockfile";
    case "parse":
      return "\u2461 \u89E3\u6790\u4F9D\u8D56\u6E05\u5355";
    case "query":
      return "\u2462 \u6BD4\u5BF9 OSV \u6F0F\u6D1E\u5E93";
    case "details":
      return "\u2463 \u8865\u5168\u6F0F\u6D1E\u8BE6\u60C5";
    case "done":
      return "\u5B8C\u6210";
    case "error":
      return "\u5931\u8D25";
    default:
      return phase;
  }
}
function phaseDetail(p) {
  switch (p.phase) {
    case "discover":
      return `\u5DF2\u53D1\u73B0 ${p.filesFound} \u4E2A lockfile\u2026`;
    case "parse":
      return `\u5DF2\u89E3\u6790 ${p.filesFound} \u4E2A\u6587\u4EF6\u4E2D\u7684 ${p.packages} \u4E2A\u5305\u2026`;
    case "query":
      return `OSV \u6279\u91CF\u67E5\u8BE2 ${p.queriedBatches}/${p.totalBatches || "?"} \u6279\uFF08${p.packages} \u5305\uFF09\u2026`;
    case "details":
      return `\u8865\u5168\u6F0F\u6D1E\u8BE6\u60C5 ${p.detailsFetched}/${p.totalDetails || "?"} \u2026`;
    default:
      return "";
  }
}
function ReportTab({ report, loading, onIgnore }) {
  const [sevFilter, setSevFilter] = useState2("all");
  const [repoFilter, setRepoFilter] = useState2("all");
  if (loading) return /* @__PURE__ */ jsx2("div", { className: "dp-hint dp-scroll", style: { flex: 1, padding: 14 }, children: "\u62A5\u544A\u52A0\u8F7D\u4E2D\u2026" });
  if (!report) return /* @__PURE__ */ jsx2("div", { className: "dp-hint dp-scroll", style: { flex: 1, padding: 14 }, children: "\u6682\u65E0\u62A5\u544A\u2014\u2014\u5148\u5728\u300C\u626B\u63CF\u300DTab \u8DD1\u4E00\u6B21\u4F53\u68C0\u3002" });
  if (report.error) {
    return /* @__PURE__ */ jsxs2("div", { className: "dp-scroll", style: { flex: 1, padding: 12 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "dp-card dp-err", children: [
        "\u626B\u63CF\u5931\u8D25\uFF1A",
        report.error
      ] }),
      (report.warnings || []).length > 0 && /* @__PURE__ */ jsx2(WarningsCard, { warnings: report.warnings })
    ] });
  }
  const repos = report.repos || [];
  const findings = (report.findings || []).filter((f) => {
    if (sevFilter !== "all" && f.severity !== sevFilter) return false;
    if (repoFilter !== "all" && f.repoDir !== repoFilter) return false;
    return true;
  });
  const topFix = (report.fixPlan || []).filter((p) => p.to).slice(0, 8);
  const chips = [
    { label: "\u4ED3\u5E93", value: String(repos.length) },
    { label: "\u5305", value: String(report.packageCount) },
    { label: "\u53D1\u73B0", value: String(report.findingCount), tone: report.findingCount > 0 ? "err" : "ok" },
    ...SEVS.map((s) => ({
      label: SEV_LABEL[s],
      value: String(report.counts[s] || 0),
      tone: s === "critical" && report.counts[s] ? "err" : s === "high" && report.counts[s] ? "warn" : "muted"
    })),
    ...report.ignoredCount ? [{ label: "\u5DF2\u5FFD\u7565", value: String(report.ignoredCount), tone: "muted" }] : [],
    { label: "\u5B8C\u6210", value: timeStr(report.finishedAt), tone: "muted" }
  ];
  return /* @__PURE__ */ jsxs2("div", { className: "dp-scroll", style: { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsx2(StatChips, { items: chips }),
    report.truncated && /* @__PURE__ */ jsx2("div", { className: "dp-warn dp-hint", children: "\u53D1\u73B0\u8D85\u8FC7 800 \u6761\u4E0A\u9650\uFF0C\u5C55\u793A\u5DF2\u622A\u65AD\u2014\u2014\u5EFA\u8BAE\u7F29\u5C0F\u8303\u56F4\u6216\u5148\u5904\u7406\u9AD8\u5371\u3002" }),
    topFix.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "dp-label", style: { marginBottom: 6 }, children: "\u6700\u5C0F\u4FEE\u590D\u65B9\u6848\uFF08\u5347\u5230\u8BE5\u7248\u672C\u5373\u53EF\u6D88\u9664\u5BF9\u5E94\u5168\u90E8\u5DF2\u77E5\u6F0F\u6D1E\uFF09" }),
      topFix.map((p) => /* @__PURE__ */ jsxs2("div", { className: "dp-row", style: { padding: "3px 0", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2(SevBadge, { sev: p.severity }),
        /* @__PURE__ */ jsx2("span", { className: "mono", style: { fontSize: 11.5 }, children: p.pkg }),
        /* @__PURE__ */ jsxs2("span", { className: "dp-muted mono", style: { fontSize: 11 }, children: [
          p.from,
          " \u2192 ",
          /* @__PURE__ */ jsx2("span", { className: "dp-ok", children: p.to })
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: "dp-hint", children: [
          "\u6D88\u9664 ",
          p.vulnIds.length,
          " \u4E2A\u6F0F\u6D1E"
        ] })
      ] }, `${p.ecosystem}:${p.pkg}`))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "dp-row", style: { flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs2("select", { value: sevFilter, onChange: (e) => setSevFilter(e.target.value), style: { width: 96 }, children: [
        /* @__PURE__ */ jsx2("option", { value: "all", children: "\u5168\u90E8\u7B49\u7EA7" }),
        SEVS.map((s) => /* @__PURE__ */ jsxs2("option", { value: s, children: [
          SEV_LABEL[s],
          "\uFF08",
          report.counts[s] || 0,
          "\uFF09"
        ] }, s))
      ] }),
      /* @__PURE__ */ jsxs2("select", { value: repoFilter, onChange: (e) => setRepoFilter(e.target.value), style: { maxWidth: 320 }, children: [
        /* @__PURE__ */ jsx2("option", { value: "all", children: "\u5168\u90E8\u4ED3\u5E93" }),
        repos.map((r) => /* @__PURE__ */ jsx2("option", { value: r.dir, children: r.dir }, r.dir))
      ] }),
      /* @__PURE__ */ jsxs2("span", { className: "dp-hint", children: [
        findings.length,
        " \u6761\u5339\u914D"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "dp-card", style: { padding: 0, overflow: "hidden" }, children: /* @__PURE__ */ jsx2(FindingList, { findings, emptyHint: "\uFF08\u5F53\u524D\u8FC7\u6EE4\u6761\u4EF6\u4E0B\u65E0\u53D1\u73B0\uFF09", onIgnore }) }),
    repos.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "dp-label", style: { marginBottom: 6 }, children: "\u8303\u56F4\u660E\u7EC6" }),
      repos.map((r) => /* @__PURE__ */ jsxs2("div", { className: "dp-hint", style: { padding: "2px 0" }, children: [
        /* @__PURE__ */ jsx2("span", { className: "mono", children: r.dir }),
        " \u2014 ",
        r.packageCount,
        " \u5305\uFF08",
        r.files.map((f) => `${f.ecosystem}\xD7${f.count}`).join("\u3001"),
        "\uFF09"
      ] }, r.dir))
    ] }),
    (report.warnings || []).length > 0 && /* @__PURE__ */ jsx2(WarningsCard, { warnings: report.warnings })
  ] });
}
function WarningsCard({ warnings }) {
  return /* @__PURE__ */ jsxs2("div", { className: "dp-card", style: { marginTop: 8 }, children: [
    /* @__PURE__ */ jsx2("div", { className: "dp-label dp-warn", style: { marginBottom: 4 }, children: "\u8B66\u544A\uFF08\u62A5\u544A\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF09" }),
    warnings.slice(0, 30).map((w, i) => /* @__PURE__ */ jsxs2("div", { className: "dp-hint dp-warn", style: { wordBreak: "break-all" }, children: [
      "\xB7 ",
      w
    ] }, i))
  ] });
}
function HistoryTab({ runs, onOpen }) {
  if (!runs.length) return /* @__PURE__ */ jsx2("div", { className: "dp-hint dp-scroll", style: { flex: 1, padding: 14 }, children: "\u6682\u65E0\u626B\u63CF\u5386\u53F2\u3002" });
  return /* @__PURE__ */ jsx2("div", { className: "dp-scroll", style: { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8 }, children: runs.map((r) => /* @__PURE__ */ jsxs2("div", { className: "dp-card dp-row", style: { cursor: "pointer" }, onClick: () => onOpen(r.runId), children: [
    /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minWidth: 0 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "dp-row", children: [
        /* @__PURE__ */ jsx2("span", { children: dateTimeStr(r.startedAt) }),
        /* @__PURE__ */ jsxs2("span", { className: "dp-muted", style: { fontSize: 11 }, children: [
          r.runId,
          r.truncated ? " [\u622A\u65AD]" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dp-hint", children: [
        r.repos,
        " \u4ED3 / ",
        r.packageCount,
        " \u5305 / \u53D1\u73B0 ",
        r.findingCount
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "dp-row", style: { gap: 4 }, children: SEVS.map((s) => r.counts[s] ? /* @__PURE__ */ jsxs2("span", { className: "dp-badge", style: { background: `${sevColor(s)}22`, color: sevColor(s) }, children: [
      SEV_LABEL[s],
      " ",
      r.counts[s]
    ] }, s) : null) })
  ] }, r.runId)) });
}
function SettingsTab({ settings, metaInfo, degraded, selftest, onSelftest, onRestart, onRemoveIgnore }) {
  const ignores = settings?.ignores || [];
  const recent = settings?.recentPaths || [];
  return /* @__PURE__ */ jsxs2("div", { className: "dp-scroll", style: { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "dp-row", children: [
        /* @__PURE__ */ jsx2("span", { className: "dp-label", style: { margin: 0 }, children: "\u670D\u52A1\u72B6\u6001" }),
        /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx2("button", { className: "small", onClick: onRestart, children: "\u91CD\u542F\u670D\u52A1" }),
        /* @__PURE__ */ jsx2("button", { className: "small", onClick: onSelftest, children: "\u79BB\u7EBF\u81EA\u68C0" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dp-hint", style: { marginTop: 4 }, children: [
        "v",
        metaInfo?.version || "?",
        " \xB7 \u8FD0\u884C ",
        metaInfo ? Math.round(metaInfo.uptime / 1e3) : "?",
        "s \xB7 kv ",
        metaInfo?.kvEndpoint || "\uFF08\u672A\u8FDE\u63A5\uFF09",
        " \xB7 OSV ",
        metaInfo?.osvBase || "?",
        degraded && /* @__PURE__ */ jsx2("span", { className: "dp-warn", children: " \xB7 \u964D\u7EA7\u6A21\u5F0F\uFF08kv \u4E0D\u53EF\u8FBE\uFF0C\u62A5\u544A\u4EC5\u672C\u6B21\u4F1A\u8BDD\u53EF\u89C1\uFF09" })
      ] }),
      selftest && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("div", { className: selftest.ok ? "dp-ok" : "dp-err", children: selftest.ok ? "\u2705 \u81EA\u68C0\u901A\u8FC7" : "\u274C \u81EA\u68C0\u5931\u8D25" }),
        /* @__PURE__ */ jsx2("pre", { className: "dp-hint", style: { whiteSpace: "pre-wrap" }, children: selftest.checks.join("\n") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "dp-label", children: [
        "\u5FFD\u7565\u89C4\u5219\uFF08",
        ignores.length,
        "\uFF09\u2014\u2014\u62A5\u544A\u751F\u6210\u65F6\u751F\u6548\uFF1B\u5FC5\u987B\u951A\u5B9A\u5305\u540D\u6216\u6F0F\u6D1E ID"
      ] }),
      ignores.length === 0 && /* @__PURE__ */ jsx2("div", { className: "dp-hint", children: "\u6682\u65E0\u3002\u53EF\u5728\u62A5\u544A\u91CC\u5BF9\u67D0\u6761\u53D1\u73B0\u70B9\u300C\u5FFD\u7565\u6B64\u5305\u6B64\u6F0F\u6D1E\u300D\u3002" }),
      ignores.map((ig, i) => /* @__PURE__ */ jsxs2("div", { className: "dp-row", style: { padding: "3px 0" }, children: [
        /* @__PURE__ */ jsx2("span", { className: "mono", style: { fontSize: 11.5 }, children: ig.pkg || "\uFF08\u5168\u90E8\u5305\uFF09" }),
        /* @__PURE__ */ jsx2("span", { className: "dp-id mono", style: { color: "#93C5FD", fontSize: 11 }, children: ig.vulnId || "\uFF08\u5168\u90E8\u6F0F\u6D1E\uFF09" }),
        /* @__PURE__ */ jsx2("span", { className: "dp-hint dp-grow", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ig.reason }),
        /* @__PURE__ */ jsx2("button", { className: "small", onClick: () => onRemoveIgnore(ig), children: "\u5220\u9664" })
      ] }, `${ig.pkg}:${ig.vulnId}:${ig.at}:${i}`))
    ] }),
    recent.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "dp-label", children: "\u6700\u8FD1\u4F53\u68C0\u8DEF\u5F84\uFF08\u5DF2\u9884\u586B\u5230\u626B\u63CF\u9875\uFF09" }),
      recent.map((p) => /* @__PURE__ */ jsxs2("div", { className: "dp-hint mono", style: { wordBreak: "break-all" }, children: [
        "\xB7 ",
        p
      ] }, p))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "dp-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "dp-label", children: "\u5B89\u5168\u8FB9\u754C" }),
      /* @__PURE__ */ jsx2("div", { className: "dp-hint", children: "\u7F51\u7EDC\u53EA\u51FA\u7AD9\u5230 api.osv.dev\uFF08\u4E0D\u63A5\u53D7\u4EFB\u4F55\u4F20\u5165 URL\uFF09\uFF1B\u6587\u4EF6\u53EA\u8BFB\uFF1B\u4E0D\u6267\u884C\u7CFB\u7EDF\u547D\u4EE4\uFF1B \u670D\u52A1\u4EC5\u76D1\u542C 127.0.0.1 \u4E14\u5168\u90E8 API \u9700\u8981 Bearer token\uFF1B\u6F0F\u6D1E\u8BE6\u60C5\u7F13\u5B58\u843D appConfigDir/dep-probe/cache\uFF08TTL 7 \u5929\uFF0C\u4EC5\u516C\u544A\u5143\u6570\u636E\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
