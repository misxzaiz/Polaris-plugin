var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
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
    var crypto = __require("crypto");
    var VERSION = "0.1.0";
    var K = {
      settings: "mdk.settings",
      // {smtpPort} 用户配置(3s 热更)
      service: "mdk.service",
      // {port, smtpPort, token, pid, version, startedAt} 服务发现
      meta: "mdk.meta",
      // {version, count, totalBytes, smtpListening, updatedAt} 心跳(60s)
      selftest: "mdk.selftest"
      // 最近一次自检报告
    };
    var LIMITS = {
      maxMailCount: 500,
      // 环形数量上限
      maxTotalBytes: 200 * 1024 * 1024,
      // 200MB 环形总字节上限
      maxSingleMailBytes: 5 * 1024 * 1024,
      // 单封 5MB(SMTP size 与入库双闸)
      maxAttachmentB64: 8 * 1024 * 1024,
      // 附件经 base64 下发的上限(超出拒绝并提示)
      maxRawPreviewBytes: 200 * 1024
      // 原文预览截断阈值
    };
    var DEFAULTS = {
      httpPort: 9875,
      smtpPort: 1025,
      httpProbe: 10,
      // HTTP 端口冲突探测数
      smtpProbe: 10
      // SMTP 端口冲突探测数
    };
    function norm(s) {
      return String(s == null ? "" : s).toLowerCase();
    }
    function mailMatches(mail, query) {
      const q = norm(query).trim();
      if (!q) return true;
      const hay = norm(
        [mail.subject, mail.fromText, mail.toText, mail.textPreview].map((v) => v || "").join("\n")
      );
      return hay.includes(q);
    }
    function pageArgs(query, offset, limit) {
      const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
      const o = Math.max(0, parseInt(offset, 10) || 0);
      return { query: String(query == null ? "" : query), offset: o, limit: l };
    }
    var REMOTE_ATTRS = [
      ["img", "src"],
      ["image", "href"],
      // SVG <image href>
      ["source", "src"],
      ["video", "src"],
      ["audio", "src"],
      ["track", "src"],
      ["input", "src"]
    ];
    function isLocalUrl(u) {
      const s = String(u || "").trim().toLowerCase();
      if (s.startsWith("data:") || s.startsWith("cid:") || s.startsWith("#")) return true;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return true;
      return false;
    }
    function filterRemoteResources2(html, allowRemote) {
      const raw = String(html == null ? "" : html);
      if (!raw) return { html: "", blocked: 0 };
      if (allowRemote) return { html: raw, blocked: 0 };
      let blocked = 0;
      let out = raw;
      for (const [tag, attr] of REMOTE_ATTRS) {
        const re = new RegExp(`<${tag}(\\s[^>]*?)?\\s${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))["']?`, "gi");
        out = out.replace(re, (m, pre, _q, dq, sq, uq) => {
          const url = dq != null ? dq : sq != null ? sq : uq || "";
          if (isLocalUrl(url)) return m;
          blocked += 1;
          const placeholder = "data:image/svg+xml," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="18"><rect width="120" height="18" fill="#8882"/><text x="6" y="13" font-size="11" fill="#888">\u8FDC\u7A0B\u56FE\u5DF2\u963B\u65AD</text></svg>'
          );
          const rest = m.slice(m.toLowerCase().indexOf(attr.toLowerCase()));
          const head = m.slice(0, m.length - rest.length);
          return `${head}${attr}="${placeholder}" data-mdk-remote="${String(url).replace(/"/g, "&quot;")}"`;
        });
      }
      out = out.replace(/url\(\s*(['"]?)(https?:\/\/[^)'"]+)\1\s*\)/gi, () => {
        blocked += 1;
        return `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')}")`;
      });
      return { html: out, blocked };
    }
    var CODE_KEYWORDS = ["\u9A8C\u8BC1\u7801", "\u6821\u9A8C\u7801", "code", "otp", "verification", "verify", "confirm", "pin", "captcha"];
    function extractCodes(text) {
      const src = String(text == null ? "" : text);
      if (!src) return [];
      const lines = src.split(/\r?\n/);
      const scored = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLower = norm(line);
        const prev = i > 0 ? lines[i - 1] : "";
        const prevLower = norm(prev);
        const hasKw = (s) => CODE_KEYWORDS.some((k) => s.includes(k));
        const kw = hasKw(lineLower) || prev.length <= 40 && hasKw(prevLower);
        const re = /\b([0-9]{6,8})\b|\b([A-Z0-9]{4,8})\b/gi;
        let m;
        while ((m = re.exec(line)) !== null) {
          const token = m[1] || m[2];
          if (!token) continue;
          const isDigits = /^\d{6,8}$/.test(token);
          const hasLettersAndDigits = /^(?=.*\d)(?=.*[a-zA-Z])[A-Za-z0-9]{4,8}$/.test(token);
          if (!isDigits && !hasLettersAndDigits) continue;
          if (/^(test|demo|none|null|true|false|http|https|html|email|mail)$/i.test(token)) continue;
          scored.push({ code: token, score: (isDigits ? 2 : 1) + (kw ? 2 : 0) });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const s of scored) {
        if (seen.has(s.code)) continue;
        seen.add(s.code);
        out.push(s.code);
        if (out.length >= 5) break;
      }
      return out;
    }
    function evictPlan(items, maxCount, maxBytes) {
      let total = 0;
      for (const it of items) total += it.sizeBytes || 0;
      const drop = [];
      let i = 0;
      while (i < items.length - 1 && (items.length - drop.length > maxCount || total > maxBytes)) {
        drop.push(items[i].id);
        total -= items[i].sizeBytes || 0;
        i++;
      }
      return drop;
    }
    function newMailId() {
      return `m_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
    }
    module.exports = {
      VERSION,
      K,
      LIMITS,
      DEFAULTS,
      mailMatches,
      pageArgs,
      filterRemoteResources: filterRemoteResources2,
      isLocalUrl,
      extractCodes,
      CODE_KEYWORDS,
      evictPlan,
      newMailId
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState3 } from "react";

// src/Detail.tsx
import { useMemo, useState } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528:\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__(\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528)");
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
function sendToChat(text) {
  const fn = hostWindow().__POLARIS_SEND_TO_CHAT__;
  if (typeof fn !== "function") return false;
  fn(text);
  return true;
}
async function restartService(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}
async function autostartServices() {
  await capDispatch("cap.pluginServiceManager", { action: "autostart" });
}

// src/model.ts
var PLUGIN_ID = "mail-desk";
var SERVICE_ID = "mail-desk-service";
var SvcError = class extends Error {
};
var cachedSvc = null;
var cachedAt = 0;
async function readSvc(force = false) {
  if (!force && cachedSvc && Date.now() - cachedAt < 1e4) return cachedSvc;
  const v = await kvGet("mdk.service");
  if (v && typeof v.port === "number" && v.token) {
    cachedSvc = v;
    cachedAt = Date.now();
    return v;
  }
  return null;
}
function invalidateSvc() {
  cachedSvc = null;
}
async function svcRequest(method, apiPath, body) {
  const svc = await readSvc();
  if (!svc) throw new SvcError("\u670D\u52A1\u672A\u5C31\u7EEA(mdk.service \u7F3A\u5931):\u670D\u52A1\u53EF\u80FD\u5728\u542F\u52A8\u4E2D,\u53EF\u70B9\u300C\u91CD\u542F\u670D\u52A1\u300D");
  let res;
  try {
    res = await capDispatch("cap.http", {
      action: "request",
      method,
      url: `http://127.0.0.1:${svc.port}${apiPath}`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc.token}` },
      ...body != null ? { body: JSON.stringify(body), bodyType: "json" } : {},
      timeoutMs: 3e4
    });
  } catch (e) {
    invalidateSvc();
    throw new SvcError(`\u5BBF\u4E3B\u8F6C\u53D1\u901A\u9053\u4E0D\u53EF\u7528(${e.message}):\u53EF\u70B9\u300C\u91CD\u542F\u670D\u52A1\u300D\u81EA\u6551`);
  }
  let parsed = null;
  try {
    parsed = JSON.parse(String(res.body ?? ""));
  } catch (_) {
    parsed = null;
  }
  const status = res.status ?? 0;
  if (!parsed || status >= 400) {
    throw new SvcError(parsed?.error || `\u670D\u52A1 HTTP ${status || "\u65E0\u54CD\u5E94"}`);
  }
  return parsed;
}
var api = {
  meta: () => svcRequest("GET", "/api/meta"),
  list: (query, offset = 0, limit = 50) => svcRequest("GET", `/api/mail?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`),
  detail: (id) => svcRequest("GET", `/api/mail/${encodeURIComponent(id)}`),
  raw: (id) => svcRequest("GET", `/api/mail/${encodeURIComponent(id)}/raw`),
  attachment: (id, idx) => svcRequest("GET", `/api/mail/${encodeURIComponent(id)}/attach/${idx}`),
  remove: (id) => svcRequest("DELETE", `/api/mail/${encodeURIComponent(id)}`),
  clear: () => svcRequest("POST", "/api/clear", {}),
  setSmtpPort: (smtpPort) => svcRequest("POST", "/api/settings", { smtpPort }),
  selftest: () => svcRequest("POST", "/api/selftest", {}),
  selftestLast: () => svcRequest("GET", "/api/selftest")
};

// src/Detail.tsx
var import_core = __toESM(require_core());
import { jsx, jsxs } from "react/jsx-runtime";
function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
function fmtTime(s) {
  const iso = s.date || new Date(s.receivedAt).toISOString();
  return iso.replace("T", " ").slice(0, 19);
}
function Detail(props) {
  const { mail, detail, loading, error } = props;
  const [sub, setSub] = useState(mail.hasHtml ? "html" : "text");
  const [allowRemote, setAllowRemote] = useState(false);
  const [rawText, setRawText] = useState(null);
  const [rawTruncated, setRawTruncated] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const filtered = useMemo(() => {
    if (!detail || !detail.html) return { html: "", blocked: 0 };
    return (0, import_core.filterRemoteResources)(detail.html, allowRemote);
  }, [detail, allowRemote]);
  async function loadRaw() {
    if (rawText != null) return;
    try {
      const r = await api.raw(mail.id);
      setRawText(r.raw);
      setRawTruncated(r.truncated);
    } catch (e) {
      props.toast(`\u539F\u6587\u8BFB\u53D6\u5931\u8D25:${e.message}`, "bad");
      setRawText("(\u8BFB\u53D6\u5931\u8D25)");
    }
  }
  function switchSub(t) {
    setSub(t);
    if (t === "raw") void loadRaw();
  }
  async function downloadAttachment(idx, filename) {
    try {
      const a = await api.attachment(mail.id, idx);
      const bin = atob(a.dataB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: a.contentType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = filename || "attachment";
      el.click();
      setTimeout(() => URL.revokeObjectURL(url), 5e3);
      props.toast(`\u5DF2\u4E0B\u8F7D ${filename}`, "good");
    } catch (e) {
      props.toast(`\u9644\u4EF6\u4E0B\u8F7D\u5931\u8D25:${e.message}`, "bad");
    }
  }
  function copy(text) {
    try {
      void navigator.clipboard.writeText(text);
      props.toast("\u5DF2\u590D\u5236", "good");
    } catch (_) {
      props.toast("\u590D\u5236\u5931\u8D25", "bad");
    }
  }
  function sendToAI() {
    if (!detail) return;
    const parts = [`\u5E2E\u6211\u5206\u6790\u8FD9\u5C01\u6D4B\u8BD5\u90AE\u4EF6:
\u4E3B\u9898:${mail.subject}
\u53D1\u4EF6\u4EBA:${mail.fromText}`];
    if (detail.codes && detail.codes.length) parts.push(`\u7591\u4F3C\u9A8C\u8BC1\u7801:${detail.codes.join(", ")}`);
    if (detail.text) parts.push(`\u6B63\u6587:
${detail.text.slice(0, 2e3)}`);
    else if (detail.html) parts.push("(\u6B63\u6587\u662F HTML \u7248,\u9762\u677F\u53EF\u9884\u89C8)");
    const okSend = sendToChat(parts.join("\n"));
    props.toast(okSend ? "\u5DF2\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD" : "\u53D1\u9001\u5931\u8D25:\u5BBF\u4E3B\u672A\u63D0\u4F9B sendToChat \u6865", okSend ? "good" : "bad");
  }
  async function deleteMail() {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.remove(mail.id);
      props.toast("\u5DF2\u5220\u9664", "good");
      props.onDeleted();
    } catch (e) {
      props.toast(`\u5220\u9664\u5931\u8D25:${e.message}`, "bad");
      setDeleting(false);
    }
  }
  const btnStyle = {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 6,
    border: "1px solid #3f3f46",
    background: "transparent",
    color: "#a1a1aa",
    cursor: "pointer"
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid #27272a", minWidth: 320, flex: 1.4 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #27272a", display: "flex", flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 600, color: "#f4f4f5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: mail.subject }),
        /* @__PURE__ */ jsx("button", { style: btnStyle, onClick: sendToAI, children: "\u53D1\u7ED9 AI" }),
        /* @__PURE__ */ jsx("button", { style: { ...btnStyle, color: "#f87171", borderColor: "#7f1d1d" }, onClick: deleteMail, children: deleting ? "\u2026" : "\u5220\u9664" }),
        /* @__PURE__ */ jsx("button", { style: btnStyle, onClick: props.onClose, children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#71717a", display: "flex", gap: 12, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "\u6765\u81EA ",
          mail.fromText || "(\u672A\u77E5)"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5230 ",
          mail.toText || "(\u672A\u6307\u5B9A)"
        ] }),
        /* @__PURE__ */ jsx("span", { children: fmtTime(mail) }),
        /* @__PURE__ */ jsx("span", { children: fmtBytes(mail.sizeBytes) })
      ] }),
      detail && detail.codes && detail.codes.length > 0 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#d29922" }, children: "\u7591\u4F3C\u9A8C\u8BC1\u7801:" }),
        detail.codes.map((c) => /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => copy(c),
            style: {
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1.5,
              padding: "2px 10px",
              borderRadius: 6,
              background: "rgba(210,153,34,.15)",
              color: "#d29922",
              border: "1px solid rgba(210,153,34,.35)",
              cursor: "pointer"
            },
            title: "\u70B9\u51FB\u590D\u5236",
            children: c
          },
          c
        ))
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 2 }, children: [
        [["html", "HTML \u9884\u89C8"], ["text", "\u7EAF\u6587\u672C"], ["raw", "\u539F\u59CB\u62A5\u6587"], ["attach", `\u9644\u4EF6${mail.attachments.length ? `(${mail.attachments.length})` : ""} `]].map(([id, label]) => /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => switchSub(id),
            style: {
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: "none",
              background: sub === id ? "rgba(88,101,242,.2)" : "transparent",
              color: sub === id ? "#a5b4fc" : "#71717a"
            },
            children: label.trim()
          },
          id
        )),
        sub === "html" && filtered.blocked > 0 && /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setAllowRemote(!allowRemote),
            style: { fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #3f3f46", background: "transparent", color: allowRemote ? "#d29922" : "#a1a1aa", marginLeft: "auto" },
            children: allowRemote ? "\u5DF2\u5141\u8BB8\u8FDC\u7A0B\u56FE(\u518D\u70B9\u6062\u590D\u963B\u65AD)" : `${filtered.blocked} \u4E2A\u8FDC\u7A0B\u8D44\u6E90\u5DF2\u963B\u65AD\xB7\u653E\u884C`
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflow: "auto", background: "#131316" }, children: [
      loading && /* @__PURE__ */ jsx("div", { style: { padding: 16, color: "#71717a", fontSize: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" }),
      error && /* @__PURE__ */ jsx("div", { style: { padding: 16, color: "#f87171", fontSize: 12 }, children: error }),
      !loading && !error && detail && sub === "html" && (detail.html ? /* @__PURE__ */ jsx(
        "iframe",
        {
          title: "\u90AE\u4EF6 HTML \u9884\u89C8",
          sandbox: "",
          srcDoc: filtered.html,
          style: { width: "100%", height: "100%", border: "none", background: "#fff" }
        }
      ) : /* @__PURE__ */ jsx("div", { style: { padding: 16, color: "#52525b", fontSize: 12 }, children: "\u8FD9\u5C01\u90AE\u4EF6\u6CA1\u6709 HTML \u90E8\u5206" })),
      !loading && !error && detail && sub === "text" && /* @__PURE__ */ jsx("pre", { style: { margin: 0, padding: 12, fontSize: 12, lineHeight: 1.6, color: "#d4d4d8", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit" }, children: detail.text || "(\u65E0\u7EAF\u6587\u672C\u90E8\u5206)" }),
      !loading && !error && sub === "raw" && /* @__PURE__ */ jsxs("pre", { style: { margin: 0, padding: 12, fontSize: 11, lineHeight: 1.5, color: "#a1a1aa", whiteSpace: "pre-wrap", wordBreak: "break-all" }, children: [
        rawText == null ? "\u52A0\u8F7D\u4E2D\u2026" : rawText,
        rawTruncated ? "\n\u2026(\u539F\u6587\u8FC7\u957F\u5DF2\u622A\u65AD;\u5B8C\u6574\u539F\u6587\u5728\u670D\u52A1\u5B58\u50A8\u76EE\u5F55)" : ""
      ] }),
      !loading && !error && sub === "attach" && (mail.attachments.length ? /* @__PURE__ */ jsx("div", { style: { padding: 10, display: "flex", flexDirection: "column", gap: 6 }, children: mail.attachments.map((a, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "#1c1c1f" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "#d4d4d8", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }, children: a.filename }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#52525b" }, children: a.contentType }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#52525b" }, children: fmtBytes(a.size) }),
        /* @__PURE__ */ jsx("button", { style: btnStyle, onClick: () => void downloadAttachment(i, a.filename), children: "\u4E0B\u8F7D" })
      ] }, i)) }) : /* @__PURE__ */ jsx("div", { style: { padding: 16, color: "#52525b", fontSize: 12 }, children: "\u65E0\u9644\u4EF6" }))
    ] })
  ] });
}

// src/Settings.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SNIPPETS = [
  {
    name: "Nodemailer / Node.js",
    code: `const transporter = nodemailer.createTransport({
  host: '127.0.0.1',
  port: 1025,
  secure: false,
  tls: { rejectUnauthorized: false },
})`
  },
  {
    name: "Spring Boot (application.properties)",
    code: `spring.mail.host=127.0.0.1
spring.mail.port=1025
spring.mail.properties.mail.smtp.auth=false
spring.mail.properties.mail.smtp.starttls.enable=false`
  },
  {
    name: "Django (settings.py)",
    code: `EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = '127.0.0.1'
EMAIL_PORT = 1025
EMAIL_USE_TLS = False`
  },
  {
    name: "Flask (app.config)",
    code: `app.config['MAIL_SERVER'] = '127.0.0.1'
app.config['MAIL_PORT'] = 1025
app.config['MAIL_USE_TLS'] = False`
  },
  {
    name: "Laravel (.env)",
    code: `MAIL_MAILER=smtp
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
MAIL_ENCRYPTION=null`
  },
  {
    name: "SMTP \u901A\u7528(\u4EFB\u610F\u5BA2\u6237\u7AEF)",
    code: `Host: 127.0.0.1
Port: 1025
Encryption: None / STARTTLS(\u5982\u5BA2\u6237\u7AEF\u5F3A\u5236)
Auth: \u65E0(catch-all \u5168\u6536)`
  }
];
function Settings(props) {
  const { meta } = props;
  const [port, setPort] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [copied, setCopied] = useState2("");
  const [confirmingClear, setConfirmingClear] = useState2(false);
  async function savePort() {
    const p = parseInt(port, 10);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      props.toast("\u7AEF\u53E3\u975E\u6CD5(1-65535)", "bad");
      return;
    }
    setBusy(true);
    try {
      const r = await api.setSmtpPort(p);
      props.toast(r.note || "\u5DF2\u5199\u5165\u914D\u7F6E", "good");
      setPort("");
      props.onChanged();
    } catch (e) {
      props.toast(`\u4FDD\u5B58\u5931\u8D25:${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  }
  async function runSelftest() {
    setBusy(true);
    try {
      const r = await api.selftest();
      props.onChanged();
      props.toast(r.ok ? `\u81EA\u68C0\u901A\u8FC7(${r.elapsedMs}ms),\u6536\u4FE1\u94FE\u8DEF\u6B63\u5E38` : `\u81EA\u68C0\u5931\u8D25:${r.error || "\u672A\u77E5"}`, r.ok ? "good" : "bad");
    } catch (e) {
      props.toast(`\u81EA\u68C0\u5931\u8D25:${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  }
  async function clearAll() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    try {
      const r = await api.clear();
      props.toast(`\u5DF2\u6E05\u7A7A ${r.cleared} \u5C01`, "good");
      props.onChanged();
    } catch (e) {
      props.toast(`\u6E05\u7A7A\u5931\u8D25:${e.message}`, "bad");
    }
  }
  function copySnippet(code, name) {
    try {
      void navigator.clipboard.writeText(code);
      setCopied(name);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (_) {
    }
  }
  const label = { fontSize: 11, color: "#71717a" };
  const input = {
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid #3f3f46",
    background: "#18181b",
    color: "#e4e4e7",
    width: 110
  };
  const btn = {
    fontSize: 12,
    padding: "5px 14px",
    borderRadius: 6,
    border: "1px solid #3f3f46",
    background: "rgba(88,101,242,.15)",
    color: "#a5b4fc",
    cursor: "pointer"
  };
  return /* @__PURE__ */ jsxs2("div", { style: { padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }, children: [
    /* @__PURE__ */ jsxs2("section", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 13, fontWeight: 600, color: "#f4f4f5" }, children: "SMTP \u6536\u4FE1\u53E3" }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 12, color: "#d4d4d8" }, children: [
          "\u5F53\u524D:",
          /* @__PURE__ */ jsxs2("code", { style: { padding: "2px 6px", background: "#1c1c1f", borderRadius: 4 }, children: [
            "127.0.0.1:",
            meta?.smtpPort ?? "\u2026"
          ] }),
          /* @__PURE__ */ jsx2("span", { style: { marginLeft: 8, fontSize: 10, color: meta?.smtpListening ? "#3fb950" : "#f87171" }, children: meta?.smtpListening ? "\u76D1\u542C\u4E2D" : `\u672A\u76D1\u542C${meta?.smtpLastError ? `(${meta.smtpLastError})` : ""}` })
        ] }),
        /* @__PURE__ */ jsx2("span", { style: label, children: "\u6539\u7AEF\u53E3(1-65535;\u6539\u540E 3s \u5185\u70ED\u66F4):" }),
        /* @__PURE__ */ jsx2("input", { style: input, value: port, placeholder: String(meta?.smtpPort ?? 1025), onChange: (e) => setPort(e.target.value) }),
        /* @__PURE__ */ jsx2("button", { style: btn, disabled: busy, onClick: () => void savePort(), children: "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 11, color: "#52525b" }, children: "\u53EA\u7ED1 127.0.0.1,\u5916\u90E8\u673A\u5668\u4E0D\u53EF\u8FBE;catch-all \u5168\u6536\u4E0D\u8F6C\u53D1,\u4EE3\u7801\u91CC\u4E0D\u5B58\u5728\u5916\u53D1\u8DEF\u5F84;\u5355\u5C01\u4E0A\u9650 5MB\u3002" })
    ] }),
    /* @__PURE__ */ jsxs2("section", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 13, fontWeight: 600, color: "#f4f4f5" }, children: "\u81EA\u68C0(\u8BD5\u91D1\u77F3)" }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
        /* @__PURE__ */ jsx2("button", { style: btn, disabled: busy, onClick: () => void runSelftest(), children: "\u8FD0\u884C\u81EA\u68C0" }),
        props.selftest && /* @__PURE__ */ jsxs2("span", { style: { fontSize: 11, color: props.selftest.ok ? "#3fb950" : "#f87171" }, children: [
          "\u4E0A\u6B21:",
          props.selftest.ok ? "\u901A\u8FC7" : `\u5931\u8D25(${props.selftest.error || "\u672A\u77E5"})`,
          " \xB7 ",
          props.selftest.at.replace("T", " ").slice(0, 19)
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 11, color: "#52525b" }, children: "\u5411\u672C\u673A SMTP \u53E3\u53D1\u4E00\u5C01\u771F\u4FE1\u5E76\u65AD\u8A00\u6536\u5230,\u7AEF\u5230\u7AEF\u9A8C\u8BC1\u6536\u4FE1\u94FE\u8DEF\u3002" })
    ] }),
    /* @__PURE__ */ jsxs2("section", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 13, fontWeight: 600, color: "#f4f4f5" }, children: "\u628A\u5E94\u7528\u7684\u90AE\u4EF6\u53D1\u5230\u8FD9\u91CC(\u914D\u7F6E\u7247\u6BB5)" }),
      SNIPPETS.map((s) => /* @__PURE__ */ jsxs2("div", { style: { border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }, children: [
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", padding: "5px 10px", background: "#1c1c1f" }, children: [
          /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, color: "#a1a1aa", flex: 1 }, children: s.name }),
          /* @__PURE__ */ jsx2("button", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", cursor: "pointer" }, onClick: () => copySnippet(s.code, s.name), children: copied === s.name ? "\u5DF2\u590D\u5236" : "\u590D\u5236" })
        ] }),
        /* @__PURE__ */ jsx2("pre", { style: { margin: 0, padding: 10, fontSize: 11, lineHeight: 1.5, color: "#a1a1aa", overflow: "auto" }, children: s.code })
      ] }, s.name))
    ] }),
    /* @__PURE__ */ jsxs2("section", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 13, fontWeight: 600, color: "#f4f4f5" }, children: "\u5B58\u50A8" }),
      meta && /* @__PURE__ */ jsxs2("div", { style: { fontSize: 11, color: "#71717a", lineHeight: 1.8 }, children: [
        "\u76EE\u5F55:",
        /* @__PURE__ */ jsx2("code", { style: { padding: "1px 5px", background: "#1c1c1f", borderRadius: 4, wordBreak: "break-all" }, children: meta.dir }),
        /* @__PURE__ */ jsx2("br", {}),
        "\u5F53\u524D ",
        meta.count,
        " \u5C01 / ",
        Math.round(meta.totalBytes / 1024),
        "KB;\u73AF\u5F62\u4E0A\u9650 ",
        meta.limits?.maxMailCount ?? 500,
        " \u5C01 / ",
        Math.round((meta.limits?.maxTotalBytes ?? 209715200) / 1024 / 1024),
        "MB,\u8D85\u51FA\u81EA\u52A8\u6DD8\u6C70\u6700\u65E7\u3002"
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: /* @__PURE__ */ jsx2(
        "button",
        {
          style: { ...btn, color: confirmingClear ? "#fecaca" : "#f87171", borderColor: "#7f1d1d", background: confirmingClear ? "rgba(248,81,73,.25)" : "rgba(248,81,73,.08)" },
          onClick: () => void clearAll(),
          children: confirmingClear ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u90AE\u4EF6(\u4E0D\u53EF\u9006)" : "\u6E05\u7A7A\u6536\u4EF6\u7BB1"
        }
      ) })
    ] })
  ] });
}

// src/Panel.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var POLL_MS = 3e3;
function fmtBytes2(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
function fmtTime2(s) {
  const iso = s.date || new Date(s.receivedAt).toISOString();
  return iso.replace("T", " ").slice(0, 19);
}
function Panel() {
  const [tab, setTab] = useState3("inbox");
  const [meta, setMeta] = useState3(null);
  const [selftest, setSelftest] = useState3(null);
  const [mails, setMails] = useState3([]);
  const [total, setTotal] = useState3(0);
  const [query, setQuery] = useState3("");
  const [selectedId, setSelectedId] = useState3("");
  const [detail, setDetail] = useState3(null);
  const [detailLoading, setDetailLoading] = useState3(false);
  const [detailError, setDetailError] = useState3("");
  const [loaded, setLoaded] = useState3(false);
  const [toast, setToast] = useState3(null);
  const toastTimer = useRef(void 0);
  const queryRef = useRef("");
  queryRef.current = query;
  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback(async () => {
    try {
      const [m, st, list] = await Promise.all([
        api.meta().catch(() => null),
        api.selftestLast().then((r) => r.last).catch(() => null),
        api.list(queryRef.current).catch(() => ({ items: [], total: 0 }))
      ]);
      setMeta(m);
      setSelftest(st);
      setMails(list.items);
      setTotal(list.total);
      setLoaded(true);
    } catch (_) {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      void reload();
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, reload]);
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetailError("");
    api.detail(selectedId).then((d) => {
      if (alive) setDetail(d);
    }).catch((e) => {
      if (alive) {
        setDetail(null);
        setDetailError(e.message);
      }
    }).finally(() => {
      if (alive) setDetailLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [selectedId]);
  const running = !!(meta && meta.smtpListening);
  const selected = mails.find((m) => m.id === selectedId) || null;
  async function restart() {
    try {
      invalidateSvc();
      await restartService(PLUGIN_ID, SERVICE_ID);
      showToast("\u5DF2\u8BF7\u6C42\u91CD\u542F\u670D\u52A1", "good");
    } catch (e) {
      if (!String(e.message).includes("not registered")) {
        showToast(`\u91CD\u542F\u5931\u8D25:${e.message}`, "bad");
        return;
      }
      try {
        await autostartServices();
        showToast("\u70ED\u5B89\u88C5\u573A\u666F\u5DF2\u89E6\u53D1\u91CD\u626B(autostart)", "info");
      } catch (e2) {
        showToast(`\u81EA\u6551\u5931\u8D25:${e2.message}`, "bad");
      }
    }
  }
  const btn = {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 6,
    border: "1px solid #3f3f46",
    background: "transparent",
    color: "#a1a1aa",
    cursor: "pointer"
  };
  return /* @__PURE__ */ jsxs3("div", { style: { padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10, color: "#d4d4d8" }, children: [
    /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx3("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u2709 \u90AE\u4EF6\u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx3("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? `SMTP 127.0.0.1:${meta?.smtpPort}` : "SMTP \u672A\u76D1\u542C" }),
      meta && /* @__PURE__ */ jsxs3("span", { style: { fontSize: 10, color: "#52525b" }, children: [
        "\u6536\u4EF6\u7BB1 ",
        meta.count,
        " \u5C01 / ",
        fmtBytes2(meta.totalBytes)
      ] }),
      /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
      ["inbox", "settings"].map((t) => /* @__PURE__ */ jsx3(
        "button",
        {
          onClick: () => setTab(t),
          style: {
            fontSize: 12,
            padding: "4px 12px",
            borderRadius: 6,
            cursor: "pointer",
            border: "none",
            background: tab === t ? "rgba(88,101,242,.2)" : "transparent",
            color: tab === t ? "#a5b4fc" : "#71717a"
          },
          children: t === "inbox" ? "\u6536\u4EF6\u7BB1" : "\u8BBE\u7F6E"
        },
        t
      )),
      /* @__PURE__ */ jsx3("button", { style: btn, onClick: () => {
        void readSvc(true);
        void reload();
      }, children: "\u5237\u65B0" }),
      /* @__PURE__ */ jsx3("button", { style: btn, onClick: () => {
        void restart();
      }, children: "\u91CD\u542F\u670D\u52A1" })
    ] }),
    loaded && !meta && /* @__PURE__ */ jsx3("div", { style: { padding: 12, border: "1px solid rgba(248,81,73,.3)", borderRadius: 8, background: "rgba(248,81,73,.06)", fontSize: 12, color: "#f87171" }, children: "\u670D\u52A1\u672A\u5C31\u7EEA(\u8BFB\u4E0D\u5230 mdk.service)\u3002\u670D\u52A1\u53EF\u80FD\u5728\u542F\u52A8\u4E2D;\u82E5\u521A\u5B89\u88C5\u63D2\u4EF6,\u53EF\u70B9\u300C\u91CD\u542F\u670D\u52A1\u300D\u6216\u5230 \u8BBE\u7F6E\u2192\u63D2\u4EF6 \u67E5\u770B\u670D\u52A1\u72B6\u6001\u3002" }),
    tab === "inbox" ? /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flex: 1, minHeight: 0, gap: 0 }, children: [
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", flex: 1, minWidth: 300, borderRight: "1px solid #27272a" }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center", padding: "0 0 8px 0" }, children: [
          /* @__PURE__ */ jsx3(
            "input",
            {
              value: query,
              onChange: (e) => setQuery(e.target.value),
              placeholder: "\u641C\u4E3B\u9898 / \u53D1\u4EF6\u4EBA / \u6536\u4EF6\u4EBA / \u6B63\u6587\u2026",
              style: {
                flex: 1,
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #3f3f46",
                background: "#18181b",
                color: "#e4e4e7"
              }
            }
          ),
          /* @__PURE__ */ jsxs3("span", { style: { fontSize: 10, color: "#52525b", whiteSpace: "nowrap" }, children: [
            total,
            " \u5C01"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }, children: [
          mails.length === 0 && /* @__PURE__ */ jsx3("div", { style: { padding: 20, color: "#52525b", fontSize: 12, lineHeight: 1.9 }, children: query ? "\u6CA1\u6709\u5339\u914D\u7684\u90AE\u4EF6\u3002" : /* @__PURE__ */ jsxs3(Fragment, { children: [
            "\u6536\u4EF6\u7BB1\u4E3A\u7A7A\u3002\u5F00\u59CB\u4F7F\u7528:",
            /* @__PURE__ */ jsx3("br", {}),
            "1. \u628A\u5E94\u7528\u7684 SMTP host/port \u6307\u5230 ",
            /* @__PURE__ */ jsxs3("code", { style: { color: "#a1a1aa" }, children: [
              "127.0.0.1:",
              meta?.smtpPort ?? 1025
            ] }),
            "(\u914D\u7F6E\u7247\u6BB5\u5728\u300C\u8BBE\u7F6E\u300D\u9875)",
            /* @__PURE__ */ jsx3("br", {}),
            "2. \u5E94\u7528\u53D1\u6D4B\u8BD5\u90AE\u4EF6 \u2192 \u672C\u9762\u677F\u5B9E\u65F6\u53EF\u89C1",
            /* @__PURE__ */ jsx3("br", {}),
            "3. \u6216\u5728\u5BF9\u8BDD\u91CC\u8BA9 AI \u8C03 mail_list / mail_get \u8BFB\u90AE\u4EF6\u3001\u63D0\u9A8C\u8BC1\u7801"
          ] }) }),
          mails.map((m) => /* @__PURE__ */ jsxs3(
            "button",
            {
              onClick: () => setSelectedId(m.id),
              style: {
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
                border: selectedId === m.id ? "1px solid rgba(88,101,242,.5)" : "1px solid transparent",
                background: selectedId === m.id ? "rgba(88,101,242,.12)" : "#161618"
              },
              children: [
                /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                  /* @__PURE__ */ jsx3("span", { style: { fontSize: 12, fontWeight: 600, color: "#e4e4e7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: m.subject }),
                  m.attachments.length > 0 && /* @__PURE__ */ jsx3("span", { title: `${m.attachments.length} \u4E2A\u9644\u4EF6`, children: "\u{1F4CE}" }),
                  /* @__PURE__ */ jsx3("span", { style: { fontSize: 10, color: "#52525b", whiteSpace: "nowrap" }, children: fmtTime2(m) })
                ] }),
                /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, marginTop: 3, fontSize: 10, color: "#71717a", overflow: "hidden" }, children: [
                  /* @__PURE__ */ jsx3("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: m.fromText || "(\u672A\u77E5)" }),
                  /* @__PURE__ */ jsx3("span", { style: { color: "#3f3f46" }, children: "\u2192" }),
                  /* @__PURE__ */ jsx3("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: m.toText || "(\u672A\u6307\u5B9A)" }),
                  /* @__PURE__ */ jsx3("span", { style: { marginLeft: "auto", color: "#52525b", whiteSpace: "nowrap" }, children: fmtBytes2(m.sizeBytes) })
                ] })
              ]
            },
            m.id
          ))
        ] })
      ] }),
      selected ? /* @__PURE__ */ jsx3(
        Detail,
        {
          mail: selected,
          detail,
          loading: detailLoading,
          error: detailError,
          onClose: () => setSelectedId(""),
          onDeleted: () => {
            setSelectedId("");
            void reload();
          },
          toast: showToast
        }
      ) : /* @__PURE__ */ jsx3("div", { style: { flex: 1.4, display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46", fontSize: 12 }, children: "\u9009\u62E9\u4E00\u5C01\u90AE\u4EF6\u67E5\u770B" })
    ] }) : /* @__PURE__ */ jsx3("div", { style: { flex: 1, minHeight: 0, overflow: "auto" }, children: /* @__PURE__ */ jsx3(Settings, { meta, selftest, toast: showToast, onChanged: () => {
      invalidateSvc();
      void reload();
    } }) }),
    toast && /* @__PURE__ */ jsx3("div", { style: {
      position: "fixed",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      borderRadius: 8,
      fontSize: 12,
      zIndex: 50,
      background: toast.kind === "good" ? "rgba(63,185,80,.15)" : toast.kind === "bad" ? "rgba(248,81,73,.15)" : "rgba(88,101,242,.15)",
      color: toast.kind === "good" ? "#3fb950" : toast.kind === "bad" ? "#f87171" : "#a5b4fc",
      border: `1px solid ${toast.kind === "good" ? "rgba(63,185,80,.4)" : toast.kind === "bad" ? "rgba(248,81,73,.4)" : "rgba(88,101,242,.4)"}`,
      maxWidth: 480
    }, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function MailDeskEntry(props) {
  return /* @__PURE__ */ jsx4(Panel, {});
}
export {
  MailDeskEntry as default
};
