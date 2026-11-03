// src/Panel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// src/host.ts
var SERVICE_PORT = 9875;
var SERVICE_BASE = `http://127.0.0.1:${SERVICE_PORT}`;
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
async function api(method, path, body, timeoutMs = 12e4) {
  const payload = {
    action: "request",
    method,
    url: `${SERVICE_BASE}${path}`,
    timeoutMs
  };
  if (body !== void 0) {
    payload.body = JSON.stringify(body);
    payload.bodyType = "json";
  }
  const r = await capDispatch("cap.http", payload);
  let parsed = null;
  try {
    parsed = JSON.parse(r.body);
  } catch (_) {
  }
  const obj = parsed && typeof parsed === "object" ? parsed : {};
  if (r.status >= 400 || obj.ok === false) {
    throw new Error(String(obj.error || `\u670D\u52A1 HTTP ${r.status}`));
  }
  if (!parsed) throw new Error(`\u670D\u52A1\u54CD\u5E94\u4E0D\u53EF\u89E3\u6790\uFF1A${String(r.body).slice(0, 200)}`);
  return parsed;
}

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var LS = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(`dq.${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(`dq.${key}`, JSON.stringify(value));
    } catch (_) {
    }
  }
};
function fmtSize(bytes) {
  if (!bytes) return "0KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(2)}GB`;
}
function cellText(v) {
  if (v === null || v === void 0) return "NULL";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  }
  return String(v);
}
function resultToMarkdown(r, maxRows = 40) {
  const lines = [`| ${r.columns.join(" | ")} |`, `|${r.columns.map(() => " --- ").join("|")}|`];
  for (const row of r.rows.slice(0, maxRows)) {
    lines.push(`| ${r.columns.map((c) => cellText(row[c])).join(" | ")} |`);
  }
  if (r.rows.length > maxRows) lines.push(`\u2026\uFF08\u5171 ${r.rowCount} \u884C\uFF09`);
  return lines.join("\n");
}
function defaultExportPath(home, format) {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const base = home ? `${home.replace(/[\\/]+$/, "")}\\Downloads\\dq-${stamp}.${format}` : `D:\\dq-${stamp}.${format}`;
  return base;
}
function Panel({ onSendToChat }) {
  const [status, setStatus] = useState(null);
  const [tables, setTables] = useState([]);
  const [selTable, setSelTable] = useState("");
  const [preview, setPreview] = useState(null);
  const [schemaInfo, setSchemaInfo] = useState(null);
  const [sql, setSql] = useState(() => LS.get("lastSql", ""));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importTable, setImportTable] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [showSchema, setShowSchema] = useState(true);
  const statusTimer = useRef(null);
  const engine = status?.engine;
  const ready = engine?.engine === "ready";
  const refreshTables = useCallback(async (selectFirst = false) => {
    try {
      const r = await api("GET", "/tables");
      setTables(r.tables);
      setSelTable((cur) => {
        if (cur && r.tables.some((t) => t.table === cur)) return cur;
        return selectFirst && r.tables.length ? r.tables[r.tables.length - 1].table : "";
      });
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const refreshStatus = useCallback(async () => {
    try {
      const s = await api("GET", "/status", void 0, 1e4);
      setStatus(s);
      if (s.engine.engine === "ready") {
        await refreshTables();
      }
      return s;
    } catch (e) {
      setError(`\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF08${SERVICE_BASE}\uFF09\uFF1A${e.message}`);
      return null;
    }
  }, [refreshTables]);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const s = await refreshStatus();
      if (!cancelled && s && s.engine.engine !== "ready") {
        statusTimer.current = window.setTimeout(tick, 2500);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
    };
  }, []);
  const selectTable = useCallback(async (name) => {
    setSelTable(name);
    setPreview(null);
    setSchemaInfo(null);
    if (!name) return;
    try {
      const [pv, sc] = await Promise.all([
        api("GET", `/preview?table=${encodeURIComponent(name)}&n=10`),
        api("GET", `/schema?table=${encodeURIComponent(name)}`)
      ]);
      setPreview(pv);
      setSchemaInfo(sc);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const runQuery = useCallback(async () => {
    const text = sql.trim();
    if (!text) {
      setError("\u5148\u5199\u4E00\u6761 SQL");
      return;
    }
    setBusy("\u67E5\u8BE2\u4E2D\u2026");
    setError("");
    setNotice("");
    try {
      const r = await api("POST", "/query", { sql: text, maxRows: 500 }, 6e5);
      setResult(r);
      const hist = LS.get("history", []).filter((h) => h !== text);
      hist.unshift(text);
      LS.set("history", hist.slice(0, 30));
      setExportPath((cur) => cur || defaultExportPath(status?.home || "", "csv"));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setBusy("");
    }
  }, [sql, status]);
  const doImport = useCallback(async () => {
    const p = importPath.trim();
    if (!p) {
      setError("\u5148\u586B\u6570\u636E\u6587\u4EF6\u8DEF\u5F84\uFF08\u5982 D:\\data\\orders.csv\uFF09");
      return;
    }
    setBusy("\u5BFC\u5165\u4E2D\u2026");
    setError("");
    setNotice("");
    try {
      const r = await api("POST", "/import", {
        path: p,
        table: importTable.trim() || void 0
      }, 6e5);
      setNotice(`\u5BFC\u5165\u6210\u529F\uFF1A${r.table}\uFF08${r.rows} \u884C\uFF0C${(r.elapsedMs / 1e3).toFixed(2)}s\uFF09`);
      const rec = LS.get("recentPaths", []).filter((x) => x !== p);
      rec.unshift(p);
      LS.set("recentPaths", rec.slice(0, 8));
      setImportPath("");
      setImportTable("");
      await refreshTables();
      await selectTable(r.table);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }, [importPath, importTable, refreshTables, selectTable]);
  const doExport = useCallback(async (format) => {
    if (!result || !sql.trim()) {
      setError("\u5148\u6267\u884C\u4E00\u6B21\u67E5\u8BE2\u518D\u5BFC\u51FA");
      return;
    }
    const p = (exportPath.trim() || defaultExportPath(status?.home || "", format)).replace(/\.(csv|json|ndjson|txt)$/i, `.${format}`);
    setBusy("\u5BFC\u51FA\u4E2D\u2026");
    setError("");
    setNotice("");
    try {
      const r = await api("POST", "/export", {
        sql: sql.trim(),
        path: p,
        format,
        overwrite: false
      }, 6e5);
      setNotice(`\u5BFC\u51FA\u6210\u529F\uFF1A${r.path}\uFF08${r.rows} \u884C\uFF0C${fmtSize(r.bytes)}\uFF09`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }, [result, sql, exportPath, status]);
  const dropTable = useCallback(async (name) => {
    if (!window.confirm(`\u5220\u9664\u8868 ${name}\uFF1F\uFF08\u6E90\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\uFF0C\u53EF\u91CD\u65B0\u5BFC\u5165\uFF09`)) return;
    try {
      await api("POST", "/drop", { table: name });
      if (selTable === name) {
        setSelTable("");
        setPreview(null);
        setSchemaInfo(null);
      }
      await refreshTables();
    } catch (e) {
      setError(e.message);
    }
  }, [selTable, refreshTables]);
  const resetWorkspace = useCallback(async () => {
    if (!window.confirm("\u91CD\u7F6E\u5DE5\u4F5C\u533A\u5C06\u5220\u9664\u5168\u90E8\u5DF2\u5BFC\u5165\u8868\uFF08\u6E90\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\uFF09\u3002\u786E\u5B9A\uFF1F")) return;
    try {
      await api("POST", "/workspace/reset", { confirm: true }, 3e5);
      setSelTable("");
      setPreview(null);
      setSchemaInfo(null);
      setResult(null);
      await refreshTables();
      setNotice("\u5DE5\u4F5C\u533A\u5DF2\u91CD\u7F6E");
    } catch (e) {
      setError(e.message);
    }
  }, [refreshTables]);
  const engineRetry = useCallback(async () => {
    setBusy("\u5F15\u64CE\u521D\u59CB\u5316\u2026");
    setError("");
    try {
      await api("GET", "/tables", void 0, 6e5);
      await refreshTables();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }, [refreshTables]);
  const history = useMemo(() => LS.get("history", []), [sql]);
  const recentPaths = useMemo(() => LS.get("recentPaths", []), [importPath]);
  return /* @__PURE__ */ jsxs("div", { className: "dq-root", children: [
    /* @__PURE__ */ jsx("style", { children: STYLE }),
    /* @__PURE__ */ jsxs("div", { className: "dq-topbar", children: [
      /* @__PURE__ */ jsx("span", { className: "dq-title", children: "\u6570\u636E\u67E5\u8BE2\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "dq-spacer" }),
      engine && engine.engine === "ready" && /* @__PURE__ */ jsxs("span", { className: "dq-pill dq-pill-ok", children: [
        "\u5F15\u64CE\u5C31\u7EEA \xB7 ",
        engine.tables,
        " \u8868 \xB7 ",
        engine.rowsTotal.toLocaleString(),
        " \u884C \xB7 ",
        fmtSize(engine.workspaceBytes)
      ] }),
      engine && engine.engine === "initializing" && /* @__PURE__ */ jsx("span", { className: "dq-pill dq-pill-warn", children: "\u5F15\u64CE\u521D\u59CB\u5316\u4E2D\u2026" }),
      engine && engine.engine === "initializing" && /* @__PURE__ */ jsx("span", { className: "dq-pill dq-pill-warn", children: "\u5F15\u64CE\u521D\u59CB\u5316\u4E2D\u2026" }),
      engine && engine.engine === "error" && /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-danger", onClick: engineRetry, disabled: !!busy, children: "\u5F15\u64CE\u9519\u8BEF\uFF0C\u70B9\u6B64\u91CD\u8BD5" }),
      engine && engine.engine === "absent" && /* @__PURE__ */ jsx("span", { className: "dq-pill dq-pill-warn", children: "\u5F15\u64CE\u5F85\u521D\u59CB\u5316\uFF08\u5BFC\u5165/\u67E5\u8BE2\u65F6\u81EA\u52A8\u5F00\u59CB\uFF09" }),
      tables.length > 0 && /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn", onClick: resetWorkspace, disabled: !!busy, title: "\u5220\u9664\u5168\u90E8\u5DF2\u5BFC\u5165\u8868", children: "\u91CD\u7F6E\u5DE5\u4F5C\u533A" })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "dq-box dq-err", role: "alert", children: [
      error,
      /* @__PURE__ */ jsx("button", { type: "button", className: "dq-x", onClick: () => setError(""), children: "\xD7" })
    ] }),
    notice && /* @__PURE__ */ jsxs("div", { className: "dq-box dq-okbox", children: [
      notice,
      /* @__PURE__ */ jsx("button", { type: "button", className: "dq-x", onClick: () => setNotice(""), children: "\xD7" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "dq-layout", children: [
      /* @__PURE__ */ jsxs("div", { className: "dq-side", children: [
        /* @__PURE__ */ jsxs("div", { className: "dq-card", children: [
          /* @__PURE__ */ jsx("div", { className: "dq-card-title", children: "\u5BFC\u5165\u6570\u636E\u6587\u4EF6" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "dq-input",
              placeholder: "\u6570\u636E\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF08.csv/.tsv/.txt/.json/.jsonl/.parquet\uFF09",
              value: importPath,
              onChange: (e) => setImportPath(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") doImport();
              },
              disabled: !!busy
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "dq-row", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "dq-input dq-input-sm",
                placeholder: "\u8868\u540D\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u6587\u4EF6\u540D\uFF09",
                value: importTable,
                onChange: (e) => setImportTable(e.target.value),
                disabled: !!busy
              }
            ),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-primary", onClick: doImport, disabled: !!busy || !ready, children: "\u5BFC\u5165" })
          ] }),
          recentPaths.length > 0 && /* @__PURE__ */ jsx("div", { className: "dq-recent", children: recentPaths.map((p) => /* @__PURE__ */ jsx("button", { type: "button", className: "dq-recent-item", onClick: () => setImportPath(p), title: p, children: p.length > 42 ? `\u2026${p.slice(-40)}` : p }, p)) }),
          /* @__PURE__ */ jsx("div", { className: "dq-hint", children: "GBK / UTF-16 \u7F16\u7801\u81EA\u52A8\u8F6C\u7801\uFF1B\u540C\u540D\u518D\u5BFC\u5165 = \u8986\u76D6\u5237\u65B0\u3002" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "dq-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "dq-card-title", children: [
            "\u8868\uFF08",
            tables.length,
            "\uFF09"
          ] }),
          tables.length === 0 && /* @__PURE__ */ jsx("div", { className: "dq-hint", children: "\u8FD8\u6CA1\u6709\u8868\u3002\u5BFC\u5165\u4E00\u4E2A\u6570\u636E\u6587\u4EF6\uFF0C\u6216\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u628A xxx.csv \u5BFC\u8FDB\u6765\u300D\u3002" }),
          tables.map((t) => /* @__PURE__ */ jsxs("div", { className: `dq-table-item${selTable === t.table ? " dq-table-item-sel" : ""}`, children: [
            /* @__PURE__ */ jsxs("button", { type: "button", className: "dq-table-main", onClick: () => selectTable(t.table), title: `${t.source} \xB7 ${t.importedAt || ""}`, children: [
              /* @__PURE__ */ jsx("span", { className: "dq-table-name", children: t.table }),
              /* @__PURE__ */ jsxs("span", { className: "dq-table-meta", children: [
                t.rows.toLocaleString(),
                " \u884C \xB7 ",
                fmtSize(t.sizeBytes),
                t.kind && t.kind !== "unknown" ? ` \xB7 ${t.kind}` : ""
              ] })
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-x", onClick: () => dropTable(t.table), title: "\u5220\u9664\u8868", disabled: !!busy, children: "\xD7" })
          ] }, t.table))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dq-main", children: [
        /* @__PURE__ */ jsxs("div", { className: "dq-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "dq-card-title", children: [
            "SQL\uFF08DuckDB \u65B9\u8A00\uFF0CCtrl+Enter \u8FD0\u884C\uFF09",
            history.length > 0 && /* @__PURE__ */ jsxs(
              "select",
              {
                className: "dq-select",
                value: "",
                onChange: (e) => {
                  if (e.target.value) setSql(e.target.value);
                },
                children: [
                  /* @__PURE__ */ jsxs("option", { value: "", children: [
                    "\u5386\u53F2 ",
                    history.length
                  ] }),
                  history.map((h, i) => /* @__PURE__ */ jsx("option", { value: h, children: h.slice(0, 70).replace(/\s+/g, " ") }, `${i}-${h.slice(0, 24)}`))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "dq-sql",
              value: sql,
              onChange: (e) => setSql(e.target.value),
              onKeyDown: (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  runQuery();
                }
              },
              placeholder: `SELECT \u54C1\u7C7B, sum(\u91D1\u989D) AS \u603B\u91D1\u989D
FROM \u8BA2\u5355
GROUP BY 1 ORDER BY \u603B\u91D1\u989D DESC`,
              spellCheck: false,
              rows: 5,
              disabled: !!busy
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "dq-row", children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-primary", onClick: runQuery, disabled: !!busy || !ready, children: "\u8FD0\u884C" }),
            busy && /* @__PURE__ */ jsx("span", { className: "dq-busy", children: busy }),
            /* @__PURE__ */ jsx("span", { className: "dq-spacer" }),
            result && onSendToChat && /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "dq-btn",
                onClick: () => onSendToChat(`SQL:
${sql.trim()}

\u67E5\u8BE2\u7ED3\u679C\uFF08${result.rowCount} \u884C\uFF0C${(result.elapsedMs / 1e3).toFixed(2)}s\uFF09\uFF1A
${resultToMarkdown(result)}`),
                children: "\u7ED3\u679C\u53D1\u7ED9 AI"
              }
            )
          ] })
        ] }),
        selTable && (preview || schemaInfo) && /* @__PURE__ */ jsxs("div", { className: "dq-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "dq-card-title", children: [
            "\u8868 ",
            selTable,
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-sm", onClick: () => setShowSchema(!showSchema), children: showSchema ? "\u9690\u85CF\u7ED3\u6784" : "\u770B\u7ED3\u6784" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-sm", onClick: () => setSql(`SELECT * FROM ${selTable} LIMIT 100`), children: "\u586B\u5165\u793A\u4F8B SQL" }),
            /* @__PURE__ */ jsx("span", { className: "dq-spacer" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-x", onClick: () => {
              setSelTable("");
              setPreview(null);
              setSchemaInfo(null);
            }, children: "\xD7" })
          ] }),
          showSchema && schemaInfo && /* @__PURE__ */ jsx("div", { className: "dq-schema", children: schemaInfo.columns.map((c) => /* @__PURE__ */ jsxs("span", { className: "dq-col-chip", title: `\u6837\u4F8B\uFF1A${cellText(schemaInfo.sample[0]?.[c.name])}`, children: [
            c.name,
            /* @__PURE__ */ jsx("em", { children: c.type })
          ] }, c.name)) }),
          preview && /* @__PURE__ */ jsx(Grid, { columns: preview.columns, rows: preview.rows, note: `\u524D ${preview.rows.length} \u884C` })
        ] }),
        result && /* @__PURE__ */ jsxs("div", { className: "dq-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "dq-card-title", children: [
            "\u7ED3\u679C\uFF1A",
            result.rowCount.toLocaleString(),
            " \u884C \xB7 ",
            (result.elapsedMs / 1e3).toFixed(2),
            "s",
            result.truncated && /* @__PURE__ */ jsxs("em", { className: "dq-trunc", children: [
              "\uFF08\u5C55\u793A\u524D ",
              result.rows.length,
              " \u884C\uFF09"
            ] }),
            /* @__PURE__ */ jsx("span", { className: "dq-spacer" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "dq-input dq-input-sm dq-export-path",
                value: exportPath,
                onChange: (e) => setExportPath(e.target.value),
                placeholder: "\u5BFC\u51FA\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84"
              }
            ),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-sm", onClick: () => doExport("csv"), disabled: !!busy, children: "\u5BFC\u51FA CSV" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dq-btn dq-btn-sm", onClick: () => doExport("json"), disabled: !!busy, children: "\u5BFC\u51FA JSON" })
          ] }),
          /* @__PURE__ */ jsx(Grid, { columns: result.columns, rows: result.rows, note: result.truncated ? `\u5C55\u793A ${result.rows.length}/${result.rowCount} \u884C` : void 0 })
        ] }),
        !result && !selTable && tables.length === 0 && /* @__PURE__ */ jsxs("div", { className: "dq-card dq-guide", children: [
          /* @__PURE__ */ jsx("div", { className: "dq-card-title", children: "\u4E09\u6B65\u5F00\u59CB" }),
          /* @__PURE__ */ jsxs("ol", { className: "dq-ol", children: [
            /* @__PURE__ */ jsx("li", { children: "\u5DE6\u4E0A\u586B\u4E00\u4E2A\u6570\u636E\u6587\u4EF6\u8DEF\u5F84\u70B9\u300C\u5BFC\u5165\u300D\uFF08\u6BD4\u5982\u4E0B\u8F7D\u7684\u8D26\u5355 CSV\u3001\u5BFC\u51FA\u7684\u8BA2\u5355 JSON\uFF09\u3002" }),
            /* @__PURE__ */ jsx("li", { children: "\u70B9\u8868\u540D\u770B\u7ED3\u6784\u548C\u6837\u4F8B\uFF0C\u6216\u70B9\u300C\u586B\u5165\u793A\u4F8B SQL\u300D\u6539\u4E00\u6539\u3002" }),
            /* @__PURE__ */ jsx("li", { children: "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5BF9 AI \u8BF4\uFF1A\u300C\u5E2E\u6211\u628A\u4E0B\u8F7D\u76EE\u5F55\u7684 sales.csv \u5BFC\u8FDB\u6765\uFF0C\u6309\u6708\u6C47\u603B\u91D1\u989D\u524D\u5341\u300D\u3002" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "dq-hint", children: "\u6240\u6709\u6570\u636E\u53EA\u5728\u4F60\u672C\u673A\uFF1ADuckDB \u5F15\u64CE\u968F\u5305\u5185\u7F6E\uFF08Windows x64\uFF09\uFF0C\u5168\u7A0B\u79BB\u7EBF\u3002" })
        ] })
      ] })
    ] })
  ] });
}
function Grid({ columns, rows, note }) {
  if (!columns.length || !rows.length) return /* @__PURE__ */ jsx("div", { className: "dq-hint", children: "\uFF08\u7A7A\u7ED3\u679C\uFF09" });
  return /* @__PURE__ */ jsxs("div", { className: "dq-grid-wrap", children: [
    note && /* @__PURE__ */ jsx("div", { className: "dq-grid-note", children: note }),
    /* @__PURE__ */ jsxs("table", { className: "dq-grid", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: columns.map((c) => /* @__PURE__ */ jsx("th", { children: c }, c)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.map((row, i) => /* @__PURE__ */ jsx("tr", { children: columns.map((c) => {
        const v = row[c];
        const numeric = typeof v === "number";
        return /* @__PURE__ */ jsx("td", { className: numeric ? "dq-num" : void 0, children: cellText(v) }, c);
      }) }, i)) })
    ] })
  ] });
}
var STYLE = `
.dq-root { color: inherit; font-size: 13px; line-height: 1.5; padding: 12px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.dq-topbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dq-title { font-weight: 700; font-size: 15px; }
.dq-spacer { flex: 1; }
.dq-pill { padding: 2px 10px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(128,128,128,.35); display: inline-flex; align-items: center; gap: 6px; }
.dq-pill-ok { color: inherit; }
.dq-pill-warn { opacity: .9; }
.dq-bar { width: 90px; height: 6px; border-radius: 3px; background: rgba(128,128,128,.25); overflow: hidden; display: inline-block; }
.dq-bar-in { display: block; height: 100%; background: currentColor; opacity: .6; }
.dq-layout { display: flex; gap: 10px; align-items: flex-start; }
.dq-side { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
.dq-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.dq-card { border: 1px solid rgba(128,128,128,.3); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.dq-card-title { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dq-card-title em.dq-trunc { font-weight: 400; opacity: .75; font-style: normal; font-size: 12px; }
.dq-input { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font-size: 12.5px; font-family: ui-monospace, Consolas, monospace; }
.dq-input:focus { outline: none; border-color: currentColor; }
.dq-input-sm { flex: 0 1 200px; }
.dq-export-path { flex: 1 1 220px; max-width: 340px; }
.dq-select { padding: 3px 6px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font-size: 12px; max-width: 260px; }
.dq-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; cursor: pointer; font-size: 12.5px; white-space: nowrap; }
.dq-btn:hover { background: rgba(128,128,128,.12); }
.dq-btn:disabled { opacity: .45; cursor: default; }
.dq-btn-primary { background: rgba(128,128,128,.18); font-weight: 600; }
.dq-btn-danger { border-color: rgba(220,80,80,.6); }
.dq-btn-sm { padding: 3px 8px; font-size: 12px; }
.dq-busy { opacity: .8; font-size: 12px; }
.dq-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dq-sql { width: 100%; min-height: 110px; resize: vertical; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; box-sizing: border-box; }
.dq-sql:focus { outline: none; border-color: currentColor; }
.dq-hint { opacity: .7; font-size: 12px; }
.dq-box { border-radius: 8px; padding: 8px 12px; font-size: 12.5px; position: relative; padding-right: 28px; }
.dq-err { border: 1px solid rgba(220,80,80,.5); background: rgba(220,80,80,.08); white-space: pre-wrap; }
.dq-okbox { border: 1px solid rgba(90,180,90,.5); background: rgba(90,180,90,.08); }
.dq-x { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 6px; opacity: .6; }
.dq-x:hover { opacity: 1; }
.dq-table-item { display: flex; align-items: center; border-radius: 8px; border: 1px solid transparent; }
.dq-table-item:hover { background: rgba(128,128,128,.1); }
.dq-table-item-sel { border-color: rgba(128,128,128,.5); background: rgba(128,128,128,.08); }
.dq-table-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; border: none; background: transparent; color: inherit; cursor: pointer; padding: 6px 8px; text-align: left; }
.dq-table-name { font-weight: 600; font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
.dq-table-meta { font-size: 11.5px; opacity: .7; }
.dq-recent { display: flex; flex-direction: column; gap: 2px; }
.dq-recent-item { border: none; background: transparent; color: inherit; opacity: .65; cursor: pointer; text-align: left; font-size: 11.5px; padding: 2px 4px; font-family: ui-monospace, Consolas, monospace; }
.dq-recent-item:hover { opacity: 1; text-decoration: underline; }
.dq-schema { display: flex; flex-wrap: wrap; gap: 6px; }
.dq-col-chip { border: 1px solid rgba(128,128,128,.35); border-radius: 999px; padding: 1px 9px; font-size: 11.5px; font-family: ui-monospace, Consolas, monospace; }
.dq-col-chip em { font-style: normal; opacity: .6; margin-left: 4px; }
.dq-grid-wrap { overflow: auto; max-height: 46vh; border: 1px solid rgba(128,128,128,.25); border-radius: 8px; }
.dq-grid-note { padding: 4px 8px; font-size: 11.5px; opacity: .7; border-bottom: 1px solid rgba(128,128,128,.2); }
.dq-grid { border-collapse: collapse; width: 100%; font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
.dq-grid th, .dq-grid td { text-align: left; padding: 4px 8px; border-bottom: 1px solid rgba(128,128,128,.18); white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.dq-grid th { position: sticky; top: 0; background: rgba(128,128,128,.12); font-weight: 600; }
.dq-grid td.dq-num { text-align: right; font-variant-numeric: tabular-nums; }
.dq-guide ol.dq-ol { margin: 4px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
`;

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function index(props) {
  return /* @__PURE__ */ jsx2(Panel, { ...props });
}
export {
  index as default
};
