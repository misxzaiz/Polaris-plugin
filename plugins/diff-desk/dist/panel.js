// src/Panel.tsx
import { useCallback, useEffect, useState as useState2 } from "react";

// src/host.ts
function getInvoke() {
  const fn = typeof window !== "undefined" ? window.__POLARIS_HOST_INVOKE__ : void 0;
  if (!fn) throw new Error("\u672A\u68C0\u6D4B\u5230\u5BBF\u4E3B\u6865\uFF08__POLARIS_HOST_INVOKE__\uFF09\u2014\u2014\u8BF7\u5728 Polaris \u5BBF\u4E3B\u5185\u4F7F\u7528\u672C\u63D2\u4EF6");
  return fn;
}
async function capDispatch(target, payload) {
  const invoke = getInvoke();
  const r = await invoke("router_dispatch", { req: { target, payload } });
  if (!r || r.ok !== true) throw new Error(r && r.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return r.result;
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r && r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function svcHttp(method, url, bodyObj, timeoutMs = 12e4) {
  const payload = { action: "request", method, url, timeoutMs };
  if (method === "POST" && bodyObj !== void 0) {
    payload.body = JSON.stringify(bodyObj);
    payload.bodyType = "json";
  }
  const r = await capDispatch("cap.http", payload);
  if (typeof r.status !== "number") throw new Error("cap.http \u8FD4\u56DE\u5F02\u5E38\uFF08\u65E0 status\uFF09");
  let parsed;
  try {
    parsed = JSON.parse(r.body || "");
  } catch (_) {
    throw new Error(`\u670D\u52A1\u8FD4\u56DE\u975E JSON\uFF08HTTP ${r.status}\uFF09`);
  }
  if (parsed.ok !== true) throw new Error(parsed.error || `\u670D\u52A1\u8FD4\u56DE\u9519\u8BEF\uFF08HTTP ${r.status}\uFF09`);
  return parsed.result;
}

// src/api.ts
var MANIFEST_PORT = 9877;
var cachedPort = 0;
async function servicePort() {
  if (cachedPort) return cachedPort;
  const meta = await kvGet("dfx.meta");
  cachedPort = meta && typeof meta.port === "number" && meta.port > 0 ? meta.port : MANIFEST_PORT;
  return cachedPort;
}
function invalidatePort() {
  cachedPort = 0;
}
async function call(method, path, body) {
  const port = await servicePort();
  const url = `http://127.0.0.1:${port}${path}`;
  try {
    return await svcHttp(method, url, body);
  } catch (e) {
    invalidatePort();
    const port2 = await servicePort();
    if (port2 === port) throw e;
    return svcHttp(method, `http://127.0.0.1:${port2}${path}`, body);
  }
}
var api = {
  status: () => call("GET", "/api/status"),
  settings: () => call("GET", "/api/settings"),
  saveSettings: (s) => call("POST", "/api/settings", s),
  diffText: (a, b, mode, opts) => call("POST", "/api/diff_text", { a, b, mode, opts }),
  diffFiles: (aPath, bPath, mode, opts) => call("POST", "/api/diff_files", { aPath, bPath, mode, opts }),
  diffDirs: (aPath, bPath, opts) => call("POST", "/api/diff_dirs", { aPath, bPath, opts }),
  diffUrls: (aUrl, bUrl, args) => call("POST", "/api/diff_urls", { aUrl, bUrl, ...args }),
  history: () => call("GET", "/api/history"),
  historyClear: () => call("POST", "/api/history_clear"),
  selftest: () => call("POST", "/api/selftest", {})
};

// src/DiffViews.tsx
import { useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var C = {
  text: "var(--p-text, #d4d4d8)",
  dim: "var(--p-dim, #9ca3af)",
  accent: "var(--p-accent, #4a7dff)",
  border: "var(--p-border, rgba(128,128,128,0.25))",
  panelBg: "var(--p-bg-2, rgba(128,128,128,0.08))",
  insBg: "rgba(63,185,80,0.16)",
  insFg: "var(--p-success, #3fb950)",
  delBg: "rgba(248,81,73,0.14)",
  delFg: "var(--p-danger, #f85149)",
  modFg: "var(--p-warning, #d29922)",
  orderFg: "var(--p-info, #58a6ff)"
};
var styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
.dfx-wrap { color: ${C.text}; font-size: 13px; }
.dfx-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dfx-btn { background: ${C.accent}; color: #fff; border: none; border-radius: 6px;
  padding: 6px 14px; font-size: 13px; cursor: pointer; }
.dfx-btn:disabled { opacity: 0.5; cursor: default; }
.dfx-btn2 { background: transparent; color: ${C.text}; border: 1px solid ${C.border};
  border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.dfx-btn2:disabled { opacity: 0.5; cursor: default; }
.dfx-input { flex: 1; min-width: 120px; background: transparent; color: ${C.text};
  border: 1px solid ${C.border}; border-radius: 6px; padding: 6px 8px; font-size: 13px;
  font-family: ui-monospace, Consolas, monospace; }
.dfx-area { width: 100%; box-sizing: border-box; min-height: 120px; resize: vertical;
  background: transparent; color: ${C.text}; border: 1px solid ${C.border};
  border-radius: 6px; padding: 8px; font-size: 12.5px; line-height: 1.5;
  font-family: ui-monospace, Consolas, monospace; }
.dfx-label { color: ${C.dim}; font-size: 12px; }
.dfx-badge { display: inline-block; border-radius: 10px; padding: 1px 8px; font-size: 11.5px; }
.dfx-badge-ins { background: ${C.insBg}; color: ${C.insFg}; }
.dfx-badge-del { background: ${C.delBg}; color: ${C.delFg}; }
.dfx-badge-mod { color: ${C.modFg}; border: 1px solid ${C.modFg}; }
.dfx-badge-order { color: ${C.orderFg}; border: 1px solid ${C.orderFg}; }
.dfx-err { border: 1px solid ${C.delFg}; color: ${C.delFg}; border-radius: 6px;
  padding: 8px 10px; font-size: 12.5px; white-space: pre-wrap; }
.dfx-note { color: ${C.dim}; font-size: 11.5px; }
.dfx-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dfx-table td { border-top: 1px solid ${C.border}; padding: 5px 8px;
  vertical-align: top; word-break: break-all; font-family: ui-monospace, Consolas, monospace; }
.dfx-hunkhead { background: ${C.panelBg}; color: ${C.dim}; font-family: ui-monospace, Consolas, monospace;
  font-size: 11.5px; padding: 2px 8px; }
.dfx-line { display: flex; font-family: ui-monospace, Consolas, monospace;
  font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; }
.dfx-gutter { flex: 0 0 46px; text-align: right; padding-right: 6px; color: ${C.dim};
  user-select: none; font-size: 11px; }
.dfx-sign { flex: 0 0 14px; user-select: none; }
`;
  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
}
if (typeof document !== "undefined") injectStyle();
function ErrBanner({ message }) {
  return /* @__PURE__ */ jsx("div", { className: "dfx-err", children: message });
}
function StatsBadgesText({ stats, truncated }) {
  return /* @__PURE__ */ jsxs("span", { className: "dfx-row", children: [
    /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-ins", children: [
      "+",
      stats.additions
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-del", children: [
      "-",
      stats.deletions
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-mod", children: [
      "~",
      stats.modifies
    ] }),
    truncated ? /* @__PURE__ */ jsx("span", { className: "dfx-note", children: "\uFF08\u8F93\u51FA\u8D85\u4E0A\u9650\u5DF2\u622A\u65AD\uFF09" }) : null
  ] });
}
function StatsBadgesJson({ stats, truncated }) {
  return /* @__PURE__ */ jsxs("span", { className: "dfx-row", children: [
    /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-mod", children: [
      "\u6539 ",
      stats.changed
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-ins", children: [
      "\u589E ",
      stats.added
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-del", children: [
      "\u5220 ",
      stats.removed
    ] }),
    stats.order ? /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-order", children: [
      "\u987A\u5E8F ",
      stats.order
    ] }) : null,
    truncated ? /* @__PURE__ */ jsx("span", { className: "dfx-note", children: "\uFF08\u5DEE\u5F02\u8D85\u4E0A\u9650\u5DF2\u622A\u65AD\uFF09" }) : null
  ] });
}
function renderSpans(spans, baseType) {
  if (!spans || !spans.length) return null;
  return spans.map((sp, i) => {
    const color = sp.type === "equal" ? void 0 : baseType === "insert" ? C.insFg : C.delFg;
    const bg = sp.type === "equal" ? void 0 : baseType === "insert" ? C.insBg : C.delBg;
    return /* @__PURE__ */ jsx("span", { style: { color, background: bg, borderRadius: 2 }, children: sp.text }, i);
  });
}
function TextDiffView({ result }) {
  const [view, setView] = useState("side");
  const [hunkIdx, setHunkIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const hunkRefs = useRef([]);
  const hunks = result.hunks || [];
  const stats = { additions: result.stats.additions || 0, deletions: result.stats.deletions || 0, modifies: result.stats.modifies || 0 };
  const jump = (idx) => {
    if (!hunks.length) return;
    const next = (idx % hunks.length + hunks.length) % hunks.length;
    setHunkIdx(next);
    const el = hunkRefs.current[next];
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const copyPatch = async () => {
    if (!result.patch) return;
    try {
      await navigator.clipboard.writeText(result.patch);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "dfx-row", style: { marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx(StatsBadgesText, { stats, truncated: result.truncated }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { className: "dfx-btn2", onClick: () => setView(view === "side" ? "unified" : "side"), children: view === "side" ? "\u5207\u7EDF\u4E00\u89C6\u56FE" : "\u5207\u5E76\u6392\u89C6\u56FE" }),
      hunks.length > 1 ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { className: "dfx-btn2", onClick: () => jump(hunkIdx - 1), children: "\u4E0A\u4E00\u5904" }),
        /* @__PURE__ */ jsxs("span", { className: "dfx-note", children: [
          hunkIdx + 1,
          "/",
          hunks.length
        ] }),
        /* @__PURE__ */ jsx("button", { className: "dfx-btn2", onClick: () => jump(hunkIdx + 1), children: "\u4E0B\u4E00\u5904" })
      ] }) : null,
      /* @__PURE__ */ jsx("button", { className: "dfx-btn2", onClick: copyPatch, children: copied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236 patch" })
    ] }),
    hunks.length === 0 ? /* @__PURE__ */ jsx("div", { className: "dfx-note", children: "\u4E24\u4EFD\u5185\u5BB9\u6CA1\u6709\u5DEE\u5F02\u3002" }) : hunks.map((h, hi) => /* @__PURE__ */ jsxs("div", { ref: (el) => {
      hunkRefs.current[hi] = el;
    }, style: { marginBottom: 14 }, children: [
      /* @__PURE__ */ jsxs("div", { className: "dfx-hunkhead", children: [
        "@@ A:",
        h.aStart,
        " B:",
        h.bStart,
        " @@"
      ] }),
      view === "side" ? /* @__PURE__ */ jsx(SideRows, { rows: h.rows }) : /* @__PURE__ */ jsx(UnifiedLines, { lines: h.lines })
    ] }, hi))
  ] });
}
function SideRows({ rows }) {
  return /* @__PURE__ */ jsx("div", { style: { border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }, children: rows.map((r, i) => {
    const bgL = r.left && r.left.type !== "equal" ? r.left.type === "delete" ? C.delBg : C.insBg : void 0;
    const bgR = r.right && r.right.type !== "equal" ? r.right.type === "insert" ? C.insBg : C.delBg : void 0;
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex" }, children: [
      /* @__PURE__ */ jsxs("div", { className: "dfx-line", style: { flex: 1, background: bgL, borderRight: `1px solid ${C.border}` }, children: [
        /* @__PURE__ */ jsx("span", { className: "dfx-gutter", children: r.left ? r.left.no : "" }),
        /* @__PURE__ */ jsx("span", { className: "dfx-sign", style: { color: C.delFg }, children: r.left && r.left.type !== "equal" ? "-" : "" }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 }, children: r.left ? r.left.type === "modify" ? renderSpans(r.left.spans, "delete") : r.left.text : "" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dfx-line", style: { flex: 1, background: bgR }, children: [
        /* @__PURE__ */ jsx("span", { className: "dfx-gutter", children: r.right ? r.right.no : "" }),
        /* @__PURE__ */ jsx("span", { className: "dfx-sign", style: { color: C.insFg }, children: r.right && r.right.type !== "equal" ? "+" : "" }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 }, children: r.right ? r.right.type === "modify" ? renderSpans(r.right.spans, "insert") : r.right.text : "" })
      ] })
    ] }, i);
  }) });
}
function UnifiedLines({ lines }) {
  const out = [];
  for (const it of lines) {
    if (it.type === "equal") {
      out.push({ key: `e${it.aNo}`, sign: " ", aNo: it.aNo, bNo: it.bNo, body: it.text || "" });
    } else if (it.type === "delete") {
      out.push({ key: `d${it.aNo}`, sign: "-", color: C.delFg, bg: C.delBg, aNo: it.aNo, body: it.text || "" });
    } else if (it.type === "insert") {
      out.push({ key: `i${it.bNo}`, sign: "+", color: C.insFg, bg: C.insBg, bNo: it.bNo, body: it.text || "" });
    } else {
      out.push({ key: `ma${it.aNo}`, sign: "-", color: C.delFg, bg: C.delBg, aNo: it.aNo, body: renderSpans(it.spans ? it.spans.left : null, "delete") || it.aText || "" });
      out.push({ key: `mb${it.aNo}`, sign: "+", color: C.insFg, bg: C.insBg, bNo: it.bNo, body: renderSpans(it.spans ? it.spans.right : null, "insert") || it.bText || "" });
    }
  }
  return /* @__PURE__ */ jsx("div", { style: { border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }, children: out.map((l) => /* @__PURE__ */ jsxs("div", { className: "dfx-line", style: { background: l.bg }, children: [
    /* @__PURE__ */ jsx("span", { className: "dfx-gutter", children: l.aNo ?? "" }),
    /* @__PURE__ */ jsx("span", { className: "dfx-gutter", style: { flexBasis: 40 }, children: l.bNo ?? "" }),
    /* @__PURE__ */ jsx("span", { className: "dfx-sign", style: { color: l.color }, children: l.sign }),
    /* @__PURE__ */ jsx("span", { style: { flex: 1 }, children: l.body })
  ] }, l.key)) });
}
var TYPE_LABEL = {
  changed: "\u503C\u53D8\u66F4",
  added: "\u65B0\u589E",
  removed: "\u5220\u9664",
  order: "\u987A\u5E8F"
};
function JsonDiffView({ result }) {
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const changes = result.changes || [];
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return changes.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (!q) return true;
      return c.path.toLowerCase().includes(q) || (c.oldText || "").toLowerCase().includes(q) || (c.newText || "").toLowerCase().includes(q);
    });
  }, [changes, filter, typeFilter]);
  const copyMd = async () => {
    const md = changes.map((c) => {
      if (c.type === "added") return `- \`${c.path}\` \u65B0\u589E\uFF1A${c.newText ?? ""}`;
      if (c.type === "removed") return `- \`${c.path}\` \u5220\u9664\uFF08\u539F ${c.oldText ?? ""}\uFF09`;
      if (c.type === "order") return `- \`${c.path}\` ${c.note || "\u987A\u5E8F\u53D8\u5316"}`;
      return `- \`${c.path}\`\uFF1A${c.oldText ?? ""} \u2192 ${c.newText ?? ""}${c.note ? `\uFF08${c.note}\uFF09` : ""}`;
    }).join("\n");
    try {
      await navigator.clipboard.writeText(md);
    } catch (_) {
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "dfx-row", style: { marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx(StatsBadgesJson, { stats: { changed: result.stats.changed || 0, added: result.stats.added || 0, removed: result.stats.removed || 0, order: result.stats.order || 0 }, truncated: result.truncated }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("input", { className: "dfx-input", style: { maxWidth: 220, flex: "none" }, placeholder: "\u6309\u8DEF\u5F84/\u503C\u8FC7\u6EE4\u2026", value: filter, onChange: (e) => setFilter(e.target.value) }),
      /* @__PURE__ */ jsx("button", { className: "dfx-btn2", onClick: copyMd, children: "\u590D\u5236\u6E05\u5355" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "dfx-row", style: { marginBottom: 8 }, children: ["all", "changed", "added", "removed", "order"].map((t) => /* @__PURE__ */ jsx(
      "button",
      {
        className: "dfx-btn2",
        style: typeFilter === t ? { borderColor: C.accent, color: C.accent } : void 0,
        onClick: () => setTypeFilter(t),
        children: t === "all" ? "\u5168\u90E8" : TYPE_LABEL[t]
      },
      t
    )) }),
    !changes.length ? /* @__PURE__ */ jsx("div", { className: "dfx-note", children: "\u4E24\u4E2A JSON \u5728\u8BED\u4E49\u4E0A\u5B8C\u5168\u4E00\u81F4\uFF08\u952E\u5E8F/\u6570\u7EC4\u987A\u5E8F\u5DEE\u5F02\u4E0D\u8BA1\uFF09\u3002" }) : /* @__PURE__ */ jsx("table", { className: "dfx-table", children: /* @__PURE__ */ jsx("tbody", { children: shown.map((c, i) => /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("td", { style: { width: 64, whiteSpace: "nowrap" }, children: /* @__PURE__ */ jsx(
        "span",
        {
          className: `dfx-badge ${c.type === "added" ? "dfx-badge-ins" : c.type === "removed" ? "dfx-badge-del" : c.type === "order" ? "dfx-badge-order" : "dfx-badge-mod"}`,
          children: TYPE_LABEL[c.type]
        }
      ) }),
      /* @__PURE__ */ jsx("td", { style: { width: "38%", color: C.orderFg }, children: c.path }),
      /* @__PURE__ */ jsx("td", { children: c.type === "added" ? /* @__PURE__ */ jsx("span", { style: { color: C.insFg }, children: c.newText }) : c.type === "removed" ? /* @__PURE__ */ jsxs("span", { style: { color: C.delFg }, children: [
        "\uFF08\u539F ",
        c.oldText,
        "\uFF09"
      ] }) : c.type === "order" ? /* @__PURE__ */ jsx("span", { style: { color: C.orderFg }, children: c.note }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("span", { style: { color: C.delFg, textDecoration: "line-through" }, children: c.oldText }),
        " \u2192 ",
        /* @__PURE__ */ jsx("span", { style: { color: C.insFg }, children: c.newText }),
        c.note ? /* @__PURE__ */ jsxs("span", { className: "dfx-note", children: [
          "\uFF08",
          c.note,
          "\uFF09"
        ] }) : null
      ] }) })
    ] }, i)) }) })
  ] });
}
function DirDiffView({ result, onOpenPair }) {
  const lists = [
    { tag: "\u0394", title: "\u5185\u5BB9\u6709\u5DEE\u5F02", list: result.changed, color: C.modFg },
    { tag: "<", title: "\u4EC5 A \u6709", list: result.onlyLeft, color: C.delFg },
    { tag: ">", title: "\u4EC5 B \u6709", list: result.onlyRight, color: C.insFg }
  ];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "dfx-row", style: { marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-mod", children: [
        "\u5DEE\u5F02 ",
        result.changed.total
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-del", children: [
        "\u4EC5A ",
        result.onlyLeft.total
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "dfx-badge dfx-badge-ins", children: [
        "\u4EC5B ",
        result.onlyRight.total
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "dfx-badge", style: { color: C.dim }, children: [
        "\u76F8\u540C ",
        result.same
      ] }),
      result.unknown ? /* @__PURE__ */ jsxs("span", { className: "dfx-note", children: [
        "\u672A\u77E5 ",
        result.unknown,
        "\uFF08\u540C\u5927\u5C0F\u672A\u54C8\u5E0C\uFF09"
      ] }) : null,
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsxs("span", { className: "dfx-note", children: [
        "A ",
        result.aMeta.entries,
        " \u9879 / B ",
        result.bMeta.entries,
        " \u9879",
        result.aMeta.skipped || result.bMeta.skipped ? `\uFF08\u8DF3\u8FC7\u4E0D\u53EF\u8BFB ${(result.aMeta.skipped || 0) + (result.bMeta.skipped || 0)}\uFF09` : ""
      ] })
    ] }),
    lists.map(({ tag, title, list, color }) => /* @__PURE__ */ jsxs("div", { style: { marginBottom: 12 }, children: [
      /* @__PURE__ */ jsxs("div", { className: "dfx-label", style: { color, marginBottom: 4 }, children: [
        tag,
        " ",
        title,
        "\uFF08",
        list.total,
        list.truncated ? "\uFF0C\u622A\u65AD" : "",
        "\uFF09",
        tag === "\u0394" ? "\u2014 \u70B9\u51FB\u8FDB\u6587\u4EF6\u5BF9\u6BD4" : ""
      ] }),
      /* @__PURE__ */ jsx("div", { style: { border: `1px solid ${C.border}`, borderRadius: 6, maxHeight: 260, overflow: "auto" }, children: list.items.length === 0 ? /* @__PURE__ */ jsx("div", { className: "dfx-note", style: { padding: "6px 8px" }, children: "\u65E0" }) : list.items.map((p) => /* @__PURE__ */ jsxs(
        "div",
        {
          className: "dfx-line",
          style: { padding: "2px 8px", cursor: tag === "\u0394" ? "pointer" : "default" },
          onClick: () => {
            if (tag !== "\u0394") return;
            onOpenPair(p, p, p);
          },
          children: [
            /* @__PURE__ */ jsx("span", { style: { color, marginRight: 8 }, children: tag }),
            /* @__PURE__ */ jsx("span", { children: p })
          ]
        },
        p
      )) })
    ] }, tag))
  ] });
}
function UrlSideCard({ tag, side }) {
  const statusColor = side.status >= 200 && side.status < 300 ? C.insFg : side.status === 0 ? C.delFg : C.modFg;
  return /* @__PURE__ */ jsxs("div", { style: { flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", minWidth: 240 }, children: [
    /* @__PURE__ */ jsxs("div", { className: "dfx-row", children: [
      /* @__PURE__ */ jsxs("span", { className: "dfx-badge", style: { color: statusColor, border: `1px solid ${statusColor}` }, children: [
        "HTTP ",
        side.status
      ] }),
      /* @__PURE__ */ jsx("span", { className: "dfx-label", children: tag })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "dfx-note", style: { marginTop: 4, wordBreak: "break-all" }, children: side.url }),
    /* @__PURE__ */ jsxs("div", { className: "dfx-note", style: { marginTop: 2 }, children: [
      (side.byteLength / 1024).toFixed(1),
      "KB \xB7 ",
      side.elapsedMs,
      "ms",
      side.redirects ? ` \xB7 \u91CD\u5B9A\u5411 ${side.redirects} \u8DF3` : "",
      side.contentType ? ` \xB7 ${side.contentType.split(";")[0]}` : "",
      side.truncated ? " \xB7 \u5DF2\u622A\u65AD" : ""
    ] })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var TABS = [
  { id: "diff", label: "\u5BF9\u6BD4" },
  { id: "dirs", label: "\u76EE\u5F55" },
  { id: "urls", label: "\u63A5\u53E3" },
  { id: "history", label: "\u5386\u53F2" }
];
function Panel({ pluginId }) {
  const [tab, setTab] = useState2("diff");
  const [online, setOnline] = useState2(null);
  const probe = useCallback(async () => {
    try {
      await api.status();
      setOnline(true);
    } catch (_) {
      setOnline(false);
    }
  }, []);
  useEffect(() => {
    void probe();
    const timer = setInterval(() => void probe(), 3e4);
    return () => clearInterval(timer);
  }, [probe]);
  return /* @__PURE__ */ jsxs2("div", { style: { padding: 12, height: "100%", boxSizing: "border-box", overflow: "auto" }, children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }, children: [
      /* @__PURE__ */ jsx2("span", { style: { fontSize: 15, fontWeight: 600 }, children: "Diff \u5BF9\u6BD4\u53F0" }),
      /* @__PURE__ */ jsx2(
        "span",
        {
          title: online ? "\u540E\u53F0\u670D\u52A1\u8FD0\u884C\u4E2D" : "\u540E\u53F0\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF08\u9762\u677F\u6253\u5F00\u65F6\u4F1A\u81EA\u52A8\u62C9\u8D77\uFF0C\u7A0D\u540E\u91CD\u8BD5\uFF09",
          style: {
            width: 8,
            height: 8,
            borderRadius: 4,
            background: online === null ? "#9ca3af" : online ? "#3fb950" : "#f85149"
          }
        }
      ),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, opacity: 0.55 }, children: "\u5168\u6D41\u7A0B\u672C\u673A \xB7 \u6B63\u6587\u4E0D\u51FA\u673A" })
    ] }),
    /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid rgba(128,128,128,0.25)" }, children: TABS.map((t) => /* @__PURE__ */ jsx2(
      "button",
      {
        onClick: () => setTab(t.id),
        style: {
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          padding: "6px 12px",
          color: tab === t.id ? "var(--p-accent, #4a7dff)" : "inherit",
          borderBottom: tab === t.id ? "2px solid var(--p-accent, #4a7dff)" : "2px solid transparent"
        },
        children: t.label
      },
      t.id
    )) }),
    tab === "diff" && /* @__PURE__ */ jsx2(DiffTab, {}),
    tab === "dirs" && /* @__PURE__ */ jsx2(DirsTab, { onOpenPair: (a, b) => {
      prefilledFiles.aPath = a;
      prefilledFiles.bPath = b;
      prefilledFiles.stamp = Date.now();
      setTab("diff");
    } }),
    tab === "urls" && /* @__PURE__ */ jsx2(UrlsTab, {}),
    tab === "history" && /* @__PURE__ */ jsx2(HistoryTab, {}),
    /* @__PURE__ */ jsxs2("div", { style: { marginTop: 18, fontSize: 11, opacity: 0.45 }, children: [
      "diff-desk \xB7 ",
      pluginId,
      " \xB7 \u6B63\u6587\u4E0D\u843D\u76D8\u4E0D\u4E0A\u4F20\uFF1B\u5386\u53F2\u4EC5\u5B58\u5143\u6570\u636E"
    ] })
  ] });
}
var prefilledFiles = {};
function DiffTab() {
  const [source, setSource] = useState2("paste");
  const [mode, setMode] = useState2("auto");
  const [a, setA] = useState2("");
  const [b, setB] = useState2("");
  const [aPath, setAPath] = useState2("");
  const [bPath, setBPath] = useState2("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState2(false);
  const [ignoreCase, setIgnoreCase] = useState2(false);
  const [arrayAlign, setArrayAlign] = useState2(true);
  const [ignorePaths, setIgnorePaths] = useState2("");
  const [running, setRunning] = useState2(false);
  const [error, setError] = useState2("");
  const [result, setResult] = useState2(null);
  const [consumedStamp, setConsumedStamp] = useState2(0);
  useEffect(() => {
    if (prefilledFiles.stamp && prefilledFiles.stamp !== consumedStamp) {
      setSource("file");
      setAPath(prefilledFiles.aPath || "");
      setBPath(prefilledFiles.bPath || "");
      setConsumedStamp(prefilledFiles.stamp);
    }
  }, [consumedStamp]);
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const opts = {
        ignoreWhitespace,
        ignoreCase,
        arrayAlign,
        ignorePaths: ignorePaths.split(",").map((s) => s.trim()).filter(Boolean)
      };
      const r = source === "paste" ? await api.diffText(a, b, mode === "auto" ? void 0 : mode, opts) : await api.diffFiles(aPath.trim(), bPath.trim(), mode === "auto" ? void 0 : mode, opts);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };
  const canRun = source === "paste" ? true : Boolean(aPath.trim() && bPath.trim());
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 4 }, children: ["paste", "file"].map((s) => /* @__PURE__ */ jsx2("button", { className: "dfx-btn2", style: source === s ? { borderColor: "var(--p-accent, #4a7dff)", color: "var(--p-accent, #4a7dff)" } : void 0, onClick: () => setSource(s), children: s === "paste" ? "\u7C98\u8D34" : "\u6587\u4EF6\u8DEF\u5F84" }, s)) }),
      /* @__PURE__ */ jsxs2(
        "select",
        {
          value: mode,
          onChange: (e) => setMode(e.target.value),
          style: { background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 6, padding: "5px 8px", fontSize: 12.5 },
          children: [
            /* @__PURE__ */ jsx2("option", { value: "auto", children: "\u81EA\u52A8\uFF08\u80FD\u89E3\u6790 JSON \u5C31\u8BED\u4E49\u5BF9\u6BD4\uFF09" }),
            /* @__PURE__ */ jsx2("option", { value: "text", children: "\u6587\u672C\u884C\u7EA7" }),
            /* @__PURE__ */ jsx2("option", { value: "json", children: "JSON \u8BED\u4E49" })
          ]
        }
      ),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("button", { className: "dfx-btn", disabled: running || !canRun, onClick: () => void run(), children: running ? "\u5BF9\u6BD4\u4E2D\u2026" : "\u5BF9\u6BD4" })
    ] }),
    source === "paste" ? /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, flexDirection: "column" }, children: [
      /* @__PURE__ */ jsx2("textarea", { className: "dfx-area", placeholder: "A \u4FA7\uFF1A\u7C98\u8D34\u6587\u672C\u6216 JSON\uFF08\u22645MB\uFF09", value: a, onChange: (e) => setA(e.target.value) }),
      /* @__PURE__ */ jsx2("textarea", { className: "dfx-area", placeholder: "B \u4FA7\uFF1A\u7C98\u8D34\u6587\u672C\u6216 JSON\uFF08\u22645MB\uFF09", value: b, onChange: (e) => setB(e.target.value) })
    ] }) : /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, flexDirection: "column" }, children: [
      /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "A \u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 D:\\\\conf\\\\app.json\uFF0C\u226420MB\uFF0CUTF-8/GBK \u81EA\u52A8\u8BC6\u522B\uFF09", value: aPath, onChange: (e) => setAPath(e.target.value) }),
      /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "B \u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84", value: bPath, onChange: (e) => setBPath(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 14, margin: "8px 0", flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsxs2("label", { style: { fontSize: 12, display: "flex", gap: 4, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: ignoreWhitespace, onChange: (e) => setIgnoreWhitespace(e.target.checked) }),
        " \u5FFD\u7565\u7A7A\u767D"
      ] }),
      /* @__PURE__ */ jsxs2("label", { style: { fontSize: 12, display: "flex", gap: 4, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: ignoreCase, onChange: (e) => setIgnoreCase(e.target.checked) }),
        " \u5FFD\u7565\u5927\u5C0F\u5199"
      ] }),
      mode !== "text" ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
        /* @__PURE__ */ jsxs2("label", { style: { fontSize: 12, display: "flex", gap: 4, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: arrayAlign, onChange: (e) => setArrayAlign(e.target.checked) }),
          " \u6570\u7EC4\u6309\u5185\u5BB9\u5BF9\u9F50"
        ] }),
        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 12, display: "flex", gap: 4, alignItems: "center", flex: 1, minWidth: 200 }, children: [
          "\u5FFD\u7565\u8DEF\u5F84\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u5982 $.meta.updatedAt, $.items[*].ts\uFF09",
          /* @__PURE__ */ jsx2("input", { className: "dfx-input", style: { flex: 1 }, value: ignorePaths, onChange: (e) => setIgnorePaths(e.target.value) })
        ] })
      ] }) : null
    ] }),
    error ? /* @__PURE__ */ jsx2(ErrBanner, { message: error }) : null,
    result ? /* @__PURE__ */ jsx2("div", { style: { marginTop: 10 }, children: result.kind === "json" ? /* @__PURE__ */ jsx2(JsonDiffView, { result }) : /* @__PURE__ */ jsx2(TextDiffView, { result }) }) : null
  ] });
}
function DirsTab({ onOpenPair }) {
  const [aPath, setAPath] = useState2("");
  const [bPath, setBPath] = useState2("");
  const [includeNodeModules, setIncludeNodeModules] = useState2(false);
  const [running, setRunning] = useState2(false);
  const [error, setError] = useState2("");
  const [result, setResult] = useState2(null);
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const r = await api.diffDirs(aPath.trim(), bPath.trim(), { includeNodeModules });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };
  const openPair = (rel) => {
    if (!result) return;
    const rootA = (result.aMeta.path || "").replace(/[\\/]+$/, "");
    const rootB = (result.bMeta.path || "").replace(/[\\/]+$/, "");
    onOpenPair(`${rootA}/${rel}`, `${rootB}/${rel}`);
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "A \u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u9ED8\u8BA4\u8DF3\u8FC7 node_modules/.git \u7B49\uFF09", value: aPath, onChange: (e) => setAPath(e.target.value) }),
      /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "B \u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84", value: bPath, onChange: (e) => setBPath(e.target.value) }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 14, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs2("label", { style: { fontSize: 12, display: "flex", gap: 4, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: includeNodeModules, onChange: (e) => setIncludeNodeModules(e.target.checked) }),
          " \u5305\u542B node_modules"
        ] }),
        /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx2("button", { className: "dfx-btn", disabled: running || !aPath.trim() || !bPath.trim(), onClick: () => void run(), children: running ? "\u904D\u5386\u4E2D\u2026" : "\u5BF9\u6BD4\u76EE\u5F55" })
      ] })
    ] }),
    error ? /* @__PURE__ */ jsx2(ErrBanner, { message: error }) : null,
    result ? /* @__PURE__ */ jsx2("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2(DirDiffView, { result, onOpenPair: (rel) => openPair(rel) }) }) : null
  ] });
}
function UrlsTab() {
  const [aUrl, setAUrl] = useState2("");
  const [bUrl, setBUrl] = useState2("");
  const [method, setMethod] = useState2("GET");
  const [headers, setHeaders] = useState2([]);
  const [body, setBody] = useState2("");
  const [mode, setMode] = useState2("auto");
  const [running, setRunning] = useState2(false);
  const [error, setError] = useState2("");
  const [result, setResult] = useState2(null);
  const [proxy, setProxy] = useState2("");
  const [proxySaved, setProxySaved] = useState2(false);
  useEffect(() => {
    void (async () => {
      try {
        const s = await api.settings();
        setProxy(s.proxy || "");
      } catch (_) {
      }
    })();
  }, []);
  const saveProxy = async () => {
    try {
      const r = await api.saveSettings({ proxy: proxy.trim() });
      setProxy(r.proxy);
      setProxySaved(true);
      setTimeout(() => setProxySaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const setHeader = (i, patch) => {
    setHeaders((hs) => hs.map((h, idx) => idx === i ? { ...h, ...patch } : h));
  };
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const headerObj = {};
      for (const h of headers) {
        if (h.name.trim()) headerObj[h.name.trim()] = h.value;
      }
      const r = await api.diffUrls(aUrl.trim(), bUrl.trim(), {
        method,
        headers: Object.keys(headerObj).length ? headerObj : void 0,
        body: method === "POST" && body ? body : void 0,
        mode: mode === "auto" ? void 0 : mode
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };
  const canRun = Boolean(aUrl.trim() && bUrl.trim());
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { className: "dfx-note", style: { marginBottom: 8 }, children: "\u4F1A\u5411\u4E24\u4E2A\u5730\u5740\u53D1\u8D77\u771F\u5B9E\u8BF7\u6C42\uFF08staging vs prod\u3001\u53D1\u5E03\u524D\u540E\u540C\u63A5\u53E3\uFF09\u3002\u79C1\u7F51/\u5143\u6570\u636E\u5730\u5740\u88AB\u56F4\u680F\u62D2\u7EDD\uFF1B\u5E26\u654F\u611F\u5934\u7684\u54CD\u5E94\u53EA\u5728\u672C\u673A\u5BF9\u6BD4\uFF0C\u4E0D\u4E0A\u4F20\u3002" }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "dfx-label", style: { flexShrink: 0 }, children: "\u51FA\u7F51\u4EE3\u7406" }),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "dfx-input",
          style: { maxWidth: 280 },
          placeholder: "\u7559\u7A7A=\u81EA\u52A8\uFF08\u7CFB\u7EDF\u4EE3\u7406\u2192\u76F4\u8FDE\uFF09\uFF0C\u5982 http://127.0.0.1:7890",
          value: proxy,
          onChange: (e) => setProxy(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx2("button", { className: "dfx-btn2", onClick: () => void saveProxy(), children: proxySaved ? "\u5DF2\u4FDD\u5B58 \u2713" : "\u4FDD\u5B58" })
    ] }),
    /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "A \u4FA7\u5B8C\u6574 URL\uFF08https://staging.example.com/api/config\uFF09", value: aUrl, onChange: (e) => setAUrl(e.target.value) }) }),
    /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "B \u4FA7\u5B8C\u6574 URL", value: bUrl, onChange: (e) => setBUrl(e.target.value) }) }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs2("select", { value: method, onChange: (e) => setMethod(e.target.value), style: { background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 6, padding: "5px 8px", fontSize: 12.5 }, children: [
        /* @__PURE__ */ jsx2("option", { value: "GET", children: "GET" }),
        /* @__PURE__ */ jsx2("option", { value: "POST", children: "POST" })
      ] }),
      /* @__PURE__ */ jsxs2("select", { value: mode, onChange: (e) => setMode(e.target.value), style: { background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 6, padding: "5px 8px", fontSize: 12.5 }, children: [
        /* @__PURE__ */ jsx2("option", { value: "auto", children: "\u81EA\u52A8\u8BC6\u522B JSON" }),
        /* @__PURE__ */ jsx2("option", { value: "text", children: "\u6587\u672C" }),
        /* @__PURE__ */ jsx2("option", { value: "json", children: "JSON \u8BED\u4E49" })
      ] }),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("button", { className: "dfx-btn", disabled: running || !canRun, onClick: () => void run(), children: running ? "\u8BF7\u6C42\u4E2D\u2026" : "\u8BF7\u6C42\u5E76\u5BF9\u6BD4" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 8 }, children: [
      headers.map((h, i) => /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx2("input", { className: "dfx-input", style: { maxWidth: 200 }, placeholder: "\u5934\u540D\uFF08\u5982 Authorization\uFF09", value: h.name, onChange: (e) => setHeader(i, { name: e.target.value }) }),
        /* @__PURE__ */ jsx2("input", { className: "dfx-input", placeholder: "\u503C\uFF08\u4E24\u4FA7\u5171\u7528\uFF0C\u22648 \u4E2A\uFF09", value: h.value, onChange: (e) => setHeader(i, { value: e.target.value }) }),
        /* @__PURE__ */ jsx2("button", { className: "dfx-btn2", onClick: () => setHeaders((hs) => hs.filter((_, idx) => idx !== i)), children: "\u2715" })
      ] }, i)),
      headers.length < 8 ? /* @__PURE__ */ jsx2("button", { className: "dfx-btn2", onClick: () => setHeaders((hs) => hs.concat({ name: "", value: "" })), children: "+ \u8BF7\u6C42\u5934" }) : null
    ] }),
    method === "POST" ? /* @__PURE__ */ jsx2("textarea", { className: "dfx-area", style: { minHeight: 70, marginBottom: 8 }, placeholder: "POST body\uFF08\u226464KB\uFF0C\u4E24\u4FA7\u5171\u7528\uFF09", value: body, onChange: (e) => setBody(e.target.value) }) : null,
    error ? /* @__PURE__ */ jsx2(ErrBanner, { message: error }) : null,
    result && result.aSide && result.bSide ? /* @__PURE__ */ jsxs2("div", { style: { marginTop: 10 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, marginBottom: 10 }, children: [
        /* @__PURE__ */ jsx2(UrlSideCard, { tag: "A", side: result.aSide }),
        /* @__PURE__ */ jsx2(UrlSideCard, { tag: "B", side: result.bSide })
      ] }),
      result.kind === "json" ? /* @__PURE__ */ jsx2(JsonDiffView, { result }) : /* @__PURE__ */ jsx2(TextDiffView, { result })
    ] }) : null
  ] });
}
function HistoryTab() {
  const [items, setItems] = useState2(null);
  const [error, setError] = useState2("");
  const [selftest, setSelftest] = useState2(null);
  const load = useCallback(async () => {
    try {
      const r = await api.history();
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const clear = async () => {
    try {
      await api.historyClear();
      setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const runSelftest = async () => {
    setSelftest({ running: true, items: [], allGreen: false });
    try {
      const r = await api.selftest();
      setSelftest({ running: false, items: r.items, allGreen: r.allGreen });
    } catch (e) {
      setSelftest({ running: false, items: [{ name: "\u81EA\u68C0\u6267\u884C\u5931\u8D25", ok: false, detail: e instanceof Error ? e.message : String(e) }], allGreen: false });
    }
  };
  const fmtStats = (it) => {
    const s = it.stats || {};
    if (it.kind === "json") return `\u6539${s.changed || 0}/\u589E${s.added || 0}/\u5220${s.removed || 0}/\u5E8F${s.order || 0}`;
    if (it.kind === "dirs") return `\u5DEE\u5F02${s.changed || 0}/A\u72EC${s.onlyLeft || 0}/B\u72EC${s.onlyRight || 0}`;
    return `+${s.additions || 0}/-${s.deletions || 0}/~${s.modifies || 0}`;
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "dfx-note", children: "\u4EC5\u5143\u6570\u636E\uFF08\u65F6\u95F4/\u5BF9\u8C61/\u7EDF\u8BA1\uFF09\uFF0C\u4E0D\u5B58\u5BF9\u6BD4\u6B63\u6587" }),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("button", { className: "dfx-btn2", onClick: () => void runSelftest(), disabled: !!selftest?.running, children: selftest?.running ? "\u81EA\u68C0\u4E2D\u2026" : "\u8FD0\u884C\u81EA\u68C0" }),
      /* @__PURE__ */ jsx2("button", { className: "dfx-btn2", onClick: () => void clear(), children: "\u6E05\u7A7A\u5386\u53F2" })
    ] }),
    selftest ? /* @__PURE__ */ jsxs2("div", { style: { border: "1px solid rgba(128,128,128,0.25)", borderRadius: 6, padding: 8, marginBottom: 12 }, children: [
      selftest.items.map((it, i) => /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12.5, padding: "2px 0" }, children: [
        it.ok ? "\u2705" : "\u274C",
        " ",
        it.name,
        !it.ok && it.detail ? /* @__PURE__ */ jsxs2("span", { style: { color: "var(--p-danger, #f85149)" }, children: [
          " \u2014 ",
          it.detail
        ] }) : null
      ] }, i)),
      selftest.items.length ? /* @__PURE__ */ jsx2("div", { className: "dfx-note", style: { marginTop: 4 }, children: selftest.allGreen ? "\u5168\u90E8\u901A\u8FC7\u3002" : "\u5B58\u5728\u5931\u8D25\u9879\u3002" }) : null
    ] }) : null,
    error ? /* @__PURE__ */ jsx2(ErrBanner, { message: error }) : null,
    !items ? /* @__PURE__ */ jsx2("div", { className: "dfx-note", children: "\u52A0\u8F7D\u4E2D\u2026" }) : items.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "dfx-note", children: "\u8FD8\u6CA1\u6709\u5BF9\u6BD4\u8BB0\u5F55\u3002" }) : /* @__PURE__ */ jsx2("table", { className: "dfx-table", children: /* @__PURE__ */ jsx2("tbody", { children: items.map((it) => /* @__PURE__ */ jsxs2("tr", { children: [
      /* @__PURE__ */ jsx2("td", { style: { width: 150, whiteSpace: "nowrap" }, children: new Date(it.ts).toLocaleString() }),
      /* @__PURE__ */ jsx2("td", { style: { width: 50 }, children: it.kind }),
      /* @__PURE__ */ jsx2("td", { style: { wordBreak: "break-all" }, children: it.label }),
      /* @__PURE__ */ jsx2("td", { style: { whiteSpace: "nowrap" }, children: fmtStats(it) })
    ] }, it.id)) }) })
  ] });
}

// src/index.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function DiffDeskEntry(props) {
  return /* @__PURE__ */ jsx3(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  DiffDeskEntry as default
};
