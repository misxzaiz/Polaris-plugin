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

// shared/csv-core.js
var require_csv_core = __commonJS({
  "shared/csv-core.js"(exports, module) {
    "use strict";
    var DEFAULT_DELIMITER = ",";
    function detectDelimiter2(text) {
      const candidates = [",", ";", "	", "|"];
      const counts = { ",": 0, ";": 0, "	": 0, "|": 0 };
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            if (text[i + 1] === '"') i++;
            else inQuotes = false;
          }
          continue;
        }
        if (ch === '"') {
          inQuotes = true;
          continue;
        }
        if (counts[ch] !== void 0) counts[ch]++;
      }
      let best = null, bestCount = 0;
      for (const c of candidates) {
        if (counts[c] > bestCount) {
          best = c;
          bestCount = counts[c];
        }
      }
      return { counts, detected: best || DEFAULT_DELIMITER };
    }
    function parseCsv2(text, opts) {
      if (typeof text !== "string" || text.length === 0) {
        return {
          ok: false,
          error: "\u8F93\u5165\u4E3A\u7A7A",
          rows: [],
          header: [],
          issues: [],
          stats: { dataRows: 0, cols: 0, quotedFields: null, emptyLines: 0, hadBom: false, lineEndings: { crlf: 0, lf: 0, cr: 0 }, totalLines: 0 },
          delimiter: opts && opts.delimiter || DEFAULT_DELIMITER,
          hasError: false
        };
      }
      const delimiter = opts && opts.delimiter || DEFAULT_DELIMITER;
      const delimChar = delimiter.length === 1 ? delimiter : ",";
      const issues = [];
      const lineEndings = { crlf: 0, lf: 0, cr: 0 };
      let hadBom = false;
      let src = text;
      if (src.charCodeAt(0) === 65279) {
        hadBom = true;
        src = src.slice(1);
      }
      const rows = [];
      let row = [];
      let field = "";
      let inQuotes = false;
      let fieldQuoted = false;
      let afterQuoted = false;
      let fieldStartLine = 1;
      let curLine = 1;
      const pushField = () => {
        row.push(field);
        field = "";
        fieldQuoted = false;
        afterQuoted = false;
      };
      const pushRow = () => {
        pushField();
        if (row.length === 1 && row[0] === "" && !fieldQuoted) {
          issues.push({ severity: "info", type: "empty-line", line: curLine, message: `\u7B2C ${curLine} \u884C\u662F\u7A7A\u884C\uFF0C\u5DF2\u8DF3\u8FC7` });
        } else {
          rows.push(row);
        }
        row = [];
      };
      const n = src.length;
      let i = 0;
      while (i < n) {
        const ch = src[i];
        if (inQuotes) {
          if (ch === '"') {
            if (src[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            inQuotes = false;
            afterQuoted = true;
            i++;
            continue;
          }
          if (ch === "\n") {
            curLine++;
            lineEndings.lf++;
            field += ch;
            i++;
            continue;
          }
          if (ch === "\r") {
            field += ch;
            i++;
            continue;
          }
          field += ch;
          i++;
          continue;
        }
        if (ch === '"') {
          if (afterQuoted) {
            issues.push({
              severity: "error",
              type: "trailing-after-quote",
              line: curLine,
              field: row.length,
              message: `\u7B2C ${curLine} \u884C\u7B2C ${row.length + 1} \u4E2A\u5B57\u6BB5\uFF1A\u5F15\u53F7\u95ED\u5408\u540E\u53C8\u51FA\u73B0\u5B57\u7B26\u300C"\u300D\uFF08RFC 4180 \u4E0D\u5141\u8BB8\uFF1B\u8FD9\u91CC\u4FDD\u7559\u539F\u5B57\u7B26\u5E76\u62A5\u544A\uFF09`
            });
            field += '"';
            afterQuoted = false;
            i++;
            continue;
          }
          if (field === "" && !fieldQuoted) {
            inQuotes = true;
            fieldQuoted = true;
            i++;
            continue;
          }
          issues.push({
            severity: "error",
            type: "bare-quote",
            line: curLine,
            field: row.length,
            message: `\u7B2C ${curLine} \u884C\u7B2C ${row.length + 1} \u4E2A\u5B57\u6BB5\uFF1A\u672A\u52A0\u5F15\u53F7\u7684\u5B57\u6BB5\u5185\u51FA\u73B0\u300C"\u300D\uFF08\u5E94\u6210\u5BF9\u8F6C\u4E49\u6216\u6574\u5B57\u6BB5\u52A0\u5F15\u53F7\uFF09`
          });
          field += '"';
          i++;
          continue;
        }
        if (afterQuoted && ch !== delimChar && ch !== "\r" && ch !== "\n") {
          issues.push({
            severity: "error",
            type: "trailing-after-quote",
            line: curLine,
            field: row.length,
            message: `\u7B2C ${curLine} \u884C\u7B2C ${row.length + 1} \u4E2A\u5B57\u6BB5\uFF1A\u5F15\u53F7\u95ED\u5408\u540E\u53C8\u51FA\u73B0\u5B57\u7B26\u300C${ch}\u300D\uFF08RFC 4180 \u4E0D\u5141\u8BB8\uFF1B\u8FD9\u91CC\u4FDD\u7559\u539F\u5B57\u7B26\u5E76\u62A5\u544A\uFF09`
          });
          afterQuoted = false;
        }
        if (ch === delimChar) {
          pushField();
          i++;
          continue;
        }
        if (ch === "\r") {
          if (src[i + 1] === "\n") {
            lineEndings.crlf++;
            i += 2;
          } else {
            lineEndings.cr++;
            i++;
          }
          curLine++;
          pushRow();
          continue;
        }
        if (ch === "\n") {
          lineEndings.lf++;
          curLine++;
          pushRow();
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (inQuotes) {
        issues.push({
          severity: "error",
          type: "unterminated-quote",
          line: fieldStartLine,
          field: row.length,
          message: `\u7B2C ${fieldStartLine} \u884C\uFF1A\u5F15\u53F7\u5B57\u6BB5\u672A\u95ED\u5408\uFF0C\u6587\u4EF6\u5728\u5F15\u53F7\u5185\u7ED3\u675F`
        });
      }
      const trailingNoNewline = row.length > 0 || field !== "";
      if (trailingNoNewline) pushRow();
      if (trailingNoNewline && n > 0) {
        issues.push({ severity: "info", type: "no-trailing-newline", line: curLine, message: `\u672B\u884C\u65E0\u6362\u884C\u7B26\uFF08EOF \u76F4\u63A5\u7ED3\u675F\uFF09\u2014\u2014\u5408\u6CD5\u4F46\u8DE8\u5DE5\u5177\u6613\u8E29` });
      }
      if (hadBom) issues.push({ severity: "info", type: "bom", line: 1, message: "\u68C0\u6D4B\u5230 UTF-8 BOM\uFF08\u5DF2\u5265\u79BB\u89E3\u6790\uFF1BExcel \u5BFC\u51FA\u5E38\u89C1\uFF0C\u90E8\u5206\u89E3\u6790\u5668\u4F1A\u628A BOM \u6DF7\u8FDB\u9996\u5217\u8868\u5934\uFF09" });
      const neTotal = lineEndings.crlf + lineEndings.lf + lineEndings.cr;
      if (lineEndings.crlf > 0 && lineEndings.lf > 0) {
        issues.push({ severity: "warn", type: "mixed-line-endings", line: 0, message: `\u6362\u884C\u98CE\u683C\u6DF7\u6742\uFF1ACRLF\xD7${lineEndings.crlf} \u4E0E\u88F8 LF\xD7${lineEndings.lf}\uFF08\u884C\u53F7\u7EDF\u8BA1\u53EF\u80FD\u6F02\u79FB\uFF09` });
      }
      const header = rows.length > 0 ? rows[0] : [];
      const headerLen = header.length;
      rows.forEach((r, idx) => {
        if (idx > 0 && r.length !== headerLen) {
          issues.push({
            severity: "error",
            type: "ragged-row",
            line: idx + 1,
            message: `\u6570\u636E\u7B2C ${idx} \u884C\uFF08\u6587\u4EF6\u7EA6\u7B2C ${idx + 1} \u884C\uFF09\uFF1A\u5B57\u6BB5\u6570 ${r.length} \u2260 \u8868\u5934 ${headerLen}`
          });
        }
      });
      const quotedFields = src.includes('"') ? null : 0;
      const stats = {
        dataRows: Math.max(0, rows.length - 1),
        cols: headerLen,
        quotedFields,
        emptyLines: issues.filter((x) => x.type === "empty-line").length,
        hadBom,
        lineEndings,
        totalLines: curLine
      };
      const hasError = issues.some((x) => x.severity === "error");
      return { ok: true, rows, header, delimiter: delimChar, issues, stats, hasError };
    }
    var INT_RE = /^[+-]?\d+$/;
    var FLOAT_RE = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)$|^[+-]?\d+\.\d+$|^[+-]?\.\d+$/;
    var BOOL_SET = /* @__PURE__ */ new Set(["true", "false"]);
    var DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
    var DATE_SLASH_RE = /^\d{4}\/\d{1,2}\/\d{1,2}$/;
    function classifyValue(v) {
      if (v === "") return "empty";
      const t = v.trim();
      if (t === "") return "empty";
      if (BOOL_SET.has(t.toLowerCase())) return "bool";
      if (INT_RE.test(t)) return "int";
      if (FLOAT_RE.test(t)) return "float";
      if (DATE_RE.test(t) || DATE_SLASH_RE.test(t)) return "date";
      return "string";
    }
    function inferColumns2(rows) {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, error: "\u65E0\u6570\u636E\u884C\uFF08\u5148\u89E3\u6790\uFF09", columns: [] };
      }
      const header = rows[0];
      const body = rows.slice(1);
      const nCols = header.length;
      const columns = [];
      for (let c = 0; c < nCols; c++) {
        const dist = {};
        let min = null, max = null, sum = 0, numeric = 0;
        for (let r = 1; r < rows.length; r++) {
          const v = rows[r][c] !== void 0 ? rows[r][c] : "";
          const k = classifyValue(v);
          dist[k] = (dist[k] || 0) + 1;
          if (k === "int" || k === "float") {
            const num = Number(v.trim());
            numeric++;
            sum += num;
            if (min === null || num < min) min = num;
            if (max === null || num > max) max = num;
          }
        }
        const nonEmpty = Object.entries(dist).filter(([k]) => k !== "empty");
        let inferred;
        if (nonEmpty.length === 0) inferred = "empty";
        else if (nonEmpty.length === 1) inferred = nonEmpty[0][0];
        else {
          const kinds = nonEmpty.map(([k]) => k);
          if (kinds.every((k) => k === "int" || k === "float")) inferred = "float";
          else inferred = "mixed";
        }
        const col = {
          name: header[c] !== void 0 ? header[c] : `\u5217${c + 1}`,
          index: c,
          inferred,
          distribution: dist,
          empties: dist.empty || 0
        };
        if (inferred === "float" || inferred === "int" || inferred === "mixed" && numeric > 0) {
          col.min = min;
          col.max = max;
          col.sum = sum;
        }
        columns.push(col);
      }
      return { ok: true, columns };
    }
    function dedupeHeader(header) {
      const seen = /* @__PURE__ */ new Map();
      const out = [];
      const renamed = [];
      header.forEach((h, i) => {
        const base = h !== void 0 && h !== "" ? h : `\u5217${i + 1}`;
        const cnt = (seen.get(base) || 0) + 1;
        seen.set(base, cnt);
        if (cnt === 1) out.push(base);
        else {
          out.push(`${base}_${cnt}`);
          renamed.push({ index: i, from: base, to: `${base}_${cnt}` });
        }
      });
      return { names: out, renamed };
    }
    function jsonEscape(s) {
      return JSON.stringify(s);
    }
    function toJson2(rows, mode) {
      if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "\u65E0\u6570\u636E\u884C\uFF08\u5148\u89E3\u6790\uFF09" };
      if (mode === "rows") {
        return { ok: true, output: JSON.stringify(rows, null, 2), renamed: [] };
      }
      const { names, renamed } = dedupeHeader(rows[0]);
      const lines = [];
      for (let r = 1; r < rows.length; r++) {
        const obj = {};
        for (let c = 0; c < names.length; c++) {
          obj[names[c]] = rows[r][c] !== void 0 ? rows[r][c] : "";
        }
        lines.push("  " + jsonEscape(obj).replace(/\n/g, "\n  "));
      }
      return { ok: true, output: "[\n" + lines.join(",\n") + "\n]", renamed };
    }
    function toSql2(rows, opts) {
      if (!Array.isArray(rows) || rows.length < 1) return { ok: false, error: "\u65E0\u6570\u636E\u884C\uFF08\u5148\u89E3\u6790\uFF09" };
      const tableName = opts && opts.tableName || "my_table";
      const { names } = dedupeHeader(rows[0]);
      const inferred = inferColumns2(rows);
      const isNum = /* @__PURE__ */ new Map();
      const isBool = /* @__PURE__ */ new Map();
      inferred.columns.forEach((c) => {
        isNum.set(c.index, c.inferred === "int" || c.inferred === "float");
        isBool.set(c.index, c.inferred === "bool");
      });
      const sqlVal = (v, c) => {
        if (v === void 0 || v === "") return "NULL";
        const t = v.trim();
        if (isBool.get(c) && BOOL_SET.has(t.toLowerCase())) return t.toLowerCase();
        if (isNum.get(c) && (INT_RE.test(t) || FLOAT_RE.test(t))) return t;
        return `'${v.replace(/'/g, "''")}'`;
      };
      const colList = names.map((n) => `"${String(n).replace(/"/g, '""')}"`).join(", ");
      const lines = [`INSERT INTO "${String(tableName).replace(/"/g, '""')}" (${colList}) VALUES`];
      for (let r = 1; r < rows.length; r++) {
        const vals = names.map((_, c) => sqlVal(rows[r][c], c)).join(", ");
        lines.push(`  (${vals})${r < rows.length - 1 ? "," : ";"}`);
      }
      return { ok: true, output: lines.join("\n") };
    }
    function toMarkdown2(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "\u65E0\u6570\u636E\u884C\uFF08\u5148\u89E3\u6790\uFF09" };
      const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, " ");
      const { names } = dedupeHeader(rows[0]);
      const lines = [`| ${names.map(esc).join(" | ")} |`, `| ${names.map(() => "---").join(" | ")} |`];
      for (let r = 1; r < rows.length; r++) {
        lines.push(`| ${names.map((_, c) => esc(rows[r][c] !== void 0 ? rows[r][c] : "")).join(" | ")} |`);
      }
      return { ok: true, output: lines.join("\n") };
    }
    function serialize2(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "\u65E0\u6570\u636E\u884C" };
      const needQuote = (s) => /["\r\n,]/.test(s);
      const enc = (s) => {
        const v = s !== void 0 && s !== null ? String(s) : "";
        return needQuote(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      };
      const lines = rows.map((r) => r.map((v) => enc(v)).join(","));
      return { ok: true, output: lines.join("\r\n") + "\r\n" };
    }
    function renderParseReport(r) {
      const lines = [];
      lines.push(`\u89E3\u6790 OK\uFF1A\u6570\u636E\u884C ${r.stats.dataRows}\uFF0C\u5217 ${r.stats.cols}\uFF0C\u5206\u9694\u7B26\u300C${r.delimiter === "	" ? "\\t" : r.delimiter}\u300D`);
      const le = r.stats.lineEndings;
      const leStr = [`CRLF\xD7${le.crlf}`, `LF\xD7${le.lf}`, `CR\xD7${le.cr}`].filter((s) => !s.endsWith("\xD70")).join(" + ");
      lines.push(`\u6362\u884C\u98CE\u683C\uFF1A${leStr || "\u65E0"}\uFF1B\u7A7A\u884C ${r.stats.emptyLines}\uFF1B${r.stats.hadBom ? "\u6709 BOM" : "\u65E0 BOM"}`);
      if (r.issues.length === 0) {
        lines.push("\u672A\u53D1\u73B0\u7ED3\u6784\u95EE\u9898\uFF08\u5F15\u53F7/\u6362\u884C/\u5217\u6570\u5168\u90E8\u5408\u89C4\uFF09");
        return lines.join("\n");
      }
      lines.push(`\u95EE\u9898\u6E05\u5355\uFF08${r.issues.length} \u6761\uFF09\uFF1A`);
      for (const it of r.issues) {
        const tag = it.severity === "error" ? "[\u9519\u8BEF]" : it.severity === "warn" ? "[\u8B66\u544A]" : "[\u63D0\u793A]";
        lines.push(`  ${tag} ${it.message}`);
      }
      return lines.join("\n");
    }
    function renderInferReport(inf) {
      const lines = [`\u9010\u5217\u7C7B\u578B\u63A8\u65AD\uFF08${inf.columns.length} \u5217\uFF09\uFF1A`];
      for (const c of inf.columns) {
        const dist = Object.entries(c.distribution).map(([k, v]) => `${k}\xD7${v}`).join(", ");
        let extra = "";
        if (c.min !== void 0 && c.min !== null) extra = `\uFF1Bmin=${c.min} max=${c.max} sum=${c.sum}`;
        lines.push(`  \u7B2C ${c.index + 1} \u5217\u300C${c.name}\u300D\uFF1A${c.inferred}${extra}\uFF08${dist}\uFF09`);
      }
      return lines.join("\n");
    }
    module.exports = {
      DEFAULT_DELIMITER,
      detectDelimiter: detectDelimiter2,
      parseCsv: parseCsv2,
      classifyValue,
      inferColumns: inferColumns2,
      dedupeHeader,
      toJson: toJson2,
      toSql: toSql2,
      toMarkdown: toMarkdown2,
      serialize: serialize2,
      renderParseReport,
      renderInferReport
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_csv_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-tabs{display:flex;gap:6px;padding:8px 13px 0}
.cl-tab{background:#161c2a;border:1px solid #2b3348;border-radius:6px 6px 0 0;color:#8B94A9;font-size:12px;padding:5px 14px;cursor:pointer}
.cl-tab.on{color:#E6EAF2;border-bottom-color:transparent;background:#1a2030}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.cl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none;box-sizing:border-box}
.cl-input:focus{border-color:#4fd1a0}
.cl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cl-btn{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#c9cede;font-size:12px;padding:5px 14px;cursor:pointer}
.cl-btn.on{border-color:#4fd1a0;color:#4fd1a0}
.cl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.cl-warn{border-radius:8px;padding:8px 13px;font-size:12px;border:1px solid #8a6d3b;background:#241d0f;color:#f3b377}
.cl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.cl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap;position:sticky;top:0;background:#1a2030}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;max-width:340px}
.cl-tbl td.num{text-align:right}
.cl-issue{padding:4px 12px;font-size:11.5px;border-bottom:1px solid #161c2a;display:flex;gap:8px}
.cl-issue .sev{min-width:40px}
.cl-pre{margin:0;padding:10px 13px;font:11.5px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede;max-height:420px;overflow:auto}
.cl-badge{font-size:10.5px;border-radius:10px;padding:1px 8px;border:1px solid #2b3348;color:#8B94A9}
.cl-badge.num{color:#4fd1a0;border-color:#2b5a4a}
.cl-badge.mixed{color:#f3b377;border-color:#5a4a2b}
`;
var TYPE_COLOR = {
  int: "#4fd1a0",
  float: "#4fd1a0",
  bool: "#6ea8fe",
  date: "#c792ea",
  string: "#c9cede",
  mixed: "#f3b377",
  empty: "#5C6678"
};
function badgeFor(t) {
  const color = TYPE_COLOR[t] || "#8B94A9";
  const cls = t === "mixed" ? " mixed" : t === "int" || t === "float" ? " num" : "";
  return /* @__PURE__ */ jsx("span", { className: "cl-badge" + cls, style: { color, borderColor: t === "mixed" ? "#5a4a2b" : void 0 }, children: t });
}
function CsvLensPanel(props) {
  const [text, setText] = useState(props.initialText || "");
  const [submitted, setSubmitted] = useState(props.initialText || "");
  const [delim, setDelim] = useState("auto");
  const [tab, setTab] = useState("parse");
  const [fmt, setFmt] = useState("json_records");
  const [tableName, setTableName] = useState("my_table");
  const [copied, setCopied] = useState("");
  const parsed = useMemo(() => {
    if (!submitted) return null;
    return core.parseCsv(submitted, { delimiter: delim === "auto" ? void 0 : delim === "\\t" ? "	" : delim });
  }, [submitted, delim]);
  const infer = useMemo(() => {
    if (!parsed || !parsed.ok) return null;
    return core.inferColumns(parsed.rows);
  }, [parsed]);
  const converted = useMemo(() => {
    if (!parsed || !parsed.ok) return null;
    if (fmt === "json_records") return core.toJson(parsed.rows, "records");
    if (fmt === "json_rows") return core.toJson(parsed.rows, "rows");
    if (fmt === "sql") return core.toSql(parsed.rows, { tableName });
    return core.toMarkdown(parsed.rows);
  }, [parsed, fmt, tableName]);
  const normalized = useMemo(() => {
    if (!parsed || !parsed.ok) return null;
    return core.serialize(parsed.rows);
  }, [parsed]);
  const statsLine = useMemo(() => {
    if (!parsed || !parsed.ok) return "";
    const le = parsed.stats.lineEndings;
    const leStr = [`CRLF\xD7${le.crlf}`, `LF\xD7${le.lf}`, `CR\xD7${le.cr}`].filter((s) => !s.endsWith("\xD70")).join(" + ");
    return `\u6570\u636E\u884C ${parsed.stats.dataRows} \xB7 \u5217 ${parsed.stats.cols} \xB7 \u5206\u9694\u7B26\u300C${parsed.delimiter === "	" ? "\\t" : parsed.delimiter}\u300D \xB7 \u6362\u884C ${leStr || "\u2014"} \xB7 ${parsed.stats.hadBom ? "\u6709 BOM" : "\u65E0 BOM"} \xB7 \u7A7A\u884C ${parsed.stats.emptyLines}`;
  }, [parsed]);
  function copy(key, value) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1500);
    }, () => {
      setCopied("");
    });
  }
  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setText("");
      setSubmitted("");
      alert("\u6587\u4EF6\u8D85\u8FC7 10MB \u4E0A\u9650");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      setSubmitted(String(reader.result || ""));
    };
    reader.readAsText(f, "utf-8");
  }
  const sevColor = { error: "#f1a0a0", warn: "#f3b377", info: "#5C6678" };
  return /* @__PURE__ */ jsxs("div", { className: "cl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "cl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "CSV \u68C0\u67E5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "RFC 4180 \u72B6\u6001\u673A \xB7 \u65B9\u8A00\u8BCA\u65AD \xB7 \u7C7B\u578B\u63A8\u65AD \xB7 \u8F6C\u6362 \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-body", style: { paddingBottom: 0 }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "cl-input",
          style: { minHeight: 92, resize: "vertical" },
          placeholder: '\u7C98\u8D34 CSV\uFF1A\nname,qty,price\n"\u96F6\u4EF6 A,\u542B\u9017\u53F7",3,"1,299.00"\n"\u591A\u884C\n\u5B57\u6BB5",1,42',
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
        /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => setSubmitted(text), children: "\u89E3\u6790\uFF08\u6216 Ctrl+Enter\uFF09" }),
        /* @__PURE__ */ jsxs("label", { className: "cl-btn", style: { display: "inline-block" }, children: [
          "\u9009\u6587\u4EF6",
          /* @__PURE__ */ jsx("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv", style: { display: "none" }, onChange: onFile })
        ] }),
        ["auto", ",", ";", "\\t", "|"].map((d) => /* @__PURE__ */ jsx("button", { className: "cl-btn" + (delim === d ? " on" : ""), onClick: () => setDelim(d), children: d === "auto" ? "\u81EA\u52A8" : d === "\\t" ? "Tab" : d }, d)),
        submitted && /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => {
          setText("");
          setSubmitted("");
        }, children: "\u6E05\u7A7A" })
      ] }),
      parsed && parsed.ok && /* @__PURE__ */ jsx("div", { className: "cl-note", children: statsLine }),
      parsed && parsed.ok && (parsed.stats.cols > 0 || parsed.stats.dataRows > 0) && /* @__PURE__ */ jsx("div", { className: "cl-tabs", children: [["parse", "\u89E3\u6790\u8BCA\u65AD"], ["infer", "\u7C7B\u578B\u63A8\u65AD"], ["convert", "\u8F6C\u6362"], ["normalize", "\u89C4\u8303\u5316"]].map(([k, label]) => /* @__PURE__ */ jsx("button", { className: "cl-tab" + (tab === k ? " on" : ""), onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-body", style: { paddingTop: 0 }, children: [
      parsed && !parsed.ok && /* @__PURE__ */ jsx("div", { className: "cl-err", children: parsed.error }),
      parsed && parsed.ok && (parsed.stats.cols > 0 || parsed.stats.dataRows > 0) && /* @__PURE__ */ jsxs(Fragment, { children: [
        tab === "parse" && /* @__PURE__ */ jsxs(Fragment, { children: [
          parsed.issues.length === 0 ? /* @__PURE__ */ jsx("div", { className: "cl-note", style: { padding: "6px 2px" }, children: "\u672A\u53D1\u73B0\u7ED3\u6784\u95EE\u9898\uFF08\u5F15\u53F7/\u6362\u884C/\u5217\u6570\u5168\u90E8\u5408\u89C4\uFF09" }) : /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsxs("h3", { children: [
              "\u95EE\u9898\u6E05\u5355\uFF08",
              parsed.issues.length,
              "\uFF09"
            ] }),
            parsed.issues.map((it, i) => /* @__PURE__ */ jsxs("div", { className: "cl-issue", style: { color: sevColor[it.severity] }, children: [
              /* @__PURE__ */ jsx("span", { className: "sev", children: it.severity === "error" ? "[\u9519\u8BEF]" : it.severity === "warn" ? "[\u8B66\u544A]" : "[\u63D0\u793A]" }),
              /* @__PURE__ */ jsx("span", { style: { color: "#c9cede" }, children: it.message })
            ] }, i))
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsx("h3", { children: "\u89E3\u6790\u9884\u89C8\uFF08\u524D 50 \u884C \xB7 \u5F15\u53F7\u5185\u6362\u884C\u4EE5 \u21B5 \u663E\u793A\uFF09" }),
            /* @__PURE__ */ jsxs("table", { className: "cl-tbl", children: [
              /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: parsed.header.map((h, i) => /* @__PURE__ */ jsx("th", { children: h === "" ? `(\u7A7A)` : h }, i)) }) }),
              /* @__PURE__ */ jsx("tbody", { children: parsed.rows.slice(1).slice(0, 50).map((r, ri) => /* @__PURE__ */ jsx("tr", { children: parsed.header.map((_, ci) => {
                const v = r[ci] !== void 0 ? r[ci] : "";
                const isNum = infer && infer.ok && infer.columns[ci] && (infer.columns[ci].inferred === "int" || infer.columns[ci].inferred === "float");
                return /* @__PURE__ */ jsx("td", { className: isNum ? "num" : "", children: v.replace(/\n/g, "\u21B5").replace(/\r/g, "") }, ci);
              }) }, ri)) })
            ] })
          ] }),
          (() => {
            const auto = core.detectDelimiter(submitted);
            if (auto.detected !== parsed.delimiter) {
              return /* @__PURE__ */ jsxs("div", { className: "cl-warn", children: [
                "\u26A0 \u5206\u9694\u7B26\u81EA\u52A8\u68C0\u6D4B\u5EFA\u8BAE\u300C",
                auto.detected === "	" ? "Tab" : auto.detected,
                "\u300D\uFF08\u5F15\u53F7\u5916\u8BA1\u6570 ",
                Object.entries(auto.counts).map(([k, v]) => `${k === "	" ? "Tab" : k}\xD7${v}`).join(" "),
                "\uFF09\u2014\u2014\u82E5\u5F53\u524D\u5217\u6570\u5F02\u5E38\u8BF7\u5207\u6362"
              ] });
            }
          })()
        ] }),
        tab === "infer" && infer && infer.ok && /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u9010\u5217\u7C7B\u578B\u63A8\u65AD" }),
          /* @__PURE__ */ jsxs("table", { className: "cl-tbl", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "#" }),
              /* @__PURE__ */ jsx("th", { children: "\u5217\u540D" }),
              /* @__PURE__ */ jsx("th", { children: "\u7C7B\u578B" }),
              /* @__PURE__ */ jsx("th", { children: "\u5206\u5E03" }),
              /* @__PURE__ */ jsx("th", { children: "\u7A7A\u503C" }),
              /* @__PURE__ */ jsx("th", { children: "min" }),
              /* @__PURE__ */ jsx("th", { children: "max" }),
              /* @__PURE__ */ jsx("th", { children: "sum" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: infer.columns.map((c) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { children: c.index + 1 }),
              /* @__PURE__ */ jsx("td", { children: c.name === "" ? "(\u7A7A)" : c.name }),
              /* @__PURE__ */ jsx("td", { children: badgeFor(c.inferred) }),
              /* @__PURE__ */ jsx("td", { children: Object.entries(c.distribution).map(([k, v]) => `${k}\xD7${v}`).join(" ") }),
              /* @__PURE__ */ jsx("td", { children: c.empties }),
              /* @__PURE__ */ jsx("td", { className: "num", children: c.min !== void 0 && c.min !== null ? c.min : "\u2014" }),
              /* @__PURE__ */ jsx("td", { className: "num", children: c.max !== void 0 && c.max !== null ? c.max : "\u2014" }),
              /* @__PURE__ */ jsx("td", { className: "num", children: c.sum !== void 0 && c.min !== null ? c.sum : "\u2014" })
            ] }, c.index)) })
          ] })
        ] }),
        tab === "convert" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
            [["json_records", "JSON(\u5BF9\u8C61)"], ["json_rows", "JSON(\u6570\u7EC4)"], ["sql", "SQL INSERT"], ["markdown", "Markdown"]].map(([k, label]) => /* @__PURE__ */ jsx("button", { className: "cl-btn" + (fmt === k ? " on" : ""), onClick: () => setFmt(k), children: label }, k)),
            fmt === "sql" && /* @__PURE__ */ jsx("input", { className: "cl-input", style: { width: 160, minHeight: 0 }, value: tableName, onChange: (e) => setTableName(e.target.value), placeholder: "\u8868\u540D" }),
            converted && converted.ok && /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => copy("conv", converted.output), children: copied === "conv" ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236" })
          ] }),
          converted && !converted.ok && /* @__PURE__ */ jsx("div", { className: "cl-err", children: converted.error }),
          converted && converted.ok && /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsxs("h3", { children: [
              fmt,
              " \u8F93\u51FA\uFF08",
              converted.output.length,
              " \u5B57\u7B26\uFF09"
            ] }),
            /* @__PURE__ */ jsx("pre", { className: "cl-pre", children: converted.output })
          ] }),
          fmt === "sql" && /* @__PURE__ */ jsx("div", { className: "cl-note", children: "SQL \u53E3\u5F84\uFF1A\u6570\u5B57/\u5E03\u5C14\u5217\u6309\u7C7B\u578B\u63A8\u65AD\u88F8\u503C\uFF1B\u5B57\u7B26\u4E32\u5355\u5F15\u53F7\u8F6C\u4E49\uFF08''\uFF09\uFF1B\u7A7A\u4E32 \u2192 NULL\uFF1B\u8868\u540D/\u5217\u540D\u53CC\u5F15\u53F7\u8F6C\u4E49\u3002" }),
          fmt === "json_records" && converted && converted.ok && converted.renamed && converted.renamed.length > 0 && /* @__PURE__ */ jsxs("div", { className: "cl-warn", children: [
            "\u26A0 \u91CD\u540D\u8868\u5934\u5DF2\u52A0\u540E\u7F00\uFF1A",
            converted.renamed.map((x) => `\u7B2C${x.index + 1}\u5217\u300C${x.from}\u300D\u2192\u300C${x.to}\u300D`).join("\u3001")
          ] })
        ] }),
        tab === "normalize" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: "cl-row", children: normalized && normalized.ok && /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => copy("norm", normalized.output), children: copied === "norm" ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236" }) }),
          normalized && normalized.ok && /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsx("h3", { children: '\u89C4\u8303\u5316 CSV\uFF08RFC 4180\uFF1ACRLF / minimal \u5F15\u53F7 / "" \u8F6C\u4E49\uFF09' }),
            /* @__PURE__ */ jsx("pre", { className: "cl-pre", children: normalized.output })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u89C4\u8303\u5316\u4EA7\u7269\u7ECF round-trip \u81EA\u8BC1\uFF1A\u518D\u89E3\u6790\u5B57\u6BB5\u77E9\u9635\u4E0E\u539F\u89E3\u6790\u4E00\u81F4\u624D\u8F93\u51FA\uFF08MCP \u4FA7\u540C\u6B64\u4E0D\u53D8\u5F0F\uFF0C\u6709\u635F\u5373\u62E6\u622A\uFF09\u3002" })
        ] })
      ] }),
      !submitted && /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u7EAF\u672C\u5730\u89E3\u6790\uFF08\u96F6\u5916\u8054\u96F6 kv\uFF09\u3002\u7C98\u8D34 CSV \u6216\u9009\u6587\u4EF6\uFF08\u226410MB\uFF09\u5F00\u59CB\uFF1A\u5B9A\u4F4D\u5217\u6570\u6F02\u79FB\u884C\u3001\u88F8\u5F15\u53F7\u3001\u5F15\u53F7\u540E\u5C3E\u968F\u5B57\u7B26\u3001\u672A\u95ED\u5408\u5F15\u53F7\uFF1B\u68C0\u6D4B\u5206\u9694\u7B26/\u6362\u884C\u98CE\u683C/BOM/\u65B9\u8A00\uFF1B\u9010\u5217\u7C7B\u578B\u63A8\u65AD\uFF1B\u8F6C JSON/SQL/Markdown\uFF1B\u8F93\u51FA RFC 4180 \u89C4\u8303 CSV\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function CsvLensEntry(props) {
  return /* @__PURE__ */ jsx2(CsvLensPanel, { ...props });
}
export {
  CsvLensEntry as default
};
