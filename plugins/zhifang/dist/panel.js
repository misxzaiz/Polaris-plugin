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
    function imageKind(buf) {
      if (!buf || buf.length < 4) return null;
      if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "jpg";
      if (buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return "png";
      return null;
    }
    function validateInputs(files, limits) {
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error("\u6CA1\u6709\u6536\u5230\u4EFB\u4F55\u8F93\u5165\u6587\u4EF6");
      }
      if (files.length > 200) throw new Error("\u4E00\u6B21\u6700\u591A\u5904\u7406 200 \u4E2A\u6587\u4EF6\uFF0C\u6536\u5230 " + files.length + " \u4E2A");
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
        if (limits.kind === "pdf" && ext !== "pdf") {
          throw new Error("\u6587\u4EF6 " + f.name + " \u4E0D\u662F PDF\uFF08\u53EA\u63A5\u53D7 .pdf\uFF09");
        }
        if (limits.kind === "image" && ext !== "jpg" && ext !== "jpeg" && ext !== "png") {
          throw new Error("\u6587\u4EF6 " + f.name + " \u4E0D\u662F\u652F\u6301\u7684\u56FE\u7247\uFF08\u53EA\u63A5\u53D7 .jpg/.jpeg/.png\uFF09");
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
      return { outDir, maxUploadMB, historyCap };
    }
    function formatBytes(n) {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0) return "?";
      if (v < 1024) return v + " B";
      if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
      if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + " MB";
      return (v / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }
    function normalizeAngle(angle) {
      const a = angle;
      if (typeof a !== "number" || !Number.isInteger(a) || a === 0 || a % 90 !== 0) {
        throw new Error("\u65CB\u8F6C\u89D2\u5EA6\u5FC5\u987B\u662F 90/180/270\uFF08\u6216 -90/-180/-270\uFF09\uFF0C\u6536\u5230 " + JSON.stringify(angle));
      }
      return (a % 360 + 360) % 360;
    }
    module.exports = {
      parsePageSpec,
      compactRanges,
      sanitizeStem,
      pickOutputName,
      joinPath,
      isPdfBytes,
      imageKind,
      validateInputs,
      normalizeSettings: normalizeSettings2,
      normalizeAngle,
      formatBytes
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useState as useState4 } from "react";

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
var KEY_META = "zhifang.meta";
var KEY_SETTINGS = "zhifang.settings";
var KEY_CMD = "zhifang.cmd";
var KEY_HISTORY = "zhifang.history.";
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
    headers: { "Content-Type": "application/json", "X-Zhifang-Token": meta.token },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return data;
}
async function probeDir(meta, path) {
  const res = await fetch(opEndpoint(meta) + "/api/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Zhifang-Token": meta.token },
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
var OP_LABELS = {
  info: "\u4FE1\u606F",
  merge: "\u5408\u5E76",
  extract: "\u62BD\u9875",
  split: "\u62C6\u5206",
  rotate: "\u65CB\u8F6C",
  delete: "\u5220\u9875",
  images2pdf: "\u56FE\u7247\u8F6CPDF",
  text: "\u63D0\u53D6\u6587\u5B57"
};

// src/WorkTab.tsx
import { useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var OP_META = {
  merge: { label: "\u5408\u5E76", hint: "\u6309\u4E0B\u65B9\u987A\u5E8F\u5408\u5E76\u4E3A\u4E00\u4E2A PDF", needs: "pdf2" },
  extract: { label: "\u62BD\u9875 / \u91CD\u6392", hint: "\u6309\u9875\u7801\u62BD\u51FA\u6210\u65B0\u6587\u4EF6\uFF1B\u5199 3,1,2 \u53EF\u91CD\u6392", needs: "pdf1" },
  split: { label: "\u62C6\u5206", hint: "\u6BCF N \u9875\u62C6\u6210\u4E00\u4EFD", needs: "pdf1" },
  rotate: { label: "\u65CB\u8F6C", hint: "\u628A\u9009\u4E2D\u9875\u7D2F\u8BA1\u65CB\u8F6C\u6307\u5B9A\u89D2\u5EA6", needs: "pdf1" },
  delete: { label: "\u5220\u9875", hint: "\u5220\u9664\u9009\u4E2D\u9875\u540E\u53E6\u5B58\u65B0\u6587\u4EF6", needs: "pdf1" },
  text: { label: "\u63D0\u53D6\u6587\u5B57", hint: "\u62BD\u53D6\u6587\u5B57\u5C42\uFF08\u626B\u63CF\u4EF6\u65E0\u6587\u5B57\u5C42\u4F1A\u660E\u793A\uFF09", needs: "pdf1" },
  info: { label: "\u4FE1\u606F", hint: "\u9875\u6570 / \u5C3A\u5BF8 / \u5143\u6570\u636E\uFF0C\u53EA\u8BFB\u4E0D\u4EA7\u751F\u6587\u4EF6", needs: "pdf1" },
  images2pdf: { label: "\u56FE\u7247\u8F6C PDF", hint: "JPG/PNG \u6309\u987A\u5E8F\u5408\u6210\u4E00\u4E2A PDF\uFF0C\u6BCF\u56FE\u4E00\u9875", needs: "img" }
};
function isPdfName(name) {
  return /\.pdf$/i.test(name);
}
function isImgName(name) {
  return /\.(jpg|jpeg|png)$/i.test(name);
}
function specError(spec, mode) {
  try {
    core.parsePageSpec(spec, 1e5, { mode });
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}
function WorkTab({ ctx }) {
  const { meta, settings, showToast, reloadHistory } = ctx;
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const [op, setOp] = useState(null);
  const [pages, setPages] = useState("");
  const [every, setEvery] = useState("1");
  const [angle, setAngle] = useState(90);
  const [margin, setMargin] = useState("0");
  const [writeTxt, setWriteTxt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pdfs = useMemo(() => files.filter((f) => isPdfName(f.name)), [files]);
  const imgs = useMemo(() => files.filter((f) => isImgName(f.name) && !isPdfName(f.name)), [files]);
  const invalid = useMemo(() => files.filter((f) => !isPdfName(f.name) && !isImgName(f.name)), [files]);
  const available = useMemo(() => {
    if (pdfs.length >= 2 && imgs.length === 0) return ["merge"];
    if (pdfs.length === 1 && imgs.length === 0) return ["extract", "split", "rotate", "delete", "text", "info"];
    if (imgs.length >= 1 && pdfs.length === 0) return ["images2pdf"];
    return [];
  }, [pdfs.length, imgs.length]);
  const mixedHint = pdfs.length >= 1 && imgs.length >= 1 ? "PDF \u4E0E\u56FE\u7247\u6DF7\u9009\u65F6\u65E0\u6CD5\u786E\u5B9A\u5904\u7406\u65B9\u5F0F\uFF1A\u8BF7\u5206\u5F00\u64CD\u4F5C\uFF08\u56FE\u7247\u8F6C PDF \u4E5F\u53EF\u4EE5\u5148\u8F6C\u518D\u5408\u5E76\uFF09" : "";
  const activeSpecMode = op === "extract" ? "ordered" : "set";
  const specMsg = (op === "extract" || op === "rotate" || op === "delete") && pages.trim() ? specError(pages, activeSpecMode) : null;
  const specRequiredMissing = op === "extract" && !pages.trim();
  const addFiles = (list) => {
    if (!list || !list.length) return;
    const next = Array.from(list);
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of next) {
        if (!merged.some((p) => p.name === f.name && p.size === f.size)) merged.push(f);
      }
      return merged;
    });
    setResult(null);
    setErrorMsg("");
  };
  const removeAt = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));
  const move = (idx, delta) => setFiles((prev) => {
    const next = prev.slice();
    const j = idx + delta;
    if (j < 0 || j >= next.length) return prev;
    const t = next[idx];
    next[idx] = next[j];
    next[j] = t;
    return next;
  });
  const pickOp = (o) => {
    setOp(o);
    setResult(null);
    setErrorMsg("");
  };
  const run = async () => {
    if (!meta) {
      showToast("\u670D\u52A1\u672A\u5728\u7EBF\uFF1A\u8BF7\u5148\u5728\u5BBF\u4E3B\u8BBE\u7F6E\u91CC\u542F\u52A8 zhifang \u670D\u52A1", "bad");
      return;
    }
    if (!op || !available.includes(op)) {
      showToast("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u53EF\u7528\u64CD\u4F5C", "bad");
      return;
    }
    if (specMsg) {
      showToast("\u9875\u7801\u89C4\u683C\u6709\u8BEF\uFF1A" + specMsg, "bad");
      return;
    }
    if (specRequiredMissing) {
      showToast("\u62BD\u9875\u9700\u8981\u586B\u5199\u9875\u7801\u89C4\u683C\uFF08\u5982 1-3,5\uFF09", "bad");
      return;
    }
    const effEvery = parseInt(every, 10);
    if (op === "split" && (!Number.isInteger(effEvery) || effEvery < 1)) {
      showToast("\u62C6\u5206\u95F4\u9694\u9700\u8981\u662F\u6B63\u6574\u6570", "bad");
      return;
    }
    const m = parseFloat(margin);
    if (op === "images2pdf" && (!Number.isFinite(m) || m < 0 || m > 200)) {
      showToast("\u9875\u8FB9\u8DDD\u9700\u5728 0-200 \u4E4B\u95F4", "bad");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    setResult(null);
    try {
      const payload = [];
      const order = op === "images2pdf" ? imgs : files;
      for (const f of order) payload.push({ name: f.name, b64: await fileToB64(f) });
      const params = {};
      if (op === "extract") params.pages = pages.trim();
      if (op === "rotate" || op === "delete") params.pages = pages.trim() || "all";
      if (op === "rotate") params.angle = angle;
      if (op === "split") params.every = effEvery;
      if (op === "images2pdf") params.margin = m;
      if (op === "text") {
        params.pages = pages.trim() || "all";
        params.writeTxt = writeTxt;
      }
      const res = await runOpRequest(meta, { op, files: payload, params, source: "panel" });
      if (!res.ok) {
        setErrorMsg(String(res.error || "\u5904\u7406\u5931\u8D25"));
        showToast("\u5904\u7406\u5931\u8D25", "bad");
      } else {
        setResult(res);
        showToast("\u5B8C\u6210\uFF1A" + (res.outputs && res.outputs.length ? res.outputs.map((o) => o.name).join("\u3001") : "\u89C1\u4E0B\u65B9"), "good");
        reloadHistory();
      }
    } catch (e) {
      setErrorMsg("\u8BF7\u6C42\u670D\u52A1\u5931\u8D25\uFF1A" + String(e.message || e) + "\uFF08\u786E\u8BA4\u670D\u52A1\u5728\u7EBF\uFF1A\u5BBF\u4E3B \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1\uFF09");
      showToast("\u8BF7\u6C42\u670D\u52A1\u5931\u8D25", "bad");
    } finally {
      setBusy(false);
    }
  };
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const overLimit = totalSize > settings.maxUploadMB * 1024 * 1024;
  return /* @__PURE__ */ jsxs("div", { children: [
    !meta && /* @__PURE__ */ jsx("div", { className: "zf-alert warn", "data-testid": "svc-offline", children: "\u670D\u52A1\u672A\u5728\u7EBF\uFF1A\u5DE5\u4F5C\u53F0\u9700\u8981\u5728\u5BBF\u4E3B\u91CC\u542F\u52A8 zhifang \u540E\u53F0\u670D\u52A1\uFF08\u5BBF\u4E3B\u300C\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u63D2\u4EF6\u670D\u52A1\u300D\uFF09\u3002\u5386\u53F2\u4E0E\u8BBE\u7F6E\u4E0D\u53D7\u5F71\u54CD\u3002" }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "zf-drop" + (over ? " over" : ""),
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
          "\u62D6\u62FD PDF / JPG / PNG \u5230\u8FD9\u91CC\uFF0C\u6216\u70B9\u51FB\u9009\u62E9\u6587\u4EF6",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("span", { className: "zf-sub", children: meta ? `\u8F93\u51FA\u76EE\u5F55\uFF1A${settings.outDir || "\u684C\u9762\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u6539\uFF09"} \xB7 \u5355\u6B21\u4E0A\u9650 ${settings.maxUploadMB} MB` : "\u684C\u9762\u7AEF \xB7 \u6587\u4EF6\u5168\u7A0B\u4E0D\u51FA\u672C\u673A" })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref: inputRef,
        type: "file",
        multiple: true,
        accept: ".pdf,.jpg,.jpeg,.png",
        style: { display: "none" },
        onChange: (e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }
      }
    ),
    invalid.length > 0 && /* @__PURE__ */ jsxs("div", { className: "zf-alert warn", children: [
      "\u5DF2\u5FFD\u7565\u4E0D\u652F\u6301\u7684\u6587\u4EF6\uFF1A",
      invalid.map((f) => f.name).join("\u3001"),
      "\uFF08\u53EA\u63A5\u53D7 .pdf / .jpg / .jpeg / .png\uFF09"
    ] }),
    mixedHint && /* @__PURE__ */ jsx("div", { className: "zf-alert warn", children: mixedHint }),
    overLimit && /* @__PURE__ */ jsxs("div", { className: "zf-alert bad", children: [
      "\u6240\u9009\u6587\u4EF6\u5171 ",
      core.formatBytes(totalSize),
      "\uFF0C\u8D85\u8FC7\u5355\u6B21\u4E0A\u9650 ",
      settings.maxUploadMB,
      " MB\uFF08\u53EF\u5728\u300C\u8BBE\u7F6E\u300D\u8C03\u5927\uFF09"
    ] }),
    files.length > 0 && /* @__PURE__ */ jsx("div", { className: "zf-card", children: /* @__PURE__ */ jsxs("div", { className: "zf-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "zf-sub", "data-testid": "file-summary", children: [
        "\u5DF2\u9009 ",
        files.length,
        " \u4E2A\u6587\u4EF6 \xB7 \u5171 ",
        core.formatBytes(totalSize),
        op === "merge" ? "\uFF08\u6309\u4E0B\u65B9\u987A\u5E8F\u5408\u5E76\uFF0C\u53EF\u7528 \u25B2\u25BC \u8C03\u6574\uFF09" : ""
      ] }),
      files.map((f, i) => /* @__PURE__ */ jsxs("div", { className: "zf-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs("b", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }, children: [
          i + 1,
          ". ",
          f.name
        ] }),
        /* @__PURE__ */ jsx("span", { className: "zf-sub", children: core.formatBytes(f.size) }),
        op === "merge" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("button", { className: "zf-btn ghost sm", onClick: () => move(i, -1), disabled: i === 0, children: "\u25B2" }),
          /* @__PURE__ */ jsx("button", { className: "zf-btn ghost sm", onClick: () => move(i, 1), disabled: i === files.length - 1, children: "\u25BC" })
        ] }),
        /* @__PURE__ */ jsx("button", { className: "zf-btn ghost sm", onClick: () => removeAt(i), children: "\u79FB\u9664" })
      ] }, f.name + i))
    ] }) }),
    available.length > 0 && /* @__PURE__ */ jsx("div", { className: "zf-chiprow", "data-testid": "op-row", children: available.map((o) => /* @__PURE__ */ jsx("button", { className: "zf-chip" + (op === o ? " on" : ""), onClick: () => pickOp(o), children: OP_META[o].label }, o)) }),
    files.length > 0 && available.length === 0 && !mixedHint && /* @__PURE__ */ jsx("div", { className: "zf-alert warn", children: "\u5F53\u524D\u6587\u4EF6\u7EC4\u5408\u6CA1\u6709\u53EF\u7528\u64CD\u4F5C\uFF08\u5408\u5E76\u9700\u8981 \u22652 \u4E2A PDF\uFF1B\u5355\u6587\u4EF6\u64CD\u4F5C\u9700\u8981\u6070\u597D 1 \u4E2A PDF\uFF09" }),
    op && /* @__PURE__ */ jsx("div", { className: "zf-card", "data-testid": "param-card", children: /* @__PURE__ */ jsxs("div", { className: "zf-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "zf-sub", children: [
        OP_META[op].label,
        "\uFF1A",
        OP_META[op].hint
      ] }),
      (op === "extract" || op === "rotate" || op === "delete" || op === "text") && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("label", { className: "zf-lbl", children: [
          "\u9875\u7801\u89C4\u683C\uFF081-based\uFF1A\u5982 1-3,5\uFF1B3-end\uFF1Ball",
          op === "extract" ? "\uFF1B3,1,2 \u8868\u793A\u91CD\u6392" : "",
          "\uFF09"
        ] }),
        /* @__PURE__ */ jsx("input", { className: "zf-inp", "data-testid": "pages-input", value: pages, placeholder: op === "extract" ? "\u5FC5\u586B\uFF0C\u5982 1-3,5" : "\u7559\u7A7A = \u5168\u90E8\u9875", onChange: (e) => setPages(e.target.value) }),
        specMsg && /* @__PURE__ */ jsx("div", { className: "zf-alert bad", style: { margin: "6px 0 0" }, "data-testid": "spec-error", children: specMsg })
      ] }),
      op === "rotate" && /* @__PURE__ */ jsx("div", { className: "zf-chiprow", style: { padding: "8px 0 0" }, children: [90, 180, 270, -90].map((a) => /* @__PURE__ */ jsx("button", { className: "zf-chip" + (angle === a ? " on" : ""), onClick: () => setAngle(a), children: a > 0 ? "\u987A\u65F6\u9488 " + a : "\u9006\u65F6\u9488 " + -a }, a)) }),
      op === "split" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "zf-lbl", children: "\u6BCF\u51E0\u9875\u4E00\u4EFD" }),
        /* @__PURE__ */ jsx("input", { className: "zf-inp", "data-testid": "every-input", value: every, onChange: (e) => setEvery(e.target.value.replace(/\D/g, "")) })
      ] }),
      op === "images2pdf" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { className: "zf-lbl", children: "\u9875\u8FB9\u8DDD pt\uFF080-200\uFF0C\u9ED8\u8BA4 0\uFF09" }),
        /* @__PURE__ */ jsx("input", { className: "zf-inp", "data-testid": "margin-input", value: margin, onChange: (e) => setMargin(e.target.value) })
      ] }),
      op === "text" && /* @__PURE__ */ jsxs("label", { className: "zf-row", style: { marginTop: 8, fontSize: 12 }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: writeTxt, onChange: (e) => setWriteTxt(e.target.checked) }),
        "\u540C\u65F6\u628A\u5168\u6587\u843D\u76D8\u4E3A\u300C\u6587\u4EF6\u540D-\u6587\u5B57.txt\u300D"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "zf-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx("button", { className: "zf-btn", "data-testid": "run-btn", onClick: run, disabled: busy || !!overLimit || available.length === 0, children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u6267\u884C" }),
        /* @__PURE__ */ jsx("button", { className: "zf-btn ghost", onClick: () => {
          setFiles([]);
          setOp(null);
          setResult(null);
          setErrorMsg("");
        }, children: "\u6E05\u7A7A" })
      ] })
    ] }) }),
    errorMsg && /* @__PURE__ */ jsx("div", { className: "zf-alert bad", "data-testid": "error-box", children: errorMsg }),
    result && result.ok && /* @__PURE__ */ jsxs("div", { className: "zf-ok", "data-testid": "result-box", children: [
      /* @__PURE__ */ jsx("b", { children: "\u5B8C\u6210" }),
      "\uFF08",
      result.ms ?? 0,
      " ms",
      typeof result.pages === "number" ? ` \xB7 ${result.pages} \u9875` : "",
      "\uFF09",
      result.outputs && result.outputs.length > 0 && result.outputs.map((o) => /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
        "\u{1F4C4} ",
        o.name,
        " \xB7 ",
        core.formatBytes(o.size),
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("span", { style: { color: "#9fd8b4", fontSize: 11 }, children: o.path })
      ] }, o.path)),
      result.outputs && result.outputs.length === 0 && result.info && /* @__PURE__ */ jsx("div", { className: "zf-pre", "data-testid": "info-box", children: Object.entries(result.info).filter(([, v]) => v !== "" && v != null).map(([k, v]) => k + "\uFF1A" + String(v)).join("\n") }),
      result.text && /* @__PURE__ */ jsxs("div", { className: "zf-pre", "data-testid": "text-box", children: [
        result.text.slice(0, 2e3),
        result.text.length > 2e3 ? "\n\u2026\uFF08\u524D 2000 \u5B57\u9884\u89C8" + (result.textTruncated ? "\uFF0C\u5168\u6587\u5DF2\u6309\u8BBE\u7F6E\u843D\u76D8\uFF09" : "\uFF09") : ""
      ] }),
      result.note && /* @__PURE__ */ jsx("div", { style: { marginTop: 4, fontSize: 11 }, children: result.note })
    ] })
  ] });
}

// src/HistoryTab.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function timeOf(at) {
  return String(at || "").replace("T", " ").slice(0, 19);
}
function HistoryTab({ ctx }) {
  const { history, reloadHistory, showToast } = ctx;
  const [clearing, setClearing] = useState2(false);
  const clear = async () => {
    if (clearing) return;
    if (!window.confirm("\u786E\u5B9A\u6E05\u7A7A\u5168\u90E8\u4EFB\u52A1\u5386\u53F2\uFF1F\uFF08\u53EA\u5220\u8BB0\u5F55\uFF0C\u4E0D\u5220\u4EFB\u4F55\u8F93\u51FA\u6587\u4EF6\uFF09")) return;
    setClearing(true);
    try {
      await requestClearHistory();
      showToast("\u5DF2\u8BF7\u6C42\u6E05\u7A7A\uFF1A\u670D\u52A1\u5728\u7EBF\u65F6\u5373\u523B\u751F\u6548\uFF08\u79BB\u7EBF\u5219\u4E0A\u7EBF\u540E\u751F\u6548\uFF09", "good");
      window.setTimeout(() => {
        reloadHistory();
      }, 1200);
    } catch (e) {
      showToast("\u6E05\u7A7A\u5931\u8D25\uFF1A" + String(e.message || e), "bad");
    } finally {
      setClearing(false);
    }
  };
  if (!history.length) {
    return /* @__PURE__ */ jsxs2("div", { className: "zf-empty", "data-testid": "history-empty", children: [
      "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u5728\u5DE5\u4F5C\u53F0\u5904\u7406\u6587\u4EF6\uFF0C\u6216\u8BA9 AI \u8C03\u7528 zhifang_* \u5DE5\u5177\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5B8C\u6574\u53F0\u8D26\u3002"
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "zf-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "zf-bar" }),
      "\u4EFB\u52A1\u5386\u53F2",
      /* @__PURE__ */ jsxs2("span", { className: "zf-hint", children: [
        history.length,
        " \u6761 \xB7 \u53EA\u5220\u8BB0\u5F55\u4E0D\u5220\u6587\u4EF6"
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "zf-chiprow", children: [
      /* @__PURE__ */ jsx2("button", { className: "zf-btn ghost sm", onClick: reloadHistory, children: "\u5237\u65B0" }),
      /* @__PURE__ */ jsx2("button", { className: "zf-btn ghost sm", "data-testid": "clear-history", onClick: clear, disabled: clearing, children: "\u6E05\u7A7A\u5386\u53F2" })
    ] }),
    history.map((h) => /* @__PURE__ */ jsxs2("div", { className: "zf-item", "data-testid": "history-item", children: [
      /* @__PURE__ */ jsxs2("div", { className: "zf-item-head", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          OP_LABELS[h.op] || h.op,
          h.ok === false ? " \xB7 \u5931\u8D25" : ""
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "zf-badge " + (h.source === "mcp" ? "ok" : ""), children: h.source === "mcp" ? "AI" : "\u9762\u677F" }),
        /* @__PURE__ */ jsx2("span", { className: "zf-badge", children: timeOf(h.at) }),
        /* @__PURE__ */ jsxs2("span", { className: "zf-badge", children: [
          h.ms,
          "ms"
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "zf-item-mid", children: [
        "\u8F93\u5165\uFF1A",
        (h.inputs || []).join("\u3001") || "\u2014"
      ] }),
      h.ok === false && h.error && /* @__PURE__ */ jsxs2("div", { className: "zf-item-mid", style: { color: "#FF8A9A" }, children: [
        "\u5931\u8D25\u539F\u56E0\uFF1A",
        h.error
      ] }),
      (h.outputs || []).map((o) => /* @__PURE__ */ jsxs2("div", { className: "zf-item-mid", children: [
        "\u{1F4C4} ",
        o.name,
        " \xB7 ",
        core.formatBytes(o.size),
        " \xB7 ",
        o.path
      ] }, o.path))
    ] }, h.id))
  ] });
}

// src/SettingsTab.tsx
import { useEffect, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ ctx }) {
  const { settings, reloadSettings, meta, showToast } = ctx;
  const [outDir, setOutDir] = useState3(settings.outDir);
  const [maxUploadMB, setMaxUploadMB] = useState3(String(settings.maxUploadMB));
  const [saving, setSaving] = useState3(false);
  const [probe, setProbe] = useState3("");
  useEffect(() => {
    setOutDir(settings.outDir);
    setMaxUploadMB(String(settings.maxUploadMB));
  }, [settings]);
  const save = async () => {
    if (saving) return;
    const mb = parseInt(maxUploadMB, 10);
    if (!Number.isFinite(mb) || mb < 1) {
      showToast("\u4E0A\u4F20\u4E0A\u9650\u9700\u662F\u4E0D\u5C0F\u4E8E 1 \u7684\u6574\u6570 MB", "bad");
      return;
    }
    setSaving(true);
    try {
      await saveSettings(core.normalizeSettings({ outDir, maxUploadMB: mb }));
      await reloadSettings();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u6309\u6B21\u70ED\u8BFB\uFF0C\u7ACB\u5373\u751F\u6548\uFF09", "good");
    } catch (e) {
      showToast("\u4FDD\u5B58\u5931\u8D25\uFF1A" + String(e.message || e), "bad");
    } finally {
      setSaving(false);
    }
  };
  const doProbe = async () => {
    if (!meta) {
      setProbe("\u670D\u52A1\u672A\u5728\u7EBF\uFF0C\u65E0\u6CD5\u63A2\u6D4B\u76EE\u5F55\u3002\u53EF\u4EE5\u76F4\u63A5\u624B\u8F93\u7EDD\u5BF9\u8DEF\u5F84\u4FDD\u5B58\uFF08\u4FDD\u5B58\u65F6\u4F1A\u6821\u9A8C\u683C\u5F0F\uFF09\u3002");
      return;
    }
    try {
      const r = await probeDir(meta, outDir);
      const lines = [
        "\u684C\u9762\u5019\u9009\uFF1A" + (r.desktop && r.desktop.length ? r.desktop.join(" \u3001 ") : "\u672A\u627E\u5230\uFF08\u5C06\u56DE\u9000\u7528\u6237\u76EE\u5F55\uFF09"),
        r.checked ? r.checked.exists ? r.checked.isDir ? "\u2713 \u76EE\u5F55\u5B58\u5728\u53EF\u7528" : "\u2717 \u8DEF\u5F84\u5B58\u5728\u4F46\u4E0D\u662F\u76EE\u5F55" : "\u2717 \u76EE\u5F55\u4E0D\u5B58\u5728\uFF08\u5C06\u56DE\u9000\uFF1A\u684C\u9762 \u2192 \u7528\u6237\u76EE\u5F55\uFF09" : ""
      ].filter(Boolean);
      setProbe(lines.join("\n"));
    } catch (e) {
      setProbe("\u63A2\u6D4B\u5931\u8D25\uFF1A" + String(e.message || e));
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "zf-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "zf-bar" }),
      "\u8F93\u51FA\u4E0E\u5B89\u5168"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "zf-card", children: /* @__PURE__ */ jsxs3("div", { className: "zf-card-b", children: [
      /* @__PURE__ */ jsx3("label", { className: "zf-lbl", children: "\u8F93\u51FA\u76EE\u5F55\uFF08\u7559\u7A7A = \u4F18\u5148\u684C\u9762\uFF0C\u627E\u4E0D\u5230\u5219\u56DE\u9000\u7528\u6237\u76EE\u5F55\uFF09" }),
      /* @__PURE__ */ jsx3("input", { className: "zf-inp", "data-testid": "outdir-input", value: outDir, placeholder: "\u5982 C:\\Users\\me\\Desktop", onChange: (e) => setOutDir(e.target.value) }),
      /* @__PURE__ */ jsxs3("div", { className: "zf-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "zf-btn ghost sm", onClick: doProbe, children: "\u63A2\u6D4B\u76EE\u5F55" }),
        /* @__PURE__ */ jsx3("span", { className: "zf-sub", children: "\u9762\u677F\u4E0E AI \u5171\u7528\u8FD9\u4E00\u5957\u8F93\u51FA\u7B56\u7565\uFF1B\u8F93\u51FA\u6C38\u4E0D\u8986\u76D6\uFF08\u540C\u540D\u81EA\u52A8 -2/-3\uFF09" })
      ] }),
      probe && /* @__PURE__ */ jsx3("div", { className: "zf-pre", "data-testid": "probe-box", children: probe }),
      /* @__PURE__ */ jsx3("label", { className: "zf-lbl", children: "\u5355\u6B21\u4E0A\u4F20\u4E0A\u9650\uFF08MB\uFF0C1-1024\uFF09" }),
      /* @__PURE__ */ jsx3("input", { className: "zf-inp", "data-testid": "maxmb-input", value: maxUploadMB, onChange: (e) => setMaxUploadMB(e.target.value.replace(/\D/g, "")) }),
      /* @__PURE__ */ jsx3("div", { className: "zf-sub", style: { marginTop: 6 }, children: "\u5B89\u5168\u9762\uFF1A\u670D\u52A1\u53EA\u76D1\u542C 127.0.0.1 \u5E76\u6821\u9A8C token\uFF1B\u8F93\u5165\u6587\u4EF6\u6C38\u4E0D\u4FEE\u6539/\u5220\u9664\uFF1B\u52A0\u5BC6 PDF \u76F4\u63A5\u62D2\u7EDD\uFF08\u4E0D\u7834\u89E3\uFF09\u3002 \u660E\u786E\u4E0D\u505A\uFF1A\u538B\u7F29\uFF08\u7EAF\u672C\u5730\u65B9\u6848\u65E0\u6CD5\u771F\u5B9E\u91CD\u538B\u56FE\u7247\uFF0C\u5B81\u7F3A\u6BCB\u6EE5\uFF09\u3001OCR\u3001\u5BC6\u7801\u53BB\u9664\u3002" }),
      /* @__PURE__ */ jsx3("div", { className: "zf-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx3("button", { className: "zf-btn", "data-testid": "save-btn", onClick: save, disabled: saving, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "zf-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "zf-bar" }),
      "\u670D\u52A1\u72B6\u6001"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "zf-card", children: /* @__PURE__ */ jsx3("div", { className: "zf-card-b", children: meta ? /* @__PURE__ */ jsxs3("div", { className: "zf-sub", "data-testid": "meta-box", children: [
      "\u5728\u7EBF \xB7 \u7AEF\u53E3 ",
      meta.port,
      " \xB7 \u7248\u672C ",
      meta.version || "?",
      " \xB7 \u5FC3\u8DF3 ",
      String(meta.lastTickAt || "").replace("T", " ").slice(0, 19) || "\u2014",
      meta.bridge === "degraded" ? " \xB7 \u6865\u964D\u7EA7\uFF08\u5386\u53F2\u767B\u8BB0\u6682\u4E0D\u53EF\u7528\uFF0C\u6587\u4EF6\u64CD\u4F5C\u6B63\u5E38\uFF09" : ""
    ] }) : /* @__PURE__ */ jsx3("div", { className: "zf-sub", "data-testid": "meta-box", children: "\u672A\u5728\u7EBF\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u300C\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u63D2\u4EF6\u670D\u52A1\u300D\u542F\u52A8 zhifang-service\u3002" }) }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.zf-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.zf-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.zf-body{flex:1;overflow-y:auto;padding:0 0 24px}
.zf-body::-webkit-scrollbar{width:9px;height:9px}
.zf-body::-webkit-scrollbar-track{background:transparent}
.zf-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.zf-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.zf-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8A5CF6,#5B3DBE);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.zf-tt{flex:1;min-width:0}
.zf-tt b{font-size:15px;display:block}
.zf-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.zf-tabs{display:flex;gap:4px}
.zf-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.zf-tab:hover{color:#E6EAF2}
.zf-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.zf-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.zf-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8A5CF6,#5B3DBE);flex-shrink:0}
.zf-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.zf-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.zf-card-b{padding:11px 13px}
.zf-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.zf-btn{background:#8A5CF6;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.zf-btn:hover{filter:brightness(1.12)}
.zf-btn:disabled{opacity:.45;cursor:not-allowed}
.zf-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.zf-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.zf-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.zf-inp:focus{outline:none;border-color:#8A5CF6}
.zf-inp::placeholder{color:#4d5566}
.zf-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.zf-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.zf-chip:hover{border-color:#3a4356}
.zf-chip.on{background:#2a2150;border-color:#8A5CF6;color:#C9B8FF;font-weight:600}
.zf-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.zf-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.zf-item-head{display:flex;align-items:center;gap:8px}
.zf-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zf-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.zf-badge.bad{color:#FF8A9A;border-color:#54262c}
.zf-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.zf-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.zf-row{display:flex;gap:8px;align-items:center}
.zf-row .grow{flex:1;min-width:0}
.zf-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.zf-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.zf-alert.warn{background:rgba(232,145,45,.07);border-color:#5a3d1a;color:#F2B263}
.zf-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.zf-drop{margin:0 16px 10px;border:1.5px dashed #333c4e;border-radius:13px;padding:22px 14px;text-align:center;color:#8B95A7;font-size:12px;cursor:pointer;line-height:1.8;background:#131820}
.zf-drop:hover,.zf-drop.over{border-color:#8A5CF6;color:#C9B8FF;background:#171426}
.zf-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.zf-toast.bad{border-color:#54262c;color:#FF8A9A}
.zf-toast.good{border-color:#2b4a35;color:#7EE2A0}
.zf-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.zf-pre{background:#12151c;border:1px solid #2a2f3a;border-radius:10px;padding:10px;font:11.5px/1.6 ui-monospace,Consolas,monospace;color:#C8D0E0;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin-top:8px}
`;
function ZhifangPanel(_props) {
  const [tab, setTab] = useState4("work");
  const [toast, setToast] = useState4(null);
  const [meta, setMeta] = useState4(null);
  const [settings, setSettings] = useState4(() => ({ outDir: "", maxUploadMB: 128, historyCap: 200 }));
  const [history, setHistory] = useState4([]);
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
  return /* @__PURE__ */ jsxs4("div", { className: "zf-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "zf-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "zf-logo", children: "\u{1F4C4}" }),
      /* @__PURE__ */ jsxs4("div", { className: "zf-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u7EB8\u574A \xB7 \u672C\u5730 PDF \u5DE5\u574A" }),
        /* @__PURE__ */ jsx4("small", { children: meta ? `\u670D\u52A1\u5728\u7EBF :${meta.port} \xB7 \u6587\u4EF6\u5168\u7A0B\u4E0D\u51FA\u672C\u673A` : "\u670D\u52A1\u672A\u5728\u7EBF \u2014\u2014 \u9700\u5728 \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1 \u542F\u52A8\u540E\u4F7F\u7528\u5DE5\u4F5C\u53F0" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "zf-tabs", children: [["work", "\u5DE5\u4F5C\u53F0"], ["history", "\u5386\u53F2"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: "zf-tab" + (tab === k ? " on" : ""), onClick: () => {
        setTab(k);
        if (k === "history") reloadHistory();
      }, children: label }, k)) })
    ] }),
    tab === "work" && /* @__PURE__ */ jsx4(WorkTab, { ctx }),
    tab === "history" && /* @__PURE__ */ jsx4(HistoryTab, { ctx }),
    tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { ctx }),
    toast && /* @__PURE__ */ jsx4("div", { className: "zf-toast" + (toast.kind === "bad" ? " bad" : toast.kind === "good" ? " good" : ""), children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function ZhifangEntry(props) {
  return /* @__PURE__ */ jsx5(ZhifangPanel, { ...props });
}
export {
  ZhifangEntry as default
};
