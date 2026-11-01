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

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var MAX_FILE_BYTES = 150 * 1024 * 1024;
    var MAX_ENTRIES = 2e4;
    var ROW_CAP = 1e3;
    var ROWS_PER_CHUNK = 100;
    var URL_TRIM = 240;
    var BODY_PREVIEW_CHARS = 1600;
    var AUDIT_IDX_CAP = 50;
    var AUDIT_SAMPLES = 3;
    var HIST_KEEP = 15;
    var REPORT_ROW_CAP = 50;
    var MASK = "\u2039\u5DF2\u8131\u654F\u203A";
    var SENSITIVE_HEADER_RE = /^(authorization|proxy-authorization|x-api-key|x-apikey|api-key|apikey|x-auth-token|x-access-token|x-session-token|x-csrf-token|csrf-token|x-amz-security-token|www-authenticate|set-cookie|cookie)$/i;
    var SENSITIVE_HEADER_FUZZY_RE = /(?:auth|token|key|secret|credential|session|signature|password)/i;
    var SENSITIVE_PARAM_KEY_RE = /(?:^|_)(?:token|secret|password|passwd|pwd|signature|sign|apikey|api_key|key|access_token|refresh_token|id_token|auth|session|sid|jwt|credential|nonce|code)$/i;
    var BODY_PATTERNS = [
      { cat: "api-key-pattern", sev: "high", re: /\bAKIA[0-9A-Z]{16}\b/g, label: "AWS \u8BBF\u95EE\u5BC6\u94A5 (AKIA\u2026)" },
      { cat: "api-key-pattern", sev: "high", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, label: "sk- \u5F62\u6001 API \u5BC6\u94A5\uFF08OpenAI/DeepSeek \u7B49\uFF09" },
      { cat: "api-key-pattern", sev: "high", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, label: "GitHub \u4EE4\u724C (ghp_/gho_\u2026)" },
      { cat: "api-key-pattern", sev: "high", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: "Slack \u4EE4\u724C (xox\u2026)" },
      { cat: "api-key-pattern", sev: "high", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: "Google API \u5BC6\u94A5 (AIza\u2026)" },
      { cat: "private-key", sev: "high", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, label: "\u79C1\u94A5\u5757 (BEGIN PRIVATE KEY)" },
      { cat: "bearer-body", sev: "medium", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, label: "Bearer \u4EE4\u724C\uFF08\u4F53/\u6587\u672C\u5185\u5D4C\uFF09" },
      { cat: "db-credential", sev: "high", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s:@/]+:[^\s@/]+@/gi, label: "\u6570\u636E\u5E93\u8FDE\u63A5\u4E32\uFF08\u5E26\u53E3\u4EE4\uFF09" }
    ];
    var JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;
    var URL_CRED_RE = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i;
    var AUDIT_CATS = {
      "auth-header": { sev: "high", label: "\u9274\u6743\u5934\uFF08Authorization / X-Api-Key \u7B49\uFF09" },
      "cookie": { sev: "medium", label: "\u8BF7\u6C42 Cookie" },
      "set-cookie": { sev: "medium", label: "\u54CD\u5E94 Set-Cookie" },
      "query-secret": { sev: "medium", label: "URL \u654F\u611F\u53C2\u6570\uFF08token/key/\u2026\uFF09" },
      "url-credential": { sev: "high", label: "URL \u5185\u5D4C\u51ED\u636E\uFF08scheme://user:pass@\uFF09" },
      "api-key-pattern": { sev: "high", label: "\u4F53/\u6587\u672C\u4E2D\u7684\u4E91\u5382\u5546\u5BC6\u94A5\u7279\u5F81" },
      "private-key": { sev: "high", label: "\u79C1\u94A5\u5757" },
      "bearer-body": { sev: "medium", label: "\u4F53/\u6587\u672C\u4E2D\u7684 Bearer \u4EE4\u724C" },
      "db-credential": { sev: "high", label: "\u6570\u636E\u5E93\u8FDE\u63A5\u4E32" },
      "jwt": { sev: "medium", label: "JWT\uFF08eyJ\u2026 \u4E09\u6BB5\u5F0F\uFF09" }
    };
    function isSensitiveHeaderName(name) {
      const n = String(name || "");
      return SENSITIVE_HEADER_RE.test(n) || SENSITIVE_HEADER_FUZZY_RE.test(n);
    }
    function isSensitiveParamKey(key) {
      return SENSITIVE_PARAM_KEY_RE.test(String(key || ""));
    }
    function maskValue(v) {
      const s = String(v == null ? "" : v);
      return `${MASK}(len=${s.length})`;
    }
    function isMaskedValue(v) {
      const s = String(v == null ? "" : v);
      return s.includes(MASK) || s.includes("%E2%80%B9") || s.includes("%E5%B7%B2%E8%84%B1%E6%95%8F");
    }
    function redactText(s) {
      let out = String(s == null ? "" : s);
      if (!out) return out;
      out = out.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i, (_m, sch) => `${sch}${MASK}@`);
      out = out.replace(/(^|[?&;\s])([A-Za-z0-9_.[\]-]{1,64})=([^&\s;#]{1,2048})/g, (m, pre, k, v) => {
        if (!isSensitiveParamKey(k)) return m;
        return `${pre}${k}=${maskValue(v)}`;
      });
      out = out.replace(/"([^"\n]{1,64})"\s*:\s*"([^"\n]*)"/g, (m, k, v) => {
        if (!isSensitiveParamKey(k)) return m;
        return `"${k}": ${JSON.stringify(maskValue(v))}`;
      });
      for (const p of BODY_PATTERNS) {
        out = out.replace(p.re, (m) => `${MASK}[${p.cat}]`);
      }
      out = out.replace(JWT_RE, (m) => `${MASK}[jwt]`);
      return out;
    }
    function hostOf(url) {
      try {
        const u = new URL(String(url));
        return u.host || u.hostname || "(\u672A\u77E5)";
      } catch (_) {
        const m = String(url || "").match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
        return m ? m[1] : "(\u65E0\u6CD5\u89E3\u6790)";
      }
    }
    function statusClass(s) {
      const n = Number(s) || 0;
      if (n >= 500) return "5xx";
      if (n >= 400) return "4xx";
      if (n >= 300) return "3xx";
      if (n >= 200) return "2xx";
      if (n >= 100) return "1xx";
      return "0/abort";
    }
    function pct(arr, p) {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1));
      return Math.round(sorted[idx]);
    }
    function compactHeaders(pairs) {
      const out = {};
      for (const h of Array.isArray(pairs) ? pairs : []) {
        if (!h || typeof h.name !== "string") continue;
        const k = h.name.toLowerCase();
        out[k] = out[k] ? `${out[k]}, ${h.value}` : String(h.value == null ? "" : h.value);
      }
      return out;
    }
    function mimeOf(entry) {
      const c = compactHeaders(entry.response && entry.response.headers)["content-type"] || "";
      const m = c.split(";")[0].trim().toLowerCase();
      return m || "(\u65E0\u7C7B\u578B)";
    }
    function toMs(iso) {
      const t = Date.parse(String(iso || ""));
      return Number.isFinite(t) ? t : NaN;
    }
    function validateHar(obj) {
      if (!obj || typeof obj !== "object") return { ok: false, error: "\u4E0D\u662F\u5BF9\u8C61" };
      const log = obj.log;
      if (!log || typeof log !== "object") return { ok: false, error: "\u7F3A\u5C11 log \u6839\u8282\u70B9\uFF08\u4E0D\u662F HAR \u683C\u5F0F\uFF09" };
      const warnings = [];
      if (!log.version) warnings.push("\u7F3A\u5C11 log.version");
      if (!log.creator || typeof log.creator !== "object") warnings.push("\u7F3A\u5C11 log.creator\uFF08\u5BFC\u51FA\u5668\u4FE1\u606F\uFF09");
      if (!Array.isArray(log.entries)) return { ok: false, error: "log.entries \u4E0D\u662F\u6570\u7EC4\uFF08\u4E0D\u662F HAR \u683C\u5F0F\uFF09" };
      if (!log.entries.length) warnings.push("entries \u4E3A\u7A7A\uFF080 \u6761\u8BF7\u6C42\uFF09");
      let badEntries = 0;
      for (const e of log.entries) {
        if (!e || typeof e !== "object" || !e.request || !e.response) badEntries += 1;
      }
      if (badEntries) warnings.push(`${badEntries} \u6761 entry \u7F3A request/response\uFF08\u8DF3\u8FC7\u7EDF\u8BA1\uFF09`);
      return { ok: true, warnings };
    }
    var PHASE_KEYS = ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"];
    function phaseSegments(entry, t0) {
      const startAbs = toMs(entry.startedDateTime);
      const tm = entry.timings && typeof entry.timings === "object" ? entry.timings : {};
      const total = Number(entry.time) || 0;
      const segs = [];
      let cursor = Number.isFinite(startAbs) ? Math.max(0, startAbs - t0) : 0;
      const relStart = cursor;
      const push = (k, v) => {
        const d = Number(v);
        if (!Number.isFinite(d) || d < 0) return;
        if (d === 0 && k !== "ssl") return;
        segs.push({ k, s: Math.round(cursor), d: Math.round(d) });
        cursor += d;
      };
      push("blocked", tm.blocked);
      push("dns", tm.dns);
      const connect = Number(tm.connect);
      if (Number.isFinite(connect) && connect > 0) {
        const ssl = Number(tm.ssl);
        const sslDur = Number.isFinite(ssl) && ssl > 0 ? ssl : 0;
        segs.push({ k: "connect", s: Math.round(cursor), d: Math.round(connect) });
        if (sslDur > 0) segs.push({ k: "ssl", s: Math.round(cursor + connect - sslDur), d: Math.round(sslDur) });
        cursor += connect;
      }
      push("send", tm.send);
      push("wait", tm.wait);
      push("receive", tm.receive);
      const spent = cursor - relStart;
      if (total > spent + 1) segs.push({ k: "gap", s: Math.round(cursor), d: Math.round(total - spent) });
      return { relStart: Math.round(relStart), total: Math.round(total), segs };
    }
    function entryFlag(entry) {
      const st = Number(entry.response && entry.response.status || 0);
      const flags = [];
      if (entry.response && entry.response._error) flags.push("abort");
      if (st >= 400) flags.push("error");
      else if (st >= 300 && st < 400) flags.push("redirect");
      if (st === 304) flags.push("cache");
      const cache = entry.cache;
      if (cache && (cache.beforeRequest || cache.afterRequest)) flags.push("cache");
      const ph = phaseSegments(entry, toMs(entry.startedDateTime) || 0);
      if (ph.total >= 1e3) flags.push("slow");
      return flags.join(",");
    }
    function rowOf(entry, i, t0) {
      const resp = entry.response || {};
      const bodySize = Number(resp.bodySize);
      const transfer = resp._transferSize != null ? Number(resp._transferSize) : NaN;
      const size = Number.isFinite(bodySize) && bodySize > 0 ? bodySize : Number.isFinite(transfer) && transfer > 0 ? transfer : 0;
      const tm = entry.timings && typeof entry.timings === "object" ? entry.timings : {};
      const ph = PHASE_KEYS.map((k) => {
        const v = Number(tm[k]);
        return Number.isFinite(v) && v >= 0 ? Math.round(v) : -1;
      });
      const ps = phaseSegments(entry, t0);
      const url = redactText(String(entry.request && entry.request.url || ""));
      return {
        i,
        m: String(entry.request && entry.request.method || "GET").toUpperCase(),
        u: url.length > URL_TRIM ? `${url.slice(0, URL_TRIM)}\u2026` : url,
        s: Number(resp.status) || 0,
        t: ps.total,
        sz: Math.max(0, Math.round(size)),
        mime: mimeOf(entry),
        rs: ps.relStart,
        ph,
        flags: entryFlag(entry)
      };
    }
    function dupKeyOf(row) {
      return `${row.m} ${row.u}`;
    }
    function analyzeHar(har) {
      const log = har && har.log || {};
      const entries = (Array.isArray(log.entries) ? log.entries : []).filter((e) => e && typeof e === "object" && e.request && e.response);
      const starts = entries.map((e) => toMs(e.startedDateTime)).filter(Number.isFinite);
      const t0 = starts.length ? Math.min(...starts) : 0;
      const endMax = entries.reduce((acc, e) => {
        const s = toMs(e.startedDateTime);
        return Number.isFinite(s) ? Math.max(acc, s + (Number(e.time) || 0)) : acc;
      }, 0);
      const rows = entries.map((e, i) => rowOf(e, i, t0));
      const times = rows.map((r) => r.t).filter((t) => t > 0);
      const byDomain = /* @__PURE__ */ new Map();
      const byMime = /* @__PURE__ */ new Map();
      const byMethod = /* @__PURE__ */ new Map();
      let transferBytes = 0;
      let bodyBytes = 0;
      let errs = 0;
      let redirects = 0;
      let cached = 0;
      for (const r of rows) {
        const host = hostOf(r.u);
        const d = byDomain.get(host) || { h: host, n: 0, bytes: 0, time: 0 };
        d.n += 1;
        d.bytes += r.sz;
        d.time += r.t;
        byDomain.set(host, d);
        byMime.set(r.mime, (byMime.get(r.mime) || 0) + 1);
        byMethod.set(r.m, (byMethod.get(r.m) || 0) + 1);
        transferBytes += r.sz;
        const cls = statusClass(r.s);
        if (cls === "4xx" || cls === "5xx" || r.flags.includes("abort")) errs += 1;
        if (cls === "3xx") redirects += 1;
        if (r.flags.includes("cache")) cached += 1;
        const e = entries[r.i];
        const bSize = Number(e.response && e.response.bodySize);
        if (Number.isFinite(bSize) && bSize > 0) bodyBytes += bSize;
      }
      const phaseTotals = PHASE_KEYS.map((_, idx) => rows.reduce((a, r) => a + Math.max(0, r.ph[idx]), 0));
      const timeSum = rows.reduce((a, r) => a + r.t, 0);
      const errors = rows.filter((r) => statusClass(r.s) === "4xx" || statusClass(r.s) === "5xx" || r.flags.includes("abort")).slice(0, REPORT_ROW_CAP);
      const slowTop = [...rows].sort((a, b) => b.t - a.t).slice(0, 12);
      const largeTop = [...rows].sort((a, b) => b.sz - a.sz).slice(0, 12);
      const dupMap = /* @__PURE__ */ new Map();
      for (const r of rows) {
        if (r.flags.includes("cache")) continue;
        const k = dupKeyOf(r);
        const g = dupMap.get(k) || { key: k, count: 0, timeSum: 0, statuses: /* @__PURE__ */ new Set() };
        g.count += 1;
        g.timeSum += r.t;
        g.statuses.add(r.s);
        dupMap.set(k, g);
      }
      const dupUncached = [...dupMap.values()].filter((g) => g.count > 1).sort((a, b) => b.count * b.timeSum - a.count * a.timeSum).slice(0, 10).map((g) => ({ key: g.key, count: g.count, timeSumMs: Math.round(g.timeSum), statuses: [...g.statuses].sort() }));
      const topBy = (map, n, val) => [...map.values()].sort((a, b) => val(b) - val(a)).slice(0, n);
      const statusCounts = { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "0/abort": 0 };
      for (const r of rows) statusCounts[statusClass(r.s)] += 1;
      const topMimes = [...byMime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ k, n: v }));
      const report = {
        version: String(log.version || ""),
        creator: log.creator ? `${log.creator.name || ""} ${log.creator.version || ""}`.trim() : "",
        pages: Array.isArray(log.pages) ? log.pages.length : 0,
        entryCount: entries.length,
        truncated: (log.entries || []).length > entries.length,
        t0,
        startedAt: starts.length ? new Date(t0).toISOString() : "",
        endedAt: endMax > t0 ? new Date(endMax).toISOString() : "",
        spanMs: Math.max(0, Math.round(endMax - t0)),
        timeSumMs: Math.round(timeSum),
        phaseTotalsMs: phaseTotals.map(Math.round),
        transferBytes,
        bodyBytes,
        statusCounts,
        methodCounts: Object.fromEntries(byMethod),
        domains: topBy(byDomain, 12, (d) => d.bytes).map((d) => ({ h: d.h, n: d.n, bytes: d.bytes, time: Math.round(d.time) })),
        mimes: topMimes,
        times: { avg: times.length ? Math.round(timeSum / times.length) : 0, p50: pct(times, 50), p95: pct(times, 95), max: times.length ? Math.max(...times) : 0 },
        errors,
        slowTop,
        largeTop,
        dupUncached,
        cachedCount: cached,
        redirectCount: redirects,
        errorCount: errs
      };
      return { report, rows, t0 };
    }
    function pushFinding(map, cat, i, where, rawValue) {
      const f = map.get(cat) || { cat, count: 0, entries: /* @__PURE__ */ new Set(), samples: [] };
      f.count += 1;
      f.entries.add(i);
      if (f.samples.length < AUDIT_SAMPLES) {
        f.samples.push({ i, where, masked: rawValue.length > 160 ? `${rawValue.slice(0, 160)}\u2026` : rawValue });
      }
      map.set(cat, f);
    }
    function scanTextForPatterns(map, cat, i, where, text) {
      if (!text || typeof text !== "string") return;
      for (const p of BODY_PATTERNS) {
        const re = new RegExp(p.re.source, p.re.flags.replace("g", "") + "g");
        let m;
        let guard = 0;
        while ((m = re.exec(text)) && guard < 200) {
          guard += 1;
          pushFinding(map, p.cat, i, where, `${MASK}[${p.label}] \u4E0A\u4E0B\u6587: ${redactText(text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30))}`);
        }
      }
      const jre = new RegExp(JWT_RE.source, "g");
      let jm;
      let jguard = 0;
      while ((jm = jre.exec(text)) && jguard < 200) {
        jguard += 1;
        pushFinding(map, "jwt", i, where, `${MASK}[JWT] \u4E0A\u4E0B\u6587: ${redactText(text.slice(Math.max(0, jm.index - 30), jm.index + jm[0].length + 30))}`);
      }
    }
    function auditHar(har) {
      const log = har && har.log || {};
      const entries = (Array.isArray(log.entries) ? log.entries : []).filter((e) => e && typeof e === "object" && e.request && e.response);
      const map = /* @__PURE__ */ new Map();
      entries.forEach((e, i) => {
        const req = e.request;
        const resp = e.response;
        for (const h of Array.isArray(req.headers) ? req.headers : []) {
          if (!h || typeof h.name !== "string") continue;
          if (isSensitiveHeaderName(h.name) && h.name.toLowerCase() !== "cookie" && h.name.toLowerCase() !== "set-cookie") {
            if (isMaskedValue(h.value)) continue;
            pushFinding(map, "auth-header", i, `\u8BF7\u6C42\u5934 ${h.name}`, maskValue(h.value));
          }
        }
        const reqHeaders = compactHeaders(req.headers);
        if (reqHeaders.cookie && !isMaskedValue(reqHeaders.cookie)) pushFinding(map, "cookie", i, "\u8BF7\u6C42\u5934 cookie", maskValue(reqHeaders.cookie));
        for (const c of Array.isArray(req.cookies) ? req.cookies : []) {
          if (c && c.name && c.value !== void 0 && !isMaskedValue(c.value)) pushFinding(map, "cookie", i, `\u8BF7\u6C42 cookie ${c.name}`, maskValue(c.value));
        }
        for (const h of Array.isArray(resp.headers) ? resp.headers : []) {
          if (!h || typeof h.name !== "string") continue;
          if (h.name.toLowerCase() === "set-cookie" && !isMaskedValue(h.value)) pushFinding(map, "set-cookie", i, `\u54CD\u5E94\u5934 set-cookie\uFF08${String(h.value || "").split("=")[0] || "?"}=\u2026\uFF09`, maskValue(h.value));
        }
        for (const c of Array.isArray(resp.cookies) ? resp.cookies : []) {
          if (c && c.name && c.value !== void 0 && !isMaskedValue(c.value)) pushFinding(map, "set-cookie", i, `\u54CD\u5E94 cookie ${c.name}`, maskValue(c.value));
        }
        try {
          const u = new URL(String(req.url || ""));
          for (const [k, v] of u.searchParams) {
            if (isSensitiveParamKey(k) && !isMaskedValue(v)) pushFinding(map, "query-secret", i, `URL \u53C2\u6570 ${k}`, maskValue(v));
          }
          if (URL_CRED_RE.test(String(req.url || ""))) {
            pushFinding(map, "url-credential", i, "URL \u5185\u5D4C\u51ED\u636E", `${String(req.url).split("//")[0]}//${MASK}@\u2026`);
          }
        } catch (_) {
        }
        const pd = req.postData;
        if (pd && typeof pd.text === "string") scanTextForPatterns(map, "req-body", i, "\u8BF7\u6C42\u4F53", pd.text);
        if (pd && Array.isArray(pd.params)) {
          for (const p of pd.params) {
            if (p && p.name && isSensitiveParamKey(p.name)) pushFinding(map, "query-secret", i, `\u8868\u5355\u53C2\u6570 ${p.name}`, maskValue(p.value));
          }
        }
        const content = resp.content;
        const mime = String(content && content.mimeType || "");
        if (content && typeof content.text === "string" && content.text && !/^(image|audio|video|font)\//i.test(mime)) {
          scanTextForPatterns(map, "res-body", i, "\u54CD\u5E94\u4F53", content.text.slice(0, 2 * 1024 * 1024));
        }
      });
      const findings = [...map.values()].map((f) => ({
        cat: f.cat,
        sev: (AUDIT_CATS[f.cat] || {}).sev || "medium",
        label: (AUDIT_CATS[f.cat] || {}).label || f.cat,
        count: f.count,
        entryCount: f.entries.size,
        idx: [...f.entries].slice(0, AUDIT_IDX_CAP),
        samples: f.samples
      })).sort((a, b) => {
        const sevRank = { high: 0, medium: 1, low: 2 };
        return sevRank[a.sev] - sevRank[b.sev] || b.count - a.count;
      });
      const total = findings.reduce((a, f) => a + f.count, 0);
      const highCount = findings.filter((f) => f.sev === "high").reduce((a, f) => a + f.count, 0);
      return { scannedEntries: entries.length, total, highCount, findings, scannedAt: Date.now() };
    }
    var DEFAULT_SANITIZE = {
      authHeaders: true,
      // 鉴权头值置掩码（保留头名）
      cookies: true,
      // 请求 cookie 头 + cookies[] 清空
      setCookies: true,
      // 响应 set-cookie 头 + cookies[] 清空
      querySecrets: true,
      // URL 敏感参数值置掩码
      bodies: true,
      // 请求/响应体整体替换为占位（保结构）
      urlCredentials: true
      // URL 内嵌凭据置掩码
    };
    function sanitizeUrl(url, opts) {
      let out = String(url || "");
      if (opts.urlCredentials) {
        out = out.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i, (_m, sch) => `${sch}${encodeURIComponent(MASK)}@`);
      }
      if (opts.querySecrets && out.includes("?")) {
        const [base, q] = out.split("?");
        if (q !== void 0) {
          const kept = q.split("#");
          const queryPart = kept[0];
          const parts = queryPart.split("&").map((pair) => {
            const eq = pair.indexOf("=");
            if (eq < 0) return pair;
            const k = pair.slice(0, eq);
            const v = pair.slice(eq + 1);
            if (!isSensitiveParamKey(k)) return pair;
            return `${k}=${encodeURIComponent(MASK)}`;
          });
          out = `${base}?${parts.join("&")}${kept[1] !== void 0 ? `#${kept[1]}` : ""}`;
        }
      }
      return out;
    }
    function sanitizeHar(har, optsIn) {
      const opts = { ...DEFAULT_SANITIZE, ...optsIn || {} };
      const stats = {};
      const bump = (k, n) => {
        stats[k] = (stats[k] || 0) + n;
      };
      const har2 = JSON.parse(JSON.stringify(har));
      const log = har2.log;
      log.creator = log.creator && typeof log.creator === "object" ? log.creator : { name: "har-lens", version: "" };
      log.creator.comment = `sanitized by har-lens @ ${(/* @__PURE__ */ new Date()).toISOString()}\uFF08authHeaders:${opts.authHeaders ? 1 : 0} cookies:${opts.cookies ? 1 : 0} setCookies:${opts.setCookies ? 1 : 0} querySecrets:${opts.querySecrets ? 1 : 0} bodies:${opts.bodies ? 1 : 0} urlCredentials:${opts.urlCredentials ? 1 : 0}\uFF09`;
      const cleanHeaderList = (headers, kind) => {
        for (const h of Array.isArray(headers) ? headers : []) {
          if (!h || typeof h.name !== "string") continue;
          const lower = h.name.toLowerCase();
          if (opts.authHeaders && lower !== "cookie" && lower !== "set-cookie" && isSensitiveHeaderName(h.name)) {
            h.value = String(MASK);
            bump(kind, 1);
          }
          if (opts.cookies && lower === "cookie") {
            h.value = String(MASK);
            bump("cookies", 1);
          }
          if (opts.setCookies && lower === "set-cookie") {
            h.value = String(MASK);
            bump("setCookies", 1);
          }
        }
      };
      const cleanCookieArr = (cookies, kind) => {
        for (const c of Array.isArray(cookies) ? cookies : []) {
          if (c && c.value !== void 0) {
            c.value = String(MASK);
            bump(kind, 1);
          }
        }
      };
      for (const e of Array.isArray(log.entries) ? log.entries : []) {
        if (!e || typeof e !== "object") continue;
        const req = e.request = e.request || {};
        const resp = e.response = e.response || {};
        if (opts.urlCredentials || opts.querySecrets) req.url = sanitizeUrl(req.url, opts);
        cleanHeaderList(req.headers, "authHeaders");
        cleanHeaderList(resp.headers, "authHeaders");
        if (opts.cookies) {
          cleanCookieArr(req.cookies, "cookies");
          if (req.headers) {
            for (const h of req.headers) if (h && String(h.name).toLowerCase() === "cookie") h.value = String(MASK);
          }
        }
        if (opts.setCookies) {
          cleanCookieArr(resp.cookies, "setCookies");
          if (resp.headers) {
            for (const h of resp.headers) if (h && String(h.name).toLowerCase() === "set-cookie") h.value = String(MASK);
          }
        }
        if (opts.bodies) {
          const pd = req.postData;
          if (pd) {
            if (typeof pd.text === "string" && pd.text) {
              bump("bodies", 1);
              pd.text = `[${MASK} len=${pd.text.length}]`;
            }
            if (Array.isArray(pd.params)) {
              for (const p of pd.params) {
                if (p && p.value !== void 0 && (opts.querySecrets ? true : isSensitiveParamKey(p.name))) {
                  p.value = String(MASK);
                  bump("bodies", 1);
                }
              }
            }
          }
          const content = resp.content;
          if (content && typeof content.text === "string" && content.text) {
            bump("bodies", 1);
            content.text = `[${MASK} len=${content.text.length} mime=${String(content.mimeType || "").slice(0, 60)}]`;
            content.size = content.text.length;
            content.encoding = void 0;
          }
        }
      }
      return { har: har2, stats };
    }
    function bodyPreview(contentOrPost, capChars) {
      const c = contentOrPost;
      if (!c || typeof c.text !== "string" || !c.text) return { text: "", truncated: false, size: Number(c && c.size) || 0 };
      const raw = c.text;
      const masked = redactText(raw.slice(0, capChars + 200));
      return { text: masked.length > capChars ? `${masked.slice(0, capChars)}\u2026` : masked, truncated: raw.length > capChars, size: Number(c.size) || raw.length };
    }
    function entryDetail(entry, i) {
      const req = entry.request || {};
      const resp = entry.response || {};
      const t0 = toMs(entry.startedDateTime);
      const reqHeaders = [];
      for (const h of Array.isArray(req.headers) ? req.headers : []) {
        if (!h || typeof h.name !== "string") continue;
        reqHeaders.push([h.name, isSensitiveHeaderName(h.name) ? maskValue(h.value) : redactText(String(h.value == null ? "" : h.value))]);
      }
      const resHeaders = [];
      for (const h of Array.isArray(resp.headers) ? resp.headers : []) {
        if (!h || typeof h.name !== "string") continue;
        const sensitive = isSensitiveHeaderName(h.name) || h.name.toLowerCase() === "set-cookie";
        resHeaders.push([h.name, sensitive ? maskValue(h.value) : redactText(String(h.value == null ? "" : h.value))]);
      }
      const tm = entry.timings && typeof entry.timings === "object" ? entry.timings : {};
      return {
        i,
        startedAt: entry.startedDateTime || "",
        method: String(req.method || "GET").toUpperCase(),
        url: redactText(String(req.url || "")),
        httpVersion: String(resp.httpVersion || req.httpVersion || ""),
        status: Number(resp.status) || 0,
        statusText: String(resp.statusText || ""),
        redirectUrl: redactText(String(resp.redirectURL || "")),
        serverIp: String(entry._serverIPAddress || resp._remoteIPAddress || ""),
        time: Math.round(Number(entry.time) || 0),
        timings: PHASE_KEYS.reduce((acc, k) => {
          acc[k] = Number.isFinite(Number(tm[k])) ? Math.round(Number(tm[k])) : -1;
          return acc;
        }, {}),
        reqHeaders,
        resHeaders,
        reqCookies: (Array.isArray(req.cookies) ? req.cookies : []).slice(0, 20).map((c) => [c && c.name, c && c.value !== void 0 ? MASK : ""]),
        resCookies: (Array.isArray(resp.cookies) ? resp.cookies : []).slice(0, 20).map((c) => [c && c.name, c && c.value !== void 0 ? MASK : ""]),
        reqBody: bodyPreview(req.postData, BODY_PREVIEW_CHARS),
        resBody: bodyPreview(resp.content, BODY_PREVIEW_CHARS),
        resCompression: Number.isFinite(Number(resp.content && resp.content.compression)) ? Math.round(Number(resp.content.compression)) : null,
        cache: entry.cache && (entry.cache.beforeRequest || entry.cache.afterRequest) ? "\u6709\u7F13\u5B58\u8BB0\u5F55" : "",
        t0Abs: Number.isFinite(t0) ? t0 : 0,
        query: (() => {
          try {
            const u = new URL(String(req.url || ""));
            const out = [];
            for (const [k, v] of u.searchParams) out.push([k, isSensitiveParamKey(k) ? maskValue(v) : redactText(v)]);
            return out.slice(0, 40);
          } catch (_) {
            return [];
          }
        })()
      };
    }
    function stripHash(url) {
      return String(url || "").split("#")[0];
    }
    function compareHars(base, cand) {
      const mk = (har) => {
        const log = har && har.log || {};
        return (Array.isArray(log.entries) ? log.entries : []).filter((e) => e && e.request && e.response).map((e) => ({
          m: String(e.request && e.request.method || "GET").toUpperCase(),
          u: stripHash(e.request && e.request.url),
          s: Number(e.response && e.response.status || 0),
          t: Math.round(Number(e.time) || 0),
          sz: Math.max(0, Number(e.response && e.response.bodySize) > 0 ? Number(e.response.bodySize) : Number(e.response && e.response._transferSize) > 0 ? Number(e.response._transferSize) : 0)
        }));
      };
      const A = mk(base);
      const B = mk(cand);
      const keyExact = (r) => `${r.m} ${r.u}`;
      const keyPath = (r) => {
        try {
          const u = new URL(r.u);
          return `${r.m} ${u.host}${u.pathname}`;
        } catch (_) {
          return `${r.m} ${r.u}`;
        }
      };
      const mapB = /* @__PURE__ */ new Map();
      const addTo = (prefix, key, r) => {
        const k = prefix + key;
        if (!mapB.has(k)) mapB.set(k, []);
        mapB.get(k).push(r);
      };
      for (const r of B) {
        addTo("e:", keyExact(r), r);
        addTo("p:", keyPath(r), r);
      }
      const used = /* @__PURE__ */ new Set();
      const takeMatch = (a) => {
        for (const key of [keyExact(a), keyPath(a)]) {
          const bucket = mapB.get((key === keyExact(a) ? "e:" : "p:") + key);
          if (!bucket) continue;
          const b = bucket.find((cand2) => !used.has(cand2));
          if (b) return b;
        }
        return null;
      };
      const changed = [];
      const matchedA = /* @__PURE__ */ new Set();
      for (const a of A) {
        const b = takeMatch(a);
        if (b) {
          used.add(b);
          matchedA.add(a);
          if (b.s !== a.s || Math.abs(b.t - a.t) > 50 || Math.abs(b.sz - a.sz) > 512) {
            changed.push({ m: a.m, u: redactText(a.u.length > 180 ? `${a.u.slice(0, 180)}\u2026` : a.u), s1: a.s, s2: b.s, t1: a.t, t2: b.t, dt: b.t - a.t, sz1: a.sz, sz2: b.sz });
          }
        }
      }
      const added = B.filter((b) => !used.has(b)).map((b) => ({ m: b.m, u: redactText(b.u.length > 180 ? `${b.u.slice(0, 180)}\u2026` : b.u), s: b.s, t: b.t, sz: b.sz }));
      const removed = A.filter((a) => !matchedA.has(a)).map((a) => ({ m: a.m, u: redactText(a.u.length > 180 ? `${a.u.slice(0, 180)}\u2026` : a.u), s: a.s, t: a.t, sz: a.sz }));
      const flips = changed.filter((c) => statusClass(c.s1) !== statusClass(c.s2));
      const slower = [...changed].filter((c) => c.dt > 50).sort((x, y) => y.dt - x.dt).slice(0, REPORT_ROW_CAP);
      const faster = [...changed].filter((c) => c.dt < -50).sort((x, y) => x.dt - y.dt).slice(0, REPORT_ROW_CAP);
      return {
        summary: {
          baseCount: A.length,
          candCount: B.length,
          matched: A.length - removed.length,
          added: added.length,
          removed: removed.length,
          changed: changed.length,
          flips: flips.length,
          slowerCount: slower.length,
          fasterCount: faster.length,
          baseTimeSum: A.reduce((a, r) => a + r.t, 0),
          candTimeSum: B.reduce((a, r) => a + r.t, 0)
        },
        changed: changed.slice(0, REPORT_ROW_CAP),
        added: added.slice(0, REPORT_ROW_CAP),
        removed: removed.slice(0, REPORT_ROW_CAP),
        slower,
        faster,
        flips: flips.slice(0, REPORT_ROW_CAP),
        comparedAt: Date.now()
      };
    }
    function normalizeSettings(raw) {
      const s = raw && typeof raw === "object" ? raw : {};
      const san = s.sanitize && typeof s.sanitize === "object" ? s.sanitize : {};
      return {
        sanitize: {
          authHeaders: san.authHeaders !== false,
          cookies: san.cookies !== false,
          setCookies: san.setCookies !== false,
          querySecrets: san.querySecrets !== false,
          bodies: san.bodies !== false,
          urlCredentials: san.urlCredentials !== false
        },
        outputDir: typeof s.outputDir === "string" && s.outputDir ? s.outputDir : ""
      };
    }
    function rowSegments(row) {
      const ph = row.ph || [];
      const segs = [];
      let cursor = row.rs || 0;
      const push = (k, idx) => {
        const v = ph[idx];
        if (v == null || v < 0) return;
        segs.push({ k, s: cursor, d: v });
        cursor += v;
      };
      push("blocked", 0);
      push("dns", 1);
      const connect = ph[2] != null && ph[2] >= 0 ? ph[2] : 0;
      const ssl = ph[3] != null && ph[3] >= 0 ? ph[3] : 0;
      if (connect > 0) {
        segs.push({ k: "connect", s: cursor, d: connect });
        if (ssl > 0) segs.push({ k: "ssl", s: cursor + Math.max(0, connect - ssl), d: ssl });
        cursor += connect;
      } else if (ssl > 0) {
        segs.push({ k: "ssl", s: cursor, d: ssl });
        cursor += ssl;
      }
      push("send", 4);
      push("wait", 5);
      push("receive", 6);
      const spent = cursor - (row.rs || 0);
      if ((row.t || 0) > spent + 1) segs.push({ k: "gap", s: cursor, d: row.t - spent });
      return segs;
    }
    function chunkRows(rows, perChunk) {
      const chunks = [];
      for (let i = 0; i < rows.length; i += perChunk) chunks.push(rows.slice(i, i + perChunk));
      return chunks;
    }
    function makeHist(hists, item) {
      const next = [{ ...item, at: Date.now() }, ...hists.filter((h) => h.path !== item.path)];
      return next.slice(0, HIST_KEEP);
    }
    function makeFixtureHar() {
      const base = "2026-11-02T08:00:00.000Z";
      const at = (offsetMs) => new Date(Date.parse(base) + offsetMs).toISOString();
      const hdr = (n, v) => ({ name: n, value: v });
      const entry = (o) => ({
        startedDateTime: o.at,
        time: o.time,
        timings: { blocked: o.blocked == null ? -1 : o.blocked, dns: o.dns == null ? -1 : o.dns, connect: o.connect == null ? -1 : o.connect, ssl: o.ssl == null ? -1 : o.ssl, send: o.send == null ? 1 : o.send, wait: o.wait == null ? 0 : o.wait, receive: o.receive == null ? 0 : o.receive },
        request: {
          method: o.method,
          url: o.url,
          httpVersion: "HTTP/1.1",
          headers: o.reqHeaders || [],
          queryString: [],
          cookies: o.reqCookies || [],
          headersSize: 300,
          bodySize: o.reqBody != null ? o.reqBody.length : 0,
          postData: o.reqBody != null ? { mimeType: o.reqMime || "application/json", text: o.reqBody } : void 0
        },
        response: {
          status: o.status,
          statusText: o.statusText || "",
          httpVersion: "HTTP/1.1",
          headers: o.resHeaders || [],
          cookies: o.resCookies || [],
          content: { size: o.resBody ? o.resBody.length : 0, mimeType: o.resMime || "application/json", text: o.resBody },
          redirectURL: "",
          headersSize: 220,
          bodySize: o.resBody ? o.resBody.length : 0,
          _transferSize: o.transfer != null ? o.transfer : void 0
        },
        cache: o.cache || {},
        _serverIPAddress: "93.184.216.34"
      });
      return {
        log: {
          version: "1.2",
          creator: { name: "har-lens fixture", version: "0.1.0" },
          pages: [{ startedDateTime: base, id: "p1", title: "fixture page", pageTimings: { onContentLoad: 500, onLoad: 900 } }],
          entries: [
            entry({
              at: base,
              time: 400,
              wait: 300,
              receive: 100,
              method: "GET",
              url: "https://api.example.com/v1/users?access_token=SECRET123&tab=1",
              reqHeaders: [hdr("Authorization", "Bearer abc.def.ghi"), hdr("Cookie", "sid=xyz123"), hdr("Accept", "application/json")],
              status: 200,
              resHeaders: [hdr("Content-Type", "application/json")],
              resBody: '{"users":[{"id":1,"name":"\u5F20\u4E09"},{"id":2,"name":"\u674E\u56DB"}]}',
              transfer: 2100
            }),
            entry({
              at: at(50),
              time: 260,
              wait: 200,
              receive: 60,
              method: "POST",
              url: "https://api.example.com/v1/login",
              reqHeaders: [hdr("Content-Type", "application/json")],
              reqBody: '{"user":"u1","password":"hunter2"}',
              status: 200,
              resHeaders: [hdr("Set-Cookie", "session=abc123; HttpOnly"), hdr("Content-Type", "application/json")],
              resBody: '{"ok":true,"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c"}'
            }),
            entry({
              at: at(100),
              time: 15,
              wait: 15,
              method: "GET",
              url: "https://cdn.example.com/app.js",
              status: 304,
              resHeaders: [hdr("ETag", '"v5"')],
              resBody: "",
              cache: { beforeRequest: { lastAccess: base, eTag: '"v5"', hitCount: 3 } }
            }),
            entry({
              at: at(150),
              time: 380,
              wait: 300,
              receive: 80,
              method: "GET",
              url: "https://api.example.com/v1/users?access_token=SECRET123&tab=1",
              reqHeaders: [hdr("Authorization", "Bearer abc.def.ghi")],
              status: 200,
              resHeaders: [hdr("Content-Type", "application/json")],
              resBody: '{"users":[{"id":1,"name":"\u5F20\u4E09"}]}',
              transfer: 1500
            }),
            entry({
              at: at(200),
              time: 1250,
              wait: 1100,
              receive: 150,
              method: "GET",
              url: "https://api.example.com/v1/orders",
              reqHeaders: [hdr("X-Api-Key", "sk-proj-abcdefghij0123456789ABCD")],
              status: 500,
              statusText: "Server Error",
              resHeaders: [hdr("Content-Type", "application/json")],
              resBody: '{"error":"db unavailable","retry_hint":"use key sk-proj-abcdefghij0123456789ABCD","dsn":"postgres://admin:s3cret@db.internal:5432/app"}'
            }),
            entry({
              at: at(250),
              time: 90,
              wait: 60,
              receive: 30,
              method: "GET",
              url: "https://api.example.com/v1/avatar",
              reqHeaders: [hdr("X-Auth-Token", "t0k3n_v4lu3")],
              status: 404,
              statusText: "Not Found",
              resBody: "not found",
              resMime: "text/plain"
            })
          ]
        }
      };
    }
    module.exports = {
      MAX_FILE_BYTES,
      MAX_ENTRIES,
      ROW_CAP,
      ROWS_PER_CHUNK,
      URL_TRIM,
      BODY_PREVIEW_CHARS,
      AUDIT_IDX_CAP,
      AUDIT_SAMPLES,
      HIST_KEEP,
      REPORT_ROW_CAP,
      MASK,
      SENSITIVE_HEADER_RE,
      SENSITIVE_PARAM_KEY_RE,
      PHASE_KEYS,
      AUDIT_CATS,
      isSensitiveHeaderName,
      isSensitiveParamKey,
      maskValue,
      redactText,
      hostOf,
      statusClass,
      pct,
      compactHeaders,
      mimeOf,
      toMs,
      validateHar,
      phaseSegments,
      entryFlag,
      rowOf,
      rowSegments,
      analyzeHar,
      normalizeSettings,
      auditHar,
      sanitizeHar,
      DEFAULT_SANITIZE,
      entryDetail,
      compareHars,
      chunkRows,
      makeHist,
      makeFixtureHar
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect3, useRef as useRef2, useState as useState5 } from "react";

// src/tabs/AnalyzeTab.tsx
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
var import_core = __toESM(require_core());
async function getMeta() {
  const v = await kvGet("har.meta");
  return v && v.lastTickAt ? v : null;
}
async function getReport() {
  const v = await kvGet("har.report");
  return v && typeof v.entryCount === "number" ? v : null;
}
async function getRowsIdx() {
  return await kvGet("har.rows.idx");
}
async function readRows() {
  const idx = await getRowsIdx();
  const chunkCount = idx && Number.isInteger(idx.chunkCount) ? idx.chunkCount : 0;
  const rows = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = await kvGet(`har.rows.${i}`);
    if (Array.isArray(chunk)) rows.push(...chunk);
  }
  return rows;
}
async function getAudit() {
  const v = await kvGet("har.audit");
  return v && Array.isArray(v.findings) ? v : null;
}
async function getDiff() {
  const v = await kvGet("har.diff");
  return v && v.summary ? v : null;
}
async function getHist() {
  const v = await kvGet("har.hist");
  return Array.isArray(v) ? v : [];
}
async function getSettings() {
  const v = await kvGet("har.settings");
  return import_core.default.normalizeSettings(v);
}
async function saveSettings(s) {
  await kvSet("har.settings", s);
}
async function getSelftest() {
  const v = await kvGet("har.selftest");
  return v && typeof v.total === "number" ? v : null;
}
var nonceSeq = 0;
async function sendCommand(op, payload = {}, timeoutMs = 9e4) {
  const nonce = `p${Date.now().toString(36)}${(nonceSeq += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await kvDel("har.result").catch(() => {
  });
  await kvSet("har.cmd", { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, 900));
    const r = await kvGet("har.result");
    if (r && r.nonce === nonce) {
      await kvDel("har.result").catch(() => {
      });
      return r;
    }
  }
  return { ok: false, error: "\u670D\u52A1\u672A\u5728\u65F6\u9650\u5185\u54CD\u5E94\uFF08\u5230 \u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192HAR \u5206\u6790\u53F0 \u67E5\u770B\u670D\u52A1\u72B6\u6001\uFF09" };
}
function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${Math.round(n)}B`;
}
function fmtMs(n) {
  if (!Number.isFinite(n)) return "-";
  if (n >= 6e4) return `${(n / 6e4).toFixed(1)}min`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}
function statusColor(s) {
  if (s >= 500) return "#f85149";
  if (s >= 400) return "#d29922";
  if (s >= 300) return "#58a6ff";
  if (s >= 200) return "#3fb950";
  if (s >= 100) return "#8b949e";
  return "#f85149";
}
var PHASE_COLORS = {
  blocked: "#8b949e",
  dns: "#bc8cff",
  connect: "#f0883e",
  ssl: "#3fb950",
  send: "#79c0ff",
  wait: "#58a6ff",
  receive: "#39c5cf",
  gap: "#30363d"
};

// src/tabs/AnalyzeTab.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var FILTERS = [
  { id: "all", label: "\u5168\u90E8" },
  { id: "errors", label: "\u9519\u8BEF" },
  { id: "slow", label: "\u6700\u6162" },
  { id: "large", label: "\u6700\u5927" },
  { id: "dup", label: "\u91CD\u590D" }
];
function AnalyzeTab({ data, running, reload, showToast }) {
  const [pathInput, setPathInput] = useState("");
  const [opening, setOpening] = useState(false);
  const [rows, setRows] = useState([]);
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const lastPath = useRef("");
  const report = data.report;
  const activePath = data.meta?.activePath || "";
  const refreshRows = useCallback(async (force = false) => {
    const p = activePath || report?.path || "";
    if (!p) {
      setRows([]);
      return;
    }
    if (!force && lastPath.current === p && rows.length) return;
    lastPath.current = p;
    const idx = await getRowsIdx();
    if (!idx || !idx.chunkCount) {
      setRows([]);
      return;
    }
    setRowsTruncated(!!idx.truncated);
    setRows(await readRows());
  }, [activePath, report?.path]);
  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);
  const open = async (p) => {
    const target = (p || pathInput).trim();
    if (!target) {
      showToast("\u8BF7\u586B\u5199 .har \u6587\u4EF6\u8DEF\u5F84", "bad");
      return;
    }
    setOpening(true);
    showToast("\u89E3\u6790\u4E2D\uFF1A\u5927\u6587\u4EF6\u9700\u6570\u79D2\u2026", "info");
    const r = await sendCommand("open", { path: target }, 9e4);
    setOpening(false);
    if (!r.ok) {
      showToast(`\u6253\u5F00\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, "bad");
      await reload();
      return;
    }
    showToast(`\u5DF2\u6253\u5F00 ${r.entryCount} \u6761\u8BF7\u6C42`, "good");
    await reload();
    lastPath.current = "";
    await refreshRows(true);
  };
  const openDetail = async (i) => {
    setDetailBusy(true);
    setDetail(null);
    const r = await sendCommand("entry", { index: i }, 2e4);
    setDetailBusy(false);
    if (!r.ok || !r.entry) {
      showToast(`\u53D6\u8BE6\u60C5\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, "bad");
      return;
    }
    setDetail(r.entry);
  };
  const baseRows = (() => {
    if (filter === "errors") return report?.errors || [];
    if (filter === "slow") return report?.slowTop || [];
    if (filter === "large") return report?.largeTop || [];
    return rows;
  })();
  const kw = q.trim().toLowerCase();
  const shown = kw ? baseRows.filter((r) => `${r.m} ${r.u}`.toLowerCase().includes(kw)) : baseRows;
  const span = Math.max(1, report?.spanMs || 1);
  const statusCounts = report?.statusCounts || {};
  const statusTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0) || 1;
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: pathInput,
          onChange: (e) => setPathInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") void open();
          },
          placeholder: "C:\\\\Users\\\\me\\\\Downloads\\\\trace.har",
          disabled: !running || opening || data.meta?.busy,
          style: { flex: 1, minWidth: 220, padding: "7px 10px", fontSize: 12, borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#e4e4e7" }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => void open(),
          disabled: !running || opening || data.meta?.busy,
          style: { padding: "7px 16px", fontSize: 12, borderRadius: 8, cursor: "pointer", border: "1px solid #3b82f6", background: "rgba(59,130,246,.2)", color: "#93c5fd", minHeight: 32 },
          children: opening || data.meta?.state === "parsing" ? "\u89E3\u6790\u4E2D\u2026" : "\u6253\u5F00"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            lastPath.current = "";
            void refreshRows(true);
            void reload();
          },
          style: { padding: "7px 10px", fontSize: 12, borderRadius: 8, cursor: "pointer", border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", minHeight: 32 },
          children: "\u5237\u65B0"
        }
      )
    ] }),
    data.hist.length > 0 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#52525b" }, children: "\u6700\u8FD1:" }),
      data.hist.slice(0, 5).map((h) => /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => {
            setPathInput(h.path);
            void open(h.path);
          },
          title: h.path,
          style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, cursor: "pointer", border: "1px solid #3f3f46", background: "transparent", color: "#71717a", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
          children: [
            h.path.split(/[\\/]/).pop(),
            " \xB7 ",
            h.entryCount,
            "\u6761"
          ]
        },
        h.path
      ))
    ] }),
    data.meta?.state === "error" && data.meta.error && /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(248,81,73,.4)", background: "rgba(248,81,73,.08)", fontSize: 12, color: "#fca5a5" }, children: [
      "\u4E0A\u6B21\u6253\u5F00\u51FA\u9519\uFF1A",
      data.meta.error
    ] }),
    !report && /* @__PURE__ */ jsxs("div", { style: { padding: 18, borderRadius: 8, border: "1px dashed #3f3f46", fontSize: 12, color: "#71717a", lineHeight: 1.9 }, children: [
      /* @__PURE__ */ jsx("div", { style: { color: "#a1a1aa", fontWeight: 600, marginBottom: 4 }, children: "\u8FD8\u6CA1\u6709\u6253\u5F00 HAR" }),
      /* @__PURE__ */ jsxs("div", { children: [
        "1. Chrome/Edge\uFF1AF12 \u2192 Network \u2192 \u64CD\u4F5C\u9875\u9762 \u2192 \u53F3\u952E\u8BF7\u6C42\u5217\u8868 \u2192 ",
        /* @__PURE__ */ jsx("b", { children: "Save all as HAR" }),
        " / \u2B07 \u5BFC\u51FA"
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "2. Firefox\uFF1AF12 \u2192 Network \u2192 \u9F7F\u8F6E \u2192 ",
        /* @__PURE__ */ jsx("b", { children: "Save All As HAR" })
      ] }),
      /* @__PURE__ */ jsx("div", { children: "3. \u628A .har \u6587\u4EF6\u8DEF\u5F84\u8D34\u5230\u4E0A\u9762\u70B9\u300C\u6253\u5F00\u300D\u2014\u2014\u89E3\u6790\u3001\u5BA1\u8BA1\u3001\u8131\u654F\u5168\u5728\u672C\u673A\u5B8C\u6210" })
    ] }),
    report && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }, children: [
        { k: "\u8BF7\u6C42", v: `${report.entryCount}${report.truncatedEntries ? "+" : ""}`, s: report.creator || "" },
        { k: "\u8DE8\u5EA6", v: fmtMs(report.spanMs), s: `\u8BF7\u8017\u65F6\u5408\u8BA1 ${fmtMs(report.timeSumMs)}` },
        { k: "\u4F20\u8F93", v: fmtBytes(report.transferBytes), s: `\u4F53\u5408\u8BA1 ${fmtBytes(report.bodyBytes)}` },
        { k: "p50 / p95", v: `${fmtMs(report.times.p50)} / ${fmtMs(report.times.p95)}`, s: `max ${fmtMs(report.times.max)}` },
        { k: "\u9519\u8BEF", v: `${report.errorCount}`, s: `\u7F13\u5B58\u547D\u4E2D ${report.cachedCount} \xB7 \u91CD\u5B9A\u5411 ${report.redirectCount}` }
      ].map((c) => /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderRadius: 8, border: "1px solid #3f3f46", background: "rgba(63,63,70,.25)" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#71717a" }, children: c.k }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: c.v }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 9, color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: c.s })
      ] }, c.k)) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#71717a", marginBottom: 4 }, children: "\u72B6\u6001\u5206\u5E03" }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#27272a" }, children: ["2xx", "3xx", "4xx", "5xx", "0/abort"].map((cls) => {
          const n = statusCounts[cls] || 0;
          if (!n) return null;
          const color = cls === "2xx" ? "#3fb950" : cls === "3xx" ? "#58a6ff" : cls === "4xx" ? "#d29922" : "#f85149";
          return /* @__PURE__ */ jsx("div", { style: { width: `${n / statusTotal * 100}%`, background: color }, title: `${cls}: ${n}` }, cls);
        }) }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#52525b", marginTop: 3 }, children: ["2xx", "3xx", "4xx", "5xx", "0/abort"].map((cls) => `${cls} ${statusCounts[cls] || 0}`).join(" \xB7 ") })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: (report.domains || []).slice(0, 8).map((d) => /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(88,166,255,.1)", color: "#79c0ff" }, children: [
        d.h,
        " \xB7 ",
        d.n,
        "\u6761 \xB7 ",
        fmtBytes(d.bytes)
      ] }, d.h)) })
    ] }),
    report && report.dupUncached.length > 0 && /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(210,153,34,.4)", background: "rgba(210,153,34,.08)", fontSize: 11, color: "#e3b341" }, children: [
      /* @__PURE__ */ jsx("b", { children: "\u7591\u4F3C\u65E0\u7F13\u5B58\u91CD\u590D" }),
      "\uFF08\u540C\u65B9\u6CD5+URL\uFF0C\u65E0 304/\u7F13\u5B58\u8BC1\u636E\uFF09\uFF1A",
      report.dupUncached.slice(0, 4).map((g) => /* @__PURE__ */ jsxs("div", { style: { marginTop: 2 }, children: [
        g.count,
        " \u6B21 \xB7 \u5408\u8BA1 ",
        fmtMs(g.timeSumMs),
        " \xB7 ",
        g.key.length > 110 ? `${g.key.slice(0, 110)}\u2026` : g.key
      ] }, g.key))
    ] }),
    report && /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
      FILTERS.map((f) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setFilter(f.id),
          style: {
            padding: "4px 12px",
            fontSize: 11,
            borderRadius: 8,
            cursor: "pointer",
            border: "1px solid",
            minHeight: 26,
            borderColor: filter === f.id ? "#3b82f6" : "#3f3f46",
            background: filter === f.id ? "rgba(59,130,246,.15)" : "transparent",
            color: filter === f.id ? "#93c5fd" : "#a1a1aa"
          },
          children: f.label
        },
        f.id
      )),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: q,
          onChange: (e) => setQ(e.target.value),
          placeholder: "\u641C\u7D22\u65B9\u6CD5/URL\u2026",
          style: { flex: 1, minWidth: 140, padding: "5px 10px", fontSize: 11, borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#e4e4e7" }
        }
      ),
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#52525b" }, children: [
        shown.length,
        " \u6761",
        rowsTruncated ? "\uFF08\u6295\u5F71\u5DF2\u622A\u65AD\uFF09" : ""
      ] })
    ] }),
    report && shown.length > 0 && /* @__PURE__ */ jsxs("div", { style: { border: "1px solid #3f3f46", borderRadius: 8, overflow: "hidden" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, padding: "6px 10px", fontSize: 9, color: "#71717a", borderBottom: "1px solid #27272a", flexWrap: "wrap" }, children: [
        Object.entries(PHASE_COLORS).map(([k, c]) => /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 3 }, children: [
          /* @__PURE__ */ jsx("span", { style: { width: 8, height: 8, background: c, borderRadius: 2, display: "inline-block" } }),
          { blocked: "\u6392\u961F", dns: "DNS", connect: "\u8FDE\u63A5", ssl: "TLS", send: "\u53D1\u9001", wait: "\u7B49\u5F85", receive: "\u4E0B\u8F7D", gap: "\u5176\u4ED6" }[k]
        ] }, k)),
        /* @__PURE__ */ jsxs("span", { style: { marginLeft: "auto" }, children: [
          "\u603B\u8F74 ",
          fmtMs(span)
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { maxHeight: 420, overflowY: "auto" }, children: shown.slice(0, 300).map((r) => {
        const segs = import_core.default.rowSegments(r);
        return /* @__PURE__ */ jsxs(
          "div",
          {
            onClick: () => void openDetail(r.i),
            style: {
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              cursor: "pointer",
              borderBottom: "1px solid #1c1c1f",
              background: detail && detail.i === r.i ? "rgba(59,130,246,.1)" : "transparent"
            },
            children: [
              /* @__PURE__ */ jsxs("span", { style: { width: 22, fontSize: 9, color: "#52525b", textAlign: "right", flexShrink: 0 }, children: [
                "#",
                r.i
              ] }),
              /* @__PURE__ */ jsx("span", { style: { width: 34, fontSize: 10, fontWeight: 600, color: "#a1a1aa", flexShrink: 0 }, children: r.m }),
              /* @__PURE__ */ jsx("span", { style: { width: 26, fontSize: 10, color: statusColor(r.s), flexShrink: 0, fontWeight: 700 }, children: r.s || "\u2212" }),
              /* @__PURE__ */ jsx("span", { style: { flex: 1, fontSize: 10, color: "#d4d4d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 80 }, title: r.u, children: r.u }),
              /* @__PURE__ */ jsx("span", { style: { width: 56, fontSize: 9, color: "#71717a", textAlign: "right", flexShrink: 0 }, children: fmtMs(r.t) }),
              /* @__PURE__ */ jsx("span", { style: { width: 54, fontSize: 9, color: "#71717a", textAlign: "right", flexShrink: 0 }, children: fmtBytes(r.sz) }),
              /* @__PURE__ */ jsx("span", { style: { width: 130, height: 10, position: "relative", background: "#18181b", borderRadius: 2, flexShrink: 0, overflow: "hidden" }, children: segs.map((sg, gi) => /* @__PURE__ */ jsx(
                "span",
                {
                  title: `${sg.k} ${fmtMs(sg.d)}`,
                  style: { position: "absolute", left: `${sg.s / span * 100}%`, width: `${Math.max(0.4, sg.d / span * 100)}%`, top: 0, bottom: 0, background: PHASE_COLORS[sg.k] || "#555" }
                },
                gi
              )) }),
              r.flags && /* @__PURE__ */ jsx("span", { style: { width: 44, fontSize: 8, color: "#d29922", flexShrink: 0 }, children: r.flags })
            ]
          },
          `${r.i}`
        );
      }) }),
      shown.length > 300 && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", fontSize: 10, color: "#52525b" }, children: "\u4EC5\u663E\u793A\u524D 300 \u6761\uFF08\u7528\u641C\u7D22/\u8FC7\u6EE4\u7F29\u5C0F\u8303\u56F4\uFF09" })
    ] }),
    detailBusy && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#71717a" }, children: "\u53D6\u8BE6\u60C5\u4E2D\u2026" }),
    detail && !detailBusy && /* @__PURE__ */ jsxs("div", { style: { border: "1px solid #3b82f6", borderRadius: 8, padding: 10, fontSize: 11, background: "rgba(59,130,246,.05)" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs("b", { style: { color: "#93c5fd" }, children: [
          "#",
          detail.i,
          " ",
          detail.method,
          " ",
          detail.status,
          " ",
          detail.statusText
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setDetail(null), style: { border: "none", background: "transparent", color: "#71717a", cursor: "pointer", fontSize: 14 }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { wordBreak: "break-all", color: "#d4d4d8", marginBottom: 4 }, children: detail.url }),
      /* @__PURE__ */ jsxs("div", { style: { color: "#71717a", marginBottom: 6 }, children: [
        detail.httpVersion,
        " \xB7 \u670D\u52A1\u7AEF ",
        detail.serverIp || "?",
        " \xB7 \u5F00\u59CB ",
        detail.startedAt,
        " \xB7 \u603B ",
        fmtMs(detail.time),
        detail.cache ? ` \xB7 ${detail.cache}` : ""
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }, children: Object.entries(detail.timings).map(([k, v]) => /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "rgba(63,63,70,.4)", color: v < 0 ? "#52525b" : "#d4d4d8" }, children: [
        k,
        ": ",
        v < 0 ? "\u2212" : fmtMs(v)
      ] }, k)) }),
      detail.query.length > 0 && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "#71717a" }, children: "Query: " }),
        /* @__PURE__ */ jsx("span", { style: { wordBreak: "break-all", color: "#a1a1aa" }, children: detail.query.map(([k, v]) => `${k}=${v}`).join("&").slice(0, 400) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
        /* @__PURE__ */ jsx(HeadList, { title: "\u8BF7\u6C42\u5934\uFF08\u654F\u611F\u503C\u5DF2\u63A9\u7801\uFF09", pairs: detail.reqHeaders }),
        /* @__PURE__ */ jsx(HeadList, { title: "\u54CD\u5E94\u5934\uFF08\u654F\u611F\u503C\u5DF2\u63A9\u7801\uFF09", pairs: detail.resHeaders })
      ] }),
      (detail.reqBody.text || detail.resBody.text) && /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
        detail.reqBody.text && /* @__PURE__ */ jsx(BodyBox, { label: `\u8BF7\u6C42\u4F53\u9884\u89C8\uFF08\u5DF2\u8131\u654F${detail.reqBody.truncated ? "\uFF0C\u622A\u65AD" : ""}\uFF09`, text: detail.reqBody.text }),
        detail.resBody.text && /* @__PURE__ */ jsx(BodyBox, { label: `\u54CD\u5E94\u4F53\u9884\u89C8\uFF08\u5DF2\u8131\u654F${detail.resBody.truncated ? "\uFF0C\u622A\u65AD" : ""}\uFF09`, text: detail.resBody.text })
      ] })
    ] })
  ] });
}
function HeadList({ title, pairs }) {
  if (!pairs.length) return null;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#71717a", marginBottom: 2 }, children: title }),
    /* @__PURE__ */ jsx("div", { style: { maxHeight: 130, overflowY: "auto", border: "1px solid #27272a", borderRadius: 6, padding: 4 }, children: pairs.slice(0, 40).map(([n, v], i) => /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, lineHeight: 1.6, wordBreak: "break-all" }, children: [
      /* @__PURE__ */ jsx("span", { style: { color: "#79c0ff" }, children: n }),
      ": ",
      /* @__PURE__ */ jsx("span", { style: { color: "#a1a1aa" }, children: v.length > 90 ? `${v.slice(0, 90)}\u2026` : v })
    ] }, i)) })
  ] });
}
function BodyBox({ label, text }) {
  const [open, setOpen] = useState(false);
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
    /* @__PURE__ */ jsxs("button", { onClick: () => setOpen(!open), style: { border: "none", background: "transparent", color: "#71717a", fontSize: 10, cursor: "pointer", padding: 0 }, children: [
      open ? "\u25BE" : "\u25B8",
      " ",
      label
    ] }),
    open && /* @__PURE__ */ jsx("pre", { style: { margin: "4px 0 0", padding: 6, background: "#18181b", border: "1px solid #27272a", borderRadius: 6, fontSize: 10, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#a1a1aa" }, children: text })
  ] });
}

// src/tabs/AuditTab.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SAN_KEYS = [
  { k: "authHeaders", label: "\u9274\u6743\u5934\uFF08Authorization / X-Api-Key \u7B49 \u2192 \u503C\u7F6E\u63A9\u7801\uFF09" },
  { k: "cookies", label: "\u8BF7\u6C42 Cookie" },
  { k: "setCookies", label: "\u54CD\u5E94 Set-Cookie" },
  { k: "querySecrets", label: "URL \u654F\u611F\u53C2\u6570\uFF08token/key/secret\u2026\uFF09" },
  { k: "bodies", label: "\u8BF7\u6C42/\u54CD\u5E94\u4F53\u5185\u5BB9\uFF08\u6574\u4F53\u66FF\u6362\u5360\u4F4D\uFF09" },
  { k: "urlCredentials", label: "URL \u5185\u5D4C\u51ED\u636E\uFF08user:pass@\uFF09" }
];
function AuditTab({ data, running, reload, showToast }) {
  const audit = data.audit;
  const [settings, setSettings] = useState2(null);
  const [outPath, setOutPath] = useState2("");
  const [busy, setBusy] = useState2("");
  const [result, setResult] = useState2(null);
  useEffect2(() => {
    void getSettings().then(setSettings);
  }, []);
  const hasHar = !!(data.meta?.activePath || data.report);
  const toggle = async (k) => {
    if (!settings) return;
    const next = { ...settings, sanitize: { ...settings.sanitize, [k]: !settings.sanitize[k] } };
    setSettings(next);
    await saveSettings(next);
  };
  const runExport = async (confirm) => {
    setBusy(confirm ? "export" : "preview");
    setResult(null);
    const payload = {};
    if (outPath.trim()) payload.outputPath = outPath.trim();
    if (confirm) {
      payload.confirm = true;
      payload.overwrite = !!result?.overwrite;
    }
    const r = await sendCommand("sanitize", payload, 9e4);
    setBusy("");
    if (!r.ok) {
      showToast(`\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, "bad");
      return;
    }
    if (r.preview) {
      setResult(r);
      showToast("\u9884\u68C0\u5B8C\u6210\uFF08\u672A\u5199\u76D8\uFF09", "info");
    } else {
      setResult(r);
      showToast(`\u5DF2\u5BFC\u51FA ${r.outputPath}`, "good");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    !hasHar && /* @__PURE__ */ jsx2("div", { style: { padding: 14, borderRadius: 8, border: "1px dashed #3f3f46", fontSize: 12, color: "#71717a" }, children: "\u5148\u5230\u300C\u5206\u6790\u300D\u9875\u6253\u5F00\u4E00\u4E2A HAR\u2014\u2014\u6253\u5F00\u5373\u81EA\u52A8\u5B8C\u6210\u5BA1\u8BA1\u3002" }),
    hasHar && audit && /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs2("span", { style: { fontSize: 11, padding: "3px 10px", borderRadius: 8, background: audit.total === 0 ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)", color: audit.total === 0 ? "#3fb950" : "#f85149" }, children: [
        "\u547D\u4E2D ",
        audit.total,
        " \u5904\uFF08\u9AD8\u5371 ",
        audit.highCount,
        "\uFF09\xB7 \u626B\u63CF ",
        audit.scannedEntries,
        " \u6761"
      ] }),
      /* @__PURE__ */ jsx2("span", { style: { fontSize: 10, color: "#52525b", alignSelf: "center" }, children: "\u5BA1\u8BA1\u53EA\u8986\u76D6\u5DF2\u77E5\u7279\u5F81\uFF1B\u5BF9\u5916\u5206\u4EAB\u524D\u5EFA\u8BAE\u65E0\u8BBA\u5982\u4F55\u8DD1\u4E00\u6B21\u5168\u91CF\u8131\u654F\u3002" })
    ] }),
    hasHar && audit && audit.findings.length === 0 && /* @__PURE__ */ jsx2("div", { style: { padding: 14, borderRadius: 8, border: "1px solid rgba(63,185,80,.35)", background: "rgba(63,185,80,.08)", fontSize: 12, color: "#7ee2a8" }, children: "\u2705 \u672A\u53D1\u73B0\u654F\u611F\u4FE1\u606F\u547D\u4E2D\uFF08\u9274\u6743\u5934/Cookie/\u654F\u611F\u53C2\u6570/\u5BC6\u94A5\u7279\u5F81/\u79C1\u94A5/JWT/\u8FDE\u63A5\u4E32\uFF09\u3002\u53EF\u7EE7\u7EED\u7528\u4E0B\u65B9\u8131\u654F\u5BFC\u51FA\u505A\u515C\u5E95\u6E05\u6D17\u3002" }),
    audit && audit.findings.map((f) => /* @__PURE__ */ jsxs2("div", { style: { border: `1px solid ${f.sev === "high" ? "rgba(248,81,73,.4)" : "rgba(210,153,34,.35)"}`, borderRadius: 8, padding: 10, background: f.sev === "high" ? "rgba(248,81,73,.06)" : "rgba(210,153,34,.05)" }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs2("b", { style: { fontSize: 12, color: f.sev === "high" ? "#f85149" : "#d29922" }, children: [
          f.sev === "high" ? "\u9AD8\u5371" : "\u4E2D\u5371",
          " \xB7 ",
          f.label
        ] }),
        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 10, color: "#71717a" }, children: [
          f.count,
          " \u5904 / ",
          f.entryCount,
          " \u6761\u8BF7\u6C42\uFF08#",
          f.idx.slice(0, 10).join(" #"),
          f.idx.length > 10 ? "\u2026" : "",
          "\uFF09"
        ] })
      ] }),
      f.samples.map((s, i) => /* @__PURE__ */ jsxs2("div", { style: { fontSize: 10, color: "#a1a1aa", marginTop: 3, wordBreak: "break-all" }, children: [
        "#",
        s.i,
        " ",
        s.where,
        "\uFF1A",
        s.masked.length > 130 ? `${s.masked.slice(0, 130)}\u2026` : s.masked
      ] }, i))
    ] }, f.cat)),
    hasHar && /* @__PURE__ */ jsxs2("div", { style: { border: "1px solid #3f3f46", borderRadius: 8, padding: 12 }, children: [
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 13, fontWeight: 700, color: "#f4f4f5", marginBottom: 6 }, children: "\u{1F9FC} \u8131\u654F\u5BFC\u51FA\uFF08\u5206\u4EAB\u5B89\u5168\u7248\uFF09" }),
      /* @__PURE__ */ jsx2("div", { style: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }, children: settings && SAN_KEYS.map(({ k, label }) => /* @__PURE__ */ jsxs2("label", { style: { fontSize: 11, color: "#d4d4d8", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: settings.sanitize[k], onChange: () => void toggle(k) }),
        label
      ] }, k)) }),
      /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 6, marginBottom: 8 }, children: /* @__PURE__ */ jsx2(
        "input",
        {
          value: outPath,
          onChange: (e) => setOutPath(e.target.value),
          placeholder: "\u8F93\u51FA\u8DEF\u5F84\uFF08\u7559\u7A7A = \u6E90\u6587\u4EF6\u540C\u76EE\u5F55 <\u539F\u540D>.sanitized.har\uFF09",
          style: { flex: 1, padding: "6px 10px", fontSize: 11, borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#e4e4e7" }
        }
      ) }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2(
          "button",
          {
            onClick: () => void runExport(false),
            disabled: !running || busy !== "",
            style: { padding: "6px 14px", fontSize: 11, borderRadius: 8, cursor: "pointer", border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", minHeight: 30 },
            children: "\u9884\u68C0\uFF08\u4E0D\u5199\u76D8\uFF09"
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            onClick: () => void runExport(true),
            disabled: !running || busy !== "",
            style: { padding: "6px 14px", fontSize: 11, borderRadius: 8, cursor: "pointer", border: "1px solid #3fb950", background: "rgba(63,185,80,.15)", color: "#3fb950", minHeight: 30 },
            children: "\u5BFC\u51FA\u8131\u654F\u7248"
          }
        ),
        busy && /* @__PURE__ */ jsx2("span", { style: { fontSize: 10, color: "#71717a" }, children: "\u5904\u7406\u4E2D\u2026" })
      ] }),
      result && result.preview && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8, padding: 8, borderRadius: 8, border: "1px solid rgba(59,130,246,.3)", background: "rgba(59,130,246,.06)", fontSize: 11, color: "#93c5fd" }, children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          "\u8F93\u51FA\u5230\uFF1A",
          String(result.outputPath || ""),
          result.overwrite ? "\uFF08\u26A0 \u76EE\u6807\u5DF2\u5B58\u5728\uFF0C\u5BFC\u51FA\u5C06\u9700\u8981\u786E\u8BA4\u8986\u76D6\uFF09" : ""
        ] }),
        /* @__PURE__ */ jsx2("div", { style: { marginTop: 3, color: "#71717a" }, children: "\u9884\u68C0\u672A\u5199\u76D8\uFF1B\u786E\u8BA4\u65E0\u8BEF\u70B9\u300C\u5BFC\u51FA\u8131\u654F\u7248\u300D\u3002" })
      ] }),
      result && !result.preview && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8, padding: 8, borderRadius: 8, border: "1px solid rgba(63,185,80,.4)", background: "rgba(63,185,80,.07)", fontSize: 11, color: "#7ee2a8", wordBreak: "break-all" }, children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          "\u2705 \u5DF2\u5BFC\u51FA\uFF1A",
          String(result.outputPath || ""),
          "\uFF08",
          fmtBytes(Number(result.bytes) || 0),
          "\uFF09"
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          "sha256: ",
          String(result.sha256 || "")
        ] }),
        (() => {
          const stats = result.stats || {};
          const rc = result.recheck;
          return /* @__PURE__ */ jsxs2(Fragment2, { children: [
            /* @__PURE__ */ jsxs2("div", { children: [
              "\u8131\u654F\u7EDF\u8BA1: ",
              Object.entries(stats).map(([k, n]) => `${k}:${n}`).join(", ") || "\u65E0\u547D\u4E2D"
            ] }),
            rc && /* @__PURE__ */ jsxs2("div", { children: [
              "\u590D\u6838: \u7ED3\u6784",
              rc.valid ? "\u5408\u6CD5 \u2705" : "\u5F02\u5E38 \u274C",
              " \xB7 \u590D\u6838\u5BA1\u8BA1\u5269\u4F59 ",
              rc.auditTotal,
              " \u5904\uFF08\u9AD8\u5371 ",
              rc.auditHigh,
              "\uFF09"
            ] })
          ] });
        })()
      ] })
    ] })
  ] });
}

// src/tabs/CompareTab.tsx
import { useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var SECTIONS = [
  { id: "slower", label: "\u53D8\u6162" },
  { id: "faster", label: "\u53D8\u5FEB" },
  { id: "flips", label: "\u72B6\u6001\u7FFB\u8F6C" },
  { id: "added", label: "\u65B0\u589E" },
  { id: "removed", label: "\u6D88\u5931" }
];
function CompareTab({ data, running, reload, showToast }) {
  const [pathInput, setPathInput] = useState3("");
  const [busy, setBusy] = useState3(false);
  const [section, setSection] = useState3("slower");
  const diff = data.diff;
  const hasHar = !!(data.meta?.activePath || data.report);
  const run = async () => {
    const p = pathInput.trim();
    if (!p) {
      showToast("\u8BF7\u586B\u5199\u5BF9\u6BD4 HAR \u6587\u4EF6\u8DEF\u5F84", "bad");
      return;
    }
    setBusy(true);
    const r = await sendCommand("compare", { path: p }, 9e4);
    setBusy(false);
    if (!r.ok) {
      showToast(`\u5BF9\u6BD4\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, "bad");
      return;
    }
    showToast("\u5BF9\u6BD4\u5B8C\u6210", "good");
    await reload();
  };
  const s = diff?.summary;
  const rows = diff ? diff[section] || [] : [];
  return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    !hasHar && /* @__PURE__ */ jsx3("div", { style: { padding: 14, borderRadius: 8, border: "1px dashed #3f3f46", fontSize: 12, color: "#71717a" }, children: "\u5148\u5230\u300C\u5206\u6790\u300D\u9875\u6253\u5F00\u57FA\u51C6 HAR\uFF08\u901A\u5E38\u662F\u4F18\u5316\u524D/\u53D1\u5E03\u524D\u7684\u90A3\u4EFD\uFF09\u3002" }),
    hasHar && /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx3(
        "input",
        {
          value: pathInput,
          onChange: (e) => setPathInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") void run();
          },
          placeholder: "\u5BF9\u6BD4 .har \u6587\u4EF6\u8DEF\u5F84\uFF08\u4F18\u5316\u540E/\u53D1\u5E03\u540E\uFF09",
          disabled: !running || busy,
          style: { flex: 1, minWidth: 220, padding: "7px 10px", fontSize: 12, borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#e4e4e7" }
        }
      ),
      /* @__PURE__ */ jsx3(
        "button",
        {
          onClick: () => void run(),
          disabled: !running || busy,
          style: { padding: "7px 16px", fontSize: 12, borderRadius: 8, cursor: "pointer", border: "1px solid #3b82f6", background: "rgba(59,130,246,.2)", color: "#93c5fd", minHeight: 32 },
          children: busy ? "\u5BF9\u6BD4\u4E2D\u2026" : "\u5BF9\u6BD4"
        }
      )
    ] }),
    s && diff && /* @__PURE__ */ jsxs3(Fragment3, { children: [
      /* @__PURE__ */ jsx3("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }, children: [
        { k: "\u5339\u914D", v: `${s.matched}`, c: "#d4d4d8" },
        { k: "\u65B0\u589E", v: `${s.added}`, c: "#79c0ff" },
        { k: "\u6D88\u5931", v: `${s.removed}`, c: "#8b949e" },
        { k: "\u53D8\u6162", v: `${s.slowerCount}`, c: "#f85149" },
        { k: "\u53D8\u5FEB", v: `${s.fasterCount}`, c: "#3fb950" },
        { k: "\u72B6\u6001\u7FFB\u8F6C", v: `${s.flips}`, c: "#d29922" },
        { k: "\u603B\u8017\u65F6", v: `${fmtMs(s.baseTimeSum)} \u2192 ${fmtMs(s.candTimeSum)}`, c: s.candTimeSum >= s.baseTimeSum ? "#f85149" : "#3fb950" }
      ].map((c) => /* @__PURE__ */ jsxs3("div", { style: { padding: "8px 10px", borderRadius: 8, border: "1px solid #3f3f46", background: "rgba(63,63,70,.25)" }, children: [
        /* @__PURE__ */ jsx3("div", { style: { fontSize: 10, color: "#71717a" }, children: c.k }),
        /* @__PURE__ */ jsx3("div", { style: { fontSize: 14, fontWeight: 700, color: c.c }, children: c.v })
      ] }, c.k)) }),
      /* @__PURE__ */ jsxs3("div", { style: { fontSize: 10, color: "#52525b" }, children: [
        "\u57FA\u51C6: ",
        diff.basePath.split(/[\\/]/).pop(),
        " vs \u5BF9\u6BD4\u4EF6: ",
        diff.candPath.split(/[\\/]/).pop(),
        "\uFF08URL \u7CBE\u786E\u5339\u914D\u4F18\u5148\uFF0C\u53BB query \u540C\u8DEF\u5F84\u515C\u5E95\uFF1B\u8017\u65F6\u5DEE\u8D85\u8FC7 50ms \u8BA1\u5165\u53D8\u6162/\u53D8\u5FEB\uFF09"
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: SECTIONS.map((sec) => /* @__PURE__ */ jsxs3(
        "button",
        {
          onClick: () => setSection(sec.id),
          style: {
            padding: "4px 12px",
            fontSize: 11,
            borderRadius: 8,
            cursor: "pointer",
            border: "1px solid",
            minHeight: 26,
            borderColor: section === sec.id ? "#3b82f6" : "#3f3f46",
            background: section === sec.id ? "rgba(59,130,246,.15)" : "transparent",
            color: section === sec.id ? "#93c5fd" : "#a1a1aa"
          },
          children: [
            sec.label,
            " ",
            (diff[sec.id] || []).length
          ]
        },
        sec.id
      )) }),
      /* @__PURE__ */ jsxs3("div", { style: { border: "1px solid #3f3f46", borderRadius: 8, overflow: "hidden" }, children: [
        rows.length === 0 && /* @__PURE__ */ jsx3("div", { style: { padding: 12, fontSize: 11, color: "#52525b" }, children: "\uFF08\u65E0\u8BB0\u5F55\uFF09" }),
        rows.slice(0, 60).map((r, i) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid #1c1c1f", fontSize: 10 }, children: [
          section === "slower" || section === "faster" ? /* @__PURE__ */ jsxs3(Fragment3, { children: [
            /* @__PURE__ */ jsxs3("span", { style: { width: 64, color: section === "slower" ? "#f85149" : "#3fb950", fontWeight: 700, flexShrink: 0 }, children: [
              r.dt && r.dt > 0 ? "+" : "",
              fmtMs(r.dt || 0)
            ] }),
            /* @__PURE__ */ jsxs3("span", { style: { width: 90, color: "#71717a", flexShrink: 0 }, children: [
              fmtMs(r.t1 || 0),
              " \u2192 ",
              fmtMs(r.t2 || 0)
            ] }),
            /* @__PURE__ */ jsx3("span", { style: { width: 26, color: statusColor(r.s1 || 0), flexShrink: 0 }, children: r.s1 }),
            /* @__PURE__ */ jsx3("span", { style: { width: 26, color: statusColor(r.s2 || 0), flexShrink: 0 }, children: r.s2 })
          ] }) : section === "flips" ? /* @__PURE__ */ jsxs3(Fragment3, { children: [
            /* @__PURE__ */ jsxs3("span", { style: { width: 64, color: "#d29922", fontWeight: 700, flexShrink: 0 }, children: [
              r.s1,
              " \u2192 ",
              r.s2
            ] }),
            /* @__PURE__ */ jsxs3("span", { style: { width: 90, color: "#71717a", flexShrink: 0 }, children: [
              fmtMs(r.t1 || 0),
              " \u2192 ",
              fmtMs(r.t2 || 0)
            ] })
          ] }) : /* @__PURE__ */ jsxs3(Fragment3, { children: [
            /* @__PURE__ */ jsx3("span", { style: { width: 26, color: statusColor(r.s || 0), flexShrink: 0 }, children: r.s }),
            /* @__PURE__ */ jsx3("span", { style: { width: 50, color: "#71717a", flexShrink: 0 }, children: fmtMs(r.t || 0) }),
            /* @__PURE__ */ jsx3("span", { style: { width: 54, color: "#71717a", flexShrink: 0 }, children: fmtBytes(r.sz || 0) })
          ] }),
          /* @__PURE__ */ jsxs3("span", { style: { flex: 1, color: "#d4d4d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: r.u, children: [
            r.m,
            " ",
            r.u
          ] })
        ] }, i))
      ] })
    ] })
  ] });
}

// src/tabs/SelftestTab.tsx
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SelftestTab({ data, running, reload, showToast }) {
  const [busy, setBusy] = useState4(false);
  const report = data.selftest;
  const run = async () => {
    setBusy(true);
    const r = await sendCommand("selftest", {}, 6e4);
    setBusy(false);
    if (!r.ok || !r.report) {
      showToast(`\u81EA\u68C0\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, "bad");
      return;
    }
    showToast(r.report.allGreen ? `\u81EA\u68C0 ${r.report.passed}/${r.report.total} \u5168\u7EFF` : `\u81EA\u68C0\u6709\u5931\u8D25\u9879`, r.report.allGreen ? "good" : "bad");
    await reload();
  };
  return /* @__PURE__ */ jsxs4("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsx4("div", { style: {
      fontSize: 11,
      padding: "8px 10px",
      borderRadius: 8,
      background: "rgba(59,130,246,.08)",
      border: "1px solid rgba(59,130,246,.25)",
      color: "#93c5fd"
    }, children: "\u8BD5\u91D1\u77F3\u81EA\u68C0\u5728\u670D\u52A1\u8FDB\u7A0B\u5185\u5B58\u91CC\u5408\u6210\u4E00\u4EFD\u5E26\u5DF2\u77E5\u75C5\u7076\u7684 fixture HAR\uFF08\u6162\u8BF7\u6C42/500/404/\u91CD\u590D\u8BF7\u6C42/\u9274\u6743\u5934/Cookie/\u5BC6\u94A5\u7279\u5F81/JWT/\u5BC6\u7801\u4F53\uFF09\uFF0C\u8D70 \u89E3\u6790\u2192\u5206\u6790\u2192\u5BA1\u8BA1\u2192\u8131\u654F\u2192\u5BF9\u6BD4\u2192\u8BE6\u60C5 \u5168\u94FE\u8DEF\u9010\u9879\u65AD\u8A00\u2014\u2014\u96F6\u7F51\u7EDC\u3001\u4E0D\u78B0\u4F60\u7684\u771F\u5B9E\u6587\u4EF6\u3002" }),
    /* @__PURE__ */ jsx4("div", { children: /* @__PURE__ */ jsx4(
      "button",
      {
        onClick: () => void run(),
        disabled: !running || busy,
        style: { padding: "7px 18px", fontSize: 12, borderRadius: 8, cursor: "pointer", border: "1px solid #3b82f6", background: "rgba(59,130,246,.2)", color: "#93c5fd", minHeight: 32 },
        children: busy ? "\u81EA\u68C0\u4E2D\u2026" : "\u8FD0\u884C\u81EA\u68C0"
      }
    ) }),
    report && /* @__PURE__ */ jsxs4("div", { style: { border: "1px solid #3f3f46", borderRadius: 8, padding: 10 }, children: [
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 12, fontWeight: 700, color: report.allGreen ? "#3fb950" : "#f85149", marginBottom: 6 }, children: [
        report.allGreen ? "\u2705" : "\u274C",
        " ",
        report.passed,
        "/",
        report.total,
        " \u901A\u8FC7 \xB7 ",
        report.durationMs,
        "ms \xB7 v",
        report.version
      ] }),
      report.checks.map((c, i) => /* @__PURE__ */ jsxs4("div", { style: { fontSize: 11, lineHeight: 1.8 }, children: [
        /* @__PURE__ */ jsx4("span", { style: { color: c.pass ? "#3fb950" : "#f85149" }, children: c.pass ? "\u2705" : "\u274C" }),
        " ",
        c.item,
        !c.pass && c.detail && /* @__PURE__ */ jsxs4("span", { style: { color: "#f85149" }, children: [
          " \u2014\u2014 ",
          c.detail
        ] })
      ] }, i))
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var META_FRESH_MS = 90 * 1e3;
var POLL_MS = 2500;
var TABS = [
  { id: "analyze", label: "\u5206\u6790" },
  { id: "audit", label: "\u5BA1\u8BA1" },
  { id: "compare", label: "\u5BF9\u6BD4" },
  { id: "selftest", label: "\u81EA\u68C0" }
];
function Panel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("analyze");
  const [data, setData] = useState5({ meta: null, report: null, audit: null, diff: null, hist: [], selftest: null, loaded: false });
  const [toast, setToast] = useState5(null);
  const toastTimer = useRef2(void 0);
  const loadedOnce = useRef2(false);
  const showToast = useCallback2((msg, kind = "info") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback2(async () => {
    try {
      const [meta, report, audit] = await Promise.all([getMeta(), getReport(), getAudit()]);
      const [diff, hist, selftest] = await Promise.all([getDiff(), getHist(), getSelftest()]);
      const next = { meta, report, audit, diff, hist, selftest, loaded: true };
      setData(next);
      return next;
    } catch (_) {
      const next = { meta: null, report: null, audit: null, diff: null, hist: [], selftest: null, loaded: true };
      setData(next);
      return next;
    }
  }, []);
  useEffect3(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);
  const running = !!(data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < META_FRESH_MS);
  if (data.loaded && !loadedOnce.current) loadedOnce.current = true;
  const stLabel = data.meta?.state === "parsing" ? "\u89E3\u6790\u4E2D\u2026" : data.meta?.state === "error" ? "\u4E0A\u6B21\u6253\u5F00\u51FA\u9519" : data.meta?.state === "ready" ? "\u5DF2\u5C31\u7EEA" : "\u5F85\u6253\u5F00";
  return /* @__PURE__ */ jsxs5("div", { style: { padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10, color: "#d4d4d8" }, children: [
    /* @__PURE__ */ jsxs5("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx5("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u2317 HAR \u5206\u6790\u53F0" }),
      /* @__PURE__ */ jsx5("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? `\u670D\u52A1\u4E2D :${data.meta?.port ?? ""}` : "\u670D\u52A1\u79BB\u7EBF" }),
      running && /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, color: "#52525b" }, children: [
        stLabel,
        data.report ? ` \xB7 ${data.report.entryCount} \u6761 \xB7 ${(data.report.spanMs / 1e3).toFixed(2)}s` : ""
      ] }),
      data.report && data.report.auditHigh && data.report.auditHigh.total > 0 && /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(248,81,73,.15)", color: "#f85149" }, children: [
        "\u26A0 \u654F\u611F\u4FE1\u606F ",
        data.report.auditHigh.total,
        " \u5904\uFF08\u9AD8\u5371 ",
        data.report.auditHigh.high,
        "\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsx5("div", { style: {
      fontSize: 11,
      padding: "6px 10px",
      borderRadius: 8,
      background: "rgba(59,130,246,.08)",
      border: "1px solid rgba(59,130,246,.25)",
      color: "#93c5fd"
    }, children: "\u6D4F\u89C8\u5668 DevTools \u2192 Network \u2192 \u53F3\u952E \u2B07 Export HAR \u5BFC\u51FA\u6293\u5305\uFF0C\u628A\u6587\u4EF6\u8DEF\u5F84\u8D34\u8FDB\u300C\u5206\u6790\u300D\u9875\u5373\u53EF\uFF1A\u5168\u672C\u5730\u89E3\u6790\uFF08\u4E0D\u51FA\u672C\u673A\uFF09\u3001\u7011\u5E03\u56FE\u4E0E\u6162\u8BF7\u6C42\u8BCA\u65AD\u3001\u5206\u4EAB\u524D\u4E00\u952E\u5BA1\u8BA1\u8131\u654F\u3002\u4E0A\u9650 150MB / 2 \u4E07\u6761\u3002" }),
    /* @__PURE__ */ jsx5("div", { style: { display: "flex", gap: 4, overflowX: "auto" }, children: TABS.map((tb) => /* @__PURE__ */ jsx5(
      "button",
      {
        onClick: () => setTab(tb.id),
        style: {
          padding: "6px 14px",
          fontSize: 12,
          borderRadius: 8,
          cursor: "pointer",
          border: "1px solid",
          minHeight: 32,
          whiteSpace: "nowrap",
          borderColor: tab === tb.id ? "#3b82f6" : "#3f3f46",
          background: tab === tb.id ? "rgba(59,130,246,.15)" : "transparent",
          color: tab === tb.id ? "#93c5fd" : "#a1a1aa"
        },
        children: tb.label
      },
      tb.id
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
        "\u540E\u53F0\u670D\u52A1\u672A\u8FD0\u884C\uFF1A\u65E0\u6CD5\u89E3\u6790 HAR\u3002\u53BB ",
        /* @__PURE__ */ jsx5("b", { children: "\u8BBE\u7F6E" }),
        " \u9875\u542F\u52A8\u670D\u52A1\uFF08\u6216\u68C0\u67E5\u7AEF\u53E3 9873 \u662F\u5426\u88AB\u5360\u7528\uFF09\u3002"
      ] }),
      tab === "analyze" && /* @__PURE__ */ jsx5(AnalyzeTab, { data, running, reload, showToast }),
      tab === "audit" && /* @__PURE__ */ jsx5(AuditTab, { data, running, reload, showToast }),
      tab === "compare" && /* @__PURE__ */ jsx5(CompareTab, { data, running, reload, showToast }),
      tab === "selftest" && /* @__PURE__ */ jsx5(SelftestTab, { data, running, reload, showToast })
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
    /* @__PURE__ */ jsx5("div", { style: { fontSize: 10, color: "#52525b" }, children: "\u5168\u7A0B\u65E0\u7F51\u7EDC\u8BF7\u6C42\uFF1A\u89E3\u6790/\u5BA1\u8BA1/\u8131\u654F/\u5BFC\u51FA\u5168\u5728\u672C\u673A\u5B8C\u6210\uFF1Bkv \u6295\u5F71\u4E0E AI \u6458\u8981\u5747\u7ECF\u8FC7\u8131\u654F\uFF0C\u660E\u6587\u5BC6\u94A5\u4E0D\u843D kv\u3002\u4E0A\u9650 150MB / 2 \u4E07\u6761\uFF0C\u8D85\u51FA\u90E8\u5206\u622A\u65AD\u5E76\u660E\u793A\u3002" })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function HarLensEntry(props) {
  return /* @__PURE__ */ jsx6(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  HarLensEntry as default
};
