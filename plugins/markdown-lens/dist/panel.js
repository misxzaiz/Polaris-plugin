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

// shared/md-core.js
var require_md_core = __commonJS({
  "shared/md-core.js"(exports, module) {
    "use strict";
    var RULES = {
      heading_increment: { level: "warn", desc: "\u6807\u9898\u5C42\u7EA7\u8DF3\u7EA7\uFF08\u5982 h1 \u76F4\u63A5\u5230 h3\uFF09" },
      multiple_h1: { level: "error", desc: "\u591A\u4E2A\u4E00\u7EA7\u6807\u9898" },
      first_heading_not_h1: { level: "info", desc: "\u6587\u6863\u9996\u4E2A\u6807\u9898\u4E0D\u662F h1" },
      anchor_broken: { level: "error", desc: "\u951A\u70B9\u94FE\u63A5 #\u76EE\u6807 \u4E0E\u6587\u4E2D\u6807\u9898\u4E0D\u5339\u914D\uFF08GitHub slug \u89C4\u5219\uFF09" },
      empty_link: { level: "error", desc: "\u7A7A\u94FE\u63A5\uFF08\u65E0\u76EE\u6807\u5730\u5740\uFF09" },
      bare_url: { level: "info", desc: "\u88F8 URL \u5EFA\u8BAE\u5305\u6210 markdown \u94FE\u63A5" },
      img_no_alt: { level: "warn", desc: "\u56FE\u7247\u7F3A\u5C11 alt \u6587\u672C" },
      table_mismatch: { level: "error", desc: "\u8868\u683C\u5217\u6570\u4E0D\u9F50\uFF08\u8868\u5934/\u5206\u9694\u884C/\u6570\u636E\u884C\uFF09" },
      fence_no_lang: { level: "info", desc: "\u4EE3\u7801\u5757\u672A\u6807\u6CE8\u8BED\u8A00" },
      duplicate_heading: { level: "warn", desc: "\u91CD\u590D\u6807\u9898\uFF08\u540C\u5C42\u7EA7\u540C\u540D\uFF0C\u951A\u70B9\u4F1A\u51B2\u7A81\uFF09" },
      todo_marker: { level: "info", desc: "TODO/FIXME/XXX \u6B8B\u7559\u6807\u8BB0" },
      trailing_space: { level: "info", desc: "\u884C\u5C3E\u591A\u4F59\u7A7A\u767D\uFF08\u786C\u6362\u884C\u53CC\u7A7A\u683C\u9664\u5916\uFF09" }
    };
    function githubSlug(heading) {
      return String(heading).trim().toLowerCase().replace(/[\s]+/g, "-").replace(/[^\p{L}\p{N}\-_]/gu, "");
    }
    function analyzeLines(text) {
      const lines = String(text == null ? "" : text).split(/\r?\n/);
      const rows = [];
      let inFence = false;
      let fenceLang = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;
        const fenceM = line.match(/^\s*(```+|~~~+)/);
        if (fenceM && !inFence) {
          inFence = true;
          fenceLang = line.replace(/^\s*(```+|~~~+)\s*/, "").trim();
          rows.push({ lineNo, line, kind: "fence_open", fenceLang });
          continue;
        }
        if (inFence && fenceM) {
          inFence = false;
          rows.push({ lineNo, line, kind: "fence_close" });
          continue;
        }
        if (inFence) {
          rows.push({ lineNo, line, kind: "fence_body" });
          continue;
        }
        const hM = line.match(/^(#{1,6})\s+(.*)$/);
        if (hM) {
          rows.push({ lineNo, line, kind: "heading", level: hM[1].length, text: hM[2].trim().replace(/#+\s*$/, "").trim() });
          continue;
        }
        if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) {
          rows.push({ lineNo, line, kind: "table_row" });
          continue;
        }
        if (/^\s*\[[^\]]*\]:\s*/.test(line)) {
          rows.push({ lineNo, line, kind: "link_ref" });
          continue;
        }
        rows.push({ lineNo, line, kind: "text" });
      }
      return rows;
    }
    function extractLinks(line) {
      const clean = line.replace(/`[^`]*`/g, (m2) => " ".repeat(m2.length));
      const out = [];
      const imgRe = /!\[([^\]]*)\]\(([^)]*)\)/g;
      let m;
      while (m = imgRe.exec(clean)) out.push({ kind: "image", alt: m[1], url: m[2], index: m.index });
      const linkRe = /\[([^\]]*)\]\(([^)]*)\)/g;
      while (m = linkRe.exec(clean)) out.push({ kind: "link", text: m[1], url: m[2], index: m.index });
      return out;
    }
    function lint2(text, opts = {}) {
      const rows = analyzeLines(text);
      const findings = [];
      const add = (line, rule, message) => findings.push({ line, rule, level: RULES[rule].level, message });
      const outline = [];
      const headingsSeen = /* @__PURE__ */ new Map();
      let h1Count = 0;
      let prevLevel = 0;
      let inTable = false;
      let tableCols = 0;
      let tableStart = 0;
      for (const row of rows) {
        const { lineNo, line, kind } = row;
        if (kind === "fence_open" && !row.fenceLang) add(lineNo, "fence_no_lang", "\u4EE3\u7801\u5757\u672A\u6807\u6CE8\u8BED\u8A00\uFF08``` \u540E\u5EFA\u8BAE\u5199\u8BED\u8A00\u540D\uFF09");
        if (kind === "fence_body") continue;
        if (kind === "heading") {
          const slug = githubSlug(row.text);
          outline.push({ line: lineNo, level: row.level, text: row.text, slug });
          if (row.level === 1) {
            h1Count++;
            if (h1Count > 1) add(lineNo, "multiple_h1", `\u7B2C ${h1Count} \u4E2A h1 \u6807\u9898`);
          }
          if (prevLevel === 0) {
            if (row.level !== 1) add(lineNo, "first_heading_not_h1", `\u9996\u4E2A\u6807\u9898\u662F h${row.level}\uFF0C\u60EF\u4F8B\u5E94\u4E3A h1`);
          } else if (opts.headingIncrement !== false && row.level > prevLevel + 1) {
            add(lineNo, "heading_increment", `\u6807\u9898\u5C42\u7EA7\u8DF3\u7EA7\uFF1Ah${prevLevel} \u76F4\u63A5\u8DF3\u5230 h${row.level}`);
          }
          const count = (headingsSeen.get(`${row.level}|${slug}`) || 0) + 1;
          headingsSeen.set(`${row.level}|${slug}`, count);
          if (count > 1) add(lineNo, "duplicate_heading", `\u91CD\u590D\u6807\u9898\uFF08h${row.level}\u300C${row.text.slice(0, 30)}\u300D\u51FA\u73B0 ${count} \u6B21\uFF0C\u951A\u70B9\u51B2\u7A81\uFF09`);
          prevLevel = row.level;
          continue;
        }
        if (kind === "table_row") {
          const cols = line.split("|").filter((c, idx, arr) => !(idx === 0 && c.trim() === "") && !(idx === arr.length - 1 && c.trim() === "")).length;
          const isSeparator = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
          if (!inTable) {
            inTable = true;
            tableCols = cols;
            tableStart = lineNo;
          } else if (cols !== tableCols) {
            add(lineNo, "table_mismatch", `\u8868\u683C\u5217\u6570\u4E0D\u9F50\uFF1A\u672C\u884C ${cols} \u5217\uFF0C\u8868\u5934 ${tableCols} \u5217\uFF08\u81EA\u7B2C ${tableStart} \u884C\uFF09`);
          }
          continue;
        }
        inTable = false;
        for (const l of extractLinks(line)) {
          if (l.kind === "image" && !l.alt.trim()) add(lineNo, "img_no_alt", `\u56FE\u7247\u7F3A\u5C11 alt \u6587\u672C\uFF1A${String(l.url).slice(0, 40)}`);
          if (l.kind === "link") {
            if (!l.url.trim()) add(lineNo, "empty_link", `\u7A7A\u94FE\u63A5\uFF1A[${l.text || "(\u65E0\u6587\u672C)"}]()`);
            else if (l.url.startsWith("#")) {
            } else if (/^https?:\/\/\S+$/.test(l.text)) {
              add(lineNo, "bare_url", "\u94FE\u63A5\u6587\u672C\u5373 URL\uFF08\u53EF\u8BFB\u6027\u5DEE\uFF0C\u5EFA\u8BAE\u8BED\u4E49\u5316\u6587\u672C\uFF09");
            }
          }
        }
        const placeholder = line.replace(/!?\[[^\]]*\]\([^)]*\)/g, (m) => " ".repeat(m.length)).replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
        const bare = placeholder.match(/https?:\/\/[^\s)]+/g);
        if (bare) add(lineNo, "bare_url", `\u88F8 URL \u5EFA\u8BAE\u5305\u6210 [\u6587\u672C](${String(bare[0]).slice(0, 40)})`);
        const todoM = line.match(/\b(TODO|FIXME|XXX)\b[::]?/);
        if (todoM && !/^\s*>/.test(line)) add(lineNo, "todo_marker", `\u6B8B\u7559\u6807\u8BB0 ${todoM[1]}\uFF08\u53D1\u5E03\u524D\u5E94\u5904\u7406\uFF09`);
        if (/[ \t]+$/.test(line) && !/[ \t]{2,}$/.test(line) && line.trim() !== "") {
          add(lineNo, "trailing_space", "\u884C\u5C3E\u591A\u4F59\u7A7A\u767D");
        }
      }
      for (const row of rows) {
        if (row.kind === "fence_body" || row.kind === "fence_open" || row.kind === "fence_close") continue;
        for (const l of extractLinks(row.line)) {
          if (l.kind === "link" && l.url.startsWith("#")) {
            const target = githubSlug(l.url.slice(1));
            const known = new Set([...headingsSeen.keys()].map((k) => k.split("|")[1]));
            if (!known.has(target)) {
              add(row.lineNo, "anchor_broken", `\u951A\u70B9\u65AD\u94FE\uFF1A${l.url} \u65E0\u5339\u914D\u6807\u9898\uFF08\u53EF\u7528\u951A\u70B9 ${[...known].slice(0, 3).join("\u3001")}${known.size > 3 ? "\u2026" : ""}\uFF09`);
            }
          }
        }
      }
      findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
      return {
        findings,
        outline,
        stats: {
          lines: rows.length,
          headings: outline.length,
          errors: findings.filter((f) => f.level === "error").length,
          warns: findings.filter((f) => f.level === "warn").length,
          infos: findings.filter((f) => f.level === "info").length
        }
      };
    }
    function renderReport(r) {
      const s = r.stats;
      const head = `\u7EDF\u8BA1\uFF1A${s.lines} \u884C \xB7 ${s.headings} \u4E2A\u6807\u9898 \xB7 \u9519\u8BEF ${s.errors} / \u8B66\u544A ${s.warns} / \u63D0\u793A ${s.infos}`;
      if (!r.findings.length) return `${head}
\u2705 \u672A\u53D1\u73B0\u7ED3\u6784\u95EE\u9898`;
      const lines = [head, `\u53D1\u73B0 ${r.findings.length} \u6761\uFF08\u6309\u884C\u53F7\u6392\u5E8F\uFF09\uFF1A`];
      for (const f of r.findings.slice(0, 40)) {
        const icon = f.level === "error" ? "\u274C" : f.level === "warn" ? "\u26A0" : "\u2139";
        lines.push(`  [\u884C ${f.line}] ${icon} ${f.rule}\uFF1A${f.message}`);
      }
      if (r.findings.length > 40) lines.push(`  \uFF08\u53E6 ${r.findings.length - 40} \u6761\u7565\uFF09`);
      return lines.join("\n");
    }
    function renderOutline2(outline) {
      if (!outline.length) return "\uFF08\u65E0\u6807\u9898\u2014\u2014\u6587\u6863\u7F3A\u5C11\u7ED3\u6784\uFF09";
      return outline.map((o) => `${"  ".repeat(o.level - 1)}h${o.level} [\u884C ${o.line}] ${o.text}`).join("\n");
    }
    module.exports = { lint: lint2, renderReport, renderOutline: renderOutline2, githubSlug, analyzeLines, extractLinks, RULES };
  }
});

// src/Panel.tsx
var core = __toESM(require_md_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.ml-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ml-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ml-head b{font-size:13px}
.ml-head .sub{color:#5C6678;font-size:11px}
.ml-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ml-area{width:100%;min-height:180px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.ml-area:focus{border-color:#4fd1a0}
.ml-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.ml-run:disabled{opacity:.5;cursor:not-allowed}
.ml-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid}
.ml-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.ml-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.ml-verdict b{font-size:13px}
.ml-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.ml-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.ml-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.ml-tbl .ln{text-align:right;color:#8B94A9;white-space:nowrap}
.ml-lv{border-radius:4px;padding:0 6px;font-size:10.5px}
.ml-lv.error{background:#2b1215;color:#f1a0a0}
.ml-lv.warn{background:#2b2413;color:#f3b377}
.ml-lv.info{background:#1a2030;color:#8B94A9}
.ml-tree{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.8 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#c9cede}
.ml-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function MarkdownLensPanel(_props) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(null);
  const [view, setView] = useState("findings");
  const result = useMemo(() => {
    if (checked === null) return null;
    const r = core.lint(checked);
    return r;
  }, [checked]);
  return /* @__PURE__ */ jsxs("div", { className: "ml-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "ml-head", children: [
      /* @__PURE__ */ jsx("b", { children: "Markdown \u68C0\u67E5\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u7ED3\u6784\u4F53\u68C0 \xB7 12 \u89C4\u5219\u884C\u7EA7\u62A5\u544A \xB7 \u56F4\u680F\u611F\u77E5 \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ml-body", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "ml-area",
          placeholder: "# \u6807\u9898\n\n## \u7AE0\u8282\n\n[\u65AD\u94FE](#\u4E0D\u5B58\u5728)\n![\u65E0alt](x.png)\nTODO: ...",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "ml-run", onClick: () => setChecked(text), disabled: !text.trim(), children: "\u68C0\u67E5" }),
      result && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `ml-verdict ${result.stats.errors > 0 ? "bad" : "ok"}`, children: [
          /* @__PURE__ */ jsx("b", { children: result.stats.errors > 0 ? `\u274C ${result.stats.errors} \u5904\u9519\u8BEF` : "\u2705 \u65E0\u9519\u8BEF" }),
          " \xB7 ",
          result.stats.warns,
          " \u8B66\u544A \xB7 ",
          result.stats.infos,
          " \u63D0\u793A \xB7 ",
          result.stats.lines,
          " \u884C ",
          result.stats.headings,
          " \u6807\u9898"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm-row", style: { display: "flex", gap: 6 }, children: [
          /* @__PURE__ */ jsxs("button", { className: "ml-run", style: { padding: "4px 12px" }, onClick: () => setView("findings"), children: [
            "\u53D1\u73B0\uFF08",
            result.findings.length,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("button", { className: "ml-run", style: { padding: "4px 12px" }, onClick: () => setView("outline"), children: [
            "\u6807\u9898\u6811\uFF08",
            result.outline.length,
            "\uFF09"
          ] })
        ] }),
        view === "findings" && result.findings.length > 0 && /* @__PURE__ */ jsxs("table", { className: "ml-tbl", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: "ln", children: "\u884C" }),
            /* @__PURE__ */ jsx("th", { children: "\u7EA7\u522B" }),
            /* @__PURE__ */ jsx("th", { children: "\u89C4\u5219" }),
            /* @__PURE__ */ jsx("th", { children: "\u8BF4\u660E" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: result.findings.map((f, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { className: "ln", children: f.line }),
            /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: `ml-lv ${f.level}`, children: f.level }) }),
            /* @__PURE__ */ jsx("td", { children: f.rule }),
            /* @__PURE__ */ jsx("td", { children: f.message })
          ] }, i)) })
        ] }),
        view === "findings" && result.findings.length === 0 && /* @__PURE__ */ jsx("div", { className: "ml-verdict ok", children: "\u672A\u53D1\u73B0\u7ED3\u6784\u95EE\u9898" }),
        view === "outline" && /* @__PURE__ */ jsx("div", { className: "ml-tree", children: core.renderOutline(result.outline) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ml-note", children: "\u89C4\u5219\uFF0812 \u6761\uFF09\uFF1A\u6807\u9898\u8DF3\u7EA7/\u591A h1/\u9996\u6807\u9898\u975E h1/\u951A\u70B9\u65AD\u94FE\uFF08GitHub slug\uFF0C\u4E2D\u6587\u6807\u9898\u517C\u5BB9\uFF09/\u7A7A\u94FE\u63A5/\u88F8 URL/\u56FE\u7247\u65E0 alt/\u8868\u683C\u5217\u6570\u4E0D\u9F50/\u4EE3\u7801\u5757\u65E0\u8BED\u8A00/\u91CD\u590D\u6807\u9898/TODO \u6B8B\u7559/\u884C\u5C3E\u7A7A\u767D\uFF08\u786C\u6362\u884C\u53CC\u7A7A\u683C\u8C41\u514D\uFF09\u3002 \u4EE3\u7801\u5757\u5185\u4F2A markdown \u4E0D\u8BEF\u62A5\uFF08\u56F4\u680F\u72B6\u6001\u611F\u77E5\uFF09\uFF1B\u4E0D\u505A\u94FE\u63A5\u7F51\u7EDC\u53EF\u8FBE\u6027\u63A2\u6D4B\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function MarkdownLensEntry(props) {
  return /* @__PURE__ */ jsx2(MarkdownLensPanel, { ...props });
}
export {
  MarkdownLensEntry as default
};
