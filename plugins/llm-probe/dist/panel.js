// src/Panel.tsx
import { useCallback, useEffect as useEffect3, useRef, useState as useState6 } from "react";

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
  meta: "llmprobe.meta",
  profiles: "llmprobe.profiles",
  latest: "llmprobe.latest",
  history: "llmprobe.history",
  settings: "llmprobe.settings",
  cmd: "llmprobe.cmd",
  res: "llmprobe.res",
  report: (id) => `llmprobe.report.${id}`,
  bench: (id) => `llmprobe.bench.${id}`
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
var loadProfiles = () => kvGet(K.profiles);
var loadLatest = () => kvGet(K.latest);
var loadHistory = () => kvGet(K.history);
var loadSettings = () => kvGet(K.settings);
var loadBenchReport = (id) => kvGet(K.bench(id));
function normalizeHistory(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.items)) return v.items;
  return [];
}
var nonceSeq = 0;
async function sendCommand(action, payload, waitMs = 9e4) {
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
  return { ok: false, pending: true, error: `\u547D\u4EE4\u5DF2\u6295\u9012\uFF0C${Math.round(waitMs / 1e3)}s \u5185\u672A\u89C1\u56DE\u6267\uFF08\u4EFB\u52A1\u53EF\u80FD\u4ECD\u5728\u540E\u53F0\u8FD0\u884C\uFF0C\u7A0D\u540E\u67E5\u770B\u300C\u4F53\u68C0\u300D\u9875\u6700\u65B0\u62A5\u544A\uFF09` };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function scoreColor(score) {
  if (score == null) return "#8B95A7";
  if (score >= 85) return "#3FB950";
  if (score >= 60) return "#D29922";
  return "#F85149";
}
function fmtMs(ms) {
  if (ms == null) return "\u2014";
  if (ms >= 1e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
function fmtTps(tps) {
  if (tps == null) return "\u2014";
  return `${tps} tok/s`;
}
function fmtTime(iso) {
  if (!iso) return "\u2014";
  return String(iso).replace("T", " ").slice(5, 16);
}

// src/ProfilesTab.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var EMPTY_FORM = {
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  wire: "openai-chat-completions"
};
function ProfilesTab({ profiles, onRefresh, onImport }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const startAdd = () => {
    setErr("");
    setMsg("");
    setForm({ ...EMPTY_FORM });
  };
  const startEdit = (p) => {
    setErr("");
    setMsg("");
    setForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: "", model: p.model, wire: p.wire });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErr("");
    try {
      const payload = {
        id: form.id || void 0,
        name: form.name || form.baseUrl.replace(/^https?:\/\//, "").slice(0, 40),
        baseUrl: form.baseUrl,
        model: form.model,
        wire: form.wire
      };
      if (form.apiKey) payload.apiKey = form.apiKey;
      if (!form.id) payload.allowEmptyKey = form.apiKey === "";
      const r = await sendCommand("profiles_upsert", { profile: payload }, 15e3);
      if (!r || r.ok !== true) setErr(r && r.error || "\u4FDD\u5B58\u5931\u8D25");
      else {
        setMsg(`\u5DF2\u4FDD\u5B58\uFF08key \u63A9\u7801\u5C06\u663E\u793A\u4E8E\u5217\u8868\uFF09${r.savedToFile === false ? "\uFF1B\u6CE8\u610F\uFF1A\u672C\u5730\u6587\u4EF6\u4FDD\u5B58\u5931\u8D25\uFF0C\u670D\u52A1\u91CD\u542F\u540E\u624B\u52A8\u6863\u6848\u4F1A\u4E22" : ""}`);
        setForm(null);
      }
      await onRefresh();
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(false);
  };
  const del = async (p) => {
    if (!confirm(`\u5220\u9664\u6863\u6848\u300C${p.name}\u300D\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF08\u5BBF\u4E3B\u5BFC\u5165\u6863\u6848\u91CD\u65B0\u5BFC\u5165\u5373\u53EF\u6062\u590D\uFF09\u3002`)) return;
    setBusy(true);
    setErr("");
    try {
      const r = await sendCommand("profiles_delete", { id: p.id, force: p.source === "host" }, 15e3);
      if (!r || r.ok !== true) setErr(r && r.error || "\u5220\u9664\u5931\u8D25");
      await onRefresh();
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(false);
  };
  const hostCount = profiles.filter((p) => p.source === "host").length;
  const manualCount = profiles.length - hostCount;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "lp-bar" }),
      "\u7AEF\u70B9\u6863\u6848",
      /* @__PURE__ */ jsx("span", { className: "lp-hint", children: "key \u5168\u7A0B\u63A9\u7801 \xB7 \u5B8C\u6574 key \u53EA\u5B58\u670D\u52A1\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "lp-card", children: /* @__PURE__ */ jsxs("div", { className: "lp-card-b", style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("button", { className: "lp-btn", onClick: onImport, disabled: busy, children: "\u27F3 \u5BFC\u5165\u5BBF\u4E3B\u6863\u6848" }),
      /* @__PURE__ */ jsx("button", { className: "lp-btn ghost", onClick: startAdd, children: "+ \u624B\u52A8\u6DFB\u52A0\u7AEF\u70B9" }),
      /* @__PURE__ */ jsxs("span", { className: "lp-sub", children: [
        "\u5BBF\u4E3B ",
        hostCount,
        " \xB7 \u624B\u52A8 ",
        manualCount
      ] })
    ] }) }),
    msg && /* @__PURE__ */ jsxs("div", { className: "lp-ok", style: { padding: "0 16px 6px", fontSize: 11.5 }, children: [
      "\u2713 ",
      msg
    ] }),
    err && /* @__PURE__ */ jsx("div", { className: "lp-err", children: err }),
    form && /* @__PURE__ */ jsx("div", { className: "lp-modal-bg", onClick: (e) => {
      if (e.target === e.currentTarget) setForm(null);
    }, children: /* @__PURE__ */ jsxs("div", { className: "lp-modal", children: [
      /* @__PURE__ */ jsx("button", { className: "lp-close", onClick: () => setForm(null), children: "\u2715" }),
      /* @__PURE__ */ jsx("h4", { children: form.id ? "\u7F16\u8F91\u6863\u6848" : "\u624B\u52A8\u6DFB\u52A0\u7AEF\u70B9" }),
      /* @__PURE__ */ jsxs("div", { className: "lp-fm", children: [
        /* @__PURE__ */ jsx("label", { children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx("input", { className: "lp-inp", value: form.name, placeholder: "\u5982\uFF1ADeepSeek \u5B98\u65B9 / \u672C\u5730 Ollama", onChange: (e) => setForm({ ...form, name: e.target.value }) }),
        /* @__PURE__ */ jsx("label", { children: "Base URL" }),
        /* @__PURE__ */ jsx("input", { className: "lp-inp lp-mono", value: form.baseUrl, placeholder: "https://api.deepseek.com\uFF08# \u7ED3\u5C3E=\u9010\u5B57\u4F7F\u7528\uFF09", onChange: (e) => setForm({ ...form, baseUrl: e.target.value }) }),
        /* @__PURE__ */ jsx("label", { children: "\u534F\u8BAE" }),
        /* @__PURE__ */ jsxs("select", { className: "lp-sel", style: { width: "100%" }, value: form.wire, onChange: (e) => setForm({ ...form, wire: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "openai-chat-completions", children: "OpenAI Chat Completions\uFF08/v1/chat/completions\uFF09" }),
          /* @__PURE__ */ jsx("option", { value: "anthropic-messages", children: "Anthropic Messages\uFF08/v1/messages\uFF09" })
        ] }),
        /* @__PURE__ */ jsx("label", { children: "\u6A21\u578B\u540D" }),
        /* @__PURE__ */ jsx("input", { className: "lp-inp lp-mono", value: form.model, placeholder: "\u5982 deepseek-chat / qwen2.5:7b", onChange: (e) => setForm({ ...form, model: e.target.value }) }),
        /* @__PURE__ */ jsx("label", { children: form.id ? "\u65B0 Key" : "API Key" }),
        /* @__PURE__ */ jsx("input", { className: "lp-inp lp-mono", type: "password", value: form.apiKey, placeholder: form.id ? "\u7559\u7A7A=\u4E0D\u4FEE\u6539" : "\u672C\u5730\u65E0\u9274\u6743\u7AEF\u70B9\u53EF\u7559\u7A7A", onChange: (e) => setForm({ ...form, apiKey: e.target.value }) }),
        /* @__PURE__ */ jsx("div", { className: "lp-fm-full lp-sub", children: "Key \u53EA\u4FDD\u5B58\u5728\u672C\u673A\u670D\u52A1\u76EE\u5F55\uFF08\u4E0E\u5BBF\u4E3B config.json \u540C\u4FE1\u4EFB\u57DF\uFF09\uFF0C\u62A5\u544A/\u5386\u53F2/AI \u8FD4\u56DE\u4E2D\u53EA\u51FA\u73B0\u63A9\u7801\uFF08****\u540E4\u4F4D\uFF09\u3002" }),
        /* @__PURE__ */ jsx("div", { className: "lp-fm-full", style: { textAlign: "right" }, children: /* @__PURE__ */ jsx("button", { className: "lp-btn", onClick: save, disabled: busy || !form.baseUrl, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }) })
      ] })
    ] }) }),
    !profiles.length && /* @__PURE__ */ jsx("div", { className: "lp-empty", children: "\u6682\u65E0\u6863\u6848\u3002\u70B9\u300C\u5BFC\u5165\u5BBF\u4E3B\u6863\u6848\u300D\u8BFB\u53D6 Polaris \u5DF2\u914D\u7F6E\u7684\u6A21\u578B\u4F9B\u5E94\u5546\uFF0C\u6216\u624B\u52A8\u6DFB\u52A0\u3002" }),
    profiles.map((p) => /* @__PURE__ */ jsx("div", { className: "lp-card", children: /* @__PURE__ */ jsxs("div", { className: "lp-row", style: { borderTop: "none" }, children: [
      /* @__PURE__ */ jsxs("div", { className: "lp-row-h", children: [
        /* @__PURE__ */ jsx("b", { style: { fontSize: 12.5 }, children: p.name }),
        /* @__PURE__ */ jsx("span", { className: `lp-badge ${p.source}`, children: p.source === "host" ? "\u5BBF\u4E3B" : "\u624B\u52A8" }),
        /* @__PURE__ */ jsx("span", { className: "lp-tag", children: p.wire === "anthropic-messages" ? "Anthropic" : "OpenAI" }),
        /* @__PURE__ */ jsx("span", { className: "lp-tag lp-mono", children: p.model || "\u65E0\u6A21\u578B" }),
        /* @__PURE__ */ jsxs("span", { className: "lp-tag lp-mono", children: [
          "key ",
          p.keyMask
        ] }),
        /* @__PURE__ */ jsx("span", { className: "lp-hint", children: fmtTime(p.importedAt) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "lp-sub lp-mono", style: { marginTop: 3, wordBreak: "break-all" }, children: p.baseUrl }),
      /* @__PURE__ */ jsxs("div", { style: { marginTop: 6, display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx("button", { className: "lp-btn ghost sm", onClick: () => startEdit(p), children: "\u7F16\u8F91" }),
        /* @__PURE__ */ jsx("button", { className: "lp-btn danger sm", disabled: busy, onClick: () => del(p), children: "\u5220\u9664" })
      ] })
    ] }) }, p.id))
  ] });
}

// src/ProbeTab.tsx
import { useEffect, useMemo, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var STEP_ORDER = ["connect", "chat", "models", "stream", "tools"];
var STEP_ICON = { connect: "\u{1F50C}", chat: "\u{1F4AC}", models: "\u{1F4CB}", stream: "\u{1F30A}", tools: "\u{1F6E0}" };
function stepLine(s) {
  if (!s) return { ic: "\xB7", tt: "\u672A\u6267\u884C", metric: "" };
  if (s.skipped) return { ic: "\u23ED", tt: `${s.label} \u8DF3\u8FC7`, metric: s.detail || "" };
  if (s.ok === false) {
    const e = s.error || { code: "?", cn: "\u5931\u8D25" };
    return { ic: "\u274C", tt: `${s.label}\uFF1A${e.cn} [${e.code}]`, metric: e.hint || "" };
  }
  let metric = "";
  if (s.name === "models") metric = `${s.count ?? 0} \u4E2A\u6A21\u578B${s.hasTarget ? "\uFF0C\u76EE\u6807\u6A21\u578B\u5728\u5217 \u2713" : s.hasTarget === false ? "\uFF0C\u76EE\u6807\u6A21\u578B\u4E0D\u5728\u5217 \u26A0" : ""}${s.sample && s.sample.length ? `\uFF08${s.sample.slice(0, 3).join(", ")}\u2026\uFF09` : ""}`;
  else if (s.name === "stream") metric = `TTFT ${fmtMs(s.ttftMs)} \xB7 ${fmtTps(s.tps)} \xB7 \u603B ${fmtMs(s.totalMs)}${s.stopReason ? ` \xB7 ${s.stopReason}` : ""}`;
  else if (s.name === "chat") metric = `${fmtMs(s.ms)}${s.finishReason ? ` \xB7 finish=${s.finishReason}` : ""}${s.content ? ` \xB7 \u300C${s.content.slice(0, 24)}\u300D` : ""}`;
  else if (s.name === "tools") metric = s.toolCalled ? `\u5DF2\u89E6\u53D1 \u2713 ${s.detail || ""}` : `HTTP \u6210\u529F\u4F46\u6A21\u578B\u672A\u53D1\u8D77\u5DE5\u5177\u8C03\u7528${s.detail ? `\uFF08${s.detail}\uFF09` : ""}`;
  else metric = `HTTP \u5DF2\u5E94\u7B54\uFF08${fmtMs(s.ms)}\uFF09`;
  return { ic: "\u2713", tt: s.label, metric };
}
function SuiteReportCard({ rep }) {
  const score = rep.score ? rep.score.total : 0;
  const verdict = rep.verdict;
  const warns = useMemo(() => {
    const out = [];
    for (const k of STEP_ORDER) {
      const st = rep.steps && rep.steps[k];
      for (const c of st && st.compat || []) out.push(c);
    }
    return out;
  }, [rep]);
  return /* @__PURE__ */ jsx2("div", { className: "lp-card", children: /* @__PURE__ */ jsxs2("div", { className: "lp-card-b", children: [
    /* @__PURE__ */ jsxs2("div", { className: "lp-row-h", style: { borderTop: "none", paddingTop: 0 }, children: [
      /* @__PURE__ */ jsx2("b", { style: { fontSize: 13 }, children: rep.profile.name }),
      /* @__PURE__ */ jsx2("span", { className: `lp-badge ${verdict ? verdict.level : ""}`, children: verdict ? verdict.cn : "\u2014" }),
      /* @__PURE__ */ jsx2("span", { className: "lp-tag", children: rep.profile.wire === "anthropic-messages" ? "Anthropic" : "OpenAI" }),
      /* @__PURE__ */ jsx2("span", { className: "lp-tag lp-mono", children: rep.profile.model || "(\u65E0\u6A21\u578B)" }),
      /* @__PURE__ */ jsx2("span", { className: "lp-hint lp-mono", children: fmtTime(rep.finishedAt || rep.startedAt) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "lp-sum", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("b", { style: { color: scoreColor(score) }, children: score }),
        /* @__PURE__ */ jsx2("small", { children: "\u5065\u5EB7\u5206 /100" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("b", { className: "lp-num", children: rep.steps.stream && rep.steps.stream.ok ? fmtMs(rep.steps.stream.ttftMs) : "\u2014" }),
        /* @__PURE__ */ jsx2("small", { children: "\u9996\u5B57 TTFT" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("b", { className: "lp-num", children: rep.steps.stream && rep.steps.stream.ok ? fmtTps(rep.steps.stream.tps) : "\u2014" }),
        /* @__PURE__ */ jsx2("small", { children: "\u751F\u6210\u901F\u5EA6" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("b", { className: "lp-num", children: rep.steps.chat && rep.steps.chat.ok ? fmtMs(rep.steps.chat.ms) : "\u2014" }),
        /* @__PURE__ */ jsx2("small", { children: "\u5BF9\u8BDD\u5EF6\u8FDF" })
      ] })
    ] }),
    rep.fatal && /* @__PURE__ */ jsxs2("div", { className: "lp-warn", style: { marginBottom: 6 }, children: [
      "\u270B ",
      rep.fatal.cn,
      rep.fatal.hint ? `\uFF1A${rep.fatal.hint}` : ""
    ] }),
    /* @__PURE__ */ jsx2("div", { children: STEP_ORDER.map((k) => {
      const s = rep.steps && rep.steps[k];
      const l = stepLine(s);
      return /* @__PURE__ */ jsxs2("div", { className: "lp-step", children: [
        /* @__PURE__ */ jsxs2("span", { className: "lp-step-ic", children: [
          STEP_ICON[k],
          l.ic === "\xB7" ? "" : ""
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "lp-step-ic", style: { width: "auto" }, children: l.ic }),
        /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsx2("span", { className: "lp-step-tt", children: l.tt }),
          l.metric && /* @__PURE__ */ jsx2("span", { className: "lp-step-metric", style: { display: "block" }, children: l.metric })
        ] }),
        s && s.ms != null && !s.skipped ? /* @__PURE__ */ jsx2("span", { className: "lp-num lp-muted", children: fmtMs(s.ms) }) : null
      ] }, k);
    }) }),
    rep.urls && /* @__PURE__ */ jsxs2("dl", { className: "lp-kv", style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx2("dt", { children: "\u89E3\u6790\u7EC8\u70B9" }),
      /* @__PURE__ */ jsx2("dd", { className: "lp-mono", children: rep.urls.chat }),
      /* @__PURE__ */ jsx2("dt", { children: "\u6A21\u578B\u8868" }),
      /* @__PURE__ */ jsx2("dd", { className: "lp-mono", children: rep.urls.models }),
      rep.urls.note ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
        /* @__PURE__ */ jsx2("dt", { children: "\u5F52\u4E00\u65B9\u5F0F" }),
        /* @__PURE__ */ jsx2("dd", { children: rep.urls.note })
      ] }) : null
    ] }),
    warns.length > 0 && /* @__PURE__ */ jsx2("div", { className: "lp-warn", style: { marginTop: 8, fontSize: 10.5 }, children: warns.slice(0, 5).map((w, i) => /* @__PURE__ */ jsxs2("div", { children: [
      "\u26A0 ",
      w
    ] }, i)) })
  ] }) });
}
function BenchCard({ rep }) {
  return /* @__PURE__ */ jsx2("div", { className: "lp-card", children: /* @__PURE__ */ jsxs2("div", { className: "lp-card-b", children: [
    /* @__PURE__ */ jsxs2("div", { className: "lp-row-h", style: { borderTop: "none", paddingTop: 0 }, children: [
      /* @__PURE__ */ jsxs2("b", { style: { fontSize: 13 }, children: [
        "\u57FA\u51C6 \xB7 ",
        rep.profile.name
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "lp-hint lp-mono", children: fmtTime(rep.finishedAt) })
    ] }),
    rep.bench.sizes.length === 0 && /* @__PURE__ */ jsx2("div", { className: "lp-empty", children: "\u65E0\u6570\u636E" }),
    rep.bench.sizes.map((s, i) => /* @__PURE__ */ jsxs2("div", { className: "lp-step", style: { borderTop: i ? void 0 : "none" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "lp-step-ic", children: s.ttftP50 == null ? "\u274C" : "\u{1F4CA}" }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "lp-step-tt", children: [
          "\u2248",
          s.tokens,
          " tok \u63D0\u793A \xD7 ",
          s.rounds,
          " \u8F6E"
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "lp-step-metric", style: { display: "block" }, children: s.ttftP50 != null ? `TTFT P50 ${fmtMs(s.ttftP50)}\uFF08${fmtMs(s.ttftMin)}~${fmtMs(s.ttftMax)}\uFF09 \xB7 TPS P50 ${s.tpsP50}\uFF08${s.tpsMin}~${s.tpsMax}\uFF09 \xB7 \u603B ${fmtMs(s.totalP50)}${s.errs ? ` \xB7 \u5931\u8D25 ${s.errs} \u8F6E` : ""}` : `\u5931\u8D25\uFF1A${s.error && s.error.cn || "?"}` })
      ] })
    ] }, i)),
    (rep.bench.compat || []).map((c, i) => /* @__PURE__ */ jsxs2("div", { className: "lp-warn", children: [
      "\u26A0 ",
      c
    ] }, i))
  ] }) });
}
function ProbeTab({ profiles, latest, meta, onRefresh }) {
  const [selected, setSelected] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [err, setErr] = useState2("");
  const [benchOn, setBenchOn] = useState2(false);
  const [benchSizes, setBenchSizes] = useState2([512]);
  const [benchRounds, setBenchRounds] = useState2(2);
  const [benchRep, setBenchRep] = useState2(null);
  const [benchBusy, setBenchBusy] = useState2(false);
  useEffect(() => {
    if (!selected && profiles.length) setSelected(profiles[0].id);
  }, [profiles, selected]);
  const running = !!(meta && meta.running);
  const profile = profiles.find((p) => p.id === selected) || null;
  const runSuite = async () => {
    if (!profile || busy || running) return;
    setBusy(true);
    setErr("");
    try {
      const r = await sendCommand("run_suite", { profileId: profile.id }, 12e4);
      if (r && r.ok === false && r.error && !r.pending) setErr(r.error);
    } catch (e) {
      setErr(String(e.message || e));
    }
    await onRefresh();
    setBusy(false);
  };
  const runBench = async () => {
    if (!profile || benchBusy || running) return;
    setBenchBusy(true);
    setErr("");
    try {
      const r = await sendCommand("run_bench", { profileId: profile.id, sizes: benchSizes, rounds: benchRounds }, 36e4);
      if (r && r.runId) {
        const rep = await loadBenchReport(r.runId);
        if (rep) setBenchRep(rep);
      }
      if (r && r.ok === false && r.error && !r.pending) setErr(r.error);
    } catch (e) {
      setErr(String(e.message || e));
    }
    await onRefresh();
    setBenchBusy(false);
  };
  const toggleSize = (n) => {
    setBenchSizes((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b));
  };
  if (!profiles.length) {
    return /* @__PURE__ */ jsxs2("div", { className: "lp-empty", children: [
      "\u6682\u65E0\u6863\u6848\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u8BF7\u5230\u300C\u6863\u6848\u300D\u9875 ",
      /* @__PURE__ */ jsx2("b", { children: "\u5BFC\u5165\u5BBF\u4E3B\u6863\u6848" }),
      "\uFF08\u8BFB\u53D6 Polaris \u5DF2\u914D\u7F6E\u7684\u6A21\u578B\u4F9B\u5E94\u5546\uFF09",
      /* @__PURE__ */ jsx2("br", {}),
      "\u6216\u624B\u52A8\u6DFB\u52A0 OpenAI / Anthropic \u517C\u5BB9\u7AEF\u70B9\u3002"
    ] });
  }
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "lp-bar" }),
      "\u53D1\u8D77\u4F53\u68C0",
      /* @__PURE__ */ jsx2("span", { className: "lp-hint", children: "\u6BCF\u6B65 \u226416 token\uFF0C\u82B1\u8D39\u53EF\u5FFD\u7565" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "lp-card", children: /* @__PURE__ */ jsxs2("div", { className: "lp-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2("select", { className: "lp-sel", value: selected, onChange: (e) => setSelected(e.target.value), style: { flex: 1, minWidth: 180 }, children: profiles.map((p) => /* @__PURE__ */ jsxs2("option", { value: p.id, children: [
          p.name,
          "\uFF08",
          p.wire === "anthropic-messages" ? "Anthropic" : "OpenAI",
          " \xB7 ",
          p.model || "\u65E0\u6A21\u578B",
          "\uFF09"
        ] }, p.id)) }),
        /* @__PURE__ */ jsx2("button", { className: "lp-btn", disabled: busy || running, onClick: runSuite, children: busy || running ? "\u4F53\u68C0\u4E2D\u2026" : "\u5F00\u59CB\u4F53\u68C0" })
      ] }),
      err && /* @__PURE__ */ jsx2("div", { className: "lp-err", style: { paddingLeft: 0 }, children: err }),
      /* @__PURE__ */ jsx2("div", { className: "lp-sub", style: { marginTop: 6 }, children: "\u4E94\u6B65\u4F53\u68C0\uFF1A\u8FDE\u901A\u6027 \u2192 \u5BF9\u8BDD\uFF08\u9274\u6743+\u751F\u6210\uFF09\u2192 \u6A21\u578B\u8868 \u2192 \u6D41\u5F0F\uFF08TTFT/TPS\uFF09\u2192 \u5DE5\u5177\u8C03\u7528\uFF1B\u5931\u8D25\u6B65\u9AA4\u81EA\u52A8\u7ED9\u51FA\u4E2D\u6587\u8BCA\u65AD\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "lp-bar" }),
      "\u57FA\u51C6\u6D4B\u8BD5",
      /* @__PURE__ */ jsx2("span", { className: "lp-hint lp-warn", children: "\u771F\u5B9E\u82B1\u8D39 \xB7 \u663E\u5F0F\u53D1\u8D77" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "lp-card", children: /* @__PURE__ */ jsx2("div", { className: "lp-card-b", children: !benchOn ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsx2("div", { className: "lp-sub", children: "\u5BF9\u7AEF\u70B9\u505A\u591A\u6863\u63D0\u793A\u8BCD\uFF0864/512/2048 \u2248token\uFF09\u6D41\u5F0F\u57FA\u51C6\uFF0C\u6D4B TTFT \u4E0E TPS \u5206\u4F4D\u6570\u3002\u4F1A\u53D1\u9001\u771F\u5B9E\u751F\u6210\u8BF7\u6C42\u4EA7\u751F\u5C11\u91CF\u8D39\u7528\u3002" }),
      /* @__PURE__ */ jsx2("button", { className: "lp-btn ghost sm", style: { marginTop: 8 }, onClick: () => setBenchOn(true), children: "\u5C55\u5F00\u57FA\u51C6\u9009\u9879" })
    ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
        [64, 512, 2048].map((n) => /* @__PURE__ */ jsxs2("label", { style: { fontSize: 11.5, color: "#8B95A7", display: "flex", gap: 4, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: benchSizes.includes(n), onChange: () => toggleSize(n) }),
          "\u2248",
          n,
          " tok"
        ] }, n)),
        /* @__PURE__ */ jsx2("select", { className: "lp-sel", value: benchRounds, onChange: (e) => setBenchRounds(Number(e.target.value)), children: [1, 2, 3, 5].map((n) => /* @__PURE__ */ jsxs2("option", { value: n, children: [
          n,
          " \u8F6E/\u6863"
        ] }, n)) }),
        /* @__PURE__ */ jsx2("button", { className: "lp-btn green", disabled: benchBusy || running || !benchSizes.length, onClick: runBench, children: benchBusy || running ? "\u57FA\u51C6\u4E2D\u2026" : `\u53D1\u9001 ${benchSizes.length * benchRounds} \u6B21\u8BF7\u6C42` }),
        /* @__PURE__ */ jsx2("button", { className: "lp-btn ghost sm", onClick: () => setBenchOn(false), children: "\u6536\u8D77" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "lp-sub", style: { marginTop: 6 }, children: [
        "\u9884\u8BA1 ",
        benchSizes.length * benchRounds,
        " \u6B21\u6D41\u5F0F\u8BF7\u6C42\uFF0C\u6BCF\u6B21\u751F\u6210 \u226464 token\uFF1B2048 \u6863\u8F93\u5165 token \u8BA1\u8D39\u66F4\u9AD8\uFF0C\u8BF7\u6CE8\u610F\u4F9B\u5E94\u5546\u5B9A\u4EF7\u3002"
      ] })
    ] }) }) }),
    latest && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "lp-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "lp-bar" }),
        "\u6700\u8FD1\u4F53\u68C0\u62A5\u544A",
        /* @__PURE__ */ jsxs2("span", { className: "lp-hint", children: [
          "runId ",
          latest.runId
        ] })
      ] }),
      /* @__PURE__ */ jsx2(SuiteReportCard, { rep: latest })
    ] }),
    benchRep && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "lp-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "lp-bar" }),
        "\u6700\u8FD1\u57FA\u51C6\u62A5\u544A"
      ] }),
      /* @__PURE__ */ jsx2(BenchCard, { rep: benchRep })
    ] }),
    !latest && !benchRep && /* @__PURE__ */ jsx2("div", { className: "lp-empty", children: "\u5C1A\u65E0\u62A5\u544A\u3002\u9009\u62E9\u6863\u6848\u540E\u70B9\u300C\u5F00\u59CB\u4F53\u68C0\u300D\u3002" })
  ] });
}

// src/CompareTab.tsx
import { useMemo as useMemo2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function CompareTab({ profiles, latest, history }) {
  const [selected, setSelected] = useState3([]);
  const latestByProfile = useMemo2(() => {
    const m = /* @__PURE__ */ new Map();
    if (latest && latest.profile) m.set(latest.profile.id, latest);
    return m;
  }, [latest]);
  const avgScore = useMemo2(() => {
    const h = normalizeHistory(history);
    const m = /* @__PURE__ */ new Map();
    const acc = /* @__PURE__ */ new Map();
    for (const x of h) {
      if (x.kind !== "suite" || x.score == null) continue;
      const arr = acc.get(x.profileId) || [];
      arr.push(x.score);
      acc.set(x.profileId, arr);
    }
    for (const [id, arr] of acc) {
      m.set(id, { avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), n: arr.length, last: arr[0] });
    }
    return m;
  }, [history]);
  const toggle = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const rows = profiles.filter((p) => selected.includes(p.id));
  const hasData = rows.some((p) => latestByProfile.has(p.id));
  const cell = (rep, fn, okOnly) => {
    if (!rep) return "\u2014";
    return fn(rep);
  };
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "lp-bar" }),
      "\u9009\u62E9\u6863\u6848",
      /* @__PURE__ */ jsx3("span", { className: "lp-hint", children: "\u6A2A\u5411\u5BF9\u6BD4\u5404\u81EA\u6700\u8FD1\u4E00\u6B21\u4F53\u68C0" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "lp-card", children: /* @__PURE__ */ jsxs3("div", { className: "lp-card-b", style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [
      profiles.length === 0 && /* @__PURE__ */ jsx3("span", { className: "lp-sub", children: "\u6682\u65E0\u6863\u6848" }),
      profiles.map((p) => /* @__PURE__ */ jsxs3("label", { style: { display: "flex", gap: 5, alignItems: "center", fontSize: 11.5, color: "#C9D1D9", background: selected.includes(p.id) ? "#1C2330" : "transparent", border: "1px solid #242C3A", borderRadius: 8, padding: "4px 9px", cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: selected.includes(p.id), onChange: () => toggle(p.id) }),
        p.name,
        avgScore.has(p.id) && /* @__PURE__ */ jsxs3("span", { className: "lp-num lp-muted", children: [
          "\u5747",
          avgScore.get(p.id).avg
        ] })
      ] }, p.id)),
      selected.length > 0 && /* @__PURE__ */ jsx3("button", { className: "lp-btn ghost sm", onClick: () => setSelected([]), children: "\u6E05\u7A7A" })
    ] }) }),
    !hasData && selected.length > 0 && /* @__PURE__ */ jsx3("div", { className: "lp-empty", children: "\u6240\u9009\u6863\u6848\u8FD8\u6CA1\u6709\u4F53\u68C0\u62A5\u544A\u2014\u2014\u5148\u5230\u300C\u4F53\u68C0\u300D\u9875\u9010\u4E2A\u4F53\u68C0\uFF08\u62A5\u544A\u4E2D\u4F1A\u4FDD\u5B58\u5FEB\u7167\u4F9B\u5BF9\u6BD4\uFF09\u3002" }),
    selected.length === 0 && /* @__PURE__ */ jsxs3("div", { className: "lp-empty", children: [
      "\u52FE\u9009\u8981\u5BF9\u6BD4\u7684\u6863\u6848\uFF08\u5EFA\u8BAE 2-4 \u4E2A\uFF09\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u5BF9\u6BD4\u57FA\u4E8E\u5404\u81EA\u300C\u6700\u8FD1\u4E00\u6B21\u4F53\u68C0\u300D\u7684\u5FEB\u7167\u3002"
    ] }),
    hasData && /* @__PURE__ */ jsxs3(Fragment3, { children: [
      /* @__PURE__ */ jsxs3("div", { className: "lp-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "lp-bar" }),
        "\u5BF9\u6BD4\u77E9\u9635"
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "lp-card", style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs3("table", { className: "lp-tb", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("th", { children: "\u6307\u6807" }),
          rows.map((p) => /* @__PURE__ */ jsx3("th", { className: "wrap", children: p.name }, p.id))
        ] }) }),
        /* @__PURE__ */ jsxs3("tbody", { children: [
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u5065\u5EB7\u5206" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const sc = rep && rep.score ? rep.score.total : null;
              return /* @__PURE__ */ jsxs3("td", { children: [
                /* @__PURE__ */ jsx3("b", { style: { color: scoreColor(sc) }, className: "lp-num", children: sc != null ? sc : "\u2014" }),
                rep && rep.verdict ? /* @__PURE__ */ jsxs3("span", { className: "lp-muted", children: [
                  " ",
                  rep.verdict.cn
                ] }) : null
              ] }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "TTFT\uFF08\u6D41\u5F0F\uFF09" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const s = rep && rep.steps.stream;
              return /* @__PURE__ */ jsx3("td", { className: "lp-num", children: s && s.ok ? fmtMs(s.ttftMs) : "\u2014" }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u751F\u6210\u901F\u5EA6" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const s = rep && rep.steps.stream;
              return /* @__PURE__ */ jsx3("td", { className: "lp-num", children: s && s.ok ? fmtTps(s.tps) : "\u2014" }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u5BF9\u8BDD\u5EF6\u8FDF" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const s = rep && rep.steps.chat;
              return /* @__PURE__ */ jsx3("td", { className: "lp-num", children: s && s.ok ? fmtMs(s.ms) : "\u2014" }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u6A21\u578B\u8868" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const s = rep && rep.steps.models;
              if (!s || s.skipped) return /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u2014" }, p.id);
              if (!s.ok) return /* @__PURE__ */ jsx3("td", { style: { color: "#F85149" }, children: "\u5931\u8D25" }, p.id);
              return /* @__PURE__ */ jsxs3("td", { className: "lp-num", children: [
                s.count,
                s.hasTarget ? " \u2713" : s.hasTarget === false ? " \u26A0" : ""
              ] }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u5DE5\u5177\u8C03\u7528" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const s = rep && rep.steps.tools;
              if (!s || s.skipped) return /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u2014" }, p.id);
              if (!s.ok) return /* @__PURE__ */ jsx3("td", { style: { color: "#F85149" }, children: "\u5931\u8D25" }, p.id);
              return /* @__PURE__ */ jsx3("td", { children: s.toolCalled ? "\u2713 \u652F\u6301" : "\u26A0 \u672A\u89E6\u53D1" }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u6D41\u5F0F\u4E2D\u65AD" }),
            rows.map((p) => {
              const rep = latestByProfile.get(p.id);
              const s = rep && rep.steps.stream;
              if (!s || s.skipped) return /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u2014" }, p.id);
              if (s.ok) return /* @__PURE__ */ jsx3("td", { className: "lp-ok", children: "\u2713 \u5B8C\u6574" }, p.id);
              return /* @__PURE__ */ jsx3("td", { style: { color: "#F85149" }, className: "wrap", children: s.error ? s.error.cn : "\u5931\u8D25" }, p.id);
            })
          ] }),
          /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { className: "lp-muted", children: "\u5386\u53F2\u5747\u5206" }),
            rows.map((p) => {
              const a = avgScore.get(p.id);
              return /* @__PURE__ */ jsx3("td", { className: "lp-num", children: a ? `${a.avg}\uFF08${a.n} \u6B21\uFF09` : "\u2014" }, p.id);
            })
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsx3("div", { className: "lp-sub", style: { margin: "0 18px 10px" }, children: "\u5BF9\u6BD4\u53D6\u5404\u81EA\u6700\u8FD1\u4E00\u6B21\u4F53\u68C0\u5FEB\u7167\uFF0C\u975E\u540C\u523B\u5E76\u53D1\u6D4B\u91CF\u2014\u2014\u4F9B\u5E94\u5546\u8D1F\u8F7D\u968F\u65F6\u6BB5\u6CE2\u52A8\uFF0C\u91CD\u8981\u7ED3\u8BBA\u5EFA\u8BAE\u95F4\u9694\u590D\u6D4B\u3002" })
    ] })
  ] });
}

// src/HistoryTab.tsx
import { useMemo as useMemo3, useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function HistoryTab({ history }) {
  const [filter, setFilter] = useState4("");
  const items = useMemo3(() => {
    const h = normalizeHistory(history);
    return filter ? h.filter((x) => x.profileId === filter) : h;
  }, [history, filter]);
  const byProfile = useMemo3(() => {
    const h = normalizeHistory(history);
    const m = /* @__PURE__ */ new Map();
    for (const x of h) {
      if (x.kind !== "suite") continue;
      const arr = m.get(x.profileId) || [];
      arr.push(x);
      m.set(x.profileId, arr);
    }
    return [...m.entries()].slice(0, 8);
  }, [history]);
  if (!normalizeHistory(history).length) {
    return /* @__PURE__ */ jsx4("div", { className: "lp-empty", children: "\u6682\u65E0\u5386\u53F2\u3002\u6BCF\u6B21\u300C\u5F00\u59CB\u4F53\u68C0\u300D\u540E\u81EA\u52A8\u8BB0\u5F55\uFF08\u5206\u6570/TTFT/TPS \u5FEB\u7167\uFF09\u3002" });
  }
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lp-bar" }),
      "\u8D8B\u52BF",
      /* @__PURE__ */ jsxs4("span", { className: "lp-hint", children: [
        "\u6BCF\u6B21\u4F53\u68C0\u5FEB\u7167 \xB7 \u6700\u8FD1 ",
        normalizeHistory(history).length,
        " \u6761"
      ] })
    ] }),
    byProfile.map(([pid, entries]) => {
      const scores = entries.map((e) => e.score ?? 0).reverse();
      const max = Math.max(100, ...scores);
      return /* @__PURE__ */ jsx4("div", { className: "lp-card", children: /* @__PURE__ */ jsxs4("div", { className: "lp-card-b", children: [
        /* @__PURE__ */ jsxs4("div", { className: "lp-row-h", style: { borderTop: "none", paddingTop: 0 }, children: [
          /* @__PURE__ */ jsx4("b", { style: { fontSize: 12.5 }, children: entries[0].profileName }),
          /* @__PURE__ */ jsxs4("span", { className: "lp-sub", children: [
            entries.length,
            " \u6B21\u4F53\u68C0"
          ] }),
          scores.length > 1 && /* @__PURE__ */ jsxs4("span", { className: "lp-sub", style: { marginLeft: "auto" }, children: [
            scores[scores.length - 1] >= scores[0] ? "\u2197" : "\u2198",
            " ",
            "\u9996 ",
            scores[0],
            " \u2192 \u73B0 ",
            scores[scores.length - 1]
          ] })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "lp-hb", children: [
          scores.map((s, i) => /* @__PURE__ */ jsx4("i", { style: { height: `${Math.max(6, s / max * 100)}%`, background: scoreColor(s) }, title: `\u7B2C ${i + 1} \u6B21\uFF1A${s} \u5206` }, i)),
          !scores.length && /* @__PURE__ */ jsx4("span", { className: "lp-sub", children: "\u65E0\u5206\u6570\u8BB0\u5F55" })
        ] })
      ] }) }, pid);
    }),
    /* @__PURE__ */ jsxs4("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lp-bar" }),
      "\u660E\u7EC6",
      /* @__PURE__ */ jsxs4("select", { className: "lp-sel", style: { marginLeft: 10 }, value: filter, onChange: (e) => setFilter(e.target.value), children: [
        /* @__PURE__ */ jsx4("option", { value: "", children: "\u5168\u90E8\u6863\u6848" }),
        byProfile.map(([pid, entries]) => /* @__PURE__ */ jsx4("option", { value: pid, children: entries[0].profileName }, pid))
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "lp-card", style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs4("table", { className: "lp-tb", children: [
      /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("th", { children: "\u65F6\u95F4" }),
        /* @__PURE__ */ jsx4("th", { children: "\u6863\u6848" }),
        /* @__PURE__ */ jsx4("th", { children: "\u7C7B\u578B" }),
        /* @__PURE__ */ jsx4("th", { children: "\u7ED3\u679C" }),
        /* @__PURE__ */ jsx4("th", { children: "TTFT" }),
        /* @__PURE__ */ jsx4("th", { children: "TPS" })
      ] }) }),
      /* @__PURE__ */ jsx4("tbody", { children: items.slice(0, 40).map((x) => /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("td", { className: "lp-num lp-muted", children: fmtTime(x.at) }),
        /* @__PURE__ */ jsx4("td", { children: x.profileName }),
        /* @__PURE__ */ jsx4("td", { className: "lp-muted", children: x.kind === "bench" ? "\u57FA\u51C6" : "\u4F53\u68C0" }),
        /* @__PURE__ */ jsxs4("td", { children: [
          x.kind === "bench" ? /* @__PURE__ */ jsxs4("span", { className: x.ok ? "lp-ok" : "", children: [
            x.ok ? "\u2713 " : "\u274C ",
            x.verdict
          ] }) : /* @__PURE__ */ jsx4("span", { style: { color: scoreColor(x.score) }, className: "lp-num", children: x.score != null ? x.score : "\u2014" }),
          x.kind !== "bench" && x.verdict ? /* @__PURE__ */ jsxs4("span", { className: "lp-muted", children: [
            " ",
            x.verdict
          ] }) : null
        ] }),
        /* @__PURE__ */ jsx4("td", { className: "lp-num", children: fmtMs(x.ttftMs) }),
        /* @__PURE__ */ jsx4("td", { className: "lp-num", children: fmtTps(x.tps) })
      ] }, `${x.runId}-${x.at}`)) })
    ] }) })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect2, useState as useState5 } from "react";
import { Fragment as Fragment5, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var DEFAULTS = { chatMs: 3e4, streamMs: 6e4, modelsMs: 15e3 };
function SettingsTab({ meta, onRefresh }) {
  const [s, setS] = useState5(DEFAULTS);
  const [busy, setBusy] = useState5(false);
  const [msg, setMsg] = useState5("");
  useEffect2(() => {
    loadSettings().then((v) => {
      if (v) setS({ ...DEFAULTS, ...v });
    }).catch(() => {
    });
  }, []);
  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      await sendCommand("settings_set", { ...s }, 15e3).catch(() => null);
      setMsg("\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u4FA7\u4E0B\u4E00\u6B21\u8BFB\u8BBE\u7F6E\u65F6\u751F\u6548\uFF1B\u672A\u652F\u6301\u7684\u52A8\u4F5C\u4F1A\u88AB\u670D\u52A1\u5FFD\u7565\uFF0C\u4E0D\u5F71\u54CD\u4F7F\u7528\uFF09");
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const num = (label, key, hint) => /* @__PURE__ */ jsx5(Fragment5, { children: /* @__PURE__ */ jsxs5("div", { className: "lp-row-h", style: { borderTop: "none", paddingTop: 0 }, children: [
    /* @__PURE__ */ jsx5("b", { style: { fontSize: 12 }, children: label }),
    /* @__PURE__ */ jsx5(
      "input",
      {
        className: "lp-inp lp-num",
        style: { width: 110 },
        type: "number",
        min: 2e3,
        step: 1e3,
        value: Math.round(s[key] / 1e3),
        onChange: (e) => setS({ ...s, [key]: Math.max(2, Number(e.target.value) || 2) * 1e3 })
      }
    ),
    /* @__PURE__ */ jsx5("span", { className: "lp-sub", style: { marginLeft: 8 }, children: hint })
  ] }) });
  return /* @__PURE__ */ jsxs5(Fragment5, { children: [
    /* @__PURE__ */ jsxs5("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "lp-bar" }),
      "\u63A2\u9488\u8D85\u65F6"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "lp-card", children: /* @__PURE__ */ jsxs5("div", { className: "lp-card-b", children: [
      num("\u5BF9\u8BDD\u8D85\u65F6", "chatMs", "\u975E\u6D41\u5F0F\u5BF9\u8BDD\u4E0E\u5DE5\u5177\u8C03\u7528\u5355\u6B21\u4E0A\u9650\uFF08\u79D2\uFF09"),
      /* @__PURE__ */ jsx5("div", { style: { height: 8 } }),
      num("\u6D41\u5F0F\u603B\u65F6\u957F", "streamMs", "\u6D41\u5F0F\u63A2\u9488\u5168\u7A0B\u4E0A\u9650\uFF08\u79D2\uFF09"),
      /* @__PURE__ */ jsx5("div", { style: { height: 8 } }),
      num("\u6A21\u578B\u8868\u8D85\u65F6", "modelsMs", "GET /models \u4E0A\u9650\uFF08\u79D2\uFF09"),
      /* @__PURE__ */ jsxs5("div", { style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx5("button", { className: "lp-btn", onClick: save, disabled: busy, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8D85\u65F6\u8BBE\u7F6E" }),
        msg && /* @__PURE__ */ jsx5("span", { className: "lp-sub", style: { marginLeft: 10 }, children: msg })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "lp-bar" }),
      "\u670D\u52A1\u4E0E\u5B89\u5168\u8FB9\u754C"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "lp-card", children: /* @__PURE__ */ jsx5("div", { className: "lp-card-b", children: /* @__PURE__ */ jsxs5("dl", { className: "lp-kv", children: [
      /* @__PURE__ */ jsx5("dt", { children: "\u670D\u52A1\u7248\u672C" }),
      /* @__PURE__ */ jsx5("dd", { children: meta ? meta.version : "\u2014" }),
      /* @__PURE__ */ jsx5("dt", { children: "\u5FC3\u8DF3" }),
      /* @__PURE__ */ jsxs5("dd", { children: [
        meta ? meta.ts.replace("T", " ").slice(0, 19) : "\u2014",
        meta && meta.degraded ? /* @__PURE__ */ jsxs5("span", { className: "lp-err", children: [
          "\uFF08\u964D\u7EA7\uFF1A",
          meta.lastBridgeErr,
          "\uFF09"
        ] }) : null
      ] }),
      /* @__PURE__ */ jsx5("dt", { children: "\u6863\u6848\u6570" }),
      /* @__PURE__ */ jsx5("dd", { children: meta ? meta.profileCount : "\u2014" }),
      /* @__PURE__ */ jsx5("dt", { children: "\u5BC6\u94A5\u5B58\u50A8" }),
      /* @__PURE__ */ jsx5("dd", { children: "\u5B8C\u6574 apiKey \u53EA\u5B58\u672C\u673A\u670D\u52A1\u76EE\u5F55 profiles.json \u4E0E\u5185\u5B58\uFF1Bkv/\u62A5\u544A/AI \u8FD4\u56DE\u4E00\u5F8B ****\u540E4\u4F4D \u63A9\u7801" }),
      /* @__PURE__ */ jsx5("dt", { children: "\u6210\u672C\u62A4\u680F" }),
      /* @__PURE__ */ jsx5("dd", { children: "\u4F53\u68C0\u6BCF\u6B65 \u226416 token\uFF1B\u57FA\u51C6\u6D4B\u8BD5\u663E\u5F0F\u53D1\u8D77\uFF1B\u65E0\u5B9A\u65F6\u4EFB\u52A1\uFF0C\u4E00\u5207\u82B1\u8D39\u7531\u4F60\u624B\u52A8\u89E6\u53D1" }),
      /* @__PURE__ */ jsx5("dt", { children: "\u7F51\u7EDC\u8FB9\u754C" }),
      /* @__PURE__ */ jsx5("dd", { children: "\u63A2\u9488\u4EC5\u8BBF\u95EE\u4F60\u767B\u8BB0\u7684\u6863\u6848 URL\uFF1B\u4E0D\u505A\u7AEF\u53E3\u626B\u63CF\u3001\u4E0D\u505A\u5E76\u53D1\u538B\u6D4B\u3001\u4E0D\u81EA\u52A8\u91CD\u8BD5\u82B1\u8D39\u578B\u8BF7\u6C42" })
    ] }) }) }),
    /* @__PURE__ */ jsxs5("div", { className: "lp-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "lp-bar" }),
      "\u4F7F\u7528\u63D0\u793A"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "lp-card", children: /* @__PURE__ */ jsx5("div", { className: "lp-card-b", children: /* @__PURE__ */ jsxs5("div", { className: "lp-sub", style: { lineHeight: 1.9 }, children: [
      "\xB7 \u672C\u5730 Ollama \u8FDE\u4E0D\u4E0A\uFF1F\u5927\u6982\u7387\u662F\u53EA\u76D1\u542C 127.0.0.1 \u2014\u2014 \u8BBE\u7F6E ",
      /* @__PURE__ */ jsx5("code", { children: "OLLAMA_HOST=0.0.0.0" }),
      " \u540E\u91CD\u542F Ollama\uFF1B",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 Base URL \u4E0D\u77E5\u9053\u8BE5\u4E0D\u8BE5\u5E26 /v1\uFF1F\u63A2\u9488\u4F1A\u81EA\u52A8\u5F52\u4E00\u5E76\u5728\u62A5\u544A\u91CC\u5C55\u793A\u300C\u89E3\u6790\u7EC8\u70B9\u300D\uFF0C\u6781\u7AEF\u60C5\u51B5\u7528 ",
      /* @__PURE__ */ jsx5("code", { children: "#" }),
      " \u7ED3\u5C3E\u9010\u5B57\u6307\u5B9A\uFF1B",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 404 \u4F46\u6A21\u578B\u8868\u6B63\u5E38\uFF1F\u591A\u534A\u662F\u6A21\u578B\u540D tag \u4E0D\u5339\u914D\uFF08llama3 vs llama3:8b\uFF09\uFF1B",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u624B\u673A/Web \u7AEF\u6253\u5F00\u540C\u4E00\u9762\u677F\u53EF\u770B\u63A9\u7801\u62A5\u544A\u4E0E\u5386\u53F2\uFF0C\u53D1\u8D77\u4F53\u68C0\u540C\u6837\u8D70\u684C\u9762\u670D\u52A1\u6267\u884C\u3002"
    ] }) }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.lp-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.lp-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.lp-body{flex:1;overflow-y:auto;padding:0 0 24px}
.lp-body::-webkit-scrollbar{width:9px;height:9px}
.lp-body::-webkit-scrollbar-track{background:transparent}
.lp-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.lp-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.lp-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2B6CB0,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.lp-tt{flex:1;min-width:0}
.lp-tt b{font-size:15px;display:block}
.lp-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.lp-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.lp-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.lp-dot.stale{background:#D29922}
.lp-dot.down{background:#F85149}
.lp-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.lp-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.lp-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.lp-tab:hover{color:#E6EAF2}
.lp-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.lp-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.lp-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2B6CB0,#3FB950);flex-shrink:0}
.lp-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.lp-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.lp-card-b{padding:11px 13px}
.lp-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.lp-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.lp-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.lp-btn:hover{filter:brightness(1.1)}
.lp-btn:disabled{opacity:.45;cursor:not-allowed}
.lp-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.lp-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.lp-btn.green{background:#1d4730;border:1px solid #2c5c3f;color:#3FB950}
.lp-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.lp-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.lp-inp:focus{outline:none;border-color:#2b6cb0}
.lp-inp::placeholder{color:#4d5566}
.lp-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px}
.lp-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.lp-err{color:#F85149;font-size:11.5px;padding:8px 16px;word-break:break-all}
.lp-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.lp-mono{font-family:Consolas,Menlo,monospace}
.lp-row{padding:9px 13px;border-top:1px solid #1d2330}
.lp-row:hover{background:#12151c}
.lp-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.lp-muted{color:#5C6678}
.lp-ok{color:#3FB950}
.lp-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.lp-badge.host{background:#12283d;color:#58A6FF;border:1px solid #1f4066}
.lp-badge.manual{background:#241a2e;color:#C297FF;border:1px solid #3d2c52}
.lp-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.lp-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.lp-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.lp-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.lp-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.lp-sum b{font-size:19px;display:block;line-height:1.2}
.lp-sum small{color:#8B95A7;font-size:9.5px}
.lp-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:8px 16px}
.lp-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2B6CB0,#3FB950);border-radius:3px;transition:width .5s}
.lp-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.lp-kv dt{color:#5C6678;white-space:nowrap}
.lp-kv dd{margin:0;word-break:break-all}
.lp-step{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-top:1px solid #1d2330;font-size:11.5px}
.lp-step:first-child{border-top:none}
.lp-step-ic{width:16px;text-align:center;flex-shrink:0}
.lp-step-tt{font-weight:600;white-space:nowrap}
.lp-step-metric{color:#8B95A7;font-family:Consolas,Menlo,monospace;font-size:10.5px;word-break:break-all}
table.lp-tb{width:100%;border-collapse:collapse;font-size:11.5px}
table.lp-tb th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
table.lp-tb td{padding:6px 8px;border-top:1px solid #1d2330;white-space:nowrap}
table.lp-tb td.wrap{white-space:normal;word-break:break-all}
.lp-num{font-family:Consolas,Menlo,monospace}
.lp-modal-bg{position:absolute;inset:0;background:rgba(6,8,12,.72);z-index:40;display:flex;align-items:center;justify-content:center;padding:18px}
.lp-modal{background:#161B22;border:1px solid #2a3346;border-radius:14px;max-width:520px;width:100%;max-height:88%;overflow-y:auto;padding:14px 16px}
.lp-modal h4{margin:0 0 10px;font-size:13.5px}
.lp-fm{display:grid;grid-template-columns:88px 1fr;gap:8px;align-items:center;font-size:11.5px}
.lp-fm label{color:#8B95A7;text-align:right}
.lp-fm-full{grid-column:1/-1}
.lp-close{position:sticky;top:0;float:right;background:transparent;border:none;color:#8B95A7;font-size:16px;cursor:pointer}
.lp-hb{display:flex;height:34px;align-items:flex-end;gap:2px}
.lp-hb>i{flex:1;min-width:2px;border-radius:2px 2px 0 0;background:#2B6CB0}
`;
var TABS = [
  { id: "probe", label: "\u4F53\u68C0" },
  { id: "profiles", label: "\u6863\u6848" },
  { id: "compare", label: "\u5BF9\u6BD4" },
  { id: "history", label: "\u5386\u53F2" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel(_props) {
  const [tab, setTab] = useState6("probe");
  const [meta, setMeta] = useState6(null);
  const [profiles, setProfiles] = useState6([]);
  const [latest, setLatest] = useState6(null);
  const [history, setHistory] = useState6([]);
  const [bridgeErr, setBridgeErr] = useState6("");
  const [reloadTick, setReloadTick] = useState6(0);
  const visibleRef = useRef(true);
  const refreshAll = useCallback(async () => {
    try {
      const [m, p, l, h] = await Promise.all([loadMeta(), loadProfiles(), loadLatest(), loadHistory()]);
      setMeta(m);
      setProfiles(p && Array.isArray(p.items) ? p.items : []);
      setLatest(l);
      setHistory(normalizeHistory(h));
      setBridgeErr("");
    } catch (e) {
      setBridgeErr(String(e.message || e));
    }
  }, []);
  useEffect3(() => {
    refreshAll();
  }, [refreshAll, reloadTick]);
  useEffect3(() => {
    const t = setInterval(async () => {
      if (!visibleRef.current) return;
      try {
        const m = await loadMeta();
        setMeta(m);
        setMeta((prev) => {
          if (prev && prev.running && m && !m.running) setReloadTick((x) => x + 1);
          return m;
        });
      } catch {
      }
    }, 2500);
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const heartbeatOk = meta && !meta.degraded && Date.now() - new Date(meta.ts).getTime() < 13e4;
  const heartbeatStale = meta && !meta.degraded && !heartbeatOk;
  const doImport = useCallback(async () => {
    try {
      await sendCommand("import_host", {}, 2e4);
    } catch {
    }
    setReloadTick((x) => x + 1);
  }, []);
  const running = meta && meta.running;
  const runProgress = running ? Math.min(100, Math.max(8, (Date.now() - running.startedAt) / 45e3 * 100)) : 0;
  return /* @__PURE__ */ jsxs6("div", { className: "lp-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "lp-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "lp-logo", children: "\u{1FA7A}" }),
      /* @__PURE__ */ jsxs6("div", { className: "lp-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u6A21\u578B\u4F53\u68C0\u53F0" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          /* @__PURE__ */ jsx6("span", { className: `lp-dot ${heartbeatOk ? "ok" : heartbeatStale ? "stale" : "down"}` }),
          meta ? meta.degraded ? `\u670D\u52A1\u964D\u7EA7\uFF1A${meta.lastBridgeErr || "\u6865\u4E0D\u53EF\u8FBE"}` : `\u670D\u52A1 ${meta.version} \xB7 ${meta.profileCount} \u6863\u6848` : "\u670D\u52A1\u672A\u8FDE\u63A5\uFF08\u7B49\u5F85\u5FC3\u8DF3\uFF09"
        ] })
      ] }),
      running && /* @__PURE__ */ jsxs6("span", { className: "lp-run", title: `${running.profileName} \xB7 ${running.step}`, children: [
        "\u23F3 ",
        running.profileName,
        " \xB7 ",
        running.step
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "lp-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx6("button", { className: `lp-tab ${tab === t.id ? "on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) })
    ] }),
    running && /* @__PURE__ */ jsx6("div", { className: "lp-prog", children: /* @__PURE__ */ jsx6("i", { style: { width: `${runProgress}%` } }) }),
    bridgeErr && /* @__PURE__ */ jsxs6("div", { className: "lp-err", children: [
      "\u6865\u8BFB\u53D6\u5931\u8D25\uFF1A",
      bridgeErr
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "lp-body", children: [
      tab === "probe" && /* @__PURE__ */ jsx6(ProbeTab, { profiles, latest, meta, onRefresh: refreshAll }),
      tab === "profiles" && /* @__PURE__ */ jsx6(ProfilesTab, { profiles, onRefresh: refreshAll, onImport: doImport, importing: !!running }),
      tab === "compare" && /* @__PURE__ */ jsx6(CompareTab, { profiles, latest, history, onRefresh: refreshAll }),
      tab === "history" && /* @__PURE__ */ jsx6(HistoryTab, { profiles, history, onRefresh: refreshAll }),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { meta, onRefresh: refreshAll })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function LlmProbeEntry(props) {
  return /* @__PURE__ */ jsx7(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  LlmProbeEntry as default
};
