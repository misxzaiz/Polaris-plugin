var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/sha256.js
var require_sha256 = __commonJS({
  "shared/sha256.js"(exports, module) {
    "use strict";
    var K3 = [
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ];
    function utf8Bytes(str) {
      const out = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 55296 && c <= 56319 && i + 1 < str.length) {
          const c2 = str.charCodeAt(i + 1);
          if (c2 >= 56320 && c2 <= 57343) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            i++;
          }
        }
        if (c < 128) out.push(c);
        else if (c < 2048) out.push(192 | c >> 6, 128 | c & 63);
        else if (c < 65536) out.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
        else out.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
      }
      return new Uint8Array(out);
    }
    function rotr(x, n) {
      return x >>> n | x << 32 - n;
    }
    function sha256Hex2(input) {
      const bytes = utf8Bytes(String(input));
      const bitLen = bytes.length * 8;
      const padded = bytes.length + 9 + 63 & ~63;
      const m = new Uint8Array(padded);
      m.set(bytes);
      m[bytes.length] = 128;
      const dv = new DataView(m.buffer);
      dv.setUint32(padded - 8, Math.floor(bitLen / 4294967296), false);
      dv.setUint32(padded - 4, bitLen >>> 0, false);
      let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
      let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
      const w = new Int32Array(64);
      for (let off = 0; off < padded; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
          w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = e & f ^ ~e & g;
          const t1 = h + S1 + ch + K3[i] + w[i] | 0;
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = a & b ^ a & c ^ b & c;
          const t2 = S0 + maj | 0;
          h = g;
          g = f;
          f = e;
          e = d + t1 | 0;
          d = c;
          c = b;
          b = a;
          a = t1 + t2 | 0;
        }
        h0 = h0 + a | 0;
        h1 = h1 + b | 0;
        h2 = h2 + c | 0;
        h3 = h3 + d | 0;
        h4 = h4 + e | 0;
        h5 = h5 + f | 0;
        h6 = h6 + g | 0;
        h7 = h7 + h | 0;
      }
      const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
      return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
    }
    module.exports = { sha256Hex: sha256Hex2 };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useRef as useRef2, useState as useState4 } from "react";

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
var import_sha256 = __toESM(require_sha256());
var DEFAULT_SETTINGS = {
  pollMin: 15,
  retentionDays: 30,
  maxPerFeed: 120,
  readKeepDays: 14,
  contentKeepHours: 48
};
var SETTING_LIMITS = {
  pollMin: [10, 240],
  retentionDays: [7, 365],
  maxPerFeed: [30, 500],
  readKeepDays: [3, 180],
  contentKeepHours: [8, 240]
};
var K = {
  feed: (id) => `radar.feed.${id}`,
  feedPrefix: "radar.feed.",
  article: (fid, aid) => `radar.article.${fid}.${aid}`,
  articlePrefix: "radar.article.",
  content: (aid) => `radar.content.${aid}`,
  contentPrefix: "radar.content.",
  settings: "radar.settings",
  meta: "radar.meta",
  cmdRefreshAll: (n) => `radar.cmd.refreshAll.${n}`,
  cmdRefreshFeed: (fid) => `radar.cmd.refreshFeed.${fid}`,
  cmdPull: (aid) => `radar.cmd.pull.${aid}`,
  cmdForget: (fid) => `radar.cmd.forget.${fid}`,
  cmdPurge: (n) => `radar.cmd.purge.${n}`
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
function newCache() {
  return { seen: /* @__PURE__ */ new Map(), articles: /* @__PURE__ */ new Map(), lastFullAt: 0 };
}
var FULL_REFRESH_MS = 90 * 1e3;
async function loadRadar(cache) {
  const [keys, rawMeta, rawSettings] = await Promise.all([
    kvKeys(),
    kvGet(K.meta),
    kvGet(K.settings)
  ]);
  const feedKeys = keys.filter((k) => k.startsWith(K.feedPrefix));
  const feeds = [];
  const forceFull = cache.lastFullAt === 0 || Date.now() - cache.lastFullAt > FULL_REFRESH_MS;
  const refetchFeeds = /* @__PURE__ */ new Set();
  const defs = await Promise.all(feedKeys.map(async (k) => {
    const v = await kvGet(k).catch(() => null);
    return v && typeof v === "object" && v.id ? v : null;
  }));
  for (const f of defs) {
    if (!f) continue;
    feeds.push(f);
    const prev = cache.seen.get(f.id);
    const cur = { rev: Number(f.rev) || 1, unread: Number(f.unreadCount) || 0 };
    if (!prev || prev.rev !== cur.rev || prev.unread !== cur.unread) refetchFeeds.add(f.id);
    cache.seen.set(f.id, cur);
  }
  const aliveFeed = new Set(feeds.map((f) => f.id));
  for (const aid of [...cache.articles.keys()]) {
    const a = cache.articles.get(aid);
    if (a && !aliveFeed.has(a.feedId)) cache.articles.delete(aid);
  }
  const articleKeysAll = keys.filter((k) => k.startsWith(K.articlePrefix));
  const wanted = forceFull ? articleKeysAll : articleKeysAll.filter((k) => {
    const fid = k.slice(K.articlePrefix.length).split(".")[0];
    return refetchFeeds.has(fid);
  });
  if (forceFull) cache.lastFullAt = Date.now();
  const raws = await Promise.all(wanted.map(async (k) => {
    const v = await kvGet(k).catch(() => null);
    return v && typeof v === "object" && v.id ? { a: v, k } : null;
  }));
  for (const r of raws) {
    if (!r) continue;
    const a = r.a;
    cache.articles.set(a.id, { ...a, read: !!a.read, star: !!a.star });
  }
  const articles = [...cache.articles.values()].sort((x, y) => (y.publishedAt || y.createdAt || 0) - (x.publishedAt || x.createdAt || 0));
  const unreadTotal = articles.reduce((s, a) => s + (a.read ? 0 : 1), 0);
  return {
    feeds,
    articles,
    meta: rawMeta && typeof rawMeta === "object" ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...rawSettings && typeof rawSettings === "object" ? rawSettings : {} },
    unreadTotal
  };
}
function feedIdFor(url) {
  return "f" + (0, import_sha256.sha256Hex)(url.trim().toLowerCase()).slice(0, 10);
}
function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "").slice(0, 12);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
async function addFeed(url, opts) {
  const fid = feedIdFor(url);
  const existing = await kvGet(K.feed(fid));
  const base = existing ? {
    id: fid,
    url,
    title: opts?.title || existing.title,
    category: opts?.category || "",
    intervalMin: opts?.intervalMin || 0,
    siteUrl: existing.siteUrl || "",
    enabled: existing.enabled,
    createdAt: existing.createdAt,
    lastFetchAt: existing.lastFetchAt || 0,
    lastStatus: existing.lastStatus || "never",
    itemCount: existing.itemCount || 0,
    unreadCount: existing.unreadCount || 0,
    rev: existing.rev || 1
  } : {
    id: fid,
    url,
    title: opts?.title || "",
    category: opts?.category || "",
    intervalMin: opts?.intervalMin || 0,
    enabled: true,
    createdAt: Date.now(),
    lastFetchAt: 0,
    lastStatus: "never",
    itemCount: 0,
    unreadCount: 0,
    rev: 1
  };
  await kvSet(K.feed(fid), base);
  return fid;
}
async function saveFeedFields(fid, patch) {
  const f = await kvGet(K.feed(fid));
  if (!f) throw new Error("\u8BA2\u9605\u6E90\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664");
  await kvSet(K.feed(fid), { ...f, ...patch });
}
async function removeFeed(fid) {
  const keys = await kvKeys();
  const artKeys = keys.filter((k) => k.startsWith(`${K.articlePrefix}${fid}.`));
  const aids = new Set(artKeys.map((k) => k.split(".").pop() || ""));
  await kvDel(K.feed(fid));
  for (const k of artKeys) await kvDel(k);
  for (const aid of aids) if (aid) await kvDel(K.content(aid)).catch(() => {
  });
  await kvSet(K.cmdForget(fid), { op: "forget", fid, at: Date.now() });
  return artKeys.length;
}
async function markArticle(article, patch) {
  const key = K.article(article.feedId, article.id);
  const now = await kvGet(key);
  if (!now || typeof now !== "object") throw new Error("\u6587\u7AE0\u5DF2\u88AB\u6E05\u7406");
  const upd = { ...now, ...patch, read: patch.read === void 0 ? !!now.read : !!patch.read, star: patch.star === void 0 ? !!now.star : !!patch.star };
  await kvSet(key, upd);
  const f = await kvGet(K.feed(article.feedId)).catch(() => null);
  if (f) await kvSet(K.feed(article.feedId), { ...f, rev: (Number(f.rev) || 1) + 1 }).catch(() => {
  });
}
async function pullContent(aid) {
  const existing = await kvGet(K.content(aid));
  if (existing && (existing.ok || existing.error)) return existing;
  await kvSet(K.cmdPull(aid), { op: "pull", id: aid, at: Date.now() });
  const t0 = Date.now();
  while (Date.now() - t0 < 25e3) {
    await sleep(1200);
    const c = await kvGet(K.content(aid));
    if (c && (c.ok || c.error)) return c;
  }
  return null;
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function refreshAll() {
  await kvSet(K.cmdRefreshAll(uid()), { op: "refreshAll", at: Date.now() });
}
async function refreshFeed(fid) {
  await kvSet(K.cmdRefreshFeed(fid), { op: "refreshFeed", fid, at: Date.now() });
}
async function purgeArticles() {
  await kvSet(K.cmdPurge(uid()), { op: "purge", at: Date.now() });
}
function parseOpml(text) {
  try {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    if (!doc.querySelector("opml")) return { found: 0, error: "\u4E0D\u662F OPML \u6587\u4EF6\uFF08\u7F3A <opml> \u6839\uFF09" };
    const outlines = doc.querySelectorAll("outline[xmlUrl]");
    return { found: outlines.length, error: "" };
  } catch (e) {
    return { found: 0, error: `OPML \u89E3\u6790\u5931\u8D25\uFF1A${e.message}` };
  }
}
async function importOpml(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (!doc.querySelector("opml")) throw new Error("\u4E0D\u662F OPML \u6587\u4EF6\uFF08\u7F3A <opml> \u6839\uFF09");
  let ok = 0;
  let skip = 0;
  const cats = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  const walk = async (el, parentCat) => {
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== "outline") continue;
      const xmlUrl = child.getAttribute("xmlUrl") || child.getAttribute("xmlurl") || "";
      const title = child.getAttribute("title") || child.getAttribute("text") || "";
      if (xmlUrl) {
        const url = xmlUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
          skip++;
          continue;
        }
        const fid = feedIdFor(url);
        if (seen.has(fid)) {
          skip++;
          continue;
        }
        seen.add(fid);
        if (parentCat) cats.add(parentCat);
        await addFeed(url, { title: title.slice(0, 60), category: parentCat });
        ok++;
      } else if (title) {
        await walk(child, title.slice(0, 24));
      }
    }
  };
  await walk(doc.querySelector("body") || doc.documentElement, "");
  return { ok, skip, categories: cats.size };
}
function buildOpml(feeds) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const byCat = /* @__PURE__ */ new Map();
  for (const f of feeds) {
    const c = (f.category || "\u672A\u5206\u7C7B").slice(0, 24);
    const arr = byCat.get(c) || [];
    arr.push(f);
    byCat.set(c, arr);
  }
  let body = "";
  for (const [cat, arrs] of byCat) {
    if (byCat.size > 1) body += `    <outline text="${esc(cat)}" title="${esc(cat)}">
`;
    for (const f of arrs) {
      body += `      <outline type="rss" text="${esc(f.title || f.url)}" title="${esc(f.title || f.url)}" xmlUrl="${esc(f.url)}"/>
`;
    }
    if (byCat.size > 1) body += "    </outline>\n";
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>feed-radar \u5BFC\u51FA</title></head>
  <body>
${body}  </body>
</opml>`;
}
function timeStr(ts) {
  const d = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
function timeAgo(ts) {
  if (!ts) return "\u4ECE\u672A";
  const d = Date.now() - ts;
  if (d < 60 * 1e3) return `${Math.floor(d / 1e3)} \u79D2\u524D`;
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function hostOf(u) {
  try {
    return u ? new URL(u).host : "";
  } catch (_) {
    return "";
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
var SERVICE_ID = "radar-service";
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

// src/ArticleTab.tsx
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PAGE_SIZE = 80;
function ArticleTab({ data, reload, showToast, onSendToChat }) {
  const [query, setQuery] = useState("");
  const [feedFilter, setFeedFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [reading, setReading] = useState(null);
  const [content, setContent] = useState(null);
  const [pulling, setPulling] = useState(false);
  const feedName = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const f of data?.feeds ?? []) m.set(f.id, f.title || hostOf(f.url) || f.id);
    return m;
  }, [data?.feeds]);
  const list = useMemo(() => {
    let arr = data?.articles ?? [];
    if (unreadOnly) arr = arr.filter((a) => !a.read);
    if (feedFilter) arr = arr.filter((a) => a.feedId === feedFilter);
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter((a) => (a.title || "").toLowerCase().includes(q) || (a.excerpt || "").toLowerCase().includes(q));
    return arr.slice(0, limit);
  }, [data?.articles, unreadOnly, feedFilter, query, limit]);
  const openArticle = async (a) => {
    setReading(a);
    setContent(null);
    setPulling(false);
    if (!a.read) {
      try {
        await markArticle(a, { read: true });
        await reload();
      } catch {
      }
    }
  };
  const pull = async (a) => {
    setPulling(true);
    setContent(null);
    try {
      const c = await pullContent(a.id);
      if (c) setContent(c);
      else showToast("\u6B63\u6587\u6293\u53D6\u8D85\u65F6\uFF08\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF09", true);
    } catch (e) {
      showToast(`\u6B63\u6587\u6293\u53D6\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setPulling(false);
  };
  const toggle = async (a, patch) => {
    try {
      await markArticle(a, patch);
      await reload();
      if (reading?.id === a.id) setReading({ ...a, ...patch });
    } catch (e) {
      showToast(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const sendToChat = async (a) => {
    if (!onSendToChat) {
      showToast("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u9001\u5230\u804A\u5929", true);
      return;
    }
    const parts = [`\u8BF7\u8BFB\u8FD9\u7BC7\u6587\u7AE0\u5E76\u7ED9\u6211\u8981\u70B9\u603B\u7ED3\uFF1A${a.title || "(\u65E0\u6807\u9898)"}`];
    if (a.link) parts.push(a.link);
    if (content?.ok && content.text) parts.push(`
\u6B63\u6587\u8282\u9009\uFF1A
${content.text.slice(0, 3e3)}`);
    await onSendToChat(parts.join("\n"));
    showToast("\u5DF2\u53D1\u9001\u5230\u804A\u5929");
  };
  if (reading) {
    const a = reading;
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "fr-read-h", children: [
        /* @__PURE__ */ jsx("button", { className: "fr-btn sm ghost", onClick: () => {
          setReading(null);
          setContent(null);
        }, children: "\u2190 \u8FD4\u56DE" }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { className: `fr-btn sm ${a.star ? "star" : "ghost"}`, onClick: () => toggle(a, { star: !a.star }), children: a.star ? "\u2605 \u5DF2\u6536\u85CF" : "\u2606 \u6536\u85CF" }),
        /* @__PURE__ */ jsx("button", { className: "fr-btn sm ghost", onClick: () => toggle(a, { read: false }), children: "\u6807\u4E3A\u672A\u8BFB" }),
        /* @__PURE__ */ jsx("button", { className: "fr-btn sm", onClick: () => sendToChat(a), children: "\u53D1\u7ED9 AI" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "fr-read-t", children: a.title || "(\u65E0\u6807\u9898)" }),
      /* @__PURE__ */ jsxs("div", { className: "fr-read-m", children: [
        /* @__PURE__ */ jsx("span", { children: feedName.get(a.feedId) || a.feedId }),
        /* @__PURE__ */ jsx("span", { children: "\xB7" }),
        /* @__PURE__ */ jsx("span", { children: a.publishedAt ? timeStr(a.publishedAt) : "" }),
        a.link && /* @__PURE__ */ jsx("a", { className: "fr-read-l", style: { margin: 0, padding: 0 }, href: a.link, target: "_blank", rel: "noreferrer", children: "\u539F\u6587\u94FE\u63A5 \u2197" })
      ] }),
      (a.excerpt || !content) && /* @__PURE__ */ jsx("div", { className: "fr-read-c", style: { color: "#8B95A7", fontStyle: a.excerpt ? "normal" : "italic" }, children: a.excerpt || (pulling ? "\u6B63\u5728\u6293\u53D6\u6B63\u6587\u2026" : "\u6682\u65E0\u6458\u8981\uFF0C\u70B9\u4E0B\u65B9\u6309\u94AE\u6293\u53D6\u6B63\u6587") }),
      pulling && /* @__PURE__ */ jsxs("div", { className: "fr-read-c", children: [
        /* @__PURE__ */ jsx("span", { className: "fr-spin" }),
        " \u670D\u52A1\u6B63\u5728\u6293\u53D6\u539F\u6587\u5E76\u62BD\u53D6\u4E3B\u5E72\u2026\uFF08\u6700\u957F\u7EA6 25 \u79D2\uFF09"
      ] }),
      content && (content.ok ? /* @__PURE__ */ jsx("div", { className: "fr-read-c", children: content.text }) : /* @__PURE__ */ jsxs("div", { className: "fr-err", children: [
        "\u6B63\u6587\u6293\u53D6\u5931\u8D25\uFF1A",
        content.error || "\u672A\u77E5\u9519\u8BEF"
      ] })),
      !content && !pulling && /* @__PURE__ */ jsx("div", { className: "fr-actions", style: { padding: "0 16px" }, children: /* @__PURE__ */ jsx("button", { className: "fr-btn sm", onClick: () => pull(a), children: "\u6293\u53D6\u6B63\u6587" }) }),
      content?.ok && /* @__PURE__ */ jsx("div", { className: "fr-actions", style: { padding: "0 16px" }, children: /* @__PURE__ */ jsx("button", { className: "fr-btn sm ghost", onClick: () => sendToChat(a), children: "\u628A\u6B63\u6587\u53D1\u7ED9 AI \u603B\u7ED3" }) })
    ] });
  }
  const total = data?.articles.length ?? 0;
  const shownUnread = list.filter((a) => !a.read).length;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "fr-bar" }),
      "\u6587\u7AE0\u6D41",
      /* @__PURE__ */ jsxs("span", { className: "fr-hint", children: [
        "\u672A\u8BFB ",
        data?.unreadTotal ?? 0,
        " / \u5171 ",
        total
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "fr-card", children: /* @__PURE__ */ jsxs("div", { className: "fr-card-b", style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "fr-inp",
          style: { flex: 2, minWidth: 120 },
          placeholder: "\u641C\u6807\u9898/\u6458\u8981\u2026",
          value: query,
          onChange: (e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }
        }
      ),
      /* @__PURE__ */ jsxs(
        "select",
        {
          className: "fr-sel",
          style: { flex: 1, minWidth: 100 },
          value: feedFilter,
          onChange: (e) => {
            setFeedFilter(e.target.value);
            setLimit(PAGE_SIZE);
          },
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8\u6765\u6E90" }),
            (data?.feeds ?? []).map((f) => /* @__PURE__ */ jsx("option", { value: f.id, children: f.title || hostOf(f.url) }, f.id))
          ]
        }
      ),
      /* @__PURE__ */ jsx("button", { className: `fr-btn sm ${unreadOnly ? "" : "ghost"}`, onClick: () => {
        setUnreadOnly(!unreadOnly);
        setLimit(PAGE_SIZE);
      }, children: unreadOnly ? "\u53EA\u770B\u672A\u8BFB" : "\u5168\u90E8" })
    ] }) }),
    list.length === 0 ? /* @__PURE__ */ jsx("div", { className: "fr-empty", children: total === 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "\u8FD8\u6CA1\u6709\u6587\u7AE0\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5148\u5230\u300C\u8BA2\u9605\u6E90\u300D\u6DFB\u52A0\u4E00\u4E2A RSS/Atom \u5730\u5740\uFF0C",
      /* @__PURE__ */ jsx("br", {}),
      "\u670D\u52A1\u4F1A\u5728\u4E0B\u4E2A\u5468\u671F\uFF08\u6216\u70B9\u300C\u7ACB\u5373\u5237\u65B0\u300D\uFF09\u6293\u53D6\u5165\u5E93\u3002"
    ] }) : unreadOnly ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "\u5F53\u524D\u8FC7\u6EE4\u4E0B\u6CA1\u6709\u672A\u8BFB\u6587\u7AE0\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5207\u5230\u300C\u5168\u90E8\u300D\u53EF\u67E5\u770B\u5DF2\u8BFB\u5185\u5BB9\u3002"
    ] }) : /* @__PURE__ */ jsx(Fragment, { children: "\u6CA1\u6709\u5339\u914D\u7684\u6587\u7AE0\u3002" }) }) : /* @__PURE__ */ jsxs("div", { className: "fr-card", style: { padding: 0 }, children: [
      list.map((a) => /* @__PURE__ */ jsxs("div", { className: `fr-art ${a.read ? "read" : ""}`, onClick: () => openArticle(a), children: [
        /* @__PURE__ */ jsx("i", { className: `fr-unread ${a.read ? "off" : ""}` }),
        /* @__PURE__ */ jsxs("div", { className: "fr-art-main", children: [
          /* @__PURE__ */ jsx("div", { className: "fr-art-t", children: a.title || "(\u65E0\u6807\u9898)" }),
          a.excerpt && /* @__PURE__ */ jsx("div", { className: "fr-art-x", children: a.excerpt }),
          /* @__PURE__ */ jsxs("div", { className: "fr-art-m", children: [
            /* @__PURE__ */ jsx("span", { children: feedName.get(a.feedId) || a.feedId }),
            /* @__PURE__ */ jsx("span", { children: "\xB7" }),
            /* @__PURE__ */ jsx("span", { children: timeAgo(a.publishedAt || a.createdAt) }),
            a.star && /* @__PURE__ */ jsx("span", { children: "\xB7 \u2605" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { className: `fr-star ${a.star ? "on" : ""}`, title: "\u6536\u85CF", onClick: (e) => {
          e.stopPropagation();
          toggle(a, { star: !a.star });
        }, children: a.star ? "\u2605" : "\u2606" })
      ] }, a.id)),
      total > list.length && /* @__PURE__ */ jsx("div", { style: { padding: "10px 0", textAlign: "center" }, children: /* @__PURE__ */ jsxs("button", { className: "fr-btn sm ghost", onClick: () => setLimit(limit + PAGE_SIZE), children: [
        "\u52A0\u8F7D\u66F4\u591A\uFF08\u8FD8\u6709 ",
        total - list.length,
        " \u6761\uFF09"
      ] }) })
    ] }),
    list.length > 0 && unreadOnly && shownUnread > 0 && /* @__PURE__ */ jsx("div", { className: "fr-actions", style: { padding: "0 18px" }, children: /* @__PURE__ */ jsx("button", { className: "fr-btn sm ghost", onClick: async () => {
      for (const a of list) {
        if (!a.read) {
          try {
            await markArticle(a, { read: true });
          } catch {
          }
        }
      }
      await reload();
      showToast("\u672C\u9875\u5DF2\u5168\u90E8\u6807\u4E3A\u5DF2\u8BFB");
    }, children: "\u672C\u9875\u5168\u90E8\u6807\u4E3A\u5DF2\u8BFB" }) })
  ] });
}

// src/FeedsTab.tsx
import { useRef, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function FeedsTab({ data, reload, showToast, goArticles }) {
  const [url, setUrl] = useState2("");
  const [title, setTitle] = useState2("");
  const [category, setCategory] = useState2("");
  const [busy, setBusy] = useState2("");
  const [opmlOpen, setOpmlOpen] = useState2(false);
  const [opmlText, setOpmlText] = useState2("");
  const fileRef = useRef(null);
  const feeds = [...data?.feeds ?? []].sort((a, b) => (a.category || "\u672A\u5206\u7C7B").localeCompare(b.category || "\u672A\u5206\u7C7B") || a.title.localeCompare(b.title));
  const add = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      showToast("\u8BF7\u8F93\u5165\u516C\u7F51 http(s) \u7684 RSS/Atom \u5730\u5740", true);
      return;
    }
    setBusy("add");
    try {
      const fid = await addFeed(u, { title: title.trim(), category: category.trim() });
      await refreshFeed(fid);
      setUrl("");
      setTitle("");
      setCategory("");
      await reload();
      showToast("\u5DF2\u6DFB\u52A0\uFF0C\u6B63\u5728\u6293\u53D6\u9996\u671F\u2026");
    } catch (e) {
      showToast(`\u6DFB\u52A0\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const doRefresh = async (fid) => {
    setBusy(fid || "all");
    try {
      if (fid) await refreshFeed(fid);
      else await refreshAll();
      showToast(fid ? "\u5DF2\u89E6\u53D1\u8BE5\u6E90\u7ACB\u5373\u5237\u65B0" : "\u5DF2\u89E6\u53D1\u5168\u90E8\u6E90\u7ACB\u5373\u5237\u65B0");
    } catch (e) {
      showToast(`\u5237\u65B0\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const toggleEnabled = async (fid, enabled) => {
    try {
      await saveFeedFields(fid, { enabled });
      await reload();
    } catch (e) {
      showToast(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const forget = async (fid, name) => {
    if (!window.confirm(`\u5220\u9664\u8BA2\u9605\u6E90\u300C${name}\u300D\uFF1F\u5176\u5168\u90E8\u6587\u7AE0\u4E0E\u661F\u6807\u90FD\u4F1A\u4E00\u5E76\u5220\u9664\uFF0C\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    setBusy(fid);
    try {
      const n = await removeFeed(fid);
      await reload();
      showToast(`\u5DF2\u5220\u9664\uFF08\u542B ${n} \u7BC7\u6587\u7AE0\uFF09`);
    } catch (e) {
      showToast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const onFile = async (file) => {
    const text = await file.text();
    const pre = parseOpml(text);
    if (pre.error) {
      showToast(pre.error, true);
      return;
    }
    if (!window.confirm(`\u89E3\u6790\u5230 ${pre.found} \u4E2A\u8BA2\u9605\u6E90\uFF0C\u786E\u8BA4\u5BFC\u5165\uFF1F`)) return;
    setBusy("opml");
    try {
      const r = await importOpml(text);
      await refreshAll();
      await reload();
      showToast(`\u5BFC\u5165 ${r.ok} \u4E2A\u6E90\uFF08\u8DF3\u8FC7 ${r.skip}\uFF09\uFF0C${r.categories} \u4E2A\u5206\u7EC4\uFF1B\u5DF2\u89E6\u53D1\u5237\u65B0`);
    } catch (e) {
      showToast(`\u5BFC\u5165\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const exportOpml = () => {
    const text = buildOpml(feeds.map((f) => ({ title: f.title, url: f.url, category: f.category })));
    setOpmlText(text);
    setOpmlOpen(true);
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/xml" }));
      a.download = "feed-radar.opml";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "fr-bar" }),
      "\u6DFB\u52A0\u8BA2\u9605",
      /* @__PURE__ */ jsx2("span", { className: "fr-hint", children: "RSS / Atom" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "fr-card", children: /* @__PURE__ */ jsxs2("div", { className: "fr-card-b", children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "fr-inp",
          placeholder: "RSS/Atom \u5730\u5740\uFF08https://\u2026\uFF09",
          value: url,
          onChange: (e) => setUrl(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !busy) void add();
          }
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "fr-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("input", { className: "fr-inp", style: { flex: 1 }, placeholder: "\u663E\u793A\u540D\uFF08\u53EF\u9009\uFF09", value: title, onChange: (e) => setTitle(e.target.value) }),
        /* @__PURE__ */ jsx2("input", { className: "fr-inp", style: { flex: 1 }, placeholder: "\u5206\u7EC4\uFF08\u53EF\u9009\uFF0C\u5982 \u6280\u672F\uFF09", value: category, onChange: (e) => setCategory(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "fr-actions", children: [
        /* @__PURE__ */ jsx2("button", { className: "fr-btn sm", disabled: !!busy, onClick: add, children: busy === "add" ? /* @__PURE__ */ jsx2("span", { className: "fr-spin" }) : "\u6DFB\u52A0\u5E76\u6293\u53D6\u9996\u671F" }),
        /* @__PURE__ */ jsx2("button", { className: "fr-btn sm ghost", disabled: !!busy || feeds.length === 0, onClick: () => doRefresh(), children: busy === "all" ? /* @__PURE__ */ jsx2("span", { className: "fr-spin" }) : "\u5168\u90E8\u7ACB\u5373\u5237\u65B0" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "fr-bar" }),
      "\u8BA2\u9605\u6E90",
      /* @__PURE__ */ jsxs2("span", { className: "fr-hint", children: [
        feeds.length,
        " \u4E2A\u6E90 \xB7 ",
        feeds.filter((f) => f.enabled).length,
        " \u542F\u7528"
      ] })
    ] }),
    feeds.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "fr-empty", children: [
      "\u8FD8\u6CA1\u6709\u8BA2\u9605\u6E90\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u7C98\u8D34\u4E00\u4E2A RSS/Atom \u5730\u5740\uFF0C\u6216\u4ECE OPML \u6587\u4EF6\u5BFC\u5165\u3002"
    ] }) : /* @__PURE__ */ jsx2("div", { className: "fr-card", style: { padding: 0 }, children: feeds.map((f) => {
      const dotCls = f.lastStatus === "ok" ? "#3FB950" : f.lastStatus === "error" ? "#F85149" : "#8B95A7";
      const name = f.title || hostOf(f.url) || f.id;
      return /* @__PURE__ */ jsxs2("div", { className: `fr-feed ${f.enabled ? "" : "off"}`, children: [
        /* @__PURE__ */ jsxs2("div", { className: "fr-feed-h", children: [
          /* @__PURE__ */ jsx2("i", { className: "fr-dot", style: { background: f.enabled ? dotCls : "#3d4657" } }),
          /* @__PURE__ */ jsx2("span", { className: "fr-feed-t", title: f.url, children: name }),
          f.category && /* @__PURE__ */ jsx2("span", { className: "fr-tag", children: f.category }),
          f.unreadCount > 0 && /* @__PURE__ */ jsxs2("button", { className: "fr-btn sm ghost", onClick: goArticles, children: [
            f.unreadCount,
            " \u672A\u8BFB"
          ] })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "fr-url", children: f.url }),
        /* @__PURE__ */ jsxs2("div", { className: "fr-feed-m", children: [
          /* @__PURE__ */ jsxs2("span", { children: [
            f.itemCount,
            " \u7BC7"
          ] }),
          /* @__PURE__ */ jsx2("span", { children: "\xB7" }),
          /* @__PURE__ */ jsxs2("span", { children: [
            "\u6293\u53D6 ",
            timeAgo(f.lastFetchAt)
          ] }),
          /* @__PURE__ */ jsx2("span", { children: "\xB7" }),
          /* @__PURE__ */ jsx2("span", { children: f.intervalMin > 0 ? `${f.intervalMin} \u5206\u949F/\u6B21` : `\u8DDF\u968F\u5168\u5C40\uFF08${data?.settings.pollMin ?? 15} \u5206\u949F\uFF09` }),
          f.consecutiveErrors ? /* @__PURE__ */ jsxs2("span", { style: { color: "#F85149" }, children: [
            "\xB7 \u8FDE\u7EED\u5931\u8D25 ",
            f.consecutiveErrors,
            " \u6B21"
          ] }) : null
        ] }),
        f.lastError && /* @__PURE__ */ jsx2("div", { className: "fr-sub", style: { color: "#F85149", marginTop: 3 }, children: f.lastError }),
        /* @__PURE__ */ jsxs2("div", { className: "fr-actions", style: { marginTop: 7 }, children: [
          /* @__PURE__ */ jsx2("button", { className: "fr-btn sm", disabled: !!busy, onClick: () => doRefresh(f.id), children: busy === f.id ? /* @__PURE__ */ jsx2("span", { className: "fr-spin" }) : "\u5237\u65B0" }),
          /* @__PURE__ */ jsx2("button", { className: "fr-btn sm ghost", onClick: () => toggleEnabled(f.id, !f.enabled), children: f.enabled ? "\u505C\u7528" : "\u542F\u7528" }),
          /* @__PURE__ */ jsx2("button", { className: "fr-btn sm danger", disabled: !!busy, onClick: () => forget(f.id, name), children: "\u5220\u9664" })
        ] })
      ] }, f.id);
    }) }),
    /* @__PURE__ */ jsxs2("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "fr-bar" }),
      "OPML \u5907\u4EFD",
      /* @__PURE__ */ jsx2("span", { className: "fr-hint", children: "\u8DE8\u9605\u8BFB\u5668\u8FC1\u79FB" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "fr-card", children: /* @__PURE__ */ jsxs2("div", { className: "fr-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "fr-actions", style: { marginTop: 0 }, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            ref: fileRef,
            type: "file",
            accept: ".opml,.xml,text/xml",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }
          }
        ),
        /* @__PURE__ */ jsx2("button", { className: "fr-btn sm ghost", disabled: !!busy, onClick: () => fileRef.current?.click(), children: "\u4ECE\u6587\u4EF6\u5BFC\u5165" }),
        /* @__PURE__ */ jsx2("button", { className: "fr-btn sm ghost", disabled: feeds.length === 0, onClick: exportOpml, children: "\u5BFC\u51FA\u5168\u90E8" })
      ] }),
      opmlOpen && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("div", { className: "fr-sub", style: { marginBottom: 4 }, children: "\u5DF2\u89E6\u53D1\u4E0B\u8F7D\uFF1B\u79FB\u52A8\u7AEF\u53EF\u76F4\u63A5\u590D\u5236\u4E0B\u9762\u7684\u5185\u5BB9\uFF1A" }),
        /* @__PURE__ */ jsx2("textarea", { className: "fr-ta", readOnly: true, value: opmlText, onFocus: (e) => e.currentTarget.select() })
      ] })
    ] }) })
  ] });
}

// src/SettingsTab.tsx
import { useEffect, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ pluginId, data, reload, showToast }) {
  const [status, setStatus] = useState3(null);
  const [statusErr, setStatusErr] = useState3("");
  const [busy, setBusy] = useState3("");
  const [draft, setDraft] = useState3(data?.settings ?? null);
  useEffect(() => {
    setDraft(data?.settings ?? null);
  }, [data?.settings]);
  const refreshStatus = async () => {
    try {
      const all = await listServiceStatus();
      setStatus(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID) ?? null);
      setStatusErr("");
    } catch (e) {
      setStatusErr(e.message);
    }
  };
  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 8e3);
    return () => clearInterval(t);
  }, [pluginId]);
  const doService = async (action) => {
    setBusy(action);
    try {
      await serviceAction(action, pluginId, SERVICE_ID);
      showToast(`\u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}\u670D\u52A1`);
      setTimeout(refreshStatus, 2e3);
    } catch (e) {
      showToast(`\u670D\u52A1\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const clamp = (key, v) => {
    const [lo, hi] = SETTING_LIMITS[key];
    return Math.min(hi, Math.max(lo, Math.floor(Number(v) || lo)));
  };
  const save = async () => {
    if (!draft) return;
    try {
      await saveSettings({
        pollMin: clamp("pollMin", draft.pollMin),
        retentionDays: clamp("retentionDays", draft.retentionDays),
        maxPerFeed: clamp("maxPerFeed", draft.maxPerFeed),
        readKeepDays: clamp("readKeepDays", draft.readKeepDays),
        contentKeepHours: clamp("contentKeepHours", draft.contentKeepHours)
      });
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 60 \u79D2\u5185\u751F\u6548\uFF09");
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const purge = async () => {
    if (!window.confirm("\u6E05\u7A7A\u5168\u90E8\u6587\u7AE0\u4E0E\u6B63\u6587\uFF08\u661F\u6807\u4E5F\u4F1A\u4E00\u5E76\u6E05\u6389\uFF0C\u4EC5\u4FDD\u7559\u8BA2\u9605\u6E90\u5B9A\u4E49\uFF09\u3002\u786E\u5B9A\uFF1F")) return;
    setBusy("purge");
    try {
      await purgeArticles();
      await reload();
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u6587\u7AE0\uFF08\u8BA2\u9605\u6E90\u4FDD\u7559\uFF09");
    } catch (e) {
      showToast(`\u6E05\u7406\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const clearAll = async () => {
    if (!window.confirm("\u5220\u9664\u8BA2\u9605\u96F7\u8FBE\u7684\u5168\u90E8\u6570\u636E\uFF08\u8BA2\u9605\u6E90/\u6587\u7AE0/\u6B63\u6587/\u8BBE\u7F6E\uFF09\uFF1F\u4E0D\u53EF\u6062\u590D\u3002")) return;
    setBusy("clearAll");
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("radar."));
      await Promise.all(keys.map((k) => kvDel(k)));
      await reload();
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u96F7\u8FBE\u6570\u636E");
    } catch (e) {
      showToast(`\u6E05\u7406\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const stateCls = (s) => s === "running" ? "#3FB950" : s === "error" ? "#F85149" : s === "starting" ? "#D29922" : "#8B95A7";
  const meta = data?.meta;
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "fr-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "fr-card", children: /* @__PURE__ */ jsxs3("div", { className: "fr-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "fr-row", children: [
        /* @__PURE__ */ jsx3("i", { className: "fr-dot", style: { background: stateCls(status?.state) } }),
        /* @__PURE__ */ jsx3("b", { style: { flex: 1 }, children: status ? {
          starting: "\u542F\u52A8\u4E2D",
          running: "\u8FD0\u884C\u4E2D",
          stopping: "\u505C\u6B62\u4E2D",
          stopped: "\u5DF2\u505C\u6B62",
          error: "\u5F02\u5E38"
        }[status.state] || status.state : statusErr ? "\u72B6\u6001\u672A\u77E5" : "\u672A\u6CE8\u518C\uFF08\u63D2\u4EF6\u521A\u88C5\uFF1F\u7A0D\u5019\u5237\u65B0\uFF09" }),
        busy && busy !== "purge" && busy !== "clearAll" && /* @__PURE__ */ jsx3("span", { className: "fr-spin" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-state", children: [
        status?.pid && /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "PID ",
          /* @__PURE__ */ jsx3("b", { children: status.pid })
        ] }),
        status?.port ? /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\xB7 \u7AEF\u53E3 ",
          /* @__PURE__ */ jsx3("b", { children: status.port })
        ] }) : null,
        status?.uptime ? /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\xB7 \u5DF2\u8FD0\u884C ",
          /* @__PURE__ */ jsxs3("b", { children: [
            Math.floor(status.uptime / 60),
            " \u5206\u949F"
          ] })
        ] }) : null,
        !!status?.restartCount && /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\xB7 \u91CD\u542F ",
          /* @__PURE__ */ jsx3("b", { children: status.restartCount }),
          " \u6B21"
        ] })
      ] }),
      status?.lastError && /* @__PURE__ */ jsx3("div", { className: "fr-sub", style: { color: "#F85149", marginTop: 4 }, children: status.lastError }),
      /* @__PURE__ */ jsx3("div", { className: "fr-state", children: meta ? /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
        "\u5FC3\u8DF3 ",
        /* @__PURE__ */ jsx3("b", { children: timeAgo(meta.lastTickAt) }),
        " \xB7 \u6865 ",
        /* @__PURE__ */ jsx3("b", { children: meta.bridge }),
        " \xB7 v",
        meta.version
      ] }) : /* @__PURE__ */ jsx3("span", { className: "fr-kv", children: "\u5C1A\u65E0\u5FC3\u8DF3\uFF08\u670D\u52A1\u672A\u8FD0\u884C\u65F6\u6B63\u5E38\uFF09" }) }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-actions", children: [
        /* @__PURE__ */ jsx3("button", { className: "fr-btn sm", disabled: busy !== "" || status?.state === "running" || status?.state === "starting", onClick: () => doService("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx3("button", { className: "fr-btn sm ghost", disabled: busy !== "" || !status || status.state !== "running" && status.state !== "error" && status.state !== "starting", onClick: () => doService("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx3("button", { className: "fr-btn sm ghost", disabled: busy !== "" || !status || status.state !== "running" && status.state !== "starting" && status.state !== "error", onClick: () => doService("stop"), children: "\u505C\u6B62" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "fr-sub", style: { marginTop: 8 }, children: "\u6293\u53D6\u5168\u90E8\u7531\u672C\u670D\u52A1\u5728\u540E\u53F0\u539F\u751F\u6267\u884C\uFF08\u65E0\u6D4F\u89C8\u5668\u8DE8\u57DF\u9650\u5236\uFF09\uFF1B\u684C\u9762\u4E0E\u624B\u673A Web \u9762\u677F\u901A\u8FC7 cap.kv \u770B\u5230\u540C\u4E00\u4EFD\u6570\u636E\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "fr-bar" }),
      "\u8C03\u5EA6\u4E0E\u4FDD\u7559"
    ] }),
    draft && /* @__PURE__ */ jsx3("div", { className: "fr-card", children: /* @__PURE__ */ jsxs3("div", { className: "fr-card-b", style: { padding: 0 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "fr-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "fr-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u5168\u5C40\u6293\u53D6\u95F4\u9694" }),
          /* @__PURE__ */ jsx3("small", { children: "\u65E0\u72EC\u7ACB\u95F4\u9694\u7684\u6E90\u90FD\u8DDF\u968F\u6B64\u503C\uFF08\u5206\u949F\uFF0C10\u2013240\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "fr-num",
            type: "number",
            min: SETTING_LIMITS.pollMin[0],
            max: SETTING_LIMITS.pollMin[1],
            value: draft.pollMin,
            onChange: (e) => setDraft({ ...draft, pollMin: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "fr-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u6587\u7AE0\u4FDD\u7559\u5929\u6570" }),
          /* @__PURE__ */ jsx3("small", { children: "\u8D85\u671F\u6587\u7AE0\u81EA\u52A8\u6E05\u7406\uFF0C\u661F\u6807\u6C38\u7559\uFF08\u5929\uFF0C7\u2013365\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "fr-num",
            type: "number",
            min: SETTING_LIMITS.retentionDays[0],
            max: SETTING_LIMITS.retentionDays[1],
            value: draft.retentionDays,
            onChange: (e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "fr-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u5355\u6E90\u6587\u7AE0\u4E0A\u9650" }),
          /* @__PURE__ */ jsx3("small", { children: "\u8D85\u51FA\u540E\u6700\u65E7\u7684\u88AB\u6E05\u7406\uFF08\u6761\uFF0C30\u2013500\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "fr-num",
            type: "number",
            min: SETTING_LIMITS.maxPerFeed[0],
            max: SETTING_LIMITS.maxPerFeed[1],
            value: draft.maxPerFeed,
            onChange: (e) => setDraft({ ...draft, maxPerFeed: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "fr-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u5DF2\u8BFB\u4FDD\u7559\u5929\u6570" }),
          /* @__PURE__ */ jsx3("small", { children: "\u5DF2\u8BFB\u4E14\u8FC7\u671F\u7684\u6587\u7AE0\u6E05\u7406\uFF08\u5929\uFF0C3\u2013180\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "fr-num",
            type: "number",
            min: SETTING_LIMITS.readKeepDays[0],
            max: SETTING_LIMITS.readKeepDays[1],
            value: draft.readKeepDays,
            onChange: (e) => setDraft({ ...draft, readKeepDays: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "fr-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u6B63\u6587\u4FDD\u7559\u65F6\u957F" }),
          /* @__PURE__ */ jsx3("small", { children: "\u5DF2\u6293\u53D6\u7684\u6B63\u6587\u8FC7\u671F\u56DE\u6536\uFF0C\u6458\u8981\u4ECD\u5728\uFF08\u5C0F\u65F6\uFF0C8\u2013240\uFF09" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "fr-num",
            type: "number",
            min: SETTING_LIMITS.contentKeepHours[0],
            max: SETTING_LIMITS.contentKeepHours[1],
            value: draft.contentKeepHours,
            onChange: (e) => setDraft({ ...draft, contentKeepHours: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "fr-actions", style: { padding: "10px 13px" }, children: /* @__PURE__ */ jsx3("button", { className: "fr-btn sm", onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "fr-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "fr-card", children: /* @__PURE__ */ jsxs3("div", { className: "fr-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "fr-state", style: { marginTop: 0 }, children: [
        /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\u8BA2\u9605\u6E90 ",
          /* @__PURE__ */ jsx3("b", { children: data?.feeds.length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\xB7 \u6587\u7AE0 ",
          /* @__PURE__ */ jsx3("b", { children: data?.articles.length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\xB7 \u672A\u8BFB ",
          /* @__PURE__ */ jsx3("b", { children: data?.unreadTotal ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "fr-kv", children: [
          "\xB7 \u5B58\u50A8 ",
          /* @__PURE__ */ jsx3("b", { children: "cap.kv\uFF08radar.* \u952E\u7A7A\u95F4\uFF09" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "fr-actions", children: [
        /* @__PURE__ */ jsx3("button", { className: "fr-btn sm ghost", disabled: !!busy, onClick: purge, children: busy === "purge" ? /* @__PURE__ */ jsx3("span", { className: "fr-spin" }) : "\u6E05\u7A7A\u5168\u90E8\u6587\u7AE0\uFF08\u4FDD\u7559\u8BA2\u9605\u6E90\uFF09" }),
        /* @__PURE__ */ jsx3("button", { className: "fr-btn sm danger", disabled: !!busy, onClick: clearAll, children: busy === "clearAll" ? /* @__PURE__ */ jsx3("span", { className: "fr-spin" }) : "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "fr-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "fr-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "fr-card", children: /* @__PURE__ */ jsxs3("div", { className: "fr-card-b fr-sub", children: [
      "\u8BA2\u9605\u96F7\u8FBE feed-radar v0.1.0 \u2014\u2014 RSS/Atom \u8BA2\u9605 + AI \u8BFB\u62A5\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u6D4F\u89C8\u5668\u6709\u540C\u6E90\u7B56\u7565\uFF0C\u672C\u63D2\u4EF6\u628A\u6293\u53D6\u4E0B\u6C89\u5230\u540E\u53F0\u670D\u52A1\u539F\u751F\u6267\u884C\uFF0C\u5929\u7136\u65E0\u8DE8\u57DF\u95EE\u9898\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u6761\u4EF6\u8BF7\u6C42\uFF08ETag / If-Modified-Since\uFF09\uFF1A\u6E90\u6CA1\u66F4\u65B0\u65F6\u96F6\u6210\u672C\u56DE\u8DF3\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u624B\u673A\u7AEF\u8BBF\u95EE\u65F6\u9762\u677F\u7ECF\u5BBF\u4E3B\u7EDF\u4E00\u901A\u9053\uFF08\u81EA\u52A8\u5E26 token\uFF09\u8BFB\u5199 cap.kv\uFF0C\u4E0E\u684C\u9762\u770B\u5230\u540C\u4E00\u4EFD\u6570\u636E\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u5728\u804A\u5929\u91CC\u53EF\u76F4\u63A5\u8BA9 AI \u8BFB\u62A5\uFF08radar_unread / radar_read_article / radar_mark\uFF09\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u6293\u53D6\u793C\u8C8C\u7B56\u7565\uFF1A\u540C\u4E00\u4E3B\u673A\u81F3\u5C11\u95F4\u9694 10 \u79D2\uFF0C\u8FDE\u7EED\u5931\u8D25\u6307\u6570\u9000\u907F\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.fr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.fr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.fr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.fr-body::-webkit-scrollbar{width:9px;height:9px}
.fr-body::-webkit-scrollbar-track{background:transparent}
.fr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.fr-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.fr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.fr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C77B3F,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.fr-tt{flex:1;min-width:0}
.fr-tt b{font-size:15px;display:block}
.fr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.fr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.fr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.fr-dot.stale{background:#D29922}
.fr-dot.down{background:#F85149}
.fr-tabs{display:flex;gap:4px}
.fr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.fr-tab:hover{color:#E6EAF2}
.fr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.fr-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.fr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.fr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.fr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#C77B3F,#58A6FF);flex-shrink:0}
.fr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.fr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.fr-card-b{padding:11px 13px}
.fr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.fr-url{font-size:10.5px;color:#5C6678;word-break:break-all;line-height:1.5}
.fr-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.fr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.fr-btn:hover{filter:brightness(1.1)}
.fr-btn:disabled{opacity:.45;cursor:not-allowed}
.fr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.fr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.fr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.fr-btn.star{background:#2b2416;color:#D29922;border:1px solid #4a3d1e}
.fr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.fr-inp:focus{outline:none;border-color:#2b6cb0}
.fr-inp::placeholder{color:#4d5566}
.fr-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.fr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.fr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.fr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.fr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.fr-toast.bad{border-color:#54262c;color:#FF8A9A}
.fr-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:fr-spin .8s linear infinite;vertical-align:-1px}
@keyframes fr-spin{to{transform:rotate(360deg)}}

/* \u6587\u7AE0\u6D41 */
.fr-art{display:flex;gap:9px;padding:11px 13px;border-top:1px solid #1d2330;cursor:pointer;align-items:flex-start}
.fr-art:first-child{border-top:none}
.fr-art:hover{background:#1A2029}
.fr-art.read .fr-art-t{color:#8B95A7}
.fr-unread{width:8px;height:8px;border-radius:50%;background:#58A6FF;flex-shrink:0;margin-top:6px}
.fr-unread.off{background:transparent;border:1px solid #2a2f3a}
.fr-art-main{flex:1;min-width:0}
.fr-art-t{font-size:12.5px;font-weight:600;line-height:1.45;word-break:break-word}
.fr-art-x{font-size:10.5px;color:#8B95A7;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fr-art-m{font-size:10px;color:#5C6678;margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.fr-star{background:transparent;border:none;font-size:14px;cursor:pointer;color:#3d4657;flex-shrink:0;padding:2px 4px}
.fr-star.on{color:#D29922}

/* \u9605\u8BFB\u89C6\u56FE */
.fr-read-h{display:flex;align-items:center;gap:8px;padding:10px 16px 4px}
.fr-read-t{font-size:15px;font-weight:700;line-height:1.5;padding:4px 16px 0;word-break:break-word}
.fr-read-m{font-size:10.5px;color:#5C6678;padding:6px 16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fr-read-c{font-size:12.5px;line-height:1.8;color:#C9D1D9;padding:12px 16px;white-space:pre-wrap;word-break:break-word}
.fr-read-l{display:block;margin:0 16px 10px;font-size:11px;color:#58A6FF;word-break:break-all;text-decoration:none}

/* \u8BA2\u9605\u6E90 */
.fr-feed{padding:11px 13px;border-top:1px solid #1d2330}
.fr-feed:first-child{border-top:none}
.fr-feed-h{display:flex;align-items:center;gap:8px}
.fr-feed-t{flex:1;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fr-feed.off .fr-feed-t{color:#8B95A7;text-decoration:line-through}
.fr-feed-m{font-size:10px;color:#5C6678;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap}

/* \u8BBE\u7F6E */
.fr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.fr-field:first-child{border-top:none}
.fr-field-l{flex:1;min-width:0}
.fr-field-l b{font-size:12.5px;display:block}
.fr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.fr-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.fr-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.fr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.fr-kv{color:#5C6678}
.fr-kv b{color:#B4B4B8;font-weight:600}
.fr-ta{width:100%;height:160px;background:#0d1017;border:1px solid #2a2f3a;border-radius:8px;color:#C9D1D9;padding:8px;font:11px/1.5 Consolas,Menlo,monospace;resize:vertical}
`;
function RadarPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("articles");
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const cacheRef = useRef2(newCache());
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadRadar(cacheRef.current);
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect2(() => {
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
  const heartbeat = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = data.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const age = Date.now() - last;
    if (age < 180 * 1e3) return { cls: "ok", text: `\u96F7\u8FBE\u5728\u7EBF \xB7 ${data.meta?.feeds ?? 0} \u6E90 \xB7 \u6865 ${data.meta?.bridge || "?"}` };
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  return /* @__PURE__ */ jsxs4("div", { className: "fr-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "fr-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "fr-logo", children: "\u{1F4E1}" }),
      /* @__PURE__ */ jsxs4("div", { className: "fr-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u8BA2\u9605\u96F7\u8FBE" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          /* @__PURE__ */ jsx4("i", { className: `fr-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "fr-tabs", children: [
        ["articles", "\u6587\u7AE0"],
        ["feeds", "\u8BA2\u9605\u6E90"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs4("button", { className: `fr-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "articles" && (data?.unreadTotal ?? 0) > 0 && /* @__PURE__ */ jsx4("span", { className: "fr-badge", children: data.unreadTotal > 99 ? "99+" : data.unreadTotal })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "fr-body", children: /* @__PURE__ */ jsxs4("div", { className: "fr-page", children: [
      loadErr && /* @__PURE__ */ jsxs4("div", { className: "fr-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "articles" && /* @__PURE__ */ jsx4(ArticleTab, { data, reload, showToast, onSendToChat }),
      tab === "feeds" && /* @__PURE__ */ jsx4(FeedsTab, { data, reload, showToast, goArticles: () => setTab("articles") }),
      tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { pluginId, data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx4("div", { className: `fr-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function FeedRadarEntry(props) {
  return /* @__PURE__ */ jsx5(RadarPanel, { ...props });
}
export {
  FeedRadarEntry as default
};
