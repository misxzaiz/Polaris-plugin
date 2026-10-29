var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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

// shared/dig-core.js
var require_dig_core = __commonJS({
  "shared/dig-core.js"(exports, module) {
    "use strict";
    var CHUNK_SIZE = 200;
    var STATUS = {
      PENDING: "pending",
      // 从未检查
      OK: "ok",
      // 2xx 直达
      REDIRECT: "redirect",
      // 经重定向后 2xx
      DEAD_4XX: "dead4xx",
      // 4xx（大多真死：404/410）
      DEAD_5XX: "dead5xx",
      // 5xx（可能暂时）
      DNS: "dns",
      // 域名解析失败（基本真死）
      TIMEOUT: "timeout",
      // 超时
      SSL: "ssl",
      // 证书错误
      BLOCKED: "blocked",
      // SSRF 守卫拒绝（内网等）
      INVALID: "invalid"
      // 非 http(s) 或 URL 非法
    };
    var DEAD_STATUSES = /* @__PURE__ */ new Set([STATUS.DEAD_4XX, STATUS.DEAD_5XX, STATUS.DNS, STATUS.TIMEOUT, STATUS.SSL, STATUS.BLOCKED, STATUS.INVALID]);
    var ALIVE_STATUSES = /* @__PURE__ */ new Set([STATUS.OK, STATUS.REDIRECT]);
    var TRACK_PARAM_RE = /^(utm_|fbclid$|gclid$|igshid$|spm$|scm$|share_|sh_|vd_source$|from$|ref$|referrer$|source$|subtaskid$|fr$|share_token$)/i;
    function fnv1a(str, seed) {
      let h = seed >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h >>> 0;
    }
    function hashKey(normKey) {
      return (fnv1a(normKey, 2166136261).toString(16) + fnv1a(normKey, 3735928559).toString(16)).padStart(16, "0");
    }
    function normalizeUrl(rawUrl) {
      const raw = String(rawUrl || "").trim();
      if (!raw) return { error: "\u7A7A\u5730\u5740" };
      let u;
      try {
        u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      } catch (_) {
        return { error: "URL \u975E\u6CD5" };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return { error: `\u975E http(s)\uFF1A${u.protocol}` };
      u.hash = "";
      u.hostname = u.hostname.toLowerCase();
      if (u.protocol === "http:" && u.port === "80" || u.protocol === "https:" && u.port === "443") u.port = "";
      const params = [...u.searchParams.entries()].filter(([k]) => !TRACK_PARAM_RE.test(k)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      u.search = "";
      for (const [k, v] of params) u.searchParams.append(k, v);
      if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
      return { url: u.toString(), normKey: u.toString(), host: u.hostname };
    }
    function classifyUrl(url) {
      let host = "";
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch (_) {
        return "\u5176\u4ED6";
      }
      const inHost = (...keys) => keys.some((k) => host.includes(k));
      if (inHost("github.com", "gitee.com", "gitlab", "gitcode")) return "\u4EE3\u7801\u4ED3\u5E93";
      if (inHost("stackoverflow.com", "stackexchange", "segmentfault", "oschina", "juejin", "v2ex", "zhihu.com", "cSDN", "cnblogs")) return "\u6280\u672F\u793E\u533A";
      if (inHost("docs.", "developer.", "api.", "/docs", "mdn", "reactjs.org", "vuejs.org", "rust-lang", "python.org", "nodejs.org", "learn.")) return "\u6587\u6863";
      if (inHost("youtube.com", "bilibili.com", "douyin", "ixigua", "youku", "vimeo")) return "\u89C6\u9891";
      if (inHost("arxiv.org", "scholar.google", "semanticscholar", "ACM", "ieee", "paper")) return "\u8BBA\u6587";
      if (inHost("taobao", "jd.com", "tmall", "pinduoduo", "smzdm", "amazon", "suning")) return "\u8D2D\u7269";
      if (inHost("douban", "weibo", "x.com", "twitter", "facebook", "instagram", "xiaohongshu", "tieba")) return "\u793E\u4EA4";
      if (inHost("music.163", "music.", "spotify", "y.qq.com")) return "\u97F3\u4E50";
      if (inHost("notion", "yuque", "feishu", "docs.qq.com", "shimo", "confluence")) return "\u7B14\u8BB0\u534F\u4F5C";
      if (inHost("baidu.com", "google.com/search", "bing.com")) return "\u641C\u7D22";
      if (inHost("pan.baidu", "lanzou", "cloud.aliyun", "1drv", "drive.google")) return "\u7F51\u76D8";
      if (inHost("tool", "converter", "regex", "json", "\u5728\u7EBF", "online-")) return "\u5DE5\u5177";
      return "\u5176\u4ED6";
    }
    function decodeEntities(s) {
      return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        try {
          return String.fromCodePoint(parseInt(h, 16));
        } catch (_2) {
          return "";
        }
      }).replace(/&#(\d+);/g, (_, d) => {
        try {
          return String.fromCodePoint(parseInt(d, 10));
        } catch (_2) {
          return "";
        }
      }).replace(/&amp;/g, "&");
    }
    function parseNetscapeHtml(html) {
      const records = [];
      let skipped = 0;
      if (!html || !/<a\s/i.test(html)) return { records, skipped };
      const lines = String(html).split(/\r?\n/);
      const folderStack = [];
      let dlDepth = 0;
      const aRe = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
      const addDateRe = /add_date\s*=\s*["']?(\d{9,13})["']?/i;
      const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/i;
      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (/<dl/i.test(line)) {
          dlDepth += (line.match(/<dl/gi) || []).length;
          continue;
        }
        if (/<\/dl/i.test(line)) {
          dlDepth = Math.max(0, dlDepth - (line.match(/<\/dl/gi) || []).length);
          if (folderStack.length > Math.max(0, dlDepth - 1)) folderStack.length = Math.max(0, dlDepth - 1);
          continue;
        }
        const h3 = line.match(h3Re);
        if (h3) {
          if (dlDepth >= 1) folderStack[dlDepth - 1] = decodeEntities(h3[1]).trim();
          continue;
        }
        const m = line.match(aRe);
        if (!m) continue;
        const url = decodeEntities(m[1]).trim();
        if (!/^https?:\/\//i.test(url)) {
          skipped += 1;
          continue;
        }
        const title = decodeEntities(m[2]).replace(/<[^>]+>/g, "").trim();
        const addM = line.match(addDateRe);
        let addedAt = Date.now();
        if (addM) {
          const n = Number(addM[1]);
          addedAt = n < 1e11 ? n * 1e3 : n;
        }
        records.push({ url, title: title.slice(0, 300), folder: folderStack.slice(0, Math.max(0, dlDepth - 1)).filter(Boolean).join(" / "), addedAt });
      }
      return { records, skipped };
    }
    function makeRecord(parsed, now) {
      const norm = normalizeUrl(parsed.url);
      if (norm.error) return { error: norm.error };
      return {
        id: hashKey(norm.normKey),
        url: norm.url,
        normKey: norm.normKey,
        host: norm.host,
        title: parsed.title || norm.host,
        folder: parsed.folder || "",
        addedAt: Number(parsed.addedAt) || now,
        importedAt: now,
        source: parsed.source || "netscape",
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
        status: STATUS.PENDING,
        lastCheckedAt: 0,
        lastOkAt: 0,
        lastVisitAt: 0,
        lastResurfaceAt: 0,
        httpStatus: 0,
        finalUrl: "",
        latencyMs: 0,
        failReason: "",
        tries: 0
      };
    }
    function patchRecord(rec, patch) {
      return { ...rec, ...patch };
    }
    function chunkRecords(records) {
      const chunks = [];
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        chunks.push({ n: Math.floor(i / CHUNK_SIZE), items: records.slice(i, i + CHUNK_SIZE) });
      }
      return chunks;
    }
    function mergeRecords(existing, incoming, now) {
      const byKey = new Map(existing.map((r) => [r.normKey, r]));
      const toUpsert = [];
      const duplicateIds = [];
      let invalid = 0;
      let added = 0;
      let updated = 0;
      for (const raw of incoming) {
        const rec = makeRecord(raw, now);
        if (rec.error) {
          invalid += 1;
          continue;
        }
        const cur = byKey.get(rec.normKey);
        if (!cur) {
          byKey.set(rec.normKey, rec);
          toUpsert.push(rec);
          added += 1;
          continue;
        }
        duplicateIds.push(cur.id);
        const patch = {};
        if (rec.addedAt && (!cur.addedAt || rec.addedAt < cur.addedAt)) patch.addedAt = rec.addedAt;
        if ((rec.title || "").length > (cur.title || "").length) patch.title = rec.title;
        if (rec.folder && !cur.folder) patch.folder = rec.folder;
        const tagSet = /* @__PURE__ */ new Set([...cur.tags || [], ...rec.tags || []]);
        if (tagSet.size !== (cur.tags || []).length) patch.tags = [...tagSet].slice(0, 8);
        if (Object.keys(patch).length) {
          const next = patchRecord(cur, patch);
          byKey.set(rec.normKey, next);
          toUpsert.push(next);
          updated += 1;
        }
      }
      return { toUpsert, duplicateIds: [...new Set(duplicateIds)], invalid, added, updated };
    }
    function planCheckQueue(records, opts) {
      const limit = Math.max(1, Math.min(2e3, Number(opts.limit) || 200));
      const recheckDays = Math.max(0, Number(opts.recheckDays) || 0);
      const now = Date.now();
      let pool = records;
      if (opts.deadOnly) {
        pool = pool.filter((r) => DEAD_STATUSES.has(r.status) && (r.tries || 0) < 5);
      } else if (recheckDays > 0) {
        pool = pool.filter((r) => !r.lastCheckedAt || now - r.lastCheckedAt > recheckDays * 86400 * 1e3);
      }
      const pending = pool.filter((r) => !r.lastCheckedAt).sort((a, b) => (a.importedAt || 0) - (b.importedAt || 0));
      const stale = pool.filter((r) => r.lastCheckedAt).sort((a, b) => (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0));
      return [...pending, ...stale].slice(0, limit).map((r) => r.id);
    }
    function isFetchableUrl(rawUrl) {
      let u;
      try {
        u = new URL(String(rawUrl || ""));
      } catch (_) {
        return false;
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      let h = u.hostname.toLowerCase().replace(/\.$/, "");
      if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
      if (u.username || u.password) return false;
      if (h.startsWith("[") && h.endsWith("]")) {
        const h6 = h.slice(1, -1);
        if (h6 === "::1" || h6 === "::" || h6 === "0:0:0:0:0:0:0:1") return false;
        if (/^f[cd]/.test(h6) || /^fe[89ab]/.test(h6)) return false;
        return true;
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
        const parts = h.split(".").map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
        return true;
      }
      return true;
    }
    function classifyHttp(statusCode, opts) {
      if (opts && opts.redirected) return statusCode >= 200 && statusCode < 300 ? STATUS.REDIRECT : classifyHttp(statusCode);
      if (statusCode >= 200 && statusCode < 300) return STATUS.OK;
      if (statusCode >= 300 && statusCode < 400) return STATUS.REDIRECT;
      if (statusCode >= 400 && statusCode < 500) return STATUS.DEAD_4XX;
      return STATUS.DEAD_5XX;
    }
    function rollup(records) {
      const byStatus = {};
      const byCategory = {};
      const deadDomains = /* @__PURE__ */ new Map();
      let alive = 0;
      let dead = 0;
      let pending = 0;
      let duplicates = 0;
      const seenKeys = /* @__PURE__ */ new Set();
      for (const r of records) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        const cat = r.tags && r.tags.length ? `\u5DF2\u6807\u7B7E(${r.tags.length})` : classifyUrl(r.url);
        byCategory[cat] = (byCategory[cat] || 0) + 1;
        if (ALIVE_STATUSES.has(r.status)) alive += 1;
        else if (DEAD_STATUSES.has(r.status)) {
          dead += 1;
          deadDomains.set(r.host, (deadDomains.get(r.host) || 0) + 1);
        } else pending += 1;
        if (seenKeys.has(r.normKey)) duplicates += 1;
        seenKeys.add(r.normKey);
      }
      const topDeadDomains = [...deadDomains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([host, count]) => ({ host, count }));
      const categories = Object.entries(byCategory).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      return { total: records.length, alive, dead, pending, duplicates, byStatus, categories, topDeadDomains };
    }
    function searchRecords(records, query, opts) {
      const q = String(query || "").trim().toLowerCase();
      const statusFilter = opts && opts.status;
      const categoryFilter = opts && opts.category;
      const domainFilter = opts && opts.domain;
      let out = records;
      if (statusFilter === "dead") out = out.filter((r) => DEAD_STATUSES.has(r.status));
      else if (statusFilter === "alive") out = out.filter((r) => ALIVE_STATUSES.has(r.status));
      else if (statusFilter === "pending") out = out.filter((r) => r.status === STATUS.PENDING);
      if (domainFilter) out = out.filter((r) => r.host.includes(String(domainFilter).toLowerCase()));
      if (categoryFilter) out = out.filter((r) => classifyUrl(r.url) === categoryFilter);
      if (q) {
        out = out.filter((r) => (r.title || "").toLowerCase().includes(q) || (r.url || "").toLowerCase().includes(q) || (r.folder || "").toLowerCase().includes(q) || (r.tags || []).some((t) => String(t).toLowerCase().includes(q)));
      }
      return out;
    }
    function pickResurface(records, opts) {
      const rng = opts && opts.rng || Math;
      const now = opts && opts.now || Date.now();
      const avoid = new Set(opts && opts.avoidIds || []);
      const pool = records.filter((r) => ALIVE_STATUSES.has(r.status) && !avoid.has(r.id));
      if (!pool.length) return null;
      let best = null;
      let bestScore = -1;
      for (const r of pool) {
        const lastTouch = Math.max(r.lastResurfaceAt || 0, r.lastVisitAt || 0, r.lastCheckedAt || 0, r.importedAt || 0);
        const idleDays = Math.max(0, (now - lastTouch) / 86400 / 1e3);
        const ageYears = Math.max(0, (now - (r.addedAt || now)) / (365 * 86400 * 1e3));
        const score = idleDays * (1 + ageYears / 10) * (0.8 + 0.4 * rng.random());
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      return best;
    }
    function toCsv(records) {
      const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const head = ["title", "url", "folder", "status", "httpStatus", "category", "addedAt", "lastCheckedAt"];
      const lines = [head.join(",")];
      for (const r of records) {
        lines.push([esc(r.title), esc(r.url), esc(r.folder), esc(r.status), esc(r.httpStatus || ""), esc(classifyUrl(r.url)), esc(r.addedAt || ""), esc(r.lastCheckedAt || "")].join(","));
      }
      return "\uFEFF" + lines.join("\n");
    }
    function normalizeSettings3(raw) {
      const r = raw && typeof raw === "object" ? raw : {};
      const num = (v, d, min, max) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d;
      return {
        batchSize: num(r.batchSize, 200, 20, 2e3),
        concurrency: num(r.concurrency, 6, 1, 12),
        timeoutMs: num(r.timeoutMs, 12e3, 3e3, 3e4),
        recheckDays: num(r.recheckDays, 0, 0, 365),
        autoCheckOnImport: r.autoCheckOnImport !== false,
        checkEnabled: r.checkEnabled !== false
      };
    }
    module.exports = {
      CHUNK_SIZE,
      STATUS,
      DEAD_STATUSES,
      ALIVE_STATUSES,
      hashKey,
      normalizeUrl,
      classifyUrl,
      parseNetscapeHtml,
      decodeEntities,
      makeRecord,
      patchRecord,
      chunkRecords,
      mergeRecords,
      planCheckQueue,
      isFetchableUrl,
      classifyHttp,
      rollup,
      searchRecords,
      pickResurface,
      toCsv,
      normalizeSettings: normalizeSettings3
    };
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  K: () => K,
  copyText: () => copyText,
  core: () => core,
  fmtTime: () => fmtTime,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet,
  listServiceStatus: () => listServiceStatus,
  loadMeta: () => loadMeta,
  loadReports: () => loadReports,
  loadRun: () => loadRun,
  loadSettings: () => loadSettings,
  normalizeSettings: () => normalizeSettings2,
  pollResult: () => pollResult,
  readAllRecords: () => readAllRecords,
  saveSettings: () => saveSettings,
  sendCmd: () => sendCmd,
  sendImportBatches: () => sendImportBatches,
  serviceAction: () => serviceAction,
  statusColor: () => statusColor,
  statusLabel: () => statusLabel
});
function normalizeSettings2(raw) {
  return core.normalizeSettings(raw);
}
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
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key }).catch(() => {
  });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" }).catch(() => null);
  return r && Array.isArray(r.keys) ? r.keys : [];
}
async function readAllRecords() {
  const keys = await kvKeys();
  const nums = keys.filter((k) => k.startsWith(K.recPrefix)).map((k) => Number(k.slice(K.recPrefix.length))).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  const chunks = await Promise.all(nums.map(async (n) => kvGet(K.recPrefix + n)));
  const out = [];
  for (const c of chunks) if (Array.isArray(c)) {
    for (const r of c) if (r && r.id && r.normKey) out.push(r);
  }
  return out;
}
async function loadReports() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.reportPrefix)).sort();
  const reports = await Promise.all(ids.map(async (k) => kvGet(K.reportPrefix + k)));
  return reports.filter(Boolean);
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
async function sendImportBatches(records) {
  const batches = Math.ceil(records.length / 400);
  for (let i = 0; i < batches; i++) {
    await kvSet(`${K.cmdPrefix}import.${i}`, { records: records.slice(i * 400, (i + 1) * 400), totalBatches: batches, at: Date.now() });
  }
  return batches;
}
async function sendCmd(op, payload = {}) {
  const nonce = "c" + uid();
  await kvSet(`${K.cmdPrefix}${op}.${nonce}`, { ...payload, nonce, at: Date.now() });
  return nonce;
}
async function pollResult(nonce, timeoutMs = 3e4, stepMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, stepMs));
    const r = await kvGet(K.resultPrefix + nonce).catch(() => null);
    if (r) {
      kvDel(K.resultPrefix + nonce).catch(() => {
      });
      return r;
    }
  }
  return null;
}
async function loadMeta() {
  return kvGet(K.meta);
}
async function loadRun() {
  return kvGet(K.run);
}
async function loadSettings() {
  return normalizeSettings2(await kvGet(K.settings));
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
function fmtTime(ts) {
  if (!ts) return "\u2014";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function statusLabel(s) {
  const map = {
    pending: "\u672A\u68C0\u67E5",
    ok: "\u5B58\u6D3B",
    redirect: "\u91CD\u5B9A\u5411",
    dead4xx: "\u6B7B\u94FE(4xx)",
    dead5xx: "5xx",
    dns: "\u57DF\u540D\u5931\u6548",
    timeout: "\u8D85\u65F6",
    ssl: "\u8BC1\u4E66\u9519\u8BEF",
    blocked: "\u5185\u7F51\u62D2\u68C0",
    invalid: "\u975E\u6CD5URL"
  };
  return map[s] || s;
}
function statusColor(s) {
  if (s === "ok" || s === "redirect") return "#3aa76d";
  if (s === "pending") return "#9aa0a6";
  if (s === "dead5xx" || s === "timeout") return "#d9a13b";
  return "#d9564a";
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
async function discoverSelf(pluginId) {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId);
  if (!self || !self.installPath) return null;
  return { installPath: self.installPath, services: self.contributes?.services ?? [] };
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
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch (_) {
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (_) {
    ok = false;
  }
  document.body.removeChild(ta);
  if (ok) return "copied";
  window.prompt("\u624B\u673A\u7AEF\u81EA\u52A8\u590D\u5236\u4E0D\u53EF\u7528\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\uFF1A", text);
  return "manual";
}
var core, K;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    core = __toESM(require_dig_core());
    K = {
      settings: "bmd.settings",
      meta: "bmd.meta",
      run: "bmd.run",
      recPrefix: "bmd.rec.",
      cmdPrefix: "bmd.cmd.",
      resultPrefix: "bmd.result.",
      reportPrefix: "bmd.report."
    };
  }
});

// src/Panel.tsx
init_model();
import React5 from "react";

// src/OverviewTab.tsx
init_model();
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var S = {
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },
  card: { padding: "12px 14px", borderRadius: 10, background: "var(--p-panel, rgba(128,128,128,.08))" },
  num: { fontSize: 24, fontWeight: 700 },
  label: { fontSize: 12, color: "var(--p-text-dim, #999)", marginTop: 2 },
  panel: { padding: "12px 14px", borderRadius: 10, background: "var(--p-panel, rgba(128,128,128,.08))", marginBottom: 10 },
  bar: { display: "flex", height: 10, borderRadius: 5, overflow: "hidden", margin: "6px 0" },
  chip: { padding: "2px 10px", borderRadius: 999, fontSize: 11, background: "var(--p-chip, rgba(128,128,128,.15))", marginRight: 6, display: "inline-block", marginBottom: 4 },
  btn: { padding: "5px 12px", borderRadius: 8, border: "1px solid var(--p-border, rgba(128,128,128,.3))", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 },
  btnAccent: { padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--p-accent, #4a7dff)", color: "#fff", cursor: "pointer", fontSize: 13 },
  link: { color: "var(--p-accent, #4a7dff)", textDecoration: "none" }
};
function OverviewTab({ records, meta, settings, onResurface, lastResurfaced, onStartRecheckDead, busy }) {
  const roll = React.useMemo(() => core.rollup(records), [records]);
  const svcAlive = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1e3);
  const total = Math.max(1, roll.total);
  const seg = (n) => `${n / total * 100}%`;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: S.cards, children: [
      /* @__PURE__ */ jsxs("div", { style: S.card, children: [
        /* @__PURE__ */ jsx("div", { style: S.num, children: roll.total }),
        /* @__PURE__ */ jsx("div", { style: S.label, children: "\u4E66\u7B7E\u603B\u6570" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.card, children: [
        /* @__PURE__ */ jsx("div", { style: { ...S.num, color: "#3aa76d" }, children: roll.alive }),
        /* @__PURE__ */ jsx("div", { style: S.label, children: "\u5B58\u6D3B" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.card, children: [
        /* @__PURE__ */ jsx("div", { style: { ...S.num, color: "#d9564a" }, children: roll.dead }),
        /* @__PURE__ */ jsx("div", { style: S.label, children: "\u6B7B\u94FE" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.card, children: [
        /* @__PURE__ */ jsx("div", { style: { ...S.num, color: "#9aa0a6" }, children: roll.pending }),
        /* @__PURE__ */ jsx("div", { style: S.label, children: "\u5F85\u68C0\u67E5" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.card, children: [
        /* @__PURE__ */ jsx("div", { style: { ...S.num, color: roll.duplicates ? "#d9a13b" : "#9aa0a6" }, children: roll.duplicates }),
        /* @__PURE__ */ jsx("div", { style: S.label, children: "\u91CD\u590D" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { height: 10 } }),
    /* @__PURE__ */ jsxs("div", { style: S.panel, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)" }, children: "\u72B6\u6001\u5206\u5E03" }),
      /* @__PURE__ */ jsx("div", { style: S.bar, children: Object.entries(roll.byStatus).map(([s, n]) => /* @__PURE__ */ jsx("div", { style: { width: seg(n), background: statusColor(s) }, title: `${statusLabel(s)}: ${n}` }, s)) }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 2 }, children: Object.entries(roll.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => /* @__PURE__ */ jsxs("span", { style: { ...S.chip, borderLeft: `3px solid ${statusColor(s)}` }, children: [
        statusLabel(s),
        " ",
        n
      ] }, s)) }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 8, fontSize: 12, color: "var(--p-text-dim, #999)" }, children: "\u5206\u7C7B Top" }),
      /* @__PURE__ */ jsx("div", { children: roll.categories.slice(0, 8).map((c) => /* @__PURE__ */ jsxs("span", { style: S.chip, children: [
        c.name,
        " ",
        c.count
      ] }, c.name)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.panel, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("strong", { children: "\u{1F3B2} \u4ECA\u5929\u6316\u51FA" }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { style: S.btnAccent, disabled: busy || !records.length, onClick: () => {
          const r = core.pickResurface(records, { avoidIds: lastResurfaced ? [lastResurfaced.id] : [] });
          if (r) onResurface(r);
        }, children: "\u6316\u4E00\u6761" })
      ] }),
      lastResurfaced ? /* @__PURE__ */ jsxs("div", { style: { lineHeight: 1.8 }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontWeight: 600 }, children: lastResurfaced.title || lastResurfaced.host }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)" }, children: [
          lastResurfaced.folder ? `${lastResurfaced.folder} \xB7 ` : "",
          "\u5B58\u4E8E ",
          fmtTime(lastResurfaced.addedAt),
          " \xB7 \u5206\u7C7B ",
          core.classifyUrl(lastResurfaced.url)
        ] }),
        /* @__PURE__ */ jsx("a", { href: lastResurfaced.url, target: "_blank", rel: "noreferrer", style: S.link, children: lastResurfaced.url }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 4 }, children: /* @__PURE__ */ jsx("span", { style: S.chip, children: "\u5DF2\u8BB0\u5F55\u672C\u6B21\u91CD\u8BBF" }) })
      ] }) : /* @__PURE__ */ jsx("div", { style: { color: "var(--p-text-dim, #999)", fontSize: 12 }, children: "\u4ECE\u300C\u6D3B\u7740\u7684\u4E66\u7B7E\u300D\u6309\u6C89\u7761\u65F6\u957F \xD7 \u4E66\u9F84\u52A0\u6743\u968F\u673A\u635E\u4E00\u6761\u8001\u4E66\u7B7E\u91CD\u8BBF\u2014\u2014\u8003\u53E4\u7684\u610F\u4E49\u4E0D\u662F\u6E05\u5355\uFF0C\u662F\u91CD\u9022\u3002" })
    ] }),
    roll.topDeadDomains.length > 0 && /* @__PURE__ */ jsxs("div", { style: S.panel, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("strong", { children: "\u{1F480} \u6B7B\u94FE\u91CD\u707E\u533A" }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { style: S.btn, disabled: busy, onClick: onStartRecheckDead, children: "\u91CD\u67E5\u6B7B\u94FE\uFF08\u53EF\u80FD\u662F\u6682\u65F6\u62BD\u98CE\uFF09" })
      ] }),
      roll.topDeadDomains.map((d) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12.5 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }, children: d.host }),
        /* @__PURE__ */ jsxs("span", { style: { color: "#d9564a" }, children: [
          d.count,
          " \u6761"
        ] })
      ] }, d.host))
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)", padding: "4px 2px" }, children: [
      "\u670D\u52A1\uFF1A",
      meta ? svcAlive ? `\u8FD0\u884C\u4E2D\uFF08\u6865 ${meta.bridge || "?"}${meta.degraded ? " \xB7 \u964D\u7EA7\u4E2D" : ""}\uFF0C\u5E93\u5185 ${meta.records ?? "\u2014"} \u6761\uFF09` : "\u5FC3\u8DF3\u8FC7\u671F\uFF08\u53EF\u80FD\u5DF2\u505C\u6B62\uFF0C\u53BB\u8BBE\u7F6E\u9875\u542F\u52A8\uFF09" : "\u5C1A\u65E0\u5FC3\u8DF3",
      settings ? ` \xB7 \u5E76\u53D1 ${settings.concurrency} / \u8D85\u65F6 ${Math.round(settings.timeoutMs / 1e3)}s / \u6279\u91CF ${settings.batchSize}` : ""
    ] })
  ] });
}

// src/LibraryTab.tsx
init_model();
import React2 from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PAGE = 50;
var CATS = ["\u4EE3\u7801\u4ED3\u5E93", "\u6280\u672F\u793E\u533A", "\u6587\u6863", "\u89C6\u9891", "\u8BBA\u6587", "\u8D2D\u7269", "\u793E\u4EA4", "\u97F3\u4E50", "\u7B14\u8BB0\u534F\u4F5C", "\u641C\u7D22", "\u7F51\u76D8", "\u5DE5\u5177", "\u5176\u4ED6"];
var S2 = {
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 },
  input: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit",
    fontSize: 12.5
  },
  sel: {
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit",
    fontSize: 12.5
  },
  item: { padding: "8px 10px", borderRadius: 8, background: "var(--p-panel, rgba(128,128,128,.08))", marginBottom: 6 },
  title: { fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sub: { fontSize: 11.5, color: "var(--p-text-dim, #999)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  btn: { padding: "3px 10px", borderRadius: 6, border: "1px solid var(--p-border, rgba(128,128,128,.3))", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 11.5 },
  btnDanger: { padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(220,80,80,.4)", background: "transparent", color: "#d9564a", cursor: "pointer", fontSize: 11.5 },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6 }
};
function LibraryTab({ records, busy, onRecheck, onVisit, onRemove }) {
  const [q, setQ] = React2.useState("");
  const [status, setStatus] = React2.useState("");
  const [cat, setCat] = React2.useState("");
  const [page, setPage] = React2.useState(0);
  const filtered = React2.useMemo(() => {
    const out = core.searchRecords(records, q, { status: status || void 0, category: cat || void 0 });
    return out.sort((a, b) => (b.lastCheckedAt || 0) - (a.lastCheckedAt || 0) || (b.importedAt || 0) - (a.importedAt || 0));
  }, [records, q, status, cat]);
  React2.useEffect(() => {
    setPage(0);
  }, [q, status, cat]);
  const pageItems = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: S2.row, children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          style: { ...S2.input, flex: 1, minWidth: 160 },
          placeholder: "\u641C\u7D22\u6807\u9898/URL/\u6587\u4EF6\u5939/\u6807\u7B7E\u2026",
          value: q,
          onChange: (e) => setQ(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs2("select", { style: S2.sel, value: status, onChange: (e) => setStatus(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u72B6\u6001" }),
        /* @__PURE__ */ jsx2("option", { value: "alive", children: "\u5B58\u6D3B" }),
        /* @__PURE__ */ jsx2("option", { value: "dead", children: "\u6B7B\u94FE" }),
        /* @__PURE__ */ jsx2("option", { value: "pending", children: "\u672A\u68C0\u67E5" })
      ] }),
      /* @__PURE__ */ jsxs2("select", { style: S2.sel, value: cat, onChange: (e) => setCat(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u5206\u7C7B" }),
        CATS.map((c) => /* @__PURE__ */ jsx2("option", { value: c, children: c }, c))
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)", marginBottom: 8 }, children: [
      filtered.length,
      " \u6761",
      pages > 1 ? ` \xB7 \u7B2C ${page + 1}/${pages} \u9875` : ""
    ] }),
    pageItems.map((r) => /* @__PURE__ */ jsxs2("div", { style: S2.item, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsx2("span", { style: { ...S2.dot, background: statusColor(r.status), flexShrink: 0 }, title: statusLabel(r.status) }),
        /* @__PURE__ */ jsx2("div", { style: { ...S2.title, flex: 1 }, children: r.title || r.host }),
        /* @__PURE__ */ jsx2("button", { style: S2.btn, disabled: busy, title: "\u5355\u6761\u91CD\u67E5", onClick: () => onRecheck([r.id]), children: "\u91CD\u67E5" }),
        /* @__PURE__ */ jsx2("button", { style: S2.btn, disabled: busy, title: "\u8BB0\u5F55\u4E00\u6B21\u91CD\u8BBF\uFF08\u5F71\u54CD\u590D\u6D3B\u6743\u91CD\uFF09", onClick: () => onVisit(r), children: "\u91CD\u8BBF" }),
        /* @__PURE__ */ jsx2("button", { style: S2.btnDanger, disabled: busy, onClick: () => onRemove([r.id]), children: "\u5220" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: S2.sub, children: [
        statusLabel(r.status),
        r.httpStatus ? ` \xB7 HTTP ${r.httpStatus}` : "",
        r.latencyMs ? ` \xB7 ${r.latencyMs}ms` : "",
        r.status === "redirect" && r.finalUrl ? " \xB7 \u5DF2\u91CD\u5B9A\u5411" : "",
        r.failReason ? ` \xB7 ${r.failReason}` : ""
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: S2.sub, children: [
        r.folder ? `${r.folder} \xB7 ` : "",
        core.classifyUrl(r.url),
        " \xB7 \u5B58\u4E8E ",
        fmtTime(r.addedAt),
        " \xB7 \u67E5\u4E8E ",
        fmtTime(r.lastCheckedAt),
        r.tags.length ? ` \xB7 \u{1F3F7} ${r.tags.join(", ")}` : ""
      ] }),
      /* @__PURE__ */ jsx2("a", { href: r.url, target: "_blank", rel: "noreferrer", style: { ...S2.sub, color: "var(--p-accent, #4a7dff)", textDecoration: "none" }, children: r.url })
    ] }, r.id)),
    filtered.length === 0 && /* @__PURE__ */ jsx2("div", { style: { color: "var(--p-text-dim, #999)", padding: 20, textAlign: "center" }, children: records.length ? "\u6CA1\u6709\u5339\u914D\u7684\u4E66\u7B7E\u3002" : "\u4E66\u7B7E\u5E93\u8FD8\u662F\u7A7A\u7684\u2014\u2014\u53BB\u300C\u68C0\u67E5\u300D\u9875\u5BFC\u5165\u6D4F\u89C8\u5668\u4E66\u7B7E\u5BFC\u51FA\u6587\u4EF6\u3002" }),
    pages > 1 && /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }, children: [
      /* @__PURE__ */ jsx2("button", { style: S2.btn, disabled: page === 0, onClick: () => setPage(page - 1), children: "\u4E0A\u4E00\u9875" }),
      /* @__PURE__ */ jsxs2("span", { style: { fontSize: 12, color: "var(--p-text-dim, #999)", alignSelf: "center" }, children: [
        page + 1,
        " / ",
        pages
      ] }),
      /* @__PURE__ */ jsx2("button", { style: S2.btn, disabled: page >= pages - 1, onClick: () => setPage(page + 1), children: "\u4E0B\u4E00\u9875" })
    ] })
  ] });
}

// src/CheckTab.tsx
init_model();
import React3 from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var S3 = {
  panel: { padding: "12px 14px", borderRadius: 10, background: "var(--p-panel, rgba(128,128,128,.08))", marginBottom: 10 },
  btn: { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--p-border, rgba(128,128,128,.3))", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12.5 },
  btnAccent: { padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--p-accent, #4a7dff)", color: "#fff", cursor: "pointer", fontSize: 13 },
  btnDanger: { padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(220,80,80,.4)", background: "transparent", color: "#d9564a", cursor: "pointer", fontSize: 12.5 },
  input: {
    flex: 1,
    minWidth: 200,
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit",
    fontSize: 12.5
  },
  bar: { height: 12, borderRadius: 6, overflow: "hidden", background: "var(--p-chip, rgba(128,128,128,.15))", margin: "8px 0" },
  dim: { fontSize: 12, color: "var(--p-text-dim, #999)" },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }
};
function dupGroups(records) {
  const byKey = /* @__PURE__ */ new Map();
  for (const r of records) {
    const arr = byKey.get(r.normKey) || [];
    arr.push(r);
    byKey.set(r.normKey, arr);
  }
  return [...byKey.entries()].filter(([, v]) => v.length > 1).map(([key, items]) => ({ key, items })).sort((a, b) => b.items.length - a.items.length);
}
function CheckTab({ records, run, reports, busy, pluginId, onImportDone, onErr, onChanged, onOpenTab, onRemove }) {
  const [importing, setImporting] = React3.useState(false);
  const [path, setPath] = React3.useState("");
  const [showDups, setShowDups] = React3.useState(false);
  const dups = React3.useMemo(() => dupGroups(records), [records]);
  const importFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const html = await file.text();
      const parsed = core.parseNetscapeHtml(html);
      if (!parsed.records.length) throw new Error(`\u6CA1\u89E3\u6790\u5230\u4E66\u7B7E\uFF08\u8DF3\u8FC7 ${parsed.skipped} \u884C\uFF09\u2014\u2014\u786E\u8BA4\u662F\u6D4F\u89C8\u5668\u5BFC\u51FA\u7684 HTML\uFF08\u4E66\u7B7E\u7BA1\u7406\u5668 \u2192 \u5BFC\u51FA\u4E66\u7B7E\uFF09`);
      const batches = await sendImportBatches(parsed.records);
      onImportDone(`\u5DF2\u89E3\u6790 ${parsed.records.length} \u6761\uFF08\u8DF3\u8FC7 ${parsed.skipped} \u884C\uFF09\uFF0C\u5206 ${batches} \u6279\u53D1\u9001\u7ED9\u670D\u52A1\u5408\u5E76\uFF1B\u670D\u52A1\u7A0D\u540E\u81EA\u52A8\u5F00\u59CB\u4F53\u68C0\u9996\u6279 ${"\u2026"}`);
    } catch (e) {
      onErr(String(e.message || e));
    } finally {
      setImporting(false);
    }
  };
  const importByPath = async () => {
    const p = path.trim();
    if (!p) return;
    setImporting(true);
    try {
      const nonce = await sendCmd("import_path", { path: p });
      const r = await pollResult(nonce, 3e4);
      if (!r) throw new Error("\u5BFC\u5165\u8D85\u65F6\uFF1A\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E \u2192 \u670D\u52A1\u7BA1\u7406\u67E5\u770B\uFF09");
      if (!r.ok) throw new Error(r.error || "\u5BFC\u5165\u5931\u8D25");
      const s = r.summary;
      onImportDone(`\u5BFC\u5165\u5B8C\u6210\uFF1A\u89E3\u6790 ${s.parsed} \u6761\uFF0C\u65B0\u589E ${s.added}\uFF0C\u66F4\u65B0 ${s.updated}\uFF0C\u91CD\u590D ${s.duplicates}\uFF0C\u65E0\u6548 ${s.invalid}\uFF0C\u8DF3\u8FC7\u884C ${s.skippedLines}`);
      onChanged();
    } catch (e) {
      onErr(String(e.message || e));
    } finally {
      setImporting(false);
    }
  };
  const startCheck = async (deadOnly) => {
    try {
      const nonce = await sendCmd(deadOnly ? "recheck_dead" : "check", {});
      const r = await pollResult(nonce, 15e3);
      if (!r) throw new Error("\u547D\u4EE4\u8D85\u65F6\uFF1A\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C");
      if (!r.ok) throw new Error(r.error || "\u542F\u52A8\u5931\u8D25");
      onImportDone(`\u68C0\u67E5\u8FD0\u884C\u5DF2\u542F\u52A8\uFF08\u961F\u5217 ${r.summary.queued} \u6761\uFF09`);
      onChanged();
    } catch (e) {
      onErr(String(e.message || e));
    }
  };
  const exportJson = async () => {
    const payload = records.map((r2) => ({ title: r2.title, url: r2.url, folder: r2.folder, status: r2.status, httpStatus: r2.httpStatus, category: core.classifyUrl(r2.url), addedAt: r2.addedAt, lastCheckedAt: r2.lastCheckedAt }));
    const { copyText: copyText2 } = await Promise.resolve().then(() => (init_model(), model_exports));
    const r = await copyText2(JSON.stringify(payload, null, 1));
    onImportDone(r === "copied" ? `\u5DF2\u590D\u5236 ${payload.length} \u6761 JSON \u5230\u526A\u8D34\u677F` : "\u5DF2\u5F39\u7A97\u4F9B\u624B\u52A8\u590D\u5236\uFF08\u624B\u673A\u7AEF\uFF09");
  };
  const exportCsv = async () => {
    const csv = core.toCsv(records);
    const { copyText: copyText2 } = await Promise.resolve().then(() => (init_model(), model_exports));
    const r = await copyText2(csv.slice(0, 2e5));
    onImportDone(r === "copied" ? "\u5DF2\u590D\u5236 CSV\uFF08\u524D 20 \u4E07\u5B57\u7B26\uFF09\u5230\u526A\u8D34\u677F" : "\u5DF2\u5F39\u7A97\u4F9B\u624B\u52A8\u590D\u5236\uFF08\u624B\u673A\u7AEF\uFF09");
  };
  const prog = run && run.queue.length ? Math.round(run.cursor / run.queue.length * 100) : 0;
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { style: S3.panel, children: [
      /* @__PURE__ */ jsx3("strong", { children: "\u{1F4E5} \u5BFC\u5165" }),
      /* @__PURE__ */ jsx3("div", { style: { ...S3.dim, margin: "6px 0" }, children: "\u6D4F\u89C8\u5668\u4E66\u7B7E\u7BA1\u7406\u5668 \u2192 \u5BFC\u51FA\u4E66\u7B7E\uFF08HTML\uFF09\uFF0C\u7136\u540E\u5BFC\u5165\u3002\u5BFC\u5165\u540E\u670D\u52A1\u81EA\u52A8\u5F00\u59CB\u4F53\u68C0\u3002" }),
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsxs3("label", { style: { ...S3.btnAccent, display: "inline-block" }, children: [
          importing ? "\u5BFC\u5165\u4E2D\u2026" : "\u9009\u6587\u4EF6\u5BFC\u5165",
          /* @__PURE__ */ jsx3(
            "input",
            {
              type: "file",
              accept: ".html,.htm,text/html",
              style: { display: "none" },
              disabled: importing,
              onChange: (e) => importFile(e.target.files?.[0])
            }
          )
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            style: S3.input,
            placeholder: "\u6216\u8F93\u5165\u5BFC\u51FA\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u684C\u9762\u7AEF\uFF09\uFF1AC:\\Users\\me\\Desktop\\bookmarks.html",
            value: path,
            onChange: (e) => setPath(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx3("button", { style: S3.btn, disabled: importing || !path.trim(), onClick: importByPath, children: "\u6309\u8DEF\u5F84\u5BFC\u5165" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: S3.panel, children: [
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsx3("strong", { children: "\u{1F50D} \u4F53\u68C0" }),
        /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx3("button", { style: S3.btn, disabled: busy, onClick: () => startCheck(true), children: "\u53EA\u91CD\u67E5\u6B7B\u94FE" }),
        /* @__PURE__ */ jsx3("button", { style: S3.btnAccent, disabled: busy, onClick: () => startCheck(false), children: "\u5F00\u59CB\u4F53\u68C0\u4E00\u6279" })
      ] }),
      run ? /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsxs3("div", { style: S3.dim, children: [
          "\u8FD0\u884C ",
          run.id,
          "\uFF08",
          run.type === "auto" ? "\u81EA\u52A8" : run.type === "recheck_dead" ? "\u6B7B\u94FE\u91CD\u67E5" : "\u624B\u52A8",
          "\uFF09\xB7 \u8FDB\u5EA6 ",
          run.cursor,
          "/",
          run.queue.length,
          "\uFF08",
          prog,
          "%\uFF09\xB7 \u5B58\u6D3B ",
          run.okCount,
          " \xB7 \u6B7B ",
          run.deadCount
        ] }),
        /* @__PURE__ */ jsx3("div", { style: S3.bar, children: /* @__PURE__ */ jsx3("div", { style: { width: `${prog}%`, height: "100%", background: "var(--p-accent, #4a7dff)" } }) }),
        /* @__PURE__ */ jsx3("div", { style: S3.dim, children: "\u5355\u6761\u5931\u8D25\u91CD\u8BD5 \u2264 \u6B21\u6570\u540E\u8BDA\u5B9E\u6807\u8BB0\uFF0C\u4E0D\u5835\u961F\u5217\uFF1B\u4E2D\u65AD\u53EF\u7EED\uFF08\u91CD\u542F\u670D\u52A1\u4ECE\u65AD\u70B9\u7EE7\u7EED\uFF09\u3002" })
      ] }) : /* @__PURE__ */ jsx3("div", { style: { ...S3.dim, marginTop: 6 }, children: "\u5F53\u524D\u65E0\u8FD0\u884C\u3002\u6279\u91CF = \u8BBE\u7F6E\u9875\u300C\u6279\u91CF\u300D\uFF1B\u4ECE\u672A\u68C0\u67E5\u7684\u4F18\u5148\uFF0C\u5176\u6B21\u6700\u4E45\u672A\u67E5\u3002" })
    ] }),
    reports.length > 0 && /* @__PURE__ */ jsxs3("div", { style: S3.panel, children: [
      /* @__PURE__ */ jsx3("strong", { children: "\u{1F4CA} \u6700\u8FD1\u8FD0\u884C\u62A5\u544A" }),
      reports.slice(0, 3).map((rp) => /* @__PURE__ */ jsxs3("div", { style: { ...S3.dim, marginTop: 6 }, children: [
        fmtTime(rp.finishedAt),
        " \xB7 ",
        rp.type,
        " \xB7 \u67E5 ",
        rp.checked,
        "/",
        rp.total,
        " \xB7 \u5B58\u6D3B ",
        rp.okCount,
        " \xB7 \u6B7B ",
        rp.deadCount,
        " \xB7 ",
        Object.entries(rp.byStatus).map(([s, n]) => `${statusLabel(s)} ${n}`).join("\uFF0C")
      ] }, rp.id)),
      /* @__PURE__ */ jsx3("div", { style: S3.row, children: /* @__PURE__ */ jsx3("button", { style: { ...S3.btn, marginTop: 6 }, onClick: () => onOpenTab("library"), children: "\u53BB\u4E66\u7B7E\u5E93\u770B\u6B7B\u94FE \u2192" }) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: S3.panel, children: [
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsx3("strong", { children: "\u267B\uFE0F \u53BB\u91CD" }),
        /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsxs3("span", { style: S3.dim, children: [
          dups.length,
          " \u7EC4\u91CD\u590D"
        ] }),
        /* @__PURE__ */ jsx3("button", { style: S3.btn, onClick: () => setShowDups(!showDups), children: showDups ? "\u6536\u8D77" : "\u5C55\u5F00" })
      ] }),
      showDups && /* @__PURE__ */ jsxs3("div", { style: { marginTop: 6 }, children: [
        dups.slice(0, 20).map((g) => /* @__PURE__ */ jsxs3("div", { style: { borderTop: "1px solid var(--p-border, rgba(128,128,128,.2))", padding: "6px 0" }, children: [
          /* @__PURE__ */ jsx3("div", { style: { ...S3.dim, fontFamily: "monospace" }, children: g.key.slice(0, 90) }),
          g.items.map((r, i) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "2px 0" }, children: [
            /* @__PURE__ */ jsx3("span", { style: { color: statusColor(r.status) }, children: "\u25CF" }),
            /* @__PURE__ */ jsxs3("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
              r.title || r.host,
              r.folder ? `\uFF08${r.folder}\uFF09` : ""
            ] }),
            /* @__PURE__ */ jsx3("span", { style: S3.dim, children: i === 0 ? "\u4FDD\u7559" : "\u91CD\u590D" }),
            i > 0 && /* @__PURE__ */ jsx3("button", { style: S3.btnDanger, disabled: busy, onClick: () => onRemove([r.id]), children: "\u5220" })
          ] }, r.id))
        ] }, g.key)),
        dups.length === 0 && /* @__PURE__ */ jsx3("div", { style: S3.dim, children: "\u6CA1\u6709\u91CD\u590D\uFF08URL \u89C4\u8303\u5316\u53BB\u8DDF\u8E2A\u53C2\u6570\u540E\u6BD4\u5BF9\uFF09\u3002" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: S3.panel, children: [
      /* @__PURE__ */ jsx3("strong", { children: "\u{1F4E4} \u5BFC\u51FA" }),
      /* @__PURE__ */ jsxs3("div", { style: { ...S3.row, marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs3("button", { style: S3.btn, disabled: !records.length, onClick: exportJson, children: [
          "\u590D\u5236 JSON\uFF08",
          records.length,
          " \u6761\uFF09"
        ] }),
        /* @__PURE__ */ jsx3("button", { style: S3.btn, disabled: !records.length, onClick: exportCsv, children: "\u590D\u5236 CSV" })
      ] })
    ] })
  ] });
}

// src/SettingsTab.tsx
init_model();
import React4 from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var S4 = {
  panel: { padding: "12px 14px", borderRadius: 10, background: "var(--p-panel, rgba(128,128,128,.08))", marginBottom: 10 },
  row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 },
  label: { fontSize: 12.5, color: "var(--p-text-dim, #999)", minWidth: 90 },
  input: { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--p-border, rgba(128,128,128,.3))", background: "transparent", color: "inherit", fontSize: 12.5, width: 90 },
  btn: { padding: "5px 12px", borderRadius: 8, border: "1px solid var(--p-border, rgba(128,128,128,.3))", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12.5 },
  btnDanger: { padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(220,80,80,.4)", background: "transparent", color: "#d9564a", cursor: "pointer", fontSize: 12.5 }
};
function SettingsTab({ pluginId, serviceId, settings, meta, records, busy, onSettingsSaved, onErr, onInfo, onChanged }) {
  const [svc, setSvc] = React4.useState("");
  const [confirmWipe, setConfirmWipe] = React4.useState(false);
  const [draft, setDraft] = React4.useState(settings);
  React4.useEffect(() => {
    setDraft(settings);
  }, [settings]);
  const refreshSvc = React4.useCallback(async () => {
    try {
      const all = await listServiceStatus();
      const mine = all.find((s) => s.pluginId === pluginId && s.serviceId === serviceId);
      setSvc(mine ? String(mine.status || JSON.stringify(mine)) : "\u672A\u6CE8\u518C");
    } catch (e) {
      setSvc(`\u67E5\u8BE2\u5931\u8D25\uFF1A${String(e.message || e)}`);
    }
  }, [pluginId, serviceId]);
  React4.useEffect(() => {
    refreshSvc();
    const t = setInterval(refreshSvc, 15e3);
    return () => clearInterval(t);
  }, [refreshSvc]);
  const act = async (a) => {
    try {
      await serviceAction(a, pluginId, serviceId);
      onInfo(`\u670D\u52A1 ${a} \u5DF2\u63D0\u4EA4`);
      setTimeout(refreshSvc, 2e3);
    } catch (e) {
      onErr(String(e.message || e));
    }
  };
  const save = async () => {
    if (!draft) return;
    try {
      await saveSettings(draft);
      onSettingsSaved();
      onInfo("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u7EA6 30 \u79D2\u5185\u70ED\u751F\u6548\uFF09");
    } catch (e) {
      onErr(String(e.message || e));
    }
  };
  const wipe = async () => {
    try {
      const nonce = await sendCmd("wipe", { confirm: true });
      const r = await pollResult(nonce, 3e4);
      if (!r) throw new Error("\u6E05\u7A7A\u8D85\u65F6\uFF1A\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C");
      if (!r.ok) throw new Error(r.error || "\u6E05\u7A7A\u5931\u8D25");
      onInfo(`\u5DF2\u6E05\u7A7A ${r.summary.wiped ?? 0} \u6761\u8BB0\u5F55`);
      setConfirmWipe(false);
      onChanged();
    } catch (e) {
      onErr(String(e.message || e));
    }
  };
  const svcAlive = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1e3);
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { style: S4.panel, children: [
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx4("strong", { children: "\u{1F6E0} \u670D\u52A1\u7BA1\u7406" }),
        /* @__PURE__ */ jsx4("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsxs4("span", { style: { fontSize: 12, color: svcAlive ? "#3aa76d" : "#d9a13b" }, children: [
          meta ? svcAlive ? `\u5FC3\u8DF3\u6B63\u5E38\uFF08${fmtTime(meta.lastTickAt)}\uFF09` : "\u5FC3\u8DF3\u8FC7\u671F" : "\u5C1A\u65E0\u5FC3\u8DF3",
          svc ? ` \xB7 manager: ${svc}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
        /* @__PURE__ */ jsx4("button", { style: S4.btn, disabled: busy, onClick: () => act("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { style: S4.btn, disabled: busy, onClick: () => act("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx4("button", { style: S4.btn, disabled: busy, onClick: () => act("stop"), children: "\u505C\u6B62" }),
        /* @__PURE__ */ jsx4("button", { style: S4.btn, disabled: busy, onClick: () => refreshSvc(), children: "\u5237\u65B0\u72B6\u6001" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)" }, children: [
        "\u670D\u52A1\u65E5\u5FD7\uFF1A",
        /* @__PURE__ */ jsx4("code", { children: "%APPDATA%/Polaris/bookmark-dig.log" }),
        "\uFF08512KB \u8F6E\u8F6C\uFF09\u3002\u542F\u52A8\u5931\u8D25\u65F6\u5148\u770B\u65E5\u5FD7\u5C3E\u90E8\u3002"
      ] })
    ] }),
    draft && /* @__PURE__ */ jsxs4("div", { style: S4.panel, children: [
      /* @__PURE__ */ jsx4("strong", { children: "\u2699\uFE0F \u4F53\u68C0\u8BBE\u7F6E" }),
      /* @__PURE__ */ jsx4("div", { style: { height: 8 } }),
      /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
        /* @__PURE__ */ jsx4("span", { style: S4.label, children: "\u6279\u91CF\uFF08\u6761/\u6B21\uFF09" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "number",
            min: 20,
            max: 2e3,
            style: S4.input,
            value: draft.batchSize,
            onChange: (e) => setDraft({ ...draft, batchSize: Number(e.target.value) })
          }
        ),
        /* @__PURE__ */ jsx4("span", { style: S4.label, children: "\u5E76\u53D1" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "number",
            min: 1,
            max: 12,
            style: S4.input,
            value: draft.concurrency,
            onChange: (e) => setDraft({ ...draft, concurrency: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
        /* @__PURE__ */ jsx4("span", { style: S4.label, children: "\u5355\u6761\u8D85\u65F6(ms)" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "number",
            min: 3e3,
            max: 3e4,
            step: 1e3,
            style: S4.input,
            value: draft.timeoutMs,
            onChange: (e) => setDraft({ ...draft, timeoutMs: Number(e.target.value) })
          }
        ),
        /* @__PURE__ */ jsx4("span", { style: S4.label, children: "\u91CD\u67E5\u5468\u671F(\u5929)" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "number",
            min: 0,
            max: 365,
            style: S4.input,
            value: draft.recheckDays,
            onChange: (e) => setDraft({ ...draft, recheckDays: Number(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
        /* @__PURE__ */ jsxs4("label", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx4(
            "input",
            {
              type: "checkbox",
              checked: draft.autoCheckOnImport,
              onChange: (e) => setDraft({ ...draft, autoCheckOnImport: e.target.checked })
            }
          ),
          /* @__PURE__ */ jsx4("span", { style: { fontSize: 12.5 }, children: "\u5BFC\u5165\u540E\u81EA\u52A8\u5F00\u59CB\u4F53\u68C0" })
        ] }),
        /* @__PURE__ */ jsxs4("label", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx4(
            "input",
            {
              type: "checkbox",
              checked: draft.checkEnabled,
              onChange: (e) => setDraft({ ...draft, checkEnabled: e.target.checked })
            }
          ),
          /* @__PURE__ */ jsx4("span", { style: { fontSize: 12.5 }, children: "\u5141\u8BB8\u68C0\u67E5\u8FD0\u884C\uFF08\u53D6\u6D88\u52FE\u9009 = \u6682\u505C\uFF09" })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("button", { style: S4.btn, disabled: busy, onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: S4.panel, children: [
      /* @__PURE__ */ jsx4("strong", { children: "\u{1F5D1} \u6570\u636E\u7BA1\u7406" }),
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 12.5, color: "var(--p-text-dim, #999)", margin: "6px 0" }, children: [
        "\u4E66\u7B7E\u6570\u636E\u5728 cap.kv \u7684 ",
        /* @__PURE__ */ jsx4("code", { children: "bmd.rec.*" }),
        " \u5206\u5757\uFF08\u5F53\u524D ",
        records.length,
        " \u6761\uFF09\u3002\u6E05\u7A7A\u4E0D\u53EF\u6062\u590D\uFF08\u5EFA\u8BAE\u5148\u5BFC\u51FA\uFF09\u3002"
      ] }),
      !confirmWipe ? /* @__PURE__ */ jsx4("button", { style: S4.btnDanger, disabled: busy || !records.length, onClick: () => setConfirmWipe(true), children: "\u6E05\u7A7A\u5168\u90E8\u4E66\u7B7E\u2026" }) : /* @__PURE__ */ jsxs4("div", { style: S4.row, children: [
        /* @__PURE__ */ jsxs4("span", { style: { fontSize: 12.5, color: "#d9564a" }, children: [
          "\u786E\u5B9A\u6E05\u7A7A\u5168\u90E8 ",
          records.length,
          " \u6761\uFF1F\u4E0D\u53EF\u6062\u590D\u3002"
        ] }),
        /* @__PURE__ */ jsx4("button", { style: S4.btnDanger, disabled: busy, onClick: wipe, children: "\u786E\u8BA4\u6E05\u7A7A" }),
        /* @__PURE__ */ jsx4("button", { style: S4.btn, onClick: () => setConfirmWipe(false), children: "\u53D6\u6D88" })
      ] })
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var SERVICE_ID = "dig-service";
var tabBtn = (active) => ({
  padding: "6px 13px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: active ? "var(--p-accent, #4a7dff)" : "transparent",
  color: active ? "#fff" : "inherit"
});
function BookmarkDigPanel(props) {
  const [tab, setTab] = React5.useState("overview");
  const [records, setRecords] = React5.useState([]);
  const [meta, setMeta] = React5.useState(null);
  const [run, setRun] = React5.useState(null);
  const [reports, setReports] = React5.useState([]);
  const [settings, setSettings] = React5.useState(null);
  const [busy, setBusy] = React5.useState(false);
  const [msg, setMsg] = React5.useState("");
  const [err, setErr] = React5.useState("");
  const [lastResurfaced, setLastResurfaced] = React5.useState(null);
  const refresh = React5.useCallback(async () => {
    try {
      const [recs, m, r, rps, s] = await Promise.all([
        readAllRecords(),
        loadMeta(),
        loadRun(),
        loadReports(),
        loadSettings()
      ]);
      setRecords(recs);
      setMeta(m);
      setRun(r);
      setReports(rps);
      setSettings(s);
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);
  React5.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5e3);
    return () => clearInterval(timer);
  }, [refresh]);
  const withBusy = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const doResurface = (r) => {
    setLastResurfaced(r);
    withBusy(async () => {
      const nonce = await sendCmd("visit", { id: r.id });
      pollResult(nonce, 15e3).catch(() => {
      });
    });
  };
  const doVisit = (r) => {
    withBusy(async () => {
      const nonce = await sendCmd("visit", { id: r.id });
      const res = await pollResult(nonce, 15e3);
      if (res && !res.ok) setErr(res.error || "\u6807\u8BB0\u5931\u8D25");
      else setMsg("\u5DF2\u8BB0\u5F55\u91CD\u8BBF");
      refresh();
    });
  };
  const doRecheck = (ids) => {
    withBusy(async () => {
      const nonce = await sendCmd("recheck_ids", { ids });
      const res = await pollResult(nonce, 15e3);
      if (!res) setErr("\u547D\u4EE4\u8D85\u65F6\uFF1A\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E \u2192 \u670D\u52A1\u7BA1\u7406\uFF09");
      else if (!res.ok) setErr(res.error || "\u542F\u52A8\u5931\u8D25");
      else setMsg(`\u5DF2\u52A0\u5165\u91CD\u67E5\u961F\u5217\uFF08${res.summary.queued ?? ids.length} \u6761\uFF09`);
      refresh();
    });
  };
  const doRemove = (ids) => {
    withBusy(async () => {
      const nonce = await sendCmd("remove", { ids, confirm: true });
      const res = await pollResult(nonce, 15e3);
      if (!res) setErr("\u547D\u4EE4\u8D85\u65F6\uFF1A\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C");
      else if (!res.ok) setErr(res.error || "\u5220\u9664\u5931\u8D25");
      else setMsg(`\u5DF2\u5220\u9664 ${res.summary.removed ?? ids.length} \u6761`);
      refresh();
    });
  };
  return /* @__PURE__ */ jsxs5("div", { style: { padding: 16, fontFamily: "inherit", fontSize: 13, color: "var(--p-text, inherit)", maxWidth: 880, margin: "0 auto" }, children: [
    /* @__PURE__ */ jsxs5("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx5("strong", { style: { fontSize: 15 }, children: "\u{1F4D6} \u4E66\u7B7E\u4F53\u68C0" }),
      run && /* @__PURE__ */ jsxs5("span", { style: { padding: "2px 10px", borderRadius: 999, background: "var(--p-accent, #4a7dff)", color: "#fff", fontSize: 11 }, children: [
        "\u68C0\u67E5\u4E2D ",
        run.cursor,
        "/",
        run.queue.length
      ] }),
      /* @__PURE__ */ jsx5("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx5("button", { style: tabBtn(tab === "overview"), onClick: () => setTab("overview"), children: "\u6982\u89C8" }),
      /* @__PURE__ */ jsx5("button", { style: tabBtn(tab === "library"), onClick: () => setTab("library"), children: "\u4E66\u7B7E\u5E93" }),
      /* @__PURE__ */ jsx5("button", { style: tabBtn(tab === "check"), onClick: () => setTab("check"), children: "\u68C0\u67E5" }),
      /* @__PURE__ */ jsx5("button", { style: tabBtn(tab === "settings"), onClick: () => setTab("settings"), children: "\u8BBE\u7F6E" })
    ] }),
    err && /* @__PURE__ */ jsxs5("div", { style: { padding: "8px 12px", borderRadius: 8, background: "rgba(220,80,80,.12)", marginBottom: 10 }, children: [
      err,
      /* @__PURE__ */ jsx5("span", { style: { marginLeft: 8, cursor: "pointer", opacity: 0.7 }, onClick: () => setErr(""), children: "\u2715" })
    ] }),
    msg && /* @__PURE__ */ jsxs5("div", { style: { padding: "8px 12px", borderRadius: 8, background: "rgba(58,167,109,.12)", marginBottom: 10 }, children: [
      msg,
      /* @__PURE__ */ jsx5("span", { style: { marginLeft: 8, cursor: "pointer", opacity: 0.7 }, onClick: () => setMsg(""), children: "\u2715" })
    ] }),
    tab === "overview" && /* @__PURE__ */ jsx5(
      OverviewTab,
      {
        records,
        meta,
        settings,
        lastResurfaced,
        onResurface: doResurface,
        onStartRecheckDead: () => {
          withBusy(async () => {
            const nonce = await sendCmd("recheck_dead", {});
            const res = await pollResult(nonce, 15e3);
            if (!res) setErr("\u547D\u4EE4\u8D85\u65F6\uFF1A\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C");
            else if (!res.ok) setErr(res.error || "\u542F\u52A8\u5931\u8D25");
            else setMsg(`\u6B7B\u94FE\u91CD\u67E5\u5DF2\u542F\u52A8\uFF08${res.summary.queued ?? 0} \u6761\uFF09`);
            refresh();
          });
        },
        busy
      }
    ),
    tab === "library" && /* @__PURE__ */ jsx5(LibraryTab, { records, busy, onRecheck: doRecheck, onVisit: doVisit, onRemove: doRemove }),
    tab === "check" && /* @__PURE__ */ jsx5(
      CheckTab,
      {
        records,
        run,
        reports,
        busy,
        pluginId: props.pluginId,
        onImportDone: (m) => {
          setMsg(m);
          refresh();
        },
        onErr: setErr,
        onChanged: refresh,
        onOpenTab: (t) => setTab(t),
        onRemove: doRemove
      }
    ),
    tab === "settings" && /* @__PURE__ */ jsx5(
      SettingsTab,
      {
        pluginId: props.pluginId,
        serviceId: SERVICE_ID,
        settings,
        meta,
        records,
        busy,
        onSettingsSaved: refresh,
        onErr: setErr,
        onInfo: setMsg,
        onChanged: refresh
      }
    )
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function BookmarkDigEntry(props) {
  return /* @__PURE__ */ jsx6(BookmarkDigPanel, { ...props });
}
export {
  BookmarkDigEntry as default
};
