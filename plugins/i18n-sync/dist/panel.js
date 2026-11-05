var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  KEY_GLOSSARY: () => KEY_GLOSSARY,
  KEY_META: () => KEY_META,
  KEY_SETTINGS: () => KEY_SETTINGS,
  KEY_UNDO_INDEX: () => KEY_UNDO_INDEX,
  apiApply: () => apiApply,
  apiScan: () => apiScan,
  apiUndo: () => apiUndo,
  apiUndoList: () => apiUndoList,
  cellIssueCount: () => cellIssueCount,
  getMeta: () => getMeta,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet,
  loadGlossary: () => loadGlossary,
  loadSettings: () => loadSettings,
  loadUndoIndex: () => loadUndoIndex,
  metaAlive: () => metaAlive,
  pushRecentDir: () => pushRecentDir,
  saveGlossary: () => saveGlossary,
  saveSettings: () => saveSettings
});
async function kvReq(payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target: "cap.kv", payload } });
  if (!res || res.ok === false) throw new Error(String(res && res.error) || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res;
}
async function kvGet(key) {
  try {
    const res = await kvReq({ action: "get", key });
    return res.result && res.result.value !== void 0 ? res.result.value : null;
  } catch (_) {
    return null;
  }
}
async function kvSet(key, value) {
  await kvReq({ action: "set", key, value });
}
async function kvKeys() {
  const res = await kvReq({ action: "list" });
  return res.result && Array.isArray(res.result.keys) ? res.result.keys : [];
}
async function getMeta() {
  const raw = await kvGet(KEY_META);
  if (!raw || typeof raw !== "object") return null;
  const m = raw;
  if (typeof m.token !== "string" || !m.token || typeof m.port !== "number" || !m.port) return null;
  return m;
}
async function loadSettings() {
  const s = await kvGet(KEY_SETTINGS);
  return s && typeof s === "object" ? s : {};
}
async function saveSettings(s) {
  await kvSet(KEY_SETTINGS, s);
}
async function loadUndoIndex() {
  const v = await kvGet(KEY_UNDO_INDEX);
  return Array.isArray(v) ? v : [];
}
async function loadGlossary() {
  const g = await kvGet(KEY_GLOSSARY);
  if (g && typeof g === "object" && g.terms && typeof g.terms === "object") return g;
  return { terms: {} };
}
async function saveGlossary(g) {
  await kvSet(KEY_GLOSSARY, { ...g, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
}
async function serviceCall(meta, path, body) {
  const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
    method: body === void 0 ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-i18n-sync-token": meta.token },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ ok: false, error: `\u54CD\u5E94\u4E0D\u662F JSON\uFF08HTTP ${res.status}\uFF09` }));
  if (!res.ok && data.ok !== true) {
    throw new Error(String(data.error || `HTTP ${res.status}`));
  }
  return data;
}
async function apiScan(meta, dir, baseLocale) {
  const r = await serviceCall(meta, "/api/scan", { dir, baseLocale });
  return r.scan;
}
async function apiApply(meta, args) {
  return serviceCall(meta, "/api/apply", args);
}
async function apiUndo(meta, batchId) {
  return serviceCall(meta, "/api/undo", { batchId });
}
async function apiUndoList(meta) {
  const r = await serviceCall(meta, "/api/undo-list", {});
  return r.index;
}
function metaAlive(meta) {
  if (!meta || !meta.lastTickAt) return false;
  return Date.now() - new Date(meta.lastTickAt).getTime() < 90 * 1e3;
}
function pushRecentDir(dirs, dir) {
  const next = [dir, ...dirs.filter((d) => d !== dir)];
  return next.slice(0, 5);
}
function cellIssueCount(c) {
  if (!c || c._parseError) return 0;
  return (c.missing?.length || 0) + (c.emptyValues?.length || 0) + (c.sameAsBase?.length || 0) + (c.placeholderIssues?.length || 0);
}
var KEY_META, KEY_SETTINGS, KEY_GLOSSARY, KEY_UNDO_INDEX;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    KEY_META = "i18n.meta";
    KEY_SETTINGS = "i18n.settings";
    KEY_GLOSSARY = "i18n.glossary";
    KEY_UNDO_INDEX = "i18n.undo.index";
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect3, useState as useState4 } from "react";

// src/ScanTab.tsx
init_model();
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function ScanTab({ ctx, meta, scan, onScanDone, goMatrix }) {
  const [dir, setDir] = useState("");
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    loadSettings().then((s) => {
      setRecent(s.recentDirs || []);
      if (!dir && s.recentDirs && s.recentDirs.length) setDir(s.recentDirs[0]);
    });
  }, []);
  const doScan = async () => {
    if (!meta) {
      setError("\u670D\u52A1\u672A\u8FD0\u884C\uFF1A\u7B49\u5F85\u5BBF\u4E3B\u62C9\u8D77\uFF0C\u6216\u5230 \u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192i18n-sync \u624B\u52A8\u542F\u52A8");
      return;
    }
    if (!dir.trim()) {
      setError("\u8BF7\u8F93\u5165 locale \u6839\u76EE\u5F55\u7684\u7EDD\u5BF9\u8DEF\u5F84");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const s = await apiScan(meta, dir.trim());
      onScanDone(s);
      const st = await loadSettings();
      await saveSettings({ ...st, recentDirs: pushRecentDir(st.recentDirs || [], dir.trim()) });
      setRecent(pushRecentDir(st.recentDirs || [], dir.trim()));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const sendPrompt = () => {
    if (!scan) return;
    const locales = scan.locales.filter((l) => l !== scan.baseLocale);
    const text = [
      `\u8BF7\u5E2E\u6211\u4F53\u68C0\u5E76\u8865\u9F50\u591A\u8BED\u8A00\u6587\u4EF6\uFF1A`,
      `\u76EE\u5F55\uFF1A${scan.root}`,
      `\u57FA\u51C6\u8BED\u8A00\uFF1A${scan.baseLocale}\uFF1B\u76EE\u6807\u8BED\u8A00\uFF1A${locales.join("\u3001") || "\uFF08\u65E0\u5176\u4ED6\u8BED\u8A00\uFF09"}`,
      `\u5F53\u524D\u6458\u8981\uFF1A\u7F3A\u5931 ${scan.totals.missing} \xB7 \u7A7A\u503C ${scan.totals.empty} \xB7 \u7591\u4F3C\u672A\u7FFB\u8BD1 ${scan.totals.sameAsBase} \xB7 \u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4 ${scan.totals.placeholder}`,
      `\u8BF7\u5148\u8C03\u7528 i18n_status \u6838\u5BF9\uFF0C\u7136\u540E\u5BF9\u6BCF\u4E2A\u76EE\u6807\u8BED\u8A00\u8C03\u7528 i18n_missing \u83B7\u53D6\u5DE5\u4F5C\u8868\u5E76\u7FFB\u8BD1\uFF08\u9075\u5B88\u672F\u8BED\u8868\u4E0E\u5360\u4F4D\u7B26\u89C4\u5219\uFF09\uFF0C\u6700\u540E\u7ECF\u6211\u786E\u8BA4\u540E\u7528 i18n_apply \u843D\u76D8\u3002`
    ].join("\n");
    if (ctx.onSendToChat) ctx.onSendToChat(text);
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: dir,
          onChange: (e) => setDir(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") void doScan();
          },
          placeholder: "locale \u6839\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\proj\\web\\src\\locales",
          style: { flex: 1, padding: "7px 10px", borderRadius: 6, border: "1px solid var(--polaris-border, #3f3f46)", background: "transparent", color: "inherit" }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => void doScan(),
          disabled: busy,
          style: { padding: "7px 16px", borderRadius: 6, border: "none", cursor: busy ? "wait" : "pointer", background: "var(--polaris-accent, #6366f1)", color: "#fff" },
          children: busy ? "\u626B\u63CF\u4E2D\u2026" : "\u626B\u63CF"
        }
      )
    ] }),
    recent.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }, children: recent.map((d) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setDir(d),
        title: d,
        style: { fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--polaris-border, #3f3f46)", background: "transparent", color: "inherit", cursor: "pointer", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
        children: d
      },
      d
    )) }),
    error && /* @__PURE__ */ jsx("div", { style: { padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", marginBottom: 8, whiteSpace: "pre-wrap" }, children: error }),
    !scan && !error && /* @__PURE__ */ jsxs("div", { style: { padding: 16, border: "1px dashed var(--polaris-border, #3f3f46)", borderRadius: 8, lineHeight: 1.8, opacity: 0.85 }, children: [
      /* @__PURE__ */ jsx("b", { children: "\u9996\u6B21\u4F7F\u7528\uFF1A" }),
      "\u8F93\u5165\u9879\u76EE\u7684 locale \u76EE\u5F55\uFF08\u5982 ",
      /* @__PURE__ */ jsx("code", { children: "src/locales" }),
      "\uFF09\uFF0C\u652F\u6301",
      /* @__PURE__ */ jsx("code", { children: " zh-CN.json / en.json " }),
      "\uFF08\u5355\u6587\u4EF6\u4E00\u8BED\u8A00\uFF09\u4E0E",
      /* @__PURE__ */ jsx("code", { children: " zh-CN/common.json " }),
      "\uFF08\u76EE\u5F55\u4E00\u8BED\u8A00\u591A\u547D\u540D\u7A7A\u95F4\uFF09\u4E24\u79CD\u5E03\u5C40\uFF0CJSON/JSONC/YAML \u7686\u53EF\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u5BF9\u8BDD\u91CC\u5BF9 AI \u8BF4\uFF1A\u300C\u7528 i18n_status \u4F53\u68C0 D:\\myapp\\locales\u300D\u3002"
    ] }),
    scan && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }, children: [
        /* @__PURE__ */ jsx(Stat, { label: "\u5E03\u5C40", value: scan.layout === "file-per-locale" ? "\u6587\u4EF6\u4E00\u8BED\u8A00" : scan.layout === "dir-per-locale" ? "\u76EE\u5F55\u4E00\u8BED\u8A00" : scan.layout === "mixed" ? "\u6DF7\u5408\uFF08\u6309\u76EE\u5F55/\u6587\u4EF6\u540D\u8BC6\u522B\uFF09" : "\u672A\u8BC6\u522B" }),
        /* @__PURE__ */ jsx(Stat, { label: "\u57FA\u51C6\u8BED\u8A00", value: scan.baseLocale }),
        /* @__PURE__ */ jsx(Stat, { label: "\u8BED\u8A00", value: scan.locales.join(", ") }),
        /* @__PURE__ */ jsx(Stat, { label: "\u547D\u540D\u7A7A\u95F4", value: scan.nsList.length ? scan.nsList.join(", ") : "\uFF08\u65E0\uFF09" }),
        /* @__PURE__ */ jsx(Stat, { label: "\u6587\u4EF6", value: `${scan.totals.files} \u4E2A${scan.totals.parseErrors ? `\uFF08\u89E3\u6790\u5931\u8D25 ${scan.totals.parseErrors}\uFF09` : ""}` })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }, children: [
        /* @__PURE__ */ jsx(Stat, { label: "\u7F3A\u5931", value: scan.totals.missing, warn: scan.totals.missing > 0 }),
        /* @__PURE__ */ jsx(Stat, { label: "\u7A7A\u503C", value: scan.totals.empty, warn: scan.totals.empty > 0 }),
        /* @__PURE__ */ jsx(Stat, { label: "\u7591\u4F3C\u672A\u7FFB\u8BD1", value: scan.totals.sameAsBase, warn: scan.totals.sameAsBase > 0 }),
        /* @__PURE__ */ jsx(Stat, { label: "\u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4", value: scan.totals.placeholder, warn: scan.totals.placeholder > 0 }),
        /* @__PURE__ */ jsx(Stat, { label: "\u591A\u4F59\u952E", value: scan.totals.extra })
      ] }),
      scan.warnings.length > 0 && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, opacity: 0.8, marginBottom: 8 }, children: scan.warnings.map((w, i) => /* @__PURE__ */ jsxs("div", { children: [
        "\u26A0 ",
        w
      ] }, i)) }),
      scan.parseErrors.length > 0 && /* @__PURE__ */ jsx("div", { style: { padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", marginBottom: 8, fontSize: 12 }, children: scan.parseErrors.map((p, i) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("b", { children: p.relPath }),
        "\uFF1A",
        p.error
      ] }, i)) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: goMatrix,
            style: { padding: "7px 14px", borderRadius: 6, border: "1px solid var(--polaris-border, #3f3f46)", background: "transparent", color: "inherit", cursor: "pointer" },
            children: "\u67E5\u770B\u77E9\u9635 / \u624B\u5DE5\u8865\u9F50"
          }
        ),
        ctx.onSendToChat && /* @__PURE__ */ jsx(
          "button",
          {
            onClick: sendPrompt,
            style: { padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--polaris-accent, #6366f1)", color: "#fff", cursor: "pointer" },
            children: "\u628A\u4F53\u68C0\u4E0E\u8865\u9F50\u4EFB\u52A1\u53D1\u5230\u5BF9\u8BDD"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { style: { textAlign: "left", opacity: 0.7 }, children: [
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "\u6587\u4EF6" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "\u8BED\u8A00" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "ns" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "\u683C\u5F0F" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "\u952E\u6570" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "\u5907\u6CE8" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: scan.files.map((f) => /* @__PURE__ */ jsxs("tr", { style: { borderTop: "1px solid var(--polaris-border, #27272a)" }, children: [
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: f.relPath }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: f.locale }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: f.ns || "\uFF08\u6839\uFF09" }),
          /* @__PURE__ */ jsxs("td", { style: tdStyle, children: [
            f.format,
            f.hasComments ? " \xB7 \u542B\u6CE8\u91CA" : ""
          ] }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: f.keys }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: f.size > 1024 * 512 ? "\u5927\u6587\u4EF6" : "" })
        ] }, f.relPath)) })
      ] })
    ] })
  ] });
}
var thStyle = { padding: "4px 8px", fontWeight: 500 };
var tdStyle = { padding: "4px 8px", wordBreak: "break-all" };
function Stat({ label, value, warn }) {
  return /* @__PURE__ */ jsxs("div", { style: {
    padding: "6px 12px",
    borderRadius: 8,
    minWidth: 90,
    background: warn ? "rgba(239,68,68,.1)" : "var(--polaris-surface, rgba(127,127,127,.08))",
    border: `1px solid ${warn ? "rgba(239,68,68,.3)" : "var(--polaris-border, #3f3f46)"}`
  }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 11, opacity: 0.7 }, children: label }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 14, fontWeight: 600, color: warn ? "#ef4444" : "inherit", wordBreak: "break-all" }, children: value })
  ] });
}

// src/MatrixTab.tsx
init_model();
import { useMemo, useState as useState2 } from "react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var KIND_LABEL = {
  missing: "\u7F3A\u5931",
  empty: "\u7A7A\u503C",
  same: "\u7591\u4F3C\u672A\u7FFB\u8BD1",
  placeholder: "\u5360\u4F4D\u7B26"
};
function MatrixTab({ ctx, meta, scan, onScanDone }) {
  const [ns, setNs] = useState2("");
  const [locale, setLocale] = useState2("");
  const [filter, setFilter] = useState2("all");
  const [query, setQuery] = useState2("");
  const [edits, setEdits] = useState2({});
  const [result, setResult] = useState2(null);
  const [undoList, setUndoList] = useState2([]);
  const [busy, setBusy] = useState2(false);
  const [confirming, setConfirming] = useState2(false);
  const targetLocales = useMemo(() => scan ? scan.locales.filter((l) => l !== scan.baseLocale) : [], [scan]);
  const effectiveNs = ns || scan?.nsList[0] || "";
  const effectiveLocale = locale || targetLocales[0] || "";
  const rows = useMemo(() => {
    if (!scan) return [];
    const out = [];
    for (const n of scan.nsList) {
      if (effectiveNs && n !== effectiveNs) continue;
      const entry = scan.matrix[n];
      if (!entry || entry._error) continue;
      for (const loc of scan.locales) {
        if (loc === scan.baseLocale) continue;
        if (effectiveLocale && loc !== effectiveLocale) continue;
        const c = entry[loc];
        if (!c || c._parseError) continue;
        const want = filter === "all" ? ["missing", "empty", "same", "placeholder"] : [filter];
        for (const kind of want) {
          const list = kind === "missing" ? c.missing : kind === "empty" ? c.emptyValues : kind === "same" ? c.sameAsBase : c.placeholderIssues;
          for (const it of list || []) {
            out.push({
              ns: n,
              key: it.key,
              baseValue: it.baseValue ?? "",
              kind,
              locale: loc,
              phDetail: kind === "placeholder" ? phText(it.detail) : void 0
            });
          }
        }
      }
    }
    const q = query.trim().toLowerCase();
    const filtered = q ? out.filter((r) => r.key.toLowerCase().includes(q) || r.baseValue.toLowerCase().includes(q)) : out;
    return filtered.slice(0, 500);
  }, [scan, effectiveNs, effectiveLocale, filter, query]);
  const editKey = (r) => `${r.locale}||${r.ns}||${r.key}`;
  const pendingCount = Object.values(edits).filter((v) => v.trim()).length;
  const applyEdits = async () => {
    if (!meta || !scan) return;
    setBusy(true);
    setResult(null);
    try {
      const byNs = {};
      for (const [k, v] of Object.entries(edits)) {
        if (!v.trim()) continue;
        const [loc, n, key] = k.split("||");
        if (!byNs[n]) byNs[n] = {};
        byNs[n][key] = v;
      }
      let last = null;
      for (const [n, translations] of Object.entries(byNs)) {
        last = await apiApply(meta, { dir: scan.root, locale: effectiveLocale, ns: n, translations });
        if (last.ok === false) break;
      }
      setResult(last);
      if (last && last.ok) {
        setEdits({});
        setConfirming(false);
        const { apiScan: apiScan2 } = await Promise.resolve().then(() => (init_model(), model_exports));
        const fresh = await apiScan2(meta, scan.root);
        onScanDone(fresh);
        setUndoList(await loadUndoIndexSafe(meta));
      }
    } catch (e) {
      setResult({ ok: false, errors: [{ key: "-", reason: String(e.message || e) }] });
    } finally {
      setBusy(false);
    }
  };
  const undoLast = async () => {
    if (!meta) return;
    setBusy(true);
    try {
      const list = await loadUndoIndexSafe(meta);
      setUndoList(list);
      if (!list.length) {
        setResult({ ok: false, errors: [{ key: "-", reason: "\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u6279\u6B21" }] });
        return;
      }
      const r = await apiUndo(meta, list[0].batchId);
      const bad = r.results.filter((x) => !x.ok);
      setResult(bad.length ? { ok: false, errors: bad.map((b) => ({ key: b.file, reason: b.error || "\u6062\u590D\u5931\u8D25" })) } : { ok: true, message: `\u5DF2\u64A4\u9500\u6279\u6B21 ${list[0].batchId}` });
      const { apiScan: apiScan2 } = await Promise.resolve().then(() => (init_model(), model_exports));
      onScanDone(await apiScan2(meta, scan?.root || ""));
    } catch (e) {
      setResult({ ok: false, errors: [{ key: "-", reason: String(e.message || e) }] });
    } finally {
      setBusy(false);
    }
  };
  if (!scan) {
    return /* @__PURE__ */ jsx2("div", { style: { padding: 16, opacity: 0.8 }, children: "\u5148\u5230\u300C\u626B\u63CF\u300DTab \u626B\u4E00\u4E2A locale \u76EE\u5F55\u3002" });
  }
  if (!targetLocales.length) {
    return /* @__PURE__ */ jsxs2("div", { style: { padding: 16, opacity: 0.8 }, children: [
      "\u53EA\u8BC6\u522B\u5230\u57FA\u51C6\u8BED\u8A00 ",
      scan.baseLocale,
      "\uFF0C\u6CA1\u6709\u5176\u4ED6\u8BED\u8A00\u6587\u4EF6\u53EF\u6BD4\u5BF9\u3002"
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx2("select", { value: effectiveNs, onChange: (e) => setNs(e.target.value), style: selStyle, children: scan.nsList.map((n) => /* @__PURE__ */ jsxs2("option", { value: n, children: [
        "ns: ",
        n || "\uFF08\u6839\uFF09"
      ] }, n)) }),
      /* @__PURE__ */ jsx2("select", { value: effectiveLocale, onChange: (e) => setLocale(e.target.value), style: selStyle, children: targetLocales.map((l) => /* @__PURE__ */ jsxs2("option", { value: l, children: [
        "\u8BED\u8A00: ",
        l
      ] }, l)) }),
      /* @__PURE__ */ jsxs2("select", { value: filter, onChange: (e) => setFilter(e.target.value), style: selStyle, children: [
        /* @__PURE__ */ jsx2("option", { value: "all", children: "\u5168\u90E8\u95EE\u9898" }),
        /* @__PURE__ */ jsx2("option", { value: "missing", children: "\u4EC5\u7F3A\u5931" }),
        /* @__PURE__ */ jsx2("option", { value: "empty", children: "\u4EC5\u7A7A\u503C" }),
        /* @__PURE__ */ jsx2("option", { value: "same", children: "\u4EC5\u7591\u4F3C\u672A\u7FFB\u8BD1" }),
        /* @__PURE__ */ jsx2("option", { value: "placeholder", children: "\u4EC5\u5360\u4F4D\u7B26" })
      ] }),
      /* @__PURE__ */ jsx2(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: "\u6309\u952E\u6216\u6587\u6848\u8FC7\u6EE4",
          style: { ...selStyle, flex: 1, minWidth: 140 }
        }
      )
    ] }),
    rows.length === 0 && /* @__PURE__ */ jsx2("div", { style: { padding: 16, border: "1px dashed var(--polaris-border, #3f3f46)", borderRadius: 8, opacity: 0.8 }, children: cellIssueCountAll(scan, effectiveNs, effectiveLocale) === 0 ? `\u2705 ${effectiveLocale} \u5728 ns\u300C${effectiveNs || "\uFF08\u6839\uFF09"}\u300D\u4E0E\u57FA\u51C6 ${scan.baseLocale} \u5BF9\u9F50\u3002` : "\u5F53\u524D\u8FC7\u6EE4\u5668\u4E0B\u6CA1\u6709\u884C\uFF08\u8BD5\u8BD5\u300C\u5168\u90E8\u95EE\u9898\u300D\uFF09\u3002" }),
    rows.map((r) => {
      const ek = editKey(r);
      return /* @__PURE__ */ jsxs2("div", { style: { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--polaris-border, #27272a)", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, padding: "1px 6px", borderRadius: 4, background: kindBg(r.kind), color: "#fff" }, children: KIND_LABEL[r.kind] }),
          /* @__PURE__ */ jsx2("code", { style: { fontSize: 12, wordBreak: "break-all" }, children: r.key })
        ] }),
        /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12, opacity: 0.85, marginTop: 4, whiteSpace: "pre-wrap" }, children: [
          scan.baseLocale,
          "\uFF1A",
          r.baseValue || "\uFF08\u7A7A\uFF09",
          r.phDetail && /* @__PURE__ */ jsxs2("span", { style: { color: "#f59e0b" }, children: [
            " \xB7 ",
            r.phDetail
          ] })
        ] }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            value: edits[ek] || "",
            onChange: (e) => setEdits((prev) => ({ ...prev, [ek]: e.target.value })),
            placeholder: `\u586B\u5199 ${r.locale} \u8BD1\u6587\u540E\u70B9\u4E0B\u65B9\u300C\u5E94\u7528\u300D\u2026`,
            style: { width: "100%", marginTop: 6, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--polaris-border, #3f3f46)", background: "transparent", color: "inherit", boxSizing: "border-box" }
          }
        )
      ] }, `${r.locale}:${r.ns}:${r.kind}:${r.key}`);
    }),
    rows.length > 0 && /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }, children: [
      !confirming ? /* @__PURE__ */ jsxs2(
        "button",
        {
          onClick: () => setConfirming(true),
          disabled: pendingCount === 0 || busy || !meta,
          style: { ...btnPrimary, opacity: pendingCount === 0 || !meta ? 0.5 : 1 },
          children: [
            "\u5E94\u7528 ",
            pendingCount,
            " \u9879\u53D8\u66F4"
          ]
        }
      ) : /* @__PURE__ */ jsxs2(Fragment, { children: [
        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 12, color: "#f59e0b" }, children: [
          "\u5C06\u5199\u5165 ",
          effectiveLocale,
          "\uFF08\u5199\u524D\u81EA\u52A8\u5FEB\u7167\uFF0C\u53EF\u64A4\u9500\uFF09\u3002\u542B\u6CE8\u91CA\u6587\u4EF6\u9700\u5728\u8BBE\u7F6E\u8BF4\u660E\u4E2D\u786E\u8BA4 stripComments\u3002"
        ] }),
        /* @__PURE__ */ jsx2("button", { onClick: () => void applyEdits(), disabled: busy, style: btnPrimary, children: busy ? "\u5199\u5165\u4E2D\u2026" : "\u786E\u8BA4\u5199\u5165" }),
        /* @__PURE__ */ jsx2("button", { onClick: () => setConfirming(false), disabled: busy, style: btnGhost, children: "\u53D6\u6D88" })
      ] }),
      /* @__PURE__ */ jsx2("button", { onClick: () => void undoLast(), disabled: busy || !meta, style: btnGhost, children: "\u64A4\u9500\u6700\u8FD1\u6279\u6B21" }),
      ctx.onSendToChat && rows.length > 0 && /* @__PURE__ */ jsx2(
        "button",
        {
          onClick: () => ctx.onSendToChat?.([
            `\u8BF7\u5E2E\u6211\u7FFB\u8BD1 ${scan.root} \u7684 ${effectiveLocale}\uFF08ns=${effectiveNs || "\u5168\u90E8"}\uFF09\uFF0C\u5171 ${rows.length} \u4E2A\u95EE\u9898\u952E\uFF08\u7F3A\u5931/\u7A7A\u503C/\u7591\u4F3C\u672A\u7FFB\u8BD1/\u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4\uFF09\u3002`,
            `\u8BF7\u8C03\u7528 i18n_missing \u83B7\u53D6\u5DE5\u4F5C\u8868\uFF08dir="${scan.root}", locale="${effectiveLocale}"${effectiveNs ? `, ns="${effectiveNs}"` : ""}\uFF09\uFF0C`,
            `\u6309\u672F\u8BED\u8868\u7FFB\u8BD1\u5168\u90E8\u6761\u76EE\u540E\uFF0C\u7ECF\u6211\u786E\u8BA4\u7528 i18n_apply \u843D\u76D8\u3002`
          ].join("")),
          style: btnGhost,
          children: "\u8BA9 AI \u7FFB\u8BD1\u8FD9\u4E9B\u95EE\u9898\u952E"
        }
      )
    ] }),
    result && /* @__PURE__ */ jsx2("div", { style: {
      marginTop: 10,
      padding: "8px 12px",
      borderRadius: 8,
      fontSize: 12,
      whiteSpace: "pre-wrap",
      background: result.ok ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
      border: `1px solid ${result.ok ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`
    }, children: result.ok ? `\u2705 ${result.message || `\u5DF2\u5199\u5165${result.batchId ? `\uFF08batchId=${result.batchId}\uFF09` : ""}`}${result.applied ? "\n" + result.applied.map((a) => `[${a.ns}] ${a.file}\uFF1A\u65B0\u589E ${a.insert} \xB7 \u66F4\u65B0 ${a.update}`).join("\n") : ""}` : `\u274C \u672A\u5199\u76D8\uFF1A
${result.errors.map((e) => `- ${e.key}: ${e.reason}`).join("\n")}${result.hint ? `
${result.hint}` : ""}` }),
    undoList.length > 0 && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 10, fontSize: 11, opacity: 0.7 }, children: [
      "\u6700\u8FD1\u6279\u6B21\uFF1A",
      undoList.slice(0, 5).map((u) => `${u.batchId}(${u.locale}, ${u.at.slice(5, 16).replace("T", " ")})`).join(" \xB7 ")
    ] })
  ] });
}
async function loadUndoIndexSafe(meta) {
  try {
    return await loadUndoIndex();
  } catch (_) {
    return [];
  }
}
function cellIssueCountAll(scan, ns, locale) {
  const entry = scan.matrix[ns];
  const c = entry && entry[locale];
  return cellIssueCount(c);
}
function phText(detail) {
  if (!detail) return "";
  const parts = [];
  if (detail.missingInTarget?.length) parts.push(`\u7F3A\u5C11 ${detail.missingInTarget.join(" ")}`);
  if (detail.extraInTarget?.length) parts.push(`\u591A\u51FA ${detail.extraInTarget.join(" ")}`);
  if (detail.positionalIssues?.length) parts.push(detail.positionalIssues.join("; "));
  return parts.join("\uFF1B");
}
function kindBg(kind) {
  return kind === "missing" ? "#ef4444" : kind === "empty" ? "#f59e0b" : kind === "same" ? "#a855f7" : "#ec4899";
}
var selStyle = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--polaris-border, #3f3f46)",
  background: "transparent",
  color: "inherit"
};
var btnPrimary = {
  padding: "7px 16px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  background: "var(--polaris-accent, #6366f1)",
  color: "#fff"
};
var btnGhost = {
  padding: "7px 14px",
  borderRadius: 6,
  border: "1px solid var(--polaris-border, #3f3f46)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};

// src/SettingsTab.tsx
init_model();
import { useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ ctx, meta, onMetaRefresh }) {
  const [baseLocale, setBaseLocale] = useState3("");
  const [glossary, setGlossary] = useState3({ terms: {} });
  const [glossaryDraft, setGlossaryDraft] = useState3("");
  const [undoList, setUndoList] = useState3([]);
  const [msg, setMsg] = useState3("");
  useEffect2(() => {
    loadSettings().then((s) => setBaseLocale(s.baseLocale || ""));
    loadGlossary().then((g) => {
      setGlossary(g);
      setGlossaryDraft(Object.entries(g.terms).map(([k, v]) => `${k} = ${v}`).join("\n"));
    });
    loadUndoIndex().then(setUndoList).catch(() => setUndoList([]));
  }, []);
  const saveBase = async () => {
    const s = await loadSettings();
    await saveSettings({ ...s, baseLocale: baseLocale.trim() || void 0 });
    setMsg("\u57FA\u51C6\u8BED\u8A00\u5DF2\u4FDD\u5B58");
    setTimeout(() => setMsg(""), 2e3);
  };
  const saveGlossaryDraft = async () => {
    const terms = {};
    for (const line of glossaryDraft.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const idx = t.indexOf("=");
      if (idx <= 0) continue;
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim();
      if (k && v) terms[k] = v;
    }
    const next = { terms, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await saveGlossary(next);
    setGlossary(next);
    setMsg(`\u672F\u8BED\u8868\u5DF2\u4FDD\u5B58\uFF08${Object.keys(terms).length} \u6761\uFF09\uFF0CAI \u7FFB\u8BD1\u65F6\u81EA\u52A8\u6CE8\u5165`);
    setTimeout(() => setMsg(""), 2500);
  };
  const clearGlossary = async () => {
    const next = { terms: {}, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await saveGlossary(next);
    setGlossary(next);
    setGlossaryDraft("");
  };
  const refreshUndo = async () => {
    if (meta && metaAlive(meta)) {
      try {
        setUndoList(await apiUndoList(meta));
        return;
      } catch (_) {
      }
    }
    setUndoList(await loadUndoIndex());
  };
  return /* @__PURE__ */ jsxs3("div", { style: { display: "grid", gap: 14 }, children: [
    msg && /* @__PURE__ */ jsx3("div", { style: { padding: "6px 12px", borderRadius: 8, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", fontSize: 12 }, children: msg }),
    /* @__PURE__ */ jsxs3(Card, { title: "\u57FA\u51C6\u8BED\u8A00", children: [
      /* @__PURE__ */ jsx3("div", { style: { fontSize: 12, opacity: 0.8, marginBottom: 6 }, children: "\u7FFB\u8BD1\u6E90\u8BED\u8A00\u3002\u7559\u7A7A=\u81EA\u52A8\u63A8\u65AD\uFF08zh* \u4F18\u5148\uFF0C\u5176\u6B21 en\uFF09\u3002\u793A\u4F8B\uFF1Azh-cn\u3001zh\u3001en\u3002" }),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            value: baseLocale,
            onChange: (e) => setBaseLocale(e.target.value),
            placeholder: "\u81EA\u52A8\u63A8\u65AD",
            style: { ...inputStyle, width: 180 }
          }
        ),
        /* @__PURE__ */ jsx3("button", { onClick: () => void saveBase(), style: btnPrimary2, children: "\u4FDD\u5B58" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3(Card, { title: "\u672F\u8BED\u8868\uFF08\u7FFB\u8BD1\u7EA6\u675F\uFF09", children: [
      /* @__PURE__ */ jsxs3("div", { style: { fontSize: 12, opacity: 0.8, marginBottom: 6 }, children: [
        "\u6BCF\u884C\u4E00\u6761\u300C\u6E90\u8BCD = \u8BD1\u8BCD\u300D\u3002i18n_missing \u8F93\u51FA\u5DE5\u4F5C\u8868\u65F6\u81EA\u52A8\u6CE8\u5165\uFF0CAI \u7FFB\u8BD1\u5FC5\u987B\u9075\u5B88\u3002 \u5F53\u524D ",
        Object.keys(glossary.terms).length,
        " \u6761\u3002"
      ] }),
      /* @__PURE__ */ jsx3(
        "textarea",
        {
          value: glossaryDraft,
          onChange: (e) => setGlossaryDraft(e.target.value),
          rows: 6,
          placeholder: "checkout = \u7ED3\u7B97\n\u8BA2\u5355 = order",
          style: { ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }
        }
      ),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx3("button", { onClick: () => void saveGlossaryDraft(), style: btnPrimary2, children: "\u4FDD\u5B58\u672F\u8BED\u8868" }),
        /* @__PURE__ */ jsx3("button", { onClick: () => void clearGlossary(), style: btnGhost2, children: "\u6E05\u7A7A" })
      ] })
    ] }),
    /* @__PURE__ */ jsx3(Card, { title: "\u670D\u52A1\u72B6\u6001", children: /* @__PURE__ */ jsxs3("div", { style: { fontSize: 12, lineHeight: 1.8 }, children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        "\u72B6\u6001\uFF1A",
        metaAlive(meta) ? /* @__PURE__ */ jsx3("span", { style: { color: "#22c55e" }, children: "\u5728\u7EBF" }) : /* @__PURE__ */ jsx3("span", { style: { color: "#ef4444" }, children: "\u79BB\u7EBF\uFF08\u5BBF\u4E3B\u4F1A\u81EA\u52A8\u62C9\u8D77\uFF0C30s \u5FC3\u8DF3\uFF09" })
      ] }),
      meta && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          "\u7AEF\u53E3 ",
          meta.port,
          " \xB7 \u7248\u672C v",
          meta.version || "?",
          " \xB7 pid ",
          meta.pid || "-"
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          "\u5FC3\u8DF3 ",
          String(meta.lastTickAt || "").replace("T", " ").slice(0, 19) || "\u2014"
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          "undo \u5FEB\u7167\u76EE\u5F55\uFF1A",
          meta.appConfigDir ? `${meta.appConfigDir}\\i18n-sync-undo\\` : "\uFF08\u672A\u77E5\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("button", { onClick: onMetaRefresh, style: { ...btnGhost2, marginTop: 6 }, children: "\u5237\u65B0\u72B6\u6001" })
    ] }) }),
    /* @__PURE__ */ jsx3(Card, { title: "\u64A4\u9500\u5386\u53F2\uFF08\u6700\u8FD1 20 \u6279\uFF09", children: /* @__PURE__ */ jsxs3("div", { style: { fontSize: 12 }, children: [
      undoList.length === 0 && /* @__PURE__ */ jsx3("span", { style: { opacity: 0.7 }, children: "\u6682\u65E0\u5E94\u7528\u8BB0\u5F55\u3002" }),
      undoList.slice(0, 8).map((u) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, padding: "3px 0", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx3("code", { children: u.batchId }),
        /* @__PURE__ */ jsx3("span", { children: u.locale }),
        /* @__PURE__ */ jsx3("span", { style: { opacity: 0.6 }, children: u.at.replace("T", " ").slice(0, 19) }),
        /* @__PURE__ */ jsxs3("span", { style: { opacity: 0.6, wordBreak: "break-all" }, children: [
          u.files.length,
          " \u6587\u4EF6"
        ] })
      ] }, u.batchId)),
      /* @__PURE__ */ jsx3("button", { onClick: () => void refreshUndo(), style: { ...btnGhost2, marginTop: 6 }, children: "\u5237\u65B0" })
    ] }) }),
    /* @__PURE__ */ jsx3(Card, { title: "\u6570\u636E\u4E0E\u9690\u79C1", children: /* @__PURE__ */ jsx3("div", { style: { fontSize: 12, lineHeight: 1.8, opacity: 0.85 }, children: "\u7EAF\u672C\u5730\u96F6\u5916\u8054\uFF1A\u626B\u63CF/\u843D\u76D8\u5168\u5728\u672C\u673A\uFF1B\u7FFB\u8BD1\u7531\u5BBF\u4E3B\u5BF9\u8BDD AI \u5B8C\u6210\uFF08\u4E0D\u989D\u5916\u914D\u7F6E\u5BC6\u94A5\uFF09\u3002 \u8BBE\u7F6E\u4E0E\u672F\u8BED\u8868\u5B58 cap.kv\uFF08i18n.settings / i18n.glossary\uFF09\uFF1B\u64A4\u9500\u5FEB\u7167\u5B58\u5E94\u7528\u914D\u7F6E\u76EE\u5F55 i18n-sync-undo/\uFF08\u4FDD\u7559\u6700\u8FD1 20 \u6279\uFF09\u3002 \u63D2\u4EF6\u6C38\u4E0D\u5220\u9664/\u8986\u76D6\u975E locale \u6587\u4EF6\uFF0C\u5E94\u7528\u53EA\u5199\u300C\u626B\u63CF\u53D1\u73B0\u7684 locale \u6587\u4EF6\u300D\u3002" }) })
  ] });
}
function Card({ title, children }) {
  return /* @__PURE__ */ jsxs3("div", { style: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--polaris-border, #3f3f46)", background: "var(--polaris-surface, rgba(127,127,127,.05))" }, children: [
    /* @__PURE__ */ jsx3("div", { style: { fontWeight: 600, marginBottom: 8 }, children: title }),
    children
  ] });
}
var inputStyle = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--polaris-border, #3f3f46)",
  background: "transparent",
  color: "inherit"
};
var btnPrimary2 = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  background: "var(--polaris-accent, #6366f1)",
  color: "#fff"
};
var btnGhost2 = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--polaris-border, #3f3f46)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};

// src/Panel.tsx
init_model();
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var TABS = [
  { id: "scan", label: "\u626B\u63CF" },
  { id: "matrix", label: "\u77E9\u9635" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel(props) {
  const ctx = props;
  const [tab, setTab] = useState4("scan");
  const [meta, setMeta] = useState4(null);
  const [scan, setScan] = useState4(null);
  const [online, setOnline] = useState4(null);
  const refreshMeta = useCallback(async () => {
    const m = await getMeta();
    setMeta(m);
    setOnline(metaAlive(m));
  }, []);
  useEffect3(() => {
    refreshMeta();
    const t = setInterval(refreshMeta, 30 * 1e3);
    return () => clearInterval(t);
  }, [refreshMeta]);
  const alive = online === true && !!meta;
  return /* @__PURE__ */ jsxs4("div", { style: { fontFamily: "inherit", fontSize: 13, color: "var(--polaris-text, #d4d4d8)", padding: 12, maxWidth: 860, margin: "0 auto" }, children: [
    /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx4("strong", { style: { fontSize: 14 }, children: "\u591A\u8BED\u8A00\u952E\u540C\u6B65\u53F0" }),
      /* @__PURE__ */ jsx4(
        "span",
        {
          title: alive ? "\u670D\u52A1\u5728\u7EBF" : "\u670D\u52A1\u672A\u8FD0\u884C\uFF1A\u5BBF\u4E3B\u4F1A\u81EA\u52A8\u62C9\u8D77\uFF0C\u7A0D\u7B49\u7247\u523B\u6216\u53BB \u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192i18n-sync \u67E5\u770B",
          style: {
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            background: alive ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)",
            color: alive ? "#22c55e" : "#ef4444"
          },
          children: alive ? "\u670D\u52A1\u5728\u7EBF" : online === null ? "\u68C0\u6D4B\u4E2D\u2026" : "\u670D\u52A1\u672A\u8FD0\u884C"
        }
      ),
      /* @__PURE__ */ jsx4("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx4("div", { style: { display: "flex", gap: 4 }, children: TABS.map((t) => /* @__PURE__ */ jsx4(
        "button",
        {
          onClick: () => setTab(t.id),
          style: {
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid transparent",
            cursor: "pointer",
            background: tab === t.id ? "var(--polaris-accent, #6366f1)" : "transparent",
            color: tab === t.id ? "#fff" : "inherit",
            borderColor: tab === t.id ? "transparent" : "var(--polaris-border, #3f3f46)"
          },
          children: t.label
        },
        t.id
      )) })
    ] }),
    !alive && /* @__PURE__ */ jsxs4("div", { style: { padding: "8px 12px", borderRadius: 8, background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.3)", marginBottom: 10, lineHeight: 1.6 }, children: [
      "\u540E\u53F0\u670D\u52A1\u672A\u8FD0\u884C\uFF0C\u626B\u63CF\u4E0E\u843D\u76D8\u4E0D\u53EF\u7528\u3002\u5BBF\u4E3B\u5BF9\u5DF2\u542F\u7528\u63D2\u4EF6\u4F1A\u81EA\u52A8\u62C9\u8D77\u670D\u52A1\uFF0830s \u5FC3\u8DF3\uFF0C3 \u6B21\u5931\u8D25\u81EA\u52A8\u91CD\u542F\uFF09\uFF1B \u4E5F\u53EF\u5230 ",
      /* @__PURE__ */ jsx4("b", { children: "\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u591A\u8BED\u8A00\u952E\u540C\u6B65\u53F0" }),
      " \u624B\u52A8\u542F\u52A8\u3002MCP \u5DE5\u5177\uFF08\u5BF9\u8BDD\u91CC\u7684 i18n_status \u7B49\uFF09\u4E0D\u4F9D\u8D56\u672C\u670D\u52A1\uFF0C\u59CB\u7EC8\u53EF\u7528\u3002"
    ] }),
    tab === "scan" && /* @__PURE__ */ jsx4(ScanTab, { ctx, meta, scan, onScanDone: setScan, goMatrix: () => setTab("matrix") }),
    tab === "matrix" && /* @__PURE__ */ jsx4(MatrixTab, { ctx, meta, scan, onScanDone: setScan }),
    tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { ctx, meta, onMetaRefresh: refreshMeta })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function I18nSyncEntry(props) {
  return /* @__PURE__ */ jsx5(Panel, { ...props });
}
export {
  I18nSyncEntry as default
};
