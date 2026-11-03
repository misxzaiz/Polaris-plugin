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

// shared/schema-core.js
var require_schema_core = __commonJS({
  "shared/schema-core.js"(exports, module) {
    "use strict";
    var SUPPORTED_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
    var FORMATS = {
      "date-time": /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/,
      date: /^\d{4}-\d{2}-\d{2}$/,
      time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      uri: /^[a-z][a-z0-9+.-]*:\S+/i,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
      ipv6: /^[0-9a-f:]{2,45}$/i,
      hostname: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i
    };
    function jsonType(v) {
      if (v === null) return "null";
      if (Array.isArray(v)) return "array";
      const t = typeof v;
      if (t === "number") return Number.isInteger(v) ? "integer" : "number";
      return t;
    }
    function typeMatch(v, expected) {
      const actual = jsonType(v);
      if (Array.isArray(expected)) return expected.some((e) => typeMatch(v, e));
      if (expected === "number") return actual === "number" || actual === "integer";
      if (expected === "integer") return actual === "integer";
      return actual === expected;
    }
    function validate2(data, schema, pointer = "") {
      const errors = [];
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return { valid: false, errors: [{ pointer, keyword: "schema", message: "schema \u672C\u8EAB\u5FC5\u987B\u662F\u5BF9\u8C61" }] };
      }
      if ("$ref" in schema) {
        errors.push({ pointer, keyword: "$ref", message: "\u672C\u5B9E\u73B0\u4E0D\u652F\u6301 $ref \u5F15\u7528\uFF08\u8FB9\u754C\u89C1\u5DE5\u5177\u63CF\u8FF0\uFF09\uFF0C\u8BF7\u5C06 schema \u5185\u8054\u5C55\u5F00\u540E\u518D\u6821\u9A8C" });
        return { valid: errors.length === 0, errors };
      }
      const push = (keyword, message) => errors.push({ pointer: pointer || "/", keyword, message });
      if (schema.type !== void 0) {
        if (!typeMatch(data, schema.type)) {
          push("type", `\u7C7B\u578B\u5E94\u4E3A ${Array.isArray(schema.type) ? schema.type.join("|") : schema.type}\uFF0C\u5B9E\u9645 ${jsonType(data)}`);
        }
      }
      if (schema.const !== void 0 && JSON.stringify(data) !== JSON.stringify(schema.const)) {
        push("const", `\u5E94\u4E3A\u5E38\u91CF ${JSON.stringify(schema.const)}\uFF0C\u5B9E\u9645 ${JSON.stringify(data).slice(0, 60)}`);
      }
      if (Array.isArray(schema.enum) && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(data))) {
        push("enum", `\u4E0D\u5728\u679A\u4E3E ${JSON.stringify(schema.enum).slice(0, 120)} \u5185\uFF0C\u5B9E\u9645 ${JSON.stringify(data).slice(0, 60)}`);
      }
      if (Array.isArray(schema.allOf)) {
        for (let i = 0; i < schema.allOf.length; i++) {
          for (const e of validate2(data, schema.allOf[i], pointer).errors) errors.push(e);
        }
      }
      if (Array.isArray(schema.anyOf)) {
        const attempts = schema.anyOf.map((sub) => validate2(data, sub, pointer));
        if (!attempts.some((a) => a.valid)) {
          push("anyOf", `\u4E0D\u6EE1\u8DB3 anyOf \u4EFB\u4E00\u5206\u652F\uFF08${attempts.length} \u4E2A\u5206\u652F\u5168\u90E8\u5931\u8D25\uFF09`);
        }
      }
      if (Array.isArray(schema.oneOf)) {
        const okCount = schema.oneOf.filter((sub) => validate2(data, sub, pointer).valid).length;
        if (okCount !== 1) push("oneOf", `\u5E94\u6070\u597D\u5339\u914D oneOf \u4E00\u4E2A\u5206\u652F\uFF0C\u5B9E\u9645\u5339\u914D ${okCount} \u4E2A`);
      }
      if (schema.not) {
        if (validate2(data, schema.not, pointer).valid) push("not", "\u4E0D\u5E94\u5339\u914D not \u5206\u652F\uFF0C\u4F46\u5339\u914D\u4E86");
      }
      if (typeof data === "string") {
        if (schema.minLength !== void 0 && data.length < schema.minLength) push("minLength", `\u957F\u5EA6 ${data.length} < \u6700\u5C0F ${schema.minLength}`);
        if (schema.maxLength !== void 0 && data.length > schema.maxLength) push("maxLength", `\u957F\u5EA6 ${data.length} > \u6700\u5927 ${schema.maxLength}`);
        if (schema.pattern !== void 0) {
          try {
            if (!new RegExp(schema.pattern).test(data)) push("pattern", `\u4E0D\u5339\u914D pattern ${schema.pattern}`);
          } catch (_) {
            push("pattern", `pattern \u975E\u6CD5\u6B63\u5219\uFF1A${schema.pattern}`);
          }
        }
        if (schema.format && FORMATS[schema.format]) {
          if (!FORMATS[schema.format].test(data)) push("format", `\u4E0D\u7B26\u5408 ${schema.format} \u683C\u5F0F\uFF1A${data.slice(0, 60)}`);
        }
      }
      if (jsonType(data) === "number" || jsonType(data) === "integer") {
        if (schema.minimum !== void 0 && data < schema.minimum) push("minimum", `${data} < \u6700\u5C0F\u503C ${schema.minimum}`);
        if (schema.maximum !== void 0 && data > schema.maximum) push("maximum", `${data} > \u6700\u5927\u503C ${schema.maximum}`);
        if (schema.exclusiveMinimum !== void 0 && data <= schema.exclusiveMinimum) push("exclusiveMinimum", `${data} \u2264 \u6392\u4ED6\u4E0B\u754C ${schema.exclusiveMinimum}`);
        if (schema.exclusiveMaximum !== void 0 && data >= schema.exclusiveMaximum) push("exclusiveMaximum", `${data} \u2265 \u6392\u4ED6\u4E0A\u754C ${schema.exclusiveMaximum}`);
        if (schema.multipleOf !== void 0 && schema.multipleOf > 0) {
          const q = data / schema.multipleOf;
          if (Math.abs(q - Math.round(q)) > 1e-9) push("multipleOf", `${data} \u4E0D\u662F ${schema.multipleOf} \u7684\u6574\u6570\u500D`);
        }
      }
      if (Array.isArray(data)) {
        if (schema.minItems !== void 0 && data.length < schema.minItems) push("minItems", `\u5143\u7D20\u6570 ${data.length} < \u6700\u5C0F ${schema.minItems}`);
        if (schema.maxItems !== void 0 && data.length > schema.maxItems) push("maxItems", `\u5143\u7D20\u6570 ${data.length} > \u6700\u5927 ${schema.maxItems}`);
        if (schema.uniqueItems === true) {
          const seen = new Set(data.map((x) => JSON.stringify(x)));
          if (seen.size !== data.length) push("uniqueItems", "\u5B58\u5728\u91CD\u590D\u5143\u7D20");
        }
        if (schema.items !== void 0 && typeof schema.items === "object" && !Array.isArray(schema.items)) {
          data.forEach((item, i) => {
            for (const e of validate2(item, schema.items, `${pointer}/${i}`).errors) errors.push(e);
          });
        }
      }
      if (data !== null && typeof data === "object" && !Array.isArray(data)) {
        const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
        const required = Array.isArray(schema.required) ? schema.required : [];
        for (const key of required) {
          if (!(key in data)) push("required", `\u7F3A\u5C11\u5FC5\u586B\u5C5E\u6027 "${key}"`);
        }
        for (const key of Object.keys(data)) {
          if (key in props) {
            for (const e of validate2(data[key], props[key], `${pointer}/${escapePointer(key)}`).errors) errors.push(e);
          } else {
            const ap = schema.additionalProperties;
            if (ap === false) {
              push("additionalProperties", `\u591A\u4F59\u5C5E\u6027 "${key}"\uFF08additionalProperties=false\uFF09`);
            } else if (ap && typeof ap === "object") {
              for (const e of validate2(data[key], ap, `${pointer}/${escapePointer(key)}`).errors) errors.push(e);
            }
          }
        }
      }
      return { valid: errors.length === 0, errors };
    }
    function escapePointer(token) {
      return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
    }
    function explainSchema2(schema) {
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return "schema \u672C\u8EAB\u5FC5\u987B\u662F\u5BF9\u8C61";
      }
      const lines = [];
      walk(schema, "", 0);
      return lines.join("\n");
      function walk(node, path, depth) {
        if (depth > 6 || !node || typeof node !== "object" || Array.isArray(node)) return;
        const label = path || "(root)";
        const type = Array.isArray(node.type) ? node.type.join("|") : node.type || (node.properties ? "object" : node.items ? "array" : "\u672A\u58F0\u660E");
        const bits = [`\u7C7B\u578B ${type}`];
        if (Array.isArray(node.required) && node.required.length) bits.push(`\u5FC5\u586B [${node.required.join(", ")}]`);
        if (node.enum) bits.push(`\u679A\u4E3E ${JSON.stringify(node.enum).slice(0, 80)}`);
        if (node.const !== void 0) bits.push(`\u5E38\u91CF ${JSON.stringify(node.const).slice(0, 60)}`);
        if (node.minimum !== void 0 || node.maximum !== void 0) bits.push(`\u8303\u56F4 ${node.minimum ?? "-\u221E"} ~ ${node.maximum ?? "+\u221E"}`);
        if (node.minLength !== void 0 || node.maxLength !== void 0) bits.push(`\u957F\u5EA6 ${node.minLength ?? 0} ~ ${node.maxLength ?? "\u221E"}`);
        if (node.pattern) bits.push(`pattern ${node.pattern}`);
        if (node.format) bits.push(`format ${node.format}`);
        if (node.description) bits.push(String(node.description).slice(0, 80));
        lines.push(`${"  ".repeat(depth)}${label}: ${bits.join(" \xB7 ")}`);
        if (node.properties) {
          for (const [k, sub] of Object.entries(node.properties)) {
            walk(sub, path ? `${path}/${k}` : `/${k}`, depth + 1);
          }
        }
        if (node.items && typeof node.items === "object" && !Array.isArray(node.items)) {
          walk(node.items, path ? `${path}[]` : "[]", depth + 1);
        }
      }
    }
    module.exports = { validate: validate2, explainSchema: explainSchema2, escapePointer, jsonType, typeMatch, FORMATS, SUPPORTED_TYPES };
  }
});

// src/Panel.tsx
var core = __toESM(require_schema_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.sc-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sc-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sc-head b{font-size:13px}
.sc-head .sub{color:#5C6678;font-size:11px}
.sc-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.sc-cols{display:flex;gap:10px}
.sc-col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.sc-col label{color:#8B94A9;font-size:11px}
.sc-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.sc-area:focus{border-color:#4fd1a0}
.sc-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.sc-run:disabled{opacity:.5;cursor:not-allowed}
.sc-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.sc-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.sc-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.sc-verdict b{font-size:13px}
.sc-errs{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:8px 12px;font:12px/1.8 ui-monospace,Consolas,monospace;color:#e8b4b4;word-break:break-all}
.sc-explain{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#c9cede}
.sc-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function parseBox(text, field) {
  if (!text.trim()) return { ok: false, error: `${field} \u4E3A\u7A7A` };
  try {
    const v = JSON.parse(text);
    return { ok: true, schema: field === "schema" ? v : v, data: v };
  } catch (e) {
    return { ok: false, error: `${field} JSON \u89E3\u6790\u5931\u8D25\uFF1A${e.message.slice(0, 100)}` };
  }
}
function SchemaCheckPanel(_props) {
  const [schemaText, setSchemaText] = useState("");
  const [dataText, setDataText] = useState("");
  const [checked, setChecked] = useState(null);
  const result = useMemo(() => {
    if (!checked) return null;
    const ps = parseBox(checked.s, "schema");
    if (!ps.ok) return { error: ps.error };
    const pd = parseBox(checked.d, "data");
    if (!pd.ok) return { error: pd.error };
    const r = core.validate(pd.data, ps.schema);
    return { valid: r.valid, errors: r.errors, explain: core.explainSchema(ps.schema) };
  }, [checked]);
  const run = () => setChecked({ s: schemaText, d: dataText });
  return /* @__PURE__ */ jsxs("div", { className: "sc-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "sc-head", children: [
      /* @__PURE__ */ jsx("b", { children: "JSON Schema \u6821\u9A8C\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "Draft-07 \u9AD8\u9891\u5B50\u96C6 \xB7 \u9519\u8BEF JSON Pointer \u5B9A\u4F4D \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sc-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "sc-cols", children: [
        /* @__PURE__ */ jsxs("div", { className: "sc-col", children: [
          /* @__PURE__ */ jsx("label", { children: "JSON Schema" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "sc-area",
              placeholder: '{"type":"object","required":["id"],"properties":{"id":{"type":"integer"}}}',
              value: schemaText,
              onChange: (e) => setSchemaText(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sc-col", children: [
          /* @__PURE__ */ jsx("label", { children: "\u5F85\u6821\u9A8C\u6570\u636E" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "sc-area",
              placeholder: '{"id": 1}',
              value: dataText,
              onChange: (e) => setDataText(e.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "sc-run", onClick: run, disabled: !schemaText.trim() || !dataText.trim(), children: "\u6821\u9A8C" }),
      result && "error" in result && /* @__PURE__ */ jsxs("div", { className: "sc-verdict bad", children: [
        /* @__PURE__ */ jsx("b", { children: "\u8F93\u5165\u9519\u8BEF" }),
        "\uFF1A",
        result.error
      ] }),
      result && !("error" in result) && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: `sc-verdict ${result.valid ? "ok" : "bad"}`, children: /* @__PURE__ */ jsx("b", { children: result.valid ? "\u2705 \u6821\u9A8C\u901A\u8FC7" : `\u274C \u6821\u9A8C\u5931\u8D25\uFF08${result.errors.length} \u6761\u9519\u8BEF\uFF09` }) }),
        !result.valid && /* @__PURE__ */ jsx("div", { className: "sc-errs", children: result.errors.map((e, i) => /* @__PURE__ */ jsxs("div", { children: [
          e.pointer || "/",
          " [",
          e.keyword,
          "] ",
          e.message
        ] }, i)) }),
        /* @__PURE__ */ jsx("div", { className: "sc-explain", children: result.explain })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sc-note", children: [
        "\u652F\u6301\u7EA6\u675F\uFF08Draft-07 \u9AD8\u9891\u5B50\u96C6\uFF09\uFF1Atype / required / properties / items / enum / const / minimum\xB7maximum\uFF08\u542B exclusive\uFF09/ minLength\xB7maxLength / pattern / minItems\xB7maxItems / uniqueItems / additionalProperties / multipleOf / oneOf\xB7anyOf\xB7allOf\xB7not / format\uFF08date-time/email/uri/uuid/ipv4/hostname \u57FA\u7840\uFF09\u3002",
        /* @__PURE__ */ jsx("b", { children: "\u4E0D\u652F\u6301 $ref" }),
        "\uFF08\u5982\u5B9E\u62A5\u9519\u4E0D\u9759\u9ED8\u8DF3\u8FC7\uFF09\uFF1B\u4E0D\u652F\u6301 if/then/else \u7B49 2019-12+ \u5173\u952E\u5B57\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function SchemaCheckEntry(props) {
  return /* @__PURE__ */ jsx2(SchemaCheckPanel, { ...props });
}
export {
  SchemaCheckEntry as default
};
