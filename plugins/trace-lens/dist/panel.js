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
    var CHUNK_SIZE = 20;
    var RING_LIMIT = 60;
    var TRACE_FULL_KV_LIMIT = 12;
    var KINDS = ["unspecified", "internal", "server", "client", "producer", "consumer"];
    function nanoToMs(nano) {
      if (nano === null || nano === void 0 || nano === "") return null;
      try {
        const b = BigInt(nano);
        if (b < 0n) return null;
        return Number(b / 1000000n);
      } catch (_) {
        return null;
      }
    }
    function attrValueToString(v) {
      if (!v || typeof v !== "object") return v === void 0 || v === null ? "" : String(v);
      if ("stringValue" in v) return String(v.stringValue);
      if ("intValue" in v) return String(v.intValue);
      if ("doubleValue" in v) return String(v.doubleValue);
      if ("boolValue" in v) return v.boolValue ? "true" : "false";
      if ("bytesValue" in v) return `<bytes ${String(v.bytesValue).length}b>`;
      if ("arrayValue" in v && v.arrayValue && Array.isArray(v.arrayValue.values)) {
        return `[${v.arrayValue.values.map(attrValueToString).join(", ")}]`;
      }
      if ("kvlistValue" in v && v.kvlistValue && Array.isArray(v.kvlistValue.values)) {
        const inner = normalizeAttributes(v.kvlistValue.values);
        return `{${Object.keys(inner).map((k) => `${k}=${inner[k]}`).join(", ")}}`;
      }
      return "";
    }
    function normalizeAttributes(arr) {
      const out = {};
      if (!Array.isArray(arr)) return out;
      for (const a of arr) {
        if (!a || typeof a.key !== "string" || !a.key) continue;
        out[a.key] = attrValueToString(a.value);
      }
      return out;
    }
    function kindOf(raw) {
      if (typeof raw === "number" && KINDS[raw]) return KINDS[raw];
      const s = String(raw || "").trim().toUpperCase().replace(/^SPAN_KIND_/, "");
      return KINDS.includes(s.toLowerCase()) ? s.toLowerCase() : "unspecified";
    }
    function statusOf(raw) {
      if (raw && typeof raw === "object") {
        let code = raw.code;
        if (typeof code === "number") code = code === 2 ? "error" : code === 1 ? "ok" : "unset";
        else {
          const s2 = String(code || "").trim().toUpperCase().replace(/^STATUS_CODE_/, "");
          code = s2 === "ERROR" ? "error" : s2 === "OK" ? "ok" : "unset";
        }
        return { code, message: typeof raw.message === "string" ? raw.message : "" };
      }
      if (typeof raw === "number") return { code: raw === 2 ? "error" : raw === 1 ? "ok" : "unset", message: "" };
      const s = String(raw || "").trim().toUpperCase().replace(/^STATUS_CODE_/, "");
      return { code: s === "ERROR" ? "error" : s === "OK" ? "ok" : "unset", message: "" };
    }
    function normalizeOtlpRequest(body, opts) {
      const decodeId = opts && opts.decodeId || ((id) => id);
      const spans = [];
      let dropped = 0;
      if (!body || typeof body !== "object" || !Array.isArray(body.resourceSpans)) {
        return { spans, dropped: 0, error: "\u7F3A\u5C11 resourceSpans \u6570\u7EC4\uFF08\u975E OTLP traces JSON\uFF09" };
      }
      for (const rs of body.resourceSpans) {
        if (!rs || typeof rs !== "object") {
          dropped += 1;
          continue;
        }
        const resAttrs = normalizeAttributes(rs.resource && rs.resource.attributes);
        const service = resAttrs["service.name"] || "unknown";
        const scopeSpans = Array.isArray(rs.scopeSpans) ? rs.scopeSpans : Array.isArray(rs.instrumentationLibrarySpans) ? rs.instrumentationLibrarySpans : [];
        for (const ss of scopeSpans) {
          const list = ss && Array.isArray(ss.spans) ? ss.spans : [];
          for (const raw of list) {
            const span = normalizeSpan(raw, service, resAttrs, decodeId);
            if (span) spans.push(span);
            else dropped += 1;
          }
        }
      }
      return { spans, dropped, error: "" };
    }
    function normalizeSpan(raw, service, resAttrs, decodeId) {
      if (!raw || typeof raw !== "object") return null;
      const traceId = decodeId(String(raw.traceId || ""), 16).toLowerCase();
      const spanId = decodeId(String(raw.spanId || ""), 8).toLowerCase();
      const parentSpanId = decodeId(String(raw.parentSpanId || ""), 8).toLowerCase();
      const startMs = nanoToMs(raw.startTimeUnixNano);
      const endMs = nanoToMs(raw.endTimeUnixNano);
      if (!traceId || !spanId || startMs === null || endMs === null || endMs < startMs) return null;
      const st = statusOf(raw.status);
      const attrs = { ...normalizeAttributes(raw.attributes) };
      for (const k of Object.keys(resAttrs)) {
        if (!(k in attrs)) attrs[`res.${k}`] = resAttrs[k];
      }
      const events = (Array.isArray(raw.events) ? raw.events : []).map((ev) => ({
        at: nanoToMs(ev && ev.timeUnixNano) || startMs,
        name: String(ev && ev.name || ""),
        attrs: normalizeAttributes(ev && ev.attributes)
      })).filter((ev) => ev.name);
      const durationMs = endMs - startMs;
      return {
        traceId,
        spanId,
        parentSpanId,
        name: String(raw.name || "(unnamed)"),
        kind: kindOf(raw.kind),
        service: String(service || "unknown"),
        startMs,
        endMs,
        durationMs,
        status: st,
        attrs,
        events
      };
    }
    function buildTrace2(spans) {
      const byId = {};
      const children = {};
      const roots = [];
      let orphanCount = 0;
      const list = (spans || []).slice().sort((a, b) => a.startMs - b.startMs || String(a.spanId).localeCompare(String(b.spanId)));
      for (const s of list) byId[s.spanId] = s;
      for (const s of list) {
        const parent = s.parentSpanId ? byId[s.parentSpanId] : null;
        if (parent && parent !== s) {
          (children[parent.spanId] = children[parent.spanId] || []).push(s);
        } else {
          if (s.parentSpanId) orphanCount += 1;
          roots.push(s);
        }
      }
      const ordered = [];
      const depthBySpanId = {};
      const walk = (s, depth) => {
        ordered.push(s);
        depthBySpanId[s.spanId] = depth;
        const kids = (children[s.spanId] || []).slice().sort((a, b) => a.startMs - b.startMs);
        for (const k of kids) walk(k, depth + 1);
      };
      for (const r of roots) walk(r, 0);
      return { ordered, depthBySpanId, rootCount: roots.length, orphanCount };
    }
    function traceEnvelope2(spans) {
      let base = Infinity;
      let end = 0;
      for (const s of spans) {
        if (s.startMs < base) base = s.startMs;
        if (s.endMs > end) end = s.endMs;
      }
      if (!Number.isFinite(base)) return { base: 0, end: 0, durationMs: 0 };
      return { base, end, durationMs: Math.max(0, end - base) };
    }
    function traceSummary(traceId, spans, extra) {
      const { ordered } = buildTrace2(spans);
      const env = traceEnvelope2(spans);
      const services = [];
      for (const s of ordered) {
        if (!services.includes(s.service)) services.push(s.service);
        if (services.length >= 4) break;
      }
      const root = ordered[0] || null;
      const errCount = spans.filter((s) => s.status.code === "error").length;
      return {
        traceId: String(traceId || ""),
        rootName: root ? root.name : "(unknown)",
        rootService: root ? root.service : services[0] || "unknown",
        spanCount: spans.length,
        durationMs: env.durationMs,
        hasError: errCount > 0,
        errCount,
        startedAt: env.base,
        services,
        ...extra || {}
      };
    }
    function waterfallLayout2(ordered, depthBySpanId) {
      const env = traceEnvelope2(ordered);
      const total = env.durationMs || 1;
      return ordered.map((s) => ({
        spanId: s.spanId,
        depth: depthBySpanId[s.spanId] || 0,
        offsetPct: (s.startMs - env.base) / total * 100,
        widthPct: Math.max(s.durationMs / total * 100, 0.75),
        isRoot: s.spanId === (ordered[0] && ordered[0].spanId)
      }));
    }
    function formatDuration2(ms) {
      const v = Number(ms) || 0;
      if (v < 1) return `${(v * 1e3).toFixed(0)}\u03BCs`;
      if (v < 1e3) return `${v % 1 === 0 ? v : v.toFixed(1)}ms`;
      if (v < 6e4) return `${(v / 1e3).toFixed(v < 1e4 ? 2 : 1)}s`;
      const m = Math.floor(v / 6e4);
      const s = Math.round(v % 6e4 / 1e3);
      return `${m}m${String(s).padStart(2, "0")}s`;
    }
    function fmtTime(ms) {
      if (!ms) return "-";
      return new Date(ms).toISOString().replace("T", " ").slice(0, 23);
    }
    function matchSpan(span, qLower) {
      if (span.name.toLowerCase().includes(qLower)) return true;
      if (span.service.toLowerCase().includes(qLower)) return true;
      for (const k of Object.keys(span.attrs)) {
        if (k.toLowerCase().includes(qLower) || String(span.attrs[k]).toLowerCase().includes(qLower)) return true;
      }
      for (const ev of span.events) {
        if (ev.name.toLowerCase().includes(qLower)) return true;
      }
      return false;
    }
    function matchTrace(spans, opts) {
      const o = opts || {};
      if (o.hasError && !spans.some((s) => s.status.code === "error")) return false;
      if (o.slowerThanMs) {
        const env = traceEnvelope2(spans);
        if (env.durationMs < o.slowerThanMs) return false;
      }
      const q = String(o.q || "").trim().toLowerCase();
      if (!q) return true;
      return spans.some((s) => matchSpan(s, q));
    }
    function spanLine(s, depth, env) {
      const pad = "  ".repeat(depth);
      const branch = depth > 0 ? "\u2514 " : "";
      const kindTag = s.kind === "unspecified" ? "" : `[${s.kind.toUpperCase()}] `;
      const err = s.status.code === "error" ? `  \u2A2F ${s.status.message || "error"}` : "";
      const slow = env.durationMs > 0 && s.durationMs >= env.durationMs * 0.5 && s.durationMs >= 50 ? "  \u26A0 \u6162" : "";
      const off = `+${formatDuration2(s.startMs - env.base)}`;
      return `${pad}${branch}${kindTag}${s.name}  ${s.service}  ${off} / ${formatDuration2(s.durationMs)}${err}${slow}`;
    }
    function traceDetailText(traceId, spans) {
      const { ordered, depthBySpanId } = buildTrace2(spans);
      const env = traceEnvelope2(spans);
      const sum = traceSummary(traceId, spans);
      const head = [
        `trace ${traceId.slice(0, 16)}${traceId.length > 16 ? "\u2026" : ""}  root=${sum.rootName}  \u670D\u52A1 ${sum.rootService}`,
        `${sum.spanCount} spans  \u5168\u94FE ${formatDuration2(env.durationMs)}  \u5F00\u59CB ${fmtTime(env.base)}${sum.hasError ? `  \u2A2F ${sum.errCount} \u4E2A\u9519\u8BEF span` : ""}${sum.services.length > 1 ? `  \u8DE8\u670D\u52A1 ${sum.services.join("\u2192")}` : ""}`,
        ""
      ];
      const tree = ordered.map((s) => spanLine(s, depthBySpanId[s.spanId], env));
      const errSpans = ordered.filter((s) => s.status.code === "error");
      const errBlock = [];
      for (const s of errSpans.slice(0, 5)) {
        errBlock.push("", `\u2A2F ${s.name}\uFF08${s.kind}\uFF0C${formatDuration2(s.durationMs)}\uFF09`, `    ${s.status.message || "\uFF08\u65E0\u9519\u8BEF\u6D88\u606F\uFF09"}`);
        const pairs = Object.keys(s.attrs).slice(0, 12).map((k) => `${k}=${oneLine(s.attrs[k], 120)}`);
        if (pairs.length) errBlock.push(`    \u5C5E\u6027: ${pairs.join("  ")}`);
        for (const ev of s.events.slice(0, 5)) {
          const evPairs = Object.keys(ev.attrs).map((k) => `${k}=${oneLine(ev.attrs[k], 120)}`).join("  ");
          errBlock.push(`    \u4E8B\u4EF6 ${ev.name}${evPairs ? `: ${evPairs}` : ""}`);
        }
      }
      const root = ordered[0];
      let rootBlock = [];
      if (root) {
        const pairs = Object.keys(root.attrs).filter((k) => !k.startsWith("res.")).slice(0, 15).map((k) => `${k}=${oneLine(root.attrs[k], 100)}`);
        if (pairs.length) rootBlock = ["", `\u6839\u5C5E\u6027: ${pairs.join("  ")}`];
      }
      return head.concat(tree, rootBlock, errBlock).join("\n");
    }
    function oneLine(s, n) {
      const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      return t.length > n ? `${t.slice(0, n)}\u2026` : t;
    }
    function summarizeTrace(sum) {
      const err = sum.hasError ? `  \u2A2F${sum.errCount}` : "";
      return `${fmtTime(sum.startedAt)}  ${sum.rootName}\uFF08${sum.rootService}\uFF09  ${sum.spanCount}spans ${formatDuration2(sum.durationMs)}${err}  id=${sum.traceId.slice(0, 12)}`;
    }
    function parseJsonlLine(line) {
      const t = String(line || "").trim();
      if (!t) return null;
      try {
        const o = JSON.parse(t);
        return o && typeof o === "object" ? o : null;
      } catch (_) {
        return null;
      }
    }
    function planChunkWrites(ring, prevChunkCount) {
      const plan = [];
      const nowChunks = Math.ceil(ring.length / CHUNK_SIZE);
      for (let i = 0; i < nowChunks; i++) {
        plan.push({ key: `tl.rec.${i}`, value: ring.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
      }
      for (let i = nowChunks; i < (prevChunkCount || 0); i++) {
        plan.push({ key: `tl.rec.${i}`, value: null });
      }
      return plan;
    }
    function readRing(map) {
      const keys = Object.keys(map).filter((k) => /^tl\.rec\.\d+$/.test(k)).sort((a, b) => Number(b.split(".")[2]) - Number(a.split(".")[2]));
      const out = [];
      for (const k of keys) {
        if (Array.isArray(map[k])) out.push(...map[k]);
      }
      return out;
    }
    module.exports = {
      CHUNK_SIZE,
      RING_LIMIT,
      TRACE_FULL_KV_LIMIT,
      KINDS,
      nanoToMs,
      attrValueToString,
      normalizeAttributes,
      kindOf,
      statusOf,
      normalizeOtlpRequest,
      normalizeSpan,
      buildTrace: buildTrace2,
      traceEnvelope: traceEnvelope2,
      traceSummary,
      waterfallLayout: waterfallLayout2,
      formatDuration: formatDuration2,
      fmtTime,
      matchTrace,
      matchSpan,
      spanLine,
      traceDetailText,
      summarizeTrace,
      parseJsonlLine,
      planChunkWrites,
      readRing,
      oneLine
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// src/model.ts
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
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function getMeta() {
  return kvGet("tl.meta");
}
async function getIdx() {
  return kvGet("tl.idx");
}
async function readRecChunks(chunkCount) {
  const keys = [];
  for (let i = 0; i < chunkCount; i++) keys.push(`tl.rec.${i}`);
  const outs = await Promise.all(keys.map((k) => kvGet(k)));
  const out = [];
  for (const v of outs) if (Array.isArray(v)) out.push(...v);
  return out;
}
async function getTraceFull(traceId) {
  return kvGet(`tl.trace.${traceId}`);
}
function nonce() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1679616).toString(36)}`;
}
async function sendCommand(op, payload, timeoutMs = 15e3) {
  const n = nonce();
  const resultKey = `tl.result.${n}`;
  await kvSet(`tl.cmd.${op}.${n}`, { op, nonce: n, ...payload, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await kvGet(resultKey);
    if (r && typeof r === "object") {
      void kvDel(resultKey);
      return { ok: r.ok === true, error: r.error, kept: r.kept };
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  return { ok: false, error: "\u670D\u52A1\u672A\u5728\u65F6\u9650\u5185\u54CD\u5E94\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF09" };
}

// src/Panel.tsx
var core = __toESM(require_core());
import { jsx, jsxs } from "react/jsx-runtime";
var META_FRESH_MS = 90 * 1e3;
var POLL_MS = 2500;
var KIND_COLORS = {
  server: "#3fb950",
  client: "#58a6ff",
  producer: "#d29922",
  consumer: "#bc8cff",
  internal: "#8b949e",
  unspecified: "#6e7681"
};
function fmtClock(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function Toast({ msg, kind }) {
  return /* @__PURE__ */ jsx("div", { style: {
    position: "fixed",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 12,
    maxWidth: "80%",
    background: kind === "good" ? "rgba(63,185,80,.92)" : kind === "bad" ? "rgba(248,81,73,.92)" : "rgba(59,130,246,.92)",
    color: "#fff",
    zIndex: 50
  }, children: msg });
}
function WaterfallRow({ span, depth, offsetPct, widthPct, expanded, onToggle }) {
  const isErr = span.status.code === "error";
  const color = isErr ? "#f85149" : KIND_COLORS[span.kind] || KIND_COLORS.unspecified;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: onToggle,
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 4px",
          borderRadius: 6,
          cursor: "pointer",
          background: expanded ? "rgba(110,118,129,.15)" : "transparent",
          borderBottom: "1px solid rgba(110,118,129,.12)",
          minHeight: 26
        },
        children: [
          /* @__PURE__ */ jsxs("div", { style: { flex: "0 0 42%", minWidth: 0, paddingLeft: depth * 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
            depth > 0 && /* @__PURE__ */ jsx("span", { style: { color: "#484f58" }, children: "\u2514 " }),
            /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color, marginRight: 4 }, children: span.kind === "unspecified" ? "" : span.kind.toUpperCase() }),
            /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: isErr ? "#f85149" : "#e6edf3" }, children: span.name }),
            /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6e7681", marginLeft: 6 }, children: span.service }),
            isErr && /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#f85149", marginLeft: 4 }, children: "\u2A2F" })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { flex: 1, position: "relative", height: 14, background: "rgba(110,118,129,.1)", borderRadius: 3 }, children: /* @__PURE__ */ jsx(
            "div",
            {
              title: `${span.name} \xB7 ${span.durationMs}ms`,
              style: {
                position: "absolute",
                left: `${Math.min(offsetPct, 99.25)}%`,
                width: `${Math.min(widthPct, 100 - Math.min(offsetPct, 99.25))}%`,
                top: 2,
                height: 10,
                borderRadius: 3,
                minWidth: 3,
                background: color,
                opacity: isErr ? 1 : 0.75
              }
            }
          ) }),
          /* @__PURE__ */ jsx("div", { style: { flex: "0 0 64px", textAlign: "right", fontSize: 11, color: isErr ? "#f85149" : "#8b949e", whiteSpace: "nowrap" }, children: core.formatDuration(span.durationMs) })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs("div", { style: { padding: "6px 10px 8px", marginLeft: depth * 14 + 8, background: "rgba(110,118,129,.07)", borderRadius: 6, fontSize: 11, color: "#8b949e" }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("span", { style: { color: "#6e7681" }, children: "spanId" }),
        " ",
        span.spanId,
        " \xB7 ",
        /* @__PURE__ */ jsx("span", { style: { color: "#6e7681" }, children: "\u8D77\u70B9" }),
        " +",
        core.formatDuration(span.startMs - (waterfallBase ?? 0)),
        " \xB7 ",
        /* @__PURE__ */ jsx("span", { style: { color: "#6e7681" }, children: "\u72B6\u6001" }),
        " ",
        span.status.code,
        span.status.message ? `\uFF08${span.status.message}\uFF09` : ""
      ] }),
      Object.keys(span.attrs).length > 0 && /* @__PURE__ */ jsx("div", { style: { marginTop: 4 }, children: Object.keys(span.attrs).slice(0, 24).map((k) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "#79c0ff", flexShrink: 0 }, children: k }),
        /* @__PURE__ */ jsx("span", { style: { wordBreak: "break-all" }, children: span.attrs[k] })
      ] }, k)) }),
      span.events.length > 0 && /* @__PURE__ */ jsx("div", { style: { marginTop: 4 }, children: span.events.slice(0, 8).map((ev, i) => /* @__PURE__ */ jsxs("div", { children: [
        "\u26A1 ",
        ev.name,
        Object.keys(ev.attrs).length ? ` \u2014 ${Object.keys(ev.attrs).map((k) => `${k}=${ev.attrs[k]}`).join("  ")}` : ""
      ] }, i)) })
    ] })
  ] });
}
var waterfallBase = 0;
function Panel({ pluginId, onSendToChat }) {
  const [meta, setMeta] = useState(null);
  const [idx, setIdx] = useState(null);
  const [traces, setTraces] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [onlyErr, setOnlyErr] = useState(false);
  const [selected, setSelected] = useState("");
  const [full, setFull] = useState(null);
  const [expandedSpan, setExpandedSpan] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(void 0);
  const loadedOnce = useRef(false);
  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([getMeta(), getIdx()]);
      const list = await readRecChunks(i?.chunkCount || 0);
      setMeta(m);
      setIdx(i);
      setTraces(list);
    } catch (_) {
    }
    setLoaded(true);
    if (!loadedOnce.current) loadedOnce.current = true;
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    if (!selected) {
      setFull(null);
      return void 0;
    }
    let alive = true;
    const pull = async () => {
      const f = await getTraceFull(selected);
      if (alive) setFull(f);
    };
    void pull();
    const timer = setInterval(() => {
      void pull();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected]);
  const running = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < META_FRESH_MS);
  const layout = useMemo(() => {
    if (!full || !Array.isArray(full.spans) || !full.spans.length) return null;
    try {
      const { ordered, depthBySpanId } = core.buildTrace(full.spans);
      const rows = core.waterfallLayout(ordered, depthBySpanId);
      const env = core.traceEnvelope(ordered);
      waterfallBase = env.base;
      return { ordered, rows, env, spanCount: full.spans.length };
    } catch (_) {
      return null;
    }
  }, [full]);
  const shown = onlyErr ? traces.filter((t) => t.hasError) : traces;
  const doClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4e3);
      return;
    }
    setConfirmClear(false);
    const r = await sendCommand("clear_all", { confirm: true });
    showToast(r.ok ? "\u5DF2\u6E05\u7A7A\u5168\u90E8\u94FE\u8DEF\u7559\u75D5" : `\u6E05\u7A7A\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5"}`, r.ok ? "good" : "bad");
    if (r.ok) {
      setSelected("");
      void reload();
    }
  };
  const copyEndpoint = async () => {
    const url = meta?.endpoint || (meta?.port ? `http://127.0.0.1:${meta.port}/v1/traces` : "");
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("\u7AEF\u70B9\u5DF2\u590D\u5236", "good");
    } catch (_) {
      showToast(`\u7AEF\u70B9\uFF1A${url}`, "info");
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10, color: "#d4d4d8" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u26D3 \u94FE\u8DEF\u8FFD\u8E2A\u53F0" }),
      /* @__PURE__ */ jsx("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? `\u6536\u6570\u4E2D :${meta?.port ?? ""}` : "\u670D\u52A1\u79BB\u7EBF" }),
      meta?.degraded && running && /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(210,153,34,.15)", color: "#d29922" }, children: "kv \u964D\u7EA7\uFF08\u6536\u6570\u4E0D\u53D7\u5F71\u54CD\uFF09" }),
      running && /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#52525b" }, children: [
        meta?.tracesTotal ?? 0,
        " traces \xB7 ",
        meta?.spansTotal ?? 0,
        " spans"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      running && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: copyEndpoint,
          title: "\u590D\u5236 OTLP \u7AEF\u70B9\uFF08Content-Type: application/json\uFF09",
          style: { fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#79c0ff", cursor: "pointer" },
          children: "\u590D\u5236\u7AEF\u70B9"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: doClear,
          style: {
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 6,
            cursor: "pointer",
            border: "1px solid",
            borderColor: confirmClear ? "#f85149" : "#3f3f46",
            background: confirmClear ? "rgba(248,81,73,.2)" : "transparent",
            color: confirmClear ? "#f85149" : "#a1a1aa"
          },
          children: confirmClear ? "\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8?" : "\u6E05\u7A7A"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }, children: [
      !loaded && /* @__PURE__ */ jsx("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u8BFB\u53D6\u6570\u636E\u4E2D\u2026" }),
      loaded && !running && /* @__PURE__ */ jsxs("div", { style: { padding: 12, borderRadius: 8, border: "1px solid rgba(248,81,73,.35)", background: "rgba(248,81,73,.08)", fontSize: 12, color: "#fca5a5", marginBottom: 8 }, children: [
        "\u540E\u53F0\u670D\u52A1\u672A\u8FD0\u884C\uFF1AOTLP \u7AEF\u70B9\u4E0D\u53EF\u7528\u3002\u53BB ",
        /* @__PURE__ */ jsx("b", { children: "\u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192\u94FE\u8DEF\u8FFD\u8E2A\u53F0" }),
        " \u542F\u52A8\u670D\u52A1\uFF08\u6216\u68C0\u67E5\u7AEF\u53E3 ",
        meta?.port ?? "\u2014",
        " \u662F\u5426\u88AB\u5360\u7528\uFF09\u3002"
      ] }),
      loaded && running && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#52525b", marginBottom: 6 }, children: [
        "\u63A5\u5165\uFF1AOTel SDK \u8BBE ",
        /* @__PURE__ */ jsx("code", { style: { color: "#79c0ff" }, children: "OTEL_EXPORTER_OTLP_PROTOCOL=http/json" }),
        "\uFF0C\u7AEF\u70B9",
        /* @__PURE__ */ jsxs("code", { style: { color: "#79c0ff" }, children: [
          " ",
          meta?.endpoint || `http://127.0.0.1:${meta?.port ?? ""}/v1/traces`
        ] }),
        "\uFF1BAI \u6392\u67E5\u7528 MCP \u5DE5\u5177 trace_lens_*\u3002"
      ] }),
      !selected && loaded && running && /* @__PURE__ */ jsxs("div", { style: { flex: 1, minHeight: 0, overflowY: "auto" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }, children: [
          /* @__PURE__ */ jsxs("label", { style: { fontSize: 11, color: "#8b949e", display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }, children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: onlyErr, onChange: (e) => setOnlyErr(e.target.checked) }),
            "\u53EA\u770B\u9519\u8BEF\u94FE"
          ] }),
          /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#52525b" }, children: [
            shown.length,
            " \u6761\uFF08\u65B0\u5728\u524D\uFF09"
          ] })
        ] }),
        shown.length === 0 && /* @__PURE__ */ jsx("div", { style: { padding: 20, textAlign: "center", color: "#71717a", fontSize: 12 }, children: onlyErr ? "\u6700\u8FD1\u6CA1\u6709\u9519\u8BEF\u94FE\u8DEF\u3002" : "\u8FD8\u6CA1\u6709\u94FE\u8DEF\u6570\u636E\u3002\u628A\u4EFB\u610F OpenTelemetry SDK \u7684\u5BFC\u51FA\u534F\u8BAE\u8BBE\u4E3A http/json\u3001\u7AEF\u70B9\u6307\u5411\u4E0A\u65B9\u5730\u5740\uFF0C\u89E6\u53D1\u4E00\u6B21\u8BF7\u6C42\u5373\u53EF\u3002" }),
        shown.map((t) => /* @__PURE__ */ jsxs(
          "div",
          {
            onClick: () => {
              setSelected(t.traceId);
              setExpandedSpan("");
            },
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 8px",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid rgba(110,118,129,.2)",
              marginBottom: 6,
              background: "rgba(110,118,129,.06)"
            },
            children: [
              /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6e7681", flexShrink: 0 }, children: fmtClock(t.startedAt) }),
              /* @__PURE__ */ jsxs("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#e6edf3" }, children: [
                t.rootName,
                /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#6e7681", marginLeft: 6 }, children: [
                  t.rootService,
                  t.spanCount > 1 ? ` +${t.spanCount - 1}` : ""
                ] })
              ] }),
              t.hasError && /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#f85149", flexShrink: 0 }, children: [
                "\u2A2F",
                t.errCount
              ] }),
              /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: t.durationMs >= 1e3 ? "#d29922" : "#8b949e", flexShrink: 0 }, children: core.formatDuration(t.durationMs) })
            ]
          },
          t.traceId
        ))
      ] }),
      selected && /* @__PURE__ */ jsxs("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setSelected(""),
              style: { fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", cursor: "pointer" },
              children: "\u2190 \u8FD4\u56DE\u5217\u8868"
            }
          ),
          /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: layout ? `${layout.ordered[0]?.name} \xB7 ${layout.ordered.length}/${layout.spanCount} spans \xB7 ${core.formatDuration(layout.env.durationMs)}` : "\u52A0\u8F7D\u4E2D\u2026" }),
          /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
          selected && /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#52525b" }, children: [
            selected.slice(0, 16),
            "\u2026"
          ] })
        ] }),
        !layout && full && /* @__PURE__ */ jsxs("div", { style: { color: "#71717a", fontSize: 12 }, children: [
          "\u8BE5 trace \u5DF2\u4E0D\u5728\u5168\u6587\u6295\u5F71\uFF08\u4EC5\u4FDD\u7559\u6700\u8FD1 ",
          12,
          " \u6761\uFF09\uFF1B\u7528 AI \u5DE5\u5177 trace_lens_get \u67E5\u7559\u75D5\u6587\u4EF6\u91CC\u7684\u5168\u6587\u3002"
        ] }),
        !full && /* @__PURE__ */ jsx("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u52A0\u8F7D trace \u5168\u6587\u2026" }),
        layout && /* @__PURE__ */ jsxs("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid rgba(110,118,129,.2)", borderRadius: 8, padding: 4 }, children: [
          layout.rows.map((r) => {
            const span = layout.ordered.find((s) => s.spanId === r.spanId);
            if (!span) return null;
            return /* @__PURE__ */ jsx(
              WaterfallRow,
              {
                span,
                depth: r.depth,
                offsetPct: r.offsetPct,
                widthPct: r.widthPct,
                expanded: expandedSpan === r.spanId,
                onToggle: () => setExpandedSpan(expandedSpan === r.spanId ? "" : r.spanId)
              },
              r.spanId
            );
          }),
          layout.rows.length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u7A7A trace\u3002" })
        ] })
      ] })
    ] }),
    toast && /* @__PURE__ */ jsx(Toast, { msg: toast.msg, kind: toast.kind }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#52525b" }, children: "\u6570\u636E\u53EA\u5B58\u672C\u673A\uFF08spans.jsonl + \u672C\u673A kv\uFF09\uFF0C\u65E0\u5916\u53D1\u8DEF\u5F84\uFF1Bspan \u5C5E\u6027\u53EF\u80FD\u542B\u654F\u611F\u6570\u636E\uFF0C\u5171\u4EAB\u5C4F\u5E55\u65F6\u6CE8\u610F\u3002" })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function TraceLensEntry(props) {
  return /* @__PURE__ */ jsx2(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  TraceLensEntry as default
};
