"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/claim-core.js
var require_claim_core = __commonJS({
  "shared/claim-core.js"(exports2, module2) {
    "use strict";
    var VERDICTS = ["verified", "refuted", "partial", "unverifiable"];
    var VERDICT_LABEL = {
      verified: "\u2713 \u5DF2\u8BC1\u5B9E",
      refuted: "\u2717 \u5DF2\u8BC1\u4F2A",
      partial: "\u25D0 \u90E8\u5206\u6838\u5B9E",
      unverifiable: "? \u65E0\u6CD5\u6838\u9A8C"
    };
    var CLI_KNOWN = /* @__PURE__ */ new Set([
      "git",
      "npm",
      "pnpm",
      "yarn",
      "node",
      "deno",
      "bun",
      "npx",
      "tsc",
      "vite",
      "webpack",
      "eslint",
      "prettier",
      "cargo",
      "rustc",
      "rustup",
      "go",
      "python",
      "python3",
      "pip",
      "pip3",
      "uv",
      "poetry",
      "docker",
      "kubectl",
      "helm",
      "make",
      "cmake",
      "curl",
      "wget",
      "ssh",
      "scp",
      "jest",
      "vitest",
      "pytest",
      "gradle",
      "mvn",
      "dotnet",
      "java",
      "javac",
      "code",
      "rg",
      "grep",
      "find",
      "sed",
      "awk",
      "chmod",
      "tar",
      "zip",
      "unzip"
    ]);
    var PKG_INSTALL = /* @__PURE__ */ new Set(["install", "i", "add", "install-save", "save"]);
    var NODE_BUILTIN = /* @__PURE__ */ new Set([
      "fs",
      "path",
      "os",
      "crypto",
      "http",
      "https",
      "url",
      "util",
      "child_process",
      "stream",
      "zlib",
      "events",
      "buffer",
      "process",
      "querystring",
      "string_decoder",
      "timers",
      "tls",
      "net",
      "dns",
      "readline",
      "assert",
      "worker_threads",
      "perf_hooks",
      "v8",
      "vm",
      "cluster",
      "dgram",
      "domain",
      "module",
      "repl",
      "inspector",
      "async_hooks",
      "http2",
      "constants",
      "punycode",
      "sys",
      "tty",
      "vhs"
    ]);
    var FILE_EXT = /* @__PURE__ */ new Set([
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "mts",
      "cts",
      "py",
      "pyi",
      "rs",
      "go",
      "java",
      "kt",
      "kts",
      "rb",
      "php",
      "cs",
      "cpp",
      "cc",
      "c",
      "h",
      "hpp",
      "hh",
      "swift",
      "dart",
      "scala",
      "vue",
      "svelte",
      "astro",
      "md",
      "mdx",
      "txt",
      "json",
      "jsonc",
      "json5",
      "ya",
      "yml",
      "yaml",
      "toml",
      "ini",
      "cfg",
      "conf",
      "env",
      "lock",
      "css",
      "scss",
      "sass",
      "less",
      "html",
      "htm",
      "xml",
      "sh",
      "bash",
      "zsh",
      "bat",
      "cmd",
      "ps1",
      "psm1",
      "sql",
      "proto",
      "graphql",
      "gql",
      "prisma",
      "dockerfile",
      "gitignore",
      "editorconfig",
      "csv",
      "tsv"
    ]);
    var CONFIG_EXT = /* @__PURE__ */ new Set(["json", "jsonc", "json5", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "properties"]);
    var MAX_CLAIMS = 200;
    var MAX_TEXT = 2 * 1024 * 1024;
    var isStr = (v) => typeof v === "string";
    function extOf(name) {
      const m = /\.([A-Za-z0-9]+)$/.exec(name);
      return m ? m[1].toLowerCase() : "";
    }
    function baseName(p) {
      const s = String(p).replace(/\\/g, "/");
      const i = s.lastIndexOf("/");
      return i === -1 ? s : s.slice(i + 1);
    }
    function safeIdentSrc(name) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
      return name.replace(/\$/g, "\\$");
    }
    function splitSentences(text) {
      const out = [];
      const re = /[^。；;;\n]+[。；;;\n]?/g;
      let m;
      let idx = 0;
      while ((m = re.exec(text)) !== null) {
        out.push({ text: m[0], start: idx });
        idx += m[0].length;
        if (m[0].length === 0) re.lastIndex++;
      }
      return out;
    }
    function lineAt(text, charIdx) {
      let line = 1;
      for (let i = 0; i < charIdx && i < text.length; i++) if (text[i] === "\n") line++;
      return line;
    }
    function createCollector() {
      const seen = /* @__PURE__ */ new Map();
      const claims = [];
      function add(c) {
        if (claims.length >= MAX_CLAIMS) return false;
        const key = `${c.type}|${c.target || ""}|${c.file || ""}|${(c.flags || []).join(" ")}|${c.constraint || ""}`;
        if (seen.has(key)) {
          const prev = seen.get(key);
          if (c.quote && !prev.quote) prev.quote = c.quote;
          return false;
        }
        seen.set(key, c);
        claims.push(c);
        return true;
      }
      return { add, claims };
    }
    function isFilePathToken(tok) {
      const t = tok.replace(/\\/g, "/");
      if (!t || t.includes("://") || t.includes("..") || /\s/.test(t)) return false;
      if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|dev|cn|edu|gov|me|app|co|ai|info|xyz|sh|so)(?:\/|$)/i.test(t)) return false;
      const ext = extOf(baseName(t));
      if (!ext || !FILE_EXT.has(ext)) return false;
      if (t.includes("/")) return true;
      return /^[A-Za-z0-9][A-Za-z0-9_.\-]*$/.test(baseName(t));
    }
    function classifyBacktickToken(tok, ctx) {
      const t = tok.trim();
      if (!t || t.length > 200) return null;
      if (t.startsWith("!--") || /\s/.test(t)) {
        if (/\s/.test(t)) return null;
      }
      if (/^--[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t) || /^-[A-Za-z]$/.test(t)) {
        return { type: "cli", target: ctx.cmd || null, flags: [t], raw: t };
      }
      if (isFilePathToken(t)) {
        const ext = extOf(baseName(t));
        return { type: "file", target: t, raw: t, configish: CONFIG_EXT.has(ext) };
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(t) && !isFilePathToken(t)) {
        return { type: "config", target: t, raw: t };
      }
      const mParen = /^([A-Za-z_$][A-Za-z0-9_$]*)\(\)$/.exec(t);
      if (mParen) return { type: "symbol", target: mParen[1], raw: t };
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t) && t.length >= 4) {
        const hasCamel = /[a-z][A-Z]/.test(t);
        const hasSnake = /[a-z0-9]_/i.test(t);
        const isUpperAbbrev = /^[A-Z0-9_]+$/.test(t);
        if ((hasCamel || hasSnake || /^[A-Z][a-z]/.test(t)) && !isUpperAbbrev) {
          return { type: "symbol", target: t, raw: t };
        }
      }
      return null;
    }
    function parseCommandLine(line) {
      const raw = line.trim().replace(/^\$\s*/, "");
      let toks = raw.split(/\s+/).filter(Boolean);
      while (toks.length && /^(?:sudo|env|NO_COLOR=1|NODE_ENV=\w+)$/i.test(toks[0])) toks = toks.slice(1);
      while (toks.length && /^[A-Z_]+=\S+$/.test(toks[0])) toks = toks.slice(1);
      if (!toks.length) return null;
      const cmd = toks[0];
      if (!CLI_KNOWN.has(cmd)) return null;
      const rest = toks.slice(1);
      const subcmd = [];
      const flags = [];
      const pkgSpecs = [];
      for (const tk of rest) {
        if (/^--[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tk) || /^-[A-Za-z]$/.test(tk)) {
          flags.push(tk);
          continue;
        }
        if (!/^[A-Za-z@][A-Za-z0-9@/._-]*$/.test(tk)) continue;
        if (PKG_INSTALL.has(subcmd[0] || "") && cmd && ["npm", "pnpm", "yarn", "bun"].includes(cmd)) {
          pkgSpecs.push(tk);
          continue;
        }
        if (flags.length === 0 && subcmd.length < 2) {
          subcmd.push(tk);
          continue;
        }
      }
      return { cmd, subcmd, flags, pkgSpecs };
    }
    function pkgFromSpec(spec) {
      let s = spec.replace(/^(https?:\/\/[^/]+\/)/, "");
      if (s.includes(":")) return null;
      s = s.split("@").length && s.startsWith("@") ? (() => {
        const i = s.indexOf("@", 1);
        return i === -1 ? s : s.slice(0, i);
      })() : s.split("@")[0];
      if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("~")) return null;
      if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(s)) return null;
      return s;
    }
    function pkgFromImport(spec) {
      if (!isStr(spec) || !spec) return null;
      if (spec.startsWith("node:")) return null;
      if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/") || spec.startsWith("~/")) return null;
      let base = spec;
      if (spec.startsWith("@")) {
        const i = spec.indexOf("/", 1);
        if (i === -1) return null;
        base = spec.slice(0, spec.indexOf("/", i + 1) === -1 ? spec.length : spec.indexOf("/", i + 1));
      } else {
        base = spec.split("/")[0];
      }
      if (NODE_BUILTIN.has(base)) return null;
      if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(base)) return null;
      return base;
    }
    function extractClaims(text, opts) {
      const options = opts || {};
      const src = isStr(text) ? text.slice(0, MAX_TEXT) : "";
      const col = createCollector();
      if (!src.trim()) return { claims: col.claims, stats: { chars: 0, codeBlocks: 0 } };
      const blocks = [];
      const lines = src.split("\n");
      let inCode = false;
      let cur = null;
      for (let i = 0; i < lines.length; i++) {
        const fence = /^\s*(```|~~~)\s*([A-Za-z0-9+#-]*)\s*$/.exec(lines[i]);
        if (fence) {
          if (inCode && cur) {
            cur.end = i;
            blocks.push(cur);
            cur = null;
          } else if (!inCode) {
            cur = { lang: (fence[2] || "").toLowerCase(), start: i + 1, lines: [] };
            inCode = true;
            continue;
          }
          inCode = cur ? true : false;
          if (cur) continue;
          continue;
        }
        if (inCode && cur) cur.lines.push({ no: i + 1, text: lines[i] });
      }
      if (cur) blocks.push(cur);
      const proseLines = [];
      {
        let bi = 0;
        for (let i = 0; i < lines.length; i++) {
          while (bi < blocks.length && blocks[bi].end === i) bi++;
          const inBlock = blocks.some((b) => i >= b.start && (b.end == null || i <= b.end) && i !== b.start - 1);
          if (!inBlock) proseLines.push({ no: i + 1, text: lines[i] });
        }
      }
      for (const b of blocks) {
        for (const ln of b.lines) {
          const t = ln.text.trim();
          if (!t) continue;
          const importRe = /(?:import\s[^'"]*?from\s*|import\s+|export\s+[^'"]*?from\s*|require\s*\(\s*|from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
          let im;
          const isPy = b.lang === "python" || b.lang === "py";
          while ((im = importRe.exec(t)) !== null) {
            const spec = im[1];
            const isPyStyle = isPy || /^\s*from\s/.test(t);
            const pkg = isPyStyle ? pyPkgFromSpec(spec) : pkgFromImport(spec);
            if (pkg) {
              col.add({ type: "package", target: pkg, raw: spec, quote: t, line: ln.no, source: "code" });
            }
          }
          if (!/^(?:import|export|from|require|const|let|var)\b/.test(t)) {
            const cmdParsed = parseCommandLine(t);
            if (cmdParsed) {
              col.add({
                type: "cli",
                target: cmdParsed.cmd,
                subcmd: cmdParsed.subcmd,
                flags: cmdParsed.flags,
                raw: t,
                quote: t,
                line: ln.no,
                source: "code"
              });
              for (const spec of cmdParsed.pkgSpecs) {
                const pkg = pkgFromSpec(spec);
                if (pkg) col.add({ type: "package", target: pkg, raw: spec, quote: t, line: ln.no, source: "code" });
              }
            }
          }
          const pathRe2 = /(?<![:/\w.])(?:[A-Za-z]:\\(?:[A-Za-z0-9_.\- \\]+)?|[\w@.-]+(?:\/[\w@.-]+)+\.[A-Za-z0-9]{1,6})/g;
          let pm;
          while ((pm = pathRe2.exec(t)) !== null) {
            if (isFilePathToken(pm[0])) {
              col.add({ type: "file", target: pm[0], raw: pm[0], quote: t, line: ln.no, source: "code" });
            }
          }
        }
      }
      const proseText = proseLines.map((l) => l.text).join("\n");
      const sentences = splitSentences(proseText);
      const btRe = /`([^`\n]{1,200})`/g;
      let bt;
      while ((bt = btRe.exec(proseText)) !== null) {
        const tok = bt[1];
        const charIdx = bt.index;
        const line = lineAt(proseText, charIdx);
        const sent = sentences.find((s) => charIdx >= s.start && charIdx < s.start + s.text.length) || { text: "" };
        if (/import|require|from\s+['"]/.test(tok)) {
          const importRe2 = /(?:import\s[^'"]*?from\s*|import\s+|require\s*\(\s*|from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
          let im2;
          while ((im2 = importRe2.exec(tok)) !== null) {
            const pkg = pkgFromImport(im2[1]);
            if (pkg) col.add({ type: "package", target: pkg, raw: tok, quote: tok, line, source: "prose" });
          }
        }
        const pkgCandidate = pkgFromImport(tok);
        if (pkgCandidate && !isFilePathToken(tok) && (tok.startsWith("@") || /安装|依赖|导入|import|require|package|安装包|npm|pnpm/.test(sent.text))) {
          col.add({ type: "package", target: pkgCandidate, quote: tok, line, source: "prose" });
          continue;
        }
        if (/\s/.test(tok)) {
          const cmdParsed = parseCommandLine(tok);
          if (cmdParsed) {
            col.add({
              type: "cli",
              target: cmdParsed.cmd,
              subcmd: cmdParsed.subcmd,
              flags: cmdParsed.flags,
              raw: tok,
              quote: tok,
              line,
              source: "prose"
            });
            for (const spec of cmdParsed.pkgSpecs) {
              const pkg = pkgFromSpec(spec);
              if (pkg) col.add({ type: "package", target: pkg, raw: spec, quote: tok, line, source: "prose" });
            }
            continue;
          }
        }
        const cmdInSentence = /(?:^|[^`\w])(git|npm|pnpm|yarn|node|cargo|python3?|docker|kubectl|go|pip3?)\b/.exec(sent.text);
        const cfgFileInSentence = /([\w@./\\-]+\.(?:json|jsonc|ya?ml|toml|ini|cfg|conf|env))\b/i.exec(sent.text);
        const cls = classifyBacktickToken(tok, { cmd: cmdInSentence ? cmdInSentence[1] : null });
        if (!cls) continue;
        if (cls.type === "config" && cfgFileInSentence) cls.file = cfgFileInSentence[1];
        if (cls.type === "symbol") {
          const fileInSentence = /([\w@./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|cs|vue|svelte))\b/i.exec(sent.text);
          if (fileInSentence) cls.file = fileInSentence[1];
        }
        col.add({ ...cls, quote: tok, line, source: "prose" });
      }
      const verRe = /\b(Node(?:\.?js)?|npm|pnpm|python3?|git|cargo|rustc|docker|kubectl|go(?:lang)?|deno|bun)\s*(?:版本\s*)?(?:>=|≥|以上|v|版本)?\s*v?(\d{1,3}(?:\.\d{1,3}){0,2})/gi;
      let vm;
      while ((vm = verRe.exec(proseText)) !== null) {
        const word = vm[1].toLowerCase();
        const cmd = word === "nodeljs" || word === "nodel" ? "node" : word.replace("golang", "go");
        col.add({ type: "version", target: cmd, constraint: vm[2], raw: vm[0], line: lineAt(proseText, vm.index), source: "prose" });
      }
      const pathRe = /(?<![:/\w.])(?:[A-Za-z]:\\(?:[A-Za-z0-9_.\- \\]+)?|[\w@.-]+(?:\/[\w@.-]+)+\.[A-Za-z0-9]{1,6})/g;
      let pm2;
      while ((pm2 = pathRe.exec(proseText)) !== null) {
        if (isFilePathToken(pm2[0])) {
          col.add({ type: "file", target: pm2[0], raw: pm2[0], line: lineAt(proseText, pm2.index), source: "prose" });
        }
      }
      const order = { file: 0, symbol: 1, package: 2, cli: 3, config: 4, version: 5 };
      col.claims.sort((a, b) => order[a.type] - order[b.type] || String(a.target).localeCompare(String(b.target)));
      col.claims.forEach((c, i) => {
        c.id = i + 1;
      });
      return { claims: col.claims, stats: { chars: src.length, codeBlocks: blocks.length } };
    }
    function pyPkgFromSpec(spec) {
      if (!spec || spec.startsWith(".")) return null;
      const base = spec.split("/")[0].split(".")[0];
      if (!base || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) return null;
      return base;
    }
    var CLAIM_TYPES = /* @__PURE__ */ new Set(["file", "symbol", "package", "cli", "config", "version"]);
    function normalizeClaim(raw, idx) {
      const c = raw && typeof raw === "object" ? raw : {};
      if (!CLAIM_TYPES.has(c.type)) fail2(`claims[${idx}].type \u5FC5\u987B\u662F ${[...CLAIM_TYPES].join("/")} \u4E4B\u4E00`);
      const target = isStr(c.target) ? c.target.trim() : "";
      if (!target) fail2(`claims[${idx}].target \u4E0D\u80FD\u4E3A\u7A7A`);
      const out = {
        type: c.type,
        target: target.slice(0, 400),
        file: isStr(c.file) && c.file.trim() ? c.file.trim().slice(0, 400) : null,
        subcmd: Array.isArray(c.subcmd) ? c.subcmd.filter(isStr).map((s) => String(s).trim()).filter(Boolean).slice(0, 3) : [],
        flags: Array.isArray(c.flags) ? c.flags.filter(isStr).map((s) => String(s).trim()).filter(Boolean).slice(0, 8) : [],
        constraint: isStr(c.constraint) ? c.constraint.trim().slice(0, 40) : null,
        quote: isStr(c.quote) ? c.quote.slice(0, 300) : "",
        id: idx + 1
      };
      if (c.type === "symbol" && !safeIdentSrc(out.target)) fail2(`claims[${idx}].target \u4E0D\u662F\u5408\u6CD5\u6807\u8BC6\u7B26: ${out.target}`);
      if (c.type === "package" && !pkgFromImport(out.target) && !pkgFromSpec(out.target)) fail2(`claims[${idx}].target \u4E0D\u662F\u5408\u6CD5\u5305\u540D: ${out.target}`);
      if (c.type === "cli" && !/^[a-z][a-z0-9._-]*$/i.test(out.target)) fail2(`claims[${idx}].target \u4E0D\u662F\u5408\u6CD5\u547D\u4EE4\u540D: ${out.target}`);
      if (c.type === "version" && !/^\d{1,3}(\.\d{1,3}){0,2}$/.test(out.constraint || "")) fail2(`claims[${idx}].constraint \u5FC5\u987B\u662F x.y.z \u5F62\u5F0F`);
      if (c.type === "config") {
        const segs = out.target.split(".");
        if (segs.length < 1 || !segs.every((s) => /^[A-Za-z0-9_$-]+$/.test(s))) fail2(`claims[${idx}].target \u5FC5\u987B\u662F\u70B9\u8DEF\u5F84: ${out.target}`);
      }
      if (c.type === "file" && (out.target.includes("..") || out.target.includes("://"))) fail2(`claims[${idx}].target \u7591\u4F3C\u8DEF\u5F84\u7A7F\u8D8A/URL: ${out.target}`);
      return out;
    }
    function fail2(msg) {
      const e = new Error(msg);
      e.user = true;
      throw e;
    }
    function normalizeClaims(list) {
      if (!Array.isArray(list)) fail2("claims \u5FC5\u987B\u662F\u6570\u7EC4");
      if (list.length === 0) fail2("claims \u4E3A\u7A7A");
      if (list.length > 300) fail2("\u5355\u6B21\u6838\u9A8C\u58F0\u660E\u6570 \u2264 300");
      return list.map((c, i) => normalizeClaim(c, i));
    }
    function formatReport(report) {
      const L = [];
      const s = report.summary;
      L.push(`\u6838\u9A8C\u62A5\u544A \u2014\u2014 ${report.root}`);
      L.push(`\u5171 ${s.total} \u6761\u58F0\u660E\uFF1A${VERDICT_LABEL.verified} ${s.verified} \xB7 ${VERDICT_LABEL.refuted} ${s.refuted} \xB7 ${VERDICT_LABEL.partial} ${s.partial} \xB7 ${VERDICT_LABEL.unverifiable} ${s.unverifiable}`);
      if (report.gitStatusNote) L.push(`git status\uFF1A${report.gitStatusNote}`);
      L.push("");
      for (const c of report.claims) {
        const loc = c.file ? ` @${c.file}` : "";
        L.push(`[${VERDICT_LABEL[c.verdict]}] #${c.id} ${c.type}: ${c.target}${loc}${(c.flags || []).length ? " " + c.flags.join(" ") : ""}${c.constraint ? " (>= " + c.constraint + ")" : ""}`);
        if (c.quote) L.push(`    \u539F\u6587: ${c.quote.length > 120 ? c.quote.slice(0, 117) + "\u2026" : c.quote}`);
        for (const ev of c.evidence || []) L.push(`    \u8BC1\u636E: ${ev}`);
        if (c.hint) L.push(`    \u8BF4\u660E: ${c.hint}`);
      }
      return L.join("\n");
    }
    function summarize(claims) {
      const s = { total: claims.length, verified: 0, refuted: 0, partial: 0, unverifiable: 0 };
      for (const c of claims) s[c.verdict] = (s[c.verdict] || 0) + 1;
      return s;
    }
    module2.exports = {
      VERDICTS,
      VERDICT_LABEL,
      CLI_KNOWN,
      NODE_BUILTIN,
      FILE_EXT,
      CONFIG_EXT,
      extractClaims,
      normalizeClaim,
      normalizeClaims,
      formatReport,
      summarize,
      isFilePathToken,
      classifyBacktickToken,
      parseCommandLine,
      pkgFromImport,
      pkgFromSpec,
      safeIdentSrc,
      MAX_CLAIMS
    };
  }
});

// server/verify-prims.js
var require_verify_prims = __commonJS({
  "server/verify-prims.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var path2 = require("path");
    var os = require("os");
    var { spawn } = require("child_process");
    var core2 = require_claim_core();
    var PROBE_TIMEOUT_MS = 8e3;
    var PROBE_MAX_BUFFER = 256 * 1024;
    var READ_MAX = 2 * 1024 * 1024;
    var GREP_MAX_FILES = 2e4;
    var GREP_SKIP_DIRS = /* @__PURE__ */ new Set([
      "node_modules",
      ".git",
      "dist",
      "build",
      "out",
      "target",
      "vendor",
      ".venv",
      "venv",
      "__pycache__",
      ".next",
      ".nuxt",
      ".turbo",
      "coverage",
      ".idea",
      ".vscode",
      ".gradle"
    ]);
    var EXEC_ALLOWLIST = /* @__PURE__ */ new Set([
      "git",
      "node",
      "npm",
      "pnpm",
      "yarn",
      "deno",
      "bun",
      "cargo",
      "rustc",
      "go",
      "python",
      "python3",
      "pip",
      "pip3",
      "docker",
      "kubectl",
      "make",
      "tsc"
    ]);
    var TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
    var FLAG_RE = /^--[A-Za-z0-9][A-Za-z0-9._-]*$|^-[A-Za-z]$/;
    function fail2(msg) {
      const e = new Error(msg);
      e.user = true;
      throw e;
    }
    function validateProbeArgs(cmd, args) {
      if (!EXEC_ALLOWLIST.has(cmd)) return { ok: false, reason: `\u547D\u4EE4\u4E0D\u5728\u5B89\u5168\u63A2\u6D4B\u6E05\u5355: ${cmd}` };
      for (const a of args) {
        if (!TOKEN_RE.test(a) && !FLAG_RE.test(a)) return { ok: false, reason: `\u53C2\u6570\u542B\u975E\u6CD5\u5B57\u7B26: ${a}` };
      }
      return { ok: true };
    }
    function runProbe(root, cmd, args) {
      const v = validateProbeArgs(cmd, args);
      if (!v.ok) return Promise.resolve({ ok: false, denied: true, error: v.reason });
      return new Promise((resolve) => {
        let out = "";
        let err = "";
        let done = false;
        let child;
        try {
          child = spawn(cmd, args, { cwd: root, shell: false, windowsHide: true });
        } catch (e) {
          resolve({ ok: false, denied: false, error: String(e && e.message || e) });
          return;
        }
        const timer = setTimeout(() => {
          if (!done) {
            try {
              child.kill();
            } catch (_) {
            }
          }
        }, PROBE_TIMEOUT_MS);
        child.stdout.on("data", (c) => {
          if (out.length < PROBE_MAX_BUFFER) out += c;
        });
        child.stderr.on("data", (c) => {
          if (err.length < PROBE_MAX_BUFFER) err += c;
        });
        child.on("error", (e) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ ok: false, denied: false, error: String(e && e.message || e) });
        });
        child.on("close", (code) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ ok: true, denied: false, code, stdout: out, stderr: err });
        });
      });
    }
    var HELP_MIN_BYTES = 40;
    async function probeHelp(root, cmd, subcmd) {
      const attempt = async (flag) => runProbe(root, cmd, [...subcmd || [], flag]);
      const len = (x) => (x && x.stdout || "").length + (x && x.stderr || "").length;
      let r = await attempt("-h");
      if (!r.ok || len(r) < HELP_MIN_BYTES) {
        const r2 = await attempt("--help");
        if (r2.ok && len(r2) > len(r)) r = { ...r2, via: "--help" };
      }
      return r;
    }
    async function gitStatusLines(root) {
      try {
        if (!fs.existsSync(path2.join(root, ".git"))) return null;
      } catch (_) {
        return null;
      }
      const r = await runProbe(root, "git", ["status", "--porcelain"]);
      if (!r.ok || r.code !== 0) return null;
      return r.stdout.split("\n").filter(Boolean).map((l) => l.trim());
    }
    async function repoSearch(root, needle, opts) {
      const o = opts || {};
      const limit = Math.min(o.limit || 20, 100);
      const rg = await runProbe(root, "rg", [
        "-n",
        "--no-heading",
        "-F",
        "--max-count",
        "3",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.git/**",
        "--glob",
        "!dist/**",
        "--glob",
        "!build/**",
        "--",
        needle,
        "."
      ]);
      if (rg.ok && rg.code === 0) {
        const out = [];
        for (const line of rg.stdout.split("\n")) {
          if (!line) continue;
          const i1 = line.indexOf(":");
          const i2 = line.indexOf(":", i1 + 1);
          if (i1 === -1 || i2 === -1) continue;
          out.push({ file: path2.resolve(root, line.slice(0, i1)), line: Number(line.slice(i1 + 1, i2)), text: line.slice(i2 + 1).slice(0, 160) });
          if (out.length >= limit) break;
        }
        if (out.length || rg.stdout.trim()) return out;
      }
      const results = [];
      let seen = 0;
      const needleLower = needle;
      async function walk(dir) {
        if (results.length >= limit || seen >= GREP_MAX_FILES) return;
        let entries;
        try {
          entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch (_) {
          return;
        }
        for (const ent of entries) {
          if (results.length >= limit || seen >= GREP_MAX_FILES) return;
          const p = path2.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (!GREP_SKIP_DIRS.has(ent.name) && !ent.name.startsWith(".")) await walk(p);
            continue;
          }
          if (!ent.isFile()) continue;
          const ext = path2.extname(ent.name).toLowerCase().replace(".", "");
          if (!core2.FILE_EXT.has(ext)) continue;
          seen++;
          let st;
          try {
            st = await fs.promises.stat(p);
          } catch (_) {
            continue;
          }
          if (st.size > READ_MAX) continue;
          let text;
          try {
            text = await fs.promises.readFile(p, "utf8");
          } catch (_) {
            continue;
          }
          if (text.slice(0, 8192).includes("\0")) continue;
          const lines = text.split("\n");
          let count = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(needleLower)) {
              results.push({ file: p, line: i + 1, text: lines[i].trim().slice(0, 160) });
              if (++count >= 3 || results.length >= limit) break;
            }
          }
        }
      }
      try {
        await walk(root);
      } catch (_) {
      }
      return results;
    }
    function resolveTargetPath(root, target) {
      const norm = String(target).replace(/\//g, path2.sep);
      if (path2.isAbsolute(norm)) return norm;
      return path2.join(root, norm);
    }
    async function verifyFileClaim(root, claim, gitLines) {
      const ev = [];
      const p = resolveTargetPath(root, claim.target);
      let st = null;
      try {
        st = await fs.promises.stat(p);
      } catch (_) {
      }
      if (st && st.isFile()) {
        try {
          const entries = await fs.promises.readdir(path2.dirname(p));
          const want = path2.basename(p);
          if (!entries.includes(want)) {
            const ci = entries.find((s) => s.toLowerCase() === want.toLowerCase());
            if (ci) {
              return { verdict: "partial", evidence: [`\u6587\u4EF6\u5B58\u5728\u4F46\u5927\u5C0F\u5199\u4E0D\u540C: \u5B9E\u9645\u4E3A ${path2.join(path2.dirname(p), ci)}\uFF0C\u58F0\u660E\u4E3A ${p}`, "Windows \u4E0D\u533A\u5206\u5927\u5C0F\u5199\u6240\u4EE5\u80FD\u547D\u4E2D\uFF0C\u4F46 Linux/CI \u4F1A 404\u2014\u2014\u6309\u5B9E\u9645\u5927\u5C0F\u5199\u4FEE\u6B63"], hint: "\u8DE8\u5E73\u53F0\u5927\u5C0F\u5199\u9677\u9631\uFF08\u5178\u578B AI \u6539\u540D\u5931\u914D\uFF09" };
            }
          }
        } catch (_) {
        }
        ev.push(`\u6587\u4EF6\u5B58\u5728: ${p}\uFF08${st.size} \u5B57\u8282, mtime ${st.mtime.toISOString().slice(0, 19)}\uFF09`);
        if (gitLines) {
          const norm = claim.target.replace(/\\/g, "/");
          const hit = gitLines.find((l) => l.endsWith(norm) || l.includes(norm));
          if (hit) ev.push(`git status: ${hit}`);
          else {
            return { verdict: "partial", evidence: ev, hint: "\u6587\u4EF6\u5B58\u5728\uFF0C\u4F46\u4E0D\u5728 git status \u4E2D\u2014\u2014\u82E5\u58F0\u660E\u4E3A\u300C\u5DF2\u4FEE\u6539/\u65B0\u589E\u300D\u5219\u5DE5\u4F5C\u533A\u65E0\u5BF9\u5E94\u6539\u52A8\uFF08\u53EF\u80FD\u5DF2\u63D0\u4EA4\u6216\u58F0\u660E\u5931\u5B9E\uFF09" };
          }
        }
        return { verdict: "verified", evidence: ev };
      }
      if (st && st.isDirectory()) {
        return { verdict: "refuted", evidence: [`${p} \u5B58\u5728\u4F46\u5B83\u662F\u76EE\u5F55\uFF0C\u4E0D\u662F\u6587\u4EF6`] };
      }
      const parent = path2.dirname(p);
      const base = path2.basename(p);
      try {
        const siblings = await fs.promises.readdir(parent);
        const ci = siblings.find((s) => s.toLowerCase() === base.toLowerCase() && s !== base);
        if (ci) {
          return { verdict: "partial", evidence: [`\u76EE\u5F55\u5B58\u5728\u4F46\u5927\u5C0F\u5199\u4E0D\u540C: ${path2.join(parent, ci)}`], hint: "Windows \u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF0C\u8DE8\u5E73\u53F0\u811A\u672C/CI \u4F1A\u6302\u2014\u2014\u5EFA\u8BAE\u6309\u5B9E\u9645\u5927\u5C0F\u5199\u4FEE\u6B63\u58F0\u660E" };
        }
        const ext = path2.extname(base);
        const near = siblings.filter((s) => path2.extname(s) === ext && path2.basename(s, ext).toLowerCase().includes(path2.basename(base, ext).slice(0, 4).toLowerCase())).slice(0, 4);
        const parentExists = await fs.promises.stat(parent).then(() => true, () => false);
        if (parentExists) {
          return {
            verdict: "refuted",
            evidence: [`\u7236\u76EE\u5F55\u5B58\u5728\u4F46\u65E0\u6B64\u6587\u4EF6: ${parent}`, near.length ? `\u7591\u4F3C\u76F8\u8FD1\u6587\u4EF6: ${near.join(", ")}` : `\u76EE\u5F55\u5185\u5171 ${siblings.length} \u9879\uFF0C\u65E0\u4E00\u5339\u914D`].filter(Boolean)
          };
        }
        return { verdict: "refuted", evidence: [`\u7236\u76EE\u5F55\u4E0D\u5B58\u5728: ${parent}`] };
      } catch (_) {
        return { verdict: "refuted", evidence: [`\u65E0\u6CD5\u8BBF\u95EE\u7236\u76EE\u5F55: ${parent}`] };
      }
    }
    var DEF_PATTERNS = (sym) => {
      const src = core2.safeIdentSrc(sym);
      if (!src) return [];
      const s = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return [
        new RegExp(`\\bfunction\\s+${s}\\b`),
        new RegExp(`\\b(?:const|let|var)\\s+${s}\\b`),
        new RegExp(`\\bclass\\s+${s}\\b`),
        new RegExp(`\\bexport\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+${s}\\b`),
        new RegExp(`\\binterface\\s+${s}\\b`),
        new RegExp(`\\btype\\s+${s}\\s*=`),
        new RegExp(`\\benum\\s+${s}\\b`),
        new RegExp(`\\bdef\\s+${s}\\b`),
        new RegExp(`\\bfn\\s+${s}\\b`),
        new RegExp(`\\bstruct\\s+${s}\\b`),
        new RegExp(`\\btrait\\s+${s}\\b`),
        new RegExp(`\\bfunc\\s+(?:\\([^)]*\\)\\s*)?${s}\\b`),
        new RegExp(`\\bpublic\\s+(?:static\\s+)?[\\w<>\\[\\]]+\\s+${s}\\s*\\(`)
      ];
    };
    var WORD_RE = (sym) => {
      const s = core2.safeIdentSrc(sym);
      return s ? new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : null;
    };
    async function findDefinition(root, fileAbs, sym) {
      let text;
      try {
        text = await fs.promises.readFile(fileAbs, "utf8");
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
      if (text.length > READ_MAX) return { error: "\u6587\u4EF6\u8D85\u8FC7 2MB\uFF0C\u672A\u8BFB\u53D6" };
      const lines = text.split("\n");
      const defs = DEF_PATTERNS(sym);
      const word = WORD_RE(sym);
      const defHits = [];
      const useHits = [];
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        if (defs.some((re) => re.test(L))) defHits.push({ line: i + 1, text: L.trim().slice(0, 160) });
        else if (word && word.test(L)) useHits.push({ line: i + 1, text: L.trim().slice(0, 160) });
      }
      return { defHits, useHits };
    }
    async function verifySymbolClaim(root, claim) {
      const sym = claim.target;
      if (claim.file) {
        const fp = resolveTargetPath(root, claim.file);
        let st = null;
        try {
          st = await fs.promises.stat(fp);
        } catch (_) {
        }
        if (!st || !st.isFile()) {
          return { verdict: "refuted", evidence: [`\u58F0\u660E\u7684\u5BBF\u4E3B\u6587\u4EF6\u4E0D\u5B58\u5728: ${fp}`], hint: "\u6587\u4EF6\u4E0D\u5B58\u5728\u65F6\u7B26\u53F7\u65E0\u4ECE\u8C08\u8D77\uFF1B\u5148\u7528 file \u7C7B\u58F0\u660E\u6838\u9A8C\u6587\u4EF6\u672C\u8EAB" };
        }
        const r = await findDefinition(root, fp, sym);
        if (r.error) return { verdict: "unverifiable", evidence: [`\u8BFB\u53D6\u5931\u8D25: ${r.error}`] };
        if (r.defHits.length) {
          return { verdict: "verified", evidence: r.defHits.slice(0, 3).map((h) => `${claim.file}:${h.line}  ${h.text}`) };
        }
        if (r.useHits.length) {
          return {
            verdict: "partial",
            evidence: r.useHits.slice(0, 3).map((h) => `${claim.file}:${h.line}  ${h.text}`),
            hint: "\u6587\u4EF6\u91CC\u6709\u6B64\u540D\u5B57\u7684\u5F15\u7528\uFF0C\u4F46\u6CA1\u6709\u5B9A\u4E49\u5F62\u6001\uFF08function/const/class/def/fn\u2026\uFF09\u2014\u2014\u53EF\u80FD\u662F\u5BFC\u5165\u91CD\u5BFC\u51FA\u3001\u52A8\u6001\u5B9A\u4E49\u6216\u58F0\u660E\u5931\u5B9E"
          };
        }
        return { verdict: "refuted", evidence: [`\u6587\u4EF6\u5B58\u5728\uFF08${claim.file}\uFF09\u4F46\u5168\u6587\u65E0\u6B64\u6807\u8BC6\u7B26`] };
      }
      const hits = await repoSearch(root, sym, { limit: 24 });
      if (!hits.length) {
        return { verdict: "unverifiable", evidence: [], hint: `\u5168\u5E93\u641C\u7D22\uFF08node_modules/.git/dist \u5DF2\u6392\u9664\uFF09\u672A\u89C1\u300C${sym}\u300D\u7684\u5B9A\u4E49\u6216\u5F15\u7528\u2014\u2014\u53EF\u80FD\u662F\u5168\u5C40 API\u3001\u8FD0\u884C\u65F6\u6CE8\u5165\u6216\u7B2C\u4E09\u65B9\u5305\u6210\u5458\uFF0C\u672C\u5DE5\u5177\u4E0D\u4E0B\u8BC1\u4F2A\u7ED3\u8BBA` };
      }
      const withDefs = [];
      const onlyUse = [];
      for (const h of hits.slice(0, 12)) {
        const r = await findDefinition(root, h.file, sym);
        if (r.defHits && r.defHits.length) withDefs.push(h);
        else onlyUse.push(h);
      }
      if (withDefs.length) {
        return { verdict: "verified", evidence: withDefs.slice(0, 3).map((h) => `${path2.relative(root, h.file).replace(/\\/g, "/")}:${h.line}  ${h.text}`) };
      }
      return {
        verdict: "partial",
        evidence: onlyUse.slice(0, 3).map((h) => `${path2.relative(root, h.file).replace(/\\/g, "/")}:${h.line}  ${h.text}`),
        hint: `\u4ED3\u5E93\u4E2D\u4EC5\u89C1\u5F15\u7528\uFF08\u5171 ${hits.length} \u5904\u547D\u4E2D\uFF09\u672A\u89C1\u5B9A\u4E49\u2014\u2014\u53EF\u80FD\u662F\u91CD\u5BFC\u51FA/\u7B2C\u4E09\u65B9\u6210\u5458/\u5168\u5C40`
      };
    }
    async function readJsonish(fileAbs) {
      let text;
      try {
        text = await fs.promises.readFile(fileAbs, "utf8");
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
      if (text.length > READ_MAX) return { error: "\u6587\u4EF6\u8D85\u8FC7 2MB" };
      let out = "";
      let inS = null;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inS) {
          out += ch;
          if (ch === "\\") {
            out += text[i + 1] || "";
            i++;
          } else if (ch === inS) inS = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          inS = ch;
          out += ch;
          continue;
        }
        if (ch === "/" && text[i + 1] === "/") {
          while (i < text.length && text[i] !== "\n") i++;
          out += "\n";
          continue;
        }
        if (ch === "/" && text[i + 1] === "*") {
          const j = text.indexOf("*/", i + 2);
          i = j === -1 ? text.length : j + 1;
          out += " ";
          continue;
        }
        out += ch;
      }
      try {
        return { value: JSON.parse(out) };
      } catch (e) {
        return { error: `\u4E0D\u662F\u5408\u6CD5 JSON: ${String(e && e.message || e).slice(0, 120)}` };
      }
    }
    function walkPath(obj, segs) {
      let cur = obj;
      for (const seg of segs) {
        if (cur == null || typeof cur !== "object") return { miss: true };
        if (Array.isArray(cur)) {
          const i = Number(seg);
          if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { miss: true };
          cur = cur[i];
          continue;
        }
        if (!(seg in cur)) return { miss: true };
        cur = cur[seg];
      }
      return { value: cur };
    }
    async function verifyConfigClaim(root, claim) {
      const segs = claim.target.split(".");
      let fileAbs = claim.file ? resolveTargetPath(root, claim.file) : null;
      const ext = fileAbs ? path2.extname(fileAbs).toLowerCase().replace(".", "") : "";
      if (!fileAbs) {
        const first = segs[0];
        const candidates = [
          `${first}.json`,
          `${first}.jsonc`,
          `${first}.config.json`,
          `${first}.config.mjs`,
          `${first}.config.js`,
          `.${first}.json`,
          `.${first}rc`,
          `${first}.config.yaml`,
          `${first}.config.yml`,
          `${first}.config.toml`
        ];
        for (const cand of candidates) {
          const p = path2.join(root, cand);
          try {
            const st2 = await fs.promises.stat(p);
            if (st2.isFile()) {
              fileAbs = p;
              break;
            }
          } catch (_) {
          }
        }
        if (!fileAbs && fs.existsSync(path2.join(root, "package.json"))) {
          const pkg = await readJsonish(path2.join(root, "package.json"));
          if (pkg.value) {
            const r = walkPath(pkg.value, segs);
            if (!r.miss) return { verdict: "verified", evidence: [`package.json: ${claim.target} = ${JSON.stringify(r.value).slice(0, 120)}`] };
          }
        }
        if (!fileAbs) {
          return { verdict: "unverifiable", evidence: [], hint: `\u672A\u6307\u5B9A\u914D\u7F6E\u6587\u4EF6\uFF0C\u4E14\u6839\u76EE\u5F55\u627E\u4E0D\u5230 ${candidates.join("/")} \u7B49\uFF1B\u7528 claim_verify_batch \u6307\u5B9A file \u540E\u53EF\u7CBE\u786E\u6838\u9A8C` };
        }
      }
      let st = null;
      try {
        st = await fs.promises.stat(fileAbs);
      } catch (_) {
      }
      if (!st || !st.isFile()) {
        return { verdict: "refuted", evidence: [`\u914D\u7F6E\u6587\u4EF6\u4E0D\u5B58\u5728: ${fileAbs}`] };
      }
      const rel = path2.relative(root, fileAbs).replace(/\\/g, "/");
      if (ext === "json" || ext === "jsonc" || ext === "json5") {
        const r = await readJsonish(fileAbs);
        if (r.error) return { verdict: "unverifiable", evidence: [`${rel} \u89E3\u6790\u5931\u8D25: ${r.error}`] };
        const w = walkPath(r.value, segs);
        if (w.miss) return { verdict: "refuted", evidence: [`${rel} \u5B58\u5728\u4E14\u4E3A\u5408\u6CD5 JSON\uFF0C\u4F46\u65E0\u952E\u8DEF\u5F84 ${claim.target}`] };
        return { verdict: "verified", evidence: [`${rel}: ${claim.target} = ${JSON.stringify(w.value).slice(0, 120)}`] };
      }
      const key = segs[segs.length - 1];
      let text;
      try {
        text = await fs.promises.readFile(fileAbs, "utf8");
      } catch (e) {
        return { verdict: "unverifiable", evidence: [`\u8BFB\u53D6\u5931\u8D25: ${e}`] };
      }
      const lines = text.split("\n");
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`^\\s*#?\\s*(?:export\\s+)?["']?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*[:=]`).test(lines[i])) {
          hits.push(`${rel}:${i + 1}  ${lines[i].trim().slice(0, 160)}`);
          if (hits.length >= 3) break;
        }
      }
      if (hits.length) return { verdict: "partial", evidence: hits, hint: `${ext.toUpperCase()} \u65E0\u7CBE\u786E\u89E3\u6790\uFF08\u96F6\u4F9D\u8D56\u8FB9\u754C\uFF09\uFF1A\u884C\u5F0F\u5339\u914D\u5230\u672B\u6BB5\u952E\u540D\uFF0C\u5D4C\u5957/\u4F5C\u7528\u57DF\u8BED\u4E49\u672A\u9A8C\u8BC1` };
      return { verdict: "unverifiable", evidence: [`${rel} \u5B58\u5728\uFF0C\u4F46\u884C\u5F0F\u626B\u63CF\u672A\u89C1\u952E\u300C${key}\u300D`], hint: "YAML/TOML/ini \u7C7B\u4E0D\u505A\u7CBE\u786E\u6838\u9A8C\uFF08\u907F\u514D\u8BEF\u5224\u5D4C\u5957\u4F5C\u7528\u57DF\uFF09\uFF1B\u53EF\u8F6C\u4E3A JSON \u540E\u7528 file \u7C7B\u578B\u7CBE\u786E\u6838\u9A8C" };
    }
    async function verifyPackageClaim(root, claim) {
      const name = claim.target;
      let st;
      try {
        st = await fs.promises.stat(path2.join(root, "package.json"));
      } catch (_) {
        st = null;
      }
      let nodeModules = false;
      try {
        nodeModules = (await fs.promises.stat(path2.join(root, "node_modules"))).isDirectory();
      } catch (_) {
      }
      if (!st && !nodeModules) {
        return { verdict: "unverifiable", evidence: [], hint: "\u6839\u76EE\u5F55\u65E0 package.json \u4E5F\u65E0 node_modules\u2014\u2014\u4E0D\u662F JS \u9879\u76EE\u6216\u6839\u9009\u9519\uFF0C\u4F9D\u8D56\u58F0\u660E\u65E0\u4ECE\u6838\u9A8C" };
      }
      const ev = [];
      if (st) {
        const pkg = await readJsonish(path2.join(root, "package.json"));
        if (pkg.error) return { verdict: "unverifiable", evidence: [`package.json \u89E3\u6790\u5931\u8D25: ${pkg.error}`] };
        const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
        for (const sec of sections) {
          const m = pkg.value && pkg.value[sec];
          if (m && Object.prototype.hasOwnProperty.call(m, name)) {
            ev.push(`package.json ${sec}: "${name}": "${m[name]}"`);
            return { verdict: "verified", evidence: ev };
          }
        }
        ev.push("package.json \u5B58\u5728\uFF0C\u4F46\u56DB\u6BB5\u4F9D\u8D56\u5747\u672A\u58F0\u660E\u8BE5\u5305");
      }
      const nmPkg = path2.join(root, "node_modules", name, "package.json");
      try {
        const st2 = await fs.promises.stat(nmPkg);
        if (st2.isFile()) {
          let ver = "";
          try {
            ver = JSON.parse(await fs.promises.readFile(nmPkg, "utf8")).version || "";
          } catch (_) {
          }
          ev.push(`node_modules/${name}${ver ? `@${ver}` : ""} \u5DF2\u5B89\u88C5`);
          return { verdict: "partial", evidence: ev, hint: "\u5DF2\u5B89\u88C5\u4F46\u672A\u5728 package.json \u58F0\u660E\u2014\u2014\u6362\u673A\u5668/\u91CD\u88C5\u540E\u4F1A\u6D88\u5931\uFF08\u5E7D\u7075\u4F9D\u8D56\uFF09" };
        }
      } catch (_) {
      }
      return { verdict: "refuted", evidence: ev.length ? ev : [`node_modules \u4E2D\u65E0 ${name}`], hint: ev.length ? "package.json \u4E0E node_modules \u5747\u65E0\u2014\u2014import \u8BE5\u5305\u4F1A\u76F4\u63A5\u6784\u5EFA/\u8FD0\u884C\u5931\u8D25" : void 0 };
    }
    function cmpSemver(a, b) {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    }
    async function verifyVersionClaim(root, claim) {
      const cmd = claim.target;
      const constraint = claim.constraint || "0";
      const v = validateProbeArgs(cmd, ["--version"]);
      if (!v.ok) return { verdict: "unverifiable", evidence: [], hint: v.reason };
      const r = await runProbe(root, cmd, ["--version"]);
      if (!r.ok || r.code !== 0) {
        return { verdict: "refuted", evidence: [`${cmd} --version \u63A2\u6D4B\u5931\u8D25${r.error ? `: ${r.error.slice(0, 120)}` : `\uFF08exit ${r.code}\uFF09`}`, r.stdout ? `\u8F93\u51FA: ${r.stdout.slice(0, 120)}` : ""].filter(Boolean) };
      }
      const m = /(\d{1,3}\.\d{1,3}(?:\.\d{1,3})?)/.exec(r.stdout + " " + r.stderr);
      if (!m) return { verdict: "unverifiable", evidence: [`${cmd} --version \u8F93\u51FA\u65E0\u6CD5\u89E3\u6790: ${(r.stdout || r.stderr).slice(0, 120)}`] };
      const actual = m[1];
      if (cmpSemver(actual, constraint) >= 0) {
        return { verdict: "verified", evidence: [`${cmd} \u5B9E\u9645\u7248\u672C ${actual} \u2265 \u58F0\u660E\u7684 ${constraint}`] };
      }
      return { verdict: "refuted", evidence: [`${cmd} \u5B9E\u9645\u7248\u672C ${actual} < \u58F0\u660E\u7684 ${constraint}`] };
    }
    async function verifyCliClaim(root, claim) {
      const cmd = claim.target;
      const subcmd = claim.subcmd || [];
      const flags = claim.flags || [];
      for (const f of flags) {
        if (!FLAG_RE.test(f)) return { verdict: "unverifiable", evidence: [], hint: `flag \u542B\u975E\u6CD5\u5B57\u7B26: ${f}` };
      }
      const v = validateProbeArgs(cmd, subcmd);
      if (!v.ok) return { verdict: "unverifiable", evidence: [], hint: v.reason };
      const probe = await probeHelp(root, cmd, subcmd);
      const sub = subcmd.length ? ` ${subcmd.join(" ")}` : "";
      if (!probe.ok && probe.denied) {
        return { verdict: "unverifiable", evidence: [], hint: `\u300C${cmd}${sub} --help\u300D\u63A2\u6D4B\u88AB\u5B89\u5168\u7B56\u7565\u62D2\u7EDD\uFF08\u975E\u767D\u540D\u5355\u5F62\u6001\uFF09` };
      }
      if (!probe.ok) {
        return { verdict: "refuted", evidence: [`${cmd}${sub} \u63A2\u6D4B\u5931\u8D25\uFF08\u8FDB\u7A0B\u542F\u52A8\u9519\u8BEF\uFF09: ${(probe.error || "").slice(0, 120)}`], hint: "\u547D\u4EE4\u53EF\u80FD\u672A\u5B89\u88C5" };
      }
      const text = (probe.stdout || "") + "\n" + (probe.stderr || "");
      const flagInHelp = (f) => {
        if (text.includes(f)) return true;
        return f.startsWith("--") && text.includes(`--[no-]${f.slice(2)}`);
      };
      if (probe.code !== 0 && text.trim().length < HELP_MIN_BYTES) {
        return { verdict: "refuted", evidence: [`${cmd}${sub} --help \u63A2\u6D4B\u65E0\u8F93\u51FA\u4E14\u9000\u51FA\u7801 ${probe.code}`], hint: "\u547D\u4EE4\u53EF\u80FD\u672A\u5B89\u88C5\u6216\u4E0D\u53EF\u7528" };
      }
      if (text.trim().length < HELP_MIN_BYTES) {
        return { verdict: "unverifiable", evidence: [`${cmd}${sub} \u5E2E\u52A9\u8F93\u51FA\u8FC7\u77ED\uFF08${text.trim().length} \u5B57\u8282\uFF0C\u53EF\u80FD\u62C9\u8D77\u4E86\u6D4F\u89C8\u5668/\u5206\u9875\u5668\uFF09`], hint: "\u5E2E\u52A9\u6587\u672C\u4E0D\u53EF\u9760\uFF0Cflag \u65E0\u4ECE\u6838\u9A8C\uFF1B\u53EF\u4EBA\u5DE5 `--help` \u540E\u518D\u4E0B\u7ED3\u8BBA" };
      }
      if (!flags.length) {
        return { verdict: "verified", evidence: [`${cmd}${sub} --help \u6B63\u5E38\u8F93\u51FA ${text.length} \u5B57\u8282\uFF08\u547D\u4EE4\u53EF\u7528\uFF09`] };
      }
      const missing = [];
      const found = [];
      for (const f of flags) {
        if (flagInHelp(f)) found.push(f);
        else missing.push(f);
      }
      const ev = [];
      for (const f of found) {
        const line = text.split("\n").find((l) => l.includes(f));
        if (line) ev.push(`--help \u8F93\u51FA\u547D\u4E2D: ${line.trim().slice(0, 160)}`);
      }
      if (missing.length) {
        return { verdict: "refuted", evidence: [...ev, `--help \u8F93\u51FA\u4E2D\u672A\u89C1: ${missing.join(" ")}`].filter(Boolean), hint: found.length ? `\u90E8\u5206 flag \u5B58\u5728\uFF08${found.join(" ")}\uFF09\u4F46 ${missing.join(" ")} \u65E0\u2014\u2014\u6DF7\u7528\u5931\u5B9E flag \u662F\u5178\u578B AI \u5E7B\u89C9` : void 0 };
      }
      return { verdict: "verified", evidence: ev };
    }
    async function verifyClaims(root, claims, opts) {
      const options = opts || {};
      if (!isDir(root)) fail2(`\u4ED3\u5E93\u6839\u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u76EE\u5F55: ${root}`);
      const gitLines = options.skipGit ? null : await gitStatusLines(root);
      const out = [];
      for (const claim of claims) {
        let r;
        try {
          switch (claim.type) {
            case "file":
              r = await verifyFileClaim(root, claim, gitLines);
              break;
            case "symbol":
              r = await verifySymbolClaim(root, claim);
              break;
            case "package":
              r = await verifyPackageClaim(root, claim);
              break;
            case "cli":
              r = await verifyCliClaim(root, claim);
              break;
            case "config":
              r = await verifyConfigClaim(root, claim);
              break;
            case "version":
              r = await verifyVersionClaim(root, claim);
              break;
            default:
              r = { verdict: "unverifiable", evidence: [], hint: "\u672A\u77E5\u58F0\u660E\u7C7B\u578B" };
          }
        } catch (e) {
          r = { verdict: "unverifiable", evidence: [`\u6838\u9A8C\u5668\u5185\u90E8\u9519\u8BEF: ${String(e && e.message || e).slice(0, 160)}`] };
        }
        out.push({ ...claim, verdict: r.verdict, evidence: r.evidence || [], hint: r.hint || null });
      }
      return {
        root,
        scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
        gitStatusNote: gitLines ? `${gitLines.length} \u6761\u5DE5\u4F5C\u533A\u6539\u52A8` : "\u975E git \u4ED3\u5E93\uFF08\u8DF3\u8FC7 git \u4EA4\u53C9\u6838\u5BF9\uFF09",
        summary: core2.summarize(out),
        claims: out
      };
    }
    function isDir(p) {
      try {
        return fs.statSync(p).isDirectory();
      } catch (_) {
        return false;
      }
    }
    module2.exports = {
      EXEC_ALLOWLIST,
      verifyClaims,
      runProbe,
      validateProbeArgs,
      verifyFileClaim,
      verifySymbolClaim,
      verifyPackageClaim,
      verifyCliClaim,
      verifyConfigClaim,
      verifyVersionClaim,
      gitStatusLines,
      repoSearch,
      readJsonish,
      walkPath,
      resolveTargetPath,
      cmpSemver,
      findDefinition,
      probeHelp,
      isDir,
      PROBE_TIMEOUT_MS,
      tmpdir: os.tmpdir
    };
  }
});

// server/selftest.js
var require_selftest = __commonJS({
  "server/selftest.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var os = require("os");
    var path2 = require("path");
    var core2 = require_claim_core();
    var prims2 = require_verify_prims();
    function assertEq(a, b, msg) {
      if (a !== b) throw new Error(`${msg}: \u671F\u671B ${JSON.stringify(b)} \u5B9E\u5F97 ${JSON.stringify(a)}`);
      return true;
    }
    function buildFixture(rootBase) {
      const root = fs.mkdtempSync(path2.join(rootBase, "claim-lens-fixture-"));
      const w = (rel, content) => {
        const p = path2.join(root, rel);
        fs.mkdirSync(path2.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf8");
      };
      w("src/index.ts", [
        'import { readFile } from "node:fs";',
        'import express from "express";',
        'import { helper } from "./util";',
        'export const VERSION = "1.0.0";',
        "export function parseConfig(raw) {",
        "  return JSON.parse(raw);",
        "}",
        "class Engine {",
        "  constructor() {}",
        "}",
        "const unused = helper;",
        'parseConfig("{}");'
      ].join("\n"));
      w("src/util.ts", "export function helper() { return 1; }\n");
      w("package.json", JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        dependencies: { express: "^4.18.0" },
        scripts: { build: "tsc" },
        ping: { timeout: 3e3 }
      }, null, 2));
      w("config/app.config.json", '{\n  // \u6CE8\u91CA\u5E94\u88AB\u5265\u79BB\n  "server": { "port": 8080 },\n  "debug": true\n}');
      w("config/settings.yml", "server:\n  port: 9090\nlog:\n  level: info\n");
      w("README.md", "# fixture\nsee docs/guide.md for details\n");
      w("docs/guide.md", "# guide\n");
      return root;
    }
    async function runSelftest2() {
      const items = [];
      const check = (name, fn) => items.push({ name, ok: false, detail: "" });
      const tmpBase = fs.mkdtempSync(path2.join(os.tmpdir(), "claim-lens-selftest-"));
      const root = buildFixture(tmpBase);
      try {
        const t = (name, fn) => {
          let entry = items.find((i) => i.name === name);
          if (!entry) {
            entry = { name, ok: false, detail: "" };
            items.push(entry);
          }
          try {
            const r = fn();
            entry.ok = r === true || r === "ok";
            entry.detail = entry.ok ? "" : String(r == null ? "\u65AD\u8A00\u672A\u8FD4\u56DE true/ok" : r).slice(0, 200);
          } catch (e) {
            entry.ok = false;
            entry.detail = String(e && e.message || e).slice(0, 200);
          }
        };
        const claims = (arr) => core2.normalizeClaims(arr);
        const cFileOk = claims([{ type: "file", target: "src/index.ts" }])[0];
        const cFileMiss = claims([{ type: "file", target: "src/nonexist.ts" }])[0];
        const cFileCase = claims([{ type: "file", target: "SRC/INDEX.TS" }])[0];
        const cFileDir = claims([{ type: "file", target: "src" }])[0];
        const rF = await prims2.verifyClaims(root, [cFileOk, cFileMiss, cFileCase, cFileDir], { skipGit: true });
        t("file: \u5B58\u5728 \u2192 verified", () => assertEq(rF.claims[0].verdict, "verified"));
        t("file: \u7F3A\u5931 \u2192 refuted\uFF08\u7236\u76EE\u5F55\u5B58\u5728\uFF09", () => assertEq(rF.claims[1].verdict, "refuted"));
        t("file: \u5927\u5C0F\u5199\u5931\u914D \u2192 partial", () => assertEq(rF.claims[2].verdict, "partial"));
        t("file: \u76EE\u6807\u662F\u76EE\u5F55 \u2192 refuted", () => assertEq(rF.claims[3].verdict, "refuted"));
        const cSymDef = claims([{ type: "symbol", target: "parseConfig", file: "src/index.ts" }])[0];
        const cSymUse = claims([{ type: "symbol", target: "readFile", file: "src/index.ts" }])[0];
        const cSymAbsent = claims([{ type: "symbol", target: "zombieFunction", file: "src/index.ts" }])[0];
        const cSymRepo = claims([{ type: "symbol", target: "helper" }])[0];
        const cSymRepoGhost = claims([{ type: "symbol", target: "localStorage" }])[0];
        const rS = await prims2.verifyClaims(root, [cSymDef, cSymUse, cSymAbsent, cSymRepo, cSymRepoGhost], { skipGit: true });
        t("symbol: \u6587\u4EF6\u5185\u5B9A\u4E49 \u2192 verified", () => assertEq(rS.claims[0].verdict, "verified"));
        t("symbol: \u4EC5\u5F15\u7528 \u2192 partial", () => assertEq(rS.claims[1].verdict, "partial"));
        t("symbol: \u6587\u4EF6\u5B58\u5728\u4F46\u65E0\u7B26\u53F7 \u2192 refuted\uFF08\u786C\u8BC1\u636E\uFF09", () => assertEq(rS.claims[2].verdict, "refuted"));
        t("symbol: \u5168\u5E93\u5B9A\u4E49 \u2192 verified", () => assertEq(rS.claims[3].verdict, "verified"));
        t("symbol: \u5168\u5E93\u672A\u89C1\uFF08\u5168\u5C40 API\uFF09\u2192 unverifiable \u4E0D\u8BC1\u4F2A", () => assertEq(rS.claims[4].verdict, "unverifiable"));
        const cPkgOk = claims([{ type: "package", target: "express" }])[0];
        const cPkgGhost = claims([{ type: "package", target: "left-pad" }])[0];
        const rP = await prims2.verifyClaims(root, [cPkgOk, cPkgGhost], { skipGit: true });
        t("package: \u5DF2\u58F0\u660E \u2192 verified", () => assertEq(rP.claims[0].verdict, "verified"));
        t("package: \u672A\u58F0\u660E\u672A\u5B89\u88C5 \u2192 refuted", () => assertEq(rP.claims[1].verdict, "refuted"));
        t("package: node: \u5185\u7F6E\u5728\u63D0\u53D6\u5C42\u5373\u6392\u9664", () => core2.pkgFromImport("node:fs") === null ? "ok" : "node:fs \u672A\u88AB\u6392\u9664");
        t("package: node:fs \u88AB normalizeClaims \u62D2\u7EDD", () => {
          try {
            core2.normalizeClaims([{ type: "package", target: "node:fs" }]);
            return "\u672A\u62D2\u7EDD";
          } catch (e) {
            return e.user ? "ok" : String(e);
          }
        });
        const cCliFlag = claims([{ type: "cli", target: "git", subcmd: ["switch"], flags: ["--orphan"] }])[0];
        const cCliBadFlag = claims([{ type: "cli", target: "git", subcmd: ["switch"], flags: ["--totally-fake-flag"] }])[0];
        const cCliDenied = claims([{ type: "cli", target: "powershell", flags: ["--help"] }])[0];
        const cCliMissing = claims([{ type: "cli", target: "git", subcmd: ["switch"], flags: ["-Z"] }])[0];
        const rC = await prims2.verifyClaims(root, [cCliFlag, cCliBadFlag, cCliDenied, cCliMissing], { skipGit: true });
        t("cli: git switch --orphan \u2192 verified\uFF08\u771F\u63A2\u6D4B\uFF09", () => assertEq(rC.claims[0].verdict, "verified"));
        t("cli: \u4F2A\u9020 flag \u2192 refuted", () => assertEq(rC.claims[1].verdict, "refuted"));
        t("cli: \u767D\u540D\u5355\u5916\u547D\u4EE4 \u2192 unverifiable", () => assertEq(rC.claims[2].verdict, "unverifiable"));
        t("cli: -Z \u77ED flag \u2192 unverifiable/refuted\uFF08\u4E0D\u865A\u5224\uFF09", () => ["unverifiable", "refuted"].includes(rC.claims[3].verdict) ? "ok" : assertEq(rC.claims[3].verdict, "?"));
        t("exec: \u6CE8\u5165 token \u88AB\u6821\u9A8C\u62D2\u7EDD", () => {
          const v = prims2.validateProbeArgs("git", ["status; rm -rf /"]);
          return v.ok === false ? "ok" : assertEq(v.ok, false);
        });
        t("exec: \u767D\u540D\u5355\u5916\u547D\u4EE4\u88AB\u62D2\u7EDD", () => {
          const v = prims2.validateProbeArgs("curl", ["--help"]);
          return v.ok === false ? "ok" : assertEq(v.ok, false);
        });
        const cCfgJson = claims([{ type: "config", target: "server.port", file: "config/app.config.json" }])[0];
        const cCfgMiss = claims([{ type: "config", target: "server.host", file: "config/app.config.json" }])[0];
        const cCfgDeep = claims([{ type: "config", target: "ping.timeout", file: "package.json" }])[0];
        const cCfgYaml = claims([{ type: "config", target: "log.level", file: "config/settings.yml" }])[0];
        const rCfg = await prims2.verifyClaims(root, [cCfgJson, cCfgMiss, cCfgDeep, cCfgYaml], { skipGit: true });
        t("config: JSON \u70B9\u8DEF\u5F84 \u2192 verified 8080", () => assertEq(rCfg.claims[0].verdict, "verified") || String(rCfg.claims[0].evidence).includes("8080") ? "ok" : "");
        t("config: JSON \u7F3A\u952E \u2192 refuted", () => assertEq(rCfg.claims[1].verdict, "refuted"));
        t("config: package.json \u6DF1\u952E \u2192 verified", () => assertEq(rCfg.claims[2].verdict, "verified"));
        t("config: YAML \u5F31\u8BC1\u636E \u2192 partial\uFF08\u5982\u5B9E\u6807\u6CE8\uFF09", () => assertEq(rCfg.claims[3].verdict, "partial"));
        const cVer = claims([{ type: "version", target: "node", constraint: "0.0.1" }])[0];
        const cVerHigh = claims([{ type: "version", target: "node", constraint: "99.0.0" }])[0];
        const rV = await prims2.verifyClaims(root, [cVer, cVerHigh], { skipGit: true });
        t("version: node >= 0.0.1 \u2192 verified", () => assertEq(rV.claims[0].verdict, "verified"));
        t("version: node >= 99.0.0 \u2192 refuted", () => assertEq(rV.claims[1].verdict, "refuted"));
        t("version: \u8BED\u4E49\u5316\u6BD4\u8F83 1.9 < 1.10", () => assertEq(prims2.cmpSemver("1.9.0", "1.10.0"), -1));
        const sample = [
          "\u5DF2\u5B8C\u6210\u767B\u5F55\u6A21\u5757\uFF1A",
          "```ts",
          'import express from "express";',
          'import { readFile } from "node:fs";',
          'import { helper } from "./util";',
          'const x = require("left-pad");',
          "git switch --orphan tmp-branch",
          "pnpm add zod",
          "```",
          "\u6539\u52A8\u96C6\u4E2D\u5728 `src/auth.ts` \u4E0E `src/token.ts`\uFF0C\u5165\u53E3\u51FD\u6570 `parseSession()` \u5B9A\u4E49\u5728 `src/auth.ts` \u4E2D\u3002",
          "\u9700\u8981 Node >= 18\uFF1B\u914D\u7F6E\u89C1 `app.config.json` \u4E2D\u7684 `server.port`\u3002"
        ].join("\n");
        const ex = core2.extractClaims(sample);
        t("\u63D0\u53D6: package 3 \u6761\uFF08node:fs \u6392\u9664\u3001./util \u6392\u9664\uFF09", () => {
          const pkgs = ex.claims.filter((c) => c.type === "package").map((c) => c.target).sort();
          return assertEq(JSON.stringify(pkgs), JSON.stringify(["express", "left-pad", "zod"]));
        });
        t("\u63D0\u53D6: cli \u542B git switch --orphan", () => {
          const cli = ex.claims.find((c) => c.type === "cli" && c.target === "git");
          return cli && cli.flags.includes("--orphan") ? "ok" : `flags=${JSON.stringify(cli)}`;
        });
        t("\u63D0\u53D6: file \u542B src/auth.ts", () => ex.claims.some((c) => c.type === "file" && c.target === "src/auth.ts") ? "ok" : JSON.stringify(ex.claims.filter((c) => c.type === "file")));
        t("\u63D0\u53D6: symbol parseSession \u6302\u4E0A src/auth.ts", () => {
          const s = ex.claims.find((c) => c.type === "symbol" && c.target === "parseSession");
          return s && s.file === "src/auth.ts" ? "ok" : JSON.stringify(s);
        });
        t("\u63D0\u53D6: version Node >= 18", () => {
          const v = ex.claims.find((c) => c.type === "version" && c.target === "node");
          return v && v.constraint === "18" ? "ok" : JSON.stringify(v);
        });
        t("\u63D0\u53D6: config server.port \u6302\u4E0A app.config.json", () => {
          const c = ex.claims.find((c2) => c2.type === "config" && c2.target === "server.port");
          return c && c.file === "app.config.json" ? "ok" : JSON.stringify(c);
        });
        t("\u63D0\u53D6: \u53BB\u91CD\uFF08\u540C target \u53EA\u4E00\u6761\uFF09", () => {
          const files = ex.claims.filter((c) => c.type === "file" && c.target === "src/auth.ts");
          return assertEq(files.length, 1);
        });
        t("normalize: \u8DEF\u5F84\u7A7F\u8D8A\u62D2\u7EDD", () => {
          try {
            core2.normalizeClaims([{ type: "file", target: "../../etc/passwd" }]);
            return "\u672A\u62D2\u7EDD";
          } catch (e) {
            return e.user ? "ok" : String(e);
          }
        });
        t("normalize: \u7B26\u53F7\u975E\u6CD5\u6807\u8BC6\u7B26\u62D2\u7EDD", () => {
          try {
            core2.normalizeClaims([{ type: "symbol", target: "foo bar" }]);
            return "\u672A\u62D2\u7EDD";
          } catch (e) {
            return e.user ? "ok" : String(e);
          }
        });
        t("formatReport: \u56DB\u6001\u9F50\u5168\u8F93\u51FA", () => {
          const report = { root, summary: { total: 4, verified: 1, refuted: 1, partial: 1, unverifiable: 1 }, claims: rF.claims.slice(0, 4).map((c, i) => ({ ...c, id: i + 1 })), gitStatusNote: "" };
          const text = core2.formatReport(report);
          return text.includes("\u5DF2\u8BC1\u5B9E") && text.includes("\u5DF2\u8BC1\u4F2A") && text.includes("\u90E8\u5206\u6838\u5B9E") && text.includes("\u65E0\u6CD5\u6838\u9A8C") ? "ok" : text.slice(0, 100);
        });
      } finally {
        try {
          fs.rmSync(root, { recursive: true, force: true });
        } catch (_) {
        }
        try {
          fs.rmSync(tmpBase, { recursive: true, force: true });
        } catch (_) {
        }
      }
      const pass = items.filter((i) => i.ok).length;
      return { pass, fail: items.length - pass, items };
    }
    module2.exports = { runSelftest: runSelftest2, buildFixture };
  }
});

// service/kvclient.js
var require_kvclient = __commonJS({
  "service/kvclient.js"(exports2, module2) {
    "use strict";
    var http2 = require("http");
    var fs = require("fs");
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
          const a = JSON.parse(fs.readFileSync(anchor, "utf8"));
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
          const root = JSON.parse(fs.readFileSync(p, "utf8"));
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
      async function kvGet2(key) {
        const r = await dispatchOk("cap.kv", { action: "get", key });
        return r && r.value !== void 0 ? r.value : null;
      }
      async function kvSet2(key, value) {
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
        kvGet: kvGet2,
        kvSet: kvSet2,
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
var path = require("path");
var crypto = require("crypto");
var core = require_claim_core();
var prims = require_verify_prims();
var { runSelftest } = require_selftest();
var { createKvClient } = require_kvclient();
var PLUGIN_ID = "claim-lens";
var VERSION = "0.1.0";
var LOG_MAX = 512 * 1024;
var BODY_LIMIT = 4 * 1024 * 1024;
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
      const st = require("fs").statSync(logFile);
      if (st.size > LOG_MAX) require("fs").renameSync(logFile, logFile + ".old");
    } catch (_) {
    }
    require("fs").appendFileSync(logFile, line + "\n");
  } catch (_) {
  }
}
var kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
var PREFIX = PLUGIN_ID + ".";
var KEY_META = PREFIX + "meta";
var KEY_SETTINGS = PREFIX + "settings";
var token = process.env.CLAIM_LENS_TEST_TOKEN || crypto.randomBytes(16).toString("hex");
function authed(req) {
  return String(req.headers["x-claim-lens-token"] || "") === token;
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
function fail(res, code, msg) {
  json(res, code, { ok: false, error: msg });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error("\u8BF7\u6C42\u4F53\u8D85\u8FC7 4MB"), { user: true }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function handleVerifyBatch(body) {
  const root = String(body.root || "").trim();
  if (!root) failUser("\u9700\u8981 root\uFF08\u4ED3\u5E93\u6839\u7EDD\u5BF9\u8DEF\u5F84\uFF09");
  if (!prims.isDir(root)) failUser(`root \u4E0D\u662F\u76EE\u5F55: ${root.slice(0, 120)}`);
  let claims;
  if (typeof body.text === "string" && body.text.trim() && !Array.isArray(body.claims)) {
    claims = core.extractClaims(body.text).claims;
  } else {
    claims = core.normalizeClaims(body.claims);
  }
  const report = await prims.verifyClaims(root, claims);
  return report;
}
function failUser(msg) {
  const e = new Error(msg);
  e.user = true;
  throw e;
}
async function handleSettings(body) {
  const cur = await kvGet(KEY_SETTINGS) || { roots: [] };
  if (body && Array.isArray(body.roots)) {
    const next = {
      roots: body.roots.filter((r) => typeof r === "string" && r.trim()).slice(0, 8),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const okWrite = await kvSet(KEY_SETTINGS, next);
    return { settings: next, saved: okWrite === true };
  }
  return { settings: cur, saved: false };
}
async function kvGet(key) {
  try {
    const m = await kv.request({ action: "get", key });
    if (m && m.ok === false) return null;
    const r = m && m.result ? m.result : m;
    if (r && typeof r === "object" && "value" in r) return r.value;
    return r && typeof r === "object" && key in r ? r[key] : r;
  } catch (_) {
    return null;
  }
}
async function kvSet(key, value) {
  try {
    const m = await kv.request({ action: "set", key, value });
    return !(m && m.ok === false);
  } catch (_) {
    return false;
  }
}
var server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];
  try {
    if (url === "/__health") {
      json(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION });
      return;
    }
    if (!authed(req)) {
      fail(res, 401, "\u7F3A\u5C11\u6216\u9519\u8BEF\u7684 token\uFF08\u9762\u677F\u5E94\u4ECE cap.kv claim-lens.meta \u8BFB\u53D6\uFF09");
      return;
    }
    if (req.method === "POST" && url === "/api/verify") {
      const body = JSON.parse(await readBody(req) || "{}");
      const report = await handleVerifyBatch(body);
      log("info", `verify root=${path.basename(String(body.root || ""))} claims=${report.summary.total} v/r/p/u=${report.summary.verified}/${report.summary.refuted}/${report.summary.partial}/${report.summary.unverifiable}`);
      json(res, 200, { ok: true, report });
      return;
    }
    if (req.method === "POST" && url === "/api/verify_batch") {
      const body = JSON.parse(await readBody(req) || "{}");
      const report = await handleVerifyBatch(body);
      log("info", `verify_batch root=${path.basename(String(body.root || ""))} claims=${report.summary.total}`);
      json(res, 200, { ok: true, report });
      return;
    }
    if (req.method === "POST" && url === "/api/extract") {
      const body = JSON.parse(await readBody(req) || "{}");
      const r = core.extractClaims(String(body.text || ""));
      log("info", `extract claims=${r.claims.length} blocks=${r.stats.codeBlocks}`);
      json(res, 200, { ok: true, ...r });
      return;
    }
    if (req.method === "POST" && url === "/api/selftest") {
      const r = await runSelftest();
      log("info", `selftest ${r.pass}/${r.items.length}`);
      json(res, 200, { ok: r.fail === 0, ...r });
      return;
    }
    if (req.method === "POST" && url === "/api/settings") {
      const body = JSON.parse(await readBody(req) || "{}");
      json(res, 200, { ok: true, ...await handleSettings(body) });
      return;
    }
    fail(res, 404, `\u672A\u77E5\u8DEF\u7531 ${req.method} ${url}`);
  } catch (e) {
    const userErr = e && e.user;
    log(userErr ? "warn" : "error", `req ${url}: ${String(e && e.message || e).slice(0, 200)}`);
    fail(res, userErr ? 400 : 500, String(e && e.message || e));
  }
});
server.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  log("info", `service listening on 127.0.0.1:${port} (version ${VERSION})`);
  Promise.resolve().then(() => kvSet(KEY_META, { token, port, version: VERSION, startedAt: (/* @__PURE__ */ new Date()).toISOString() })).then((okWrite) => log(okWrite ? "info" : "warn", okWrite ? "meta \u5DF2\u5199 cap.kv" : "meta \u5199 kv \u5931\u8D25\uFF08\u6865\u964D\u7EA7\uFF0C\u9762\u677F\u5C06\u65E0\u6CD5\u8FDE\u63A5\u76F4\u5230\u6865\u6062\u590D\uFF09")).catch((e) => log("warn", `meta \u5199 kv \u5F02\u5E38\uFF08\u964D\u7EA7\uFF09: ${String(e && e.message || e)}`));
});
process.on("SIGTERM", () => {
  try {
    server.close(() => process.exit(0));
  } catch (_) {
    process.exit(0);
  }
});
process.on("SIGINT", () => {
  try {
    server.close(() => process.exit(0));
  } catch (_) {
    process.exit(0);
  }
});
