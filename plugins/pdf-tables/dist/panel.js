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
    function sanitizeStem(name) {
      const base = String(name == null ? "" : name).split(/[\\/]/).pop() || "";
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const cleaned = stem.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "output";
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) return "_" + cleaned;
      return cleaned;
    }
    function pickOutputName(dir, stem, ext, existsSync) {
      const safeExt = ext && ext.charAt(0) === "." ? ext : "." + ext;
      let candidate = joinPath(dir, stem + safeExt);
      let n = 2;
      while (existsSync(candidate)) {
        candidate = joinPath(dir, stem + "-" + n + safeExt);
        n++;
        if (n > 9999) throw new Error("\u8F93\u51FA\u547D\u540D\u51B2\u7A81\u8D85\u8FC7 9999 \u6B21\uFF1A\u8BF7\u6E05\u7406\u8F93\u51FA\u76EE\u5F55");
      }
      return candidate;
    }
    function joinPath(dir, name) {
      const d = String(dir || "").replace(/[\\/]+$/, "");
      if (!d) return name;
      const sep = d.indexOf("\\") !== -1 ? "\\" : "/";
      return d + sep + name;
    }
    function isPdfBytes(buf) {
      if (!buf || buf.length < 5) return false;
      const limit = Math.min(buf.length, 1024);
      for (let i = 0; i + 5 <= limit; i++) {
        if (buf[i] === 37 && buf[i + 1] === 80 && buf[i + 2] === 68 && buf[i + 3] === 70 && buf[i + 4] === 45) {
          return true;
        }
      }
      return false;
    }
    function validateInputs(files, limits) {
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error("\u6CA1\u6709\u6536\u5230\u4EFB\u4F55\u8F93\u5165\u6587\u4EF6");
      }
      if (files.length > 50) throw new Error("\u4E00\u6B21\u6700\u591A\u5904\u7406 50 \u4E2A\u6587\u4EF6\uFF0C\u6536\u5230 " + files.length + " \u4E2A");
      let total = 0;
      return files.map((f, idx) => {
        if (!f || typeof f.name !== "string" || !f.name.trim()) {
          throw new Error("\u7B2C " + (idx + 1) + " \u4E2A\u6587\u4EF6\u7F3A\u5C11\u6587\u4EF6\u540D");
        }
        const size = Number(f.size);
        if (!Number.isFinite(size) || size < 0) throw new Error("\u6587\u4EF6 " + f.name + " \u7684\u5927\u5C0F\u975E\u6CD5");
        total += size;
        if (total > limits.maxBytes) {
          throw new Error("\u8F93\u5165\u603B\u5927\u5C0F " + formatBytes(total) + " \u8D85\u8FC7\u4E0A\u9650 " + formatBytes(limits.maxBytes) + "\uFF08\u53EF\u5728\u9762\u677F\u8BBE\u7F6E\u8C03\u6574\uFF09");
        }
        const stem = sanitizeStem(f.name);
        const ext = (String(f.name).split(".").pop() || "").toLowerCase();
        if (ext !== "pdf") {
          throw new Error("\u6587\u4EF6 " + f.name + " \u4E0D\u662F PDF\uFF08\u53EA\u63A5\u53D7 .pdf\uFF09");
        }
        return { name: f.name, stem, ext, size, index: idx };
      });
    }
    function normalizeSettings2(raw) {
      const r = raw && typeof raw === "object" ? raw : {};
      const outDir = typeof r.outDir === "string" ? r.outDir.trim() : "";
      let maxUploadMB = Number(r.maxUploadMB);
      if (!Number.isFinite(maxUploadMB)) maxUploadMB = 128;
      maxUploadMB = Math.min(1024, Math.max(1, Math.round(maxUploadMB)));
      let historyCap = Number(r.historyCap);
      if (!Number.isFinite(historyCap)) historyCap = 200;
      historyCap = Math.min(1e3, Math.max(10, Math.round(historyCap)));
      const format = ["xlsx", "csv", "json", "all"].indexOf(r.format) >= 0 ? r.format : "xlsx";
      let mergePages = !!r.mergePages;
      if (r.mergePages === void 0) mergePages = true;
      return { outDir, maxUploadMB, historyCap, format, mergePages };
    }
    function parsePageSpec(spec, pageCount, opts) {
      const mode = opts && opts.mode || "set";
      if (!Number.isInteger(pageCount) || pageCount <= 0) {
        throw new Error("\u9875\u7801\u89C4\u683C\u89E3\u6790\u5931\u8D25\uFF1A\u6587\u6863\u9875\u6570\u5FC5\u987B\u662F\u6B63\u6574\u6570\uFF0C\u6536\u5230 " + JSON.stringify(pageCount));
      }
      let tokens;
      if (spec === "all" || spec === "\u5168\u90E8") {
        tokens = Array.from({ length: pageCount }, (_, i) => i + 1);
      } else if (typeof spec === "number") {
        tokens = [spec];
      } else if (Array.isArray(spec)) {
        const arr = spec.map((n) => {
          if (!Number.isInteger(n) || n < 1) {
            throw new Error("\u9875\u7801\u6570\u7EC4\u542B\u975E\u6CD5\u9879 " + JSON.stringify(n) + "\uFF1A\u9875\u7801\u4ECE 1 \u5F00\u59CB");
          }
          return n;
        });
        return finalize(arr, pageCount, mode, "\u9875\u7801\u6570\u7EC4");
      } else if (typeof spec === "string") {
        const s = spec.trim();
        if (!s) throw new Error("\u9875\u7801\u89C4\u683C\u4E3A\u7A7A\uFF1A\u8BF7\u586B\u5199\u5982 1-3,5 \u6216 all");
        tokens = [];
        for (const rawPart of s.split(",")) {
          const part = rawPart.trim();
          if (!part) throw new Error("\u9875\u7801\u89C4\u683C\u542B\u7A7A\u6BB5\uFF1A" + JSON.stringify(spec) + "\uFF08\u68C0\u67E5\u662F\u5426\u6709\u591A\u4F59\u9017\u53F7\uFF09");
          const m = part.match(/^(\d+)(?:\s*-\s*(\d+|end|末尾))?$/i);
          if (!m) {
            throw new Error("\u9875\u7801\u7247\u6BB5 " + JSON.stringify(part) + " \u65E0\u6CD5\u8BC6\u522B\uFF1A\u652F\u6301 5\u30011-3\u30013-end\u3001all");
          }
          const a = parseInt(m[1], 10);
          const bRaw = m[2];
          let b;
          let endKeyword = false;
          if (!bRaw) {
            b = a;
          } else if (bRaw.toLowerCase() === "end" || bRaw === "\u672B\u5C3E") {
            b = pageCount;
            endKeyword = true;
          } else {
            b = parseInt(bRaw, 10);
          }
          if (a > b) throw new Error("\u9875\u7801\u533A\u95F4 " + part + " \u8D77\u59CB\u9875\u5927\u4E8E\u7ED3\u675F\u9875");
          if (!endKeyword && b > pageCount) {
            throw new Error("\u9875\u7801\u8D85\u51FA\u8303\u56F4\uFF1A\u7247\u6BB5 " + part + " \u7684\u7ED3\u675F\u9875 " + b + " \u8D85\u8FC7\u6587\u6863\u603B\u9875\u6570 " + pageCount);
          }
          for (let i = a; i <= b; i++) tokens.push(i);
        }
        return finalize(tokens, pageCount, mode, "\u9875\u7801\u89C4\u683C");
      } else {
        throw new Error("\u9875\u7801\u89C4\u683C\u7C7B\u578B\u4E0D\u652F\u6301\uFF1A" + typeof spec);
      }
      return finalize(tokens, pageCount, mode, "\u9875\u7801\u89C4\u683C");
    }
    function finalize(tokens, pageCount, mode, label) {
      if (!tokens.length) throw new Error(label + "\u89E3\u6790\u7ED3\u679C\u4E3A\u7A7A");
      for (const n of tokens) {
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(label + "\u542B\u975E\u6CD5\u9875\u7801 " + JSON.stringify(n) + "\uFF1A\u9875\u7801\u4ECE 1 \u5F00\u59CB");
        }
        if (n > pageCount) {
          throw new Error(label + "\u9875\u7801 " + n + " \u8D85\u51FA\u6587\u6863\u603B\u9875\u6570 " + pageCount);
        }
      }
      if (mode === "ordered") {
        const seen = /* @__PURE__ */ new Set();
        for (const n of tokens) {
          if (seen.has(n)) throw new Error(label + "\u9875\u7801 " + n + " \u91CD\u590D\uFF1A\u91CD\u6392\u6A21\u5F0F\u4E0B\u6BCF\u9875\u53EA\u80FD\u51FA\u73B0\u4E00\u6B21");
          seen.add(n);
        }
        return tokens.slice();
      }
      return Array.from(new Set(tokens)).sort((a, b) => a - b);
    }
    function compactRanges(pages) {
      if (!Array.isArray(pages) || !pages.length) return "";
      const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
      const parts = [];
      let start = sorted[0];
      let prev = sorted[0];
      for (let i = 1; i <= sorted.length; i++) {
        const cur = sorted[i];
        if (cur === prev + 1) {
          prev = cur;
          continue;
        }
        parts.push(start === prev ? String(start) : start + "-" + prev);
        start = cur;
        prev = cur;
      }
      return parts.join(",");
    }
    function parseNumeric(cell) {
      if (typeof cell !== "string") return null;
      let s = cell.trim();
      if (!s) return null;
      let neg = false;
      const paren = /^\((.*)\)$/.exec(s);
      if (paren) {
        neg = true;
        s = paren[1].trim();
      }
      if (/^-/.test(s)) {
        neg = true;
        s = s.slice(1).trim();
      }
      s = s.replace(/^[¥$€£￥]/, "").trim();
      if (!s) return null;
      const hadSeparator = /[,.]/.test(s);
      s = s.replace(/[, ]/g, "");
      if (!/^\d+(\.\d+)?$/.test(s)) return null;
      const digits = s.replace(".", "");
      if (digits.length > 15) return null;
      if (!hadSeparator && digits.length >= 11) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      return neg ? -n : n;
    }
    function csvEscape(v) {
      const s = v == null ? "" : String(v);
      if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    function gridToCSV(rows) {
      return (rows || []).map((r) => (r || []).map(csvEscape).join(",")).join("\r\n") + "\r\n";
    }
    function csvBytes(rows) {
      return Buffer.from("\uFEFF" + gridToCSV(rows), "utf8");
    }
    function cleanCell(v) {
      return String(v == null ? "" : v).replace(/\s*\n\s*/g, " ").trim();
    }
    function sameHeader(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return false;
      let nonEmpty = 0;
      for (let i = 0; i < a.length; i++) {
        const x = cleanCell(a[i]).replace(/\s+/g, "");
        const y = cleanCell(b[i]).replace(/\s+/g, "");
        if (x !== y) return false;
        if (x) nonEmpty++;
      }
      return nonEmpty > 0;
    }
    function formatBytes(n) {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0) return "?";
      if (v < 1024) return v + " B";
      if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
      if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + " MB";
      return (v / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }
    module.exports = {
      sanitizeStem,
      pickOutputName,
      joinPath,
      isPdfBytes,
      validateInputs,
      normalizeSettings: normalizeSettings2,
      parsePageSpec,
      compactRanges,
      parseNumeric,
      csvEscape,
      gridToCSV,
      csvBytes,
      cleanCell,
      sameHeader,
      formatBytes
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useState as useState3 } from "react";

// src/model.ts
var core = __toESM(require_core());

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
async function kvKeys() {
  const res = await kvReq({ action: "list" });
  return res.result && Array.isArray(res.result.keys) ? res.result.keys : [];
}
var KEY_META = "pdf-tables.meta";
var KEY_SETTINGS = "pdf-tables.settings";
var KEY_CMD = "pdf-tables.cmd";
var KEY_HISTORY = "pdf-tables.history.";
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
async function loadSettings() {
  try {
    return core.normalizeSettings(await kvGet(KEY_SETTINGS));
  } catch (_) {
    return core.normalizeSettings(null);
  }
}
async function saveSettings(s) {
  await kvSet(KEY_SETTINGS, s);
}
async function loadHistory() {
  const keys = (await kvKeys()).filter((k) => k.startsWith(KEY_HISTORY));
  const entries = [];
  await Promise.all(keys.map(async (k) => {
    try {
      const v = await kvGet(k);
      if (v && typeof v === "object") entries.push(v);
    } catch (_) {
    }
  }));
  entries.sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.id).localeCompare(String(a.id)));
  return entries;
}
async function requestClearHistory() {
  await kvSet(KEY_CMD, { action: "clearHistory" });
}
function opEndpoint(meta) {
  return `http://127.0.0.1:${meta.port}`;
}
async function runOpRequest(meta, body) {
  const res = await fetch(opEndpoint(meta) + "/api/op", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PdfTables-Token": meta.token },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return data;
}
async function probeDir(meta, path) {
  const res = await fetch(opEndpoint(meta) + "/api/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PdfTables-Token": meta.token },
    body: JSON.stringify({ path })
  });
  return await res.json();
}
function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25\uFF1A" + file.name));
    reader.onload = () => {
      const s = String(reader.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.readAsDataURL(file);
  });
}

// src/WorkTab.tsx
import { useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var FORMAT_META = [
  { key: "xlsx", label: "Excel", hint: "\u6570\u5B57\u5217\u81EA\u52A8\u8F6C\u6570\u503C\u3001\u8868\u5934\u51BB\u7ED3\uFF0C\u53EF\u76F4\u63A5 SUM" },
  { key: "csv", label: "CSV", hint: "UTF-8 \u5E26 BOM\uFF0C\u4E2D\u6587 Excel/WPS \u53CC\u51FB\u76F4\u5F00" },
  { key: "json", label: "JSON", hint: "\u7ED3\u6784\u5316\u6570\u636E\uFF0C\u4F9B\u7A0B\u5E8F/\u7BA1\u9053\u6D88\u8D39" },
  { key: "all", label: "\u5168\u90E8", hint: "\u4E09\u79CD\u683C\u5F0F\u5404\u51FA\u4E00\u4EFD" }
];
function isPdfName(name) {
  return /\.pdf$/i.test(name);
}
function pagesSpecOf(selected) {
  const arr = Array.from(selected).sort((a, b) => a - b);
  const ranges = core.compactRanges(arr);
  return ranges;
}
function WorkTab({ ctx }) {
  const { meta, settings, showToast, reloadHistory } = ctx;
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [detect, setDetect] = useState(null);
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [format, setFormat] = useState(settings.format);
  const [mergePages, setMergePages] = useState(settings.mergePages);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pagesWithTables = useMemo(() => {
    const out = [];
    for (const pr of detect && detect.pageResults || []) {
      if (pr.tables.length) out.push(pr);
    }
    return out;
  }, [detect]);
  const totalTables = detect && detect.totalTables || 0;
  const reset = () => {
    setFile(null);
    setDetect(null);
    setSelected(/* @__PURE__ */ new Set());
    setResult(null);
    setErrorMsg("");
  };
  const pickFile = (f) => {
    reset();
    setFile(f);
  };
  const addFiles = (list) => {
    if (!list || !list.length) return;
    const pdf = Array.from(list).find((f) => isPdfName(f.name));
    if (!pdf) {
      showToast("\u53EA\u63A5\u53D7 PDF \u6587\u4EF6", "bad");
      return;
    }
    pickFile(pdf);
  };
  const runDetect = async (f) => {
    if (!meta) {
      showToast("\u670D\u52A1\u672A\u5728\u7EBF\uFF1A\u8BF7\u5148\u5728\u5BBF\u4E3B\u8BBE\u7F6E\u91CC\u542F\u52A8 pdf-tables \u670D\u52A1", "bad");
      return;
    }
    setDetecting(true);
    setErrorMsg("");
    setResult(null);
    setDetect(null);
    try {
      const payload = [{ name: f.name, b64: await fileToB64(f) }];
      const res = await runOpRequest(meta, { op: "detect", files: payload, params: {}, source: "panel" });
      if (!res.ok) {
        setErrorMsg(String(res.error || "\u68C0\u6D4B\u5931\u8D25"));
        showToast("\u68C0\u6D4B\u5931\u8D25", "bad");
        return;
      }
      setDetect(res);
      const sel = /* @__PURE__ */ new Set();
      for (const pr of res.pageResults || []) {
        if (pr.tables.length) sel.add(pr.page);
      }
      setSelected(sel);
      showToast(res.totalTables ? `\u68C0\u51FA ${res.totalTables} \u5F20\u8868\u683C` : "\u672A\u68C0\u51FA\u8868\u683C\uFF08\u8BE6\u89C1\u9875\u9762\u8BF4\u660E\uFF09", res.totalTables ? "good" : "bad");
    } catch (e) {
      setErrorMsg("\u8BF7\u6C42\u670D\u52A1\u5931\u8D25\uFF1A" + String(e.message || e) + "\uFF08\u786E\u8BA4\u670D\u52A1\u5728\u7EBF\uFF1A\u5BBF\u4E3B \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1\uFF09");
      showToast("\u8BF7\u6C42\u670D\u52A1\u5931\u8D25", "bad");
    } finally {
      setDetecting(false);
    }
  };
  const togglePage = (page) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };
  const runExtract = async () => {
    if (!meta || !file) return;
    if (!selected.size) {
      showToast("\u8BF7\u81F3\u5C11\u52FE\u9009\u4E00\u9875\u6709\u8868\u683C\u7684\u9875", "bad");
      return;
    }
    setExtracting(true);
    setErrorMsg("");
    setResult(null);
    try {
      const payload = [{ name: file.name, b64: await fileToB64(file) }];
      const res = await runOpRequest(meta, {
        op: "extract",
        files: payload,
        source: "panel",
        params: { pages: pagesSpecOf(selected), format, mergePages }
      });
      if (!res.ok) {
        setErrorMsg(String(res.error || "\u63D0\u53D6\u5931\u8D25"));
        showToast("\u63D0\u53D6\u5931\u8D25", "bad");
      } else {
        setResult(res);
        showToast("\u5B8C\u6210\uFF1A" + (res.outputs && res.outputs.length ? res.outputs.map((o) => o.name).join("\u3001") : ""), "good");
        reloadHistory();
      }
    } catch (e) {
      setErrorMsg("\u8BF7\u6C42\u670D\u52A1\u5931\u8D25\uFF1A" + String(e.message || e) + "\uFF08\u786E\u8BA4\u670D\u52A1\u5728\u7EBF\uFF1A\u5BBF\u4E3B \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1\uFF09");
      showToast("\u8BF7\u6C42\u670D\u52A1\u5931\u8D25", "bad");
    } finally {
      setExtracting(false);
    }
  };
  const overLimit = file ? file.size > settings.maxUploadMB * 1024 * 1024 : false;
  return /* @__PURE__ */ jsxs("div", { children: [
    !meta && /* @__PURE__ */ jsx("div", { className: "pdt-alert warn", "data-testid": "svc-offline", children: "\u670D\u52A1\u672A\u5728\u7EBF\uFF1A\u5DE5\u4F5C\u53F0\u9700\u8981\u5728\u5BBF\u4E3B\u91CC\u542F\u52A8 pdf-tables \u540E\u53F0\u670D\u52A1\uFF08\u5BBF\u4E3B\u300C\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u63D2\u4EF6\u670D\u52A1\u300D\uFF09\u3002\u5386\u53F2\u4E0E\u8BBE\u7F6E\u4E0D\u53D7\u5F71\u54CD\u3002" }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "pdt-drop" + (over ? " over" : ""),
        "data-testid": "dropzone",
        onClick: () => inputRef.current && inputRef.current.click(),
        onDragOver: (e) => {
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        },
        children: [
          file ? file.name : "\u62D6\u62FD PDF \u5230\u8FD9\u91CC\uFF0C\u6216\u70B9\u51FB\u9009\u62E9\u6587\u4EF6",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsxs("span", { className: "pdt-sub", children: [
            meta ? `\u8F93\u51FA\u76EE\u5F55\uFF1A${settings.outDir || "\u684C\u9762\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u6539\uFF09"} \xB7 \u5355\u6587\u4EF6\u4E0A\u9650 ${settings.maxUploadMB} MB` : "\u684C\u9762\u7AEF \xB7 \u6587\u4EF6\u5168\u7A0B\u4E0D\u51FA\u672C\u673A",
            " \xB7 \u626B\u63CF\u4EF6/\u52A0\u5BC6 PDF \u4E0D\u652F\u6301"
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref: inputRef,
        type: "file",
        accept: ".pdf,application/pdf",
        style: { display: "none" },
        onChange: (e) => {
          const f = e.target.files && e.target.files[0];
          if (f) pickFile(f);
          e.target.value = "";
        }
      }
    ),
    overLimit && /* @__PURE__ */ jsxs("div", { className: "pdt-alert bad", children: [
      "\u6587\u4EF6 ",
      file ? core.formatBytes(file.size) : "",
      " \u8D85\u8FC7\u5355\u6587\u4EF6\u4E0A\u9650 ",
      settings.maxUploadMB,
      " MB\uFF08\u53EF\u5728\u300C\u8BBE\u7F6E\u300D\u8C03\u5927\uFF09"
    ] }),
    file && /* @__PURE__ */ jsx("div", { className: "pdt-card", children: /* @__PURE__ */ jsx("div", { className: "pdt-card-b", children: /* @__PURE__ */ jsxs("div", { className: "pdt-row", children: [
      /* @__PURE__ */ jsx("b", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }, "data-testid": "file-name", children: file.name }),
      /* @__PURE__ */ jsx("span", { className: "pdt-sub", children: core.formatBytes(file.size) }),
      /* @__PURE__ */ jsx("button", { className: "pdt-btn ghost sm", onClick: () => runDetect(file), disabled: detecting || extracting || !!overLimit, "data-testid": "re-detect-btn", children: detecting ? "\u68C0\u6D4B\u4E2D\u2026" : "\u91CD\u65B0\u68C0\u6D4B" }),
      /* @__PURE__ */ jsx("button", { className: "pdt-btn ghost sm", onClick: reset, children: "\u79FB\u9664" })
    ] }) }) }),
    detecting && /* @__PURE__ */ jsx("div", { className: "pdt-empty", "data-testid": "detecting", children: "\u6B63\u5728\u6309\u5750\u6807\u91CD\u5EFA\u8868\u683C\u7ED3\u6784\u2026" }),
    detect && detect.ok && /* @__PURE__ */ jsx(Fragment, { children: pagesWithTables.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "pdt-alert warn", "data-testid": "no-tables", children: [
      "\u672A\u68C0\u51FA\u8868\u683C\uFF1A",
      detect.note || "\u9875\u9762\u6587\u5B57\u5B58\u5728\u4F46\u6CA1\u6709\u5BF9\u9F50\u7684\u5217\u7ED3\u6784\uFF08\u53EF\u80FD\u662F\u4E0D\u89C4\u5219\u6392\u7248/\u53CC\u680F/\u56FE\u7247\u8868\u683C\uFF09"
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "pdt-chiprow", "data-testid": "page-select-row", children: [
        /* @__PURE__ */ jsx("span", { className: "pdt-sub", children: "\u52FE\u9009\u8981\u63D0\u53D6\u7684\u9875\uFF1A" }),
        /* @__PURE__ */ jsx("button", { className: "pdt-chip", onClick: () => setSelected(new Set(pagesWithTables.map((p) => p.page))), children: "\u5168\u9009" }),
        /* @__PURE__ */ jsx("button", { className: "pdt-chip", onClick: () => setSelected(/* @__PURE__ */ new Set()), children: "\u5168\u4E0D\u9009" }),
        /* @__PURE__ */ jsxs("span", { className: "pdt-sub", children: [
          "\u5DF2\u9009 ",
          selected.size,
          " \u9875 \xB7 \u68C0\u51FA ",
          totalTables,
          " \u5F20\u8868\u683C",
          detect.pages ? ` \xB7 \u6587\u6863\u5171 ${detect.pages} \u9875` : ""
        ] })
      ] }),
      detect.pageResults && detect.pageResults.map((pr) => pr.tables.length > 0 && /* @__PURE__ */ jsxs("div", { className: "pdt-item", "data-testid": "page-card-" + pr.page, children: [
        /* @__PURE__ */ jsxs("div", { className: "pdt-item-head", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: selected.has(pr.page),
              onChange: () => togglePage(pr.page),
              "data-testid": "page-check-" + pr.page
            }
          ),
          /* @__PURE__ */ jsxs("b", { children: [
            "\u7B2C ",
            pr.page,
            " \u9875 \xB7 ",
            pr.tables.map((t) => `${t.rowsCount}\u884C\xD7${t.colCount}\u5217`).join("\uFF0C")
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "pdt-badge ok", children: [
            "\u586B\u5145\u7387 ",
            Math.round(pr.tables.reduce((s, t) => s + t.fillRatio, 0) / pr.tables.length * 100),
            "%"
          ] })
        ] }),
        pr.tables.map((t, i) => /* @__PURE__ */ jsxs("div", { className: "pdt-gridwrap", children: [
          /* @__PURE__ */ jsxs("table", { className: "pdt-grid", "data-testid": "grid-" + pr.page + "-" + i, children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: t.header.map((h, c) => /* @__PURE__ */ jsx("th", { children: h || " " }, c)) }) }),
            /* @__PURE__ */ jsx("tbody", { children: t.preview.slice(1).map((row, r) => /* @__PURE__ */ jsx("tr", { children: row.map((v, c) => /* @__PURE__ */ jsx("td", { className: core.parseNumeric(v) !== null ? "pdt-num" : "", children: v || " " }, c)) }, r)) })
          ] }),
          t.rowsCount > t.preview.length - 1 && /* @__PURE__ */ jsxs("div", { className: "pdt-sub", style: { padding: "4px 8px" }, children: [
            "\u2026\u5171 ",
            t.rowsCount,
            " \u884C\u6570\u636E\uFF08\u9884\u89C8\u524D ",
            t.preview.length - 1,
            " \u884C\uFF09"
          ] })
        ] }, i))
      ] }, pr.page)),
      detect.pageResults && detect.pageResults.some((pr) => !pr.tables.length) && /* @__PURE__ */ jsxs("div", { className: "pdt-sub", style: { margin: "0 18px 8px" }, "data-testid": "textless-pages", children: [
        "\u672A\u68C0\u51FA\u8868\u683C\u7684\u9875\uFF1A",
        detect.pageResults.filter((pr) => !pr.tables.length).map((pr) => "\u7B2C" + pr.page + "\u9875" + (pr.textLess ? "(\u65E0\u6587\u5B57\u5C42)" : "")).join("\u3001")
      ] }),
      /* @__PURE__ */ jsx("div", { className: "pdt-card", "data-testid": "param-card", children: /* @__PURE__ */ jsxs("div", { className: "pdt-card-b", children: [
        /* @__PURE__ */ jsx("div", { className: "pdt-sub", children: "\u8F93\u51FA\u683C\u5F0F" }),
        /* @__PURE__ */ jsx("div", { className: "pdt-chiprow", style: { padding: "6px 0 2px" }, "data-testid": "format-row", children: FORMAT_META.map((f) => /* @__PURE__ */ jsx("button", { className: "pdt-chip" + (format === f.key ? " on" : ""), onClick: () => setFormat(f.key), title: f.hint, children: f.label }, f.key)) }),
        /* @__PURE__ */ jsxs("label", { className: "pdt-row", style: { marginTop: 8, fontSize: 12 }, "data-testid": "merge-toggle-row", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: mergePages, onChange: (e) => setMergePages(e.target.checked), "data-testid": "merge-toggle" }),
          "\u8DE8\u9875\u7EED\u8868\u5408\u5E76\uFF08\u540C\u6784\u8868\u5934\u81EA\u52A8\u62FC\u6210\u4E00\u5F20\u5B8C\u6574\u8868\uFF0C\u5982\u6309\u9875\u5BFC\u51FA\u7684\u6D41\u6C34\uFF09"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "pdt-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("button", { className: "pdt-btn", "data-testid": "extract-btn", onClick: runExtract, disabled: extracting || detecting || !selected.size || !!overLimit, children: extracting ? "\u63D0\u53D6\u4E2D\u2026" : "\u63D0\u53D6\u843D\u76D8" }),
          /* @__PURE__ */ jsx("button", { className: "pdt-btn ghost", onClick: reset, children: "\u6E05\u7A7A" })
        ] })
      ] }) })
    ] }) }),
    errorMsg && /* @__PURE__ */ jsx("div", { className: "pdt-alert bad", "data-testid": "error-box", children: errorMsg }),
    result && result.ok && /* @__PURE__ */ jsxs("div", { className: "pdt-ok", "data-testid": "result-box", children: [
      /* @__PURE__ */ jsx("b", { children: "\u5B8C\u6210" }),
      "\uFF08",
      result.ms ?? 0,
      " ms",
      typeof result.totalTables === "number" ? ` \xB7 \u68C0\u51FA ${result.totalTables} \u5F20\u8868` : "",
      typeof result.tablesExtracted === "number" ? ` \xB7 \u63D0\u53D6 ${result.tablesExtracted} \u5F20 / ${result.rowsTotal || 0} \u884C` : "",
      "\uFF09",
      result.outputs && result.outputs.length > 0 && result.outputs.map((o) => /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
        "\u{1F4C4} ",
        o.name,
        " \xB7 ",
        core.formatBytes(o.size),
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("span", { style: { color: "#9fd8b4", fontSize: 11 }, children: o.path })
      ] }, o.path)),
      result.note && /* @__PURE__ */ jsx("div", { style: { marginTop: 4, fontSize: 11 }, children: result.note })
    ] })
  ] });
}

// src/HistoryTab.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var OP_LABELS = {
  detect: "\u68C0\u6D4B\u8868\u683C",
  read: "\u8BFB\u8868",
  extract: "\u63D0\u53D6\u843D\u76D8"
};
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function HistoryTab({ ctx }) {
  const { history, showToast, reloadHistory, meta } = ctx;
  const clearAll = async () => {
    try {
      await requestClearHistory();
      showToast("\u5DF2\u8BF7\u6C42\u6E05\u7A7A\uFF08\u670D\u52A1\u5728\u7EBF\u65F6\u7ACB\u5373\u751F\u6548\uFF09", "good");
      window.setTimeout(() => {
        void reloadHistory();
      }, 800);
    } catch (e) {
      showToast("\u6E05\u7A7A\u5931\u8D25\uFF1A" + String(e.message || e), "bad");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "pdt-chiprow", style: { justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsxs2("span", { className: "pdt-sub", children: [
        "\u5171 ",
        history.length,
        " \u6761\u4EFB\u52A1\uFF08\u9762\u677F\u4E0E AI \u5171\u7528\u540C\u4E00\u53F0\u8D26\uFF09"
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "pdt-btn ghost sm", onClick: clearAll, disabled: !history.length, "data-testid": "clear-btn", children: "\u6E05\u7A7A\u5386\u53F2" })
    ] }),
    history.length === 0 && /* @__PURE__ */ jsx2("div", { className: "pdt-empty", "data-testid": "history-empty", children: "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002\u5728\u5DE5\u4F5C\u53F0\u68C0\u6D4B/\u63D0\u53D6\u4E00\u4EFD PDF\uFF0C\u6216\u8BA9 AI \u7528 pdf_tables_* \u5DE5\u5177\u64CD\u4F5C\u3002" }),
    history.map((h) => /* @__PURE__ */ jsxs2("div", { className: "pdt-item", "data-testid": "history-" + h.id, children: [
      /* @__PURE__ */ jsxs2("div", { className: "pdt-item-head", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          OP_LABELS[h.op] || h.op,
          " \xB7 ",
          (h.inputs || []).join("\u3001") || "(\u65E0\u8F93\u5165)"
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: "pdt-badge" + (h.ok ? " ok" : " bad"), children: [
          h.source === "mcp" ? "AI" : "\u9762\u677F",
          " \xB7 ",
          h.ok ? "\u6210\u529F" : "\u5931\u8D25"
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "pdt-item-mid", children: [
        fmtTime(h.at),
        " \xB7 ",
        typeof h.tables === "number" ? `${h.tables} \u5F20\u8868 / ${h.rows || 0} \u884C \xB7 ` : "",
        h.ms || 0,
        " ms",
        h.outputs && h.outputs.length > 0 && /* @__PURE__ */ jsx2("div", { style: { marginTop: 3 }, children: h.outputs.map((o) => /* @__PURE__ */ jsxs2("div", { children: [
          "\u{1F4C4} ",
          o.name,
          " \xB7 ",
          core.formatBytes(o.size)
        ] }, o.path)) }),
        h.error && /* @__PURE__ */ jsxs2("div", { style: { color: "#FF8A9A", marginTop: 3 }, children: [
          "\u9519\u8BEF\uFF1A",
          h.error
        ] })
      ] })
    ] }, h.id)),
    !meta && history.length > 0 && /* @__PURE__ */ jsx2("div", { className: "pdt-sub", style: { margin: "0 18px 10px" }, children: "\u670D\u52A1\u79BB\u7EBF\u4E2D\uFF1A\u5386\u53F2\u53EA\u8BFB\uFF0C\u6E05\u7A7A\u547D\u4EE4\u5C06\u5728\u670D\u52A1\u4E0A\u7EBF\u540E\u751F\u6548\u3002" })
  ] });
}

// src/SettingsTab.tsx
import { useEffect, useState as useState2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ ctx }) {
  const { meta, settings, showToast, reloadSettings } = ctx;
  const [outDir, setOutDir] = useState2(settings.outDir);
  const [maxUploadMB, setMaxUploadMB] = useState2(String(settings.maxUploadMB));
  const [historyCap, setHistoryCap] = useState2(String(settings.historyCap));
  const [format, setFormat] = useState2(settings.format);
  const [mergePages, setMergePages] = useState2(settings.mergePages);
  const [probing, setProbing] = useState2(false);
  const [probeMsg, setProbeMsg] = useState2("");
  useEffect(() => {
    setOutDir(settings.outDir);
    setMaxUploadMB(String(settings.maxUploadMB));
    setHistoryCap(String(settings.historyCap));
    setFormat(settings.format);
    setMergePages(settings.mergePages);
  }, [settings]);
  const save = async () => {
    const mb = parseInt(maxUploadMB, 10);
    const cap = parseInt(historyCap, 10);
    if (!Number.isFinite(mb) || mb < 1) {
      showToast("\u4E0A\u4F20\u4E0A\u9650\u9700\u8981 \u22651 MB", "bad");
      return;
    }
    if (!Number.isFinite(cap) || cap < 10) {
      showToast("\u5386\u53F2\u5BB9\u91CF\u9700\u8981 \u226510 \u6761", "bad");
      return;
    }
    const next = {
      outDir: outDir.trim(),
      maxUploadMB: mb,
      historyCap: cap,
      format,
      mergePages
    };
    try {
      await saveSettings(next);
      await reloadSettings();
      showToast("\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u6BCF op \u70ED\u8BFB\uFF0C\u7ACB\u5373\u751F\u6548\uFF09", "good");
    } catch (e) {
      showToast("\u4FDD\u5B58\u5931\u8D25\uFF1A" + String(e.message || e), "bad");
    }
  };
  const probe = async () => {
    if (!meta) {
      showToast("\u670D\u52A1\u672A\u5728\u7EBF\uFF0C\u65E0\u6CD5\u63A2\u6D4B\u76EE\u5F55", "bad");
      return;
    }
    setProbing(true);
    setProbeMsg("");
    try {
      const r = await probeDir(meta, outDir.trim());
      if (outDir.trim()) {
        const c = r.checked;
        setProbeMsg(c && c.exists && c.isDir ? "\u76EE\u5F55\u6709\u6548 \u2713" : "\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u6587\u4EF6\u5939 \u2717\uFF08\u4FDD\u5B58\u540E\u5F15\u64CE\u4F1A\u56DE\u9000\u5230\u684C\u9762\uFF09");
      } else {
        setProbeMsg("\u5F53\u524D\u7559\u7A7A = \u81EA\u52A8\u7528\u684C\u9762\uFF1A" + (r.desktop[0] || r.home));
      }
    } catch (e) {
      setProbeMsg("\u63A2\u6D4B\u5931\u8D25\uFF1A" + String(e.message || e));
    } finally {
      setProbing(false);
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "pdt-card", children: /* @__PURE__ */ jsxs3("div", { className: "pdt-card-b", children: [
      /* @__PURE__ */ jsx3("label", { className: "pdt-lbl", children: "\u8F93\u51FA\u76EE\u5F55\uFF08\u7559\u7A7A = \u684C\u9762\uFF1B\u652F\u6301 OneDrive \u91CD\u5B9A\u5411\u63A2\u6D4B\uFF09" }),
      /* @__PURE__ */ jsxs3("div", { className: "pdt-row", children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "pdt-inp",
            "data-testid": "outdir-input",
            value: outDir,
            placeholder: "\u5982 D:\\\u8868\u683C\u8F93\u51FA",
            onChange: (e) => setOutDir(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx3("button", { className: "pdt-btn ghost sm", onClick: probe, disabled: probing || !meta, "data-testid": "probe-btn", children: probing ? "\u63A2\u6D4B\u4E2D\u2026" : "\u63A2\u6D4B" })
      ] }),
      probeMsg && /* @__PURE__ */ jsx3("div", { className: "pdt-sub", style: { marginTop: 4 }, "data-testid": "probe-msg", children: probeMsg }),
      /* @__PURE__ */ jsx3("label", { className: "pdt-lbl", children: "\u5355\u6587\u4EF6\u4E0A\u4F20\u4E0A\u9650\uFF08MB\uFF0C1-1024\uFF09" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "pdt-inp",
          "data-testid": "maxmb-input",
          value: maxUploadMB,
          onChange: (e) => setMaxUploadMB(e.target.value.replace(/\D/g, ""))
        }
      ),
      /* @__PURE__ */ jsx3("label", { className: "pdt-lbl", children: "\u4EFB\u52A1\u5386\u53F2\u5BB9\u91CF\uFF08\u6761\uFF0C10-1000\uFF0C\u8D85\u51FA\u73AF\u5F62\u6DD8\u6C70\uFF09" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "pdt-inp",
          "data-testid": "cap-input",
          value: historyCap,
          onChange: (e) => setHistoryCap(e.target.value.replace(/\D/g, ""))
        }
      ),
      /* @__PURE__ */ jsx3("label", { className: "pdt-lbl", children: "\u9ED8\u8BA4\u8F93\u51FA\u683C\u5F0F" }),
      /* @__PURE__ */ jsx3("div", { className: "pdt-chiprow", style: { padding: "2px 0 6px" }, "data-testid": "fmt-row", children: ["xlsx", "csv", "json", "all"].map((f) => /* @__PURE__ */ jsx3("button", { className: "pdt-chip" + (format === f ? " on" : ""), onClick: () => setFormat(f), children: { xlsx: "Excel", csv: "CSV", json: "JSON", all: "\u5168\u90E8" }[f] }, f)) }),
      /* @__PURE__ */ jsxs3("label", { className: "pdt-row", style: { marginTop: 6, fontSize: 12 }, children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: mergePages, onChange: (e) => setMergePages(e.target.checked), "data-testid": "merge-default" }),
        "\u9ED8\u8BA4\u5F00\u542F\u8DE8\u9875\u7EED\u8868\u5408\u5E76"
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "pdt-row", style: { marginTop: 12 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "pdt-btn", "data-testid": "save-btn", onClick: save, children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx3("span", { className: "pdt-sub", children: "\u952E\u7A7A\u95F4\uFF1Acap.kv pdf-tables.settings\uFF08\u4EC5\u9762\u677F\u5199\uFF09" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx3("div", { className: "pdt-card", children: /* @__PURE__ */ jsx3("div", { className: "pdt-card-b", children: /* @__PURE__ */ jsxs3("div", { className: "pdt-sub", children: [
      "\u670D\u52A1\uFF1A",
      meta ? `\u5728\u7EBF :${meta.port}\uFF08v${meta.version || "?"}\uFF0C\u6865 ${meta.bridge || "ok"}\uFF09` : "\u79BB\u7EBF",
      /* @__PURE__ */ jsx3("br", {}),
      "\u5B89\u5168\u5E95\u7EBF\uFF1A\u53EA\u7ED1 127.0.0.1 + token \xB7 \u96F6\u5916\u7F51\u8BF7\u6C42 \xB7 \u8F93\u5165\u6C38\u4E0D\u4FEE\u6539 \xB7 \u8F93\u51FA\u6C38\u4E0D\u8986\u76D6",
      /* @__PURE__ */ jsx3("br", {}),
      "\u80FD\u529B\u8FB9\u754C\uFF1A\u626B\u63CF\u4EF6/\u56FE\u7247\u578B PDF \u4E0D\u505A OCR\uFF1B\u52A0\u5BC6 PDF \u4E0D\u7834\u89E3\uFF1B\u68C0\u6D4B\u4E0D\u5230\u5BF9\u9F50\u5217\u7ED3\u6784\u65F6\u4F1A\u5982\u5B9E\u8BF4\u660E\u3002"
    ] }) }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.pdt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pdt-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pdt-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pdt-body::-webkit-scrollbar{width:9px;height:9px}
.pdt-body::-webkit-scrollbar-track{background:transparent}
.pdt-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pdt-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.pdt-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2E9E6B,#1C6B48);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.pdt-tt{flex:1;min-width:0}
.pdt-tt b{font-size:15px;display:block}
.pdt-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.pdt-tabs{display:flex;gap:4px}
.pdt-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.pdt-tab:hover{color:#E6EAF2}
.pdt-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pdt-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pdt-card-b{padding:11px 13px}
.pdt-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.pdt-btn{background:#2E9E6B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.pdt-btn:hover{filter:brightness(1.12)}
.pdt-btn:disabled{opacity:.45;cursor:not-allowed}
.pdt-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pdt-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.pdt-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pdt-inp:focus{outline:none;border-color:#2E9E6B}
.pdt-inp::placeholder{color:#4d5566}
.pdt-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.pdt-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.pdt-chip:hover{border-color:#3a4356}
.pdt-chip.on{background:#15342a;border-color:#2E9E6B;color:#9FE8C0;font-weight:600}
.pdt-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.pdt-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.pdt-item-head{display:flex;align-items:center;gap:8px}
.pdt-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdt-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.pdt-badge.bad{color:#FF8A9A;border-color:#54262c}
.pdt-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.pdt-row{display:flex;gap:8px;align-items:center}
.pdt-row .grow{flex:1;min-width:0}
.pdt-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.pdt-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.pdt-alert.warn{background:rgba(232,145,45,.07);border-color:#5a3d1a;color:#F2B263}
.pdt-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.pdt-drop{margin:0 16px 10px;border:1.5px dashed #333c4e;border-radius:13px;padding:22px 14px;text-align:center;color:#8B95A7;font-size:12px;cursor:pointer;line-height:1.8;background:#131820}
.pdt-drop:hover,.pdt-drop.over{border-color:#2E9E6B;color:#9FE8C0;background:#12241d}
.pdt-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pdt-toast.bad{border-color:#54262c;color:#FF8A9A}
.pdt-toast.good{border-color:#2b4a35;color:#7EE2A0}
.pdt-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.pdt-pre{background:#12151c;border:1px solid #2a2f3a;border-radius:10px;padding:10px;font:11.5px/1.6 ui-monospace,Consolas,monospace;color:#C8D0E0;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin-top:8px}
.pdt-gridwrap{overflow-x:auto;margin-top:8px;border:1px solid #242C3A;border-radius:8px}
.pdt-grid{border-collapse:collapse;font:10.5px/1.5 ui-monospace,Consolas,monospace;min-width:100%}
.pdt-grid td,.pdt-grid th{border:1px solid #242C3A;padding:3px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.pdt-grid th{background:#1C2330;color:#C9B8FF;font-weight:600;position:sticky;top:0}
.pdt-num{color:#9FE8C0}
`;
function PdfTablesPanel(_props) {
  const [tab, setTab] = useState3("work");
  const [toast, setToast] = useState3(null);
  const [meta, setMeta] = useState3(null);
  const [settings, setSettings] = useState3(() => coreDefaults());
  const [history, setHistory] = useState3([]);
  const showToast = useCallback((msg, kind = "good") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);
  const reloadMeta = useCallback(async () => {
    try {
      setMeta(await getMeta());
    } catch (_) {
      setMeta(null);
    }
  }, []);
  const reloadSettings = useCallback(async () => {
    try {
      setSettings(await loadSettings());
    } catch (_) {
    }
  }, []);
  const reloadHistory = useCallback(async () => {
    try {
      setHistory(await loadHistory());
    } catch (_) {
    }
  }, []);
  useEffect2(() => {
    reloadMeta();
    reloadSettings();
    reloadHistory();
  }, [reloadMeta, reloadSettings, reloadHistory]);
  const ctx = { showToast, meta, reloadMeta, settings, reloadSettings, history, reloadHistory };
  return /* @__PURE__ */ jsxs4("div", { className: "pdt-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "pdt-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "pdt-logo", children: "\u25A6" }),
      /* @__PURE__ */ jsxs4("div", { className: "pdt-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u8868\u683C\u63D0\u53D6\u53F0 \xB7 PDF \u8868\u683C \u2192 Excel/CSV" }),
        /* @__PURE__ */ jsx4("small", { children: meta ? `\u670D\u52A1\u5728\u7EBF :${meta.port} \xB7 \u6587\u4EF6\u5168\u7A0B\u4E0D\u51FA\u672C\u673A` : "\u670D\u52A1\u672A\u5728\u7EBF \u2014\u2014 \u9700\u5728 \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1 \u542F\u52A8\u540E\u4F7F\u7528\u5DE5\u4F5C\u53F0" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "pdt-tabs", children: [["work", "\u5DE5\u4F5C\u53F0"], ["history", "\u5386\u53F2"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: "pdt-tab" + (tab === k ? " on" : ""), onClick: () => {
        setTab(k);
        if (k === "history") reloadHistory();
      }, children: label }, k)) })
    ] }),
    tab === "work" && /* @__PURE__ */ jsx4(WorkTab, { ctx }),
    tab === "history" && /* @__PURE__ */ jsx4(HistoryTab, { ctx }),
    tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { ctx }),
    toast && /* @__PURE__ */ jsx4("div", { className: "pdt-toast" + (toast.kind === "bad" ? " bad" : toast.kind === "good" ? " good" : ""), children: toast.msg })
  ] });
}
function coreDefaults() {
  return { outDir: "", maxUploadMB: 128, historyCap: 200, format: "xlsx", mergePages: true };
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function PdfTablesEntry(props) {
  return /* @__PURE__ */ jsx5(PdfTablesPanel, { ...props });
}
export {
  PdfTablesEntry as default
};
