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

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var DAY_MS4 = 864e5;
    function dayKey4(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseDayKey4(s) {
      if (typeof s !== "string") return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      const y = +m[1], mo = +m[2], d = +m[3];
      if (mo < 1 || mo > 12 || d < 1) return null;
      const dim = new Date(y, mo, 0).getDate();
      if (d > dim) return null;
      return new Date(y, mo - 1, d).getTime();
    }
    function dayMinTs(date, minutes) {
      const base = parseDayKey4(date);
      if (base === null) return null;
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return null;
      return base + minutes * 6e4;
    }
    function fmtTime3(ts) {
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    function dayDiff(a, b) {
      const ta = parseDayKey4(a), tb = parseDayKey4(b);
      if (ta === null || tb === null) return null;
      return Math.round((ta - tb) / DAY_MS4);
    }
    function rangeDays2(from, to) {
      const a = parseDayKey4(from), b = parseDayKey4(to);
      if (a === null || b === null || b < a) return null;
      const n = Math.round((b - a) / DAY_MS4) + 1;
      if (n > 400) return null;
      const out = [];
      for (let i = 0; i < n; i++) out.push(dayKey4(a + i * DAY_MS4));
      return out;
    }
    var idSeed = 0;
    function rid() {
      idSeed = (idSeed + 1) % 1296;
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${idSeed.toString(36)}`;
    }
    function clip(s, n) {
      return String(s === void 0 || s === null ? "" : s).trim().slice(0, n);
    }
    function round1(x) {
      return Math.round(x * 10) / 10;
    }
    var KINDS4 = ["bp", "bg", "weight", "temp"];
    var KIND_META5 = {
      bp: { label: "\u8840\u538B", unit: "mmHg" },
      bg: { label: "\u8840\u7CD6", unit: "mmol/L" },
      weight: { label: "\u4F53\u91CD", unit: "kg" },
      temp: { label: "\u4F53\u6E29", unit: "\u2103" }
    };
    var BG_SLOTS3 = ["fasting", "after2h", "random", "bedtime"];
    var BG_SLOT_META3 = {
      fasting: { label: "\u7A7A\u8179" },
      after2h: { label: "\u9910\u540E2h" },
      random: { label: "\u968F\u673A" },
      bedtime: { label: "\u7761\u524D" }
    };
    function normalizeMember2(input, existing) {
      const src = input && typeof input === "object" ? input : {};
      const name = clip(src.name !== void 0 ? src.name : existing && existing.name, 40);
      if (!name) return { error: "\u6210\u5458\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
      const base = existing && typeof existing === "object" ? existing : {};
      const id = clip(src.id || base.id || "", 64) || rid();
      let heightCm = src.heightCm !== void 0 ? src.heightCm : base.heightCm;
      if (heightCm === "" || heightCm === null) heightCm = void 0;
      if (heightCm !== void 0) {
        const h = Number(heightCm);
        if (!Number.isFinite(h) || h < 40 || h > 250) return { error: "\u8EAB\u9AD8\u9700\u5728 40-250 cm \u4E4B\u95F4" };
        heightCm = Math.round(h);
      }
      const member = {
        id,
        name,
        heightCm,
        note: clip(src.note !== void 0 ? src.note : base.note, 200),
        createdAt: base.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      return { member };
    }
    var BAND_NOTE = "\u901A\u7528\u53C2\u8003\u533A\u95F4\uFF0C\u4EC5\u4F9B\u7559\u610F\uFF0C\u8BF7\u9075\u533B\u5631";
    function bandOf4(kind, v, heightCm) {
      if (kind === "bp") {
        const sys = v.sys, dia = v.dia;
        if (sys >= 180 || dia >= 120) return { level: "urgent", label: "\u6025", text: `\u6536\u7F29\u538B ${sys} \u6216\u8212\u5F20\u538B ${dia} \u8FBE 180/120 \u53CA\u4EE5\u4E0A\u533A\u95F4\uFF0C\u5EFA\u8BAE\u5C3D\u5FEB\u5C31\u533B` };
        if (sys >= 140 || dia >= 90) return { level: "red", label: "\u7EA2", text: `\u8FBE\u5230 \u2265140/90 \u53C2\u8003\u7EBF\uFF08\u5BB6\u5EAD\u81EA\u6D4B \u2265135/85 \u5EFA\u8BAE\u5C31\u8BCA\u8BC4\u4F30\uFF09` };
        if (sys < 90 || dia < 60) return { level: "yellow", label: "\u9EC4", text: "\u4F4E\u4E8E 90/60 \u53C2\u8003\u7EBF\uFF0C\u7559\u610F\u5934\u6655\u4E4F\u529B\u7B49\u75C7\u72B6" };
        if (sys >= 130 || dia >= 85) return { level: "yellow", label: "\u9EC4", text: "\u5904\u4E8E 130-139/85-89 \u5173\u6CE8\u533A\u95F4" };
        return { level: "green", label: "\u7EFF", text: "\u5728 <130/85 \u53C2\u8003\u533A\u95F4\u5185" };
      }
      if (kind === "bg") {
        const x = v.mmol, slot = BG_SLOTS3.includes(v.slot) ? v.slot : "random";
        if (x < 3.9) return { level: "red", label: "\u7EA2", text: "\u4F4E\u4E8E 3.9 \u53C2\u8003\u7EBF\uFF08\u504F\u4F4E\uFF09\uFF0C\u8BF7\u9075\u533B\u5631\u5904\u7406" };
        const fasting = slot === "fasting";
        if (fasting) {
          if (x >= 7) return { level: "red", label: "\u7EA2", text: "\u7A7A\u8179 \u22657.0 \u53C2\u8003\u7EBF" };
          if (x > 6.1) return { level: "yellow", label: "\u9EC4", text: "\u7A7A\u8179\u5904\u4E8E 6.1-7.0 \u5173\u6CE8\u533A\u95F4" };
        } else {
          if (x >= 11.1) return { level: "red", label: "\u7EA2", text: "\u9910\u540E/\u968F\u673A \u226511.1 \u53C2\u8003\u7EBF" };
          if (x >= 7.8) return { level: "yellow", label: "\u9EC4", text: "\u9910\u540E/\u968F\u673A\u5904\u4E8E 7.8-11.1 \u5173\u6CE8\u533A\u95F4" };
        }
        return { level: "green", label: "\u7EFF", text: "\u5728\u53C2\u8003\u533A\u95F4\u5185" };
      }
      if (kind === "temp") {
        const c = v.c;
        if (c >= 38.1) return { level: "red", label: "\u7EA2", text: "\u226538.1\u2103 \u53C2\u8003\u7EBF\uFF08\u53D1\u70ED\uFF09" };
        if (c < 35) return { level: "red", label: "\u7EA2", text: "<35.0\u2103 \u53C2\u8003\u7EBF\uFF08\u504F\u4F4E\uFF09" };
        if (c >= 37.3) return { level: "yellow", label: "\u9EC4", text: "37.3-38.0\u2103 \u5173\u6CE8\u533A\u95F4\uFF08\u4F4E\u70ED\uFF09" };
        return { level: "green", label: "\u7EFF", text: "\u5728 36.0-37.2\u2103 \u53C2\u8003\u533A\u95F4\u5185" };
      }
      if (kind === "weight") {
        if (!heightCm) return { level: "none", label: "\u2014", text: "\u672A\u767B\u8BB0\u8EAB\u9AD8\uFF0C\u4E0D\u505A BMI \u5206\u5E26\uFF08\u53EF\u5728\u6210\u5458\u6863\u6848\u8865\u8EAB\u9AD8\uFF09" };
        const bmi = v.kg / Math.pow(heightCm / 100, 2);
        const b = round1(bmi);
        if (bmi >= 28) return { level: "red", label: "\u7EA2", text: `BMI ${b}\uFF08\u226528\uFF09`, bmi: b };
        if (bmi >= 24 || bmi < 18.5) return { level: "yellow", label: "\u9EC4", text: `BMI ${b}\uFF08<18.5 \u6216 24-27.9\uFF09`, bmi: b };
        return { level: "green", label: "\u7EFF", text: `BMI ${b}\uFF0818.5-23.9\uFF09`, bmi: b };
      }
      return { level: "none", label: "\u2014", text: "" };
    }
    function intIn(x, lo, hi) {
      if (!Number.isInteger(x) || x < lo || x > hi) return null;
      return x;
    }
    function num1(x, lo, hi) {
      const n = Number(x);
      if (!Number.isFinite(n) || n < lo || n > hi) return null;
      return round1(n);
    }
    function normalizeRecord2(input, now) {
      const src = input && typeof input === "object" ? input : {};
      const profileId = clip(src.profileId, 64);
      if (!profileId) return { error: "\u7F3A\u5C11\u6210\u5458\uFF08profileId\uFF09" };
      const kind = src.kind;
      if (!KINDS4.includes(kind)) return { error: `kind \u987B\u4E3A ${KINDS4.join("/")}` };
      let values;
      if (kind === "bp") {
        const sys = intIn(Math.trunc(Number(src.sys)), 60, 260);
        if (sys === null) return { error: "\u6536\u7F29\u538B\u987B\u4E3A 60-260 \u7684\u6574\u6570 mmHg" };
        const dia = intIn(Math.trunc(Number(src.dia)), 30, 160);
        if (dia === null) return { error: "\u8212\u5F20\u538B\u987B\u4E3A 30-160 \u7684\u6574\u6570 mmHg" };
        if (sys <= dia) return { error: `\u6536\u7F29\u538B\uFF08${sys}\uFF09\u987B\u5927\u4E8E\u8212\u5F20\u538B\uFF08${dia}\uFF09` };
        let pulse;
        if (src.pulse !== void 0 && src.pulse !== null && src.pulse !== "") {
          pulse = intIn(Math.trunc(Number(src.pulse)), 30, 220);
          if (pulse === null) return { error: "\u5FC3\u7387\u987B\u4E3A 30-220 \u7684\u6574\u6570" };
        }
        values = { sys, dia, pulse };
      } else if (kind === "bg") {
        const mmol = num1(src.mmol, 1, 40);
        if (mmol === null) return { error: "\u8840\u7CD6\u987B\u4E3A 1.0-40.0 mmol/L" };
        const slot = BG_SLOTS3.includes(src.slot) ? src.slot : "random";
        values = { mmol, slot };
      } else if (kind === "weight") {
        const kg = num1(src.kg, 2, 300);
        if (kg === null) return { error: "\u4F53\u91CD\u987B\u4E3A 2.0-300.0 kg" };
        values = { kg };
      } else {
        const c = num1(src.c, 33, 43);
        if (c === null) return { error: "\u4F53\u6E29\u987B\u4E3A 33.0-43.0 \u2103" };
        values = { c };
      }
      let date = src.date === void 0 || src.date === null || src.date === "" ? "today" : src.date;
      if (date === "today") date = dayKey4(now);
      else if (date === "yesterday") date = dayKey4(now - DAY_MS4);
      if (parseDayKey4(date) === null) return { error: `\u65E5\u671F ${JSON.stringify(src.date)} \u65E0\u6CD5\u8BC6\u522B\uFF08today/yesterday/YYYY-MM-DD\uFF09` };
      let minutes;
      const time = src.time;
      if (time === void 0 || time === null || time === "") {
        const d = new Date(date === dayKey4(now) ? now : parseDayKey4(date) + 12 * 36e5);
        minutes = d.getHours() * 60 + d.getMinutes();
        if (date !== dayKey4(now)) minutes = 12 * 60;
      } else {
        const m = /^([01]\d|2[0-3]):[0-5]\d$/.exec(String(time));
        if (!m) return { error: `\u65F6\u523B ${JSON.stringify(time)} \u987B\u4E3A HH:MM\uFF0824 \u5C0F\u65F6\u5236\uFF09` };
        minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      }
      const ts = dayMinTs(date, minutes);
      const record = {
        id: clip(src.id, 64) || rid(),
        profileId,
        kind,
        ts,
        ...values,
        note: clip(src.note, 200),
        src: src.src === "panel" ? "panel" : "ai",
        at: now
      };
      return { record };
    }
    function fmtValue5(r) {
      if (r.kind === "bp") return `${r.sys}/${r.dia}${r.pulse ? ` \xB7 \u5FC3\u7387${r.pulse}` : ""}`;
      if (r.kind === "bg") return `${r.mmol}\uFF08${BG_SLOT_META3[r.slot] ? BG_SLOT_META3[r.slot].label : "\u968F\u673A"}\uFF09`;
      if (r.kind === "weight") return `${r.kg} kg`;
      return `${r.c} \u2103`;
    }
    function upsertRecord2(dayArr, record) {
      const arr = Array.isArray(dayArr) ? dayArr.filter((r) => r && r.id !== record.id) : [];
      arr.push(record);
      arr.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
      return arr;
    }
    function removeRecord2(dayArr, id) {
      const arr = Array.isArray(dayArr) ? dayArr : [];
      const next = arr.filter((r) => r && r.id !== id);
      return { arr: next, found: next.length !== arr.length };
    }
    function dayKeyOfTs5(ts) {
      return dayKey4(ts);
    }
    function dayKeyFor(dateStr) {
      return `maian.day.${dateStr}`;
    }
    var LEVELS = ["urgent", "red", "yellow", "green"];
    function statsFor2(records, heightCmOf) {
      const rs = Array.isArray(records) ? records.filter((r) => r && KINDS4.includes(r.kind)) : [];
      rs.sort((a, b) => a.ts - b.ts);
      const bands = { green: 0, yellow: 0, red: 0, urgent: 0, none: 0 };
      const fields = {};
      const push = (key, v) => {
        if (!fields[key]) fields[key] = { min: v, max: v, sum: 0, n: 0 };
        const f = fields[key];
        if (v < f.min) f.min = v;
        if (v > f.max) f.max = v;
        f.sum += v;
        f.n += 1;
      };
      for (const r of rs) {
        const hc = heightCmOf ? heightCmOf(r.profileId) : void 0;
        const b = bandOf4(r.kind, r, hc);
        bands[b.level] += 1;
        if (r.kind === "bp") {
          push("sys", r.sys);
          push("dia", r.dia);
          if (r.pulse) push("pulse", r.pulse);
        } else if (r.kind === "bg") push("mmol", r.mmol);
        else if (r.kind === "weight") push("kg", r.kg);
        else push("c", r.c);
      }
      const out = { count: rs.length, bands, fields: {}, latest: rs[rs.length - 1] || null, prev: rs[rs.length - 2] || null };
      for (const [k, f] of Object.entries(fields)) {
        out.fields[k] = { min: f.min, max: f.max, avg: round1(f.sum / f.n), n: f.n };
      }
      return out;
    }
    function trendPoints2(records, heightCmOf) {
      const rs = Array.isArray(records) ? records.filter((r) => r && KINDS4.includes(r.kind)) : [];
      rs.sort((a, b) => a.ts - b.ts);
      return rs.map((r) => {
        const b = bandOf4(r.kind, r, heightCmOf ? heightCmOf(r.profileId) : void 0);
        if (r.kind === "bp") return { ts: r.ts, sys: r.sys, dia: r.dia, level: b.level };
        const value = r.kind === "bg" ? r.mmol : r.kind === "weight" ? r.kg : r.c;
        return { ts: r.ts, value, level: b.level };
      });
    }
    function fmtDT4(ts) {
      return `${dayKey4(ts)} ${fmtTime3(ts)}`;
    }
    function buildSummary2({ member, from, to, records }) {
      const ms = records.filter((r) => r && r.profileId === member.id);
      ms.sort((a, b) => a.ts - b.ts);
      const lines = [];
      lines.push(`# \u4F53\u5F81\u8BB0\u5F55\u5C0F\u7ED3\uFF08${from} \u81F3 ${to}\uFF09`);
      lines.push("");
      lines.push(`- \u6210\u5458\uFF1A${member.name}${member.note ? `\uFF08${member.note}\uFF09` : ""}${member.heightCm ? `\uFF0C\u8EAB\u9AD8 ${member.heightCm}cm` : ""}`);
      lines.push(`- \u8BB0\u5F55\u6761\u6570\uFF1A${ms.length}`);
      lines.push(`- \u5BFC\u51FA\u65F6\u95F4\uFF1A${fmtDT4(Date.now())}`);
      lines.push("");
      if (!ms.length) {
        lines.push("\u8BE5\u65F6\u95F4\u6BB5\u6682\u65E0\u8BB0\u5F55\u3002");
        lines.push("");
        lines.push("> \u672C\u5C0F\u7ED3\u4E3A\u5BB6\u5EAD\u81EA\u6D4B\u8BB0\u5F55\u6574\u7406\uFF0C\u4E0D\u6784\u6210\u533B\u7597\u5EFA\u8BAE\uFF1B\u89E3\u8BFB\u8BF7\u9075\u533B\u5631\u3002");
        return lines.join("\n");
      }
      const heightOf = () => member.heightCm;
      for (const kind of KINDS4) {
        const rs = ms.filter((r) => r.kind === kind);
        if (!rs.length) continue;
        const meta = KIND_META5[kind];
        const st = statsFor2(rs, heightOf);
        lines.push(`## ${meta.label}\uFF08${meta.unit}\uFF09`);
        const f = st.fields;
        const agg = kind === "bp" ? `\u6536\u7F29\u538B\u5747\u503C ${f.sys ? f.sys.avg : "\u2014"}\uFF08${f.sys ? f.sys.min : "\u2014"}~${f.sys ? f.sys.max : "\u2014"}\uFF09\uFF0C\u8212\u5F20\u538B\u5747\u503C ${f.dia ? f.dia.avg : "\u2014"}\uFF08${f.dia ? f.dia.min : "\u2014"}~${f.dia ? f.dia.max : "\u2014"}\uFF09${f.pulse ? `\uFF0C\u5FC3\u7387\u5747\u503C ${f.pulse.avg}` : ""}` : Object.values(f)[0] ? `\u5747\u503C ${Object.values(f)[0].avg}\uFF08${Object.values(f)[0].min}~${Object.values(f)[0].max}\uFF09` : "\u2014";
        lines.push(`- \u5171 ${rs.length} \u6B21\uFF1B${agg}`);
        lines.push(`- \u5206\u5E26\uFF1A\u7EFF ${st.bands.green} / \u9EC4 ${st.bands.yellow} / \u7EA2 ${st.bands.red} / \u6025 ${st.bands.urgent}`);
        lines.push("");
        lines.push("| \u65F6\u95F4 | \u6570\u503C | \u5206\u5E26 | \u5907\u6CE8 |");
        lines.push("|---|---|---|---|");
        for (const r of rs) {
          const b = bandOf4(r.kind, r, member.heightCm);
          lines.push(`| ${fmtDT4(r.ts)} | ${fmtValue5(r)} | ${b.label} | ${r.note || ""} |`);
        }
        lines.push("");
      }
      lines.push("> \u672C\u5C0F\u7ED3\u4E3A\u5BB6\u5EAD\u81EA\u6D4B\u8BB0\u5F55\u6574\u7406\uFF0C\u4E0D\u6784\u6210\u533B\u7597\u5EFA\u8BAE\uFF1B\u89E3\u8BFB\u8BF7\u9075\u533B\u5631\u3002");
      return lines.join("\n");
    }
    function exportAllText2({ members, dayMap }) {
      return JSON.stringify({
        app: "maian",
        version: 1,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        members: members || [],
        days: dayMap || {}
      }, null, 2);
    }
    module.exports = {
      DAY_MS: DAY_MS4,
      KINDS: KINDS4,
      KIND_META: KIND_META5,
      BG_SLOTS: BG_SLOTS3,
      BG_SLOT_META: BG_SLOT_META3,
      LEVELS,
      BAND_NOTE,
      dayKey: dayKey4,
      parseDayKey: parseDayKey4,
      dayMinTs,
      fmtTime: fmtTime3,
      fmtDT: fmtDT4,
      dayDiff,
      rangeDays: rangeDays2,
      rid,
      clip,
      round1,
      normalizeMember: normalizeMember2,
      normalizeRecord: normalizeRecord2,
      bandOf: bandOf4,
      fmtValue: fmtValue5,
      upsertRecord: upsertRecord2,
      removeRecord: removeRecord2,
      dayKeyOfTs: dayKeyOfTs5,
      dayKeyFor,
      statsFor: statsFor2,
      trendPoints: trendPoints2,
      buildSummary: buildSummary2,
      exportAllText: exportAllText2
    };
  }
});

// src/Panel.tsx
var core6 = __toESM(require_core());
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
var PREFIX = "maian.";
var K = {
  member: (id) => `${PREFIX}member.${id}`,
  memberPrefix: `${PREFIX}member.`,
  day: (date) => `${PREFIX}day.${date}`,
  dayPrefix: `${PREFIX}day.`
};
function newCache() {
  return { knownKeys: null, fullAt: 0, members: /* @__PURE__ */ new Map(), days: /* @__PURE__ */ new Map() };
}
var FULL_REFRESH_MS = 90 * 1e3;
async function loadMaian(cache) {
  const keys = await kvKeys();
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.members.clear();
    cache.days.clear();
    cache.fullAt = now;
  }
  const keySet = new Set(keys);
  for (const k of [...cache.members.keys()]) if (!keySet.has(k)) cache.members.delete(k);
  for (const k of [...cache.days.keys()]) if (!keySet.has(k)) cache.days.delete(k);
  const memberKeys = keys.filter((k) => k.startsWith(K.memberPrefix));
  const dayKeys = keys.filter((k) => k.startsWith(K.dayPrefix) && core.parseDayKey(k.slice(K.dayPrefix.length)) !== null);
  const memberTodo = memberKeys.filter((k) => full || !cache.members.has(k));
  const dayTodo = dayKeys.filter((k) => full || !cache.days.has(k));
  if (memberTodo.length || dayTodo.length) {
    const [memberVals, dayVals] = await Promise.all([
      Promise.all(memberTodo.map(async (k) => ({ k, v: await kvGet(k).catch(() => null) }))),
      Promise.all(dayTodo.map(async (k) => ({ k, v: await kvGet(k).catch(() => null) })))
    ]);
    for (const { k, v } of memberVals) {
      if (v && typeof v === "object" && v.id) cache.members.set(k, v);
      else if (!v) cache.members.delete(k);
    }
    for (const { k, v } of dayVals) {
      if (Array.isArray(v)) cache.days.set(k, v);
      else if (!v) cache.days.delete(k);
    }
  }
  cache.knownKeys = keySet;
  const members = [...cache.members.values()].sort((a, b) => a.createdAt - b.createdAt);
  const records = [];
  for (const arr of cache.days.values()) for (const r of arr) if (r && r.id) records.push(r);
  records.sort((a, b) => a.ts - b.ts);
  return { members, records, at: now };
}
async function saveMember(input, existing) {
  const r = core.normalizeMember(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const m = r.member;
  await kvSet(K.member(m.id), m);
  return m;
}
async function addRecord(input) {
  const r = core.normalizeRecord({ ...input, src: "panel" }, Date.now());
  if ("error" in r && r.error) throw new Error(r.error);
  const rec = r.record;
  const date = core.dayKeyOfTs(rec.ts);
  const key = K.day(date);
  const cur = await kvGet(key).catch(() => null);
  await kvSet(key, core.upsertRecord(cur, rec));
  return rec;
}
async function locateRecord(id) {
  const keys = await kvKeys();
  const dayKeys = keys.filter((k) => k.startsWith(K.dayPrefix) && core.parseDayKey(k.slice(K.dayPrefix.length)) !== null);
  for (const k of dayKeys) {
    const arr = await kvGet(k).catch(() => null) || [];
    const hit = Array.isArray(arr) ? arr.find((r) => r && r.id === id) : null;
    if (hit) return { date: k.slice(K.dayPrefix.length), dayArr: arr, record: hit };
  }
  return null;
}
async function updateRecord(id, patch) {
  const loc = await locateRecord(id);
  if (!loc) throw new Error(`\u672A\u627E\u5230\u8BB0\u5F55 ${id}`);
  const old = loc.record;
  const r = core.normalizeRecord({
    id: old.id,
    profileId: patch.profileId || old.profileId,
    kind: patch.kind !== void 0 ? patch.kind : old.kind,
    sys: patch.sys !== void 0 ? patch.sys : old.sys,
    dia: patch.dia !== void 0 ? patch.dia : old.dia,
    pulse: patch.pulse !== void 0 ? patch.pulse : old.pulse,
    mmol: patch.mmol !== void 0 ? patch.mmol : old.mmol,
    slot: patch.slot !== void 0 ? patch.slot : old.slot,
    kg: patch.kg !== void 0 ? patch.kg : old.kg,
    c: patch.c !== void 0 ? patch.c : old.c,
    date: patch.date,
    time: patch.time,
    note: patch.note !== void 0 ? patch.note : old.note,
    src: "panel"
  }, Date.now());
  if ("error" in r && r.error) throw new Error(r.error);
  const rec = r.record;
  const newDate = core.dayKeyOfTs(rec.ts);
  if (newDate === loc.date) {
    await kvSet(K.day(loc.date), core.upsertRecord(loc.dayArr, rec));
  } else {
    const removed = core.removeRecord(loc.dayArr, id);
    await kvSet(K.day(loc.date), removed.arr);
    const target = await kvGet(K.day(newDate)).catch(() => null) || [];
    await kvSet(K.day(newDate), core.upsertRecord(target, rec));
  }
  return rec;
}
async function deleteRecord(id) {
  const loc = await locateRecord(id);
  if (!loc) throw new Error(`\u672A\u627E\u5230\u8BB0\u5F55 ${id}`);
  const removed = core.removeRecord(loc.dayArr, id);
  await kvSet(K.day(loc.date), removed.arr);
}
async function deleteMember(id, purge, data) {
  const recs = data.records.filter((r) => r.profileId === id);
  if (recs.length && !purge) {
    throw new Error(`\u8BE5\u6210\u5458\u4ECD\u6709 ${recs.length} \u6761\u4F53\u5F81\u8BB0\u5F55\uFF0C\u8BF7\u5148\u5220\u9664\u8BB0\u5F55\u6216\u9009\u62E9\u4E00\u5E76\u5220\u9664`);
  }
  if (recs.length) {
    const byDay = /* @__PURE__ */ new Map();
    for (const r of recs) {
      const d = core.dayKeyOfTs(r.ts);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(r);
    }
    for (const [d, arr] of byDay) {
      const cur = await kvGet(K.day(d)).catch(() => null) || [];
      let next = cur;
      for (const r of arr) next = core.removeRecord(next, r.id).arr;
      await kvSet(K.day(d), next);
    }
  }
  await kvDel(K.member(id));
}
function exportAll(data) {
  const dayMap = {};
  for (const r of data.records) {
    const d = core.dayKeyOfTs(r.ts);
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(r);
  }
  return core.exportAllText({ members: data.members, dayMap });
}

// src/RecordTab.tsx
var core3 = __toESM(require_core());
import { useMemo, useState } from "react";

// src/ui.tsx
var core2 = __toESM(require_core());
import { jsx } from "react/jsx-runtime";
function BandTag({ level, label }) {
  if (level === "none") return /* @__PURE__ */ jsx("span", { className: "mn-tag", children: "\u2014" });
  return /* @__PURE__ */ jsx("span", { className: `mn-tag ${level}`, children: label });
}
function bandOfRecord(r, member) {
  return core2.bandOf(r.kind, r, member?.heightCm);
}
function memberOf(data, profileId) {
  return data.members.find((m) => m.id === profileId);
}

// src/RecordTab.tsx
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
function RecordTab({ data, reload, showToast }) {
  const [profileId, setProfileId] = useState("");
  const [kind, setKind] = useState("bp");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [mmol, setMmol] = useState("");
  const [slot, setSlot] = useState("fasting");
  const [kg, setKg] = useState("");
  const [c, setC] = useState("");
  const [date, setDate] = useState("today");
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const members = data?.members || [];
  const activeId = profileId || members[0]?.id || "";
  const activeMember = members.find((m) => m.id === activeId);
  const todayKey = core3.dayKey(Date.now());
  const todayRecords = useMemo(
    () => data ? data.records.filter((r) => core3.dayKeyOfTs(r.ts) === todayKey).sort((a, b) => b.ts - a.ts) : [],
    [data, todayKey]
  );
  const weekAgo = Date.now() - 7 * core3.DAY_MS;
  const flags = useMemo(() => {
    if (!data) return [];
    const heightOf = (pid) => data.members.find((m) => m.id === pid)?.heightCm;
    return data.records.filter((r) => r.ts >= weekAgo).filter((r) => ["yellow", "red", "urgent"].includes(bandOfRecord(r, memberOf(data, r.profileId)).level)).sort((a, b) => b.ts - a.ts).slice(0, 12);
  }, [data, weekAgo]);
  async function save() {
    if (!data) return;
    if (!activeMember) {
      showToast("\u5148\u5EFA\u6863\u6210\u5458\uFF08\u4E0B\u65B9\u8F93\u5165\u540D\u5B57\u5373\u53EF\uFF09", true);
      return;
    }
    setBusy(true);
    try {
      const rec = await addRecord({
        profileId: activeMember.id,
        kind,
        sys: kind === "bp" ? Number(sys) : void 0,
        dia: kind === "bp" ? Number(dia) : void 0,
        pulse: kind === "bp" && pulse !== "" ? Number(pulse) : void 0,
        mmol: kind === "bg" ? Number(mmol) : void 0,
        slot: kind === "bg" ? slot : void 0,
        kg: kind === "weight" ? Number(kg) : void 0,
        c: kind === "temp" ? Number(c) : void 0,
        date,
        note: note.trim() || void 0
      });
      const member = data.members.find((m) => m.id === rec.profileId);
      const b = core3.bandOf(rec.kind, rec, member?.heightCm);
      setSys("");
      setDia("");
      setPulse("");
      setMmol("");
      setKg("");
      setC("");
      setNote("");
      await reload();
      showToast(`\u5DF2\u8BB0\u5F55 ${core3.fmtValue(rec)}\u3010${b.label}\u3011${b.text}\uFF08\u8BF7\u9075\u533B\u5631\uFF09`, b.level === "urgent", b.level === "urgent");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function quickAddMember() {
    const name = newName.trim();
    if (!name) return;
    try {
      const m = await saveMember({ name }, null);
      setNewName("");
      setProfileId(m.id);
      await reload();
      showToast(`\u5DF2\u5EFA\u6863\u300C${m.name}\u300D`);
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function del(id) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId("");
    try {
      await deleteRecord(id);
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "mn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  return /* @__PURE__ */ jsxs("div", { children: [
    !members.length && /* @__PURE__ */ jsx2("div", { className: "mn-card", children: /* @__PURE__ */ jsxs("div", { className: "mn-card-b", children: [
      /* @__PURE__ */ jsx2("div", { className: "mn-sub", style: { marginBottom: 8 }, children: "\u5148\u5EFA\u4E00\u4F4D\u5BB6\u5EAD\u6210\u5458\uFF08\u5982\u300C\u5988\u5988\u300D\uFF09\uFF0C\u4E4B\u540E\u5BF9 AI \u8BF4\u300C\u8BB0\u4E00\u4E0B\u5988\u5988\u7684\u8840\u538B\u300D\u4E5F\u884C\u3002" }),
      /* @__PURE__ */ jsxs("div", { className: "mn-row", children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "mn-inp mn-grow",
            placeholder: "\u6210\u5458\u540D\u5B57\uFF0C\u5982\uFF1A\u5988\u5988",
            value: newName,
            onChange: (e) => setNewName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") quickAddMember();
            }
          }
        ),
        /* @__PURE__ */ jsx2("button", { className: "mn-btn", onClick: quickAddMember, children: "\u5EFA\u6863" })
      ] })
    ] }) }),
    members.length > 0 && /* @__PURE__ */ jsx2("div", { className: "mn-card", children: /* @__PURE__ */ jsxs("div", { className: "mn-card-b", children: [
      /* @__PURE__ */ jsx2("span", { className: "mn-lbl", style: { marginTop: 0 }, children: "\u8C01" }),
      /* @__PURE__ */ jsx2("div", { className: "mn-chips", children: members.map((m) => /* @__PURE__ */ jsx2("button", { className: `mn-chip ${activeId === m.id ? "on" : ""}`, onClick: () => setProfileId(m.id), children: m.name }, m.id)) }),
      /* @__PURE__ */ jsx2("span", { className: "mn-lbl", children: "\u6307\u6807" }),
      /* @__PURE__ */ jsx2("div", { className: "mn-chips", children: core3.KINDS.map((k) => /* @__PURE__ */ jsx2("button", { className: `mn-chip ${kind === k ? "on" : ""}`, onClick: () => setKind(k), children: core3.KIND_META[k].label }, k)) }),
      kind === "bp" && /* @__PURE__ */ jsxs("div", { className: "mn-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("input", { className: "mn-inp", style: { width: "30%" }, type: "number", placeholder: "\u6536\u7F29\u538B", value: sys, onChange: (e) => setSys(e.target.value) }),
        /* @__PURE__ */ jsx2("input", { className: "mn-inp", style: { width: "30%" }, type: "number", placeholder: "\u8212\u5F20\u538B", value: dia, onChange: (e) => setDia(e.target.value) }),
        /* @__PURE__ */ jsx2("input", { className: "mn-inp", style: { width: "28%" }, type: "number", placeholder: "\u5FC3\u7387(\u9009)", value: pulse, onChange: (e) => setPulse(e.target.value) })
      ] }),
      kind === "bg" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx2("div", { className: "mn-row", style: { marginTop: 8 }, children: /* @__PURE__ */ jsx2("input", { className: "mn-inp mn-grow", type: "number", step: "0.1", placeholder: "\u8840\u7CD6 mmol/L", value: mmol, onChange: (e) => setMmol(e.target.value) }) }),
        /* @__PURE__ */ jsx2("div", { className: "mn-chips", style: { marginTop: 6 }, children: core3.BG_SLOTS.map((s) => /* @__PURE__ */ jsx2("button", { className: `mn-chip ${slot === s ? "on" : ""}`, onClick: () => setSlot(s), children: core3.BG_SLOT_META[s].label }, s)) })
      ] }),
      kind === "weight" && /* @__PURE__ */ jsxs("div", { className: "mn-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("input", { className: "mn-inp mn-grow", type: "number", step: "0.1", placeholder: "\u4F53\u91CD kg", value: kg, onChange: (e) => setKg(e.target.value) }),
        activeMember?.heightCm ? /* @__PURE__ */ jsxs("span", { className: "mn-tag blue", children: [
          "\u8EAB\u9AD8 ",
          activeMember.heightCm,
          "cm \xB7 BMI \u5206\u5E26\u5F00"
        ] }) : /* @__PURE__ */ jsx2("span", { className: "mn-tag", children: "\u672A\u767B\u8BB0\u8EAB\u9AD8\uFF0CBMI \u5206\u5E26\u5173\uFF08\u8BBE\u7F6E\u91CC\u8865\uFF09" })
      ] }),
      kind === "temp" && /* @__PURE__ */ jsx2("div", { className: "mn-row", style: { marginTop: 8 }, children: /* @__PURE__ */ jsx2("input", { className: "mn-inp mn-grow", type: "number", step: "0.1", placeholder: "\u4F53\u6E29 \u2103", value: c, onChange: (e) => setC(e.target.value) }) }),
      /* @__PURE__ */ jsx2("div", { className: "mn-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2("div", { className: "mn-chips", children: ["today", "yesterday"].map((d) => /* @__PURE__ */ jsx2("button", { className: `mn-chip ${date === d ? "on" : ""}`, onClick: () => setDate(d), children: d === "today" ? "\u4ECA\u5929" : "\u6628\u5929" }, d)) }) }),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "mn-inp",
          style: { marginTop: 8 },
          placeholder: "\u5907\u6CE8\uFF08\u9009\uFF09\uFF1A\u670D\u836F\u524D / \u8FD0\u52A8\u540E / \u5DE6\u81C2\u2026",
          value: note,
          onChange: (e) => setNote(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx2("div", { className: "mn-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2("button", { className: "mn-btn mn-grow", disabled: busy, onClick: save, children: busy ? "\u8BB0\u5F55\u4E2D\u2026" : "\u8BB0\u5F55" }) }),
      /* @__PURE__ */ jsx2("div", { className: "mn-sub", style: { marginTop: 6 }, children: "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5BF9 AI \u8BF4\uFF1A\u300C\u5988\u5988\u65E9\u4E0A\u8840\u538B 152/95 \u5FC3\u7387 78\u300D\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "mn-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "mn-bar" }),
      "\u4ECA\u65E5\u5168\u5BB6",
      /* @__PURE__ */ jsxs("span", { className: "mn-hint", children: [
        todayRecords.length,
        " \u6761"
      ] })
    ] }),
    todayRecords.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "mn-empty", children: "\u4ECA\u5929\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002\u91CF\u5B8C\u968F\u624B\u8BB0\u4E00\u7B14\uFF0C\u590D\u8BCA\u65F6\u5C31\u6709\u636E\u53EF\u4F9D\u3002" }) : todayRecords.map((r) => {
      const member = memberOf(data, r.profileId);
      const b = bandOfRecord(r, member);
      return /* @__PURE__ */ jsx2("div", { className: "mn-card", children: /* @__PURE__ */ jsxs("div", { className: "mn-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "mn-row", children: [
          /* @__PURE__ */ jsx2("b", { children: member?.name || "?" }),
          /* @__PURE__ */ jsxs("span", { children: [
            core3.KIND_META[r.kind].label,
            " ",
            core3.fmtValue(r)
          ] }),
          /* @__PURE__ */ jsx2(BandTag, { level: b.level, label: b.label }),
          /* @__PURE__ */ jsxs("span", { className: "mn-hint", children: [
            core3.fmtTime(r.ts),
            r.src === "panel" ? "" : " \xB7 AI"
          ] })
        ] }),
        (r.note || b.level !== "green" && b.level !== "none") && /* @__PURE__ */ jsxs("div", { className: "mn-sub", style: { marginTop: 4 }, children: [
          r.note ? `${r.note} \xB7 ` : "",
          b.text
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mn-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ jsx2("div", { className: "mn-grow" }),
          confirmId === r.id ? /* @__PURE__ */ jsx2("button", { className: "mn-btn danger sm", onClick: () => del(r.id), children: "\u786E\u8BA4\u5220\u9664" }) : /* @__PURE__ */ jsx2("button", { className: "mn-btn ghost sm", onClick: () => del(r.id), children: "\u5220" })
        ] })
      ] }) }, r.id);
    }),
    flags.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "mn-sec", children: [
        /* @__PURE__ */ jsx2("i", { className: "mn-bar" }),
        "\u8FD1 7 \u5929\u9EC4\u7EA2\u6982\u89C8",
        /* @__PURE__ */ jsx2("span", { className: "mn-hint", children: "\u4EC5\u4F9B\u7559\u610F\uFF0C\u8BF7\u9075\u533B\u5631" })
      ] }),
      flags.map((r) => {
        const member = memberOf(data, r.profileId);
        const b = bandOfRecord(r, member);
        return /* @__PURE__ */ jsx2("div", { className: "mn-card", children: /* @__PURE__ */ jsxs("div", { className: "mn-card-b", children: [
          /* @__PURE__ */ jsxs("div", { className: "mn-row", children: [
            /* @__PURE__ */ jsx2(BandTag, { level: b.level, label: b.label }),
            /* @__PURE__ */ jsx2("span", { children: `${core3.fmtDT(r.ts).slice(5)} \xB7 ${member?.name || "?"} \xB7 ${core3.KIND_META[r.kind].label} ${core3.fmtValue(r)}` })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "mn-sub", style: { marginTop: 3 }, children: b.text })
        ] }) }, r.id);
      })
    ] })
  ] });
}

// src/TrendTab.tsx
var core4 = __toESM(require_core());
import { useMemo as useMemo2, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var SVG_W = 480;
var SVG_H = 150;
var PAD_L = 30;
var PAD_R = 8;
var PAD_T = 10;
var PAD_B = 18;
function TrendTab({ data, showToast }) {
  const [profileId, setProfileId] = useState2("");
  const [kind, setKind] = useState2("bp");
  const [from, setFrom] = useState2(core4.dayKey(Date.now() - 29 * core4.DAY_MS));
  const [to, setTo] = useState2(core4.dayKey(Date.now()));
  const [summary, setSummary] = useState2("");
  const members = data?.members || [];
  const activeId = profileId || members[0]?.id || "";
  const member = members.find((m) => m.id === activeId);
  const range = useMemo2(() => core4.rangeDays(from, to), [from, to]);
  const records = useMemo2(() => {
    if (!data || !member || !range) return [];
    const t0 = core4.parseDayKey(from);
    const t1 = core4.parseDayKey(to) + core4.DAY_MS;
    return data.records.filter((r) => r.profileId === member.id && r.kind === kind && r.ts >= t0 && r.ts < t1);
  }, [data, member, kind, from, to, range]);
  const stats = useMemo2(() => core4.statsFor(records, member?.heightCm ? () => member.heightCm : void 0), [records, member]);
  const points = useMemo2(() => core4.trendPoints(records, member?.heightCm ? () => member.heightCm : void 0), [records, member]);
  function genSummary() {
    if (!data || !member) {
      showToast("\u5148\u5EFA\u6863\u6210\u5458", true);
      return;
    }
    if (!range) {
      showToast("\u65E5\u671F\u533A\u95F4\u65E0\u6548\uFF08\u8DE8\u5EA6 \u2264400 \u5929\uFF09", true);
      return;
    }
    const md = core4.buildSummary({ member, from, to, records: data.records.filter((r) => r.profileId === member.id) });
    setSummary(md);
  }
  async function copySummary() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      showToast("\u5C0F\u7ED3\u5DF2\u590D\u5236\uFF0C\u53EF\u76F4\u63A5\u7C98\u8D34\u7ED9\u533B\u751F");
    } catch (_) {
      showToast("\u590D\u5236\u5931\u8D25\u2014\u2014\u957F\u6309\u4E0B\u65B9\u6587\u672C\u624B\u52A8\u590D\u5236", true, true);
    }
  }
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "mn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  if (!members.length) return /* @__PURE__ */ jsx3("div", { className: "mn-empty", children: "\u5148\u5728\u300C\u8BB0\u5F55\u300D\u6216\u300C\u8BBE\u7F6E\u300D\u91CC\u5EFA\u6210\u5458\uFF0C\u8FD9\u91CC\u624D\u4F1A\u6709\u8D8B\u52BF\u3002" });
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "mn-card", children: /* @__PURE__ */ jsxs2("div", { className: "mn-card-b", children: [
      /* @__PURE__ */ jsx3("span", { className: "mn-lbl", style: { marginTop: 0 }, children: "\u6210\u5458" }),
      /* @__PURE__ */ jsx3("div", { className: "mn-chips", children: members.map((m) => /* @__PURE__ */ jsx3("button", { className: `mn-chip ${activeId === m.id ? "on" : ""}`, onClick: () => setProfileId(m.id), children: m.name }, m.id)) }),
      /* @__PURE__ */ jsx3("span", { className: "mn-lbl", children: "\u6307\u6807" }),
      /* @__PURE__ */ jsx3("div", { className: "mn-chips", children: core4.KINDS.map((k) => {
        const n = data.records.filter((r) => r.profileId === activeId && r.kind === k).length;
        return /* @__PURE__ */ jsxs2("button", { className: `mn-chip ${kind === k ? "on" : ""}`, onClick: () => setKind(k), children: [
          core4.KIND_META[k].label,
          n ? ` ${n}` : ""
        ] }, k);
      }) }),
      /* @__PURE__ */ jsxs2("div", { className: "mn-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3("input", { className: "mn-inp", type: "date", value: from, onChange: (e) => setFrom(e.target.value) }),
        /* @__PURE__ */ jsx3("span", { className: "mn-sub", children: "\u81F3" }),
        /* @__PURE__ */ jsx3("input", { className: "mn-inp", type: "date", value: to, onChange: (e) => setTo(e.target.value) })
      ] }),
      !range && /* @__PURE__ */ jsx3("div", { className: "mn-err", children: "\u65E5\u671F\u533A\u95F4\u65E0\u6548\uFF08\u987B YYYY-MM-DD \u4E14\u8DE8\u5EA6 \u2264400 \u5929\uFF09" })
    ] }) }),
    range && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "mn-sec", children: [
        /* @__PURE__ */ jsx3("i", { className: "mn-bar" }),
        "\u533A\u95F4\u7EDF\u8BA1",
        /* @__PURE__ */ jsxs2("span", { className: "mn-hint", children: [
          from.slice(5),
          " ~ ",
          to.slice(5),
          " \xB7 ",
          stats.count,
          " \u6761"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "mn-card", children: /* @__PURE__ */ jsx3("div", { className: "mn-card-b", children: stats.count === 0 ? /* @__PURE__ */ jsxs2("div", { className: "mn-empty", style: { padding: 14 }, children: [
        "\u8BE5\u533A\u95F4\u6CA1\u6709",
        core4.KIND_META[kind].label,
        "\u8BB0\u5F55\u3002"
      ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
        /* @__PURE__ */ jsx3("div", { className: "mn-row", style: { flexWrap: "wrap", gap: 6 }, children: Object.entries(stats.fields).map(([k, f]) => /* @__PURE__ */ jsxs2("span", { className: "mn-tag blue", children: [
          k === "sys" ? "\u6536\u7F29\u538B" : k === "dia" ? "\u8212\u5F20\u538B" : k === "pulse" ? "\u5FC3\u7387" : k === "mmol" ? "\u8840\u7CD6" : k === "kg" ? "\u4F53\u91CD" : "\u4F53\u6E29",
          " \u5747 ",
          f.avg,
          "\uFF08",
          f.min,
          "~",
          f.max,
          "\uFF09"
        ] }, k)) }),
        /* @__PURE__ */ jsxs2("div", { className: "mn-row", style: { marginTop: 8, gap: 6 }, children: [
          /* @__PURE__ */ jsx3(BandTag, { level: "green", label: `\u7EFF ${stats.bands.green}` }),
          /* @__PURE__ */ jsx3(BandTag, { level: "yellow", label: `\u9EC4 ${stats.bands.yellow}` }),
          /* @__PURE__ */ jsx3(BandTag, { level: "red", label: `\u7EA2 ${stats.bands.red}` }),
          /* @__PURE__ */ jsx3(BandTag, { level: "urgent", label: `\u6025 ${stats.bands.urgent}` }),
          /* @__PURE__ */ jsx3("span", { className: "mn-hint", children: "\u901A\u7528\u53C2\u8003\u533A\u95F4\uFF0C\u8BF7\u9075\u533B\u5631" })
        ] }),
        stats.latest && /* @__PURE__ */ jsxs2("div", { className: "mn-sub", style: { marginTop: 8 }, children: [
          "\u6700\u8FD1\u4E00\u6B21\uFF1A",
          core4.fmtDT(stats.latest.ts),
          " ",
          core4.fmtValue(stats.latest),
          "\uFF08",
          bandOfRecord(stats.latest, member).text,
          "\uFF09"
        ] })
      ] }) }) }),
      points.length >= 2 && /* @__PURE__ */ jsxs2(Fragment2, { children: [
        /* @__PURE__ */ jsxs2("div", { className: "mn-sec", children: [
          /* @__PURE__ */ jsx3("i", { className: "mn-bar" }),
          "\u8D8B\u52BF",
          /* @__PURE__ */ jsx3("span", { className: "mn-hint", children: kind === "bp" ? "\u4E0A\u7EBF=\u6536\u7F29 \u4E0B\u7EBF=\u8212\u5F20" : core4.KIND_META[kind].unit })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "mn-card", children: /* @__PURE__ */ jsx3("div", { className: "mn-card-b", style: { overflowX: "auto" }, children: /* @__PURE__ */ jsx3(TrendChart, { kind, points }) }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "mn-sec", children: [
        /* @__PURE__ */ jsx3("i", { className: "mn-bar" }),
        "\u5C31\u8BCA\u5C0F\u7ED3"
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "mn-card", children: /* @__PURE__ */ jsxs2("div", { className: "mn-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "mn-sub", style: { marginBottom: 8 }, children: [
          "\u628A\u300C",
          from.slice(5),
          " ~ ",
          to.slice(5),
          "\u300D\u7684\u8BB0\u5F55\u6574\u7406\u6210\u4E00\u5F20\u53EF\u5E26\u7ED9\u533B\u751F\u7684\u5C0F\u7ED3\uFF08\u7EDF\u8BA1+\u5206\u5E26+\u9010\u6761\u660E\u7EC6\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "mn-btn", onClick: genSummary, children: "\u751F\u6210\u5C0F\u7ED3" }),
        summary && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "mn-row", children: [
            /* @__PURE__ */ jsx3("button", { className: "mn-btn ok sm", onClick: copySummary, children: "\u590D\u5236" }),
            /* @__PURE__ */ jsx3("button", { className: "mn-btn ghost sm", onClick: () => setSummary(""), children: "\u6536\u8D77" })
          ] }),
          /* @__PURE__ */ jsx3("textarea", { className: "mn-inp", readOnly: true, value: summary, rows: 14, style: { marginTop: 8, font: "11px/1.6 ui-monospace,Consolas,monospace" }, onFocus: (e) => e.currentTarget.select() })
        ] })
      ] }) })
    ] })
  ] });
}
function TrendChart({ kind, points }) {
  const vals = [];
  for (const p of points) {
    if (kind === "bp") {
      vals.push(p.sys, p.dia);
    } else vals.push(p.value);
  }
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi - lo < 1) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const t0 = points[0].ts;
  const t1 = points[points.length - 1].ts;
  const span = Math.max(t1 - t0, 1);
  const x = (ts) => PAD_L + (ts - t0) / span * (SVG_W - PAD_L - PAD_R);
  const y = (v) => PAD_T + (1 - (v - lo) / (hi - lo)) * (SVG_H - PAD_T - PAD_B);
  const path = (getV) => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ts).toFixed(1)},${y(getV(p)).toFixed(1)}`).join(" ");
  const dotColor = { green: "#3FB950", yellow: "#E3B341", red: "#F85149", urgent: "#FF5A6E", none: "#8B95A7" };
  const grid = [0, 0.5, 1].map((f) => {
    const v = hi - f * (hi - lo);
    return { y: PAD_T + f * (SVG_H - PAD_T - PAD_B), label: String(Math.round(v * 10) / 10) };
  });
  return /* @__PURE__ */ jsxs2("svg", { viewBox: `0 0 ${SVG_W} ${SVG_H}`, style: { width: "100%", height: "auto", display: "block" }, role: "img", "aria-label": "\u4F53\u5F81\u8D8B\u52BF\u56FE", children: [
    grid.map((g, i) => /* @__PURE__ */ jsxs2("g", { children: [
      /* @__PURE__ */ jsx3("line", { x1: PAD_L, y1: g.y, x2: SVG_W - PAD_R, y2: g.y, stroke: "#242C3A", strokeWidth: "1" }),
      /* @__PURE__ */ jsx3("text", { x: PAD_L - 4, y: g.y + 3, fill: "#5C6678", fontSize: "8", textAnchor: "end", children: g.label })
    ] }, i)),
    kind === "bp" ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsx3("path", { d: path((p) => p.sys), fill: "none", stroke: "#F85149", strokeWidth: "1.6" }),
      /* @__PURE__ */ jsx3("path", { d: path((p) => p.dia), fill: "none", stroke: "#58A6FF", strokeWidth: "1.6" }),
      points.map((p, i) => /* @__PURE__ */ jsxs2("g", { children: [
        /* @__PURE__ */ jsx3("circle", { cx: x(p.ts), cy: y(p.sys), r: "2.6", fill: dotColor[p.level] || "#8B95A7" }),
        /* @__PURE__ */ jsx3("circle", { cx: x(p.ts), cy: y(p.dia), r: "2.6", fill: dotColor[p.level] || "#8B95A7" })
      ] }, i))
    ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsx3("path", { d: path((p) => p.value), fill: "none", stroke: "#79B8FF", strokeWidth: "1.6" }),
      points.map((p, i) => /* @__PURE__ */ jsx3("circle", { cx: x(p.ts), cy: y(p.value), r: "2.6", fill: dotColor[p.level] || "#8B95A7" }, i))
    ] }),
    /* @__PURE__ */ jsx3("text", { x: PAD_L, y: SVG_H - 4, fill: "#5C6678", fontSize: "8", children: core4.fmtDT(t0).slice(5) }),
    /* @__PURE__ */ jsx3("text", { x: SVG_W - PAD_R, y: SVG_H - 4, fill: "#5C6678", fontSize: "8", textAnchor: "end", children: core4.fmtDT(t1).slice(5) })
  ] });
}

// src/LedgerTab.tsx
var core5 = __toESM(require_core());
import { useMemo as useMemo3, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function LedgerTab({ data, reload, showToast }) {
  const [fMember, setFMember] = useState3("");
  const [fKind, setFKind] = useState3("");
  const [fFrom, setFFrom] = useState3("");
  const [fTo, setFTo] = useState3("");
  const [edit, setEdit] = useState3(null);
  const [confirmId, setConfirmId] = useState3("");
  const [busy, setBusy] = useState3(false);
  const members = data?.members || [];
  const filtered = useMemo3(() => {
    if (!data) return [];
    let rs = [...data.records];
    if (fMember) rs = rs.filter((r) => r.profileId === fMember);
    if (fKind) rs = rs.filter((r) => r.kind === fKind);
    if (fFrom) {
      const t = core5.parseDayKey(fFrom);
      if (t !== null) rs = rs.filter((r) => r.ts >= t);
    }
    if (fTo) {
      const t = core5.parseDayKey(fTo);
      if (t !== null) rs = rs.filter((r) => r.ts < t + core5.DAY_MS);
    }
    return rs.sort((a, b) => b.ts - a.ts);
  }, [data, fMember, fKind, fFrom, fTo]);
  const groups = useMemo3(() => {
    const m = /* @__PURE__ */ new Map();
    for (const r of filtered) {
      const d = core5.dayKeyOfTs(r.ts);
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(r);
    }
    return [...m.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [filtered]);
  function openEdit(r) {
    setEdit({
      id: r.id,
      kind: r.kind,
      profileId: r.profileId,
      sys: r.sys !== void 0 ? String(r.sys) : "",
      dia: r.dia !== void 0 ? String(r.dia) : "",
      pulse: r.pulse !== void 0 ? String(r.pulse) : "",
      mmol: r.mmol !== void 0 ? String(r.mmol) : "",
      slot: r.slot || "random",
      kg: r.kg !== void 0 ? String(r.kg) : "",
      c: r.c !== void 0 ? String(r.c) : "",
      date: core5.dayKeyOfTs(r.ts),
      time: core5.fmtTime(r.ts),
      note: r.note || ""
    });
  }
  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      await updateRecord(edit.id, {
        profileId: edit.profileId,
        kind: edit.kind,
        sys: edit.kind === "bp" ? Number(edit.sys) : void 0,
        dia: edit.kind === "bp" ? Number(edit.dia) : void 0,
        pulse: edit.kind === "bp" && edit.pulse !== "" ? Number(edit.pulse) : void 0,
        mmol: edit.kind === "bg" ? Number(edit.mmol) : void 0,
        slot: edit.kind === "bg" ? edit.slot : void 0,
        kg: edit.kind === "weight" ? Number(edit.kg) : void 0,
        c: edit.kind === "temp" ? Number(edit.c) : void 0,
        date: edit.date,
        time: edit.time,
        note: edit.note.trim()
      });
      setEdit(null);
      await reload();
      showToast("\u5DF2\u4FEE\u6539");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function del(id) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId("");
    try {
      await deleteRecord(id);
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "mn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx4("div", { className: "mn-card", children: /* @__PURE__ */ jsxs3("div", { className: "mn-card-b", children: [
      /* @__PURE__ */ jsx4("span", { className: "mn-lbl", style: { marginTop: 0 }, children: "\u7B5B\u9009" }),
      /* @__PURE__ */ jsxs3("div", { className: "mn-chips", children: [
        /* @__PURE__ */ jsx4("button", { className: `mn-chip ${fMember === "" ? "on" : ""}`, onClick: () => setFMember(""), children: "\u5168\u90E8\u6210\u5458" }),
        members.map((m) => /* @__PURE__ */ jsx4("button", { className: `mn-chip ${fMember === m.id ? "on" : ""}`, onClick: () => setFMember(m.id), children: m.name }, m.id))
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "mn-chips", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx4("button", { className: `mn-chip ${fKind === "" ? "on" : ""}`, onClick: () => setFKind(""), children: "\u5168\u90E8\u6307\u6807" }),
        core5.KINDS.map((k) => /* @__PURE__ */ jsx4("button", { className: `mn-chip ${fKind === k ? "on" : ""}`, onClick: () => setFKind(k), children: core5.KIND_META[k].label }, k))
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "mn-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "mn-inp", type: "date", value: fFrom, onChange: (e) => setFFrom(e.target.value) }),
        /* @__PURE__ */ jsx4("span", { className: "mn-sub", children: "\u81F3" }),
        /* @__PURE__ */ jsx4("input", { className: "mn-inp", type: "date", value: fTo, onChange: (e) => setFTo(e.target.value) }),
        (fFrom || fTo) && /* @__PURE__ */ jsx4("button", { className: "mn-btn ghost sm", onClick: () => {
          setFFrom("");
          setFTo("");
        }, children: "\u6E05\u65E5\u671F" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "mn-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "mn-bar" }),
      "\u8BB0\u5F55",
      /* @__PURE__ */ jsxs3("span", { className: "mn-hint", children: [
        filtered.length,
        " \u6761"
      ] })
    ] }),
    groups.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "mn-empty", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8BB0\u5F55\u3002" }) : groups.map(([date, rs]) => /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsxs3("div", { className: "mn-sec", style: { padding: "10px 18px 4px" }, children: [
        /* @__PURE__ */ jsx4("i", { className: "mn-bar" }),
        date
      ] }),
      rs.map((r) => {
        const member = memberOf(data, r.profileId);
        const b = bandOfRecord(r, member);
        return /* @__PURE__ */ jsx4("div", { className: "mn-card", children: /* @__PURE__ */ jsxs3("div", { className: "mn-card-b", children: [
          /* @__PURE__ */ jsxs3("div", { className: "mn-row", children: [
            /* @__PURE__ */ jsx4("span", { className: "mn-tag blue", children: core5.fmtTime(r.ts) }),
            /* @__PURE__ */ jsx4("b", { children: member?.name || "?" }),
            /* @__PURE__ */ jsxs3("span", { children: [
              core5.KIND_META[r.kind].label,
              " ",
              core5.fmtValue(r)
            ] }),
            /* @__PURE__ */ jsx4(BandTag, { level: b.level, label: b.label }),
            /* @__PURE__ */ jsx4("span", { className: "mn-hint", children: r.src === "panel" ? "\u9762\u677F" : "AI" })
          ] }),
          (r.note || b.level !== "green" && b.level !== "none") && /* @__PURE__ */ jsxs3("div", { className: "mn-sub", style: { marginTop: 4 }, children: [
            r.note ? `${r.note} \xB7 ` : "",
            b.text
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "mn-row", style: { marginTop: 6 }, children: [
            /* @__PURE__ */ jsx4("div", { className: "mn-grow" }),
            /* @__PURE__ */ jsx4("button", { className: "mn-btn ghost sm", onClick: () => openEdit(r), children: "\u6539" }),
            confirmId === r.id ? /* @__PURE__ */ jsx4("button", { className: "mn-btn danger sm", onClick: () => del(r.id), children: "\u786E\u8BA4\u5220\u9664" }) : /* @__PURE__ */ jsx4("button", { className: "mn-btn ghost sm", onClick: () => del(r.id), children: "\u5220" })
          ] })
        ] }) }, r.id);
      })
    ] }, date)),
    edit && /* @__PURE__ */ jsx4("div", { className: "mn-modal-bg", onClick: (e) => {
      if (e.target === e.currentTarget) setEdit(null);
    }, children: /* @__PURE__ */ jsxs3("div", { className: "mn-modal", children: [
      /* @__PURE__ */ jsx4("h4", { children: "\u4FEE\u6539\u8BB0\u5F55" }),
      /* @__PURE__ */ jsx4("span", { className: "mn-lbl", children: "\u6210\u5458" }),
      /* @__PURE__ */ jsx4("div", { className: "mn-chips", children: members.map((m) => /* @__PURE__ */ jsx4("button", { className: `mn-chip ${edit.profileId === m.id ? "on" : ""}`, onClick: () => setEdit({ ...edit, profileId: m.id }), children: m.name }, m.id)) }),
      /* @__PURE__ */ jsx4("span", { className: "mn-lbl", children: "\u6307\u6807" }),
      /* @__PURE__ */ jsx4("div", { className: "mn-chips", children: core5.KINDS.map((k) => /* @__PURE__ */ jsx4("button", { className: `mn-chip ${edit.kind === k ? "on" : ""}`, onClick: () => setEdit({ ...edit, kind: k }), children: core5.KIND_META[k].label }, k)) }),
      edit.kind === "bp" && /* @__PURE__ */ jsxs3("div", { className: "mn-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "mn-inp", style: { width: "30%" }, type: "number", placeholder: "\u6536\u7F29\u538B", value: edit.sys, onChange: (e) => setEdit({ ...edit, sys: e.target.value }) }),
        /* @__PURE__ */ jsx4("input", { className: "mn-inp", style: { width: "30%" }, type: "number", placeholder: "\u8212\u5F20\u538B", value: edit.dia, onChange: (e) => setEdit({ ...edit, dia: e.target.value }) }),
        /* @__PURE__ */ jsx4("input", { className: "mn-inp", style: { width: "28%" }, type: "number", placeholder: "\u5FC3\u7387(\u9009)", value: edit.pulse, onChange: (e) => setEdit({ ...edit, pulse: e.target.value }) })
      ] }),
      edit.kind === "bg" && /* @__PURE__ */ jsxs3(Fragment3, { children: [
        /* @__PURE__ */ jsx4("div", { className: "mn-row", style: { marginTop: 8 }, children: /* @__PURE__ */ jsx4("input", { className: "mn-inp mn-grow", type: "number", step: "0.1", placeholder: "\u8840\u7CD6 mmol/L", value: edit.mmol, onChange: (e) => setEdit({ ...edit, mmol: e.target.value }) }) }),
        /* @__PURE__ */ jsx4("div", { className: "mn-chips", style: { marginTop: 6 }, children: core5.BG_SLOTS.map((s) => /* @__PURE__ */ jsx4("button", { className: `mn-chip ${edit.slot === s ? "on" : ""}`, onClick: () => setEdit({ ...edit, slot: s }), children: core5.BG_SLOT_META[s].label }, s)) })
      ] }),
      edit.kind === "weight" && /* @__PURE__ */ jsx4("div", { className: "mn-row", style: { marginTop: 8 }, children: /* @__PURE__ */ jsx4("input", { className: "mn-inp mn-grow", type: "number", step: "0.1", placeholder: "\u4F53\u91CD kg", value: edit.kg, onChange: (e) => setEdit({ ...edit, kg: e.target.value }) }) }),
      edit.kind === "temp" && /* @__PURE__ */ jsx4("div", { className: "mn-row", style: { marginTop: 8 }, children: /* @__PURE__ */ jsx4("input", { className: "mn-inp mn-grow", type: "number", step: "0.1", placeholder: "\u4F53\u6E29 \u2103", value: edit.c, onChange: (e) => setEdit({ ...edit, c: e.target.value }) }) }),
      /* @__PURE__ */ jsxs3("div", { className: "mn-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "mn-inp mn-grow", type: "date", value: edit.date, onChange: (e) => setEdit({ ...edit, date: e.target.value }) }),
        /* @__PURE__ */ jsx4("input", { className: "mn-inp", type: "time", value: edit.time, onChange: (e) => setEdit({ ...edit, time: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsx4(
        "input",
        {
          className: "mn-inp",
          style: { marginTop: 8 },
          placeholder: "\u5907\u6CE8",
          value: edit.note,
          onChange: (e) => setEdit({ ...edit, note: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "mn-row", style: { marginTop: 12 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "mn-btn mn-grow", disabled: busy, onClick: saveEdit, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx4("button", { className: "mn-btn ghost", onClick: () => setEdit(null), children: "\u53D6\u6D88" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "mn-sub", style: { marginTop: 6 }, children: "\u6539\u65E5\u671F\u8DE8\u65E5/\u8DE8\u6708\u4F1A\u81EA\u52A8\u8FC1\u79FB\uFF0C\u7EDF\u8BA1\u53E3\u5F84\u4E0D\u53D8\u3002" })
    ] }) })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [name, setName] = useState4("");
  const [height, setHeight] = useState4("");
  const [note, setNote] = useState4("");
  const [editing, setEditing] = useState4(null);
  const [confirmId, setConfirmId] = useState4("");
  const [exportText, setExportText] = useState4("");
  const [busy, setBusy] = useState4(false);
  const members = data?.members || [];
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const m = await saveMember({ name, heightCm: height === "" ? void 0 : Number(height), note }, null);
      setName("");
      setHeight("");
      setNote("");
      await reload();
      showToast(`\u5DF2\u5EFA\u6863\u300C${m.name}\u300D`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit() {
    if (!editing || !data) return;
    const existing = data.members.find((m) => m.id === editing.id);
    if (!existing) return;
    setBusy(true);
    try {
      await saveMember(
        { name: editing.name, heightCm: editing.height === "" ? void 0 : Number(editing.height), note: editing.note },
        existing
      );
      setEditing(null);
      await reload();
      showToast("\u5DF2\u4FDD\u5B58");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function del(id, purge) {
    if (!data) return;
    const hasRecords = data.records.some((r) => r.profileId === id);
    if (!purge && hasRecords && confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId("");
    try {
      await deleteMember(id, purge, data);
      await reload();
      showToast(purge ? "\u6210\u5458\u4E0E\u76F8\u5173\u8BB0\u5F55\u5DF2\u5220\u9664" : "\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(e.message, true);
    }
  }
  if (!data) return /* @__PURE__ */ jsx5("div", { className: "mn-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "mn-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "mn-bar" }),
      "\u5BB6\u5EAD\u6210\u5458"
    ] }),
    members.map((m) => {
      const n = data.records.filter((r) => r.profileId === m.id).length;
      return /* @__PURE__ */ jsx5("div", { className: "mn-card", children: /* @__PURE__ */ jsx5("div", { className: "mn-card-b", children: editing && editing.id === m.id ? /* @__PURE__ */ jsxs4(Fragment4, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "mn-row", children: [
          /* @__PURE__ */ jsx5(
            "input",
            {
              className: "mn-inp",
              style: { width: "38%" },
              placeholder: "\u540D\u5B57",
              value: editing.name,
              onChange: (e) => setEditing({ ...editing, name: e.target.value })
            }
          ),
          /* @__PURE__ */ jsx5(
            "input",
            {
              className: "mn-inp",
              style: { width: "26%" },
              type: "number",
              placeholder: "\u8EAB\u9AD8cm",
              value: editing.height,
              onChange: (e) => setEditing({ ...editing, height: e.target.value })
            }
          )
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "mn-inp",
            style: { marginTop: 6 },
            placeholder: "\u5907\u6CE8\uFF08\u5982 \u9AD8\u8840\u538B\u968F\u8BBF\uFF09",
            value: editing.note,
            onChange: (e) => setEditing({ ...editing, note: e.target.value })
          }
        ),
        /* @__PURE__ */ jsxs4("div", { className: "mn-row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx5("button", { className: "mn-btn mn-grow", disabled: busy, onClick: saveEdit, children: "\u4FDD\u5B58" }),
          /* @__PURE__ */ jsx5("button", { className: "mn-btn ghost", onClick: () => setEditing(null), children: "\u53D6\u6D88" })
        ] })
      ] }) : /* @__PURE__ */ jsxs4(Fragment4, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "mn-row", children: [
          /* @__PURE__ */ jsx5("b", { children: m.name }),
          m.heightCm ? /* @__PURE__ */ jsxs4("span", { className: "mn-tag blue", children: [
            "\u8EAB\u9AD8 ",
            m.heightCm,
            "cm"
          ] }) : /* @__PURE__ */ jsx5("span", { className: "mn-tag", children: "\u65E0\u8EAB\u9AD8\uFF08BMI \u5206\u5E26\u5173\uFF09" }),
          /* @__PURE__ */ jsxs4("span", { className: "mn-hint", children: [
            "\u7D2F\u8BA1 ",
            n,
            " \u6761"
          ] })
        ] }),
        m.note && /* @__PURE__ */ jsx5("div", { className: "mn-sub", style: { marginTop: 3 }, children: m.note }),
        /* @__PURE__ */ jsxs4("div", { className: "mn-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ jsx5("div", { className: "mn-grow" }),
          /* @__PURE__ */ jsx5("button", { className: "mn-btn ghost sm", onClick: () => setEditing({ id: m.id, name: m.name, height: m.heightCm ? String(m.heightCm) : "", note: m.note }), children: "\u6539" }),
          confirmId === m.id && data.records.some((r) => r.profileId === m.id) ? /* @__PURE__ */ jsxs4("button", { className: "mn-btn danger sm", onClick: () => del(m.id, true), children: [
            "\u8FDE\u540C ",
            n,
            " \u6761\u8BB0\u5F55\u5220\u9664"
          ] }) : /* @__PURE__ */ jsx5("button", { className: "mn-btn ghost sm", onClick: () => del(m.id, false), children: "\u5220" })
        ] })
      ] }) }) }, m.id);
    }),
    /* @__PURE__ */ jsx5("div", { className: "mn-card", children: /* @__PURE__ */ jsxs4("div", { className: "mn-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "mn-row", children: [
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "mn-inp",
            style: { width: "38%" },
            placeholder: "\u65B0\u6210\u5458\u540D\u5B57",
            value: name,
            onChange: (e) => setName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") add();
            }
          }
        ),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "mn-inp",
            style: { width: "26%" },
            type: "number",
            placeholder: "\u8EAB\u9AD8cm(\u9009)",
            value: height,
            onChange: (e) => setHeight(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx5("button", { className: "mn-btn", disabled: busy || !name.trim(), onClick: add, children: "\u5EFA\u6863" })
      ] }),
      /* @__PURE__ */ jsx5(
        "input",
        {
          className: "mn-inp",
          style: { marginTop: 6 },
          placeholder: "\u5907\u6CE8\uFF08\u9009\uFF0C\u5982 \u9AD8\u8840\u538B\u968F\u8BBF / \u5B55\u671F\u76D1\u6D4B\uFF09",
          value: note,
          onChange: (e) => setNote(e.target.value)
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "mn-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "mn-bar" }),
      "\u6570\u636E\u5BFC\u51FA"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "mn-card", children: /* @__PURE__ */ jsxs4("div", { className: "mn-card-b", children: [
      /* @__PURE__ */ jsx5("div", { className: "mn-sub", style: { marginBottom: 8 }, children: "\u5168\u91CF\u5BFC\u51FA\u4E3A JSON\uFF08\u6210\u5458+\u5168\u90E8\u8BB0\u5F55\uFF09\uFF0C\u6570\u636E\u59CB\u7EC8\u5C5E\u4E8E\u4F60\u3002" }),
      !exportText ? /* @__PURE__ */ jsx5("button", { className: "mn-btn", onClick: () => setExportText(exportAll(data)), children: "\u751F\u6210\u5BFC\u51FA\u6587\u672C" }) : /* @__PURE__ */ jsxs4(Fragment4, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "mn-row", children: [
          /* @__PURE__ */ jsx5("button", { className: "mn-btn ghost sm", onClick: async () => {
            try {
              await navigator.clipboard.writeText(exportText);
              showToast("\u5DF2\u590D\u5236");
            } catch (_) {
              showToast("\u590D\u5236\u5931\u8D25\uFF0C\u957F\u6309\u6587\u672C\u624B\u52A8\u590D\u5236", true, true);
            }
          }, children: "\u590D\u5236" }),
          /* @__PURE__ */ jsx5("button", { className: "mn-btn ghost sm", onClick: () => setExportText(""), children: "\u6536\u8D77" }),
          /* @__PURE__ */ jsxs4("span", { className: "mn-hint", children: [
            exportText.length,
            " \u5B57\u7B26"
          ] })
        ] }),
        /* @__PURE__ */ jsx5("textarea", { className: "mn-inp", readOnly: true, value: exportText, rows: 10, style: { marginTop: 8, font: "11px/1.6 ui-monospace,Consolas,monospace" }, onFocus: (e) => e.currentTarget.select() })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "mn-sec", children: [
      /* @__PURE__ */ jsx5("i", { className: "mn-bar" }),
      "\u8FB9\u754C\u4E0E\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "mn-card", children: /* @__PURE__ */ jsxs4("div", { className: "mn-card-b mn-sub", children: [
      /* @__PURE__ */ jsxs4("p", { style: { margin: "0 0 6px" }, children: [
        "\xB7 \u5206\u5E26\u4E3A\u901A\u7528\u53C2\u8003\u533A\u95F4\uFF08\u8840\u538B\u5BB6\u5EAD\u81EA\u6D4B\u53E3\u5F84\u3001\u8840\u7CD6\u6307\u5C16\u8840\u65F6\u70B9\u53E3\u5F84\u3001\u4F53\u6E29\u3001\u4E2D\u56FD\u6210\u4EBA BMI\uFF09\uFF0C",
        /* @__PURE__ */ jsx5("b", { children: "\u4EC5\u4F9B\u7559\u610F\uFF0C\u4E0D\u6784\u6210\u533B\u7597\u5EFA\u8BAE" }),
        "\uFF1B\u89E3\u8BFB\u8BF7\u9075\u533B\u5631\u3002"
      ] }),
      /* @__PURE__ */ jsx5("p", { style: { margin: "0 0 6px" }, children: "\xB7 \u6570\u636E\u7EAF\u672C\u5730\u5B58\u50A8\uFF08\u5BBF\u4E3B cap.kv\uFF09\uFF0C\u4E0D\u51FA\u8BBE\u5907\u3001\u65E0\u8D26\u53F7\u3001\u65E0\u4E0A\u4F20\uFF1B\u6362\u8BBE\u5907\u53EF\u7528\u300C\u6570\u636E\u5BFC\u51FA\u300D\u642C\u8FD0\u3002" }),
      /* @__PURE__ */ jsx5("p", { style: { margin: "0 0 6px" }, children: "\xB7 \u6D4B\u91CF\u63D0\u9192\u4EA4\u7ED9\u300C\u65E5\u6677\u300D\u65E5\u7A0B\u63D2\u4EF6\uFF08\u5982\u300C\u6BCF\u5929\u65E9\u4E0A 8 \u70B9\u63D0\u9192\u6211\u5988\u91CF\u8840\u538B\u300D\uFF09\uFF1B\u672C\u63D2\u4EF6\u4E13\u6CE8\u8BB0\u5F55\u3001\u5206\u5E26\u4E0E\u5C0F\u7ED3\u3002" }),
      /* @__PURE__ */ jsx5("p", { style: { margin: 0 }, children: "\xB7 \u5BF9 AI \u76F4\u63A5\u8BF4\u300C\u5988\u5988\u65E9\u4E0A\u8840\u538B 152/95\u300D\u5373\u53EF\u8BB0\u5F55\uFF1B\u8BF4\u300C\u751F\u6210\u5988\u5988\u8FD9\u4E2A\u6708\u7684\u5C31\u8BCA\u5C0F\u7ED3\u300D\u5373\u53EF\u5E26\u8D70\u4E00\u4EFD\u7ED9\u533B\u751F\u3002" })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.mn-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.mn-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mn-body{flex:1;overflow-y:auto;padding:0 0 24px}
.mn-body::-webkit-scrollbar{width:9px;height:9px}
.mn-body::-webkit-scrollbar-track{background:transparent}
.mn-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.mn-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.mn-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.mn-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#F87171,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.mn-tt{flex:1;min-width:0}
.mn-tt b{font-size:15px;display:block}
.mn-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.mn-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.mn-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.mn-dot.off{background:#5C6678}
.mn-tabs{display:flex;gap:4px}
.mn-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.mn-tab:hover{color:#E6EAF2}
.mn-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.mn-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.mn-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.mn-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F87171,#58A6FF);flex-shrink:0}
.mn-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.mn-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.mn-card-b{padding:11px 13px}
.mn-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.mn-btn:hover{filter:brightness(1.1)}
.mn-btn:disabled{opacity:.45;cursor:not-allowed}
.mn-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.mn-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.mn-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.mn-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.mn-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.mn-inp:focus{outline:none;border-color:#2b6cb0}
.mn-inp::placeholder{color:#4d5566}
.mn-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.mn-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.mn-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.mn-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.mn-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.mn-toast.bad{border-color:#54262c;color:#FF8A9A}
.mn-toast-wrap{white-space:normal;max-height:40vh;overflow-y:auto}
.mn-chips{display:flex;flex-wrap:wrap;gap:5px}
.mn-chip{background:#1C2330;border:1px solid #242C3A;border-radius:8px;color:#8B95A7;font-size:11px;padding:4px 10px;cursor:pointer}
.mn-chip.on{background:#16283e;border-color:#2b6cb0;color:#E6EAF2;font-weight:600}
.mn-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.mn-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.mn-tag.urgent{background:#4a0f18;border-color:#8a1c2c;color:#FF5A6E}
.mn-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.mn-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.mn-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.mn-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.mn-row{display:flex;align-items:center;gap:8px;min-width:0}
.mn-grow{flex:1;min-width:0}
.mn-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.mn-modal-bg{position:absolute;inset:0;background:rgba(8,10,14,.72);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.mn-modal{background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:14px;width:100%;max-width:440px;max-height:88%;overflow-y:auto}
.mn-modal h4{margin:0 0 8px;font-size:13.5px}
`;
function MaianPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("record");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const cacheRef = useRef(newCache());
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, bad, wrap) => {
    setToast({ msg, bad, wrap });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), wrap ? 6e3 : 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadMaian(cacheRef.current);
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
  const props = { data, reload, showToast, pluginId, onSendToChat };
  const todayCount = data ? data.records.filter((r) => core6.dayKeyOfTs(r.ts) === core6.dayKey(Date.now())).length : 0;
  const flagCount = data ? countRecentFlags(data) : 0;
  return /* @__PURE__ */ jsxs5("div", { className: "mn-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "mn-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "mn-logo", children: "\u{1F493}" }),
      /* @__PURE__ */ jsxs5("div", { className: "mn-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u8109\u6848 \xB7 \u5BB6\u5EAD\u4F53\u5F81\u53F0\u8D26" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx6("i", { className: `mn-dot ${data ? "ok" : "off"}` }),
          data ? `${data.members.length} \u6210\u5458 \xB7 \u8FD17\u5929\u9EC4\u7EA2 ${flagCount} \u6761` : "\u8F7D\u5165\u4E2D\u2026"
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "mn-tabs", children: [
        ["record", "\u8BB0\u5F55"],
        ["trend", "\u8D8B\u52BF"],
        ["ledger", "\u53F0\u8D26"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `mn-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "record" && todayCount === 0 && data && data.members.length > 0 && /* @__PURE__ */ jsx6("span", { className: "mn-badge", children: "\u8BB0" })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "mn-body", children: /* @__PURE__ */ jsxs5("div", { className: "mn-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "mn-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "record" && /* @__PURE__ */ jsx6(RecordTab, { ...props }),
      tab === "trend" && /* @__PURE__ */ jsx6(TrendTab, { ...props }),
      tab === "ledger" && /* @__PURE__ */ jsx6(LedgerTab, { ...props }),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { ...props }),
      /* @__PURE__ */ jsx6("div", { className: "mn-foot", children: "\u8109\u6848\u662F\u5BB6\u5EAD\u4F53\u5F81\u8BB0\u5F55\u5DE5\u5177\uFF1A\u5206\u5E26\u4E3A\u901A\u7528\u53C2\u8003\u533A\u95F4\uFF0C\u4E0D\u6784\u6210\u533B\u7597\u5EFA\u8BAE\uFF0C\u89E3\u8BFB\u8BF7\u9075\u533B\u5631\u3002\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002\u6D4B\u91CF\u63D0\u9192\u53EF\u4EA4\u7ED9\u300C\u65E5\u6677\u300D\u65E5\u7A0B\u63D2\u4EF6\u3002" })
    ] }) }),
    toast && /* @__PURE__ */ jsx6("div", { className: `mn-toast ${toast.bad ? "bad" : ""} ${toast.wrap ? "mn-toast-wrap" : ""}`, children: toast.msg })
  ] });
}
function countRecentFlags(data) {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1e3;
  const heightOf = (pid) => data.members.find((m) => m.id === pid)?.heightCm;
  return data.records.filter((r) => r.ts >= weekAgo).filter((r) => {
    const lv = core6.bandOf(r.kind, r, heightOf(r.profileId)).level;
    return lv === "yellow" || lv === "red" || lv === "urgent";
  }).length;
}

// src/index.tsx
var src_default = MaianPanel;
export {
  src_default as default
};
