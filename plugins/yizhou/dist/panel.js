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
    var BATCH_CHAR_BUDGET = 12e3;
    var MAX_TOTAL_CHARS = 12e4;
    var CHUNK_SEGS = 100;
    function articleId(url) {
      const s = String(url || "").trim();
      let h1 = 2166136261;
      let h2 = 2166136261;
      for (let k = 0; k < s.length; k++) {
        const c = s.charCodeAt(k);
        h1 ^= c;
        h1 = Math.imul(h1, 16777619) >>> 0;
        h2 ^= c + k & 255;
        h2 = Math.imul(h2, 16777619) >>> 0;
      }
      return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
    }
    function nowIso() {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
    function clampInt(v, lo, hi, dflt) {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return dflt;
      return Math.min(hi, Math.max(lo, n));
    }
    function sanitizeDst(dst) {
      const t = String(dst == null ? "" : dst).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      return t || null;
    }
    function detectSrcLang(text) {
      const s = String(text || "").slice(0, 4e3);
      const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
      const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
      const hangul = (s.match(/[\uac00-\ud7af]/g) || []).length;
      const latin = (s.match(/[A-Za-z]/g) || []).length;
      if (kana > 0 && kana * 4 > cjk) return "ja";
      if (hangul > 0 && hangul * 4 > cjk && hangul > latin / 4) return "ko";
      if (cjk > latin / 2) return "zh";
      if (latin > 0) return "en";
      return "und";
    }
    var LANG_LABEL = { zh: "\u4E2D\u6587", en: "\u82F1\u6587", ja: "\u65E5\u6587", ko: "\u97E9\u6587", und: "\u672A\u8BC6\u522B" };
    function langLabel2(code) {
      return LANG_LABEL[code] || String(code || "\u672A\u8BC6\u522B");
    }
    function normalizeSegments(blocks) {
      const segs = [];
      for (const b of Array.isArray(blocks) ? blocks : []) {
        const t = String(b == null ? "" : b).trim();
        if (!t) continue;
        segs.push({ i: segs.length, src: t, dst: "" });
      }
      return segs;
    }
    function planBatches(segs, budget) {
      const cap = clampInt(budget, 2e3, 6e4, BATCH_CHAR_BUDGET);
      const batches = [];
      let start = 0;
      let chars = 0;
      for (const seg of segs) {
        const len = seg.src.length;
        if (start < seg.i && chars + len > cap) {
          batches.push({ start, end: seg.i, chars });
          start = seg.i;
          chars = 0;
        }
        chars += len;
      }
      if (start < segs.length) batches.push({ start, end: segs.length, chars });
      return batches;
    }
    function batchOf(batches, n) {
      const idx = clampInt(n, 0, (batches ? batches.length : 0) - 1, -1);
      if (idx < 0 || !batches || !batches.length) return null;
      return batches[idx];
    }
    function mergeTranslations(segs, items) {
      const byIdx = new Map(segs.map((s) => [s.i, s]));
      let applied = 0;
      let invalid = 0;
      let skipped = 0;
      for (const it of Array.isArray(items) ? items : []) {
        const seg = byIdx.get(clampInt(it && it.i, 0, Number.MAX_SAFE_INTEGER, -1));
        if (!seg) {
          skipped++;
          continue;
        }
        const dst = sanitizeDst(it && it.dst);
        if (!dst) {
          invalid++;
          continue;
        }
        seg.dst = dst;
        seg.at = nowIso();
        applied++;
      }
      return { segs, applied, invalid, skipped };
    }
    function translatedCount2(segs) {
      return segs.filter((s) => s.dst).length;
    }
    function progressPct2(segs) {
      if (!segs.length) return 0;
      return Math.round(translatedCount2(segs) / segs.length * 100);
    }
    function isCodeSeg2(src) {
      return /^\s*```/.test(String(src || ""));
    }
    function translatableSegs(segs) {
      return segs.filter((s) => !isCodeSeg2(s.src));
    }
    function autoFillCodeSegs(segs) {
      let filled = 0;
      for (const s of segs) {
        if (!s.dst && isCodeSeg2(s.src)) {
          s.dst = s.src;
          filled++;
        }
      }
      return filled;
    }
    function idxEntry(a) {
      return {
        id: String(a.id || ""),
        url: String(a.url || ""),
        site: String(a.site || ""),
        title: String(a.title || "(\u65E0\u6807\u9898)"),
        byline: String(a.byline || ""),
        srcLang: String(a.srcLang || "und"),
        tgtLang: String(a.tgtLang || "zh"),
        segCount: clampInt(a.segCount, 0, 1e9, 0),
        totalChars: clampInt(a.totalChars, 0, 1e12, 0),
        batches: clampInt(a.batches, 0, 1e6, 0),
        translated: clampInt(a.translated, 0, 1e9, 0),
        truncated: !!a.truncated,
        addedAt: String(a.addedAt || nowIso()),
        updatedAt: String(a.updatedAt || nowIso())
      };
    }
    function upsertIndex(idx, entry) {
      const rest = (Array.isArray(idx) ? idx : []).filter((e) => e && e.id !== entry.id);
      return [entry, ...rest];
    }
    function removeFromIndex(idx, id) {
      return (Array.isArray(idx) ? idx : []).filter((e) => e && e.id !== id);
    }
    function findInIndex(idx, id) {
      return (Array.isArray(idx) ? idx : []).find((e) => e && e.id === id) || null;
    }
    function classifyBlock2(src) {
      const s = String(src || "");
      const mH = /^(#{1,6})\s+(.*)$/.exec(s);
      if (mH) return { kind: "h", level: mH[1].length, body: mH[2] };
      if (/^\s*```/.test(s)) return { kind: "code", body: s };
      if (/^>\s?/.test(s)) return { kind: "quote", body: s.replace(/^>\s?/gm, "") };
      if (/^-\s+/.test(s)) return { kind: "li", body: s.replace(/^-\s+/, "") };
      return { kind: "para", body: s };
    }
    function chunkCount3(segCount) {
      return Math.max(1, Math.ceil(segCount / CHUNK_SEGS));
    }
    function chunkKey(id, c) {
      return `yz.art.${id}.p.${c}`;
    }
    function segChunkIndex(i) {
      return Math.floor(i / CHUNK_SEGS);
    }
    function assembleSegs2(chunkArrays) {
      const segs = [];
      for (const arr of Array.isArray(chunkArrays) ? chunkArrays : []) {
        for (const s of Array.isArray(arr) ? arr : []) {
          if (s && typeof s.i === "number") segs.push(s);
        }
      }
      segs.sort((a, b) => a.i - b.i);
      return segs;
    }
    function splitChunks(segs) {
      const map = /* @__PURE__ */ new Map();
      for (const s of segs) {
        const c = segChunkIndex(s.i);
        if (!map.has(c)) map.set(c, []);
        map.get(c).push(s);
      }
      return map;
    }
    function bilingualMarkdown2(entry, segs, mode) {
      const lines = [`# ${entry.title}`, "", `> ${entry.url}`, ""];
      for (const s of segs) {
        const cls = classifyBlock2(s.src);
        const srcPart = s.src;
        const dstPart = s.dst;
        if (mode === "dst") {
          lines.push(dstPart || srcPart, "");
          continue;
        }
        if (mode === "src") {
          lines.push(srcPart, "");
          continue;
        }
        lines.push(srcPart);
        if (dstPart) lines.push(dstPart);
        else if (!isCodeSeg2(s.src)) lines.push("> \u3014\u672A\u7FFB\u8BD1\u3015");
        lines.push("");
      }
      return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    }
    module.exports = {
      BATCH_CHAR_BUDGET,
      MAX_TOTAL_CHARS,
      CHUNK_SEGS,
      articleId,
      nowIso,
      clampInt,
      sanitizeDst,
      detectSrcLang,
      langLabel: langLabel2,
      normalizeSegments,
      planBatches,
      batchOf,
      mergeTranslations,
      translatedCount: translatedCount2,
      progressPct: progressPct2,
      isCodeSeg: isCodeSeg2,
      translatableSegs,
      autoFillCodeSegs,
      idxEntry,
      upsertIndex,
      removeFromIndex,
      findInIndex,
      classifyBlock: classifyBlock2,
      chunkCount: chunkCount3,
      chunkKey,
      segChunkIndex,
      assembleSegs: assembleSegs2,
      splitChunks,
      bilingualMarkdown: bilingualMarkdown2
    };
  }
});

// src/Panel.tsx
var core2 = __toESM(require_core());
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", {
    req: { target, payload }
  });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r && r.value !== void 0 ? r.value : null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
}

// src/model.ts
var PREFIX = "yz.";
var K = {
  idx: `${PREFIX}idx`,
  artPrefix: `${PREFIX}art.`,
  pos: (id) => `${PREFIX}pos.${id}`,
  settings: `${PREFIX}settings`
};
var DEFAULT_SETTINGS = { mode: "bilingual", fontScale: 1 };
function normalizeSettings(v) {
  const o = v && typeof v === "object" ? v : {};
  const mode = o.mode === "src" || o.mode === "dst" || o.mode === "bilingual" ? o.mode : DEFAULT_SETTINGS.mode;
  const fs = typeof o.fontScale === "number" && Number.isFinite(o.fontScale) ? Math.min(1.6, Math.max(0.8, o.fontScale)) : DEFAULT_SETTINGS.fontScale;
  return { mode, fontScale: fs };
}
async function loadLibrary() {
  const v = await kvGet(K.idx).catch(() => null);
  return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string") : [];
}
async function loadArticle(id, segCount) {
  const n = core.chunkCount(Math.max(0, segCount || 0));
  const gets = [];
  for (let c = 0; c < n; c++) gets.push(kvGet(K.artPrefix + `${id}.p.${c}`).catch(() => null));
  const parts = await Promise.all(gets);
  return core.assembleSegs(parts);
}
function loadPos(id) {
  return kvGet(K.pos(id)).catch(() => null);
}
function savePos(id, pos) {
  return kvSet(K.pos(id), pos);
}
function loadSettings() {
  return kvGet(K.settings).then((v) => normalizeSettings(v)).catch(() => DEFAULT_SETTINGS);
}
function saveSettings(s) {
  return kvSet(K.settings, s);
}
function metaLine(e) {
  const lang = `${core.langLabel(e.srcLang)}\u2192${core.langLabel(e.tgtLang)}`;
  return `${e.site || "\u672A\u77E5\u6765\u6E90"} \xB7 ${lang} \xB7 ${e.segCount} \u6BB5`;
}
function fmtDate(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var css = `
.yz-root{position:relative;font:13px/1.6 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.yz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.yz-body{flex:1;overflow-y:auto;padding:0 0 28px}
.yz-body::-webkit-scrollbar{width:9px;height:9px}
.yz-body::-webkit-scrollbar-track{background:transparent}
.yz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.yz-page{max-width:720px;margin:0 auto;padding:0 16px}

/* \u5934\u90E8 */
.yz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.yz-top-in{max-width:720px;margin:0 auto;display:flex;align-items:center;gap:10px}
.yz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4EA8DE,#3FB6A8);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.yz-tt{flex:1;min-width:0}
.yz-tt b{font-size:15px}
.yz-tt span{display:block;font-size:11px;color:#8A93A6;margin-top:1px}
.yz-count{font-size:11px;color:#8A93A6;border:1px solid #2a3040;border-radius:999px;padding:2px 9px;flex-shrink:0}

/* \u4E66\u67B6 */
.yz-search{width:100%;background:#161B26;border:1px solid #232936;border-radius:10px;color:#E6EAF2;padding:8px 12px;font-size:13px;outline:none;margin-bottom:12px}
.yz-search:focus{border-color:#33507a}
.yz-card{background:#161B26;border:1px solid #232936;border-radius:12px;padding:12px 14px;margin-bottom:10px;cursor:pointer;transition:border-color .15s}
.yz-card:hover{border-color:#33507a}
.yz-card-t{font-size:14px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.yz-card-m{font-size:11.5px;color:#8A93A6;margin-top:5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.yz-card-date{margin-left:auto}
.yz-bar{height:4px;background:#232936;border-radius:2px;margin-top:9px;overflow:hidden}
.yz-bar-in{height:100%;border-radius:2px;background:linear-gradient(90deg,#4EA8DE,#3FB6A8);transition:width .3s}
.yz-bar-full{background:#3FB6A8}
.yz-del{background:none;border:none;color:#5d6877;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px;flex-shrink:0}
.yz-del:hover{color:#F87171;background:#241a1e}
.yz-del.confirm{color:#F87171;font-weight:600}

/* \u7A7A\u6001 */
.yz-empty{text-align:center;padding:52px 20px 20px;color:#8A93A6}
.yz-empty-g{font-size:44px;margin-bottom:10px;filter:saturate(.85)}
.yz-empty h3{color:#E6EAF2;font-size:15px;margin:0 0 14px}
.yz-steps{text-align:left;max-width:430px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.yz-step{background:#161B26;border:1px solid #232936;border-radius:10px;padding:10px 13px;font-size:12.5px;line-height:1.55}
.yz-step b{color:#4EA8DE;margin-right:6px}
.yz-cmd{font-family:ui-monospace,Consolas,monospace;background:#10151f;border:1px solid #232936;border-radius:8px;padding:8px 11px;margin:10px auto 0;max-width:460px;font-size:12px;color:#9fd0ef;cursor:pointer;text-align:left}
.yz-cmd:hover{border-color:#33507a}
.yz-hint{font-size:11px;color:#5d6877;margin-top:12px}

/* \u9605\u8BFB\u5668\u9876\u680F */
.yz-rbar{position:sticky;top:0;z-index:21;background:#10141C;border-bottom:1px solid #1d2330;padding:8px 12px;display:flex;align-items:center;gap:8px}
.yz-back{background:none;border:none;color:#8A93A6;cursor:pointer;font-size:13px;padding:5px 8px;border-radius:8px;flex-shrink:0}
.yz-back:hover{color:#E6EAF2;background:#161B26}
.yz-rtitle{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yz-seg{display:flex;background:#161B26;border:1px solid #232936;border-radius:9px;padding:2px;flex-shrink:0}
.yz-seg button{background:none;border:none;color:#8A93A6;font-size:11.5px;padding:4px 10px;border-radius:7px;cursor:pointer}
.yz-seg button.on{background:#24304a;color:#CFE4FF}
.yz-fbtn{background:#161B26;border:1px solid #232936;color:#8A93A6;border-radius:8px;font-size:12px;padding:4px 9px;cursor:pointer;flex-shrink:0}
.yz-fbtn:hover{color:#E6EAF2;border-color:#33507a}

/* \u9605\u8BFB\u533A */
.yz-rbody{padding:18px 0 40px}
.yz-banner{max-width:720px;margin:0 auto 16px;padding:0 16px}
.yz-banner-in{background:#1d2330;border:1px solid #2c3a55;border-radius:10px;padding:9px 13px;font-size:12.5px;color:#cfe0f5;display:flex;align-items:center;gap:9px;min-width:0}
.yz-banner-cmd{font-family:ui-monospace,Consolas,monospace;color:#9fd0ef;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yz-blk{margin:0 0 18px}
.yz-src{color:#828da1;font-size:.86em;white-space:pre-wrap;word-break:break-word}
.yz-dst{color:#E8ECF4;white-space:pre-wrap;word-break:break-word;margin-top:5px}
.yz-blk.h .yz-dst,.yz-blk.h .yz-src{font-weight:700;line-height:1.4}
.yz-blk.li .yz-dst,.yz-blk.li .yz-src{display:block;padding-left:14px;position:relative}
.yz-blk.li .yz-src::before,.yz-blk.li .yz-dst::before{content:'\xB7';color:#4EA8DE;font-weight:700;position:absolute;left:2px}
.yz-blk.quote{border-left:3px solid #2c3a55;padding-left:11px}
.yz-blk.code .yz-src,.yz-blk.code .yz-dst{font-family:ui-monospace,Consolas,monospace;font-size:.82em;background:#10151f;border:1px solid #1d2330;border-radius:9px;padding:10px 12px;overflow-x:auto;white-space:pre;margin-top:0}
.yz-missing{color:#56617a;font-size:.9em;border:1px dashed #2a3346;border-radius:8px;padding:4px 10px;display:inline-block;margin-top:5px}

/* \u5E95\u90E8\u4FE1\u606F\u6761 */
.yz-foot{max-width:720px;margin:8px auto 0;padding:0 16px;font-size:11px;color:#56617a;text-align:center}
.yz-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#24304a;color:#CFE4FF;border:1px solid #33507a;border-radius:10px;padding:8px 16px;font-size:12.5px;z-index:99;box-shadow:0 6px 24px rgba(0,0,0,.45)}
.yz-err{max-width:720px;margin:30px auto;padding:0 16px}
.yz-err-in{background:#241a1e;border:1px solid #5a2a33;color:#f3b8bf;border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.6}
`;
var MODE_LABEL = { bilingual: "\u53CC\u8BED", dst: "\u8BD1\u6587", src: "\u539F\u6587" };
var POLL_MS = 5e3;
var POS_SAVE_DEBOUNCE_MS = 800;
var HEADING_PX = [17, 16, 15, 14, 13.5, 13];
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}
function Block(props) {
  const { seg, mode, scale, complete, registerEl } = props;
  const srcInfo = core2.classifyBlock(seg.src);
  const dstInfo = seg.dst ? core2.classifyBlock(seg.dst) : null;
  const isCode = srcInfo.kind === "code";
  const showSrc = mode === "bilingual" || mode === "src";
  const showDst = mode === "bilingual" || mode === "dst";
  const headStyle = srcInfo.kind === "h" ? { fontSize: fontPx(scale, HEADING_PX[Math.min(5, (srcInfo.level || 1) - 1)]) } : void 0;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `yz-blk ${srcInfo.kind}`,
      "data-i": seg.i,
      ref: (el) => registerEl(seg.i, el),
      style: { fontSize: fontPx(scale, 14) },
      children: [
        showSrc && /* @__PURE__ */ jsx("div", { className: "yz-src", style: headStyle, children: isCode ? seg.src : srcInfo.body }),
        showDst && (seg.dst && dstInfo ? /* @__PURE__ */ jsx("div", { className: "yz-dst", style: headStyle, children: isCode ? seg.dst : dstInfo.body }) : !complete && !core2.isCodeSeg(seg.src) && showDst ? /* @__PURE__ */ jsx("span", { className: "yz-missing", children: "\u672A\u7FFB\u8BD1" }) : null)
      ]
    }
  );
}
function fontPx(scale, base) {
  return Math.round(base * scale);
}
function Library(props) {
  const { entries, onOpen, onDelete, err } = props;
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const kw = q.trim().toLowerCase();
  const list = useMemo(() => kw ? entries.filter((e) => `${e.title} ${e.site} ${e.url}`.toLowerCase().includes(kw)) : entries, [entries, kw]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "yz-top", children: /* @__PURE__ */ jsxs("div", { className: "yz-top-in", children: [
      /* @__PURE__ */ jsx("div", { className: "yz-logo", children: "\u8BD1" }),
      /* @__PURE__ */ jsxs("div", { className: "yz-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "\u8BD1\u821F" }),
        /* @__PURE__ */ jsx("span", { children: "\u53CC\u8BED\u6C89\u6D78\u9605\u8BFB \xB7 \u5BF9\u8BDD\u5373\u5165\u53E3" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "yz-count", children: [
        entries.length,
        " \u7BC7"
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "yz-body", children: /* @__PURE__ */ jsxs("div", { className: "yz-page", children: [
      err ? /* @__PURE__ */ jsx("div", { className: "yz-err", style: { margin: "14px auto" }, children: /* @__PURE__ */ jsx("div", { className: "yz-err-in", children: err }) }) : null,
      entries.length > 0 && /* @__PURE__ */ jsx(
        "input",
        {
          className: "yz-search",
          placeholder: "\u641C\u7D22\u6807\u9898 / \u7AD9\u70B9\u2026",
          value: q,
          onChange: (e) => setQ(e.target.value)
        }
      ),
      list.map((e) => {
        const pct = e.segCount ? Math.round((e.translated || 0) / e.segCount * 100) : 0;
        return /* @__PURE__ */ jsxs("div", { className: "yz-card", onClick: () => onOpen(e.id), children: [
          /* @__PURE__ */ jsx("div", { className: "yz-card-t", children: e.title }),
          /* @__PURE__ */ jsxs("div", { className: "yz-card-m", children: [
            /* @__PURE__ */ jsx("span", { children: metaLine(e) }),
            e.truncated ? /* @__PURE__ */ jsx("span", { style: { color: "#d9a441" }, children: "\u622A\u65AD" }) : null,
            /* @__PURE__ */ jsx("span", { className: "yz-card-date", children: fmtDate(e.addedAt) }),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: `yz-del${confirmId === e.id ? " confirm" : ""}`,
                onClick: (ev) => {
                  ev.stopPropagation();
                  if (confirmId === e.id) {
                    onDelete(e.id);
                    setConfirmId("");
                  } else setConfirmId(e.id);
                },
                children: confirmId === e.id ? "\u786E\u8BA4\u5220\u9664" : "\u5220"
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "yz-bar", children: /* @__PURE__ */ jsx("div", { className: `yz-bar-in${pct >= 100 ? " yz-bar-full" : ""}`, style: { width: `${Math.max(2, pct)}%` } }) })
        ] }, e.id);
      }),
      entries.length === 0 && !err && /* @__PURE__ */ jsxs("div", { className: "yz-empty", children: [
        /* @__PURE__ */ jsx("div", { className: "yz-empty-g", children: "\u26F5" }),
        /* @__PURE__ */ jsx("h3", { children: "\u628A\u5916\u6587\u7F51\u9875\u6446\u6E21\u6210\u53CC\u8BED\u8BFB\u7269" }),
        /* @__PURE__ */ jsxs("div", { className: "yz-steps", children: [
          /* @__PURE__ */ jsxs("div", { className: "yz-step", children: [
            /* @__PURE__ */ jsx("b", { children: "1" }),
            "\u5BF9 AI \u8BF4\u4E00\u53E5\u8BDD\uFF08\u70B9\u51FB\u590D\u5236\uFF09\uFF1A"
          ] }),
          /* @__PURE__ */ jsx(
            "div",
            {
              className: "yz-cmd",
              onClick: () => {
                copyText("\u5E2E\u6211\u628A\u8FD9\u7BC7\u7FFB\u8BD1\u6210\u4E2D\u82F1\u5BF9\u7167\uFF1A");
              },
              children: "\u5E2E\u6211\u628A\u8FD9\u7BC7\u7FFB\u8BD1\u6210\u4E2D\u82F1\u5BF9\u7167\uFF1A<\u7C98\u8D34\u94FE\u63A5>"
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "yz-step", children: [
            /* @__PURE__ */ jsx("b", { children: "2" }),
            "AI \u6293\u53D6\u3001\u5206\u6BB5\u3001\u9010\u6279\u7FFB\u8BD1\uFF08\u53EF\u65AD\u70B9\u7EED\u8BD1\uFF09\u3002"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "yz-step", children: [
            /* @__PURE__ */ jsx("b", { children: "3" }),
            "\u56DE\u5230\u8FD9\u91CC\u9605\u8BFB\u2014\u2014\u53CC\u8BED\u5BF9\u7167\u3001\u4E09\u7AEF\u540C\u6B65\u3001\u8BD1\u6587\u53EF\u88AB AI \u5F15\u7528\u3002"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "yz-hint", children: "\u4EC5\u652F\u6301\u516C\u7F51 http(s) \u7F51\u9875\uFF1BJS \u52A8\u6001\u9875\u53EF\u80FD\u6293\u4E0D\u5230\u6B63\u6587\uFF08\u4F1A\u5982\u5B9E\u62A5\u9519\uFF09" })
      ] })
    ] }) })
  ] });
}
function Reader(props) {
  const { entry, onBack } = props;
  const [segs, setSegs] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const bodyRef = useRef(null);
  const elMap = useRef(/* @__PURE__ */ new Map());
  const posRef = useRef(null);
  const restoredRef = useRef(false);
  const saveTimer = useRef(null);
  const fpRef = useRef("");
  const complete = segs.length > 0 && segs.every((s) => s.dst || core2.isCodeSeg(s.src));
  const registerEl = useCallback((i, el) => {
    if (el) elMap.current.set(i, el);
    else elMap.current.delete(i);
  }, []);
  const showToast = useCallback((label) => {
    setToast(label);
    window.setTimeout(() => setToast(""), 1800);
  }, []);
  useEffect(() => {
    let alive = true;
    restoredRef.current = false;
    (async () => {
      const [s, pos] = await Promise.all([loadSettings(), loadPos(entry.id)]);
      if (!alive) return;
      setSettings(s);
      posRef.current = pos;
      const arr = await loadArticle(entry.id, entry.segCount);
      if (!alive) return;
      setSegs(arr);
      setLoading(false);
      fpRef.current = fpOf(arr);
    })();
    return () => {
      alive = false;
    };
  }, [entry.id, entry.segCount]);
  useEffect(() => {
    const t = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || loading) return;
      const arr = await loadArticle(entry.id, entry.segCount);
      const fp = fpOf(arr);
      if (fp !== fpRef.current) {
        fpRef.current = fp;
        setSegs(arr);
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [entry.id, entry.segCount, loading]);
  useEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;
    const pos = posRef.current;
    const body = bodyRef.current;
    if (!pos || !body || !pos.segIdx) return;
    requestAnimationFrame(() => {
      const el = elMap.current.get(pos.segIdx);
      if (el) body.scrollTo({ top: Math.max(0, el.offsetTop - 70) });
    });
  }, [loading, segs.length]);
  const onScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body || loading) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const sc = body.scrollTop;
      const max = body.scrollHeight - body.clientHeight;
      const pct = max > 0 ? Math.round(sc / max * 100) : 100;
      let segIdx = 0;
      for (const [i, el] of elMap.current) {
        if (el.offsetTop <= sc + 90 && i > segIdx) segIdx = i;
      }
      const next = { segIdx, pct, at: (/* @__PURE__ */ new Date()).toISOString() };
      posRef.current = next;
      savePos(entry.id, next).catch(() => {
      });
    }, POS_SAVE_DEBOUNCE_MS);
  }, [entry.id, loading]);
  const applySettings = useCallback((next) => {
    setSettings(next);
    saveSettings(next).catch(() => {
    });
  }, []);
  const remain = segs.filter((s) => !s.dst && !core2.isCodeSeg(s.src)).length;
  const exportMd = useMemo(() => segs.length ? core2.bilingualMarkdown(entry, segs, settings.mode === "src" ? "src" : "bilingual") : "", [entry, segs, settings.mode]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "yz-rbar", children: [
      /* @__PURE__ */ jsx("button", { className: "yz-back", onClick: onBack, children: "\u2039 \u4E66\u67B6" }),
      /* @__PURE__ */ jsx("div", { className: "yz-rtitle", title: entry.title, children: entry.title }),
      /* @__PURE__ */ jsx("div", { className: "yz-seg", children: ["bilingual", "dst", "src"].map((m) => /* @__PURE__ */ jsx("button", { className: settings.mode === m ? "on" : "", onClick: () => applySettings({ ...settings, mode: m }), children: MODE_LABEL[m] }, m)) }),
      /* @__PURE__ */ jsx("button", { className: "yz-fbtn", title: "\u51CF\u5C0F\u5B57\u53F7", onClick: () => applySettings({ ...settings, fontScale: Math.max(0.8, Math.round((settings.fontScale - 0.1) * 10) / 10) }), children: "A-" }),
      /* @__PURE__ */ jsx("button", { className: "yz-fbtn", title: "\u589E\u5927\u5B57\u53F7", onClick: () => applySettings({ ...settings, fontScale: Math.min(1.6, Math.round((settings.fontScale + 0.1) * 10) / 10) }), children: "A+" }),
      /* @__PURE__ */ jsx("button", { className: "yz-fbtn", title: "\u590D\u5236\u5F53\u524D\u5F62\u6001\u7684 Markdown", onClick: () => {
        copyText(exportMd).then((ok2) => showToast(ok2 ? "\u5DF2\u590D\u5236 Markdown" : "\u526A\u8D34\u677F\u4E0D\u53EF\u7528"));
      }, children: "\u590D\u5236" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "yz-body", ref: bodyRef, onScroll, children: [
      remain > 0 && /* @__PURE__ */ jsx("div", { className: "yz-banner", children: /* @__PURE__ */ jsxs("div", { className: "yz-banner-in", children: [
        /* @__PURE__ */ jsxs("span", { style: { flexShrink: 0 }, children: [
          "\u8FD8\u5269 ",
          remain,
          " \u6BB5\u672A\u8BD1\uFF0C\u5BF9 AI \u8BF4"
        ] }),
        /* @__PURE__ */ jsxs(
          "span",
          {
            className: "yz-banner-cmd",
            onClick: () => {
              copyText(`\u7EE7\u7EED\u7FFB\u8BD1\u300A${entry.title}\u300B`).then((ok2) => showToast(ok2 ? "\u5DF2\u590D\u5236\u6307\u4EE4" : "\u526A\u8D34\u677F\u4E0D\u53EF\u7528"));
            },
            title: "\u70B9\u51FB\u590D\u5236",
            children: [
              "\u300C\u7EE7\u7EED\u7FFB\u8BD1\u300A",
              entry.title,
              "\u300B\u300D"
            ]
          }
        )
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "yz-page", children: [
        /* @__PURE__ */ jsxs("div", { className: "yz-rbody", children: [
          segs.map((s) => /* @__PURE__ */ jsx(Block, { seg: s, mode: settings.mode, scale: settings.fontScale, complete, registerEl }, s.i)),
          !loading && !segs.length && /* @__PURE__ */ jsxs("div", { className: "yz-empty", children: [
            /* @__PURE__ */ jsx("div", { className: "yz-empty-g", children: "\u{1F6F6}" }),
            /* @__PURE__ */ jsx("h3", { children: "\u6BB5\u843D\u4E3A\u7A7A" }),
            /* @__PURE__ */ jsx("div", { className: "yz-hint", children: "\u6570\u636E\u53EF\u80FD\u88AB\u6E05\u7406\uFF0C\u53EF\u8BA9 AI \u91CD\u65B0\u6293\u53D6\u8BE5 URL" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "yz-foot", children: [
          entry.site,
          " \xB7 ",
          fmtDate(entry.addedAt),
          " \xB7 ",
          segs.length,
          " \u6BB5 \xB7 \u8BD1 ",
          segs.length ? core2.progressPct(segs) : 0,
          "%",
          entry.truncated ? " \xB7 \u539F\u6587\u8D85\u957F\u5DF2\u622A\u65AD" : ""
        ] })
      ] })
    ] }),
    toast ? /* @__PURE__ */ jsx("div", { className: "yz-toast", children: toast }) : null
  ] });
}
function fpOf(arr) {
  return `${core2.translatedCount(arr)}/${arr.length}`;
}
var lastEntries = /* @__PURE__ */ new Map();
function YizhouPanel() {
  const [entries, setEntries] = useState([]);
  const [openId, setOpenId] = useState("");
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      getHostInvoke();
      setReady(true);
    } catch (e) {
      setErr(e.message);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const list = await loadLibrary();
      lastEntries.clear();
      for (const e of list) lastEntries.set(e.id, e);
      setEntries(list);
      setErr("");
    } catch (e) {
      setErr(`\u52A0\u8F7D\u4E66\u67B6\u5931\u8D25\uFF1A${e.message}`);
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    refresh();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && !openId) refresh();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [ready, refresh, openId]);
  const entry = useMemo(() => entries.find((e) => e.id === openId) || null, [entries, openId]);
  const onDelete = useCallback(async (id) => {
    const cur = lastEntries.get(id);
    const segCount = cur ? cur.segCount : 0;
    const n = core2.chunkCount(Math.max(0, segCount)) + 1;
    const keys = [`yz.pos.${id}`];
    for (let c = 0; c < n; c++) keys.push(`yz.art.${id}.p.${c}`);
    await Promise.all(keys.map((k) => capDispatch("cap.kv", { action: "delete", key: k }).catch(() => {
    })));
    const idx = await loadLibrary();
    const rest = idx.filter((e) => e.id !== id);
    if (rest.length) await capDispatch("cap.kv", { action: "set", key: "yz.idx", value: rest }).catch(() => {
    });
    else await capDispatch("cap.kv", { action: "delete", key: "yz.idx" }).catch(() => {
    });
    await refresh();
  }, [refresh]);
  return /* @__PURE__ */ jsxs("div", { className: "yz-root", children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    err && !entries.length && !openId ? /* @__PURE__ */ jsx("div", { className: "yz-err", children: /* @__PURE__ */ jsx("div", { className: "yz-err-in", children: err }) }) : entry ? /* @__PURE__ */ jsx(Reader, { entry, onBack: () => setOpenId("") }) : /* @__PURE__ */ jsx(Library, { entries, onOpen: setOpenId, onDelete, err })
  ] });
}

// src/index.tsx
var src_default = YizhouPanel;
export {
  src_default as default
};
