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

// shared/ci-core.js
var require_ci_core = __commonJS({
  "shared/ci-core.js"(exports, module) {
    "use strict";
    var SEV = { ERROR: "error", WARN: "warn", INFO: "info" };
    var DEDUCT = { error: 2, warn: 0.7, info: 0.2 };
    function mk(rule, level, line, message, fix) {
      return { rule, level, line, message, fix: fix || "" };
    }
    function round1(n) {
      return Math.round(n * 10) / 10;
    }
    function levenshtein(a, b) {
      if (a === b) return 0;
      const m = a.length, n = b.length;
      if (Math.abs(m - n) > 2) return 3;
      let prev = new Array(n + 1);
      for (let j = 0; j <= n; j++) prev[j] = j;
      for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
      }
      return prev[n];
    }
    var CRON_BOUNDS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
    var CRON_NAMES = [
      { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 },
      { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
    ];
    function validateCron(expr) {
      if (typeof expr !== "string" || !expr.trim()) return { ok: false, detail: "cron \u4E3A\u7A7A" };
      if (expr.trim().startsWith("@")) return { ok: false, detail: `GitHub Actions \u4E0D\u652F\u6301 @${expr.trim().slice(1)} \u7B80\u5199\uFF0C\u9700 5 \u6BB5 cron` };
      const fields = expr.trim().split(/\s+/);
      if (fields.length !== 5) return { ok: false, detail: `\u5E94\u4E3A 5 \u6BB5\uFF08\u5206 \u65F6 \u65E5 \u6708 \u661F\u671F\uFF09\uFF0C\u5B9E\u9645 ${fields.length} \u6BB5` };
      for (let f = 0; f < 5; f++) {
        const [lo, hi] = CRON_BOUNDS[f];
        for (const item of fields[f].split(",")) {
          const m = /^(\*|\d+|[A-Za-z]{3})(?:-(\d+|[A-Za-z]{3}))?(?:\/(\d+))?$/.exec(item);
          if (!m) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B` };
          const names = CRON_NAMES[f === 3 ? 0 : f === 4 ? 1 : null] || null;
          const num = (tok) => {
            if (/^\d+$/.test(tok)) return parseInt(tok, 10);
            if (names && names[tok.toUpperCase()] !== void 0) return names[tok.toUpperCase()];
            return NaN;
          };
          const a = num(m[1]);
          if (m[1] !== "*") {
            if (Number.isNaN(a)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u542B\u65E0\u6548\u6570\u503C/\u540D\u79F0` };
            if (a < lo || a > hi && !(f === 4 && a === 7)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8D85\u51FA\u8303\u56F4 ${lo}-${hi}` };
            if (f === 4 && a === 7) {
            }
          }
          if (m[2]) {
            const b = num(m[2]);
            if (Number.isNaN(b)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8303\u56F4\u7EC8\u70B9\u65E0\u6548` };
            if (b < lo || b > hi && !(f === 4 && b === 7)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8303\u56F4\u8D85\u51FA ${lo}-${hi}` };
            if (m[1] !== "*" && a > b) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8303\u56F4\u8D77\u70B9\u5927\u4E8E\u7EC8\u70B9` };
          }
          if (m[3] && parseInt(m[3], 10) < 1) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u6B65\u957F\u987B \u22651` };
        }
      }
      return { ok: true, detail: "" };
    }
    var DOCKER_INSTRUCTIONS = /* @__PURE__ */ new Set([
      "FROM",
      "RUN",
      "CMD",
      "LABEL",
      "MAINTAINER",
      "EXPOSE",
      "ENV",
      "ADD",
      "COPY",
      "ENTRYPOINT",
      "VOLUME",
      "USER",
      "WORKDIR",
      "ARG",
      "ONBUILD",
      "STOPSIGNAL",
      "HEALTHCHECK",
      "SHELL"
    ]);
    function parseDockerfile(text) {
      const lines = text.split(/\r?\n/);
      const instructions = [];
      let heredoc = null;
      let i = 0;
      while (i < lines.length) {
        if (heredoc) {
          const t2 = lines[i].trim();
          if (t2 === heredoc.delim) heredoc = null;
          i++;
          continue;
        }
        const t = lines[i].trim();
        if (t === "" || t.startsWith("#")) {
          i++;
          continue;
        }
        let j = i;
        const parts = [];
        for (; ; ) {
          const cur = lines[j];
          parts.push(cur.replace(/\\\s*$/, ""));
          if (/\\\s*$/.test(cur) && j + 1 < lines.length) {
            j++;
          } else {
            break;
          }
        }
        const joined = parts.join(" ").replace(/\s+/g, " ").trim();
        let q = null;
        let marker = null;
        for (let k = 0; k < joined.length; k++) {
          const c = joined[k];
          if (q) {
            if (c === q) q = null;
            continue;
          }
          if (c === "'" || c === '"') {
            q = c;
            continue;
          }
          if (c === "<" && joined[k + 1] === "<") {
            const m = /^<<(-?)\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(joined.slice(k));
            if (m) {
              marker = { delim: m[2], strip: m[1] === "-" };
              break;
            }
          }
        }
        const mInst = /^([A-Za-z]+)(?:\s+(.*))?$/.exec(joined);
        const name = mInst ? mInst[1].toUpperCase() : "";
        if (DOCKER_INSTRUCTIONS.has(name)) {
          instructions.push({ name, text: joined.slice(name.length).trim(), start: i + 1, end: j + 1 });
        }
        if (marker) heredoc = marker;
        i = j + 1;
      }
      return { instructions, lines: lines.length };
    }
    function splitStages(instructions) {
      const stages = [];
      for (const inst of instructions) {
        if (inst.name === "FROM") stages.push({ from: inst, instructions: [] });
        else if (stages.length) stages[stages.length - 1].instructions.push(inst);
        else stages.push({ from: null, instructions: [inst] });
      }
      return stages;
    }
    function findSudoUsage(text) {
      const pkgCtx = /* @__PURE__ */ new Set(["install", "add", "remove", "purge", "autoremove", "apt-get", "apt", "apk", "yum", "dnf", "get", "want", "reinstall", "mark"]);
      const tokens = text.split(/\s+/);
      for (let k = 0; k < tokens.length; k++) {
        const clean = tokens[k].replace(/[^A-Za-z0-9_-]/g, "");
        if (clean === "sudo") {
          let prev = "";
          for (let j = k - 1; j >= 0; j--) {
            if (tokens[j].startsWith("-")) continue;
            prev = tokens[j].replace(/[^A-Za-z0-9_-]/g, "");
            break;
          }
          if (prev === "") return true;
          if (!pkgCtx.has(prev) && prev !== "export" && prev !== "useradd") return true;
        }
      }
      return false;
    }
    function hasPipeToShell(text) {
      return /(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/.test(text);
    }
    function aptInstallUnpinned(text) {
      const m = /(?:apt-get\s+install|apt\s+install)([^&|;]*)/.exec(text);
      if (!m) return true;
      const pkgs = m[1].split(/\s+/).filter(Boolean);
      for (const p of pkgs) {
        if (p.startsWith("-")) continue;
        if (p.includes("=")) return false;
      }
      return pkgs.length > 0;
    }
    var DOCKER_RULES = [
      { id: "from_unpinned", level: "warn", title: "\u57FA\u7840\u955C\u50CF\u672A\u9489\u7248\u672C", fix: "FROM \u6307\u5411\u660E\u786E tag\uFF08\u5982 node:20-alpine\uFF09\u6216 digest\uFF08@sha256:\u2026\uFF09\uFF1Blatest \u4F1A\u968F\u4E0A\u6E38\u6F02\u79FB\uFF0C\u540C\u4E00 Dockerfile \u4E24\u6B21\u6784\u5EFA\u53EF\u80FD\u5F97\u5230\u4E0D\u540C\u7ED3\u679C\u3002" },
      { id: "apt_no_recommends", level: "warn", title: "apt-get install \u7F3A --no-install-recommends", fix: "apt-get install -y --no-install-recommends \u2026\uFF0C\u907F\u514D\u62C9\u5165\u63A8\u8350\u5305\u81A8\u80C0\u955C\u50CF\u3002" },
      { id: "apt_no_cache_cleanup", level: "warn", title: "apt \u7F13\u5B58\u672A\u6E05\u7406", fix: "\u540C\u4E00\u6761 RUN \u5185\u63A5 rm -rf /var/lib/apt/lists/*\uFF0C\u7F13\u5B58\u7559\u5728\u5C42\u91CC\u4F1A\u8BA9\u955C\u50CF\u5E73\u767D\u53D8\u5927\u3002" },
      { id: "apt_get_upgrade", level: "warn", title: "RUN \u4E2D\u6267\u884C apt-get upgrade/dist-upgrade", fix: "\u5220\u9664\u8BE5 upgrade\uFF1A\u57FA\u7840\u955C\u50CF\u5185\u5DF2\u542B\u6240\u9700\u66F4\u65B0\uFF1B\u65E0\u9489\u5347\u7EA7\u4E0D\u53EF\u590D\u73B0\u3002\u6309\u9700 apt-get install \u660E\u786E\u5305\u3002" },
      { id: "apt_version_unpinned", level: "info", title: "apt \u5305\u672A\u9489\u7248\u672C", fix: "apt-get install pkg=1.2.3 \u9489\u7248\u672C\uFF0C\u4FDD\u8BC1\u6784\u5EFA\u53EF\u590D\u73B0\uFF1BDebian \u5B89\u5168\u66F4\u65B0\u5E38\u6539\u7248\u672C\u53F7\uFF0C\u53EF\u5728 Dependabot \u91CC\u8DDF\u8FDB\u3002" },
      { id: "apk_no_cache", level: "warn", title: "apk add \u7F3A --no-cache", fix: "apk add --no-cache \u2026\uFF0C\u907F\u514D\u7D22\u5F15\u7F13\u5B58\u7559\u5728\u955C\u50CF\u5C42\u3002" },
      { id: "sudo_used", level: "warn", title: "RUN \u4E2D\u4F7F\u7528 sudo", fix: "\u5BB9\u5668\u5185\u9ED8\u8BA4\u5DF2\u662F root\uFF0Csudo \u65E0\u610F\u4E49\u4E14\u5F15\u5165\u989D\u5916\u5C42\uFF1B\u76F4\u63A5\u6267\u884C\u547D\u4EE4\u5373\u53EF\u3002" },
      { id: "curl_pipe_sh", level: "warn", title: "curl/wget \u7BA1\u9053\u76F4\u6267\u884C\u8FDC\u7A0B\u811A\u672C", fix: "\u5148\u4E0B\u8F7D\u5230\u6587\u4EF6\u3001\u6821\u9A8C checksum/\u7B7E\u540D\u540E\u518D\u6267\u884C\uFF1B\u7BA1\u9053\u76F4\u6267\u884C\u65E0\u6CD5\u5BA1\u8BA1\u811A\u672C\u5185\u5BB9\uFF0C\u4F9B\u5E94\u94FE\u98CE\u9669\u9AD8\u3002" },
      { id: "add_remote_url", level: "warn", title: "ADD \u7528\u4E8E\u8FDC\u7A0B URL", fix: "\u6539\u7528 RUN curl -fsSL -o file url && \u6821\u9A8C\u548C\uFF1BADD \u8FDC\u7A0B URL \u4E0D\u89E3\u538B\u3001\u65E0\u7F13\u5B58\u6821\u9A8C\uFF0C\u4E14\u5C42\u7684\u6821\u9A8C\u548C\u4F1A\u968F\u8FDC\u7AEF\u53D8\u5316\u3002" },
      { id: "add_instead_of_copy", level: "info", title: "\u672C\u5730\u8DEF\u5F84\u5EFA\u8BAE COPY \u800C\u975E ADD", fix: "ADD \u7684\u9690\u5F0F tar \u81EA\u52A8\u89E3\u5305\u6613\u5F15\u5165\u610F\u5916\u884C\u4E3A\uFF1B\u9664\u975E\u786E\u5B9E\u9700\u8981\u89E3\u5305 tar\uFF0C\u5426\u5219\u7EDF\u4E00\u7528 COPY\u3002" },
      { id: "copy_broad_dot", level: "info", title: "\u5168\u91CF COPY\uFF08COPY . .\uFF09", fix: "\u914D\u5408 .dockerignore \u6392\u9664 .git/secrets/node_modules\uFF0C\u9632\u6B62\u654F\u611F\u6587\u4EF6\u8FDB\u5165\u955C\u50CF\u5C42\u3002" },
      { id: "multiple_cmd", level: "error", title: "\u540C\u4E00\u9636\u6BB5\u51FA\u73B0\u591A\u4E2A CMD", fix: "\u4EC5\u6700\u540E\u4E00\u4E2A CMD \u751F\u6548\uFF0C\u5176\u4F59\u4E3A\u65E0\u6548\u914D\u7F6E\uFF1B\u5408\u5E76\u4E3A\u4E00\u6761\u6216\u5220\u9664\u591A\u4F59\u9879\u3002" },
      { id: "multiple_entrypoint", level: "error", title: "\u540C\u4E00\u9636\u6BB5\u51FA\u73B0\u591A\u4E2A ENTRYPOINT", fix: '\u4EC5\u6700\u540E\u4E00\u4E2A ENTRYPOINT \u751F\u6548\uFF1B\u5982\u9700\u5305\u88C5\u5165\u53E3\uFF0C\u7528 exec-form ENTRYPOINT ["wrapper"] + CMD\u3002' },
      { id: "maintainer_deprecated", level: "warn", title: "MAINTAINER \u5DF2\u5F03\u7528", fix: '\u6539\u7528 LABEL org.opencontainers.image.authors="\u2026"' },
      { id: "env_legacy_space", level: "warn", title: "ENV \u7A7A\u683C\u5206\u9694\u65E7\u8BED\u6CD5", fix: "\u6539\u4E3A ENV key=value\uFF1B\u65E7\u8BED\u6CD5\u53EA\u652F\u6301\u5355\u952E\u4E14\u4E0E\u503C\u4E2D\u7684\u7A7A\u683C\u6B67\u4E49\u3002" },
      { id: "workdir_relative", level: "warn", title: "WORKDIR \u76F8\u5BF9\u8DEF\u5F84\u4E14\u65E0\u524D\u7F6E\u7EDD\u5BF9 WORKDIR", fix: "\u5148\u5199\u7EDD\u5BF9\u8DEF\u5F84\uFF08WORKDIR /app\uFF09\uFF0C\u5426\u5219\u4F1A\u9690\u5F0F\u521B\u5EFA /<name>\u3002" },
      { id: "no_user", level: "info", title: "\u8FD0\u884C\u65F6\u9636\u6BB5\u672A\u58F0\u660E USER", fix: "\u672B\u5C3E\u6DFB\u52A0 USER appuser \u5E76\u63D0\u524D\u521B\u5EFA\u8D26\u53F7\uFF1B\u5BB9\u5668\u9ED8\u8BA4\u4EE5 root \u8FD0\u884C\u6269\u5927\u9003\u9038\u98CE\u9669\u3002" },
      { id: "json_form_prefer", level: "info", title: "CMD/ENTRYPOINT \u5EFA\u8BAE exec \u5F62\u5F0F", fix: 'shell \u5F62\u5F0F\u7ECF /bin/sh -c \u5305\u88C5\uFF0C\u65E0\u6CD5\u63A5\u6536 SIGTERM \u5BFC\u81F4 10s \u540E\u88AB\u5F3A\u6740\uFF1B\u6539 ["executable","arg"] \u5F62\u5F0F\u3002' },
      { id: "no_healthcheck", level: "info", title: "\u6709 EXPOSE \u4F46\u672A\u58F0\u660E HEALTHCHECK", fix: "\u6DFB\u52A0 HEALTHCHECK \u6307\u4EE4\uFF0C\u7F16\u6392\u5C42\u624D\u80FD\u611F\u77E5\u5BB9\u5668\u771F\u5B9E\u5065\u5EB7\u72B6\u6001\uFF08\u53EF\u9009\u5B9E\u8DF5\uFF09\u3002" },
      { id: "run_cd", level: "info", title: "RUN \u4E2D cd \u5207\u76EE\u5F55", fix: "\u7528 WORKDIR /path \u66FF\u4EE3 cd\uFF1Bcd \u53EA\u5F71\u54CD\u5F53\u524D\u5C42\u547D\u4EE4\uFF0C\u6613\u5728\u540E\u7EED\u5C42\u5931\u6548\u3002" }
    ];
    function lintDockerfile(text) {
      const findings = [];
      const { instructions, lines } = parseDockerfile(text);
      const stages = splitStages(instructions);
      const lastStage = stages.length ? stages[stages.length - 1] : null;
      let cmdCount = 0;
      let epCount = 0;
      let hasUser = false;
      let hasHealthcheck = false;
      let hasExpose = false;
      let exposeLine = 0;
      let seenAbsWorkdir = false;
      let seenWorkdir = false;
      const stageScoped = lastStage ? lastStage.instructions : [];
      for (const inst of instructions) {
        const L = inst.start;
        const t = inst.text;
        const tl = t.toLowerCase();
        if (inst.name === "FROM") {
          let arg = t.replace(/--platform=\S+\s*/i, "").trim();
          const imgPart = arg.split(/\s+/)[0] || "";
          const img = imgPart.toLowerCase();
          if (img && img !== "scratch") {
            if (!img.includes(":") && !img.includes("@")) {
              findings.push(mk("from_unpinned", SEV.WARN, L, `\u57FA\u7840\u955C\u50CF\u672A\u9489\u7248\u672C\uFF1AFROM ${imgPart} \u6CA1\u6709\u663E\u5F0F tag\uFF08latest \u7B49\u4EF7\u7269\uFF09`, `\u6539\u4E3A ${imgPart}:<\u660E\u786E tag>\uFF0C\u6216 @sha256: digest \u9501\u6B7B\u5185\u5BB9`));
            } else if (/:latest($|@)/.test(img)) {
              findings.push(mk("from_unpinned", SEV.WARN, L, `\u57FA\u7840\u955C\u50CF tag \u4E3A latest\uFF1AFROM ${imgPart} \u5185\u5BB9\u968F\u4E0A\u6E38\u6F02\u79FB`, `\u9489\u5230\u5177\u4F53\u7248\u672C tag \u6216 digest`));
            }
          }
          seenAbsWorkdir = false;
          seenWorkdir = false;
        }
        if (inst.name === "MAINTAINER") {
          findings.push(mk("maintainer_deprecated", SEV.WARN, L, "MAINTAINER \u6307\u4EE4\u5DF2\u5F03\u7528", 'LABEL org.opencontainers.image.authors="you@example.com"'));
        }
        if (inst.name === "ENV" && !t.includes("=") && t.trim()) {
          findings.push(mk("env_legacy_space", SEV.WARN, L, `ENV \u4F7F\u7528\u7A7A\u683C\u5206\u9694\u65E7\u8BED\u6CD5\uFF1AENV ${t.split(/\s+/)[0]} \u2026`, "ENV key=value\uFF08= \u53F7\u5F62\u5F0F\uFF09"));
        }
        if (inst.name === "WORKDIR") {
          seenWorkdir = true;
          const arg = t.trim();
          if (arg && !arg.startsWith("/") && !arg.includes("$")) {
            if (!seenAbsWorkdir) findings.push(mk("workdir_relative", SEV.WARN, L, `WORKDIR ${arg} \u4E3A\u76F8\u5BF9\u8DEF\u5F84\u4E14\u672C\u9636\u6BB5\u65E0\u524D\u7F6E\u7EDD\u5BF9 WORKDIR`, "\u5148\u5199 WORKDIR /app \u4E4B\u7C7B\u7684\u7EDD\u5BF9\u8DEF\u5F84"));
          } else if (arg.startsWith("/")) seenAbsWorkdir = true;
        }
        if (inst.name === "ADD") {
          const arg = t.replace(/--from=\S+\s*/i, "").trim();
          if (/https?:\/\//i.test(arg)) {
            findings.push(mk("add_remote_url", SEV.WARN, L, "ADD \u7528\u4E8E\u8FDC\u7A0B URL", "RUN curl -fsSL -o \u6587\u4EF6 && echo \u6821\u9A8C\u548C | sha256sum -c -"));
          } else if (!/\.tar($|\.)/i.test(arg.split(/\s+/)[0] || "")) {
            findings.push(mk("add_instead_of_copy", SEV.INFO, L, `ADD ${arg.split(/\s+/)[0]}\uFF1A\u672C\u5730\u8DEF\u5F84\u4E0D\u9700\u8981\u81EA\u52A8\u89E3\u5305\u65F6\u7EDF\u4E00\u7528 COPY`, "COPY src dest"));
          }
        }
        if (inst.name === "COPY" || inst.name === "ADD") {
          const arg = t.replace(/--from=\S+\s*/i, "").trim();
          const parts = arg.split(/\s+/).filter((p) => p && !p.startsWith("--"));
          if (parts.length >= 2 && parts.slice(0, -1).some((p) => p === "." || p === "./")) {
            findings.push(mk("copy_broad_dot", SEV.INFO, L, `${inst.name} . . \u5168\u91CF\u590D\u5236\u6784\u5EFA\u4E0A\u4E0B\u6587`, "\u8865\u4E00\u4E2A .dockerignore\uFF08\u81F3\u5C11\u6392\u9664 .git\u3001node_modules\u3001*.env\uFF09\uFF0C\u6216\u53EA COPY \u9700\u8981\u7684\u5B50\u76EE\u5F55"));
          }
        }
        if (inst.name === "RUN") {
          if (/\bapt-get\s+(dist-)?upgrade\b|\bapt\s+(dist-)?upgrade\b|\bapt-get\s+dist-upgrade\b/.test(tl)) {
            findings.push(mk("apt_get_upgrade", SEV.WARN, L, "RUN \u4E2D\u6267\u884C apt-get upgrade/dist-upgrade", "\u5220\u9664\u8BE5\u8BED\u53E5\uFF1B\u9700\u8981\u65B0\u7248\u672C\u5305\u65F6\u663E\u5F0F apt-get install pkg=\u7248\u672C"));
          }
          const aptInstall = /\bapt-get\s+install\b|\bapt\s+install\b/.test(tl);
          const aptUpdate = /\bapt-get\s+update\b|\bapt\s+update\b/.test(tl);
          if (aptInstall && !/--no-install-recommends/.test(tl)) {
            findings.push(mk("apt_no_recommends", SEV.WARN, L, "apt-get install \u672A\u52A0 --no-install-recommends", "apt-get install -y --no-install-recommends \u2026"));
          }
          if (aptUpdate && !/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(tl)) {
            findings.push(mk("apt_no_cache_cleanup", SEV.WARN, L, "apt-get update \u540E\u672A\u6E05\u7406 lists \u7F13\u5B58", "\u540C\u6761 RUN \u7ED3\u5C3E\u63A5 && rm -rf /var/lib/apt/lists/*"));
          }
          if (aptInstall && aptInstallUnpinned(tl)) {
            findings.push(mk("apt_version_unpinned", SEV.INFO, L, "apt \u5B89\u88C5\u7684\u5305\u672A\u9489\u7248\u672C\uFF08pkg=1.2.3\uFF09", "\u9489\u7248\u672C\u4FDD\u8BC1\u53EF\u590D\u73B0\uFF1B\u6216\u63A5\u53D7 Debian \u70B9\u7248\u672C\u7531\u57FA\u7840\u955C\u50CF\u7EDF\u4E00\u7BA1\u7406"));
          }
          if (/\bapk\s+add\b/.test(tl) && !/--no-cache/.test(tl)) {
            findings.push(mk("apk_no_cache", SEV.WARN, L, "apk add \u672A\u52A0 --no-cache", "apk add --no-cache \u2026"));
          }
          if (findSudoUsage(tl)) {
            findings.push(mk("sudo_used", SEV.WARN, L, "RUN \u4E2D\u4F7F\u7528 sudo\uFF08\u5BB9\u5668\u5185\u5DF2\u662F root\uFF09", "\u53BB\u6389 sudo \u76F4\u63A5\u6267\u884C"));
          }
          if (hasPipeToShell(tl)) {
            findings.push(mk("curl_pipe_sh", SEV.WARN, L, "curl/wget \u8F93\u51FA\u7ECF\u7BA1\u9053\u76F4\u63A5\u4EA4\u7ED9 sh \u6267\u884C", "\u4E0B\u8F7D\u540E\u6821\u9A8C checksum/\u7B7E\u540D\uFF0C\u518D\u5355\u72EC\u6267\u884C\u811A\u672C"));
          }
          if (/(^|\s|&&|\|\||;)\s*cd\s+[^\s;|&]+\s*(&&|\s|$)/.test(tl)) {
            findings.push(mk("run_cd", SEV.INFO, L, "RUN \u4E2D\u7528 cd \u5207\u6362\u76EE\u5F55", "\u6539\u7528 WORKDIR /path\uFF08\u5BF9\u540E\u7EED\u5C42\u6301\u7EED\u751F\u6548\uFF09"));
          }
        }
        if (inst.name === "USER") hasUser = true;
        if (inst.name === "HEALTHCHECK") hasHealthcheck = true;
        if (inst.name === "EXPOSE") {
          hasExpose = true;
          exposeLine = L;
        }
      }
      for (const inst of stageScoped) {
        if (inst.name === "CMD") {
          cmdCount++;
          if (cmdCount > 1) findings.push(mk("multiple_cmd", SEV.ERROR, inst.start, `\u672B\u9636\u6BB5\u51FA\u73B0\u7B2C ${cmdCount} \u4E2A CMD\uFF08\u53EA\u6709\u6700\u540E\u4E00\u4E2A\u751F\u6548\uFF09`, "\u5220\u9664\u591A\u4F59 CMD \u6216\u5408\u5E76\u4E3A\u4E00\u6761"));
          else if (!inst.text.trim().startsWith("[") && inst.text.trim()) {
            findings.push(mk("json_form_prefer", SEV.INFO, inst.start, "CMD \u4E3A shell \u5F62\u5F0F\uFF08\u7ECF /bin/sh -c \u5305\u88C5\uFF0C\u6536\u4E0D\u5230 SIGTERM\uFF09", 'CMD ["executable","arg1"] exec \u5F62\u5F0F'));
          }
        }
        if (inst.name === "ENTRYPOINT") {
          epCount++;
          if (epCount > 1) findings.push(mk("multiple_entrypoint", SEV.ERROR, inst.start, `\u672B\u9636\u6BB5\u51FA\u73B0\u7B2C ${epCount} \u4E2A ENTRYPOINT\uFF08\u53EA\u6709\u6700\u540E\u4E00\u4E2A\u751F\u6548\uFF09`, "\u5220\u9664\u591A\u4F59 ENTRYPOINT"));
          else if (!inst.text.trim().startsWith("[") && inst.text.trim()) {
            findings.push(mk("json_form_prefer", SEV.INFO, inst.start, "ENTRYPOINT \u4E3A shell \u5F62\u5F0F\uFF08PID 1 \u8BED\u4E49\u95EE\u9898\uFF09", 'ENTRYPOINT ["executable","arg1"] exec \u5F62\u5F0F'));
          }
        }
        if (inst.name === "WORKDIR") {
        }
      }
      const lastStageFromLine = lastStage && lastStage.from ? lastStage.from.start : 1;
      if (!hasUser && stageScoped.some((s) => s.name === "FROM" || s.name)) {
        findings.push(mk("no_user", SEV.INFO, lastStageFromLine, "\u8FD0\u884C\u65F6\u9636\u6BB5\u672A\u58F0\u660E USER\uFF08\u9ED8\u8BA4\u4EE5 root \u8FD0\u884C\uFF09", "\u521B\u5EFA\u666E\u901A\u7528\u6237\u5E76\u5728\u672B\u9636\u6BB5\u58F0\u660E USER"));
      }
      if (hasExpose && !hasHealthcheck) {
        findings.push(mk("no_healthcheck", SEV.INFO, exposeLine, "\u58F0\u660E\u4E86 EXPOSE \u4F46\u6CA1\u6709 HEALTHCHECK", "HEALTHCHECK CMD curl -fsS http://localhost:PORT/health || exit 1\uFF08\u53EF\u9009\u5B9E\u8DF5\uFF09"));
      }
      findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
      const score = scoreOf(findings);
      return {
        kind: "dockerfile",
        findings,
        stats: { lines, instructions: instructions.length, stages: stages.length, rules: DOCKER_RULES.length, error: countSev(findings, "error"), warn: countSev(findings, "warn"), info: countSev(findings, "info") },
        score,
        grade: gradeOf(score)
      };
    }
    var WF_EVENTS = /* @__PURE__ */ new Set([
      "branch_protection_rule",
      "check_run",
      "check_suite",
      "create",
      "delete",
      "deployment",
      "deployment_status",
      "discussion",
      "discussion_comment",
      "fork",
      "gollum",
      "issue_comment",
      "issues",
      "label",
      "merge_group",
      "milestone",
      "page_build",
      "project",
      "project_card",
      "project_column",
      "public",
      "pull_request",
      "pull_request_review",
      "pull_request_review_comment",
      "pull_request_target",
      "push",
      "registry_package",
      "release",
      "repository_dispatch",
      "schedule",
      "status",
      "watch",
      "workflow_call",
      "workflow_dispatch",
      "workflow_run"
    ]);
    var WF_TOP_KEYS = /* @__PURE__ */ new Set(["name", "run-name", "on", "true", "permissions", "env", "defaults", "concurrency", "jobs"]);
    var WF_PERMISSION_SCOPES = /* @__PURE__ */ new Set([
      "actions",
      "attestations",
      "checks",
      "contents",
      "deployments",
      "discussions",
      "id-token",
      "issues",
      "models",
      "packages",
      "pages",
      "pull-requests",
      "repository-projects",
      "security-events"
    ]);
    var RUNNER_KNOWN = [
      "ubuntu-latest",
      "ubuntu-24.04",
      "ubuntu-22.04",
      "ubuntu-20.04",
      "ubuntu-18.04",
      "windows-latest",
      "windows-2025",
      "windows-2022",
      "windows-2019",
      "macos-latest",
      "macos-15",
      "macos-14",
      "macos-13",
      "macos-12",
      "self-hosted"
    ];
    var WORKFLOW_RULES = [
      { id: "wf_yaml_syntax", level: "error", title: "YAML \u8BED\u6CD5\u9519\u8BEF", fix: "\u5148\u8BA9 YAML \u80FD\u89E3\u6790\uFF1B\u5E38\u89C1\u5751\uFF1ATab \u7F29\u8FDB\u3001\u5192\u53F7\u540E\u6CA1\u7A7A\u683C\u3001\u4E2D\u6587\u5F15\u53F7\u3001\u672A\u52A0\u5F15\u53F7\u7684 * \u6216 { \u5F00\u5934\u503C\u3002" },
      { id: "wf_unknown_top_key", level: "warn", title: "\u9876\u5C42\u51FA\u73B0\u672A\u77E5\u952E", fix: "\u68C0\u67E5\u62FC\u5199\uFF08\u5982 job\u2194jobs\u3001envs\u2194env\uFF09\uFF1B\u672A\u77E5\u9876\u5C42\u952E\u4F1A\u88AB GitHub \u9759\u9ED8\u5FFD\u7565\u3002" },
      { id: "wf_unknown_event", level: "warn", title: "\u672A\u77E5\u89E6\u53D1\u4E8B\u4EF6\u540D", fix: "\u5BF9\u7167\u5B98\u65B9\u4E8B\u4EF6\u6E05\u5355\u4FEE\u6B63\u62FC\u5199\uFF08\u5982 pul_request\u2194pull_request\uFF09\uFF1B\u9519\u8BEF\u4E8B\u4EF6\u540D\u7B49\u4E8E\u5DE5\u4F5C\u6D41\u6C38\u4E0D\u89E6\u53D1\u3002" },
      { id: "wf_cron_invalid", level: "warn", title: "schedule.cron \u8868\u8FBE\u5F0F\u65E0\u6548", fix: "5 \u6BB5 cron\uFF08\u5206 \u65F6 \u65E5 \u6708 \u661F\u671F\uFF09\uFF1BUTC \u65F6\u95F4\uFF1B\u65E5\u4E0E\u661F\u671F\u540C\u65F6\u53D7\u9650\u65F6\u662F OR \u8BED\u4E49\u3002" },
      { id: "wf_input_type", level: "warn", title: "workflow_dispatch \u8F93\u5165\u7C7B\u578B\u672A\u77E5", fix: "\u5408\u6CD5\u7C7B\u578B\uFF1Astring / boolean / number / choice / environment\u3002" },
      { id: "wf_choice_no_options", level: "warn", title: "choice \u8F93\u5165\u7F3A options", fix: "choice \u7C7B\u578B\u5FC5\u987B\u63D0\u4F9B\u975E\u7A7A options \u6570\u7EC4\uFF0C\u5426\u5219\u8FD0\u884C\u9762\u677F\u65E0\u53EF\u9009\u9879\u3002" },
      { id: "wf_permissions_value", level: "warn", title: "permissions \u53D6\u503C\u65E0\u6548", fix: "\u9876\u5C42\u7528 read-all/write-all\uFF1Bscope \u7EA7\u7528 read/write/none\uFF1Bscope \u540D\u5355\u89C1\u5B98\u65B9\u6587\u6863\uFF08contents/issues/pull-requests \u7B49\uFF09\u3002" },
      { id: "wf_no_jobs", level: "error", title: "\u7F3A\u5C11 jobs \u5B9A\u4E49", fix: "jobs: \u4E0B\u81F3\u5C11\u5B9A\u4E49\u4E00\u4E2A job\u3002" },
      { id: "wf_job_id_format", level: "warn", title: "job id \u4E0D\u7B26\u5408\u547D\u540D\u89C4\u8303", fix: "job id \u53EA\u80FD\u542B\u5B57\u6BCD\u6570\u5B57 - _ \u4E14\u4E0D\u4EE5\u6570\u5B57\u5F00\u5934\uFF1B\u4F5C\u4E3A needs/\u8868\u8FBE\u5F0F\u5F15\u7528\u952E\u5FC5\u987B\u5408\u6CD5\u3002" },
      { id: "wf_missing_runs_on", level: "error", title: "job \u7F3A runs-on", fix: "\u4E3A\u6BCF\u4E2A\u666E\u901A job \u6307\u5B9A runs-on\uFF08\u5982 ubuntu-latest\uFF09\uFF1B\u53EF\u590D\u7528 job\uFF08job \u7EA7 uses:\uFF09\u9664\u5916\u3002" },
      { id: "wf_runner_label", level: "warn", title: "runs-on \u6807\u7B7E\u7591\u4F3C\u62FC\u5199\u9519\u8BEF", fix: "\u5BF9\u7167\u5B98\u65B9\u6807\u7B7E\uFF08ubuntu-latest/ubuntu-22.04/windows-latest/macos-14\u2026\uFF09\uFF1B\u81EA\u5B9A\u4E49\u6807\u7B7E\u8BF7\u786E\u8BA4\u662F\u81EA\u6258\u7BA1\u6C60\u3002" },
      { id: "wf_needs_unknown", level: "error", title: "needs \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684 job", fix: "\u4FEE\u6B63 job id\uFF1Bneeds \u53EA\u80FD\u5F15\u7528\u540C\u4E00 workflow \u5185\u7684 job\u3002" },
      { id: "wf_needs_cycle", level: "error", title: "needs \u4F9D\u8D56\u6210\u73AF", fix: "\u6253\u7834\u5FAA\u73AF\uFF1A\u5DE5\u4F5C\u6D41\u662F DAG\uFF0C\u5FAA\u73AF\u4F9D\u8D56\u4F1A\u5728\u542F\u52A8\u65F6\u6574\u4F53\u62A5\u9519\u3002" },
      { id: "wf_missing_steps", level: "warn", title: "job \u7F3A steps", fix: "\u666E\u901A job \u5FC5\u987B\u6709 steps \u6570\u7EC4\uFF08\u6216\u6574\u4F53\u6539\u4E3A job \u7EA7 uses: \u590D\u7528\uFF09\u3002" },
      { id: "wf_no_timeout", level: "info", title: "job \u672A\u8BBE timeout-minutes", fix: "\u9ED8\u8BA4 360 \u5206\u949F\uFF1B\u5361\u6B7B\u4EFB\u52A1\u4F1A\u70E7\u6EE1 6 \u5C0F\u65F6\u8BA1\u8D39\u989D\u5EA6\u3002\u5EFA\u8BAE\u6309\u7ECF\u9A8C\u503C\u663E\u5F0F\u8BBE\u7F6E\uFF08\u5982 timeout-minutes: 15\uFF09\u3002" },
      { id: "wf_uses_malformed", level: "warn", title: "uses \u5F15\u7528\u683C\u5F0F\u9519\u8BEF", fix: "\u5916\u90E8 action\uFF1Aowner/repo@ref\uFF08\u6216 owner/repo/path@ref\uFF09\uFF1B\u672C\u5730 action\uFF1A./path\uFF08\u5FC5\u987B\u4EE5 ./ \u5F00\u5934\uFF09\u3002" },
      { id: "wf_uses_unpinned", level: "info", title: "action \u672A\u951A\u5B9A commit SHA", fix: "\u5916\u90E8 action \u7528\u5B8C\u6574 40 \u4F4D SHA \u951A\u5B9A\uFF08tag \u53EF\u53D8\u3001SHA \u4E0D\u53EF\u53D8\uFF09\uFF0C\u9632\u4F9B\u5E94\u94FE\u6295\u6BD2\uFF1B\u53EF\u7528 Dependabot \u81EA\u52A8\u8DDF\u8FDB\u66F4\u65B0\u3002" },
      { id: "wf_expr_unclosed", level: "error", title: "${{ }} \u8868\u8FBE\u5F0F\u672A\u95ED\u5408", fix: "\u8865\u9F50 }}\uFF1B\u8868\u8FBE\u5F0F\u89E3\u6790\u5931\u8D25\u4F1A\u8BA9\u6B65\u9AA4\u542F\u52A8\u5373\u5931\u8D25\u3002" },
      { id: "wf_secrets_case", level: "error", title: "secrets.github_token \u5C0F\u5199\u5F15\u7528\u4E0D\u5B58\u5728", fix: "\u81EA\u52A8 token \u662F secrets.GITHUB_TOKEN\uFF08\u5168\u5927\u5199\uFF0C\u5927\u5C0F\u5199\u654F\u611F\uFF09\uFF1B\u81EA\u5B9A\u4E49 secret \u540C\u7406\u5FC5\u987B\u5927\u5C0F\u5199\u5B8C\u5168\u4E00\u81F4\u3002" },
      { id: "wf_step_ref_unknown", level: "error", title: "steps.<id> \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u6B65\u9AA4 id", fix: "\u68C0\u67E5\u76EE\u6807\u6B65\u9AA4\u662F\u5426\u5199\u4E86 id:\uFF1B\u8868\u8FBE\u5F0F\u5F15\u7528\u7684 id \u533A\u5206\u5927\u5C0F\u5199\u3002" },
      { id: "wf_output_step_missing", level: "error", title: "outputs \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u6B65\u9AA4 id", fix: "job outputs \u6620\u5C04\u6307\u5411\u7684 steps.<id>.outputs.<k> \u8981\u6C42\u8BE5\u6B65\u9AA4\u786E\u5B9E\u58F0\u660E\u4E86 id\u3002" },
      { id: "wf_needs_output_unknown", level: "error", title: "needs.<job>.outputs.<k> \u5F15\u7528\u4E86\u672A\u58F0\u660E\u7684\u8F93\u51FA", fix: "\u88AB\u4F9D\u8D56 job \u7684 outputs: \u6620\u5C04\u4E2D\u5FC5\u987B\u663E\u5F0F\u58F0\u660E\u8BE5\u952E\uFF0C\u5426\u5219\u53D6\u5230\u7A7A\u4E32\u3002" },
      { id: "wf_needs_ref_unknown", level: "error", title: "\u8868\u8FBE\u5F0F\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684 needs job", fix: "\u68C0\u67E5 needs.<id> \u4E2D\u7684 id \u662F\u5426\u5728 needs \u5217\u8868\u4E0E jobs \u5B9A\u4E49\u4E2D\u4E00\u81F4\u3002" },
      { id: "wf_pr_target_untrusted", level: "error", title: "pull_request_target + \u68C0\u51FA PR head \u4EE3\u7801\uFF08\u5371\u9669\u7EC4\u5408\uFF09", fix: "pull_request_target \u4EE5 base \u5206\u652F\u6743\u9650\u8FD0\u884C\u5916\u90E8 PR \u89E6\u53D1\uFF1B\u68C0\u51FA\u5E76\u6267\u884C PR head \u4EE3\u7801\u7B49\u4E8E\u628A\u4ED3\u5E93 secrets \u4EA4\u7ED9\u4E0D\u53EF\u4FE1\u4EE3\u7801\u3002\u6539\u7528 pull_request\uFF0C\u6216\u628A\u4E0D\u53EF\u4FE1\u4EE3\u7801\u9694\u79BB\u5728\u65E0 secrets \u7684 job\u3002" },
      { id: "wf_pr_target", level: "warn", title: "\u4F7F\u7528 pull_request_target \u89E6\u53D1", fix: "\u786E\u8BA4\u5DE5\u4F5C\u6D41\u4E0D\u68C0\u51FA/\u4E0D\u6267\u884C PR \u4F5C\u8005\u53EF\u63A7\u4EE3\u7801\uFF1B\u53EA\u9700\u8DD1\u81EA\u5BB6\u4EE3\u7801\u65F6\u7528 pull_request \u66F4\u5B89\u5168\u3002" },
      { id: "wf_redundant_if", level: "info", title: "if: ${{ success() }} \u662F\u5197\u4F59\u6761\u4EF6", fix: "\u6B65\u9AA4\u9ED8\u8BA4\u4EC5\u5728\u4E4B\u524D\u6B65\u9AA4\u6210\u529F\u65F6\u8FD0\u884C\uFF0C\u76F4\u63A5\u7701\u7565 if\u3002" }
    ];
    function countSev(findings, sev) {
      return findings.filter((f) => f.level === sev).length;
    }
    function scoreOf(findings) {
      let s = 10;
      for (const f of findings) s -= DEDUCT[f.level] || 0;
      return round1(Math.max(0, s));
    }
    function gradeOf(score) {
      if (score >= 9) return "\u4F18";
      if (score >= 7.5) return "\u826F";
      if (score >= 5) return "\u4E2D";
      return "\u9700\u6574\u6539";
    }
    function mapJobIdLines(lines) {
      const jobsStart = lines.findIndex((l) => /^\s*jobs\s*:/.test(l));
      if (jobsStart === -1) return /* @__PURE__ */ new Map();
      const map2 = /* @__PURE__ */ new Map();
      for (let i = jobsStart + 1; i < lines.length; i++) {
        const m = /^  ([^\s#][^:]*):\s*(?:#.*)?$/.exec(lines[i]);
        if (!m) continue;
        if (!map2.has(m[1])) map2.set(m[1].trim(), i + 1);
      }
      return map2;
    }
    function lineOfPattern(lines, re) {
      for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
      return null;
    }
    function collectExprRefs(node, out) {
      if (typeof node === "string") {
        for (const m of node.matchAll(/\bsteps\.([A-Za-z0-9_-]+)\s*\./g)) out.stepRefs.add(m[1]);
        for (const m of node.matchAll(/\bneeds\.([A-Za-z0-9_-]+)\s*\.\s*outputs\s*\.\s*([A-Za-z0-9_-]+)/g)) out.needsOutputRefs.push([m[1], m[2]]);
        for (const m of node.matchAll(/\bneeds\.([A-Za-z0-9_-]+)\b/g)) out.needsRefs.add(m[1]);
        return;
      }
      if (Array.isArray(node)) {
        for (const x of node) collectExprRefs(x, out);
        return;
      }
      if (node && typeof node === "object") {
        for (const k of Object.keys(node)) collectExprRefs(node[k], out);
      }
    }
    function lintWorkflow(text, doc, yamlError) {
      const findings = [];
      const lines = text.split(/\r?\n/);
      const lineOf = (re) => lineOfPattern(lines, re);
      const jobLines = mapJobIdLines(lines);
      const jobsLine = lineOf(/^\s*jobs\s*:/);
      const onLine = lineOf(/^\s*on\s*:/) || lineOf(/^\s*true\s*:/) || 1;
      let sawCheckoutHead = false;
      let checkoutHeadLine = 0;
      let sawPrTargetInDoc = false;
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (trimmed.startsWith("#")) continue;
        const um = /\buses:\s*(['"]?)([^'"\s]+)\1/.exec(raw);
        if (um) {
          const ref = um[2];
          const L = i + 1;
          if (!ref.startsWith("docker://")) {
            if (ref.startsWith("./") || ref.startsWith(".\\")) {
            } else if (!ref.includes("@")) {
              findings.push(mk("wf_uses_malformed", SEV.WARN, L, `uses: ${ref} \u7F3A\u5C11 @ref`, "\u5916\u90E8 action \u5199 owner/repo@vN \u6216 owner/repo@SHA"));
            } else {
              const at = ref.indexOf("@");
              const rev = ref.slice(at + 1);
              if (!/^[0-9a-f]{40}$/i.test(rev)) {
                findings.push(mk("wf_uses_unpinned", SEV.INFO, L, `action \u672A\u951A\u5B9A SHA\uFF1A${ref.split("@")[0]}@${rev}`, "\u951A\u5B9A\u5B8C\u6574 40 \u4F4D commit SHA\uFF08Dependabot \u53EF\u81EA\u52A8\u8DDF\u8FDB tag \u66F4\u65B0\uFF09"));
              }
            }
          }
        }
        if (/\bsecrets\.github_token\b/.test(raw)) {
          findings.push(mk("wf_secrets_case", SEV.ERROR, i + 1, "\u5F15\u7528\u4E86 secrets.github_token\uFF08\u4E0D\u5B58\u5728\uFF09", "\u81EA\u52A8 token \u662F secrets.GITHUB_TOKEN\uFF1B\u5927\u5C0F\u5199\u5FC5\u987B\u5B8C\u5168\u4E00\u81F4"));
        }
        if (/github\.event\.pull_request\.head/.test(raw)) {
          if (!sawCheckoutHead) {
            sawCheckoutHead = true;
            checkoutHeadLine = i + 1;
          }
        }
        if (/^\s*if:\s*\$\{\{\s*success\(\)\s*\}\}\s*$/.test(trimmed)) {
          findings.push(mk("wf_redundant_if", SEV.INFO, i + 1, "if: ${{ success() }} \u4E0E\u9ED8\u8BA4\u884C\u4E3A\u7B49\u4EF7", "\u76F4\u63A5\u5220\u9664\u8BE5 if"));
        }
      }
      {
        const tokenRe = /\$\{\{|\}\}/g;
        const stack = [];
        for (let i = 0; i < lines.length; i++) {
          tokenRe.lastIndex = 0;
          let m;
          while ((m = tokenRe.exec(lines[i])) !== null) {
            if (m[0] === "${{") stack.push(i + 1);
            else stack.pop();
          }
        }
        const seenLines = /* @__PURE__ */ new Set();
        for (const ln of stack) {
          if (!seenLines.has(ln)) {
            seenLines.add(ln);
            findings.push(mk("wf_expr_unclosed", SEV.ERROR, ln, "\u8BE5\u884C\u7684 ${{ \u8868\u8FBE\u5F0F\u6CA1\u6709\u95ED\u5408 }}", "\u8865\u9F50 }}\uFF08\u8DE8\u884C\u4E66\u5199\u4E5F\u5141\u8BB8\uFF0C\u4F46\u5FC5\u987B\u95ED\u5408\uFF09"));
          }
        }
      }
      if (yamlError) {
        findings.push(mk("wf_yaml_syntax", SEV.ERROR, yamlError.line || null, `YAML \u89E3\u6790\u5931\u8D25\uFF1A${yamlError.message}`, WORKFLOW_RULES.find((r) => r.id === "wf_yaml_syntax").fix));
      } else if (doc && typeof doc === "object") {
        for (const key of Object.keys(doc)) {
          if (!WF_TOP_KEYS.has(key)) {
            findings.push(mk("wf_unknown_top_key", SEV.WARN, lineOf(new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`)) || 1, `\u9876\u5C42\u952E\u300C${key}\u300D\u4E0D\u662F\u5408\u6CD5 workflow \u952E`, "\u68C0\u67E5\u62FC\u5199\uFF1B\u5408\u6CD5\u9876\u5C42\u952E\uFF1Aname/on/permissions/env/defaults/concurrency/jobs"));
          }
        }
        const triggers = doc.on !== void 0 ? doc.on : doc.true;
        let events = [];
        if (typeof triggers === "string") events = [triggers];
        else if (Array.isArray(triggers)) events = triggers;
        else if (triggers && typeof triggers === "object") events = Object.keys(triggers);
        for (const ev of events) {
          if (!WF_EVENTS.has(ev)) {
            findings.push(mk("wf_unknown_event", SEV.WARN, onLine, `\u672A\u77E5\u89E6\u53D1\u4E8B\u4EF6\u300C${ev}\u300D`, "\u5BF9\u7167\u5B98\u65B9\u4E8B\u4EF6\u6E05\u5355\u4FEE\u6B63\uFF08pull_request / push / workflow_dispatch / schedule \u2026\uFF09"));
          }
          if (ev === "pull_request_target") sawPrTargetInDoc = true;
        }
        if (triggers && typeof triggers === "object" && triggers.schedule) {
          const items = Array.isArray(triggers.schedule) ? triggers.schedule : [triggers.schedule];
          for (const item of items) {
            const cron = item && item.cron;
            const v = validateCron(cron);
            if (!v.ok) {
              findings.push(mk("wf_cron_invalid", SEV.WARN, onLine, `schedule.cron\u300C${String(cron)}\u300D\u65E0\u6548\uFF1A${v.detail}`, "5 \u6BB5 cron\uFF1B\u6CE8\u610F UTC \u65F6\u533A\u4E0E\u65E5/\u661F\u671F\u7684 OR \u8BED\u4E49"));
            }
          }
        }
        const wd = triggers && typeof triggers === "object" ? triggers.workflow_dispatch : null;
        if (wd && typeof wd === "object" && wd.inputs && typeof wd.inputs === "object") {
          for (const [name, spec] of Object.entries(wd.inputs)) {
            if (!spec || typeof spec !== "object") continue;
            const type2 = spec.type;
            if (type2 !== void 0 && !["string", "boolean", "number", "choice", "environment"].includes(type2)) {
              findings.push(mk("wf_input_type", SEV.WARN, onLine, `\u8F93\u5165\u300C${name}\u300D\u7C7B\u578B\u300C${String(type2)}\u300D\u4E0D\u5408\u6CD5`, "string / boolean / number / choice / environment"));
            }
            if (type2 === "choice") {
              const opts = spec.options;
              if (!Array.isArray(opts) || opts.length === 0) {
                findings.push(mk("wf_choice_no_options", SEV.WARN, onLine, `choice \u8F93\u5165\u300C${name}\u300D\u7F3A\u5C11 options`, "\u8865\u975E\u7A7A options \u6570\u7EC4"));
              }
            }
          }
        }
        const checkPerms = (perms, L, where) => {
          if (typeof perms === "string") {
            if (!["read-all", "write-all"].includes(perms)) {
              findings.push(mk("wf_permissions_value", SEV.WARN, L, `${where} permissions\u300C${perms}\u300D\u4E0D\u5408\u6CD5`, "\u9876\u5C42\u6574\u4F53\u6388\u6743\u7528 read-all / write-all"));
            }
            return;
          }
          if (perms && typeof perms === "object") {
            for (const [scope, val] of Object.entries(perms)) {
              if (!WF_PERMISSION_SCOPES.has(scope) || !["read", "write", "none"].includes(val)) {
                findings.push(mk("wf_permissions_value", SEV.WARN, L, `${where} permissions\u300C${scope}: ${String(val)}\u300D\u4E0D\u5408\u6CD5`, "scope \u89C1\u5B98\u65B9\u540D\u5355\uFF1B\u503C\u4E3A read/write/none"));
              }
            }
          }
        };
        if (doc.permissions !== void 0) checkPerms(doc.permissions, lineOf(/^\s*permissions\s*:/) || 1, "\u9876\u5C42");
        const hasTopPerms = doc.permissions !== void 0;
        const jobs = doc.jobs;
        if (!jobs || typeof jobs !== "object" || Array.isArray(jobs) || Object.keys(jobs).length === 0) {
          findings.push(mk("wf_no_jobs", SEV.ERROR, jobsLine || 1, "\u7F3A\u5C11 jobs \u5B9A\u4E49\uFF08\u6216\u4E3A\u7A7A\uFF09", "jobs: \u4E0B\u81F3\u5C11\u5B9A\u4E49\u4E00\u4E2A job"));
        } else {
          const jobIds = Object.keys(jobs);
          const graph = /* @__PURE__ */ new Map();
          for (const id of jobIds) {
            const job = jobs[id];
            if (!job || typeof job !== "object") continue;
            const L = jobLines.get(id) || jobsLine || 1;
            if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) {
              findings.push(mk("wf_job_id_format", SEV.WARN, L, `job id\u300C${id}\u300D\u4E0D\u7B26\u5408\u547D\u540D\u89C4\u8303`, "\u4EC5\u5B57\u6BCD\u6570\u5B57 - _ \u4E14\u4E0D\u4EE5\u6570\u5B57\u5F00\u5934"));
            }
            const needs = job.needs === void 0 ? [] : Array.isArray(job.needs) ? job.needs : [job.needs];
            graph.set(id, needs.filter((n) => typeof n === "string"));
            for (const n of needs) {
              if (n === id) {
                findings.push(mk("wf_needs_unknown", SEV.ERROR, L, `job\u300C${id}\u300Dneeds \u5F15\u7528\u4E86\u81EA\u8EAB`, "\u4F9D\u8D56\u56FE\u4E0D\u80FD\u81EA\u73AF"));
              } else if (!jobIds.includes(n)) {
                findings.push(mk("wf_needs_unknown", SEV.ERROR, L, `job\u300C${id}\u300Dneeds \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684 job\u300C${n}\u300D`, `\u5B9E\u9645\u5B58\u5728\u7684 job\uFF1A${jobIds.join("\u3001")}`));
              }
            }
            const isCall = typeof job.uses === "string";
            if (!isCall) {
              if (job["runs-on"] === void 0) {
                findings.push(mk("wf_missing_runs_on", SEV.ERROR, L, `job\u300C${id}\u300D\u7F3A\u5C11 runs-on`, "runs-on: ubuntu-latest\uFF08\u53EF\u590D\u7528 job \u9664\u5916\uFF09"));
              } else {
                const labels = Array.isArray(job["runs-on"]) ? job["runs-on"] : [job["runs-on"]];
                for (const lb of labels) {
                  if (typeof lb !== "string" || lb.includes("${{")) continue;
                  if (RUNNER_KNOWN.includes(lb)) continue;
                  const near = RUNNER_KNOWN.map((k) => [k, levenshtein(lb, k)]).sort((a, b) => a[1] - b[1])[0];
                  if (near[1] <= 2) {
                    findings.push(mk("wf_runner_label", SEV.WARN, L, `runs-on\u300C${lb}\u300D\u4E0D\u662F\u5B98\u65B9\u6807\u7B7E\uFF0C\u7591\u4F3C\u300C${near[0]}\u300D\u62FC\u5199\u9519\u8BEF`, `\u6539\u4E3A ${near[0]}`));
                  } else if (/^(ubuntu|windows|macos)-\d{2}(\.\d+)?$/.test(lb)) {
                    findings.push(mk("wf_runner_label", SEV.WARN, L, `runs-on\u300C${lb}\u300D\u4E0D\u662F\u5B98\u65B9\u6258\u7BA1\u7684\u7248\u672C\u6807\u7B7E`, "\u5B98\u65B9\u6807\u7B7E\u5F62\u5982 ubuntu-22.04 / windows-2022 / macos-14\uFF1B\u81EA\u6258\u7BA1\u6807\u7B7E\u8BF7\u786E\u8BA4\u6C60\u5185\u5B58\u5728"));
                  }
                }
              }
              if (job.steps === void 0 || !Array.isArray(job.steps)) {
                findings.push(mk("wf_missing_steps", SEV.WARN, L, `job\u300C${id}\u300D\u7F3A\u5C11 steps`, "steps: \u5217\u51FA\u8981\u6267\u884C\u7684\u6B65\u9AA4\uFF1B\u6216\u6574 job \u6539\u4E3A uses: \u590D\u7528"));
              }
              if (job["timeout-minutes"] === void 0) {
                findings.push(mk("wf_no_timeout", SEV.INFO, L, `job\u300C${id}\u300D\u672A\u8BBE timeout-minutes\uFF08\u9ED8\u8BA4 360 \u5206\u949F\uFF09`, "\u6309\u7ECF\u9A8C\u503C\u663E\u5F0F\u8BBE\u7F6E\uFF0C\u907F\u514D\u5361\u6B7B\u70E7\u6EE1 6 \u5C0F\u65F6"));
              }
            }
            if (job.permissions !== void 0 && !hasTopPerms) checkPerms(job.permissions, L, `job\u300C${id}\u300D`);
            if (job.permissions !== void 0 && hasTopPerms) checkPerms(job.permissions, L, `job\u300C${id}\u300D`);
            if (job.outputs && typeof job.outputs === "object") {
              const stepIds = new Set(Array.isArray(job.steps) ? job.steps.filter((s) => s && typeof s === "object" && s.id).map((s) => String(s.id)) : []);
              for (const val of Object.values(job.outputs)) {
                if (typeof val !== "string") continue;
                for (const m of val.matchAll(/\bsteps\.([A-Za-z0-9_-]+)\s*\./g)) {
                  if (!stepIds.has(m[1])) {
                    findings.push(mk("wf_output_step_missing", SEV.ERROR, L, `outputs \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u6B65\u9AA4 id\u300Csteps.${m[1]}\u300D`, "\u7ED9\u76EE\u6807\u6B65\u9AA4\u8865 id:\uFF0C\u6216\u4FEE\u6B63\u5F15\u7528"));
                  }
                }
              }
            }
            const refs = { stepRefs: /* @__PURE__ */ new Set(), needsOutputRefs: [], needsRefs: /* @__PURE__ */ new Set() };
            collectExprRefs(job, refs);
            const stepIds2 = new Set(Array.isArray(job.steps) ? job.steps.filter((s) => s && typeof s === "object" && s.id).map((s) => String(s.id)) : []);
            for (const sid of refs.stepRefs) {
              if (sid !== "*" && !stepIds2.has(sid)) {
                findings.push(mk("wf_step_ref_unknown", SEV.ERROR, L, `job\u300C${id}\u300D\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u6B65\u9AA4 id\u300Csteps.${sid}\u300D`, "\u68C0\u67E5\u62FC\u5199/\u8865 id:"));
              }
            }
            for (const [jid, key] of refs.needsOutputRefs) {
              if (!jobIds.includes(jid)) {
                findings.push(mk("wf_needs_ref_unknown", SEV.ERROR, L, `\u8868\u8FBE\u5F0F\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684 job\u300Cneeds.${jid}\u300D`, "\u68C0\u67E5 needs \u5217\u8868\u4E0E\u5F15\u7528\u662F\u5426\u4E00\u81F4"));
              } else {
                const decl = jobs[jid] && jobs[jid].outputs;
                if (!decl || typeof decl !== "object" || !(key in decl)) {
                  findings.push(mk("wf_needs_output_unknown", SEV.ERROR, L, `needs.${jid}.outputs.${key} \u672A\u5728\u4E0A\u6E38 job \u7684 outputs: \u4E2D\u58F0\u660E`, `\u4E0A\u6E38 job\u300C${jid}\u300D\u9700\u663E\u5F0F outputs: { ${key}: \${{ steps.<id>.outputs.<k> }} }`));
                }
              }
            }
            for (const jid of refs.needsRefs) {
              if (!jobIds.includes(jid)) {
                findings.push(mk("wf_needs_ref_unknown", SEV.ERROR, L, `\u8868\u8FBE\u5F0F\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684 job\u300Cneeds.${jid}\u300D`, "\u68C0\u67E5\u62FC\u5199\u4E0E needs \u4F9D\u8D56"));
              }
            }
          }
          const state = /* @__PURE__ */ new Map();
          const path = [];
          const dfs = (id) => {
            state.set(id, 0);
            path.push(id);
            for (const dep of graph.get(id) || []) {
              if (!graph.has(dep)) continue;
              if (state.get(dep) === 0) {
                const cyc = path.slice(path.indexOf(dep)).concat(dep).join(" \u2192 ");
                findings.push(mk("wf_needs_cycle", SEV.ERROR, jobLines.get(id) || jobsLine || 1, `needs \u4F9D\u8D56\u6210\u73AF\uFF1A${cyc}`, "\u91CD\u65B0\u7F16\u6392 job \u987A\u5E8F\uFF0C\u6253\u7834\u5FAA\u73AF"));
              } else if (!state.get(dep)) {
                dfs(dep);
              }
            }
            path.pop();
            state.set(id, 1);
          };
          for (const id of jobIds) if (!state.get(id)) dfs(id);
        }
      }
      if (sawPrTargetInDoc && sawCheckoutHead) {
        findings.push(mk("wf_pr_target_untrusted", SEV.ERROR, checkoutHeadLine, "pull_request_target \u5DE5\u4F5C\u6D41\u4E2D\u5F15\u7528\u4E86 PR head \u4EE3\u7801\uFF08github.event.pull_request.head.*\uFF09", "pull_request_target \u62E5\u6709\u4ED3\u5E93 secrets/\u5199\u6743\u9650\uFF1A\u68C0\u51FA\u5E76\u6267\u884C PR head \u4EE3\u7801 = \u4E0D\u53EF\u4FE1\u4EE3\u7801\u63D0\u6743\u3002\u6539\u7528 pull_request \u89E6\u53D1\uFF0C\u6216\u8BA9\u4E0D\u53EF\u4FE1 job \u4E0E secrets \u9694\u79BB"));
      } else if (sawPrTargetInDoc) {
        findings.push(mk("wf_pr_target", SEV.WARN, onLine, "\u5DE5\u4F5C\u6D41\u4F7F\u7528 pull_request_target \u89E6\u53D1\uFF08\u4EE5 base \u6743\u9650\u8FD0\u884C\u5916\u90E8 PR\uFF09", "\u786E\u8BA4\u672A\u68C0\u51FA/\u672A\u6267\u884C PR \u4F5C\u8005\u53EF\u63A7\u4EE3\u7801\uFF1B\u4EC5\u8DD1\u81EA\u5BB6\u4EE3\u7801\u65F6\u6539 pull_request"));
      }
      findings.sort((a, b) => (a.line || 0) - (b.line || 0) || a.rule.localeCompare(b.rule));
      const score = scoreOf(findings);
      return {
        kind: "workflow",
        findings,
        stats: { lines: lines.length, rules: WORKFLOW_RULES.length, error: countSev(findings, "error"), warn: countSev(findings, "warn"), info: countSev(findings, "info") },
        score,
        grade: gradeOf(score)
      };
    }
    function detectKind2(text) {
      const t = text || "";
      let df = 0;
      let wf = 0;
      if (/^\s*FROM\s+\S+/im.test(t)) df += 3;
      if (/^\s*RUN\s+\S+/im.test(t)) df += 1;
      if (/^\s*ENTRYPOINT\s+|^\s*CMD\s+["\[]/im.test(t)) df += 1;
      if (/^\s*COPY\s+|^\s*ADD\s+\S+/im.test(t)) df += 1;
      if (/^\s*(ENV|WORKDIR|EXPOSE|ARG)\s+\S+/im.test(t)) df += 1;
      if (/^\s*jobs\s*:/m.test(t)) wf += 3;
      if (/^\s*on\s*:\s*$/m.test(t) || /^\s*on\s*:\s*\S/m.test(t)) wf += 2;
      if (/^\s*runs-on\s*:/m.test(t)) wf += 2;
      if (/^\s*steps\s*:\s*$/m.test(t)) wf += 1;
      if (/\buses:\s*\S+@\S+/.test(t)) wf += 1;
      if (df === 0 && wf === 0) return "unknown";
      return df > wf ? "dockerfile" : wf > df ? "workflow" : "unknown";
    }
    function renderReport(r, fileLabel) {
      const s = r.stats;
      const head = fileLabel ? `**${fileLabel}**` : r.kind === "dockerfile" ? "**Dockerfile**" : "**GitHub Actions \u5DE5\u4F5C\u6D41**";
      const linesOut = [];
      linesOut.push(`### CI \u4F53\u68C0 \u2014\u2014 ${head}`);
      linesOut.push(`\u8BC4\u5206 **${r.score}/10\uFF08${r.grade}\uFF09** \xB7 error ${s.error} \xB7 warn ${s.warn} \xB7 info ${s.info}`);
      if (s.lines !== void 0) linesOut.push(`\u626B\u63CF ${s.lines} \u884C${s.instructions !== void 0 ? ` \xB7 ${s.instructions} \u6761\u6307\u4EE4 \xB7 ${s.stages} \u4E2A\u6784\u5EFA\u9636\u6BB5` : ""} \xB7 \u5185\u7F6E\u89C4\u5219 ${s.rules} \u6761`);
      if (!r.findings.length) {
        linesOut.push("\u2705 \u672A\u53D1\u73B0\u95EE\u9898\u3002");
        return linesOut.join("\n");
      }
      const groups = [["error", "\u274C error\uFF08\u4F1A\u5BFC\u81F4\u6784\u5EFA/CI \u5931\u8D25\uFF09"], ["warn", "\u26A0\uFE0F warn\uFF08\u9AD8\u5EA6\u53EF\u7591 / \u5B89\u5168\u98CE\u9669\uFF09"], ["info", "\u{1F4A1} info\uFF08\u6700\u4F73\u5B9E\u8DF5\u5EFA\u8BAE\uFF09"]];
      for (const [sev, label] of groups) {
        const items = r.findings.filter((f) => f.level === sev);
        if (!items.length) continue;
        linesOut.push("");
        linesOut.push(`**${label}**`);
        for (const f of items) {
          const ln = f.line ? `\u884C ${f.line} \xB7 ` : "";
          linesOut.push(`- \`${f.rule}\` \xB7 ${ln}${f.message}${f.fix ? `\u3000\u2192 \u4FEE\u590D\uFF1A${f.fix}` : ""}`);
        }
      }
      return linesOut.join("\n");
    }
    function ruleCatalog2(kind) {
      const render = (rules, title) => {
        const out = [`**${title}\uFF08${rules.length} \u6761\uFF09**`];
        for (const r of rules) {
          const lv = r.level === "error" ? "\u274C" : r.level === "warn" ? "\u26A0\uFE0F" : "\u{1F4A1}";
          out.push(`- ${lv} \`${r.id}\` ${r.title} \u2014\u2014 ${r.fix}`);
        }
        return out.join("\n");
      };
      if (kind === "dockerfile") return render(DOCKER_RULES, "Dockerfile \u89C4\u5219");
      if (kind === "workflow") return render(WORKFLOW_RULES, "GitHub Actions \u5DE5\u4F5C\u6D41\u89C4\u5219");
      return render(DOCKER_RULES, "Dockerfile \u89C4\u5219") + "\n\n" + render(WORKFLOW_RULES, "GitHub Actions \u5DE5\u4F5C\u6D41\u89C4\u5219");
    }
    function lint2(text, kind, deps) {
      if (kind === "dockerfile" || kind === "auto" && detectKind2(text) === "dockerfile") {
        return lintDockerfile(text);
      }
      if (kind === "workflow" || kind === "auto" && detectKind2(text) === "workflow") {
        const d = deps || {};
        let doc = null;
        let yamlError = null;
        if (typeof d.parseYaml === "function") {
          try {
            doc = d.parseYaml(text);
          } catch (e) {
            yamlError = { line: e && e.mark ? e.mark.line + 1 : null, message: e && e.message ? String(e.message).split("\n")[0] : "\u672A\u77E5 YAML \u9519\u8BEF" };
          }
        } else {
          yamlError = { line: null, message: "\u65E0 YAML \u89E3\u6790\u5668\uFF08\u4EC5\u884C\u7EA7\u626B\u63CF\uFF09" };
        }
        return lintWorkflow(text, doc, yamlError);
      }
      return null;
    }
    module.exports = {
      SEV,
      DEDUCT,
      parseDockerfile,
      lintDockerfile,
      lintWorkflow,
      detectKind: detectKind2,
      validateCron,
      levenshtein,
      scoreOf,
      gradeOf,
      renderReport,
      ruleCatalog: ruleCatalog2,
      lint: lint2,
      DOCKER_RULES,
      WORKFLOW_RULES,
      WF_EVENTS,
      RUNNER_KNOWN,
      WF_PERMISSION_SCOPES
    };
  }
});

// src/Panel.tsx
import { useMemo, useState } from "react";

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException) return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet) return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
      // relative position
    };
  }
  function padStart(string, max) {
    return common2.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type2;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type2 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  const Type2 = requireType();
  str = new Type2("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  const Type2 = requireType();
  seq = new Type2("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  const Type2 = requireType();
  map = new Type2("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  const Type2 = requireType();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  _null = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  const Type2 = requireType();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  bool = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp(
    "^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp;
  hasRequiredTimestamp = 1;
  const Type2 = requireType();
  const YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  const YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  timestamp = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  const Type2 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  const Type2 = requireType();
  const BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (_hasOwnProperty.call(objectKeys, pairKey)) return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  const Type2 = requireType();
  const _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  pairs = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader) return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) {
        for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function chargeMergeWork(state) {
    state.totalMergeKeys++;
    if (state.maxTotalMergeKeys !== -1 && state.totalMergeKeys > state.maxTotalMergeKeys) {
      throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    chargeMergeWork(state);
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      chargeMergeWork(state);
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        if (valueNode.length > 100) {
          throwError(state, "abnormal merge sequence size");
        }
        for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat("\n", emptyLines);
        }
      } else {
        state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    let _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(
            state,
            propertyStart,
            propertyStart.position - propertyStart.lineStart,
            flowIndent
          )) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper) return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  const DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null) return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && // - b-char
    c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && // - c-flow-indicator
      c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && // ns-plain-char
      c !== CHAR_SHARP && // false on '#'
      !(prev === CHAR_COLON && !cIsNsChar) || // false on ': '
      isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || // change to true on '[^ ]#'
      prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && // | “%” | “@” | “`”)
    c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    }();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    const keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    }();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length; i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

// src/Panel.tsx
var core2 = __toESM(require_ci_core());
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.cl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cl-tab{background:#161c2a;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.cl-tab.on{background:#1d3a2f;border-color:#2f9e44;color:#8ce0b0}
.cl-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.cl-btn:disabled{opacity:.5;cursor:not-allowed}
.cl-area{width:100%;min-height:200px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none;box-sizing:border-box}
.cl-area:focus{border-color:#4fd1a0}
.cl-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.cl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.cl-verdict.mid{background:#2b2413;border-color:#d19a3d;color:#f3c477}
.cl-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.cl-verdict b{font-size:14px}
.cl-score{font:600 18px/1 ui-monospace,Consolas,monospace}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.cl-tbl .ln{text-align:right;color:#8B94A9;white-space:nowrap}
.cl-lv{border-radius:4px;padding:0 6px;font-size:10.5px}
.cl-lv.error{background:#2b1215;color:#f1a0a0}
.cl-lv.warn{background:#2b2413;color:#f3b377}
.cl-lv.info{background:#1a2030;color:#8B94A9}
.cl-fix{color:#8B94A9;font-family:inherit}
.cl-rules{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font-size:12px;line-height:1.9;color:#c9cede}
.cl-rules code{color:#7fd4ff;background:#10141f;border-radius:3px;padding:0 4px;font-size:10.5px}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-empty{color:#5C6678;font-size:12px;text-align:center;padding:16px 0}
`;
var SAMPLE_DOCKERFILE = `FROM node
WORKDIR app
RUN apt-get update && apt-get install -y git curl
RUN curl -fsSL https://example.com/install.sh | sh
CMD echo hi
`;
var SAMPLE_WORKFLOW = `name: CI
on:
  pul_request:
  push:
jobs:
  build:
    needs: [test]
    runs-on: ubunty-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo \${{ steps.nope.outputs.x }} \${{ secrets.github_token }}
  test:
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
`;
function verdictClass(score) {
  if (score >= 8.5) return "ok";
  if (score >= 5) return "mid";
  return "bad";
}
function CiLensPanel(_props) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("auto");
  const [checked, setChecked] = useState(null);
  const [view, setView] = useState("report");
  const result = useMemo(() => {
    if (checked === null || !checked.text.trim()) return null;
    const r = core2.lint(checked.text, checked.kind, {
      // core 契约：parseYaml 返回 doc、失败抛错（core 统一归一为 {line,message}）
      parseYaml: (t) => load(t)
    });
    return r;
  }, [checked]);
  const detected = useMemo(() => text.trim() ? core2.detectKind(text) : "", [text]);
  const run = () => setChecked({ text, kind });
  const loadSample = (k) => {
    setText(k === "dockerfile" ? SAMPLE_DOCKERFILE : SAMPLE_WORKFLOW);
    setChecked(null);
  };
  const errCount = result ? result.stats.error : 0;
  const warnCount = result ? result.stats.warn : 0;
  const infoCount = result ? result.stats.info : 0;
  return /* @__PURE__ */ jsxs("div", { className: "cl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "cl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "CI \u4F53\u68C0\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "Dockerfile 20 \u6761 + \u5DE5\u4F5C\u6D41 26 \u6761\u89C4\u5219 \xB7 \u884C\u7EA7\u62A5\u544A \xB7 \u8BC4\u5206 \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
        /* @__PURE__ */ jsx("button", { className: `cl-tab ${kind === "auto" ? "on" : ""}`, onClick: () => {
          setKind("auto");
          setChecked(null);
        }, children: "\u81EA\u52A8\u8BC6\u522B" }),
        /* @__PURE__ */ jsx("button", { className: `cl-tab ${kind === "dockerfile" ? "on" : ""}`, onClick: () => {
          setKind("dockerfile");
          setChecked(null);
        }, children: "Dockerfile" }),
        /* @__PURE__ */ jsx("button", { className: `cl-tab ${kind === "workflow" ? "on" : ""}`, onClick: () => {
          setKind("workflow");
          setChecked(null);
        }, children: "\u5DE5\u4F5C\u6D41 YAML" }),
        /* @__PURE__ */ jsx("span", { className: "cl-note", children: text.trim() && detected !== "" ? `\u8BC6\u522B\uFF1A${detected === "dockerfile" ? "Dockerfile" : detected === "workflow" ? "\u5DE5\u4F5C\u6D41" : "\u65E0\u6CD5\u8BC6\u522B"}` : "" })
      ] }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "cl-area",
          placeholder: "\u7C98\u8D34 Dockerfile \u6216 GitHub Actions \u5DE5\u4F5C\u6D41 YAML\uFF0Cpush \u524D\u4F53\u68C0\u4E00\u904D\u2026\u2026\nFROM node            \u2190 \u672A\u9489\u7248\u672C\u4F1A\u62A5 warn\n\njobs:\n  build:\n    runs-on: ubunty-latest   \u2190 \u62FC\u5199\u9519\u8BEF\u4F1A\u62A5 warn",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
        /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: run, disabled: !text.trim(), children: "\u4F53\u68C0" }),
        /* @__PURE__ */ jsx("button", { className: "cl-btn", style: { padding: "4px 12px" }, onClick: () => loadSample("dockerfile"), children: "\u793A\u4F8B Dockerfile" }),
        /* @__PURE__ */ jsx("button", { className: "cl-btn", style: { padding: "4px 12px" }, onClick: () => loadSample("workflow"), children: "\u793A\u4F8B\u5DE5\u4F5C\u6D41" }),
        /* @__PURE__ */ jsx("button", { className: "cl-btn", style: { padding: "4px 12px" }, onClick: () => {
          setText("");
          setChecked(null);
        }, children: "\u6E05\u7A7A" })
      ] }),
      result && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `cl-verdict ${verdictClass(result.score)}`, children: [
          /* @__PURE__ */ jsx("span", { className: "cl-score", children: result.score }),
          /* @__PURE__ */ jsx("b", { children: result.grade }),
          /* @__PURE__ */ jsxs("span", { children: [
            errCount > 0 ? `\u274C ${errCount} error` : "\u2705 \u65E0 error",
            " \xB7 \u26A0\uFE0F ",
            warnCount,
            " warn \xB7 \u{1F4A1} ",
            infoCount,
            " info"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "cl-note", children: [
            result.kind === "dockerfile" ? `Dockerfile \xB7 ${result.stats.instructions} \u6761\u6307\u4EE4 \xB7 ${result.stats.stages} \u9636\u6BB5 \xB7 ${result.stats.lines} \u884C` : `\u5DE5\u4F5C\u6D41 \xB7 ${result.stats.lines} \u884C`,
            " \xB7 \u89C4\u5219 ",
            result.stats.rules,
            " \u6761"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
          /* @__PURE__ */ jsxs("button", { className: "cl-btn", style: { padding: "4px 12px" }, onClick: () => setView("report"), children: [
            "\u53D1\u73B0\uFF08",
            result.findings.length,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx("button", { className: "cl-btn", style: { padding: "4px 12px" }, onClick: () => setView("rules"), children: "\u89C4\u5219\u76EE\u5F55" })
        ] }),
        view === "report" && (result.findings.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "cl-empty", children: [
          "\u2705 ",
          result.stats.rules,
          " \u6761\u89C4\u5219\u626B\u63CF\u5B8C\u6BD5\uFF0C\u96F6\u53D1\u73B0\u3002"
        ] }) : /* @__PURE__ */ jsxs("table", { className: "cl-tbl", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: "ln", children: "\u884C" }),
            /* @__PURE__ */ jsx("th", { children: "\u7EA7\u522B" }),
            /* @__PURE__ */ jsx("th", { children: "\u89C4\u5219" }),
            /* @__PURE__ */ jsx("th", { children: "\u8BF4\u660E\u4E0E\u4FEE\u590D" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: result.findings.map((f, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { className: "ln", children: f.line ?? "\u2014" }),
            /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: `cl-lv ${f.level}`, children: f.level }) }),
            /* @__PURE__ */ jsx("td", { children: f.rule }),
            /* @__PURE__ */ jsxs("td", { children: [
              f.message,
              f.fix ? /* @__PURE__ */ jsxs("div", { className: "cl-fix", children: [
                "\u2192 ",
                f.fix
              ] }) : null
            ] })
          ] }, i)) })
        ] })),
        view === "rules" && /* @__PURE__ */ jsx("div", { className: "cl-rules", children: core2.ruleCatalog(result.kind).split("\n").map((l, i) => /* @__PURE__ */ jsx("div", { children: l }, i)) })
      ] }),
      !result && /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u7528\u6CD5\uFF1A\u7C98\u8D34\u914D\u7F6E \u2192 \u4F53\u68C0\u3002error \u4F1A\u5BFC\u81F4 CI \u5931\u8D25\u6216\u6784\u5EFA\u9519\u8BEF\uFF1Bwarn \u662F\u9AD8\u5EA6\u53EF\u7591/\u5B89\u5168\u98CE\u9669\uFF1Binfo \u662F\u6700\u4F73\u5B9E\u8DF5\u3002 \u5BF9\u6574\u4E2A\u4ED3\u5E93\u4F53\u68C0\u8BF7\u76F4\u63A5\u5728\u5BF9\u8BDD\u91CC\u8BF4\u300C\u7528 CI \u4F53\u68C0\u53F0\u626B\u63CF <\u76EE\u5F55>\u300D\uFF08MCP cil_scan\uFF0C\u53EA\u8BFB\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function CiLensEntry(props) {
  return /* @__PURE__ */ jsx2(CiLensPanel, { ...props });
}
export {
  CiLensEntry as default
};
