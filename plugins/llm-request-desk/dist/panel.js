// src/Panel.tsx
import { useCallback, useEffect, useState as useState5 } from "react";

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}

// src/model.ts
var K = {
  meta: "llmdesk.meta",
  endpoints: "llmdesk.endpoints",
  latest: "llmdesk.latest",
  history: "llmdesk.history",
  settings: "llmdesk.settings",
  cmd: "llmdesk.cmd",
  res: "llmdesk.res",
  req: (id) => `llmdesk.req.${id}`
};
async function kvGet(key) {
  const invoke = getHostInvoke();
  const r = await invoke("router_dispatch", {
    target: "cap.kv",
    payload: { action: "get", key }
  });
  if (r && r.ok && r.result && r.result.value !== void 0 && r.result.value !== null) return r.result.value;
  return null;
}
async function kvSet(key, value) {
  const invoke = getHostInvoke();
  const r = await invoke("router_dispatch", {
    target: "cap.kv",
    payload: { action: "set", key, value }
  });
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : "cap.kv set \u5931\u8D25");
}
async function kvDel(key) {
  const invoke = getHostInvoke();
  await invoke("router_dispatch", { target: "cap.kv", payload: { action: "delete", key } }).catch(() => void 0);
}
var loadMeta = () => kvGet(K.meta);
var loadEndpoints = () => kvGet(K.endpoints);
var loadHistory = () => kvGet(K.history);
var loadReq = (id) => kvGet(K.req(id));
function normalizeHistory(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.items)) return v.items;
  return [];
}
var nonceSeq = 0;
async function sendCommand(action, payload, waitMs = 18e4) {
  const nonce = `p${Date.now().toString(36)}-${++nonceSeq}`;
  await kvSet(K.cmd, { nonce, action, payload, at: (/* @__PURE__ */ new Date()).toISOString() });
  if (waitMs === 0) return { ok: true, pending: true };
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(1e3);
    const res = await kvGet(K.res);
    if (res && res.nonce === nonce) {
      await kvDel(K.res);
      return res.result || { ok: false, error: "\u56DE\u6267\u4E3A\u7A7A" };
    }
  }
  return { ok: false, pending: true, error: `\u547D\u4EE4\u5DF2\u6295\u9012\uFF0C${Math.round(waitMs / 1e3)}s \u5185\u672A\u89C1\u56DE\u6267\uFF08\u8BF7\u6C42\u53EF\u80FD\u4ECD\u5728\u8FDB\u884C\uFF0C\u7A0D\u540E\u5230\u300C\u5386\u53F2\u300D\u9875\u67E5\u770B\uFF09` };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function fmtMs(ms) {
  if (ms == null) return "\u2014";
  if (ms >= 1e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
function fmtTime(iso) {
  if (!iso) return "\u2014";
  return String(iso).replace("T", " ").slice(5, 16);
}
var SEVERITY_COLOR = {
  error: "#F85149",
  warn: "#D29922",
  info: "#58A6FF"
};
var SEVERITY_LABEL = { error: "\u9519\u8BEF", warn: "\u8B66\u544A", info: "\u63D0\u793A" };

// src/RequestTab.tsx
import { useMemo, useState as useState2 } from "react";

// src/ResponseView.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var S = {
  card: { border: "1px solid #30363D", borderRadius: 8, padding: 10, marginBottom: 8, background: "rgba(110,118,129,0.08)" },
  mono: { fontFamily: "Consolas, Monaco, monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" },
  muted: { color: "#8B949E", fontSize: 12 },
  pre: { background: "rgba(0,0,0,0.25)", border: "1px solid #30363D", borderRadius: 6, padding: 8, margin: "6px 0 0", maxHeight: 320, overflow: "auto" }
};
function statusColor(rec) {
  if (rec.error) return "#F85149";
  if (rec.streamInfo && rec.streamInfo.sawError) return "#F85149";
  return rec.ok ? "#3FB950" : "#F85149";
}
function FindingsList({ findings }) {
  const [showInfo, setShowInfo] = useState(false);
  if (!findings || !findings.length) return null;
  const major = findings.filter((f) => f.severity !== "info");
  const infos = findings.filter((f) => f.severity === "info");
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
    major.map((f, i) => /* @__PURE__ */ jsxs("div", { style: { ...S.card, borderLeft: `3px solid ${SEVERITY_COLOR[f.severity]}`, marginBottom: 6 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontWeight: 600, fontSize: 13, color: SEVERITY_COLOR[f.severity] }, children: [
        SEVERITY_LABEL[f.severity],
        " \xB7 ",
        f.title
      ] }),
      /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 4, lineHeight: 1.5 }, children: f.detail }),
      f.fix ? /* @__PURE__ */ jsxs("div", { style: { ...S.muted, marginTop: 4, color: "#7EE787" }, children: [
        "\u2192 ",
        f.fix
      ] }) : null
    ] }, `${f.id}-${i}`)),
    infos.length ? /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setShowInfo(!showInfo),
          style: { background: "none", border: "none", color: "#58A6FF", cursor: "pointer", fontSize: 12, padding: "2px 0" },
          children: [
            showInfo ? "\u25BE" : "\u25B8",
            " ",
            infos.length,
            " \u6761\u63D0\u793A"
          ]
        }
      ),
      showInfo ? infos.map((f, i) => /* @__PURE__ */ jsxs("div", { style: { ...S.card, borderLeft: "3px solid #58A6FF", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 13, color: "#58A6FF" }, children: [
          "\u63D0\u793A \xB7 ",
          f.title
        ] }),
        /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 4, lineHeight: 1.5 }, children: f.detail })
      ] }, `${f.id}-${i}`)) : null
    ] }) : null
  ] });
}
function StatusLine({ rec }) {
  const si = rec.streamInfo;
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "baseline", fontSize: 13 }, children: [
    /* @__PURE__ */ jsx("span", { style: { fontWeight: 700, color: statusColor(rec), fontSize: 15 }, children: rec.error ? "\u7F51\u7EDC\u5931\u8D25" : `HTTP ${rec.status || "?"}` }),
    /* @__PURE__ */ jsxs("span", { style: S.muted, children: [
      "\u603B\u8017\u65F6 ",
      fmtMs(rec.ms)
    ] }),
    si ? /* @__PURE__ */ jsxs("span", { style: S.muted, children: [
      "TTFT ",
      fmtMs(si.ttftMs)
    ] }) : null,
    si ? /* @__PURE__ */ jsxs("span", { style: S.muted, children: [
      "chunk ",
      si.chunkCount
    ] }) : null,
    si && si.tps ? /* @__PURE__ */ jsxs("span", { style: S.muted, children: [
      si.tps,
      " tok/s\uFF08\u4F30\uFF09"
    ] }) : null,
    si ? /* @__PURE__ */ jsxs("span", { style: S.muted, children: [
      "\u7EC8\u6B62\uFF1A",
      si.finishReason || "\u65E0",
      si.doneMarker ? " +[DONE]" : ""
    ] }) : null,
    si && si.usage ? /* @__PURE__ */ jsxs("span", { style: S.muted, children: [
      "\u7528\u91CF ",
      si.usage.prompt ?? "?",
      " + ",
      si.usage.completion ?? "?",
      " tok",
      si.usage.exact ? "" : "\uFF08\u4F30\uFF09"
    ] }) : null,
    /* @__PURE__ */ jsx("span", { style: S.muted, children: rec.at ? rec.at.replace("T", " ").slice(5, 19) : "" })
  ] });
}
function BodyView({ rec }) {
  const si = rec.streamInfo;
  if (si) {
    return /* @__PURE__ */ jsxs("div", { children: [
      si.reasoning ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 8 }, children: "\u601D\u8003\uFF08reasoning\uFF09" }),
        /* @__PURE__ */ jsx("pre", { style: { ...S.pre, color: "#B392F0" }, children: si.reasoning })
      ] }) : null,
      /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 8 }, children: "\u6B63\u6587" }),
      /* @__PURE__ */ jsx("pre", { style: S.pre, children: si.text || (si.sawError ? `\uFF08\u6D41\u5185\u9519\u8BEF\uFF1A${si.sawError.message || "?"}\uFF09` : "\uFF08\u7A7A\uFF09") })
    ] });
  }
  if (rec.content != null) {
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 8 }, children: "\u6B63\u6587" }),
      /* @__PURE__ */ jsx("pre", { style: S.pre, children: rec.content || "\uFF08\u7A7A\uFF09" })
    ] });
  }
  if (rec.parsedError) {
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { style: { ...S.muted, marginTop: 8 }, children: [
        "\u9519\u8BEF\u4F53 ",
        rec.parsedError.providerCode ? `[${rec.parsedError.providerCode}]` : "",
        rec.parsedError.retryAfterMs ? ` \xB7 \u5EFA\u8BAE ${Math.round(rec.parsedError.retryAfterMs / 1e3)}s \u540E\u91CD\u8BD5` : ""
      ] }),
      /* @__PURE__ */ jsx("pre", { style: { ...S.pre, color: "#FFA198" }, children: rec.parsedError.raw })
    ] });
  }
  if (rec.error) {
    return /* @__PURE__ */ jsxs("div", { style: { ...S.muted, marginTop: 8, color: "#FFA198" }, children: [
      "\u7F51\u7EDC\u5C42\u9519\u8BEF\uFF1A",
      rec.error
    ] });
  }
  return /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 8 }, children: "\uFF08\u65E0\u54CD\u5E94\u4F53\uFF09" });
}
function Timeline({ rec }) {
  const [open, setOpen] = useState(false);
  if (!rec.streamInfo || !rec.timeline || !rec.timeline.length) return null;
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setOpen(!open),
        style: { background: "none", border: "none", color: "#58A6FF", cursor: "pointer", fontSize: 12, padding: "2px 0" },
        children: [
          open ? "\u25BE" : "\u25B8",
          " SSE chunk \u65F6\u95F4\u7EBF\uFF08",
          rec.timeline.length,
          " \u4E2A\u7F51\u7EDC\u5E27\uFF0Cdt \u4E3A\u76F8\u5BF9\u9996\u5E27\u6BEB\u79D2\uFF09"
        ]
      }
    ),
    open ? /* @__PURE__ */ jsx("div", { style: { ...S.pre, maxHeight: 260 }, children: rec.timeline.map((r, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, borderBottom: "1px solid #21262D", padding: "2px 0" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { color: "#8B949E", minWidth: 64 }, children: [
        "+",
        r.dt,
        "ms"
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { color: "#8B949E", minWidth: 52 }, children: [
        r.bytes,
        "B"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { color: "#C9D1D9" }, children: r.preview })
    ] }, i)) }) : null
  ] });
}
function ResponseView({ record, showBody = true }) {
  const [showReq, setShowReq] = useState(false);
  return /* @__PURE__ */ jsxs("div", { style: S.card, children: [
    /* @__PURE__ */ jsx(StatusLine, { rec: record }),
    /* @__PURE__ */ jsx("div", { style: { ...S.muted, marginTop: 4 }, children: record.endpoint ? `${record.endpoint.name} \xB7 ${record.endpoint.baseUrl} \xB7 key ${record.endpoint.keyMask}` : "" }),
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setShowReq(!showReq),
        style: { background: "none", border: "none", color: "#58A6FF", cursor: "pointer", fontSize: 12, padding: "4px 0 0" },
        children: [
          showReq ? "\u25BE" : "\u25B8",
          " \u8BF7\u6C42\u8BE6\u60C5\uFF08URL / \u8BF7\u6C42\u4F53 / \u53D1\u9001\u5934\uFF09"
        ]
      }
    ),
    showReq ? /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: { ...S.mono, ...S.muted, marginTop: 4 }, children: record.url }),
      /* @__PURE__ */ jsx("pre", { style: { ...S.pre, color: "#C9D1D9" }, children: JSON.stringify(record.body, null, 2) }),
      /* @__PURE__ */ jsx("pre", { style: { ...S.pre, color: "#8B949E" }, children: Object.entries(record.maskedHeaders || {}).map(([k, v]) => `${k}: ${v}`).join("\n") })
    ] }) : null,
    showBody ? /* @__PURE__ */ jsx(BodyView, { rec: record }) : null,
    /* @__PURE__ */ jsx(Timeline, { rec: record }),
    /* @__PURE__ */ jsx(FindingsList, { findings: record.findings })
  ] });
}

// src/RequestTab.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var S2 = {
  label: { display: "block", fontSize: 12, color: "#8B949E", margin: "10px 0 4px" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0D1117",
    color: "#E6EDF3",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
  },
  btn: {
    background: "#21262D",
    color: "#E6EDF3",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer"
  },
  primary: {
    background: "#1F6FEB",
    color: "#fff",
    border: "1px solid #1F6FEB",
    borderRadius: 6,
    padding: "7px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  card: { border: "1px solid #30363D", borderRadius: 8, padding: 10, background: "rgba(110,118,129,0.08)" },
  msgRow: { display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-start" },
  err: { color: "#FFA198", fontSize: 12, marginTop: 6, whiteSpace: "pre-wrap" },
  note: { color: "#8B949E", fontSize: 12 }
};
function RequestTab({ endpoints, models, onEndpointsChanged, initialRawBody }) {
  const [endpointId, setEndpointId] = useState2("");
  const [model, setModel] = useState2("");
  const [system, setSystem] = useState2("");
  const [messages, setMessages] = useState2([
    { role: "user", content: "\u4F60\u597D\uFF0C\u8BF7\u4ECB\u7ECD\u4E00\u4E0B\u4F60\u81EA\u5DF1" }
  ]);
  const [maxTokens, setMaxTokens] = useState2("1024");
  const [temperature, setTemperature] = useState2("");
  const [topP, setTopP] = useState2("");
  const [stream, setStream] = useState2(true);
  const [extraText, setExtraText] = useState2("");
  const [rawMode, setRawMode] = useState2(!!initialRawBody);
  const [rawText, setRawText] = useState2(initialRawBody ? JSON.stringify(initialRawBody, null, 2) : "");
  const [sending, setSending] = useState2(false);
  const [record, setRecord] = useState2(null);
  const [err, setErr] = useState2("");
  const [mutatorBusy, setMutatorBusy] = useState2("");
  const wire = endpoints.find((e) => e.id === endpointId)?.wire || "openai-chat-completions";
  const modelList = useMemo(() => models[endpointId] || [], [models, endpointId]);
  function updateMsg(i, patch) {
    setMessages((arr) => arr.map((m, j) => j === i ? { ...m, ...patch } : m));
  }
  function buildDraft() {
    if (rawMode) {
      try {
        const raw = JSON.parse(rawText);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          setErr("\u539F\u59CB\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
          return null;
        }
        return { model: "", system: "", messages: [], stream: false, rawBody: raw };
      } catch (e) {
        setErr(`\u539F\u59CB\u8BF7\u6C42\u4F53 JSON \u89E3\u6790\u5931\u8D25\uFF1A${e.message}`);
        return null;
      }
    }
    let extra;
    if (extraText.trim()) {
      try {
        extra = JSON.parse(extraText);
      } catch (e) {
        setErr(`\u9644\u52A0\u5B57\u6BB5 JSON \u89E3\u6790\u5931\u8D25\uFF1A${e.message}`);
        return null;
      }
    }
    const d = {
      model: model.trim(),
      system: system.trim(),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream
    };
    if (maxTokens.trim()) d.maxTokens = Number(maxTokens);
    if (temperature.trim()) d.temperature = Number(temperature);
    if (topP.trim()) d.topP = Number(topP);
    if (extra) d.extra = extra;
    return d;
  }
  async function send(force = false) {
    const ep2 = endpointId || endpoints[0] && endpoints[0].id || "";
    if (!ep2) {
      setErr("\u6CA1\u6709\u53EF\u7528\u7AEF\u70B9\uFF1A\u5148\u5230\u300C\u7AEF\u70B9\u300D\u9875\u5BFC\u5165\u6216\u624B\u52A8\u6DFB\u52A0");
      return;
    }
    if (!endpointId) setEndpointId(ep2);
    const draft = buildDraft();
    if (!draft) return;
    setErr("");
    setSending(true);
    setRecord(null);
    try {
      const r = await sendCommand("send", { endpointId: ep2, draft, force, cap: { maxTokensMax: 32768 } });
      if (r.ok) setRecord(r.record);
      else if (r.precheck && !r.force) {
        setErr(`\u9884\u68C0\u62E6\u622A\uFF08\u672A\u53D1\u9001\uFF0C\u4E0D\u6D88\u8017\u989D\u5EA6\uFF09\uFF1A
${(r.precheck.errors || []).map((x) => `\u274C ${x}`).join("\n")}${(r.precheck.warnings || []).length ? `
\u26A0 ${r.precheck.warnings.join("\n\u26A0 ")}` : ""}
\uFF08\u786E\u8981\u5F3A\u5236\u53D1\u9001\u53EF\u70B9\u300C\u5F3A\u5236\u53D1\u9001\u300D\uFF09`);
      } else setErr(r.error || "\u53D1\u9001\u5931\u8D25");
    } finally {
      setSending(false);
    }
  }
  async function mutate(mutatorId) {
    let body = null;
    if (rawMode && rawText.trim()) {
      try {
        body = JSON.parse(rawText);
      } catch (_) {
        body = null;
      }
    }
    if (!body && record) body = record.body;
    if (!body) {
      setErr("\u6CA1\u6709\u53EF\u53D8\u5F02\u7684\u8BF7\u6C42\u4F53\uFF1A\u5148\u53D1\u9001\u4E00\u6B21\uFF0C\u6216\u7C98\u8D34\u539F\u59CB\u8BF7\u6C42\u4F53 JSON");
      return;
    }
    setMutatorBusy(mutatorId);
    try {
      const r = await sendCommand("mutate", { body, mutatorId }, 2e4);
      if (r.ok) {
        setRawMode(true);
        setRawText(JSON.stringify(r.body, null, 2));
        setErr(`\u5DF2\u5E94\u7528\u53D8\u5F02\u300C${r.mutator.label}\u300D\u5230\u539F\u59CB\u8BF7\u6C42\u4F53\uFF08${r.mutator.note}\uFF09\u2014\u2014\u68C0\u67E5\u540E\u70B9\u53D1\u9001`);
      } else setErr(`\u53D8\u5F02\u5931\u8D25\uFF1A${r.error}`);
    } finally {
      setMutatorBusy("");
    }
  }
  async function loadLatestBody() {
    const r = await sendCommand("get_state", {}, 15e3);
    if (r.ok && r.latest && r.latest.body) {
      setRawMode(true);
      setRawText(JSON.stringify(r.latest.body, null, 2));
      setErr("\u5DF2\u8F7D\u5165\u6700\u8FD1\u4E00\u6B21\u8BF7\u6C42\u4F53\u5230\u539F\u59CB JSON \u6A21\u5F0F");
    } else setErr("\u6682\u65E0\u5386\u53F2\u8BF7\u6C42\u53EF\u8F7D\u5165");
  }
  const ep = endpoints.find((e) => e.id === (endpointId || endpoints[0] && endpoints[0].id));
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("label", { style: S2.label, children: "\u7AEF\u70B9" }),
    /* @__PURE__ */ jsxs2("div", { style: S2.row, children: [
      /* @__PURE__ */ jsxs2(
        "select",
        {
          value: endpointId || endpoints[0] && endpoints[0].id || "",
          onChange: (e) => setEndpointId(e.target.value),
          style: { ...S2.input, maxWidth: 360 },
          children: [
            endpoints.length === 0 ? /* @__PURE__ */ jsx2("option", { value: "", children: "\uFF08\u65E0\u7AEF\u70B9\u2014\u2014\u5148\u5230\u300C\u7AEF\u70B9\u300D\u9875\u6DFB\u52A0\uFF09" }) : null,
            endpoints.map((e) => /* @__PURE__ */ jsxs2("option", { value: e.id, children: [
              e.name,
              "\uFF08",
              e.wire === "anthropic-messages" ? "Anthropic" : "OpenAI",
              "\uFF09\xB7 ",
              e.baseUrl
            ] }, e.id))
          ]
        }
      ),
      ep ? /* @__PURE__ */ jsxs2("span", { style: S2.note, children: [
        "key ",
        ep.keyMask
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { ...S2.row, marginTop: 12 }, children: [
      /* @__PURE__ */ jsx2(
        "button",
        {
          onClick: () => setRawMode(!rawMode),
          style: { ...S2.btn, background: rawMode ? "#1F6FEB" : "#21262D", color: rawMode ? "#fff" : "#E6EDF3" },
          children: rawMode ? "\u539F\u59CB JSON \u6A21\u5F0F\uFF08\u70B9\u6B64\u5207\u56DE\u8868\u5355\uFF09" : "\u8868\u5355\u6A21\u5F0F\uFF08\u70B9\u6B64\u5207\u539F\u59CB JSON\uFF09"
        }
      ),
      /* @__PURE__ */ jsx2("button", { onClick: loadLatestBody, style: S2.btn, children: "\u8F7D\u5165\u6700\u8FD1\u8BF7\u6C42\u4F53" })
    ] }),
    rawMode ? /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsx2("label", { style: S2.label, children: "\u539F\u59CB\u8BF7\u6C42\u4F53\uFF08\u539F\u6837\u900F\u4F20\uFF0C\u53EF\u653E\u4EFB\u610F\u975E\u6807\u5B57\u6BB5\u505A\u5B9E\u9A8C\uFF09" }),
      /* @__PURE__ */ jsx2(
        "textarea",
        {
          value: rawText,
          onChange: (e) => setRawText(e.target.value),
          rows: 12,
          spellCheck: false,
          style: { ...S2.input, fontFamily: "Consolas, Monaco, monospace", fontSize: 12 }
        }
      )
    ] }) : /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsx2("label", { style: S2.label, children: "model" }),
      /* @__PURE__ */ jsxs2("div", { style: S2.row, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            list: "llmdesk-models",
            value: model,
            onChange: (e) => setModel(e.target.value),
            placeholder: wire === "anthropic-messages" ? "\u5982 claude-sonnet-4-20250514" : "\u5982 deepseek-chat",
            style: { ...S2.input, maxWidth: 320 }
          }
        ),
        /* @__PURE__ */ jsx2("datalist", { id: "llmdesk-models", children: modelList.map((m) => /* @__PURE__ */ jsx2("option", { value: m }, m)) })
      ] }),
      /* @__PURE__ */ jsxs2("label", { style: S2.label, children: [
        "system",
        wire === "openai-chat-completions" ? "\uFF08OpenAI \u534F\u8BAE\u81EA\u52A8\u5E76\u5165 messages \u9996\u6761\uFF09" : ""
      ] }),
      /* @__PURE__ */ jsx2("textarea", { value: system, onChange: (e) => setSystem(e.target.value), rows: 2, style: S2.input }),
      /* @__PURE__ */ jsx2("label", { style: S2.label, children: "messages\uFF08Anthropic \u534F\u8BAE\u8981\u6C42\u4EE5 user \u7ED3\u5C3E\uFF09" }),
      messages.map((m, i) => /* @__PURE__ */ jsxs2("div", { style: S2.msgRow, children: [
        /* @__PURE__ */ jsxs2(
          "select",
          {
            value: m.role,
            onChange: (e) => updateMsg(i, { role: e.target.value }),
            style: { ...S2.input, width: 110, flex: "none" },
            children: [
              /* @__PURE__ */ jsx2("option", { value: "user", children: "user" }),
              /* @__PURE__ */ jsx2("option", { value: "assistant", children: "assistant" })
            ]
          }
        ),
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            value: m.content,
            onChange: (e) => updateMsg(i, { content: e.target.value }),
            rows: 2,
            style: { ...S2.input, fontFamily: "inherit" }
          }
        ),
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
          /* @__PURE__ */ jsx2("button", { onClick: () => i > 0 && setMessages((a) => {
            const c = [...a];
            [c[i - 1], c[i]] = [c[i], c[i - 1]];
            return c;
          }), style: { ...S2.btn, padding: "1px 8px" }, disabled: i === 0, children: "\u2191" }),
          /* @__PURE__ */ jsx2("button", { onClick: () => i < messages.length - 1 && setMessages((a) => {
            const c = [...a];
            [c[i + 1], c[i]] = [c[i], c[i + 1]];
            return c;
          }), style: { ...S2.btn, padding: "1px 8px" }, disabled: i === messages.length - 1, children: "\u2193" })
        ] }),
        /* @__PURE__ */ jsx2("button", { onClick: () => setMessages((a) => a.filter((_, j) => j !== i)), style: { ...S2.btn, padding: "2px 8px", color: "#F85149" }, children: "\u2715" })
      ] }, i)),
      /* @__PURE__ */ jsx2(
        "button",
        {
          onClick: () => setMessages((a) => [...a, { role: a.length && a[a.length - 1].role === "user" ? "assistant" : "user", content: "" }]),
          style: S2.btn,
          children: "+ \u6DFB\u52A0\u6D88\u606F"
        }
      ),
      /* @__PURE__ */ jsxs2("div", { style: { ...S2.row, marginTop: 12 }, children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("label", { style: S2.label, children: [
            "max_tokens",
            wire === "anthropic-messages" ? "\uFF08Anthropic \u5FC5\u586B\uFF09" : ""
          ] }),
          /* @__PURE__ */ jsx2("input", { value: maxTokens, onChange: (e) => setMaxTokens(e.target.value), style: { ...S2.input, width: 110 } })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { style: S2.label, children: "temperature" }),
          /* @__PURE__ */ jsx2("input", { value: temperature, onChange: (e) => setTemperature(e.target.value), placeholder: "\u7559\u7A7A\u4E0D\u4F20", style: { ...S2.input, width: 110 } })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { style: S2.label, children: "top_p" }),
          /* @__PURE__ */ jsx2("input", { value: topP, onChange: (e) => setTopP(e.target.value), placeholder: "\u7559\u7A7A\u4E0D\u4F20", style: { ...S2.input, width: 110 } })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { style: S2.label, children: "stream" }),
          /* @__PURE__ */ jsx2("button", { onClick: () => setStream(!stream), style: { ...S2.btn, background: stream ? "#1F6FEB" : "#21262D", color: stream ? "#fff" : "#E6EDF3" }, children: stream ? "\u5F00" : "\u5173" })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("label", { style: S2.label, children: "\u9644\u52A0\u5B57\u6BB5 extra\uFF08JSON\uFF0C\u900F\u4F20\u5230\u9876\u5C42\uFF1Athinking / response_format / reasoning_effort \u7B49\u5B9E\u9A8C\u5B57\u6BB5\uFF09" }),
      /* @__PURE__ */ jsx2("input", { value: extraText, onChange: (e) => setExtraText(e.target.value), placeholder: '\u5982 {"thinking":{"type":"adaptive"}}', style: { ...S2.input, fontFamily: "Consolas, monospace", fontSize: 12 } })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { ...S2.row, marginTop: 12 }, children: [
      /* @__PURE__ */ jsx2("span", { style: S2.note, children: "\u53D8\u5F02\u91CD\u653E\uFF1A" }),
      (wire === "anthropic-messages" ? ["append-empty-user", "drop-trailing-assistant", "standard-fields", "minimal", "halve-messages", "lower-max-tokens", "no-stream", "no-tools"] : ["standard-fields", "minimal", "halve-messages", "lower-max-tokens", "no-stream", "no-tools", "convert-system"]).map((id) => /* @__PURE__ */ jsx2("button", { onClick: () => mutate(id), disabled: !!mutatorBusy, style: { ...S2.btn, opacity: mutatorBusy === id ? 0.5 : 1 }, children: mutatorBusy === id ? "\u2026" : mutatorLabel(id) }, id))
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { ...S2.row, marginTop: 14 }, children: [
      /* @__PURE__ */ jsx2("button", { onClick: () => send(false), disabled: sending || !endpoints.length, style: S2.primary, children: sending ? "\u53D1\u9001\u4E2D\u2026" : "\u25B6 \u53D1\u9001\u8BF7\u6C42" }),
      sending ? /* @__PURE__ */ jsx2("button", { onClick: async () => {
        await sendCommand("cancel", {}, 8e3);
      }, style: S2.btn, children: "\u53D6\u6D88" }) : null,
      err && !sending ? /* @__PURE__ */ jsx2("button", { onClick: () => send(true), style: { ...S2.btn, color: "#FFA198" }, children: "\u5F3A\u5236\u53D1\u9001\uFF08\u8DF3\u8FC7\u9884\u68C0\uFF09" }) : null
    ] }),
    err ? /* @__PURE__ */ jsx2("div", { style: S2.err, children: err }) : null,
    record ? /* @__PURE__ */ jsxs2("div", { style: { marginTop: 14 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { ...S2.note, marginBottom: 6 }, children: [
        "reqId=",
        record.reqId,
        " \xB7 ",
        record.ok ? "\u6210\u529F" : "\u5931\u8D25",
        " \xB7 ",
        fmtMs(record.ms)
      ] }),
      /* @__PURE__ */ jsx2(ResponseView, { record })
    ] }) : null
  ] });
}
function mutatorLabel(id) {
  const map = {
    "append-empty-user": "\u8865\u7A7A user \u7ED3\u5C3E",
    "drop-trailing-assistant": "\u53BB\u672B\u5C3E assistant",
    "standard-fields": "\u88C1\u526A\u6807\u51C6\u5B57\u6BB5",
    minimal: "\u6700\u5C0F\u8BF7\u6C42",
    "halve-messages": "\u51CF\u534A messages",
    "lower-max-tokens": "max_tokens\u2192256",
    "no-stream": "\u5173 stream",
    "no-tools": "\u53BB tools",
    "convert-system": "system \u6362\u5199\u6CD5"
  };
  return map[id] || id;
}

// src/EndpointsTab.tsx
import { useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var S3 = {
  card: { border: "1px solid #30363D", borderRadius: 8, padding: 10, marginBottom: 8, background: "rgba(110,118,129,0.08)" },
  label: { display: "block", fontSize: 12, color: "#8B949E", margin: "8px 0 4px" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0D1117",
    color: "#E6EDF3",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
  },
  btn: {
    background: "#21262D",
    color: "#E6EDF3",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer"
  },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  muted: { color: "#8B949E", fontSize: 12 },
  err: { color: "#FFA198", fontSize: 12, marginTop: 6 },
  okMsg: { color: "#7EE787", fontSize: 12, marginTop: 6 },
  tag: { fontSize: 11, border: "1px solid #30363D", borderRadius: 10, padding: "1px 8px", color: "#8B949E" }
};
function EndpointsTab({ endpoints, models, onChanged }) {
  const [form, setForm] = useState3({ name: "", baseUrl: "", apiKey: "", wire: "openai-chat-completions", pathOverride: "", allowEmptyKey: false });
  const [busy, setBusy] = useState3("");
  const [msg, setMsg] = useState3("");
  const [err, setErr] = useState3("");
  const [modelsOpen, setModelsOpen] = useState3("");
  async function importHost() {
    setBusy("import");
    setErr("");
    setMsg("");
    try {
      const r = await sendCommand("import_host", {}, 2e4);
      if (r.ok) {
        setMsg(`\u5BBF\u4E3B\u5BFC\u5165\u5B8C\u6210\uFF1A\u65B0\u589E ${r.imported} \u6761\uFF0C\u5171 ${r.total} \u6761`);
        onChanged();
      } else setErr(r.error || "\u5BFC\u5165\u5931\u8D25");
    } finally {
      setBusy("");
    }
  }
  async function upsert() {
    setBusy("upsert");
    setErr("");
    setMsg("");
    try {
      const r = await sendCommand("endpoint_upsert", {
        endpoint: {
          name: form.name || "\u672A\u547D\u540D",
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey,
          wire: form.wire,
          pathOverride: form.pathOverride
        },
        allowEmptyKey: form.allowEmptyKey
      }, 15e3);
      if (r.ok) {
        setMsg(`\u5DF2\u4FDD\u5B58\uFF1A${r.id}`);
        setForm({ ...form, name: "", baseUrl: "", apiKey: "", pathOverride: "" });
        onChanged();
      } else setErr(r.error || "\u4FDD\u5B58\u5931\u8D25");
    } finally {
      setBusy("");
    }
  }
  async function del(id, source) {
    setBusy(`del-${id}`);
    try {
      const r = await sendCommand("endpoint_delete", { id, force: source === "host" }, 15e3);
      if (r.ok) onChanged();
      else setErr(r.error || "\u5220\u9664\u5931\u8D25");
    } finally {
      setBusy("");
    }
  }
  async function fetchModels(id) {
    setBusy(`models-${id}`);
    setErr("");
    try {
      const r = await sendCommand("models", { endpointId: id }, 25e3);
      if (r.ok) {
        setModelsOpen(id);
        onChanged();
      } else setErr(`\u62C9\u6A21\u578B\u5931\u8D25\uFF1A${r.error}`);
    } finally {
      setBusy("");
    }
  }
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
      /* @__PURE__ */ jsx3("button", { onClick: importHost, disabled: !!busy, style: S3.btn, children: "\u27F3 \u5BFC\u5165\u5BBF\u4E3B\u7AEF\u70B9\uFF08\u96F6\u91CD\u5F55\uFF09" }),
      /* @__PURE__ */ jsx3("span", { style: S3.muted, children: "\u8BFB\u53D6\u5BBF\u4E3B\u5DF2\u914D\u7F6E\u7684\u6A21\u578B\u4F9B\u5E94\u5546\u4E0E key \u6C60\uFF08key \u4E0D\u51FA\u672C\u673A\u670D\u52A1\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: { ...S3.card, marginTop: 12 }, children: [
      /* @__PURE__ */ jsx3("div", { style: { fontWeight: 600, fontSize: 13 }, children: "\u624B\u52A8\u6DFB\u52A0\u7AEF\u70B9" }),
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 180 }, children: [
          /* @__PURE__ */ jsx3("label", { style: S3.label, children: "\u540D\u79F0" }),
          /* @__PURE__ */ jsx3("input", { value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: "\u5982 \u672C\u5730 Ollama", style: S3.input })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { flex: 2, minWidth: 260 }, children: [
          /* @__PURE__ */ jsx3("label", { style: S3.label, children: "baseUrl\uFF08\u5E26\u4E0D\u5E26 /v1 \u90FD\u884C\uFF0C\u81EA\u52A8\u9632\u91CD\u590D\u62FC\u63A5\uFF09" }),
          /* @__PURE__ */ jsx3("input", { value: form.baseUrl, onChange: (e) => setForm({ ...form, baseUrl: e.target.value }), placeholder: "http://127.0.0.1:11434 \u6216 https://api.deepseek.com", style: S3.input })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsxs3("div", { style: { flex: 2, minWidth: 220 }, children: [
          /* @__PURE__ */ jsx3("label", { style: S3.label, children: "apiKey\uFF08\u672C\u5730\u65E0\u9274\u6743\u7AEF\u70B9\u53EF\u52FE\u9009\u300C\u5141\u8BB8\u7A7A key\u300D\uFF09" }),
          /* @__PURE__ */ jsx3("input", { value: form.apiKey, onChange: (e) => setForm({ ...form, apiKey: e.target.value }), type: "password", style: S3.input })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { minWidth: 150 }, children: [
          /* @__PURE__ */ jsx3("label", { style: S3.label, children: "\u534F\u8BAE" }),
          /* @__PURE__ */ jsxs3("select", { value: form.wire, onChange: (e) => setForm({ ...form, wire: e.target.value }), style: S3.input, children: [
            /* @__PURE__ */ jsx3("option", { value: "openai-chat-completions", children: "OpenAI Chat Completions" }),
            /* @__PURE__ */ jsx3("option", { value: "anthropic-messages", children: "Anthropic Messages" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 220 }, children: [
          /* @__PURE__ */ jsx3("label", { style: S3.label, children: "\u8DEF\u5F84\u8986\u76D6\uFF08\u53EF\u9009\uFF1B\u7F51\u5173\u53D8\u4F53\u5982 /v1/messages?beta=true\uFF09" }),
          /* @__PURE__ */ jsx3("input", { value: form.pathOverride, onChange: (e) => setForm({ ...form, pathOverride: e.target.value }), style: S3.input })
        ] }),
        /* @__PURE__ */ jsxs3("label", { style: { ...S3.label, marginTop: 18, display: "flex", gap: 6, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: form.allowEmptyKey, onChange: (e) => setForm({ ...form, allowEmptyKey: e.target.checked }) }),
          "\u5141\u8BB8\u7A7A key"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("button", { onClick: upsert, disabled: !!busy || !form.baseUrl.trim(), style: { ...S3.btn, marginTop: 10 }, children: busy === "upsert" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u7AEF\u70B9" })
    ] }),
    msg ? /* @__PURE__ */ jsx3("div", { style: S3.okMsg, children: msg }) : null,
    err ? /* @__PURE__ */ jsx3("div", { style: S3.err, children: err }) : null,
    /* @__PURE__ */ jsxs3("div", { style: { marginTop: 14 }, children: [
      endpoints.length === 0 ? /* @__PURE__ */ jsx3("div", { style: S3.muted, children: "\u6682\u65E0\u7AEF\u70B9\u3002\u70B9\u4E0A\u65B9\u300C\u5BFC\u5165\u5BBF\u4E3B\u7AEF\u70B9\u300D\u6216\u624B\u52A8\u6DFB\u52A0\u3002" }) : null,
      endpoints.map((e) => /* @__PURE__ */ jsxs3("div", { style: S3.card, children: [
        /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
          /* @__PURE__ */ jsx3("span", { style: { fontWeight: 600, fontSize: 13 }, children: e.name }),
          /* @__PURE__ */ jsx3("span", { style: S3.tag, children: e.wire === "anthropic-messages" ? "Anthropic" : "OpenAI" }),
          /* @__PURE__ */ jsx3("span", { style: S3.tag, children: e.source === "host" ? "\u5BBF\u4E3B\u5BFC\u5165" : "\u624B\u52A8" }),
          /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx3("button", { onClick: () => fetchModels(e.id), disabled: !!busy, style: S3.btn, children: busy === `models-${e.id}` ? "\u62C9\u53D6\u4E2D\u2026" : "\u62C9\u6A21\u578B" }),
          /* @__PURE__ */ jsx3("button", { onClick: () => del(e.id, e.source), disabled: !!busy, style: { ...S3.btn, color: "#F85149" }, children: busy === `del-${e.id}` ? "\u2026" : "\u5220\u9664" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { ...S3.muted, marginTop: 4 }, children: [
          e.baseUrl,
          e.pathOverride ? ` \xB7 path=${e.pathOverride}` : "",
          " \xB7 key ",
          e.keyMask
        ] }),
        modelsOpen === e.id && models[e.id] ? /* @__PURE__ */ jsxs3("div", { style: { ...S3.muted, marginTop: 6, maxHeight: 120, overflow: "auto" }, children: [
          models[e.id].length,
          " \u4E2A\u6A21\u578B\uFF1A",
          models[e.id].join("\u3001")
        ] }) : null
      ] }, e.id))
    ] })
  ] });
}

// src/HistoryTab.tsx
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var S4 = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", color: "#8B949E", fontWeight: 500, padding: "4px 8px", borderBottom: "1px solid #30363D" },
  td: { padding: "5px 8px", borderBottom: "1px solid #21262D", color: "#C9D1D9" },
  btn: {
    background: "#21262D",
    color: "#E6EDF3",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer"
  },
  muted: { color: "#8B949E", fontSize: 12 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  title: { fontWeight: 600, fontSize: 13, margin: "14px 0 8px" },
  cellBox: { flex: 1, minWidth: 280, border: "1px solid #30363D", borderRadius: 8, padding: 10, background: "rgba(110,118,129,0.08)" }
};
function HistoryTab({ history, onOpenRequest }) {
  const rows = normalizeHistory(history);
  const [detail, setDetail] = useState4(null);
  const [compare, setCompare] = useState4([]);
  const [busy, setBusy] = useState4("");
  const [err, setErr] = useState4("");
  async function open(reqId) {
    setBusy(reqId);
    setErr("");
    try {
      const r = await loadReq(reqId);
      if (r) setDetail(r);
      else setErr(`\u8BB0\u5F55 ${reqId} \u5DF2\u88AB\u6E05\u7406\uFF08\u4FDD\u7559\u6700\u8FD1 30 \u6761\u5B8C\u6574\u8BB0\u5F55\uFF09`);
    } finally {
      setBusy("");
    }
  }
  function toggleCompare(reqId) {
    setCompare((c) => c.includes(reqId) ? c.filter((x) => x !== reqId) : [...c.slice(-1), reqId]);
  }
  const [left, right] = compare;
  return /* @__PURE__ */ jsxs4("div", { children: [
    rows.length === 0 ? /* @__PURE__ */ jsx4("div", { style: S4.muted, children: "\u6682\u65E0\u8BF7\u6C42\u5386\u53F2\u3002\u5230\u300C\u8BF7\u6C42\u300D\u9875\u53D1\u4E00\u6B21\u3002" }) : /* @__PURE__ */ jsxs4("table", { style: S4.table, children: [
      /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("th", { style: S4.th }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "\u65F6\u95F4" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "\u7AEF\u70B9" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "\u6A21\u578B" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "\u8017\u65F6" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "TTFT" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th, children: "\u9996\u6761\u8BCA\u65AD" }),
        /* @__PURE__ */ jsx4("th", { style: S4.th })
      ] }) }),
      /* @__PURE__ */ jsx4("tbody", { children: rows.map((x) => /* @__PURE__ */ jsxs4("tr", { style: { cursor: "pointer" }, onClick: () => open(x.reqId), children: [
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: /* @__PURE__ */ jsx4(
          "input",
          {
            type: "checkbox",
            checked: compare.includes(x.reqId),
            onClick: (e) => e.stopPropagation(),
            onChange: () => toggleCompare(x.reqId),
            title: "\u52FE\u9009\u4E24\u6761\u505A\u5BF9\u6BD4"
          }
        ) }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: fmtTime(x.at) }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: x.endpointName }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: x.model || "\u2014" }),
        /* @__PURE__ */ jsx4("td", { style: { ...S4.td, color: x.ok ? "#3FB950" : "#F85149", fontWeight: 600 }, children: x.status || "ERR" }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: fmtMs(x.ms) }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: x.ttftMs != null ? fmtMs(x.ttftMs) : "\u2014" }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: x.firstFinding || "\u2014" }),
        /* @__PURE__ */ jsx4("td", { style: S4.td, children: /* @__PURE__ */ jsx4("button", { onClick: (e) => {
          e.stopPropagation();
          open(x.reqId);
        }, style: S4.btn, children: busy === x.reqId ? "\u2026" : "\u8BE6\u60C5" }) })
      ] }, x.reqId)) })
    ] }),
    err ? /* @__PURE__ */ jsx4("div", { style: { color: "#FFA198", fontSize: 12, marginTop: 8 }, children: err }) : null,
    compare.length === 1 ? /* @__PURE__ */ jsx4("div", { style: { ...S4.muted, marginTop: 8 }, children: "\u5DF2\u9009 1 \u6761\uFF0C\u518D\u52FE 1 \u6761\u5373\u53EF\u5BF9\u6BD4\u3002" }) : null,
    left && right ? /* @__PURE__ */ jsx4(CompareView, { leftId: left, rightId: right, onClose: () => setCompare([]) }, `${left}|${right}`) : null,
    detail ? /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsxs4("div", { style: S4.title, children: [
        "\u8BF7\u6C42\u8BE6\u60C5\uFF08",
        detail.reqId,
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
        /* @__PURE__ */ jsx4(
          "button",
          {
            onClick: () => onOpenRequest(detail),
            style: S4.btn,
            title: "\u628A\u8BE5\u8BF7\u6C42\u4F53\u8F7D\u5165\u5230\u300C\u8BF7\u6C42\u300D\u9875\u7684\u539F\u59CB JSON \u6A21\u5F0F\u7EE7\u7EED\u8C03\u8BD5",
            children: "\u21A5 \u8F7D\u5165\u8BF7\u6C42\u9875\u7EE7\u7EED\u8C03\u8BD5"
          }
        ),
        /* @__PURE__ */ jsx4("button", { onClick: async () => {
          await sendCommand("cancel", {}, 5e3).catch(() => void 0);
        }, style: { ...S4.btn, display: "none" }, children: "x" })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx4(ResponseView, { record: detail }) })
    ] }) : null
  ] });
}
function CompareView({ leftId, rightId, onClose }) {
  const [pair, setPair] = useState4(null);
  const [err, setErr] = useState4("");
  if (!pair && !err) {
    Promise.all([loadReq(leftId), loadReq(rightId)]).then(([l2, r2]) => setPair({ l: l2, r: r2 })).catch((e) => setErr(String(e.message)));
  }
  if (err) return /* @__PURE__ */ jsxs4("div", { style: { color: "#FFA198", fontSize: 12, marginTop: 8 }, children: [
    "\u5BF9\u6BD4\u52A0\u8F7D\u5931\u8D25\uFF1A",
    err
  ] });
  if (!pair || !pair.l || !pair.r) return /* @__PURE__ */ jsx4("div", { style: { ...S4.muted, marginTop: 8 }, children: "\u5BF9\u6BD4\u52A0\u8F7D\u4E2D\u2026" });
  const { l, r } = pair;
  const diffRows = [
    ["HTTP", String(l.status || (l.error ? "ERR" : "?")), String(r.status || (r.error ? "ERR" : "?"))],
    ["\u8017\u65F6", fmtMs(l.ms), fmtMs(r.ms)],
    ["TTFT", l.streamInfo ? fmtMs(l.streamInfo.ttftMs) : "\u2014", r.streamInfo ? fmtMs(r.streamInfo.ttftMs) : "\u2014"],
    ["\u7EC8\u6B62", l.streamInfo ? String(l.streamInfo.finishReason || "\u65E0") : "\u2014", r.streamInfo ? String(r.streamInfo.finishReason || "\u65E0") : "\u2014"],
    [
      "\u6B63\u6587",
      (l.streamInfo ? l.streamInfo.text : l.content || l.parsedError?.message || l.error || "").slice(0, 120) || "\u2014",
      (r.streamInfo ? r.streamInfo.text : r.content || r.parsedError?.message || r.error || "").slice(0, 120) || "\u2014"
    ],
    ["\u8BF7\u6C42\u4F53", JSON.stringify(l.body), JSON.stringify(r.body)]
  ];
  return /* @__PURE__ */ jsxs4("div", { style: { marginTop: 14 }, children: [
    /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
      /* @__PURE__ */ jsx4("div", { style: S4.title, children: "\u5BF9\u6BD4" }),
      /* @__PURE__ */ jsx4("button", { onClick: onClose, style: S4.btn, children: "\u5173\u95ED\u5BF9\u6BD4" })
    ] }),
    /* @__PURE__ */ jsx4("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: [l, r].map((rec, i) => /* @__PURE__ */ jsxs4("div", { style: S4.cellBox, children: [
      /* @__PURE__ */ jsxs4("div", { style: { fontWeight: 600, color: statusColor(rec), fontSize: 13 }, children: [
        i === 0 ? "A" : "B",
        " \xB7 ",
        rec.endpoint.name,
        " \xB7 HTTP ",
        rec.status || "ERR"
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: { ...S4.muted, marginTop: 4 }, children: [
        rec.at.replace("T", " ").slice(5, 19),
        " \xB7 ",
        fmtMs(rec.ms)
      ] })
    ] }, i)) }),
    /* @__PURE__ */ jsx4("table", { style: { ...S4.table, marginTop: 8 }, children: /* @__PURE__ */ jsx4("tbody", { children: diffRows.map(([k, a, b]) => /* @__PURE__ */ jsxs4("tr", { children: [
      /* @__PURE__ */ jsx4("td", { style: { ...S4.td, color: "#8B949E", width: 70 }, children: k }),
      /* @__PURE__ */ jsx4("td", { style: { ...S4.td, fontFamily: k === "\u8BF7\u6C42\u4F53" ? "Consolas, monospace" : void 0, wordBreak: "break-all", background: a !== b ? "rgba(210,153,34,0.08)" : void 0 }, children: a }),
      /* @__PURE__ */ jsx4("td", { style: { ...S4.td, fontFamily: k === "\u8BF7\u6C42\u4F53" ? "Consolas, monospace" : void 0, wordBreak: "break-all", background: a !== b ? "rgba(210,153,34,0.08)" : void 0 }, children: b })
    ] }, k)) }) }),
    /* @__PURE__ */ jsxs4("div", { style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx4("div", { style: { ...S4.muted, marginBottom: 4 }, children: "A \u8BCA\u65AD" }),
      /* @__PURE__ */ jsx4(ResponseView, { record: { ...l, body: {}, maskedHeaders: {}, timeline: [] }, showBody: false }),
      /* @__PURE__ */ jsx4("div", { style: { ...S4.muted, margin: "8px 0 4px" }, children: "B \u8BCA\u65AD" }),
      /* @__PURE__ */ jsx4(ResponseView, { record: { ...r, body: {}, maskedHeaders: {}, timeline: [] }, showBody: false })
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var S5 = {
  bar: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0 10px", borderBottom: "1px solid #30363D", marginBottom: 12, flexWrap: "wrap" },
  tab: (active) => ({
    background: active ? "#1F6FEB" : "transparent",
    color: active ? "#fff" : "#C9D1D9",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "5px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: active ? 600 : 400
  }),
  muted: { color: "#8B949E", fontSize: 12 }
};
function Panel() {
  const [tab, setTab] = useState5("request");
  const [meta, setMeta] = useState5(null);
  const [endpoints, setEndpoints] = useState5([]);
  const [history, setHistory] = useState5([]);
  const [models, setModels] = useState5({});
  const [initialRawBody, setInitialRawBody] = useState5(null);
  const [bridgeErr, setBridgeErr] = useState5("");
  const refresh = useCallback(async () => {
    try {
      const [m, eps, h] = await Promise.all([loadMeta(), loadEndpoints(), loadHistory()]);
      setMeta(m);
      setEndpoints(eps && Array.isArray(eps.items) ? eps.items : []);
      setHistory(normalizeHistory(h));
      setBridgeErr("");
    } catch (e) {
      setBridgeErr(String(e.message));
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5e3);
    return () => clearInterval(t);
  }, [refresh]);
  const fetchModels = useCallback(async (endpointId) => {
    try {
      const r = await sendCommand("models", { endpointId }, 25e3);
      if (r && r.ok && Array.isArray(r.models)) setModels((prev) => ({ ...prev, [endpointId]: r.models }));
    } catch (_) {
    }
  }, []);
  const openInRequest = useCallback((record) => {
    setInitialRawBody(record.body);
    setTab("request");
  }, []);
  const running = meta && meta.running;
  return /* @__PURE__ */ jsxs5("div", { style: { color: "#E6EDF3", fontSize: 13, padding: "2px 4px 20px" }, children: [
    /* @__PURE__ */ jsxs5("div", { style: S5.bar, children: [
      /* @__PURE__ */ jsx5("button", { style: S5.tab(tab === "request"), onClick: () => {
        setInitialRawBody(null);
        setTab("request");
      }, children: "\u8BF7\u6C42" }),
      /* @__PURE__ */ jsxs5("button", { style: S5.tab(tab === "endpoints"), onClick: () => setTab("endpoints"), children: [
        "\u7AEF\u70B9",
        endpoints.length ? `\uFF08${endpoints.length}\uFF09` : ""
      ] }),
      /* @__PURE__ */ jsxs5("button", { style: S5.tab(tab === "history"), onClick: () => setTab("history"), children: [
        "\u5386\u53F2",
        history.length ? `\uFF08${history.length}\uFF09` : ""
      ] }),
      /* @__PURE__ */ jsx5("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx5("span", { style: S5.muted, children: meta ? meta.degraded ? `\u26A0 \u670D\u52A1\u964D\u7EA7\uFF1A${meta.lastBridgeErr || "\u6865\u4E0D\u53EF\u8FBE\uFF0C60s \u81EA\u52A8\u91CD\u8BD5"}` : `\u670D\u52A1 v${meta.version} \xB7 ${meta.endpointCount} \u7AEF\u70B9` : "\u8FDE\u63A5\u670D\u52A1\u4E2D\u2026" }),
      running ? /* @__PURE__ */ jsxs5("span", { style: { ...S5.muted, color: "#D29922" }, children: [
        "\u53D1\u9001\u4E2D\uFF1A",
        running.endpointName
      ] }) : null
    ] }),
    bridgeErr ? /* @__PURE__ */ jsxs5("div", { style: { color: "#FFA198", fontSize: 12, marginBottom: 10 }, children: [
      "\u5BBF\u4E3B\u901A\u9053\u5F02\u5E38\uFF1A",
      bridgeErr,
      "\uFF08cap.kv \u4E0D\u53EF\u8FBE\uFF1F\u8BF7\u786E\u8BA4 Polaris \u7248\u672C\u4E0E\u63D2\u4EF6\u670D\u52A1\u72B6\u6001\uFF09"
    ] }) : null,
    tab === "request" ? /* @__PURE__ */ jsx5(
      RequestTab,
      {
        endpoints,
        models,
        onEndpointsChanged: () => {
          refresh();
          if (endpoints.length) fetchModels(endpoints[0].id);
        },
        initialRawBody
      }
    ) : null,
    tab === "endpoints" ? /* @__PURE__ */ jsx5(
      EndpointsTab,
      {
        endpoints,
        models,
        onChanged: () => {
          refresh();
        }
      }
    ) : null,
    tab === "history" ? /* @__PURE__ */ jsx5(HistoryTab, { history, onOpenRequest: openInRequest }) : null
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function LlmRequestDeskEntry() {
  return /* @__PURE__ */ jsx6(Panel, {});
}
export {
  LlmRequestDeskEntry as default
};
