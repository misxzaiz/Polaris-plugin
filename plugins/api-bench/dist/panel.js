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

// shared/bench-core.js
var require_bench_core = __commonJS({
  "shared/bench-core.js"(exports, module) {
    "use strict";
    var VERSION = "0.1.0";
    var LIMITS = {
      connections: { min: 1, max: 1e3, default: 10 },
      durationS: { min: 1, max: 300, default: 10 },
      pipelining: { min: 1, max: 10, default: 1 },
      rate: { min: 1, max: 1e6 },
      timeoutS: { min: 0.5, max: 60, default: 10 },
      urlMaxLen: 2048,
      headersMaxEntries: 64,
      headerNameMaxLen: 128,
      headerValueMaxBytes: 8192,
      bodyMaxBytes: 1024 * 1024,
      samplesMax: 400,
      // 实时采样点上限（约 6 分钟 @1s）
      latRingMax: 2e4,
      // 实时分位窗口容量（响应数）
      reportSamplesKeep: 120
      // 报告内保留的采样点数（图表用）
    };
    var SENSITIVE_HEADERS = ["authorization", "cookie", "proxy-authorization", "x-api-key", "x-auth-token", "set-cookie"];
    var FORBIDDEN_HEADERS = ["host", "content-length", "connection"];
    function isPlainObject(v) {
      return v !== null && typeof v === "object" && !Array.isArray(v);
    }
    function fmtMs(ms) {
      const n = Number(ms);
      if (!Number.isFinite(n)) return "?";
      if (n >= 1e4) return `${(n / 1e3).toFixed(1)}s`;
      if (n >= 100) return `${Math.round(n)}ms`;
      return `${n.toFixed(n < 10 ? 1 : 0)}ms`;
    }
    function fmtRate(rps) {
      const n = Number(rps);
      if (!Number.isFinite(n)) return "?";
      if (n >= 1e4) return `${Math.round(n / 1e3)}k/s`;
      return `${n.toFixed(n >= 100 ? 0 : 1)}/s`;
    }
    function fmtBytes(bps) {
      const n = Number(bps);
      if (!Number.isFinite(n)) return "?";
      if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB/s`;
      if (n >= 1024) return `${(n / 1024).toFixed(1)}KB/s`;
      return `${Math.round(n)}B/s`;
    }
    function maskValue(v) {
      const s = String(v || "");
      if (!s) return "";
      if (s.length <= 4) return "****";
      return `****${s.slice(-4)}`;
    }
    function maskHeaders(headers) {
      const out = {};
      for (const [k, v] of Object.entries(headers || {})) {
        out[k] = SENSITIVE_HEADERS.includes(String(k).toLowerCase()) ? maskValue(v) : String(v);
      }
      return out;
    }
    function scopeOf(urlStr) {
      try {
        const u = new URL(urlStr);
        const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        if (h === "localhost" || h === "::1" || /^127\./.test(h) || h === "::ffff:127.0.0.1") return "loopback";
        if (/^10\./.test(h)) return "private";
        if (/^192\.168\./.test(h)) return "private";
        if (/^169\.254\./.test(h)) return "private";
        if (/^fe80:/i.test(h) || /^fc00:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return "private";
        const m172 = /^172\.(\d+)\./.exec(h);
        if (m172) {
          const second = Number(m172[1]);
          if (second >= 16 && second <= 31) return "private";
        }
        if (/\.local$/i.test(h)) return "private";
        return "public";
      } catch (_) {
        return "invalid";
      }
    }
    function clampInt(v, lim, fallback) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return fallback;
      return Math.min(lim.max, Math.max(lim.min, n));
    }
    function clampNum(v, lim, fallback) {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(lim.max, Math.max(lim.min, n));
    }
    function sanitizeTarget(input, defaults) {
      const d = defaults || {};
      const out = {
        method: "GET",
        headers: {},
        body: "",
        connections: clampInt(d.connections, LIMITS.connections, LIMITS.connections.default),
        durationS: clampInt(d.durationS, LIMITS.durationS, LIMITS.durationS.default),
        pipelining: LIMITS.pipelining.default,
        rate: null,
        timeoutS: clampNum(d.timeoutS, LIMITS.timeoutS, LIMITS.timeoutS.default)
      };
      const src = isPlainObject(input) ? input : {};
      const urlRaw = String(src.url || "").trim();
      if (!urlRaw) return { ok: false, error: "\u7F3A\u5C11\u76EE\u6807 URL" };
      if (urlRaw.length > LIMITS.urlMaxLen) return { ok: false, error: `URL \u8FC7\u957F\uFF08>${LIMITS.urlMaxLen} \u5B57\u7B26\uFF09` };
      let u;
      try {
        u = new URL(urlRaw);
      } catch (_) {
        return { ok: false, error: `URL \u65E0\u6CD5\u89E3\u6790\uFF1A${urlRaw.slice(0, 80)}` };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: `\u4EC5\u652F\u6301 http/https \u76EE\u6807\uFF08\u6536\u5230 ${u.protocol.replace(":", "")}\uFF09` };
      }
      if (!u.hostname) return { ok: false, error: "URL \u7F3A\u5C11\u4E3B\u673A\u540D" };
      out.url = u.toString();
      if (src.method !== void 0 && src.method !== "") {
        const m = String(src.method).trim().toUpperCase();
        if (!/^[A-Z]{1,10}$/.test(m)) return { ok: false, error: `method \u975E\u6CD5\uFF1A${m.slice(0, 20)}` };
        out.method = m;
      }
      if (src.headers !== void 0 && src.headers !== null) {
        if (!isPlainObject(src.headers)) return { ok: false, error: "headers \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08{\u540D: \u503C}\uFF09" };
        const entries = Object.entries(src.headers);
        if (entries.length > LIMITS.headersMaxEntries) return { ok: false, error: `headers \u8FC7\u591A\uFF08>${LIMITS.headersMaxEntries} \u9879\uFF09` };
        for (const [k, v] of entries) {
          const name = String(k).trim();
          if (!/^[!-~]+$/.test(name) || name.length > LIMITS.headerNameMaxLen) {
            return { ok: false, error: `header \u540D\u975E\u6CD5\uFF1A${name.slice(0, 40)}` };
          }
          if (FORBIDDEN_HEADERS.includes(name.toLowerCase())) {
            return { ok: false, error: `header\u300C${name}\u300D\u7531\u538B\u6D4B\u5BA2\u6237\u7AEF\u6258\u7BA1\uFF0C\u8BF7\u79FB\u9664\uFF08\u907F\u514D\u7834\u574F\u8BF7\u6C42\uFF09` };
          }
          const val = typeof v === "string" ? v : String(v);
          if (Buffer.byteLength(val, "utf8") > LIMITS.headerValueMaxBytes) {
            return { ok: false, error: `header\u300C${name}\u300D\u503C\u8FC7\u5927\uFF08>${LIMITS.headerValueMaxBytes} \u5B57\u8282\uFF09` };
          }
          out.headers[name] = val;
        }
      }
      if (src.body !== void 0 && src.body !== null && src.body !== "") {
        if (out.method === "GET" || out.method === "HEAD") {
          return { ok: false, error: `${out.method} \u8BF7\u6C42\u4E0D\u5E94\u643A\u5E26 body\uFF08\u5982\u9700\u63D0\u4EA4\u6570\u636E\u8BF7\u7528 POST/PUT/PATCH\uFF09` };
        }
        const body = typeof src.body === "string" ? src.body : JSON.stringify(src.body);
        if (Buffer.byteLength(body, "utf8") > LIMITS.bodyMaxBytes) {
          return { ok: false, error: `body \u8FC7\u5927\uFF08>${LIMITS.bodyMaxBytes / 1024}KB\uFF09` };
        }
        out.body = body;
      }
      if (src.connections !== void 0) out.connections = clampInt(src.connections, LIMITS.connections, out.connections);
      if (src.durationS !== void 0) out.durationS = clampInt(src.durationS, LIMITS.durationS, out.durationS);
      if (src.pipelining !== void 0) out.pipelining = clampInt(src.pipelining, LIMITS.pipelining, LIMITS.pipelining.default);
      if (src.timeoutS !== void 0) out.timeoutS = clampNum(src.timeoutS, LIMITS.timeoutS, out.timeoutS);
      if (src.rate !== void 0 && src.rate !== null && src.rate !== "") {
        const r = Math.round(Number(src.rate));
        if (!Number.isFinite(r)) return { ok: false, error: "rate\uFF08\u6BCF\u79D2\u8BF7\u6C42\u6570\u4E0A\u9650\uFF09\u5FC5\u987B\u662F\u6570\u5B57" };
        if (r < LIMITS.rate.min || r > LIMITS.rate.max) {
          return { ok: false, error: `rate \u8D85\u51FA\u8303\u56F4\uFF08${LIMITS.rate.min}~${LIMITS.rate.max}\uFF09` };
        }
        out.rate = r;
      }
      out.scope = scopeOf(out.url);
      out.bodyBytes = out.body ? Buffer.byteLength(out.body, "utf8") : 0;
      return { ok: true, value: out };
    }
    function percentileOf(sortedArr, p) {
      const n = sortedArr.length;
      if (!n) return null;
      if (n === 1) return sortedArr[0];
      const idx = Math.min(n - 1, Math.max(0, Math.ceil(p / 100 * n) - 1));
      return sortedArr[idx];
    }
    function windowPercentiles(ring, windowMs, now) {
      const cut = (now || Date.now()) - windowMs;
      const vals = [];
      for (let i = ring.length - 1; i >= 0; i--) {
        if (ring[i].t < cut) break;
        vals.push(ring[i].v);
      }
      if (!vals.length) return null;
      vals.sort((a, b) => a - b);
      let sum = 0;
      for (const v of vals) sum += v;
      return {
        mean: sum / vals.length,
        p50: percentileOf(vals, 50),
        p90: percentileOf(vals, 90),
        p97_5: percentileOf(vals, 97.5),
        p99: percentileOf(vals, 99),
        count: vals.length
      };
    }
    function num(v, fallback) {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback === void 0 ? null : fallback;
    }
    function round1(v) {
      return Math.round(v * 10) / 10;
    }
    function fmtRound1(v) {
      return round1(Number(v));
    }
    function summarize(result, liveSamples, target, aborted) {
      const lat = result.latency || {};
      const req = result.requests || {};
      const thr = result.throughput || {};
      const statusDist = {};
      for (const [code, st] of Object.entries(result.statusCodeStats || {})) {
        statusDist[code] = num(st && st.count, 0);
      }
      const total2xx = num(result["2xx"], 0) + num(result["1xx"], 0);
      const finished = num(result.requests && result.requests.total, 0);
      const non2xx = num(result.non2xx, 0);
      const samples = (Array.isArray(liveSamples) ? liveSamples : []).slice(-LIMITS.reportSamplesKeep);
      const rpsPeak = samples.length ? Math.max(...samples.map((s) => s.rps || 0)) : num(req.mean, 0);
      return {
        durationS: num(result.duration, target.durationS),
        totalRequests: finished,
        sentRequests: num(result.requests && result.requests.sent, 0),
        rpsMean: round1(num(req.mean, 0)),
        rpsPeak: round1(rpsPeak),
        bytesMean: Math.round(num(thr.mean, 0)),
        bytesTotal: num(thr.total, 0),
        errors: num(result.errors, 0),
        timeouts: num(result.timeouts, 0),
        mismatches: num(result.mismatches, 0),
        resets: num(result.resets, 0),
        non2xx,
        non2xxPct: finished ? round1(non2xx / finished * 100) : 0,
        ok2xx: total2xx,
        statusDist,
        latencies: {
          mean: round1(num(lat.mean, 0)),
          stddev: round1(num(lat.stddev, 0)),
          min: round1(num(lat.min, 0)),
          max: round1(num(lat.max, 0)),
          p50: round1(num(lat.p50, 0)),
          p75: round1(num(lat.p75, 0)),
          p90: round1(num(lat.p90, 0)),
          p97_5: round1(num(lat.p97_5, 0)),
          p99: round1(num(lat.p99, 0)),
          p99_9: round1(num(lat.p99_9, 0))
        },
        aborted: !!aborted,
        samples
      };
    }
    function verdictOf(summary, target) {
      const notes = [];
      const l = summary.latencies;
      const errTotal = summary.errors + summary.timeouts;
      if (summary.aborted) notes.push("\u672C\u6B21\u4E3A\u624B\u52A8\u4E2D\u6B62\u7684\u90E8\u5206\u7ED3\u679C\uFF0C\u6307\u6807\u4EC5\u4EE3\u8868\u5DF2\u5B8C\u6210\u533A\u95F4");
      if (summary.timeouts > 0) {
        notes.push(`${summary.timeouts} \u6B21\u8D85\u65F6\u2014\u2014\u76EE\u6807\u5904\u7406\u80FD\u529B\u4E0D\u8DB3\u6216 timeoutS\uFF08\u5F53\u524D ${target.timeoutS}s\uFF09\u504F\u7D27`);
      }
      if (summary.errors > 0) notes.push(`${summary.errors} \u6B21\u8FDE\u63A5/\u8BF7\u6C42\u9519\u8BEF\uFF08\u62D2\u7EDD\u8FDE\u63A5\u3001\u65AD\u8FDE\u6216\u54CD\u5E94\u975E\u6CD5\uFF09`);
      if (summary.non2xx > 0) {
        const top = Object.entries(summary.statusDist).filter(([c]) => !c.startsWith("2")).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c}\xD7${n}`).join(" ");
        notes.push(`${summary.non2xx} \u4E2A\u975E 2xx \u54CD\u5E94\uFF08${top}\uFF09\u2014\u2014\u82E5\u975E\u9884\u671F\uFF0C\u68C0\u67E5\u76EE\u6807\u5728\u538B\u529B\u4E0B\u7684\u884C\u4E3A`);
      }
      if (target.scope === "public") notes.push("\u76EE\u6807\u662F\u516C\u7F51\u5730\u5740\uFF1A\u8BF7\u786E\u8BA4\u4F60\u62E5\u6709\u5BF9\u8BE5\u76EE\u6807\u7684\u538B\u6D4B\u6388\u6743");
      if (target.rate) notes.push(`\u5DF2\u542F\u7528\u901F\u7387\u4E0A\u9650 ${target.rate}/s\uFF1A\u7ED3\u679C\u662F\u9650\u901F\u540E\u7684\u8868\u73B0\uFF0C\u4E0D\u53CD\u6620\u76EE\u6807\u6781\u9650`);
      if (l.p99 >= 1e3 && summary.rpsMean < target.connections * 2) {
        notes.push("\u9AD8\u5EF6\u8FDF\u3001\u4F4E\u541E\u5410\uFF1A\u76EE\u6807\u53EF\u80FD\u963B\u585E\u5728\u6162\u64CD\u4F5C\uFF08\u5916\u90E8 IO/\u9501/\u5355\u7EBF\u7A0B\u74F6\u9888\uFF09\u4E0A");
      }
      if (!notes.length && summary.timeouts === 0 && summary.errors === 0) {
        notes.push(`\u76EE\u6807\u5728 ${target.connections} \u8FDE\u63A5\u538B\u529B\u4E0B\u8FD4\u56DE\u5168\u90E8 ${summary.ok2xx} \u4E2A 2xx\uFF0C\u8868\u73B0\u7A33\u5B9A`);
      }
      const oneLine = `${fmtRate(summary.rpsMean)}\uFF08\u5CF0\u503C ${fmtRate(summary.rpsPeak)}\uFF09\xB7 \u5EF6\u8FDF ${fmtMs(l.p50)} / p97.5 ${fmtMs(l.p97_5)} / p99 ${fmtMs(l.p99)} \xB7 \u975E 2xx ${summary.non2xx}\uFF08${summary.non2xxPct}%\uFF09\xB7 \u9519\u8BEF ${errTotal}`;
      return { oneLine, notes };
    }
    var COMPARE_METRICS = [
      { key: "rpsMean", label: "\u5E73\u5747\u541E\u5410", unit: "/s", dir: "up" },
      { key: "lat.p50", label: "p50 \u5EF6\u8FDF", unit: "ms", dir: "down" },
      { key: "lat.p97_5", label: "p97.5 \u5EF6\u8FDF", unit: "ms", dir: "down" },
      { key: "lat.p99", label: "p99 \u5EF6\u8FDF", unit: "ms", dir: "down" },
      { key: "lat.mean", label: "\u5E73\u5747\u5EF6\u8FDF", unit: "ms", dir: "down" },
      { key: "errors", label: "\u9519\u8BEF+\u8D85\u65F6", unit: "", dir: "down" },
      { key: "non2xx", label: "\u975E 2xx", unit: "", dir: "down" }
    ];
    function getMetric(report, path) {
      if (path.startsWith("lat.")) return num(report.latencies && report.latencies[path.slice(4)], 0);
      return num(report.summary && report.summary[path], 0);
    }
    function compareReports(a, b) {
      const rows = COMPARE_METRICS.map((m) => {
        const va = getMetric(a, m.key);
        const vb = getMetric(b, m.key);
        const deltaPct = va === 0 ? vb === 0 ? 0 : null : round1((vb - va) / Math.abs(va) * 100);
        let better = "tie";
        if (deltaPct === null || va === 0 && vb === 0) better = "na";
        else if (deltaPct === 0) better = "tie";
        else if (m.dir === "up") better = deltaPct > 0 ? "b" : "a";
        else better = deltaPct < 0 ? "b" : "a";
        return { key: m.key, label: m.label, unit: m.unit, dir: m.dir, a: va, b: vb, deltaPct, better };
      });
      const bWins = rows.filter((r) => r.better === "b").length;
      const aWins = rows.filter((r) => r.better === "a").length;
      const ties = rows.filter((r) => r.better === "tie").length;
      return { rows, bWins, aWins, ties };
    }
    module.exports = {
      VERSION,
      LIMITS,
      SENSITIVE_HEADERS,
      FORBIDDEN_HEADERS,
      fmtMs,
      fmtRate,
      fmtBytes,
      fmtRound1,
      maskValue,
      maskHeaders,
      scopeOf,
      sanitizeTarget,
      percentileOf,
      windowPercentiles,
      summarize,
      verdictOf,
      compareReports,
      COMPARE_METRICS
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect3, useRef as useRef2, useState as useState4 } from "react";

// src/model.ts
var core = __toESM(require_bench_core());

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}

// src/model.ts
async function kvReq(payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target: "cap.kv", payload } });
  if (!res || res.ok === false) throw new Error(String(res && res.error) || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res;
}
async function kvGet(key) {
  const res = await kvReq({ action: "get", key });
  return res.result && res.result.value !== void 0 ? res.result.value : null;
}
var KEY_META = "api-bench.meta";
var KEY_HISTORY = "api-bench.history";
var KEY_REPORT = (id) => `api-bench.report.${id}`;
var KEY_SETTINGS = "api-bench.settings";
async function getMeta() {
  try {
    const raw = await kvGet(KEY_META);
    if (!raw || typeof raw !== "object") return null;
    const m = raw;
    if (typeof m.token !== "string" || !m.token || typeof m.port !== "number" || !m.port) return null;
    return m;
  } catch (_) {
    return null;
  }
}
async function loadHistory() {
  try {
    const v = await kvGet(KEY_HISTORY);
    const items = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray(v.items) ? v.items : [];
    return items;
  } catch (_) {
    return [];
  }
}
async function loadReport(runId) {
  try {
    const v = await kvGet(KEY_REPORT(runId));
    return v && typeof v === "object" ? v : null;
  } catch (_) {
    return null;
  }
}
async function loadSettingsKv() {
  try {
    const v = await kvGet(KEY_SETTINGS);
    return v && typeof v === "object" ? v : null;
  } catch (_) {
    return null;
  }
}
function svcBase(meta) {
  return `http://127.0.0.1:${meta.port}`;
}
async function svcFetch(meta, path, init) {
  const res = await fetch(svcBase(meta) + path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-ApiBench-Token": meta.token, ...init?.headers || {} }
  });
  const data = await res.json();
  return data;
}
async function opStart(meta, form) {
  return svcFetch(meta, "/api/op", {
    method: "POST",
    body: JSON.stringify({
      action: "start",
      payload: {
        url: form.url,
        method: form.method,
        headers: parseHeadersText(form.headersText),
        body: form.body,
        connections: form.connections,
        durationS: form.durationS,
        timeoutS: form.timeoutS,
        rate: form.rate === "" ? null : Number(form.rate),
        pipelining: form.pipelining
      }
    })
  });
}
async function opAction(meta, action, payload = {}) {
  return svcFetch(meta, "/api/op", { method: "POST", body: JSON.stringify({ action, payload }) });
}
async function getLive(meta) {
  return svcFetch(meta, "/api/live");
}
function parseHeadersText(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(":");
    if (idx <= 0) continue;
    const name = t.slice(0, idx).trim();
    const value = t.slice(idx + 1).trim();
    if (name && value) out[name] = value;
  }
  return out;
}
function headersToText(headers) {
  if (!headers) return "";
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n");
}
function formFromSaved(t) {
  return {
    url: t.url,
    method: t.method || "GET",
    headersText: headersToText(t.headers),
    body: "",
    connections: t.connections || 10,
    durationS: t.durationS || 10,
    timeoutS: t.timeoutS || 10,
    rate: t.rate ? String(t.rate) : "",
    pipelining: 1
  };
}

// src/WorkTab.tsx
import { useCallback, useEffect, useRef, useState } from "react";

// src/charts.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}
function fmtAxisRps(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v));
}
function fmtAxisMs(v) {
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}s`;
  return String(Math.round(v));
}
function RpsChart({ samples, height = 120 }) {
  const W = 600;
  const H = height;
  const P = { l: 38, r: 6, t: 8, b: 16 };
  if (!samples.length) {
    return /* @__PURE__ */ jsx("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", display: "block" }, children: /* @__PURE__ */ jsx("text", { x: W / 2, y: H / 2, fill: "#5C6678", fontSize: "11", textAnchor: "middle", children: "\u6682\u65E0\u91C7\u6837" }) });
  }
  const xs = samples.map((s) => s.t);
  const maxY = niceMax(Math.max(...samples.map((s) => s.rps), 1));
  const maxX = Math.max(...xs, 1);
  const px = (t) => P.l + t / maxX * (W - P.l - P.r);
  const py = (v) => H - P.b - v / maxY * (H - P.t - P.b);
  const pts = samples.map((s) => `${px(s.t).toFixed(1)},${py(s.rps).toFixed(1)}`).join(" ");
  const gridY = [0, maxY / 2, maxY];
  return /* @__PURE__ */ jsxs("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", display: "block" }, children: [
    gridY.map((v, i) => /* @__PURE__ */ jsxs("g", { children: [
      /* @__PURE__ */ jsx("line", { x1: P.l, x2: W - P.r, y1: py(v), y2: py(v), stroke: "#1d2330", strokeWidth: "1" }),
      /* @__PURE__ */ jsx("text", { x: P.l - 4, y: py(v) + 3, fill: "#5C6678", fontSize: "9", textAnchor: "end", children: fmtAxisRps(v) })
    ] }, i)),
    /* @__PURE__ */ jsx("polygon", { points: `${P.l},${py(0)} ${pts} ${px(samples[samples.length - 1].t).toFixed(1)},${py(0)}`, fill: "rgba(59,130,246,0.18)" }),
    /* @__PURE__ */ jsx("polyline", { points: pts, fill: "none", stroke: "#3B82F6", strokeWidth: "1.6" }),
    /* @__PURE__ */ jsxs("text", { x: W - P.r, y: H - 4, fill: "#5C6678", fontSize: "9", textAnchor: "end", children: [
      maxX.toFixed(0),
      "s"
    ] })
  ] });
}
function LatencyChart({ samples, height = 120 }) {
  const W = 600;
  const H = height;
  const P = { l: 38, r: 6, t: 8, b: 16 };
  const withLat = samples.filter((s) => s.latMean != null || s.latP97_5 != null);
  if (!withLat.length) {
    return /* @__PURE__ */ jsx("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", display: "block" }, children: /* @__PURE__ */ jsx("text", { x: W / 2, y: H / 2, fill: "#5C6678", fontSize: "11", textAnchor: "middle", children: "\u5EF6\u8FDF\u91C7\u6837\u4E2D\u2026" }) });
  }
  const maxY = niceMax(Math.max(...withLat.map((s) => Math.max(s.latMean || 0, s.latP97_5 || 0)), 1));
  const maxX = Math.max(...withLat.map((s) => s.t), 1);
  const px = (t) => P.l + t / maxX * (W - P.l - P.r);
  const py = (v) => H - P.b - v / maxY * (H - P.t - P.b);
  const line = (key, color, dash) => {
    const pts = withLat.filter((s) => s[key] != null).map((s) => `${px(s.t).toFixed(1)},${py(s[key]).toFixed(1)}`).join(" ");
    if (!pts) return null;
    return /* @__PURE__ */ jsx("polyline", { points: pts, fill: "none", stroke: color, strokeWidth: "1.6", strokeDasharray: dash });
  };
  return /* @__PURE__ */ jsxs("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", display: "block" }, children: [
    [0, maxY / 2, maxY].map((v, i) => /* @__PURE__ */ jsxs("g", { children: [
      /* @__PURE__ */ jsx("line", { x1: P.l, x2: W - P.r, y1: py(v), y2: py(v), stroke: "#1d2330", strokeWidth: "1" }),
      /* @__PURE__ */ jsx("text", { x: P.l - 4, y: py(v) + 3, fill: "#5C6678", fontSize: "9", textAnchor: "end", children: fmtAxisMs(v) })
    ] }, i)),
    line("latP97_5", "#E3B341"),
    line("latMean", "#3FB950"),
    /* @__PURE__ */ jsxs("text", { x: W - P.r, y: H - 4, fill: "#5C6678", fontSize: "9", textAnchor: "end", children: [
      maxX.toFixed(0),
      "s"
    ] }),
    /* @__PURE__ */ jsxs("g", { children: [
      /* @__PURE__ */ jsx("line", { x1: P.l, y1: P.t - 2, x2: P.l + 12, y2: P.t - 2, stroke: "#3FB950", strokeWidth: "2" }),
      /* @__PURE__ */ jsx("text", { x: P.l + 16, y: P.t + 1, fill: "#8B95A7", fontSize: "9", children: "mean" }),
      /* @__PURE__ */ jsx("line", { x1: P.l + 52, y1: P.t - 2, x2: P.l + 64, y2: P.t - 2, stroke: "#E3B341", strokeWidth: "2" }),
      /* @__PURE__ */ jsx("text", { x: P.l + 68, y: P.t + 1, fill: "#8B95A7", fontSize: "9", children: "p97.5\uFF08\u6EDA\u52A8\u7A97\u53E3\uFF09" })
    ] })
  ] });
}

// src/WorkTab.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var DEMOS = (port) => [
  { label: "\u8BD5\u91D1\u77F3\xB7\u6781\u901F", url: `http://127.0.0.1:${port}/demo/ok`, connections: 10, durationS: 5, note: "0ms \u57FA\u7EBF\uFF0C\u9A8C\u8BC1\u5DE5\u5177\u94FE" },
  { label: "\u8BD5\u91D1\u77F3\xB7\u6162\u7AEF\u70B9", url: `http://127.0.0.1:${port}/demo/slow?ms=200`, connections: 10, durationS: 10, note: "200ms \u56FA\u5B9A\u5EF6\u8FDF" },
  { label: "\u8BD5\u91D1\u77F3\xB7\u6296\u52A8", url: `http://127.0.0.1:${port}/demo/flaky?p=0.2`, connections: 20, durationS: 10, note: "20% \u6982\u7387 500" }
];
var METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
function emptyForm(settings) {
  return {
    url: "",
    method: "GET",
    headersText: "",
    body: "",
    connections: settings?.connections || 10,
    durationS: settings?.durationS || 10,
    timeoutS: settings?.timeoutS || 10,
    rate: "",
    pipelining: 1
  };
}
function WorkTab({ meta, settings, lastReport, onRefresh }) {
  const [form, setForm] = useState(() => emptyForm(settings));
  const [running, setRunning] = useState(null);
  const [samples, setSamples] = useState([]);
  const [report, setReport] = useState(lastReport);
  const [err, setErr] = useState("");
  const [starting, setStarting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState([]);
  const pollRef = useRef(null);
  const finishSeenRef = useRef("");
  useEffect(() => {
    setForm((f) => f.url ? f : { ...f, connections: settings?.connections || 10, durationS: settings?.durationS || 10, timeoutS: settings?.timeoutS || 10 });
  }, [settings]);
  const loadSaved = useCallback(async () => {
    if (!meta) return;
    try {
      const r = await opAction(meta, "targets_list");
      setSaved(r.ok && Array.isArray(r.items) ? r.items : []);
    } catch (_) {
    }
  }, [meta]);
  useEffect(() => {
    loadSaved();
  }, [loadSaved]);
  useEffect(() => {
    if (!meta) return;
    const tick = async () => {
      try {
        const r = await getLive(meta);
        if (!r.ok) return;
        setRunning(r.live);
        setSamples(Array.isArray(r.samples) ? r.samples : []);
        if (!r.running && r.live === null && r.lastReportId && finishSeenRef.current !== r.lastReportId) {
          finishSeenRef.current = r.lastReportId;
          const rep = await loadReport(r.lastReportId);
          if (rep) setReport(rep);
          onRefresh();
        }
      } catch (_) {
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 800);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [meta, onRefresh]);
  const doStart = useCallback(async () => {
    if (!meta) return;
    setErr("");
    setStarting(true);
    finishSeenRef.current = "";
    try {
      const r = await opStart(meta, form);
      if (!r.ok) {
        setErr(r.error || "\u542F\u52A8\u5931\u8D25");
        return;
      }
      setReport(null);
      setSamples([]);
    } catch (e) {
      setErr(`\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${String(e.message || e)}\uFF08\u9762\u677F\u4ECE cap.kv api-bench.meta \u5F15\u5BFC\u7AEF\u53E3/token\uFF09`);
    } finally {
      setStarting(false);
    }
  }, [meta, form]);
  const doStop = useCallback(async () => {
    if (!meta) return;
    try {
      await opAction(meta, "stop");
    } catch (_) {
    }
  }, [meta]);
  const applyDemo = (d) => {
    setForm((f) => ({ ...f, url: d.url, method: "GET", connections: d.connections, durationS: d.durationS, body: "", headersText: "", rate: "" }));
  };
  const applySaved = (t) => {
    setForm(formFromSaved(t));
  };
  const doSaveTarget = useCallback(async () => {
    if (!meta || !form.url) return;
    try {
      const r = await opAction(meta, "targets_save", {
        target: {
          url: form.url,
          method: form.method,
          name: form.url.replace(/^https?:\/\//, "").slice(0, 60),
          headers: parseHeadersLoose(form.headersText),
          body: form.body,
          connections: form.connections,
          durationS: form.durationS,
          timeoutS: form.timeoutS,
          rate: form.rate === "" ? null : Number(form.rate)
        }
      });
      if (!r.ok) setErr(r.error || "\u4FDD\u5B58\u5931\u8D25");
      loadSaved();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, [meta, form, loadSaved]);
  const isRunning = !!running;
  const progress = running ? Math.min(100, running.elapsedS / Math.max(running.durationS, 0.1) * 100) : 0;
  const activeReport = report;
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    meta?.running && meta.running.source === "mcp" && /* @__PURE__ */ jsxs2("div", { className: "ab-warncard", children: [
      "AI \u6B63\u5728\u538B\u6D4B\uFF08",
      meta.running.method,
      " ",
      meta.running.url,
      "\uFF09\u2014\u2014\u8868\u5355\u53D1\u8D77\u5C06\u6392\u961F\u62D2\u7EDD\uFF0C\u53EF\u5230\u300C\u5386\u53F2\u300D\u9875\u770B\u7ED3\u679C\u3002"
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ab-sec", children: [
      "\u8BD5\u91D1\u77F3",
      /* @__PURE__ */ jsx2("span", { className: "ab-hint", children: "\u5185\u7F6E\u6F14\u793A\u7AEF\u70B9\uFF0C\u96F6\u914D\u7F6E\u9A8C\u8BC1\u5DE5\u5177\u94FE\uFF08\u538B\u7684\u662F\u672C\u63D2\u4EF6\u670D\u52A1\u8FDB\u7A0B\uFF09" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsx2("div", { className: "ab-card-b ab-chiprow", children: meta ? DEMOS(meta.port).map((d) => /* @__PURE__ */ jsx2("button", { className: "ab-btn ghost sm", title: d.note, onClick: () => applyDemo(d), children: d.label }, d.url)) : /* @__PURE__ */ jsx2("span", { className: "ab-sub", children: "\u670D\u52A1\u672A\u8FDE\u63A5\uFF0C\u8BD5\u91D1\u77F3\u4E0D\u53EF\u7528" }) }) }),
    /* @__PURE__ */ jsx2("div", { className: "ab-sec", children: "\u76EE\u6807\u914D\u7F6E" }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsxs2("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ab-fmrow", children: [
        /* @__PURE__ */ jsx2("select", { className: "ab-sel", style: { width: 96 }, value: form.method, onChange: (e) => setForm({ ...form, method: e.target.value }), disabled: isRunning, children: METHODS.map((m) => /* @__PURE__ */ jsx2("option", { value: m, children: m }, m)) }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "ab-inp",
            placeholder: "http://127.0.0.1:8080/api/users",
            value: form.url,
            onChange: (e) => setForm({ ...form, url: e.target.value }),
            disabled: isRunning,
            spellCheck: false
          }
        )
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ab-fmgrid", children: [
        /* @__PURE__ */ jsx2("label", { children: "\u5E76\u53D1\u8FDE\u63A5" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "ab-inp",
            type: "number",
            min: 1,
            max: 1e3,
            value: form.connections,
            onChange: (e) => setForm({ ...form, connections: Number(e.target.value) || 1 }),
            disabled: isRunning
          }
        ),
        /* @__PURE__ */ jsx2("label", { children: "\u6301\u7EED\u79D2\u6570" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "ab-inp",
            type: "number",
            min: 1,
            max: 300,
            value: form.durationS,
            onChange: (e) => setForm({ ...form, durationS: Number(e.target.value) || 1 }),
            disabled: isRunning
          }
        ),
        /* @__PURE__ */ jsx2("label", { children: "\u8BF7\u6C42\u8D85\u65F6" }),
        /* @__PURE__ */ jsxs2("div", { className: "ab-unitwrap", children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "ab-inp",
              type: "number",
              min: 0.5,
              max: 60,
              step: 0.5,
              value: form.timeoutS,
              onChange: (e) => setForm({ ...form, timeoutS: Number(e.target.value) || 10 }),
              disabled: isRunning
            }
          ),
          /* @__PURE__ */ jsx2("span", { children: "\u79D2" })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { children: /* @__PURE__ */ jsx2("button", { className: "ab-link", onClick: () => setShowAdvanced(!showAdvanced), children: showAdvanced ? "\u6536\u8D77\u9AD8\u7EA7\u9009\u9879" : "\u9AD8\u7EA7\u9009\u9879\uFF08headers / body / \u9650\u901F / \u7BA1\u9053\uFF09" }) }),
      showAdvanced && /* @__PURE__ */ jsxs2("div", { className: "ab-adv", children: [
        /* @__PURE__ */ jsx2("label", { className: "ab-sub", children: "\u8BF7\u6C42\u5934\uFF08\u6BCF\u884C\u4E00\u6761 Name: value\uFF09" }),
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            className: "ab-inp",
            rows: 3,
            value: form.headersText,
            placeholder: "Authorization: Bearer xxx\nContent-Type: application/json",
            onChange: (e) => setForm({ ...form, headersText: e.target.value }),
            disabled: isRunning,
            spellCheck: false
          }
        ),
        form.method !== "GET" && form.method !== "HEAD" && /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx2("label", { className: "ab-sub", children: "\u8BF7\u6C42\u4F53\uFF08JSON/\u6587\u672C\uFF0C\u22641MB\uFF09" }),
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              className: "ab-inp",
              rows: 3,
              value: form.body,
              placeholder: '{"page": 1}',
              onChange: (e) => setForm({ ...form, body: e.target.value }),
              disabled: isRunning,
              spellCheck: false
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ab-fmgrid", children: [
          /* @__PURE__ */ jsx2("label", { children: "\u901F\u7387\u4E0A\u9650" }),
          /* @__PURE__ */ jsxs2("div", { className: "ab-unitwrap", children: [
            /* @__PURE__ */ jsx2(
              "input",
              {
                className: "ab-inp",
                type: "number",
                min: 1,
                placeholder: "\u4E0D\u9650",
                value: form.rate,
                onChange: (e) => setForm({ ...form, rate: e.target.value }),
                disabled: isRunning
              }
            ),
            /* @__PURE__ */ jsx2("span", { children: "req/s" })
          ] }),
          /* @__PURE__ */ jsx2("label", { children: "\u7BA1\u9053\u590D\u7528" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "ab-inp",
              type: "number",
              min: 1,
              max: 10,
              value: form.pipelining,
              onChange: (e) => setForm({ ...form, pipelining: Number(e.target.value) || 1 }),
              disabled: isRunning
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ab-btnrow", children: [
        !isRunning ? /* @__PURE__ */ jsx2("button", { className: "ab-btn", onClick: doStart, disabled: !form.url.trim() || starting, children: "\u25B6 \u53D1\u8D77\u538B\u6D4B" }) : /* @__PURE__ */ jsx2("button", { className: "ab-btn danger", onClick: doStop, children: "\u25A0 \u4E2D\u6B62" }),
        /* @__PURE__ */ jsx2("button", { className: "ab-btn ghost sm", onClick: doSaveTarget, disabled: !form.url.trim() || isRunning, children: "\u6536\u85CF\u76EE\u6807" }),
        /* @__PURE__ */ jsx2("span", { className: "ab-sub", style: { marginLeft: "auto" }, children: form.url ? (() => {
          const scope = scopeHint(form.url);
          return scope === "public" ? /* @__PURE__ */ jsx2("span", { className: "ab-warn", children: "\u26A0 \u516C\u7F51\u76EE\u6807\uFF1A\u8BF7\u786E\u8BA4\u62E5\u6709\u538B\u6D4B\u6388\u6743" }) : /* @__PURE__ */ jsxs2("span", { className: "ab-ok", children: [
            "\u2713 ",
            scopeLabel(scope)
          ] });
        })() : null })
      ] }),
      err && /* @__PURE__ */ jsx2("div", { className: "ab-err", children: err }),
      saved.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "ab-chiprow", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("span", { className: "ab-sub", children: "\u6536\u85CF\uFF1A" }),
        saved.map((t) => /* @__PURE__ */ jsx2("button", { className: "ab-btn ghost sm", onClick: () => applySaved(t), title: `${t.method} ${t.url}`, children: t.name || t.url.slice(0, 28) }, t.id))
      ] })
    ] }) }),
    isRunning && running && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "ab-sec", children: [
        "\u5B9E\u65F6\u8FDB\u5EA6",
        /* @__PURE__ */ jsxs2("span", { className: "ab-hint", children: [
          running.method,
          " ",
          running.url
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsxs2("div", { className: "ab-card-b", children: [
        /* @__PURE__ */ jsx2("div", { className: "ab-prog", children: /* @__PURE__ */ jsx2("i", { style: { width: `${progress}%` } }) }),
        /* @__PURE__ */ jsxs2("div", { className: "ab-sum", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("b", { className: "ab-num", children: running.rps }),
            /* @__PURE__ */ jsx2("small", { children: "req/s \u5B9E\u65F6" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsxs2("b", { className: "ab-num", children: [
              running.latP97_5 != null ? `${Math.round(running.latP97_5)}` : "\u2014",
              /* @__PURE__ */ jsx2("small", { style: { fontSize: 11 }, children: "ms" })
            ] }),
            /* @__PURE__ */ jsx2("small", { children: "p97.5\uFF085s \u7A97\u53E3\uFF09" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("b", { className: "ab-num", children: running.sent }),
            /* @__PURE__ */ jsx2("small", { children: "\u5DF2\u53D1\u9001" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("b", { className: "ab-num", children: running.errs + running.non2xx }),
            /* @__PURE__ */ jsx2("small", { children: "\u9519\u8BEF+\u975E2xx" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsxs2("b", { className: "ab-num", children: [
              Math.min(100, Math.round(progress)),
              "%"
            ] }),
            /* @__PURE__ */ jsxs2("small", { children: [
              running.elapsedS,
              "s / ",
              running.durationS,
              "s"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx2(RpsChart, { samples }),
        /* @__PURE__ */ jsx2("div", { style: { height: 8 } }),
        /* @__PURE__ */ jsx2(LatencyChart, { samples }),
        running.source === "mcp" && /* @__PURE__ */ jsx2("div", { className: "ab-warn", style: { marginTop: 6 }, children: "\u6B64\u538B\u6D4B\u7531 AI \u53D1\u8D77\uFF08MCP\uFF09" })
      ] }) })
    ] }),
    activeReport && !isRunning && /* @__PURE__ */ jsx2(ReportView, { report: activeReport }),
    !isRunning && !activeReport && /* @__PURE__ */ jsxs2("div", { className: "ab-empty", children: [
      "\u8FD8\u6CA1\u6709\u62A5\u544A\u3002\u586B\u5165\u76EE\u6807 URL \u2192\u300C\u53D1\u8D77\u538B\u6D4B\u300D\uFF1B\u6216\u5148\u70B9\u4E0A\u9762\u7684\u8BD5\u91D1\u77F3\u9884\u8BBE\u611F\u53D7\u4E00\u6B21\u5B8C\u6574\u6D41\u7A0B\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u538B\u6D4B\u4F1A\u771F\u5B9E\u6253\u6EE1\u914D\u7F6E\u7684\u5E76\u53D1\u2014\u2014\u5148\u4ECE 10 \u8FDE\u63A5 \xD7 10 \u79D2\u5F00\u59CB\u3002"
    ] })
  ] });
}
function parseHeadersLoose(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    const idx = t.indexOf(":");
    if (idx <= 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}
function scopeHint(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "::1" || /^127\./.test(h)) return "loopback";
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /\.local$/i.test(h)) return "private";
    const m172 = /^172\.(\d+)\./.exec(h);
    if (m172) {
      const n = Number(m172[1]);
      if (n >= 16 && n <= 31) return "private";
    }
    return "public";
  } catch (_) {
    return "invalid";
  }
}
function scopeLabel(scope) {
  return scope === "loopback" ? "\u672C\u673A\u76EE\u6807" : scope === "private" ? "\u5185\u7F51\u76EE\u6807" : scope === "public" ? "\u516C\u7F51\u76EE\u6807" : "URL \u672A\u5C31\u7EEA";
}
function pctClass(v) {
  if (v < 100) return "ab-ok";
  if (v < 500) return "ab-warn";
  return "ab-bad";
}
function ReportView({ report }) {
  const s = report.summary;
  const l = s.latencies;
  const dist = Object.entries(s.statusDist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "ab-sec", children: [
      "\u538B\u6D4B\u62A5\u544A",
      /* @__PURE__ */ jsxs2("span", { className: "ab-hint", children: [
        report.at.replace("T", " ").slice(0, 16),
        " \xB7 runId ",
        report.runId
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsxs2("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ab-row-h", children: [
        /* @__PURE__ */ jsx2("span", { className: "ab-mono", style: { fontWeight: 700 }, children: report.target.method }),
        /* @__PURE__ */ jsx2("span", { className: "ab-mono ab-sub", style: { wordBreak: "break-all" }, children: report.target.url }),
        /* @__PURE__ */ jsxs2("span", { className: "ab-tag", children: [
          report.target.connections,
          " \u8FDE\u63A5 \xD7 ",
          s.durationS,
          "s"
        ] }),
        report.target.rate ? /* @__PURE__ */ jsxs2("span", { className: "ab-tag", children: [
          "\u9650\u901F ",
          report.target.rate,
          "/s"
        ] }) : null,
        report.target.scope === "public" ? /* @__PURE__ */ jsx2("span", { className: "ab-badge warn", children: "\u516C\u7F51\u76EE\u6807" }) : null,
        s.aborted ? /* @__PURE__ */ jsx2("span", { className: "ab-badge bad", children: "\u5DF2\u4E2D\u6B62\uFF08\u90E8\u5206\u7ED3\u679C\uFF09" }) : null
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ab-sum", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: "ab-num", children: s.rpsMean }),
          /* @__PURE__ */ jsxs2("small", { children: [
            "\u5E73\u5747 req/s\uFF08\u5CF0\u503C ",
            s.rpsPeak,
            "\uFF09"
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: `ab-num ${pctClass(l.p97_5)}`, children: l.p97_5 }),
          /* @__PURE__ */ jsx2("small", { children: "p97.5 \u5EF6\u8FDF ms" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: `ab-num ${pctClass(l.p50)}`, children: l.p50 }),
          /* @__PURE__ */ jsx2("small", { children: "p50 \u5EF6\u8FDF ms" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: `ab-num ${s.errors + s.timeouts === 0 ? "ab-ok" : "ab-bad"}`, children: s.errors + s.timeouts }),
          /* @__PURE__ */ jsx2("small", { children: "\u9519\u8BEF+\u8D85\u65F6" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("b", { className: "ab-num", children: [
            s.non2xxPct,
            "%"
          ] }),
          /* @__PURE__ */ jsxs2("small", { children: [
            "\u975E 2xx\uFF08",
            s.non2xx,
            "\uFF09"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx2(RpsChart, { samples: s.samples }),
      /* @__PURE__ */ jsx2("div", { style: { height: 8 } }),
      /* @__PURE__ */ jsx2(LatencyChart, { samples: s.samples })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "ab-sec", children: [
      "\u5EF6\u8FDF\u5206\u4F4D",
      /* @__PURE__ */ jsx2("span", { className: "ab-hint", children: "autocannon \u76F4\u65B9\u56FE\uFF08HDR\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ab-card", children: [
      /* @__PURE__ */ jsxs2("table", { className: "ab-tb", children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx2("th", { children: "\u5747\u503C" }),
          /* @__PURE__ */ jsx2("th", { children: "\u03C3" }),
          /* @__PURE__ */ jsx2("th", { children: "min" }),
          /* @__PURE__ */ jsx2("th", { children: "p50" }),
          /* @__PURE__ */ jsx2("th", { children: "p75" }),
          /* @__PURE__ */ jsx2("th", { children: "p90" }),
          /* @__PURE__ */ jsx2("th", { children: "p97.5" }),
          /* @__PURE__ */ jsx2("th", { children: "p99" }),
          /* @__PURE__ */ jsx2("th", { children: "p99.9" }),
          /* @__PURE__ */ jsx2("th", { children: "max" })
        ] }) }),
        /* @__PURE__ */ jsx2("tbody", { children: /* @__PURE__ */ jsxs2("tr", { className: "ab-num", children: [
          /* @__PURE__ */ jsx2("td", { children: l.mean }),
          /* @__PURE__ */ jsx2("td", { children: l.stddev }),
          /* @__PURE__ */ jsx2("td", { children: l.min }),
          /* @__PURE__ */ jsx2("td", { children: l.p50 }),
          /* @__PURE__ */ jsx2("td", { children: l.p75 }),
          /* @__PURE__ */ jsx2("td", { children: l.p90 }),
          /* @__PURE__ */ jsx2("td", { children: l.p97_5 }),
          /* @__PURE__ */ jsx2("td", { children: l.p99 }),
          /* @__PURE__ */ jsx2("td", { children: l.p99_9 }),
          /* @__PURE__ */ jsx2("td", { children: l.max })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ab-card-b ab-sub", children: [
        "\u5355\u4F4D ms \xB7 \u5171 ",
        s.totalRequests,
        " \u8BF7\u6C42 / ",
        s.sentRequests,
        " \u53D1\u9001 \xB7 \u541E\u5410\u5747\u503C ",
        Math.round(s.bytesMean / 1024),
        "KB/s \xB7 \u603B ",
        Math.round(s.bytesTotal / 1024),
        "KB"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ab-sec", children: "\u72B6\u6001\u7801\u5206\u5E03" }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsx2("div", { className: "ab-card-b ab-chiprow", children: dist.length ? dist.map(([code, n]) => /* @__PURE__ */ jsxs2("span", { className: `ab-badge ${code.startsWith("2") || code.startsWith("3") ? "good" : "bad"}`, children: [
      code,
      " \xD7 ",
      n
    ] }, code)) : /* @__PURE__ */ jsx2("span", { className: "ab-sub", children: "\uFF08\u65E0\u54CD\u5E94\u8BB0\u5F55\uFF09" }) }) }),
    /* @__PURE__ */ jsx2("div", { className: "ab-sec", children: "\u7ED3\u8BBA" }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsxs2("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsx2("div", { children: report.verdict.oneLine }),
      report.verdict.notes.map((n, i) => /* @__PURE__ */ jsxs2("div", { className: "ab-sub", style: { marginTop: 4 }, children: [
        "\xB7 ",
        n
      ] }, i))
    ] }) })
  ] });
}

// src/HistoryTab.tsx
import { useCallback as useCallback2, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function HistoryTab({ history }) {
  const [detailId, setDetailId] = useState2("");
  const [detail, setDetail] = useState2(null);
  const [pickA, setPickA] = useState2("");
  const [pickB, setPickB] = useState2("");
  const [cmpErr, setCmpErr] = useState2("");
  const openDetail = useCallback2(async (runId) => {
    setDetailId(runId);
    setDetail(null);
    const rep = await loadReport(runId);
    setDetail(rep);
  }, []);
  const [cmp, setCmp] = useState2(null);
  const loadCompare = useCallback2(async () => {
    if (!pickA || !pickB || pickA === pickB) {
      setCmp(null);
      return;
    }
    const [ra, rb] = await Promise.all([loadReport(pickA), loadReport(pickB)]);
    if (!ra || !rb) {
      setCmpErr("\u62A5\u544A\u5DF2\u88AB\u6E05\u7406\uFF08\u4EC5\u4FDD\u7559\u6700\u8FD1 20 \u4EFD\u5B8C\u6574\u62A5\u544A\uFF09");
      setCmp(null);
      return;
    }
    setCmpErr("");
    setCmp({ a: ra, b: rb });
  }, [pickA, pickB]);
  if (!history.length) {
    return /* @__PURE__ */ jsx3("div", { className: "ab-empty", children: "\u8FD8\u6CA1\u6709\u538B\u6D4B\u5386\u53F2\u3002\u5230\u300C\u538B\u6D4B\u300D\u9875\u53D1\u8D77\u7B2C\u4E00\u6B21\u538B\u6D4B\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u6BCF\u6B21\u7684\u541E\u5410/\u5EF6\u8FDF/\u9519\u8BEF\u6458\u8981\u3002" });
  }
  const cmpResult = cmp ? core.compareReports(cmp.a, cmp.b) : null;
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "ab-sec", children: [
      "A/B \u5BF9\u6BD4",
      /* @__PURE__ */ jsx3("span", { className: "ab-hint", children: "\u9009\u4E24\u6B21\u538B\u6D4B\uFF1AA=\u57FA\u51C6\uFF0CB=\u6539\u52A8\u540E\uFF08\u541E\u5410\u5347\u4E3A\u4F18\uFF0C\u5EF6\u8FDF/\u9519\u8BEF\u964D\u4E3A\u4F18\uFF09" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ab-card", children: /* @__PURE__ */ jsxs3("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "ab-fmrow", children: [
        /* @__PURE__ */ jsxs3("select", { className: "ab-sel", value: pickA, onChange: (e) => {
          setPickA(e.target.value);
          setCmp(null);
        }, children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009 A\uFF08\u57FA\u51C6\uFF09\u2026" }),
          history.map((h) => /* @__PURE__ */ jsxs3("option", { value: h.runId, children: [
            h.at.replace("T", " ").slice(5, 16),
            " ",
            h.method,
            " ",
            shortUrl(h.url),
            "\uFF08",
            h.rpsMean,
            "/s\uFF09"
          ] }, h.runId))
        ] }),
        /* @__PURE__ */ jsxs3("select", { className: "ab-sel", value: pickB, onChange: (e) => {
          setPickB(e.target.value);
          setCmp(null);
        }, children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009 B\uFF08\u5BF9\u6BD4\uFF09\u2026" }),
          history.map((h) => /* @__PURE__ */ jsxs3("option", { value: h.runId, children: [
            h.at.replace("T", " ").slice(5, 16),
            " ",
            h.method,
            " ",
            shortUrl(h.url),
            "\uFF08",
            h.rpsMean,
            "/s\uFF09"
          ] }, h.runId))
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "ab-btn sm", onClick: loadCompare, disabled: !pickA || !pickB || pickA === pickB, children: "\u5BF9\u6BD4" })
      ] }),
      cmpErr && /* @__PURE__ */ jsx3("div", { className: "ab-err", children: cmpErr }),
      cmpResult && cmp && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3("table", { className: "ab-tb", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("th", { children: "\u6307\u6807" }),
            /* @__PURE__ */ jsx3("th", { children: "A" }),
            /* @__PURE__ */ jsx3("th", { children: "B" }),
            /* @__PURE__ */ jsx3("th", { children: "\u0394" }),
            /* @__PURE__ */ jsx3("th", { children: "\u66F4\u4F18" })
          ] }) }),
          /* @__PURE__ */ jsx3("tbody", { children: cmpResult.rows.map((r) => /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { children: r.label }),
            /* @__PURE__ */ jsxs3("td", { className: "ab-num", children: [
              r.a,
              r.unit
            ] }),
            /* @__PURE__ */ jsxs3("td", { className: "ab-num", children: [
              r.b,
              r.unit
            ] }),
            /* @__PURE__ */ jsx3("td", { className: `ab-num ${r.deltaPct == null ? "" : r.better === "b" ? "ab-ok" : r.better === "a" ? "ab-bad" : ""}`, children: r.deltaPct == null ? "n/a" : `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%` }),
            /* @__PURE__ */ jsx3("td", { children: r.better === "b" ? "\u2713 B" : r.better === "a" ? "\u2713 A" : "\u2014" })
          ] }, r.key)) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "ab-card-b ab-sub", children: [
          cmpResult.bWins > cmpResult.aWins ? `B \u603B\u4F53\u66F4\u4F18\uFF08${cmpResult.bWins} \u80DC ${cmpResult.aWins}\uFF0C\u5E73 ${cmpResult.ties}\uFF09` : cmpResult.aWins > cmpResult.bWins ? `A \u603B\u4F53\u66F4\u4F18\uFF08${cmpResult.aWins} \u80DC ${cmpResult.bWins}\uFF0C\u5E73 ${cmpResult.ties}\uFF09` : `\u4E24\u8005\u6253\u5E73\uFF08${cmpResult.ties} \u9879\u6301\u5E73\uFF09`,
          "\u3000",
          "A\uFF1A",
          cmp.a.target.method,
          " ",
          shortUrl(cmp.a.target.url),
          " \xB7 B\uFF1A",
          cmp.b.target.method,
          " ",
          shortUrl(cmp.b.target.url)
        ] })
      ] }),
      pickA && pickB && pickA === pickB && /* @__PURE__ */ jsx3("div", { className: "ab-warn", style: { marginTop: 6 }, children: "A \u4E0E B \u662F\u540C\u4E00\u6B21\u538B\u6D4B\u2014\u2014\u9009\u4E24\u6B21\u4E0D\u540C\u7684 run\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ab-sec", children: [
      "\u5386\u53F2\u8BB0\u5F55",
      /* @__PURE__ */ jsxs3("span", { className: "ab-hint", children: [
        history.length,
        " \u6761\uFF08\u65B0\u2192\u65E7\uFF0C\u5B8C\u6574\u62A5\u544A\u4FDD\u7559\u6700\u8FD1 20 \u4EFD\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ab-card", children: history.map((h) => /* @__PURE__ */ jsxs3("div", { className: "ab-row", onClick: () => openDetail(h.runId), style: { cursor: "pointer" }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "ab-row-h", children: [
        /* @__PURE__ */ jsx3("span", { className: `ab-badge ${h.aborted ? "warn" : "good"}`, children: h.aborted ? "\u4E2D\u6B62" : "\u5B8C\u6210" }),
        /* @__PURE__ */ jsx3("span", { className: "ab-sub", children: h.at.replace("T", " ").slice(0, 16) }),
        /* @__PURE__ */ jsx3("span", { className: "ab-mono", style: { fontWeight: 600 }, children: h.method }),
        /* @__PURE__ */ jsx3("span", { className: "ab-mono ab-sub", style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: h.url })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "ab-row-h ab-sub", style: { marginTop: 3 }, children: [
        /* @__PURE__ */ jsxs3("span", { className: "ab-num", children: [
          h.connections,
          "c\xD7",
          Math.round(h.durationS),
          "s"
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "ab-num ab-ok", children: [
          h.rpsMean,
          "/s"
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "ab-num", children: [
          "p50 ",
          h.p50,
          "ms"
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "ab-num", children: [
          "p97.5 ",
          h.p97_5,
          "ms"
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: `ab-num ${h.errors ? "ab-bad" : ""}`, children: [
          "\u9519\u8BEF ",
          h.errors
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: `ab-num ${h.non2xx ? "ab-warn" : ""}`, children: [
          "\u975E2xx ",
          h.non2xx
        ] }),
        detailId === h.runId && /* @__PURE__ */ jsx3("span", { className: "ab-tag", children: "\u8BE6\u60C5\u2193" })
      ] })
    ] }, h.runId)) }),
    detailId && (detail ? /* @__PURE__ */ jsx3(ReportView, { report: detail }) : /* @__PURE__ */ jsx3("div", { className: "ab-empty", children: "\u52A0\u8F7D\u62A5\u544A\u4E2D\u2026\uFF08\u6216\u62A5\u544A\u5DF2\u88AB\u6E05\u7406\uFF09" }))
  ] });
}
function shortUrl(u) {
  return String(u || "").replace(/^https?:\/\//, "").slice(0, 40);
}

// src/SettingsTab.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ meta, settings, onRefresh }) {
  const [local, setLocal] = useState3(settings || { connections: 10, durationS: 10, timeoutS: 10 });
  const [msg, setMsg] = useState3("");
  useEffect2(() => {
    if (settings) setLocal(settings);
  }, [settings]);
  const save = async () => {
    if (!meta) return;
    try {
      const r = await opAction(meta, "settings_set", local);
      setMsg(r.ok ? "\u5DF2\u4FDD\u5B58\uFF08\u4E0B\u4E00\u6B21\u538B\u6D4B\u7684\u9ED8\u8BA4\u503C\uFF09" : r.error || "\u4FDD\u5B58\u5931\u8D25");
      onRefresh();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  };
  return /* @__PURE__ */ jsxs4(Fragment3, { children: [
    /* @__PURE__ */ jsx4("div", { className: "ab-sec", children: "\u670D\u52A1\u72B6\u6001" }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsxs4("div", { className: "ab-card-b ab-kv", children: [
      /* @__PURE__ */ jsx4("dt", { children: "\u72B6\u6001" }),
      /* @__PURE__ */ jsx4("dd", { children: meta ? meta.degraded ? /* @__PURE__ */ jsxs4("span", { className: "ab-warn", children: [
        "\u964D\u7EA7\uFF1A",
        meta.lastBridgeErr || "\u6865\u4E0D\u53EF\u8FBE\uFF08\u5065\u5EB7\u7AEF\u70B9\u4ECD\u5728\u7EBF\uFF09"
      ] }) : /* @__PURE__ */ jsx4("span", { className: "ab-ok", children: "\u5728\u7EBF" }) : "\u672A\u8FDE\u63A5\uFF08\u6253\u5F00\u9762\u677F\u7B49\u5F85\u5FC3\u8DF3\uFF0C\u6216\u9996\u6B21\u4F7F\u7528\u5148\u5728\u5BBF\u4E3B\u4E2D\u542F\u7528\u672C\u63D2\u4EF6\uFF09" }),
      /* @__PURE__ */ jsx4("dt", { children: "\u7248\u672C" }),
      /* @__PURE__ */ jsx4("dd", { className: "ab-num", children: meta?.version || "\u2014" }),
      /* @__PURE__ */ jsx4("dt", { children: "\u7AEF\u53E3" }),
      /* @__PURE__ */ jsx4("dd", { className: "ab-num", children: meta ? `127.0.0.1:${meta.port}` : "\u2014" }),
      /* @__PURE__ */ jsx4("dt", { children: "token" }),
      /* @__PURE__ */ jsx4("dd", { className: "ab-num", children: meta ? `****${meta.token.slice(-4)}\uFF08\u5B58\u4E8E cap.kv api-bench.meta\uFF09` : "\u2014" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ab-sec", children: [
      "\u9ED8\u8BA4\u538B\u6D4B\u53C2\u6570",
      /* @__PURE__ */ jsx4("span", { className: "ab-hint", children: "\u65B0\u538B\u6D4B\u7684\u521D\u59CB\u503C\uFF1BAI \u538B\u6D4B\u672A\u6307\u5B9A\u53C2\u6570\u65F6\u4E5F\u7528\u8FD9\u5957" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsxs4("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ab-fmgrid", children: [
        /* @__PURE__ */ jsx4("label", { children: "\u5E76\u53D1\u8FDE\u63A5" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "ab-inp",
            type: "number",
            min: 1,
            max: 1e3,
            value: local.connections,
            onChange: (e) => setLocal({ ...local, connections: Number(e.target.value) || 1 })
          }
        ),
        /* @__PURE__ */ jsx4("label", { children: "\u6301\u7EED\u79D2\u6570" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "ab-inp",
            type: "number",
            min: 1,
            max: 300,
            value: local.durationS,
            onChange: (e) => setLocal({ ...local, durationS: Number(e.target.value) || 1 })
          }
        ),
        /* @__PURE__ */ jsx4("label", { children: "\u8BF7\u6C42\u8D85\u65F6" }),
        /* @__PURE__ */ jsxs4("div", { className: "ab-unitwrap", children: [
          /* @__PURE__ */ jsx4(
            "input",
            {
              className: "ab-inp",
              type: "number",
              min: 0.5,
              max: 60,
              step: 0.5,
              value: local.timeoutS,
              onChange: (e) => setLocal({ ...local, timeoutS: Number(e.target.value) || 10 })
            }
          ),
          /* @__PURE__ */ jsx4("span", { children: "\u79D2" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "ab-btnrow", children: [
        /* @__PURE__ */ jsx4("button", { className: "ab-btn", onClick: save, disabled: !meta, children: "\u4FDD\u5B58" }),
        msg && /* @__PURE__ */ jsx4("span", { className: "ab-sub", children: msg })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx4("div", { className: "ab-sec", children: "\u62A4\u680F\u4E0E\u8FB9\u754C" }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsxs4("div", { className: "ab-card-b ab-sub", style: { lineHeight: 1.8 }, children: [
      "\xB7 \u62A4\u680F\uFF1A\u8FDE\u63A5\u6570 \u2264 1000\u3001\u65F6\u957F \u2264 300s\u3001body \u2264 1MB\u3001\u540C\u4E00\u65F6\u523B\u53EA\u8DD1\u4E00\u4E2A\u538B\u6D4B\uFF08\u53EF\u4E2D\u6B62\uFF09\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u654F\u611F\u5934\uFF08Authorization/Cookie \u7B49\uFF09\u5728\u62A5\u544A\u4E0E\u5386\u53F2\u4E2D\u81EA\u52A8\u63A9\u7801\uFF08****\u540E4\u4F4D\uFF09\uFF1B\u5B8C\u6574\u503C\u53EA\u5728\u670D\u52A1\u5185\u5B58\u4E2D\u7528\u4E8E\u5F53\u6B21\u8BF7\u6C42\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u670D\u52A1\u53EA\u76D1\u542C 127.0.0.1 + token\uFF1B\u538B\u6D4B\u76EE\u6807\u4E0D\u9650\u672C\u673A\uFF0C\u4F46\u516C\u7F51\u76EE\u6807\u8BF7\u786E\u8BA4\u4F60\u62E5\u6709\u538B\u6D4B\u6388\u6743\uFF08\u5DE5\u5177\u4E0E ab/wrk/JMeter \u540C\u7C7B\uFF0C\u6EE5\u7528\u8D23\u4EFB\u5728\u4F7F\u7528\u8005\uFF09\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5185\u7F6E\u8BD5\u91D1\u77F3\u7AEF\u70B9\u538B\u7684\u662F\u672C\u63D2\u4EF6\u670D\u52A1\u8FDB\u7A0B\u81EA\u5DF1\uFF1A\u6781\u9AD8\u5E76\u53D1\u4F1A\u8BA9\u9762\u677F\u8F6E\u8BE2\u53D8\u6162\uFF08\u540C\u4E00 node \u8FDB\u7A0B\uFF09\uFF0C\u5C5E\u9884\u671F\u73B0\u8C61\uFF0C\u4E0D\u4EE3\u8868\u771F\u5B9E\u76EE\u6807\u7684\u8868\u73B0\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u4E0D\u505A\uFF1A\u5206\u5E03\u5F0F\u538B\u6D4B\u3001\u811A\u672C\u5316\u573A\u666F\u7F16\u6392\u3001WebSocket/gRPC\u3001\u5B9A\u65F6\u81EA\u52A8\u91CD\u538B\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.ab-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ab-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ab-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ab-body::-webkit-scrollbar{width:9px;height:9px}
.ab-body::-webkit-scrollbar-track{background:transparent}
.ab-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ab-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ab-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2B6CB0,#E3B341);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.ab-tt{flex:1;min-width:0}
.ab-tt b{font-size:15px;display:block}
.ab-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ab-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ab-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ab-dot.stale{background:#D29922}
.ab-dot.down{background:#F85149}
.ab-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.ab-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ab-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ab-tab:hover{color:#E6EAF2}
.ab-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ab-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ab-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2B6CB0,#E3B341);flex-shrink:0}
.ab-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400;text-align:right}
.ab-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ab-card-b{padding:11px 13px}
.ab-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ab-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ab-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ab-btn:hover{filter:brightness(1.1)}
.ab-btn:disabled{opacity:.45;cursor:not-allowed}
.ab-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ab-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ab-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ab-link{background:transparent;border:none;color:#58A6FF;font-size:11px;cursor:pointer;padding:6px 0 2px}
.ab-link:hover{text-decoration:underline}
.ab-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ab-inp:focus{outline:none;border-color:#2b6cb0}
.ab-inp::placeholder{color:#4d5566}
.ab-inp:disabled{opacity:.6}
.ab-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.ab-sel:disabled{opacity:.6}
textarea.ab-inp{resize:vertical;font-family:Consolas,Menlo,monospace}
.ab-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ab-err{color:#F85149;font-size:11.5px;padding:8px 0 0;word-break:break-all}
.ab-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.ab-ok{color:#3FB950}
.ab-bad{color:#FF8A9A}
.ab-mono{font-family:Consolas,Menlo,monospace}
.ab-num{font-family:Consolas,Menlo,monospace}
.ab-row{padding:9px 13px;border-top:1px solid #1d2330}
.ab-row:hover{background:#12151c}
.ab-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.ab-muted{color:#5C6678}
.ab-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.ab-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.ab-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.ab-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.ab-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.ab-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.ab-sum b{font-size:19px;display:block;line-height:1.2}
.ab-sum small{color:#8B95A7;font-size:9.5px}
.ab-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:0 0 8px}
.ab-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2B6CB0,#E3B341);border-radius:3px;transition:width .5s}
.ab-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.ab-kv dt{color:#5C6678;white-space:nowrap}
.ab-kv dd{margin:0;word-break:break-all}
table.ab-tb{width:100%;border-collapse:collapse;font-size:11.5px}
table.ab-tb th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
table.ab-tb td{padding:6px 8px;border-top:1px solid #1d2330;white-space:nowrap}
.ab-fmrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.ab-fmgrid{display:grid;grid-template-columns:auto 1fr;gap:7px 10px;align-items:center;font-size:11.5px;margin:8px 0}
.ab-fmgrid label{color:#8B95A7;white-space:nowrap}
.ab-unitwrap{display:flex;align-items:center;gap:6px}
.ab-unitwrap>span{color:#5C6678;font-size:10.5px;white-space:nowrap}
.ab-adv{display:flex;flex-direction:column;gap:6px;margin:6px 0}
.ab-adv>label{color:#8B95A7;font-size:10.5px}
.ab-btnrow{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.ab-chiprow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ab-warncard{margin:10px 16px 0;padding:8px 12px;border:1px solid #4d4316;background:#2a2410;color:#E3B341;border-radius:10px;font-size:11.5px}
`;
var TABS = [
  { id: "work", label: "\u538B\u6D4B" },
  { id: "history", label: "\u5386\u53F2" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel(_props) {
  const [tab, setTab] = useState4("work");
  const [meta, setMeta] = useState4(null);
  const [settings, setSettings] = useState4(null);
  const [lastReport, setLastReport] = useState4(null);
  const [history, setHistory] = useState4([]);
  const [reloadTick, setReloadTick] = useState4(0);
  const visibleRef = useRef2(true);
  const refreshAll = useCallback3(async () => {
    try {
      const [m, s, h] = await Promise.all([getMeta(), loadSettingsKv(), loadHistory()]);
      setMeta(m);
      setSettings(s);
      setHistory(h);
      const rid = m?.lastReportId;
      if (rid) {
        const rep = await loadReport(rid);
        setLastReport(rep);
      }
    } catch {
    }
  }, []);
  useEffect3(() => {
    refreshAll();
  }, [refreshAll, reloadTick]);
  useEffect3(() => {
    const t = setInterval(async () => {
      if (!visibleRef.current) return;
      try {
        const m = await getMeta();
        setMeta((prev) => {
          if (prev && prev.running && m && !m.running) setReloadTick((x) => x + 1);
          return m;
        });
      } catch {
      }
    }, 3e3);
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
  const running = meta && meta.running;
  return /* @__PURE__ */ jsxs5("div", { className: "ab-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "ab-logo", children: "\u{1F3AF}" }),
      /* @__PURE__ */ jsxs5("div", { className: "ab-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u63A5\u53E3\u538B\u6D4B\u53F0" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("span", { className: `ab-dot ${heartbeatOk ? "ok" : heartbeatStale ? "stale" : "down"}` }),
          meta ? meta.degraded ? `\u670D\u52A1\u964D\u7EA7\uFF1A${meta.lastBridgeErr || "\u6865\u4E0D\u53EF\u8FBE"}` : `\u670D\u52A1 ${meta.version} \xB7 127.0.0.1:${meta.port}` : "\u670D\u52A1\u672A\u8FDE\u63A5\uFF08\u7B49\u5F85\u5FC3\u8DF3\uFF1B\u9996\u6B21\u4F7F\u7528\u5148\u786E\u8BA4\u63D2\u4EF6\u5DF2\u542F\u7528\uFF09"
        ] })
      ] }),
      running && /* @__PURE__ */ jsxs5("span", { className: "ab-run", title: `${running.method} ${running.url}`, children: [
        "\u23F3 ",
        running.method,
        " ",
        running.url.slice(0, 32)
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "ab-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx5("button", { className: `ab-tab ${tab === t.id ? "on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-body", children: [
      tab === "work" && /* @__PURE__ */ jsx5(WorkTab, { meta, settings, lastReport, onRefresh: refreshAll }),
      tab === "history" && /* @__PURE__ */ jsx5(HistoryTab, { history, onRefresh: refreshAll }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { meta, settings, onRefresh: refreshAll })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function ApiBenchEntry(props) {
  return /* @__PURE__ */ jsx6(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  ApiBenchEntry as default
};
