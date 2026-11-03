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

// shared/gitignore-core.js
var require_gitignore_core = __commonJS({
  "shared/gitignore-core.js"(exports, module) {
    "use strict";
    function parseGitignore2(text) {
      const rawLines = String(text == null ? "" : text).split(/\r?\n/);
      const rules = [];
      const errors = [];
      rawLines.forEach((rawLine, idx) => {
        const lineNo = idx + 1;
        let line = String(rawLine);
        let trailingEscaped = false;
        if (/\\$/.test(line)) {
          trailingEscaped = true;
          line = line.replace(/\\$/, " ");
        } else line = line.replace(/\s+$/, "");
        if (!line.trim()) return;
        if (line.startsWith("#")) return;
        let negated = false;
        if (line.startsWith("!")) {
          negated = true;
          line = line.slice(1);
        }
        if (!line) {
          errors.push({ line: lineNo, content: "!" });
          return;
        }
        let anchored = false;
        let dirOnly = false;
        if (line.endsWith("/")) {
          dirOnly = true;
          line = line.slice(0, -1);
        }
        if (!line) {
          errors.push({ line: lineNo, content: "/" });
          return;
        }
        if (line.startsWith("/")) {
          anchored = true;
          line = line.slice(1);
        } else if (line.slice(1).includes("/")) {
          anchored = true;
        }
        if (!line) {
          errors.push({ line: lineNo, content: String(rawLine).trim() });
          return;
        }
        rules.push({
          line: lineNo,
          raw: String(rawLine).trim(),
          negated,
          anchored,
          dirOnly,
          pattern: line,
          regex: globToRegex(line, { anchored, dirOnly }),
          dirRegex: dirOnly ? globToRegex(line, { anchored, dirOnly: false }) : null
        });
      });
      return { rules, errors };
    }
    function globToRegex(pattern, { anchored, dirOnly }) {
      let re = "";
      let i = 0;
      const n = pattern.length;
      while (i < n) {
        const ch = pattern[i];
        if (ch === "*") {
          if (pattern[i + 1] === "*") {
            if (pattern[i + 2] === "/") {
              if (i === 0) {
                re += "(?:[^/]+/)*";
                i += 3;
                continue;
              }
              re += "(?:.*/)?";
              i += 3;
              continue;
            }
            re += ".*";
            i += 2;
            continue;
          }
          re += "[^/]*";
          i++;
          continue;
        }
        if (ch === "?") {
          re += "[^/]";
          i++;
          continue;
        }
        if (ch === "[") {
          const close = pattern.indexOf("]", i + 1);
          if (close === -1) {
            re += "\\[";
            i++;
            continue;
          }
          let cls = pattern.slice(i + 1, close);
          const neg = cls.startsWith("!") || cls.startsWith("^");
          if (neg) cls = cls.slice(1);
          cls = cls.replace(/\\/g, "\\\\");
          re += `[${neg ? "^" : ""}${cls}]`;
          i = close + 1;
          continue;
        }
        re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        i++;
      }
      const body = anchored ? `^${re}(?:/|$)` : `(^|/)${re}(/|$)`;
      return new RegExp(body);
    }
    function judgePaths2(parsed, paths) {
      const { rules } = parsed;
      const results = [];
      const ignoredDirPatterns = rules.filter((r) => !r.negated);
      for (const p of paths) {
        const path = String(p || "").replace(/^\/+/, "").replace(/\/+$/, "");
        if (!path) {
          results.push({ path: String(p), ignored: false, ruleLine: null, reason: "\u7A7A\u8DEF\u5F84" });
          continue;
        }
        const segments = path.split("/");
        let parentIgnoredBy = null;
        for (let d = 1; d < segments.length; d++) {
          const prefix = segments.slice(0, d).join("/");
          for (const r of rules) {
            if (r.negated) continue;
            const m = matchRule(r, prefix, true);
            if (m) {
              parentIgnoredBy = r;
              break;
            }
          }
          if (parentIgnoredBy) break;
        }
        let matched = null;
        for (const r of rules) {
          if (matchRule(r, path, false)) matched = { rule: r };
          if (r.dirRegex && matchRule(r, path, true)) matched = { rule: r };
        }
        let ignored, ruleLine, reason, trap;
        if (parentIgnoredBy) {
          ignored = true;
          ruleLine = matched && matched.rule.negated ? matched.rule.line : parentIgnoredBy.line;
          reason = matched && matched.rule.negated ? `\u7236\u76EE\u5F55\u88AB\u7B2C ${parentIgnoredBy.line} \u884C\u89C4\u5219\u5FFD\u7565\uFF0Cgit \u4E0D\u8FDB\u5165\u8BE5\u76EE\u5F55\u2014\u2014\u5426\u5B9A\u89C4\u5219\uFF08\u7B2C ${matched.rule.line} \u884C\uFF09\u65E0\u6CD5\u590D\u6D3B\u5176\u4E2D\u7684\u6587\u4EF6` : `\u7236\u76EE\u5F55\u88AB\u7B2C ${parentIgnoredBy.line} \u884C\u89C4\u5219\u5FFD\u7565\uFF0C\u5176\u4E0B\u5185\u5BB9\u6574\u4F53\u6392\u9664`;
          if (matched && matched.rule.negated) {
            trap = "negated-under-ignored-dir";
          }
        } else if (matched) {
          ignored = !matched.rule.negated;
          ruleLine = matched.rule.line;
          reason = matched.rule.negated ? `\u88AB\u7B2C ${matched.rule.line} \u884C\u5426\u5B9A\u89C4\u5219\u590D\u6D3B\uFF08!${"\u2026"}\uFF09` : `\u88AB\u7B2C ${matched.rule.line} \u884C\u89C4\u5219\u5FFD\u7565`;
        } else {
          ignored = false;
          ruleLine = null;
          reason = "\u65E0\u89C4\u5219\u547D\u4E2D\uFF08\u672A\u88AB\u5FFD\u7565\uFF09";
        }
        results.push({ path, ignored, ruleLine, reason, trap });
      }
      return { results };
    }
    function matchRule(rule, path, isDirContext) {
      if (rule.dirOnly && !isDirContext) {
        return rule.regex.test(path) && rule.regex.test(path + "/");
      }
      return rule.regex.test(path);
    }
    function detectTraps2(parsed) {
      const notes = [];
      const { rules } = parsed;
      for (const r of rules) {
        if (r.negated && r.line > 1) {
          const earlierDirRule = rules.find(
            (x) => !x.negated && x.line < r.line && x.pattern === r.pattern.split("/")[0]
          );
          if (earlierDirRule) {
            notes.push(`\u7B2C ${r.line} \u884C\u5426\u5B9A\u89C4\u5219\u53EF\u80FD\u65E0\u6548\uFF1A\u7B2C ${earlierDirRule.line} \u884C\u5148\u5FFD\u7565\u4E86\u5176\u7236\u76EE\u5F55\u6BB5\u300C${earlierDirRule.pattern}/\u300D\u2014\u2014git \u4E0D\u8FDB\u5165\u88AB\u5FFD\u7565\u76EE\u5F55\uFF0C\u5426\u5B9A\u65E0\u6CD5\u590D\u6D3B\u5176\u4E2D\u6587\u4EF6\uFF08\u7528 /* \u4EE3\u66FF\u76EE\u5F55\u540D\u53EF\u8BA9\u5426\u5B9A\u751F\u6548\uFF09`);
          }
        }
        if (r.pattern === "**") {
          notes.push(`\u7B2C ${r.line} \u884C\u88F8 ** \u7B49\u6548\u4E8E\u5FFD\u7565\u4E00\u5207\uFF08\u542B\u81EA\u8EAB\uFF09\uFF0C\u901A\u5E38\u4E0D\u662F\u9884\u671F\u5199\u6CD5`);
        }
      }
      return notes;
    }
    module.exports = { parseGitignore: parseGitignore2, judgePaths: judgePaths2, detectTraps: detectTraps2, globToRegex, matchRule };
  }
});

// src/Panel.tsx
var core = __toESM(require_gitignore_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.gl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.gl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gl-head b{font-size:13px}
.gl-head .sub{color:#5C6678;font-size:11px}
.gl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.gl-cols{display:flex;gap:10px}
.gl-col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.gl-col label{color:#8B94A9;font-size:11px}
.gl-area{width:100%;min-height:130px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.gl-area:focus{border-color:#4fd1a0}
.gl-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.gl-run:disabled{opacity:.5;cursor:not-allowed}
.gl-verdict{border-radius:8px;padding:8px 13px;font-size:12px;border:1px solid}
.gl-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.gl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.gl-tbl{width:100%;border-collapse:collapse;font-size:12px}
.gl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:6px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.gl-tbl td{padding:6px 10px;border-bottom:1px solid #161c2a;vertical-align:top;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.gl-badge{border-radius:5px;padding:1px 8px;font-size:11px;white-space:nowrap}
.gl-badge.ig{background:#2b1215;color:#f1a0a0}
.gl-badge.keep{background:#12241a;color:#8ce0b0}
.gl-trap{color:#f3b377}
.gl-notes{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.gl-notes .n{padding:6px 12px;font-size:11.5px;color:#f3b377;border-bottom:1px solid #161c2a;line-height:1.6}
.gl-notes .n:last-child{border-bottom:none}
.gl-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function GitignoreLensPanel(_props) {
  const [giText, setGiText] = useState("");
  const [pathsText, setPathsText] = useState("");
  const [checked, setChecked] = useState(null);
  const result = useMemo(() => {
    if (!checked) return null;
    const parsed = core.parseGitignore(checked.gi);
    const j = core.judgePaths(parsed, checked.paths);
    const traps = core.detectTraps(parsed);
    return { results: j.results, traps };
  }, [checked]);
  const run = () => {
    const paths = pathsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!giText.trim() || !paths.length) return;
    setChecked({ gi: giText, paths });
  };
  return /* @__PURE__ */ jsxs("div", { className: "gl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "gl-head", children: [
      /* @__PURE__ */ jsx("b", { children: ".gitignore \u68C0\u67E5\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u9010\u8DEF\u5F84\u5224\u5B9A \xB7 \u547D\u4E2D\u884C\u53F7 \xB7 \u5751\u68C0\u6D4B \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gl-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "gl-cols", children: [
        /* @__PURE__ */ jsxs("div", { className: "gl-col", children: [
          /* @__PURE__ */ jsx("label", { children: ".gitignore \u89C4\u5219" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "gl-area",
              placeholder: "*.log\n!important.log\nbuild/\n/root.txt",
              value: giText,
              onChange: (e) => setGiText(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "gl-col", children: [
          /* @__PURE__ */ jsx("label", { children: "\u5F85\u5224\u5B9A\u8DEF\u5F84\uFF08\u6BCF\u884C\u4E00\u6761\uFF0C\u76F8\u5BF9\u4ED3\u5E93\u6839\uFF09" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "gl-area",
              placeholder: "debug.log\nimportant.log\nbuild/output.txt\nsub/root.txt",
              value: pathsText,
              onChange: (e) => setPathsText(e.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "gl-run", onClick: run, disabled: !giText.trim() || !pathsText.trim(), children: "\u5224\u5B9A" }),
      result && /* @__PURE__ */ jsxs(Fragment, { children: [
        result.traps.length > 0 && /* @__PURE__ */ jsx("div", { className: "gl-notes", children: result.traps.map((t, i) => /* @__PURE__ */ jsxs("div", { className: "n", children: [
          "\u26A0 ",
          t
        ] }, i)) }),
        /* @__PURE__ */ jsxs("table", { className: "gl-tbl", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { children: "\u5224\u5B9A" }),
            /* @__PURE__ */ jsx("th", { children: "\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx("th", { children: "\u539F\u56E0" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: result.results.map((r, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: `gl-badge ${r.ignored ? "ig" : "keep"}`, children: r.ignored ? "\u5FFD\u7565" : "\u4FDD\u7559" }) }),
            /* @__PURE__ */ jsx("td", { children: r.path }),
            /* @__PURE__ */ jsxs("td", { className: r.trap ? "gl-trap" : "", children: [
              r.reason,
              r.trap && " \u26A0 \u5426\u5B9A\u88AB\u7236\u76EE\u5F55\u538B\u4F4F\u2014\u2014git \u4E0D\u8FDB\u5165\u88AB\u5FFD\u7565\u76EE\u5F55\uFF0C\u5426\u5B9A\u89C4\u5219\u65E0\u6548"
            ] })
          ] }, i)) })
        ] })
      ] }),
      result && result.results.every((r) => !r.ignored) && /* @__PURE__ */ jsx("div", { className: "gl-verdict ok", children: "\u5168\u90E8\u8DEF\u5F84\u5747\u672A\u88AB\u5FFD\u7565" }),
      /* @__PURE__ */ jsxs("div", { className: "gl-note", children: [
        "\u8BED\u4E49\u8FB9\u754C\uFF08\u5982\u5B9E\uFF09\uFF1A\u89E3\u6790\u5355\u4E00\u89C4\u5219\u6E05\u5355\uFF08\u4E0D\u542B\u5D4C\u5957 .gitignore / .git/info/exclude / \u5168\u5C40\u914D\u7F6E\uFF09\uFF1Bgitignore \u5B98\u65B9\u8BED\u4E49\u5E38\u7528\u5B50\u96C6\u2014\u2014 \u6CE8\u91CA/\u5426\u5B9A(!)/\u951A\u5B9A(/)/\u76EE\u5F55\u9650\u5B9A(/ \u5C3E)/\u901A\u914D(* ? [...] \u53CC\u661F)\uFF1B\u5224\u5B9A\u987A\u5E8F=\u6700\u540E\u5339\u914D\u89C4\u5219\u80DC\u51FA\uFF1B",
        /* @__PURE__ */ jsx("b", { children: "\u7236\u76EE\u5F55\u88AB\u5FFD\u7565\u540E git \u4E0D\u8FDB\u5165\u8BE5\u76EE\u5F55\uFF0C\u5426\u5B9A\u65E0\u6CD5\u590D\u6D3B\u5176\u4E2D\u6587\u4EF6" }),
        "\uFF08\u6B63\u786E\u5199\u6CD5\uFF1A\u7528 ",
        /* @__PURE__ */ jsx("code", { children: "/*" }),
        " \u914D\u5426\u5B9A\uFF0C\u800C\u975E\u76EE\u5F55\u540D\u6574\u4F53\u5FFD\u7565\uFF09\u3002 \u672C\u5B9E\u73B0\u8BED\u4E49\u5DF2\u7528\u672C\u673A git check-ignore \u5B9E\u6D4B\u5BF9\u7167\u951A\u5B9A\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function GitignoreLensEntry(props) {
  return /* @__PURE__ */ jsx2(GitignoreLensPanel, { ...props });
}
export {
  GitignoreLensEntry as default
};
