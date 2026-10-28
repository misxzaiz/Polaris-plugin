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
    var NAME_CAP = 40;
    var LENDER_CAP = 40;
    var NOTE_CAP = 300;
    var MAX_TERM_MONTHS = 600;
    var MAX_WALK = 1200;
    var METHODS = ["annuity", "linear", "bullet"];
    var METHOD_NAMES2 = { annuity: "\u7B49\u989D\u672C\u606F", linear: "\u7B49\u989D\u672C\u91D1", bullet: "\u5148\u606F\u540E\u672C" };
    var KINDS = ["mortgage", "car", "consumer", "business", "other"];
    var KIND_NAMES = { mortgage: "\u623F\u8D37", car: "\u8F66\u8D37", consumer: "\u6D88\u8D39\u8D37", business: "\u7ECF\u8425\u8D37", other: "\u5176\u4ED6" };
    var EVENT_TYPES = ["rate", "prepay", "checkpoint"];
    var CYCLES = [3, 6, 12];
    var PREPAY_MIN = 100;
    var EPS_BAL = 5e-3;
    function clip(s, cap) {
      return String(s == null ? "" : s).trim().slice(0, cap);
    }
    function idFor(seed) {
      return "f" + sha256Hex(String(seed)).slice(0, 12);
    }
    function randTag() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function round2(x) {
      return Math.round(x * 100) / 100;
    }
    function dayKey(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseDayKey(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
      if (!m) return null;
      const ts = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      const d = new Date(ts);
      return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? ts : null;
    }
    function dayDiff2(a, b) {
      const ta = parseDayKey(a);
      const tb = parseDayKey(b);
      if (ta == null || tb == null) return null;
      return Math.round((ta - tb) / DAY_MS);
    }
    function daysInMonth(y, mIdx) {
      return new Date(y, mIdx + 1, 0).getDate();
    }
    function addMonths(dateStr, k) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
      if (!m) return null;
      const y = +m[1];
      const mo = +m[2] - 1;
      const d = +m[3];
      if (d < 1 || d > daysInMonth(y, mo)) return null;
      const total = y * 12 + mo + k;
      const ny = Math.floor(total / 12);
      const nmo = total - ny * 12;
      const nd = Math.min(d, daysInMonth(ny, nmo));
      return `${ny}-${String(nmo + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
    }
    function fmtMoney4(x) {
      if (x == null || !Number.isFinite(+x)) return "\u2014";
      const n = round2(+x);
      const neg = n < 0;
      const abs = Math.abs(n);
      const s = abs >= 1e4 ? `${(abs / 1e4).toFixed(abs >= 1e6 ? 1 : 2)} \u4E07` : `${abs.toFixed(2).replace(/\.00$/, "")} \u5143`;
      return (neg ? "\u2212" : "") + s;
    }
    function fmtPct5(x) {
      if (x == null || !Number.isFinite(+x)) return "\u2014";
      return `${round2(+x * 100) / 100}%`;
    }
    function normalizeLoan2(input, prev) {
      const src = input || {};
      const prevLoan = prev && typeof prev === "object" ? prev : null;
      const name = clip(src.name != null ? src.name : prevLoan && prevLoan.name, NAME_CAP);
      if (!name) return { error: "\u8D37\u6B3E\u540D\u79F0\u5FC5\u586B\uFF08\u5982\u300C\u5546\u8D37\u300D\u300C\u516C\u79EF\u91D1\u300D\u300C\u8F66\u8D37\u300D\uFF09" };
      const kind = KINDS.includes(src.kind) ? src.kind : KINDS.includes(prevLoan && prevLoan.kind) ? prevLoan.kind : "mortgage";
      const method = METHODS.includes(src.method) ? src.method : METHODS.includes(prevLoan && prevLoan.method) ? prevLoan.method : null;
      if (!method) return { error: `\u8FD8\u6B3E\u65B9\u5F0F\u5FC5\u586B\uFF1Aannuity(\u7B49\u989D\u672C\u606F)/linear(\u7B49\u989D\u672C\u91D1)/bullet(\u5148\u606F\u540E\u672C)` };
      const principal = Math.round((+(src.principal != null ? src.principal : prevLoan && prevLoan.principal) || 0) * 100) / 100;
      if (!Number.isFinite(principal) || principal < 100 || principal > 2e8) {
        return { error: "\u672C\u91D1\u4E0D\u5408\u6CD5\uFF08100 \u5143 ~ 2 \u4EBF\u5143\uFF09" };
      }
      const annualRate = Math.round((+(src.annualRate != null ? src.annualRate : prevLoan && prevLoan.annualRate) || 0) * 1e4) / 1e4;
      if (!Number.isFinite(annualRate) || annualRate < 1e-4 || annualRate > 36) {
        return { error: "\u5E74\u5229\u7387\u4E0D\u5408\u6CD5\uFF080.0001% ~ 36%\uFF09" };
      }
      const startDate = clip(src.startDate != null ? src.startDate : prevLoan && prevLoan.startDate, 10);
      if (parseDayKey(startDate) == null) return { error: `\u5F00\u59CB\u65E5\u671F\u4E0D\u5408\u6CD5\uFF1A${startDate || "\uFF08\u7A7A\uFF09"}\uFF08YYYY-MM-DD\uFF0C\u7B2C\u4E00\u671F\u8FD8\u6B3E\u65E5\uFF09` };
      const termMonths = Math.round(+(src.termMonths != null ? src.termMonths : prevLoan && prevLoan.termMonths) || 0);
      if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_TERM_MONTHS) {
        return { error: `\u671F\u6570\u4E0D\u5408\u6CD5\uFF081 ~ ${MAX_TERM_MONTHS} \u4E2A\u6708\uFF09` };
      }
      let repricing = null;
      const rpSrc = src.repricing !== void 0 ? src.repricing : prevLoan && prevLoan.repricing;
      if (rpSrc && typeof rpSrc === "object") {
        const day = clip(rpSrc.day, 12);
        const cm = Math.round(+rpSrc.cycleMonths || 0);
        if (day !== "anniversary" && !/^\d{2}-\d{2}$/.test(day)) {
          return { error: '\u91CD\u5B9A\u4EF7\u65E5\u5E94\u4E3A MM-DD\uFF08\u5982 01-01\uFF09\u6216 "anniversary"\uFF08\u653E\u6B3E\u5BF9\u6708\u5BF9\u65E5\uFF09' };
        }
        if (day !== "anniversary") {
          const mm = +day.slice(0, 2);
          const dd = +day.slice(3, 5);
          if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { error: `\u91CD\u5B9A\u4EF7\u65E5\u4E0D\u5408\u6CD5\uFF1A${day}` };
        }
        if (!CYCLES.includes(cm)) return { error: "\u91CD\u5B9A\u4EF7\u5468\u671F\u53EA\u652F\u6301 3 / 6 / 12 \u4E2A\u6708" };
        repricing = { day, cycleMonths: cm };
      }
      const loan = {
        id: clip(src.id, 20) || prevLoan && prevLoan.id || idFor("loan|" + name),
        name,
        lender: clip(src.lender != null ? src.lender : prevLoan && prevLoan.lender, LENDER_CAP),
        kind,
        method,
        principal,
        annualRate,
        startDate,
        termMonths,
        repricing,
        groupId: clip(src.groupId != null ? src.groupId : prevLoan && prevLoan.groupId, NAME_CAP),
        note: clip(src.note != null ? src.note : prevLoan && prevLoan.note, NOTE_CAP),
        active: src.active === void 0 ? prevLoan ? prevLoan.active !== false : true : src.active !== false,
        createdAt: Math.round(+(src.createdAt != null ? src.createdAt : prevLoan && prevLoan.createdAt) || Date.now())
      };
      return { loan };
    }
    function normalizeEvent2(input, prev) {
      const src = input || {};
      const prevEv = prev && typeof prev === "object" ? prev : null;
      const type = EVENT_TYPES.includes(src.type) ? src.type : EVENT_TYPES.includes(prevEv && prevEv.type) ? prevEv.type : null;
      if (!type) return { error: `\u4E8B\u4EF6\u7C7B\u578B\u5FC5\u586B\uFF1Arate(\u5229\u7387\u53D8\u66F4)/prepay(\u63D0\u524D\u8FD8\u6B3E)/checkpoint(\u5BF9\u8D26)` };
      const loanId = clip(src.loanId != null ? src.loanId : prevEv && prevEv.loanId, 20);
      if (!loanId) return { error: "loanId \u5FC5\u586B" };
      const date = clip(src.date != null ? src.date : prevEv && prevEv.date, 10);
      if (parseDayKey(date) == null) return { error: `\u65E5\u671F\u4E0D\u5408\u6CD5\uFF1A${date || "\uFF08\u7A7A\uFF09"}\uFF08YYYY-MM-DD\uFF09` };
      const ev = {
        occKey: `${type}|${loanId}|${date}`,
        type,
        loanId,
        date,
        at: Math.round(+(src.at != null ? src.at : prevEv && prevEv.at) || Date.now()),
        note: clip(src.note != null ? src.note : prevEv && prevEv.note, NOTE_CAP)
      };
      if (type === "rate") {
        const rate = Math.round((+(src.rate != null ? src.rate : prevEv && prevEv.rate) || 0) * 1e4) / 1e4;
        if (!Number.isFinite(rate) || rate < 1e-4 || rate > 36) return { error: "\u65B0\u5229\u7387\u4E0D\u5408\u6CD5\uFF080.0001% ~ 36%\uFF09" };
        ev.rate = rate;
      } else if (type === "prepay") {
        const amount = Math.round((+(src.amount != null ? src.amount : prevEv && prevEv.amount) || 0) * 100) / 100;
        if (!Number.isFinite(amount) || amount < PREPAY_MIN) return { error: `\u63D0\u524D\u8FD8\u6B3E\u91D1\u989D\u4E0D\u5408\u6CD5\uFF08\u2265 ${PREPAY_MIN} \u5143\uFF09` };
        const mode = ["term", "payment"].includes(src.mode) ? src.mode : ["term", "payment"].includes(prevEv && prevEv.mode) ? prevEv.mode : null;
        if (!mode) return { error: "\u63D0\u524D\u8FD8\u6B3E\u5FC5\u987B\u9009 mode\uFF1Aterm(\u7F29\u671F)/payment(\u51CF\u6708\u4F9B)" };
        ev.amount = amount;
        ev.mode = mode;
      } else {
        const amount = Math.round((+(src.amount != null ? src.amount : prevEv && prevEv.amount) || 0) * 100) / 100;
        if (!Number.isFinite(amount) || amount < 0) return { error: "\u5BF9\u8D26\u91D1\u989D\uFF08\u94F6\u884C\u53E3\u5F84\u5269\u4F59\u672C\u91D1\uFF09\u4E0D\u5408\u6CD5" };
        ev.amount = amount;
      }
      return { ev };
    }
    function normalizeSettings2(raw) {
      const s = raw && typeof raw === "object" ? raw : {};
      const num = (v, dflt, lo, hi) => {
        const n = Math.round(+v);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
      };
      return {
        warnDays: num(s.warnDays, 3, 0, 30),
        repricingWarnDays: num(s.repricingWarnDays, 30, 1, 365),
        driftWarn: num(s.driftWarn, 100, 1, 1e6)
      };
    }
    function monthlyRate(annualRatePct) {
      return annualRatePct / 100 / 12;
    }
    function annuityPmt(P, annualRatePct, n) {
      const r = monthlyRate(annualRatePct);
      if (r <= 0) return round2(P / n);
      const f = Math.pow(1 + r, n);
      return round2(P * r * f / (f - 1));
    }
    function solvedN(bal, pmt, annualRatePct) {
      if (!(pmt > 0) || !(bal > 0)) return null;
      const r = monthlyRate(annualRatePct);
      if (r <= 0) return Math.max(1, Math.ceil((bal - EPS_BAL) / pmt));
      if (pmt <= bal * r) return null;
      const n = Math.log(pmt / (pmt - bal * r)) / Math.log(1 + r);
      return Math.max(1, Math.ceil(n - 1e-9));
    }
    function cmpEvent(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const w = { rate: 0, prepay: 1, checkpoint: 2 };
      return (w[a.type] ?? 9) - (w[b.type] ?? 9);
    }
    function simulate(loan, events, extra) {
      const start = parseDayKey(loan.startDate);
      const list = [].concat(Array.isArray(events) ? events : [], extra ? [extra] : []).filter((e) => e && (e.type === "rate" || e.type === "prepay")).sort(cmpEvent);
      const r0 = monthlyRate(loan.annualRate);
      let bal = round2(loan.principal);
      let curRate = loan.annualRate;
      let termEnd = loan.termMonths;
      let plan = "payment";
      let pmt = annuityPmt(loan.principal, loan.annualRate, loan.termMonths);
      let princM = round2(loan.principal / loan.termMonths);
      const periods = [];
      let truncated = false;
      if (!start) return { periods, plan, truncated: true };
      let ei = 0;
      const rederive = (k) => {
        const remain = termEnd - k + 1;
        if (remain <= 0) return;
        if (loan.method === "annuity") {
          if (plan === "payment") {
            pmt = annuityPmt(bal, curRate, remain);
          } else {
            const n2 = solvedN(bal, pmt, curRate);
            if (n2 == null) {
              plan = "payment";
              pmt = annuityPmt(bal, curRate, remain);
            } else termEnd = k + n2 - 1;
          }
        } else if (loan.method === "linear") {
          if (plan === "payment") princM = round2(bal / remain);
        }
      };
      for (let k = 1; k <= MAX_WALK; k++) {
        const date = addMonths(loan.startDate, k - 1);
        const opening = bal;
        let prepayNote = 0;
        while (ei < list.length && list[ei].date <= date) {
          const ev = list[ei];
          if (ev.type === "rate") {
            curRate = ev.rate;
            rederive(k);
          } else {
            const effBal = bal;
            if (ev.amount < effBal - EPS_BAL) {
              bal = round2(effBal - ev.amount);
              plan = ev.mode;
              if (loan.method === "annuity") {
                if (plan === "payment") pmt = annuityPmt(bal, curRate, termEnd - k + 1);
                else {
                  const n2 = solvedN(bal, pmt, curRate);
                  if (n2 == null) {
                    plan = "payment";
                    pmt = annuityPmt(bal, curRate, termEnd - k + 1);
                  } else termEnd = k + n2 - 1;
                }
              } else if (loan.method === "linear") {
                if (plan === "payment") princM = round2(bal / (termEnd - k + 1));
                else termEnd = k + Math.max(1, Math.ceil((bal - EPS_BAL) / princM)) - 1;
              }
              prepayNote = ev.amount;
            }
          }
          ei++;
        }
        if (k > termEnd && bal > EPS_BAL) {
          termEnd = k;
        }
        const r = monthlyRate(curRate);
        const interest = round2(bal * r);
        let principal = 0;
        let payment = 0;
        if (loan.method === "annuity") {
          if (k >= termEnd) principal = bal;
          else principal = Math.min(round2(pmt - interest), bal);
          payment = round2(principal + interest);
        } else if (loan.method === "linear") {
          if (k >= termEnd) principal = bal;
          else principal = Math.min(princM, bal);
          payment = round2(principal + interest);
        } else {
          principal = k >= termEnd ? bal : 0;
          payment = round2(principal + interest);
        }
        bal = round2(bal - principal);
        if (bal < EPS_BAL) bal = 0;
        periods.push({
          k,
          date,
          opening,
          interest,
          principal,
          payment,
          closing: bal,
          rate: curRate,
          prepay: prepayNote || void 0
        });
        if (bal <= 0 && principal > 0) break;
        if (k === MAX_WALK) truncated = true;
      }
      return { periods, plan, truncated };
    }
    function balanceAt(sim, dateStr) {
      const t = parseDayKey(dateStr);
      if (t == null) return null;
      let bal = null;
      for (const p of sim.periods) {
        const pd = parseDayKey(p.date);
        if (pd != null && pd <= t) bal = p.closing;
        else break;
      }
      return bal;
    }
    function validatePrepay2(loan, events, { date, amount }) {
      const sim = simulate(loan, events);
      if (!sim.periods.length) return { error: "\u8FD8\u6B3E\u8868\u65E0\u6CD5\u751F\u6210\uFF08\u8BF7\u68C0\u67E5\u8D37\u6B3E\u53C2\u6570\uFF09" };
      if (parseDayKey(date) == null) return { error: `\u65E5\u671F\u4E0D\u5408\u6CD5\uFF1A${date}\uFF08YYYY-MM-DD\uFF09` };
      if (date < loan.startDate) return { error: `\u63D0\u524D\u8FD8\u6B3E\u65E5\u671F\u65E9\u4E8E\u9996\u671F\u8FD8\u6B3E\u65E5\uFF08${loan.startDate}\uFF09` };
      const last = sim.periods[sim.periods.length - 1];
      if (date > last.date) return { error: `\u8D37\u6B3E\u5DF2\u8FD8\u6E05\u6216\u8D85\u51FA\u8FD8\u6B3E\u671F\uFF08\u672B\u671F\u4E3A ${last.date}\uFF09` };
      const eff = sim.periods.find((p) => p.date >= date);
      if (!eff) return { error: "\u627E\u4E0D\u5230\u751F\u6548\u8FD8\u6B3E\u671F" };
      if (!(amount >= PREPAY_MIN)) return { error: `\u91D1\u989D\u81F3\u5C11 ${PREPAY_MIN} \u5143` };
      const avail = round2(eff.opening - EPS_BAL);
      if (amount > avail) {
        return { error: `\u91D1\u989D\u8D85\u8FC7\u8BE5\u671F\u671F\u521D\u4F59\u989D\uFF08\u751F\u6548\u671F ${eff.date}\uFF0C\u4F59\u989D ${fmtMoney4(avail)}\uFF09\u3002\u5168\u989D\u7ED3\u6E05\u8BF7\u5728\u8D37\u6B3E\u8BE6\u60C5\u91CC\u505C\u7528\u5E76\u5907\u6CE8\u3002` };
      }
      return { ok: true, effectiveDate: eff.date, balanceAtEff: eff.opening };
    }
    function whatifPrepay2(loan, events, { date, amount }) {
      const v = validatePrepay2(loan, events, { date, amount });
      if (v.error) return { error: v.error };
      const effDate = v.effectiveDate;
      const slice = (sim) => {
        const ps = sim.periods.filter((p) => p.date >= effDate);
        const ri = round2(ps.reduce((s, p) => s + p.interest, 0));
        return {
          remainingInterest: ri,
          remainingMonths: ps.length,
          endDate: ps.length ? ps[ps.length - 1].date : null,
          nextPayment: ps.length ? round2(ps[0].payment) : 0
        };
      };
      const base = slice(simulate(loan, events));
      const termSim = simulate(loan, events, { type: "prepay", loanId: loan.id, date: effDate, amount, mode: "term", at: 0, note: "" });
      const paySim = simulate(loan, events, { type: "prepay", loanId: loan.id, date: effDate, amount, mode: "payment", at: 0, note: "" });
      const term = slice(termSim);
      const payment = slice(paySim);
      const isBullet = loan.method === "bullet";
      return {
        effectiveDate: effDate,
        balanceAtEff: round2(v.balanceAtEff),
        method: loan.method,
        bulletNote: isBullet ? "\u5148\u606F\u540E\u672C\uFF1A\u63D0\u524D\u8FD8\u6B3E\u53EA\u51CF\u5C11\u6BCF\u6708\u5229\u606F\uFF0C\u5230\u671F\u65E5\u4E0E\u5230\u671F\u8FD8\u672C\u989D\u4E0D\u53D8" : null,
        baseline: base,
        term: isBullet ? { ...term, sameAsPayment: true } : term,
        payment,
        saved: {
          term: round2(base.remainingInterest - term.remainingInterest),
          payment: round2(base.remainingInterest - payment.remainingInterest)
        }
      };
    }
    function nextRepricing(loan, events, today) {
      if (!loan.repricing || loan.repricing.cycleMonths !== 12 && loan.repricing.cycleMonths !== 6 && loan.repricing.cycleMonths !== 3) return null;
      const t = parseDayKey(today);
      if (t == null) return null;
      let anchor;
      if (loan.repricing.day === "anniversary") {
        const rateDates = (events || []).filter((e) => e.type === "rate" && e.date <= today).map((e) => e.date).sort();
        anchor = rateDates.length ? rateDates[rateDates.length - 1] : loan.startDate;
      } else {
        const mm = +loan.repricing.day.slice(0, 2);
        const dd = +loan.repricing.day.slice(3, 5);
        const ty = new Date(t).getFullYear();
        const mk = (y) => {
          const dim = daysInMonth(y, mm - 1);
          return `${y}-${String(mm).padStart(2, "0")}-${String(Math.min(dd, dim)).padStart(2, "0")}`;
        };
        for (let y = ty; y <= ty + 2; y++) {
          const cand = mk(y);
          if (cand > today) return cand;
        }
        return null;
      }
      let next = addMonths(anchor, loan.repricing.cycleMonths);
      let guard = 0;
      while ((next == null || next <= today) && guard++ < 200) next = addMonths(next || anchor, loan.repricing.cycleMonths);
      return next;
    }
    function loanState2(loan, events, now) {
      const today = dayKey(now);
      const sim = simulate(loan, events);
      const ps = sim.periods;
      const past = ps.filter((p) => p.date <= today);
      const future = ps.filter((p) => p.date > today);
      const sum = (arr, f) => round2(arr.reduce((s, p) => s + f(p), 0));
      const prepays = (events || []).filter((e) => e.type === "prepay" && e.date <= today && e.date >= loan.startDate);
      const paidPrepay = sum(prepays, (e) => e.amount);
      const thisYear = today.slice(0, 4);
      const cps = (events || []).filter((e) => e.type === "checkpoint").map((e) => {
        const book = balanceAt(sim, e.date);
        return book == null ? null : {
          date: e.date,
          bank: round2(e.amount),
          book,
          drift: round2(e.amount - book),
          note: e.note || ""
        };
      }).filter(Boolean).sort((a, b) => a.date < b.date ? -1 : 1);
      const curRate = future.length ? future[0].rate : ps.length ? ps[ps.length - 1].rate : loan.annualRate;
      return {
        today,
        loanId: loan.id,
        active: loan.active !== false,
        monthsPaid: past.length,
        totalMonths: ps.length,
        nextPaymentDate: future.length ? future[0].date : null,
        nextPaymentAmount: future.length ? future[0].payment : null,
        currentRate: curRate,
        remainingPrincipal: past.length ? past[past.length - 1].closing : loan.principal,
        remainingInterest: sum(future, (p) => p.interest),
        paidInterest: sum(past, (p) => p.interest),
        paidPrincipal: round2(loan.principal - (past.length ? past[past.length - 1].closing : loan.principal)),
        paidPrepay,
        paidThisYearInterest: sum(past.filter((p) => p.date.startsWith(thisYear)), (p) => p.interest),
        endDate: ps.length ? ps[ps.length - 1].date : null,
        settled: ps.length > 0 && ps[ps.length - 1].date <= today,
        truncated: sim.truncated,
        nextRepricingDate: nextRepricing(loan, events, today),
        checkpoints: cps
      };
    }
    function yearlyBreakdown2(loan, events) {
      const sim = simulate(loan, events);
      const map = /* @__PURE__ */ new Map();
      for (const p of sim.periods) {
        const y = p.date.slice(0, 4);
        let row = map.get(y);
        if (!row) {
          row = { year: y, interest: 0, principal: 0, prepay: 0, paid: 0 };
          map.set(y, row);
        }
        row.interest = round2(row.interest + p.interest);
        row.principal = round2(row.principal + p.principal);
        row.paid = round2(row.paid + p.payment);
        if (p.prepay) {
          row.prepay = round2(row.prepay + p.prepay);
          row.paid = round2(row.paid + p.prepay);
        }
      }
      return [...map.values()].sort((a, b) => a.year < b.year ? -1 : 1);
    }
    function describeLoan(loan) {
      return `${loan.name}\uFF08${KIND_NAMES[loan.kind] || loan.kind}\xB7${METHOD_NAMES2[loan.method] || loan.method}\uFF09 \u672C\u91D1 ${fmtMoney4(loan.principal)} @ ${fmtPct5(loan.annualRate)} / ${loan.termMonths} \u671F\uFF0C\u9996\u671F ${loan.startDate}${loan.lender ? `\uFF0C${loan.lender}` : ""}${loan.groupId ? `\uFF0C\u7EC4\u300C${loan.groupId}\u300D` : ""}${loan.repricing ? `\uFF0C\u91CD\u5B9A\u4EF7 ${loan.repricing.day === "anniversary" ? "\u653E\u6B3E\u5BF9\u65E5" : "\u6BCF\u5E74 " + loan.repricing.day}/${loan.repricing.cycleMonths} \u4E2A\u6708` : ""}${loan.active === false ? "\uFF0C\u3010\u5DF2\u7ED3\u6E05/\u505C\u7528\u3011" : ""}`;
    }
    function familyTotals2(states) {
      const live = states.filter((s) => s && s.active !== false && !s.settled);
      const r2 = (x) => round2(x);
      return {
        monthlyPayment: r2(live.reduce((s, x) => s + (x.nextPaymentAmount || 0), 0)),
        remainingPrincipal: r2(live.reduce((s, x) => s + x.remainingPrincipal, 0)),
        remainingInterest: r2(live.reduce((s, x) => s + x.remainingInterest, 0)),
        paidThisYearInterest: r2(states.reduce((s, x) => s + x.paidThisYearInterest, 0)),
        loanCount: live.length,
        settledCount: states.length - live.length
      };
    }
    module.exports = {
      // 常量
      DAY_MS,
      METHODS,
      METHOD_NAMES: METHOD_NAMES2,
      KINDS,
      KIND_NAMES,
      EVENT_TYPES,
      CYCLES,
      MAX_TERM_MONTHS,
      PREPAY_MIN,
      // 小件
      clip,
      idFor,
      randTag,
      round2,
      dayKey,
      parseDayKey,
      dayDiff: dayDiff2,
      addMonths,
      fmtMoney: fmtMoney4,
      fmtPct: fmtPct5,
      monthlyRate,
      annuityPmt,
      solvedN,
      // 规范化
      normalizeLoan: normalizeLoan2,
      normalizeEvent: normalizeEvent2,
      normalizeSettings: normalizeSettings2,
      // 引擎
      simulate,
      balanceAt,
      validatePrepay: validatePrepay2,
      whatifPrepay: whatifPrepay2,
      nextRepricing,
      loanState: loanState2,
      yearlyBreakdown: yearlyBreakdown2,
      describeLoan,
      familyTotals: familyTotals2
    };
  }
});

// src/host.ts
var host_exports = {};
__export(host_exports, {
  capDispatch: () => capDispatch,
  getHostInvoke: () => getHostInvoke,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet
});
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
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useMemo, useRef as useRef2, useState as useState4 } from "react";

// src/model.ts
var core = __toESM(require_core());
init_host();
var PREFIX = "quanfu.";
var K = {
  loan: (id) => `${PREFIX}loan.${id}`,
  loanPrefix: `${PREFIX}loan.`,
  ev: (occKey) => `${PREFIX}ev.${occKey}`,
  evPrefix: `${PREFIX}ev.`,
  settings: `${PREFIX}settings`
};
function newCache() {
  return { knownKeys: null, fullAt: 0, vals: /* @__PURE__ */ new Map() };
}
var FULL_REFRESH_MS = 90 * 1e3;
var ENTITY_PREFIXES = [K.loanPrefix, K.evPrefix];
async function loadQuan(cache) {
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
  const loans = collect(K.loanPrefix).filter((v) => v && typeof v.id === "string").sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  const events = collect(K.evPrefix).filter((v) => v && typeof v.occKey === "string");
  const settingsRaw = await kvGet(K.settings).catch(() => null);
  return { loans, events, settings: core.normalizeSettings(settingsRaw) };
}
function stateOf(data, loan, now) {
  return core.loanState(loan, eventsOf(data, loan.id), now);
}
function eventsOf(data, loanId) {
  return data.events.filter((e) => e.loanId === loanId).sort((a, b) => a.date < b.date ? -1 : 1);
}
async function saveLoan(input, existing) {
  const r = core.normalizeLoan(input, existing);
  if (r.error || !r.loan) throw new Error(r.error || "\u53C2\u6570\u4E0D\u5408\u6CD5");
  await kvSet(K.loan(r.loan.id), r.loan);
  return r.loan;
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
async function deleteLoan(id, data) {
  const evKeys = data.events.filter((e) => e.loanId === id).map((e) => K.ev(e.occKey));
  for (const k of evKeys) await kvDel(k);
  await kvDel(K.loan(id));
  return evKeys.length;
}
async function deleteEvent(occKey) {
  await kvDel(K.ev(occKey));
}
function exportAll(data) {
  return JSON.stringify({
    kind: "quanfu-export",
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    loans: data.loans,
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
  if (!p || p.kind !== "quanfu-export" || !Array.isArray(p.loans) || !Array.isArray(p.events)) {
    throw new Error("\u4E0D\u662F\u6CC9\u5E9C\u5BFC\u51FA\u6587\u4EF6\uFF08\u7F3A kind: quanfu-export\uFF09");
  }
  let nLoan = 0;
  let nEv = 0;
  for (const raw of p.loans) {
    const r = core.normalizeLoan(raw, null);
    if (r.error || !r.loan) continue;
    await kvSet(K.loan(r.loan.id), r.loan);
    nLoan++;
  }
  for (const raw of p.events) {
    const r = core.normalizeEvent(raw, null);
    if (r.error || !r.ev) continue;
    await kvSet(K.ev(r.ev.occKey), r.ev);
    nEv++;
  }
  if (p.settings && typeof p.settings === "object") await kvSet(K.settings, core.normalizeSettings(p.settings));
  return { loans: nLoan, events: nEv };
}

// src/OverviewTab.tsx
var core3 = __toESM(require_core());

// src/ui.tsx
var core2 = __toESM(require_core());
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var METHOD_CN = { annuity: "\u7B49\u989D\u672C\u606F", linear: "\u7B49\u989D\u672C\u91D1", bullet: "\u5148\u606F\u540E\u672C" };
var KIND_CN = {
  mortgage: "\u623F\u8D37",
  car: "\u8F66\u8D37",
  consumer: "\u6D88\u8D39\u8D37",
  business: "\u7ECF\u8425\u8D37",
  other: "\u5176\u4ED6"
};
function fmtStateBadges(loan, st) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("span", { className: "qf-tag", children: KIND_CN[loan.kind] || loan.kind }),
    /* @__PURE__ */ jsxs("span", { className: "qf-tag", children: [
      METHOD_CN[loan.method] || loan.method,
      " \xB7 ",
      core2.fmtPct(st.currentRate)
    ] }),
    loan.groupId && /* @__PURE__ */ jsx("span", { className: "qf-tag blue", children: "\u7EC4\u5408" }),
    !loan.active && /* @__PURE__ */ jsx("span", { className: "qf-tag", children: "\u5DF2\u505C\u7528" }),
    st.settled && loan.active !== false && /* @__PURE__ */ jsx("span", { className: "qf-tag green", children: "\u5DF2\u7ED3\u6E05" })
  ] });
}

// src/OverviewTab.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function dayDiff(a, b) {
  const ta = (/* @__PURE__ */ new Date(a + "T00:00:00")).getTime();
  const tb = (/* @__PURE__ */ new Date(b + "T00:00:00")).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 864e5);
}
function OverviewTab({ data, states, onSendToChat }) {
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "qf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  if (!data.loans.length) {
    return /* @__PURE__ */ jsxs2("div", { className: "qf-empty", children: [
      "\u8FD8\u6CA1\u6709\u8D37\u6B3E\u53F0\u8D26\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\uFF1A",
      /* @__PURE__ */ jsx2("b", { children: "\u300C\u6211\u6709\u4E00\u7B14 100 \u4E07 30 \u5E74\u7B49\u989D\u672C\u606F 3.6% \u7684\u623F\u8D37\uFF0C2021 \u5E74 3 \u6708\u5F00\u59CB\u8FD8\u300D" }),
      /* @__PURE__ */ jsx2("br", {}),
      "\u4E00\u53E5\u8BDD\u5EFA\u6863\uFF1B\u6216\u5728\u300C\u8D37\u6B3E\u300DTab \u624B\u5DE5\u6DFB\u52A0\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      /* @__PURE__ */ jsx2("span", { style: { fontSize: 11 }, children: "\u5EFA\u5B8C\u6863\u5EFA\u8BAE\u7528\u94F6\u884C App \u7684\u5B9E\u9645\u5269\u4F59\u672C\u91D1\u5BF9\u4E00\u6B21\u8D26\u3002" })
    ] });
  }
  const liveStates = states.filter((s, i) => data.loans[i].active !== false && !s.settled);
  const totals = core3.familyTotals(states);
  const today = states[0]?.today || "";
  const alerts = [];
  states.forEach((st, i) => {
    const loan = data.loans[i];
    if (!loan.active || st.settled) return;
    if (st.nextPaymentDate) {
      const d = dayDiff(today, st.nextPaymentDate);
      if (d != null && d >= 0 && d <= data.settings.warnDays) {
        alerts.push(`\u{1F4C5} ${loan.name} \u5C06\u4E8E ${st.nextPaymentDate}\uFF08${d === 0 ? "\u4ECA\u5929" : `${d} \u5929\u540E`}\uFF09\u6263\u6B3E ${core3.fmtMoney(st.nextPaymentAmount)}`);
      }
    }
    if (st.nextRepricingDate) {
      const d = dayDiff(today, st.nextRepricingDate);
      if (d != null && d >= 0 && d <= data.settings.repricingWarnDays) {
        alerts.push(`\u{1F501} ${loan.name} \u5C06\u4E8E ${st.nextRepricingDate} \u91CD\u5B9A\u4EF7\u2014\u2014\u5230\u65F6\u628A\u65B0\u5229\u7387\u544A\u8BC9 AI \u6216\u5728\u8D37\u6B3E\u9875\u8BB0\u5F55`);
      }
    }
    const cp = st.checkpoints[st.checkpoints.length - 1];
    if (cp && Math.abs(cp.drift) > data.settings.driftWarn) {
      alerts.push(`\u2696 ${loan.name} \u5BF9\u8D26\u6F02\u79FB ${core3.fmtMoney(cp.drift)}\uFF08${cp.date} \u94F6\u884C ${core3.fmtMoney(cp.bank)} vs \u8D26\u9762 ${core3.fmtMoney(cp.book)}\uFF09\u2014\u2014\u53EF\u80FD\u6F0F\u8BB0\u5229\u7387\u53D8\u66F4/\u63D0\u524D\u8FD8\u6B3E`);
    }
    if (st.truncated) alerts.push(`\u26A0 ${loan.name} \u8FD8\u6B3E\u8868\u5F02\u5E38\uFF08\u53C2\u6570\u77DB\u76FE\uFF09\uFF0C\u8BF7\u68C0\u67E5\u671F\u6570/\u6708\u4F9B\u53EF\u884C\u6027`);
  });
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { className: "qf-card", children: /* @__PURE__ */ jsxs2("div", { className: "qf-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "qf-row", style: { marginBottom: 4 }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "qf-grow qf-sub", children: [
          "\u5BB6\u5EAD\u8D37\u6B3E\u5408\u8BA1\uFF08",
          totals.loanCount,
          " \u7B14\u5728\u8FD8",
          totals.settledCount ? `\uFF0C${totals.settledCount} \u7B14\u5DF2\u7ED3\u6E05/\u505C\u7528` : "",
          "\uFF09"
        ] }),
        onSendToChat && /* @__PURE__ */ jsx2(
          "button",
          {
            className: "qf-btn ghost sm",
            onClick: () => onSendToChat(`\u5E2E\u6211\u770B\u770B\u8D37\u6B3E\u53F0\u8D26\uFF1A\u73B0\u5728\u5BB6\u5EAD\u6708\u4F9B\u3001\u5269\u4F59\u672C\u91D1\u548C\u5269\u4F59\u5229\u606F\u662F\u4EC0\u4E48\u60C5\u51B5\uFF1F\uFF08\u6CC9\u5E9C\uFF09`),
            children: "\u95EE AI"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
        /* @__PURE__ */ jsx2("span", { children: "\u6708\u4F9B\u5408\u8BA1" }),
        /* @__PURE__ */ jsx2("span", { className: "qf-num", style: { fontWeight: 700 }, children: core3.fmtMoney(totals.monthlyPayment) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
        /* @__PURE__ */ jsx2("span", { children: "\u5269\u4F59\u672C\u91D1" }),
        /* @__PURE__ */ jsx2("span", { className: "qf-num", children: core3.fmtMoney(totals.remainingPrincipal) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
        /* @__PURE__ */ jsx2("span", { children: "\u5269\u4F59\u603B\u5229\u606F\uFF08\u6309\u5F53\u524D\u8BA1\u5212\uFF09" }),
        /* @__PURE__ */ jsx2("span", { className: "qf-num", children: core3.fmtMoney(totals.remainingInterest) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
        /* @__PURE__ */ jsx2("span", { children: "\u4ECA\u5E74\u5DF2\u4ED8\u5229\u606F" }),
        /* @__PURE__ */ jsx2("span", { className: "qf-num", children: core3.fmtMoney(totals.paidThisYearInterest) })
      ] })
    ] }) }),
    alerts.length > 0 && /* @__PURE__ */ jsx2("div", { className: "qf-alert", children: alerts.map((a, i) => /* @__PURE__ */ jsx2("div", { children: a }, i)) }),
    data.loans.map((loan, i) => {
      const st = states[i];
      const inactive = loan.active === false;
      const progress = st.totalMonths > 0 ? Math.min(100, Math.round(st.monthsPaid / st.totalMonths * 100)) : 0;
      const nextDueDays = st.nextPaymentDate ? dayDiff(today, st.nextPaymentDate) : null;
      const rpDays = st.nextRepricingDate ? dayDiff(today, st.nextRepricingDate) : null;
      const cp = st.checkpoints[st.checkpoints.length - 1];
      return /* @__PURE__ */ jsx2("div", { className: "qf-card", children: /* @__PURE__ */ jsxs2("div", { className: "qf-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "qf-row", style: { marginBottom: 6 }, children: [
          /* @__PURE__ */ jsx2("b", { style: { fontSize: 13 }, children: loan.name }),
          fmtStateBadges(loan, st),
          /* @__PURE__ */ jsx2("span", { className: "qf-grow" }),
          nextDueDays != null && nextDueDays >= 0 && nextDueDays <= data.settings.warnDays && /* @__PURE__ */ jsx2("span", { className: "qf-tag yellow", children: nextDueDays === 0 ? "\u4ECA\u5929\u6263\u6B3E" : `${nextDueDays} \u5929\u540E\u6263\u6B3E` })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "qf-prog", style: { marginBottom: 3 }, children: /* @__PURE__ */ jsx2("i", { style: { width: `${progress}%` } }) }),
        /* @__PURE__ */ jsx2("div", { className: "qf-sub", style: { marginBottom: 6 }, children: st.settled ? `\u5DF2\u6309\u8BA1\u5212\u7ED3\u6E05\uFF08\u672B\u671F ${st.endDate}\uFF09` : `\u5DF2\u8FD8 ${st.monthsPaid}/${st.totalMonths} \u671F \xB7 ${progress}%${loan.groupId ? ` \xB7 \u7EC4\u300C${loan.groupId}\u300D` : ""}` }),
        !st.settled && /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
            /* @__PURE__ */ jsx2("span", { children: "\u4E0B\u671F\u6263\u6B3E" }),
            /* @__PURE__ */ jsxs2("span", { className: "qf-num", children: [
              st.nextPaymentDate,
              " \xB7 ",
              /* @__PURE__ */ jsx2("b", { children: core3.fmtMoney(st.nextPaymentAmount) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
            /* @__PURE__ */ jsx2("span", { children: "\u5269\u4F59\u672C\u91D1" }),
            /* @__PURE__ */ jsx2("span", { className: "qf-num", children: core3.fmtMoney(st.remainingPrincipal) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
            /* @__PURE__ */ jsx2("span", { children: "\u5F53\u524D\u5229\u7387" }),
            /* @__PURE__ */ jsxs2("span", { className: "qf-num", children: [
              core3.fmtPct(st.currentRate),
              loan.method === "annuity" ? "" : "",
              " \xB7 \u5269\u4F59\u603B\u5229\u606F ",
              core3.fmtMoney(st.remainingInterest)
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
            /* @__PURE__ */ jsx2("span", { children: "\u8BA1\u5212\u7ED3\u6E05" }),
            /* @__PURE__ */ jsxs2("span", { className: "qf-num", children: [
              st.endDate,
              st.paidThisYearInterest > 0 ? ` \xB7 \u4ECA\u5E74\u5DF2\u4ED8\u606F ${core3.fmtMoney(st.paidThisYearInterest)}` : ""
            ] })
          ] })
        ] }),
        rpDays != null && /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
          /* @__PURE__ */ jsx2("span", { children: "\u4E0B\u6B21\u91CD\u5B9A\u4EF7" }),
          /* @__PURE__ */ jsxs2("span", { className: "qf-num", children: [
            st.nextRepricingDate,
            rpDays >= 0 && rpDays <= data.settings.repricingWarnDays && /* @__PURE__ */ jsx2("span", { className: "qf-tag yellow", style: { marginLeft: 6 }, children: rpDays === 0 ? "\u5C31\u662F\u4ECA\u5929" : `${rpDays} \u5929\u540E` })
          ] })
        ] }),
        cp && /* @__PURE__ */ jsxs2("div", { className: "qf-kv", children: [
          /* @__PURE__ */ jsxs2("span", { children: [
            "\u6700\u8FD1\u5BF9\u8D26\uFF08",
            cp.date,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsxs2("span", { className: "qf-num", children: [
            "\u94F6\u884C ",
            core3.fmtMoney(cp.bank),
            " \xB7 \u5DEE ",
            /* @__PURE__ */ jsx2("span", { style: { color: Math.abs(cp.drift) > data.settings.driftWarn ? "#F85149" : "#3FB950" }, children: core3.fmtMoney(cp.drift) })
          ] })
        ] }),
        inactive && /* @__PURE__ */ jsx2("div", { className: "qf-sub", style: { marginTop: 6 }, children: "\u5DF2\u505C\u7528/\u7ED3\u6E05\uFF1A\u4E0D\u8BA1\u5165\u5408\u8BA1\u4E0E\u63D0\u9192\uFF0C\u5386\u53F2\u4FDD\u7559\uFF08\u8D37\u6B3E Tab \u53EF\u6062\u590D\uFF09\u3002" })
      ] }) }, loan.id);
    }),
    liveStates.length === 0 && /* @__PURE__ */ jsx2("div", { className: "qf-empty", children: "\u5168\u90E8\u8D37\u6B3E\u5DF2\u7ED3\u6E05\u6216\u505C\u7528\u3002\u{1F389}" })
  ] });
}

// src/WhatifTab.tsx
var core4 = __toESM(require_core());
import { useState } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function WhatifTab({ data, states, showToast }) {
  const [loanIdx, setLoanIdx] = useState(0);
  const [amount, setAmount] = useState("20");
  const [unit, setUnit] = useState("wan");
  const [date, setDate] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "qf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const allLoans = data.loans;
  const activeLoans = allLoans.filter((l, i) => l.active !== false && !states[i].settled);
  if (!activeLoans.length) {
    return /* @__PURE__ */ jsx3("div", { className: "qf-empty", children: "\u6CA1\u6709\u5728\u8FD8\u7684\u8D37\u6B3E\u53EF\u6D4B\u7B97\u2014\u2014\u5148\u5728\u300C\u8D37\u6B3E\u300DTab \u6DFB\u52A0\u3002" });
  }
  const loan = activeLoans[Math.min(loanIdx, activeLoans.length - 1)];
  const st = states[data.loans.indexOf(loan)];
  const run = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      showToast("\u8BF7\u8F93\u5165\u91D1\u989D", true);
      return;
    }
    const amt = unit === "wan" ? Math.round(n * 1e4 * 100) / 100 : Math.round(n * 100) / 100;
    setBusy(true);
    try {
      const w0 = core4.whatifPrepay(loan, eventsOf(data, loan.id), { date: date || st.today, amount: amt });
      if ("error" in w0) {
        showToast(w0.error, true);
        setResult(null);
        return;
      }
      setResult({ w: w0, amount: amt });
    } finally {
      setBusy(false);
    }
  };
  const col = (label, s, saved, hl) => /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 0, background: hl ? "#1C2330" : "#12151c", border: `1px solid ${hl ? "#5a4a1e" : "#2a2f3a"}`, borderRadius: 10, padding: "9px 10px" }, children: [
    /* @__PURE__ */ jsx3("div", { style: { fontSize: 11.5, fontWeight: 700, marginBottom: 4 }, children: label }),
    /* @__PURE__ */ jsx3("div", { className: "qf-num", style: { fontSize: 15, fontWeight: 700, color: "#E3B341" }, children: core4.fmtMoney(s.remainingInterest) }),
    /* @__PURE__ */ jsx3("div", { className: "qf-sub", children: "\u5269\u4F59\u603B\u5229\u606F" }),
    saved != null && saved > 0 && /* @__PURE__ */ jsxs3("div", { className: "qf-num", style: { fontSize: 11.5, color: "#3FB950", marginTop: 3 }, children: [
      "\u7701 ",
      core4.fmtMoney(saved)
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "qf-sub", style: { marginTop: 5 }, children: [
      s.remainingMonths,
      " \u671F \xB7 \u7ED3\u6E05 ",
      s.endDate || "\u2014",
      /* @__PURE__ */ jsx3("br", {}),
      label !== "\u4E0D\u63D0\u524D\u8FD8" ? `\u4E0B\u671F\u6708\u4F9B ${core4.fmtMoney(s.nextPayment)}` : `\u6708\u4F9B ${core4.fmtMoney(s.nextPayment)}`
    ] })
  ] });
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "qf-card", children: /* @__PURE__ */ jsxs3("div", { className: "qf-card-b", children: [
      /* @__PURE__ */ jsx3("label", { className: "qf-lbl", style: { marginTop: 0 }, children: "\u5BF9\u54EA\u7B14\u8D37\u6B3E\u6D4B\u7B97" }),
      /* @__PURE__ */ jsx3("select", { className: "qf-sel", value: Math.min(loanIdx, activeLoans.length - 1), onChange: (e) => {
        setLoanIdx(+e.target.value);
        setResult(null);
      }, children: activeLoans.map((l, i) => /* @__PURE__ */ jsxs3("option", { value: i, children: [
        l.name,
        "\uFF08\u5269 ",
        core4.fmtMoney(states[data.loans.indexOf(l)].remainingPrincipal),
        "\uFF09"
      ] }, l.id)) }),
      /* @__PURE__ */ jsx3("label", { className: "qf-lbl", children: "\u63D0\u524D\u8FD8\u6B3E\u91D1\u989D" }),
      /* @__PURE__ */ jsxs3("div", { className: "qf-row", children: [
        /* @__PURE__ */ jsx3("input", { className: "qf-inp qf-grow", inputMode: "decimal", value: amount, onChange: (e) => setAmount(e.target.value), placeholder: "20" }),
        /* @__PURE__ */ jsx3("button", { className: `qf-btn sm ${unit === "wan" ? "gold" : "ghost"}`, onClick: () => setUnit("wan"), children: "\u4E07" }),
        /* @__PURE__ */ jsx3("button", { className: `qf-btn sm ${unit === "yuan" ? "gold" : "ghost"}`, onClick: () => setUnit("yuan"), children: "\u5143" })
      ] }),
      /* @__PURE__ */ jsx3("label", { className: "qf-lbl", children: "\u751F\u6548\u57FA\u51C6\u65E5\uFF08\u5B9E\u9645\u5728\u5176\u540E\u7B2C\u4E00\u4E2A\u6263\u6B3E\u65E5\u751F\u6548\uFF09" }),
      /* @__PURE__ */ jsx3("input", { className: "qf-inp", type: "date", value: date, onChange: (e) => setDate(e.target.value), placeholder: st.today }),
      /* @__PURE__ */ jsx3("div", { className: "qf-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx3("button", { className: "qf-btn gold qf-grow", disabled: busy, onClick: run, children: "\u5BF9\u6BD4\uFF1A\u4E0D\u8FD8 / \u7F29\u671F / \u51CF\u6708\u4F9B" }) }),
      /* @__PURE__ */ jsxs3("div", { className: "qf-sub", style: { marginTop: 6 }, children: [
        "\u5F53\u524D\u5229\u7387 ",
        core4.fmtPct(st.currentRate),
        " \xB7 \u4F59\u989D ",
        core4.fmtMoney(st.remainingPrincipal),
        " \xB7 \u4E0B\u671F ",
        core4.fmtMoney(st.nextPaymentAmount),
        "\uFF08",
        st.nextPaymentDate,
        "\uFF09"
      ] })
    ] }) }),
    result && /* @__PURE__ */ jsx3("div", { className: "qf-card", children: /* @__PURE__ */ jsxs3("div", { className: "qf-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "qf-sub", style: { marginBottom: 8 }, children: [
        "\u751F\u6548\u671F ",
        result.w.effectiveDate,
        "\uFF08\u671F\u521D\u4F59\u989D ",
        core4.fmtMoney(result.w.balanceAtEff),
        "\uFF0C\u63D0\u524D\u8FD8\u6B3E ",
        core4.fmtMoney(result.amount),
        "\uFF09",
        result.w.bulletNote && /* @__PURE__ */ jsxs3(Fragment3, { children: [
          /* @__PURE__ */ jsx3("br", {}),
          "\u26A0 ",
          result.w.bulletNote
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "qf-row", style: { alignItems: "stretch", gap: 8 }, children: [
        col("\u4E0D\u63D0\u524D\u8FD8", result.w.baseline, null, false),
        col("\u7F29\u671F\uFF08\u6708\u4F9B\u57FA\u672C\u4E0D\u53D8\uFF09", result.w.term, result.w.saved.term, result.w.saved.term >= result.w.saved.payment),
        col("\u51CF\u6708\u4F9B\uFF08\u671F\u9650\u4E0D\u53D8\uFF09", result.w.payment, result.w.saved.payment, result.w.saved.payment > result.w.saved.term)
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "qf-sub", style: { marginTop: 8 }, children: [
        "\u4E8B\u5B9E\u5BF9\u6BD4\uFF1A\u540C\u6837\u4E00\u7B14\u94B1\uFF0C\u7F29\u671F\u901A\u5E38\u7701\u606F\u66F4\u591A\u3001\u51CF\u6708\u4F9B\u73B0\u91D1\u6D41\u66F4\u677E\u2014\u2014\u9009\u54EA\u4E2A\u53D6\u51B3\u4E8E\u4F60\u7684\u73B0\u91D1\u6D41\u4E0E\u5408\u540C\u6761\u6B3E\uFF0C\u6CC9\u5E9C\u4E0D\u4EE3\u4F5C\u51B3\u5B9A\u3002 \u6EE1\u610F\u7684\u8BDD\u5728\u804A\u5929\u91CC\u8BF4\u300C\u63D0\u524D\u8FD8 ",
        unit === "wan" ? `${amount} \u4E07` : `${amount} \u5143`,
        "\u9009",
        result.w.saved.term >= result.w.saved.payment ? "\u7F29\u671F" : "\u51CF\u6708\u4F9B",
        "\u300D\uFF0CAI \u4F1A\u8BB0\u5F55\u5E76\u91CD\u653E\u8D26\u672C\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsx3("div", { className: "qf-card", children: /* @__PURE__ */ jsxs3("div", { className: "qf-card-b qf-sub", children: [
      /* @__PURE__ */ jsx3("b", { style: { color: "#E6EAF2" }, children: "\u53E3\u5F84\u8BF4\u660E" }),
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u7B49\u989D\u672C\u606F\uFF1A\u6708\u4F9B\u56FA\u5B9A\uFF0C\u5148\u606F\u540E\u672C\uFF1B\u7B49\u989D\u672C\u91D1\uFF1A\u6708\u672C\u91D1\u56FA\u5B9A\uFF1B\u5148\u606F\u540E\u672C\uFF1A\u6309\u6708\u4ED8\u606F\u3001\u5230\u671F\u8FD8\u672C\uFF08\u63D0\u524D\u8FD8\u6B3E\u53EA\u51CF\u606F\u4E0D\u7F29\u671F\uFF09\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u7F29\u671F = \u4FDD\u6301\u6708\u4F9B\u57FA\u672C\u4E0D\u53D8\u3001\u628A\u671F\u9650\u7F29\u77ED\uFF1B\u51CF\u6708\u4F9B = \u4FDD\u6301\u671F\u9650\u3001\u91CD\u7B97\u66F4\u4F4E\u7684\u6708\u4F9B\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u9010\u671F\u5206\u7EA7\u820D\u5165\u3001\u672B\u671F\u8865\u5DEE\uFF0C\u4E0E\u94F6\u884C\u5B9E\u9645\u8BA1\u606F\u53EF\u80FD\u6709\u5206\u7EA7\u51FA\u5165\uFF1B\u8FDD\u7EA6\u91D1\u6309\u5404\u884C\u5408\u540C\u53E6\u8BA1\uFF08\u53EF\u5728\u8D37\u6B3E\u5907\u6CE8\u91CC\u767B\u8BB0\uFF09\u3002"
    ] }) })
  ] });
}

// src/LoansTab.tsx
var core5 = __toESM(require_core());
import { useState as useState2 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var KIND_OPTS = Object.entries(KIND_CN);
var METHOD_OPTS = Object.entries(METHOD_CN);
function LoansTab({ data, states, reload, showToast }) {
  const [adding, setAdding] = useState2(false);
  const [editing, setEditing] = useState2(null);
  const [openId, setOpenId] = useState2(null);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "qf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const loans = data.loans;
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "qf-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qf-bar" }),
      "\u8D37\u6B3E ",
      loans.length,
      " \u7B14",
      /* @__PURE__ */ jsx4("span", { className: "qf-hint", children: "\u7EC4\u5408\u8D37\u7528\u76F8\u540C\u300C\u5F52\u7EC4\u300D\u805A\u5408\u5C55\u793A" })
    ] }),
    /* @__PURE__ */ jsx4("div", { style: { margin: "0 16px 10px" }, children: /* @__PURE__ */ jsx4("button", { className: "qf-btn gold", style: { width: "100%" }, onClick: () => {
      setAdding(!adding);
      setEditing(null);
    }, children: adding ? "\u6536\u8D77\u65B0\u5EFA\u8868\u5355" : "\uFF0B \u65B0\u5EFA\u8D37\u6B3E" }) }),
    adding && /* @__PURE__ */ jsx4(LoanForm, { onCancel: () => setAdding(false), onDone: async (msg) => {
      setAdding(false);
      await reload();
      showToast(msg);
    }, showToast }),
    !loans.length && /* @__PURE__ */ jsx4("div", { className: "qf-empty", children: "\u8FD8\u6CA1\u6709\u8D37\u6B3E\u3002\u70B9\u4E0A\u65B9\u300C\u65B0\u5EFA\u8D37\u6B3E\u300D\uFF0C\u6216\u5728\u804A\u5929\u91CC\u5BF9 AI \u4E00\u53E5\u8BDD\u8BF4\u5EFA\u3002" }),
    loans.map((loan) => {
      const st = states[loans.indexOf(loan)];
      const open = openId === loan.id;
      if (editing === loan.id) {
        return /* @__PURE__ */ jsx4(LoanForm, { existing: loan, onCancel: () => setEditing(null), onDone: async (msg) => {
          setEditing(null);
          await reload();
          showToast(msg);
        }, showToast }, loan.id);
      }
      return /* @__PURE__ */ jsxs4("div", { className: "qf-card", children: [
        /* @__PURE__ */ jsxs4("div", { className: "qf-card-b", onClick: () => setOpenId(open ? null : loan.id), style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ jsxs4("div", { className: "qf-row", children: [
            /* @__PURE__ */ jsx4("b", { style: { fontSize: 13 }, children: loan.name }),
            fmtStateBadges(loan, st),
            /* @__PURE__ */ jsx4("span", { className: "qf-grow" }),
            /* @__PURE__ */ jsx4("span", { className: "qf-num", style: { fontSize: 12.5, fontWeight: 700 }, children: core5.fmtMoney(st.remainingPrincipal) }),
            /* @__PURE__ */ jsx4("span", { style: { color: "#5C6678", fontSize: 10 }, children: open ? "\u25B2" : "\u25BC" })
          ] }),
          /* @__PURE__ */ jsx4("div", { className: "qf-sub", children: st.settled ? `\u5DF2\u6309\u8BA1\u5212\u7ED3\u6E05\uFF08${st.endDate}\uFF09` : `${core5.METHOD_NAMES[loan.method] || loan.method} ${core5.fmtPct(st.currentRate)} \xB7 \u5DF2\u8FD8 ${st.monthsPaid}/${st.totalMonths} \u671F \xB7 \u4E0B\u671F ${core5.fmtMoney(st.nextPaymentAmount)}\uFF08${st.nextPaymentDate}\uFF09` })
        ] }),
        open && /* @__PURE__ */ jsx4(LoanDetail, { loan, states, data, reload, showToast, onEdit: () => setEditing(loan.id) })
      ] }, loan.id);
    })
  ] });
}
function LoanForm({ existing, onCancel, onDone, showToast }) {
  const [f, setF] = useState2({
    name: existing?.name || "",
    kind: existing?.kind || "mortgage",
    method: existing?.method || "annuity",
    principal: existing ? String(existing.principal / 1e4) : "",
    annualRate: existing ? String(existing.annualRate) : "",
    termMonths: existing ? String(existing.termMonths) : "360",
    startDate: existing?.startDate || "",
    lender: existing?.lender || "",
    groupId: existing?.groupId || "",
    rpDay: existing?.repricing ? existing.repricing.day : "",
    rpCycle: existing?.repricing ? String(existing.repricing.cycleMonths) : "12",
    note: existing?.note || ""
  });
  const [busy, setBusy] = useState2(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      const repricing = f.rpDay ? { day: f.rpDay, cycleMonths: +f.rpCycle } : null;
      const loan = await saveLoan({
        ...existing ? { id: existing.id, createdAt: existing.createdAt, active: existing.active } : {},
        name: f.name,
        kind: f.kind,
        method: f.method,
        principalWan: f.principal,
        annualRate: +f.annualRate,
        termMonths: +f.termMonths,
        startDate: f.startDate,
        lender: f.lender,
        groupId: f.groupId,
        repricing,
        note: f.note
      }, existing || null);
      await onDone(`${existing ? "\u5DF2\u66F4\u65B0" : "\u5DF2\u65B0\u5EFA"}\u300C${loan.name}\u300D`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx4("div", { className: "qf-card", children: /* @__PURE__ */ jsxs4("div", { className: "qf-card-b", children: [
    /* @__PURE__ */ jsx4("b", { style: { fontSize: 12.5 }, children: existing ? `\u7F16\u8F91\uFF1A${existing.name}` : "\u65B0\u5EFA\u8D37\u6B3E" }),
    /* @__PURE__ */ jsx4("label", { className: "qf-lbl", style: { marginTop: 6 }, children: "\u540D\u79F0 *" }),
    /* @__PURE__ */ jsx4("input", { className: "qf-inp", value: f.name, onChange: (e) => set("name", e.target.value), placeholder: "\u5546\u8D37 / \u516C\u79EF\u91D1 / \u8F66\u8D37" }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { gap: 8 }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u7C7B\u578B" }),
        /* @__PURE__ */ jsx4("select", { className: "qf-sel", value: f.kind, onChange: (e) => set("kind", e.target.value), children: KIND_OPTS.map(([k, cn]) => /* @__PURE__ */ jsx4("option", { value: k, children: cn }, k)) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u8FD8\u6B3E\u65B9\u5F0F *" }),
        /* @__PURE__ */ jsx4("select", { className: "qf-sel", value: f.method, onChange: (e) => set("method", e.target.value), children: METHOD_OPTS.map(([k, cn]) => /* @__PURE__ */ jsx4("option", { value: k, children: cn }, k)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { gap: 8 }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u672C\u91D1\uFF08\u4E07\uFF09*" }),
        /* @__PURE__ */ jsx4("input", { className: "qf-inp qf-num", inputMode: "decimal", value: f.principal, onChange: (e) => set("principal", e.target.value), placeholder: "100" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u5E74\u5229\u7387 % *" }),
        /* @__PURE__ */ jsx4("input", { className: "qf-inp qf-num", inputMode: "decimal", value: f.annualRate, onChange: (e) => set("annualRate", e.target.value), placeholder: "3.6" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u671F\u6570\uFF08\u6708\uFF09*" }),
        /* @__PURE__ */ jsx4("input", { className: "qf-inp qf-num", inputMode: "numeric", value: f.termMonths, onChange: (e) => set("termMonths", e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u7B2C\u4E00\u671F\u8FD8\u6B3E\u65E5 *\uFF08\u4E0D\u662F\u653E\u6B3E\u65E5\uFF09" }),
    /* @__PURE__ */ jsx4("input", { className: "qf-inp", type: "date", value: f.startDate, onChange: (e) => set("startDate", e.target.value) }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { gap: 8 }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u653E\u8D37\u673A\u6784" }),
        /* @__PURE__ */ jsx4("input", { className: "qf-inp", value: f.lender, onChange: (e) => set("lender", e.target.value), placeholder: "\uFF08\u53EF\u9009\uFF09" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u5F52\u7EC4\uFF08\u7EC4\u5408\u8D37\uFF09" }),
        /* @__PURE__ */ jsx4("input", { className: "qf-inp", value: f.groupId, onChange: (e) => set("groupId", e.target.value), placeholder: "\u5982 home" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { gap: 8 }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u91CD\u5B9A\u4EF7\u65E5" }),
        /* @__PURE__ */ jsx4("input", { className: "qf-inp", value: f.rpDay, onChange: (e) => set("rpDay", e.target.value), placeholder: "01-01 \u6216 anniversary" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qf-grow", children: [
        /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u91CD\u5B9A\u4EF7\u5468\u671F\uFF08\u6708\uFF09" }),
        /* @__PURE__ */ jsxs4("select", { className: "qf-sel", value: f.rpCycle, onChange: (e) => set("rpCycle", e.target.value), children: [
          /* @__PURE__ */ jsx4("option", { value: "12", children: "12" }),
          /* @__PURE__ */ jsx4("option", { value: "6", children: "6" }),
          /* @__PURE__ */ jsx4("option", { value: "3", children: "3" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx4("label", { className: "qf-lbl", children: "\u5907\u6CE8\uFF08\u8FDD\u7EA6\u91D1\u6761\u6B3E\u7B49\uFF09" }),
    /* @__PURE__ */ jsx4("input", { className: "qf-inp", value: f.note, onChange: (e) => set("note", e.target.value), placeholder: "\uFF08\u53EF\u9009\uFF09" }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { marginTop: 10, gap: 8 }, children: [
      /* @__PURE__ */ jsx4("button", { className: "qf-btn gold qf-grow", disabled: busy, onClick: submit, children: existing ? "\u4FDD\u5B58\u4FEE\u6539" : "\u5EFA\u8D26" }),
      /* @__PURE__ */ jsx4("button", { className: "qf-btn ghost", onClick: onCancel, children: "\u53D6\u6D88" })
    ] }),
    !existing && /* @__PURE__ */ jsx4("div", { className: "qf-sub", style: { marginTop: 6 }, children: "\u5EFA\u8D26\u540E\u6309\u53C2\u6570\u6574\u8868\u63A8\u7B97\uFF1B\u5EFA\u8BAE\u7528\u94F6\u884C App \u7684\u5B9E\u9645\u5269\u4F59\u672C\u91D1\u5728\u8BE6\u60C5\u91CC\u300C\u8BB0\u5BF9\u8D26\u300D\u6838\u4E00\u6B21\u3002" })
  ] }) });
}
function LoanDetail({ loan, states, data, reload, showToast, onEdit }) {
  const idx = data.loans.indexOf(loan);
  const st = states[idx];
  const events = eventsOf(data, loan.id);
  const [logType, setLogType] = useState2("prepay");
  const [logF, setLogF] = useState2({ date: "", rate: "", amount: "", mode: "payment", note: "" });
  const [busy, setBusy] = useState2(false);
  const years = core5.yearlyBreakdown(loan, eventsOf(data, loan.id));
  const maxY = Math.max(1, ...years.map((y) => y.paid));
  const submitLog = async () => {
    setBusy(true);
    try {
      const date = logF.date || st.today;
      const amount = logF.amount ? Math.round(Number(logF.amount) * 1e4 * 100) / 100 : null;
      const input = {
        type: logType,
        loanId: loan.id,
        date,
        note: logF.note
      };
      if (logType === "rate") input.rate = +logF.rate;
      if (logType === "prepay" || logType === "checkpoint") input.amount = amount;
      if (logType === "prepay") input.mode = logF.mode;
      if (logType === "prepay") {
        const v = core5.validatePrepay(loan, events, { date, amount: amount || 0 });
        if (v.error) {
          showToast(v.error, true);
          return;
        }
      }
      await saveEvent(input);
      setLogF({ date: "", rate: "", amount: "", mode: "payment", note: "" });
      await reload();
      showToast(`\u5DF2\u8BB0\u5F55\uFF1A${logType === "rate" ? "\u5229\u7387\u53D8\u66F4" : logType === "prepay" ? "\u63D0\u524D\u8FD8\u6B3E" : "\u5BF9\u8D26\u70B9"}`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async () => {
    await saveLoan({ id: loan.id, active: loan.active === false }, loan);
    await reload();
    showToast(loan.active === false ? "\u5DF2\u6062\u590D\u8BA1\u5165" : "\u5DF2\u505C\u7528\uFF08\u5386\u53F2\u4FDD\u7559\uFF09");
  };
  const del = async () => {
    if (!window.confirm(`\u5220\u9664\u300C${loan.name}\u300D\u53CA\u5176 ${events.length} \u6761\u4E8B\u4EF6\u8BB0\u5F55\uFF1F\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    await deleteLoan(loan.id, data);
    await reload();
    showToast("\u5DF2\u5220\u9664");
  };
  return /* @__PURE__ */ jsxs4("div", { style: { borderTop: "1px solid #242C3A", padding: "10px 13px" }, children: [
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { gap: 6, marginBottom: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx4("button", { className: "qf-btn ghost sm", onClick: onEdit, children: "\u7F16\u8F91\u53C2\u6570" }),
      /* @__PURE__ */ jsx4("button", { className: "qf-btn ghost sm", onClick: toggleActive, children: loan.active === false ? "\u6062\u590D\u8BA1\u5165" : "\u505C\u7528\uFF08\u7ED3\u6E05/\u8F6C\u51FA\uFF09" }),
      /* @__PURE__ */ jsx4("span", { className: "qf-grow" }),
      /* @__PURE__ */ jsx4("button", { className: "qf-btn danger sm", onClick: del, children: "\u5220\u9664" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-sub", style: { marginBottom: 6 }, children: [
      "\u5DF2\u4ED8\u5229\u606F ",
      core5.fmtMoney(st.paidInterest),
      " + \u672C\u91D1 ",
      core5.fmtMoney(st.paidPrincipal),
      st.paidPrepay ? ` + \u63D0\u524D\u8FD8 ${core5.fmtMoney(st.paidPrepay)}` : "",
      " \xB7 \u4ECA\u5E74\u4ED8\u606F ",
      core5.fmtMoney(st.paidThisYearInterest),
      loan.note ? /* @__PURE__ */ jsxs4(Fragment4, { children: [
        " \xB7 \u5907\u6CE8\uFF1A",
        loan.note
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qf-sub", style: { marginBottom: 3 }, children: "\u5E74\u5EA6\u652F\u51FA\u6784\u6210\uFF08\u67F1\u9AD8=\u5F53\u5E74\u73B0\u91D1\u652F\u51FA\uFF1B\u6DF1\u8272=\u5229\u606F\uFF09" }),
    /* @__PURE__ */ jsx4("div", { style: { display: "flex", alignItems: "flex-end", gap: 3, height: 54, marginBottom: 2 }, children: years.map((y) => {
      const h = Math.max(3, Math.round(y.paid / maxY * 54));
      const ih = y.paid > 0 ? Math.max(2, Math.round(y.interest / y.paid * h)) : 0;
      return /* @__PURE__ */ jsxs4("div", { style: { flex: 1, minWidth: 0 }, title: `${y.year}\uFF1A\u606F ${core5.fmtMoney(y.interest)} / \u672C ${core5.fmtMoney(y.principal)}${y.prepay ? ` / \u63D0\u524D\u8FD8 ${core5.fmtMoney(y.prepay)}` : ""}`, children: [
        /* @__PURE__ */ jsx4("div", { style: { height: h, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: 2, overflow: "hidden", background: "#2b4a37" }, children: /* @__PURE__ */ jsx4("div", { style: { height: ih, background: "#8a6414" } }) }),
        /* @__PURE__ */ jsx4("div", { style: { fontSize: 8, color: "#5C6678", textAlign: "center", marginTop: 1 }, children: y.year.slice(2) })
      ] }, y.year);
    }) }),
    /* @__PURE__ */ jsx4("div", { className: "qf-row", style: { gap: 6, marginTop: 10 }, children: [["prepay", "\u63D0\u524D\u8FD8\u6B3E"], ["rate", "\u5229\u7387\u53D8\u66F4"], ["checkpoint", "\u5BF9\u8D26"]].map(([k, cn]) => /* @__PURE__ */ jsx4("button", { className: `qf-btn sm ${logType === k ? "gold" : "ghost"}`, onClick: () => setLogType(k), children: cn }, k)) }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { gap: 6, marginTop: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx4("input", { className: "qf-inp", style: { width: 130 }, type: "date", value: logF.date, onChange: (e) => setLogF((p) => ({ ...p, date: e.target.value })), placeholder: st.today }),
      logType === "rate" && /* @__PURE__ */ jsx4("input", { className: "qf-inp qf-num", style: { width: 90 }, inputMode: "decimal", value: logF.rate, onChange: (e) => setLogF((p) => ({ ...p, rate: e.target.value })), placeholder: "\u65B0\u5229\u7387 %" }),
      logType !== "rate" && /* @__PURE__ */ jsx4("input", { className: "qf-inp qf-num", style: { width: 110 }, inputMode: "decimal", value: logF.amount, onChange: (e) => setLogF((p) => ({ ...p, amount: e.target.value })), placeholder: logType === "prepay" ? "\u91D1\u989D\uFF08\u4E07\uFF09" : "\u94F6\u884C\u4F59\u989D\uFF08\u4E07\uFF09" }),
      logType === "prepay" && /* @__PURE__ */ jsxs4("select", { className: "qf-sel", style: { width: 100 }, value: logF.mode, onChange: (e) => setLogF((p) => ({ ...p, mode: e.target.value })), children: [
        /* @__PURE__ */ jsx4("option", { value: "payment", children: "\u51CF\u6708\u4F9B" }),
        /* @__PURE__ */ jsx4("option", { value: "term", children: "\u7F29\u671F" })
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "qf-btn sm", disabled: busy, onClick: submitLog, children: "\u8BB0\u5F55" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "qf-sub", style: { margin: "10px 0 3px" }, children: [
      "\u4E8B\u4EF6\u6D41\u6C34\uFF08",
      events.length,
      "\uFF09"
    ] }),
    !events.length && /* @__PURE__ */ jsx4("div", { className: "qf-sub", children: "\u5C1A\u65E0\u5229\u7387\u53D8\u66F4/\u63D0\u524D\u8FD8\u6B3E/\u5BF9\u8D26\u8BB0\u5F55\u3002" }),
    events.slice().reverse().slice(0, 20).map((e) => /* @__PURE__ */ jsxs4("div", { className: "qf-row", style: { padding: "3px 0", borderTop: "1px solid #1C2330" }, children: [
      /* @__PURE__ */ jsx4("span", { className: "qf-sub qf-num", children: e.date }),
      /* @__PURE__ */ jsx4("span", { className: "qf-tag", children: e.type === "rate" ? "\u5229\u7387" : e.type === "prepay" ? "\u63D0\u524D\u8FD8" : "\u5BF9\u8D26" }),
      /* @__PURE__ */ jsxs4("span", { className: "qf-sub qf-num qf-grow", children: [
        e.type === "rate" ? `\u2192 ${core5.fmtPct(e.rate)}` : e.type === "prepay" ? `${core5.fmtMoney(e.amount)}\uFF08${e.mode === "term" ? "\u7F29\u671F" : "\u51CF\u6708\u4F9B"}\uFF09` : `\u94F6\u884C ${core5.fmtMoney(e.amount)}`,
        e.note ? ` \xB7 ${e.note}` : ""
      ] }),
      /* @__PURE__ */ jsx4(
        "button",
        {
          className: "qf-btn danger sm",
          onClick: async () => {
            await deleteEvent(e.occKey);
            await reload();
            showToast("\u5DF2\u5220\u9664\u8BE5\u4E8B\u4EF6\uFF0C\u8FD8\u6B3E\u8868\u91CD\u653E");
          },
          children: "\u5220"
        }
      )
    ] }, e.occKey))
  ] });
}

// src/SettingsTab.tsx
import { useRef, useState as useState3 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast, onSendToChat }) {
  const [warnDays, setWarnDays] = useState3("");
  const [rpWarn, setRpWarn] = useState3("");
  const [driftWarn, setDriftWarn] = useState3("");
  const [importText, setImportText] = useState3("");
  const [busy, setBusy] = useState3(false);
  const fileRef = useRef(null);
  if (!data) return /* @__PURE__ */ jsx5("div", { className: "qf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.settings;
  const save = async () => {
    setBusy(true);
    try {
      await saveSettings({
        warnDays: warnDays === "" ? s.warnDays : +warnDays,
        repricingWarnDays: rpWarn === "" ? s.repricingWarnDays : +rpWarn,
        driftWarn: driftWarn === "" ? s.driftWarn : +driftWarn
      });
      setWarnDays("");
      setRpWarn("");
      setDriftWarn("");
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const doExport = () => {
    const json = exportAll(data);
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quanfu-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3e3);
      showToast("\u5DF2\u5BFC\u51FA\uFF08\u6D4F\u89C8\u5668\u4E0B\u8F7D\uFF09");
    } catch {
      setImportText(json);
      showToast("\u4E0B\u8F7D\u4E0D\u53EF\u7528\uFF0CJSON \u5DF2\u653E\u5165\u4E0B\u65B9\u6587\u672C\u6846\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u4FDD\u5B58");
    }
  };
  const doImport = async (text) => {
    setBusy(true);
    try {
      const r = await importAll(text);
      setImportText("");
      await reload();
      showToast(`\u5BFC\u5165\u5B8C\u6210\uFF1A\u8D37\u6B3E ${r.loans} \u7B14\u3001\u4E8B\u4EF6 ${r.events} \u6761`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const clearAll = async () => {
    if (!window.confirm("\u6E05\u7A7A\u6CC9\u5E9C\u5168\u90E8\u6570\u636E\uFF08\u8D37\u6B3E/\u4E8B\u4EF6/\u8BBE\u7F6E\uFF09\uFF1F\u4E0D\u53EF\u6062\u590D\u3002\u5EFA\u8BAE\u5148\u5BFC\u51FA\u5907\u4EFD\u3002")) return;
    setBusy(true);
    try {
      const { kvKeys: kvKeys2, kvDel: kvDel2 } = await Promise.resolve().then(() => (init_host(), host_exports));
      const keys = await kvKeys2();
      for (const k of keys.filter((k2) => k2.startsWith("quanfu."))) await kvDel2(k);
      await reload();
      showToast("\u5DF2\u6E05\u7A7A");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsx5("div", { className: "qf-card", children: /* @__PURE__ */ jsxs5("div", { className: "qf-card-b", children: [
      /* @__PURE__ */ jsx5("b", { style: { fontSize: 12.5 }, children: "\u63D0\u9192\u53C2\u6570" }),
      /* @__PURE__ */ jsxs5("div", { className: "qf-row", style: { gap: 8, marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs5("div", { className: "qf-grow", children: [
          /* @__PURE__ */ jsx5("label", { className: "qf-lbl", style: { marginTop: 0 }, children: "\u6263\u6B3E\u4E34\u8FD1\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx5("input", { className: "qf-inp qf-num", inputMode: "numeric", value: warnDays, onChange: (e) => setWarnDays(e.target.value), placeholder: String(s.warnDays) })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "qf-grow", children: [
          /* @__PURE__ */ jsx5("label", { className: "qf-lbl", style: { marginTop: 0 }, children: "\u91CD\u5B9A\u4EF7\u4E34\u8FD1\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx5("input", { className: "qf-inp qf-num", inputMode: "numeric", value: rpWarn, onChange: (e) => setRpWarn(e.target.value), placeholder: String(s.repricingWarnDays) })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "qf-grow", children: [
          /* @__PURE__ */ jsx5("label", { className: "qf-lbl", style: { marginTop: 0 }, children: "\u5BF9\u8D26\u6F02\u79FB\u63D0\u793A\uFF08\u5143\uFF09" }),
          /* @__PURE__ */ jsx5("input", { className: "qf-inp qf-num", inputMode: "numeric", value: driftWarn, onChange: (e) => setDriftWarn(e.target.value), placeholder: String(s.driftWarn) })
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "qf-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx5("button", { className: "qf-btn gold qf-grow", disabled: busy, onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsx5("div", { className: "qf-card", children: /* @__PURE__ */ jsxs5("div", { className: "qf-card-b", children: [
      /* @__PURE__ */ jsx5("b", { style: { fontSize: 12.5 }, children: "\u6570\u636E\uFF08\u4EC5\u5B58\u672C\u673A\uFF09" }),
      /* @__PURE__ */ jsxs5("div", { className: "qf-row", style: { gap: 8, marginTop: 8 }, children: [
        /* @__PURE__ */ jsx5("button", { className: "qf-btn ghost qf-grow", disabled: busy, onClick: doExport, children: "\u5BFC\u51FA JSON" }),
        /* @__PURE__ */ jsx5("button", { className: "qf-btn ghost qf-grow", disabled: busy, onClick: () => fileRef.current?.click(), children: "\u4ECE\u6587\u4EF6\u5BFC\u5165" })
      ] }),
      /* @__PURE__ */ jsx5(
        "input",
        {
          ref: fileRef,
          type: "file",
          accept: ".json,application/json",
          style: { display: "none" },
          onChange: async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const text = await f.text();
            e.target.value = "";
            await doImport(text);
          }
        }
      ),
      /* @__PURE__ */ jsx5("label", { className: "qf-lbl", children: "\u6216\u628A\u5BFC\u51FA JSON \u7C98\u8D34\u5230\u8FD9\u91CC\u5BFC\u5165\uFF08\u5408\u5E76\u5224\u91CD\uFF09" }),
      /* @__PURE__ */ jsx5(
        "textarea",
        {
          className: "qf-inp",
          rows: 3,
          value: importText,
          onChange: (e) => setImportText(e.target.value),
          placeholder: '{"kind":"quanfu-export",...}',
          style: { resize: "vertical", fontFamily: "monospace", fontSize: 10.5 }
        }
      ),
      /* @__PURE__ */ jsxs5("div", { className: "qf-row", style: { gap: 8, marginTop: 8 }, children: [
        /* @__PURE__ */ jsx5("button", { className: "qf-btn qf-grow", disabled: busy || !importText.trim(), onClick: () => doImport(importText), children: "\u5BFC\u5165" }),
        /* @__PURE__ */ jsx5("button", { className: "qf-btn danger", disabled: busy, onClick: clearAll, children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx5("div", { className: "qf-card", children: /* @__PURE__ */ jsxs5("div", { className: "qf-card-b qf-sub", children: [
      /* @__PURE__ */ jsx5("b", { style: { color: "#E6EAF2" }, children: "\u5173\u4E8E\u6CC9\u5E9C" }),
      /* @__PURE__ */ jsx5("br", {}),
      "\u300A\u5468\u793C\xB7\u5730\u5B98\u300B\u6CC9\u5E9C\u638C\u5E02\u4E4B\u5F81\u5E03\u4E0E\u8D4A\u8D37\u2014\u2014\u6CC9\u8005\u94B1\u4E5F\uFF0C\u53E4\u4E4B\u5B98\u529E\u501F\u8D37\u673A\u6784\uFF1B\u4ECA\u4E4B\u5BB6\u5EAD\u8D1F\u503A\u53F0\u8D26\u3002",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u6570\u636E\uFF1Acap.kv \u7EAF\u672C\u5730\u5B58\u50A8\uFF0C\u65E0\u670D\u52A1\u8FDB\u7A0B\u3001\u96F6\u5916\u7F51\u8BF7\u6C42\u3001\u96F6\u8D26\u53F7\u3002",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u5F15\u64CE\uFF1A\u7B49\u989D\u672C\u606F/\u7B49\u989D\u672C\u91D1/\u5148\u606F\u540E\u672C\u6807\u51C6\u516C\u5F0F\uFF0C\u4E8B\u4EF6\u5206\u6BB5\u91CD\u653E\uFF08\u5229\u7387\u53D8\u66F4\u3001\u63D0\u524D\u8FD8\u6B3E\u3001\u5BF9\u8D26\u70B9\uFF09\uFF0C\u9010\u671F\u5206\u7EA7\u820D\u5165\u3002",
      /* @__PURE__ */ jsx5("br", {}),
      "\xB7 \u8FB9\u754C\uFF1A\u4E0D\u6784\u6210\u91D1\u878D\u5EFA\u8BAE\uFF1B\u4E0D\u7B97\u8FDD\u7EA6\u91D1\uFF08\u5404\u884C\u5408\u540C\u4E0D\u540C\uFF09\uFF1B\u4E0D\u6293\u53D6 LPR\uFF08\u5229\u7387\u4E00\u5F8B\u4EE5\u4F60\u7684\u5408\u540C\u4E3A\u51C6\u624B\u5DE5\u8BB0\u5F55\uFF09\u3002",
      onSendToChat && /* @__PURE__ */ jsx5("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx5("button", { className: "qf-btn ghost sm", onClick: () => onSendToChat("\u6211\u60F3\u804A\u804A\u6211\u7684\u623F\u8D37\u8FD8\u6B3E\u8BA1\u5212\uFF08\u6CC9\u5E9C\u5DF2\u6709\u6211\u7684\u8D37\u6B3E\u53F0\u8D26\uFF09\u3002"), children: "\u548C AI \u804A\u804A\u8FD8\u6B3E\u8BA1\u5212" }) })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.qf-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qf-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qf-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qf-body::-webkit-scrollbar{width:9px;height:9px}
.qf-body::-webkit-scrollbar-track{background:transparent}
.qf-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qf-page{max-width:580px;margin:0 auto}

/* \u5934\u90E8 */
.qf-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qf-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#D29922,#E3B341);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qf-tt{flex:1;min-width:0}
.qf-tt b{font-size:15px;display:block}
.qf-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qf-tabs{display:flex;gap:4px}
.qf-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.qf-tab:hover{color:#E6EAF2}
.qf-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qf-badge{position:absolute;top:0;right:2px;background:#D29922;color:#10141C;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.qf-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qf-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#D29922,#E3B341);flex-shrink:0}
.qf-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qf-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.qf-card-b{padding:11px 13px}
.qf-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.qf-btn:hover{filter:brightness(1.1)}
.qf-btn:disabled{opacity:.45;cursor:not-allowed}
.qf-btn.gold{background:#8a6414;color:#F5D97A}
.qf-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qf-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qf-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qf-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.qf-inp:focus{outline:none;border-color:#2b6cb0}
.qf-inp::placeholder{color:#4d5566}
.qf-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.qf-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.qf-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qf-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.qf-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qf-toast.bad{border-color:#54262c;color:#FF8A9A}
.qf-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.qf-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.qf-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.qf-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.qf-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.qf-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.qf-row{display:flex;align-items:center;gap:8px;min-width:0}
.qf-grow{flex:1;min-width:0}
.qf-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.qf-alert{margin:0 16px 10px;background:#332a12;border:1px solid #5a4a1e;border-radius:10px;padding:8px 12px;font-size:11.5px;color:#E3B341;line-height:1.7}
.qf-num{font-variant-numeric:tabular-nums}
.qf-prog{height:5px;border-radius:3px;background:#232834;overflow:hidden}
.qf-prog>i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#D29922,#E3B341)}
.qf-kv{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;font-size:12px}
.qf-kv>span:first-child{color:#8B95A7;flex-shrink:0}
.qf-kv>span:last-child{text-align:right;min-width:0}
`;
function QuanfuPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("overview");
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const cacheRef = useRef2(newCache());
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3e3);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadQuan(cacheRef.current);
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
  const states = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return data.loans.map((l) => stateOf(data, l, now));
  }, [data]);
  const alertCount = useMemo(() => {
    if (!data || !states.length) return 0;
    const today = data ? states[0]?.today || "" : "";
    let n = 0;
    states.forEach((st, i) => {
      const loan = data.loans[i];
      if (!loan.active || st.settled) return;
      if (st.nextPaymentDate) {
        const d = coreDayDiff(today, st.nextPaymentDate);
        if (d != null && d >= 0 && d <= data.settings.warnDays) n++;
      }
      if (st.nextRepricingDate) {
        const d = coreDayDiff(today, st.nextRepricingDate);
        if (d != null && d >= 0 && d <= data.settings.repricingWarnDays) n++;
      }
      const cp = st.checkpoints[st.checkpoints.length - 1];
      if (cp && Math.abs(cp.drift) > data.settings.driftWarn) n++;
    });
    return n;
  }, [data, states]);
  const tabProps = { data, reload, showToast, pluginId, onSendToChat };
  return /* @__PURE__ */ jsxs6("div", { className: "qf-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "qf-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "qf-logo", children: "\u{1F3DB}\uFE0F" }),
      /* @__PURE__ */ jsxs6("div", { className: "qf-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u6CC9\u5E9C" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          "\u8D37\u6B3E\u53F0\u8D26 \xB7 ",
          states.filter((s) => s.active && !s.settled).length,
          " \u7B14\u5728\u8FD8 \xB7 \u6570\u636E\u4EC5\u5B58\u672C\u673A"
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "qf-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["whatif", "\u6D4B\u7B97"],
        ["loans", "\u8D37\u6B3E"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs6("button", { className: `qf-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "overview" && alertCount > 0 && /* @__PURE__ */ jsx6("span", { className: "qf-badge", children: alertCount > 9 ? "9+" : alertCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "qf-body", children: /* @__PURE__ */ jsxs6("div", { className: "qf-page", children: [
      loadErr && /* @__PURE__ */ jsxs6("div", { className: "qf-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx6(OverviewTab, { ...tabProps, states }),
      tab === "whatif" && /* @__PURE__ */ jsx6(WhatifTab, { ...tabProps, states }),
      tab === "loans" && /* @__PURE__ */ jsx6(LoansTab, { ...tabProps, states }),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { ...tabProps }),
      /* @__PURE__ */ jsxs6("div", { className: "qf-foot", children: [
        "\u6CC9\u5E9C\u53EA\u505A\u8D37\u6B3E\u8BB0\u5F55\u4E0E\u6D4B\u7B97\uFF1A\u6807\u51C6\u7B49\u989D\u672C\u606F/\u7B49\u989D\u672C\u91D1/\u5148\u606F\u540E\u672C\u516C\u5F0F\u3001\u9010\u671F\u5206\u7EA7\u820D\u5165\uFF0C",
        /* @__PURE__ */ jsx6("br", {}),
        "\u4E0E\u94F6\u884C\u5B9E\u9645\u8BA1\u606F\u53EF\u80FD\u6709\u5206\u7EA7\u51FA\u5165\uFF1B\u4E0D\u6784\u6210\u91D1\u878D\u5EFA\u8BAE\u3002\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002"
      ] })
    ] }) }),
    toast && /* @__PURE__ */ jsx6("div", { className: `qf-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}
function coreDayDiff(a, b) {
  const ta = (/* @__PURE__ */ new Date(a + "T00:00:00")).getTime();
  const tb = (/* @__PURE__ */ new Date(b + "T00:00:00")).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 864e5);
}

// src/index.tsx
var src_default = QuanfuPanel;
export {
  src_default as default
};
