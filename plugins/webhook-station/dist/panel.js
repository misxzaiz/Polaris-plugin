var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
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

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    function randomHex(nBytes) {
      const g = globalThis.crypto;
      if (g && typeof g.getRandomValues === "function") {
        const b = new Uint8Array(nBytes);
        g.getRandomValues(b);
        let s = "";
        for (const x of b) s += x.toString(16).padStart(2, "0");
        return s;
      }
      return __require("crypto").randomBytes(nBytes).toString("hex");
    }
    var CHUNK_SIZE = 20;
    var KV_PREVIEW_CAP = 10 * 1024;
    var REQ_BODY_CAP = 10 * 1024 * 1024;
    var FILE_BODY_DEFAULT_KB = 256;
    var FILE_BODY_MAX_KB = 1024;
    var MAX_BUCKETS = 20;
    var MAX_PER_BUCKET_HARD = 500;
    var PATH_CAP = 2048;
    var HEADER_VALUE_CAP = 8 * 1024;
    var HEADER_COUNT_CAP = 60;
    var RESP_BODY_CAP = 10 * 1024 * 1024;
    var FORWARD_TIMEOUT_MS = 15 * 1e3;
    var HOP_BY_HOP = /* @__PURE__ */ new Set([
      "host",
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
      "content-length"
    ]);
    var TEXT_CONTENT_RE = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|form-urlencoded|yaml|toml|csv|graphql|soap|rss|atom))/i;
    function newId() {
      return `${Date.now().toString(36)}-${randomHex(5)}`;
    }
    function newSecret() {
      return randomHex(6);
    }
    function isValidSecret(s) {
      return typeof s === "string" && /^[0-9a-f]{12}$/.test(s);
    }
    function isValidBucketId(s) {
      return typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(s);
    }
    function sanitizeName(s, fallback) {
      const t = String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim().slice(0, 30);
      return t || fallback;
    }
    function validateForwardUrl2(url) {
      const t = String(url == null ? "" : url).trim();
      if (!t) return { ok: true, url: "" };
      let u;
      try {
        u = new URL(t);
      } catch (_) {
        return { ok: false, error: "\u4E0D\u662F\u5408\u6CD5 URL" };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: `\u4EC5\u652F\u6301 http/https\uFF08\u6536\u5230 ${u.protocol}\uFF09` };
      }
      if (!u.hostname) return { ok: false, error: "\u7F3A\u5C11\u4E3B\u673A\u540D" };
      return { ok: true, url: u.toString() };
    }
    function normalizeBucket(b) {
      if (!b || typeof b !== "object") return null;
      if (!isValidBucketId(b.id)) return null;
      if (!isValidSecret(b.secret)) return null;
      const fv = validateForwardUrl2(b.forwardUrl);
      const urlOk = fv.ok && fv.url;
      let mode = b.responseMode === "forward" ? "forward" : "fixed";
      if (mode === "forward" && !urlOk) mode = "fixed";
      let status = parseInt(b.fixedStatus, 10);
      if (!Number.isInteger(status) || status < 200 || status > 599) status = 200;
      const fixedBody = typeof b.fixedBody === "string" ? b.fixedBody.slice(0, 4 * 1024) : "";
      return {
        id: b.id,
        name: sanitizeName(b.name, b.id),
        secret: b.secret,
        createdAt: Number(b.createdAt) || 0,
        responseMode: mode,
        fixedStatus: status,
        fixedBody,
        forwardUrl: urlOk ? fv.url : ""
      };
    }
    function DEFAULT_SETTINGS() {
      return {
        version: 1,
        buckets: [],
        retention: { maxPerBucket: 200, bodyCapKb: FILE_BODY_DEFAULT_KB },
        updatedAt: 0
      };
    }
    function normalizeSettings(raw) {
      const out = DEFAULT_SETTINGS();
      if (!raw || typeof raw !== "object") return out;
      const buckets = Array.isArray(raw.buckets) ? raw.buckets : [];
      const seen = /* @__PURE__ */ new Set();
      for (const b of buckets.slice(0, MAX_BUCKETS)) {
        const nb = normalizeBucket(b);
        if (!nb || seen.has(nb.secret) || seen.has(nb.id)) continue;
        seen.add(nb.secret);
        seen.add(nb.id);
        if (nb.responseMode === "forward" && !nb.forwardUrl) nb.responseMode = "fixed";
        out.buckets.push(nb);
      }
      const r = raw.retention && typeof raw.retention === "object" ? raw.retention : {};
      let mpb = parseInt(r.maxPerBucket, 10);
      if (!Number.isFinite(mpb)) mpb = 200;
      out.retention.maxPerBucket = Math.min(MAX_PER_BUCKET_HARD, Math.max(10, mpb));
      let cap = parseInt(r.bodyCapKb, 10);
      if (!Number.isFinite(cap)) cap = FILE_BODY_DEFAULT_KB;
      out.retention.bodyCapKb = Math.min(FILE_BODY_MAX_KB, Math.max(8, cap));
      out.updatedAt = Number(raw.updatedAt) || 0;
      return out;
    }
    function bootstrapSettings(prev) {
      const s = normalizeSettings(prev);
      if (s.buckets.length === 0) {
        s.buckets.push({
          id: "default",
          name: "\u9ED8\u8BA4\u6876",
          secret: newSecret(),
          createdAt: Date.now(),
          responseMode: "fixed",
          fixedStatus: 200,
          fixedBody: "",
          forwardUrl: ""
        });
      }
      s.updatedAt = Date.now();
      return s;
    }
    function classifyBody(contentType, buf, capBytes) {
      const size = buf ? buf.length : 0;
      const cap = Math.max(1, capBytes);
      if (!buf || size === 0) {
        return { kind: "empty", size: 0, truncated: false, bodyText: "", bodyBase64: "" };
      }
      const ct = String(contentType || "");
      const looksText = !ct || TEXT_CONTENT_RE.test(ct);
      const slice = buf.slice(0, cap);
      let truncated = size > cap;
      if (looksText) {
        const text = slice.toString("utf8");
        const bad = (text.match(/\ufffd/g) || []).length;
        if (bad > Math.max(2, text.length * 0.02)) {
          return { kind: "binary", size, truncated, bodyText: "", bodyBase64: slice.toString("base64") };
        }
        return { kind: "text", size, truncated, bodyText: text, bodyBase64: "" };
      }
      return { kind: "binary", size, truncated, bodyText: "", bodyBase64: slice.toString("base64") };
    }
    function normalizeHeaders(headers) {
      const out = {};
      let n = 0;
      const raw = headers || {};
      for (const k of Object.keys(raw)) {
        if (n >= HEADER_COUNT_CAP) break;
        const v = Array.isArray(raw[k]) ? raw[k].join(", ") : String(raw[k] == null ? "" : raw[k]);
        out[k.toLowerCase()] = v.slice(0, HEADER_VALUE_CAP);
        n += 1;
      }
      return out;
    }
    function normalizeCapture(input) {
      const i = input || {};
      return {
        id: i.id || newId(),
        bucketId: isValidBucketId(i.bucketId) ? i.bucketId : "",
        method: String(i.method || "GET").toUpperCase().slice(0, 16),
        path: String(i.path || "/").slice(0, PATH_CAP),
        query: String(i.query || "").slice(0, PATH_CAP),
        headers: normalizeHeaders(i.headers),
        sourceIp: String(i.sourceIp || "").slice(0, 64),
        receivedAt: Number(i.receivedAt) || Date.now(),
        contentType: String(i.contentType || ""),
        kind: i.kind || "empty",
        size: Math.max(0, Number(i.size) || 0),
        truncated: i.truncated === true,
        bodyText: typeof i.bodyText === "string" ? i.bodyText : "",
        bodyBase64: typeof i.bodyBase64 === "string" ? i.bodyBase64 : "",
        responded: i.responded || null,
        // {status, mode}
        forward: i.forward || null
        // {url, status, ok, latencyMs, error, bodyPreview}
      };
    }
    function filterForwardHeaders(headers) {
      const out = {};
      for (const k of Object.keys(headers || {})) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue;
        out[k] = headers[k];
      }
      return out;
    }
    function previewForKv(rec, cap) {
      const c = Math.max(1, Math.min(cap || KV_PREVIEW_CAP, KV_PREVIEW_CAP));
      let bodyText = "";
      let bodyBase64 = "";
      let previewTruncated = rec.truncated === true;
      if (rec.kind === "text") {
        bodyText = rec.bodyText || "";
        if (bodyText.length > c) {
          bodyText = bodyText.slice(0, c);
          previewTruncated = true;
        }
      } else if (rec.kind === "binary") {
        if ((rec.bodyBase64 || "").length > c) {
          bodyBase64 = rec.bodyBase64.slice(0, c);
          previewTruncated = true;
        } else bodyBase64 = rec.bodyBase64 || "";
      }
      return {
        id: rec.id,
        bucketId: rec.bucketId,
        method: rec.method,
        path: rec.path,
        query: rec.query,
        headers: rec.headers,
        sourceIp: rec.sourceIp,
        receivedAt: rec.receivedAt,
        contentType: rec.contentType,
        kind: rec.kind,
        size: rec.size,
        truncated: rec.truncated,
        previewTruncated,
        bodyText,
        bodyBase64,
        responded: rec.responded,
        forward: rec.forward
      };
    }
    function bucketPath(bucket) {
      return `/hook/${bucket.secret}`;
    }
    function pickLanIp(ifaces) {
      const all = [];
      for (const name of Object.keys(ifaces || {})) {
        for (const f of ifaces[name] || []) {
          if (f.family === "IPv4" && !f.internal) all.push(f.address);
        }
      }
      const rank = (ip) => ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3;
      all.sort((a, b) => rank(a) - rank(b));
      return all[0] || "";
    }
    function applyCapture(ring, rec, maxPerBucket) {
      const limit = Math.max(1, Math.min(maxPerBucket || 200, MAX_PER_BUCKET_HARD));
      const next = [rec, ...ring];
      const counts = /* @__PURE__ */ new Map();
      const keep = [];
      let evicted = 0;
      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        const c = counts.get(r.bucketId) || 0;
        if (c >= limit) {
          evicted += 1;
          continue;
        }
        counts.set(r.bucketId, c + 1);
        keep.push(r);
      }
      return { ring: keep, evicted };
    }
    function planChunkWrites(ring, prevChunkCount) {
      const need = Math.ceil(ring.length / CHUNK_SIZE);
      const plan = [];
      for (let i = 0; i < need; i++) {
        plan.push({ key: `whs.rec.${i}`, value: ring.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map((r) => previewForKv(r)) });
      }
      for (let i = need; i < (prevChunkCount || 0); i++) {
        plan.push({ key: `whs.rec.${i}`, value: null });
      }
      return plan;
    }
    function readRing(chunksMap) {
      const ring = [];
      for (const key of Object.keys(chunksMap || {})) {
        const arr = chunksMap[key];
        if (Array.isArray(arr)) ring.push(...arr.filter((r) => r && r.id));
      }
      ring.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      return ring;
    }
    function prettyBodyText2(s) {
      if (typeof s !== "string" || !s) return s || "";
      try {
        const j = JSON.parse(s);
        if (j && typeof j === "object") return JSON.stringify(j, null, 2);
      } catch (_) {
      }
      return s;
    }
    function toCurl2(rec, hostPort) {
      const q = rec.query ? `?${rec.query}` : "";
      const url = `http://${hostPort}${rec.path}${q}`;
      const parts = [`curl -X ${rec.method}`, `'${url}'`];
      for (const [k, v] of Object.entries(rec.headers || {})) {
        const lk = k.toLowerCase();
        if (lk === "host" || lk === "content-length" || lk === "connection") continue;
        parts.push(`-H '${k}: ${String(v).replace(/'/g, `'\\''`)}'`);
      }
      if (rec.kind === "text" && rec.bodyText) {
        parts.push(`--data '${rec.bodyText.replace(/'/g, `'\\''`)}'`);
      } else if (rec.kind === "binary" && rec.bodyBase64) {
        parts.push(`# \u4E8C\u8FDB\u5236\u4F53 ${rec.size}B\uFF1A--data-binary @file.bin\uFF08base64 \u5DF2\u5B58\u8BB0\u5F55\uFF09`);
      }
      return parts.join(" ");
    }
    function summarizeRec(rec) {
      const t = new Date(rec.receivedAt || 0).toISOString().slice(5, 19).replace("T", " ");
      const fwd = rec.forward ? rec.forward.ok ? ` \u2192\u8F6C\u53D1${rec.forward.status}(${rec.forward.latencyMs}ms)` : ` \u2192\u8F6C\u53D1\u5931\u8D25:${rec.forward.error || ""}` : "";
      return `${t} ${rec.method} ${rec.path}${rec.query ? `?${rec.query}` : ""} [${rec.bucketId}] ${rec.responded ? rec.responded.status : "-"}${fwd} id=${rec.id}`;
    }
    function matchSearch(rec, q) {
      const t = String(q || "").trim().toLowerCase();
      if (!t) return true;
      const hay = `${rec.path} ${rec.query} ${rec.method} ${rec.sourceIp} ${rec.kind === "text" ? rec.bodyText : ""}`.toLowerCase();
      return hay.includes(t);
    }
    function statusBucketOf(rec) {
      const s = rec.responded && rec.responded.status;
      if (!s) return "\u5176\u4ED6";
      if (s < 300) return "2xx";
      if (s < 400) return "3xx";
      if (s < 500) return "4xx";
      return "5xx";
    }
    function aggregateStats2(recs, now) {
      const n = now || Date.now();
      const hourMs = 3600 * 1e3;
      const byHour = new Array(24).fill(0);
      const byStatus = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, \u5176\u4ED6: 0 };
      const byMethod = {};
      const byBucket = {};
      const pathCount = /* @__PURE__ */ new Map();
      for (const r of recs || []) {
        const at = Number(r.receivedAt) || 0;
        if (at > n - 24 * hourMs && at <= n) {
          byHour[23 - Math.floor((n - at) / hourMs)] += 1;
        }
        byStatus[statusBucketOf(r)] += 1;
        byMethod[r.method] = (byMethod[r.method] || 0) + 1;
        byBucket[r.bucketId] = (byBucket[r.bucketId] || 0) + 1;
        pathCount.set(r.path, (pathCount.get(r.path) || 0) + 1);
      }
      const topPaths = [...pathCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, count]) => ({ path, count }));
      return { total: (recs || []).length, byStatus, byMethod, byBucket, byHour, topPaths };
    }
    function parseJsonlLine(line) {
      const t = String(line || "").trim();
      if (!t) return null;
      try {
        const j = JSON.parse(t);
        return j && typeof j === "object" && j.id ? j : null;
      } catch (_) {
        return null;
      }
    }
    module.exports = {
      // 常量
      CHUNK_SIZE,
      KV_PREVIEW_CAP,
      REQ_BODY_CAP,
      FILE_BODY_DEFAULT_KB,
      FILE_BODY_MAX_KB,
      MAX_BUCKETS,
      MAX_PER_BUCKET_HARD,
      RESP_BODY_CAP,
      FORWARD_TIMEOUT_MS,
      HOP_BY_HOP,
      PATH_CAP,
      // id / secret
      newId,
      newSecret,
      isValidSecret,
      isValidBucketId,
      // settings
      DEFAULT_SETTINGS,
      normalizeSettings,
      normalizeBucket,
      bootstrapSettings,
      validateForwardUrl: validateForwardUrl2,
      sanitizeName,
      bucketPath,
      pickLanIp,
      // 捕获
      classifyBody,
      normalizeCapture,
      normalizeHeaders,
      filterForwardHeaders,
      previewForKv,
      // ring / chunk
      applyCapture,
      planChunkWrites,
      readRing,
      // 展示
      prettyBodyText: prettyBodyText2,
      toCurl: toCurl2,
      summarizeRec,
      matchSearch,
      statusBucketOf,
      aggregateStats: aggregateStats2,
      parseJsonlLine
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useRef, useState as useState4 } from "react";

// src/tabs/LiveTab.tsx
var import_core = __toESM(require_core());
import { useMemo, useState } from "react";

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
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}

// src/model.ts
var PLUGIN_ID = "webhook-station";
var SERVICE_ID = "webhook-station-service";
var CMD_PREFIX = "whs.cmd.";
var RESULT_PREFIX = "whs.result.";
async function getMeta() {
  return kvGet("whs.meta");
}
async function getSettings() {
  const v = await kvGet("whs.settings");
  return v && Array.isArray(v.buckets) ? v : null;
}
async function getIdx() {
  return kvGet("whs.idx");
}
async function readRecChunks(chunkCount) {
  const map = {};
  const n = Math.max(0, Math.min(chunkCount || 0, 40));
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet(`whs.rec.${i}`))
  );
  results.forEach((arr, i) => {
    if (Array.isArray(arr)) map[`whs.rec.${i}`] = arr;
  });
  const all = [];
  for (const arr of Object.values(map)) all.push(...arr.filter((r) => r && r.id));
  all.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return all;
}
async function saveSettings(s) {
  await kvSet("whs.settings", { ...s, updatedAt: Date.now() });
}
async function sendCommand(op, payload, timeoutMs = 15e3) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(`${CMD_PREFIX}${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const resultKey = `${RESULT_PREFIX}${nonce}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await kvGet(resultKey);
    if (r) {
      void kvDel(resultKey).catch(() => {
      });
      return r;
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
  return { ok: false, error: "\u670D\u52A1\u672A\u54CD\u5E94\u547D\u4EE4\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF1A\u53BB\u8BBE\u7F6E\u9875\u770B\u670D\u52A1\u72B6\u6001\uFF09" };
}
async function listServiceStatus() {
  try {
    const arr = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
    const mine = (Array.isArray(arr) ? arr : []).find((s) => s && s.serviceId === SERVICE_ID);
    return mine || null;
  } catch (_) {
    return null;
  }
}
async function stopService() {
  await capDispatch("cap.pluginServiceManager", { action: "stop", pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
async function restartService() {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
async function startServiceBootstrapped() {
  const r = await capDispatch(
    "cap.pluginDiscovery",
    { action: "discover" }
  );
  const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID);
  if (!self) return "\u63D2\u4EF6\u672A\u88AB\u53D1\u73B0\uFF08\u91CD\u8F7D\u63D2\u4EF6\u9875\u540E\u91CD\u8BD5\uFF09";
  const svc = (self.contributes?.services || []).find((s) => s && s.id === SERVICE_ID);
  if (!svc) return "\u6E05\u5355\u4E2D\u672A\u58F0\u660E\u670D\u52A1";
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType ?? "http",
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 3,
      description: svc.description ?? null
    }
  });
  return null;
}
function newSecretBrowser() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function fmtTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtBytes(n) {
  if (!n || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      window.prompt("\u8BF7\u624B\u52A8\u590D\u5236\uFF08Ctrl+C\uFF09\uFF1A", text);
      return true;
    } catch (_2) {
      return false;
    }
  }
}

// src/tabs/LiveTab.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var METHOD_COLOR = {
  GET: "#3fb950",
  POST: "#d29922",
  PUT: "#58a6ff",
  PATCH: "#bc8cff",
  DELETE: "#f85149",
  HEAD: "#8b949e",
  OPTIONS: "#8b949e"
};
function statusColor(s) {
  if (!s) return "#8b949e";
  if (s < 300) return "#3fb950";
  if (s < 400) return "#58a6ff";
  if (s < 500) return "#d29922";
  return "#f85149";
}
function LiveTab({ data, running, reload, showToast, onSendToChat, onGoTab }) {
  const [bucketFilter, setBucketFilter] = useState("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const buckets = data.settings?.buckets || [];
  const meta = data.meta;
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return data.captures.filter((c) => {
      if (bucketFilter && c.bucketId !== bucketFilter) return false;
      if (!kw) return true;
      return `${c.path} ${c.query} ${c.method} ${c.sourceIp} ${c.kind === "text" ? c.bodyText : ""}`.toLowerCase().includes(kw);
    });
  }, [data.captures, bucketFilter, q]);
  const selected = filtered.find((c) => c.id === selectedId) || data.captures.find((c) => c.id === selectedId) || null;
  const bucketTag = (id) => buckets.find((b) => b.id === id)?.name || id;
  const doReplay = async (c) => {
    const bucket = buckets.find((b) => b.id === c.bucketId);
    if (!bucket?.forwardUrl) {
      showToast("\u8BE5\u6876\u672A\u914D\u7F6E\u8F6C\u53D1\u5730\u5740\uFF1A\u53BB\u300C\u6876\u4E0E\u5730\u5740\u300D\u9875\u914D\u7F6E\uFF0C\u6216\u91CD\u653E\u65F6\u624B\u52A8\u6307\u5B9A\u76EE\u6807", "bad");
      return;
    }
    if (!window.confirm(`\u91CD\u653E\u4F1A\u5411 ${bucket.forwardUrl} \u518D\u53D1\u4E00\u6B21\u771F\u5B9E\u8BF7\u6C42\uFF08${c.method} ${c.path}\uFF09\u3002\u7EE7\u7EED\uFF1F`)) return;
    setReplaying(true);
    try {
      const r = await sendCommand("replay", { captureId: c.id, bucketId: c.bucketId }, 25e3);
      if (r.ok) showToast(`\u91CD\u653E\u6210\u529F\uFF1A\u54CD\u5E94 ${r.status}\uFF08${r.latencyMs}ms\uFF09`, "good");
      else showToast(`\u91CD\u653E\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, "bad");
    } catch (e) {
      showToast(`\u91CD\u653E\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setReplaying(false);
      void reload();
    }
  };
  const hostPort = `127.0.0.1:${meta?.port || 9869}`;
  if (!running) {
    return /* @__PURE__ */ jsx("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u670D\u52A1\u79BB\u7EBF\uFF0C\u65E0\u6CD5\u663E\u793A\u5B9E\u65F6\u6355\u83B7\u3002\u542F\u52A8\u670D\u52A1\u540E\u8FD9\u91CC\u4F1A\u663E\u793A\u8FDB\u6765\u7684\u6BCF\u4E00\u6761\u56DE\u8C03\u3002" });
  }
  if (!buckets.length) {
    return /* @__PURE__ */ jsxs("div", { style: { color: "#a1a1aa", fontSize: 13, lineHeight: 1.8, padding: "8px 4px" }, children: [
      /* @__PURE__ */ jsx("div", { style: { color: "#f4f4f5", fontSize: 14, marginBottom: 6 }, children: "\u5148\u5EFA\u4E00\u4E2A\u6355\u83B7\u6876" }),
      "\u6876 = \u4E00\u6761\u4E13\u5C5E\u6355\u83B7\u8DEF\u5F84\uFF08/hook/<secret>\uFF09\u3002\u628A\u56DE\u8C03\u5730\u5740\u914D\u5230\u7B2C\u4E09\u65B9\uFF08\u6216\u628A\u5185\u7F51\u7A7F\u900F\u96A7\u9053\u6307\u5411",
      /* @__PURE__ */ jsxs("code", { style: { color: "#93c5fd" }, children: [
        " 127.0.0.1:",
        meta?.port || 9869
      ] }),
      "\uFF09\u5C31\u80FD\u5728\u8FD9\u91CC\u770B\u5230\u6BCF\u4E00\u6761\u56DE\u8C03\u3002",
      /* @__PURE__ */ jsx("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx("button", { onClick: () => onGoTab("buckets"), style: btnPrimary, children: "\u53BB\u300C\u6876\u4E0E\u5730\u5740\u300D\u5EFA\u6876" }) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, height: "100%" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setBucketFilter(""),
          style: chip(bucketFilter === ""),
          children: [
            "\u5168\u90E8 ",
            data.captures.length
          ]
        }
      ),
      buckets.map((b) => /* @__PURE__ */ jsxs("button", { onClick: () => setBucketFilter(b.id), style: chip(bucketFilter === b.id), children: [
        b.name,
        " ",
        data.captures.filter((c) => c.bucketId === b.id).length
      ] }, b.id)),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: q,
          onChange: (e) => setQ(e.target.value),
          placeholder: "\u641C\u8DEF\u5F84/\u4F53/\u6765\u6E90 IP\u2026",
          style: {
            flex: 1,
            minWidth: 120,
            fontSize: 12,
            padding: "5px 8px",
            borderRadius: 6,
            border: "1px solid #3f3f46",
            background: "#18181b",
            color: "#d4d4d8",
            minHeight: 28
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flex: 1, minHeight: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { flex: selected ? 5 : 1, minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }, children: [
        filtered.length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "#71717a", fontSize: 12, padding: 12, lineHeight: 1.8 }, children: data.captures.length === 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
          "\u8FD8\u6CA1\u6709\u56DE\u8C03\u8FDB\u6765\u3002\u4E09\u6B65\u5F00\u8DD1\uFF1A",
          /* @__PURE__ */ jsx("br", {}),
          "1. \u590D\u5236\u6876\u7684\u6355\u83B7\u5730\u5740\uFF08",
          /* @__PURE__ */ jsx("b", { children: "\u6876\u4E0E\u5730\u5740" }),
          " \u9875\uFF09",
          /* @__PURE__ */ jsx("br", {}),
          "2. \u914D\u5230\u7B2C\u4E09\u65B9\u56DE\u8C03 URL\uFF0C\u6216\u628A ngrok/natapp \u7B49\u96A7\u9053\u6307\u5411 ",
          /* @__PURE__ */ jsxs("code", { style: { color: "#93c5fd" }, children: [
            "127.0.0.1:",
            meta?.port || 9869
          ] }),
          /* @__PURE__ */ jsx("br", {}),
          "3. \u89E6\u53D1\u4E00\u6B21\u56DE\u8C03\uFF0C\u8FD9\u91CC\u5B9E\u65F6\u51FA\u73B0",
          onSendToChat && /* @__PURE__ */ jsx("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx("button", { onClick: () => void onSendToChat("\u7ED9\u6211 Webhook \u8C03\u8BD5\u53F0\u7684\u56DE\u8C03\u5730\u5740"), style: btnPrimary, children: "\u8BA9 AI \u7ED9\u6211\u56DE\u8C03\u5730\u5740" }) })
        ] }) : "\u5F53\u524D\u8FC7\u6EE4\u6761\u4EF6\u4E0B\u6CA1\u6709\u5339\u914D\u8BB0\u5F55\u3002" }),
        filtered.map((c) => /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setSelectedId(c.id === selectedId ? null : c.id),
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              textAlign: "left",
              width: "100%",
              padding: "7px 9px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12,
              minHeight: 36,
              border: `1px solid ${c.id === selectedId ? "#3b82f6" : "#27272a"}`,
              background: c.id === selectedId ? "rgba(59,130,246,.08)" : "#18181b",
              color: "#d4d4d8"
            },
            children: [
              /* @__PURE__ */ jsx("span", { style: {
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(255,255,255,.06)",
                color: METHOD_COLOR[c.method] || "#d4d4d8",
                minWidth: 44,
                textAlign: "center"
              }, children: c.method }),
              /* @__PURE__ */ jsxs("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e4e4e7" }, children: [
                c.path,
                c.query ? /* @__PURE__ */ jsxs("span", { style: { color: "#71717a" }, children: [
                  "?",
                  c.query
                ] }) : null
              ] }),
              /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#71717a", whiteSpace: "nowrap" }, children: bucketTag(c.bucketId) }),
              /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: statusColor(c.responded?.status), whiteSpace: "nowrap" }, children: [
                c.responded?.status ?? "-",
                c.forward ? c.forward.ok ? " \u290D" : " \u290D\u2715" : ""
              ] }),
              /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#52525b", whiteSpace: "nowrap" }, children: fmtTime(c.receivedAt) })
            ]
          },
          c.id
        ))
      ] }),
      selected && /* @__PURE__ */ jsxs("div", { style: { flex: 4, minWidth: 0, overflowY: "auto", border: "1px solid #27272a", borderRadius: 8, padding: 10, background: "#131316", display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx("span", { style: { fontWeight: 700, color: METHOD_COLOR[selected.method] || "#f4f4f5" }, children: selected.method }),
          /* @__PURE__ */ jsxs("span", { style: { fontSize: 12, color: "#e4e4e7", wordBreak: "break-all" }, children: [
            selected.path,
            selected.query ? `?${selected.query}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#71717a", display: "flex", gap: 12, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx("span", { children: fmtTime(selected.receivedAt) }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u6765\u6E90 ",
            selected.sourceIp
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            selected.kind,
            " ",
            fmtBytes(selected.size),
            selected.truncated || selected.previewTruncated ? "\uFF08\u622A\u65AD\uFF09" : ""
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u6876 ",
            bucketTag(selected.bucketId)
          ] }),
          /* @__PURE__ */ jsxs("span", { style: { color: statusColor(selected.responded?.status) }, children: [
            "\u5E94\u7B54 ",
            selected.responded?.status ?? "-"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx("button", { onClick: () => void doReplay(selected), disabled: replaying, style: btnAction(replaying), children: "\u21BB \u91CD\u653E\u5230\u8F6C\u53D1\u5730\u5740" }),
          /* @__PURE__ */ jsx("button", { onClick: () => {
            void copyText(`http://${hostPort}${selected.path}${selected.query ? `?${selected.query}` : ""}`).then((ok) => showToast(ok ? "\u5DF2\u590D\u5236 URL" : "\u590D\u5236\u5931\u8D25", ok ? "good" : "bad"));
          }, style: btnGhost, children: "\u590D\u5236 URL" }),
          /* @__PURE__ */ jsx("button", { onClick: () => {
            void copyText((0, import_core.toCurl)(selected, hostPort)).then((ok) => showToast(ok ? "\u5DF2\u590D\u5236 cURL" : "\u590D\u5236\u5931\u8D25", ok ? "good" : "bad"));
          }, style: btnGhost, children: "\u590D\u5236 cURL" }),
          /* @__PURE__ */ jsx("button", { onClick: () => setSelectedId(null), style: btnGhost, children: "\u5173\u95ED" })
        ] }),
        selected.forward && /* @__PURE__ */ jsxs("div", { style: {
          fontSize: 11,
          padding: 8,
          borderRadius: 6,
          lineHeight: 1.6,
          border: `1px solid ${selected.forward.ok ? "rgba(63,185,80,.35)" : "rgba(248,81,73,.35)"}`,
          background: selected.forward.ok ? "rgba(63,185,80,.07)" : "rgba(248,81,73,.07)"
        }, children: [
          /* @__PURE__ */ jsxs("b", { style: { color: selected.forward.ok ? "#3fb950" : "#f85149" }, children: [
            "\u8F6C\u53D1 ",
            selected.forward.ok ? selected.forward.status : "\u5931\u8D25"
          ] }),
          /* @__PURE__ */ jsxs("span", { style: { color: "#71717a" }, children: [
            " \u2192 ",
            selected.forward.url,
            "\uFF08",
            selected.forward.latencyMs,
            "ms\uFF09"
          ] }),
          selected.forward.error && /* @__PURE__ */ jsx("div", { style: { color: "#fca5a5" }, children: selected.forward.error }),
          selected.forward.bodyPreview && /* @__PURE__ */ jsx("div", { style: { color: "#a1a1aa", whiteSpace: "pre-wrap", wordBreak: "break-all" }, children: selected.forward.bodyPreview.slice(0, 600) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("div", { style: sectionTitle, children: [
            "\u8BF7\u6C42\u5934\uFF08",
            Object.keys(selected.headers || {}).length,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, fontFamily: "monospace", lineHeight: 1.7, color: "#a1a1aa", wordBreak: "break-all" }, children: Object.entries(selected.headers || {}).map(([k, v]) => /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { style: { color: "#93c5fd" }, children: k }),
            ": ",
            String(v).slice(0, 300)
          ] }, k)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { minHeight: 0 }, children: [
          /* @__PURE__ */ jsxs("div", { style: sectionTitle, children: [
            "\u8BF7\u6C42\u4F53\uFF08",
            selected.kind,
            "\uFF0C",
            fmtBytes(selected.size),
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx("pre", { style: {
            margin: 0,
            padding: 8,
            borderRadius: 6,
            background: "#09090b",
            border: "1px solid #27272a",
            fontSize: 11,
            fontFamily: "monospace",
            color: "#e4e4e7",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 320,
            overflowY: "auto"
          }, children: selected.kind === "text" ? (0, import_core.prettyBodyText)(selected.bodyText || "\uFF08\u7A7A\uFF09") : selected.kind === "binary" ? `\uFF08\u4E8C\u8FDB\u5236 ${fmtBytes(selected.size)}${selected.bodyBase64 ? `\uFF0Cbase64 \u524D 200 \u5B57\u7B26: ${selected.bodyBase64.slice(0, 200)}` : ""}\uFF09` : "\uFF08\u7A7A\u4F53\uFF09" }),
          selected.previewTruncated && /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#d29922", marginTop: 4 }, children: "\u9762\u677F\u4EC5\u663E\u793A\u9884\u89C8\uFF1B\u5168\u6587\u5728\u670D\u52A1\u7AEF\u7559\u75D5\u6587\u4EF6\uFF08AI \u53EF\u7528 hook_get \u8BFB\u5168\u6587\uFF09\u3002" })
        ] })
      ] })
    ] })
  ] });
}
var chip = (active) => ({
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 14,
  cursor: "pointer",
  minHeight: 26,
  border: `1px solid ${active ? "#3b82f6" : "#3f3f46"}`,
  background: active ? "rgba(59,130,246,.15)" : "transparent",
  color: active ? "#93c5fd" : "#a1a1aa",
  whiteSpace: "nowrap"
});
var sectionTitle = { fontSize: 11, fontWeight: 700, color: "#e4e4e7", marginBottom: 4 };
var btnPrimary = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  cursor: "pointer",
  minHeight: 30,
  border: "1px solid #3b82f6",
  background: "rgba(59,130,246,.18)",
  color: "#93c5fd"
};
var btnAction = (disabled) => ({
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 6,
  cursor: disabled ? "wait" : "pointer",
  minHeight: 28,
  border: "1px solid rgba(210,153,34,.5)",
  background: "rgba(210,153,34,.12)",
  color: "#e3b341"
});
var btnGhost = {
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 28,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#a1a1aa"
};

// src/tabs/BucketsTab.tsx
var import_core2 = __toESM(require_core());
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function BucketsTab({ data, running, reload, showToast }) {
  const [editing, setEditing] = useState2(null);
  const [creating, setCreating] = useState2(false);
  const [busy, setBusy] = useState2(false);
  const settings = data.settings;
  const port = data.meta?.port || 9869;
  const lanIp = data.meta?.lanIp || "";
  if (!settings) {
    return /* @__PURE__ */ jsx2("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u8BFB\u53D6\u6876\u914D\u7F6E\u4E2D\u2026\uFF08\u670D\u52A1\u9996\u6B21\u4E0A\u7EBF\u4F1A\u81EA\u52A8\u5EFA\u9ED8\u8BA4\u6876\uFF09" });
  }
  const persist = async (next, okMsg) => {
    setBusy(true);
    try {
      await saveSettings(next);
      showToast(okMsg, "good");
      setEditing(null);
      setCreating(false);
      await reload();
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  };
  const updateBucket = (id, patch) => {
    if (!settings) return;
    if (patch.forwardUrl !== void 0 && patch.forwardUrl !== "") {
      const v = (0, import_core2.validateForwardUrl)(patch.forwardUrl);
      if (!v.ok) {
        showToast(`\u8F6C\u53D1\u5730\u5740\u672A\u4FDD\u5B58\uFF1A${v.error}`, "bad");
        return;
      }
    }
    const next = {
      ...settings,
      buckets: settings.buckets.map((b) => b.id === id ? { ...b, ...patch } : b)
    };
    void persist(next, "\u6876\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u7EA6 5s \u5185\u751F\u6548\uFF09");
  };
  const createBucket = (id, name) => {
    const sid = id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    if (!sid) {
      showToast("\u6876 ID \u53EA\u80FD\u662F\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26", "bad");
      return;
    }
    if (settings.buckets.some((b) => b.id === sid)) {
      showToast(`\u6876 ID ${sid} \u5DF2\u5B58\u5728`, "bad");
      return;
    }
    if (settings.buckets.length >= 20) {
      showToast("\u6876\u6570\u91CF\u5DF2\u8FBE\u4E0A\u9650\uFF0820\uFF09", "bad");
      return;
    }
    const nb = {
      id: sid,
      name: name.trim() || sid,
      secret: newSecretBrowser(),
      createdAt: Date.now(),
      responseMode: "fixed",
      fixedStatus: 200,
      fixedBody: "",
      forwardUrl: ""
    };
    void persist({ ...settings, buckets: [...settings.buckets, nb] }, `\u6876 ${sid} \u5DF2\u521B\u5EFA`);
  };
  const deleteBucket = (id) => {
    if (!window.confirm(`\u5220\u9664\u6876 ${id} \u4E0D\u4F1A\u5220\u9664\u5176\u6355\u83B7\u7559\u75D5\uFF0C\u4F46\u6355\u83B7\u5730\u5740\u7ACB\u5373\u5931\u6548\u4E14\u4E0D\u53EF\u6062\u590D\u3002\u786E\u8BA4\u5220\u9664\uFF1F`)) return;
    void persist({ ...settings, buckets: settings.buckets.filter((b) => b.id !== id) }, `\u6876 ${id} \u5DF2\u5220\u9664`);
  };
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { style: { fontSize: 11, color: "#71717a", lineHeight: 1.7 }, children: [
      "\u628A\u6355\u83B7\u5730\u5740\u914D\u5230\u7B2C\u4E09\u65B9\u56DE\u8C03 URL\uFF0C\u6216\u628A\u5185\u7F51\u7A7F\u900F\u96A7\u9053\uFF08ngrok / natapp / cpolar\u2026\uFF09\u6307\u5411",
      /* @__PURE__ */ jsxs2("code", { style: { color: "#93c5fd" }, children: [
        " http://127.0.0.1:",
        port
      ] }),
      "\u2014\u2014\u96A7\u9053\u6362\u57DF\u540D\u65F6\u6355\u83B7\u5668\u4E0D\u52A8\uFF0C\u53EA\u6539\u96A7\u9053\u3002",
      /* @__PURE__ */ jsx2("b", { style: { color: "#d29922" }, children: " \u6570\u636E\u53EA\u843D\u672C\u673A\u3002" })
    ] }),
    settings.buckets.map((b) => /* @__PURE__ */ jsxs2("div", { style: { border: "1px solid #27272a", borderRadius: 8, padding: 10, background: "#131316" }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2("b", { style: { color: "#f4f4f5", fontSize: 13 }, children: b.name }),
        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 10, color: "#71717a" }, children: [
          "[",
          b.id,
          "]"
        ] }),
        /* @__PURE__ */ jsx2("span", { style: {
          fontSize: 10,
          padding: "1px 8px",
          borderRadius: 8,
          background: b.responseMode === "forward" ? "rgba(88,166,255,.15)" : "rgba(63,185,80,.12)",
          color: b.responseMode === "forward" ? "#58a6ff" : "#3fb950"
        }, children: b.responseMode === "forward" ? `\u8F6C\u53D1 \u2192 ${b.forwardUrl || "\uFF08\u672A\u914D\u7F6E\uFF01\uFF09"}` : `\u56FA\u5B9A\u5E94\u7B54 ${b.fixedStatus}` }),
        /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx2("button", { onClick: () => setEditing(editing === b.id ? null : b.id), style: btnGhost2, children: editing === b.id ? "\u6536\u8D77" : "\u7F16\u8F91" }),
        /* @__PURE__ */ jsx2("button", { onClick: () => {
          if (window.confirm(`\u786E\u5B9A\u5220\u9664\u6876\u300C${b.name}\u300D\uFF1F`)) deleteBucket(b.id);
        }, style: btnDanger, children: "\u5220\u9664" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }, children: [
        /* @__PURE__ */ jsx2(AddrRow, { label: "\u672C\u673A", url: `http://127.0.0.1:${port}/hook/${b.secret}`, showToast }),
        lanIp && /* @__PURE__ */ jsx2(AddrRow, { label: "\u5C40\u57DF\u7F51", url: `http://${lanIp}:${port}/hook/${b.secret}`, showToast }),
        /* @__PURE__ */ jsxs2("div", { style: { fontSize: 10, color: "#52525b" }, children: [
          "secret \u521B\u5EFA\u4E8E ",
          fmtTime(b.createdAt),
          "\uFF0C\u6CC4\u6F0F\u65F6\u53EF\u5728\u7F16\u8F91\u91CC\u91CD\u7F6E"
        ] })
      ] }),
      editing === b.id && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 10, display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #27272a", paddingTop: 10 }, children: [
        /* @__PURE__ */ jsxs2("label", { style: labelStyle, children: [
          "\u540D\u79F0",
          /* @__PURE__ */ jsx2(
            "input",
            {
              defaultValue: b.name,
              onBlur: (e) => {
                if (e.target.value.trim() && e.target.value !== b.name) updateBucket(b.id, { name: e.target.value.trim().slice(0, 30) });
              },
              style: inputStyle
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { style: labelStyle, children: [
          "\u5E94\u7B54\u6A21\u5F0F",
          /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, marginTop: 4 }, children: [
            /* @__PURE__ */ jsx2(
              "button",
              {
                onClick: () => updateBucket(b.id, { responseMode: "fixed" }),
                style: modeBtn(b.responseMode === "fixed"),
                children: "\u56FA\u5B9A\u5E94\u7B54\uFF08\u53EA\u6355\u83B7\u4E0D\u8F6C\u53D1\uFF09"
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                onClick: () => updateBucket(b.id, { responseMode: "forward" }),
                style: modeBtn(b.responseMode === "forward"),
                children: "\u8F6C\u53D1\uFF08\u6355\u83B7 + \u8F6C\u7ED9\u672C\u5730\u5E94\u7528\uFF09"
              }
            )
          ] })
        ] }),
        b.responseMode === "forward" ? /* @__PURE__ */ jsxs2("label", { style: labelStyle, children: [
          "\u8F6C\u53D1\u5730\u5740\uFF08\u53EF\u6307\u5411\u672C\u673A\u5E94\u7528\uFF0C\u5982 http://127.0.0.1:3000/api/pay/notify\uFF09",
          /* @__PURE__ */ jsx2(
            "input",
            {
              defaultValue: b.forwardUrl,
              placeholder: "http://127.0.0.1:3000/api/pay/notify",
              onBlur: (e) => {
                if (e.target.value !== b.forwardUrl) updateBucket(b.id, { forwardUrl: e.target.value.trim() });
              },
              style: inputStyle
            }
          ),
          /* @__PURE__ */ jsx2("span", { style: { fontSize: 10, color: "#71717a" }, children: "\u8F6C\u53D1\u5931\u8D25\u65F6\u8C03\u7528\u65B9\u6536\u5230 502\uFF08\u652F\u4ED8\u5E73\u53F0\u4F1A\u81EA\u52A8\u91CD\u8BD5\uFF0C\u6B63\u597D\u7528\u6765\u89C2\u5BDF\u91CD\u8BD5\u94FE\u8DEF\uFF09" })
        ] }) : /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ jsxs2("label", { style: { ...labelStyle, width: 120 }, children: [
            "\u5E94\u7B54\u72B6\u6001\u7801",
            /* @__PURE__ */ jsx2(
              "input",
              {
                defaultValue: String(b.fixedStatus),
                onBlur: (e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isInteger(n) && n >= 200 && n <= 599 && n !== b.fixedStatus) updateBucket(b.id, { fixedStatus: n });
                },
                style: inputStyle
              }
            )
          ] }),
          /* @__PURE__ */ jsxs2("label", { style: { ...labelStyle, flex: 1 }, children: [
            "\u5E94\u7B54\u4F53\uFF08\u7A7A = ",
            "{",
            '"received":true',
            "}",
            "; \u652F\u4ED8\u5B9D\u56DE\u8C03\u60F3\u7B54 success \u5C31\u586B success\uFF09",
            /* @__PURE__ */ jsx2(
              "input",
              {
                defaultValue: b.fixedBody,
                onBlur: (e) => {
                  if (e.target.value !== b.fixedBody) updateBucket(b.id, { fixedBody: e.target.value.slice(0, 4096) });
                },
                style: inputStyle
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx2("div", { children: /* @__PURE__ */ jsx2(
          "button",
          {
            onClick: () => {
              if (!window.confirm("\u91CD\u7F6E secret \u540E\u65E7\u6355\u83B7\u5730\u5740\u7ACB\u5373\u5931\u6548\uFF08\u7B2C\u4E09\u65B9/\u96A7\u9053\u9700\u6539\u7528\u65B0\u5730\u5740\uFF09\u3002\u786E\u8BA4\uFF1F")) return;
              updateBucket(b.id, { secret: newSecretBrowser() });
            },
            style: btnGhost2,
            children: "\u91CD\u7F6E secret"
          }
        ) })
      ] })
    ] }, b.id)),
    creating ? /* @__PURE__ */ jsx2(CreateForm, { busy, onCancel: () => setCreating(false), onCreate: createBucket }) : /* @__PURE__ */ jsx2("button", { onClick: () => setCreating(true), style: btnPrimary2, disabled: !running, children: "\uFF0B \u65B0\u5EFA\u6355\u83B7\u6876" })
  ] });
}
function CreateForm({ busy, onCancel, onCreate }) {
  const [id, setId] = useState2("");
  const [name, setName] = useState2("");
  return /* @__PURE__ */ jsxs2("div", { style: { border: "1px solid #3b82f6", borderRadius: 8, padding: 10, background: "rgba(59,130,246,.05)", display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs2("label", { style: { ...labelStyle, flex: 1, minWidth: 140 }, children: [
        "\u6876 ID\uFF08\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF0C\u5982 pay\uFF09",
        /* @__PURE__ */ jsx2("input", { value: id, onChange: (e) => setId(e.target.value), placeholder: "pay", style: inputStyle })
      ] }),
      /* @__PURE__ */ jsxs2("label", { style: { ...labelStyle, flex: 1, minWidth: 140 }, children: [
        "\u663E\u793A\u540D",
        /* @__PURE__ */ jsx2("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "\u652F\u4ED8\u56DE\u8C03", style: inputStyle })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsx2("button", { onClick: () => onCreate(id, name), disabled: busy, style: btnPrimary2, children: "\u521B\u5EFA" }),
      /* @__PURE__ */ jsx2("button", { onClick: onCancel, style: btnGhost2, children: "\u53D6\u6D88" })
    ] })
  ] });
}
function AddrRow({ label, url, showToast }) {
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11 }, children: [
    /* @__PURE__ */ jsx2("span", { style: { color: "#52525b", width: 44 }, children: label }),
    /* @__PURE__ */ jsx2("code", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e4e4e7", background: "#09090b", padding: "4px 8px", borderRadius: 6, border: "1px solid #27272a" }, children: url }),
    /* @__PURE__ */ jsx2("button", { onClick: () => {
      void copyText(url).then((ok) => showToast(ok ? "\u5DF2\u590D\u5236\u6355\u83B7\u5730\u5740" : "\u590D\u5236\u5931\u8D25", ok ? "good" : "bad"));
    }, style: btnGhost2, children: "\u590D\u5236" })
  ] });
}
var labelStyle = { fontSize: 11, color: "#a1a1aa", display: "flex", flexDirection: "column", gap: 4 };
var inputStyle = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#18181b",
  color: "#d4d4d8",
  minHeight: 28
};
var modeBtn = (active) => ({
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 28,
  flex: 1,
  border: `1px solid ${active ? "#3b82f6" : "#3f3f46"}`,
  background: active ? "rgba(59,130,246,.15)" : "transparent",
  color: active ? "#93c5fd" : "#a1a1aa"
});
var btnPrimary2 = {
  fontSize: 12,
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  minHeight: 32,
  border: "1px solid #3b82f6",
  background: "rgba(59,130,246,.18)",
  color: "#93c5fd"
};
var btnGhost2 = {
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 26,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#a1a1aa"
};
var btnDanger = {
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 26,
  border: "1px solid rgba(248,81,73,.5)",
  background: "rgba(248,81,73,.08)",
  color: "#f85149"
};

// src/tabs/StatsTab.tsx
var import_core3 = __toESM(require_core());
import { useMemo as useMemo2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var STATUS_COLOR = {
  "2xx": "#3fb950",
  "3xx": "#58a6ff",
  "4xx": "#d29922",
  "5xx": "#f85149",
  \u5176\u4ED6: "#8b949e"
};
function StatsTab({ data, onSendToChat }) {
  const stats = useMemo2(() => (0, import_core3.aggregateStats)(data.captures), [data.captures]);
  const maxHour = Math.max(1, ...stats.byHour);
  const W = 480;
  const H = 96;
  const bw = W / 24;
  const aiHints = [
    "\u770B\u770B\u6700\u8FD1\u7684 webhook \u56DE\u8C03\uFF0C\u6709\u6CA1\u6709\u5931\u8D25\u6216\u5F02\u5E38\u7684",
    "\u5206\u6790\u6700\u8FD1\u8FD9\u6761\u652F\u4ED8\u56DE\u8C03\u7684\u5185\u5BB9\uFF0C\u9A8C\u7B7E\u5B57\u6BB5\u90FD\u5728\u5417",
    "\u603B\u7ED3\u4ECA\u5929\u6536\u5230\u7684\u56DE\u8C03\uFF1A\u54EA\u4E2A\u6876\u6700\u591A\u3001\u6709\u6CA1\u6709 5xx"
  ];
  if (!stats.total) {
    return /* @__PURE__ */ jsxs3("div", { style: { color: "#a1a1aa", fontSize: 13, lineHeight: 1.8, padding: "8px 4px" }, children: [
      "\u6682\u65E0\u6355\u83B7\u6570\u636E\u53EF\u6392\u67E5\u3002\u56DE\u8C03\u8FDB\u6765\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0 24h \u5206\u5E03\u3001\u5E94\u7B54\u7801\u5206\u5E03\u3001Top \u8DEF\u5F84\uFF0C \u4E5F\u53EF\u4EE5\u76F4\u63A5\u8BA9 AI \u8BFB\u7559\u75D5\u5168\u6587\u5206\u6790\uFF08\u6570\u636E\u4E0D\u51FA\u672C\u673A\uFF09\u3002",
      onSendToChat && /* @__PURE__ */ jsx3("div", { style: { marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }, children: aiHints.map((h) => /* @__PURE__ */ jsx3("button", { onClick: () => void onSendToChat(h), style: hintBtn, children: h }, h)) })
    ] });
  }
  return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsxs3("div", { style: secTitle, children: [
        "\u6700\u8FD1 24 \u5C0F\u65F6\uFF08\u5171 ",
        stats.total,
        " \u6761\u9884\u89C8\u8303\u56F4\u5185\uFF09"
      ] }),
      /* @__PURE__ */ jsxs3("svg", { width: "100%", viewBox: `0 0 ${W} ${H + 14}`, preserveAspectRatio: "none", style: { display: "block" }, children: [
        stats.byHour.map((n, i) => {
          const h = n === 0 ? 0 : Math.max(3, n / maxHour * (H - 8));
          const x = i * bw + 2;
          return /* @__PURE__ */ jsxs3("g", { children: [
            /* @__PURE__ */ jsx3(
              "rect",
              {
                x,
                y: H - h,
                width: bw - 4,
                height: h,
                rx: 2,
                fill: n === 0 ? "#27272a" : i === 23 ? "#3b82f6" : "#58a6ff99"
              }
            ),
            n > 0 && /* @__PURE__ */ jsx3("text", { x: x + (bw - 4) / 2, y: H - h - 3, fontSize: 9, fill: "#a1a1aa", textAnchor: "middle", children: n })
          ] }, i);
        }),
        /* @__PURE__ */ jsx3("text", { x: 0, y: H + 12, fontSize: 9, fill: "#52525b", children: "-23h" }),
        /* @__PURE__ */ jsx3("text", { x: W / 2, y: H + 12, fontSize: 9, fill: "#52525b", textAnchor: "middle", children: "-12h" }),
        /* @__PURE__ */ jsx3("text", { x: W, y: H + 12, fontSize: 9, fill: "#52525b", textAnchor: "end", children: "\u73B0\u5728" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 160 }, children: [
        /* @__PURE__ */ jsx3("div", { style: secTitle, children: "\u5E94\u7B54\u5206\u5E03" }),
        Object.entries(stats.byStatus).filter(([, n]) => n > 0).map(([k, n]) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }, children: [
          /* @__PURE__ */ jsx3("span", { style: { color: STATUS_COLOR[k] || "#8b949e", fontWeight: 700, width: 36 }, children: k }),
          /* @__PURE__ */ jsx3("div", { style: { flex: 1, height: 6, borderRadius: 3, background: "#27272a" }, children: /* @__PURE__ */ jsx3("div", { style: { width: `${n / stats.total * 100}%`, height: "100%", borderRadius: 3, background: STATUS_COLOR[k] || "#8b949e" } }) }),
          /* @__PURE__ */ jsx3("span", { style: { color: "#a1a1aa", width: 28, textAlign: "right" }, children: n })
        ] }, k))
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 160 }, children: [
        /* @__PURE__ */ jsx3("div", { style: secTitle, children: "\u6309\u6876" }),
        Object.entries(stats.byBucket).map(([k, n]) => /* @__PURE__ */ jsxs3("div", { style: { fontSize: 12, color: "#a1a1aa", marginBottom: 4 }, children: [
          data.settings?.buckets.find((b) => b.id === k)?.name || k,
          " ",
          /* @__PURE__ */ jsx3("b", { style: { color: "#e4e4e7" }, children: n })
        ] }, k)),
        /* @__PURE__ */ jsx3("div", { style: secTitle, children: "\u65B9\u6CD5" }),
        /* @__PURE__ */ jsx3("div", { style: { fontSize: 12, color: "#a1a1aa" }, children: Object.entries(stats.byMethod).map(([k, n]) => `${k}\xD7${n}`).join("\u3000") })
      ] })
    ] }),
    stats.topPaths.length > 0 && /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3("div", { style: secTitle, children: "Top \u8DEF\u5F84" }),
      stats.topPaths.map((p) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, fontSize: 11, color: "#a1a1aa", marginBottom: 2 }, children: [
        /* @__PURE__ */ jsx3("code", { style: { color: "#e4e4e7", wordBreak: "break-all" }, children: p.path }),
        /* @__PURE__ */ jsxs3("span", { children: [
          "\xD7",
          p.count
        ] })
      ] }, p.path))
    ] }),
    onSendToChat && /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3("div", { style: secTitle, children: "\u8BA9 AI \u6392\u67E5\uFF08MCP \u76F4\u8BFB\u7559\u75D5\u5168\u6587\uFF0C\u542B\u5BC6\u94A5\u8131\u654F\uFF09" }),
      /* @__PURE__ */ jsx3("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: aiHints.map((h) => /* @__PURE__ */ jsx3("button", { onClick: () => void onSendToChat(h), style: hintBtn, children: h }, h)) })
    ] }),
    /* @__PURE__ */ jsx3("div", { style: { fontSize: 10, color: "#52525b" }, children: "\u7EDF\u8BA1\u57FA\u4E8E\u9762\u677F\u9884\u89C8\uFF08\u6700\u8FD1\u82E5\u5E72\u6761\uFF09\uFF1B\u5168\u91CF\u5728\u670D\u52A1\u7AEF\u7559\u75D5\u6587\u4EF6\uFF0CAI \u7684 hook_search \u53EF\u8DE8\u5168\u91CF\u641C\u7D22\u3002" })
  ] });
}
var secTitle = { fontSize: 11, fontWeight: 700, color: "#e4e4e7", marginBottom: 6 };
var hintBtn = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 8,
  cursor: "pointer",
  textAlign: "left",
  minHeight: 30,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#93c5fd"
};

// src/tabs/SettingsTab.tsx
import { useEffect, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [svc, setSvc] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const [maxPerBucket, setMaxPerBucket] = useState3("");
  const [bodyCapKb, setBodyCapKb] = useState3("");
  const refreshSvc = async () => setSvc(await listServiceStatus());
  useEffect(() => {
    void refreshSvc();
  }, []);
  const meta = data.meta;
  const settings = data.settings;
  const doStart = async () => {
    setBusy(true);
    try {
      const err = await startServiceBootstrapped();
      showToast(err ? `\u542F\u52A8\u5931\u8D25\uFF1A${err}` : "\u542F\u52A8\u547D\u4EE4\u5DF2\u53D1\u51FA\uFF0C\u51E0\u79D2\u540E\u770B\u72B6\u6001", err ? "bad" : "good");
      setTimeout(() => {
        void refreshSvc();
        void reload();
      }, 2500);
    } catch (e) {
      showToast(`\u542F\u52A8\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  };
  const doStop = async () => {
    setBusy(true);
    try {
      await stopService();
      showToast("\u5DF2\u505C\u6B62", "good");
    } catch (e) {
      showToast(`\u505C\u6B62\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
      setTimeout(() => void refreshSvc(), 800);
    }
  };
  const doRestart = async () => {
    setBusy(true);
    try {
      await restartService();
      showToast("\u91CD\u542F\u547D\u4EE4\u5DF2\u53D1\u51FA", "good");
    } catch (e) {
      showToast(`\u91CD\u542F\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
      setTimeout(() => {
        void refreshSvc();
        void reload();
      }, 2500);
    }
  };
  const saveRetention = async () => {
    if (!settings) return;
    const mpb = parseInt(maxPerBucket, 10);
    const cap = parseInt(bodyCapKb, 10);
    const next = {
      ...settings,
      retention: {
        maxPerBucket: Number.isFinite(mpb) ? mpb : settings.retention.maxPerBucket,
        bodyCapKb: Number.isFinite(cap) ? cap : settings.retention.bodyCapKb
      }
    };
    try {
      await saveSettings(next);
      showToast("\u4FDD\u7559\u7B56\u7565\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 5s \u5185\u751F\u6548\uFF09", "good");
      await reload();
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const clearAll = async () => {
    if (!settings) return;
    if (!window.confirm("\u6E05\u7A7A\u5168\u90E8\u6876\u7684\u6355\u83B7\u7559\u75D5\uFF08JSONL \u6587\u4EF6\u91CD\u5199\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09\u3002\u786E\u8BA4\uFF1F")) return;
    setBusy(true);
    try {
      for (const b of settings.buckets) {
        await sendCommand("clear", { bucketId: b.id, confirm: true }, 15e3);
      }
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u6355\u83B7\u7559\u75D5", "good");
      await reload();
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  };
  const svcState = svc?.status || "unknown";
  const svcColor = svcState === "running" ? "#3fb950" : svcState === "failed" || svcState === "dead" ? "#f85149" : "#d29922";
  return /* @__PURE__ */ jsxs4("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxs4("div", { style: card, children: [
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx4("b", { style: { color: "#f4f4f5", fontSize: 13 }, children: "\u540E\u53F0\u6355\u83B7\u670D\u52A1" }),
        /* @__PURE__ */ jsx4("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(255,255,255,.06)", color: svcColor }, children: svcState === "running" ? `\u8FD0\u884C\u4E2D (pid ${svc?.status ? meta?.pid ?? "?" : "?"})` : svcState }),
        svc?.lastError && /* @__PURE__ */ jsx4("span", { style: { fontSize: 10, color: "#f85149" }, children: String(svc.lastError).slice(0, 80) })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { fontSize: 11, color: "#71717a", marginTop: 6, lineHeight: 1.7 }, children: meta ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
        "v",
        meta.version,
        " \xB7 \u7AEF\u53E3 ",
        meta.port,
        " \xB7 \u5FC3\u8DF3 ",
        fmtTime(meta.lastTickAt),
        " \xB7 \u7D2F\u8BA1 ",
        meta.capturesTotal ?? 0,
        " \u6761 \xB7 \u7559\u75D5 ",
        fmtBytes(meta.fileBytes)
      ] }) : "\u670D\u52A1\u65E0\u5FC3\u8DF3\uFF1A\u9762\u677F\u53EF\u8BFB kv \u4F46\u670D\u52A1\u672A\u4E0A\u7EBF\uFF08\u9996\u6B21\u542F\u7528\u7B49\u51E0\u79D2\uFF1B\u4ECD\u65E0\u5219\u70B9\u542F\u52A8\uFF09\u3002" }),
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx4("button", { onClick: doStart, disabled: busy, style: btnPrimary3, children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { onClick: doRestart, disabled: busy, style: btnGhost3, children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx4("button", { onClick: doStop, disabled: busy, style: btnDanger2, children: "\u505C\u6B62" }),
        /* @__PURE__ */ jsx4("button", { onClick: () => void refreshSvc(), style: btnGhost3, children: "\u5237\u65B0\u72B6\u6001" })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { fontSize: 10, color: "#52525b", marginTop: 6 }, children: "\u7AEF\u53E3\u88AB\u5360\u7528\u65F6\u670D\u52A1\u4F1A\u8BDA\u5B9E\u9000\u51FA\uFF1A\u91CA\u653E 9869 \u540E\u70B9\u300C\u542F\u52A8\u300D\u3002\u65E5\u5FD7\u5728\u6570\u636E\u76EE\u5F55 webhook-station.log\uFF08\u5BBF\u4E3B\u4E0D\u6536\u96C6\u670D\u52A1 stdout\uFF09\u3002" })
    ] }),
    settings && /* @__PURE__ */ jsxs4("div", { style: card, children: [
      /* @__PURE__ */ jsx4("b", { style: { color: "#f4f4f5", fontSize: 13 }, children: "\u4FDD\u7559\u7B56\u7565" }),
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs4("label", { style: { ...labelStyle2, width: 180 }, children: [
          "\u6BCF\u6876\u6700\u591A\u4FDD\u7559\u6761\u6570\uFF0810\u2013500\uFF09",
          /* @__PURE__ */ jsx4(
            "input",
            {
              value: maxPerBucket,
              onChange: (e) => setMaxPerBucket(e.target.value),
              placeholder: String(settings.retention.maxPerBucket),
              style: inputStyle2
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("label", { style: { ...labelStyle2, width: 180 }, children: [
          "\u5355\u6761 body \u5B58\u50A8\u4E0A\u9650 KB\uFF088\u20131024\uFF09",
          /* @__PURE__ */ jsx4(
            "input",
            {
              value: bodyCapKb,
              onChange: (e) => setBodyCapKb(e.target.value),
              placeholder: String(settings.retention.bodyCapKb),
              style: inputStyle2
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("button", { onClick: saveRetention, style: btnPrimary3, children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx4("button", { onClick: clearAll, disabled: busy, style: btnDanger2, children: "\u6E05\u7A7A\u5168\u90E8\u7559\u75D5" })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { fontSize: 10, color: "#52525b", marginTop: 6 }, children: "\u8D85\u9650\u81EA\u52A8\u6DD8\u6C70\u6700\u65E7\uFF1B\u7559\u75D5\u6587\u4EF6 8MB \u81EA\u52A8\u8F6E\u8F6C\uFF08\u4FDD\u7559\u4E00\u4EE3 .old\uFF09\u3002" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: card, children: [
      /* @__PURE__ */ jsx4("b", { style: { color: "#f4f4f5", fontSize: 13 }, children: "\u6570\u636E\u4E0E\u9690\u79C1" }),
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 11, color: "#a1a1aa", marginTop: 6, lineHeight: 1.8 }, children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          "\u7559\u75D5\u6587\u4EF6\uFF1A",
          meta?.filePath || "\uFF08\u670D\u52A1\u672A\u4E0A\u7EBF\uFF09"
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          "\u5B58\u50A8\u76EE\u5F55\uFF1A",
          meta?.storeDir || "-"
        ] }),
        /* @__PURE__ */ jsx4("div", { children: "\u952E\u7A7A\u95F4\uFF1Acap.kv \u7684 whs.*\uFF08\u672C\u673A sqlite\uFF09\uFF0C\u6355\u83B7\u9884\u89C8 \u226410KB/\u6761\uFF1B\u5168\u6587\u53EA\u5728\u7559\u75D5\u6587\u4EF6\u3002" }),
        /* @__PURE__ */ jsx4("div", { style: { color: "#d29922" }, children: "\u6355\u83B7\u5185\u5BB9\u53EF\u80FD\u542B\u7B7E\u540D/\u5BC6\u94A5/PII\uFF1A\u6570\u636E\u4E0D\u51FA\u672C\u673A\uFF1B\u8BA9 AI \u5206\u6790\u65F6 hook_get \u5DF2\u5BF9\u654F\u611F\u5934\u8131\u654F\uFF0C\u4F46\u8BF7\u6C42\u4F53\u539F\u6837\u53EF\u8BFB\u2014\u2014\u5171\u4EAB\u5C4F\u5E55\u6216\u8F6C\u53D1\u65E5\u5FD7\u65F6\u6CE8\u610F\u3002" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: card, children: [
      /* @__PURE__ */ jsx4("b", { style: { color: "#f4f4f5", fontSize: 13 }, children: "\u952E\u7A7A\u95F4\u5951\u7EA6\uFF08whs.*\uFF09" }),
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 10, fontFamily: "monospace", color: "#71717a", lineHeight: 1.8, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx4("div", { children: "whs.settings \u2014 \u6876\u914D\u7F6E+\u4FDD\u7559\u7B56\u7565\uFF08\u9762\u677F/MCP \u5199\uFF0C\u670D\u52A1\u8BFB\uFF1B\u670D\u52A1\u4EC5\u7F3A\u5931\u65F6\u5F15\u5BFC\u9ED8\u8BA4\u6876\uFF09" }),
        /* @__PURE__ */ jsx4("div", { children: "whs.meta \u2014 \u670D\u52A1\u5FC3\u8DF3\uFF08\u670D\u52A1\u5199\uFF09" }),
        /* @__PURE__ */ jsx4("div", { children: "whs.rec.<n> \u2014 \u6355\u83B7\u9884\u89C8\u5206\u5757\uFF08\u670D\u52A1\u5355\u5199\u8005\uFF1Brec.0 \u6700\u65B0\uFF0C\u6BCF\u5757 20 \u6761\uFF09" }),
        /* @__PURE__ */ jsxs4("div", { children: [
          "whs.idx \u2014 \u6355\u83B7\u7D22\u5F15 ",
          `{count,total,chunkCount}`
        ] }),
        /* @__PURE__ */ jsx4("div", { children: "whs.cmd.<op>.<nonce> \u2014 \u547D\u4EE4\u952E\uFF08\u9762\u677F/MCP \u5199\uFF0C\u670D\u52A1\u5148\u5220\u540E\u505A\uFF09" }),
        /* @__PURE__ */ jsx4("div", { children: "whs.result.<nonce> \u2014 \u547D\u4EE4\u7ED3\u679C\uFF08\u670D\u52A1\u5199\uFF0C\u8BFB\u540E\u5220\uFF09" })
      ] })
    ] })
  ] });
}
var card = { border: "1px solid #27272a", borderRadius: 8, padding: 10, background: "#131316" };
var labelStyle2 = { fontSize: 11, color: "#a1a1aa", display: "flex", flexDirection: "column", gap: 4 };
var inputStyle2 = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#18181b",
  color: "#d4d4d8",
  minHeight: 28
};
var btnPrimary3 = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  cursor: "pointer",
  minHeight: 30,
  border: "1px solid #3b82f6",
  background: "rgba(59,130,246,.18)",
  color: "#93c5fd"
};
var btnGhost3 = {
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 28,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#a1a1aa"
};
var btnDanger2 = {
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 28,
  border: "1px solid rgba(248,81,73,.5)",
  background: "rgba(248,81,73,.08)",
  color: "#f85149"
};

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var META_FRESH_MS = 90 * 1e3;
var POLL_MS = 2500;
var TABS = [
  { id: "live", label: "\u56DE\u8C03\u6D41" },
  { id: "buckets", label: "\u6876\u4E0E\u5730\u5740" },
  { id: "stats", label: "\u6392\u67E5" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("live");
  const [data, setData] = useState4({ meta: null, settings: null, idx: null, captures: [], loaded: false });
  const [toast, setToast] = useState4(null);
  const toastTimer = useRef(void 0);
  const loadedOnce = useRef(false);
  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback(async () => {
    try {
      const [meta, settings, idx] = await Promise.all([getMeta(), getSettings(), getIdx()]);
      const captures = await readRecChunks(idx?.chunkCount || 0);
      const next = { meta, settings, idx, captures, loaded: true };
      setData(next);
      return next;
    } catch (_) {
      const next = { meta: null, settings: null, idx: null, captures: [], loaded: true };
      setData(next);
      return next;
    }
  }, []);
  useEffect2(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);
  const running = !!(data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < META_FRESH_MS);
  if (data.loaded && !loadedOnce.current) loadedOnce.current = true;
  return /* @__PURE__ */ jsxs5("div", { style: { padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10, color: "#d4d4d8" }, children: [
    /* @__PURE__ */ jsxs5("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx5("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u21A9 Webhook \u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx5("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? `\u6355\u83B7\u4E2D :${data.meta?.port ?? ""}` : "\u670D\u52A1\u79BB\u7EBF" }),
      data.meta?.degraded && running && /* @__PURE__ */ jsx5("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(210,153,34,.15)", color: "#d29922" }, children: "kv \u964D\u7EA7\uFF08\u6355\u83B7\u4E0D\u53D7\u5F71\u54CD\uFF09" }),
      running && /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, color: "#52525b" }, children: [
        "\u7D2F\u8BA1 ",
        data.meta?.capturesTotal ?? 0,
        " \u6761 \xB7 \u7559\u75D5 ",
        data.meta?.filePath ? data.meta.filePath.split(/[\\/]/).slice(-1)[0] : "-"
      ] })
    ] }),
    /* @__PURE__ */ jsx5("div", { style: { display: "flex", gap: 4, overflowX: "auto" }, children: TABS.map((t) => /* @__PURE__ */ jsx5(
      "button",
      {
        onClick: () => setTab(t.id),
        style: {
          padding: "6px 14px",
          fontSize: 12,
          borderRadius: 8,
          cursor: "pointer",
          border: "1px solid",
          minHeight: 32,
          whiteSpace: "nowrap",
          borderColor: tab === t.id ? "#3b82f6" : "#3f3f46",
          background: tab === t.id ? "rgba(59,130,246,.15)" : "transparent",
          color: tab === t.id ? "#93c5fd" : "#a1a1aa"
        },
        children: t.label
      },
      t.id
    )) }),
    /* @__PURE__ */ jsxs5("div", { style: { flex: 1, minHeight: 0, overflowY: "auto" }, children: [
      !data.loaded && /* @__PURE__ */ jsx5("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u8BFB\u53D6\u6570\u636E\u4E2D\u2026" }),
      data.loaded && !running && /* @__PURE__ */ jsxs5("div", { style: {
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(248,81,73,.35)",
        background: "rgba(248,81,73,.08)",
        fontSize: 12,
        color: "#fca5a5",
        marginBottom: 8
      }, children: [
        "\u540E\u53F0\u670D\u52A1\u672A\u8FD0\u884C\uFF1A\u6355\u83B7\u5730\u5740\u4E0D\u53EF\u7528\u3002\u53BB ",
        /* @__PURE__ */ jsx5("b", { children: "\u8BBE\u7F6E" }),
        " \u9875\u542F\u52A8\u670D\u52A1\uFF08\u6216\u68C0\u67E5\u7AEF\u53E3 ",
        9869,
        " \u662F\u5426\u88AB\u5360\u7528\uFF09\u3002"
      ] }),
      tab === "live" && /* @__PURE__ */ jsx5(LiveTab, { data, running, reload, showToast, onSendToChat, onGoTab: setTab }),
      tab === "buckets" && /* @__PURE__ */ jsx5(BucketsTab, { data, running, reload, showToast }),
      tab === "stats" && /* @__PURE__ */ jsx5(StatsTab, { data, onSendToChat }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, reload, showToast, running })
    ] }),
    toast && /* @__PURE__ */ jsx5("div", { style: {
      position: "fixed",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      borderRadius: 8,
      fontSize: 12,
      maxWidth: "80%",
      background: toast.kind === "good" ? "rgba(63,185,80,.92)" : toast.kind === "bad" ? "rgba(248,81,73,.92)" : "rgba(59,130,246,.92)",
      color: "#fff",
      zIndex: 50
    }, children: toast.msg }),
    /* @__PURE__ */ jsx5("div", { style: { fontSize: 10, color: "#52525b" }, children: "\u6570\u636E\u53EA\u5B58\u672C\u673A\uFF08captures.jsonl + \u672C\u673A kv\uFF09\uFF0C\u65E0\u5916\u53D1\u8DEF\u5F84\uFF1B\u654F\u611F payload \u6CE8\u610F\u52FF\u5728\u5171\u4EAB\u5C4F\u5E55\u65F6\u5C55\u793A\u3002" })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function WebhookStationEntry(props) {
  return /* @__PURE__ */ jsx6(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  WebhookStationEntry as default
};
