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

// shared/triage-core.js
var require_triage_core = __commonJS({
  "shared/triage-core.js"(exports, module) {
    "use strict";
    var TYPES = ["string", "int", "float", "bool", "duration", "bytes", "date"];
    var OPS = ["exists", "missing", "eq", "ne", "gt", "gte", "lt", "lte", "contains", "matches", "in"];
    var VALUE_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "matches", "in"];
    var UNCLASSIFIED_ID = "__unclassified__";
    var UNCLASSIFIED_NAME = "\u672A\u5206\u7C7B";
    var KNOWN_KEYS = {
      pipeline: ["name", "description", "classes", "extract", "decide", "fallback"],
      classDef: ["id", "name", "anyOf"],
      fieldDef: ["pattern", "group", "type", "required", "default"],
      rule: ["when", "then"],
      when: ["field", "op", "value"],
      then: ["verdict", "severity", "label", "route", "note"]
    };
    function isPlainObject(v) {
      return v !== null && typeof v === "object" && !Array.isArray(v);
    }
    function compilePattern(pattern) {
      if (typeof pattern === "string" && pattern.startsWith("re:")) {
        const source = pattern.slice(3);
        let re;
        try {
          re = new RegExp(source);
        } catch (e) {
          return { error: `\u6B63\u5219\u7F16\u8BD1\u5931\u8D25 /${source}/\uFF1A${e.message}` };
        }
        return { re, kind: "re", source };
      }
      return { kind: "literal", needle: String(pattern).toLowerCase() };
    }
    function matchPattern(compiled, text) {
      if (compiled.kind === "re") {
        const m = compiled.re.exec(text);
        return m ? { hit: true, evidence: m[0] } : { hit: false, evidence: null };
      }
      const idx = text.toLowerCase().indexOf(compiled.needle);
      if (idx === -1) return { hit: false, evidence: null };
      return { hit: true, evidence: text.slice(idx, idx + compiled.needle.length) };
    }
    function fmtPath(parts) {
      return parts.join("");
    }
    function validatePipeline2(p) {
      if (!isPlainObject(p)) return { ok: false, error: "\u6A21\u677F\u987B\u4E3A\u5BF9\u8C61" };
      const warnings = [];
      const unknownTop = Object.keys(p).filter((k) => !KNOWN_KEYS.pipeline.includes(k));
      if (unknownTop.length) warnings.push({ level: "info", msg: `\u6A21\u677F\u5B58\u5728\u672A\u77E5\u9876\u5C42\u952E\uFF08\u53EF\u80FD\u62FC\u5199\u9519\u8BEF\uFF09\uFF1A${unknownTop.join(", ")}\uFF08\u5DF2\u5FFD\u7565\uFF09` });
      if (p.classes !== void 0 && !Array.isArray(p.classes)) return { ok: false, error: "classes \u987B\u4E3A\u6570\u7EC4" };
      const classes = Array.isArray(p.classes) ? p.classes : [];
      const classIds = /* @__PURE__ */ new Set();
      for (let i = 0; i < classes.length; i++) {
        const c = classes[i];
        const at = fmtPath(["classes[", String(i), "]"]);
        if (!isPlainObject(c)) return { ok: false, error: `${at} \u987B\u4E3A\u5BF9\u8C61` };
        if (typeof c.id !== "string" || !c.id.trim()) return { ok: false, error: `${at}.id \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32` };
        if (classIds.has(c.id)) return { ok: false, error: `${at}.id \u91CD\u590D\uFF1A${c.id}` };
        classIds.add(c.id);
        if (!Array.isArray(c.anyOf) || c.anyOf.length === 0) return { ok: false, error: `${at}.anyOf \u987B\u4E3A\u975E\u7A7A\u6A21\u5F0F\u6570\u7EC4` };
        for (let j = 0; j < c.anyOf.length; j++) {
          if (typeof c.anyOf[j] !== "string") return { ok: false, error: `${at}.anyOf[${j}] \u987B\u4E3A\u5B57\u7B26\u4E32` };
          const compiled = compilePattern(c.anyOf[j]);
          if (compiled.error) return { ok: false, error: `${at}.anyOf[${j}] ${compiled.error}` };
        }
      }
      if (p.extract !== void 0) {
        if (!isPlainObject(p.extract)) return { ok: false, error: "extract \u987B\u4E3A\u5BF9\u8C61\uFF08\u952E=\u7C7B\u522B id \u6216 *\uFF09" };
        for (const cid of Object.keys(p.extract)) {
          const at = fmtPath(["extract.", cid]);
          if (cid !== "*" && !classIds.has(cid)) return { ok: false, error: `${at} \u5F15\u7528\u4E86\u672A\u5B9A\u4E49\u7684\u7C7B\u522B id\u300C${cid}\u300D` };
          const fields = p.extract[cid];
          if (!isPlainObject(fields)) return { ok: false, error: `${at} \u987B\u4E3A\u5BF9\u8C61\uFF08\u952E=\u5B57\u6BB5\u540D\uFF09` };
          for (const fname of Object.keys(fields)) {
            const f = fields[fname];
            const fat = fmtPath([at, ".", fname]);
            if (!isPlainObject(f)) return { ok: false, error: `${fat} \u987B\u4E3A\u5BF9\u8C61` };
            if (typeof f.pattern !== "string") return { ok: false, error: `${fat}.pattern \u987B\u4E3A\u5B57\u7B26\u4E32` };
            const compiled = compilePattern(f.pattern);
            if (compiled.error) return { ok: false, error: `${fat}.pattern ${compiled.error}` };
            if (f.group !== void 0) {
              if (typeof f.group === "number") {
                if (!Number.isInteger(f.group) || f.group < 0) return { ok: false, error: `${fat}.group \u987B\u4E3A\u975E\u8D1F\u6574\u6570` };
                if (compiled.kind === "literal") return { ok: false, error: `${fat}.group \u4EC5 re: \u6B63\u5219\u5F62\u6001\u652F\u6301\uFF08\u5B57\u9762\u91CF\u6A21\u5F0F\u65E0\u6355\u83B7\u7EC4\uFF09` };
              } else if (typeof f.group !== "string") {
                return { ok: false, error: `${fat}.group \u987B\u4E3A\u975E\u8D1F\u6574\u6570\u6216\u547D\u540D\u7EC4\u5B57\u7B26\u4E32` };
              }
            }
            if (f.type !== void 0 && !TYPES.includes(f.type)) return { ok: false, error: `${fat}.type \u987B\u4E3A ${TYPES.join("/")}` };
            if (f.required !== void 0 && typeof f.required !== "boolean") return { ok: false, error: `${fat}.required \u987B\u4E3A\u5E03\u5C14` };
          }
        }
      }
      if (p.decide !== void 0) {
        if (!isPlainObject(p.decide)) return { ok: false, error: "decide \u987B\u4E3A\u5BF9\u8C61\uFF08\u952E=\u7C7B\u522B id \u6216 *\uFF09" };
        for (const cid of Object.keys(p.decide)) {
          const at = fmtPath(["decide.", cid]);
          if (cid !== "*" && !classIds.has(cid)) return { ok: false, error: `${at} \u5F15\u7528\u4E86\u672A\u5B9A\u4E49\u7684\u7C7B\u522B id\u300C${cid}\u300D` };
          const rules = p.decide[cid];
          if (!Array.isArray(rules)) return { ok: false, error: `${at} \u987B\u4E3A\u89C4\u5219\u6570\u7EC4` };
          for (let i = 0; i < rules.length; i++) {
            const r = rules[i];
            const rat = fmtPath([at, "[", String(i), "]"]);
            if (!isPlainObject(r)) return { ok: false, error: `${rat} \u987B\u4E3A\u5BF9\u8C61` };
            if (!isPlainObject(r.when)) return { ok: false, error: `${rat}.when \u987B\u4E3A\u5BF9\u8C61 { field, op, value? }` };
            if (typeof r.when.field !== "string" || !r.when.field.trim()) return { ok: false, error: `${rat}.when.field \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32` };
            if (!OPS.includes(r.when.op)) return { ok: false, error: `${rat}.when.op \u987B\u4E3A ${OPS.join("/")}` };
            if (VALUE_OPS.includes(r.when.op) && r.when.value === void 0) return { ok: false, error: `${rat}.when.value \u7F3A\u5931\uFF08\u7B97\u5B50 ${r.when.op} \u9700\u8981 value\uFF09` };
            if (r.when.op === "matches") {
              if (typeof r.when.value !== "string") return { ok: false, error: `${rat}.when.value \u987B\u4E3A\u6B63\u5219\u5B57\u7B26\u4E32\uFF08matches\uFF09` };
              try {
                new RegExp(r.when.value);
              } catch (e) {
                return { ok: false, error: `${rat}.when.value \u6B63\u5219\u7F16\u8BD1\u5931\u8D25\uFF1A${e.message}` };
              }
            }
            if (r.when.op === "in" && !Array.isArray(r.when.value)) return { ok: false, error: `${rat}.when.value \u987B\u4E3A\u6570\u7EC4\uFF08in\uFF09` };
            if (!isPlainObject(r.then)) return { ok: false, error: `${rat}.then \u987B\u4E3A\u5BF9\u8C61` };
            if (typeof r.then.verdict !== "string" || !r.then.verdict.trim()) return { ok: false, error: `${rat}.then.verdict \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32` };
          }
        }
      }
      if (p.fallback !== void 0) {
        if (!isPlainObject(p.fallback)) return { ok: false, error: "fallback \u987B\u4E3A\u5BF9\u8C61 { verdict, ... }" };
        if (typeof p.fallback.verdict !== "string" || !p.fallback.verdict.trim()) return { ok: false, error: "fallback.verdict \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" };
      }
      return { ok: true, warnings };
    }
    function toInt(raw) {
      const s = String(raw).trim();
      if (!/^[+-]?\d+$/.test(s)) return { error: `\u300C${raw}\u300D\u4E0D\u662F\u6574\u6570` };
      const n = Number(s);
      return !Number.isSafeInteger(n) ? { error: `\u300C${raw}\u300D\u8D85\u51FA\u5B89\u5168\u6574\u6570\u8303\u56F4` } : { value: n };
    }
    function toFloat(raw) {
      const s = String(raw).trim();
      if (s === "" || !Number.isFinite(Number(s))) return { error: `\u300C${raw}\u300D\u4E0D\u662F\u6709\u9650\u6570` };
      return { value: Number(s) };
    }
    function toBool(raw) {
      const s = String(raw).trim().toLowerCase();
      if (["true", "yes", "on", "1"].includes(s)) return { value: true };
      if (["false", "no", "off", "0"].includes(s)) return { value: false };
      return { error: `\u300C${raw}\u300D\u4E0D\u662F\u5E03\u5C14\uFF08true/false/yes/no/on/off/1/0\uFF09` };
    }
    var DUR_UNIT_MS = { d: 864e5, h: 36e5, m: 6e4, s: 1e3, ms: 1 };
    function toDuration(raw) {
      const s = String(raw).trim().toLowerCase();
      if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s) };
      const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g;
      let total = 0;
      let m;
      let matched = false;
      let lastEnd = 0;
      while ((m = re.exec(s)) !== null) {
        if (m.index !== lastEnd) return { error: `\u300C${raw}\u300D\u65F6\u957F\u683C\u5F0F\u65E0\u6CD5\u6574\u6BB5\u89E3\u6790\uFF08\u4F4D\u7F6E ${m.index} \u5904\u65AD\u5F00\uFF09` };
        matched = true;
        total += Number(m[1]) * DUR_UNIT_MS[m[2]];
        lastEnd = re.lastIndex;
      }
      if (!matched || lastEnd !== s.length) return { error: `\u300C${raw}\u300D\u65F6\u957F\u683C\u5F0F\u65E0\u6CD5\u6574\u6BB5\u89E3\u6790\uFF08\u5355\u4F4D\uFF1Ad/h/m/s/ms\uFF09` };
      return { value: total };
    }
    var BYTE_UNIT = { b: 1, kb: 1024, kib: 1024, mb: 1024 ** 2, mib: 1024 ** 2, gb: 1024 ** 3, gib: 1024 ** 3, tb: 1024 ** 4, tib: 1024 ** 4 };
    function toBytes(raw) {
      const m = String(raw).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)$/);
      if (!m) {
        if (/^\d+(\.\d+)?$/.test(String(raw).trim())) return { value: Number(String(raw).trim()) };
        return { error: `\u300C${raw}\u300D\u4E0D\u662F\u5B57\u8282\u6570\uFF08\u652F\u6301 B/KB/MB/GB/TB\uFF0C1024 \u8FDB\u5236\uFF09` };
      }
      return { value: Number(m[1]) * BYTE_UNIT[m[2]] };
    }
    function toDate(raw) {
      const s = String(raw).trim();
      let ms;
      let localAssumed = false;
      if (/^\d{4}-\d{2}-\d{2} \d{2}(:\d{2})?(:\d{2})?$/.test(s)) {
        ms = Date.parse(s.replace(" ", "T"));
        localAssumed = true;
      } else {
        ms = Date.parse(s);
      }
      if (Number.isNaN(ms)) return { error: `\u300C${raw}\u300D\u4E0D\u662F\u53EF\u8BC6\u522B\u7684\u65F6\u95F4\uFF08ISO 8601 \u6216 YYYY-MM-DD HH:mm[:ss]\uFF09` };
      return { value: new Date(ms).toISOString(), localAssumed };
    }
    function convertType(raw, type) {
      switch (type) {
        case "int":
          return toInt(raw);
        case "float":
          return toFloat(raw);
        case "bool":
          return toBool(raw);
        case "duration":
          return toDuration(raw);
        case "bytes":
          return toBytes(raw);
        case "date":
          return toDate(raw);
        default:
          return { value: String(raw) };
      }
    }
    function asNumber(v) {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.trim()))) return Number(v.trim());
      return null;
    }
    function evalWhen(when, fields) {
      const has = Object.prototype.hasOwnProperty.call(fields, when.field);
      const v = has ? fields[when.field] : void 0;
      const present = has && v !== null && v !== void 0;
      const op = when.op;
      if (op === "exists") return { matched: present, reason: present ? `\u5B57\u6BB5\u5B58\u5728` : `\u5B57\u6BB5\u4E0D\u5B58\u5728\u6216\u4E3A\u7A7A` };
      if (op === "missing") return { matched: !present, reason: present ? `\u5B57\u6BB5\u5B58\u5728\uFF08\u503C ${JSON.stringify(v)}\uFF09` : `\u5B57\u6BB5\u4E0D\u5B58\u5728\u6216\u4E3A\u7A7A` };
      if (!present) return { matched: false, reason: `\u5B57\u6BB5\u4E0D\u5B58\u5728\u6216\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u6BD4\u8F83` };
      const numField = asNumber(v);
      const numValue = asNumber(when.value);
      switch (op) {
        case "eq":
          if (numField !== null && numValue !== null) return { matched: numField === numValue, reason: `${v} ${numField === numValue ? "=" : "\u2260"} ${when.value}` };
          return { matched: String(v) === String(when.value), reason: `\u5B57\u7B26\u4E32\u6BD4\u8F83 ${JSON.stringify(String(v))} ${String(v) === String(when.value) ? "=" : "\u2260"} ${JSON.stringify(String(when.value))}` };
        case "ne": {
          if (numField !== null && numValue !== null) return { matched: numField !== numValue, reason: `${v} ${numField !== numValue ? "\u2260" : "="} ${when.value}` };
          const ne = String(v) !== String(when.value);
          return { matched: ne, reason: `\u5B57\u7B26\u4E32\u6BD4\u8F83 ${JSON.stringify(String(v))} ${ne ? "\u2260" : "="} ${JSON.stringify(String(when.value))}` };
        }
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
          if (numField === null || numValue === null) return { matched: false, reason: `\u975E\u6570\u503C\u4E0D\u53EF\u6BD4\uFF08\u5B57\u6BB5 ${JSON.stringify(v)}\uFF0C\u9608\u503C ${JSON.stringify(when.value)}\uFF09\u2014\u2014\u672C\u89C4\u5219\u4E0D\u547D\u4E2D` };
          const sym = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
          const cmp = { gt: numField > numValue, gte: numField >= numValue, lt: numField < numValue, lte: numField <= numValue }[op];
          return { matched: cmp, reason: `${numField} ${cmp ? sym : sym + "\xD7"} ${numValue}` };
        }
        case "contains": {
          const hit = String(v).includes(String(when.value));
          return { matched: hit, reason: `${JSON.stringify(String(v))} ${hit ? "\u542B" : "\u4E0D\u542B"} ${JSON.stringify(String(when.value))}` };
        }
        case "matches": {
          let re;
          try {
            re = new RegExp(when.value);
          } catch (e) {
            return { matched: false, reason: `\u9608\u503C\u6B63\u5219\u7F16\u8BD1\u5931\u8D25\uFF08\u6821\u9A8C\u6F0F\u7F51\uFF09\uFF1A${e.message}` };
          }
          const hit = re.test(String(v));
          return { matched: hit, reason: `${JSON.stringify(String(v))} ${hit ? "\u5339\u914D" : "\u4E0D\u5339\u914D"} /${when.value}/` };
        }
        case "in": {
          const hit = Array.isArray(when.value) && when.value.some((x) => asNumber(x) !== null && numField !== null ? asNumber(x) === numField : String(x) === String(v));
          return { matched: hit, reason: `${JSON.stringify(v)} ${hit ? "\u2208" : "\u2209"} [${(when.value || []).map((x) => JSON.stringify(x)).join(", ")}]` };
        }
        default:
          return { matched: false, reason: `\u672A\u77E5\u7B97\u5B50 ${op}` };
      }
    }
    function sanitizeOutcome(o) {
      return {
        verdict: String(o.verdict),
        severity: o.severity === void 0 ? void 0 : String(o.severity),
        label: o.label === void 0 ? void 0 : String(o.label),
        route: o.route === void 0 ? void 0 : String(o.route),
        note: o.note === void 0 ? void 0 : String(o.note)
      };
    }
    function runPipeline2(pipeline, text, opts) {
      const v = validatePipeline2(pipeline);
      if (!v.ok) return { ok: false, error: v.error, warnings: [], trace: [] };
      const warnings = (v.warnings || []).map((w) => ({ ...w }));
      const trace = [];
      const input = typeof text === "string" ? text : String(text == null ? "" : text);
      const classes = Array.isArray(pipeline.classes) ? pipeline.classes : [];
      let hitClass = null;
      let hitPattern = null;
      let evidence = null;
      for (const c of classes) {
        for (const pat of c.anyOf) {
          const compiled = compilePattern(pat);
          const r = matchPattern(compiled, input);
          trace.push({ step: "classify", classId: c.id, pattern: pat, hit: r.hit, evidence: r.evidence });
          if (r.hit && !hitClass) {
            hitClass = c;
            hitPattern = pat;
            evidence = r.evidence;
          }
        }
      }
      const classId = hitClass ? hitClass.id : UNCLASSIFIED_ID;
      const className = hitClass ? hitClass.name || hitClass.id : UNCLASSIFIED_NAME;
      if (!hitClass) warnings.push({ level: "info", msg: "\u672A\u547D\u4E2D\u4EFB\u4F55\u5206\u7C7B\u89C4\u5219\uFF0C\u843D\u5165\u672A\u5206\u7C7B\uFF08\u8D70 fallback\uFF09" });
      const fields = {};
      const fieldMeta = {};
      const extractSpec = isPlainObject(pipeline.extract) ? pipeline.extract : {};
      const fieldOrder = [];
      const layerSpecs = [];
      if (extractSpec["*"]) layerSpecs.push({ from: "*", spec: extractSpec["*"] });
      if (extractSpec[classId]) layerSpecs.push({ from: classId, spec: extractSpec[classId] });
      for (const layer of layerSpecs) {
        for (const fname of Object.keys(layer.spec)) {
          const existing = fieldOrder.find((x) => x.name === fname);
          if (!existing) fieldOrder.push({ name: fname, def: layer.spec[fname], layer: layer.from });
          else {
            existing.def = layer.spec[fname];
            existing.layer = layer.from;
          }
        }
      }
      for (const item of fieldOrder) {
        const fname = item.name;
        const def = item.def;
        const compiled = compilePattern(def.pattern);
        const m = compiled.kind === "re" ? compiled.re.exec(input) : matchPattern(compiled, input);
        let raw = null;
        let hit = false;
        let groupNote = "";
        if (compiled.kind === "literal") {
          if (m && m.hit) {
            raw = m.evidence;
            hit = true;
          }
        } else if (m) {
          hit = true;
          let gi = 1;
          if (def.group !== void 0) gi = def.group;
          else if (m.length > 1) gi = 1;
          else gi = 0;
          if (typeof gi === "number") {
            if (gi >= m.length) {
              hit = false;
              groupNote = `\u6355\u83B7\u7EC4 ${gi} \u4E0D\u5B58\u5728\uFF08\u5171 ${m.length - 1} \u7EC4\uFF09`;
            } else raw = m[gi];
          } else if (m.groups && gi in m.groups) {
            raw = m.groups[gi];
          } else {
            hit = false;
            groupNote = `\u547D\u540D\u7EC4\u300C${gi}\u300D\u4E0D\u5B58\u5728`;
          }
        }
        const meta = { raw: hit ? raw : null, value: null, type: def.type || "string", ok: false, warn: null, layer: item.layer };
        if (hit) {
          const conv = convertType(raw, def.type || "string");
          if (conv.error) {
            meta.warn = conv.error;
            warnings.push({ level: def.required ? "warn" : "info", msg: `\u5B57\u6BB5 ${fname}\uFF1A${conv.error}\uFF08\u6309\u672A\u62BD\u53D6\u5904\u7406\uFF09` });
          } else {
            meta.ok = true;
            meta.value = conv.value;
            if (conv.localAssumed) meta.warn = "\u65F6\u95F4\u65E0\u65F6\u533A\u5B57\u6837\uFF0C\u6309\u672C\u673A\u65F6\u533A\u89E3\u91CA";
          }
        } else {
          meta.warn = groupNote || "\u672A\u5339\u914D\u5230";
          warnings.push({ level: def.required ? "warn" : "info", msg: `\u5B57\u6BB5 ${fname} \u672A\u62BD\u53D6\u5230${def.required ? "\uFF08\u5FC5\u586B\uFF09" : ""}${groupNote ? "\uFF1A" + groupNote : ""}` });
        }
        if (!meta.ok && def.default !== void 0) {
          meta.value = def.default;
          meta.ok = true;
          meta.warn = (meta.warn ? meta.warn + "\uFF1B" : "") + `\u5DF2\u7528 default=${JSON.stringify(def.default)}`;
        }
        fields[fname] = meta.value;
        fieldMeta[fname] = meta;
        trace.push({ step: "extract", field: fname, pattern: def.pattern, ok: meta.ok, raw: meta.raw, value: meta.value, warn: meta.warn });
      }
      const decideSpec = isPlainObject(pipeline.decide) ? pipeline.decide : {};
      const evalList = (list, listName) => {
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          const ev = evalWhen(r.when, fields);
          trace.push({ step: "decide", list: listName, index: i, when: r.when, matched: ev.matched, reason: ev.reason });
          if (ev.matched) return { outcome: sanitizeOutcome(r.then), source: `${listName}[${i}]`, reason: ev.reason };
        }
        return null;
      };
      let decision = null;
      if (Array.isArray(decideSpec[classId]) && decideSpec[classId].length) {
        decision = evalList(decideSpec[classId], `decide.${classId}`);
      }
      if (!decision && Array.isArray(decideSpec["*"]) && decideSpec["*"].length) {
        decision = evalList(decideSpec["*"], "decide.*");
      }
      if (!decision) {
        if (isPlainObject(pipeline.fallback)) {
          decision = { outcome: sanitizeOutcome(pipeline.fallback), source: "fallback", reason: "\u65E0\u51B3\u7B56\u89C4\u5219\u547D\u4E2D\uFF08\u6216\u672A\u5206\u7C7B\uFF09\uFF0C\u8D70\u6A21\u677F fallback" };
        } else {
          decision = {
            outcome: { verdict: classId === UNCLASSIFIED_ID ? "\u672A\u5206\u7C7B" : "\u65E0\u5904\u7F6E\u89C4\u5219\u547D\u4E2D", severity: classId === UNCLASSIFIED_ID ? void 0 : "P3" },
            source: "default",
            reason: classId === UNCLASSIFIED_ID ? "\u672A\u5206\u7C7B\u4E14\u6A21\u677F\u672A\u5B9A\u4E49 fallback" : "\u8BE5\u7C7B\u522B\u65E0\u547D\u4E2D\u89C4\u5219\u4E14\u6A21\u677F\u672A\u5B9A\u4E49 fallback"
          };
        }
        trace.push({ step: "decide", list: decision.source, index: -1, matched: true, reason: decision.reason });
      }
      return {
        ok: true,
        warnings,
        classId,
        className,
        classifyEvidence: evidence,
        classifyPattern: hitClass ? hitPattern : null,
        fields,
        fieldMeta,
        decision: { ...decision.outcome, source: decision.source, reason: decision.reason },
        trace
      };
    }
    function outcomeLine(o) {
      const parts = [`verdict=${o.verdict}`];
      if (o.severity !== void 0) parts.push(`severity=${o.severity}`);
      if (o.label !== void 0) parts.push(`label=${o.label}`);
      if (o.route !== void 0) parts.push(`route=${o.route}`);
      if (o.note !== void 0) parts.push(`note=${o.note}`);
      return parts.join(" ");
    }
    function renderRun(r) {
      if (!r.ok) return `\u6A21\u677F\u975E\u6CD5\uFF1A${r.error}`;
      const lines = [];
      lines.push(`\u5206\u6D41\u7ED3\u679C\uFF1A${r.decision.verdict}${r.decision.severity !== void 0 ? `\uFF08${r.decision.severity}\uFF09` : ""}`);
      lines.push(`\u7C7B\u522B\uFF1A${r.classId}\uFF08${r.className}\uFF09${r.classifyPattern !== null ? `\uFF5C\u547D\u4E2D\u6A21\u5F0F\uFF1A${r.classifyPattern}\uFF5C\u8BC1\u636E\u300C${r.classifyEvidence}\u300D` : ""}`);
      const names = Object.keys(r.fields);
      if (names.length) {
        lines.push("\u5B57\u6BB5\uFF1A");
        for (const n of names) {
          const m = r.fieldMeta[n];
          lines.push(`  ${n} = ${JSON.stringify(r.fields[n])}\uFF08${m.type}${m.ok ? "" : "\uFF0C\u672A\u62BD\u53D6"}${m.warn ? `\uFF1B${m.warn}` : ""}\uFF09`);
        }
      } else {
        lines.push("\u5B57\u6BB5\uFF1A\uFF08\u8BE5\u7C7B\u522B\u65E0\u62BD\u53D6\u5B9A\u4E49\uFF09");
      }
      lines.push(`\u51B3\u7B56\uFF1A${outcomeLine(r.decision)}`);
      lines.push(`  \u547D\u4E2D\uFF1A${r.decision.source} \u2014\u2014 ${r.decision.reason}`);
      if (r.warnings.length) {
        lines.push("\u8B66\u793A\uFF1A");
        for (const w of r.warnings) lines.push(`  ${w.level === "warn" ? "\u26A0" : "\u2139"} ${w.msg}`);
      }
      lines.push(`\u8BC1\u636E\u94FE trace\uFF08${r.trace.length} \u6B65\uFF09\uFF1A`);
      for (const t of r.trace) {
        if (t.step === "classify") lines.push(`  [\u5206\u7C7B] ${t.classId} \u2190 ${t.pattern}\uFF1A${t.hit ? `\u547D\u4E2D\u300C${t.evidence}\u300D` : "\u672A\u547D\u4E2D"}`);
        else if (t.step === "extract") lines.push(`  [\u62BD\u53D6] ${t.field} \u2190 ${t.pattern}\uFF1A${t.ok ? `\u539F\u6587\u300C${t.raw}\u300D\u2192 ${JSON.stringify(t.value)}` : `\u672A\u62BD\u53D6\uFF08${t.warn || ""}\uFF09`}`);
        else if (t.step === "decide") lines.push(`  [\u51B3\u7B56] ${t.list}${t.index >= 0 ? `[${t.index}]` : ""} when(${JSON.stringify(t.when)})\uFF1A${t.matched ? "\u547D\u4E2D" : "\u672A\u547D\u4E2D"}\uFF08${t.reason}\uFF09`);
      }
      return lines.join("\n");
    }
    function describePipeline2(p) {
      const classes = Array.isArray(p.classes) ? p.classes : [];
      const classCount = classes.length;
      const extractKeys = isPlainObject(p.extract) ? Object.keys(p.extract) : [];
      const decideKeys = isPlainObject(p.decide) ? Object.keys(p.decide) : [];
      const fieldCount = new Set(extractKeys.flatMap((k) => Object.keys(isPlainObject(p.extract[k]) ? p.extract[k] : {}))).size;
      const ruleCount = decideKeys.reduce((acc, k) => acc + (Array.isArray(p.decide[k]) ? p.decide[k].length : 0), 0);
      return `\u7C7B\u522B ${classCount} \u4E2A\uFF08${classes.map((c) => c.id).join("/") || "\u65E0"}\uFF09\uFF5C\u5B57\u6BB5 ${fieldCount} \u4E2A\uFF5C\u51B3\u7B56\u89C4\u5219 ${ruleCount} \u6761`;
    }
    module.exports = {
      TYPES,
      OPS,
      UNCLASSIFIED_ID,
      validatePipeline: validatePipeline2,
      runPipeline: runPipeline2,
      renderRun,
      describePipeline: describePipeline2
    };
  }
});

// shared/presets.js
var require_presets = __commonJS({
  "shared/presets.js"(exports, module) {
    "use strict";
    var BUILTIN_PIPELINES2 = [
      {
        name: "log-triage",
        description: "\u65E5\u5FD7\u884C\u5206\u7EA7\u5206\u6D41\uFF1A\u6309\u7EA7\u522B\u5173\u952E\u8BCD\u5206\u7C7B\uFF0C\u62BD\u51FA\u7EA7\u522B/\u65F6\u95F4/\u7EC4\u4EF6/\u6D88\u606F\uFF0C\u6309\u7EA7\u522B\u7ED9\u51FA\u5904\u7F6E\u7ED3\u8BBA",
        pipeline: {
          name: "log-triage",
          description: "\u65E5\u5FD7\u884C\u5206\u7EA7\u5206\u6D41\uFF08FATAL/Error/WARN/Info\uFF09",
          classes: [
            { id: "fatal", name: "\u81F4\u547D\u9519\u8BEF", anyOf: ["re:\\bFATAL\\b", "fatal error", "\u8FDB\u7A0B\u5D29\u6E83", "panic"] },
            { id: "error", name: "\u9519\u8BEF", anyOf: ["re:\\bERROR\\b", "re:\\bError\\b", "re:\\bERR\\b", "\u5F02\u5E38", "\u5931\u8D25"] },
            { id: "warn", name: "\u8B66\u544A", anyOf: ["re:\\bWARN(ING)?\\b", "re:\\bWRN\\b", "\u544A\u8B66", "\u91CD\u8BD5"] },
            { id: "info", name: "\u4FE1\u606F", anyOf: ["re:\\bINFO\\b", "re:\\bDEBUG\\b", "re:\\bTRACE\\b"] }
          ],
          extract: {
            "*": {
              ts: { pattern: "re:(\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)", type: "date", required: false },
              component: { pattern: "re:\\[([\\w.-]+)\\]", type: "string", required: false },
              message: { pattern: "re:(?:ERROR|WARN|INFO|FATAL|DEBUG)\\s+.*?[-\u2013:]\\s+(.+)$", type: "string", required: false }
            }
          },
          decide: {
            fatal: [{ when: { field: "component", op: "exists" }, then: { verdict: "\u7ACB\u5373\u5904\u7406", severity: "P0", label: "\u81F4\u547D", route: "oncall", note: "\u81F4\u547D\u9519\u8BEF\u987B\u7ACB\u5373\u4EBA\u5DE5\u4ECB\u5165" } }, { when: { field: "message", op: "exists" }, then: { verdict: "\u7ACB\u5373\u5904\u7406", severity: "P0", label: "\u81F4\u547D", route: "oncall" } }],
            error: [{ when: { field: "component", op: "exists" }, then: { verdict: "\u5C3D\u5FEB\u5904\u7406", severity: "P1", label: "\u9519\u8BEF", route: "issue" } }, { when: { field: "message", op: "exists" }, then: { verdict: "\u5C3D\u5FEB\u5904\u7406", severity: "P1", label: "\u9519\u8BEF", route: "issue" } }],
            warn: [{ when: { field: "message", op: "exists" }, then: { verdict: "\u89C2\u5BDF", severity: "P2", label: "\u8B66\u544A", route: "backlog" } }, { when: { field: "component", op: "exists" }, then: { verdict: "\u89C2\u5BDF", severity: "P2", label: "\u8B66\u544A", route: "backlog" } }],
            info: [{ when: { field: "message", op: "exists" }, then: { verdict: "\u65E0\u9700\u5904\u7406", severity: "P3", label: "\u4FE1\u606F" } }]
          },
          fallback: { verdict: "\u672A\u5206\u7C7B\u65E5\u5FD7", severity: "P3", note: "\u53EF\u6309\u9700\u6269\u5145 classes \u5173\u952E\u8BCD" }
        }
      },
      {
        name: "latency-triage",
        description: "\u5EF6\u8FDF\u544A\u8B66\u5206\u6D41\uFF1A\u62BD\u51FA\u8017\u65F6/\u7AEF\u70B9\uFF0C\u6309\u9608\u503C\u5206\u7EA7\uFF08\u22655s P0 / \u22651s P1 / \u2265500ms P2 / \u5176\u4F59\u6B63\u5E38\uFF09",
        pipeline: {
          name: "latency-triage",
          description: "\u63A5\u53E3\u5EF6\u8FDF\u544A\u8B66\u6309\u8017\u65F6\u9608\u503C\u5206\u7EA7",
          classes: [
            { id: "latency", name: "\u5EF6\u8FDF\u62A5\u544A", anyOf: ["re:\\d+(?:\\.\\d+)?\\s*ms", "\u8017\u65F6", "latency", "timeout", "\u8D85\u65F6", "slow"] }
          ],
          extract: {
            latency: {
              duration: { pattern: "re:(\\d+(?:\\.\\d+)?)\\s*(?:ms|\u6BEB\u79D2)", type: "duration", required: true },
              endpoint: { pattern: "re:(GET|POST|PUT|DELETE|PATCH)\\s+(\\S+)", group: 2, type: "string", required: false },
              status: { pattern: "re:\\bstatus[=:\\s]+(\\d{3})\\b", group: 1, type: "int", required: false }
            }
          },
          decide: {
            latency: [
              { when: { field: "duration", op: "gte", value: 5e3 }, then: { verdict: "\u7ACB\u5373\u964D\u7EA7/\u6269\u5BB9", severity: "P0", label: "\u4E25\u91CD\u5EF6\u8FDF", route: "oncall" } },
              { when: { field: "duration", op: "gte", value: 1e3 }, then: { verdict: "\u5C3D\u5FEB\u6392\u67E5", severity: "P1", label: "\u9AD8\u5EF6\u8FDF", route: "issue" } },
              { when: { field: "duration", op: "gte", value: 500 }, then: { verdict: "\u89C2\u5BDF", severity: "P2", label: "\u4E2D\u5EF6\u8FDF", route: "backlog" } },
              { when: { field: "duration", op: "exists" }, then: { verdict: "\u6B63\u5E38\u8303\u56F4", severity: "P3", label: "\u4F4E\u5EF6\u8FDF" } }
            ]
          },
          fallback: { verdict: "\u672A\u8BC6\u522B\u5EF6\u8FDF\u4FE1\u606F", severity: "P3" }
        }
      },
      {
        name: "disk-triage",
        description: "\u78C1\u76D8\u6C34\u4F4D\u5206\u6D41\uFF1A\u62BD\u51FA\u4F7F\u7528\u7387\u767E\u5206\u6BD4\u4E0E\u6302\u8F7D\u70B9\uFF0C\u6309\u6C34\u4F4D\u5206\u7EA7\uFF08\u226595% \u7ACB\u5373\u6269\u5BB9 / \u226585% \u5C3D\u5FEB\u6E05\u7406 / \u226570% \u89C2\u5BDF\uFF09",
        pipeline: {
          name: "disk-triage",
          description: "\u78C1\u76D8\u4F7F\u7528\u7387\u544A\u8B66\u6309\u6C34\u4F4D\u5206\u7EA7",
          classes: [
            { id: "disk", name: "\u78C1\u76D8\u62A5\u544A", anyOf: ["re:\u4F7F\u7528\u7387", "re:disk", "re:/dev/", "re:\u78C1\u76D8", "usage"] }
          ],
          extract: {
            disk: {
              percent: { pattern: "re:(\\d+(?:\\.\\d+)?)\\s*%", group: 1, type: "float", required: true },
              device: { pattern: "re:(/dev/[\\w]+|\\b[A-Z]:\\\\)", type: "string", required: false },
              free: { pattern: "re:(\\d+(?:\\.\\d+)?)\\s*(?:GB|GiB|MB|MiB)\\s*(?:\u53EF\u7528|\u5269\u4F59|free)", type: "float", required: false }
            }
          },
          decide: {
            disk: [
              { when: { field: "percent", op: "gte", value: 95 }, then: { verdict: "\u7ACB\u5373\u6269\u5BB9/\u6E05\u7406", severity: "P0", label: "\u78C1\u76D8\u5C06\u6EE1", route: "oncall" } },
              { when: { field: "percent", op: "gte", value: 85 }, then: { verdict: "\u5C3D\u5FEB\u6E05\u7406", severity: "P1", label: "\u78C1\u76D8\u9AD8\u6C34\u4F4D", route: "issue" } },
              { when: { field: "percent", op: "gte", value: 70 }, then: { verdict: "\u89C2\u5BDF", severity: "P2", label: "\u78C1\u76D8\u4E2D\u6C34\u4F4D", route: "backlog" } },
              { when: { field: "percent", op: "exists" }, then: { verdict: "\u6C34\u4F4D\u6B63\u5E38", severity: "P3", label: "\u4F4E\u6C34\u4F4D" } }
            ]
          },
          fallback: { verdict: "\u672A\u8BC6\u522B\u78C1\u76D8\u4FE1\u606F", severity: "P3" }
        }
      }
    ];
    module.exports = { BUILTIN_PIPELINES: BUILTIN_PIPELINES2 };
  }
});

// src/Panel.tsx
var core = __toESM(require_triage_core());
var import_presets = __toESM(require_presets());
import { useCallback, useEffect, useState } from "react";

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

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var INDEX_KEY = "text-triage:index";
var PIPE_PREFIX = "text-triage:pipe:";
var CSS = `
.tt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tt-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tt-head b{font-size:13px}
.tt-head .sub{color:#5C6678;font-size:11px}
.tt-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.tt-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tt-btn{width:auto;padding:6px 14px;cursor:pointer;background:#1a2030;color:#E6EAF2;border:1px solid #2b3348;border-radius:8px;font-size:12px}
.tt-btn:hover{border-color:#4fd1a0}
.tt-btn.primary{border-color:#4fd1a0;color:#4fd1a0}
.tt-btn.danger{color:#f1a0a0;padding:3px 7px}
.tt-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.tt-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.tt-name{width:180px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;outline:none}
.tt-name:focus{border-color:#4fd1a0}
.tt-area{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none;box-sizing:border-box}
.tt-area:focus{border-color:#4fd1a0}
.tt-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0;white-space:pre-wrap}
.tt-ok{border-radius:8px;padding:8px 13px;font-size:12px;border:1px solid #2e5e4e;background:#12241d;color:#4fd1a0}
.tt-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.tt-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.tt-verdict{padding:12px 14px;font-size:15px;font-weight:600;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.tt-verdict .sev{font-size:11px;padding:2px 8px;border-radius:10px;border:1px solid}
.tt-p0{color:#f1a0a0;border-color:#e03131}.tt-p1{color:#f3b377;border-color:#9a6b2f}
.tt-p2{color:#e7d06a;border-color:#8a7a2f}.tt-p3{color:#8B94A9;border-color:#3a4358}
.tt-verdict .meta{font-size:11px;color:#5C6678;font-weight:400}
.tt-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.tt-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.tt-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.tt-tbl .miss{color:#f1a0a0}
.tt-line{padding:6px 12px;font-size:12px;color:#c9cede}
.tt-line .k{color:#8B94A9}
.tt-warnitem{padding:4px 12px;font-size:11.5px;color:#f3b377}
.tt-infoitem{padding:4px 12px;font-size:11.5px;color:#8B94A9}
.tt-trace{padding:6px 12px;font:11px/1.8 ui-monospace,Consolas,monospace;color:#8B94A9;white-space:pre-wrap}
.tt-note{color:#5C6678;font-size:11px}
details.tt-fold summary{cursor:pointer;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;background:#1a2030;outline:none}
`;
var SEV_CLASS = { P0: "tt-p0", P1: "tt-p1", P2: "tt-p2", P3: "tt-p3" };
function TextTriagePanel(_props) {
  const [pipelineJson, setPipelineJson] = useState(() => JSON.stringify(import_presets.BUILTIN_PIPELINES[0].pipeline, null, 2));
  const [pipeName, setPipeName] = useState("log-triage");
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedList, setSavedList] = useState([]);
  const [kvDown, setKvDown] = useState("");
  const refreshList = useCallback(async () => {
    try {
      const index = await kvGet(INDEX_KEY);
      const names = Array.isArray(index) ? index : [];
      setSavedList(names.map((n) => ({ name: n, from: "saved" })));
      setKvDown("");
    } catch (e) {
      setKvDown(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refreshList();
  }, [refreshList]);
  function runNow() {
    setNotice("");
    const submitted = text;
    setSubmittedText(submitted);
    try {
      const pipeline = JSON.parse(pipelineJson);
      const r = core.runPipeline(pipeline, submitted);
      if (!r.ok) {
        setError(r.error || "\u6A21\u677F\u975E\u6CD5");
        setResult(null);
        return;
      }
      setError("");
      setResult(r);
    } catch (e) {
      setError(`\u6A21\u677F JSON \u89E3\u6790\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
      setResult(null);
    }
  }
  function validateNow() {
    setNotice("");
    try {
      const pipeline = JSON.parse(pipelineJson);
      const v = core.validatePipeline(pipeline);
      if (!v.ok) {
        setError(`\u6A21\u677F\u975E\u6CD5\uFF1A${v.error}`);
        return;
      }
      setError("");
      const info = core.describePipeline(pipeline);
      const warns = (v.warnings || []).map((w) => `\u2139 ${w.msg}`).join("\n");
      setNotice(`\u6A21\u677F\u5408\u6CD5\uFF1A${info}${warns ? `
${warns}` : ""}`);
    } catch (e) {
      setError(`\u6A21\u677F JSON \u89E3\u6790\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function saveNow() {
    setNotice("");
    setError("");
    try {
      const pipeline = JSON.parse(pipelineJson);
      const v = core.validatePipeline(pipeline);
      if (!v.ok) {
        setError(`\u6A21\u677F\u975E\u6CD5\uFF1A${v.error}`);
        return;
      }
      const name = pipeName.trim();
      await kvSet(PIPE_PREFIX + name, pipeline);
      const index = await kvGet(INDEX_KEY);
      const next = Array.isArray(index) ? index.filter((x) => x !== name) : [];
      next.push(name);
      await kvSet(INDEX_KEY, next);
      setNotice(`\u5DF2\u4FDD\u5B58\u300C${name}\u300D\u5230\u5BBF\u4E3B kv`);
      await refreshList();
    } catch (e) {
      setError(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function loadSaved(name) {
    setNotice("");
    setError("");
    try {
      const p = await kvGet(PIPE_PREFIX + name);
      if (!p) {
        setError(`\u6A21\u677F\u300C${name}\u300D\u6570\u636E\u7F3A\u5931\uFF08\u7D22\u5F15\u60AC\u7A7A\uFF09`);
        return;
      }
      setPipelineJson(JSON.stringify(p, null, 2));
      setPipeName(name);
    } catch (e) {
      setError(`\u8BFB\u53D6\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function deleteSaved(name) {
    setNotice("");
    setError("");
    try {
      await kvDel(PIPE_PREFIX + name);
      const index = await kvGet(INDEX_KEY);
      const next = (Array.isArray(index) ? index : []).filter((x) => x !== name);
      await kvSet(INDEX_KEY, next);
      setNotice(`\u5DF2\u5220\u9664\u300C${name}\u300D`);
      await refreshList();
    } catch (e) {
      setError(`\u5220\u9664\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  }
  function loadBuiltin(name) {
    const b = import_presets.BUILTIN_PIPELINES.find((x) => x.name === name);
    if (!b) return;
    setPipelineJson(JSON.stringify(b.pipeline, null, 2));
    setPipeName(b.name);
    setNotice(`\u5DF2\u8F7D\u5165\u5185\u7F6E\u9884\u8BBE\u300C${b.name}\u300D\uFF1A${b.description}`);
  }
  const okResult = result && result.ok ? result : null;
  const sev = okResult ? okResult.decision.severity : void 0;
  function traceLine(t, i) {
    if (t.step === "classify") {
      return `[${i}] \u5206\u7C7B ${t.classId} \u2190 ${t.pattern}\uFF1A${t.hit ? `\u547D\u4E2D\u300C${t.evidence}\u300D` : "\u672A\u547D\u4E2D"}`;
    }
    if (t.step === "extract") {
      return `[${i}] \u62BD\u53D6 ${t.field} \u2190 ${t.pattern}\uFF1A${t.ok ? `\u300C${String(t.raw)}\u300D\u2192 ${JSON.stringify(t.value)}` : `\u672A\u62BD\u53D6\uFF08${t.warn || ""}\uFF09`}`;
    }
    return `[${i}] \u51B3\u7B56 ${t.list}${typeof t.index === "number" && t.index >= 0 ? `[${t.index}]` : ""} ${JSON.stringify(t.when)}\uFF1A${t.matched ? "\u547D\u4E2D" : "\u672A\u547D\u4E2D"}\uFF08${t.reason}\uFF09`;
  }
  return /* @__PURE__ */ jsxs("div", { className: "tt-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "tt-head", children: [
      /* @__PURE__ */ jsx("b", { children: "\u6587\u672C\u5206\u6D41\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u5206\u7C7B \xB7 \u62BD\u53D6 \xB7 \u51B3\u7B56 \xB7 \u8BC1\u636E\u94FE \xB7 \u6A21\u677F\u5B58\u5BBF\u4E3B kv" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tt-body", children: [
      kvDown && /* @__PURE__ */ jsxs("div", { className: "tt-err", children: [
        "\u5BBF\u4E3B kv \u4E0D\u53EF\u8FBE\uFF1A",
        kvDown,
        "\uFF08\u8FD0\u884C/\u6821\u9A8C\u4E0D\u4F9D\u8D56\u6301\u4E45\u5316\uFF0C\u4ECD\u53EF\u7528\uFF09"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tt-row", children: [
        /* @__PURE__ */ jsx("span", { className: "tt-note", children: "\u5185\u7F6E\u9884\u8BBE\uFF1A" }),
        import_presets.BUILTIN_PIPELINES.map((b) => /* @__PURE__ */ jsx("button", { className: "tt-chip", onClick: () => loadBuiltin(b.name), title: b.description, children: b.name }, b.name))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tt-row", children: [
        /* @__PURE__ */ jsx("input", { className: "tt-name", placeholder: "\u6A21\u677F\u540D\uFF08\u4FDD\u5B58\u7528\uFF09", value: pipeName, onChange: (e) => setPipeName(e.target.value) }),
        /* @__PURE__ */ jsx("button", { className: "tt-btn", onClick: validateNow, children: "\u6821\u9A8C" }),
        /* @__PURE__ */ jsx("button", { className: "tt-btn primary", onClick: () => void saveNow(), children: "\u4FDD\u5B58\u5230 kv" }),
        /* @__PURE__ */ jsx("button", { className: "tt-btn", onClick: () => void refreshList(), children: "\u5237\u65B0\u5217\u8868" })
      ] }),
      savedList.length > 0 && /* @__PURE__ */ jsxs("div", { className: "tt-row", children: [
        /* @__PURE__ */ jsx("span", { className: "tt-note", children: "\u5DF2\u4FDD\u5B58\uFF1A" }),
        savedList.map((s) => /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", gap: 2 }, children: [
          /* @__PURE__ */ jsx("button", { className: "tt-chip", onClick: () => void loadSaved(s.name), children: s.name }),
          /* @__PURE__ */ jsx("button", { className: "tt-chip tt-btn danger", title: "\u5220\u9664", onClick: () => void deleteSaved(s.name), children: "\xD7" })
        ] }, s.name))
      ] }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "tt-area",
          rows: 10,
          spellCheck: false,
          placeholder: '\u5206\u6D41\u6A21\u677F JSON\uFF1A{"classes":[{"id":"error","anyOf":["ERROR"]}],...}\uFF08\u7528\u4E0A\u65B9\u9884\u8BBE\u8F7D\u5165\u8D77\u6B65\uFF09',
          value: pipelineJson,
          onChange: (e) => setPipelineJson(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "tt-area",
          rows: 6,
          spellCheck: false,
          placeholder: "\u7C98\u8D34\u5F85\u5206\u6D41\u6587\u672C\uFF08\u65E5\u5FD7\u884C / \u544A\u8B66 / \u9519\u8BEF\u62A5\u544A\uFF09\u2026\u2026",
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runNow();
          }
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "tt-row", children: [
        /* @__PURE__ */ jsx("button", { className: "tt-btn primary", onClick: runNow, children: "\u8FD0\u884C\u5206\u6D41\uFF08Ctrl+Enter\uFF09" }),
        submittedText && /* @__PURE__ */ jsxs("span", { className: "tt-note", children: [
          "\u5DF2\u8FD0\u884C ",
          submittedText.length,
          " \u5B57\u7B26"
        ] })
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "tt-err", children: error }),
      notice && /* @__PURE__ */ jsx("div", { className: "tt-ok", style: { whiteSpace: "pre-wrap" }, children: notice }),
      okResult && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
          /* @__PURE__ */ jsxs("div", { className: `tt-verdict ${sev ? SEV_CLASS[sev] || "tt-p3" : "tt-p3"}`, children: [
            /* @__PURE__ */ jsx("span", { children: okResult.decision.verdict }),
            sev && /* @__PURE__ */ jsx("span", { className: `sev ${SEV_CLASS[sev] || "tt-p3"}`, children: sev }),
            okResult.decision.route && /* @__PURE__ */ jsxs("span", { className: "meta", children: [
              "route: ",
              okResult.decision.route
            ] }),
            okResult.decision.label && /* @__PURE__ */ jsxs("span", { className: "meta", children: [
              "label: ",
              okResult.decision.label
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "tt-line", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "\u7C7B\u522B\uFF1A" }),
            okResult.classId,
            "\uFF08",
            okResult.className,
            "\uFF09",
            okResult.classifyPattern !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
              "\uFF5C\u547D\u4E2D ",
              okResult.classifyPattern,
              "\uFF5C\u8BC1\u636E\u300C",
              okResult.classifyEvidence,
              "\u300D"
            ] })
          ] }),
          okResult.decision.note && /* @__PURE__ */ jsxs("div", { className: "tt-line", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "\u5907\u6CE8\uFF1A" }),
            okResult.decision.note
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "tt-line", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "\u51B3\u7B56\u4F9D\u636E\uFF1A" }),
            okResult.decision.source,
            " \u2014\u2014 ",
            okResult.decision.reason
          ] })
        ] }),
        Object.keys(okResult.fields).length > 0 && /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u62BD\u53D6\u5B57\u6BB5" }),
          /* @__PURE__ */ jsxs("table", { className: "tt-tbl", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "\u5B57\u6BB5" }),
              /* @__PURE__ */ jsx("th", { children: "\u503C" }),
              /* @__PURE__ */ jsx("th", { children: "\u7C7B\u578B" }),
              /* @__PURE__ */ jsx("th", { children: "\u539F\u6587" }),
              /* @__PURE__ */ jsx("th", { children: "\u72B6\u6001" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: Object.keys(okResult.fields).map((n) => {
              const m = okResult.fieldMeta[n];
              return /* @__PURE__ */ jsxs("tr", { children: [
                /* @__PURE__ */ jsx("td", { children: n }),
                /* @__PURE__ */ jsx("td", { className: m.ok ? "" : "miss", children: JSON.stringify(okResult.fields[n]) }),
                /* @__PURE__ */ jsx("td", { children: m.type }),
                /* @__PURE__ */ jsx("td", { children: m.raw === null || m.raw === void 0 ? "\u2014" : String(m.raw) }),
                /* @__PURE__ */ jsx("td", { className: m.ok ? "" : "miss", children: m.ok ? "\u2713" : `\u2717 ${m.warn || ""}` })
              ] }, n);
            }) })
          ] })
        ] }),
        okResult.warnings.length > 0 && /* @__PURE__ */ jsxs("div", { className: "tt-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u8B66\u793A" }),
          okResult.warnings.map((w, i) => /* @__PURE__ */ jsxs("div", { className: w.level === "warn" ? "tt-warnitem" : "tt-infoitem", children: [
            w.level === "warn" ? "\u26A0" : "\u2139",
            " ",
            w.msg
          ] }, i))
        ] }),
        /* @__PURE__ */ jsxs("details", { className: "tt-fold tt-card", children: [
          /* @__PURE__ */ jsxs("summary", { children: [
            "\u8BC1\u636E\u94FE trace\uFF08",
            okResult.trace.length,
            " \u6B65\uFF09"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "tt-trace", children: okResult.trace.map((t, i) => traceLine(t, i)).join("\n") })
        ] })
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function TextTriageEntry(props) {
  return /* @__PURE__ */ jsx2(TextTriagePanel, { ...props });
}
export {
  TextTriageEntry as default
};
