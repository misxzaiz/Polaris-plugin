// src/Panel.tsx
import { useCallback as useCallback6, useEffect as useEffect4, useRef, useState as useState6 } from "react";

// src/host.ts
function findInvoke() {
  if (typeof window !== "undefined" && window.__POLARIS_HOST_INVOKE__) {
    return window.__POLARIS_HOST_INVOKE__;
  }
  if (typeof globalThis !== "undefined" && globalThis.__POLARIS_HOST_INVOKE__) {
    return globalThis.__POLARIS_HOST_INVOKE__;
  }
  return void 0;
}
function getHostInvoke() {
  const invoke = findInvoke();
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}

// src/model.ts
var PLUGIN_ID = "sqlite-lens";
var SERVICE_ID = "sqlite-lens-service";
async function capDispatch(target, payload) {
  const invoke = getHostInvoke();
  const res = await invoke(
    "router_dispatch",
    { req: { target, payload } }
  );
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
var KEY_META = "sqltl.meta";
async function listServiceStatus() {
  try {
    const st = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
    const arr = Array.isArray(st) ? st : [];
    const mine = arr.find((s) => s.pluginId === PLUGIN_ID && s.serviceId === SERVICE_ID);
    return mine || null;
  } catch (_) {
    return null;
  }
}
async function serviceAction(action) {
  if (action === "start") {
    const st = await listServiceStatus();
    if (st && (st.state === "running" || st.status === "running")) return;
    const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
    const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID);
    const svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID);
    if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230 SQLite \u68C0\u67E5\u53F0\u670D\u52A1\u2014\u2014\u8BF7\u786E\u8BA4\u63D2\u4EF6\u5DF2\u6B63\u786E\u5B89\u88C5");
    await capDispatch("cap.pluginServiceManager", {
      action: "start",
      pluginId: PLUGIN_ID,
      installPath: self.installPath,
      contribution: {
        id: svc.id,
        type: svc.type ?? svc.serviceType,
        command: svc.command,
        argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
        port: svc.port ?? null,
        healthCheck: svc.healthCheck ?? null,
        healthCheckTimeout: svc.healthCheckTimeout ?? null,
        autoStart: svc.autoStart ?? true,
        restartOnFailure: svc.restartOnFailure ?? true,
        maxRestarts: svc.maxRestarts ?? 3,
        description: svc.description ?? null
      }
    });
    return;
  }
  await capDispatch("cap.pluginServiceManager", { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
async function loadMeta() {
  try {
    const m = await kvGet(KEY_META);
    if (m && typeof m.port === "number" && m.port && typeof m.token === "string" && m.token) return m;
    return null;
  } catch (_) {
    return null;
  }
}
async function svcFetch(meta, path, body) {
  const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-SqliteLens-Token": meta.token },
    body: JSON.stringify(body || {})
  });
  return await res.json();
}
async function withSvc(fn) {
  const meta = await loadMeta();
  if (!meta) throw new Error("\u670D\u52A1\u672A\u5C31\u7EEA\uFF08meta \u672A\u4E0A\u62A5\uFF09\u2014\u2014\u7A0D\u5019\u6216\u5728\u8BBE\u7F6E\u9875\u624B\u52A8\u542F\u52A8\u670D\u52A1");
  return fn(meta);
}
function timeAgo(ts) {
  if (!ts) return "\u4ECE\u672A";
  const d = Date.now() - ts;
  if (d < 6e4) return "\u521A\u521A";
  if (d < 36e5) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 864e5) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function fmtBytes(n) {
  if (n === null || n === void 0 || !Number.isFinite(n) || n < 0) return "\u2014";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

// src/RadarTab.tsx
import { useCallback, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function RadarTab({ onOpened }) {
  const [root, setRoot] = useState("");
  const [budget, setBudget] = useState(4);
  const [items, setItems] = useState(null);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [opening, setOpening] = useState("");
  const scan = useCallback(async () => {
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/radar", {
        root: root.trim() || void 0,
        budgetMs: Math.round(budget * 1e3)
      }));
      if (r.ok && r.items) {
        setItems(r.items);
        setInfo(`\u626B\u63CF ${r.walked || 0} \u4E2A\u76EE\u5F55 \xB7 ${r.elapsedMs || 0}ms${r.partial ? " \xB7 \u9884\u7B97\u5185\u672A\u626B\u5B8C\uFF08\u53EF\u52A0\u5927\u9884\u7B97\u6216\u6307\u5B9A\u6839\uFF09" : ""}`);
      } else setErr(r.error || "\u626B\u63CF\u5931\u8D25");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [root, budget]);
  const openOne = useCallback(async (path) => {
    setOpening(path);
    setErr("");
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/open", { path }));
      if (!r.ok) setErr(r.error || "\u6253\u5F00\u5931\u8D25");
      else onOpened();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening("");
    }
  }, [onOpened]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "sl-bar" }),
      "\u5E93\u96F7\u8FBE",
      /* @__PURE__ */ jsx("span", { className: "sl-hint", children: "\u627E\u78C1\u76D8\u4E0A\u7684 SQLite \u5E93\u6587\u4EF6\uFF08.db/.sqlite/.sqlite3\u2026\uFF09" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sl-card", children: /* @__PURE__ */ jsxs("div", { className: "sl-card-b", children: [
      /* @__PURE__ */ jsx("div", { className: "sl-row", children: /* @__PURE__ */ jsx(
        "input",
        {
          className: "sl-inp sl-grow sl-mono",
          placeholder: "\u53EF\u9009\uFF1A\u6307\u5B9A\u626B\u63CF\u6839\uFF08\u5982 D:\\\\space\uFF09\uFF1B\u4E0D\u586B\u626B\u5E38\u89C1\u76EE\u5F55\uFF08\u7528\u6237\u76EE\u5F55/\u4E0B\u8F7D/\u6587\u6863/AppData\uFF09",
          value: root,
          onChange: (e) => setRoot(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsxs("div", { className: "sl-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs("span", { className: "sl-sub", children: [
          "\u9884\u7B97 ",
          budget,
          "s"
        ] }),
        /* @__PURE__ */ jsx("input", { type: "range", min: 1, max: 15, value: budget, onChange: (e) => setBudget(Number(e.target.value)), style: { width: 120 } }),
        /* @__PURE__ */ jsx("button", { className: "sl-btn primary", disabled: busy, onClick: scan, children: busy ? "\u626B\u63CF\u4E2D\u2026" : "\u626B\u63CF" }),
        info ? /* @__PURE__ */ jsx("span", { className: "sl-hint", children: info }) : null
      ] })
    ] }) }),
    err ? /* @__PURE__ */ jsx("div", { className: "sl-err", children: err }) : null,
    items !== null && (items.length === 0 ? /* @__PURE__ */ jsx("div", { className: "sl-empty", children: "\u6CA1\u627E\u5230\u5E93\u6587\u4EF6\u5019\u9009\u2014\u2014\u52A0\u5927\u9884\u7B97\u3001\u6362\u6839\u76EE\u5F55\uFF0C\u6216\u76F4\u63A5\u5728\u300C\u6570\u636E\u6D4F\u89C8\u300D\u7C98\u8D34\u8DEF\u5F84\u6253\u5F00" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "sl-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "sl-bar" }),
        "\u627E\u5230 ",
        items.length,
        " \u4E2A\u5019\u9009",
        /* @__PURE__ */ jsx("span", { className: "sl-hint", children: "\u5DF2\u8BFB\u6587\u4EF6\u5934\u9A8C\u8BC1 \xB7 \u6309\u5927\u5C0F\u6392\u5E8F" })
      ] }),
      items.map((it) => /* @__PURE__ */ jsx("div", { className: "sl-card", children: /* @__PURE__ */ jsx("div", { className: "sl-card-b", children: /* @__PURE__ */ jsxs("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsxs("span", { className: "sl-grow", style: { overflow: "hidden" }, children: [
          /* @__PURE__ */ jsx("div", { className: "sl-mono", style: { fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: it.path, children: it.path }),
          /* @__PURE__ */ jsxs("div", { className: "sl-sub", children: [
            fmtBytes(it.sizeBytes),
            " \xB7 \u4FEE\u6539\u4E8E ",
            timeAgo(it.mtimeMs),
            it.sqlite === true ? " \xB7 SQLite \u9B54\u6570 \u2713" : it.sqlite === false ? " \xB7 \u26A0 \u975E SQLite\uFF08\u540C\u6269\u5C55\u540D\uFF09" : ""
          ] })
        ] }),
        it.sqlite !== false && /* @__PURE__ */ jsx("button", { className: "sl-btn sm", disabled: opening === it.path, onClick: () => openOne(it.path), children: opening === it.path ? "\u6253\u5F00\u4E2D\u2026" : "\u6253\u5F00" })
      ] }) }) }, it.path))
    ] }))
  ] });
}

// src/BrowseTab.tsx
import { useCallback as useCallback2, useEffect, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PAGE = 100;
function BrowseTab({ libs, reply, onChanged }) {
  const [dbId, setDbId] = useState2("");
  const [table, setTable] = useState2("");
  const [where, setWhere] = useState2("");
  const [orderBy, setOrderBy] = useState2("");
  const [desc, setDesc] = useState2(false);
  const [offset, setOffset] = useState2(0);
  const [schema, setSchema] = useState2(null);
  const [rows, setRows] = useState2(null);
  const [err, setErr] = useState2("");
  const [pathInput, setPathInput] = useState2("");
  const [loading, setLoading] = useState2(false);
  useEffect(() => {
    if (!dbId && libs.length) {
      setDbId(libs[0].dbId);
      setTable("");
    }
  }, [libs, dbId]);
  const loadSchema = useCallback2(async (id) => {
    if (!id) {
      setSchema(null);
      return;
    }
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/schema", { dbId: id }));
      setSchema(r);
      if (!r.ok) setErr(r.error || "schema \u8BFB\u53D6\u5931\u8D25");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const loadRows = useCallback2(async (id, tbl, opts) => {
    if (!id || !tbl) {
      setRows(null);
      return;
    }
    setLoading(true);
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/rows", {
        dbId: id,
        table: tbl,
        where: opts?.where || void 0,
        orderBy: opts?.orderBy || void 0,
        desc: opts?.desc,
        offset: opts?.offset ?? 0,
        limit: PAGE
      }));
      setRows(r);
      if (!r.ok) setErr(r.error || "\u67E5\u8BE2\u5931\u8D25");
      else setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (dbId) {
      loadSchema(dbId);
      setTable("");
      setRows(null);
      setOffset(0);
      setWhere("");
      setOrderBy("");
    }
  }, [dbId, loadSchema]);
  useEffect(() => {
    if (dbId && table) loadRows(dbId, table, { where, orderBy, desc, offset });
  }, [dbId, table, where, orderBy, desc, offset, loadRows]);
  const openByPath = useCallback2(async () => {
    const p = pathInput.trim();
    if (!p) return;
    setErr("");
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/open", { path: p }));
      if (!r.ok || !r.dbId) {
        setErr(r.error || "\u6253\u5F00\u5931\u8D25");
        return;
      }
      setPathInput("");
      onChanged();
      setDbId(r.dbId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [pathInput, onChanged]);
  const curLib = libs.find((l) => l.dbId === dbId);
  const tables = (schema?.objects || []).filter((o) => o.type === "table");
  const total = rows?.total ?? 0;
  const sortBy = (col) => {
    if (orderBy === col) {
      if (!desc) setDesc(true);
      else {
        setOrderBy("");
        setDesc(false);
      }
    } else {
      setOrderBy(col);
      setDesc(false);
    }
    setOffset(0);
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "sl-bar" }),
      "\u6570\u636E\u6D4F\u89C8",
      /* @__PURE__ */ jsx2("span", { className: "sl-hint", children: "\u53EA\u8BFB\u8FDE\u63A5 \xB7 \u6539\u6570\u636E\u53BB\u300CSQL \u67E5\u8BE2\u300D\u8D70\u4E24\u6B65\u5199" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sl-lib-pick", children: [
      libs.length === 0 && /* @__PURE__ */ jsx2("span", { className: "sl-sub", children: "\u8FD8\u6CA1\u6709\u6253\u5F00\u8FC7\u5E93\u2014\u2014\u53BB\u300C\u5E93\u96F7\u8FBE\u300D\u626B\u63CF\uFF0C\u6216\u7C98\u8D34\u8DEF\u5F84\uFF1A" }),
      libs.map((l) => /* @__PURE__ */ jsxs2("button", { className: `sl-pill ${dbId === l.dbId ? "on" : ""}`, onClick: () => setDbId(l.dbId), title: l.path, children: [
        l.label,
        " \xB7 ",
        fmtBytes(l.sizeBytes),
        l.knownAs ? ` \xB7 ${l.knownAs}` : ""
      ] }, l.dbId)),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "sl-inp sl-mono",
          style: { maxWidth: 320 },
          placeholder: "\u76F4\u63A5\u6253\u5F00\uFF1AC:\\\\path\\\\to.db",
          value: pathInput,
          onChange: (e) => setPathInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") openByPath();
          }
        }
      ),
      /* @__PURE__ */ jsx2("button", { className: "sl-btn sm", onClick: openByPath, children: "\u6253\u5F00" })
    ] }),
    err ? /* @__PURE__ */ jsx2("div", { className: "sl-err", children: err }) : null,
    curLib && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      schema && schema.ok && /* @__PURE__ */ jsxs2("div", { className: "sl-lib-pick", children: [
        tables.length === 0 && /* @__PURE__ */ jsx2("span", { className: "sl-sub", children: "\u5E93\u4E2D\u6CA1\u6709\u8868" }),
        tables.map((t) => /* @__PURE__ */ jsx2("button", { className: `sl-pill ${table === t.name ? "on" : ""}`, onClick: () => {
          setTable(t.name);
          setOffset(0);
          setWhere("");
          setOrderBy("");
        }, children: t.name }, t.name))
      ] }),
      table && /* @__PURE__ */ jsxs2("div", { className: "sl-card", children: [
        /* @__PURE__ */ jsx2("div", { className: "sl-card-b", children: /* @__PURE__ */ jsxs2("div", { className: "sl-row", children: [
          /* @__PURE__ */ jsx2("span", { className: "sl-tag", children: table }),
          typeof total === "number" && /* @__PURE__ */ jsxs2("span", { className: "sl-sub", children: [
            total.toLocaleString(),
            " \u884C"
          ] }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "sl-inp sl-grow sl-mono",
              style: { maxWidth: 300 },
              placeholder: "WHERE \u8FC7\u6EE4\uFF08\u5982 age > 18\uFF09",
              value: where,
              onChange: (e) => {
                setWhere(e.target.value);
                setOffset(0);
              }
            }
          )
        ] }) }),
        loading ? /* @__PURE__ */ jsx2("div", { className: "sl-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }) : rows && rows.ok && rows.rows ? rows.rows.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "sl-empty", children: "0 \u884C" }) : /* @__PURE__ */ jsx2("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs2("table", { className: "sl-grid", children: [
          /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsx2("tr", { children: rows.columns?.map((c) => /* @__PURE__ */ jsxs2("th", { onClick: () => sortBy(c), title: "\u70B9\u51FB\u6392\u5E8F", children: [
            c,
            orderBy === c ? desc ? " \u2193" : " \u2191" : ""
          ] }, c)) }) }),
          /* @__PURE__ */ jsx2("tbody", { children: rows.rows.map((r, i) => /* @__PURE__ */ jsx2("tr", { children: r.map((cell, j) => /* @__PURE__ */ jsx2("td", { title: cell.v || "", children: cell.t === "null" ? /* @__PURE__ */ jsx2("span", { className: "sl-null", children: "NULL" }) : cell.t === "blob" ? /* @__PURE__ */ jsx2("span", { className: "sl-blob", children: cell.v }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
            cell.v,
            cell.trunc ? /* @__PURE__ */ jsxs2("span", { className: "sl-trunc", children: [
              "\u2026",
              cell.trunc,
              "\u5B57\u7B26"
            ] }) : null
          ] }) }, j)) }, i)) })
        ] }) }) : rows && !rows.ok ? /* @__PURE__ */ jsx2("div", { className: "sl-err", children: rows.error }) : null,
        rows && rows.ok && total > PAGE && /* @__PURE__ */ jsxs2("div", { className: "sl-card-b sl-row", style: { borderTop: "1px solid #1B2029" }, children: [
          /* @__PURE__ */ jsx2("button", { className: "sl-btn sm", disabled: offset === 0, onClick: () => setOffset(Math.max(0, offset - PAGE)), children: "\u4E0A\u4E00\u9875" }),
          /* @__PURE__ */ jsxs2("span", { className: "sl-sub", children: [
            offset + 1,
            "\u2013",
            Math.min(offset + PAGE, total),
            " / ",
            total.toLocaleString()
          ] }),
          /* @__PURE__ */ jsx2("button", { className: "sl-btn sm", disabled: offset + PAGE >= total, onClick: () => setOffset(offset + PAGE), children: "\u4E0B\u4E00\u9875" })
        ] })
      ] })
    ] }),
    reply && !reply.bridgeOk ? /* @__PURE__ */ jsx2("div", { className: "sl-empty", children: "\u5BBF\u4E3B\u6865\u672A\u5C31\u7EEA\uFF08\u6E05\u5355\u6682\u4E0D\u53EF\u7528\uFF09" }) : null
  ] });
}

// src/QueryTab.tsx
import { useCallback as useCallback3, useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var SAMPLE = "SELECT name, sql FROM sqlite_master WHERE type='table'";
function QueryTab({ libs, reply, onChanged }) {
  const [dbId, setDbId] = useState3("");
  const [sql, setSql] = useState3("");
  const [result, setResult] = useState3(null);
  const [pend, setPend] = useState3(null);
  const [exporting, setExporting] = useState3(false);
  const [err, setErr] = useState3("");
  useEffect2(() => {
    if (!dbId && libs.length) setDbId(libs[0].dbId);
  }, [libs, dbId]);
  const run = useCallback3(async () => {
    if (!dbId || !sql.trim()) return;
    setErr("");
    setPend(null);
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/query", { dbId, sql }));
      setResult(r);
      if (r.ok) onChanged();
      else {
        if (/只读|写语句|写通道/.test(r.error || "")) {
          const w = await withSvc((m) => svcFetch(m, "/api/write", { dbId, sql }));
          setPend(w);
        } else setErr(r.error || "\u67E5\u8BE2\u5931\u8D25");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [dbId, sql, onChanged]);
  const doExport = useCallback3(async (fmt) => {
    if (!dbId || !sql.trim()) return;
    setExporting(true);
    setErr("");
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/export", { dbId, sql, format: fmt }));
      if (r.ok) setErr(`\u5DF2\u5BFC\u51FA ${r.rows} \u884C \u2192 ${r.path}\uFF08${fmtBytes(r.bytes)}\uFF09`);
      else setErr(r.error || "\u5BFC\u51FA\u5931\u8D25");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [dbId, sql]);
  const qhist = reply?.qhist || [];
  const curLib = libs.find((l) => l.dbId === dbId);
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "sl-bar" }),
      "SQL \u67E5\u8BE2",
      /* @__PURE__ */ jsx3("span", { className: "sl-hint", children: "\u53EA\u8BFB\u901A\u9053 \xB7 \u5199\u8BED\u53E5\u81EA\u52A8\u8F6C\u5165\u4E24\u6B65\u5199\u9884\u89C8" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "sl-lib-pick", children: [
      libs.map((l) => /* @__PURE__ */ jsx3("button", { className: `sl-pill ${dbId === l.dbId ? "on" : ""}`, onClick: () => {
        setDbId(l.dbId);
        setResult(null);
        setPend(null);
      }, title: l.path, children: l.label }, l.dbId)),
      !libs.length && /* @__PURE__ */ jsx3("span", { className: "sl-sub", children: "\u5148\u53BB\u300C\u5E93\u96F7\u8FBE\u300D\u6216\u300C\u6570\u636E\u6D4F\u89C8\u300D\u6253\u5F00\u4E00\u4E2A\u5E93" })
    ] }),
    curLib && /* @__PURE__ */ jsx3("div", { className: "sl-card", children: /* @__PURE__ */ jsxs3("div", { className: "sl-card-b", children: [
      /* @__PURE__ */ jsx3(
        "textarea",
        {
          className: "sl-inp sl-mono",
          style: { minHeight: 90 },
          placeholder: `\u53EA\u8BFB SQL\uFF08${SAMPLE}\uFF09`,
          value: sql,
          onChange: (e) => setSql(e.target.value),
          onKeyDown: (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
          }
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "sl-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "sl-btn primary", onClick: run, children: "\u6267\u884C\uFF08Ctrl+Enter\uFF09" }),
        /* @__PURE__ */ jsx3("button", { className: "sl-btn", disabled: exporting, onClick: () => doExport("csv"), children: "\u5BFC\u51FA CSV" }),
        /* @__PURE__ */ jsx3("button", { className: "sl-btn", disabled: exporting, onClick: () => doExport("json"), children: "\u5BFC\u51FA JSON" })
      ] })
    ] }) }),
    err ? /* @__PURE__ */ jsx3("div", { className: "sl-err", children: err }) : null,
    pend && pend.ok && pend.preview && /* @__PURE__ */ jsxs3("div", { className: "sl-pend-banner", children: [
      /* @__PURE__ */ jsx3("b", { children: "\u8FD9\u662F\u5199\u8BED\u53E5\u2014\u2014\u5DF2\u751F\u6210\u4E24\u6B65\u5199\u9884\u89C8" }),
      /* @__PURE__ */ jsx3("div", { className: "sl-sub sl-mono", style: { marginTop: 4 }, children: pend.sql }),
      /* @__PURE__ */ jsxs3("div", { className: "sl-sub", children: [
        "\u9884\u8BA1\u5F71\u54CD ",
        pend.preview.changes === null ? "\u2014\uFF08VACUUM \u91CD\u5EFA\u6574\u4E2A\u6587\u4EF6\uFF09" : `${pend.preview.changes} \u884C`,
        " \xB7 \u5F85\u786E\u8BA4\u5355 ",
        pend.pendingId,
        "\uFF0810 \u5206\u949F\u6709\u6548\uFF09"
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "sl-sub", children: "\u8BF7\u5230\u300C\u7EF4\u62A4\u300D\u9875\uFF08\u9876\u90E8\u6A2A\u5E45\uFF09\u786E\u8BA4\u6216\u53D6\u6D88\uFF1B\u786E\u8BA4\u524D\u4F1A\u81EA\u52A8\u6574\u5E93\u5907\u4EFD\u3002" })
    ] }),
    result && /* @__PURE__ */ jsxs3("div", { className: "sl-card", children: [
      /* @__PURE__ */ jsx3("div", { className: "sl-card-b", children: /* @__PURE__ */ jsxs3("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx3("span", { className: `sl-badge ${result.ok ? "good" : "bad"}`, children: result.ok ? `${result.totalRows ?? result.rows?.length ?? 0} \u884C` : "\u5931\u8D25" }),
        result.ms !== void 0 && /* @__PURE__ */ jsxs3("span", { className: "sl-hint", children: [
          result.ms,
          "ms",
          result.truncated ? " \xB7 \u5DF2\u622A\u65AD\uFF08\u7ED3\u679C\u8D85\u5355\u5143\u9884\u7B97\uFF09" : ""
        ] })
      ] }) }),
      result.ok && result.columns && result.rows ? result.rows.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "sl-empty", children: "0 \u884C" }) : /* @__PURE__ */ jsx3("div", { style: { overflowX: "auto", maxHeight: 380, overflowY: "auto" }, children: /* @__PURE__ */ jsxs3("table", { className: "sl-grid", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsx3("tr", { children: result.columns.map((c, i) => /* @__PURE__ */ jsx3("th", { children: c }, i)) }) }),
        /* @__PURE__ */ jsx3("tbody", { children: result.rows.map((r, i) => /* @__PURE__ */ jsx3("tr", { children: r.map((cell, j) => /* @__PURE__ */ jsx3("td", { title: cell.v || "", children: cell.t === "null" ? /* @__PURE__ */ jsx3("span", { className: "sl-null", children: "NULL" }) : cell.t === "blob" ? /* @__PURE__ */ jsx3("span", { className: "sl-blob", children: cell.v }) : /* @__PURE__ */ jsxs3(Fragment3, { children: [
          cell.v,
          cell.trunc ? /* @__PURE__ */ jsxs3("span", { className: "sl-trunc", children: [
            "\u2026",
            cell.trunc
          ] }) : null
        ] }) }, j)) }, i)) })
      ] }) }) : null
    ] }),
    qhist.length > 0 && /* @__PURE__ */ jsxs3(Fragment3, { children: [
      /* @__PURE__ */ jsxs3("div", { className: "sl-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "sl-bar" }),
        "\u67E5\u8BE2\u5386\u53F2",
        /* @__PURE__ */ jsxs3("span", { className: "sl-hint", children: [
          "\u6700\u8FD1 ",
          qhist.length,
          " \u6761\uFF08\u8DE8\u7AEF\u5171\u4EAB\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "sl-card", children: qhist.slice(0, 20).map((h, i) => /* @__PURE__ */ jsx3("div", { className: "sl-card-b", style: { padding: "7px 13px", borderBottom: "1px solid #1B2029" }, children: /* @__PURE__ */ jsxs3("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx3(
          "span",
          {
            className: "sl-grow sl-mono",
            style: { fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" },
            title: "\u70B9\u51FB\u586B\u5165",
            onClick: () => setSql(h.sql),
            children: h.sql
          }
        ),
        /* @__PURE__ */ jsxs3("span", { className: "sl-tag", children: [
          h.rows,
          " \u884C \xB7 ",
          h.ms,
          "ms"
        ] })
      ] }) }, i)) })
    ] })
  ] });
}

// src/MaintainTab.tsx
import { useCallback as useCallback4, useEffect as useEffect3, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function MaintainTab({ libs, reply, onChanged, onGoto }) {
  const [dbId, setDbId] = useState4("");
  const [stats, setStats] = useState4(null);
  const [integrity, setIntegrity] = useState4(null);
  const [msg, setMsg] = useState4("");
  const [err, setErr] = useState4("");
  const [vacConfirm, setVacConfirm] = useState4(false);
  useEffect3(() => {
    if (!dbId && libs.length) setDbId(libs[0].dbId);
  }, [libs, dbId]);
  const load = useCallback4(async (id) => {
    if (!id) {
      setStats(null);
      setIntegrity(null);
      return;
    }
    setVacConfirm(false);
    try {
      const [s, c] = await Promise.all([
        withSvc((m) => svcFetch(m, "/api/stats", { dbId: id })),
        withSvc((m) => svcFetch(m, "/api/integrity", { dbId: id }))
      ]);
      setStats(s);
      setIntegrity(c);
      if (!s.ok) setErr(s.error || "\u7EDF\u8BA1\u5931\u8D25");
      else setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect3(() => {
    load(dbId);
  }, [dbId, load]);
  const doMaintain = useCallback4(async (op) => {
    setErr("");
    setMsg("");
    try {
      const r = await withSvc((m) => svcFetch(m, "/api/maintain", { dbId, op }));
      if (r.ok) {
        if (op === "backup") setMsg(`\u5907\u4EFD\u5B8C\u6210 \u2192 ${r.dest}\uFF08${fmtBytes(r.size)}\uFF09`);
        else setMsg(`VACUUM \u5B8C\u6210\uFF1A${fmtBytes(r.beforeBytes)} \u2192 ${fmtBytes(r.afterBytes)}\uFF08\u91CA\u653E ${fmtBytes(r.freedBytes)}\uFF09\uFF0C\u5907\u4EFD\u5728 ${r.dest}`);
        onChanged();
        load(dbId);
      } else setErr(r.error || "\u64CD\u4F5C\u5931\u8D25");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVacConfirm(false);
    }
  }, [dbId, load, onChanged]);
  const curLib = libs.find((l) => l.dbId === dbId);
  const pendings = reply?.pendingList || [];
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "sl-bar" }),
      "\u7EF4\u62A4",
      /* @__PURE__ */ jsx4("span", { className: "sl-hint", children: "\u7EDF\u8BA1 / \u5B8C\u6574\u6027 / \u5907\u4EFD / VACUUM" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "sl-lib-pick", children: [
      libs.map((l) => /* @__PURE__ */ jsx4("button", { className: `sl-pill ${dbId === l.dbId ? "on" : ""}`, onClick: () => setDbId(l.dbId), title: l.path, children: l.label }, l.dbId)),
      !libs.length && /* @__PURE__ */ jsx4("span", { className: "sl-sub", children: "\u5148\u6253\u5F00\u4E00\u4E2A\u5E93" })
    ] }),
    err ? /* @__PURE__ */ jsx4("div", { className: "sl-err", children: err }) : null,
    msg ? /* @__PURE__ */ jsx4("div", { className: "sl-card", children: /* @__PURE__ */ jsx4("div", { className: "sl-card-b", children: /* @__PURE__ */ jsx4("span", { className: "sl-badge good", children: msg }) }) }) : null,
    pendings.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "sl-pend-banner", children: [
      /* @__PURE__ */ jsxs4("b", { children: [
        "\u26A0 \u6709 ",
        pendings.length,
        " \u5F20\u5F85\u786E\u8BA4\u5199\u5355"
      ] }),
      pendings.map((p) => /* @__PURE__ */ jsxs4("div", { className: "sl-sub sl-mono", style: { marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: p.sql, children: [
        "\xB7 ",
        p.sql,
        "\uFF08\u5F71\u54CD ",
        p.preview.changes === null ? "\u2014" : `${p.preview.changes} \u884C`,
        "\uFF0C",
        timeAgo(p.createdAt),
        "\uFF09\u2014 \u7528\u9876\u90E8\u6A2A\u5E45\u6309\u94AE\u5904\u7406"
      ] }, p.id))
    ] }),
    curLib && stats && stats.ok && /* @__PURE__ */ jsx4("div", { className: "sl-card", children: /* @__PURE__ */ jsxs4("div", { className: "sl-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u6587\u4EF6" }),
        /* @__PURE__ */ jsx4("span", { className: "v", children: curLib.path })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u5927\u5C0F" }),
        /* @__PURE__ */ jsxs4("span", { className: "v", children: [
          fmtBytes(stats.fileSize),
          "\uFF08",
          stats.pageCount?.toLocaleString(),
          " \u9875 \xD7 ",
          stats.pageSize,
          "B\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "journal" }),
        /* @__PURE__ */ jsxs4("span", { className: "v", children: [
          stats.journalMode,
          " \xB7 WAL ",
          fmtBytes(stats.walSize)
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u7A7A\u95F2\u9875" }),
        /* @__PURE__ */ jsxs4("span", { className: "v", children: [
          stats.freelistPages,
          " \u9875\uFF08\u53EF\u56DE\u6536 ",
          /* @__PURE__ */ jsx4("b", { style: { color: (stats.reclaimableBytes || 0) > 1024 * 1024 ? "#D29922" : void 0 }, children: fmtBytes(stats.reclaimableBytes) }),
          "\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u5BF9\u8C61" }),
        /* @__PURE__ */ jsxs4("span", { className: "v", children: [
          "\u8868 ",
          stats.counts?.tables,
          " \xB7 \u89C6\u56FE ",
          stats.counts?.views,
          " \xB7 \u7D22\u5F15 ",
          stats.counts?.indexes,
          " \xB7 \u89E6\u53D1\u5668 ",
          stats.counts?.triggers
        ] })
      ] }),
      stats.hint ? /* @__PURE__ */ jsx4("div", { className: "sl-sub", style: { marginTop: 6 }, children: stats.hint }) : null,
      integrity && integrity.ok && /* @__PURE__ */ jsxs4("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u5B8C\u6574\u6027" }),
        /* @__PURE__ */ jsxs4("span", { className: "v", children: [
          /* @__PURE__ */ jsx4("span", { className: `sl-badge ${integrity.healthy ? "good" : "warn"}`, children: integrity.healthy ? "quick_check \u901A\u8FC7" : "\u6709\u95EE\u9898" }),
          integrity.lines && !integrity.healthy ? /* @__PURE__ */ jsx4("div", { className: "sl-sub sl-mono", children: integrity.lines.join("\n") }) : null
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sl-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "sl-btn", onClick: () => doMaintain("backup"), children: "\u7ACB\u5373\u5907\u4EFD" }),
        !vacConfirm ? /* @__PURE__ */ jsx4("button", { className: "sl-btn", disabled: (stats.reclaimableBytes || 0) === 0 && (stats.freelistPages || 0) === 0, onClick: () => setVacConfirm(true), children: "VACUUM \u7626\u8EAB" }) : /* @__PURE__ */ jsxs4("span", { className: "sl-row", children: [
          /* @__PURE__ */ jsx4("button", { className: "sl-btn danger", onClick: () => doMaintain("vacuum"), children: "\u786E\u8BA4 VACUUM\uFF08\u5148\u81EA\u52A8\u5907\u4EFD\uFF09" }),
          /* @__PURE__ */ jsx4("button", { className: "sl-btn sm", onClick: () => setVacConfirm(false), children: "\u518D\u60F3\u60F3" })
        ] }),
        /* @__PURE__ */ jsx4("button", { className: "sl-btn sm", onClick: () => onGoto("browse"), children: "\u53BB\u6D4F\u89C8\u6570\u636E \u2192" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "sl-bar" }),
      "\u5BA1\u8BA1\u65E5\u5FD7",
      /* @__PURE__ */ jsx4("span", { className: "sl-hint", children: "\u5199\u64CD\u4F5C\u5168\u7559\u75D5\uFF08\u8DE8\u7AEF\u5171\u4EAB\uFF0C\u6700\u8FD1 100 \u6761\uFF09" })
    ] }),
    (reply?.audit || []).length === 0 ? /* @__PURE__ */ jsx4("div", { className: "sl-empty", children: "\u8FD8\u6CA1\u6709\u5199\u64CD\u4F5C\u8BB0\u5F55\u2014\u2014\u6240\u6709\u5199\u5165/\u5907\u4EFD/\u6253\u5F00\u90FD\u4F1A\u7559\u75D5\u5728\u8FD9\u91CC" }) : /* @__PURE__ */ jsx4("div", { className: "sl-card", children: (reply?.audit || []).slice(0, 30).map((a, i) => /* @__PURE__ */ jsxs4("div", { className: "sl-card-b", style: { padding: "7px 13px", borderBottom: "1px solid #1B2029" }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx4("span", { className: `sl-badge ${a.status === "committed" ? "good" : a.status === "failed" ? "bad" : "info"}`, children: a.status }),
        /* @__PURE__ */ jsx4("span", { className: "sl-grow sl-mono", style: { fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: a.sql, children: a.sql }),
        /* @__PURE__ */ jsx4("span", { className: "sl-tag", children: timeAgo(a.at) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sl-sub", style: { marginTop: 2 }, children: [
        a.dbPath,
        a.changes !== null && a.changes !== void 0 ? ` \xB7 \u5F71\u54CD ${a.changes} \u884C` : "",
        a.backupPath ? ` \xB7 \u5907\u4EFD ${a.backupPath}` : "",
        a.error ? ` \xB7 ${a.error}` : ""
      ] })
    ] }, i)) })
  ] });
}

// src/SettingsTab.tsx
import { useCallback as useCallback5, useState as useState5 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function SettingsTab({ reply, meta, onChanged, onError }) {
  const [busy, setBusy] = useState5(false);
  const [newRoot, setNewRoot] = useState5("");
  const [autoBackup, setAutoBackup] = useState5(reply?.settings?.autoBackup ?? true);
  const saveSettings = useCallback5(async (patch) => {
    setBusy(true);
    try {
      await withSvc((m) => svcFetch(m, "/api/settings", { settings: patch }));
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onChanged, onError]);
  const svcOp = useCallback5(async (op) => {
    setBusy(true);
    try {
      await serviceAction(op);
      await new Promise((r) => setTimeout(r, 1200));
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onChanged, onError]);
  const addRoot = useCallback5(async () => {
    const p = newRoot.trim();
    if (!p) return;
    const roots = [...reply?.settings?.radarRoots || []];
    if (!roots.includes(p)) roots.push(p);
    setNewRoot("");
    await saveSettings({ radarRoots: roots });
  }, [newRoot, reply, saveSettings]);
  const removeRoot = useCallback5(async (root) => {
    const roots = (reply?.settings?.radarRoots || []).filter((r) => r !== root);
    await saveSettings({ radarRoots: roots });
  }, [reply, saveSettings]);
  const removeLib = useCallback5(async (dbId) => {
    try {
      await withSvc((m) => svcFetch(m, "/api/libs_remove", { dbId }));
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onChanged, onError]);
  const libs = reply?.libs || [];
  const settings = reply?.settings;
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "sl-bar" }),
      "\u670D\u52A1",
      /* @__PURE__ */ jsx5("span", { className: "sl-hint", children: "127.0.0.1 \u672C\u673A\u76D1\u542C + token\uFF0C\u96F6\u5916\u7F51" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "sl-card", children: /* @__PURE__ */ jsxs5("div", { className: "sl-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx5("span", { className: "k", children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsx5("span", { className: "v", children: meta ? meta.degraded ? `\u26A0 \u964D\u7EA7\uFF1A${meta.degraded}` : `\u8FD0\u884C\u4E2D \xB7 v${meta.version}` : "\u672A\u8FD0\u884C\uFF08\u9762\u677F\u4F1A\u6BCF 5 \u79D2\u63A2\u6D4B\uFF09" })
      ] }),
      meta ? /* @__PURE__ */ jsxs5("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx5("span", { className: "k", children: "\u5730\u5740" }),
        /* @__PURE__ */ jsxs5("span", { className: "v", children: [
          "127.0.0.1:",
          meta.port,
          "\uFF08token \u5DF2\u5165\u5E93\uFF0C\u91CD\u542F\u4E0D\u6362\uFF09"
        ] })
      ] }) : null,
      meta ? /* @__PURE__ */ jsxs5("div", { className: "sl-kv", children: [
        /* @__PURE__ */ jsx5("span", { className: "k", children: "\u5DF2\u8FD0\u884C" }),
        /* @__PURE__ */ jsx5("span", { className: "v", children: timeAgo(meta.startedAt) })
      ] }) : null,
      /* @__PURE__ */ jsxs5("div", { className: "sl-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx5("button", { className: "sl-btn sm", disabled: busy, onClick: () => svcOp("restart"), children: "\u91CD\u542F\u670D\u52A1" }),
        /* @__PURE__ */ jsx5("button", { className: "sl-btn sm", disabled: busy, onClick: () => svcOp("stop"), children: "\u505C\u6B62" }),
        /* @__PURE__ */ jsx5("button", { className: "sl-btn sm", disabled: busy, onClick: () => svcOp("start"), children: "\u542F\u52A8" })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "sl-sub", style: { marginTop: 8 }, children: "\u5F15\u64CE\uFF1Anode:sqlite\uFF08node \u2265 22.5 \u5185\u7F6E\uFF0C\u96F6 npm \u4F9D\u8D56\uFF09\u3002\u6D4F\u89C8\u8FDE\u63A5\u6C38\u4E45\u53EA\u8BFB\uFF1B\u5199\u8D70\u4E24\u6B65\u786E\u8BA4 + \u5199\u524D\u81EA\u52A8\u5907\u4EFD\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "sl-bar" }),
      "\u5B89\u5168\u5F00\u5173"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "sl-card", children: /* @__PURE__ */ jsxs5("div", { className: "sl-card-b", children: [
      /* @__PURE__ */ jsxs5("label", { className: "sl-row", style: { cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx5("input", { type: "checkbox", checked: autoBackup, onChange: (e) => {
          setAutoBackup(e.target.checked);
          saveSettings({ autoBackup: e.target.checked });
        } }),
        /* @__PURE__ */ jsx5("span", { children: "\u5199\u524D\u81EA\u52A8\u6574\u5E93\u5907\u4EFD\uFF08\u6BCF\u4E2A\u6587\u4EF6\u6BCF\u6B21\u670D\u52A1\u751F\u547D\u5468\u671F\u5907\u4E00\u6B21\uFF0C\u5B58\u6570\u636E\u6839 sqlite-lens/backups/\uFF09" })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "sl-sub", style: { marginTop: 6 }, children: "\u5173\u95ED\u540E\u5199\u64CD\u4F5C\u4E0D\u518D\u5148\u5907\u4EFD\u2014\u2014\u9664\u975E\u4F60\u6E05\u695A\u81EA\u5DF1\u5728\u505A\u4EC0\u4E48\uFF0C\u5EFA\u8BAE\u4FDD\u6301\u5F00\u542F\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "sl-bar" }),
      "\u96F7\u8FBE\u6839\u76EE\u5F55",
      /* @__PURE__ */ jsx5("span", { className: "sl-hint", children: "\u5E93\u96F7\u8FBE\u989D\u5916\u626B\u63CF\u7684\u76EE\u5F55" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "sl-card", children: /* @__PURE__ */ jsxs5("div", { className: "sl-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx5("input", { className: "sl-inp sl-grow sl-mono", placeholder: "\u5982 D:\\\\space\\\\projects", value: newRoot, onChange: (e) => setNewRoot(e.target.value) }),
        /* @__PURE__ */ jsx5("button", { className: "sl-btn sm", disabled: busy, onClick: addRoot, children: "\u6DFB\u52A0" })
      ] }),
      (settings?.radarRoots || []).length === 0 ? /* @__PURE__ */ jsx5("div", { className: "sl-sub", style: { marginTop: 6 }, children: "\u672A\u6DFB\u52A0\u2014\u2014\u96F7\u8FBE\u9ED8\u8BA4\u626B\u7528\u6237\u76EE\u5F55/\u4E0B\u8F7D/\u6587\u6863/AppData \u5E38\u89C1\u4F4D\u7F6E" }) : (settings?.radarRoots || []).map((r) => /* @__PURE__ */ jsxs5("div", { className: "sl-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx5("span", { className: "sl-grow sl-mono", style: { fontSize: 11.5 }, children: r }),
        /* @__PURE__ */ jsx5("button", { className: "sl-btn sm", onClick: () => removeRoot(r), children: "\u79FB\u9664" })
      ] }, r))
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "sl-bar" }),
      "\u5DF2\u6253\u5F00\u7684\u5E93",
      /* @__PURE__ */ jsxs5("span", { className: "sl-hint", children: [
        libs.length,
        " \u4E2A\uFF08\u8DE8\u7AEF\u5171\u4EAB\u6E05\u5355\uFF09"
      ] })
    ] }),
    libs.length === 0 ? /* @__PURE__ */ jsx5("div", { className: "sl-empty", children: "\u6682\u65E0" }) : libs.map((l) => /* @__PURE__ */ jsx5("div", { className: "sl-card", children: /* @__PURE__ */ jsx5("div", { className: "sl-card-b", children: /* @__PURE__ */ jsxs5("div", { className: "sl-row", children: [
      /* @__PURE__ */ jsxs5("span", { className: "sl-grow", style: { overflow: "hidden" }, children: [
        /* @__PURE__ */ jsx5("div", { className: "sl-mono", style: { fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: l.path, children: l.path }),
        /* @__PURE__ */ jsxs5("div", { className: "sl-sub", children: [
          fmtBytes(l.sizeBytes),
          " \xB7 ",
          l.tables.length,
          " \u8868 \xB7 \u6700\u8FD1\u6253\u5F00 ",
          timeAgo(l.lastOpenedAt),
          l.knownAs ? ` \xB7 ${l.knownAs}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx5("button", { className: "sl-btn sm", onClick: () => removeLib(l.dbId), children: "\u4ECE\u6E05\u5355\u79FB\u9664" })
    ] }) }) }, l.dbId)),
    /* @__PURE__ */ jsxs5("div", { className: "sl-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "sl-bar" }),
      "\u952E\u7A7A\u95F4\u5951\u7EA6"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "sl-card", children: /* @__PURE__ */ jsxs5("div", { className: "sl-card-b sl-sub", children: [
      "cap.kv \u524D\u7F00 ",
      /* @__PURE__ */ jsx5("code", { children: "sqltl." }),
      "\uFF1Ameta\uFF08\u5FC3\u8DF3/\u7AEF\u53E3/token\uFF09/ settings / libs\uFF08\u6E05\u5355\uFF09/ qhist\uFF08\u67E5\u8BE2\u5386\u53F2 50\uFF09/ audit\uFF08\u5199\u5BA1\u8BA1 100\uFF09/ pending.*\uFF08\u4E24\u6B65\u5199\u5F85\u786E\u8BA4\u5355\uFF0C10 \u5206\u949F TTL\uFF0C\u8FC7\u671F\u6E05\u626B\uFF09\u3002\u670D\u52A1\u662F\u8FD9\u4E9B\u952E\u7684\u552F\u4E00\u5199\u8005\uFF1B\u9762\u677F\u4E0E MCP \u53EA\u8BFB meta \u5E76\u8C03\u670D\u52A1 HTTP\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.sl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sl-body::-webkit-scrollbar{width:9px;height:9px}
.sl-body::-webkit-scrollbar-track{background:transparent}
.sl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.sl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.sl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4493F8,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.sl-tt{flex:1;min-width:0}
.sl-tt b{font-size:15px;display:block}
.sl-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.sl-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.sl-dot.stale{background:#D29922}
.sl-dot.down{background:#F85149}
.sl-tabs{display:flex;gap:4px;overflow-x:auto;max-width:60%}
.sl-tabs::-webkit-scrollbar{display:none}
.sl-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative;white-space:nowrap;flex-shrink:0}
.sl-tab:hover{color:#E6EAF2}
.sl-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sl-tab .sl-pend{position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:#F85149}

.sl-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sl-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#4493F8,#3FB950);flex-shrink:0}
.sl-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sl-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sl-card-b{padding:11px 13px}
.sl-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.sl-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.sl-badge{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.sl-badge.warn{background:rgba(210,153,34,.12);color:#D29922;border-color:#5a4316}
.sl-badge.bad{background:rgba(248,81,73,.1);color:#F85149;border-color:#54262c}
.sl-badge.good{background:rgba(63,185,80,.1);color:#3FB950;border-color:#2a5a38}
.sl-badge.info{background:rgba(68,147,248,.12);color:#4493F8;border-color:#274a77}

.sl-btn{background:#1C2330;border:1px solid #2A3244;color:#E6EAF2;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;transition:background .15s}
.sl-btn:hover{background:#232B3B}
.sl-btn:disabled{opacity:.45;cursor:not-allowed}
.sl-btn.primary{background:linear-gradient(135deg,#275A9E,#1F6F45);border-color:#2F5F8F}
.sl-btn.primary:hover{filter:brightness(1.12)}
.sl-btn.danger{background:rgba(248,81,73,.12);border-color:#54262c;color:#F85149}
.sl-btn.sm{padding:3px 9px;font-size:11px;border-radius:6px}

.sl-inp{background:#0F131A;border:1px solid #242C3A;border-radius:8px;color:#E6EAF2;padding:6px 10px;font-size:12px;outline:none;width:100%}
.sl-inp:focus{border-color:#31608F}
.sl-inp.mono{font-family:ui-monospace,Consolas,monospace}
textarea.sl-inp{resize:vertical;min-height:110px;line-height:1.5}

.sl-empty{padding:26px 16px;text-align:center;color:#5C6678;font-size:12px}
.sl-err{background:rgba(248,81,73,.08);border:1px solid #54262c;color:#F85149;border-radius:9px;padding:8px 12px;font-size:12px;margin:0 16px 10px;word-break:break-all}

.sl-row{display:flex;align-items:center;gap:8px;min-width:0}
.sl-grow{flex:1;min-width:0}
.sl-lib-pick{display:flex;gap:6px;align-items:center;padding:0 16px 8px;flex-wrap:wrap}
.sl-pill{background:#1C2330;border:1px solid #242C3A;border-radius:20px;padding:3px 11px;font-size:11px;cursor:pointer;color:#8B95A7;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.sl-pill.on{border-color:#31608F;color:#E6EAF2;background:#16283C}
.sl-grid{width:100%;border-collapse:collapse;font-size:11.5px;font-family:ui-monospace,Consolas,monospace}
.sl-grid th{position:sticky;top:0;background:#141922;color:#8B95A7;text-align:left;padding:6px 9px;border-bottom:1px solid #242C3A;cursor:pointer;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.sl-grid td{padding:5px 9px;border-bottom:1px solid #1B2029;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C9D1D9}
.sl-grid tr:hover td{background:#171E2A}
.sl-null{color:#4A5262;font-style:italic}
.sl-blob{color:#BC8CFF;font-size:10px}
.sl-trunc{color:#D29922;font-size:9.5px;margin-left:4px}
.sl-pend-banner{margin:0 16px 10px;background:rgba(210,153,34,.07);border:1px solid #5a4316;border-radius:11px;padding:10px 12px}
.sl-pend-banner b{color:#D29922}
.sl-kv{display:flex;gap:8px;font-size:11.5px;padding:3px 0;align-items:baseline}
.sl-kv .k{color:#8B95A7;flex-shrink:0;min-width:88px}
.sl-kv .v{color:#C9D1D9;word-break:break-all;font-family:ui-monospace,Consolas,monospace}
.sl-mono{font-family:ui-monospace,Consolas,monospace}
`;
function SqliteLensPanel(_props) {
  const [tab, setTab] = useState6("radar");
  const [meta, setMeta] = useState6(null);
  const [reply, setReply] = useState6(null);
  const [bootErr, setBootErr] = useState6("");
  const [starting, setStarting] = useState6(false);
  const visibleRef = useRef(true);
  const refresh = useCallback6(async () => {
    try {
      const m = await loadMeta();
      setMeta(m);
      if (m) {
        const r = await svcFetch(m, "/api/meta");
        if (r && r.ok) {
          setReply(r);
          setBootErr("");
        } else setBootErr(r && r.error ? r.error : "meta \u8FD4\u56DE\u5F02\u5E38");
      }
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect4(() => {
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => {
      if (visibleRef.current) refresh();
    }, 5e3);
    refresh();
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  const startService = useCallback6(async () => {
    setStarting(true);
    try {
      await serviceAction("start");
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [refresh]);
  const confirmPending = useCallback6(async (p, decision) => {
    try {
      await withSvc((m) => svcFetch(m, "/api/confirm", { pendingId: p.id, decision }));
      await refresh();
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);
  const libs = reply?.libs || [];
  const pendings = reply?.pendingList || [];
  const svcUp = !!meta;
  const degraded = meta?.degraded || reply?.degraded || null;
  return /* @__PURE__ */ jsxs6("div", { className: "sl-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "sl-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "sl-logo", children: "\u{1F9EA}" }),
      /* @__PURE__ */ jsxs6("div", { className: "sl-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "SQLite \u68C0\u67E5\u53F0" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          /* @__PURE__ */ jsx6("span", { className: `sl-dot ${svcUp ? degraded ? "stale" : "ok" : "down"}` }),
          svcUp ? degraded ? `\u5F15\u64CE\u964D\u7EA7\uFF1A${degraded.slice(0, 60)}` : `\u670D\u52A1 ${meta?.version} \xB7 127.0.0.1:${meta?.port}` : "\u670D\u52A1\u672A\u8FD0\u884C",
          libs.length ? ` \xB7 ${libs.length} \u4E2A\u5E93` : ""
        ] })
      ] }),
      !svcUp && /* @__PURE__ */ jsx6("button", { className: "sl-btn primary", disabled: starting, onClick: startService, children: starting ? "\u542F\u52A8\u4E2D\u2026" : "\u542F\u52A8\u670D\u52A1" }),
      /* @__PURE__ */ jsx6("div", { className: "sl-tabs", children: [["radar", "\u5E93\u96F7\u8FBE"], ["browse", "\u6570\u636E\u6D4F\u89C8"], ["query", "SQL \u67E5\u8BE2"], ["maintain", "\u7EF4\u62A4"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsxs6("button", { className: `sl-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "maintain" && pendings.length ? /* @__PURE__ */ jsx6("span", { className: "sl-pend" }) : null
      ] }, k)) })
    ] }),
    bootErr ? /* @__PURE__ */ jsx6("div", { className: "sl-err", children: bootErr }) : null,
    pendings.map((p) => /* @__PURE__ */ jsxs6("div", { className: "sl-pend-banner", children: [
      /* @__PURE__ */ jsxs6("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u26A0 \u5F85\u786E\u8BA4\u5199" }),
        /* @__PURE__ */ jsx6("span", { className: "sl-badge warn", children: p.preview.head }),
        /* @__PURE__ */ jsx6("span", { className: "sl-grow sl-sub sl-mono", style: { overflow: "hidden", textOverflow: "ellipsis" }, title: p.sql, children: p.sql })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "sl-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs6("span", { className: "sl-sub sl-grow", children: [
          p.file ? p.file.split(/[\\/]/).pop() : p.dbId,
          " \xB7 \u5F71\u54CD ",
          p.preview.changes === null ? "\u2014" : `${p.preview.changes} \u884C`,
          " \xB7 ",
          timeAgo(p.createdAt)
        ] }),
        /* @__PURE__ */ jsx6("button", { className: "sl-btn danger sm", onClick: () => confirmPending(p, "cancel"), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx6("button", { className: "sl-btn primary sm", onClick: () => confirmPending(p, "commit"), children: "\u786E\u8BA4\u63D0\u4EA4" })
      ] })
    ] }, p.id)),
    /* @__PURE__ */ jsxs6("div", { className: "sl-body", children: [
      tab === "radar" && /* @__PURE__ */ jsx6(RadarTab, { onOpened: () => {
        setTab("browse");
        refresh();
      } }),
      tab === "browse" && /* @__PURE__ */ jsx6(BrowseTab, { libs, reply, onChanged: refresh }),
      tab === "query" && /* @__PURE__ */ jsx6(QueryTab, { libs, reply, onChanged: refresh }),
      tab === "maintain" && /* @__PURE__ */ jsx6(MaintainTab, { libs, reply, onChanged: refresh, onGoto: (t) => setTab(t) }),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { reply, meta, onChanged: refresh, onError: setBootErr })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function SqliteLensEntry(props) {
  return /* @__PURE__ */ jsx7(SqliteLensPanel, { ...props });
}
export {
  SqliteLensEntry as default
};
