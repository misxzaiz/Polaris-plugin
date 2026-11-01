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
    var KV_PREVIEW_CAP = 8 * 1024;
    var REQ_BODY_CAP = 2 * 1024 * 1024;
    var ROUTE_BODY_CAP = 16 * 1024;
    var MAX_ROUTES = 100;
    var MAX_ROUTE_HEADERS = 10;
    var DELAY_MAX_MS = 60 * 1e3;
    var HISTORY_CAP = 500;
    var PATH_CAP = 512;
    var HIST_CHUNKS_KEEP = 12;
    var RESERVED_PREFIX = "/__";
    var METHODS2 = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY"];
    var SENSITIVE_HEADER_RE = /(authorization|cookie|token|secret|signature|sign|key|password|session)/i;
    function newId() {
      return `${Date.now().toString(36)}-${randomHex(5)}`;
    }
    function isValidRouteId(s) {
      return typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,47}$/.test(s);
    }
    function parsePathPattern(raw) {
      const t = String(raw == null ? "" : raw).trim();
      if (!t) return { ok: false, error: "\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A" };
      if (!t.startsWith("/")) return { ok: false, error: "\u8DEF\u5F84\u5FC5\u987B\u4EE5 / \u5F00\u5934" };
      if (t.length > PATH_CAP) return { ok: false, error: `\u8DEF\u5F84\u8FC7\u957F\uFF08>${PATH_CAP}\uFF09` };
      if (t.startsWith(RESERVED_PREFIX)) return { ok: false, error: `${RESERVED_PREFIX} \u524D\u7F00\u4E3A\u7CFB\u7EDF\u4FDD\u7559\uFF0C\u4E0D\u80FD\u6CE8\u518C` };
      if (/\/{2,}/.test(t)) return { ok: false, error: "\u8DEF\u5F84\u4E0D\u80FD\u5305\u542B\u8FDE\u7EED\u659C\u6760" };
      if (/\?|#/.test(t)) return { ok: false, error: "\u8DEF\u5F84\u4E0D\u542B query/fragment\uFF08query \u5339\u914D\u8BF7\u7559\u7A7A\uFF0C\u5386\u53F2\u91CC\u770B\uFF09" };
      const parts = t.split("/").slice(1).filter((p) => p !== "");
      if (parts.length > 20) return { ok: false, error: "\u8DEF\u5F84\u6BB5\u6570\u8FC7\u591A\uFF08>20\uFF09" };
      const segments = [];
      const paramNames = [];
      let score = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p === "*" || p.startsWith("*")) {
          if (i !== parts.length - 1) return { ok: false, error: "* \u901A\u914D\u6BB5\u53EA\u80FD\u5728\u672B\u5C3E" };
          segments.push({ type: "splat", value: p.slice(1) || "rest" });
          score += 1;
        } else if (p.startsWith(":")) {
          const name = p.slice(1);
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return { ok: false, error: `\u975E\u6CD5\u53C2\u6570\u540D: :${name}\uFF08\u987B\u4E3A\u6807\u8BC6\u7B26\uFF09` };
          segments.push({ type: "param", value: name });
          paramNames.push(name);
          score += 2;
        } else {
          if (p.length > 200) return { ok: false, error: "\u8DEF\u5F84\u6BB5\u8FC7\u957F" };
          segments.push({ type: "static", value: p.toLowerCase() });
          score += 3;
        }
      }
      return { ok: true, segments, score, paramNames };
    }
    function matchPattern(segments, pathname) {
      const parts = pathname.split("/").slice(1).filter((p) => p !== "");
      const params = {};
      let si = 0;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.type === "splat") {
          params[seg.value] = parts.slice(i).map((p) => safeDecode(p)).join("/");
          return { ok: true, params };
        }
        if (i >= parts.length) return null;
        if (seg.type === "static") {
          if (parts[i].toLowerCase() !== seg.value) return null;
        } else {
          const dec = safeDecode(parts[i]);
          if (!dec) return null;
          if (!Object.prototype.hasOwnProperty.call(params, seg.value)) params[seg.value] = dec;
        }
        si = i + 1;
      }
      if (si !== parts.length) return null;
      return { ok: true, params };
    }
    function safeDecode(s) {
      try {
        const d = decodeURIComponent(s);
        return d;
      } catch (_) {
        return "";
      }
    }
    function findMatch(routes, method, pathname) {
      let best = null;
      for (const r of routes) {
        if (!r || !r.enabled) continue;
        if (r.method !== "ANY" && r.method !== method) continue;
        const m = matchPattern(r._segments || [], pathname);
        if (!m) continue;
        const score = (r._score || 0) * 2 + (r.method === method ? 1 : 0);
        if (!best || score > best.score || score === best.score && (r.createdAt < best.route.createdAt || r.createdAt === best.route.createdAt && r.id < best.route.id)) {
          best = { route: r, params: m.params, score };
        }
      }
      return best;
    }
    function sanitizeName(s, fallback) {
      const t = String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim().slice(0, 30);
      return t || fallback;
    }
    function clampInt(v, lo, hi, dflt) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return dflt;
      return Math.min(Math.max(Math.round(n), lo), hi);
    }
    function normalizeRoute(input2, { partial } = {}) {
      if (!input2 || typeof input2 !== "object") return { ok: false, error: "\u8DEF\u7531\u5FC5\u987B\u662F\u5BF9\u8C61" };
      const route = partial && input2.id && isValidRouteId(input2.id) ? { id: input2.id } : {};
      route.method = normalizeMethod(input2.method);
      const pp = parsePathPattern(input2.path);
      if (!pp.ok) return { ok: false, error: pp.error };
      route.path = String(input2.path).trim();
      route._segments = pp.segments;
      route._score = pp.score;
      route.status = clampInt(input2.status, 100, 599, 200);
      route.bodyType = ["json", "text", "empty"].includes(input2.bodyType) ? input2.bodyType : "json";
      route.body = typeof input2.body === "string" ? input2.body.slice(0, ROUTE_BODY_CAP) : "";
      route.delayMs = clampInt(input2.delayMs, 0, DELAY_MAX_MS, 0);
      route.errorRate = clampInt(input2.errorRate, 0, 100, 0);
      route.errorStatus = clampInt(input2.errorStatus, 400, 599, 500);
      route.enabled = input2.enabled === false ? false : true;
      route.builtin = input2.builtin === true;
      const headers = {};
      let hwarn = "";
      if (input2.headers && typeof input2.headers === "object") {
        const entries = Object.entries(input2.headers).filter(([k]) => /^[a-zA-Z0-9-_]{1,64}$/.test(k) && !/^content-type$/i.test(k));
        for (const [k, v] of entries.slice(0, MAX_ROUTE_HEADERS)) {
          const val = String(v == null ? "" : v);
          if (/[\r\n]/.test(val)) {
            hwarn = `\u54CD\u5E94\u5934 ${k} \u542B\u6362\u884C\u5DF2\u4E22\u5F03`;
            continue;
          }
          headers[k] = val.slice(0, 1024);
        }
        if (entries.length > MAX_ROUTE_HEADERS) hwarn = hwarn || `\u81EA\u5B9A\u4E49\u5934\u8D85\u8FC7 ${MAX_ROUTE_HEADERS} \u4E2A\u5DF2\u622A\u65AD`;
      }
      route.headers = headers;
      const warnings = hwarn ? [hwarn] : [];
      route.name = sanitizeName(input2.name, route.path.slice(0, 30) || route.id || "\u672A\u547D\u540D\u8DEF\u7531");
      if (!partial) {
        if (input2.id !== void 0 && input2.id !== null && input2.id !== "") {
          if (!isValidRouteId(input2.id)) return { ok: false, error: `\u975E\u6CD5\u8DEF\u7531 id: ${input2.id}` };
          route.id = String(input2.id);
        } else {
          route.id = newId();
        }
      }
      route.createdAt = Number(input2.createdAt) || 0;
      route.updatedAt = Number(input2.updatedAt) || Date.now();
      return { ok: true, route, warnings };
    }
    function normalizeMethod(m) {
      const t = String(m == null ? "GET" : m).toUpperCase().trim();
      return METHODS2.includes(t) ? t : "GET";
    }
    function DEFAULT_SETTINGS() {
      return {
        version: 1,
        routes: [],
        cors: { mode: "echo" },
        // echo | star | off
        fallback: { enabled: false, status: 200, bodyType: "json", body: "{}" },
        updatedAt: 0
      };
    }
    function normalizeSettings(raw) {
      const s = DEFAULT_SETTINGS();
      if (!raw || typeof raw !== "object") return { ...s, routes: [] };
      const out = { ...s };
      if (raw.cors && ["echo", "star", "off"].includes(raw.cors.mode)) out.cors = { mode: raw.cors.mode };
      if (raw.fallback && typeof raw.fallback === "object") {
        const f = raw.fallback;
        out.fallback = {
          enabled: f.enabled === true,
          status: clampInt(f.status, 100, 599, 200),
          bodyType: ["json", "text", "empty"].includes(f.bodyType) ? f.bodyType : "json",
          body: typeof f.body === "string" ? f.body.slice(0, ROUTE_BODY_CAP) : "{}"
        };
      }
      if (Array.isArray(raw.routes)) {
        const seen = /* @__PURE__ */ new Set();
        const routes = [];
        const warnings = [];
        for (const r of raw.routes.slice(0, MAX_ROUTES)) {
          const n = normalizeRoute(r);
          if (!n.ok) {
            warnings.push(`\u8DEF\u7531\u88AB\u5254\u9664: ${n.error}`);
            continue;
          }
          if (seen.has(n.route.id)) {
            warnings.push(`\u91CD\u590D id \u5254\u9664: ${n.route.id}`);
            continue;
          }
          seen.add(n.route.id);
          routes.push(n.route);
        }
        if (raw.routes.length > MAX_ROUTES) warnings.push(`\u8DEF\u7531\u8D85\u8FC7 ${MAX_ROUTES} \u6761\u5DF2\u622A\u65AD`);
        out.routes = routes;
        if (warnings.length) out.warnings = warnings;
      }
      out.updatedAt = Number(raw.updatedAt) || 0;
      return out;
    }
    function bootstrapSettings(raw) {
      const now = Date.now();
      const demo = [
        {
          id: "demo-users",
          name: "\u793A\u4F8B\xB7\u7528\u6237\u5217\u8868",
          method: "GET",
          path: "/mockdemo/users",
          status: 200,
          bodyType: "json",
          enabled: true,
          builtin: true,
          createdAt: now,
          updatedAt: now,
          headers: {},
          delayMs: 0,
          errorRate: 0,
          errorStatus: 500,
          body: '{"code":0,"data":[{"id":{{int 1,99}},"name":"{{cname}}","email":"{{email}}","vip":{{bool}}}],"total":42}'
        },
        {
          id: "demo-user",
          name: "\u793A\u4F8B\xB7\u7528\u6237\u8BE6\u60C5",
          method: "GET",
          path: "/mockdemo/users/:id",
          status: 200,
          bodyType: "json",
          enabled: true,
          builtin: true,
          createdAt: now + 1,
          updatedAt: now + 1,
          headers: {},
          delayMs: 0,
          errorRate: 0,
          errorStatus: 500,
          body: '{"code":0,"data":{"id":"{{req.path.id}}","name":"{{cname}}","city":"{{city}}","bio":"{{csentence 10,20}}"}}'
        }
      ];
      if (raw && typeof raw === "object" && Array.isArray(raw.routes)) return normalizeSettings(raw);
      return { ...normalizeSettings(null), routes: demo.map((r) => normalizeRoute(r).route), updatedAt: now };
    }
    function upsertRoute(routes, route) {
      const i = routes.findIndex((r) => r.id === route.id);
      if (i >= 0) {
        const next = routes.slice();
        next[i] = { ...route, createdAt: routes[i].createdAt || route.createdAt };
        return { ok: true, routes: next, updated: true };
      }
      if (routes.length >= MAX_ROUTES) return { ok: false, error: `\u8DEF\u7531\u5DF2\u8FBE\u4E0A\u9650 ${MAX_ROUTES} \u6761\uFF08\u5148\u5220\u4E00\u4E9B\uFF09` };
      return { ok: true, routes: [...routes, route], updated: false };
    }
    function removeRoute(routes, id) {
      const next = routes.filter((r) => r.id !== id);
      return { ok: next.length !== routes.length, routes: next };
    }
    var CN_SURNAMES = "\u738B\u674E\u5F20\u5218\u9648\u6768\u9EC4\u8D75\u5434\u5468\u5F90\u5B59\u9A6C\u6731\u80E1\u90ED\u4F55\u6797\u7F57\u90D1\u6881\u8C22\u5B8B\u5510\u8BB8\u97E9\u51AF\u9093\u66F9\u5F6D".split("");
    var CN_GIVENS = ["\u4F1F", "\u82B3", "\u5A1C", "\u654F", "\u9759", "\u78CA", "\u519B", "\u6D0B", "\u52C7", "\u8273", "\u6770", "\u6D9B", "\u660E", "\u8D85", "\u79C0\u82F1", "\u971E", "\u5E73", "\u521A", "\u6842\u82F1", "\u6587\u8F69", "\u96E8\u6B23", "\u5B50\u6DB5", "\u6D69\u7136", "\u6B23\u6021", "\u6893\u8431", "\u535A\u6587", "\u601D\u8FDC", "\u6653\u5F64", "\u5609\u61FF", "\u715C\u57CE"];
    var CN_CITIES = ["\u5317\u4EAC", "\u4E0A\u6D77", "\u5E7F\u5DDE", "\u6DF1\u5733", "\u676D\u5DDE", "\u6210\u90FD", "\u6B66\u6C49", "\u5357\u4EAC", "\u897F\u5B89", "\u91CD\u5E86", "\u82CF\u5DDE", "\u5929\u6D25", "\u957F\u6C99", "\u90D1\u5DDE", "\u9752\u5C9B", "\u5408\u80A5", "\u798F\u5DDE", "\u53A6\u95E8", "\u6606\u660E", "\u5927\u8FDE"];
    var CN_TITLE_WORDS = ["\u4EA7\u54C1\u8BBE\u8BA1", "\u7528\u6237\u4F53\u9A8C", "\u6570\u636E\u4E2D\u53F0", "\u667A\u80FD\u63A8\u8350", "\u589E\u957F\u7B56\u7565", "\u5FAE\u670D\u52A1", "\u5206\u5E03\u5F0F", "\u654F\u6377\u5F00\u53D1", "\u8D28\u91CF\u4FDD\u969C", "\u77E5\u8BC6\u56FE\u8C31", "\u534F\u540C\u529E\u516C", "\u5F00\u653E\u5E73\u53F0", "\u4E91\u539F\u751F", "\u4F4E\u4EE3\u7801", "\u5B9E\u65F6\u8BA1\u7B97"];
    var EN_WORDS = ["lorem", "ipsum", "delta", "signal", "vector", "matrix", "photon", "quantum", "nexus", "pixel", "stream", "spark", "cloud", "vector", "orbit", "prime", "shift", "trace", "echo", "flux"];
    function mulberry32(seed) {
      let a = seed >>> 0;
      return function() {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function pickOf(rng, arr) {
      return arr[Math.floor(rng() * arr.length) % arr.length];
    }
    function renderGenerator(expr, ctx) {
      const { rng, counter, now } = ctx;
      const t = expr.trim();
      if (!t) return null;
      if (t.startsWith("req.")) {
        const sub = t.slice(4);
        const m = /^(path|query|header|body)\.(.+)$/.exec(sub);
        if (!m) return null;
        const [, scope, keyRaw] = m;
        const key = keyRaw.trim();
        if (!key) return null;
        const src = ctx.req ? scope === "header" ? ctx.req.headers : ctx.req[scope] : null;
        if (!src) return "";
        if (scope === "header") {
          const hit = Object.keys(src).find((k) => k.toLowerCase() === key.toLowerCase());
          return hit ? String(src[hit]) : "";
        }
        if (scope === "body") {
          let cur = src;
          for (const k of key.split(".")) {
            if (cur == null || typeof cur !== "object") {
              cur = void 0;
              break;
            }
            cur = cur[k];
          }
          if (cur === void 0 || cur === null) return "";
          return typeof cur === "object" ? JSON.stringify(cur) : String(cur);
        }
        const v = src[key];
        return v === void 0 ? "" : String(v);
      }
      const sp = t.indexOf(" ");
      const name = (sp === -1 ? t : t.slice(0, sp)).toLowerCase();
      const rest = sp === -1 ? "" : t.slice(sp + 1).trim();
      const nums = () => rest.split(",").map((x) => parseFloat(x.trim()));
      switch (name) {
        case "uuid":
        case "guid": {
          const h = () => Math.floor(rng() * 16).toString(16);
          return `${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}`;
        }
        case "int": {
          const [a, b] = rest ? nums() : [0, 100];
          const lo = Math.ceil(Math.min(a, b));
          const hi = Math.floor(Math.max(a, b));
          return String(lo + Math.floor(rng() * (hi - lo + 1)));
        }
        case "float": {
          const p = rest ? nums() : [0, 1, 2];
          const d = Math.min(Math.max(Math.round(p[2] || 2), 0), 8);
          const lo = Math.min(p[0], p[1]);
          const hi = Math.max(p[0], p[1]);
          return (lo + rng() * (hi - lo)).toFixed(d);
        }
        case "bool":
          return rng() < 0.5 ? "true" : "false";
        case "counter":
          return String(counter.n = (counter.n || 0) + 1);
        case "cname":
          return pickOf(rng, CN_SURNAMES) + pickOf(rng, CN_GIVENS);
        case "name":
          return `${pickOf(rng, EN_WORDS).replace(/^./, (c) => c.toUpperCase())} ${pickOf(rng, EN_WORDS).replace(/^./, (c) => c.toUpperCase())}`;
        case "email":
          return `${pickOf(rng, EN_WORDS)}${Math.floor(rng() * 900 + 100)}@example.com`;
        case "phone":
          return `1${pickOf(rng, ["3", "5", "7", "8", "9"])}${String(Math.floor(rng() * 1e9)).padStart(9, "0")}`;
        case "city":
          return pickOf(rng, CN_CITIES);
        case "ctitle": {
          const n = rest ? Math.min(Math.max(parseInt(rest, 10) || 12, 4), 40) : 12;
          let out = pickOf(rng, CN_TITLE_WORDS);
          while (out.length < n) out += pickOf(rng, CN_TITLE_WORDS);
          return out.slice(0, n);
        }
        case "csentence": {
          const [a, b] = rest ? nums() : [10, 20];
          const n = Math.floor(a + rng() * (Math.max(a, b) - Math.min(a, b) + 1));
          let out = "";
          while (out.length < n) out += pickOf(rng, CN_TITLE_WORDS);
          return `${out.slice(0, n)}\u3002`;
        }
        case "cparagraph": {
          const n = rest ? Math.min(Math.max(parseInt(rest, 10) || 3, 1), 10) : 3;
          const out = [];
          for (let i = 0; i < n; i++) out.push(renderGenerator("csentence 12,24", ctx));
          return out.join("");
        }
        case "word":
          return pickOf(rng, EN_WORDS);
        case "sentence": {
          const [a, b] = rest ? nums() : [6, 14];
          const n = Math.floor(a + rng() * (Math.max(a, b) - Math.min(a, b) + 1));
          const out = [];
          for (let i = 0; i < n; i++) out.push(pickOf(rng, EN_WORDS));
          return `${out.join(" ")}.`;
        }
        case "paragraph": {
          const n = rest ? Math.min(Math.max(parseInt(rest, 10) || 3, 1), 10) : 3;
          const out = [];
          for (let i = 0; i < n; i++) out.push(renderGenerator("sentence 8,16", ctx));
          return out.join(" ");
        }
        case "url":
          return `https://example.com/${pickOf(rng, EN_WORDS)}/${Math.floor(rng() * 9e3 + 1e3)}`;
        case "ip":
          return `${Math.floor(rng() * 223 + 1)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 254 + 1)}`;
        case "color":
          return `#${Math.floor(rng() * 16777215).toString(16).padStart(6, "0")}`;
        case "date":
          return new Date(now).toISOString().slice(0, 10);
        case "datetime":
          return new Date(now).toISOString();
        case "timestamp":
          return String(now);
        case "daterange": {
          const [a, b] = rest ? nums() : [-30, 0];
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const off = Math.floor(lo + rng() * (hi - lo + 1));
          return new Date(now + off * 864e5).toISOString().slice(0, 10);
        }
        case "pick": {
          const opts = rest.split("|").map((x) => x.trim()).filter((x) => x !== "");
          return opts.length ? pickOf(rng, opts) : "";
        }
        default:
          return null;
      }
    }
    var TEMPLATE_RE = /\{\{([^{}]*)\}\}/g;
    function renderTemplate(tpl, ctx) {
      const warnings = [];
      const text = String(tpl == null ? "" : tpl).replace(/\\\{\{/g, "\0ESC\0").replace(TEMPLATE_RE, (_, expr) => {
        const v = renderGenerator(expr, ctx);
        if (v === null) {
          warnings.push(`\u672A\u8BC6\u522B\u7684\u6A21\u677F\u8868\u8FBE\u5F0F: {{${expr.trim()}}}\uFF08\u6309\u5B57\u9762\u4FDD\u7559\uFF09`);
          return `{{${expr}}}`;
        }
        return v;
      }).replace(/\u0000ESC\u0000/g, "{{");
      return { text, warnings: [...new Set(warnings)] };
    }
    function corsHeaders(mode, reqHeaders, { preflight } = {}) {
      if (mode === "off") return {};
      const origin = String(reqHeaders.origin || "");
      const out = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
        "Access-Control-Max-Age": "600"
      };
      if (mode === "star") {
        out["Access-Control-Allow-Origin"] = "*";
        if (preflight) out["Access-Control-Allow-Headers"] = String(reqHeaders["access-control-request-headers"] || "").slice(0, 1024) || "Content-Type, Authorization";
        return out;
      }
      if (!origin) return preflight ? { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" } : {};
      out["Access-Control-Allow-Origin"] = origin.slice(0, 200);
      out["Access-Control-Allow-Credentials"] = "true";
      out.Vary = "Origin";
      if (preflight) {
        out["Access-Control-Allow-Headers"] = String(reqHeaders["access-control-request-headers"] || "").slice(0, 1024) || "Content-Type, Authorization";
      }
      return out;
    }
    function notFoundBody(routes, method, pathname) {
      const enabled = (routes || []).filter((r) => r && r.enabled);
      const sameMethod = enabled.filter((r) => r.method === method || r.method === "ANY").slice(0, 5);
      const nearPath = enabled.filter((r) => {
        const seg = r.path.split("/").slice(1, 2)[0];
        return seg && pathname.toLowerCase().includes(seg.toLowerCase());
      }).slice(0, 5);
      const hint = [...new Set([...sameMethod, ...nearPath].map((r) => `${r.method} ${r.path}`))];
      return {
        ok: false,
        error: "\u672A\u5339\u914D\u5230\u4EFB\u4F55 mock \u8DEF\u7531",
        method,
        path: pathname,
        hint: hint.length ? hint : "\uFF08\u5F53\u524D\u6CA1\u6709\u542F\u7528\u7684\u8DEF\u7531\uFF1B\u53BB Mock \u63A5\u53E3\u53F0\u9762\u677F\u65B0\u5EFA\uFF0C\u6216\u68C0\u67E5\u8DEF\u5F84\u62FC\u5199\uFF09"
      };
    }
    function maskHeaderValue(value) {
      const t = String(value == null ? "" : value);
      return t.length > 8 ? `${t.slice(0, 4)}****${t.slice(-4)}\uFF08\u5DF2\u8131\u654F\uFF09` : "****\uFF08\u5DF2\u8131\u654F\uFF09";
    }
    function maskHeaders(headers) {
      const out = {};
      const entries = Object.entries(headers || {}).slice(0, 30);
      for (const [k, v] of entries) {
        const val = Array.isArray(v) ? v.join(", ") : String(v);
        out[k] = SENSITIVE_HEADER_RE.test(k) ? maskHeaderValue(val) : val.slice(0, 512);
      }
      return out;
    }
    function classifyBodyPreview(contentType, buf, cap) {
      const size = buf ? buf.length : 0;
      if (!size) return { kind: "empty", size: 0, bodyPreview: "", truncated: false };
      const ct = String(contentType || "");
      const isText = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|yaml|toml|csv|graphql))/i.test(ct) || /^[[{\s"]/.test(buf.slice(0, 64).toString("utf8"));
      if (!isText) return { kind: "binary", size, bodyPreview: `\uFF08\u4E8C\u8FDB\u5236 ${size}B\uFF09`, truncated: false };
      const text = buf.slice(0, cap).toString("utf8");
      return { kind: "text", size, bodyPreview: text, truncated: size > cap };
    }
    function makeHistRec(input2) {
      return {
        id: newId(),
        at: input2.at || Date.now(),
        method: String(input2.method || "GET").toUpperCase(),
        path: String(input2.path || "/").slice(0, PATH_CAP),
        query: String(input2.query || "").slice(0, 1024),
        sourceIp: String(input2.sourceIp || "").slice(0, 64),
        matchedRouteId: input2.matchedRouteId || "",
        matchedRouteName: input2.matchedRouteName || "",
        status: clampInt(input2.status, 100, 599, 0),
        delayMs: clampInt(input2.delayMs, 0, DELAY_MAX_MS, 0),
        durMs: clampInt(input2.durMs, 0, 10 * 60 * 1e3, 0),
        reqHeaders: maskHeaders(input2.reqHeaders),
        reqBodyKind: input2.reqBodyKind || "empty",
        reqBodySize: clampInt(input2.reqBodySize, 0, REQ_BODY_CAP, 0),
        reqBodyPreview: String(input2.reqBodyPreview || "").slice(0, KV_PREVIEW_CAP),
        reqBodyTruncated: input2.reqBodyTruncated === true,
        respBytes: clampInt(input2.respBytes, 0, REQ_BODY_CAP, 0)
      };
    }
    function applyHist(ring, rec, cap = HISTORY_CAP) {
      const next = [rec, ...ring];
      if (next.length > cap) next.length = cap;
      return next;
    }
    function planChunkWrites(ring, prevChunkCount) {
      const plan = [];
      const chunkCount = Math.min(Math.ceil(ring.length / CHUNK_SIZE), HIST_CHUNKS_KEEP);
      for (let i = 0; i < chunkCount; i++) {
        plan.push({ key: `mck.hist.${i}`, value: ring.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
      }
      const prevCount = Math.min(prevChunkCount || 0, HIST_CHUNKS_KEEP);
      for (let i = chunkCount; i < prevCount; i++) plan.push({ key: `mck.hist.${i}`, value: null });
      return plan;
    }
    function readRing(map) {
      const chunks = [];
      for (const [k, v] of Object.entries(map || {})) {
        const m = /^mck\.hist\.(\d+)$/.exec(k);
        if (m && Array.isArray(v)) chunks[parseInt(m[1], 10)] = v;
      }
      const out = [];
      for (const c of chunks) {
        if (Array.isArray(c)) out.push(...c);
      }
      return out;
    }
    function summarizeHist(r) {
      const t = new Date(r.at).toISOString().replace("T", " ").slice(11, 19);
      const flag = r.status >= 400 ? " \u26A0" : "";
      return `${t} ${r.method} ${r.path}${r.query ? `?${r.query}` : ""} \u2192 ${r.status}${flag} \u5EF6\u8FDF${r.delayMs}ms \u603B\u8017\u65F6${r.durMs}ms ${r.matchedRouteName ? `\u8DEF\u7531[${r.matchedRouteName}]` : "\u672A\u5339\u914D\u2192404\u8BCA\u65AD"}`;
    }
    function prettyJson(text, cap = 4096) {
      const t = String(text == null ? "" : text);
      try {
        return JSON.stringify(JSON.parse(t), null, 2).slice(0, cap);
      } catch (_) {
        return t.slice(0, cap);
      }
    }
    function schemaToExample(schema, depth) {
      if (!schema || typeof schema !== "object" || depth > 3) return "{{word}}";
      if (schema.example !== void 0) return schema.example;
      if (schema.default !== void 0 && typeof schema.default !== "object") return schema.default;
      if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
      const type = schema.type || (schema.properties ? "object" : Array.isArray(schema.items) ? "array" : schema.items ? "array" : "string");
      if (type === "integer" || type === "number") return "{{int 1,999}}";
      if (type === "boolean") return "{{bool}}";
      if (type === "array") return [schemaToExample(schema.items, depth + 1), schemaToExample(schema.items, depth + 1)];
      if (type === "object") {
        const out = {};
        const props = schema.properties || {};
        for (const [k, v] of Object.entries(props).slice(0, 12)) out[k] = schemaToExample(v, depth + 1);
        return out;
      }
      if (/date|time/i.test(schema.format || "")) return "{{datetime}}";
      if (/email/i.test(schema.format || "")) return "{{email}}";
      return "{{word}}";
    }
    function importOpenApi(spec, { prefix = "" } = {}) {
      if (!spec || typeof spec !== "object") return { ok: false, error: "spec \u5FC5\u987B\u662F OpenAPI JSON \u5BF9\u8C61" };
      if (!spec.paths || typeof spec.paths !== "object") return { ok: false, error: "\u7F3A\u5C11 paths \u5B57\u6BB5\uFF08\u786E\u8BA4\u662F OpenAPI 3.x JSON\uFF0CYAML \u8BF7\u5148\u8F6C JSON\uFF09" };
      const warnings = [];
      const routes = [];
      const now = Date.now();
      let seq = 0;
      for (const [p, pathItem] of Object.entries(spec.paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const m of ["get", "post", "put", "patch", "delete", "head", "options"]) {
          const op = pathItem[m];
          if (!op || typeof op !== "object") continue;
          seq += 1;
          const n = normalizeRoute({
            id: `api-${seq.toString(36).padStart(3, "0")}-${randomHex(3)}`,
            name: String(op.summary || op.operationId || `${m} ${p}`).slice(0, 30),
            method: m.toUpperCase(),
            path: `${prefix}${p}`,
            status: 200,
            bodyType: "json",
            body: (() => {
              const resp = (op.responses || {})["200"] || (op.responses || {}).default;
              const schema = resp && resp.content && resp.content["application/json"] && resp.content["application/json"].schema;
              if (!schema) return '{"ok":true,"data":{}}';
              const ex = schemaToExample(schema, 0);
              try {
                return JSON.stringify(ex, null, 2);
              } catch (_) {
                return '{"ok":true}';
              }
            })(),
            delayMs: 0,
            errorRate: 0,
            errorStatus: 500,
            enabled: true,
            createdAt: now + seq,
            updatedAt: now + seq,
            headers: {}
          });
          if (n.ok) routes.push(n.route);
          else warnings.push(`${m.toUpperCase()} ${p}: ${n.error}`);
        }
      }
      if (!routes.length) return { ok: false, error: "\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u64CD\u4F5C\uFF08paths \u4E3A\u7A7A\u6216\u5747\u4E0D\u5408\u6CD5\uFF09", warnings };
      return { ok: true, routes, warnings };
    }
    function selftestRoutes() {
      const now = Date.now();
      const mk = (id, name, method, path, extra) => {
        const n = normalizeRoute({
          id,
          name,
          method,
          path,
          status: 200,
          bodyType: "json",
          enabled: true,
          builtin: false,
          createdAt: now,
          updatedAt: now,
          headers: {},
          delayMs: 0,
          errorRate: 0,
          errorStatus: 500,
          ...extra
        });
        if (!n.ok) throw new Error(`\u81EA\u68C0\u8DEF\u7531\u6784\u9020\u5931\u8D25 ${id}: ${n.error}`);
        return n.route;
      };
      return [
        mk("st-tpl", "\u81EA\u68C0\xB7\u6A21\u677F", "GET", "/mst/tpl", { body: '{"n":{{int 1,9}},"name":"{{cname}}","mail":"{{email}}","flag":{{bool}}}' }),
        mk("st-param", "\u81EA\u68C0\xB7\u53C2\u6570\u56DE\u663E", "GET", "/mst/echo/:id", { body: '{"id":"{{req.path.id}}","tag":"{{req.query.tag}}"}' }),
        mk("st-slow", "\u81EA\u68C0\xB7\u5EF6\u8FDF", "GET", "/mst/slow", { delayMs: 600, body: '{"ok":true}' }),
        mk("st-fail", "\u81EA\u68C0\xB7\u9519\u8BEF\u6CE8\u5165", "GET", "/mst/fail", { errorRate: 100, errorStatus: 500, body: '{"ok":true}' }),
        mk("st-post", "\u81EA\u68C0\xB7POST\u4F53\u56DE\u663E", "POST", "/mst/post", { body: '{"got":"{{req.body.message}}"}' })
      ];
    }
    module.exports = {
      // 常量
      CHUNK_SIZE,
      KV_PREVIEW_CAP,
      REQ_BODY_CAP,
      ROUTE_BODY_CAP,
      MAX_ROUTES,
      MAX_ROUTE_HEADERS,
      DELAY_MAX_MS,
      HISTORY_CAP,
      PATH_CAP,
      HIST_CHUNKS_KEEP,
      RESERVED_PREFIX,
      METHODS: METHODS2,
      // id
      newId,
      isValidRouteId,
      // 路径
      parsePathPattern,
      matchPattern,
      findMatch,
      // 归一化
      normalizeRoute,
      normalizeMethod,
      normalizeSettings,
      bootstrapSettings,
      upsertRoute,
      removeRoute,
      DEFAULT_SETTINGS,
      // 模板
      renderTemplate,
      renderGenerator,
      mulberry32,
      // CORS / 404
      corsHeaders,
      notFoundBody,
      // 历史
      maskHeaders,
      maskHeaderValue,
      classifyBodyPreview,
      makeHistRec,
      applyHist,
      planChunkWrites,
      readRing,
      summarizeHist,
      prettyJson,
      // OpenAPI
      importOpenApi,
      schemaToExample,
      // 自检
      selftestRoutes
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState5 } from "react";

// src/tabs/RoutesTab.tsx
import { useState } from "react";

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
  const v = await kvGet("mck.meta");
  return v && v.lastTickAt ? v : null;
}
async function getSettings() {
  const v = await kvGet("mck.settings");
  if (!v) return null;
  return import_core.default.normalizeSettings(v);
}
async function getIdx() {
  return kvGet("mck.idx");
}
async function readHistChunks(chunkCount) {
  const map = {};
  const n = Math.min(Math.max(chunkCount || 0, 0), import_core.default.HIST_CHUNKS_KEEP);
  for (let i = 0; i < n; i++) {
    const v = await kvGet(`mck.hist.${i}`);
    if (Array.isArray(v)) map[`mck.hist.${i}`] = v;
  }
  return import_core.default.readRing(map);
}
async function getSelftestReport() {
  return kvGet("mck.selftest");
}
async function saveRoute(input2) {
  const fresh = await getSettings() || import_core.default.normalizeSettings(null);
  const n = import_core.default.normalizeRoute(input2, input2.id ? { partial: true } : {});
  if (!n.ok) return { ok: false, error: n.error };
  const up = import_core.default.upsertRoute(fresh.routes, n.route);
  if (!up.ok) return { ok: false, error: up.error };
  const next = { ...fresh, routes: up.routes, updatedAt: Date.now() };
  await kvSet("mck.settings", next);
  return { ok: true, warnings: n.warnings, route: n.route };
}
async function deleteRoute(id) {
  const fresh = await getSettings() || import_core.default.normalizeSettings(null);
  const rm = import_core.default.removeRoute(fresh.routes, id);
  if (!rm.ok) return { ok: false, error: `\u8DEF\u7531\u4E0D\u5B58\u5728: ${id}` };
  await kvSet("mck.settings", { ...fresh, routes: rm.routes, updatedAt: Date.now() });
  return { ok: true };
}
async function importRoutes(routes, { replace = false } = {}) {
  const fresh = await getSettings() || import_core.default.normalizeSettings(null);
  let list = replace ? [] : fresh.routes;
  let added = 0;
  for (const r of routes) {
    const n = import_core.default.normalizeRoute(r);
    if (!n.ok) continue;
    const up = import_core.default.upsertRoute(list, n.route);
    if (!up.ok) break;
    list = up.routes;
    added += 1;
  }
  await kvSet("mck.settings", { ...fresh, routes: list, updatedAt: Date.now() });
  return { ok: true, added };
}
async function saveSettings(next) {
  await kvSet("mck.settings", { ...import_core.default.normalizeSettings(next), updatedAt: Date.now() });
}
async function sendCommand(op, payload = {}, timeoutMs = 25e3) {
  const nonce = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await kvSet("mck.cmd", { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await kvGet("mck.result");
    if (r && r.nonce === nonce) {
      await kvDel("mck.result").catch(() => {
      });
      return r;
    }
    await sleep(600);
  }
  return { ok: false, error: "\u670D\u52A1\u672A\u5728\u65F6\u9650\u5185\u54CD\u5E94\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF1A\u53BB \u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192Mock \u63A5\u53E3\u53F0 \u770B\u670D\u52A1\u72B6\u6001\uFF09" };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function baseUrl(meta) {
  return `http://127.0.0.1:${meta ? meta.port : 9868}`;
}
function fmtTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// src/tabs/RoutesTab.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY"];
var METHOD_COLOR = {
  GET: "#3fb950",
  POST: "#d29922",
  PUT: "#58a6ff",
  PATCH: "#bc8cff",
  DELETE: "#f85149",
  HEAD: "#8b949e",
  OPTIONS: "#8b949e",
  ANY: "#39c5cf"
};
function emptyEditor() {
  return { id: "", name: "", method: "GET", path: "/api/", status: "200", bodyType: "json", body: '{"ok":true,"data":{}}', headersText: "", delayMs: "0", errorRate: "0", errorStatus: "500", enabled: true };
}
function toEditor(r) {
  return {
    id: r.id,
    name: r.name,
    method: r.method,
    path: r.path,
    status: String(r.status),
    bodyType: r.bodyType,
    body: r.body,
    headersText: Object.entries(r.headers || {}).map(([k, v]) => `${k}: ${v}`).join("\n"),
    delayMs: String(r.delayMs),
    errorRate: String(r.errorRate),
    errorStatus: String(r.errorStatus),
    enabled: r.enabled
  };
}
function parseHeadersText(text) {
  const headers = {};
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i <= 0) return { headers: {}, error: `\u54CD\u5E94\u5934\u683C\u5F0F\u4E0D\u5BF9\uFF08\u5E94\u4E3A Key: Value\uFF09\uFF1A${t.slice(0, 40)}` };
    headers[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return { headers, error: "" };
}
function RoutesTab({ data, running, reload, showToast }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const routes = data.settings?.routes || [];
  const save = async () => {
    if (!editing) return;
    if (!editing.path.trim()) {
      showToast("\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A", "bad");
      return;
    }
    const hs = parseHeadersText(editing.headersText);
    if (hs.error) {
      showToast(hs.error, "bad");
      return;
    }
    setBusy(true);
    const r = await saveRoute({
      id: editing.id || void 0,
      name: editing.name || void 0,
      method: editing.method,
      path: editing.path.trim(),
      status: parseInt(editing.status, 10) || 200,
      bodyType: editing.bodyType,
      body: editing.body,
      headers: hs.headers,
      delayMs: parseInt(editing.delayMs, 10) || 0,
      errorRate: parseInt(editing.errorRate, 10) || 0,
      errorStatus: parseInt(editing.errorStatus, 10) || 500,
      enabled: editing.enabled
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", "bad");
      return;
    }
    showToast(`\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 3s \u5185\u751F\u6548\uFF09${r.warnings && r.warnings.length ? `\uFF1A${r.warnings[0]}` : ""}`, "good");
    setEditing(null);
    await reload();
  };
  const remove = async (r) => {
    const res = await deleteRoute(r.id);
    if (!res.ok) {
      showToast(res.error || "\u5220\u9664\u5931\u8D25", "bad");
      return;
    }
    showToast("\u5DF2\u5220\u9664\uFF083s \u5185\u751F\u6548\uFF09", "good");
    await reload();
  };
  const toggle = async (r) => {
    const res = await saveRoute({ ...r, enabled: !r.enabled, id: r.id });
    if (!res.ok) {
      showToast(res.error || "\u64CD\u4F5C\u5931\u8D25", "bad");
      return;
    }
    await reload();
  };
  const tryIt = async (r) => {
    if (!running) {
      showToast("\u670D\u52A1\u672A\u8FD0\u884C\uFF0C\u65E0\u6CD5\u8BD5\u53D1", "bad");
      return;
    }
    setBusy(true);
    showToast("\u8BD5\u53D1\u4E2D\u2026", "info");
    const res = await sendCommand("test_route", { routeId: r.id }, 25e3);
    setBusy(false);
    if (!res.ok) {
      showToast(res.error || "\u8BD5\u53D1\u5931\u8D25", "bad");
      return;
    }
    const tr = res;
    showToast(`${tr.request} \u2192 ${tr.status} ${String(tr.bodyPreview || "").slice(0, 80)}`, tr.status < 400 ? "good" : "bad");
  };
  const dup = (r) => {
    setEditing(toEditor({ ...r, id: "", name: `${r.name} \u526F\u672C`, builtin: false }));
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setEditing(emptyEditor()), style: btnPrimary(), children: "\uFF0B \u65B0\u5EFA\u8DEF\u7531" }),
      /* @__PURE__ */ jsx("button", { onClick: () => setCheatOpen(!cheatOpen), style: btnGhost(), children: cheatOpen ? "\u6536\u8D77\u6A21\u677F\u901F\u67E5" : "\u{1F4D6} \u6A21\u677F\u901F\u67E5" }),
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#71717a" }, children: [
        "\u5171 ",
        routes.length,
        " \u6761\uFF08\u4E0A\u9650 ",
        import_core.default.MAX_ROUTES,
        "\uFF09"
      ] })
    ] }),
    cheatOpen && /* @__PURE__ */ jsx("div", { style: card("rgba(59,130,246,.06)", "rgba(59,130,246,.25)"), children: /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#93c5fd", lineHeight: 1.9 }, children: [
      "\u54CD\u5E94\u4F53\u91CC\u53EF\u63D2 ",
      /* @__PURE__ */ jsx("code", { children: "{{...}}" }),
      " \u6A21\u677F\uFF08\u6539\u5B8C 3s \u751F\u6548\uFF1B\u672A\u8BC6\u522B\u7684\u8868\u8FBE\u5F0F\u6309\u5B57\u9762\u8FD4\u56DE\u65B9\u4FBF\u53D1\u73B0\u62FC\u5199\u9519\u8BEF\uFF09\uFF1A",
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u6570\u636E\uFF1A",
      /* @__PURE__ */ jsx("code", { children: "{{int 1,99}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{float 0,1,2}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{bool}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{uuid}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{counter}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{pick a|b|c}}" }),
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u4E2D\u6587\u771F\u5B9E\u611F\uFF1A",
      /* @__PURE__ */ jsx("code", { children: "{{cname}}" }),
      " \u59D3\u540D ",
      /* @__PURE__ */ jsx("code", { children: "{{city}}" }),
      " \u57CE\u5E02 ",
      /* @__PURE__ */ jsx("code", { children: "{{phone}}" }),
      " \u624B\u673A\u53F7 ",
      /* @__PURE__ */ jsx("code", { children: "{{ctitle 12}}" }),
      " \u6807\u9898 ",
      /* @__PURE__ */ jsx("code", { children: "{{csentence 10,20}}" }),
      " \u53E5\u5B50 ",
      /* @__PURE__ */ jsx("code", { children: "{{cparagraph 3}}" }),
      " \u6BB5\u843D",
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u82F1\u6587\uFF1A",
      /* @__PURE__ */ jsx("code", { children: "{{name}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{email}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{word}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{sentence 6,14}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{paragraph 3}}" }),
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u65F6\u95F4\uFF1A",
      /* @__PURE__ */ jsx("code", { children: "{{date}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{datetime}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{timestamp}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{dateRange -30,0}}" }),
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u8BF7\u6C42\u56DE\u663E\uFF1A",
      /* @__PURE__ */ jsx("code", { children: "{{req.path.id}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{req.query.tag}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{req.header.X-Token}}" }),
      " ",
      /* @__PURE__ */ jsx("code", { children: "{{req.body.a.b}}" }),
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u5B57\u9762\u8F93\u51FA ",
      /* @__PURE__ */ jsx("code", { children: "{{" }),
      "\uFF1A\u5199 ",
      /* @__PURE__ */ jsx("code", { children: "\\{{" })
    ] }) }),
    editing && /* @__PURE__ */ jsxs("div", { style: card("rgba(63,185,80,.05)", "rgba(63,185,80,.3)"), children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#f4f4f5", marginBottom: 8 }, children: editing.id ? `\u7F16\u8F91\u8DEF\u7531 ${editing.id}` : "\u65B0\u5EFA\u8DEF\u7531" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("select", { value: editing.method, onChange: (e) => setEditing({ ...editing, method: e.target.value }), style: input(90), children: METHODS.map((m) => /* @__PURE__ */ jsx("option", { value: m, children: m }, m)) }),
        /* @__PURE__ */ jsx("input", { value: editing.path, onChange: (e) => setEditing({ ...editing, path: e.target.value }), placeholder: "/api/users/:id\uFF08:\u53C2\u6570\uFF0C* \u7ED3\u5C3E\u901A\u914D\uFF09", style: input(260, "monospace") }),
        /* @__PURE__ */ jsx("input", { value: editing.name, onChange: (e) => setEditing({ ...editing, name: e.target.value }), placeholder: "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09", style: input(140) }),
        /* @__PURE__ */ jsx("select", { value: editing.status, onChange: (e) => setEditing({ ...editing, status: e.target.value }), style: input(80), children: [200, 201, 204, 301, 302, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503].map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s)) }),
        /* @__PURE__ */ jsxs("select", { value: editing.bodyType, onChange: (e) => setEditing({ ...editing, bodyType: e.target.value }), style: input(90), children: [
          /* @__PURE__ */ jsx("option", { value: "json", children: "JSON" }),
          /* @__PURE__ */ jsx("option", { value: "text", children: "\u6587\u672C" }),
          /* @__PURE__ */ jsx("option", { value: "empty", children: "\u7A7A\u4F53" })
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { fontSize: 11, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: editing.enabled, onChange: (e) => setEditing({ ...editing, enabled: e.target.checked }) }),
          "\u542F\u7528"
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: editing.body,
          onChange: (e) => setEditing({ ...editing, body: e.target.value }),
          placeholder: '\u54CD\u5E94\u4F53\uFF0C\u652F\u6301 {{\u6A21\u677F}}\u3002\u4F8B\u5982\uFF1A\n{"code":0,"data":[{"id":{{int 1,99}},"name":"{{cname}}"}]}',
          rows: 6,
          style: { ...input(0, "monospace"), width: "100%", resize: "vertical", marginBottom: 6, display: editing.bodyType === "empty" ? "none" : void 0 }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "#a1a1aa" }, children: "\u5EF6\u8FDF ms" }),
        /* @__PURE__ */ jsx("input", { value: editing.delayMs, onChange: (e) => setEditing({ ...editing, delayMs: e.target.value }), style: input(70) }),
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "#a1a1aa" }, children: "\u9519\u8BEF\u7387 %" }),
        /* @__PURE__ */ jsx("input", { value: editing.errorRate, onChange: (e) => setEditing({ ...editing, errorRate: e.target.value }), style: input(60) }),
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "#a1a1aa" }, children: "\u9519\u8BEF\u72B6\u6001" }),
        /* @__PURE__ */ jsx("input", { value: editing.errorStatus, onChange: (e) => setEditing({ ...editing, errorStatus: e.target.value }), style: input(70) })
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: editing.headersText,
          onChange: (e) => setEditing({ ...editing, headersText: e.target.value }),
          placeholder: "\u81EA\u5B9A\u4E49\u54CD\u5E94\u5934\uFF08\u6BCF\u884C\u4E00\u4E2A Key: Value\uFF0C\u53EF\u9009\uFF09",
          style: { ...input(0, "monospace"), width: "100%", marginBottom: 8 }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx("button", { onClick: save, disabled: busy, style: btnPrimary(), children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx("button", { onClick: () => setEditing(null), style: btnGhost(), children: "\u53D6\u6D88" })
      ] })
    ] }),
    !routes.length && /* @__PURE__ */ jsx("div", { style: { padding: 20, textAlign: "center", color: "#71717a", fontSize: 12 }, children: "\u8FD8\u6CA1\u6709\u8DEF\u7531\u3002\u70B9\u300C\u65B0\u5EFA\u8DEF\u7531\u300D\u9020\u4E00\u4E2A\uFF0C\u6216\u76F4\u63A5\u5728\u5BF9\u8BDD\u91CC\u8BF4\u300C\u5E2E\u6211\u9020\u4E00\u4E2A GET /api/users \u7684 mock\u300D\u3002" }),
    routes.map((r) => /* @__PURE__ */ jsxs("div", { style: card("rgba(39,39,42,.5)", "#3f3f46"), children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx("span", { style: {
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 4,
          background: `${METHOD_COLOR[r.method] || "#8b949e"}22`,
          color: METHOD_COLOR[r.method] || "#8b949e"
        }, children: r.method }),
        /* @__PURE__ */ jsx("code", { style: { fontSize: 12, color: "#e4e4e7" }, children: r.path }),
        /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#71717a" }, children: [
          "\u2192 ",
          r.status
        ] }),
        r.delayMs > 0 && /* @__PURE__ */ jsxs("span", { style: badge("rgba(210,153,34,.15)", "#d29922"), children: [
          "\u6162 ",
          r.delayMs,
          "ms"
        ] }),
        r.errorRate > 0 && /* @__PURE__ */ jsxs("span", { style: badge("rgba(248,81,73,.15)", "#f85149"), children: [
          "\u9519 ",
          r.errorRate,
          "%"
        ] }),
        r.builtin && /* @__PURE__ */ jsx("span", { style: badge("rgba(59,130,246,.15)", "#93c5fd"), children: "\u793A\u4F8B" }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { onClick: () => toggle(r), style: { ...btnGhost(), color: r.enabled ? "#3fb950" : "#71717a" }, children: r.enabled ? "\u2713 \u542F\u7528\u4E2D" : "\u5DF2\u505C\u7528" }),
        /* @__PURE__ */ jsx("button", { onClick: () => tryIt(r), style: btnGhost(), children: "\u8BD5\u4E00\u53D1" }),
        /* @__PURE__ */ jsx("button", { onClick: () => setEditing(toEditor(r)), style: btnGhost(), children: "\u7F16\u8F91" }),
        /* @__PURE__ */ jsx("button", { onClick: () => dup(r), style: btnGhost(), children: "\u590D\u5236" }),
        /* @__PURE__ */ jsx("button", { onClick: () => remove(r), style: { ...btnGhost(), color: "#f85149" }, children: "\u5220\u9664" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#71717a", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx("span", { children: r.name }),
        /* @__PURE__ */ jsxs("span", { children: [
          baseUrl(data.meta),
          /* @__PURE__ */ jsx("b", { style: { color: "#52525b" }, children: r.path })
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u4F53 ",
          r.body.length,
          "B"
        ] })
      ] })
    ] }, r.id))
  ] });
}
function card(bg, border) {
  return { padding: 10, borderRadius: 8, background: bg, border: `1px solid ${border}` };
}
function input(w, fontFamily) {
  return {
    width: w || void 0,
    padding: "6px 8px",
    fontSize: 12,
    borderRadius: 6,
    background: "#18181b",
    border: "1px solid #3f3f46",
    color: "#e4e4e7",
    outline: "none",
    fontFamily: fontFamily || void 0
  };
}
function btnPrimary() {
  return {
    padding: "6px 14px",
    fontSize: 12,
    borderRadius: 8,
    cursor: "pointer",
    background: "rgba(59,130,246,.2)",
    border: "1px solid #3b82f6",
    color: "#93c5fd",
    minHeight: 30
  };
}
function btnGhost() {
  return {
    padding: "4px 10px",
    fontSize: 11,
    borderRadius: 6,
    cursor: "pointer",
    background: "transparent",
    border: "1px solid #3f3f46",
    color: "#a1a1aa",
    minHeight: 26
  };
}
function badge(bg, color) {
  return { fontSize: 10, padding: "2px 6px", borderRadius: 4, background: bg, color };
}

// src/tabs/HistoryTab.tsx
import { useMemo, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function HistoryTab({ data, running, showToast }) {
  const [q, setQ] = useState2("");
  const [statusCls, setStatusCls] = useState2(0);
  const [expanded, setExpanded] = useState2(null);
  const [clearing, setClearing] = useState2(false);
  const rows = useMemo(() => {
    let list = data.history;
    if (q.trim()) {
      const kw = q.trim().toLowerCase();
      list = list.filter((r) => `${r.method} ${r.path} ${r.query} ${r.reqBodyPreview}`.toLowerCase().includes(kw));
    }
    if (statusCls) list = list.filter((r) => Math.floor(r.status / 100) === statusCls);
    return list;
  }, [data.history, q, statusCls]);
  const clear = async () => {
    if (!running) {
      showToast("\u670D\u52A1\u672A\u8FD0\u884C", "bad");
      return;
    }
    if (!window.confirm("\u6E05\u7A7A\u5168\u90E8\u8BF7\u6C42\u5386\u53F2\uFF1F\uFF08\u4E0D\u53EF\u6062\u590D\uFF1B\u8DEF\u7531\u4E0D\u53D7\u5F71\u54CD\uFF09")) return;
    setClearing(true);
    const r = await sendCommand("clear_history", { confirm: true }, 2e4);
    setClearing(false);
    if (!r.ok) {
      showToast(r.error || "\u6E05\u7A7A\u5931\u8D25", "bad");
      return;
    }
    showToast("\u5386\u53F2\u5DF2\u6E05\u7A7A", "good");
  };
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx2("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "\u641C\u65B9\u6CD5/\u8DEF\u5F84/\u8BF7\u6C42\u4F53\u2026", style: {
        flex: 1,
        minWidth: 160,
        padding: "6px 8px",
        fontSize: 12,
        borderRadius: 6,
        background: "#18181b",
        border: "1px solid #3f3f46",
        color: "#e4e4e7",
        outline: "none"
      } }),
      [0, 2, 4, 5].map((cls) => /* @__PURE__ */ jsx2("button", { onClick: () => setStatusCls(cls), style: {
        padding: "4px 10px",
        fontSize: 11,
        borderRadius: 6,
        cursor: "pointer",
        border: "1px solid",
        minHeight: 26,
        borderColor: statusCls === cls ? "#3b82f6" : "#3f3f46",
        background: statusCls === cls ? "rgba(59,130,246,.15)" : "transparent",
        color: statusCls === cls ? "#93c5fd" : "#a1a1aa"
      }, children: cls === 0 ? "\u5168\u90E8" : `${cls}xx` }, cls)),
      /* @__PURE__ */ jsx2("button", { onClick: clear, disabled: clearing, style: { ...ghostBtn(), color: "#f85149" }, children: clearing ? "\u6E05\u7A7A\u4E2D\u2026" : "\u6E05\u7A7A" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { fontSize: 11, color: "#71717a" }, children: [
      "\u5185\u5B58\u4FDD\u7559\u6700\u8FD1 500 \u6761\uFF08\u670D\u52A1\u91CD\u542F\u6E05\u7A7A\uFF09\uFF1Bidx \u8BA1\u6570 ",
      data.idx?.count ?? 0,
      " \xB7 \u7D2F\u8BA1 ",
      data.idx?.total ?? 0
    ] }),
    !rows.length && /* @__PURE__ */ jsx2("div", { style: { padding: 20, textAlign: "center", color: "#71717a", fontSize: 12 }, children: data.history.length ? "\u6CA1\u6709\u7B26\u5408\u8FC7\u6EE4\u6761\u4EF6\u7684\u8BB0\u5F55\u3002" : "\u8FD8\u6CA1\u6709\u8BF7\u6C42\u3002\u628A\u524D\u7AEF baseURL \u6307\u5411\u670D\u52A1\u5730\u5740\u540E\u8C03\u4E00\u6B21\u63A5\u53E3\uFF0C\u8FD9\u91CC\u5C31\u4F1A\u51FA\u73B0\u8BB0\u5F55\u3002" }),
    rows.map((r) => /* @__PURE__ */ jsxs2("div", { style: { padding: 8, borderRadius: 8, background: "rgba(39,39,42,.5)", border: "1px solid #3f3f46" }, children: [
      /* @__PURE__ */ jsxs2(
        "div",
        {
          onClick: () => setExpanded(expanded === r.id ? null : r.id),
          style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexWrap: "wrap" },
          children: [
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, color: "#52525b" }, children: fmtTime(r.at) }),
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, fontWeight: 700, color: "#a1a1aa" }, children: r.method }),
            /* @__PURE__ */ jsxs2("code", { style: { fontSize: 12, color: "#e4e4e7" }, children: [
              r.path,
              r.query ? `?${r.query}` : ""
            ] }),
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, color: statusColor(r.status), fontWeight: 700 }, children: r.status }),
            r.delayMs > 0 && /* @__PURE__ */ jsxs2("span", { style: { fontSize: 10, color: "#d29922" }, children: [
              "+",
              r.delayMs,
              "ms"
            ] }),
            /* @__PURE__ */ jsxs2("span", { style: { fontSize: 10, color: "#52525b" }, children: [
              r.durMs,
              "ms"
            ] }),
            /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 10, color: r.matchedRouteId ? "#3fb950" : "#f85149" }, children: r.matchedRouteName ? `\u8DEF\u7531[${r.matchedRouteName}]` : "\u672A\u5339\u914D\u2192404\u8BCA\u65AD" })
          ]
        }
      ),
      expanded === r.id && /* @__PURE__ */ jsx2(HistDetail, { r })
    ] }, r.id))
  ] });
}
function HistDetail({ r }) {
  return /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "1px solid #3f3f46", fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }, children: [
    /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsx2("div", { style: { color: "#71717a", marginBottom: 2 }, children: "\u8BF7\u6C42\u5934\uFF08\u654F\u611F\u5B57\u6BB5\u5DF2\u8131\u654F\uFF09" }),
      /* @__PURE__ */ jsx2("pre", { style: preStyle, children: Object.entries(r.reqHeaders || {}).map(([k, v]) => `${k}: ${v}`).join("\n") || "\uFF08\u65E0\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { style: { color: "#71717a", marginBottom: 2 }, children: [
        "\u8BF7\u6C42\u4F53\uFF08",
        r.reqBodyKind,
        r.reqBodySize ? ` ${r.reqBodySize}B` : "",
        r.reqBodyTruncated ? "\uFF0C\u5DF2\u622A\u65AD" : "",
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsx2("pre", { style: preStyle, children: r.reqBodyKind === "empty" ? "\uFF08\u7A7A\uFF09" : import_core.default.prettyJson(r.reqBodyPreview) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { color: "#52525b" }, children: [
      "\u6765\u6E90 ",
      r.sourceIp || "-",
      " \xB7 \u5E94\u7B54 ",
      r.respBytes,
      "B \xB7 ",
      r.matchedRouteId || "\u65E0\u8DEF\u7531"
    ] })
  ] });
}
var preStyle = {
  margin: 0,
  padding: 8,
  background: "#09090b",
  borderRadius: 6,
  fontSize: 11,
  maxHeight: 200,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  color: "#a1a1aa"
};
function statusColor(s) {
  if (s < 300) return "#3fb950";
  if (s < 400) return "#d29922";
  if (s < 500) return "#f0883e";
  return "#f85149";
}
function ghostBtn() {
  return {
    padding: "4px 10px",
    fontSize: 11,
    borderRadius: 6,
    cursor: "pointer",
    background: "transparent",
    border: "1px solid #3f3f46",
    color: "#a1a1aa",
    minHeight: 26
  };
}

// src/tabs/SelftestTab.tsx
import { useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var CHECK_INTRO = [
  { id: "\u6A21\u677F\u5F15\u64CE", why: "{{int}}/{{cname}}/{{email}}/{{bool}} \u771F\u5B9E\u6E32\u67D3\u6210\u5408\u6CD5 JSON" },
  { id: "\u8DEF\u5F84\u53C2\u6570", why: ":id \u53C2\u6570\u4E0E ?query \u56DE\u663E\u8FDB\u54CD\u5E94\u4F53" },
  { id: "\u5EF6\u8FDF\u6CE8\u5165", why: "600ms \u5EF6\u8FDF\u771F\u5B9E\u751F\u6548\uFF08\u5B9E\u6D4B \u2265450ms\uFF09" },
  { id: "\u9519\u8BEF\u6CE8\u5165", why: "100% \u9519\u8BEF\u7387 \u2192 500 + \u6CE8\u5165\u6807\u8BB0" },
  { id: "POST\u4F53\u56DE\u663E", why: "{{req.body.*}} \u53D6\u4E2D\u6587\u8BF7\u6C42\u4F53\u5B57\u6BB5" },
  { id: "404\u8BCA\u65AD", why: "\u672A\u5339\u914D\u8DEF\u5F84\u8FD4\u56DE\u5E26 hint \u7684\u8BCA\u65AD\u4F53" },
  { id: "CORS\u9884\u68C0", why: "OPTIONS \u9884\u68C0\u56DE\u663E Origin\uFF08\u6D4F\u89C8\u5668\u8DE8\u57DF\u53EF\u7528\uFF09" }
];
function SelftestTab({ data, running, reload, showToast }) {
  const [report, setReport] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const shown = report || data.selftestReport || null;
  const run = async () => {
    if (!running) {
      showToast("\u670D\u52A1\u672A\u8FD0\u884C\uFF0C\u65E0\u6CD5\u81EA\u68C0", "bad");
      return;
    }
    setBusy(true);
    showToast("\u81EA\u68C0\u4E2D\uFF08\u7EA6 1-2 \u79D2\uFF0C\u4E34\u65F6\u8DEF\u7531\u6253\u771F\u8BF7\u6C42\uFF09\u2026", "info");
    const r = await sendCommand("selftest", {}, 45e3);
    setBusy(false);
    if (!r.ok) {
      showToast(r.error || "\u81EA\u68C0\u5931\u8D25", "bad");
      await reload();
      return;
    }
    const fresh = await getSelftestReport();
    setReport(fresh);
    await reload();
    showToast(r.report && r.report.allGreen ? `\u81EA\u68C0\u5168\u7EFF ${r.report.passed}/${r.report.total}` : "\u81EA\u68C0\u6709\u5931\u8D25\u9879\uFF0C\u770B\u4E0B\u65B9\u660E\u7EC6", r.report && r.report.allGreen ? "good" : "bad");
  };
  return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs3("div", { style: { padding: 10, borderRadius: 8, background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.25)", fontSize: 12, color: "#93c5fd", lineHeight: 1.8 }, children: [
      "\u8BD5\u91D1\u77F3\u81EA\u68C0 = \u4E34\u65F6\u6302 5 \u6761\u63A2\u9488\u8DEF\u7531\uFF0C\u9010\u9879\u5411 ",
      /* @__PURE__ */ jsx3("code", { children: baseUrl(data.meta) }),
      " \u53D1",
      /* @__PURE__ */ jsx3("b", { children: "\u771F\u5B9E HTTP \u8BF7\u6C42" }),
      "\u5E76\u65AD\u8A00\u54CD\u5E94\uFF0C\u8DD1\u5B8C\u5373\u5220\u3002 \u5168\u7EFF\u8BF4\u660E\uFF1A\u6A21\u677F\u5F15\u64CE / \u53C2\u6570\u56DE\u663E / \u5EF6\u8FDF\u6CE8\u5165 / \u9519\u8BEF\u6CE8\u5165 / \u8BF7\u6C42\u4F53\u56DE\u663E / 404 \u8BCA\u65AD / CORS \u9884\u68C0 \u4E03\u9879\u80FD\u529B\u771F\u5B9E\u53EF\u7528\u2014\u2014 \u4E0D\u662F\u300C\u4EE3\u7801\u5199\u5B8C\u4E86\u300D\uFF0C\u662F\u300C\u73B0\u573A\u8DD1\u901A\u4E86\u300D\u3002"
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx3("button", { onClick: run, disabled: busy || !running, style: {
        padding: "6px 16px",
        fontSize: 12,
        borderRadius: 8,
        cursor: busy || !running ? "wait" : "pointer",
        background: "rgba(59,130,246,.2)",
        border: "1px solid #3b82f6",
        color: "#93c5fd",
        minHeight: 30
      }, children: busy ? "\u81EA\u68C0\u4E2D\u2026" : "\u25B6 \u8FD0\u884C\u81EA\u68C0" }),
      shown && /* @__PURE__ */ jsxs3("span", { style: { fontSize: 11, color: "#71717a" }, children: [
        "\u6700\u8FD1\u4E00\u6B21\uFF1A",
        shown.allGreen ? "\u2705" : "\u274C",
        " ",
        shown.passed,
        "/",
        shown.total,
        "\uFF08",
        new Date(shown.at).toLocaleTimeString(),
        "\uFF09"
      ] })
    ] }),
    shown && /* @__PURE__ */ jsxs3("div", { style: { padding: 10, borderRadius: 8, background: shown.allGreen ? "rgba(63,185,80,.06)" : "rgba(248,81,73,.06)", border: `1px solid ${shown.allGreen ? "rgba(63,185,80,.35)" : "rgba(248,81,73,.35)"}` }, children: [
      shown.checks.map((c) => {
        const why = CHECK_INTRO.find((x) => c.item.includes(x.id));
        return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, padding: "4px 0", fontSize: 12, alignItems: "baseline", flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx3("span", { style: { color: c.pass ? "#3fb950" : "#f85149" }, children: c.pass ? "\u2705" : "\u274C" }),
          /* @__PURE__ */ jsx3("span", { style: { color: "#e4e4e7", fontWeight: 600 }, children: c.item }),
          /* @__PURE__ */ jsx3("span", { style: { color: "#71717a", fontSize: 11 }, children: c.detail }),
          why && /* @__PURE__ */ jsxs3("span", { style: { color: "#52525b", fontSize: 10 }, children: [
            "(",
            why.why,
            ")"
          ] }),
          /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsxs3("span", { style: { color: "#52525b", fontSize: 10 }, children: [
            c.ms,
            "ms"
          ] })
        ] }, c.item);
      }),
      /* @__PURE__ */ jsxs3("div", { style: { marginTop: 6, fontSize: 11, color: "#71717a" }, children: [
        "\u8017\u65F6 ",
        shown.durationMs,
        "ms \xB7 \u62A5\u544A\u5DF2\u5B58\u672C\u673A\uFF08mck.selftest\uFF09\uFF0CAI \u53EF\u7ECF mock_selftest \u5DE5\u5177\u968F\u65F6\u590D\u67E5"
      ] })
    ] }),
    !shown && /* @__PURE__ */ jsx3("div", { style: { padding: 16, textAlign: "center", color: "#71717a", fontSize: 12 }, children: "\u8FD8\u6CA1\u8DD1\u8FC7\u81EA\u68C0\u3002\u88C5\u597D\u540E\u5148\u70B9\u4E00\u6B21\u300C\u8FD0\u884C\u81EA\u68C0\u300D\uFF0C\u786E\u8BA4\u5DE5\u5177\u94FE\u771F\u5B9E\u53EF\u7528\u518D\u63A5\u5165\u4F60\u7684\u9879\u76EE\u3002" })
  ] });
}

// src/tabs/SettingsTab.tsx
import { useState as useState4 } from "react";
import { Fragment, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast, running }) {
  const s = data.settings;
  const [corsMode, setCorsMode] = useState4(s?.cors.mode || "echo");
  const [fbEnabled, setFbEnabled] = useState4(s?.fallback.enabled || false);
  const [fbStatus, setFbStatus] = useState4(String(s?.fallback.status || 200));
  const [fbBody, setFbBody] = useState4(s?.fallback.body || '{"ok":true}');
  const [importText, setImportText] = useState4("");
  const [busy, setBusy] = useState4(false);
  if (!s) return /* @__PURE__ */ jsx4("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u8BBE\u7F6E\u8BFB\u53D6\u4E2D\u2026" });
  const persist = async (patch) => {
    const next = { ...s, ...patch };
    await saveSettings(next);
    await reload();
  };
  const saveAll = async () => {
    await saveSettings({
      ...s,
      cors: { mode: corsMode },
      fallback: { enabled: fbEnabled, status: parseInt(fbStatus, 10) || 200, bodyType: "json", body: fbBody }
    });
    showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 3s \u5185\u751F\u6548\uFF09", "good");
    await reload();
  };
  const doImport = async () => {
    const t = importText.trim();
    if (!t) {
      showToast("\u7C98\u8D34 OpenAPI JSON \u6216\u8DEF\u7531\u6570\u7EC4 JSON", "bad");
      return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(t);
      if (parsed && parsed.paths) {
        const imp = import_core.default.importOpenApi(parsed, {});
        if (!imp.ok) {
          showToast(imp.error || "\u5BFC\u5165\u5931\u8D25", "bad");
          return;
        }
        const r = await importRoutes(imp.routes || []);
        showToast(`\u5DF2\u5BFC\u5165 ${r.added} \u6761\u8DEF\u7531\uFF083s \u5185\u751F\u6548\uFF09`, "good");
        setImportText("");
        await reload();
        return;
      }
      if (Array.isArray(parsed)) {
        const r = await importRoutes(parsed);
        showToast(`\u5DF2\u5BFC\u5165 ${r.added} \u6761\u8DEF\u7531\uFF083s \u5185\u751F\u6548\uFF09`, "good");
        setImportText("");
        await reload();
        return;
      }
      showToast("\u4E0D\u662F OpenAPI\uFF08\u7F3A paths\uFF09\u4E5F\u4E0D\u662F\u8DEF\u7531\u6570\u7EC4", "bad");
    } catch (e) {
      showToast(`JSON \u89E3\u6790\u5931\u8D25\uFF1A${e.message.slice(0, 80)}`, "bad");
    } finally {
      setBusy(false);
    }
  };
  const doExport = () => {
    const json = JSON.stringify({ routes: s.routes, cors: s.cors, fallback: s.fallback }, null, 2);
    void navigator.clipboard?.writeText(json).then(
      () => showToast("\u5DF2\u590D\u5236\u5168\u90E8\u8DEF\u7531\u5230\u526A\u8D34\u677F", "good"),
      () => showToast("\u590D\u5236\u5931\u8D25\uFF08\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF09", "bad")
    );
  };
  const meta = data.meta;
  return /* @__PURE__ */ jsxs4("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs4("div", { style: card2(), children: [
      /* @__PURE__ */ jsx4("div", { style: title(), children: "\u670D\u52A1\u72B6\u6001" }),
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 12, lineHeight: 2, color: "#a1a1aa" }, children: [
        "\u5165\u53E3\uFF1A",
        /* @__PURE__ */ jsx4("code", { style: { color: "#93c5fd" }, children: baseUrl(meta) }),
        "\uFF08\u4EC5\u672C\u673A 127.0.0.1\uFF09",
        meta && /* @__PURE__ */ jsxs4(Fragment, { children: [
          " \xB7 \u7248\u672C v",
          meta.version,
          " \xB7 \u8FD0\u884C ",
          Math.round((meta.uptimeSec || 0) / 60),
          " \u5206\u949F"
        ] }),
        /* @__PURE__ */ jsx4("br", {}),
        "\u628A\u524D\u7AEF dev server \u7684 proxy \u6216\u6D4B\u8BD5\u7684 baseURL \u6307\u5230\u4E0A\u9762\u7684\u5730\u5740\u5373\u53EF\uFF1B",
        /* @__PURE__ */ jsx4("b", { style: { color: "#d4d4d8" }, children: "\u9762\u677F\u4E0D\u76F4\u63A5\u53D1\u8BF7\u6C42" }),
        "\uFF0C\u300C\u8BD5\u4E00\u53D1\u300D\u7531\u670D\u52A1\u4FA7\u81EA\u53D1\u81EA\u6536\u3002",
        /* @__PURE__ */ jsx4("br", {}),
        "\u670D\u52A1\u7BA1\u7406\uFF08\u542F\u52A8/\u505C\u6B62/\u91CD\u542F\uFF09\u5728 ",
        /* @__PURE__ */ jsx4("b", { children: "\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Mock \u63A5\u53E3\u53F0" }),
        "\u3002"
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: card2(), children: [
      /* @__PURE__ */ jsx4("div", { style: title(), children: "CORS \u8DE8\u57DF" }),
      /* @__PURE__ */ jsx4("div", { style: { display: "flex", gap: 6, marginBottom: 6 }, children: ["echo", "star", "off"].map((m) => /* @__PURE__ */ jsx4("button", { onClick: () => setCorsMode(m), style: {
        padding: "4px 12px",
        fontSize: 11,
        borderRadius: 6,
        cursor: "pointer",
        border: "1px solid",
        minHeight: 26,
        borderColor: corsMode === m ? "#3b82f6" : "#3f3f46",
        background: corsMode === m ? "rgba(59,130,246,.15)" : "transparent",
        color: corsMode === m ? "#93c5fd" : "#a1a1aa"
      }, children: m === "echo" ? "echo\uFF08\u63A8\u8350\uFF1A\u56DE\u663E Origin + \u5141\u8BB8\u51ED\u636E\uFF09" : m === "star" ? "star\uFF08* \u65E0\u51ED\u636E\uFF09" : "off\uFF08\u5173\u95ED\uFF09" }, m)) }),
      /* @__PURE__ */ jsx4("div", { style: { fontSize: 11, color: "#71717a" }, children: "\u6D4F\u89C8\u5668\u524D\u7AEF\u8DE8\u6E90\u8C03 mock \u5FC5\u987B\u5F00 CORS\uFF1Becho \u6A21\u5F0F\u5BF9\u5E26 Origin \u7684\u8BF7\u6C42\u56DE\u663E\u8BE5 Origin \u5E76\u5141\u8BB8\u643A\u5E26\u51ED\u636E\uFF0C\u9884\u68C0\uFF08OPTIONS\uFF09\u81EA\u52A8 204 \u5E94\u7B54\u3002" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: card2(), children: [
      /* @__PURE__ */ jsx4("div", { style: title(), children: "fallback\uFF08\u672A\u5339\u914D\u65F6\u7684\u515C\u5E95\u5E94\u7B54\uFF09" }),
      /* @__PURE__ */ jsxs4("label", { style: { fontSize: 11, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: fbEnabled, onChange: (e) => setFbEnabled(e.target.checked) }),
        "\u542F\u7528\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF1A\u672A\u5339\u914D\u8FD4\u56DE 404 \u8BCA\u65AD\u4F53\uFF0C\u66F4\u65E9\u66B4\u9732\u8DEF\u5F84\u62FC\u5199\u95EE\u9898\uFF09"
      ] }),
      fbEnabled && /* @__PURE__ */ jsxs4(Fragment, { children: [
        /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }, children: [
          /* @__PURE__ */ jsx4("span", { style: { fontSize: 11, color: "#a1a1aa" }, children: "\u72B6\u6001\u7801" }),
          /* @__PURE__ */ jsx4("input", { value: fbStatus, onChange: (e) => setFbStatus(e.target.value), style: inputStyle(70) })
        ] }),
        /* @__PURE__ */ jsx4("textarea", { value: fbBody, onChange: (e) => setFbBody(e.target.value), rows: 3, style: { ...inputStyle(0, "monospace"), width: "100%", resize: "vertical" } })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: card2(), children: [
      /* @__PURE__ */ jsx4("div", { style: title(), children: "\u5BFC\u5165 / \u5BFC\u51FA" }),
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx4("button", { onClick: doExport, style: btn(), children: "\u5BFC\u51FA\u5168\u90E8\u8DEF\u7531 \u2192 \u526A\u8D34\u677F" }),
        /* @__PURE__ */ jsx4("button", { onClick: doImport, disabled: busy, style: btn(), children: busy ? "\u5BFC\u5165\u4E2D\u2026" : "\u4ECE\u4E0B\u65B9 JSON \u5BFC\u5165" })
      ] }),
      /* @__PURE__ */ jsx4(
        "textarea",
        {
          value: importText,
          onChange: (e) => setImportText(e.target.value),
          rows: 5,
          placeholder: '\u7C98\u8D34 OpenAPI 3.x JSON\uFF08\u81EA\u52A8\u6309 schema \u751F\u6210\u5E26\u6A21\u677F\u7684\u54CD\u5E94\u4F53\uFF09\uFF0C\u6216\u8DEF\u7531\u6570\u7EC4\uFF1A\n[{"method":"GET","path":"/api/x","body":"{\\"ok\\":1}"}]',
          style: { ...inputStyle(0, "monospace"), width: "100%", resize: "vertical" }
        }
      ),
      /* @__PURE__ */ jsx4("div", { style: { fontSize: 11, color: "#71717a", marginTop: 4 }, children: "\u4E5F\u53EF\u4EE5\u5728\u5BF9\u8BDD\u91CC\u8BA9 AI \u505A\uFF1A\u300C\u628A\u8FD9\u4EFD OpenAPI \u5BFC\u5165 mock\u300D\uFF08\u8D70 mock_import_openapi\uFF0C\u5148\u9884\u89C8\u540E\u5199\u5165\uFF09\u3002" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: card2(), children: [
      /* @__PURE__ */ jsx4("div", { style: title(), children: "\u62A4\u680F\u4E0E\u5DF2\u77E5\u8FB9\u754C" }),
      /* @__PURE__ */ jsxs4("div", { style: { fontSize: 11, lineHeight: 2, color: "#71717a" }, children: [
        "\xB7 \u4EC5\u76D1\u542C 127.0.0.1\uFF0C\u5C40\u57DF\u7F51/\u624B\u673A\u4E0D\u53EF\u8FBE\uFF08\u8981\u7ED9\u624B\u673A\u7528\u8BF7\u7528\u771F\u63A5\u53E3\u6216\u5185\u7F51\u7A7F\u900F\u5230\u672C\u673A\uFF09",
        /* @__PURE__ */ jsx4("br", {}),
        "\xB7 \u8DEF\u7531 \u2264",
        import_core.default.MAX_ROUTES,
        " \u6761 \xB7 \u54CD\u5E94\u4F53 \u226416KB \xB7 \u5EF6\u8FDF\u6CE8\u5165 \u226460s \xB7 \u8BF7\u6C42\u4F53\u63A5\u6536\u4E0A\u9650 2MB",
        /* @__PURE__ */ jsx4("br", {}),
        "\xB7 \u5386\u53F2\u53EA\u4FDD\u7559\u6700\u8FD1 500 \u6761\uFF08\u5185\u5B58\uFF09\uFF0C\u670D\u52A1\u91CD\u542F\u6E05\u7A7A\uFF1B\u8DEF\u7531/\u8BBE\u7F6E\u5B58\u672C\u673A kv \u6301\u4E45",
        /* @__PURE__ */ jsx4("br", {}),
        "\xB7 /__ \u5F00\u5934\u7684\u8DEF\u5F84\u662F\u7CFB\u7EDF\u4FDD\u7559\uFF08\u5065\u5EB7\u68C0\u67E5\u7B49\uFF09\uFF0C\u4E0D\u80FD\u6CE8\u518C",
        /* @__PURE__ */ jsx4("br", {}),
        "\xB7 \u9759\u6001\u8DEF\u5F84\u5339\u914D\u5927\u5C0F\u5199\u4E0D\u654F\u611F\uFF08\u5BBD\u5BB9\u8BED\u4E49\uFF09\uFF1B\u672A\u8BC6\u522B\u7684\u6A21\u677F\u8868\u8FBE\u5F0F\u6309\u5B57\u9762\u8FD4\u56DE\uFF0C\u4FBF\u4E8E\u53D1\u73B0\u62FC\u5199\u9519\u8BEF",
        /* @__PURE__ */ jsx4("br", {}),
        "\xB7 \u8BF7\u6C42\u5386\u53F2\u91CC\u7684\u654F\u611F\u8BF7\u6C42\u5934\uFF08authorization/cookie/token/\u2026\uFF09\u5DF2\u81EA\u52A8\u8131\u654F\u540E\u5165\u5E93"
      ] })
    ] }),
    /* @__PURE__ */ jsx4("button", { onClick: saveAll, style: { ...btn(), alignSelf: "flex-start", minHeight: 32 }, children: "\u4FDD\u5B58\u5168\u90E8\u8BBE\u7F6E" })
  ] });
}
function card2() {
  return { padding: 10, borderRadius: 8, background: "rgba(39,39,42,.5)", border: "1px solid #3f3f46" };
}
function title() {
  return { fontSize: 12, fontWeight: 700, color: "#f4f4f5", marginBottom: 8 };
}
function inputStyle(w, fontFamily) {
  return {
    width: w || void 0,
    padding: "6px 8px",
    fontSize: 12,
    borderRadius: 6,
    background: "#18181b",
    border: "1px solid #3f3f46",
    color: "#e4e4e7",
    outline: "none",
    fontFamily: fontFamily || void 0
  };
}
function btn() {
  return {
    padding: "6px 14px",
    fontSize: 12,
    borderRadius: 8,
    cursor: "pointer",
    background: "rgba(59,130,246,.2)",
    border: "1px solid #3b82f6",
    color: "#93c5fd"
  };
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var META_FRESH_MS = 90 * 1e3;
var POLL_MS = 2500;
var TABS = [
  { id: "routes", label: "\u8DEF\u7531" },
  { id: "history", label: "\u5386\u53F2" },
  { id: "selftest", label: "\u81EA\u68C0" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("routes");
  const [data, setData] = useState5({ meta: null, settings: null, idx: null, history: [], selftestReport: null, loaded: false });
  const [toast, setToast] = useState5(null);
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
      const [history, selftestReport] = await Promise.all([readHistChunks(idx?.chunkCount || 0), getSelftestReport()]);
      const next = { meta, settings, idx, history, selftestReport, loaded: true };
      setData(next);
      return next;
    } catch (_) {
      const next = { meta: null, settings: null, idx: null, history: [], selftestReport: null, loaded: true };
      setData(next);
      return next;
    }
  }, []);
  useEffect(() => {
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
      /* @__PURE__ */ jsx5("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u2317 Mock \u63A5\u53E3\u53F0" }),
      /* @__PURE__ */ jsx5("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? `\u670D\u52A1\u4E2D :${data.meta?.port ?? ""}` : "\u670D\u52A1\u79BB\u7EBF" }),
      data.meta?.degraded && running && /* @__PURE__ */ jsx5("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(210,153,34,.15)", color: "#d29922" }, children: "kv \u964D\u7EA7\uFF08mock \u5E94\u7B54\u4E0D\u53D7\u5F71\u54CD\uFF09" }),
      running && /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, color: "#52525b" }, children: [
        "\u8DEF\u7531 ",
        data.meta?.enabledCount ?? 0,
        "/",
        data.meta?.routeCount ?? 0,
        " \u542F\u7528 \xB7 \u5386\u53F2\u7D2F\u8BA1 ",
        data.meta?.histTotal ?? 0
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { style: {
      fontSize: 11,
      padding: "6px 10px",
      borderRadius: 8,
      background: "rgba(59,130,246,.08)",
      border: "1px solid rgba(59,130,246,.25)",
      color: "#93c5fd"
    }, children: [
      "\u628A\u524D\u7AEF/\u6D4B\u8BD5\u7684 baseURL \u6307\u5411 ",
      /* @__PURE__ */ jsxs5("code", { style: { color: "#bfdbfe" }, children: [
        "http://127.0.0.1:",
        data.meta?.port ?? 9868
      ] }),
      "\uFF0C\u672A\u5339\u914D\u7684\u8DEF\u5F84\u4F1A\u8FD4\u56DE\u5E26\u63D0\u793A\u7684 404 \u8BCA\u65AD\u4F53\u3002\u8DEF\u7531\u6539\u5B8C 3 \u79D2\u5185\u751F\u6548\u3002"
    ] }),
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
        "\u540E\u53F0\u670D\u52A1\u672A\u8FD0\u884C\uFF1Amock \u5730\u5740\u4E0D\u53EF\u7528\uFF08\u8DEF\u7531\u7F16\u8F91\u4ECD\u53EF\u8FDB\u884C\uFF0C\u751F\u6548\u8981\u7B49\u670D\u52A1\u8D77\u6765\uFF09\u3002\u53BB ",
        /* @__PURE__ */ jsx5("b", { children: "\u8BBE\u7F6E" }),
        " \u9875\u542F\u52A8\u670D\u52A1\uFF08\u6216\u68C0\u67E5\u7AEF\u53E3 9868 \u662F\u5426\u88AB\u5360\u7528\uFF09\u3002"
      ] }),
      tab === "routes" && /* @__PURE__ */ jsx5(RoutesTab, { data, running, reload, showToast }),
      tab === "history" && /* @__PURE__ */ jsx5(HistoryTab, { data, running, showToast }),
      tab === "selftest" && /* @__PURE__ */ jsx5(SelftestTab, { data, running, reload, showToast }),
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
    /* @__PURE__ */ jsx5("div", { style: { fontSize: 10, color: "#52525b" }, children: "\u4EC5\u76D1\u542C 127.0.0.1\uFF1B\u5386\u53F2\u53EA\u4FDD\u7559\u6700\u8FD1 500 \u6761\u4E14\u670D\u52A1\u91CD\u542F\u6E05\u7A7A\uFF1B\u8DEF\u7531/\u8BBE\u7F6E\u5B58\u672C\u673A kv\uFF0C\u6570\u636E\u4E0D\u51FA\u672C\u673A\u3002" })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function MockServerEntry(props) {
  return /* @__PURE__ */ jsx6(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  MockServerEntry as default
};
