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

// shared/chunk-core.js
var require_chunk_core = __commonJS({
  "shared/chunk-core.js"(exports, module) {
    "use strict";
    function estimateTokens(text) {
      const s = String(text == null ? "" : text);
      if (!s) return 0;
      let cjk = 0;
      let latinAlnum = 0;
      let other = 0;
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp >= 19968 && cp <= 40959 || cp >= 13312 && cp <= 19903 || cp >= 12352 && cp <= 12543 || cp >= 44032 && cp <= 55215) cjk++;
        else if (/[0-9A-Za-z]/.test(ch)) latinAlnum++;
        else other++;
      }
      return Math.ceil(cjk * 1 + latinAlnum / 4 + other * 0.5);
    }
    function splitSentences(paragraph) {
      return String(paragraph).split(/(?<=[。！？.!?])\s*/).filter((s) => s.trim());
    }
    function splitParagraphs(text) {
      return String(text == null ? "" : text).split(/\n{2,}/).filter((p) => p.trim());
    }
    function chunkText2(text, opts = {}) {
      const maxTokens = Math.max(50, Math.min(32e3, Number(opts.maxTokens) || 800));
      const overlapTokens = Math.max(0, Math.min(Number(opts.overlapTokens) || 0, Math.floor(maxTokens / 2)));
      const totalTokens = estimateTokens(text);
      if (totalTokens <= maxTokens) {
        return {
          chunks: [{ index: 0, text: String(text), tokens: totalTokens }],
          totalTokens,
          estimateNote: ESTIMATE_NOTE
        };
      }
      const paragraphs = splitParagraphs(text);
      const chunks = [];
      let currentParts = [];
      let currentTokens = 0;
      const flush = () => {
        if (!currentParts.length) return;
        const chunkText3 = currentParts.join("\n\n");
        chunks.push({ index: chunks.length, text: chunkText3, tokens: estimateTokens(chunkText3) });
        if (overlapTokens > 0) {
          let tail = [];
          let tailTokens = 0;
          for (let i = currentParts.length - 1; i >= 0 && tailTokens < overlapTokens; i--) {
            const t = estimateTokens(currentParts[i]);
            if (tailTokens + t > overlapTokens) break;
            tail.unshift(currentParts[i]);
            tailTokens += t;
          }
          currentParts = tail;
          currentTokens = tailTokens;
        } else {
          currentParts = [];
          currentTokens = 0;
        }
      };
      for (const para of paragraphs) {
        const paraTokens = estimateTokens(para);
        if (paraTokens > maxTokens) {
          if (currentTokens + paraTokens > maxTokens) flush();
          const sentences = splitSentences(para);
          for (const sentence of sentences) {
            const st = estimateTokens(sentence);
            if (currentTokens + st > maxTokens && currentTokens > 0) {
              flush();
            }
            if (st > maxTokens) {
              let remaining = sentence;
              while (estimateTokens(remaining) > maxTokens) {
                const ratio = remaining.length / estimateTokens(remaining);
                const cutChars = Math.max(1, Math.floor(maxTokens * ratio * 0.9));
                const piece = remaining.slice(0, cutChars);
                if (currentTokens > 0) flush();
                currentParts.push(piece);
                currentTokens = estimateTokens(piece);
                flush();
                remaining = remaining.slice(cutChars);
              }
              if (remaining) {
                currentParts.push(remaining);
                currentTokens += estimateTokens(remaining);
              }
              continue;
            }
            currentParts.push(sentence);
            currentTokens += st;
          }
          continue;
        }
        if (currentTokens + paraTokens > maxTokens && currentTokens > 0) {
          flush();
        }
        currentParts.push(para);
        currentTokens += paraTokens;
      }
      flush();
      return {
        chunks: chunks.filter((c) => c.text.trim()),
        totalTokens,
        estimateNote: ESTIMATE_NOTE
      };
    }
    var ESTIMATE_NOTE = "token \u4F30\u7B97\u4E3A\u542F\u53D1\u5F0F\u53E3\u5F84\uFF08CJK\u22481 token/\u5B57\u3001\u62C9\u4E01\u22481 token/4 \u5B57\u7B26\u3001\u5176\u4F59\u22480.5/\u5B57\u7B26\uFF09\uFF0C\u975E\u7CBE\u786E tokenizer\u2014\u2014\u9884\u7B97\u654F\u611F\u573A\u666F\u8BF7\u7559 10-20% \u4F59\u91CF";
    function renderReport(r, { includeText = true, textCap = 1200 } = {}) {
      const lines = [`\u5171 ${r.chunks.length} \u5757 \xB7 \u5168\u6587\u4F30\u7B97 ${r.totalTokens} tokens`];
      lines.push(r.estimateNote);
      for (const c of r.chunks) {
        lines.push(`\u2500\u2500 \u5757 ${c.index}\uFF08\u4F30\u7B97 ${c.tokens} tokens\uFF09\u2500\u2500`);
        if (includeText) lines.push(c.text.length > textCap ? c.text.slice(0, textCap) + "\u2026" : c.text);
      }
      return lines.join("\n");
    }
    module.exports = { estimateTokens, splitSentences, splitParagraphs, chunkText: chunkText2, renderReport, ESTIMATE_NOTE };
  }
});

// src/Panel.tsx
var core = __toESM(require_chunk_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.tc-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tc-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tc-head b{font-size:13px}
.tc-head .sub{color:#5C6678;font-size:11px}
.tc-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.tc-label{color:#8B94A9;font-size:11px}
.tc-area{width:100%;min-height:160px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.tc-area:focus{border-color:#4fd1a0}
.tc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tc-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;width:120px;outline:none}
.tc-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.tc-btn:disabled{opacity:.5;cursor:not-allowed}
.tc-chk{display:flex;align-items:center;gap:5px;color:#8B94A9;font-size:12px;cursor:pointer}
.tc-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid #2f9e44;background:#12241a;color:#8ce0b0}
.tc-block{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.tc-block h4{margin:0;padding:6px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030;display:flex;justify-content:space-between}
.tc-block pre{margin:0;padding:10px 12px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c9cede;max-height:240px;overflow:auto}
.tc-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function TextChunkerPanel(_props) {
  const [text, setText] = useState("");
  const [maxTokens, setMaxTokens] = useState("800");
  const [overlap, setOverlap] = useState("0");
  const [checked, setChecked] = useState(null);
  const [onlyBlocks, setOnlyBlocks] = useState(false);
  const result = useMemo(() => {
    if (!checked) return null;
    return core.chunkText(checked.t, { maxTokens: checked.max, overlapTokens: checked.ov });
  }, [checked]);
  const run = () => {
    if (!text.trim()) return;
    const max = Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : 800;
    const ov = Number.isFinite(Number(overlap)) ? Number(overlap) : 0;
    setChecked({ t: text, max, ov });
  };
  const copyBlock = (blockText) => {
    void navigator.clipboard?.writeText(blockText);
  };
  return /* @__PURE__ */ jsxs("div", { className: "tc-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "tc-head", children: [
      /* @__PURE__ */ jsx("b", { children: "LLM \u6587\u672C\u5207\u5757\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u8FB9\u754C\u8D2A\u5FC3\u5207\u5757 \xB7 \u91CD\u53E0\u7A97\u53E3 \xB7 token \u4F30\u7B97 \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tc-body", children: [
      /* @__PURE__ */ jsx("div", { className: "tc-label", children: "\u957F\u6587\u672C" }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "tc-area",
          placeholder: "\u7C98\u8D34\u8981\u5582\u7ED9 LLM \u7684\u957F\u6587\u6863\u2026\u2026\uFF08\u6BB5\u843D\u95F4\u7A7A\u884C\u5206\u9694\u6548\u679C\u6700\u4F73\uFF09",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "tc-row", children: [
        /* @__PURE__ */ jsx("span", { className: "tc-label", children: "\u6BCF\u5757\u4E0A\u9650" }),
        /* @__PURE__ */ jsx("input", { className: "tc-input", value: maxTokens, onChange: (e) => setMaxTokens(e.target.value), placeholder: "800" }),
        /* @__PURE__ */ jsx("span", { className: "tc-label", children: "\u91CD\u53E0 tokens" }),
        /* @__PURE__ */ jsx("input", { className: "tc-input", value: overlap, onChange: (e) => setOverlap(e.target.value), placeholder: "0" }),
        /* @__PURE__ */ jsxs("label", { className: "tc-chk", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: onlyBlocks, onChange: (e) => setOnlyBlocks(e.target.checked) }),
          " \u53EA\u770B\u7EDF\u8BA1"
        ] }),
        /* @__PURE__ */ jsx("button", { className: "tc-btn", onClick: run, disabled: !text.trim(), children: "\u5207\u5757" })
      ] }),
      result && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "tc-verdict", children: [
          "\u5171 ",
          result.chunks.length,
          " \u5757 \xB7 \u5168\u6587\u4F30\u7B97 ",
          result.totalTokens,
          " tokens"
        ] }),
        result.chunks.map((c) => /* @__PURE__ */ jsxs("div", { className: "tc-block", children: [
          /* @__PURE__ */ jsxs("h4", { children: [
            /* @__PURE__ */ jsxs("span", { children: [
              "\u5757 ",
              c.index
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              c.tokens,
              " tokens ",
              /* @__PURE__ */ jsx("button", { className: "tc-btn", style: { padding: "2px 8px", marginLeft: 8 }, onClick: () => copyBlock(c.text), children: "\u590D\u5236" })
            ] })
          ] }),
          !onlyBlocks && /* @__PURE__ */ jsx("pre", { children: c.text })
        ] }, c.index))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "tc-note", children: [
        "\u5207\u5757\u4F18\u5148\u7EA7\uFF1A\u6BB5\u843D\uFF08\u7A7A\u884C\uFF09\u2192 \u53E5\u5B50\uFF08\u3002\uFF01\uFF1F.!?\uFF09\u2192 \u786C\u5207\uFF08\u65E0\u53E5\u8BFB\u957F\u6587\u6700\u540E\u624B\u6BB5\uFF09\u3002 token \u4F30\u7B97\u4E3A\u542F\u53D1\u5F0F\u53E3\u5F84\uFF08CJK\u22481 token/\u5B57\u3001\u62C9\u4E01\u22481 token/4 \u5B57\u7B26\uFF09\uFF0C",
        /* @__PURE__ */ jsx("b", { children: "\u975E\u7CBE\u786E tokenizer" }),
        "\u2014\u2014\u9884\u7B97\u654F\u611F\u573A\u666F\u8BF7\u7559 10-20% \u4F59\u91CF\u3002 overlap \u91CD\u53E0\u7A97\u53E3\u628A\u5757\u5C3E\u5185\u5BB9\u590D\u5236\u5230\u4E0B\u4E00\u5757\u5934\uFF0C\u9632\u8BED\u4E49\u65AD\u88C2\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function TextChunkerEntry(props) {
  return /* @__PURE__ */ jsx2(TextChunkerPanel, { ...props });
}
export {
  TextChunkerEntry as default
};
