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
    var DAY_MS2 = 864e5;
    var NAME_CAP = 40;
    var SPEC_CAP = 60;
    var NOTE_CAP = 300;
    var UNIT_CAP = 8;
    var MAX_TIMES = 6;
    var FREQ_TYPES2 = ["daily", "weekly", "interval", "cycle", "prn"];
    var FORMS = ["tablet", "capsule", "granule", "liquid", "injection", "patch", "other"];
    var MAX_BATCHES_HINT = 400;
    var RATE_WINDOW_DAYS = 14;
    function clip(s, cap) {
      return String(s == null ? "" : s).trim().slice(0, cap);
    }
    function idFor(seed) {
      return "q" + sha256Hex(String(seed)).slice(0, 12);
    }
    function randTag() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function dayKey4(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseDayKey2(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
      if (!m) return null;
      const ts = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      const d = new Date(ts);
      return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? ts : null;
    }
    function timeToMin(s) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
      if (!m) return -1;
      const h = +m[1], mi = +m[2];
      if (h > 23 || mi > 59) return -1;
      return h * 60 + mi;
    }
    function minToTime(min) {
      return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    }
    function dayMinTs(dayKeyStr, min) {
      const base = parseDayKey2(dayKeyStr);
      if (base == null || min < 0) return null;
      return base + min * 6e4;
    }
    function dayDiff2(a, b) {
      const ta = parseDayKey2(a), tb = parseDayKey2(b);
      if (ta == null || tb == null) return NaN;
      return Math.round((ta - tb) / DAY_MS2);
    }
    function normalizeProfile2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const name = clip(raw.name !== void 0 ? raw.name : prev ? prev.name : "", NAME_CAP);
      if (!name) return { error: "\u6210\u5458\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
      const kindRaw = String(raw.kind !== void 0 ? raw.kind : prev ? prev.kind : "human");
      const kind = ["human", "pet"].includes(kindRaw) ? kindRaw : "human";
      return { profile: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("profile|" + name),
        name,
        kind,
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function normalizeMed2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const name = clip(raw.name !== void 0 ? raw.name : prev ? prev.name : "", NAME_CAP);
      if (!name) return { error: "\u836F\u54C1\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
      const formRaw = String(raw.form !== void 0 ? raw.form : prev ? prev.form : "tablet");
      const form = FORMS.includes(formRaw) ? formRaw : "other";
      return { med: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("med|" + name + "|" + clip(raw.spec, 20)),
        name,
        spec: clip(raw.spec !== void 0 ? raw.spec : prev ? prev.spec : "", SPEC_CAP),
        form,
        unit: clip(raw.unit !== void 0 ? raw.unit : prev ? prev.unit : "", UNIT_CAP) || "\u7247",
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function normalizeBatch2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const medId = clip(raw.medId !== void 0 ? raw.medId : prev ? prev.medId : "", 40);
      if (!medId) return { error: "\u6279\u6B21\u5FC5\u987B\u6302\u5728\u4E00\u652F\u836F\u54C1\u4E0B" };
      let qty = raw.qty !== void 0 ? Number(raw.qty) : prev ? prev.qty : NaN;
      if (!Number.isFinite(qty) || qty < 0) qty = prev ? prev.qty : 0;
      qty = Math.min(Math.floor(qty * 100) / 100, 1e6);
      let expiry = "";
      if (raw.expiry !== void 0 || !prev) {
        const e = clip(raw.expiry, 10);
        if (e && parseDayKey2(e) == null) return { error: `\u6548\u671F\u4E0D\u5408\u6CD5\uFF1A${e}\uFF08\u9700 YYYY-MM-DD\uFF09` };
        expiry = e;
      } else expiry = prev.expiry || "";
      return { batch: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("batch|" + medId + "|" + expiry + "|" + randTag()),
        medId,
        qty,
        expiry,
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function normalizeFreq(raw) {
      const f = raw && typeof raw === "object" ? raw : {};
      const type = String(f.type || "daily");
      if (!FREQ_TYPES2.includes(type)) return { error: `\u9891\u6B21\u7C7B\u578B\u4E0D\u5408\u6CD5\uFF1A${type}\uFF08\u652F\u6301 daily/weekly/interval/cycle/prn\uFF09` };
      const out = { type };
      if (type === "weekly") {
        let wd = Array.isArray(f.weekdays) ? f.weekdays : [];
        wd = [...new Set(wd.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6))].sort();
        if (!wd.length) return { error: "weekly \u9700\u81F3\u5C11\u4E00\u4E2A weekdays\uFF080=\u5468\u65E5\u20266=\u5468\u516D\uFF09" };
        out.weekdays = wd;
      } else if (type === "interval") {
        const n = Math.floor(Number(f.intervalDays));
        if (!Number.isFinite(n) || n < 2 || n > 365) return { error: "intervalDays \u9700\u4E3A 2-365 \u7684\u6574\u6570" };
        out.intervalDays = n;
      } else if (type === "cycle") {
        const on = Math.floor(Number(f.onDays)), off = Math.floor(Number(f.offDays));
        if (!Number.isFinite(on) || on < 1 || on > 365) return { error: "onDays \u9700\u4E3A 1-365 \u7684\u6574\u6570" };
        if (!Number.isFinite(off) || off < 1 || off > 365) return { error: "offDays \u9700\u4E3A 1-365 \u7684\u6574\u6570" };
        out.onDays = on;
        out.offDays = off;
      }
      return { freq: out };
    }
    function normalizeRegimen2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const profileId = clip(raw.profileId !== void 0 ? raw.profileId : prev ? prev.profileId : "", 40);
      const medId = clip(raw.medId !== void 0 ? raw.medId : prev ? prev.medId : "", 40);
      if (!profileId) return { error: "\u65B9\u6848\u5FC5\u987B\u6302\u5728\u4E00\u4E2A\u6210\u5458\u4E0B" };
      if (!medId) return { error: "\u65B9\u6848\u5FC5\u987B\u6302\u5728\u4E00\u652F\u836F\u54C1\u4E0B" };
      let dose = raw.dose !== void 0 ? Number(raw.dose) : prev ? prev.dose : NaN;
      if (!Number.isFinite(dose) || dose <= 0) return { error: "dose \u9700\u4E3A\u6B63\u6570\uFF08\u6BCF\u6B21\u5242\u91CF\uFF09" };
      dose = Math.min(dose, 1e4);
      let times = raw.times !== void 0 ? raw.times : prev ? prev.times : [];
      if (!Array.isArray(times)) times = [];
      const seenMin = /* @__PURE__ */ new Set();
      times = times.map((t) => timeToMin(t)).filter((min) => min >= 0 && !seenMin.has(min) && (seenMin.add(min), true)).sort((a, b) => a - b).slice(0, MAX_TIMES).map(minToTime);
      const fr = raw.freq !== void 0 ? normalizeFreq(raw.freq) : { freq: prev ? prev.freq : null };
      if (fr.error) return { error: fr.error };
      if (!fr.freq) return { error: "\u7F3A\u5C11\u9891\u6B21 freq" };
      if (fr.freq.type !== "prn" && !times.length) return { error: '\u975E prn \u65B9\u6848\u9700\u81F3\u5C11\u4E00\u4E2A\u670D\u836F\u65F6\u523B\uFF08times\uFF0C\u5982 ["08:00"]\uFF09' };
      const startDate = raw.startDate !== void 0 ? clip(raw.startDate, 10) : prev ? prev.startDate : dayKey4(Date.now());
      if (parseDayKey2(startDate) == null) return { error: `startDate \u4E0D\u5408\u6CD5\uFF1A${startDate}\uFF08\u9700 YYYY-MM-DD\uFF09` };
      let endDate = prev ? prev.endDate || "" : "";
      if (raw.endDate !== void 0) {
        const e = clip(raw.endDate, 10);
        if (e && parseDayKey2(e) == null) return { error: `endDate \u4E0D\u5408\u6CD5\uFF1A${e}\uFF08\u9700 YYYY-MM-DD \u6216\u7559\u7A7A\uFF09` };
        endDate = e;
      }
      if (endDate && dayDiff2(endDate, startDate) < 0) return { error: "endDate \u4E0D\u80FD\u65E9\u4E8E startDate" };
      return { regimen: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("reg|" + profileId + "|" + medId + "|" + startDate + "|" + randTag()),
        profileId,
        medId,
        dose,
        times,
        freq: fr.freq,
        startDate,
        endDate,
        active: raw.active === void 0 ? prev ? prev.active !== false : true : raw.active === true,
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function doseOccKey(regId, date, time) {
      return `${regId}|${date}|${time}`;
    }
    function parseOccKey2(key) {
      const s = String(key || "");
      const i = s.indexOf("|");
      if (i < 0) return null;
      const regId = s.slice(0, i);
      const rest = s.slice(i + 1);
      const j = rest.indexOf("|");
      if (j < 0) return null;
      const date = rest.slice(0, j), time = rest.slice(j + 1);
      if (!regId || parseDayKey2(date) == null || timeToMin(time) < 0) return null;
      return { regId, date, time };
    }
    function normalizeLog2(raw, regimen, now) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      let occ = raw.occKey ? parseOccKey2(raw.occKey) : null;
      if (!occ) {
        const regId = clip(raw.regId, 40), date = clip(raw.date, 10), time = clip(raw.time, 5);
        if (!regId || parseDayKey2(date) == null || timeToMin(time) < 0) return { error: "\u9700\u63D0\u4F9B occKey \u6216 regId+date+time\uFF08date=YYYY-MM-DD\uFF0Ctime=HH:MM\uFF09" };
        occ = { regId, date, time };
      }
      const statusRaw = String(raw.status !== void 0 ? raw.status : "taken");
      if (statusRaw === "none" || statusRaw === "undo") return { del: doseOccKey(occ.regId, occ.date, occ.time) };
      if (!["taken", "skip"].includes(statusRaw)) return { error: `status \u4E0D\u5408\u6CD5\uFF1A${statusRaw}\uFF08taken/skip/none\uFF09` };
      if (regimen && occ.regId !== regimen.id) return { error: "occKey \u4E0E\u65B9\u6848\u4E0D\u5339\u914D" };
      if (regimen) {
        const dd = dayDiff2(occ.date, regimen.startDate);
        if (Number.isNaN(dd)) return { error: "\u65E5\u671F\u4E0D\u5408\u6CD5" };
        if (dd < 0) return { error: `\u6253\u5361\u65E5\u671F\u65E9\u4E8E\u65B9\u6848\u5F00\u59CB\uFF08${regimen.startDate}\uFF09` };
        if (regimen.endDate && dayDiff2(occ.date, regimen.endDate) > 0) return { error: `\u6253\u5361\u65E5\u671F\u665A\u4E8E\u65B9\u6848\u7ED3\u675F\uFF08${regimen.endDate}\uFF09` };
        const isPrn = regimen.freq.type === "prn";
        if (!isPrn && !regimen.times.includes(occ.time)) {
          return { error: `\u65F6\u523B ${occ.time} \u4E0D\u5728\u8BE5\u65B9\u6848\u6392\u671F\u5185\uFF08${regimen.times.join("/")}\uFF09\uFF1B\u9700\u8981\u8BB0\u5F55\u8BA1\u5212\u5916\u670D\u836F\u8BF7\u5148\u786E\u8BA4\u65B9\u6848` };
        }
      }
      const amount = raw.amount !== void 0 && Number.isFinite(Number(raw.amount)) && Number(raw.amount) > 0 ? Math.min(Number(raw.amount), 1e4) : void 0;
      let at = Number(raw.at);
      if (!Number.isFinite(at) || at <= 0) at = now || Date.now();
      return { log: {
        occKey: doseOccKey(occ.regId, occ.date, occ.time),
        regId: occ.regId,
        date: occ.date,
        time: occ.time,
        status: statusRaw,
        amount,
        at: Math.floor(at)
      } };
    }
    var SETTING_LIMITS = { graceMin: [10, 240, 60], lowDays: [1, 60, 5], expiryWarnDays: [7, 730, 90], soundOn: null };
    function normalizeSettings2(raw) {
      const out = {};
      for (const [k, lim] of Object.entries(SETTING_LIMITS)) {
        if (k === "soundOn") {
          const v2 = raw && typeof raw === "object" ? raw[k] : void 0;
          out[k] = v2 === void 0 ? true : v2 === true;
          continue;
        }
        const v = Number(raw && typeof raw === "object" ? raw[k] : void 0);
        out[k] = Number.isFinite(v) ? Math.min(lim[1], Math.max(lim[0], Math.floor(v))) : lim[2];
      }
      return out;
    }
    function regimenDueOnDate(reg, date) {
      if (!reg || reg.active === false || reg.freq.type === "prn") return false;
      const dd = dayDiff2(date, reg.startDate);
      if (Number.isNaN(dd) || dd < 0) return false;
      if (reg.endDate && dayDiff2(date, reg.endDate) > 0) return false;
      const f = reg.freq;
      if (f.type === "daily") return true;
      if (f.type === "weekly") {
        const ts = parseDayKey2(date);
        if (ts == null) return false;
        return f.weekdays.includes(new Date(ts).getDay());
      }
      if (f.type === "interval") return dd % f.intervalDays === 0;
      if (f.type === "cycle") {
        const pos = dd % (f.onDays + f.offDays);
        return pos < f.onDays;
      }
      return false;
    }
    function regimenOccurrencesOnDate(reg, date) {
      if (!regimenDueOnDate(reg, date)) return [];
      return reg.times.map((time) => {
        const min = timeToMin(time);
        return {
          occKey: doseOccKey(reg.id, date, time),
          time,
          min,
          amount: reg.dose,
          dueTs: dayMinTs(date, min),
          reg
        };
      });
    }
    function occurrencesForDate(regimens, date) {
      const out = [];
      for (const reg of Array.isArray(regimens) ? regimens : []) {
        if (reg && reg.id) out.push(...regimenOccurrencesOnDate(reg, date));
      }
      return out.sort((a, b) => a.min - b.min);
    }
    function todayPlan2(ctx, date, now) {
      const { profiles, meds, regimens, logs } = ctx;
      const settings = normalizeSettings2(ctx.settings);
      const nowTs = now == null ? Date.now() : now;
      const logMap = /* @__PURE__ */ new Map();
      for (const l of Array.isArray(logs) ? logs : []) {
        if (l && l.occKey) logMap.set(l.occKey, l);
      }
      const medById = new Map((Array.isArray(meds) ? meds : []).filter((m) => m && m.id).map((m) => [m.id, m]));
      const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
      const byProfile = new Map((Array.isArray(profiles) ? profiles : []).filter((p) => p && p.id).map((p) => [p.id, []]));
      const graceMs = settings.graceMin * 6e4;
      for (const occ of occurrencesForDate((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.active !== false), date)) {
        const bucket = byProfile.get(occ.reg.profileId);
        if (!bucket) continue;
        const log = logMap.get(occ.occKey);
        let state = "upcoming";
        if (log && log.status === "taken") state = "done";
        else if (log && log.status === "skip") state = "skip";
        else if (occ.dueTs != null && nowTs >= occ.dueTs && nowTs <= occ.dueTs + graceMs) state = "now";
        else if (occ.dueTs != null && nowTs > occ.dueTs + graceMs) state = "overdue";
        const med = medById.get(occ.reg.medId);
        bucket.push({
          occKey: occ.occKey,
          time: occ.time,
          dueTs: occ.dueTs,
          medId: occ.reg.medId,
          medName: med ? med.name : "\u672A\u77E5\u836F\u54C1",
          unit: med ? med.unit : "",
          amount: log && log.amount != null ? log.amount : occ.amount,
          status: log ? log.status : null,
          loggedAt: log ? log.at : null,
          state,
          note: occ.reg.note || ""
        });
      }
      const out = [];
      for (const p of Array.isArray(profiles) ? profiles : []) {
        if (!p || !p.id) continue;
        const items = (byProfile.get(p.id) || []).sort((a, b) => a.dueTs - b.dueTs || (a.medName < b.medName ? -1 : 1));
        out.push({
          profile: p,
          items,
          counts: {
            done: items.filter((i) => i.state === "done").length,
            skip: items.filter((i) => i.state === "skip").length,
            now: items.filter((i) => i.state === "now").length,
            overdue: items.filter((i) => i.state === "overdue").length,
            upcoming: items.filter((i) => i.state === "upcoming").length
          }
        });
      }
      return out;
    }
    function dosesProjection(ctx, date, now) {
      const plan = todayPlan2(ctx, date, now);
      const items = [];
      for (const g of plan) {
        for (const it of g.items) {
          if (it.state === "now" || it.state === "overdue") {
            items.push({
              occKey: it.occKey,
              profileId: g.profile.id,
              profileName: g.profile.name,
              medId: it.medId,
              medName: it.medName,
              unit: it.unit,
              amount: it.amount,
              time: it.time,
              dueTs: it.dueTs,
              state: it.state
            });
          }
        }
      }
      items.sort((a, b) => a.dueTs - b.dueTs || (a.profileName < b.profileName ? -1 : 1));
      return { at: Math.floor(now == null ? Date.now() : now), date, items };
    }
    function stockForMed(medId, batches, logs, regimens, today) {
      const day = today || dayKey4(Date.now());
      const own = (Array.isArray(batches) ? batches : []).filter((b) => b && b.medId === medId && Number.isFinite(Number(b.qty))).slice(0, MAX_BATCHES_HINT);
      const usable = [];
      const expiredList = [];
      for (const b of own) {
        const exp = b.expiry || "";
        const isExpired = !!exp && dayDiff2(day, exp) > 0;
        (isExpired ? expiredList : usable).push(b);
      }
      usable.sort((a, b) => {
        const ea = a.expiry || "9999-12-31", eb = b.expiry || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        if (a.createdAt !== b.createdAt) return (a.createdAt || 0) - (b.createdAt || 0);
        return String(a.id) < String(b.id) ? -1 : 1;
      });
      const remaining = new Map(usable.map((b) => [b.id, Math.max(0, Number(b.qty) || 0)]));
      const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
      const logMap = /* @__PURE__ */ new Map();
      for (const l of Array.isArray(logs) ? logs : []) {
        if (l && l.occKey) logMap.set(l.occKey, l);
      }
      const taken = [...logMap.values()].filter((l) => l && l.status === "taken" && l.occKey).map((l) => {
        const reg = regById.get(l.regId);
        const amount = l.amount != null && Number.isFinite(Number(l.amount)) ? Number(l.amount) : reg ? reg.dose : 0;
        return { medId: reg ? reg.medId : null, amount, at: Number(l.at) || 0 };
      }).filter((x) => x.medId === medId && x.amount > 0).sort((a, b) => a.at - b.at);
      let over = false;
      let lastTakenAt = 0;
      for (const t of taken) {
        lastTakenAt = Math.max(lastTakenAt, t.at);
        let need = t.amount;
        for (const b of usable) {
          if (need <= 0) break;
          const cur = remaining.get(b.id) || 0;
          if (cur <= 0) continue;
          const use = Math.min(cur, need);
          remaining.set(b.id, Math.round((cur - use) * 100) / 100);
          need -= use;
        }
        if (need > 0) over = true;
      }
      const batchRows = own.map((b) => ({
        id: b.id,
        qty: Number(b.qty) || 0,
        remaining: expiredList.includes(b) ? Number(b.qty) || 0 : Math.round((remaining.get(b.id) || 0) * 100) / 100,
        expiry: b.expiry || "",
        expired: expiredList.includes(b),
        note: b.note || ""
      })).sort((a, b) => {
        const ea = a.expiry || "9999-12-31", eb = b.expiry || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        return a.id < b.id ? -1 : 1;
      });
      return {
        totalUsable: Math.round(batchRows.filter((b) => !b.expired).reduce((s, b) => s + b.remaining, 0) * 100) / 100,
        totalExpired: Math.round(batchRows.filter((b) => b.expired).reduce((s, b) => s + b.remaining, 0) * 100) / 100,
        batches: batchRows,
        over,
        lastTakenAt
      };
    }
    function regimenDailyRate(reg) {
      if (!reg || reg.active === false || reg.freq.type === "prn") return 0;
      const perDay = reg.dose * reg.times.length;
      const f = reg.freq;
      if (f.type === "daily") return perDay;
      if (f.type === "weekly") return perDay * f.weekdays.length / 7;
      if (f.type === "interval") return perDay / f.intervalDays;
      if (f.type === "cycle") return perDay * f.onDays / (f.onDays + f.offDays);
      return 0;
    }
    function refillForecast(ctx, now) {
      const { meds, batches, logs, regimens } = ctx;
      const settings = normalizeSettings2(ctx.settings);
      const nowTs = now == null ? Date.now() : now;
      const today = dayKey4(nowTs);
      const since = nowTs - RATE_WINDOW_DAYS * DAY_MS2;
      const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
      const takenByMed = /* @__PURE__ */ new Map();
      for (const l of Array.isArray(logs) ? logs : []) {
        if (!l || l.status !== "taken" || !(Number(l.at) >= since)) continue;
        const reg = regById.get(l.regId);
        if (!reg) continue;
        const amount = l.amount != null && Number.isFinite(Number(l.amount)) ? Number(l.amount) : reg.dose;
        takenByMed.set(reg.medId, (takenByMed.get(reg.medId) || 0) + amount);
      }
      const out = [];
      for (const med of Array.isArray(meds) ? meds : []) {
        if (!med || !med.id) continue;
        const stock = stockForMed(med.id, batches, logs, regimens, today);
        const actualRate = takenByMed.get(med.id) != null ? takenByMed.get(med.id) / RATE_WINDOW_DAYS : null;
        const schedRate = (Array.isArray(regimens) ? regimens : []).filter((r) => r && r.medId === med.id && r.active !== false).reduce((s, r) => s + regimenDailyRate(r), 0);
        const rate = actualRate != null ? actualRate : schedRate;
        const daysLeft = rate > 0 ? Math.floor(stock.totalUsable / rate) : null;
        out.push({
          medId: med.id,
          name: med.name,
          spec: med.spec || "",
          unit: med.unit || "",
          remaining: stock.totalUsable,
          expired: stock.totalExpired,
          ratePerDay: Math.round(rate * 100) / 100,
          estimated: actualRate == null && schedRate > 0,
          daysLeft,
          urgency: daysLeft == null ? "none" : daysLeft <= settings.lowDays ? "low" : daysLeft <= settings.lowDays * 3 ? "watch" : "ok"
        });
      }
      out.sort((a, b) => {
        const w = { low: 0, watch: 1, ok: 2, none: 3 };
        if (w[a.urgency] !== w[b.urgency]) return w[a.urgency] - w[b.urgency];
        if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
        return a.name < b.name ? -1 : 1;
      });
      return out;
    }
    function expiryBands(batches, meds, now, warnDays) {
      const nowTs = now == null ? Date.now() : now;
      const today = dayKey4(nowTs);
      const warn = normalizeSettings2({ expiryWarnDays: warnDays }).expiryWarnDays;
      const medById = new Map((Array.isArray(meds) ? meds : []).filter((m) => m && m.id).map((m) => [m.id, m]));
      const rows = [];
      for (const b of Array.isArray(batches) ? batches : []) {
        if (!b || !b.medId) continue;
        let band = "unknown";
        let daysLeft = null;
        if (b.expiry) {
          daysLeft = dayDiff2(b.expiry, today);
          band = daysLeft < 0 ? "expired" : daysLeft <= warn ? "soon" : "ok";
        }
        const med = medById.get(b.medId);
        rows.push({
          batchId: b.id,
          medId: b.medId,
          medName: med ? med.name : "\u672A\u77E5\u836F\u54C1",
          unit: med ? med.unit : "",
          expiry: b.expiry || "",
          daysLeft,
          qty: Number(b.qty) || 0,
          band,
          note: b.note || ""
        });
      }
      const order = { expired: 0, soon: 1, ok: 2, unknown: 3 };
      rows.sort((a, b) => {
        if (order[a.band] !== order[b.band]) return order[a.band] - order[b.band];
        const ea = a.expiry || "9999-12-31", eb = b.expiry || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        return String(a.batchId) < String(b.batchId) ? -1 : 1;
      });
      return rows;
    }
    function adherence2(ctx, profileId, now, days) {
      const { meds, regimens, logs } = ctx;
      const settings = normalizeSettings2(ctx.settings);
      const nowTs = now == null ? Date.now() : now;
      const n = Math.max(1, Math.floor(Number(days) || 7));
      const graceMs = settings.graceMin * 6e4;
      let scheduled = 0, decided = 0, taken = 0, skipped = 0, missed = 0;
      const logMap = /* @__PURE__ */ new Map();
      for (const l of Array.isArray(logs) ? logs : []) {
        if (l && l.occKey) logMap.set(l.occKey, l);
      }
      const regById = new Map((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.id).map((r) => [r.id, r]));
      for (let i = n - 1; i >= 0; i--) {
        const date = dayKey4(nowTs - i * DAY_MS2);
        for (const occ of occurrencesForDate((Array.isArray(regimens) ? regimens : []).filter((r) => r && r.active !== false && (!profileId || r.profileId === profileId)), date)) {
          scheduled++;
          const l = logMap.get(occ.occKey);
          if (l && l.status === "taken") {
            decided++;
            taken++;
          } else if (l && l.status === "skip") {
            decided++;
            skipped++;
          } else if (occ.dueTs != null && nowTs > occ.dueTs + graceMs) {
            decided++;
            missed++;
          }
        }
      }
      return {
        days: n,
        scheduled,
        decided,
        taken,
        skipped,
        missed,
        rate: decided > 0 ? Math.round(taken / decided * 100) : null
      };
    }
    var FREQ_CN = { daily: "\u6BCF\u5929", weekly: "\u6BCF\u5468", interval: "\u9694", cycle: "\u5468\u671F", prn: "\u9700\u8981\u65F6" };
    var WD_CN2 = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
    function describeFreq(freq) {
      const f = freq || { type: "daily" };
      if (f.type === "daily") return "\u6BCF\u5929";
      if (f.type === "weekly") return `\u6BCF\u5468${f.weekdays.map((d) => WD_CN2[d]).join("\u3001")}`;
      if (f.type === "interval") return `\u6BCF ${f.intervalDays} \u5929`;
      if (f.type === "cycle") return `\u5403 ${f.onDays} \u5929\u505C ${f.offDays} \u5929`;
      return "\u9700\u8981\u65F6\uFF08prn\uFF09";
    }
    function describeRegimen2(reg, med) {
      const parts = [`${med ? med.name : "\u672A\u77E5\u836F\u54C1"} \u6BCF\u6B21 ${reg.dose}${med ? med.unit : ""}`];
      if (reg.freq.type !== "prn") parts.push(reg.times.join(" / "));
      parts.push(describeFreq(reg.freq));
      parts.push(`\u81EA ${reg.startDate}${reg.endDate ? ` \u81F3 ${reg.endDate}` : ""}`);
      if (reg.active === false) parts.push("\uFF08\u5DF2\u505C\uFF09");
      return parts.join(" \xB7 ");
    }
    function exportAll3(data) {
      const strip = (arr, drop) => (Array.isArray(arr) ? arr : []).map((x) => {
        const o = {};
        for (const k of Object.keys(x || {})) if (!drop.includes(k)) o[k] = x[k];
        return o;
      });
      return JSON.stringify({
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        kind: "polaris-qingnang",
        disclaimer: "\u5BB6\u5EAD\u836F\u4E8B\u8BB0\u5F55\uFF0C\u975E\u533B\u7597\u5EFA\u8BAE\u3002",
        profiles: strip(data.profiles, ["rev"]),
        meds: strip(data.meds, ["rev"]),
        batches: strip(data.batches, ["rev"]),
        regimens: strip(data.regimens, ["rev"]),
        logs: strip(data.logs, []),
        settings: normalizeSettings2(data.settings)
      }, null, 2);
    }
    module.exports = {
      DAY_MS: DAY_MS2,
      NAME_CAP,
      SPEC_CAP,
      NOTE_CAP,
      UNIT_CAP,
      MAX_TIMES,
      FREQ_TYPES: FREQ_TYPES2,
      FORMS,
      RATE_WINDOW_DAYS,
      clip,
      idFor,
      randTag,
      dayKey: dayKey4,
      parseDayKey: parseDayKey2,
      timeToMin,
      minToTime,
      dayMinTs,
      dayDiff: dayDiff2,
      normalizeProfile: normalizeProfile2,
      normalizeMed: normalizeMed2,
      normalizeBatch: normalizeBatch2,
      normalizeFreq,
      normalizeRegimen: normalizeRegimen2,
      normalizeLog: normalizeLog2,
      normalizeSettings: normalizeSettings2,
      doseOccKey,
      parseOccKey: parseOccKey2,
      regimenDueOnDate,
      regimenOccurrencesOnDate,
      occurrencesForDate,
      todayPlan: todayPlan2,
      dosesProjection,
      stockForMed,
      regimenDailyRate,
      refillForecast,
      expiryBands,
      adherence: adherence2,
      FREQ_CN,
      WD_CN: WD_CN2,
      describeFreq,
      describeRegimen: describeRegimen2,
      exportAll: exportAll3
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState5 } from "react";

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
var PREFIX = "qingnang.";
var K = {
  profile: (id) => `${PREFIX}profile.${id}`,
  profilePrefix: `${PREFIX}profile.`,
  med: (id) => `${PREFIX}med.${id}`,
  medPrefix: `${PREFIX}med.`,
  batch: (id) => `${PREFIX}batch.${id}`,
  batchPrefix: `${PREFIX}batch.`,
  reg: (id) => `${PREFIX}reg.${id}`,
  regPrefix: `${PREFIX}reg.`,
  log: (occKey) => `${PREFIX}log.${occKey}`,
  logPrefix: `${PREFIX}log.`,
  settings: `${PREFIX}settings`,
  doses: `${PREFIX}doses`,
  stocks: `${PREFIX}stocks`,
  meta: `${PREFIX}meta`
};
function newCache() {
  return { knownKeys: null, fullAt: 0, entities: /* @__PURE__ */ new Map(), logVals: /* @__PURE__ */ new Map(), logsFullAt: 0 };
}
var FULL_REFRESH_MS = 90 * 1e3;
var LOG_WINDOW_DAYS = 8;
var SNAPSHOT_STALE_MS = 5 * 60 * 1e3;
var ENTITY_PREFIXES = [K.profilePrefix, K.medPrefix, K.batchPrefix, K.regPrefix];
function occKeyDate(occKey) {
  const i = occKey.indexOf("|");
  const rest = i >= 0 ? occKey.slice(i + 1) : "";
  const j = rest.indexOf("|");
  return j >= 0 ? rest.slice(0, j) : "";
}
async function loadQingnan(cache) {
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
  const windowStart = core.dayKey(now - (LOG_WINDOW_DAYS - 1) * core.DAY_MS);
  const logKeys = keys.filter((k) => k.startsWith(K.logPrefix) && occKeyDate(k.slice(K.logPrefix.length)) >= windowStart);
  const logKeySet = new Set(logKeys);
  for (const occ of [...cache.logVals.keys()]) {
    if (!logKeySet.has(K.log + occ)) cache.logVals.delete(occ);
  }
  const logsFull = now - cache.logsFullAt > FULL_REFRESH_MS;
  const logTodo = logKeys.filter((k) => logsFull || !cache.logVals.has(k.slice(K.logPrefix.length)));
  if (logTodo.length) {
    const fetched = await Promise.all(logTodo.map(async (k) => {
      const v = await kvGet(k).catch(() => null);
      return { k, v };
    }));
    for (const { k, v } of fetched) {
      const occ = k.slice(K.logPrefix.length);
      if (v && typeof v === "object" && v.occKey === occ) cache.logVals.set(occ, v);
      else if (!v) cache.logVals.delete(occ);
    }
  }
  if (logsFull) cache.logsFullAt = now;
  cache.knownKeys = keySet;
  const collect = (prefix) => [...cache.entities.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  const profiles = collect(K.profilePrefix);
  const meds = collect(K.medPrefix);
  const batches = collect(K.batchPrefix);
  const regimens = collect(K.regPrefix);
  const [dosesRaw, stocksRaw, settingsRaw, meta] = await Promise.all([
    kvGet(K.doses).catch(() => null),
    kvGet(K.stocks).catch(() => null),
    kvGet(K.settings).catch(() => null),
    kvGet(K.meta).catch(() => null)
  ]);
  return {
    profiles,
    meds,
    batches,
    regimens,
    logs: [...cache.logVals.values()],
    settings: core.normalizeSettings(settingsRaw),
    doses: dosesRaw && Array.isArray(dosesRaw.items) ? { at: dosesRaw.at || 0, date: dosesRaw.date || "", items: dosesRaw.items } : null,
    stocks: stocksRaw && typeof stocksRaw === "object" && Array.isArray(stocksRaw.refill) ? stocksRaw : null,
    meta: meta && typeof meta === "object" ? meta : null
  };
}
async function saveProfile(input, existing) {
  const r = core.normalizeProfile(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const p = r.profile;
  await kvSet(K.profile(p.id), p);
  return p;
}
async function saveMed(input, existing) {
  const r = core.normalizeMed(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const m = r.med;
  await kvSet(K.med(m.id), m);
  return m;
}
async function saveBatch(input, existing) {
  const r = core.normalizeBatch(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const b = r.batch;
  await kvSet(K.batch(b.id), b);
  return b;
}
async function saveRegimen(input, existing) {
  const r = core.normalizeRegimen(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const g = r.regimen;
  await kvSet(K.reg(g.id), g);
  return g;
}
async function markLog(reg, date, time, status, amount) {
  const r = core.normalizeLog({ regId: reg.id, date, time, status, amount }, reg, Date.now());
  if ("error" in r && r.error) throw new Error(r.error);
  if ("del" in r && r.del) {
    await kvDel(K.log(r.del));
    return;
  }
  const log = r.log;
  await kvSet(K.log(log.occKey), log);
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function deleteEntity(kind, id, purge, data) {
  if (kind === "profile") {
    const regs = data.regimens.filter((r) => r.profileId === id);
    if (regs.length && !purge) throw new Error(`\u8BE5\u6210\u5458\u4ECD\u6709 ${regs.length} \u4E2A\u7528\u836F\u65B9\u6848\uFF0C\u8BF7\u5148\u5220\u9664\u65B9\u6848\u6216\u9009\u62E9\u4E00\u5E76\u5220\u9664`);
    for (const r of regs) {
      await kvDel(K.reg(r.id));
      const keys2 = await kvKeys();
      for (const k of keys2.filter((k2) => k2.startsWith(K.logPrefix + r.id + "|"))) await kvDel(k);
    }
    await kvDel(K.profile(id));
    return;
  }
  if (kind === "med") {
    if (data.regimens.some((r) => r.medId === id) || data.batches.some((b) => b.medId === id)) {
      throw new Error("\u8BE5\u836F\u54C1\u4ECD\u6709\u65B9\u6848\u6216\u6279\u6B21\u5F15\u7528\uFF0C\u8BF7\u5148\u5220\u9664\u5B83\u4EEC");
    }
    await kvDel(K.med(id));
    return;
  }
  if (kind === "batch") {
    await kvDel(K.batch(id));
    return;
  }
  const keys = await kvKeys();
  const logKeys = keys.filter((k) => k.startsWith(K.logPrefix + id + "|"));
  for (const k of logKeys) await kvDel(k);
  await kvDel(K.reg(id));
}
async function serviceStatus(pluginId, serviceId) {
  const st = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  const arr = Array.isArray(st) ? st : [];
  const mine = arr.find((s) => s.pluginId === pluginId && s.serviceId === serviceId);
  if (!mine) return null;
  return { running: mine.status === "running" || mine.status === "starting", lastError: typeof mine.lastError === "string" ? mine.lastError : void 0 };
}
async function serviceStart(pluginId, serviceId) {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const plugins = r.plugins || [];
  const self = plugins.find((p) => p.id === pluginId);
  if (!self) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230\u81EA\u5DF1\uFF08\u91CD\u8BD5\u4E00\u6B21\uFF1B\u4ECD\u5931\u8D25\u8BF7\u91CD\u542F\u5E94\u7528\uFF09");
  const contributes = self.contributes || {};
  const svc = (contributes.services || []).find((s) => s.id === serviceId);
  if (!svc) throw new Error("\u6E05\u5355\u91CC\u627E\u4E0D\u5230\u670D\u52A1\u8D21\u732E\uFF08\u8BF7\u91CD\u88C5\u63D2\u4EF6\uFF09");
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType,
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
}
async function serviceStop(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "stop", pluginId, serviceId });
}
async function serviceRestart(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}
function exportAll2(data) {
  return core.exportAll(data);
}
var LOG_WINDOW_DAYS_CONST = LOG_WINDOW_DAYS;
var SNAPSHOT_STALE_MS_CONST = SNAPSHOT_STALE_MS;

// src/TodayTab.tsx
var core2 = __toESM(require_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var DAY = 864e5;
function fmtDate(d) {
  const ts = core2.parseDayKey(d);
  if (ts == null) return d;
  const dt = new Date(ts);
  const today = core2.dayKey(Date.now());
  if (d === today) return "\u4ECA\u5929";
  if (d === core2.dayKey(Date.now() + DAY)) return "\u660E\u5929";
  if (d === core2.dayKey(Date.now() - DAY)) return "\u6628\u5929";
  return `${dt.getMonth() + 1}\u6708${dt.getDate()}\u65E5 \u5468${core2.WD_CN[dt.getDay()]}`;
}
function TodayTab({ data, reload, showToast, onSendToChat }) {
  const [viewDate, setViewDate] = useState(() => core2.dayKey(Date.now()));
  const [busy, setBusy] = useState("");
  const today = core2.dayKey(Date.now());
  const isToday = viewDate === today;
  const plan = useMemo(() => {
    if (!data) return [];
    return core2.todayPlan({
      profiles: data.profiles,
      meds: data.meds,
      regimens: data.regimens,
      logs: data.logs,
      settings: data.settings
    }, viewDate, Date.now());
  }, [data, viewDate]);
  const bannerItems = useMemo(() => {
    if (!data || !isToday) return [];
    const out = [];
    for (const g of plan) {
      for (const it of g.items) {
        if (it.state === "now" || it.state === "overdue") {
          out.push({ occKey: it.occKey, label: `${g.profile.name} \xB7 ${it.time} ${it.medName} ${it.amount}${it.unit}`, state: it.state });
        }
      }
    }
    return out;
  }, [data, plan, isToday]);
  const prnRegimens = useMemo(() => {
    if (!data) return [];
    return data.regimens.filter((r) => r.active !== false && r.freq.type === "prn");
  }, [data]);
  async function log(regId, date, time, status, amount) {
    if (!data) return;
    const reg = data.regimens.find((r) => r.id === regId);
    if (!reg) {
      showToast("\u65B9\u6848\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u5220\u9664\uFF09", true);
      return;
    }
    setBusy(regId + date + time);
    try {
      await markLog(reg, date, time, status, amount);
      await reload();
      if (status === "taken") showToast("\u5DF2\u8BB0\u5F55\u3002\u5E93\u5B58\u5FEB\u7167\u51E0\u79D2\u5185\u81EA\u52A8\u66F4\u65B0");
      else if (status === "skip") showToast("\u5DF2\u8BB0\u8DF3\u8FC7");
      else showToast("\u5DF2\u64A4\u9500");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy("");
    }
  }
  if (!data) return /* @__PURE__ */ jsx("div", { className: "qn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  if (!data.profiles.length) {
    return /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("div", { className: "qn-card", children: /* @__PURE__ */ jsxs("div", { className: "qn-card-b qn-empty", children: [
      "\u5148\u5EFA\u4E00\u4E2A\u5BB6\u5EAD\u6210\u5458\uFF08\u81EA\u5DF1\u3001\u5BB6\u4EBA\u3001\u751A\u81F3\u5BA0\u7269\u90FD\u884C\uFF09",
      /* @__PURE__ */ jsx("br", {}),
      "\u7136\u540E\u300C\u65B9\u6848\u300D\u9875\u7ED9 TA \u6392\u4E0A\u7528\u836F\u8BA1\u5212\uFF0CAI \u4E5F\u80FD\u4E00\u53E5\u8BDD\u5E2E\u4F60\u5EFA\u597D\u3002",
      onSendToChat && /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx("button", { className: "qn-btn", onClick: () => onSendToChat("\u5E2E\u6211\u5EFA\u4E00\u4E2A\u5BB6\u5EAD\u6210\u5458\u6863\u6848\uFF1A\u6211\u81EA\u5DF1\u3002\u7136\u540E\u6211\u4F1A\u544A\u8BC9\u4F60\u7528\u836F\u8BA1\u5212\u3002"), children: "\u8BA9 AI \u5E2E\u6211\u5EFA" }) })
    ] }) }) });
  }
  const anyItems = plan.some((g) => g.items.length);
  const outOfWindow = Math.abs(core2.dayDiff(viewDate, today)) > 7;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qn-bar" }),
      fmtDate(viewDate),
      /* @__PURE__ */ jsxs("div", { className: "qn-hint qn-row", style: { gap: 4 }, children: [
        /* @__PURE__ */ jsx("button", { className: "qn-btn ghost sm", onClick: () => setViewDate(core2.dayKey(core2.parseDayKey(viewDate) - DAY)), children: "\u2039 \u524D\u4E00\u5929" }),
        !isToday && /* @__PURE__ */ jsx("button", { className: "qn-btn ghost sm", onClick: () => setViewDate(today), children: "\u56DE\u5230\u4ECA\u5929" }),
        core2.dayDiff(viewDate, today) < 0 && /* @__PURE__ */ jsx("button", { className: "qn-btn ghost sm", onClick: () => setViewDate(core2.dayKey(core2.parseDayKey(viewDate) + DAY)), children: "\u540E\u4E00\u5929 \u203A" })
      ] })
    ] }),
    outOfWindow && /* @__PURE__ */ jsx("div", { className: "qn-err", children: "\u8D85\u51FA\u8FD1 8 \u5929\u8BB0\u5F55\u7A97\u53E3\uFF1A\u66F4\u65E9\u7684\u6253\u5361\u72B6\u6001\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF08\u8865\u8BB0\u8BF7\u8BA9 AI \u7528 MCP \u5DE5\u5177\uFF09\u3002" }),
    bannerItems.length > 0 && /* @__PURE__ */ jsx("div", { className: "qn-card", style: { borderColor: "#54262c" }, children: /* @__PURE__ */ jsx("div", { className: "qn-card-b", children: bannerItems.map((b) => /* @__PURE__ */ jsxs("div", { className: "qn-row", style: { padding: "5px 0" }, children: [
      /* @__PURE__ */ jsx("span", { className: "qn-tag red", children: b.state === "now" ? "\u73B0\u5728\u8BE5\u5403" : "\u8FC7\u70B9\u672A\u670D" }),
      /* @__PURE__ */ jsx("span", { className: "qn-grow", style: { fontSize: 12.5 }, children: b.label }),
      /* @__PURE__ */ jsx("button", { className: "qn-btn ok sm", disabled: !!busy, onClick: () => {
        const p = core2.parseOccKey(b.occKey);
        if (p) log(p.regId, p.date, p.time, "taken");
      }, children: "\u5DF2\u670D" }),
      /* @__PURE__ */ jsx("button", { className: "qn-btn ghost sm", disabled: !!busy, onClick: () => {
        const p = core2.parseOccKey(b.occKey);
        if (p) log(p.regId, p.date, p.time, "skip");
      }, children: "\u8DF3\u8FC7" })
    ] }, b.occKey)) }) }),
    plan.map((g) => {
      const c = g.counts;
      const summary = g.items.length ? `\u2705${c.done} \u23ED${c.skip} \u{1F7E1}${c.now} \u{1F534}${c.overdue} \u23F3${c.upcoming}` : "";
      return /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "qn-sec", children: [
          /* @__PURE__ */ jsx("span", { className: "qn-bar", style: { background: g.profile.kind === "pet" ? "#C77B3F" : void 0 } }),
          g.profile.name,
          g.profile.kind === "pet" ? " \u{1F43E}" : "",
          /* @__PURE__ */ jsx("span", { className: "qn-hint", children: summary })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qn-card", children: [
          !g.items.length && /* @__PURE__ */ jsx("div", { className: "qn-card-b qn-sub", style: { padding: "10px 13px" }, children: "\u4ECA\u5929\u6CA1\u6709\u6392\u671F\u7528\u836F" }),
          g.items.map((it) => /* @__PURE__ */ jsxs("div", { className: "qn-row", style: { padding: "8px 13px", borderBottom: "1px solid #1d2330" }, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "#8B95A7", width: 42, flexShrink: 0 }, children: it.time }),
            /* @__PURE__ */ jsxs("span", { className: "qn-grow", style: { fontSize: 12.5 }, children: [
              it.medName,
              " ",
              /* @__PURE__ */ jsxs("span", { style: { color: "#8B95A7" }, children: [
                it.amount,
                it.unit
              ] }),
              it.note && /* @__PURE__ */ jsx("div", { className: "qn-sub", children: it.note })
            ] }),
            it.state === "done" && /* @__PURE__ */ jsx("span", { className: "qn-tag green", children: "\u5DF2\u670D" }),
            it.state === "skip" && /* @__PURE__ */ jsx("span", { className: "qn-tag", children: "\u5DF2\u8DF3\u8FC7" }),
            it.state === "now" && /* @__PURE__ */ jsx("span", { className: "qn-tag yellow", children: "\u73B0\u5728" }),
            it.state === "overdue" && /* @__PURE__ */ jsx("span", { className: "qn-tag red", children: "\u8FC7\u70B9" }),
            it.state === "upcoming" && /* @__PURE__ */ jsx("span", { className: "qn-tag", children: "\u672A\u5230\u70B9" }),
            it.state === "done" || it.state === "skip" ? /* @__PURE__ */ jsx("button", { className: "qn-btn ghost sm", disabled: !!busy, onClick: () => log(it.occKey.split("|")[0], viewDate, it.time, "none"), children: "\u64A4\u9500" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("button", { className: "qn-btn ok sm", disabled: !!busy, onClick: () => log(it.occKey.split("|")[0], viewDate, it.time, "taken"), children: "\u5DF2\u670D" }),
              /* @__PURE__ */ jsx("button", { className: "qn-btn ghost sm", disabled: !!busy, onClick: () => log(it.occKey.split("|")[0], viewDate, it.time, "skip"), children: "\u8DF3\u8FC7" })
            ] })
          ] }, it.occKey))
        ] })
      ] }, g.profile.id);
    }),
    !anyItems && /* @__PURE__ */ jsx("div", { className: "qn-card", children: /* @__PURE__ */ jsxs("div", { className: "qn-card-b qn-empty", children: [
      "\u4ECA\u5929\u5168\u5BB6\u90FD\u6CA1\u6709\u6392\u671F\u7528\u836F\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u53BB\u300C\u65B9\u6848\u300D\u9875\u6392\u4E00\u4E2A\uFF0C\u6216\u8BA9 AI \u4E00\u53E5\u8BDD\u641E\u5B9A\u3002"
    ] }) }),
    prnRegimens.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "qn-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "qn-bar", style: { background: "#8B95A7" } }),
        "\u9700\u8981\u65F6\u7528\u836F\uFF08\u6309\u9700\u8BB0\u4E00\u7B14\uFF09"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qn-card", children: /* @__PURE__ */ jsx("div", { className: "qn-card-b qn-row", style: { flexWrap: "wrap", gap: 6 }, children: prnRegimens.map((r) => {
        const med = data.meds.find((m) => m.id === r.medId);
        const prof = data.profiles.find((p) => p.id === r.profileId);
        const label = `${prof ? prof.name : "?"}\xB7${med ? med.name : "?"} ${r.dose}${med ? med.unit : ""}`;
        const t = `${String((/* @__PURE__ */ new Date()).getHours()).padStart(2, "0")}:${String((/* @__PURE__ */ new Date()).getMinutes()).padStart(2, "0")}`;
        return /* @__PURE__ */ jsx(
          "button",
          {
            className: "qn-btn ghost sm",
            disabled: !!busy,
            onClick: () => log(r.id, today, t, "taken"),
            title: "\u8BB0\u5F55\u4E00\u6B21\u5B9E\u9645\u670D\u7528\uFF08\u65F6\u523B=\u73B0\u5728\uFF09",
            children: label
          },
          r.id
        );
      }) }) })
    ] })
  ] });
}

// src/CabinetTab.tsx
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var URGENCY_LABEL = { low: "\u{1F6D2} \u9700\u8865\u8D27", watch: "\u{1F7E1} \u7559\u610F", ok: "\u{1F7E2} \u5145\u88D5", none: "" };
var FORM_LABEL = {
  tablet: "\u7247\u5242",
  capsule: "\u80F6\u56CA",
  granule: "\u9897\u7C92",
  liquid: "\u6DB2\u4F53",
  injection: "\u6CE8\u5C04",
  patch: "\u8D34\u5242",
  other: "\u5176\u4ED6"
};
function CabinetTab({ data, reload, showToast, pluginId }) {
  const [showAdd, setShowAdd] = useState2(false);
  const [expanded, setExpanded] = useState2("");
  const [restockFor, setRestockFor] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [confirmDel, setConfirmDel] = useState2("");
  const stale = useMemo2(() => {
    if (!data) return true;
    if (!data.stocks) return true;
    return Date.now() - data.stocks.at > SNAPSHOT_STALE_MS_CONST;
  }, [data]);
  const [form, setForm] = useState2({ name: "", spec: "", unit: "\u7247", formKind: "tablet", batchQty: "", batchExpiry: "" });
  const [restock, setRestock] = useState2({ qty: "", expiry: "" });
  async function addMed() {
    setBusy(true);
    try {
      const med = await saveMed({
        name: form.name,
        spec: form.spec,
        unit: form.unit,
        form: form.formKind
      }, null);
      if (form.batchQty !== "") {
        await saveBatch({ medId: med.id, qty: Number(form.batchQty), expiry: form.batchExpiry }, null);
      }
      showToast(`\u5DF2\u5EFA\u836F\u54C1\u300C${med.name}\u300D`);
      setForm({ name: "", spec: "", unit: "\u7247", formKind: "tablet", batchQty: "", batchExpiry: "" });
      setShowAdd(false);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function restockMed(med) {
    setBusy(true);
    try {
      await saveBatch({ medId: med.id, qty: Number(restock.qty), expiry: restock.expiry }, null);
      showToast(`\u5DF2\u5165\u5E93 ${restock.qty}${med.unit}`);
      setRestockFor("");
      setRestock({ qty: "", expiry: "" });
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function removeExpired(batchId) {
    if (confirmDel !== batchId) {
      setConfirmDel(batchId);
      setTimeout(() => setConfirmDel((c) => c === batchId ? "" : c), 4e3);
      return;
    }
    setBusy(true);
    try {
      await deleteEntity("batch", batchId, false, data);
      showToast("\u5DF2\u6E05\u7406\u8BE5\u6279\u6B21");
      setConfirmDel("");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "qn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const stocks = data.stocks;
  const alerts = stocks ? stocks.alerts : null;
  const expiredRows = (stocks ? stocks.expiry : []).filter((r) => r.band === "expired");
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "qn-bar" }),
      "\u836F\u7BB1\u603B\u89C8",
      /* @__PURE__ */ jsx2("span", { className: "qn-hint", children: stale ? "\u670D\u52A1\u5FEB\u7167\u7F3A\u5931/\u8FC7\u671F\uFF0C\u6570\u636E\u53EF\u80FD\u4E0D\u51C6" : `\u5FEB\u7167 ${new Date(stocks.at).toLocaleTimeString()}` })
    ] }),
    alerts && /* @__PURE__ */ jsx2("div", { className: "qn-card", children: /* @__PURE__ */ jsxs2("div", { className: "qn-card-b qn-row", style: { flexWrap: "wrap", gap: 6 }, children: [
      alerts.dueNow > 0 && /* @__PURE__ */ jsxs2("span", { className: "qn-tag yellow", children: [
        "\u73B0\u5728\u8BE5\u5403 ",
        alerts.dueNow
      ] }),
      alerts.overdue > 0 && /* @__PURE__ */ jsxs2("span", { className: "qn-tag red", children: [
        "\u8FC7\u70B9\u672A\u670D ",
        alerts.overdue
      ] }),
      alerts.lowStock > 0 && /* @__PURE__ */ jsxs2("span", { className: "qn-tag red", children: [
        "\u5F85\u8865\u8D27 ",
        alerts.lowStock
      ] }),
      alerts.expiredBatches > 0 && /* @__PURE__ */ jsxs2("span", { className: "qn-tag red", children: [
        "\u5DF2\u8FC7\u671F ",
        alerts.expiredBatches,
        " \u6279"
      ] }),
      alerts.soonExpiry > 0 && /* @__PURE__ */ jsxs2("span", { className: "qn-tag yellow", children: [
        "\u6548\u671F\u4E34\u8FD1 ",
        alerts.soonExpiry,
        " \u6279"
      ] }),
      alerts.dueNow + alerts.overdue + alerts.lowStock + alerts.expiredBatches + alerts.soonExpiry === 0 && /* @__PURE__ */ jsx2("span", { className: "qn-tag green", children: "\u4E00\u5207\u6B63\u5E38" })
    ] }) }),
    stocks && stocks.refill.length > 0 && /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { className: "qn-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "qn-bar" }),
        "\u8865\u8D27\u6E05\u5355",
        /* @__PURE__ */ jsx2("span", { className: "qn-hint", children: "\u6309\u6D88\u8017\u901F\u7387\u9884\u6D4B\uFF0C\u7D27\u7684\u5728\u524D" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "qn-card", children: stocks.refill.map((r) => /* @__PURE__ */ jsxs2("div", { className: "qn-row", style: { padding: "8px 13px", borderBottom: "1px solid #1d2330" }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "qn-grow", style: { fontSize: 12.5 }, children: [
          r.name,
          r.spec ? /* @__PURE__ */ jsxs2("span", { style: { color: "#8B95A7" }, children: [
            "\uFF08",
            r.spec,
            "\uFF09"
          ] }) : null,
          /* @__PURE__ */ jsxs2("div", { className: "qn-sub", children: [
            "\u5269 ",
            r.remaining,
            r.unit,
            r.daysLeft != null ? ` \xB7 \u7EA6\u591F ${r.daysLeft} \u5929` : "",
            r.ratePerDay > 0 ? ` \xB7 \u65E5\u5747 ${r.ratePerDay}${r.unit}${r.estimated ? "\uFF08\u6309\u65B9\u6848\u4F30\u7B97\uFF09" : ""}` : "",
            r.expired > 0 ? ` \xB7 \u8FC7\u671F ${r.expired}${r.unit}` : ""
          ] })
        ] }),
        URGENCY_LABEL[r.urgency] && /* @__PURE__ */ jsx2("span", { className: `qn-tag ${r.urgency === "low" ? "red" : r.urgency === "watch" ? "yellow" : "green"}`, children: URGENCY_LABEL[r.urgency] })
      ] }, r.medId)) })
    ] }),
    expiredRows.length > 0 && /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { className: "qn-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "qn-bar", style: { background: "#F85149" } }),
        "\u5DF2\u8FC7\u671F\u5F85\u6E05\u7406"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "qn-card", children: expiredRows.map((r) => /* @__PURE__ */ jsxs2("div", { className: "qn-row", style: { padding: "8px 13px", borderBottom: "1px solid #1d2330" }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "qn-grow", style: { fontSize: 12.5 }, children: [
          r.medName,
          " ",
          /* @__PURE__ */ jsxs2("span", { className: "qn-sub", children: [
            "\u6548\u671F ",
            r.expiry,
            "\uFF08\u8FC7\u671F ",
            -r.daysLeft,
            " \u5929\uFF09\xB7 \u5269 ",
            r.qty,
            r.unit
          ] })
        ] }),
        /* @__PURE__ */ jsx2("button", { className: "qn-btn danger sm", disabled: busy, onClick: () => removeExpired(r.batchId), children: confirmDel === r.batchId ? "\u518D\u70B9\u786E\u8BA4" : "\u6E05\u7406" })
      ] }, r.batchId)) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "qn-bar" }),
      "\u5168\u90E8\u836F\u54C1\uFF08",
      data.meds.length,
      "\uFF09",
      /* @__PURE__ */ jsx2("button", { className: "qn-hint qn-btn ghost sm", onClick: () => setShowAdd(!showAdd), children: showAdd ? "\u6536\u8D77" : "+ \u65B0\u836F\u5165\u5E93" })
    ] }),
    showAdd && /* @__PURE__ */ jsx2("div", { className: "qn-card", children: /* @__PURE__ */ jsxs2("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsx2("label", { className: "qn-lbl", children: "\u836F\u54C1\u540D\u79F0 *" }),
      /* @__PURE__ */ jsx2("input", { className: "qn-inp", value: form.name, placeholder: "\u5982 \u5E03\u6D1B\u82AC\u7F13\u91CA\u80F6\u56CA", onChange: (e) => setForm({ ...form, name: e.target.value }) }),
      /* @__PURE__ */ jsx2("label", { className: "qn-lbl", children: "\u89C4\u683C" }),
      /* @__PURE__ */ jsx2("input", { className: "qn-inp", value: form.spec, placeholder: "\u5982 0.3g\xD720\u7C92", onChange: (e) => setForm({ ...form, spec: e.target.value }) }),
      /* @__PURE__ */ jsxs2("div", { className: "qn-row", children: [
        /* @__PURE__ */ jsxs2("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx2("label", { className: "qn-lbl", children: "\u5242\u578B" }),
          /* @__PURE__ */ jsx2("select", { className: "qn-sel", value: form.formKind, onChange: (e) => setForm({ ...form, formKind: e.target.value }), children: Object.entries(FORM_LABEL).map(([k, v]) => /* @__PURE__ */ jsx2("option", { value: k, children: v }, k)) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { style: { width: 90 }, children: [
          /* @__PURE__ */ jsx2("label", { className: "qn-lbl", children: "\u5355\u4F4D *" }),
          /* @__PURE__ */ jsx2("input", { className: "qn-inp", value: form.unit, placeholder: "\u7247/\u7C92/\u888B", onChange: (e) => setForm({ ...form, unit: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "qn-row", children: [
        /* @__PURE__ */ jsxs2("div", { style: { width: "45%" }, children: [
          /* @__PURE__ */ jsx2("label", { className: "qn-lbl", children: "\u9996\u6279\u6570\u91CF\uFF08\u53EF\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "qn-inp", value: form.batchQty, placeholder: "\u5982 24", inputMode: "decimal", onChange: (e) => setForm({ ...form, batchQty: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx2("label", { className: "qn-lbl", children: "\u6548\u671F\uFF08\u53EF\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "qn-inp", value: form.batchExpiry, placeholder: "YYYY-MM-DD", onChange: (e) => setForm({ ...form, batchExpiry: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2("button", { className: "qn-btn", disabled: busy || !form.name.trim(), onClick: addMed, children: "\u5165\u5E93" }) })
    ] }) }),
    !data.meds.length && !showAdd && /* @__PURE__ */ jsx2("div", { className: "qn-card", children: /* @__PURE__ */ jsx2("div", { className: "qn-card-b qn-empty", children: "\u836F\u7BB1\u8FD8\u662F\u7A7A\u7684\u3002\u628A\u5BB6\u91CC\u5E38\u5907\u836F\u767B\u8BB0\u8FDB\u6765\uFF0C\u6548\u671F\u548C\u5B58\u91CF\u9752\u56CA\u66FF\u4F60\u76EF\u7740\u3002" }) }),
    data.meds.map((med) => {
      const st = stocks ? stocks.meds[med.id] : null;
      const isOpen = expanded === med.id;
      return /* @__PURE__ */ jsxs2("div", { className: "qn-card", children: [
        /* @__PURE__ */ jsxs2("div", { className: "qn-row", style: { padding: "10px 13px", cursor: "pointer" }, onClick: () => setExpanded(isOpen ? "" : med.id), children: [
          /* @__PURE__ */ jsxs2("span", { className: "qn-grow", children: [
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 13, fontWeight: 600 }, children: med.name }),
            med.spec && /* @__PURE__ */ jsxs2("span", { className: "qn-sub", children: [
              " ",
              med.spec
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "qn-sub", children: [
              st ? `\u5269 ${st.totalUsable}${med.unit}${st.daysLeft != null ? ` \xB7 \u7EA6\u591F ${st.daysLeft} \u5929` : ""}` : "\u5E93\u5B58\u5F85\u670D\u52A1\u5FEB\u7167",
              st && st.totalExpired > 0 ? ` \xB7 \u8FC7\u671F ${st.totalExpired}${med.unit}` : "",
              st && st.over ? " \xB7 \u26A0\u6D88\u8017\u8D85\u8D26\u9762" : ""
            ] })
          ] }),
          st && URGENCY_LABEL[st.urgency] && /* @__PURE__ */ jsx2("span", { className: `qn-tag ${st.urgency === "low" ? "red" : st.urgency === "watch" ? "yellow" : "green"}`, children: URGENCY_LABEL[st.urgency] }),
          /* @__PURE__ */ jsx2("span", { className: "qn-sub", children: isOpen ? "\u6536\u8D77 \u25B4" : "\u660E\u7EC6 \u25BE" })
        ] }),
        isOpen && /* @__PURE__ */ jsxs2("div", { style: { borderTop: "1px solid #1d2330", padding: "8px 13px" }, children: [
          st && st.batches.map((b) => /* @__PURE__ */ jsxs2("div", { className: "qn-row", style: { padding: "4px 0", fontSize: 12 }, children: [
            /* @__PURE__ */ jsxs2("span", { className: "qn-grow", children: [
              "\u6279\u6B21 ",
              b.qty,
              med.unit,
              " \u2192 \u5269 ",
              /* @__PURE__ */ jsxs2("b", { children: [
                b.remaining,
                med.unit
              ] }),
              b.expiry ? ` \xB7 \u6548\u671F ${b.expiry}` : " \xB7 \u672A\u767B\u8BB0\u6548\u671F",
              b.note ? /* @__PURE__ */ jsxs2("span", { className: "qn-sub", children: [
                " ",
                b.note
              ] }) : null
            ] }),
            b.expired && /* @__PURE__ */ jsx2("span", { className: "qn-tag red", children: "\u8FC7\u671F" })
          ] }, b.id)),
          st && !st.batches.length && /* @__PURE__ */ jsx2("div", { className: "qn-sub", style: { padding: "4px 0" }, children: "\u8FD8\u6CA1\u6709\u6279\u6B21\u767B\u8BB0\u2014\u2014\u70B9\u300C\u8865\u8D27\u300D\u5F55\u4E00\u76D2\u3002" }),
          restockFor === med.id ? /* @__PURE__ */ jsxs2("div", { className: "qn-row", style: { marginTop: 8, flexWrap: "wrap", gap: 6 }, children: [
            /* @__PURE__ */ jsx2("input", { className: "qn-inp", style: { width: 80 }, placeholder: "\u6570\u91CF", value: restock.qty, inputMode: "decimal", onChange: (e) => setRestock({ ...restock, qty: e.target.value }) }),
            /* @__PURE__ */ jsx2("input", { className: "qn-inp", style: { width: 120 }, placeholder: "\u6548\u671F YYYY-MM-DD", value: restock.expiry, onChange: (e) => setRestock({ ...restock, expiry: e.target.value }) }),
            /* @__PURE__ */ jsx2("button", { className: "qn-btn sm", disabled: busy || !restock.qty, onClick: () => restockMed(med), children: "\u786E\u8BA4\u5165\u5E93" }),
            /* @__PURE__ */ jsx2("button", { className: "qn-btn ghost sm", onClick: () => setRestockFor(""), children: "\u53D6\u6D88" })
          ] }) : /* @__PURE__ */ jsx2("div", { className: "qn-row", style: { marginTop: 8, gap: 6 }, children: /* @__PURE__ */ jsx2("button", { className: "qn-btn sm", onClick: () => {
            setRestockFor(med.id);
            setRestock({ qty: "", expiry: "" });
          }, children: "\u8865\u8D27\u5165\u5E93" }) }),
          med.note && /* @__PURE__ */ jsx2("div", { className: "qn-sub", style: { marginTop: 6 }, children: med.note })
        ] })
      ] }, med.id);
    })
  ] });
}

// src/PlansTab.tsx
var core3 = __toESM(require_core());
import { useMemo as useMemo3, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var FREQ_TYPES = [
  ["daily", "\u6BCF\u5929"],
  ["weekly", "\u6BCF\u5468\u51E0"],
  ["interval", "\u6BCF N \u5929"],
  ["cycle", "\u5403 N \u505C M"],
  ["prn", "\u9700\u8981\u65F6\uFF08prn\uFF09"]
];
var WD = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
function emptyForm() {
  return {
    profileId: "",
    medId: "",
    dose: "1",
    times: "08:00",
    freqType: "daily",
    weekdays: [],
    intervalDays: "7",
    onDays: "21",
    offDays: "7",
    startDate: core3.dayKey(Date.now()),
    endDate: "",
    note: ""
  };
}
function formToInput(f) {
  const freq = { type: f.freqType };
  if (f.freqType === "weekly") freq.weekdays = f.weekdays;
  if (f.freqType === "interval") freq.intervalDays = Number(f.intervalDays);
  if (f.freqType === "cycle") {
    freq.onDays = Number(f.onDays);
    freq.offDays = Number(f.offDays);
  }
  return {
    profileId: f.profileId,
    medId: f.medId,
    dose: Number(f.dose),
    times: f.times.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
    freq,
    startDate: f.startDate,
    endDate: f.endDate || void 0,
    note: f.note
  };
}
function PlansTab({ data, reload, showToast, pluginId }) {
  const [filter, setFilter] = useState3("");
  const [editing, setEditing] = useState3(null);
  const [showForm, setShowForm] = useState3(false);
  const [form, setForm] = useState3(emptyForm());
  const [busy, setBusy] = useState3(false);
  const [confirmDel, setConfirmDel] = useState3("");
  const adherenceByReg = useMemo3(() => {
    if (!data) return /* @__PURE__ */ new Map();
    const ctx = { profiles: data.profiles, meds: data.meds, regimens: data.regimens, logs: data.logs, settings: data.settings };
    const map = /* @__PURE__ */ new Map();
    for (const r of data.regimens) map.set(r.id, core3.adherence({ ...ctx, regimens: [r] }, null, Date.now(), 7));
    return map;
  }, [data]);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "qn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const meds = data.meds;
  const regs = data.regimens.filter((r) => !filter || r.profileId === filter).sort((a, b) => a.active === b.active ? a.startDate < b.startDate ? 1 : -1 : a.active === false ? 1 : -1);
  const medById = new Map(meds.map((m) => [m.id, m]));
  const profById = new Map(data.profiles.map((p) => [p.id, p]));
  function openEdit(r) {
    if (r) {
      setForm({
        profileId: r.profileId,
        medId: r.medId,
        dose: String(r.dose),
        times: r.times.join(","),
        freqType: r.freq.type,
        weekdays: r.freq.weekdays ? [...r.freq.weekdays] : [],
        intervalDays: String(r.freq.intervalDays || 7),
        onDays: String(r.freq.onDays || 21),
        offDays: String(r.freq.offDays || 7),
        startDate: r.startDate,
        endDate: r.endDate || "",
        note: r.note
      });
      setEditing(r);
    } else {
      setForm(emptyForm());
      setEditing(null);
    }
    setShowForm(true);
  }
  async function submit() {
    setBusy(true);
    try {
      const saved = await saveRegimen(formToInput(form), editing);
      showToast(editing ? "\u65B9\u6848\u5DF2\u66F4\u65B0" : "\u65B9\u6848\u5DF2\u5EFA\u7ACB");
      setShowForm(false);
      setEditing(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive(r) {
    setBusy(true);
    try {
      await saveRegimen({ active: !r.active }, r);
      showToast(r.active ? "\u5DF2\u505C\u7528\uFF08\u4FDD\u7559\u5386\u53F2\uFF09" : "\u5DF2\u542F\u7528");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(r) {
    if (confirmDel !== r.id) {
      setConfirmDel(r.id);
      setTimeout(() => setConfirmDel((c) => c === r.id ? "" : c), 4e3);
      return;
    }
    setBusy(true);
    try {
      await deleteEntity("regimen", r.id, false, data);
      showToast("\u5DF2\u5220\u9664\u65B9\u6848\u53CA\u5176\u6253\u5361\u8BB0\u5F55");
      setConfirmDel("");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  if (!data.profiles.length && !showForm) {
    return /* @__PURE__ */ jsx3("div", { children: /* @__PURE__ */ jsx3("div", { className: "qn-card", children: /* @__PURE__ */ jsx3("div", { className: "qn-card-b qn-empty", children: "\u5148\u5230\u300C\u8BBE\u7F6E\u300D\u9875\u5EFA\u5BB6\u5EAD\u6210\u5458\uFF0C\u518D\u6765\u6392\u7528\u836F\u65B9\u6848\u3002" }) }) });
  }
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "qn-bar" }),
      "\u7528\u836F\u65B9\u6848\uFF08",
      regs.length,
      "\uFF09",
      /* @__PURE__ */ jsx3("button", { className: "qn-hint qn-btn ghost sm", onClick: () => openEdit(null), children: "\uFF0B \u65B0\u65B9\u6848" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "qn-card", children: /* @__PURE__ */ jsxs3("div", { className: "qn-card-b qn-row", style: { flexWrap: "wrap", gap: 6 }, children: [
      /* @__PURE__ */ jsx3("button", { className: `qn-btn sm ${filter === "" ? "" : "ghost"}`, onClick: () => setFilter(""), children: "\u5168\u90E8" }),
      data.profiles.map((p) => /* @__PURE__ */ jsxs3("button", { className: `qn-btn sm ${filter === p.id ? "" : "ghost"}`, onClick: () => setFilter(p.id), children: [
        p.name,
        p.kind === "pet" ? " \u{1F43E}" : ""
      ] }, p.id))
    ] }) }),
    showForm && /* @__PURE__ */ jsx3("div", { className: "qn-card", children: /* @__PURE__ */ jsxs3("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "qn-row", children: [
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u8C01\u5728\u5403 *" }),
          /* @__PURE__ */ jsxs3("select", { className: "qn-sel", value: form.profileId, onChange: (e) => setForm({ ...form, profileId: e.target.value }), children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009\u62E9\u6210\u5458\u2026" }),
            data.profiles.map((p) => /* @__PURE__ */ jsx3("option", { value: p.id, children: p.name }, p.id))
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u5403\u4EC0\u4E48\u836F *" }),
          /* @__PURE__ */ jsxs3("select", { className: "qn-sel", value: form.medId, onChange: (e) => setForm({ ...form, medId: e.target.value }), children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009\u62E9\u836F\u54C1\u2026" }),
            meds.map((m) => /* @__PURE__ */ jsxs3("option", { value: m.id, children: [
              m.name,
              m.spec ? `\uFF08${m.spec}\uFF09` : ""
            ] }, m.id))
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "qn-row", children: [
        /* @__PURE__ */ jsxs3("div", { style: { width: 110 }, children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u6BCF\u6B21\u5242\u91CF *" }),
          /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.dose, inputMode: "decimal", onChange: (e) => setForm({ ...form, dose: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u670D\u836F\u65F6\u523B\uFF08\u9017\u53F7\u5206\u9694 HH:MM\uFF1Bprn \u53EF\u7559\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.times, placeholder: "08:00, 20:00", onChange: (e) => setForm({ ...form, times: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u9891\u6B21" }),
      /* @__PURE__ */ jsx3("select", { className: "qn-sel", value: form.freqType, onChange: (e) => setForm({ ...form, freqType: e.target.value }), children: FREQ_TYPES.map(([k, v]) => /* @__PURE__ */ jsx3("option", { value: k, children: v }, k)) }),
      form.freqType === "weekly" && /* @__PURE__ */ jsx3("div", { className: "qn-row", style: { marginTop: 6, gap: 4 }, children: WD.map((w, i) => /* @__PURE__ */ jsx3(
        "button",
        {
          className: `qn-btn sm ${form.weekdays.includes(i) ? "" : "ghost"}`,
          onClick: () => setForm({ ...form, weekdays: form.weekdays.includes(i) ? form.weekdays.filter((x) => x !== i) : [...form.weekdays, i].sort() }),
          children: w
        },
        i
      )) }),
      form.freqType === "interval" && /* @__PURE__ */ jsxs3("div", { style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u95F4\u9694\u5929\u6570\uFF082-365\uFF09" }),
        /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.intervalDays, inputMode: "numeric", onChange: (e) => setForm({ ...form, intervalDays: e.target.value }) })
      ] }),
      form.freqType === "cycle" && /* @__PURE__ */ jsxs3("div", { className: "qn-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u5403\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.onDays, inputMode: "numeric", onChange: (e) => setForm({ ...form, onDays: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u505C\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.offDays, inputMode: "numeric", onChange: (e) => setForm({ ...form, offDays: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "qn-row", style: { marginTop: 4 }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u5F00\u59CB\u65E5\u671F *" }),
          /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.startDate, placeholder: "YYYY-MM-DD", onChange: (e) => setForm({ ...form, startDate: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u7ED3\u675F\u65E5\u671F\uFF08\u7597\u7A0B\u836F\u586B\uFF0C\u957F\u671F\u7559\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.endDate, placeholder: "YYYY-MM-DD", onChange: (e) => setForm({ ...form, endDate: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("label", { className: "qn-lbl", children: "\u5907\u6CE8\uFF08\u5982\u300C\u996D\u540E\u5403\u300D\u2014\u2014\u4EC5\u8BB0\u5F55\uFF0C\u4E0D\u6784\u6210\u533B\u7597\u5EFA\u8BAE\uFF09" }),
      /* @__PURE__ */ jsx3("input", { className: "qn-inp", value: form.note, onChange: (e) => setForm({ ...form, note: e.target.value }) }),
      /* @__PURE__ */ jsxs3("div", { className: "qn-row", style: { marginTop: 10, gap: 8 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "qn-btn", disabled: busy || !form.profileId || !form.medId, onClick: submit, children: editing ? "\u4FDD\u5B58\u4FEE\u6539" : "\u5EFA\u7ACB\u65B9\u6848" }),
        /* @__PURE__ */ jsx3("button", { className: "qn-btn ghost", onClick: () => {
          setShowForm(false);
          setEditing(null);
        }, children: "\u53D6\u6D88" })
      ] })
    ] }) }),
    !regs.length && !showForm && /* @__PURE__ */ jsx3("div", { className: "qn-card", children: /* @__PURE__ */ jsx3("div", { className: "qn-card-b qn-empty", children: data.meds.length ? "\u8FD8\u6CA1\u6709\u7528\u836F\u65B9\u6848\u3002\u70B9\u300C\uFF0B \u65B0\u65B9\u6848\u300D\u6392\u4E00\u4E2A\uFF0C\u6216\u8BA9 AI \u4E00\u53E5\u8BDD\u641E\u5B9A\u3002" : "\u836F\u7BB1\u91CC\u8FD8\u6CA1\u6709\u836F\u2014\u2014\u5148\u5230\u300C\u836F\u7BB1\u300D\u9875\u767B\u8BB0\u836F\u54C1\u3002" }) }),
    regs.map((r) => {
      const med = medById.get(r.medId);
      const prof = profById.get(r.profileId);
      const adh = adherenceByReg.get(r.id);
      return /* @__PURE__ */ jsxs3("div", { className: "qn-card", children: [
        /* @__PURE__ */ jsxs3("div", { className: "qn-row", style: { padding: "10px 13px" }, children: [
          /* @__PURE__ */ jsxs3("span", { className: "qn-grow", children: [
            /* @__PURE__ */ jsxs3("span", { style: { fontSize: 12.5, fontWeight: 600 }, children: [
              prof ? prof.name : "?",
              " \xB7 ",
              med ? med.name : "?"
            ] }),
            /* @__PURE__ */ jsx3("div", { className: "qn-sub", children: core3.describeRegimen(r, med) }),
            r.note && /* @__PURE__ */ jsxs3("div", { className: "qn-sub", children: [
              "\u{1F4DD} ",
              r.note
            ] })
          ] }),
          /* @__PURE__ */ jsx3("span", { className: `qn-tag ${r.active === false ? "" : "blue"}`, children: r.active === false ? "\u5DF2\u505C" : "\u8FDB\u884C\u4E2D" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "qn-row", style: { padding: "0 13px 10px", gap: 6 }, children: [
          adh && adh.rate != null && /* @__PURE__ */ jsxs3("span", { className: `qn-tag ${adh.rate >= 80 ? "green" : adh.rate >= 50 ? "yellow" : "red"}`, children: [
            "\u8FD17\u5929\u4F9D\u4ECE ",
            adh.rate,
            "%\uFF08",
            adh.taken,
            "/",
            adh.decided,
            adh.missed ? ` \u6F0F${adh.missed}` : "",
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx3("button", { className: "qn-btn ghost sm", disabled: busy, onClick: () => toggleActive(r), children: r.active === false ? "\u542F\u7528" : "\u505C\u7528" }),
          /* @__PURE__ */ jsx3("button", { className: "qn-btn ghost sm", disabled: busy, onClick: () => openEdit(r), children: "\u7F16\u8F91" }),
          /* @__PURE__ */ jsx3("button", { className: "qn-btn danger sm", disabled: busy, onClick: () => remove(r), children: confirmDel === r.id ? "\u518D\u70B9\u786E\u8BA4(\u8FDE\u5E26\u5220\u6253\u5361)" : "\u5220\u9664" })
        ] })
      ] }, r.id);
    })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var SERVICE_ID = "qingnang-service";
function SettingsTab({ data, reload, showToast, pluginId, onSendToChat }) {
  const [pf, setPf] = useState4({ name: "", kind: "human", note: "" });
  const [editPf, setEditPf] = useState4(null);
  const [confirmDel, setConfirmDel] = useState4("");
  const [busy, setBusy] = useState4(false);
  const [svc, setSvc] = useState4(null);
  async function checkService() {
    try {
      const st = await serviceStatus("qingnang", SERVICE_ID);
      setSvc(st);
      return st;
    } catch (e) {
      setSvc({ running: false, lastError: e.message });
      return null;
    }
  }
  async function submitProfile() {
    setBusy(true);
    try {
      const saved = await saveProfile({ name: pf.name, kind: pf.kind, note: pf.note }, editPf);
      showToast(editPf ? "\u6210\u5458\u5DF2\u66F4\u65B0" : `\u5DF2\u5EFA\u6863\u300C${saved.name}\u300D`);
      setPf({ name: "", kind: "human", note: "" });
      setEditPf(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function removeProfile(p) {
    if (confirmDel !== p.id) {
      setConfirmDel(p.id);
      setTimeout(() => setConfirmDel((c) => c === p.id ? "" : c), 4e3);
      return;
    }
    setBusy(true);
    try {
      await deleteEntity("profile", p.id, true, data);
      showToast(`\u5DF2\u5220\u9664\u300C${p.name}\u300D\u53CA\u5176\u65B9\u6848\u4E0E\u6253\u5361\u8BB0\u5F55`);
      setConfirmDel("");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function saveS(patch) {
    if (!data) return;
    try {
      await saveSettings({ ...data.settings, ...patch });
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  function doExport() {
    if (!data) return;
    const blob = new Blob([exportAll2(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qingnang-export-${core_dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5e3);
  }
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "qn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.settings;
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qn-bar" }),
      "\u5BB6\u5EAD\u6210\u5458\uFF08",
      data.profiles.length,
      "\uFF09"
    ] }),
    data.profiles.map((p) => /* @__PURE__ */ jsx4("div", { className: "qn-card", children: /* @__PURE__ */ jsxs4("div", { className: "qn-row", style: { padding: "9px 13px" }, children: [
      /* @__PURE__ */ jsxs4("span", { className: "qn-grow", children: [
        /* @__PURE__ */ jsxs4("span", { style: { fontSize: 12.5, fontWeight: 600 }, children: [
          p.name,
          p.kind === "pet" ? " \u{1F43E}" : ""
        ] }),
        p.note && /* @__PURE__ */ jsx4("div", { className: "qn-sub", children: p.note })
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "qn-btn ghost sm", onClick: () => {
        setEditPf(p);
        setPf({ name: p.name, kind: p.kind, note: p.note });
      }, children: "\u7F16\u8F91" }),
      /* @__PURE__ */ jsx4("button", { className: "qn-btn danger sm", disabled: busy, onClick: () => removeProfile(p), children: confirmDel === p.id ? "\u518D\u70B9\u786E\u8BA4" : "\u5220\u9664" })
    ] }) }, p.id)),
    /* @__PURE__ */ jsx4("div", { className: "qn-card", children: /* @__PURE__ */ jsxs4("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsxs4("label", { className: "qn-lbl", children: [
        editPf ? `\u7F16\u8F91\u300C${editPf.name}\u300D` : "\u65B0\u6210\u5458",
        "\uFF1A\u540D\u79F0 *"
      ] }),
      /* @__PURE__ */ jsx4("input", { className: "qn-inp", value: pf.name, placeholder: "\u5982 \u6211 / \u5988\u5988 / \u65FA\u8D22", onChange: (e) => setPf({ ...pf, name: e.target.value }) }),
      /* @__PURE__ */ jsxs4("div", { className: "qn-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs4("div", { style: { width: 120 }, children: [
          /* @__PURE__ */ jsx4("label", { className: "qn-lbl", children: "\u7C7B\u578B" }),
          /* @__PURE__ */ jsxs4("select", { className: "qn-sel", value: pf.kind, onChange: (e) => setPf({ ...pf, kind: e.target.value }), children: [
            /* @__PURE__ */ jsx4("option", { value: "human", children: "\u4EBA" }),
            /* @__PURE__ */ jsx4("option", { value: "pet", children: "\u5BA0\u7269" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx4("label", { className: "qn-lbl", children: "\u5907\u6CE8\uFF08\u5982\u300C\u9AD8\u8840\u538B\uFF0C\u9075\u533B\u5631\u300D\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "qn-inp", value: pf.note, onChange: (e) => setPf({ ...pf, note: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qn-row", style: { marginTop: 10, gap: 8 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "qn-btn", disabled: busy || !pf.name.trim(), onClick: submitProfile, children: editPf ? "\u4FDD\u5B58" : "\u5EFA\u6863" }),
        editPf && /* @__PURE__ */ jsx4("button", { className: "qn-btn ghost", onClick: () => {
          setEditPf(null);
          setPf({ name: "", kind: "human", note: "" });
        }, children: "\u53D6\u6D88\u7F16\u8F91" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qn-bar" }),
      "\u63D0\u9192\u4E0E\u9884\u8B66"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qn-card", children: /* @__PURE__ */ jsxs4("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "qn-row", children: [
        /* @__PURE__ */ jsxs4("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx4("label", { className: "qn-lbl", children: "\u5230\u70B9\u5BBD\u9650\uFF08\u5206\u949F\uFF09\uFF1A\u5BBD\u9650\u5185\u7B97\u300C\u73B0\u5728\u8BE5\u5403\u300D\uFF0C\u8FC7\u4E86\u7B97\u300C\u8FC7\u70B9\u672A\u670D\u300D" }),
          /* @__PURE__ */ jsx4("input", { className: "qn-inp", defaultValue: String(s.graceMin), inputMode: "numeric", onBlur: (e) => {
            const v = Number(e.target.value);
            if (v !== s.graceMin) saveS({ graceMin: v });
          } })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "qn-grow", children: [
          /* @__PURE__ */ jsx4("label", { className: "qn-lbl", children: "\u8865\u8D27\u9884\u8B66\uFF08\u5269\u4F59\u53EF\u7528\u5929\u6570 \u2264 \u6B64\u503C\u65F6\u4EAE\u7EA2\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "qn-inp", defaultValue: String(s.lowDays), inputMode: "numeric", onBlur: (e) => {
            const v = Number(e.target.value);
            if (v !== s.lowDays) saveS({ lowDays: v });
          } })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("label", { className: "qn-lbl", children: "\u6548\u671F\u9884\u8B66\uFF08\u63D0\u524D\u5929\u6570\uFF0C\u8FDB\u5165\u9EC4\u699C\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "qn-inp", style: { width: 140 }, defaultValue: String(s.expiryWarnDays), inputMode: "numeric", onBlur: (e) => {
        const v = Number(e.target.value);
        if (v !== s.expiryWarnDays) saveS({ expiryWarnDays: v });
      } }),
      /* @__PURE__ */ jsx4("div", { className: "qn-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsxs4("label", { className: "qn-sub", style: { cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: s.soundOn !== false, onChange: (e) => saveS({ soundOn: e.target.checked }) }),
        " \u5230\u70B9\u64AD\u653E\u63D0\u793A\u97F3\uFF08\u9762\u677F\u5185\uFF09"
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qn-bar" }),
      "\u540E\u53F0\u670D\u52A1",
      /* @__PURE__ */ jsx4("button", { className: "qn-hint qn-btn ghost sm", onClick: () => checkService(), children: "\u67E5\u72B6\u6001" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qn-card", children: /* @__PURE__ */ jsxs4("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "qn-sub", children: [
        "\u5FC3\u8DF3\uFF1A",
        data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < 18e4 ? `\u5728\u7EBF\uFF08pid ${data.meta.pid}\uFF0C\u6865 ${data.meta.bridge}\uFF0C\u6295\u5F71 ${data.meta.counts ? `${data.meta.counts.regimens} \u65B9\u6848 / ${data.meta.counts.logs} \u6761\u8BB0\u5F55` : ""}\uFF09` : "\u672A\u6536\u5230\u5FC3\u8DF3\u2014\u2014\u670D\u52A1\u672A\u542F\u52A8\u6216\u5DF2\u505C\u6B62"
      ] }),
      svc && !svc.running && /* @__PURE__ */ jsxs4("div", { className: "qn-sub", style: { color: "#E3B341" }, children: [
        "\u5BBF\u4E3B\u4FA7\u72B6\u6001\uFF1A\u672A\u8FD0\u884C",
        svc.lastError ? ` \xB7 ${svc.lastError}` : ""
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "qn-row", style: { marginTop: 8, gap: 6 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "qn-btn sm", disabled: busy, onClick: async () => {
          setBusy(true);
          try {
            await serviceStart("qingnang", SERVICE_ID);
            showToast("\u542F\u52A8\u547D\u4EE4\u5DF2\u53D1\u51FA");
            await checkService();
          } catch (e) {
            showToast(e.message, true);
          } finally {
            setBusy(false);
          }
        }, children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { className: "qn-btn ghost sm", disabled: busy, onClick: async () => {
          setBusy(true);
          try {
            await serviceRestart("qingnang", SERVICE_ID);
            showToast("\u91CD\u542F\u547D\u4EE4\u5DF2\u53D1\u51FA");
            await checkService();
          } catch (e) {
            showToast(e.message, true);
          } finally {
            setBusy(false);
          }
        }, children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx4("button", { className: "qn-btn ghost sm", disabled: busy, onClick: async () => {
          setBusy(true);
          try {
            await serviceStop("qingnang", SERVICE_ID);
            showToast("\u5DF2\u505C\u6B62");
            await checkService();
          } catch (e) {
            showToast(e.message, true);
          } finally {
            setBusy(false);
          }
        }, children: "\u505C\u6B62" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "qn-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "qn-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "qn-card", children: /* @__PURE__ */ jsxs4("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsxs4("button", { className: "qn-btn ghost sm", onClick: doExport, children: [
        "\u5BFC\u51FA JSON\uFF08\u8FD1 ",
        LOG_WINDOW_DAYS_CONST,
        " \u5929\u6253\u5361 + \u5168\u90E8\u6863\u6848/\u65B9\u6848/\u6279\u6B21\uFF09"
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "qn-sub", style: { marginTop: 6 }, children: "\u5168\u90E8\u6570\u636E\u5B58\u5728\u672C\u673A Polaris \u6570\u636E\u6839\uFF08cap.kv `qingnang.*` \u952E\uFF09\uFF0C\u4E0D\u4E0A\u4F20\u4EFB\u4F55\u670D\u52A1\u5668\uFF1B \u624B\u673A/Web \u6253\u5F00\u540C\u4E00\u9762\u677F\u770B\u5230\u540C\u4E00\u4EFD\uFF08\u8D70\u81EA\u5BB6\u540E\u7AEF\uFF09\u3002" })
    ] }) }),
    onSendToChat && /* @__PURE__ */ jsx4("div", { className: "qn-card", children: /* @__PURE__ */ jsxs4("div", { className: "qn-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "qn-sub", style: { marginBottom: 8 }, children: "\u8DDF AI \u7BA1\u5BB6\u8BF4\u4E00\u53E5\u8BDD\u5C31\u80FD\u5EFA\u6863\u6392\u65B9\u6848\uFF1A" }),
      /* @__PURE__ */ jsxs4("div", { className: "qn-row", style: { flexWrap: "wrap", gap: 6 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "qn-btn ghost sm", onClick: () => onSendToChat("\u6211\u5988\u6BCF\u5929\u65E9\u665A\u5404\u5403\u4E00\u7247\u6C28\u6C2F\u5730\u5E73\uFF0C\u5BB6\u91CC\u8FD8\u5269\u4E00\u76D224\u7247\uFF0C\u6548\u671F2027\u5E746\u6708\uFF0C\u5E2E\u6211\u8BB0\u5230\u9752\u56CA"), children: "\u793A\u4F8B\uFF1A\u7ED9\u5988\u5988\u6392\u964D\u538B\u836F" }),
        /* @__PURE__ */ jsx4("button", { className: "qn-btn ghost sm", onClick: () => onSendToChat("\u770B\u770B\u9752\u56CA\u91CC\u54EA\u4E9B\u836F\u5FEB\u8FC7\u671F\u4E86\u3001\u54EA\u4E9B\u8BE5\u4E70\u4E86"), children: "\u793A\u4F8B\uFF1A\u67E5\u6548\u671F\u548C\u8865\u8D27" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "qn-foot", style: { fontSize: 11, color: "#8B95A7" }, children: [
      "\u9752\u56CA\u53EA\u505A\u5BB6\u5EAD\u836F\u4E8B\u8BB0\u5F55\u4E0E\u63D0\u9192\uFF0C",
      /* @__PURE__ */ jsx4("b", { children: "\u4E0D\u63D0\u4F9B\u533B\u7597\u5EFA\u8BAE" }),
      "\uFF1B\u836F\u7269\u76F8\u4E92\u4F5C\u7528\u3001\u5242\u91CF\u8C03\u6574\u3001\u505C\u836F\u51B3\u5B9A\u8BF7\u54A8\u8BE2\u533B\u751F\u6216\u836F\u5E08\u3002"
    ] })
  ] });
}
function core_dayKey() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.qn-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qn-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qn-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qn-body::-webkit-scrollbar{width:9px;height:9px}
.qn-body::-webkit-scrollbar-track{background:transparent}
.qn-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qn-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.qn-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qn-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3FB950,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qn-tt{flex:1;min-width:0}
.qn-tt b{font-size:15px;display:block}
.qn-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.qn-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.qn-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.qn-dot.stale{background:#D29922}
.qn-dot.down{background:#F85149}
.qn-tabs{display:flex;gap:4px}
.qn-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.qn-tab:hover{color:#E6EAF2}
.qn-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qn-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.qn-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qn-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3FB950,#58A6FF);flex-shrink:0}
.qn-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qn-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.qn-card-b{padding:11px 13px}
.qn-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.qn-btn:hover{filter:brightness(1.1)}
.qn-btn:disabled{opacity:.45;cursor:not-allowed}
.qn-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qn-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qn-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.qn-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qn-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.qn-inp:focus{outline:none;border-color:#2b6cb0}
.qn-inp::placeholder{color:#4d5566}
.qn-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.qn-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.qn-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qn-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.qn-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qn-toast.bad{border-color:#54262c;color:#FF8A9A}
.qn-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.qn-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.qn-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.qn-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.qn-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.qn-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.qn-row{display:flex;align-items:center;gap:8px;min-width:0}
.qn-grow{flex:1;min-width:0}
.qn-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
`;
function QingnanPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("today");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const cacheRef = useRef(newCache());
  const toastTimer = useRef(null);
  const audioCtxRef = useRef(null);
  const seenDoseRef = useRef(/* @__PURE__ */ new Set());
  const firstDoseLoadRef = useRef(true);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadQingnan(cacheRef.current);
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
  useEffect(() => {
    if (!data || !data.doses) return;
    const ids = new Set(data.doses.items.map((i) => i.occKey));
    if (firstDoseLoadRef.current) {
      firstDoseLoadRef.current = false;
      seenDoseRef.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !seenDoseRef.current.has(id));
    seenDoseRef.current = ids;
    if (!fresh.length || document.visibilityState !== "visible") return;
    if (data.settings.soundOn === false) return;
    try {
      const w = window;
      const Ctx = window.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      const play = (freq, at) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(1e-3, at);
        gain.gain.exponentialRampToValueAtTime(0.14, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(1e-3, at + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.32);
      };
      const t = ctx.currentTime;
      play(784, t);
      play(988, t + 0.2);
      play(1175, t + 0.4);
    } catch (_) {
    }
  }, [data]);
  const heartbeat = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = data.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u542F\u52A8\u670D\u52A1\uFF09" };
    const age = Date.now() - last;
    if (age < 180 * 1e3) {
      const c = data.meta?.counts;
      return { cls: "ok", text: `\u9752\u56CA\u5728\u7EBF \xB7 ${c ? `${c.profiles}\u6210\u5458 ${c.meds}\u836F ${c.regimens}\u65B9\u6848` : ""} \xB7 \u6865 ${data.meta?.bridge || "?"}` };
    }
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  const alertCount = data && data.doses && data.doses.date === (data.stocks ? data.stocks.today : "") ? data.doses.items.length : data && data.doses ? data.doses.items.length : 0;
  return /* @__PURE__ */ jsxs5("div", { className: "qn-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "qn-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "qn-logo", children: "\u{1F48A}" }),
      /* @__PURE__ */ jsxs5("div", { className: "qn-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u9752\u56CA" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `qn-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "qn-tabs", children: [
        ["today", "\u4ECA\u65E5"],
        ["cabinet", "\u836F\u7BB1"],
        ["plans", "\u65B9\u6848"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `qn-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "today" && alertCount > 0 && /* @__PURE__ */ jsx5("span", { className: "qn-badge", children: alertCount > 9 ? "9+" : alertCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "qn-body", children: /* @__PURE__ */ jsxs5("div", { className: "qn-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "qn-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "today" && /* @__PURE__ */ jsx5(TodayTab, { data, reload, showToast, pluginId, onSendToChat }),
      tab === "cabinet" && /* @__PURE__ */ jsx5(CabinetTab, { data, reload, showToast, pluginId }),
      tab === "plans" && /* @__PURE__ */ jsx5(PlansTab, { data, reload, showToast, pluginId }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, reload, showToast, pluginId, onSendToChat }),
      /* @__PURE__ */ jsx5("div", { className: "qn-foot", children: "\u9752\u56CA\u662F\u5BB6\u5EAD\u836F\u4E8B\u8BB0\u5F55\u5DE5\u5177\uFF0C\u4E0D\u63D0\u4F9B\u533B\u7597\u5EFA\u8BAE\u2014\u2014\u76F8\u4E92\u4F5C\u7528\u4E0E\u5242\u91CF\u8C03\u6574\u8BF7\u54A8\u8BE2\u533B\u751F\u836F\u5E08\u3002\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002" })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `qn-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
var src_default = QingnanPanel;
export {
  src_default as default
};
