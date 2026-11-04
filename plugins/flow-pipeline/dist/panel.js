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
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  MASK: () => MASK,
  SvcError: () => SvcError,
  api: () => api,
  blankPipeline: () => blankPipeline,
  invalidateMeta: () => invalidateMeta,
  presets: () => presets,
  readMeta: () => readMeta
});
function invalidateMeta() {
  metaCache = null;
  metaAt = 0;
}
async function readMeta() {
  if (metaCache && Date.now() - metaAt < 5e3) return metaCache;
  const m = await kvGet("flowpipe.meta");
  if (!m || typeof m.port !== "number" || !m.token) {
    throw new SvcError("\u670D\u52A1\u672A\u5C31\u7EEA\uFF08flowpipe.meta \u7F3A\u5931\uFF09\uFF1A\u7A0D\u5019\u81EA\u52A8\u91CD\u8BD5\uFF0C\u6216\u5230\u63D2\u4EF6\u7BA1\u7406\u91CC\u91CD\u542F\u670D\u52A1");
  }
  metaCache = m;
  metaAt = Date.now();
  return m;
}
async function svc(method, apiPath, body, timeoutMs = 2e4) {
  const meta = await readMeta();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${apiPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${meta.token}`
      },
      body: body === void 0 ? void 0 : JSON.stringify(body),
      signal: ac.signal
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {
    }
    if (res.status >= 400) {
      const msg = data && (data.error || data.errors && data.errors.join("\uFF1B")) || `HTTP ${res.status}`;
      throw new SvcError(msg);
    }
    return data ?? {};
  } catch (e) {
    if (e instanceof SvcError) throw e;
    if (e.name === "AbortError") throw new SvcError("\u670D\u52A1\u8BF7\u6C42\u8D85\u65F6");
    throw new SvcError(`\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}
function blankPipeline() {
  return {
    name: "\u65B0\u6D41\u6C34\u7EBF",
    enabled: true,
    trigger: { type: "manual" },
    vars: {},
    secrets: [],
    allowLocal: false,
    steps: [{ type: "http", name: "\u793A\u4F8B\u8BF7\u6C42", method: "GET", url: "https://httpbin.org/json", saveAs: "resp" }]
  };
}
function presets() {
  return [
    {
      label: "\u63A5\u53E3\u5DE1\u68C0 \u2192 \u5F02\u5E38\u624D\u901A\u77E5",
      make: () => ({
        name: "\u63A5\u53E3\u5DE1\u68C0",
        enabled: true,
        trigger: { type: "interval", everyMinutes: 30 },
        vars: { api: "https://httpbin.org/status/200" },
        secrets: [],
        allowLocal: false,
        steps: [
          { id: "s1", type: "http", name: "\u63A2\u6D3B", method: "GET", url: "{{api}}", timeoutSec: 10, saveAs: "resp" },
          { id: "s2", type: "notify", name: "\u6302\u4E86\u624D\u53EB\u4EBA", url: "https://dingtalk-webhook.example/json", payload: { msgtype: "text", text: { content: "\u63A5\u53E3\u5DE1\u68C0\u5931\u8D25\uFF1A{{resp.status}}" } }, when: "{{resp.ok}} == false" }
        ]
      })
    },
    {
      label: "webhook \u6536\u5230 \u2192 AI \u5206\u6790 \u2192 \u901A\u77E5",
      make: () => ({
        name: "\u544A\u8B66 AI \u5206\u6790",
        enabled: true,
        trigger: { type: "webhook" },
        vars: {},
        secrets: [],
        allowLocal: false,
        steps: [
          { id: "s1", type: "ai", name: "\u5206\u6790\u544A\u8B66", providerId: "\u5728\u6B64\u586B\u8BBE\u7F6E\u91CC\u7684\u4F9B\u5E94\u5546ID", prompt: "\u7528\u4E24\u53E5\u8BDD\u5206\u6790\u8FD9\u6761\u544A\u8B66\u8BE5\u4E0D\u8BE5\u534A\u591C\u53EB\u4EBA\uFF1A{{params.body.alert}}", saveAs: "analysis" },
          { id: "s2", type: "notify", name: "\u63A8\u9001\u7ED3\u8BBA", url: "https://dingtalk-webhook.example/json", payload: { msgtype: "text", text: { content: "\u544A\u8B66\u5206\u6790\uFF1A{{analysis.text}}" } } }
        ]
      })
    },
    {
      label: "\u6BCF\u5929\u5B9A\u70B9\u6293\u53D6 \u2192 \u5B58\u6587\u4EF6",
      make: () => ({
        name: "\u6BCF\u65E5\u6570\u636E\u5F52\u6863",
        enabled: true,
        trigger: { type: "daily", at: "08:30" },
        vars: { source: "https://httpbin.org/json" },
        secrets: [],
        allowLocal: false,
        steps: [
          { id: "s1", type: "http", name: "\u6293\u6570\u636E", method: "GET", url: "{{source}}", saveAs: "resp" },
          { id: "s2", type: "file", name: "\u843D\u76D8", action: "write", path: "daily-{{env.today}}.json", content: "{{resp.json}}" }
        ]
      })
    }
  ];
}
var MASK, metaCache, metaAt, SvcError, api;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    MASK = "__FLOWPIPE_MASKED__";
    metaCache = null;
    metaAt = 0;
    SvcError = class extends Error {
    };
    api = {
      listPipelines: () => svc("GET", "/api/pipelines"),
      getPipeline: (id) => svc("GET", `/api/pipelines/${encodeURIComponent(id)}`),
      createPipeline: (pipeline) => svc("POST", "/api/pipelines", { pipeline }),
      updatePipeline: (id, pipeline) => svc("PUT", `/api/pipelines/${encodeURIComponent(id)}`, { pipeline }),
      deletePipeline: (id, confirm) => svc("DELETE", `/api/pipelines/${encodeURIComponent(id)}?confirm=${encodeURIComponent(confirm)}`),
      runPipeline: (id, params) => svc("POST", `/api/pipelines/${encodeURIComponent(id)}/run`, { params }, 35e3),
      listRuns: (plId, limit = 10) => svc("GET", `/api/runs?plId=${encodeURIComponent(plId)}&limit=${limit}`),
      getRun: (runId) => svc("GET", `/api/runs/${encodeURIComponent(runId)}`),
      stopRun: (runId) => svc("POST", `/api/runs/${encodeURIComponent(runId)}/stop`),
      getSettings: () => svc("GET", "/api/settings"),
      saveSettings: (settings) => svc("PUT", "/api/settings", { settings }),
      importHost: (dryRun) => svc("POST", "/api/settings/import-host", { dryRun }, 3e4),
      selftest: () => svc("POST", "/api/selftest", {}, 3e4),
      webhookUrl: (p) => `POST http://127.0.0.1:${"PORT"}/hook/${p.id}  (X-FlowPipe-Token: \u89C1\u5B9A\u4E49\u9875)`
    };
  }
});

// src/Panel.tsx
init_model();
init_host();
import { useCallback, useEffect, useRef, useState } from "react";

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function PanelStyle() {
  return /* @__PURE__ */ jsx("style", { children: `
.flowpipe-panel { display:flex; flex-direction:column; height:100%; background:#16181B; color:#E5E7EB; font-size:13px; }
.flowpipe-panel * { box-sizing:border-box; }
.flowpipe-panel button { background:#2A2F36; color:#E5E7EB; border:1px solid #3A4048; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; }
.flowpipe-panel button:hover:not(:disabled) { background:#343B44; }
.flowpipe-panel button:disabled { opacity:.45; cursor:not-allowed; }
.flowpipe-panel button.primary { background:#2563EB; border-color:#2563EB; color:#fff; }
.flowpipe-panel button.primary:hover:not(:disabled) { background:#1D4ED8; }
.flowpipe-panel button.danger { background:#7F1D1D; border-color:#991B1B; color:#FECACA; }
.flowpipe-panel button.small { padding:2px 7px; font-size:11px; }
.flowpipe-panel input, .flowpipe-panel select, .flowpipe-panel textarea {
  background:#1D2126; color:#E5E7EB; border:1px solid #3A4048; border-radius:6px; padding:4px 8px; font-size:12px; width:100%;
}
.flowpipe-panel textarea { font-family:Consolas,Monaco,monospace; resize:vertical; }
.flowpipe-panel input:focus, .flowpipe-panel select:focus, .flowpipe-panel textarea:focus { outline:none; border-color:#3B82F6; }
.flowpipe-panel .fp-header { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #2A2F36; }
.flowpipe-panel .fp-title { font-weight:600; font-size:14px; flex:1; }
.flowpipe-panel .fp-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.flowpipe-panel .fp-body { flex:1; display:flex; min-height:0; }
.flowpipe-panel .fp-side { width:250px; min-width:250px; border-right:1px solid #2A2F36; display:flex; flex-direction:column; }
.flowpipe-panel .fp-side-list { flex:1; overflow:auto; padding:6px; }
.flowpipe-panel .fp-pl-item { padding:7px 9px; border-radius:6px; cursor:pointer; margin-bottom:2px; border:1px solid transparent; }
.flowpipe-panel .fp-pl-item:hover { background:#20242A; }
.flowpipe-panel .fp-pl-item.active { background:#232B36; border-color:#2F3B4C; }
.flowpipe-panel .fp-pl-name { font-weight:500; display:flex; align-items:center; gap:6px; }
.flowpipe-panel .fp-pl-sub { color:#8B929C; font-size:11px; margin-top:2px; display:flex; gap:6px; align-items:center; }
.flowpipe-panel .fp-chip { font-size:10px; padding:1px 6px; border-radius:8px; background:#262B33; color:#9CA3AF; }
.flowpipe-panel .fp-chip.on { background:#0F2E1D; color:#34D399; }
.flowpipe-panel .fp-chip.warn { background:#3B2A12; color:#FBBF24; }
.flowpipe-panel .fp-chip.err { background:#3B1416; color:#F87171; }
.flowpipe-panel .fp-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.flowpipe-panel .fp-tabs { display:flex; gap:2px; padding:6px 10px 0; border-bottom:1px solid #2A2F36; }
.flowpipe-panel .fp-tab { padding:5px 14px; cursor:pointer; border-radius:6px 6px 0 0; color:#9CA3AF; font-size:12px; }
.flowpipe-panel .fp-tab.active { background:#1D2126; color:#E5E7EB; border:1px solid #2A2F36; border-bottom-color:#1D2126; }
.flowpipe-panel .fp-scroll { flex:1; overflow:auto; padding:12px; }
.flowpipe-panel .fp-card { background:#1D2126; border:1px solid #2A2F36; border-radius:8px; padding:10px 12px; margin-bottom:10px; }
.flowpipe-panel .fp-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.flowpipe-panel .fp-field { display:flex; flex-direction:column; gap:3px; margin-bottom:8px; }
.flowpipe-panel .fp-label { font-size:11px; color:#8B929C; }
.flowpipe-panel .fp-label code { color:#93C5FD; }
.flowpipe-panel .fp-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.flowpipe-panel .fp-grid3 { display:grid; grid-template-columns:90px 1fr 1fr; gap:8px; }
.flowpipe-panel .fp-step { border:1px solid #2A2F36; border-radius:8px; background:#1B1F24; margin-bottom:8px; }
.flowpipe-panel .fp-step-head { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#22262C; border-radius:8px 8px 0 0; }
.flowpipe-panel .fp-step-idx { width:20px; height:20px; border-radius:50%; background:#2F3B4C; color:#93C5FD; font-size:11px; display:flex; align-items:center; justify-content:center; flex:none; }
.flowpipe-panel .fp-step-body { padding:8px 10px; }
.flowpipe-panel .fp-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#8B929C; padding:30px; text-align:center; }
.flowpipe-panel .fp-run-item { border:1px solid #2A2F36; border-radius:8px; padding:8px 10px; margin-bottom:6px; cursor:pointer; }
.flowpipe-panel .fp-run-item:hover { background:#20242A; }
.flowpipe-panel .fp-run-item.active { border-color:#2F3B4C; background:#232B36; }
.flowpipe-panel .fp-timeline { border-left:2px solid #2A2F36; margin-left:8px; padding-left:14px; }
.flowpipe-panel .fp-tl-item { position:relative; padding:4px 0 10px; }
.flowpipe-panel .fp-tl-item::before { content:''; position:absolute; left:-19.5px; top:9px; width:9px; height:9px; border-radius:50%; background:#4B5563; }
.flowpipe-panel .fp-tl-item.ok::before { background:#34D399; }
.flowpipe-panel .fp-tl-item.error::before { background:#F87171; }
.flowpipe-panel .fp-tl-item.skipped::before { background:#6B7280; }
.flowpipe-panel .fp-tl-item.running::before { background:#FBBF24; }
.flowpipe-panel .fp-mono { font-family:Consolas,Monaco,monospace; font-size:11px; }
.flowpipe-panel .fp-excerpt { background:#16181B; border:1px solid #2A2F36; border-radius:6px; padding:6px 8px; margin-top:4px; white-space:pre-wrap; word-break:break-all; color:#A7B0BC; }
.flowpipe-panel .fp-err { color:#F87171; }
.flowpipe-panel .fp-okc { color:#34D399; }
.flowpipe-panel .fp-muted { color:#8B929C; }
.flowpipe-panel .fp-modal-mask { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:50; }
.flowpipe-panel .fp-modal { width:520px; max-width:92%; max-height:86%; overflow:auto; background:#1D2126; border:1px solid #3A4048; border-radius:10px; padding:14px; }
.flowpipe-panel .fp-kv-row { display:grid; grid-template-columns:130px 1fr 90px 28px; gap:6px; margin-bottom:5px; align-items:center; }
.flowpipe-panel a { color:#93C5FD; }
` });
}
function Dot({ color }) {
  return /* @__PURE__ */ jsx("span", { className: "fp-dot", style: { background: color } });
}
function statusColor(status) {
  switch (status) {
    case "ok":
      return "#34D399";
    case "running":
    case "queued":
      return "#FBBF24";
    case "error":
      return "#F87171";
    case "stopped":
      return "#9CA3AF";
    default:
      return "#6B7280";
  }
}
function triggerText(t) {
  if (!t) return "\u624B\u52A8";
  switch (t.type) {
    case "interval":
      return `\u6BCF ${t.everyMinutes ?? "?"} \u5206\u949F`;
    case "daily":
      return `\u6BCF\u5929 ${t.at ?? "??:??"}`;
    case "webhook":
      return "Webhook";
    default:
      return "\u624B\u52A8";
  }
}
function durStr(ms) {
  if (ms == null) return "";
  if (ms < 1e3) return `${ms}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.floor(ms / 6e4)}m${Math.round(ms % 6e4 / 1e3)}s`;
}
function timeStr(iso) {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(5, 16);
}
function Field({ label, hint, children }) {
  return /* @__PURE__ */ jsxs("div", { className: "fp-field", children: [
    /* @__PURE__ */ jsxs("span", { className: "fp-label", children: [
      label,
      hint ? /* @__PURE__ */ jsxs("span", { className: "fp-muted", children: [
        " \xB7 ",
        hint
      ] }) : null
    ] }),
    children
  ] });
}

// src/StepForm.tsx
init_model();
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var STEP_TYPES = [
  { v: "http", label: "HTTP \u8BF7\u6C42" },
  { v: "mcp", label: "MCP \u5DE5\u5177" },
  { v: "ai", label: "AI \u8C03\u7528" },
  { v: "extract", label: "\u63D0\u53D6\u5B57\u6BB5" },
  { v: "template", label: "\u6A21\u677F\u6587\u672C" },
  { v: "script", label: "\u811A\u672C\u7247\u6BB5" },
  { v: "kv", label: "KV \u5B58\u50A8" },
  { v: "file", label: "\u5199\u6587\u4EF6" },
  { v: "notify", label: "Webhook \u901A\u77E5" }
];
function jsonText(v) {
  if (v === void 0 || v === null || v === "") return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch (_) {
    return "";
  }
}
function StepForm({ step, onChange, providers, allowLocal }) {
  const t = step.type;
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "fp-row", children: [
      /* @__PURE__ */ jsx2("div", { style: { width: 150 }, children: /* @__PURE__ */ jsx2(Field, { label: "\u6B65\u9AA4\u7C7B\u578B", children: /* @__PURE__ */ jsx2(
        "select",
        {
          value: t,
          onChange: (e) => {
            const v = e.target.value;
            const next = { ...step, type: v };
            for (const k of ["method", "url", "headers", "body", "timeoutSec", "serverId", "tool", "arguments", "providerId", "prompt", "system", "from", "paths", "text", "code", "action", "key", "value", "path", "content", "payload"]) {
              delete next[k];
            }
            onChange(next);
          },
          children: STEP_TYPES.map((x) => /* @__PURE__ */ jsx2("option", { value: x.v, children: x.label }, x.v))
        }
      ) }) }),
      /* @__PURE__ */ jsx2("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx2(Field, { label: "\u6B65\u9AA4\u540D\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ jsx2("input", { value: step.name || "", onChange: (e) => onChange({ name: e.target.value }), placeholder: "\u7ED9\u8FD9\u6B65\u8D77\u4E2A\u540D\u5B57" }) }) })
    ] }),
    t === "http" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "fp-grid3", children: [
        /* @__PURE__ */ jsx2(Field, { label: "Method", children: /* @__PURE__ */ jsx2("select", { value: step.method || "GET", onChange: (e) => onChange({ method: e.target.value }), children: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((m) => /* @__PURE__ */ jsx2("option", { children: m }, m)) }) }),
        /* @__PURE__ */ jsx2("div", { style: { gridColumn: "span 2" }, children: /* @__PURE__ */ jsx2(Field, { label: "URL", hint: "\u652F\u6301 {{\u5360\u4F4D\u7B26}}", children: /* @__PURE__ */ jsx2("input", { value: step.url || "", onChange: (e) => onChange({ url: e.target.value }), placeholder: "https://api.example.com/v1/data" }) }) })
      ] }),
      /* @__PURE__ */ jsx2(Field, { label: "Headers\uFF08JSON\uFF0C\u53EF\u9009\uFF09", hint: '{"Authorization": "Bearer {{vars.token}}"}', children: /* @__PURE__ */ jsx2("textarea", { rows: 2, value: jsonText(step.headers), onChange: (e) => {
        try {
          onChange({ headers: e.target.value.trim() ? JSON.parse(e.target.value) : void 0 });
        } catch (_) {
        }
      } }) }),
      !["GET", "HEAD"].includes(step.method || "GET") && /* @__PURE__ */ jsx2(Field, { label: "Body\uFF08JSON \u5BF9\u8C61\u6216\u5B57\u7B26\u4E32\uFF0C\u53EF\u9009\uFF09", children: /* @__PURE__ */ jsx2("textarea", { rows: 3, value: step.body ?? "", onChange: (e) => onChange({ body: e.target.value }) }) }),
      /* @__PURE__ */ jsxs2("div", { className: "fp-grid2", children: [
        /* @__PURE__ */ jsx2(Field, { label: "\u8D85\u65F6\uFF08\u79D2\uFF0C2-120\uFF09", children: /* @__PURE__ */ jsx2("input", { type: "number", min: 2, max: 120, value: step.timeoutSec ?? 30, onChange: (e) => onChange({ timeoutSec: Number(e.target.value) }) }) }),
        /* @__PURE__ */ jsx2(Field, { label: "\u5931\u8D25\u65F6\u7EE7\u7EED", hint: "\u5F00\u542F\u540E\u6B64\u6B65\u5931\u8D25\u4E0D\u4E2D\u65AD\u6D41\u6C34\u7EBF", children: /* @__PURE__ */ jsxs2("select", { value: step.continueOnError ? "1" : "0", onChange: (e) => onChange({ continueOnError: e.target.value === "1" }), children: [
          /* @__PURE__ */ jsx2("option", { value: "0", children: "\u5931\u8D25\u5373\u505C\uFF08\u9ED8\u8BA4\uFF09" }),
          /* @__PURE__ */ jsx2("option", { value: "1", children: "\u7EE7\u7EED\u6267\u884C\u540E\u7EED\u6B65\u9AA4" })
        ] }) })
      ] }),
      !allowLocal && /* @__PURE__ */ jsx2("div", { className: "fp-muted", style: { marginBottom: 6 }, children: "\u26A0 \u9ED8\u8BA4\u7981\u6B62\u79C1\u7F51/\u73AF\u56DE\u76EE\u6807\uFF08SSRF \u56F4\u680F\uFF09\uFF1B\u8981\u8C03\u672C\u673A\u670D\u52A1\u8BF7\u5728\u6D41\u6C34\u7EBF\u7EA7\u5F00\u300C\u5141\u8BB8\u672C\u673A/\u5185\u7F51\u76EE\u6807\u300D\u3002" })
    ] }),
    t === "mcp" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(Field, { label: "serverId", hint: "\u5BBF\u4E3B\u5DF2\u6CE8\u518C\u7684 MCP server \u6807\u8BC6\uFF08cap.mcp \u53EF\u67E5\uFF09", children: /* @__PURE__ */ jsx2("input", { value: step.serverId || "", onChange: (e) => onChange({ serverId: e.target.value }), placeholder: "\u5982 domain-probe" }) }),
      /* @__PURE__ */ jsx2(Field, { label: "\u5DE5\u5177\u540D tool", children: /* @__PURE__ */ jsx2("input", { value: step.tool || "", onChange: (e) => onChange({ tool: e.target.value }), placeholder: "\u5982 domain_probe_scan" }) }),
      /* @__PURE__ */ jsx2(Field, { label: "arguments\uFF08JSON \u5BF9\u8C61\uFF0C\u652F\u6301 {{\u5360\u4F4D\u7B26}}\uFF09", children: /* @__PURE__ */ jsx2("textarea", { rows: 3, value: jsonText(step.arguments), onChange: (e) => {
        try {
          onChange({ arguments: e.target.value.trim() ? JSON.parse(e.target.value) : {} });
        } catch (_) {
        }
      } }) }),
      /* @__PURE__ */ jsx2("div", { className: "fp-muted", style: { marginBottom: 6 }, children: "\u5BBF\u4E3B\u4EFB\u610F\u5DF2\u88C5\u63D2\u4EF6\u7684 MCP \u5DE5\u5177\u90FD\u53EF\u76F4\u63A5\u5F53\u6B65\u9AA4\u8C03\uFF1B\u5DE5\u5177\u540D/\u53C2\u6570\u53EF\u5728\u804A\u5929\u91CC\u95EE AI\uFF08flow \u7CFB\u5DE5\u5177\uFF09\u6216 MCP \u8C03\u8BD5\u53F0\u3002" })
    ] }),
    t === "ai" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(Field, { label: "\u4F9B\u5E94\u5546\uFF08\u8BBE\u7F6E \u2192 AI \u4F9B\u5E94\u5546\u91CC\u914D\u7F6E/\u5BFC\u5165\uFF09", children: /* @__PURE__ */ jsxs2("select", { value: step.providerId || "", onChange: (e) => onChange({ providerId: e.target.value }), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u2014 \u9009\u62E9\u4F9B\u5E94\u5546 \u2014" }),
        providers.map((p) => /* @__PURE__ */ jsxs2("option", { value: p.id, children: [
          p.name,
          "\uFF08",
          p.model,
          "\uFF09"
        ] }, p.id))
      ] }) }),
      /* @__PURE__ */ jsx2(Field, { label: "Prompt", hint: "\u652F\u6301 {{\u5360\u4F4D\u7B26}}\uFF0C\u5982 {{resp.json}}", children: /* @__PURE__ */ jsx2("textarea", { rows: 4, value: step.prompt || "", onChange: (e) => onChange({ prompt: e.target.value }), placeholder: "\u603B\u7ED3\u4EE5\u4E0B\u5185\u5BB9\u7684\u6838\u5FC3\u4FE1\u606F\uFF1A{{resp.body}}" }) }),
      /* @__PURE__ */ jsxs2("div", { className: "fp-grid2", children: [
        /* @__PURE__ */ jsx2(Field, { label: "System\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ jsx2("input", { value: step.system || "", onChange: (e) => onChange({ system: e.target.value }) }) }),
        /* @__PURE__ */ jsx2(Field, { label: "maxTokens", children: /* @__PURE__ */ jsx2("input", { type: "number", min: 16, max: 8192, value: step.maxTokens ?? 2048, onChange: (e) => onChange({ maxTokens: Number(e.target.value) }) }) })
      ] })
    ] }),
    t === "extract" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(Field, { label: "\u6765\u6E90 from", hint: "\u67D0\u4E2A\u524D\u7F6E\u6B65\u9AA4\u7684 saveAs \u540D", children: /* @__PURE__ */ jsx2("input", { value: step.from || "", onChange: (e) => onChange({ from: e.target.value }), placeholder: "resp" }) }),
      /* @__PURE__ */ jsx2(Field, { label: "\u63D0\u53D6\u8DEF\u5F84\uFF08JSON\uFF1A\u8F93\u51FA\u540D: \u8DEF\u5F84\uFF09", hint: "\u8DEF\u5F84\u652F\u6301 a.b.0 / items[*].id / list[?status=open]", children: /* @__PURE__ */ jsx2("textarea", { rows: 3, value: jsonText(step.paths), onChange: (e) => {
        try {
          onChange({ paths: e.target.value.trim() ? JSON.parse(e.target.value) : {} });
        } catch (_) {
        }
      } }) })
    ] }),
    t === "template" && /* @__PURE__ */ jsx2(Field, { label: "\u6A21\u677F\u6587\u672C", hint: "\u6574\u4E32 {{var}} \u4FDD\u7559\u539F\u7C7B\u578B\uFF1B\u5D4C\u5165\u6587\u672C\u4F1A\u5B57\u7B26\u4E32\u5316", children: /* @__PURE__ */ jsx2("textarea", { rows: 4, value: step.text || "", onChange: (e) => onChange({ text: e.target.value }), placeholder: "\u4ECA\u65E5\u6570\u636E\uFF1A{{resp.json}}\n\u65E5\u671F\uFF1A{{env.today}}" }) }),
    t === "script" && /* @__PURE__ */ jsx2(Field, { label: "JS \u7247\u6BB5\uFF08vm \u6C99\u7BB1\uFF0C2s \u8D85\u65F6\uFF1B\u53EF\u7528 vars/params/steps\uFF0C\u6700\u540E return\uFF09", children: /* @__PURE__ */ jsx2("textarea", { rows: 5, value: step.code || "", onChange: (e) => onChange({ code: e.target.value }), placeholder: "const n = (steps.resp && steps.resp.json && steps.resp.json.count) || 0\nreturn { count: n, flag: n > 10 }" }) }),
    t === "kv" && /* @__PURE__ */ jsxs2("div", { className: "fp-grid3", children: [
      /* @__PURE__ */ jsx2(Field, { label: "action", children: /* @__PURE__ */ jsxs2("select", { value: step.action || "get", onChange: (e) => onChange({ action: e.target.value }), children: [
        /* @__PURE__ */ jsx2("option", { value: "get", children: "get" }),
        /* @__PURE__ */ jsx2("option", { value: "set", children: "set" }),
        /* @__PURE__ */ jsx2("option", { value: "del", children: "del" })
      ] }) }),
      /* @__PURE__ */ jsx2(Field, { label: "key", children: /* @__PURE__ */ jsx2("input", { value: step.key || "", onChange: (e) => onChange({ key: e.target.value }), placeholder: "flowpipe \u547D\u540D\u7A7A\u95F4\u5916\u7684\u952E\u8BF7\u81EA\u62C5\u51B2\u7A81" }) }),
      step.action !== "get" && step.action !== "del" && /* @__PURE__ */ jsx2(Field, { label: "value", children: /* @__PURE__ */ jsx2("input", { value: typeof step.value === "string" ? step.value : jsonText(step.value), onChange: (e) => onChange({ value: e.target.value }) }) })
    ] }),
    t === "file" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "fp-grid3", children: [
        /* @__PURE__ */ jsx2(Field, { label: "action", children: /* @__PURE__ */ jsxs2("select", { value: step.action || "write", onChange: (e) => onChange({ action: e.target.value }), children: [
          /* @__PURE__ */ jsx2("option", { value: "write", children: "write" }),
          /* @__PURE__ */ jsx2("option", { value: "append", children: "append" })
        ] }) }),
        /* @__PURE__ */ jsx2("div", { style: { gridColumn: "span 2" }, children: /* @__PURE__ */ jsx2(Field, { label: "\u8DEF\u5F84", hint: "\u767D\u540D\u5355\uFF1A\u9762\u677F\u8F93\u51FA\u76EE\u5F55 / \u684C\u9762 / \u4E34\u65F6\u76EE\u5F55\uFF1B\u76F8\u5BF9\u8DEF\u5F84\u9ED8\u8BA4\u843D\u8F93\u51FA\u76EE\u5F55", children: /* @__PURE__ */ jsx2("input", { value: step.path || "", onChange: (e) => onChange({ path: e.target.value }), placeholder: "reports/daily-{{env.today}}.md" }) }) })
      ] }),
      /* @__PURE__ */ jsx2(Field, { label: "\u5185\u5BB9", hint: "\u5B57\u7B26\u4E32\u539F\u6837\uFF1B\u5BF9\u8C61\u81EA\u52A8 JSON \u7F8E\u5316\uFF1B\u652F\u6301 {{\u5360\u4F4D\u7B26}}", children: /* @__PURE__ */ jsx2("textarea", { rows: 4, value: typeof step.content === "string" ? step.content : jsonText(step.content), onChange: (e) => onChange({ content: e.target.value }) }) })
    ] }),
    t === "notify" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(Field, { label: "Webhook URL", hint: "\u9489\u9489/\u4F01\u5FAE/\u98DE\u4E66/Bark \u673A\u5668\u4EBA\u5730\u5740", children: /* @__PURE__ */ jsx2("input", { value: step.url || "", onChange: (e) => onChange({ url: e.target.value }), placeholder: "https://oapi.dingtalk.com/robot/send?access_token=..." }) }),
      /* @__PURE__ */ jsx2(Field, { label: "payload\uFF08JSON\uFF09", hint: "\u9489\u9489: {msgtype:'text',text:{content:'...'}}", children: /* @__PURE__ */ jsx2("textarea", { rows: 3, value: jsonText(step.payload), onChange: (e) => {
        try {
          onChange({ payload: e.target.value.trim() ? JSON.parse(e.target.value) : void 0 });
        } catch (_) {
        }
      } }) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "fp-grid2", children: [
      /* @__PURE__ */ jsx2(Field, { label: "\u8F93\u51FA\u4FDD\u5B58\u4E3A saveAs", hint: "\u540E\u7EED\u6B65\u9AA4\u7528 {{\u8FD9\u4E2A\u540D\u5B57}} \u5F15\u7528", children: /* @__PURE__ */ jsx2("input", { value: step.saveAs || "", onChange: (e) => onChange({ saveAs: e.target.value }), placeholder: "resp" }) }),
      /* @__PURE__ */ jsx2(Field, { label: "\u6267\u884C\u95E8\u63A7 when\uFF08\u53EF\u9009\uFF09", hint: "\u5982 {{resp.ok}} == false", children: /* @__PURE__ */ jsx2("input", { value: step.when || "", onChange: (e) => onChange({ when: e.target.value }), placeholder: "\u7559\u7A7A = \u603B\u662F\u6267\u884C" }) })
    ] }),
    step.saveAs === MASK && /* @__PURE__ */ jsx2("div", { className: "fp-err", children: "saveAs \u4E0D\u5141\u8BB8\u4F7F\u7528\u4FDD\u7559\u5B57" })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var PLUGIN_ID = "flow-pipeline";
var SERVICE_ID = "flow-pipeline-service";
function Panel({ pluginId, onSendToChat }) {
  const [svcDown, setSvcDown] = useState(null);
  const [degraded, setDegraded] = useState(false);
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("def");
  const [draft, setDraft] = useState(null);
  const [savedDef, setSavedDef] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [runs, setRuns] = useState([]);
  const [openRun, setOpenRun] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [banner, setBanner] = useState(null);
  const [runParams, setRunParams] = useState("{}");
  const [confirmDelete, setConfirmDelete] = useState("");
  const pollRef = useRef(null);
  const refreshList = useCallback(async (keepSelection = true) => {
    try {
      const r = await api.listPipelines();
      setList(r.pipelines);
      setDegraded(Boolean(r.degraded));
      setSvcDown(null);
      setSelectedId((cur) => {
        if (keepSelection && cur && r.pipelines.some((p) => p.id === cur)) return cur;
        return r.pipelines.length ? r.pipelines[0].id : null;
      });
    } catch (e) {
      setSvcDown(e.message);
    }
  }, []);
  const loadPipeline = useCallback(async (id) => {
    try {
      const r = await api.getPipeline(id);
      setSavedDef(r.pipeline);
      setDraft(JSON.parse(JSON.stringify(r.pipeline)));
      setDirty(false);
      setRuns(r.runs || []);
      setTab("def");
      setOpenRun(null);
      setConfirmDelete("");
    } catch (e) {
      setBanner({ kind: "err", text: e.message });
    }
  }, []);
  const refreshRuns = useCallback(async (plId) => {
    try {
      const r = await api.listRuns(plId, 15);
      setRuns(r.runs || []);
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    refreshList(false);
  }, [refreshList]);
  useEffect(() => {
    if (selectedId) loadPipeline(selectedId);
  }, [selectedId, loadPipeline]);
  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {
    });
  }, [svcDown]);
  const activeRun = runs.find((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!selectedId) return;
    if (activeRun || tab === "runs" && runs.length === 0) {
      pollRef.current = window.setTimeout(() => refreshRuns(selectedId), 1200);
    }
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeRun, selectedId, tab, runs.length, refreshRuns]);
  function patchDraft(patch) {
    setDraft((d) => d ? { ...d, ...patch } : d);
    setDirty(true);
  }
  function patchStep(i, patch) {
    setDraft((d) => {
      if (!d) return d;
      const steps = d.steps.map((s, j) => j === i ? { ...s, ...patch } : s);
      return { ...d, steps };
    });
    setDirty(true);
  }
  function moveStep(i, dir) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, steps };
    });
    setDirty(true);
  }
  async function saveDraft() {
    if (!draft) return;
    try {
      const clean = JSON.parse(JSON.stringify(draft));
      if (clean.id) {
        const r = await api.updatePipeline(clean.id, clean);
        setSavedDef(r.pipeline);
        setDraft(JSON.parse(JSON.stringify(r.pipeline)));
      } else {
        const r = await api.createPipeline(clean);
        setSavedDef(r.pipeline);
        setDraft(JSON.parse(JSON.stringify(r.pipeline)));
      }
      setDirty(false);
      setBanner({ kind: "ok", text: "\u5DF2\u4FDD\u5B58" });
      refreshList();
      window.setTimeout(() => setBanner(null), 1800);
    } catch (e) {
      setBanner({ kind: "err", text: e.message });
    }
  }
  async function doDelete() {
    if (!draft?.id) return;
    if (confirmDelete !== draft.name) {
      setBanner({ kind: "err", text: `\u786E\u8BA4\u8BCD\u4E0D\u5339\u914D\uFF1A\u9700\u8F93\u5165\u6D41\u6C34\u7EBF\u540D\u79F0\u300C${draft.name}\u300D` });
      return;
    }
    try {
      await api.deletePipeline(draft.id, confirmDelete);
      setBanner({ kind: "ok", text: "\u5DF2\u5220\u9664" });
      setConfirmDelete("");
      setSelectedId(null);
      refreshList(false);
    } catch (e) {
      setBanner({ kind: "err", text: e.message });
    }
  }
  async function doRun() {
    if (!draft?.id) {
      setBanner({ kind: "err", text: "\u8BF7\u5148\u4FDD\u5B58\u6D41\u6C34\u7EBF\u518D\u8FD0\u884C" });
      return;
    }
    let params = {};
    try {
      params = JSON.parse(runParams || "{}");
    } catch (_) {
      setBanner({ kind: "err", text: "\u8FD0\u884C\u53C2\u6570\u4E0D\u662F\u5408\u6CD5 JSON" });
      return;
    }
    try {
      await api.runPipeline(draft.id, params);
      setTab("runs");
      refreshRuns(draft.id);
    } catch (e) {
      setBanner({ kind: "err", text: e.message });
    }
  }
  async function openRunDetail(runId) {
    try {
      const r = await api.getRun(runId);
      setOpenRun(r.run);
    } catch (e) {
      setBanner({ kind: "err", text: e.message });
    }
  }
  function newFromPreset(make) {
    setDraft(make());
    setSavedDef(null);
    setDirty(true);
    setShowNew(false);
  }
  const selected = list.find((p) => p.id === selectedId) || null;
  return /* @__PURE__ */ jsxs3("div", { className: "flowpipe-panel", children: [
    /* @__PURE__ */ jsx3(PanelStyle, {}),
    /* @__PURE__ */ jsxs3("div", { className: "fp-header", children: [
      /* @__PURE__ */ jsx3("span", { className: "fp-title", children: "\u81EA\u52A8\u5316\u6D41\u6C34\u7EBF" }),
      /* @__PURE__ */ jsx3(Dot, { color: svcDown ? "#F87171" : degraded ? "#FBBF24" : "#34D399" }),
      /* @__PURE__ */ jsx3("span", { className: "fp-muted", style: { fontSize: 11 }, children: svcDown ? "\u670D\u52A1\u672A\u8FDE\u63A5" : degraded ? "kv \u6865\u964D\u7EA7" : "\u670D\u52A1\u6B63\u5E38" }),
      /* @__PURE__ */ jsx3("button", { className: "small", onClick: async () => {
        try {
          const r = await api.selftest();
          setBanner({ kind: r.ok ? "ok" : "err", text: r.ok ? "\u81EA\u68C0\u5168\u90E8\u901A\u8FC7" : "\u81EA\u68C0\u5B58\u5728\u5931\u8D25\u9879\uFF08\u770B\u65E5\u5FD7\uFF09" });
        } catch (e) {
          setBanner({ kind: "err", text: e.message });
        }
        window.setTimeout(() => setBanner(null), 2500);
      }, children: "\u81EA\u68C0" }),
      /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => setShowSettings(true), children: "\u8BBE\u7F6E" }),
      /* @__PURE__ */ jsx3("button", { className: "small", onClick: async () => {
        try {
          await restartService(PLUGIN_ID, SERVICE_ID);
          invalidateMetaAndReload();
        } catch (e) {
          setBanner({ kind: "err", text: e.message });
        }
      }, children: "\u91CD\u542F\u670D\u52A1" })
    ] }),
    svcDown && /* @__PURE__ */ jsxs3("div", { style: { padding: "6px 12px", background: "#2A1B1E", borderBottom: "1px solid #7F1D1D", color: "#FCA5A5", fontSize: 12 }, children: [
      svcDown,
      /* @__PURE__ */ jsx3("button", { className: "small", style: { marginLeft: 8 }, onClick: () => {
        invalidateMetaAndReload();
        refreshList();
      }, children: "\u91CD\u8BD5" })
    ] }),
    banner && /* @__PURE__ */ jsx3("div", { style: { padding: "6px 12px", background: banner.kind === "err" ? "#2A1B1E" : "#12291D", borderBottom: `1px solid ${banner.kind === "err" ? "#7F1D1D" : "#14532D"}`, color: banner.kind === "err" ? "#FCA5A5" : "#6EE7B7", fontSize: 12 }, children: banner.text }),
    /* @__PURE__ */ jsxs3("div", { className: "fp-body", children: [
      /* @__PURE__ */ jsxs3("div", { className: "fp-side", children: [
        /* @__PURE__ */ jsx3("div", { style: { padding: 8, borderBottom: "1px solid #2A2F36", display: "flex", gap: 6 }, children: /* @__PURE__ */ jsx3("button", { className: "primary", style: { flex: 1 }, onClick: () => setShowNew(true), children: "+ \u65B0\u5EFA" }) }),
        /* @__PURE__ */ jsxs3("div", { className: "fp-side-list", children: [
          list.length === 0 && !svcDown && /* @__PURE__ */ jsx3("div", { className: "fp-muted", style: { padding: 10, fontSize: 12 }, children: "\u8FD8\u6CA1\u6709\u6D41\u6C34\u7EBF\u3002\u70B9\u300C+ \u65B0\u5EFA\u300D\u4ECE\u6A21\u677F\u5F00\u59CB\uFF0C\u6216\u76F4\u63A5\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u5EFA\u4E00\u6761\u6D41\u6C34\u7EBF\u2026\u300D\u3002" }),
          list.map((p) => /* @__PURE__ */ jsxs3("div", { className: `fp-pl-item ${p.id === selectedId ? "active" : ""}`, onClick: () => setSelectedId(p.id), children: [
            /* @__PURE__ */ jsxs3("div", { className: "fp-pl-name", children: [
              /* @__PURE__ */ jsx3(Dot, { color: p.lastRun ? statusColor(p.lastRun.status) : "#4B5563" }),
              /* @__PURE__ */ jsx3("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: p.name }),
              /* @__PURE__ */ jsx3("span", { className: `fp-chip ${p.enabled ? "on" : ""}`, children: p.enabled ? "\u542F\u7528" : "\u505C\u7528" })
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "fp-pl-sub", children: [
              /* @__PURE__ */ jsx3("span", { children: triggerText(p.trigger) }),
              /* @__PURE__ */ jsxs3("span", { children: [
                p.steps,
                " \u6B65"
              ] }),
              p.lastRun && /* @__PURE__ */ jsx3("span", { style: { marginLeft: "auto" }, children: timeStr(p.lastRun.startedAt) })
            ] })
          ] }, p.id))
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "fp-main", children: !draft ? /* @__PURE__ */ jsxs3("div", { className: "fp-empty", children: [
        /* @__PURE__ */ jsx3("div", { style: { fontSize: 30 }, children: "\u26A1" }),
        /* @__PURE__ */ jsx3("div", { children: "\u9009\u4E2D\u5DE6\u4FA7\u6D41\u6C34\u7EBF\uFF0C\u6216\u65B0\u5EFA\u4E00\u6761" }),
        /* @__PURE__ */ jsxs3("div", { className: "fp-muted", style: { fontSize: 12 }, children: [
          "\u601D\u8DEF\uFF1A\u6293\u6570\u636E(HTTP) \u2192 \u63D0\u53D6(extract) \u2192 AI \u5206\u6790(ai) \u2192 \u843D\u76D8(file)/\u901A\u77E5(notify)",
          /* @__PURE__ */ jsx3("br", {}),
          "\u89E6\u53D1\uFF1A\u624B\u52A8 / \u6BCF N \u5206\u949F / \u6BCF\u5929 HH:MM / Webhook \u5165\u7AD9"
        ] }),
        onSendToChat && /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => onSendToChat("\u5E2E\u6211\u7528\u300C\u81EA\u52A8\u5316\u6D41\u6C34\u7EBF\u300D\u63D2\u4EF6\u5EFA\u4E00\u6761\u6D41\u6C34\u7EBF\uFF1A"), children: "\u8BA9 AI \u5E2E\u6211\u5EFA" })
      ] }) : /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3("div", { className: "fp-tabs", children: [
          /* @__PURE__ */ jsxs3("div", { className: `fp-tab ${tab === "def" ? "active" : ""}`, onClick: () => setTab("def"), children: [
            "\u6D41\u6C34\u7EBF\u5B9A\u4E49",
            dirty ? " \u25CF" : ""
          ] }),
          /* @__PURE__ */ jsx3("div", { className: `fp-tab ${tab === "runs" ? "active" : ""}`, onClick: () => {
            setTab("runs");
            if (draft.id) refreshRuns(draft.id);
          }, children: "\u8FD0\u884C\u8BB0\u5F55" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "fp-scroll", children: [
          tab === "def" && /* @__PURE__ */ jsx3(
            Definition,
            {
              draft,
              savedDef,
              settings,
              dirty,
              confirmDelete,
              setConfirmDelete,
              patchDraft,
              patchStep,
              moveStep,
              addStep: () => {
                patchDraft({ steps: [...draft.steps, { type: "http", name: `\u6B65\u9AA4 ${draft.steps.length + 1}` }] });
              },
              removeStep: (i) => {
                patchDraft({ steps: draft.steps.filter((_, j) => j !== i) });
              },
              saveDraft,
              doDelete
            }
          ),
          tab === "runs" && /* @__PURE__ */ jsx3(
            RunsTab,
            {
              draft,
              runs,
              openRun,
              runParams,
              setRunParams,
              setOpenRun,
              openRunDetail,
              doRun,
              stopRun: async (runId) => {
                try {
                  await api.stopRun(runId);
                  if (draft.id) refreshRuns(draft.id);
                } catch (e) {
                  setBanner({ kind: "err", text: e.message });
                }
              }
            }
          )
        ] })
      ] }) })
    ] }),
    showNew && /* @__PURE__ */ jsx3("div", { className: "fp-modal-mask", onClick: () => setShowNew(false), children: /* @__PURE__ */ jsxs3("div", { className: "fp-modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx3("div", { style: { fontWeight: 600, marginBottom: 10 }, children: "\u65B0\u5EFA\u6D41\u6C34\u7EBF" }),
      /* @__PURE__ */ jsx3("button", { style: { width: "100%", marginBottom: 6 }, onClick: () => newFromPreset(blankPipeline), children: "\u7A7A\u767D\u6D41\u6C34\u7EBF\uFF08\u542B\u793A\u4F8B HTTP \u6B65\u9AA4\uFF09" }),
      presets().map((p) => /* @__PURE__ */ jsxs3("button", { style: { width: "100%", marginBottom: 6 }, onClick: () => newFromPreset(p.make), children: [
        p.label,
        "\uFF08\u6A21\u677F\uFF09"
      ] }, p.label)),
      /* @__PURE__ */ jsx3("div", { className: "fp-muted", style: { fontSize: 12, marginTop: 6 }, children: "\u4E5F\u53EF\u4EE5\u5728\u804A\u5929\u91CC\u76F4\u63A5\u5BF9 AI \u8BF4\u9700\u6C42\uFF08AI \u4F1A\u7528 flow_save \u5E2E\u4F60\u5EFA\u597D\uFF09\u3002" })
    ] }) }),
    showSettings && settings && /* @__PURE__ */ jsx3(
      SettingsModal,
      {
        settings,
        onClose: () => setShowSettings(false),
        onSaved: (s) => {
          setSettings(s);
          refreshList();
        }
      }
    )
  ] });
}
function invalidateMetaAndReload() {
  Promise.resolve().then(() => (init_model(), model_exports)).then((m) => m.invalidateMeta());
}
function Definition({ draft, savedDef, settings, dirty, confirmDelete, setConfirmDelete, patchDraft, patchStep, moveStep, addStep, removeStep, saveDraft, doDelete }) {
  const varsEntries = Object.entries(draft.vars || {});
  const isWebhook = draft.trigger.type === "webhook";
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "fp-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "fp-grid3", children: [
        /* @__PURE__ */ jsx3("div", { style: { gridColumn: "span 2" }, children: /* @__PURE__ */ jsx3(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ jsx3("input", { value: draft.name, onChange: (e) => patchDraft({ name: e.target.value }) }) }) }),
        /* @__PURE__ */ jsx3(Field, { label: "\u542F\u7528", children: /* @__PURE__ */ jsxs3("select", { value: draft.enabled ? "1" : "0", onChange: (e) => patchDraft({ enabled: e.target.value === "1" }), children: [
          /* @__PURE__ */ jsx3("option", { value: "1", children: "\u542F\u7528" }),
          /* @__PURE__ */ jsx3("option", { value: "0", children: "\u505C\u7528" })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fp-grid3", children: [
        /* @__PURE__ */ jsx3(Field, { label: "\u89E6\u53D1\u65B9\u5F0F", children: /* @__PURE__ */ jsxs3("select", { value: draft.trigger.type, onChange: (e) => {
          const type = e.target.value;
          const tg = { type };
          if (type === "interval") tg.everyMinutes = 30;
          if (type === "daily") tg.at = "08:30";
          patchDraft({ trigger: tg });
        }, children: [
          /* @__PURE__ */ jsx3("option", { value: "manual", children: "\u624B\u52A8" }),
          /* @__PURE__ */ jsx3("option", { value: "interval", children: "\u95F4\u9694\uFF08\u5206\u949F\uFF09" }),
          /* @__PURE__ */ jsx3("option", { value: "daily", children: "\u6BCF\u5929\u5B9A\u65F6" }),
          /* @__PURE__ */ jsx3("option", { value: "webhook", children: "Webhook \u5165\u7AD9" })
        ] }) }),
        draft.trigger.type === "interval" && /* @__PURE__ */ jsx3(Field, { label: "\u95F4\u9694\u5206\u949F\uFF08\u22655\uFF09", children: /* @__PURE__ */ jsx3(
          "input",
          {
            type: "number",
            min: 5,
            max: 10080,
            value: draft.trigger.everyMinutes ?? 30,
            onChange: (e) => patchDraft({ trigger: { type: "interval", everyMinutes: Number(e.target.value) } })
          }
        ) }),
        draft.trigger.type === "daily" && /* @__PURE__ */ jsx3(Field, { label: "\u65F6\u95F4 HH:MM", children: /* @__PURE__ */ jsx3("input", { value: draft.trigger.at ?? "08:30", onChange: (e) => patchDraft({ trigger: { type: "daily", at: e.target.value } }), placeholder: "08:30" }) }),
        /* @__PURE__ */ jsx3(Field, { label: "\u5141\u8BB8\u672C\u673A/\u5185\u7F51\u76EE\u6807", children: /* @__PURE__ */ jsxs3("select", { value: draft.allowLocal ? "1" : "0", onChange: (e) => patchDraft({ allowLocal: e.target.value === "1" }), children: [
          /* @__PURE__ */ jsx3("option", { value: "0", children: "\u7981\u6B62\uFF08\u9ED8\u8BA4\uFF0C\u5B89\u5168\uFF09" }),
          /* @__PURE__ */ jsx3("option", { value: "1", children: "\u5141\u8BB8\uFF08\u672C\u5730\u8054\u8C03\uFF09" })
        ] }) })
      ] }),
      isWebhook && /* @__PURE__ */ jsxs3("div", { className: "fp-muted", style: { fontSize: 12 }, children: [
        "\u4FDD\u5B58\u540E webhook \u5165\u53E3\uFF1A",
        /* @__PURE__ */ jsxs3("code", { className: "fp-mono", children: [
          "POST /hook/",
          draft.id || "<\u4FDD\u5B58\u540E\u751F\u6210>"
        ] }),
        "\uFF0C\u5934 ",
        /* @__PURE__ */ jsxs3("code", { className: "fp-mono", children: [
          "X-FlowPipe-Token: ",
          draft.trigger.token ? "(\u5DF2\u751F\u6210\uFF0C\u5220\u9664\u91CD\u5EFA\u624D\u4F1A\u66F4\u6362)" : "(\u4FDD\u5B58\u540E\u751F\u6210)"
        ] }),
        "\uFF1BPOST body \u4F1A\u6CE8\u5165\u4E3A ",
        /* @__PURE__ */ jsx3("code", { className: "fp-mono", children: "{{params.body}}" }),
        "\uFF0Cquery \u4E3A ",
        /* @__PURE__ */ jsx3("code", { className: "fp-mono", children: "{{params.query}}" }),
        "\u3002"
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "fp-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "fp-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx3("b", { style: { fontSize: 12 }, children: "\u53D8\u91CF vars" }),
        /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => patchDraft({ vars: { ...draft.vars || {}, [`var${varsEntries.length + 1}`]: "" } }), children: "+ \u53D8\u91CF" })
      ] }),
      varsEntries.length === 0 && /* @__PURE__ */ jsxs3("div", { className: "fp-muted", style: { fontSize: 12 }, children: [
        "\u6CA1\u6709\u53D8\u91CF\u3002\u53D8\u91CF\u5728\u6B65\u9AA4\u91CC\u7528 ",
        /* @__PURE__ */ jsx3("code", { children: "{{\u540D\u5B57}}" }),
        " \u5F15\u7528\u3002"
      ] }),
      varsEntries.map(([k, v]) => {
        const isSecret = (draft.secrets || []).includes(k);
        return /* @__PURE__ */ jsxs3("div", { className: "fp-kv-row", children: [
          /* @__PURE__ */ jsx3("input", { value: k, onChange: (e) => {
            const next = { ...draft.vars || {} };
            delete next[k];
            next[e.target.value] = v;
            const secrets = (draft.secrets || []).map((s) => s === k ? e.target.value : s);
            patchDraft({ vars: next, secrets });
          } }),
          /* @__PURE__ */ jsx3("input", { value: String(v), onChange: (e) => patchDraft({ vars: { ...draft.vars || {}, [k]: e.target.value } }) }),
          /* @__PURE__ */ jsxs3("select", { value: isSecret ? "1" : "0", onChange: (e) => {
            const set = new Set(draft.secrets || []);
            if (e.target.value === "1") set.add(k);
            else set.delete(k);
            patchDraft({ secrets: [...set] });
          }, children: [
            /* @__PURE__ */ jsx3("option", { value: "0", children: "\u660E\u6587" }),
            /* @__PURE__ */ jsx3("option", { value: "1", children: "\u654F\u611F" })
          ] }),
          /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => {
            const next = { ...draft.vars || {} };
            delete next[k];
            patchDraft({ vars: next, secrets: (draft.secrets || []).filter((s) => s !== k) });
          }, children: "\xD7" })
        ] }, k);
      }),
      /* @__PURE__ */ jsx3("div", { className: "fp-muted", style: { fontSize: 11 }, children: "\u300C\u654F\u611F\u300D\u53D8\u91CF\u7684\u503C\u51FA\u53E3\u4E00\u5F8B\u63A9\u7801\uFF08\u524D4***\u540E2\uFF09\uFF0C\u8FD0\u884C\u6458\u8981/AI \u8FD4\u56DE\u90FD\u4E0D\u51FA\u73B0\u539F\u6587\u3002" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "fp-row", style: { justifyContent: "space-between", marginBottom: 6 }, children: [
      /* @__PURE__ */ jsxs3("b", { style: { fontSize: 12 }, children: [
        "\u6B65\u9AA4\uFF08",
        draft.steps.length,
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "small primary", onClick: addStep, children: "+ \u6B65\u9AA4" })
    ] }),
    draft.steps.map((s, i) => /* @__PURE__ */ jsxs3("div", { className: "fp-step", children: [
      /* @__PURE__ */ jsxs3("div", { className: "fp-step-head", children: [
        /* @__PURE__ */ jsx3("span", { className: "fp-step-idx", children: i + 1 }),
        /* @__PURE__ */ jsx3("span", { style: { fontSize: 12, flex: 1 }, children: s.name || s.type }),
        /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => moveStep(i, -1), disabled: i === 0, children: "\u2191" }),
        /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => moveStep(i, 1), disabled: i === draft.steps.length - 1, children: "\u2193" }),
        /* @__PURE__ */ jsx3("button", { className: "small danger", onClick: () => removeStep(i), children: "\u5220" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "fp-step-body", children: /* @__PURE__ */ jsx3(StepForm, { step: s, onChange: (p) => patchStep(i, p), providers: settings?.providers || [], allowLocal: Boolean(draft.allowLocal) }) })
    ] }, i)),
    /* @__PURE__ */ jsxs3("div", { className: "fp-row", style: { marginTop: 10 }, children: [
      /* @__PURE__ */ jsx3("button", { className: "primary", onClick: saveDraft, disabled: !dirty, children: dirty ? "\u4FDD\u5B58\u4FEE\u6539" : "\u5DF2\u4FDD\u5B58" }),
      savedDef?.id && /* @__PURE__ */ jsxs3("span", { className: "fp-muted", style: { fontSize: 11 }, children: [
        "id=",
        savedDef.id
      ] })
    ] }),
    savedDef?.id && /* @__PURE__ */ jsx3("div", { className: "fp-card", style: { marginTop: 12, borderColor: "#7F1D1D" }, children: /* @__PURE__ */ jsxs3("div", { className: "fp-row", children: [
      /* @__PURE__ */ jsx3("input", { style: { flex: 1 }, value: confirmDelete, onChange: (e) => setConfirmDelete(e.target.value), placeholder: `\u8F93\u5165\u300C${draft.name}\u300D\u786E\u8BA4\u5220\u9664` }),
      /* @__PURE__ */ jsx3("button", { className: "danger", onClick: doDelete, disabled: confirmDelete !== draft.name, children: "\u5220\u9664\u6D41\u6C34\u7EBF" })
    ] }) })
  ] });
}
function RunsTab({ draft, runs, openRun, runParams, setRunParams, setOpenRun, openRunDetail, doRun, stopRun }) {
  const activeRun = runs.find((r) => r.status === "queued" || r.status === "running");
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "fp-card", children: [
      /* @__PURE__ */ jsx3(Field, { label: "\u8FD0\u884C\u53C2\u6570 params\uFF08JSON\uFF0C\u53EF\u9009\uFF09", hint: "\u6B65\u9AA4\u91CC\u7528 {{params.xxx}} \u5F15\u7528", children: /* @__PURE__ */ jsx3("textarea", { rows: 2, value: runParams, onChange: (e) => setRunParams(e.target.value), placeholder: '{"query": {"date": "today"}}' }) }),
      /* @__PURE__ */ jsxs3("div", { className: "fp-row", children: [
        /* @__PURE__ */ jsx3("button", { className: "primary", onClick: doRun, children: "\u25B6 \u7ACB\u5373\u8FD0\u884C" }),
        activeRun && /* @__PURE__ */ jsx3("button", { onClick: () => stopRun(activeRun.id), children: "\u25A0 \u505C\u6B62" }),
        /* @__PURE__ */ jsx3("span", { className: "fp-muted", style: { fontSize: 11 }, children: draft.id ? "" : "\u672A\u4FDD\u5B58\u7684\u6D41\u6C34\u7EBF\u4E0D\u80FD\u8FD0\u884C" })
      ] })
    ] }),
    runs.length === 0 && /* @__PURE__ */ jsx3("div", { className: "fp-muted", style: { padding: 10 }, children: "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55\u3002" }),
    runs.map((r) => /* @__PURE__ */ jsxs3("div", { className: `fp-run-item ${openRun?.id === r.id ? "active" : ""}`, onClick: () => openRun?.id === r.id ? setOpenRun(null) : openRunDetail(r.id), children: [
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsx3(Dot, { color: statusColor(r.status) }),
        /* @__PURE__ */ jsx3("b", { style: { fontSize: 12 }, children: r.status }),
        /* @__PURE__ */ jsxs3("span", { className: "fp-muted", style: { fontSize: 11 }, children: [
          timeStr(r.startedAt),
          " \xB7 ",
          r.trigger,
          r.missed ? "\uFF08\u8865\u8DD1\uFF09" : "",
          " \xB7 ",
          durStr(r.durationMs)
        ] })
      ] }),
      r.error && /* @__PURE__ */ jsx3("div", { className: "fp-err", style: { fontSize: 11, marginTop: 3 }, children: r.error })
    ] }, r.id)),
    openRun && /* @__PURE__ */ jsxs3("div", { className: "fp-card", style: { marginTop: 10 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "fp-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsxs3("b", { style: { fontSize: 12 }, children: [
          "\u8FD0\u884C\u8BE6\u60C5 ",
          openRun.id
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => setOpenRun(null), children: "\u6536\u8D77" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "fp-timeline", children: (openRun.steps || []).map((st, i) => /* @__PURE__ */ jsxs3("div", { className: `fp-tl-item ${st.status}`, children: [
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx3("b", { style: { fontSize: 12 }, children: st.name }),
          /* @__PURE__ */ jsx3("span", { className: "fp-chip", children: st.type }),
          /* @__PURE__ */ jsx3("span", { className: `fp-chip ${st.status === "ok" ? "on" : st.status === "error" ? "err" : ""}`, children: st.status }),
          /* @__PURE__ */ jsx3("span", { className: "fp-muted", style: { fontSize: 11, marginLeft: "auto" }, children: durStr(st.durationMs) })
        ] }),
        st.error && /* @__PURE__ */ jsx3("div", { className: "fp-err", style: { fontSize: 11 }, children: st.error }),
        st.excerpt && /* @__PURE__ */ jsx3("div", { className: "fp-excerpt", children: st.excerpt }),
        (st.warnings || []).map((w, j) => /* @__PURE__ */ jsxs3("div", { className: "fp-muted", style: { fontSize: 11 }, children: [
          "\u26A0 ",
          w
        ] }, j))
      ] }, i)) })
    ] })
  ] });
}
function SettingsModal({ settings, onClose, onSaved }) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(settings)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function importHost(dryRun) {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.importHost(dryRun);
      if (dryRun) {
        setMsg(`\u5BBF\u4E3B\u53D1\u73B0 ${r.imported} \u4E2A\u4F9B\u5E94\u5546\uFF08\u9884\u89C8\uFF09\uFF1A${(r.preview || []).map((p) => p.name).join("\u3001") || "\u65E0"}. \u518D\u70B9\u300C\u5BFC\u5165\u300D\u843D\u5E93`);
      } else {
        setMsg(`\u5DF2\u5BFC\u5165 ${r.imported} \u4E2A\u4F9B\u5E94\u5546`);
        const s = await api.getSettings();
        setLocal(s.settings);
        onSaved(s.settings);
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api.saveSettings(local);
      onSaved(r.settings);
      setMsg("\u5DF2\u4FDD\u5B58");
      window.setTimeout(onClose, 500);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsx3("div", { className: "fp-modal-mask", onClick: onClose, children: /* @__PURE__ */ jsxs3("div", { className: "fp-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs3("div", { className: "fp-row", style: { justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsx3("b", { children: "\u8BBE\u7F6E" }),
      /* @__PURE__ */ jsx3("button", { className: "small", onClick: onClose, children: "\xD7" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "fp-field", children: [
      /* @__PURE__ */ jsx3("span", { className: "fp-label", children: "AI \u8D85\u65F6\uFF08\u79D2\uFF0C5-600\uFF09" }),
      /* @__PURE__ */ jsx3("input", { type: "number", min: 5, max: 600, value: local.aiTimeoutSec, onChange: (e) => setLocal({ ...local, aiTimeoutSec: Number(e.target.value) }) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "fp-field", children: [
      /* @__PURE__ */ jsx3("span", { className: "fp-label", children: "Webhook \u89E6\u53D1\u603B\u5F00\u5173" }),
      /* @__PURE__ */ jsxs3("select", { value: local.webhookEnabled ? "1" : "0", onChange: (e) => setLocal({ ...local, webhookEnabled: e.target.value === "1" }), children: [
        /* @__PURE__ */ jsx3("option", { value: "1", children: "\u5F00\u542F" }),
        /* @__PURE__ */ jsx3("option", { value: "0", children: "\u5173\u95ED\uFF08/hook \u4E00\u5F8B 409\uFF09" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "fp-row", style: { justifyContent: "space-between", marginTop: 10 }, children: [
      /* @__PURE__ */ jsxs3("b", { style: { fontSize: 12 }, children: [
        "AI \u4F9B\u5E94\u5546\uFF08",
        local.providers.length,
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsxs3("span", { children: [
        /* @__PURE__ */ jsx3("button", { className: "small", disabled: busy, onClick: () => importHost(true), children: "\u4ECE\u5BBF\u4E3B\u53D1\u73B0" }),
        " ",
        /* @__PURE__ */ jsx3("button", { className: "small primary", disabled: busy, onClick: () => importHost(false), children: "\u5BFC\u5165\u5BBF\u4E3B\u4F9B\u5E94\u5546" })
      ] })
    ] }),
    local.providers.map((p, i) => /* @__PURE__ */ jsxs3("div", { style: { border: "1px solid #2A2F36", borderRadius: 8, padding: 8, marginBottom: 6 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "fp-grid2", children: [
        /* @__PURE__ */ jsx3(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ jsx3("input", { value: p.name, onChange: (e) => {
          const ps = [...local.providers];
          ps[i] = { ...p, name: e.target.value };
          setLocal({ ...local, providers: ps });
        } }) }),
        /* @__PURE__ */ jsx3(Field, { label: "\u6A21\u578B", children: /* @__PURE__ */ jsx3("input", { value: p.model, onChange: (e) => {
          const ps = [...local.providers];
          ps[i] = { ...p, model: e.target.value };
          setLocal({ ...local, providers: ps });
        } }) })
      ] }),
      /* @__PURE__ */ jsx3(Field, { label: "baseUrl", children: /* @__PURE__ */ jsx3("input", { value: p.baseUrl, onChange: (e) => {
        const ps = [...local.providers];
        ps[i] = { ...p, baseUrl: e.target.value };
        setLocal({ ...local, providers: ps });
      } }) }),
      /* @__PURE__ */ jsxs3("div", { className: "fp-grid2", children: [
        /* @__PURE__ */ jsx3(Field, { label: "apiKey\uFF08\u5DF2\u63A9\u7801\uFF0C\u539F\u6837\u4FDD\u5B58=\u4E0D\u6539\u52A8\uFF09", children: /* @__PURE__ */ jsx3("input", { value: p.apiKey, onChange: (e) => {
          const ps = [...local.providers];
          ps[i] = { ...p, apiKey: e.target.value };
          setLocal({ ...local, providers: ps });
        } }) }),
        /* @__PURE__ */ jsx3(Field, { label: "\u534F\u8BAE", children: /* @__PURE__ */ jsxs3("select", { value: p.wire || "openai-chat-completions", onChange: (e) => {
          const ps = [...local.providers];
          ps[i] = { ...p, wire: e.target.value };
          setLocal({ ...local, providers: ps });
        }, children: [
          /* @__PURE__ */ jsx3("option", { value: "openai-chat-completions", children: "OpenAI \u517C\u5BB9" }),
          /* @__PURE__ */ jsx3("option", { value: "anthropic-messages", children: "Anthropic Messages" })
        ] }) })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { textAlign: "right" }, children: /* @__PURE__ */ jsx3("button", { className: "small danger", onClick: () => setLocal({ ...local, providers: local.providers.filter((_, j) => j !== i) }), children: "\u5220\u9664" }) })
    ] }, p.id)),
    /* @__PURE__ */ jsx3("button", { className: "small", onClick: () => setLocal({
      ...local,
      providers: [...local.providers, { id: `prov_${Math.random().toString(16).slice(2, 10)}`, name: "\u65B0\u4F9B\u5E94\u5546", baseUrl: "", apiKey: "", model: "", wire: "openai-chat-completions" }]
    }), children: "+ \u624B\u52A8\u6DFB\u52A0\u4F9B\u5E94\u5546" }),
    msg && /* @__PURE__ */ jsx3("div", { className: "fp-muted", style: { marginTop: 8, fontSize: 12 }, children: msg }),
    /* @__PURE__ */ jsx3("div", { className: "fp-row", style: { marginTop: 10, justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx3("button", { className: "primary", disabled: busy, onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
  ] }) });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
