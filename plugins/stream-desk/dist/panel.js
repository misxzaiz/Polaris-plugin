var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
    function createSseParser2() {
      let buf = "";
      let cur = { event: null, id: null, retry: null, dataLines: [], rawLines: [] };
      let comments = 0;
      function dispatch(force) {
        const raw = cur.rawLines.join("\n");
        if (cur.dataLines.length === 0) {
          if (!force) return null;
          if (!raw.trim()) return null;
          return { event: cur.event, id: cur.id, retry: cur.retry, data: "", raw, partial: true };
        }
        const ev = {
          event: cur.event,
          id: cur.id,
          retry: cur.retry,
          data: cur.dataLines.join("\n"),
          raw
        };
        return ev;
      }
      function resetCur() {
        cur = { event: null, id: null, retry: null, dataLines: [], rawLines: [] };
      }
      function processLine(line) {
        cur.rawLines.push(line);
        if (line === "") {
          const ev = dispatch(false);
          resetCur();
          return ev;
        }
        if (line.startsWith(":")) {
          comments += 1;
          return null;
        }
        let field = line;
        let value = "";
        const colon = line.indexOf(":");
        if (colon >= 0) {
          field = line.slice(0, colon);
          value = line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
        }
        if (field === "data") cur.dataLines.push(value);
        else if (field === "event") cur.event = value;
        else if (field === "id") cur.id = value;
        else if (field === "retry") {
          const n = parseInt(value, 10);
          if (Number.isFinite(n) && n >= 0) cur.retry = n;
        }
        return null;
      }
      return {
        /** 喂入一段文本（增量），返回本次产出的完整事件数组 */
        push(chunk) {
          if (typeof chunk !== "string" || chunk === "") return [];
          if (buf === "" && chunk.charCodeAt(0) === 65279) chunk = chunk.slice(1);
          buf += chunk;
          buf = buf.replace(/\r\n/g, "\n").replace(/\r(?!\n)/g, "\n");
          const out = [];
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            const ev = processLine(line);
            if (ev) out.push(ev);
          }
          return out;
        },
        /** 流结束时调用：EOF 视为行终止（WHATWG 规范）——先处理残留行，再宽容派发悬挂块 */
        flush() {
          const out = [];
          if (buf !== "") {
            const line = buf;
            buf = "";
            const ev = processLine(line);
            if (ev) out.push(ev);
          }
          const ev2 = dispatch(true);
          if (ev2) out.push(ev2);
          resetCur();
          return out;
        },
        /** 累计的注释/心跳行数（诊断：服务器活着但没事件） */
        comments: () => comments,
        /** 未消费的缓冲（诊断） */
        pending: () => buf
      };
    }
    function isEventStreamContentType(contentType) {
      return typeof contentType === "string" && /text\/event-stream/i.test(contentType);
    }
    var SENSITIVE_HEADER_EXACT = /* @__PURE__ */ new Set([
      "authorization",
      "proxy-authorization",
      "cookie",
      "set-cookie",
      "x-api-key",
      "api-key",
      "apikey",
      "x-auth-token",
      "x-csrf-token",
      "x-xsrf-token",
      "x-session-token",
      "x-access-token",
      "x-webhook-token",
      "x-amz-authorization"
    ]);
    function isSensitiveHeaderName(name) {
      const n = String(name || "").toLowerCase();
      if (SENSITIVE_HEADER_EXACT.has(n)) return true;
      return /(secret|token|password|passwd|credential|signature|authorization|api[-_]?key|auth)/i.test(n);
    }
    function maskValue(v) {
      const s = String(v == null ? "" : v);
      if (s.length <= 4) return "****";
      return `****${s.slice(-4)}`;
    }
    function maskHeaders2(headers, enabled) {
      const out = {};
      const src = headers && typeof headers === "object" ? headers : {};
      for (const k of Object.keys(src)) {
        const v = src[k];
        const name = String(k).toLowerCase();
        if (enabled === false) {
          if (name === "cookie" || name === "set-cookie" || name === "authorization") {
            out[k] = maskValue(v);
          } else {
            out[k] = v;
          }
        } else {
          out[k] = isSensitiveHeaderName(k) ? maskValue(v) : v;
        }
      }
      return out;
    }
    function truncateText(s, cap) {
      const str = s == null ? "" : String(s);
      const size = str.length;
      if (size <= cap) return { text: str, truncated: false, size };
      return { text: str.slice(0, cap) + `\u2026[\u622A\u65AD ${size - cap} \u5B57\u7B26]`, truncated: true, size };
    }
    function gapStats(gaps) {
      if (!Array.isArray(gaps) || gaps.length === 0) return null;
      const arr = [...gaps].sort((a, b) => a - b);
      const n = arr.length;
      const sum = arr.reduce((s, v) => s + v, 0);
      const pick = (q) => arr[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
      return {
        count: n,
        min: arr[0],
        median: pick(0.5),
        mean: Math.round(sum / n),
        p95: pick(0.95),
        max: arr[n - 1]
      };
    }
    function formatBytes3(n) {
      const v = Number(n) || 0;
      if (v < 1024) return `${v} B`;
      if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
      return `${(v / 1024 / 1024).toFixed(2)} MB`;
    }
    function formatMs2(ms) {
      const v = Number(ms) || 0;
      if (v < 1e3) return `${Math.round(v)}ms`;
      return `${(v / 1e3).toFixed(2)}s`;
    }
    var WS_CLOSE_CODES = {
      1e3: "\u6B63\u5E38\u5173\u95ED",
      1001: "\u7AEF\u70B9\u79BB\u5F00\uFF08\u9875\u9762\u5173\u95ED/\u670D\u52A1\u5668\u4E0B\u7EBF\uFF09",
      1002: "\u534F\u8BAE\u9519\u8BEF",
      1003: "\u6536\u5230\u4E0D\u652F\u6301\u7684\u6570\u636E\u7C7B\u578B",
      1005: "\u672A\u63D0\u4F9B\u72B6\u6001\u7801\uFF08\u5E94\u7B54\u65B9\u672A\u5E26 code\uFF09",
      1006: "\u5F02\u5E38\u5173\u95ED\uFF08\u8FDE\u63A5\u672A\u5B8C\u6210\u5173\u95ED\u63E1\u624B\u2014\u2014\u7F51\u7EDC\u4E2D\u65AD/\u8FDB\u7A0B\u88AB\u6740/\u4EE3\u7406\u6390\u65AD\u7684\u6700\u5E38\u89C1\u7801\uFF09",
      1007: "\u6D88\u606F\u8F7D\u8377\u975E\u5408\u6CD5 UTF-8",
      1008: "\u7B56\u7565\u8FDD\u89C4\uFF08\u5E38\u89C1\u4E8E\u9274\u6743\u5931\u8D25\uFF09",
      1009: "\u6D88\u606F\u8FC7\u5927",
      1010: "\u5BA2\u6237\u7AEF\u8981\u6C42\u6269\u5C55\u4F46\u670D\u52A1\u5668\u672A\u540C\u610F",
      1011: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF",
      1012: "\u670D\u52A1\u5668\u91CD\u542F",
      1013: "\u7A0D\u540E\u518D\u8BD5\uFF08\u670D\u52A1\u5668\u8FC7\u8F7D\uFF09",
      1014: "\u574F\u7F51\u5173\uFF08\u4E0A\u6E38\u65E0\u6548\uFF09",
      1015: "TLS \u63E1\u624B\u5931\u8D25"
    };
    function wsCloseCodeName2(code) {
      if (code == null) return "\u672A\u643A\u5E26\u72B6\u6001\u7801";
      if (WS_CLOSE_CODES[code]) return WS_CLOSE_CODES[code];
      if (code >= 3e3 && code <= 4999) return "\u6CE8\u518C/\u79C1\u6709\u7528\u9014\u7801\uFF08\u770B\u670D\u52A1\u5668\u6587\u6863\uFF09";
      if (code >= 4e3 && code <= 4999) return "\u79C1\u6709\u7528\u9014\u7801\uFF08\u5E94\u7528\u81EA\u5B9A\u4E49\uFF09";
      return "\u672A\u77E5\u72B6\u6001\u7801";
    }
    var FRAME_PUBLIC_KEYS = [
      "seq",
      "ts",
      "gapMs",
      "dir",
      "kind",
      "size",
      "text",
      "b64",
      "truncated",
      "code",
      "reason",
      "latencyMs",
      "rttMs",
      "level",
      "message",
      "event",
      "id",
      "httpStatus"
    ];
    function projectFrame(frame, bodyCap) {
      const out = {};
      for (const k of FRAME_PUBLIC_KEYS) {
        if (frame[k] !== void 0) out[k] = frame[k];
      }
      const cap = bodyCap != null ? bodyCap : 4096;
      if (typeof out.text === "string") {
        const t = truncateText(out.text, cap);
        out.text = t.text;
        if (t.truncated) out.truncated = true;
      }
      if (typeof out.b64 === "string" && out.b64.length > cap) {
        out.b64 = out.b64.slice(0, cap) + "\u2026[b64 \u622A\u65AD]";
        out.truncated = true;
      }
      return out;
    }
    function projectSessionForKv(session, opts) {
      const o = opts || {};
      const bodyCap = o.bodyCap != null ? o.bodyCap : 2048;
      const tail = o.tail != null ? o.tail : 200;
      const frames = Array.isArray(session.frames) ? session.frames.slice(-tail) : [];
      return {
        id: session.id,
        kind: session.kind,
        url: session.url,
        title: session.title || "",
        state: session.state,
        createdAt: session.createdAt,
        openAt: session.openAt || null,
        closedAt: session.closedAt || null,
        closedReason: session.closedReason || "",
        request: {
          method: session.request && session.request.method,
          url: session.url,
          headers: maskHeaders2(session.request && session.request.headers, o.maskHeaders !== false),
          subprotocols: session.request && session.request.subprotocols || [],
          pingIntervalSec: session.request && session.request.pingIntervalSec || 0,
          body: typeof (session.request && session.request.body) === "string" ? truncateText(session.request.body, bodyCap).text : void 0
        },
        handshake: session.handshake ? {
          ok: session.handshake.ok,
          httpStatus: session.handshake.httpStatus,
          statusText: session.handshake.statusText,
          latencyMs: session.handshake.latencyMs,
          headers: maskHeaders2(session.handshake.headers, o.maskHeaders !== false),
          error: session.handshake.error || ""
        } : null,
        counters: session.counters || {},
        stats: session.stats || null,
        frameCount: session.nextSeq || 0,
        frames: frames.map((f) => projectFrame(f, bodyCap))
      };
    }
    function sessionSummary(session) {
      return {
        id: session.id,
        kind: session.kind,
        url: session.url,
        title: session.title || "",
        state: session.state,
        createdAt: session.createdAt,
        openAt: session.openAt || null,
        closedAt: session.closedAt || null,
        closedReason: session.closedReason || "",
        frameCount: session.nextSeq || 0,
        counters: session.counters || {},
        stats: session.stats || null
      };
    }
    function shortId(rand) {
      const r = typeof rand === "function" ? rand : Math.random;
      return `${Date.now().toString(36)}${Math.floor(r() * 1296).toString(36).padStart(2, "0")}`;
    }
    module.exports = {
      createSseParser: createSseParser2,
      isEventStreamContentType,
      SENSITIVE_HEADER_EXACT,
      isSensitiveHeaderName,
      maskValue,
      maskHeaders: maskHeaders2,
      truncateText,
      gapStats,
      formatBytes: formatBytes3,
      formatMs: formatMs2,
      WS_CLOSE_CODES,
      wsCloseCodeName: wsCloseCodeName2,
      FRAME_PUBLIC_KEYS,
      projectFrame,
      projectSessionForKv,
      sessionSummary,
      shortId
    };
  }
});

// src/host.ts
var host_exports = {};
__export(host_exports, {
  capDispatch: () => capDispatch,
  getHostInvoke: () => getHostInvoke,
  kvGet: () => kvGet,
  kvSet: () => kvSet,
  restartService: () => restartService
});
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
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";

// src/model.ts
var import_core = __toESM(require_core());
init_host();
var metaCache = null;
async function readMeta(force = false) {
  if (!force && metaCache) return metaCache;
  const m = await kvGet("streamdesk.meta");
  if (m && typeof m.port === "number" && m.token) {
    metaCache = m;
    return m;
  }
  metaCache = null;
  return null;
}
function invalidateMeta() {
  metaCache = null;
}
var SvcError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
async function svc(method, path, body, timeoutMs = 35e3) {
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
  sessions: () => svc("GET", "/api/sessions"),
  sessionDetail: (id, since) => svc("GET", `/api/session/${encodeURIComponent(id)}?since=${since}`),
  openWs: (p) => svc("POST", "/api/session/ws", p),
  openSse: (p) => svc("POST", "/api/session/sse", p),
  send: (id, body) => svc("POST", `/api/session/${encodeURIComponent(id)}/send`, body),
  close: (id, code, reason) => svc("POST", `/api/session/${encodeURIComponent(id)}/close`, { code, reason }),
  stop: (id) => svc("POST", `/api/session/${encodeURIComponent(id)}/stop`),
  reconnect: (id) => svc("POST", `/api/session/${encodeURIComponent(id)}/reconnect`),
  remove: (id) => svc("DELETE", `/api/session/${encodeURIComponent(id)}`),
  settings: () => svc("GET", "/api/settings"),
  saveSettings: (patch) => svc("POST", "/api/settings", patch),
  clearHistory: () => svc("POST", "/api/history/clear"),
  meta: () => svc("GET", "/api/meta")
};
function streamSession(sessionId, handlers) {
  let stopped = false;
  let cursor = -1;
  let backoff = 500;
  let controller = null;
  const loop = async () => {
    while (!stopped) {
      const meta = await readMeta();
      if (!meta) {
        await sleep(Math.min(backoff *= 1.5, 3e3));
        continue;
      }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 9e4);
      try {
        const res = await fetch(
          `http://127.0.0.1:${meta.port}/api/session/${encodeURIComponent(sessionId)}/stream?since=${cursor}`,
          { headers: { Authorization: `Bearer ${meta.token}` }, signal: controller.signal }
        );
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        backoff = 500;
        const parser = (0, import_core.createSseParser)();
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const ev of parser.push(text)) handleStreamEvent(ev, handlers, (c) => {
            cursor = c;
          });
          for (const ev of parser.flush()) handleStreamEvent(ev, handlers, (c) => {
            cursor = c;
          });
        }
      } catch (_) {
        if (stopped) return;
        handlers.onDown?.();
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 3e3);
      } finally {
        clearTimeout(timeout);
        controller = null;
      }
      if (stopped) return;
      await sleep(200);
    }
  };
  void loop();
  return () => {
    stopped = true;
    try {
      controller?.abort();
    } catch (_) {
    }
  };
}
function handleStreamEvent(ev, handlers, setCursor) {
  if (!ev.data) return;
  try {
    const msg = JSON.parse(ev.data);
    if (msg.type === "frames" && Array.isArray(msg.frames)) {
      for (const f of msg.frames) if (typeof f.seq === "number" && f.seq > 0) setCursor(f.seq);
      handlers.onFrames(msg.frames);
    } else if (msg.type === "status" && msg.summary) {
      if (typeof msg.summary.frameCount === "number") setCursor(Math.max(0, msg.summary.frameCount - 1));
      handlers.onStatus(msg.summary);
    }
  } catch (_) {
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function prettyJson(s) {
  try {
    const v = JSON.parse(s);
    return JSON.stringify(v, null, 2);
  } catch (_) {
    return null;
  }
}
function b64ToHex(b64, maxBytes = 512) {
  try {
    const bin = atob(b64);
    const arr = [];
    for (let i = 0; i < Math.min(bin.length, maxBytes); i++) {
      arr.push(bin.charCodeAt(i).toString(16).padStart(2, "0"));
    }
    return arr.join(" ");
  } catch (_) {
    return "(base64 \u89E3\u6790\u5931\u8D25)";
  }
}

// src/Panel.tsx
init_host();

// src/ui.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
var import_core2 = __toESM(require_core());
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var STYLE = `
.streamdesk-panel { font-size: 12px; color: #E4E4E7; background: #17171B; height: 100%;
  display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.streamdesk-panel * { box-sizing: border-box; }
.streamdesk-panel input, .streamdesk-panel textarea, .streamdesk-panel select, .streamdesk-panel button {
  font-family: inherit; font-size: 12px; color: #E4E4E7; background: #232329; border: 1px solid #3F3F46;
  border-radius: 6px; padding: 5px 8px; outline: none; }
.streamdesk-panel input:focus, .streamdesk-panel textarea:focus, .streamdesk-panel select:focus { border-color: #3B82F6; }
.streamdesk-panel button { cursor: pointer; background: #2A2A31; }
.streamdesk-panel button:hover { background: #33333B; }
.streamdesk-panel button:disabled { opacity: .45; cursor: not-allowed; }
.streamdesk-panel button.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.streamdesk-panel button.primary:hover { background: #1D4ED8; }
.streamdesk-panel button.danger { background: #7F1D1D; border-color: #991B1B; color: #FECACA; }
.streamdesk-panel button.small { padding: 2px 8px; border-radius: 4px; }
.streamdesk-panel textarea { font-family: ui-monospace, Consolas, monospace; }
.streamdesk-panel code, .streamdesk-panel pre, .streamdesk-panel .mono { font-family: ui-monospace, Consolas, monospace; }
.sd-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid #2A2A31; }
.sd-tab { padding: 6px 14px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: #9CA3AF; }
.sd-tab.active { background: #232329; color: #fff; }
.sd-statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1D1D22; border-bottom: 1px solid #2A2A31; font-size: 11px; color: #9CA3AF; }
.sd-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.sd-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 600; flex: none; }
.sd-card { background: #1D1D22; border: 1px solid #2A2A31; border-radius: 8px; padding: 10px 12px; }
.sd-row { display: flex; align-items: center; gap: 6px; }
.sd-grow { flex: 1; min-width: 0; }
.sd-label { font-size: 11px; color: #9CA3AF; margin-bottom: 3px; display: block; }
.sd-frames { flex: 1; overflow-y: auto; border: 1px solid #2A2A31; border-radius: 8px; background: #1A1A1F; }
.sd-frame { padding: 4px 10px; border-bottom: 1px solid #202027; cursor: pointer; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.sd-frame:hover { background: #202028; }
.sd-frame.sel { background: #232B3D; }
.sd-frame .sd-seq { color: #6B7280; font-size: 10px; width: 34px; flex: none; text-align: right; }
.sd-frame .sd-gap { color: #6B7280; font-size: 10px; flex: none; width: 64px; }
.sd-frame .sd-size { color: #6B7280; font-size: 10px; flex: none; }
.sd-frame .sd-body { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; }
.sd-detail { background: #141418; border-top: 1px solid #2A2A31; padding: 8px 12px; max-height: 260px; overflow: auto; }
.sd-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; font-size: 11.5px; line-height: 1.5; }
.sd-chip { background: #232329; border: 1px solid #2A2A31; border-radius: 6px; padding: 4px 10px; font-size: 11px; }
.sd-chip b { color: #fff; font-weight: 600; }
.sd-err { color: #F87171; }
.sd-warn { color: #FBBF24; }
.sd-ok { color: #34D399; }
.sd-muted { color: #6B7280; }
.sd-hint { font-size: 11px; color: #9CA3AF; line-height: 1.6; }
.sd-list-row { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid #202027; cursor: pointer; }
.sd-list-row:hover { background: #202028; }
.sd-list-row.sel { background: #232B3D; }
.sd-scroll { overflow-y: auto; }
`;
function PanelStyle() {
  return /* @__PURE__ */ jsx("style", { children: STYLE });
}
function stateMeta(state) {
  switch (state) {
    case "open":
      return { label: "\u5DF2\u8FDE\u63A5", color: "#34D399" };
    case "capturing":
      return { label: "\u6293\u53D6\u4E2D", color: "#34D399" };
    case "connecting":
      return { label: "\u8FDE\u63A5\u4E2D", color: "#60A5FA" };
    case "closed":
      return { label: "\u5DF2\u7ED3\u675F", color: "#9CA3AF" };
    case "stopped":
      return { label: "\u5DF2\u505C\u6B62", color: "#9CA3AF" };
    case "interrupted":
      return { label: "\u5DF2\u4E2D\u65AD", color: "#FBBF24" };
    case "error":
      return { label: "\u9519\u8BEF", color: "#F87171" };
    default:
      return { label: state, color: "#9CA3AF" };
  }
}
function StateBadge({ state }) {
  const m = stateMeta(state);
  return /* @__PURE__ */ jsx("span", { className: "sd-badge", style: { background: `${m.color}22`, color: m.color }, children: m.label });
}
function KvEditor({ rows, onChange, keyPlaceholder, valPlaceholder }) {
  const update = (i, patch) => {
    const next = rows.map((r, j) => j === i ? { ...r, ...patch } : r);
    onChange(next);
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
    rows.map((r, i) => /* @__PURE__ */ jsxs("div", { className: "sd-row", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "sd-grow",
          style: { maxWidth: "38%" },
          value: r.k,
          placeholder: keyPlaceholder || "Header",
          onChange: (e) => update(i, { k: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "sd-grow",
          value: r.v,
          placeholder: valPlaceholder || "value",
          onChange: (e) => update(i, { v: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "small", title: "\u5220\u9664\u6B64\u5934", onClick: () => onChange(rows.filter((_, j) => j !== i)), children: "\u2715" })
    ] }, i)),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { className: "small", onClick: () => onChange([...rows, { k: "", v: "" }]), children: "+ \u6DFB\u52A0" }) })
  ] });
}
var KIND_LABEL = {
  text: "\u6587\u672C",
  binary: "\u4E8C\u8FDB\u5236",
  event: "\u4E8B\u4EF6",
  chunk: "\u5206\u5757",
  ping: "PING",
  pong: "PONG",
  open: "\u6253\u5F00",
  close: "\u5173\u95ED",
  error: "\u9519\u8BEF",
  status: "\u72B6\u6001",
  note: "\u5907\u6CE8"
};
function frameColor(f) {
  if (f.kind === "error") return "#F87171";
  if (f.kind === "close") return "#FBBF24";
  if (f.dir === "out") return "#93C5FD";
  if (f.dir === "in") return "#E4E4E7";
  return "#A1A1AA";
}
function framePreview(f) {
  if (f.text) return f.text.replace(/\n+/g, " \u23CE ");
  if (f.b64) return `[\u4E8C\u8FDB\u5236 ${f.size ?? "?"}B]`;
  return f.message || "";
}
function FrameList({ frames, emptyHint }) {
  const [sel, setSel] = useState(null);
  const [dirFilter, setDirFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef(null);
  const filtered = useMemo(() => frames.filter((f) => {
    if (dirFilter !== "all" && f.dir !== dirFilter) return false;
    if (search) {
      const hay = `${f.text || ""} ${f.message || ""} ${f.event || ""} ${f.b64 || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [frames, dirFilter, search]);
  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [filtered.length, autoScroll]);
  const selFrame = filtered.find((f) => f.seq === sel) || null;
  return /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 6 }, children: [
    /* @__PURE__ */ jsxs("div", { className: "sd-row", children: [
      /* @__PURE__ */ jsxs("select", { value: dirFilter, onChange: (e) => setDirFilter(e.target.value), style: { width: 92 }, children: [
        /* @__PURE__ */ jsx("option", { value: "all", children: "\u5168\u90E8\u65B9\u5411" }),
        /* @__PURE__ */ jsx("option", { value: "in", children: "\u2190 \u6536" }),
        /* @__PURE__ */ jsx("option", { value: "out", children: "\u2192 \u53D1" })
      ] }),
      /* @__PURE__ */ jsx("input", { className: "sd-grow", placeholder: "\u641C\u7D22\u5E27\u5185\u5BB9\u2026", value: search, onChange: (e) => setSearch(e.target.value) }),
      /* @__PURE__ */ jsxs("label", { className: "sd-hint sd-row", style: { gap: 4, cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: autoScroll, onChange: (e) => setAutoScroll(e.target.checked), style: { padding: 0 } }),
        "\u81EA\u52A8\u6EDA\u52A8"
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "sd-muted", style: { fontSize: 11 }, children: [
        filtered.length,
        "/",
        frames.length,
        " \u5E27"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sd-frames sd-scroll", ref: boxRef, children: [
      filtered.length === 0 && /* @__PURE__ */ jsx("div", { className: "sd-hint", style: { padding: 14 }, children: emptyHint || "\u6682\u65E0\u5E27" }),
      filtered.map((f) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `sd-frame ${sel === f.seq ? "sel" : ""}`, onClick: () => setSel(sel === f.seq ? null : f.seq), children: [
          /* @__PURE__ */ jsxs("span", { className: "sd-seq", children: [
            "#",
            f.seq
          ] }),
          /* @__PURE__ */ jsx("span", { style: { color: frameColor(f), flex: "none", width: 14, textAlign: "center" }, children: f.dir === "out" ? "\u2192" : f.dir === "in" ? "\u2190" : "\xB7" }),
          /* @__PURE__ */ jsx("span", { className: "sd-badge", style: { background: `${frameColor(f)}18`, color: frameColor(f) }, children: KIND_LABEL[f.kind] || f.kind }),
          /* @__PURE__ */ jsxs("span", { className: "sd-gap", children: [
            "+",
            f.gapMs,
            "ms"
          ] }),
          f.size != null && /* @__PURE__ */ jsx("span", { className: "sd-size", children: (0, import_core2.formatBytes)(f.size) }),
          /* @__PURE__ */ jsxs("span", { className: "sd-body", style: { color: frameColor(f) }, children: [
            f.truncated ? "\u22EF" : "",
            framePreview(f)
          ] })
        ] }),
        sel === f.seq && /* @__PURE__ */ jsx(FrameDetail, { frame: f })
      ] }, f.seq))
    ] }),
    selFrame && /* @__PURE__ */ jsxs("div", { className: "sd-hint sd-muted", children: [
      "\u5E27 #",
      selFrame.seq,
      " \u8BE6\u60C5\u5DF2\u5C55\u5F00\uFF08\u518D\u6B21\u70B9\u51FB\u6536\u8D77\uFF09"
    ] })
  ] });
}
function FrameDetail({ frame }) {
  const [copied, setCopied] = useState(false);
  const pretty = frame.text ? prettyJson(frame.text) : null;
  const copy = () => {
    const raw = frame.text || frame.b64 || frame.message || "";
    navigator.clipboard?.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {
    });
  };
  const meta = [];
  if (frame.httpStatus != null) meta.push(["HTTP \u72B6\u6001", String(frame.httpStatus)]);
  if (frame.event) meta.push(["event", frame.event]);
  if (frame.id) meta.push(["id", frame.id]);
  if (frame.rttMs != null) meta.push(["RTT", `${frame.rttMs}ms`]);
  if (frame.code != null) meta.push(["\u5173\u95ED\u7801", `${frame.code}\uFF08${(0, import_core2.wsCloseCodeName)(frame.code)}\uFF09`]);
  if (frame.reason) meta.push(["\u539F\u56E0", frame.reason]);
  if (frame.latencyMs != null) meta.push(["\u5EF6\u8FDF", `${frame.latencyMs}ms`]);
  if (frame.truncated) meta.push(["\u622A\u65AD", "\u5185\u5BB9\u8D85\u957F\uFF0C\u4EC5\u5C55\u793A\u524D\u6BB5"]);
  return /* @__PURE__ */ jsxs("div", { className: "sd-detail", children: [
    /* @__PURE__ */ jsxs("div", { className: "sd-row", style: { marginBottom: 4 }, children: [
      /* @__PURE__ */ jsxs("span", { className: "sd-badge", style: { background: `${frameColor(frame)}18`, color: frameColor(frame) }, children: [
        KIND_LABEL[frame.kind] || frame.kind,
        " #",
        frame.seq
      ] }),
      /* @__PURE__ */ jsx("button", { className: "small", onClick: copy, children: copied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u539F\u6587" })
    ] }),
    meta.length > 0 && /* @__PURE__ */ jsx("div", { className: "sd-hint", style: { marginBottom: 4 }, children: meta.map(([k, v]) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("span", { className: "sd-muted", children: [
        k,
        "\uFF1A"
      ] }),
      v
    ] }, k)) }),
    frame.text && /* @__PURE__ */ jsx("pre", { style: { color: pretty ? "#A5D6FF" : "#E4E4E7" }, children: pretty || frame.text }),
    frame.b64 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "sd-hint sd-muted", children: "HEX \u9884\u89C8\uFF08\u524D 512 \u5B57\u8282\uFF09\uFF1A" }),
      /* @__PURE__ */ jsx("pre", { className: "sd-muted", style: { wordBreak: "break-all" }, children: b64ToHex(frame.b64) })
    ] }),
    !frame.text && !frame.b64 && frame.message && /* @__PURE__ */ jsx("pre", { children: frame.message })
  ] });
}
function StatChips({ items }) {
  const toneColor = (t) => t === "ok" ? "#34D399" : t === "warn" ? "#FBBF24" : t === "err" ? "#F87171" : t === "muted" ? "#9CA3AF" : "#E4E4E7";
  return /* @__PURE__ */ jsx("div", { className: "sd-row", style: { flexWrap: "wrap", gap: 6 }, children: items.map((it) => /* @__PURE__ */ jsxs("span", { className: "sd-chip", children: [
    /* @__PURE__ */ jsxs("span", { className: "sd-muted", children: [
      it.label,
      " "
    ] }),
    /* @__PURE__ */ jsx("b", { style: { color: toneColor(it.tone) }, children: it.value })
  ] }, it.label)) });
}
function timeStr(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// src/Panel.tsx
var import_core3 = __toESM(require_core());
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PLUGIN_ID = "stream-desk";
var SERVICE_ID = "stream-desk-server";
var DRAFT_KEY = "streamdesk.draft";
function Panel({ pluginId }) {
  const [tab, setTab] = useState2("sessions");
  const [svcDown, setSvcDown] = useState2(null);
  const [degraded, setDegraded] = useState2(false);
  const [sessions, setSessions] = useState2([]);
  const [selectedId, setSelectedId] = useState2(null);
  const [banner, setBanner] = useState2(null);
  const refreshSessions = useCallback(async () => {
    try {
      const r = await api.sessions();
      setSessions(r.sessions);
      setDegraded(r.degraded);
      setSvcDown(null);
    } catch (e) {
      setSvcDown(e.message);
    }
  }, []);
  useEffect2(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      if (!alive) return;
      await readMeta(true).catch(() => null);
      await refreshSessions();
      timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [refreshSessions]);
  const flash = (text, tone = "ok") => {
    setBanner({ text, tone });
    setTimeout(() => setBanner(null), 2600);
  };
  const selected = sessions.find((s) => s.id === selectedId) || null;
  const openSession = (s) => {
    setSelectedId(s.id);
    setTab(s.kind === "ws" ? "console" : "capture");
  };
  const removeSession = async (id) => {
    try {
      await api.remove(id);
      if (selectedId === id) setSelectedId(null);
      await refreshSessions();
    } catch (e) {
      flash(e.message, "err");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "streamdesk-panel", children: [
    /* @__PURE__ */ jsx2(PanelStyle, {}),
    /* @__PURE__ */ jsx2(Statusbar, { down: svcDown, degraded, onFlash: flash }),
    /* @__PURE__ */ jsx2("div", { className: "sd-tabs", children: [["sessions", "\u4F1A\u8BDD"], ["console", "WS \u63A7\u5236\u53F0"], ["capture", "SSE \u6293\u53D6"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `sd-tab ${tab === k ? "active" : ""}`, onClick: () => setTab(k), children: label }, k)) }),
    banner && /* @__PURE__ */ jsx2("div", { style: { padding: "5px 12px", fontSize: 11.5, background: banner.tone === "ok" ? "#0F2E22" : "#331414", color: banner.tone === "ok" ? "#34D399" : "#F87171" }, children: banner.text }),
    /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }, children: [
      tab === "sessions" && /* @__PURE__ */ jsx2(SessionsTab, { sessions, onOpen: openSession, onRemove: removeSession, onCreated: (s) => {
        void refreshSessions();
        openSession(s);
      }, onFlash: flash }),
      tab === "console" && (selected ? /* @__PURE__ */ jsx2(ConsoleTab, { summary: selected, onFlash: flash, onChanged: refreshSessions }, selected.id) : /* @__PURE__ */ jsx2(Empty, { text: "\u4ECE\u300C\u4F1A\u8BDD\u300D\u9009\u62E9\u4E00\u4E2A WS \u4F1A\u8BDD\uFF0C\u6216\u65B0\u5EFA\u8FDE\u63A5\u3002" })),
      tab === "capture" && (selected ? /* @__PURE__ */ jsx2(CaptureTab, { summary: selected, onFlash: flash, onChanged: refreshSessions }, selected.id) : /* @__PURE__ */ jsx2(Empty, { text: "\u4ECE\u300C\u4F1A\u8BDD\u300D\u9009\u62E9\u4E00\u4E2A SSE \u6293\u53D6\u4F1A\u8BDD\uFF0C\u6216\u65B0\u5EFA\u6293\u53D6\u3002" })),
      tab === "settings" && /* @__PURE__ */ jsx2(SettingsTab, { onFlash: flash })
    ] })
  ] });
}
function Statusbar({ down, degraded, onFlash }) {
  const [meta, setMeta] = useState2(null);
  useEffect2(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const m = await api.meta();
        setMeta(m);
      } catch (_) {
        setMeta(null);
      }
      setTimeout(tick, 5e3);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, []);
  const ok = !down;
  const color = ok ? degraded ? "#FBBF24" : "#34D399" : "#F87171";
  const restart = async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID);
      invalidateMeta();
      onFlash("\u5DF2\u8BF7\u6C42\u91CD\u542F\u670D\u52A1\uFF0C\u7A0D\u5019\u81EA\u52A8\u6062\u590D", "ok");
    } catch (e) {
      onFlash(`\u91CD\u542F\u5931\u8D25\uFF1A${e.message}`, "err");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "sd-statusbar", children: [
    /* @__PURE__ */ jsx2("span", { className: "sd-dot", style: { background: color } }),
    /* @__PURE__ */ jsx2("span", { children: ok ? `\u670D\u52A1 v${meta?.version || "?"} ${degraded ? "\uFF08kv \u964D\u7EA7\uFF0C\u5386\u53F2\u4E0D\u843D\u5E93\uFF09" : ""} \xB7 \u8FDB\u884C\u4E2D ${meta?.live ?? 0}` : `\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF1A${down}` }),
    /* @__PURE__ */ jsx2("span", { className: "sd-grow" }),
    /* @__PURE__ */ jsx2("button", { className: "small", onClick: () => {
      invalidateMeta();
      void readMeta(true);
    }, children: "\u91CD\u8BD5" }),
    /* @__PURE__ */ jsx2("button", { className: "small", onClick: restart, children: "\u91CD\u542F\u670D\u52A1" })
  ] });
}
function Empty({ text }) {
  return /* @__PURE__ */ jsx2("div", { className: "sd-hint", style: { padding: 20, textAlign: "center" }, children: text });
}
function SessionsTab({ sessions, onOpen, onRemove, onCreated, onFlash }) {
  return /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ jsx2(NewSessionForm, { onCreated, onFlash }),
    /* @__PURE__ */ jsx2("div", { className: "sd-label", style: { padding: "8px 12px 2px" }, children: "\u4F1A\u8BDD\uFF08\u65B0\u2192\u65E7\uFF0C\u4E0A\u9650 60 \u6761\u7D22\u5F15 / 12 \u4E2A\u8FDB\u884C\u4E2D\uFF09" }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-scroll", style: { flex: 1, minHeight: 0 }, children: [
      sessions.length === 0 && /* @__PURE__ */ jsx2(Empty, { text: "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u3002\u4E0A\u9762\u65B0\u5EFA\u4E00\u4E2A WS \u8FDE\u63A5\u6216 SSE \u6293\u53D6\u3002" }),
      sessions.map((s) => {
        const m = stateMeta(s.state);
        const c = s.counters || {};
        return /* @__PURE__ */ jsxs2("div", { className: "sd-list-row", onClick: () => onOpen(s), children: [
          /* @__PURE__ */ jsx2("span", { className: "sd-badge", style: { background: "#232329", color: "#93C5FD", width: 34, textAlign: "center" }, children: s.kind.toUpperCase() }),
          /* @__PURE__ */ jsxs2("div", { className: "sd-grow", style: { minWidth: 0 }, children: [
            /* @__PURE__ */ jsxs2("div", { className: "sd-row", style: { gap: 6 }, children: [
              /* @__PURE__ */ jsx2("b", { style: { color: "#fff", fontSize: 12 }, children: s.title }),
              /* @__PURE__ */ jsx2(StateBadge, { state: s.state })
            ] }),
            /* @__PURE__ */ jsx2("div", { className: "mono sd-muted", style: { fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: s.url })
          ] }),
          /* @__PURE__ */ jsxs2("span", { className: "sd-muted mono", style: { fontSize: 10.5, flex: "none" }, children: [
            "\u5E27",
            s.frameCount,
            " \u2190",
            c.in || 0,
            " \u2192",
            c.out || 0
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "sd-muted", style: { fontSize: 10.5, flex: "none" }, children: timeStr(s.closedAt || s.createdAt) }),
          /* @__PURE__ */ jsx2("button", { className: "small", onClick: (e) => {
            e.stopPropagation();
            onRemove(s.id);
          }, children: "\u5220" })
        ] }, s.id);
      })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "sd-hint", style: { padding: "6px 12px", borderTop: "1px solid #2A2A31" }, children: "\u63D0\u793A\uFF1A\u6D4F\u89C8\u5668 WebSocket \u63E1\u624B\u4E0D\u80FD\u5E26 Authorization \u5934\u3001EventSource \u53EA\u80FD GET\u2014\u2014\u8FD9\u91CC\u90FD\u884C\uFF08\u670D\u52A1\u7AEF\u539F\u751F\u5BA2\u6237\u7AEF\uFF09\u3002AI \u4E5F\u80FD\u7528\uFF1A\u8BA9\u5B83\u8C03 ws_connect / sse_capture\u3002" })
  ] });
}
var EMPTY_DRAFT = { kind: "ws", url: "", rows: [{ k: "", v: "" }], method: "GET", body: "", subprotocols: "", pingSec: "0", maxEvents: "200", durationMs: "30000", title: "" };
function NewSessionForm({ onCreated, onFlash }) {
  const [d, setD] = useState2(EMPTY_DRAFT);
  const [busy, setBusy] = useState2(false);
  const [showAdv, setShowAdv] = useState2(false);
  const loadedRef = useRef2(false);
  useEffect2(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      try {
        const saved = await (await Promise.resolve().then(() => (init_host(), host_exports))).kvGet(DRAFT_KEY);
        if (saved && saved.url !== void 0) setD({ ...EMPTY_DRAFT, ...saved, rows: saved.rows?.length ? saved.rows : [{ k: "", v: "" }] });
      } catch (_) {
      }
    })();
  }, []);
  useEffect2(() => {
    const t = setTimeout(() => {
      void (async () => {
        try {
          const { kvSet: kvSet2 } = await Promise.resolve().then(() => (init_host(), host_exports));
          await kvSet2(DRAFT_KEY, d);
        } catch (_) {
        }
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [d]);
  const submit = async () => {
    if (busy) return;
    const url = d.url.trim();
    if (!url) {
      onFlash("\u8BF7\u8F93\u5165\u5730\u5740", "err");
      return;
    }
    setBusy(true);
    try {
      const headers = Object.fromEntries(d.rows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v]));
      if (d.kind === "ws") {
        const p = {
          url,
          headers,
          subprotocols: d.subprotocols.split(/[\s,]+/).filter(Boolean),
          pingIntervalSec: Number(d.pingSec) || 0,
          title: d.title.trim() || void 0
        };
        const r = await api.openWs(p);
        onFlash("\u8FDE\u63A5\u8BF7\u6C42\u5DF2\u53D1\u8D77", "ok");
        onCreated(r.session);
      } else {
        const p = {
          url,
          headers,
          method: d.method,
          body: d.method !== "GET" && d.body ? d.body : void 0,
          maxEvents: Number(d.maxEvents) || void 0,
          durationMs: Number(d.durationMs) || void 0,
          title: d.title.trim() || void 0
        };
        const r = await api.openSse(p);
        onFlash("\u6293\u53D6\u5DF2\u5F00\u59CB", "ok");
        onCreated(r.session);
      }
    } catch (e) {
      onFlash(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "sd-card", style: { margin: "10px 12px 0" }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "sd-row", style: { marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx2("div", { className: "sd-row", style: { gap: 0, border: "1px solid #3F3F46", borderRadius: 6, overflow: "hidden" }, children: ["ws", "sse"].map((k) => /* @__PURE__ */ jsx2(
        "button",
        {
          style: { border: "none", borderRadius: 0, padding: "5px 14px", background: d.kind === k ? "#2563EB" : "#232329", color: d.kind === k ? "#fff" : "#9CA3AF" },
          onClick: () => setD({ ...d, kind: k }),
          children: k === "ws" ? "WebSocket" : "SSE / \u6D41\u5F0F"
        },
        k
      )) }),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "sd-grow mono",
          placeholder: d.kind === "ws" ? "ws://127.0.0.1:8080/echo" : "https://api.example.com/v1/chat/stream",
          value: d.url,
          onChange: (e) => setD({ ...d, url: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx2("button", { className: "primary", disabled: busy, onClick: submit, children: busy ? "\u5904\u7406\u4E2D\u2026" : d.kind === "ws" ? "\u8FDE\u63A5" : "\u5F00\u59CB\u6293\u53D6" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-row", style: { alignItems: "flex-start", gap: 10 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "sd-grow", children: [
        /* @__PURE__ */ jsx2("span", { className: "sd-label", children: "\u8BF7\u6C42\u5934\uFF08Authorization \u7B49\u654F\u611F\u503C\u53EA\u5728\u672C\u673A\u4F7F\u7528\uFF0C\u62A5\u544A\u4E2D\u81EA\u52A8\u63A9\u7801\uFF09" }),
        /* @__PURE__ */ jsx2(KvEditor, { rows: d.rows, onChange: (rows) => setD({ ...d, rows }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { width: 170, flex: "none" }, children: [
        d.kind === "ws" ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("span", { className: "sd-label", children: "\u5B50\u534F\u8BAE\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u53EF\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx2("input", { style: { width: "100%" }, value: d.subprotocols, onChange: (e) => setD({ ...d, subprotocols: e.target.value }), placeholder: "chat.v2, binary" }),
          /* @__PURE__ */ jsx2("span", { className: "sd-label", style: { marginTop: 6 }, children: "\u81EA\u52A8 ping \u95F4\u9694\uFF08\u79D2\uFF0C0=\u5173\uFF09" }),
          /* @__PURE__ */ jsx2("input", { style: { width: "100%" }, value: d.pingSec, onChange: (e) => setD({ ...d, pingSec: e.target.value }) })
        ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("span", { className: "sd-label", children: "Method" }),
          /* @__PURE__ */ jsx2("select", { style: { width: "100%" }, value: d.method, onChange: (e) => setD({ ...d, method: e.target.value }), children: ["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => /* @__PURE__ */ jsx2("option", { value: m, children: m }, m)) }),
          /* @__PURE__ */ jsx2("span", { className: "sd-label", style: { marginTop: 6 }, children: "\u4E8B\u4EF6\u4E0A\u9650 / \u65F6\u957F\u4E0A\u9650(ms)" }),
          /* @__PURE__ */ jsxs2("div", { className: "sd-row", children: [
            /* @__PURE__ */ jsx2("input", { style: { width: "50%" }, value: d.maxEvents, onChange: (e) => setD({ ...d, maxEvents: e.target.value }) }),
            /* @__PURE__ */ jsx2("input", { style: { width: "50%" }, value: d.durationMs, onChange: (e) => setD({ ...d, durationMs: e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "sd-label", style: { marginTop: 6 }, children: "\u5907\u6CE8\u540D\uFF08\u53EF\u7A7A\uFF09" }),
        /* @__PURE__ */ jsx2("input", { style: { width: "100%" }, value: d.title, onChange: (e) => setD({ ...d, title: e.target.value }), placeholder: "\u672C\u5730\u8054\u8C03 / \u7ADE\u54C1\u6D41\u6D4B\u2026" })
      ] })
    ] }),
    d.kind === "sse" && d.method !== "GET" && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 6 }, children: [
      /* @__PURE__ */ jsx2("span", { className: "sd-label", children: "\u8BF7\u6C42\u4F53\uFF08POST \u7684 JSON \u7B49\uFF09" }),
      /* @__PURE__ */ jsx2("textarea", { style: { width: "100%", minHeight: 54 }, value: d.body, onChange: (e) => setD({ ...d, body: e.target.value }), placeholder: '{"model":"...","stream":true,"messages":[...]}' })
    ] })
  ] });
}
function useSessionLive(summary, onFlash) {
  const [detail, setDetail] = useState2(null);
  const [live, setLive] = useState2(summary);
  const [frames, setFrames] = useState2([]);
  const seqSet = useRef2(/* @__PURE__ */ new Set());
  const mergeFrames = useCallback((incoming) => {
    setFrames((prev) => {
      const fresh = incoming.filter((f) => !seqSet.current.has(f.seq));
      if (!fresh.length) return prev;
      for (const f of fresh) seqSet.current.add(f.seq);
      const next = [...prev, ...fresh];
      return next.length > 3e3 ? next.slice(next.length - 3e3) : next;
    });
  }, []);
  useEffect2(() => {
    let alive = true;
    let stop = null;
    void (async () => {
      try {
        const d = await api.sessionDetail(summary.id, -1);
        if (!alive) return;
        setDetail(d);
        setLive(d.summary);
        mergeFrames(d.frames);
      } catch (e) {
        if (alive) onFlash(`\u52A0\u8F7D\u4F1A\u8BDD\u5931\u8D25\uFF1A${e.message}`, "err");
        return;
      }
      if (!alive) return;
      stop = streamSession(summary.id, {
        onFrames: mergeFrames,
        onStatus: (s) => setLive(s)
      });
    })();
    return () => {
      alive = false;
      stop?.();
    };
  }, [summary.id]);
  return { detail, live, frames };
}
function ConsoleTab({ summary, onFlash, onChanged }) {
  const { detail, live, frames } = useSessionLive(summary, onFlash);
  const [text, setText] = useState2("");
  const [op, setOp] = useState2("text");
  const [b64, setB64] = useState2("");
  const [closeCode, setCloseCode] = useState2("1000");
  const [closeReason, setCloseReason] = useState2("");
  const [busy, setBusy] = useState2(false);
  const isWs = live.kind === "ws";
  const liveNow = live.state === "open";
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.send(live.id, op === "binary" ? { op, b64 } : { op, text });
      if (op === "binary") setB64("");
      else setText("");
    } catch (e) {
      onFlash(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const doClose = async () => {
    try {
      await api.close(live.id, Number(closeCode) || 1e3, closeReason);
    } catch (e) {
      onFlash(e.message, "err");
    }
  };
  const doReconnect = async () => {
    try {
      const r = await api.reconnect(live.id);
      onChanged();
      onFlash(`\u5DF2\u53D1\u8D77\u91CD\u8FDE \u2192 ${r.session.id}`, "ok");
    } catch (e) {
      onFlash(e.message, "err");
    }
  };
  const exportJsonl = () => {
    const lines = frames.map((f) => JSON.stringify(f)).join("\n");
    const blob = new Blob([lines], { type: "application/x-ndjson" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `streamdesk-${live.id}.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
  };
  const hs = detail?.handshake || null;
  return /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "10px 12px", gap: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "sd-row", children: [
      /* @__PURE__ */ jsx2(StateBadge, { state: live.state }),
      /* @__PURE__ */ jsx2("span", { className: "mono sd-grow", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: live.title }),
      /* @__PURE__ */ jsx2("button", { className: "small", onClick: exportJsonl, children: "\u5BFC\u51FA JSONL" }),
      !liveNow && /* @__PURE__ */ jsx2("button", { className: "small", onClick: doReconnect, children: "\u6309\u539F\u53C2\u6570\u91CD\u8FDE" })
    ] }),
    hs && /* @__PURE__ */ jsxs2("div", { className: "sd-hint", children: [
      "\u63E1\u624B\uFF1A",
      hs.ok ? /* @__PURE__ */ jsxs2("span", { className: "sd-ok", children: [
        "HTTP ",
        hs.httpStatus
      ] }) : /* @__PURE__ */ jsxs2("span", { className: "sd-err", children: [
        "HTTP ",
        hs.httpStatus ?? "\u2014"
      ] }),
      " ",
      "\u5EF6\u8FDF ",
      (0, import_core3.formatMs)(hs.latencyMs || 0),
      hs.error ? /* @__PURE__ */ jsxs2("span", { className: "sd-err", children: [
        " \xB7 ",
        hs.error
      ] }) : null,
      hs.headers && Object.keys(hs.headers).length > 0 && /* @__PURE__ */ jsxs2("details", { style: { marginTop: 4 }, children: [
        /* @__PURE__ */ jsxs2("summary", { className: "sd-muted", style: { cursor: "pointer" }, children: [
          "\u54CD\u5E94\u5934\uFF08\u654F\u611F\u5934\u5DF2\u63A9\u7801 ",
          Object.keys(hs.headers).length,
          " \u4E2A\uFF09"
        ] }),
        /* @__PURE__ */ jsx2("pre", { className: "sd-muted", children: Object.entries(hs.headers).map(([k, v]) => `${k}: ${v}`).join("\n") })
      ] })
    ] }),
    /* @__PURE__ */ jsx2(StatChips, { items: [
      { label: "\u6536", value: String(live.counters?.in || 0) },
      { label: "\u53D1", value: String(live.counters?.out || 0) },
      { label: "PONG", value: String(live.counters?.pongs || 0) },
      { label: "\u5B57\u8282\u2193", value: (0, import_core3.formatBytes)(live.counters?.bytesIn || 0) },
      { label: "\u5B57\u8282\u2191", value: (0, import_core3.formatBytes)(live.counters?.bytesOut || 0) },
      ...live.closedReason ? [{ label: "\u7ED3\u679C", value: live.closedReason, tone: live.state === "error" ? "err" : "muted" }] : []
    ] }),
    /* @__PURE__ */ jsx2(FrameList, { frames, emptyHint: liveNow ? "\u5DF2\u8FDE\u63A5\uFF0C\u8FD8\u6CA1\u6709\u5E27\u3002\u4E0B\u9762\u53D1\u4E00\u6761\u8BD5\u8BD5\u3002" : "\u6682\u65E0\u5E27" }),
    isWs && /* @__PURE__ */ jsxs2("div", { className: "sd-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sd-row", style: { marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs2("select", { value: op, onChange: (e) => setOp(e.target.value), style: { width: 96 }, children: [
          /* @__PURE__ */ jsx2("option", { value: "text", children: "\u6587\u672C" }),
          /* @__PURE__ */ jsx2("option", { value: "binary", children: "\u4E8C\u8FDB\u5236(b64)" }),
          /* @__PURE__ */ jsx2("option", { value: "ping", children: "PING" })
        ] }),
        op === "binary" ? /* @__PURE__ */ jsx2("input", { className: "sd-grow mono", placeholder: "base64 \u8F7D\u8377", value: b64, onChange: (e) => setB64(e.target.value) }) : /* @__PURE__ */ jsx2("input", { className: "sd-grow mono", placeholder: op === "ping" ? "ping \u8F7D\u8377\uFF08\u53EF\u7A7A\uFF0C\u6570\u5B57\u8F7D\u8377\u81EA\u52A8\u6D4B RTT\uFF09" : "\u8981\u53D1\u9001\u7684\u6D88\u606F\u2026", value: text, onChange: (e) => setText(e.target.value) }),
        /* @__PURE__ */ jsx2("button", { className: "primary", disabled: !liveNow || busy, onClick: send, children: "\u53D1\u9001" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "sd-row", children: [
        /* @__PURE__ */ jsx2("span", { className: "sd-muted", children: "\u5173\u95ED\uFF1A" }),
        /* @__PURE__ */ jsx2("input", { style: { width: 70 }, value: closeCode, onChange: (e) => setCloseCode(e.target.value), title: "\u5173\u95ED\u7801" }),
        /* @__PURE__ */ jsx2("input", { className: "sd-grow", placeholder: "\u539F\u56E0\uFF08\u53EF\u7A7A\uFF09", value: closeReason, onChange: (e) => setCloseReason(e.target.value) }),
        /* @__PURE__ */ jsx2("button", { className: "danger small", disabled: !liveNow, onClick: doClose, children: "\u5173\u95ED\u8FDE\u63A5" })
      ] })
    ] })
  ] });
}
function CaptureTab({ summary, onFlash, onChanged }) {
  const { detail, live, frames } = useSessionLive(summary, onFlash);
  const capturing = live.state === "capturing";
  const stats = live.stats || {};
  const gaps = stats.gaps;
  const stop = async () => {
    try {
      await api.stop(live.id);
    } catch (e) {
      onFlash(e.message, "err");
    }
  };
  const exportJsonl = () => {
    const lines = frames.map((f) => JSON.stringify(f)).join("\n");
    const blob = new Blob([lines], { type: "application/x-ndjson" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `streamdesk-${live.id}.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
  };
  return /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "10px 12px", gap: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "sd-row", children: [
      /* @__PURE__ */ jsx2(StateBadge, { state: live.state }),
      /* @__PURE__ */ jsx2("span", { className: "mono sd-grow", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: live.title }),
      capturing && /* @__PURE__ */ jsx2("button", { className: "danger small", onClick: stop, children: "\u505C\u6B62\u6293\u53D6" }),
      /* @__PURE__ */ jsx2("button", { className: "small", onClick: exportJsonl, children: "\u5BFC\u51FA JSONL" }),
      !capturing && /* @__PURE__ */ jsx2("button", { className: "small", onClick: async () => {
        try {
          const r = await api.reconnect(live.id);
          onChanged();
          onFlash(`\u5DF2\u6309\u539F\u53C2\u6570\u91CD\u65B0\u6293\u53D6 \u2192 ${r.session.id}`, "ok");
        } catch (e) {
          onFlash(e.message, "err");
        }
      }, children: "\u91CD\u65B0\u6293\u53D6" })
    ] }),
    detail?.handshake && /* @__PURE__ */ jsxs2("div", { className: "sd-hint", children: [
      "\u54CD\u5E94\uFF1A",
      detail.handshake.ok ? /* @__PURE__ */ jsxs2("span", { className: "sd-ok", children: [
        "HTTP ",
        detail.handshake.httpStatus
      ] }) : /* @__PURE__ */ jsxs2("span", { className: "sd-err", children: [
        "HTTP ",
        detail.handshake.httpStatus ?? "\u2014"
      ] }),
      " ",
      (0, import_core3.formatMs)(detail.handshake.latencyMs || 0),
      detail.handshake.error ? /* @__PURE__ */ jsxs2("span", { className: "sd-err", children: [
        " \xB7 ",
        detail.handshake.error
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx2(StatChips, { items: [
      { label: "TTFT", value: stats.ttftMs != null ? (0, import_core3.formatMs)(stats.ttftMs) : "\u2014", tone: (stats.ttftMs || 0) > 3e3 ? "warn" : "ok" },
      { label: "\u9996\u4E8B\u4EF6", value: stats.firstEventMs != null ? (0, import_core3.formatMs)(stats.firstEventMs) : "\u2014" },
      { label: "\u4E8B\u4EF6", value: String(stats.eventCount || 0) },
      { label: "\u5B57\u8282", value: (0, import_core3.formatBytes)(stats.bytes || 0) },
      { label: "\u95F4\u9694 p95", value: gaps ? (0, import_core3.formatMs)(gaps.p95) : "\u2014", tone: gaps && gaps.p95 > 2e3 ? "warn" : "ok" },
      { label: "\u95F4\u9694\u6700\u5927", value: gaps ? (0, import_core3.formatMs)(gaps.max) : "\u2014" },
      ...stats.comments ? [{ label: "\u5FC3\u8DF3\u884C", value: String(stats.comments), tone: "muted" }] : [],
      ...live.closedReason ? [{ label: "\u7ED3\u679C", value: live.closedReason, tone: live.state === "error" ? "err" : "muted" }] : []
    ] }),
    /* @__PURE__ */ jsx2(FrameList, { frames, emptyHint: capturing ? "\u6293\u53D6\u4E2D\uFF0C\u7B49\u5F85\u4E8B\u4EF6\u2026" : "\u6682\u65E0\u4E8B\u4EF6" }),
    gaps && gaps.count > 3 && /* @__PURE__ */ jsxs2("div", { className: "sd-hint sd-muted", children: [
      "\u95F4\u9694\u5206\u5E03\uFF1Amin ",
      (0, import_core3.formatMs)(gaps.min),
      " \xB7 \u4E2D\u4F4D ",
      (0, import_core3.formatMs)(gaps.median),
      " \xB7 \u5747\u503C ",
      (0, import_core3.formatMs)(gaps.mean),
      " \xB7 p95 ",
      (0, import_core3.formatMs)(gaps.p95),
      " \xB7 max ",
      (0, import_core3.formatMs)(gaps.max),
      gaps.p95 > 2e3 ? " \u2014\u2014 p95 \u504F\u9AD8\uFF0C\u6D41\u6709\u5361\u987F\u6BB5\u843D" : " \u2014\u2014 \u6D41\u901F\u5E73\u7A33"
    ] })
  ] });
}
function SettingsTab({ onFlash }) {
  const [s, setS] = useState2(null);
  const [meta, setMeta] = useState2(null);
  useEffect2(() => {
    void (async () => {
      try {
        setS((await api.settings()).settings);
      } catch (e) {
        onFlash(e.message, "err");
      }
      try {
        setMeta(await api.meta());
      } catch (_) {
      }
    })();
  }, []);
  if (!s) return /* @__PURE__ */ jsx2(Empty, { text: "\u8BBE\u7F6E\u52A0\u8F7D\u4E2D\uFF08\u670D\u52A1\u4E0D\u53EF\u8FBE\u65F6\u65E0\u6CD5\u52A0\u8F7D\uFF09\u2026" });
  const num = (k, label, hint) => /* @__PURE__ */ jsxs2("div", { className: "sd-row", style: { marginBottom: 6 }, children: [
    /* @__PURE__ */ jsx2("span", { style: { width: 190, flex: "none" }, className: "sd-hint", children: label }),
    /* @__PURE__ */ jsx2("input", { style: { width: 100 }, value: String(s[k]), onChange: (e) => setS({ ...s, [k]: Number(e.target.value) || 0 }) }),
    /* @__PURE__ */ jsx2("span", { className: "sd-muted sd-hint sd-grow", children: hint })
  ] });
  const save = async () => {
    try {
      setS((await api.saveSettings(s)).settings);
      onFlash("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58", "ok");
    } catch (e) {
      onFlash(e.message, "err");
    }
  };
  const clearHistory = async () => {
    if (!window.confirm("\u6E05\u7406\u5168\u90E8\u5386\u53F2 transcript \u4E0E\u5DF2\u7ED3\u675F\u4F1A\u8BDD\uFF1F\uFF08\u8FDB\u884C\u4E2D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\uFF09")) return;
    try {
      await api.clearHistory();
      onFlash("\u5386\u53F2\u5DF2\u6E05\u7406", "ok");
    } catch (e) {
      onFlash(e.message, "err");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "sd-scroll", style: { flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "sd-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "sd-label", style: { marginBottom: 8 }, children: "\u6293\u53D6\u4E0E\u7F13\u51B2" }),
      num("maxFrames", "\u6BCF\u4F1A\u8BDD\u5E27\u7F13\u51B2\u4E0A\u9650", "\u73AF\u5F62\u7F13\u51B2\uFF0C\u8D85\u51FA\u6DD8\u6C70\u6700\u65E7\uFF0850\u20135000\uFF09"),
      num("frameBodyCap", "\u5355\u5E27\u4F53\u622A\u65AD\u4E0A\u9650(\u5B57\u7B26)", "\u8D85\u51FA\u90E8\u5206\u4EE5\u622A\u65AD\u6807\u8BB0\u5448\u73B0\uFF08256\u2013262144\uFF09"),
      num("pingIntervalSec", "\u9ED8\u8BA4\u81EA\u52A8 ping \u95F4\u9694(\u79D2)", "\u65B0 WS \u4F1A\u8BDD\u7684\u9ED8\u8BA4\u503C\uFF0C0=\u5173"),
      num("sseMaxEvents", "SSE \u9ED8\u8BA4\u4E8B\u4EF6\u4E0A\u9650", "\u6BCF\u6B21\u6293\u53D6\u9ED8\u8BA4\u505C\u5728\u8FD9\u4E2A\u4E8B\u4EF6\u6570\uFF0810\u201310000\uFF09"),
      num("sseDurationMsMax", "SSE \u65F6\u957F\u4E0A\u9650(ms)", "\u5355\u6B21\u6293\u53D6\u6700\u957F\u65F6\u957F\uFF081000\u2013600000\uFF09"),
      num("transcriptTail", "transcript \u5C3E\u90E8\u5E27\u6570", "\u843D kv \u7684\u5386\u53F2\u4FDD\u7559\u6700\u540E N \u5E27\uFF0810\u20131000\uFF09"),
      /* @__PURE__ */ jsxs2("div", { className: "sd-row", style: { marginTop: 4 }, children: [
        /* @__PURE__ */ jsx2("span", { style: { width: 190, flex: "none" }, className: "sd-hint", children: "\u51FA\u7AD9\u63A9\u7801" }),
        /* @__PURE__ */ jsxs2("label", { className: "sd-hint sd-row", style: { gap: 6, cursor: "pointer" }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: s.maskHeaders, onChange: (e) => setS({ ...s, maskHeaders: e.target.checked }), style: { padding: 0 } }),
          "\u843D kv / AI \u62A5\u544A\u4E2D\u7684\u654F\u611F\u5934\u63A9\u7801\uFF08cookie/authorization \u6052\u63A9\uFF0C\u6B64\u9879\u63A7\u5236\u5176\u4F59 secret/token \u7C7B\u5934\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx2("button", { className: "primary", onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "sd-label", style: { marginBottom: 6 }, children: "\u670D\u52A1" }),
      /* @__PURE__ */ jsxs2("div", { className: "sd-hint", children: [
        "\u7248\u672C v",
        meta?.version || "?",
        " \xB7 \u8FD0\u884C ",
        meta ? (0, import_core3.formatMs)(meta.uptime) : "\u2014",
        " \xB7 \u8FDB\u884C\u4E2D ",
        meta?.live ?? 0,
        " \xB7 kv ",
        meta?.kvEndpoint || "\u4E0D\u53EF\u8FBE\uFF08\u964D\u7EA7\u6A21\u5F0F\uFF09",
        /* @__PURE__ */ jsx2("br", {}),
        "\u8FDB\u884C\u4E2D\u4F1A\u8BDD\u7684\u5E27\u53EA\u5728\u5185\u5B58\uFF0C\u670D\u52A1\u91CD\u542F\u4E0D\u6062\u590D\uFF08\u7D22\u5F15\u91CC\u6807\u300C\u5DF2\u4E2D\u65AD\u300D\uFF09\uFF1B\u5DF2\u7ED3\u675F\u4F1A\u8BDD\u7684 transcript \u63A9\u7801\u540E\u843D cap.kv\u3002"
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx2("button", { className: "danger small", onClick: clearHistory, children: "\u6E05\u7406\u5168\u90E8\u5386\u53F2 transcript" }) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sd-card sd-hint", children: [
      /* @__PURE__ */ jsx2("div", { className: "sd-label", children: "AI \u8054\u52A8" }),
      "\u5BF9 Polaris \u91CC\u7684 AI \u8BF4\u300C\u7528\u957F\u8FDE\u63A5\u8C03\u8BD5\u53F0\u8FDE\u4E00\u4E0B ws://\u2026 \u53D1\u6761\u6D88\u606F\u770B\u56DE\u4EC0\u4E48\u300D\u6216\u300C\u6293\u53D6\u8FD9\u4E2A SSE \u63A5\u53E3 30 \u79D2\u770B\u4E8B\u4EF6\u957F\u4EC0\u4E48\u6837\u300D\uFF0C \u5B83\u4F1A\u7ECF MCP \u5DE5\u5177 ws_connect / ws_send / ws_wait_frame / sse_capture \u4EE3\u52B3\uFF0C\u7ED3\u679C\u81EA\u52A8\u63A9\u7801\u3002"
    ] })
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
