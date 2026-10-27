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
    var K = [
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
          const t1 = h + S1 + ch + K[i] + w[i] | 0;
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
    var TITLE_CAP = 200;
    var NOTES_CAP = 2e3;
    var TAG_CAP = 24;
    var URL_CAP = 800;
    var MAX_OCC = 500;
    var MAX_ITER = 2e4;
    var DONE_MAP_CAP = 400;
    var DAY_MS3 = 864e5;
    function isFetchableUrl(rawUrl) {
      let u;
      try {
        u = new URL(String(rawUrl || ""));
      } catch (_) {
        return false;
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      const h = u.hostname.toLowerCase().replace(/\.$/, "");
      if (!h) return false;
      if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
      if (h === "::1" || h === "[::1]" || h === "0.0.0.0") return false;
      const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (v4) {
        const oct = v4.slice(1).map((x) => parseInt(x, 10));
        if (oct.some((x) => x > 255)) return false;
        const [a, b] = oct;
        if (a === 127 || a === 10 || a === 0) return false;
        if (a === 192 && b === 168) return false;
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 169 && b === 254) return false;
      }
      return true;
    }
    function decodeEntities(s) {
      return String(s || "").replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
        const code = parseInt(h, 16);
        return code > 0 && code < 1114112 ? String.fromCodePoint(code) : "";
      }).replace(/&#(\d+);/g, (_, n) => {
        const code = parseInt(n, 10);
        return code > 0 && code < 1114112 ? String.fromCodePoint(code) : "";
      }).replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, "&");
    }
    function clip(s, cap) {
      return decodeEntities(String(s || "")).trim().slice(0, cap);
    }
    function oneLine(s, n) {
      const t = String(s || "").replace(/\s+/g, " ").trim();
      return t.length > n ? `${t.slice(0, n)}\u2026` : t;
    }
    function eventIdFor(seed) {
      return "e" + sha256Hex(String(seed)).slice(0, 12);
    }
    function icsIdFor(url) {
      return "c" + sha256Hex(String(url).trim().toLowerCase()).slice(0, 10);
    }
    function icsEventId(icsId, uid) {
      return "e" + sha256Hex(icsId + "|" + String(uid)).slice(0, 12);
    }
    var WD_BY_NAME2 = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    var WD_NAME_BY_NUM2 = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    var WD_CN2 = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
    function localD(y, m, d, hh, mm) {
      return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
    }
    function localParts4(ts) {
      const dt = new Date(ts);
      return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), hh: dt.getHours(), mm: dt.getMinutes(), wd: dt.getDay() };
    }
    function utcParts3(ts) {
      const dt = new Date(ts);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    function occKey2(startTs, allDay) {
      if (!allDay) return String(startTs);
      const p = utcParts3(startTs);
      return `d${p.y}${String(p.m).padStart(2, "0")}${String(p.d).padStart(2, "0")}`;
    }
    function allDayAnchor(startTs) {
      const p = utcParts3(startTs);
      return localD(p.y, p.m, p.d, 9, 0);
    }
    function parseWhen(raw) {
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return { ts: Math.floor(raw), allDay: false };
      const s = String(raw || "").trim();
      if (!s) return null;
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const ts2 = Date.UTC(+m[1], +m[2] - 1, +m[3]);
        if (!Number.isFinite(ts2)) return null;
        const p = utcParts3(ts2);
        if (p.y !== +m[1] || p.m !== +m[2] || p.d !== +m[3]) return null;
        return { ts: ts2, allDay: true };
      }
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(Z|[+-]\d{1,2}:?\d{2})?$/);
      if (!m) return null;
      const [, ys, mos, ds, hs, mins, ss, zone] = m;
      const y = +ys, mo = +mos, d = +ds, h = +hs, mi = +mins, sec = ss ? +ss : 0;
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
      let ts;
      if (zone === "Z") ts = Date.UTC(y, mo - 1, d, h, mi, sec);
      else if (zone) {
        const om = zone.match(/^([+-])(\d{1,2}):?(\d{2})$/);
        if (!om) return null;
        const off = (+om[2] * 60 + +om[3]) * (om[1] === "-" ? -1 : 1);
        ts = Date.UTC(y, mo - 1, d, h, mi, sec) - off * 6e4;
      } else ts = localD(y, mo, d, h, mi) + sec * 1e3;
      if (!Number.isFinite(ts)) return null;
      return { ts, allDay: false };
    }
    var FREQS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
    var UNSUPPORTED_KEYS = ["BYSETPOS", "BYWEEKNO", "BYYEARDAY", "BYHOUR", "BYMINUTE", "BYSECOND", "BYMONTHDAY_INVALID"];
    function parseRrule(str) {
      const raw = String(str || "").trim();
      if (!raw) return null;
      const parts = raw.split(";");
      const r = { freq: "", interval: 1, byday: [], bymonthday: [], bymonth: [], until: null, count: 0, untilTs: 0 };
      for (const part of parts) {
        const i = part.indexOf("=");
        if (i < 1) return { error: `\u91CD\u590D\u89C4\u5219\u7247\u6BB5\u4E0D\u5408\u6CD5\uFF1A${oneLine(part, 30)}` };
        const k = part.slice(0, i).toUpperCase();
        const v = part.slice(i + 1).trim();
        if (k === "FREQ") {
          const f = v.toUpperCase();
          if (!FREQS.includes(f)) return { error: `\u4E0D\u652F\u6301\u7684\u91CD\u590D\u9891\u7387\uFF1A${f}\uFF08\u652F\u6301 DAILY/WEEKLY/MONTHLY/YEARLY\uFF09` };
          r.freq = f;
        } else if (k === "INTERVAL") {
          const n = Math.floor(Number(v));
          if (!Number.isFinite(n) || n < 1 || n > 999) return { error: "INTERVAL \u9700\u4E3A 1-999 \u7684\u6574\u6570" };
          r.interval = n;
        } else if (k === "BYDAY") {
          for (const tok of v.split(",").map((x) => x.trim().toUpperCase())) {
            const mm = tok.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
            if (!mm) return { error: `BYDAY \u4E0D\u5408\u6CD5\uFF1A${tok}` };
            const nth = mm[1] ? parseInt(mm[1], 10) : 0;
            if (nth < -53 || nth > 53) return { error: `BYDAY \u5E8F\u6570\u8D8A\u754C\uFF1A${tok}` };
            r.byday.push({ wd: WD_BY_NAME2[mm[2]], nth });
          }
        } else if (k === "BYMONTHDAY") {
          for (const tok of v.split(",").map((x) => x.trim())) {
            const n = parseInt(tok, 10);
            if (!Number.isFinite(n) || n === 0 || n < -31 || n > 31) return { error: `BYMONTHDAY \u4E0D\u5408\u6CD5\uFF1A${tok}` };
            r.bymonthday.push(n);
          }
        } else if (k === "BYMONTH") {
          for (const tok of v.split(",").map((x) => x.trim())) {
            const n = parseInt(tok, 10);
            if (!Number.isFinite(n) || n < 1 || n > 12) return { error: `BYMONTH \u4E0D\u5408\u6CD5\uFF1A${tok}` };
            r.bymonth.push(n);
          }
        } else if (k === "UNTIL") {
          const u = v.length === 10 ? `${v.slice(0, 4)}-${v.slice(5, 7)}-${v.slice(8, 10)}` : null;
          if (u && /^\d{4}-\d{2}-\d{2}$/.test(u)) r.untilTs = Date.UTC(+u.slice(0, 4), +u.slice(5, 7) - 1, +u.slice(8, 10)) + DAY_MS3 - 1;
          else if (/^\d{8}T\d{6}Z$/.test(v)) r.untilTs = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(9, 11), +v.slice(11, 13), +v.slice(13, 15));
          else if (/^\d{8}$/.test(v)) r.untilTs = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)) + DAY_MS3 - 1;
          else return { error: `UNTIL \u4E0D\u5408\u6CD5\uFF1A${oneLine(v, 30)}\uFF08\u652F\u6301 20261231 / 20261231T235900Z\uFF09` };
          r.until = v;
        } else if (k === "COUNT") {
          const n = Math.floor(Number(v));
          if (!Number.isFinite(n) || n < 1 || n > 9999) return { error: "COUNT \u9700\u4E3A 1-9999 \u7684\u6574\u6570" };
          r.count = n;
        } else if (UNSUPPORTED_KEYS.includes(k)) {
          return { error: `\u6682\u4E0D\u652F\u6301\u91CD\u590D\u89C4\u5219\u53C2\u6570\uFF1A${k}` };
        } else {
          return { error: `\u672A\u77E5\u91CD\u590D\u89C4\u5219\u53C2\u6570\uFF1A${k}` };
        }
      }
      if (!r.freq) return { error: "\u91CD\u590D\u89C4\u5219\u7F3A\u5C11 FREQ" };
      if (r.byday.some((b) => b.nth !== 0) && r.freq !== "MONTHLY") return { error: "\u5E26\u5E8F\u6570\u7684 BYDAY \u4EC5\u5728 MONTHLY \u4E0B\u652F\u6301" };
      return { r };
    }
    function friendlyRrule(input) {
      let s = String(input ?? "").trim();
      if (!s || s === "none" || s === "\u4E0D\u91CD\u590D" || s === "\u65E0") return { rrule: "" };
      s = s.replace(/^repeat[:=]/i, "");
      let mCn;
      mCn = s.match(/^每月\s*(末|-?\d{1,2})\s*号?(;.*)?$/);
      if (mCn) s = "monthly:" + (mCn[1] === "\u672B" ? "-1" : mCn[1]) + (mCn[2] || "");
      mCn = s.match(/^(每周|每星期)([日一二三四五六周、,，\s]+)$/);
      if (mCn) {
        const set = /* @__PURE__ */ new Set();
        for (const ch of mCn[2].replace(/[周、,，\s]/g, "")) {
          const i = WD_CN2.indexOf(ch);
          if (i < 0) return { error: `\u4E0D\u8BA4\u8BC6\u7684\u661F\u671F\uFF1A${ch}` };
          set.add(WD_NAME_BY_NUM2[i]);
        }
        s = "weekly:" + [...set].join(",");
      }
      s = s.replace(/^(每天|每日)(?=[;:]|$)/, "daily").replace(/^工作日(?=[;:]|$)/, "weekdays").replace(/^每年(?=[;:]|$)/, "yearly").replace(/^(每周|每星期)(?=[;:]|$)/, "weekly").replace(/^每月(?=[;:]|$)/, "monthly");
      const m = s.match(/^(daily|weekdays|weekly|monthly|yearly)(?::([^;]+))?(;.*)?$/i);
      if (m) {
        const head = m[1].toLowerCase();
        const arg = (m[2] || "").trim();
        const tail = (m[3] || "").replace(/^;/, "");
        let base = "";
        if (head === "daily" || head === "\u6BCF\u5929") base = "FREQ=DAILY";
        else if (head === "weekdays" || head === "\u5DE5\u4F5C\u65E5") base = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
        else if (head === "weekly") {
          base = "FREQ=WEEKLY";
          if (arg) {
            const days = arg.split(/[,，]/).map((x) => x.trim().toUpperCase());
            const cn = days.map((x) => x.length === 1 && WD_CN2.includes(x) ? WD_NAME_BY_NUM2[WD_CN2.indexOf(x)] : x);
            for (const d of cn) if (!(d in WD_BY_NAME2)) return { error: `BYDAY \u4E0D\u5408\u6CD5\uFF1A${d}` };
            base += ";BYDAY=" + cn.join(",");
          }
        } else if (head === "monthly") {
          base = "FREQ=MONTHLY";
          if (arg) {
            if (!/^-?\d{1,2}$/.test(arg)) return { error: `monthly \u5E8F\u53F7\u4E0D\u5408\u6CD5\uFF1A${arg}\uFF08\u5982 15 / -1=\u6708\u672B\uFF09` };
            base += ";BYMONTHDAY=" + arg;
          }
        } else if (head === "yearly") base = "FREQ=YEARLY";
        const full = tail ? `${base};${tail}` : base;
        return friendlyRrule(full);
      }
      const parsed = parseRrule(s.toUpperCase());
      if (parsed.error) return { error: parsed.error };
      const r = parsed.r;
      const segs = [`FREQ=${r.freq}`];
      if (r.interval !== 1) segs.push(`INTERVAL=${r.interval}`);
      if (r.byday.length) segs.push(`BYDAY=${r.byday.map((b) => (b.nth ? b.nth : "") + WD_NAME_BY_NUM2[b.wd]).join(",")}`);
      if (r.bymonthday.length) segs.push(`BYMONTHDAY=${r.bymonthday.join(",")}`);
      if (r.bymonth.length) segs.push(`BYMONTH=${r.bymonth.join(",")}`);
      if (r.count) segs.push(`COUNT=${r.count}`);
      if (r.until) segs.push(`UNTIL=${r.until}`);
      return { rrule: segs.join(";") };
    }
    function describeRrule4(rruleStr, startTs) {
      const parsed = parseRrule(rruleStr);
      if (!parsed || parsed.error || !parsed.r) return "\u4E0D\u91CD\u590D";
      const r = parsed.r;
      let head = "";
      if (r.freq === "DAILY") head = r.interval === 1 ? "\u6BCF\u5929" : `\u6BCF ${r.interval} \u5929`;
      else if (r.freq === "WEEKLY") {
        if (r.byday.length) {
          const names = [...r.byday].sort((a, b) => a.wd - b.wd).map((b) => "\u5468" + WD_CN2[b.wd]);
          head = (r.interval === 1 ? "\u6BCF" : `\u6BCF ${r.interval} \u5468 `) + names.join("\u3001");
        } else head = r.interval === 1 ? "\u6BCF\u5468" : `\u6BCF ${r.interval} \u5468`;
      } else if (r.freq === "MONTHLY") {
        if (r.bymonthday.length) head = r.interval === 1 ? `\u6BCF\u6708 ${r.bymonthday.join("/")} \u65E5` : `\u6BCF ${r.interval} \u4E2A\u6708\u7684 ${r.bymonthday.join("/")} \u65E5`;
        else if (r.byday.length && r.byday[0].nth) {
          const b = r.byday[0];
          const nth = b.nth < 0 ? `\u5012\u6570 ${-b.nth}` : `\u7B2C ${b.nth}`;
          head = `${r.interval === 1 ? "\u6BCF\u6708" : `\u6BCF ${r.interval} \u4E2A\u6708`} ${nth} \u4E2A\u5468${WD_CN2[b.wd]}`;
        } else head = r.interval === 1 ? "\u6BCF\u6708" : `\u6BCF ${r.interval} \u4E2A\u6708`;
      } else {
        if (r.bymonth.length && r.bymonthday.length) head = `\u6BCF\u5E74 ${r.bymonth.join("/")} \u6708 ${r.bymonthday.join("/")} \u65E5`;
        else head = r.interval === 1 ? "\u6BCF\u5E74" : `\u6BCF ${r.interval} \u5E74`;
      }
      let tail = "";
      if (r.count) tail += `\uFF0C\u5171 ${r.count} \u6B21`;
      if (r.untilTs) tail += `\uFF0C\u5230 ${fmtDay4(r.untilTs)} \u6B62`;
      return head + tail;
    }
    function expandOccurrences4(event, t0, t1, opts) {
      const maxOcc = opts && opts.max || MAX_OCC;
      if (!event || !Number.isFinite(event.start)) return [];
      const allDay = !!event.allDay;
      const durMs = Math.max(0, Math.floor(Number(event.durationMin) || 0)) * 6e4;
      const out = [];
      const emit = (ts) => {
        if (out.length >= maxOcc) return false;
        const end = ts + durMs;
        if (ts <= t1 && end >= t0) out.push({ start: ts, key: occKey2(ts, allDay) });
        return true;
      };
      const rrule = String(event.rrule || "").trim();
      if (!rrule) {
        const ts = allDay ? dayStartUtc2(event.start) : event.start;
        emit(ts);
        return out.sort((a, b) => a.start - b.start);
      }
      const parsed = parseRrule(rrule);
      if (!parsed || parsed.error || !parsed.r) return [];
      const r = parsed.r;
      let count = 0;
      const accept = (ts) => {
        if (r.untilTs && ts > r.untilTs) return false;
        count++;
        if (r.count && count > r.count) return false;
        return emit(ts);
      };
      if (allDay) {
        const p2 = utcParts3(event.start);
        const base = { y: p2.y, m: p2.m, d: p2.d };
        if (r.freq === "DAILY") {
          for (let k = 0; k < MAX_ITER; k++) {
            const ts = Date.UTC(base.y, base.m - 1, base.d + k * r.interval);
            if (ts > t1 + durMs) break;
            if (!accept(ts)) break;
            if (r.untilTs && ts > r.untilTs) break;
          }
        } else if (r.freq === "WEEKLY") {
          const days = (r.byday.length ? r.byday.map((b) => b.wd) : [new Date(Date.UTC(base.y, base.m - 1, base.d)).getUTCDay()]).sort((a, b) => a - b);
          const dow = new Date(Date.UTC(base.y, base.m - 1, base.d)).getUTCDay();
          const mondayOff = (dow + 6) % 7;
          outer1: for (let w = 0; w < MAX_ITER / 7; w++) {
            for (const dOff of days) {
              const dayIdx = w * 7 * r.interval + (dOff + 6) % 7 - mondayOff;
              if (dayIdx < 0) continue;
              const ts = Date.UTC(base.y, base.m - 1, base.d + dayIdx);
              if (ts > t1 + durMs) break outer1;
              if (!accept(ts)) break outer1;
              if (r.untilTs && ts > r.untilTs) break outer1;
            }
          }
        } else if (r.freq === "MONTHLY") {
          outer2: for (let k = 0; k < MAX_ITER / 28; k++) {
            const mIdx = base.m - 1 + k * r.interval;
            const days = r.bymonthday.length ? r.bymonthday : r.byday.length && r.byday[0].nth ? null : [base.d];
            if (days) {
              for (const d of days) {
                const dd = d < 0 ? daysInMonthUtc(base.y, mIdx) + 1 + d : d;
                const ts = Date.UTC(base.y, mIdx, dd);
                if (new Date(ts).getUTCDate() !== dd) continue;
                if (ts < Date.UTC(base.y, base.m - 1, base.d)) continue;
                if (ts > t1 + durMs) break outer2;
                if (!accept(ts)) break outer2;
                if (r.untilTs && ts > r.untilTs) break outer2;
              }
            } else {
              const ts = nthWeekdayUtc(base.y, mIdx, r.byday[0].nth, r.byday[0].wd);
              if (ts && ts >= Date.UTC(base.y, base.m - 1, base.d)) {
                if (ts > t1 + durMs) break outer2;
                if (!accept(ts)) break outer2;
                if (r.untilTs && ts > r.untilTs) break outer2;
              }
            }
          }
        } else {
          const months = r.bymonth.length ? r.bymonth : [base.m];
          const days = r.bymonthday.length ? r.bymonthday : r.byday.length && r.byday[0].nth ? null : [base.d];
          outer3: for (let k = 0; k < MAX_ITER / 365; k++) {
            for (const mo of months) {
              let tsList;
              if (days) {
                tsList = days.map((d) => {
                  const dd = d < 0 ? daysInMonthUtc(base.y + k * r.interval, mo - 1) + 1 + d : d;
                  return Date.UTC(base.y + k * r.interval, mo - 1, dd);
                });
              } else {
                const t = nthWeekdayUtc(base.y + k * r.interval, mo - 1, r.byday[0].nth, r.byday[0].wd);
                tsList = t ? [t] : [];
              }
              for (const ts of tsList) {
                if (new Date(ts).getUTCMonth() !== (mo - 1 + 12 * 1200) % 12) continue;
                if (ts < Date.UTC(base.y, base.m - 1, base.d)) continue;
                if (ts > t1 + durMs) break outer3;
                if (!accept(ts)) break outer3;
                if (r.untilTs && ts > r.untilTs) break outer3;
              }
            }
          }
        }
        return out.sort((a, b) => a.start - b.start);
      }
      const p = localParts4(event.start);
      const firstTs = event.start;
      const acceptLocal = (ts) => {
        if (ts > t1) return false;
        return accept(ts);
      };
      if (r.freq === "DAILY") {
        for (let k = 0; k < MAX_ITER; k++) {
          const ts = localD(p.y, p.m, p.d + k * r.interval, p.hh, p.mm);
          if (ts < firstTs - 1) continue;
          if (!acceptLocal(ts)) break;
          if (ts > t1) break;
        }
      } else if (r.freq === "WEEKLY") {
        const days = (r.byday.length ? r.byday.map((b) => b.wd) : [p.wd]).sort((a, b) => a - b);
        const mondayOff = (p.wd + 6) % 7;
        outer4: for (let w = 0; w < MAX_ITER / 7; w++) {
          for (const wd of days) {
            const dayShift = w * 7 * r.interval + (wd + 6) % 7 - mondayOff;
            const ts = localD(p.y, p.m, p.d + dayShift, p.hh, p.mm);
            if (ts < firstTs - 1) continue;
            if (ts > t1) break outer4;
            if (!acceptLocal(ts)) break outer4;
          }
        }
      } else if (r.freq === "MONTHLY") {
        outer5: for (let k = 0; k < MAX_ITER / 28; k++) {
          const mShift = k * r.interval;
          if (r.bymonthday.length) {
            for (const d of r.bymonthday) {
              const dd = d < 0 ? daysInMonthLocal(p.y, p.m + mShift) + 1 + d : d;
              const ts = localD(p.y, p.m + mShift, dd, p.hh, p.mm);
              const lp = localParts4(ts);
              if (lp.d !== dd) continue;
              if (ts < firstTs - 1) continue;
              if (ts > t1) break outer5;
              if (!acceptLocal(ts)) break outer5;
            }
          } else if (r.byday.length && r.byday[0].nth) {
            const b = r.byday[0];
            const ts = nthWeekdayLocal(p.y, p.m + mShift, b.nth, b.wd, p.hh, p.mm);
            if (ts && ts >= firstTs - 1) {
              if (ts > t1) break outer5;
              if (!acceptLocal(ts)) break outer5;
            }
          } else {
            const ts = localD(p.y, p.m + mShift, p.d, p.hh, p.mm);
            const lp = localParts4(ts);
            if (lp.d !== p.d) {
            } else {
              if (ts < firstTs - 1) continue;
              if (ts > t1) break outer5;
              if (!acceptLocal(ts)) break outer5;
            }
          }
        }
      } else {
        const months = r.bymonth.length ? r.bymonth : [p.m];
        const days = r.bymonthday.length ? r.bymonthday : [p.d];
        outer6: for (let k = 0; k < MAX_ITER / 365; k++) {
          for (const mo of months) {
            for (const d of days) {
              const dd = d < 0 ? daysInMonthLocal(p.y + k * r.interval, mo) + 1 + d : d;
              const ts = localD(p.y + k * r.interval, mo, dd, p.hh, p.mm);
              if (localParts4(ts).d !== dd) continue;
              if (ts < firstTs - 1) continue;
              if (ts > t1) break outer6;
              if (!acceptLocal(ts)) break outer6;
            }
          }
        }
      }
      return out.sort((a, b) => a.start - b.start);
    }
    function dayStartUtc2(ts) {
      const p = utcParts3(ts);
      return Date.UTC(p.y, p.m - 1, p.d);
    }
    function daysInMonthUtc(y, mIdx0) {
      return new Date(Date.UTC(y, mIdx0 + 1, 0)).getUTCDate();
    }
    function daysInMonthLocal(y, m0) {
      return new Date(y, m0, 0).getDate();
    }
    function nthWeekdayUtc(y, mIdx0, nth, wd) {
      const first = new Date(Date.UTC(y, mIdx0, 1));
      const shift = (wd - first.getUTCDay() + 7) % 7;
      let day;
      if (nth > 0) day = 1 + shift + (nth - 1) * 7;
      else {
        const last = new Date(Date.UTC(y, mIdx0 + 1, 0)).getUTCDate();
        const lastDow = new Date(Date.UTC(y, mIdx0 + 1, 0)).getUTCDay();
        day = last - (lastDow - wd + 7) % 7 - (-nth - 1) * 7;
      }
      const ts = Date.UTC(y, mIdx0, day);
      return new Date(ts).getUTCMonth() === (mIdx0 % 12 + 12) % 12 ? ts : 0;
    }
    function nthWeekdayLocal(y, m0, nth, wd, hh, mm) {
      const first = new Date(y, m0 - 1, 1);
      const shift = (wd - first.getDay() + 7) % 7;
      let day;
      if (nth > 0) day = 1 + shift + (nth - 1) * 7;
      else {
        const lastDt = new Date(y, m0, 0);
        const last = lastDt.getDate();
        day = last - (lastDt.getDay() - wd + 7) % 7 - (-nth - 1) * 7;
      }
      const ts = localD(y, m0, day, hh, mm);
      return localParts4(ts).d === day ? ts : 0;
    }
    function computeReminders(events, now, opts) {
      const o = opts || {};
      const graceMs = Math.max(1, Math.floor(Number(o.graceMin ?? 30))) * 6e4;
      const cap = Math.max(1, Math.floor(Number(o.cap ?? 50)));
      const acked = o.acked && typeof o.acked === "object" ? o.acked : {};
      let maxOffset = 0;
      for (const e of events) {
        const arr = Array.isArray(e.remind) ? e.remind : [];
        for (const n of arr) if (Number.isFinite(n)) maxOffset = Math.max(maxOffset, Number(n));
      }
      const t0 = now - graceMs;
      const t1 = now + maxOffset * 6e4 + 6e4;
      const out = [];
      const live = (Array.isArray(events) ? events : []).filter((e) => e && e.enabled !== false && Array.isArray(e.remind) && e.remind.length);
      for (const e of live) {
        const occs = expandOccurrences4(e, t0, t1);
        for (const occ of occs) {
          if (e.done && (e.done[occ.key] === "done" || e.done[occ.key] === "skip")) continue;
          for (const off of e.remind) {
            const n = Number(off);
            if (!Number.isFinite(n) || n < 0) continue;
            const anchor = e.allDay ? allDayAnchor(occ.start) : occ.start;
            const remindAt = anchor - n * 6e4;
            if (remindAt > now || now >= anchor + graceMs) continue;
            const id = `${e.id}|${occ.key}|${n}`;
            if (Number(acked[id]) > remindAt) continue;
            out.push({
              id,
              eventId: e.id,
              title: e.title,
              kind: e.kind || "event",
              start: occ.start,
              occKey: occ.key,
              allDay: !!e.allDay,
              offsetMin: n,
              remindAt
            });
          }
        }
      }
      out.sort((a, b) => a.remindAt - b.remindAt || (a.title < b.title ? -1 : 1));
      return out.slice(0, cap);
    }
    function computeStreak2(event, now) {
      if (!event || !event.rrule) return event && event.done && Object.values(event.done).some((v) => v === "done") ? 1 : 0;
      const endOfToday = (() => {
        const p = localParts4(now);
        return localD(p.y, p.m, p.d + 1, 0, 0) - 1;
      })();
      const occs = expandOccurrences4(event, now - 400 * DAY_MS3, endOfToday, { max: 1e3 });
      let streak = 0;
      for (let i = occs.length - 1; i >= 0; i--) {
        const v = event.done ? event.done[occs[i].key] : void 0;
        if (v === "done") {
          streak++;
          continue;
        }
        if (i === occs.length - 1) continue;
        break;
      }
      return streak;
    }
    function countdownInfo2(event, now) {
      if (!event || !Number.isFinite(event.start)) return null;
      const occs = expandOccurrences4(event, event.allDay ? dayStartUtc2(now) : now, (event.allDay ? dayStartUtc2(now) : now) + 400 * DAY_MS3, { max: 2 });
      if (!occs.length) return null;
      const target = occs[0].start;
      const days = Math.ceil((target - now) / DAY_MS3);
      return { targetTs: target, days: Math.max(0, days), key: occs[0].key };
    }
    function normalizeEvent2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const title = clip(raw.title, TITLE_CAP);
      if (!title) return { error: "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A" };
      const when = parseWhen(raw.start !== void 0 ? raw.start : prev ? prev.start : null);
      if (!when) return { error: "\u65F6\u95F4\u4E0D\u5408\u6CD5\uFF1A\u652F\u6301 2026-10-28\uFF08\u5168\u5929\uFF09\u30012026-10-28 15:00\u3001ISO \u6216\u6BEB\u79D2\u65F6\u95F4\u6233" };
      const rr = raw.rrule !== void 0 ? friendlyRrule(raw.rrule) : { rrule: prev ? String(prev.rrule || "") : "" };
      if (rr.error) return { error: rr.error };
      const allDay = raw.allDay !== void 0 ? raw.allDay === true : prev ? !!prev.allDay : when.allDay;
      let remind = raw.remind !== void 0 ? raw.remind : prev && Array.isArray(prev.remind) ? prev.remind : [];
      if (!Array.isArray(remind)) remind = [];
      const seenOff = /* @__PURE__ */ new Set();
      remind = remind.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 0 && n <= 10080).filter((n) => {
        if (seenOff.has(n)) return false;
        seenOff.add(n);
        return true;
      }).slice(0, 3);
      let tags = raw.tags !== void 0 ? raw.tags : prev && Array.isArray(prev.tags) ? prev.tags : [];
      if (!Array.isArray(tags)) tags = [];
      tags = tags.map((t) => clip(t, TAG_CAP)).filter(Boolean).slice(0, 5);
      const kindRaw = String(raw.kind !== void 0 ? raw.kind : prev ? prev.kind : "event");
      const kind = ["event", "habit", "countdown"].includes(kindRaw) ? kindRaw : "event";
      const doneRaw = raw.done !== void 0 ? raw.done : prev ? prev.done : {};
      const done = {};
      if (doneRaw && typeof doneRaw === "object") {
        for (const [k, v] of Object.entries(doneRaw)) {
          if ((v === "done" || v === "skip") && String(k).length <= 40) done[String(k).slice(0, 40)] = v;
        }
      }
      const durationRaw = raw.durationMin !== void 0 ? raw.durationMin : prev ? prev.durationMin : void 0;
      let durationMin = Math.max(0, Math.floor(Number(durationRaw) || 0));
      if (!Number.isFinite(Number(durationRaw)) && durationRaw === void 0) durationMin = allDay ? 1440 : 0;
      durationMin = Math.min(durationMin, 90 * 1440);
      const event = {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : eventIdFor(title + "|" + when.ts + "|" + Math.random().toString(36).slice(2, 8)),
        title,
        notes: clip(raw.notes !== void 0 ? raw.notes : prev ? prev.notes : "", NOTES_CAP),
        kind,
        start: when.ts,
        allDay,
        durationMin,
        rrule: rr.rrule,
        remind,
        tags,
        source: prev ? prev.source || "manual" : raw.source === "ics" ? "ics" : "manual",
        icsId: prev ? prev.icsId || "" : raw.icsId ? String(raw.icsId).slice(0, 20) : "",
        uid: prev ? prev.uid || "" : raw.uid ? String(raw.uid).slice(0, 200) : "",
        enabled: raw.enabled === void 0 ? prev ? prev.enabled !== false : true : raw.enabled === true,
        done,
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      };
      if (raw.start === void 0 && prev && prev.start) {
        event.start = prev.start;
        event.allDay = raw.allDay !== void 0 ? allDay : !!prev.allDay;
      }
      return { event };
    }
    var SETTING_LIMITS = {
      icsIntervalHours: [2, 168, 6],
      retentionDays: [30, 3650, 365],
      reminderGraceMin: [10, 240, 30]
    };
    function normalizeSettings2(raw) {
      const out = {};
      for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
        const v = Number(raw && typeof raw === "object" ? raw[k] : void 0);
        out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
      }
      return out;
    }
    function normalizeIcs2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      let url = String(raw.url || "").trim();
      url = url.replace(/^webcal:\/\//i, "https://").replace(/^feed:\/\//i, "");
      if (!url) return { error: "URL \u4E3A\u7A7A" };
      if (!/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^\/+/, "");
      if (!isFetchableUrl(url)) return { error: "\u4EC5\u652F\u6301\u516C\u7F51 http(s) \u8BA2\u9605\u5730\u5740\uFF08\u5185\u7F51/\u73AF\u56DE\u4E0D\u5141\u8BB8\uFF09" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const ics = {
        id: prev && prev.id ? String(prev.id) : icsIdFor(url),
        url: url.slice(0, URL_CAP),
        name: clip(raw.name, 60) || (prev ? prev.name : "") || "\u5916\u90E8\u65E5\u5386",
        enabled: raw.enabled === void 0 ? prev ? prev.enabled !== false : true : raw.enabled === true,
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        etag: prev ? prev.etag || "" : "",
        lastFetchAt: prev ? prev.lastFetchAt || 0 : 0,
        lastStatus: prev ? prev.lastStatus || "never" : "never",
        lastError: prev ? prev.lastError || "" : "",
        consecutiveErrors: prev ? prev.consecutiveErrors || 0 : 0,
        eventCount: prev ? Number(prev.eventCount) || 0 : 0,
        rev: prev ? prev.rev || 1 : 1
      };
      return { ics };
    }
    function planRetention(events, settings, now) {
      const s = normalizeSettings2(settings);
      const del = [];
      for (const e of Array.isArray(events) ? events : []) {
        if (!e || !e.id || e.rrule) continue;
        const end = (e.start || 0) + Math.max(0, Number(e.durationMin) || 0) * 6e4;
        if (end > 0 && now - end > s.retentionDays * DAY_MS3) del.push(e.id);
      }
      return del;
    }
    function pruneDoneMap(done, cap) {
      const c = Math.max(50, Math.floor(Number(cap) || DONE_MAP_CAP));
      if (!done || typeof done !== "object") return {};
      const keys = Object.keys(done);
      if (keys.length <= c) return done;
      const sorted = keys.sort((a, b) => a < b ? -1 : 1);
      const out = {};
      for (const k of sorted.slice(keys.length - c)) out[k] = done[k];
      return out;
    }
    function unfoldIcsLines(text) {
      const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      const out = [];
      for (const line of lines) {
        if ((line.startsWith(" ") || line.startsWith("	")) && out.length) out[out.length - 1] += line.slice(1);
        else if (line.length) out.push(line);
      }
      return out;
    }
    function parseIcsProp(line) {
      const i = line.indexOf(":");
      if (i < 0) return null;
      const left = line.slice(0, i);
      const value = line.slice(i + 1);
      const segs = left.split(";");
      const name = segs[0].toUpperCase();
      const params = {};
      for (const seg of segs.slice(1)) {
        const j = seg.indexOf("=");
        if (j > 0) params[seg.slice(0, j).toUpperCase()] = seg.slice(j + 1).replace(/^"|"$/g, "");
      }
      return { name, params, value };
    }
    function parseIcs(text) {
      const lines = unfoldIcsLines(text);
      const vtimezones = /* @__PURE__ */ new Map();
      const vevents = [];
      let tz = null;
      let tzComp = null;
      let ev = null;
      for (const line of lines) {
        const up = line.toUpperCase();
        if (up === "BEGIN:VTIMEZONE") {
          tz = { comps: [] };
          continue;
        }
        if (up === "END:VTIMEZONE") {
          if (tz && tz.tzid) vtimezones.set(tz.tzid.toUpperCase(), tz);
          tz = null;
          tzComp = null;
          continue;
        }
        if (up === "BEGIN:STANDARD" || up === "BEGIN:DAYLIGHT") {
          tzComp = { type: up.slice(6), rrule: "", offsetFrom: 0, offsetTo: 0, dtstart: "", isDate: false };
          continue;
        }
        if (up === "END:STANDARD" || up === "END:DAYLIGHT") {
          if (tz && tzComp) tz.comps.push(tzComp);
          tzComp = null;
          continue;
        }
        if (up === "BEGIN:VEVENT") {
          ev = { exdates: [], categories: [] };
          continue;
        }
        if (up === "END:VEVENT") {
          if (ev) vevents.push(ev);
          ev = null;
          continue;
        }
        if (!ev && !tz) continue;
        const prop = parseIcsProp(line);
        if (!prop) continue;
        if (tz) {
          if (prop.name === "TZID") tz.tzid = prop.value;
          else if (tzComp && prop.name === "DTSTART") {
            tzComp.dtstart = prop.value;
            tzComp.isDate = prop.params.VALUE === "DATE";
          } else if (tzComp && prop.name === "RRULE") tzComp.rrule = prop.value.toUpperCase();
          else if (tzComp && prop.name === "TZOFFSETFROM") tzComp.offsetFrom = offsetStrToMin(prop.value);
          else if (tzComp && prop.name === "TZOFFSETTO") tzComp.offsetTo = offsetStrToMin(prop.value);
          continue;
        }
        switch (prop.name) {
          case "UID":
            ev.uid = prop.value.trim();
            break;
          case "SUMMARY":
            ev.summary = prop.value;
            break;
          case "DESCRIPTION":
            ev.description = prop.value;
            break;
          case "LOCATION":
            ev.location = prop.value;
            break;
          case "STATUS":
            ev.status = prop.value.toUpperCase();
            break;
          case "DTSTART":
            ev.dtstart = prop.value;
            ev.dtstartParams = prop.params;
            break;
          case "DTEND":
            ev.dtend = prop.value;
            ev.dtendParams = prop.params;
            break;
          case "DURATION":
            ev.duration = prop.value.toUpperCase();
            break;
          case "RRULE":
            ev.rrule = prop.value.toUpperCase();
            break;
          case "RECURRENCE-ID":
            ev.recurrenceId = prop.value;
            ev.recurrenceParams = prop.params;
            break;
          case "CATEGORIES":
            for (const c of prop.value.split(",")) {
              const t = clip(c, TAG_CAP);
              if (t) ev.categories.push(t);
            }
            break;
          case "EXDATE":
            for (const v of prop.value.split(",")) {
              const t = v.trim();
              if (t) ev.exdates.push({ value: t, params: prop.params });
            }
            break;
          default:
            break;
        }
      }
      return { vtimezones, vevents };
    }
    function offsetStrToMin(s) {
      const m = String(s || "").trim().match(/^([+-])(\d{2})(\d{2})?$/);
      if (!m) return 0;
      return (+m[2] * 60 + (+m[3] || 0)) * (m[1] === "-" ? -1 : 1);
    }
    var FIXED_OFFSETS = {
      "ASIA/SHANGHAI": 480,
      "ASIA/URUMQI": 480,
      "ASIA/HONG_KONG": 480,
      "ASIA/MACAU": 480,
      "ASIA/TAIPEI": 480,
      "ASIA/SINGAPORE": 480,
      "ASIA/KUALA_LUMPUR": 480,
      "ASIA/MANILA": 480,
      "ASIA/TOKYO": 540,
      "ASIA/SEOUL": 540,
      "ASIA/BANGKOK": 420,
      "ASIA/JAKARTA": 420,
      "ASIA/HO_CHI_MINH": 420,
      "ASIA/KOLKATA": 330,
      "ASIA/KARACHI": 300,
      "ASIA/DUBAI": 240,
      "ASIA/RIYADH": 180,
      "ASIA/TEHRAN": 210,
      "EUROPE/LONDON": 0,
      "EUROPE/DUBLIN": 0,
      "EUROPE/LISBON": 0,
      "EUROPE/PARIS": 60,
      "EUROPE/BERLIN": 60,
      "EUROPE/MADRID": 60,
      "EUROPE/ROME": 60,
      "EUROPE/AMSTERDAM": 60,
      "EUROPE/ZURICH": 60,
      "EUROPE/STOCKHOLM": 60,
      "EUROPE/WARSAW": 60,
      "EUROPE/PRAGUE": 60,
      "EUROPE/VIENNA": 60,
      "EUROPE/ATHENS": 120,
      "EUROPE/HELSINKI": 120,
      "EUROPE/MOSCOW": 180,
      "EUROPE/ISTANBUL": 180,
      "AFRICA/CAIRO": 120,
      "AFRICA/LAGOS": 60,
      "AFRICA/JOHANNESBURG": 120,
      "AMERICA/SAO_PAULO": -180,
      "AMERICA/NEW_YORK": -300,
      "AMERICA/TORONTO": -300,
      "AMERICA/CHICAGO": -360,
      "AMERICA/MEXICO_CITY": -360,
      "AMERICA/DENVER": -420,
      "AMERICA/PHOENIX": -420,
      "AMERICA/LOS_ANGELES": -480,
      "AMERICA/VANCOUVER": -480,
      "AMERICA/ANCHORAGE": -540,
      "PACIFIC/HONOLULU": -600,
      "AUSTRALIA/SYDNEY": 600,
      "AUSTRALIA/MELBOURNE": 600,
      "AUSTRALIA/BRISBANE": 600,
      "AUSTRALIA/PERTH": 480,
      "UTC": 0,
      "ETC/UTC": 0,
      "GMT": 0
    };
    function zoneOffsetAt(tzid, ts, vtimezones) {
      const key = String(tzid || "").trim().toUpperCase();
      if (!key) return null;
      const vtz = vtimezones instanceof Map ? vtimezones.get(key) : null;
      if (vtz && Array.isArray(vtz.comps) && vtz.comps.length) {
        const trans = [];
        const qy = localParts4(ts).y;
        for (const comp of vtz.comps) {
          const base = vtzCompBaseTs(comp);
          if (!base) continue;
          trans.push({ ts: base, off: comp.offsetTo, from: comp.offsetFrom });
          if (comp.rrule) {
            const yearly = parseVtzYearly(comp.rrule);
            if (yearly) {
              const lp = localParts4(base + comp.offsetFrom * 6e4);
              for (let y = qy - 2; y <= qy + 1; y++) {
                let t = 0;
                if (yearly.nth) t = nthWeekdayLocal(y, yearly.bymonth, yearly.nth, yearly.wd, lp.hh, lp.mm);
                else {
                  t = localD(y, yearly.bymonth, yearly.bymonthday, lp.hh, lp.mm);
                  if (localParts4(t).d !== yearly.bymonthday) continue;
                }
                if (t) trans.push({ ts: t - comp.offsetFrom * 6e4, off: comp.offsetTo, from: comp.offsetFrom });
              }
            }
          }
        }
        if (trans.length) {
          trans.sort((a, b) => a.ts - b.ts);
          let best = null;
          for (const t of trans) {
            if (t.ts <= ts) best = t;
            else break;
          }
          if (best) return best.off;
          return trans[0].from;
        }
      }
      if (key in FIXED_OFFSETS) return FIXED_OFFSETS[key];
      if (/_$/.test(key) || /^ETC\//.test(key)) {
        const gm = key.match(/GMT([+-])(\d{1,2})/);
        if (gm) return +gm[2] * 60 * (gm[1] === "-" ? -1 : 1);
      }
      return null;
    }
    function vtzCompBaseTs(comp) {
      if (!comp || !comp.dtstart) return 0;
      const v = comp.dtstart.trim();
      const dm = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
      if (!dm) {
        const dOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (dOnly) return Date.UTC(+dOnly[1], +dOnly[2] - 1, +dOnly[3]);
        return 0;
      }
      const local = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +dm[4], +dm[5], +dm[6]);
      return dm[7] ? local : local - comp.offsetFrom * 6e4;
    }
    function parseVtzYearly(rruleStr) {
      let bymonth = 0;
      let byday = "";
      let bymonthday = 0;
      for (const seg of String(rruleStr || "").split(";")) {
        const i = seg.indexOf("=");
        if (i < 1) continue;
        const k = seg.slice(0, i).toUpperCase();
        const v = seg.slice(i + 1).trim().toUpperCase();
        if (k === "BYMONTH") bymonth = parseInt(v, 10) || 0;
        else if (k === "BYDAY") byday = v;
        else if (k === "BYMONTHDAY") bymonthday = parseInt(v, 10) || 0;
      }
      if (!bymonth) return null;
      if (byday) {
        const m = byday.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!m) return null;
        return { bymonth, nth: m[1] ? parseInt(m[1], 10) : 1, wd: WD_BY_NAME2[m[2]], bymonthday: 0 };
      }
      if (bymonthday) return { bymonth, nth: 0, wd: 0, bymonthday };
      return null;
    }
    function parseIcsDateTime(value, params, vtimezones) {
      const v = String(value || "").trim();
      const isDate = params && params.VALUE === "DATE" || /^\d{8}$/.test(v);
      if (isDate) {
        const m2 = v.match(/^(\d{4})(\d{2})(\d{2})/);
        if (!m2) return null;
        return { ts: Date.UTC(+m2[1], +m2[2] - 1, +m2[3]), allDay: true, tzid: "" };
      }
      const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
      if (!m) return null;
      const [, ys, mos, ds, hs, mins, ss, z] = m;
      const localMs = Date.UTC(+ys, +mos - 1, +ds, +hs, +mins, +ss);
      if (z === "Z") return { ts: localMs, allDay: false, tzid: "" };
      const tzid = params && params.TZID ? String(params.TZID) : "";
      if (tzid) {
        const off = zoneOffsetAt(tzid, localMs, vtimezones);
        return { ts: localMs - (off === null ? 0 : off) * 6e4, allDay: false, tzid };
      }
      const [, ly, lmo, ld] = [0, +ys, +mos, +ds];
      return { ts: localD(ly, lmo, ld, +hs, +mins) + +ss * 1e3, allDay: false, tzid: "" };
    }
    function parseIcsDuration(s) {
      const m = String(s || "").toUpperCase().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
      if (!m) return 0;
      const [_, sign, w, d, h, mi, sec] = m;
      const mins = (+w || 0) * 7 * 1440 + (+d || 0) * 1440 + (+h || 0) * 60 + (+mi || 0) + Math.round((+sec || 0) / 60);
      return (sign === "-" ? -1 : 1) * mins;
    }
    function icsToRawEvents(icsText, icsName, now) {
      const parsed = parseIcs(icsText);
      const raws = [];
      const skipsByUid = {};
      for (const ev of parsed.vevents) {
        if (!ev.dtstart || !ev.uid) continue;
        if (ev.status === "CANCELLED") continue;
        const st = parseIcsDateTime(ev.dtstart, ev.dtstartParams, parsed.vtimezones);
        if (!st) continue;
        let durationMin = 0;
        if (ev.duration) durationMin = Math.min(90 * 1440, Math.max(0, parseIcsDuration(ev.duration)));
        else if (ev.dtend) {
          const en = parseIcsDateTime(ev.dtend, ev.dtendParams, parsed.vtimezones);
          if (en) {
            if (st.allDay && en.allDay) durationMin = Math.max(1440, Math.round((en.ts - st.ts) / 6e4));
            else durationMin = Math.min(90 * 1440, Math.max(0, Math.round((en.ts - st.ts) / 6e4)));
          }
        }
        if (st.allDay) durationMin = Math.max(1440, durationMin || 1440);
        let rrule = "";
        let rruleWarn = "";
        if (ev.rrule) {
          const fr = friendlyRrule(ev.rrule);
          if (fr.rrule !== void 0 && fr.rrule !== "") rrule = fr.rrule;
          else if (fr.error) rruleWarn = `\uFF08\u91CD\u590D\u89C4\u5219\u5DF2\u7B80\u5316\u4E3A\u5355\u6B21\uFF1A${fr.error}\uFF09`;
        }
        const notesParts = [];
        if (ev.location) notesParts.push(`\u{1F4CD} ${clip(ev.location, 100)}`);
        const desc = clip(ev.description, NOTES_CAP - 200);
        if (desc) notesParts.push(desc);
        if (rruleWarn) notesParts.push(rruleWarn);
        const raw = {
          uid: ev.uid.slice(0, 200),
          rid: ev.recurrenceId ? String(ev.recurrenceId).slice(0, 60) : "",
          // 例外实例标识（与主事件同 UID，id 用 uid|rid 区分）
          title: clip(ev.summary, TITLE_CAP) || "\uFF08\u65E0\u6807\u9898\uFF09",
          notes: notesParts.join("\n").slice(0, NOTES_CAP),
          start: st.ts,
          allDay: st.allDay,
          durationMin,
          rrule,
          remind: [],
          tags: (ev.categories || []).slice(0, 3),
          source: "ics",
          kind: "event"
        };
        raws.push(raw);
        const skipKeys = [];
        for (const ex of ev.exdates || []) {
          const t = parseIcsDateTime(ex.value, ex.params, parsed.vtimezones);
          if (t) skipKeys.push(occKey2(t.ts, t.allDay || st.allDay));
        }
        if (ev.recurrenceId) {
          const t = parseIcsDateTime(ev.recurrenceId, ev.recurrenceParams, parsed.vtimezones);
          if (t) skipKeys.push(occKey2(t.ts, t.allDay || st.allDay));
        }
        if (skipKeys.length) skipsByUid[raw.uid] = (skipsByUid[raw.uid] || []).concat(skipKeys);
      }
      return { ok: true, raws, skipsByUid, count: raws.length, name: icsName || "" };
    }
    function planIcsSync(existingEvents, raws, icsId, skipsByUid, now) {
      const existing = (Array.isArray(existingEvents) ? existingEvents : []).filter((e) => e && e.source === "ics" && e.icsId === icsId);
      const syncKey = (uid, rid) => uid + (rid ? "|" + rid : "");
      const byUid = new Map(existing.map((e) => [syncKey(e.uid, e.rid || ""), e]));
      const upserts = [];
      const incomingUids = /* @__PURE__ */ new Set();
      for (const raw of Array.isArray(raws) ? raws : []) {
        const sk = syncKey(raw.uid, raw.rid || "");
        incomingUids.add(sk);
        const id = icsEventId(icsId, sk);
        const prev = byUid.get(sk);
        const ev = {
          ...raw,
          id,
          icsId,
          source: "ics",
          kind: prev ? prev.kind || "event" : "event",
          remind: prev && Array.isArray(prev.remind) ? prev.remind : [],
          enabled: prev ? prev.enabled !== false : true,
          done: prev && prev.done && typeof prev.done === "object" ? { ...prev.done } : {},
          createdAt: prev ? prev.createdAt || now : now,
          updatedAt: now,
          rev: prev ? (Number(prev.rev) || 1) + 1 : 1
        };
        const skips = raw.rid ? [] : skipsByUid && skipsByUid[raw.uid] || [];
        for (const k of skips) {
          if (ev.done[k] !== "done") ev.done[k] = "skip";
        }
        ev.done = pruneDoneMap(ev.done);
        upserts.push(ev);
      }
      const deletes = existing.filter((e) => !incomingUids.has(syncKey(e.uid, e.rid || ""))).map((e) => e.id);
      return { upserts, deletes };
    }
    function fmtDay4(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function fmtClock4(ts) {
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    function fmtOccWhen2(startTs, allDay, durationMin) {
      if (allDay) {
        const p = utcParts3(startTs);
        const days = Math.max(1, Math.round((Number(durationMin) || 1440) / 1440));
        const base2 = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
        return days > 1 ? `${base2} \u8D77 ${days} \u5929` : base2;
      }
      const dur = Number(durationMin) || 0;
      const base = `${fmtDay4(startTs)} ${fmtClock4(startTs)}`;
      if (dur > 0) {
        if (dur % 1440 === 0) return `${base} \xB7 ${dur / 1440} \u5929`;
        return `${base} \xB7 ${dur >= 60 && dur % 60 === 0 ? `${dur / 60} \u5C0F\u65F6` : `${dur} \u5206\u949F`}`;
      }
      return base;
    }
    module.exports = {
      TITLE_CAP,
      NOTES_CAP,
      TAG_CAP,
      MAX_OCC,
      DONE_MAP_CAP,
      DAY_MS: DAY_MS3,
      WD_BY_NAME: WD_BY_NAME2,
      WD_NAME_BY_NUM: WD_NAME_BY_NUM2,
      WD_CN: WD_CN2,
      FIXED_OFFSETS,
      isFetchableUrl,
      decodeEntities,
      clip,
      oneLine,
      eventIdFor,
      icsIdFor,
      icsEventId,
      parseWhen,
      parseRrule,
      friendlyRrule,
      describeRrule: describeRrule4,
      expandOccurrences: expandOccurrences4,
      occKey: occKey2,
      dayStartUtc: dayStartUtc2,
      allDayAnchor,
      computeReminders,
      computeStreak: computeStreak2,
      countdownInfo: countdownInfo2,
      normalizeEvent: normalizeEvent2,
      normalizeSettings: normalizeSettings2,
      normalizeIcs: normalizeIcs2,
      planRetention,
      pruneDoneMap,
      unfoldIcsLines,
      parseIcs,
      parseIcsDateTime,
      parseIcsDuration,
      zoneOffsetAt,
      icsToRawEvents,
      planIcsSync,
      offsetStrToMin,
      fmtDay: fmtDay4,
      fmtClock: fmtClock4,
      fmtOccWhen: fmtOccWhen2,
      localParts: localParts4,
      utcParts: utcParts3
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect3, useRef, useState as useState5 } from "react";

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
var PREFIX = "sundial.";
function newCache() {
  return { events: /* @__PURE__ */ new Map(), knownKeys: null, fullAt: 0 };
}
var FULL_REFRESH_MS = 90 * 1e3;
async function loadSundial(cache) {
  const keys = await kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(PREFIX + "ev."));
  const icsKeys = keys.filter((k) => k.startsWith(PREFIX + "ics."));
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.events.clear();
    cache.fullAt = now;
  }
  const prevKnown = cache.knownKeys || /* @__PURE__ */ new Set();
  const knownEv = /* @__PURE__ */ new Set();
  for (const k of prevKnown) if (k.startsWith(PREFIX + "ev.")) knownEv.add(k);
  const toFetch = evKeys.filter((k) => full || !knownEv.has(k));
  if (toFetch.length) {
    const fetched = await Promise.all(toFetch.map(async (k) => {
      const v = await kvGet(k).catch(() => null);
      return { k, v };
    }));
    for (const { k, v } of fetched) {
      if (v && typeof v === "object" && v.id) cache.events.set(v.id, v);
    }
  }
  const keySet = new Set(evKeys);
  for (const id of [...cache.events.keys()]) {
    if (!keySet.has(PREFIX + "ev." + id)) cache.events.delete(id);
  }
  cache.knownKeys = new Set(keys);
  const icsList = (await Promise.all(icsKeys.map(async (k) => kvGet(k).catch(() => null)))).filter((x) => !!x && typeof x === "object" && !!x.id);
  const [remindersProj, acked, settingsRaw, meta] = await Promise.all([
    kvGet(PREFIX + "reminders").catch(() => null),
    kvGet(PREFIX + "ui.acked").catch(() => null),
    kvGet(PREFIX + "settings").catch(() => null),
    kvGet(PREFIX + "meta").catch(() => null)
  ]);
  return {
    events: [...cache.events.values()],
    ics: icsList,
    reminders: remindersProj && Array.isArray(remindersProj.items) ? remindersProj.items : [],
    acked: acked && typeof acked === "object" ? acked : {},
    settings: core.normalizeSettings(settingsRaw),
    meta: meta && typeof meta === "object" ? meta : null
  };
}
async function saveEvent(input, existing) {
  const r = core.normalizeEvent(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const ev = r.event;
  await kvSet(PREFIX + "ev." + ev.id, ev);
  return ev;
}
async function deleteEvent(id) {
  await kvDel(PREFIX + "ev." + id);
}
async function markOccurrence(ev, occKey2, state) {
  const done = { ...ev.done || {} };
  if (state === "none") delete done[occKey2];
  else done[occKey2] = state;
  const r = core.normalizeEvent({ done }, ev);
  if ("error" in r && r.error) throw new Error(r.error);
  const next = r.event;
  await kvSet(PREFIX + "ev." + next.id, next);
  return next;
}
async function ackReminder(rId) {
  const cur = await kvGet(PREFIX + "ui.acked").catch(() => null) || {};
  await kvSet(PREFIX + "ui.acked", { ...cur, [rId]: Date.now() });
}
async function saveSettings(s) {
  await kvSet(PREFIX + "settings", s);
}
async function icsAdd(url, name) {
  const r = core.normalizeIcs({ url, name }, null);
  if ("error" in r && r.error) throw new Error(r.error);
  const def = r.ics;
  await kvSet(PREFIX + "ics." + def.id, def);
  await kvSet(PREFIX + "cmd.ics.add." + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), {
    op: "icsAdd",
    url: def.url,
    name: def.name,
    at: Date.now()
  });
}
async function icsRefresh(id) {
  if (id) {
    await kvSet(PREFIX + "cmd.ics.refresh." + id, { op: "icsRefresh", cid: id, at: Date.now() });
  } else {
    await kvSet(PREFIX + "cmd.ics.refreshAll." + Date.now().toString(36), { op: "icsRefreshAll", at: Date.now() });
  }
}
async function icsRemove(id) {
  await kvSet(PREFIX + "cmd.ics.remove." + id, { op: "icsRemove", cid: id, at: Date.now() });
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
function exportAll(data) {
  return JSON.stringify({
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "polaris-sundial",
    events: data.events,
    ics: data.ics.map(({ etag, lastFetchAt, lastStatus, lastError, consecutiveErrors, ...rest }) => {
      return rest;
    }),
    settings: data.settings
  }, null, 2);
}

// src/TodayTab.tsx
var core2 = __toESM(require_core());
import { useEffect, useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function rowEnd(e, start) {
  return start + Math.max(0, Number(e.durationMin) || 0) * 6e4;
}
function TodayTab({ data, reload, showToast }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 3e4);
    return () => clearInterval(timer);
  }, []);
  const now = Date.now();
  const activeReminders = useMemo(() => {
    if (!data) return [];
    return data.reminders.filter((r) => !data.acked[r.id] || data.acked[r.id] <= r.remindAt);
  }, [data]);
  const { todayRows, tomorrowRows, alldayRows, timedRows } = useMemo(() => {
    const empty = { todayRows: [], tomorrowRows: [], alldayRows: [], timedRows: [] };
    if (!data) return empty;
    const p = core2.localParts(now);
    const t0 = new Date(p.y, p.m - 1, p.d).getTime();
    const t1 = t0 + core2.DAY_MS - 1;
    const collect = (from, to) => {
      const rows = [];
      for (const e of data.events) {
        if (e.enabled === false) continue;
        for (const occ of core2.expandOccurrences(e, from, to)) {
          rows.push({ e, start: occ.start, key: occ.key, end: rowEnd(e, occ.start) });
        }
      }
      return rows.sort((a, b) => a.start - b.start);
    };
    const today = collect(t0, t1);
    const tomorrow = collect(t0 + core2.DAY_MS, t1 + core2.DAY_MS);
    return {
      todayRows: today,
      tomorrowRows: tomorrow,
      alldayRows: today.filter((r) => r.e.allDay),
      timedRows: today.filter((r) => !r.e.allDay)
    };
  }, [data, now]);
  const countdowns = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const e of data.events) {
      if (e.enabled === false || e.kind !== "countdown") continue;
      const c = core2.countdownInfo(e, now);
      if (c && c.days <= 365) out.push({ e, days: c.days, targetTs: c.targetTs });
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 8);
  }, [data, now]);
  const mark = async (e, occKey2, state) => {
    try {
      await markOccurrence(e, occKey2, state);
      await reload();
    } catch (err) {
      showToast(err.message, true);
    }
  };
  const ack = async (rId) => {
    try {
      await ackReminder(rId);
      await reload();
    } catch (err) {
      showToast(err.message, true);
    }
  };
  if (!data) return /* @__PURE__ */ jsx("div", { className: "sd-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const nextUp = timedRows.find((r) => r.end >= now && !(r.e.done && r.e.done[r.key] === "done") && !(r.e.done && r.e.done[r.key] === "skip"));
  const occRow = (r, isTomorrow = false) => {
    const markV = r.e.done ? r.e.done[r.key] : void 0;
    const isNow = !isTomorrow && r.start <= now && r.end >= now;
    const isNext = r === nextUp;
    return /* @__PURE__ */ jsxs("div", { className: `sd-occ ${isNow ? "now" : ""}`, children: [
      /* @__PURE__ */ jsx("div", { className: `sd-occ-time ${isNow ? "now" : ""}`, children: r.e.allDay ? /* @__PURE__ */ jsx("span", { className: "sd-allday", children: "\u5168\u5929" }) : core2.fmtClock(r.start) }),
      /* @__PURE__ */ jsxs("div", { className: "sd-occ-main", children: [
        /* @__PURE__ */ jsxs("div", { className: `sd-occ-t ${markV === "done" ? "done" : ""}`, children: [
          r.e.title,
          r.e.kind === "habit" && !isTomorrow && (() => {
            const s = core2.computeStreak(r.e, now);
            return s > 0 ? /* @__PURE__ */ jsxs("span", { style: { color: "#D29922", marginLeft: 6 }, children: [
              "\u{1F525}",
              s
            ] }) : null;
          })()
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sd-occ-m", children: [
          r.e.kind !== "event" && /* @__PURE__ */ jsx("span", { className: `sd-kind ${r.e.kind}`, children: r.e.kind === "habit" ? "\u4E60\u60EF" : "\u5012\u6570" }),
          r.e.source === "ics" && /* @__PURE__ */ jsx("span", { className: "sd-kind ics", children: "ICS" }),
          r.e.rrule && /* @__PURE__ */ jsx("span", { children: core2.describeRrule(r.e.rrule) }),
          markV === "skip" && /* @__PURE__ */ jsx("span", { style: { color: "#8B95A7" }, children: "\u5DF2\u8DF3\u8FC7" }),
          r.e.tags.map((t) => /* @__PURE__ */ jsx("span", { className: "sd-tag", children: t }, t))
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sd-occ-btns", children: markV === "done" ? /* @__PURE__ */ jsx("button", { className: "sd-btn sm ghost", onClick: () => mark(r.e, r.key, "none"), children: "\u64A4\u9500" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { className: "sd-btn sm ok", onClick: () => mark(r.e, r.key, "done"), children: "\u5B8C\u6210" }),
        !isTomorrow && /* @__PURE__ */ jsx("button", { className: "sd-btn sm ghost", onClick: () => mark(r.e, r.key, "skip"), children: "\u8DF3\u8FC7" })
      ] }) })
    ] }, r.e.id + "|" + r.key);
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    activeReminders.length > 0 && /* @__PURE__ */ jsx("div", { children: activeReminders.slice(0, 6).map((r) => /* @__PURE__ */ jsxs("div", { className: "sd-remind", children: [
      /* @__PURE__ */ jsx("div", { className: "sd-remind-ico", children: "\u23F0" }),
      /* @__PURE__ */ jsxs("div", { className: "sd-remind-main", children: [
        /* @__PURE__ */ jsx("div", { className: "sd-remind-t", children: r.title }),
        /* @__PURE__ */ jsxs("div", { className: "sd-remind-s", children: [
          r.allDay ? "\u5168\u5929" : core2.fmtClock(r.start),
          " \u5F00\u59CB",
          r.offsetMin > 0 ? ` \xB7 \u63D0\u524D ${r.offsetMin >= 1440 ? `${Math.round(r.offsetMin / 1440)} \u5929` : r.offsetMin >= 60 ? `${r.offsetMin / 60} \u5C0F\u65F6` : `${r.offsetMin} \u5206\u949F`}` : " \xB7 \u51C6\u65F6\u63D0\u9192"
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "sd-btn sm ghost", onClick: () => ack(r.id), children: "\u77E5\u9053\u4E86" })
    ] }, r.id)) }),
    countdowns.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "sd-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "sd-bar" }),
        "\u5012\u6570\u65E5",
        /* @__PURE__ */ jsx("span", { className: "sd-hint", children: "\u8DDD\u76EE\u6807\u8FD8\u6709" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sd-cds", children: countdowns.map(({ e, days, targetTs }) => /* @__PURE__ */ jsxs("div", { className: "sd-cd", children: [
        /* @__PURE__ */ jsx("div", { className: "sd-cd-n", children: days === 0 ? "\u4ECA\u5929" : `D-${days}` }),
        /* @__PURE__ */ jsx("div", { className: "sd-cd-t", title: e.title, children: e.title }),
        /* @__PURE__ */ jsx("div", { className: "sd-cd-d", children: core2.fmtDay(targetTs) })
      ] }, e.id)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "sd-bar" }),
      "\u4ECA\u5929",
      /* @__PURE__ */ jsxs("span", { className: "sd-hint", children: [
        core2.fmtDay(now),
        " ",
        core2.WD_CN[new Date(now).getDay()] && `\u5468${core2.WD_CN[new Date(now).getDay()]}`
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sd-card", children: [
      todayRows.length === 0 && /* @__PURE__ */ jsxs("div", { className: "sd-empty", children: [
        "\u4ECA\u5929\u6CA1\u6709\u5B89\u6392\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "\u53BB\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u63D0\u9192\u6211\u660E\u5929\u4E0B\u53483\u70B9\u53D6\u5FEB\u9012\u300D\uFF0C\u6216\u5728\u300C\u4E8B\u4EF6\u300D\u9875\u6DFB\u52A0\u3002"
      ] }),
      alldayRows.map((r) => occRow(r)),
      timedRows.map((r) => occRow(r))
    ] }),
    tomorrowRows.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "sd-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "sd-bar" }),
        "\u660E\u5929",
        /* @__PURE__ */ jsxs("span", { className: "sd-hint", children: [
          tomorrowRows.length,
          " \u9879"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sd-card", children: [
        tomorrowRows.slice(0, 5).map((r) => occRow(r, true)),
        tomorrowRows.length > 5 && /* @__PURE__ */ jsxs("div", { className: "sd-sub", style: { padding: "8px 13px" }, children: [
          "\u8FD8\u6709 ",
          tomorrowRows.length - 5,
          " \u9879\u2026"
        ] })
      ] })
    ] })
  ] });
}

// src/MonthTab.tsx
var core3 = __toESM(require_core());
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function MonthTab({ data }) {
  const todayP = core3.localParts(Date.now());
  const [view, setView] = useState2({ y: todayP.y, m: todayP.m });
  const [sel, setSel] = useState2(null);
  const { grid, byDay } = useMemo2(() => {
    const empty = { grid: [], byDay: /* @__PURE__ */ new Map() };
    if (!data) return empty;
    const monthStart = new Date(view.y, view.m - 1, 1).getTime();
    const monthEnd = new Date(view.y, view.m, 0, 23, 59, 59, 999).getTime();
    const map = /* @__PURE__ */ new Map();
    const push = (dayKey, occ) => {
      const arr = map.get(dayKey) || [];
      arr.push(occ);
      map.set(dayKey, arr);
    };
    for (const e of data.events) {
      if (e.enabled === false) continue;
      for (const occ of core3.expandOccurrences(e, monthStart, monthEnd)) {
        if (e.allDay) {
          const p = core3.utcParts(occ.start);
          push(`${p.y}-${p.m}-${p.d}`, { e, start: occ.start, key: occ.key });
        } else {
          const p = core3.localParts(occ.start);
          push(`${p.y}-${p.m}-${p.d}`, { e, start: occ.start, key: occ.key });
        }
      }
    }
    const firstDow = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(view.y, view.m, 0).getDate();
    const cells = [];
    const total = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const dayNum = i - firstDow + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const dd = inMonth ? dayNum : dayNum < 1 ? dayNum : dayNum - daysInMonth;
      const key = inMonth ? `${view.y}-${view.m}-${dayNum}` : "";
      cells.push({ d: dd, inMonth, occs: key && map.get(key) || [] });
    }
    return { grid: cells, byDay: map };
  }, [data, view]);
  const selKey = sel ? `${sel.y}-${sel.m}-${sel.d}` : "";
  const selOccs = selKey ? (byDay.get(selKey) || []).sort((a, b) => a.start - b.start) : [];
  const isTodayCell = (cell) => cell.inMonth && view.y === todayP.y && view.m === todayP.m && cell.d === todayP.d;
  const isSel = (cell) => !!sel && cell.inMonth && view.y === sel.y && view.m === sel.m && cell.d === sel.d;
  const shift = (delta) => {
    const m = view.m + delta;
    const y = view.y + Math.floor((m - 1) / 12);
    const nm = ((m - 1) % 12 + 12) % 12 + 1;
    setView({ y, m: nm });
    setSel(null);
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "sd-mh", children: [
      /* @__PURE__ */ jsx2("button", { className: "sd-btn sm ghost", onClick: () => shift(-1), children: "\u2039" }),
      /* @__PURE__ */ jsxs2("span", { className: "sd-mt", children: [
        view.y,
        " \u5E74 ",
        view.m,
        " \u6708"
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "sd-btn sm ghost", onClick: () => shift(1), children: "\u203A" }),
      /* @__PURE__ */ jsx2("button", { className: "sd-btn sm ghost", style: { marginLeft: "auto" }, onClick: () => {
        setView({ y: todayP.y, m: todayP.m });
        setSel({ y: todayP.y, m: todayP.m, d: todayP.d });
      }, children: "\u4ECA" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-mgrid", children: [
      ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].map((w) => /* @__PURE__ */ jsx2("div", { className: "sd-mwd", children: w }, w)),
      grid.map((cell, i) => /* @__PURE__ */ jsxs2(
        "div",
        {
          className: `sd-mcell ${cell.inMonth ? "" : "dim"} ${isTodayCell(cell) ? "today" : ""} ${isSel(cell) ? "sel" : ""}`,
          onClick: () => cell.inMonth && setSel({ y: view.y, m: view.m, d: cell.d }),
          children: [
            /* @__PURE__ */ jsx2("div", { className: "sd-md", children: cell.d }),
            /* @__PURE__ */ jsxs2("div", { className: "sd-mdots", children: [
              cell.occs.slice(0, 2).map((o) => {
                const markV = o.e.done ? o.e.done[o.key] : void 0;
                return /* @__PURE__ */ jsx2("div", { className: `sd-mdot ${o.e.kind === "habit" ? "habit" : o.e.kind === "countdown" ? "countdown" : ""} ${markV === "done" ? "done" : ""}`, children: o.e.title }, o.e.id + o.key);
              }),
              cell.occs.length > 2 && /* @__PURE__ */ jsxs2("div", { className: "sd-mdot", style: { color: "#5C6678" }, children: [
                "+",
                cell.occs.length - 2
              ] })
            ] })
          ]
        },
        i
      ))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "sd-bar" }),
      sel ? `${sel.m} \u6708 ${sel.d} \u65E5` : "\u9009\u4E00\u5929\u770B\u5B89\u6392"
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-card", children: [
      !sel && /* @__PURE__ */ jsx2("div", { className: "sd-empty", children: "\u70B9\u4E0A\u9762\u7684\u65E5\u671F\u683C\u5B50\uFF0C\u67E5\u770B\u5F53\u5929\u5B89\u6392\u3002" }),
      sel && selOccs.length === 0 && /* @__PURE__ */ jsx2("div", { className: "sd-empty", children: "\u8FD9\u5929\u6CA1\u6709\u5B89\u6392\u3002" }),
      selOccs.map((o) => {
        const markV = o.e.done ? o.e.done[o.key] : void 0;
        return /* @__PURE__ */ jsxs2("div", { className: "sd-occ", children: [
          /* @__PURE__ */ jsx2("div", { className: "sd-occ-time", children: o.e.allDay ? /* @__PURE__ */ jsx2("span", { className: "sd-allday", children: "\u5168\u5929" }) : core3.fmtClock(o.start) }),
          /* @__PURE__ */ jsxs2("div", { className: "sd-occ-main", children: [
            /* @__PURE__ */ jsx2("div", { className: `sd-occ-t ${markV === "done" ? "done" : ""}`, children: o.e.title }),
            /* @__PURE__ */ jsxs2("div", { className: "sd-occ-m", children: [
              o.e.kind !== "event" && /* @__PURE__ */ jsx2("span", { className: `sd-kind ${o.e.kind}`, children: o.e.kind === "habit" ? "\u4E60\u60EF" : "\u5012\u6570" }),
              o.e.source === "ics" && /* @__PURE__ */ jsx2("span", { className: "sd-kind ics", children: "ICS" }),
              o.e.rrule && /* @__PURE__ */ jsx2("span", { children: core3.describeRrule(o.e.rrule) }),
              markV === "skip" && /* @__PURE__ */ jsx2("span", { children: "\u5DF2\u8DF3\u8FC7" })
            ] })
          ] })
        ] }, o.e.id + o.key);
      })
    ] })
  ] });
}

// src/EventsTab.tsx
var core4 = __toESM(require_core());
import { useMemo as useMemo3, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function emptyForm() {
  const now = /* @__PURE__ */ new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  return {
    id: null,
    title: "",
    allDay: false,
    date: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`,
    time: "09:00",
    durationMin: 60,
    kind: "event",
    rruleMode: "none",
    weekdays: [],
    monthday: "1",
    customRrule: "",
    remind: [30],
    tags: "",
    notes: ""
  };
}
function formFromEvent(e) {
  const base = emptyForm();
  let mode = "custom";
  let weekdays = [];
  let monthday = "1";
  let custom = "";
  if (!e.rrule) mode = "none";
  else if (e.rrule === "FREQ=DAILY") mode = "daily";
  else if (e.rrule === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") mode = "weekdays";
  else if (e.rrule === "FREQ=WEEKLY;INTERVAL=2") mode = "biweekly";
  else if (e.rrule === "FREQ=YEARLY") mode = "yearly";
  else if (e.rrule.startsWith("FREQ=WEEKLY;BYDAY=")) {
    mode = "weekly";
    weekdays = e.rrule.slice("FREQ=WEEKLY;BYDAY=".length).split(",").map((s) => core4.WD_BY_NAME[s] ?? 1);
  } else if (e.rrule.startsWith("FREQ=MONTHLY;BYMONTHDAY=")) {
    mode = "monthly";
    monthday = e.rrule.slice("FREQ=MONTHLY;BYMONTHDAY=".length);
  } else custom = e.rrule;
  const p = e.allDay ? core4.utcParts(e.start) : core4.localParts(e.start);
  const p2 = (n) => String(n).padStart(2, "0");
  const dateStr = `${p.y}-${p2(p.m)}-${p2(p.d)}`;
  const hhmm = e.allDay ? base.time : `${p2(core4.localParts(e.start).hh)}:${p2(core4.localParts(e.start).mm)}`;
  return {
    id: e.id,
    title: e.title,
    allDay: e.allDay,
    date: dateStr,
    time: hhmm,
    durationMin: e.durationMin,
    kind: e.kind,
    rruleMode: mode,
    weekdays,
    monthday,
    customRrule: custom,
    remind: [...e.remind],
    tags: e.tags.join(","),
    notes: e.notes
  };
}
function rruleFromForm(f) {
  switch (f.rruleMode) {
    case "none":
      return "";
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly": {
      if (!f.weekdays.length) return "FREQ=WEEKLY";
      const names = [...f.weekdays].sort((a, b) => a - b).map((n) => core4.WD_NAME_BY_NUM[n]);
      return "FREQ=WEEKLY;BYDAY=" + names.join(",");
    }
    case "biweekly":
      return "FREQ=WEEKLY;INTERVAL=2";
    case "monthly":
      return f.monthday === "last" ? "FREQ=MONTHLY;BYMONTHDAY=-1" : `FREQ=MONTHLY;BYMONTHDAY=${parseInt(f.monthday, 10) || 1}`;
    case "yearly":
      return "FREQ=YEARLY";
    case "custom":
      return f.customRrule.trim();
    default:
      return "";
  }
}
var REMIND_CHIPS = [[0, "\u51C6\u65F6"], [15, "15 \u5206\u949F"], [30, "30 \u5206\u949F"], [60, "1 \u5C0F\u65F6"], [120, "2 \u5C0F\u65F6"], [1440, "1 \u5929\u524D"], [2880, "2 \u5929\u524D"]];
var WD_CH = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
function EventsTab({ data, reload, showToast }) {
  const [form, setForm] = useState3(null);
  const [query, setQuery] = useState3("");
  const [confirmDel, setConfirmDel] = useState3("");
  const [icsUrl, setIcsUrl] = useState3("");
  const [icsName, setIcsName] = useState3("");
  const [confirmIcs, setConfirmIcs] = useState3("");
  const now = Date.now();
  const rows = useMemo3(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const out = data.events.filter((e) => e.source !== "ics").filter((e) => !q || `${e.title}|${e.notes}|${e.tags.join("/")}`.toLowerCase().includes(q)).map((e) => {
      const next = core4.expandOccurrences(e, e.allDay ? core4.dayStartUtc(now) - core4.DAY_MS : now, now + 90 * core4.DAY_MS, { max: 3 })[0] || null;
      return { e, next };
    }).sort((a, b) => (a.next ? a.next.start : a.e.start) - (b.next ? b.next.start : b.e.start));
    return out;
  }, [data, query, now]);
  const set = (patch) => setForm((f) => f ? { ...f, ...patch } : f);
  const submit = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      showToast("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A", true);
      return;
    }
    const start = form.allDay ? form.date : `${form.date} ${form.time}`;
    const input = {
      title: form.title.trim(),
      start,
      allDay: form.allDay,
      durationMin: form.allDay ? void 0 : form.durationMin,
      kind: form.kind,
      rrule: rruleFromForm(form),
      remind: form.remind,
      tags: form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      notes: form.notes
    };
    try {
      const existing = form.id ? data?.events.find((e) => e.id === form.id) || null : null;
      if (form.id && !existing) {
        showToast("\u539F\u4E8B\u4EF6\u5DF2\u4E0D\u5B58\u5728", true);
        setForm(null);
        return;
      }
      await saveEvent(input, existing);
      setForm(null);
      await reload();
      showToast(existing ? "\u5DF2\u4FDD\u5B58\u4FEE\u6539" : "\u5DF2\u6DFB\u52A0");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const del = async (e) => {
    if (confirmDel !== e.id) {
      setConfirmDel(e.id);
      return;
    }
    setConfirmDel("");
    try {
      await deleteEvent(e.id);
      if (form?.id === e.id) setForm(null);
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (err) {
      showToast(err.message, true);
    }
  };
  const nextText = (e, next) => {
    if (!next) return "\u6CA1\u6709\u5373\u5C06\u5230\u6765\u7684\u53D1\u751F\uFF08\u8FC7\u671F\u6216\u672A\u542F\u7528\uFF09";
    const markV = e.done ? e.done[core4.occKey(next.start, e.allDay)] : void 0;
    const when = e.allDay ? core4.fmtOccWhen(next.start, true, e.durationMin) : `${core4.fmtDay(next.start)} ${core4.fmtClock(next.start)}`;
    return `${when}${markV === "done" ? " \u2705" : markV === "skip" ? " \u23ED" : ""}`;
  };
  const addIcs = async () => {
    if (!icsUrl.trim()) {
      showToast("\u8BF7\u586B\u8BA2\u9605\u5730\u5740", true);
      return;
    }
    try {
      await icsAdd(icsUrl.trim(), icsName.trim());
      setIcsUrl("");
      setIcsName("");
      await reload();
      showToast("\u5DF2\u6DFB\u52A0\u8BA2\u9605\uFF0C\u670D\u52A1\u51E0\u79D2\u5185\u6293\u53D6");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "sd-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sd-bar" }),
      "\u6211\u7684\u65E5\u7A0B",
      /* @__PURE__ */ jsxs3("span", { className: "sd-hint", children: [
        rows.length,
        " \u6761\uFF08\u4E0D\u542B ICS \u5BFC\u5165\uFF09"
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "sd-btn sm", style: { marginLeft: 8 }, onClick: () => setForm(emptyForm()), children: "\uFF0B \u6DFB\u52A0" })
    ] }),
    /* @__PURE__ */ jsx3("div", { style: { padding: "0 16px 8px" }, children: /* @__PURE__ */ jsx3("input", { className: "sd-inp", placeholder: "\u641C\u7D22\u6807\u9898 / \u5907\u6CE8 / \u6807\u7B7E\u2026", value: query, onChange: (e2) => setQuery(e2.target.value) }) }),
    form && /* @__PURE__ */ jsx3("div", { className: "sd-card", children: /* @__PURE__ */ jsxs3("div", { className: "sd-form", children: [
      /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u6807\u9898" }),
      /* @__PURE__ */ jsx3("input", { className: "sd-inp", value: form.title, placeholder: "\u5982\uFF1A\u53D6\u5FEB\u9012 / \u5468\u4F1A / \u80CC\u5355\u8BCD", onChange: (e2) => set({ title: e2.target.value }) }),
      /* @__PURE__ */ jsxs3("div", { className: "sd-frow", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs3("label", { className: "sd-checkbox", children: [
          /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: form.allDay, onChange: (e2) => set({ allDay: e2.target.checked }) }),
          "\u5168\u5929"
        ] }),
        /* @__PURE__ */ jsx3("input", { className: "sd-inp", style: { flex: 1 }, type: "date", value: form.date, onChange: (e2) => set({ date: e2.target.value }) }),
        !form.allDay && /* @__PURE__ */ jsx3("input", { className: "sd-inp", style: { width: 100 }, type: "time", value: form.time, onChange: (e2) => set({ time: e2.target.value }) })
      ] }),
      !form.allDay && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u65F6\u957F" }),
        /* @__PURE__ */ jsx3("select", { className: "sd-sel", value: form.durationMin, onChange: (e2) => set({ durationMin: Number(e2.target.value) }), children: [0, 15, 30, 45, 60, 90, 120, 180, 240, 480].map((n) => /* @__PURE__ */ jsx3("option", { value: n, children: n === 0 ? "\u65F6\u523B\u70B9\uFF08\u65E0\u65F6\u957F\uFF09" : `${n} \u5206\u949F` }, n)) })
      ] }),
      /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u7C7B\u578B" }),
      /* @__PURE__ */ jsxs3("select", { className: "sd-sel", value: form.kind, onChange: (e2) => set({ kind: e2.target.value }), children: [
        /* @__PURE__ */ jsx3("option", { value: "event", children: "\u65E5\u7A0B" }),
        /* @__PURE__ */ jsx3("option", { value: "habit", children: "\u4E60\u60EF\u6253\u5361\uFF08\u53EF\u8FDE\u51FB\uFF09" }),
        /* @__PURE__ */ jsx3("option", { value: "countdown", children: "\u5012\u6570\u65E5 / \u7EAA\u5FF5\u65E5" })
      ] }),
      /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u91CD\u590D" }),
      /* @__PURE__ */ jsxs3("select", { className: "sd-sel", value: form.rruleMode, onChange: (e2) => set({ rruleMode: e2.target.value }), children: [
        /* @__PURE__ */ jsx3("option", { value: "none", children: "\u4E0D\u91CD\u590D" }),
        /* @__PURE__ */ jsx3("option", { value: "daily", children: "\u6BCF\u5929" }),
        /* @__PURE__ */ jsx3("option", { value: "weekdays", children: "\u5DE5\u4F5C\u65E5\uFF08\u4E00\u81F3\u4E94\uFF09" }),
        /* @__PURE__ */ jsx3("option", { value: "weekly", children: "\u6BCF\u5468\uFF08\u9009\u661F\u671F\uFF09" }),
        /* @__PURE__ */ jsx3("option", { value: "biweekly", children: "\u6BCF\u4E24\u5468" }),
        /* @__PURE__ */ jsx3("option", { value: "monthly", children: "\u6BCF\u6708\uFF08\u9009\u51E0\u53F7\uFF09" }),
        /* @__PURE__ */ jsx3("option", { value: "yearly", children: "\u6BCF\u5E74" }),
        /* @__PURE__ */ jsx3("option", { value: "custom", children: "\u81EA\u5B9A\u4E49 RRULE\uFF08\u9AD8\u7EA7\uFF09" })
      ] }),
      form.rruleMode === "weekly" && /* @__PURE__ */ jsx3("div", { className: "sd-chips", style: { marginTop: 6 }, children: WD_CH.map((ch, i) => /* @__PURE__ */ jsxs3(
        "button",
        {
          className: `sd-chip ${form.weekdays.includes(i) ? "on" : ""}`,
          onClick: () => set({ weekdays: form.weekdays.includes(i) ? form.weekdays.filter((x) => x !== i) : [...form.weekdays, i] }),
          children: [
            "\u5468",
            ch
          ]
        },
        i
      )) }),
      form.rruleMode === "monthly" && /* @__PURE__ */ jsxs3("div", { className: "sd-frow", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx3("span", { className: "sd-sub", children: "\u6BCF\u6708" }),
        /* @__PURE__ */ jsx3("input", { className: "sd-inp", style: { width: 90 }, value: form.monthday, placeholder: "15 \u6216 -1=\u6708\u672B", onChange: (e2) => set({ monthday: e2.target.value }) }),
        /* @__PURE__ */ jsx3("span", { className: "sd-sub", children: "\u53F7" })
      ] }),
      form.rruleMode === "custom" && /* @__PURE__ */ jsx3(
        "input",
        {
          className: "sd-inp",
          style: { marginTop: 6, font: "11px Consolas,monospace" },
          value: form.customRrule,
          placeholder: "FREQ=DAILY;COUNT=10\uFF08\u652F\u6301\u5B50\u96C6\uFF0C\u8BE6\u89C1 README\uFF09",
          onChange: (e2) => set({ customRrule: e2.target.value })
        }
      ),
      /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u63D0\u524D\u63D0\u9192\uFF08\u6700\u591A 3 \u4E2A\uFF09" }),
      /* @__PURE__ */ jsx3("div", { className: "sd-chips", children: REMIND_CHIPS.map(([min, label]) => /* @__PURE__ */ jsx3(
        "button",
        {
          className: `sd-chip ${form.remind.includes(min) ? "on" : ""}`,
          onClick: () => set({ remind: form.remind.includes(min) ? form.remind.filter((x) => x !== min) : form.remind.length >= 3 ? form.remind : [...form.remind, min] }),
          children: label
        },
        min
      )) }),
      /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF09" }),
      /* @__PURE__ */ jsx3("input", { className: "sd-inp", value: form.tags, placeholder: "\u5DE5\u4F5C, \u5065\u5EB7", onChange: (e2) => set({ tags: e2.target.value }) }),
      /* @__PURE__ */ jsx3("label", { className: "sd-lbl", children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx3("textarea", { className: "sd-inp", rows: 2, value: form.notes, onChange: (e2) => set({ notes: e2.target.value }) }),
      /* @__PURE__ */ jsxs3("div", { className: "sd-frow", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "sd-btn", onClick: submit, children: form.id ? "\u4FDD\u5B58\u4FEE\u6539" : "\u6DFB\u52A0" }),
        /* @__PURE__ */ jsx3("button", { className: "sd-btn ghost", onClick: () => setForm(null), children: "\u53D6\u6D88" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "sd-card", children: [
      rows.length === 0 && /* @__PURE__ */ jsx3("div", { className: "sd-empty", children: "\u8FD8\u6CA1\u6709\u65E5\u7A0B\u3002\u70B9\u53F3\u4E0A\u300C\uFF0B \u6DFB\u52A0\u300D\uFF0C\u6216\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u660E\u5929\u4E0A\u534810\u70B9\u63D0\u9192\u6211\u5F00\u4F1A\u300D\u3002" }),
      rows.map(({ e, next }) => {
        const nextKey = next ? core4.occKey(next.start, e.allDay) : "";
        const markV = nextKey && e.done ? e.done[nextKey] : void 0;
        return /* @__PURE__ */ jsxs3("div", { className: "sd-ev", children: [
          /* @__PURE__ */ jsxs3("div", { className: "sd-ev-h", children: [
            /* @__PURE__ */ jsx3("div", { className: `sd-ev-t ${markV === "done" ? "done" : ""}`, children: e.title }),
            e.remind.length > 0 && /* @__PURE__ */ jsxs3("span", { className: "sd-tag", children: [
              "\u23F0 ",
              e.remind.map((n) => n >= 1440 ? `${n / 1440}\u5929` : n >= 60 ? `${n / 60}\u65F6` : `${n}\u5206`).join("/")
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "sd-ev-m", children: [
            e.kind !== "event" && /* @__PURE__ */ jsx3("span", { className: `sd-kind ${e.kind}`, children: e.kind === "habit" ? "\u4E60\u60EF" : "\u5012\u6570" }),
            /* @__PURE__ */ jsx3("span", { children: nextText(e, next) }),
            e.rrule && /* @__PURE__ */ jsxs3("span", { children: [
              "\xB7 ",
              core4.describeRrule(e.rrule)
            ] }),
            e.tags.map((t) => /* @__PURE__ */ jsx3("span", { className: "sd-tag", children: t }, t))
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "sd-ev-m", style: { marginTop: 6 }, children: [
            next && markV !== "done" && /* @__PURE__ */ jsx3("button", { className: "sd-btn sm ok", onClick: async () => {
              try {
                await saveEvent({ done: { ...e.done || {}, [nextKey]: "done" } }, e);
                await reload();
              } catch (err) {
                showToast(err.message, true);
              }
            }, children: "\u2713 \u5B8C\u6210\u4E0B\u4E00\u6B21" }),
            next && markV === "done" && /* @__PURE__ */ jsx3("button", { className: "sd-btn sm ghost", onClick: async () => {
              const done = { ...e.done || {} };
              delete done[nextKey];
              try {
                await saveEvent({ done }, e);
                await reload();
              } catch (err) {
                showToast(err.message, true);
              }
            }, children: "\u64A4\u9500\u5B8C\u6210" }),
            /* @__PURE__ */ jsx3("button", { className: "sd-btn sm ghost", onClick: () => setForm(formFromEvent(e)), children: "\u7F16\u8F91" }),
            /* @__PURE__ */ jsx3("button", { className: `sd-btn sm ${confirmDel === e.id ? "danger" : "ghost"}`, onClick: () => del(e), children: confirmDel === e.id ? "\u786E\u8BA4\u5220\u9664\uFF1F" : "\u5220\u9664" })
          ] })
        ] }, e.id);
      })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sd-bar" }),
      "\u5916\u90E8\u65E5\u5386\u8BA2\u9605\uFF08ICS\uFF09",
      /* @__PURE__ */ jsx3("span", { className: "sd-hint", children: "\u7531\u540E\u53F0\u670D\u52A1\u6293\u53D6\uFF0C\u624B\u673A\u4E5F\u80FD\u770B" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "sd-card", children: [
      data.ics.length === 0 && /* @__PURE__ */ jsx3("div", { className: "sd-empty", style: { padding: "14px 16px" }, children: "\u628A\u65E5\u5386\u7684 ICS/Webcal \u94FE\u63A5\uFF08Google \u65E5\u5386\u300C\u516C\u5F00\u65E5\u5386\u5730\u5740\u300D\u3001\u5B66\u6821\u8BFE\u8868\u3001\u6392\u73ED\u8868\u5BFC\u51FA\uFF09\u7C98\u5230\u4E0B\u9762\uFF0C\u6309\u95F4\u9694\u81EA\u52A8\u540C\u6B65\u8FDB\u6765\u3002" }),
      data.ics.map((d) => {
        const time = d.lastFetchAt ? new Date(d.lastFetchAt).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "\u4ECE\u672A\u6293\u53D6";
        const status = d.lastStatus === "error" ? `\u26A0 ${d.lastError || "\u6293\u53D6\u5931\u8D25"}` : d.lastStatus === "never" ? "\u7B49\u5F85\u9996\u6293" : "\u6B63\u5E38";
        return /* @__PURE__ */ jsxs3("div", { className: "sd-ics", children: [
          /* @__PURE__ */ jsxs3("div", { className: "sd-ev-h", children: [
            /* @__PURE__ */ jsxs3("div", { className: "sd-ev-t", children: [
              d.name,
              d.enabled === false ? "\uFF08\u5DF2\u505C\u7528\uFF09" : ""
            ] }),
            /* @__PURE__ */ jsxs3("span", { className: "sd-tag", children: [
              d.eventCount || 0,
              " \u4E8B\u4EF6"
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "sd-ev-m", children: [
            /* @__PURE__ */ jsxs3("span", { children: [
              time,
              " \xB7 ",
              status
            ] }),
            /* @__PURE__ */ jsx3("span", { style: { wordBreak: "break-all" }, children: d.url })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "sd-ev-m", style: { marginTop: 6 }, children: [
            /* @__PURE__ */ jsx3("button", { className: "sd-btn sm ghost", onClick: async () => {
              try {
                await icsRefresh(d.id);
                showToast("\u5DF2\u4E0B\u53D1\u5237\u65B0");
              } catch (err) {
                showToast(err.message, true);
              }
            }, children: "\u5237\u65B0" }),
            /* @__PURE__ */ jsx3("button", { className: `sd-btn sm ${confirmIcs === d.id ? "danger" : "ghost"}`, onClick: async () => {
              if (confirmIcs !== d.id) {
                setConfirmIcs(d.id);
                return;
              }
              setConfirmIcs("");
              try {
                await icsRemove(d.id);
                await reload();
                showToast("\u5DF2\u4E0B\u53D1\u9000\u8BA2\uFF08\u5176\u4E8B\u4EF6\u5C06\u5220\u9664\uFF09");
              } catch (err) {
                showToast(err.message, true);
              }
            }, children: confirmIcs === d.id ? "\u786E\u8BA4\u9000\u8BA2\uFF1F" : "\u9000\u8BA2" })
          ] })
        ] }, d.id);
      }),
      /* @__PURE__ */ jsxs3("div", { className: "sd-ics", children: [
        /* @__PURE__ */ jsxs3("div", { className: "sd-frow", children: [
          /* @__PURE__ */ jsx3("input", { className: "sd-inp", style: { flex: 2 }, placeholder: "https://\u2026/basic.ics \u6216 webcal://\u2026", value: icsUrl, onChange: (e2) => setIcsUrl(e2.target.value) }),
          /* @__PURE__ */ jsx3("input", { className: "sd-inp", style: { flex: 1 }, placeholder: "\u663E\u793A\u540D", value: icsName, onChange: (e2) => setIcsName(e2.target.value) }),
          /* @__PURE__ */ jsx3("button", { className: "sd-btn", onClick: addIcs, children: "\u8BA2\u9605" })
        ] }),
        data.ics.length > 0 && /* @__PURE__ */ jsx3("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx3("button", { className: "sd-btn sm ghost", onClick: async () => {
          try {
            await icsRefresh();
            showToast("\u5DF2\u4E0B\u53D1\u5168\u90E8\u5237\u65B0");
          } catch (err) {
            showToast(err.message, true);
          }
        }, children: "\u5168\u90E8\u7ACB\u5237" }) })
      ] })
    ] })
  ] });
}

// src/SettingsTab.tsx
var core5 = __toESM(require_core());
import { useEffect as useEffect2, useState as useState4 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.sd-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.sd-field:first-child{border-top:none}
.sd-field-l{flex:1;min-width:0}
.sd-field-l b{font-size:12.5px;display:block}
.sd-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.sd-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.sd-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.sd-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.sd-note{font-size:11px;color:#8B95A7;line-height:1.8;padding:11px 13px;border-top:1px solid #1d2330;word-break:break-word}
.sd-note b{color:#C9D1D9}
`;
var SERVICE_ID = "sundial-service";
function SettingsTab({ pluginId, data, reload, showToast }) {
  const [svc, setSvc] = useState4(null);
  const [busy, setBusy] = useState4(false);
  const [settings, setLocalSettings] = useState4(null);
  const [confirmWipe, setConfirmWipe] = useState4(false);
  useEffect2(() => {
    let alive = true;
    serviceStatus(pluginId, SERVICE_ID).then((s) => {
      if (alive) setSvc(s);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [pluginId, data?.meta]);
  useEffect2(() => {
    if (data && !settings) setLocalSettings(data.settings);
  }, [data, settings]);
  const act = async (fn, label) => {
    setBusy(true);
    try {
      await fn();
      showToast(label);
      await reload();
    } catch (e) {
      showToast(`${label}\u5931\u8D25\uFF1A${e.message}`, true);
    } finally {
      setBusy(false);
      serviceStatus(pluginId, SERVICE_ID).then(setSvc).catch(() => {
      });
    }
  };
  const save = async () => {
    if (!settings) return;
    try {
      await saveSettings(settings);
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const wipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    setConfirmWipe(false);
    try {
      const keys = await kvKeys();
      const mine = keys.filter((k) => k.startsWith("sundial.") && !k.startsWith("sundial.smoke."));
      for (const k of mine) await kvDel(k).catch(() => {
      });
      await reload();
      showToast(`\u5DF2\u6E05\u7A7A ${mine.length} \u4E2A\u952E`);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const exportJson = () => {
    if (!data) return;
    try {
      const text = exportAll(data);
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sundial-export-${core5.fmtDay(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3e3);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const meta = data?.meta || null;
  const hb = meta?.lastTickAt ? Date.now() - meta.lastTickAt : Infinity;
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sd-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "sd-card", children: [
      /* @__PURE__ */ jsx4("div", { className: "sd-field", style: { borderTop: "none" }, children: /* @__PURE__ */ jsxs4("div", { className: "sd-field-l", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u65E5\u6677\u670D\u52A1\uFF08ICS \u6293\u53D6 / \u63D0\u9192\u6295\u5F71\uFF09" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          svc === null && "\u72B6\u6001\u672A\u77E5\uFF08\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1F\uFF09",
          svc && svc.running && `\u8FD0\u884C\u4E2D${meta ? ` \xB7 ${meta.events ?? "?"} \u4E8B\u4EF6 \xB7 ${meta.icsCount ?? 0} \u8BA2\u9605` : ""}`,
          svc && !svc.running && "\u672A\u8FD0\u884C\u2014\u2014\u63D0\u9192\u6295\u5F71\u4E0E ICS \u540C\u6B65\u505C\u6446\uFF0C\u53EF\u624B\u52A8\u542F\u52A8",
          svc?.lastError ? ` \xB7 \u6700\u8FD1\u9519\u8BEF\uFF1A${svc.lastError}` : ""
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "sd-state", children: [
          /* @__PURE__ */ jsx4("i", { className: `sd-dot ${hb < 18e4 ? "ok" : hb < Infinity ? "stale" : "down"}` }),
          hb < 18e4 ? `\u5FC3\u8DF3\u6B63\u5E38\uFF08${meta?.version || "?"}\uFF09` : hb < Infinity ? `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(hb / 6e4)} \u5206\u949F` : "\u65E0\u5FC3\u8DF3",
          meta?.bridge ? ` \xB7 \u6865 ${meta.bridge}` : ""
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs4("div", { className: "sd-actions", style: { padding: "0 13px 11px" }, children: [
        /* @__PURE__ */ jsx4("button", { className: "sd-btn sm", disabled: busy, onClick: () => act(async () => {
          const st = await serviceStatus(pluginId, SERVICE_ID);
          if (st && st.running) {
            showToast("\u670D\u52A1\u5DF2\u5728\u8FD0\u884C");
            return;
          }
          await serviceStart(pluginId, SERVICE_ID);
        }, "\u542F\u52A8\u547D\u4EE4\u5DF2\u4E0B\u53D1"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { className: "sd-btn sm ghost", disabled: busy, onClick: () => act(() => serviceStop(pluginId, SERVICE_ID), "\u5DF2\u505C\u6B62"), children: "\u505C\u6B62" }),
        /* @__PURE__ */ jsx4("button", { className: "sd-btn sm ghost", disabled: busy, onClick: () => act(() => serviceRestart(pluginId, SERVICE_ID), "\u5DF2\u91CD\u542F"), children: "\u91CD\u542F" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sd-bar" }),
      "\u5168\u5C40\u8BBE\u7F6E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "sd-card", children: settings && /* @__PURE__ */ jsxs4(Fragment3, { children: [
      /* @__PURE__ */ jsxs4("div", { className: "sd-field", style: { borderTop: "none" }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "sd-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "ICS \u540C\u6B65\u95F4\u9694" }),
          /* @__PURE__ */ jsx4("small", { children: "\u5916\u90E8\u65E5\u5386\u591A\u4E45\u6293\u4E00\u6B21\uFF082-168 \u5C0F\u65F6\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "sd-num",
            type: "number",
            min: 2,
            max: 168,
            value: settings.icsIntervalHours,
            onChange: (e) => setLocalSettings({ ...settings, icsIntervalHours: Number(e.target.value) || 6 })
          }
        ),
        /* @__PURE__ */ jsx4("span", { className: "sd-sub", children: "\u5C0F\u65F6" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sd-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "sd-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u63D0\u9192\u8FC7\u671F\u7A97\u53E3" }),
          /* @__PURE__ */ jsx4("small", { children: "\u63D0\u9192\u4ECE\u5230\u671F\u5230\u4E8B\u4EF6\u5F00\u59CB\u540E\u591A\u4E45\u81EA\u52A8\u6D88\u5931\uFF0810-240 \u5206\u949F\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "sd-num",
            type: "number",
            min: 10,
            max: 240,
            value: settings.reminderGraceMin,
            onChange: (e) => setLocalSettings({ ...settings, reminderGraceMin: Number(e.target.value) || 30 })
          }
        ),
        /* @__PURE__ */ jsx4("span", { className: "sd-sub", children: "\u5206\u949F" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sd-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "sd-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u5386\u53F2\u4FDD\u7559" }),
          /* @__PURE__ */ jsx4("small", { children: "\u8FC7\u671F\u7684\u4E00\u6B21\u6027\u65E5\u7A0B\u591A\u5C11\u5929\u540E\u81EA\u52A8\u6E05\u626B\uFF08\u91CD\u590D\u4E8B\u4EF6\u6C38\u7559\uFF0C30-3650 \u5929\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "sd-num",
            type: "number",
            min: 30,
            max: 3650,
            value: settings.retentionDays,
            onChange: (e) => setLocalSettings({ ...settings, retentionDays: Number(e.target.value) || 365 })
          }
        ),
        /* @__PURE__ */ jsx4("span", { className: "sd-sub", children: "\u5929" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "sd-actions", style: { padding: "0 13px 11px" }, children: /* @__PURE__ */ jsx4("button", { className: "sd-btn", onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sd-bar" }),
      "\u6570\u636E\u7BA1\u7406"
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "sd-card", children: [
      /* @__PURE__ */ jsxs4("div", { className: "sd-field", style: { borderTop: "none" }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "sd-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u5BFC\u51FA JSON" }),
          /* @__PURE__ */ jsx4("small", { children: "\u5168\u90E8\u4E8B\u4EF6 / \u8BA2\u9605 / \u8BBE\u7F6E\u5BFC\u51FA\u4E3A\u6587\u4EF6\uFF08\u7EAF\u672C\u5730\uFF0C\u6570\u636E\u4E0D\u51FA\u8BBE\u5907\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4("button", { className: "sd-btn sm", onClick: exportJson, children: "\u5BFC\u51FA" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sd-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "sd-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" }),
          /* @__PURE__ */ jsx4("small", { children: "\u5220\u9664\u672C\u63D2\u4EF6\u5168\u90E8\u952E\uFF08\u4E8B\u4EF6/\u8BA2\u9605/\u63D0\u9192/\u8BBE\u7F6E\uFF09\uFF0C\u4E0D\u53EF\u6062\u590D" })
        ] }),
        /* @__PURE__ */ jsx4("button", { className: `sd-btn sm ${confirmWipe ? "danger" : "ghost"}`, onClick: wipe, children: confirmWipe ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A" : "\u6E05\u7A7A\u2026" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "sd-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sd-bar" }),
      "\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "sd-card", children: /* @__PURE__ */ jsxs4("div", { className: "sd-note", style: { borderTop: "none" }, children: [
      /* @__PURE__ */ jsx4("b", { children: "\u5BF9\u8BDD\u5F0F\u7528\u6CD5" }),
      "\uFF1A\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u5468\u4E94\u4E0B\u53483\u70B9\u63D0\u9192\u6211\u53D6\u5FEB\u9012\u300D\u300C\u6BCF\u5929\u665A\u4E0A10\u70B9\u63D0\u9192\u80CC\u5355\u8BCD\u5E76\u6253\u5361\u300D\u300C\u8DDD\u79BB\u9AD8\u8003\u8FD8\u6709\u51E0\u5929\u300D\u300C\u8BA2\u9605\u6211\u7684\u8BFE\u8868 ICS \u94FE\u63A5\u300D\uFF0CAI \u4F1A\u8C03\u7528\u65E5\u6677\u7684 MCP \u5DE5\u5177\u76F4\u63A5\u843D\u5E93\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      /* @__PURE__ */ jsx4("b", { children: "\u63D0\u9192\u89E6\u8FBE" }),
      "\uFF1A\u5230\u671F\u63D0\u9192\u663E\u793A\u5728\u672C\u9762\u677F\u6A2A\u5E45\uFF08\u5E26\u63D0\u793A\u97F3\uFF09+ AI \u7684 sundial_today \u53EF\u89C1\u3002\u4E3B\u5E94\u7528\u6682\u672A\u63D0\u4F9B\u7CFB\u7EDF\u7EA7\u901A\u77E5\u901A\u9053\uFF0C\u62FF\u5230\u540E\u672C\u63D2\u4EF6\u4F1A\u8DDF\u8FDB\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      /* @__PURE__ */ jsx4("b", { children: "\u8DE8\u57DF\u8BF4\u660E" }),
      "\uFF1A\u9762\u677F\u96F6\u5916\u7F51\u8BF7\u6C42\uFF1BICS \u8BA2\u9605\u6293\u53D6\u7531\u540E\u53F0\u670D\u52A1\u539F\u751F fetch\uFF08\u5E26 SSRF \u5B88\u536B\u4E0E ETag \u6761\u4EF6\u8BF7\u6C42\uFF09\uFF0C\u684C\u9762 / \u624B\u673A / Web \u4E09\u7AEF\u7ECF cap.kv \u770B\u5230\u540C\u4E00\u4EFD\u6570\u636E\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      /* @__PURE__ */ jsx4("b", { children: "\u6392\u969C" }),
      "\uFF1A\u670D\u52A1\u65E5\u5FD7\u5728 ",
      /* @__PURE__ */ jsxs4("code", { children: [
        "{appConfigDir}",
        "/sundial.log"
      ] }),
      "\uFF08512KB \u8F6E\u8F6C\uFF09\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css2 = `
.sd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sd-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sd-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sd-body::-webkit-scrollbar{width:9px;height:9px}
.sd-body::-webkit-scrollbar-track{background:transparent}
.sd-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sd-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.sd-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.sd-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C77B3F,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.sd-tt{flex:1;min-width:0}
.sd-tt b{font-size:15px;display:block}
.sd-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.sd-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.sd-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.sd-dot.stale{background:#D29922}
.sd-dot.down{background:#F85149}
.sd-tabs{display:flex;gap:4px}
.sd-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.sd-tab:hover{color:#E6EAF2}
.sd-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sd-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.sd-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sd-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#C77B3F,#58A6FF);flex-shrink:0}
.sd-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sd-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sd-card-b{padding:11px 13px}
.sd-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.sd-btn:hover{filter:brightness(1.1)}
.sd-btn:disabled{opacity:.45;cursor:not-allowed}
.sd-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.sd-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.sd-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.sd-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.sd-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.sd-inp:focus{outline:none;border-color:#2b6cb0}
.sd-inp::placeholder{color:#4d5566}
.sd-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.sd-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.sd-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.sd-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.sd-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.sd-toast.bad{border-color:#54262c;color:#FF8A9A}
.sd-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.sd-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
`;
function SundialPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("today");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const cacheRef = useRef(newCache());
  const toastTimer = useRef(null);
  const audioCtxRef = useRef(null);
  const seenRemindRef = useRef(/* @__PURE__ */ new Set());
  const firstRemindLoadRef = useRef(true);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadSundial(cacheRef.current);
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect3(() => {
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
  useEffect3(() => {
    if (!data) return;
    const ids = new Set(data.reminders.map((r) => r.id));
    if (firstRemindLoadRef.current) {
      firstRemindLoadRef.current = false;
      seenRemindRef.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !seenRemindRef.current.has(id));
    seenRemindRef.current = ids;
    if (!fresh.length || document.visibilityState !== "visible") return;
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
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(1e-3, at + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.3);
      };
      const t = ctx.currentTime;
      play(880, t);
      play(1175, t + 0.18);
    } catch (_) {
    }
  }, [data]);
  const heartbeat = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = data.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const age = Date.now() - last;
    if (age < 180 * 1e3) return { cls: "ok", text: `\u65E5\u6677\u5728\u7EBF \xB7 ${data.events.length} \u4E8B\u4EF6 \xB7 \u6865 ${data.meta?.bridge || "?"}` };
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  const remindCount = data ? data.reminders.filter((r) => !data.acked[r.id] || data.acked[r.id] <= r.remindAt).length : 0;
  return /* @__PURE__ */ jsxs5("div", { className: "sd-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css2 }),
    /* @__PURE__ */ jsxs5("div", { className: "sd-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "sd-logo", children: "\u{1F31E}" }),
      /* @__PURE__ */ jsxs5("div", { className: "sd-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u65E5\u6677" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `sd-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "sd-tabs", children: [
        ["today", "\u4ECA\u65E5"],
        ["month", "\u65E5\u5386"],
        ["events", "\u4E8B\u4EF6"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `sd-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "today" && remindCount > 0 && /* @__PURE__ */ jsx5("span", { className: "sd-badge", children: remindCount > 9 ? "9+" : remindCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "sd-body", children: /* @__PURE__ */ jsxs5("div", { className: "sd-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "sd-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "today" && /* @__PURE__ */ jsx5(TodayTab, { data, reload, showToast }),
      tab === "month" && /* @__PURE__ */ jsx5(MonthTab, { data }),
      tab === "events" && /* @__PURE__ */ jsx5(EventsTab, { data, reload, showToast }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { pluginId, data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `sd-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function SundialEntry(props) {
  return /* @__PURE__ */ jsx6(SundialPanel, { ...props });
}
export {
  SundialEntry as default
};
