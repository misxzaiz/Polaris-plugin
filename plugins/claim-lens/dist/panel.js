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

// shared/claim-core.js
var require_claim_core = __commonJS({
  "shared/claim-core.js"(exports, module) {
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
    function extractClaims2(text, opts) {
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
      if (!CLAIM_TYPES.has(c.type)) fail(`claims[${idx}].type \u5FC5\u987B\u662F ${[...CLAIM_TYPES].join("/")} \u4E4B\u4E00`);
      const target = isStr(c.target) ? c.target.trim() : "";
      if (!target) fail(`claims[${idx}].target \u4E0D\u80FD\u4E3A\u7A7A`);
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
      if (c.type === "symbol" && !safeIdentSrc(out.target)) fail(`claims[${idx}].target \u4E0D\u662F\u5408\u6CD5\u6807\u8BC6\u7B26: ${out.target}`);
      if (c.type === "package" && !pkgFromImport(out.target) && !pkgFromSpec(out.target)) fail(`claims[${idx}].target \u4E0D\u662F\u5408\u6CD5\u5305\u540D: ${out.target}`);
      if (c.type === "cli" && !/^[a-z][a-z0-9._-]*$/i.test(out.target)) fail(`claims[${idx}].target \u4E0D\u662F\u5408\u6CD5\u547D\u4EE4\u540D: ${out.target}`);
      if (c.type === "version" && !/^\d{1,3}(\.\d{1,3}){0,2}$/.test(out.constraint || "")) fail(`claims[${idx}].constraint \u5FC5\u987B\u662F x.y.z \u5F62\u5F0F`);
      if (c.type === "config") {
        const segs = out.target.split(".");
        if (segs.length < 1 || !segs.every((s) => /^[A-Za-z0-9_$-]+$/.test(s))) fail(`claims[${idx}].target \u5FC5\u987B\u662F\u70B9\u8DEF\u5F84: ${out.target}`);
      }
      if (c.type === "file" && (out.target.includes("..") || out.target.includes("://"))) fail(`claims[${idx}].target \u7591\u4F3C\u8DEF\u5F84\u7A7F\u8D8A/URL: ${out.target}`);
      return out;
    }
    function fail(msg) {
      const e = new Error(msg);
      e.user = true;
      throw e;
    }
    function normalizeClaims(list) {
      if (!Array.isArray(list)) fail("claims \u5FC5\u987B\u662F\u6570\u7EC4");
      if (list.length === 0) fail("claims \u4E3A\u7A7A");
      if (list.length > 300) fail("\u5355\u6B21\u6838\u9A8C\u58F0\u660E\u6570 \u2264 300");
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
    module.exports = {
      VERDICTS,
      VERDICT_LABEL,
      CLI_KNOWN,
      NODE_BUILTIN,
      FILE_EXT,
      CONFIG_EXT,
      extractClaims: extractClaims2,
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

// src/Panel.tsx
var core = __toESM(require_claim_core());
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const r = res.result && res.result.value !== void 0 ? res.result : res;
  if (r && typeof r === "object" && "value" in r) return r.value;
  return r;
}
async function kvSet(key, value) {
  await kvReq({ action: "set", key, value });
}
async function getMeta() {
  try {
    const m = await kvGet("claim-lens.meta");
    if (m && typeof m === "object" && typeof m.port === "number" && m.token) {
      return m;
    }
  } catch (_) {
  }
  return null;
}
async function loadSettings() {
  try {
    const s = await kvGet("claim-lens.settings");
    if (s && typeof s === "object" && Array.isArray(s.roots)) return s;
  } catch (_) {
  }
  return { roots: [] };
}
async function saveRoot(roots, nextRoot) {
  const list = [nextRoot, ...roots.filter((r) => r !== nextRoot)].slice(0, 8);
  await kvSet("claim-lens.settings", { roots: list, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
}
async function api(meta, pathName, body) {
  const res = await fetch(`http://127.0.0.1:${meta.port}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-claim-lens-token": meta.token },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
var apiVerify = (meta, text, root) => api(meta, "/api/verify", { text, root });
var apiSelftest = (meta) => api(meta, "/api/selftest", {});

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var css = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cl-body::-webkit-scrollbar{width:9px;height:9px}
.cl-body::-webkit-scrollbar-track{background:transparent}
.cl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#6C9EF8,#2D5BD7);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.cl-tt{flex:1;min-width:0}
.cl-tt b{font-size:15px;display:block}
.cl-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.cl-cols{display:flex;gap:10px;padding:0 16px;align-items:flex-start}
.cl-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.cl-card{background:#151A24;border:1px solid #232A38;border-radius:12px;padding:11px 13px}
.cl-sec{display:flex;align-items:center;gap:8px;padding:2px 0 6px;font-size:13px;font-weight:700}
.cl-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#6C9EF8,#2D5BD7);flex-shrink:0}
.cl-lbl{font-size:11px;color:#8B95A7;min-width:56px}
.cl-inp,.cl-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.cl-inp:focus,.cl-txa:focus{border-color:#6C9EF8}
.cl-inp{flex:1;min-width:100px}
.cl-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:12px}
.cl-btn{background:linear-gradient(135deg,#4E7FE8,#2D5BD7);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cl-btn:hover{filter:brightness(1.1)}
.cl-btn:disabled{opacity:.5;cursor:default}
.cl-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.cl-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.cl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0}
.cl-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;border-radius:7px;padding:2px 8px;background:#1C2330;color:#B9C2D4}
.cl-chip.v-verified{background:rgba(62,207,178,.14);color:#7BDCC4}
.cl-chip.v-refuted{background:rgba(229,72,77,.14);color:#F2A0A3}
.cl-chip.v-partial{background:rgba(240,180,70,.14);color:#F0C674}
.cl-chip.v-unverifiable{background:rgba(140,150,170,.14);color:#9AA5B8}
.cl-claim{border:1px solid #232A38;border-radius:10px;padding:8px 10px;margin:6px 0;background:#10141C}
.cl-claim.verdict-verified{border-color:rgba(62,207,178,.45)}
.cl-claim.verdict-refuted{border-color:rgba(229,72,77,.45)}
.cl-claim.verdict-partial{border-color:rgba(240,180,70,.4)}
.cl-claim.verdict-unverifiable{border-color:#2A3140}
.cl-quote{color:#8B95A7;font-size:11px;margin-top:3px;font-family:Consolas,Menlo,monospace;word-break:break-all}
.cl-ev{margin:4px 0 0;padding-left:10px;border-left:2px solid #232A38;color:#B9C2D4;font-size:11.5px;word-break:break-all;font-family:Consolas,Menlo,monospace}
.cl-hint{color:#8B95A7;font-size:11px;margin-top:4px}
.cl-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all}
.cl-empty{color:#5A6478;font-size:12px;padding:14px 2px;text-align:center}
.cl-pre{background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:9px 11px;font-family:Consolas,Menlo,monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-all;max-height:180px;overflow-y:auto;margin:6px 0}
.cl-target{font-family:Consolas,Menlo,monospace;font-size:12px;word-break:break-all;color:#E6EAF2}
.cl-file{color:#8B95A7;font-size:11px;font-family:Consolas,Menlo,monospace}
.cl-hist{position:relative;flex:1;min-width:160px;display:flex}
.cl-hist .cl-inp{border-radius:8px 0 0 8px}
.cl-histbtn{background:#1C2330;border:1px solid #232A38;border-left:none;color:#8B95A7;border-radius:0 8px 8px 0;padding:0 8px;cursor:pointer;font-size:11px}
.cl-menu{position:absolute;top:100%;left:0;right:0;z-index:40;background:#151A24;border:1px solid #2A3140;border-radius:8px;overflow:hidden;max-height:180px;overflow-y:auto}
.cl-menu div{padding:6px 10px;font-size:11.5px;cursor:pointer;font-family:Consolas,Menlo,monospace;word-break:break-all}
.cl-menu div:hover{background:#1C2330}
`;
var TYPE_LABEL = {
  file: "\u6587\u4EF6",
  symbol: "\u7B26\u53F7",
  package: "\u4F9D\u8D56",
  cli: "\u547D\u4EE4",
  config: "\u914D\u7F6E",
  version: "\u7248\u672C"
};
var VERDICT_TEXT = {
  verified: "\u2713 \u5DF2\u8BC1\u5B9E",
  refuted: "\u2717 \u5DF2\u8BC1\u4F2A",
  partial: "\u25D0 \u90E8\u5206\u6838\u5B9E",
  unverifiable: "? \u65E0\u6CD5\u6838\u9A8C"
};
function claimLabel(c) {
  const flags = c.flags && c.flags.length ? ` ${c.flags.join(" ")}` : "";
  const sub = c.subcmd && c.subcmd.length ? ` ${c.subcmd.join(" ")}` : "";
  const cons = c.constraint ? ` \u2265${c.constraint}` : "";
  const file = c.file ? ` @${c.file}` : "";
  return `${c.target}${sub}${flags}${cons}${file}`;
}
function ClaimLensPanel(_props) {
  const [meta, setMeta] = useState(null);
  const [roots, setRoots] = useState([]);
  const [root, setRoot] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [text, setText] = useState("");
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selftest, setSelftest] = useState(null);
  useEffect(() => {
    void (async () => {
      const [m, s] = await Promise.all([getMeta(), loadSettings()]);
      setMeta(m);
      if (s.roots.length) {
        setRoots(s.roots);
        setRoot((r) => r || s.roots[0]);
      }
    })();
  }, []);
  const extracted = useMemo(() => text.trim() ? core.extractClaims(text).claims : [], [text]);
  const exByType = useMemo(() => {
    const m = {};
    for (const c of extracted) m[c.type] = (m[c.type] || 0) + 1;
    return m;
  }, [extracted]);
  const runVerify = useCallback(async () => {
    if (!meta || !text.trim() || !root.trim()) return;
    setBusy(true);
    setErr("");
    setSelftest(null);
    try {
      const r = await apiVerify(meta, text, root.trim());
      setReport(r.report);
      void saveRoot(roots, root.trim()).then(() => setRoots((prev) => [root.trim(), ...prev.filter((x) => x !== root.trim())].slice(0, 8))).catch(() => {
      });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta, text, root, roots]);
  const runSelftestOnce = useCallback(async () => {
    if (!meta) return;
    setBusy(true);
    setErr("");
    try {
      const r = await apiSelftest(meta);
      setSelftest({ pass: r.pass, fail: r.fail });
      if (r.fail > 0) setErr(`\u8BD5\u91D1\u77F3 ${r.fail} \u6761\u672A\u8FC7\uFF1A${r.items.filter((i) => !i.ok).map((i) => i.name).join("\u3001")}`);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta]);
  const claims = report?.claims || [];
  return /* @__PURE__ */ jsxs("div", { className: "cl-root", children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    /* @__PURE__ */ jsxs("div", { className: "cl-top", children: [
      /* @__PURE__ */ jsx("div", { className: "cl-logo", children: "\u2696" }),
      /* @__PURE__ */ jsxs("div", { className: "cl-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "AI \u58F0\u660E\u6838\u9A8C\u53F0" }),
        /* @__PURE__ */ jsx("small", { children: meta ? `\u670D\u52A1\u5728\u7EBF :${meta.port} \xB7 \u58F0\u660E\u5BF9\u7167\u672C\u5730\u5B9E\u8BC1\uFF0C\u8BC1\u636E\u968F\u884C` : "\u670D\u52A1\u672A\u8FDE\u63A5 \xB7 \u7B49\u5F85\u5BBF\u4E3B\u62C9\u8D77\uFF08\u9996\u5F00\u9762\u677F\u89E6\u53D1 discover\uFF09" })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "cl-btn ghost mini", onClick: () => void runSelftestOnce(), disabled: busy || !meta, children: "\u8BD5\u91D1\u77F3" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "cl-cols", children: [
        /* @__PURE__ */ jsxs("div", { className: "cl-col", style: { flex: 1.15 }, children: [
          /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
              /* @__PURE__ */ jsx("span", { className: "cl-bar" }),
              "\u4ED3\u5E93\u6839"
            ] }),
            /* @__PURE__ */ jsx("div", { className: "cl-row", children: /* @__PURE__ */ jsxs("div", { className: "cl-hist", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "cl-inp",
                  value: root,
                  placeholder: "D:\\\\space\\\\base\\\\Polaris-plugin \u4E4B\u7C7B\u7684\u7EDD\u5BF9\u8DEF\u5F84",
                  onChange: (e) => setRoot(e.target.value)
                }
              ),
              /* @__PURE__ */ jsx("button", { className: "cl-histbtn", onClick: () => setHistOpen((v) => !v), title: "\u5386\u53F2", children: "\u25BE" }),
              histOpen && /* @__PURE__ */ jsxs("div", { className: "cl-menu", children: [
                roots.length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "#5A6478" }, children: "\u6682\u65E0\u5386\u53F2" }),
                roots.map((r) => /* @__PURE__ */ jsx("div", { onClick: () => {
                  setRoot(r);
                  setHistOpen(false);
                }, children: r }, r))
              ] })
            ] }) }),
            /* @__PURE__ */ jsxs("div", { className: "cl-sec", style: { paddingTop: 8 }, children: [
              /* @__PURE__ */ jsx("span", { className: "cl-bar" }),
              "AI \u56DE\u7B54\u539F\u6587"
            ] }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                className: "cl-txa",
                rows: 12,
                value: text,
                placeholder: "\u7C98\u8D34 AI \u7684\u56DE\u7B54/\u5B8C\u6210\u62A5\u544A\uFF0C\u4F8B\u5982\uFF1A\n\u5DF2\u5B8C\u6210\u767B\u5F55\u6A21\u5757\uFF0C\u6539\u52A8\u5728 `src/auth.ts`\uFF08\u5165\u53E3 `parseSession()`\uFF09\uFF0C\u4F9D\u8D56 `zod`\uFF0C\u9700\u8981 Node >= 18\u2026",
                onChange: (e) => setText(e.target.value)
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
              /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => void runVerify(), disabled: busy || !meta || !text.trim() || !root.trim(), children: busy ? "\u6838\u9A8C\u4E2D\u2026" : "\u63D0\u53D6\u5E76\u6838\u9A8C" }),
              extracted.length > 0 && /* @__PURE__ */ jsx("span", { className: "cl-row", style: { gap: 4 }, children: Object.entries(exByType).map(([t, n]) => /* @__PURE__ */ jsxs("span", { className: "cl-chip", children: [
                TYPE_LABEL[t] || t,
                " ",
                n
              ] }, t)) })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "cl-hint", children: "\u63D0\u53D6\u5728\u672C\u5730\u5B8C\u6210\uFF08\u96F6\u5916\u8054\uFF09\uFF1B\u6838\u9A8C\u7531\u672C\u673A\u670D\u52A1\u5BF9\u7167\u4ED3\u5E93\u5B9E\u8BC1\u3002exec \u4EC5\u767D\u540D\u5355 --help/--version \u63A2\u6D4B\uFF0Cfs \u5168\u53EA\u8BFB\u3002" })
          ] }),
          selftest && /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
              /* @__PURE__ */ jsx("span", { className: "cl-bar" }),
              "\u8BD5\u91D1\u77F3"
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
              /* @__PURE__ */ jsxs("span", { className: "cl-chip v-verified", children: [
                selftest.pass,
                " \u901A\u8FC7"
              ] }),
              selftest.fail > 0 && /* @__PURE__ */ jsxs("span", { className: "cl-chip v-refuted", children: [
                selftest.fail,
                " \u672A\u8FC7"
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "cl-col", style: { flex: 1 }, children: report ? /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
            /* @__PURE__ */ jsx("span", { className: "cl-bar" }),
            "\u6838\u9A8C\u62A5\u544A"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
            /* @__PURE__ */ jsxs("span", { className: "cl-chip v-verified", children: [
              "\u2713 ",
              report.summary.verified
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "cl-chip v-refuted", children: [
              "\u2717 ",
              report.summary.refuted
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "cl-chip v-partial", children: [
              "\u25D0 ",
              report.summary.partial
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "cl-chip v-unverifiable", children: [
              "? ",
              report.summary.unverifiable
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "cl-hint", children: [
            report.root,
            " \xB7 ",
            report.gitStatusNote,
            " \xB7 ",
            report.scannedAt.slice(11, 19)
          ] }),
          /* @__PURE__ */ jsx("div", { style: { marginTop: 6 }, children: claims.map((c) => /* @__PURE__ */ jsxs("div", { className: `cl-claim verdict-${c.verdict}`, children: [
            /* @__PURE__ */ jsxs("div", { className: "cl-row", style: { marginBottom: 2 }, children: [
              /* @__PURE__ */ jsx("span", { className: `cl-chip v-${c.verdict}`, children: VERDICT_TEXT[c.verdict] }),
              /* @__PURE__ */ jsx("span", { className: "cl-chip", children: TYPE_LABEL[c.type] || c.type }),
              /* @__PURE__ */ jsxs("span", { className: "cl-target", children: [
                "#",
                c.id,
                " ",
                claimLabel(c)
              ] })
            ] }),
            c.quote && /* @__PURE__ */ jsxs("div", { className: "cl-quote", children: [
              "\u539F\u6587\u300C",
              c.quote.length > 110 ? c.quote.slice(0, 107) + "\u2026" : c.quote,
              "\u300D"
            ] }),
            (c.evidence || []).map((ev, i) => /* @__PURE__ */ jsx("div", { className: "cl-ev", children: ev }, i)),
            c.hint && /* @__PURE__ */ jsxs("div", { className: "cl-hint", children: [
              "\u21B3 ",
              c.hint
            ] })
          ] }, c.id)) })
        ] }) : /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
          /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
            /* @__PURE__ */ jsx("span", { className: "cl-bar" }),
            "\u6838\u9A8C\u62A5\u544A"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "cl-empty", children: extracted.length > 0 ? `\u5DF2\u63D0\u53D6 ${extracted.length} \u6761\u58F0\u660E\uFF0C\u70B9\u300C\u63D0\u53D6\u5E76\u6838\u9A8C\u300D\u5BF9\u7167\u4ED3\u5E93\u5B9E\u8BC1` : "\u7C98\u8D34 AI \u56DE\u7B54\u540E\u5F00\u59CB\uFF1B\u4E94\u7C7B\u58F0\u660E\uFF1A\u6587\u4EF6 / \u7B26\u53F7 / \u4F9D\u8D56 / \u547D\u4EE4 / \u914D\u7F6E" }),
          extracted.length > 0 && /* @__PURE__ */ jsx("div", { className: "cl-pre", children: extracted.map((c) => `#${c.id} [${TYPE_LABEL[c.type] || c.type}] ${claimLabel(c)}`).join("\n") })
        ] }) })
      ] }),
      err && /* @__PURE__ */ jsx("div", { className: "cl-err", children: err })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function ClaimLensEntry(props) {
  return /* @__PURE__ */ jsx2(ClaimLensPanel, { ...props });
}
export {
  ClaimLensEntry as default
};
