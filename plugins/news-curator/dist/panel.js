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
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  DEFAULT_WATCHLIST: () => DEFAULT_WATCHLIST,
  call: () => call,
  defaultPrefs: () => defaultPrefs,
  fmtCnDate: () => fmtCnDate,
  fmtMin: () => fmtMin,
  kvGet: () => kvGet,
  kvListKeys: () => kvListKeys,
  kvSet: () => kvSet,
  listDailyDates: () => listDailyDates,
  loadDaily: () => loadDaily,
  loadDateKey: () => loadDateKey,
  loadPrefs: () => loadPrefs,
  loadPrefsLog: () => loadPrefsLog,
  loadProgress: () => loadProgress,
  loadReviews: () => loadReviews,
  loadSourcesLast: () => loadSourcesLast,
  loadVoice: () => loadVoice,
  savePrefs: () => savePrefs,
  saveProgress: () => saveProgress,
  sendToChat: () => sendToChat,
  setHostSend: () => setHostSend,
  today: () => today,
  useModel: () => useModel,
  yesterday: () => yesterday
});
import { useState, useEffect, useCallback } from "react";
async function call(cmd, args = {}) {
  return getHostInvoke()(cmd, args);
}
async function kvGet(key) {
  const res = await call("router_dispatch", {
    req: { target: "cap.kv", payload: { action: "get", key } }
  });
  if (!res.ok) throw new Error(res.error || "kv get \u5931\u8D25");
  return res.result && res.result.value !== null && res.result.value !== void 0 ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await call("router_dispatch", {
    req: { target: "cap.kv", payload: { action: "set", key, value } }
  });
  if (!res.ok) throw new Error(res.error || "kv set \u5931\u8D25");
}
function setHostSend(fn) {
  hostSend = fn;
}
function sendToChat(msg) {
  if (hostSend) {
    hostSend(msg);
    return;
  }
  const api = window.__POLARIS_HOST_PANEL__;
  if (api?.onSendToChat) {
    api.onSendToChat(msg);
  } else {
    const w = window;
    if (typeof w.__POLARIS_SEND_TO_CHAT__ === "function") w.__POLARIS_SEND_TO_CHAT__(msg);
  }
}
function useModel(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}
function defaultPrefs() {
  return {
    directions: { creative: true, fund: true, tech: true, news: true, learn: true },
    watchlist: DEFAULT_WATCHLIST,
    dailyTarget: 90,
    voice: { voice: "\u51B0\u7CD6", speed: 1, autoAudio: false },
    learn: { proStage: "L2", weeklyDays: 5, genTopics: [] },
    updatedAt: null
  };
}
async function loadPrefs() {
  const p = await kvGet("news.prefs");
  return p && typeof p === "object" ? p : defaultPrefs();
}
async function savePrefs(prefs) {
  await kvSet("news.prefs", { ...prefs, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
}
async function loadPrefsLog() {
  const l = await kvGet("news.prefsLog");
  return Array.isArray(l) ? l : [];
}
async function loadDaily(date) {
  const d = await kvGet(`news.daily.${date}`);
  return d && typeof d === "object" ? d : null;
}
async function loadProgress() {
  const p = await kvGet("news.progress");
  return p && typeof p === "object" ? p : { streak: 0, lastRead: null, learned: { pro: [], gen: [] }, favorites: [] };
}
async function saveProgress(p) {
  await kvSet("news.progress", p);
}
async function loadReviews(month) {
  const r = await kvGet(`news.reviews.${month}`);
  return Array.isArray(r) ? r : [];
}
async function loadSourcesLast() {
  const s = await kvGet("news.sources.last");
  return s && typeof s === "object" ? s : null;
}
async function loadVoice(date, section) {
  const v = await kvGet(`news.voice.${date}.${section}`);
  return v && typeof v === "object" ? v : null;
}
async function loadDateKey(date) {
  const keys = await kvListKeys();
  return keys.filter((k) => k.startsWith(`news.voice.${date}.`)).sort();
}
async function kvListKeys() {
  try {
    const res = await call("router_dispatch", {
      req: { target: "cap.kv", payload: { action: "list" } }
    });
    if (!res.ok) throw new Error(res.error || "kv list \u5931\u8D25");
    return Array.isArray(res.result?.keys) ? res.result?.keys : [];
  } catch (e) {
    return [];
  }
}
async function listDailyDates() {
  const keys = await kvListKeys();
  return keys.filter((k) => k.startsWith("news.daily.")).map((k) => k.slice("news.daily.".length)).sort().reverse();
}
function today() {
  const d = /* @__PURE__ */ new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function yesterday() {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtCnDate(dateStr) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const wd = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"][d.getDay()];
  return `${dateStr} \u5468${wd}`;
}
var hostSend, DEFAULT_WATCHLIST, fmtMin;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    DEFAULT_WATCHLIST = ["005844", "017811", "002910", "013835", "011369", "013840"];
    fmtMin = (n) => n == null ? "\u2014" : `${n} \u5206\u949F`;
  }
});

// src/Panel.tsx
init_model();
import { useEffect as useEffect7, useState as useState7 } from "react";

// src/Today.tsx
init_model();
import { useState as useState2, useEffect as useEffect2 } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var DIR_ICON = {
  fund: "\u{1F4C8}",
  tech: "\u{1F9E0}",
  news: "\u{1F525}",
  creative: "\u{1F4A1}",
  learn: "\u{1F393}"
};
var DIR_LABEL = {
  fund: "\u57FA\u91D1",
  tech: "\u6280\u672F",
  news: "\u65F6\u4E8B",
  creative: "\u521B\u610F",
  learn: "\u5B66\u4E60"
};
function Today({ goTab }) {
  const [daily, setDaily] = useState2(null);
  const [dateLabel, setDateLabel] = useState2("");
  const [progress, setProgress] = useState2(null);
  const [loading, setLoading] = useState2(true);
  const [err, setErr] = useState2(null);
  const [toast, setToast] = useState2(null);
  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      let d = await loadDaily(today());
      let label = fmtCnDate(today());
      if (!d) {
        d = await loadDaily(yesterday());
        label = `${fmtCnDate(yesterday())}\uFF08\u6628\u65E5\uFF09`;
      }
      setDaily(d);
      setDateLabel(label);
      const p = await loadProgress();
      setProgress(p);
      if (!d) setErr("\u4ECA\u5929\u8FD8\u6CA1\u6709\u65E5\u62A5\u3002\u70B9\u53F3\u4E0A\u300C\u751F\u6210\u65E5\u62A5\u300D\uFF0CAI \u4F1A\u7528\u5185\u7F6E\u6D4F\u89C8\u5668\u6293\u53D6\u5E76\u53D1\u5E03\u3002");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect2(() => {
    load();
  }, []);
  const checkin = async () => {
    const p = { ...progress || { streak: 0, lastRead: null }, streak: (progress?.streak || 0) + 1, lastRead: today() };
    await saveProgress(p);
    setProgress(p);
    setToast(`\u2705 \u5DF2\u6253\u5361\uFF0C\u8FDE\u7EED ${p.streak} \u5929`);
    setTimeout(() => setToast(null), 2200);
  };
  const askGenerate = () => {
    sendToChat("\u5E2E\u6211\u751F\u6210\u4ECA\u5929\u7684 AI \u6BCF\u65E5\u520A\u7269\u65E5\u62A5\uFF08\u57FA\u91D1/\u6280\u672F/\u65F6\u4E8B/\u521B\u610F\uFF0C\u6309\u6211\u7684\u504F\u597D\u6765\uFF09");
  };
  const sections = daily?.sections || [];
  const sec = (t) => sections.find((s) => s.type === t);
  return /* @__PURE__ */ jsxs("div", { className: "nc-page", children: [
    /* @__PURE__ */ jsxs("div", { className: "nc-top", children: [
      /* @__PURE__ */ jsx("div", { className: "nc-logo", children: "\u{1F4F0}" }),
      /* @__PURE__ */ jsxs("div", { className: "nc-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "AI \u6BCF\u65E5\u520A\u7269" }),
        /* @__PURE__ */ jsxs("small", { children: [
          dateLabel || fmtCnDate(today()),
          daily?.totalMinutes ? ` \xB7 \u7EA6 ${daily.totalMinutes} \u5206\u949F` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "nc-play", onClick: askGenerate, title: "\u751F\u6210\u4ECA\u5929\u7684\u65E5\u62A5", children: "\u2726" }),
      /* @__PURE__ */ jsx("button", { className: "nc-play", style: { width: 30, height: 30, fontSize: 13, boxShadow: "none" }, onClick: load, title: "\u5237\u65B0", children: "\u27F3" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "nc-prog", children: [
      /* @__PURE__ */ jsxs("div", { className: "nc-prog-h", children: [
        /* @__PURE__ */ jsx("b", { children: "\u4ECA\u65E5\u9605\u8BFB\u8FDB\u5EA6" }),
        /* @__PURE__ */ jsx("span", { className: "nc-pct", children: progress?.minutesToday ? `${Math.min(100, Math.round(progress.minutesToday / (daily?.totalMinutes || 90) * 100))}%` : "\u672A\u5F00\u59CB" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "nc-track", children: /* @__PURE__ */ jsx("i", { style: { width: progress?.minutesToday ? `${Math.min(100, Math.round(progress.minutesToday / (daily?.totalMinutes || 90) * 100))}%` : "4%" } }) }),
      /* @__PURE__ */ jsxs("div", { className: "nc-labels", children: [
        /* @__PURE__ */ jsx("span", { children: progress?.minutesToday ? `\u5DF2\u8BFB ${progress.minutesToday} \u5206\u949F` : "\u4ECA\u65E5\u672A\u8BFB" }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u76EE\u6807 ",
          fmtMin(daily?.totalMinutes)
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5269 ",
          Math.max(0, (daily?.totalMinutes || 90) - (progress?.minutesToday || 0)),
          " \u5206\u949F"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "nc-row", style: { marginTop: 8, gap: 8 }, children: [
        /* @__PURE__ */ jsx("button", { className: "nc-btn ghost", onClick: checkin, disabled: progress?.lastRead === today(), children: progress?.lastRead === today() ? "\u2705 \u4ECA\u65E5\u5DF2\u6253\u5361" : `\u{1F525} \u6253\u5361\uFF08\u8FDE ${progress?.streak || 0} \u5929\uFF09` }),
        /* @__PURE__ */ jsx("button", { className: "nc-btn ghost", onClick: () => goTab(2), children: "\u{1F399}\uFE0F \u8BED\u97F3" }),
        /* @__PURE__ */ jsx("button", { className: "nc-btn ghost", onClick: () => goTab(1), children: "\u{1F393} \u5B66\u4E60" })
      ] })
    ] }),
    err && /* @__PURE__ */ jsxs("div", { className: "nc-empty", children: [
      err,
      /* @__PURE__ */ jsx("br", {}),
      /* @__PURE__ */ jsx("button", { className: "nc-btn", onClick: askGenerate, style: { marginTop: 10 }, children: "\u2726 \u751F\u6210\u4ECA\u5929\u7684\u65E5\u62A5" })
    ] }),
    loading && /* @__PURE__ */ jsx("div", { className: "nc-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
    sections.map((s) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "nc-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "nc-bar" }),
        DIR_ICON[s.type] || "\u{1F4C4}",
        " ",
        s.title || DIR_LABEL[s.type] || s.type,
        /* @__PURE__ */ jsx("span", { className: "nc-hint", children: s.meta?.minutes ? `${s.meta.minutes} \u5206\u949F` : "" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "nc-feed", children: [
        (s.items || []).slice(0, s.type === "fund" ? 3 : s.type === "news" ? 3 : 4).map((it, i) => /* @__PURE__ */ jsxs("div", { className: "nc-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "nc-card-b", children: [
            /* @__PURE__ */ jsx("b", { children: it.title || it.name || "" }),
            it.meta?.badge && /* @__PURE__ */ jsx("span", { className: "nc-badge", style: { float: "right" }, children: it.meta.badge }),
            it.meta?.chg != null && /* @__PURE__ */ jsxs("span", { className: it.meta.chg >= 0 ? "nc-up" : "nc-down", style: { float: "right" }, children: [
              it.meta.chg >= 0 ? "+" : "",
              it.meta.chg,
              "%"
            ] })
          ] }),
          it.brief && /* @__PURE__ */ jsx("div", { className: "nc-sub", children: it.brief }),
          it.meta?.src && /* @__PURE__ */ jsxs("div", { className: "nc-src", children: [
            /* @__PURE__ */ jsx("span", { className: "nc-badge", children: it.meta.src }),
            it.meta?.sub && /* @__PURE__ */ jsx("span", { children: it.meta.sub })
          ] })
        ] }, i)),
        (s.items || []).length > 3 && /* @__PURE__ */ jsx("div", { className: "nc-card", children: /* @__PURE__ */ jsxs("div", { className: "nc-sub", children: [
          "\u2026 \u5171 ",
          (s.items || []).length,
          " \u6761"
        ] }) })
      ] })
    ] }, s.type)),
    /* @__PURE__ */ jsxs("div", { className: "nc-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "nc-bar", style: { background: "linear-gradient(180deg,#BC8CFF,#58A6FF)" } }),
      "\u{1F393} \u4ECA\u65E5\u5B66\u4E60 ",
      /* @__PURE__ */ jsx("span", { className: "nc-hint", children: "\u53CC\u7EBF\u5E76\u884C" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "nc-feed", children: [
      /* @__PURE__ */ jsxs("div", { className: "nc-line", onClick: () => goTab(1), children: [
        /* @__PURE__ */ jsxs("div", { className: "nc-line-h", children: [
          /* @__PURE__ */ jsx("span", { className: "nc-lic", style: { background: "linear-gradient(135deg,#1F6FEB,#3F8CFF)" }, children: "\u2615" }),
          /* @__PURE__ */ jsxs("div", { className: "nc-line-t", children: [
            /* @__PURE__ */ jsx("b", { children: "\u4E13\u4E1A\u6210\u957F \xB7 Java + AI" }),
            /* @__PURE__ */ jsx("small", { children: "\u7B2C 2 \u9636\u6BB5\u300CJava \u5E76\u53D1\u8FDB\u9636\u300D" })
          ] }),
          /* @__PURE__ */ jsx("span", { className: "nc-pct", children: "L1\u2192L2" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "nc-line-track", children: /* @__PURE__ */ jsx("i", { style: { width: "44%" } }) }),
        /* @__PURE__ */ jsxs("div", { className: "nc-tags", children: [
          /* @__PURE__ */ jsx("span", { children: "\u2615 JVM/\u5E76\u53D1" }),
          /* @__PURE__ */ jsx("span", { children: "\u{1F6E0} \u5FAE\u670D\u52A1" }),
          /* @__PURE__ */ jsx("span", { children: "\u{1F916} AI \u5DE5\u7A0B: MCP/Agent" }),
          /* @__PURE__ */ jsx("span", { children: "\u{1F9E0} AI \u6559\u7EC3" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "nc-line", style: { borderColor: "rgba(188,140,255,.35)" }, onClick: () => goTab(1), children: [
        /* @__PURE__ */ jsxs("div", { className: "nc-line-h", children: [
          /* @__PURE__ */ jsx("span", { className: "nc-lic", style: { background: "linear-gradient(135deg,#BC8CFF,#9B6CFF)" }, children: "\u{1F30D}" }),
          /* @__PURE__ */ jsxs("div", { className: "nc-line-t", children: [
            /* @__PURE__ */ jsx("b", { children: "\u901A\u8BC6\u6F2B\u6E38 \xB7 \u5E7F\u9762\u77E5\u8BC6" }),
            /* @__PURE__ */ jsx("small", { children: "24 \u4E3B\u9898\u8F6E\u6362 \xB7 \u4E0E\u4ECA\u65E5\u65F6\u4E8B\u5F3A\u5173\u8054" })
          ] }),
          /* @__PURE__ */ jsx("span", { className: "nc-pct", style: { color: "#BC8CFF" }, children: "7/24" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "nc-line-track", children: /* @__PURE__ */ jsx("i", { style: { width: "62%", background: "linear-gradient(90deg,#BC8CFF,#58A6FF)" } }) }),
        /* @__PURE__ */ jsxs("div", { className: "nc-tags", children: [
          /* @__PURE__ */ jsx("span", { children: "\u{1F4DC} \u5386\u53F2" }),
          /* @__PURE__ */ jsx("span", { children: "\u{1F4B0} \u7ECF\u6D4E" }),
          /* @__PURE__ */ jsx("span", { children: "\u{1F52C} \u79D1\u6280" }),
          /* @__PURE__ */ jsx("span", { children: "\u{1F9E0} \u5FC3\u7406" }),
          /* @__PURE__ */ jsx("span", { children: "\u2764\uFE0F \u5065\u5EB7" })
        ] })
      ] })
    ] }),
    toast && /* @__PURE__ */ jsx("div", { className: "nc-toast", children: toast })
  ] });
}

// src/Learn.tsx
init_model();
import { useState as useState3, useEffect as useEffect3 } from "react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PRO_COURSE = [
  {
    level: "L1",
    tag: "Java \u6838\u5FC3\u529F\u5E95",
    color: "#3FB950",
    status: "6/6 \u5B8C\u6210",
    units: [
      { no: "\u2713", t: "JVM \u5185\u5B58\u6A21\u578B\u4E0E\u5783\u573E\u56DE\u6536", done: true },
      { no: "\u2713", t: "\u5E76\u53D1\u7F16\u7A0B\uFF1A\u4ECE synchronized \u5230 AQS", done: true },
      { no: "\u2713", t: "\u96C6\u5408\u6E90\u7801\u4E0E\u6027\u80FD\u9677\u9631", done: true },
      { no: "\u2713", t: "IO/NIO/\u7F51\u7EDC\u7F16\u7A0B", done: true },
      { no: "\u2713", t: "\u8BBE\u8BA1\u6A21\u5F0F\u4E0E\u91CD\u6784", done: true }
    ]
  },
  {
    level: "L2",
    tag: "Java \u5E76\u53D1\u8FDB\u9636\uFF08\u8FDB\u884C\u4E2D\uFF09",
    color: "#58A6FF",
    status: "2/4 \xB7 \u4ECA\u65E5\u8BFE",
    units: [
      { no: "\u2713", t: "Java 17/21 \u65B0\u7279\u6027\u901F\u89C8", done: true },
      { no: "3", t: "\u865A\u62DF\u7EBF\u7A0B Virtual Threads", now: true },
      { no: "4", t: "\u5E76\u53D1\u5BB9\u5668\u4E0E\u7EBF\u7A0B\u6C60\u8C03\u4F18", next: true }
    ]
  },
  {
    level: "L3",
    tag: "\u5DE5\u7A0B\u5316\u4E0E\u5FAE\u670D\u52A1",
    color: "#BC8CFF",
    status: "\u672A\u5F00\u59CB",
    units: [
      { no: "1", t: "Spring Boot 3 \u5B9E\u6218", next: true },
      { no: "2", t: "\u4E91\u539F\u751F\uFF1A\u5BB9\u5668/K8s/\u5F39\u6027", next: true }
    ]
  },
  {
    level: "L4",
    tag: "AI \u5DE5\u7A0B\u80FD\u529B\uFF08\u53F3\u817F\uFF09",
    color: "#FF9E64",
    status: "\u4E0E L1-L3 \u5E76\u884C",
    units: [
      { no: "1", t: "\u5927\u6A21\u578B\u539F\u7406\u4E0E Prompt \u5DE5\u7A0B", next: true },
      { no: "2", t: "MCP \u534F\u8BAE\u4E0E\u5DE5\u5177\u5F00\u53D1", next: true },
      { no: "3", t: "Java \u8C03\u7528\u5927\u6A21\u578B\uFF1ASpring AI / LangChain4j", next: true },
      { no: "4", t: "Agent \u5E94\u7528\u4E0E RAG \u5B9E\u6218", next: true }
    ]
  }
];
var GEN_TOPICS = [
  { icon: "\u{1F4DC}", t: "\u4E16\u754C\u5386\u53F2", s: "\u2713 \u5DF2\u8BFB", done: true },
  { icon: "\u{1F52C}", t: "\u79D1\u6280\u901A\u53F2", s: "\u2713 \u5DF2\u8BFB", done: true },
  { icon: "\u{1F4B0}", t: "\u5B8F\u89C2\u7ECF\u6D4E", s: "\u672C\u5468 \xB7 3/5", now: true },
  { icon: "\u{1F9E0}", t: "\u5FC3\u7406\u5B66", s: "\u4E0B\u5468" },
  { icon: "\u2764\uFE0F", t: "\u5065\u5EB7\u5E38\u8BC6", s: "\u5F85\u5F00\u59CB" },
  { icon: "\u{1F5FA}", t: "\u5730\u7406\u4EBA\u6587", s: "\u5F85\u5F00\u59CB" },
  { icon: "\u{1F4A1}", t: "\u601D\u7EF4\u65B9\u5F0F", s: "\u5F85\u5F00\u59CB" },
  { icon: "\u2696\uFE0F", t: "\u6CD5\u5F8B\u5E38\u8BC6", s: "\u5F85\u5F00\u59CB" }
];
function Learn() {
  const [tab, setTab] = useState3("pro");
  const [daily, setDaily] = useState3(null);
  const [toast, setToast] = useState3(null);
  useEffect3(() => {
    loadDaily(today()).then(setDaily).catch(() => {
    });
  }, []);
  const learnSec = daily?.sections?.find((s) => s.type === "learn");
  const aiAsk = (q) => {
    sendToChat(q);
    setToast(`\u5DF2\u53D1\u9001\uFF1A${q}`);
    setTimeout(() => setToast(null), 1800);
  };
  return /* @__PURE__ */ jsxs2("div", { className: "nc-page", children: [
    /* @__PURE__ */ jsxs2("div", { className: "nc-top", children: [
      /* @__PURE__ */ jsx2("div", { className: "nc-logo", style: { background: "linear-gradient(135deg,#BC8CFF,#58A6FF)" }, children: "\u{1F393}" }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-tt", children: [
        /* @__PURE__ */ jsx2("b", { children: "\u5B66\u4E60 \xB7 \u53CC\u7EBF\u5E76\u884C" }),
        /* @__PURE__ */ jsx2("small", { children: "\u4E13\u4E1A\u6210\u957F + \u901A\u8BC6\u6F2B\u6E38" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "nc-subtab", children: [
      /* @__PURE__ */ jsx2("button", { className: `nc-st ${tab === "pro" ? "on" : ""}`, onClick: () => setTab("pro"), children: "\u2615 \u4E13\u4E1A\u6210\u957F \xB7 Java+AI" }),
      /* @__PURE__ */ jsx2("button", { className: `nc-st ${tab === "gen" ? "on" : ""}`, onClick: () => setTab("gen"), children: "\u{1F30D} \u901A\u8BC6\u6F2B\u6E38" })
    ] }),
    tab === "pro" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "nc-line", style: { margin: "4px 16px 10px" }, children: [
        /* @__PURE__ */ jsxs2("div", { className: "nc-line-h", children: [
          /* @__PURE__ */ jsx2("span", { className: "nc-lic", style: { background: "linear-gradient(135deg,#1F6FEB,#3F8CFF)" }, children: "\u2615" }),
          /* @__PURE__ */ jsxs2("div", { className: "nc-line-t", children: [
            /* @__PURE__ */ jsx2("b", { children: "\u4E13\u4E1A\u6210\u957F \xB7 Java \u5F00\u53D1\u5DE5\u7A0B\u5E08\uFF08\u7ED3\u5408 AI\uFF09" }),
            /* @__PURE__ */ jsx2("small", { children: "\u8BA1\u5212 24 \u5468 \xB7 \u53CC\u8F6E\u9A71\u52A8 \xB7 \u6BCF\u5929 40 \u5206\u949F" })
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "nc-pct", style: { color: "var(--dim, #5C6678)", fontSize: 11 }, children: "33%" })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "nc-line-track", children: /* @__PURE__ */ jsx2("i", { style: { width: "33%" } }) }),
        /* @__PURE__ */ jsx2("div", { className: "nc-line-d", children: "\u5DE6\u817F=Java \u786C\u529F\uFF08JVM/\u5E76\u53D1/\u67B6\u6784\uFF09\xB7 \u53F3\u817F=AI \u5DE5\u7A0B\uFF08\u5927\u6A21\u578B/MCP/Agent\uFF09\xB7 AI \u6559\u7EC3\u968F\u95EE\u968F\u7B54 + \u8BED\u97F3\u542C\u8BB2" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "nc-bar", style: { background: "linear-gradient(180deg,#1F6FEB,#58A6FF)" } }),
        "\u8BFE\u7A0B\u4F53\u7CFB \xB7 \u56DB\u9636\u6BB5"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "nc-feed", children: PRO_COURSE.map((lv) => /* @__PURE__ */ jsxs2("div", { className: "nc-lv", children: [
        /* @__PURE__ */ jsxs2("div", { className: "nc-lv-h", children: [
          /* @__PURE__ */ jsx2("span", { className: "nc-lv-tag", style: { background: `${lv.color}22`, color: lv.color }, children: lv.level }),
          /* @__PURE__ */ jsx2("b", { children: lv.tag }),
          /* @__PURE__ */ jsx2("span", { className: "nc-lv-st", children: lv.status })
        ] }),
        lv.units.map((u, i) => /* @__PURE__ */ jsxs2("div", { className: `nc-unit ${u.done ? "done" : ""} ${u.now ? "now" : ""} ${u.next ? "next" : ""}`, children: [
          /* @__PURE__ */ jsx2("span", { className: "nc-uno", children: u.no }),
          /* @__PURE__ */ jsx2("span", { className: "nc-uti", children: /* @__PURE__ */ jsx2("b", { children: u.t }) }),
          u.now && /* @__PURE__ */ jsx2("button", { className: "nc-btn sm", onClick: () => aiAsk(`\u7ED9\u6211\u8BB2\u4ECA\u5929\u7684\u8BFE\u300C${u.t}\u300D\uFF0C\u7ED3\u5408\u6211\u7684 Java \u80CC\u666F\uFF0C30 \u5206\u949F\u5B66\u5B8C`), children: "\u4ECA\u65E5\u8BFE" }),
          u.done && /* @__PURE__ */ jsx2("span", { className: "nc-udur", children: "\u5DF2\u5B66" }),
          u.next && /* @__PURE__ */ jsx2("span", { className: "nc-udur", children: "\u2014" })
        ] }, i))
      ] }, lv.level)) }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "nc-bar", style: { background: "linear-gradient(180deg,#1F6FEB,#58A6FF)" } }),
        "\u4ECA\u65E5\u8BFE \xB7 \u865A\u62DF\u7EBF\u7A0B Virtual Threads"
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-feed", children: [
        [
          { n: "1", t: "\u4E3A\u4EC0\u4E48\u9700\u8981\uFF1A\u7EBF\u7A0B\u5F88\u8D35\uFF0C\u8BF7\u6C42\u5F88\u591A", s: "6 \u5206\u949F \xB7 \u914D\u5BF9\u6BD4\u56FE", b: "\u4F20\u7EDF\u300C\u4E00\u7EBF\u7A0B\u4E00\u8BF7\u6C42\u300D\u6A21\u578B\u4E0B\uFF0C\u6BCF\u4E2A\u7EBF\u7A0B\u7EA6 1MB \u6808\u5185\u5B58\uFF0C10 \u4E07\u5E76\u53D1\u5C31\u5403\u4E0D\u6D88\u3002\u865A\u62DF\u7EBF\u7A0B\u628A\u300C\u5E73\u53F0\u7EBF\u7A0B\u300D\u4E0E\u300C\u4EFB\u52A1\u300D\u89E3\u8026\u2014\u2014\u4E00\u4E2A\u5E73\u53F0\u7EBF\u7A0B\u53EF\u627F\u8F7D\u4E0A\u767E\u4E07\u865A\u62DF\u7EBF\u7A0B\uFF0C\u5185\u5B58\u5360\u7528\u964D\u4F4E 2 \u4E2A\u6570\u91CF\u7EA7\u3002" },
          { n: "2", t: "\u600E\u4E48\u7528\uFF1A\u9759\u6001\u5DE5\u5382 + \u4EFB\u52A1 API", s: "\u4EE3\u7801\u793A\u4F8B", b: "Executors.newVirtualThreadPerTaskExecutor() \u63D0\u4EA4\u5341\u4E07\u4EFB\u52A1\uFF0C\u4F20\u7EDF\u5E73\u53F0\u7EBF\u7A0B\u76F4\u63A5\u7206\u70B8\u3002" },
          { n: "3", t: "\u8E29\u5751\uFF1A\u522B\u5728\u865A\u62DF\u7EBF\u7A0B\u91CC\u505A\u963B\u585E\u5F0F\u540C\u6B65", s: "5 \u5206\u949F \xB7 AI \u6559\u7EC3\u91CD\u70B9", b: "synchronized \u963B\u585E\u4F1A pin \u4F4F\u8F7D\u4F53\u7EBF\u7A0B\uFF1B\u5E94\u6539\u7528 ReentrantLock / \u7ED3\u6784\u5316\u5E76\u53D1\uFF08StructuredTaskScope\uFF09\u3002" }
        ].map((c) => /* @__PURE__ */ jsxs2("div", { className: "nc-lesson", children: [
          /* @__PURE__ */ jsxs2("div", { className: "nc-lesson-h", children: [
            /* @__PURE__ */ jsx2("span", { className: "nc-lesson-n", children: c.n }),
            /* @__PURE__ */ jsxs2("div", { className: "nc-lesson-t", children: [
              /* @__PURE__ */ jsx2("b", { children: c.t }),
              /* @__PURE__ */ jsx2("small", { children: c.s })
            ] }),
            /* @__PURE__ */ jsx2("button", { className: "nc-spk", onClick: () => aiAsk(`\u628A\u300C${c.t}\u300D\u8BB2\u7ED9\u6211\u542C\uFF0C5 \u5206\u949F`), children: "\u25B6 \u542C\u8BB2" })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "nc-lesson-b", children: c.b })
        ] }, c.n)),
        /* @__PURE__ */ jsxs2("div", { className: "nc-coach", children: [
          /* @__PURE__ */ jsxs2("div", { className: "nc-coach-h", children: [
            /* @__PURE__ */ jsx2("span", { className: "nc-coach-ic", children: "\u{1F916}" }),
            "AI \u6559\u7EC3 \xB7 \u672C\u8BFE\u968F\u95EE\u968F\u7B54"
          ] }),
          /* @__PURE__ */ jsx2("p", { children: "\u9488\u5BF9\u672C\u8BFE\u4F60\u53EF\u4EE5\u7EE7\u7EED\u6DF1\u6316\uFF0CAI \u4F1A\u7ED3\u5408\u4F60\u7684 Java \u80CC\u666F\u5206\u5C42\u89E3\u7B54\uFF0C\u5E76\u5BF9\u6BD4 Spring Boot \u91CC\u600E\u4E48\u7528\u3002" }),
          /* @__PURE__ */ jsxs2("div", { className: "nc-qrow", children: [
            /* @__PURE__ */ jsx2("span", { onClick: () => aiAsk("\u89E3\u91CA\u865A\u62DF\u7EBF\u7A0B\u4E0E\u5E73\u53F0\u7EBF\u7A0B\u7684 pinning \u673A\u5236"), children: "\u4E3A\u4EC0\u4E48 synchronized \u4F1A pin \u4F4F\u865A\u62DF\u7EBF\u7A0B\uFF1F" }),
            /* @__PURE__ */ jsx2("span", { onClick: () => aiAsk("Spring Boot 3.2 \u600E\u4E48\u5F00\u865A\u62DF\u7EBF\u7A0B\uFF1F"), children: "Spring Boot 3.2 \u600E\u4E48\u5F00\uFF1F" }),
            /* @__PURE__ */ jsx2("span", { onClick: () => aiAsk("\u51FA\u4E00\u9053\u865A\u62DF\u7EBF\u7A0B\u9762\u8BD5\u9898\u8003\u6211"), children: "\u51FA 1 \u9053\u9762\u8BD5\u9898" })
          ] })
        ] })
      ] })
    ] }),
    tab === "gen" && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "nc-line", style: { margin: "4px 16px 10px", borderColor: "rgba(188,140,255,.35)" }, children: [
        /* @__PURE__ */ jsxs2("div", { className: "nc-line-h", children: [
          /* @__PURE__ */ jsx2("span", { className: "nc-lic", style: { background: "linear-gradient(135deg,#BC8CFF,#9B6CFF)" }, children: "\u{1F30D}" }),
          /* @__PURE__ */ jsxs2("div", { className: "nc-line-t", children: [
            /* @__PURE__ */ jsx2("b", { children: "\u901A\u8BC6\u6F2B\u6E38 \xB7 \u5E7F\u9762\u77E5\u8BC6" }),
            /* @__PURE__ */ jsx2("small", { children: "24 \u4E2A\u4E3B\u9898\u8F6E\u6362 \xB7 \u6BCF\u5929 20 \u5206\u949F" })
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "nc-pct", style: { color: "#BC8CFF", fontSize: 11 }, children: "29%" })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "nc-line-track", children: /* @__PURE__ */ jsx2("i", { style: { width: "29%", background: "linear-gradient(90deg,#BC8CFF,#58A6FF)" } }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "nc-bar", style: { background: "linear-gradient(180deg,#BC8CFF,#58A6FF)" } }),
        "\u4E3B\u9898\u5730\u56FE"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "nc-topic-grid", children: GEN_TOPICS.map((t) => /* @__PURE__ */ jsxs2("div", { className: `nc-topic ${t.done ? "done" : ""} ${t.now ? "now" : ""}`, onClick: () => aiAsk(`\u4ECA\u5929\u901A\u8BC6\u6F2B\u6E38\u5B66\u300C${t.t}\u300D\uFF0C\u7ED3\u5408\u4ECA\u5929\u7684\u65F6\u4E8B\u8BB2 20 \u5206\u949F`), children: [
        /* @__PURE__ */ jsx2("span", { className: "nc-tico", children: t.icon }),
        /* @__PURE__ */ jsx2("b", { children: t.t }),
        /* @__PURE__ */ jsx2("small", { children: t.s })
      ] }, t.t)) }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "nc-bar", style: { background: "linear-gradient(180deg,#BC8CFF,#58A6FF)" } }),
        "\u4ECA\u65E5\u901A\u8BC6 \xB7 \u300C\u5229\u7387\u4E0E\u4F60\u7684\u94B1\u300D",
        /* @__PURE__ */ jsx2("span", { className: "nc-hint", children: "\u5173\u8054\u4ECA\u65E5\u65F6\u4E8B" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "nc-feed", children: [
        [
          { n: "1", t: "\u4E3A\u4EC0\u4E48\u94F6\u884C\u7A81\u7136\u62A2\u957F\u671F\u5B58\u6B3E", s: "6 \u5206\u949F", b: "\u5B58\u8D37\u6B3E\u5229\u5DEE\u6536\u7A84 + \u5229\u7387\u4E0B\u884C\u9884\u671F \u2192 \u94F6\u884C\u60F3\u9501\u4F4F\u957F\u671F\u4F4E\u6210\u672C\u8D1F\u503A\u3002\u770B\u61C2\u4E00\u6761\u65F6\u4E8B = \u638C\u63E1\u4E00\u4E2A\u5B8F\u89C2\u6982\u5FF5\u3002" },
          { n: "2", t: "\u5229\u7387\u4E0B\u884C\u5BF9\u666E\u901A\u4EBA\u610F\u5473\u7740\u4EC0\u4E48", s: "6 \u5206\u949F", b: "\u5B58\u6B3E\u6536\u76CA\u53D8\u8584 \u2192 \u94B1\u6D41\u5411\u503A\u57FA/\u80A1\u5E02/\u9EC4\u91D1\uFF1B\u623F\u8D37 LPR \u4E0E\u5B58\u6B3E\u5229\u7387\u8054\u52A8\u3002\u4F60\u7684\u57FA\u91D1\u677F\u5757\u6B63\u597D\u7ED9\u4E86\u6D3B\u6848\u4F8B\u3002" },
          { n: "3", t: "3 \u4E2A\u95EE\u9898\u81EA\u67E5\u662F\u5426\u542C\u61C2", s: "4 \u5206\u949F \xB7 AI \u51FA\u9898", b: "\u2460 \u4E3A\u4EC0\u4E48\u5229\u5DEE\u6536\u7A84\u94F6\u884C\u4F1A\u62A2\u5B58\u6B3E\uFF1F\u2461 \u5229\u7387\u4E0B\u884C\u8C01\u53D7\u76CA\u8C01\u53D7\u635F\uFF1F\u2462 \u4ECA\u5929\u54EA\u6761\u57FA\u91D1\u65B0\u95FB\u80FD\u5370\u8BC1\uFF1F" }
        ].map((c) => /* @__PURE__ */ jsxs2("div", { className: "nc-lesson", children: [
          /* @__PURE__ */ jsxs2("div", { className: "nc-lesson-h", children: [
            /* @__PURE__ */ jsx2("span", { className: "nc-lesson-n", style: { background: "linear-gradient(135deg,#BC8CFF,#58A6FF)" }, children: c.n }),
            /* @__PURE__ */ jsxs2("div", { className: "nc-lesson-t", children: [
              /* @__PURE__ */ jsx2("b", { children: c.t }),
              /* @__PURE__ */ jsx2("small", { children: c.s })
            ] }),
            /* @__PURE__ */ jsx2("button", { className: "nc-spk", onClick: () => aiAsk(`\u628A\u300C${c.t}\u300D\u8BB2\u7ED9\u6211\u542C\uFF0C5 \u5206\u949F`), children: "\u25B6 \u542C\u8BB2" })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "nc-lesson-b", children: c.b })
        ] }, c.n)),
        /* @__PURE__ */ jsxs2("div", { className: "nc-coach", style: { borderColor: "rgba(188,140,255,.3)" }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "nc-coach-h", children: [
            /* @__PURE__ */ jsx2("span", { className: "nc-coach-ic", style: { background: "linear-gradient(135deg,#BC8CFF,#58A6FF)" }, children: "\u{1F916}" }),
            "AI \u966A\u5B66 \xB7 \u901A\u8BC6\u6F2B\u8C08"
          ] }),
          /* @__PURE__ */ jsx2("p", { children: "\u628A\u4ECA\u5929\u65F6\u4E8B\u8BB2\u6210\u6545\u4E8B\u3001\u4E3E\u4E2A\u8EAB\u8FB9\u4F8B\u5B50\u3001\u6216\u6362\u4E2A\u89D2\u5EA6\u8FA9\u8BBA\uFF0C\u600E\u4E48\u5B66\u968F\u4F60\u3002" }),
          /* @__PURE__ */ jsxs2("div", { className: "nc-qrow", children: [
            /* @__PURE__ */ jsx2("span", { onClick: () => aiAsk("\u628A\u5229\u7387\u4E0B\u884C\u8BB2\u6210\u4E00\u4E2A\u5C0F\u6545\u4E8B"), children: "\u8BB2\u6210\u5C0F\u6545\u4E8B" }),
            /* @__PURE__ */ jsx2("span", { onClick: () => aiAsk("\u7ED3\u5408\u6211\u7684\u57FA\u91D1\u8BF4\u8BF4\u5229\u7387\u5F71\u54CD"), children: "\u7ED3\u5408\u6211\u7684\u57FA\u91D1" }),
            /* @__PURE__ */ jsx2("span", { onClick: () => aiAsk("\u63A8\u8350\u660E\u5929\u901A\u8BC6\u4E3B\u9898"), children: "\u660E\u5929\u5B66\u4EC0\u4E48" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "nc-quiz", children: [
          /* @__PURE__ */ jsxs2("div", { className: "nc-qt", children: [
            /* @__PURE__ */ jsx2("span", { className: "nc-qn", children: "1" }),
            "\u94F6\u884C\u62A2\u957F\u671F\u5B58\u6B3E\uFF0C\u6700\u53EF\u80FD\u7684\u80CC\u666F\u662F\uFF1F"
          ] }),
          [
            { o: "A. \u94F6\u884C\u94B1\u592A\u591A\u4E86\u82B1\u4E0D\u5B8C", ok: false },
            { o: "B. \u5229\u7387\u4E0B\u884C\uFF0C\u60F3\u9501\u4F4F\u4F4E\u6210\u672C\u8D1F\u503A", ok: true },
            { o: "C. \u50A8\u6237\u90FD\u5728\u53D6\u94B1", ok: false }
          ].map((op, i) => /* @__PURE__ */ jsx2(QuizOp, { label: op.o, ok: op.ok }, i))
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "nc-quiz", children: [
          /* @__PURE__ */ jsxs2("div", { className: "nc-qt", children: [
            /* @__PURE__ */ jsx2("span", { className: "nc-qn", children: "2" }),
            "\u5229\u7387\u4E0B\u884C\u65F6\uFF0C\u901A\u5E38\u8C01\u8868\u73B0\u66F4\u597D\uFF1F"
          ] }),
          [
            { o: "A. \u503A\u5238\u7C7B\u8D44\u4EA7", ok: true },
            { o: "B. \u73B0\u91D1\u5B58\u6B3E", ok: false },
            { o: "C. \u9AD8\u606F P2P", ok: false }
          ].map((op, i) => /* @__PURE__ */ jsx2(QuizOp, { label: op.o, ok: op.ok }, i))
        ] })
      ] })
    ] }),
    toast && /* @__PURE__ */ jsx2("div", { className: "nc-toast", children: toast })
  ] });
}
function QuizOp({ label, ok }) {
  const [state, setState] = useState3("idle");
  const cls = state === "cor" ? "cor" : state === "wro" ? "wro" : "";
  return /* @__PURE__ */ jsx2("button", { className: `nc-op ${cls}`, onClick: () => setState(ok ? "cor" : "wro"), disabled: state !== "idle", children: label });
}

// src/Voice.tsx
init_model();
import { useState as useState4, useEffect as useEffect4, useRef } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function Voice() {
  const [daily, setDaily] = useState4(null);
  const [voices, setVoices] = useState4({});
  const [playing, setPlaying] = useState4(null);
  const [progress, setProgress] = useState4({});
  const [toast, setToast] = useState4(null);
  const [generating, setGenerating] = useState4(null);
  const audioRef = useRef(null);
  const pollRef = useRef(null);
  const date = today();
  const load = async () => {
    const [d, voiceKeys] = await Promise.all([loadDaily(date), loadDateKey(date)]);
    setDaily(d);
    const secs2 = (d?.sections || []).map((s) => s.type);
    const all = [.../* @__PURE__ */ new Set(["summary", "fund", "tech", "news", "creative", "learn", ...secs2])];
    const map = {};
    const present = new Set(voiceKeys.map((k) => k.slice(`news.voice.${date}.`.length)));
    for (const st of all) {
      if (!present.has(st)) continue;
      const v = await loadVoice(date, st).catch(() => null);
      if (v) map[st] = v;
    }
    setVoices(map);
  };
  useEffect4(() => {
    load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);
  const sections = daily?.sections || [];
  const secs = sections.length ? sections : [
    { type: "summary", title: "\u4ECA\u65E5\u901F\u89C8" },
    { type: "fund", title: "\u57FA\u91D1\u7814\u5224" },
    { type: "tech", title: "\u6280\u672F\u8BB2\u89E3" },
    { type: "news", title: "\u65F6\u4E8B\u6458\u8981" },
    { type: "learn", title: "\u5B66\u4E60\u8BFE\u7A0B" }
  ];
  const SEC_ICON = { summary: "\u25B6", fund: "\u{1F4C8}", tech: "\u{1F9E0}", news: "\u{1F525}", creative: "\u{1F4A1}", learn: "\u{1F393}" };
  const toastMsg = (m) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  const pollVoice = (section, dateStr, tries = 0) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (tries > 40) {
      setGenerating(null);
      toastMsg("\u5408\u6210\u8D85\u65F6\uFF0C\u53EF\u7A0D\u540E\u70B9 \u25B6 \u91CD\u8BD5");
      return;
    }
    pollRef.current = setTimeout(async () => {
      const v = await loadVoice(dateStr, section).catch(() => null);
      if (v) {
        setVoices((prev) => ({ ...prev, [section]: v }));
        setGenerating(null);
        toastMsg("\u8BED\u97F3\u5DF2\u751F\u6210\uFF0C\u5F00\u59CB\u64AD\u653E");
        playSection(section, v);
      } else {
        pollVoice(section, dateStr, tries + 1);
      }
    }, 2500);
  };
  const askVoice = (section, title) => {
    setGenerating(section);
    const msg = `\u5E2E\u6211\u628A\u4ECA\u5929\u65E5\u62A5\u7684\u300C${title}\u300D\u7AE0\u8282\u751F\u6210\u8BED\u97F3\u64AD\u62A5\uFF1A\u5148\u7528 news_brief \u62FF\u64AD\u62A5\u7A3F\uFF0C\u518D\u7528 mimo_tts_synthesize \u5408\u6210\u97F3\u9891\uFF08\u7528\u504F\u597D\u91CC\u7684\u97F3\u8272\uFF09\uFF0C\u6700\u540E\u7528 news_save_voice \u628A dataUrl/url \u5B58\u5230\u7F13\u5B58`;
    sendToChat(msg);
    toastMsg("\u5DF2\u8BF7\u6C42 AI \u5408\u6210\u8BED\u97F3\u2026");
    pollVoice(section, date);
  };
  const playSection = (section, clip) => {
    if (!clip) return;
    const src = clip.dataUrl || clip.url;
    if (!src) {
      toastMsg("\u8BE5\u7AE0\u8282\u97F3\u9891\u7F3A\u5931");
      return;
    }
    if (playing === section) {
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
      else audioRef.current?.play();
      return;
    }
    setPlaying(section);
    setTimeout(() => {
      const a = audioRef.current;
      if (!a) return;
      a.src = src;
      a.onended = () => {
        setPlaying(null);
        setProgress((p) => ({ ...p, [section]: { cur: 0, dur: 0 } }));
      };
      a.ontimeupdate = () => {
        if (a.duration) setProgress((p) => ({ ...p, [section]: { cur: a.currentTime, dur: a.duration } }));
      };
      void a.play().catch(() => {
        setPlaying(null);
        toastMsg("\u64AD\u653E\u5931\u8D25\uFF1A\u97F3\u9891\u4E0D\u53EF\u7528\uFF08\u53EF\u91CD\u65B0\u751F\u6210\uFF09");
      });
    }, 50);
  };
  const toggle = (section, clip) => {
    if (!clip) return;
    playSection(section, clip);
  };
  const fmt = (s) => {
    if (s == null || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, "0")}`;
  };
  return /* @__PURE__ */ jsxs3("div", { className: "nc-page", children: [
    /* @__PURE__ */ jsxs3("div", { className: "nc-top", children: [
      /* @__PURE__ */ jsx3("div", { className: "nc-logo", style: { background: "linear-gradient(135deg,#1F6FEB,#BC8CFF)" }, children: "\u{1F399}\uFE0F" }),
      /* @__PURE__ */ jsxs3("div", { className: "nc-tt", children: [
        /* @__PURE__ */ jsx3("b", { children: "\u4ECA\u65E5\u8BED\u97F3\u64AD\u62A5" }),
        /* @__PURE__ */ jsx3("small", { children: daily?.totalMinutes ? `\u603B\u65F6\u957F\u7EA6 ${Math.max(8, Math.round(daily.totalMinutes / 4))} \u5206\u949F \xB7 \u8FB9\u8D70\u8FB9\u542C` : "\u9009\u62E9\u7AE0\u8282\u751F\u6210\u8BED\u97F3" })
      ] })
    ] }),
    !daily && /* @__PURE__ */ jsxs3("div", { className: "nc-empty", children: [
      "\u4ECA\u5929\u8FD8\u6CA1\u6709\u65E5\u62A5\u3002\u5148\u70B9\u300C\u4ECA\u65E5\u300D\u9875\u53F3\u4E0A \u2726 \u751F\u6210\u65E5\u62A5\uFF0C\u518D\u56DE\u6765\u751F\u6210\u8BED\u97F3\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      /* @__PURE__ */ jsx3("button", { className: "nc-btn", style: { marginTop: 10 }, onClick: () => sendToChat("\u5E2E\u6211\u751F\u6210\u4ECA\u5929\u7684 AI \u6BCF\u65E5\u520A\u7269\u65E5\u62A5"), children: "\u2726 \u751F\u6210\u65E5\u62A5" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "nc-feed", children: secs.map((s) => {
      const clip = voices[s.type] || null;
      const pg = progress[s.type];
      const pct = pg && pg.dur ? Math.min(100, pg.cur / pg.dur * 100) : 0;
      const hasAudio = !!clip;
      return /* @__PURE__ */ jsxs3("div", { className: `nc-voice ${playing === s.type ? "playing" : ""}`, children: [
        /* @__PURE__ */ jsxs3("div", { className: "nc-voice-h", onClick: () => hasAudio && toggle(s.type, clip), children: [
          /* @__PURE__ */ jsx3("span", { className: "nc-vic", children: playing === s.type ? "\u275A\u275A" : hasAudio ? "\u25B6" : SEC_ICON[s.type] || "\u25B6" }),
          /* @__PURE__ */ jsxs3("div", { className: "nc-voice-t", children: [
            /* @__PURE__ */ jsx3("b", { children: s.title }),
            /* @__PURE__ */ jsx3("small", { children: hasAudio ? `\u5DF2\u5408\u6210${clip?.durationSec ? ` \xB7 ${fmt(clip.durationSec)}` : ""}` : s.type === "learn" ? "\u53CC\u7EBF\u8BFE\u7A0B" : s.type === "fund" ? "\u81EA\u9009\u57FA\u91D1" : (s.items || []).length + " \u6761" })
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "nc-voice-dur", children: hasAudio ? clip?.durationSec ? `\u23F1 ${fmt(clip.durationSec)}` : "\u53EF\u64AD\u653E" : "\u672A\u5408\u6210" }),
          !hasAudio && /* @__PURE__ */ jsx3("button", { className: "nc-btn sm ghost", disabled: generating === s.type, onClick: (e) => {
            e.stopPropagation();
            askVoice(s.type, s.title);
          }, children: generating === s.type ? "\u5408\u6210\u4E2D\u2026" : "\u2726 \u751F\u6210" }),
          hasAudio && playing === s.type && /* @__PURE__ */ jsxs3("span", { className: "nc-voice-dur", children: [
            fmt(pg?.cur),
            " / ",
            fmt(pg?.dur)
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "nc-voice-prog", children: /* @__PURE__ */ jsx3("i", { style: { width: `${playing === s.type ? pct : hasAudio ? 100 : 0}%` } }) })
      ] }, s.type);
    }) }),
    /* @__PURE__ */ jsx3("audio", { ref: audioRef, preload: "none" }),
    /* @__PURE__ */ jsx3("div", { className: "nc-tip", style: { padding: "4px 16px", fontSize: 11, color: "#5C6678" }, children: "\u{1F4A1} \u70B9\u6709\u97F3\u9891\u7684\u7AE0\u8282\u5373\u53EF\u64AD\u653E\uFF1B\u672A\u5408\u6210\u7684\u70B9\u300C\u2726 \u751F\u6210\u300D\uFF0CAI \u4F1A\u7528 mimo_tts \u5408\u6210\u5E76\u7F13\u5B58\uFF08\u684C\u9762/\u624B\u673A\u90FD\u80FD\u64AD\uFF09\u3002" }),
    toast && /* @__PURE__ */ jsx3("div", { className: "nc-toast", children: toast })
  ] });
}

// src/Archive.tsx
init_model();
import { useState as useState5, useEffect as useEffect5 } from "react";
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var DIR_ICON2 = {
  fund: "\u{1F4C8}",
  tech: "\u{1F9E0}",
  news: "\u{1F525}",
  creative: "\u{1F4A1}",
  learn: "\u{1F393}",
  summary: "\u{1F4F0}"
};
function Archive() {
  const [dates, setDates] = useState5([]);
  const [sel, setSel] = useState5(null);
  const [daily, setDaily] = useState5(null);
  const [voices, setVoices] = useState5(/* @__PURE__ */ new Set());
  const [loading, setLoading] = useState5(true);
  const loadDates = async () => {
    const ds = await listDailyDates();
    setDates(ds);
    setSel((s) => s ?? ds[0] ?? null);
  };
  useEffect5(() => {
    loadDates();
  }, []);
  useEffect5(() => {
    if (!sel) {
      setDaily(null);
      return;
    }
    setLoading(true);
    Promise.all([loadDaily(sel), loadDateKey(sel)]).then(([d, vk]) => {
      setDaily(d);
      setVoices(new Set(vk.map((k) => k.slice(`news.voice.${sel}.`.length))));
      setLoading(false);
    });
  }, [sel]);
  const sections = daily?.sections || [];
  return /* @__PURE__ */ jsxs4("div", { className: "nc-page", children: [
    /* @__PURE__ */ jsxs4("div", { className: "nc-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "nc-logo", style: { background: "linear-gradient(135deg,#9B6CFF,#58A6FF)" }, children: "\u{1F4DA}" }),
      /* @__PURE__ */ jsxs4("div", { className: "nc-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u5386\u53F2\u65E5\u62A5" }),
        /* @__PURE__ */ jsx4("small", { children: dates.length ? `\u5DF2\u53D1\u5E03 ${dates.length} \u5929` : "\u8FD8\u6CA1\u6709\u5386\u53F2\u65E5\u62A5" })
      ] })
    ] }),
    !dates.length && /* @__PURE__ */ jsx4("div", { className: "nc-empty", children: "\u6682\u65E0\u5386\u53F2\u65E5\u62A5\u3002\u5148\u5728\u300C\u4ECA\u65E5\u300D\u9875\u751F\u6210\u65E5\u62A5\uFF0C\u4E4B\u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }),
    dates.length > 0 && /* @__PURE__ */ jsx4("div", { style: { display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 12px", WebkitOverflowScrolling: "touch" }, children: dates.map((d) => /* @__PURE__ */ jsx4(
      "button",
      {
        onClick: () => setSel(d),
        className: `nc-st ${sel === d ? "on" : ""}`,
        style: { flexShrink: 0 },
        children: d.slice(5)
      },
      d
    )) }),
    loading && /* @__PURE__ */ jsx4("div", { className: "nc-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
    daily && !loading && /* @__PURE__ */ jsxs4(Fragment2, { children: [
      /* @__PURE__ */ jsxs4("div", { className: "nc-prog", style: { marginTop: 2 }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "nc-prog-h", children: [
          /* @__PURE__ */ jsx4("b", { children: fmtCnDate(sel || "") }),
          /* @__PURE__ */ jsx4("span", { className: "nc-pct", children: daily.totalMinutes ? `\u7EA6 ${daily.totalMinutes} \u5206\u949F` : "" })
        ] }),
        daily.summary && /* @__PURE__ */ jsx4("div", { className: "nc-sub", style: { padding: 0, color: "#8B95A7" }, children: daily.summary })
      ] }),
      sections.map((s) => /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsxs4("div", { className: "nc-sec", children: [
          /* @__PURE__ */ jsx4("span", { className: "nc-bar" }),
          DIR_ICON2[s.type] || "\u{1F4C4}",
          " ",
          s.title || s.type,
          /* @__PURE__ */ jsx4("span", { className: "nc-hint", children: voices.has(s.type) ? "\u{1F399}\uFE0F \u6709\u8BED\u97F3" : s.items?.length ? `${s.items.length} \u6761` : "" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "nc-feed", children: [
          (s.items || []).slice(0, 4).map((it, i) => /* @__PURE__ */ jsxs4("div", { className: "nc-card", children: [
            /* @__PURE__ */ jsxs4("div", { className: "nc-card-b", children: [
              /* @__PURE__ */ jsx4("b", { children: it.title || it.name || "" }),
              it.meta?.badge && /* @__PURE__ */ jsx4("span", { className: "nc-badge", style: { float: "right" }, children: it.meta.badge })
            ] }),
            it.brief && /* @__PURE__ */ jsx4("div", { className: "nc-sub", children: it.brief }),
            it.meta?.src && /* @__PURE__ */ jsxs4("div", { className: "nc-src", children: [
              /* @__PURE__ */ jsx4("span", { className: "nc-badge", children: it.meta.src }),
              it.meta?.sub && /* @__PURE__ */ jsx4("span", { children: it.meta.sub })
            ] })
          ] }, i)),
          (s.items || []).length > 4 && /* @__PURE__ */ jsx4("div", { className: "nc-card", children: /* @__PURE__ */ jsxs4("div", { className: "nc-sub", children: [
            "\u2026 \u5171 ",
            (s.items || []).length,
            " \u6761"
          ] }) })
        ] })
      ] }, s.type))
    ] })
  ] });
}

// src/Mine.tsx
init_model();
import { useState as useState6, useEffect as useEffect6 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var DIRECTIONS = [
  { key: "creative", label: "\u521B\u610F\u9879\u76EE", icon: "\u{1F4A1}" },
  { key: "fund", label: "\u57FA\u91D1\u6295\u8D44", icon: "\u{1F4C8}" },
  { key: "tech", label: "AI \u6280\u672F", icon: "\u{1F9E0}" },
  { key: "news", label: "\u65F6\u4E8B", icon: "\u{1F525}" },
  { key: "learn", label: "\u5B66\u4E60\uFF08\u4E13\u4E1A+\u901A\u8BC6\uFF09", icon: "\u{1F393}" }
];
function Mine() {
  const [prefs, setPrefs] = useState6(null);
  const [log, setLog] = useState6([]);
  const [progress, setProgress] = useState6(null);
  const [addCode, setAddCode] = useState6("");
  const [toast, setToast] = useState6(null);
  const reload = async () => {
    try {
      const [p, l, prog] = await Promise.all([loadPrefs(), loadPrefsLog(), loadProgress()]);
      setPrefs(p);
      setLog(l.filter((e) => !e.undone).slice(-8).reverse());
      setProgress(prog);
    } catch (e) {
      setToast(`\u52A0\u8F7D\u5931\u8D25\uFF1A${e.message}`);
    }
  };
  useEffect6(() => {
    reload();
  }, []);
  const toastMsg = (m) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };
  const toggleDir = async (key) => {
    if (!prefs) return;
    const next = { ...prefs, directions: { ...prefs.directions, [key]: !prefs.directions[key] } };
    setPrefs(next);
    await savePrefs(next);
    toastMsg(`\u5DF2${next.directions[key] ? "\u5F00\u542F" : "\u5173\u95ED"}\u300C${DIRECTIONS.find((d) => d.key === key)?.label}\u300D`);
  };
  const addFund = async () => {
    if (!prefs) return;
    const c = addCode.trim();
    if (!/^\d{6}$/.test(c)) return toastMsg("\u8BF7\u8F93\u5165 6 \u4F4D\u57FA\u91D1\u4EE3\u7801");
    if (prefs.watchlist.includes(c)) return toastMsg("\u5DF2\u5728\u81EA\u9009\u6C60");
    const next = { ...prefs, watchlist: [...prefs.watchlist, c] };
    setPrefs(next);
    setAddCode("");
    await savePrefs(next);
    toastMsg(`\u5DF2\u6DFB\u52A0 ${c}`);
  };
  const removeFund = async (c) => {
    if (!prefs) return;
    const next = { ...prefs, watchlist: prefs.watchlist.filter((x) => x !== c) };
    setPrefs(next);
    await savePrefs(next);
    toastMsg(`\u5DF2\u79FB\u9664 ${c}`);
  };
  const resetWatchlist = async () => {
    if (!prefs) return;
    const next = { ...prefs, watchlist: DEFAULT_WATCHLIST };
    setPrefs(next);
    await savePrefs(next);
    toastMsg("\u5DF2\u6062\u590D\u9ED8\u8BA4 6 \u53EA\u5B9E\u6D4B\u6C60");
  };
  const setTarget = async (v) => {
    if (!prefs) return;
    const next = { ...prefs, dailyTarget: v };
    setPrefs(next);
    await savePrefs(next);
    toastMsg(`\u6BCF\u65E5\u76EE\u6807 ${v} \u5206\u949F`);
  };
  const setVoice = async (voice) => {
    if (!prefs) return;
    const next = { ...prefs, voice: { ...prefs.voice, voice } };
    setPrefs(next);
    await savePrefs(next);
    toastMsg(`\u97F3\u8272\uFF1A${voice}`);
  };
  const undo = async (ts) => {
    try {
      const full = await loadPrefsLog();
      const entry = full.find((e) => e.ts === ts);
      if (!entry) return toastMsg("\u627E\u4E0D\u5230\u8BE5\u6761\u6539\u52A8");
      if (!prefs) return;
      let what = {};
      try {
        what = JSON.parse(entry.what);
      } catch (_) {
        what = {};
      }
      const next = { ...prefs };
      for (const k of Object.keys(what)) {
        if (k === "directions" && what.directions) {
          const dirs = { ...prefs.directions || {} };
          for (const dk of Object.keys(what.directions)) {
            if (dk in dirs) dirs[dk] = !what.directions[dk];
          }
          next.directions = dirs;
        } else {
          delete next[k];
        }
      }
      setPrefs(next);
      await savePrefs(next);
      entry.undone = true;
      await kvSetLog(full);
      toastMsg("\u5DF2\u64A4\u9500\u8BE5\u6761 AI \u6539\u52A8");
      reload();
    } catch (e) {
      toastMsg(`\u64A4\u9500\u5931\u8D25\uFF1A${e.message}`);
    }
  };
  return /* @__PURE__ */ jsxs5("div", { className: "nc-page", children: [
    /* @__PURE__ */ jsxs5("div", { className: "nc-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "nc-logo", style: { background: "linear-gradient(135deg,#3FB950,#58A6FF)" }, children: "\u{1F464}" }),
      /* @__PURE__ */ jsxs5("div", { className: "nc-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u6211\u7684" }),
        /* @__PURE__ */ jsx5("small", { children: "\u504F\u597D \xB7 \u57FA\u91D1\u6C60 \xB7 AI \u6539\u52A8\u65E5\u5FD7" })
      ] })
    ] }),
    !prefs && /* @__PURE__ */ jsx5("div", { className: "nc-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
    prefs && /* @__PURE__ */ jsxs5("div", { className: "nc-feed", children: [
      /* @__PURE__ */ jsxs5("div", { className: "nc-card", style: { padding: 13 }, children: [
        /* @__PURE__ */ jsxs5("div", { className: "nc-card-h", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u5173\u6CE8\u65B9\u5411" }),
          /* @__PURE__ */ jsx5("span", { className: "nc-hint", children: "\u65E5\u62A5\u5404\u677F\u5757\u6743\u91CD" })
        ] }),
        /* @__PURE__ */ jsx5("div", { className: "nc-dir-list", children: DIRECTIONS.map((d) => /* @__PURE__ */ jsxs5("button", { className: `nc-dir ${prefs.directions[d.key] ? "on" : ""}`, onClick: () => toggleDir(d.key), children: [
          /* @__PURE__ */ jsx5("span", { children: d.icon }),
          d.label,
          /* @__PURE__ */ jsx5("span", { className: "nc-dir-sw", children: prefs.directions[d.key] ? "\u2713" : "\u2715" })
        ] }, d.key)) }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx5("span", { className: "nc-lbl", children: "\u6BCF\u65E5\u76EE\u6807" }),
          [60, 90, 120].map((v) => /* @__PURE__ */ jsxs5("button", { className: `nc-btn sm ${prefs.dailyTarget === v ? "" : "ghost"}`, onClick: () => setTarget(v), children: [
            v,
            " \u5206"
          ] }, v))
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx5("span", { className: "nc-lbl", children: "\u8BED\u97F3\u97F3\u8272" }),
          ["\u51B0\u7CD6", "\u8309\u8389", "\u82CF\u6253", "\u767D\u6866"].map((v) => /* @__PURE__ */ jsx5("button", { className: `nc-btn sm ${prefs.voice?.voice === v ? "" : "ghost"}`, onClick: () => setVoice(v), children: v }, v))
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "nc-card", style: { padding: 13 }, children: [
        /* @__PURE__ */ jsxs5("div", { className: "nc-card-h", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u57FA\u91D1\u81EA\u9009\u6C60" }),
          /* @__PURE__ */ jsx5("span", { className: "nc-hint", children: "AI \u6BCF\u65E5\u7814\u5224\u8FD9\u4E9B\u57FA\u91D1" })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-fund-list", children: [
          prefs.watchlist.map((c) => /* @__PURE__ */ jsxs5("span", { className: "nc-fund-chip", children: [
            c,
            /* @__PURE__ */ jsx5("b", { onClick: () => removeFund(c), children: "\u2715" })
          ] }, c)),
          !prefs.watchlist.length && /* @__PURE__ */ jsx5("span", { className: "nc-sub", children: "\u7A7A\u6C60\uFF1AAI \u5C06\u53EA\u6309\u6392\u884C\u63A8\u9001" })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx5("input", { className: "nc-inp", placeholder: "6 \u4F4D\u57FA\u91D1\u4EE3\u7801", value: addCode, onChange: (e) => setAddCode(e.target.value), onKeyDown: (e) => e.key === "Enter" && addFund() }),
          /* @__PURE__ */ jsx5("button", { className: "nc-btn ghost", onClick: addFund, children: "+ \u6DFB\u52A0" }),
          /* @__PURE__ */ jsx5("button", { className: "nc-btn ghost sm", onClick: resetWatchlist, children: "\u9ED8\u8BA4\u6C60" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "nc-card", style: { padding: 13 }, children: [
        /* @__PURE__ */ jsxs5("div", { className: "nc-card-h", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u5B66\u4E60\u8BA1\u5212" }),
          /* @__PURE__ */ jsx5("span", { className: "nc-hint", children: "\u53CC\u7EBF\u9AA8\u67B6" })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ jsx5("span", { className: "nc-lbl", children: "\u4E13\u4E1A\u7EBF" }),
          ["L1", "L2", "L3", "L4"].map((v) => /* @__PURE__ */ jsx5("button", { className: `nc-btn sm ${prefs.learn?.proStage === v ? "" : "ghost"}`, onClick: () => {
            if (prefs) {
              const n = { ...prefs, learn: { ...prefs.learn, proStage: v } };
              setPrefs(n);
              savePrefs(n);
              toastMsg(`\u4E13\u4E1A\u7EBF\u9636\u6BB5 ${v}`);
            }
          }, children: v }, v))
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-sub", style: { marginTop: 6 }, children: [
          "\u901A\u8BC6\u6F2B\u6E38\uFF1A24 \u4E3B\u9898\u8F6E\u6362 \xB7 \u6BCF\u5468 ",
          prefs.learn?.weeklyDays || 5,
          " \u5929 \xB7 \u5DF2\u5B8C\u6210 ",
          progress?.learned?.gen?.length || 0,
          " \u4E3B\u9898"
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "nc-card", style: { padding: 13 }, children: [
        /* @__PURE__ */ jsxs5("div", { className: "nc-card-h", children: [
          /* @__PURE__ */ jsx5("b", { children: "AI \u6539\u52A8\u65E5\u5FD7" }),
          /* @__PURE__ */ jsx5("span", { className: "nc-hint", children: "AI \u56DE\u5199\u504F\u597D\u8BB0\u5F55\uFF08\u53EF\u64A4\u9500\uFF09" })
        ] }),
        log.length === 0 ? /* @__PURE__ */ jsx5("div", { className: "nc-sub", children: "\u6682\u65E0 AI \u6539\u52A8\u3002AI \u53D1\u73B0\u4F60\u7684\u9605\u8BFB\u4E60\u60EF\u53D8\u5316\u65F6\uFF0C\u4F1A\u5E26 reason \u56DE\u5199\u5E76\u8BB0\u5728\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ jsx5("div", { className: "nc-log-list", children: log.map((e) => /* @__PURE__ */ jsxs5("div", { className: "nc-log-item", children: [
          /* @__PURE__ */ jsxs5("div", { className: "nc-log-main", children: [
            /* @__PURE__ */ jsx5("b", { children: e.reason }),
            /* @__PURE__ */ jsxs5("small", { children: [
              new Date(e.ts).toLocaleString(),
              " \xB7 ",
              e.what
            ] })
          ] }),
          /* @__PURE__ */ jsx5("button", { className: "nc-btn sm ghost", onClick: () => undo(e.ts), children: "\u64A4\u9500" })
        ] }, e.ts)) })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "nc-card", style: { padding: 13 }, children: [
        /* @__PURE__ */ jsxs5("div", { className: "nc-card-h", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u5B66\u4E60\u6863\u6848" }),
          /* @__PURE__ */ jsxs5("span", { className: "nc-hint", children: [
            "\u8FDE\u7EED\u6253\u5361 ",
            progress?.streak || 0,
            " \u5929"
          ] })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "nc-sub", children: [
          "\u6536\u85CF ",
          progress?.favorites?.length || 0,
          " \u6761 \xB7 \u6700\u8FD1\u9605\u8BFB ",
          progress?.lastRead || "\u2014",
          " \xB7 \u4ECA\u65E5\u5DF2\u8BFB ",
          progress?.minutesToday || 0,
          " \u5206\u949F"
        ] })
      ] })
    ] }),
    toast && /* @__PURE__ */ jsx5("div", { className: "nc-toast", children: toast })
  ] });
}
async function kvSetLog(full) {
  const { kvSet: kvSet2 } = await Promise.resolve().then(() => (init_model(), model_exports));
  await kvSet2("news.prefsLog", full);
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.nc-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.nc-body{flex:1;overflow-y:auto;padding:0 0 20px}
.nc-body::-webkit-scrollbar{width:9px;height:9px}
.nc-body::-webkit-scrollbar-track{background:transparent}
.nc-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.nc-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}

/* \u9875\u9762 */
.nc-page{max-width:430px;margin:0 auto;padding-bottom:20px}
.nc-top{position:sticky;top:0;z-index:20;padding:14px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 70%,rgba(16,20,28,0))}
.nc-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#58A6FF,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.nc-tt{flex:1;min-width:0}
.nc-tt b{font-size:16px;display:block}
.nc-tt small{color:#8B95A7;font-size:11px;display:block;margin-top:1px}
.nc-play{width:38px;height:38px;border-radius:50%;border:1px solid #242C3A;background:#161B22;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;cursor:pointer;box-shadow:0 2px 12px rgba(88,166,255,.15);color:#58A6FF}
.nc-play:hover{background:#1C2330}

/* \u8FDB\u5EA6\u5361 */
.nc-prog{background:#161B22;border:1px solid #242C3A;border-radius:14px;padding:12px 14px;margin:2px 16px 14px}
.nc-prog-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.nc-prog-h b{font-size:13px}
.nc-pct{margin-left:auto;color:#58A6FF;font-weight:700;font-size:13px}
.nc-track{height:6px;border-radius:3px;background:#1C2330;overflow:hidden}
.nc-track i{display:block;height:100%;background:linear-gradient(90deg,#58A6FF,#BC8CFF);border-radius:3px}
.nc-labels{display:flex;justify-content:space-between;margin-top:6px;font-size:9.5px;color:#5C6678}
.nc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* \u677F\u5757\u6807\u9898 */
.nc-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 8px;font-size:14px;font-weight:700}
.nc-bar{width:3px;height:14px;border-radius:2px;background:linear-gradient(180deg,#58A6FF,#BC8CFF);flex-shrink:0}
.nc-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.nc-feed{display:flex;flex-direction:column;gap:10px;padding:0 16px 18px}

/* \u5361\u7247 */
.nc-card{background:#161B22;border:1px solid #242C3A;border-radius:14px;overflow:hidden}
.nc-card-b{padding:12px 14px 0}
.nc-card-b b{font-size:13px}
.nc-card-h{padding:0 0 8px;display:flex;align-items:center}
.nc-card-h b{font-size:13px}
.nc-sub{padding:4px 14px 10px;font-size:10.5px;color:#8B95A7;line-height:1.6}
.nc-src{display:flex;align-items:center;gap:6px;padding:8px 14px;border-top:1px solid #242C3A;background:rgba(255,255,255,.02);font-size:10.5px;color:#5C6678}
.nc-badge{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7}
.nc-up{color:#3FB950}.nc-down{color:#F85149}.nc-warn{color:#D29922}
.nc-lbl{font-size:11px;color:#8B95A7;flex-shrink:0}

/* \u6309\u94AE */
.nc-btn{background:#3b6fd4;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.nc-btn:disabled{opacity:.5;cursor:not-allowed}
.nc-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.nc-btn.sm{padding:4px 9px;font-size:11px}
.nc-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;flex:1;min-width:120px}
.nc-empty{color:#8B95A7;font-size:12px;padding:18px 16px;text-align:center;line-height:1.7}
.nc-toast{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap}
.nc-tip{color:#5C6678}

/* \u53CC\u7EBF\u5B66\u4E60\u5361 */
.nc-line{display:flex;flex-direction:column;gap:9px;padding:13px;background:#161B22;border:1px solid #242C3A;border-radius:14px;cursor:pointer}
.nc-line:hover{border-color:rgba(88,166,255,.4)}
.nc-line-h{display:flex;align-items:center;gap:10px}
.nc-lic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.nc-line-t{flex:1;min-width:0}
.nc-line-t b{font-size:14px;display:block}
.nc-line-t small{color:#5C6678;font-size:10.5px;display:block}
.nc-line-track{height:5px;border-radius:3px;background:#1C2330;overflow:hidden}
.nc-line-track i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#1F6FEB,#58A6FF)}
.nc-line-d{font-size:10px;color:#5C6678;line-height:1.7}
.nc-tags{display:flex;gap:6px;flex-wrap:wrap}
.nc-tags span{font-size:9.5px;padding:2px 8px;border-radius:999px;border:1px solid #242C3A;color:#8B95A7}

/* \u8BFE\u7A0B\u4F53\u7CFB */
.nc-lv{background:#161B22;border:1px solid #242C3A;border-radius:14px;padding:13px}
.nc-lv-h{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.nc-lv-tag{font-size:9.5px;font-weight:700;padding:2px 9px;border-radius:999px;letter-spacing:.5px}
.nc-lv-h b{font-size:13px;flex:1}
.nc-lv-st{font-size:10px;color:#5C6678}
.nc-unit{display:flex;align-items:center;gap:9px;padding:8px 10px;background:#1C2330;border-radius:9px;margin-bottom:7px}
.nc-unit.done{opacity:.62}
.nc-uno{width:26px;height:26px;border-radius:8px;background:#12151c;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;flex-shrink:0;font-weight:700}
.nc-unit.done .nc-uno{background:#1C2330;color:#3FB950;border:1px solid rgba(63,185,80,.4)}
.nc-unit.now{border:1px solid rgba(88,166,255,.4)}
.nc-unit.now .nc-uno{background:linear-gradient(135deg,#1F6FEB,#3F8CFF)}
.nc-unit.next .nc-uno{background:#1C2330;color:#5C6678;border:1px solid #242C3A}
.nc-unit.next{opacity:.75}
.nc-uti{flex:1;min-width:0}
.nc-uti b{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-udur{color:#5C6678;font-size:10px;flex-shrink:0}

/* \u7AE0\u8282\u8BFE */
.nc-lesson{background:#161B22;border:1px solid #242C3A;border-radius:14px;overflow:hidden}
.nc-lesson-h{padding:11px 13px;display:flex;align-items:center;gap:9px}
.nc-lesson-n{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#1F6FEB,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0;font-weight:700}
.nc-lesson-t{flex:1;min-width:0}
.nc-lesson-t b{font-size:13px;display:block}
.nc-lesson-t small{color:#5C6678;font-size:10px}
.nc-spk{font-size:10px;color:#58A6FF;border:1px solid rgba(88,166,255,.3);padding:2px 8px;border-radius:999px;background:rgba(88,166,255,.08);flex-shrink:0;cursor:pointer}
.nc-lesson-b{padding:2px 13px 12px;font-size:11.5px;color:#8B95A7;line-height:1.65;border-left:3px solid #242C3A;margin-left:21px;margin-right:13px;margin-bottom:12px;padding-left:10px}

/* AI \u6559\u7EC3 */
.nc-coach{background:linear-gradient(135deg,rgba(88,166,255,.12),rgba(188,140,255,.08));border:1px solid rgba(88,166,255,.3);border-radius:14px;padding:12px 13px}
.nc-coach-h{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px;font-weight:700}
.nc-coach-ic{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#1F6FEB,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:13px}
.nc-coach p{font-size:11.5px;color:#8B95A7;line-height:1.65;margin-bottom:8px}
.nc-qrow{display:flex;gap:6px;flex-wrap:wrap}
.nc-qrow span{font-size:10px;color:#58A6FF;border:1px dashed rgba(88,166,255,.4);background:rgba(88,166,255,.06);padding:4px 9px;border-radius:999px;cursor:pointer}

/* \u901A\u8BC6\u4E3B\u9898 */
.nc-topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 14px}
.nc-topic{background:#161B22;border:1px solid #242C3A;border-radius:11px;padding:11px;display:flex;flex-direction:column;gap:4px;cursor:pointer}
.nc-topic:hover{border-color:rgba(88,166,255,.4)}
.nc-topic.done{border-color:rgba(63,185,80,.35)}
.nc-topic.done small{color:#3FB950}
.nc-topic.now{border-color:rgba(88,166,255,.5)}
.nc-tico{width:28px;height:28px;border-radius:8px;background:#1C2330;display:flex;align-items:center;justify-content:center;font-size:14px}
.nc-topic b{font-size:12px}
.nc-topic small{color:#5C6678;font-size:9.5px}

/* \u6D4B\u9A8C */
.nc-quiz{background:#161B22;border:1px solid #242C3A;border-radius:14px;padding:13px}
.nc-qt{font-size:13px;font-weight:600;margin-bottom:9px;display:flex;gap:8px;align-items:flex-start}
.nc-qn{width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#3FB950,#4AC26B);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0;font-weight:700}
.nc-op{display:block;width:100%;text-align:left;background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:8px 11px;font-size:11.5px;color:#8B95A7;margin-bottom:6px;cursor:pointer}
.nc-op.cor{border-color:#3FB950;color:#3FB950;background:rgba(63,185,80,.1)}
.nc-op.wro{border-color:#F85149;color:#F85149;background:rgba(248,81,73,.08)}

/* \u8BED\u97F3 */
.nc-voice{background:#161B22;border:1px solid #242C3A;border-radius:14px;overflow:hidden}
.nc-voice-h{padding:11px 13px;display:flex;align-items:center;gap:10px;cursor:pointer}
.nc-vic{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1F6FEB,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;color:#fff}
.nc-voice-t{flex:1;min-width:0}
.nc-voice-t b{font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-voice-t small{color:#5C6678;font-size:10px}
.nc-voice-dur{color:#8B95A7;font-size:10.5px;flex-shrink:0}
.nc-voice-prog{height:3px;background:#242C3A}
.nc-voice-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#58A6FF,#BC8CFF)}
.nc-player{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:398px;z-index:31;padding:9px 12px;background:rgba(22,27,35,.96);backdrop-filter:blur(14px);border:1px solid #242C3A;border-radius:12px;display:flex;align-items:center;gap:9px;box-shadow:0 6px 18px #0008}
.nc-player-info{flex:1;min-width:0}
.nc-player-info b{font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-player-bar{height:3px;background:#242C3A;border-radius:2px;margin-top:3px;overflow:hidden}
.nc-player-bar i{display:block;height:100%;width:34%;background:linear-gradient(90deg,#58A6FF,#BC8CFF)}
.nc-player-ctrl{font-size:18px;cursor:pointer;flex-shrink:0}

/* \u5B50 Tab */
.nc-subtab{display:flex;gap:6px;padding:0 16px 12px}
.nc-st{padding:7px 14px;border-radius:999px;background:#161B22;border:1px solid #242C3A;color:#8B95A7;font-size:13px;cursor:pointer}
.nc-st.on{background:linear-gradient(135deg,#1F6FEB,#3F8CFF);border-color:transparent;color:#fff;font-weight:600}

/* \u6211\u7684 */
.nc-dir-list{display:flex;flex-direction:column;gap:6px}
.nc-dir{display:flex;align-items:center;gap:8px;background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:8px 11px;font-size:12px;color:#8B95A7;cursor:pointer;width:100%;text-align:left}
.nc-dir.on{border-color:rgba(88,166,255,.45);color:#E6EAF2;background:rgba(88,166,255,.06)}
.nc-dir-sw{margin-left:auto;font-weight:700}
.nc-dir.on .nc-dir-sw{color:#3FB950}
.nc-fund-list{display:flex;gap:6px;flex-wrap:wrap}
.nc-fund-chip{background:#1C2330;border:1px solid #242C3A;border-radius:999px;padding:3px 10px;font-size:11px;color:#8B95A7;display:inline-flex;align-items:center;gap:6px}
.nc-fund-chip b{color:#5C6678;cursor:pointer;font-size:11px}
.nc-fund-chip b:hover{color:#F85149}
.nc-log-list{display:flex;flex-direction:column;gap:8px}
.nc-log-item{display:flex;align-items:center;gap:8px;background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:8px 10px}
.nc-log-main{flex:1;min-width:0}
.nc-log-main b{font-size:11.5px;display:block}
.nc-log-main small{font-size:9.5px;color:#5C6678;display:block;margin-top:2px;word-break:break-all}

/* \u5E95\u90E8\u5BFC\u822A\uFF08\u6D41\u5185\u8D34\u5E95\uFF0C\u4E0D\u7528 fixed \u4EE5\u514D\u8D8A\u51FA\u4FA7\u8FB9\u680F\u5BB9\u5668\uFF09 */
.nc-tabbar{flex-shrink:0;width:100%;max-width:430px;background:rgba(18,22,30,.95);backdrop-filter:blur(14px);border-top:1px solid #242C3A;display:flex;padding:6px 8px calc(6px + env(safe-area-inset-bottom))}
.nc-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 0;cursor:pointer;border-radius:10px;color:#5C6678;font-size:9.5px;background:none;border:none}
.nc-tab .nc-tab-ic{font-size:17px}
.nc-tab.on{color:#fff;background:rgba(88,166,255,.12)}
.nc-tab.on .nc-tab-ic{color:#58A6FF}
`;
var TABS = [
  { id: "today", label: "\u4ECA\u65E5", icon: "\u{1F4F0}" },
  { id: "learn", label: "\u5B66\u4E60", icon: "\u{1F393}" },
  { id: "voice", label: "\u8BED\u97F3", icon: "\u{1F399}\uFE0F" },
  { id: "archive", label: "\u5386\u53F2", icon: "\u{1F4DA}" },
  { id: "mine", label: "\u6211\u7684", icon: "\u{1F464}" }
];
function NewsPanel({ onSendToChat }) {
  const [tab, setTab] = useState7(0);
  useEffect7(() => {
    setHostSend(onSendToChat);
    return () => setHostSend(void 0);
  }, [onSendToChat]);
  return /* @__PURE__ */ jsxs6("div", { className: "nc-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "nc-body", children: [
      tab === 0 && /* @__PURE__ */ jsx6(Today, { goTab: setTab }),
      tab === 1 && /* @__PURE__ */ jsx6(Learn, {}),
      tab === 2 && /* @__PURE__ */ jsx6(Voice, {}),
      tab === 3 && /* @__PURE__ */ jsx6(Archive, {}),
      tab === 4 && /* @__PURE__ */ jsx6(Mine, {})
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "nc-tabbar", children: TABS.map((t, i) => /* @__PURE__ */ jsxs6("button", { className: `nc-tab ${tab === i ? "on" : ""}`, onClick: () => setTab(i), children: [
      /* @__PURE__ */ jsx6("span", { className: "nc-tab-ic", children: t.icon }),
      t.label
    ] }, t.id)) })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function NewsCuratorEntry(props) {
  return /* @__PURE__ */ jsx7(NewsPanel, { ...props });
}
export {
  NewsCuratorEntry as default
};
