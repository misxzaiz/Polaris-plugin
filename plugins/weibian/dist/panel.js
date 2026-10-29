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

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var TEXT_EXTS = ["md", "markdown", "mdx", "txt", "text", "csv", "tsv", "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "srt", "vtt", "tex", "bib"];
    var CODE_EXTS = ["js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "h", "cpp", "hpp", "cc", "cs", "rb", "php", "swift", "kt", "kts", "sh", "bash", "bat", "cmd", "ps1", "psm1", "sql", "vue", "svelte", "lua", "r", "dart", "scala", "groovy"];
    var PDF_EXTS = ["pdf"];
    var DOCX_EXTS = ["docx"];
    var HTML_EXTS = ["html", "htm"];
    var DEFAULT_EXCLUDE_DIRS = [
      "node_modules",
      ".git",
      ".svn",
      ".hg",
      "target",
      "dist",
      "build",
      "out",
      ".zcode",
      ".zcode-plugin",
      ".venv",
      "venv",
      "__pycache__",
      ".obsidian",
      ".idea",
      ".vscode",
      ".gradle",
      ".next",
      ".cache",
      "coverage",
      "appdata"
    ];
    function extOf(name) {
      const i = String(name || "").lastIndexOf(".");
      if (i <= 0 || i === String(name).length - 1) return "";
      return String(name).slice(i + 1).toLowerCase();
    }
    function classifyExt(ext) {
      const e = String(ext || "").toLowerCase();
      if (TEXT_EXTS.includes(e)) return "text";
      if (CODE_EXTS.includes(e)) return "code";
      if (PDF_EXTS.includes(e)) return "pdf";
      if (DOCX_EXTS.includes(e)) return "docx";
      if (HTML_EXTS.includes(e)) return "html";
      return null;
    }
    function clampInt(v, lo, hi, dflt) {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return dflt;
      return Math.min(hi, Math.max(lo, n));
    }
    function isAbsolutePath(p) {
      const s = String(p || "");
      return /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || s.startsWith("/");
    }
    function normSlashes(p) {
      return String(p || "").replace(/\\/g, "/");
    }
    function cleanPathList(list) {
      if (!Array.isArray(list)) return [];
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const raw of list) {
        if (typeof raw !== "string") continue;
        const p = raw.trim();
        if (!p || !isAbsolutePath(p)) continue;
        const key = normSlashes(p).toLowerCase().replace(/\/+$/, "");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p.replace(/[\\/]+$/, ""));
      }
      return out;
    }
    function cleanNameList(list) {
      if (!Array.isArray(list)) return [];
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const raw of list) {
        if (typeof raw !== "string") continue;
        const segs = normSlashes(raw.trim()).split("/").filter(Boolean);
        for (const seg of segs) {
          const lower = seg.toLowerCase();
          if (!lower || seen.has(lower)) continue;
          seen.add(lower);
          out.push(lower);
        }
      }
      return out;
    }
    function normalizeSettings3(raw) {
      const r = raw && typeof raw === "object" ? raw : {};
      const maxFileMB = clampInt(r.maxFileMB, 1, 200, 20);
      const maxTextKB = clampInt(r.maxTextKB, 32, 1024, 256);
      return {
        roots: cleanPathList(r.roots),
        extraExcludes: cleanNameList(r.extraExcludes),
        maxDocs: clampInt(r.maxDocs, 50, 2e4, 5e3),
        maxFileBytes: clampInt(maxFileMB, 1, 200, 20) * 1024 * 1024,
        maxTextBytes: clampInt(maxTextKB, 32, 1024, 256) * 1024,
        includeHidden: r.includeHidden === true,
        enabled: r.enabled !== false
      };
    }
    function isHiddenSegment(seg) {
      return seg.length > 1 && seg.startsWith(".") && seg !== "..";
    }
    function isIndexable(relPath, size, settings, opts) {
      const s = settings || normalizeSettings3(null);
      const o = opts || {};
      const rel = normSlashes(relPath);
      const segs = rel.split("/").filter(Boolean);
      const name = segs[segs.length - 1] || "";
      if (!name) return { ok: false, reason: "empty" };
      const includeHidden = o.includeHidden === true || s.includeHidden === true;
      const dirs = segs.slice(0, -1);
      if (!includeHidden) {
        if (isHiddenSegment(name)) return { ok: false, reason: "hidden" };
        for (const d of dirs) if (isHiddenSegment(d)) return { ok: false, reason: "hidden" };
      }
      const excluded = new Set(DEFAULT_EXCLUDE_DIRS.map((d) => d.toLowerCase()));
      for (const x of s.extraExcludes) excluded.add(String(x).toLowerCase());
      for (const d of dirs) {
        if (excluded.has(d.toLowerCase())) return { ok: false, reason: "exclude:" + d };
      }
      const ext = extOf(name);
      if (!classifyExt(ext)) return { ok: false, reason: "ext:" + (ext || "none") };
      if (typeof size === "number" && size > s.maxFileBytes) return { ok: false, reason: "size" };
      return { ok: true, reason: "", ext };
    }
    function containsPath(root, target) {
      const r = normSlashes(root).replace(/\/+$/, "").toLowerCase();
      const t = normSlashes(target).replace(/\/+$/, "").toLowerCase();
      if (!r || !t) return false;
      if (t === r) return true;
      return t.startsWith(r + "/");
    }
    var CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
    var ASCII_RE = /[a-z0-9_+#]+/g;
    function bump(tf, tok, n) {
      const cur = tf.get(tok);
      tf.set(tok, (cur || 0) + (n || 1));
    }
    function tokenize(text) {
      const tf = /* @__PURE__ */ new Map();
      if (text == null) return tf;
      const s = String(text).toLowerCase();
      if (!s) return tf;
      for (const m of s.matchAll(ASCII_RE)) {
        if (m[0].length >= 2 && !/^_+$/.test(m[0])) bump(tf, m[0]);
      }
      for (const m of s.matchAll(CJK_RE)) {
        const run = m[0];
        if (run.length === 1) {
          bump(tf, run);
          continue;
        }
        for (let i = 0; i < run.length; i++) {
          bump(tf, run[i]);
          if (i + 1 < run.length) bump(tf, run[i] + run[i + 1]);
        }
      }
      return tf;
    }
    function parseQuery(q) {
      const raw = String(q || "");
      let ext = "";
      let dir = "";
      const rest = [];
      for (const part of raw.split(/\s+/)) {
        if (!part) continue;
        const low = part.toLowerCase();
        if (!ext && low.startsWith("ext:")) {
          ext = low.slice(4).replace(/^\./, "");
          continue;
        }
        if (!dir && low.startsWith("dir:")) {
          dir = low.slice(4).replace(/^\/+|\/+$/g, "");
          continue;
        }
        rest.push(part);
      }
      return { ext: ext || "", dir: dir || "", raw: rest.join(" ") };
    }
    var BM25_K1 = 1.2;
    var BM25_B = 0.75;
    function rank(queryText, inverted, docs, opts) {
      const o = opts || {};
      const limit = clampInt(o.limit, 1, 100, 8);
      const { ext, dir, raw } = parseQuery(queryText);
      const qtf = tokenize(raw);
      if (qtf.size === 0) return [];
      const N = docs.size;
      if (N === 0) return [];
      let totalLen = 0;
      for (const d of docs.values()) totalLen += d.len;
      const avgLen = totalLen / N || 1;
      const CATS2 = ["text", "code", "pdf", "docx", "html"];
      const extLower = String(ext || "").toLowerCase().replace(/^\./, "");
      const wantCat = CATS2.includes(extLower) ? extLower : "";
      const wantExt = extLower && !wantCat ? extLower : "";
      const dirLower = normSlashes(dir).toLowerCase();
      const scores = /* @__PURE__ */ new Map();
      for (const [tok] of qtf) {
        const postings = inverted.get(tok);
        if (!postings || postings.size === 0) continue;
        const df = postings.size;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        for (const [docId, tf] of postings) {
          const d = docs.get(docId);
          if (!d) continue;
          if (wantExt && d.ext !== wantExt) continue;
          if (wantCat && d.cat !== wantCat) continue;
          if (dirLower && !d.pathLower.includes("/" + dirLower + "/")) continue;
          const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (d.len / avgLen));
          const s = idf * (tf * (BM25_K1 + 1)) / denom;
          scores.set(docId, (scores.get(docId) || 0) + s);
        }
      }
      if (scores.size === 0) return [];
      const qtoks = [...qtf.keys()];
      for (const [docId, base] of scores) {
        const d = docs.get(docId);
        let hit = 0;
        let pathHit = false;
        for (const t of qtoks) {
          if (d.nameTf && d.nameTf.has(t)) hit++;
          else if (!pathHit && t.length >= 2 && d.pathLower.includes(t)) pathHit = true;
        }
        let boost = 1;
        if (hit === qtoks.length) boost = 1.5;
        else if (hit > 0) boost = 1.2;
        else if (pathHit) boost = 1.1;
        scores.set(docId, base * boost);
      }
      const out = [];
      for (const [docId, score] of scores) out.push({ docId, score });
      out.sort((a, b) => b.score - a.score || (a.docId < b.docId ? -1 : 1));
      return out.slice(0, limit);
    }
    function highlightTerms(raw) {
      const s = String(raw || "");
      const terms = [];
      const seen = /* @__PURE__ */ new Set();
      const push = (t) => {
        const k = t.toLowerCase();
        if (!seen.has(k) && t.length >= (/[a-z0-9]/i.test(t[0]) ? 2 : 1)) {
          seen.add(k);
          terms.push(t);
        }
      };
      for (const m of s.matchAll(/[A-Za-z0-9_+#]{2,}/g)) push(m[0]);
      for (const m of s.matchAll(CJK_RE)) push(m[0]);
      return terms;
    }
    function snippet(text, raw, width) {
      const W = clampInt(width, 64, 1024, 256);
      const s = String(text || "");
      const low = s.toLowerCase();
      const terms = highlightTerms(raw);
      const ranges = [];
      for (const t of terms) {
        const tl = t.toLowerCase();
        let idx = low.indexOf(tl);
        if (idx < 0 && /[\u3400-\u4dbf\u4e00-\u9fff]/.test(t) && t.length > 1) {
          for (const ch of t) {
            let i = low.indexOf(ch.toLowerCase());
            if (i >= 0) ranges.push([i, i + ch.length]);
          }
          continue;
        }
        let guard = 0;
        while (idx >= 0 && guard++ < 50) {
          ranges.push([idx, idx + tl.length]);
          idx = low.indexOf(tl, idx + tl.length);
        }
      }
      if (ranges.length === 0) return { text: s.slice(0, W), hits: [] };
      ranges.sort((a, b) => a[0] - b[0]);
      let bestStart = 0, bestCount = -1;
      for (const [st] of ranges) {
        const winStart = Math.max(0, st - Math.floor(W / 3));
        const winEnd = winStart + W;
        let c = 0;
        for (const [a, b] of ranges) if (a >= winStart && b <= winEnd) c++;
        if (c > bestCount) {
          bestCount = c;
          bestStart = winStart;
        }
      }
      const start = bestStart;
      const end = Math.min(s.length, start + W);
      const hits = [];
      for (const [a, b] of ranges) {
        if (b > start && a < end) hits.push({ s: Math.max(0, a - start), e: Math.min(end, b) - start });
      }
      hits.sort((a, b) => a.s - b.s);
      return { text: s.slice(start, end), hits };
    }
    function fmtBytes2(n) {
      const v = Number(n) || 0;
      if (v < 1024) return v + " B";
      if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
      if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + " MB";
      return (v / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }
    module.exports = {
      TEXT_EXTS,
      CODE_EXTS,
      DEFAULT_EXCLUDE_DIRS,
      extOf,
      classifyExt,
      isAbsolutePath,
      normSlashes,
      normalizeSettings: normalizeSettings3,
      cleanPathList,
      cleanNameList,
      isIndexable,
      containsPath,
      tokenize,
      parseQuery,
      rank,
      highlightTerms,
      snippet,
      fmtBytes: fmtBytes2,
      BM25_K1,
      BM25_B
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect3, useState as useState3 } from "react";

// src/SearchTab.tsx
import { useCallback, useEffect, useRef, useState } from "react";

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

// src/model.ts
var core = __toESM(require_core());
async function kvReq(payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target: "cap.kv", payload } });
  if (!res || res.ok === false) throw new Error(String(res && res.error) || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res;
}
async function kvGet(key) {
  const res = await kvReq({ action: "get", key });
  return res.result && res.result.value !== void 0 ? res.result.value : null;
}
async function kvSet(key, value) {
  await kvReq({ action: "set", key, value });
}
var KEY_META = "weibian.meta";
var KEY_SETTINGS = "weibian.settings";
var KEY_STATS = "weibian.stats";
var KEY_RECENT = "weibian.recent";
function normalizeSettings2(raw) {
  return core.normalizeSettings(raw);
}
async function loadSettings() {
  return normalizeSettings2(await kvGet(KEY_SETTINGS));
}
async function saveSettings(s) {
  await kvSet(KEY_SETTINGS, s);
}
async function getMeta() {
  try {
    const raw = await kvGet(KEY_META);
    if (!raw || typeof raw !== "object") return null;
    const m = raw;
    if (typeof m.token !== "string" || !m.token || typeof m.port !== "number" || !m.port) return null;
    return m;
  } catch (_) {
    return null;
  }
}
async function loadStats() {
  const raw = await kvGet(KEY_STATS);
  return raw && typeof raw === "object" ? raw : null;
}
async function loadRecent() {
  const raw = await kvGet(KEY_RECENT);
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 20) : [];
}
async function pushRecent(q) {
  const list = await loadRecent();
  const next = [q, ...list.filter((x) => x !== q)].slice(0, 20);
  await kvSet(KEY_RECENT, next);
  return next;
}
async function clearRecent() {
  await kvSet(KEY_RECENT, []);
}
function serviceBase(meta) {
  const loc = window.location;
  const host = loc.hostname || "127.0.0.1";
  const isLocal = host === "127.0.0.1" || host === "localhost";
  return `${isLocal ? "http" : loc.protocol.startsWith("https") ? "https" : "http"}://${isLocal ? "127.0.0.1" : host}:${meta.port}`;
}
async function svcFetch(meta, api, body, timeoutMs = 2e4) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(serviceBase(meta) + api, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "x-weibian-token": meta.token },
      body: body ? JSON.stringify(body) : void 0,
      signal: controller.signal
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
var ServiceUnavailableError = class extends Error {
};
async function svc(api, body, timeoutMs) {
  const meta = await getMeta();
  if (!meta) throw new ServiceUnavailableError("\u6587\u6863\u68C0\u7D22\u670D\u52A1\u672A\u5C31\u7EEA\uFF1A\u9996\u6B21\u4F7F\u7528\u8BF7\u7A0D\u5019\u51E0\u79D2\uFF08\u5BBF\u4E3B\u81EA\u52A8\u62C9\u8D77\u540E\u53F0\u670D\u52A1\uFF09\uFF0C\u6216\u91CD\u65B0\u6253\u5F00\u9762\u677F\u3002");
  try {
    return await svcFetch(meta, api, body, timeoutMs);
  } catch (e) {
    throw new ServiceUnavailableError("\u6587\u6863\u68C0\u7D22\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A" + String(e.message) + "\uFF08\u624B\u673A\u7AEF\u8BF7\u786E\u8BA4\u4E0E\u7535\u8111\u540C\u4E00\u5C40\u57DF\u7F51\uFF09");
  }
}
function apiSearch(query, limit = 20) {
  return svc("/api/search", { query, limit }, 3e4);
}
function apiRead(path, offset = 0, maxChars = 6e3) {
  return svc("/api/read", { path, offset, maxChars });
}
function apiProgress() {
  return svc("/api/progress", void 0, 8e3);
}
function apiReindex(all) {
  return svc("/api/reindex", { all }, 8e3);
}
function apiProbe(path) {
  return svc("/api/probe", { path }, 8e3);
}

// src/SearchTab.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CATS = [
  ["", "\u5168\u90E8"],
  ["text", "\u6587\u6863"],
  ["code", "\u4EE3\u7801"],
  ["pdf", "PDF"],
  ["docx", "Word"],
  ["html", "\u7F51\u9875"]
];
function Snippet({ text, hits }) {
  if (!text) return null;
  const parts = [];
  let cur = 0;
  const sorted = [...hits].sort((a, b) => a.s - b.s);
  sorted.forEach((h, i) => {
    if (h.s < cur) return;
    if (h.s > cur) parts.push(/* @__PURE__ */ jsx("span", { children: text.slice(cur, h.s) }, `t${i}`));
    parts.push(/* @__PURE__ */ jsx("mark", { children: text.slice(h.s, h.e) }, `m${i}`));
    cur = h.e;
  });
  if (cur < text.length) parts.push(/* @__PURE__ */ jsx("span", { children: text.slice(cur) }, "tail"));
  return /* @__PURE__ */ jsx("div", { className: "wb-snip", children: parts });
}
function SearchTab({ stats }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [results, setResults] = useState(null);
  const [total, setTotal] = useState(0);
  const [took, setTook] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => {
    loadRecent().then(setRecent).catch(() => {
    });
  }, []);
  const runSearch = useCallback(async (q, c) => {
    const raw = q.trim();
    if (!raw) return;
    const query2 = c ? `${c === "text" || c === "code" || c === "pdf" || c === "docx" || c === "html" ? "ext:" + c + " " : ""}${raw}` : raw;
    setBusy(true);
    setError("");
    try {
      const r = await apiSearch(query2, 30);
      if (!r.ok) {
        setError(r.error || "\u68C0\u7D22\u5931\u8D25");
        setResults(null);
      } else {
        setResults(r.results || []);
        setTotal(r.total || 0);
        setTook(r.took || 0);
        if (r.results && r.results.length) {
          pushRecent(raw).then(setRecent).catch(() => {
          });
        }
      }
    } catch (e) {
      setError(e instanceof ServiceUnavailableError ? e.message : String(e.message || e));
      setResults(null);
    } finally {
      setBusy(false);
    }
  }, []);
  const onSubmit = useCallback(() => {
    runSearch(query, cat);
  }, [runSearch, query, cat]);
  const openPreview = useCallback(async (path, offset = 0) => {
    setPreview({ path, resp: null, loading: true, offset });
    try {
      const resp = await apiRead(path, offset, 8e3);
      setPreview((p) => p && p.path === path ? { ...p, resp, loading: false } : p);
    } catch (e) {
      setPreview((p) => p && p.path === path ? { ...p, resp: { ok: false, error: String(e.message || e) }, loading: false } : p);
    }
  }, []);
  const noIndex = stats && stats.docs === 0 && !stats.scanning;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "wb-bar" }),
      "\u68C0\u7D22",
      /* @__PURE__ */ jsx("span", { className: "wb-hint", children: "\u591A\u8BCD\u7A7A\u683C\u5206\u9694 \xB7 ext:pdf dir:\u5B50\u76EE\u5F55 \u53EF\u8FC7\u6EE4" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { padding: "0 18px 8px", display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          ref: inputRef,
          className: "wb-inp",
          style: { fontSize: 13, padding: "9px 12px" },
          placeholder: "\u5728\u5DF2\u7D22\u5F15\u7684\u6587\u6863\u91CC\u627E\u2026\uFF08Enter \u68C0\u7D22\uFF09",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") onSubmit();
          }
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "wb-btn", onClick: onSubmit, disabled: busy || !query.trim(), children: busy ? "\u68C0\u7D22\u4E2D\u2026" : "\u68C0\u7D22" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "wb-chiprow", children: CATS.map(([k, label]) => /* @__PURE__ */ jsx(
      "button",
      {
        className: `wb-chip${cat === k ? " on" : ""}`,
        onClick: () => {
          setCat(k);
          if (query.trim()) runSearch(query, k);
        },
        children: label
      },
      k || "all"
    )) }),
    error && /* @__PURE__ */ jsx("div", { className: "wb-alert bad", style: { whiteSpace: "pre-wrap" }, children: error }),
    noIndex && !results && !busy && /* @__PURE__ */ jsxs("div", { className: "wb-empty", children: [
      /* @__PURE__ */ jsx("b", { children: "\u7D22\u5F15\u8FD8\u662F\u7A7A\u7684" }),
      "\u5148\u5230\u300C\u7D22\u5F15\u300DTab \u6DFB\u52A0\u8981\u6536\u5F55\u7684\u6587\u4EF6\u5939\uFF08\u5982\u684C\u9762\u3001\u6587\u6863\uFF09\uFF0C",
      /* @__PURE__ */ jsx("br", {}),
      "\u670D\u52A1\u4F1A\u81EA\u52A8\u626B\u63CF\u5EFA\u7ACB\u7D22\u5F15\uFF0C\u4E4B\u540E\u8FD9\u91CC\u5C31\u80FD\u641C\u3001AI \u4E5F\u80FD\u5E2E\u4F60\u67E5\u3002"
    ] }),
    stats && stats.scanning && /* @__PURE__ */ jsx("div", { className: "wb-progress", children: /* @__PURE__ */ jsx("i", { style: { width: stats.maxDocs ? `${Math.min(96, (stats.maxDocs - stats.pending) / Math.max(1, stats.maxDocs) * 100)}%` : "40%" } }) }),
    results && /* @__PURE__ */ jsxs("div", { className: "wb-sec", style: { paddingTop: 2 }, children: [
      /* @__PURE__ */ jsx("i", { className: "wb-bar" }),
      "\u7ED3\u679C",
      /* @__PURE__ */ jsxs("span", { className: "wb-hint", children: [
        total,
        " \u6761\u547D\u4E2D \xB7 ",
        took,
        "ms",
        total > results.length ? `\uFF08\u663E\u793A\u524D ${results.length}\uFF09` : ""
      ] })
    ] }),
    results && results.length === 0 && /* @__PURE__ */ jsxs("div", { className: "wb-empty", children: [
      /* @__PURE__ */ jsx("b", { children: "\u6CA1\u6709\u547D\u4E2D" }),
      "\u6362\u66F4\u5177\u4F53\u7684\u8BCD\u8BD5\u8BD5\uFF1B\u6216\u5230\u300C\u7D22\u5F15\u300DTab \u786E\u8BA4\u76EE\u6807\u6587\u4EF6\u5939\u5DF2\u6536\u5F55\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u652F\u6301 ext:pdf / ext:code / dir:\u5B50\u76EE\u5F55\u540D \u8FC7\u6EE4\u3002"
    ] }),
    (results || []).map((it) => /* @__PURE__ */ jsxs("div", { className: "wb-item", onClick: () => openPreview(it.path), children: [
      /* @__PURE__ */ jsxs("div", { className: "wb-item-head", children: [
        /* @__PURE__ */ jsx("b", { children: it.name }),
        /* @__PURE__ */ jsxs("span", { className: "wb-badge", children: [
          it.cat,
          it.ext ? `.${it.ext}` : ""
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "wb-badge", children: [
          "\u76F8\u5173 ",
          it.score
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wb-item-mid", children: it.path }),
      /* @__PURE__ */ jsx(Snippet, { text: it.snippet.text, hits: it.snippet.hits })
    ] }, it.id)),
    recent.length > 0 && !results && !busy && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "wb-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "wb-bar" }),
        "\u6700\u8FD1\u68C0\u7D22",
        /* @__PURE__ */ jsx("button", { className: "wb-btn ghost sm", style: { marginLeft: "auto" }, onClick: () => {
          clearRecent().then(() => setRecent([])).catch(() => {
          });
        }, children: "\u6E05\u7A7A" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "wb-chiprow", children: recent.map((q) => /* @__PURE__ */ jsx("button", { className: "wb-chip", onClick: () => {
        setQuery(q);
        runSearch(q, cat);
      }, children: q }, q)) })
    ] }),
    preview && /* @__PURE__ */ jsx("div", { className: "wb-drawer", onClick: () => setPreview(null), children: /* @__PURE__ */ jsxs("div", { className: "wb-drawer-p", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "wb-drawer-h", children: [
        /* @__PURE__ */ jsx("b", { children: preview.path }),
        /* @__PURE__ */ jsx("button", { className: "wb-btn ghost sm", onClick: () => {
          void navigator.clipboard?.writeText(preview.path);
        }, children: "\u590D\u5236\u8DEF\u5F84" }),
        /* @__PURE__ */ jsx("button", { className: "wb-btn ghost sm", onClick: () => setPreview(null), children: "\u5173\u95ED" })
      ] }),
      preview.loading && /* @__PURE__ */ jsx("div", { className: "wb-empty", children: "\u8BFB\u53D6\u4E2D\u2026" }),
      !preview.loading && preview.resp && !preview.resp.ok && /* @__PURE__ */ jsx("div", { className: "wb-alert bad", style: { margin: "12px 16px" }, children: preview.resp.error }),
      !preview.loading && preview.resp && preview.resp.ok && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "wb-drawer-b", children: preview.resp.text }),
        /* @__PURE__ */ jsxs("div", { className: "wb-drawer-h", style: { borderTop: "1px solid #1C2330", borderBottom: "none", justifyContent: "center", gap: 14 }, children: [
          /* @__PURE__ */ jsxs("small", { style: { color: "#5C6678" }, children: [
            "\u5168\u6587 ",
            preview.resp.total,
            " \u5B57\u7B26",
            preview.resp.truncated ? `\uFF0C\u672C\u6BB5\u6B62\u4E8E ${preview.offset + (preview.resp.text?.length || 0)}` : "\uFF08\u5DF2\u5230\u672B\u5C3E\uFF09"
          ] }),
          preview.resp.truncated && /* @__PURE__ */ jsx("button", { className: "wb-btn sm", onClick: () => openPreview(preview.path, preview.offset + (preview.resp?.text?.length || 0)), children: "\u7EED\u8BFB\u4E0B\u4E00\u6BB5" })
        ] })
      ] })
    ] }) })
  ] });
}

// src/IndexTab.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + " B";
  if (v < 1048576) return (v / 1024).toFixed(1) + " KB";
  if (v < 1073741824) return (v / 1048576).toFixed(1) + " MB";
  return (v / 1073741824).toFixed(2) + " GB";
}
function IndexTab({ stats, onStats }) {
  const [settings, setSettings] = useState2(null);
  const [newRoot, setNewRoot] = useState2("");
  const [probe, setProbe] = useState2(null);
  const [msg, setMsg] = useState2("");
  const [err, setErr] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [confirmRebuild, setConfirmRebuild] = useState2(false);
  const refresh = useCallback2(async () => {
    try {
      setSettings(await loadSettings());
    } catch (e) {
      setErr("\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF1A" + String(e.message || e));
    }
  }, []);
  useEffect2(() => {
    refresh();
  }, [refresh]);
  useEffect2(() => {
    let alive = true;
    apiProbe().then((r) => {
      if (alive) setProbe(r);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect2(() => {
    if (!stats || !stats.scanning) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const p = await apiProgress();
        if (alive && p.ok) onStats(p);
      } catch (_) {
      }
    }, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [stats, onStats]);
  const persist = useCallback2(async (next) => {
    setBusy(true);
    setErr("");
    try {
      await saveSettings(next);
      setSettings(next);
      setMsg("\u5DF2\u4FDD\u5B58\uFF0C\u670D\u52A1\u5C06\u5728 30s \u5185\u81EA\u52A8\u5BF9\u8D26\uFF08\u6216\u70B9\u300C\u7ACB\u5373\u91CD\u626B\u300D\uFF09");
    } catch (e) {
      setErr("\u4FDD\u5B58\u5931\u8D25\uFF1A" + String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, []);
  const addRoot = useCallback2(async (p) => {
    const path = p.trim();
    if (!path) return;
    const cur = settings || normalizeSettings2(null);
    if (cur.roots.some((r) => r.toLowerCase() === path.replace(/[\\/]+$/, "").toLowerCase())) {
      setErr("\u8BE5\u76EE\u5F55\u5DF2\u5728\u5217\u8868\u4E2D");
      return;
    }
    await persist({ ...cur, roots: [...cur.roots, path.replace(/[\\/]+$/, "")] });
    setNewRoot("");
    setProbe(null);
  }, [settings, persist]);
  const removeRoot = useCallback2(async (p) => {
    const cur = settings;
    if (!cur) return;
    await persist({ ...cur, roots: cur.roots.filter((r) => r !== p) });
  }, [settings, persist]);
  const checkPath = useCallback2(async () => {
    setErr("");
    try {
      const r = await apiProbe(newRoot.trim() || void 0);
      setProbe(r);
      if (r.checked && !r.checked.exists) setErr("\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5\u76D8\u7B26\u4E0E\u62FC\u5199");
      else if (r.checked && !r.checked.isDir) setErr("\u8FD9\u662F\u4E00\u4E2A\u6587\u4EF6\u2014\u2014\u6587\u6863\u68C0\u7D22\u6309\u6587\u4EF6\u5939\u6536\u5F55\uFF08\u7D22\u5F15\u5176\u6240\u5728\u6587\u4EF6\u5939\u5373\u53EF\uFF09");
      else if (r.checked && r.checked.isDir) await addRoot(r.checked.path);
    } catch (e) {
      setErr(e instanceof ServiceUnavailableError ? e.message : String(e.message || e));
    }
  }, [newRoot, addRoot]);
  const doReindex = useCallback2(async (all) => {
    setBusy(true);
    setErr("");
    try {
      await apiReindex(all);
      setMsg(all ? "\u5DF2\u6E05\u7A7A\u7D22\u5F15\uFF0C\u5F00\u59CB\u5168\u91CF\u91CD\u5EFA\uFF08\u8FDB\u5EA6\u89C1\u4E0B\u65B9\uFF09" : "\u5DF2\u89E6\u53D1\u589E\u91CF\u91CD\u626B");
      setConfirmRebuild(false);
    } catch (e) {
      setErr(e instanceof ServiceUnavailableError ? e.message : String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, []);
  const patch = (k, v) => {
    if (!settings) return;
    const next = { ...settings, [k]: v };
    setSettings(next);
  };
  if (!settings) {
    return /* @__PURE__ */ jsx2("div", { children: /* @__PURE__ */ jsx2("div", { className: "wb-empty", children: err || "\u8BBE\u7F6E\u8F7D\u5165\u4E2D\u2026" }) });
  }
  const progressPct = stats && stats.scanning && stats.pending >= 0 ? Math.min(96, Math.max(4, 100 - stats.pending / Math.max(1, stats.pending + 40) * 100)) : 0;
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "wb-bar" }),
      "\u626B\u63CF\u72B6\u6001",
      /* @__PURE__ */ jsx2("button", { className: "wb-btn ghost sm", style: { marginLeft: "auto" }, disabled: busy, onClick: () => doReindex(false), children: "\u7ACB\u5373\u91CD\u626B" }),
      /* @__PURE__ */ jsx2("button", { className: "wb-btn danger sm", disabled: busy, onClick: () => setConfirmRebuild(true), children: "\u6E05\u7A7A\u91CD\u5EFA" })
    ] }),
    confirmRebuild && /* @__PURE__ */ jsxs2("div", { className: "wb-alert bad", children: [
      "\u6E05\u7A7A\u91CD\u5EFA\u5C06\u5220\u9664\u73B0\u6709\u7D22\u5F15\u5E76\u5168\u90E8\u91CD\u65B0\u63D0\u53D6\uFF08\u5927\u76EE\u5F55\u8981\u51E0\u5206\u949F\uFF09\u3002\u786E\u5B9A\uFF1F",
      /* @__PURE__ */ jsxs2("div", { style: { marginTop: 6, display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "wb-btn danger sm", disabled: busy, onClick: () => doReindex(true), children: "\u786E\u5B9A\uFF0C\u6E05\u7A7A\u91CD\u5EFA" }),
        /* @__PURE__ */ jsx2("button", { className: "wb-btn ghost sm", onClick: () => setConfirmRebuild(false), children: "\u53D6\u6D88" })
      ] })
    ] }),
    stats && stats.scanning && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsx2("div", { className: "wb-progress", children: /* @__PURE__ */ jsx2("i", { style: { width: `${progressPct}%` } }) }),
      /* @__PURE__ */ jsxs2("div", { className: "wb-sub", style: { padding: "0 18px 6px" }, children: [
        "\u626B\u63CF\u4E2D\uFF1A\u5F85\u5904\u7406 ",
        stats.pending,
        " \xB7 \u672C\u6B21\u5DF2\u63D0\u53D6 ",
        stats.byExt ? Object.entries(stats.byExt).reduce((a, [k, n]) => a + (k === "pdf" || k === "docx" ? 0 : 0) + n, 0) : 0,
        " \u6587\u6863"
      ] })
    ] }),
    stats && /* @__PURE__ */ jsx2("div", { className: "wb-card", children: /* @__PURE__ */ jsxs2("div", { className: "wb-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "wb-kv", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { children: stats.docs }),
          /* @__PURE__ */ jsx2("small", { children: "\u5DF2\u7D22\u5F15\u6587\u6863" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { children: stats.tokens.toLocaleString() }),
          /* @__PURE__ */ jsx2("small", { children: "\u8BCD\u9879" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { children: fmtBytes(stats.bytes) }),
          /* @__PURE__ */ jsx2("small", { children: "\u6E90\u6587\u4EF6\u4F53\u79EF" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { children: stats.lastScanMs ? (stats.lastScanMs / 1e3).toFixed(1) + "s" : "\u2014" }),
          /* @__PURE__ */ jsx2("small", { children: "\u4E0A\u6B21\u626B\u63CF\u8017\u65F6" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "wb-sub", style: { marginTop: 6 }, children: [
        stats.capped && /* @__PURE__ */ jsxs2("span", { style: { color: "#F2B263" }, children: [
          "\u5DF2\u8FBE\u6587\u6863\u4E0A\u9650 ",
          stats.maxDocs,
          "\uFF08\u53EF\u5728\u4E0B\u65B9\u8C03\u5927\uFF09\u3002"
        ] }),
        stats.degraded && /* @__PURE__ */ jsx2("span", { style: { color: "#F2B263" }, children: "\u5BBF\u4E3B\u6865\u6682\u4E0D\u53EF\u8FBE\uFF08\u641C\u7D22\u4E0D\u53D7\u5F71\u54CD\uFF09\u3002" }),
        Object.keys(stats.byExt).length > 0 && "\u6784\u6210\uFF1A" + Object.entries(stats.byExt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}\xD7${n}`).join(" \xB7 ")
      ] }),
      stats.errors && stats.errors.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "wb-sub", style: { color: "#F2B263", marginTop: 4 }, children: [
        "\u6700\u8FD1\u95EE\u9898\uFF1A",
        stats.errors.slice(-3).map((e) => `${e.path.split(/[\\/]/).pop()}\uFF08${e.reason}\uFF09`).join("\uFF1B")
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "wb-bar" }),
      "\u7D22\u5F15\u76EE\u5F55",
      /* @__PURE__ */ jsx2("span", { className: "wb-hint", children: "\u53EA\u6536\u5F55\u8FD9\u91CC\u5217\u51FA\u7684\u6587\u4EF6\u5939" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { padding: "0 18px 4px", display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "wb-inp",
          placeholder: "\u8F93\u5165\u6587\u4EF6\u5939\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\\\notes \u6216 C:\\\\Users\\\\\u4F60\\\\Documents",
          value: newRoot,
          onChange: (e) => setNewRoot(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") checkPath();
          }
        }
      ),
      /* @__PURE__ */ jsx2("button", { className: "wb-btn", disabled: busy || !newRoot.trim(), onClick: checkPath, children: "\u6DFB\u52A0" })
    ] }),
    probe && probe.suggestions.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "wb-chiprow", children: [
      /* @__PURE__ */ jsx2("span", { className: "wb-sub", children: "\u5E38\u7528\uFF1A" }),
      probe.suggestions.filter((s) => !settings.roots.some((r) => r.toLowerCase() === s.path.toLowerCase())).map((s) => /* @__PURE__ */ jsxs2("button", { className: "wb-chip", onClick: () => addRoot(s.path), children: [
        "+ ",
        s.label
      ] }, s.path))
    ] }),
    settings.roots.length === 0 && /* @__PURE__ */ jsxs2("div", { className: "wb-empty", children: [
      "\u8FD8\u6CA1\u6709\u6536\u5F55\u4EFB\u4F55\u6587\u4EF6\u5939\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u70B9\u4E0A\u9762\u8F93\u5165\u6846\u65C1\u300C\u6DFB\u52A0\u300D\u6821\u9A8C\u8DEF\u5F84\uFF0C\u6216\u4ECE\u300C\u5E38\u7528\u300D\u4E00\u952E\u52A0\u5165\u3002"
    ] }),
    settings.roots.map((r) => /* @__PURE__ */ jsx2("div", { className: "wb-item", style: { cursor: "default" }, children: /* @__PURE__ */ jsxs2("div", { className: "wb-item-head", children: [
      /* @__PURE__ */ jsx2("b", { style: { whiteSpace: "normal" }, children: r }),
      /* @__PURE__ */ jsx2("button", { className: "wb-btn ghost sm", onClick: () => removeRoot(r), children: "\u79FB\u9664" })
    ] }) }, r)),
    /* @__PURE__ */ jsxs2("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "wb-bar" }),
      "\u53C2\u6570"
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "wb-card", children: /* @__PURE__ */ jsxs2("div", { className: "wb-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "wb-row", children: [
        /* @__PURE__ */ jsxs2("div", { className: "grow", children: [
          /* @__PURE__ */ jsx2("span", { className: "wb-lbl", children: "\u6587\u6863\u4E0A\u9650\uFF08\u9632\u6B62\u5931\u63A7\uFF09" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "wb-inp",
              type: "number",
              min: 50,
              max: 2e4,
              value: settings.maxDocs,
              onChange: (e) => patch("maxDocs", parseInt(e.target.value, 10) || 5e3)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "grow", children: [
          /* @__PURE__ */ jsx2("span", { className: "wb-lbl", children: "\u5355\u6587\u4EF6\u4E0A\u9650 MB" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "wb-inp",
              type: "number",
              min: 1,
              max: 200,
              value: settings.maxFileMB,
              onChange: (e) => patch("maxFileMB", parseInt(e.target.value, 10) || 20)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "wb-lbl", children: "\u989D\u5916\u6392\u9664\u7684\u76EE\u5F55\u540D\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u4F5C\u7528\u4EFB\u610F\u5C42\u7EA7\uFF09" }),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "wb-inp",
          value: settings.extraExcludes.join(", "),
          placeholder: "\u5982\uFF1A\u9690\u79C1, \u5F52\u6863\u4E0D\u7528",
          onChange: (e) => patch("extraExcludes", e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean))
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "wb-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs2("label", { className: "wb-sub", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: settings.includeHidden, onChange: (e) => patch("includeHidden", e.target.checked) }),
          " \u6536\u5F55\u9690\u85CF\u76EE\u5F55\uFF08. \u5F00\u5934\uFF09"
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "wb-sub", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: settings.enabled, onChange: (e) => patch("enabled", e.target.checked) }),
          " \u542F\u7528\u81EA\u52A8\u626B\u63CF"
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { marginTop: 10, display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "wb-btn", disabled: busy, onClick: () => settings && persist(settings), children: "\u4FDD\u5B58\u53C2\u6570" }),
        /* @__PURE__ */ jsx2("span", { className: "wb-sub", style: { alignSelf: "center" }, children: "\u9ED8\u8BA4\u6392\u9664\uFF1Anode_modules / .git / target / dist / build / AppData \u7B49\u6784\u5EFA\u4E0E\u7CFB\u7EDF\u76EE\u5F55" })
      ] })
    ] }) }),
    msg && /* @__PURE__ */ jsx2("div", { className: "wb-ok", children: msg }),
    err && /* @__PURE__ */ jsx2("div", { className: "wb-alert bad", children: err }),
    /* @__PURE__ */ jsxs2("div", { className: "wb-alert warn", children: [
      /* @__PURE__ */ jsx2("b", { children: "\u9690\u79C1\u53E3\u5F84" }),
      "\uFF1A\u7D22\u5F15\u4E0E\u6B63\u6587\u53EA\u5B58\u672C\u673A\u6570\u636E\u6839\uFF08weibian-index/\uFF09\uFF0C\u5168\u7A0B\u96F6\u5916\u7F51\u8BF7\u6C42\uFF08\u672C\u63D2\u4EF6\u672A\u7533\u8BF7 network \u6743\u9650\uFF09\uFF1B \u670D\u52A1\u53EA\u8BFB\u4F60\u7684\u6587\u4EF6\u3001\u6C38\u4E0D\u4FEE\u6539\u6216\u5220\u9664\uFF1B\u300C\u8BFB\u53D6\u539F\u6587\u300D\u53EA\u5141\u8BB8\u7D22\u5F15\u76EE\u5F55\u5185\u7684\u8DEF\u5F84\u3002 \u624B\u673A\u7AEF\u68C0\u7D22\u8D70\u5C40\u57DF\u7F51\u76F4\u8FDE\uFF08token \u9274\u6743\uFF09\uFF0C\u4E0D\u7528\u516C\u7F51\u3002"
    ] })
  ] });
}

// src/GuideTab.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function GuideTab() {
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "wb-bar" }),
      "\u5B83\u89E3\u51B3\u4EC0\u4E48"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wb-card", children: /* @__PURE__ */ jsxs3("div", { className: "wb-card-b wb-sub", style: { fontSize: 12 }, children: [
      "\u628A\u6563\u843D\u5728\u672C\u5730\u6587\u4EF6\u5939\u91CC\u7684 md / txt / PDF / Word / \u7F51\u9875 / \u4EE3\u7801\u53D8\u6210\u4E00\u6761\u547D\u4EE4\u53EF\u641C\u3001AI \u53EF\u5F15\u7528\u7684\u5168\u6587\u7D22\u5F15\u3002 \u914D\u7F6E\u4E00\u6B21\u76EE\u5F55\uFF0C\u4E4B\u540E\u5168\u81EA\u52A8\uFF1A\u65B0\u6587\u4EF6\u8FDB\u6765\u81EA\u52A8\u6536\u5F55\u3001\u6539\u52A8\u81EA\u52A8\u8DDF\u8FDB\uFF0C",
      /* @__PURE__ */ jsx3("b", { children: "\u96F6\u65E5\u5E38\u5F55\u5165" }),
      "\u3002 \u624B\u673A\u6253\u5F00 Polaris \u4E5F\u80FD\u641C\u5BB6\u91CC\u7535\u8111\u7684\u6587\u6863\u3002"
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "wb-bar" }),
      "\u68C0\u7D22\u8BED\u6CD5"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wb-card", children: /* @__PURE__ */ jsxs3("div", { className: "wb-card-b", children: [
      /* @__PURE__ */ jsx3("div", { className: "wb-code", children: "\u7F13\u5B58 \u5047\u8C61" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-sub", children: "\u591A\u8BCD\u6309\u76F8\u5173\u6027\u6392\u5E8F\uFF08\u540C\u65F6\u542B\u4E24\u8BCD\u7684\u6392\u6700\u524D\uFF1B\u4E2D\u6587\u652F\u6301\u5355\u5B57\u4E0E\u8BCD\u7EC4\uFF09\u3002" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-code", children: "ext:pdf \u5E74\u5EA6 \u9884\u7B97" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-sub", children: "\u53EA\u641C PDF\u3002\u7C7B\u522B\u540D\uFF1Aext:text\uFF08\u6587\u6863\uFF09/ ext:code\uFF08\u4EE3\u7801\uFF09/ ext:docx / ext:html\uFF0C\u6216\u7CBE\u786E\u6269\u5C55\u540D ext:md\u3002" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-code", children: "dir:plans \u67B6\u6784" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-sub", children: "\u53EA\u641C\u8DEF\u5F84\u542B plans \u76EE\u5F55\u7684\u6587\u4EF6\uFF08dir:\u53EF\u5D4C\u591A\u5C42\uFF0C\u5982 dir:space/base\uFF09\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "wb-bar" }),
      "\u5728 AI \u5BF9\u8BDD\u91CC\u7528"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wb-card", children: /* @__PURE__ */ jsxs3("div", { className: "wb-card-b", children: [
      /* @__PURE__ */ jsx3("div", { className: "wb-sub", children: "\u6587\u6863\u68C0\u7D22\u7ED9 AI \u63D0\u4F9B\u4E86 4 \u4E2A\u5DE5\u5177\uFF0C\u76F4\u63A5\u7528\u81EA\u7136\u8BED\u8A00\u5373\u53EF\uFF1A" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-code", children: "\u300C\u5E2E\u6211\u5728\u6587\u6863\u91CC\u627E\u5173\u4E8E\u7F13\u5B58\u7B56\u7565\u7684\u8BBA\u8FF0\u300D" }),
      /* @__PURE__ */ jsx3("div", { className: "wb-code", children: "\u300C\u6211\u4E4B\u524D\u5199\u8FC7\u4E00\u4EFD\u4E24\u603B\u7EBF\u67B6\u6784\u7684 spec\uFF0C\u627E\u51FA\u6765\u770B\u770B\u300D" }),
      /* @__PURE__ */ jsxs3("div", { className: "wb-sub", children: [
        "AI \u4F1A\u5148 ",
        /* @__PURE__ */ jsx3("b", { children: "weibian_search" }),
        " \u68C0\u7D22\u62FF\u5230\u6587\u4EF6\u4E0E\u7247\u6BB5\uFF0C\u518D\u7528 ",
        /* @__PURE__ */ jsx3("b", { children: "weibian_read" }),
        " \u8BFB\u53D6\u539F\u6587\u4E0A\u4E0B\u6587\u3002 \u4E5F\u53EF\u8BA9 AI \u67E5 ",
        /* @__PURE__ */ jsx3("b", { children: "weibian_status" }),
        "\uFF08\u7D22\u5F15\u72B6\u6001\uFF09\u6216 ",
        /* @__PURE__ */ jsx3("b", { children: "weibian_reindex" }),
        "\uFF08\u91CD\u5EFA\uFF09\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "wb-bar" }),
      "\u6536\u5F55\u8303\u56F4\u4E0E\u683C\u5F0F"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wb-card", children: /* @__PURE__ */ jsxs3("div", { className: "wb-card-b wb-sub", style: { fontSize: 12 }, children: [
      /* @__PURE__ */ jsx3("b", { children: "\u6587\u672C" }),
      "\uFF1Amd / txt / csv / json / yaml / xml / srt / tex \u7B49",
      /* @__PURE__ */ jsx3("br", {}),
      /* @__PURE__ */ jsx3("b", { children: "\u4EE3\u7801" }),
      "\uFF1Ajs / ts / py / rs / go / java / c / cpp / sql / sh \u7B49 30+ \u79CD",
      /* @__PURE__ */ jsx3("br", {}),
      /* @__PURE__ */ jsx3("b", { children: "PDF" }),
      "\uFF1A\u63D0\u53D6\u6587\u5B57\u5C42\uFF08\u626B\u63CF\u4EF6\u65E0\u6587\u5B57\u5C42\uFF0C\u4F1A\u8DF3\u8FC7\u5E76\u8BA1\u6570\u2014\u2014\u4E0D\u505A OCR\uFF09",
      /* @__PURE__ */ jsx3("br", {}),
      /* @__PURE__ */ jsx3("b", { children: "Word" }),
      "\uFF1Adocx \u6B63\u6587\uFF08\u65E7\u7248 .doc \u4E0D\u652F\u6301\uFF09",
      /* @__PURE__ */ jsx3("br", {}),
      /* @__PURE__ */ jsx3("b", { children: "\u7F51\u9875" }),
      "\uFF1Ahtml / htm\uFF08\u5265\u79BB\u811A\u672C\u4E0E\u6837\u5F0F\u540E\u53D6\u6B63\u6587\uFF09",
      /* @__PURE__ */ jsx3("br", {}),
      "\u9ED8\u8BA4\u8DF3\u8FC7\u9690\u85CF\u76EE\u5F55\u4E0E node_modules / .git / target / dist / build / AppData \u7B49\uFF1B\u5355\u6587\u4EF6\u4E0A\u9650\u9ED8\u8BA4 20MB\uFF1B\u6587\u6863\u603B\u91CF\u9ED8\u8BA4\u4E0A\u9650 5000\u3002"
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "wb-bar" }),
      "\u5DF2\u77E5\u9650\u5236\uFF08\u5982\u5B9E\uFF09"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wb-card", children: /* @__PURE__ */ jsxs3("div", { className: "wb-card-b wb-sub", style: { fontSize: 12 }, children: [
      "\xB7 \u5355\u4E2A\u82F1\u6587\u5B57\u6BCD/\u6570\u5B57\uFF08\u5982\u300Ca\u300D\u300C5\u300D\uFF09\u4E0D\u53C2\u4E0E\u68C0\u7D22\uFF08\u8BCD\u5143 \u22652 \u8D77\uFF09",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u4E2D\u82F1\u6DF7\u6392\uFF08\u5982\u300CReact\u5165\u95E8\u300D\uFF09\u5728\u8BED\u8A00\u4EA4\u754C\u5904\u4E0D\u5EFA\u7ACB\u76F8\u90BB\u7D22\u5F15\uFF0C\u8DE8\u8BED\u68C0\u7D22\u8BF7\u5206\u5F00\u7ED9\u8BCD",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 Word \u516C\u5F0F\u3001\u8868\u683C\u4F1A\u6309\u7EBF\u6027\u6587\u672C\u5904\u7406\uFF0C\u590D\u6742\u6392\u7248\u53EF\u80FD\u4E22\u987A\u5E8F",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 OneDrive / \u7F51\u76D8\u5360\u4F4D\u6587\u4EF6\u5728\u626B\u63CF\u65F6\u4F1A\u89E6\u53D1\u6309\u9700\u4E0B\u8F7D\uFF08\u9650\u901F 25 \u6587\u4EF6/\u8F6E\uFF0C\u4ECB\u610F\u8BF7\u5148\u8BBE\u4E3A\u300C\u59CB\u7EC8\u4FDD\u7559\u5728\u6B64\u8BBE\u5907\u300D\uFF09",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u624B\u673A\u7AEF\u68C0\u7D22\u8981\u6C42\u624B\u673A\u4E0E\u7535\u8111\u5728\u540C\u4E00\u5C40\u57DF\u7F51\uFF0C\u4E14\u7535\u8111\u7AEF Polaris \u6B63\u5728\u8FD0\u884C"
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wb-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "wb-bar" }),
      "\u9690\u79C1\u4E0E\u5B89\u5168"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wb-card", children: /* @__PURE__ */ jsxs3("div", { className: "wb-card-b wb-sub", style: { fontSize: 12 }, children: [
      "\xB7 \u53EA\u7D22\u5F15\u4F60\u663E\u5F0F\u6DFB\u52A0\u7684\u76EE\u5F55\uFF1B\u670D\u52A1\u5BF9\u6587\u4EF6",
      /* @__PURE__ */ jsx3("b", { children: "\u53EA\u8BFB" }),
      "\uFF0C\u6C38\u4E0D\u4FEE\u6539/\u5220\u9664/\u79FB\u52A8",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u5168\u7A0B",
      /* @__PURE__ */ jsx3("b", { children: "\u96F6\u5916\u7F51\u8BF7\u6C42" }),
      "\uFF08\u672C\u63D2\u4EF6\u672A\u7533\u8BF7 network \u6743\u9650\uFF09\uFF1B\u7D22\u5F15\u660E\u6587\u5B58\u672C\u673A\u6570\u636E\u6839\uFF0C\u4E0E\u4F60\u7684\u6587\u4EF6\u540C\u7B49\u5B89\u5168\u8FB9\u754C",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u300C\u8BFB\u53D6\u539F\u6587\u300D\u4E25\u683C\u9650\u5236\u5728\u7D22\u5F15\u76EE\u5F55\u5185\uFF08\u9632\u76EE\u5F55\u7A7F\u8D8A\u4E0E\u7B26\u53F7\u94FE\u63A5\u9003\u9038\uFF09",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u670D\u52A1\u7AEF\u53E3\u4EC5\u76D1\u542C\u672C\u673A\u4E0E\u5C40\u57DF\u7F51\uFF0C\u6240\u6709\u4E1A\u52A1\u7AEF\u70B9\u5FC5\u987B\u643A\u5E26 token\uFF08\u81EA\u52A8\u4E0B\u53D1\u7ED9\u9762\u677F\u4E0E AI\uFF09"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.wb-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.wb-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wb-body{flex:1;overflow-y:auto;padding:0 0 24px}
.wb-body::-webkit-scrollbar{width:9px;height:9px}
.wb-body::-webkit-scrollbar-track{background:transparent}
.wb-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.wb-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.wb-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3E9BD6,#2A5FA8);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.wb-tt{flex:1;min-width:0}
.wb-tt b{font-size:15px;display:block}
.wb-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.wb-tabs{display:flex;gap:4px}
.wb-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.wb-tab:hover{color:#E6EAF2}
.wb-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.wb-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.wb-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3E9BD6,#2A5FA8);flex-shrink:0}
.wb-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.wb-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.wb-card-b{padding:11px 13px}
.wb-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.wb-btn{background:#3E9BD6;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.wb-btn:hover{filter:brightness(1.12)}
.wb-btn:disabled{opacity:.45;cursor:not-allowed}
.wb-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.wb-btn.danger{background:#7a2f38}
.wb-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.wb-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.wb-inp:focus{outline:none;border-color:#3E9BD6}
.wb-inp::placeholder{color:#4d5566}
.wb-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.wb-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.wb-chip:hover{border-color:#3a4356}
.wb-chip.on{background:#1f3550;border-color:#3E9BD6;color:#BBD9F2;font-weight:600}
.wb-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.wb-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px;cursor:pointer}
.wb-item:hover{border-color:#3E9BD6}
.wb-item-head{display:flex;align-items:center;gap:8px}
.wb-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.wb-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.wb-snip{margin-top:6px;font-size:12px;color:#C6CEDD;line-height:1.7;word-break:break-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wb-snip mark{background:#2a4a1f;color:#C4EE9A;border-radius:3px;padding:0 1px}
.wb-row{display:flex;gap:8px;align-items:center}
.wb-row .grow{flex:1;min-width:0}
.wb-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.wb-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.wb-alert.warn{background:rgba(232,145,45,.07);border-color:#5a3d1a;color:#F2B263}
.wb-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.wb-progress{height:5px;border-radius:3px;background:#1C2330;overflow:hidden;margin:0 18px 8px}
.wb-progress>i{display:block;height:100%;background:linear-gradient(90deg,#3E9BD6,#7CC4F0);border-radius:3px;transition:width .4s}
.wb-empty{margin:40px 24px;text-align:center;color:#5C6678;font-size:12px;line-height:1.9}
.wb-empty b{color:#8B95A7;display:block;font-size:13px;margin-bottom:6px}
.wb-drawer{position:fixed;inset:0;z-index:50;background:rgba(8,10,14,.72);display:flex;align-items:stretch;justify-content:flex-end}
.wb-drawer-p{width:min(680px,92vw);background:#12151C;border-left:1px solid #242C3A;display:flex;flex-direction:column}
.wb-drawer-h{padding:12px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #1C2330}
.wb-drawer-h b{flex:1;min-width:0;font-size:13px;word-break:break-all}
.wb-drawer-b{flex:1;overflow:auto;padding:14px 16px;white-space:pre-wrap;font:12px/1.75 Consolas,Menlo,monospace;color:#C6CEDD;word-break:break-all}
.wb-kv{display:flex;gap:14px;flex-wrap:wrap;padding:2px 0}
.wb-kv b{font-size:16px;color:#E6EAF2}
.wb-kv small{display:block;color:#5C6678;font-size:10px}
.wb-code{background:#0F1218;border:1px solid #242C3A;border-radius:8px;padding:8px 10px;font:11.5px/1.7 Consolas,Menlo,monospace;color:#9FB6CC;word-break:break-all;white-space:pre-wrap;margin:6px 0}
`;
function WeibianPanel(_props) {
  const [tab, setTab] = useState3("search");
  const [stats, setStats] = useState3(null);
  const [refreshTick, setRefreshTick] = useState3(0);
  const refreshStats = useCallback3(async () => {
    try {
      const s = await loadStats();
      setStats(s);
    } catch (_) {
    }
  }, []);
  useEffect3(() => {
    refreshStats();
  }, [refreshStats, refreshTick]);
  useEffect3(() => {
    if (!stats || !stats.scanning) return;
    const t = setInterval(refreshStats, 1500);
    return () => clearInterval(t);
  }, [stats, refreshStats]);
  const statusLine = stats ? stats.scanning ? `\u626B\u63CF\u4E2D\uFF1A\u5F85\u5904\u7406 ${stats.pending}` : `\u5DF2\u7D22\u5F15 ${stats.docs} \u6587\u6863 / ${stats.tokens} \u8BCD\u9879` : "\u670D\u52A1\u8FDE\u63A5\u4E2D\u2026";
  return /* @__PURE__ */ jsxs4("div", { className: "wb-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "wb-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "wb-logo", children: "\u{1F4D6}" }),
      /* @__PURE__ */ jsxs4("div", { className: "wb-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u6587\u6863\u68C0\u7D22" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          "\u672C\u5730\u6587\u6863\u5168\u6587\u68C0\u7D22 \xB7 ",
          statusLine
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "wb-tabs", children: [["search", "\u641C\u7D22"], ["index", "\u7D22\u5F15"], ["guide", "\u6307\u5357"]].map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: `wb-tab${tab === k ? " on" : ""}`, onClick: () => {
        setTab(k);
        setRefreshTick((x) => x + 1);
      }, children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "wb-body", children: [
      tab === "search" && /* @__PURE__ */ jsx4(SearchTab, { stats }),
      tab === "index" && /* @__PURE__ */ jsx4(IndexTab, { stats, onStats: setStats }),
      tab === "guide" && /* @__PURE__ */ jsx4(GuideTab, {})
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function WeibianEntry(props) {
  return /* @__PURE__ */ jsx5(WeibianPanel, { ...props });
}
export {
  WeibianEntry as default
};
