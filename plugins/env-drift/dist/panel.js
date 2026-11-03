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

// shared/env-core.js
var require_env_core = __commonJS({
  "shared/env-core.js"(exports, module) {
    "use strict";
    var KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
    function parseEnv2(text) {
      const raw = String(text == null ? "" : text);
      const vars = {};
      const order = [];
      const firstSeen = /* @__PURE__ */ new Set();
      const duplicates = [];
      const errors = [];
      const lines = raw.split(/\r?\n/);
      lines.forEach((rawLine, idx) => {
        const lineNo = idx + 1;
        let line = String(rawLine).trim();
        if (!line || line.startsWith("#")) return;
        const exportM = line.match(/^export\s+/);
        if (exportM) line = line.slice(exportM[0].length).trim();
        const eq = line.indexOf("=");
        if (eq === -1) {
          errors.push({ line: lineNo, content: truncate(String(rawLine).trim(), 60), reason: "\u7F3A\u5C11 =" });
          return;
        }
        const key = line.slice(0, eq).trim();
        if (!KEY_RE.test(key)) {
          errors.push({ line: lineNo, content: truncate(String(rawLine).trim(), 60), reason: "\u952E\u540D\u975E\u6CD5" });
          return;
        }
        let value = line.slice(eq + 1).trim();
        if (value.length >= 2 && (value[0] === '"' && value.endsWith('"') || value[0] === "'" && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!/^['"]/.test(String(rawLine).trim().slice(eq + 1))) {
          const hashIdx = value.search(/\s#/);
          if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
        }
        if (firstSeen.has(key)) {
          duplicates.push(key);
        } else {
          firstSeen.add(key);
          order.push(key);
        }
        vars[key] = value;
      });
      return { vars, order, duplicates, errors };
    }
    function diffEnv2(example, actual) {
      const exKeys = Object.keys(example.vars);
      const acKeys = Object.keys(actual.vars);
      const missing = exKeys.filter((k) => !(k in actual.vars));
      const extra = acKeys.filter((k) => !(k in example.vars));
      const valueDiff = exKeys.filter((k) => k in actual.vars && actual.vars[k] !== example.vars[k]).map((k) => ({ key: k, exampleValue: example.vars[k] }));
      const emptyInActual = acKeys.filter((k) => actual.vars[k] === "");
      const summary = {
        missing: missing.length,
        extra: extra.length,
        valueDiff: valueDiff.length,
        emptyInActual: emptyInActual.length,
        ok: missing.length === 0 && valueDiff.length === 0
      };
      return { missing, extra, valueDiff, emptyInActual, summary };
    }
    function renderReport2(example, actual, parsed) {
      const d = diffEnv2(example, actual);
      const lines = [];
      const head = d.summary.ok && d.summary.extra === 0 && d.summary.emptyInActual === 0 ? "\u2705 \u65E0\u6F02\u79FB" : `\u26A0\uFE0F \u53D1\u73B0\u6F02\u79FB`;
      lines.push(`${head}\uFF1A\u7F3A\u5931 ${d.summary.missing} / \u591A\u4F59 ${d.summary.extra} / \u503C\u5DEE\u5F02 ${d.summary.valueDiff} / \u5B9E\u9645\u7A7A\u503C ${d.summary.emptyInActual}`);
      if (d.missing.length) {
        lines.push(`\u7F3A\u5931\u952E\uFF08example \u6709\u3001\u5B9E\u9645\u65E0\u2014\u2014\u90E8\u7F72\u4F1A\u7F3A\u914D\u7F6E\uFF09\uFF1A${d.missing.join(", ")}`);
      }
      if (d.valueDiff.length) {
        lines.push("\u503C\u5DEE\u5F02\uFF08\u540C\u540D\u952E\u503C\u4E0D\u540C\uFF1B\u5B9E\u9645\u503C\u8131\u654F\u4E0D\u5C55\u793A\uFF09\uFF1A");
        for (const v of d.valueDiff.slice(0, 20)) {
          lines.push(`  - ${v.key}: example=${v.exampleValue || "(\u7A7A)"} \u2260 \u5B9E\u9645\u503C(\u5DF2\u9690\u85CF)`);
        }
        if (d.valueDiff.length > 20) lines.push(`  \uFF08\u53E6 ${d.valueDiff.length - 20} \u9879\u7565\uFF09`);
      }
      if (d.extra.length) {
        lines.push(`\u591A\u4F59\u952E\uFF08\u5B9E\u9645\u6709\u3001example \u65E0\u2014\u2014\u5EFA\u8BAE\u56DE\u586B example\uFF09\uFF1A${d.extra.join(", ")}`);
      }
      if (d.emptyInActual.length) {
        lines.push(`\u5B9E\u9645\u7A7A\u503C\u952E\uFF08\u6613\u5BFC\u81F4\u8FD0\u884C\u65F6\u7A7A\u914D\u7F6E\uFF09\uFF1A${d.emptyInActual.join(", ")}`);
      }
      if (parsed.actual.duplicates.length) {
        lines.push(`\u5B9E\u9645\u6587\u4EF6\u91CD\u590D\u952E\uFF08\u540E\u8005\u8986\u76D6\u524D\u8005\uFF09\uFF1A${[...new Set(parsed.actual.duplicates)].join(", ")}`);
      }
      if (parsed.example.errors.length || parsed.actual.errors.length) {
        lines.push(`\u683C\u5F0F\u9519\u8BEF\u884C\uFF1Aexample ${parsed.example.errors.length} \u5904 / \u5B9E\u9645 ${parsed.actual.errors.length} \u5904`);
        for (const e of parsed.example.errors.slice(0, 5)) lines.push(`  [example:${e.line}] ${e.reason}\uFF1A${e.content}`);
        for (const e of parsed.actual.errors.slice(0, 5)) lines.push(`  [actual:${e.line}] ${e.reason}\uFF1A${e.content}`);
      }
      return lines.join("\n");
    }
    function truncate(s, cap) {
      const t = String(s == null ? "" : s);
      return t.length <= cap ? t : t.slice(0, cap) + "\u2026";
    }
    module.exports = { parseEnv: parseEnv2, diffEnv: diffEnv2, renderReport: renderReport2, truncate, KEY_RE };
  }
});

// src/Panel.tsx
var core = __toESM(require_env_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.ed-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ed-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ed-head b{font-size:13px}
.ed-head .sub{color:#5C6678;font-size:11px}
.ed-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ed-cols{display:flex;gap:10px}
.ed-col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.ed-col label{color:#8B94A9;font-size:11px}
.ed-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.ed-area:focus{border-color:#4fd1a0}
.ed-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.ed-run:disabled{opacity:.5;cursor:not-allowed}
.ed-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.ed-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.ed-verdict.drift{background:#2b2413;border-color:#e8590c;color:#f3b377}
.ed-verdict b{font-size:13px}
.ed-report{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c9cede}
.ed-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function EnvDriftPanel(_props) {
  const [example, setExample] = useState("");
  const [actual, setActual] = useState("");
  const [checked, setChecked] = useState(null);
  const [error, setError] = useState(null);
  const result = useMemo(() => {
    if (!checked) return null;
    try {
      const ex = core.parseEnv(checked.ex);
      const ac = core.parseEnv(checked.ac);
      const report = core.renderReport(ex, ac, { example: ex, actual: ac });
      const d = core.diffEnv(ex, ac);
      return { report, ok: d.summary.ok && d.summary.extra === 0 && d.summary.emptyInActual === 0 };
    } catch (e) {
      setError(String(e.message || e));
      return null;
    }
  }, [checked]);
  const run = () => {
    setError(null);
    setChecked({ ex: example, ac: actual });
  };
  return /* @__PURE__ */ jsxs("div", { className: "ed-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "ed-head", children: [
      /* @__PURE__ */ jsx("b", { children: ".env \u6F02\u79FB\u68C0\u67E5\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "example vs \u5B9E\u9645 .env \xB7 \u503C\u8131\u654F \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ed-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "ed-cols", children: [
        /* @__PURE__ */ jsxs("div", { className: "ed-col", children: [
          /* @__PURE__ */ jsx("label", { children: ".env.example\uFF08\u5360\u4F4D\u7B26\u8BED\u4E49\uFF0C\u503C\u53EF\u663E\u793A\uFF09" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "ed-area",
              placeholder: "API_KEY=placeholder\nDB_URL=postgres://localhost/app",
              value: example,
              onChange: (e) => setExample(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ed-col", children: [
          /* @__PURE__ */ jsx("label", { children: "\u5B9E\u9645 .env\uFF08\u503C\u539F\u6587\u4E0D\u8FDB\u62A5\u544A\uFF09" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "ed-area",
              placeholder: "API_KEY=sk-\u771F\u5B9E\u5BC6\u94A5\nDB_URL=postgres://prod/app",
              value: actual,
              onChange: (e) => setActual(e.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "ed-run", onClick: run, disabled: !example.trim() || !actual.trim(), children: "\u5BF9\u6BD4" }),
      error && /* @__PURE__ */ jsxs("div", { className: "ed-verdict drift", children: [
        /* @__PURE__ */ jsx("b", { children: "\u89E3\u6790\u5931\u8D25" }),
        "\uFF1A",
        error
      ] }),
      result && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `ed-verdict ${result.ok ? "ok" : "drift"}`, children: [
          /* @__PURE__ */ jsx("b", { children: result.ok ? "\u2705 \u65E0\u6F02\u79FB" : "\u26A0\uFE0F \u53D1\u73B0\u6F02\u79FB" }),
          result.ok ? " example \u4E0E\u5B9E\u9645\u952E\u4F4D\u4E00\u81F4" : " \u89C1\u4E0B\u65B9\u660E\u7EC6"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "ed-report", children: result.report })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ed-note", children: [
        "\u5BF9\u6BD4\u7EF4\u5EA6\uFF1A\u7F3A\u5931\u952E\uFF08\u90E8\u7F72\u4F1A\u7F3A\u914D\u7F6E\uFF09/ \u591A\u4F59\u952E\uFF08\u5EFA\u8BAE\u56DE\u586B example\uFF09/ \u503C\u5DEE\u5F02\uFF08\u8131\u654F\u2014\u2014\u62A5\u544A\u53EA\u5224\u300C\u4E0D\u540C\u300D\uFF0C\u7EDD\u4E0D\u5C55\u793A\u5B9E\u9645\u503C\u539F\u6587\uFF09/ \u5B9E\u9645\u7A7A\u503C\u952E / \u91CD\u590D\u952E / \u683C\u5F0F\u9519\u8BEF\u884C\u3002 \u89E3\u6790\u652F\u6301\uFF1A\u5F15\u53F7\u503C\u3001export \u524D\u7F00\u3001\u884C\u5185\u6CE8\u91CA\uFF08# \u524D\u987B\u6709\u7A7A\u683C\uFF09\u3001\u7A7A\u503C\uFF1B\u4E0D\u505A $",
        "{VAR}",
        " \u63D2\u503C\u5C55\u5F00\uFF08\u539F\u6837\u4FDD\u7559\uFF09\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function EnvDriftEntry(props) {
  return /* @__PURE__ */ jsx2(EnvDriftPanel, { ...props });
}
export {
  EnvDriftEntry as default
};
