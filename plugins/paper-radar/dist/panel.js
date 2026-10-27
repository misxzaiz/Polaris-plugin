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

// src/model.ts
var DEFAULT_SETTINGS = {
  perTopic: 15,
  dailyTop: 12,
  scanHour: 8,
  scanIntervalHours: 8,
  maxFav: 200
};
var PREFIX = "paper.";
var K = {
  settings: "paper.settings",
  topics: "paper.topics",
  feed: (d) => `paper.feed.${d}`,
  fav: (id) => `paper.fav.${id}`,
  meta: "paper.meta"
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
async function loadTopics() {
  const v = await kvGet(K.topics);
  return Array.isArray(v) ? v : [];
}
async function loadSettings() {
  const v = await kvGet(K.settings);
  return { ...DEFAULT_SETTINGS, ...v && typeof v === "object" ? v : {} };
}
async function loadMeta() {
  return kvGet(K.meta);
}
function todayStr() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function loadFeed(date = todayStr()) {
  const v = await kvGet(K.feed(date));
  return v && Array.isArray(v.items) ? v : null;
}
async function loadRecentFeeds(days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 864e5);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const f = await loadFeed(ds).catch(() => null);
    if (f && f.items.length) out.push(f);
  }
  return out;
}
async function loadFavs() {
  const keys = await kvKeys();
  const favKeys = keys.filter((k) => k.startsWith(PREFIX + "fav."));
  const rows = [];
  for (const k of favKeys) {
    const id = k.slice(PREFIX.length + 4);
    const fav = await kvGet(k).catch(() => null);
    if (!fav) continue;
    rows.push({ fav, paper: void 0 });
  }
  rows.sort((a, b) => b.fav.favoritedAt - a.fav.favoritedAt);
  return rows;
}
function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return "t" + c.randomUUID().replace(/-/g, "").slice(0, 8);
  return "t" + Math.random().toString(36).slice(2, 10);
}
async function saveTopics(topics) {
  await kvSet(K.topics, topics);
}
async function addTopic(name, keywords) {
  const topics = await loadTopics();
  const topic = { id: uid(), name: name.trim() || "\u672A\u547D\u540D", keywords, enabled: true, createdAt: Date.now() };
  topics.push(topic);
  await saveTopics(topics);
  return topic;
}
async function removeTopic(id) {
  const topics = await loadTopics();
  await saveTopics(topics.filter((t) => t.id !== id));
}
async function toggleTopic(id, enabled) {
  const topics = await loadTopics();
  await saveTopics(topics.map((t) => t.id === id ? { ...t, enabled } : t));
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function toggleFavRead(id, read) {
  const f = await kvGet(K.fav(id));
  if (!f) return;
  await kvSet(K.fav(id), { ...f, read, updatedAt: Date.now() });
}
async function removeFav(id) {
  await kvDel(K.fav(id));
}
function timeAgo(ts) {
  if (!ts) return "\u4ECE\u672A";
  const d = Date.now() - ts;
  if (d < 15 * 1e3) return "\u521A\u521A";
  if (d < 60 * 1e3) return `${Math.floor(d / 1e3)} \u79D2\u524D`;
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var css = `
.pr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pr-body::-webkit-scrollbar{width:9px;height:9px}
.pr-body::-webkit-scrollbar-track{background:transparent}
.pr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pr-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.pr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.pr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#B087F5,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.pr-tt{flex:1;min-width:0}
.pr-tt b{font-size:15px;display:block}
.pr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.pr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.pr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.pr-dot.stale{background:#D29922}
.pr-dot.down{background:#F85149}
.pr-tabs{display:flex;gap:4px}
.pr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.pr-tab:hover{color:#E6EAF2}
.pr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pr-badge{position:absolute;top:0;right:2px;background:#B087F5;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.pr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.pr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#B087F5,#58A6FF);flex-shrink:0}
.pr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.pr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pr-card-b{padding:11px 13px}
.pr-empty{color:#8B95A7;font-size:12px;padding:30px 18px;text-align:center;line-height:1.9}
.pr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.pr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pr-toast.bad{border-color:#54262c;color:#FF8A9A}
.pr-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:pr-spin .8s linear infinite;vertical-align:-1px}
@keyframes pr-spin{to{transform:rotate(360deg)}}

/* \u8BBA\u6587\u5361\u7247 */
.pr-paper{border-bottom:1px solid #1d2330;padding:11px 13px}
.pr-paper:last-child{border-bottom:none}
.pr-paper-t{display:flex;gap:8px;align-items:baseline}
.pr-score{flex-shrink:0;font-size:9.5px;color:#B087F5;font-weight:700;border:1px solid #3a2f5c;border-radius:5px;padding:1px 5px}
.pr-paper h4{font-size:13px;margin:0 0 4px;font-weight:600;line-height:1.45}
.pr-paper h4 a{color:#D9E6FF;text-decoration:none}
.pr-paper h4 a:hover{text-decoration:underline}
.pr-a{font-size:10.5px;color:#8B95A7;margin-bottom:3px}
.pr-meta{font-size:10px;color:#5C6678;display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px}
.pr-verdict{font-size:11px;color:#9FB3D9;line-height:1.55;margin-bottom:6px}
.pr-actions{display:flex;gap:6px;align-items:center}
.pr-btn{background:#3a3055;border:none;color:#C9C9FF;border-radius:7px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600}
.pr-btn:hover{filter:brightness(1.15)}
.pr-btn:disabled{opacity:.45;cursor:not-allowed}
.pr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}

/* \u4E3B\u9898\u8BBE\u7F6E */
.pr-topic{display:flex;align-items:center;gap:10px;padding:9px 13px;border-bottom:1px solid #1d2330}
.pr-topic:last-child{border-bottom:none}
.pr-topic-l{flex:1;min-width:0}
.pr-topic-l b{font-size:12.5px;display:block}
.pr-topic-l small{font-size:10.5px;color:#8B95A7;display:block;line-height:1.5}
.pr-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.pr-toggle.on{background:#7a5cc8}
.pr-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.pr-toggle.on i{left:18px}
.pr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pr-inp:focus{outline:none;border-color:#7a5cc8}
.pr-inp::placeholder{color:#4d5566}
.pr-lbl{font-size:11px;color:#8B95A7;margin:10px 0 3px;display:block}
`;
function PaperRadarPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState("today");
  const [feeds, setFeeds] = useState([]);
  const [favRows, setFavRows] = useState([]);
  const [topics, setTopics] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [meta, setMeta] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const [f, m, t, s] = await Promise.all([
        loadRecentFeeds(5),
        loadMeta(),
        loadTopics(),
        loadSettings()
      ]);
      setFeeds(f);
      setMeta(m);
      setTopics(t);
      setSettings(s);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 1e4);
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
  const reloadFavs = useCallback(async () => {
    try {
      setFavRows(await loadFavs());
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    reloadFavs();
  }, [reloadFavs, tab]);
  const heartbeat = (() => {
    if (!meta) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const last = meta.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const age = Date.now() - last;
    if (age < 3 * 3600 * 1e3) return { cls: "ok", text: `\u670D\u52A1\u5728\u7EBF \xB7 ${meta.status || "ok"}${meta.date ? ` \xB7 ${meta.date}` : ""}` };
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 36e5)} \u5C0F\u65F6` };
  })();
  return /* @__PURE__ */ jsxs("div", { className: "pr-root", children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    /* @__PURE__ */ jsxs("div", { className: "pr-top", children: [
      /* @__PURE__ */ jsx("div", { className: "pr-logo", children: "\u{1F4DA}" }),
      /* @__PURE__ */ jsxs("div", { className: "pr-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "\u8BBA\u6587\u96F7\u8FBE" }),
        /* @__PURE__ */ jsxs("small", { children: [
          /* @__PURE__ */ jsx("i", { className: `pr-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "pr-tabs", children: [["today", "\u4ECA\u65E5"], ["favs", "\u6536\u85CF"], ["topics", "\u4E3B\u9898"]].map(([k, label]) => /* @__PURE__ */ jsxs("button", { className: `pr-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "favs" && favRows.length > 0 && /* @__PURE__ */ jsx("span", { className: "pr-badge", children: favRows.length > 99 ? "99+" : favRows.length })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "pr-body", children: /* @__PURE__ */ jsxs("div", { className: "pr-page", children: [
      loadErr && /* @__PURE__ */ jsxs("div", { className: "pr-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "today" && /* @__PURE__ */ jsxs(Fragment, { children: [
        feeds.length === 0 && !loadErr && /* @__PURE__ */ jsxs("div", { className: "pr-empty", children: [
          "\u4ECA\u65E5\u699C\u5355\u8FD8\u6CA1\u751F\u6210\u3002",
          /* @__PURE__ */ jsx("br", {}),
          "\xB7 \u9996\u6B21\u9700\u8981\u540E\u53F0\u670D\u52A1\u542F\u52A8\u540E\u8DD1\u4E00\u6B21\u626B\u63CF\uFF08\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u8BBA\u6587\u96F7\u8FBE\uFF09",
          /* @__PURE__ */ jsx("br", {}),
          "\xB7 \u6216\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u641C\u4ECA\u5929\u7684\u8BBA\u6587\u300D\uFF0CAI \u4F1A\u89E6\u53D1\u626B\u63CF",
          /* @__PURE__ */ jsx("br", {}),
          "\xB7 \u5DF2\u914D\u7F6E\u4E3B\u9898\u540E\uFF0C\u6BCF\u65E5\u81EA\u52A8\u751F\u6210\u699C\u5355"
        ] }),
        feeds.map((feed) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("div", { className: "pr-sec", children: [
            /* @__PURE__ */ jsx("span", { className: "pr-bar" }),
            feed.date === todayStr() ? "\u{1F4CC} \u4ECA\u65E5\u503C\u5F97\u8BFB" : feed.date,
            /* @__PURE__ */ jsxs("span", { className: "pr-hint", children: [
              feed.count,
              " \u7BC7 \xB7 ",
              feed.generatedAt ? timeAgo(feed.generatedAt) : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "pr-card", children: feed.items.map((p, i) => /* @__PURE__ */ jsx(PaperCard, { paper: p, rank: i + 1 }, p.id)) })
        ] }, feed.date))
      ] }),
      tab === "favs" && (favRows.length === 0 ? /* @__PURE__ */ jsx("div", { className: "pr-empty", children: "\u8FD8\u6CA1\u6709\u6536\u85CF\u3002\u5BF9 AI \u8BF4\u300C\u6536\u85CF\u8FD9\u7BC7\u8BBA\u6587 _id_\u300D\u5373\u53EF\u5165\u5E93\u3002" }) : /* @__PURE__ */ jsx("div", { className: "pr-card", children: favRows.map((r) => /* @__PURE__ */ jsxs("div", { className: "pr-paper", children: [
        /* @__PURE__ */ jsxs("div", { className: "pr-paper-t", children: [
          /* @__PURE__ */ jsx("h4", { children: /* @__PURE__ */ jsx("a", { href: `https://arxiv.org/abs/${r.fav.id}`, target: "_blank", rel: "noreferrer", children: r.fav.id }) }),
          /* @__PURE__ */ jsx("span", { className: "pr-score", children: r.fav.read ? "\u5DF2\u8BFB" : "\u672A\u8BFB" })
        ] }),
        r.fav.note && /* @__PURE__ */ jsxs("div", { className: "pr-verdict", children: [
          "\u{1F4DD} ",
          r.fav.note
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "pr-meta", children: [
          "\u6536\u85CF\u4E8E ",
          fmtDate(r.fav.favoritedAt)
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "pr-actions", children: [
          /* @__PURE__ */ jsx("button", { className: "pr-btn", onClick: () => toggleFavRead(r.fav.id, !r.fav.read).then(reloadFavs), children: r.fav.read ? "\u6807\u672A\u8BFB" : "\u6807\u5DF2\u8BFB" }),
          /* @__PURE__ */ jsx("button", { className: "pr-btn ghost", onClick: () => window.open(`https://arxiv.org/abs/${r.fav.id}`, "_blank"), children: "\u6253\u5F00" }),
          /* @__PURE__ */ jsx("button", { className: "pr-btn danger", onClick: () => removeFav(r.fav.id).then(reloadFavs), children: "\u5220\u9664" })
        ] })
      ] }, r.fav.id)) })),
      tab === "topics" && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "pr-sec", children: [
          /* @__PURE__ */ jsx("span", { className: "pr-bar" }),
          "\u5173\u6CE8\u4E3B\u9898",
          /* @__PURE__ */ jsx("span", { className: "pr-hint", children: "\u5173\u952E\u8BCD\u547D\u4E2D\u51B3\u5B9A\u6BCF\u65E5\u699C\u5355" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "pr-card", children: [
          topics.length === 0 && /* @__PURE__ */ jsx("div", { className: "pr-empty", children: "\u8FD8\u6CA1\u6709\u4E3B\u9898\u3002\u6DFB\u52A0\u4E00\u4E2A\uFF0C\u6BD4\u5982\u300C\u591A\u6A21\u6001\u300D\u300Cdiffusion\u300D\u3002" }),
          topics.map((t) => /* @__PURE__ */ jsxs("div", { className: "pr-topic", children: [
            /* @__PURE__ */ jsxs("div", { className: "pr-topic-l", children: [
              /* @__PURE__ */ jsx("b", { children: t.name }),
              /* @__PURE__ */ jsx("small", { children: t.keywords.join(" \xB7 ") })
            ] }),
            /* @__PURE__ */ jsx("button", { className: `pr-toggle ${t.enabled ? "on" : ""}`, onClick: () => toggleTopic(t.id, !t.enabled), children: /* @__PURE__ */ jsx("i", {}) }),
            /* @__PURE__ */ jsx("button", { className: "pr-btn danger", onClick: () => removeTopic(t.id).then(reload), children: "\u2715" })
          ] }, t.id))
        ] }),
        /* @__PURE__ */ jsx(AddTopicForm, { onAdded: () => {
          reload();
          showToast("\u5DF2\u6DFB\u52A0\u4E3B\u9898\uFF0C\u4E0B\u6B21\u626B\u63CF\u751F\u6548");
        } }),
        /* @__PURE__ */ jsxs("div", { className: "pr-sec", children: [
          /* @__PURE__ */ jsx("span", { className: "pr-bar" }),
          "\u6293\u53D6\u8BBE\u7F6E"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "pr-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "pr-topic", children: [
            /* @__PURE__ */ jsxs("div", { className: "pr-topic-l", children: [
              /* @__PURE__ */ jsx("b", { children: "\u6BCF\u4E3B\u9898\u62C9\u53D6" }),
              /* @__PURE__ */ jsx("small", { children: "\u6BCF\u4E2A\u4E3B\u9898\u4ECE arXiv \u62C9\u53D6\u7684\u6700\u65B0\u8BBA\u6587\u6570" })
            ] }),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "pr-inp",
                type: "number",
                min: 1,
                max: 50,
                value: settings.perTopic,
                onChange: (e) => setSettings({ ...settings, perTopic: Number(e.target.value) || 15 })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pr-topic", children: [
            /* @__PURE__ */ jsxs("div", { className: "pr-topic-l", children: [
              /* @__PURE__ */ jsx("b", { children: "\u6BCF\u65E5\u4E0A\u699C" }),
              /* @__PURE__ */ jsx("small", { children: "\u699C\u5355\u4FDD\u7559\u7684\u6700\u503C\u5F97\u8BFB\u6761\u6570" })
            ] }),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "pr-inp",
                type: "number",
                min: 1,
                max: 30,
                value: settings.dailyTop,
                onChange: (e) => setSettings({ ...settings, dailyTop: Number(e.target.value) || 12 })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pr-topic", children: [
            /* @__PURE__ */ jsxs("div", { className: "pr-topic-l", children: [
              /* @__PURE__ */ jsx("b", { children: "\u626B\u63CF\u95F4\u9694" }),
              /* @__PURE__ */ jsx("small", { children: "\u6BCF\u51E0\u5C0F\u65F6\u626B\u63CF\u4E00\u6B21\uFF08\u5C0F\u65F6\uFF09" })
            ] }),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "pr-inp",
                type: "number",
                min: 1,
                max: 24,
                value: settings.scanIntervalHours,
                onChange: (e) => setSettings({ ...settings, scanIntervalHours: Number(e.target.value) || 8 })
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "pr-topic", children: /* @__PURE__ */ jsx("button", { className: "pr-btn", style: { marginLeft: "auto" }, onClick: () => saveSettings(settings).then(() => showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58")), children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
        ] })
      ] })
    ] }) }),
    toast && /* @__PURE__ */ jsx("div", { className: `pr-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}
function PaperCard({ paper, rank }) {
  const authors = (paper.authors || []).slice(0, 5).join(", ") + ((paper.authors || []).length > 5 ? ` \u7B49${paper.authors.length}\u4EBA` : "");
  const cats = (paper.categories || []).slice(0, 3).join(" ");
  const date = paper.published ? fmtDate(paper.published) : "";
  return /* @__PURE__ */ jsxs("div", { className: "pr-paper", children: [
    /* @__PURE__ */ jsxs("span", { className: "pr-score", children: [
      "#",
      rank,
      " rel ",
      paper.score || 0
    ] }),
    /* @__PURE__ */ jsx("h4", { children: /* @__PURE__ */ jsx("a", { href: paper.url, target: "_blank", rel: "noreferrer", children: paper.title }) }),
    /* @__PURE__ */ jsx("div", { className: "pr-a", children: authors || "\u672A\u77E5" }),
    /* @__PURE__ */ jsxs("div", { className: "pr-meta", children: [
      date && /* @__PURE__ */ jsxs("span", { children: [
        "\u{1F4C5} ",
        date
      ] }),
      cats && /* @__PURE__ */ jsxs("span", { children: [
        "\u{1F3F7} ",
        cats
      ] }),
      paper.topMatches?.length ? /* @__PURE__ */ jsxs("span", { children: [
        "\u{1F3AF} ",
        paper.topMatches.slice(0, 3).map((m) => m.word).join(" \xB7 ")
      ] }) : null
    ] }),
    paper.verdict && /* @__PURE__ */ jsxs("div", { className: "pr-verdict", children: [
      "\u{1F4A1} ",
      paper.verdict
    ] })
  ] });
}
function AddTopicForm({ onAdded }) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    const kws = keywords.split(/[,，]/).map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!name.trim() || !kws.length) {
      setErr("\u8BF7\u586B\u5199\u4E3B\u9898\u540D\u548C\u81F3\u5C11\u4E00\u4E2A\u5173\u952E\u8BCD");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await addTopic(name.trim(), kws);
      setName("");
      setKeywords("");
      onAdded();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "pr-card pr-card-b", children: [
    /* @__PURE__ */ jsx("label", { className: "pr-lbl", children: "\u6DFB\u52A0\u4E3B\u9898" }),
    /* @__PURE__ */ jsx("input", { className: "pr-inp", placeholder: "\u540D\u79F0\uFF0C\u5982 \u591A\u6A21\u6001\u6A21\u578B", value: name, onChange: (e) => setName(e.target.value) }),
    /* @__PURE__ */ jsx("label", { className: "pr-lbl", children: "\u5173\u952E\u8BCD\uFF08\u9017\u53F7\u5206\u9694\uFF09" }),
    /* @__PURE__ */ jsx("input", { className: "pr-inp", placeholder: "multimodal, vision language model", value: keywords, onChange: (e) => setKeywords(e.target.value) }),
    err && /* @__PURE__ */ jsx("div", { className: "pr-err", children: err }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 8, textAlign: "right" }, children: /* @__PURE__ */ jsx("button", { className: "pr-btn", disabled: busy, onClick: submit, children: busy ? "\u6DFB\u52A0\u4E2D\u2026" : "\uFF0B \u6DFB\u52A0" }) })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function PaperRadarEntry(props) {
  return /* @__PURE__ */ jsx2(PaperRadarPanel, { ...props });
}
export {
  PaperRadarEntry as default
};
