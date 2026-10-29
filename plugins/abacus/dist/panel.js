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

// shared/abacus-core.js
var require_abacus_core = __commonJS({
  "shared/abacus-core.js"(exports, module) {
    "use strict";
    var DAY_MS = 864e5;
    var PREFIX = "abacus";
    var K3 = {
      meta: `${PREFIX}.meta`,
      summary: `${PREFIX}.summary`,
      daily: `${PREFIX}.daily`,
      models: `${PREFIX}.models`,
      projects: `${PREFIX}.projects`,
      quality: `${PREFIX}.quality`,
      sessions: `${PREFIX}.sessions`,
      prices: `${PREFIX}.prices`,
      settings: `${PREFIX}.settings`,
      cmdPrefix: `${PREFIX}.cmd.`,
      resultPrefix: `${PREFIX}.result.`
    };
    var LITELLM_PRICE_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
    var DEFAULT_PRICES3 = {
      "GLM-5.3-Flash": { in: 0.06, cacheRead: 6e-3, cacheWrite: 0.06, out: 0.22, preset: true },
      "GLM-5.3": { in: 0.85, cacheRead: 0.085, cacheWrite: 0.85, out: 3.4, preset: true },
      "GLM-4.6": { in: 0.6, cacheRead: 0.06, cacheWrite: 0.6, out: 2.2, preset: true },
      "GLM-4.5": { in: 0.6, cacheRead: 0.06, cacheWrite: 0.6, out: 2.2, preset: true },
      "deepseek-v4-flash": { in: 0.07, cacheRead: 7e-3, cacheWrite: 0.07, out: 0.28, preset: true },
      "deepseek-v4": { in: 0.28, cacheRead: 0.028, cacheWrite: 0.28, out: 1.1, preset: true },
      "claude-opus-4": { in: 15, cacheRead: 1.5, cacheWrite: 18.75, out: 75, preset: true },
      "claude-sonnet-4": { in: 3, cacheRead: 0.3, cacheWrite: 3.75, out: 15, preset: true },
      "claude-haiku-4": { in: 1, cacheRead: 0.1, cacheWrite: 1.25, out: 5, preset: true },
      "gpt-5": { in: 1.25, cacheRead: 0.125, cacheWrite: 1.25, out: 10, preset: true },
      "gpt-5-mini": { in: 0.25, cacheRead: 0.025, cacheWrite: 0.25, out: 2, preset: true },
      "gemini-2.5-flash": { in: 0.3, cacheRead: 0.075, cacheWrite: 0.3, out: 2.5, preset: true }
    };
    var DEFAULT_SETTINGS3 = {
      sources: { zcode: true, claude: true, polaris: true },
      fxRate: 7.2,
      // USD→CNY 显示折算，仅显示用
      autoRescanMin: 5,
      priceSyncUrl: LITELLM_PRICE_URL
    };
    var SRC_LIST = ["zcode", "claude", "polaris"];
    function dayKeyOf(ts) {
      if (!Number.isFinite(ts) || ts <= 0) return "";
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    function periodStartMs(period, nowMs) {
      const now = Number.isFinite(nowMs) ? nowMs : Date.now();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      if (period === "today") return today.getTime();
      if (period === "d7") return today.getTime() - 6 * DAY_MS;
      if (period === "d30") return today.getTime() - 29 * DAY_MS;
      return 0;
    }
    function resolvePriceKey(prices, model) {
      if (!model || typeof model !== "string") return "";
      if (prices[model]) return model;
      const lower = model.toLowerCase();
      const keys = Object.keys(prices);
      for (const k of keys) if (k.toLowerCase() === lower) return k;
      const stem = lower.replace(/[-_]\d{8}$/, "");
      for (const k of keys) {
        const kl = k.toLowerCase();
        if (lower === kl || stem === kl) return k;
      }
      for (const k of keys) {
        const kl = k.toLowerCase();
        if (stem.startsWith(kl) || kl.startsWith(stem)) return k;
      }
      return "";
    }
    function priceFor(prices, model) {
      const key = resolvePriceKey(prices || {}, model);
      if (!key) return { known: false, key: "" };
      const p = prices[key] || {};
      return {
        known: true,
        key,
        in: Number(p.in) || 0,
        cacheRead: Number(p.cacheRead) || 0,
        cacheWrite: Number(p.cacheWrite) || 0,
        out: Number(p.out) || 0
      };
    }
    function basename(p) {
      if (!p || typeof p !== "string") return "";
      const norm = p.replace(/[\\/]+$/, "");
      const i = Math.max(norm.lastIndexOf("\\"), norm.lastIndexOf("/"));
      return i >= 0 ? norm.slice(i + 1) : norm;
    }
    function num(v) {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    function normalizeZcodeRow(r, sess) {
      if (!r) return null;
      const input = num(r.input_tokens);
      const cr = num(r.cache_read_input_tokens);
      const cw = num(r.cache_creation_input_tokens);
      const fin = Math.max(0, input - cr - cw);
      const out = num(r.output_tokens);
      const ts = Number(r.started_at) || 0;
      const errType = r.error_type ? String(r.error_type) : "";
      const rowId = r.id !== void 0 ? r.id : `${r.turn_id}|${r.assistant_message_id}`;
      return {
        k: `z:${r.session_id}:${rowId}:${r.attempt_index !== void 0 ? r.attempt_index : 0}`,
        src: "zcode",
        ts,
        day: dayKeyOf(ts),
        sid: String(r.session_id || ""),
        title: sess && sess.title ? String(sess.title).slice(0, 80) : "",
        proj: basename(sess && sess.directory),
        model: String(r.model_id || ""),
        provider: String(r.provider_id || ""),
        agent: String(r.agent || ""),
        mode: String(r.mode || ""),
        fin,
        cr,
        cw,
        out,
        req: 1,
        err: errType ? 1 : 0,
        etype: errType,
        retry: num(r.retry_count) > 0 ? 1 : 0,
        ttft: num(r.time_to_first_token_ms),
        dur: num(r.duration_ms),
        hostCost: 0
      };
    }
    function normalizeClaudeMsg(m, fileHint) {
      if (!m || !m.usage) return null;
      const ts = Number(m.ts) || 0;
      return {
        k: `c:${fileHint || m.sessionId || ""}:${m.id || `${ts}|${num(m.usage.output)}`}`,
        src: "claude",
        ts,
        day: dayKeyOf(ts),
        sid: String(m.sessionId || ""),
        title: String(m.title || "").slice(0, 80),
        proj: basename(m.cwd),
        model: String(m.model || ""),
        provider: "anthropic",
        agent: m.isSidechain ? "claude-subagent" : "claude-main",
        mode: "",
        fin: num(m.usage.input),
        cr: num(m.usage.cacheRead),
        cw: num(m.usage.cacheWrite),
        out: num(m.usage.output),
        req: 1,
        err: 0,
        etype: "",
        retry: 0,
        ttft: 0,
        dur: 0,
        hostCost: 0
      };
    }
    function normalizePolarisMeta(meta) {
      if (!meta) return null;
      const tu = meta.tokenUsage || {};
      const ts = Number(meta.updatedAt) || 0;
      const hasTokens = num(tu.input) || num(tu.output) || num(tu.cacheRead) || num(tu.cacheCreation);
      if (!hasTokens && !num(tu.costUsd)) return null;
      return {
        k: `p:${meta.externalId || ts}`,
        src: "polaris",
        ts,
        day: dayKeyOf(ts),
        sid: String(meta.externalId || ""),
        title: String(meta.title || "").slice(0, 80),
        proj: basename(meta.workspacePath || meta.workspaceId || ""),
        model: "",
        provider: "polaris-host",
        agent: String(meta.engineId || ""),
        mode: "",
        fin: num(tu.input),
        cr: num(tu.cacheRead),
        cw: num(tu.cacheCreation),
        out: num(tu.output),
        req: 1,
        err: 0,
        etype: "",
        retry: 0,
        ttft: 0,
        dur: 0,
        hostCost: num(tu.costUsd)
      };
    }
    function priceEntry(entry, prices) {
      if (!entry) return { costUsd: null, savingsUsd: null, priced: false };
      if (entry.src === "polaris" && entry.hostCost > 0) {
        return { costUsd: entry.hostCost, savingsUsd: null, priced: true };
      }
      const p = priceFor(prices, entry.model);
      if (!p.known) return { costUsd: null, savingsUsd: null, priced: false };
      const cost = (entry.fin * p.in + entry.cr * p.cacheRead + entry.cw * p.cacheWrite + entry.out * p.out) / 1e6;
      const savings = entry.cr > 0 && p.in > p.cacheRead ? entry.cr * (p.in - p.cacheRead) / 1e6 : 0;
      return { costUsd: cost, savingsUsd: savings, priced: true };
    }
    function emptyBucket() {
      return { req: 0, fin: 0, cr: 0, cw: 0, out: 0, costUsd: 0, priced: 0, unpricedTokens: 0, cacheSavings: 0 };
    }
    function addEntry(b, e, priced) {
      b.req += 1;
      b.fin += e.fin;
      b.cr += e.cr;
      b.cw += e.cw;
      b.out += e.out;
      if (priced.costUsd !== null) {
        b.costUsd += priced.costUsd;
        b.priced += 1;
      } else {
        b.unpricedTokens += e.fin + e.cr + e.cw + e.out;
      }
      if (priced.savingsUsd) b.cacheSavings += priced.savingsUsd;
    }
    function round6(n) {
      return Math.round(n * 1e6) / 1e6;
    }
    function percentile(sorted, q) {
      if (!sorted.length) return null;
      const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
      return sorted[i];
    }
    function aggregate(entries, prices, opts) {
      const o = opts || {};
      const nowMs = Number.isFinite(o.nowMs) ? o.nowMs : Date.now();
      const maxDaily = o.maxDaily || 120;
      const topSessions = o.topSessions || 30;
      const topProjects = o.topProjects || 60;
      const all = emptyBucket();
      const today = emptyBucket();
      const d7 = emptyBucket();
      const d30 = emptyBucket();
      const bySrc = { zcode: emptyBucket(), claude: emptyBucket(), polaris: emptyBucket() };
      const dailyMap = /* @__PURE__ */ new Map();
      const modelMap = /* @__PURE__ */ new Map();
      const projMap = /* @__PURE__ */ new Map();
      const sessionMap = /* @__PURE__ */ new Map();
      const errorsByType = {};
      const ttftAll = [];
      const durAll = [];
      let zcodeRows = 0;
      let retriedRows = 0;
      const tToday = periodStartMs("today", nowMs);
      const t7 = periodStartMs("d7", nowMs);
      const t30 = periodStartMs("d30", nowMs);
      const dedup = /* @__PURE__ */ new Map();
      for (const raw of entries) {
        if (!raw || !raw.k) continue;
        dedup.set(raw.k, raw);
      }
      for (const e of dedup.values()) {
        const priced = priceEntry(e, prices);
        addEntry(all, e, priced);
        addEntry(bySrc[e.src] || (bySrc[e.src] = emptyBucket()), e, priced);
        if (e.ts >= tToday) addEntry(today, e, priced);
        if (e.ts >= t7) addEntry(d7, e, priced);
        if (e.ts >= t30) addEntry(d30, e, priced);
        let db = dailyMap.get(e.day);
        if (!db) dailyMap.set(e.day, db = emptyBucket());
        addEntry(db, e, priced);
        const mkLower = e.model ? e.model.toLowerCase() : "(\u672A\u8BB0\u5F55)";
        let mr = modelMap.get(mkLower);
        if (!mr) {
          mr = {
            model: e.model || "(\u672A\u8BB0\u5F55)",
            nameCount: /* @__PURE__ */ new Map(),
            provider: e.provider || "",
            req: 0,
            fin: 0,
            cr: 0,
            cw: 0,
            out: 0,
            costUsd: 0,
            priced: 0,
            savings: 0,
            d30Req: 0,
            d30Cost: 0,
            err: 0,
            ttft: [],
            dur: []
          };
          modelMap.set(mkLower, mr);
        }
        if (e.model) mr.nameCount.set(e.model, (mr.nameCount.get(e.model) || 0) + 1);
        if (!mr.provider && e.provider) mr.provider = e.provider;
        mr.req += 1;
        mr.fin += e.fin;
        mr.cr += e.cr;
        mr.cw += e.cw;
        mr.out += e.out;
        if (priced.costUsd !== null) {
          mr.costUsd += priced.costUsd;
          mr.priced += 1;
        }
        if (priced.savingsUsd) mr.savings += priced.savingsUsd;
        if (e.err) mr.err += 1;
        if (e.ts >= t30) {
          mr.d30Req += 1;
          if (priced.costUsd !== null) mr.d30Cost += priced.costUsd;
        }
        if (e.ttft > 0) {
          mr.ttft.push(e.ttft);
          ttftAll.push(e.ttft);
        }
        if (e.dur > 0) {
          mr.dur.push(e.dur);
          durAll.push(e.dur);
        }
        if (e.src === "zcode") {
          zcodeRows += 1;
          if (e.retry) retriedRows += 1;
          if (e.etype) errorsByType[e.etype] = (errorsByType[e.etype] || 0) + 1;
        }
        const pk = `${e.proj || "(\u672A\u5F52\u9879\u76EE)"}|${e.src}`;
        let pr = projMap.get(pk);
        if (!pr) {
          pr = { proj: e.proj || "(\u672A\u5F52\u9879\u76EE)", src: e.src, sessions: /* @__PURE__ */ new Set(), req: 0, tokens: 0, costUsd: 0, lastDay: "", d30Cost: 0 };
          projMap.set(pk, pr);
        }
        pr.sessions.add(e.sid);
        pr.req += 1;
        pr.tokens += e.fin + e.cr + e.cw + e.out;
        if (priced.costUsd !== null) pr.costUsd += priced.costUsd;
        if (e.ts >= t30 && priced.costUsd !== null) pr.d30Cost += priced.costUsd;
        if (e.day && e.day > pr.lastDay) pr.lastDay = e.day;
        const sk = `${e.src}|${e.sid}`;
        let sr = sessionMap.get(sk);
        if (!sr) {
          sr = {
            src: e.src,
            sid: e.sid,
            title: "",
            proj: "",
            req: 0,
            fin: 0,
            cr: 0,
            tokens: 0,
            costUsd: 0,
            firstDay: e.day || "",
            lastDay: e.day || ""
          };
          sessionMap.set(sk, sr);
        }
        sr.req += 1;
        sr.fin += e.fin;
        sr.cr += e.cr;
        sr.tokens += e.fin + e.cr + e.cw + e.out;
        if (priced.costUsd !== null) sr.costUsd += priced.costUsd;
        if (e.day) {
          if (!sr.firstDay || e.day < sr.firstDay) sr.firstDay = e.day;
          if (e.day > sr.lastDay) sr.lastDay = e.day;
        }
        if (!sr.title && e.title) sr.title = e.title;
        if (!sr.proj && e.proj) sr.proj = e.proj;
      }
      const daily = [...dailyMap.entries()].filter(([d]) => d).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-maxDaily).map(([day, b]) => ({
        day,
        req: b.req,
        fin: round6(b.fin),
        cr: round6(b.cr),
        cw: round6(b.cw),
        out: round6(b.out),
        costUsd: round6(b.costUsd),
        cacheSavings: round6(b.cacheSavings)
      }));
      const models = [...modelMap.values()].map((m) => {
        let displayName = m.model;
        let best = -1;
        for (const [name, n] of m.nameCount) {
          if (n > best) {
            best = n;
            displayName = name;
          }
        }
        return {
          model: displayName,
          provider: m.provider,
          req: m.req,
          fin: round6(m.fin),
          cr: round6(m.cr),
          cw: round6(m.cw),
          out: round6(m.out),
          costUsd: round6(m.costUsd),
          priced: m.priced,
          savings: round6(m.savings),
          cacheHit: m.fin + m.cr + m.cw > 0 ? Math.round(m.cr / (m.fin + m.cr + m.cw) * 1e3) / 10 : null,
          ttftP50: percentile(m.ttft.slice().sort((a, b) => a - b), 0.5),
          ttftP90: percentile(m.ttft.slice().sort((a, b) => a - b), 0.9),
          err: m.err,
          d30Req: m.d30Req,
          d30Cost: round6(m.d30Cost)
        };
      }).sort((a, b) => b.costUsd - a.costUsd || b.fin + b.cr + b.out - (a.fin + a.cr + a.out));
      const projects = [...projMap.values()].map((p) => ({
        proj: p.proj,
        src: p.src,
        sessions: p.sessions.size,
        req: p.req,
        tokens: round6(p.tokens),
        costUsd: round6(p.costUsd),
        d30Cost: round6(p.d30Cost),
        lastDay: p.lastDay
      })).sort((a, b) => b.tokens - a.tokens).slice(0, topProjects);
      const sessions = [...sessionMap.values()].map((s) => ({
        src: s.src,
        sid: s.sid,
        title: s.title,
        proj: s.proj,
        req: s.req,
        tokens: round6(s.tokens),
        costUsd: round6(s.costUsd),
        firstDay: s.firstDay,
        lastDay: s.lastDay
      })).sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens).slice(0, topSessions);
      const quality = {
        errorsByType,
        zcodeRows,
        retriedRows,
        ttftP50: percentile(ttftAll.slice().sort((a, b) => a - b), 0.5),
        ttftP90: percentile(ttftAll.slice().sort((a, b) => a - b), 0.9),
        durP50: percentile(durAll.slice().sort((a, b) => a - b), 0.5),
        durP90: percentile(durAll.slice().sort((a, b) => a - b), 0.9),
        tools: o.tools || { total: 0, byName: [], destructive: 0 },
        insights: buildInsights({ all, errorsByType, models, sessions: [...sessionMap.values()], prices })
      };
      const roundBucket = (b) => ({
        req: b.req,
        fin: round6(b.fin),
        cr: round6(b.cr),
        cw: round6(b.cw),
        out: round6(b.out),
        costUsd: round6(b.costUsd),
        priced: b.priced,
        unpricedTokens: round6(b.unpricedTokens),
        cacheSavings: round6(b.cacheSavings)
      });
      return {
        summary: {
          all: roundBucket(all),
          today: roundBucket(today),
          d7: roundBucket(d7),
          d30: roundBucket(d30),
          bySrc: {
            zcode: roundBucket(bySrc.zcode),
            claude: roundBucket(bySrc.claude),
            polaris: roundBucket(bySrc.polaris)
          },
          generatedAt: nowMs
        },
        daily,
        models,
        projects,
        quality,
        sessions
      };
    }
    function buildInsights(ctx) {
      const out = [];
      const { errorsByType, models, sessions, all, prices } = ctx;
      const rl = errorsByType && errorsByType.rate_limited || 0;
      if (rl > 0) {
        out.push({ code: "rate_limited", level: "warn", text: `\u4E0A\u6E38\u9650\u6D41 ${rl} \u6B21\u8BF7\u6C42\uFF08rate_limited\uFF09\u2014\u2014\u6392\u961F\u4E0E\u91CD\u8BD5\u62D6\u6162\u4F1A\u8BDD\uFF0C\u4E00\u822C\u4E0D\u4EA7\u751F\u8BA1\u8D39 token\u3002` });
      }
      const otherErrs = errorsByType ? Object.entries(errorsByType).filter(([k]) => k !== "rate_limited").reduce((s, [, n]) => s + n, 0) : 0;
      if (otherErrs > 0) {
        out.push({ code: "errors", level: "warn", text: `\u975E\u9650\u6D41\u9519\u8BEF ${otherErrs} \u6B21\u8BF7\u6C42\uFF08\u7F51\u7EDC/\u8D85\u65F6/\u53D6\u6D88\u7B49\uFF09\uFF0C\u767D\u8017\u7B49\u5F85\u65F6\u95F4\u3002` });
      }
      const unpriced = models.filter((m) => m.priced === 0 && m.fin + m.cr + m.cw + m.out > 0);
      const unpricedTokens = unpriced.reduce((s, m) => s + m.fin + m.cr + m.cw + m.out, 0);
      if (unpricedTokens > 0) {
        const names = unpriced.map((m) => m.model).slice(0, 3).join("\u3001");
        out.push({ code: "unpriced", level: "info", text: `\u6709 ${Math.round(unpricedTokens).toLocaleString("en-US")} token \u53D1\u751F\u5728\u672A\u8BA1\u4EF7\u6A21\u578B\uFF08${names}\uFF09\u2014\u2014\u5728\u8BBE\u7F6E\u91CC\u8865\u4EF7\u76EE\u5373\u53EF\u5165\u8D26\u3002` });
      }
      const weak = sessions.filter((s) => s.fin > 1e5 && s.fin + s.cr > 0 && s.cr / (s.fin + s.cr) < 0.2).sort((a, b) => b.fin - a.fin).slice(0, 3);
      if (weak.length > 0) {
        const first = weak[0];
        out.push({
          code: "weak_cache",
          level: "info",
          text: `${weak.length} \u4E2A\u4F1A\u8BDD\u7F13\u5B58\u547D\u4E2D\u7387\u5F02\u5E38\u504F\u4F4E\uFF08\u5982\u300C${first.title || first.sid.slice(0, 12)}\u300D\u5168\u4EF7\u8F93\u5165 ${Math.round(first.fin).toLocaleString("en-US")}\u3001\u7F13\u5B58\u8BFB ${Math.round(first.cr).toLocaleString("en-US")}\uFF09\u2014\u2014\u957F\u4E0A\u4E0B\u6587\u53CD\u590D\u5168\u4EF7\u8BA1\u8D39\uFF0C\u503C\u5F97\u4E00\u770B\u3002`
        });
      }
      if (all.cacheSavings > 0) {
        out.push({ code: "cache_savings", level: "good", text: `\u7F13\u5B58\u7D2F\u8BA1\u5E2E\u4F60\u7701\u4E0B\u7EA6 $${round6(all.cacheSavings)}\uFF08cacheRead \xD7 \u5168\u4EF7\u5DEE\uFF09\uFF0C\u8FD9\u662F\u8D26\u9762\u5916\u770B\u4E0D\u89C1\u7684\u94B1\u3002` });
      }
      if (all.req > 0 && all.priced === 0 && all.unpricedTokens > 0) {
        out.push({ code: "no_prices", level: "warn", text: "\u5F53\u524D\u4EF7\u76EE\u8868\u4E0B\u6CA1\u6709\u4E00\u7B14\u53EF\u8BA1\u4EF7\u2014\u2014\u6253\u5F00\u8BBE\u7F6E\u68C0\u67E5\u4EF7\u76EE\u8868\u6216\u6A21\u578B\u540D\u3002" });
      }
      return out.filter((i) => i.text);
    }
    module.exports = {
      DAY_MS,
      PREFIX,
      K: K3,
      SRC_LIST,
      LITELLM_PRICE_URL,
      DEFAULT_PRICES: DEFAULT_PRICES3,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      dayKeyOf,
      periodStartMs,
      resolvePriceKey,
      priceFor,
      normalizeZcodeRow,
      normalizeClaudeMsg,
      normalizePolarisMeta,
      priceEntry,
      aggregate
    };
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  DEFAULT_PRICES: () => DEFAULT_PRICES2,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS2,
  K: () => K2,
  fmtCny: () => fmtCny,
  fmtTokens: () => fmtTokens,
  fmtUsd: () => fmtUsd,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvSet: () => kvSet,
  loadPanelData: () => loadPanelData,
  savePrices: () => savePrices,
  saveSettings: () => saveSettings,
  sendCmd: () => sendCmd
});
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
async function loadPanelData() {
  const [meta, summary, daily, models, projects, quality, sessions, prices, settings] = await Promise.all([
    kvGet(K2.meta).catch(() => null),
    kvGet(K2.summary).catch(() => null),
    kvGet(K2.daily).catch(() => []),
    kvGet(K2.models).catch(() => []),
    kvGet(K2.projects).catch(() => []),
    kvGet(K2.quality).catch(() => null),
    kvGet(K2.sessions).catch(() => []),
    kvGet(K2.prices).catch(() => null),
    kvGet(K2.settings).catch(() => null)
  ]);
  return {
    meta,
    summary,
    daily: Array.isArray(daily) ? daily : [],
    models: Array.isArray(models) ? models : [],
    projects: Array.isArray(projects) ? projects : [],
    quality,
    sessions: Array.isArray(sessions) ? sessions : [],
    prices: prices && Object.keys(prices).length ? prices : DEFAULT_PRICES2,
    settings: { ...DEFAULT_SETTINGS2, ...settings || {}, sources: { ...DEFAULT_SETTINGS2.sources, ...settings && settings.sources ? settings.sources : {} } }
  };
}
async function savePrices(p) {
  await kvSet(K2.prices, p);
}
async function saveSettings(s) {
  await kvSet(K2.settings, s);
}
async function sendCmd(op, waitMs = 12e4) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await kvSet(`${K2.cmdPrefix}${nonce}`, { op });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, 2e3));
    const r = await kvGet(`${K2.resultPrefix}${nonce}`).catch(() => null);
    if (r) {
      kvDel(`${K2.resultPrefix}${nonce}`).catch(() => {
      });
      return r;
    }
  }
  throw new Error("\u547D\u4EE4\u8D85\u65F6\uFF08\u670D\u52A1\u53EF\u80FD\u79BB\u7EBF\uFF09");
}
function fmtTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
function fmtUsd(n) {
  if (n === null || n === void 0 || !Number.isFinite(n)) return "\u2014";
  return `$${n.toFixed(2)}`;
}
function fmtCny(usd, fx) {
  if (usd === null || usd === void 0 || !Number.isFinite(usd)) return "\u2014";
  return `\xA5${(usd * fx).toFixed(2)}`;
}
var core, K2, DEFAULT_SETTINGS2, DEFAULT_PRICES2;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    core = __toESM(require_abacus_core());
    K2 = core.K;
    DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
    DEFAULT_PRICES2 = core.DEFAULT_PRICES;
  }
});

// src/Panel.tsx
init_model();
import { useCallback, useEffect, useRef, useState as useState2 } from "react";

// src/OverviewTab.tsx
init_model();
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var W = 340;
var H = 150;
var PAD_T = 10;
var PAD_B = 20;
var DAYS = 14;
function bucketTokens(b) {
  return b.fin + b.cr + b.cw + b.out;
}
function InsightList({ data, limit }) {
  const insights = data.quality && data.quality.insights || [];
  const shown = limit ? insights.slice(0, limit) : insights;
  if (!shown.length) return /* @__PURE__ */ jsx("div", { className: "ab-empty", children: "\u6682\u65E0\u6D1E\u5BDF\uFF08\u7B49\u4E0B\u4E00\u6B21\u626B\u63CF\uFF09" });
  const icon = (level) => level === "warn" ? "\u26A0\uFE0F" : level === "good" ? "\u{1F4B0}" : level === "info" ? "\u{1F50D}" : "\xB7";
  return /* @__PURE__ */ jsx("div", { className: "ab-card-b", children: shown.map((i, idx) => /* @__PURE__ */ jsxs("div", { className: `ab-insight ${i.level}`, children: [
    /* @__PURE__ */ jsx("span", { className: "ic", children: icon(i.level) }),
    /* @__PURE__ */ jsx("span", { className: "tx", children: i.text })
  ] }, `${i.code}-${idx}`)) });
}
function OverviewTab({ ctx }) {
  const { data } = ctx;
  const s = data.summary;
  const fx = data.settings.fxRate;
  if (!s) return /* @__PURE__ */ jsx("div", { className: "ab-empty", children: "\u805A\u5408\u6570\u636E\u5C1A\u672A\u5C31\u7EEA\u2014\u2014\u540E\u53F0\u670D\u52A1\u9996\u6B21\u626B\u63CF\u5B8C\u6210\u540E\u8FD9\u91CC\u4F1A\u51FA\u73B0\u4F60\u7684\u7B2C\u4E00\u672C\u8D26\u3002" });
  const cards = [
    { label: "\u4ECA\u65E5\u6210\u672C", b: s.today, cls: "gold" },
    { label: "\u8FD1 7 \u5929", b: s.d7, cls: "blue" },
    { label: "\u8FD1 30 \u5929", b: s.d30, cls: "" },
    { label: "\u7D2F\u8BA1", b: s.all, cls: "" }
  ];
  const allTokens = bucketTokens(s.all);
  const cacheHit = s.all.fin + s.all.cr + s.all.cw > 0 ? (s.all.cr / (s.all.fin + s.all.cr + s.all.cw) * 100).toFixed(1) : null;
  const rows = data.daily.slice(-DAYS);
  const dayMap = new Map(rows.map((r) => [r.day, r]));
  const days = [];
  const now = /* @__PURE__ */ new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hit = dayMap.get(key);
    days.push(hit || { day: key, req: 0, fin: 0, cr: 0, cw: 0, out: 0, costUsd: 0, cacheSavings: 0 });
  }
  const maxTokens = Math.max(1, ...days.map((d) => bucketTokens(d)));
  const bw = (W - 8) / DAYS;
  const chartH = H - PAD_T - PAD_B;
  const bySrc = Object.entries(s.bySrc || {}).filter(([, b]) => b.req > 0 || b.costUsd > 0);
  const srcCostTotal = Math.max(1e-9, ...[bySrc.reduce((sum, [, b]) => sum + b.costUsd, 0), 1e-9]);
  const srcColors = { zcode: "#4C8DFF", claude: "#D29922", polaris: "#3FB950" };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "ab-bar" }),
      "\u6210\u672C",
      /* @__PURE__ */ jsxs("small", { className: "ab-hint", children: [
        "USD \u4E0E\u4EBA\u6C11\u5E01\u6298\u7B97\uFF08\u6C47\u7387 ",
        fx,
        "\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ab-statrow", children: cards.map((c) => /* @__PURE__ */ jsxs("div", { className: "ab-stat", children: [
      /* @__PURE__ */ jsx("b", { className: c.cls || void 0, children: fmtCny(c.b.costUsd, fx) }),
      /* @__PURE__ */ jsxs("small", { children: [
        c.label,
        " \xB7 ",
        fmtUsd(c.b.costUsd),
        " \xB7 ",
        c.b.req,
        " \u6B21"
      ] })
    ] }, c.label)) }),
    /* @__PURE__ */ jsxs("div", { className: "ab-statrow", children: [
      /* @__PURE__ */ jsxs("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx("b", { className: "green", children: fmtUsd(s.all.cacheSavings) }),
        /* @__PURE__ */ jsxs("small", { children: [
          "\u7F13\u5B58\u7D2F\u8BA1\u8282\u7701 \u2248",
          fmtCny(s.all.cacheSavings, fx)
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx("b", { className: cacheHit && Number(cacheHit) > 80 ? "green" : "amber", children: cacheHit ? `${cacheHit}%` : "\u2014" }),
        /* @__PURE__ */ jsx("small", { children: "\u7F13\u5B58\u547D\u4E2D\u7387\uFF08token \u53E3\u5F84\uFF09" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx("b", { className: "blue", children: fmtTokens(allTokens) }),
        /* @__PURE__ */ jsx("small", { children: "\u7D2F\u8BA1 token\uFF08\u56DB\u7C7B\u5408\u8BA1\uFF09" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx("b", { className: s.all.unpricedTokens > 0 ? "red" : "muted", children: s.all.unpricedTokens > 0 ? fmtTokens(s.all.unpricedTokens) : "0" }),
        /* @__PURE__ */ jsx("small", { children: "\u672A\u8BA1\u4EF7 token\uFF08\u53BB\u8BBE\u7F6E\u8865\u4EF7\uFF09" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "ab-bar" }),
      "\u8FD1 ",
      DAYS,
      " \u5929 token \u7528\u91CF",
      /* @__PURE__ */ jsx("small", { className: "ab-hint", children: "\u67F1\u6BB5\uFF1A\u5168\u4EF7\u8F93\u5165 / \u7F13\u5B58\u8BFB / \u8F93\u51FA" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ab-card", children: /* @__PURE__ */ jsxs("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsx("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", display: "block" }, children: days.map((d, i) => {
        const total = bucketTokens(d);
        const x = 4 + i * bw;
        const scale = chartH / maxTokens;
        const hOut = d.out * scale;
        const hFin = d.fin * scale;
        const hCr = d.cr * scale;
        const yOut = PAD_T + chartH - hOut;
        const yFin = yOut - hFin;
        const yCr = yFin - hCr;
        return /* @__PURE__ */ jsxs("g", { children: [
          /* @__PURE__ */ jsx("title", { children: `${d.day} \uFF5C ${d.req} \u6B21 \uFF5C \u5168\u4EF7 ${fmtTokens(d.fin)} \xB7 \u7F13\u5B58 ${fmtTokens(d.cr)} \xB7 \u8F93\u51FA ${fmtTokens(d.out)} \uFF5C \u6210\u672C ${fmtUsd(d.costUsd)}` }),
          total > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("rect", { x: x + 1, y: yCr, width: bw - 2, height: Math.max(0.5, hCr), fill: "#2b3d5c" }),
            /* @__PURE__ */ jsx("rect", { x: x + 1, y: yFin, width: bw - 2, height: Math.max(0.5, hFin), fill: "#4C8DFF" }),
            /* @__PURE__ */ jsx("rect", { x: x + 1, y: yOut, width: bw - 2, height: Math.max(0.5, hOut), fill: "#F2C063" })
          ] }),
          total === 0 && /* @__PURE__ */ jsx("rect", { x: x + 1, y: PAD_T + chartH - 1, width: bw - 2, height: 1, fill: "#222936" }),
          (i % 2 === 0 || i === DAYS - 1) && /* @__PURE__ */ jsx("text", { x: x + bw / 2, y: H - 6, fill: "#5C6678", fontSize: "8", textAnchor: "middle", children: d.day.slice(5) })
        ] }, d.day);
      }) }),
      /* @__PURE__ */ jsxs("div", { className: "ab-legend", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { style: { background: "#4C8DFF" } }),
          "\u5168\u4EF7\u8F93\u5165"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { style: { background: "#2b3d5c" } }),
          "\u7F13\u5B58\u8BFB"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { style: { background: "#F2C063" } }),
          "\u8F93\u51FA"
        ] })
      ] })
    ] }) }),
    bySrc.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "ab-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "ab-bar" }),
        "\u6210\u672C\u6784\u6210\uFF08\u5206\u6E90\uFF09"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ab-card", children: /* @__PURE__ */ jsxs("div", { className: "ab-card-b", children: [
        /* @__PURE__ */ jsx("div", { style: { display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "#222936" }, children: bySrc.map(([src, b]) => /* @__PURE__ */ jsx("div", { style: { width: `${b.costUsd / srcCostTotal * 100}%`, background: srcColors[src] || "#8B95A7" }, title: `${src}: ${fmtUsd(b.costUsd)}` }, src)) }),
        /* @__PURE__ */ jsx("div", { className: "ab-legend", style: { marginTop: 8 }, children: bySrc.map(([src, b]) => /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { style: { background: srcColors[src] || "#8B95A7" } }),
          src,
          " ",
          fmtUsd(b.costUsd),
          "\uFF08",
          b.req,
          " \u6B21\uFF09"
        ] }, src)) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "ab-bar" }),
      "\u6F0F\u94B1\u900F\u89C6",
      /* @__PURE__ */ jsx("small", { className: "ab-hint", children: "\u8BE6\u89C1\u300C\u8D28\u91CF\u300DTab" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ab-card", children: /* @__PURE__ */ jsx(InsightList, { data, limit: 4 }) })
  ] });
}

// src/ModelsTab.tsx
init_model();
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ModelsTab({ ctx }) {
  const { data } = ctx;
  const fx = data.settings.fxRate;
  if (!data.models.length) return /* @__PURE__ */ jsx2("div", { className: "ab-empty", children: "\u6682\u65E0\u6A21\u578B\u6570\u636E\u2014\u2014\u670D\u52A1\u9996\u626B\u540E\u51FA\u73B0\u3002" });
  const maxCost = Math.max(1e-9, ...data.models.map((m) => m.costUsd));
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "ab-bar" }),
      "\u6A21\u578B\u8D26\u672C",
      /* @__PURE__ */ jsxs2("small", { className: "ab-hint", children: [
        data.models.length,
        " \u4E2A\u6A21\u578B \xB7 \u6309\u7D2F\u8BA1\u6210\u672C\u964D\u5E8F"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsx2("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs2("table", { className: "ab-table", children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("th", { children: "\u6A21\u578B" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u8BF7\u6C42" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u5168\u4EF7\u8F93\u5165" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u7F13\u5B58\u8BFB" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u547D\u4E2D" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u8F93\u51FA" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u6210\u672C" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u8FD130\u5929" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "TTFT P50" }),
        /* @__PURE__ */ jsx2("th", { className: "ab-num", children: "\u9519" })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: data.models.map((m) => /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsxs2("td", { children: [
          m.model,
          m.priced === 0 && /* @__PURE__ */ jsx2("span", { className: "ab-tag amber", style: { marginLeft: 6 }, children: "\u672A\u8BA1\u4EF7" }),
          m.provider && /* @__PURE__ */ jsx2("span", { className: "ab-tag", style: { marginLeft: 4 }, children: m.provider })
        ] }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", children: m.req }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", children: fmtTokens(m.fin) }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", title: `\u7F13\u5B58\u8282\u7701 ${fmtUsd(m.savings)}`, children: fmtTokens(m.cr) }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", children: m.cacheHit !== null ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("span", { className: "ab-hitbar", children: /* @__PURE__ */ jsx2("i", { style: { width: `${Math.min(100, m.cacheHit)}%` } }) }),
          m.cacheHit,
          "%"
        ] }) : "\u2014" }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", children: fmtTokens(m.out) }),
        /* @__PURE__ */ jsxs2("td", { className: "ab-num", children: [
          /* @__PURE__ */ jsx2("div", { style: { width: 56, height: 4, background: "#222936", borderRadius: 2, marginBottom: 3 }, children: /* @__PURE__ */ jsx2("div", { style: { width: `${m.costUsd / maxCost * 100}%`, height: "100%", borderRadius: 2, background: "#F2C063" } }) }),
          fmtUsd(m.costUsd)
        ] }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", title: `${m.d30Req} \u6B21\u8BF7\u6C42`, children: m.d30Req ? `${fmtUsd(m.d30Cost)}` : "\u2014" }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", children: m.ttftP50 ? `${(m.ttftP50 / 1e3).toFixed(1)}s` : "\u2014" }),
        /* @__PURE__ */ jsx2("td", { className: "ab-num", children: m.err ? /* @__PURE__ */ jsx2("span", { className: "ab-tag red", children: m.err }) : "\u2014" })
      ] }, m.model)) })
    ] }) }) }),
    /* @__PURE__ */ jsxs2("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "ab-bar" }),
      "\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ab-card", children: /* @__PURE__ */ jsx2("div", { className: "ab-card-b ab-caliber", children: "\u300C\u547D\u4E2D\u300D= \u7F13\u5B58\u8BFB token \xF7\uFF08\u5168\u4EF7\u8F93\u5165 + \u7F13\u5B58\u8BFB + \u7F13\u5B58\u5199\uFF09\u3002\u7F13\u5B58\u8BFB\u901A\u5E38\u53EA\u6309\u5168\u4EF7\u7684 1/10 \u8BA1\u8D39\u2014\u2014 \u547D\u4E2D\u7387\u8D8A\u9AD8\uFF0C\u540C\u6837\u4E0A\u4E0B\u6587\u8D8A\u4FBF\u5B9C\u3002\u672A\u8BA1\u4EF7\u6A21\u578B\u5728\u300C\u8BBE\u7F6E\u300DTab \u8865\u4EF7\u540E\u7ACB\u5373\u5165\u8D26\u3002" }) })
  ] });
}

// src/ProjectsTab.tsx
init_model();
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var SRC_COLOR = { zcode: "#4C8DFF", claude: "#D29922", polaris: "#3FB950" };
function ProjectsTab({ ctx }) {
  const { data } = ctx;
  const fx = data.settings.fxRate;
  if (!data.projects.length) return /* @__PURE__ */ jsx3("div", { className: "ab-empty", children: "\u6682\u65E0\u9879\u76EE\u6570\u636E\u2014\u2014\u670D\u52A1\u9996\u626B\u540E\u51FA\u73B0\u3002" });
  const maxTokens = Math.max(1, ...data.projects.map((p) => p.tokens));
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "ab-bar" }),
      "\u9879\u76EE\u8D26\u672C",
      /* @__PURE__ */ jsxs3("small", { className: "ab-hint", children: [
        data.projects.length,
        " \u4E2A\u9879\u76EE \xD7 \u6E90 \xB7 \u6309 token \u964D\u5E8F"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ab-card", children: /* @__PURE__ */ jsx3("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs3("table", { className: "ab-table", children: [
      /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("th", { children: "\u9879\u76EE" }),
        /* @__PURE__ */ jsx3("th", { children: "\u6E90" }),
        /* @__PURE__ */ jsx3("th", { className: "ab-num", children: "\u4F1A\u8BDD" }),
        /* @__PURE__ */ jsx3("th", { className: "ab-num", children: "\u8BF7\u6C42" }),
        /* @__PURE__ */ jsx3("th", { className: "ab-num", children: "token" }),
        /* @__PURE__ */ jsx3("th", { className: "ab-num", children: "\u7D2F\u8BA1\u6210\u672C" }),
        /* @__PURE__ */ jsx3("th", { className: "ab-num", children: "\u8FD130\u5929" }),
        /* @__PURE__ */ jsx3("th", { className: "ab-num", children: "\u6700\u8FD1\u6D3B\u8DC3" })
      ] }) }),
      /* @__PURE__ */ jsx3("tbody", { children: data.projects.map((p) => /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsxs3("td", { children: [
          /* @__PURE__ */ jsx3("div", { style: { width: 90, height: 4, background: "#222936", borderRadius: 2, marginBottom: 3 }, children: /* @__PURE__ */ jsx3("div", { style: { width: `${p.tokens / maxTokens * 100}%`, height: "100%", borderRadius: 2, background: SRC_COLOR[p.src] || "#8B95A7" } }) }),
          p.proj
        ] }),
        /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("span", { className: "ab-tag", style: { color: SRC_COLOR[p.src] }, children: p.src }) }),
        /* @__PURE__ */ jsx3("td", { className: "ab-num", children: p.sessions }),
        /* @__PURE__ */ jsx3("td", { className: "ab-num", children: p.req }),
        /* @__PURE__ */ jsx3("td", { className: "ab-num", children: fmtTokens(p.tokens) }),
        /* @__PURE__ */ jsxs3("td", { className: "ab-num", children: [
          fmtUsd(p.costUsd),
          /* @__PURE__ */ jsx3("br", {}),
          /* @__PURE__ */ jsx3("small", { style: { color: "#5C6678" }, children: fmtCny(p.costUsd, fx) })
        ] }),
        /* @__PURE__ */ jsx3("td", { className: "ab-num", children: p.d30Cost ? fmtUsd(p.d30Cost) : "\u2014" }),
        /* @__PURE__ */ jsx3("td", { className: "ab-num", children: p.lastDay || "\u2014" })
      ] }, `${p.proj}|${p.src}`)) })
    ] }) }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "ab-bar" }),
      "\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ab-card", children: /* @__PURE__ */ jsx3("div", { className: "ab-card-b ab-caliber", children: "\u9879\u76EE\u6309\u4F1A\u8BDD\u76EE\u5F55\u5F52\u7EC4\uFF1Azcode \u53D6\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\u3001claude \u53D6 cwd\u3001polaris \u53D6\u5DE5\u4F5C\u533A\u8DEF\u5F84\u7684\u76EE\u5F55\u540D\u3002 \u540C\u540D\u76EE\u5F55\u8DE8\u6E90\u5206\u884C\u663E\u793A\uFF0C\u907F\u514D\u300CPolaris\uFF08ZCode \u7F16\u7A0B\uFF09\u300D\u4E0E\u300CPolaris\uFF08Claude Code\uFF09\u300D\u6DF7\u6210\u4E00\u9505\u3002" }) })
  ] });
}

// src/QualityTab.tsx
init_model();
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function QualityTab({ ctx }) {
  const { data } = ctx;
  const q = data.quality;
  if (!q) return /* @__PURE__ */ jsx4("div", { className: "ab-empty", children: "\u6682\u65E0\u8D28\u91CF\u6570\u636E\u2014\u2014\u670D\u52A1\u9996\u626B\u540E\u51FA\u73B0\u3002" });
  const errRows = Object.entries(q.errorsByType || {}).sort((a, b) => b[1] - a[1]);
  const maxErr = Math.max(1, ...errRows.map(([, n]) => n));
  const maxTool = Math.max(1, ...(q.tools.byName || []).map((t) => t.n));
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "ab-bar" }),
      "\u9519\u8BEF\u4E0E\u7B49\u5F85",
      /* @__PURE__ */ jsx4("small", { className: "ab-hint", children: "zcode \u9065\u6D4B\u53E3\u5F84" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "ab-statrow", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx4("b", { className: q.ttftP50 ? "" : "muted", children: q.ttftP50 ? `${(q.ttftP50 / 1e3).toFixed(1)}s` : "\u2014" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          "TTFT P50",
          q.ttftP90 ? `\uFF08P90 ${(q.ttftP90 / 1e3).toFixed(1)}s\uFF09` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx4("b", { className: q.durP50 ? "" : "muted", children: q.durP50 ? `${Math.round(q.durP50 / 1e3)}s` : "\u2014" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          "\u8BF7\u6C42\u65F6\u957F P50",
          q.durP90 ? `\uFF08P90 ${Math.round(q.durP90 / 1e3)}s\uFF09` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "ab-stat", children: [
        /* @__PURE__ */ jsx4("b", { className: "amber", children: q.retriedRows }),
        /* @__PURE__ */ jsxs4("small", { children: [
          "\u91CD\u8BD5\u8BF7\u6C42\u884C / ",
          q.zcodeRows,
          " \u603B\u884C"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsx4("div", { className: "ab-card-b", children: errRows.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "ab-sub", children: "\u96F6\u9519\u8BEF\u8BF7\u6C42\u2014\u2014\u5E72\u51C0\u3002" }) : errRows.map(([type, n]) => /* @__PURE__ */ jsxs4("div", { className: "ab-insight info", children: [
      /* @__PURE__ */ jsx4("span", { className: "ic", style: { width: 16, textAlign: "center" }, children: "\u26D4" }),
      /* @__PURE__ */ jsxs4("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs4("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsx4("b", { style: { fontSize: 11.5 }, children: type }),
          /* @__PURE__ */ jsxs4("span", { className: "ab-num", style: { color: n > 100 ? "#FF8A9A" : "#F2C063" }, children: [
            n,
            " \u6B21"
          ] })
        ] }),
        /* @__PURE__ */ jsx4("div", { style: { height: 4, background: "#222936", borderRadius: 2, marginTop: 3 }, children: /* @__PURE__ */ jsx4("div", { style: { width: `${n / maxErr * 100}%`, height: "100%", borderRadius: 2, background: "#F85149" } }) })
      ] })
    ] }, type)) }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "ab-bar" }),
      "\u5DE5\u5177\u9065\u6D4B",
      /* @__PURE__ */ jsxs4("small", { className: "ab-hint", children: [
        "\u5171 ",
        q.tools.total,
        " \u6B21 \xB7 \u7834\u574F\u6027 ",
        q.tools.destructive,
        " \u6B21"
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsx4("div", { className: "ab-card-b", children: (q.tools.byName || []).length === 0 ? /* @__PURE__ */ jsx4("div", { className: "ab-sub", children: "\u6682\u65E0\u5DE5\u5177\u9065\u6D4B\u3002" }) : q.tools.byName.map((t) => /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }, children: [
      /* @__PURE__ */ jsx4("span", { style: { width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5 }, children: t.name }),
      /* @__PURE__ */ jsx4("div", { style: { flex: 1, height: 6, background: "#222936", borderRadius: 3 }, children: /* @__PURE__ */ jsx4("div", { style: { width: `${t.n / maxTool * 100}%`, height: "100%", borderRadius: 3, background: "#4C8DFF" } }) }),
      /* @__PURE__ */ jsxs4("span", { className: "ab-num", style: { width: 96, textAlign: "right", fontSize: 10.5, color: "#8B95A7" }, children: [
        "\xD7",
        t.n,
        t.avgDurMs ? ` \xB7 ${t.avgDurMs >= 1e3 ? `${(t.avgDurMs / 1e3).toFixed(1)}s` : `${t.avgDurMs}ms`}` : "",
        t.destructive ? " \u26A0\uFE0F" : ""
      ] })
    ] }, t.name)) }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "ab-bar" }),
      "\u6F0F\u94B1\u6D1E\u5BDF\uFF08\u5168\u90E8\uFF09"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsx4("div", { className: "ab-card-b", children: !q.insights || q.insights.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "ab-sub", children: "\u6682\u65E0\u6D1E\u5BDF\u3002" }) : q.insights.map((i, idx) => /* @__PURE__ */ jsxs4("div", { className: `ab-insight ${i.level}`, children: [
      /* @__PURE__ */ jsx4("span", { className: "ic", children: i.level === "warn" ? "\u26A0\uFE0F" : i.level === "good" ? "\u{1F4B0}" : "\u{1F50D}" }),
      /* @__PURE__ */ jsx4("span", { className: "tx", children: i.text })
    ] }, `${i.code}-${idx}`)) }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "ab-bar" }),
      "\u53E3\u5F84\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ab-card", children: /* @__PURE__ */ jsxs4("div", { className: "ab-card-b ab-caliber", children: [
      "\u9519\u8BEF/\u91CD\u8BD5/TTFT/\u5DE5\u5177\u6765\u81EA ZCode \u7684 model_usage / tool_usage \u9065\u6D4B\u8868\uFF0C\u662F\u9010\u8BF7\u6C42\u7684\u771F\u5B9E\u8BB0\u5F55\uFF1B \u9650\u6D41\uFF08rate_limited\uFF09\u4E00\u822C\u4E0D\u4EA7\u751F\u8BA1\u8D39 token\uFF0C\u4F46\u4EA7\u751F\u771F\u5B9E\u7B49\u5F85\u65F6\u95F4\u3002",
      data.summary ? ` \u5F53\u524D\u7D2F\u8BA1 ${fmtTokens(data.summary.all.fin + data.summary.all.cr)} \u8F93\u5165 token \u4E2D\u6709 ${(data.summary.all.cr / Math.max(1e-9, data.summary.all.fin + data.summary.all.cr) * 100).toFixed(1)}% \u8D70\u4E86\u7F13\u5B58\u3002` : ""
    ] }) })
  ] });
}

// src/SettingsTab.tsx
import { useState } from "react";
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function PriceEditor({ data, ctx }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(data.prices)));
  const [dirty, setDirty] = useState(false);
  const [newModel, setNewModel] = useState("");
  const setField = (model, field, v) => {
    const next = { ...draft };
    const row = { ...next[model] || { in: 0, cacheRead: 0, cacheWrite: 0, out: 0 } };
    const n = Number(v);
    row[field] = v === "" ? 0 : Number.isFinite(n) ? n : row[field];
    next[model] = row;
    setDraft(next);
    setDirty(true);
  };
  const addModel = () => {
    const m = newModel.trim();
    if (!m || draft[m]) return;
    setDraft({ ...draft, [m]: { in: 0, cacheRead: 0, cacheWrite: 0, out: 0, preset: false, source: "manual" } });
    setNewModel("");
    setDirty(true);
  };
  const delModel = (m) => {
    const next = { ...draft };
    delete next[m];
    setDraft(next);
    setDirty(true);
  };
  const save = async () => {
    try {
      await ctx.refresh();
      const { savePrices: savePrices2 } = await Promise.resolve().then(() => (init_model(), model_exports));
      await savePrices2(draft);
      setDirty(false);
      ctx.showToast("\u4EF7\u76EE\u8868\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 30s \u5185\u70ED\u52A0\u8F7D\u5E76\u91CD\u7B97\uFF09", "good");
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : "\u4FDD\u5B58\u5931\u8D25", "bad");
    }
  };
  const unpricedModels = new Set((data.models || []).filter((m) => m.priced === 0 && m.model !== "(\u672A\u8BB0\u5F55)").map((m) => m.model));
  const rows = Object.entries(draft).sort((a, b) => {
    const ua = unpricedModels.has(a[0]) ? 0 : 1;
    const ub = unpricedModels.has(b[0]) ? 0 : 1;
    return ua - ub || a[0].localeCompare(b[0]);
  });
  return /* @__PURE__ */ jsx5("div", { className: "ab-card", children: /* @__PURE__ */ jsxs5("div", { className: "ab-card-b", children: [
    /* @__PURE__ */ jsxs5("div", { className: "ab-row", style: { marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx5("input", { className: "ab-inp", style: { flex: 1, minWidth: 120 }, placeholder: "\u65B0\u589E\u6A21\u578B\u540D\uFF08\u4E0E\u53F0\u8D26\u4E00\u81F4\uFF0C\u5982 sensenova-6.8-flash-lite\uFF09", value: newModel, onChange: (e) => setNewModel(e.target.value) }),
      /* @__PURE__ */ jsx5("button", { className: "ab-btn ghost sm", onClick: addModel, disabled: !newModel.trim(), children: "\uFF0B\u6DFB\u52A0" })
    ] }),
    /* @__PURE__ */ jsx5("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs5("table", { className: "ab-table", children: [
      /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs5("tr", { children: [
        /* @__PURE__ */ jsx5("th", { children: "\u6A21\u578B" }),
        /* @__PURE__ */ jsx5("th", { style: { width: 64 }, children: "\u8F93\u5165" }),
        /* @__PURE__ */ jsx5("th", { style: { width: 64 }, children: "\u7F13\u5B58\u8BFB" }),
        /* @__PURE__ */ jsx5("th", { style: { width: 64 }, children: "\u7F13\u5B58\u5199" }),
        /* @__PURE__ */ jsx5("th", { style: { width: 64 }, children: "\u8F93\u51FA" }),
        /* @__PURE__ */ jsx5("th", { style: { width: 30 } })
      ] }) }),
      /* @__PURE__ */ jsx5("tbody", { children: rows.map(([model, p]) => /* @__PURE__ */ jsxs5("tr", { children: [
        /* @__PURE__ */ jsxs5("td", { children: [
          model,
          unpricedModels.has(model) && /* @__PURE__ */ jsx5("span", { className: "ab-tag amber", style: { marginLeft: 4 }, children: "\u53F0\u8D26\u5728\u7528" }),
          p.preset && /* @__PURE__ */ jsx5("span", { className: "ab-tag", style: { marginLeft: 4 }, children: "\u9884\u8BBE" }),
          p.source === "litellm" && /* @__PURE__ */ jsx5("span", { className: "ab-tag green", style: { marginLeft: 4 }, children: "LiteLLM" })
        ] }),
        ["in", "cacheRead", "cacheWrite", "out"].map((f) => /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5(
          "input",
          {
            className: "ab-inp",
            style: { padding: "3px 6px", fontSize: 11, textAlign: "right" },
            value: String(p[f] ?? 0),
            onChange: (e) => setField(model, f, e.target.value),
            inputMode: "decimal"
          }
        ) }, f)),
        /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5("button", { className: "ab-btn danger sm", onClick: () => delModel(model), title: "\u5220\u9664\u8BE5\u4EF7\u76EE", children: "\u2715" }) })
      ] }, model)) })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-row", style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx5("button", { className: "ab-btn", onClick: save, disabled: !dirty, children: dirty ? "\u4FDD\u5B58\u4EF7\u76EE\u8868" : "\u5DF2\u4FDD\u5B58" }),
      /* @__PURE__ */ jsx5("span", { className: "ab-sub", children: "\u5355\u4F4D\uFF1AUSD / \u767E\u4E07 token\u3002\u9884\u8BBE\u503C\u4E3A\u5360\u4F4D\u724C\u4EF7\uFF0C\u8BF7\u6309\u4F60\u7684\u5B9E\u9645\u4F9B\u5E94\u5546\u8D26\u5355\u4FEE\u6B63\u3002" })
    ] })
  ] }) });
}
function SettingsTab({ ctx, busy, onCmd, onSaveSettings, defaults }) {
  const { data } = ctx;
  const s = data.settings;
  const meta = data.meta;
  const [fx, setFx] = useState(String(s.fxRate));
  const [autoMin, setAutoMin] = useState(String(s.autoRescanMin));
  const [sources, setSources] = useState({ ...s.sources });
  const persist = (nextSources, nextFx, nextAuto) => {
    onSaveSettings({ ...s, sources: nextSources, fxRate: nextFx, autoRescanMin: nextAuto });
  };
  const toggleSource = (key) => {
    const next = { ...sources, [key]: !sources[key] };
    setSources(next);
    persist(next, Number(fx) || defaults.fxRate, Number(autoMin) || defaults.autoRescanMin);
  };
  const applyNumbers = () => {
    persist(sources, Number(fx) || defaults.fxRate, Math.max(1, Number(autoMin) || defaults.autoRescanMin));
  };
  const srcInfo = (key) => {
    const st = meta && meta.sources && meta.sources[key];
    if (!st) return "\u672A\u626B\u63CF";
    if (key === "zcode") return `${st.ok === true ? "\u6B63\u5E38" : st.ok === false ? "\u5F02\u5E38" : "\u5F85\u626B"}${st.sqlite === false ? " \xB7 node:sqlite \u4E0D\u53EF\u7528" : ""}`;
    if (key === "claude") return `${st.ok === true ? "\u6B63\u5E38" : "\u5F85\u626B"} \xB7 ${st.files ?? 0} \u6587\u4EF6\uFF08\u672C\u8F6E\u89E3\u6790 ${st.scanned ?? 0}\uFF09`;
    return `${st.ok === true ? "\u6B63\u5E38" : "\u5F85\u626B"} \xB7 ${st.files ?? 0} \u4F1A\u8BDD\u6587\u4EF6\uFF08\u542B tokenUsage ${st.withTU ?? 0}\uFF09`;
  };
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "ab-bar" }),
      "\u4EF7\u76EE\u8868",
      /* @__PURE__ */ jsx5("small", { className: "ab-hint", children: "USD / \u767E\u4E07 token" })
    ] }),
    /* @__PURE__ */ jsx5(PriceEditor, { data, ctx }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "ab-bar" }),
      "\u6570\u636E\u6E90",
      /* @__PURE__ */ jsx5("small", { className: "ab-hint", children: "\u5168\u90E8\u53EA\u8BFB\uFF0C\u5173\u95ED\u53EA\u5F71\u54CD\u91C7\u96C6\u8303\u56F4" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ab-card", children: /* @__PURE__ */ jsx5("div", { className: "ab-card-b", children: ["zcode", "claude", "polaris"].map((key) => /* @__PURE__ */ jsxs5("div", { className: "ab-insight info", children: [
      /* @__PURE__ */ jsx5("span", { className: "ic", children: /* @__PURE__ */ jsx5(
        "button",
        {
          className: `ab-btn sm ${sources[key] ? "" : "ghost"}`,
          style: sources[key] ? { background: "#2b4a35" } : {},
          onClick: () => toggleSource(key),
          children: sources[key] ? "\u5F00" : "\u5173"
        }
      ) }),
      /* @__PURE__ */ jsxs5("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx5("b", { style: { fontSize: 12 }, children: key }),
        /* @__PURE__ */ jsx5("small", { style: { display: "block", color: "#5C6678", fontSize: 10.5 }, children: srcInfo(key) })
      ] })
    ] }, key)) }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "ab-bar" }),
      "\u663E\u793A\u4E0E\u8282\u594F"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ab-card", children: /* @__PURE__ */ jsxs5("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsx5("label", { className: "ab-lbl", children: "\u6C47\u7387 USD\u2192CNY\uFF08\u4EC5\u663E\u793A\u6298\u7B97\uFF09" }),
      /* @__PURE__ */ jsxs5("div", { className: "ab-row", children: [
        /* @__PURE__ */ jsx5("input", { className: "ab-inp", style: { width: 100 }, value: fx, onChange: (e) => setFx(e.target.value), inputMode: "decimal" }),
        /* @__PURE__ */ jsx5("button", { className: "ab-btn ghost sm", onClick: applyNumbers, children: "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ jsx5("label", { className: "ab-lbl", children: "\u81EA\u52A8\u589E\u91CF\u626B\u63CF\u95F4\u9694\uFF08\u5206\u949F\uFF09" }),
      /* @__PURE__ */ jsxs5("div", { className: "ab-row", children: [
        /* @__PURE__ */ jsx5("input", { className: "ab-inp", style: { width: 100 }, value: autoMin, onChange: (e) => setAutoMin(e.target.value), inputMode: "numeric" }),
        /* @__PURE__ */ jsx5("button", { className: "ab-btn ghost sm", onClick: applyNumbers, children: "\u4FDD\u5B58" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "ab-bar" }),
      "\u64CD\u4F5C"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ab-card", children: /* @__PURE__ */ jsxs5("div", { className: "ab-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ab-row", children: [
        /* @__PURE__ */ jsx5("button", { className: "ab-btn ghost", disabled: !!busy, onClick: () => onCmd("rescan", 18e4, "\u5168\u91CF\u91CD\u626B\uFF08\u9996\u6B21\u8F83\u6162\uFF09"), children: busy === "rescan" ? "\u91CD\u626B\u4E2D\u2026" : "\u7ACB\u5373\u5168\u91CF\u91CD\u626B" }),
        /* @__PURE__ */ jsx5("button", { className: "ab-btn ghost", disabled: !!busy, onClick: () => onCmd("sync_prices", 6e4, "\u540C\u6B65 LiteLLM \u4EF7\u76EE"), children: busy === "sync_prices" ? "\u540C\u6B65\u4E2D\u2026" : "\u4ECE LiteLLM \u540C\u6B65\u4EF7\u76EE" })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "ab-sub", style: { marginTop: 8 }, children: "\u540C\u6B65\u53EA\u9488\u5BF9\u4F60\u53F0\u8D26\u4E2D\u51FA\u73B0\u8FC7\u7684\u6A21\u578B\uFF0C\u6309\u5176\u516C\u5F00\u4EF7\u76EE\uFF08USD\uFF09\u8986\u76D6\u5BF9\u5E94\u884C\uFF1B\u4E0D\u4F1A\u628A\u6574\u5F20\u793E\u533A\u4EF7\u76EE\u8868\u704C\u8FDB\u6765\u3002 \u8FD9\u662F\u672C\u63D2\u4EF6\u552F\u4E00\u7684\u5916\u7F51\u8BF7\u6C42\uFF08\u670D\u52A1\u8FDB\u7A0B\u53D1\u8D77\u3001\u4EC5\u9650\u914D\u7F6E\u7684 https \u516C\u7F51 URL\uFF09\u3002" }),
      meta && meta.lastError ? /* @__PURE__ */ jsxs5("div", { className: "ab-sub", style: { color: "#FF8A9A", marginTop: 6 }, children: [
        "\u6700\u8FD1\u5F02\u5E38\uFF1A",
        meta.lastError
      ] }) : null
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ab-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "ab-bar" }),
      "\u53E3\u5F84\u8BF4\u660E\uFF08\u4E3A\u4EC0\u4E48\u4E24\u8FB9\u7684\u300C\u8F93\u5165\u300D\u4E0D\u4E00\u6837\uFF09"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ab-card", children: /* @__PURE__ */ jsxs5("div", { className: "ab-card-b ab-caliber", children: [
      "\u4E09\u79CD\u6765\u6E90\u7684 input_tokens \u8BED\u4E49\u4E0D\u540C\uFF0CAI \u7528\u91CF\u8D26\u5728\u8BA1\u4EF7\u524D\u5DF2\u663E\u5F0F\u5F52\u4E00\uFF08\u8BE6\u89C1 plans spec \u4E0E README\uFF09\uFF1A",
      /* @__PURE__ */ jsx5("br", {}),
      "\u2022 ",
      /* @__PURE__ */ jsx5("code", { children: "zcode" }),
      "\uFF1Ainput ",
      /* @__PURE__ */ jsx5("b", { children: "\u542B" }),
      "\u7F13\u5B58\u8BFB/\u5199 \u2192 \u5168\u4EF7\u8F93\u5165 = input \u2212 cacheRead \u2212 cacheWrite",
      /* @__PURE__ */ jsx5("br", {}),
      "\u2022 ",
      /* @__PURE__ */ jsx5("code", { children: "claude" }),
      "\uFF1Ainput ",
      /* @__PURE__ */ jsx5("b", { children: "\u4E0D\u542B" }),
      "\u7F13\u5B58\uFF08Anthropic API \u60EF\u4F8B\uFF09\u2192 \u5168\u4EF7\u8F93\u5165 = input",
      /* @__PURE__ */ jsx5("br", {}),
      "\u2022 ",
      /* @__PURE__ */ jsx5("code", { children: "polaris" }),
      "\uFF1Ainput ",
      /* @__PURE__ */ jsx5("b", { children: "\u4E0D\u542B" }),
      "\u7F13\u5B58\uFF08\u5BBF\u4E3B\u7F51\u5173\u8BED\u4E49\uFF09\uFF0CcostUsd \u76F4\u63A5\u91C7\u7528\u5BBF\u4E3B\u7F51\u5173\u7ED3\u7B97\u503C",
      meta && meta.caliber ? /* @__PURE__ */ jsxs5(Fragment3, { children: [
        /* @__PURE__ */ jsx5("br", {}),
        Object.entries(meta.caliber).map(([k, v]) => /* @__PURE__ */ jsxs5("span", { style: { display: "block", marginTop: 4 }, children: [
          /* @__PURE__ */ jsx5("code", { children: k }),
          " ",
          v
        ] }, k))
      ] }) : null
    ] }) })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment4, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.ab-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ab-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ab-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ab-body::-webkit-scrollbar{width:9px;height:9px}
.ab-body::-webkit-scrollbar-track{background:transparent}
.ab-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ab-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ab-headrow{display:flex;align-items:center;gap:10px}
.ab-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#F2C063,#D29922);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ab-tt{flex:1;min-width:0}
.ab-tt b{font-size:15px;display:block}
.ab-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-status{display:flex;gap:6px;align-items:center}
.ab-dot{width:7px;height:7px;border-radius:50%}
.ab-dot.ok{background:#3FB950}
.ab-dot.bad{background:#F85149}
.ab-dot.idle{background:#4d5566}
.ab-tabs{display:flex;gap:4px;margin-top:9px}
.ab-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.ab-tab:hover{color:#E6EAF2}
.ab-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ab-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ab-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F2C063,#D29922);flex-shrink:0}
.ab-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ab-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ab-card-b{padding:11px 13px}
.ab-statrow{display:flex;gap:8px;margin-bottom:8px}
.ab-stat{flex:1;background:#12151c;border:1px solid #222936;border-radius:10px;padding:9px 8px;text-align:center;min-width:0}
.ab-stat b{display:block;font-size:16px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-stat small{color:#5C6678;font-size:9.5px;display:block;margin-top:1px}
.ab-stat .gold{color:#F2C063}
.ab-stat .green{color:#7EE2A0}
.ab-stat .blue{color:#9EC4FF}
.ab-stat .red{color:#FF8A9A}
.ab-stat .amber{color:#F2C063}
.ab-stat .muted{color:#8B95A7}
.ab-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ab-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ab-table{width:100%;border-collapse:collapse;font-size:11.5px}
.ab-table th{color:#5C6678;font-weight:600;text-align:left;padding:4px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
.ab-table td{padding:6px 8px;border-bottom:1px solid #1d2330;vertical-align:middle;white-space:nowrap}
.ab-table tr:hover td{background:rgba(242,192,99,.04)}
.ab-num{font-variant-numeric:tabular-nums;text-align:right}
.ab-tag{display:inline-block;background:#1C2330;border-radius:5px;color:#8B95A7;font-size:9.5px;padding:1px 6px;margin-right:4px}
.ab-tag.gold{color:#F2C063}
.ab-tag.green{color:#7EE2A0}
.ab-tag.red{color:#FF8A9A}
.ab-tag.amber{color:#F2C063}
.ab-hitbar{width:52px;height:5px;background:#222936;border-radius:3px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:5px}
.ab-hitbar i{display:block;height:100%;background:linear-gradient(90deg,#D29922,#7EE2A0)}
.ab-insight{display:flex;gap:8px;padding:8px 2px;border-top:1px solid #1d2330;font-size:11.5px;line-height:1.55}
.ab-insight:first-child{border-top:none}
.ab-insight .ic{flex-shrink:0;font-size:13px}
.ab-insight.warn .tx{color:#F2C063}
.ab-insight.good .tx{color:#7EE2A0}
.ab-insight.info .tx{color:#C9D4E8}
.ab-btn{background:#8a6a1f;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.ab-btn:hover{filter:brightness(1.12)}
.ab-btn:disabled{opacity:.45;cursor:not-allowed}
.ab-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ab-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ab-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ab-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;width:100%;min-width:0}
.ab-inp:focus{outline:none;border-color:#8a6a1f}
.ab-inp::placeholder{color:#4d5566}
.ab-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.ab-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ab-toast.bad{border-color:#54262c;color:#FF8A9A}
.ab-toast.good{border-color:#2b4a35;color:#7EE2A0}
.ab-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ab-legend{display:flex;gap:12px;font-size:10px;color:#8B95A7;flex-wrap:wrap}
.ab-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}
.ab-caliber{font-size:10.5px;color:#8B95A7;line-height:1.7;padding:2px 0}
.ab-caliber code{background:#12151c;border:1px solid #222936;border-radius:5px;padding:0 5px;color:#C9D4E8}
`;
var TABS = [
  { id: "overview", label: "\u603B\u89C8" },
  { id: "models", label: "\u6A21\u578B" },
  { id: "projects", label: "\u9879\u76EE" },
  { id: "quality", label: "\u8D28\u91CF" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function srcDot(ok) {
  if (ok === true) return /* @__PURE__ */ jsx6("span", { className: "ab-dot ok", title: "\u6B63\u5E38" });
  if (ok === false) return /* @__PURE__ */ jsx6("span", { className: "ab-dot bad", title: "\u5F02\u5E38" });
  return /* @__PURE__ */ jsx6("span", { className: "ab-dot idle", title: "\u672A\u626B\u63CF" });
}
function AbacusPanel(_props) {
  const [tab, setTab] = useState2("overview");
  const [data, setData] = useState2(null);
  const [loadErr, setLoadErr] = useState2("");
  const [toast, setToast] = useState2(null);
  const [busy, setBusy] = useState2("");
  const toastTimer = useRef(null);
  const showToast = useCallback((text, kind = "") => {
    setToast({ text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const d = await loadPanelData();
      setData(d);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 1e4);
    return () => window.clearInterval(t);
  }, [refresh]);
  const onSaveSettings = useCallback(async (s) => {
    try {
      await saveSettings(s);
      await refresh();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 30s \u5185\u70ED\u52A0\u8F7D\uFF09", "good");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "\u4FDD\u5B58\u5931\u8D25", "bad");
    }
  }, [refresh, showToast]);
  const onCmd = useCallback(async (op, waitMs, doing) => {
    if (busy) return;
    setBusy(op);
    showToast(`${doing}\u2026`);
    try {
      const r = await sendCmd(op, waitMs);
      if (r && r.ok === true) {
        showToast(`${doing}\u5B8C\u6210`, "good");
      } else {
        showToast(`${doing}\u5931\u8D25\uFF1A${r && r.error || "\u672A\u77E5\u9519\u8BEF"}`, "bad");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : `${doing}\u5931\u8D25`, "bad");
    } finally {
      setBusy("");
      await refresh();
    }
  }, [busy, refresh, showToast]);
  const meta = data && data.meta;
  const statusLine = meta ? `\u53F0\u8D26 ${meta.entries ?? 0} \u6761 \uFF5C \u4E0A\u6B21\u626B\u63CF ${meta.lastScanAt ? new Date(meta.lastScanAt).toLocaleTimeString() : "\u2014"}${meta.scanning ? " \uFF5C \u626B\u63CF\u4E2D\u2026" : ""}` : "\u7B49\u5F85\u540E\u53F0\u670D\u52A1\u9996\u6B21\u626B\u63CF\uFF08\u7EA6 1 \u5206\u949F\uFF09\u2026";
  return /* @__PURE__ */ jsxs6("div", { className: "ab-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "ab-top", children: [
      /* @__PURE__ */ jsxs6("div", { className: "ab-headrow", children: [
        /* @__PURE__ */ jsx6("div", { className: "ab-logo", children: "\u{1F9EE}" }),
        /* @__PURE__ */ jsxs6("div", { className: "ab-tt", children: [
          /* @__PURE__ */ jsx6("b", { children: "AI \u7528\u91CF\u8D26 \xB7 AI \u82B1\u9500\u8D26\u623F" }),
          /* @__PURE__ */ jsx6("small", { children: loadErr ? `\u52A0\u8F7D\u5931\u8D25\uFF1A${loadErr}` : statusLine })
        ] }),
        /* @__PURE__ */ jsx6("div", { className: "ab-status", children: meta && meta.sources ? /* @__PURE__ */ jsxs6(Fragment4, { children: [
          srcDot(meta.sources.zcode && meta.sources.zcode.ok),
          srcDot(meta.sources.claude && meta.sources.claude.ok),
          srcDot(meta.sources.polaris && meta.sources.polaris.ok)
        ] }) : null })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "ab-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx6("button", { className: `ab-tab${tab === t.id ? " on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "ab-body", children: !data ? /* @__PURE__ */ jsx6("div", { className: "ab-empty", children: loadErr || "\u6B63\u5728\u8BFB\u53D6\u53F0\u8D26\u2026" }) : /* @__PURE__ */ (() => {
      const ctx = { data, refresh, showToast };
      return /* @__PURE__ */ jsxs6(Fragment4, { children: [
        tab === "overview" && /* @__PURE__ */ jsx6(OverviewTab, { ctx }),
        tab === "models" && /* @__PURE__ */ jsx6(ModelsTab, { ctx }),
        tab === "projects" && /* @__PURE__ */ jsx6(ProjectsTab, { ctx }),
        tab === "quality" && /* @__PURE__ */ jsx6(QualityTab, { ctx }),
        tab === "settings" && /* @__PURE__ */ jsx6(
          SettingsTab,
          {
            ctx,
            busy,
            onCmd,
            onSaveSettings,
            defaults: DEFAULT_SETTINGS2
          }
        )
      ] });
    })() }),
    toast && /* @__PURE__ */ jsx6("div", { className: `ab-toast ${toast.kind}`, children: toast.text })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function AbacusEntry(props) {
  return /* @__PURE__ */ jsx7(AbacusPanel, { ...props });
}
export {
  AbacusEntry as default
};
