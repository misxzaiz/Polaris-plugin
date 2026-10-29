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
  CATEGORIES: () => CATEGORIES,
  CAT_IDS: () => CAT_IDS,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  K: () => K,
  SERVICE_ID: () => SERVICE_ID,
  aggregateDays: () => aggregateDays,
  classifyApp: () => classifyApp,
  dateKeyOf: () => dateKeyOf,
  displayName: () => displayName,
  fmtDur: () => fmtDur,
  heartbeatOf: () => heartbeatOf,
  hourDominant: () => hourDominant,
  hydrateDay: () => hydrateDay,
  isKnownApp: () => isKnownApp,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet,
  listServiceStatus: () => listServiceStatus,
  loadCats: () => loadCats,
  loadDays: () => loadDays,
  loadPanelData: () => loadPanelData,
  nonce: () => nonce,
  runCmd: () => runCmd,
  saveCats: () => saveCats,
  saveSettings: () => saveSettings,
  serviceAction: () => serviceAction
});
function classifyApp(appKey, rules) {
  const key = String(appKey || "").toLowerCase();
  if (!key) return "other";
  for (const r of rules) if (r.kind === "exact" && r.match === key) return r.cat;
  const hit = BUILTIN_EXACT[key];
  if (hit) return hit;
  let best = null;
  for (const r of rules) {
    if (r.kind !== "prefix" || !key.startsWith(r.match)) continue;
    if (!best || r.match.length > best.match.length) best = r;
  }
  return best ? best.cat : "other";
}
function isKnownApp(appKey, rules) {
  const key = String(appKey || "").toLowerCase();
  for (const r of rules) {
    if (r.kind === "exact" && r.match === key) return true;
    if (r.kind === "prefix" && key.startsWith(r.match)) return true;
  }
  return BUILTIN_EXACT[key] !== void 0;
}
function displayName(appKey) {
  const k = String(appKey || "");
  if (DISPLAY_NAMES[k]) return DISPLAY_NAMES[k];
  if (!k) return k;
  return k.charAt(0).toUpperCase() + k.slice(1);
}
function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}\u79D2`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}\u5206${s % 60 ? `${s % 60}\u79D2` : ""}`;
  const h = Math.floor(m / 60);
  return `${h}\u5C0F\u65F6${m % 60 ? `${m % 60}\u5206` : ""}`;
}
function dateKeyOf(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
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
function hydrateDay(raw, dateKey) {
  const r = raw && typeof raw === "object" ? raw : null;
  return {
    v1: 1,
    date: r && typeof r.date === "string" ? r.date : dateKey,
    apps: r && r.apps && typeof r.apps === "object" ? r.apps : {},
    idleSec: Number(r && r.idleSec) || 0,
    hours: r && r.hours && typeof r.hours === "object" ? r.hours : {},
    titles: r && r.titles && typeof r.titles === "object" ? r.titles : {},
    switches: Number(r && r.switches) || 0,
    firstAt: Number(r && r.firstAt) || 0,
    lastAt: Number(r && r.lastAt) || 0
  };
}
async function loadPanelData() {
  const todayKey = dateKeyOf(Date.now());
  const [rawSnap, rawMeta, rawSettings, rawCats, rawToday] = await Promise.all([
    kvGet(K.snapshot),
    kvGet(K.meta),
    kvGet(K.settings),
    kvGet(K.cats),
    kvGet(K.day(todayKey))
  ]);
  return {
    snap: rawSnap && typeof rawSnap === "object" ? rawSnap : null,
    meta: rawMeta && typeof rawMeta === "object" ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...rawSettings && typeof rawSettings === "object" ? rawSettings : {} },
    cats: rawCats && Array.isArray(rawCats.rules) ? rawCats : { v1: 1, rules: [] },
    today: rawToday && typeof rawToday === "object" ? hydrateDay(rawToday, todayKey) : null
  };
}
async function loadCats() {
  const raw = await kvGet(K.cats).catch(() => null);
  return raw && Array.isArray(raw.rules) ? raw.rules : [];
}
async function saveCats(rules) {
  await kvSet(K.cats, { v1: 1, rules });
}
async function loadDays(n) {
  const dates = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) dates.push(dateKeyOf(now - i * 864e5));
  const uniq = [...new Set(dates)];
  const CHUNK = 24;
  const out = [];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    const vals = await Promise.all(part.map((k) => kvGet(K.day(k)).catch(() => null)));
    part.forEach((k, j) => {
      const v = vals[j];
      if (v && typeof v === "object" && v.apps && typeof v.apps === "object") out.push(hydrateDay(v, k));
    });
  }
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}
function aggregateDays(days, rules, filter) {
  const byCat = {};
  const byApp = {};
  const byDay = {};
  let totalSec = 0;
  let idleSec = 0;
  let switches = 0;
  for (const day of days) {
    idleSec += Number(day.idleSec) || 0;
    switches += Number(day.switches) || 0;
    let dayTotal = 0;
    const dayByCat = {};
    for (const [app, sec0] of Object.entries(day.apps || {})) {
      const sec = Number(sec0) || 0;
      if (sec <= 0) continue;
      const cat = classifyApp(app, rules);
      if (filter?.cat && cat !== filter.cat) continue;
      if (filter?.app && app !== filter.app.toLowerCase()) continue;
      totalSec += sec;
      dayTotal += sec;
      byApp[app] = (byApp[app] || 0) + sec;
      byCat[cat] = (byCat[cat] || 0) + sec;
      dayByCat[cat] = (dayByCat[cat] || 0) + sec;
    }
    if (day.date) byDay[day.date] = { totalSec: dayTotal, byCat: dayByCat };
  }
  return { totalSec, idleSec, switches, byCat, byApp, byDay };
}
function hourDominant(day, hour, rules) {
  const bucket = day.hours?.[String(hour)];
  if (!bucket) return null;
  let bestSec = 0;
  let bestCat = "other";
  for (const [app, sec0] of Object.entries(bucket)) {
    if (app === "_idle") continue;
    const sec = Number(sec0) || 0;
    if (sec <= 0) continue;
    const cat = classifyApp(app, rules);
    if (sec > bestSec) {
      bestSec = sec;
      bestCat = cat;
    }
  }
  return bestSec > 0 ? { sec: bestSec, cat: bestCat } : null;
}
function nonce(prefix) {
  const c = globalThis.crypto;
  const id = c && typeof c.randomUUID === "function" ? c.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix + id;
}
async function waitResult(n, timeoutMs, stepMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, stepMs));
    const r = await kvGet(K.result(n)).catch(() => null);
    if (r) {
      kvDel(K.result(n)).catch(() => {
      });
      return r;
    }
  }
  return null;
}
async function runCmd(payload, timeoutMs = 45 * 1e3) {
  const n = nonce("c");
  await kvSet(K.cmd(n), { ...payload, at: Date.now() });
  const r = await waitResult(n, timeoutMs);
  if (!r) return { ok: false, error: "\u7B49\u5F85\u7ED3\u679C\u8D85\u65F6\uFF1A\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E Tab \u53EF\u67E5\u770B/\u542F\u52A8\u670D\u52A1\uFF09" };
  if (r.ok) return { ok: true, payload: r.payload ?? {} };
  return { ok: false, error: String(r.error || "\u64CD\u4F5C\u5931\u8D25") };
}
async function saveSettings(patch, current) {
  const next = { ...current, ...patch };
  await kvSet(K.settings, next);
  return next;
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
async function discoverSelf(pluginId) {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId);
  if (!self || !self.installPath) return null;
  const services = self.contributes?.services ?? [];
  return { installPath: self.installPath, services };
}
function toBackendContribution(c) {
  return {
    id: c.id,
    type: c.type ?? c.serviceType,
    command: c.command,
    argsTemplate: Array.isArray(c.argsTemplate) ? c.argsTemplate : [],
    port: c.port ?? null,
    healthCheck: c.healthCheck ?? null,
    healthCheckTimeout: c.healthCheckTimeout ?? null,
    autoStart: c.autoStart ?? true,
    restartOnFailure: c.restartOnFailure ?? true,
    maxRestarts: c.maxRestarts ?? 3,
    description: c.description ?? null
  };
}
async function serviceAction(action, pluginId, serviceId) {
  if (action === "start") {
    const self = await discoverSelf(pluginId);
    const svc = self?.services.find((s) => s.id === serviceId);
    if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u4E2D\u627E\u4E0D\u5230\u672C\u63D2\u4EF6\u7684\u670D\u52A1\u8D21\u732E\uFF08\u8BF7\u5237\u65B0\u63D2\u4EF6\u5217\u8868\u540E\u91CD\u8BD5\uFF09");
    await capDispatch("cap.pluginServiceManager", {
      action: "start",
      pluginId,
      installPath: self.installPath,
      contribution: toBackendContribution(svc)
    });
    return;
  }
  await capDispatch("cap.pluginServiceManager", { action, pluginId, serviceId });
}
function heartbeatOf(snap, meta) {
  if (snap && snap.paused) return { state: "stale", text: "\u5DF2\u6682\u505C\uFF08\u9690\u79C1\u6A21\u5F0F\uFF09" };
  const age = snap && typeof snap.at === "number" ? Math.round((Date.now() - snap.at) / 1e3) : Infinity;
  if (!snap || age === Infinity) {
    if (meta?.lastTickAt && Date.now() - meta.lastTickAt < 150 * 1e3) {
      return { state: "stale", text: "\u670D\u52A1\u542F\u52A8\u4E2D\uFF0C\u5FEB\u7167\u672A\u5C31\u7EEA" };
    }
    return { state: "down", text: "\u670D\u52A1\u672A\u8FD0\u884C" };
  }
  if (age <= 90) {
    const c = snap.current && snap.current.app ? `\xB7 \u6B63\u5728\u7528 ${displayName(snap.current.app)}` : "";
    return { state: "ok", text: `\u91C7\u96C6\u4E2D\uFF08${snap.tickSec}s\uFF09${c}` };
  }
  return { state: "stale", text: `\u5FEB\u7167\u505C\u6EDE ${age >= 90 ? `${Math.round(age / 60)} \u5206\u949F` : `${age} \u79D2`}` };
}
var DEFAULT_SETTINGS, CATEGORIES, CAT_IDS, BUILTIN_EXACT, DISPLAY_NAMES, K, SERVICE_ID;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    DEFAULT_SETTINGS = {
      tickSec: 3,
      idleSec: 180,
      retentionDays: 90,
      captureTitles: false,
      paused: false
    };
    CATEGORIES = {
      dev: { label: "\u5F00\u53D1", color: "#58A6FF", emoji: "\u2328\uFE0F" },
      create: { label: "\u521B\u4F5C", color: "#BC8CFF", emoji: "\u{1F3A8}" },
      meet: { label: "\u6C9F\u901A", color: "#3FB950", emoji: "\u{1F4AC}" },
      browse: { label: "\u6D4F\u89C8", color: "#D29922", emoji: "\u{1F310}" },
      media: { label: "\u5F71\u97F3", color: "#F778BA", emoji: "\u{1F3AC}" },
      play: { label: "\u5A31\u4E50", color: "#F85149", emoji: "\u{1F3AE}" },
      other: { label: "\u5176\u4ED6", color: "#8B95A7", emoji: "\u{1F4E6}" }
    };
    CAT_IDS = Object.keys(CATEGORIES);
    BUILTIN_EXACT = {
      code: "dev",
      devenv: "dev",
      idea64: "dev",
      windowsterminal: "dev",
      wt: "dev",
      cmd: "dev",
      conhost: "dev",
      powershell: "dev",
      pwsh: "dev",
      hyper: "dev",
      alacritty: "dev",
      cursor: "dev",
      windsurf: "dev",
      fleet: "dev",
      postman: "dev",
      chrome: "browse",
      msedge: "browse",
      firefox: "browse",
      brave: "browse",
      opera: "browse",
      vivaldi: "browse",
      arc: "browse",
      qqbrowser: "browse",
      wechat: "meet",
      weixin: "meet",
      qq: "meet",
      tim: "meet",
      dingtalk: "meet",
      feishu: "meet",
      lark: "meet",
      telegram: "meet",
      teams: "meet",
      slack: "meet",
      discord: "meet",
      zoom: "meet",
      wemeetapp: "meet",
      outlook: "meet",
      foxmail: "meet",
      photoshop: "create",
      illustrator: "create",
      premierepro: "create",
      afterfx: "create",
      blender: "create",
      figma: "create",
      winword: "create",
      excel: "create",
      powerpnt: "create",
      onenote: "create",
      notepad: "create",
      "notepad++": "create",
      obs64: "create",
      typora: "create",
      obsidian: "create",
      wps: "create",
      cloudmusic: "media",
      qqmusic: "media",
      spotify: "media",
      potplayer: "media",
      vlc: "media",
      mpv: "media",
      bilibili: "media",
      wmplayer: "media",
      steam: "play",
      steamwebhelper: "play",
      epicgameslauncher: "play",
      javaw: "play",
      wegame: "play",
      minecraft: "play",
      leagueclient: "play",
      yuanshen: "play",
      explorer: "other",
      taskmgr: "other",
      searchhost: "other",
      systemsettings: "other",
      applicationframehost: "other",
      startmenuexperiencehost: "other"
    };
    DISPLAY_NAMES = {
      code: "VS Code",
      devenv: "Visual Studio",
      windowsterminal: "\u7EC8\u7AEF",
      wt: "\u7EC8\u7AEF",
      cmd: "\u547D\u4EE4\u884C",
      powershell: "PowerShell",
      pwsh: "PowerShell",
      conhost: "\u63A7\u5236\u53F0",
      msedge: "Edge",
      chrome: "Chrome",
      firefox: "Firefox",
      brave: "Brave",
      wechat: "\u5FAE\u4FE1",
      weixin: "\u5FAE\u4FE1",
      qq: "QQ",
      tim: "TIM",
      dingtalk: "\u9489\u9489",
      feishu: "\u98DE\u4E66",
      lark: "\u98DE\u4E66",
      telegram: "Telegram",
      teams: "Teams",
      slack: "Slack",
      discord: "Discord",
      zoom: "\u817E\u8BAF\u4F1A\u8BAE",
      wemeetapp: "\u817E\u8BAF\u4F1A\u8BAE",
      outlook: "Outlook",
      foxmail: "Foxmail",
      cloudmusic: "\u7F51\u6613\u4E91\u97F3\u4E50",
      qqmusic: "QQ\u97F3\u4E50",
      spotify: "Spotify",
      potplayer: "PotPlayer",
      vlc: "VLC",
      mpv: "mpv",
      bilibili: "\u54D4\u54E9\u54D4\u54E9",
      winword: "Word",
      excel: "Excel",
      powerpnt: "PowerPoint",
      onenote: "OneNote",
      wps: "WPS \u6587\u5B57",
      et: "WPS \u8868\u683C",
      wpp: "WPS \u6F14\u793A",
      notepad: "\u8BB0\u4E8B\u672C",
      "notepad++": "Notepad++",
      typora: "Typora",
      obsidian: "Obsidian",
      photoshop: "Photoshop",
      illustrator: "Illustrator",
      premierepro: "Premiere",
      afterfx: "After Effects",
      blender: "Blender",
      figma: "Figma",
      steam: "Steam",
      epicgameslauncher: "Epic",
      wegame: "WeGame",
      javaw: "Minecraft",
      explorer: "\u6587\u4EF6\u8D44\u6E90\u7BA1\u7406\u5668",
      taskmgr: "\u4EFB\u52A1\u7BA1\u7406\u5668",
      systemsettings: "\u7CFB\u7EDF\u8BBE\u7F6E",
      searchhost: "\u641C\u7D22",
      snipaste: "Snipaste",
      sharex: "ShareX",
      obs64: "OBS",
      idea64: "IntelliJ IDEA",
      pycharm64: "PyCharm",
      applicationframehost: "UWP \u5E94\u7528"
    };
    K = {
      snapshot: "timetrail.snapshot",
      meta: "timetrail.meta",
      settings: "timetrail.settings",
      cats: "timetrail.cats",
      day: (dateKey) => `timetrail.day.${dateKey}`,
      dayPrefix: "timetrail.day.",
      cmd: (nonce2) => `timetrail.cmd.${nonce2}`,
      cmdPrefix: "timetrail.cmd.",
      result: (nonce2) => `timetrail.result.${nonce2}`,
      resultPrefix: "timetrail.result."
    };
    SERVICE_ID = "trail-service";
  }
});

// src/Panel.tsx
init_model();
import { useCallback as useCallback3, useEffect as useEffect4, useState as useState4 } from "react";

// src/TodayTab.tsx
init_model();
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function TodayTab({ data, reload, showToast }) {
  const rules = data?.cats.rules ?? [];
  const agg = useMemo(
    () => data?.today ? aggregateDays([data.today], rules) : null,
    [data?.today, rules]
  );
  const topApps = useMemo(() => {
    if (!agg) return [];
    return Object.entries(agg.byApp).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [agg]);
  const catBars = useMemo(() => {
    if (!agg) return [];
    return Object.entries(agg.byCat).map(([cat, sec]) => ({ cat, sec, ...CATEGORIES[cat] || CATEGORIES.other })).sort((a, b) => b.sec - a.sec);
  }, [agg]);
  if (!data) return /* @__PURE__ */ jsx("div", { className: "tt-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const { snap, today } = data;
  if (!snap) {
    return /* @__PURE__ */ jsxs("div", { className: "tt-empty", children: [
      "\u65F6\u95F4\u7EDF\u8BA1\u670D\u52A1\u672A\u8FD0\u884C\u3002",
      /* @__PURE__ */ jsx("br", {}),
      /* @__PURE__ */ jsx("span", { className: "tt-sub", children: "\u5230\u300C\u8BBE\u7F6E\u300DTab \u542F\u52A8 trail-service \u540E\uFF0C\u672C\u9875\u5F00\u59CB\u663E\u793A\u4ECA\u65E5\u65F6\u95F4\u6D41\u5411\u3002" })
    ] });
  }
  const now = Date.now();
  const c = snap.current;
  const sinceMin = c ? Math.max(0, Math.round((now - (c.since || now)) / 6e4)) : 0;
  const maxCatSec = catBars.length ? catBars[0].sec : 1;
  const maxAppSec = topApps.length ? topApps[0][1] : 1;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    snap.paused && /* @__PURE__ */ jsx("div", { className: "tt-banner warn", children: "\u23F8 \u6682\u505C\u91C7\u96C6\u4E2D\uFF08\u9690\u79C1\u6A21\u5F0F\uFF09\u2014\u2014\u671F\u95F4\u4EC0\u4E48\u90FD\u4E0D\u8BB0\u5F55\uFF0C\u8BBE\u7F6E Tab \u53EF\u6062\u590D" }),
    !snap.paused && snap.collector === "dead" && /* @__PURE__ */ jsxs("div", { className: "tt-banner bad", children: [
      /* @__PURE__ */ jsxs("span", { style: { flex: 1, minWidth: 0 }, children: [
        "\u91C7\u96C6\u5668\u79BB\u7EBF",
        snap.collectorErr ? `\uFF1A${snap.collectorErr}` : ""
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "tt-btn sm",
          onClick: async () => {
            const { runCmd: runCmd2 } = await Promise.resolve().then(() => (init_model(), model_exports));
            const r = await runCmd2({ action: "collector_restart" });
            showToast(r.ok ? "\u5DF2\u4E0B\u53D1\u91C7\u96C6\u5668\u91CD\u542F" : r.error || "\u91CD\u542F\u5931\u8D25", !r.ok);
            await reload();
          },
          children: "\u91CD\u542F"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "tt-now", children: [
        /* @__PURE__ */ jsx("div", { className: "tt-now-ico", children: snap.paused ? "\u23F8" : c && c.app && !c.idle ? "\u25B6" : "\u{1F319}" }),
        /* @__PURE__ */ jsxs("div", { className: "tt-now-main", children: [
          /* @__PURE__ */ jsx("b", { children: snap.paused ? "\u5DF2\u6682\u505C\uFF08\u9690\u79C1\u6A21\u5F0F\uFF09" : c && c.app ? displayName(c.app) : "\u65E0\u524D\u53F0\u5E94\u7528" }),
          /* @__PURE__ */ jsx("small", { children: !snap.paused && c && c.app ? c.idle ? `\u5DF2\u7A7A\u95F2 ${fmtDur(Math.round((c.idleMs || 0) / 1e3))}` : `\u5DF2 ${sinceMin < 1 ? "\u4E0D\u5230 1 \u5206\u949F" : `${sinceMin} \u5206\u949F`}${c.title ? ` \u2014 ${c.title}` : ""}` : !snap.paused ? "\u9501\u5B9A\u5C4F\u6216\u684C\u9762\u7A7A\u95F2\u4E2D\uFF0C\u65F6\u95F4\u8BB0\u5165\u7A7A\u95F2\u6876" : "\u6062\u590D\u91C7\u96C6\u540E\u7EE7\u7EED\u8BB0\u8D26" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tt-chips", children: [
        /* @__PURE__ */ jsxs("div", { className: "tt-chip", children: [
          /* @__PURE__ */ jsx("small", { children: "\u4ECA\u65E5\u6D3B\u8DC3" }),
          /* @__PURE__ */ jsx("b", { children: agg ? fmtDur(agg.totalSec) : "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "tt-chip", children: [
          /* @__PURE__ */ jsx("small", { children: "\u7A7A\u95F2" }),
          /* @__PURE__ */ jsx("b", { children: today ? fmtDur(today.idleSec) : "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "tt-chip", children: [
          /* @__PURE__ */ jsx("small", { children: "\u5E94\u7528\u5207\u6362" }),
          /* @__PURE__ */ jsx("b", { children: today ? today.switches : "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "tt-chip", children: [
          /* @__PURE__ */ jsx("small", { children: "\u5E94\u7528\u6570" }),
          /* @__PURE__ */ jsx("b", { children: today ? Object.keys(today.apps).length : "\u2014" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "tt-card-h", children: [
        "\u5206\u7C7B ",
        /* @__PURE__ */ jsx("small", { children: "\u89C4\u5219\u6539\u52A8\u5BF9\u5168\u90E8\u5386\u53F2\u751F\u6548" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "tt-card-b", children: catBars.length ? catBars.map((b) => /* @__PURE__ */ jsxs("div", { className: "tt-bar-row", children: [
        /* @__PURE__ */ jsx("div", { className: "nm", children: /* @__PURE__ */ jsxs("span", { children: [
          b.emoji,
          " ",
          b.label
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "tt-bar-track", children: /* @__PURE__ */ jsx("div", { className: "tt-bar-fill", style: { width: `${Math.max(3, b.sec / maxCatSec * 100)}%`, background: b.color } }) }),
        /* @__PURE__ */ jsx("div", { className: "tt-bar-val", children: fmtDur(b.sec) })
      ] }, b.cat)) : /* @__PURE__ */ jsx("div", { className: "tt-empty", children: "\u4ECA\u5929\u8FD8\u6CA1\u6709\u8BB0\u5F55" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsx("div", { className: "tt-card-h", children: "Top \u5E94\u7528" }),
      /* @__PURE__ */ jsx("div", { className: "tt-card-b", children: topApps.length ? topApps.map(([app, sec], i) => {
        const cat = classifyApp(app, rules);
        const meta = CATEGORIES[cat] || CATEGORIES.other;
        return /* @__PURE__ */ jsxs("div", { className: "tt-app-row", children: [
          /* @__PURE__ */ jsx("span", { className: "idx", children: i + 1 }),
          /* @__PURE__ */ jsxs("span", { className: "nm", children: [
            displayName(app),
            /* @__PURE__ */ jsxs("span", { style: { color: "#5C6678", fontSize: 10 }, children: [
              "\uFF08",
              app,
              "\uFF09"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "cat", style: { background: `${meta.color}22`, color: meta.color }, children: [
            meta.emoji,
            " ",
            meta.label
          ] }),
          /* @__PURE__ */ jsx("span", { className: "dur", children: fmtDur(sec) })
        ] }, app);
      }) : /* @__PURE__ */ jsx("div", { className: "tt-empty", children: "\u6682\u65E0\u5E94\u7528\u8BB0\u5F55" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "tt-card-h", children: [
        "24 \u5C0F\u65F6\u5E26 ",
        /* @__PURE__ */ jsx("small", { children: "\u989C\u8272=\u8BE5\u65F6\u6BB5\u4E3B\u5206\u7C7B\uFF0C\u4EAE\u5EA6=\u65F6\u957F" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "tt-card-b", children: today ? /* @__PURE__ */ jsx(HourStrip, { day: today, rules }) : /* @__PURE__ */ jsx("div", { className: "tt-empty", children: "\u6682\u65E0\u6570\u636E" }) })
    ] })
  ] });
}
function HourStrip({ day, rules }) {
  const cells = [];
  const nowHour = (/* @__PURE__ */ new Date()).getHours();
  let maxSec = 1;
  const dominants = [];
  for (let h = 0; h < 24; h++) {
    const d = hourDominant(day, h, rules);
    dominants.push(d);
    if (d && d.sec > maxSec) maxSec = d.sec;
  }
  for (let h = 0; h < 24; h++) {
    const d = dominants[h];
    const meta = d ? CATEGORIES[d.cat] || CATEGORIES.other : null;
    const alpha = d ? Math.max(0.25, Math.min(1, 0.25 + d.sec / maxSec * 0.75)) : 0;
    const future = h > nowHour;
    cells.push(
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "tt-cell",
          title: d ? `${String(h).padStart(2, "0")}:00 ${meta.label} ${fmtDur(d.sec)}` : `${String(h).padStart(2, "0")}:00 \u65E0\u8BB0\u5F55`,
          style: {
            background: d && !future ? hexAlpha(meta.color, alpha) : "#12151c",
            outline: h === nowHour ? "1px solid #58A6FF88" : void 0
          }
        },
        h
      )
    );
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "tt-strip", children: cells }),
    /* @__PURE__ */ jsxs("div", { className: "tt-cell-l", children: [
      /* @__PURE__ */ jsx("span", { children: "00" }),
      /* @__PURE__ */ jsx("span", { children: "06" }),
      /* @__PURE__ */ jsx("span", { children: "12" }),
      /* @__PURE__ */ jsx("span", { children: "18" }),
      /* @__PURE__ */ jsx("span", { children: "23" })
    ] })
  ] });
}
function hexAlpha(hex, alpha) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

// src/HistoryTab.tsx
init_model();
import { useEffect, useMemo as useMemo2, useState } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function HistoryTab({ data }) {
  const [range, setRange] = useState(7);
  const [days, setDays] = useState(null);
  const [err, setErr] = useState("");
  const [openDay, setOpenDay] = useState(null);
  useEffect(() => {
    let alive = true;
    setDays(null);
    setErr("");
    loadDays(range).then((d) => {
      if (alive) setDays(d);
    }).catch((e) => {
      if (alive) setErr(e.message);
    });
    return () => {
      alive = false;
    };
  }, [range]);
  const rules = data?.cats.rules ?? [];
  const agg = useMemo2(() => days ? aggregateDays(days, rules) : null, [days, rules]);
  const sortedDays = useMemo2(() => days ? [...days].reverse() : [], [days]);
  const openDayRec = openDay ? days?.find((d) => d.date === openDay) : null;
  const openAgg = useMemo2(() => openDayRec ? aggregateDays([openDayRec], rules) : null, [openDayRec, rules]);
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "tt-card-h", children: [
        "\u533A\u95F4\u6C47\u603B",
        /* @__PURE__ */ jsx2("span", { className: "tt-seg", children: [7, 14, 30].map((r) => /* @__PURE__ */ jsxs2("button", { className: range === r ? "on" : "", onClick: () => setRange(r), children: [
          r,
          "\u5929"
        ] }, r)) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "tt-card-b", children: [
        err && /* @__PURE__ */ jsx2("div", { className: "tt-err", children: err }),
        !err && !days && /* @__PURE__ */ jsx2("div", { className: "tt-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
        agg && /* @__PURE__ */ jsxs2("div", { className: "tt-chips", style: { padding: "4px 0 6px" }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "tt-chip", children: [
            /* @__PURE__ */ jsx2("small", { children: "\u5408\u8BA1\u6D3B\u8DC3" }),
            /* @__PURE__ */ jsx2("b", { children: fmtDur(agg.totalSec) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "tt-chip", children: [
            /* @__PURE__ */ jsx2("small", { children: "\u65E5\u5747" }),
            /* @__PURE__ */ jsx2("b", { children: fmtDur(Math.round(agg.totalSec / range)) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "tt-chip", children: [
            /* @__PURE__ */ jsx2("small", { children: "\u7A7A\u95F2" }),
            /* @__PURE__ */ jsx2("b", { children: fmtDur(agg.idleSec) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "tt-chip", children: [
            /* @__PURE__ */ jsx2("small", { children: "\u6709\u8BB0\u5F55\u5929\u6570" }),
            /* @__PURE__ */ jsx2("b", { children: days.length })
          ] })
        ] })
      ] })
    ] }),
    agg && /* @__PURE__ */ jsxs2("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "tt-card-h", children: [
        "\u5206\u7C7B\u6784\u6210 ",
        /* @__PURE__ */ jsx2("small", { children: "\u6BCF\u5929\u4E00\u6839\u5806\u53E0\u6761" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "tt-card-b", children: /* @__PURE__ */ jsxs2("div", { className: "tt-daybar", children: [
        sortedDays.map((d) => {
          const dayAgg = agg.byDay[d.date];
          const total = dayAgg?.totalSec || 0;
          const cats = Object.entries(dayAgg?.byCat || {}).sort((a, b) => b[1] - a[1]);
          return /* @__PURE__ */ jsxs2("div", { className: "tt-dayrow", title: `${d.date} ${fmtDur(total)}`, children: [
            /* @__PURE__ */ jsx2("span", { className: "d", children: d.date.slice(5) }),
            /* @__PURE__ */ jsx2("div", { className: "stack", children: cats.map(([cat, sec]) => {
              const meta = CATEGORIES[cat] || CATEGORIES.other;
              return /* @__PURE__ */ jsx2(
                "div",
                {
                  style: { flex: sec, background: meta.color, height: "100%", minWidth: 2 },
                  title: `${meta.label} ${fmtDur(sec)}`
                },
                cat
              );
            }) }),
            /* @__PURE__ */ jsx2("span", { className: "sum", children: total > 0 ? fmtDur(total) : "\u2014" })
          ] }, d.date);
        }),
        !sortedDays.length && /* @__PURE__ */ jsx2("div", { className: "tt-empty", children: "\u533A\u95F4\u5185\u6682\u65E0\u8BB0\u5F55" })
      ] }) })
    ] }),
    agg && /* @__PURE__ */ jsxs2("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "tt-card-h", children: [
        "\u65E5\u660E\u7EC6 ",
        /* @__PURE__ */ jsx2("small", { children: "\u70B9\u884C\u770B\u5355\u65E5 Top" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "tt-card-b", children: [
        /* @__PURE__ */ jsx2("div", { className: "tt-daylist", children: sortedDays.map((d) => {
          const dayAgg = agg.byDay[d.date];
          const top = Object.entries(dayAgg?.byCat || {}).sort((a, b) => b[1] - a[1])[0];
          const meta = top ? CATEGORIES[top[0]] || CATEGORIES.other : null;
          return /* @__PURE__ */ jsxs2("div", { className: "tt-dayitem", onClick: () => setOpenDay(openDay === d.date ? null : d.date), children: [
            /* @__PURE__ */ jsx2("span", { className: "d", children: d.date }),
            /* @__PURE__ */ jsx2("span", { className: "info", children: (dayAgg?.totalSec || 0) > 0 ? `\u5207\u6362 ${d.switches} \u6B21 \xB7 \u7A7A\u95F2 ${fmtDur(d.idleSec)}${meta ? ` \xB7 \u4E3B ${meta.emoji}${meta.label}` : ""}` : "\u65E0\u8BB0\u5F55" }),
            /* @__PURE__ */ jsx2("span", { className: "dur", children: (dayAgg?.totalSec || 0) > 0 ? fmtDur(dayAgg.totalSec) : "\u2014" })
          ] }, d.date);
        }) }),
        openDayRec && openAgg && /* @__PURE__ */ jsxs2("div", { style: { borderTop: "1px solid #1d2330", marginTop: 8, paddingTop: 6 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "tt-sub", style: { paddingBottom: 4 }, children: [
            openDayRec.date,
            " Top \u5E94\u7528\uFF1A"
          ] }),
          Object.entries(openAgg.byApp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([app, sec]) => {
            return /* @__PURE__ */ jsxs2("div", { className: "tt-app-row", children: [
              /* @__PURE__ */ jsx2("span", { className: "nm", children: displayName(app) }),
              /* @__PURE__ */ jsx2("span", { className: "dur", children: fmtDur(sec) })
            ] }, app);
          }),
          !Object.keys(openAgg.byApp).length && /* @__PURE__ */ jsx2("div", { className: "tt-empty", children: "\u8BE5\u65E5\u65E0\u5E94\u7528\u8BB0\u5F55" })
        ] })
      ] })
    ] })
  ] });
}

// src/CatsTab.tsx
init_model();
import { useCallback, useEffect as useEffect2, useMemo as useMemo3, useState as useState2 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function CatsTab({ pluginId, data, reload, showToast, onSendToChat }) {
  const [rules, setRules] = useState2([]);
  const [unknown, setUnknown] = useState2(null);
  const [newMatch, setNewMatch] = useState2("");
  const [newKind, setNewKind] = useState2("exact");
  const [newCat, setNewCat] = useState2("dev");
  const [busy, setBusy] = useState2(false);
  useEffect2(() => {
    loadCats().then(setRules).catch(() => {
    });
  }, []);
  const refreshUnknown = useCallback(async () => {
    try {
      const [days, currentRules] = await Promise.all([loadDays(7), loadCats()]);
      const agg = aggregateDays(days, currentRules);
      const list = Object.entries(agg.byApp).filter(([app]) => !isKnownApp(app, currentRules)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([app, sec]) => ({ app, sec }));
      setUnknown(list);
    } catch (e) {
      showToast(`\u52A0\u8F7D\u672A\u5206\u7C7B\u6E05\u5355\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [showToast]);
  useEffect2(() => {
    refreshUnknown();
  }, [refreshUnknown]);
  const persist = useCallback(async (next) => {
    setBusy(true);
    try {
      await saveCats(next);
      setRules(next);
      await Promise.all([reload(), refreshUnknown()]);
      showToast("\u89C4\u5219\u5DF2\u4FDD\u5B58\uFF0C\u5386\u53F2\u5373\u65F6\u751F\u6548");
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }, [reload, refreshUnknown, showToast]);
  const addRule = useCallback(async () => {
    const match = newMatch.trim().toLowerCase();
    if (!match) {
      showToast("\u8BF7\u8F93\u5165\u8FDB\u7A0B\u540D\uFF08\u5982 code\uFF09", true);
      return;
    }
    if (rules.some((r) => r.kind === newKind && r.match === match)) {
      showToast("\u89C4\u5219\u5DF2\u5B58\u5728", true);
      return;
    }
    await persist([...rules, { match, kind: newKind, cat: newCat }]);
    setNewMatch("");
  }, [newMatch, newKind, newCat, rules, persist, showToast]);
  const quickAssign = useCallback(async (app, cat) => {
    await persist([...rules.filter((r) => !(r.kind === "exact" && r.match === app)), { match: app, kind: "exact", cat }]);
  }, [rules, persist]);
  const aiClassify = useCallback(() => {
    if (!unknown || !unknown.length) return;
    const list = unknown.slice(0, 20).map((u) => `${u.app}\uFF08${displayName(u.app)}\uFF0C${fmtDur(u.sec)}\uFF09`).join("\u3001");
    const msg = `\u8BF7\u7528 timetrail_apps(unknownOnly=true) \u548C timetrail_set_categories \u5E2E\u6211\u628A\u65F6\u95F4\u7EDF\u8BA1\u91CC\u8FD9\u4E9B\u672A\u5206\u7C7B\u5E94\u7528\u5F52\u7C7B\uFF08\u4E03\u7C7B\uFF1Adev/create/meet/browse/media/play/other\uFF09\uFF1A${list}\u3002\u5F52\u7C7B\u65F6\u7ED9\u51FA\u4F60\u7684\u7406\u7531\u3002`;
    if (onSendToChat) {
      onSendToChat(msg);
      showToast("\u5DF2\u53D1\u9001\u5230\u804A\u5929\uFF0C\u7B49 AI \u5F52\u7C7B");
    } else {
      showToast("\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u9001\u5230\u804A\u5929", true);
    }
  }, [unknown, onSendToChat, showToast]);
  const countsByCat = useMemo3(() => {
    const m = {};
    for (const r of rules) m[r.cat] = (m[r.cat] || 0) + 1;
    return m;
  }, [rules]);
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "tt-card-h", children: [
        "\u4E03\u7C7B ",
        /* @__PURE__ */ jsx3("small", { children: "\u5185\u7F6E\u89C4\u5219\u81EA\u52A8\u8986\u76D6\u5E38\u89C1\u5E94\u7528" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "tt-card-b", children: CAT_IDS.map((cat) => {
        const meta = CATEGORIES[cat];
        return /* @__PURE__ */ jsxs3("div", { className: "tt-catrow", children: [
          /* @__PURE__ */ jsx3("span", { className: "sw", style: { background: meta.color } }),
          /* @__PURE__ */ jsx3("span", { children: meta.emoji }),
          /* @__PURE__ */ jsxs3("span", { className: "nm", children: [
            meta.label,
            /* @__PURE__ */ jsxs3("span", { style: { color: "#5C6678", fontSize: 10 }, children: [
              "\uFF08",
              cat,
              "\uFF09"
            ] })
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "tt-sub", children: countsByCat[cat] ? `\u81EA\u5B9A\u4E49 ${countsByCat[cat]} \u6761` : "" })
        ] }, cat);
      }) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "tt-card-h", children: [
        "\u672A\u5206\u7C7B\u5E94\u7528 ",
        /* @__PURE__ */ jsx3("small", { children: "\u6700\u8FD1 7 \u5929" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "tt-card-b", children: [
        unknown === null && /* @__PURE__ */ jsx3("div", { className: "tt-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
        unknown && unknown.length === 0 && /* @__PURE__ */ jsx3("div", { className: "tt-empty", children: "\u6700\u8FD1 7 \u5929\u6CA1\u6709\u672A\u5206\u7C7B\u5E94\u7528 \u{1F389}" }),
        unknown && unknown.length > 0 && /* @__PURE__ */ jsxs3(Fragment3, { children: [
          unknown.map((u) => /* @__PURE__ */ jsxs3("div", { className: "tt-rule", children: [
            /* @__PURE__ */ jsxs3("span", { className: "m", title: u.app, children: [
              displayName(u.app),
              /* @__PURE__ */ jsxs3("span", { style: { color: "#5C6678" }, children: [
                "\uFF08",
                u.app,
                "\uFF09"
              ] })
            ] }),
            /* @__PURE__ */ jsx3("span", { className: "k", children: fmtDur(u.sec) }),
            /* @__PURE__ */ jsxs3(
              "select",
              {
                className: "tt-sel",
                value: "",
                disabled: busy,
                onChange: (e) => {
                  if (e.target.value) quickAssign(u.app, e.target.value);
                },
                children: [
                  /* @__PURE__ */ jsx3("option", { value: "", children: "\u5F52\u5165\u2026" }),
                  CAT_IDS.map((cat) => /* @__PURE__ */ jsxs3("option", { value: cat, children: [
                    CATEGORIES[cat].emoji,
                    " ",
                    CATEGORIES[cat].label
                  ] }, cat))
                ]
              }
            )
          ] }, u.app)),
          /* @__PURE__ */ jsxs3("div", { className: "tt-addrow", children: [
            /* @__PURE__ */ jsx3("button", { className: "tt-btn ghost", disabled: busy || !onSendToChat, onClick: aiClassify, children: "\u{1F916} \u8BA9 AI \u6279\u91CF\u5F52\u7C7B" }),
            /* @__PURE__ */ jsx3("button", { className: "tt-btn ghost", disabled: busy, onClick: () => refreshUnknown(), children: "\u5237\u65B0" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "tt-card-h", children: [
        "\u81EA\u5B9A\u4E49\u89C4\u5219 ",
        /* @__PURE__ */ jsxs3("small", { children: [
          rules.length,
          " \u6761"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "tt-card-b", children: [
        rules.length === 0 && /* @__PURE__ */ jsx3("div", { className: "tt-empty", children: "\u6682\u65E0\u81EA\u5B9A\u4E49\u89C4\u5219" }),
        rules.map((r, i) => /* @__PURE__ */ jsxs3("div", { className: "tt-rule", children: [
          /* @__PURE__ */ jsx3("span", { className: "m", children: r.match }),
          /* @__PURE__ */ jsx3("span", { className: "k", children: r.kind === "prefix" ? "\u524D\u7F00" : "\u7CBE\u786E" }),
          /* @__PURE__ */ jsx3(
            "select",
            {
              className: "tt-sel",
              value: r.cat,
              disabled: busy,
              onChange: (e) => {
                const next = [...rules];
                next[i] = { ...r, cat: e.target.value };
                persist(next);
              },
              children: CAT_IDS.map((cat) => /* @__PURE__ */ jsxs3("option", { value: cat, children: [
                CATEGORIES[cat].emoji,
                " ",
                CATEGORIES[cat].label
              ] }, cat))
            }
          ),
          /* @__PURE__ */ jsx3(
            "button",
            {
              className: "tt-btn danger sm",
              disabled: busy,
              onClick: () => persist(rules.filter((_, j) => j !== i)),
              children: "\u5220"
            }
          )
        ] }, `${r.kind}:${r.match}`)),
        /* @__PURE__ */ jsxs3("div", { className: "tt-addrow", children: [
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "tt-inp",
              placeholder: "\u8FDB\u7A0B\u540D\uFF08code / idea64*\u7528\u524D\u7F00\uFF09",
              value: newMatch,
              onChange: (e) => setNewMatch(e.target.value)
            }
          ),
          /* @__PURE__ */ jsxs3("select", { className: "tt-sel", value: newKind, onChange: (e) => setNewKind(e.target.value), children: [
            /* @__PURE__ */ jsx3("option", { value: "exact", children: "\u7CBE\u786E" }),
            /* @__PURE__ */ jsx3("option", { value: "prefix", children: "\u524D\u7F00" })
          ] }),
          /* @__PURE__ */ jsx3("select", { className: "tt-sel", value: newCat, onChange: (e) => setNewCat(e.target.value), children: CAT_IDS.map((cat) => /* @__PURE__ */ jsx3("option", { value: cat, children: CATEGORIES[cat].label }, cat)) }),
          /* @__PURE__ */ jsx3("button", { className: "tt-btn sm", disabled: busy, onClick: addRule, children: "\u6DFB\u52A0" })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "tt-sub", style: { paddingTop: 6 }, children: "\u89C4\u5219\u5339\u914D\u5C0F\u5199\u8FDB\u7A0B\u540D\uFF1B\u300C\u524D\u7F00\u300D\u5339\u914D\u4EE5\u8F93\u5165\u5F00\u5934\u7684\u4EFB\u610F\u5E94\u7528\uFF08\u5982 minecraft* \u7CFB\u5217\u542F\u52A8\u5668\uFF09\u3002\u6539\u52A8\u5BF9\u5168\u90E8\u5386\u53F2\u751F\u6548\u3002" })
      ] })
    ] })
  ] });
}

// src/SettingsTab.tsx
init_model();
import { useCallback as useCallback2, useEffect as useEffect3, useState as useState3 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ pluginId, data, reload, showToast }) {
  const settings = data?.settings;
  const [svc, setSvc] = useState3(null);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState3(false);
  const [purgeApp, setPurgeApp] = useState3("");
  const [busy, setBusy] = useState3(false);
  const refreshSvc = useCallback2(async () => {
    try {
      const list = await listServiceStatus();
      setSvc(list.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID) || null);
    } catch {
    }
  }, [pluginId]);
  useEffect3(() => {
    refreshSvc();
    const t = setInterval(refreshSvc, 8e3);
    return () => clearInterval(t);
  }, [refreshSvc]);
  const patch = useCallback2(async (p) => {
    if (!settings) return;
    setBusy(true);
    try {
      await saveSettings(p, settings);
      await reload();
      showToast("\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 60s \u5185\u5E94\u7528\uFF0C\u6682\u505C/\u6062\u590D\u7ACB\u5373\u751F\u6548\uFF09");
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }, [settings, reload, showToast]);
  const doSvc = useCallback2(async (action) => {
    setBusy(true);
    try {
      await serviceAction(action, pluginId, SERVICE_ID);
      showToast(`\u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}\u670D\u52A1`);
      setTimeout(refreshSvc, 1500);
      await reload();
    } catch (e) {
      showToast(`\u670D\u52A1${action === "start" ? "\u542F\u52A8" : "\u64CD\u4F5C"}\u5931\u8D25\uFF1A${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }, [pluginId, refreshSvc, reload, showToast]);
  const doPurgeApp = useCallback2(async () => {
    const app = purgeApp.trim().toLowerCase();
    if (!app) {
      showToast("\u8BF7\u8F93\u5165\u8FDB\u7A0B\u540D", true);
      return;
    }
    setBusy(true);
    try {
      const r = await runCmd({ action: "purge_app", app }, 90 * 1e3);
      showToast(r.ok ? `\u5DF2\u5220\u9664\u300C${app}\u300D\u7684\u5168\u90E8\u5386\u53F2\u8BB0\u5F55` : r.error || "\u5220\u9664\u5931\u8D25", !r.ok);
      if (r.ok) {
        setPurgeApp("");
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }, [purgeApp, reload, showToast]);
  const doPurgeAll = useCallback2(async () => {
    setBusy(true);
    try {
      const r = await runCmd({ action: "purge_all", confirm: true }, 90 * 1e3);
      showToast(r.ok ? "\u5DF2\u6E05\u7A7A\u5168\u90E8\u65F6\u95F4\u8D26\u672C" : r.error || "\u6E05\u7A7A\u5931\u8D25", !r.ok);
      if (r.ok) {
        setConfirmPurgeAll(false);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }, [reload, showToast]);
  const doRestartCollector = useCallback2(async () => {
    setBusy(true);
    try {
      const r = await runCmd({ action: "collector_restart" }, 30 * 1e3);
      showToast(r.ok ? "\u5DF2\u91CD\u542F\u91C7\u96C6\u5668" : r.error || "\u91CD\u542F\u5931\u8D25", !r.ok);
      await reload();
    } finally {
      setBusy(false);
    }
  }, [reload, showToast]);
  const [dayKeyCount, setDayKeyCount] = useState3(null);
  useEffect3(() => {
    kvKeys().then((keys) => setDayKeyCount(keys.filter((k) => k.startsWith("timetrail.day.")).length)).catch(() => {
    });
  }, [data?.today?.date]);
  if (!settings) return /* @__PURE__ */ jsx4("div", { className: "tt-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const meta = data?.meta;
  const snap = data?.snap;
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsx4("div", { className: "tt-card-h", children: "\u9690\u79C1" }),
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-b", style: { padding: 0 }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u6682\u505C\u91C7\u96C6\uFF08\u9690\u79C1\u6A21\u5F0F\uFF09" }),
            /* @__PURE__ */ jsx4("small", { children: "\u6682\u505C\u671F\u95F4\u4E0D\u8BB0\u5F55\u4EFB\u4F55\u7A97\u53E3\u4E0E\u7A7A\u95F2\u4FE1\u606F\uFF1B\u6062\u590D\u540E\u4ECE\u5F53\u4E0B\u7EE7\u7EED\u3002" })
          ] }),
          /* @__PURE__ */ jsx4(
            "button",
            {
              className: `tt-toggle ${settings.paused ? "on" : ""}`,
              disabled: busy,
              onClick: () => patch({ paused: !settings.paused }),
              children: /* @__PURE__ */ jsx4("i", {})
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u8BB0\u5F55\u7A97\u53E3\u6807\u9898" }),
            /* @__PURE__ */ jsx4("small", { children: "\u9ED8\u8BA4\u53EA\u8BB0\u8FDB\u7A0B\u540D\u3002\u5F00\u542F\u540E\u6807\u9898\u622A\u65AD 80 \u5B57\u7B26\u3001\u6BCF\u5E94\u7528\u6BCF\u65E5\u7559 top 40\uFF0C\u5168\u90E8\u53EA\u5B58\u672C\u673A cap.kv\u3002" })
          ] }),
          /* @__PURE__ */ jsx4(
            "button",
            {
              className: `tt-toggle ${settings.captureTitles ? "on" : ""}`,
              disabled: busy,
              onClick: () => patch({ captureTitles: !settings.captureTitles }),
              children: /* @__PURE__ */ jsx4("i", {})
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-h", children: [
        "\u91C7\u96C6\u53C2\u6570 ",
        /* @__PURE__ */ jsx4("small", { children: "\u6539\u540E\u670D\u52A1 60s \u5185\u5E94\u7528\u5E76\u91CD\u542F\u91C7\u96C6\u5668" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-b", style: { padding: 0 }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u91C7\u6837\u95F4\u9694" }),
            /* @__PURE__ */ jsx4("small", { children: "\u79D2\uFF082-15\uFF09\uFF0C\u8D8A\u5C0F\u8D8A\u51C6\u3001\u5F00\u9500\u8D8A\u5927" })
          ] }),
          /* @__PURE__ */ jsx4(
            "input",
            {
              className: "tt-num",
              type: "number",
              min: 2,
              max: 15,
              defaultValue: settings.tickSec,
              onBlur: (e) => {
                const v = Math.min(15, Math.max(2, Math.round(Number(e.target.value) || 3)));
                e.target.value = String(v);
                if (v !== settings.tickSec) patch({ tickSec: v });
              }
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u7A7A\u95F2\u5224\u5B9A" }),
            /* @__PURE__ */ jsx4("small", { children: "\u65E0\u952E\u9F20\u8F93\u5165\u591A\u5C11\u79D2\u540E\u8BB0\u4E3A\u7A7A\u95F2\uFF0830-1800\uFF09" })
          ] }),
          /* @__PURE__ */ jsx4(
            "input",
            {
              className: "tt-num",
              type: "number",
              min: 30,
              max: 1800,
              defaultValue: settings.idleSec,
              onBlur: (e) => {
                const v = Math.min(1800, Math.max(30, Math.round(Number(e.target.value) || 180)));
                e.target.value = String(v);
                if (v !== settings.idleSec) patch({ idleSec: v });
              }
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u4FDD\u7559\u5929\u6570" }),
            /* @__PURE__ */ jsx4("small", { children: "\u5929\u8D26\u672C\u6EDA\u52A8\u4FDD\u7559\uFF087-365\uFF09\uFF0C\u8FC7\u671F\u81EA\u52A8\u6E05\u626B" })
          ] }),
          /* @__PURE__ */ jsx4(
            "input",
            {
              className: "tt-num",
              type: "number",
              min: 7,
              max: 365,
              defaultValue: settings.retentionDays,
              onBlur: (e) => {
                const v = Math.min(365, Math.max(7, Math.round(Number(e.target.value) || 90)));
                e.target.value = String(v);
                if (v !== settings.retentionDays) patch({ retentionDays: v });
              }
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-h", children: [
        "\u670D\u52A1 ",
        /* @__PURE__ */ jsx4("small", { children: meta?.version ? `v${meta.version}` : "" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-b", style: { padding: 0 }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: /* @__PURE__ */ jsxs4("span", { className: "tt-state", children: [
              /* @__PURE__ */ jsx4("i", { className: `tt-dot ${svc?.state === "running" ? "ok" : svc ? "stale" : "down"}`, style: { width: 7, height: 7, borderRadius: 999, display: "inline-block", background: svc?.state === "running" ? "#3FB950" : svc ? "#D29922" : "#F85149" } }),
              "trail-service ",
              svc ? stateLabel(svc.state) : "\u672A\u6CE8\u518C"
            ] }) }),
            /* @__PURE__ */ jsxs4("small", { children: [
              meta ? `pid ${meta.pid} \xB7 \u6865 ${meta.bridge || "\u672A\u8FDE\u63A5"} \xB7 \u91C7\u96C6\u5668 ${snap?.collector || "?"}\uFF08\u91CD\u542F ${meta.collectorRestarts || 0} \u6B21\uFF09` : "\u65E0\u5FC3\u8DF3\u2014\u2014\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C",
              snap?.degraded ? ` \xB7 \u26A0 ${snap.degraded}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx4("button", { className: "tt-btn ghost sm", disabled: busy, onClick: () => doSvc(svc?.state === "running" ? "restart" : "start"), children: svc?.state === "running" ? "\u91CD\u542F" : "\u542F\u52A8" }),
          svc?.state === "running" && /* @__PURE__ */ jsx4("button", { className: "tt-btn danger sm", disabled: busy, onClick: () => doSvc("stop"), children: "\u505C\u6B62" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u91C7\u96C6\u5668" }),
            /* @__PURE__ */ jsx4("small", { children: "PowerShell \u5B50\u8FDB\u7A0B\uFF1B\u5F02\u5E38\u9000\u51FA\u4F1A\u81EA\u52A8\u9000\u907F\u91CD\u542F" })
          ] }),
          /* @__PURE__ */ jsx4("button", { className: "tt-btn ghost sm", disabled: busy, onClick: doRestartCollector, children: "\u91CD\u542F\u91C7\u96C6\u5668" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "tt-card", children: [
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-h", children: [
        "\u6570\u636E ",
        /* @__PURE__ */ jsx4("small", { children: dayKeyCount === null ? "" : `${dayKeyCount} \u4E2A\u5929\u8D26\u672C` })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "tt-card-b", style: { padding: 0 }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u5220\u9664\u67D0\u5E94\u7528\u7684\u5168\u90E8\u8BB0\u5F55" }),
            /* @__PURE__ */ jsx4("small", { children: "\u8F93\u5165\u8FDB\u7A0B\u540D\uFF08\u5982 code\uFF09\uFF0C\u4ECE\u6240\u6709\u5386\u53F2\u5929\u8D26\u672C\u79FB\u9664" })
          ] }),
          /* @__PURE__ */ jsx4(
            "input",
            {
              className: "tt-num",
              style: { width: 110 },
              placeholder: "code",
              value: purgeApp,
              onChange: (e) => setPurgeApp(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx4("button", { className: "tt-btn danger sm", disabled: busy, onClick: doPurgeApp, children: "\u5220\u9664" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "tt-field", children: [
          /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
            /* @__PURE__ */ jsx4("b", { children: "\u6E05\u7A7A\u5168\u90E8\u65F6\u95F4\u8D26\u672C" }),
            /* @__PURE__ */ jsx4("small", { children: "\u4FDD\u7559\u8BBE\u7F6E\u4E0E\u5206\u7C7B\u89C4\u5219" })
          ] }),
          /* @__PURE__ */ jsx4("button", { className: "tt-btn danger sm", disabled: busy, onClick: () => setConfirmPurgeAll(true), children: "\u6E05\u7A7A\u2026" })
        ] }),
        confirmPurgeAll && /* @__PURE__ */ jsxs4("div", { className: "tt-confirm", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u786E\u5B9A\u6E05\u7A7A\u5168\u90E8\u5929\u8D26\u672C\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002" }),
          /* @__PURE__ */ jsx4("button", { className: "tt-btn danger sm", disabled: busy, onClick: doPurgeAll, children: "\u786E\u8BA4\u6E05\u7A7A" }),
          /* @__PURE__ */ jsx4("button", { className: "tt-btn ghost sm", onClick: () => setConfirmPurgeAll(false), children: "\u53D6\u6D88" })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "tt-field", children: /* @__PURE__ */ jsxs4("div", { className: "tt-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u5B58\u50A8\u4F4D\u7F6E" }),
          /* @__PURE__ */ jsx4("small", { children: "\u5168\u90E8\u6570\u636E\u5728\u672C\u673A Polaris \u6570\u636E\u6839\uFF08cap.kv / SqliteStorage\uFF09\uFF0C\u4E0D\u4E0A\u4F20\u4EFB\u4F55\u670D\u52A1\u5668\uFF1B\u6807\u9898\u9ED8\u8BA4\u4E0D\u91C7\u96C6\u3002" })
        ] }) })
      ] })
    ] })
  ] });
}
function stateLabel(state) {
  switch (state) {
    case "running":
      return "\u8FD0\u884C\u4E2D";
    case "starting":
      return "\u542F\u52A8\u4E2D";
    case "stopping":
      return "\u505C\u6B62\u4E2D";
    case "stopped":
      return "\u5DF2\u505C\u6B62";
    case "error":
      return "\u51FA\u9519";
    default:
      return state;
  }
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.tt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tt-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tt-body{flex:1;overflow-y:auto;padding:0 0 24px}
.tt-body::-webkit-scrollbar{width:9px;height:9px}
.tt-body::-webkit-scrollbar-track{background:transparent}
.tt-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.tt-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.tt-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.tt-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0E7490,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.tt-tt{flex:1;min-width:0}
.tt-tt b{font-size:15px;display:block}
.tt-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.tt-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.tt-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.tt-dot.stale{background:#D29922}
.tt-dot.down{background:#F85149}
.tt-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.tt-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.tt-tab:hover{color:#E6EAF2}
.tt-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* \u901A\u7528 */
.tt-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.tt-card-h{padding:10px 13px 6px;font-size:12px;font-weight:700;color:#C9D1D9;display:flex;align-items:center;gap:8px}
.tt-card-h small{font-weight:400;color:#5C6678;font-size:10.5px;margin-left:auto}
.tt-card-b{padding:4px 13px 12px}
.tt-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.tt-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.tt-btn:hover{filter:brightness(1.1)}
.tt-btn:disabled{opacity:.45;cursor:not-allowed}
.tt-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.tt-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.tt-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.tt-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.tt-inp:focus{outline:none;border-color:#2b6cb0}
.tt-inp::placeholder{color:#4d5566}
.tt-empty{color:#8B95A7;font-size:12px;padding:22px 16px;text-align:center;line-height:1.9}
.tt-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.tt-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.tt-toast.bad{border-color:#54262c;color:#FF8A9A}

/* \u4ECA\u65E5 */
.tt-now{display:flex;align-items:center;gap:12px;padding:14px 13px}
.tt-now-ico{font-size:26px;flex-shrink:0}
.tt-now-main{flex:1;min-width:0}
.tt-now-main b{font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-now-main small{color:#8B95A7;font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.tt-chips{display:flex;gap:8px;padding:0 13px 12px;flex-wrap:wrap}
.tt-chip{background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:7px 11px;min-width:88px}
.tt-chip small{display:block;color:#5C6678;font-size:10px}
.tt-chip b{font-size:13.5px;color:#E6EAF2}
.tt-bar-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px}
.tt-bar-row .nm{width:64px;flex-shrink:0;display:flex;align-items:center;gap:5px}
.tt-bar-row .nm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-bar-track{flex:1;height:14px;background:#12151c;border-radius:7px;overflow:hidden;min-width:0}
.tt-bar-fill{height:100%;border-radius:7px;min-width:2px}
.tt-bar-val{width:70px;flex-shrink:0;text-align:right;color:#8B95A7;font-size:11px;font-variant-numeric:tabular-nums}
.tt-app-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-top:1px solid #1d2330}
.tt-app-row:first-child{border-top:none}
.tt-app-row .idx{color:#5C6678;font-size:10.5px;width:16px;flex-shrink:0}
.tt-app-row .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-app-row .cat{font-size:10px;padding:1px 6px;border-radius:5px;flex-shrink:0}
.tt-app-row .dur{color:#8B95A7;font-size:11px;flex-shrink:0;font-variant-numeric:tabular-nums}
.tt-strip{display:flex;gap:2px;padding:2px 0 4px}
.tt-cell{flex:1;height:26px;border-radius:3px;background:#12151c;min-width:0;position:relative}
.tt-cell-l{display:flex;justify-content:space-between;color:#5C6678;font-size:9.5px;padding-top:3px}
.tt-banner{display:flex;align-items:center;gap:8px;margin:0 16px 10px;padding:9px 13px;border-radius:11px;font-size:11.5px;border:1px solid}
.tt-banner.warn{background:#241d10;border-color:#4a3b15;color:#D29922}
.tt-banner.bad{background:#241318;border-color:#54262c;color:#FF8A9A}

/* \u5386\u53F2 */
.tt-seg{display:flex;gap:4px;margin-left:auto}
.tt-seg button{background:transparent;border:1px solid #2a2f3a;color:#8B95A7;font-size:10.5px;padding:2px 8px;border-radius:7px;cursor:pointer}
.tt-seg button.on{background:#1C2330;color:#E6EAF2;border-color:#3a4254}
.tt-daybar{display:flex;flex-direction:column;gap:6px;padding:2px 0}
.tt-dayrow{display:flex;align-items:center;gap:8px;font-size:10.5px}
.tt-dayrow .d{width:74px;flex-shrink:0;color:#8B95A7;font-variant-numeric:tabular-nums}
.tt-dayrow .stack{flex:1;display:flex;height:16px;border-radius:4px;overflow:hidden;background:#12151c;min-width:0}
.tt-dayrow .sum{width:58px;flex-shrink:0;text-align:right;color:#8B95A7;font-variant-numeric:tabular-nums}
.tt-daylist{border-top:1px solid #1d2330;margin-top:8px}
.tt-dayitem{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:11.5px;border-bottom:1px solid #1d2330;cursor:pointer}
.tt-dayitem:last-child{border-bottom:none}
.tt-dayitem .d{width:74px;flex-shrink:0;color:#C9D1D9}
.tt-dayitem .info{flex:1;min-width:0;color:#8B95A7;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-dayitem .dur{color:#E6EAF2;flex-shrink:0;font-variant-numeric:tabular-nums}

/* \u5206\u7C7B */
.tt-catrow{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:12px;border-top:1px solid #1d2330}
.tt-catrow:first-child{border-top:none}
.tt-catrow .sw{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.tt-catrow .nm{flex:1;min-width:0}
.tt-rule{display:flex;align-items:center;gap:7px;padding:6px 0;font-size:11.5px;border-top:1px solid #1d2330}
.tt-rule:first-child{border-top:none}
.tt-rule .m{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-rule .k{font-size:9.5px;color:#5C6678;flex-shrink:0}
.tt-addrow{display:flex;gap:6px;padding-top:8px;flex-wrap:wrap}
.tt-addrow .tt-inp{flex:1;min-width:90px}
.tt-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:11.5px;flex-shrink:0}

/* \u8BBE\u7F6E */
.tt-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.tt-field:first-child{border-top:none}
.tt-field-l{flex:1;min-width:0}
.tt-field-l b{font-size:12.5px;display:block}
.tt-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.tt-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.tt-toggle.on{background:#2b6cb0}
.tt-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.tt-toggle.on i{left:18px}
.tt-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.tt-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
.tt-confirm{display:flex;align-items:center;gap:8px;padding:8px 13px;background:#241318;border-top:1px solid #54262c;font-size:11.5px;color:#FF8A9A}
.tt-confirm b{flex:1;min-width:0}
`;
function TimeTrailPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("today");
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const showToast = useCallback3((msg, bad) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback3(async () => {
    try {
      const d = await loadPanelData();
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect4(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 5e3);
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
  const hbState = !data?.snap ? "down" : data.snap.paused ? "stale" : Date.now() - data.snap.at <= 90 * 1e3 ? "ok" : "stale";
  const hbText = !data?.snap ? "\u670D\u52A1\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E Tab \u53EF\u542F\u52A8\uFF09" : data.snap.paused ? "\u5DF2\u6682\u505C\uFF08\u9690\u79C1\u6A21\u5F0F\uFF09" : hbState === "ok" ? `\u91C7\u96C6\u4E2D \xB7 ${data.snap.today.activeSec > 0 ? `\u4ECA\u65E5 ${fmtToday(data.snap.today.activeSec)}` : "\u521A\u5F00\u59CB\u8BB0\u5F55"}` : "\u5FEB\u7167\u505C\u6EDE";
  return /* @__PURE__ */ jsxs5("div", { className: "tt-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "tt-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "tt-logo", children: "\u{1F570}\uFE0F" }),
      /* @__PURE__ */ jsxs5("div", { className: "tt-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u65F6\u95F4\u7EDF\u8BA1" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `tt-dot ${hbState}` }),
          hbText
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "tt-tabs", children: [
        ["today", "\u4ECA\u65E5"],
        ["history", "\u5386\u53F2"],
        ["cats", "\u5206\u7C7B"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `tt-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "tt-body", children: /* @__PURE__ */ jsxs5("div", { className: "tt-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "tt-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "today" && /* @__PURE__ */ jsx5(TodayTab, { data, reload, showToast }),
      tab === "history" && /* @__PURE__ */ jsx5(HistoryTab, { data }),
      tab === "cats" && /* @__PURE__ */ jsx5(CatsTab, { pluginId, data, reload, showToast, onSendToChat }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { pluginId, data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `tt-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}
function fmtToday(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}\u5206`;
  return `${Math.floor(m / 60)}\u5C0F\u65F6${m % 60}\u5206`;
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function TimeTrailEntry(props) {
  return /* @__PURE__ */ jsx6(TimeTrailPanel, { ...props });
}
export {
  TimeTrailEntry as default
};
