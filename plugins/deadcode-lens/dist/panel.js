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
var host_exports = {};
__export(host_exports, {
  capDispatch: () => capDispatch,
  getHostInvoke: () => getHostInvoke,
  kvGet: () => kvGet,
  kvSet: () => kvSet,
  restartService: () => restartService
});
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
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function restartService(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState } from "react";

// src/model.ts
var SvcError = class extends Error {
  constructor(message, offline = false) {
    super(message);
    this.offline = offline;
    this.name = "SvcError";
  }
};
var metaCache = null;
function invalidateMeta() {
  metaCache = null;
}
async function readMeta() {
  if (metaCache) return metaCache;
  const { kvGet: kvGet2 } = await Promise.resolve().then(() => (init_host(), host_exports));
  const m = await kvGet2("deadlens.meta");
  if (!m || typeof m.port !== "number" || !m.token) {
    throw new SvcError("\u670D\u52A1\u672A\u5C31\u7EEA\uFF1Ameta \u4E0D\u5728 kv\uFF08\u670D\u52A1\u53EF\u80FD\u8FD8\u6CA1\u542F\u52A8\u8FC7\uFF09", true);
  }
  metaCache = m;
  return m;
}
async function req(method, path, body, timeoutMs = 3e4) {
  const meta = await readMeta();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${meta.token}`,
        ...body !== void 0 ? { "Content-Type": "application/json" } : {}
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => null);
    if (!json) throw new SvcError(`\u670D\u52A1\u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.status}\uFF09`);
    if (json.ok === false) throw new SvcError(json.error || `HTTP ${res.status}`);
    return json;
  } catch (e) {
    if (e instanceof SvcError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new SvcError(msg.includes("abort") ? "\u8BF7\u6C42\u8D85\u65F6" : `\u8FDE\u4E0D\u4E0A 127.0.0.1:${meta.port}\uFF08${msg}\uFF09`, true);
  } finally {
    clearTimeout(timer);
  }
}
var api = {
  async scan(root, entries, ignorePrefixes) {
    const r = await req("POST", "/api/scan", { root, entries, ignorePrefixes }, 15e3);
    return r;
  },
  async run(runId) {
    return req("GET", `/api/run/${runId}`);
  },
  async report(runId) {
    return req("GET", `/api/report/${runId}`, void 0, 2e4);
  },
  async latest() {
    return req("GET", "/api/latest");
  },
  async history() {
    return req("GET", "/api/history");
  },
  async why(path) {
    return req("POST", "/api/why", { path });
  },
  async selftest() {
    return req("POST", "/api/selftest", {});
  },
  async settings() {
    return req("GET", "/api/settings");
  },
  async saveSettings(patch) {
    return req("POST", "/api/settings", patch);
  }
};
function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}
function fmtTime(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// src/Panel.tsx
init_host();
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PLUGIN_ID = "deadcode-lens";
var SERVICE_ID = "deadcode-lens-server";
var KIND_LABEL = {
  all: "\u5168\u90E8",
  files: "\u6B7B\u6587\u4EF6",
  exports: "\u672A\u4F7F\u7528\u5BFC\u51FA",
  deps: "\u4F9D\u8D56",
  unresolved: "\u60AC\u7A7A\u5BFC\u5165",
  cycles: "\u5FAA\u73AF\u4F9D\u8D56"
};
var STYLE = `
.dcl-panel { display:flex; flex-direction:column; height:100%; min-height:0; font-size:13px; color:var(--polaris-text, #d1d5db); background:var(--polaris-bg, transparent); }
.dcl-panel button { cursor:pointer; }
.dcl-tabs { display:flex; gap:2px; padding:8px 10px 0; border-bottom:1px solid var(--polaris-border,#374151); }
.dcl-tab { background:none; border:none; color:var(--polaris-text-2,#9ca3af); padding:6px 12px; font-size:13px; border-bottom:2px solid transparent; }
.dcl-tab.active { color:var(--polaris-text,#e5e7eb); border-bottom-color:#3b82f6; }
.dcl-statusbar { display:flex; align-items:center; gap:8px; padding:6px 12px; font-size:12px; color:var(--polaris-text-2,#9ca3af); border-bottom:1px solid var(--polaris-border,#374151); }
.dcl-dot { width:8px; height:8px; border-radius:50%; flex:none; }
.dcl-badge { font-size:11px; padding:1px 8px; border-radius:8px; }
.dcl-scroll { flex:1; overflow:auto; min-height:0; padding:12px; display:flex; flex-direction:column; gap:10px; }
.dcl-card { background:var(--polis-card,rgba(255,255,255,.04)); border:1px solid var(--polaris-border,#374151); border-radius:8px; padding:10px 12px; }
.dcl-label { display:block; font-size:12px; color:var(--polaris-text-2,#9ca3af); margin-bottom:4px; }
.dcl-input, .dcl-textarea { width:100%; box-sizing:border-box; background:var(--polaris-input,#1f2937); color:var(--polaris-text,#e5e7eb); border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:6px 9px; font-size:13px; }
.dcl-textarea { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; resize:vertical; }
.dcl-btn { background:#2563eb; color:#fff; border:none; border-radius:6px; padding:7px 16px; font-size:13px; }
.dcl-btn:disabled { opacity:.5; cursor:default; }
.dcl-btn2 { background:rgba(255,255,255,.08); color:var(--polaris-text,#e5e7eb); border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:5px 12px; font-size:12px; }
.dcl-chips { display:flex; flex-wrap:wrap; gap:6px; }
.dcl-chip { background:rgba(255,255,255,.06); border:1px solid var(--polaris-border,#374151); color:var(--polaris-text-2,#9ca3af); border-radius:12px; padding:2px 10px; font-size:12px; }
.dcl-chip:hover { color:var(--polaris-text,#e5e7eb); }
.dcl-stats { display:flex; flex-wrap:wrap; gap:8px; }
.dcl-stat { flex:1 1 100px; background:rgba(255,255,255,.04); border:1px solid var(--polaris-border,#374151); border-radius:8px; padding:8px 10px; }
.dcl-stat .n { font-size:20px; font-weight:600; }
.dcl-stat .t { font-size:11px; color:var(--polaris-text-2,#9ca3af); }
.dcl-progress { height:6px; border-radius:3px; background:rgba(255,255,255,.08); overflow:hidden; }
.dcl-progress > div { height:100%; background:#3b82f6; transition:width .3s; }
.dcl-filters { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.dcl-fbtn { background:rgba(255,255,255,.06); border:1px solid var(--polaris-border,#374151); color:var(--polaris-text-2,#9ca3af); border-radius:6px; padding:4px 10px; font-size:12px; }
.dcl-fbtn.active { background:#1d4ed833; border-color:#3b82f6; color:#93c5fd; }
.dcl-item { border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:7px 10px; display:flex; flex-direction:column; gap:4px; }
.dcl-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dcl-mono { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; word-break:break-all; }
.dcl-reason { font-size:11px; padding:1px 7px; border-radius:8px; flex:none; }
.dcl-evi { font-size:11px; color:var(--polaris-text-2,#9ca3af); padding-left:8px; border-left:2px solid var(--polaris-border,#374151); word-break:break-all; }
.dcl-muted { color:var(--polaris-text-2,#9ca3af); font-size:12px; }
.dcl-warn { background:#78350f33; border:1px solid #b4530966; color:#fcd34d; border-radius:6px; padding:6px 10px; font-size:12px; }
.dcl-ok { background:#064e3b33; border:1px solid #05966966; color:#6ee7b7; border-radius:6px; padding:6px 10px; font-size:12px; }
.dcl-err { background:#7f1d1d33; border:1px solid #dc262666; color:#fca5a5; border-radius:6px; padding:6px 10px; font-size:12px; }
.dcl-why { background:rgba(0,0,0,.25); border:1px solid var(--polaris-border,#374151); border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:4px; }
`;
function PanelStyle() {
  return /* @__PURE__ */ jsx("style", { children: STYLE });
}
function Stat({ n, t, color }) {
  return /* @__PURE__ */ jsxs("div", { className: "dcl-stat", children: [
    /* @__PURE__ */ jsx("div", { className: "n", style: color ? { color } : void 0, children: n }),
    /* @__PURE__ */ jsx("div", { className: "t", children: t })
  ] });
}
function ReasonBadge({ reason }) {
  const map = {
    "no-importer": ["\u96F6\u5F15\u7528", "#7f1d1d55", "#fca5a5"],
    "only-dead-importers": ["\u4EC5\u88AB\u6B7B\u6587\u4EF6\u5F15\u7528", "#78350f55", "#fcd34d"],
    ok: ["\u6210\u529F", "#064e3b55", "#6ee7b7"],
    err: ["\u5931\u8D25", "#7f1d1d55", "#fca5a5"]
  };
  const [label, bg, fg] = map[reason] || [reason, "#37415155", "#9ca3af"];
  return /* @__PURE__ */ jsx("span", { className: "dcl-reason", style: { background: bg, color: fg }, children: label });
}
function SuggestBadge({ s }) {
  const map = {
    delete: ["\u53EF\u5220", "#7f1d1d55", "#fca5a5"],
    unexport: ["\u53BB export", "#78350f55", "#fcd34d"],
    review: ["\u9700\u4EBA\u5DE5\u786E\u8BA4", "#1e3a5f55", "#93c5fd"],
    tooling: ["\u5DE5\u5177\u94FE", "#1e3a5f55", "#93c5fd"]
  };
  const [label, bg, fg] = map[s] || [s, "#37415155", "#9ca3af"];
  return /* @__PURE__ */ jsx("span", { className: "dcl-reason", style: { background: bg, color: fg }, children: label });
}
function Panel() {
  const [tab, setTab] = useState("scan");
  const [svcErr, setSvcErr] = useState(null);
  const [degraded, setDegraded] = useState(false);
  const [root, setRoot] = useState("");
  const [entriesText, setEntriesText] = useState("");
  const [ignoreText, setIgnoreText] = useState("");
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(null);
  const [scanErr, setScanErr] = useState(null);
  const [report, setReport] = useState(null);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [whyPath, setWhyPath] = useState(null);
  const [whyData, setWhyData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [runs, setRuns] = useState([]);
  const [selftest, setSelftest] = useState(null);
  const [selftestBusy, setSelftestBusy] = useState(false);
  const pollRef = useRef(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  const guard = useCallback(async (fn) => {
    try {
      await fn();
      setSvcErr(null);
      setDegraded(false);
    } catch (e) {
      if (e instanceof SvcError) {
        setSvcErr(e.message);
        setDegraded(e.offline);
      } else {
        setSvcErr(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);
  const loadSettings = useCallback(() => {
    void guard(async () => {
      const r = await api.settings();
      setSettings(r.settings);
      if (!rootRef.current && r.settings.recentRoots?.length) setRoot(r.settings.recentRoots[0]);
      if (r.settings.ignorePrefixes?.length && !ignoreText) setIgnoreText(r.settings.ignorePrefixes.join("\n"));
    });
  }, [guard, ignoreText]);
  const loadHistory = useCallback(() => {
    void guard(async () => {
      const r = await api.history();
      setRuns(r.runs || []);
    });
  }, [guard]);
  const loadReport = useCallback((runId) => {
    void guard(async () => {
      const r = await api.report(runId);
      setReport(r.report);
      setTab("report");
    });
  }, [guard]);
  const loadLatest = useCallback(() => {
    void guard(async () => {
      const r = await api.latest();
      if (r.runId) {
        const rep = await api.report(r.runId);
        setReport(rep.report);
      }
    });
  }, [guard]);
  useEffect(() => {
    loadSettings();
    loadLatest();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);
  const startScan = useCallback(() => {
    void guard(async () => {
      const r = rootRef.current.trim();
      if (!r) {
        setScanErr("\u8BF7\u586B\u626B\u63CF\u6839\u76EE\u5F55");
        return;
      }
      setScanErr(null);
      const entries = entriesText.split("\n").map((x) => x.trim()).filter(Boolean);
      const ignorePrefixes = ignoreText.split("\n").map((x) => x.trim()).filter(Boolean);
      const { runId } = await api.scan(r, entries, ignorePrefixes);
      setBusy({ runId, phase: "\u51C6\u5907", done: 0, total: 0 });
      void api.saveSettings({ root: r, ignorePrefixes }).catch(() => void 0);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void guard(async () => {
          const st = await api.run(runId);
          setBusy({ runId, phase: st.run.progress.phase, done: st.run.progress.done, total: st.run.progress.total });
          if (st.run.status === "done" || st.run.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(null);
            if (st.run.status === "error") setScanErr(st.run.error || "\u626B\u63CF\u5931\u8D25");
            else await loadReport(runId);
          }
        }).catch(() => void 0);
      }, 900);
    });
  }, [guard, entriesText, ignoreText, loadReport]);
  const askWhy = useCallback((p) => {
    void guard(async () => {
      setWhyPath(p);
      setWhyData(null);
      const r = await api.why(p);
      setWhyData(r.why || { error: "\u65E0\u6570\u636E" });
    });
  }, [guard]);
  const exportMd = useCallback(() => {
    void guard(async () => {
      if (!report) return;
      const md = reportToMd(report);
      try {
        await navigator.clipboard.writeText(md);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (_) {
        setCopied(false);
      }
    });
  }, [guard, report]);
  const runSelftest = useCallback(() => {
    void guard(async () => {
      setSelftestBusy(true);
      try {
        const r = await api.selftest();
        setSelftest(r.selftest);
        if (!r.selftest.ok) setSvcErr(`\u81EA\u68C0\u5931\u8D25 ${r.selftest.failed}/${r.selftest.total}`);
      } finally {
        setSelftestBusy(false);
      }
    });
  }, [guard]);
  const doRestart = useCallback(() => {
    void guard(async () => {
      await restartService(PLUGIN_ID, SERVICE_ID);
      invalidateMeta();
      await new Promise((r) => setTimeout(r, 1200));
      loadLatest();
    });
  }, [guard, loadLatest]);
  const counts = report?.counts;
  return /* @__PURE__ */ jsxs("div", { className: "dcl-panel", children: [
    /* @__PURE__ */ jsx(PanelStyle, {}),
    /* @__PURE__ */ jsx("div", { className: "dcl-tabs", children: ["scan", "report", "history", "settings"].map((k) => /* @__PURE__ */ jsx(
      "button",
      {
        className: `dcl-tab ${tab === k ? "active" : ""}`,
        onClick: () => {
          setTab(k);
          if (k === "history") loadHistory();
          if (k === "settings") loadSettings();
          if (k === "report" && !report) loadLatest();
        },
        children: k === "scan" ? "\u626B\u63CF" : k === "report" ? "\u62A5\u544A" : k === "history" ? "\u5386\u53F2" : "\u8BBE\u7F6E"
      },
      k
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "dcl-statusbar", children: [
      /* @__PURE__ */ jsx("span", { className: "dcl-dot", style: { background: svcErr ? "#F87171" : degraded ? "#FBBF24" : "#34D399" } }),
      /* @__PURE__ */ jsx("span", { children: svcErr ? "\u670D\u52A1\u5F02\u5E38" : "\u5F15\u64CE\u79BB\u7EBF \xB7 \u6587\u4EF6\u53EA\u8BFB \xB7 \u96F6\u7F51\u7EDC" }),
      busy && /* @__PURE__ */ jsx("span", { className: "dcl-badge", style: { background: "#1D4ED822", color: "#60A5FA" }, children: "\u626B\u63CF\u4E2D" }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      svcErr && /* @__PURE__ */ jsx("button", { className: "dcl-btn2", onClick: doRestart, children: "\u91CD\u542F\u670D\u52A1" })
    ] }),
    svcErr && /* @__PURE__ */ jsx("div", { className: "dcl-err", style: { margin: "10px 12px 0" }, children: svcErr }),
    tab === "scan" && /* @__PURE__ */ jsxs("div", { className: "dcl-scroll", children: [
      /* @__PURE__ */ jsxs("div", { className: "dcl-card", children: [
        /* @__PURE__ */ jsx("label", { className: "dcl-label", children: "\u626B\u63CF\u6839\u76EE\u5F55\uFF08\u9879\u76EE/\u4ED3\u5E93\u6839\uFF1B\u626B\u63CF src \u5B50\u76EE\u5F55\u4E5F\u53EF\u4EE5\u2014\u2014\u4F1A\u81EA\u52A8\u5411\u4E0A\u627E tsconfig/package.json\uFF09" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "dcl-input",
            value: root,
            placeholder: "\u5982 D:\\space\\base\\Polaris \u6216 D:\\space\\base\\Polaris\\src",
            onChange: (e) => setRoot(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !busy) startScan();
            }
          }
        ),
        settings?.recentRoots?.length ? /* @__PURE__ */ jsx("div", { className: "dcl-chips", style: { marginTop: 8 }, children: settings.recentRoots.map((r) => /* @__PURE__ */ jsx("button", { className: "dcl-chip", onClick: () => setRoot(r), children: r }, r)) }) : null,
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("button", { className: "dcl-btn", onClick: startScan, disabled: !!busy, children: busy ? "\u626B\u63CF\u4E2D\u2026" : "\u5F00\u59CB\u4F53\u68C0" }),
          /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx("span", { className: "dcl-muted", style: { alignSelf: "center" }, children: counts ? `\u4E0A\u6B21\uFF1A${counts.files} \u6587\u4EF6 / ${report?.meta.durationMs}ms` : "" })
        ] }),
        busy && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("div", { className: "dcl-progress", children: /* @__PURE__ */ jsx("div", { style: { width: busy.total ? `${Math.round(busy.done / busy.total * 100)}%` : "30%" } }) }),
          /* @__PURE__ */ jsxs("div", { className: "dcl-muted", style: { marginTop: 4 }, children: [
            busy.phase,
            busy.total ? ` ${busy.done}/${busy.total}` : ""
          ] })
        ] }),
        scanErr && /* @__PURE__ */ jsx("div", { className: "dcl-warn", style: { marginTop: 10 }, children: scanErr })
      ] }),
      /* @__PURE__ */ jsxs("details", { className: "dcl-card", children: [
        /* @__PURE__ */ jsx("summary", { className: "dcl-label", style: { cursor: "pointer" }, children: "\u9AD8\u7EA7\u9009\u9879\uFF08\u8865\u5145\u5165\u53E3 / \u5FFD\u7565\u524D\u7F00\uFF09" }),
        /* @__PURE__ */ jsxs("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "dcl-label", children: "\u8865\u5145\u5165\u53E3\uFF08\u6BCF\u884C\u4E00\u4E2A\u76F8\u5BF9\u8DEF\u5F84\uFF1Bimport \u56FE\u770B\u4E0D\u89C1\u7684\u8FD0\u884C\u65F6\u5165\u53E3\uFF0C\u5982 mcp/server.js\u3001service/main.js\uFF09" }),
            /* @__PURE__ */ jsx("textarea", { className: "dcl-textarea", rows: 3, value: entriesText, onChange: (e) => setEntriesText(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "dcl-label", children: "\u5FFD\u7565\u8DEF\u5F84\u524D\u7F00\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF1B\u547D\u4E2D\u7684\u6587\u4EF6\u4E0D\u8FDB\u53D1\u73B0\u5217\u8868\uFF09" }),
            /* @__PURE__ */ jsx("textarea", { className: "dcl-textarea", rows: 3, value: ignoreText, onChange: (e) => setIgnoreText(e.target.value) })
          ] })
        ] })
      ] }),
      report && /* @__PURE__ */ jsxs("div", { className: "dcl-stats", children: [
        /* @__PURE__ */ jsx(Stat, { n: counts.files, t: "\u626B\u63CF\u6587\u4EF6" }),
        /* @__PURE__ */ jsx(Stat, { n: counts.orphanFiles, t: "\u6B7B\u6587\u4EF6", color: counts.orphanFiles ? "#fca5a5" : void 0 }),
        /* @__PURE__ */ jsx(Stat, { n: counts.unusedExports, t: "\u672A\u4F7F\u7528\u5BFC\u51FA", color: counts.unusedExports ? "#fcd34d" : void 0 }),
        /* @__PURE__ */ jsx(Stat, { n: counts.unusedDeps, t: "\u672A\u4F7F\u7528\u4F9D\u8D56", color: counts.unusedDeps ? "#fcd34d" : void 0 }),
        /* @__PURE__ */ jsx(Stat, { n: counts.unresolvedImports, t: "\u60AC\u7A7A\u5BFC\u5165", color: counts.unresolvedImports ? "#fca5a5" : void 0 }),
        /* @__PURE__ */ jsx(Stat, { n: counts.cycles, t: "\u5FAA\u73AF\u4F9D\u8D56", color: counts.cycles ? "#fbbf24" : void 0 })
      ] }),
      report?.warnings?.length ? /* @__PURE__ */ jsx("div", { className: "dcl-warn", children: report.warnings.slice(0, 6).map((w, i) => /* @__PURE__ */ jsxs("div", { children: [
        "\xB7 ",
        w
      ] }, i)) }) : null
    ] }),
    tab === "report" && /* @__PURE__ */ jsx("div", { className: "dcl-scroll", children: !report ? /* @__PURE__ */ jsx("div", { className: "dcl-muted", children: "\u8FD8\u6CA1\u6709\u62A5\u544A\u2014\u2014\u5148\u53BB\u300C\u626B\u63CF\u300DTab \u8DD1\u4E00\u6B21\u4F53\u68C0\u3002" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "dcl-filters", children: [
        Object.keys(KIND_LABEL).map((k) => {
          const n = k === "all" ? report.orphanFiles.length + report.unusedExports.length + report.deps.unused.length + report.unresolvedImports.length + report.cycles.length : k === "files" ? report.orphanFiles.length : k === "exports" ? report.unusedExports.length : k === "deps" ? report.deps.unused.length : k === "unresolved" ? report.unresolvedImports.length : report.cycles.length;
          return /* @__PURE__ */ jsxs("button", { className: `dcl-fbtn ${kind === k ? "active" : ""}`, onClick: () => setKind(k), children: [
            KIND_LABEL[k],
            " ",
            n > 0 && /* @__PURE__ */ jsx("b", { children: n })
          ] }, k);
        }),
        /* @__PURE__ */ jsx("input", { className: "dcl-input", style: { width: 160, marginLeft: "auto" }, placeholder: "\u8FC7\u6EE4\u2026", value: q, onChange: (e) => setQ(e.target.value) }),
        /* @__PURE__ */ jsx("button", { className: "dcl-btn2", onClick: exportMd, children: copied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236 MD \u62A5\u544A" })
      ] }),
      report.meta.noEntryMode && /* @__PURE__ */ jsx("div", { className: "dcl-warn", children: "\u672A\u53D1\u73B0\u4EFB\u4F55\u5165\u53E3\uFF1A\u6B7B\u6587\u4EF6/\u5BFC\u51FA\u7EF4\u5EA6\u5DF2\u8DF3\u8FC7\uFF08\u53EA\u62A5\u4F9D\u8D56/\u60AC\u7A7A/\u5FAA\u73AF\uFF09\u3002\u53EF\u5728\u300C\u626B\u63CF\u300DTab \u8865\u5145\u5165\u53E3\u3002" }),
      /* @__PURE__ */ jsx(FindingsList, { report, kind, q, onWhy: askWhy }),
      whyPath && /* @__PURE__ */ jsxs("div", { className: "dcl-why", children: [
        /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
          /* @__PURE__ */ jsx("b", { className: "dcl-mono", children: whyPath }),
          /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx("button", { className: "dcl-btn2", onClick: () => {
            setWhyPath(null);
            setWhyData(null);
          }, children: "\u6536\u8D77" })
        ] }),
        !whyData ? /* @__PURE__ */ jsx("div", { className: "dcl-muted", children: "\u52A0\u8F7D\u8BC1\u636E\u2026" }) : /* @__PURE__ */ jsx(WhyView, { w: whyData })
      ] })
    ] }) }),
    tab === "history" && /* @__PURE__ */ jsx("div", { className: "dcl-scroll", children: runs.length === 0 ? /* @__PURE__ */ jsx("div", { className: "dcl-muted", children: "\u6682\u65E0\u5386\u53F2\u3002" }) : runs.map((r) => /* @__PURE__ */ jsxs("button", { className: "dcl-item", style: { textAlign: "left", cursor: "pointer" }, onClick: () => loadReport(r.id), children: [
      /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
        /* @__PURE__ */ jsx("span", { className: "dcl-mono", children: r.id }),
        /* @__PURE__ */ jsx(ReasonBadge, { reason: r.status === "done" ? "ok" : "err" }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("span", { className: "dcl-muted", children: fmtTime(r.startedAt) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dcl-mono dcl-muted", children: r.root }),
      r.counts && /* @__PURE__ */ jsxs("div", { className: "dcl-muted", children: [
        "\u6B7B\u6587\u4EF6 ",
        r.counts.orphanFiles,
        " \xB7 \u5BFC\u51FA ",
        r.counts.unusedExports,
        " \xB7 \u4F9D\u8D56 ",
        r.counts.unusedDeps,
        " \xB7 \u60AC\u7A7A ",
        r.counts.unresolvedImports,
        " \xB7 \u5FAA\u73AF ",
        r.counts.cycles
      ] }),
      r.error && /* @__PURE__ */ jsx("div", { className: "dcl-err", children: r.error })
    ] }, r.id)) }),
    tab === "settings" && /* @__PURE__ */ jsxs("div", { className: "dcl-scroll", children: [
      /* @__PURE__ */ jsxs("div", { className: "dcl-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
          /* @__PURE__ */ jsx("button", { className: "dcl-btn2", onClick: runSelftest, disabled: selftestBusy, children: selftestBusy ? "\u81EA\u68C0\u4E2D\u2026" : "\u8FD0\u884C\u79BB\u7EBF\u81EA\u68C0" }),
          /* @__PURE__ */ jsx("span", { className: "dcl-muted", children: "\u5185\u7F6E\u865A\u62DF\u9879\u76EE\u9A8C\u8BC1\u5F15\u64CE\u5168\u7BA1\u9053\uFF08\u96F6\u7F51\u7EDC\u96F6\u76D8\uFF09" })
        ] }),
        selftest && /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx("div", { className: selftest.ok ? "dcl-ok" : "dcl-err", children: selftest.ok ? `\u81EA\u68C0\u901A\u8FC7 ${selftest.total}/${selftest.total}` : `\u81EA\u68C0\u5931\u8D25 ${selftest.failed}/${selftest.total}` }),
          /* @__PURE__ */ jsx("div", { style: { marginTop: 6 }, children: selftest.checks.map((c) => /* @__PURE__ */ jsxs("div", { className: "dcl-evi", style: { color: c.ok ? void 0 : "#fca5a5" }, children: [
            c.ok ? "\u2713" : "\u2717",
            " ",
            c.name,
            "\uFF08\u671F\u671B ",
            c.expect,
            "\uFF5C\u5B9E\u9645 ",
            c.got,
            "\uFF09"
          ] }, c.name)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dcl-card", children: [
        /* @__PURE__ */ jsx("label", { className: "dcl-label", children: "\u5FFD\u7565\u8DEF\u5F84\u524D\u7F00\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF0C\u968F\u626B\u63CF\u751F\u6548\uFF09" }),
        /* @__PURE__ */ jsx("textarea", { className: "dcl-textarea", rows: 3, value: ignoreText, onChange: (e) => setIgnoreText(e.target.value), onBlur: () => {
          void api.saveSettings({ ignorePrefixes: ignoreText.split("\n").map((x) => x.trim()).filter(Boolean) }).catch(() => void 0);
        } })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dcl-card dcl-muted", children: [
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("b", { style: { color: "var(--polaris-text,#e5e7eb)" }, children: "\u5B89\u5168\u8FB9\u754C" }) }),
        /* @__PURE__ */ jsx("div", { children: "\xB7 \u5F15\u64CE\u5B8C\u5168\u79BB\u7EBF\uFF1A\u96F6\u5916\u90E8\u7F51\u7EDC\u8BF7\u6C42\u3001\u96F6\u7CFB\u7EDF\u547D\u4EE4" }),
        /* @__PURE__ */ jsx("div", { children: "\xB7 \u6587\u4EF6\u53EA\u8BFB\uFF1B\u552F\u4E00\u5199\u5165 = kv \u6295\u5F71\uFF08\u672C\u673A\u6570\u636E\u6839\uFF09" }),
        /* @__PURE__ */ jsx("div", { children: "\xB7 \u670D\u52A1\u4EC5\u76D1\u542C 127.0.0.1\uFF0CBearer token \u9274\u6743\uFF08timingSafe \u6BD4\u5BF9\uFF09" }),
        /* @__PURE__ */ jsx("div", { children: "\xB7 \u5DF2\u77E5\u8FB9\u754C\uFF1AVue SFC \u4E0D\u89E3\u6790\uFF1Bmonorepo \u8DE8\u5305\u5F15\u7528\u6309\u5916\u90E8\u4F9D\u8D56\u5904\u7406\uFF1BWeb(https) \u6A21\u5F0F\u6D4F\u89C8\u5668\u62E6 127.0.0.1 \u6DF7\u5408\u5185\u5BB9\uFF08\u684C\u9762/\u624B\u673A\u6B63\u5E38\uFF09" })
      ] })
    ] })
  ] });
}
function FindingsList({ report, kind, q, onWhy }) {
  const needle = q.trim().toLowerCase();
  const hit = (s) => !needle || s.toLowerCase().includes(needle);
  const items = [];
  if ((kind === "all" || kind === "files") && report.orphanFiles.length) {
    const list = report.orphanFiles.filter((o) => hit(o.path));
    if (list.length) items.push(/* @__PURE__ */ jsx(SectionTitle, { n: list.length, label: "\u6B7B\u6587\u4EF6" }, "t-files"));
    for (const o of list.slice(0, kind === "files" ? 400 : 40)) {
      items.push(
        /* @__PURE__ */ jsxs("div", { className: "dcl-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
            /* @__PURE__ */ jsx(ReasonBadge, { reason: o.reason }),
            /* @__PURE__ */ jsx("span", { className: "dcl-mono", style: { flex: 1 }, children: o.path }),
            /* @__PURE__ */ jsxs("span", { className: "dcl-muted", children: [
              fmtBytes(o.bytes),
              " \xB7 ",
              o.loc,
              " \u884C"
            ] }),
            /* @__PURE__ */ jsx("button", { className: "dcl-btn2", onClick: () => onWhy(o.path), children: "\u4E3A\u4EC0\u4E48" })
          ] }),
          o.importerCount > 0 && /* @__PURE__ */ jsxs("div", { className: "dcl-evi", children: [
            "\u5F15\u7528\u8005\uFF08\u5168\u90E8\u5DF2\u6B7B\uFF09\uFF1A",
            o.importers.join("\u3001"),
            o.importerCount > o.importers.length ? ` \u7B49 ${o.importerCount} \u4E2A` : ""
          ] })
        ] }, `f-${o.path}`)
      );
    }
  }
  if ((kind === "all" || kind === "exports") && report.unusedExports.length) {
    const list = report.unusedExports.filter((x) => hit(x.path) || hit(x.name));
    if (list.length) items.push(/* @__PURE__ */ jsx(SectionTitle, { n: list.length, label: "\u672A\u4F7F\u7528\u5BFC\u51FA" }, "t-exp"));
    for (const x of list.slice(0, kind === "exports" ? 800 : 40)) {
      items.push(
        /* @__PURE__ */ jsxs("div", { className: "dcl-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
            /* @__PURE__ */ jsx(SuggestBadge, { s: x.suggestion }),
            /* @__PURE__ */ jsxs("span", { className: "dcl-mono", style: { flex: 1 }, children: [
              x.path,
              " ",
              /* @__PURE__ */ jsxs("b", { style: { color: "#93c5fd" }, children: [
                "::",
                x.name
              ] }),
              x.typeOnly ? " (type)" : ""
            ] }),
            /* @__PURE__ */ jsx("button", { className: "dcl-btn2", onClick: () => onWhy(x.path), children: "\u4E3A\u4EC0\u4E48" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "dcl-evi", children: x.suggestion === "delete" ? "\u5168\u4ED3\u65E0\u5BFC\u5165\u8005\uFF0C\u4E14\u672C\u6587\u4EF6\u5185\u4E5F\u65E0\u5176\u4ED6\u5F15\u7528 \u2192 \u6574\u4E2A\u58F0\u660E\u53EF\u5220" : x.suggestion === "unexport" ? "\u672C\u6587\u4EF6\u5185\u90E8\u8FD8\u6709\u4F7F\u7528 \u2192 \u53EA\u9700\u53BB\u6389 export \u5173\u952E\u5B57\uFF08\u4FDD\u7559\u58F0\u660E\uFF09" : "default \u5BFC\u51FA\uFF1A\u786E\u8BA4\u8FD0\u884C\u65F6\u52A0\u8F7D\u65B9\u5F0F\u540E\u518D\u5904\u7406" })
        ] }, `e-${x.path}::${x.name}`)
      );
    }
  }
  if ((kind === "all" || kind === "deps") && report.deps.unused.length) {
    const list = report.deps.unused.filter((d) => hit(d.name));
    if (list.length) items.push(/* @__PURE__ */ jsx(SectionTitle, { n: list.length, label: `\u672A\u4F7F\u7528\u4F9D\u8D56\uFF08${report.deps.checked}\uFF09` }, "t-dep"));
    for (const d of list.slice(0, 100)) {
      items.push(
        /* @__PURE__ */ jsxs("div", { className: "dcl-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
            /* @__PURE__ */ jsx(SuggestBadge, { s: d.tooling ? "tooling" : "review" }),
            /* @__PURE__ */ jsx("span", { className: "dcl-mono", style: { flex: 1 }, children: d.name }),
            /* @__PURE__ */ jsx("span", { className: "dcl-muted", children: d.kind === "dep" ? "dependencies" : "devDependencies" })
          ] }),
          d.note && /* @__PURE__ */ jsx("div", { className: "dcl-evi", children: d.note })
        ] }, `d-${d.name}`)
      );
    }
  }
  if ((kind === "all" || kind === "unresolved") && report.unresolvedImports.length) {
    const list = report.unresolvedImports.filter((u) => hit(u.importer) || hit(u.specifier));
    if (list.length) items.push(/* @__PURE__ */ jsx(SectionTitle, { n: list.length, label: "\u60AC\u7A7A\u5BFC\u5165\uFF08\u89E3\u6790\u5931\u8D25 = \u771F bug\uFF09" }, "t-un"));
    for (const u of list.slice(0, 200)) {
      items.push(
        /* @__PURE__ */ jsxs("div", { className: "dcl-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
            /* @__PURE__ */ jsx("span", { className: "dcl-reason", style: { background: "#7f1d1d55", color: "#fca5a5" }, children: "\u65AD\u94FE" }),
            /* @__PURE__ */ jsxs("span", { className: "dcl-mono", style: { flex: 1 }, children: [
              u.importer,
              " \u2192 ",
              /* @__PURE__ */ jsx("b", { style: { color: "#fca5a5" }, children: u.specifier })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "dcl-evi", children: u.note })
        ] }, `u-${u.importer}-${u.specifier}`)
      );
    }
  }
  if ((kind === "all" || kind === "cycles") && report.cycles.length) {
    const list = report.cycles.filter((c) => !needle || c.files.some((f) => hit(f)));
    if (list.length) items.push(/* @__PURE__ */ jsx(SectionTitle, { n: list.length, label: "\u5FAA\u73AF\u4F9D\u8D56" }, "t-cy"));
    for (const c of list.slice(0, 60)) {
      items.push(
        /* @__PURE__ */ jsxs("div", { className: "dcl-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
            /* @__PURE__ */ jsxs("span", { className: "dcl-reason", style: { background: "#78350f55", color: "#fcd34d" }, children: [
              c.size,
              " \u6587\u4EF6"
            ] }),
            c.truncated && /* @__PURE__ */ jsx("span", { className: "dcl-muted", children: c.truncated })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dcl-evi dcl-mono", children: [
            c.files.join(" \u2192 "),
            c.truncated ? " \u2192 \u2026" : ""
          ] })
        ] }, `c-${c.files.join("|")}`)
      );
    }
  }
  if (!items.length) return /* @__PURE__ */ jsx("div", { className: "dcl-muted", children: "\u8BE5\u7C7B\u522B\u6CA1\u6709\u53D1\u73B0\uFF08\u6216\u88AB\u8FC7\u6EE4\u8BCD\u6321\u4F4F\uFF09\u3002" });
  return /* @__PURE__ */ jsx(Fragment, { children: items });
}
function SectionTitle({ n, label }) {
  return /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--polaris-text-2,#9ca3af)", marginTop: 4 }, children: [
    label,
    " \xB7 ",
    n
  ] });
}
function WhyView({ w }) {
  if (w.error) return /* @__PURE__ */ jsx("div", { className: "dcl-err", children: String(w.error) });
  const importers = w.importers || [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "dcl-row", children: [
      /* @__PURE__ */ jsx(SuggestBadge, { s: w.verdict === "\u53EF\u8FBE" ? "review" : "delete" }),
      /* @__PURE__ */ jsx("b", { children: String(w.verdict) }),
      w.isEntry ? /* @__PURE__ */ jsxs("span", { className: "dcl-reason", style: { background: "#1e3a5f55", color: "#93c5fd" }, children: [
        "\u5165\u53E3\uFF08",
        String(w.isEntry),
        "\uFF09"
      ] }) : null,
      w.globCovered ? /* @__PURE__ */ jsx("span", { className: "dcl-reason", style: { background: "#1e3a5f55", color: "#93c5fd" }, children: "import.meta.glob \u8986\u76D6" }) : null,
      /* @__PURE__ */ jsxs("span", { className: "dcl-muted", children: [
        String(w.bytes),
        "B \xB7 \u5F15\u7528\u8005 ",
        String(w.importerCount),
        " \u4E2A \xB7 \u51FA\u8FB9 ",
        String(w.importsCount),
        " \u6761"
      ] })
    ] }),
    importers.length ? /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: "dcl-label", children: "\u8C01\u5F15\u7528\u5B83" }),
      importers.slice(0, 15).map((im, i) => /* @__PURE__ */ jsxs("div", { className: "dcl-evi dcl-mono", children: [
        String(im.from),
        "\uFF08",
        im.reachable ? "\u6D3B" : "\u6B7B",
        "\uFF09import ",
        im.namespace ? "* as ns" : im.dynamic ? `\u52A8\u6001 (${String(im.spec)})` : im.names?.join(", ") || (im.side ? "side-effect" : String(im.spec))
      ] }, i))
    ] }) : /* @__PURE__ */ jsx("div", { className: "dcl-evi", children: "\u65E0\u4EFB\u4F55\u6587\u4EF6 import \u5B83" }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: "dcl-label", children: "\u5BFC\u51FA\u6D88\u8D39" }),
      /* @__PURE__ */ jsxs("div", { className: "dcl-evi", children: [
        "\u5DF2\u6D88\u8D39\uFF1A",
        w.exportsUsed?.join("\u3001") || "\uFF08\u65E0\uFF09"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dcl-evi", children: [
        "\u672A\u6D88\u8D39\uFF1A",
        w.exportsUnused?.join("\u3001") || "\uFF08\u65E0\uFF09"
      ] })
    ] })
  ] });
}
function reportToMd(r) {
  const L = [];
  L.push(`# \u6B7B\u4EE3\u7801\u4F53\u68C0\u62A5\u544A`, "", `- \u6839\uFF1A\u89C1\u626B\u63CF\u8BB0\u5F55\uFF08runId \u89C1\u5386\u53F2\uFF09`, `- \u6587\u4EF6 ${r.counts.files} \xB7 \u8FB9 ${r.meta.edgesTotal} \xB7 \u8017\u65F6 ${r.meta.durationMs}ms \xB7 \u5F15\u64CE v${r.meta.version}`, "");
  L.push(`| \u7C7B\u522B | \u6570\u91CF |`, `|---|---:|`);
  L.push(`| \u6B7B\u6587\u4EF6 | ${r.counts.orphanFiles} |`, `| \u672A\u4F7F\u7528\u5BFC\u51FA | ${r.counts.unusedExports} |`, `| \u672A\u4F7F\u7528\u4F9D\u8D56 | ${r.counts.unusedDeps} |`, `| \u60AC\u7A7A\u5BFC\u5165 | ${r.counts.unresolvedImports} |`, `| \u5FAA\u73AF\u4F9D\u8D56 | ${r.counts.cycles} |`, "");
  if (r.orphanFiles.length) {
    L.push(`## \u6B7B\u6587\u4EF6`, "");
    for (const o of r.orphanFiles) L.push(`- \`${o.path}\`\uFF08${o.reason === "no-importer" ? "\u96F6\u5F15\u7528" : "\u4EC5\u88AB\u6B7B\u6587\u4EF6\u5F15\u7528"}${o.importerCount ? `\uFF0C\u5F15\u7528\u8005 ${o.importers.join("/")}` : ""}\uFF09`);
    L.push("");
  }
  if (r.unusedExports.length) {
    L.push(`## \u672A\u4F7F\u7528\u5BFC\u51FA`, "");
    for (const x of r.unusedExports) L.push(`- \`${x.path}\` \u7684 \`${x.name}\` \u2192 ${x.suggestion === "delete" ? "\u53EF\u5220" : x.suggestion === "unexport" ? "\u53BB export" : "\u9700\u786E\u8BA4"}`);
    L.push("");
  }
  if (r.deps.unused.length) {
    L.push(`## \u672A\u4F7F\u7528\u4F9D\u8D56`, "");
    for (const d of r.deps.unused) L.push(`- \`${d.name}\`\uFF08${d.tooling ? "\u5DE5\u5177\u94FE\u7C7B\uFF0C\u786E\u8BA4 CI/hook \u540E\u5904\u7406" : "\u786E\u8BA4\u65E0\u914D\u7F6E/\u811A\u672C\u5F15\u7528\u540E\u79FB\u9664"}\uFF09${d.note ? `\uFF1A${d.note}` : ""}`);
    L.push("");
  }
  if (r.unresolvedImports.length) {
    L.push(`## \u60AC\u7A7A\u5BFC\u5165`, "");
    for (const u of r.unresolvedImports) L.push(`- \`${u.importer}\` \u2192 \`${u.specifier}\`\uFF08${u.note}\uFF09`);
    L.push("");
  }
  if (r.cycles.length) {
    L.push(`## \u5FAA\u73AF\u4F9D\u8D56`, "");
    for (const c of r.cycles) L.push(`- ${c.files.map((f) => `\`${f}\``).join(" \u2192 ")}${c.truncated ? `\uFF08${c.truncated}\uFF09` : ""}`);
    L.push("");
  }
  if (r.warnings.length) {
    L.push(`## \u8B66\u544A`, "");
    for (const w of r.warnings) L.push(`- ${w}`);
  }
  return L.join("\n");
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
