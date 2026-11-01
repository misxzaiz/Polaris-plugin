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
    var SUPPORTED_SCAN_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".svg"];
    var TRANSFORM_TARGETS = ["webp", "jpeg", "png", "avif", "tiff"];
    var DEFAULT_QUALITY = { webp: 82, jpeg: 82, png: 82, avif: 50, tiff: 82 };
    var BISECTABLE = { webp: true, jpeg: true, avif: true, tiff: true, png: true };
    function extToFormat(ext) {
      const e = String(ext || "").toLowerCase();
      return { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp", ".gif": "gif", ".bmp": "bmp", ".tif": "tiff", ".tiff": "tiff", ".avif": "avif", ".svg": "svg" }[e] || null;
    }
    function formatToExt(fmt) {
      return { webp: ".webp", jpeg: ".jpg", png: ".png", avif: ".avif", tiff: ".tiff", gif: ".gif" }[fmt] || null;
    }
    function imageKind(bytes) {
      if (!bytes || bytes.length < 12) return null;
      if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
      if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "png";
      if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
      if (bytes.toString("ascii", 0, 4) === "GIF8") return "gif";
      if (bytes[0] === 66 && bytes[1] === 77) return "bmp";
      if (bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 || bytes[0] === 77 && bytes[1] === 77 && bytes[3] === 42) return "tiff";
      if (bytes.toString("ascii", 4, 8) === "ftyp") {
        const brand = bytes.toString("ascii", 8, 12);
        if (/^(avif|avis|heic|mif1|msf1)/.test(brand)) return "avif";
      }
      const head = bytes.toString("utf8", 0, Math.min(bytes.length, 256)).replace(/^\uFEFF/, "").trimStart().toLowerCase();
      if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg";
      return null;
    }
    function leReaders(buf) {
      return { u16: (o) => buf.readUInt16LE(o), u32: (o) => buf.readUInt32LE(o) };
    }
    function beReaders(buf) {
      return { u16: (o) => buf.readUInt16BE(o), u32: (o) => buf.readUInt32BE(o) };
    }
    function tiffHasGps(buf) {
      try {
        if (!buf || buf.length < 8) return null;
        const le = buf[0] === 73;
        if (!le && buf[0] !== 77) return null;
        if (buf[1] !== buf[0]) return null;
        const { u16, u32 } = le ? leReaders(buf) : beReaders(buf);
        if (u16(2) !== 42) return null;
        const off0 = u32(4);
        if (off0 + 2 > buf.length) return null;
        const n = u16(off0);
        for (let i = 0; i < n; i++) {
          const e = off0 + 2 + i * 12;
          if (e + 12 > buf.length) return null;
          if (u16(e) === 34853) {
            const gpsOff = u32(e + 8);
            if (!gpsOff || gpsOff + 2 > buf.length) return false;
            return u16(gpsOff) > 0;
          }
        }
        return false;
      } catch (_) {
        return null;
      }
    }
    function tiffIfd0Ascii(buf) {
      const out = {};
      try {
        if (!buf || buf.length < 8) return out;
        const le = buf[0] === 73;
        if (buf[0] !== 73 && buf[0] !== 77 || buf[1] !== buf[0]) return out;
        const { u16, u32 } = le ? leReaders(buf) : beReaders(buf);
        if (u16(2) !== 42) return out;
        const off0 = u32(4);
        if (off0 + 2 > buf.length) return out;
        const n = u16(off0);
        const tags = { 271: "make", 272: "model", 306: "dateTime", 305: "software" };
        for (let i = 0; i < n; i++) {
          const e = off0 + 2 + i * 12;
          if (e + 12 > buf.length) break;
          const key = tags[u16(e)];
          if (!key) continue;
          const cnt = u32(e + 4);
          if (cnt <= 0 || cnt > 4096) continue;
          let voff = e + 8;
          if (cnt > 4) voff = u32(e + 8);
          if (voff + cnt > buf.length) continue;
          const s = buf.toString("latin1", voff, voff + cnt).replace(/\0+$/, "").trim();
          if (s) out[key] = s;
        }
      } catch (_) {
      }
      return out;
    }
    function jpegExifTiff(buf) {
      try {
        if (buf.length < 4 || buf[0] !== 255 || buf[1] !== 216) return null;
        let o = 2;
        while (o + 4 <= buf.length) {
          if (buf[o] !== 255) {
            o++;
            continue;
          }
          const marker = buf[o + 1];
          if (marker === 216 || marker >= 208 && marker <= 215 || marker === 1) {
            o += 2;
            continue;
          }
          if (marker === 218 || marker === 217) return null;
          const len = buf.readUInt16BE(o + 2);
          if (len < 2) return null;
          if (marker === 225 && buf.toString("ascii", o + 4, o + 10) === "Exif\0\0") {
            return buf.subarray(o + 10, o + 2 + len);
          }
          o += 2 + len;
        }
        return null;
      } catch (_) {
        return null;
      }
    }
    function pngExifTiff(buf) {
      try {
        if (buf.length < 8) return null;
        let o = 8;
        for (let hops = 0; o + 8 <= buf.length && hops < 1024; hops++) {
          const len = buf.readUInt32BE(o);
          const type = buf.toString("ascii", o + 4, o + 8);
          if (type === "eXIf") return buf.subarray(o + 8, Math.min(o + 8 + len, buf.length));
          if (type === "IEND" || len > buf.length) return null;
          o += 12 + len;
        }
        return null;
      } catch (_) {
        return null;
      }
    }
    function webpExifTiff(buf) {
      try {
        if (buf.length < 12) return null;
        let o = 12;
        while (o + 8 <= buf.length) {
          const fourcc = buf.toString("ascii", o, o + 4);
          const size = buf.readUInt32LE(o + 4);
          if (fourcc === "EXIF") {
            let d = buf.subarray(o + 8, o + 8 + size);
            if (d.length >= 4 && d[0] !== 73 && d[0] !== 77 && d.length >= 8 && (d[4] === 73 || d[4] === 77)) d = d.subarray(4);
            return d;
          }
          o += 8 + size + size % 2;
        }
        return null;
      } catch (_) {
        return null;
      }
    }
    function exifOf(bytes) {
      const kind = imageKind(bytes);
      let tiff = null;
      if (kind === "jpeg") tiff = jpegExifTiff(bytes);
      else if (kind === "png") tiff = pngExifTiff(bytes);
      else if (kind === "webp") tiff = webpExifTiff(bytes);
      else if (kind === "tiff") tiff = bytes;
      if (kind !== "jpeg" && kind !== "png" && kind !== "webp" && kind !== "tiff") {
        return { hasGps: null, exif: {} };
      }
      if (!tiff) return { hasGps: false, exif: {} };
      return { hasGps: tiffHasGps(tiff), exif: tiffIfd0Ascii(tiff) };
    }
    function normalizeSettings2(raw) {
      const r = raw && typeof raw === "object" ? raw : {};
      const num = (v, d, lo, hi) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
      };
      return {
        outDir: typeof r.outDir === "string" ? r.outDir.trim() : "",
        concurrency: num(r.concurrency, 3, 1, 8),
        maxBatch: num(r.maxBatch, 300, 1, 2e3),
        maxFileMB: num(r.maxFileMB, 100, 1, 2048),
        historyCap: num(r.historyCap, 100, 10, 1e3)
      };
    }
    function normalizePipeline(raw) {
      const r = raw && typeof raw === "object" ? raw : {};
      const fmt = TRANSFORM_TARGETS.indexOf(r.format) >= 0 ? r.format : "keep";
      const q = Math.round(Number(r.quality));
      const quality = Number.isFinite(q) ? Math.min(100, Math.max(1, q)) : null;
      const uintOpt = (v, max) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) && n > 0 ? Math.min(max, n) : null;
      };
      const kb = uintOpt(r.targetKB, 512 * 1024);
      return {
        format: fmt,
        quality,
        maxWidth: uintOpt(r.maxWidth, 1e5),
        maxHeight: uintOpt(r.maxHeight, 1e5),
        targetKB: kb,
        stripMetadata: r.stripMetadata !== false
        // 默认 true：隐私默认
      };
    }
    var FORMAT_DISPLAY = { webp: "WebP", jpeg: "JPEG", png: "PNG", avif: "AVIF", tiff: "TIFF" };
    function pipelineLabel(p) {
      const parts = [];
      parts.push(p.format === "keep" ? "\u4FDD\u6301\u539F\u683C\u5F0F" : "\u8F6C " + (FORMAT_DISPLAY[p.format] || p.format.toUpperCase()));
      parts.push("\u8D28\u91CF " + (p.quality || DEFAULT_QUALITY[p.format] || 82));
      if (p.maxWidth) parts.push("\u5BBD\u2264" + p.maxWidth);
      if (p.maxHeight) parts.push("\u9AD8\u2264" + p.maxHeight);
      if (p.targetKB) parts.push("\u76EE\u6807 " + p.targetKB + "KB");
      parts.push(p.stripMetadata ? "\u5265 EXIF" : "\u4FDD\u7559 EXIF");
      return parts.join(" \xB7 ");
    }
    function sanitizeStem(name) {
      let stem = String(name || "");
      stem = stem.replace(/\\/g, "/").split("/").pop() || "";
      const dot = stem.lastIndexOf(".");
      if (dot > 0) stem = stem.slice(0, dot);
      else if (dot === 0) stem = "";
      stem = stem.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "");
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) stem = "_" + stem;
      return stem || "image";
    }
    function pickOutputName(dir, stem, ext, existsFn) {
      const clean = ext && ext.startsWith(".") ? ext.toLowerCase() : "." + String(ext || "bin");
      let p = pathJoin(dir, stem + clean);
      if (!existsFn(p)) return p;
      for (let i = 2; i < 1e5; i++) {
        p = pathJoin(dir, stem + "-" + i + clean);
        if (!existsFn(p)) return p;
      }
      throw new Error("\u8F93\u51FA\u547D\u540D\u51B2\u7A81\u65E0\u6CD5\u56DE\u907F\uFF1A" + dir);
    }
    function pathJoin(dir, name) {
      const sep = dir.includes("\\") || /^[A-Za-z]:/.test(dir) ? "\\" : "/";
      return dir.endsWith("\\") || dir.endsWith("/") ? dir + name : dir + sep + name;
    }
    function guardAbsolute(p, label) {
      if (typeof p !== "string" || !p.trim()) throw new Error("\u7F3A\u5C11" + label + "\u8DEF\u5F84\uFF1A\u8BF7\u63D0\u4F9B\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 C:\\Users\\me\\Pictures\uFF09");
      const t = p.trim();
      if (t.indexOf("\0") >= 0) throw new Error(label + "\u8DEF\u5F84\u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u7A7A\u5B57\u8282\uFF09");
      if (!/^[A-Za-z]:[\\/]/.test(t) && !t.startsWith("\\\\") && !t.startsWith("/")) {
        throw new Error(label + "\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 C:\\Users\\me\\Pictures\uFF09\uFF0C\u6536\u5230\uFF1A" + t);
      }
      return t;
    }
    function formatBytes(n) {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0) return "?";
      if (v < 1024) return v + " B";
      if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
      if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + " MB";
      return (v / 1024 / 1024 / 1024).toFixed(2) + " GB";
    }
    module.exports = {
      SUPPORTED_SCAN_EXTS,
      TRANSFORM_TARGETS,
      DEFAULT_QUALITY,
      BISECTABLE,
      extToFormat,
      formatToExt,
      imageKind,
      exifOf,
      tiffHasGps,
      tiffIfd0Ascii,
      jpegExifTiff,
      pngExifTiff,
      webpExifTiff,
      normalizeSettings: normalizeSettings2,
      normalizePipeline,
      pipelineLabel,
      sanitizeStem,
      pickOutputName,
      guardAbsolute,
      formatBytes
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect3, useState as useState4 } from "react";

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
var KEY_META = "imgforge.meta";
var KEY_SETTINGS = "imgforge.settings";
var KEY_CMD = "imgforge.cmd";
var KEY_HISTORY = "imgforge.history.";
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
function svcEndpoint(meta) {
  return `http://127.0.0.1:${meta.port}`;
}
async function svcPost(meta, api, body) {
  const res = await fetch(svcEndpoint(meta) + api, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Imgforge-Token": meta.token },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function probeDir(meta, path) {
  return svcPost(meta, "/api/probe", { path });
}
function scanDir(meta, dir, recursive) {
  return svcPost(meta, "/api/scan", { dir, recursive });
}
function startProcess(meta, body) {
  return svcPost(meta, "/api/process", body);
}
async function fetchJob(meta, id) {
  const res = await fetch(`${svcEndpoint(meta)}/api/job?id=${encodeURIComponent(id)}`, {
    headers: { "X-Imgforge-Token": meta.token }
  });
  const data = await res.json();
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data.job || null;
}

// src/WorkTab.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var RENDER_CAP = 200;
function WorkTab({ ctx, onSendToChat }) {
  const { meta, settings, showToast } = ctx;
  const [dir, setDir] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  const [fmt, setFmt] = useState("keep");
  const [quality, setQuality] = useState(82);
  const [maxW, setMaxW] = useState("");
  const [maxH, setMaxH] = useState("");
  const [targetKB, setTargetKB] = useState("");
  const [strip, setStrip] = useState(true);
  const pollRef = useRef(null);
  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);
  const doProbe = useCallback(async () => {
    if (!meta) return;
    try {
      const r = await probeDir(meta, dir);
      const fallback = r.desktop[0] || r.home;
      setDir(fallback);
      showToast("\u5DF2\u586B\u5165\uFF1A" + fallback);
    } catch (e) {
      showToast(String(e.message || e), "bad");
    }
  }, [meta, dir, showToast]);
  const doScan = useCallback(async () => {
    if (!meta) {
      showToast("\u670D\u52A1\u672A\u5728\u7EBF", "bad");
      return;
    }
    if (!dir.trim()) {
      showToast("\u8BF7\u5148\u586B\u5199\u76EE\u5F55", "bad");
      return;
    }
    setPhase("scanning");
    setError("");
    try {
      const r = await scanDir(meta, dir.trim(), recursive);
      if (!r.files.length) {
        setScan(null);
        setError(`\u76EE\u5F55\u91CC\u6CA1\u6709\u627E\u5230\u56FE\u7247\uFF08\u652F\u6301 jpg/png/webp/gif/bmp/tiff/avif/svg${recursive ? "\uFF0C\u542B\u5B50\u76EE\u5F55" : ""}\uFF09`);
        setPhase("idle");
        return;
      }
      setScan(r);
      setSelected(new Set(r.files.map((f) => f.path)));
      setPhase("scanned");
    } catch (e) {
      setScan(null);
      setError(String(e.message || e));
      setPhase("idle");
    }
  }, [meta, dir, recursive, showToast]);
  const start = useCallback(async () => {
    if (!meta || !scan) return;
    const paths = scan.files.filter((f) => selected.has(f.path)).map((f) => f.path);
    if (!paths.length) {
      showToast("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u5F20\u56FE\u7247", "bad");
      return;
    }
    if (paths.length > settings.maxBatch) {
      showToast(`\u5DF2\u9009 ${paths.length} \u5F20\uFF0C\u8D85\u8FC7\u5355\u6279\u4E0A\u9650 ${settings.maxBatch}\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u8C03\u5927\uFF09`, "bad");
      return;
    }
    const pipeline = {
      format: fmt,
      quality,
      stripMetadata: strip
    };
    if (maxW.trim() && Number(maxW) > 0) pipeline.maxWidth = Math.round(Number(maxW));
    if (maxH.trim() && Number(maxH) > 0) pipeline.maxHeight = Math.round(Number(maxH));
    if (targetKB.trim() && Number(targetKB) > 0) pipeline.targetKB = Math.round(Number(targetKB));
    setError("");
    try {
      const started = await startProcess(meta, { paths, pipeline });
      setPhase("running");
      setJob({ id: started.id, state: "running", done: 0, total: started.total, pipelineLabel: started.pipelineLabel, outDir: started.outDir, startedAt: (/* @__PURE__ */ new Date()).toISOString(), summary: null, results: null });
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const snap = await fetchJob(meta, started.id);
          if (!snap) return;
          setJob(snap);
          if (snap.state === "done" || snap.state === "error") {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setPhase("report");
            ctx.reloadHistory();
          }
        } catch (_) {
        }
      }, 700);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [meta, scan, selected, settings.maxBatch, fmt, quality, strip, maxW, maxH, targetKB, ctx, showToast]);
  const toggle = (p) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const selCount = selected.size;
  const selBytes = scan ? scan.files.filter((f) => selected.has(f.path)).reduce((s, f) => s + f.size, 0) : 0;
  const shown = scan ? scan.files.slice(0, RENDER_CAP) : [];
  const summary = scan?.summary;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "if-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "if-bar" }),
      "\u7B2C\u4E00\u6B65 \xB7 \u9009\u76EE\u5F55"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "if-card", children: /* @__PURE__ */ jsxs("div", { className: "if-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "if-row", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "if-inp grow",
            value: dir,
            placeholder: "\u56FE\u7247\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 C:\\Users\\me\\Pictures",
            onChange: (e) => setDir(e.target.value),
            disabled: phase === "running"
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "if-btn", onClick: doScan, disabled: phase === "scanning" || phase === "running", children: phase === "scanning" ? "\u626B\u63CF\u4E2D\u2026" : "\u626B\u63CF" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "if-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs("label", { className: "if-check", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: recursive, onChange: (e) => setRecursive(e.target.checked), disabled: phase === "running" }),
          "\u542B\u5B50\u76EE\u5F55"
        ] }),
        !dir && meta && /* @__PURE__ */ jsx("button", { className: "if-btn ghost sm", onClick: doProbe, children: "\u586B\u5165\u684C\u9762" })
      ] })
    ] }) }),
    error && /* @__PURE__ */ jsx("div", { className: "if-alert bad", children: error }),
    summary && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "if-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "if-bar" }),
        "\u7B2C\u4E8C\u6B65 \xB7 \u786E\u8BA4\u4E0E\u9009\u62E9"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "if-okline", children: [
        summary.count,
        " \u5F20 \xB7 \u5171 ",
        coreFmt(summary.totalSize),
        " \xB7 ",
        Object.entries(summary.byFormat).map(([k, n]) => k + "\xD7" + n).join("\uFF0C"),
        summary.gpsCount > 0 && /* @__PURE__ */ jsxs("span", { className: "if-gps", children: [
          " \xB7 ",
          summary.gpsCount,
          " \u5F20\u542B GPS \u5B9A\u4F4D"
        ] }),
        scan?.truncated && " \xB7 \u5DF2\u622A\u65AD\uFF08\u53EA\u663E\u793A\u524D " + summary.count + " \u5F20\uFF09"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "if-chiprow", children: [
        /* @__PURE__ */ jsx("button", { className: "if-chip", onClick: () => setSelected(new Set(scan.files.map((f) => f.path))), children: "\u5168\u9009" }),
        /* @__PURE__ */ jsx("button", { className: "if-chip", onClick: () => setSelected(/* @__PURE__ */ new Set()), children: "\u5168\u4E0D\u9009" }),
        /* @__PURE__ */ jsx("button", { className: "if-chip", onClick: () => setSelected(new Set(scan.files.filter((f) => f.hasGps === true).map((f) => f.path))), children: "\u53EA\u9009\u542B GPS" }),
        /* @__PURE__ */ jsxs("span", { className: "if-hint", children: [
          "\u5DF2\u9009 ",
          selCount,
          " \u5F20 \xB7 ",
          coreFmt(selBytes)
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "if-list", children: [
        shown.map((f) => /* @__PURE__ */ jsxs("label", { className: "if-file", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: selected.has(f.path), onChange: () => toggle(f.path), disabled: phase === "running" }),
          /* @__PURE__ */ jsx("span", { className: "if-file-name", children: f.name }),
          /* @__PURE__ */ jsxs("span", { className: "if-file-meta", children: [
            f.width ? `${f.width}\xD7${f.height} \xB7 ` : "",
            coreFmt(f.size),
            f.hasGps === true ? " \xB7 GPS" : ""
          ] })
        ] }, f.path)),
        scan && scan.files.length > RENDER_CAP && /* @__PURE__ */ jsxs("div", { className: "if-empty", children: [
          "\u4EC5\u6E32\u67D3\u524D ",
          RENDER_CAP,
          " \u884C\uFF0C\u5176\u4F59 ",
          scan.files.length - RENDER_CAP,
          " \u5F20\u5DF2\u6309\u5168\u9009\u5904\u7406"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "if-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "if-bar" }),
        "\u7B2C\u4E09\u6B65 \xB7 \u53D8\u6362\u7BA1\u9053"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "if-card", children: /* @__PURE__ */ jsxs("div", { className: "if-card-b", children: [
        /* @__PURE__ */ jsx("span", { className: "if-lbl", children: "\u8F93\u51FA\u683C\u5F0F" }),
        /* @__PURE__ */ jsx("div", { className: "if-chiprow", style: { padding: 0 }, children: [["keep", "\u4FDD\u6301\u539F\u683C\u5F0F"], ["webp", "WebP"], ["jpeg", "JPEG"], ["png", "PNG"], ["avif", "AVIF\uFF08\u6162\uFF09"], ["tiff", "TIFF"]].map(([k, label]) => /* @__PURE__ */ jsx("button", { className: "if-chip" + (fmt === k ? " on" : ""), onClick: () => setFmt(k), children: label }, k)) }),
        /* @__PURE__ */ jsxs("span", { className: "if-lbl", children: [
          "\u8D28\u91CF ",
          quality,
          fmt === "png" ? "\uFF08PNG \u8D70\u8C03\u8272\u677F\u91CF\u5316\uFF09" : ""
        ] }),
        /* @__PURE__ */ jsx("input", { type: "range", min: 30, max: 100, value: quality, onChange: (e) => setQuality(Number(e.target.value)), style: { width: "100%" }, disabled: phase === "running" }),
        /* @__PURE__ */ jsxs("div", { className: "if-grid2", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "if-lbl", children: "\u6700\u5927\u5BBD\u5EA6 px\uFF08\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx("input", { className: "if-inp", value: maxW, placeholder: "\u5982 1920", onChange: (e) => setMaxW(e.target.value.replace(/[^0-9]/g, "")), disabled: phase === "running" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "if-lbl", children: "\u6700\u5927\u9AD8\u5EA6 px\uFF08\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx("input", { className: "if-inp", value: maxH, placeholder: "\u5982 1080", onChange: (e) => setMaxH(e.target.value.replace(/[^0-9]/g, "")), disabled: phase === "running" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "if-lbl", children: "\u76EE\u6807\u4F53\u79EF KB\uFF08\u53EF\u7A7A\uFF1B\u81EA\u52A8\u903C\u8FD1\uFF0C\u8FBE\u4E0D\u5230\u4F1A\u964D\u5C3A\u5BF8\u5E76\u6CE8\u660E\uFF09" }),
        /* @__PURE__ */ jsx("input", { className: "if-inp", value: targetKB, placeholder: "\u5982 200", onChange: (e) => setTargetKB(e.target.value.replace(/[^0-9]/g, "")), disabled: phase === "running" }),
        /* @__PURE__ */ jsxs("label", { className: "if-check", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: strip, onChange: (e) => setStrip(e.target.checked), disabled: phase === "running" }),
          "\u5265\u79BB EXIF/GPS \u9690\u79C1\u5143\u6570\u636E\uFF08\u63A8\u8350\uFF1B\u52FE\u9009\u53D6\u6D88\u5219\u4FDD\u7559\u2014\u2014\u5916\u53D1\u524D\u8BF7\u81EA\u884C\u786E\u8BA4\uFF09"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "if-sub", style: { marginTop: 8 }, children: [
          "\u8F93\u51FA\u5230\uFF1A",
          settings.outDir || (scan ? scan.dir + "\\imgforge-out" : "<\u8F93\u5165\u76EE\u5F55>\\imgforge-out"),
          "\uFF08\u8F93\u51FA\u6C38\u4E0D\u8986\u76D6\uFF0C\u91CD\u540D\u81EA\u52A8 -2/-3\uFF1B\u8F93\u5165\u6587\u4EF6\u7EDD\u4E0D\u4FEE\u6539\uFF09"
        ] }),
        /* @__PURE__ */ jsxs("button", { className: "if-btn", style: { marginTop: 10, width: "100%" }, onClick: start, disabled: phase === "running" || !selCount, children: [
          "\u5F00\u59CB\u53D8\u6362 ",
          selCount,
          " \u5F20"
        ] })
      ] }) })
    ] }),
    job && (phase === "running" || phase === "report") && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "if-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "if-bar" }),
        phase === "running" ? "\u53D8\u6362\u4E2D" : "\u7ED3\u679C\u62A5\u544A"
      ] }),
      phase === "running" && /* @__PURE__ */ jsx("div", { className: "if-card", children: /* @__PURE__ */ jsxs("div", { className: "if-card-b", children: [
        /* @__PURE__ */ jsx("div", { className: "if-prog-track", children: /* @__PURE__ */ jsx("div", { className: "if-prog-fill", style: { width: `${job.total ? Math.round(job.done / job.total * 100) : 0}%` } }) }),
        /* @__PURE__ */ jsxs("div", { className: "if-sub", style: { marginTop: 6 }, children: [
          job.done,
          "/",
          job.total,
          " \xB7 ",
          job.pipelineLabel
        ] })
      ] }) }),
      phase === "report" && job.state === "done" && job.summary && /* @__PURE__ */ jsxs("div", { className: "if-okline", children: [
        job.summary.ok,
        "/",
        job.summary.total,
        " \u6210\u529F",
        job.summary.fail ? `\uFF0C${job.summary.fail} \u5931\u8D25` : "",
        " \xB7 ",
        coreFmt(job.summary.inBytes),
        " \u2192 ",
        coreFmt(job.summary.outBytes),
        "\uFF08",
        job.summary.savedBytes >= 0 ? "\u8282\u7701 " + coreFmt(job.summary.savedBytes) : "\u589E\u5927 " + coreFmt(-job.summary.savedBytes),
        job.summary.inBytes > 0 ? `\uFF0C${Math.round(job.summary.savedBytes / job.summary.inBytes * 100)}%` : "",
        "\uFF09\xB7 \u8F93\u51FA ",
        job.outDir
      ] }),
      phase === "report" && job.state === "error" && /* @__PURE__ */ jsxs("div", { className: "if-alert bad", children: [
        "\u4EFB\u52A1\u5931\u8D25\uFF1A",
        job.error
      ] }),
      phase === "report" && job.results && /* @__PURE__ */ jsxs(Fragment, { children: [
        job.results.filter((r) => !r.ok).slice(0, 10).map((r) => /* @__PURE__ */ jsxs("div", { className: "if-alert bad", children: [
          r.name,
          "\uFF1A",
          r.error
        ] }, r.path)),
        /* @__PURE__ */ jsxs("div", { className: "if-chiprow", children: [
          onSendToChat && job.summary && /* @__PURE__ */ jsx(
            "button",
            {
              className: "if-btn ghost sm",
              onClick: () => onSendToChat(`\u56FE\u7247\u5DE5\u574A\u62A5\u544A\uFF1A${job.summary.ok}/${job.summary.total} \u6210\u529F\uFF0C${coreFmt(job.summary.inBytes)} \u2192 ${coreFmt(job.summary.outBytes)}\uFF08\u8282\u7701 ${coreFmt(Math.max(0, job.summary.savedBytes))}\uFF09\uFF0C\u8F93\u51FA\u76EE\u5F55 ${job.outDir}\uFF0C\u7BA1\u9053\u300C${job.pipelineLabel}\u300D`),
              children: "\u53D1\u9001\u62A5\u544A\u5230\u804A\u5929"
            }
          ),
          /* @__PURE__ */ jsx("button", { className: "if-btn ghost sm", onClick: () => {
            setPhase("scanned");
            setJob(null);
          }, children: "\u8FD4\u56DE\u8C03\u6574\u7BA1\u9053" }),
          /* @__PURE__ */ jsx("button", { className: "if-btn ghost sm", onClick: () => {
            setPhase("idle");
            setScan(null);
            setJob(null);
            setDir("");
          }, children: "\u65B0\u4EFB\u52A1" })
        ] })
      ] })
    ] })
  ] });
}
function coreFmt(n) {
  return core.formatBytes(n);
}

// src/HistoryTab.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function HistoryTab({ ctx }) {
  const { history, reloadHistory, showToast, meta } = ctx;
  const [busy, setBusy] = useState2(false);
  const clearAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestClearHistory();
      showToast("\u5DF2\u8BF7\u6C42\u6E05\u7A7A\uFF08\u670D\u52A1\u5728\u7EBF\u65F6\u7ACB\u5373\u751F\u6548\uFF09");
      window.setTimeout(() => {
        reloadHistory();
      }, 1200);
    } catch (e) {
      showToast(String(e.message || e), "bad");
    } finally {
      setBusy(false);
    }
  };
  if (!history.length) {
    return /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { className: "if-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "if-bar" }),
        "\u4EFB\u52A1\u5386\u53F2"
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "if-empty", children: [
        "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002",
        /* @__PURE__ */ jsx2("br", {}),
        "\u9762\u677F\u6279\u91CF\u53D8\u6362\u6216\u8BA9 AI \u8C03 imgforge_process \u540E\uFF0C\u8BB0\u5F55\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "if-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "if-bar" }),
      "\u4EFB\u52A1\u5386\u53F2",
      /* @__PURE__ */ jsxs2("span", { className: "if-hint", children: [
        history.length,
        " \u6761\uFF08\u73AF\u5F62\u4FDD\u7559\uFF09"
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "if-btn ghost sm", style: { marginLeft: 8 }, onClick: clearAll, disabled: busy, children: "\u6E05\u7A7A" })
    ] }),
    history.map((h) => /* @__PURE__ */ jsxs2("div", { className: "if-item", children: [
      /* @__PURE__ */ jsxs2("div", { className: "if-item-head", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          String(h.at).replace("T", " ").slice(0, 16),
          " \xB7 [",
          h.source,
          "] ",
          h.pipeline
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "if-badge " + (h.okState ? "ok" : "bad"), children: h.okState ? `${h.ok}/${h.total} \u6210\u529F` : "\u5931\u8D25" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "if-item-mid", children: [
        core.formatBytes(h.inBytes || 0),
        " \u2192 ",
        core.formatBytes(h.outBytes || 0),
        "\uFF08",
        (h.savedBytes || 0) >= 0 ? "\u8282\u7701 " : "\u589E\u5927 ",
        core.formatBytes(Math.abs(h.savedBytes || 0)),
        "\uFF09 \xB7 \u8F93\u51FA ",
        h.outDir || "?",
        h.ms ? ` \xB7 ${(h.ms / 1e3).toFixed(1)}s` : ""
      ] }),
      !h.okState && h.error && /* @__PURE__ */ jsx2("div", { className: "if-item-mid", style: { color: "#FF8A9A" }, children: h.error }),
      h.okState && h.fail > 0 && /* @__PURE__ */ jsxs2("div", { className: "if-item-mid", style: { color: "#F2B263" }, children: [
        h.fail,
        " \u5F20\u5931\u8D25\uFF1A",
        (h.results || []).filter((r) => !r.ok).slice(0, 3).map((r) => r.name + "\uFF08" + r.error + "\uFF09").join("\uFF1B")
      ] })
    ] }, h.id)),
    !meta && /* @__PURE__ */ jsx2("div", { className: "if-sub", style: { margin: "0 18px" }, children: "\u670D\u52A1\u79BB\u7EBF\uFF1A\u6E05\u7A7A\u547D\u4EE4\u4F1A\u5728\u670D\u52A1\u4E0A\u7EBF\u540E\u751F\u6548\u3002" })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ ctx }) {
  const { settings, reloadSettings, showToast, meta } = ctx;
  const [draft, setDraft] = useState3(settings);
  const [busy, setBusy] = useState3(false);
  useEffect2(() => {
    setDraft(settings);
  }, [settings]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveSettings(draft);
      await reloadSettings();
      showToast("\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 5 \u79D2\u5185\u70ED\u8BFB\u751F\u6548\uFF09");
    } catch (e) {
      showToast(String(e.message || e), "bad");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "if-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "if-bar" }),
      "\u901A\u7528\u8BBE\u7F6E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "if-card", children: /* @__PURE__ */ jsxs3("div", { className: "if-card-b", children: [
      /* @__PURE__ */ jsx3("span", { className: "if-lbl", children: "\u9ED8\u8BA4\u8F93\u51FA\u76EE\u5F55\uFF08\u7A7A = \u8F93\u51FA\u5230 \u8F93\u5165\u76EE\u5F55\\imgforge-out\uFF09" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "if-inp",
          value: draft.outDir,
          placeholder: "\u5982 C:\\Users\\me\\Desktop\\imgforge",
          onChange: (e) => set({ outDir: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "if-grid2", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { className: "if-lbl", children: "\u5E76\u53D1\u6570\uFF081-8\uFF09" }),
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "if-inp",
              type: "number",
              min: 1,
              max: 8,
              value: draft.concurrency,
              onChange: (e) => set({ concurrency: Math.max(1, Math.min(8, Number(e.target.value) || 3)) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { className: "if-lbl", children: "\u5355\u6279\u4E0A\u9650\uFF08\u5F20\uFF09" }),
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "if-inp",
              type: "number",
              min: 1,
              max: 2e3,
              value: draft.maxBatch,
              onChange: (e) => set({ maxBatch: Math.max(1, Math.min(2e3, Number(e.target.value) || 300)) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { className: "if-lbl", children: "\u5355\u6587\u4EF6\u4E0A\u9650\uFF08MB\uFF09" }),
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "if-inp",
              type: "number",
              min: 1,
              max: 1024,
              value: draft.maxFileMB,
              onChange: (e) => set({ maxFileMB: Math.max(1, Math.min(1024, Number(e.target.value) || 100)) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { className: "if-lbl", children: "\u5386\u53F2\u5BB9\u91CF\uFF08\u6761\uFF09" }),
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "if-inp",
              type: "number",
              min: 10,
              max: 1e3,
              value: draft.historyCap,
              onChange: (e) => set({ historyCap: Math.max(10, Math.min(1e3, Number(e.target.value) || 100)) })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "if-btn", style: { marginTop: 10 }, onClick: save, disabled: busy, children: "\u4FDD\u5B58" })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "if-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "if-bar" }),
      "\u670D\u52A1\u72B6\u6001"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "if-card", children: /* @__PURE__ */ jsxs3("div", { className: "if-card-b if-sub", children: [
      meta ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
        "\u5728\u7EBF \xB7 \u7AEF\u53E3 ",
        meta.port,
        " \xB7 \u7248\u672C v",
        meta.version || "?",
        " \xB7 \u6865 ",
        meta.bridge || "ok",
        meta.lastTickAt ? ` \xB7 \u5FC3\u8DF3 ${String(meta.lastTickAt).slice(11, 19)}` : ""
      ] }) : "\u79BB\u7EBF \u2014\u2014 \u5728 \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1 \u4E2D\u542F\u52A8\u540E\uFF0C\u5DE5\u4F5C\u53F0\u53EF\u7528\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u5F15\u64CE\uFF1Asharp\uFF08libvips\uFF09\u672C\u5730\u5904\u7406\uFF0C\u5168\u7A0B\u96F6\u5916\u7F51\u8BF7\u6C42\uFF1B\u670D\u52A1\u53EA\u7ED1\u5B9A 127.0.0.1\u3002"
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "if-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "if-bar" }),
      "\u8FB9\u754C\uFF08\u5982\u5B9E\u8BF4\u660E\uFF09"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "if-card", children: /* @__PURE__ */ jsxs3("div", { className: "if-card-b if-sub", children: [
      "\xB7 \u4E0D\u505A\u52A8\u56FE\u91CD\u7F16\u7801\uFF1AGIF \u53D8\u6362\u6309\u9996\u5E27\u8F93\u51FA\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 \u4E0D\u505A OCR\u3001\u4E0D\u7834\u89E3\u52A0\u5BC6\u56FE\u7247\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 AVIF \u7F16\u7801\u8F83\u6162\uFF08libvips effort=4\uFF09\uFF0C\u5927\u6279\u91CF\u5EFA\u8BAE WebP\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 SVG \u53D8\u6362 = \u6E32\u67D3\u4E3A\u4F4D\u56FE\uFF1BBMP \u65E0\u7F16\u7801\u5668\uFF0C\u8BF7\u663E\u5F0F\u9009 PNG/WebP\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\xB7 GPS \u68C0\u6D4B\u8986\u76D6 JPEG/PNG/WebP/TIFF \u7684 EXIF\uFF1B\u5176\u4F59\u5BB9\u5668\u663E\u793A\u300C\u672A\u77E5\u300D\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.if-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.if-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.if-body{flex:1;overflow-y:auto;padding:0 0 24px}
.if-body::-webkit-scrollbar{width:9px;height:9px}
.if-body::-webkit-scrollbar-track{background:transparent}
.if-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.if-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.if-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E8A33D,#B3621B);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.if-tt{flex:1;min-width:0}
.if-tt b{font-size:15px;display:block}
.if-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.if-tabs{display:flex;gap:4px}
.if-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.if-tab:hover{color:#E6EAF2}
.if-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.if-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.if-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E8A33D,#B3621B);flex-shrink:0}
.if-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.if-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.if-card-b{padding:11px 13px}
.if-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.if-btn{background:#D98324;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.if-btn:hover{filter:brightness(1.12)}
.if-btn:disabled{opacity:.45;cursor:not-allowed}
.if-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.if-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.if-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.if-inp:focus{outline:none;border-color:#D98324}
.if-inp::placeholder{color:#4d5566}
.if-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.if-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.if-chip:hover{border-color:#3a4356}
.if-chip.on{background:#3a2a14;border-color:#D98324;color:#F2C186;font-weight:600}
.if-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.if-check{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#B4B4B8;cursor:pointer}
.if-check input{accent-color:#D98324}
.if-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.if-item-head{display:flex;align-items:center;gap:8px}
.if-item-head b{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.if-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.if-badge.bad{color:#FF8A9A;border-color:#54262c}
.if-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.if-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.if-row{display:flex;gap:8px;align-items:center}
.if-row .grow{flex:1;min-width:0}
.if-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.if-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.if-okline{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.if-gps{color:#F2B263}
.if-list{margin:0 16px 8px;border:1px solid #242C3A;border-radius:12px;background:#12151c;max-height:300px;overflow-y:auto}
.if-list::-webkit-scrollbar{width:8px}
.if-list::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:4px}
.if-file{display:flex;align-items:center;gap:8px;padding:6px 11px;border-bottom:1px solid #1a2029;font-size:11.5px;cursor:pointer}
.if-file:last-child{border-bottom:none}
.if-file:hover{background:#161B22}
.if-file input{accent-color:#D98324;flex-shrink:0}
.if-file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#E6EAF2}
.if-file-meta{flex-shrink:0;color:#5C6678;font-size:10.5px}
.if-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.if-prog-track{height:8px;border-radius:5px;background:#12151c;border:1px solid #2a2f3a;overflow:hidden}
.if-prog-fill{height:100%;background:linear-gradient(90deg,#E8A33D,#D98324);transition:width .3s}
.if-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.if-toast.bad{border-color:#54262c;color:#FF8A9A}
.if-toast.good{border-color:#2b4a35;color:#7EE2A0}
.if-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
`;
function ImgforgePanel(_props) {
  const [tab, setTab] = useState4("work");
  const [toast, setToast] = useState4(null);
  const [meta, setMeta] = useState4(null);
  const [settings, setSettings] = useState4(() => ({ outDir: "", concurrency: 3, maxBatch: 300, maxFileMB: 100, historyCap: 100 }));
  const [history, setHistory] = useState4([]);
  const showToast = useCallback2((msg, kind = "good") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);
  const reloadMeta = useCallback2(async () => {
    try {
      setMeta(await getMeta());
    } catch (_) {
      setMeta(null);
    }
  }, []);
  const reloadSettings = useCallback2(async () => {
    try {
      setSettings(await loadSettings());
    } catch (_) {
    }
  }, []);
  const reloadHistory = useCallback2(async () => {
    try {
      setHistory(await loadHistory());
    } catch (_) {
    }
  }, []);
  useEffect3(() => {
    reloadMeta();
    reloadSettings();
    reloadHistory();
  }, [reloadMeta, reloadSettings, reloadHistory]);
  const ctx = { showToast, meta, reloadMeta, settings, reloadSettings, history, reloadHistory };
  return /* @__PURE__ */ jsxs4("div", { className: "if-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "if-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "if-logo", children: "\u{1F5BC}\uFE0F" }),
      /* @__PURE__ */ jsxs4("div", { className: "if-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u56FE\u7247\u5DE5\u574A \xB7 \u672C\u5730\u6279\u91CF\u56FE\u7247\u53D8\u6362" }),
        /* @__PURE__ */ jsx4("small", { children: meta ? `\u670D\u52A1\u5728\u7EBF :${meta.port} \xB7 \u538B\u7F29/\u8F6C\u683C\u5F0F/\u5265 EXIF\uFF0C\u6587\u4EF6\u5168\u7A0B\u4E0D\u51FA\u672C\u673A` : "\u670D\u52A1\u672A\u5728\u7EBF \u2014\u2014 \u9700\u5728 \u8BBE\u7F6E \u2192 \u63D2\u4EF6\u670D\u52A1 \u542F\u52A8\u540E\u4F7F\u7528\u5DE5\u4F5C\u53F0" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "if-tabs", children: [["work", "\u5DE5\u4F5C\u53F0"], ["history", "\u5386\u53F2"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: "if-tab" + (tab === k ? " on" : ""), onClick: () => {
        setTab(k);
        if (k === "history") reloadHistory();
      }, children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "if-body", children: [
      tab === "work" && /* @__PURE__ */ jsx4(WorkTab, { ctx, onSendToChat: _props.onSendToChat }),
      tab === "history" && /* @__PURE__ */ jsx4(HistoryTab, { ctx }),
      tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { ctx })
    ] }),
    toast && /* @__PURE__ */ jsx4("div", { className: "if-toast" + (toast.kind === "bad" ? " bad" : toast.kind === "good" ? " good" : ""), children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function ImgforgeEntry(props) {
  return /* @__PURE__ */ jsx5(ImgforgePanel, { ...props });
}
export {
  ImgforgeEntry as default
};
