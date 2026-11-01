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
async function httpGetViaHost(url, timeoutMs = 3e4) {
  const r = await capDispatch("cap.http", {
    action: "request",
    method: "GET",
    url,
    timeoutMs
  });
  if (!r || typeof r.status !== "number") throw new Error("cap.http \u8FD4\u56DE\u5F02\u5E38");
  return r;
}
async function httpPostViaHost(url, body, timeoutMs = 15e3) {
  const r = await capDispatch("cap.http", {
    action: "request",
    method: "POST",
    url,
    timeoutMs,
    body: JSON.stringify(body ?? {}),
    bodyType: "json"
  });
  if (!r || typeof r.status !== "number") throw new Error("cap.http \u8FD4\u56DE\u5F02\u5E38");
  return r;
}

// src/api.ts
var MANIFEST_PORT = 9870;
var portCache = null;
var portForceRefresh = false;
async function resolvePort() {
  if (portCache && !portForceRefresh) return portCache;
  portForceRefresh = false;
  const meta = await kvGet("lls.meta");
  const p = meta && Number(meta.port) > 0 ? Number(meta.port) : MANIFEST_PORT;
  portCache = p;
  return p;
}
function invalidatePort() {
  portForceRefresh = true;
  portCache = null;
}
async function svcGet(pathname, params, timeoutMs = 3e4) {
  const port = await resolvePort();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== void 0 && v !== null && `${v}` !== "") qs.set(k, `${v}`);
  }
  const url = `http://127.0.0.1:${port}${pathname}${qs.toString() ? `?${qs}` : ""}`;
  const r = await httpGetViaHost(url, timeoutMs);
  if (r.status !== 200) {
    throw new Error(`\u65E5\u5FD7\u670D\u52A1 HTTP ${r.status}\uFF08\u7AEF\u53E3 ${port}\uFF09: ${r.body.slice(0, 200)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(r.body);
  } catch (_) {
    throw new Error(`\u65E5\u5FD7\u670D\u52A1\u8FD4\u56DE\u975E JSON: ${r.body.slice(0, 120)}`);
  }
  if (parsed.ok === false) throw new Error(parsed.error || "\u670D\u52A1\u8FD4\u56DE ok:false");
  return parsed;
}
async function svcGetWithRetry(pathname, params, timeoutMs = 3e4) {
  try {
    return await svcGet(pathname, params, timeoutMs);
  } catch (e) {
    const msg = String(e.message || "");
    if (/HTTP (5|4)/.test(msg) || /ECONNREFUSED|超时|失败/.test(msg)) {
      invalidatePort();
      return svcGet(pathname, params, timeoutMs);
    }
    throw e;
  }
}
async function svcPost(pathname, body, timeoutMs = 15e3) {
  const port = await resolvePort();
  const url = `http://127.0.0.1:${port}${pathname}`;
  const r = await httpPostViaHost(url, body, timeoutMs);
  if (r.status !== 200) throw new Error(`\u65E5\u5FD7\u670D\u52A1 HTTP ${r.status}: ${r.body.slice(0, 200)}`);
  const parsed = JSON.parse(r.body);
  if (parsed.ok === false) throw new Error(parsed.error || "\u670D\u52A1\u8FD4\u56DE ok:false");
  return parsed;
}
function filterParams(f) {
  return {
    levels: f.levels.length ? f.levels.join(",") : void 0,
    q: f.regexOn ? void 0 : f.q || void 0,
    regex: f.regexOn && f.q ? f.q : void 0
  };
}
var api = {
  sources: () => svcGetWithRetry("/api/sources", {}, 15e3),
  addSource: (path) => svcPost("/api/sources/add", { path }),
  removeSource: (path) => svcPost("/api/sources/remove", { path }),
  read: (file, offset, limit, f) => svcGetWithRetry("/api/read", { file, offset, limit, ...filterParams(f) }),
  tail: (file, maxLines, f) => svcGetWithRetry("/api/tail", { file, maxLines, ...filterParams(f) }, 6e4),
  readBack: (file, beforeOffset, maxLines, f) => svcGetWithRetry("/api/tail", { file, beforeOffset, maxLines, ...filterParams(f) }, 6e4),
  watch: (file, offset) => svcGetWithRetry("/api/watch", { file, offset }, 1e4),
  stats: (file) => svcGetWithRetry("/api/stats", { file }, 12e4),
  context: (file, offset, before, after) => svcGetWithRetry("/api/context", { file, offset, before, after }, 3e4)
};

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var ROW_H = 26;
var PAGE = 300;
var MAX_ENTRIES = 3e3;
var LEVEL_COLORS = {
  ERROR: "#f85149",
  FATAL: "#f85149",
  WARN: "#d29922",
  INFO: "#3fb950",
  DEBUG: "#58a6ff",
  TRACE: "#8b949e",
  CONT: "#6e7681"
};
function maskSensitive(text) {
  return String(text || "").replace(/\b(bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***").replace(/((?:token|key|secret|password|passwd|authorization|credential|apikey|api_key|access_token|refresh_token|signature|sig)["']?\s*[:=]\s*["']?)([^\s"',;&}]{8,})/gi, "$1***");
}
function fmtTs(ts) {
  if (!ts) return "\u2014";
  return new Date(ts).toISOString().slice(11, 23);
}
function fmtBytes(n) {
  if (!Number.isFinite(n)) return "?";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
function baseName(p) {
  return p.split(/[\\/]/).pop() || p;
}
var DEFAULT_FILTERS = { levels: [], q: "", regexOn: false };
function Panel({ pluginId }) {
  const [booting, setBooting] = useState(true);
  const [svcError, setSvcError] = useState("");
  const [port, setPort] = useState(null);
  const [files, setFiles] = useState([]);
  const [dataRoot, setDataRoot] = useState("");
  const [sources, setSources] = useState([]);
  const [file, setFile] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterDraft, setFilterDraft] = useState("");
  const [entries, setEntries] = useState([]);
  const [oldestOffset, setOldestOffset] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [bofReached, setBofReached] = useState(false);
  const [live, setLive] = useState(false);
  const [liveInterval, setLiveInterval] = useState(1500);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [selected, setSelected] = useState(null);
  const [contextMode, setContextMode] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [meta, setMeta] = useState({});
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(void 0);
  const listRef = useRef(null);
  const liveTimer = useRef(void 0);
  const stateRef = useRef({ file: "", bottomOffset: 0, filters: DEFAULT_FILTERS });
  stateRef.current = { file, bottomOffset, filters };
  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const applyWindow = useCallback((r, replace) => {
    setMeta({ format: r.format, encoding: r.encoding, fileSize: r.fileSize });
    setEntries((prev) => {
      const base = replace ? [] : prev;
      const seen = new Set(base.map((e) => e.offset));
      const merged = [...base, ...r.entries.filter((e) => !seen.has(e.offset))];
      merged.sort((a, b) => a.offset - b.offset);
      if (merged.length > MAX_ENTRIES) {
        const drop = merged.length - MAX_ENTRIES;
        merged.splice(0, drop);
        setBofReached(false);
      }
      setOldestOffset(merged.length ? merged[0].offset : 0);
      setBottomOffset(merged.length ? merged[merged.length - 1].endOffset : 0);
      return merged;
    });
    if (r.bofReached !== void 0) setBofReached(r.bofReached);
  }, []);
  const loadFile = useCallback(async (f, fl) => {
    if (!f) return;
    try {
      const r = await api.tail(f, PAGE, fl);
      setSvcError("");
      applyWindow({ ...r, entries: r.entries || [] }, true);
    } catch (e) {
      setSvcError(e.message);
    }
  }, [applyWindow]);
  const reloadSources = useCallback(async (prefer) => {
    try {
      const r = await api.sources();
      setFiles(r.files || []);
      setDataRoot(r.dataRoot || "");
      setSources(r.settings?.sources || []);
      if (r.settings?.liveIntervalMs) setLiveInterval(r.settings.liveIntervalMs);
      setPort(await resolvePort());
      setSvcError("");
      const ui = await kvGet("lls.ui");
      const next = prefer || ui?.lastFile || "";
      const exists = next && (r.files || []).some((f) => f.path === next);
      const finalFile = exists ? next : (r.files || [])[0]?.path || "";
      setFile((cur) => {
        const keep = cur && (r.files || []).some((f) => f.path === cur) ? cur : finalFile;
        if (keep !== cur) void loadFile(keep, filters);
        return keep;
      });
    } catch (e) {
      setSvcError(e.message);
    } finally {
      setBooting(false);
    }
  }, [filters, loadFile]);
  useEffect(() => {
    void reloadSources();
  }, [reloadSources]);
  const switchFile = useCallback((f) => {
    setFile(f);
    setSelected(null);
    setContextMode(false);
    setStats(null);
    void kvSet("lls.ui", { lastFile: f });
    void loadFile(f, filters);
  }, [filters, loadFile]);
  const applyFilters = useCallback(() => {
    const f = { levels: filters.levels, q: filterDraft.trim(), regexOn: filters.regexOn };
    setFilters(f);
    setContextMode(false);
    void loadFile(file, f);
  }, [file, filterDraft, filters, loadFile]);
  const clearFilters = useCallback(() => {
    setFilterDraft("");
    setFilters(DEFAULT_FILTERS);
    setContextMode(false);
    void loadFile(file, DEFAULT_FILTERS);
  }, [file, loadFile]);
  const loadOlder = useCallback(async () => {
    if (!file || loadingOlder || bofReached) return;
    setLoadingOlder(true);
    try {
      const r = await api.readBack(file, oldestOffset, PAGE, filters);
      applyWindow({ ...r, entries: r.entries || [] }, false);
    } catch (e) {
      showToast(`\u52A0\u8F7D\u66F4\u65E9\u5931\u8D25: ${e.message}`, "bad");
    } finally {
      setLoadingOlder(false);
    }
  }, [applyWindow, bofReached, file, filters, loadingOlder, oldestOffset, showToast]);
  useEffect(() => {
    window.clearInterval(liveTimer.current);
    if (!live || !file) return;
    liveTimer.current = window.setInterval(() => {
      const st = stateRef.current;
      void api.watch(st.file, st.bottomOffset).then((r) => {
        if (r.rotated) {
          void loadFile(st.file, st.filters);
          return;
        }
        if (r.grown && r.entries.length) {
          applyWindow({ entries: r.entries }, false);
          const el = listRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 6) {
            el.scrollTop = el.scrollHeight;
          }
        }
      }).catch(() => {
      });
    }, liveInterval);
    return () => window.clearInterval(liveTimer.current);
  }, [applyWindow, file, live, liveInterval, loadFile]);
  const showContext = useCallback(async (e) => {
    try {
      const r = await api.context(file, e.offset, 20, 20);
      applyWindow({ ...r, entries: r.entries || [] }, true);
      setBofReached(true);
      setContextMode(true);
      showToast("\u5DF2\u5207\u6362\u5230\u4E0A\u4E0B\u6587\u7A97\u53E3", "info");
    } catch (err) {
      showToast(`\u53D6\u4E0A\u4E0B\u6587\u5931\u8D25: ${err.message}`, "bad");
    }
  }, [applyWindow, file, showToast]);
  const loadStats = useCallback(async () => {
    if (stats || statsLoading || !file) return;
    setStatsLoading(true);
    try {
      setStats(await api.stats(file));
    } catch (e) {
      showToast(`\u7EDF\u8BA1\u5931\u8D25: ${e.message}`, "bad");
    } finally {
      setStatsLoading(false);
    }
  }, [file, stats, statsLoading, showToast]);
  const copyText = useCallback(async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label}\u5DF2\u590D\u5236`, "good");
    } catch (_) {
      showToast("\u590D\u5236\u5931\u8D25\uFF08\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF09", "bad");
    }
  }, [showToast]);
  const running = !svcError && port !== null;
  return /* @__PURE__ */ jsxs("div", { className: "log-lens-panel", style: { padding: 10, display: "flex", flexDirection: "column", height: "100%", gap: 8, color: "#d4d4d8", fontSize: 12 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u2630 \u65E5\u5FD7\u900F\u89C6\u53F0" }),
      /* @__PURE__ */ jsx("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? `\u670D\u52A1 :${port}` : "\u670D\u52A1\u79BB\u7EBF" }),
      /* @__PURE__ */ jsx(FilePicker, { files, value: file, onChange: switchFile }),
      /* @__PURE__ */ jsx("button", { onClick: () => {
        void reloadSources(file);
      }, style: btnSmall, children: "\u21BB \u5237\u65B0" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            setLive((v) => !v);
          },
          style: { ...btnSmall, borderColor: live ? "#3fb950" : "#3f3f46", color: live ? "#3fb950" : "#a1a1aa" },
          children: live ? "\u25C9 Live \u4E2D" : "\u25CE Live"
        }
      ),
      /* @__PURE__ */ jsx("button", { onClick: () => {
        void loadStats();
      }, style: btnSmall, children: "\u{1F4C8} \u900F\u89C6" }),
      /* @__PURE__ */ jsx("button", { onClick: () => setShowSettings(true), style: btnSmall, children: "\u2699 \u8BBE\u7F6E" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
      ["ERROR", "WARN", "INFO", "DEBUG"].map((lv) => {
        const on = filters.levels.includes(lv);
        return /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              const levels = on ? filters.levels.filter((x) => x !== lv) : [...filters.levels, lv];
              const f = { ...filters, levels };
              setFilters(f);
              setContextMode(false);
              void loadFile(file, f);
            },
            style: {
              ...btnSmall,
              color: on ? LEVEL_COLORS[lv] : "#71717a",
              borderColor: on ? LEVEL_COLORS[lv] : "#3f3f46",
              background: on ? "rgba(255,255,255,.04)" : "transparent"
            },
            children: lv
          },
          lv
        );
      }),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: filterDraft,
          onChange: (e) => setFilterDraft(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") applyFilters();
          },
          placeholder: filters.regexOn ? "\u6B63\u5219\u8868\u8FBE\u5F0F\uFF08\u56DE\u8F66\u5E94\u7528\uFF09" : "\u5173\u952E\u8BCD\uFF08\u56DE\u8F66\u5E94\u7528\uFF09",
          style: { flex: 1, minWidth: 160, background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, color: "#e4e4e7", padding: "5px 8px", fontSize: 12 }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            const f = { ...filters, regexOn: !filters.regexOn };
            setFilters(f);
            setContextMode(false);
            void loadFile(file, f);
          },
          style: { ...btnSmall, color: filters.regexOn ? "#58a6ff" : "#71717a", borderColor: filters.regexOn ? "#58a6ff" : "#3f3f46" },
          title: "\u628A\u5173\u952E\u8BCD\u6309\u6B63\u5219\u89E3\u91CA",
          children: ".*"
        }
      ),
      /* @__PURE__ */ jsx("button", { onClick: applyFilters, style: { ...btnSmall, color: "#93c5fd", borderColor: "#3b82f6" }, children: "\u5E94\u7528" }),
      /* @__PURE__ */ jsx("button", { onClick: clearFilters, style: btnSmall, children: "\u6E05\u9664" }),
      (filters.levels.length || filters.q) && /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#71717a" }, children: [
        "\u8FC7\u6EE4\u4E2D: ",
        [...filters.levels, filters.regexOn ? `/${filters.q}/` : filters.q].filter(Boolean).join(" \xB7 ")
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", fontSize: 10, color: "#71717a", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        entries.length,
        " \u6761",
        entries.length >= MAX_ENTRIES ? "\uFF08\u5185\u5B58\u7A97\u53E3\u5DF2\u5C01\u9876\uFF09" : ""
      ] }),
      meta.format && /* @__PURE__ */ jsxs("span", { children: [
        "\u683C\u5F0F ",
        meta.format,
        "/",
        meta.encoding
      ] }),
      meta.fileSize ? /* @__PURE__ */ jsxs("span", { children: [
        "\u6587\u4EF6 ",
        fmtBytes(meta.fileSize)
      ] }) : null,
      dataRoot && /* @__PURE__ */ jsx("span", { title: dataRoot, children: "\u6570\u636E\u6839 \u2713" }),
      contextMode && /* @__PURE__ */ jsx("span", { style: { color: "#d29922" }, children: "\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF08\u6539\u8FC7\u6EE4\u6216\u6E05\u9664\u6B64\u5904\u9000\u51FA\uFF09" }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      !bofReached && entries.length > 0 && /* @__PURE__ */ jsx("button", { onClick: () => {
        void loadOlder();
      }, disabled: loadingOlder, style: { ...btnSmall, opacity: loadingOlder ? 0.5 : 1 }, children: loadingOlder ? "\u52A0\u8F7D\u4E2D\u2026" : "\u2191 \u52A0\u8F7D\u66F4\u65E9" }),
      /* @__PURE__ */ jsx("button", { onClick: () => {
        void loadFile(file, filters);
        setContextMode(false);
      }, style: btnSmall, children: "\u2193 \u8DF3\u5230\u6700\u65B0" })
    ] }),
    svcError && /* @__PURE__ */ jsxs("div", { style: { padding: 10, borderRadius: 8, border: "1px solid rgba(248,81,73,.35)", background: "rgba(248,81,73,.08)", fontSize: 12, color: "#fca5a5" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { marginBottom: 4 }, children: [
        /* @__PURE__ */ jsx("b", { children: "\u65E0\u6CD5\u8FDE\u63A5\u65E5\u5FD7\u670D\u52A1" }),
        ": ",
        svcError
      ] }),
      /* @__PURE__ */ jsx("div", { style: { color: "#a1a1aa" }, children: "\u53EF\u80FD\u539F\u56E0\uFF1A\u2460 \u540E\u53F0\u670D\u52A1\u672A\u542F\u52A8 \u2192 \u53BB \u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192\u65E5\u5FD7\u900F\u89C6\u53F0 \u68C0\u67E5\uFF08autoStart \u5F00\u542F\u65F6\u968F\u5BBF\u4E3B\u81EA\u52A8\u62C9\u8D77\uFF09\uFF1B \u2461 \u5F53\u524D\u662F Web/\u624B\u673A\u7AEF \u2192 \u672C\u63D2\u4EF6\u8BFB\u53D6\u7684\u662F\u684C\u9762\u7AEF\u672C\u673A\u6587\u4EF6\uFF0C\u8BF7\u5728\u684C\u9762\u7AEF\u6253\u5F00\u9762\u677F\u3002" })
    ] }),
    /* @__PURE__ */ jsx(
      VirtualList,
      {
        entries,
        listRef,
        onSelect: (e) => setSelected(e),
        selected
      }
    ),
    selected && /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #3f3f46", paddingTop: 8, maxHeight: "38%", overflowY: "auto", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontWeight: 700, color: LEVEL_COLORS[selected.level || "CONT"] || "#a1a1aa" }, children: selected.level || "\u7EED\u884C" }),
        /* @__PURE__ */ jsxs("span", { style: { color: "#71717a", fontSize: 10 }, children: [
          fmtTs(selected.ts),
          " \xB7 offset=",
          selected.offset,
          " \xB7 ",
          selected.target || "\u2014"
        ] }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          void showContext(selected);
        }, style: btnSmall, children: "\u{1F50D} \u4E0A\u4E0B\u6587 \xB120" }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          void copyText(selected.message, "\u539F\u6587");
        }, style: btnSmall, children: "\u590D\u5236" }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          void copyText(maskSensitive(selected.message), "\u8131\u654F\u6587\u672C");
        }, style: btnSmall, children: "\u590D\u5236(\u8131\u654F)" }),
        /* @__PURE__ */ jsx("button", { onClick: () => setSelected(null), style: btnSmall, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsx("pre", { style: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: 8, fontSize: 11, lineHeight: 1.5, color: "#e4e4e7" }, children: selected.message })
    ] }),
    stats && /* @__PURE__ */ jsx(StatsDrawer, { stats, onClose: () => setStats(null), onJump: showContext }),
    showSettings && /* @__PURE__ */ jsx(
      SettingsModal,
      {
        sources,
        liveInterval,
        dataRoot,
        onClose: () => setShowSettings(false),
        onChanged: () => {
          void reloadSources(file);
        },
        showToast
      }
    ),
    toast && /* @__PURE__ */ jsx("div", { style: {
      position: "fixed",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      borderRadius: 8,
      fontSize: 12,
      zIndex: 40,
      background: toast.kind === "good" ? "rgba(63,185,80,.15)" : toast.kind === "bad" ? "rgba(248,81,73,.15)" : "rgba(88,166,255,.15)",
      color: toast.kind === "good" ? "#3fb950" : toast.kind === "bad" ? "#f85149" : "#58a6ff",
      border: "1px solid currentColor"
    }, children: toast.msg }),
    booting && /* @__PURE__ */ jsx("div", { style: { color: "#71717a" }, children: "\u8FDE\u63A5\u65E5\u5FD7\u670D\u52A1\u4E2D\u2026" })
  ] });
}
var btnSmall = {
  padding: "4px 10px",
  fontSize: 11,
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#a1a1aa",
  minHeight: 26
};
function FilePicker({ files, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState("");
  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return files.filter((f) => !k || f.path.toLowerCase().includes(k)).slice(0, 200);
  }, [files, kw]);
  return /* @__PURE__ */ jsxs("div", { style: { position: "relative", minWidth: 220, flex: 1, maxWidth: 420 }, children: [
    /* @__PURE__ */ jsxs("button", { onClick: () => setOpen((v) => !v), style: { ...btnSmall, width: "100%", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
      value ? `\u{1F4C4} ${baseName(value)}` : "\u9009\u62E9\u65E5\u5FD7\u6587\u4EF6\u2026",
      " \u25BE"
    ] }),
    open && /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      top: "100%",
      marginTop: 4,
      left: 0,
      right: 0,
      zIndex: 30,
      background: "#18181b",
      border: "1px solid #3f3f46",
      borderRadius: 8,
      maxHeight: 320,
      overflowY: "auto",
      padding: 6
    }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          autoFocus: true,
          value: kw,
          onChange: (e) => setKw(e.target.value),
          placeholder: "\u8FC7\u6EE4\u6587\u4EF6\u540D\u2026",
          style: { width: "100%", background: "#09090b", border: "1px solid #3f3f46", borderRadius: 6, color: "#e4e4e7", padding: "4px 8px", fontSize: 11, marginBottom: 6 }
        }
      ),
      filtered.length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "#71717a", padding: 6 }, children: "\u6CA1\u6709\u5339\u914D\u6587\u4EF6\uFF08\u8BD5\u8BD5\u300C\u8BBE\u7F6E\u300D\u91CC\u6DFB\u52A0\u76EE\u5F55\uFF09" }),
      filtered.map((f) => /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => {
            onChange(f.path);
            setOpen(false);
          },
          style: {
            padding: "5px 6px",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: f.path === value ? "rgba(59,130,246,.12)" : "transparent"
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.background = f.path === value ? "rgba(59,130,246,.12)" : "rgba(255,255,255,.05)";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.background = f.path === value ? "rgba(59,130,246,.12)" : "transparent";
          },
          children: [
            /* @__PURE__ */ jsx("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e4e4e7" }, title: f.path, children: f.path }),
            /* @__PURE__ */ jsx("span", { style: { color: "#71717a", fontSize: 10, flexShrink: 0 }, children: fmtBytes(f.size) }),
            /* @__PURE__ */ jsx("span", { style: { color: "#52525b", fontSize: 10, flexShrink: 0 }, children: f.source === "user" ? "\u81EA\u52A0" : "\u9ED8\u8BA4" })
          ]
        },
        f.path
      ))
    ] })
  ] });
}
function VirtualList({ entries, listRef, onSelect, selected }) {
  const [range, setRange] = useState({ start: 0, end: 50 });
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - 10);
    const count = Math.ceil(el.clientHeight / ROW_H) + 20;
    setRange({ start, end: start + count });
  }, [listRef]);
  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    onScroll();
  }, [entries.length === 0]);
  const visible = entries.slice(range.start, range.end);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: listRef,
      onScroll,
      style: { flex: 1, minHeight: 120, overflowY: "auto", border: "1px solid #27272a", borderRadius: 8, background: "#09090b", position: "relative" },
      children: [
        entries.length === 0 && /* @__PURE__ */ jsx("div", { style: { padding: 16, color: "#71717a" }, children: "\u6CA1\u6709\u65E5\u5FD7\u884C\uFF08\u6362\u6587\u4EF6 / \u6E05\u8FC7\u6EE4 / \u68C0\u67E5\u670D\u52A1\u72B6\u6001\uFF09\u3002" }),
        /* @__PURE__ */ jsx("div", { style: { height: entries.length * ROW_H, position: "relative" }, children: /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: range.start * ROW_H, left: 0, right: 0 }, children: visible.map((e) => {
          const isSel = selected && selected.offset === e.offset;
          const color = LEVEL_COLORS[e.level || "CONT"] || "#8b949e";
          return /* @__PURE__ */ jsxs(
            "div",
            {
              onClick: () => onSelect(e),
              style: {
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 8px",
                cursor: "pointer",
                borderBottom: "1px solid #18181b",
                background: isSel ? "rgba(59,130,246,.15)" : "transparent",
                fontFamily: "Consolas, Menlo, monospace",
                fontSize: 11
              },
              onMouseEnter: (ev) => {
                if (!isSel) ev.currentTarget.style.background = "rgba(255,255,255,.04)";
              },
              onMouseLeave: (ev) => {
                if (!isSel) ev.currentTarget.style.background = "transparent";
              },
              children: [
                /* @__PURE__ */ jsx("span", { style: { color: "#71717a", flexShrink: 0, width: 90 }, children: fmtTs(e.ts) }),
                /* @__PURE__ */ jsx("span", { style: { color, flexShrink: 0, width: 44, fontWeight: 600 }, children: e.level || "CONT" }),
                /* @__PURE__ */ jsx("span", { style: { color: "#a78bfa", flexShrink: 0, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.target }),
                /* @__PURE__ */ jsxs("span", { style: { color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
                  e.message.split("\n")[0],
                  e.message.includes("\n") && /* @__PURE__ */ jsxs("span", { style: { color: "#52525b" }, children: [
                    " \u2026(+",
                    e.message.split("\n").length - 1,
                    " \u884C)"
                  ] })
                ] })
              ]
            },
            e.offset
          );
        }) }) })
      ]
    }
  );
}
function StatsDrawer({ stats, onClose, onJump }) {
  const lv = stats.levels || {};
  const maxHourly = Math.max(1, ...(stats.hourly || []).map((h) => h.total));
  return /* @__PURE__ */ jsxs("div", { style: {
    borderTop: "1px solid #3f3f46",
    paddingTop: 8,
    maxHeight: "45%",
    overflowY: "auto",
    flexShrink: 0
  }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx("b", { style: { color: "#f4f4f5" }, children: "\u{1F4C8} \u900F\u89C6" }),
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#71717a" }, children: [
        stats.totalEntries,
        " \u6761 \xB7 ",
        stats.approximate ? "\u5927\u6587\u4EF6\u91C7\u6837\u8FD1\u4F3C \xB7 " : "",
        stats.distinctClusters,
        " \u7C7B\u95EE\u9898 \xB7 \u683C\u5F0F ",
        stats.format,
        "/",
        stats.encoding
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { onClick: onClose, style: btnSmall, children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }, children: Object.entries(lv).map(([k, v]) => /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: LEVEL_COLORS[k] || "#71717a", background: "rgba(255,255,255,.04)", padding: "2px 8px", borderRadius: 6 }, children: [
      k,
      " ",
      /* @__PURE__ */ jsx("b", { children: v })
    ] }, k)) }),
    stats.hourly && stats.hourly.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "flex-end", gap: 2, height: 48, marginBottom: 4, flexWrap: "wrap", overflowX: "auto" }, children: stats.hourly.map((h) => /* @__PURE__ */ jsx(
      "div",
      {
        title: `${new Date(h.hour).toISOString().slice(0, 13)}\u65F6: \u5171 ${h.total} / \u95EE\u9898 ${h.problems}`,
        style: {
          width: 10,
          height: `${Math.max(6, h.total / maxHourly * 100)}%`,
          background: h.problems > 0 ? "rgba(248,81,73,.6)" : "rgba(63,185,80,.4)",
          borderRadius: 2,
          flexShrink: 0,
          position: "relative"
        },
        children: h.problems > 0 && /* @__PURE__ */ jsx("div", { style: { position: "absolute", bottom: 0, left: 0, right: 0, height: `${h.problems / Math.max(h.total, 1) * 100}%`, background: "rgba(248,81,73,.95)", borderRadius: 2 } })
      },
      h.hour
    )) }),
    stats.clusters && stats.clusters.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: { color: "#71717a", fontSize: 10, margin: "6px 0 4px" }, children: "\u95EE\u9898\u805A\u7C7B\uFF08\u70B9\u51FB\u8DF3\u5230\u7B2C\u4E00\u5904\u73B0\u573A\uFF09:" }),
      stats.clusters.map((c, i) => /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => onJump({ offset: c.firstOffset, endOffset: c.firstOffset, ts: c.firstTs, level: c.level, target: "", message: c.sample }),
          style: { padding: "4px 6px", borderRadius: 6, cursor: "pointer", display: "flex", gap: 8, alignItems: "baseline" },
          onMouseEnter: (e) => {
            e.currentTarget.style.background = "rgba(255,255,255,.05)";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.background = "transparent";
          },
          children: [
            /* @__PURE__ */ jsxs("span", { style: { color: LEVEL_COLORS[c.level] || "#a1a1aa", flexShrink: 0, fontWeight: 700 }, children: [
              "\xD7",
              c.count
            ] }),
            /* @__PURE__ */ jsx("span", { style: { color: "#e4e4e7", fontFamily: "Consolas, Menlo, monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: c.sample.split("\n")[0] })
          ]
        },
        i
      ))
    ] }),
    (!stats.clusters || stats.clusters.length === 0) && /* @__PURE__ */ jsx("div", { style: { color: "#3fb950" }, children: "\u7A97\u53E3\u5185\u6CA1\u6709 WARN/ERROR/FATAL\u3002" })
  ] });
}
function SettingsModal({ sources, liveInterval, dataRoot, onClose, onChanged, showToast }) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!path.trim() || busy) return;
    setBusy(true);
    try {
      await api.addSource(path.trim());
      setPath("");
      showToast("\u6E90\u5DF2\u6DFB\u52A0", "good");
      onChanged();
    } catch (e) {
      showToast(`\u6DFB\u52A0\u5931\u8D25: ${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (p) => {
    try {
      await api.removeSource(p);
      showToast("\u6E90\u5DF2\u79FB\u9664", "good");
      onChanged();
    } catch (e) {
      showToast(`\u79FB\u9664\u5931\u8D25: ${e.message}`, "bad");
    }
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      onClick: onClose,
      style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" },
      children: /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, padding: 16, width: 520, maxWidth: "92%", maxHeight: "80%", overflowY: "auto" },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", marginBottom: 10 }, children: [
              /* @__PURE__ */ jsx("b", { style: { color: "#f4f4f5", fontSize: 14 }, children: "\u2699 \u65E5\u5FD7\u6E90\u4E0E\u53C2\u6570" }),
              /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
              /* @__PURE__ */ jsx("button", { onClick: onClose, style: btnSmall, children: "\u2715" })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { color: "#71717a", fontSize: 11, marginBottom: 10 }, children: [
              "\u9ED8\u8BA4\u6E90\uFF08\u81EA\u52A8\u53D1\u73B0\uFF0C\u65E0\u9700\u914D\u7F6E\uFF09\uFF1A\u6570\u636E\u6839 ",
              dataRoot || "\uFF08\u672A\u627E\u5230\uFF09",
              " \u4E0B\u7684 logs/ \u4E0E\u6563\u843D *.log\u3002"
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginBottom: 12 }, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  value: path,
                  onChange: (e) => setPath(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") void add();
                  },
                  placeholder: "\u6DFB\u52A0\u76EE\u5F55\u6216\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\space\\myapp\\logs",
                  style: { flex: 1, background: "#09090b", border: "1px solid #3f3f46", borderRadius: 6, color: "#e4e4e7", padding: "6px 8px", fontSize: 12 }
                }
              ),
              /* @__PURE__ */ jsx("button", { onClick: () => {
                void add();
              }, disabled: busy, style: { ...btnSmall, color: "#93c5fd", borderColor: "#3b82f6" }, children: busy ? "\u6DFB\u52A0\u4E2D\u2026" : "\u6DFB\u52A0" })
            ] }),
            sources.length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "#52525b", fontSize: 11, marginBottom: 8 }, children: "\u8FD8\u6CA1\u6709\u81EA\u52A0\u6E90\u3002" }),
            sources.map((s) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, background: "rgba(255,255,255,.03)", marginBottom: 4 }, children: [
              /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#71717a", flexShrink: 0 }, children: s.kind === "file" ? "\u6587\u4EF6" : "\u76EE\u5F55" }),
              /* @__PURE__ */ jsx("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }, title: s.path, children: s.path }),
              /* @__PURE__ */ jsx("button", { onClick: () => {
                void remove(s.path);
              }, style: btnSmall, children: "\u79FB\u9664" })
            ] }, s.path)),
            /* @__PURE__ */ jsxs("div", { style: { marginTop: 12, color: "#71717a", fontSize: 11 }, children: [
              "Live \u8F6E\u8BE2\u95F4\u9694\uFF1A",
              liveInterval,
              "ms\uFF08\u670D\u52A1\u8BFB\u53D6\u5373\u65F6\u7684\u6587\u4EF6\u589E\u91CF\uFF0C\u65E0\u9700\u4FDD\u5B58\uFF09\u3002 \u670D\u52A1\u7AEF\u53E3\u7531\u5BBF\u4E3B\u5206\u914D\u5E76\u5199\u5165 lls.meta\uFF1B\u5168\u7A0B\u53EA\u8BFB\u65E5\u5FD7\u6587\u4EF6\uFF0C\u4E0D\u4FEE\u6539\u4E0D\u5220\u9664\u3002"
            ] })
          ]
        }
      )
    }
  );
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function LogLensEntry(props) {
  return /* @__PURE__ */ jsx2(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  LogLensEntry as default
};
