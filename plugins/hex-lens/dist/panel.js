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

// shared/hex-core.js
var require_hex_core = __commonJS({
  "shared/hex-core.js"(exports, module) {
    "use strict";
    var MAGIC_TABLE = [
      { name: "PNG \u56FE\u50CF", ext: ["png"], magic: "89504e470d0a1a0a", offset: 0 },
      { name: "JPEG \u56FE\u50CF", ext: ["jpg", "jpeg"], magic: "ffd8ff", offset: 0 },
      { name: "GIF \u56FE\u50CF", ext: ["gif"], magic: "47494638", offset: 0 },
      // GIF8
      { name: "WebP \u56FE\u50CF", ext: ["webp"], magic: "52494646?? ?? ?? ??57454250", offset: 0 },
      // RIFF....WEBP
      { name: "BMP \u56FE\u50CF", ext: ["bmp"], magic: "424d", offset: 0 },
      { name: "PDF \u6587\u6863", ext: ["pdf"], magic: "25504446", offset: 0 },
      // %PDF
      { name: "ZIP \u538B\u7F29\u5305\uFF08\u542B docx/xlsx/apk/jar \u5BB9\u5668\uFF09", ext: ["zip", "docx", "xlsx", "pptx", "apk", "jar", "epub"], magic: "504b0304", offset: 0 },
      { name: "ZIP \u7A7A\u5F52\u6863", ext: ["zip"], magic: "504b0506", offset: 0 },
      { name: "GZIP \u538B\u7F29", ext: ["gz", "tgz"], magic: "1f8b", offset: 0 },
      { name: "ZSTD \u538B\u7F29", ext: ["zst"], magic: "28b52ffd", offset: 0 },
      { name: "XZ \u538B\u7F29", ext: ["xz"], magic: "fd377a585a00", offset: 0 },
      { name: "7-Zip \u538B\u7F29\u5305", ext: ["7z"], magic: "377abcaf271c", offset: 0 },
      { name: "RAR \u538B\u7F29\u5305", ext: ["rar"], magic: "526172211a07", offset: 0 },
      { name: "TAR \u5F52\u6863", ext: ["tar"], magic: "7573746172", offset: 257 },
      // ustar@257
      { name: "ELF \u53EF\u6267\u884C\uFF08Linux\uFF09", ext: ["so", "elf", "o"], magic: "7f454c46", offset: 0 },
      { name: "PE \u53EF\u6267\u884C\uFF08Windows EXE/DLL\uFF09", ext: ["exe", "dll"], magic: "4d5a", offset: 0 },
      // MZ
      { name: "Mach-O \u53EF\u6267\u884C\uFF08macOS\uFF09", ext: ["dylib"], magic: "cffaedfe", offset: 0 },
      { name: "Mach-O \u53EF\u6267\u884C\uFF08macOS\uFF0C\u5927\u7AEF\uFF09", ext: ["dylib"], magic: "feedface", offset: 0 },
      { name: "Java class", ext: ["class"], magic: "cafebabe", offset: 0 },
      { name: "MP4/MOV \u5BB9\u5668", ext: ["mp4", "mov", "m4a"], magic: "????????66747970", offset: 0 },
      // ....ftyp
      { name: "MP3 \u97F3\u9891\uFF08ID3\uFF09", ext: ["mp3"], magic: "494433", offset: 0 },
      { name: "FLAC \u97F3\u9891", ext: ["flac"], magic: "664c6143", offset: 0 },
      // fLaC
      { name: "OGG \u5BB9\u5668", ext: ["ogg"], magic: "4f676753", offset: 0 },
      // OggS
      { name: "WAV \u97F3\u9891", ext: ["wav"], magic: "52494646?? ?? ?? ??57415645", offset: 0 },
      // RIFF....WAVE
      { name: "SQLite \u6570\u636E\u5E93", ext: ["db", "sqlite", "sqlite3"], magic: "53514c69746520666f726d6174203300", offset: 0 },
      { name: "Windows \u6CE8\u518C\u8868\u5DE2", ext: ["hive"], magic: "72656766", offset: 0 },
      // regf
      { name: "LLVM \u4F4D\u7801", ext: ["bc"], magic: "4243c0de", offset: 0 },
      { name: "UTF-8 with BOM \u6587\u672C", ext: ["txt", "md", "json"], magic: "efbbbf", offset: 0 },
      { name: "UTF-16 LE with BOM \u6587\u672C", ext: ["txt"], magic: "ffe\xADff", offset: 0 }
    ];
    MAGIC_TABLE[27].magic = "4243c0de";
    MAGIC_TABLE[28].magic = "fffe";
    function hexOf(buf) {
      return Buffer ? Buffer.from(buf).toString("hex") : [...buf].map((b) => Number(b).toString(16).padStart(2, "0")).join("");
    }
    function identifyMagic2(buf) {
      const headHex = hexOf(buf);
      const headStr = headHex.toLowerCase();
      const hits = [];
      for (const entry of MAGIC_TABLE) {
        const magic = entry.magic.toLowerCase().replace(/\?\?/g, "??");
        const target = entry.offset;
        const clean = magic.replace(/\s+/g, "");
        if (clean.length % 2 !== 0) continue;
        const byteLen = clean.length / 2;
        if (buf.length < target + byteLen) continue;
        let matched = true;
        for (let i = 0; i < byteLen; i++) {
          const pat = clean.slice(i * 2, i * 2 + 2);
          if (pat === "??") continue;
          const want = parseInt(pat, 16);
          const have = buf[target + i];
          if (have !== want) {
            matched = false;
            break;
          }
        }
        if (matched) hits.push({ name: entry.name, ext: entry.ext, magic: entry.magic, offset: entry.offset, matchedAt: target });
      }
      return hits;
    }
    function expectFromExt(ext) {
      const e = String(ext || "").replace(/^\./, "").toLowerCase();
      return MAGIC_TABLE.filter((m) => m.ext.includes(e)).map((m) => m.name);
    }
    function extConsistency2(hits, filename) {
      const m = String(filename || "").match(/\.([A-Za-z0-9]+)$/);
      const ext = m ? m[1] : "";
      if (!hits.length || !ext) return { consistent: true, expected: [], warning: null };
      const expected = expectFromExt(ext);
      const hitNames = hits.map((h) => h.name);
      const ok = expected.some((name) => hitNames.includes(name)) || hits.some((h) => h.ext.includes(ext.toLowerCase()));
      if (ok) return { consistent: true, expected, warning: null };
      return {
        consistent: false,
        expected,
        warning: `\u6269\u5C55\u540D .${ext} \u4E0E\u5B9E\u9645\u9B54\u6570\u7C7B\u578B\u300C${hitNames[0]}\u300D\u4E0D\u7B26\u2014\u2014\u6587\u4EF6\u53EF\u80FD\u662F\u4F2A\u88C5\u6269\u5C55\u540D\u6216\u88AB\u9519\u8BEF\u91CD\u547D\u540D`
      };
    }
    function shannonEntropy2(buf) {
      if (!buf || !buf.length) return 0;
      const freq = new Array(256).fill(0);
      for (const b of buf) freq[b]++;
      let h = 0;
      for (const f of freq) {
        if (!f) continue;
        const p = f / buf.length;
        h -= p * Math.log2(p);
      }
      return Math.round(h * 100) / 100;
    }
    function hexDump2(buf, baseOffset = 0) {
      const lines = [];
      for (let off = 0; off < buf.length; off += 16) {
        const chunk = buf.slice(off, Math.min(off + 16, buf.length));
        const hexParts = [];
        let ascii = "";
        for (let i = 0; i < 16; i++) {
          if (i < chunk.length) {
            hexParts.push(Number(chunk[i]).toString(16).padStart(2, "0"));
            const b = chunk[i];
            ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : "\xB7";
          } else {
            hexParts.push("  ");
            ascii += " ";
          }
          if (i === 7) hexParts.push("");
        }
        const offset = (baseOffset + off).toString(16).padStart(8, "0");
        lines.push(`${offset}  ${hexParts.join(" ").padEnd(50)}  |${ascii}|`);
      }
      return lines.join("\n");
    }
    function slice2(buf, offset, length) {
      const start = Math.max(0, Math.min(Number(offset) || 0, buf.length));
      const len = Math.max(0, Math.min(Number(length) || 0, buf.length - start));
      return buf.slice(start, start + len);
    }
    function renderInspectReport(r) {
      const lines = [];
      lines.push(`\u6587\u4EF6\uFF1A${r.filename}`);
      lines.push(`\u5927\u5C0F\uFF1A${r.size} \u5B57\u8282 \xB7 \u5934\u90E8\u8BFB\u53D6 ${r.readBytes} \u5B57\u8282 \xB7 \u71B5 ${r.entropy} / 8.00${r.entropy > 7.2 ? "\uFF08\u9AD8\u71B5\uFF1A\u5DF2\u538B\u7F29\u6216\u52A0\u5BC6\u7684\u5178\u578B\u7279\u5F81\uFF09" : ""}`);
      if (r.hits.length) {
        lines.push(`\u9B54\u6570\u8BC6\u522B\uFF1A${r.hits.map((h) => `${h.name}\uFF08\u7B7E\u540D @${h.matchedAt}\uFF09`).join("\uFF1B")}`);
      } else if (r.isTextLike) {
        lines.push("\u9B54\u6570\u8BC6\u522B\uFF1A\u65E0\u5DF2\u77E5\u7B7E\u540D\u2014\u2014\u5185\u5BB9\u50CF\u7EAF\u6587\u672C\uFF08\u53EF\u6309\u6587\u672C\u67E5\u770B\uFF09");
      } else {
        lines.push("\u9B54\u6570\u8BC6\u522B\uFF1A\u65E0\u5DF2\u77E5\u7B7E\u540D\uFF08\u672A\u77E5\u4E8C\u8FDB\u5236\u683C\u5F0F\uFF09");
      }
      if (r.extWarning) lines.push(`\u26A0 ${r.extWarning}`);
      if (r.headDump) lines.push("", "\u5934\u90E8 hex dump\uFF1A", r.headDump);
      return lines.join("\n");
    }
    module.exports = {
      MAGIC_TABLE,
      identifyMagic: identifyMagic2,
      expectFromExt,
      extConsistency: extConsistency2,
      shannonEntropy: shannonEntropy2,
      hexDump: hexDump2,
      slice: slice2,
      renderInspectReport,
      hexOf
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_hex_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.hl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.hl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hl-head b{font-size:13px}
.hl-head .sub{color:#5C6678;font-size:11px}
.hl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.hl-row{display:flex;gap:8px}
.hl-input{flex:1;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:7px 10px;outline:none}
.hl-input:focus{border-color:#4fd1a0}
.hl-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.hl-btn:disabled{opacity:.5;cursor:not-allowed}
.hl-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.hl-verdict.bad{background:#2b2413;border-color:#e8590c;color:#f3b377}
.hl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.hl-dump{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:11.5px/1.7 ui-monospace,Consolas,monospace;white-space:pre;overflow-x:auto;color:#c9cede}
.hl-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function HexLensPanel(_props) {
  const [path, setPath] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const summary = useMemo(() => {
    if (!result) return null;
    return { entropy: result.entropy, high: result.entropy > 7.2 };
  }, [result]);
  const inspect = async () => {
    setError(null);
    setBusy(true);
    try {
      const invoke = window.__POLARIS_HOST_INVOKE__;
      if (!invoke) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
      const res = await invoke("router_dispatch", {
        req: { target: "cap.fs", payload: { action: "get_file_content", path } }
      });
      if (!res.ok) throw new Error(res.error || "\u8BFB\u53D6\u5931\u8D25\uFF08\u5BBF\u4E3B\u6743\u9650\u6216\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF09");
      const content = String(res.result?.value ?? res.result?.content ?? "");
      let bytes;
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(content.slice(0, 64)) && content.length % 4 === 0) {
        const bin = atob(content.replace(/\s+/g, ""));
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        bytes = Uint8Array.from(content, (c) => c.charCodeAt(0) & 255);
      }
      const hits = core.identifyMagic(bytes);
      setResult({
        filename: path.split(/[\\/]/).pop() ?? path,
        size: bytes.length,
        readBytes: bytes.length,
        entropy: core.shannonEntropy(bytes),
        hits,
        isTextLike: false,
        extWarning: core.extConsistency(hits, path).warning,
        headDump: core.hexDump(core.slice(bytes, 0, 256))
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "hl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "hl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "\u6587\u4EF6\u9B54\u6570\u900F\u89C6\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u9B54\u6570\u8BC6\u522B \xB7 hex dump \xB7 \u71B5 \xB7 \u7EAF\u672C\u5730\u53EA\u8BFB" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "hl-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "hl-row", children: [
        /* @__PURE__ */ jsx("input", { className: "hl-input", value: path, onChange: (e) => setPath(e.target.value), placeholder: "\u6587\u4EF6\u8DEF\u5F84\uFF08\u5982 D:\\data\\photo.jpg\uFF09" }),
        /* @__PURE__ */ jsx("button", { className: "hl-btn", onClick: inspect, disabled: !path.trim() || busy, children: busy ? "\u8BFB\u53D6\u4E2D\u2026" : "\u68C0\u67E5" })
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "hl-verdict bad", children: error }),
      result && summary && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `hl-verdict ${result.extWarning ? "bad" : "ok"}`, children: [
          result.hits.length ? `\u8BC6\u522B\uFF1A${result.hits.map((h) => h.name).join("\uFF1B")}` : "\u65E0\u5DF2\u77E5\u9B54\u6570\u7B7E\u540D",
          " \xB7 ",
          "\u71B5 ",
          summary.entropy,
          "/8.00",
          summary.high ? "\uFF08\u9AD8\u71B5\uFF1A\u5DF2\u538B\u7F29\u6216\u52A0\u5BC6\u7279\u5F81\uFF09" : "",
          result.extWarning && /* @__PURE__ */ jsxs("div", { children: [
            "\u26A0 ",
            result.extWarning
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "hl-dump", children: result.headDump })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "hl-note", children: "\u9B54\u6570\u8868 20+ \u683C\u5F0F\uFF08PNG/JPEG/PDF/ZIP/GZIP/ELF/PE/Mach-O/Java class/WebP/MP4/SQLite \u7B49\uFF09\u3002 \u6269\u5C55\u540D\u4E0E\u5B9E\u9645\u7C7B\u578B\u4E0D\u7B26\u4F1A\u8B66\u544A\uFF08\u4F2A\u88C5\u6269\u5C55\u540D\u68C0\u6D4B\u2014\u2014\u4E0D\u5224\u6076\u610F\u53EA\u62A5\u4E0D\u4E00\u81F4\uFF09\uFF1B\u9AD8\u71B5\u63D0\u793A\u5DF2\u538B\u7F29/\u52A0\u5BC6\uFF08\u975E\u5224\u5B9A\uFF09\u3002 \u9762\u677F\u7ECF\u5BBF\u4E3B\u901A\u9053\u8BFB\u53D6\uFF08\u53D7\u5BBF\u4E3B\u6587\u4EF6\u6743\u9650\u7EA6\u675F\uFF09\uFF1BAI \u5DE5\u5177 hexlens_inspect/dump \u8D70 MCP \u76F4\u8BFB\uFF08\u53EA\u8BFB\u5934 4KB/16KB \u5207\u7247\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function HexLensEntry(props) {
  return /* @__PURE__ */ jsx2(HexLensPanel, { ...props });
}
export {
  HexLensEntry as default
};
