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

// shared/regex-core.js
var require_regex_core = __commonJS({
  "shared/regex-core.js"(exports, module) {
    "use strict";
    var MAX_TEXT_LEN = 256 * 1024;
    var MAX_MATCHES = 500;
    var LADDER_MAX_TOTAL_MS = 800;
    var LADDER_NS = [8, 10, 12, 14, 16, 18, 20];
    function checkFlags(flags) {
      if (flags == null || flags === "") return null;
      if (typeof flags !== "string") return "flags \u5FC5\u987B\u662F\u5B57\u7B26\u4E32";
      if (!/^[dgimsuvy]*$/.test(flags)) return `flags \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 d g i m s u v y\uFF09\uFF1A${flags}`;
      const seen = /* @__PURE__ */ new Set();
      for (const f of flags) {
        if (seen.has(f)) return `flags \u91CD\u590D\uFF1A${f}`;
        seen.add(f);
      }
      if (seen.has("u") && seen.has("v")) return "u \u4E0E v \u6A21\u5F0F\u4E92\u65A5\uFF0C\u4E0D\u80FD\u540C\u65F6\u4F7F\u7528";
      return null;
    }
    function tokenize(pattern) {
      const src = String(pattern == null ? "" : pattern);
      const tokens = [];
      let depth = 0;
      const groupStack = [];
      let i = 0;
      const push = (t) => {
        tokens.push(t);
        return tokens[tokens.length - 1];
      };
      while (i < src.length) {
        const c = src[i];
        if (c === "\\") {
          const n = src[i + 1];
          if (n === void 0) {
            push({ kind: "escape", raw: "\\", start: i, end: i + 1, depth });
            i += 1;
            continue;
          }
          push({ kind: "escape", raw: src.slice(i, i + 2), start: i, end: i + 2, depth, inClass: false });
          i += 2;
          continue;
        }
        if (c === "[") {
          let j = i + 1;
          let negated = false;
          if (src[j] === "^") {
            negated = true;
            j += 1;
          }
          if (src[j] === "]") {
            j += 1;
          }
          while (j < src.length && src[j] !== "]") {
            if (src[j] === "\\") j += 1;
            j += 1;
          }
          const end = Math.min(j + 1, src.length);
          push({ kind: "class", raw: src.slice(i, end), start: i, end, depth, negated });
          i = end;
          continue;
        }
        if (c === "(") {
          let rest = src.slice(i, i + 4);
          let groupKind = "capture";
          let name = null;
          if (rest.startsWith("(?")) {
            if (src.startsWith("(?<", i) && src[i + 2] !== "=" && src[i + 2] !== "!") {
              const close = src.indexOf(">", i + 3);
              if (close === -1) {
                groupKind = "named";
                name = src.slice(i + 3);
              } else {
                groupKind = "named";
                name = src.slice(i + 3, close);
                i = close + 1;
              }
            } else if (src.startsWith("(?!", i)) {
              groupKind = "negLookahead";
            } else if (src.startsWith("(?=", i)) {
              groupKind = "lookahead";
            } else if (src.startsWith("(?!<", i) || src.startsWith("(?<!", i)) {
              groupKind = "negLookbehind";
            } else if (src.startsWith("(?<=", i)) {
              groupKind = "lookbehind";
            } else {
              groupKind = "noncapture";
            }
          }
          const open = push({ kind: "groupOpen", raw: "", start: i, end: i + 1, depth, groupKind, groupName: name });
          if (groupKind !== "named" || name === null) {
          }
          groupStack.push({ token: open, branchStarts: [tokens.length] });
          if (groupKind !== "named") i += 1;
          else open.end = i;
          depth += 1;
          continue;
        }
        if (c === ")") {
          depth = Math.max(0, depth - 1);
          const g = groupStack.pop();
          push({ kind: "groupClose", raw: ")", start: i, end: i + 1, depth, groupToken: g ? g.token : null });
          if (g) g.closeIndex = tokens.length - 1;
          i += 1;
          continue;
        }
        if (c === "|") {
          const g = groupStack[groupStack.length - 1];
          if (g) g.branchStarts.push(tokens.length + 1);
          push({ kind: "alt", raw: "|", start: i, end: i + 1, depth });
          i += 1;
          continue;
        }
        if (c === "*") {
          push({ kind: "quant", raw: "*", start: i, end: i + 1, depth, quantMin: 0, quantMax: Infinity });
          i += 1;
          continue;
        }
        if (c === "+") {
          push({ kind: "quant", raw: "+", start: i, end: i + 1, depth, quantMin: 1, quantMax: Infinity });
          i += 1;
          continue;
        }
        if (c === "?") {
          const prev = tokens[tokens.length - 1];
          if (prev && prev.kind === "quant" && prev.end === i) {
            prev.lazy = true;
            prev.raw = prev.raw + "?";
            prev.end = i + 1;
            i += 1;
            continue;
          }
          push({ kind: "quant", raw: "?", start: i, end: i + 1, depth, quantMin: 0, quantMax: 1 });
          i += 1;
          continue;
        }
        if (c === "{") {
          const close = src.indexOf("}", i);
          const inner = close > i ? src.slice(i + 1, close) : "";
          const m = /^(\d+)(?:,(\d*)?)?$/.exec(inner);
          if (m && close !== -1) {
            push({
              kind: "quant",
              raw: src.slice(i, close + 1),
              start: i,
              end: close + 1,
              depth,
              quantMin: parseInt(m[1], 10),
              quantMax: m[2] === void 0 ? parseInt(m[1], 10) : m[2] === "" ? Infinity : parseInt(m[2], 10)
            });
            i = close + 1;
            continue;
          }
          push({ kind: "char", raw: "{", start: i, end: i + 1, depth });
          i += 1;
          continue;
        }
        if (c === "^" || c === "$") {
          push({ kind: "anchor", raw: c, start: i, end: i + 1, depth });
          i += 1;
          continue;
        }
        if (c === ".") {
          push({ kind: "dot", raw: ".", start: i, end: i + 1, depth });
          i += 1;
          continue;
        }
        push({ kind: "char", raw: c, start: i, end: i + 1, depth });
        i += 1;
      }
      return { tokens, error: null };
    }
    var isUnbounded = (t) => t && t.kind === "quant" && t.quantMax === Infinity;
    function staticRedos(tokens) {
      const rules = [];
      const stack = [];
      const groups = [];
      for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        if (t.kind === "groupOpen") stack.push({ open: t, openIdx: k, branchStarts: [k + 1] });
        else if (t.kind === "alt") {
          const g = stack[stack.length - 1];
          if (g) g.branchStarts.push(k + 1);
        } else if (t.kind === "groupClose") {
          const g = stack.pop();
          if (g) groups.push({ open: g.open, openIdx: g.openIdx, closeIdx: k, branchStarts: g.branchStarts });
        }
      }
      for (const g of groups) {
        const q = tokens[g.closeIdx + 1];
        const outerUnbounded = isUnbounded(q);
        const outerQuantified = !!q && q.kind === "quant";
        if (!outerQuantified) continue;
        if (!(q.quantMax >= 2)) continue;
        const branches = [];
        for (let b = 0; b < g.branchStarts.length; b++) {
          const from = g.branchStarts[b];
          const to = b + 1 < g.branchStarts.length ? g.branchStarts[b + 1] - 1 : g.closeIdx;
          branches.push(tokens.slice(from, to));
        }
        const sigs = branches.map((bt) => bt.map((t) => t.raw).join(""));
        const dup = sigs.length >= 2 && sigs.some((s, x) => sigs.indexOf(s) !== x);
        if (dup) {
          rules.push({
            id: "duplicate-alternation",
            level: outerUnbounded ? "high" : "caution",
            pattern: g.open.raw + "\u2026" + q.raw,
            desc: `\u7EC4\u5185\u5B58\u5728\u5B8C\u5168\u76F8\u540C\u7684\u5206\u652F\u4E14\u7EC4\u53EF\u591A\u8F6E\u8FED\u4EE3\u2014\u2014\u56DE\u6EAF\u7EC4\u5408\u7206\u70B8${outerUnbounded ? "\uFF08\u65E0\u9650\u91CF\u8BCD\uFF0C\u7ECF\u5178 ReDoS \u5F62\u6001\u5982 (a|a)+\uFF09" : "\uFF08\u6709\u754C\u91CF\u8BCD\uFF0C\u591A\u9879\u5F0F\u98CE\u9669\uFF09"}`
          });
        }
        if (!dup && outerUnbounded && sigs.length >= 2) {
          const prefixDup = sigs.some((s, x) => s !== "" && sigs.some((t, y) => x !== y && (s.startsWith(t) || t.startsWith(s))));
          if (prefixDup) {
            rules.push({
              id: "prefix-alternation",
              level: "high",
              pattern: g.open.raw + "\u2026" + q.raw,
              desc: `\u7EC4\u5185\u5B58\u5728\u524D\u7F00\u91CD\u53E0\u7684\u5206\u652F\u4E14\u7EC4\u88AB\u65E0\u9650\u91CF\u8BCD\u4FEE\u9970\u2014\u2014\u540C\u6BB5\u8F93\u5165\u6709\u591A\u79CD\u5207\u5206\u65B9\u5F0F\uFF0C\u56DE\u6EAF\u7EC4\u5408\u7206\u70B8\uFF08\u5982 (a|aa)+\uFF0C\u8F93\u5165 a\xD7N \u5373\u89E6\u53D1\uFF09`
            });
          }
        }
        for (const bt of branches) {
          const qi = bt.findIndex(isUnbounded);
          if (qi === -1) continue;
          const after = bt.slice(qi + 1);
          const hasDelimiter = after.some((t) => t.kind === "char" || t.kind === "class" || t.kind === "dot");
          rules.push({
            id: "nested-quantifier",
            level: hasDelimiter ? "caution" : "high",
            pattern: g.open.raw + "\u2026" + q.raw,
            desc: hasDelimiter ? `\u7EC4\u88AB\u91CF\u8BCD\u4FEE\u9970\u4E14\u7EC4\u5185\u65E0\u9650\u91CF\u8BCD\u540E\u6709\u5B9A\u754C\u5143\u7D20\u2014\u2014\u82E5\u5B9A\u754C\u5B57\u7B26\u4E0E\u91CF\u8BCD\u5B57\u7B26\u96C6\u4E92\u65A5\uFF08\u5982 (?:\\w+:)+ \u7684\u5192\u53F7\uFF09\u5219\u5B89\u5168\uFF0C\u5426\u5219\u6307\u6570\u98CE\u9669\uFF1B\u5EFA\u8BAE\u7528\u5B9E\u6D4B\u9636\u68AF\u6216\u4EBA\u5DE5\u786E\u8BA4` : `\u7EC4\u88AB\u91CF\u8BCD\u4FEE\u9970\u4E14\u5206\u652F\u4EE5\u65E0\u9650\u91CF\u8BCD\u88F8\u7ED3\u5C3E\u2014\u2014\u5185\u5916\u5C42\u53EF\u5339\u914D\u540C\u4E00\u5B57\u7B26\uFF0C\u56DE\u6EAF\u7EC4\u5408\u7206\u70B8\uFF08\u5982 (a+)+\uFF0C\u8F93\u5165 a\xD7N+\u5931\u914D\u5C3E\u5373\u89E6\u53D1\uFF09`
          });
        }
      }
      for (let k = 0; k < tokens.length - 1; k++) {
        const t = tokens[k];
        if (t.kind === "groupOpen" && /look/.test(t.groupKind || "") && isUnbounded(tokens[k + 1])) {
          rules.push({ id: "quantified-lookaround", level: "caution", pattern: t.raw + "\u2026" + tokens[k + 1].raw, desc: "\u5BF9\u73AF\u89C6\u65AD\u8A00\u65BD\u52A0\u65E0\u9650\u91CF\u8BCD\u2014\u2014\u65AD\u8A00\u4E0D\u6D88\u8017\u8F93\u5165\uFF0C\u91CF\u8BCD\u53EA\u80FD\u539F\u5730\u5FAA\u73AF\uFF0C\u7EAF\u5F00\u9500\u4E14\u6709\u5F15\u64CE\u5DEE\u5F02\u98CE\u9669" });
        }
      }
      for (let k = 0; k < tokens.length - 1; k++) {
        if (isUnbounded(tokens[k]) && isUnbounded(tokens[k + 1]) && tokens[k].depth === tokens[k + 1].depth) {
          rules.push({ id: "adjacent-unbounded", level: "info", pattern: tokens[k].raw + tokens[k + 1].raw, desc: "\u76F8\u90BB\u4E24\u4E2A\u65E0\u9650\u91CF\u8BCD\u2014\u2014\u82E5\u4E24\u8005\u53EF\u5339\u914D\u76F8\u540C\u5B57\u7B26\u96C6\uFF0C\u957F\u8F93\u5165\u4E0B\u6709\u591A\u9879\u5F0F\u56DE\u6EAF\u98CE\u9669\uFF0C\u5EFA\u8BAE\u4EBA\u5DE5\u786E\u8BA4\u5B57\u7B26\u96C6\u662F\u5426\u4E92\u65A5" });
        }
      }
      const seen = /* @__PURE__ */ new Map();
      for (const r of rules) {
        const key = r.id + "|" + r.pattern;
        if (seen.has(key)) seen.get(key).hits += 1;
        else seen.set(key, Object.assign({ hits: 1 }, r));
      }
      return Array.from(seen.values());
    }
    function staticVerdict(rules) {
      if (rules.some((r) => r.level === "high")) return "high";
      if (rules.some((r) => r.level === "caution")) return "caution";
      return "safe";
    }
    function ladderTiming(compile, opts) {
      const now = opts && opts.now || (() => performance.now());
      const ladder = [];
      let total = 0;
      let confirmed = false;
      let consecHigh = 0;
      for (const n of LADDER_NS) {
        if (total > LADDER_MAX_TOTAL_MS) {
          return { ladder, confirmed: true, note: `\u7D2F\u8BA1\u5B9E\u6D4B\u8017\u65F6\u8D85 ${LADDER_MAX_TOTAL_MS}ms \u4E0A\u9650\u63D0\u524D\u7EC8\u6B62\u2014\u2014\u672C\u8EAB\u5DF2\u662F\u5371\u9669\u4FE1\u53F7` };
        }
        const input = "a".repeat(n) + "b";
        const t0 = now();
        let ok = true;
        try {
          compile(input);
        } catch (_) {
          ok = false;
        }
        const ms = now() - t0;
        total += ms;
        const prev = ladder[ladder.length - 1];
        const growth = prev ? ms / Math.max(prev.ms, 0.01) : 1;
        ladder.push({ n, ms: Math.round(ms * 1e3) / 1e3, growth: Math.round(growth * 100) / 100, ran: ok });
        if (!ok) break;
        if (growth > 3) {
          consecHigh += 1;
          if (consecHigh >= 2) confirmed = true;
        } else consecHigh = 0;
      }
      return {
        ladder,
        confirmed,
        note: confirmed ? "\u5B9E\u6D4B\u8017\u65F6\u968F\u8F93\u5165\u957F\u5EA6\u6307\u6570\u7EA7\u589E\u957F\u2014\u2014ReDoS \u5B9E\u9524\uFF08\u771F\u5B9E\u8BA1\u65F6\uFF0C\u975E\u6A21\u62DF\uFF09" : "\u9636\u68AF\u5185\u672A\u89C1\u6307\u6570\u589E\u957F\u7279\u5F81\uFF1B\u9759\u6001\u53EF\u7591\u4ECD\u5EFA\u8BAE\u4EBA\u5DE5\u8BC4\u4F30\u66F4\u957F\u8F93\u5165"
      };
    }
    function analyzeRedos(pattern, flags, opts) {
      const flagErr = checkFlags(flags);
      if (flagErr) return { ok: false, error: flagErr };
      let compiled;
      try {
        compiled = new RegExp(String(pattern == null ? "" : pattern), flags || "");
      } catch (e) {
        return { ok: false, error: `\u6B63\u5219\u8BED\u6CD5\u9519\u8BEF\uFF1A${e.message}` };
      }
      const { tokens } = tokenize(pattern);
      const rules = staticRedos(tokens);
      const verdict = staticVerdict(rules);
      let timing = null;
      if (verdict !== "safe") {
        timing = ladderTiming((input) => compiled.exec(input), opts);
      }
      const finalVerdict = timing && timing.confirmed ? "high" : verdict;
      return { ok: true, verdict: finalVerdict, rules, timing, notes: buildRedosNotes(finalVerdict, rules, timing) };
    }
    function buildRedosNotes(verdict, rules, timing) {
      const notes = [];
      if (rules.length === 0) notes.push("\u9759\u6001\u89C4\u5219 0 \u547D\u4E2D\u2014\u2014\u672A\u8BC6\u522B\u5DF2\u77E5 ReDoS \u5F62\u6001\uFF1B\u4F46\u9759\u6001\u68C0\u6D4B\u6709\u9650\u89C4\u5219\u3001\u53EF\u80FD\u6F0F\u62A5\uFF0C\u4E0D\u7B49\u4E8E\u7EDD\u5BF9\u5B89\u5168\u3002");
      if (timing) notes.push(timing.note);
      if (verdict === "high") notes.push("\u5EFA\u8BAE\uFF1A\u4E0D\u8981\u7528\u8BE5 pattern \u5904\u7406\u4E0D\u53EF\u4FE1\u957F\u8F93\u5165\uFF1B\u6539\u5199\u601D\u8DEF\u2014\u2014\u7528\u5360\u6709\u91CF\u8BCD\uFF08V8 \u652F\u6301 x++ \u5F62\u6001\u9700 u/v flag\uFF09\u3001\u524A\u51CF\u5D4C\u5957\u3001\u7528\u66F4\u7A84\u5B57\u7B26\u7C7B\u4EE3\u66FF [.\\s\\S]\u3002");
      if (verdict === "caution") notes.push("\u5EFA\u8BAE\uFF1A\u7528\u63A5\u8FD1\u771F\u5B9E\u7684\u6076\u610F\u6837\u4F8B\uFF08\u91CD\u590D\u524D\u7F00+\u5931\u914D\u5C3E\uFF09\u81EA\u6D4B\u4E00\u6B21\u518D\u4E0A\u7EBF\u3002");
      return notes;
    }
    function runMatch(pattern, flags, text) {
      const flagErr = checkFlags(flags);
      if (flagErr) return { ok: false, error: flagErr };
      if (typeof text !== "string") return { ok: false, error: "text \u5FC5\u987B\u662F\u5B57\u7B26\u4E32" };
      if (text.length > MAX_TEXT_LEN) return { ok: false, error: `\u6587\u672C\u8FC7\u5927\uFF08${text.length} \u5B57\u7B26 > ${MAX_TEXT_LEN}\uFF09\uFF0C\u8BF7\u622A\u53D6\u540E\u6D4B\u8BD5` };
      let re;
      try {
        re = new RegExp(String(pattern == null ? "" : pattern), flags || "");
      } catch (e) {
        return { ok: false, error: `\u6B63\u5219\u8BED\u6CD5\u9519\u8BEF\uFF1A${e.message}` };
      }
      const t0 = performance.now();
      const matches = [];
      const isGlobal = re.global;
      if (isGlobal) {
        for (const m of text.matchAll(re)) {
          matches.push(packMatch(m));
          if (matches.length >= MAX_MATCHES) break;
        }
      } else {
        const m = re.exec(text);
        if (m) matches.push(packMatch(m));
      }
      const ms = Math.round((performance.now() - t0) * 1e3) / 1e3;
      return {
        ok: true,
        matchCount: matches.length,
        truncated: isGlobal && matches.length >= MAX_MATCHES,
        singleNote: isGlobal ? null : "\u672A\u52A0 g flag\uFF1A\u53EA\u62A5\u544A\u7B2C\u4E00\u4E2A\u5339\u914D\uFF08JS \u8BED\u4E49\u5982\u6B64\uFF0C\u975E\u622A\u65AD\uFF09",
        elapsedMs: ms,
        matches
      };
    }
    function packMatch(m) {
      const groups = [];
      if (m.length > 1) for (let i = 1; i < m.length; i++) groups.push(m[i] === void 0 ? null : m[i]);
      return {
        index: m.index,
        end: m.index + m[0].length,
        text: m[0],
        groups,
        named: m.groups ? Object.assign({}, m.groups) : null
      };
    }
    function runReplace(pattern, flags, replacement, text) {
      const base = runMatch(pattern, flags, text);
      if (!base.ok) return base;
      if (typeof replacement !== "string") return { ok: false, error: "replacement \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08$1 / $<name> \u6309 JS \u539F\u751F\u8BED\u4E49\u900F\u4F20\uFF09" };
      let re;
      try {
        re = new RegExp(String(pattern), flags || "");
      } catch (e) {
        return { ok: false, error: e.message };
      }
      const result = text.replace(re, replacement);
      return { ok: true, replaceCount: base.matchCount, result };
    }
    var ESCAPE_MEANINGS = {
      "\\d": "\u6570\u5B57 [0-9]",
      "\\D": "\u975E\u6570\u5B57",
      "\\w": "\u8BCD\u5B57\u7B26 [A-Za-z0-9_]",
      "\\W": "\u975E\u8BCD\u5B57\u7B26",
      "\\s": "\u7A7A\u767D\uFF08\u542B\u7A7A\u683C/\u5236\u8868/\u6362\u884C\u7B49\uFF09",
      "\\S": "\u975E\u7A7A\u767D",
      "\\b": "\u8BCD\u8FB9\u754C\uFF08\u7C7B\u5916\uFF09",
      "\\B": "\u975E\u8BCD\u8FB9\u754C",
      "\\n": "\u6362\u884C LF",
      "\\r": "\u56DE\u8F66 CR",
      "\\t": "\u5236\u8868 Tab",
      "\\0": "NUL (U+0000)",
      "\\f": "\u6362\u9875 FF",
      "\\v": "\u5782\u76F4\u5236\u8868 VT",
      "\\k": "\u547D\u540D\u7EC4\u53CD\u5411\u5F15\u7528 \\k<name>"
    };
    function explainToken(t) {
      switch (t.kind) {
        case "char":
          return { raw: t.raw, meaning: `\u5B57\u9762\u5B57\u7B26 ${t.raw}` };
        case "escape": {
          if (ESCAPE_MEANINGS[t.raw]) return { raw: t.raw, meaning: ESCAPE_MEANINGS[t.raw] };
          if (/^\\u\{[0-9a-fA-F]+\}$/.test(t.raw)) return { raw: t.raw, meaning: `Unicode \u7801\u70B9\u8F6C\u4E49\uFF08\u9700 u/v flag\uFF09` };
          if (/^\\u[0-9a-fA-F]{4}$/.test(t.raw)) return { raw: t.raw, meaning: `Unicode \u8F6C\u4E49 U+${t.raw.slice(2).toUpperCase()}` };
          if (/^\\x[0-9a-fA-F]{2}$/.test(t.raw)) return { raw: t.raw, meaning: `\u5341\u516D\u8FDB\u5236\u8F6C\u4E49 U+00${t.raw.slice(2).toUpperCase()}` };
          if (/^\\[1-9]/.test(t.raw)) return { raw: t.raw, meaning: `\u53CD\u5411\u5F15\u7528\u7B2C ${t.raw[1]} \u4E2A\u6355\u83B7\u7EC4` };
          if (t.raw === "\\p" || t.raw === "\\P") return { raw: t.raw, meaning: `Unicode \u5C5E\u6027\u7C7B ${t.raw}{...}\uFF08\u9700 u/v flag\uFF09` };
          if (t.raw === "\\c") return { raw: t.raw, meaning: "\u63A7\u5236\u5B57\u7B26\u8F6C\u4E49 \\cX" };
          return { raw: t.raw, meaning: `\u5B57\u9762\u5B57\u7B26 ${t.raw.slice(1)}\uFF08\u8F6C\u4E49\uFF09` };
        }
        case "class": {
          const neg = t.negated ? "\uFF08\u53D6\u53CD\uFF1A\u4E0D\u5339\u914D\u5176\u4E2D\u4EFB\u4F55\u4E00\u4E2A\uFF09" : "";
          return { raw: t.raw, meaning: `\u5B57\u7B26\u7C7B\uFF1A\u5339\u914D\u5176\u4E2D\u4EFB\u610F\u4E00\u4E2A\u5B57\u7B26${neg}\uFF1B\u6CE8\u610F\u7C7B\u5185 \\b \u662F\u9000\u683C\u7B26\u4E0D\u662F\u8BCD\u8FB9\u754C` };
        }
        case "dot":
          return { raw: ".", meaning: "\u4EFB\u610F\u5B57\u7B26\uFF08\u9664\u884C\u7EC8\u6B62\u7B26\uFF1Bs flag \u4E0B\u542B\u884C\u7EC8\u6B62\u7B26\uFF09" };
        case "anchor":
          return { raw: t.raw, meaning: t.raw === "^" ? "\u884C\u9996\u951A\u70B9\uFF08m flag \u4E0B\u6BCF\u884C\u884C\u9996\uFF09" : "\u884C\u5C3E\u951A\u70B9\uFF08m flag \u4E0B\u6BCF\u884C\u884C\u5C3E\uFF09" };
        case "quant": {
          const q = t.quantMax === Infinity ? `\u91CD\u590D ${t.quantMin} \u6B21\u6216\u66F4\u591A` : t.quantMin === t.quantMax ? `\u6070\u597D\u91CD\u590D ${t.quantMin} \u6B21` : `\u91CD\u590D ${t.quantMin} \u5230 ${t.quantMax} \u6B21`;
          const mode = t.lazy ? "\uFF08\u60F0\u6027\uFF1A\u5C3D\u91CF\u5C11\u5339\u914D\uFF09" : t.possessive ? "\uFF08\u5360\u6709\uFF1A\u4E0D\u56DE\u6EAF\uFF09" : "\uFF08\u8D2A\u5A6A\uFF1A\u5C3D\u91CF\u591A\u5339\u914D\uFF0C\u53EF\u56DE\u6EAF\uFF09";
          return { raw: t.raw, meaning: `\u91CF\u8BCD\uFF1A${q}${mode}${t.quantMax === Infinity ? "\uFF1B\u65E0\u9650\u91CF\u8BCD\u662F ReDoS \u56DE\u6EAF\u98CE\u9669\u7684\u53C2\u4E0E\u8981\u7D20" : ""}` };
        }
        case "groupOpen": {
          const k = t.groupKind;
          if (k === "capture") return { raw: "(", meaning: "\u6355\u83B7\u7EC4\u5F00\u59CB\uFF08\u5E8F\u53F7\u6309\u5DE6\u62EC\u53F7\u8BA1\uFF0C$1 \u53EF\u5F15\u7528\uFF09" };
          if (k === "named") return { raw: `(?<${t.groupName}>`, meaning: `\u547D\u540D\u6355\u83B7\u7EC4\u300C${t.groupName}\u300D\u5F00\u59CB\uFF08$<${t.groupName}> / m.groups.${t.groupName} \u5F15\u7528\uFF09` };
          if (k === "noncapture") return { raw: "(?:", meaning: "\u975E\u6355\u83B7\u7EC4\u5F00\u59CB\uFF08\u53EA\u5206\u7EC4\u4E0D\u6355\u83B7\uFF0C\u4E0D\u5360\u7EC4\u53F7\uFF09" };
          if (k === "lookahead") return { raw: "(?=", meaning: "\u987A\u5E8F\u73AF\u89C6\u5F00\u59CB\uFF1A\u53F3\u4FA7\u5FC5\u987B\u80FD\u5339\u914D\uFF0C\u4F46\u4E0D\u6D88\u8017\u8F93\u5165" };
          if (k === "negLookahead") return { raw: "(?!", meaning: "\u5426\u5B9A\u987A\u5E8F\u73AF\u89C6\u5F00\u59CB\uFF1A\u53F3\u4FA7\u5FC5\u987B\u4E0D\u80FD\u5339\u914D\uFF0C\u4E0D\u6D88\u8017\u8F93\u5165" };
          if (k === "lookbehind") return { raw: "(?<=", meaning: "\u9006\u5E8F\u73AF\u89C6\u5F00\u59CB\uFF1A\u5DE6\u4FA7\u5FC5\u987B\u80FD\u5339\u914D\uFF0C\u4E0D\u6D88\u8017\u8F93\u5165" };
          if (k === "negLookbehind") return { raw: "(?<!", meaning: "\u5426\u5B9A\u9006\u5E8F\u73AF\u89C6\u5F00\u59CB\uFF1A\u5DE6\u4FA7\u5FC5\u987B\u4E0D\u80FD\u5339\u914D\uFF0C\u4E0D\u6D88\u8017\u8F93\u5165" };
          return { raw: "(", meaning: "\u7EC4\u5F00\u59CB" };
        }
        case "groupClose":
          return { raw: ")", meaning: "\u7EC4\u7ED3\u675F" };
        case "alt":
          return { raw: "|", meaning: "\u5206\u652F\u4EA4\u66FF\uFF1A\u5DE6\u53F3\u4EFB\u4E00\u5339\u914D\u5373\u53EF\uFF08\u5206\u652F\u91CD\u53E0+\u5916\u5C42\u91CF\u8BCD\u662F ReDoS \u9AD8\u5371\u5F62\u6001\uFF09" };
        default:
          return { raw: t.raw, meaning: "\uFF08\u672A\u77E5\u6784\u9020\uFF09" };
      }
    }
    function explain(pattern, flags) {
      const flagErr = checkFlags(flags);
      if (flagErr) return { ok: false, error: flagErr };
      try {
        new RegExp(String(pattern == null ? "" : pattern), flags || "");
      } catch (e) {
        return { ok: false, error: `\u6B63\u5219\u8BED\u6CD5\u9519\u8BEF\uFF1A${e.message}\uFF08\u4EE5\u4E0B\u89E3\u91CA\u4E0D\u53EF\u7528\uFF09` };
      }
      const { tokens } = tokenize(pattern);
      const items = [];
      for (const t of tokens) {
        const ex = explainToken(t);
        items.push({ depth: t.depth, raw: ex.raw, meaning: ex.meaning });
      }
      return { ok: true, tokenCount: items.length, items };
    }
    var VERDICT_LABELS = { safe: "\u5B89\u5168", caution: "\u9700\u6CE8\u610F", high: "\u9AD8\u5371" };
    function fmt(n) {
      if (!Number.isFinite(n)) return String(n);
      return String(Math.round(n * 1e3) / 1e3);
    }
    function renderRedosReport(r) {
      const lines = [`ReDoS \u7ED3\u8BBA\uFF1A${VERDICT_LABELS[r.verdict] || r.verdict}\uFF08${r.verdict}\uFF09`];
      if (r.rules.length === 0) lines.push("\u9759\u6001\u89C4\u5219 0 \u547D\u4E2D");
      for (const rule of r.rules) {
        lines.push(`- [${rule.level}] ${rule.id}${rule.hits > 1 ? ` \xD7${rule.hits}` : ""}\uFF1A${rule.desc}\uFF08\u5F62\u6001 ${rule.pattern}\uFF09`);
      }
      if (r.timing) {
        const ladder = r.timing.ladder.map((l) => `n=${l.n}:${fmt(l.ms)}ms${l.growth > 1 ? `\uFF08\xD7${fmt(l.growth)}\uFF09` : ""}`).join(" ");
        lines.push(`\u5B9E\u6D4B\u9636\u68AF\uFF1A${ladder}`);
        lines.push(`\u5B9E\u6D4B\u7ED3\u8BBA\uFF1A${r.timing.note}`);
      }
      for (const n of r.notes) lines.push(n);
      return lines.join("\n");
    }
    function renderTestReport(r) {
      const lines = [`\u5339\u914D ${r.matchCount} \u5904\uFF0C\u8017\u65F6 ${fmt(r.elapsedMs)}ms${r.truncated ? `\uFF08\u660E\u7EC6\u622A\u65AD\u81F3 ${MAX_MATCHES} \u6761\uFF09` : ""}`];
      if (r.singleNote) lines.push(r.singleNote);
      for (const m of r.matches.slice(0, 20)) {
        const g = m.groups.length ? `\uFF0C\u6355\u83B7\u7EC4 [${m.groups.map((x) => x === null ? "\u2205" : JSON.stringify(x)).join(", ")}]` : "";
        const nm = m.named && Object.keys(m.named).length ? `\uFF0C\u547D\u540D\u7EC4 ${JSON.stringify(m.named)}` : "";
        lines.push(`- @${m.index}..${m.end} ${JSON.stringify(m.text)}${g}${nm}`);
      }
      if (r.matches.length > 20) lines.push(`\uFF08\u53E6 ${r.matches.length - 20} \u6761\u7565\uFF09`);
      return lines.join("\n");
    }
    function renderReplaceReport(r) {
      return `\u66FF\u6362 ${r.replaceCount} \u5904\uFF0C\u7ED3\u679C\uFF1A
${r.result}`;
    }
    function renderExplainReport(r) {
      const lines = [`\u5171 ${r.tokenCount} \u4E2A\u6784\u9020\uFF1A`];
      for (const it of r.items) {
        lines.push(`${"  ".repeat(it.depth)}- ${JSON.stringify(it.raw)} \u2192 ${it.meaning}`);
      }
      return lines.join("\n");
    }
    module.exports = {
      MAX_TEXT_LEN,
      MAX_MATCHES,
      LADDER_NS,
      checkFlags,
      tokenize,
      staticRedos,
      staticVerdict,
      ladderTiming,
      analyzeRedos,
      runMatch,
      runReplace,
      explain,
      VERDICT_LABELS,
      renderRedosReport,
      renderTestReport,
      renderReplaceReport,
      renderExplainReport
    };
  }
});

// src/Panel.tsx
var coreNs = __toESM(require_regex_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var core = coreNs;
var CSS = `
.rg-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.rg-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rg-head b{font-size:13px}
.rg-head .sub{color:#5C6678;font-size:11px}
.rg-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.rg-tabs{display:flex;gap:6px;flex-wrap:wrap}
.rg-tab{background:#20263A;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.rg-tab.on{background:#2b3348;color:#E6EAF2;border-color:#3a4358}
.rg-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rg-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12.5px/1.5 ui-monospace,Consolas,monospace;padding:7px 10px;outline:none}
.rg-input:focus{border-color:#4fa3f1}
.rg-pattern{flex:1;min-width:220px}
.rg-flags{width:70px}
.rg-area{width:100%;min-height:110px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.rg-area:focus{border-color:#4fa3f1}
.rg-btn{background:#2b3348;border:1px solid #3a4358;color:#E6EAF2;border-radius:6px;padding:5px 16px;font-size:12px;cursor:pointer}
.rg-btn:disabled{opacity:.45;cursor:default}
.rg-err{background:#2b1215;border:1px solid #e03131;color:#f1a0a0;border-radius:8px;padding:8px 12px;font-size:12px}
.rg-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.rg-verdict.safe{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.rg-verdict.caution{background:#2b2413;border-color:#e8590c;color:#f3b377}
.rg-verdict.high{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.rg-verdict b{font-size:13px}
.rg-hl{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede}
.rg-hl mark{background:#31527d;color:#fff;border-radius:2px;padding:0 1px}
.rg-finds{border:1px solid #1c2333;border-radius:8px;overflow:hidden;font-size:11.5px}
.rg-finds table{width:100%;border-collapse:collapse}
.rg-finds th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:6px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.rg-finds td{padding:6px 10px;border-bottom:1px solid #161c2a;vertical-align:top;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.rg-finds tr:last-child td{border-bottom:none}
.rg-rule{padding:7px 10px;border-bottom:1px solid #161c2a;font-size:11.5px}
.rg-rule:last-child{border-bottom:none}
.rg-note{color:#5C6678;font-size:11px;line-height:1.6}
.rg-lad{font-family:ui-monospace,Consolas,monospace;color:#9aa3b8;font-size:11px}
.rg-exp{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.rg-exp-row{display:flex;gap:8px;padding:5px 10px;border-bottom:1px solid #161c2a;font-size:11.5px;align-items:baseline}
.rg-exp-row:last-child{border-bottom:none}
.rg-exp-tok{font-family:ui-monospace,Consolas,monospace;color:#9f9af0;white-space:nowrap;min-width:80px}
.rg-exp-mean{color:#c9cede;word-break:break-all}
`;
function RegexDeskPanel(_props) {
  const [tab, setTab] = useState("test");
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");
  const [ran, setRan] = useState(0);
  const state = useMemo(() => {
    if (!ran) return null;
    if (!pattern) return { kind: "error", message: "\u7F3A\u5C11 pattern" };
    if (tab === "test") {
      const r2 = core.runMatch(pattern, flags, text);
      return r2.ok ? { kind: "test", r: r2 } : { kind: "error", message: String(r2.error) };
    }
    if (tab === "redos") {
      const r2 = core.analyzeRedos(pattern, flags);
      return r2.ok ? { kind: "redos", r: r2 } : { kind: "error", message: String(r2.error) };
    }
    if (tab === "explain") {
      const r2 = core.explain(pattern, flags);
      return r2.ok ? { kind: "explain", r: r2 } : { kind: "error", message: String(r2.error) };
    }
    const r = core.runReplace(pattern, flags, replacement, text);
    return r.ok ? { kind: "replace", r } : { kind: "error", message: String(r.error) };
  }, [ran, tab]);
  const canRun = !!pattern && (tab !== "test" && tab !== "replace" ? true : !!text);
  return /* @__PURE__ */ jsxs("div", { className: "rg-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "rg-head", children: [
      /* @__PURE__ */ jsx("b", { children: "\u6B63\u5219\u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "JS RegExp \u771F\u5B9E\u8BED\u4E49 \xB7 ReDoS \u68C0\u6D4B \xB7 \u7EAF\u672C\u5730 \xB7 \u6587\u672C\u4E0D\u51FA\u672C\u673A" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rg-body", children: [
      /* @__PURE__ */ jsx("div", { className: "rg-tabs", children: ["test", "redos", "explain", "replace"].map((t) => /* @__PURE__ */ jsx("button", { className: `rg-tab ${tab === t ? "on" : ""}`, onClick: () => {
        setTab(t);
        setRan(0);
      }, children: t === "test" ? "\u6D4B\u8BD5" : t === "redos" ? "ReDoS" : t === "explain" ? "\u89E3\u91CA" : "\u66FF\u6362" }, t)) }),
      /* @__PURE__ */ jsxs("div", { className: "rg-row", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "rg-input rg-pattern",
            placeholder: "\u6B63\u5219\uFF08\u4E0D\u5E26\u4E24\u4FA7\u659C\u6760\uFF09\uFF0C\u5982 (?<user>[\\w.-]+)@[\\w.]+",
            value: pattern,
            onChange: (e) => setPattern(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "rg-input rg-flags",
            placeholder: "flags",
            value: flags,
            onChange: (e) => setFlags(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "rg-btn", disabled: !canRun, onClick: () => setRan(ran + 1), children: "\u6267\u884C" })
      ] }),
      (tab === "test" || tab === "replace") && /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "rg-area",
          placeholder: "\u6837\u672C\u6587\u672C\u2026\u2026",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      tab === "replace" && /* @__PURE__ */ jsx(
        "input",
        {
          className: "rg-input rg-pattern",
          placeholder: `\u66FF\u6362\u4E32\uFF08\u652F\u6301 $1\u3001$<name>\uFF09`,
          value: replacement,
          onChange: (e) => setReplacement(e.target.value)
        }
      ),
      state && state.kind === "error" && /* @__PURE__ */ jsxs("div", { className: "rg-err", children: [
        "\u2716 ",
        state.message
      ] }),
      state && state.kind === "test" && (() => {
        const r = state.r;
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "rg-note", children: [
            "\u5339\u914D ",
            r.matchCount,
            " \u5904 \xB7 \u8017\u65F6 ",
            r.elapsedMs,
            "ms",
            r.truncated ? `\uFF08\u660E\u7EC6\u622A\u65AD ${core.MAX_MATCHES} \u6761\uFF09` : "",
            r.singleNote ? " \xB7 " + r.singleNote : ""
          ] }),
          r.matches.length > 0 && /* @__PURE__ */ jsx("div", { className: "rg-hl", children: highlight(text, r.matches) }),
          r.matches.length > 0 && /* @__PURE__ */ jsx("div", { className: "rg-finds", children: /* @__PURE__ */ jsxs("table", { children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "\u4F4D\u7F6E" }),
              /* @__PURE__ */ jsx("th", { children: "\u5339\u914D" }),
              /* @__PURE__ */ jsx("th", { children: "\u6355\u83B7\u7EC4" }),
              /* @__PURE__ */ jsx("th", { children: "\u547D\u540D\u7EC4" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: r.matches.slice(0, 50).map((m, i) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsxs("td", { children: [
                m.index,
                "..",
                m.end
              ] }),
              /* @__PURE__ */ jsx("td", { children: JSON.stringify(m.text) }),
              /* @__PURE__ */ jsx("td", { children: m.groups.length ? m.groups.map((g) => g === null ? "\u2205" : JSON.stringify(g)).join(", ") : "\u2014" }),
              /* @__PURE__ */ jsx("td", { children: m.named && Object.keys(m.named).length ? JSON.stringify(m.named) : "\u2014" })
            ] }, i)) })
          ] }) })
        ] });
      })(),
      state && state.kind === "redos" && (() => {
        const r = state.r;
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: `rg-verdict ${r.verdict}`, children: [
            /* @__PURE__ */ jsx("b", { children: core.VERDICT_LABELS[r.verdict] }),
            "\uFF08",
            r.verdict,
            "\uFF09\xB7 \u9759\u6001\u547D\u4E2D ",
            r.rules.length,
            " \u6761",
            r.timing ? ` \xB7 \u9636\u68AF\u5B9E\u6D4B ${r.timing.ladder.length} \u6863` : ""
          ] }),
          r.rules.map((rule, i) => /* @__PURE__ */ jsxs("div", { className: "rg-rule", children: [
            "[",
            rule.level,
            "] ",
            rule.id,
            rule.hits > 1 ? ` \xD7${rule.hits}` : "",
            " \u2014\u2014 ",
            rule.desc,
            "\uFF08\u5F62\u6001 ",
            rule.pattern,
            "\uFF09"
          ] }, i)),
          r.timing && /* @__PURE__ */ jsxs("div", { className: "rg-lad", children: [
            "\u9636\u68AF\uFF08\u8F93\u5165\u957F\u5EA6 a\xD7n+b \u2192 \u8017\u65F6\uFF09\uFF1A",
            r.timing.ladder.map((l) => `n=${l.n}:${l.ms}ms${l.growth > 1 ? `\xD7${l.growth}` : ""}`).join(" \u2192 ")
          ] }),
          r.notes.map((n, i) => /* @__PURE__ */ jsx("div", { className: "rg-note", children: n }, i))
        ] });
      })(),
      state && state.kind === "explain" && /* @__PURE__ */ jsx("div", { className: "rg-exp", children: state.r.items.map((it, i) => /* @__PURE__ */ jsxs("div", { className: "rg-exp-row", style: { paddingLeft: 10 + it.depth * 16 }, children: [
        /* @__PURE__ */ jsx("span", { className: "rg-exp-tok", children: JSON.stringify(it.raw) }),
        /* @__PURE__ */ jsx("span", { className: "rg-exp-mean", children: it.meaning })
      ] }, i)) }),
      state && state.kind === "replace" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "rg-note", children: [
          "\u66FF\u6362 ",
          state.r.replaceCount,
          " \u5904\uFF0C\u7ED3\u679C\uFF1A"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "rg-hl", children: state.r.result })
      ] }),
      tab === "redos" && !state && /* @__PURE__ */ jsx("div", { className: "rg-note", children: "\u8F93\u5165\u6B63\u5219\u540E\u70B9\u300C\u6267\u884C\u300D\u3002\u68C0\u6D4B = \u9759\u6001\u6A21\u5F0F\u8BC6\u522B\uFF08\u6709\u9650\u89C4\u5219\uFF0C\u53EF\u80FD\u6F0F\u62A5\uFF09+ \u9759\u6001\u53EF\u7591\u65F6\u8F93\u5165\u957F\u5EA6\u9636\u68AF\u771F\u5B9E\u8BA1\u65F6\u590D\u6838\uFF1B\u540C\u6B65 RegExp \u65E0\u6CD5\u4E2D\u65AD\uFF0C\u6545\u9636\u68AF\u53EA\u5BF9\u9759\u6001\u53EF\u7591\u8005\u8FDB\u884C\u4E14\u8BBE\u8017\u65F6\u4E0A\u9650\u3002" })
    ] })
  ] });
}
function highlight(text, matches) {
  const out = [];
  let pos = 0;
  for (let i = 0; i < matches.length && i < 200; i++) {
    const m = matches[i];
    if (m.index > pos) out.push(text.slice(pos, m.index));
    out.push(/* @__PURE__ */ jsx("mark", { children: m.end > m.index ? text.slice(m.index, m.end) : "\u2300" }, i));
    pos = Math.max(pos, m.end);
    if (m.end === m.index) pos = m.index + 1;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function RegexDeskEntry(props) {
  return /* @__PURE__ */ jsx2(RegexDeskPanel, { ...props });
}
export {
  RegexDeskEntry as default
};
