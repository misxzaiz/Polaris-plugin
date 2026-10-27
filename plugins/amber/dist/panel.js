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
import { useCallback, useEffect as useEffect3, useRef as useRef2, useState as useState4 } from "react";

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
  sweepEnabled: false,
  keepDays: 90,
  maxItems: 0
};
var SETTING_LIMITS = {
  keepDays: [7, 3650],
  maxItems: [0, 5e3]
};
var K = {
  item: (id) => `amber.item.${id}`,
  itemPrefix: "amber.item.",
  body: (id) => `amber.body.${id}`,
  bodyPrefix: "amber.body.",
  quotePrefix: "amber.quote.",
  settings: "amber.settings",
  meta: "amber.meta",
  cmdAmberize: (n) => `amber.cmd.amberize.${n}`,
  cmdRefresh: (id) => `amber.cmd.refresh.${id}`,
  cmdPurge: (n) => `amber.cmd.purge.${n}`,
  cmdSearch: (n) => `amber.cmd.search.${n}`,
  search: (n) => `amber.search.${n}`
};
function itemIdFor(url) {
  return "b" + (0, import_sha256.sha256Hex)(String(url).trim()).slice(0, 12);
}
function quoteIdFor(itemId, text) {
  return "q" + (0, import_sha256.sha256Hex)(`${itemId}|${text}`).slice(0, 10);
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
async function loadAmber() {
  const [keys, rawMeta, rawSettings] = await Promise.all([
    kvKeys(),
    kvGet(K.meta),
    kvGet(K.settings)
  ]);
  const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix));
  const quoteKeys = keys.filter((k) => k.startsWith(K.quotePrefix));
  const [itemVals, quoteVals] = await Promise.all([
    Promise.all(itemKeys.map(async (k) => kvGet(k).catch(() => null))),
    Promise.all(quoteKeys.map(async (k) => kvGet(k).catch(() => null)))
  ]);
  const items = itemVals.filter((v) => !!v && typeof v === "object" && !!v.id);
  items.sort((a, b) => (b.sealedAt || b.createdAt || 0) - (a.sealedAt || a.createdAt || 0));
  const quotes = quoteVals.filter((v) => !!v && typeof v === "object" && !!v.qid);
  quotes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings && typeof rawSettings === "object" ? rawSettings : {} };
  return { items, quotes, meta: rawMeta && typeof rawMeta === "object" ? rawMeta : null, settings };
}
async function sealUrl(url, tags) {
  const trimmed = String(url || "").trim();
  if (!trimmed) throw new Error("URL \u4E3A\u7A7A");
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed.replace(/^\/+/, "");
  const id = itemIdFor(normalized);
  const prev = await kvGet(K.item(id)).catch(() => null);
  const item = {
    id,
    url: normalized,
    host: hostOf(normalized),
    title: prev && prev.title || "",
    byline: prev && prev.byline || "",
    publishedAt: prev && prev.publishedAt || 0,
    excerpt: prev && prev.excerpt || "",
    img: prev && prev.img || "",
    wordCount: prev && prev.wordCount || 0,
    tags: tags ? tags.split(/[,，;；\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8) : prev && prev.tags || [],
    star: prev && prev.star || false,
    read: prev && prev.read || false,
    status: "pending",
    error: "",
    sealedAt: prev && prev.sealedAt || 0,
    firstSealedAt: prev && prev.firstSealedAt || 0,
    sealCount: prev && prev.sealCount || 0,
    createdAt: prev && prev.createdAt || Date.now(),
    rev: (prev && prev.rev || 1) + 1
  };
  await kvSet(K.item(id), item);
  await kvSet(K.cmdAmberize(nonce12()), { op: "amberize", url: normalized, tags: item.tags, at: Date.now() });
}
async function reSeal(id) {
  await kvSet(K.cmdRefresh(id), { op: "refresh", id, at: Date.now() });
}
async function markItem(item, patch) {
  const upd = { ...item, ...patch, rev: (Number(item.rev) || 1) + 1 };
  await kvSet(K.item(item.id), upd);
}
async function readBody(id) {
  return await kvGet(K.body(id));
}
async function addQuote(item, itemId, text, note) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("\u6458\u5F55\u5185\u5BB9\u4E3A\u7A7A");
  const qid = quoteIdFor(itemId, trimmed);
  const existing = await kvGet(K.quotePrefix + qid).catch(() => null);
  if (existing) return false;
  const quote = {
    qid,
    itemId,
    itemTitle: item && item.title || "",
    itemHost: item && item.host || "",
    text: trimmed.slice(0, 2e3),
    note: String(note || "").trim().slice(0, 500),
    createdAt: Date.now()
  };
  await kvSet(K.quotePrefix + qid, quote);
  return true;
}
async function delQuote(qid) {
  await kvDel(K.quotePrefix + qid);
}
async function deleteItem(id) {
  const keys = await kvKeys();
  const quoteKeys = keys.filter((k) => k.startsWith(K.quotePrefix));
  const related = [];
  for (const k of quoteKeys) {
    const v = await kvGet(k).catch(() => null);
    if (v && v.itemId === id) related.push(k);
  }
  await Promise.all([kvDel(K.item(id)), kvDel(K.body(id)), ...related.map(kvDel)].map((p) => p.catch(() => {
  })));
  await kvSet(`amber.cmd.forget.${id}`, { op: "forget", id, at: Date.now() }).catch(() => {
  });
}
async function fullSearch(q, limit, waitSec = 25) {
  const n = nonce12();
  await kvSet(K.cmdSearch(n), { op: "search", q, limit, at: Date.now() });
  const t0 = Date.now();
  while (Date.now() - t0 < waitSec * 1e3) {
    await sleep(1600);
    const r = await kvGet(K.search(n)).catch(() => null);
    if (r && typeof r === "object" && (r.doneAt || r.error)) {
      await kvDel(K.search(n)).catch(() => {
      });
      return r;
    }
  }
  return null;
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function purgeAll() {
  await kvSet(K.cmdPurge(nonce12()), { op: "purge", at: Date.now() });
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
var SERVICE_ID = "amber-service";
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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function nonce12() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function hostOf(u) {
  try {
    return u ? new URL(u).host.toLowerCase() : "";
  } catch (_) {
    return "";
  }
}
function timeStr(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function timeAgo(ts) {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 0) return "\u521A\u521A";
  if (d < 60 * 1e3) return `${Math.floor(d / 1e3)} \u79D2\u524D`;
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}

// src/LibraryTab.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PAGE_SIZE = 60;
function LibraryTab({ data, reload, showToast, onSendToChat, selectedId, onConsumeSelected }) {
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [sealing, setSealing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [readingId, setReadingId] = useState("");
  const [body, setBody] = useState(null);
  const contentRef = useRef(null);
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    if (selectedId) {
      setReadingId(selectedId);
      onConsumeSelected();
    }
  }, [selectedId, onConsumeSelected]);
  const item = useMemo(
    () => data?.items.find((x) => x.id === readingId) ?? null,
    [data?.items, readingId]
  );
  useEffect(() => {
    let alive = true;
    setBody(null);
    if (!readingId || !item || item.status !== "ok") return;
    readBody(readingId).then((b) => {
      if (alive) setBody(b);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [readingId, item?.rev, item?.status]);
  useEffect(() => {
    if (item && !item.read) {
      markItem(item, { read: true }).then(reload).catch(() => {
      });
    }
  }, [readingId]);
  useEffect(() => {
    if (!readingId) return;
    const onUp = () => {
      const sel = window.getSelection();
      setHasSelection(!!sel && !sel.isCollapsed && !!contentRef.current && sel.anchorNode !== null && contentRef.current.contains(sel.anchorNode));
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, [readingId]);
  const allTags = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    for (const it of data?.items ?? []) for (const t of it.tags || []) s.add(t);
    return [...s].sort();
  }, [data?.items]);
  const list = useMemo(() => {
    let arr = data?.items ?? [];
    if (statusFilter === "unread") arr = arr.filter((a) => !a.read);
    else if (statusFilter === "starred") arr = arr.filter((a) => a.star);
    else if (statusFilter === "pending") arr = arr.filter((a) => a.status === "pending");
    else if (statusFilter === "error") arr = arr.filter((a) => a.status === "error");
    if (tagFilter) arr = arr.filter((a) => (a.tags || []).includes(tagFilter));
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter((a) => `${a.title}|${a.excerpt}|${a.url}`.toLowerCase().includes(q));
    return arr.slice(0, limit);
  }, [data?.items, statusFilter, tagFilter, query, limit]);
  const doSeal = async () => {
    if (!url.trim() || sealing) return;
    setSealing(true);
    try {
      await sealUrl(url, tags);
      await reload();
      showToast("\u5DF2\u4E0B\u53D1\u5C01\u5B58\u547D\u4EE4\uFF0C\u7A0D\u5019\u5165\u5217");
      setUrl("");
      setTags("");
    } catch (e) {
      showToast(`\u5C01\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setSealing(false);
  };
  const toggle = async (a, patch) => {
    try {
      await markItem(a, patch);
      await reload();
    } catch (e) {
      showToast(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const removeTag = async (a, tag) => {
    await toggle(a, { tags: (a.tags || []).filter((t) => t !== tag) });
  };
  const doReSeal = async (a) => {
    try {
      await reSeal(a.id);
      showToast("\u5DF2\u4E0B\u53D1\u91CD\u5C01\u5B58\u547D\u4EE4\uFF08\u5FEB\u7167\u5C06\u66F4\u65B0\uFF09");
      await reload();
    } catch (e) {
      showToast(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const doDelete = async (a) => {
    if (!window.confirm(`\u5220\u9664\u8FD9\u6761\u7425\u73C0\uFF1F\u300C${a.title || a.url}\u300D
\u5C01\u5B58\u6B63\u6587\u4E0E\u76F8\u5173\u6458\u5F55\u4F1A\u4E00\u5E76\u5220\u9664\uFF0C\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    try {
      await deleteItem(a.id);
      setReadingId("");
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const doQuote = async (a) => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text) {
      showToast("\u5148\u5728\u6B63\u6587\u91CC\u9009\u4E2D\u4E00\u6BB5\u6587\u5B57", true);
      return;
    }
    const note = window.prompt("\u5907\u6CE8\uFF08\u53EF\u9009\uFF0C\u53EF\u7559\u7A7A\uFF09\uFF1A", "") ?? "";
    try {
      const added = await addQuote(a, a.id, text, note);
      await reload();
      showToast(added ? "\u5DF2\u5B58\u4E3A\u91D1\u53E5\u6458\u5F55" : "\u8FD9\u6BB5\u8BDD\u4E4B\u524D\u5DF2\u6458\u5F55\u8FC7\uFF08\u5185\u5BB9\u7EA7\u53BB\u91CD\uFF09");
    } catch (e) {
      showToast(`\u6458\u5F55\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const sendToChat = async (a) => {
    if (!onSendToChat) {
      showToast("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u9001\u5230\u804A\u5929", true);
      return;
    }
    const parts = [`\u8BF7\u8BFB\u8FD9\u7BC7\u6211\u5C01\u5B58\u7684\u6587\u7AE0\u5E76\u7ED9\u6211\u8981\u70B9\u603B\u7ED3\uFF1A${a.title || "(\u65E0\u6807\u9898)"}`, a.url];
    if (body?.ok && body.text) parts.push(`
\u5C01\u5B58\u6B63\u6587\u8282\u9009\uFF1A
${body.text.slice(0, 3e3)}`);
    await onSendToChat(parts.join("\n"));
    showToast("\u5DF2\u53D1\u9001\u5230\u804A\u5929");
  };
  if (readingId) {
    if (!item) {
      return /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "am-read-h", children: /* @__PURE__ */ jsx("button", { className: "am-btn sm ghost", onClick: () => setReadingId(""), children: "\u2190 \u8FD4\u56DE" }) }),
        /* @__PURE__ */ jsx("div", { className: "am-empty", children: "\u8FD9\u6761\u7425\u73C0\u5DF2\u88AB\u5220\u9664\u6216\u4E0D\u5B58\u5728\u3002" })
      ] });
    }
    const a = item;
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "am-read-h", children: [
        /* @__PURE__ */ jsx("button", { className: "am-btn sm ghost", onClick: () => {
          setReadingId("");
          setBody(null);
        }, children: "\u2190 \u8FD4\u56DE" }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { className: `am-btn sm ${a.star ? "star" : "ghost"}`, onClick: () => toggle(a, { star: !a.star }), children: a.star ? "\u2605 \u5DF2\u661F\u6807" : "\u2606 \u661F\u6807" }),
        /* @__PURE__ */ jsx("button", { className: "am-btn sm ghost", onClick: () => toggle(a, { read: false }), children: "\u6807\u4E3A\u672A\u8BFB" }),
        /* @__PURE__ */ jsx("button", { className: "am-btn sm ghost", onClick: () => doReSeal(a), children: "\u21BB \u91CD\u5C01\u5B58" }),
        /* @__PURE__ */ jsx("button", { className: "am-btn sm danger", onClick: () => doDelete(a), children: "\u5220\u9664" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "am-read-t", children: a.title || "(\u65E0\u6807\u9898)" }),
      /* @__PURE__ */ jsxs("div", { className: "am-read-m", children: [
        /* @__PURE__ */ jsx("span", { children: a.host || hostOf(a.url) }),
        a.byline && /* @__PURE__ */ jsxs("span", { children: [
          "\xB7 ",
          a.byline
        ] }),
        !!a.publishedAt && /* @__PURE__ */ jsxs("span", { children: [
          "\xB7 \u53D1\u5E03\u4E8E ",
          timeStr(a.publishedAt)
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\xB7 \u7B2C ",
          a.sealCount || 1,
          " \u6B21\u5C01\u5B58 ",
          timeStr(a.sealedAt || a.createdAt),
          a.firstSealedAt && a.sealCount > 1 ? `\uFF08\u9996\u5C01 ${timeStr(a.firstSealedAt)}\uFF09` : ""
        ] }),
        !!a.wordCount && /* @__PURE__ */ jsxs("span", { children: [
          "\xB7 ",
          a.wordCount,
          " \u5B57"
        ] }),
        body?.ok && body.charset && body.charset !== "utf-8" && /* @__PURE__ */ jsxs("span", { children: [
          "\xB7 ",
          body.charset
        ] }),
        /* @__PURE__ */ jsx("a", { className: "am-read-l", style: { margin: 0, padding: 0 }, href: a.url, target: "_blank", rel: "noreferrer", children: "\u539F\u6587\u94FE\u63A5 \u2197" })
      ] }),
      !!a.tags?.length && /* @__PURE__ */ jsx("div", { className: "am-read-m", children: a.tags.map((t) => /* @__PURE__ */ jsxs("button", { className: "am-tag", style: { cursor: "pointer" }, title: "\u79FB\u9664\u6807\u7B7E", onClick: () => removeTag(a, t), children: [
        t,
        " \u2715"
      ] }, t)) }),
      a.status === "pending" && /* @__PURE__ */ jsxs("div", { className: "am-read-c", children: [
        /* @__PURE__ */ jsx("span", { className: "am-spin" }),
        " \u6B63\u5728\u5C01\u5B58\u5FEB\u7167\u2026\uFF08\u670D\u52A1\u6293\u53D6\u5E76\u62BD\u53D6\u4E2D\uFF0C\u7EA6 5\u201325 \u79D2\uFF09"
      ] }),
      a.status === "error" && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "am-err", children: [
          "\u5C01\u5B58\u5931\u8D25\uFF1A",
          a.error || "\u672A\u77E5\u9519\u8BEF"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "am-actions", style: { padding: "0 16px" }, children: /* @__PURE__ */ jsx("button", { className: "am-btn sm", onClick: () => doReSeal(a), children: "\u91CD\u8BD5\u5C01\u5B58" }) })
      ] }),
      a.status === "ok" && (body?.ok ? /* @__PURE__ */ jsx("div", { className: "am-read-c", ref: contentRef, children: body.text }) : /* @__PURE__ */ jsxs("div", { className: "am-read-c", children: [
        /* @__PURE__ */ jsx("span", { className: "am-spin" }),
        " \u6B63\u5728\u8BFB\u53D6\u5FEB\u7167\u2026"
      ] })),
      a.status === "ok" && body?.ok && /* @__PURE__ */ jsxs("div", { className: "am-actions", style: { padding: "0 16px" }, children: [
        /* @__PURE__ */ jsx("button", { className: "am-btn sm amber", disabled: !hasSelection, onClick: () => doQuote(a), children: "\u2702 \u6458\u5F55\u9009\u4E2D\u6587\u5B57" }),
        /* @__PURE__ */ jsx("button", { className: "am-btn sm ghost", onClick: () => sendToChat(a), children: "\u53D1\u7ED9 AI \u603B\u7ED3" })
      ] }),
      (data?.quotes ?? []).filter((q) => q.itemId === a.id).length > 0 && /* @__PURE__ */ jsxs("div", { style: { padding: "4px 0" }, children: [
        /* @__PURE__ */ jsxs("div", { className: "am-sec", children: [
          /* @__PURE__ */ jsx("i", { className: "am-bar" }),
          "\u672C\u6761\u6458\u5F55"
        ] }),
        (data?.quotes ?? []).filter((q) => q.itemId === a.id).map((q) => /* @__PURE__ */ jsxs("div", { className: "am-quote-b", children: [
          "\u300C",
          q.text,
          "\u300D",
          q.note && /* @__PURE__ */ jsxs("div", { style: { color: "#8B95A7", marginTop: 4 }, children: [
            "\u2014\u2014 ",
            q.note
          ] })
        ] }, q.qid))
      ] })
    ] });
  }
  const total = data?.items.length ?? 0;
  const pendingCount = data?.items.filter((a) => a.status === "pending").length ?? 0;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "am-bar" }),
      "\u5C01\u5B58\u4E00\u4E2A\u7F51\u9875",
      /* @__PURE__ */ jsx("span", { className: "am-hint", children: "\u6293\u53D6\u7531\u540E\u53F0\u670D\u52A1\u539F\u751F\u6267\u884C\uFF08\u65E0\u8DE8\u57DF\uFF09" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "am-card", children: /* @__PURE__ */ jsxs("div", { className: "am-card-b", style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "am-inp",
          style: { flex: 3, minWidth: 160 },
          placeholder: "\u7C98\u8D34 URL\uFF0C\u5982 https://example.com/post/1\u2026",
          value: url,
          onChange: (e) => setUrl(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") doSeal();
          }
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "am-inp",
          style: { flex: 1, minWidth: 90 },
          placeholder: "\u6807\u7B7E\uFF08\u53EF\u9009\uFF09",
          value: tags,
          onChange: (e) => setTags(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") doSeal();
          }
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "am-btn amber", disabled: sealing || !url.trim(), onClick: doSeal, children: sealing ? /* @__PURE__ */ jsx("span", { className: "am-spin" }) : "\u5C01\u5B58" })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "am-bar" }),
      "\u6536\u85CF",
      /* @__PURE__ */ jsxs("span", { className: "am-hint", children: [
        "\u5171 ",
        total,
        pendingCount ? ` \xB7 ${pendingCount} \u6761\u5C01\u5B58\u4E2D` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "am-card", children: /* @__PURE__ */ jsxs("div", { className: "am-card-b", style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "am-inp",
          style: { flex: 2, minWidth: 120 },
          placeholder: "\u641C\u6807\u9898/\u6458\u8981/URL\u2026",
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
          className: "am-sel",
          style: { flex: 1, minWidth: 88 },
          value: statusFilter,
          onChange: (e) => {
            setStatusFilter(e.target.value);
            setLimit(PAGE_SIZE);
          },
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8" }),
            /* @__PURE__ */ jsx("option", { value: "unread", children: "\u672A\u8BFB" }),
            /* @__PURE__ */ jsx("option", { value: "starred", children: "\u661F\u6807" }),
            /* @__PURE__ */ jsx("option", { value: "pending", children: "\u5C01\u5B58\u4E2D" }),
            /* @__PURE__ */ jsx("option", { value: "error", children: "\u5931\u8D25" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs(
        "select",
        {
          className: "am-sel",
          style: { flex: 1, minWidth: 88 },
          value: tagFilter,
          onChange: (e) => {
            setTagFilter(e.target.value);
            setLimit(PAGE_SIZE);
          },
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8\u6807\u7B7E" }),
            allTags.map((t) => /* @__PURE__ */ jsx("option", { value: t, children: t }, t))
          ]
        }
      )
    ] }) }),
    list.length === 0 ? /* @__PURE__ */ jsx("div", { className: "am-empty", children: total === 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "\u8FD8\u6CA1\u6709\u6536\u85CF\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5728\u4E0A\u9762\u8D34\u4E00\u4E2A URL \u70B9\u300C\u5C01\u5B58\u300D\uFF0C\u6216\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4",
      /* @__PURE__ */ jsx("br", {}),
      "\u300C\u628A https://\u2026 \u5B58\u8FDB\u7425\u73C0\u300D\u3002"
    ] }) : /* @__PURE__ */ jsx(Fragment, { children: "\u5F53\u524D\u8FC7\u6EE4\u4E0B\u6CA1\u6709\u6761\u76EE\u3002" }) }) : /* @__PURE__ */ jsxs("div", { className: "am-card", style: { padding: 0 }, children: [
      list.map((a) => /* @__PURE__ */ jsxs("div", { className: `am-art ${a.read ? "read" : ""}`, onClick: () => setReadingId(a.id), children: [
        /* @__PURE__ */ jsx("i", { className: `am-unread ${a.read ? "off" : ""}` }),
        /* @__PURE__ */ jsxs("div", { className: "am-art-main", children: [
          /* @__PURE__ */ jsxs("div", { className: "am-art-t", children: [
            a.status === "pending" && /* @__PURE__ */ jsx("span", { className: "am-spin", style: { marginRight: 5 } }),
            a.status === "error" && /* @__PURE__ */ jsx("span", { style: { color: "#F85149", marginRight: 5 }, children: "\u26A0" }),
            a.title || a.url
          ] }),
          a.excerpt && /* @__PURE__ */ jsx("div", { className: "am-art-x", children: a.excerpt }),
          /* @__PURE__ */ jsxs("div", { className: "am-art-m", children: [
            /* @__PURE__ */ jsx("span", { children: a.host || hostOf(a.url) }),
            /* @__PURE__ */ jsx("span", { children: "\xB7" }),
            /* @__PURE__ */ jsx("span", { children: timeAgo(a.sealedAt || a.createdAt) }),
            !!a.wordCount && /* @__PURE__ */ jsxs("span", { children: [
              "\xB7 ",
              a.wordCount,
              " \u5B57"
            ] }),
            (a.tags || []).slice(0, 3).map((t) => /* @__PURE__ */ jsx("span", { className: "am-tag", children: t }, t)),
            a.star && /* @__PURE__ */ jsx("span", { children: "\xB7 \u2605" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { className: `am-star ${a.star ? "on" : ""}`, title: "\u661F\u6807", onClick: (e) => {
          e.stopPropagation();
          toggle(a, { star: !a.star });
        }, children: a.star ? "\u2605" : "\u2606" })
      ] }, a.id)),
      total > list.length && /* @__PURE__ */ jsx("div", { style: { padding: "10px 0", textAlign: "center" }, children: /* @__PURE__ */ jsxs("button", { className: "am-btn sm ghost", onClick: () => setLimit(limit + PAGE_SIZE), children: [
        "\u52A0\u8F7D\u66F4\u591A\uFF08\u8FD8\u6709 ",
        total - list.length,
        " \u6761\uFF09"
      ] }) })
    ] })
  ] });
}

// src/SearchTab.tsx
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function SearchTab({ data, reload, showToast, openItem }) {
  const [q, setQ] = useState2("");
  const [searching, setSearching] = useState2(false);
  const [result, setResult] = useState2(null);
  const localHits = useMemo2(() => {
    const kw = q.trim().toLowerCase();
    if (!kw || kw.length < 2) return [];
    return (data?.items ?? []).filter((a) => `${a.title}|${a.excerpt}`.toLowerCase().includes(kw)).slice(0, 8);
  }, [data?.items, q]);
  const corpus = data?.meta?.items ?? data?.items.filter((a) => a.status === "ok").length ?? 0;
  const doSearch = async () => {
    const query = q.trim();
    if (!query || searching) return;
    setSearching(true);
    setResult(null);
    try {
      const r = await fullSearch(query, 15, 30);
      if (!r) {
        showToast("\u68C0\u7D22\u8D85\u65F6\uFF08\u8BED\u6599\u5927\u65F6\u9996\u68C0\u504F\u6162\uFF0C\u7A0D\u540E\u91CD\u8BD5\uFF09", true);
      } else if (r.error) {
        showToast(`\u68C0\u7D22\u5931\u8D25\uFF1A${r.error}`, true);
      } else {
        setResult({ q: query, total: r.total ?? 0, hits: r.hits ?? [] });
      }
    } catch (e) {
      showToast(`\u68C0\u7D22\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setSearching(false);
    await reload();
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "am-bar" }),
      "\u5168\u6587\u68C0\u7D22",
      /* @__PURE__ */ jsxs2("span", { className: "am-hint", children: [
        "\u8986\u76D6 ",
        corpus,
        " \u7BC7\u5C01\u5B58\u6B63\u6587\uFF08BM25-lite\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "am-card", children: /* @__PURE__ */ jsxs2("div", { className: "am-card-b", style: { display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "am-inp",
          style: { flex: 1 },
          placeholder: "\u5728\u5C01\u5B58\u6B63\u6587\u91CC\u627E\u2026\uFF08\u652F\u6301\u4E2D\u82F1\u6587\uFF09",
          value: q,
          onChange: (e) => setQ(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") doSearch();
          }
        }
      ),
      /* @__PURE__ */ jsx2("button", { className: "am-btn amber", disabled: searching || !q.trim(), onClick: doSearch, children: searching ? /* @__PURE__ */ jsx2("span", { className: "am-spin" }) : "\u68C0\u7D22" })
    ] }) }),
    searching && /* @__PURE__ */ jsx2("div", { className: "am-card", children: /* @__PURE__ */ jsxs2("div", { className: "am-card-b am-sub", children: [
      /* @__PURE__ */ jsx2("span", { className: "am-spin" }),
      " \u670D\u52A1\u7AEF\u68C0\u7D22\u4E2D\uFF08\u6BCF\u6B21\u7EA6 2\u201315 \u79D2\uFF0C\u89C6\u8BED\u6599\u89C4\u6A21\uFF09\u2026"
    ] }) }),
    localHits.length > 0 && !result && /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { className: "am-sec", children: [
        /* @__PURE__ */ jsx2("i", { className: "am-bar" }),
        "\u6807\u9898/\u6458\u8981\u5FEB\u901F\u5339\u914D"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "am-card", style: { padding: 0 }, children: localHits.map((a) => /* @__PURE__ */ jsxs2("div", { className: "am-hit", onClick: () => openItem(a.id), children: [
        /* @__PURE__ */ jsx2("div", { className: "am-art-t", style: { fontSize: 12 }, children: a.title || a.url }),
        a.excerpt && /* @__PURE__ */ jsxs2("div", { className: "am-hit-s", children: [
          a.excerpt.slice(0, 120),
          "\u2026"
        ] })
      ] }, a.id)) })
    ] }),
    result && /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { className: "am-sec", children: [
        /* @__PURE__ */ jsx2("i", { className: "am-bar" }),
        "\u300C",
        result.q,
        "\u300D",
        /* @__PURE__ */ jsxs2("span", { className: "am-hint", children: [
          "\u547D\u4E2D ",
          result.hits.length,
          " / \u8BED\u6599 ",
          result.total,
          " \u7BC7"
        ] })
      ] }),
      result.hits.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "am-empty", children: [
        "\u6CA1\u6709\u547D\u4E2D\u3002",
        /* @__PURE__ */ jsx2("br", {}),
        "\u6362\u4E2A\u8BF4\u6CD5\uFF0C\u6216\u786E\u8BA4\u8FD9\u7BC7\u771F\u7684\u5C01\u5B58\u8FC7\uFF08\u68C0\u7D22\u53EA\u8986\u76D6\u5C01\u5B58\u6B63\u6587\uFF09\u3002"
      ] }) : /* @__PURE__ */ jsx2("div", { className: "am-card", style: { padding: 0 }, children: result.hits.map((h, i) => /* @__PURE__ */ jsxs2("div", { className: "am-hit", onClick: () => openItem(h.id), children: [
        /* @__PURE__ */ jsxs2("div", { className: "am-art-t", style: { fontSize: 12 }, children: [
          i + 1,
          ". ",
          h.title || h.id
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "am-hit-s", children: h.snippet }),
        /* @__PURE__ */ jsxs2("div", { className: "am-art-m", children: [
          /* @__PURE__ */ jsx2("span", { children: h.host }),
          /* @__PURE__ */ jsxs2("span", { children: [
            "\xB7 \u76F8\u5173\u5EA6 ",
            h.score
          ] })
        ] })
      ] }, h.id)) })
    ] }),
    !result && !searching && localHits.length === 0 && /* @__PURE__ */ jsxs2("div", { className: "am-empty", children: [
      "\u68C0\u7D22\u8986\u76D6**\u5C01\u5B58\u6B63\u6587\u7684\u5168\u90E8\u6587\u5B57**\uFF08\u4E0D\u53EA\u662F\u6807\u9898\uFF09\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u4E5F\u53EF\u4EE5\u5728\u804A\u5929\u91CC\u95EE AI\uFF1A\u300C\u6211\u6536\u85CF\u7684\u5185\u5BB9\u91CC\u6709\u6CA1\u6709\u8BB2 XX \u7684\uFF1F\u300D\uFF08amber_search\uFF09"
    ] })
  ] });
}

// src/QuotesTab.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function QuotesTab({ data, reload, showToast, openItem }) {
  const quotes = data?.quotes ?? [];
  const itemMap = new Map((data?.items ?? []).map((a) => [a.id, a]));
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("\u5DF2\u590D\u5236");
    } catch (_) {
      window.prompt("\u624B\u52A8\u590D\u5236\uFF08\u5168\u9009\uFF09\uFF1A", text);
    }
  };
  const remove = async (qid) => {
    if (!window.confirm("\u5220\u9664\u8FD9\u6761\u6458\u5F55\uFF1F")) return;
    try {
      await delQuote(qid);
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "am-bar" }),
      "\u91D1\u53E5\u6458\u5F55",
      /* @__PURE__ */ jsxs3("span", { className: "am-hint", children: [
        "\u5171 ",
        quotes.length,
        " \u6761"
      ] })
    ] }),
    quotes.length === 0 ? /* @__PURE__ */ jsxs3("div", { className: "am-empty", children: [
      "\u8FD8\u6CA1\u6709\u6458\u5F55\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u6253\u5F00\u4EFB\u610F\u4E00\u6761\u7425\u73C0\uFF0C\u9009\u4E2D\u4E00\u6BB5\u6B63\u6587\u70B9\u300C\u2702 \u6458\u5F55\u9009\u4E2D\u6587\u5B57\u300D\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\u804A\u5929\u91CC\u4E5F\u53EF\u4EE5\u8BA9 AI \u7528 amber_quote \u5E2E\u4F60\u6458\u3002"
    ] }) : /* @__PURE__ */ jsx3("div", { className: "am-card", style: { padding: 0 }, children: quotes.map((q) => {
      const item = itemMap.get(q.itemId);
      return /* @__PURE__ */ jsxs3("div", { className: "am-art", style: { cursor: "default" }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "am-art-main", children: [
          /* @__PURE__ */ jsxs3("div", { style: { fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }, children: [
            "\u300C",
            q.text,
            "\u300D"
          ] }),
          q.note && /* @__PURE__ */ jsxs3("div", { className: "am-sub", style: { marginTop: 4 }, children: [
            "\u2014\u2014 ",
            q.note
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "am-art-m", children: [
            /* @__PURE__ */ jsxs3("span", { style: { cursor: "pointer", color: "#58A6FF" }, onClick: () => openItem(q.itemId), children: [
              q.itemTitle || item?.title || q.itemHost || q.itemId,
              " \u2197"
            ] }),
            /* @__PURE__ */ jsx3("span", { children: "\xB7" }),
            /* @__PURE__ */ jsx3("span", { children: timeAgo(q.createdAt) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "am-btn sm ghost", onClick: () => copy(q.text), children: "\u590D\u5236" }),
          /* @__PURE__ */ jsx3("button", { className: "am-btn sm danger", onClick: () => remove(q.qid), children: "\u5220" })
        ] })
      ] }, q.qid);
    }) })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ pluginId, data, reload, showToast }) {
  const [status, setStatus] = useState3(null);
  const [statusErr, setStatusErr] = useState3("");
  const [busy, setBusy] = useState3("");
  const [draft, setDraft] = useState3(data?.settings ?? null);
  useEffect2(() => {
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
  useEffect2(() => {
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
        sweepEnabled: draft.sweepEnabled === true,
        keepDays: clamp("keepDays", draft.keepDays),
        maxItems: clamp("maxItems", draft.maxItems)
      });
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 60 \u79D2\u5185\u751F\u6548\uFF09");
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  };
  const purge = async () => {
    if (!window.confirm("\u6E05\u7A7A\u5168\u90E8\u7425\u73C0\u6761\u76EE\u3001\u6B63\u6587\u4E0E\u6458\u5F55\uFF08\u8BBE\u7F6E\u4FDD\u7559\uFF09\u3002\u786E\u5B9A\uFF1F")) return;
    setBusy("purge");
    try {
      await purgeAll();
      await reload();
      showToast("\u6E05\u7A7A\u547D\u4EE4\u5DF2\u4E0B\u53D1\uFF08\u670D\u52A1\u5728\u4E0B\u4E00\u4E2A\u5468\u671F\u6267\u884C\uFF09");
    } catch (e) {
      showToast(`\u6E05\u7406\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const clearAll = async () => {
    if (!window.confirm("\u5220\u9664\u7425\u73C0\u63D2\u4EF6\u7684\u5168\u90E8\u6570\u636E\uFF08\u6761\u76EE/\u6B63\u6587/\u6458\u5F55/\u8BBE\u7F6E/\u4FE1\u7BB1\uFF09\uFF1F\u4E0D\u53EF\u6062\u590D\u3002")) return;
    setBusy("clearAll");
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("amber."));
      await Promise.all(keys.map((k) => kvDel(k)));
      await reload();
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u7425\u73C0\u6570\u636E");
    } catch (e) {
      showToast(`\u6E05\u7406\u5931\u8D25\uFF1A${e.message}`, true);
    }
    setBusy("");
  };
  const stateCls = (s) => s === "running" ? "#3FB950" : s === "error" ? "#F85149" : s === "starting" ? "#D29922" : "#8B95A7";
  const meta = data?.meta;
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "am-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "am-card", children: /* @__PURE__ */ jsxs4("div", { className: "am-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "am-row", children: [
        /* @__PURE__ */ jsx4("i", { className: "am-dot", style: { background: stateCls(status?.state) } }),
        /* @__PURE__ */ jsx4("b", { style: { flex: 1 }, children: status ? {
          starting: "\u542F\u52A8\u4E2D",
          running: "\u8FD0\u884C\u4E2D",
          stopping: "\u505C\u6B62\u4E2D",
          stopped: "\u5DF2\u505C\u6B62",
          error: "\u5F02\u5E38"
        }[status.state] || status.state : statusErr ? "\u72B6\u6001\u672A\u77E5" : "\u672A\u6CE8\u518C\uFF08\u63D2\u4EF6\u521A\u88C5\uFF1F\u7A0D\u5019\u5237\u65B0\uFF09" }),
        busy && busy !== "purge" && busy !== "clearAll" && /* @__PURE__ */ jsx4("span", { className: "am-spin" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "am-state", children: [
        status?.pid && /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "PID ",
          /* @__PURE__ */ jsx4("b", { children: status.pid })
        ] }),
        status?.port ? /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u7AEF\u53E3 ",
          /* @__PURE__ */ jsx4("b", { children: status.port })
        ] }) : null,
        status?.uptime ? /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u5DF2\u8FD0\u884C ",
          /* @__PURE__ */ jsxs4("b", { children: [
            Math.floor(status.uptime / 60),
            " \u5206\u949F"
          ] })
        ] }) : null,
        !!status?.restartCount && /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u91CD\u542F ",
          /* @__PURE__ */ jsx4("b", { children: status.restartCount }),
          " \u6B21"
        ] })
      ] }),
      status?.lastError && /* @__PURE__ */ jsx4("div", { className: "am-sub", style: { color: "#F85149", marginTop: 4 }, children: status.lastError }),
      /* @__PURE__ */ jsx4("div", { className: "am-state", children: meta ? /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
        "\u5FC3\u8DF3 ",
        /* @__PURE__ */ jsx4("b", { children: timeAgo(meta.lastTickAt) }),
        " \xB7 \u6865 ",
        /* @__PURE__ */ jsx4("b", { children: meta.bridge }),
        " \xB7 v",
        meta.version
      ] }) : /* @__PURE__ */ jsx4("span", { className: "am-kv", children: "\u5C1A\u65E0\u5FC3\u8DF3\uFF08\u670D\u52A1\u672A\u8FD0\u884C\u65F6\u6B63\u5E38\uFF09" }) }),
      /* @__PURE__ */ jsxs4("div", { className: "am-actions", children: [
        /* @__PURE__ */ jsx4("button", { className: "am-btn sm", disabled: busy !== "" || status?.state === "running" || status?.state === "starting", onClick: () => doService("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { className: "am-btn sm ghost", disabled: busy !== "" || !status || status.state !== "running" && status.state !== "error" && status.state !== "starting", onClick: () => doService("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx4("button", { className: "am-btn sm ghost", disabled: busy !== "" || !status || status.state !== "running" && status.state !== "starting" && status.state !== "error", onClick: () => doService("stop"), children: "\u505C\u6B62" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "am-sub", style: { marginTop: 8 }, children: "\u6293\u53D6\u5168\u90E8\u7531\u672C\u670D\u52A1\u5728\u540E\u53F0\u539F\u751F\u6267\u884C\uFF08\u65E0\u6D4F\u89C8\u5668\u8DE8\u57DF\u9650\u5236\uFF09\uFF1B\u684C\u9762\u4E0E\u624B\u673A Web \u9762\u677F\u901A\u8FC7 cap.kv \u770B\u5230\u540C\u4E00\u4EFD\u6570\u636E\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "am-bar" }),
      "\u6E05\u626B\u7B56\u7565"
    ] }),
    draft && /* @__PURE__ */ jsx4("div", { className: "am-card", children: /* @__PURE__ */ jsxs4("div", { className: "am-card-b", style: { padding: 0 }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "am-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "am-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u81EA\u52A8\u6E05\u626B" }),
          /* @__PURE__ */ jsx4("small", { children: "\u6536\u85CF\u5E93\u8BED\u4E49\u662F\u6C38\u4E45\u5C01\u5B58\u2014\u2014\u9ED8\u8BA4\u5173\u3002\u5F00\u542F\u540E\u6309\u4E0B\u65B9\u89C4\u5219\u6E05\u7406\u3002" })
        ] }),
        /* @__PURE__ */ jsx4("button", { className: `am-btn sm ${draft.sweepEnabled ? "" : "ghost"}`, onClick: () => setDraft({ ...draft, sweepEnabled: !draft.sweepEnabled }), children: draft.sweepEnabled ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "am-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "am-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u4FDD\u7559\u5929\u6570" }),
          /* @__PURE__ */ jsx4("small", { children: "\u975E\u661F\u6807\u6761\u76EE\u8D85\u8FC7\u8BE5\u5929\u6570\u88AB\u6E05\u7406\uFF08\u5929\uFF0C7\u20133650\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "am-num",
            type: "number",
            min: SETTING_LIMITS.keepDays[0],
            max: SETTING_LIMITS.keepDays[1],
            value: draft.keepDays,
            disabled: !draft.sweepEnabled,
            onChange: (e) => setDraft({ ...draft, keepDays: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "am-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "am-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u6761\u6570\u4E0A\u9650" }),
          /* @__PURE__ */ jsx4("small", { children: "\u8D85\u51FA\u540E\u6700\u65E7\u7684\u88AB\u6E05\u7406\uFF1B0 = \u4E0D\u9650\uFF08\u6761\uFF0C0\u20135000\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "am-num",
            type: "number",
            min: SETTING_LIMITS.maxItems[0],
            max: SETTING_LIMITS.maxItems[1],
            value: draft.maxItems,
            disabled: !draft.sweepEnabled,
            onChange: (e) => setDraft({ ...draft, maxItems: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "am-sub", style: { padding: "8px 13px" }, children: "\u661F\u6807\u6761\u76EE\u6C38\u4E0D\u81EA\u52A8\u6E05\u7406\uFF0C\u4E5F\u4E0D\u5360\u6761\u6570\u540D\u989D\u3002" }),
      /* @__PURE__ */ jsx4("div", { className: "am-actions", style: { padding: "0 13px 10px" }, children: /* @__PURE__ */ jsx4("button", { className: "am-btn sm", onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "am-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "am-card", children: /* @__PURE__ */ jsxs4("div", { className: "am-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "am-state", style: { marginTop: 0 }, children: [
        /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\u7425\u73C0 ",
          /* @__PURE__ */ jsx4("b", { children: data?.items.length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u672A\u8BFB ",
          /* @__PURE__ */ jsx4("b", { children: data?.items.filter((a) => !a.read).length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u661F\u6807 ",
          /* @__PURE__ */ jsx4("b", { children: data?.items.filter((a) => a.star).length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u6458\u5F55 ",
          /* @__PURE__ */ jsx4("b", { children: data?.quotes.length ?? 0 })
        ] }),
        /* @__PURE__ */ jsxs4("span", { className: "am-kv", children: [
          "\xB7 \u5B58\u50A8 ",
          /* @__PURE__ */ jsx4("b", { children: "cap.kv\uFF08amber.* \u952E\u7A7A\u95F4\uFF09" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "am-actions", children: [
        /* @__PURE__ */ jsx4("button", { className: "am-btn sm ghost", disabled: !!busy, onClick: purge, children: busy === "purge" ? /* @__PURE__ */ jsx4("span", { className: "am-spin" }) : "\u6E05\u7A7A\u5168\u90E8\u7425\u73C0\uFF08\u4FDD\u7559\u8BBE\u7F6E\uFF09" }),
        /* @__PURE__ */ jsx4("button", { className: "am-btn sm danger", disabled: !!busy, onClick: clearAll, children: busy === "clearAll" ? /* @__PURE__ */ jsx4("span", { className: "am-spin" }) : "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "am-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "am-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "am-card", children: /* @__PURE__ */ jsxs4("div", { className: "am-card-b am-sub", children: [
      "\u7425\u73C0 amber v0.1.0 \u2014\u2014 \u628A\u7F51\u9875\u5C01\u8FDB\u7425\u73C0\uFF1A\u6C38\u4E45\u53EF\u8BFB\u5FEB\u7167 + \u5168\u6587\u68C0\u7D22 + \u91D1\u53E5\u6458\u5F55\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u6D4F\u89C8\u5668\u6709\u540C\u6E90\u7B56\u7565\uFF0C\u672C\u63D2\u4EF6\u628A\u6293\u53D6\u4E0B\u6C89\u5230\u540E\u53F0\u670D\u52A1\u539F\u751F\u6267\u884C\uFF0C\u5929\u7136\u65E0\u8DE8\u57DF\u95EE\u9898\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5B57\u7B26\u96C6\u63A2\u6D4B\uFF08BOM/\u54CD\u5E94\u5934/meta\uFF09\uFF1AGBK \u7B49\u5386\u53F2\u7F16\u7801\u9875\u9762\u4E5F\u80FD\u6B63\u786E\u5C01\u5B58\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u540C\u4E00 URL \u91CD\u590D\u5C01\u5B58 = \u5FEB\u7167\u66F4\u65B0 + \u5C01\u5B58\u6B21\u6570\u5C42\u79EF\uFF0C\u9605\u8BFB\u72B6\u6001\u4E0E\u6807\u7B7E\u4FDD\u7559\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5C01\u5B58\u5931\u8D25\u6C38\u4E0D\u6467\u6BC1\u65E7\u5FEB\u7167\u2014\u2014\u5DF2\u5C01\u5B58\u7684\u7425\u73C0\u662F\u4F60\u6C38\u4E45\u9057\u4EA7\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5728\u804A\u5929\u91CC\u53EF\u76F4\u63A5\u8BA9 AI \u4EE3\u4F60\u64CD\u4F5C\uFF08amber_save / amber_search / amber_read / amber_quote\u2026\uFF09\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.am-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.am-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.am-body{flex:1;overflow-y:auto;padding:0 0 24px}
.am-body::-webkit-scrollbar{width:9px;height:9px}
.am-body::-webkit-scrollbar-track{background:transparent}
.am-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.am-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.am-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.am-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C77B3F,#E8B34B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.am-tt{flex:1;min-width:0}
.am-tt b{font-size:15px;display:block}
.am-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.am-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.am-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.am-dot.stale{background:#D29922}
.am-dot.down{background:#F85149}
.am-tabs{display:flex;gap:4px}
.am-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.am-tab:hover{color:#E6EAF2}
.am-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.am-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.am-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.am-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.am-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#C77B3F,#E8B34B);flex-shrink:0}
.am-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.am-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.am-card-b{padding:11px 13px}
.am-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.am-url{font-size:10.5px;color:#5C6678;word-break:break-all;line-height:1.5}
.am-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#C77B3F;white-space:nowrap}
.am-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.am-btn:hover{filter:brightness(1.1)}
.am-btn:disabled{opacity:.45;cursor:not-allowed}
.am-btn.amber{background:linear-gradient(135deg,#A05A28,#C77B3F)}
.am-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.am-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.am-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.am-btn.star{background:#2b2416;color:#D29922;border:1px solid #4a3d1e}
.am-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.am-inp:focus{outline:none;border-color:#C77B3F}
.am-inp::placeholder{color:#4d5566}
.am-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.am-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.am-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.am-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.am-toast.bad{border-color:#54262c;color:#FF8A9A}
.am-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#E8B34B;border-radius:50%;animation:am-spin .8s linear infinite;vertical-align:-1px}
@keyframes am-spin{to{transform:rotate(360deg)}}

/* \u6761\u76EE\u6D41 */
.am-art{display:flex;gap:9px;padding:11px 13px;border-top:1px solid #1d2330;cursor:pointer;align-items:flex-start}
.am-art:first-child{border-top:none}
.am-art:hover{background:#1A2029}
.am-art.read .am-art-t{color:#8B95A7}
.am-unread{width:8px;height:8px;border-radius:50%;background:#E8B34B;flex-shrink:0;margin-top:6px}
.am-unread.off{background:transparent;border:1px solid #2a2f3a}
.am-art-main{flex:1;min-width:0}
.am-art-t{font-size:12.5px;font-weight:600;line-height:1.45;word-break:break-word}
.am-art-x{font-size:10.5px;color:#8B95A7;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.am-art-m{font-size:10px;color:#5C6678;margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.am-star{background:transparent;border:none;font-size:14px;cursor:pointer;color:#3d4657;flex-shrink:0;padding:2px 4px}
.am-star.on{color:#D29922}

/* \u9605\u8BFB\u89C6\u56FE */
.am-read-h{display:flex;align-items:center;gap:8px;padding:10px 16px 4px;flex-wrap:wrap}
.am-read-t{font-size:15px;font-weight:700;line-height:1.5;padding:4px 16px 0;word-break:break-word}
.am-read-m{font-size:10.5px;color:#5C6678;padding:6px 16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.am-read-c{font-size:12.5px;line-height:1.8;color:#C9D1D9;padding:12px 16px;white-space:pre-wrap;word-break:break-word}
.am-read-c ::selection,.am-read-c selection{background:rgba(199,123,63,.45)}
.am-read-l{display:block;margin:0 16px 10px;font-size:11px;color:#58A6FF;word-break:break-all;text-decoration:none}
.am-quote-b{margin:0 16px 10px;border:1px solid #2a2f3a;border-left:3px solid #C77B3F;border-radius:8px;background:#12151c;padding:8px 11px;font-size:11.5px;color:#C9D1D9;line-height:1.6;white-space:pre-wrap}

/* \u68C0\u7D22 */
.am-hit{padding:10px 13px;border-top:1px solid #1d2330;cursor:pointer}
.am-hit:first-child{border-top:none}
.am-hit:hover{background:#1A2029}
.am-hit-s{font-size:11px;color:#8B95A7;margin-top:4px;line-height:1.6;word-break:break-word}

/* \u8BBE\u7F6E */
.am-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.am-field:first-child{border-top:none}
.am-field-l{flex:1;min-width:0}
.am-field-l b{font-size:12.5px;display:block}
.am-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.am-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.am-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.am-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.am-kv{color:#5C6678}
.am-kv b{color:#B4B4B8;font-weight:600}
`;
function AmberPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("library");
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const [selectedId, setSelectedId] = useState4("");
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadAmber();
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect3(() => {
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
  const openItem = useCallback((id) => {
    setSelectedId(id);
    setTab("library");
  }, []);
  const heartbeat = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = data.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const age = Date.now() - last;
    if (age < 180 * 1e3) return { cls: "ok", text: `\u670D\u52A1\u5728\u7EBF \xB7 ${data.meta?.items ?? data.items.length} \u7425\u73C0 \xB7 \u6865 ${data.meta?.bridge || "?"}` };
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  const unread = data?.items.filter((x) => !x.read).length ?? 0;
  return /* @__PURE__ */ jsxs5("div", { className: "am-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "am-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "am-logo", children: "\u{1F7E1}" }),
      /* @__PURE__ */ jsxs5("div", { className: "am-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u7425\u73C0 \xB7 \u7F51\u9875\u5C01\u85CF\u9986" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `am-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "am-tabs", children: [
        ["library", "\u6536\u85CF"],
        ["search", "\u68C0\u7D22"],
        ["quotes", "\u6458\u5F55"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `am-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "library" && unread > 0 && /* @__PURE__ */ jsx5("span", { className: "am-badge", children: unread > 99 ? "99+" : unread })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "am-body", children: /* @__PURE__ */ jsxs5("div", { className: "am-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "am-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "library" && /* @__PURE__ */ jsx5(
        LibraryTab,
        {
          data,
          reload,
          showToast,
          onSendToChat,
          selectedId,
          onConsumeSelected: () => setSelectedId("")
        }
      ),
      tab === "search" && /* @__PURE__ */ jsx5(SearchTab, { data, reload, showToast, openItem }),
      tab === "quotes" && /* @__PURE__ */ jsx5(QuotesTab, { data, reload, showToast, openItem }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { pluginId, data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `am-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function AmberEntry(props) {
  return /* @__PURE__ */ jsx6(AmberPanel, { ...props });
}
export {
  AmberEntry as default
};
