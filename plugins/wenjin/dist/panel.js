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
    function sha256Hex(input) {
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
    module.exports = { sha256Hex };
  }
});

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var { sha256Hex } = require_sha256();
    var SCHEMA_VERSION = 1;
    var CHANNELS2 = ["boss", "referral", "website", "liepin", "lagou", "linkedin", "maimai", "other"];
    var CHANNEL_LABELS2 = {
      boss: "BOSS\u76F4\u8058",
      referral: "\u5185\u63A8",
      website: "\u5B98\u7F51",
      liepin: "\u730E\u8058",
      lagou: "\u62C9\u52FE",
      linkedin: "LinkedIn",
      maimai: "\u8109\u8109",
      other: "\u5176\u4ED6"
    };
    var STATUSES3 = ["wish", "applied", "screening", "written", "interview", "offered", "accepted", "rejected", "withdrawn"];
    var STATUS_LABELS3 = {
      wish: "\u60F3\u6295",
      applied: "\u5DF2\u6295",
      screening: "\u6C9F\u901A\u4E2D",
      written: "\u7B14\u8BD5",
      interview: "\u9762\u8BD5\u4E2D",
      offered: "\u5DF2\u6709offer",
      accepted: "\u5DF2\u63A5\u53D7",
      rejected: "\u88AB\u62D2",
      withdrawn: "\u4E3B\u52A8\u653E\u5F03"
    };
    var PIPE_STATUSES = ["applied", "screening", "written"];
    var ACTIVE_STATUSES2 = ["wish", "applied", "screening", "written", "interview", "offered"];
    var EVENT_TYPES2 = ["applied", "screen", "written", "interview", "offer", "result", "note"];
    var EVENT_LABELS3 = {
      applied: "\u6295\u9012",
      screen: "\u6C9F\u901A",
      written: "\u7B14\u8BD5",
      interview: "\u9762\u8BD5",
      offer: "offer",
      result: "\u7ED3\u679C",
      note: "\u5907\u6CE8"
    };
    var OUTCOMES = ["pass", "fail"];
    var OUTCOME_LABELS2 = { pass: "\u901A\u8FC7", fail: "\u672A\u8FC7" };
    var EVENT_STATUS_MAP = {
      applied: "applied",
      screen: "screening",
      written: "written",
      interview: "interview",
      offer: "offered"
    };
    var DEFAULT_SETTINGS = { schemaVersion: SCHEMA_VERSION, followUpDays: 5, remindLeadHours: 24 };
    var DAY_MS2 = 864e5;
    var K3 = {
      companyPrefix: "wenjin.company.",
      appPrefix: "wenjin.app.",
      resumePrefix: "wenjin.resume.",
      eventPrefix: "wenjin.event.",
      offerPrefix: "wenjin.offer.",
      settings: "wenjin.settings",
      meta: "wenjin.meta",
      company: (id) => `wenjin.company.${id}`,
      app: (id) => `wenjin.app.${id}`,
      resume: (id) => `wenjin.resume.${id}`,
      event: (id) => `wenjin.event.${id}`,
      offer: (id) => `wenjin.offer.${id}`
    };
    function idFor(seed) {
      return "w" + sha256Hex(String(seed)).slice(0, 12);
    }
    function clip(s, n) {
      s = String(s == null ? "" : s);
      return s.length <= n ? s : s.slice(0, n);
    }
    function normName2(s) {
      return String(s == null ? "" : s).trim().replace(/\s+/g, "").toLowerCase();
    }
    function displayName(s) {
      return String(s == null ? "" : s).trim().replace(/\s+/g, " ");
    }
    function nowIso2() {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
    function parseTs6(v) {
      if (v == null || v === "") return null;
      if (typeof v === "number" && isFinite(v)) return v;
      const s = String(v).trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d).getTime();
      }
      const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m1) {
        return new Date(+m1[1], +m1[2] - 1, +m1[3], +m1[4], +m1[5], m1[6] ? +m1[6] : 0).getTime();
      }
      const t = Date.parse(s);
      return isFinite(t) ? t : null;
    }
    function minuteKey(ms) {
      if (ms == null) return "";
      return new Date(Math.floor(ms / 6e4) * 6e4).toISOString().slice(0, 16);
    }
    function fmtDate2(ms) {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function fmtDateTime4(ms) {
      const d = new Date(ms);
      return `${fmtDate2(ms)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    function tsOrNow(v, nowMs) {
      const t = parseTs6(v);
      if (t != null) return t;
      return nowMs != null ? nowMs : Date.now();
    }
    function normalizeCompany2(raw, prev) {
      raw = raw || {};
      const name = displayName(raw.name);
      if (!name) throw new Error("\u516C\u53F8\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      const now = nowIso2();
      return {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("company|" + normName2(name)),
        name,
        industry: raw.industry != null ? clip(raw.industry, 40) : prev && prev.industry || "",
        note: raw.note != null ? clip(raw.note, 500) : prev && prev.note || "",
        createdAt: prev && prev.createdAt ? prev.createdAt : now,
        updatedAt: now
      };
    }
    function normalizeApp2(raw, prev, companyName) {
      raw = raw || {};
      const title = displayName(raw.title);
      if (!title) throw new Error("\u804C\u4F4D\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      const company = displayName(companyName || raw.companyName);
      if (!company) throw new Error("\u516C\u53F8\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      const now = nowIso2();
      const companyId = prev && prev.companyId || idFor("company|" + normName2(company));
      let status = raw.status != null ? String(raw.status) : prev && prev.status || "wish";
      if (!STATUSES3.includes(status)) status = "wish";
      let channel = raw.channel != null ? String(raw.channel) : prev && prev.channel || "other";
      if (!CHANNELS2.includes(channel)) channel = "other";
      const appliedMs = raw.appliedAt != null ? parseTs6(raw.appliedAt) : prev && prev.appliedAt ? parseTs6(prev.appliedAt) : null;
      const base = {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("app|" + companyId + "|" + normName2(title)),
        companyId,
        companyName: company,
        title,
        channel,
        status,
        jd: raw.jd != null ? clip(raw.jd, 2e4) : prev && prev.jd || "",
        salaryPosted: raw.salaryPosted != null ? clip(raw.salaryPosted, 120) : prev && prev.salaryPosted || "",
        location: raw.location != null ? clip(raw.location, 120) : prev && prev.location || "",
        resumeId: raw.resumeId != null ? String(raw.resumeId).slice(0, 40) : prev && prev.resumeId || "",
        appliedAt: appliedMs != null ? new Date(appliedMs).toISOString() : "",
        archived: raw.archived != null ? !!raw.archived : !!(prev && prev.archived),
        note: raw.note != null ? clip(raw.note, 2e3) : prev && prev.note || "",
        createdAt: prev && prev.createdAt ? prev.createdAt : now,
        updatedAt: now
      };
      return base;
    }
    function normalizeResume2(raw, prev) {
      raw = raw || {};
      const label = displayName(raw.label);
      if (!label) throw new Error("\u7B80\u5386\u7248\u672C\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      const now = nowIso2();
      return {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("resume|" + normName2(label)),
        label,
        content: raw.content != null ? clip(raw.content, 1e5) : prev && prev.content || "",
        note: raw.note != null ? clip(raw.note, 500) : prev && prev.note || "",
        createdAt: prev && prev.createdAt ? prev.createdAt : now,
        updatedAt: now
      };
    }
    function normalizeEvent2(raw, prev, appId) {
      raw = raw || {};
      const aid = prev && prev.appId || (appId ? String(appId) : "");
      if (!aid) throw new Error("\u4E8B\u4EF6\u5FC5\u987B\u6302\u5728\u67D0\u4E2A\u6295\u9012\u4E0A");
      let type = raw.type != null ? String(raw.type) : prev && prev.type || "note";
      if (!EVENT_TYPES2.includes(type)) type = "note";
      const detail = raw.detail != null ? clip(raw.detail, 8e3) : prev && prev.detail || "";
      const atMs = tsOrNow(raw.at != null ? raw.at : prev && prev.at, Date.now());
      const now = nowIso2();
      let questions = prev && prev.questions ? prev.questions : [];
      if (raw.questions != null) {
        questions = (Array.isArray(raw.questions) ? raw.questions : String(raw.questions).split(/\n+/)).map((q) => clip(String(q).trim(), 300)).filter((q) => q.length > 0).slice(0, 50);
      }
      let outcome = raw.outcome != null ? String(raw.outcome) : prev && prev.outcome || "";
      if (outcome && !OUTCOMES.includes(outcome)) outcome = "";
      const remindMs = raw.remindAt != null ? parseTs6(raw.remindAt) : prev && prev.remindAt ? parseTs6(prev.remindAt) : null;
      return {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("event|" + aid + "|" + type + "|" + minuteKey(atMs) + "|" + clip(detail, 80)),
        appId: aid,
        type,
        at: new Date(atMs).toISOString(),
        title: raw.title != null ? clip(raw.title, 120) : prev && prev.title || "",
        detail,
        questions,
        outcome,
        remindAt: remindMs != null ? new Date(remindMs).toISOString() : "",
        createdAt: prev && prev.createdAt ? prev.createdAt : now,
        updatedAt: now
      };
    }
    function normalizeOffer2(raw, prev, appId) {
      raw = raw || {};
      const aid = prev && prev.appId || (appId ? String(appId) : "");
      if (!aid) throw new Error("offer \u5FC5\u987B\u6302\u5728\u67D0\u4E2A\u6295\u9012\u4E0A");
      const num = (v, def, lo, hi) => {
        const n = Number(v);
        if (!isFinite(n)) return def;
        return Math.min(hi, Math.max(lo, n));
      };
      const baseMonthly = num(raw.baseMonthly != null ? raw.baseMonthly : prev && prev.baseMonthly, 0, 0, 1e7);
      if (!(baseMonthly > 0)) throw new Error("baseMonthly \u5FC5\u987B\u662F\u6B63\u6570\uFF08\u5143/\u6708\uFF09");
      const now = nowIso2();
      const deadlineMs = raw.deadline != null ? parseTs6(raw.deadline) : prev && prev.deadline ? parseTs6(prev.deadline) : null;
      return {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("offer|" + aid),
        appId: aid,
        baseMonthly,
        months: num(raw.months != null ? raw.months : prev && prev.months, 12, 1, 24),
        bonusMonths: num(raw.bonusMonths != null ? raw.bonusMonths : prev && prev.bonusMonths, 0, 0, 24),
        commuteMin: num(raw.commuteMin != null ? raw.commuteMin : prev && prev.commuteMin, 0, 0, 600),
        remoteDays: num(raw.remoteDays != null ? raw.remoteDays : prev && prev.remoteDays, 0, 0, 7),
        stockNote: raw.stockNote != null ? clip(raw.stockNote, 1e3) : prev && prev.stockNote || "",
        deadline: deadlineMs != null ? new Date(deadlineMs).toISOString() : "",
        note: raw.note != null ? clip(raw.note, 2e3) : prev && prev.note || "",
        createdAt: prev && prev.createdAt ? prev.createdAt : now,
        updatedAt: now
      };
    }
    function normalizeSettings2(raw, prev) {
      const r = raw || {};
      const base = prev || DEFAULT_SETTINGS;
      const int = (v, def, lo, hi) => {
        const n = Math.round(Number(v));
        return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
      };
      return {
        schemaVersion: SCHEMA_VERSION,
        followUpDays: int(r.followUpDays != null ? r.followUpDays : base.followUpDays, 5, 1, 60),
        remindLeadHours: int(r.remindLeadHours != null ? r.remindLeadHours : base.remindLeadHours, 24, 1, 168)
      };
    }
    function pipeline3(apps) {
      const counts = {};
      for (const s of STATUSES3) counts[s] = 0;
      let archived = 0;
      for (const a of apps || []) {
        if (counts[a.status] != null) counts[a.status] += 1;
        else counts[a.status] = 1;
        if (a.archived) archived += 1;
      }
      const order = { interview: 0, written: 1, offered: 2, screening: 3, applied: 4, wish: 5, accepted: 6, rejected: 7, withdrawn: 8 };
      const active = (apps || []).filter((a) => !a.archived).slice().sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9) || String(y.updatedAt || "").localeCompare(String(x.updatedAt || "")));
      return { counts, archived, active };
    }
    function lastEventAt(appId, events) {
      let last = 0;
      for (const e of events || []) {
        if (e.appId !== appId) continue;
        const t = parseTs6(e.at);
        if (t != null && t > last) last = t;
      }
      return last;
    }
    function followUps2(apps, events, settings, nowMs) {
      const now = nowMs != null ? nowMs : Date.now();
      const lead = settings && settings.followUpDays || 5;
      const out = [];
      for (const a of apps || []) {
        if (a.archived || !PIPE_STATUSES.includes(a.status)) continue;
        const last = lastEventAt(a.id, events);
        const anchor = last || (a.appliedAt ? parseTs6(a.appliedAt) : null) || (a.createdAt ? parseTs6(a.createdAt) : null);
        if (!anchor) continue;
        const elapsed = now - anchor;
        if (elapsed >= lead * DAY_MS2) {
          out.push({ app: a, lastAt: anchor, daysSince: Math.floor(elapsed / DAY_MS2) });
        }
      }
      out.sort((x, y) => y.daysSince - x.daysSince);
      return out;
    }
    function upcoming2(events, settings, nowMs) {
      const now = nowMs != null ? nowMs : Date.now();
      const leadH = (settings && settings.remindLeadHours || 24) * 36e5;
      const schedule = [];
      const reminders = [];
      for (const e of events || []) {
        const at = parseTs6(e.at);
        if ((e.type === "written" || e.type === "interview") && at != null && at > now - 12 * 36e5) {
          schedule.push(e);
        }
        const r = parseTs6(e.remindAt);
        if (r != null && now >= r - leadH && now <= r + 48 * 36e5) {
          reminders.push(e);
        }
      }
      schedule.sort((x, y) => parseTs6(x.at) - parseTs6(y.at));
      reminders.sort((x, y) => parseTs6(x.remindAt) - parseTs6(y.remindAt));
      return { schedule: schedule.slice(0, 10), reminders: reminders.slice(0, 10) };
    }
    function stageOf(app, events) {
      let stage = null;
      const rank = { submitted: 1, responded: 2, interviewed: 3, offered: 4 };
      const bump = (s) => {
        if (s && rank[s] > (stage ? rank[stage] : 0)) stage = s;
      };
      const hasType = (t) => (events || []).some((e) => e.appId === app.id && e.type === t);
      if (app.status !== "wish" || app.appliedAt || hasType("applied")) bump("submitted");
      if (hasType("screen") || hasType("written") || hasType("interview") || hasType("offer") || hasType("result") || ["screening", "written", "interview", "offered", "accepted", "rejected"].includes(app.status)) bump("responded");
      if (hasType("interview") || hasType("offer") || ["interview", "offered", "accepted"].includes(app.status)) bump("interviewed");
      if (hasType("offer") || ["offered", "accepted"].includes(app.status)) bump("offered");
      return stage;
    }
    function funnelBy2(apps, events, field) {
      const groups = /* @__PURE__ */ new Map();
      for (const a of apps || []) {
        if (a.status === "wish" && !a.appliedAt && !(events || []).some((e) => e.appId === a.id)) continue;
        const key = field === "resumeId" ? a.resumeId || "(\u672A\u6807\u6CE8)" : CHANNEL_LABELS2[a.channel] || a.channel || "\u5176\u4ED6";
        if (!groups.has(key)) groups.set(key, { key, submitted: 0, responded: 0, interviewed: 0, offered: 0 });
        const g = groups.get(key);
        const st = stageOf(a, events);
        if (st) g.submitted += 1;
        if (st === "responded" || st === "interviewed" || st === "offered") g.responded += 1;
        if (st === "interviewed" || st === "offered") g.interviewed += 1;
        if (st === "offered") g.offered += 1;
      }
      const rows = [...groups.values()].sort((x, y) => y.submitted - x.submitted || y.responded - x.responded);
      const MIN_SAMPLE = 5;
      const pct = (n, d) => d >= MIN_SAMPLE && d > 0 ? Math.round(n / d * 100) + "%" : null;
      for (const g of rows) {
        g.respondedRate = pct(g.responded, g.submitted);
        g.interviewedRate = pct(g.interviewed, g.responded);
        g.offeredRate = pct(g.offered, g.interviewed);
      }
      return rows;
    }
    function offerCompare2(offers, apps) {
      const appById = new Map((apps || []).map((a) => [a.id, a]));
      const rows = (offers || []).map((o) => {
        const a = appById.get(o.appId);
        const totalMonths = (o.months || 12) + (o.bonusMonths || 0);
        const annual = Math.round((o.baseMonthly || 0) * totalMonths);
        return {
          offer: o,
          app: a || null,
          companyName: a ? a.companyName : "(\u5DF2\u5220\u6295\u9012)",
          title: a ? a.title : "",
          totalMonths,
          annual,
          commuteHoursPerYear: o.commuteMin > 0 ? Math.round(o.commuteMin * 2 * 250 / 60 * 10) / 10 : null
        };
      }).sort((x, y) => y.annual - x.annual);
      const best = rows.length ? rows[0].annual : 0;
      for (const r of rows) r.deltaVsBest = r.annual - best;
      return rows;
    }
    function questionBank2(events, apps) {
      const appById = new Map((apps || []).map((a) => [a.id, a]));
      const map = /* @__PURE__ */ new Map();
      for (const e of events || []) {
        if (!Array.isArray(e.questions)) continue;
        const a = appById.get(e.appId);
        for (const q of e.questions) {
          const key = normName2(q);
          if (!key) continue;
          if (!map.has(key)) map.set(key, { q: String(q).trim(), count: 0, companies: [] });
          const item = map.get(key);
          item.count += 1;
          const c = a ? a.companyName : "?";
          if (!item.companies.includes(c)) item.companies.push(c);
        }
      }
      return [...map.values()].sort((x, y) => y.count - x.count || x.q.localeCompare(y.q));
    }
    function csvEscape(v) {
      const s = v == null ? "" : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function exportCSV2(apps, events, resumes, offers) {
      const resumeById = new Map((resumes || []).map((r) => [r.id, r.label]));
      const offerByApp = new Map((offers || []).map((o) => [o.appId, o]));
      const head = ["\u516C\u53F8", "\u804C\u4F4D", "\u6E20\u9053", "\u72B6\u6001", "\u6295\u9012\u65F6\u95F4", "\u6700\u65B0\u8FDB\u5C55", "\u6700\u65B0\u8FDB\u5C55\u65F6\u95F4", "\u671F\u671B\u85AA\u8D44", "\u5730\u70B9", "\u7B80\u5386\u7248\u672C", "offer\u5E74\u5316", "\u5907\u6CE8"];
      const lines = [head.join(",")];
      for (const a of (apps || []).slice().sort((x, y) => String(x.companyName).localeCompare(String(y.companyName)))) {
        let lastDesc = "";
        let lastAt = "";
        let lastT = 0;
        for (const e of events || []) {
          if (e.appId !== a.id) continue;
          const t = parseTs6(e.at) || 0;
          if (t >= lastT) {
            lastT = t;
            lastAt = t ? fmtDateTime4(t) : "";
            const label = EVENT_LABELS3[e.type] || e.type;
            const tail = e.detail ? clip(e.detail.replace(/\s+/g, " "), 60) : "";
            lastDesc = label + (e.outcome ? `(${OUTCOME_LABELS2[e.outcome] || e.outcome})` : "") + (tail ? "\uFF1A" + tail : "");
          }
        }
        const o = offerByApp.get(a.id);
        const annual = o ? Math.round(o.baseMonthly * ((o.months || 12) + (o.bonusMonths || 0))) : "";
        lines.push([
          a.companyName,
          a.title,
          CHANNEL_LABELS2[a.channel] || a.channel,
          STATUS_LABELS3[a.status] || a.status,
          a.appliedAt ? fmtDateTime4(parseTs6(a.appliedAt)) : "",
          lastDesc,
          lastAt,
          a.salaryPosted,
          a.location,
          a.resumeId ? resumeById.get(a.resumeId) || "" : "",
          annual,
          a.note
        ].map(csvEscape).join(","));
      }
      return "\uFEFF" + lines.join("\r\n") + "\r\n";
    }
    function parseCSV(text) {
      const rows = [];
      let row = [];
      let field = "";
      let inQ = false;
      let s = String(text == null ? "" : text);
      if (s.charCodeAt(0) === 65279) s = s.slice(1);
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if (inQ) {
          if (c === '"') {
            if (s[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            inQ = false;
            i += 1;
            continue;
          }
          field += c;
          i += 1;
          continue;
        }
        if (c === '"') {
          inQ = true;
          i += 1;
          continue;
        }
        if (c === ",") {
          row.push(field);
          field = "";
          i += 1;
          continue;
        }
        if (c === "\r") {
          i += 1;
          continue;
        }
        if (c === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
          i += 1;
          continue;
        }
        field += c;
        i += 1;
      }
      if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
      }
      return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
    }
    var STATUS_LABEL_TO_KEY = {};
    for (const k of STATUSES3) STATUS_LABEL_TO_KEY[STATUS_LABELS3[k]] = k;
    var CHANNEL_LABEL_TO_KEY = {};
    for (const k of CHANNELS2) CHANNEL_LABEL_TO_KEY[CHANNEL_LABELS2[k]] = k;
    function importCSV2(text, existingApps, nowMs) {
      const rows = parseCSV(text);
      if (!rows.length) throw new Error("CSV \u4E3A\u7A7A");
      const head = rows[0].map((h) => String(h).trim());
      const idx = {};
      const want = ["\u516C\u53F8", "\u804C\u4F4D", "\u6E20\u9053", "\u72B6\u6001", "\u6295\u9012\u65F6\u95F4", "\u6700\u65B0\u8FDB\u5C55", "\u6700\u65B0\u8FDB\u5C55\u65F6\u95F4", "\u671F\u671B\u85AA\u8D44", "\u5730\u70B9", "\u7B80\u5386\u7248\u672C", "\u5907\u6CE8"];
      for (const w of want) {
        const i = head.findIndex((h) => h.includes(w));
        if (i >= 0) idx[w] = i;
      }
      if (idx["\u516C\u53F8"] == null || idx["\u804C\u4F4D"] == null) throw new Error("CSV \u7F3A\u5C11\u300C\u516C\u53F8\u300D\u6216\u300C\u804C\u4F4D\u300D\u5217");
      const known = new Set((existingApps || []).map((a) => normName2(a.companyName) + "|" + normName2(a.title)));
      const companies = [];
      const apps = [];
      const noteEvents = [];
      const warns = [];
      let created = 0;
      let skipped = 0;
      const now = nowMs != null ? nowMs : Date.now();
      for (let r = 1; r < rows.length; r++) {
        const c = rows[r];
        const company = displayName(c[idx["\u516C\u53F8"]]);
        const title = displayName(c[idx["\u804C\u4F4D"]]);
        if (!company || !title) {
          warns.push(`\u7B2C ${r + 1} \u884C\u7F3A\u516C\u53F8\u6216\u804C\u4F4D\uFF0C\u8DF3\u8FC7`);
          continue;
        }
        const dupKey = normName2(company) + "|" + normName2(title);
        if (known.has(dupKey)) {
          skipped += 1;
          continue;
        }
        known.add(dupKey);
        let channel = "other";
        const chRaw = idx["\u6E20\u9053"] != null ? String(c[idx["\u6E20\u9053"]] || "").trim() : "";
        if (chRaw) {
          if (CHANNEL_LABEL_TO_KEY[chRaw]) channel = CHANNEL_LABEL_TO_KEY[chRaw];
          else if (CHANNELS2.includes(chRaw)) channel = chRaw;
          else {
            channel = "other";
            warns.push(`\u7B2C ${r + 1} \u884C\u672A\u77E5\u6E20\u9053\u300C${chRaw}\u300D\u8BB0\u4E3A\u5176\u4ED6`);
          }
        }
        let status = "applied";
        const stRaw = idx["\u72B6\u6001"] != null ? String(c[idx["\u72B6\u6001"]] || "").trim() : "";
        if (stRaw) {
          if (STATUS_LABEL_TO_KEY[stRaw]) status = STATUS_LABEL_TO_KEY[stRaw];
          else if (STATUSES3.includes(stRaw)) status = stRaw;
          else {
            status = "applied";
            warns.push(`\u7B2C ${r + 1} \u884C\u672A\u77E5\u72B6\u6001\u300C${stRaw}\u300D\u8BB0\u4E3A\u5DF2\u6295`);
          }
        }
        const appliedAtRaw = idx["\u6295\u9012\u65F6\u95F4"] != null ? c[idx["\u6295\u9012\u65F6\u95F4"]] : "";
        const appliedMs = appliedAtRaw ? parseTs6(appliedAtRaw) : null;
        const app = normalizeApp2({
          companyName: company,
          title,
          channel,
          status,
          appliedAt: appliedMs != null ? new Date(appliedMs).toISOString() : "",
          salaryPosted: idx["\u671F\u671B\u85AA\u8D44"] != null ? c[idx["\u671F\u671B\u85AA\u8D44"]] : "",
          location: idx["\u5730\u70B9"] != null ? c[idx["\u5730\u70B9"]] : "",
          note: idx["\u5907\u6CE8"] != null ? c[idx["\u5907\u6CE8"]] : ""
        }, null, company);
        companies.push(normalizeCompany2({ name: company }, null));
        apps.push(app);
        created += 1;
        const prog = idx["\u6700\u65B0\u8FDB\u5C55"] != null ? String(c[idx["\u6700\u65B0\u8FDB\u5C55"]] || "").trim() : "";
        if (prog) {
          const progMsRaw = idx["\u6700\u65B0\u8FDB\u5C55\u65F6\u95F4"] != null ? parseTs6(c[idx["\u6700\u65B0\u8FDB\u5C55\u65F6\u95F4"]]) : null;
          noteEvents.push(normalizeEvent2({
            type: "note",
            at: progMsRaw != null ? progMsRaw : appliedMs != null ? appliedMs : now,
            detail: clip(prog, 500)
          }, null, app.id));
        }
      }
      return { companies, apps, noteEvents, created, skipped, warns };
    }
    function exportAll2(data) {
      return {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: nowIso2(),
        kind: "wenjin-backup",
        companies: data.companies || [],
        apps: data.apps || [],
        resumes: data.resumes || [],
        events: data.events || [],
        offers: data.offers || [],
        settings: data.settings || DEFAULT_SETTINGS
      };
    }
    function describeStatus(s) {
      return STATUS_LABELS3[s] || s || "?";
    }
    function describeChannel(c) {
      return CHANNEL_LABELS2[c] || c || "?";
    }
    function describeEventType(t) {
      return EVENT_LABELS3[t] || t || "?";
    }
    module.exports = {
      SCHEMA_VERSION,
      DEFAULT_SETTINGS,
      DAY_MS: DAY_MS2,
      K: K3,
      CHANNELS: CHANNELS2,
      CHANNEL_LABELS: CHANNEL_LABELS2,
      STATUSES: STATUSES3,
      STATUS_LABELS: STATUS_LABELS3,
      PIPE_STATUSES,
      ACTIVE_STATUSES: ACTIVE_STATUSES2,
      EVENT_TYPES: EVENT_TYPES2,
      EVENT_LABELS: EVENT_LABELS3,
      OUTCOMES,
      OUTCOME_LABELS: OUTCOME_LABELS2,
      EVENT_STATUS_MAP,
      idFor,
      clip,
      normName: normName2,
      displayName,
      nowIso: nowIso2,
      parseTs: parseTs6,
      minuteKey,
      fmtDate: fmtDate2,
      fmtDateTime: fmtDateTime4,
      tsOrNow,
      normalizeCompany: normalizeCompany2,
      normalizeApp: normalizeApp2,
      normalizeResume: normalizeResume2,
      normalizeEvent: normalizeEvent2,
      normalizeOffer: normalizeOffer2,
      normalizeSettings: normalizeSettings2,
      pipeline: pipeline3,
      lastEventAt,
      followUps: followUps2,
      upcoming: upcoming2,
      stageOf,
      funnelBy: funnelBy2,
      offerCompare: offerCompare2,
      questionBank: questionBank2,
      csvEscape,
      exportCSV: exportCSV2,
      parseCSV,
      importCSV: importCSV2,
      exportAll: exportAll2,
      describeStatus,
      describeChannel,
      describeEventType
    };
  }
});

// src/Panel.tsx
var core6 = __toESM(require_core());
import { useCallback, useEffect, useRef as useRef2, useState as useState4 } from "react";

// src/model.ts
var core = __toESM(require_core());

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
  const res = await getHostInvoke()("router_dispatch", {
    req: { target, payload }
  });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r && r.value !== void 0 ? r.value : null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r && Array.isArray(r.keys) ? r.keys : [];
}

// src/model.ts
var K2 = core.K;
function newCache() {
  return { knownKeys: null, fullAt: 0, entities: /* @__PURE__ */ new Map() };
}
var FULL_REFRESH_MS = 90 * 1e3;
var ENTITY_PREFIXES = [K2.companyPrefix, K2.appPrefix, K2.resumePrefix, K2.eventPrefix, K2.offerPrefix];
async function loadWenjin(cache) {
  const keys = await kvKeys();
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.entities.clear();
    cache.fullAt = now;
  }
  const keySet = new Set(keys);
  for (const k of [...cache.entities.keys()]) {
    if (!keySet.has(k)) cache.entities.delete(k);
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)));
  const todo = entityKeys.filter((k) => full || !cache.entities.has(k));
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet(k).catch(() => null);
      return { k, v };
    }));
    for (const { k, v } of fetched) {
      if (v && typeof v === "object" && typeof v.id === "string") cache.entities.set(k, v);
      else if (!v) cache.entities.delete(k);
    }
  }
  cache.knownKeys = keySet;
  const collect = (prefix) => [...cache.entities.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  const [settingsRaw, meta] = await Promise.all([
    kvGet(K2.settings).catch(() => null),
    kvGet(K2.meta).catch(() => null)
  ]);
  return {
    companies: collect(K2.companyPrefix),
    apps: collect(K2.appPrefix),
    resumes: collect(K2.resumePrefix),
    events: collect(K2.eventPrefix),
    offers: collect(K2.offerPrefix),
    settings: core.normalizeSettings(settingsRaw, null),
    meta: meta && typeof meta === "object" ? meta : null
  };
}
async function beat(by) {
  await kvSet(K2.meta, { at: core.nowIso(), by }).catch(() => void 0);
}
async function saveApp(input, existing) {
  const companyName = String(input.companyName ?? existing?.companyName ?? "");
  const a = core.normalizeApp(input, existing, companyName);
  await kvSet(K2.app(a.id), a);
  await beat("panel");
  return a;
}
async function saveResume(input, existing) {
  const r = core.normalizeResume(input, existing);
  await kvSet(K2.resume(r.id), r);
  await beat("panel");
  return r;
}
async function saveEvent(input, existing, appId) {
  const e = core.normalizeEvent(input, existing, appId);
  await kvSet(K2.event(e.id), e);
  await beat("panel");
  return e;
}
async function saveOffer(input, existing, appId) {
  const o = core.normalizeOffer(input, existing, appId);
  await kvSet(K2.offer(o.id), o);
  await beat("panel");
  return o;
}
async function saveSettings(patch, existing) {
  const s = core.normalizeSettings(patch, existing);
  await kvSet(K2.settings, s);
  return s;
}
async function deleteAppCascade(app, events, offers) {
  const evs = events.filter((e) => e.appId === app.id);
  const offs = offers.filter((o) => o.appId === app.id);
  await kvDel(K2.app(app.id));
  for (const e of evs) await kvDel(K2.event(e.id));
  for (const o of offs) await kvDel(K2.offer(o.id));
  await beat("panel");
  return { events: evs.length, offers: offs.length };
}
async function deleteResumeWithRefs(r, apps) {
  const refs = apps.filter((a) => a.resumeId === r.id);
  for (const a of refs) {
    await kvSet(K2.app(a.id), { ...a, resumeId: "", updatedAt: core.nowIso() });
  }
  await kvDel(K2.resume(r.id));
  await beat("panel");
  return refs.length;
}
async function applyImport(result) {
  for (const c of result.companies) await kvSet(K2.company(c.id), c);
  for (const a of result.apps) await kvSet(K2.app(a.id), a);
  for (const e of result.noteEvents) await kvSet(K2.event(e.id), e);
  await beat("panel");
}
async function applyBackup(data) {
  let n = 0;
  for (const c of data.companies || []) {
    if (c && c.id) {
      await kvSet(K2.company(String(c.id)), c);
      n += 1;
    }
  }
  for (const a of data.apps || []) {
    if (a && a.id) {
      await kvSet(K2.app(String(a.id)), a);
      n += 1;
    }
  }
  for (const r of data.resumes || []) {
    if (r && r.id) {
      await kvSet(K2.resume(String(r.id)), r);
      n += 1;
    }
  }
  for (const e of data.events || []) {
    if (e && e.id) {
      await kvSet(K2.event(String(e.id)), e);
      n += 1;
    }
  }
  for (const o of data.offers || []) {
    if (o && o.id) {
      await kvSet(K2.offer(String(o.id)), o);
      n += 1;
    }
  }
  if (data.settings) await kvSet(K2.settings, core.normalizeSettings(data.settings, null));
  await beat("panel");
  return n;
}
function buildView(d) {
  const now = Date.now();
  return {
    pipeline: core.pipeline(d.apps),
    due: core.followUps(d.apps, d.events, d.settings, now),
    upcoming: core.upcoming(d.events, d.settings, now),
    funnelChannel: core.funnelBy(d.apps, d.events, "channel"),
    funnelResume: core.funnelBy(d.apps, d.events, "resumeId"),
    offers: core.offerCompare(d.offers, d.apps),
    questions: core.questionBank(d.events, d.apps)
  };
}
function eventsOf(appId, events) {
  return events.filter((e) => e.appId === appId).slice().sort((x, y) => (core.parseTs(y.at) || 0) - (core.parseTs(x.at) || 0));
}
function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4e3);
}

// src/TodayTab.tsx
var core2 = __toESM(require_core());
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var STATUS_COLORS = {
  wish: "#8B95A7",
  applied: "#58A6FF",
  screening: "#79B8FF",
  written: "#E3B341",
  interview: "#A371F7",
  offered: "#3FB950",
  accepted: "#2EA043",
  rejected: "#F85149",
  withdrawn: "#6E7681"
};
function StatusChips({ data }) {
  const p = core2.pipeline(data.apps);
  const chips = core2.STATUSES.filter((s) => p.counts[s] > 0);
  if (!chips.length) return null;
  return /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(64px,1fr))", gap: 6, padding: "2px 16px 10px" }, children: chips.map((s) => /* @__PURE__ */ jsxs("div", { className: "wj-chip", children: [
    /* @__PURE__ */ jsx("b", { style: { color: STATUS_COLORS[s] || "#E6EAF2" }, children: p.counts[s] }),
    /* @__PURE__ */ jsx("small", { children: core2.STATUS_LABELS[s] })
  ] }, s)) });
}
function DueCard({ data, row, reload, toast }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) {
      toast("\u5199\u70B9\u4EC0\u4E48\u518D\u8BB0", true);
      return;
    }
    setBusy(true);
    try {
      await saveEvent({ type: "note", detail: text.trim(), at: Date.now() }, null, row.app.id);
      toast("\u5DF2\u8BB0\u8DDF\u8FDB");
      setOpen(false);
      setText("");
      await reload();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "wj-card", children: /* @__PURE__ */ jsxs("div", { className: "wj-card-b", children: [
    /* @__PURE__ */ jsxs("div", { className: "wj-row", children: [
      /* @__PURE__ */ jsxs("div", { className: "wj-grow", children: [
        /* @__PURE__ */ jsxs("b", { style: { fontSize: 13 }, children: [
          row.app.companyName,
          " \xB7 ",
          row.app.title
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "wj-sub", children: [
          /* @__PURE__ */ jsxs("span", { className: "wj-tag yellow", style: { marginRight: 6 }, children: [
            "\u5DF2 ",
            row.daysSince,
            " \u5929\u65E0\u8FDB\u5C55"
          ] }),
          core2.STATUS_LABELS[row.app.status] || row.app.status
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "wj-btn sm", onClick: () => setOpen(!open), children: open ? "\u6536\u8D77" : "\u8BB0\u8DDF\u8FDB" })
    ] }),
    open ? /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "wj-inp",
          placeholder: "\u8DDF\u8FDB\u5185\u5BB9\uFF1A\u50AC\u4E86 HR / \u5185\u63A8\u4EBA\u56DE\u590D\u4E86 / \u51B3\u5B9A\u5148\u653E\u7740\uFF08\u4F1A\u8BB0\u8FDB\u65F6\u95F4\u7EBF\uFF09",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "wj-row", style: { marginTop: 6, justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ jsx("button", { className: "wj-btn sm ghost", onClick: () => setOpen(false), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("button", { className: "wj-btn sm", disabled: busy, onClick: save, children: "\u4FDD\u5B58" })
      ] })
    ] }) : null
  ] }) });
}
function TodayTab({ data, view, reload, toast, goTab }) {
  const appById = new Map(data.apps.map((a) => [a.id, a]));
  const { schedule, reminders } = view.upcoming;
  const best = view.funnelChannel.filter((g) => g.responded > 0).sort((x, y) => y.responded - x.responded)[0];
  return /* @__PURE__ */ jsxs("div", { className: "wj-page", children: [
    /* @__PURE__ */ jsxs("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wj-bar" }),
      "\u5728\u9014\u5168\u666F",
      /* @__PURE__ */ jsxs("span", { className: "wj-hint", children: [
        data.apps.filter((a) => !a.archived).length,
        " \u6761\u672A\u5F52\u6863"
      ] })
    ] }),
    view.pipeline.active.length === 0 && data.apps.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "wj-empty", children: [
      "\u53F0\u8D26\u8FD8\u662F\u7A7A\u7684\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u53BB\u804A\u5929\u91CC\u8BF4\u300C\u6295\u4E86 XX \u516C\u53F8\u7684 XX \u5C97\u300D\u5373\u53EF\u5EFA\u6863\uFF0C",
      /* @__PURE__ */ jsx("br", {}),
      "\u6216\u5728\u300C\u6295\u9012\u300D\u9875\u53F3\u4E0A\u89D2\u624B\u52A8\u6DFB\u52A0\u3002"
    ] }) : /* @__PURE__ */ jsx(StatusChips, { data }),
    /* @__PURE__ */ jsxs("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "wj-bar" }),
      "\u8DDF\u8FDB\u5230\u671F",
      /* @__PURE__ */ jsxs("span", { className: "wj-hint", children: [
        "\u8D85\u8FC7 ",
        data.settings.followUpDays,
        " \u5929\u65E0\u8FDB\u5C55\u5C31\u70B9\u540D"
      ] })
    ] }),
    view.due.length === 0 ? /* @__PURE__ */ jsx("div", { className: "wj-card", children: /* @__PURE__ */ jsx("div", { className: "wj-card-b wj-sub", children: "\u2705 \u6682\u65E0\u5230\u671F\u8DDF\u8FDB\u2014\u2014\u6240\u6709\u5728\u6295\u6295\u9012\u8FD1\u671F\u90FD\u6709\u52A8\u9759\u3002" }) }) : view.due.slice(0, 10).map((row) => /* @__PURE__ */ jsx(DueCard, { data, row, reload, toast }, row.app.id)),
    schedule.length || reminders.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "wj-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "wj-bar" }),
        "\u8FD1\u671F\u65E5\u7A0B",
        /* @__PURE__ */ jsx("span", { className: "wj-hint", children: "\u9762\u8BD5/\u7B14\u8BD5 + \u5230\u70B9\u63D0\u9192" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wj-card", children: /* @__PURE__ */ jsxs("div", { className: "wj-card-b wj-tl", children: [
        schedule.map((e) => {
          const a = appById.get(e.appId);
          return /* @__PURE__ */ jsxs("div", { className: "wj-tl-item", children: [
            /* @__PURE__ */ jsxs("div", { className: "wj-row", children: [
              /* @__PURE__ */ jsx("b", { style: { fontSize: 12.5 }, children: core2.fmtDateTime(core2.parseTs(e.at) || 0) }),
              /* @__PURE__ */ jsx("span", { className: "wj-tag purple", children: core2.EVENT_LABELS[e.type] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "wj-sub", children: [
              a ? `${a.companyName} \xB7 ${a.title}` : "(\u6295\u9012\u5DF2\u5220)",
              e.title ? ` \u2014 ${e.title}` : "",
              e.detail ? `\uFF1B${e.detail.length > 60 ? e.detail.slice(0, 60) + "\u2026" : e.detail}` : ""
            ] })
          ] }, e.id);
        }),
        reminders.map((e) => {
          const a = appById.get(e.appId);
          return /* @__PURE__ */ jsxs("div", { className: "wj-tl-item", children: [
            /* @__PURE__ */ jsxs("div", { className: "wj-row", children: [
              /* @__PURE__ */ jsx("b", { style: { fontSize: 12.5, color: "#E3B341" }, children: "\u23F0 \u63D0\u9192" }),
              /* @__PURE__ */ jsx("span", { className: "wj-tag yellow", children: core2.fmtDateTime(core2.parseTs(e.remindAt) || 0) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "wj-sub", children: [
              a ? `${a.companyName} \xB7 ${a.title}` : "",
              e.title || e.detail ? ` \u2014 ${e.title || e.detail}` : ""
            ] })
          ] }, e.id);
        })
      ] }) })
    ] }) : null,
    best ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "wj-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "wj-bar" }),
        "\u6E20\u9053\u4E00\u53E5\u8BDD"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wj-card", children: /* @__PURE__ */ jsxs("div", { className: "wj-card-b wj-sub", children: [
        /* @__PURE__ */ jsx("b", { style: { color: "#79B8FF" }, children: best.key }),
        "\uFF1A\u5DF2\u6295 ",
        best.submitted,
        "\u3001\u6709\u56DE\u97F3 ",
        best.responded,
        best.respondedRate ? `\uFF08\u56DE\u590D\u7387 ${best.respondedRate}\uFF09` : "\uFF08\u6837\u672C <5 \u4E0D\u51FA\u767E\u5206\u6BD4\uFF09",
        best.interviewed ? `\u3001\u8D70\u5230\u9762\u8BD5 ${best.interviewed}` : "",
        "\u3002",
        /* @__PURE__ */ jsx("button", { className: "wj-btn sm ghost", style: { marginLeft: 6 }, onClick: () => goTab("insight"), children: "\u770B\u5B8C\u6574\u6F0F\u6597" })
      ] }) })
    ] }) : null,
    view.offers.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "wj-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "wj-bar" }),
        "offer \u6982\u51B5"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wj-card", children: /* @__PURE__ */ jsxs("div", { className: "wj-card-b wj-sub", children: [
        "\u5171 ",
        view.offers.length,
        " \u4EFD offer \u6863\u6848\uFF1B\u5F53\u524D\u6700\u4F18\u5E74\u5316",
        /* @__PURE__ */ jsxs("b", { style: { color: "#3FB950" }, children: [
          " ",
          view.offers[0].annual.toLocaleString(),
          " \u5143"
        ] }),
        "\uFF08",
        view.offers[0].companyName,
        "\uFF09\u3002",
        /* @__PURE__ */ jsx("button", { className: "wj-btn sm ghost", style: { marginLeft: 6 }, onClick: () => goTab("insight"), children: "\u9010\u9879\u5BF9\u6BD4" })
      ] }) })
    ] }) : null
  ] });
}

// src/AppsTab.tsx
var core3 = __toESM(require_core());
import { useMemo, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var STATUS_COLORS2 = {
  wish: "#8B95A7",
  applied: "#58A6FF",
  screening: "#79B8FF",
  written: "#E3B341",
  interview: "#A371F7",
  offered: "#3FB950",
  accepted: "#2EA043",
  rejected: "#F85149",
  withdrawn: "#6E7681"
};
function statusTag(s) {
  const c = STATUS_COLORS2[s] || "#8B95A7";
  return /* @__PURE__ */ jsx2("span", { className: "wj-tag", style: { color: c, borderColor: c + "55", background: c + "18" }, children: core3.STATUS_LABELS[s] || s });
}
function relDay(ms) {
  if (ms == null) return "";
  const d0 = /* @__PURE__ */ new Date();
  d0.setHours(0, 0, 0, 0);
  const diff = Math.round((ms - d0.getTime()) / core3.DAY_MS);
  if (diff === 0) return "\u4ECA\u5929";
  if (diff === 1) return "\u660E\u5929";
  if (diff === -1) return "\u6628\u5929";
  return diff < 0 ? `${-diff} \u5929\u524D` : `${diff} \u5929\u540E`;
}
function EventForm({ app, existing, onDone, toast }) {
  const [type, setType] = useState2(existing?.type || "note");
  const [at, setAt] = useState2(existing ? (existing.at || "").slice(0, 16).replace("T", " ") : "");
  const [label, setLabel] = useState2(existing?.title || "");
  const [detail, setDetail] = useState2(existing?.detail || "");
  const [outcome, setOutcome] = useState2(existing?.outcome || "");
  const [remindAt, setRemindAt] = useState2(existing?.remindAt ? existing.remindAt.slice(0, 16).replace("T", " ") : "");
  const [busy, setBusy] = useState2(false);
  const submit = async () => {
    setBusy(true);
    try {
      await saveEvent({ type, at: at || Date.now(), title: label, detail, outcome, remindAt }, existing, app.id);
      toast(existing ? "\u4E8B\u4EF6\u5DF2\u66F4\u65B0" : "\u8FDB\u5C55\u5DF2\u8BB0");
      await onDone();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { style: { borderTop: "1px solid #1c2230", marginTop: 8, paddingTop: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "wj-grid2", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u7C7B\u578B" }),
        /* @__PURE__ */ jsx2("select", { className: "wj-sel", value: type, onChange: (e) => setType(e.target.value), children: core3.EVENT_TYPES.map((t) => /* @__PURE__ */ jsx2("option", { value: t, children: core3.EVENT_LABELS[t] }, t)) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u65F6\u95F4\uFF08\u7559\u7A7A=\u73B0\u5728\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "2026-11-02 14:30", value: at, onChange: (e) => setAt(e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u77ED\u6807\u9898\uFF08\u5982\u300C\u4E8C\u9762\u300D\uFF09" }),
    /* @__PURE__ */ jsx2("input", { className: "wj-inp", value: label, onChange: (e) => setLabel(e.target.value) }),
    /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u8BE6\u60C5 / \u590D\u76D8" }),
    /* @__PURE__ */ jsx2("textarea", { className: "wj-inp", placeholder: "\u8FC7\u7A0B\u8BB0\u5F55\uFF1B\u88AB\u95EE\u7684\u95EE\u9898\u4E5F\u53EF\u4EE5\u5199\u5728\u8FD9\u91CC\uFF08\u6BCF\u884C\u4E00\u4E2A\u4F1A\u8FDB\u590D\u76D8\u5E93\uFF09", value: detail, onChange: (e) => setDetail(e.target.value) }),
    /* @__PURE__ */ jsxs2("div", { className: "wj-grid2", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u7ED3\u679C\uFF08\u4EC5\u300C\u7ED3\u679C\u300D\u4E8B\u4EF6\uFF09" }),
        /* @__PURE__ */ jsxs2("select", { className: "wj-sel", value: outcome, onChange: (e) => setOutcome(e.target.value), children: [
          /* @__PURE__ */ jsx2("option", { value: "", children: "\u4E0D\u586B" }),
          /* @__PURE__ */ jsx2("option", { value: "pass", children: "\u901A\u8FC7" }),
          /* @__PURE__ */ jsx2("option", { value: "fail", children: "\u672A\u8FC7" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u63D0\u9192\uFF08\u53EF\u7A7A\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "2026-11-09 09:00", value: remindAt, onChange: (e) => setRemindAt(e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "wj-row", style: { justifyContent: "flex-end", marginTop: 8 }, children: /* @__PURE__ */ jsx2("button", { className: "wj-btn sm", disabled: busy, onClick: submit, children: existing ? "\u4FDD\u5B58\u4FEE\u6539" : "\u8BB0\u4E0B" }) })
  ] });
}
function OfferForm({ app, existing, onDone, toast }) {
  const [f, setF] = useState2({
    baseMonthly: existing ? String(existing.baseMonthly) : "",
    months: existing ? String(existing.months) : "12",
    bonusMonths: existing ? String(existing.bonusMonths) : "0",
    commuteMin: existing ? String(existing.commuteMin) : "",
    remoteDays: existing ? String(existing.remoteDays) : "",
    stockNote: existing?.stockNote || "",
    deadline: existing?.deadline ? existing.deadline.slice(0, 16).replace("T", " ") : "",
    note: existing?.note || ""
  });
  const [busy, setBusy] = useState2(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    const base = Number(f.baseMonthly);
    if (!(base > 0)) {
      toast("\u6708\u85AA\u5FC5\u987B\u662F\u6B63\u6570", true);
      return;
    }
    setBusy(true);
    try {
      await saveOffer({
        baseMonthly: base,
        months: Number(f.months) || 12,
        bonusMonths: Number(f.bonusMonths) || 0,
        commuteMin: Number(f.commuteMin) || 0,
        remoteDays: Number(f.remoteDays) || 0,
        stockNote: f.stockNote,
        deadline: f.deadline,
        note: f.note
      }, existing, app.id);
      toast("offer \u5DF2\u5165\u6863\uFF08\u5E74\u5316\u89C1\u6D1E\u5BDF\u9875\uFF09");
      await onDone();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { style: { borderTop: "1px solid #1c2230", marginTop: 8, paddingTop: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "wj-grid2", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u6708\u85AA\uFF08\u5143\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "35000", value: f.baseMonthly, onChange: set("baseMonthly") })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u5408\u540C\u6708\u6570" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "12", value: f.months, onChange: set("months") })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u5E74\u7EC8\u5956\u6708\u6570" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "0", value: f.bonusMonths, onChange: set("bonusMonths") })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u5355\u7A0B\u901A\u52E4\uFF08\u5206\u949F\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "45", value: f.commuteMin, onChange: set("commuteMin") })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u6BCF\u5468\u8FDC\u7A0B\uFF08\u5929\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "0", value: f.remoteDays, onChange: set("remoteDays") })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u7B54\u590D\u622A\u6B62\uFF08\u53EF\u7A7A\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "2026-11-05 18:00", value: f.deadline, onChange: set("deadline") })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u671F\u6743 / \u80A1\u7968 / \u7B7E\u5B57\u8D39\uFF08\u53EA\u8BB0\u6587\u672C\uFF0C\u4E0D\u8BA1\u4EF7\uFF09" }),
    /* @__PURE__ */ jsx2("input", { className: "wj-inp", value: f.stockNote, onChange: set("stockNote") }),
    /* @__PURE__ */ jsx2("div", { className: "wj-row", style: { justifyContent: "flex-end", marginTop: 8 }, children: /* @__PURE__ */ jsx2("button", { className: "wj-btn sm", disabled: busy, onClick: submit, children: "\u4FDD\u5B58 offer" }) })
  ] });
}
function AppDetail({ data, app, reload, toast }) {
  const [showEvent, setShowEvent] = useState2(false);
  const [editEvent, setEditEvent] = useState2(null);
  const [showOffer, setShowOffer] = useState2(false);
  const [confirmDel, setConfirmDel] = useState2(false);
  const [busy, setBusy] = useState2(false);
  const resume = data.resumes.find((r) => r.id === app.resumeId);
  const offer = data.offers.find((o) => o.appId === app.id);
  const events = eventsOf(app.id, data.events);
  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await saveApp({ status }, app);
      toast(`\u72B6\u6001 \u2192 ${core3.STATUS_LABELS[status] || status}`);
      await reload();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setBusy(true);
    try {
      const r = await deleteAppCascade(app, data.events, data.offers);
      toast(`\u5DF2\u5220\u9664\uFF08\u7EA7\u8054 ${r.events} \u4E8B\u4EF6 / ${r.offers} offer\uFF09`);
      await reload();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { style: { borderTop: "1px solid #1c2230", marginTop: 8, paddingTop: 10 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "wj-row", style: { flexWrap: "wrap", gap: 6 }, children: [
      app.appliedAt ? /* @__PURE__ */ jsxs2("span", { className: "wj-sub", children: [
        "\u6295\u9012\u4E8E ",
        core3.fmtDateTime(core3.parseTs(app.appliedAt) || 0)
      ] }) : null,
      app.location ? /* @__PURE__ */ jsx2("span", { className: "wj-tag", children: app.location }) : null,
      app.salaryPosted ? /* @__PURE__ */ jsx2("span", { className: "wj-tag blue", children: app.salaryPosted }) : null,
      resume ? /* @__PURE__ */ jsxs2("span", { className: "wj-tag purple", children: [
        "\u7B80\u5386\uFF1A",
        resume.label
      ] }) : null,
      /* @__PURE__ */ jsx2("span", { className: "wj-tag", children: core3.CHANNEL_LABELS[app.channel] || app.channel })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "wj-row", style: { marginTop: 8, gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "wj-sub", children: "\u72B6\u6001" }),
      /* @__PURE__ */ jsx2(
        "select",
        {
          className: "wj-sel",
          style: { width: "auto" },
          disabled: busy,
          value: app.status,
          onChange: (e) => changeStatus(e.target.value),
          children: core3.STATUSES.map((s) => /* @__PURE__ */ jsx2("option", { value: s, children: core3.STATUS_LABELS[s] }, s))
        }
      ),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("button", { className: "wj-btn sm ghost", onClick: () => {
        setShowEvent(!showEvent);
        setEditEvent(null);
      }, children: showEvent && !editEvent ? "\u6536\u8D77\u8868\u5355" : "\u8BB0\u8FDB\u5C55" }),
      /* @__PURE__ */ jsx2("button", { className: "wj-btn sm ok", onClick: () => setShowOffer(!showOffer), children: offer && !showOffer ? "\u770B offer" : offer ? "\u6536\u8D77 offer" : "\u5F55 offer" }),
      /* @__PURE__ */ jsx2("button", { className: "wj-btn sm danger", disabled: busy, onClick: del, children: confirmDel ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u5220\u9664" : "\u5220\u9664" })
    ] }),
    showEvent || editEvent ? /* @__PURE__ */ jsx2(EventForm, { app, existing: editEvent, onDone: async () => {
      setEditEvent(null);
      setShowEvent(false);
      await reload();
    }, toast }) : null,
    showOffer ? /* @__PURE__ */ jsx2(OfferForm, { app, existing: offer || null, onDone: async () => {
      await reload();
    }, toast }) : offer ? /* @__PURE__ */ jsxs2("div", { className: "wj-sub", style: { marginTop: 8, background: "#12151c", border: "1px solid #1c2230", borderRadius: 8, padding: "8px 10px" }, children: [
      "\u{1F4B0} offer\uFF1A\u6708\u85AA ",
      offer.baseMonthly.toLocaleString(),
      " \xD7 ",
      offer.months + offer.bonusMonths,
      " \u6708 =",
      /* @__PURE__ */ jsxs2("b", { style: { color: "#3FB950" }, children: [
        " ",
        Math.round(offer.baseMonthly * (offer.months + offer.bonusMonths)).toLocaleString(),
        " \u5143/\u5E74"
      ] }),
      offer.commuteMin > 0 ? ` \xB7 \u5355\u7A0B\u901A\u52E4 ${offer.commuteMin} \u5206` : "",
      offer.stockNote ? ` \xB7 ${offer.stockNote}` : ""
    ] }) : null,
    app.jd ? /* @__PURE__ */ jsxs2("details", { style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsxs2("summary", { className: "wj-sub", style: { cursor: "pointer" }, children: [
        "JD \u5B58\u6863\uFF08",
        app.jd.length,
        " \u5B57\uFF09"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "wj-sub", style: { whiteSpace: "pre-wrap", marginTop: 6, maxHeight: 200, overflowY: "auto", background: "#12151c", borderRadius: 8, padding: 8 }, children: app.jd })
    ] }) : null,
    app.note ? /* @__PURE__ */ jsxs2("div", { className: "wj-sub", style: { marginTop: 6 }, children: [
      "\u{1F4DD} ",
      app.note
    ] }) : null,
    /* @__PURE__ */ jsxs2("div", { className: "wj-lbl", children: [
      "\u65F6\u95F4\u7EBF\uFF08",
      events.length,
      " \u6761\u4E8B\u4EF6\uFF09"
    ] }),
    events.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "wj-sub", children: "\u8FD8\u6CA1\u6709\u4E8B\u4EF6\u2014\u2014\u70B9\u300C\u8BB0\u8FDB\u5C55\u300D\u5F00\u59CB\u8BB0\u8D26\u3002" }) : /* @__PURE__ */ jsx2("div", { className: "wj-tl", children: events.map((e) => /* @__PURE__ */ jsxs2("div", { className: `wj-tl-item ${e.type === "note" ? "dim" : ""}`, children: [
      /* @__PURE__ */ jsxs2("div", { className: "wj-row", style: { flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 12 }, children: core3.fmtDateTime(core3.parseTs(e.at) || 0) }),
        /* @__PURE__ */ jsx2("span", { className: "wj-tag purple", children: core3.EVENT_LABELS[e.type] || e.type }),
        e.outcome ? /* @__PURE__ */ jsx2("span", { className: `wj-tag ${e.outcome === "pass" ? "green" : "red"}`, children: core3.OUTCOME_LABELS[e.outcome] }) : null,
        e.title ? /* @__PURE__ */ jsx2("b", { style: { fontSize: 12 }, children: e.title }) : null,
        /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx2("button", { className: "wj-btn sm ghost", onClick: () => {
          setEditEvent(e);
          setShowEvent(true);
        }, children: "\u6539" })
      ] }),
      e.detail ? /* @__PURE__ */ jsx2("div", { className: "wj-sub", style: { whiteSpace: "pre-wrap" }, children: e.detail }) : null,
      e.questions && e.questions.length ? /* @__PURE__ */ jsxs2("div", { className: "wj-sub", children: [
        "\u2753 ",
        e.questions.join(" / ")
      ] }) : null
    ] }, e.id)) })
  ] });
}
function AppsTab({ data, view, reload, toast }) {
  const [status, setStatus] = useState2("active");
  const [channel, setChannel] = useState2("all");
  const [kw, setKw] = useState2("");
  const [openId, setOpenId] = useState2("");
  const [adding, setAdding] = useState2(false);
  const [form, setForm] = useState2({ company: "", title: "", channel: "boss", status: "applied", salaryPosted: "", location: "", note: "", appliedAt: "" });
  const [busy, setBusy] = useState2(false);
  const dueMap = useMemo(() => new Map(view.due.map((d) => [d.app.id, d.daysSince])), [view.due]);
  const lastEventOf = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const e of data.events) {
      const prev = m.get(e.appId);
      if (!prev || (core3.parseTs(e.at) || 0) > (core3.parseTs(prev.at) || 0)) m.set(e.appId, e);
    }
    return m;
  }, [data.events]);
  const list = useMemo(() => {
    let l = data.apps.slice();
    if (status === "active") l = l.filter((a) => !a.archived && core3.ACTIVE_STATUSES.includes(a.status));
    else if (status === "archived") l = l.filter((a) => a.archived);
    else if (status !== "all") l = l.filter((a) => a.status === status);
    if (channel !== "all") l = l.filter((a) => a.channel === channel);
    if (kw.trim()) {
      const k = core3.normName(kw);
      l = l.filter((a) => core3.normName(a.companyName).includes(k) || core3.normName(a.title).includes(k) || core3.normName(a.note).includes(k));
    }
    l.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    return l;
  }, [data.apps, status, channel, kw]);
  const addApp = async () => {
    if (!form.company.trim() || !form.title.trim()) {
      toast("\u516C\u53F8\u548C\u804C\u4F4D\u90FD\u8981\u586B", true);
      return;
    }
    setBusy(true);
    try {
      const dup = data.apps.find((a) => core3.normName(a.companyName) === core3.normName(form.company) && core3.normName(a.title) === core3.normName(form.title));
      if (dup) {
        toast("\u5DF2\u5B58\u5728\u540C\u516C\u53F8\u540C\u804C\u4F4D\u6295\u9012\uFF0C\u5C55\u5F00\u5B83\u76F4\u63A5\u8BB0\u8FDB\u5C55", true);
        setAdding(false);
        setOpenId(dup.id);
        return;
      }
      await saveApp({
        companyName: form.company,
        title: form.title,
        channel: form.channel,
        status: form.status,
        salaryPosted: form.salaryPosted,
        location: form.location,
        note: form.note,
        appliedAt: form.status === "wish" ? "" : form.appliedAt || Date.now()
      }, null);
      toast("\u5DF2\u5EFA\u6863");
      setAdding(false);
      setForm({ company: "", title: "", channel: "boss", status: "applied", salaryPosted: "", location: "", note: "", appliedAt: "" });
      await reload();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "wj-page", children: [
    /* @__PURE__ */ jsxs2("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "wj-bar" }),
      "\u6295\u9012\u53F0\u8D26",
      /* @__PURE__ */ jsxs2("span", { className: "wj-hint", children: [
        list.length,
        " \u6761"
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "wj-btn sm", style: { marginLeft: 8 }, onClick: () => setAdding(!adding), children: adding ? "\u6536\u8D77" : "+ \u5EFA\u6863" })
    ] }),
    adding ? /* @__PURE__ */ jsx2("div", { className: "wj-card", children: /* @__PURE__ */ jsxs2("div", { className: "wj-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "wj-grid2", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u516C\u53F8 *" }),
          /* @__PURE__ */ jsx2("input", { className: "wj-inp", value: form.company, onChange: (e) => setForm({ ...form, company: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u804C\u4F4D *" }),
          /* @__PURE__ */ jsx2("input", { className: "wj-inp", value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u6E20\u9053" }),
          /* @__PURE__ */ jsx2("select", { className: "wj-sel", value: form.channel, onChange: (e) => setForm({ ...form, channel: e.target.value }), children: core3.CHANNELS.map((c) => /* @__PURE__ */ jsx2("option", { value: c, children: core3.CHANNEL_LABELS[c] }, c)) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u72B6\u6001" }),
          /* @__PURE__ */ jsx2("select", { className: "wj-sel", value: form.status, onChange: (e) => setForm({ ...form, status: e.target.value }), children: core3.STATUSES.map((s) => /* @__PURE__ */ jsx2("option", { value: s, children: core3.STATUS_LABELS[s] }, s)) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u671F\u671B\u85AA\u8D44" }),
          /* @__PURE__ */ jsx2("input", { className: "wj-inp", placeholder: "25-35k\xB716\u85AA", value: form.salaryPosted, onChange: (e) => setForm({ ...form, salaryPosted: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("span", { className: "wj-lbl", children: "\u5730\u70B9" }),
          /* @__PURE__ */ jsx2("input", { className: "wj-inp", value: form.location, onChange: (e) => setForm({ ...form, location: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "wj-row", style: { justifyContent: "flex-end", marginTop: 8 }, children: /* @__PURE__ */ jsx2("button", { className: "wj-btn sm", disabled: busy, onClick: addApp, children: "\u5EFA\u6863" }) })
    ] }) }) : null,
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, padding: "0 16px 10px", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs2("select", { className: "wj-sel", style: { width: "auto" }, value: status, onChange: (e) => setStatus(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "active", children: "\u5728\u9014" }),
        /* @__PURE__ */ jsx2("option", { value: "all", children: "\u5168\u90E8" }),
        core3.STATUSES.map((s) => /* @__PURE__ */ jsx2("option", { value: s, children: core3.STATUS_LABELS[s] }, s)),
        /* @__PURE__ */ jsx2("option", { value: "archived", children: "\u5DF2\u5F52\u6863" })
      ] }),
      /* @__PURE__ */ jsxs2("select", { className: "wj-sel", style: { width: "auto" }, value: channel, onChange: (e) => setChannel(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "all", children: "\u5168\u6E20\u9053" }),
        core3.CHANNELS.map((c) => /* @__PURE__ */ jsx2("option", { value: c, children: core3.CHANNEL_LABELS[c] }, c))
      ] }),
      /* @__PURE__ */ jsx2("input", { className: "wj-inp", style: { flex: 1, minWidth: 120 }, placeholder: "\u641C\u516C\u53F8 / \u804C\u4F4D / \u5907\u6CE8", value: kw, onChange: (e) => setKw(e.target.value) })
    ] }),
    list.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "wj-empty", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6295\u9012\u3002" }) : list.map((a) => {
      const last = lastEventOf.get(a.id);
      const due = dueMap.get(a.id);
      const open = openId === a.id;
      return /* @__PURE__ */ jsx2("div", { className: "wj-card", children: /* @__PURE__ */ jsxs2("div", { className: "wj-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "wj-row", style: { cursor: "pointer" }, onClick: () => setOpenId(open ? "" : a.id), children: [
          /* @__PURE__ */ jsxs2("div", { className: "wj-grow", children: [
            /* @__PURE__ */ jsxs2("div", { className: "wj-row", style: { flexWrap: "wrap", gap: 6 }, children: [
              /* @__PURE__ */ jsxs2("b", { style: { fontSize: 13 }, children: [
                a.companyName,
                " \xB7 ",
                a.title
              ] }),
              statusTag(a.status),
              a.archived ? /* @__PURE__ */ jsx2("span", { className: "wj-tag", children: "\u5DF2\u5F52\u6863" }) : null
            ] }),
            /* @__PURE__ */ jsx2("div", { className: "wj-sub", style: { marginTop: 2 }, children: last ? `${core3.EVENT_LABELS[last.type] || last.type}${last.title ? `\uFF08${last.title}\uFF09` : ""} \xB7 ${relDay(core3.parseTs(last.at))}${last.detail ? ` \xB7 ${last.detail.slice(0, 40)}` : ""}` : a.status === "wish" ? "\u60F3\u6295\uFF0C\u8FD8\u6CA1\u6295\u51FA" : "\u6682\u65E0\u4E8B\u4EF6" })
          ] }),
          due != null ? /* @__PURE__ */ jsxs2("span", { className: "wj-tag yellow", children: [
            "\u50AC ",
            due,
            "\u5929"
          ] }) : null,
          /* @__PURE__ */ jsx2("span", { className: "wj-sub", children: open ? "\u25BE" : "\u25B8" })
        ] }),
        open ? /* @__PURE__ */ jsx2(AppDetail, { data, app: a, reload, toast }) : null
      ] }) }, a.id);
    })
  ] });
}

// src/InsightTab.tsx
var core4 = __toESM(require_core());
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function FunnelTable({ rows, resumeNames }) {
  if (!rows.length) return /* @__PURE__ */ jsx3("div", { className: "wj-card", children: /* @__PURE__ */ jsx3("div", { className: "wj-card-b wj-sub", children: "\u8FD8\u6CA1\u6709\u6295\u51FA\u53BB\u7684\u8BB0\u5F55\u2014\u2014\u5EFA\u6863\u5E76\u6295\u51FA\u540E\uFF0C\u6F0F\u6597\u4F1A\u5728\u8FD9\u91CC\u957F\u51FA\u6765\u3002" }) });
  const small = rows.some((g) => g.submitted < 5);
  return /* @__PURE__ */ jsx3("div", { className: "wj-card", children: /* @__PURE__ */ jsxs3("div", { className: "wj-card-b", style: { overflowX: "auto" }, children: [
    /* @__PURE__ */ jsxs3("table", { className: "wj-tbl", children: [
      /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("th", { children: resumeNames ? "\u7B80\u5386\u7248\u672C" : "\u6E20\u9053" }),
        /* @__PURE__ */ jsx3("th", { children: "\u6295\u9012" }),
        /* @__PURE__ */ jsx3("th", { children: "\u56DE\u97F3" }),
        /* @__PURE__ */ jsx3("th", { children: "\u9762\u8BD5" }),
        /* @__PURE__ */ jsx3("th", { children: "offer" })
      ] }) }),
      /* @__PURE__ */ jsx3("tbody", { children: rows.map((g) => /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("td", { children: resumeNames ? resumeNames.get(g.key) || g.key : g.key }),
        /* @__PURE__ */ jsx3("td", { className: "wj-num", children: g.submitted }),
        /* @__PURE__ */ jsxs3("td", { className: "wj-num", children: [
          g.responded,
          g.respondedRate ? /* @__PURE__ */ jsxs3("span", { className: "wj-sub", children: [
            " ",
            g.respondedRate
          ] }) : null
        ] }),
        /* @__PURE__ */ jsxs3("td", { className: "wj-num", children: [
          g.interviewed,
          g.interviewedRate ? /* @__PURE__ */ jsxs3("span", { className: "wj-sub", children: [
            " ",
            g.interviewedRate
          ] }) : null
        ] }),
        /* @__PURE__ */ jsxs3("td", { className: "wj-num", children: [
          g.offered,
          g.offeredRate ? /* @__PURE__ */ jsxs3("span", { className: "wj-sub", children: [
            " ",
            g.offeredRate
          ] }) : null
        ] })
      ] }, g.key)) })
    ] }),
    small ? /* @__PURE__ */ jsx3("div", { className: "wj-sub", style: { marginTop: 6 }, children: "\u6837\u672C <5 \u7684\u884C\u53EA\u7ED9\u8BA1\u6570\u4E0D\u7ED9\u51FA\u767E\u5206\u6BD4\u2014\u2014\u6837\u672C\u4F1A\u6492\u8C0E\uFF0C\u95EE\u6D25\u9009\u62E9\u8BDA\u5B9E\u3002" }) : null,
    /* @__PURE__ */ jsx3("div", { className: "wj-sub", style: { marginTop: 4 }, children: "\u53E3\u5F84\uFF1A\u6295\u9012\u2192\u56DE\u97F3\u2192\u9762\u8BD5\u2192offer \u9010\u7EA7\u8F6C\u5316\uFF1B\u88AB\u62D2\u4E5F\u7B97\u300C\u6709\u56DE\u97F3\u300D\u3002" })
  ] }) });
}
function InsightTab({ data, view }) {
  const resumeNames = new Map(data.resumes.map((r) => [r.id, r.label]));
  const hasResumes = view.funnelResume.some((g) => g.key !== "(\u672A\u6807\u6CE8)");
  return /* @__PURE__ */ jsxs3("div", { className: "wj-page", children: [
    /* @__PURE__ */ jsxs3("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "wj-bar" }),
      "\u6E20\u9053\u6F0F\u6597",
      /* @__PURE__ */ jsx3("span", { className: "wj-hint", children: "\u6295\u9012 \u2192 \u56DE\u97F3 \u2192 \u9762\u8BD5 \u2192 offer" })
    ] }),
    /* @__PURE__ */ jsx3(FunnelTable, { rows: view.funnelChannel }),
    /* @__PURE__ */ jsxs3("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "wj-bar" }),
      "\u7B80\u5386\u7248\u672C\u6F0F\u6597",
      /* @__PURE__ */ jsx3("span", { className: "wj-hint", children: hasResumes ? "\u54EA\u7248\u7B80\u5386\u56DE\u590D\u7387\u9AD8" : "\u6295\u9012\u65F6\u6807\u6CE8\u7B80\u5386\u7248\u672C\u5373\u53EF\u79EF\u7D2F" })
    ] }),
    /* @__PURE__ */ jsx3(FunnelTable, { rows: view.funnelResume, resumeNames }),
    /* @__PURE__ */ jsxs3("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "wj-bar" }),
      "\u590D\u76D8\u95EE\u9898\u5E93",
      /* @__PURE__ */ jsx3("span", { className: "wj-hint", children: "\u9762\u8BD5\u540E\u628A\u95EE\u9898\u8BB0\u8FDB\u4E8B\u4EF6\uFF0C\u91CD\u590D\u51FA\u73B0\u7684\u4F1A\u6D6E\u4E0A\u6765" })
    ] }),
    view.questions.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "wj-card", children: /* @__PURE__ */ jsx3("div", { className: "wj-card-b wj-sub", children: "\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002\u9762\u8BD5\u590D\u76D8\u65F6\u7528\u300C\u8BB0\u8FDB\u5C55\u300D\u628A\u88AB\u95EE\u7684\u95EE\u9898\u9010\u6761\u5199\u4E0B\uFF08\u4E0B\u4E00\u573A\u5C31\u4F60\u77E5\u9053\u5B83\u4F1A\u8003\u4EC0\u4E48\uFF09\u3002" }) }) : /* @__PURE__ */ jsx3("div", { className: "wj-card", children: /* @__PURE__ */ jsx3("div", { className: "wj-card-b", children: view.questions.slice(0, 30).map((q, i) => /* @__PURE__ */ jsxs3("div", { style: { padding: "6px 0", borderBottom: i < Math.min(view.questions.length, 30) - 1 ? "1px solid #1c2230" : "none" }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "wj-row", children: [
        /* @__PURE__ */ jsxs3("span", { className: "wj-tag purple", children: [
          "\xD7",
          q.count
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "wj-grow", style: { fontSize: 12.5 }, children: q.q })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "wj-sub", style: { marginTop: 2 }, children: [
        "\u6765\u6E90\uFF1A",
        q.companies.slice(0, 4).join("\u3001"),
        q.companies.length > 4 ? ` \u7B49 ${q.companies.length} \u5BB6` : ""
      ] })
    ] }, i)) }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "wj-bar" }),
      "offer \u5BF9\u6BD4",
      /* @__PURE__ */ jsx3("span", { className: "wj-hint", children: "\u5E74\u5316 = \u6708\u85AA \xD7 (\u5408\u540C\u6708\u6570 + \u5956\u91D1\u6708\u6570)" })
    ] }),
    view.offers.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "wj-card", children: /* @__PURE__ */ jsx3("div", { className: "wj-card-b wj-sub", children: "\u8FD8\u6CA1\u6709 offer \u6863\u6848\u3002\u5728\u6295\u9012\u8BE6\u60C5\u91CC\u70B9\u300C\u5F55 offer\u300D\u5F55\u5165\u85AA\u8D44\u7ED3\u6784\u3002" }) }) : view.offers.map((r, i) => /* @__PURE__ */ jsx3("div", { className: "wj-card", children: /* @__PURE__ */ jsxs3("div", { className: "wj-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "wj-row", style: { flexWrap: "wrap", gap: 6 }, children: [
        r.deltaVsBest === 0 ? /* @__PURE__ */ jsx3("span", { className: "wj-tag green", children: "\u6700\u4F18" }) : null,
        /* @__PURE__ */ jsxs3("b", { style: { fontSize: 13 }, children: [
          i + 1,
          ". ",
          r.companyName,
          " \xB7 ",
          r.title
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "wj-sub", style: { marginTop: 4 }, children: [
        "\u6708\u85AA ",
        /* @__PURE__ */ jsx3("b", { className: "wj-num", children: r.offer.baseMonthly.toLocaleString() }),
        " \xD7 ",
        r.offer.months,
        " \u4E2A\u6708",
        r.offer.bonusMonths ? ` + \u5E74\u7EC8 ${r.offer.bonusMonths} \u4E2A\u6708` : "",
        " = ",
        /* @__PURE__ */ jsxs3("b", { style: { color: "#3FB950" }, className: "wj-num", children: [
          r.annual.toLocaleString(),
          " \u5143/\u5E74"
        ] }),
        r.deltaVsBest ? /* @__PURE__ */ jsxs3("span", { className: "wj-sub", children: [
          "\uFF08\u8F83\u6700\u4F18 ",
          r.deltaVsBest > 0 ? "+" : "",
          r.deltaVsBest.toLocaleString(),
          "\uFF09"
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "wj-sub", style: { marginTop: 2 }, children: [
        r.offer.remoteDays > 0 ? `\u6BCF\u5468\u8FDC\u7A0B ${r.offer.remoteDays} \u5929 \xB7 ` : "",
        r.commuteHoursPerYear != null ? `\u5E74\u901A\u52E4\u7EA6 ${r.commuteHoursPerYear} \u5C0F\u65F6 \xB7 ` : "",
        r.offer.stockNote ? `\u80A1\u7968/\u671F\u6743\uFF1A${r.offer.stockNote}` : ""
      ] }),
      r.offer.deadline ? /* @__PURE__ */ jsxs3("div", { className: "wj-sub", style: { marginTop: 2 }, children: [
        "\u7B54\u590D\u622A\u6B62\uFF1A",
        core4.fmtDateTime(core4.parseTs(r.offer.deadline) || 0)
      ] }) : null
    ] }) }, r.offer.id)),
    view.offers.length > 1 ? /* @__PURE__ */ jsx3("div", { className: "wj-sub", style: { padding: "0 18px" }, children: "\u5BF9\u6BD4\u53EA\u7B97\u94B1\u4E0E\u901A\u52E4\uFF1B\u671F\u6743\u672A\u8BA1\u4EF7\u3001\u6210\u957F/\u56E2\u961F/\u7A33\u5B9A\u6027\u65E0\u6CD5\u91CF\u5316\u2014\u2014\u8BF7\u7ED3\u5408\u81EA\u8EAB\u5224\u65AD\u3002" }) : null
  ] });
}

// src/SettingsTab.tsx
var core5 = __toESM(require_core());
import { useRef, useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function ResumeRow({ r, apps, appsCount, reload, toast }) {
  const [open, setOpen] = useState3(false);
  const [label, setLabel] = useState3(r.label);
  const [content, setContent] = useState3(r.content);
  const [note, setNote] = useState3(r.note);
  const [busy, setBusy] = useState3(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveResume({ label: r.label, content, note }, r);
      toast("\u7B80\u5386\u7248\u672C\u5DF2\u4FDD\u5B58");
      await reload();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    try {
      const n = await deleteResumeWithRefs(r, apps);
      toast(`\u5DF2\u5220\u9664\uFF08\u89E3\u9664 ${n} \u6761\u5F15\u7528\uFF09`);
      await reload();
    } catch (e) {
      toast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { style: { padding: "8px 0", borderBottom: "1px solid #1c2230" }, children: [
    /* @__PURE__ */ jsxs4("div", { className: "wj-row", children: [
      /* @__PURE__ */ jsx4("span", { className: "wj-tag purple", children: r.label }),
      /* @__PURE__ */ jsxs4("span", { className: "wj-sub", children: [
        r.content ? `${r.content.length} \u5B57` : "\u65E0\u6B63\u6587",
        " \xB7 \u88AB ",
        appsCount,
        " \u6761\u6295\u9012\u5F15\u7528"
      ] }),
      /* @__PURE__ */ jsx4("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ghost", onClick: () => setOpen(!open), children: open ? "\u6536\u8D77" : "\u7F16\u8F91" })
    ] }),
    open ? /* @__PURE__ */ jsxs4("div", { style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx4("span", { className: "wj-lbl", children: "\u6B63\u6587\uFF08\u7EAF\u6587\u672C / Markdown\uFF0C\u9009\u586B\uFF09" }),
      /* @__PURE__ */ jsx4("textarea", { className: "wj-inp", style: { minHeight: 120 }, value: content, onChange: (e) => setContent(e.target.value) }),
      /* @__PURE__ */ jsx4("span", { className: "wj-lbl", children: "\u5907\u6CE8\uFF08\u8FD9\u7248\u6539\u4E86\u4EC0\u4E48\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "wj-inp", value: note, onChange: (e) => setNote(e.target.value) }),
      /* @__PURE__ */ jsxs4("div", { className: "wj-row", style: { justifyContent: "flex-end", marginTop: 6, gap: 6 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm danger", disabled: busy, onClick: del, children: "\u5220\u9664" }),
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm", disabled: busy, onClick: save, children: "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "wj-sub", style: { marginTop: 4 }, children: "\u7248\u672C\u540D\u4E0D\u53EF\u6539\uFF08\u6295\u9012\u5F15\u7528\u6309\u540D\u7ED1\u5B9A\uFF09\uFF1B\u8981\u65B0\u7248\u672C\u8BF7\u300C\u65B0\u589E\u7248\u672C\u300D\u3002" })
    ] }) : null
  ] });
}
function SettingsTab({ data, reload, toast }) {
  const [followUpDays, setFollowUpDays] = useState3(String(data.settings.followUpDays));
  const [remindLeadHours, setRemindLeadHours] = useState3(String(data.settings.remindLeadHours));
  const [newLabel, setNewLabel] = useState3("");
  const [csvPreview, setCsvPreview] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const saveParams = async () => {
    try {
      await saveSettings({ followUpDays: Number(followUpDays) || 5, remindLeadHours: Number(remindLeadHours) || 24 }, data.settings);
      toast("\u53C2\u6570\u5DF2\u4FDD\u5B58");
      await reload();
    } catch (e) {
      toast(e.message, true);
    }
  };
  const addResume = async () => {
    if (!newLabel.trim()) {
      toast("\u7ED9\u7248\u672C\u8D77\u4E2A\u540D", true);
      return;
    }
    try {
      await saveResume({ label: newLabel.trim() }, null);
      setNewLabel("");
      toast("\u7B80\u5386\u7248\u672C\u5DF2\u5EFA");
      await reload();
    } catch (e) {
      toast(e.message, true);
    }
  };
  const exportCsv = () => {
    const csv = core5.exportCSV(data.apps, data.events, data.resumes, data.offers);
    downloadText(`wenjin-\u6295\u9012\u53F0\u8D26-${core5.fmtDate(Date.now())}.csv`, csv, "text/csv;charset=utf-8");
    toast(`\u5DF2\u5BFC\u51FA ${data.apps.length} \u6761\u6295\u9012`);
  };
  const exportJson = () => {
    const json = JSON.stringify(core5.exportAll(data), null, 2);
    downloadText(`wenjin-backup-${core5.fmtDate(Date.now())}.json`, json, "application/json");
    toast("JSON \u5907\u4EFD\u5DF2\u4E0B\u8F7D");
  };
  const onCsvFile = async (file) => {
    try {
      const text = await file.text();
      const result = core5.importCSV(text, data.apps, Date.now());
      if (!result.created) {
        toast(`\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u65B0\u6295\u9012\uFF08\u8DF3\u8FC7 ${result.skipped} \u6761\u91CD\u590D\uFF09`, true);
        return;
      }
      setCsvPreview({
        created: result.created,
        skipped: result.skipped,
        warns: result.warns,
        apply: async () => {
          await applyImport(result);
          setCsvPreview(null);
          toast(`\u5DF2\u5BFC\u5165 ${result.created} \u6761`);
          await reload();
        }
      });
    } catch (e) {
      toast(e.message, true);
    }
  };
  const onJsonFile = async (file) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed && parsed.kind === "wenjin-backup") {
        const n = await applyBackup(parsed);
        toast(`\u5907\u4EFD\u8FD8\u539F\u5B8C\u6210\uFF0C\u5199\u5165 ${n} \u6761`);
        await reload();
      } else if (parsed && (parsed.apps || parsed.companies)) {
        const n = await applyBackup(parsed);
        toast(`\u5DF2\u5199\u5165 ${n} \u6761\uFF08\u8BC6\u522B\u4E3A\u539F\u59CB\u6570\u636E\uFF09`);
        await reload();
      } else {
        toast("\u4E0D\u662F\u95EE\u6D25\u7684\u5907\u4EFD\u6587\u4EF6", true);
      }
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const emptyCompanies = data.companies.filter((c) => !data.apps.some((a) => a.companyId === c.id));
  return /* @__PURE__ */ jsxs4("div", { className: "wj-page", children: [
    /* @__PURE__ */ jsxs4("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "wj-bar" }),
      "\u7B80\u5386\u7248\u672C\u5E93",
      /* @__PURE__ */ jsx4("span", { className: "wj-hint", children: "\u6295\u9012\u65F6\u6807\u6CE8\u7248\u672C\uFF0C\u6F0F\u6597\u624D\u80FD\u5F52\u56E0" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "wj-card", children: /* @__PURE__ */ jsxs4("div", { className: "wj-card-b", children: [
      data.resumes.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "wj-sub", style: { paddingBottom: 6 }, children: "\u8FD8\u6CA1\u6709\u7248\u672C\u3002\u5EFA\u300C\u7248\u672CA\u300D\u5F00\u59CB\uFF0C\u6309\u6295\u9012\u6807\u6CE8\u79EF\u7D2F\u56DE\u590D\u7387\u3002" }) : null,
      data.resumes.map((r) => /* @__PURE__ */ jsx4(
        ResumeRow,
        {
          r,
          apps: data.apps,
          appsCount: data.apps.filter((a) => a.resumeId === r.id).length,
          reload,
          toast
        },
        r.id
      )),
      /* @__PURE__ */ jsxs4("div", { className: "wj-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "wj-inp wj-grow", placeholder: "\u65B0\u7248\u672C\u540D\uFF0C\u5982\u300C\u7248\u672CB-\u7A81\u51FA\u91CF\u5316\u300D", value: newLabel, onChange: (e) => setNewLabel(e.target.value) }),
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm", onClick: addResume, children: "\u65B0\u589E" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "wj-bar" }),
      "\u53C2\u6570"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "wj-card", children: /* @__PURE__ */ jsxs4("div", { className: "wj-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "wj-grid2", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("span", { className: "wj-lbl", children: "\u8DDF\u8FDB\u9608\u503C\uFF08\u5929\u65E0\u8FDB\u5C55\u5C31\u70B9\u540D\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "wj-inp", value: followUpDays, onChange: (e) => setFollowUpDays(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("span", { className: "wj-lbl", children: "\u63D0\u9192\u63D0\u524D\u91CF\uFF08\u5C0F\u65F6\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "wj-inp", value: remindLeadHours, onChange: (e) => setRemindLeadHours(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "wj-row", style: { justifyContent: "flex-end", marginTop: 8 }, children: /* @__PURE__ */ jsx4("button", { className: "wj-btn sm", onClick: saveParams, children: "\u4FDD\u5B58\u53C2\u6570" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "wj-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "wj-card", children: /* @__PURE__ */ jsxs4("div", { className: "wj-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "wj-row", style: { flexWrap: "wrap", gap: 6 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ghost", onClick: exportCsv, children: "\u5BFC\u51FA CSV\uFF08Excel \u53EF\u5F00\uFF09" }),
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ghost", onClick: exportJson, children: "\u5BFC\u51FA JSON \u5907\u4EFD" }),
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ghost", onClick: () => csvInputRef.current?.click(), children: "\u4ECE CSV \u5BFC\u5165" }),
        /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ghost", disabled: busy, onClick: () => jsonInputRef.current?.click(), children: "\u8FD8\u539F JSON \u5907\u4EFD" })
      ] }),
      /* @__PURE__ */ jsx4(
        "input",
        {
          ref: csvInputRef,
          type: "file",
          accept: ".csv,text/csv",
          style: { display: "none" },
          onChange: (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) onCsvFile(f);
            e.target.value = "";
          }
        }
      ),
      /* @__PURE__ */ jsx4(
        "input",
        {
          ref: jsonInputRef,
          type: "file",
          accept: ".json,application/json",
          style: { display: "none" },
          onChange: (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) onJsonFile(f);
            e.target.value = "";
          }
        }
      ),
      csvPreview ? /* @__PURE__ */ jsxs4("div", { style: { marginTop: 8, background: "#12151c", border: "1px solid #2a2f3a", borderRadius: 8, padding: 10 }, children: [
        /* @__PURE__ */ jsx4("b", { style: { fontSize: 12 }, children: "\u5BFC\u5165\u9884\u89C8" }),
        /* @__PURE__ */ jsxs4("div", { className: "wj-sub", style: { marginTop: 4 }, children: [
          "\u65B0\u5EFA ",
          csvPreview.created,
          " \u6761 \xB7 \u8DF3\u8FC7\u91CD\u590D ",
          csvPreview.skipped,
          " \u6761",
          csvPreview.warns.length ? `\uFF1B${csvPreview.warns.length} \u6761\u964D\u7EA7\u8B66\u544A\uFF08\u672A\u77E5\u6E20\u9053\u2192\u5176\u4ED6\u3001\u672A\u77E5\u72B6\u6001\u2192\u5DF2\u6295\uFF09` : ""
        ] }),
        csvPreview.warns.slice(0, 5).map((w, i) => /* @__PURE__ */ jsxs4("div", { className: "wj-sub", style: { color: "#E3B341" }, children: [
          "\xB7 ",
          w
        ] }, i)),
        /* @__PURE__ */ jsxs4("div", { className: "wj-row", style: { justifyContent: "flex-end", marginTop: 6, gap: 6 }, children: [
          /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ghost", onClick: () => setCsvPreview(null), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ jsx4("button", { className: "wj-btn sm ok", onClick: csvPreview.apply, children: "\u786E\u8BA4\u5BFC\u5165" })
        ] })
      ] }) : null,
      /* @__PURE__ */ jsxs4("div", { className: "wj-sub", style: { marginTop: 8 }, children: [
        "\u53F0\u8D26\u5171 ",
        data.apps.length,
        " \u6295\u9012 / ",
        data.events.length,
        " \u4E8B\u4EF6 / ",
        data.offers.length,
        " offer / ",
        data.companies.length,
        " \u516C\u53F8",
        emptyCompanies.length ? `\uFF08${emptyCompanies.length} \u5BB6\u7A7A\u516C\u53F8\u968F\u4E0B\u6B21\u5168\u91CF\u6E05\u7406\uFF09` : "",
        "\u3002 \u5168\u90E8\u4FDD\u5B58\u5728\u672C\u673A\uFF08cap.kv\uFF09\uFF0C\u4E0D\u53D1\u9001\u5230\u4EFB\u4F55\u670D\u52A1\u5668\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "wj-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "wj-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "wj-card", children: /* @__PURE__ */ jsxs4("div", { className: "wj-card-b wj-sub", children: [
      /* @__PURE__ */ jsx4("b", { children: "\u95EE\u6D25" }),
      "\u2014\u2014\u4F7F\u5B50\u8DEF\u95EE\u6D25\u3002\u6D25\u8005\uFF0C\u6E21\u53E3\u4E5F\uFF1B\u6C42\u804C\u5C31\u662F\u627E\u6E21\u53E3\uFF0C\u6BCF\u4E00\u4EFD\u6295\u9012\u90FD\u503C\u5F97\u6709\u8D26\u53EF\u67E5\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u53EA\u505A\u8BB0\u5F55\u3001\u6D3E\u751F\u4E0E\u63D0\u9192\uFF1A\u4E0D\u6293\u53D6\u62DB\u8058\u5E73\u53F0\u3001\u4E0D\u81EA\u52A8\u6295\u9012\u3001\u4E0D\u627F\u8BFA\u300CATS \u901A\u8FC7\u7387\u300D\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u8DDF\u8FDB\u63D0\u9192\u4E0E offer \u5BF9\u6BD4\u57FA\u4E8E\u4F60\u81EA\u5DF1\u7684\u8BB0\u5F55\uFF0C\u4E0D\u6784\u6210\u804C\u4E1A\u5EFA\u8BAE\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.wj-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.wj-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wj-body{flex:1;overflow-y:auto;padding:0 0 24px}
.wj-body::-webkit-scrollbar{width:9px;height:9px}
.wj-body::-webkit-scrollbar-track{background:transparent}
.wj-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.wj-page{max-width:640px;margin:0 auto}

/* \u5934\u90E8 */
.wj-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.wj-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#58A6FF,#A371F7);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.wj-tt{flex:1;min-width:0}
.wj-tt b{font-size:15px;display:block}
.wj-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.wj-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.wj-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.wj-dot.stale{background:#D29922}
.wj-dot.down{background:#F85149}
.wj-tabs{display:flex;gap:4px}
.wj-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.wj-tab:hover{color:#E6EAF2}
.wj-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.wj-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.wj-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.wj-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#58A6FF,#A371F7);flex-shrink:0}
.wj-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.wj-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.wj-card-b{padding:11px 13px}
.wj-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.wj-btn:hover{filter:brightness(1.1)}
.wj-btn:disabled{opacity:.45;cursor:not-allowed}
.wj-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.wj-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.wj-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.wj-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.wj-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.wj-inp:focus{outline:none;border-color:#2b6cb0}
.wj-inp::placeholder{color:#4d5566}
textarea.wj-inp{resize:vertical;min-height:60px;line-height:1.6}
.wj-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.wj-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.wj-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.wj-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.wj-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.wj-toast.bad{border-color:#54262c;color:#FF8A9A}
.wj-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.wj-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.wj-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.wj-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.wj-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.wj-tag.purple{background:#241b33;border-color:#3c2a58;color:#C9A7F5}
.wj-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.wj-row{display:flex;align-items:center;gap:8px;min-width:0}
.wj-grow{flex:1;min-width:0}
.wj-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.wj-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media (max-width:520px){.wj-grid2{grid-template-columns:1fr}}
.wj-chip{display:flex;flex-direction:column;align-items:center;gap:2px;background:#161B22;border:1px solid #242C3A;border-radius:10px;padding:8px 4px;min-width:0}
.wj-chip b{font-size:16px}
.wj-chip small{color:#8B95A7;font-size:9.5px;white-space:nowrap}
.wj-tl{position:relative;padding-left:16px}
.wj-tl::before{content:'';position:absolute;left:4px;top:4px;bottom:4px;width:2px;background:#242C3A;border-radius:1px}
.wj-tl-item{position:relative;padding:0 0 10px}
.wj-tl-item::before{content:'';position:absolute;left:-15px;top:5px;width:8px;height:8px;border-radius:50%;background:#58A6FF;border:2px solid #10141C}
.wj-tl-item.dim::before{background:#4d5566}
.wj-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.wj-tbl th{color:#8B95A7;font-weight:600;text-align:right;padding:5px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
.wj-tbl th:first-child{text-align:left}
.wj-tbl td{text-align:right;padding:5px 8px;border-bottom:1px solid #1c2230;white-space:nowrap}
.wj-tbl td:first-child{text-align:left}
.wj-tbl tr:last-child td{border-bottom:none}
.wj-num{font-variant-numeric:tabular-nums}
`;
function WenjinPanel() {
  const [tab, setTab] = useState4("today");
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
      const d = await loadWenjin(cacheRef.current);
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 15e3);
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
  const view = data ? buildView(data) : null;
  const dueCount = view ? view.due.length : 0;
  const metaTs = data && data.meta && data.meta.at ? core6.parseTs(data.meta.at) : null;
  const metaOk = metaTs != null && Date.now() - metaTs < 30 * 60 * 1e3;
  const dotCls = loadErr ? "down" : metaOk ? "ok" : "stale";
  return /* @__PURE__ */ jsxs5("div", { className: "wj-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "wj-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "wj-logo", children: "\u{1F4A7}" }),
      /* @__PURE__ */ jsxs5("div", { className: "wj-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u95EE\u6D25" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("span", { className: `wj-dot ${dotCls}` }),
          loadErr ? "\u8FDE\u63A5\u5931\u8D25" : metaOk ? "\u53F0\u8D26\u5C31\u7EEA" : "\u7B49\u5F85\u9996\u6B21\u8BB0\u5F55",
          " \xB7 ",
          "\u6C42\u804C\u8BB0\u5F55\u5168\u90E8\u4FDD\u5B58\u5728\u672C\u673A"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "wj-tabs", children: [
        ["today", "\u4ECA\u65E5", dueCount],
        ["apps", "\u6295\u9012", 0],
        ["insight", "\u6D1E\u5BDF", 0],
        ["settings", "\u8BBE\u7F6E", 0]
      ].map(([key, label, badge]) => /* @__PURE__ */ jsxs5("button", { className: `wj-tab ${tab === key ? "on" : ""}`, onClick: () => setTab(key), children: [
        label,
        badge > 0 && key === "today" ? /* @__PURE__ */ jsx5("span", { className: "wj-badge", children: badge }) : null
      ] }, key)) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "wj-body", children: [
      loadErr ? /* @__PURE__ */ jsxs5("div", { className: "wj-err", children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }) : null,
      !data && !loadErr ? /* @__PURE__ */ jsx5("div", { className: "wj-empty", children: "\u6B63\u5728\u8BFB\u53D6\u53F0\u8D26\u2026\u2026" }) : null,
      data && view ? tab === "today" ? /* @__PURE__ */ jsx5(TodayTab, { data, view, reload, toast: showToast, goTab: setTab }) : tab === "apps" ? /* @__PURE__ */ jsx5(AppsTab, { data, view, reload, toast: showToast }) : tab === "insight" ? /* @__PURE__ */ jsx5(InsightTab, { data, view }) : /* @__PURE__ */ jsx5(SettingsTab, { data, reload, toast: showToast }) : null,
      /* @__PURE__ */ jsxs5("div", { className: "wj-foot", children: [
        "\u95EE\u6D25 \xB7 \u6C42\u804C\u6295\u9012\u4E0E\u9762\u8BD5\u4F5C\u6218\u53F0\u8D26 \u2014\u2014 \u53EA\u505A\u8BB0\u5F55\u3001\u6D3E\u751F\u4E0E\u63D0\u9192",
        /* @__PURE__ */ jsx5("br", {}),
        "\u4E0D\u6293\u53D6\u62DB\u8058\u5E73\u53F0\u3001\u4E0D\u81EA\u52A8\u6295\u9012\uFF1B\u6D1E\u5BDF\u4E0E offer \u5BF9\u6BD4\u4E0D\u6784\u6210\u804C\u4E1A\u5EFA\u8BAE"
      ] })
    ] }),
    toast ? /* @__PURE__ */ jsx5("div", { className: `wj-toast ${toast.bad ? "bad" : ""}`, children: toast.msg }) : null
  ] });
}

// src/index.tsx
var src_default = WenjinPanel;
export {
  src_default as default
};
