// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState2 } from "react";

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
async function svcHttp(method, url, bodyObj, timeoutMs = 3e5) {
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
  return parsed.result !== void 0 ? parsed.result : parsed;
}

// src/api.ts
var MANIFEST_PORT = 9891;
var cachedPort = 0;
async function servicePort() {
  if (cachedPort) return cachedPort;
  const meta = await kvGet("cda.meta");
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
  saveSettings: (s) => call("POST", "/api/settings_set", s),
  check: (p) => call("POST", "/api/check", p),
  mirror: (p) => call("POST", "/api/mirror", p),
  sri: (p) => call("POST", "/api/sri", p),
  watch: (p) => call("POST", "/api/watch", p),
  watchList: () => call("GET", "/api/watch_list"),
  watchCancel: (id) => call("POST", "/api/watch_cancel", { id }),
  watchDelete: (id) => call("POST", "/api/watch_delete", { id }),
  purge: (url) => call("POST", "/api/purge", { url }),
  history: () => call("GET", "/api/history"),
  report: (id) => call("POST", "/api/report", { id }),
  historyClear: () => call("POST", "/api/history_clear", {}),
  selftest: () => call("POST", "/api/selftest", {})
};

// src/views.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function VerdictBadge({ v }) {
  const map = {
    match: { cls: "ok", text: "\u2705 \u4E0E\u5B98\u65B9\u4E00\u81F4" },
    "match-origin": { cls: "ok", text: "\u2705 \u4E0E\u6E90\u4ED3\u5E93\u4E00\u81F4" },
    mismatch: { cls: "bad", text: "\u{1F6A8} \u4E0E\u5B98\u65B9\u4E0D\u4E00\u81F4" },
    "cdn-generated": { cls: "warn", text: "\u26A0\uFE0F CDN \u73B0\u573A\u751F\u6210" },
    unreachable: { cls: "bad", text: "\u{1F6AB} \u4E0D\u53EF\u8FBE" },
    unverifiable: { cls: "warn", text: "\u2754 \u65E0\u6CD5\u6743\u5A01\u6838\u9A8C" },
    error: { cls: "bad", text: "\u274C \u51FA\u9519" }
  };
  const m = map[v] || { cls: "warn", text: String(v) };
  return /* @__PURE__ */ jsx("span", { className: `badge ${m.cls}`, children: m.text });
}
function ScoreRing({ total }) {
  const color = total >= 90 ? "var(--ok)" : total >= 60 ? "var(--warn)" : "var(--bad)";
  return /* @__PURE__ */ jsxs("div", { className: "score-ring", style: { borderColor: color, color }, children: [
    /* @__PURE__ */ jsx("div", { className: "score-num", children: total }),
    /* @__PURE__ */ jsx("div", { className: "score-label", children: "\u5065\u5EB7\u5206" })
  ] });
}
function FindingsList({ findings }) {
  const list = findings || [];
  if (!list.length) return /* @__PURE__ */ jsx("div", { className: "muted", children: "\u65E0\u7ED3\u8BBA\u9879" });
  return /* @__PURE__ */ jsx("div", { className: "findings", children: list.map((f, i) => /* @__PURE__ */ jsxs("div", { className: `finding sev-${f.sev}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "finding-title", children: [
      f.sev === "red" ? "\u274C" : f.sev === "yellow" ? "\u26A0\uFE0F" : f.sev === "green" ? "\u2713" : "\xB7",
      " ",
      f.title
    ] }),
    f.detail ? /* @__PURE__ */ jsx("div", { className: "finding-detail", children: f.detail }) : null,
    f.fix ? /* @__PURE__ */ jsxs("div", { className: "finding-fix", children: [
      "\u2192 ",
      f.fix
    ] }) : null
  ] }, i)) });
}
function ReportHeader({ rep }) {
  return /* @__PURE__ */ jsxs("div", { className: "report-head", children: [
    rep.score ? /* @__PURE__ */ jsx(ScoreRing, { total: rep.score.total }) : null,
    /* @__PURE__ */ jsxs("div", { className: "report-meta", children: [
      /* @__PURE__ */ jsx("div", { className: "report-title", children: rep.label || rep.kind }),
      /* @__PURE__ */ jsxs("div", { className: "muted", children: [
        rep.runId,
        " \xB7 ",
        (rep.durationMs / 1e3).toFixed(1),
        "s \xB7",
        rep.counts ? ` \u7EA2 ${rep.counts.red} / \u9EC4 ${rep.counts.yellow} / \u7EFF ${rep.counts.green}` : ""
      ] })
    ] })
  ] });
}
function CheckRowTable({ rows }) {
  const [open, setOpen] = useState(null);
  return /* @__PURE__ */ jsx("div", { className: "rows", children: rows.map((r, i) => /* @__PURE__ */ jsxs("div", { className: "row-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "row-line", onClick: () => setOpen(open === String(i) ? null : String(i)), children: [
      /* @__PURE__ */ jsx(VerdictBadge, { v: r.verdict }),
      /* @__PURE__ */ jsxs("div", { className: "row-main", children: [
        /* @__PURE__ */ jsx("div", { className: "row-url", title: r.url, children: r.url }),
        /* @__PURE__ */ jsxs("div", { className: "muted", children: [
          r.cdnLabel || r.host || "?",
          r.pkg ? ` \xB7 ${r.pkg}@${r.ver || "?"}` : "",
          " \xB7 ",
          r.tag,
          r.fetch && r.fetch.ok ? ` \xB7 ${(r.fetch.byteLength / 1024).toFixed(1)}KB \xB7 ${r.fetch.elapsedMs}ms` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "row-caret", children: open === String(i) ? "\u25BE" : "\u25B8" })
    ] }),
    open === String(i) ? /* @__PURE__ */ jsxs("div", { className: "row-detail", children: [
      r.note ? /* @__PURE__ */ jsx("div", { className: "finding-detail", children: r.note }) : null,
      r.auth ? /* @__PURE__ */ jsxs("div", { className: "muted small", children: [
        "\u6743\u5A01\u53E3\u5F84\uFF1A",
        r.auth.tarball ? "npm tarball \u2713" : "npm tarball \u2717",
        " / ",
        r.auth.dataapi ? "jsDelivr \u53E3\u5F84 \u2713" : "jsDelivr \u53E3\u5F84 \u2717",
        r.auth.ver ? ` \xB7 \u7248\u672C ${r.auth.ver}` : "",
        r.auth.sourceNote ? ` \xB7 ${r.auth.sourceNote}` : ""
      ] }) : null,
      r.sri ? /* @__PURE__ */ jsxs("div", { className: `small ${r.sri.check === "match" ? "ok-text" : "bad-text"}`, children: [
        "\u9875\u9762 integrity\uFF1A",
        r.sri.check === "match" ? "\u4E0E\u5B9E\u9645\u5185\u5BB9\u4E00\u81F4 \u2713" : r.sri.check === "mismatch" ? "\u4E0E\u5B9E\u9645\u5185\u5BB9\u4E0D\u7B26 \u2717" : r.sri.check
      ] }) : null,
      r.fetch && r.fetch.digests ? /* @__PURE__ */ jsxs("div", { className: "muted small mono", children: [
        "sha256: ",
        r.fetch.digests.sha256
      ] }) : null,
      r.sriTagSuggestion ? /* @__PURE__ */ jsxs("div", { className: "sri-suggest", children: [
        /* @__PURE__ */ jsx("span", { className: `badge ${r.sriTagSuggestion.source === "official" ? "ok" : "warn"}`, children: r.sriTagSuggestion.source === "official" ? "\u5B98\u65B9\u53E3\u5F84 SRI" : "\u57FA\u4E8E\u672C\u6B21\u6293\u53D6\uFF08\u65E0\u6743\u5A01\u6E90\uFF09" }),
        /* @__PURE__ */ jsxs("code", { className: "mono", children: [
          'integrity="',
          r.sriTagSuggestion.integrity,
          '"'
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "btn btn-mini",
            onClick: () => {
              navigator.clipboard?.writeText(r.sriTagSuggestion.integrity).catch(() => {
              });
            },
            children: "\u590D\u5236"
          }
        )
      ] }) : null
    ] }) : null
  ] }, i)) });
}
function CheckTab({ initialReport, onReportDone }) {
  const [mode, setMode] = useState("urls");
  const [urls, setUrls] = useState("");
  const [htmlUrl, setHtmlUrl] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rep, setRep] = useState(initialReport || null);
  useEffect(() => {
    if (initialReport) setRep(initialReport);
  }, [initialReport]);
  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const p = mode === "urls" ? { mode: "urls", urls: urls.split("\n").map((x) => x.trim()).filter(Boolean) } : htmlUrl.trim() ? { mode: "html", htmlUrl: htmlUrl.trim() } : { mode: "html", html };
      if (mode === "urls" && (!p.urls || !p.urls.length)) throw new Error("\u8BF7\u5148\u7C98\u8D34\u81F3\u5C11\u4E00\u4E2A\u8D44\u6E90 URL");
      if (mode === "html" && !htmlUrl.trim() && !html.trim()) throw new Error("\u8BF7\u586B\u9875\u9762 URL \u6216\u7C98\u8D34 HTML");
      const r = await api.check(p);
      setRep(r.report);
      onReportDone?.(r.report);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [mode, urls, htmlUrl, html, onReportDone]);
  const rows = rep?.rows || [];
  const isCheck = rep?.kind === "check";
  return /* @__PURE__ */ jsxs("div", { className: "tab-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsxs("div", { className: "seg", children: [
        /* @__PURE__ */ jsx("button", { className: `seg-btn ${mode === "urls" ? "on" : ""}`, onClick: () => setMode("urls"), children: "URL \u5217\u8868" }),
        /* @__PURE__ */ jsx("button", { className: `seg-btn ${mode === "html" ? "on" : ""}`, onClick: () => setMode("html"), children: "HTML \u9875\u9762" })
      ] }),
      mode === "urls" ? /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "input",
          rows: 5,
          placeholder: "\u6BCF\u884C\u4E00\u4E2A\u8D44\u6E90 URL\uFF0C\u4F8B\uFF1A\nhttps://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js\nhttps://cdnjs.cloudflare.com/ajax/libs/vue/3.4.0/vue.global.prod.min.js",
          value: urls,
          onChange: (e) => setUrls(e.target.value)
        }
      ) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("input", { className: "input", placeholder: "\u9875\u9762 URL\uFF08\u6293\u53D6\u540E\u5BA1\u8BA1\u5176\u4E2D\u7684\u5916\u94FE\uFF1B\u7559\u7A7A\u5219\u7528\u4E0B\u65B9\u7C98\u8D34\u5185\u5BB9\uFF09", value: htmlUrl, onChange: (e) => setHtmlUrl(e.target.value) }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "input",
            rows: 5,
            placeholder: "\u6216\u76F4\u63A5\u7C98\u8D34 HTML \u7247\u6BB5",
            value: html,
            onChange: (e) => setHtml(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "btn-row", children: [
        /* @__PURE__ */ jsx("button", { className: "btn btn-primary", disabled: busy, onClick: run, children: busy ? "\u6838\u9A8C\u4E2D\u2026" : "\u5F00\u59CB\u6838\u9A8C" }),
        /* @__PURE__ */ jsx("span", { className: "muted small", children: "\u9010\u4E2A\u6293\u53D6\u5E76\u4E0E\u5B98\u65B9\u53D1\u5E03\u5185\u5BB9\uFF08npm tarball / jsDelivr \u53E3\u5F84 / cdnjs SRI\uFF09\u54C8\u5E0C\u6BD4\u5BF9" })
      ] }),
      error ? /* @__PURE__ */ jsxs("div", { className: "error-line", children: [
        "\u2717 ",
        error
      ] }) : null
    ] }),
    rep && isCheck ? /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx(ReportHeader, { rep }),
      /* @__PURE__ */ jsx(FindingsList, { findings: rep.findings }),
      rep.summary ? /* @__PURE__ */ jsxs("div", { className: "muted small summary-line", children: [
        "\u8D44\u6E90 ",
        rep.summary.total,
        "\uFF1A\u4E00\u81F4 ",
        rep.summary.match,
        " \xB7 \u4E0D\u4E00\u81F4 ",
        rep.summary.mismatch,
        " \xB7 \u4E0D\u53EF\u8FBE ",
        rep.summary.unreachable,
        " \xB7 \u65E0\u6CD5\u6838\u9A8C ",
        rep.summary.unverifiable,
        " \xB7 CDN \u751F\u6210 ",
        rep.summary.cdnGenerated
      ] }) : null,
      /* @__PURE__ */ jsx(CheckRowTable, { rows })
    ] }) : null
  ] });
}
function MirrorTab() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rep, setRep] = useState(null);
  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (!input.trim()) throw new Error("\u8BF7\u5148\u7C98\u8D34\u4E00\u4E2A\u8D44\u6E90 URL\uFF08\u63A8\u8350\u5E26\u7248\u672C\u53F7\uFF09");
      const r = await api.mirror({ url: input.trim() });
      setRep(r.report);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [input]);
  const rows = rep?.rows || [];
  return /* @__PURE__ */ jsxs("div", { className: "tab-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "input",
          placeholder: "\u8D44\u6E90 URL\uFF0C\u4F8B\uFF1Ahttps://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js",
          value: input,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !busy) run();
          }
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "btn-row", children: [
        /* @__PURE__ */ jsx("button", { className: "btn btn-primary", disabled: busy, onClick: run, children: busy ? "\u63A2\u6D4B\u4E2D\u2026" : "\u955C\u50CF\u77E9\u9635" }),
        /* @__PURE__ */ jsx("span", { className: "muted small", children: "\u540C\u4E00\u6587\u4EF6\u5728\u5404\u516C\u5171 CDN \u7684\u53EF\u8FBE\u6027\uFF08ms\uFF09\u4E0E\u5185\u5BB9\u4E00\u81F4\u6027\uFF08\u4ECE\u4F60\u7684\u7F51\u7EDC\u5B9E\u6D4B\uFF09" })
      ] }),
      error ? /* @__PURE__ */ jsxs("div", { className: "error-line", children: [
        "\u2717 ",
        error
      ] }) : null
    ] }),
    rep && rep.kind === "mirror" ? /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx(ReportHeader, { rep }),
      rep.summary ? /* @__PURE__ */ jsxs("div", { className: "muted small summary-line", children: [
        "\u53EF\u8FBE ",
        rep.summary.reachable,
        "/",
        rep.summary.total,
        " \xB7 \u4E0E\u5B98\u65B9\u4E00\u81F4 ",
        rep.summary.match,
        " \xB7 \u4E0D\u4E00\u81F4 ",
        rep.summary.mismatch
      ] }) : null,
      /* @__PURE__ */ jsxs("table", { className: "table", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "\u955C\u50CF" }),
          /* @__PURE__ */ jsx("th", { children: "\u72B6\u6001" }),
          /* @__PURE__ */ jsx("th", { children: "\u5EF6\u8FDF" }),
          /* @__PURE__ */ jsx("th", { children: "\u5927\u5C0F" }),
          /* @__PURE__ */ jsx("th", { children: "\u7ED3\u8BBA" }),
          /* @__PURE__ */ jsx("th", {})
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: rows.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: r.verdict === "mismatch" ? "tr-bad" : "", children: [
          /* @__PURE__ */ jsxs("td", { children: [
            r.label,
            r.crossFamily ? /* @__PURE__ */ jsx("span", { className: "muted small", children: "\uFF08\u8DE8\u65CF\uFF09" }) : null
          ] }),
          /* @__PURE__ */ jsx("td", { className: "mono", children: r.status || "-" }),
          /* @__PURE__ */ jsx("td", { className: "mono", children: r.elapsedMs != null ? `${r.elapsedMs}ms` : "-" }),
          /* @__PURE__ */ jsx("td", { className: "mono", children: r.byteLength ? `${(r.byteLength / 1024).toFixed(1)}K` : "-" }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(VerdictBadge, { v: r.verdict }) }),
          /* @__PURE__ */ jsx("td", { className: "muted small", children: r.note })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsx(FindingsList, { findings: rep.findings })
    ] }) : null
  ] });
}
function SriTab() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rep, setRep] = useState(null);
  const [copied, setCopied] = useState("");
  const copy = (key, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    }).catch(() => {
    });
  };
  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (!input.trim()) throw new Error("\u8BF7\u5148\u7C98\u8D34\u8D44\u6E90 URL");
      const r = await api.sri({ url: input.trim() });
      setRep(r.report);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [input]);
  return /* @__PURE__ */ jsxs("div", { className: "tab-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "input",
          placeholder: "\u8D44\u6E90 URL\uFF08\u5E26\u7248\u672C\u53F7\u7684 npm \u7CFB/cdnjs \u7CFB\u53EF\u83B7\u5F97\u5B98\u65B9\u53E3\u5F84\uFF09",
          value: input,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !busy) run();
          }
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "btn-row", children: [
        /* @__PURE__ */ jsx("button", { className: "btn btn-primary", disabled: busy, onClick: run, children: busy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210 SRI \u6807\u7B7E" }),
        /* @__PURE__ */ jsx("span", { className: "muted small", children: "\u5185\u5BB9\u4E0E\u5B98\u65B9\u4E00\u81F4\u65F6\u54C8\u5E0C\u5373\u5B98\u65B9\u54C8\u5E0C\uFF1B\u4E0D\u4E00\u81F4\u65F6\u660E\u786E\u8B66\u544A\uFF0C\u7EDD\u4E0D\u7ED9\u7BE1\u6539\u5185\u5BB9\u80CC\u4E66" })
      ] }),
      error ? /* @__PURE__ */ jsxs("div", { className: "error-line", children: [
        "\u2717 ",
        error
      ] }) : null
    ] }),
    rep && rep.kind === "sri" && rep.tags ? /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx(ReportHeader, { rep }),
      /* @__PURE__ */ jsxs("div", { className: `sri-source ${rep.tagSource === "mismatch" ? "bad-text" : ""}`, children: [
        rep.tagSource === "official" ? "\u2705 \u5B98\u65B9\u53E3\u5F84\uFF08\u4E0E\u6743\u5A01\u6E90\u4E00\u81F4\uFF09" : rep.tagSource === "mismatch" ? "\u{1F6A8} \u5185\u5BB9\u4E0E\u5B98\u65B9\u4E0D\u4E00\u81F4\u2014\u2014\u4EE5\u4E0B\u6807\u7B7E\u4EC5\u4F9B\u53D6\u8BC1\uFF0C\u5207\u52FF\u5F15\u7528\uFF01" : "\u26A0\uFE0F \u57FA\u4E8E\u672C\u6B21\u6293\u53D6\uFF08\u672A\u83B7\u5F97\u6743\u5A01\u6E90\uFF09",
        /* @__PURE__ */ jsx("div", { className: "muted small", children: rep.tagNote })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tag-block", children: [
        /* @__PURE__ */ jsxs("div", { className: "tag-line", children: [
          /* @__PURE__ */ jsx("span", { className: "muted small", children: "integrity \u5C5E\u6027" }),
          /* @__PURE__ */ jsx("button", { className: "btn btn-mini", onClick: () => copy("i", rep.tags.integrity), children: copied === "i" ? "\u5DF2\u590D\u5236" : "\u590D\u5236" })
        ] }),
        /* @__PURE__ */ jsx("code", { className: "mono block", children: rep.tags.integrity })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tag-block", children: [
        /* @__PURE__ */ jsxs("div", { className: "tag-line", children: [
          /* @__PURE__ */ jsx("span", { className: "muted small", children: "script \u6807\u7B7E" }),
          /* @__PURE__ */ jsx("button", { className: "btn btn-mini", onClick: () => copy("s", rep.tags.script), children: copied === "s" ? "\u5DF2\u590D\u5236" : "\u590D\u5236" })
        ] }),
        /* @__PURE__ */ jsx("code", { className: "mono block", children: rep.tags.script })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tag-block", children: [
        /* @__PURE__ */ jsxs("div", { className: "tag-line", children: [
          /* @__PURE__ */ jsx("span", { className: "muted small", children: "link \u6807\u7B7E" }),
          /* @__PURE__ */ jsx("button", { className: "btn btn-mini", onClick: () => copy("l", rep.tags.link), children: copied === "l" ? "\u5DF2\u590D\u5236" : "\u590D\u5236" })
        ] }),
        /* @__PURE__ */ jsx("code", { className: "mono block", children: rep.tags.link })
      ] }),
      /* @__PURE__ */ jsx(FindingsList, { findings: rep.findings })
    ] }) : null
  ] });
}
function WatchTab() {
  const [originUrl, setOriginUrl] = useState("");
  const [edgeUrl, setEdgeUrl] = useState("");
  const [intervalSec, setIntervalSec] = useState(20);
  const [maxMinutes, setMaxMinutes] = useState(120);
  const [watches, setWatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [purgeUrl, setPurgeUrl] = useState("");
  const [purgeMsg, setPurgeMsg] = useState("");
  const timer = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const r = await api.watchList();
      setWatches(r.items || []);
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 4e3);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      if (!originUrl.trim() || !edgeUrl.trim()) throw new Error("\u8BF7\u586B\u5199 origin \u4E0E edge \u4E24\u4E2A URL");
      await api.watch({ originUrl: originUrl.trim(), edgeUrl: edgeUrl.trim(), intervalSec, maxMinutes });
      setOriginUrl("");
      setEdgeUrl("");
      await refresh();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const purge = async () => {
    setPurgeMsg("");
    try {
      if (!purgeUrl.trim()) throw new Error("\u8BF7\u586B\u5199\u8981 purge \u7684 jsDelivr URL");
      const r = await api.purge(purgeUrl.trim());
      setPurgeMsg(`\u2705 ${r.result.note}`);
      setPurgeUrl("");
    } catch (e) {
      setPurgeMsg(`\u2717 ${String(e.message || e)}`);
    }
  };
  const statusCls = {
    running: "warn",
    equal: "ok",
    timeout: "bad",
    cancelled: "muted",
    interrupted: "bad"
  };
  return /* @__PURE__ */ jsxs("div", { className: "tab-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("div", { className: "form-title", children: "\u65B0\u5EFA\u4F20\u64AD\u89C2\u6D4B\uFF08origin vs edge \u54C8\u5E0C\u5BF9\u8D26\uFF09" }),
      /* @__PURE__ */ jsx("input", { className: "input", placeholder: "\u6E90\u7AEF URL\uFF08\u53D1\u5E03\u771F\u76F8\uFF0C\u5982 https://raw.githubusercontent.com/user/repo/main/file.json\uFF09", value: originUrl, onChange: (e) => setOriginUrl(e.target.value) }),
      /* @__PURE__ */ jsx("input", { className: "input", placeholder: "CDN \u8FB9\u7F18 URL\uFF08\u5982 https://cdn.jsdelivr.net/gh/user/repo@main/file.json\uFF09", value: edgeUrl, onChange: (e) => setEdgeUrl(e.target.value) }),
      /* @__PURE__ */ jsxs("div", { className: "inline-fields", children: [
        /* @__PURE__ */ jsxs("label", { className: "small", children: [
          "\u95F4\u9694 ",
          /* @__PURE__ */ jsx("input", { className: "input inline-num", type: "number", min: 5, max: 300, value: intervalSec, onChange: (e) => setIntervalSec(Number(e.target.value) || 20) }),
          " \u79D2"
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "small", children: [
          "\u6700\u957F ",
          /* @__PURE__ */ jsx("input", { className: "input inline-num", type: "number", min: 1, max: 720, value: maxMinutes, onChange: (e) => setMaxMinutes(Number(e.target.value) || 120) }),
          " \u5206\u949F"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "btn-row", children: [
        /* @__PURE__ */ jsx("button", { className: "btn btn-primary", disabled: busy, onClick: create, children: busy ? "\u5EFA\u7ACB\u4E2D\u2026" : "\u5F00\u59CB\u89C2\u6D4B" }),
        /* @__PURE__ */ jsx("span", { className: "muted small", children: "\u4E24\u4FA7\u5185\u5BB9\u54C8\u5E0C\u4E00\u81F4\u5373\u81EA\u52A8\u5224\u300C\u5DF2\u540C\u6B65\u300D\u5E76\u7ED3\u675F" })
      ] }),
      error ? /* @__PURE__ */ jsxs("div", { className: "error-line", children: [
        "\u2717 ",
        error
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("div", { className: "form-title", children: "\u8FDB\u884C\u4E2D / \u6700\u8FD1\u89C2\u6D4B" }),
      !watches.length ? /* @__PURE__ */ jsx("div", { className: "muted", children: "\u6682\u65E0\u89C2\u6D4B\u3002\u5178\u578B\u7528\u6CD5\uFF1A\u63D2\u4EF6\u53D1\u7248\u540E\uFF0C\u5BF9 index.json \u7684 raw.githubusercontent \u4E0E cdn.jsdelivr.net \u5404\u5EFA\u4E00\u7AEF\uFF0C\u7B49\u8FB9\u7F18\u540C\u6B65\u3002" }) : null,
      watches.map((w) => /* @__PURE__ */ jsxs("div", { className: "watch-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "watch-head", children: [
          /* @__PURE__ */ jsx("span", { className: `badge ${statusCls[w.status] || "warn"}`, children: w.status }),
          /* @__PURE__ */ jsxs("span", { className: "muted small", children: [
            new Date(w.startedAt).toLocaleString(),
            w.finishedAt ? ` \u2192 ${new Date(w.finishedAt).toLocaleTimeString()}` : ""
          ] }),
          w.status === "running" ? /* @__PURE__ */ jsx("button", { className: "btn btn-mini", onClick: async () => {
            await api.watchCancel(w.id);
            refresh();
          }, children: "\u53D6\u6D88" }) : /* @__PURE__ */ jsx("button", { className: "btn btn-mini", onClick: async () => {
            await api.watchDelete(w.id);
            refresh();
          }, children: "\u5220\u9664" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "watch-urls", children: [
          /* @__PURE__ */ jsxs("div", { className: "small mono", title: w.originUrl, children: [
            "origin\uFF1A",
            w.originUrl
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "small mono", title: w.edgeUrl, children: [
            "edge\uFF1A",
            w.edgeUrl
          ] })
        ] }),
        w.samples.length ? /* @__PURE__ */ jsxs("div", { className: "watch-samples", children: [
          /* @__PURE__ */ jsx("div", { className: "muted small", children: "\u6700\u8FD1\u91C7\u6837\uFF1A" }),
          w.samples.slice(-4).map((s, i) => /* @__PURE__ */ jsxs("div", { className: "small mono", children: [
            new Date(s.t).toLocaleTimeString(),
            " \xB7 origin ",
            s.o.status || "\u2717",
            "/",
            s.o.bytes,
            "B \xB7 edge ",
            s.e.status || "\u2717",
            "/",
            s.e.bytes,
            "B ",
            s.equal ? "\xB7 \u2705 \u4E00\u81F4" : "\xB7 \xD7"
          ] }, i))
        ] }) : /* @__PURE__ */ jsx("div", { className: "muted small", children: "\u7B49\u5F85\u9996\u91C7\u2026" }),
        w.note ? /* @__PURE__ */ jsx("div", { className: "muted small", children: w.note }) : null
      ] }, w.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("div", { className: "form-title", children: "jsDelivr purge\uFF08\u5355\u53D1 + \u51B7\u5374\u9632\u5446\uFF09" }),
      /* @__PURE__ */ jsxs("div", { className: "btn-row", children: [
        /* @__PURE__ */ jsx("input", { className: "input", placeholder: "https://cdn.jsdelivr.net/gh/... \u6216 /npm/...", value: purgeUrl, onChange: (e) => setPurgeUrl(e.target.value) }),
        /* @__PURE__ */ jsx("button", { className: "btn", onClick: purge, children: "Purge" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "muted small", children: "\u51B7\u5374\u671F\u5185\u8FDE\u53D1\u53EA\u4F1A\u88AB jsDelivr \u9759\u9ED8\u9650\u6D41\uFF08\u5B9E\u6D4B 39~43 \u5206\u949F\uFF09\uFF0C\u672C\u53F0\u9ED8\u8BA4 10 \u5206\u949F\u51B7\u5374\uFF1Bpurge \u540E\u7528\u4E0A\u65B9\u89C2\u6D4B\u5BF9\u8D26\u8FB9\u7F18\u540C\u6B65\u3002" }),
      purgeMsg ? /* @__PURE__ */ jsx("div", { className: "small", children: purgeMsg }) : null
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var TABS = [
  { id: "check", label: "\u6838\u9A8C" },
  { id: "mirror", label: "\u955C\u50CF" },
  { id: "sri", label: "SRI" },
  { id: "watch", label: "\u4F20\u64AD" },
  { id: "history", label: "\u5386\u53F2" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel() {
  const [tab, setTab] = useState2("check");
  const [status, setStatus] = useState2(null);
  const [svcError, setSvcError] = useState2("");
  const [lastReport, setLastReport] = useState2(null);
  const [historyJump, setHistoryJump] = useState2(0);
  const refreshStatus = useCallback2(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setSvcError("");
    } catch (e) {
      setSvcError(String(e.message || e));
    }
  }, []);
  useEffect2(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 8e3);
    return () => clearInterval(t);
  }, [refreshStatus]);
  const openReport = useCallback2((r) => {
    setLastReport(r);
    void refreshStatus();
  }, [refreshStatus]);
  const openFromHistory = useCallback2(async (id) => {
    try {
      const r = await api.report(id);
      setLastReport(r);
      setTab(r.kind === "mirror" ? "mirror" : r.kind === "sri" ? "sri" : "check");
    } catch (e) {
      setSvcError(String(e.message || e));
    }
  }, []);
  return /* @__PURE__ */ jsxs2("div", { className: "panel", children: [
    /* @__PURE__ */ jsxs2("div", { className: "statusbar", children: [
      /* @__PURE__ */ jsx2("span", { className: `dot ${svcError ? "dot-bad" : status?.running ? "dot-warn" : "dot-ok"}` }),
      /* @__PURE__ */ jsx2("span", { className: "small", children: svcError ? `\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${svcError.slice(0, 80)}` : status ? `v${status.version} \xB7 \u7AEF\u53E3 ${status.port}${status.running ? ` \xB7 ${status.running.kind} \u8FDB\u884C\u4E2D\uFF08${status.running.step}\uFF09` : " \xB7 \u7A7A\u95F2"}${status.watchesRunning ? ` \xB7 ${status.watchesRunning} \u4E2A\u89C2\u6D4B\u8FD0\u884C\u4E2D` : ""}` : "\u8FDE\u63A5\u4E2D\u2026" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "tabs", children: TABS.map((t) => /* @__PURE__ */ jsx2("button", { className: `tab-btn ${tab === t.id ? "on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) }),
    tab === "check" ? /* @__PURE__ */ jsx2(CheckTab, { initialReport: lastReport && lastReport.kind === "check" ? lastReport : null, onReportDone: openReport }) : null,
    tab === "mirror" ? /* @__PURE__ */ jsx2(MirrorTab, {}) : null,
    tab === "sri" ? /* @__PURE__ */ jsx2(SriTab, {}) : null,
    tab === "watch" ? /* @__PURE__ */ jsx2(WatchTab, {}) : null,
    tab === "history" ? /* @__PURE__ */ jsx2(HistoryTab, { onOpen: openFromHistory, refreshKey: historyJump }) : null,
    tab === "settings" ? /* @__PURE__ */ jsx2(SettingsTab, { onSaved: () => {
      setHistoryJump(historyJump + 1);
      void refreshStatus();
    }, onSelftest: (items) => {
    } }) : null
  ] });
}
function HistoryTab({ onOpen }) {
  const [items, setItems] = useState2([]);
  const [error, setError] = useState2("");
  const refresh = useCallback2(async () => {
    try {
      const r = await api.history();
      setItems(r.items || []);
      setError("");
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);
  useEffect2(() => {
    refresh();
    const t = setInterval(refresh, 1e4);
    return () => clearInterval(t);
  }, [refresh]);
  return /* @__PURE__ */ jsx2("div", { className: "tab-body", children: /* @__PURE__ */ jsxs2("div", { className: "card", children: [
    /* @__PURE__ */ jsxs2("div", { className: "btn-row", children: [
      /* @__PURE__ */ jsx2("button", { className: "btn", onClick: async () => {
        await api.historyClear().catch(() => {
        });
        refresh();
      }, children: "\u6E05\u7A7A\u5386\u53F2" }),
      /* @__PURE__ */ jsx2("span", { className: "muted small", children: "\u62A5\u544A\u4FDD\u7559\u6700\u8FD1 8 \u4EFD\uFF08\u8BB0\u5F55\u4FDD\u7559 60 \u6761\uFF09\uFF0C\u7ECF cap.kv \u6295\u5F71\u4E09\u7AEF\u53EF\u770B" })
    ] }),
    error ? /* @__PURE__ */ jsxs2("div", { className: "error-line", children: [
      "\u2717 ",
      error
    ] }) : null,
    !items.length ? /* @__PURE__ */ jsx2("div", { className: "muted", children: "\u8FD8\u6CA1\u6709\u4F53\u68C0\u8BB0\u5F55\u3002" }) : null,
    /* @__PURE__ */ jsx2("div", { className: "history-list", children: items.map((it) => /* @__PURE__ */ jsxs2("div", { className: "history-item", onClick: () => onOpen(it.runId), children: [
      /* @__PURE__ */ jsx2("span", { className: `badge ${it.counts && it.counts.red ? "bad" : it.counts && it.counts.yellow ? "warn" : "ok"}`, children: it.kind === "check" ? "\u6838\u9A8C" : it.kind === "mirror" ? "\u955C\u50CF" : it.kind === "sri" ? "SRI" : it.kind }),
      /* @__PURE__ */ jsxs2("div", { className: "history-main", children: [
        /* @__PURE__ */ jsx2("div", { className: "history-label", children: it.label }),
        /* @__PURE__ */ jsxs2("div", { className: "muted small", children: [
          new Date(it.at).toLocaleString(),
          it.counts ? ` \xB7 \u7EA2${it.counts.red}/\u9EC4${it.counts.yellow}/\u7EFF${it.counts.green}` : ""
        ] })
      ] }),
      it.score != null ? /* @__PURE__ */ jsx2("div", { className: "history-score", children: it.score }) : null
    ] }, it.runId)) })
  ] }) });
}
function SettingsTab({ onSaved, onSelftest }) {
  const [settings, setSettings] = useState2(null);
  const [busy, setBusy] = useState2(false);
  const [saved, setSaved] = useState2(false);
  const [error, setError] = useState2("");
  const [selftest, setSelftest] = useState2(null);
  useEffect2(() => {
    api.settings().then(setSettings).catch((e) => setError(String(e.message || e)));
  }, []);
  if (!settings) return /* @__PURE__ */ jsx2("div", { className: "tab-body", children: /* @__PURE__ */ jsx2("div", { className: "card", children: error ? `\u2717 ${error}` : "\u52A0\u8F7D\u4E2D\u2026" }) });
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const s = await api.saveSettings(settings);
      setSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const runSelftest = async () => {
    setBusy(true);
    try {
      const r = await api.selftest();
      setSelftest(r);
      onSelftest(r.items);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const toggleMirror = (id) => {
    const has = settings.enabledMirrors.includes(id);
    setSettings({
      ...settings,
      enabledMirrors: has ? settings.enabledMirrors.filter((x) => x !== id) : [...settings.enabledMirrors, id]
    });
  };
  return /* @__PURE__ */ jsx2("div", { className: "tab-body", children: /* @__PURE__ */ jsxs2("div", { className: "card", children: [
    /* @__PURE__ */ jsx2("div", { className: "form-title", children: "\u6293\u53D6\u53C2\u6570" }),
    /* @__PURE__ */ jsxs2("div", { className: "inline-fields", children: [
      /* @__PURE__ */ jsxs2("label", { className: "small", children: [
        "\u8D85\u65F6 ",
        /* @__PURE__ */ jsx2("input", { className: "input inline-num", type: "number", min: 3, max: 60, value: Math.round(settings.timeoutMs / 1e3), onChange: (e) => setSettings({ ...settings, timeoutMs: (Number(e.target.value) || 15) * 1e3 }) }),
        " \u79D2"
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "small", children: [
        "\u5355\u8D44\u6E90\u4E0A\u9650 ",
        /* @__PURE__ */ jsx2("input", { className: "input inline-num", type: "number", min: 1, max: 100, value: settings.maxBytesMB, onChange: (e) => setSettings({ ...settings, maxBytesMB: Number(e.target.value) || 25 }) }),
        " MB"
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "small", children: [
        "purge \u51B7\u5374 ",
        /* @__PURE__ */ jsx2("input", { className: "input inline-num", type: "number", min: 0, max: 120, value: settings.purgeCooldownMin, onChange: (e) => setSettings({ ...settings, purgeCooldownMin: Number(e.target.value) || 0 }) }),
        " \u5206\u949F"
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("label", { className: "small", children: [
      "\u51FA\u7F51\u4EE3\u7406\uFF08\u76F4\u8FDE\u5931\u8D25/CN \u7F51\u7EDC\u7528\uFF0C\u5982 127.0.0.1:7890\uFF0C\u7559\u7A7A\u8D70\u7CFB\u7EDF\u4EE3\u7406\u63A2\u6D4B\uFF09",
      /* @__PURE__ */ jsx2("input", { className: "input", placeholder: "\u7559\u7A7A = \u81EA\u52A8\uFF08\u7CFB\u7EDF\u4EE3\u7406\uFF09", value: settings.proxy, onChange: (e) => setSettings({ ...settings, proxy: e.target.value }) })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "form-title", children: "\u955C\u50CF\u77E9\u9635\u542F\u7528\u9879" }),
    /* @__PURE__ */ jsx2("div", { className: "mirror-chips", children: (settings.mirrors || []).map((m) => /* @__PURE__ */ jsx2(
      "button",
      {
        className: `chip ${settings.enabledMirrors.includes(m.id) ? "on" : ""}`,
        onClick: () => toggleMirror(m.id),
        children: m.label
      },
      m.id
    )) }),
    /* @__PURE__ */ jsxs2("div", { className: "btn-row", children: [
      /* @__PURE__ */ jsx2("button", { className: "btn btn-primary", disabled: busy, onClick: save, children: saved ? "\u5DF2\u4FDD\u5B58 \u2713" : busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }),
      /* @__PURE__ */ jsx2("button", { className: "btn", disabled: busy, onClick: runSelftest, children: "\u8DD1\u81EA\u68C0" })
    ] }),
    error ? /* @__PURE__ */ jsxs2("div", { className: "error-line", children: [
      "\u2717 ",
      error
    ] }) : null,
    selftest ? /* @__PURE__ */ jsxs2("div", { className: "selftest", children: [
      /* @__PURE__ */ jsx2("div", { className: selftest.ok ? "ok-text" : "bad-text", children: selftest.ok ? "\u81EA\u68C0\u5168\u7EFF \u2705" : "\u81EA\u68C0\u5B58\u5728\u5931\u8D25 \u274C" }),
      /* @__PURE__ */ jsx2(FindingsList, { findings: selftest.items.map((x) => ({ sev: x.ok ? "green" : "red", code: "selftest", title: x.name, detail: x.ok ? "" : x.detail })) })
    ] }) : null
  ] }) });
}

// src/index.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function CdnAuditPanel() {
  return /* @__PURE__ */ jsx3(Panel, {});
}
export {
  CdnAuditPanel as default
};
