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

// shared/sandbox-core.js
var require_sandbox_core = __commonJS({
  "shared/sandbox-core.js"(exports, module) {
    "use strict";
    var TTL_MS = 24 * 60 * 60 * 1e3;
    var OUTPUT_TAIL = 8 * 1024;
    var EXEC_TIMEOUT_MIN_SEC = 1;
    var EXEC_TIMEOUT_MAX_SEC = 120;
    var KV_PREFIX2 = "execsandbox.ws.";
    var TMP_ROOT_NAME = "polaris-exec-sandbox";
    function makeWorkspaceId(now) {
      return "ws" + (now || Date.now()).toString(36) + Math.random().toString(36).slice(2, 8);
    }
    function isInsideRoot(rootAbs, targetAbs) {
      const r = String(rootAbs || "");
      const t = String(targetAbs || "");
      if (!r || !t) return false;
      if (t === r) return true;
      const sep = t.includes("\\") ? "\\" : "/";
      return t.startsWith(r + sep);
    }
    function toTs(v) {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    function normalizeWorkspace2(raw) {
      if (!raw || typeof raw !== "object") return null;
      const workspaceId = typeof raw.workspaceId === "string" && raw.workspaceId ? raw.workspaceId : null;
      if (!workspaceId) return null;
      const dir = typeof raw.dir === "string" ? raw.dir : "";
      return {
        v: 1,
        workspaceId,
        label: typeof raw.label === "string" ? raw.label.slice(0, 100) : "",
        dir,
        createdAt: toTs(raw.createdAt) || 0,
        expiresAt: toTs(raw.expiresAt) || 0,
        lastActivityAt: toTs(raw.lastActivityAt) || 0
      };
    }
    function wsKey2(workspaceId) {
      return KV_PREFIX2 + workspaceId;
    }
    function isExpired2(meta, now) {
      if (!meta || !meta.expiresAt) return false;
      return meta.expiresAt <= (now || Date.now());
    }
    function newWorkspaceMeta(workspaceId, dir, label, now, ttlMs) {
      const t = now || Date.now();
      return {
        v: 1,
        workspaceId,
        label: String(label || "").slice(0, 100),
        dir,
        createdAt: t,
        expiresAt: t + (ttlMs || TTL_MS),
        lastActivityAt: t
      };
    }
    function touchMeta(meta, now) {
      return { ...meta, lastActivityAt: now || Date.now() };
    }
    function tailBytes(s, cap) {
      const t = String(s == null ? "" : s);
      if (t.length <= cap) return t;
      return "\u2026" + t.slice(t.length - (cap - 1));
    }
    function clampTimeoutSec(sec) {
      const n = Number(sec);
      if (!Number.isFinite(n)) return 120 * 1e3;
      return Math.min(EXEC_TIMEOUT_MAX_SEC, Math.max(EXEC_TIMEOUT_MIN_SEC, Math.round(n))) * 1e3;
    }
    function requireConfirm(args) {
      return Boolean(args && args.confirm === true);
    }
    module.exports = {
      TTL_MS,
      OUTPUT_TAIL,
      EXEC_TIMEOUT_MIN_SEC,
      EXEC_TIMEOUT_MAX_SEC,
      KV_PREFIX: KV_PREFIX2,
      TMP_ROOT_NAME,
      makeWorkspaceId,
      isInsideRoot,
      normalizeWorkspace: normalizeWorkspace2,
      wsKey: wsKey2,
      isExpired: isExpired2,
      newWorkspaceMeta,
      touchMeta,
      tailBytes,
      clampTimeoutSec,
      requireConfirm
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_sandbox_core());
import { useCallback, useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
async function hostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return fn;
}
async function kvGet(key) {
  const invoke = await hostInvoke();
  const res = await invoke(
    "router_dispatch",
    { req: { target: "cap.kv", payload: { action: "get", key } } }
  );
  if (!res.ok) throw new Error(res.error || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res.result?.value ?? null;
}
async function kvKeys() {
  const invoke = await hostInvoke();
  const res = await invoke(
    "router_dispatch",
    { req: { target: "cap.kv", payload: { action: "list" } } }
  );
  if (!res.ok) throw new Error(res.error || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res.result?.keys ?? [];
}
async function kvDel(key) {
  const invoke = await hostInvoke();
  const res = await invoke(
    "router_dispatch",
    { req: { target: "cap.kv", payload: { action: "delete", key } } }
  );
  if (!res.ok) throw new Error(res.error || "cap.kv \u8C03\u7528\u5931\u8D25");
}
async function loadRows() {
  const keys = await kvKeys();
  const rows = [];
  const now = Date.now();
  for (const k of keys) {
    if (!k.startsWith(core.KV_PREFIX)) continue;
    const meta = core.normalizeWorkspace(await kvGet(k));
    if (meta) rows.push({ ...meta, dirExists: !core.isExpired(meta, now) });
  }
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}
function fmtTs(ts) {
  if (!ts) return "\u2014";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ") + "Z";
}
function timeLeft(expiresAt) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "\u5DF2\u8FC7\u671F";
  const h = Math.floor(ms / 36e5);
  const m = Math.floor(ms % 36e5 / 6e4);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}
var CSS = `
.es-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.es-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.es-head b{font-size:13px}
.es-head .sub{color:#5C6678;font-size:11px}
.es-refresh{margin-left:auto;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer}
.es-body{flex:1;overflow:auto;padding:6px 10px}
.es-tbl{width:100%;border-collapse:collapse;font-size:12px}
.es-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:7px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.es-tbl td{padding:8px 10px;border-bottom:1px solid #161c2a;vertical-align:top}
.es-tbl tr:last-child td{border-bottom:none}
.es-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.es-id{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#9f9aF0}
.es-label{color:#8B94A9;font-size:10.5px;margin-top:2px}
.es-empty{color:#5C6678;padding:24px 10px;text-align:center;font-size:12px}
.es-btn{background:#3d2b2b;border:1px solid #6b3a3a;color:#f1a5a5;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer}
.es-btn:hover{background:#4d3434}
.es-about{font-size:11.5px;color:#8B94A9;line-height:1.7;padding:12px 10px;border-top:1px solid #1c2333}
.es-about b{color:#E6E9F2}
.es-toast{position:absolute;right:12px;bottom:12px;background:#252a36;border:1px solid #3a4358;border-radius:8px;padding:8px 14px;font-size:12px;color:#E6E9F2;box-shadow:0 4px 16px rgba(0,0,0,.4)}
`;
function ExecSandboxPanel(_props) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const toastFn = useCallback((text) => {
    setToast(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const refresh = useCallback(() => {
    setError(null);
    loadRows().then((r) => setRows(r)).catch((e) => setError(e.message || String(e)));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const destroy = useCallback(async (row) => {
    if (!window.confirm(`\u9500\u6BC1\u5DE5\u4F5C\u533A ${row.workspaceId}\uFF1F\uFF08\u76EE\u5F55\u9012\u5F52\u5220\u9664\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09`)) return;
    setBusy(row.workspaceId);
    try {
      await kvDel(core.wsKey(row.workspaceId));
      toastFn(`\u5DF2\u6E05\u9664 ${row.workspaceId} \u5143\u6570\u636E\uFF08\u76EE\u5F55\u5220\u9664\u53EF\u7ECF MCP execsandbox_destroy\uFF09`);
      refresh();
    } catch (e) {
      toastFn(`\u9500\u6BC1\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [refresh, toastFn]);
  return /* @__PURE__ */ jsxs("div", { className: "es-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "es-head", children: [
      /* @__PURE__ */ jsx("b", { children: "\u6267\u884C\u6C99\u7BB1" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "AI \u4EE3\u7801\u6267\u884C\u7684\u4E00\u6B21\u6027\u9694\u79BB\u5DE5\u4F5C\u533A\uFF0824h \u81EA\u52A8\u8FC7\u671F\uFF09" }),
      /* @__PURE__ */ jsx("button", { className: "es-refresh", onClick: refresh, children: "\u5237\u65B0" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "es-body", children: [
      error && /* @__PURE__ */ jsxs("div", { className: "es-empty", children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        error
      ] }),
      !error && rows && rows.length === 0 && /* @__PURE__ */ jsxs("div", { className: "es-empty", children: [
        "\u6682\u65E0\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "AI \u4F1A\u8BDD\u4E2D\u8BF4\u300C\u7ED9\u6211\u4E00\u4E2A\u9694\u79BB\u5DE5\u4F5C\u533A\u8DD1\u6BB5\u4EE3\u7801\u300D\u5373\u4F1A\u521B\u5EFA\u3002"
      ] }),
      !error && rows && rows.length > 0 && /* @__PURE__ */ jsxs("table", { className: "es-tbl", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "\u5DE5\u4F5C\u533A" }),
          /* @__PURE__ */ jsx("th", { children: "\u521B\u5EFA\u65F6\u95F4" }),
          /* @__PURE__ */ jsx("th", { className: "num", children: "\u5269\u4F59" }),
          /* @__PURE__ */ jsx("th", { children: "\u76EE\u5F55\u72B6\u6001" }),
          /* @__PURE__ */ jsx("th", {})
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: rows.map((r) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsxs("td", { children: [
            /* @__PURE__ */ jsx("span", { className: "es-id", children: r.workspaceId }),
            r.label && /* @__PURE__ */ jsx("div", { className: "es-label", children: r.label })
          ] }),
          /* @__PURE__ */ jsx("td", { children: fmtTs(r.createdAt) }),
          /* @__PURE__ */ jsx("td", { className: "num", children: timeLeft(r.expiresAt) }),
          /* @__PURE__ */ jsx("td", { children: r.dirExists ? "\u6D3B\u8DC3" : "\u5DF2\u8FC7\u671F\uFF08\u5F85\u60F0\u6027\u6E05\u7406\uFF09" }),
          /* @__PURE__ */ jsx("td", { className: "num", children: /* @__PURE__ */ jsx("button", { className: "es-btn", disabled: busy === r.workspaceId, onClick: () => destroy(r), children: busy === r.workspaceId ? "\u9500\u6BC1\u4E2D\u2026" : "\u9500\u6BC1" }) })
        ] }, r.workspaceId)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "es-about", children: [
      /* @__PURE__ */ jsx("b", { children: "\u9694\u79BB\u8BED\u4E49\uFF08\u5982\u5B9E\uFF09" }),
      "\uFF1A\u76EE\u5F55\u9694\u79BB + 24h TTL + \u6839\u8FB9\u754C\u6821\u9A8C + exec/destroy \u53CC\u786E\u8BA4\u95F8\uFF1B",
      /* @__PURE__ */ jsx("b", { children: "\u975E\u8FDB\u7A0B\u7EA7\u6C99\u7BB1" }),
      "\uFF08exec \u4E0E\u5BBF\u4E3B\u540C\u6743\u9650\u7EA7\uFF09\u3002 \u6587\u4EF6\u843D\u7CFB\u7EDF\u4E34\u65F6\u76EE\u5F55\uFF0C\u9500\u6BC1\u5373\u5220\uFF1B\u9762\u677F\u9500\u6BC1\u53EA\u6E05\u5143\u6570\u636E\uFF0C\u5F7B\u5E95\u5220\u76EE\u5F55\u8BF7\u8BA9 AI \u8C03 ",
      /* @__PURE__ */ jsx("b", { children: "execsandbox_destroy" }),
      "\uFF08confirm \u53CC\u95F8\uFF09\u3002"
    ] }),
    toast && /* @__PURE__ */ jsx("div", { className: "es-toast", children: toast })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function ExecSandboxEntry(props) {
  return /* @__PURE__ */ jsx2(ExecSandboxPanel, { ...props });
}
export {
  ExecSandboxEntry as default
};
