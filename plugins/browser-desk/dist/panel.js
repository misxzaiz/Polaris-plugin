// src/Panel.tsx
import { useCallback, useEffect, useRef, useState } from "react";

// src/bridge.ts
function globals() {
  return window;
}
function getHostInvoke() {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__");
  return fn;
}
async function callService(action, params = {}) {
  const invoke = getHostInvoke();
  const res = await invoke(
    "router_dispatch",
    {
      req: {
        target: "cap.pluginServiceManager",
        payload: {
          action: "request",
          serviceId: "browser-desk-service",
          path: "/dispatch",
          body: { action, ...params }
        }
      }
    }
  );
  if (!res.ok) throw new Error(res.error || "\u5BBF\u4E3B\u8F6C\u53D1\u5931\u8D25");
  const inner = res.result;
  if (!inner) throw new Error("\u670D\u52A1\u65E0\u54CD\u5E94");
  if (!inner.ok) throw new Error(inner.error || "\u670D\u52A1\u8C03\u7528\u5931\u8D25");
  return inner.result ?? {};
}
async function getStatus() {
  return callService("status");
}
async function search(query, engine, limit) {
  return callService("search", { query, engine, limit });
}
async function openUrl(url, newWindow) {
  return callService("acquire", { url, mode: "create", newWindow: !!newWindow });
}
async function activateTab(tabId) {
  return callService("acquire", { tabId, mode: "reuse" });
}
async function closeTab(tabId) {
  return callService("close", { tabId });
}
function subscribeTheme(listener) {
  const api = globals().__POLARIS_THEME_API__;
  if (!api) return () => {
  };
  return api.subscribe(() => listener(api.activeId()));
}
function activeTheme() {
  const api = globals().__POLARIS_THEME_API__;
  return api ? api.activeId() : "default";
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var logSeq = 0;
function Panel() {
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [theme, setTheme] = useState(activeTheme());
  const mountedRef = useRef(true);
  const addLog = useCallback((text) => {
    logSeq += 1;
    setLogs((prev) => [...prev.slice(-40), { ts: Date.now(), text }]);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const st = await getStatus();
      if (!mountedRef.current) return;
      setStatus(st);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const timer = setInterval(refresh, 3e3);
    const unTheme = subscribeTheme(setTheme);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      unTheme();
    };
  }, [refresh]);
  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    addLog(`search: ${q}`);
    try {
      const r = await search(q, void 0, 8);
      if (!mountedRef.current) return;
      setResults(r);
      addLog(`search \u2192 ${r.results.length} \u6761\u7ED3\u679C`);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [query, busy, addLog, refresh]);
  const doOpen = useCallback(async (url, newWindow = false) => {
    setBusy(true);
    addLog(`open: ${url.slice(0, 60)}${newWindow ? " (\u65B0\u7A97\u53E3)" : ""}`);
    try {
      await openUrl(url, newWindow);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [addLog, refresh]);
  const doActivate = useCallback(async (tabId) => {
    try {
      await activateTab(tabId);
      addLog(`activate tab ${tabId.slice(0, 8)}`);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [addLog, refresh]);
  const doClose = useCallback(async (tabId) => {
    try {
      await closeTab(tabId);
      addLog(`close tab ${tabId.slice(0, 8)}`);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [addLog, refresh]);
  const engine = status?.engine ?? "stopped";
  const chromeMissing = engine === "stopped" && !!error && /Chrome|Edge|puppeteer/i.test(error);
  return /* @__PURE__ */ jsxs("div", { className: "bd-root", "data-theme": theme, children: [
    /* @__PURE__ */ jsxs("div", { className: "bd-header", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "bd-search",
          placeholder: "\u641C\u7D22\u7F51\u9875\u6216\u8F93\u5165 URL\uFF0C\u56DE\u8F66\u6267\u884C",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") void doSearch();
          },
          disabled: busy
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "bd-action", onClick: () => void doSearch(), disabled: busy || !query.trim(), children: "\u641C\u7D22" }),
      /* @__PURE__ */ jsxs("span", { className: "bd-badge", title: status?.chromePath || error || "", children: [
        /* @__PURE__ */ jsx("span", { className: `bd-dot bd-dot-${engine}` }),
        /* @__PURE__ */ jsx("span", { className: "bd-badge-text", children: engine === "ready" ? `\u5F15\u64CE ${status?.tabs.length ?? 0} \u6807\u7B7E` : engine === "starting" ? "\u542F\u52A8\u4E2D" : "\u672A\u8FD0\u884C" })
      ] })
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "bd-guide", children: chromeMissing ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "\u6D4F\u89C8\u5668\u5F15\u64CE\u4E0D\u53EF\u7528\uFF1A",
      error,
      /* @__PURE__ */ jsx("br", {}),
      "\u8BF7\u5B89\u88C5 Chrome/Edge\uFF0C\u6216\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF ",
      /* @__PURE__ */ jsx("code", { children: "BROWSER_DESK_CHROME" }),
      " \u6307\u5411 chrome.exe\u3002"
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      "\u670D\u52A1\u5F02\u5E38\uFF1A",
      error,
      /* @__PURE__ */ jsx("br", {}),
      "\u53EF\u5C1D\u8BD5\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u91CD\u542F browser-desk-service\u3002"
    ] }) }),
    results && results.results.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "bd-section", children: [
        "\u641C\u7D22\u7ED3\u679C \xB7 ",
        results.engine,
        /* @__PURE__ */ jsx("span", { className: "bd-section-spacer" }),
        /* @__PURE__ */ jsx("button", { className: "bd-action", onClick: () => setResults(null), children: "\u6536\u8D77" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "bd-results", children: results.results.map((r, i) => /* @__PURE__ */ jsxs(
        "a",
        {
          className: "bd-result",
          onClick: (e) => {
            e.preventDefault();
            void doOpen(r.url);
          },
          href: r.url,
          title: r.url,
          children: [
            /* @__PURE__ */ jsx("div", { className: "bd-result-title", children: r.title || "(\u65E0\u6807\u9898)" }),
            /* @__PURE__ */ jsx("div", { className: "bd-result-url", children: r.url }),
            r.snippet && /* @__PURE__ */ jsx("div", { className: "bd-result-snippet", children: r.snippet })
          ]
        },
        `${i}-${r.url}`
      )) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bd-section", children: [
      "\u6807\u7B7E",
      /* @__PURE__ */ jsx("span", { className: "bd-section-spacer" }),
      /* @__PURE__ */ jsx("button", { className: "bd-action", onClick: () => void doOpen("https://www.bing.com", true), disabled: busy, children: "+ \u65B0\u7A97\u53E3" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bd-tabs", children: [
      (status?.tabs ?? []).map((t) => /* @__PURE__ */ jsxs("div", { className: "bd-tab", onClick: () => void doActivate(t.tabId), children: [
        /* @__PURE__ */ jsxs("div", { className: "bd-tab-main", children: [
          /* @__PURE__ */ jsx("span", { className: "bd-tab-title", children: t.title || "(\u65E0\u6807\u9898)" }),
          /* @__PURE__ */ jsx("span", { className: "bd-tab-url", children: t.url })
        ] }),
        t.agentKey && /* @__PURE__ */ jsx("span", { className: "bd-tab-agent", title: `\u7ED1\u5B9A\u4F1A\u8BDD ${t.agentKey}`, children: t.agentKey }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "bd-tab-close",
            title: "\u5173\u95ED\u6807\u7B7E",
            onClick: (e) => {
              e.stopPropagation();
              void doClose(t.tabId);
            },
            children: "\u2715"
          }
        )
      ] }, t.tabId)),
      status && status.tabs.length === 0 && /* @__PURE__ */ jsxs("div", { className: "bd-empty", children: [
        /* @__PURE__ */ jsx("span", { children: "\u6682\u65E0\u6253\u5F00\u7684\u6807\u7B7E" }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11 }, children: "\u5728\u641C\u7D22\u6846\u8F93\u5165\u5185\u5BB9\uFF0C\u6216\u8BA9 AI \u7ECF desk_* \u5DE5\u5177\u6253\u5F00\u7F51\u9875" })
      ] }),
      !status && !error && /* @__PURE__ */ jsxs("div", { className: "bd-empty", children: [
        /* @__PURE__ */ jsx("span", { className: "bd-spin" }),
        /* @__PURE__ */ jsx("span", { children: "\u8FDE\u63A5\u670D\u52A1\u4E2D\u2026" })
      ] })
    ] }),
    logs.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "bd-section", children: [
        "AI / \u9762\u677F\u64CD\u4F5C\u65E5\u5FD7",
        /* @__PURE__ */ jsx("span", { className: "bd-section-spacer" }),
        /* @__PURE__ */ jsx("button", { className: "bd-action", onClick: () => setLogs([]), children: "\u6E05\u7A7A" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "bd-log", children: logs.map((l, i) => /* @__PURE__ */ jsxs("div", { className: "bd-log-line", children: [
        /* @__PURE__ */ jsx("b", { children: new Date(l.ts).toLocaleTimeString() }),
        " ",
        l.text
      ] }, `${l.ts}-${i}`)) })
    ] })
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
