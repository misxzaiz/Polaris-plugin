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

// shared/datetime-core.js
var require_datetime_core = __commonJS({
  "shared/datetime-core.js"(exports, module) {
    "use strict";
    var CORE_VERSION = "0.1.0";
    var DAY_MS = 864e5;
    var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var DAY_NAMES_ZH = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
    var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var MONTH_INDEX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    function pad22(n) {
      return n < 10 ? "0" + n : String(n);
    }
    function pad42(n) {
      return n < 1e3 ? ("000" + n).slice(-4) : String(n);
    }
    function isLeap(y) {
      return y % 4 === 0 && y % 100 !== 0 || y % 400 === 0;
    }
    function daysInMonth(y, mo) {
      const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (mo === 2 && isLeap(y)) return 29;
      return table[mo - 1];
    }
    function utcMs(y, mo, d, h, mi, s, ms) {
      const dt = new Date(Date.UTC(2e3, mo - 1, d, h, mi, s, ms || 0));
      dt.setUTCFullYear(y);
      return dt.getTime();
    }
    function normalizeWall(y, mo, d, h, mi, s) {
      let carry = 0;
      let sec = s;
      carry = Math.floor(sec / 60);
      sec = sec - carry * 60;
      mi += carry;
      carry = Math.floor(mi / 60);
      mi = mi - carry * 60;
      h += carry;
      carry = Math.floor(h / 24);
      h = h - carry * 24;
      d += carry;
      carry = Math.floor((mo - 1) / 12);
      mo = mo - carry * 12;
      y += carry;
      while (d > daysInMonth(y, mo)) {
        d -= daysInMonth(y, mo);
        mo++;
        if (mo > 12) {
          mo = 1;
          y++;
        }
      }
      while (d < 1) {
        mo--;
        if (mo < 1) {
          mo = 12;
          y--;
        }
        d += daysInMonth(y, mo);
      }
      return { y, mo, d, h, mi, s: sec };
    }
    var fmtCache = /* @__PURE__ */ new Map();
    function getFormatter(zone) {
      let f = fmtCache.get(zone);
      if (!f) {
        f = new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23"
        });
        fmtCache.set(zone, f);
      }
      return f;
    }
    function isValidZone2(zone) {
      if (typeof zone !== "string" || zone.length === 0) return false;
      try {
        getFormatter(zone);
        return true;
      } catch (_) {
        return false;
      }
    }
    function localZone2() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch (_) {
        return "UTC";
      }
    }
    function listZones() {
      try {
        const z = Intl.supportedValuesOf("timeZone");
        if (Array.isArray(z) && z.length > 0) return z.slice();
      } catch (_) {
      }
      return [
        "UTC",
        "Asia/Shanghai",
        "Asia/Tokyo",
        "Asia/Kolkata",
        "Asia/Kathmandu",
        "Asia/Dubai",
        "Europe/London",
        "Europe/Paris",
        "Europe/Berlin",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "America/Sao_Paulo",
        "Australia/Sydney",
        "Pacific/Auckland",
        "Pacific/Kiritimati",
        "Pacific/Chatham",
        "Pacific/Marquesas",
        "Australia/Lord_Howe"
      ];
    }
    function wallPartsOf(ms, zone) {
      const parts = getFormatter(zone).formatToParts(new Date(ms));
      const get = (type) => {
        for (const p of parts) if (p.type === type) return p.value;
        return "";
      };
      const y = parseInt(get("year"), 10);
      const mo = parseInt(get("month"), 10);
      const d = parseInt(get("day"), 10);
      const h = parseInt(get("hour"), 10);
      const mi = parseInt(get("minute"), 10);
      const s = parseInt(get("second"), 10);
      const asUTC = utcMs(y, mo, d, h, mi, s, 0);
      const offsetMin = Math.round((asUTC - ms) / 6e4);
      const weekday = new Date(asUTC).getUTCDay();
      return { wall: { y, mo, d, h, mi, s }, asUTC, offsetMin, weekday };
    }
    function getOffset(ms, zone) {
      return wallPartsOf(ms, zone).offsetMin;
    }
    function projectZone2(ms, zone) {
      const wp = wallPartsOf(ms, zone);
      const jan = getOffset(utcMs(wp.wall.y, 1, 15, 12, 0, 0, 0), zone);
      const jul = getOffset(utcMs(wp.wall.y, 7, 15, 12, 0, 0, 0), zone);
      const stdOffset = Math.min(jan, jul);
      const isDST = wp.offsetMin > stdOffset;
      return {
        zone,
        wall: wp.wall,
        offsetMin: wp.offsetMin,
        isDST,
        stdOffset,
        weekday: wp.weekday,
        weekdayEn: DAY_NAMES[wp.weekday],
        weekdayZh: DAY_NAMES_ZH[wp.weekday]
      };
    }
    function wallMatches(ms, wall, zone) {
      const p = projectZone2(ms, zone).wall;
      return p.y === wall.y && p.mo === wall.mo && p.d === wall.d && p.h === wall.h && p.mi === wall.mi && p.s === wall.s;
    }
    function findTransition(zone, lo, hi, afterOffset) {
      let a = lo, b = hi;
      while (b - a > 1e3) {
        const mid = Math.floor((a + b) / 2);
        if (getOffset(mid, zone) === afterOffset) b = mid;
        else a = mid;
      }
      return b;
    }
    function resolveWall2(wall, zone) {
      const wallAsUTC = utcMs(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s, 0);
      const o1 = getOffset(wallAsUTC - DAY_MS, zone);
      const o2 = getOffset(wallAsUTC + DAY_MS, zone);
      const candSet = [];
      const c1 = wallAsUTC - o1 * 6e4;
      const c2 = wallAsUTC - o2 * 6e4;
      if (candSet.indexOf(c1) === -1) candSet.push(c1);
      if (candSet.indexOf(c2) === -1) candSet.push(c2);
      candSet.sort((a, b) => a - b);
      const valid = candSet.filter((c) => wallMatches(c, wall, zone));
      if (valid.length === 1) {
        return {
          status: "unique",
          zone,
          wall,
          instantMs: valid[0],
          offsetMin: getOffset(valid[0], zone),
          secondInstantMs: null,
          secondOffsetMin: null,
          transition: null,
          skippedMinutes: 0,
          wallJustBefore: null,
          wallJustAfter: null,
          offsetChanged: o1 !== o2,
          note: o1 !== o2 ? "\u8BE5\u65F6\u533A\u5728\u9644\u8FD1\u53D1\u751F\u8FC7\u504F\u79FB\u5207\u6362\uFF08\u975E\u5178\u578B DST \u53CC\u5411\u5207\u6362\uFF09\uFF0C\u5899\u949F\u65F6\u95F4\u552F\u4E00\u5B58\u5728" : ""
        };
      }
      if (valid.length === 2) {
        const transition2 = findTransition(zone, valid[0], valid[1], o2);
        const first = projectZone2(valid[0], zone);
        const second = projectZone2(valid[1], zone);
        return {
          status: "ambiguous",
          zone,
          wall,
          instantMs: valid[0],
          offsetMin: first.offsetMin,
          secondInstantMs: valid[1],
          secondOffsetMin: second.offsetMin,
          transition: transition2,
          skippedMinutes: 0,
          wallJustBefore: null,
          wallJustAfter: null,
          offsetChanged: true,
          note: "\u65F6\u949F\u56DE\u62E8\uFF1A\u8BE5\u5899\u949F\u65F6\u95F4\u51FA\u73B0\u4E24\u6B21\uFF0C\u65E9\u7684\u4E00\u6B21\u662F\u9996\u4E2A\u771F\u5B9E\u65F6\u523B\uFF08\u8F6C\u6362\u524D\u7684\u504F\u79FB " + fmtOffsetMin2(first.offsetMin) + "\uFF0C\u665A\u7684\u4E00\u6B21 " + fmtOffsetMin2(second.offsetMin) + "\uFF09"
        };
      }
      const transition = findTransition(zone, candSet[0], candSet[1], o2);
      const skippedMinutes = Math.abs(o1 - o2);
      const wallJustBefore = projectZone2(transition - 1, zone).wall;
      const wallJustAfter = projectZone2(transition, zone).wall;
      return {
        status: "gap",
        zone,
        wall,
        instantMs: null,
        offsetMin: null,
        secondInstantMs: null,
        secondOffsetMin: null,
        transition,
        skippedMinutes,
        wallJustBefore,
        wallJustAfter,
        offsetChanged: true,
        note: "\u65F6\u949F\u524D\u62E8\uFF1A\u8BE5\u5899\u949F\u65F6\u95F4\u4E0D\u5B58\u5728\uFF08DST \u7A7A\u6D1E\uFF09\uFF0C\u771F\u5B9E\u65F6\u95F4\u5728\u5207\u6362\u77AC\u95F4\u4ECE " + fmtOffsetMin2(o1) + " \u76F4\u63A5\u8DF3\u5230 " + fmtOffsetMin2(o2) + "\uFF0C\u5899\u949F " + pad22(wallJustBefore.h) + ":" + pad22(wallJustBefore.mi) + ":" + pad22(wallJustBefore.s) + " \u4E4B\u540E\u76F4\u63A5\u662F " + pad22(wallJustAfter.h) + ":" + pad22(wallJustAfter.mi) + ":" + pad22(wallJustAfter.s)
      };
    }
    function fmtOffsetMin2(min) {
      if (min === 0) return "Z";
      const sign = min < 0 ? "-" : "+";
      const abs = Math.abs(min);
      const h = Math.floor(abs / 60);
      const m = abs - h * 60;
      return sign + pad22(h) + ":" + pad22(m);
    }
    function fmtOffsetRFC(min) {
      if (min === 0) return "+0000";
      const abs = Math.abs(min);
      const h = Math.floor(abs / 60);
      const m = abs - h * 60;
      return (min < 0 ? "-" : "+") + pad22(h) + pad22(m);
    }
    function isoWeekOf(y, mo, d) {
      const noon = utcMs(y, mo, d, 12, 0, 0, 0);
      const dayNum = (new Date(noon).getUTCDay() + 6) % 7;
      const thursday = noon - (dayNum - 3) * DAY_MS;
      const weekYear = new Date(thursday).getUTCFullYear();
      const jan1 = utcMs(weekYear, 1, 1, 12, 0, 0, 0);
      const jan1DayNum = (new Date(jan1).getUTCDay() + 6) % 7;
      const week = Math.round(((thursday - jan1) / DAY_MS - jan1DayNum) / 7) + 1;
      return { year: weekYear, week, weekday: dayNum + 1 };
    }
    function dayOfYear(y, mo, d) {
      let n = 0;
      for (let m = 1; m < mo; m++) n += daysInMonth(y, m);
      return n + d;
    }
    function formatAll2(ms, zone) {
      const p = projectZone2(ms, zone);
      const w = p.wall;
      const iso = pad42(w.y) + "-" + pad22(w.mo) + "-" + pad22(w.d) + "T" + pad22(w.h) + ":" + pad22(w.mi) + ":" + pad22(w.s) + (p.offsetMin === 0 ? "Z" : fmtOffsetMin2(p.offsetMin));
      const rfc3339 = iso;
      const rfc2822 = DAY_NAMES[p.weekday] + ", " + pad22(w.d) + " " + MONTH_NAMES[w.mo - 1] + " " + pad42(w.y) + " " + pad22(w.h) + ":" + pad22(w.mi) + ":" + pad22(w.s) + " " + fmtOffsetRFC(p.offsetMin);
      const u = new Date(Math.round(ms));
      const http = DAY_NAMES[u.getUTCDay()] + ", " + pad22(u.getUTCDate()) + " " + MONTH_NAMES[u.getUTCMonth()] + " " + pad42(u.getUTCFullYear()) + " " + pad22(u.getUTCHours()) + ":" + pad22(u.getUTCMinutes()) + ":" + pad22(u.getUTCSeconds()) + " GMT";
      const wk = isoWeekOf(w.y, w.mo, w.d);
      const msExact = Math.round(ms);
      return {
        iso,
        rfc3339,
        rfc2822,
        http,
        unixSeconds: Math.floor(msExact / 1e3),
        unixMillis: msExact,
        isoWeek: pad42(wk.year) + "-W" + pad22(wk.week) + "-" + wk.weekday,
        isoWeekDetail: wk,
        dayOfYear: dayOfYear(w.y, w.mo, w.d),
        weekdayEn: p.weekdayEn,
        weekdayZh: p.weekdayZh,
        offsetMin: p.offsetMin,
        offsetText: fmtOffsetMin2(p.offsetMin),
        zone,
        wall: w
      };
    }
    var RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:([Tt ])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;
    var RE_YM = /^(\d{4})-(\d{2})$/;
    var RE_NUM = /^(-)?(\d{1,20})(?:\.(\d{1,9}))?$/;
    var RE_2822 = /^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[+-]\d{2}:?\d{2}|[A-Za-z]{1,5})?$/i;
    var RE_HTTP = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
    var ZONE_NAME_MIN = { UT: 0, GMT: 0, UTC: 0, Z: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };
    function parseOffsetToken(tok) {
      if (tok === void 0 || tok === "") return { ok: true, offsetMin: null, hasOffset: false };
      if (tok === "Z" || tok === "z") return { ok: true, offsetMin: 0, hasOffset: true };
      const m = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(tok);
      if (m) {
        const h = parseInt(m[2], 10);
        const mi = m[3] ? parseInt(m[3], 10) : 0;
        if (mi > 59) return { ok: false, error: "\u504F\u79FB\u5206\u949F " + mi + " \u8D8A\u754C\uFF080-59\uFF09" };
        const off = (m[1] === "-" ? -1 : 1) * (h * 60 + mi);
        return { ok: true, offsetMin: off, hasOffset: true, extreme: h > 14 };
      }
      return { ok: false, error: "\u65E0\u6CD5\u8BC6\u522B\u7684\u504F\u79FB\u5F62\u6001\u300C" + tok + "\u300D" };
    }
    function checkDateRange(y, mo, d) {
      if (mo < 1 || mo > 12) return "\u6708\u4EFD " + mo + " \u8D8A\u754C\uFF081-12\uFF09";
      const dim = daysInMonth(y, mo);
      if (d < 1 || d > dim) return y + " \u5E74 " + mo + " \u6708\u6CA1\u6709 " + d + " \u65E5\uFF08\u8BE5\u6708\u53EA\u6709 " + dim + " \u5929" + (d === 29 && mo === 2 ? "\uFF0C" + y + " \u4E0D\u662F\u95F0\u5E74" : "") + "\uFF09";
      return "";
    }
    function weekdayOfUTC(y, mo, d) {
      return new Date(utcMs(y, mo, d, 12, 0, 0, 0)).getUTCDay();
    }
    function jsDateParse(text) {
      try {
        const v = Date.parse(text);
        return Number.isNaN(v) ? null : v;
      } catch (_) {
        return null;
      }
    }
    function parseUnixNumeric(neg, intDigits, frac) {
      const n = intDigits.length;
      const sign = neg ? -1n : 1n;
      const v = BigInt(intDigits);
      const fracMs = frac ? Math.floor(parseInt(frac.padEnd(3, "0").slice(0, 3), 10)) : 0;
      const candidates = [];
      if (n <= 11) candidates.push({ unit: "\u79D2", canon: 10, div: null, mul: 1000n });
      if (n <= 14) candidates.push({ unit: "\u6BEB\u79D2", canon: 13, div: null, mul: 1n });
      if (n <= 17) candidates.push({ unit: "\u5FAE\u79D2", canon: 16, div: 1000n, mul: null });
      if (n <= 20) candidates.push({ unit: "\u7EB3\u79D2", canon: 19, div: 1000000n, mul: null });
      const plausible = [];
      for (const c of candidates) {
        const msBig = c.div ? sign * (v / c.div) : sign * v * c.mul;
        if (msBig > 10440960000000n || msBig < -62135596800000n) continue;
        plausible.push({ unit: c.unit, score: Math.abs(n - c.canon), ms: Number(msBig) });
      }
      if (plausible.length === 0) {
        return { ok: false, error: "\u6570\u5B57\u4E32 " + (neg ? "-" : "") + intDigits + " \u6309\u79D2/\u6BEB\u79D2/\u5FAE\u79D2/\u7EB3\u79D2\u89E3\u8BFB\u90FD\u843D\u5728 1970-2300 \u4E4B\u5916\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5355\u4F4D" };
      }
      plausible.sort((a, b) => a.score - b.score);
      const chosen = plausible[0];
      const ambiguous = plausible.filter((p) => p !== chosen && p.score - chosen.score <= 1);
      const y = new Date(chosen.ms).getUTCFullYear();
      return {
        ok: true,
        kind: "unix",
        unit: chosen.unit,
        ms: chosen.ms + (chosen.unit === "\u79D2" ? fracMs : 0),
        ambiguous,
        yearFromUnit: y
      };
    }
    function analyze2(text, opts) {
      const o = opts || {};
      const zone = isValidZone2(o.zone) ? o.zone : localZone2();
      const raw = String(text == null ? "" : text).trim();
      const pits = [];
      const notes = [];
      const base = {
        input: raw,
        zone,
        pits,
        notes,
        ok: false,
        kind: "",
        kindText: "",
        instant: null,
        js: null,
        unit: null,
        isoWeek: null,
        floating: null,
        error: ""
      };
      const fail = (error) => Object.assign({}, base, { ok: false, error });
      function finish(kind, kindText, instant, extra) {
        const out = Object.assign({}, base, {
          ok: true,
          kind,
          kindText,
          instant: instant ? {
            ms: instant.ms,
            isoUtc: new Date(instant.ms).toISOString().replace(".000Z", "Z"),
            leapSecond: !!instant.leapSecond
          } : null
        }, extra || {});
        const jsMs = jsDateParse(raw);
        const agrees = jsMs !== null && instant !== null && instant.ms === jsMs;
        out.js = { parseMs: jsMs, agrees };
        const localZ = localZone2();
        const isFloating = kind === "floating";
        const jsDiffApplicable = kind !== "now" && kind.indexOf("unix") !== 0 && kind !== "year-only";
        if (instant !== null && jsMs !== null && !agrees && (kind !== "now" && (!isFloating || zone === localZ)) && jsDiffApplicable) {
          pits.push({ code: "js-disagrees", level: "warn", message: "JS Date.parse \u4E0E\u672C\u5F15\u64CE\u76F8\u5DEE " + Math.abs(jsMs - instant.ms) + " ms\uFF08JS \u5F97 " + new Date(jsMs).toISOString() + "\uFF09\u2014\u2014\u672C\u5F15\u64CE\u6309\u8BED\u6CD5\u8868\u6743\u5A01\u89E3\u8BFB\uFF0CJS \u4FA7\u884C\u4E3A\u4EE5 js.parseMs \u5B9E\u51B5\u4E3A\u51C6" });
        }
        if (instant !== null && jsMs === null && jsDiffApplicable) {
          pits.push({ code: "js-rejects", level: "info", message: "\u672C\u8FD0\u884C\u65F6 Date.parse \u5BF9\u8BE5\u8F93\u5165\u8FD4\u56DE NaN\uFF08ES \u89C4\u8303\u8BED\u6CD5\u4E4B\u5916\uFF09\u2014\u2014JS \u4FA7\u9700\u5148\u6309\u672C\u62A5\u544A\u89E3\u8BFB\u518D\u81EA\u884C\u6784\u9020 Date" });
        }
        return out;
      }
      if (raw === "") return fail("\u8F93\u5165\u4E3A\u7A7A");
      if (raw.toLowerCase() === "now") {
        const ms = Date.now();
        return finish("now", "\u5F53\u524D\u65F6\u523B", { ms }, { js: { parseMs: null, agrees: false } });
      }
      const mNum = RE_NUM.exec(raw);
      if (mNum && (mNum[1] || mNum[3] || mNum[2].length > 4)) {
        const u = parseUnixNumeric(mNum[1], mNum[2], mNum[3]);
        if (!u.ok) return fail(u.error);
        const extra = { unit: u.unit };
        if (u.ambiguous.length > 0) {
          pits.push({ code: "unix-unit-ambiguous", level: "warn", message: "\u8BE5\u4F4D\u6570\u6309\u300C" + u.unit + "\u300D\u89E3\u8BFB\u4E3A " + u.yearFromUnit + " \u5E74\uFF1B\u5907\u9009\u5355\u4F4D\u300C" + u.ambiguous.map((a) => a.unit).join("\u300D\u6216\u300C") + "\u300D\u4E5F\u5728\u5408\u7406\u5E74\u4EFD\u5185\u2014\u2014\u786E\u8BA4\u4E0A\u6E38\u4EA7\u51FA\u7684\u5355\u4F4D" });
        }
        if (u.unit === "\u79D2" && u.ms > 2147483647e3) {
          pits.push({ code: "year-2038", level: "warn", message: "Unix \u79D2\u5DF2\u8D85\u51FA 32 \u4F4D time_t \u4E0A\u9650\uFF082038-01-19T03:14:07Z \u4E4B\u540E\uFF09\uFF0C32 \u4F4D\u7CFB\u7EDF/\u65E7\u5E93\u4F1A\u6EA2\u51FA" });
        }
        if (u.unit !== "\u6BEB\u79D2" && u.unit !== "\u79D2") {
          notes.push("\u4E9A\u6BEB\u79D2\u5355\u4F4D\uFF08" + u.unit + "\uFF09\u8D85\u51FA JS Date \u7CBE\u5EA6\uFF0C\u5DF2\u6298\u7B97\u5230\u6BEB\u79D2\uFF08\u4F59\u6570\u622A\u65AD\uFF09");
        }
        return finish(u.unit === "\u6BEB\u79D2" || u.unit === "\u79D2" ? "unix" : "unix-subsec", "Unix \u65F6\u95F4\u6233\uFF08" + u.unit + "\uFF09", { ms: u.ms }, extra);
      }
      if (mNum) {
        const y = parseInt(mNum[2], 10) * (mNum[1] ? -1 : 1);
        const ms = utcMs(y, 1, 1, 0, 0, 0, 0);
        pits.push({ code: "bare-year", level: "info", message: "\u300C" + raw + "\u300D\u6309\u5E74\u4EFD\u89E3\u8BFB\uFF08" + y + '-01-01T00:00:00 UTC\uFF0C\u4E0E new Date("' + raw + '") \u540C\u8BED\u4E49\uFF09\uFF1B\u82E5\u60F3\u8868\u8FBE Unix \u79D2\u8BF7\u8865\u8DB3\u4F4D\u6570\u6216\u524D\u7F00' });
        return finish("year-only", "\u5E74\u4EFD", { ms }, {});
      }
      const mHttp = RE_HTTP.exec(raw);
      if (mHttp) {
        const d = parseInt(mHttp[2], 10), mo = MONTH_INDEX[mHttp[3].toLowerCase()], y = parseInt(mHttp[4], 10);
        const h = parseInt(mHttp[5], 10), mi = parseInt(mHttp[6], 10), s = parseInt(mHttp[7], 10);
        const rangeErr = checkDateRange(y, mo, d);
        if (rangeErr) return fail(rangeErr);
        if (h > 23 || mi > 59 || s > 59) return fail("\u65F6\u95F4\u5206\u91CF\u8D8A\u754C\uFF08\u65F6 0-23\u3001\u5206/\u79D2 0-59\uFF09");
        const wd = weekdayOfUTC(y, mo, d);
        const ms = utcMs(y, mo, d, h, mi, s, 0);
        if (DAY_NAMES[wd] !== mHttp[1]) {
          pits.push({ code: "weekday-mismatch", level: "warn", message: "\u661F\u671F\u540D " + mHttp[1] + " \u4E0E\u5B9E\u9645 " + DAY_NAMES[wd] + "\uFF08" + raw + " \u7684\u65E5\u671F\uFF09\u4E0D\u7B26\u2014\u2014RFC 7231 \u8981\u6C42\u4E00\u81F4\uFF0C\u810F\u6570\u636E\u5E38\u89C1\uFF0C\u4E25\u683C\u63A5\u6536\u7AEF\u4F1A\u62D2\u6536" });
        }
        return finish("http-date", "HTTP \u65E5\u671F\uFF08IMF-fixdate\uFF0C\u6052 GMT\uFF09", { ms }, {});
      }
      const m2822 = RE_2822.exec(raw);
      if (m2822) {
        const d = parseInt(m2822[2], 10);
        const mo = MONTH_INDEX[m2822[3].toLowerCase()];
        let y = parseInt(m2822[4], 10);
        const h = parseInt(m2822[5], 10), mi = parseInt(m2822[6], 10);
        const s = m2822[7] ? parseInt(m2822[7], 10) : 0;
        if (m2822[4].length === 2) {
          y = y < 50 ? 2e3 + y : 1900 + y;
          pits.push({ code: "two-digit-year", level: "warn", message: "\u4E24\u4F4D\u5E74\u6309 RFC 2822 \u8FC7\u65F6\u89C4\u5219\u5C55\u5F00\u4E3A " + y + "\uFF0800-49\u219220xx\uFF0C50-99\u219219xx\uFF09\uFF1B\u53E6\u6709\u65E7\u5B9E\u73B0\u6309 +1900 \u5904\u7406\uFF0C\u8DE8\u89E3\u6790\u5668\u7ED3\u679C\u53EF\u80FD\u5206\u6B67" });
        }
        if (y < 1 || y > 9999) return fail("\u5E74\u4EFD " + y + " \u8D8A\u754C");
        const rangeErr = checkDateRange(y, mo, d);
        if (rangeErr) return fail(rangeErr);
        if (h > 23 || mi > 59 || s > 59) return fail("\u65F6\u95F4\u5206\u91CF\u8D8A\u754C\uFF08\u65F6 0-23\u3001\u5206/\u79D2 0-59\uFF09");
        const zoneTok = m2822[8];
        let off = null;
        if (zoneTok && zoneTok.charAt(0) !== "+" && zoneTok.charAt(0) !== "-") {
          const key = zoneTok.toUpperCase();
          if (Object.prototype.hasOwnProperty.call(ZONE_NAME_MIN, key)) off = ZONE_NAME_MIN[key];
          else {
            off = 0;
            pits.push({ code: "unknown-zone-name", level: "warn", message: "\u65F6\u533A\u540D\u300C" + zoneTok + "\u300D\u4E0D\u5728 RFC 5322 \u5DF2\u77E5\u8868\u5185\uFF0C\u6309 -0000 \u5904\u7406\uFF1BRFC 5322 \u89C4\u5B9A\u672A\u77E5\u533A\u540D\u5E94\u89C6\u4F5C\u672C\u5730\u65F6\u95F4\u2014\u2014\u63A5\u6536\u7AEF\u8BED\u4E49\u53EF\u80FD\u5206\u6B67" });
          }
        } else if (zoneTok) {
          const po = parseOffsetToken(zoneTok.replace(":", ""));
          if (!po.ok) return fail(po.error);
          off = po.offsetMin;
          if (po.extreme) pits.push({ code: "offset-extreme", level: "warn", message: "\u504F\u79FB " + zoneTok + " \u8D85\u8FC7 \xB114:00\u2014\u2014\u73B0\u5B9E\u65F6\u533A\u4E0D\u5B58\u5728\u8BE5\u504F\u79FB\uFF0C\u7591\u4F3C\u810F\u6570\u636E" });
        }
        const wd = weekdayOfUTC(y, mo, d);
        if (m2822[1] && DAY_NAMES[wd].toLowerCase() !== m2822[1].toLowerCase()) {
          pits.push({ code: "weekday-mismatch", level: "warn", message: "\u661F\u671F\u540D " + m2822[1] + " \u4E0E\u5B9E\u9645 " + DAY_NAMES[wd] + " \u4E0D\u7B26\u2014\u2014RFC 2822 \u8981\u6C42\u4E00\u81F4\uFF0C\u810F\u6570\u636E\u5E38\u89C1" });
        }
        const wallUTC = utcMs(y, mo, d, h, mi, s, 0);
        const ms = off === null ? null : wallUTC - off * 6e4;
        if (ms === null) {
          const rv = resolveWall2({ y, mo, d, h, mi, s }, zone);
          pits.push({ code: "zoneless-floating", level: "warn", message: "\u65E0\u65F6\u533A\u7684\u65F6\u95F4\uFF1A\u8BED\u4E49\u4F9D\u8D56\u8FD0\u884C\u73AF\u5883\uFF08\u672C\u5F15\u64CE\u6309\u89E3\u8BFB\u65F6\u533A " + zone + " \u6D88\u89E3\uFF1Bdate-only \u5374\u6309 UTC\u2014\u2014\u540C\u4E00\u8BED\u8A00\u4E24\u5957\u89C4\u5219\uFF09" });
          if (rv.status === "unique") return finish("floating", "RFC 2822 \u65E0\u65F6\u533A\uFF08floating\uFF0C\u6309 " + zone + " \u89E3\u8BFB\uFF09", { ms: rv.instantMs }, { floating: { zone, status: rv.status, resolve: rv } });
          return finish("floating", "RFC 2822 \u65E0\u65F6\u533A\uFF08floating\uFF0C\u6309 " + zone + " \u89E3\u8BFB\uFF09", { ms: rv.instantMs || rv.transition }, { floating: { zone, status: rv.status, resolve: rv } });
        }
        return finish("rfc2822", "RFC 2822 \u90AE\u4EF6\u65E5\u671F", { ms }, {});
      }
      const mIso = RE_ISO.exec(raw);
      if (mIso) {
        const y = parseInt(mIso[1], 10), mo = parseInt(mIso[2], 10), d = parseInt(mIso[3], 10);
        const rangeErr = checkDateRange(y, mo, d);
        if (rangeErr) return fail(rangeErr);
        const sep = mIso[4];
        if (sep === void 0) {
          const ms2 = utcMs(y, mo, d, 0, 0, 0, 0);
          pits.push({ code: "date-only-utc", level: "warn", message: "date-only\u300C" + raw + "\u300D\u6309 ES \u89C4\u8303\u89E3\u6790\u4E3A UTC \u96F6\u70B9\uFF1B\u800C new Date(" + y + ", " + (mo - 1) + ", " + d + ") \u662F\u672C\u5730\u65F6\u533A\u96F6\u70B9\u2014\u2014UTC+8 \u4E0B\u4E24\u8005\u76F8\u5DEE 8 \u5C0F\u65F6\uFF0C\u65E5\u7A0B/\u7EDF\u8BA1\u5E38\u7528\u9519" });
          const wk = isoWeekOf(y, mo, d);
          if (wk.year !== y) pits.push({ code: "week-year-mismatch", level: "info", message: "\u8BE5\u65E5\u671F\u7684 ISO \u5468\u65E5\u671F\u662F " + pad42(wk.year) + "-W" + pad22(wk.week) + "\u2014\u2014\u5468\u5E74 " + wk.year + " \u4E0E\u65E5\u5386\u5E74 " + y + " \u4E0D\u540C\uFF08\u8DE8\u5E74\u5468\u5F52\u5C5E\uFF09\uFF0C\u6309\u5468\u7EDF\u8BA1\u65F6\u522B\u62FF\u9519\u5E74\u4EFD" });
          return finish("date-only", "\u65E5\u671F\uFF08\u65E0\u65F6\u95F4\uFF0CES \u89C4\u8303\u6309 UTC \u96F6\u70B9\uFF09", { ms: ms2 }, { isoWeek: pad42(wk.year) + "-W" + pad22(wk.week) + "-" + wk.weekday });
        }
        const h = parseInt(mIso[5], 10), mi = parseInt(mIso[6], 10);
        const s = mIso[7] ? parseInt(mIso[7], 10) : 0;
        if (h > 23 || mi > 59) return fail("\u65F6\u95F4\u5206\u91CF\u8D8A\u754C\uFF08\u65F6 0-23\u3001\u5206 0-59\uFF09");
        const frac = mIso[8];
        const fracMs = frac ? Math.floor(parseInt(frac.padEnd(3, "0").slice(0, 3), 10)) : 0;
        if (frac && frac.length > 3) notes.push("\u5C0F\u6570\u79D2 " + frac.length + " \u4F4D\u8D85\u51FA\u6BEB\u79D2\u7CBE\u5EA6\uFF0C\u5DF2\u622A\u65AD\u5230 " + fracMs + " ms");
        const zoneTok = mIso[9];
        const po = parseOffsetToken(zoneTok);
        if (!po.ok) return fail(po.error);
        if (po.extreme) pits.push({ code: "offset-extreme", level: "warn", message: "\u504F\u79FB " + zoneTok + " \u8D85\u8FC7 \xB114:00\u2014\u2014\u73B0\u5B9E\u65F6\u533A\u4E0D\u5B58\u5728\u8BE5\u504F\u79FB" });
        const leap = s === 60;
        if (leap && mi !== 59) return fail("\u79D2 60\uFF08\u95F0\u79D2\uFF09\u53EA\u5141\u8BB8\u51FA\u73B0\u5728 xx:59:60");
        if (leap) pits.push({ code: "leap-second", level: "warn", message: "\u95F0\u79D2 xx:59:60\uFF1AJS Date \u4E0D\u63A5\u53D7\uFF08new Date(...) \u5F97 Invalid Date\uFF09\uFF1B\u672C\u5F15\u64CE\u6620\u5C04\u5230\u4E0B\u4E00\u5206\u949F\u8FB9\u754C\u524D\u4E00\u79D2\u7684\u771F\u5B9E\u77AC\u95F4" });
        const wallUTC = leap ? utcMs(y, mo, d, h, mi + 1, 0, fracMs) - 1e3 + fracMs : utcMs(y, mo, d, h, mi, s, fracMs);
        const kindTextBase = sep === " " ? "\uFF08\u7A7A\u683C\u5206\u9694\uFF0CES \u89C4\u8303\u8BED\u6CD5\u5916\u3001V8 \u7B49\u6309\u672C\u5730\u65F6\u533A\u63A5\u53D7\u7684\u5E7F\u6CDB\u6269\u5C55\uFF09" : "";
        if (!po.hasOffset) {
          const rv = resolveWall2({ y, mo, d, h, mi, s: leap ? 59 : s }, zone);
          pits.push({ code: "zoneless-floating", level: "warn", message: "\u65E0\u504F\u79FB\u7684 date-time\uFF1AES \u89C4\u8303\u6309\u672C\u5730\u65F6\u533A\u89E3\u8BFB\uFF08date-only \u5374\u6309 UTC \u96F6\u70B9\uFF09\u2014\u2014\u540C\u4E00\u8BED\u8A00\u4E24\u5957\u89C4\u5219\uFF0C\u8DE8\u65F6\u533A\u90E8\u7F72\u7684\u670D\u52A1\u7AEF/\u6D4F\u89C8\u5668\u4F1A\u7ED9\u51FA\u4E0D\u540C\u77AC\u95F4" + kindTextBase });
          if (rv.status !== "unique") {
            pits.push(rv.status === "gap" ? { code: "dst-gap", level: "error", message: "\u8BE5\u5899\u949F\u65F6\u95F4\u5728 " + zone + " \u4E0D\u5B58\u5728\uFF08\u590F\u4EE4\u65F6\u524D\u62E8\u8DF3\u8FC7 " + rv.gapSeconds / 60 + " \u5206\u949F\uFF0C\u5207\u6362\u77AC\u95F4 " + new Date(rv.transition).toISOString() + "\uFF09\u2014\u2014\u5B9E\u9645\u4F1A\u843D\u5230\u5207\u6362\u540E\u6216\u524D\uFF0C\u53D6\u51B3\u4E8E\u89E3\u6790\u5668" } : { code: "dst-ambiguous", level: "warn", message: "\u8BE5\u5899\u949F\u65F6\u95F4\u5728 " + zone + " \u51FA\u73B0\u4E24\u6B21\uFF08\u590F\u4EE4\u65F6\u56DE\u62E8\uFF0C\u8F6C\u6362\u77AC\u95F4 " + new Date(rv.transition).toISOString() + "\uFF09\u2014\u2014\u4E0D\u540C\u89E3\u6790\u5668\u4F1A\u53D6\u4E0D\u540C\u4E00\u6B21\uFF0C\u672C\u5F15\u64CE\u53D6\u65E9\u7684\u4E00\u6B21" });
          }
          const resolvedMs = rv.status === "gap" ? rv.transition : rv.instantMs;
          return finish("floating", "\u65E0\u65F6\u533A\u65F6\u95F4" + kindTextBase + "\uFF08\u6309 " + zone + " \u6D88\u89E3\uFF09", { ms: resolvedMs, leapSecond: leap }, { floating: { zone, status: rv.status, resolve: rv } });
        }
        const ms = wallUTC - po.offsetMin * 6e4;
        if (zoneTok === "z") notes.push("\u5C0F\u5199 z \u88AB V8 \u7B49\u63A5\u53D7\u4F46 ES \u89C4\u8303\u8BED\u6CD5\u53EA\u8BA4\u5927\u5199 Z\u2014\u2014\u4E25\u683C\u89E3\u6790\u5668\u4F1A\u62D2");
        if (/[+-]\d{4}$/.test(raw)) notes.push("\u65E0\u5192\u53F7\u504F\u79FB\uFF08+HHMM\uFF09\uFF1AISO 8601 \u57FA\u672C\u683C\u5F0F\u5408\u6CD5\uFF0C\u4F46 RFC 3339 \u4E0E ES \u89C4\u8303\u53EA\u8BA4 \xB1HH:MM\u2014\u2014\u8DE8\u89E3\u6790\u5668\u53EF\u80FD\u88AB\u62D2");
        return finish("iso", "ISO 8601 / RFC 3339" + kindTextBase, { ms, leapSecond: leap }, {});
      }
      const mYm = RE_YM.exec(raw);
      if (mYm) {
        const y = parseInt(mYm[1], 10), mo = parseInt(mYm[2], 10);
        if (mo < 1 || mo > 12) return fail("\u6708\u4EFD " + mo + " \u8D8A\u754C\uFF081-12\uFF09");
        const ms = utcMs(y, mo, 1, 0, 0, 0, 0);
        pits.push({ code: "month-only-utc", level: "info", message: "\u5E74-\u6708\u7C92\u5EA6\u6309 " + pad42(y) + "-" + pad22(mo) + '-01T00:00:00 UTC \u89E3\u8BFB\uFF08new Date("' + raw + '") \u540C\u8BED\u4E49\uFF09\u2014\u2014\u522B\u628A\u5B83\u5F53\u6708\u5C3E\u6216\u672C\u5730\u6708\u521D' });
        return finish("month-only", "\u5E74-\u6708\uFF08\u6309\u5F53\u6708 1 \u65E5 UTC \u96F6\u70B9\uFF09", { ms }, {});
      }
      const supported = "\u652F\u6301\uFF1Anow\uFF1BUnix \u79D2/\u6BEB\u79D2/\u5FAE\u79D2/\u7EB3\u79D2\uFF1BISO 8601 / RFC 3339\uFF08YYYY-MM-DD[T ]HH:MM[:SS][.f][Z|\xB1HH:MM|\xB1HHMM]\uFF09\uFF1BYYYY-MM\uFF1BYYYY\uFF1BRFC 2822 \u90AE\u4EF6\u65E5\u671F\uFF1BHTTP \u65E5\u671F\uFF08IMF-fixdate\uFF09";
      return fail("\u65E0\u6CD5\u8BC6\u522B\u7684\u65E5\u671F\u65F6\u95F4\u5F62\u6001\u300C" + raw + "\u300D\u3002" + supported);
    }
    function addDuration2(ms, amount, zone, mode) {
      const a = amount || {};
      const years = Math.trunc(a.years || 0), months = Math.trunc(a.months || 0);
      const days = Math.trunc(a.days || 0), hours = Math.trunc(a.hours || 0);
      const minutes = Math.trunc(a.minutes || 0), seconds = Math.trunc(a.seconds || 0);
      const pits = [];
      const mode2 = mode || "both";
      let calendar = null;
      if (mode2 === "calendar" || mode2 === "both") {
        const p = projectZone2(ms, zone);
        let y = p.wall.y + years, mo = p.wall.mo + months;
        const norm = { y, mo };
        while (norm.mo > 12) {
          norm.mo -= 12;
          norm.y++;
        }
        while (norm.mo < 1) {
          norm.mo += 12;
          norm.y--;
        }
        const dim = daysInMonth(norm.y, norm.mo);
        let d = p.wall.d + days;
        let clamped = false;
        if (days === 0 && d > dim) {
          d = dim;
          clamped = true;
        }
        if (clamped) {
          pits.push({ code: "month-clamp", level: "warn", message: "\u6708\u672B\u94B3\u5236\uFF1A" + p.wall.y + "-" + pad22(p.wall.mo) + "-" + pad22(p.wall.d) + " \u52A0\u6708\u540E " + pad42(norm.y) + "-" + pad22(norm.mo) + " \u6708\u6CA1\u6709 " + p.wall.d + " \u65E5\uFF0C\u5DF2\u94B3\u5230 " + d + " \u65E5\uFF1BJS \u7684 date.setMonth \u8D70\u56DE\u5377\u8BED\u4E49\uFF08\u6EA2\u51FA\u5929\u6570\u6EDA\u8FDB\u4E0B\u4E2A\u6708\u521D\uFF09\u2014\u2014\u4E24\u79CD\u5F15\u64CE\u7ED3\u679C\u4E0D\u540C\uFF0C\u8DE8\u8BED\u8A00\u5BF9\u8D26\u8981\u5F53\u5FC3" });
        }
        const wall2 = normalizeWall(norm.y, norm.mo, d, p.wall.h + hours, p.wall.mi + minutes, p.wall.s + seconds);
        const rv = resolveWall2(wall2, zone);
        let instantMs, resolvedNote = "";
        if (rv.status === "unique") instantMs = rv.instantMs;
        else if (rv.status === "ambiguous") {
          instantMs = rv.instantMs;
          resolvedNote = "\u7ED3\u679C\u5899\u949F\u65F6\u95F4\u51FA\u73B0\u4E24\u6B21\uFF08DST \u56DE\u62E8\uFF09\uFF0C\u53D6\u65E9\u7684\u4E00\u6B21";
        } else {
          instantMs = rv.transition;
          resolvedNote = "\u7ED3\u679C\u5899\u949F\u65F6\u95F4\u4E0D\u5B58\u5728\uFF08DST \u524D\u62E8\u7A7A\u6D1E\uFF09\uFF0C\u5DF2\u53D6\u5207\u6362\u77AC\u95F4\uFF08\u5899\u949F\u76F4\u63A5\u5230 " + pad22(rv.wallJustAfter.h) + ":" + pad22(rv.wallJustAfter.mi) + "\uFF09";
          pits.push({ code: "dst-gap", level: "error", message: "\u7B97\u672F\u7ED3\u679C " + pad22(wall2.h) + ":" + pad22(wall2.mi) + ":" + pad22(wall2.s) + " \u5728 " + zone + " \u4E0D\u5B58\u5728\uFF08DST \u7A7A\u6D1E\uFF09" });
        }
        if (rv.status === "ambiguous") pits.push({ code: "dst-ambiguous", level: "warn", message: "\u7B97\u672F\u7ED3\u679C\u5728 " + zone + " \u51FA\u73B0\u4E24\u6B21\uFF08DST \u56DE\u62E8\uFF09\uFF0C\u53D6\u65E9\u7684\u4E00\u6B21" });
        const offsetShift = getOffset(instantMs, zone) - p.offsetMin;
        calendar = {
          instantMs,
          wallAfter: wall2,
          resolvedStatus: rv.status,
          clamped,
          realDeltaMs: instantMs - ms,
          wallDeltaText: years + " \u5E74 " + months + " \u6708 " + days + " \u5929 " + hours + " \u65F6 " + minutes + " \u5206 " + seconds + " \u79D2",
          offsetShiftMin: offsetShift,
          note: resolvedNote + (offsetShift !== 0 ? "\uFF1B\u671F\u95F4\u65F6\u533A\u504F\u79FB\u53D8\u5316 " + (offsetShift > 0 ? "+" : "") + offsetShift + " \u5206\u949F" + (offsetShift !== 0 ? "\uFF08DST\uFF09\uFF0C\u5899\u949F\u4FDD\u5F62\u4F46\u771F\u5B9E\u65F6\u957F \u2260 \u65E5\u5386\u65F6\u957F" : "") : "")
        };
      }
      let exact = null;
      if (mode2 === "exact" || mode2 === "both") {
        if (years !== 0 || months !== 0) {
          if (mode2 === "exact") {
            return { ok: false, error: "exact \u6A21\u5F0F\u4E0D\u652F\u6301 years/months\uFF08\u5386\u6CD5\u6708\u957F\u5EA6\u4E0D\u5B9A\uFF0C\u8BF7\u7528 calendar \u6216 both \u6A21\u5F0F\uFF09", pits };
          }
          pits.push({ code: "no-exact-counterpart", level: "info", message: "years/months \u662F\u5386\u6CD5\u5355\u4F4D\uFF08\u6708\u957F\u5EA6\u4E0D\u5B9A\uFF09\uFF0C\u6CA1\u6709\u5BF9\u5E94\u7684\u7CBE\u786E\u65F6\u957F\u53E3\u5F84\u2014\u2014\u672C\u7ED3\u679C\u53EA\u6709\u65E5\u5386\u53E3\u5F84" });
        } else {
          const deltaSec = days * 86400 + hours * 3600 + minutes * 60 + seconds;
          exact = { instantMs: ms + deltaSec * 1e3, realDeltaMs: deltaSec * 1e3 };
        }
      }
      const differ = calendar && exact ? calendar.instantMs !== exact.instantMs : null;
      if (differ) {
        const diffMin = Math.round((calendar.instantMs - exact.instantMs) / 6e4);
        pits.push({ code: "calendar-vs-exact", level: "warn", message: "\u4E24\u53E3\u5F84\u5DEE " + diffMin + " \u5206\u949F\uFF1A\u65E5\u5386\u53E3\u5F84\u4FDD\u5899\u949F\u5F62\uFF08\u8DE8\u8FC7 DST \u8FB9\u754C\u504F\u79FB\u53D8\u5316 " + calendar.offsetShiftMin + " \u5206\u949F\uFF09\uFF0C\u7CBE\u786E\u53E3\u5F84\u4FDD\u771F\u5B9E\u65F6\u957F\u2014\u2014\u9009\u9519\u53E3\u5F84\u662F\u65E5\u7A0B\u6F02\u79FB\u7684\u7ECF\u5178\u6765\u6E90" });
      }
      return { ok: true, zone, mode: mode2, calendar, exact, differ, pits };
    }
    module.exports = {
      CORE_VERSION,
      utcMs,
      normalizeWall,
      daysInMonth,
      isLeap,
      isValidZone: isValidZone2,
      localZone: localZone2,
      listZones,
      projectZone: projectZone2,
      getOffset,
      resolveWall: resolveWall2,
      wallMatches,
      analyze: analyze2,
      addDuration: addDuration2,
      formatAll: formatAll2,
      isoWeekOf,
      dayOfYear,
      pad2: pad22,
      pad4: pad42,
      fmtOffsetMin: fmtOffsetMin2,
      fmtOffsetRFC,
      parseUnixNumeric
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_datetime_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.dtl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dtl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dtl-head b{font-size:13px}
.dtl-head .sub{color:#5C6678;font-size:11px}
.dtl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.dtl-input{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none}
.dtl-input:focus{border-color:#4fd1a0}
.dtl-input.sm{width:150px}
.dtl-chips{display:flex;gap:6px;flex-wrap:wrap}
.dtl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.dtl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.dtl-chip.on{color:#4fd1a0;border-color:#4fd1a0}
.dtl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.dtl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.dtl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.dtl-kv{display:flex;gap:10px;padding:3px 12px;font-size:12px}
.dtl-kv .k{color:#5C6678;min-width:110px;flex-shrink:0}
.dtl-kv .v{font-family:ui-monospace,Consolas,monospace;color:#c9cede;word-break:break-all}
.dtl-kv .v.grn{color:#4fd1a0}
.dtl-warnitem{padding:4px 12px;font-size:11.5px;line-height:1.6}
.dtl-warnitem.warn{color:#f3b377}
.dtl-warnitem.err{color:#f1a0a0}
.dtl-warnitem.info{color:#8B94A9}
.dtl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.dtl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.dtl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.dtl-ok{color:#4fd1a0}
.dtl-bad{color:#f1a0a0}
.dtl-warn{color:#f3b377}
.dtl-note{color:#5C6678;font-size:11px;line-height:1.6;padding:4px 12px 8px}
.dtl-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:6px 12px}
.dtl-lbl{color:#5C6678;font-size:11px}
.dtl-verdict{padding:8px 12px;font-size:12.5px;line-height:1.7}
.dtl-verdict.unique{color:#4fd1a0}
.dtl-verdict.amb{color:#f3b377}
.dtl-verdict.gap{color:#f1a0a0}
.dtl-mono{font-family:ui-monospace,Consolas,monospace}
`;
var TEXT_PRESETS = [
  { t: "now" },
  { t: "2026-11-04T08:00:00+08:00" },
  { t: "2026-11-04" },
  // date-only UTC 坑
  { t: "2026-03-08T02:30:00", z: "America/New_York" },
  // DST 空洞
  { t: "2026-11-01T01:30:00", z: "America/New_York" },
  // DST 歧义
  { t: "1762212000" },
  // unix 秒
  { t: "1762212000123" },
  // unix 毫秒
  { t: "1762212000000000000" },
  // unix 纳秒
  { t: "Wed, 04 Nov 2026 08:00:00 GMT" },
  // HTTP 日期（星期名与日期不符样本）
  { t: "26 Nov 26 08:00:00 GMT" }
  // 两位年
];
var COMMON_ZONES = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Kiritimati",
  "Pacific/Chatham",
  "Pacific/Marquesas",
  "Australia/Lord_Howe"
];
var PIT_ICON = { warn: "\u26A0\uFE0F", error: "\u26D4", info: "\u2139\uFE0F" };
function fmtWall(w) {
  return `${core.pad4(w.y)}-${core.pad2(w.mo)}-${core.pad2(w.d)} ${core.pad2(w.h)}:${core.pad2(w.mi)}:${core.pad2(w.s)}`;
}
function DateTimeLensPanel(_props) {
  const local = useMemo(() => core.localZone(), []);
  const [text, setText] = useState(_props && _props.initialText || "2026-11-04T08:00:00+08:00");
  const [interpZone, setInterpZone] = useState(_props && _props.initialZone || local);
  const [zones, setZones] = useState(["UTC", "Asia/Shanghai", "America/New_York", "Australia/Lord_Howe"]);
  const [wallDate, setWallDate] = useState("2026-03-08");
  const [wallTime, setWallTime] = useState("02:30");
  const [wallZone, setWallZone] = useState("America/New_York");
  const [amount, setAmount] = useState({ years: 0, months: 0, days: 1, hours: 0, minutes: 0, seconds: 0 });
  const [amountZone, setAmountZone] = useState("America/New_York");
  const allZones = useMemo(() => {
    const set = zones.slice();
    if (set.indexOf(local) === -1 && COMMON_ZONES.indexOf(local) !== -1) set.push(local);
    return set;
  }, [zones, local]);
  const view = useMemo(() => {
    const r = core.analyze(text, { zone: interpZone });
    if (!r.ok) return { parseError: r.error };
    const formats = r.instant ? core.formatAll(r.instant.ms, interpZone) : null;
    return { r, formats };
  }, [text, interpZone]);
  const wallView = useMemo(() => {
    const mD = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wallDate.trim());
    const mT = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallTime.trim());
    if (!mD || !mT || !core.isValidZone(wallZone)) return { error: "\u65E5\u671F\u9700 YYYY-MM-DD\u3001\u65F6\u95F4\u9700 HH:MM[:SS]\u3001\u65F6\u533A\u9700 IANA \u540D" };
    const rv = core.resolveWall({
      y: parseInt(mD[1], 10),
      mo: parseInt(mD[2], 10),
      d: parseInt(mD[3], 10),
      h: parseInt(mT[1], 10),
      mi: parseInt(mT[2], 10),
      s: mT[3] ? parseInt(mT[3], 10) : 0
    }, wallZone);
    return { rv };
  }, [wallDate, wallTime, wallZone]);
  const arithView = useMemo(() => {
    if (!("r" in view) || !view.r.ok || !view.r.instant) return null;
    const total = Object.values(amount).reduce((a, b) => a + Math.abs(b), 0);
    if (total === 0) return null;
    return core.addDuration(view.r.instant.ms, amount, core.isValidZone(amountZone) ? amountZone : local, "both");
  }, [view, amount, amountZone, local]);
  const toggleZone = (z) => {
    setZones((prev) => prev.indexOf(z) === -1 ? prev.concat([z]) : prev.filter((x) => x !== z));
  };
  return /* @__PURE__ */ jsxs("div", { className: "dtl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "dtl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "\u65F6\u95F4\u4E0E\u65F6\u533A\u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u591A\u683C\u5F0F\u89E3\u6790 \xB7 \u65F6\u533A\u6295\u5F71 \xB7 DST \u7A7A\u6D1E/\u6B67\u4E49\u5224\u5B9A \xB7 \u53CC\u53E3\u5F84\u7B97\u672F \xB7 \u81EA\u7814\u8BED\u6CD5\u4E0E Intl/ICU \u5DEE\u5206\u5BF9\u62CD" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "dtl-body", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "dtl-chips", style: { marginBottom: 6 }, children: TEXT_PRESETS.map((p) => /* @__PURE__ */ jsx("span", { className: "dtl-chip", onClick: () => {
          setText(p.t);
          if (p.z) setInterpZone(p.z);
        }, children: p.t }, p.t)) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "dtl-input",
            value: text,
            placeholder: "\u65E5\u671F\u65F6\u95F4\u539F\u6587\uFF1AISO 8601 / Unix \u65F6\u95F4\u6233 / RFC 2822 / HTTP \u65E5\u671F / now",
            onChange: (e) => setText(e.target.value)
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "dtl-row", style: { paddingLeft: 0 }, children: [
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u89E3\u8BFB\u65F6\u533A\uFF08date-only / \u65E0\u504F\u79FB\u5F62\u6001\u6309\u6B64\u6D88\u89E3\uFF09" }),
          /* @__PURE__ */ jsx(
            "select",
            {
              className: "dtl-input",
              style: { width: 240 },
              value: interpZone,
              onChange: (e) => setInterpZone(e.target.value),
              children: (COMMON_ZONES.indexOf(interpZone) === -1 ? [interpZone].concat(COMMON_ZONES) : COMMON_ZONES).map((z) => /* @__PURE__ */ jsxs("option", { value: z, children: [
                z,
                z === local ? "\uFF08\u672C\u5730\uFF09" : ""
              ] }, z))
            }
          )
        ] })
      ] }),
      "parseError" in view && /* @__PURE__ */ jsxs("div", { className: "dtl-err", children: [
        "\u65E0\u6CD5\u89E3\u6790\uFF1A",
        view.parseError
      ] }),
      "r" in view && view.r.ok && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "dtl-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u89E3\u8BFB\uFF08\u5F15\u64CE vs JS Date.parse \u5DEE\u5206\uFF09" }),
          /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "\u5F62\u6001" }),
            /* @__PURE__ */ jsx("span", { className: "v", children: view.r.kindText })
          ] }),
          view.r.unit && /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "\u5355\u4F4D\u5224\u5B9A" }),
            /* @__PURE__ */ jsx("span", { className: "v", children: view.r.unit })
          ] }),
          view.r.instant && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
              /* @__PURE__ */ jsx("span", { className: "k", children: "\u6743\u5A01\u77AC\u95F4" }),
              /* @__PURE__ */ jsx("span", { className: "v grn", children: view.r.instant.isoUtc })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
              /* @__PURE__ */ jsx("span", { className: "k", children: "epoch" }),
              /* @__PURE__ */ jsxs("span", { className: "v", children: [
                view.r.instant.ms,
                " ms"
              ] })
            ] })
          ] }),
          view.r.isoWeek && /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "ISO \u5468\u65E5\u671F" }),
            /* @__PURE__ */ jsx("span", { className: "v", children: view.r.isoWeek })
          ] }),
          view.r.js && /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "JS Date.parse" }),
            /* @__PURE__ */ jsx("span", { className: "v", children: view.r.js.parseMs === null ? "NaN\uFF08\u62D2\u6536\uFF09" : `${new Date(view.r.js.parseMs).toISOString()}${view.r.js.agrees ? "\uFF08\u4E00\u81F4\uFF09" : "\uFF08\u4E0D\u4E00\u81F4\uFF01\uFF09"}` })
          ] }),
          view.r.pits.map((p, i) => /* @__PURE__ */ jsxs("div", { className: `dtl-warnitem ${p.level === "error" ? "err" : p.level === "info" ? "info" : "warn"}`, children: [
            PIT_ICON[p.level] || "\u26A0\uFE0F",
            " ",
            p.message
          ] }, i))
        ] }),
        view.formats && /* @__PURE__ */ jsxs("div", { className: "dtl-card", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            "\u5168\u683C\u5F0F\u8F93\u51FA\uFF08@",
            view.formats.zone,
            " \xB7 round-trip \u81EA\u8BC1\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "ISO 8601" }),
            /* @__PURE__ */ jsx("span", { className: "v grn", children: view.formats.iso })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "RFC 2822" }),
            /* @__PURE__ */ jsx("span", { className: "v", children: view.formats.rfc2822 })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "HTTP \u65E5\u671F" }),
            /* @__PURE__ */ jsx("span", { className: "v", children: view.formats.http })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "Unix" }),
            /* @__PURE__ */ jsxs("span", { className: "v", children: [
              view.formats.unixSeconds,
              " s \xB7 ",
              view.formats.unixMillis,
              " ms"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dtl-kv", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "ISO \u5468 / \u5929\u5E8F" }),
            /* @__PURE__ */ jsxs("span", { className: "v", children: [
              view.formats.isoWeek,
              " \xB7 D",
              view.formats.dayOfYear,
              " \xB7 ",
              view.formats.weekdayEn
            ] })
          ] })
        ] }),
        view.r.instant && /* @__PURE__ */ jsxs("div", { className: "dtl-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u591A\u65F6\u533A\u6295\u5F71" }),
          /* @__PURE__ */ jsx("div", { className: "dtl-row", children: COMMON_ZONES.map((z) => /* @__PURE__ */ jsx("span", { className: `dtl-chip${zones.indexOf(z) !== -1 ? " on" : ""}`, onClick: () => toggleZone(z), children: z }, z)) }),
          /* @__PURE__ */ jsxs("table", { className: "dtl-tbl", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "\u65F6\u533A" }),
              /* @__PURE__ */ jsx("th", { children: "\u5899\u949F" }),
              /* @__PURE__ */ jsx("th", { children: "\u504F\u79FB" }),
              /* @__PURE__ */ jsx("th", { children: "DST" }),
              /* @__PURE__ */ jsx("th", { children: "\u661F\u671F" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: allZones.map((z) => {
              const p = core.projectZone(view.r.instant.ms, z);
              return /* @__PURE__ */ jsxs("tr", { children: [
                /* @__PURE__ */ jsxs("td", { children: [
                  z,
                  z === local ? "\uFF08\u672C\u5730\uFF09" : ""
                ] }),
                /* @__PURE__ */ jsx("td", { children: fmtWall(p.wall) }),
                /* @__PURE__ */ jsx("td", { children: core.fmtOffsetMin(p.offsetMin) }),
                /* @__PURE__ */ jsx("td", { className: p.isDST ? "dtl-warn" : "", children: p.isDST ? "\u2600\uFE0F \u662F" : "\u5426" }),
                /* @__PURE__ */ jsx("td", { children: p.weekdayZh })
              ] }, z);
            }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dtl-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u5899\u949F\u6D88\u89E3\uFF08DST \u7A7A\u6D1E / \u6B67\u4E49\u5224\u5B9A\uFF09" }),
        /* @__PURE__ */ jsxs("div", { className: "dtl-row", children: [
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u65E5\u671F" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", value: wallDate, onChange: (e) => setWallDate(e.target.value), placeholder: "2026-03-08" }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u65F6\u95F4" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", value: wallTime, onChange: (e) => setWallTime(e.target.value), placeholder: "02:30" }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u65F6\u533A" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 200 }, value: wallZone, onChange: (e) => setWallZone(e.target.value), placeholder: "America/New_York" }),
          /* @__PURE__ */ jsx("span", { className: "dtl-chip", onClick: () => {
            setWallDate("2026-03-08");
            setWallTime("02:30");
            setWallZone("America/New_York");
          }, children: "\u7A7A\u6D1E\u6837\u672C" }),
          /* @__PURE__ */ jsx("span", { className: "dtl-chip", onClick: () => {
            setWallDate("2026-11-01");
            setWallTime("01:30");
            setWallZone("America/New_York");
          }, children: "\u6B67\u4E49\u6837\u672C" })
        ] }),
        "error" in wallView && /* @__PURE__ */ jsx("div", { className: "dtl-note dtl-bad", children: wallView.error }),
        "rv" in wallView && wallView.rv && /* @__PURE__ */ jsxs("div", { className: `dtl-verdict ${wallView.rv.status === "unique" ? "unique" : wallView.rv.status === "ambiguous" ? "amb" : "gap"}`, children: [
          wallView.rv.status === "unique" && wallView.rv.instantMs !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
            "\u2705 \u552F\u4E00\u5B58\u5728\uFF1A",
            new Date(wallView.rv.instantMs).toISOString(),
            "\uFF08\u504F\u79FB ",
            core.fmtOffsetMin(wallView.rv.offsetMin ?? 0),
            "\uFF09"
          ] }),
          wallView.rv.status === "ambiguous" && wallView.rv.instantMs !== null && wallView.rv.secondInstantMs !== null && wallView.rv.transition !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
            "\u26A0\uFE0F \u51FA\u73B0\u4E24\u6B21\uFF08\u65F6\u949F\u56DE\u62E8\uFF09\uFF1A\u7B2C\u4E00\u6B21 ",
            new Date(wallView.rv.instantMs).toISOString(),
            "\uFF08",
            core.fmtOffsetMin(wallView.rv.offsetMin ?? 0),
            "\uFF09\u3001\u7B2C\u4E8C\u6B21 ",
            new Date(wallView.rv.secondInstantMs).toISOString(),
            "\uFF08",
            core.fmtOffsetMin(wallView.rv.secondOffsetMin ?? 0),
            "\uFF09\uFF1B\u5207\u6362\u77AC\u95F4 ",
            new Date(wallView.rv.transition).toISOString()
          ] }),
          wallView.rv.status === "gap" && wallView.rv.wallJustBefore !== null && wallView.rv.wallJustAfter !== null && wallView.rv.transition !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
            "\u26D4 \u4E0D\u5B58\u5728\uFF08\u65F6\u949F\u524D\u62E8\uFF0C\u8DF3\u8FC7 ",
            wallView.rv.skippedMinutes,
            " \u5206\u949F\uFF09\uFF1A\u5899\u949F ",
            fmtWall(wallView.rv.wallJustBefore),
            " \u4E4B\u540E\u76F4\u63A5\u662F ",
            fmtWall(wallView.rv.wallJustAfter),
            "\uFF1B\u5207\u6362\u77AC\u95F4 ",
            new Date(wallView.rv.transition).toISOString()
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dtl-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u7B97\u672F\uFF08\u65E5\u5386\u53E3\u5F84 vs \u7CBE\u786E\u53E3\u5F84\uFF09" }),
        /* @__PURE__ */ jsxs("div", { className: "dtl-row", children: [
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u5E74" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 60 }, value: amount.years, onChange: (e) => setAmount({ ...amount, years: Number(e.target.value) || 0 }) }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u6708" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 60 }, value: amount.months, onChange: (e) => setAmount({ ...amount, months: Number(e.target.value) || 0 }) }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u5929" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 60 }, value: amount.days, onChange: (e) => setAmount({ ...amount, days: Number(e.target.value) || 0 }) }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u65F6" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 60 }, value: amount.hours, onChange: (e) => setAmount({ ...amount, hours: Number(e.target.value) || 0 }) }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u5206" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 60 }, value: amount.minutes, onChange: (e) => setAmount({ ...amount, minutes: Number(e.target.value) || 0 }) }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "\u79D2" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 60 }, value: amount.seconds, onChange: (e) => setAmount({ ...amount, seconds: Number(e.target.value) || 0 }) }),
          /* @__PURE__ */ jsx("span", { className: "dtl-lbl", children: "@\u65F6\u533A" }),
          /* @__PURE__ */ jsx("input", { className: "dtl-input sm", style: { width: 200 }, value: amountZone, onChange: (e) => setAmountZone(e.target.value) })
        ] }),
        arithView === null && /* @__PURE__ */ jsx("div", { className: "dtl-note", children: "\u89E3\u8BFB\u6210\u529F\u540E\uFF0C\u7ED9\u81F3\u5C11\u4E00\u4E2A\u975E\u96F6\u7B97\u672F\u91CF\u5373\u53EF\u770B\u53CC\u53E3\u5F84\u7ED3\u679C" }),
        arithView && !arithView.ok && /* @__PURE__ */ jsx("div", { className: "dtl-note dtl-bad", children: arithView.error }),
        arithView && arithView.ok && /* @__PURE__ */ jsxs("div", { className: "dtl-verdict unique", children: [
          arithView.calendar && /* @__PURE__ */ jsxs("div", { children: [
            "\u{1F4C5} \u65E5\u5386\u53E3\u5F84\uFF1A",
            new Date(arithView.calendar.instantMs).toISOString(),
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8B94A9" }, children: arithView.calendar.note || "\u65E0 DST \u5E72\u6270" })
          ] }),
          arithView.exact && /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
            "\u23F1\uFE0F \u7CBE\u786E\u53E3\u5F84\uFF1A",
            new Date(arithView.exact.instantMs).toISOString(),
            "\uFF08",
            arithView.exact.realDeltaMs / 1e3,
            " \u79D2\uFF09"
          ] }),
          arithView.differ === true && /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, className: "dtl-warn", children: [
            "\u26A0\uFE0F \u4E24\u53E3\u5F84\u76F8\u5DEE ",
            (arithView.calendar.instantMs - arithView.exact.instantMs) / 6e4,
            " \u5206\u949F\uFF08DST \u8FB9\u754C\uFF09"
          ] }),
          arithView.pits.map((p, i) => /* @__PURE__ */ jsxs("div", { className: `dtl-warnitem ${p.level === "error" ? "err" : p.level === "info" ? "info" : "warn"}`, children: [
            PIT_ICON[p.level] || "\u26A0\uFE0F",
            " ",
            p.message
          ] }, i))
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dtl-note", children: "\u5F15\u64CE\u6743\u5A01 = \u81EA\u7814\u4E25\u683C\u8BED\u6CD5 + Intl/ICU \u65F6\u533A\u6570\u636E\uFF08\u4E0E\u5BBF\u4E3B\u540C\u6E90\uFF09\uFF1B\u65F6\u533A\u5386\u53F2\u53D8\u8FC1\u5B8C\u6574\u5E93\u4E0D\u5728\u8303\u56F4\uFF08pre-1970 LMT \u79D2\u7EA7\u504F\u79FB\u6309\u5206\u949F\u7C92\u5EA6\u53EF\u80FD\u5931\u771F\uFF0C\u4F1A\u5982\u5B9E\u6807\u6CE8\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function DateTimeLensEntry(props) {
  return /* @__PURE__ */ jsx2(DateTimeLensPanel, { ...props });
}
export {
  DateTimeLensEntry as default
};
