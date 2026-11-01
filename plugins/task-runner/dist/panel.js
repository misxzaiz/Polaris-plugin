// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState4 } from "react";

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key }).catch(() => null);
  return (r && r.value) ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
var K = {
  settings: "taskrun.settings",
  providers: "taskrun.providers",
  jobs: "taskrun.jobs",
  meta: "taskrun.meta",
  runsIdx: "taskrun.runsIdx",
  runChunk: (n) => `taskrun.run.${n}`,
  cmdPrefix: "taskrun.cmd.",
  resultPrefix: "taskrun.result."
};
function normalizeSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const clamp = (v, lo, hi, dft) => {
    const n = parseInt(String(v), 10);
    if (!Number.isFinite(n)) return dft;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  };
  return {
    retentionRuns: clamp(r.retentionRuns, 50, 1e3, 200),
    timeoutCommandSec: clamp(r.timeoutCommandSec, 5, 600, 120),
    timeoutHttpSec: clamp(r.timeoutHttpSec, 3, 300, 30),
    timeoutAiSec: clamp(r.timeoutAiSec, 5, 600, 120)
  };
}
function normalizeProviders(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => !!p && typeof p === "object").map((p) => ({
    id: String(p.id || ""),
    name: String(p.name || "\u672A\u547D\u540D"),
    baseUrl: String(p.baseUrl || ""),
    apiKey: String(p.apiKey || ""),
    model: String(p.model || ""),
    wire: p.wire === "anthropic-messages" ? "anthropic-messages" : "openai-chat-completions"
  }));
}
async function loadJobs() {
  const v = await kvGet(K.jobs);
  return v && Array.isArray(v.jobs) ? v.jobs : [];
}
async function loadMeta() {
  return kvGet(K.meta);
}
async function loadSettings() {
  return normalizeSettings(await kvGet(K.settings));
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function loadProviders() {
  return normalizeProviders(await kvGet(K.providers));
}
async function saveProviders(list) {
  await kvSet(K.providers, list);
}
async function loadRuns(limit = 60) {
  const idx = await kvGet(K.runsIdx);
  const chunkCount = idx && typeof idx.chunkCount === "number" ? idx.chunkCount : 0;
  const out = [];
  for (let n = chunkCount - 1; n >= 0 && out.length < limit; n--) {
    const chunk = await kvGet(K.runChunk(n));
    if (!Array.isArray(chunk)) continue;
    for (let i = chunk.length - 1; i >= 0 && out.length < limit; i--) {
      if (chunk[i] && typeof chunk[i] === "object") out.push(chunk[i]);
    }
  }
  return out;
}
async function sendCommand(op, payload, waitMs = 3e4) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const key = `${K.cmdPrefix}${op}.${nonce}`;
  await kvSet(key, { op, ...payload, at: Date.now() });
  const deadline = Date.now() + waitMs;
  for (; ; ) {
    const r = await kvGet(K.resultPrefix + nonce);
    if (r && typeof r === "object" && ("ok" in r || "error" in r)) {
      if (r.queued === true && Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 1200));
        continue;
      }
      await capDispatch("cap.kv", { action: "delete", key: K.resultPrefix + nonce }).catch(() => {
      });
      return r;
    }
    if (Date.now() > deadline) {
      return { ok: false, error: "\u670D\u52A1\u672A\u56DE\u6267\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF09\u2014\u2014\u53BB\u8BBE\u7F6E\u9875\u770B\u670D\u52A1\u72B6\u6001\uFF1B\u7ED3\u679C\u7A0D\u540E\u5728\u8FD0\u884C\u5386\u53F2\u67E5\u770B" };
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
}
var commands = {
  addJob: (job) => sendCommand("add", { job }),
  updateJob: (id, patch) => sendCommand("update", { id, patch }),
  removeJob: (id) => sendCommand("remove", { id }),
  setEnabled: (id, enabled) => sendCommand("setEnabled", { id, enabled }),
  runNow: (id) => sendCommand("runNow", { id }, 6e4),
  /** 从宿主 config.json 导入供应商（服务读盘拿原始密钥；面板侧 cap.config 只有掩码占位） */
  importHost: () => sendCommand("importHost", {}, 2e4)
};

// src/JobsTab.tsx
import { useMemo, useState } from "react";

// src/ui.ts
function fmtTime(ms) {
  if (!ms || !Number.isFinite(ms)) return "\u2014";
  return new Date(ms).toLocaleString();
}
function fmtCountdown(ms) {
  if (ms == null || !Number.isFinite(ms)) return "\u5DF2\u505C\u7528";
  const diff = ms - Date.now();
  if (diff <= 0) return "\u5373\u5C06\u89E6\u53D1";
  const m = Math.floor(diff / 6e4);
  if (m >= 60 * 24) return `${Math.floor(m / 1440)} \u5929\u540E`;
  if (m >= 60) return `${Math.floor(m / 60)} \u5C0F\u65F6 ${m % 60} \u5206\u540E`;
  if (m >= 1) return `${m} \u5206\u540E`;
  return `${Math.floor(diff / 1e3)} \u79D2\u540E`;
}
function describeScheduleClient(s) {
  if (!s) return "\u672A\u77E5\u8C03\u5EA6";
  if (s.type === "interval") {
    const sec = Math.round((s.everyMs || 0) / 1e3);
    if (sec > 0 && sec % 3600 === 0) return `\u6BCF ${sec / 3600} \u5C0F\u65F6`;
    if (sec > 0 && sec % 60 === 0) return `\u6BCF ${sec / 60} \u5206\u949F`;
    return `\u6BCF ${sec} \u79D2`;
  }
  if (s.type === "daily") return `\u6BCF\u5929 ${s.time || "?"}`;
  if (s.type === "weekly") {
    const names = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
    return `\u6BCF\u5468${(s.dows || []).map((d) => names[d]).join("\u3001") || "?"} ${s.time || "?"}`;
  }
  return `cron(${s.expr || "?"})`;
}

// src/JobsTab.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var EMPTY_FORM = {
  editingId: null,
  name: "",
  type: "notify",
  schedType: "daily",
  everyMinutes: "30",
  time: "08:00",
  dows: [1],
  cronExpr: "0 8 * * *",
  message: "",
  url: "https://",
  method: "GET",
  headersText: "",
  body: "",
  allowPrivate: false,
  providerId: "",
  prompt: "",
  system: "",
  maxTokens: "1024",
  shell: "powershell",
  command: "",
  commandConfirm: false
};
var TYPE_LABEL = {
  notify: "\u63D0\u9192",
  http: "HTTP \u63A2\u6D4B",
  ai: "AI \u63D0\u793A\u8BCD",
  command: "\u547D\u4EE4\u884C"
};
function parseHeadersText(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i === -1) return { error: `\u8BF7\u6C42\u5934\u884C\u7F3A\u5C11\u5192\u53F7\uFF1A${t}` };
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
function buildSchedule(f) {
  if (f.schedType === "interval") {
    const n = parseInt(f.everyMinutes, 10);
    if (!Number.isFinite(n) || n < 1) return { error: "\u95F4\u9694\u5206\u949F\u987B \u2265 1" };
    return { type: "interval", everyMinutes: n };
  }
  if (f.schedType === "daily") return { type: "daily", time: f.time };
  if (f.schedType === "weekly") {
    if (!f.dows.length) return { error: "\u81F3\u5C11\u9009\u4E00\u4E2A\u5468\u51E0" };
    return { type: "weekly", time: f.time, dows: [...f.dows].sort((a, b) => a - b) };
  }
  return { type: "cron", expr: f.cronExpr.trim() };
}
function buildPayload(f, hasProvider) {
  if (f.type === "notify") {
    if (!f.message.trim()) return { error: "\u63D0\u9192\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" };
    return { message: f.message.trim() };
  }
  if (f.type === "http") {
    const headers = f.headersText.trim() ? parseHeadersText(f.headersText) : {};
    if ("error" in headers) return headers;
    return {
      url: f.url.trim(),
      method: f.method,
      headers: Object.keys(headers).length ? headers : void 0,
      body: ["POST", "PUT", "PATCH"].includes(f.method) ? f.body : "",
      allowPrivate: f.allowPrivate
    };
  }
  if (f.type === "ai") {
    if (!f.providerId) return { error: "\u8BF7\u9009\u62E9 AI \u4F9B\u5E94\u5546\uFF08\u8BBE\u7F6E\u9875\u53EF\u5BFC\u5165/\u65B0\u589E\uFF09" };
    if (!hasProvider(f.providerId)) return { error: "\u6240\u9009 AI \u4F9B\u5E94\u5546\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
    if (!f.prompt.trim()) return { error: "\u63D0\u793A\u8BCD\u4E0D\u80FD\u4E3A\u7A7A" };
    return {
      providerId: f.providerId,
      prompt: f.prompt.trim(),
      system: f.system.trim(),
      maxTokens: parseInt(f.maxTokens, 10) || 1024
    };
  }
  if (!f.command.trim()) return { error: "\u547D\u4EE4\u4E0D\u80FD\u4E3A\u7A7A" };
  if (!f.commandConfirm) return { error: "\u547D\u4EE4\u884C\u4EFB\u52A1\u987B\u52FE\u9009\u300C\u6211\u786E\u8BA4\u300D" };
  return { shell: f.shell, command: f.command.trim() };
}
function formFromJob(j) {
  const s = j.schedule;
  const p = j.payload || {};
  const headers = p.headers && typeof p.headers === "object" ? p.headers : {};
  return {
    editingId: j.id,
    name: j.name,
    type: j.type,
    schedType: s.type,
    everyMinutes: String(Math.max(1, Math.round((s.everyMs || 18e5) / 6e4))),
    time: s.time || "08:00",
    dows: s.dows || [1],
    cronExpr: s.expr || "0 8 * * *",
    message: String(p.message || ""),
    url: String(p.url || "https://"),
    method: String(p.method || "GET"),
    headersText: Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n"),
    body: String(p.body || ""),
    allowPrivate: p.allowPrivate === true,
    providerId: String(p.providerId || ""),
    prompt: String(p.prompt || ""),
    system: String(p.system || ""),
    maxTokens: String(p.maxTokens || 1024),
    shell: p.shell === "cmd" ? "cmd" : "powershell",
    command: String(p.command || ""),
    commandConfirm: false
  };
}
function JobsTab({ data, notify, refresh, initialForm = null }) {
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const providerName = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const p of data.providers) m.set(p.id, p.name);
    return m;
  }, [data.providers]);
  const set = (patch) => setForm((f) => f ? { ...f, ...patch } : f);
  const submit = async () => {
    if (!form || busy) return;
    const sched = buildSchedule(form);
    if ("error" in sched) {
      notify(sched.error, true);
      return;
    }
    const payload = buildPayload(form, (id) => providerName.has(id));
    if ("error" in payload) {
      notify(payload.error, true);
      return;
    }
    setBusy(true);
    try {
      const jobBody = { name: form.name.trim(), type: form.type, schedule: sched, payload };
      if (!jobBody.name) {
        notify("\u4EFB\u52A1\u540D\u4E0D\u80FD\u4E3A\u7A7A", true);
        return;
      }
      const r = form.editingId ? await commands.updateJob(form.editingId, jobBody) : await commands.addJob(jobBody);
      if (!r.ok) {
        notify(r.error || "\u4FDD\u5B58\u5931\u8D25\uFF08\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF09", true);
        return;
      }
      notify(form.editingId ? "\u4EFB\u52A1\u5DF2\u66F4\u65B0" : "\u4EFB\u52A1\u5DF2\u521B\u5EFA");
      setForm(null);
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (j) => {
    try {
      const r = await commands.setEnabled(j.id, !j.enabled);
      if (!r.ok) {
        notify(r.error || "\u64CD\u4F5C\u5931\u8D25", true);
        return;
      }
      await refresh();
    } catch (e) {
      notify(e.message, true);
    }
  };
  const runNow = async (j) => {
    notify(`\u5DF2\u63D0\u4EA4\u6267\u884C\uFF1A${j.name}\uFF08\u7ED3\u679C\u7A0D\u540E\u8FDB\u5386\u53F2\uFF09`);
    try {
      const r = await commands.runNow(j.id);
      if (!r.ok) {
        notify(r.error || "\u6267\u884C\u5931\u8D25", true);
        return;
      }
      if (r.status) notify(`\u6267\u884C\u5B8C\u6210\uFF08${r.status}\uFF09\uFF1A${(r.summary || "").slice(0, 80)}`);
    } catch (e) {
      notify(e.message, true);
    }
  };
  const remove = async (j) => {
    if (confirmRemove !== j.id) {
      setConfirmRemove(j.id);
      return;
    }
    setConfirmRemove(null);
    try {
      const r = await commands.removeJob(j.id);
      if (!r.ok) {
        notify(r.error || "\u5220\u9664\u5931\u8D25", true);
        return;
      }
      notify(`\u5DF2\u5220\u9664\uFF1A${j.name}`);
      await refresh();
    } catch (e) {
      notify(e.message, true);
    }
  };
  const editingCommand = form?.type === "command";
  return /* @__PURE__ */ jsxs("div", { children: [
    !form ? /* @__PURE__ */ jsx("div", { style: { margin: "0 16px 10px" }, children: /* @__PURE__ */ jsx("button", { className: "tr-btn", onClick: () => setForm({ ...EMPTY_FORM }), children: "\uFF0B \u65B0\u5EFA\u4EFB\u52A1" }) }) : null,
    form ? /* @__PURE__ */ jsx("div", { className: "tr-card", children: /* @__PURE__ */ jsxs("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsx("b", { style: { fontSize: 13 }, children: form.editingId ? "\u7F16\u8F91\u4EFB\u52A1" : "\u65B0\u5EFA\u4EFB\u52A1" }),
      /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u4EFB\u52A1\u540D" }),
      /* @__PURE__ */ jsx("input", { className: "tr-inp", value: form.name, maxLength: 80, placeholder: "\u5982\uFF1A\u65E9\u62A5\u6458\u8981 / \u63A5\u53E3\u5FC3\u8DF3", onChange: (e) => set({ name: e.target.value }) }),
      /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u4EFB\u52A1\u7C7B\u578B" }),
      /* @__PURE__ */ jsx("div", { className: "tr-row", children: Object.keys(TYPE_LABEL).map((t) => /* @__PURE__ */ jsx(
        "button",
        {
          className: `tr-btn sm ${form.type === t ? "ok" : "ghost"}`,
          onClick: () => set({ type: t, commandConfirm: false }),
          children: TYPE_LABEL[t]
        },
        t
      )) }),
      /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u8C03\u5EA6" }),
      /* @__PURE__ */ jsxs("div", { className: "tr-row", children: [
        /* @__PURE__ */ jsxs("select", { className: "tr-sel", value: form.schedType, onChange: (e) => set({ schedType: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "interval", children: "\u6BCF N \u5206\u949F" }),
          /* @__PURE__ */ jsx("option", { value: "daily", children: "\u6BCF\u5929" }),
          /* @__PURE__ */ jsx("option", { value: "weekly", children: "\u6BCF\u5468\u51E0" }),
          /* @__PURE__ */ jsx("option", { value: "cron", children: "cron \u8868\u8FBE\u5F0F" })
        ] }),
        form.schedType === "interval" ? /* @__PURE__ */ jsxs("span", { className: "tr-row", children: [
          /* @__PURE__ */ jsx("input", { className: "tr-inp", style: { width: 70 }, value: form.everyMinutes, onChange: (e) => set({ everyMinutes: e.target.value }) }),
          /* @__PURE__ */ jsx("span", { className: "tr-sub", children: "\u5206\u949F\uFF08\u22651\uFF09" })
        ] }) : null,
        form.schedType === "daily" || form.schedType === "weekly" ? /* @__PURE__ */ jsx("input", { className: "tr-inp", style: { width: 90 }, value: form.time, placeholder: "08:00", onChange: (e) => set({ time: e.target.value }) }) : null,
        form.schedType === "weekly" ? /* @__PURE__ */ jsx("span", { className: "tr-row", children: ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"].map((n, i) => /* @__PURE__ */ jsx(
          "button",
          {
            className: `tr-btn sm ${form.dows.includes(i) ? "ok" : "ghost"}`,
            onClick: () => set({
              dows: form.dows.includes(i) ? form.dows.filter((d) => d !== i) : [...form.dows, i]
            }),
            children: n
          },
          i
        )) }) : null,
        form.schedType === "cron" ? /* @__PURE__ */ jsx("input", { className: "tr-inp", style: { width: 170 }, value: form.cronExpr, placeholder: "\u5206 \u65F6 \u65E5 \u6708 \u5468", onChange: (e) => set({ cronExpr: e.target.value }) }) : null
      ] }),
      /* @__PURE__ */ jsx("div", { className: "tr-sub", style: { marginTop: 4 }, children: form.schedType === "cron" ? "\u4E94\u5B57\u6BB5\uFF1A\u5206 \u65F6 \u65E5 \u6708 \u5468\uFF08\u652F\u6301 * , - / \u6570\u5B57\uFF0C0=\u5468\u65E5\uFF09" : "\u5206\u949F\u7C92\u5EA6\u89E6\u53D1\uFF1B\u5BBF\u4E3B\u5173\u95ED\u671F\u95F4\u9519\u8FC7\u53EA\u5728\u4E0B\u6B21\u542F\u52A8\u8865\u8DD1\u4E00\u6B21" }),
      form.type === "notify" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u63D0\u9192\u5185\u5BB9" }),
        /* @__PURE__ */ jsx("textarea", { className: "tr-inp", rows: 3, value: form.message, maxLength: 2e3, placeholder: "\u5230\u70B9\u8BB0\u5F55\u8FD9\u6761\u63D0\u9192\uFF08\u624B\u673A\u6253\u5F00\u540C\u4E00\u9762\u677F\u53EF\u89C1\uFF09", onChange: (e) => set({ message: e.target.value }) })
      ] }) : null,
      form.type === "http" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "URL" }),
        /* @__PURE__ */ jsx("input", { className: "tr-inp", value: form.url, placeholder: "https://api.example.com/health", onChange: (e) => set({ url: e.target.value }) }),
        /* @__PURE__ */ jsxs("div", { className: "tr-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ jsx("select", { className: "tr-sel", value: form.method, onChange: (e) => set({ method: e.target.value }), children: ["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"].map((m) => /* @__PURE__ */ jsx("option", { children: m }, m)) }),
          /* @__PURE__ */ jsxs("label", { className: "tr-row", style: { gap: 4 }, children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", className: "tr-check", checked: form.allowPrivate, onChange: (e) => set({ allowPrivate: e.target.checked }) }),
            /* @__PURE__ */ jsx("span", { className: "tr-sub", children: "\u5141\u8BB8\u79C1\u7F51/\u672C\u673A\u5730\u5740" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u8BF7\u6C42\u5934\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF0CKey: Value\uFF09" }),
        /* @__PURE__ */ jsx("textarea", { className: "tr-inp", rows: 2, value: form.headersText, placeholder: "Authorization: Bearer xxx", onChange: (e) => set({ headersText: e.target.value }) }),
        ["POST", "PUT", "PATCH"].includes(form.method) ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u8BF7\u6C42\u4F53\uFF08\u226464KB\uFF09" }),
          /* @__PURE__ */ jsx("textarea", { className: "tr-inp", rows: 3, value: form.body, onChange: (e) => set({ body: e.target.value }) })
        ] }) : null
      ] }) : null,
      form.type === "ai" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "AI \u4F9B\u5E94\u5546\uFF08\u8BBE\u7F6E\u9875\u5BFC\u5165/\u65B0\u589E\uFF09" }),
        /* @__PURE__ */ jsxs("select", { className: "tr-sel", value: form.providerId, onChange: (e) => set({ providerId: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 \u9009\u62E9 \u2014" }),
          data.providers.map((p) => /* @__PURE__ */ jsxs("option", { value: p.id, children: [
            p.name,
            "\uFF08",
            p.model || "\u672A\u8BBE\u6A21\u578B",
            "\uFF09"
          ] }, p.id))
        ] }),
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u7CFB\u7EDF\u63D0\u793A\uFF08\u53EF\u9009\uFF09" }),
        /* @__PURE__ */ jsx("textarea", { className: "tr-inp", rows: 2, value: form.system, maxLength: 4e3, onChange: (e) => set({ system: e.target.value }) }),
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u63D0\u793A\u8BCD" }),
        /* @__PURE__ */ jsx("textarea", { className: "tr-inp", rows: 4, value: form.prompt, maxLength: 8e3, placeholder: "\u5230\u70B9\u53D1\u7ED9\u6A21\u578B\u7684\u5185\u5BB9\uFF08\u5B9A\u65F6\u4EFB\u52A1\u6CA1\u6709\u5BF9\u8BDD\u4E0A\u4E0B\u6587\uFF0C\u63D0\u793A\u8BCD\u8981\u81EA\u5305\u542B\uFF09", onChange: (e) => set({ prompt: e.target.value }) }),
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "max_tokens" }),
        /* @__PURE__ */ jsx("input", { className: "tr-inp", style: { width: 110 }, value: form.maxTokens, onChange: (e) => set({ maxTokens: e.target.value }) })
      ] }) : null,
      form.type === "command" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "Shell" }),
        /* @__PURE__ */ jsxs("select", { className: "tr-sel", value: form.shell, onChange: (e) => set({ shell: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "powershell", children: "PowerShell" }),
          /* @__PURE__ */ jsx("option", { value: "cmd", children: "cmd" })
        ] }),
        /* @__PURE__ */ jsx("label", { className: "tr-lbl", children: "\u547D\u4EE4" }),
        /* @__PURE__ */ jsx("textarea", { className: "tr-inp", rows: 3, value: form.command, placeholder: "\u5230\u70B9\u771F\u5B9E\u6267\u884C\u7684\u547D\u4EE4\uFF08\u8D85\u65F6/\u8F93\u51FA\u6709\u62A4\u680F\uFF09", onChange: (e) => set({ command: e.target.value }) }),
        /* @__PURE__ */ jsxs("label", { className: "tr-row", style: { gap: 6, marginTop: 8 }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", className: "tr-check", checked: form.commandConfirm, onChange: (e) => set({ commandConfirm: e.target.checked }) }),
          /* @__PURE__ */ jsx("span", { className: "tr-sub", style: { color: "#D29922" }, children: "\u6211\u786E\u8BA4\uFF1A\u8BE5\u547D\u4EE4\u53EF\u65E0\u4EBA\u503C\u5B88\u81EA\u52A8\u6267\u884C\uFF08\u672C\u673A\u526F\u4F5C\u7528\u81EA\u8D1F\uFF09" })
        ] })
      ] }) : null,
      /* @__PURE__ */ jsxs("div", { className: "tr-row", style: { marginTop: 12 }, children: [
        /* @__PURE__ */ jsx("button", { className: "tr-btn", disabled: busy, onClick: submit, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx("button", { className: "tr-btn ghost", disabled: busy, onClick: () => setForm(null), children: "\u53D6\u6D88" })
      ] })
    ] }) }) : null,
    data.jobs.length === 0 && !form ? /* @__PURE__ */ jsxs("div", { className: "tr-empty", children: [
      "\u8FD8\u6CA1\u6709\u5B9A\u65F6\u4EFB\u52A1\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u70B9\u300C\u65B0\u5EFA\u4EFB\u52A1\u300D\u5EFA\u4E00\u4E2A\uFF0C\u6216\u5728\u5BF9\u8BDD\u91CC\u5BF9 AI \u8BF4\uFF1A",
      /* @__PURE__ */ jsx("span", { className: "tr-kbd", children: "\u6BCF\u5929\u65E9\u4E0A\u516B\u70B9\u63D0\u9192\u6211\u7AD9\u4F1A" })
    ] }) : null,
    data.jobs.map((j) => /* @__PURE__ */ jsx("div", { className: "tr-card", children: /* @__PURE__ */ jsx("div", { className: "tr-card-b", children: /* @__PURE__ */ jsxs("div", { className: "tr-row", style: { justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs("b", { style: { fontSize: 13 }, children: [
          j.name,
          " ",
          /* @__PURE__ */ jsx("span", { className: "tr-tag", children: TYPE_LABEL[j.type] || j.type }),
          !j.enabled ? /* @__PURE__ */ jsx("span", { className: "tr-tag warn", children: "\u5DF2\u505C\u7528" }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "tr-sub", style: { marginTop: 3 }, children: [
          describeScheduleClient(j.schedule),
          j.enabled ? ` \xB7 \u4E0B\u6B21 ${fmtTime(j.nextRunAt)}\uFF08${fmtCountdown(j.nextRunAt)}\uFF09` : " \xB7 \u4E0D\u89E6\u53D1"
        ] }),
        j.type === "ai" && providerName.get(String(j.payload.providerId)) ? /* @__PURE__ */ jsxs("div", { className: "tr-sub", children: [
          "\u4F9B\u5E94\u5546\uFF1A",
          providerName.get(String(j.payload.providerId))
        ] }) : null,
        j.type === "command" ? /* @__PURE__ */ jsx("div", { className: "tr-sub", style: { fontFamily: "Consolas,monospace" }, children: String(j.payload.command || "").slice(0, 90) }) : null,
        j.lastStatus ? /* @__PURE__ */ jsxs("div", { className: "tr-row", style: { marginTop: 5, gap: 5 }, children: [
          /* @__PURE__ */ jsx("span", { className: `tr-tag ${j.lastStatus === "ok" ? "ok" : j.lastStatus === "timeout" ? "timeout" : "fail"}`, children: j.lastStatus }),
          /* @__PURE__ */ jsxs("span", { className: "tr-sub", children: [
            fmtTime(j.lastRunAt),
            " \xB7 ",
            j.lastSummary
          ] })
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tr-row", style: { gap: 6 }, children: [
        /* @__PURE__ */ jsx("button", { className: "tr-btn sm ok", onClick: () => runNow(j), children: "\u6267\u884C" }),
        /* @__PURE__ */ jsx("button", { className: "tr-btn sm ghost", onClick: () => toggle(j), children: j.enabled ? "\u505C\u7528" : "\u542F\u7528" }),
        /* @__PURE__ */ jsx("button", { className: "tr-btn sm ghost", onClick: () => setForm(formFromJob(j)), children: "\u7F16\u8F91" }),
        /* @__PURE__ */ jsx("button", { className: "tr-btn sm danger", onClick: () => remove(j), children: confirmRemove === j.id ? "\u786E\u8BA4\u5220\u9664?" : "\u5220\u9664" })
      ] })
    ] }) }) }, j.id))
  ] });
}

// src/HistoryTab.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var STATUS_LABEL = { ok: "\u6210\u529F", fail: "\u5931\u8D25", timeout: "\u8D85\u65F6" };
function HistoryTab({ runs, jobs }) {
  const [filterJobId, setFilterJobId] = useState2("");
  const [expanded, setExpanded] = useState2(null);
  const shown = filterJobId ? runs.filter((r) => r.jobId === filterJobId) : runs;
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: { margin: "0 16px 10px" }, className: "tr-row", children: [
      /* @__PURE__ */ jsxs2("select", { className: "tr-sel", value: filterJobId, onChange: (e) => setFilterJobId(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u4EFB\u52A1" }),
        jobs.map((j) => /* @__PURE__ */ jsx2("option", { value: j.id, children: j.name }, j.id))
      ] }),
      /* @__PURE__ */ jsxs2("span", { className: "tr-sub", children: [
        shown.length,
        " \u6761\uFF08\u65B0\u2192\u65E7\uFF0C\u4FDD\u7559\u7B56\u7565\u89C1\u8BBE\u7F6E\uFF09"
      ] })
    ] }),
    shown.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "tr-empty", children: [
      "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u4EFB\u52A1\u5230\u70B9\u81EA\u52A8\u6267\u884C\u3001\u6216\u5728\u4EFB\u52A1\u5361\u4E0A\u70B9\u300C\u6267\u884C\u300D\u540E\uFF0C\u8BB0\u5F55\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"
    ] }) : null,
    shown.map((r) => /* @__PURE__ */ jsx2("div", { className: "tr-card", children: /* @__PURE__ */ jsx2("div", { className: "tr-card-b", children: /* @__PURE__ */ jsx2("div", { className: "tr-row", style: { justifyContent: "space-between" }, children: /* @__PURE__ */ jsxs2("div", { style: { minWidth: 0 }, children: [
      /* @__PURE__ */ jsxs2("b", { style: { fontSize: 12.5 }, children: [
        r.jobName,
        " ",
        /* @__PURE__ */ jsx2("span", { className: `tr-tag ${r.status === "ok" ? "ok" : r.status === "timeout" ? "timeout" : "fail"}`, children: STATUS_LABEL[r.status] || r.status }),
        r.missed ? /* @__PURE__ */ jsx2("span", { className: "tr-tag missed", children: "\u8865\u8DD1" }) : null,
        r.trigger === "manual" ? /* @__PURE__ */ jsx2("span", { className: "tr-tag manual", children: "\u624B\u52A8" }) : null
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "tr-sub", style: { marginTop: 3 }, children: [
        fmtTime(r.startedAt),
        " \xB7 ",
        r.durationMs,
        "ms \xB7 ",
        r.summary
      ] }),
      r.excerpt ? /* @__PURE__ */ jsx2(
        "div",
        {
          className: "tr-sub",
          style: {
            marginTop: 5,
            fontFamily: "Consolas,monospace",
            fontSize: 10.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: expanded === r.id ? 300 : 60,
            overflow: "hidden",
            cursor: "pointer",
            background: "#12151c",
            borderRadius: 8,
            padding: "6px 8px"
          },
          onClick: () => setExpanded(expanded === r.id ? null : r.id),
          children: expanded === r.id ? r.excerpt : r.excerpt.slice(0, 160) + (r.excerpt.length > 160 ? " \u2026\uFF08\u70B9\u51FB\u5C55\u5F00\uFF09" : "")
        }
      ) : null
    ] }) }) }) }, r.id))
  ] });
}

// src/SettingsTab.tsx
import { useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ data, notify, refresh }) {
  const [busy, setBusy] = useState3(false);
  const [editingProvider, setEditingProvider] = useState3(null);
  const meta = data.meta;
  const s = data.settings;
  const alive = meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1e3;
  const saveS = async (patch) => {
    if (!s || busy) return;
    setBusy(true);
    try {
      await saveSettings({ ...s, ...patch });
      notify("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u7EA6 30 \u79D2\u5185\u70ED\u751F\u6548\uFF09");
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const startImport = async () => {
    setBusy(true);
    try {
      const r = await commands.importHost();
      if (!r.ok) {
        notify(r.error || "\u5BFC\u5165\u5931\u8D25\uFF08\u670D\u52A1\u672A\u56DE\u6267\uFF09", true);
        return;
      }
      if (!r.imported) {
        notify("\u5BBF\u4E3B\u914D\u7F6E\u91CC\u6CA1\u627E\u5230\u53EF\u7528\u4F9B\u5E94\u5546\uFF08\u7F3A baseUrl/\u5BC6\u94A5\u6216\u5168\u4E3A\u5360\u4F4D\uFF09\u2014\u2014\u53EF\u624B\u52A8\u65B0\u589E", true);
        return;
      }
      notify(`\u5DF2\u5BFC\u5165 ${r.imported} \u4E2A\u5BBF\u4E3B\u4F9B\u5E94\u5546\uFF08\u5408\u5E76\u540E\u5171 ${r.total} \u4E2A\uFF0C\u5BC6\u94A5\u53EA\u5B58\u672C\u673A\uFF09`);
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const saveProvider = async (p) => {
    if (!p.name.trim() || !p.baseUrl.trim()) {
      notify("\u540D\u79F0\u4E0E baseUrl \u5FC5\u586B", true);
      return;
    }
    setBusy(true);
    try {
      const list = data.providers.slice();
      const i = list.findIndex((x) => x.id === p.id);
      if (i === -1) {
        list.push(p);
      } else {
        list[i] = { ...p, apiKey: p.apiKey || list[i].apiKey };
      }
      await saveProviders(list);
      notify("\u4F9B\u5E94\u5546\u5DF2\u4FDD\u5B58");
      setEditingProvider(null);
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const removeProvider = async (p) => {
    if (!window.confirm(`\u5220\u9664\u4F9B\u5E94\u5546\u300C${p.name}\u300D\uFF1F\u5F15\u7528\u5B83\u7684\u4EFB\u52A1\u5C06\u65E0\u6CD5\u6267\u884C\u3002`)) return;
    setBusy(true);
    try {
      await saveProviders(data.providers.filter((x) => x.id !== p.id));
      notify("\u5DF2\u5220\u9664");
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsxs3("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsx3("b", { style: { fontSize: 13 }, children: "\u670D\u52A1\u72B6\u6001" }),
      /* @__PURE__ */ jsx3("div", { className: "tr-sub", style: { marginTop: 4 }, children: alive ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
        "\u8FD0\u884C\u4E2D \xB7 \u7248\u672C ",
        meta?.version,
        " \xB7 \u5FC3\u8DF3 ",
        fmtTime(meta?.lastTickAt),
        " \xB7 \u6865 ",
        meta?.bridge || "?"
      ] }) : "\u672A\u8FD0\u884C\u6216\u5FC3\u8DF3\u8FC7\u671F\u2014\u2014\u670D\u52A1\u7531\u5BBF\u4E3B\u81EA\u52A8\u62C9\u8D77\uFF08\u91CD\u542F Polaris \u6216\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u542F\u7528\uFF09\uFF1B\u672C\u673A\u53CC\u5B9E\u4F8B\u65F6\u53EA\u6709\u4E00\u4E2A\u5B9E\u4F8B\u6301\u6709\u8C03\u5EA6\u79DF\u7EA6" }),
      meta?.degraded ? /* @__PURE__ */ jsx3("div", { className: "tr-err", children: "\u6865\u964D\u7EA7\u4E2D\uFF1A\u7ED3\u679C\u4F1A\u5EF6\u8FDF\u843D\u5E93\uFF0C\u6062\u590D\u540E\u81EA\u52A8\u7EED\u4E0A" }) : null
    ] }) }),
    s ? /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsxs3("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsx3("b", { style: { fontSize: 13 }, children: "\u6267\u884C\u62A4\u680F" }),
      /* @__PURE__ */ jsx3("label", { className: "tr-lbl", children: "\u5386\u53F2\u4FDD\u7559\u6761\u6570\uFF0850\u20131000\uFF09" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "tr-inp",
          style: { width: 110 },
          defaultValue: s.retentionRuns,
          onBlur: (e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v) && v !== s.retentionRuns) saveS({ retentionRuns: v });
          }
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { marginTop: 8, gap: 16 }, children: [
        /* @__PURE__ */ jsxs3("label", { className: "tr-sub", children: [
          "\u547D\u4EE4\u8D85\u65F6",
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "tr-inp",
              style: { width: 70, marginLeft: 6 },
              defaultValue: s.timeoutCommandSec,
              onBlur: (e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v !== s.timeoutCommandSec) saveS({ timeoutCommandSec: v });
              }
            }
          ),
          "\u79D2"
        ] }),
        /* @__PURE__ */ jsxs3("label", { className: "tr-sub", children: [
          "HTTP \u8D85\u65F6",
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "tr-inp",
              style: { width: 70, marginLeft: 6 },
              defaultValue: s.timeoutHttpSec,
              onBlur: (e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v !== s.timeoutHttpSec) saveS({ timeoutHttpSec: v });
              }
            }
          ),
          "\u79D2"
        ] }),
        /* @__PURE__ */ jsxs3("label", { className: "tr-sub", children: [
          "AI \u8D85\u65F6",
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "tr-inp",
              style: { width: 70, marginLeft: 6 },
              defaultValue: s.timeoutAiSec,
              onBlur: (e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v !== s.timeoutAiSec) saveS({ timeoutAiSec: v });
              }
            }
          ),
          "\u79D2"
        ] })
      ] })
    ] }) }) : null,
    /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsxs3("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx3("b", { style: { fontSize: 13 }, children: "AI \u4F9B\u5E94\u5546" }),
        /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", disabled: busy, onClick: startImport, children: "\u4ECE\u5BBF\u4E3B\u5BFC\u5165" }),
          /* @__PURE__ */ jsx3(
            "button",
            {
              className: "tr-btn sm",
              disabled: busy,
              onClick: () => setEditingProvider({ id: `prov_${Date.now().toString(36)}`, name: "", baseUrl: "", apiKey: "", model: "", wire: "openai-chat-completions" }),
              children: "\uFF0B \u624B\u52A8\u65B0\u589E"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "tr-sub", style: { marginTop: 4 }, children: "\u4F9B\u5E94\u5546\u7ED9\u300CAI \u63D0\u793A\u8BCD\u300D\u4EFB\u52A1\u7528\uFF1B\u5BC6\u94A5\u53EA\u5B58\u672C\u673A\uFF08cap.kv\uFF0C\u4E0E\u6A21\u578B\u4F53\u68C0\u53F0\u540C\u4FE1\u4EFB\u57DF\uFF09\uFF0C\u9762\u677F\u4E0E AI \u4FA7\u4E00\u5F8B\u63A9\u7801\u663E\u793A\u3002" }),
      data.providers.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "tr-empty", style: { padding: "14px 10px" }, children: "\u8FD8\u6CA1\u6709\u4F9B\u5E94\u5546\u2014\u2014\u70B9\u300C\u4ECE\u5BBF\u4E3B\u5BFC\u5165\u300D\u96F6\u91CD\u5F55\uFF0C\u6216\u624B\u52A8\u65B0\u589E\u3002" }) : null,
      data.providers.map((p) => /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { justifyContent: "space-between", marginTop: 8, background: "#12151c", borderRadius: 10, padding: "8px 10px" }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { minWidth: 0 }, children: [
          /* @__PURE__ */ jsx3("b", { style: { fontSize: 12 }, children: p.name }),
          /* @__PURE__ */ jsx3("div", { className: "tr-sub", children: p.baseUrl }),
          /* @__PURE__ */ jsxs3("div", { className: "tr-sub", children: [
            "\u6A21\u578B ",
            p.model || "\u2014",
            " \xB7 ",
            p.wire === "anthropic-messages" ? "Anthropic" : "OpenAI",
            " \xB7 key ",
            p.apiKey ? "****" + p.apiKey.slice(-4) : "\u672A\u8BBE"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { gap: 6 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: () => setEditingProvider({ ...p }), children: "\u7F16\u8F91" }),
          /* @__PURE__ */ jsx3("button", { className: "tr-btn sm danger", onClick: () => removeProvider(p), children: "\u5220\u9664" })
        ] })
      ] }, p.id)),
      editingProvider ? /* @__PURE__ */ jsxs3("div", { style: { marginTop: 10, borderTop: "1px solid #242C3A", paddingTop: 8 }, children: [
        /* @__PURE__ */ jsx3("label", { className: "tr-lbl", children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx3("input", { className: "tr-inp", value: editingProvider.name, maxLength: 40, onChange: (e) => setEditingProvider({ ...editingProvider, name: e.target.value }) }),
        /* @__PURE__ */ jsx3("label", { className: "tr-lbl", children: "baseUrl\uFF08API \u6839\uFF0C\u5982 https://api.openai.com/v1 \u6216 openai \u98CE\u683C\u7F51\u5173\uFF09" }),
        /* @__PURE__ */ jsx3("input", { className: "tr-inp", value: editingProvider.baseUrl, onChange: (e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value }) }),
        /* @__PURE__ */ jsx3("label", { className: "tr-lbl", children: "apiKey" }),
        /* @__PURE__ */ jsx3("input", { className: "tr-inp", type: "password", value: editingProvider.apiKey, placeholder: "\u5DF2\u4FDD\u5B58\u65F6\u7559\u7A7A = \u4FDD\u6301\u539F\u503C", onChange: (e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value }) }),
        /* @__PURE__ */ jsx3("label", { className: "tr-lbl", children: "\u6A21\u578B" }),
        /* @__PURE__ */ jsx3("input", { className: "tr-inp", value: editingProvider.model, placeholder: "\u5982 glm-4.7 / deepseek-chat", onChange: (e) => setEditingProvider({ ...editingProvider, model: e.target.value }) }),
        /* @__PURE__ */ jsx3("label", { className: "tr-lbl", children: "\u534F\u8BAE" }),
        /* @__PURE__ */ jsxs3("select", { className: "tr-sel", value: editingProvider.wire, onChange: (e) => setEditingProvider({ ...editingProvider, wire: e.target.value }), children: [
          /* @__PURE__ */ jsx3("option", { value: "openai-chat-completions", children: "OpenAI Chat Completions" }),
          /* @__PURE__ */ jsx3("option", { value: "anthropic-messages", children: "Anthropic Messages" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "tr-btn", disabled: busy, onClick: () => saveProvider(editingProvider), children: "\u4FDD\u5B58\u4F9B\u5E94\u5546" }),
          /* @__PURE__ */ jsx3("button", { className: "tr-btn ghost", onClick: () => setEditingProvider(null), children: "\u53D6\u6D88" })
        ] })
      ] }) : null
    ] }) }),
    /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsxs3("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsx3("b", { style: { fontSize: 13 }, children: "\u5DF2\u77E5\u9650\u5236\uFF08\u5982\u5B9E\uFF09" }),
      /* @__PURE__ */ jsxs3("div", { className: "tr-sub", style: { marginTop: 4 }, children: [
        "\xB7 \u5BBF\u4E3B\u5173\u95ED\u671F\u95F4\u4EFB\u52A1\u4E0D\u6267\u884C\uFF0C\u9519\u8FC7\u53EA\u8865\u4E00\u6B21\uFF08\u4E0D\u56DE\u653E\u79EF\u538B\uFF09",
        /* @__PURE__ */ jsx3("br", {}),
        "\xB7 \u5206\u949F\u7C92\u5EA6\u8C03\u5EA6\uFF08\u65E0\u79D2\u7EA7\uFF09\uFF1B\u6267\u884C\u987A\u5E8F\u4E3A\u961F\u5217\u4E32\u884C",
        /* @__PURE__ */ jsx3("br", {}),
        "\xB7 AI \u4EFB\u52A1\u4E3A\u975E\u6D41\u5F0F\u5355\u8F6E\u8C03\u7528\uFF08\u65E0\u5DE5\u5177/\u65E0\u591A\u8F6E\uFF09\uFF1B\u63D0\u793A\u8BCD\u8981\u81EA\u5305\u542B",
        /* @__PURE__ */ jsx3("br", {}),
        "\xB7 \u6570\u636E\u5168\u90E8\u5B58\u672C\u673A cap.kv\uFF0C\u4E0D\u5916\u53D1\uFF08AI \u4EFB\u52A1\u6309\u4F60\u914D\u7F6E\u7684\u4F9B\u5E94\u5546\u76F4\u8FDE\uFF09"
      ] })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.tr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.tr-body::-webkit-scrollbar{width:9px;height:9px}
.tr-body::-webkit-scrollbar-track{background:transparent}
.tr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.tr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.tr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5865F2,#2EA97C);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.tr-tt{flex:1;min-width:0}
.tr-tt b{font-size:15px;display:block}
.tr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.tr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.tr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.tr-dot.stale{background:#D29922}
.tr-dot.down{background:#F85149}
.tr-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.tr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.tr-tab:hover{color:#E6EAF2}
.tr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.tr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.tr-card-b{padding:11px 13px}
.tr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.tr-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.tr-tag.ok{color:#3FB950;border-color:#245c37}
.tr-tag.fail{color:#F85149;border-color:#54262c}
.tr-tag.timeout{color:#D29922;border-color:#4a3a15}
.tr-tag.missed{color:#D29922;border-color:#4a3a15}
.tr-tag.manual{color:#58A6FF;border-color:#1f4a6e}
.tr-tag.warn{color:#D29922;border-color:#4a3a15}
.tr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.tr-btn:hover{filter:brightness(1.1)}
.tr-btn:disabled{opacity:.45;cursor:not-allowed}
.tr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.tr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.tr-btn.ok{background:#1e3a2a;color:#3FB950;border:1px solid #2a5c3f}
.tr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.tr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.tr-inp:focus{outline:none;border-color:#2b6cb0}
.tr-inp::placeholder{color:#4d5566}
.tr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px;cursor:pointer}
.tr-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.tr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.tr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.tr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;max-width:92%}
.tr-toast.bad{border-color:#54262c;color:#FF8A9A}
.tr-toast-wrap{white-space:normal;max-height:150px;overflow-y:auto;word-break:break-all}
.tr-check{accent-color:#2b6cb0;cursor:pointer}
.tr-kbd{background:#12151c;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;font-family:Consolas,monospace;font-size:10.5px}
`;
function metaAlive(meta) {
  if (!meta || !meta.lastTickAt) return "down";
  return Date.now() - meta.lastTickAt < 90 * 1e3 ? "ok" : "stale";
}
function TaskRunnerPanel(_props) {
  const [tab, setTab] = useState4("jobs");
  const [data, setData] = useState4({ meta: null, jobs: [], runs: [], settings: null, providers: [] });
  const [toast, setToast] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const toastTimer = useRef(null);
  const notify = useCallback((text, bad) => {
    setToast({ text, bad });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), bad ? 6e3 : 3200);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [meta, jobs, runs, settings, providers] = await Promise.all([
        loadMeta(),
        loadJobs(),
        loadRuns(60),
        loadSettings(),
        loadProviders()
      ]);
      setData({ meta, jobs, runs, settings, providers });
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message);
    }
  }, []);
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const loop = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") await refresh();
      if (!stop) timer = window.setTimeout(loop, 6e3);
    };
    loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [refresh]);
  const alive = metaAlive(data.meta);
  return /* @__PURE__ */ jsxs4("div", { className: "tr-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "tr-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "tr-logo", children: "\u23F0" }),
      /* @__PURE__ */ jsxs4("div", { className: "tr-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u5B9A\u65F6\u4EFB\u52A1\u53F0" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          /* @__PURE__ */ jsx4("span", { className: `tr-dot ${alive}` }),
          alive === "ok" ? `\u670D\u52A1\u8FD0\u884C\u4E2D \xB7 ${data.meta?.enabledCount ?? 0}/${data.meta?.jobCount ?? 0} \u542F\u7528` : "\u670D\u52A1\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E\u9875\u53EF\u67E5\uFF09",
          data.meta?.degraded ? " \xB7 \u6865\u964D\u7EA7" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "tr-tabs", children: [["jobs", "\u4EFB\u52A1"], ["history", "\u5386\u53F2"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: `tr-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "tr-body", children: [
      loadErr ? /* @__PURE__ */ jsxs4("div", { className: "tr-err", children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }) : null,
      tab === "jobs" && /* @__PURE__ */ jsx4(JobsTab, { data, notify, refresh }),
      tab === "history" && /* @__PURE__ */ jsx4(HistoryTab, { runs: data.runs, jobs: data.jobs }),
      tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { data, notify, refresh })
    ] }),
    toast ? /* @__PURE__ */ jsx4("div", { className: `tr-toast ${toast.bad ? "bad" : ""}`, children: /* @__PURE__ */ jsx4("div", { className: "tr-toast-wrap", children: toast.text }) }) : null
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function TaskRunnerEntry(props) {
  return /* @__PURE__ */ jsx5(TaskRunnerPanel, { ...props });
}
export {
  TaskRunnerEntry as default
};
