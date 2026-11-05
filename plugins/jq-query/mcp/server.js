"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

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
      const log = opts && opts.log ? opts.log : () => {
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
        log("warn", `jq worker \u56DE\u6536\uFF08key=${flagsKey}\uFF09: ${reason}`);
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
    function outlineOf2(value, opts) {
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
    function renderOutline2(node) {
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
      const node = outlineOf2(value, opts);
      return { node, text: renderOutline2(node) };
    }
    module2.exports = { outlineOf: outlineOf2, renderOutline: renderOutline2, outlineFromText: outlineFromText2, typeOf };
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

// mcp/server-src.js
var fs = require("fs");
var path = require("path");
var { createEngine } = require_engine();
var engineApi = require_engine_api();
var { outlineFromText, outlineOf, renderOutline } = require_outline();
var { searchReference, renderReference } = require_reference();
var SERVER_INFO = { name: "jq-query", version: "0.1.0" };
var engine = createEngine({
  workerPath: path.join(__dirname, "..", "service", "worker.js"),
  log: (level, msg) => {
    try {
      process.stderr.write(`[jq-query-mcp:${level}] ${(/* @__PURE__ */ new Date()).toISOString()} ${msg}
`);
    } catch (_) {
    }
  }
});
var TOOLS = [
  {
    name: "jq_query",
    description: "\u7528\u771F\u5B9E jq \u5F15\u64CE\uFF08jq 1.7 \u8BED\u4E49\uFF09\u67E5\u8BE2/\u53D8\u6362 JSON\u3002\u4E09\u9009\u4E00\u8F93\u5165\uFF1Ajson\uFF08\u5185\u8054 JSON/NDJSON \u6587\u672C\uFF09\u3001filePath\uFF08\u7EDD\u5BF9\u8DEF\u5F84\u76F4\u8BFB \u226464MB\uFF09\u3001input\uFF08\u7EAF\u6587\u672C\u914D -R \u6309\u884C\u8BFB\uFF09\u3002\u8FD4\u56DE\u5168\u90E8\u8F93\u51FA\u4E0E\u8017\u65F6\u3002\u9002\u5408\uFF1A\u4ECE API \u54CD\u5E94/\u65E5\u5FD7/\u914D\u7F6E/HAR \u4E2D\u786E\u5B9A\u6027\u63D0\u53D6\u5B57\u6BB5\u3001\u8FC7\u6EE4\u6570\u7EC4\u3001\u805A\u5408\u7EDF\u8BA1\u2014\u2014\u5927 JSON \u4E0D\u8981\u624B\u7B97\uFF0C\u7528\u672C\u5DE5\u5177\u662F\u7CBE\u786E\u7684\u3002\u5E38\u7528 flag\uFF1A-r\uFF08\u5B57\u7B26\u4E32\u53BB\u5F15\u53F7\uFF09\u3001-c\uFF08\u5355\u884C\uFF09\u3001-s\uFF08\u6574\u4E2A\u8F93\u5165\u8BFB\u6210\u6570\u7EC4\uFF09\u3001-n\uFF08\u4E0D\u8BFB\u8F93\u5165\u9020\u6570\u636E\uFF09\u3001--arg k v / --argjson k v\uFF08\u6CE8\u5165 $k \u53D8\u91CF\uFF09\u3002\u67E5\u8BE2\u8BED\u6CD5\u62FF\u4E0D\u51C6\u53EF\u5148\u8C03 jq_reference\u3002",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'jq \u8FC7\u6EE4\u5668\uFF0C\u5982 ".users[] | select(.age > 30) | {name, age}"' },
        json: { type: "string", description: "\u5185\u8054\u8F93\u5165\uFF1AJSON \u6216 NDJSON\uFF08\u591A\u6587\u6863\u6D41\uFF09\u6587\u672C\uFF1B\u4E0E filePath \u4E8C\u9009\u4E00" },
        filePath: { type: "string", description: "\u8F93\u5165\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u226464MB\uFF09\uFF1B\u4E0E json \u4E8C\u9009\u4E00" },
        flags: {
          type: "array",
          items: { type: "string" },
          description: "jq CLI flags\uFF1A-r -c -s -n -R -S -j --tab --arg <\u540D> <\u503C> --argjson <\u540D> <JSON>\uFF08\u652F\u6301\u805A\u5408\u5F0F -rn\uFF09"
        },
        timeoutMs: { type: "number", description: "\u8D85\u65F6\u6BEB\u79D2\uFF0C\u7F3A\u7701 5000\uFF0C\u4E0A\u9650 30000\uFF1B\u8D85\u65F6\u67E5\u8BE2\u88AB\u7EC8\u6B62\u4E14\u4E0D\u81EA\u52A8\u91CD\u8BD5" }
      },
      required: ["query"]
    }
  },
  {
    name: "jq_check",
    description: "\u6821\u9A8C jq \u67E5\u8BE2\u8BED\u6CD5\uFF08-n \u7A7A\u8F93\u5165\u771F\u5B9E\u6267\u884C\u4E00\u6B21\uFF09\u3002\u8BED\u6CD5\u9519\u8BEF\u7ED9\u51FA jq \u539F\u751F\u62A5\u9519\uFF08\u542B\u4F4D\u7F6E\uFF09\uFF1B\u8FD0\u884C\u671F\u9519\u8BEF\u8BF4\u660E\u8BED\u6CD5 OK \u4F46\u7A7A\u8F93\u5165\u4E0B\u51FA\u9519\uFF08\u6570\u636E\u76F8\u5173\u7C7B\u578B\u9519\u8BEF\u9700\u771F\u5B9E\u8F93\u5165\u624D\u80FD\u66B4\u9732\uFF09\u3002\u5199\u590D\u6742\u67E5\u8BE2\u524D\u5148\u81EA\u68C0\u4E00\u6B21\u3002",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "\u8981\u6821\u9A8C\u7684 jq \u8FC7\u6EE4\u5668" } },
      required: ["query"]
    }
  },
  {
    name: "jq_reference",
    description: 'jq \u5185\u7F6E\u51FD\u6570/\u8BED\u6CD5\u901F\u67E5\u8868\uFF08\u7EA6 90 \u6761\uFF0C\u79BB\u7EBF\uFF09\u3002\u7ED9 keyword \u6309\u7B7E\u540D/\u8BED\u4E49/\u793A\u4F8B\u641C\u7D22\uFF08\u5982 "group"\u3001"\u65F6\u95F4"\u3001"\u6B63\u5219"\u3001"select"\uFF09\uFF1B\u4E0D\u7ED9 keyword \u8FD4\u56DE\u5E38\u7528\u5B50\u96C6\u3002\u6BCF\u6761\u542B\u6700\u5C0F\u53EF\u8DD1\u793A\u4F8B\u3002',
    inputSchema: {
      type: "object",
      properties: { keyword: { type: "string", description: "\u641C\u7D22\u5173\u952E\u8BCD\uFF08\u53EF\u7A7A\uFF09" } }
    }
  },
  {
    name: "json_outline",
    description: "\u8F93\u51FA JSON \u7ED3\u6784\u5927\u7EB2\uFF08\u4E0D\u4F9D\u8D56 jq\uFF09\uFF1A\u6839\u7C7B\u578B\u3001\u952E\u96C6\u5408\u3001\u6570\u7EC4\u957F\u5EA6\u4E0E\u5143\u7D20\u7C7B\u578B\u5206\u5E03\u3001\u5BF9\u8C61\u5143\u7D20\u7684\u952E\u5E76\u96C6\u3001\u6837\u672C\u503C\uFF08\u622A\u65AD\uFF09\u3002\u5199\u67E5\u8BE2\u524D\u5148\u770B\u61C2\u5927 JSON \u7684\u5F62\u72B6\uFF1B\u914D depth \u63A7\u5236\u5C55\u5F00\u6DF1\u5EA6\uFF08\u7F3A\u7701 3\uFF09\u3002",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "\u5185\u8054 JSON \u6587\u672C\uFF1B\u4E0E filePath \u4E8C\u9009\u4E00" },
        filePath: { type: "string", description: "\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u226464MB\uFF09" },
        depth: { type: "number", description: "\u5C55\u5F00\u6DF1\u5EA6 1-8\uFF0C\u7F3A\u7701 3" },
        maxChildren: { type: "number", description: "\u6BCF\u4E2A\u5C42\u7EA7\u6700\u591A\u5C55\u5F00\u7684\u5B50\u8282\u70B9\u6570\uFF0C\u7F3A\u7701 24" }
      }
    }
  },
  {
    name: "jq_selftest",
    description: "\u8BD5\u91D1\u77F3\u81EA\u68C0\uFF1A14 \u65AD\u8A00\u8D70\u771F\u5B9E\u5F15\u64CE\uFF08\u53D6\u503C/\u8FC7\u6EE4/NDJSON/flags/\u9519\u8BEF\u8BED\u4E49/\u8D85\u65F6\u51FB\u6740+\u91CD\u751F\u6210/outline\uFF09\uFF0C\u9010\u4E00\u62A5\u544A\u901A\u8FC7\u4E0E\u5426\u3002\u5F15\u64CE\u884C\u4E3A\u5F02\u5E38\u65F6\u5148\u8DD1\u8FD9\u4E2A\u3002",
    inputSchema: { type: "object", properties: {} }
  }
];
function dump(value, indent) {
  const pad = indent || "";
  if (value == null) return String(value);
  try {
    return pad + JSON.stringify(value, null, 2);
  } catch (_) {
    return pad + String(value);
  }
}
function truncate(text, max) {
  const s = String(text == null ? "" : text);
  if (s.length <= max) return s;
  return s.slice(0, Math.floor(max * 0.7)) + `
\u2026\uFF08\u4E2D\u6BB5\u622A\u65AD\uFF0C\u5168\u6587 ${s.length} \u5B57\u7B26\uFF09\u2026
` + s.slice(-Math.floor(max * 0.2));
}
function readFilePath(fp) {
  if (!fp || typeof fp !== "string") throw userErr("\u9700\u8981 json\uFF08\u5185\u8054\u6587\u672C\uFF09\u6216 filePath\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09");
  if (!path.isAbsolute(fp)) throw userErr(`filePath \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${fp}`);
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
function userErr(msg) {
  return Object.assign(new Error(msg), { user: true });
}
async function toolJqQuery(args) {
  const query = args && args.query;
  if (typeof query !== "string" || !query.trim()) throw userErr("\u9700\u8981\u975E\u7A7A query");
  const nf = engineApi.normalizeFlags(args.flags);
  if (!nf.ok) throw userErr(nf.error);
  let input;
  if (args.json != null) {
    if (typeof args.json !== "string") throw userErr("json \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
    if (Buffer.byteLength(args.json, "utf8") > engineApi.LIMITS.INPUT_MAX_BYTES) throw userErr("json \u8D85\u8FC7\u4E0A\u9650 64MB");
    input = args.json;
  } else if (args.filePath) {
    input = readFilePath(args.filePath);
  } else {
    input = "";
  }
  const timeoutMs = engineApi.clampTimeoutMs(args.timeoutMs);
  const inputInfo = engineApi.inputStats(input);
  if (inputInfo.hasParseError && !nf.flags.includes("-R") && !nf.flags.includes("-n")) {
    throw userErr(`\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON/NDJSON\uFF1A${inputInfo.parseError}\uFF08\u82E5\u662F\u65E5\u5FD7\u6587\u672C\u8BF7\u52A0 -R \u6309\u884C\u539F\u6837\u8BFB\uFF09`);
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
  const lines = [];
  lines.push(`jq \u67E5\u8BE2\u5B8C\u6210\uFF1A${r.ms}ms\uFF0C\u8F93\u5165 ${inputInfo.bytes}B/${inputInfo.docCount} \u6587\u6863\uFF0C\u8F93\u51FA ${bytes}B\uFF0Cflags=[${nf.flags.join(" ")}]`);
  if (bytes > engineApi.LIMITS.RESULT_MAX_BYTES) {
    lines.push(`\uFF08\u8F93\u51FA\u8D85\u8FC7 8MB \u4E0A\u9650\u5DF2\u622A\u65AD\u2014\u2014\u7528 -c \u6216 limit/first \u7F29\u5C0F\u7ED3\u679C\uFF09`);
    lines.push(truncate(raw, 6e3));
  } else {
    const parsed = engineApi.parseOutputs(raw);
    lines.push(`\u8F93\u51FA ${parsed.length} \u9879\uFF1A`);
    if (parsed.length === 0) {
      lines.push("\uFF08\u7A7A\u6D41\uFF1A\u67E5\u8BE2\u5408\u6CD5\u4F46\u672A\u4EA7\u51FA\u7ED3\u679C\uFF09");
    } else {
      const shown = parsed.slice(0, 20);
      for (const p of shown) {
        if (p.error) lines.push(`  \u26A0 \u8F93\u51FA\u6BB5\u89E3\u6790\u5931\u8D25\uFF08\u539F\u6837\u4FDD\u7559\u524D 200 \u5B57\u7B26\uFF09\uFF1A${p.raw}`);
        else lines.push(truncate(dump(p.value, "  "), 2e3));
      }
      if (parsed.length > shown.length) lines.push(`\u2026\u5176\u4F59 ${parsed.length - shown.length} \u9879\u672A\u5C55\u5F00\uFF08\u5171 ${parsed.length} \u9879\uFF09`);
    }
  }
  return lines.join("\n");
}
async function toolJqCheck(args) {
  const query = args && args.query;
  if (typeof query !== "string" || !query.trim()) throw userErr("\u9700\u8981\u975E\u7A7A query");
  try {
    await engine.run({ input: "null", query, flags: ["-n"], timeoutMs: engineApi.clampTimeoutMs(args && args.timeoutMs) });
    return "\u2713 \u8BED\u6CD5 OK\uFF08-n \u7A7A\u8F93\u5165\u6267\u884C\u4E00\u6B21\uFF1B\u6570\u636E\u76F8\u5173\u7C7B\u578B\u9519\u8BEF\u9700\u771F\u5B9E\u8F93\u5165\u624D\u80FD\u66B4\u9732\uFF09";
  } catch (e) {
    const msg = String(e && e.message || e);
    if (e && e.timeout) throw e;
    const isSyntax = /syntax error|compile error|unexpected/i.test(msg);
    if (isSyntax) throw userErr(`\u2717 \u8BED\u6CD5\u9519\u8BEF\uFF1A${msg}`);
    return `\u2713 \u8BED\u6CD5 OK\uFF08\u7A7A\u8F93\u5165\u4E0B\u51FA\u73B0\u8FD0\u884C\u671F\u9519\u8BEF\uFF0C\u5C5E\u6570\u636E\u76F8\u5173\uFF1A${truncate(msg, 240)}\uFF09`;
  }
}
async function toolJqReference(args) {
  const kw = args && typeof args.keyword === "string" ? args.keyword : "";
  const r = searchReference(kw, engineApi.LIMITS.REFERENCE_RESULT_CAP);
  const head = kw ? `\u5173\u952E\u8BCD\u300C${kw}\u300D\u547D\u4E2D ${r.total} \u6761${r.truncated ? `\uFF08\u4EC5\u663E\u793A\u524D ${r.entries.length}\uFF09` : ""}\uFF1A` : `jq \u901F\u67E5\u8868\u5171 ${r.total + 0} \u6761\u547D\u4E2D\uFF08\u672A\u7ED9\u5173\u952E\u8BCD\uFF0C\u663E\u793A\u524D ${r.entries.length} \u6761\uFF1B\u7ED9 keyword \u53EF\u641C\u7D22\u5168\u90E8\uFF09:`;
  return `${head}

${renderReference(r.entries)}`;
}
async function toolJsonOutline(args) {
  const depth = Math.max(1, Math.min(8, Number(args && args.depth) || 3));
  const maxChildren = Math.max(1, Math.min(64, Number(args && args.maxChildren) || 24));
  let text;
  if (args && args.json != null) {
    if (typeof args.json !== "string") throw userErr("json \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
    text = args.json;
  } else if (args && args.filePath) {
    text = readFilePath(args.filePath);
  } else {
    throw userErr("\u9700\u8981 json\uFF08\u5185\u8054\u6587\u672C\uFF09\u6216 filePath\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09");
  }
  const r = outlineFromText(text, { depth, maxChildren });
  if (!r) throw userErr("\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON\uFF08outline \u53EA\u63A5\u53D7\u5355\u6587\u6863 JSON\uFF1BNDJSON \u8BF7\u5148\u53D6\u5355\u4E2A\u6587\u6863\u6216\u7528 jq -s\uFF09");
  return `JSON \u7ED3\u6784\u5927\u7EB2\uFF08depth=${depth}\uFF09\uFF1A
${truncate(r.text, 8e3)}

\u63D0\u793A\uFF1A\u7528 .rows[] | select(.id == \u2026) \u904D\u5386\u6570\u7EC4\uFF1B\u5143\u7D20\u952E\u5E76\u96C6\u5DF2\u5728\u4E0A\u65B9\u5217\u51FA\u3002`;
}
async function toolJqSelftest() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: Boolean(cond), detail: detail || "" });
  const q = async (input, query, flags) => (await engine.run({ input, query, flags: flags || [], timeoutMs: 8e3 })).out;
  try {
    ok("add \u805A\u5408", (await q('{"a":{"b":[1,2,3]}}', ".a.b | add")).trim() === "6");
  } catch (e) {
    ok("add \u805A\u5408", false, String(e.message));
  }
  try {
    ok("select \u8FC7\u6EE4", (await q('[{"n":1},{"n":5}]', "[.[] | select(.n > 3)] | length")).trim() === "1");
  } catch (e) {
    ok("select \u8FC7\u6EE4", false, String(e.message));
  }
  try {
    ok("NDJSON --slurp", (await q('{"n":1}\n{"n":2}\n{"n":3}', "length", ["--slurp"])).trim() === "3");
  } catch (e) {
    ok("NDJSON --slurp", false, String(e.message));
  }
  try {
    ok("\u591A\u6587\u6863\u591A\u8F93\u51FA", (await q('{"a":1}\n{"a":2}', ".a")).trim() === "1\n2");
  } catch (e) {
    ok("\u591A\u6587\u6863\u591A\u8F93\u51FA", false, String(e.message));
  }
  try {
    ok("-r + @csv", (await q('"x"', '["a","b"] | @csv', ["-r"])).includes('"a","b"'));
  } catch (e) {
    ok("-r + @csv", false, String(e.message));
  }
  try {
    await q("null", ".a | tonumber");
    ok("\u8FD0\u884C\u9519\u8BEF\u5FC5\u987B\u629B\u51FA", false);
  } catch (e) {
    ok("\u8FD0\u884C\u9519\u8BEF\u5FC5\u987B\u629B\u51FA", Boolean(e && e.jq), String(e.message).slice(0, 60));
  }
  try {
    await q("null", ".a ++");
    ok("\u8BED\u6CD5\u9519\u8BEF\u5FC5\u987B\u629B\u51FA", false);
  } catch (e) {
    ok("\u8BED\u6CD5\u9519\u8BEF\u5FC5\u987B\u629B\u51FA", Boolean(e && e.jq && /syntax|compile/i.test(String(e.message))), String(e.message).slice(0, 60));
  }
  try {
    ok("--arg/--argjson", (await q("null", "$x + $y.v", ["-n", "--argjson", "x", "4", "--argjson", "y", '{"v":38}'])).trim() === "42");
  } catch (e) {
    ok("--arg/--argjson", false, String(e.message));
  }
  try {
    ok("todate", (await q("1700000000", 'todate | startswith("2023-11-14")')).trim() === "true");
  } catch (e) {
    ok("todate", false, String(e.message));
  }
  try {
    ok("capture \u547D\u540D\u7EC4", (await q('"id=42x"', 'capture("(?<n>[0-9]+)") | .n')).trim() === '"42"');
  } catch (e) {
    ok("capture \u547D\u540D\u7EC4", false, String(e.message));
  }
  const before = engine.stats().timeouts;
  try {
    await engine.run({ input: "0", query: "[repeat(.+1)]", flags: [], timeoutMs: 800 });
    ok("\u8D85\u65F6\u51FB\u6740", false);
  } catch (e) {
    ok("\u8D85\u65F6\u51FB\u6740", Boolean(e && e.timeout), String(e.message).slice(0, 60));
  }
  ok("\u8D85\u65F6\u8BA1\u6570+1", engine.stats().timeouts === before + 1);
  try {
    ok("\u51FB\u6740\u540E\u91CD\u751F\u6210\u53EF\u7528", (await q('{"v":[10,20]}', ".v | add")).trim() === "30");
  } catch (e) {
    ok("\u51FB\u6740\u540E\u91CD\u751F\u6210\u53EF\u7528", false, String(e.message));
  }
  try {
    const o = outlineOf({ rows: [{ id: 1 }] }, { depth: 2 });
    ok("outline \u952E\u5E76\u96C6", o.children[0].elementKeys && o.children[0].elementKeys[0] === "id");
  } catch (e) {
    ok("outline \u952E\u5E76\u96C6", false, String(e.message));
  }
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  const lines = results.map((r) => `${r.pass ? "\u2713" : "\u2717"} ${r.name}${r.pass ? "" : ` \u2014 ${r.detail}`}`);
  return `\u8BD5\u91D1\u77F3 ${pass}/${results.length} \u901A\u8FC7\uFF08fail=${fail}\uFF0C\u5F15\u64CE timeouts=${engine.stats().timeouts}\uFF09
${lines.join("\n")}`;
}
var TOOL_IMPL = {
  jq_query: toolJqQuery,
  jq_check: toolJqCheck,
  jq_reference: toolJqReference,
  json_outline: toolJsonOutline,
  jq_selftest: toolJqSelftest
};
var buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  buf += c;
});
process.stdin.on("end", () => process.exit(0));
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function rpcError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params && params.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      }
    });
    return;
  }
  if (method === "notifications/initialized" || (method || "").startsWith("notifications/")) return;
  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }
  if (method === "tools/call") {
    const name = params && params.name;
    const args = params && params.arguments || {};
    const impl = TOOL_IMPL[name];
    if (!impl) {
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `\u672A\u77E5\u5DE5\u5177: ${name}` }], isError: true } });
      return;
    }
    const t0 = Date.now();
    try {
      const text = await impl(args);
      process.stderr.write(`[jq-query-mcp:info] tool=${name} ms=${Date.now() - t0}
`);
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(text) }], isError: false } });
    } catch (e) {
      process.stderr.write(`[jq-query-mcp:info] tool=${name} error ms=${Date.now() - t0} user=${Boolean(e && e.user)}
`);
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `\u9519\u8BEF\uFF1A${e && e.message || String(e)}` }], isError: true } });
    }
    return;
  }
  if (id !== void 0 && id !== null) rpcError(id, -32601, `\u672A\u77E5\u65B9\u6CD5: ${method}`);
}
var pending = Promise.resolve();
process.stdin.on("data", () => {
  for (; ; ) {
    const i = buf.indexOf("\n");
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      continue;
    }
    pending = pending.then(() => handle(msg)).catch((e) => {
      process.stderr.write(`[jq-query-mcp:error] handle: ${e && e.stack ? e.stack : e}
`);
      if (msg && msg.id !== void 0 && msg.id !== null) rpcError(msg.id, -32603, "\u5185\u90E8\u9519\u8BEF");
    });
  }
});
process.on("uncaughtException", (e) => {
  process.stderr.write(`[jq-query-mcp:error] uncaught: ${e && e.stack ? e.stack : e}
`);
});
process.on("unhandledRejection", (e) => {
  process.stderr.write(`[jq-query-mcp:error] unhandledRejection: ${e && e.stack ? e.stack : e}
`);
});
async function shutdown() {
  await engine.shutdown().catch(() => {
  });
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
