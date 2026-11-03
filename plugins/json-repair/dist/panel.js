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

// shared/repair-core.js
var require_repair_core = __commonJS({
  "shared/repair-core.js"(exports, module) {
    "use strict";
    var FIX_TYPES = {
      fence: "markdown \u4EE3\u7801\u56F4\u680F\u5265\u79BB",
      preamble: "\u56F4\u680F\u5916\u88C5\u9970\u6587\u672C\u5265\u79BB",
      comment: "\u6CE8\u91CA\u5265\u79BB",
      quote: "\u5355\u5F15\u53F7\u8F6C\u53CC\u5F15\u53F7",
      trailing: "\u5C3E\u9017\u53F7\u5265\u79BB",
      control: "\u5B57\u7B26\u4E32\u5185\u63A7\u5236\u5B57\u7B26\u8F6C\u4E49",
      literal: "\u975E\u6CD5\u5B57\u9762\u91CF\u5F52\u4E00\uFF08NaN/Infinity \u2192 null\uFF09",
      close: "\u672A\u95ED\u5408\u62EC\u53F7/\u5F15\u53F7\u8865\u5168"
    };
    var PREVIEW_CAP = 40;
    function repair2(text) {
      const raw = String(text == null ? "" : text);
      if (!raw.trim()) return { ok: false, error: "\u8F93\u5165\u4E3A\u7A7A", fixes: [] };
      const fixes = [];
      const addFix = (pos, type, excerpt) => fixes.push({ pos, type, typeLabel: FIX_TYPES[type] || type, excerpt: truncate(excerpt, PREVIEW_CAP) });
      let s = raw;
      if (isValidJson(s)) {
        return { ok: true, json: s, fixes: [], changed: false };
      }
      const fence = s.match(/^\s*```(?:json)?\s*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/);
      if (fence) {
        addFix(s.indexOf("```"), "fence", s.slice(0, 12) + "\u2026");
        s = fence[1];
      }
      const firstBrace = s.search(/[{[]/);
      const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
      if (firstBrace > 0 || lastBrace !== -1 && lastBrace < s.length - 1) {
        const trimmed = s.slice(firstBrace >= 0 ? firstBrace : 0, lastBrace >= 0 ? lastBrace + 1 : s.length);
        if (trimmed !== s && firstBrace >= 0) {
          addFix(0, "preamble", s.slice(0, Math.min(firstBrace + 8, 40)).replace(/\n/g, "\\n"));
          s = trimmed;
        }
      }
      const out = [];
      const stack = [];
      let i = 0;
      let inStr = false;
      let strEscaped = false;
      const strStart = { idx: -1, quote: "" };
      let singleQuoted = false;
      while (i < s.length) {
        const ch = s[i];
        if (inStr) {
          if (strEscaped) {
            strEscaped = false;
            out.push(ch);
            i++;
            continue;
          }
          if (ch === "\\") {
            strEscaped = true;
            out.push(ch);
            i++;
            continue;
          }
          if (singleQuoted) {
            if (ch === "'") {
              inStr = false;
              singleQuoted = false;
              out.push('"');
              i++;
              continue;
            }
            if (ch === '"') {
              out.push('\\"');
              i++;
              continue;
            }
            if (ch === "\n") {
              addFix(i, "control", "\u88F8\u6362\u884C");
              out.push("\\n");
              i++;
              continue;
            }
            if (ch === "\r") {
              addFix(i, "control", "\u88F8\u56DE\u8F66");
              out.push("\\r");
              i++;
              continue;
            }
            if (ch === "	") {
              addFix(i, "control", "\u88F8\u5236\u8868\u7B26");
              out.push("\\t");
              i++;
              continue;
            }
            out.push(ch);
            i++;
            continue;
          }
          if (ch === '"') {
            inStr = false;
            out.push('"');
            i++;
            continue;
          }
          if (ch === "\n") {
            addFix(i, "control", "\u88F8\u6362\u884C");
            out.push("\\n");
            i++;
            continue;
          }
          if (ch === "\r") {
            addFix(i, "control", "\u88F8\u56DE\u8F66");
            out.push("\\r");
            i++;
            continue;
          }
          if (ch === "	") {
            addFix(i, "control", "\u88F8\u5236\u8868\u7B26");
            out.push("\\t");
            i++;
            continue;
          }
          out.push(ch);
          i++;
          continue;
        }
        if (ch === "/" && s[i + 1] === "/") {
          const end = s.indexOf("\n", i);
          addFix(i, "comment", s.slice(i, end === -1 ? Math.min(i + 30, s.length) : Math.min(end, i + 30)));
          i = end === -1 ? s.length : end;
          continue;
        }
        if (ch === "/" && s[i + 1] === "*") {
          const end = s.indexOf("*/", i + 2);
          addFix(i, "comment", s.slice(i, end === -1 ? Math.min(i + 40, s.length) : end + 2));
          i = end === -1 ? s.length : end + 2;
          continue;
        }
        if (ch === '"' || ch === "'") {
          if (ch === "'") {
            addFix(i, "quote", "'");
            inStr = true;
            singleQuoted = true;
            strStart.idx = i;
            strStart.quote = "'";
            out.push('"');
            i++;
            continue;
          }
          inStr = true;
          singleQuoted = false;
          strStart.idx = i;
          strStart.quote = '"';
          out.push('"');
          i++;
          continue;
        }
        if (ch === "{" || ch === "[") {
          stack.push(ch);
          out.push(ch);
          i++;
          continue;
        }
        if (ch === "}" || ch === "]") {
          stack.pop();
          const lastOut = trimOutTail(out);
          if (lastOut === ",") {
            out.length = findTrailingCommaIndex(out);
            addFix(i, "trailing", ", \u524D\u4E8E " + ch);
          }
          out.push(ch);
          i++;
          continue;
        }
        if (ch === ",") {
          out.push(ch);
          i++;
          continue;
        }
        if (isLetter(ch)) {
          let j = i;
          while (j < s.length && /[\w]/.test(s[j])) j++;
          const word = s.slice(i, j);
          if (word === "true" || word === "false" || word === "null") {
            out.push(word);
          } else if (word === "NaN" || word === "Infinity" || word === "None" || word === "undefined") {
            addFix(i, "literal", word);
            out.push("null");
          } else if (word === "-Infinity" || word === "Infinity" && out[out.length - 1] === "-") {
            addFix(i, "literal", word);
            out.push("null");
          } else {
            addFix(i, "quote", word.slice(0, 20));
            out.push('"' + word + '"');
          }
          i = j;
          continue;
        }
        out.push(ch);
        i++;
        continue;
      }
      if (inStr) {
        addFix(s.length, "close", `\u672A\u95ED\u5408\u7684 ${singleQuoted ? "\u5355\u5F15\u53F7" : "\u53CC\u5F15\u53F7"}\u5B57\u7B26\u4E32`);
        out.push('"');
      }
      while (stack.length) {
        const open = stack.pop();
        const close = open === "{" ? "}" : "]";
        const lastOut = trimOutTail(out);
        if (lastOut === ",") out.length = findTrailingCommaIndex(out);
        addFix(out.length, "close", `\u672A\u95ED\u5408\u7684 ${open}`);
        out.push(close);
      }
      let json = out.join("");
      if (!isValidJson(json)) {
        const trimmed = json.trim();
        if (isValidJson(trimmed)) json = trimmed;
        else return { ok: false, error: `\u4FEE\u590D\u540E\u4ECD\u975E\u6CD5\uFF08\u7B56\u7565\u8986\u76D6\u4E0D\u5230\u8BE5\u9519\u8BEF\u5F62\u6001\uFF0C\u5982\u5B9E\u653E\u5F03\uFF09\uFF1A${firstError(trimmed)}`, fixes };
      }
      return { ok: true, json, fixes, changed: true };
    }
    function isLetter(ch) {
      return /[A-Za-z_]/.test(ch);
    }
    function trimOutTail(out) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (!/\s/.test(out[i])) return out[i];
      }
      return "";
    }
    function findTrailingCommaIndex(out) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i] === ",") return i;
        if (!/\s/.test(out[i])) return out.length;
      }
      return out.length;
    }
    function isValidJson(s) {
      if (typeof s !== "string" || !s.trim()) return false;
      try {
        JSON.parse(s);
        return true;
      } catch (_) {
        return false;
      }
    }
    function firstError(s) {
      try {
        JSON.parse(s);
        return "(\u672A\u77E5)";
      } catch (e) {
        return String(e.message || e).slice(0, 120);
      }
    }
    function truncate(s, cap) {
      const t = String(s);
      return t.length <= cap ? t : t.slice(0, cap) + "\u2026";
    }
    function renderReport(r) {
      if (!r.ok) return `\u274C \u65E0\u6CD5\u4FEE\u590D\uFF1A${r.error}`;
      if (!r.changed) return "\u2705 \u8F93\u5165\u5DF2\u662F\u5408\u6CD5 JSON\uFF08\u5FEB\u901F\u901A\u9053\uFF0C\u96F6\u4FEE\u6539\uFF09";
      const lines = [`\u2705 \u4FEE\u590D\u5B8C\u6210\uFF1A${r.fixes.length} \u5904\u4FEE\u6539`, "\u4FEE\u6539\u70B9\uFF1A"];
      for (const f of r.fixes.slice(0, 20)) {
        lines.push(`  [pos ${f.pos}] ${f.typeLabel}\uFF1A${f.excerpt}`);
      }
      if (r.fixes.length > 20) lines.push(`  \uFF08\u53E6 ${r.fixes.length - 20} \u5904\u7565\uFF09`);
      return lines.join("\n");
    }
    module.exports = { repair: repair2, renderReport, isValidJson, FIX_TYPES, truncate };
  }
});

// src/Panel.tsx
var core = __toESM(require_repair_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.jr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.jr-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.jr-head b{font-size:13px}
.jr-head .sub{color:#5C6678;font-size:11px}
.jr-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.jr-label{color:#8B94A9;font-size:11px}
.jr-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.jr-area:focus{border-color:#4fd1a0}
.jr-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.jr-run:disabled{opacity:.5;cursor:not-allowed}
.jr-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.jr-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.jr-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.jr-verdict b{font-size:13px}
.jr-out{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede}
.jr-fixes{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.jr-fixes table{width:100%;border-collapse:collapse;font-size:11.5px}
.jr-fixes th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.jr-fixes td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace}
.jr-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function JsonRepairPanel(_props) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(null);
  const result = useMemo(() => {
    if (checked === null) return null;
    return core.repair(checked);
  }, [checked]);
  return /* @__PURE__ */ jsxs("div", { className: "jr-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "jr-head", children: [
      /* @__PURE__ */ jsx("b", { children: "JSON \u4FEE\u590D\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "LLM \u8F93\u51FA\u574F JSON \u6E05\u6D17 \xB7 \u9010\u5904\u4FEE\u6539\u70B9\u62A5\u544A \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "jr-body", children: [
      /* @__PURE__ */ jsx("div", { className: "jr-label", children: "\u5F85\u4FEE\u590D\u6587\u672C\uFF08LLM \u8F93\u51FA\u7684\u574F JSON\uFF09" }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "jr-area",
          placeholder: "```json\n{'name': 'app', 'tags': ['a',],}\n```",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "jr-run", onClick: () => setChecked(text), disabled: !text.trim(), children: "\u4FEE\u590D" }),
      result && !result.ok && /* @__PURE__ */ jsxs("div", { className: "jr-verdict bad", children: [
        /* @__PURE__ */ jsx("b", { children: "\u65E0\u6CD5\u4FEE\u590D" }),
        "\uFF1A",
        result.error,
        /* @__PURE__ */ jsx("div", { style: { marginTop: 4, fontSize: 11 }, children: "\u7B56\u7565\u5F0F\u4FEE\u590D\u4E0D\u4FDD\u8BC1\u8986\u76D6\u4EFB\u610F\u574F JSON\uFF1B\u53EF\u4EBA\u5DE5\u68C0\u67E5\u540E\u5206\u6BB5\u4FEE\u590D\u3002" })
      ] }),
      result && result.ok && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: `jr-verdict ${result.changed ? "ok" : "ok"}`, children: /* @__PURE__ */ jsx("b", { children: result.changed ? `\u2705 \u4FEE\u590D\u5B8C\u6210\uFF08${result.fixes.length} \u5904\u4FEE\u6539\uFF09` : "\u2705 \u8F93\u5165\u5DF2\u662F\u5408\u6CD5 JSON\uFF08\u96F6\u4FEE\u6539\uFF09" }) }),
        result.fixes.length > 0 && /* @__PURE__ */ jsx("div", { className: "jr-fixes", children: /* @__PURE__ */ jsxs("table", { children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { children: "\u4F4D\u7F6E" }),
            /* @__PURE__ */ jsx("th", { children: "\u4FEE\u590D\u7C7B\u578B" }),
            /* @__PURE__ */ jsx("th", { children: "\u6458\u5F55" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: result.fixes.map((f, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { children: f.pos }),
            /* @__PURE__ */ jsx("td", { children: f.typeLabel }),
            /* @__PURE__ */ jsx("td", { children: f.excerpt })
          ] }, i)) })
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "jr-label", children: "\u4FEE\u590D\u540E JSON\uFF08\u53EF\u7EE7\u7EED\u7528 schema-check \u6309 schema \u6821\u9A8C\uFF09" }),
        /* @__PURE__ */ jsx("div", { className: "jr-out", children: result.json })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "jr-note", children: [
        "\u652F\u6301\u7B56\u7565\uFF1Amarkdown \u56F4\u680F\u5265\u79BB / \u88C5\u9970\u6587\u672C\u5265\u79BB / \u6CE8\u91CA\u5265\u79BB / \u5355\u5F15\u53F7\u8F6C\u53CC / \u5C3E\u9017\u53F7\u5265\u79BB / \u5B57\u7B26\u4E32\u5185\u63A7\u5236\u5B57\u7B26\u8F6C\u4E49 / NaN\xB7Infinity\xB7None\xB7undefined \u2192 null / \u88F8\u8BCD\u952E\u52A0\u5F15\u53F7 / \u672A\u95ED\u5408\u62EC\u53F7\xB7\u5F15\u53F7\u8865\u5168\u3002",
        /* @__PURE__ */ jsx("b", { children: "\u4E0D\u4FDD\u8BC1\u4FEE\u590D\u4EFB\u610F\u574F JSON" }),
        "\uFF08\u4E0D\u53EF\u4FEE\u65F6\u5982\u5B9E\u62A5\u9519\uFF09\uFF1B\u4FEE\u590D\u7684\u662F\u8BED\u6CD5\u5408\u6CD5\u6027\uFF0C\u503C\u8BED\u4E49\u4E0D\u4FDD\u8BC1\u2014\u2014\u5EFA\u8BAE\u4FEE\u590D\u540E\u7528 schema-check \u6309 schema \u6821\u9A8C\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function JsonRepairEntry(props) {
  return /* @__PURE__ */ jsx2(JsonRepairPanel, { ...props });
}
export {
  JsonRepairEntry as default
};
