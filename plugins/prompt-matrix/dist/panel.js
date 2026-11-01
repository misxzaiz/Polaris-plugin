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

// shared/matrix-core.js
var require_matrix_core = __commonJS({
  "shared/matrix-core.js"(exports, module) {
    "use strict";
    var VERSION = "0.1.0";
    var MAX_SAMPLES = 200;
    var MAX_JSONL_BYTES = 256 * 1024;
    var MAX_VAR_VALUE = 64 * 1024;
    var CELL_PROJECT_BYTES = 1200;
    var CELL_STORE_BYTES = 64 * 1024;
    var DIFF_MAX_MID = 3e3;
    var PATTERN_MAX = 500;
    function maskKey(key) {
      const s = String(key || "");
      if (!s) return "";
      const m = s.match(/^\$\{([^}]+)\}$/);
      if (m) return `env:${m[1]}`;
      if (s.length <= 4) return "****";
      return `****${s.slice(-4)}`;
    }
    function renderTemplate2(tpl, vars) {
      const warnings = [];
      const text = String(tpl == null ? "" : tpl).replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (whole, name) => {
        if (!vars || !(name in vars)) {
          warnings.push(`\u53D8\u91CF {{${name}}} \u5728\u6837\u672C\u4E2D\u672A\u5B9A\u4E49\uFF08\u5DF2\u4FDD\u7559\u539F\u6837\uFF09`);
          return whole;
        }
        const v = vars[name];
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        try {
          return JSON.stringify(v);
        } catch (_) {
          return String(v);
        }
      });
      return { text, warnings };
    }
    function extractVars(tpl) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      const s = String(tpl == null ? "" : tpl);
      let m;
      const re = /\{\{\s*([\w.$-]+)\s*\}\}/g;
      while (m = re.exec(s)) {
        if (!seen.has(m[1])) {
          seen.add(m[1]);
          out.push(m[1]);
        }
      }
      return out;
    }
    function parseDataset3(jsonlText, opts) {
      const o = opts || {};
      const maxSamples = o.maxSamples || MAX_SAMPLES;
      const errors = [];
      const samples = [];
      const text = String(jsonlText == null ? "" : jsonlText);
      if (text.length > MAX_JSONL_BYTES) {
        return { samples, errors: [{ line: 0, msg: `\u6570\u636E\u96C6\u8D85\u8FC7 ${Math.round(MAX_JSONL_BYTES / 1024)}KB \u4E0A\u9650` }] };
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (!raw || raw.startsWith("#")) continue;
        let obj;
        try {
          obj = JSON.parse(raw);
        } catch (e) {
          errors.push({ line: i + 1, msg: `JSON \u89E3\u6790\u5931\u8D25\uFF1A${String(e.message).slice(0, 80)}` });
          continue;
        }
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
          errors.push({ line: i + 1, msg: "\u4E0D\u662F JSON \u5BF9\u8C61" });
          continue;
        }
        let vars;
        let expect;
        if ("vars" in obj) {
          if (!obj.vars || typeof obj.vars !== "object" || Array.isArray(obj.vars)) {
            errors.push({ line: i + 1, msg: "vars \u5FC5\u987B\u662F\u5BF9\u8C61" });
            continue;
          }
          vars = { ...obj.vars };
          expect = Array.isArray(obj.expect) ? obj.expect : void 0;
        } else {
          vars = {};
          for (const [k, v] of Object.entries(obj)) {
            if (k === "expect" && Array.isArray(v)) {
              expect = v;
              continue;
            }
            vars[k] = v;
          }
        }
        let bad = false;
        for (const [k, v] of Object.entries(vars)) {
          const size = typeof v === "string" ? v.length : JSON.stringify(v == null ? "" : v).length;
          if (size > MAX_VAR_VALUE) {
            errors.push({ line: i + 1, msg: `\u53D8\u91CF ${k} \u8D85\u8FC7 ${Math.round(MAX_VAR_VALUE / 1024)}KB \u4E0A\u9650` });
            bad = true;
            break;
          }
        }
        if (bad) continue;
        const checks = normalizeChecks(expect, (msg) => errors.push({ line: i + 1, msg }));
        if (checks === null && expect) continue;
        samples.push({ vars, checks: checks || [] });
        if (samples.length >= maxSamples) {
          errors.push({ line: 0, msg: `\u6837\u672C\u8D85\u8FC7 ${maxSamples} \u6761\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD` });
          break;
        }
      }
      return { samples, errors };
    }
    function serializeDataset(samples) {
      const lines = (samples || []).map((s) => {
        const o = { vars: s.vars || {} };
        if (s.checks && s.checks.length) o.expect = s.checks;
        return JSON.stringify(o);
      });
      return lines.join("\n") + (lines.length ? "\n" : "");
    }
    var CHECK_TYPES = ["contains", "not_contains", "regex", "json_valid", "equals", "min_length", "max_length"];
    function normalizeChecks(raw, onErr) {
      if (raw == null) return [];
      if (!Array.isArray(raw)) {
        if (onErr) onErr("expect \u5FC5\u987B\u662F\u68C0\u67E5\u5668\u6570\u7EC4");
        return null;
      }
      const out = [];
      for (const c of raw) {
        if (!c || typeof c !== "object" || !CHECK_TYPES.includes(c.type)) {
          if (onErr) onErr(`\u672A\u77E5\u68C0\u67E5\u5668\u7C7B\u578B\uFF1A${c && c.type}\uFF08\u652F\u6301\uFF1A${CHECK_TYPES.join("/")}\uFF09`);
          return null;
        }
        const item = { type: c.type, label: String(c.label || c.type) };
        if (c.type === "regex") {
          const pattern = typeof c.value === "string" ? c.value : c.value && c.value.pattern;
          if (!pattern || String(pattern).length > PATTERN_MAX) {
            if (onErr) onErr(`regex \u68C0\u67E5\u5668\u9700\u8981 1~${PATTERN_MAX} \u5B57\u7B26\u7684\u6A21\u5F0F`);
            return null;
          }
          let flags = typeof c.value === "object" && c.value ? String(c.value.flags || "") : "";
          flags = flags.replace(/[^gimsuy]/g, "");
          try {
            new RegExp(pattern, flags);
          } catch (e) {
            if (onErr) onErr(`regex \u6A21\u5F0F\u975E\u6CD5\uFF1A${String(e.message).slice(0, 80)}`);
            return null;
          }
          item.value = { pattern, flags };
        } else if (c.type === "json_valid") {
          item.value = c.value && typeof c.value === "object" ? { extract: !!c.value.extract } : {};
        } else if (c.type === "min_length" || c.type === "max_length") {
          const n = Number(c.value);
          if (!Number.isFinite(n) || n < 0) {
            if (onErr) onErr(`${c.type} \u9700\u8981\u975E\u8D1F\u6570\u5B57`);
            return null;
          }
          item.value = n;
        } else {
          let v = c.value;
          if (c.type !== "equals") {
            if (typeof v === "string") v = [v];
            if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== "string" || !x.length)) {
              if (onErr) onErr(`${c.type} \u9700\u8981\u975E\u7A7A\u5B57\u7B26\u4E32\u6216\u5B57\u7B26\u4E32\u6570\u7EC4`);
              return null;
            }
            if (v.length > 20) {
              if (onErr) onErr(`${c.type} \u5173\u952E\u8BCD\u6700\u591A 20 \u4E2A`);
              return null;
            }
          } else if (typeof v !== "string") {
            if (onErr) onErr("equals \u9700\u8981\u5B57\u7B26\u4E32");
            return null;
          }
          item.value = v;
        }
        out.push(item);
      }
      return out;
    }
    function extractJsonBlock(text) {
      const m = String(text || "").match(/```(?:json)?\s*\r?\n?([\s\S]*?)```/i);
      return m ? m[1] : null;
    }
    function runChecks(content, checks) {
      const text = String(content == null ? "" : content);
      const out = [];
      for (const c of checks || []) {
        try {
          if (c.type === "contains") {
            const missing = (c.value || []).filter((kw) => !text.includes(kw));
            out.push({ type: c.type, label: c.label, pass: missing.length === 0, detail: missing.length ? `\u7F3A\u5C11\uFF1A${missing.map((x) => x.slice(0, 40)).join("\u3001")}` : "\u5168\u90E8\u547D\u4E2D" });
          } else if (c.type === "not_contains") {
            const hit = (c.value || []).filter((kw) => text.includes(kw));
            out.push({ type: c.type, label: c.label, pass: hit.length === 0, detail: hit.length ? `\u4E0D\u5E94\u51FA\u73B0\uFF1A${hit.map((x) => x.slice(0, 40)).join("\u3001")}` : "\u65E0\u8FDD\u7981\u8BCD" });
          } else if (c.type === "regex") {
            const re = new RegExp(c.value.pattern, c.value.flags.includes("g") ? c.value.flags : c.value.flags + "");
            const ok = re.test(text);
            out.push({ type: c.type, label: c.label, pass: ok, detail: ok ? "\u6B63\u5219\u547D\u4E2D" : "\u6B63\u5219\u672A\u547D\u4E2D" });
          } else if (c.type === "json_valid") {
            const src = c.value && c.value.extract ? extractJsonBlock(text) || text : text;
            let parsed = null;
            let err = null;
            try {
              parsed = JSON.parse(src.trim());
            } catch (e) {
              err = e;
            }
            out.push({ type: c.type, label: c.label, pass: !err, detail: err ? `JSON \u89E3\u6790\u5931\u8D25\uFF1A${String(err.message).slice(0, 60)}` : `JSON \u6709\u6548\uFF08${Array.isArray(parsed) ? "array" : typeof parsed}\uFF09` });
          } else if (c.type === "equals") {
            const ok = text.trim() === c.value;
            out.push({ type: c.type, label: c.label, pass: ok, detail: ok ? "\u7CBE\u786E\u5339\u914D" : "\u4E0D\u7B49\u4E8E\u671F\u671B\u6587\u672C" });
          } else if (c.type === "min_length") {
            const ok = text.length >= c.value;
            out.push({ type: c.type, label: c.label, pass: ok, detail: `${text.length} \u5B57\u7B26\uFF08\u4E0B\u9650 ${c.value}\uFF09` });
          } else if (c.type === "max_length") {
            const ok = text.length <= c.value;
            out.push({ type: c.type, label: c.label, pass: ok, detail: `${text.length} \u5B57\u7B26\uFF08\u4E0A\u9650 ${c.value}\uFF09` });
          }
        } catch (e) {
          out.push({ type: c.type, label: c.label, pass: false, detail: `\u68C0\u67E5\u5668\u5F02\u5E38\uFF1A${String(e.message).slice(0, 60)}` });
        }
      }
      return out;
    }
    function textDiff2(aRaw, bRaw) {
      const a = String(aRaw == null ? "" : aRaw);
      const b = String(bRaw == null ? "" : bRaw);
      if (a === b) return [{ t: "same", s: a }];
      let start = 0;
      const minLen = Math.min(a.length, b.length);
      while (start < minLen && a.charCodeAt(start) === b.charCodeAt(start)) start++;
      let endA = a.length;
      let endB = b.length;
      while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
        endA--;
        endB--;
      }
      const midA = a.slice(start, endA);
      const midB = b.slice(start, endB);
      const segs = [];
      if (start) segs.push({ t: "same", s: a.slice(0, start) });
      const A = midA.length > DIFF_MAX_MID ? midA.slice(0, DIFF_MAX_MID) : midA;
      const B = midB.length > DIFF_MAX_MID ? midB.slice(0, DIFF_MAX_MID) : midB;
      if (midA.length > DIFF_MAX_MID || midB.length > DIFF_MAX_MID) {
        segs.push({ t: "same", s: "\u2026\uFF08\u5DEE\u5F02\u4E2D\u6BB5\u8FC7\u957F\uFF0C\u5DF2\u7701\u7565\u663E\u793A\uFF09\u2026" });
      }
      const n = A.length;
      const m = B.length;
      if (n === 0) {
        segs.push({ t: "add", s: midB });
      } else if (m === 0) {
        segs.push({ t: "del", s: midA });
      } else {
        const dp = new Int32Array((n + 1) * (m + 1));
        for (let i2 = n - 1; i2 >= 0; i2--) {
          for (let j2 = m - 1; j2 >= 0; j2--) {
            dp[i2 * (m + 1) + j2] = A.charCodeAt(i2) === B.charCodeAt(j2) ? dp[(i2 + 1) * (m + 1) + j2 + 1] + 1 : Math.max(dp[(i2 + 1) * (m + 1) + j2], dp[i2 * (m + 1) + j2 + 1]);
          }
        }
        let i = 0;
        let j = 0;
        const raw = [];
        while (i < n && j < m) {
          if (A.charCodeAt(i) === B.charCodeAt(j)) {
            raw.push({ t: "same", s: A[i] });
            i++;
            j++;
          } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
            raw.push({ t: "del", s: A[i] });
            i++;
          } else {
            raw.push({ t: "add", s: B[j] });
            j++;
          }
        }
        while (i < n) {
          raw.push({ t: "del", s: A[i] });
          i++;
        }
        while (j < m) {
          raw.push({ t: "add", s: B[j] });
          j++;
        }
        let cur = null;
        for (const seg of raw) {
          if (cur && cur.t === seg.t) cur.s += seg.s;
          else {
            if (cur) segs.push(cur);
            cur = { t: seg.t, s: seg.s };
          }
        }
        if (cur) segs.push(cur);
      }
      if (endA < a.length) segs.push({ t: "same", s: a.slice(endA) });
      return segs;
    }
    function aggregateRuns(cells, variantCount) {
      const per = [];
      for (let v = 0; v < variantCount; v++) {
        per.push({ idx: v, total: 0, ok: 0, failed: 0, checkAllPass: 0, judgeSum: 0, judgeN: 0, avgMs: 0, msSum: 0, tokIn: 0, tokOut: 0 });
      }
      for (const c of cells || []) {
        const p = per[c.variantIdx];
        if (!p) continue;
        p.total += 1;
        if (c.ok) {
          p.ok += 1;
          p.msSum += c.ms || 0;
          const checks = c.checks || [];
          if (checks.length && checks.every((x) => x.pass)) p.checkAllPass += 1;
          if (c.usage) {
            p.tokIn += Number(c.usage.prompt_tokens) || 0;
            p.tokOut += Number(c.usage.completion_tokens) || 0;
          }
          if (c.judge && Number.isFinite(c.judge.score)) {
            p.judgeSum += c.judge.score;
            p.judgeN += 1;
          }
        } else {
          p.failed += 1;
        }
      }
      for (const p of per) {
        p.avgMs = p.ok ? Math.round(p.msSum / p.ok) : 0;
        p.judgeAvg = p.judgeN ? Math.round(p.judgeSum / p.judgeN * 10) / 10 : null;
        delete p.msSum;
        delete p.judgeSum;
      }
      const totals = {
        cells: per.reduce((a, b) => a + b.total, 0),
        ok: per.reduce((a, b) => a + b.ok, 0),
        failed: per.reduce((a, b) => a + b.failed, 0),
        tokIn: per.reduce((a, b) => a + b.tokIn, 0),
        tokOut: per.reduce((a, b) => a + b.tokOut, 0)
      };
      return { variants: per, totals };
    }
    var JUDGE_SYSTEM = '\u4F60\u662F\u4E25\u683C\u7684 LLM \u8F93\u51FA\u8BC4\u6D4B\u5458\u3002\u6839\u636E\u4EFB\u52A1\u8981\u6C42\u5BF9\u8F93\u51FA\u6253 1-10 \u5206\uFF0810=\u5B8C\u5168\u6EE1\u8DB3\u4EFB\u52A1\uFF0C1=\u5B8C\u5168\u79BB\u9898\u6216\u65E0\u7528\uFF09\uFF0C\u5E76\u7ED9\u51FA\u4E0D\u8D85\u8FC7 60 \u5B57\u7684\u4E2D\u6587\u7406\u7531\u3002\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u683C\u5F0F\uFF1A{"score": <1-10 \u6574\u6570>, "reason": "<\u7406\u7531>"}\uFF0C\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u5185\u5BB9\u3002';
    function buildJudgeMessages(ctx, customUserTpl) {
      const vars = ctx.vars || {};
      const varLines = Object.entries(vars).map(([k, v]) => {
        const vs = typeof v === "string" ? v : JSON.stringify(v);
        return `- ${k} = ${vs.length > 300 ? vs.slice(0, 300) + "\u2026" : vs}`;
      });
      const user = customUserTpl && customUserTpl.trim() ? renderTemplate2(customUserTpl, { output: ctx.output || "", ...vars }).text : [
        "## \u4EFB\u52A1",
        ctx.userTemplate || "\uFF08\u65E0\u6A21\u677F\uFF09",
        varLines.length ? `## \u8F93\u5165\u53D8\u91CF
${varLines.join("\n")}` : "",
        "## \u6A21\u578B\u8F93\u51FA",
        String(ctx.output || "").slice(0, 8e3),
        "## \u8BF7\u6253\u5206",
        '\u53EA\u8F93\u51FA {"score": <1-10>, "reason": "<\u7406\u7531>"}\u3002'
      ].filter(Boolean).join("\n\n");
      return [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: user }
      ];
    }
    function parseJudgeOutput(text) {
      const s = String(text || "");
      const start = s.indexOf("{");
      if (start < 0) return null;
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === "\\") {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          continue;
        }
        if (inStr) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            try {
              const j = JSON.parse(s.slice(start, i + 1));
              const score = Math.round(Number(j.score));
              if (!Number.isFinite(score)) return null;
              return { score: Math.min(10, Math.max(1, score)), reason: String(j.reason || "").slice(0, 300) };
            } catch (_) {
              return null;
            }
          }
        }
      }
      return null;
    }
    function makeCellProjection(cell) {
      const c = { ...cell };
      if (typeof c.content === "string" && c.content.length > CELL_PROJECT_BYTES) {
        c.content = c.content.slice(0, CELL_PROJECT_BYTES);
        c.truncated = true;
      }
      if (c.error && typeof c.error.hint === "string" && c.error.hint.length > 200) {
        c.error = { ...c.error, hint: c.error.hint.slice(0, 200) };
      }
      return c;
    }
    function resolveUrls(baseUrl, wire) {
      const raw = String(baseUrl || "").trim().replace(/\/+$/, "");
      if (!raw) throw new Error("baseUrl \u4E3A\u7A7A");
      if (raw.endsWith("#")) {
        const chat = raw.slice(0, -1);
        return { chat, note: "\u9010\u5B57\u6A21\u5F0F\uFF08baseUrl \u4EE5 # \u7ED3\u5C3E\uFF09" };
      }
      const hasVersion = /\/(v1|v1beta|v2|openai|api|anthropic|compatible\/v1)(\/|$)/.test(raw);
      const endsChat = /\/(chat\/completions|messages|completions)$/.test(raw);
      if (wire === "anthropic-messages") {
        return { chat: endsChat ? raw : raw + (hasVersion ? "/messages" : "/v1/messages"), note: hasVersion ? "\u542B\u7248\u672C\u6BB5" : "\u88F8\u57DF\u8865 /v1" };
      }
      return { chat: endsChat ? raw : raw + (hasVersion ? "/chat/completions" : "/v1/chat/completions"), note: hasVersion ? "\u542B\u7248\u672C\u6BB5" : "\u88F8\u57DF\u8865 /v1" };
    }
    function stripCliModelSuffix(model) {
      const s = String(model || "");
      const i = s.indexOf("[");
      if (i < 0) return { base: s, beta: null, query: null };
      const base = s.slice(0, i).trimEnd();
      if (!base) return { base: s, beta: null, query: null };
      const suffix = s.slice(i + 1).replace(/\]+$/, "");
      const isOneM = suffix === "1m" || suffix === "1M";
      return {
        base,
        beta: isOneM ? "claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14" : null,
        query: isOneM ? "beta=true" : null
      };
    }
    function upstreamModel(profile) {
      return stripCliModelSuffix(profile.model).base || profile.model;
    }
    function buildHeaders(profile) {
      const h = { "Content-Type": "application/json" };
      if (profile.wire === "anthropic-messages") {
        h["x-api-key"] = profile.apiKey;
        h["anthropic-version"] = profile.anthropicVersion || "2023-06-01";
        const sfx = stripCliModelSuffix(profile.model);
        if (sfx.beta) h["anthropic-beta"] = sfx.beta;
      } else {
        h["Authorization"] = `Bearer ${profile.apiKey}`;
      }
      return h;
    }
    function chatUrlOf(profile, urls) {
      const sfx = stripCliModelSuffix(profile.model);
      if (profile.wire === "anthropic-messages" && sfx.query && !urls.chat.includes("?")) {
        return `${urls.chat}?${sfx.query}`;
      }
      return urls.chat;
    }
    function chatBody(profile, opts) {
      const wire = profile.wire === "anthropic-messages" ? "anthropic" : "openai";
      const maxTokens = Math.min(Math.max(Number(opts.maxTokens) || 1024, 1), 32768);
      const msgs = Array.isArray(opts.messages) ? opts.messages : [{ role: "user", content: String(opts.prompt || "") }];
      const temperature = opts.temperature == null ? null : Math.min(Math.max(Number(opts.temperature), 0), 2);
      let body;
      if (wire === "anthropic") {
        const system = msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n");
        const rest = msgs.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
        body = { model: upstreamModel(profile), max_tokens: maxTokens, messages: rest };
        if (system) body.system = system;
      } else {
        body = { model: upstreamModel(profile), max_tokens: maxTokens, messages: msgs };
      }
      if (temperature != null) body.temperature = temperature;
      return body;
    }
    function maxTokensRetryHint(bodyText) {
      return /max_completion_tokens/i.test(bodyText) && /max_tokens/i.test(bodyText) && /deprecat|unsupported|use |instead/i.test(bodyText);
    }
    function classifyNetworkErr(err) {
      const msg = String(err && (err.message || err.cause && err.cause.message) || err || "");
      const code = String(err && (err.code || err.cause && err.cause.code) || "");
      if (/ENOTFOUND|EAI_AGAIN/i.test(code + msg)) return { code: "dns", cn: "\u57DF\u540D\u89E3\u6790\u5931\u8D25", hint: "\u68C0\u67E5 baseUrl \u62FC\u5199\u4E0E DNS" };
      if (/ECONNREFUSED|bad port/i.test(code + msg)) return { code: "refused", cn: "\u8FDE\u63A5\u88AB\u62D2\u7EDD\uFF08\u7AEF\u53E3\u672A\u5F00\uFF09", hint: "\u670D\u52A1\u672A\u542F\u52A8\u6216\u7AEF\u53E3\u9519\u8BEF" };
      if (/CERT|SSL|TLS|DEPTH_ZERO|SELF_SIGNED/i.test(code + msg)) return { code: "tls", cn: "TLS \u8BC1\u4E66\u9519\u8BEF", hint: "\u81EA\u7B7E\u540D/\u8FC7\u671F\u8BC1\u4E66" };
      if (/ECONNRESET|EPIPE/i.test(code + msg)) return { code: "reset", cn: "\u8FDE\u63A5\u88AB\u91CD\u7F6E", hint: "\u7F51\u7EDC\u4E2D\u65AD\u6216\u4EE3\u7406\u6390\u65AD" };
      if (/ETIMEDOUT|ECONNABORTED|AbortError|TIMEOUT/i.test(code + msg)) return { code: "timeout", cn: "\u54CD\u5E94\u8D85\u65F6", hint: "\u7AEF\u70B9\u65E0\u54CD\u5E94\u6216\u751F\u6210\u8FC7\u6162\uFF0C\u53EF\u5728\u8BBE\u7F6E\u91CC\u653E\u5BBD\u8D85\u65F6" };
      return { code: "network", cn: "\u7F51\u7EDC\u9519\u8BEF", hint: msg.slice(0, 160) };
    }
    function classifyHttp(status, bodyText) {
      const short = String(bodyText || "").slice(0, 400);
      let upstream = "";
      try {
        const j = JSON.parse(short || "{}");
        upstream = String(j.error && (j.error.message || j.error.type) || j.message || j.detail || "");
      } catch (_) {
        upstream = short.slice(0, 160);
      }
      if (status === 401 || status === 403) return { code: status === 401 ? "auth" : "forbidden", cn: "\u9274\u6743\u5931\u8D25", hint: "\u68C0\u67E5 apiKey/\u989D\u5EA6\uFF1B" + upstream.slice(0, 120) };
      if (status === 404) return { code: "not_found", cn: "404 \u8DEF\u5F84\u6216\u6A21\u578B\u4E0D\u5B58\u5728", hint: "\u68C0\u67E5 baseUrl \u62FC\u63A5\u4E0E\u6A21\u578B\u540D" + (upstream ? "\uFF1B" + upstream.slice(0, 120) : "") };
      if (status === 429) return { code: "rate_limit", cn: "\u9650\u6D41\uFF08429\uFF09", hint: "\u964D\u4F4E\u5E76\u53D1\u6216\u7A0D\u540E\u91CD\u8BD5" + (upstream ? "\uFF1B" + upstream.slice(0, 120) : "") };
      if (status === 400) return { code: "bad_request", cn: "400 \u8BF7\u6C42\u88AB\u62D2", hint: "\u53C2\u6570\u4E0D\u517C\u5BB9\uFF08\u6A21\u578B\u540D/wire \u534F\u8BAE\uFF09\uFF1B" + upstream.slice(0, 160) };
      if (status === 402) return { code: "payment", cn: "402 \u9700\u8981\u4ED8\u8D39", hint: "\u4F59\u989D/\u914D\u989D\u4E0D\u8DB3" };
      if (status >= 500) return { code: "server", cn: `\u4E0A\u6E38\u670D\u52A1\u9519\u8BEF\uFF08${status}\uFF09`, hint: "\u4F9B\u5E94\u5546\u4FA7\u6545\u969C/\u8FC7\u8F7D" + (upstream ? "\uFF1B" + upstream.slice(0, 120) : "") };
      return { code: "http_other", cn: `HTTP ${status}`, hint: upstream.slice(0, 160) };
    }
    async function readBody(res, cap) {
      try {
        const reader = res.body && res.body.getReader ? res.body.getReader() : null;
        if (!reader) return await res.text();
        const dec = new TextDecoder();
        let out = "";
        for (; ; ) {
          const { value, done } = await reader.read();
          if (done) break;
          out += dec.decode(value, { stream: true });
          if (out.length > cap) {
            try {
              reader.cancel();
            } catch (_) {
            }
            break;
          }
        }
        return out;
      } catch (_) {
        return "";
      }
    }
    async function chatOnce(profile, opts) {
      const fetchImpl = opts.fetchImpl || fetch;
      const wire = profile.wire === "anthropic-messages" ? "anthropic-messages" : "openai-chat-completions";
      let urls;
      try {
        urls = resolveUrls(profile.baseUrl, wire);
      } catch (e) {
        return { ok: false, ms: 0, error: { code: "config", cn: String(e.message || e), hint: "\u4FEE\u6B63\u6863\u6848 baseUrl" } };
      }
      const body = chatBody(profile, opts);
      const headers = buildHeaders(profile);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(new Error(`timeout ${opts.timeoutMs}ms`)), opts.timeoutMs || 6e4);
      const onOuterAbort = () => ac.abort(new Error("cancelled"));
      if (opts.signal) {
        if (opts.signal.aborted) {
          clearTimeout(timer);
          return { ok: false, ms: 0, error: { code: "cancelled", cn: "\u5DF2\u53D6\u6D88", hint: "" } };
        }
        opts.signal.addEventListener("abort", onOuterAbort, { once: true });
      }
      const t0 = Date.now();
      try {
        let res = await fetchImpl(chatUrlOf(profile, urls), { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal });
        let retried = false;
        if (res.status === 400) {
          const et = await readBody(res.clone ? res.clone() : res, 4096);
          if (maxTokensRetryHint(et)) {
            const body2 = JSON.parse(JSON.stringify(body));
            body2.max_completion_tokens = body2.max_tokens;
            delete body2.max_tokens;
            res = await fetchImpl(chatUrlOf(profile, urls), { method: "POST", headers, body: JSON.stringify(body2), signal: ac.signal });
            retried = true;
          }
        }
        if (!res.ok) {
          const text2 = await readBody(res, 8192);
          return { ok: false, ms: Date.now() - t0, status: res.status, retried, error: classifyHttp(res.status, text2) };
        }
        const text = await readBody(res, 131072);
        const ms = Date.now() - t0;
        let j;
        try {
          j = JSON.parse(text);
        } catch (_) {
          return { ok: false, ms, status: res.status, retried, error: { code: "schema", cn: "200 \u4F46\u54CD\u5E94\u975E JSON", hint: "\u7AEF\u70B9\u53EF\u80FD\u6307\u5411\u7F51\u9875/\u767B\u5F55\u9875" } };
        }
        if (wire === "anthropic-messages") {
          if (!Array.isArray(j.content) || j.type !== "message") {
            return { ok: false, ms, status: res.status, retried, error: { code: "schema", cn: "Anthropic schema \u4E0D\u7B26", hint: "\u7F3A\u5C11 content[]/message" } };
          }
          const content2 = j.content.filter((b) => b && b.type === "text").map((b) => b.text || "").join("");
          return { ok: true, ms, status: res.status, retried, content: content2, finishReason: j.stop_reason || null, usage: j.usage || null };
        }
        const ch = Array.isArray(j.choices) && j.choices[0];
        if (!ch) {
          return { ok: false, ms, status: res.status, retried, error: { code: "schema", cn: "OpenAI schema \u4E0D\u7B26", hint: "\u7F3A\u5C11 choices[]" } };
        }
        const content = ch.message && typeof ch.message.content === "string" ? ch.message.content : "";
        return { ok: true, ms, status: res.status, retried, content, finishReason: ch.finish_reason || null, usage: j.usage || null };
      } catch (e) {
        if (opts.signal && opts.signal.aborted) return { ok: false, ms: Date.now() - t0, error: { code: "cancelled", cn: "\u5DF2\u53D6\u6D88", hint: "" } };
        if (/timeout/i.test(String(e && e.message || ""))) return { ok: false, ms: Date.now() - t0, error: { code: "timeout", cn: `\u8D85\u65F6\uFF08${opts.timeoutMs || 6e4}ms\uFF09`, hint: "\u53EF\u5728\u8BBE\u7F6E\u91CC\u653E\u5BBD\u5355\u683C\u8D85\u65F6" } };
        return { ok: false, ms: Date.now() - t0, error: classifyNetworkErr(e) };
      } finally {
        clearTimeout(timer);
        if (opts.signal) opts.signal.removeEventListener("abort", onOuterAbort);
      }
    }
    function isRetryable(r) {
      if (!r || r.ok) return false;
      const c = r.error && r.error.code;
      if (["dns", "refused", "tls", "reset", "timeout", "network"].includes(c)) return true;
      if (c === "rate_limit" || c === "server") return true;
      return false;
    }
    module.exports = {
      VERSION,
      MAX_SAMPLES,
      MAX_JSONL_BYTES,
      CELL_PROJECT_BYTES,
      CELL_STORE_BYTES,
      CHECK_TYPES,
      JUDGE_SYSTEM,
      maskKey,
      renderTemplate: renderTemplate2,
      extractVars,
      parseDataset: parseDataset3,
      serializeDataset,
      normalizeChecks,
      runChecks,
      extractJsonBlock,
      textDiff: textDiff2,
      aggregateRuns,
      buildJudgeMessages,
      parseJudgeOutput,
      makeCellProjection,
      resolveUrls,
      stripCliModelSuffix,
      upstreamModel,
      buildHeaders,
      chatUrlOf,
      chatBody,
      maxTokensRetryHint,
      classifyNetworkErr,
      classifyHttp,
      chatOnce,
      isRetryable
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef, useState as useState6 } from "react";

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}

// src/model.ts
function invoke() {
  return getHostInvoke();
}
async function kvGet(key) {
  const r = await invoke()("router_dispatch", {
    target: "cap.kv",
    payload: { action: "get", key }
  });
  return r && r.result && r.result.value !== void 0 ? r.result.value : null;
}
async function kvSet(key, value) {
  const r = await invoke()("router_dispatch", {
    target: "cap.kv",
    payload: { action: "set", key, value }
  });
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : "cap.kv set \u5931\u8D25");
}
async function kvDel(key) {
  await invoke()("router_dispatch", { target: "cap.kv", payload: { action: "delete", key } }).catch(() => void 0);
}
var nonceCounter = 0;
async function sendCommand(action, payload, timeoutMs = 3e4) {
  const nonce = `p${Date.now().toString(36)}-${++nonceCounter}`;
  await kvSet("pmtx.cmd", { nonce, action, payload, at: (/* @__PURE__ */ new Date()).toISOString() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const res = await kvGet("pmtx.res");
    if (res && res.nonce === nonce) {
      await kvDel("pmtx.res");
      return res.result || {};
    }
  }
  return { ok: false, pending: true, error: `\u547D\u4EE4\u5DF2\u6295\u9012\uFF0C${Math.round(timeoutMs / 1e3)}s \u5185\u672A\u89C1\u56DE\u6267\uFF08\u4EFB\u52A1\u53EF\u80FD\u4ECD\u5728\u540E\u53F0\u8FD0\u884C\uFF0C\u7A0D\u540E\u5237\u65B0\u67E5\u770B\uFF09` };
}
var loadMeta = () => kvGet("pmtx.meta");
async function fetchState(timeoutMs = 8e3) {
  const r = await sendCommand("get_state", {}, timeoutMs);
  if (r && r.ok) return r;
  return null;
}
async function fetchRun(runId, timeoutMs = 15e3) {
  let id = runId;
  if (!id || id === "latest") {
    const runs = await kvGet("pmtx.runs");
    id = Array.isArray(runs) && runs.length ? runs[0] : "";
  }
  if (!id) return null;
  const r = await sendCommand("get_run", { runId: id }, timeoutMs);
  if (r && r.ok && r.run) return r.run;
  return await kvGet(`pmtx.run.${id}`);
}
async function fetchCell(runId, cellId, timeoutMs = 15e3) {
  const r = await sendCommand("get_cell", { runId, cellId }, timeoutMs);
  if (r && r.ok) return r;
  return null;
}
async function annotate(runId, cellId, verdict) {
  const r = await sendCommand("annotate", { runId, cellId, verdict }, 12e3);
  return !!(r && r.ok);
}

// src/RunTab.tsx
var core = __toESM(require_matrix_core());
import { useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var SAMPLE_USER = "\u628A\u4E0B\u9762\u8FD9\u53E5\u8BDD\u7FFB\u8BD1\u6210\u82F1\u6587\uFF0C\u53EA\u8F93\u51FA\u8BD1\u6587\uFF1A\n{{text}}";
function newVariant(profiles) {
  return {
    name: "",
    profileId: profiles.length ? profiles[0].id : "",
    systemTemplate: "",
    userTemplate: SAMPLE_USER,
    maxTokens: "1024",
    temperature: ""
  };
}
function RunTab({ profiles, datasets, settings, running, onDone, goTab }) {
  const [variants, setVariants] = useState(() => [newVariant(profiles)]);
  const [datasetId, setDatasetId] = useState("");
  const [inlineJsonl, setInlineJsonl] = useState("");
  const [useInline, setUseInline] = useState(false);
  const [concurrency, setConcurrency] = useState(String(settings?.concurrency ?? 3));
  const [retries, setRetries] = useState(String(settings?.retries ?? 1));
  const [useJudge, setUseJudge] = useState(false);
  const [judgeProfileId, setJudgeProfileId] = useState(settings?.judgeProfileId || "");
  const [judgeTemplate, setJudgeTemplate] = useState("");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const jsonlText = useInline ? inlineJsonl : "";
  const parsed = useMemo(() => {
    if (useInline) {
      if (!inlineJsonl.trim()) return null;
      return core.parseDataset(inlineJsonl);
    }
    return null;
  }, [useInline, inlineJsonl]);
  const sampleCount = useInline ? parsed ? parsed.samples.length : 0 : datasets.find((d) => d.id === datasetId)?.count ?? 0;
  const cellCount = sampleCount * variants.length;
  const judgeCells = useJudge && judgeProfileId ? sampleCount * variants.length : 0;
  const tplWarn = useMemo(() => {
    const sampleVars = parsed && parsed.samples.length ? parsed.samples[0].vars : null;
    if (!sampleVars) return [];
    const out = [];
    for (const [i, v] of variants.entries()) {
      for (const [field, tpl] of [["system", v.systemTemplate], ["user", v.userTemplate]]) {
        if (!tpl) continue;
        const r = core.renderTemplate(tpl, sampleVars);
        for (const w of r.warnings) out.push(`\u53D8\u4F53${i + 1}${field === "system" ? "\u7CFB\u7EDF\u8BCD" : "\u7528\u6237\u8BCD"}\uFF1A${w}`);
      }
    }
    return out.slice(0, 6);
  }, [parsed, variants]);
  const updateVariant = (i, patch) => {
    setVariants((vs) => vs.map((v, j) => j === i ? { ...v, ...patch } : v));
  };
  const startRun = async () => {
    setErr("");
    setOkMsg("");
    if (running) {
      setErr("\u5DF2\u6709\u77E9\u9635\u5728\u8FD0\u884C\uFF0C\u7B49\u5B83\u5B8C\u6210\u6216\u5148\u53D6\u6D88");
      return;
    }
    if (!profiles.length) {
      setErr("\u6CA1\u6709\u6A21\u578B\u6863\u6848\uFF1A\u5148\u5230\u300C\u6863\u6848\u300D\u9875\u5BFC\u5165\u5BBF\u4E3B\u6863\u6848\u6216\u624B\u52A8\u6DFB\u52A0");
      return;
    }
    const vDefs = variants.map((v) => ({
      name: v.name,
      profileId: v.profileId,
      systemTemplate: v.systemTemplate,
      userTemplate: v.userTemplate,
      maxTokens: Number(v.maxTokens) || 1024,
      temperature: v.temperature.trim() === "" ? null : Number(v.temperature)
    }));
    if (!vDefs.every((v) => v.userTemplate.trim())) {
      setErr("\u6BCF\u4E2A\u53D8\u4F53\u7684\u7528\u6237\u63D0\u793A\u8BCD\u6A21\u677F\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    if (!useInline && !datasetId) {
      setErr("\u9009\u62E9\u6570\u636E\u96C6\uFF08\u6216\u5207\u5230\u300C\u4E34\u65F6 JSONL\u300D\u76F4\u63A5\u7C98\u8D34\uFF09");
      return;
    }
    if (useInline && !inlineJsonl.trim()) {
      setErr("\u4E34\u65F6 JSONL \u4E3A\u7A7A");
      return;
    }
    if (useJudge && !judgeProfileId) {
      setErr("\u5F00\u542F\u4E86 LLM \u8BC4\u5224\u4F46\u672A\u9009\u62E9\u8BC4\u5224\u6863\u6848");
      return;
    }
    if (cellCount <= 0) {
      setErr("\u683C\u5B50\u6570\u4E3A 0\uFF1A\u6570\u636E\u96C6\u6CA1\u6709\u6709\u6548\u6837\u672C");
      return;
    }
    const spend = window.confirm(
      `\u5373\u5C06\u53D1\u8D77\u77E9\u9635\uFF1A${sampleCount} \u6837\u672C \xD7 ${variants.length} \u53D8\u4F53 = ${cellCount} \u683C\u771F\u5B9E LLM \u8BF7\u6C42` + (judgeCells ? ` + ${judgeCells} \u683C\u8BC4\u5224` : "") + `
\u6BCF\u6B21\u8C03\u7528\u90FD\u4EA7\u751F token \u8D39\u7528\uFF0C\u786E\u8BA4\u6267\u884C\uFF1F`
    );
    if (!spend) return;
    setBusy(true);
    try {
      const payload = {
        variants: vDefs,
        concurrency: Number(concurrency) || 3,
        retries: Number(retries) ?? 1
      };
      if (useInline) payload.jsonl = inlineJsonl;
      else payload.datasetId = datasetId;
      if (useJudge) payload.judge = { profileId: judgeProfileId, userTemplate: judgeTemplate };
      const r = await sendCommand("run_start", payload, 2e4);
      if (r.ok) {
        setOkMsg(`\u77E9\u9635\u5DF2\u542F\u52A8\uFF08${r.cells} \u683C\uFF09\u3002\u8FDB\u5EA6\u89C1\u9876\u90E8\u8FDB\u5EA6\u6761\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u5207\u5230\u300C\u7ED3\u679C\u300D\u3002`);
        onDone();
        const t = setInterval(async () => {
          const m = await loadMeta().catch(() => null);
          if (!m || !m.running) {
            clearInterval(t);
            goTab("results");
          }
        }, 3e3);
      } else {
        setErr(r.error || "\u53D1\u8D77\u5931\u8D25");
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const cancelRun = async () => {
    setBusy(true);
    try {
      const r = await sendCommand("run_cancel", {}, 12e3);
      if (!r.ok) setErr(r.error || "\u53D6\u6D88\u5931\u8D25");
      else setOkMsg("\u5DF2\u8BF7\u6C42\u53D6\u6D88\uFF08\u6B63\u5728\u8DD1\u7684\u683C\u5B50\u4F1A\u4E2D\u6B62\uFF0C\u5DF2\u5B8C\u6210\u683C\u5B50\u4FDD\u7559\u843D\u76D8\uFF09");
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "pm-bar" }),
      "\u6570\u636E\u96C6",
      /* @__PURE__ */ jsx("span", { className: "pm-hint", children: "\u4E00\u7EC4\u8F93\u5165\u6837\u672C\uFF0C\u9010\u884C JSONL" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "pm-card", children: /* @__PURE__ */ jsxs("div", { className: "pm-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "pm-row", children: [
        /* @__PURE__ */ jsxs("label", { style: { fontSize: 12, display: "flex", gap: 5, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: !useInline, onChange: () => setUseInline(false) }),
          "\u5DF2\u4FDD\u5B58\u6570\u636E\u96C6"
        ] }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: "pm-sel",
            style: { flex: 1, minWidth: 180 },
            value: datasetId,
            disabled: useInline,
            onChange: (e) => setDatasetId(e.target.value),
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 \u9009\u62E9 \u2014" }),
              datasets.map((d) => /* @__PURE__ */ jsxs("option", { value: d.id, children: [
                d.name,
                "\uFF08",
                d.count,
                " \u6761\uFF09"
              ] }, d.id))
            ]
          }
        ),
        /* @__PURE__ */ jsxs("label", { style: { fontSize: 12, display: "flex", gap: 5, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: useInline, onChange: () => setUseInline(true) }),
          "\u4E34\u65F6 JSONL"
        ] }),
        /* @__PURE__ */ jsx("button", { className: "pm-btn ghost sm", onClick: () => goTab("datasets"), children: "\u7BA1\u7406\u6570\u636E\u96C6 \u2192" })
      ] }),
      useInline ? /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "pm-ta",
          rows: 5,
          style: { marginTop: 8 },
          value: inlineJsonl,
          placeholder: '\u6BCF\u884C\u4E00\u4E2A\u6837\u672C\u5BF9\u8C61\uFF1A\n{"vars": {"text": "\u4F60\u597D\u4E16\u754C"}}\n\u6216\u76F4\u63A5 {"text": "\u4F60\u597D\u4E16\u754C"}\n\u53EF\u9009 expect \u68C0\u67E5\u5668\uFF1A{"vars": {...}, "expect": [{"type": "json_valid", "extract": true}]}',
          onChange: (e) => setInlineJsonl(e.target.value)
        }
      ) : null,
      parsed && parsed.errors.length ? /* @__PURE__ */ jsxs("div", { className: "pm-warn", children: [
        parsed.errors.length,
        " \u884C\u6709\u95EE\u9898\uFF08\u8FD0\u884C\u65F6\u8DF3\u8FC7\uFF09\uFF1A",
        parsed.errors.slice(0, 3).map((x) => `${x.line}\u884C ${x.msg}`).join("\uFF1B")
      ] }) : null,
      tplWarn.length ? /* @__PURE__ */ jsxs("div", { className: "pm-warn", children: [
        "\u6A21\u677F\u8B66\u544A\uFF1A",
        tplWarn.join("\uFF1B")
      ] }) : null
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "pm-bar" }),
      "\u53D8\u4F53\uFF08\u5217\uFF09",
      /* @__PURE__ */ jsx("span", { className: "pm-hint", children: "\u540C\u4E00\u6A21\u677F\u914D\u591A\u4E2A\u6A21\u578B = \u6A21\u578B\u5BF9\u6BD4\uFF1B\u540C\u4E00\u6A21\u578B\u914D\u4E0D\u540C\u6A21\u677F = \u63D0\u793A\u8BCD A/B" })
    ] }),
    variants.map((v, i) => {
      const p = profiles.find((x) => x.id === v.profileId);
      return /* @__PURE__ */ jsx("div", { className: "pm-card", children: /* @__PURE__ */ jsxs("div", { className: "pm-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "pm-row", style: { marginBottom: 7 }, children: [
          /* @__PURE__ */ jsxs("span", { className: "pm-tag", children: [
            "\u53D8\u4F53 ",
            i + 1
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "pm-inp",
              style: { width: 150 },
              placeholder: `\u540D\u79F0\uFF08\u9ED8\u8BA4\u6863\u6848\u540D\uFF09`,
              value: v.name,
              onChange: (e) => updateVariant(i, { name: e.target.value })
            }
          ),
          /* @__PURE__ */ jsx(
            "select",
            {
              className: "pm-sel",
              style: { flex: 1, minWidth: 160 },
              value: v.profileId,
              onChange: (e) => updateVariant(i, { profileId: e.target.value }),
              children: profiles.length ? profiles.map((p2) => /* @__PURE__ */ jsxs("option", { value: p2.id, children: [
                p2.name,
                "\uFF08",
                p2.model || "\u672A\u8BBE\u6A21\u578B",
                "\uFF09"
              ] }, p2.id)) : /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 \u65E0\u6863\u6848\uFF0C\u5148\u53BB\u300C\u6863\u6848\u300D\u9875 \u2014" })
            }
          ),
          variants.length > 1 ? /* @__PURE__ */ jsx("button", { className: "pm-del", title: "\u5220\u9664\u6B64\u53D8\u4F53", onClick: () => setVariants((vs) => vs.filter((_, j) => j !== i)), children: "\u2715" }) : null
        ] }),
        p ? /* @__PURE__ */ jsxs("div", { className: "pm-sub", style: { marginBottom: 6 }, children: [
          p.baseUrl,
          "\uFF5Ckey ",
          p.keyMask || "\u65E0",
          "\uFF5C",
          p.wire === "anthropic-messages" ? "Anthropic" : "OpenAI",
          " \u7EBF\u8DEF"
        ] }) : null,
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "pm-ta",
            rows: 2,
            style: { marginBottom: 7 },
            placeholder: "\u7CFB\u7EDF\u63D0\u793A\u8BCD\u6A21\u677F\uFF08\u53EF\u9009\uFF0C\u652F\u6301 {{\u53D8\u91CF}}\uFF09",
            value: v.systemTemplate,
            onChange: (e) => updateVariant(i, { systemTemplate: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "pm-ta",
            rows: 3,
            placeholder: "\u7528\u6237\u63D0\u793A\u8BCD\u6A21\u677F\uFF08\u5FC5\u586B\uFF0C\u652F\u6301 {{\u53D8\u91CF}}\uFF09",
            value: v.userTemplate,
            onChange: (e) => updateVariant(i, { userTemplate: e.target.value })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "pm-row", style: { marginTop: 7 }, children: [
          /* @__PURE__ */ jsx("span", { className: "pm-sub", children: "max_tokens" }),
          /* @__PURE__ */ jsx("input", { className: "pm-inp", style: { width: 90 }, value: v.maxTokens, onChange: (e) => updateVariant(i, { maxTokens: e.target.value }) }),
          /* @__PURE__ */ jsx("span", { className: "pm-sub", children: "temperature" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "pm-inp",
              style: { width: 90 },
              placeholder: "\u9ED8\u8BA4",
              value: v.temperature,
              onChange: (e) => updateVariant(i, { temperature: e.target.value })
            }
          )
        ] })
      ] }) }, i);
    }),
    /* @__PURE__ */ jsx("div", { style: { padding: "0 16px 8px" }, children: /* @__PURE__ */ jsx(
      "button",
      {
        className: "pm-btn ghost sm",
        disabled: variants.length >= 8,
        onClick: () => setVariants((vs) => [...vs, newVariant(profiles)]),
        children: "+ \u52A0\u4E00\u4E2A\u53D8\u4F53\uFF08\u22648\uFF09"
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "pm-bar" }),
      "\u6267\u884C\u4E0E\u8BC4\u5224"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "pm-card", children: /* @__PURE__ */ jsxs("div", { className: "pm-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "pm-row", children: [
        /* @__PURE__ */ jsx("span", { className: "pm-sub", children: "\u5E76\u53D1" }),
        /* @__PURE__ */ jsx("select", { className: "pm-sel", value: concurrency, onChange: (e) => setConcurrency(e.target.value), children: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => /* @__PURE__ */ jsx("option", { value: n, children: n }, n)) }),
        /* @__PURE__ */ jsx("span", { className: "pm-sub", children: "\u5931\u8D25\u91CD\u8BD5\uFF08\u9650\u6D41/5xx/\u7F51\u7EDC\uFF09" }),
        /* @__PURE__ */ jsx("select", { className: "pm-sel", value: retries, onChange: (e) => setRetries(e.target.value), children: [0, 1, 2].map((n) => /* @__PURE__ */ jsx("option", { value: n, children: n }, n)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "pm-row", style: { marginTop: 9 }, children: [
        /* @__PURE__ */ jsxs("label", { style: { fontSize: 12, display: "flex", gap: 5, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: useJudge, onChange: (e) => setUseJudge(e.target.checked) }),
          "LLM \u8BC4\u5224\uFF08\u9010\u683C 1-10 \u5206\uFF0C\u989D\u5916 ",
          sampleCount * variants.length,
          " \u6B21\u8C03\u7528\uFF09"
        ] }),
        useJudge ? /* @__PURE__ */ jsxs(
          "select",
          {
            className: "pm-sel",
            style: { flex: 1, minWidth: 160 },
            value: judgeProfileId,
            onChange: (e) => setJudgeProfileId(e.target.value),
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 \u8BC4\u5224\u6863\u6848 \u2014" }),
              profiles.map((p) => /* @__PURE__ */ jsxs("option", { value: p.id, children: [
                p.name,
                "\uFF08",
                p.model,
                "\uFF09"
              ] }, p.id))
            ]
          }
        ) : null
      ] }),
      useJudge ? /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "pm-ta",
          rows: 2,
          style: { marginTop: 7 },
          placeholder: "\u8BC4\u5224\u63D0\u793A\u8BCD\u6A21\u677F\uFF08\u53EF\u9009\uFF1B\u53EF\u7528 {{output}} \u4E0E\u6837\u672C\u53D8\u91CF\uFF1B\u7559\u7A7A\u7528\u5185\u7F6E\u6A21\u677F\uFF09",
          value: judgeTemplate,
          onChange: (e) => setJudgeTemplate(e.target.value)
        }
      ) : null
    ] }) }),
    /* @__PURE__ */ jsxs("div", { style: { padding: "2px 16px 14px" }, children: [
      /* @__PURE__ */ jsxs("div", { className: "pm-sub", style: { marginBottom: 8 }, children: [
        "\u9884\u4F30\uFF1A",
        /* @__PURE__ */ jsxs("b", { style: { color: "#E6EAF2" }, children: [
          sampleCount,
          " \u6837\u672C \xD7 ",
          variants.length,
          " \u53D8\u4F53 = ",
          cellCount,
          " \u683C"
        ] }),
        judgeCells ? ` + ${judgeCells} \u683C\u8BC4\u5224` : "",
        cellCount > 200 ? "\uFF08\u5927\u89C4\u6A21\u8FD0\u884C\uFF1A\u7ED3\u679C\u6295\u5F71\u4F1A\u622A\u65AD\u5C55\u793A\uFF0C\u5168\u6587\u4ECD\u5B8C\u6574\u843D\u76D8\uFF09" : ""
      ] }),
      err ? /* @__PURE__ */ jsx("div", { className: "pm-err", children: err }) : null,
      okMsg ? /* @__PURE__ */ jsx("div", { className: "pm-ok", children: okMsg }) : null,
      running ? /* @__PURE__ */ jsxs("button", { className: "pm-btn danger", disabled: busy, onClick: cancelRun, children: [
        "\u23F9 \u53D6\u6D88\u5F53\u524D\u77E9\u9635\uFF08",
        running.done,
        "/",
        running.total,
        "\uFF09"
      ] }) : /* @__PURE__ */ jsx("button", { className: "pm-btn", disabled: busy || !profiles.length, onClick: startRun, children: "\u25B6 \u53D1\u8D77\u77E9\u9635\u8FD0\u884C" })
    ] })
  ] });
}

// src/DatasetsTab.tsx
var core2 = __toESM(require_matrix_core());
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SAMPLE = `# \u6BCF\u884C\u4E00\u4E2A\u6837\u672C\u5BF9\u8C61\uFF1B# \u5F00\u5934\u4E3A\u6CE8\u91CA\u884C
# \u5F62\u6001\u4E00\uFF1A\u663E\u5F0F vars
{"vars": {"text": "\u4EBA\u5DE5\u667A\u80FD\u6B63\u5728\u6539\u53D8\u4E16\u754C"}}
# \u5F62\u6001\u4E8C\uFF1A\u9876\u5C42\u952E\u76F4\u63A5\u4F5C\u4E3A\u53D8\u91CF
{"text": "\u4ECA\u5929\u5929\u6C14\u600E\u4E48\u6837\uFF1F", "lang": "\u82F1\u8BED"}
# \u5F62\u6001\u4E09\uFF1A\u5E26\u671F\u671B\u68C0\u67E5\u5668\uFF08\u8FD0\u884C\u540E\u9010\u683C\u81EA\u52A8\u9A8C\u8BC1\uFF09
{"vars": {"text": "1+1\u7B49\u4E8E\u51E0\uFF1F\u53EA\u56DE\u7B54\u6570\u5B57"}, "expect": [{"type": "equals", "value": "2"}]}
# \u68C0\u67E5\u5668\u7C7B\u578B\uFF1Acontains / not_contains / regex / json_valid / equals / min_length / max_length
{"vars": {"text": "\u8F93\u51FA\u4E00\u4E2A JSON\uFF1A{\\"city\\": \\"\u5317\u4EAC\\"} \u7684\u57CE\u5E02\u540D"}, "expect": [{"type": "json_valid"}]}
{"vars": {"text": "\u5199\u4E00\u53E5\u5173\u4E8E\u6D77\u7684\u6BD4\u55BB"}, "expect": [{"type": "min_length", "value": 10}, {"type": "not_contains", "value": ["\u62B1\u6B49"]}]}
`;
function DatasetsTab({ datasets, onChanged }) {
  const [name, setName] = useState2("");
  const [jsonl, setJsonl] = useState2("");
  const [editId, setEditId] = useState2("");
  const [err, setErr] = useState2("");
  const [okMsg, setOkMsg] = useState2("");
  const [busy, setBusy] = useState2(false);
  const parsed = useMemo2(() => jsonl.trim() ? core2.parseDataset(jsonl) : null, [jsonl]);
  const save = async () => {
    setErr("");
    setOkMsg("");
    if (!name.trim() && !editId) {
      setErr("\u7ED9\u6570\u636E\u96C6\u8D77\u4E2A\u540D\u5B57");
      return;
    }
    if (!parsed || !parsed.samples.length) {
      setErr("\u6CA1\u6709\u6709\u6548\u6837\u672C\uFF08\u53F3\u4FA7\u9884\u89C8\u533A\u770B\u5177\u4F53\u9519\u8BEF\u884C\uFF09");
      return;
    }
    setBusy(true);
    try {
      const r = await sendCommand("datasets_upsert", { id: editId || void 0, name: name || "\u672A\u547D\u540D\u6570\u636E\u96C6", jsonl }, 15e3);
      if (r.ok) {
        setOkMsg(`\u5DF2\u4FDD\u5B58\uFF1A${r.count} \u6761\u6709\u6548\u6837\u672C${r.errors && r.errors.length ? `\uFF08${r.errors.length} \u884C\u683C\u5F0F\u9519\u8BEF\u4FDD\u7559\u539F\u6587\uFF09` : ""}`);
        if (!editId) {
          setName("");
          setJsonl("");
        }
        setEditId("");
        onChanged();
      } else setErr(r.error || "\u4FDD\u5B58\u5931\u8D25");
    } finally {
      setBusy(false);
    }
  };
  const del = async (id) => {
    if (!window.confirm("\u5220\u9664\u8BE5\u6570\u636E\u96C6\uFF1F")) return;
    setBusy(true);
    try {
      const r = await sendCommand("datasets_delete", { id }, 15e3);
      if (!r.ok) setErr(r.error || "\u5220\u9664\u5931\u8D25");
      else {
        if (editId === id) {
          setEditId("");
          setJsonl("");
          setName("");
        }
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };
  const edit = async (d) => {
    setErr("");
    setOkMsg("");
    const full = await kvGet(`pmtx.dataset.${d.id}`);
    if (full && full.jsonl != null) {
      setEditId(d.id);
      setName(full.name);
      setJsonl(full.jsonl);
    } else {
      setErr("\u6570\u636E\u96C6\u5168\u6587\u8BFB\u53D6\u5931\u8D25");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "pm-bar" }),
      editId ? `\u7F16\u8F91\u6570\u636E\u96C6\uFF08${editId}\uFF09` : "\u65B0\u5EFA\u6570\u636E\u96C6",
      /* @__PURE__ */ jsx2("span", { className: "pm-hint", children: "JSONL\uFF1A\u4E00\u884C\u4E00\u4E2A\u6837\u672C\uFF0C{{\u53D8\u91CF}} \u5728\u6A21\u677F\u91CC\u63D2\u503C" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "pm-card", children: /* @__PURE__ */ jsxs2("div", { className: "pm-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "pm-row", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "pm-inp",
            style: { width: 200 },
            placeholder: "\u6570\u636E\u96C6\u540D\u79F0",
            value: name,
            onChange: (e) => setName(e.target.value)
          }
        ),
        editId ? /* @__PURE__ */ jsx2("button", { className: "pm-btn ghost sm", onClick: () => {
          setEditId("");
          setName("");
          setJsonl("");
        }, children: "\u53D6\u6D88\u7F16\u8F91" }) : null
      ] }),
      /* @__PURE__ */ jsx2(
        "textarea",
        {
          className: "pm-ta",
          rows: 9,
          value: jsonl,
          placeholder: SAMPLE,
          onChange: (e) => setJsonl(e.target.value)
        }
      ),
      parsed ? /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs2("span", { className: "pm-pill ok", style: { marginRight: 6 }, children: [
          "\u6709\u6548\u6837\u672C ",
          parsed.samples.length
        ] }),
        parsed.errors.length ? /* @__PURE__ */ jsxs2("span", { className: "pm-pill bad", children: [
          "\u9519\u8BEF\u884C ",
          parsed.errors.length
        ] }) : null,
        parsed.errors.length ? /* @__PURE__ */ jsx2("div", { className: "pm-warn", style: { marginTop: 6 }, children: parsed.errors.slice(0, 5).map((x, i) => /* @__PURE__ */ jsxs2("div", { children: [
          x.line ? `\u7B2C ${x.line} \u884C\uFF1A` : "",
          x.msg
        ] }, i)) }) : null,
        parsed.samples.length && parsed.samples.some((s) => s.checks.length) ? /* @__PURE__ */ jsxs2("div", { className: "pm-sub", style: { marginTop: 5 }, children: [
          "\u542B\u68C0\u67E5\u5668\u6837\u672C ",
          parsed.samples.filter((s) => s.checks.length).length,
          " \u6761\u2014\u2014\u8FD0\u884C\u540E\u9010\u683C\u81EA\u52A8\u9A8C\u8BC1"
        ] }) : null
      ] }) : null,
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx2("button", { className: "pm-btn", disabled: busy, onClick: save, children: editId ? "\u4FDD\u5B58\u4FEE\u6539" : "\u4FDD\u5B58\u6570\u636E\u96C6" }) }),
      err ? /* @__PURE__ */ jsx2("div", { className: "pm-err", children: err }) : null,
      okMsg ? /* @__PURE__ */ jsx2("div", { className: "pm-ok", children: okMsg }) : null
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "pm-bar" }),
      "\u5DF2\u4FDD\u5B58\uFF08",
      datasets.length,
      "\uFF09"
    ] }),
    datasets.length ? /* @__PURE__ */ jsx2("div", { className: "pm-card", children: /* @__PURE__ */ jsx2("div", { className: "pm-card-b", style: { padding: 0 }, children: /* @__PURE__ */ jsxs2("table", { className: "pm-tbl", children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("th", { children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx2("th", { children: "\u6837\u672C" }),
        /* @__PURE__ */ jsx2("th", { children: "\u66F4\u65B0" }),
        /* @__PURE__ */ jsx2("th", { style: { width: 110 } })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: datasets.map((d) => /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsxs2("td", { children: [
          /* @__PURE__ */ jsx2("b", { children: d.name }),
          /* @__PURE__ */ jsx2("div", { className: "pm-sub", children: d.id })
        ] }),
        /* @__PURE__ */ jsxs2("td", { children: [
          d.count,
          d.errCount ? /* @__PURE__ */ jsxs2("span", { className: "pm-pill warn", style: { marginLeft: 5 }, children: [
            d.errCount,
            " \u9519\u8BEF\u884C"
          ] }) : null
        ] }),
        /* @__PURE__ */ jsx2("td", { className: "pm-sub", children: String(d.updatedAt || "").replace("T", " ").slice(0, 16) }),
        /* @__PURE__ */ jsxs2("td", { children: [
          /* @__PURE__ */ jsx2("button", { className: "pm-btn ghost sm", style: { marginRight: 5 }, onClick: () => edit(d), children: "\u7F16\u8F91" }),
          /* @__PURE__ */ jsx2("button", { className: "pm-btn danger sm", onClick: () => del(d.id), children: "\u5220" })
        ] })
      ] }, d.id)) })
    ] }) }) }) : /* @__PURE__ */ jsx2("div", { className: "pm-empty", children: "\u8FD8\u6CA1\u6709\u6570\u636E\u96C6\u3002\u7528\u4E0A\u65B9\u7F16\u8F91\u5668\u521B\u5EFA\uFF0C\u6216\u5728\u300C\u8FD0\u884C\u300D\u9875\u4E34\u65F6\u7C98\u8D34 JSONL\u3002" })
  ] });
}

// src/ResultsTab.tsx
var core3 = __toESM(require_matrix_core());
import { useCallback, useEffect, useState as useState3 } from "react";
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function fmtMs(ms) {
  if (ms == null) return "\u2014";
  if (ms >= 1e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
function statusPill(c) {
  if (c.status === "pending") return /* @__PURE__ */ jsx3("span", { className: "pm-pill info", children: "\u5F85\u8DD1" });
  if (c.status === "running") return /* @__PURE__ */ jsx3("span", { className: "pm-pill info", children: "\u8DD1\u4E2D" });
  if (c.status === "aborted") return /* @__PURE__ */ jsx3("span", { className: "pm-pill warn", children: "\u5DF2\u4E2D\u6B62" });
  if (!c.ok) return /* @__PURE__ */ jsxs3("span", { className: "pm-pill bad", title: c.error && c.error.cn || "", children: [
    "\u2717 ",
    c.error && c.error.cn || "\u5931\u8D25"
  ] });
  const badChecks = (c.checks || []).filter((x) => !x.pass).length;
  return /* @__PURE__ */ jsxs3("span", { className: "pm-pill ok", children: [
    "\u2713",
    c.judge ? ` J${c.judge.score}` : "",
    badChecks ? ` \u68C0\u2717${badChecks}` : (c.checks || []).length ? " \u68C0\u2713" : "",
    c.annotated === "up" ? " \u{1F44D}" : c.annotated === "down" ? " \u{1F44E}" : ""
  ] });
}
function ResultsTab({ running, openRunId, onChanged, goTab, onSendToChat }) {
  const [run, setRun] = useState3(null);
  const [selRunId, setSelRunId] = useState3("");
  const [err, setErr] = useState3("");
  const [cellModal, setCellModal] = useState3(null);
  const [diffTarget, setDiffTarget] = useState3("");
  const [diffSegs, setDiffSegs] = useState3(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const m = await loadMeta().catch(() => null);
      if (stop) return;
      if (!m || !m.running) {
        const r = await fetchRun(selRunId || "latest").catch(() => null);
        if (!stop) {
          if (r) {
            setRun(r);
            setSelRunId(r.runId);
            onChanged();
          }
          stop = true;
        }
      }
    };
    if (running) {
      const t = setInterval(tick, 2500);
      return () => {
        stop = true;
        clearInterval(t);
      };
    }
    return () => {
      stop = true;
    };
  }, [running, selRunId, onChanged]);
  const loadRun = useCallback(async (id) => {
    setErr("");
    const r = await fetchRun(id).catch((e) => {
      setErr(String(e.message || e));
      return null;
    });
    if (r) {
      setRun(r);
      setSelRunId(r.runId);
    } else if (!r) setErr("\u7ED3\u679C\u8BFB\u53D6\u5931\u8D25\uFF08\u53EF\u80FD\u5DF2\u88AB\u6E05\u7406\uFF0C\u4EC5\u4FDD\u7559\u6700\u8FD1 10 \u4EFD\uFF09");
  }, []);
  useEffect(() => {
    if (!running && !run) loadRun("latest");
  }, [running, run, loadRun]);
  useEffect(() => {
    if (openRunId) loadRun(openRunId);
  }, [openRunId, loadRun]);
  const openCell = async (c, full) => {
    if (!run) return;
    if (!full) {
      setCellModal({ cell: c, full: false });
      setDiffTarget("");
      setDiffSegs(null);
      return;
    }
    const r = await fetchCell(run.runId, c.cellId);
    if (r && r.cell) setCellModal({ cell: r.cell, vars: r.vars, full: true });
    else setCellModal({ cell: c, full: false });
  };
  const doDiff = async (otherCellId) => {
    if (!run || !cellModal) return;
    setDiffTarget(otherCellId);
    setDiffSegs(null);
    const other = run.cells.find((c) => c.cellId === otherCellId);
    if (!other) return;
    const [a, b] = await Promise.all([
      fetchCell(run.runId, cellModal.cell.cellId),
      fetchCell(run.runId, otherCellId)
    ]);
    const ta = (a && a.cell ? a.cell.content : cellModal.cell.content) || "";
    const tb = (b && b.cell ? b.cell.content : other.content) || "";
    setDiffSegs(core3.textDiff(ta, tb));
  };
  const doAnnotate = async (c, verdict) => {
    if (!run) return;
    const next = c.annotated === verdict ? null : verdict;
    const okRes = await annotate(run.runId, c.cellId, next);
    if (okRes) {
      setRun((r) => r ? {
        ...r,
        cells: r.cells.map((x) => x.cellId === c.cellId ? { ...x, annotated: next } : x)
      } : r);
    } else setErr("\u6807\u6CE8\u5199\u5165\u5931\u8D25");
  };
  const exportMd = () => {
    if (!run) return;
    const d = run.def;
    const lines = [];
    lines.push(`# \u63D0\u793A\u8BCD\u77E9\u9635\u62A5\u544A\uFF1A${d.datasetName}`);
    lines.push("");
    lines.push(`- runId: \`${run.runId}\`\uFF5C\u72B6\u6001 ${run.status}\uFF5C${run.startedAt ? run.startedAt.replace("T", " ").slice(0, 16) : ""} \u8D77`);
    lines.push(`- \u53D8\u4F53\uFF1A${d.variants.map((v) => v.name).join(" / ")}${d.judge ? `\uFF5Cjudge\uFF1A${d.judge.profileName || d.judge.profileId}` : ""}`);
    lines.push(`- tokens\uFF1Ain ${run.cost.tokIn} / out ${run.cost.tokOut}${run.cost.est != null ? `\uFF5C\u4F30\u7B97 $${run.cost.est}` : ""}`);
    lines.push("");
    lines.push("| \u53D8\u4F53 | \u6210\u529F | \u68C0\u67E5\u5168\u8FC7 | judge \u5747\u5206 | \u5747\u65F6 | tokens(in/out) |");
    lines.push("|---|---|---|---|---|---|");
    for (const v of run.aggregates.variants) {
      const name = d.variants[v.idx]?.name || `\u53D8\u4F53${v.idx + 1}`;
      lines.push(`| ${name} | ${v.ok}/${v.total} | ${v.checkAllPass}${v.ok ? `/${v.ok}` : ""} | ${v.judgeAvg != null ? `${v.judgeAvg}(${v.judgeN}\u683C)` : "\u2014"} | ${fmtMs(v.avgMs)} | ${v.tokIn}/${v.tokOut} |`);
    }
    lines.push("");
    lines.push("## \u77E9\u9635\u660E\u7EC6");
    run.sampleSummaries.forEach((s, si) => {
      lines.push("");
      lines.push(`### \u6837\u672C ${si + 1}\uFF1A${s.label}`);
      for (const v of d.variants) {
        const c = run.cells.find((x) => x.sampleIdx === si && x.variantIdx === v.idx);
        lines.push("");
        lines.push(`**${v.name}**\uFF1A${c ? c.ok ? `\u2713 ${fmtMs(c.ms)}${c.judge ? `\uFF5Cjudge ${c.judge.score}/10` : ""}` : `\u2717 ${c.error && c.error.cn || "\u5931\u8D25"}` : "\u2014"}`);
        if (c && c.ok) lines.push("", "```", c.content || "(\u7A7A\u8F93\u51FA)", "```");
      }
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prompt-matrix-${run.runId}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const sendSummary = async () => {
    if (!run || !onSendToChat) return;
    const d = run.def;
    const t = run.aggregates.totals;
    const vLines = run.aggregates.variants.map((v) => {
      const name = d.variants[v.idx]?.name || `\u53D8\u4F53${v.idx + 1}`;
      return `- ${name}\uFF1A${v.ok}/${v.total} \u6210\u529F${v.judgeAvg != null ? `\uFF0Cjudge \u5747 ${v.judgeAvg}/10` : ""}\uFF0C\u5747\u65F6 ${fmtMs(v.avgMs)}`;
    });
    const msg = `\u3010\u63D0\u793A\u8BCD\u77E9\u9635\u53F0\u3011\u8FD0\u884C ${run.runId}\uFF08\u6570\u636E\u96C6\uFF1A${d.datasetName}\uFF09\u7ED3\u679C\u6C47\u603B\uFF1A${t.ok}/${t.cells} \u683C\u6210\u529F\uFF0Ctokens in/out ${run.cost.tokIn}/${run.cost.tokOut}\u3002\u6309\u53D8\u4F53\uFF1A
${vLines.join("\n")}`;
    await onSendToChat(msg);
  };
  if (running) {
    const pct = running.total ? Math.round((running.done + running.judgeDone) / (running.total + running.judgeTotal) * 100) : 0;
    return /* @__PURE__ */ jsxs3("div", { className: "pm-empty", children: [
      "\u77E9\u9635\u6267\u884C\u4E2D\uFF1A",
      running.phase === "judge" ? `LLM \u8BC4\u5224 ${running.judgeDone}/${running.judgeTotal}` : `${running.done}/${running.total} \u683C`,
      /* @__PURE__ */ jsx3("div", { className: "pm-prog-bar", style: { margin: "12px auto", maxWidth: 420 }, children: /* @__PURE__ */ jsx3("div", { className: "pm-prog-in", style: { width: `${pct}%` } }) }),
      "\u6570\u636E\u96C6\uFF1A",
      running.datasetName,
      "\uFF5C\u5DF2 ",
      Math.round(running.elapsedMs / 1e3),
      "s"
    ] });
  }
  const agg = run?.aggregates;
  const variants = run?.def.variants || [];
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "pm-bar" }),
      "\u8FD0\u884C\u7ED3\u679C",
      run ? /* @__PURE__ */ jsxs3("span", { className: "pm-hint", children: [
        run.def.datasetName,
        "\uFF5C",
        run.status === "aborted" ? "\u5DF2\u4E2D\u6B62" : run.status === "error" ? "\u51FA\u9519" : "\u5B8C\u6210",
        "\uFF5C",
        String(run.startedAt || "").replace("T", " ").slice(0, 16)
      ] }) : null
    ] }),
    err ? /* @__PURE__ */ jsx3("div", { className: "pm-err", children: err }) : null,
    !run ? /* @__PURE__ */ jsx3("div", { className: "pm-empty", children: "\u8FD8\u6CA1\u6709\u7ED3\u679C\u3002\u53BB\u300C\u8FD0\u884C\u300D\u9875\u53D1\u8D77\u4E00\u6B21\u77E9\u9635\uFF0C\u6216\u4ECE\u300C\u5386\u53F2\u300D\u9875\u8BFB\u65E7\u7ED3\u679C\u3002" }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsx3("div", { className: "pm-card", children: /* @__PURE__ */ jsxs3("div", { className: "pm-card-b", children: [
        /* @__PURE__ */ jsxs3("div", { className: "pm-row", style: { marginBottom: 8 }, children: [
          /* @__PURE__ */ jsxs3("span", { className: "pm-kv", children: [
            "\u683C\u5B50 ",
            /* @__PURE__ */ jsx3("b", { children: agg?.totals.ok ?? 0 }),
            "/",
            agg?.totals.cells ?? 0,
            agg?.totals.failed ? /* @__PURE__ */ jsxs3("span", { style: { color: "#F85149" }, children: [
              "\uFF08\u5931\u8D25 ",
              agg.totals.failed,
              "\uFF09"
            ] }) : null
          ] }),
          /* @__PURE__ */ jsxs3("span", { className: "pm-kv", children: [
            "tokens ",
            /* @__PURE__ */ jsx3("b", { children: run.cost.tokIn }),
            "/",
            /* @__PURE__ */ jsx3("b", { children: run.cost.tokOut })
          ] }),
          run.cost.est != null ? /* @__PURE__ */ jsxs3("span", { className: "pm-kv", children: [
            "\u4F30\u7B97 ",
            /* @__PURE__ */ jsxs3("b", { children: [
              "$",
              run.cost.est
            ] })
          ] }) : null,
          run.def.judge ? /* @__PURE__ */ jsxs3("span", { className: "pm-tag", children: [
            "judge\uFF1A",
            run.def.judge.profileName || run.def.judge.profileId
          ] }) : null,
          !run.fileSaved ? /* @__PURE__ */ jsx3("span", { className: "pm-pill warn", children: "\u7ED3\u679C\u6587\u4EF6\u672A\u843D\u76D8\uFF08\u5168\u6587\u8BE6\u60C5\u4E0D\u53EF\u7528\uFF09" }) : null,
          /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx3("button", { className: "pm-btn ghost sm", onClick: exportMd, children: "\u5BFC\u51FA Markdown" }),
          onSendToChat ? /* @__PURE__ */ jsx3("button", { className: "pm-btn ghost sm", onClick: sendSummary, children: "\u53D1\u6C47\u603B\u5230\u804A\u5929" }) : null
        ] }),
        /* @__PURE__ */ jsxs3("table", { className: "pm-tbl", children: [
          /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("th", { children: "\u53D8\u4F53" }),
            /* @__PURE__ */ jsx3("th", { children: "\u6210\u529F" }),
            /* @__PURE__ */ jsx3("th", { children: "\u68C0\u67E5\u5168\u8FC7" }),
            /* @__PURE__ */ jsx3("th", { children: "judge" }),
            /* @__PURE__ */ jsx3("th", { children: "\u5747\u65F6" }),
            /* @__PURE__ */ jsx3("th", { children: "tok in/out" })
          ] }) }),
          /* @__PURE__ */ jsx3("tbody", { children: (agg?.variants || []).map((v) => /* @__PURE__ */ jsxs3("tr", { children: [
            /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("b", { children: variants[v.idx]?.name || `\u53D8\u4F53${v.idx + 1}` }) }),
            /* @__PURE__ */ jsxs3("td", { children: [
              v.ok,
              "/",
              v.total,
              v.failed ? /* @__PURE__ */ jsxs3("span", { style: { color: "#F85149" }, children: [
                "\uFF08\u2717",
                v.failed,
                "\uFF09"
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxs3("td", { children: [
              v.checkAllPass,
              v.ok ? `/${v.ok}` : ""
            ] }),
            /* @__PURE__ */ jsx3("td", { children: v.judgeAvg != null ? /* @__PURE__ */ jsx3("b", { children: v.judgeAvg }) : "\u2014" }),
            /* @__PURE__ */ jsx3("td", { children: fmtMs(v.avgMs) }),
            /* @__PURE__ */ jsxs3("td", { children: [
              v.tokIn,
              "/",
              v.tokOut
            ] })
          ] }, v.idx)) })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs3("div", { className: "pm-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "pm-bar" }),
        "\u77E9\u9635\uFF08\u884C=\u6837\u672C\uFF0C\u5217=\u53D8\u4F53\uFF09",
        /* @__PURE__ */ jsx3("span", { className: "pm-hint", children: "\u70B9\u683C\u5B50\u770B\u5168\u6587/\u68C0\u67E5/judge/diff" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "pm-card", children: /* @__PURE__ */ jsx3("div", { className: "pm-card-b", style: { padding: 0, overflowX: "auto" }, children: /* @__PURE__ */ jsxs3("table", { className: "pm-tbl", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("th", { style: { minWidth: 140 }, children: "\u6837\u672C" }),
          variants.map((v) => /* @__PURE__ */ jsx3("th", { style: { minWidth: 180 }, children: v.name }, v.idx))
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: run.sampleSummaries.map((s, si) => /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsxs3("td", { className: "pm-sub", style: { maxWidth: 200, wordBreak: "break-all" }, children: [
            s.label,
            s.checks.length ? /* @__PURE__ */ jsxs3("span", { className: "pm-tag", style: { marginLeft: 4 }, children: [
              "\u68C0\u67E5\xD7",
              s.checks.length
            ] }) : null
          ] }),
          variants.map((v) => {
            const c = run.cells.find((x) => x.sampleIdx === si && x.variantIdx === v.idx);
            if (!c) return /* @__PURE__ */ jsx3("td", { children: "\u2014" }, v.idx);
            return /* @__PURE__ */ jsxs3("td", { children: [
              statusPill(c),
              /* @__PURE__ */ jsxs3(
                "button",
                {
                  className: "pm-cellbtn",
                  style: { marginTop: 4 },
                  title: "\u67E5\u770B\u8BE6\u60C5",
                  onClick: () => openCell(c, true),
                  children: [
                    (c.content || c.error && c.error.hint || "").slice(0, 90) || "\uFF08\u7A7A\uFF09",
                    c.truncated ? "\u2026" : ""
                  ]
                }
              ),
              /* @__PURE__ */ jsx3("div", { className: "pm-sub", children: c.ok ? `${fmtMs(c.ms)}${c.attempts && c.attempts > 1 ? ` \xB7 \u91CD\u8BD5${c.attempts - 1}` : ""}` : "" })
            ] }, v.idx);
          })
        ] }, si)) })
      ] }) }) })
    ] }),
    cellModal ? /* @__PURE__ */ jsx3("div", { className: "pm-modal-bg", onClick: () => setCellModal(null), children: /* @__PURE__ */ jsxs3("div", { className: "pm-modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs3("div", { className: "pm-modal-h", children: [
        "\u683C\u5B50 ",
        cellModal.cell.cellId,
        statusPill(cellModal.cell),
        /* @__PURE__ */ jsxs3("span", { className: "pm-sub", children: [
          fmtMs(cellModal.cell.ms),
          cellModal.cell.attempts && cellModal.cell.attempts > 1 ? ` \xB7 \u91CD\u8BD5${cellModal.cell.attempts - 1} \u6B21` : ""
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "pm-x", onClick: () => setCellModal(null), children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "pm-modal-b", children: [
        cellModal.cell.templateWarnings && cellModal.cell.templateWarnings.length ? /* @__PURE__ */ jsxs3("div", { className: "pm-warn", style: { padding: "0 0 8px" }, children: [
          "\u6A21\u677F\u8B66\u544A\uFF1A",
          cellModal.cell.templateWarnings.join("\uFF1B")
        ] }) : null,
        cellModal.cell.error ? /* @__PURE__ */ jsxs3("div", { className: "pm-err", style: { padding: "0 0 8px" }, children: [
          "\u2717 ",
          cellModal.cell.error.cn,
          "\uFF08",
          cellModal.cell.error.code,
          "\uFF09\uFF5C",
          cellModal.cell.error.hint
        ] }) : null,
        (cellModal.cell.checks || []).length ? /* @__PURE__ */ jsx3("div", { style: { marginBottom: 9 }, children: (cellModal.cell.checks || []).map((ck, i) => /* @__PURE__ */ jsxs3("div", { className: "pm-sub", style: { marginBottom: 3 }, children: [
          ck.pass ? "\u2705" : "\u274C",
          " ",
          /* @__PURE__ */ jsx3("b", { style: { color: "#E6EAF2" }, children: ck.label || ck.type }),
          "\uFF1A",
          ck.detail
        ] }, i)) }) : null,
        cellModal.cell.judge ? /* @__PURE__ */ jsxs3("div", { style: { marginBottom: 9 }, children: [
          /* @__PURE__ */ jsxs3("span", { className: "pm-pill info", children: [
            "judge ",
            cellModal.cell.judge.score,
            "/10"
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "pm-sub", style: { marginLeft: 7 }, children: cellModal.cell.judge.reason })
        ] }) : null,
        cellModal.cell.judgeError ? /* @__PURE__ */ jsxs3("div", { className: "pm-warn", style: { padding: "0 0 8px" }, children: [
          "judge \u5931\u8D25\uFF1A",
          cellModal.cell.judgeError
        ] }) : null,
        cellModal.cell.usage ? /* @__PURE__ */ jsxs3("div", { className: "pm-sub", style: { marginBottom: 6 }, children: [
          "tokens\uFF1Ain ",
          cellModal.cell.usage.prompt_tokens ?? "?",
          " / out ",
          cellModal.cell.usage.completion_tokens ?? "?",
          cellModal.cell.finishReason ? `\uFF5Cfinish=${cellModal.cell.finishReason}` : ""
        ] }) : null,
        /* @__PURE__ */ jsx3("pre", { className: "pm-pre", children: cellModal.cell.content || (cellModal.cell.ok ? "\uFF08\u7A7A\u8F93\u51FA\uFF09" : "\uFF08\u65E0\u8F93\u51FA\u2014\u2014\u89C1\u9519\u8BEF\u4FE1\u606F\uFF09") }),
        cellModal.cell.truncated ? /* @__PURE__ */ jsx3("div", { className: "pm-sub", style: { padding: "5px 0" }, children: "\uFF08\u5C55\u793A\u5DF2\u622A\u65AD\uFF0C\u5168\u6587\u89C1\u5BFC\u51FA/\u843D\u76D8\u6587\u4EF6\uFF09" }) : null,
        /* @__PURE__ */ jsxs3("div", { className: "pm-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx3(
            "button",
            {
              className: `pm-btn sm ${cellModal.cell.annotated === "up" ? "green" : "ghost"}`,
              onClick: () => doAnnotate(cellModal.cell, "up"),
              children: "\u{1F44D} \u597D"
            }
          ),
          /* @__PURE__ */ jsx3(
            "button",
            {
              className: `pm-btn sm ${cellModal.cell.annotated === "down" ? "danger" : "ghost"}`,
              onClick: () => doAnnotate(cellModal.cell, "down"),
              children: "\u{1F44E} \u5DEE"
            }
          ),
          run && run.def.variants.length > 1 ? /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx3("span", { className: "pm-sub", children: "\u5BF9\u6BD4\uFF08\u5B57\u7EA7 diff\uFF09\u2192" }),
            /* @__PURE__ */ jsxs3("select", { className: "pm-sel", value: diffTarget, onChange: (e) => doDiff(e.target.value), children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: "\u9009\u540C\u6837\u672C\u53E6\u4E00\u53D8\u4F53" }),
              run.def.variants.filter((v) => v.idx !== cellModal.cell.variantIdx).map((v) => /* @__PURE__ */ jsx3("option", { value: `r${cellModal.cell.sampleIdx}c${v.idx}`, children: v.name }, v.idx))
            ] })
          ] }) : null
        ] }),
        diffSegs ? /* @__PURE__ */ jsxs3("div", { style: { marginTop: 9 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "pm-sub", style: { marginBottom: 5 }, children: [
            "\u4E0E\u300C",
            run?.def.variants.find((v) => `r${cellModal.cell.sampleIdx}c${v.idx}` === diffTarget)?.name,
            "\u300D\u5BF9\u6BD4\uFF08",
            /* @__PURE__ */ jsx3("span", { className: "pm-diff-del", style: { padding: "0 3px" }, children: "\u672C\u683C\u72EC\u6709" }),
            " / ",
            /* @__PURE__ */ jsx3("span", { className: "pm-diff-add", style: { padding: "0 3px" }, children: "\u5BF9\u65B9\u72EC\u6709" }),
            "\uFF09\uFF1A"
          ] }),
          /* @__PURE__ */ jsx3("pre", { className: "pm-pre", style: { maxHeight: 260 }, children: diffSegs.map((seg, i) => /* @__PURE__ */ jsx3("span", { className: seg.t === "same" ? "pm-diff-same" : seg.t === "del" ? "pm-diff-del" : "pm-diff-add", children: seg.s }, i)) })
        ] }) : null
      ] })
    ] }) }) : null
  ] });
}

// src/ProfilesTab.tsx
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function ProfilesTab({ profiles, onChanged }) {
  const [name, setName] = useState4("");
  const [baseUrl, setBaseUrl] = useState4("");
  const [apiKey, setApiKey] = useState4("");
  const [model, setModel] = useState4("");
  const [wire, setWire] = useState4("openai-chat-completions");
  const [allowEmpty, setAllowEmpty] = useState4(false);
  const [err, setErr] = useState4("");
  const [okMsg, setOkMsg] = useState4("");
  const [busy, setBusy] = useState4(false);
  const importHost = async () => {
    setErr("");
    setOkMsg("");
    setBusy(true);
    try {
      const r = await sendCommand("import_host", {}, 2e4);
      if (r.ok) setOkMsg(`\u5BFC\u5165\u5B8C\u6210\uFF1A\u65B0\u589E/\u66F4\u65B0 ${r.imported} \u6761\uFF0C\u5171 ${r.total} \u6761\u6863\u6848`);
      else setErr(r.error || "\u5BFC\u5165\u5931\u8D25");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const addManual = async () => {
    setErr("");
    setOkMsg("");
    if (!baseUrl.trim()) {
      setErr("baseUrl \u5FC5\u586B");
      return;
    }
    if (!apiKey.trim() && !allowEmpty) {
      setErr("apiKey \u5FC5\u586B\uFF08\u672C\u5730\u65E0\u9274\u6743\u7AEF\u70B9\u53EF\u52FE\u9009\u5141\u8BB8\u7A7A key\uFF09");
      return;
    }
    setBusy(true);
    try {
      const r = await sendCommand("profiles_upsert", {
        profile: { name: name || "\u624B\u52A8\u6863\u6848", baseUrl, apiKey, model, wire },
        allowEmptyKey: allowEmpty
      }, 15e3);
      if (r.ok) {
        setOkMsg(`\u5DF2\u6DFB\u52A0\u6863\u6848 ${r.id}${r.savedToFile ? "" : "\uFF08\u26A0 \u672C\u5730\u6587\u4EF6\u4FDD\u5B58\u5931\u8D25\uFF0C\u91CD\u542F\u540E\u4E22\u5931\uFF09"}`);
        setName("");
        setBaseUrl("");
        setApiKey("");
        setModel("");
        onChanged();
      } else setErr(r.error || "\u6DFB\u52A0\u5931\u8D25");
    } finally {
      setBusy(false);
    }
  };
  const del = async (p) => {
    const force = p.source === "host" ? window.confirm("\u5BBF\u4E3B\u5BFC\u5165\u6863\u6848\uFF1A\u5220\u9664\u540E\u91CD\u65B0\u5BFC\u5165\u5BBF\u4E3B\u4F1A\u518D\u6B21\u51FA\u73B0\uFF0C\u786E\u8BA4\u5220\u9664\uFF1F") : window.confirm(`\u5220\u9664\u6863\u6848\u300C${p.name}\u300D\uFF1F`);
    if (!force) return;
    setBusy(true);
    try {
      const r = await sendCommand("profiles_delete", { id: p.id, force: true }, 15e3);
      if (!r.ok) setErr(r.error || "\u5220\u9664\u5931\u8D25");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "pm-bar" }),
      "\u6A21\u578B\u6863\u6848\uFF08",
      profiles.length,
      "\uFF09",
      /* @__PURE__ */ jsx4("span", { className: "pm-hint", children: "\u5B8C\u6574 key \u53EA\u5B58\u5728\u670D\u52A1\u672C\u5730\u6587\u4EF6\uFF0C\u4E00\u5207\u5C55\u793A\u5747\u63A9\u7801" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { style: { padding: "0 16px 8px" }, children: [
      /* @__PURE__ */ jsx4("button", { className: "pm-btn green", disabled: busy, onClick: importHost, children: "\u2B07 \u5BFC\u5165\u5BBF\u4E3B\u5DF2\u914D\u7F6E\u7684\u4F9B\u5E94\u5546" }),
      /* @__PURE__ */ jsx4("span", { className: "pm-sub", style: { marginLeft: 8 }, children: "\u5BBF\u4E3B\u300C\u6A21\u578B\u670D\u52A1\u300D\u91CC\u914D\u8FC7\u7684\u7AEF\u70B9\u81EA\u52A8\u6210\u4E3A\u53EF\u8BC4\u6D4B\u6863\u6848\uFF0C\u96F6\u91CD\u5F55" })
    ] }),
    profiles.length ? /* @__PURE__ */ jsx4("div", { className: "pm-card", children: /* @__PURE__ */ jsx4("div", { className: "pm-card-b", style: { padding: 0 }, children: /* @__PURE__ */ jsxs4("table", { className: "pm-tbl", children: [
      /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("th", { children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx4("th", { children: "\u7AEF\u70B9 / \u6A21\u578B" }),
        /* @__PURE__ */ jsx4("th", { children: "\u7EBF\u8DEF" }),
        /* @__PURE__ */ jsx4("th", { children: "key" }),
        /* @__PURE__ */ jsx4("th", { children: "\u6765\u6E90" }),
        /* @__PURE__ */ jsx4("th", {})
      ] }) }),
      /* @__PURE__ */ jsx4("tbody", { children: profiles.map((p) => /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("td", { children: /* @__PURE__ */ jsx4("b", { children: p.name }) }),
        /* @__PURE__ */ jsxs4("td", { className: "pm-sub", style: { maxWidth: 240, wordBreak: "break-all" }, children: [
          p.baseUrl,
          /* @__PURE__ */ jsx4("br", {}),
          p.model || "\uFF08\u672A\u8BBE\u6A21\u578B\uFF09"
        ] }),
        /* @__PURE__ */ jsx4("td", { className: "pm-sub", children: p.wire === "anthropic-messages" ? "Anthropic" : "OpenAI" }),
        /* @__PURE__ */ jsx4("td", { className: "pm-sub", children: p.keyMask || "\u65E0" }),
        /* @__PURE__ */ jsx4("td", { children: /* @__PURE__ */ jsx4("span", { className: "pm-tag", children: p.source === "host" ? "\u5BBF\u4E3B" : "\u624B\u52A8" }) }),
        /* @__PURE__ */ jsx4("td", { children: /* @__PURE__ */ jsx4("button", { className: "pm-btn danger sm", onClick: () => del(p), children: "\u5220" }) })
      ] }, p.id)) })
    ] }) }) }) : /* @__PURE__ */ jsx4("div", { className: "pm-empty", children: "\u8FD8\u6CA1\u6709\u6863\u6848\u3002\u70B9\u4E0A\u65B9\u300C\u5BFC\u5165\u5BBF\u4E3B\u4F9B\u5E94\u5546\u300D\uFF0C\u6216\u624B\u52A8\u6DFB\u52A0\u7AEF\u70B9\u3002" }),
    /* @__PURE__ */ jsxs4("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "pm-bar" }),
      "\u624B\u52A8\u6DFB\u52A0\u6863\u6848"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "pm-card", children: /* @__PURE__ */ jsxs4("div", { className: "pm-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "pm-row", style: { marginBottom: 7 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "pm-inp", style: { width: 150 }, placeholder: "\u540D\u79F0", value: name, onChange: (e) => setName(e.target.value) }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "pm-inp",
            style: { flex: 1, minWidth: 180 },
            placeholder: "baseUrl\uFF08\u5982 https://api.deepseek.com \u6216 http://127.0.0.1:11434\uFF09",
            value: baseUrl,
            onChange: (e) => setBaseUrl(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "pm-row", style: { marginBottom: 7 }, children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "pm-inp",
            style: { flex: 1, minWidth: 160 },
            placeholder: "apiKey\uFF08sk-\u2026\uFF0C\u53EA\u5B58\u670D\u52A1\u672C\u5730\u6587\u4EF6\uFF09",
            value: apiKey,
            onChange: (e) => setApiKey(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "pm-inp",
            style: { width: 170 },
            placeholder: "\u6A21\u578B\u540D\uFF08\u5982 deepseek-chat\uFF09",
            value: model,
            onChange: (e) => setModel(e.target.value)
          }
        ),
        /* @__PURE__ */ jsxs4("select", { className: "pm-sel", value: wire, onChange: (e) => setWire(e.target.value), children: [
          /* @__PURE__ */ jsx4("option", { value: "openai-chat-completions", children: "OpenAI \u517C\u5BB9" }),
          /* @__PURE__ */ jsx4("option", { value: "anthropic-messages", children: "Anthropic Messages" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("label", { style: { fontSize: 11.5, color: "#8B95A7", display: "flex", gap: 5, alignItems: "center", marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: allowEmpty, onChange: (e) => setAllowEmpty(e.target.checked) }),
        "\u5141\u8BB8\u7A7A key\uFF08Ollama / vLLM / LM Studio \u7B49\u672C\u5730\u7AEF\u70B9\uFF09"
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "pm-btn", disabled: busy, onClick: addManual, children: "+ \u6DFB\u52A0\u6863\u6848" }),
      err ? /* @__PURE__ */ jsx4("div", { className: "pm-err", children: err }) : null,
      okMsg ? /* @__PURE__ */ jsx4("div", { className: "pm-ok", children: okMsg }) : null
    ] }) })
  ] });
}

// src/HistoryTab.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function HistoryTab({ history, onOpen }) {
  if (!history.length) {
    return /* @__PURE__ */ jsx5("div", { className: "pm-empty", children: "\u8FD8\u6CA1\u6709\u5386\u53F2\u8FD0\u884C\u3002\u53D1\u8D77\u4E00\u6B21\u77E9\u9635\u540E\u8FD9\u91CC\u4F1A\u8BB0\u5F55\u6BCF\u6B21\u7684\u6570\u636E\u96C6/\u6210\u529F\u7387/judge \u5747\u5206\u3002" });
  }
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "pm-bar" }),
      "\u5386\u53F2\u8FD0\u884C\uFF08",
      history.length,
      "\uFF09",
      /* @__PURE__ */ jsx5("span", { className: "pm-hint", children: "\u7ED3\u679C\u4FDD\u7559\u6700\u8FD1 10 \u4EFD\u5168\u91CF" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "pm-card", children: /* @__PURE__ */ jsx5("div", { className: "pm-card-b", style: { padding: 0 }, children: /* @__PURE__ */ jsxs5("table", { className: "pm-tbl", children: [
      /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs5("tr", { children: [
        /* @__PURE__ */ jsx5("th", { children: "\u65F6\u95F4" }),
        /* @__PURE__ */ jsx5("th", { children: "\u6570\u636E\u96C6" }),
        /* @__PURE__ */ jsx5("th", { children: "\u683C\u5B50" }),
        /* @__PURE__ */ jsx5("th", { children: "judge" }),
        /* @__PURE__ */ jsx5("th", { children: "\u53D8\u4F53" }),
        /* @__PURE__ */ jsx5("th", { children: "\u72B6\u6001" })
      ] }) }),
      /* @__PURE__ */ jsx5("tbody", { children: history.map((h) => /* @__PURE__ */ jsxs5("tr", { children: [
        /* @__PURE__ */ jsx5("td", { className: "pm-sub", style: { whiteSpace: "nowrap" }, children: String(h.at || "").replace("T", " ").slice(0, 16) }),
        /* @__PURE__ */ jsxs5("td", { children: [
          /* @__PURE__ */ jsx5("b", { children: h.datasetName || "?" }),
          /* @__PURE__ */ jsx5("div", { className: "pm-sub", children: h.runId })
        ] }),
        /* @__PURE__ */ jsxs5("td", { children: [
          /* @__PURE__ */ jsx5("span", { style: { color: "#3FB950" }, children: h.okCells }),
          "/",
          h.cells,
          h.failedCells ? /* @__PURE__ */ jsxs5("span", { style: { color: "#F85149" }, children: [
            "\uFF08\u2717",
            h.failedCells,
            "\uFF09"
          ] }) : null
        ] }),
        /* @__PURE__ */ jsx5("td", { children: h.judgeAvg != null ? /* @__PURE__ */ jsx5("b", { children: h.judgeAvg }) : /* @__PURE__ */ jsx5("span", { className: "pm-sub", children: "\u672A\u8BC4\u5224" }) }),
        /* @__PURE__ */ jsx5("td", { className: "pm-sub", style: { maxWidth: 220, wordBreak: "break-all" }, children: (h.variants || []).join(" / ") }),
        /* @__PURE__ */ jsxs5("td", { children: [
          h.status === "done" ? /* @__PURE__ */ jsx5("span", { className: "pm-pill ok", children: "\u5B8C\u6210" }) : h.status === "aborted" ? /* @__PURE__ */ jsx5("span", { className: "pm-pill warn", children: "\u4E2D\u6B62" }) : /* @__PURE__ */ jsx5("span", { className: "pm-pill bad", children: "\u51FA\u9519" }),
          /* @__PURE__ */ jsx5(
            "button",
            {
              className: "pm-btn ghost sm",
              style: { marginLeft: 6 },
              onClick: () => onOpen(h.runId),
              children: "\u67E5\u770B"
            }
          )
        ] })
      ] }, h.runId)) })
    ] }) }) })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState5 } from "react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function SettingsTab({ profiles, settings, onChanged }) {
  const [concurrency, setConcurrency] = useState5(String(settings?.concurrency ?? 3));
  const [cellTimeoutMs, setCellTimeoutMs] = useState5(String(settings?.cellTimeoutMs ?? 6e4));
  const [retries, setRetries] = useState5(String(settings?.retries ?? 1));
  const [judgeProfileId, setJudgeProfileId] = useState5(settings?.judgeProfileId || "");
  const [judgeUserTemplate, setJudgeUserTemplate] = useState5(settings?.judgeUserTemplate || "");
  const [priceIn, setPriceIn] = useState5(String(settings?.priceIn ?? 0));
  const [priceOut, setPriceOut] = useState5(String(settings?.priceOut ?? 0));
  const [okMsg, setOkMsg] = useState5("");
  const [err, setErr] = useState5("");
  const [busy, setBusy] = useState5(false);
  const save = async () => {
    setErr("");
    setOkMsg("");
    setBusy(true);
    try {
      const r = await sendCommand("settings_set", {
        concurrency: Number(concurrency),
        cellTimeoutMs: Number(cellTimeoutMs),
        retries: Number(retries),
        judgeProfileId,
        judgeUserTemplate,
        priceIn: Number(priceIn) || 0,
        priceOut: Number(priceOut) || 0
      }, 15e3);
      if (r.ok) {
        setOkMsg("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u7ACB\u5373\u751F\u6548\uFF09");
        onChanged();
      } else setErr(r.error || "\u4FDD\u5B58\u5931\u8D25");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs6("div", { children: [
    /* @__PURE__ */ jsxs6("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "pm-bar" }),
      "\u6267\u884C\u9ED8\u8BA4\u503C",
      /* @__PURE__ */ jsx6("span", { className: "pm-hint", children: "\u300C\u8FD0\u884C\u300D\u9875\u53EF\u6309\u6B21\u8986\u76D6" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "pm-card", children: /* @__PURE__ */ jsxs6("div", { className: "pm-card-b", children: [
      /* @__PURE__ */ jsxs6("div", { className: "pm-row", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx6("span", { className: "pm-sub", children: "\u5E76\u53D1" }),
        /* @__PURE__ */ jsx6("select", { className: "pm-sel", value: concurrency, onChange: (e) => setConcurrency(e.target.value), children: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => /* @__PURE__ */ jsx6("option", { value: n, children: n }, n)) }),
        /* @__PURE__ */ jsx6("span", { className: "pm-sub", children: "\u5355\u683C\u8D85\u65F6" }),
        /* @__PURE__ */ jsx6("select", { className: "pm-sel", value: cellTimeoutMs, onChange: (e) => setCellTimeoutMs(e.target.value), children: [3e4, 6e4, 9e4, 12e4, 18e4].map((n) => /* @__PURE__ */ jsxs6("option", { value: n, children: [
          n / 1e3,
          "s"
        ] }, n)) }),
        /* @__PURE__ */ jsx6("span", { className: "pm-sub", children: "\u5931\u8D25\u91CD\u8BD5" }),
        /* @__PURE__ */ jsx6("select", { className: "pm-sel", value: retries, onChange: (e) => setRetries(e.target.value), children: [0, 1, 2].map((n) => /* @__PURE__ */ jsx6("option", { value: n, children: n }, n)) })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "pm-row", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx6("span", { className: "pm-sub", children: "\u9ED8\u8BA4\u8BC4\u5224\u6863\u6848" }),
        /* @__PURE__ */ jsxs6("select", { className: "pm-sel", style: { flex: 1, minWidth: 180 }, value: judgeProfileId, onChange: (e) => setJudgeProfileId(e.target.value), children: [
          /* @__PURE__ */ jsx6("option", { value: "", children: "\uFF08\u4E0D\u8BC4\u5224\uFF09" }),
          profiles.map((p) => /* @__PURE__ */ jsxs6("option", { value: p.id, children: [
            p.name,
            "\uFF08",
            p.model,
            "\uFF09"
          ] }, p.id))
        ] })
      ] }),
      /* @__PURE__ */ jsx6(
        "textarea",
        {
          className: "pm-ta",
          rows: 3,
          placeholder: "\u8BC4\u5224\u63D0\u793A\u8BCD\u6A21\u677F\uFF08\u53EF\u9009\uFF1B\u53EF\u7528 {{output}} \u4E0E\u6837\u672C\u53D8\u91CF\uFF1B\u7559\u7A7A\u7528\u5185\u7F6E\u4E25\u683C\u8BC4\u6D4B\u5458\u6A21\u677F\uFF09",
          value: judgeUserTemplate,
          onChange: (e) => setJudgeUserTemplate(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs6("div", { className: "pm-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx6("span", { className: "pm-sub", children: "\u8BA1\u4EF7\u4F30\u7B97\uFF08\u6BCF\u767E\u4E07 token \u5355\u4EF7\uFF0C$\uFF1B0=\u4E0D\u4F30\u7B97\uFF09" }),
        /* @__PURE__ */ jsx6("input", { className: "pm-inp", style: { width: 90 }, value: priceIn, onChange: (e) => setPriceIn(e.target.value), title: "\u8F93\u5165\u5355\u4EF7" }),
        /* @__PURE__ */ jsx6("span", { className: "pm-sub", children: "/" }),
        /* @__PURE__ */ jsx6("input", { className: "pm-inp", style: { width: 90 }, value: priceOut, onChange: (e) => setPriceOut(e.target.value), title: "\u8F93\u51FA\u5355\u4EF7" })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "pm-sub", style: { marginTop: 6 }, children: "\u4F8B\uFF1ADeepSeek-chat \u8F93\u5165 0.27 / \u8F93\u51FA 1.1\uFF08\u4EE5\u4F9B\u5E94\u5546\u73B0\u4EF7\u4E3A\u51C6\uFF09\u3002\u586B\u4E86\u4E4B\u540E\u7ED3\u679C\u9875\u4F1A\u6309\u5B9E\u9645 usage \u4F30\u7B97\u6BCF\u6B21\u8FD0\u884C\u82B1\u8D39\u3002" }),
      /* @__PURE__ */ jsx6("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx6("button", { className: "pm-btn", disabled: busy, onClick: save, children: "\u4FDD\u5B58\u8BBE\u7F6E" }) }),
      err ? /* @__PURE__ */ jsx6("div", { className: "pm-err", children: err }) : null,
      okMsg ? /* @__PURE__ */ jsx6("div", { className: "pm-ok", children: okMsg }) : null
    ] }) }),
    /* @__PURE__ */ jsxs6("div", { className: "pm-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "pm-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "pm-card", children: /* @__PURE__ */ jsxs6("div", { className: "pm-card-b pm-sub", children: [
      /* @__PURE__ */ jsx6("div", { children: "\xB7 \u6570\u636E\u96C6 \xD7 \u53D8\u4F53\u6279\u91CF\u6267\u884C\uFF1A\u4E00\u5207\u8BF7\u6C42\u7531\u540E\u53F0\u670D\u52A1\u53D1\u51FA\uFF0C\u9762\u677F/AI \u4E0D\u76F4\u63A5\u643A\u5E26 key\u3002" }),
      /* @__PURE__ */ jsxs6("div", { children: [
        "\xB7 \u7ED3\u679C\u5206\u5C42\uFF1A\u5168\u6587\u843D ",
        /* @__PURE__ */ jsxs6("code", { children: [
          "{appConfigDir}",
          "/prompt-matrix/runs/"
        ] }),
        "\uFF0Ckv \u53EA\u5B58\u7626\u8EAB\u6295\u5F71\uFF08\u91CD\u5F00\u9762\u677F\u5386\u53F2\u53EF\u590D\u73B0\uFF09\u3002"
      ] }),
      /* @__PURE__ */ jsx6("div", { children: "\xB7 \u6210\u672C\u62A4\u680F\uFF1A\u53D1\u8D77\u524D\u663E\u5F0F\u9884\u4F30\u683C\u5B50\u6570\u5E76\u786E\u8BA4\uFF1B\u5931\u8D25\u91CD\u8BD5\u53EA\u9488\u5BF9\u9650\u6D41/5xx/\u7F51\u7EDC\u9519\u8BEF\uFF1B\u65E0\u4EFB\u4F55\u5B9A\u65F6\u4EFB\u52A1\u3002" }),
      /* @__PURE__ */ jsx6("div", { children: "\xB7 \u9690\u79C1\uFF1A\u6570\u636E\u96C6\u4E0E\u7ED3\u679C\u4E0D\u51FA\u672C\u673A\uFF1BAI \u7ECF MCP \u8BFB\u5230\u7684\u7ED3\u679C\u4E0E\u9762\u677F\u540C\u6E90\uFF08pmtx.* \u952E\u7A7A\u95F4\uFF09\u3002" })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var css = `
.pm-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pm-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pm-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pm-body::-webkit-scrollbar{width:9px;height:9px}
.pm-body::-webkit-scrollbar-track{background:transparent}
.pm-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pm-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.pm-head{display:flex;align-items:center;gap:10px}
.pm-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8B5CF6,#2B6CB0);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.pm-tt{flex:1;min-width:0}
.pm-tt b{font-size:15px;display:block}
.pm-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.pm-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.pm-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.pm-dot.stale{background:#D29922}
.pm-dot.down{background:#F85149}
.pm-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-top:9px}
.pm-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.pm-tab:hover{color:#E6EAF2}
.pm-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pm-prog{margin-top:8px;background:#161B22;border:1px solid #242C3A;border-radius:9px;padding:8px 11px;font-size:11px;color:#D29922;display:flex;align-items:center;gap:9px;cursor:pointer}
.pm-prog-bar{flex:1;height:5px;border-radius:3px;background:#232834;overflow:hidden}
.pm-prog-in{height:100%;background:linear-gradient(90deg,#8B5CF6,#2B6CB0);border-radius:3px;transition:width .5s}
.pm-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pm-card-b{padding:11px 13px}
.pm-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 6px;font-size:13px;font-weight:700}
.pm-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8B5CF6,#2B6CB0);flex-shrink:0}
.pm-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.pm-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.pm-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.pm-btn{background:#6d4fd0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.pm-btn:hover{filter:brightness(1.12)}
.pm-btn:disabled{opacity:.45;cursor:not-allowed}
.pm-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pm-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.pm-btn.green{background:#1d4730;border:1px solid #2c5c3f;color:#3FB950}
.pm-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.pm-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pm-inp:focus{outline:none;border-color:#6d4fd0}
.pm-inp::placeholder{color:#4d5566}
.pm-ta{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:8px 10px;font-size:11.5px;width:100%;min-width:0;font-family:ui-monospace,Consolas,monospace;line-height:1.5;resize:vertical}
.pm-ta:focus{outline:none;border-color:#6d4fd0}
.pm-ta::placeholder{color:#4d5566}
.pm-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.pm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pm-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.pm-err{color:#F85149;font-size:11.5px;padding:6px 16px;word-break:break-all}
.pm-ok{color:#3FB950;font-size:11.5px;padding:6px 16px;word-break:break-all}
.pm-warn{color:#D29922;font-size:11.5px;padding:6px 16px;word-break:break-all}
.pm-kv{display:flex;gap:6px;align-items:baseline;font-size:11.5px}
.pm-kv b{font-size:13px}
table.pm-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.pm-tbl th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
.pm-tbl td{padding:6px 8px;border-bottom:1px solid #1d232e;vertical-align:top;min-width:0}
.pm-tbl tr:hover td{background:#1a2029}
.pm-cellbtn{background:transparent;border:1px solid #2a2f3a;border-radius:6px;color:#E6EAF2;font-size:11px;padding:3px 8px;cursor:pointer;text-align:left;max-width:100%;overflow:hidden;display:block}
.pm-cellbtn:hover{border-color:#6d4fd0}
.pm-modal-bg{position:fixed;inset:0;background:rgba(6,8,12,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:18px}
.pm-modal{background:#141922;border:1px solid #2c3644;border-radius:14px;max-width:920px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.5)}
.pm-modal-h{display:flex;align-items:center;gap:8px;padding:12px 15px;border-bottom:1px solid #242C3A;font-weight:700;font-size:13px}
.pm-modal-b{padding:13px 15px;overflow-y:auto;flex:1;min-height:0}
.pm-modal-b::-webkit-scrollbar{width:9px}
.pm-modal-b::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px}
.pm-x{margin-left:auto;background:transparent;border:none;color:#8B95A7;font-size:16px;cursor:pointer;padding:2px 6px}
.pm-x:hover{color:#E6EAF2}
.pm-pre{background:#0f1218;border:1px solid #232a36;border-radius:8px;padding:9px 11px;font-size:11.5px;font-family:ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;line-height:1.55;max-height:340px;overflow-y:auto}
.pm-pill{border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;display:inline-block}
.pm-pill.ok{background:#12301f;color:#3FB950}
.pm-pill.bad{background:#3a1d22;color:#F85149}
.pm-pill.warn{background:#2a2410;color:#D29922}
.pm-pill.info{background:#1c2740;color:#6CA9F0}
.pm-del{color:#F85149;cursor:pointer;background:transparent;border:none;font-size:13px;padding:0 3px}
.pm-diff-same{color:#C9D1D9}
.pm-diff-del{background:#3a1d22;color:#F85149;border-radius:2px}
.pm-diff-add{background:#12301f;color:#3FB950;border-radius:2px}
`;
function Panel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState6("run");
  const [meta, setMeta] = useState6(null);
  const [profiles, setProfiles] = useState6([]);
  const [datasets, setDatasets] = useState6([]);
  const [history, setHistory] = useState6([]);
  const [settings, setSettings] = useState6(null);
  const [bootErr, setBootErr] = useState6("");
  const [openRunId, setOpenRunId] = useState6("");
  const visibleRef = useRef(true);
  const refreshState = useCallback2(async () => {
    try {
      const st = await fetchState(8e3);
      if (st && st.ok) {
        setProfiles(st.profiles || []);
        setDatasets(st.datasets || []);
        setHistory(st.history || []);
        setSettings(st.settings || null);
        setMeta(st.meta || null);
        setBootErr("");
      } else {
        const m = await loadMeta().catch(() => null);
        if (m) setMeta(m);
        else setMeta((prev) => prev);
      }
    } catch (e) {
      setBootErr(String(e.message || e));
    }
  }, []);
  useEffect2(() => {
    refreshState();
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = setInterval(() => {
      if (!visibleRef.current) return;
      loadMeta().then((m) => {
        if (m) setMeta(m);
      }).catch(() => {
      });
    }, 2500);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshState]);
  const running = meta && meta.running ? meta.running : null;
  const online = !!(meta && !meta.degraded);
  const pct = running && running.total ? Math.round((running.done + running.judgeDone) / (running.total + running.judgeTotal) * 100) : 0;
  const tabs = [
    { key: "run", label: "\u8FD0\u884C" },
    { key: "datasets", label: "\u6570\u636E\u96C6" },
    { key: "results", label: "\u7ED3\u679C" },
    { key: "profiles", label: `\u6863\u6848${profiles.length ? ` (${profiles.length})` : ""}` },
    { key: "history", label: "\u5386\u53F2" },
    { key: "settings", label: "\u8BBE\u7F6E" }
  ];
  return /* @__PURE__ */ jsxs7("div", { className: "pm-root", children: [
    /* @__PURE__ */ jsx7("style", { children: css }),
    /* @__PURE__ */ jsxs7("div", { className: "pm-top", children: [
      /* @__PURE__ */ jsxs7("div", { className: "pm-head", children: [
        /* @__PURE__ */ jsx7("div", { className: "pm-logo", children: "\u25A6" }),
        /* @__PURE__ */ jsxs7("div", { className: "pm-tt", children: [
          /* @__PURE__ */ jsx7("b", { children: "\u63D0\u793A\u8BCD\u77E9\u9635\u53F0" }),
          /* @__PURE__ */ jsxs7("small", { children: [
            /* @__PURE__ */ jsx7("span", { className: `pm-dot ${online ? "ok" : meta ? "stale" : "down"}` }),
            online ? `\u670D\u52A1\u5728\u7EBF v${meta?.version || "?"}` : meta ? "\u670D\u52A1\u964D\u7EA7\uFF08\u6865\u4E0D\u53EF\u8FBE\uFF0C\u91CD\u8BD5\u4E2D\uFF09" : "\u7B49\u5F85\u670D\u52A1\u2026",
            ` \xB7 \u6863\u6848 ${profiles.length}`
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "pm-tabs", children: tabs.map((t) => /* @__PURE__ */ jsx7("button", { className: `pm-tab ${tab === t.key ? "on" : ""}`, onClick: () => setTab(t.key), children: t.label }, t.key)) }),
      running ? /* @__PURE__ */ jsxs7("div", { className: "pm-prog", onClick: () => setTab("results"), title: "\u70B9\u51FB\u67E5\u770B\u7ED3\u679C", children: [
        /* @__PURE__ */ jsx7("span", { children: running.phase === "judge" ? "\u8BC4\u5224" : "\u6267\u884C" }),
        /* @__PURE__ */ jsx7("div", { className: "pm-prog-bar", children: /* @__PURE__ */ jsx7("div", { className: "pm-prog-in", style: { width: `${pct}%` } }) }),
        /* @__PURE__ */ jsxs7("span", { style: { flexShrink: 0 }, children: [
          running.phase === "judge" ? `${running.judgeDone}/${running.judgeTotal}` : `${running.done}/${running.total}`,
          " ",
          "\u683C \xB7 ",
          Math.round(running.elapsedMs / 1e3),
          "s"
        ] })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "pm-body", children: [
      bootErr ? /* @__PURE__ */ jsxs7("div", { className: "pm-err", children: [
        "\u9762\u677F\u521D\u59CB\u5316\u5931\u8D25\uFF1A",
        bootErr
      ] }) : null,
      meta && meta.degraded && meta.lastBridgeErr ? /* @__PURE__ */ jsxs7("div", { className: "pm-warn", children: [
        "\u6865\u4E0D\u53EF\u8FBE\uFF1A",
        meta.lastBridgeErr
      ] }) : null,
      !online && !bootErr ? /* @__PURE__ */ jsxs7("div", { className: "pm-empty", children: [
        "\u540E\u53F0\u670D\u52A1\u672A\u5C31\u7EEA\uFF08\u7B49 60s \u81EA\u53D1\u73B0\uFF09\u3002",
        /* @__PURE__ */ jsx7("br", {}),
        "\u82E5\u6301\u7EED\u79BB\u7EBF\uFF1A\u5BBF\u4E3B\u300C\u63D2\u4EF6\u300D\u9875\u68C0\u67E5 prompt-matrix \u670D\u52A1\u65E5\u5FD7\u3002"
      ] }) : null,
      tab === "run" ? /* @__PURE__ */ jsx7(
        RunTab,
        {
          pluginId,
          profiles,
          datasets,
          settings,
          running,
          onDone: refreshState,
          goTab: setTab,
          onSendToChat
        }
      ) : null,
      tab === "datasets" ? /* @__PURE__ */ jsx7(DatasetsTab, { datasets, onChanged: refreshState }) : null,
      tab === "results" ? /* @__PURE__ */ jsx7(
        ResultsTab,
        {
          pluginId,
          profiles,
          history,
          running,
          openRunId,
          onChanged: refreshState,
          goTab: setTab,
          onSendToChat
        }
      ) : null,
      tab === "profiles" ? /* @__PURE__ */ jsx7(ProfilesTab, { profiles, onChanged: refreshState }) : null,
      tab === "history" ? /* @__PURE__ */ jsx7(HistoryTab, { history, onOpen: (id) => {
        setOpenRunId(id);
        setTab("results");
      } }) : null,
      tab === "settings" ? /* @__PURE__ */ jsx7(SettingsTab, { profiles, settings, onChanged: refreshState }) : null
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function PromptMatrixEntry(props) {
  return /* @__PURE__ */ jsx8(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  PromptMatrixEntry as default
};
