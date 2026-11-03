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

// shared/yaml-core.js
var require_yaml_core = __commonJS({
  "shared/yaml-core.js"(exports, module) {
    "use strict";
    var MAX_SAFE = 9007199254740991;
    var BOOL11_WARN = /* @__PURE__ */ new Set();
    for (const w of ["yes", "no", "on", "off"]) {
      BOOL11_WARN.add(w);
      BOOL11_WARN.add(w[0].toUpperCase() + w.slice(1));
      BOOL11_WARN.add(w.toUpperCase());
    }
    var BOOL11_SINGLE = /* @__PURE__ */ new Set(["y", "Y", "n", "N"]);
    var SMART_QUOTE_RE = /[\u201C\u201D\u2018\u2019]/;
    var NULL_TOKENS = /* @__PURE__ */ new Set(["~"]);
    function findSmartQuote(s) {
      const m = SMART_QUOTE_RE.exec(s);
      return m ? m.index : -1;
    }
    function sexagesimalToInt(s) {
      const neg = s[0] === "-";
      const body = s.replace(/^[-+]/, "");
      const parts = body.split(":").map((p) => parseInt(p.replace(/_/g, ""), 10));
      let v = 0;
      for (const p of parts) v = v * 60 + p;
      return neg ? -v : v;
    }
    function octalValue(s) {
      const body = s.replace(/^[-+]/, "").replace(/_/g, "");
      if (/[^0-7]/.test(body)) return null;
      const v = parseInt(body, 8);
      return Number.isNaN(v) ? null : v;
    }
    function splitComment(content) {
      let q = null;
      for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (q) {
          if (q === '"' && c === "\\") {
            i++;
            continue;
          }
          if (q === "'" && c === "'" && content[i + 1] === "'") {
            i++;
            continue;
          }
          if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'") {
          q = c;
          continue;
        }
        if (c === "#" && (i === 0 || content[i - 1] === " " || content[i - 1] === "	")) {
          return { code: content.slice(0, i), comment: content.slice(i), openQuote: false };
        }
      }
      return { code: content, comment: "", openQuote: q };
    }
    function unquoteToken(tok) {
      const q = tok[0];
      if (tok.length >= 2 && tok.endsWith(q) && (q === '"' || q === "'")) {
        let inner = tok.slice(1, -1);
        inner = q === '"' ? inner.replace(/\\(["\\])/g, "$1") : inner.replace(/''/g, "'");
        return inner;
      }
      return tok;
    }
    function flowDepth(s) {
      let depth = 0;
      let q = null;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) {
          if (q === '"' && c === "\\") {
            i++;
            continue;
          }
          if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'") {
          q = c;
          continue;
        }
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") depth--;
      }
      return depth;
    }
    function flowMapKeys(s) {
      const keys = [];
      const re = /[{,]\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^:{}\[\],]+?))\s*:/g;
      let m;
      while ((m = re.exec(s)) !== null) keys.push({ name: m[1] !== void 0 ? m[1] : m[2] !== void 0 ? m[2] : m[3].trim(), col: m.index + 1 });
      return keys;
    }
    function jsonSafe2(value) {
      if (typeof value === "number") {
        if (value === Infinity) return ".inf";
        if (value === -Infinity) return "-.inf";
        if (Number.isNaN(value)) return ".nan";
        return value;
      }
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return value.map(jsonSafe2);
      if (value && typeof value === "object") {
        const out = {};
        for (const k of Object.keys(value)) out[k] = jsonSafe2(value[k]);
        return out;
      }
      return value;
    }
    function normalizeYamlError2(e) {
      const line = e && e.mark && typeof e.mark.line === "number" ? e.mark.line + 1 : null;
      const column = e && e.mark && typeof e.mark.column === "number" ? e.mark.column + 1 : null;
      const reason = e && e.reason || e && e.message && String(e.message).split("\n")[0] || "\u672A\u77E5\u89E3\u6790\u9519\u8BEF";
      let hint = "";
      if (/duplicated mapping key/.test(reason)) {
        hint = "\u91CD\u590D\u952E\uFF1A\u591A\u6570\u89E3\u6790\u5668\uFF08js-yaml / Go yaml.v3 strict\uFF09\u76F4\u63A5\u62D2\u7EDD\uFF0C\u53E6\u4E00\u4E9B\u9759\u9ED8\u8986\u76D6\u2014\u2014\u952E\u8BED\u4E49\u672A\u5B9A\u4E49\uFF0C\u6539\u952E\u540D\u6216\u5220\u6389\u540E\u8005\u3002";
      } else if (/tab characters/.test(reason)) {
        hint = "YAML \u7F29\u8FDB\u53EA\u5141\u8BB8\u7A7A\u683C\uFF1B\u628A\u7F29\u8FDB\u91CC\u7684 Tab \u6362\u6210\u7A7A\u683C\uFF08\u5E38\u89C1\u4E8E\u4ECE\u7EC8\u7AEF/\u7F16\u8F91\u5668\u590D\u5236\u7C98\u8D34\uFF09\u3002";
      } else if (/unidentified alias/.test(reason)) {
        hint = "\u522B\u540D *name \u9700\u8981\u5148\u5728\u540C\u4E00\u6587\u6863\u4E2D\u5B9A\u4E49\u540C\u540D\u951A\u70B9 &name\uFF08\u4E14\u5B9A\u4E49\u5728\u5F15\u7528\u4E4B\u524D\uFF09\u3002";
      } else if (/flow collection/.test(reason)) {
        hint = "flow \u96C6\u5408\uFF08{...} / [...]\uFF09\u6CA1\u6709\u95ED\u5408\uFF0C\u68C0\u67E5\u662F\u5426\u7F3A\u4E86\u6536\u5C3E\u62EC\u53F7\u3002";
      } else if (/could not find expected/.test(reason)) {
        hint = "\u6807\u91CF\u5F62\u6001\u4E0D\u5B8C\u6574\uFF1A\u5E38\u89C1\u4E8E\u7F3A\u7A7A\u683C\uFF08key:value\uFF09\u3001\u5F15\u53F7\u672A\u95ED\u5408\u6216\u7F29\u8FDB\u9519\u4F4D\u3002";
      }
      return { line, column, message: reason, hint };
    }
    function lintYaml2(text) {
      const issues = [];
      const seen = /* @__PURE__ */ new Set();
      const push = (rule, severity, line, col, message, hint) => {
        const key = `${rule}|${line}|${col}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({ rule, severity, line, col, message, hint: hint || "" });
      };
      const bom = typeof text === "string" && text.charCodeAt(0) === 65279;
      if (bom) push("bom", "info", 1, 1, "\u6587\u4EF6\u4EE5 BOM \u5F00\u5934", "\u591A\u6570\u5B9E\u73B0\u517C\u5BB9\uFF0C\u4F46\u89C4\u8303\u4E0D\u5EFA\u8BAE\uFF1B\u5EFA\u8BAE\u4FDD\u5B58\u4E3A UTF-8 \u65E0 BOM\u3002");
      const body = bom ? text.slice(1) : String(text == null ? "" : text);
      const lines = body.split(/\r\n|\r|\n/);
      const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(body).length : body.length;
      const anchors = [];
      const aliases = [];
      let merges = 0;
      let docIdx = 0;
      const anchorNamesByDoc = /* @__PURE__ */ new Map();
      anchorNamesByDoc.set(0, /* @__PURE__ */ new Set());
      let scopes = [];
      let quote = null;
      let block = null;
      let flowCarry = false;
      let firstContentLineOfDoc = 0;
      for (let li = 0; li < lines.length; li++) {
        let applyValue = function(tokenRaw, tokCol, lineNo2, keyCol, standalone) {
          const tok = tokenRaw.trim();
          if (tok === "") return;
          if (tok[0] === "{" && tok.endsWith("}")) {
            const fkeys = flowMapKeys(tok);
            const fseen = /* @__PURE__ */ new Set();
            for (const k of fkeys) {
              if (fseen.has(k.name)) push("dup-key", "error", lineNo2, tokCol + k.col - 1, `flow \u6620\u5C04\u5185\u91CD\u590D\u952E\u300C${k.name}\u300D`, "\u89E3\u6790\u5668\u4F1A\u76F4\u63A5\u629B\u9519\uFF08\u5B9E\u6D4B js-yaml\uFF1Aduplicated mapping key \u5E26\u884C\u5217\uFF09\u3002");
              fseen.add(k.name);
            }
            if (flowDepth(tok) > 0) flowCarry = true;
            return;
          }
          if (tok[0] === '"' || tok[0] === "'") {
            const q = tok[0];
            let i = 1;
            let closed = false;
            while (i < tok.length) {
              const c = tok[i];
              if (q === '"' && c === "\\") {
                i += 2;
                continue;
              }
              if (q === "'" && c === "'" && tok[i + 1] === "'") {
                i += 2;
                continue;
              }
              if (c === q) {
                closed = true;
                break;
              }
              i++;
            }
            if (!closed) {
              quote = q;
              return;
            }
            return;
          }
          if (/^[|>][0-9]*[+-]?$/.test(tok) || /^[|>][+-]?[0-9]*$/.test(tok)) {
            block = { parentIndent: keyCol !== null ? keyCol - 1 : tokCol - 2, contentIndent: null };
            return;
          }
          if (tok[0] === "`" || tok[0] === "@") {
            push("reserved-char", "error", lineNo2, tokCol, `\u300C${tok[0]}\u300D\u662F YAML \u4FDD\u7559\u5B57\u7B26\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u6807\u91CF\u5F00\u5934`, "\u52A0\u5F15\u53F7\u53EF\u8868\u8FBE\u5B57\u9762\u91CF\uFF08\u5982 '`cmd`'\uFF09\u3002");
            return;
          }
          if (tok[0] === "*") {
            const am = /^[\w.-]+/.exec(tok.slice(1));
            const name = am ? am[0] : tok.slice(1);
            const anchor = anchors.find((a) => a.doc === docIdx && a.name === name && (a.line < lineNo2 || a.line === lineNo2 && a.col < tokCol));
            aliases.push({ name, line: lineNo2, col: tokCol, doc: docIdx, resolved: !!anchor });
            if (!anchor) push("unresolved-alias", "error", lineNo2, tokCol, `\u522B\u540D *${name} \u6CA1\u6709\u524D\u7F6E\u540C\u540D\u951A\u70B9`, "\u89E3\u6790\u5668\u4F1A\u629B\u9519\uFF08\u5B9E\u6D4B js-yaml\uFF1Aunidentified alias \u5E26\u884C\u5217\uFF09\uFF1B\u786E\u8BA4\u951A\u70B9\u540D\u62FC\u5199\u4E0E\u987A\u5E8F\u3002");
            return;
          }
          if (tok[0] === "&") {
            const am = /^[\w.-]+/.exec(tok.slice(1));
            const name = am ? am[0] : tok.slice(1);
            const set2 = anchorNamesByDoc.get(docIdx);
            if (set2.has(name)) push("anchor-dup", "warn", lineNo2, tokCol, `\u951A\u70B9 &${name} \u5728\u540C\u4E00\u6587\u6863\u5185\u91CD\u590D\u5B9A\u4E49`, "\u5F15\u7528\u89E3\u6790\u5230\u6700\u8FD1\u4E00\u4E2A\u5B9A\u4E49\uFF1B\u91CD\u540D\u6613\u8BEF\u8BFB\uFF0C\u5EFA\u8BAE\u6539\u540D\u3002");
            else set2.add(name);
            anchors.push({ name, line: lineNo2, col: tokCol, doc: docIdx });
            const remainder = tok.slice(1 + name.length).trim();
            if (remainder !== "") applyValue(remainder, tokCol + 1 + name.length, lineNo2, keyCol, standalone);
            return;
          }
          if (tok[0] === "!") return;
          if (BOOL11_WARN.has(tok)) {
            push("bool-lookalike", "warn", lineNo2, tokCol, `\u300C${tok}\u300D\u5728\u672C\u5DE5\u5177\uFF08YAML 1.2 core\uFF09\u89E3\u6790\u4E3A\u5B57\u7B26\u4E32 "${tok}"\uFF0C\u4F46 PyYAML / Go yaml.v2 / Ansible / kubectl \u7B49 YAML 1.1 \u5B9E\u73B0\u89E3\u6790\u4E3A\u5E03\u5C14 ${tok.toLowerCase() === "no" || tok.toLowerCase() === "off" ? "false" : "true"}`, "\u8FD9\u662F\u300CNorway problem\u300D\uFF1A\u540C\u4E00\u4EFD\u6587\u4EF6\u5728\u4E0D\u540C\u5B9E\u73B0\u91CC\u7C7B\u578B\u76F8\u53CD\u3002\u8981\u56FA\u5B9A\u4E3A\u5B57\u7B26\u4E32\u8BF7\u52A0\u5F15\u53F7\uFF1B\u8981\u56FA\u5B9A\u4E3A\u5E03\u5C14\u8BF7\u5199 true/false\u3002");
            return;
          }
          if (BOOL11_SINGLE.has(tok)) {
            push("bool-single", "info", lineNo2, tokCol, `\u5355\u5B57\u6BCD\u300C${tok}\u300D\u5728 YAML 1.1 \u89C4\u8303\u91CC\u662F\u5E03\u5C14\uFF0C\u4F46 PyYAML 5.1+ \u5DF2\u5F03\u7528\u5355\u5B57\u6BCD\u5F62\u5F0F\uFF08\u6309\u5B57\u7B26\u4E32\uFF09`, "\u591A\u6570\u73B0\u4EE3\u5B9E\u73B0\u6309\u5B57\u7B26\u4E32\u5904\u7406\uFF1B\u8DE8\u5B9E\u73B0\u7A33\u5B9A\u8BF7\u52A0\u5F15\u53F7\u6216\u5199\u5168\u8BCD\u3002");
            return;
          }
          if (/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+$/.test(tok)) {
            const v = sexagesimalToInt(tok);
            push("sexagesimal", "warn", lineNo2, tokCol, `\u300C${tok}\u300D\u662F YAML 1.1 \u516D\u5341\u8FDB\u5236\u6570\u5B57\uFF1APyYAML \u7B49\u89E3\u6790\u4E3A\u6574\u6570 ${v}\uFF0C\u672C\u5DE5\u5177\uFF081.2 core\uFF09\u89E3\u6790\u4E3A\u5B57\u7B26\u4E32`, "\u65F6\u95F4/\u6BD4\u5206\u7C7B\u5B57\u7B26\u4E32\u52A1\u5FC5\u52A0\u5F15\u53F7\u2014\u2014\u65E7\u5B9E\u73B0\u91CC 12:34:56 \u4F1A\u9759\u9ED8\u53D8\u6210 45296\u3002");
            return;
          }
          if (/^[-+]?0[0-9_]+$/.test(tok)) {
            const oct = octalValue(tok);
            push("leading-zero", "warn", lineNo2, tokCol, `\u524D\u5BFC\u96F6\u6570\u5B57\u300C${tok}\u300D\uFF1AYAML 1.1\uFF08PyYAML\uFF09\u6309\u516B\u8FDB\u5236\u89E3\u6790\u4E3A ${oct === null ? "\uFF08\u542B 8/9\uFF0C\u516B\u8FDB\u5236\u975E\u6CD5\uFF0C\u90E8\u5206\u5B9E\u73B0\u62A5\u9519\uFF09" : oct}\uFF0C\u672C\u5DE5\u5177\uFF081.2 core\uFF09\u6309\u5341\u8FDB\u5236 ${parseInt(tok.replace(/^[-+]/, "").replace(/_/g, ""), 10)} \u89E3\u6790`, "\u6587\u4EF6\u6743\u9650\uFF080755\uFF09\u3001\u533A\u53F7\u3001\u7F16\u53F7\u7C7B\u503C\u52A1\u5FC5\u52A0\u5F15\u53F7\u3002");
            return;
          }
          if (/^[-+]?[0-9][0-9_]*\.[0-9]*0$/.test(tok)) {
            push("float-form", "warn", lineNo2, tokCol, `\u300C${tok}\u300D\u89E3\u6790\u4E3A\u6570\u503C ${parseFloat(tok.replace(/_/g, ""))}\u2014\u2014\u5C3E\u96F6\u4E22\u5931\uFF081.10 \u2192 1.1\uFF09`, "\u7248\u672C\u53F7\u3001\u91D1\u989D\u3001\u7F16\u53F7\u8BF7\u52A0\u5F15\u53F7\u4FDD\u7559\u4E66\u5199\u5F62\u6001\u3002");
            return;
          }
          if (/^[-+]?[0-9][0-9_]*$/.test(tok)) {
            const digits = tok.replace(/[-+_]/g, "");
            if (digits.length > 15 || Number(tok.replace(/_/g, "")) > MAX_SAFE) {
              push("big-int", "warn", lineNo2, tokCol, `\u6574\u6570\u300C${tok}\u300D\u8D85\u8FC7 JS \u5B89\u5168\u6574\u6570 2^53-1\uFF0Cjs-yaml \u6309\u53CC\u7CBE\u5EA6\u6D6E\u70B9\u89E3\u6790\u5FC5\u7136\u4E22\u7CBE\u5EA6\uFF08\u5B9E\u6D4B 9007199254740993 \u2192 9007199254740992\uFF09`, "\u96EA\u82B1 ID / \u8BA2\u5355\u53F7 / \u7EB3\u79D2\u65F6\u95F4\u6233\u8BF7\u52A0\u5F15\u53F7\u6309\u5B57\u7B26\u4E32\u4F20\u8F93\u3002");
              return;
            }
          }
          if (/^[-+]?[0-9][0-9_]*(\.[0-9_]+)?[eE][-+]?[0-9]+$/.test(tok)) {
            push("sci-note", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u88AB\u89E3\u6790\u4E3A\u6570\u503C ${Number(tok.replace(/_/g, ""))}\uFF08\u79D1\u5B66\u8BA1\u6570\u6CD5\u751F\u6548\uFF09`, "\u8981\u4FDD\u7559\u4E66\u5199\u5F62\u6001\u8BF7\u52A0\u5F15\u53F7\u3002");
            return;
          }
          if (/^[-+]?\.(inf|Inf|INF)$/.test(tok) || /^\.(nan|NaN|NAN)$/.test(tok)) {
            push("special-float", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u89E3\u6790\u4E3A\u975E\u6709\u9650\u6D6E\u70B9\u6570\uFF08${tok.endsWith("nan") || tok.endsWith("NaN") || tok.endsWith("NAN") ? "NaN" : tok[0] === "-" ? "-Infinity" : "Infinity"}\uFF09`, "JSON \u6CA1\u6709\u5BF9\u5E94\u5B57\u9762\u91CF\uFF0C\u5E8F\u5217\u5316\u4F1A\u53D8 null\uFF08\u672C\u5DE5\u5177\u9884\u89C8\u5DF2\u6309\u5B57\u7B26\u4E32\u5448\u73B0\uFF09\u3002");
            return;
          }
          if (/^[-+]?\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.test(tok)) {
            push("timestamp", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u88AB\u8BC6\u522B\u4E3A\u65F6\u95F4\u6233\uFF1Ajs-yaml \u9ED8\u8BA4\u89E3\u6790\u4E3A Date \u5BF9\u8C61\uFF08JSON \u5E8F\u5217\u5316\u6210 ISO \u5B57\u7B26\u4E32\uFF09`, "\u7F16\u53F7/\u7248\u672C\u7C7B\u300C\u957F\u5F97\u50CF\u65E5\u671F\u300D\u7684\u503C\uFF08\u5982 2024-01-02\uFF09\u52A1\u5FC5\u52A0\u5F15\u53F7\uFF0C\u5426\u5219\u7C7B\u578B\u6F02\u79FB\u3002");
            return;
          }
          if (NULL_TOKENS.has(tok)) {
            push("null-tilde", "info", lineNo2, tokCol, "\u300C~\u300D\u89E3\u6790\u4E3A null", "\u8981\u5B57\u9762\u6CE2\u6D6A\u7EBF\u6216\u7A7A\u4E32\u8BF7\u52A0\u5F15\u53F7\u3002");
            return;
          }
          if (standalone && /^[A-Za-z0-9_.\-/]{1,64}:(?![/\s])\S+$/.test(tok)) {
            push("colon-nospace", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u662F\u5355\u4E2A\u5B57\u7B26\u4E32\u6807\u91CF\uFF0C\u4E0D\u662F\u952E\u503C\u5BF9`, "\u82E5\u60F3\u8868\u8FBE\u6620\u5C04\u5FC5\u987B\u5199\u6210\u300Ckey: value\u300D\uFF08\u5192\u53F7\u540E\u6709\u7A7A\u683C\uFF09\uFF1B\u82E5\u672C\u610F\u5C31\u662F host:port \u5F62\u6001\u5B57\u7B26\u4E32\uFF0C\u5F53\u524D\u89E3\u6790\u5408\u6CD5\u3002");
          }
        };
        const lineNo = li + 1;
        const raw = lines[li];
        if (block) {
          if (/^\s*$/.test(raw)) continue;
          const ind = (/(^[ \t]*)/.exec(raw) || ["", ""])[1].length;
          if (block.contentIndent === null) {
            if (ind > block.parentIndent) {
              block.contentIndent = ind;
              continue;
            }
            block = null;
          } else if (ind >= block.contentIndent) {
            continue;
          } else {
            block = null;
          }
        }
        if (quote) {
          let i = 0;
          let closed = -1;
          while (i < raw.length) {
            const c = raw[i];
            if (quote === '"' && c === "\\") {
              i += 2;
              continue;
            }
            if (quote === "'" && c === "'" && raw[i + 1] === "'") {
              i += 2;
              continue;
            }
            if (c === quote) {
              closed = i;
              break;
            }
            i++;
          }
          if (closed === -1) continue;
          quote = null;
          const restLine = raw.slice(closed + 1);
          const sq = findSmartQuote(restLine);
          if (sq !== -1) push("smart-quote", "error", lineNo, closed + 2 + sq, "\u667A\u80FD\u5F15\u53F7\uFF08\u201C\u201D\u2018\u2019\uFF09\u4E0D\u662F YAML \u5F15\u53F7", "\u5B83\u4EEC\u4F1A\u6210\u4E3A\u5B57\u7B26\u4E32\u6570\u636E\u7684\u4E00\u90E8\u5206\uFF1B\u672C\u610F\u662F\u52A0\u5F15\u53F7\u8BF7\u7528 ASCII \u534A\u89D2\u5F15\u53F7\u3002");
          continue;
        }
        if (flowCarry) {
          const { code: code2 } = splitComment(raw);
          const sq = findSmartQuote(code2);
          if (sq !== -1) push("smart-quote", "error", lineNo, sq + 1, "\u667A\u80FD\u5F15\u53F7\uFF08\u201C\u201D\u2018\u2019\uFF09\u4E0D\u662F YAML \u5F15\u53F7", "\u5B83\u4EEC\u4F1A\u6210\u4E3A\u5B57\u7B26\u4E32\u6570\u636E\u7684\u4E00\u90E8\u5206\uFF1B\u672C\u610F\u662F\u52A0\u5F15\u53F7\u8BF7\u7528 ASCII \u534A\u89D2\u5F15\u53F7\u3002");
          if (flowDepth(code2) <= 0) flowCarry = false;
          continue;
        }
        const ws = (/(^[ \t]*)/.exec(raw) || ["", ""])[1];
        const tabIdx = ws.indexOf("	");
        const trimmedFull = raw.trim();
        if (trimmedFull !== "" && tabIdx !== -1) {
          push("tab-indent", "error", lineNo, tabIdx + 1, "\u7F29\u8FDB\u5305\u542B\u5236\u8868\u7B26 Tab", "YAML \u7981\u6B62 Tab \u7F29\u8FDB\uFF08\u53EA\u5141\u8BB8\u7A7A\u683C\uFF09\uFF1B\u7F16\u8F91\u5668\u300CTab \u8F6C\u7A7A\u683C\u300D\u6216\u66FF\u6362\u7C98\u8D34\u6B8B\u7559\u3002");
        }
        if (trimmedFull === "" || trimmedFull.startsWith("#")) {
          if (trimmedFull !== "") firstContentLineOfDoc = firstContentLineOfDoc;
          continue;
        }
        const contentStart = raw.length - raw.replace(/^\s+/, "").length;
        const content = trimmedFull;
        if (content === "---" || content.startsWith("--- ")) {
          docIdx++;
          anchorNamesByDoc.set(docIdx, /* @__PURE__ */ new Set());
          scopes = [];
          firstContentLineOfDoc = 0;
          continue;
        }
        if (content === "...") continue;
        const { code, comment } = splitComment(content);
        if (code.trim() === "") {
          continue;
        }
        if (firstContentLineOfDoc === 0) firstContentLineOfDoc = lineNo;
        const sqIdx = findSmartQuote(code);
        if (sqIdx !== -1) {
          push("smart-quote", "error", lineNo, contentStart + sqIdx + 1, "\u667A\u80FD\u5F15\u53F7\uFF08\u201C\u201D\u2018\u2019\uFF09\u4E0D\u662F YAML \u5F15\u53F7", '\u5B83\u4EEC\u4F1A\u6210\u4E3A\u5B57\u7B26\u4E32\u6570\u636E\u7684\u4E00\u90E8\u5206\uFF08\u5B9E\u6D4B js-yaml\uFF1Aa: \u201Cx\u201D \u2192 "\u201Cx\u201D"\uFF09\uFF1B\u672C\u610F\u662F\u52A0\u5F15\u53F7\u8BF7\u7528 ASCII \u534A\u89D2\u5F15\u53F7\u3002');
        }
        if (code[0] === "%") {
          if (!/^%(YAML|TAG)\b/.test(code) || firstContentLineOfDoc !== lineNo) {
            push("percent-middoc", "error", lineNo, contentStart + 1, "\u300C%\u300D\u5F00\u5934\u7684\u5185\u5BB9\u53EA\u5728\u6587\u6863\u9996\u884C\u4F5C\u4E3A\u6307\u4EE4\uFF08%YAML/%TAG\uFF09\u5408\u6CD5", "\u666E\u901A\u6570\u636E\u4EE5 % \u5F00\u5934\u5FC5\u987B\u52A0\u5F15\u53F7\u3002");
          }
          continue;
        }
        let rest = code;
        let colBase = contentStart;
        let dashCount = 0;
        for (; ; ) {
          const m = /^(-\s+|-\s*$)/.exec(rest);
          if (!m) break;
          if (m[0] === "-" && rest.trim() === "-") {
            rest = "";
            break;
          }
          colBase += m[0].length;
          rest = rest.slice(m[0].length);
          dashCount++;
          if (m[0].trimEnd() === "-" && rest.trim() === "") {
            rest = "";
            break;
          }
        }
        if (rest.trim() === "") continue;
        const keyRe = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^:\s#"'][^:#]*?)\s*:(?:\s+|$)/;
        const km = keyRe.exec(rest);
        if (km) {
          const keyTok = km[1];
          const keyQuoted = keyTok[0] === '"' || keyTok[0] === "'";
          const keyName = keyQuoted ? unquoteToken(keyTok) : keyTok.trim();
          const keyCol = colBase + 1;
          const valuePart = rest.slice(km[0].length).replace(/^[ \t]+/, "");
          const valueCol = colBase + km[0].length + (rest.slice(km[0].length).length - rest.slice(km[0].length).replace(/^[ \t]+/, "").length) + 1;
          const popGE = dashCount > 0 ? keyCol : keyCol + 1;
          while (scopes.length && scopes[scopes.length - 1].indent >= popGE) scopes.pop();
          let top = scopes[scopes.length - 1];
          if (!top || top.indent !== keyCol) {
            top = { indent: keyCol, keys: /* @__PURE__ */ new Set() };
            scopes.push(top);
          }
          if (!keyQuoted && top.keys.has(keyName)) {
            push("dup-key", "error", lineNo, keyCol, `\u91CD\u590D\u952E\u300C${keyName}\u300D\uFF08\u540C\u5C42\u5DF2\u51FA\u73B0\u8FC7\uFF09`, "\u591A\u6570\u89E3\u6790\u5668\u62D2\u7EDD\u6216\u9759\u9ED8\u8986\u76D6\uFF0C\u952E\u8BED\u4E49\u672A\u5B9A\u4E49\uFF1B\u6539\u952E\u540D\u6216\u5220\u6389\u540E\u8005\u3002");
          }
          top.keys.add(keyName);
          if (keyName === "<<") {
            merges++;
            push("merge-key", "info", lineNo, keyCol, "\u5408\u5E76\u952E\u300C<<\u300D\uFF1A\u628A\u951A\u70B9\u6620\u5C04\u7684\u952E\u5E76\u5165\u5F53\u524D\u6620\u5C04\uFF08\u672C\u6620\u5C04\u540C\u540D\u952E\u4F18\u5148\uFF09", "\u7B49\u4EF7\u5C55\u5F00\u7531\u89E3\u6790\u5668\u5B8C\u6210\uFF1B\u6539\u7528\u663E\u5F0F\u952E\u53EF\u8BFB\u6027\u66F4\u597D\u3002js-yaml DEFAULT_SCHEMA \u652F\u6301\u8BE5\u8BED\u4E49\uFF08\u5B9E\u6D4B\uFF09\u3002");
          }
          if (valuePart === "") {
            push("empty-value", "info", lineNo, keyCol, `\u952E\u300C${keyName}\u300D\u7684\u503C\u4E3A\u7A7A \u2192 \u89E3\u6790\u4E3A null`, comment ? "\u5192\u53F7\u540E\u76F4\u63A5\u8DDF\u6CE8\u91CA\u4E5F\u662F null\uFF1B\u8981\u7A7A\u5B57\u7B26\u4E32\u8BF7\u5199 key: ''\u3002" : `\u8981\u7A7A\u5B57\u7B26\u4E32\u8BF7\u5199 key: ''\uFF1Bnull \u4E0E\u7A7A\u4E32\u5728\u4E0B\u6E38\u5224\u65AD\uFF08if key: / != ""\uFF09\u91CC\u884C\u4E3A\u4E0D\u540C\u3002`);
          } else {
            if (comment) {
              const vTrim = valuePart.trim();
              if (vTrim[0] !== '"' && vTrim[0] !== "'") {
                const hashOffset = content.length - comment.length;
                push("comment-swallow", "info", lineNo, contentStart + hashOffset + 1, `\u300C#\u300D\u4ECE\u8FD9\u91CC\u5F00\u59CB\u662F\u6CE8\u91CA\uFF1A\u6CE8\u91CA\u5185\u5BB9\u4E0D\u4F1A\u8FDB\u5165\u6570\u636E\uFF08\u503C = ${vTrim}\uFF09`, '\u8981\u4FDD\u7559\u503C\u4E2D\u7684 #\uFF0C\u8BF7\u7ED9\u503C\u52A0\u5F15\u53F7\uFF08\u5B9E\u6D4B a: "x # y" \u2192 "x # y"\uFF09\u3002');
              }
            }
            applyValue(valuePart, valueCol, lineNo, keyCol, false);
          }
          continue;
        }
        const token = rest.trim();
        const tokenCol = colBase + (rest.length - rest.replace(/^\s+/, "").length) + 1;
        if (token[0] === "{" || token[0] === "[") {
          const singleLine = token[0] === "{" && token.endsWith("}");
          if (singleLine) {
            const fkeys = flowMapKeys(token);
            const fseen = /* @__PURE__ */ new Map();
            for (const k of fkeys) {
              if (fseen.has(k.name)) push("dup-key", "error", lineNo, tokenCol + k.col - 1, `flow \u6620\u5C04\u5185\u91CD\u590D\u952E\u300C${k.name}\u300D`, "\u89E3\u6790\u5668\u4F1A\u76F4\u63A5\u629B\u9519\uFF08\u5B9E\u6D4B js-yaml\uFF1Aduplicated mapping key \u5E26\u884C\u5217\uFF09\u3002");
              fseen.set(k.name, true);
            }
          }
          if (flowDepth(token) > 0) flowCarry = true;
          continue;
        }
        applyValue(token, tokenCol, lineNo, null, true);
      }
      for (const a of aliases) {
        const ok = anchors.some((x) => x.doc === a.doc && x.name === a.name && (x.line < a.line || x.line === a.line && x.col < a.col));
        a.resolved = ok;
      }
      issues.sort((x, y) => x.line - y.line || x.col - y.col);
      return {
        issues,
        anchors,
        aliases,
        merges,
        docs: docIdx + 1,
        stats: { lines: lines.length, bytes }
      };
    }
    module.exports = { lintYaml: lintYaml2, jsonSafe: jsonSafe2, normalizeYamlError: normalizeYamlError2, sexagesimalToInt, octalValue };
  }
});

// src/Panel.tsx
var core2 = __toESM(require_yaml_core());
import { useMemo, useState } from "react";

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      destination[key] = source[key];
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    if (keyNode === "__proto__") {
      Object.defineProperty(_result, keyNode, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: valueNode
      });
    } else {
      _result[keyNode] = valueNode;
    }
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  }();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  }();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var Type = type;
var Schema = schema;
var FAILSAFE_SCHEMA = failsafe;
var JSON_SCHEMA = json;
var CORE_SCHEMA = core;
var DEFAULT_SCHEMA = _default;
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var YAMLException = exception;
var types = {
  binary,
  float,
  map,
  null: _null,
  pairs,
  set,
  timestamp,
  bool,
  int,
  merge,
  omap,
  seq,
  str
};
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");
var jsYaml = {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
};
var js_yaml_default = jsYaml;

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.yl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.yl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.yl-head b{font-size:13px}
.yl-head .sub{color:#5C6678;font-size:11px}
.yl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.yl-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.yl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.yl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.yl-chip.on{color:#4fd1a0;border-color:#4fd1a0}
.yl-chip.sample{border-style:dashed}
.yl-gap{flex:1}
.yl-area{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.7 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none;resize:vertical}
.yl-area:focus{border-color:#4fd1a0}
.yl-line{font-size:12px;color:#c9cede}
.yl-line b{color:#4fd1a0}
.yl-line .muted,.muted{color:#5C6678}
.yl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.yl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.yl-pre{margin:0;padding:10px 12px;font:11.5px/1.6 ui-monospace,Consolas,monospace;color:#c9cede;white-space:pre-wrap;word-break:break-all;max-height:420px;overflow:auto}
.yl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.yl-err .ttl{font-weight:600;margin-bottom:4px}
.yl-err .hint{color:#8B94A9;margin-top:4px;font-size:11.5px}
.yl-empty{border:1px dashed #2b3348;border-radius:8px;padding:10px 13px;color:#8B94A9;font-size:12px}
.yl-issue{border:1px solid #1c2333;border-left:3px solid #2b3348;border-radius:8px;padding:8px 11px}
.yl-issue.sev-error{border-left-color:#e03131}
.yl-issue.sev-warn{border-left-color:#f08c00}
.yl-issue.sev-info{border-left-color:#3b5bdb}
.yl-issue .row1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.yl-issue .badge{font-size:10.5px;border:1px solid #2b3348;border-radius:5px;padding:1px 6px}
.yl-issue.sev-error .badge{color:#f1a0a0;border-color:#e03131}
.yl-issue.sev-warn .badge{color:#f3b377;border-color:#f08c00}
.yl-issue.sev-info .badge{color:#8B94A9;border-color:#3b5bdb}
.yl-issue .pos{font:11px ui-monospace,Consolas,monospace;color:#5C6678}
.yl-issue .rule{font:11px ui-monospace,Consolas,monospace;color:#4fd1a0}
.yl-issue .msg{font-size:12px;color:#c9cede;margin-top:3px}
.yl-issue .hint{font-size:11.5px;color:#5C6678;margin-top:2px}
.sev-err{color:#f1a0a0}
.sev-warn{color:#f3b377}
.sev-info{color:#8B94A9}
.yl-opt{display:flex;align-items:center;gap:4px;color:#8B94A9;font-size:11px}
.yl-opt select{background:#161c2a;color:#E6EAF2;border:1px solid #2b3348;border-radius:5px;font-size:11px;padding:1px 4px}
`;
var SAMPLE_NORWAY = `# Norway problem\uFF1A\u540C\u4E00\u4EFD\u6587\u4EF6\u5728\u4E0D\u540C\u5B9E\u73B0\u91CC\u7C7B\u578B\u76F8\u53CD
services:
  web:
    enabled: no        # js-yaml(1.2): "no" \u5B57\u7B26\u4E32 / PyYAML(1.1): false
    debug: on          # 1.1 \u5B9E\u73B0\u89E3\u6790\u4E3A true
    replicas: 3
    fallback: "no"     # \u52A0\u5F15\u53F7\u624D\u662F\u7A33\u5B9A\u5B57\u7B26\u4E32`;
var SAMPLE_NUMBERS = `# \u6570\u5B57\u5F62\u6001\u9677\u9631\uFF1A\u524D\u5BFC\u96F6 / \u7248\u672C\u53F7\u584C\u9677 / \u516D\u5341\u8FDB\u5236
zip: 02134            # PyYAML \u516B\u8FDB\u5236 \u2192 1116\uFF1Bjs-yaml \u5341\u8FDB\u5236 \u2192 2134
chmod: 0755           # \u6587\u4EF6\u6743\u9650\u5FC5\u987B\u52A0\u5F15\u53F7
version: 1.10         # \u89E3\u6790\u6210\u6570\u503C 1.1\uFF0C\u5C3E\u96F6\u4E22\u5931
duration: 12:34:56    # PyYAML \u89E3\u6790\u4E3A\u6574\u6570 45296
big_id: 9007199254740993   # \u8D85 2^53\uFF0Cjs-yaml \u2192 9007199254740992`;
var SAMPLE_TS = `# \u65F6\u95F4\u6233\u6F02\u79FB\uFF1A\u957F\u5F97\u50CF\u65E5\u671F\u7684\u503C\u4F1A\u88AB\u89E3\u6790\u6210 Date
build: 2024-01-02
released: 2024-01-02T03:04:05Z
build_code: "2024-01-02"   # \u52A0\u5F15\u53F7\u4FDD\u6301\u5B57\u7B26\u4E32`;
var SAMPLE_ANCHORS = `# \u951A\u70B9\u4E0E\u5408\u5E76\u952E
defaults: &d
  image: nginx
  restart: always
web:
  <<: *d
  ports: [80]
worker:
  <<: *d
  command: run
broken: *missing      # \u672A\u5B9A\u4E49\u522B\u540D \u2192 \u89E3\u6790\u62A5\u9519`;
var SAMPLE_WRITING = `# \u4E66\u5199\u9677\u9631\uFF1ATab / \u667A\u80FD\u5F15\u53F7 / \u6CE8\u91CA\u541E\u503C / \u7A7A\u503C
good: value # \u8FD9\u91CC\u5F00\u59CB\u662F\u6CE8\u91CA\uFF0C"\u5B83\u4E0D\u662F\u6CE8\u91CA" \u8FD9\u6BB5\u4E0D\u4F1A\u8FDB\u5165\u6570\u636E
empty:
tilde: ~
quoted: "x # y"       # \u5F15\u53F7\u5185\u7684 # \u5B89\u5168
url: http://x#frag    # \u65E0\u7A7A\u683C\u524D\u7F00\u7684 # \u4E5F\u5B89\u5168`;
var SAMPLES = [
  { label: "Norway problem", text: SAMPLE_NORWAY },
  { label: "\u6570\u5B57\u5F62\u6001", text: SAMPLE_NUMBERS },
  { label: "\u65F6\u95F4\u6233\u6F02\u79FB", text: SAMPLE_TS },
  { label: "\u951A\u70B9\u5408\u5E76\u952E", text: SAMPLE_ANCHORS },
  { label: "\u4E66\u5199\u9677\u9631", text: SAMPLE_WRITING }
];
var SEV_LABEL = { error: "\u9519\u8BEF", warn: "\u8B66\u544A", info: "\u63D0\u793A" };
function tryParse(text) {
  if (String(text).trim() === "") return { ok: true, docs: [], empty: true };
  try {
    const docs = js_yaml_default.loadAll(text);
    return { ok: true, docs: docs.map((d) => core2.jsonSafe(d)) };
  } catch (e) {
    return { ok: false, error: core2.normalizeYamlError(e) };
  }
}
function jsonPreview(value, limit = 4e3) {
  let s;
  try {
    s = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    s = String(value);
  }
  if (s.length > limit) s = s.slice(0, limit) + `
\u2026\uFF08\u5DF2\u622A\u65AD\uFF0C\u539F\u6587 ${s.length} \u5B57\u7B26\uFF09`;
  return s;
}
function YamlLensPanel(props) {
  const [text, setText] = useState(props.initialText !== void 0 ? props.initialText : SAMPLE_NORWAY);
  const [view, setView] = useState(props.initialView !== void 0 ? props.initialView : "parse");
  const [dir, setDir] = useState("y2j");
  const [indent, setIndent] = useState(2);
  const [sortKeys, setSortKeys] = useState(false);
  const scan = useMemo(() => core2.lintYaml(text), [text]);
  const parsed = useMemo(() => tryParse(text), [text]);
  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const i of scan.issues) {
      const key = i.severity;
      if (key === "error" || key === "warn" || key === "info") c[key]++;
    }
    return c;
  }, [scan]);
  const convert = useMemo(() => {
    if (dir === "y2j") {
      const r = parsed;
      if (!r.ok) return { ok: false, text: "", error: r.error };
      if (r.empty) return { ok: false, text: "", error: { line: null, column: null, message: "\u7A7A\u6587\u672C\u6CA1\u6709\u53EF\u8F6C\u6362\u7684\u6587\u6863", hint: "" } };
      const value = r.docs.length === 1 ? r.docs[0] : r.docs;
      const note = r.docs.length === 1 ? "" : `
# \u6CE8\uFF1A${r.docs.length} \u4E2A\u6587\u6863\u5DF2\u8F93\u51FA\u4E3A JSON \u6570\u7EC4\uFF08\u6309\u6587\u6863\u987A\u5E8F\uFF09`;
      return { ok: true, text: JSON.stringify(value, null, indent) + note, error: null };
    }
    try {
      const value = JSON.parse(text);
      const out = js_yaml_default.dump(value, { indent, sortKeys, lineWidth: -1, noRefs: true });
      return { ok: true, text: out, error: null };
    } catch (e) {
      return { ok: false, text: "", error: { line: null, column: null, message: `\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${e?.message ?? String(e)}`, hint: "" } };
    }
  }, [dir, parsed, text, indent, sortKeys]);
  const invParts = [];
  if (scan.anchors.length) invParts.push(`\u951A\u70B9 ${scan.anchors.length}`);
  if (scan.aliases.length) invParts.push(`\u522B\u540D ${scan.aliases.length}\uFF08${scan.aliases.filter((a) => a.resolved).length} \u5DF2\u89E3\u6790\uFF09`);
  if (scan.merges > 0) invParts.push(`\u5408\u5E76\u952E \xD7${scan.merges}`);
  return /* @__PURE__ */ jsxs("div", { className: "yl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "yl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "YAML \u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u89E3\u6790\u9884\u89C8 \xB7 \u5751\u68C0\u6D4B \xB7 JSON \u4E92\u8F6C\uFF08js-yaml 4.1.0\uFF0C\u7EAF\u672C\u5730\u96F6\u5916\u8054\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "yl-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "yl-chips", children: [
        ["parse", "lint", "convert"].map((v) => /* @__PURE__ */ jsx("button", { className: "yl-chip" + (view === v ? " on" : ""), onClick: () => setView(v), children: v === "parse" ? "\u89E3\u6790\u9884\u89C8" : v === "lint" ? `\u5751\u68C0\u6D4B${scan.issues.length ? ` (${scan.issues.length})` : ""}` : "\u8F6C\u6362" }, v)),
        /* @__PURE__ */ jsx("span", { className: "yl-gap" }),
        SAMPLES.map((s) => /* @__PURE__ */ jsx("button", { className: "yl-chip sample", onClick: () => setText(s.text), children: s.label }, s.label))
      ] }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "yl-area",
          spellCheck: false,
          value: text,
          onChange: (e) => setText(e.target.value),
          placeholder: "\u7C98\u8D34 YAML \u6587\u672C\u2026\n\u652F\u6301\u591A\u6587\u6863\uFF08--- \u5206\u9694\uFF09",
          rows: 10
        }
      ),
      view === "parse" && /* @__PURE__ */ jsx("div", { className: "yl-section", "data-view": "parse", children: parsed.ok ? parsed.empty ? /* @__PURE__ */ jsx("div", { className: "yl-empty", children: "\u7A7A\u6587\u672C\uFF1A\u65E0\u6587\u6863\u3002" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "yl-line", children: [
          "\u89E3\u6790\u6210\u529F\uFF1A",
          /* @__PURE__ */ jsx("b", { children: parsed.docs.length }),
          " \u4E2A\u6587\u6863\uFF08",
          scan.stats.lines,
          " \u884C / ",
          scan.stats.bytes,
          " \u5B57\u8282\uFF09",
          invParts.length > 0 && /* @__PURE__ */ jsxs("span", { className: "muted", children: [
            " \uFF5C ",
            invParts.join(" \uFF5C ")
          ] })
        ] }),
        scan.aliases.some((a) => !a.resolved) && /* @__PURE__ */ jsxs("div", { className: "yl-err", children: [
          "\u5B58\u5728\u672A\u89E3\u6790\u522B\u540D\uFF1A",
          scan.aliases.filter((a) => !a.resolved).map((a) => `*${a.name}(${a.line}:${a.col})`).join(" "),
          "\u2014\u2014\u89C1\u5751\u68C0\u6D4B\u89C6\u56FE\u3002"
        ] }),
        parsed.docs.map((d, i) => /* @__PURE__ */ jsxs("div", { className: "yl-card", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            "\u6587\u6863 ",
            i + 1,
            parsed.docs.length === 1 ? "" : `\uFF08\u5171 ${parsed.docs.length} \u4E2A\uFF09`
          ] }),
          /* @__PURE__ */ jsx("pre", { className: "yl-pre", children: jsonPreview(d) })
        ] }, i))
      ] }) : /* @__PURE__ */ jsxs("div", { className: "yl-err", children: [
        /* @__PURE__ */ jsxs("div", { className: "ttl", children: [
          "\u89E3\u6790\u5931\u8D25",
          parsed.error.line ? `\uFF1A\u7B2C ${parsed.error.line} \u884C\u7B2C ${parsed.error.column} \u5217` : ""
        ] }),
        /* @__PURE__ */ jsx("div", { children: parsed.error.message }),
        parsed.error.hint && /* @__PURE__ */ jsx("div", { className: "hint", children: parsed.error.hint })
      ] }) }),
      view === "lint" && /* @__PURE__ */ jsxs("div", { className: "yl-section", "data-view": "lint", children: [
        /* @__PURE__ */ jsxs("div", { className: "yl-line", children: [
          "\u9759\u6001\u626B\u63CF ",
          /* @__PURE__ */ jsx("b", { children: scan.stats.lines }),
          " \u884C \u2014\u2014",
          /* @__PURE__ */ jsxs("span", { className: "sev-err", children: [
            " \u9519\u8BEF ",
            counts.error
          ] }),
          " \xB7",
          /* @__PURE__ */ jsxs("span", { className: "sev-warn", children: [
            " \u8B66\u544A ",
            counts.warn
          ] }),
          " \xB7",
          /* @__PURE__ */ jsxs("span", { className: "sev-info", children: [
            " \u63D0\u793A ",
            counts.info
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "yl-line muted", children: [
          "\u89E3\u6790\u72B6\u6001\uFF1A",
          parsed.empty ? "\u7A7A\u6587\u672C" : parsed.ok ? "\u6210\u529F\uFF08js-yaml 4.1.0\uFF0CYAML 1.2 core \u8BED\u4E49\uFF09" : `\u5931\u8D25${parsed.error.line ? `\uFF08${parsed.error.line}:${parsed.error.column}\uFF09` : ""} \u2014\u2014 \u4E0E\u5751\u626B\u63CF\u662F\u4E24\u9053\u72EC\u7ACB\u95F8`
        ] }),
        scan.issues.length === 0 ? /* @__PURE__ */ jsx("div", { className: "yl-empty", children: "\u672A\u53D1\u73B0\u5DF2\u77E5\u5751\u6A21\u5F0F\u3002\u6CE8\u610F\uFF1A\u8986\u76D6\u8DE8\u5B9E\u73B0\u8BED\u4E49\u6F02\u79FB\u4E0E\u5E38\u89C1\u4E66\u5199\u9677\u9631\uFF0C\u4E0D\u7B49\u4E8E\u300C\u8BED\u4E49\u6B63\u786E\u300D\u3002" }) : [...scan.issues].slice().sort((a, b) => {
          const o = (s) => s === "error" ? 0 : s === "warn" ? 1 : 2;
          return o(a.severity) - o(b.severity) || a.line - b.line || a.col - b.col;
        }).map((i, idx) => /* @__PURE__ */ jsxs("div", { className: "yl-issue sev-" + i.severity, children: [
          /* @__PURE__ */ jsxs("div", { className: "row1", children: [
            /* @__PURE__ */ jsx("span", { className: "badge", children: SEV_LABEL[i.severity] }),
            /* @__PURE__ */ jsxs("span", { className: "pos", children: [
              i.line,
              ":",
              i.col
            ] }),
            /* @__PURE__ */ jsx("code", { className: "rule", children: i.rule })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "msg", children: i.message }),
          i.hint && /* @__PURE__ */ jsxs("div", { className: "hint", children: [
            "\u2192 ",
            i.hint
          ] })
        ] }, `${i.rule}-${idx}`))
      ] }),
      view === "convert" && /* @__PURE__ */ jsxs("div", { className: "yl-section", "data-view": "convert", children: [
        /* @__PURE__ */ jsxs("div", { className: "yl-chips", children: [
          /* @__PURE__ */ jsx("button", { className: "yl-chip" + (dir === "y2j" ? " on" : ""), onClick: () => setDir("y2j"), children: "YAML \u2192 JSON" }),
          /* @__PURE__ */ jsx("button", { className: "yl-chip" + (dir === "j2y" ? " on" : ""), onClick: () => setDir("j2y"), children: "JSON \u2192 YAML" }),
          /* @__PURE__ */ jsx("span", { className: "yl-gap" }),
          /* @__PURE__ */ jsxs("label", { className: "yl-opt", children: [
            "\u7F29\u8FDB",
            /* @__PURE__ */ jsxs("select", { value: indent, onChange: (e) => setIndent(Number(e.target.value)), children: [
              /* @__PURE__ */ jsx("option", { value: 2, children: "2" }),
              /* @__PURE__ */ jsx("option", { value: 4, children: "4" })
            ] })
          ] }),
          dir === "j2y" && /* @__PURE__ */ jsxs("label", { className: "yl-opt", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: sortKeys, onChange: (e) => setSortKeys(e.target.checked) }),
            "\u6309\u952E\u6392\u5E8F"
          ] })
        ] }),
        convert.ok ? /* @__PURE__ */ jsxs("div", { className: "yl-card", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            dir === "y2j" ? "JSON \u8F93\u51FA" : "YAML \u8F93\u51FA",
            "\uFF08dump\uFF1A\u4E0D\u6298\u884C / noRefs \u5C55\u5F00\u5171\u4EAB\u5F15\u7528\uFF09"
          ] }),
          /* @__PURE__ */ jsx("pre", { className: "yl-pre", children: convert.text })
        ] }) : /* @__PURE__ */ jsxs("div", { className: "yl-err", children: [
          /* @__PURE__ */ jsx("div", { className: "ttl", children: "\u8F6C\u6362\u5931\u8D25" }),
          /* @__PURE__ */ jsx("div", { children: convert.error.message }),
          convert.error.hint && /* @__PURE__ */ jsx("div", { className: "hint", children: convert.error.hint })
        ] })
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function YamlLensEntry(props) {
  return /* @__PURE__ */ jsx2(YamlLensPanel, { ...props });
}
export {
  YamlLensEntry as default
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
