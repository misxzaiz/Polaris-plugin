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

// shared/url-core.js
var require_url_core = __commonJS({
  "shared/url-core.js"(exports, module) {
    "use strict";
    function parseUrl2(urlStr) {
      const raw = String(urlStr == null ? "" : urlStr).trim();
      if (!raw) return { ok: false, error: "URL \u4E3A\u7A7A" };
      let u;
      try {
        u = new URL(raw);
      } catch (e) {
        return { ok: false, error: `URL \u8BED\u6CD5\u9519\u8BEF\uFF1A${String(e.message || e).slice(0, 120)}` };
      }
      const params = [];
      for (const [name, value] of new URLSearchParams(u.search)) {
        params.push({ name, value });
      }
      const parts = {
        protocol: u.protocol.replace(/:$/, ""),
        username: u.username || "",
        password: u.password ? "(\u5DF2\u9690\u85CF)" : "",
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? "443(\u9ED8\u8BA4)" : u.protocol === "http:" ? "80(\u9ED8\u8BA4)" : ""),
        origin: u.origin,
        pathname: u.pathname,
        search: u.search || "(\u65E0)",
        hash: u.hash || "(\u65E0)",
        href: u.href
      };
      return { ok: true, parts, params, rawParams: u.search.replace(/^\?/, "") };
    }
    function buildUrl(spec) {
      if (!spec || typeof spec !== "object") return { ok: false, error: "\u7F3A\u5C11 spec \u5BF9\u8C61" };
      const protocol = String(spec.protocol || "https").replace(/:$/, "");
      const hostname = String(spec.hostname || "").trim();
      if (!hostname) return { ok: false, error: "\u7F3A\u5C11 hostname" };
      const pathname = String(spec.pathname || "/").startsWith("/") ? String(spec.pathname || "/") : "/" + String(spec.pathname || "");
      const usp = new URLSearchParams();
      const params = Array.isArray(spec.params) ? spec.params : [];
      for (const p of params) {
        if (!p || typeof p.name !== "string" || p.name === "") continue;
        usp.append(p.name, String(p.value ?? ""));
      }
      const port = spec.port ? String(spec.port) : "";
      const hash = spec.hash ? String(spec.hash).startsWith("#") ? String(spec.hash) : "#" + String(spec.hash) : "";
      const qs = usp.toString();
      const url = `${protocol}://${hostname}${port ? ":" + port : ""}${pathname}${qs ? "?" + qs : ""}${hash}`;
      try {
        return { ok: true, url: new URL(url).href, normalized: url };
      } catch (e) {
        return { ok: false, error: `\u91CD\u5EFA\u7684 URL \u975E\u6CD5\uFF1A${String(e.message || e).slice(0, 120)}` };
      }
    }
    function decodeSegments2(urlStr) {
      const parsed = parseUrl2(urlStr);
      if (!parsed.ok) return parsed;
      const u = new URL(String(urlStr).trim());
      const rows = [];
      const addRow = (segment, raw, decoded, note) => rows.push({ segment, raw, decoded, note: note || "" });
      addRow("href\uFF08\u6574\u4F53\uFF09", u.href, decodeURIComponentSafe(u.href));
      addRow("pathname", u.pathname, decodeURIComponentSafe(u.pathname), "\u8DEF\u5F84\u6BB5\uFF1A%XX \u89E3\u7801\uFF08+ \u4E0D\u8F6C\u7A7A\u683C\u2014\u2014\u8DEF\u5F84\u91CC + \u662F\u5B57\u9762\u91CF\uFF09");
      const rawPairs = u.search.replace(/^\?/, "").split("&").filter((s) => s.length > 0).map((pair) => {
        const i = pair.indexOf("=");
        return i === -1 ? { rawName: pair, rawValue: null } : { rawName: pair.slice(0, i), rawValue: pair.slice(i + 1) };
      });
      const sp = new URLSearchParams(u.search);
      const spList = [...sp];
      let qi = 0;
      for (; qi < spList.length; qi++) {
        const [name, value] = spList[qi];
        const rp = rawPairs[qi] || { rawName: name, rawValue: value };
        addRow(`query[${qi + 1}] name`, rp.rawName, name, "URLSearchParams \u6807\u51C6\uFF1A+ \u2192 \u7A7A\u683C\u3001%XX \u89E3\u7801");
        addRow(
          `query[${qi + 1}] value`,
          rp.rawValue === null ? "(\u65E0\u503C)" : rp.rawValue,
          value,
          rp.rawValue !== null && rp.rawValue !== value ? "\u7F16\u7801\u5F62\u6001 \u2192 \u89E3\u7801\u5F62\u6001\uFF08\u6CE8\u610F + \u4E0E %20 \u8BED\u4E49\u5DEE\u5F02\uFF09" : "URLSearchParams \u6807\u51C6\uFF1B\u91CD\u590D\u952E\u5168\u5C55\u5F00\uFF08.get \u53EA\u53D6\u9996\u4E2A\u662F\u7ECF\u5178\u5751\uFF09"
        );
      }
      if (!u.search) addRow("query", "(\u65E0)", "(\u65E0)");
      if (u.hash) addRow("hash", u.hash, decodeURIComponentSafe(u.hash), "fragment\uFF1A%XX \u89E3\u7801");
      return { ok: true, rows };
    }
    function decodeURIComponentSafe(s) {
      try {
        return decodeURIComponent(s);
      } catch (_) {
        return s;
      }
    }
    function renderReport(parsed) {
      if (!parsed.ok) return `\u274C ${parsed.error}`;
      const p = parsed.parts;
      const lines = [];
      lines.push(`\u7ED3\u6784\u5206\u89E3\uFF1A`);
      lines.push(`  protocol  ${p.protocol}`);
      lines.push(`  hostname  ${p.hostname}${p.port ? `\uFF08port ${p.port}\uFF09` : ""}`);
      if (p.username) lines.push(`  username  ${p.username}`);
      lines.push(`  origin    ${p.origin}`);
      lines.push(`  pathname  ${p.pathname}`);
      lines.push(`  search    ${p.search}`);
      lines.push(`  hash      ${p.hash}`);
      if (parsed.params.length) {
        lines.push(`query \u53C2\u6570 ${parsed.params.length} \u9879\uFF08\u91CD\u590D\u952E\u5168\u5C55\u5F00\uFF09\uFF1A`);
        let idx = 1;
        for (const pr of parsed.params) {
          lines.push(`  [${idx++}] ${pr.name} = ${pr.value === "" ? "(\u7A7A\u503C)" : pr.value}`);
        }
        const dupNames = findDuplicateNames2(parsed.params);
        if (dupNames.length) lines.push(`  \u26A0 \u91CD\u590D\u952E\uFF1A${dupNames.join(", ")}\uFF08searchParams.get \u53EA\u53D6\u9996\u4E2A\u2014\u2014\u6574\u7EC4\u53D6\u503C\u7528 getAll\uFF09`);
      } else {
        lines.push("query \u53C2\u6570\uFF1A\u65E0");
      }
      return lines.join("\n");
    }
    function findDuplicateNames2(params) {
      const seen = /* @__PURE__ */ new Set();
      const dups = /* @__PURE__ */ new Set();
      for (const p of params) {
        if (seen.has(p.name)) dups.add(p.name);
        seen.add(p.name);
      }
      return [...dups];
    }
    module.exports = { parseUrl: parseUrl2, buildUrl, decodeSegments: decodeSegments2, renderReport, findDuplicateNames: findDuplicateNames2, decodeURIComponentSafe };
  }
});

// src/Panel.tsx
var core = __toESM(require_url_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.ul-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ul-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ul-head b{font-size:13px}
.ul-head .sub{color:#5C6678;font-size:11px}
.ul-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ul-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none}
.ul-input:focus{border-color:#4fd1a0}
.ul-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.ul-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.ul-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.ul-rows{font:12px/1.9 ui-monospace,Consolas,monospace}
.ul-rows .r{display:flex;gap:10px;padding:2px 12px}
.ul-rows .k{color:#8B94A9;min-width:86px}
.ul-rows .v{color:#c9cede;word-break:break-all}
.ul-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.ul-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.ul-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.ul-warn{padding:7px 12px;color:#f3b377;font-size:11.5px}
.ul-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function UrlLensPanel(_props) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const result = useMemo(() => {
    if (!submitted) return null;
    return core.parseUrl(submitted);
  }, [submitted]);
  const decode = useMemo(() => {
    if (!submitted) return null;
    return core.decodeSegments(submitted);
  }, [submitted]);
  return /* @__PURE__ */ jsxs("div", { className: "ul-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "ul-head", children: [
      /* @__PURE__ */ jsx("b", { children: "URL \u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u7ED3\u6784\u5206\u89E3 \xB7 \u53C2\u6570\u5168\u5C55\u5F00 \xB7 \u89E3\u7801\u5BF9\u7167 \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ul-body", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "ul-input",
          placeholder: "\u7C98\u8D34 URL\uFF1Ahttps://example.com/path?tag=a&tag=b&q=hello%20world#frag",
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") setSubmitted(text.trim());
          }
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "ul-input", style: { width: "auto", padding: "6px 18px", cursor: "pointer" }, onClick: () => setSubmitted(text.trim()), children: "\u89E3\u6790\uFF08\u6216\u56DE\u8F66\uFF09" }),
      result && !result.ok && /* @__PURE__ */ jsx("div", { className: "ul-err", children: result.error }),
      result && result.ok && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "ul-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u7ED3\u6784\u5206\u89E3" }),
          /* @__PURE__ */ jsx("div", { className: "ul-rows", children: Object.entries(result.parts).map(([k, v]) => /* @__PURE__ */ jsxs("div", { className: "r", children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: k }),
            /* @__PURE__ */ jsx("span", { className: "v", children: String(v) })
          ] }, k)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ul-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "query \u53C2\u6570\uFF08\u91CD\u590D\u952E\u5168\u5C55\u5F00\uFF09" }),
          result.params.length > 0 ? /* @__PURE__ */ jsxs("table", { className: "ul-tbl", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "#" }),
              /* @__PURE__ */ jsx("th", { children: "name" }),
              /* @__PURE__ */ jsx("th", { children: "value" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: result.params.map((p, i) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { children: i + 1 }),
              /* @__PURE__ */ jsx("td", { children: p.name }),
              /* @__PURE__ */ jsx("td", { children: p.value === "" ? "(\u7A7A\u503C)" : p.value })
            ] }, i)) })
          ] }) : /* @__PURE__ */ jsx("div", { className: "ul-note", style: { padding: "8px 12px" }, children: "\u65E0 query \u53C2\u6570" }),
          core.findDuplicateNames(result.params).length > 0 && /* @__PURE__ */ jsxs("div", { className: "ul-warn", children: [
            "\u26A0 \u91CD\u590D\u952E\uFF1A",
            core.findDuplicateNames(result.params).join(", "),
            " \u2014\u2014 searchParams.get \u53EA\u53D6\u9996\u4E2A\uFF0C\u6574\u7EC4\u53D6\u503C\u7528 getAll"
          ] })
        ] }),
        decode && decode.ok && /* @__PURE__ */ jsxs("div", { className: "ul-card", children: [
          /* @__PURE__ */ jsx("h3", { children: "\u5404\u6BB5 raw vs \u89E3\u7801\u5BF9\u7167" }),
          /* @__PURE__ */ jsxs("table", { className: "ul-tbl", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "\u6BB5" }),
              /* @__PURE__ */ jsx("th", { children: "raw" }),
              /* @__PURE__ */ jsx("th", { children: "decoded" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: decode.rows.map((row, i) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { children: row.segment }),
              /* @__PURE__ */ jsx("td", { children: row.raw }),
              /* @__PURE__ */ jsxs("td", { children: [
                row.decoded,
                row.note ? /* @__PURE__ */ jsxs("span", { style: { color: "#5C6678" }, children: [
                  " \xB7 ",
                  row.note
                ] }) : null
              ] })
            ] }, i)) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ul-note", children: "\u8BED\u4E49\u8FB9\u754C\uFF08\u5982\u5B9E\uFF09\uFF1Aquery \u53C2\u6570\u6309 URLSearchParams \u6807\u51C6\uFF08+ \u2192 \u7A7A\u683C\u3001%XX \u89E3\u7801\uFF09\uFF1B\u8DEF\u5F84\u91CC + \u662F\u5B57\u9762\u91CF\u3002\u7EAF\u672C\u5730\u89E3\u6790\uFF0C\u4E0D\u53D1 DNS \u4E0D\u8054\u5916\uFF1Bpunycode \u6309 WHATWG URL \u539F\u751F\u884C\u4E3A\u5448\u73B0\u4E0D\u505A\u7279\u5224\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function UrlLensEntry(props) {
  return /* @__PURE__ */ jsx2(UrlLensPanel, { ...props });
}
export {
  UrlLensEntry as default
};
