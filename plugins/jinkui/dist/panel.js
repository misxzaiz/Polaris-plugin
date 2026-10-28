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
    var K2 = [
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
          const t1 = h + S1 + ch + K2[i] + w[i] | 0;
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
    var DAY_MS = 864e5;
    var NAME_CAP = 60;
    var COMPANY_CAP = 40;
    var NOTE_CAP = 300;
    var RELATIONS2 = ["self", "spouse", "child", "parent", "other"];
    var RELATION_NAMES = { self: "\u672C\u4EBA", spouse: "\u914D\u5076", child: "\u5B50\u5973", parent: "\u7236\u6BCD", other: "\u5176\u4ED6" };
    var KINDS2 = ["medical", "critical", "life", "accident", "annuity", "property", "other"];
    var KIND_NAMES = {
      medical: "\u533B\u7597",
      critical: "\u91CD\u75BE",
      life: "\u5BFF\u9669",
      accident: "\u610F\u5916",
      annuity: "\u5E74\u91D1",
      property: "\u5BB6\u8D22",
      other: "\u5176\u4ED6"
    };
    var GAP_KINDS2 = ["medical", "critical", "life", "accident"];
    var FREQS2 = ["yearly", "half", "quarter", "monthly", "single"];
    var FREQ_NAMES = { yearly: "\u5E74\u7F34", half: "\u534A\u5E74\u7F34", quarter: "\u5B63\u7F34", monthly: "\u6708\u7F34", single: "\u8DB8\u4EA4" };
    var FREQ_MONTHS = { yearly: 12, half: 6, quarter: 3, monthly: 1, single: 0 };
    var FREQ_PER_YEAR = { yearly: 1, half: 2, quarter: 4, monthly: 12, single: 1 };
    var EVENT_TYPES = ["pay", "claim", "endorse", "reinstate", "surrender", "other"];
    var EVENT_NAMES2 = { pay: "\u7F34\u8D39", claim: "\u7406\u8D54", endorse: "\u6279\u6539", reinstate: "\u590D\u6548", surrender: "\u9000\u4FDD", other: "\u5176\u4ED6" };
    var END_REASONS = ["surrender", "terminated"];
    var END_REASON_NAMES = { surrender: "\u9000\u4FDD", terminated: "\u7EC8\u6B62" };
    var REINSTATE_WINDOW_DAYS2 = 730;
    var MAX_WALK = 2400;
    var STATES = ["waiting", "active", "paid-off", "grace", "lapse", "matured", "surrendered", "terminated"];
    var STATE_NAMES = {
      waiting: "\u7B49\u5F85\u671F\u4E2D",
      active: "\u6709\u6548",
      "paid-off": "\u6709\u6548\xB7\u7F34\u8D39\u671F\u6EE1",
      grace: "\u5BBD\u9650\u671F",
      lapse: "\u4E2D\u6B62\u671F",
      matured: "\u5DF2\u6EE1\u671F",
      surrendered: "\u5DF2\u9000\u4FDD",
      terminated: "\u5DF2\u7EC8\u6B62"
    };
    function clip(s, cap) {
      return String(s == null ? "" : s).trim().slice(0, cap);
    }
    function idFor(seed) {
      return sha256Hex(String(seed)).slice(0, 12);
    }
    function round2(x) {
      return Math.round(x * 100) / 100;
    }
    function fmtMoney4(x) {
      if (x == null || !Number.isFinite(x)) return "\u2014";
      const v = round2(x);
      if (Math.abs(v) >= 1e4) {
        const w = v / 1e4;
        const raw = Math.abs(w) >= 100 ? w.toFixed(1) : w.toFixed(2);
        return `${parseFloat(raw)} \u4E07`;
      }
      return Number.isInteger(v) ? `${v} \u5143` : `${v.toFixed(2)} \u5143`;
    }
    function dayKey3(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseDayKey(s) {
      if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const [y, m, d] = s.split("-").map(Number);
      const probe = new Date(y, m - 1, d, 12);
      if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
      return new Date(y, m - 1, d).getTime();
    }
    function dayDiff2(a, b) {
      const ta = parseDayKey(a);
      const tb = parseDayKey(b);
      if (ta == null || tb == null) return null;
      return Math.round((ta - tb) / DAY_MS);
    }
    function addMonths(dateStr, k) {
      const t = parseDayKey(dateStr);
      if (t == null || !Number.isInteger(k)) return null;
      const base = new Date(t);
      const target = new Date(base.getFullYear(), base.getMonth() + k, 1, 12);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
      target.setDate(Math.min(base.getDate(), lastDay));
      return dayKey3(target.getTime());
    }
    function addDays2(dateStr, n) {
      const t = parseDayKey(dateStr);
      if (t == null || !Number.isFinite(n)) return null;
      return dayKey3(t + n * DAY_MS);
    }
    function validDate(s) {
      return parseDayKey(s) != null;
    }
    function normOk(v) {
      return v;
    }
    function normalizeMember2(input, prev) {
      const i = input || {};
      const name = clip(i.name, NAME_CAP);
      if (!name) return { error: "\u6210\u5458\u540D\u5B57\u5FC5\u586B\uFF08\u5982\uFF1A\u672C\u4EBA / \u59BB\u5B50 / \u5927\u5A03\uFF09" };
      const relation = i.relation == null || i.relation === "" ? prev && prev.relation || "other" : String(i.relation);
      if (!RELATIONS2.includes(relation)) return { error: `relation \u4E0D\u5408\u6CD5\uFF1A${relation}\uFF08${RELATIONS2.join("/")}\uFF09` };
      let birthYear = prev && prev.birthYear != null ? prev.birthYear : null;
      if (i.birthYear != null && i.birthYear !== "") {
        const n = Math.floor(Number(i.birthYear));
        const thisYear = (/* @__PURE__ */ new Date()).getFullYear();
        if (!Number.isFinite(n) || n < 1900 || n > thisYear + 1) return { error: `birthYear \u4E0D\u5408\u6CD5\uFF1A${i.birthYear}\uFF081900\u2013${thisYear + 1}\uFF09` };
        birthYear = n;
      }
      const member = {
        id: prev && prev.id || idFor(`member|${name}`),
        name,
        relation,
        birthYear,
        note: i.note != null ? clip(i.note, NOTE_CAP) : prev && prev.note || "",
        createdAt: prev && prev.createdAt || Date.now()
      };
      return normOk({ member });
    }
    function normalizePolicy2(input, prev) {
      const i = input || {};
      const name = clip(i.name, NAME_CAP);
      if (!name) return { error: "\u4FDD\u5355\u540D\u79F0\uFF08\u4EA7\u54C1\u540D\uFF09\u5FC5\u586B\uFF0C\u5982\u300C\u5E73\u5B89e\u751F\u4FDD\xB7\u957F\u671F\u533B\u7597\u300D" };
      const kind = String(i.kind == null ? prev && prev.kind || "" : i.kind);
      if (!KINDS2.includes(kind)) return { error: `kind \u5FC5\u586B\u4E14\u4E0D\u5408\u6CD5\uFF1A${kind || "\uFF08\u7A7A\uFF09"}\uFF08${KINDS2.join("/")}\uFF09` };
      const insuredId = clip(i.insuredId != null ? i.insuredId : prev && prev.insuredId, 40);
      if (!insuredId) return { error: "\u88AB\u4FDD\u9669\u4EBA\uFF08insuredId \u6216 insured \u6210\u5458\u540D\uFF09\u5FC5\u586B" };
      const freq = String(i.freq == null ? prev && prev.freq || "yearly" : i.freq);
      if (!FREQS2.includes(freq)) return { error: `freq \u4E0D\u5408\u6CD5\uFF1A${freq}\uFF08${FREQS2.join("/")}\uFF09` };
      const startDate = String(i.startDate != null ? i.startDate : prev && prev.startDate || "");
      if (!validDate(startDate)) return { error: `startDate \u5FC5\u586B\u4E14\u4E3A\u5408\u6CD5\u65E5\u671F YYYY-MM-DD\uFF08\u9996\u671F\u7F34\u8D39\u65E5\uFF09\uFF1A${startDate || "\uFF08\u7A7A\uFF09"}` };
      let premium = prev && prev.premium != null ? prev.premium : null;
      if (i.premium != null && i.premium !== "") {
        const p = Number(i.premium);
        if (!Number.isFinite(p) || p < 0 || p > 1e9) return { error: `premium \u4E0D\u5408\u6CD5\uFF1A${i.premium}\uFF080\u201310 \u4EBF\u7684\u5143\u6570\u503C\uFF09` };
        premium = round2(p);
      }
      let coverage = prev && prev.coverage != null ? prev.coverage : null;
      if (i.coverage != null && i.coverage !== "") {
        const c = Number(i.coverage);
        if (!Number.isFinite(c) || c < 0 || c > 1e11) return { error: `coverage \u4E0D\u5408\u6CD5\uFF1A${i.coverage}\uFF080\u20131000 \u4EBF\u7684\u5143\u6570\u503C\uFF09` };
        coverage = round2(c);
      }
      let payYears = prev && prev.payYears != null ? prev.payYears : null;
      if (i.payYears != null && i.payYears !== "") {
        const n = Math.floor(Number(i.payYears));
        if (!Number.isFinite(n) || n < 1 || n > 100) return { error: `payYears \u4E0D\u5408\u6CD5\uFF1A${i.payYears}\uFF081\u2013100 \u5E74\uFF09` };
        payYears = n;
      } else if (freq === "single") {
        payYears = 1;
      }
      let endDate = prev && prev.endDate != null ? prev.endDate : null;
      if (i.endDate != null && i.endDate !== "") {
        const e = String(i.endDate);
        if (!validDate(e)) return { error: `endDate \u4E0D\u5408\u6CD5\uFF1A${e}\uFF08YYYY-MM-DD \u6216\u7559\u7A7A=\u7EC8\u8EAB\uFF09` };
        if (dayDiff2(e, startDate) <= 0) return { error: `endDate\uFF08${e}\uFF09\u5FC5\u987B\u665A\u4E8E startDate\uFF08${startDate}\uFF09` };
        endDate = e;
      }
      let waitingDays = prev && prev.waitingDays != null ? prev.waitingDays : null;
      if (i.waitingDays != null && i.waitingDays !== "") {
        const n = Math.floor(Number(i.waitingDays));
        if (!Number.isFinite(n) || n < 0 || n > 730) return { error: `waitingDays \u4E0D\u5408\u6CD5\uFF1A${i.waitingDays}\uFF080\u2013730 \u5929\uFF09` };
        waitingDays = n;
      }
      let endedAt = prev && prev.endedAt != null ? prev.endedAt : null;
      let endReason = prev && prev.endReason != null ? prev.endReason : null;
      if (i.endReason != null && i.endReason !== "") {
        if (!END_REASONS.includes(i.endReason)) return { error: `endReason \u4E0D\u5408\u6CD5\uFF1A${i.endReason}\uFF08${END_REASONS.join("/")}\uFF09` };
        endReason = i.endReason;
      }
      if (i.endedAt != null && i.endedAt !== "") {
        const e = String(i.endedAt);
        if (!validDate(e)) return { error: `endedAt \u4E0D\u5408\u6CD5\uFF1A${e}` };
        if (dayDiff2(e, startDate) < 0) return { error: `endedAt\uFF08${e}\uFF09\u4E0D\u80FD\u65E9\u4E8E\u751F\u6548\u65E5\uFF08${startDate}\uFF09` };
        endedAt = e;
      }
      if (endReason && !endedAt || !endReason && endedAt) {
        return { error: "endReason \u4E0E endedAt \u5FC5\u987B\u6210\u5BF9\u63D0\u4F9B\uFF08\u624B\u52A8\u7EC8\u6B62\u7528\uFF1B\u9000\u4FDD\u4E5F\u53EF\u6539\u7528 surrender \u4E8B\u4EF6\u4FDD\u7559\u6D41\u6C34\uFF09" };
      }
      const policy = {
        id: prev && prev.id || idFor(`policy|${insuredId}|${kind}|${clip(i.company, COMPANY_CAP)}|${name}`),
        name,
        kind,
        insuredId,
        holderId: i.holderId != null && i.holderId !== "" ? clip(i.holderId, 40) : prev && prev.holderId || "",
        company: i.company != null ? clip(i.company, COMPANY_CAP) : prev && prev.company || "",
        policyNo: i.policyNo != null ? clip(i.policyNo, 40) : prev && prev.policyNo || "",
        coverage,
        coverageNote: i.coverageNote != null ? clip(i.coverageNote, 60) : prev && prev.coverageNote || "",
        premium,
        freq,
        payYears,
        startDate,
        endDate,
        waitingDays,
        fileNote: i.fileNote != null ? clip(i.fileNote, 120) : prev && prev.fileNote || "",
        note: i.note != null ? clip(i.note, NOTE_CAP) : prev && prev.note || "",
        endedAt,
        endReason,
        createdAt: prev && prev.createdAt || Date.now()
      };
      return normOk({ policy });
    }
    function normalizeEvent2(input, prev) {
      const i = input || {};
      const type = String(i.type || "");
      if (!EVENT_TYPES.includes(type)) {
        return { error: `type \u5FC5\u586B\uFF1A${EVENT_TYPES.map((t) => `${t}(${EVENT_NAMES2[t]})`).join(" / ")}` };
      }
      const policyId = clip(i.policyId, 40);
      if (!policyId) return { error: "policyId \u5FC5\u586B\uFF08jinkui_query scope=policies \u53EF\u67E5\uFF09" };
      const date = String(i.date || dayKey3(Date.now()));
      if (!validDate(date)) return { error: `date \u4E0D\u5408\u6CD5\uFF1A${date}\uFF08YYYY-MM-DD\uFF09` };
      let amount = null;
      if (i.amount != null && i.amount !== "") {
        const a = Number(i.amount);
        if (!Number.isFinite(a) || a < 0 || a > 1e10) return { error: `amount \u4E0D\u5408\u6CD5\uFF1A${i.amount}` };
        amount = round2(a);
      }
      const note = clip(i.note, NOTE_CAP);
      const occKey = `${type}|${policyId}|${date}`;
      const ev = {
        occKey: prev && prev.occKey || occKey,
        type,
        policyId,
        date,
        amount,
        note,
        at: prev && prev.at || Date.now()
      };
      return normOk({ ev });
    }
    function normalizeSettings3(raw) {
      const r = raw && typeof raw === "object" ? raw : {};
      const num = (v, dflt, lo, hi) => {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
      };
      return {
        graceDays: num(r.graceDays, 60, 0, 180),
        warnDays: num(r.warnDays, 30, 1, 365)
      };
    }
    function paidUntilOf(policy, events) {
      let m = policy.startDate;
      for (const e of events || []) {
        if ((e.type === "pay" || e.type === "reinstate") && typeof e.date === "string" && e.date > m && validDate(e.date)) {
          m = e.date;
        }
      }
      return m;
    }
    function periodsPaid2(policy, paidUntil) {
      const fm = FREQ_MONTHS[policy.freq];
      if (!fm) return 1;
      let n = 0;
      let d = policy.startDate;
      while (d != null && d <= paidUntil && n < MAX_WALK) {
        n += 1;
        d = addMonths(d, fm);
      }
      return n;
    }
    function totalPeriods2(policy) {
      if (policy.freq === "single") return 1;
      if (policy.payYears == null) return null;
      return policy.payYears * FREQ_PER_YEAR[policy.freq];
    }
    function nextPayDate(policy, events) {
      if (policy.endReason || policy.endedAt) return null;
      if (policy.freq === "single") return null;
      const tp = totalPeriods2(policy);
      const pu = paidUntilOf(policy, events);
      const pp = periodsPaid2(policy, pu);
      if (tp != null && pp >= tp) return null;
      return addMonths(pu, FREQ_MONTHS[policy.freq]);
    }
    function graceApplies(policy) {
      if (policy.freq !== "yearly") return true;
      if (totalPeriods2(policy) !== 1) return true;
      if (!policy.endDate) return true;
      const approx1y = addMonths(policy.startDate, 12);
      return !(dayDiff2(policy.endDate, approx1y) != null && dayDiff2(policy.endDate, approx1y) <= 45);
    }
    function latestDateOf(events, type) {
      let m = null;
      for (const e of events || []) {
        if (e.type === type && typeof e.date === "string" && validDate(e.date) && (m == null || e.date > m)) m = e.date;
      }
      return m;
    }
    function policyStatus2(policy, events, settings, now) {
      const s = normalizeSettings3(settings);
      const today = dayKey3(now == null ? Date.now() : now);
      const paidUntil = paidUntilOf(policy, events);
      const nextPay = nextPayDate(policy, events);
      const out = {
        today,
        policyId: policy.id,
        state: "active",
        stateName: STATE_NAMES.active,
        paidUntil,
        nextPayDate: nextPay,
        daysToPay: null,
        graceEnd: null,
        waitingEnd: null,
        surrenderDate: null
      };
      const lastSurrender = latestDateOf(events, "surrender");
      const lastReinstate = latestDateOf(events, "reinstate");
      if (lastSurrender && (!lastReinstate || lastSurrender > lastReinstate)) {
        out.state = "surrendered";
        out.stateName = STATE_NAMES.surrendered;
        out.surrenderDate = lastSurrender;
        return out;
      }
      if (policy.endReason) {
        out.state = "terminated";
        out.stateName = `${STATE_NAMES.terminated}\uFF08${END_REASON_NAMES[policy.endReason] || policy.endReason}\uFF09`;
        return out;
      }
      if (policy.endDate && today > policy.endDate) {
        out.state = "matured";
        out.stateName = STATE_NAMES.matured;
        return out;
      }
      if (policy.waitingDays != null && policy.waitingDays > 0) {
        const we = addDays2(policy.startDate, policy.waitingDays);
        if (we && today < we) {
          out.state = "waiting";
          out.stateName = STATE_NAMES.waiting;
          out.waitingEnd = we;
          return out;
        }
      }
      if (!nextPay) {
        if (policy.freq !== "single" && !graceApplies(policy)) {
          out.state = "active";
          return out;
        }
        out.state = "paid-off";
        out.stateName = STATE_NAMES["paid-off"];
        return out;
      }
      const d = dayDiff2(nextPay, today);
      out.daysToPay = d;
      if (d != null && d >= 0) {
        return out;
      }
      if (!graceApplies(policy)) {
        out.state = "matured";
        out.stateName = STATE_NAMES.matured;
        return out;
      }
      const ge = addDays2(nextPay, s.graceDays);
      out.graceEnd = ge;
      if (ge && today <= ge) {
        out.state = "grace";
        out.stateName = STATE_NAMES.grace;
        return out;
      }
      const re = ge ? addDays2(ge, REINSTATE_WINDOW_DAYS2) : null;
      if (re && today <= re) {
        out.state = "lapse";
        out.stateName = STATE_NAMES.lapse;
        return out;
      }
      out.state = "terminated";
      out.stateName = `${STATE_NAMES.terminated}\uFF08\u590D\u6548\u671F\u5DF2\u8FC7\uFF09`;
      return out;
    }
    function coversGap2(state) {
      return state === "waiting" || state === "active" || state === "paid-off" || state === "grace";
    }
    function eventsFor2(events, policyId) {
      return (events || []).filter((e) => e.policyId === policyId).sort((a, b) => a.date < b.date ? -1 : 1);
    }
    function paymentCalendar(policies, events, settings, now, days) {
      const s = normalizeSettings3(settings);
      const horizon = Math.max(1, Math.min(365, Math.floor(days || 90)));
      const now2 = now == null ? Date.now() : now;
      const rows = [];
      for (const p of policies) {
        const evs = eventsFor2(events, p.id);
        const st = policyStatus2(p, evs, s, now2);
        if (!coversGap2(st.state) || st.nextPayDate == null) continue;
        const d = dayDiff2(st.nextPayDate, st.today);
        if (d == null) continue;
        if (d < -s.graceDays || d > horizon) continue;
        rows.push({
          policyId: p.id,
          name: p.name,
          kind: p.kind,
          company: p.company,
          state: st.state,
          date: st.nextPayDate,
          daysToPay: d,
          premium: p.premium
        });
      }
      rows.sort((a, b) => a.daysToPay - b.daysToPay);
      return rows;
    }
    function gapMatrix3(members, policies, events, settings, now) {
      const s = normalizeSettings3(settings);
      const now2 = now == null ? Date.now() : now;
      const byMember = /* @__PURE__ */ new Map();
      for (const m of members) {
        byMember.set(m.id, { memberId: m.id, name: m.name, cells: {}, missing: [] });
      }
      const otherKinds = { annuity: 0, property: 0, other: 0 };
      for (const p of policies) {
        if (!byMember.has(p.insuredId)) continue;
        if (p.kind in otherKinds) {
          const evs2 = eventsFor2(events, p.id);
          if (coversGap2(policyStatus2(p, evs2, s, now2).state)) otherKinds[p.kind] += 1;
          continue;
        }
        if (!GAP_KINDS2.includes(p.kind)) continue;
        const evs = eventsFor2(events, p.id);
        if (!coversGap2(policyStatus2(p, evs, s, now2).state)) continue;
        const row = byMember.get(p.insuredId);
        const cell = row.cells[p.kind] || { count: 0, sum: 0 };
        cell.count += 1;
        cell.sum = round2(cell.sum + (p.coverage || 0));
        row.cells[p.kind] = cell;
      }
      const rows = [...byMember.values()];
      for (const row of rows) {
        row.missing = GAP_KINDS2.filter((k) => !row.cells[k]);
      }
      return { rows, otherKinds };
    }
    function premiumFlow2(policies, events, settings, now) {
      const s = normalizeSettings3(settings);
      const now2 = now == null ? Date.now() : now;
      const today = dayKey3(now2);
      const windowEnd = addMonths(today, 12);
      const months = {};
      let total = 0;
      for (const p of policies) {
        const evs = eventsFor2(events, p.id);
        const st = policyStatus2(p, evs, s, now2);
        if (!coversGap2(st.state) || st.nextPayDate == null || p.premium == null) continue;
        const fm = FREQ_MONTHS[p.freq];
        const tp = totalPeriods2(p);
        let d = st.nextPayDate;
        let paid = periodsPaid2(p, st.paidUntil);
        let guard = 0;
        while (d != null && d < windowEnd && guard < MAX_WALK) {
          guard += 1;
          if (tp != null && paid >= tp) break;
          if (d >= today) {
            const mk = d.slice(0, 7);
            const bucket = months[mk] || { amount: 0, items: [] };
            bucket.amount = round2(bucket.amount + p.premium);
            bucket.items.push({ policyId: p.id, name: p.name, date: d, premium: p.premium });
            months[mk] = bucket;
            total = round2(total + p.premium);
          }
          d = addMonths(d, fm);
          paid += 1;
        }
      }
      return { months, total, from: today, to: windowEnd };
    }
    function familyTotals2(policies, events, settings, now) {
      const s = normalizeSettings3(settings);
      const now2 = now == null ? Date.now() : now;
      let activeCount = 0;
      let annualized = 0;
      const byState = {};
      for (const p of policies) {
        const evs = eventsFor2(events, p.id);
        const st = policyStatus2(p, evs, s, now2);
        byState[st.state] = (byState[st.state] || 0) + 1;
        if (coversGap2(st.state)) {
          activeCount += 1;
          if (p.premium != null && p.freq !== "single") annualized = round2(annualized + p.premium * FREQ_PER_YEAR[p.freq]);
        }
      }
      let totalPaid = 0;
      let totalClaim = 0;
      const policyById = new Map(policies.map((p) => [p.id, p]));
      for (const e of events || []) {
        const p = policyById.get(e.policyId);
        if (e.type === "pay") {
          totalPaid = round2(totalPaid + (e.amount != null ? e.amount : p && p.premium || 0));
        } else if (e.type === "claim") {
          totalClaim = round2(totalClaim + (e.amount || 0));
        }
      }
      return {
        policyCount: policies.length,
        activeCount,
        byState,
        annualizedPremium: annualized,
        totalPaid,
        totalClaim
      };
    }
    function describePolicy(policy, insuredName) {
      const bits = [
        `\u300C${policy.name}\u300D`,
        `${KIND_NAMES[policy.kind] || policy.kind}`,
        policy.company ? `${policy.company}` : "",
        insuredName ? `\u88AB\u4FDD\uFF1A${insuredName}` : "",
        policy.premium != null ? `${FREQ_NAMES[policy.freq]} ${fmtMoney4(policy.premium)}` : FREQ_NAMES[policy.freq],
        `\u751F\u6548 ${policy.startDate}`,
        policy.endDate ? `\u4FDD\u969C\u81F3 ${policy.endDate}` : "\u4FDD\u969C\u671F\u7EC8\u8EAB/\u672A\u586B",
        policy.coverage != null ? `\u4FDD\u989D ${fmtMoney4(policy.coverage)}${policy.coverageNote ? `\uFF08${policy.coverageNote}\uFF09` : ""}` : ""
      ].filter(Boolean);
      return bits.join("\uFF0C");
    }
    module.exports = {
      DAY_MS,
      RELATIONS: RELATIONS2,
      RELATION_NAMES,
      KINDS: KINDS2,
      KIND_NAMES,
      GAP_KINDS: GAP_KINDS2,
      FREQS: FREQS2,
      FREQ_NAMES,
      FREQ_MONTHS,
      FREQ_PER_YEAR,
      EVENT_TYPES,
      EVENT_NAMES: EVENT_NAMES2,
      END_REASONS,
      END_REASON_NAMES,
      REINSTATE_WINDOW_DAYS: REINSTATE_WINDOW_DAYS2,
      STATES,
      STATE_NAMES,
      clip,
      idFor,
      round2,
      fmtMoney: fmtMoney4,
      dayKey: dayKey3,
      parseDayKey,
      dayDiff: dayDiff2,
      addMonths,
      addDays: addDays2,
      normalizeMember: normalizeMember2,
      normalizePolicy: normalizePolicy2,
      normalizeEvent: normalizeEvent2,
      normalizeSettings: normalizeSettings3,
      paidUntilOf,
      periodsPaid: periodsPaid2,
      totalPeriods: totalPeriods2,
      nextPayDate,
      graceApplies,
      policyStatus: policyStatus2,
      coversGap: coversGap2,
      eventsFor: eventsFor2,
      paymentCalendar,
      gapMatrix: gapMatrix3,
      premiumFlow: premiumFlow2,
      familyTotals: familyTotals2,
      describePolicy
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useMemo as useMemo4, useRef as useRef2, useState as useState3 } from "react";

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
var PREFIX = "jinkui.";
var K = {
  member: (id) => `${PREFIX}member.${id}`,
  memberPrefix: `${PREFIX}member.`,
  policy: (id) => `${PREFIX}policy.${id}`,
  policyPrefix: `${PREFIX}policy.`,
  ev: (occKey) => `${PREFIX}ev.${occKey}`,
  evPrefix: `${PREFIX}ev.`,
  settings: `${PREFIX}settings`
};
function newCache() {
  return { knownKeys: null, fullAt: 0, vals: /* @__PURE__ */ new Map() };
}
var FULL_REFRESH_MS = 90 * 1e3;
var ENTITY_PREFIXES = [K.memberPrefix, K.policyPrefix, K.evPrefix];
async function loadJinkui(cache) {
  const keys = await kvKeys();
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.vals.clear();
    cache.fullAt = now;
  }
  const keySet = new Set(keys);
  for (const k of [...cache.vals.keys()]) {
    if (!keySet.has(k)) cache.vals.delete(k);
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)));
  const todo = entityKeys.filter((k) => full || !cache.vals.has(k));
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet(k).catch(() => null);
      return { k, v };
    }));
    for (const { k, v } of fetched) {
      if (v && typeof v === "object") cache.vals.set(k, v);
      else if (!v) cache.vals.delete(k);
    }
  }
  cache.knownKeys = keySet;
  const collect = (prefix) => [...cache.vals.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  const members = collect(K.memberPrefix).filter((v) => v && typeof v.id === "string").sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  const policies = collect(K.policyPrefix).filter((v) => v && typeof v.id === "string").sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  const events = collect(K.evPrefix).filter((v) => v && typeof v.occKey === "string");
  const settingsRaw = await kvGet(K.settings).catch(() => null);
  return { members, policies, events, settings: core.normalizeSettings(settingsRaw) };
}
function stateOf(data, policy, now) {
  return core.policyStatus(policy, eventsOf(data, policy.id), data.settings, now);
}
function eventsOf(data, policyId) {
  return core.eventsFor(data.events, policyId);
}
function memberName(data, id) {
  const m = data.members.find((x) => x.id === id);
  return m ? m.name : "\u672A\u77E5\u6210\u5458";
}
async function saveMember(input, existing) {
  const r = core.normalizeMember(input, existing);
  if (r.error || !r.member) throw new Error(r.error || "\u53C2\u6570\u4E0D\u5408\u6CD5");
  await kvSet(K.member(r.member.id), r.member);
  return r.member;
}
async function savePolicy(input, existing) {
  const r = core.normalizePolicy(input, existing);
  if (r.error || !r.policy) throw new Error(r.error || "\u53C2\u6570\u4E0D\u5408\u6CD5");
  await kvSet(K.policy(r.policy.id), r.policy);
  return r.policy;
}
async function saveEvent(input) {
  const r = core.normalizeEvent(input, null);
  if (r.error || !r.ev) throw new Error(r.error || "\u53C2\u6570\u4E0D\u5408\u6CD5");
  await kvSet(K.ev(r.ev.occKey), r.ev);
  return r.ev;
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function deletePolicy(id, data) {
  const evKeys = data.events.filter((e) => e.policyId === id).map((e) => K.ev(e.occKey));
  for (const k of evKeys) await kvDel(k);
  await kvDel(K.policy(id));
  return evKeys.length;
}
async function deleteMember(id, data) {
  const owned = data.policies.filter((p) => p.insuredId === id || p.holderId === id);
  if (owned.length) {
    throw new Error(`\u300C${memberName(data, id)}\u300D\u540D\u4E0B\u6709 ${owned.length} \u5F20\u4FDD\u5355\uFF0C\u5148\u5904\u7406\u4FDD\u5355\u518D\u5220\u6210\u5458`);
  }
  await kvDel(K.member(id));
}
async function deleteEvent(occKey) {
  await kvDel(K.ev(occKey));
}
function exportAll(data) {
  return JSON.stringify({
    kind: "jinkui-export",
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    members: data.members,
    policies: data.policies,
    events: data.events,
    settings: data.settings
  }, null, 2);
}
async function importAll(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  const p = parsed;
  if (!p || p.kind !== "jinkui-export" || !Array.isArray(p.policies)) {
    throw new Error("\u4E0D\u662F\u91D1\u532E\u5BFC\u51FA\u6587\u4EF6\uFF08\u7F3A kind: jinkui-export\uFF09");
  }
  let nMember = 0;
  let nPolicy = 0;
  let nEv = 0;
  for (const raw of p.members || []) {
    const r = core.normalizeMember(raw, null);
    if (r.error || !r.member) continue;
    await kvSet(K.member(r.member.id), r.member);
    nMember++;
  }
  for (const raw of p.policies) {
    const r = core.normalizePolicy(raw, null);
    if (r.error || !r.policy) continue;
    await kvSet(K.policy(r.policy.id), r.policy);
    nPolicy++;
  }
  for (const raw of p.events || []) {
    const r = core.normalizeEvent(raw, null);
    if (r.error || !r.ev) continue;
    await kvSet(K.ev(r.ev.occKey), r.ev);
    nEv++;
  }
  if (p.settings && typeof p.settings === "object") await kvSet(K.settings, core.normalizeSettings(p.settings));
  return { members: nMember, policies: nPolicy, events: nEv };
}

// src/OverviewTab.tsx
var core2 = __toESM(require_core());
import { useMemo } from "react";

// src/ui.tsx
import { jsx } from "react/jsx-runtime";
var KIND_CN = {
  medical: "\u533B\u7597",
  critical: "\u91CD\u75BE",
  life: "\u5BFF\u9669",
  accident: "\u610F\u5916",
  annuity: "\u5E74\u91D1",
  property: "\u5BB6\u8D22",
  other: "\u5176\u4ED6"
};
var FREQ_CN = {
  yearly: "\u5E74\u7F34",
  half: "\u534A\u5E74\u7F34",
  quarter: "\u5B63\u7F34",
  monthly: "\u6708\u7F34",
  single: "\u8DB8\u4EA4"
};
var RELATION_CN = {
  self: "\u672C\u4EBA",
  spouse: "\u914D\u5076",
  child: "\u5B50\u5973",
  parent: "\u7236\u6BCD",
  other: "\u5176\u4ED6"
};
function stateTag(st) {
  if (st.state === "active" || st.state === "paid-off") return /* @__PURE__ */ jsx("span", { className: "jk-tag green", children: st.stateName });
  if (st.state === "grace" || st.state === "lapse") return /* @__PURE__ */ jsx("span", { className: "jk-tag red", children: st.stateName });
  if (st.state === "waiting") return /* @__PURE__ */ jsx("span", { className: "jk-tag yellow", children: st.stateName });
  return /* @__PURE__ */ jsx("span", { className: "jk-tag", children: st.stateName });
}
function kindTag(policy) {
  return /* @__PURE__ */ jsx("span", { className: "jk-tag blue", children: KIND_CN[policy.kind] || policy.kind });
}

// src/OverviewTab.tsx
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
function OverviewTab({ data, states }) {
  const derived = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const totals2 = core2.familyTotals(data.policies, data.events, data.settings, now);
    const gap2 = core2.gapMatrix(data.members, data.policies, data.events, data.settings, now);
    const rows = data.policies.map((p, i) => ({ policy: p, st: states[i] }));
    const reds2 = rows.filter(({ st }) => st.state === "grace" || st.state === "lapse");
    const yellows2 = rows.filter(({ policy, st }) => {
      if (st.state !== "active" && st.state !== "paid-off") return false;
      if (st.nextPayDate && st.daysToPay != null && st.daysToPay >= 0 && st.daysToPay <= data.settings.warnDays) return true;
      if (policy.endDate && st.state === "active") {
        const d = core2.dayDiff(policy.endDate, st.today);
        if (d != null && d >= 0 && d <= data.settings.warnDays) return true;
      }
      return false;
    });
    const waiting2 = rows.filter(({ st }) => st.state === "waiting");
    const ended2 = rows.filter(({ st }) => st.state === "matured" || st.state === "surrendered" || st.state === "terminated");
    return { totals: totals2, gap: gap2, reds: reds2, yellows: yellows2, waiting: waiting2, ended: ended2, now };
  }, [data, states]);
  if (!data || !derived) return /* @__PURE__ */ jsx2("div", { className: "jk-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const { totals, gap, reds, yellows, waiting, ended } = derived;
  if (!data.policies.length) {
    return /* @__PURE__ */ jsxs("div", { className: "jk-empty", children: [
      "\u91D1\u532E\u8FD8\u662F\u7A7A\u7684\u3002\u628A\u5BB6\u91CC\u7684\u4FDD\u5355\u4E00\u5F20\u5F20\u300C\u5165\u67DC\u300D\uFF1A",
      /* @__PURE__ */ jsx2("br", {}),
      "\u5728\u5BF9\u8BDD\u91CC\u8BF4\u300C\u7ED9\u5A03\u4E70\u4E86\u4EFD 50 \u4E07\u7684\u91CD\u75BE\uFF0C\u5E73\u5B89\u7684\uFF0C\u5E74\u7F34 4000 \u7F34 20 \u5E74\u300D",
      /* @__PURE__ */ jsx2("br", {}),
      "\u6216\u5728\u300C\u4FDD\u5355\u300DTab \u70B9\u300C\u65B0\u589E\u4FDD\u5355\u300D\u3002"
    ] });
  }
  const gapBits = gap.rows.filter((r) => r.missing.length).map((r) => `${r.name}\u7F3A ${r.missing.map((k) => KIND_CN[k] || k).join("/")}`);
  const otherBits = Object.entries(gap.otherKinds).filter(([, n]) => n > 0).map(([k, n]) => `${KIND_CN[k] || k}\xD7${n}`);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "jk-bar" }),
      "\u5BB6\u5EAD\u5408\u8BA1"
    ] }),
    /* @__PURE__ */ jsx2("div", { style: { padding: "0 16px 10px" }, children: /* @__PURE__ */ jsxs("div", { className: "jk-grid", children: [
      /* @__PURE__ */ jsxs("div", { className: "jk-stat", children: [
        /* @__PURE__ */ jsxs("b", { className: "jk-num", children: [
          totals.activeCount,
          /* @__PURE__ */ jsxs("small", { style: { fontSize: 11 }, children: [
            " / ",
            totals.policyCount,
            " \u5F20"
          ] })
        ] }),
        /* @__PURE__ */ jsx2("small", { children: "\u5728\u4FDD / \u5165\u67DC\u603B\u6570" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "jk-stat", children: [
        /* @__PURE__ */ jsx2("b", { className: "jk-num", children: core2.fmtMoney(totals.annualizedPremium) }),
        /* @__PURE__ */ jsx2("small", { children: "\u5E74\u7F34\u4FDD\u8D39\uFF08\u8DB8\u4EA4\u4E0D\u8BA1\uFF09" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "jk-stat", children: [
        /* @__PURE__ */ jsx2("b", { className: "jk-num", children: core2.fmtMoney(totals.totalPaid) }),
        /* @__PURE__ */ jsx2("small", { children: "\u7D2F\u8BA1\u5DF2\u7F34" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "jk-stat", children: [
        /* @__PURE__ */ jsx2("b", { className: "jk-num", children: core2.fmtMoney(totals.totalClaim) }),
        /* @__PURE__ */ jsx2("small", { children: "\u7D2F\u8BA1\u7406\u8D54" })
      ] })
    ] }) }),
    reds.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "jk-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "jk-bar" }),
        "\u7EA2\u699C \xB7 \u4FDD\u969C\u98CE\u9669",
        /* @__PURE__ */ jsx2("span", { className: "jk-hint", children: "\u5BBD\u9650\u671F\u4FDD\u969C\u4ECD\u6709\u6548\uFF1B\u4E2D\u6B62\u671F\u51FA\u9669\u4E0D\u8D54" })
      ] }),
      reds.map(({ policy, st }) => /* @__PURE__ */ jsxs("div", { className: "jk-alert", style: st.state === "lapse" ? { background: "#3a1d22", borderColor: "#54262c", color: "#FF8A9A" } : void 0, children: [
        memberName(data, policy.insuredId),
        " \u7684\u300C",
        policy.name,
        "\u300D\u2014\u2014",
        st.stateName,
        st.state === "grace" && st.graceEnd && /* @__PURE__ */ jsxs(Fragment, { children: [
          "\uFF1A\u5E94\u7F34 ",
          st.nextPayDate,
          "\uFF0C\u5BBD\u9650\u671F\u81F3 ",
          /* @__PURE__ */ jsx2("b", { children: st.graceEnd }),
          "\uFF0C\u5C3D\u5FEB\u8865\u7F34"
        ] }),
        st.state === "lapse" && st.graceEnd && /* @__PURE__ */ jsxs(Fragment, { children: [
          "\uFF1A\u590D\u6548\u7A97\u53E3\u7EA6\u81F3 ",
          /* @__PURE__ */ jsx2("b", { children: core2.addDays(st.graceEnd, core2.REINSTATE_WINDOW_DAYS) }),
          "\uFF0C\u8054\u7CFB\u4FDD\u53F8\u529E\u590D\u6548"
        ] })
      ] }, policy.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "jk-bar" }),
      "\u4E34\u8FD1\u7F34\u8D39 / \u6EE1\u671F",
      /* @__PURE__ */ jsxs("span", { className: "jk-hint", children: [
        data.settings.warnDays,
        " \u5929\u5185"
      ] })
    ] }),
    yellows.length === 0 && /* @__PURE__ */ jsx2("div", { className: "jk-card", children: /* @__PURE__ */ jsxs("div", { className: "jk-card-b jk-sub", children: [
      "\u672A\u6765 ",
      data.settings.warnDays,
      " \u5929\u6CA1\u6709\u5E94\u7F34/\u6EE1\u671F\u4FDD\u5355\u3002"
    ] }) }),
    yellows.map(({ policy, st }) => /* @__PURE__ */ jsx2("div", { className: "jk-card", children: /* @__PURE__ */ jsx2("div", { className: "jk-card-b", children: /* @__PURE__ */ jsxs("div", { className: "jk-row", children: [
      /* @__PURE__ */ jsxs("div", { className: "jk-grow", children: [
        /* @__PURE__ */ jsxs("b", { style: { fontSize: 12.5 }, children: [
          memberName(data, policy.insuredId),
          " \xB7 ",
          policy.name
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "jk-sub", children: st.nextPayDate && st.daysToPay != null && st.daysToPay >= 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
          "\u7F34\u8D39 ",
          st.nextPayDate,
          "\uFF08",
          st.daysToPay === 0 ? "\u4ECA\u5929" : `${st.daysToPay} \u5929\u540E`,
          "\uFF09",
          policy.premium != null ? ` ${core2.fmtMoney(policy.premium)}` : ""
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          "\u6EE1\u671F ",
          policy.endDate
        ] }) })
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "jk-tag yellow", children: st.daysToPay != null && st.daysToPay >= 0 && st.nextPayDate ? "\u7F34\u8D39" : "\u6EE1\u671F" })
    ] }) }) }, policy.id)),
    waiting.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "jk-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "jk-bar" }),
        "\u7B49\u5F85\u671F\u4E2D",
        /* @__PURE__ */ jsx2("span", { className: "jk-hint", children: "\u7B49\u5F85\u671F\u5185\u51FA\u9669\u901A\u5E38\u4E0D\u8D54" })
      ] }),
      waiting.map(({ policy, st }) => /* @__PURE__ */ jsx2("div", { className: "jk-card", children: /* @__PURE__ */ jsxs("div", { className: "jk-card-b jk-sub", children: [
        memberName(data, policy.insuredId),
        " \u7684\u300C",
        policy.name,
        "\u300D\u2014\u2014\u7B49\u5F85\u671F\u81F3 ",
        /* @__PURE__ */ jsx2("b", { style: { color: "#E3B341" }, children: st.waitingEnd })
      ] }) }, policy.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "jk-bar" }),
      "\u7F3A\u53E3\u901F\u89C8",
      /* @__PURE__ */ jsx2("span", { className: "jk-hint", children: "\u56DB\u5927\u4EF6 = \u533B\u7597/\u91CD\u75BE/\u5BFF\u9669/\u610F\u5916" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "jk-card", children: /* @__PURE__ */ jsxs("div", { className: "jk-card-b jk-sub", children: [
      gapBits.length ? gapBits.map((b, i) => /* @__PURE__ */ jsxs("div", { children: [
        "\xB7 ",
        b
      ] }, i)) : /* @__PURE__ */ jsx2("div", { children: "\u2705 \u56DB\u5927\u4EF6\u5728\u518C\u6210\u5458\u6682\u65E0\u7F3A\u683C\u3002" }),
      otherBits.length > 0 && /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
        "\u5176\u4ED6\u5728\u4FDD\uFF1A",
        otherBits.join("\u3001"),
        "\uFF08\u4E0D\u8BA1\u5165\u56DB\u5927\u4EF6\uFF09\u3002"
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 4, color: "#5C6678" }, children: "\u53E3\u5F84\uFF1A\u53EA\u7EDF\u8BA1\u6709\u6548/\u7B49\u5F85\u671F/\u5BBD\u9650\u671F\u5185\u7684\u4FDD\u5355\uFF1B\u4E2D\u6B62\u671F\u3001\u5DF2\u9000\u4FDD\u3001\u5DF2\u6EE1\u671F\u4E0D\u8BA1\u5165\u8986\u76D6\u3002\u900F\u89C6\u4E0D\u6784\u6210\u6295\u4FDD\u5EFA\u8BAE\u3002" })
    ] }) }),
    ended.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "jk-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "jk-bar" }),
        "\u7559\u6863",
        /* @__PURE__ */ jsx2("span", { className: "jk-hint", children: "\u6EE1\u671F / \u9000\u4FDD / \u7EC8\u6B62" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "jk-card", children: /* @__PURE__ */ jsx2("div", { className: "jk-card-b jk-sub", children: ended.map(({ policy, st }) => /* @__PURE__ */ jsxs("div", { children: [
        "\xB7 ",
        memberName(data, policy.insuredId),
        " \u7684\u300C",
        policy.name,
        "\u300D\u2014\u2014",
        st.stateName,
        st.surrenderDate ? `\uFF08${st.surrenderDate}\uFF09` : ""
      ] }, policy.id)) }) })
    ] })
  ] });
}

// src/PoliciesTab.tsx
var core3 = __toESM(require_core());
import { useMemo as useMemo2, useState } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var EMPTY_FORM = {
  name: "",
  kind: "medical",
  insuredId: "",
  company: "",
  policyNo: "",
  coverageWan: "",
  coverageNote: "",
  premium: "",
  freq: "yearly",
  payYears: "",
  startDate: "",
  endDate: "",
  waitingDays: "",
  fileNote: "",
  note: ""
};
function toForm(p) {
  return {
    name: p.name,
    kind: p.kind,
    insuredId: p.insuredId,
    company: p.company,
    policyNo: p.policyNo,
    coverageWan: p.coverage != null ? String(p.coverage / 1e4) : "",
    coverageNote: p.coverageNote,
    premium: p.premium != null ? String(p.premium) : "",
    freq: p.freq,
    payYears: p.payYears != null ? String(p.payYears) : "",
    startDate: p.startDate,
    endDate: p.endDate || "",
    waitingDays: p.waitingDays != null ? String(p.waitingDays) : "",
    fileNote: p.fileNote,
    note: p.note
  };
}
function PoliciesTab({ data, states, reload, showToast }) {
  const [filterMember, setFilterMember] = useState("all");
  const [filterKind, setFilterKind] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmDelEv, setConfirmDelEv] = useState(null);
  const rows = useMemo2(() => {
    if (!data) return [];
    return data.policies.map((p, i) => ({ policy: p, st: states[i] })).filter(({ policy, st }) => {
      if (filterMember !== "all" && policy.insuredId !== filterMember) return false;
      if (filterKind !== "all" && policy.kind !== filterKind) return false;
      if (filterState === "inforce" && !core3.coversGap(st.state)) return false;
      if (filterState !== "all" && filterState !== "inforce" && st.state !== filterState) return false;
      return true;
    });
  }, [data, states, filterMember, filterKind, filterState]);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "jk-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const setF = (k) => (e) => {
    setForm((f) => f ? { ...f, [k]: e.target.value } : f);
  };
  const submit = async () => {
    if (!form) return;
    try {
      const input = {
        name: form.name,
        kind: form.kind,
        insuredId: form.insuredId,
        company: form.company,
        policyNo: form.policyNo,
        coverageWan: form.coverageWan || void 0,
        coverageNote: form.coverageNote,
        premium: form.premium || void 0,
        freq: form.freq,
        payYears: form.payYears || void 0,
        startDate: form.startDate,
        endDate: form.endDate || void 0,
        waitingDays: form.waitingDays || void 0,
        fileNote: form.fileNote,
        note: form.note
      };
      const prev = editId ? data.policies.find((p) => p.id === editId) || null : null;
      if (prev) input.name = prev.name;
      await savePolicy(input, prev);
      showToast(prev ? "\u5DF2\u66F4\u65B0\u4FDD\u5355" : "\u5DF2\u5165\u67DC");
      setForm(null);
      setEditId(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const logPayToday = async (p) => {
    try {
      await saveEvent({ type: "pay", policyId: p.id, date: core3.dayKey(Date.now()) });
      showToast(`\u5DF2\u8BB0\u7F34\u8D39\uFF1A${p.name}`);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const doDelete = async (id) => {
    try {
      const n = await deletePolicy(id, data);
      showToast(`\u5DF2\u5220\u9664\u4FDD\u5355\u53CA ${n} \u6761\u6D41\u6C34`);
      setConfirmDel(null);
      setExpanded(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const doDeleteEvent = async (occKey) => {
    try {
      await deleteEvent(occKey);
      showToast("\u5DF2\u5220\u9664\u6D41\u6C34");
      setConfirmDelEv(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  if (form) {
    return /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "jk-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "jk-bar" }),
        editId ? "\u7F16\u8F91\u4FDD\u5355" : "\u65B0\u589E\u4FDD\u5355"
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "jk-card", children: /* @__PURE__ */ jsxs2("div", { className: "jk-card-b", children: [
        /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u4EA7\u54C1\u540D *" }),
        /* @__PURE__ */ jsx3("input", { className: "jk-inp", value: form.name, onChange: setF("name"), placeholder: "\u5982 \u5E73\u5B89e\u751F\u4FDD\xB7\u957F\u671F\u533B\u7597", disabled: !!editId }),
        editId && /* @__PURE__ */ jsx3("div", { className: "jk-sub", children: "\u4EA7\u54C1\u540D\u662F\u5224\u91CD\u951A\u70B9\uFF0C\u7F16\u8F91\u65F6\u4E0D\u53EF\u6539\u3002" }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u9669\u79CD *" }),
            /* @__PURE__ */ jsx3("select", { className: "jk-sel", value: form.kind, onChange: setF("kind"), children: core3.KINDS.map((k) => /* @__PURE__ */ jsx3("option", { value: k, children: KIND_CN[k] }, k)) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u88AB\u4FDD\u9669\u4EBA *" }),
            /* @__PURE__ */ jsxs2("select", { className: "jk-sel", value: form.insuredId, onChange: setF("insuredId"), disabled: !!editId, children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009\u62E9\u6210\u5458\u2026" }),
              data.members.map((m) => /* @__PURE__ */ jsx3("option", { value: m.id, children: m.name }, m.id))
            ] }),
            editId && /* @__PURE__ */ jsx3("div", { className: "jk-sub", children: "\u88AB\u4FDD\u4EBA\u4E0D\u53EF\u6539\uFF1B\u5F55\u9519\u8BF7\u5220\u9664\u91CD\u5EFA\u3002" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u4FDD\u9669\u516C\u53F8" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", value: form.company, onChange: setF("company"), placeholder: "\u5982 \u5E73\u5B89\u4EBA\u5BFF" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u4FDD\u5355\u53F7" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", value: form.policyNo, onChange: setF("policyNo"), placeholder: "\u9009\u586B" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u4FDD\u989D\uFF08\u4E07\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", type: "number", value: form.coverageWan, onChange: setF("coverageWan"), placeholder: "\u5982 300" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u4FDD\u989D\u53E3\u5F84\u8BF4\u660E" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", value: form.coverageNote, onChange: setF("coverageNote"), placeholder: "\u5982 \u4E00\u822C\u533B\u7597300\u4E07/\u5E74" })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u7535\u5B50\u4FDD\u5355\u4F4D\u7F6E" }),
        /* @__PURE__ */ jsx3("input", { className: "jk-inp", value: form.fileNote, onChange: setF("fileNote"), placeholder: "\u5982 \u90AE\u7BB1 xx@yy / \u4FDD\u53F8App-\u6211\u7684\u4FDD\u5355\uFF08\u7406\u8D54\u65F6\u627E\u5F97\u5230\u539F\u4EF6\uFF09" }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u6BCF\u671F\u4FDD\u8D39\uFF08\u5143\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", type: "number", value: form.premium, onChange: setF("premium"), placeholder: "\u5982 4000" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u7F34\u8D39\u9891\u7387 *" }),
            /* @__PURE__ */ jsx3("select", { className: "jk-sel", value: form.freq, onChange: setF("freq"), children: core3.FREQS.map((f) => /* @__PURE__ */ jsx3("option", { value: f, children: FREQ_CN[f] }, f)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u7F34\u8D39\u5E74\u9650\uFF08\u5E74\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", type: "number", value: form.payYears, onChange: setF("payYears"), placeholder: "\u8DB8\u4EA4\u4E0D\u7528\u586B" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u7B49\u5F85\u671F\uFF08\u5929\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", type: "number", value: form.waitingDays, onChange: setF("waitingDays"), placeholder: "\u5982 90" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u9996\u671F\u7F34\u8D39\u65E5 / \u751F\u6548\u65E5 *" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", type: "date", value: form.startDate, onChange: setF("startDate") })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u4FDD\u969C\u671F\u6EE1\u65E5" }),
            /* @__PURE__ */ jsx3("input", { className: "jk-inp", type: "date", value: form.endDate, onChange: setF("endDate") })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("label", { className: "jk-lbl", children: "\u5907\u6CE8" }),
        /* @__PURE__ */ jsx3("input", { className: "jk-inp", value: form.note, onChange: setF("note"), placeholder: "\u5982 \u65E0\u793E\u4FDD\u7248 / \u667A\u80FD\u6838\u4FDD\u901A\u8FC7" }),
        /* @__PURE__ */ jsxs2("div", { className: "jk-row", style: { marginTop: 12 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "jk-btn green", onClick: submit, disabled: !form.name || !form.insuredId || !form.startDate, children: "\u4FDD\u5B58" }),
          /* @__PURE__ */ jsx3("button", { className: "jk-btn ghost", onClick: () => {
            setForm(null);
            setEditId(null);
          }, children: "\u53D6\u6D88" })
        ] })
      ] }) })
    ] });
  }
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "jk-bar" }),
      "\u4FDD\u5355",
      rows.length ? `\uFF08${rows.length}\uFF09` : "",
      /* @__PURE__ */ jsx3("button", { className: "jk-btn green sm", style: { marginLeft: "auto" }, onClick: () => {
        if (!data.members.length) {
          showToast("\u5148\u5728\u300C\u8BBE\u7F6E\u300DTab \u5EFA\u5BB6\u5EAD\u6210\u5458", true);
          return;
        }
        setForm({ ...EMPTY_FORM, insuredId: data.members[0].id, startDate: core3.dayKey(Date.now()) });
      }, children: "+ \u65B0\u589E" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "jk-row", style: { padding: "0 16px 8px", gap: 6 }, children: [
      /* @__PURE__ */ jsxs2("select", { className: "jk-sel", style: { width: "auto", flex: 1 }, value: filterMember, onChange: (e) => setFilterMember(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "all", children: "\u5168\u90E8\u6210\u5458" }),
        data.members.map((m) => /* @__PURE__ */ jsx3("option", { value: m.id, children: m.name }, m.id))
      ] }),
      /* @__PURE__ */ jsxs2("select", { className: "jk-sel", style: { width: "auto", flex: 1 }, value: filterKind, onChange: (e) => setFilterKind(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "all", children: "\u5168\u90E8\u9669\u79CD" }),
        core3.KINDS.map((k) => /* @__PURE__ */ jsx3("option", { value: k, children: KIND_CN[k] }, k))
      ] }),
      /* @__PURE__ */ jsxs2("select", { className: "jk-sel", style: { width: "auto", flex: 1 }, value: filterState, onChange: (e) => setFilterState(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "all", children: "\u5168\u90E8\u72B6\u6001" }),
        /* @__PURE__ */ jsx3("option", { value: "inforce", children: "\u5728\u4FDD" }),
        /* @__PURE__ */ jsx3("option", { value: "grace", children: "\u5BBD\u9650\u671F" }),
        /* @__PURE__ */ jsx3("option", { value: "lapse", children: "\u4E2D\u6B62\u671F" }),
        /* @__PURE__ */ jsx3("option", { value: "waiting", children: "\u7B49\u5F85\u671F" }),
        /* @__PURE__ */ jsx3("option", { value: "matured", children: "\u5DF2\u6EE1\u671F" }),
        /* @__PURE__ */ jsx3("option", { value: "surrendered", children: "\u5DF2\u9000\u4FDD" }),
        /* @__PURE__ */ jsx3("option", { value: "terminated", children: "\u5DF2\u7EC8\u6B62" })
      ] })
    ] }),
    !rows.length && /* @__PURE__ */ jsx3("div", { className: "jk-empty", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u4FDD\u5355\u3002" }),
    rows.map(({ policy, st }) => {
      const pp = core3.periodsPaid(policy, st.paidUntil);
      const tp = core3.totalPeriods(policy);
      const evs = data.events.filter((e) => e.policyId === policy.id).sort((a, b) => a.date < b.date ? -1 : 1);
      const isOpen = expanded === policy.id;
      return /* @__PURE__ */ jsx3("div", { className: "jk-card", children: /* @__PURE__ */ jsxs2("div", { className: "jk-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "jk-row", style: { cursor: "pointer" }, onClick: () => setExpanded(isOpen ? null : policy.id), children: [
          /* @__PURE__ */ jsxs2("div", { className: "jk-grow", children: [
            /* @__PURE__ */ jsxs2("b", { style: { fontSize: 12.5 }, children: [
              memberName(data, policy.insuredId),
              " \xB7 ",
              policy.name
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "jk-sub", children: [
              policy.company || "\u672A\u8BB0\u516C\u53F8",
              " \xB7 ",
              FREQ_CN[policy.freq] || policy.freq,
              policy.premium != null ? ` ${core3.fmtMoney(policy.premium)}` : "",
              st.nextPayDate ? ` \xB7 \u4E0B\u6B21\u7F34\u8D39 ${st.nextPayDate}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "jk-row", style: { gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }, children: [
            kindTag(policy),
            stateTag(st)
          ] })
        ] }),
        isOpen && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 9, borderTop: "1px solid #242C3A", paddingTop: 8 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u4FDD\u5355\u53F7" }),
            /* @__PURE__ */ jsx3("span", { children: policy.policyNo || "\u2014" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u4FDD\u989D" }),
            /* @__PURE__ */ jsx3("span", { children: policy.coverage != null ? `${core3.fmtMoney(policy.coverage)}${policy.coverageNote ? `\uFF08${policy.coverageNote}\uFF09` : ""}` : "\u672A\u767B\u8BB0" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u7F34\u8D39\u8FDB\u5EA6" }),
            /* @__PURE__ */ jsxs2("span", { className: "jk-num", children: [
              pp,
              tp != null ? ` / ${tp}` : "",
              " \u671F \xB7 \u7F34\u81F3 ",
              st.paidUntil
            ] })
          ] }),
          st.waitingEnd && st.state === "waiting" && /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u7B49\u5F85\u671F" }),
            /* @__PURE__ */ jsxs2("span", { style: { color: "#E3B341" }, children: [
              "\u81F3 ",
              st.waitingEnd,
              "\uFF08\u671F\u5185\u51FA\u9669\u901A\u5E38\u4E0D\u8D54\uFF09"
            ] })
          ] }),
          st.graceEnd && st.state === "grace" && /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u5BBD\u9650\u671F" }),
            /* @__PURE__ */ jsxs2("span", { style: { color: "#FF8A9A" }, children: [
              "\u81F3 ",
              st.graceEnd,
              "\uFF08\u4FDD\u969C\u4ECD\u6709\u6548\uFF09"
            ] })
          ] }),
          st.state === "lapse" && /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u4E2D\u6B62\u671F" }),
            /* @__PURE__ */ jsx3("span", { style: { color: "#FF8A9A" }, children: "\u51FA\u9669\u4E0D\u8D54\uFF0C\u53EF\u7533\u8BF7\u590D\u6548" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u4FDD\u969C\u671F" }),
            /* @__PURE__ */ jsxs2("span", { children: [
              policy.endDate ? `\u81F3 ${policy.endDate}` : "\u7EC8\u8EAB/\u672A\u586B",
              policy.waitingDays != null ? ` \xB7 \u7B49\u5F85\u671F ${policy.waitingDays} \u5929` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u7535\u5B50\u4FDD\u5355" }),
            /* @__PURE__ */ jsx3("span", { children: policy.fileNote || "\u672A\u767B\u8BB0\uFF08\u5EFA\u8BAE\u8865\u8BB0\uFF09" })
          ] }),
          policy.note && /* @__PURE__ */ jsxs2("div", { className: "jk-kv", children: [
            /* @__PURE__ */ jsx3("span", { children: "\u5907\u6CE8" }),
            /* @__PURE__ */ jsx3("span", { children: policy.note })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "jk-lbl", style: { marginTop: 10 }, children: [
            "\u6D41\u6C34\uFF08",
            evs.length,
            "\uFF09"
          ] }),
          evs.length === 0 && /* @__PURE__ */ jsx3("div", { className: "jk-sub", children: "\u6682\u65E0\u7F34\u8D39/\u7406\u8D54/\u6279\u6539\u6D41\u6C34\u3002" }),
          evs.slice().reverse().map((e) => /* @__PURE__ */ jsxs2("div", { className: "jk-row", style: { padding: "2px 0" }, children: [
            /* @__PURE__ */ jsxs2("span", { className: "jk-sub jk-grow", children: [
              e.date,
              " \xB7 ",
              core3.EVENT_NAMES[e.type] || e.type,
              e.amount != null ? ` ${core3.fmtMoney(e.amount)}` : "",
              e.note ? ` \xB7 ${e.note}` : ""
            ] }),
            confirmDelEv === e.occKey ? /* @__PURE__ */ jsx3("button", { className: "jk-btn danger sm", onClick: () => doDeleteEvent(e.occKey), children: "\u786E\u8BA4\u5220" }) : /* @__PURE__ */ jsx3("button", { className: "jk-btn ghost sm", onClick: () => setConfirmDelEv(e.occKey), children: "\u5220" })
          ] }, e.occKey)),
          /* @__PURE__ */ jsxs2("div", { className: "jk-row", style: { marginTop: 10, gap: 6, flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx3("button", { className: "jk-btn green sm", onClick: () => logPayToday(policy), children: "\u8BB0\u4E00\u7B14\u7F34\u8D39" }),
            /* @__PURE__ */ jsx3("button", { className: "jk-btn ghost sm", onClick: () => {
              setForm(toForm(policy));
              setEditId(policy.id);
            }, children: "\u7F16\u8F91" }),
            confirmDel === policy.id ? /* @__PURE__ */ jsx3("button", { className: "jk-btn danger sm", onClick: () => doDelete(policy.id), children: "\u786E\u8BA4\u5220\u9664\uFF08\u8FDE\u5E26\u6D41\u6C34\uFF09" }) : /* @__PURE__ */ jsx3("button", { className: "jk-btn danger sm", onClick: () => setConfirmDel(policy.id), children: "\u5220\u9664" })
          ] })
        ] })
      ] }) }, policy.id);
    })
  ] });
}

// src/InsightsTab.tsx
var core4 = __toESM(require_core());
import { useMemo as useMemo3 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function InsightsTab({ data }) {
  const derived = useMemo3(() => {
    if (!data) return null;
    const now = Date.now();
    const gap2 = core4.gapMatrix(data.members, data.policies, data.events, data.settings, now);
    const flow2 = core4.premiumFlow(data.policies, data.events, data.settings, now);
    const claims2 = data.events.filter((e) => e.type === "claim").sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 20).map((e) => ({ ev: e, policy: data.policies.find((p) => p.id === e.policyId) || null }));
    return { gap: gap2, flow: flow2, claims: claims2, now };
  }, [data]);
  if (!data || !derived) return /* @__PURE__ */ jsx4("div", { className: "jk-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const { gap, flow, claims } = derived;
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "jk-bar" }),
      "\u4FDD\u969C\u7F3A\u53E3\u77E9\u9635",
      /* @__PURE__ */ jsx4("span", { className: "jk-hint", children: "\u73B0\u72B6\u900F\u89C6\uFF0C\u4E0D\u6784\u6210\u6295\u4FDD\u5EFA\u8BAE" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "jk-card", children: /* @__PURE__ */ jsxs3("div", { className: "jk-card-b", style: { overflowX: "auto" }, children: [
      !data.members.length && /* @__PURE__ */ jsx4("div", { className: "jk-sub", children: "\u5148\u5728\u300C\u8BBE\u7F6E\u300DTab \u5EFA\u6210\u5458\u3002" }),
      !!data.members.length && /* @__PURE__ */ jsxs3("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11 }, children: [
        /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs3("tr", { style: { color: "#8B95A7" }, children: [
          /* @__PURE__ */ jsx4("th", { style: { textAlign: "left", padding: "3px 6px", fontWeight: 600 }, children: "\u6210\u5458" }),
          core4.GAP_KINDS.map((k) => /* @__PURE__ */ jsx4("th", { style: { textAlign: "left", padding: "3px 6px", fontWeight: 600 }, children: KIND_CN[k] }, k))
        ] }) }),
        /* @__PURE__ */ jsx4("tbody", { children: gap.rows.map((row) => /* @__PURE__ */ jsxs3("tr", { style: { borderTop: "1px solid #242C3A" }, children: [
          /* @__PURE__ */ jsx4("td", { style: { padding: "5px 6px", whiteSpace: "nowrap" }, children: row.name }),
          core4.GAP_KINDS.map((k) => {
            const c = row.cells[k];
            return /* @__PURE__ */ jsx4("td", { style: { padding: "5px 6px", whiteSpace: "nowrap" }, children: c ? /* @__PURE__ */ jsxs3("span", { children: [
              c.count,
              " \u5F20 \xB7 ",
              /* @__PURE__ */ jsx4("b", { className: "jk-num", children: core4.fmtMoney(c.sum) })
            ] }) : /* @__PURE__ */ jsx4("span", { className: "jk-tag red", children: "\u7F3A" }) }, k);
          })
        ] }, row.memberId)) })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "jk-sub", style: { marginTop: 8 }, children: [
        "\u53E3\u5F84\uFF1A\u53EA\u7EDF\u8BA1\u6709\u6548/\u7B49\u5F85\u671F/\u5BBD\u9650\u671F\u5185\u7684\u4FDD\u5355\uFF1B\u4E2D\u6B62\u671F\u3001\u5DF2\u9000\u4FDD\u3001\u5DF2\u6EE1\u671F\u4E0D\u8BA1\u5165\u8986\u76D6\uFF08\u4E2D\u6B62\u671F\u51FA\u9669\u4E0D\u8D54\uFF0C\u5982\u5B9E\u5448\u73B0\uFF09\u3002",
        Object.entries(gap.otherKinds).some(([, n]) => n > 0) && /* @__PURE__ */ jsxs3(Fragment3, { children: [
          " \u5176\u4ED6\u5728\u4FDD\uFF1A",
          Object.entries(gap.otherKinds).filter(([, n]) => n > 0).map(([k, n]) => `${KIND_CN[k] || k}\xD7${n}`).join("\u3001"),
          "\uFF08\u4FE1\u606F\u5C42\uFF09\u3002"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "jk-bar" }),
      "\u672A\u6765 12 \u4E2A\u6708\u4FDD\u8D39\u73B0\u91D1\u6D41",
      /* @__PURE__ */ jsxs3("span", { className: "jk-hint", children: [
        "\u5408\u8BA1 ",
        core4.fmtMoney(flow.total)
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "jk-card", children: /* @__PURE__ */ jsxs3("div", { className: "jk-card-b", children: [
      Object.keys(flow.months).length === 0 && /* @__PURE__ */ jsx4("div", { className: "jk-sub", children: "\u672A\u6765 12 \u4E2A\u6708\u65E0\u5E94\u7F34\uFF08\u8DB8\u4EA4/\u7F34\u8D39\u671F\u6EE1/\u65E0\u4FDD\u8D39\u8BB0\u5F55\uFF09\u3002" }),
      Object.keys(flow.months).sort().map((mk) => /* @__PURE__ */ jsxs3("div", { className: "jk-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "jk-num", children: mk }),
        /* @__PURE__ */ jsxs3("span", { className: "jk-num", children: [
          core4.fmtMoney(flow.months[mk].amount),
          /* @__PURE__ */ jsxs3("span", { className: "jk-sub", children: [
            "\uFF08",
            flow.months[mk].items.map((i) => i.name).join("\u3001"),
            "\uFF09"
          ] })
        ] })
      ] }, mk))
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "jk-bar" }),
      "\u7406\u8D54\u6D41\u6C34",
      /* @__PURE__ */ jsx4("span", { className: "jk-hint", children: "\u6700\u8FD1 20 \u6761" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "jk-card", children: /* @__PURE__ */ jsxs3("div", { className: "jk-card-b", children: [
      !claims.length && /* @__PURE__ */ jsx4("div", { className: "jk-sub", children: "\u6682\u65E0\u7406\u8D54\u8BB0\u5F55\u3002\u7406\u8D54\u5230\u8D26\u540E\u5728\u5BF9 AI \u8BF4\u300CXX \u4FDD\u5355\u7406\u8D54\u4E0B\u6765 N \u5143\u300D\u5373\u53EF\u8BB0\u5165\u3002" }),
      claims.map(({ ev, policy }) => /* @__PURE__ */ jsxs3("div", { className: "jk-kv", children: [
        /* @__PURE__ */ jsxs3("span", { children: [
          ev.date,
          " \xB7 ",
          policy ? policy.name : "\u5DF2\u5220\u4FDD\u5355",
          ev.note ? ` \xB7 ${ev.note}` : ""
        ] }),
        /* @__PURE__ */ jsx4("span", { className: "jk-num", style: { color: "#3FB950" }, children: ev.amount != null ? core4.fmtMoney(ev.amount) : "" })
      ] }, ev.occKey))
    ] }) })
  ] });
}

// src/SettingsTab.tsx
var core5 = __toESM(require_core());
import { useRef, useState as useState2 } from "react";
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [name, setName] = useState2("");
  const [relation, setRelation] = useState2("self");
  const [birthYear, setBirthYear] = useState2("");
  const [confirmDel, setConfirmDel] = useState2(null);
  const [importText, setImportText] = useState2("");
  const [showImport, setShowImport] = useState2(false);
  const fileRef = useRef(null);
  if (!data) return /* @__PURE__ */ jsx5("div", { className: "jk-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const addMember = async () => {
    if (!name.trim()) {
      showToast("\u6210\u5458\u540D\u5B57\u5FC5\u586B", true);
      return;
    }
    try {
      await saveMember({ name, relation, birthYear: birthYear || void 0 }, null);
      showToast(`\u5DF2\u5EFA\u6210\u5458\uFF1A${name}`);
      setName("");
      setBirthYear("");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const doDelete = async (id) => {
    try {
      await deleteMember(id, data);
      showToast("\u5DF2\u5220\u9664\u6210\u5458");
      setConfirmDel(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const updateSettings = async (patch) => {
    try {
      await saveSettings(core5.normalizeSettings({ ...data.settings, ...patch }));
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const download = () => {
    const blob = new Blob([exportAll(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jinkui-export-${core5.dayKey(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = async (json) => {
    try {
      const r = await importAll(json);
      showToast(`\u5BFC\u5165\u5B8C\u6210\uFF1A\u6210\u5458 ${r.members}\u3001\u4FDD\u5355 ${r.policies}\u3001\u6D41\u6C34 ${r.events}`);
      setImportText("");
      setShowImport(false);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "jk-bar" }),
      "\u5BB6\u5EAD\u6210\u5458",
      /* @__PURE__ */ jsx5("span", { className: "jk-hint", children: "\u4FDD\u5355\u7684\u88AB\u4FDD\u9669\u4EBA\u6863\u6848" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "jk-card", children: /* @__PURE__ */ jsxs4("div", { className: "jk-card-b", children: [
      !data.members.length && /* @__PURE__ */ jsx5("div", { className: "jk-sub", children: "\u8FD8\u6CA1\u6709\u6210\u5458\u3002\u5148\u5EFA\u300C\u672C\u4EBA\u300D\uFF0C\u5BB6\u4EBA\u6309\u9700\u6DFB\u52A0\uFF1B\u5BF9\u8BDD\u91CC\u5EFA\u4FDD\u5355\u65F6\u672A\u77E5\u540D\u5B57\u4E5F\u4F1A\u81EA\u52A8\u5EFA\u6863\u3002" }),
      data.members.map((m) => /* @__PURE__ */ jsxs4("div", { className: "jk-row", style: { padding: "3px 0" }, children: [
        /* @__PURE__ */ jsxs4("span", { className: "jk-grow", children: [
          /* @__PURE__ */ jsx5("b", { style: { fontSize: 12 }, children: m.name }),
          /* @__PURE__ */ jsx5("span", { className: "jk-tag", style: { marginLeft: 6 }, children: RELATION_CN[m.relation] || m.relation }),
          m.birthYear != null && /* @__PURE__ */ jsxs4("span", { className: "jk-sub", children: [
            " ",
            m.birthYear,
            " \u5E74\u751F"
          ] })
        ] }),
        confirmDel === m.id ? /* @__PURE__ */ jsx5("button", { className: "jk-btn danger sm", onClick: () => doDelete(m.id), children: "\u786E\u8BA4\u5220" }) : /* @__PURE__ */ jsx5("button", { className: "jk-btn ghost sm", onClick: () => setConfirmDel(m.id), children: "\u5220" })
      ] }, m.id)),
      /* @__PURE__ */ jsxs4("div", { className: "jk-grid", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx5("input", { className: "jk-inp", value: name, onChange: (e) => setName(e.target.value), placeholder: "\u540D\u5B57\uFF0C\u5982 \u59BB\u5B50" }),
        /* @__PURE__ */ jsx5("select", { className: "jk-sel", value: relation, onChange: (e) => setRelation(e.target.value), children: core5.RELATIONS.map((r) => /* @__PURE__ */ jsx5("option", { value: r, children: RELATION_CN[r] }, r)) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "jk-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx5("input", { className: "jk-inp", style: { width: 120 }, type: "number", value: birthYear, onChange: (e) => setBirthYear(e.target.value), placeholder: "\u51FA\u751F\u5E74\uFF08\u9009\u586B\uFF09" }),
        /* @__PURE__ */ jsx5("button", { className: "jk-btn green sm", onClick: addMember, children: "+ \u5EFA\u6210\u5458" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "jk-bar" }),
      "\u63D0\u9192\u53C2\u6570"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "jk-card", children: /* @__PURE__ */ jsxs4("div", { className: "jk-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "jk-kv", children: [
        /* @__PURE__ */ jsxs4("span", { children: [
          "\u9EC4\u699C\u63D0\u524D\u5929\u6570",
          /* @__PURE__ */ jsx5("span", { className: "jk-sub", children: "\uFF08\u7F34\u8D39/\u6EE1\u671F\u63D0\u524D\u591A\u5C11\u5929\u8FDB\u9EC4\u699C\uFF09" })
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "jk-inp",
            style: { width: 76 },
            type: "number",
            value: data.settings.warnDays,
            onChange: (e) => updateSettings({ warnDays: Math.floor(Number(e.target.value)) || 30 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "jk-kv", children: [
        /* @__PURE__ */ jsxs4("span", { children: [
          "\u5BBD\u9650\u671F\u5929\u6570",
          /* @__PURE__ */ jsx5("span", { className: "jk-sub", children: "\uFF08\u957F\u671F\u9669\u6CD5\u5B9A 60 \u5929\uFF0C\u4E00\u822C\u65E0\u9700\u6539\uFF09" })
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "jk-inp",
            style: { width: 76 },
            type: "number",
            value: data.settings.graceDays,
            onChange: (e) => updateSettings({ graceDays: Math.floor(Number(e.target.value)) || 60 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "jk-sub", style: { marginTop: 6 }, children: [
        "\u53E3\u5F84\uFF1A\u957F\u671F\u9669\u7F34\u8D39\u903E\u671F\u540E ",
        data.settings.graceDays,
        " \u5929\u5185\u4E3A\u5BBD\u9650\u671F\uFF08\u4FDD\u969C\u4ECD\u6709\u6548\uFF09\uFF0C\u5176\u540E 2 \u5E74\u4E3A\u4E2D\u6B62\u671F\uFF08\u51FA\u9669\u4E0D\u8D54\u3001\u53EF\u590D\u6548\uFF09\uFF1B \u4E00\u5E74\u671F\u77ED\u9669\u5230\u671F\u5373\u6EE1\u671F\u3001\u65E0\u5BBD\u9650\u671F\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "jk-bar" }),
      "\u5BFC\u51FA / \u5BFC\u5165"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "jk-card", children: /* @__PURE__ */ jsxs4("div", { className: "jk-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "jk-row", style: { gap: 6 }, children: [
        /* @__PURE__ */ jsx5("button", { className: "jk-btn green sm", onClick: download, children: "\u5BFC\u51FA JSON" }),
        /* @__PURE__ */ jsx5("button", { className: "jk-btn ghost sm", onClick: () => setShowImport(!showImport), children: "\u5BFC\u5165 JSON" }),
        showImport && /* @__PURE__ */ jsx5("button", { className: "jk-btn ghost sm", onClick: () => fileRef.current?.click(), children: "\u4ECE\u6587\u4EF6\u9009\u62E9" }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            ref: fileRef,
            type: "file",
            accept: ".json,application/json",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => doImport(String(reader.result || ""));
              reader.readAsText(f);
              e.target.value = "";
            }
          }
        )
      ] }),
      showImport && /* @__PURE__ */ jsxs4(Fragment4, { children: [
        /* @__PURE__ */ jsx5(
          "textarea",
          {
            className: "jk-inp",
            style: { marginTop: 8, minHeight: 84 },
            value: importText,
            onChange: (e) => setImportText(e.target.value),
            placeholder: "\u7C98\u8D34 jinkui-export JSON\uFF08\u540C id/\u540C occKey \u8DF3\u8FC7\uFF0C\u4E0D\u8986\u76D6\u73B0\u6709\u6570\u636E\uFF09"
          }
        ),
        /* @__PURE__ */ jsx5("button", { className: "jk-btn green sm", style: { marginTop: 6 }, disabled: !importText.trim(), onClick: () => doImport(importText), children: "\u6267\u884C\u5BFC\u5165" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "jk-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "jk-bar" }),
      "\u53E3\u5F84\u4E0E\u8FB9\u754C"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "jk-card", children: /* @__PURE__ */ jsxs4("div", { className: "jk-card-b jk-sub", style: { lineHeight: 1.8 }, children: [
      "\xB7 \u91D1\u532E\u662F\u300C\u5BB6\u5EAD\u4FDD\u5355\u53F0\u8D26\u300D\uFF1A\u8BB0\u5F55\u3001\u7F34\u8D39\u63D0\u9192\u3001\u5BBD\u9650\u671F/\u4E2D\u6B62\u671F\u72B6\u6001\u6295\u5F71\u3001\u56DB\u5927\u4EF6\u8986\u76D6\u900F\u89C6\u3002",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u4E0D\u505A\u4EA7\u54C1\u63A8\u8350\u3001\u4E0D\u505A\u4FDD\u8D39\u5BF9\u6BD4\u3001\u4E0D\u6784\u6210\u6295\u4FDD/\u9000\u4FDD\u5EFA\u8BAE\uFF1B\u9000\u4FDD\u901A\u5E38\u53EA\u9000\u73B0\u91D1\u4EF7\u503C\uFF0C\u51B3\u5B9A\u524D\u4E0E\u4FDD\u53F8\u786E\u8BA4\u3002",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u72B6\u6001\u4E3A\u53F0\u8D26\u53E3\u5F84\u6295\u5F71\uFF1A\u4E0E\u4FDD\u53F8\u5B9E\u9645\u5BBD\u9650/\u590D\u6548\u6761\u6B3E\u6709\u51FA\u5165\u65F6\u4EE5\u5408\u540C\u4E3A\u51C6\u3002",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u7EAF\u672C\u5730\u5B58\u50A8\uFF08cap.kv\uFF09\uFF0C\u96F6\u8D26\u53F7\u96F6\u4E0A\u4F20\uFF1B\u300C\u7535\u5B50\u4FDD\u5355\u4F4D\u7F6E\u300D\u53EA\u767B\u8BB0\u8DEF\u5F84\u63CF\u8FF0\uFF0C\u4E0D\u5B58\u6587\u4EF6\u672C\u4F53\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.jk-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.jk-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.jk-body{flex:1;overflow-y:auto;padding:0 0 24px}
.jk-body::-webkit-scrollbar{width:9px;height:9px}
.jk-body::-webkit-scrollbar-track{background:transparent}
.jk-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.jk-page{max-width:580px;margin:0 auto}

/* \u5934\u90E8 */
.jk-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.jk-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#1F7A5C,#2E9E77);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.jk-tt{flex:1;min-width:0}
.jk-tt b{font-size:15px;display:block}
.jk-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.jk-tabs{display:flex;gap:4px}
.jk-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.jk-tab:hover{color:#E6EAF2}
.jk-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.jk-badge{position:absolute;top:0;right:2px;background:#D64545;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.jk-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.jk-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#1F7A5C,#2E9E77);flex-shrink:0}
.jk-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.jk-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.jk-card-b{padding:11px 13px}
.jk-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.jk-btn:hover{filter:brightness(1.1)}
.jk-btn:disabled{opacity:.45;cursor:not-allowed}
.jk-btn.green{background:#1F5C46;color:#7EE2B8}
.jk-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.jk-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.jk-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.jk-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.jk-inp:focus{outline:none;border-color:#2b6cb0}
.jk-inp::placeholder{color:#4d5566}
.jk-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.jk-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.jk-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.jk-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.jk-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.jk-toast.bad{border-color:#54262c;color:#FF8A9A}
.jk-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.jk-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.jk-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.jk-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.jk-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.jk-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.jk-row{display:flex;align-items:center;gap:8px;min-width:0}
.jk-grow{flex:1;min-width:0}
.jk-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.jk-alert{margin:0 16px 10px;background:#332a12;border:1px solid #5a4a1e;border-radius:10px;padding:8px 12px;font-size:11.5px;color:#E3B341;line-height:1.7}
.jk-num{font-variant-numeric:tabular-nums}
.jk-kv{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;font-size:12px}
.jk-kv>span:first-child{color:#8B95A7;flex-shrink:0}
.jk-kv>span:last-child{text-align:right;min-width:0}
.jk-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jk-stat{background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 11px}
.jk-stat b{display:block;font-size:15px;font-weight:700}
.jk-stat small{color:#8B95A7;font-size:10px}
`;
function JinkuiPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState3("overview");
  const [data, setData] = useState3(null);
  const [loadErr, setLoadErr] = useState3("");
  const [toast, setToast] = useState3(null);
  const cacheRef = useRef2(newCache());
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3e3);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadJinkui(cacheRef.current);
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
  const states = useMemo4(() => {
    if (!data) return [];
    const now = Date.now();
    return data.policies.map((p) => stateOf(data, p, now));
  }, [data]);
  const alertCount = useMemo4(() => {
    if (!data) return 0;
    return states.filter((st) => st.state === "grace" || st.state === "lapse").length;
  }, [states]);
  const tabProps = { data, reload, showToast, pluginId, onSendToChat };
  return /* @__PURE__ */ jsxs5("div", { className: "jk-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "jk-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "jk-logo", children: "\u{1F6E1}\uFE0F" }),
      /* @__PURE__ */ jsxs5("div", { className: "jk-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u91D1\u532E" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          "\u5BB6\u5EAD\u4FDD\u5355\u53F0\u8D26 \xB7 ",
          data ? `${data.policies.length} \u5F20\u5165\u67DC \xB7 \u6570\u636E\u4EC5\u5B58\u672C\u673A` : "\u52A0\u8F7D\u4E2D\u2026"
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "jk-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["policies", "\u4FDD\u5355"],
        ["insights", "\u900F\u89C6"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `jk-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "overview" && alertCount > 0 && /* @__PURE__ */ jsx6("span", { className: "jk-badge", children: alertCount > 9 ? "9+" : alertCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "jk-body", children: /* @__PURE__ */ jsxs5("div", { className: "jk-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "jk-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx6(OverviewTab, { ...tabProps, states }),
      tab === "policies" && /* @__PURE__ */ jsx6(PoliciesTab, { ...tabProps, states }),
      tab === "insights" && /* @__PURE__ */ jsx6(InsightsTab, { ...tabProps, states }),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { ...tabProps }),
      /* @__PURE__ */ jsxs5("div", { className: "jk-foot", children: [
        "\u91D1\u532E\u53EA\u505A\u4FDD\u5355\u8BB0\u5F55\u4E0E\u73B0\u72B6\u900F\u89C6\uFF1A\u72B6\u6001/\u5BBD\u9650\u671F/\u7F3A\u53E3\u4E3A\u53F0\u8D26\u53E3\u5F84\u6295\u5F71\uFF0C\u4E0E\u4FDD\u53F8\u5B9E\u9645\u6761\u6B3E\u53EF\u80FD\u6709\u51FA\u5165\uFF1B",
        /* @__PURE__ */ jsx6("br", {}),
        "\u4E0D\u6784\u6210\u6295\u4FDD\u5EFA\u8BAE\uFF0C\u9000\u4FDD/\u590D\u6548/\u7406\u8D54\u4EE5\u4FDD\u53F8\u5408\u540C\u4E0E\u5BA2\u670D\u4E3A\u51C6\u3002\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002"
      ] })
    ] }) }),
    toast && /* @__PURE__ */ jsx6("div", { className: `jk-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
var src_default = JinkuiPanel;
export {
  src_default as default
};
