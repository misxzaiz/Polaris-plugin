"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/engine-api.js
var require_engine_api = __commonJS({
  "shared/engine-api.js"(exports2, module2) {
    "use strict";
    var LIMITS = {
      INPUT_MAX_BYTES: 64 * 1024 * 1024,
      RESULT_MAX_BYTES: 8 * 1024 * 1024,
      TIMEOUT_DEFAULT_MS: 5e3,
      TIMEOUT_MIN_MS: 100,
      TIMEOUT_MAX_MS: 3e4,
      REFERENCE_RESULT_CAP: 40
    };
    var BARE_FLAGS = /* @__PURE__ */ new Set([
      "-r",
      "--raw-output",
      "-j",
      "--join-output",
      "-c",
      "--compact-output",
      "-a",
      "--ascii-output",
      "-S",
      "--sort-keys",
      "--tab",
      "-s",
      "--slurp",
      "-n",
      "--null-input",
      "-R",
      "--raw-input"
    ]);
    var SHORT_FLAGS = new Set([...BARE_FLAGS].filter((f) => !f.startsWith("--")));
    function normalizeFlags(raw) {
      const list = Array.isArray(raw) ? raw.map(String) : [];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f === "--arg" || f === "--argjson") {
          const name = list[i + 1];
          const value = list[i + 2];
          if (name == null || value == null) {
            return { ok: false, flags: [], error: `${f} \u9700\u8981\u4E24\u4E2A\u53C2\u6570\uFF1A<\u540D\u79F0> <\u503C>` };
          }
          if (f === "--argjson") {
            try {
              JSON.parse(value);
            } catch (_) {
              return { ok: false, flags: [], error: `--argjson ${name} \u7684\u503C\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${String(value).slice(0, 60)}` };
            }
          }
          out.push(f, String(name), String(value));
          i += 2;
          continue;
        }
        if (BARE_FLAGS.has(f)) {
          out.push(f);
          continue;
        }
        if (/^-[a-zA-Z]{2,}$/.test(f)) {
          const chars = [...f.slice(1)].map((c) => "-" + c);
          if (chars.every((c) => SHORT_FLAGS.has(c))) {
            out.push(...chars);
            continue;
          }
        }
        return { ok: false, flags: [], error: `\u4E0D\u652F\u6301\u7684 flag\uFF1A${f}\uFF08\u767D\u540D\u5355\uFF1A-r -j -c -a -S --tab -s -n -R \u53CA --arg/--argjson\uFF09` };
      }
      return { ok: true, flags: out };
    }
    function clampTimeoutMs(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return LIMITS.TIMEOUT_DEFAULT_MS;
      return Math.min(LIMITS.TIMEOUT_MAX_MS, Math.max(LIMITS.TIMEOUT_MIN_MS, Math.round(n)));
    }
    function splitJsonStream(text, cap = 1e5) {
      const s = String(text == null ? "" : text);
      const items = [];
      let i = 0;
      const n = s.length;
      while (i < n) {
        while (i < n && /\s/.test(s[i])) i++;
        if (i >= n) break;
        if (items.length >= cap) {
          items.push({ error: `\u6587\u6863\u6570\u8D85\u8FC7\u4E0A\u9650 ${cap}\uFF0C\u5DF2\u622A\u65AD`, start: i, end: n });
          break;
        }
        const start = i;
        let depth = 0;
        let inStr = false;
        let esc = false;
        let done = false;
        for (; i < n && !done; i++) {
          const c = s[i];
          if (inStr) {
            if (esc) esc = false;
            else if (c === "\\") esc = true;
            else if (c === '"') inStr = false;
            continue;
          }
          if (c === '"') {
            inStr = true;
            continue;
          }
          if (c === "{" || c === "[") depth++;
          else if (c === "}" || c === "]") {
            depth--;
            if (depth <= 0 && (c === "}" || c === "]")) {
              i++;
              done = true;
            }
          } else if (depth === 0) {
            if (/\s/.test(c)) {
              done = true;
            }
          }
        }
        const raw = s.slice(start, done ? i : n).trim();
        if (!raw) break;
        let item = { start, end: done ? i : n };
        try {
          item = { ...item, value: JSON.parse(raw) };
        } catch (e) {
          item = { ...item, error: e && e.message || "JSON \u89E3\u6790\u5931\u8D25" };
        }
        items.push(item);
      }
      return items;
    }
    function inputStats(text) {
      const s = String(text == null ? "" : text);
      const bytes = Buffer ? Buffer.byteLength(s, "utf8") : s.length;
      const parts = splitJsonStream(s);
      const firstErr = parts.find((p) => p.error);
      return {
        bytes,
        chars: s.length,
        docCount: parts.filter((p) => !p.error).length,
        hasParseError: Boolean(firstErr && s.trim().length > 0),
        parseError: firstErr ? firstErr.error : null,
        empty: s.trim().length === 0
      };
    }
    function parseOutputs(rawText) {
      const parts = splitJsonStream(String(rawText == null ? "" : rawText));
      const outputs = [];
      for (const p of parts) {
        if (p.error) outputs.push({ error: p.error, raw: String(rawText).slice(p.start, p.end).slice(0, 200) });
        else outputs.push({ value: p.value });
      }
      return outputs;
    }
    function truncationNotice(bytes, limit) {
      return `\u8F93\u51FA ${bytes} \u5B57\u8282\u8D85\u8FC7\u4E0A\u9650 ${limit}\uFF0C\u5DF2\u622A\u65AD\uFF08\u53EF\u7528 -c \u538B\u7F29\u8F93\u51FA\u6216\u52A0 limit/first \u7F29\u5C0F\u7ED3\u679C\uFF09`;
    }
    module2.exports = {
      LIMITS,
      BARE_FLAGS,
      normalizeFlags,
      clampTimeoutMs,
      splitJsonStream,
      inputStats,
      parseOutputs,
      truncationNotice
    };
  }
});

// shared/outline.js
var require_outline = __commonJS({
  "shared/outline.js"(exports2, module2) {
    "use strict";
    var DEFAULT_DEPTH = 3;
    var DEFAULT_MAX_CHILDREN = 24;
    var SAMPLE_MAX_CHARS = 48;
    function typeOf(v) {
      if (v === null) return "null";
      if (Array.isArray(v)) return "array";
      return typeof v === "object" ? "object" : typeof v;
    }
    function clip(s, n) {
      const t = String(s);
      return t.length > n ? t.slice(0, n) + "\u2026" : t;
    }
    function sampleOf(v) {
      if (v === null) return "null";
      const t = typeof v;
      if (t === "string") return clip(JSON.stringify(v), SAMPLE_MAX_CHARS);
      if (t === "number" || t === "boolean") return String(v);
      return "";
    }
    function outlineOf(value, opts) {
      const maxDepth = Math.max(1, Math.min(8, Number(opts && opts.depth) || DEFAULT_DEPTH));
      const maxChildren = Math.max(1, Math.min(64, Number(opts && opts.maxChildren) || DEFAULT_MAX_CHILDREN));
      function walk(v, path2, depth) {
        const t = typeOf(v);
        if (t === "array") {
          const node = { type: "array", path: path2, length: v.length };
          if (v.length === 0) return node;
          const seen = /* @__PURE__ */ new Map();
          const scanCount = Math.min(v.length, 200);
          for (let i = 0; i < scanCount; i++) {
            const et = typeOf(v[i]);
            seen.set(et, (seen.get(et) || 0) + 1);
          }
          node.childTypes = [...seen.entries()].map(([k, c]) => `${k}\xD7${c}`).join(" ");
          if (v.length > scanCount) node.sampledFirst = scanCount;
          const objKeys = [];
          for (let i = 0; i < Math.min(v.length, 50); i++) {
            if (typeOf(v[i]) === "object") {
              for (const k of Object.keys(v[i])) if (!objKeys.includes(k)) objKeys.push(k);
            }
          }
          if (objKeys.length) node.elementKeys = objKeys.slice(0, maxChildren);
          if (depth < maxDepth) {
            const shown = Math.min(v.length, maxChildren);
            node.children = [];
            for (let i = 0; i < shown; i++) node.children.push(walk(v[i], `${path2}[${i}]`, depth + 1));
            if (v.length > shown) node.truncated = true;
          }
          return node;
        }
        if (t === "object") {
          const keys = Object.keys(v);
          const node = { type: "object", path: path2, length: keys.length, keys: keys.slice(0, maxChildren) };
          if (keys.length > maxChildren) node.truncated = true;
          if (depth < maxDepth) {
            node.children = [];
            for (const k of keys.slice(0, maxChildren)) node.children.push(walk(v[k], path2 ? `${path2}.${k}` : `.${k}`, depth + 1));
          }
          return node;
        }
        return { type: t, path: path2, sample: sampleOf(v) };
      }
      return walk(value, ".", 1);
    }
    function renderOutline(node) {
      const lines = [];
      function emit(n, indent) {
        const pad = "  ".repeat(indent);
        if (n.type === "array" || n.type === "object") {
          const head = n.type === "array" ? `array(${n.length})${n.childTypes ? ` \u5143\u7D20: ${n.childTypes}` : ""}` : `object(${n.length})`;
          lines.push(`${pad}${n.path}: ${head}`);
          if (n.elementKeys) lines.push(`${pad}  \u5143\u7D20\u952E\u5E76\u96C6: ${n.elementKeys.join(", ")}`);
          if (n.keys) lines.push(`${pad}  \u952E: ${n.keys.join(", ")}${n.truncated ? " \u2026(\u622A\u65AD)" : ""}`);
          for (const c of n.children || []) emit(c, indent + 1);
          if (n.truncated && n.type === "array") lines.push(`${pad}  \u2026\u5171 ${n.length} \u9879\uFF0C\u4EC5\u5C55\u5F00\u524D ${(n.children || []).length}`);
        } else {
          lines.push(`${pad}${n.path}: ${n.type}${n.sample != null && n.sample !== "" ? ` = ${n.sample}` : ""}`);
        }
      }
      emit(node, 0);
      return lines.join("\n");
    }
    function outlineFromText2(text, opts) {
      let value;
      try {
        value = JSON.parse(String(text == null ? "" : text));
      } catch (_) {
        return null;
      }
      const node = outlineOf(value, opts);
      return { node, text: renderOutline(node) };
    }
    module2.exports = { outlineOf, renderOutline, outlineFromText: outlineFromText2, typeOf };
  }
});

// shared/reference.js
var require_reference = __commonJS({
  "shared/reference.js"(exports2, module2) {
    "use strict";
    var ENTRIES = [
      // ── 基础取值 ──
      { cat: "\u53D6\u503C", sig: ".", desc: "\u6052\u7B49\uFF1A\u539F\u6837\u8F93\u51FA\u8F93\u5165", ex: '{"a":1} | .' },
      { cat: "\u53D6\u503C", sig: ".foo", desc: "\u53D6\u5BF9\u8C61\u5B57\u6BB5\uFF08\u7F3A\u5B57\u6BB5\u5F97 null\uFF09", ex: '{"a":1} | .a' },
      { cat: "\u53D6\u503C", sig: ".foo?", desc: "\u5BB9\u9519\u53D6\u503C\uFF1A\u5BF9\u8C61\u4E0A\u53D6\u5B57\u6BB5\u51FA\u9519\u65F6\u4E0D\u62A5\u9519\uFF0C\u5F97\u7A7A", ex: '"str" | .a?' },
      { cat: "\u53D6\u503C", sig: '.["foo"]', desc: "\u62EC\u53F7\u53D6\u5B57\u6BB5\uFF08\u952E\u53EF\u6765\u81EA\u53D8\u91CF/\u8868\u8FBE\u5F0F\uFF09", ex: '{"a":1} | .["a"]' },
      { cat: "\u53D6\u503C", sig: ".[0] / .[-1]", desc: "\u6570\u7EC4\u4E0B\u6807\uFF0C\u8D1F\u6570\u4ECE\u5C3E\u6570", ex: "[1,2,3] | .[-1]" },
      { cat: "\u53D6\u503C", sig: ".[1:3]", desc: "\u6570\u7EC4/\u5B57\u7B26\u4E32\u5207\u7247 [\u8D77,\u6B62)", ex: "[1,2,3,4] | .[1:3]" },
      { cat: "\u53D6\u503C", sig: ".[]", desc: "\u8FED\u4EE3\uFF1A\u6570\u7EC4\u9010\u5143\u7D20/\u5BF9\u8C61\u9010\u503C\u8F93\u51FA\uFF08\u591A\u4E2A\u7ED3\u679C\uFF09", ex: '{"a":1,"b":2} | .[]' },
      { cat: "\u53D6\u503C", sig: "..", desc: "\u9012\u5F52\u4E0B\u964D\uFF1A\u6240\u6709\u5B50\u503C", ex: '{"a":{"b":1}} | [..]' },
      { cat: "\u53D6\u503C", sig: ".a.b.c", desc: "\u94FE\u5F0F\u53D6\u503C", ex: '{"a":{"b":{"c":42}}} | .a.b.c' },
      // ── 管道与组合 ──
      { cat: "\u7EC4\u5408", sig: "a | b", desc: "\u7BA1\u9053\uFF1A\u5DE6\u8F93\u51FA\u4F5C\u4E3A\u53F3\u8F93\u5165", ex: "[1,2,3] | length" },
      { cat: "\u7EC4\u5408", sig: "a, b", desc: "\u9017\u53F7\uFF1A\u5148\u540E\u8F93\u51FA\u4E24\u4E2A\u6D41", ex: "1, 2" },
      { cat: "\u7EC4\u5408", sig: "a // b", desc: "\u5907\u9009\uFF1A\u5DE6\u4E3A null/false/\u7A7A\u6D41\u65F6\u53D6\u53F3", ex: '.a // "\u9ED8\u8BA4"' },
      { cat: "\u7EC4\u5408", sig: "? / try", desc: "\u5BB9\u9519\uFF1Atry f \u6216 f? \u628A\u9519\u8BEF\u541E\u6210\u7A7A\u6D41", ex: '("a" | tonumber)? // 0' },
      { cat: "\u7EC4\u5408", sig: "if .. then .. else .. end", desc: "\u6761\u4EF6\uFF08else \u53EF\u7701\u7565\uFF09", ex: 'if . > 0 then "\u6B63" else "\u975E\u6B63" end' },
      // ── 构造与绑定 ──
      { cat: "\u6784\u9020", sig: "{a: .x, b: .y}", desc: "\u5BF9\u8C61\u6784\u9020\uFF08{x} \u662F {x: .x} \u7684\u7B80\u5199\uFF09", ex: '{"x":1,"y":2} | {x, y}' },
      { cat: "\u6784\u9020", sig: "[f]", desc: "\u6570\u7EC4\u6784\u9020\uFF1A\u628A\u6D41\u6536\u96C6\u6210\u6570\u7EC4", ex: "1,2,3 | [., .+1]" },
      { cat: "\u6784\u9020", sig: "as $x | ..", desc: "\u7ED1\u5B9A\uFF1A\u628A\u503C\u547D\u540D\u4F9B\u540E\u7528", ex: "[1,2] | . as $a | $a | add" },
      { cat: "\u6784\u9020", sig: "def f: body;", desc: "\u81EA\u5B9A\u4E49\u51FD\u6570\uFF08\u53EF\u9012\u5F52\uFF09", ex: "def double: . * 2; [1,2] | map(double)" },
      { cat: "\u6784\u9020", sig: "reduce", desc: "\u6298\u53E0\u7D2F\u52A0", ex: "[1,2,3,4] | reduce .[] as $x (0; . + $x)" },
      { cat: "\u6784\u9020", sig: "foreach", desc: "\u6298\u53E0\u4F46\u8F93\u51FA\u6BCF\u4E00\u6B65", ex: "[1,2,3] | foreach .[] as $x (0; .+$x)" },
      { cat: "\u6784\u9020", sig: "label $out | .. | break $out", desc: "\u63D0\u524D\u8DF3\u51FA\u5FAA\u73AF", ex: "[limit(3; repeat(1))]" },
      // ── 迭代/过滤 ──
      { cat: "\u8FED\u4EE3", sig: "select(f)", desc: "\u8FC7\u6EE4\uFF1Af \u4E3A\u771F\u624D\u8F93\u51FA", ex: '[{"n":1},{"n":5}] | .[] | select(.n > 3)' },
      { cat: "\u8FED\u4EE3", sig: "map(f)", desc: "\u6570\u7EC4\u9010\u5143\u7D20\u53D8\u6362", ex: "[1,2,3] | map(. * 10)" },
      { cat: "\u8FED\u4EE3", sig: "map_values(f)", desc: "\u5BF9\u8C61/\u6570\u7EC4\u9010\u503C\u53D8\u6362\uFF08\u4FDD\u7559\u952E\uFF09", ex: '{"a":1} | map_values(. + 1)' },
      { cat: "\u8FED\u4EE3", sig: "first / last", desc: "\u9996/\u5C3E\u5143\u7D20\uFF08first(f) \u53D6\u6D41\u7B2C\u4E00\u4E2A\uFF09", ex: "[3,1,2] | sort | first" },
      { cat: "\u8FED\u4EE3", sig: "limit(n; f)", desc: "\u53EA\u53D6\u6D41\u524D n \u4E2A\uFF08\u9632\u6B7B\u6D41\u5FC5\u5907\uFF09", ex: "[limit(3; repeat(1))]" },
      { cat: "\u8FED\u4EE3", sig: "range(a;b;c)", desc: "\u6570\u503C\u533A\u95F4\u6D41", ex: "[range(0; 10; 3)]" },
      { cat: "\u8FED\u4EE3", sig: "recurse", desc: "\u9012\u5F52\u5C55\u5F00\u6240\u6709\u5B50\u503C", ex: '{"a":{"b":[1]}} | [recurse]' },
      { cat: "\u8FED\u4EE3", sig: "while(cond; update)", desc: "\u6761\u4EF6\u5FAA\u73AF", ex: "[while(. < 100; . * 2)]" },
      { cat: "\u8FED\u4EE3", sig: "until(cond; update)", desc: "\u76F4\u5230\u6761\u4EF6\u6210\u7ACB", ex: "[.,1] | until(.[0] < 1; [.[0] - 1, .[1] * 2])" },
      { cat: "\u8FED\u4EE3", sig: "env / $ENV", desc: "\u73AF\u5883\u53D8\u91CF\u5BF9\u8C61", ex: "$ENV.USERNAME // $ENV.USER" },
      { cat: "\u8FED\u4EE3", sig: "input / inputs", desc: "\u8BFB\u53D6\u5176\u4F59\u8F93\u5165\u6587\u6863\uFF08\u591A\u6587\u6863\u6D41\u7528\uFF09", ex: "[inputs] | length" },
      // ── 键值与路径 ──
      { cat: "\u952E\u503C", sig: "keys / keys_unsorted", desc: "\u5BF9\u8C61\u7684\u952E\u6570\u7EC4\uFF08\u524D\u8005\u6392\u5E8F\uFF09", ex: '{"b":1,"a":2} | keys' },
      { cat: "\u952E\u503C", sig: "to_entries / from_entries", desc: "\u5BF9\u8C61\u2194[{key,value}] \u6570\u7EC4\u4E92\u8F6C", ex: '{"a":1} | to_entries' },
      { cat: "\u952E\u503C", sig: "with_entries(f)", desc: "\u5BF9\u6BCF\u4E2A\u952E\u503C\u5BF9\u505A\u53D8\u6362\u518D\u8FD8\u539F\u5BF9\u8C61", ex: '{"a":1} | with_entries(.value += 1)' },
      { cat: "\u952E\u503C", sig: "has(k)", desc: "\u5BF9\u8C61\u6709\u952E/\u6570\u7EC4\u6709\u4E0B\u6807\uFF1F", ex: '{"a":1} | has("a")' },
      { cat: "\u952E\u503C", sig: "paths", desc: "\u6240\u6709\u8DEF\u5F84\uFF08\u542B\u4E2D\u95F4\u8DEF\u5F84\uFF09", ex: '{"a":{"b":1}} | [paths]' },
      { cat: "\u952E\u503C", sig: "getpath / setpath / delpaths", desc: "\u6309\u8DEF\u5F84\u53D6/\u5199/\u5220", ex: '{"a":{"b":1}} | getpath(["a","b"])' },
      { cat: "\u952E\u503C", sig: "del(path)", desc: "\u5220\u9664\u5B57\u6BB5/\u4E0B\u6807", ex: '{"a":1,"b":2} | del(.a)' },
      { cat: "\u952E\u503C", sig: "to_number  tonumber", desc: "\u5B57\u7B26\u4E32\u2192\u6570\u5B57", ex: '"42" | tonumber' },
      { cat: "\u952E\u503C", sig: "tojson / fromjson", desc: "\u503C\u2192JSON \u5B57\u7B26\u4E32 / \u5B57\u7B26\u4E32\u2192\u503C", ex: '"{\\"a\\":1}" | fromjson' },
      // ── 聚合 ──
      { cat: "\u805A\u5408", sig: "length", desc: "\u6570\u7EC4/\u5BF9\u8C61/\u5B57\u7B26\u4E32\u957F\u5EA6\uFF0Cnull \u5F97 0", ex: "[1,2,3] | length" },
      { cat: "\u805A\u5408", sig: "utf8bytelength", desc: "\u5B57\u7B26\u4E32 UTF-8 \u5B57\u8282\u6570", ex: "\u4E2D\u6587 | utf8bytelength" },
      { cat: "\u805A\u5408", sig: "add", desc: "\u6C42\u548C/\u62FC\u63A5\uFF08\u6309 + \u8BED\u4E49\uFF09", ex: '[{"v":1},{"v":2}] | map(.v) | add' },
      { cat: "\u805A\u5408", sig: "any / all", desc: "\u4EFB\u4E00/\u5168\u90E8\u4E3A\u771F", ex: "[1,2] | any(. > 1)" },
      { cat: "\u805A\u5408", sig: "flatten / flatten(d)", desc: "\u5C55\u5E73\u5D4C\u5957\u6570\u7EC4", ex: "[[1,[2]],[3]] | flatten" },
      { cat: "\u805A\u5408", sig: "unique / unique_by(f)", desc: "\u53BB\u91CD\uFF08\u5148\u6392\u5E8F\uFF09", ex: "[3,1,2,1] | unique" },
      { cat: "\u805A\u5408", sig: "group_by(f)", desc: "\u6309\u952E\u5206\u7EC4\uFF08\u7ED3\u679C\u5DF2\u6392\u5E8F\uFF09", ex: '[{"k":"a"},{"k":"b"},{"k":"a"}] | group_by(.k)' },
      { cat: "\u805A\u5408", sig: "sort / sort_by(f)", desc: "\u6392\u5E8F", ex: '["bb","a","ccc"] | sort_by(length)' },
      { cat: "\u805A\u5408", sig: "min / max / min_by / max_by", desc: "\u6700\u503C", ex: '[{"n":3},{"n":1}] | max_by(.n)' },
      { cat: "\u805A\u5408", sig: "reverse", desc: "\u5012\u5E8F", ex: "[1,2,3] | reverse" },
      { cat: "\u805A\u5408", sig: "contains / inside", desc: "\u5305\u542B\u5224\u65AD\uFF08\u5BF9\u8C61/\u6570\u7EC4/\u5B57\u7B26\u4E32\u6CDB\u5316\uFF09", ex: '"foobar" | contains("bar")' },
      { cat: "\u805A\u5408", sig: "indices / index / rindex", desc: "\u5B50\u4E32/\u5B50\u6570\u7EC4\u51FA\u73B0\u4F4D\u7F6E", ex: '"aBcDeF" | "cD" | . as $x | indices($x)' },
      { cat: "\u805A\u5408", sig: "tostream / fromstream", desc: "\u503C\u2194\u8DEF\u5F84\u6D41\uFF08\u9AD8\u7EA7 diff/\u904D\u5386\uFF09", ex: '{"a":{"b":1}} | [tostream]' },
      // ── 字符串 ──
      { cat: "\u5B57\u7B26\u4E32", sig: "split(s) / join(s)", desc: "\u5B57\u7B26\u4E32\u62C6/\u63A5\uFF08split \u6B63\u5219\u7248\u662F split/2\uFF09", ex: '"a,b,c" | split(",") | join("-")' },
      { cat: "\u5B57\u7B26\u4E32", sig: "ltrimstr / rtrimstr", desc: "\u53BB\u524D\u540E\u7F00\uFF08\u4E0D\u5339\u914D\u5219\u539F\u6837\uFF09", ex: '"v1.2.3" | ltrimstr("v")' },
      { cat: "\u5B57\u7B26\u4E32", sig: "startswith / endswith", desc: "\u524D\u540E\u7F00\u5224\u65AD", ex: '"img.png" | endswith(".png")' },
      { cat: "\u5B57\u7B26\u4E32", sig: "ascii_downcase / ascii_upcase", desc: "\u5927\u5C0F\u5199\u8F6C\u6362", ex: '"AbC" | ascii_downcase' },
      { cat: "\u5B57\u7B26\u4E32", sig: "explode / implode", desc: "\u5B57\u7B26\u4E32\u2194\u7801\u70B9\u6570\u7EC4", ex: '"AB" | explode' },
      { cat: "\u5B57\u7B26\u4E32", sig: "gsub(re; s) / sub(re; s)", desc: "\u6B63\u5219\u66FF\u6362\uFF08\u5168\u90E8/\u9996\u4E2A\uFF09", ex: '"a1b22" | gsub("[0-9]+"; "#")' },
      { cat: "\u5B57\u7B26\u4E32", sig: "@base64 / @base64d", desc: "Base64 \u7F16/\u89E3\u7801", ex: '"hello" | @base64 | @base64d' },
      { cat: "\u5B57\u7B26\u4E32", sig: "@csv / @tsv", desc: "\u6570\u7EC4\u2192CSV/TSV \u884C\uFF08\u5B57\u6BB5\u987B\u4E3A\u6570\u7EC4\uFF09", ex: '["a","b,c"] | @csv' },
      { cat: "\u5B57\u7B26\u4E32", sig: "@json / @text / @html / @uri / @sh", desc: "\u683C\u5F0F\u5316\u8F93\u51FA", ex: '"a b" | @uri' },
      { cat: "\u5B57\u7B26\u4E32", sig: "tostring", desc: "\u503C\u2192\u5B57\u7B26\u4E32\uFF08\u5B57\u7B26\u4E32\u539F\u6837\uFF09", ex: "42 | tostring" },
      // ── 正则（Oniguruma 方言）──
      { cat: "\u6B63\u5219", sig: "test(re)", desc: "\u5339\u914D\u6D4B\u8BD5", ex: '"id=42" | test("^[a-z]+=") ' },
      { cat: "\u6B63\u5219", sig: "match(re)", desc: "\u5339\u914D\u8BE6\u60C5\uFF08offset/length/string/captures\uFF09", ex: '"id=42" | match("[0-9]+")' },
      { cat: "\u6B63\u5219", sig: "capture(re)", desc: "\u547D\u540D\u6355\u83B7\u7EC4\u5BF9\u8C61", ex: '"id=42" | capture("(?<n>[0-9]+)")' },
      { cat: "\u6B63\u5219", sig: "scan(re)", desc: "\u6240\u6709\u5339\u914D\u6D41", ex: '"a1b22" | [scan("[0-9]+")]' },
      { cat: "\u6B63\u5219", sig: "splits(re)", desc: "\u6B63\u5219\u62C6\u5206\u6D41", ex: '"a1b2" | [splits("[0-9]+")]' },
      { cat: "\u6B63\u5219", sig: 'match(re; "g")', desc: "\u5E26 flags\uFF1Ag \u5168\u5C40 i \u5FFD\u7565\u5927\u5C0F\u5199 x \u6269\u5C55", ex: '"aAa" | [match("a"; "g") | .offset]' },
      // ── 时间 ──
      { cat: "\u65F6\u95F4", sig: "now", desc: "\u5F53\u524D\u65F6\u95F4\u6233\uFF08\u79D2\uFF0C\u6D6E\u70B9\uFF09", ex: "now | floor" },
      { cat: "\u65F6\u95F4", sig: "todate / fromdate", desc: "\u65F6\u95F4\u6233\u2194ISO 8601 \u5B57\u7B26\u4E32", ex: "1700000000 | todate" },
      { cat: "\u65F6\u95F4", sig: "strftime(fmt) / strptime(fmt)", desc: "\u6309\u683C\u5F0F\u5316/\u89E3\u6790\uFF08C strftime \u53E3\u5F84\uFF09", ex: 'now | strftime("%Y-%m-%d")' },
      { cat: "\u65F6\u95F4", sig: "mktime / gmtime / localtime", desc: "\u65AD\u8A00\u65F6\u95F4\u2194broken-down \u7ED3\u6784", ex: '"2023-11-14T22:13:20Z" | fromdate | gmtime' },
      { cat: "\u65F6\u95F4", sig: "todateiso8601 / dateadd?", desc: "ISO \u8F93\u51FA\uFF1B\u65E5\u671F\u52A0\u6CD5\u7528 strftime+mktime \u7EC4\u5408", ex: "now | todateiso8601" },
      // ── 数学 ──
      { cat: "\u6570\u5B66", sig: "floor / ceil / round / fabs", desc: "\u53D6\u6574/\u7EDD\u5BF9\u503C", ex: "-3.7 | fabs | ceil" },
      { cat: "\u6570\u5B66", sig: "sqrt / pow(a;b) / log / exp", desc: "\u5E38\u7528\u6570\u5B66\u51FD\u6570", ex: "9 | sqrt" },
      { cat: "\u6570\u5B66", sig: "infinite / nan / isnan / isinfinite", desc: "\u7279\u6B8A\u6570\u503C", ex: "infinite > 1e308" },
      // ── 调试与杂项 ──
      { cat: "\u6742\u9879", sig: "empty", desc: "\u4E0D\u4EA7\u51FA\u4EFB\u4F55\u7ED3\u679C", ex: "[.[] | select(. == 99) | empty]" },
      { cat: "\u6742\u9879", sig: "error(msg) / error", desc: "\u629B\u9519\uFF08\u914D\u5408 try \u7528\uFF09", ex: '. | if . < 0 then error("\u8D1F\u6570") else . end' },
      { cat: "\u6742\u9879", sig: "debug", desc: "stderr \u6253\u5370\u8C03\u8BD5\u4FE1\u606F\uFF08\u4E0D\u5F71\u54CD\u8F93\u51FA\uFF09", ex: '{"a":1} | debug | .a' },
      { cat: "\u6742\u9879", sig: "type / not", desc: "\u7C7B\u578B\u540D / \u903B\u8F91\u975E", ex: "[1] | type" },
      { cat: "\u6742\u9879", sig: "halt / halt_error", desc: "\u7ACB\u5373\u9000\u51FA\uFF08halt_error \u53EF\u5E26\u7801\uFF09", ex: "if . == null then halt else . end" },
      { cat: "\u6742\u9879", sig: "input_line_number / $__loc__", desc: "\u4F4D\u7F6E\u4FE1\u606F", ex: "1 | $__loc__" },
      { cat: "\u6742\u9879", sig: "getpath? \u515C\u5E95\u5199\u6CD5 .a.b?", desc: "\u6DF1\u5C42\u5B89\u5168\u53D6\u503C\u7EC4\u5408", ex: '.a.b.c? // "\u7F3A"' },
      { cat: "\u6742\u9879", sig: "env.\u53D8\u91CF\u540D", desc: "\u6309\u540D\u53D6\u73AF\u5883\u53D8\u91CF", ex: "env.PATH | type" },
      // ── CLI flags（本面板已暴露的）──
      { cat: "flags", sig: "-r / --raw-output", desc: "\u5B57\u7B26\u4E32\u7ED3\u679C\u53BB\u6389\u5F15\u53F7\u539F\u6837\u8F93\u51FA", ex: '"a" | . ' },
      { cat: "flags", sig: "-c / --compact-output", desc: "\u7D27\u51D1\u8F93\u51FA\uFF08\u5355\u884C\uFF09", ex: '{"a":1}' },
      { cat: "flags", sig: "-s / --slurp", desc: "\u628A\u6574\u4E2A\u8F93\u5165\u8BFB\u6210\u4E00\u4E2A\u6570\u7EC4\u518D\u8DD1\u67E5\u8BE2", ex: '{"n":1}' },
      { cat: "flags", sig: "-n / --null-input", desc: "\u4E0D\u8BFB\u8F93\u5165\uFF0C\u7528 null \u8D77\u5934\uFF08\u9020\u6570\u636E\u7528\uFF09", ex: "[range(5)]" },
      { cat: "flags", sig: "-R / --raw-input", desc: "\u6BCF\u884C\u8F93\u5165\u4F5C\u4E3A\u5B57\u7B26\u4E32\uFF08\u65E5\u5FD7\u6587\u672C\u573A\u666F\uFF09", ex: "INFO x" },
      { cat: "flags", sig: "-S / --sort-keys", desc: "\u8F93\u51FA\u6309\u952E\u6392\u5E8F", ex: '{"b":1,"a":2}' },
      { cat: "flags", sig: "-j / --join-output", desc: "-r \u4E14\u4E0D\u8F93\u51FA\u6362\u884C", ex: '"a","b"' },
      { cat: "flags", sig: "--arg k v / --argjson k v", desc: "\u6CE8\u5165 $k \u5B57\u7B26\u4E32 / JSON \u53D8\u91CF", ex: "$x + 1" },
      { cat: "flags", sig: "-a / --ascii-output", desc: "\u975E ASCII \u8F6C\u4E49\uFF08\\uXXXX\uFF09", ex: "\u4E2D\u6587" },
      { cat: "flags", sig: "--tab", desc: "\u7F29\u8FDB\u7528 Tab", ex: '{"a":{"b":1}}' }
    ];
    function searchReference2(keyword, cap) {
      const limit = cap || 40;
      const kw = String(keyword == null ? "" : keyword).trim().toLowerCase();
      const pool = kw ? ENTRIES.filter((e) => e.sig.toLowerCase().includes(kw) || e.desc.toLowerCase().includes(kw) || e.cat.toLowerCase().includes(kw) || e.ex.toLowerCase().includes(kw)) : ENTRIES;
      return { entries: pool.slice(0, limit), total: pool.length, truncated: pool.length > limit };
    }
    function renderReference2(entries) {
      return entries.map((e) => `[${e.cat}] ${e.sig}
  ${e.desc}
  \u4F8B: ${e.ex}`).join("\n");
    }
    module2.exports = { ENTRIES, searchReference: searchReference2, renderReference: renderReference2 };
  }
});

// service/engine.js
var require_engine = __commonJS({
  "service/engine.js"(exports2, module2) {
    "use strict";
    var path2 = require("path");
    var { Worker } = require("worker_threads");
    var DEFAULT_WORKER_PATH = path2.join(__dirname, "worker.js");
    var IDLE_TTL_MS = 10 * 60 * 1e3;
    var MAX_POOLED_KEYS = 4;
    function createEngine2(opts) {
      const log2 = opts && opts.log ? opts.log : () => {
      };
      const workerPath = opts && opts.workerPath || DEFAULT_WORKER_PATH;
      const pool = /* @__PURE__ */ new Map();
      let seq = 0;
      let chain = Promise.resolve();
      let sweeper = null;
      const stats = { queries: 0, timeouts: 0, respawns: 0, errors: 0 };
      function spawnWorker(flagsKey) {
        const readyPromise = new Promise((resolve, reject) => {
          const w = new Worker(workerPath, { workerData: { flagsKey } });
          const cleanup = () => {
            w.off("message", onMsg);
            w.off("error", onErr);
            w.off("exit", onExit);
          };
          const onMsg = (d) => {
            if (d && d.ready) {
              cleanup();
              resolve(w);
            } else if (d && d.fatal) {
              cleanup();
              pool.delete(flagsKey);
              reject(new Error(`jq \u5F15\u64CE\u52A0\u8F7D\u5931\u8D25: ${d.fatal}`));
            }
          };
          const onErr = (e) => {
            cleanup();
            pool.delete(flagsKey);
            reject(new Error(`jq worker \u9519\u8BEF: ${e && e.message}`));
          };
          const onExit = (code) => {
            if (!pool.has(flagsKey)) return;
            cleanup();
            pool.delete(flagsKey);
            reject(new Error(`jq worker \u63D0\u524D\u9000\u51FA code=${code}`));
          };
          w.on("message", onMsg);
          w.on("error", onErr);
          w.on("exit", onExit);
        });
        readyPromise.catch(() => {
          pool.delete(flagsKey);
        });
        pool.set(flagsKey, { worker: null, readyPromise, lastUsed: Date.now() });
        return readyPromise.then((w) => {
          const entry = pool.get(flagsKey);
          if (entry) entry.worker = w;
          return w;
        });
      }
      function evictLRU() {
        while (pool.size > MAX_POOLED_KEYS) {
          let oldestKey = null;
          let oldestTs = Infinity;
          for (const [k, e] of pool) {
            if (e.lastUsed < oldestTs) {
              oldestTs = e.lastUsed;
              oldestKey = k;
            }
          }
          if (!oldestKey) break;
          killWorker(oldestKey, "LRU \u6DD8\u6C70");
        }
      }
      function killWorker(flagsKey, reason) {
        const entry = pool.get(flagsKey);
        if (!entry) return;
        pool.delete(flagsKey);
        stats.respawns += 1;
        if (entry.worker) {
          entry.worker.removeAllListeners("message");
          entry.worker.removeAllListeners("error");
          entry.worker.removeAllListeners("exit");
          entry.worker.terminate().catch(() => {
          });
        }
        log2("warn", `jq worker \u56DE\u6536\uFF08key=${flagsKey}\uFF09: ${reason}`);
      }
      function armSweeper() {
        if (sweeper) clearTimeout(sweeper);
        sweeper = setTimeout(() => {
          const now = Date.now();
          for (const [k, e] of pool) {
            if (now - e.lastUsed > IDLE_TTL_MS) killWorker(k, "idle");
          }
        }, IDLE_TTL_MS);
        if (sweeper.unref) sweeper.unref();
      }
      function runOnce(w, payload, timeoutMs) {
        return new Promise((resolve, reject) => {
          const id = ++seq;
          let settled = false;
          const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            w.off("message", onMsg);
            w.off("exit", onExit);
            fn(arg);
          };
          const timer = setTimeout(() => {
            finish(() => reject(Object.assign(
              new Error(`\u67E5\u8BE2\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09\u5DF2\u7EC8\u6B62\u3002\u6B7B\u5FAA\u73AF/\u8D85\u5927\u8303\u56F4\u67E5\u8BE2\u8BF7\u52A0 limit(\u2026)\u3001first \u6216\u7F29\u5C0F range\uFF1B\u8D85\u65F6\u4E0D\u81EA\u52A8\u91CD\u8BD5\u3002`),
              { user: true, timeout: true }
            )));
          }, timeoutMs);
          const onMsg = (d) => {
            if (d && d.id === id) {
              if (d.ok) finish(() => resolve({ ok: true, out: d.out, ms: d.ms }));
              else finish(() => reject(Object.assign(new Error(d.err || "jq \u6267\u884C\u5931\u8D25"), { user: true, jq: true })));
            }
          };
          const onExit = (code) => {
            finish(() => reject(new Error(`jq \u5F15\u64CE\u7EBF\u7A0B\u5728\u67E5\u8BE2\u4E2D\u9000\u51FA code=${code}\uFF08\u67E5\u8BE2\u53EF\u80FD\u89E6\u53D1\u5185\u5B58\u8017\u5C3D\uFF0C\u5F15\u64CE\u5C06\u91CD\u751F\u6210\uFF09`)));
          };
          w.on("message", onMsg);
          w.on("exit", onExit);
          w.postMessage({ id, ...payload });
        });
      }
      function run(payload) {
        stats.queries += 1;
        const flags = Array.isArray(payload.flags) ? payload.flags.map(String) : [];
        const flagsKey = JSON.stringify(flags);
        const task = chain.then(async () => {
          let entry = pool.get(flagsKey);
          if (!entry) {
            evictLRU();
            try {
              await spawnWorker(flagsKey);
              entry = pool.get(flagsKey);
            } catch (e) {
              stats.errors += 1;
              throw e;
            }
          }
          entry.lastUsed = Date.now();
          try {
            const r = await runOnce(entry.worker, { input: payload.input, query: payload.query, flags }, payload.timeoutMs);
            armSweeper();
            return r;
          } catch (e) {
            armSweeper();
            if (e && e.timeout) {
              stats.timeouts += 1;
              killWorker(flagsKey, "timeout");
            } else if (!(e && e.jq)) {
              stats.errors += 1;
              killWorker(flagsKey, "crash");
            }
            throw e;
          }
        });
        chain = task.then(() => {
        }, () => {
        });
        return task;
      }
      async function shutdown2() {
        if (sweeper) clearTimeout(sweeper);
        const kills = [...pool.keys()];
        for (const k of kills) {
          const entry = pool.get(k);
          pool.delete(k);
          if (entry && entry.worker) {
            entry.worker.removeAllListeners("exit");
            await entry.worker.terminate().catch(() => {
            });
          }
        }
      }
      return {
        run,
        shutdown: shutdown2,
        stats: () => ({ ...stats, pooledKeys: pool.size })
      };
    }
    module2.exports = { createEngine: createEngine2, DEFAULT_WORKER_PATH };
  }
});

// service/kvclient.js
var require_kvclient = __commonJS({
  "service/kvclient.js"(exports2, module2) {
    "use strict";
    var http2 = require("http");
    var fs2 = require("fs");
    var path2 = require("path");
    var os = require("os");
    var crypto2 = require("crypto");
    var SCAN_PORTS = 25;
    var HEALTH_TIMEOUT_MS = 1200;
    var REQUEST_TIMEOUT_MS = 3e4;
    function md5(s) {
      return crypto2.createHash("md5").update(String(s)).digest("hex");
    }
    function configCandidates(appConfigDir) {
      const cands = [];
      for (const anchor of [
        process.env.APPDATA ? path2.join(process.env.APPDATA, "Polaris", "anchor.json") : "",
        path2.join(os.homedir(), ".config", "Polaris", "anchor.json"),
        path2.join(os.homedir(), ".polaris", "anchor.json")
      ]) {
        try {
          const a = JSON.parse(fs2.readFileSync(anchor, "utf8"));
          if (a && typeof a.dataRoot === "string" && a.dataRoot) {
            cands.push(path2.join(a.dataRoot, "config.json"));
          }
        } catch (_) {
        }
      }
      if (appConfigDir) cands.push(path2.join(appConfigDir, "config.json"));
      if (process.env.APPDATA) cands.push(path2.join(process.env.APPDATA, "Polaris", "config.json"));
      cands.push(path2.join(os.homedir(), ".config", "Polaris", "config.json"));
      cands.push(path2.join(os.homedir(), ".polaris", "config.json"));
      return cands;
    }
    function loadWebConfig(appConfigDir) {
      for (const p of configCandidates(appConfigDir)) {
        try {
          const root = JSON.parse(fs2.readFileSync(p, "utf8"));
          const web = root.web || {};
          if (typeof web.port === "number" && web.port > 0) {
            return { host: web.host || "", port: web.port, token: web.token || "" };
          }
        } catch (_) {
        }
      }
      return null;
    }
    function healthOnce(host, port) {
      return new Promise((resolve) => {
        const req = http2.get(
          { hostname: host, port, path: "/api/health", timeout: HEALTH_TIMEOUT_MS },
          (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          }
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
    }
    async function resolveEndpoint(appConfigDir) {
      const envHost = process.env.POLARIS_HOST || "";
      const envPort = parseInt(process.env.POLARIS_PORT || "", 10);
      if (envHost && Number.isFinite(envPort)) {
        return { host: envHost, port: envPort, token: process.env.POLARIS_TOKEN || "", via: "env" };
      }
      const cfg = loadWebConfig(appConfigDir);
      const cfgHost = cfg && cfg.host || "";
      const host = cfgHost && cfgHost !== "0.0.0.0" ? cfgHost : "127.0.0.1";
      const basePort = cfg ? cfg.port : 3e3;
      const token2 = cfg ? cfg.token : "";
      for (let i = 0; i < SCAN_PORTS; i++) {
        if (await healthOnce(host, basePort + i)) {
          return { host, port: basePort + i, token: token2, via: "scan" };
        }
      }
      return { host, port: basePort, token: token2, via: "fallback" };
    }
    function createKvClient2(opts) {
      const log2 = opts && opts.log || (() => {
      });
      const appConfigDir = opts && opts.appConfigDir || "";
      let endpointPromise = null;
      let endpoint = null;
      function getEndpoint(force) {
        if (!endpointPromise || force) {
          endpointPromise = resolveEndpoint(appConfigDir).then((ep) => {
            endpoint = ep;
            log2("info", `bridge endpoint: ${ep.host}:${ep.port} (via ${ep.via}${ep.token ? ", authed" : ", noauth"})`);
            return ep;
          });
        }
        return endpointPromise;
      }
      function dispatch(target, payload, { retries = 2, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
        const attempt = (n) => getEndpoint().then((ep) => new Promise((resolve, reject) => {
          const data = JSON.stringify({ req: { target, payload } });
          const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          };
          if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
          const req = http2.request(
            {
              hostname: ep.host,
              port: ep.port,
              path: "/api/router-dispatch",
              method: "POST",
              headers,
              timeout: timeoutMs
            },
            (res) => {
              let body = "";
              res.on("data", (c) => {
                body += c;
              });
              res.on("end", () => {
                try {
                  const parsed = JSON.parse(body);
                  resolve(parsed);
                } catch (_) {
                  reject(new Error(`bridge \u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.statusCode}\uFF09`));
                }
              });
            }
          );
          req.on("timeout", () => {
            req.destroy(new Error("bridge timeout"));
          });
          req.on("error", (e) => {
            if (n < retries) {
              log2("warn", `dispatch \u91CD\u8BD5 ${n + 1}/${retries}: ${e.message}`);
              setTimeout(() => attempt(n + 1).then(resolve, reject), 300 * Math.pow(2, n));
            } else reject(e);
          });
          req.write(data);
          req.end();
        }));
        return attempt(0);
      }
      async function dispatchOk(target, payload, opt) {
        const res = await dispatch(target, payload, opt);
        if (!res || res.ok !== true) {
          throw new Error(res && res.error || `${target} dispatch \u5931\u8D25`);
        }
        return res.result;
      }
      async function kvGet(key) {
        const r = await dispatchOk("cap.kv", { action: "get", key });
        return r && r.value !== void 0 ? r.value : null;
      }
      async function kvSet(key, value) {
        await dispatchOk("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
        return true;
      }
      async function kvDel(key) {
        await dispatchOk("cap.kv", { action: "delete", key });
        return true;
      }
      async function kvKeys() {
        const r = await dispatchOk("cap.kv", { action: "list" });
        return r && Array.isArray(r.keys) ? r.keys : [];
      }
      return {
        dispatch,
        dispatchOk,
        kvGet,
        kvSet,
        kvDel,
        kvKeys,
        endpoint: () => endpoint,
        refreshEndpoint: () => getEndpoint(true)
      };
    }
    module2.exports = { createKvClient: createKvClient2, resolveEndpoint, loadWebConfig, md5 };
  }
});

// service/main-src.js
var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var engineApi = require_engine_api();
var { outlineFromText } = require_outline();
var { searchReference, renderReference } = require_reference();
var { createEngine } = require_engine();
var { createKvClient } = require_kvclient();
var PLUGIN_ID = "jq-query";
var VERSION = "0.1.0";
var LOG_MAX = 512 * 1024;
var BODY_LIMIT = 64 * 1024 * 1024 + 1024 * 1024;
var PORT = parseInt(process.argv[2] || "", 10) || 0;
var APP_CONFIG_DIR = process.argv[3] || "";
var logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + ".log") : "";
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${(/* @__PURE__ */ new Date()).toISOString()} ${msg}`;
  if (level === "debug") return;
  process.stderr.write(line + "\n");
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > LOG_MAX) fs.renameSync(logFile, logFile + ".old");
    } catch (_) {
    }
    fs.appendFileSync(logFile, line + "\n");
  } catch (_) {
  }
}
var kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
var KEY_META = PLUGIN_ID + ".meta";
var token = process.env.JQ_QUERY_TEST_TOKEN || crypto.randomBytes(16).toString("hex");
var engine = createEngine({ workerPath: path.join(__dirname, "worker.js"), log });
function userErr(msg) {
  return Object.assign(new Error(msg), { user: true });
}
function readInputText(body) {
  if (body.input == null) return "";
  if (typeof body.input !== "string") throw userErr("input \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08JSON/NDJSON \u6587\u672C\uFF09");
  if (Buffer.byteLength(body.input, "utf8") > engineApi.LIMITS.INPUT_MAX_BYTES) {
    throw userErr(`\u8F93\u5165\u8D85\u8FC7\u4E0A\u9650 ${Math.round(engineApi.LIMITS.INPUT_MAX_BYTES / 1048576)}MB`);
  }
  return body.input;
}
function readFilePath(fp) {
  if (!fp || typeof fp !== "string") throw userErr("\u9700\u8981 json\uFF08\u5185\u8054\u6587\u672C\uFF09\u6216 filePath\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09");
  if (!path.isAbsolute(fp)) throw userErr("filePath \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84");
  if (fp.includes("\0")) throw userErr("filePath \u542B\u975E\u6CD5\u5B57\u7B26");
  let st;
  try {
    st = fs.statSync(fp);
  } catch (_) {
    throw userErr(`\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB\uFF1A${fp}`);
  }
  if (st.size > engineApi.LIMITS.INPUT_MAX_BYTES) {
    throw userErr(`\u6587\u4EF6 ${Math.round(st.size / 1048576)}MB \u8D85\u8FC7\u4E0A\u9650 ${Math.round(engineApi.LIMITS.INPUT_MAX_BYTES / 1048576)}MB`);
  }
  return fs.readFileSync(fp, "utf8");
}
async function doQuery(body) {
  const query = body.query;
  if (typeof query !== "string" || !query.trim()) throw userErr("\u9700\u8981\u975E\u7A7A query\uFF08jq \u8FC7\u6EE4\u5668\uFF09");
  const nf = engineApi.normalizeFlags(body.flags);
  if (!nf.ok) throw userErr(nf.error);
  const input = readInputText(body);
  const timeoutMs = engineApi.clampTimeoutMs(body.timeoutMs);
  const inputInfo = engineApi.inputStats(input);
  if (inputInfo.hasParseError && !nf.flags.includes("-R") && !nf.flags.includes("-n")) {
    throw userErr(`\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON/NDJSON\uFF1A${inputInfo.parseError}\uFF08\u82E5\u662F\u65E5\u5FD7\u6587\u672C\u8BF7\u52FE\u9009 -R \u539F\u6837\u884C\u8F93\u5165\uFF09`);
  }
  let r;
  try {
    r = await engine.run({ input, query, flags: nf.flags, timeoutMs });
  } catch (e) {
    if (e && e.jq) throw userErr(`jq \u9519\u8BEF\uFF1A${e.message}`);
    throw e;
  }
  const raw = r.out;
  const bytes = Buffer.byteLength(raw, "utf8");
  const truncated = bytes > engineApi.LIMITS.RESULT_MAX_BYTES;
  const out = {
    raw,
    rawBytes: bytes,
    ms: r.ms,
    truncated,
    truncationNotice: truncated ? engineApi.truncationNotice(bytes, engineApi.LIMITS.RESULT_MAX_BYTES) : null,
    inputDocs: inputInfo.docCount,
    inputBytes: inputInfo.bytes,
    flags: nf.flags,
    timeoutMs
  };
  if (!truncated) {
    const parsed = engineApi.parseOutputs(raw);
    out.outputs = parsed;
    out.outputCount = parsed.length;
  } else {
    out.outputCount = null;
  }
  return out;
}
async function doCheck(body) {
  const query = body.query;
  if (typeof query !== "string" || !query.trim()) throw userErr("\u9700\u8981\u975E\u7A7A query");
  const nf = engineApi.normalizeFlags(body.flags);
  if (!nf.ok) throw userErr(nf.error);
  try {
    await engine.run({ input: "null", query, flags: ["-n"], timeoutMs: engineApi.clampTimeoutMs(body.timeoutMs) });
    return { syntaxOk: true, error: null, errorKind: null, note: "\u8BED\u6CD5 OK\uFF08-n \u7A7A\u8F93\u5165\u6267\u884C\u4E00\u6B21\uFF1B\u6570\u636E\u76F8\u5173\u7C7B\u578B\u9519\u8BEF\u9700\u771F\u5B9E\u8F93\u5165\u624D\u80FD\u66B4\u9732\uFF09" };
  } catch (e) {
    const msg = String(e && e.message || e);
    if (e && e.timeout) throw e;
    const isSyntax = /syntax error|compile error|1 compile error|unexpected/i.test(msg);
    return {
      syntaxOk: !isSyntax,
      error: isSyntax ? msg : null,
      errorKind: isSyntax ? "syntax" : "runtime",
      runtimeNote: isSyntax ? null : `\u8BED\u6CD5 OK\uFF0C\u4F46\u7A7A\u8F93\u5165\u4E0B\u51FA\u73B0\u8FD0\u884C\u671F\u9519\u8BEF\uFF1A${msg.slice(0, 300)}`,
      note: "\u8BED\u6CD5\u5C42\u6821\u9A8C\uFF1B\u6570\u636E\u76F8\u5173\u7C7B\u578B\u9519\u8BEF\u9700\u771F\u5B9E\u8F93\u5165\u624D\u80FD\u66B4\u9732"
    };
  }
}
async function doOutline(body) {
  const depth = Math.max(1, Math.min(8, Number(body.depth) || 3));
  const maxChildren = Math.max(1, Math.min(64, Number(body.maxChildren) || 24));
  let text;
  if (body.json != null) {
    if (typeof body.json !== "string") throw userErr("json \u5FC5\u987B\u662F JSON \u6587\u672C\u5B57\u7B26\u4E32");
    if (Buffer.byteLength(body.json, "utf8") > engineApi.LIMITS.INPUT_MAX_BYTES) throw userErr("json \u8D85\u8FC7\u4E0A\u9650 64MB");
    text = body.json;
  } else if (body.filePath) {
    text = readFilePath(body.filePath);
  } else {
    throw userErr("\u9700\u8981 json\uFF08\u5185\u8054\u6587\u672C\uFF09\u6216 filePath\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09");
  }
  const r = outlineFromText(text, { depth, maxChildren });
  if (!r) throw userErr("\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON\uFF08outline \u53EA\u63A5\u53D7\u5355\u6587\u6863 JSON\uFF1BNDJSON \u8BF7\u5148\u53D6\u5355\u4E2A\u6587\u6863\uFF09");
  return { node: r.node, text: r.text, depth, maxChildren };
}
async function doSelftest() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: Boolean(cond), detail: detail || "" });
  const q = async (input, query, flags) => {
    const r = await engine.run({ input, query, flags: flags || [], timeoutMs: 8e3 });
    return r.out;
  };
  try {
    const a = await q('{"a":{"b":[1,2,3]}}', ".a.b | add");
    ok("\u53D6\u503C+\u805A\u5408 add", a.trim() === "6", a);
  } catch (e) {
    ok("\u53D6\u503C+\u805A\u5408 add", false, String(e.message));
  }
  try {
    const b = await q('[{"n":1},{"n":5},{"n":9}]', "[.[] | select(.n > 3)] | length");
    ok("select \u8FC7\u6EE4", b.trim() === "2", b);
  } catch (e) {
    ok("select \u8FC7\u6EE4", false, String(e.message));
  }
  try {
    const c = await q('{"n":1}\n{"n":2}\n{"n":3}', "length", ["--slurp"]);
    ok("NDJSON \u591A\u6587\u6863 --slurp", c.trim() === "3", c);
  } catch (e) {
    ok("NDJSON \u591A\u6587\u6863 --slurp", false, String(e.message));
  }
  try {
    const d = await q('{"a":1}\n{"a":2}', ".a");
    ok("\u591A\u6587\u6863\u6D41\u5F0F\u591A\u8F93\u51FA", d.trim() === "1\n2", d);
  } catch (e) {
    ok("\u591A\u6587\u6863\u6D41\u5F0F\u591A\u8F93\u51FA", false, String(e.message));
  }
  try {
    const e1 = await q('"x,y"', '["a","b"] | @csv', ["-r"]);
    ok("-r \u539F\u6837\u8F93\u51FA + @csv", e1.includes('"a","b"'), e1);
  } catch (e) {
    ok("-r \u539F\u6837\u8F93\u51FA + @csv", false, String(e.message));
  }
  try {
    await q("null", ".a | tonumber");
    ok("\u8FD0\u884C\u671F\u9519\u8BEF exit 5 \u5FC5\u987B\u629B\u51FA", false, "\u7ADE\u672A\u629B\u9519");
  } catch (e) {
    ok("\u8FD0\u884C\u671F\u9519\u8BEF exit 5 \u5FC5\u987B\u629B\u51FA", Boolean(e && e.jq), String(e.message).slice(0, 80));
  }
  try {
    await q("null", ".a ++");
    ok("\u8BED\u6CD5\u9519\u8BEF\u5FC5\u987B\u629B\u51FA", false, "\u7ADE\u672A\u629B\u9519");
  } catch (e) {
    ok("\u8BED\u6CD5\u9519\u8BEF\u5FC5\u987B\u629B\u51FA", Boolean(e && e.jq && /syntax|compile/i.test(String(e.message))), String(e.message).slice(0, 80));
  }
  try {
    const g = await q("null", "$x + $y.v", ["-n", "--argjson", "x", "4", "--argjson", "y", '{"v":38}']);
    ok("--arg/--argjson \u6CE8\u5165", g.trim() === "42", g);
  } catch (e) {
    ok("--arg/--argjson \u6CE8\u5165", false, String(e.message));
  }
  try {
    const h = await q("1700000000", 'todate | startswith("2023-11-14")');
    ok("\u65F6\u95F4\u51FD\u6570 todate", h.trim() === "true", h);
  } catch (e) {
    ok("\u65F6\u95F4\u51FD\u6570 todate", false, String(e.message));
  }
  try {
    const i = await q('"id=42x"', 'capture("(?<n>[0-9]+)") | .n');
    ok("\u6B63\u5219 capture \u547D\u540D\u7EC4", i.trim() === '"42"', i);
  } catch (e) {
    ok("\u6B63\u5219 capture \u547D\u540D\u7EC4", false, String(e.message));
  }
  const statsBefore = engine.stats().timeouts;
  try {
    await engine.run({ input: "0", query: "[repeat(.+1)]", flags: [], timeoutMs: 800 });
    ok("\u6B7B\u67E5\u8BE2\u5FC5\u987B\u88AB\u8D85\u65F6\u51FB\u6740", false, "\u7ADE\u672A\u8D85\u65F6");
  } catch (e) {
    ok("\u6B7B\u67E5\u8BE2\u5FC5\u987B\u88AB\u8D85\u65F6\u51FB\u6740", Boolean(e && e.timeout), String(e.message).slice(0, 80));
  }
  ok("\u8D85\u65F6\u8BA1\u6570 +1", engine.stats().timeouts === statsBefore + 1, `before=${statsBefore} after=${engine.stats().timeouts}`);
  try {
    const k = await q('{"v":[10,20]}', ".v | add");
    ok("\u51FB\u6740\u540E\u5F15\u64CE\u91CD\u751F\u6210\u53EF\u7528", k.trim() === "30", k);
  } catch (e) {
    ok("\u51FB\u6740\u540E\u5F15\u64CE\u91CD\u751F\u6210\u53EF\u7528", false, String(e.message));
  }
  try {
    const l = engineApi.normalizeFlags(["-rn"]);
    ok("\u805A\u5408\u5F0F flags \u5C55\u5F00", l.ok && l.flags.join(" ") === "-r -n", JSON.stringify(l.flags));
  } catch (e) {
    ok("\u805A\u5408\u5F0F flags \u5C55\u5F00", false, String(e.message));
  }
  try {
    const m = outlineFromText('{"rows":[{"id":1},{"id":2},{"id":3}]}', { depth: 2 }).node;
    ok("outline \u5143\u7D20\u952E\u5E76\u96C6", m.children[0].elementKeys && m.children[0].elementKeys[0] === "id", JSON.stringify(m.children[0].elementKeys));
  } catch (e) {
    ok("outline \u5143\u7D20\u952E\u5E76\u96C6", false, String(e.message));
  }
  const pass = results.filter((r) => r.pass).length;
  const fail2 = results.length - pass;
  return { pass, fail: fail2, total: results.length, results, engine: engine.stats() };
}
function sendJson(res, code, obj, extraHeaders) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    ...extraHeaders || {}
  });
  res.end(data);
}
function fail(res, code, msg) {
  sendJson(res, code, { ok: false, error: msg });
}
function authed(req) {
  return String(req.headers["x-jq-query-token"] || "") === token;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on("data", (c) => {
      if (exceeded) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        exceeded = true;
        chunks.length = 0;
        req.removeAllListeners("data");
        req.resume();
        reject(userErr("\u8BF7\u6C42\u4F53\u8D85\u9650\uFF08\u8F93\u5165\u4E0A\u9650 64MB\uFF09"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (exceeded) return;
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (_) {
        reject(userErr("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON"));
      }
    });
    req.on("error", reject);
  });
}
var server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-jq-query-token",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return;
  }
  try {
    if (url === "/__health") {
      sendJson(res, 200, { ok: true, version: VERSION, uptimeMs: Math.round(process.uptime() * 1e3), engine: engine.stats() });
      return;
    }
    if (!url.startsWith("/api/")) {
      fail(res, 404, "\u672A\u77E5\u8DEF\u5F84");
      return;
    }
    if (!authed(req)) {
      fail(res, 401, "\u7F3A\u5C11\u6216\u9519\u8BEF\u7684 token\uFF08\u9762\u677F\u5E94\u4ECE cap.kv jq-query.meta \u8BFB\u53D6\uFF09");
      return;
    }
    const body = await readBody(req);
    switch (url) {
      case "/api/query": {
        const r = await doQuery(body);
        log("info", `query ok ms=${r.ms} in=${r.inputBytes}B docs=${r.inputDocs} out=${r.rawBytes}B${r.truncated ? " TRUNCATED" : ""}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/check": {
        const r = await doCheck(body);
        log("info", `check syntaxOk=${r.syntaxOk}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/outline": {
        const r = await doOutline(body);
        log("info", `outline depth=${r.depth}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/reference": {
        const kw = typeof body.keyword === "string" ? body.keyword : "";
        const r = searchReference(kw, engineApi.LIMITS.REFERENCE_RESULT_CAP);
        sendJson(res, 200, { ok: true, keyword: kw, ...r, rendered: renderReference(r.entries) });
        return;
      }
      case "/api/selftest": {
        const r = await doSelftest();
        log("info", `selftest pass=${r.pass}/${r.total} timeouts=${r.engine.timeouts}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      default:
        fail(res, 404, `\u672A\u77E5 API ${url}`);
    }
  } catch (err) {
    const isUser = err && err.user;
    log(isUser ? "info" : "error", `${url} ${isUser ? "\u62D2\u7EDD" : "\u5185\u90E8\u9519\u8BEF"}: ${err && err.message}`);
    fail(res, isUser ? 400 : 500, err && err.message || "\u5185\u90E8\u9519\u8BEF");
  }
});
server.listen(PORT, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  log("info", `service listening on 127.0.0.1:${port} (version ${VERSION})`);
  kv.kvSet(KEY_META, {
    token,
    port,
    version: VERSION,
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).then(() => log("info", "meta \u5199\u5165 cap.kv \u6210\u529F")).catch((e) => log("warn", `meta \u5199 cap.kv \u5931\u8D25\uFF08\u6865\u964D\u7EA7\uFF0C\u9762\u677F\u5C06\u663E\u793A\u79BB\u7EBF\uFF09: ${e && e.message}`));
});
process.on("uncaughtException", (e) => log("error", `uncaught: ${e && e.stack ? e.stack : e}`));
process.on("unhandledRejection", (e) => log("error", `unhandledRejection: ${e && e.stack ? e.stack : e}`));
function shutdown() {
  log("info", "\u6536\u5230\u9000\u51FA\u4FE1\u53F7\uFF0C\u5173\u95ED\u670D\u52A1");
  engine.shutdown().catch(() => {
  });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
