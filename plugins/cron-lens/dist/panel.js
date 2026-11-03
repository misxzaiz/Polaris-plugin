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

// shared/cron-core.js
var require_cron_core = __commonJS({
  "shared/cron-core.js"(exports, module) {
    "use strict";
    var ALIASES = {
      "@hourly": "0 * * * *",
      "@daily": "0 0 * * *",
      "@midnight": "0 0 * * *",
      "@weekly": "0 0 * * 0",
      "@monthly": "0 0 1 * *",
      "@yearly": "0 0 1 1 *",
      "@annually": "0 0 1 1 *"
    };
    var ALIAS_OF = {
      "0 * * * *": "@hourly",
      "0 0 * * *": "@daily",
      "0 0 * * 0": "@weekly",
      "0 0 1 * *": "@monthly",
      "0 0 1 1 *": "@yearly"
    };
    var MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
    var DOW_NAMES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
    var DOW_CN = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
    var MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var FIELD_DEFS = [
      { key: "min", label: "\u5206\u949F", min: 0, max: 59, unit: "\u5206\u949F" },
      { key: "hour", label: "\u5C0F\u65F6", min: 0, max: 23, unit: "\u5C0F\u65F6" },
      { key: "dom", label: "\u65E5", min: 1, max: 31, unit: "\u65E5" },
      { key: "month", label: "\u6708", min: 1, max: 12, unit: "\u6708" },
      { key: "dow", label: "\u661F\u671F", min: 0, max: 7, unit: "\u661F\u671F" }
    ];
    function pad2(n) {
      return String(n).padStart(2, "0");
    }
    function parseNameOrNum(tok, def, warnings) {
      if (/^\d+$/.test(tok)) {
        const n = parseInt(tok, 10);
        if (def.key === "dow" && n === 7) {
          warnings.push({ level: "info", msg: "\u661F\u671F\u5B57\u6BB5\u7684 7 \u5DF2\u6309 0\uFF08\u5468\u65E5\uFF09\u5904\u7406\uFF08vixie \u8BED\u4E49 0 \u4E0E 7 \u5747\u4E3A\u5468\u65E5\uFF09" });
          return { num: 0 };
        }
        if (n < def.min || (def.key === "dow" ? n > 6 : n > def.max)) {
          return { error: `${def.label}\u503C ${n} \u8D85\u754C\uFF08\u5141\u8BB8 ${def.min}-${def.key === "dow" ? 6 : def.max}${def.key === "dow" ? "\uFF0C7 \u4F1A\u5F52\u4E00\u4E3A 0" : ""}\uFF09` };
        }
        return { num: n };
      }
      const up = tok.toUpperCase();
      if (def.key === "month" && MONTH_NAMES[up] !== void 0) return { num: MONTH_NAMES[up] };
      if (def.key === "dow" && DOW_NAMES[up] !== void 0) return { num: DOW_NAMES[up] };
      return { error: `${def.label}\u5B57\u6BB5\u65E0\u6CD5\u8BC6\u522B\u300C${tok}\u300D` + (def.key === "month" ? "\uFF08\u6708\u4EFD\u53EF\u7528 1-12 \u6216 JAN-DEC\uFF09" : def.key === "dow" ? "\uFF08\u661F\u671F\u53EF\u7528 0-6 \u6216 SUN-SAT\uFF0C0=\u5468\u65E5\uFF09" : "\uFF08\u53EA\u63A5\u53D7\u6570\u5B57\uFF09") };
    }
    function parseFieldToken(raw, def, warnings) {
      const notes = [];
      let tok = raw.trim();
      if (tok === "") return { error: `${def.label}\u5B57\u6BB5\u4E3A\u7A7A` };
      if (tok === "?") {
        warnings.push({ level: "info", msg: `\u300C?\u300D\u4E0D\u662F\u6807\u51C6 vixie \u8BED\u6CD5\uFF08Quartz \u60EF\u7528\uFF09\uFF0C\u5DF2\u6309 * \u5904\u7406` });
        tok = "*";
      }
      const lo = def.min;
      const hi = def.key === "dow" ? 6 : def.max;
      if (tok === "*") return { values: range(lo, hi), restricted: false, notes };
      if (tok.startsWith("*/")) {
        const stepPart = tok.slice(2);
        if (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) < 1) {
          return { error: `${def.label}\u5B57\u6BB5\u6B65\u957F\u300C${stepPart || "(\u7A7A)"}\u300D\u65E0\u6548\uFF08\u987B\u4E3A \u22651 \u7684\u6574\u6570\uFF09` };
        }
        const step = parseInt(stepPart, 10);
        const values2 = range(lo, hi).filter((v) => (v - lo) % step === 0);
        if ((hi - lo + 1) % step !== 0) {
          notes.push({ level: "info", msg: `*/${step} \u5C3E\u90E8\u4E0D\u6EE1\u4E00\u4E2A\u6B65\u957F\uFF1A\u5B9E\u9645\u547D\u4E2D ${summarize(values2, def)}` });
        }
        return { values: values2, restricted: false, notes };
      }
      const atoms = tok.split(",");
      const collected = [];
      for (const atomRaw of atoms) {
        const atom = atomRaw.trim();
        if (atom === "") return { error: `${def.label}\u5B57\u6BB5\u300C${tok}\u300D\u542B\u7A7A\u5217\u8868\u9879\uFF08\u5982\u300C1,,3\u300D\u6216\u7ED3\u5C3E\u9017\u53F7\uFF09` };
        if (atom.includes("#") || /^(l|w|lw)([-/]|$)/i.test(atom) || /\d[lw]$/i.test(atom)) {
          return { error: `${def.label}\u5B57\u6BB5\u300C${atom}\u300D\u542B L/W/#\u2014\u2014\u8FD9\u662F Quartz \u6269\u5C55\u8BED\u6CD5\uFF0C\u6807\u51C6 cron \u4E0D\u652F\u6301\uFF08\u672C\u5DE5\u5177\u6309 vixie/POSIX \u8BED\u4E49\u89E3\u6790\uFF1B\u5982\u9700 Quartz \u8BED\u4E49\u8BF7\u7528\u652F\u6301\u5B83\u7684\u8C03\u5EA6\u5668\uFF09` };
        }
        const slash = atom.indexOf("/");
        let step = 1;
        let body = atom;
        if (slash !== -1) {
          body = atom.slice(0, slash);
          const stepPart = atom.slice(slash + 1);
          if (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) < 1) {
            return { error: `${def.label}\u5B57\u6BB5\u6B65\u957F\u300C${stepPart || "(\u7A7A)"}\u300D\u65E0\u6548\uFF08\u987B\u4E3A \u22651 \u7684\u6574\u6570\uFF09` };
          }
          step = parseInt(stepPart, 10);
          if (body === "*") {
            return { error: `${def.label}\u5B57\u6BB5\u300C${atom}\u300D\uFF1A*/ \u6B65\u957F\u53EA\u80FD\u5355\u72EC\u4F7F\u7528\uFF0C\u4E0D\u80FD\u51FA\u73B0\u5728\u9017\u53F7\u5217\u8868\u91CC` };
          }
        }
        const dash = body.indexOf("-");
        let a, b;
        if (dash === -1) {
          const r = parseNameOrNum(body, def, warnings);
          if (r.error) return { error: r.error };
          a = r.num;
          if (slash !== -1) {
            warnings.push({ level: "info", msg: `${def.label}\u300C${atom}\u300D\u6309 ${a}-${hi}/${step} \u89E3\u91CA\uFF08\u300C\u8D77\u70B9/\u6B65\u957F\u300D\u7F29\u5199\u662F\u90E8\u5206\u5B9E\u73B0\u7684\u60EF\u7528\u6CD5\uFF0Cvixie \u6807\u51C6\u65E0\u6B64\u5199\u6CD5\uFF09` });
            b = hi;
          } else {
            collected.push(a);
            continue;
          }
        } else {
          const ra = parseNameOrNum(body.slice(0, dash), def, warnings);
          if (ra.error) return { error: ra.error };
          const rb = parseNameOrNum(body.slice(dash + 1), def, warnings);
          if (rb.error) return { error: rb.error };
          a = ra.num;
          b = rb.num;
          if (a > b) {
            return { error: `${def.label}\u8303\u56F4 ${a}-${b} \u8D77\u70B9\u5927\u4E8E\u7EC8\u70B9\uFF08vixie \u4E0D\u652F\u6301\u73AF\u5F62\u8303\u56F4\uFF1B\u5982\u9700\u8DE8\u754C\u8BF7\u7528\u5217\u8868\uFF0C\u5982 ${a},6,0,1,2\uFF09` };
          }
        }
        const vals = range(a, b).filter((v) => (v - a) % step === 0);
        if (step > 1 && a > lo) {
          notes.push({ level: "info", msg: `\u8303\u56F4\u8D77\u70B9 ${a} \u4E0D\u662F\u5B57\u6BB5\u4E0B\u754C ${lo}\uFF0C\u6B65\u957F\u4ECE ${a} \u8D77\u7B97\uFF1A\u5B9E\u9645\u547D\u4E2D ${summarize(vals, def)}` });
        }
        collected.push(...vals);
      }
      const values = [...new Set(collected)].sort((x, y) => x - y);
      return { values, restricted: true, notes };
    }
    function range(a, b) {
      const out = [];
      for (let i = a; i <= b; i++) out.push(i);
      return out;
    }
    function summarize(values, def) {
      const strs = values.map((v) => def.key === "month" ? `${v}\u6708` : def.key === "dow" ? DOW_CN[v % 7] : String(v));
      if (strs.length > 8) return `${strs.slice(0, 8).join("\u3001")}\u2026\u5171 ${values.length} \u4E2A\u503C`;
      return strs.join("\u3001");
    }
    function parseCron2(expr) {
      if (typeof expr !== "string" || !expr.trim()) return { ok: false, error: "\u8868\u8FBE\u5F0F\u4E3A\u7A7A", warnings: [], notes: [], fields: {}, normalized: "", useSec: false, aliasUsed: null, raw: "" };
      let raw = expr.trim();
      const warnings = [];
      let aliasUsed = null;
      const low = raw.toLowerCase();
      if (ALIASES[low]) {
        if (low === "@reboot") {
          return { ok: false, error: "@reboot \u65E0\u65F6\u523B\u8BED\u4E49\uFF08\u89E6\u53D1\u65F6\u673A=\u8FDB\u7A0B\u542F\u52A8\uFF09\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u672A\u6765\u89E6\u53D1\u65F6\u523B\uFF1B\u8BF7\u6539\u7528\u5177\u4F53\u65F6\u95F4\u5B57\u6BB5", warnings: [], notes: [], fields: {}, normalized: "", useSec: false, aliasUsed: null, raw: "" };
        }
        aliasUsed = low;
        warnings.push({ level: "info", msg: `\u522B\u540D ${low} \u7B49\u4EF7\u4E8E ${ALIASES[low]}` });
        raw = ALIASES[low];
      }
      const tokens = raw.split(/\s+/);
      let useSec = false;
      if (tokens.length === 6) {
        useSec = true;
        warnings.push({ level: "warn", msg: "\u68C0\u6D4B\u5230 6 \u4E2A\u5B57\u6BB5\uFF1A\u9996\u4F4D\u5DF2\u6309\u300C\u79D2\u300D\u89E3\u6790\u3002\u6807\u51C6 vixie cron \u662F 5 \u5B57\u6BB5\uFF08\u5206 \u65F6 \u65E5 \u6708 \u5468\uFF09\uFF0C\u79D2\u7EA7\u652F\u6301\u4EC5\u90E8\u5206\u8C03\u5EA6\u5668\u63D0\u4F9B\u2014\u2014\u82E5\u672C\u610F\u662F 5 \u5B57\u6BB5\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u591A\u5199\u4E86\u4E00\u6BB5" });
      } else if (tokens.length !== 5) {
        return { ok: false, error: `\u5B57\u6BB5\u6570\u5E94\u4E3A 5\uFF08\u6807\u51C6\uFF09\u6216 6\uFF08\u542B\u79D2\uFF09\uFF0C\u5B9E\u9645 ${tokens.length} \u4E2A\uFF1A\u300C${tokens.join(" ")}\u300D\u3002\u4E94\u5B57\u6BB5\u987A\u5E8F = \u5206 \u65F6 \u65E5 \u6708 \u5468`, warnings: [], notes: [], fields: {}, normalized: "", useSec: false, aliasUsed: null, raw: "" };
      }
      const defs = useSec ? [{ key: "sec", label: "\u79D2", min: 0, max: 59, unit: "\u79D2" }, ...FIELD_DEFS] : FIELD_DEFS;
      const fields = {};
      const notes = [];
      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        const r = parseFieldToken(tokens[i], def, warnings);
        if (r.error) return { ok: false, error: `\u7B2C ${i + 1} \u6BB5\uFF08${def.label}\uFF09\u89E3\u6790\u5931\u8D25\uFF1A${r.error}`, warnings: [], notes: [], fields: {}, normalized: "", useSec: false, aliasUsed: null, raw: "" };
        r.values.sort((x, y) => x - y);
        fields[def.key] = { values: r.values, restricted: r.restricted, def };
        for (const n of r.notes) notes.push(n);
      }
      const domR = fields.dom.restricted;
      const dowR = fields.dow.restricted;
      if (domR && dowR) {
        warnings.push({ level: "warn", msg: "\u300C\u65E5\u300D\u4E0E\u300C\u661F\u671F\u300D\u540C\u65F6\u53D7\u9650\uFF1Avixie/POSIX cron \u6309\u300C\u6216\u300D\u8BED\u4E49\uFF0C\u4E8C\u8005\u4EFB\u4E00\u547D\u4E2D\u5373\u89E6\u53D1\uFF08\u5982 0 0 1 * 1 = \u6BCF\u6708 1 \u53F7\u6216\u6BCF\u4E2A\u5468\u4E00\u90FD\u4F1A\u8DD1\uFF09\uFF1BQuartz \u76F8\u53CD\u662F\u300C\u4E0E\u300D\u3002\u8DE8\u8C03\u5EA6\u5668\u8FC1\u79FB\u65F6\u8FD9\u662F\u6700\u5BB9\u6613\u8E29\u7684\u8BED\u4E49\u5DEE" });
      }
      if (domR && !dowR) {
        const domValues = fields.dom.values;
        const validPairs = [];
        for (const m of fields.month.values) {
          for (const d of domValues) {
            if (d <= MAX_DAYS[m - 1]) validPairs.push({ m, d });
          }
        }
        if (validPairs.length === 0) {
          const detail = fields.month.values.map((m) => `${m}\u6708\u6700\u591A ${MAX_DAYS[m - 1]} \u65E5`).join("\u3001");
          warnings.push({ level: "warn", msg: `\u6C38\u4E0D\u89E6\u53D1\uFF1A\u65E5\u5B57\u6BB5\u9650\u5B9A ${domValues.join("\u3001")}\uFF0C\u4F46 ${detail}\uFF0C\u8BE5\u65E5\u671F\u4E0D\u5B58\u5728\u2014\u2014\u8868\u8FBE\u5F0F\u6C38\u8FDC\u4E0D\u4F1A\u547D\u4E2D` });
        } else if (validPairs.every((p) => p.m === 2 && p.d === 29)) {
          warnings.push({ level: "warn", msg: "\u4EC5\u95F0\u5E74\u89E6\u53D1\uFF1A2 \u6708 29 \u65E5\u53EA\u5728\u95F0\u5E74\u5B58\u5728\uFF08\u7EA6\u6BCF 4 \u5E74\u4E00\u6B21\uFF09\uFF0C\u5176\u4F59\u5E74\u4EFD\u8BE5\u8868\u8FBE\u5F0F\u6574\u5E74\u4E0D\u89E6\u53D1" });
        }
      }
      const secSet = useSec ? fields.sec.values : null;
      const normalized = useSec ? [joinField(secSet, 0, 59), joinField(fields.min.values, 0, 59), joinField(fields.hour.values, 0, 23), joinField(fields.dom.values, 1, 31), joinField(fields.month.values, 1, 12), joinField(fields.dow.values, 0, 6)].join(" ") : [joinField(fields.min.values, 0, 59), joinField(fields.hour.values, 0, 23), joinField(fields.dom.values, 1, 31), joinField(fields.month.values, 1, 12), joinField(fields.dow.values, 0, 6)].join(" ");
      const aliasNote = !useSec && ALIAS_OF[normalized] && !aliasUsed ? { level: "info", msg: `\u8BE5\u8868\u8FBE\u5F0F\u7B49\u4EF7\u4E8E\u522B\u540D ${ALIAS_OF[normalized]}` } : null;
      if (aliasNote) warnings.push(aliasNote);
      return {
        ok: true,
        raw: expr.trim(),
        aliasUsed,
        useSec,
        fields,
        warnings,
        notes,
        normalized,
        domRestricted: domR,
        dowRestricted: dowR
      };
    }
    function joinField(values, lo, hi) {
      if (values.length === hi - lo + 1) return "*";
      if (values.length > 1 && values[0] === lo) {
        const step = values[1] - values[0];
        const isStep = values.every((v, i) => v === lo + i * step);
        if (isStep && lo + values.length * step > hi) return `*/${step}`;
      }
      return values.join(",");
    }
    function describeFields2(parsed) {
      const defs = parsed.useSec ? ["sec", "min", "hour", "dom", "month", "dow"] : ["min", "hour", "dom", "month", "dow"];
      return defs.map((key) => {
        const f = parsed.fields[key];
        return { label: f.def.label, token: key === "dow" ? normalizeDowToken(f) : f.values.join(","), text: describeOne(key, f) };
      });
    }
    function normalizeDowToken(f) {
      return f.values.join(",");
    }
    function describeOne(key, f) {
      const { values, def, restricted } = f;
      const full = values.length === (def.key === "dow" ? 7 : def.max - def.min + 1) && (key !== "dow" || values[0] === 0 && values[values.length - 1] === 6);
      if (!restricted && full) {
        if (key === "dom") return "\u6BCF\u5929";
        if (key === "dow") return "\u4E0D\u9650\u661F\u671F";
        return `\u6BCF${def.unit}`;
      }
      if (values.length === 1) {
        if (key === "sec") return `\u7B2C ${values[0]} \u79D2`;
        if (key === "min") return `\u7B2C ${values[0]} \u5206`;
        if (key === "hour") return `${values[0]} \u70B9\u6574`;
        if (key === "dom") return `\u6BCF\u6708 ${values[0]} \u65E5`;
        if (key === "month") return `\u4EC5 ${values[0]} \u6708`;
        return `\u4EC5${DOW_CN[values[0]]}`;
      }
      if (values.length > 2) {
        const step = values[1] - values[0];
        const even = values.every((v, i) => v === values[0] + i * step);
        if (even && step > 1) {
          const fromStart = values[0] === def.min;
          if (key === "dow") return `${fromStart ? `\u6BCF ${step} \u5929` : `\u81EA${DOW_CN[values[0]]}\u8D77\u6BCF ${step} \u5929`}\uFF08${summarize(values, def)}\uFF09`;
          if (key === "month") return `${fromStart ? `\u6BCF ${step} \u4E2A\u6708` : `\u81EA ${values[0]} \u6708\u8D77\u6BCF ${step} \u4E2A\u6708`}\uFF08${summarize(values, def)}\uFF09`;
          return `${fromStart ? `\u6BCF ${step} ${def.unit}` : `\u81EA\u7B2C ${values[0]} ${def.unit}\u8D77\u6BCF ${step}`}\uFF08${summarize(values, def)}\uFF09`;
        }
      }
      return `\u6307\u5B9A\uFF1A${summarize(values, def)}`;
    }
    function shiftToWall(ms, tzOffsetMinutes) {
      return ms + tzOffsetMinutes * 6e4;
    }
    function wallToAbs(wallMs, tzOffsetMinutes) {
      return wallMs - tzOffsetMinutes * 6e4;
    }
    function dayMatchesWall(parsed, wallMs) {
      const d = new Date(wallMs);
      const dom = d.getUTCDate();
      const dow = d.getUTCDay();
      const domR = parsed.domRestricted;
      const dowR = parsed.dowRestricted;
      if (domR && dowR) return parsed.fields.dom.values.includes(dom) || parsed.fields.dow.values.includes(dow);
      if (domR) return parsed.fields.dom.values.includes(dom);
      if (dowR) return parsed.fields.dow.values.includes(dow);
      return true;
    }
    function nextTimeInDay(parsed, wallMs) {
      const d = new Date(wallMs);
      const h0 = d.getUTCHours();
      const m0 = d.getUTCMinutes();
      const s0 = d.getUTCSeconds();
      const secSet = parsed.useSec ? parsed.fields.sec.values : [0];
      const y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate();
      for (const h of parsed.fields.hour.values) {
        if (h < h0) continue;
        for (const m of parsed.fields.min.values) {
          if (h === h0 && m < m0) continue;
          for (const s of secSet) {
            if (h === h0 && m === m0 && s < s0) continue;
            return Date.UTC(y, mo, da, h, m, s);
          }
        }
      }
      return null;
    }
    function nextAllowedMonthStart(parsed, wallMs) {
      const d = new Date(wallMs);
      const y = d.getUTCFullYear(), mo = d.getUTCMonth();
      for (let k = 1; k <= 12; k++) {
        const m2 = mo + k;
        const mm = m2 % 12 + 1;
        if (parsed.fields.month.values.includes(mm)) {
          return Date.UTC(y, m2, 1, 0, 0, 0);
        }
      }
      return null;
    }
    var MAX_DAY_STEPS = 366 * 9;
    function nextFires(parsed, fromMs, count, tzOffsetMinutes) {
      count = Math.max(1, Math.min(50, count || 5));
      const never = findNeverReason(parsed);
      if (never) return { ok: true, fires: [], neverReason: never, horizonReached: false };
      const stepUnit = parsed.useSec ? 1e3 : 6e4;
      let wall = shiftToWall(fromMs, tzOffsetMinutes);
      wall = Math.floor(wall / stepUnit) * stepUnit + stepUnit;
      const fires = [];
      let daySteps = 0;
      let horizonReached = false;
      while (fires.length < count) {
        if (!parsed.fields.month.values.includes(new Date(wall).getUTCMonth() + 1)) {
          const next = nextAllowedMonthStart(parsed, wall);
          if (next === null) {
            horizonReached = true;
            break;
          }
          wall = next;
          continue;
        }
        if (!dayMatchesWall(parsed, wall)) {
          const d = new Date(wall);
          wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
          daySteps++;
          if (daySteps > MAX_DAY_STEPS) {
            horizonReached = true;
            break;
          }
          continue;
        }
        const hit = nextTimeInDay(parsed, wall);
        if (hit === null) {
          const d = new Date(wall);
          wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
          daySteps++;
          if (daySteps > MAX_DAY_STEPS) {
            horizonReached = true;
            break;
          }
          continue;
        }
        fires.push({
          at: wallToAbs(hit, tzOffsetMinutes),
          wallText: formatWallAt(hit, parsed.useSec)
        });
        wall = hit + stepUnit;
      }
      return { ok: true, fires, neverReason: null, horizonReached };
    }
    function findNeverReason(parsed) {
      if (!parsed.domRestricted || parsed.dowRestricted) return null;
      const domValues = parsed.fields.dom.values;
      for (const m of parsed.fields.month.values) {
        for (const d of domValues) {
          if (d <= MAX_DAYS[m - 1]) return null;
        }
      }
      return "\u65E5\u5B57\u6BB5\u9650\u5B9A\u503C\u5728\u8FD9\u4E9B\u6708\u4EFD\u4E2D\u4E0D\u5B58\u5728\uFF08\u5982 2 \u6708\u65E0 30 \u65E5\uFF09";
    }
    function formatWallAt(wallMs, withSec) {
      const d = new Date(wallMs);
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}${withSec ? ":" + pad2(d.getUTCSeconds()) : ""}`;
    }
    function tzTag2(tzOffsetMinutes) {
      if (!tzOffsetMinutes) return "UTC";
      return `UTC${tzOffsetMinutes > 0 ? "+" : "-"}${Math.floor(Math.abs(tzOffsetMinutes) / 60)}${Math.abs(tzOffsetMinutes) % 60 ? ":" + pad2(Math.abs(tzOffsetMinutes) % 60) : ""}`;
    }
    function weekdayCn2(wallMs) {
      return DOW_CN[new Date(wallMs).getUTCDay()];
    }
    function matchesAt2(parsed, atMs, tzOffsetMinutes) {
      const wall = shiftToWall(atMs, tzOffsetMinutes);
      const d = new Date(wall);
      const sec = d.getUTCSeconds();
      const min = d.getUTCMinutes();
      const hour = d.getUTCHours();
      const dom = d.getUTCDate();
      const month = d.getUTCMonth() + 1;
      const dow = d.getUTCDay();
      const secSet = parsed.useSec ? parsed.fields.sec.values : [0];
      const domOk = parsed.fields.dom.values.includes(dom);
      const dowOk = parsed.fields.dow.values.includes(dow);
      const bothR = parsed.domRestricted && parsed.dowRestricted;
      const dayOk = bothR ? domOk || dowOk : parsed.domRestricted ? domOk : parsed.dowRestricted ? dowOk : true;
      const dayNote = bothR ? `\u65E5=${dom}\uFF08\u9650\u5B9A${domOk ? "\u547D\u4E2D" : "\u672A\u4E2D"}\uFF09\u3001\u661F\u671F=${DOW_CN[dow]}\uFF08\u9650\u5B9A${dowOk ? "\u547D\u4E2D" : "\u672A\u4E2D"}\uFF09\u2014\u2014vixie\u300C\u6216\u300D\u8BED\u4E49\uFF1A\u4EFB\u4E00\u547D\u4E2D\u5373\u53EF` : parsed.domRestricted ? `\u65E5\u9650\u5B9A ${parsed.fields.dom.values.join("\u3001")}` : parsed.dowRestricted ? `\u661F\u671F\u9650\u5B9A ${parsed.fields.dow.values.map((v) => DOW_CN[v]).join("\u3001")}` : "\u65E5/\u661F\u671F\u5747\u4E0D\u9650";
      const rows = [];
      if (parsed.useSec) rows.push({ label: "\u79D2", value: String(sec), expect: summarize(parsed.fields.sec.values, { key: "sec" }), ok: secSet.includes(sec) });
      rows.push({ label: "\u5206\u949F", value: String(min), expect: summarize(parsed.fields.min.values, { key: "min" }), ok: parsed.fields.min.values.includes(min) });
      rows.push({ label: "\u5C0F\u65F6", value: String(hour), expect: summarize(parsed.fields.hour.values, { key: "hour" }), ok: parsed.fields.hour.values.includes(hour) });
      rows.push({ label: "\u65E5", value: String(dom), expect: parsed.domRestricted ? summarize(parsed.fields.dom.values, { key: "dom" }) : "\u4E0D\u9650", ok: parsed.domRestricted ? domOk : true });
      rows.push({ label: "\u661F\u671F", value: DOW_CN[dow], expect: parsed.dowRestricted ? summarize(parsed.fields.dow.values, { key: "dow" }) : "\u4E0D\u9650", ok: parsed.dowRestricted ? dowOk : true });
      rows.push({ label: "\u6708", value: `${month}\u6708`, expect: summarize(parsed.fields.month.values, { key: "month" }), ok: parsed.fields.month.values.includes(month) });
      rows.push({ label: "\u65E5+\u661F\u671F\u7EFC\u5408", value: `\u65E5=${dom} \u5468${dow}`, expect: bothR ? "\u6216\uFF08\u4EFB\u4E00\u547D\u4E2D\uFF09" : "\u5355\u8FB9\u5224\u5B9A", ok: dayOk, note: dayNote });
      const match = dayOk && parsed.fields.min.values.includes(min) && parsed.fields.hour.values.includes(hour) && parsed.fields.month.values.includes(month) && secSet.includes(sec);
      const firstMiss = rows.find((r) => !r.ok);
      let firstMismatch = null;
      if (!match) {
        firstMismatch = bothR && !dayOk ? "\u65E5+\u661F\u671F\u7EFC\u5408" : firstMiss ? firstMiss.label : null;
      }
      return { match, checks: rows, firstMismatch, wallText: formatWallAt(wall, parsed.useSec), tz: tzTag2(tzOffsetMinutes) };
    }
    function parseFromInput2(v, tzOffsetMinutes) {
      if (v === void 0 || v === null || v === "") return { ms: Date.now(), mode: "now", error: null };
      if (typeof v === "number" && Number.isFinite(v)) return { ms: v, mode: "epoch", error: null };
      const s = String(v).trim();
      if (/^\d{10,13}$/.test(s)) return { ms: parseInt(s, 10) < 1e12 ? parseInt(s, 10) * 1e3 : parseInt(s, 10), mode: "epoch", error: null };
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        const wallMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
        return { ms: wallToAbs(wallMs, tzOffsetMinutes), mode: "wall", error: null };
      }
      if (/[Zz]|[+-]\d{2}:\d{2}$/.test(s)) {
        const t = Date.parse(s);
        if (!Number.isNaN(t)) return { ms: t, mode: "iso", error: null };
      }
      return { ms: null, mode: "invalid", error: `\u65E0\u6CD5\u8BC6\u522B\u7684\u65F6\u95F4\u300C${s}\u300D\uFF1A\u652F\u6301 epoch \u6BEB\u79D2/\u79D2\u3001YYYY-MM-DD HH:mm(:ss)\uFF08\u6309 tzOffsetMinutes \u5899\u949F\u89E3\u91CA\uFF09\u3001\u5E26 Z \u6216 \xB1HH:MM \u7684 ISO 8601` };
    }
    function renderExplain(parsed) {
      const lines = [];
      lines.push(`\u8868\u8FBE\u5F0F\uFF1A${parsed.normalized}${parsed.raw !== parsed.normalized ? `\uFF08\u8F93\u5165\uFF1A${parsed.raw}\uFF09` : ""}`);
      lines.push(`\u5F62\u6001\uFF1A${parsed.useSec ? "6 \u5B57\u6BB5\uFF08\u542B\u79D2\uFF09" : "5 \u5B57\u6BB5\uFF08\u6807\u51C6 vixie/POSIX\uFF09"}`);
      lines.push("\u5B57\u6BB5\u89E3\u91CA\uFF1A");
      for (const row of describeFields2(parsed)) {
        lines.push(`  ${row.label}\uFF08${row.token}\uFF09\uFF1A${row.text}`);
      }
      const warns = parsed.warnings.filter((w) => w.level === "warn");
      const infos = parsed.warnings.filter((w) => w.level === "info");
      if (warns.length || parsed.notes.length || infos.length) {
        lines.push("\u5751\u8B66\u793A\u4E0E\u63D0\u793A\uFF1A");
        for (const w of warns) lines.push(`  \u26A0 ${w.msg}`);
        for (const n of parsed.notes) lines.push(`  \u2139 ${n.msg}`);
        for (const w of infos) lines.push(`  \u2139 ${w.msg}`);
      }
      return lines.join("\n");
    }
    function renderNext2(parsed, fromMs, count, tzOffsetMinutes) {
      const r = nextFires(parsed, fromMs, count, tzOffsetMinutes);
      if (!r.ok) return r;
      const lines = [];
      if (r.neverReason) {
        lines.push(`\u672A\u6765\u4E0D\u4F1A\u89E6\u53D1\uFF1A${r.neverReason}`);
        return { ok: true, text: lines.join("\n"), fires: [], neverReason: r.neverReason, horizonReached: false };
      }
      lines.push(`\u672A\u6765 ${r.fires.length} \u6B21\u89E6\u53D1\uFF08${tzTag2(tzOffsetMinutes)}\uFF0C\u4ECE ${formatWallAt(shiftToWall(fromMs, tzOffsetMinutes), parsed.useSec)} \u4E4B\u540E\u7B97\u8D77\uFF09\uFF1A`);
      r.fires.forEach((f, i) => {
        lines.push(`  ${i + 1}. ${f.wallText}\uFF08${weekdayCn2(shiftToWall(f.at, tzOffsetMinutes))}\uFF09  epoch=${f.at}`);
      });
      if (r.horizonReached) lines.push("\u26A0 9 \u5E74\u7A97\u53E3\u5185\u672A\u627E\u9F50\u76EE\u6807\u6B21\u6570\u2014\u2014\u8868\u8FBE\u5F0F\u53EF\u80FD\u53EA\u5728\u6781\u7F55\u89C1\u7684\u5E74\u4EFD\u89E6\u53D1\uFF0C\u8BF7\u68C0\u67E5\u5B57\u6BB5");
      return { ok: true, text: lines.join("\n"), fires: r.fires, neverReason: null, horizonReached: r.horizonReached };
    }
    module.exports = {
      parseCron: parseCron2,
      describeFields: describeFields2,
      nextFires,
      matchesAt: matchesAt2,
      parseFromInput: parseFromInput2,
      renderExplain,
      renderNext: renderNext2,
      tzTag: tzTag2,
      formatWallAt,
      weekdayCn: weekdayCn2,
      DOW_CN
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_cron_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.cl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none}
.cl-input:focus{border-color:#4fd1a0}
.cl-btn{width:auto;padding:6px 18px;cursor:pointer;background:#1a2030;color:#E6EAF2;border:1px solid #2b3348;border-radius:8px;font-size:12px}
.cl-btn:hover{border-color:#4fd1a0}
.cl-chips{display:flex;gap:6px;flex-wrap:wrap}
.cl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.cl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.cl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.cl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.cl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.cl-rows{font:12px/1.9 ui-monospace,Consolas,monospace}
.cl-rows .r{display:flex;gap:10px;padding:2px 12px}
.cl-rows .k{color:#8B94A9;min-width:96px;flex-shrink:0}
.cl-rows .t{color:#5C6678;min-width:80px;flex-shrink:0}
.cl-rows .v{color:#c9cede;word-break:break-all}
.cl-warnitem{padding:4px 12px;font-size:11.5px;color:#f3b377}
.cl-infoitem{padding:4px 12px;font-size:11.5px;color:#8B94A9}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.cl-ok{color:#4fd1a0}
.cl-bad{color:#f1a0a0}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-never{padding:10px 12px;color:#f1a0a0;font-size:12px}
`;
var PRESETS = ["*/15 * * * *", "0 9 * * 1-5", "30 4 1,15 * *", "0 0 29 2 *", "0 0 1 * 1", "@daily"];
function CronLensPanel(_props) {
  const initial = _props && _props.initialExpression || "";
  const [text, setText] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [checkText, setCheckText] = useState("");
  const [checkSubmitted, setCheckSubmitted] = useState("");
  const tzOff = useMemo(() => -(/* @__PURE__ */ new Date()).getTimezoneOffset(), []);
  const parsed = useMemo(() => {
    if (!submitted) return null;
    return core.parseCron(submitted);
  }, [submitted]);
  const next = useMemo(() => {
    if (!parsed || !parsed.ok) return null;
    return core.renderNext(parsed, Date.now(), 8, tzOff);
  }, [parsed, tzOff]);
  const match = useMemo(() => {
    if (!parsed || !parsed.ok || !checkSubmitted) return null;
    const t = core.parseFromInput(checkSubmitted, tzOff);
    if (t.error) return { error: t.error };
    return core.matchesAt(parsed, t.ms, tzOff);
  }, [parsed, checkSubmitted, tzOff]);
  return /* @__PURE__ */ jsxs("div", { className: "cl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "cl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "Cron \u8868\u8FBE\u5F0F\u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u89E3\u6790 \xB7 \u4E2D\u6587\u89E3\u91CA \xB7 \u89E6\u53D1\u9884\u62A5 \xB7 \u5751\u68C0\u6D4B \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-body", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "cl-input",
          placeholder: "cron \u8868\u8FBE\u5F0F\uFF1A\u5206 \u65F6 \u65E5 \u6708 \u5468\uFF08\u5982 0 9 * * 1-5 \u5DE5\u4F5C\u65E5 9 \u70B9\uFF09",
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") setSubmitted(text.trim());
          }
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "cl-chips", children: [
        /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => {
          setText(submitted ? submitted : text);
          setSubmitted(text.trim());
        }, children: "\u89E3\u6790\uFF08\u6216\u56DE\u8F66\uFF09" }),
        PRESETS.map((p) => /* @__PURE__ */ jsx("button", { className: "cl-chip", onClick: () => {
          setText(p);
          setSubmitted(p);
        }, children: p }, p))
      ] }),
      parsed && !parsed.ok && /* @__PURE__ */ jsx("div", { className: "cl-err", children: parsed.error }),
      parsed && parsed.ok && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            "\u5B57\u6BB5\u89E3\u91CA\uFF08",
            parsed.normalized,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "cl-rows", children: core.describeFields(parsed).map((row) => /* @__PURE__ */ jsxs("div", { className: "r", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: row.label }),
            /* @__PURE__ */ jsx("span", { className: "t", children: row.token }),
            /* @__PURE__ */ jsx("span", { className: "v", children: row.text })
          ] }, row.label)) })
        ] }),
        (parsed.warnings.length > 0 || parsed.notes.length > 0) && /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u5751\u8B66\u793A\u4E0E\u63D0\u793A" }),
          parsed.warnings.filter((w) => w.level === "warn").map((w, i) => /* @__PURE__ */ jsxs("div", { className: "cl-warnitem", children: [
            "\u26A0 ",
            w.msg
          ] }, `w${i}`)),
          parsed.notes.map((n, i) => /* @__PURE__ */ jsxs("div", { className: "cl-infoitem", children: [
            "\u2139 ",
            n.msg
          ] }, `n${i}`)),
          parsed.warnings.filter((w) => w.level === "info").map((w, i) => /* @__PURE__ */ jsxs("div", { className: "cl-infoitem", children: [
            "\u2139 ",
            w.msg
          ] }, `i${i}`))
        ] }),
        next && /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            "\u672A\u6765\u89E6\u53D1\uFF08",
            core.tzTag(tzOff),
            "\uFF0C\u672C\u673A\u65F6\u533A\uFF09"
          ] }),
          next.neverReason ? /* @__PURE__ */ jsxs("div", { className: "cl-never", children: [
            "\u6C38\u4E0D\u89E6\u53D1\uFF1A",
            next.neverReason
          ] }) : /* @__PURE__ */ jsx("table", { className: "cl-tbl", children: /* @__PURE__ */ jsx("tbody", { children: next.fires.map((f, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { style: { width: 30, color: "#5C6678" }, children: i + 1 }),
            /* @__PURE__ */ jsx("td", { children: f.wallText }),
            /* @__PURE__ */ jsx("td", { children: core.weekdayCn(f.at + tzOff * 6e4) }),
            /* @__PURE__ */ jsxs("td", { style: { color: "#5C6678" }, children: [
              "epoch=",
              f.at
            ] })
          ] }, i)) }) }),
          next.horizonReached && /* @__PURE__ */ jsx("div", { className: "cl-warnitem", children: "\u26A0 9 \u5E74\u7A97\u53E3\u5185\u672A\u627E\u9F50\u76EE\u6807\u6B21\u6570\uFF0C\u8BF7\u68C0\u67E5\u5B57\u6BB5" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u65F6\u523B\u8BCA\u65AD\uFF08\u4E3A\u4EC0\u4E48\u6CA1\u89E6\u53D1\uFF1F\uFF09" }),
          /* @__PURE__ */ jsxs("div", { style: { padding: "8px 12px", display: "flex", gap: 8 }, children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "cl-input",
                style: { width: 220 },
                placeholder: "YYYY-MM-DD HH:mm",
                value: checkText,
                onChange: (e) => setCheckText(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") setCheckSubmitted(checkText.trim());
                }
              }
            ),
            /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => setCheckSubmitted(checkText.trim()), children: "\u68C0\u67E5" })
          ] }),
          match && "error" in match && /* @__PURE__ */ jsx("div", { className: "cl-err", style: { margin: "0 12px 10px" }, children: match.error }),
          match && !("error" in match) && /* @__PURE__ */ jsxs("table", { className: "cl-tbl", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "\u5B57\u6BB5" }),
              /* @__PURE__ */ jsx("th", { children: "\u5B9E\u9645" }),
              /* @__PURE__ */ jsx("th", { children: "\u671F\u671B" }),
              /* @__PURE__ */ jsx("th", { children: "\u5224\u5B9A" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: match.checks.map((c, i) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { children: c.label }),
              /* @__PURE__ */ jsx("td", { children: c.value }),
              /* @__PURE__ */ jsxs("td", { children: [
                c.expect,
                c.note ? /* @__PURE__ */ jsxs("span", { style: { color: "#5C6678" }, children: [
                  " \xB7 ",
                  c.note
                ] }) : null
              ] }),
              /* @__PURE__ */ jsx("td", { className: c.ok ? "cl-ok" : "cl-bad", children: c.ok ? "\u2713" : "\u2717" })
            ] }, i)) })
          ] }),
          match && !("error" in match) && /* @__PURE__ */ jsx("div", { className: "cl-note", style: { padding: "6px 12px" }, children: match.match ? "\u8BE5\u65F6\u523B\u547D\u4E2D\u8868\u8FBE\u5F0F" : `\u672A\u547D\u4E2D\uFF0C\u9996\u56E0\u300C${match.firstMismatch}\u300D` })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u8BED\u4E49\u8FB9\u754C\uFF08\u5982\u5B9E\uFF09\uFF1A\u6309 vixie/POSIX cron \u8BED\u4E49\uFF08\u65E5\u4E0E\u5468\u540C\u65F6\u53D7\u9650=\u300C\u6216\u300D\uFF09\uFF1BQuartz \u7684 L/W/# \u4E0D\u652F\u6301\uFF08\u4F1A\u660E\u786E\u62A5\u9519\uFF09\uFF1B \u89E6\u53D1\u8BA1\u7B97\u7528\u672C\u673A\u56FA\u5B9A\u504F\u79FB\u5899\u949F\uFF0C\u4E0D\u542B\u590F\u4EE4\u65F6\u63A8\u7B97\uFF1B\u6708\u957F/\u95F0\u5E74\u654F\u611F\uFF082 \u6708 29 \u81EA\u52A8\u843D\u95F0\u5E74\uFF09\u3002\u7EAF\u672C\u5730\u89E3\u6790\uFF0C\u96F6\u5916\u8054\u96F6 kv\u3002" })
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function CronLensEntry(props) {
  return /* @__PURE__ */ jsx2(CronLensPanel, { ...props });
}
export {
  CronLensEntry as default
};
