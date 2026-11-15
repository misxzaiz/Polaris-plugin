var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var VERSION2 = "0.1.0";
    var SKIP_DIR_NAMES = /* @__PURE__ */ new Set([
      "node_modules",
      ".git",
      ".svn",
      ".hg",
      "dist",
      "build",
      "out",
      "target",
      "vendor",
      "coverage",
      ".next",
      ".nuxt",
      ".output",
      "__pycache__",
      "site-packages",
      ".venv",
      "venv",
      "env",
      ".idea",
      ".vscode",
      ".polaris",
      ".workbuddy",
      ".gradle",
      "Pods",
      "Carthage",
      ".terraform",
      ".cache"
    ]);
    var BINARY_EXT = /* @__PURE__ */ new Set([
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "ico",
      "bmp",
      "tiff",
      "svgz",
      "zip",
      "gz",
      "tgz",
      "bz2",
      "7z",
      "rar",
      "xz",
      "zst",
      "exe",
      "dll",
      "so",
      "dylib",
      "msi",
      "apk",
      "aab",
      "bin",
      "o",
      "obj",
      "a",
      "lib",
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "woff",
      "woff2",
      "ttf",
      "otf",
      "eot",
      "mp3",
      "mp4",
      "avi",
      "mov",
      "mkv",
      "wav",
      "flac",
      "ogg",
      "webm",
      "db",
      "sqlite",
      "sqlite3",
      "pdb",
      "wasm",
      "node",
      "pyd",
      "jar",
      "class",
      "pyc",
      "rlib",
      "deb",
      "rpm"
    ]);
    var SKIP_FILE_NAMES = /* @__PURE__ */ new Set([
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "cargo.lock",
      "go.sum",
      "poetry.lock",
      "pipfile.lock",
      "composer.lock",
      "gemfile.lock",
      "bun.lockb",
      "deno.lock"
    ]);
    var MINIFIED_RE = /([-.\s]min\.(js|mjs|cjs|css)|\.(bundle|chunk)\.[cm]?js)$/i;
    var EXT_LANG = {
      ts: "TypeScript",
      tsx: "TypeScript",
      mts: "TypeScript",
      cts: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      mjs: "JavaScript",
      cjs: "JavaScript",
      vue: "Vue",
      svelte: "Svelte",
      py: "Python",
      pyi: "Python",
      rb: "Ruby",
      rake: "Ruby",
      go: "Go",
      rs: "Rust",
      java: "Java",
      cs: "C#",
      php: "PHP",
      swift: "Swift",
      kt: "Kotlin",
      kts: "Kotlin",
      scala: "Scala",
      c: "C/C++",
      h: "C/C++",
      cpp: "C/C++",
      cc: "C/C++",
      cxx: "C/C++",
      hpp: "C/C++",
      hh: "C/C++",
      ino: "C/C++",
      sh: "Shell",
      bash: "Shell",
      ps1: "Shell",
      psm1: "Shell",
      zsh: "Shell",
      bat: "Shell",
      cmd: "Shell",
      lua: "Lua",
      dart: "Dart",
      r: "R",
      jl: "Julia",
      ex: "Elixir",
      exs: "Elixir",
      erl: "Erlang",
      hs: "Haskell",
      ml: "OCaml",
      fs: "F#",
      fsx: "F#",
      html: "HTML",
      htm: "HTML",
      css: "CSS",
      scss: "SCSS",
      sass: "Sass",
      less: "Less",
      json: "JSON",
      md: "Markdown",
      markdown: "Markdown",
      txt: "Text",
      yaml: "YAML",
      yml: "YAML",
      toml: "TOML",
      ini: "INI",
      cfg: "INI",
      xml: "XML",
      sql: "SQL",
      graphql: "GraphQL",
      gql: "GraphQL",
      proto: "Protobuf",
      csv: "CSV",
      svg: "SVG",
      astro: "Astro",
      prisma: "Prisma",
      sol: "Solidity",
      zig: "Zig",
      nim: "Nim",
      v: "Verilog",
      pl: "Perl",
      pm: "Perl",
      tcl: "Tcl"
    };
    var ROOT_FILES_BUCKET2 = "(\u6839\u6587\u4EF6)";
    var MAX_FILE_BYTES = 8 * 1024 * 1024;
    var SNIFF_BYTES = 4096;
    function extOf(p) {
      const base = String(p || "").split(/[\\/]/).pop();
      const dot = base.lastIndexOf(".");
      return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
    }
    function baseName(p) {
      return String(p || "").split(/[\\/]/).pop();
    }
    function isBinaryExt(p) {
      return BINARY_EXT.has(extOf(p));
    }
    function isSkipFileName(p) {
      const b = baseName(p).toLowerCase();
      return SKIP_FILE_NAMES.has(b) || MINIFIED_RE.test(b);
    }
    function isSkipDirName(name) {
      return SKIP_DIR_NAMES.has(String(name).toLowerCase());
    }
    function langOf(p) {
      const ext = extOf(p);
      if (EXT_LANG[ext]) return EXT_LANG[ext];
      return ext ? `.${ext}` : "(\u65E0\u6269\u5C55\u540D)";
    }
    function countLines(buf) {
      if (!buf || buf.length === 0) return 0;
      let n = 0;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 10) n++;
      }
      if (buf[buf.length - 1] !== 10) n++;
      return n;
    }
    function looksBinary(buf) {
      const end = Math.min(buf.length, SNIFF_BYTES);
      for (let i = 0; i < end; i++) {
        if (buf[i] === 0) return true;
      }
      return false;
    }
    function classifyFile(relPath, size) {
      if (isSkipFileName(relPath)) return "skipName";
      if (isBinaryExt(relPath)) return "binary";
      if (Number.isFinite(size) && size > MAX_FILE_BYTES) return "large";
      return "count";
    }
    function bucketOf(relPath, depth) {
      const parts = relPath.split("/");
      const d = Math.max(1, depth | 0);
      if (parts.length === 1) return ROOT_FILES_BUCKET2;
      const segs = parts.slice(0, Math.min(d, parts.length - 1));
      return segs.join("/") || ROOT_FILES_BUCKET2;
    }
    function emptyBucket() {
      return { files: 0, lines: 0, nonEmptyLines: 0, bytes: 0 };
    }
    function newStats() {
      return {
        root: "",
        scannedAt: 0,
        durationMs: 0,
        totals: { files: 0, lines: 0, nonEmptyLines: 0, bytes: 0 },
        modules: {},
        // bucket → {files, lines, nonEmptyLines, bytes}
        languages: {},
        // lang → {files, lines}
        skippedBinary: 0,
        // 二进制文件数
        skippedOther: 0,
        // 锁文件/压缩产物文件数
        skippedLarge: 0,
        // 超大文件数
        truncated: false,
        // 达到扫描上限被截断
        errors: []
        // 不可读文件/目录（cap 20）
      };
    }
    function addToBucket(stats, bucket, lines, nonEmpty, bytes) {
      if (!stats.modules[bucket]) stats.modules[bucket] = emptyBucket();
      const m = stats.modules[bucket];
      m.files += 1;
      m.lines += lines;
      m.nonEmptyLines += nonEmpty;
      m.bytes += bytes;
      stats.totals.files += 1;
      stats.totals.lines += lines;
      stats.totals.nonEmptyLines += nonEmpty;
      stats.totals.bytes += bytes;
    }
    function addLanguage(stats, lang, lines) {
      if (!stats.languages[lang]) stats.languages[lang] = { files: 0, lines: 0 };
      stats.languages[lang].files += 1;
      stats.languages[lang].lines += lines;
    }
    function recordFile(stats, relPath, buf) {
      const lines = countLines(buf);
      let nonEmpty = 0;
      let start = 0;
      for (let i = 0; i <= buf.length; i++) {
        if (i === buf.length || buf[i] === 10) {
          if (i > start) nonEmpty++;
          start = i + 1;
        }
      }
      addToBucket(stats, bucketOf(relPath, 1), lines, nonEmpty, buf.length);
      addLanguage(stats, langOf(relPath), lines);
    }
    function mergeFileBatch(stats, srcRoot, batch) {
      for (const item of batch) {
        const rel = relFromRoot(srcRoot, item.absPath || item.relPath, item.relPath != null);
        recordFile(stats, rel, item.buf);
      }
    }
    function relFromRoot(root, absPath, isRel) {
      if (isRel) return String(absPath).split("\\").join("/");
      const rp = path.relativeCompat(root, absPath);
      return rp.split("\\").join("/");
    }
    var path = {
      relativeCompat(from, to) {
        const norm = (p) => String(p).split(/[\\/]+/).filter(Boolean);
        const a = norm(from), b = norm(to);
        let i = 0;
        while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
        return b.slice(i).join("/");
      }
    };
    function moduleRows(stats) {
      return Object.entries(stats.modules || {}).map(([name, m]) => ({ name, ...m })).sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
    }
    function languageRows(stats, cap) {
      const n = cap == null ? 12 : cap;
      return Object.entries(stats.languages || {}).map(([name, m]) => ({ name, files: m.files, lines: m.lines })).sort((a, b) => b.lines - a.lines).slice(0, n);
    }
    function fmtCount2(n) {
      const v = Number(n) || 0;
      if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
      if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
      return String(v);
    }
    module.exports = {
      VERSION: VERSION2,
      SKIP_DIR_NAMES,
      BINARY_EXT,
      SKIP_FILE_NAMES,
      MINIFIED_RE,
      EXT_LANG,
      ROOT_FILES_BUCKET: ROOT_FILES_BUCKET2,
      MAX_FILE_BYTES,
      extOf,
      baseName,
      isBinaryExt,
      isSkipFileName,
      isSkipDirName,
      langOf,
      countLines,
      looksBinary,
      classifyFile,
      bucketOf,
      newStats,
      recordFile,
      mergeFileBatch,
      addToBucket,
      addLanguage,
      moduleRows,
      languageRows,
      fmtCount: fmtCount2
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res && res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r && r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function restartService(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}
function currentWorkspacePath() {
  const api2 = hostWindow().__POLARIS_WORKSPACE_API__;
  if (api2) {
    const id = api2.currentId();
    if (id) {
      const ws = api2.list().find((w) => w.id === id);
      if (ws?.path) return ws.path;
    }
  }
  const direct = hostWindow().__POLARIS_HOST_WORKSPACE__;
  return typeof direct === "string" && direct ? direct : null;
}
function onWorkspaceChanged(handler) {
  let last = currentWorkspacePath();
  handler(last);
  const api2 = hostWindow().__POLARIS_WORKSPACE_API__;
  if (!api2) return () => {
  };
  return api2.subscribe(() => {
    const next = currentWorkspacePath();
    if (next !== last) {
      last = next;
      handler(next);
    }
  });
}

// src/model.ts
var PLUGIN_ID = "loc-lens";
var SERVICE_ID = "loc-lens-server";
var META_KEY = "loclens.meta";
var SETTINGS_KEY = "loclens.settings";
var SvcError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
var metaCache = null;
function invalidateMeta() {
  metaCache = null;
}
async function readMeta() {
  if (metaCache) return metaCache;
  const m = await kvGet(META_KEY);
  if (m && typeof m.port === "number" && m.token) {
    metaCache = m;
    return m;
  }
  return null;
}
async function svc(method, path, body, timeoutMs = 12e4) {
  const meta = await readMeta();
  if (!meta) throw new SvcError("\u670D\u52A1\u672A\u6CE8\u518C\uFF1A\u540E\u53F0\u670D\u52A1\u5C1A\u672A\u62C9\u8D77\u6216 kv \u4E0D\u53EF\u8FBE\uFF08\u7A0D\u5019\u81EA\u52A8\u91CD\u8BD5\uFF09");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${meta.token}`
      },
      body: body != null ? JSON.stringify(body) : void 0,
      signal: ctrl.signal
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = null;
    }
    if (!res.ok) throw new SvcError(parsed && parsed.error || `HTTP ${res.status}`, res.status);
    return parsed;
  } catch (e) {
    if (e instanceof SvcError) throw e;
    if (e.name === "AbortError") throw new SvcError("\u8BF7\u6C42\u8D85\u65F6");
    throw new SvcError(`\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}
var api = {
  stats: (root) => svc(`GET`, `/api/stats?root=${encodeURIComponent(root)}`),
  rescan: (root) => svc(`POST`, `/api/rescan`, { root }, 18e4),
  settings: () => svc(`GET`, `/api/settings`)
};
async function loadSettings() {
  const s = await kvGet(SETTINGS_KEY);
  return s && typeof s === "object" ? s : {};
}
async function saveSettings(patch) {
  const cur = await loadSettings();
  await kvSet(SETTINGS_KEY, { ...cur, ...patch });
}

// src/coreBridge.ts
var core = require_core();
var fmtCount = core.fmtCount;
var VERSION = core.VERSION;

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var POLL_MS = 2e3;
var ROOT_FILES_BUCKET = "(\u6839\u6587\u4EF6)";
var STYLE = `
.ll-wrap{display:flex;flex-direction:column;height:100%;min-height:0;color:rgb(var(--c-text-primary));background:rgb(var(--c-bg-base));font-size:12px;overflow:hidden}
.ll-head{padding:10px 10px 6px;border-bottom:1px solid rgb(var(--c-border)/.08);display:flex;flex-direction:column;gap:6px}
.ll-title-row{display:flex;align-items:center;gap:6px}
.ll-title{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-badge{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid rgb(var(--c-border)/.2);color:rgb(var(--c-text-secondary));white-space:nowrap}
.ll-badge-live{color:rgb(34 197 94);border-color:rgb(34 197 94/.4)}
.ll-badge-scan{color:rgb(234 179 8);border-color:rgb(234 179 8/.4)}
.ll-badge-err{color:rgb(239 68 68);border-color:rgb(239 68 68/.4)}
.ll-path-row{display:flex;gap:4px;align-items:center}
.ll-inp{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;padding:4px 6px;border-radius:4px;border:1px solid rgb(var(--c-border)/.15);background:rgb(var(--c-bg-base));color:rgb(var(--c-text-primary));outline:none}
.ll-inp:focus{border-color:rgb(59 130 246/.6)}
.ll-btn{border:1px solid rgb(var(--c-border)/.2);background:rgb(var(--c-bg-soft,var(--c-bg-base)));color:rgb(var(--c-text-primary));border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;white-space:nowrap}
.ll-btn:hover{border-color:rgb(59 130 246/.5)}
.ll-btn:disabled{opacity:.5;cursor:default}
.ll-hint{font-size:10px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-body{flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:10px}
.ll-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ll-card{border:1px solid rgb(var(--c-border)/.1);border-radius:6px;padding:6px 8px;background:rgb(var(--c-bg-soft,transparent))}
.ll-card-num{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.ll-card-label{font-size:10px;color:rgb(var(--c-text-secondary));margin-top:1px}
.ll-sec-title{font-size:11px;font-weight:600;color:rgb(var(--c-text-secondary));margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.ll-bar-row{display:flex;flex-direction:column;gap:2px;padding:4px 0}
.ll-bar-row-click{cursor:pointer}
.ll-bar-row-click:hover .ll-bar-name{color:rgb(59 130 246)}
.ll-bar-top{display:flex;align-items:baseline;gap:6px}
.ll-bar-name{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-bar-files{font-size:10px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));white-space:nowrap}
.ll-bar-val{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.ll-bar-track{height:4px;border-radius:2px;background:rgb(var(--c-border)/.12);overflow:hidden}
.ll-bar-fill{height:100%;border-radius:2px;background:rgb(59 130 246/.75);min-width:2px}
.ll-chips{display:flex;flex-wrap:wrap;gap:4px}
.ll-chip{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid rgb(var(--c-border)/.15);color:rgb(var(--c-text-secondary));white-space:nowrap}
.ll-chip b{color:rgb(var(--c-text-primary));font-weight:600}
.ll-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));text-align:center;padding:20px}
.ll-err{font-size:11px;color:rgb(239 68 68);padding:6px 8px;border:1px solid rgb(239 68 68/.3);border-radius:4px;word-break:break-all}
.ll-foot{padding:4px 10px 8px;font-size:10px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));display:flex;justify-content:space-between;gap:8px}
`;
function basename(p) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + " MB";
  if (v >= 1024) return (v / 1024).toFixed(1) + " KB";
  return v + " B";
}
function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1e3));
  if (s < 5) return "\u521A\u521A";
  if (s < 60) return `${s} \u79D2\u524D`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} \u5206\u949F\u524D`;
  return `${Math.floor(m / 60)} \u5C0F\u65F6\u524D`;
}
function Panel() {
  const [source, setSource] = useState({ kind: "none" });
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState({});
  const [data, setData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  useEffect(() => {
    let cancelled = false;
    let manualMode = false;
    void loadSettings().then((s) => {
      if (cancelled) return;
      setSettings(s);
      if (s.manualRoot) {
        manualMode = true;
        setSource({ kind: "manual", path: s.manualRoot });
        setInput(s.manualRoot);
      }
    });
    const unsub = onWorkspaceChanged((wsPath) => {
      if (cancelled || manualMode) return;
      if (wsPath) {
        setSource({ kind: "workspace", path: wsPath });
      } else if (sourceRef.current.kind === "none") {
        setSource({ kind: "none" });
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  const root = source.kind === "none" ? "" : source.path;
  const refresh = useCallback(async (forceRescan) => {
    const cur = sourceRef.current;
    if (cur.kind === "none" || !cur.path) return;
    setBusy(true);
    try {
      const payload = forceRescan ? await api.rescan(cur.path) : await api.stats(cur.path);
      setData(payload);
      setScanning(!!payload.scanning);
      setError(null);
      if (forceRescan) invalidateMeta();
    } catch (e) {
      const msg = e.message || String(e);
      setError(msg);
      invalidateMeta();
      if (msg.includes("\u670D\u52A1\u672A\u6CE8\u518C")) {
        void restartService(PLUGIN_ID, SERVICE_ID).catch(() => {
        });
      }
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!root) {
      setData(null);
      setError(null);
      return;
    }
    void refresh(false);
    pollRef.current = window.setInterval(() => {
      void refresh(false);
    }, POLL_MS);
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [root, refresh]);
  const submitManual = useCallback(async () => {
    const p = input.trim();
    if (!p) return;
    const next = { ...settings, manualRoot: p, recentPaths: [p, ...(settings.recentPaths || []).filter((x) => x !== p)].slice(0, 8) };
    setSettings(next);
    void saveSettings(next).catch(() => {
    });
    setSource({ kind: "manual", path: p });
  }, [input, settings]);
  const followWorkspace = useCallback(() => {
    const ws = currentWorkspacePath();
    if (!ws) return;
    const next = { ...settings, manualRoot: "" };
    setSettings(next);
    void saveSettings(next).catch(() => {
    });
    setSource({ kind: "workspace", path: ws });
  }, [settings]);
  const stats = data?.stats;
  const maxLines = useMemo(() => (stats?.modules || []).reduce((m, r) => Math.max(m, r.lines), 0), [stats]);
  const totalLines = stats?.totals.lines || 0;
  const moduleName = useCallback((name) => name === ROOT_FILES_BUCKET ? "\uFF08\u6839\u6587\u4EF6\uFF09" : name, []);
  const barRows = stats?.modules || [];
  return /* @__PURE__ */ jsxs("div", { className: "ll-wrap", children: [
    /* @__PURE__ */ jsx("style", { children: STYLE }),
    /* @__PURE__ */ jsxs("div", { className: "ll-head", children: [
      /* @__PURE__ */ jsxs("div", { className: "ll-title-row", children: [
        /* @__PURE__ */ jsx("span", { className: "ll-title", children: "\u884C\u6570\u900F\u89C6\u53F0" }),
        error ? /* @__PURE__ */ jsx("span", { className: "ll-badge ll-badge-err", children: "\u670D\u52A1\u5F02\u5E38" }) : scanning ? /* @__PURE__ */ jsx("span", { className: "ll-badge ll-badge-scan", children: "\u626B\u63CF\u4E2D\u2026" }) : data ? /* @__PURE__ */ jsx("span", { className: "ll-badge ll-badge-live", children: data.live ? "\u5B9E\u65F6" : "\u5FEB\u7167" }) : null
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ll-path-row", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "ll-inp",
            value: input,
            placeholder: root || "\u8F93\u5165\u9879\u76EE\u6839\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u6216\u5207\u6362\u5230\u5F53\u524D\u9879\u76EE",
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") void submitManual();
            },
            list: "ll-recent-paths"
          }
        ),
        /* @__PURE__ */ jsx("datalist", { id: "ll-recent-paths", children: (settings.recentPaths || []).map((p) => /* @__PURE__ */ jsx("option", { value: p }, p)) }),
        /* @__PURE__ */ jsx("button", { className: "ll-btn", onClick: () => void submitManual(), disabled: !input.trim() || busy, children: "\u626B\u63CF" }),
        /* @__PURE__ */ jsx("button", { className: "ll-btn", onClick: followWorkspace, disabled: !currentWorkspacePath(), title: "\u56DE\u5230\u5F53\u524D\u9879\u76EE", children: "\u5F53\u524D\u9879\u76EE" }),
        /* @__PURE__ */ jsx("button", { className: "ll-btn", onClick: () => void refresh(true), disabled: !root || busy, children: "\u5237\u65B0" })
      ] }),
      root ? /* @__PURE__ */ jsxs("div", { className: "ll-hint", title: root, children: [
        "\u9879\u76EE\uFF1A",
        basename(root),
        " \xB7 ",
        root
      ] }) : null
    ] }),
    !root ? /* @__PURE__ */ jsxs("div", { className: "ll-empty", children: [
      /* @__PURE__ */ jsx("div", { children: "\u5C1A\u672A\u9009\u62E9\u9879\u76EE" }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 11 }, children: [
        "\u70B9\u51FB\u300C\u5F53\u524D\u9879\u76EE\u300D\u81EA\u52A8\u7EDF\u8BA1\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C",
        /* @__PURE__ */ jsx("br", {}),
        "\u6216\u8F93\u5165\u9879\u76EE\u6839\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\u540E\u6309\u56DE\u8F66\u3002"
      ] })
    ] }) : error ? /* @__PURE__ */ jsx("div", { className: "ll-body", children: /* @__PURE__ */ jsx("div", { className: "ll-err", children: error }) }) : !stats ? /* @__PURE__ */ jsx("div", { className: "ll-empty", children: /* @__PURE__ */ jsx("div", { children: scanning ? "\u6B63\u5728\u626B\u63CF\u2026" : "\u52A0\u8F7D\u4E2D\u2026" }) }) : /* @__PURE__ */ jsxs("div", { className: "ll-body", children: [
      stats.truncated ? /* @__PURE__ */ jsx("div", { className: "ll-err", children: "\u6587\u4EF6\u6570\u6216\u5185\u5BB9\u91CF\u8D85\u51FA\u4E0A\u9650\uFF0C\u7ED3\u679C\u5DF2\u622A\u65AD\uFF08\u4EC5\u7EDF\u8BA1\u90E8\u5206\uFF09\u3002" }) : null,
      /* @__PURE__ */ jsxs("div", { className: "ll-cards", children: [
        /* @__PURE__ */ jsxs("div", { className: "ll-card", children: [
          /* @__PURE__ */ jsx("div", { className: "ll-card-num", children: fmtCount(totalLines) }),
          /* @__PURE__ */ jsx("div", { className: "ll-card-label", children: "\u603B\u884C\u6570" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ll-card", children: [
          /* @__PURE__ */ jsx("div", { className: "ll-card-num", children: fmtCount(stats.totals.files) }),
          /* @__PURE__ */ jsx("div", { className: "ll-card-label", children: "\u6587\u672C\u6587\u4EF6" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ll-card", children: [
          /* @__PURE__ */ jsx("div", { className: "ll-card-num", children: fmtCount(stats.totals.nonEmptyLines) }),
          /* @__PURE__ */ jsx("div", { className: "ll-card-label", children: "\u975E\u7A7A\u884C" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "ll-sec-title", children: [
          /* @__PURE__ */ jsx("span", { children: "\u6A21\u5757\u884C\u6570" }),
          /* @__PURE__ */ jsxs("span", { children: [
            barRows.length,
            " \u4E2A\u76EE\u5F55"
          ] })
        ] }),
        barRows.map((m) => /* @__PURE__ */ jsxs("div", { className: "ll-bar-row ll-bar-row-click", title: `${moduleName(m.name)}\uFF1A${m.lines} \u884C / ${m.files} \u6587\u4EF6 / ${fmtBytes(m.bytes)}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "ll-bar-top", children: [
            /* @__PURE__ */ jsx("span", { className: "ll-bar-name", children: moduleName(m.name) }),
            /* @__PURE__ */ jsxs("span", { className: "ll-bar-files", children: [
              m.files,
              " \u6587\u4EF6"
            ] }),
            /* @__PURE__ */ jsx("span", { className: "ll-bar-val", children: fmtCount(m.lines) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "ll-bar-track", children: /* @__PURE__ */ jsx("div", { className: "ll-bar-fill", style: { width: `${maxLines > 0 ? Math.max(2, Math.round(m.lines / maxLines * 100)) : 2}%` } }) })
        ] }, m.name)),
        barRows.length === 0 ? /* @__PURE__ */ jsx("div", { className: "ll-hint", children: "\u6CA1\u6709\u53EF\u7EDF\u8BA1\u7684\u6587\u672C\u6587\u4EF6\uFF08\u5168\u662F\u5FFD\u7565\u76EE\u5F55/\u4E8C\u8FDB\u5236\uFF1F\uFF09" }) : null
      ] }),
      (stats.languages || []).length > 0 ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "ll-sec-title", children: [
          /* @__PURE__ */ jsx("span", { children: "\u8BED\u8A00\u5206\u5E03" }),
          /* @__PURE__ */ jsxs("span", { children: [
            "Top ",
            stats.languages.length
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "ll-chips", children: stats.languages.map((l) => /* @__PURE__ */ jsxs("span", { className: "ll-chip", children: [
          l.name,
          " ",
          /* @__PURE__ */ jsx("b", { children: fmtCount(l.lines) })
        ] }, l.name)) })
      ] }) : null
    ] }),
    root && stats ? /* @__PURE__ */ jsxs("div", { className: "ll-foot", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        timeAgo(stats.scannedAt),
        "\u66F4\u65B0 \xB7 \u5168\u91CF ",
        stats.durationMs,
        "ms"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        data?.live ? "\u76D1\u542C\u4E2D" : "\u672A\u76D1\u542C",
        stats.skippedBinary ? ` \xB7 \u8DF3\u8FC7\u4E8C\u8FDB\u5236 ${stats.skippedBinary}` : ""
      ] })
    ] }) : null
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
