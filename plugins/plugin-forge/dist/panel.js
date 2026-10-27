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

// shared/forge-core.js
var require_forge_core = __commonJS({
  "shared/forge-core.js"(exports, module) {
    "use strict";
    var VALID_VIEW_AREAS = ["activityBar"];
    var VALID_PLUGIN_ICONS2 = [
      "Files",
      "GitPullRequest",
      "CheckSquare",
      "Languages",
      "Clock",
      "Target",
      "ClipboardList",
      "Terminal",
      "SquareTerminal",
      "Code2",
      "Bot",
      "BookOpen",
      "AlertCircle",
      "Film",
      "Globe2",
      "Activity",
      "Users",
      "Beaker"
    ];
    var VALID_PERMISSIONS = ["appConfigRead", "aiToolAccess"];
    var ID_RE = /^[a-z][a-z0-9-]*$/;
    var SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
    function lintManifest2(input) {
      let m = input;
      if (typeof input === "string") {
        try {
          m = JSON.parse(input);
        } catch (e) {
          return { ok: false, errors: [{ rule: "json.parse", msg: `\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${e.message}`, fix: "\u5148\u8FC7 JSON \u6821\u9A8C\uFF08\u6CE8\u610F\u5C3E\u9017\u53F7\u4E0E\u6CE8\u91CA\uFF09" }], warns: [], infos: [], checked: 1 };
        }
      }
      const errors = [];
      const warns = [];
      const infos = [];
      const err = (rule, msg, fix) => errors.push({ rule, msg, fix });
      const warn = (rule, msg, fix) => warns.push({ rule, msg, fix });
      const info = (rule, msg, fix) => infos.push({ rule, msg, fix });
      let checked = 0;
      const ck = (cond) => {
        checked += 1;
        return cond;
      };
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        return { ok: false, errors: [{ rule: "manifest.type", msg: "\u6E05\u5355\u5FC5\u987B\u662F JSON \u5BF9\u8C61", fix: "\u9876\u5C42\u5E94\u4E3A {...}" }], warns: [], infos: [], checked: 1 };
      }
      if (ck(typeof m.id !== "string" || !ID_RE.test(m.id || ""))) {
        err("manifest.id", `id \u7F3A\u5931\u6216\u4E0D\u5408\u89C4\uFF1A${JSON.stringify(m.id ?? null)}`, "\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934\uFF0C\u4EC5\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF08kebab-case\uFF09\uFF0C\u5982 my-plugin");
      }
      if (ck(!m.name || typeof m.name !== "string")) err("manifest.name", "name \u7F3A\u5931", "\u4E2D\u6587\u77ED\u540D\uFF08\u5546\u57CE\u5C55\u793A\u7528\uFF09\uFF0C\u5982\u300C\u7F51\u9875\u54E8\u5175\u300D");
      if (ck(!SEMVER_RE.test(String(m.version || "")))) {
        err("manifest.version", `version \u7F3A\u5931\u6216\u4E0D\u662F semver\uFF1A${JSON.stringify(m.version ?? null)}`, "\u4E09\u6BB5\u5F0F\uFF0C\u5982 0.1.0");
      }
      if (ck(!m.description || typeof m.description !== "string" || m.description.trim().length < 20)) {
        warn("manifest.description", "description \u7F3A\u5931\u6216\u8FC7\u77ED\uFF08<20 \u5B57\uFF09", "\u5546\u57CE\u4E0E AI \u90FD\u9760\u5B83\u7406\u89E3\u63D2\u4EF6\uFF1B\u5199\u6E05\u300C\u662F\u4EC0\u4E48 + \u6740\u624B\u950F + \u6570\u636E\u9762\u300D");
      } else if (m.description.length > 2e3) {
        warn("manifest.description", `description \u8FC7\u957F\uFF08${m.description.length} \u5B57\uFF09`, "\u8D85\u8FC7 2000 \u5B57\u5EFA\u8BAE\u7CBE\u7B80\uFF0C\u7EC6\u8282\u79FB\u5165 README");
      }
      if (ck(typeof m.enabledByDefault !== "boolean")) {
        info("manifest.enabledByDefault", "\u672A\u663E\u5F0F\u58F0\u660E enabledByDefault", "\u663E\u5F0F\u5199 true/false\uFF1B\u6CE8\u610F\u5E73\u53F0\u662F\u300C\u9759\u6001 enabledByDefault + \u8BBE\u7F6E\u5F00\u5173\u300D\u4E24\u5C42\u95E8\uFF0Ctrue \u4E0D\u7B49\u4E8E\u9762\u677F\u4E00\u5B9A\u53EF\u89C1");
      }
      const views = m.contributes && Array.isArray(m.contributes.views) ? m.contributes.views : [];
      if (ck(m.contributes && m.contributes.panel)) {
        const p = m.contributes.panel || {};
        if (!p.entry || typeof p.entry !== "string") {
          err("panel.entry", "contributes.panel.entry \u7F3A\u5931", '\u5E94\u4E3A "./dist/panel.js"\uFF08esbuild \u4EA7\u7269\uFF09');
        } else if (!p.entry.startsWith("./") || !p.entry.endsWith(".js")) {
          warn("panel.entry", `entry \u5EFA\u8BAE\u5F62\u5982 ./dist/panel.js\uFF08\u76F8\u5BF9\u63D2\u4EF6\u6839\uFF09`, `\u5F53\u524D\uFF1A${p.entry}`);
        }
      }
      for (const v of views) {
        const at = `views[${views.indexOf(v)}]`;
        if (ck(!VALID_VIEW_AREAS.includes(v.area))) {
          err("view.area", `${at}.area=${JSON.stringify(v.area ?? null)} \u4E0D\u5728\u767D\u540D\u5355`, `\u5F53\u524D\u5E73\u53F0\u4EC5\u652F\u6301 ${VALID_VIEW_AREAS.join("/")}`);
        }
        if (ck(!VALID_PLUGIN_ICONS2.includes(v.icon))) {
          err("view.icon", `${at}.icon=${JSON.stringify(v.icon ?? null)} \u4E0D\u5728\u56FE\u6807\u767D\u540D\u5355\uFF08\u4F1A\u88AB\u62D2\uFF09`, `\u53EF\u7528 18 \u503C\uFF1A${VALID_PLUGIN_ICONS2.join(", ")}`);
        }
        if (ck(!v.panelType)) err("view.panelType", `${at}.panelType \u7F3A\u5931`, "\u9762\u677F\u7C7B\u578B\u6807\u8BC6\uFF0C\u5BBF\u4E3B\u7528\u5B83\u8DEF\u7531\uFF1B\u5EFA\u8BAE <idCamel> \u5F62\u5F0F");
        if (ck(!v.labelKey || !v.labelDefault)) {
          warn("view.label", `${at} \u7F3A labelKey/labelDefault`, "labelKey \u5F62\u5982 plugins.<camel>\uFF0ClabelDefault \u4E3A\u4E2D\u6587\u9ED8\u8BA4\u540D");
        }
        if (ck(typeof v.order !== "number")) {
          info("view.order", `${at}.order \u975E\u6570\u5B57`, "ActivityBar \u6392\u5E8F\uFF1B\u73B0\u6709\u63D2\u4EF6\u5DF2\u5360 15/20/40/50/68/72/73/74/75/80/85/90\uFF0C\u53D6\u4E0D\u51B2\u7A81\u503C");
        }
      }
      if (m.contributes && m.contributes.panel && views.length === 0) {
        err("view.missing", "\u6709 panel \u5165\u53E3\u4F46\u6CA1\u6709\u4EFB\u4F55 view \u6302\u5230 activityBar", "contributes.views \u81F3\u5C11\u4E00\u6761\uFF0Cicon \u5FC5\u987B\u5728\u767D\u540D\u5355");
      }
      const services = m.contributes && Array.isArray(m.contributes.services) ? m.contributes.services : [];
      for (const s of services) {
        const at = `services[${services.indexOf(s)}]`;
        if (ck(!s.id)) err("service.id", `${at}.id \u7F3A\u5931`, "\u670D\u52A1 id\uFF0Cstart/stop \u65F6\u8981\u7528");
        if (ck(!["http", "std", "worker"].includes(s.type))) {
          warn("service.type", `${at}.type=${JSON.stringify(s.type ?? null)} \u975E http/std/worker`, "http \u578B\u6709\u5065\u5EB7\u68C0\u67E5\u8BED\u4E49\uFF1Bstd/worker \u53EA\u770B\u8FDB\u7A0B\u9000\u51FA");
        }
        if (ck(!s.command)) err("service.command", `${at}.command \u7F3A\u5931`, '\u4E00\u822C\u4E3A "node"');
        if (ck(!Array.isArray(s.argsTemplate))) {
          err("service.argsTemplate", `${at}.argsTemplate \u7F3A\u5931\u6216\u4E0D\u662F\u6570\u7EC4`, `\u5982 ["{{pluginDir}}/service/main.js", "{{port}}", "{{appConfigDir}}"]`);
        } else {
          if (s.type === "http") {
            if (!s.argsTemplate.some((a) => String(a).includes("{{port}}"))) {
              warn("service.port", `${at}.argsTemplate \u672A\u542B {{port}}`, "http \u578B\u670D\u52A1\u9700\u8981\u7AEF\u53E3\u8D77\u5065\u5EB7\u7AEF\u70B9");
            }
            if (!s.healthCheck) {
              warn("service.healthCheck", `${at} \u672A\u914D healthCheck`, 'http \u578B\u9ED8\u8BA4\u6309\u4EFB\u610F 2xx \u5224\u6D3B\uFF083s \u8D85\u65F6/30s \u5468\u671F/3 \u6B21\u5224\u6B7B\uFF09\uFF0C\u5EFA\u8BAE\u663E\u5F0F\u914D "/__health"');
            }
            if (s.healthCheckTimeout && Number(s.healthCheckTimeout) > 1e4) {
              warn("service.healthCheckTimeout", `${at}.healthCheckTimeout=${s.healthCheckTimeout} \u504F\u5927`, "\u5065\u5EB7\u68C0\u67E5\u8D85\u65F6\u5EFA\u8BAE \u226410s\uFF1B\u5224\u6B7B\u5468\u671F=30s\xD73 \u6B21");
            }
          }
          if (!s.argsTemplate.some((a) => String(a).includes("{{appConfigDir}}"))) {
            info("service.appConfigDir", `${at}.argsTemplate \u672A\u542B {{appConfigDir}}`, "\u65E5\u5FD7\u843D\u76D8/\u81EA\u53D1\u73B0\u6865\u90FD\u9700\u8981\u5B83\uFF08kvclient \u4EE5\u6B64\u515C\u5E95 config.json\uFF09");
          }
          if (!s.argsTemplate.some((a) => String(a).includes("{{pluginDir}}"))) {
            warn("service.pluginDir", `${at}.argsTemplate \u672A\u7528 {{pluginDir}} \u5F15\u7528\u81EA\u8EAB\u6587\u4EF6`, "\u5B89\u88C5\u76EE\u5F55\u4E0D\u53EF\u786C\u7F16\u7801\uFF0C\u7528 {{pluginDir}} \u5360\u4F4D");
          }
        }
        if (s.autoStart === false && s.restartOnFailure !== false) {
          info("service.autostart", `${at} autoStart=false \u4E14 restartOnFailure \u5F00\u542F`, "\u786E\u8BA4\u8FD9\u662F\u6709\u610F\u7684\u7EC4\u5408\uFF08\u4E0D\u81EA\u542F\u4F46\u5D29\u6E83\u62C9\u8D77\uFF09");
        }
      }
      const mcps = m.contributes && Array.isArray(m.contributes.mcpServers) ? m.contributes.mcpServers : [];
      for (const s of mcps) {
        const at = `mcpServers[${mcps.indexOf(s)}]`;
        if (ck(s.transport !== "stdio")) {
          warn("mcp.transport", `${at}.transport=${JSON.stringify(s.transport ?? null)}`, "\u73B0\u5E73\u53F0\u4EE5 stdio \u4E3A\u51C6");
        }
        if (ck(!Array.isArray(s.argsTemplate) || !s.argsTemplate.some((a) => String(a).includes("{{pluginDir}}")))) {
          err("mcp.args", `${at}.argsTemplate \u7F3A\u5931\u6216\u672A\u7528 {{pluginDir}}`, `\u5982 ["{{pluginDir}}/mcp/server.js", "{{appConfigDir}}"]`);
        }
        if (ck(Array.isArray(s.argsTemplate) && !s.argsTemplate.some((a) => String(a).includes("{{appConfigDir}}")))) {
          info("mcp.appConfigDir", `${at} \u672A\u4F20 {{appConfigDir}} \u7ED9 MCP \u8FDB\u7A0B`, "MCP server \u4E5F\u8981\u81EA\u53D1\u73B0\u6865\uFF08\u65E5\u5FD7\u515C\u5E95/anchor \u5B9A\u4F4D\uFF09\uFF0C\u5EFA\u8BAE\u4F20\u5165");
        }
      }
      if (ck(!Array.isArray(m.contributes && m.contributes.mcpServers))) {
        info("mcp.none", "\u672A\u58F0\u660E mcpServers", "\u65E0 AI \u5DE5\u5177\u7684\u7EAF\u9762\u677F\u63D2\u4EF6\u53EF\u4EE5\u6CA1\u6709\uFF1B\u6709 MCP \u5219 AI \u80FD\u76F4\u63A5\u64CD\u4F5C\u63D2\u4EF6");
      }
      if (m.permissions && typeof m.permissions === "object") {
        for (const k of Object.keys(m.permissions)) {
          if (ck(!VALID_PERMISSIONS.includes(k))) {
            warn("permissions.unknown", `permissions.${k} \u4E0D\u5728\u5DF2\u77E5\u96C6\u5408`, `\u5DF2\u77E5\uFF1A${VALID_PERMISSIONS.join(", ")}\uFF08\u672A\u77E5\u952E\u4F1A\u88AB\u5FFD\u7565\uFF0C\u522B\u6307\u671B\u5B83\u751F\u6548\uFF09`);
          }
        }
      } else {
        info("permissions.none", "\u672A\u58F0\u660E permissions", "\u9700\u8981 AI \u5DE5\u5177\uFF08MCP\uFF09\u65F6\u987B aiToolAccess:true\uFF1B\u8981\u8BFB appConfigDir \u65F6\u987B appConfigRead:true");
      }
      if (mcps.length > 0 && !(m.permissions && m.permissions.aiToolAccess)) {
        warn("mcp.permission", "\u58F0\u660E\u4E86 mcpServers \u4F46 permissions.aiToolAccess \u2260 true", '\u8865 "permissions": { "aiToolAccess": true }\uFF0C\u5426\u5219 AI \u4FA7\u53EF\u80FD\u4E0D\u53EF\u7528');
      }
      const o = m.origin || {};
      for (const k of ["updateUrl", "downloadUrl", "manifestUrl"]) {
        const u = o[k] || (k === "manifestUrl" ? null : null);
        if (u && /@[a-zA-Z0-9._-]+v?\d/i.test(String(u)) && !/@main/.test(String(u))) {
          warn("origin.taggedUrl", `origin.${k} \u7591\u4F3C @tag \u9489\u5B9A\uFF1A${u}`, "\u672A\u63A8 tag \u7684\u4ED3\u5E93\u8BE5 URL \u4F1A 404\uFF1Bpublish \u811A\u672C\u53EF\u80FD\u6539\u5199\uFF0C\u843D @main \u5E76\u91CD\u7B97 zip sha256");
        }
      }
      if (ck(!o.repository)) info("origin.repository", "\u672A\u58F0\u660E origin.repository", "\u5546\u57CE\u6765\u6E90\u4FE1\u606F");
      info("keyspace", '\u786E\u8BA4\u6570\u636E\u9762\u952E\u7A7A\u95F4\u4EE5 <id \u53BB\u8FDE\u5B57\u7B26>. \u6216\u81EA\u5B9A\u77ED\u524D\u7F00 + "." \u5F00\u5934', "cap.kv list \u8FD4\u56DE\u5168\u5C40\u6240\u6709\u952E\uFF08\u8DE8\u63D2\u4EF6\u5171\u4EAB\u7A7A\u95F4\uFF09\uFF0C\u65E0\u524D\u7F00 = \u6C61\u67D3\u4ED6\u4EBA + \u88AB\u4ED6\u4EBA\u6C61\u67D3");
      return { ok: errors.length === 0, errors, warns, infos, checked };
    }
    function searchTopics2(metas, bodies, query) {
      const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      const out = [];
      for (const meta of metas) {
        const title = String(meta.title || "").toLowerCase();
        const summary = String(meta.summary || "").toLowerCase();
        const tags = (meta.tags || []).join(" ").toLowerCase();
        const body = String(bodies[meta.id] || "").toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (!t) continue;
          score += countOcc(title, t) * 4;
          score += countOcc(tags, t) * 3;
          score += countOcc(summary, t) * 2;
          score += countOcc(body, t) * 1;
        }
        if (score > 0) out.push({ meta, score });
      }
      out.sort((a, b) => b.score - a.score);
      return out;
    }
    function countOcc(hay, needle) {
      if (!hay || !needle) return 0;
      let n = 0, i = 0;
      while ((i = hay.indexOf(needle, i)) !== -1) {
        n += 1;
        i += needle.length;
      }
      return n;
    }
    function snippetFor2(body, query, maxLen = 200) {
      const lower = String(body || "").toLowerCase();
      const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
      let idx = -1;
      for (const t of terms) {
        const i = lower.indexOf(t);
        if (i !== -1) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return String(body || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
      const start = Math.max(0, idx - 60);
      const raw = String(body).slice(start, start + maxLen).replace(/\s+/g, " ").trim();
      return (start > 0 ? "\u2026" : "") + raw + (start + maxLen < String(body).length ? "\u2026" : "");
    }
    function applyTemplate(tpl, vars) {
      const missing = /* @__PURE__ */ new Set();
      const out = String(tpl).replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
        if (Object.prototype.hasOwnProperty.call(vars, k)) return String(vars[k]);
        missing.add(k);
        return `{{${k}}}`;
      });
      return { text: out, missing: [...missing] };
    }
    function buildScaffold2(templates, spec) {
      const id = spec.id || "my-plugin";
      const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
      const prefix = spec.prefix || camel;
      const vars = {
        PLUGIN_ID: id,
        PLUGIN_ID_NODASH: id.replace(/-/g, "_"),
        PLUGIN_NAME: spec.name || id,
        PREFIX: prefix,
        PREFIX_UPPER: prefix.replace(/-/g, "_").toUpperCase(),
        PREFIX_DOT: prefix + ".",
        PANEL_TYPE: spec.panelType || camel,
        LABEL_KEY: spec.labelKey || `plugins.${camel}`,
        ICON: spec.icon || "Beaker",
        ORDER: String(spec.order ?? 80),
        VERSION: "0.1.0"
      };
      const warnings = [];
      const files = [];
      const skip = /* @__PURE__ */ new Set();
      if (!spec.withService) {
        for (const p of Object.keys(templates)) if (p.startsWith("service_")) skip.add(p);
      }
      if (!spec.withMcp) {
        for (const p of Object.keys(templates)) if (p.startsWith("mcp_")) skip.add(p);
      }
      for (const [rel, tpl] of Object.entries(templates)) {
        if (skip.has(rel)) continue;
        const { text, missing } = applyTemplate(tpl, vars);
        if (missing.length) warnings.push(`${rel}: \u672A\u63D0\u4F9B\u5360\u4F4D\u7B26 ${missing.join(", ")}`);
        files.push({ path: rel, content: text });
      }
      files.sort((a, b) => a.path.localeCompare(b.path));
      return { files, warnings };
    }
    function buildManifest2(spec) {
      const m = {
        id: spec.id,
        name: spec.name,
        version: "0.1.0",
        description: spec.description || `${spec.name}\uFF1A\u7528 node scripts/pack.js \u6253\u5305\u524D\u8BF7\u8865\u5168\u672C\u63CF\u8FF0\uFF08\u226520 \u5B57\uFF0C\u8BF4\u6E05\u662F\u4EC0\u4E48/\u6740\u624B\u950F/\u6570\u636E\u9762\uFF09\u3002`,
        enabledByDefault: false,
        contributes: {
          views: [{
            id: `${spec.id}.panel`,
            area: "activityBar",
            panelType: spec.panelType,
            icon: spec.icon,
            labelKey: spec.labelKey,
            labelDefault: spec.name,
            order: spec.order ?? 80
          }],
          panel: { entry: "./dist/panel.js", supportsFullscreen: true }
        },
        permissions: { appConfigRead: true, aiToolAccess: true }
      };
      if (spec.withService) {
        m.contributes.services = [{
          id: `${spec.id}-service`,
          type: "http",
          command: "node",
          argsTemplate: ["{{pluginDir}}/service/main.js", "{{port}}", "{{appConfigDir}}"],
          healthCheck: "/__health",
          healthCheckTimeout: 5e3,
          autoStart: true,
          restartOnFailure: true,
          maxRestarts: 10,
          description: "\u540E\u53F0\u670D\u52A1\uFF08\u539F\u751F fetch\uFF0C\u65E0\u8DE8\u57DF\u9650\u5236\uFF09"
        }];
      }
      if (spec.withMcp) {
        m.contributes.mcpServers = [{
          id: spec.id,
          transport: "stdio",
          command: "node",
          argsTemplate: ["{{pluginDir}}/mcp/server.js", "{{appConfigDir}}"]
        }];
      }
      return m;
    }
    module.exports = {
      VALID_PLUGIN_ICONS: VALID_PLUGIN_ICONS2,
      VALID_VIEW_AREAS,
      VALID_PERMISSIONS,
      lintManifest: lintManifest2,
      searchTopics: searchTopics2,
      snippetFor: snippetFor2,
      countOcc,
      applyTemplate,
      buildScaffold: buildScaffold2,
      buildManifest: buildManifest2
    };
  }
});

// src/Panel.tsx
import { useState as useState4 } from "react";

// src/KbTab.tsx
import { useMemo, useState } from "react";

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

// shared/kb-index.json
var kb_index_default = {
  version: "0.1.0",
  updatedAt: "2026-10-27",
  note: "\u5143\u6570\u636E\u7D22\u5F15\uFF1B\u6B63\u6587\u5728\u540C\u76EE\u5F55 <id>.md\u3002\u5168\u90E8\u7ED3\u8BBA\u4E8E 2026-10-27 \u5BF9\u7167\u4E3B\u4ED3\u4EE3\u7801\u4E0E\u516D\u4E2A\u5DF2\u4EA4\u4ED8\u63D2\u4EF6\u9010\u6761\u6838\u5B9E\uFF0C\u4E0E docs/plugin-development-guide.md \u51B2\u7A81\u5904\u4EE5\u672C\u5E93\u4E3A\u51C6\uFF08\u51B2\u7A81\u70B9\u5DF2\u6807\u6CE8\uFF09\u3002",
  topics: [
    { id: "overview", title: "\u5E73\u53F0\u603B\u89C8\uFF1A\u4E09\u7C7B\u8FDB\u7A0B\u4E0E\u4E24\u6761\u901A\u9053", summary: "\u9762\u677F bundle / \u540E\u53F0\u670D\u52A1 / MCP server \u5404\u81EA\u600E\u4E48\u8DD1\u3001\u600E\u4E48\u8DDF\u5BBF\u4E3B\u901A\u4FE1\u3002\u5EFA\u63D2\u4EF6\u524D\u5148\u8BFB\u8FD9\u4E2A\u5EFA\u7ACB\u5168\u5C40\u56FE\u3002", tags: ["\u603B\u89C8", "\u67B6\u6784", "\u5165\u95E8", "\u8FDB\u7A0B", "\u901A\u9053", "router_dispatch", "bridge"] },
    { id: "manifest", title: "plugin.json \u6743\u5A01\u89C4\u8303", summary: "\u9010\u5B57\u6BB5\u6E05\u5355\uFF1A\u5FC5\u586B\u9879\u3001\u56FE\u6807 18 \u767D\u540D\u5355\u3001\u89C6\u56FE\u533A\u3001\u670D\u52A1\u5065\u5EB7\u68C0\u67E5\u3001MCP \u58F0\u660E\u3001permissions \u5DF2\u77E5\u96C6\u3002", tags: ["manifest", "plugin.json", "\u56FE\u6807", "icon", "\u767D\u540D\u5355", "contributes", "views", "order"] },
    { id: "panel", title: "\u9762\u677F\uFF1A\u6784\u5EFA / \u5165\u53E3 / \u5BBF\u4E3B\u901A\u9053 / capDispatch", summary: "esbuild \u53C2\u6570\uFF08React \u5FC5\u987B external\uFF09\u3001\u9ED8\u8BA4\u5BFC\u51FA\u7B7E\u540D\u3001__POLARIS_HOST_INVOKE__ \u901A\u9053\u4E0E router_dispatch \u5305\u88C5\u3002", tags: ["panel", "esbuild", "react", "external", "invoke", "capDispatch", "bundle", "shim"] },
    { id: "cross-origin", title: "\u8DE8\u57DF\u6CBB\u7406\u4E09\u5C42\u65B9\u6848\uFF08\u6700\u91CD\u8981\u7684\u4E00\u8BFE\uFF09", summary: "\u9762\u677F\u7EDD\u4E0D\u76F4\u63A5 fetch\uFF1A\u684C\u9762\u8D70 cap.http \u8F6C\u53D1\u3001\u8DE8\u7AEF\u901A\u7528\u89E3\u662F\u4E0B\u6C89\u670D\u52A1\u539F\u751F fetch\u3001Remote \u6E90\u9ED8\u8BA4 deny \u9677\u9631\u3002", tags: ["\u8DE8\u57DF", "CORS", "cap.http", "fetch", "Remote", "deny", "\u6DF7\u5408\u5185\u5BB9", "\u6293\u53D6"] },
    { id: "service", title: "\u670D\u52A1\u8FDB\u7A0B\uFF1A\u6865\u81EA\u53D1\u73B0 + \u751F\u547D\u5468\u671F + \u65E5\u5FD7", summary: "\u96F6\u73AF\u5883\u53D8\u91CF\u6CE8\u5165 \u2192 anchor/config/\u626B\u7AEF\u53E3\u81EA\u53D1\u73B0\uFF1B\u5065\u5EB7\u68C0\u67E5\u8BED\u4E49\uFF1B\u5BBF\u4E3B\u4E0D\u6536 stdout \u2192 \u81EA\u843D\u76D8\u3002", tags: ["service", "kvclient", "\u81EA\u53D1\u73B0", "anchor", "\u5065\u5EB7\u68C0\u67E5", "healthCheck", "\u65E5\u5FD7", "log"] },
    { id: "service-start", title: "\u9762\u677F\u81EA\u4E3E\u670D\u52A1 start\uFF08discover + contribution\uFF09", summary: "\u670D\u52A1 start \u5FC5\u987B\u5E26 installPath+contribution\uFF1A\u9762\u677F\u7ECF cap.pluginDiscovery \u627E\u81EA\u5DF1\u518D\u6309 toBackendContribution \u5F62\u6001\u4F20\u3002", tags: ["start", "\u81EA\u4E3E", "pluginServiceManager", "pluginDiscovery", "installPath", "contribution", "serviceAction"] },
    { id: "single-writer", title: "\u5355\u5199\u8005\u4E0E\u5E42\u7B49\u7EAA\u5F8B", summary: "\u547D\u4EE4\u952E\u5148\u5220\u540E\u505A\u3001\u7ED3\u679C\u952E\u8F6E\u8BE2\u3001id \u5E42\u7B49\u53BB\u91CD\u3001\u79DF\u7EA6\u6A21\u5F0F\u3002\u591A\u7AEF\u5E76\u53D1\u5199\u7684\u7ADE\u6001\u5168\u90E8\u9760\u5951\u7EA6\u6D88\u706D\u3002", tags: ["\u5355\u5199\u8005", "\u5E42\u7B49", "\u5E76\u53D1", "\u7ADE\u6001", "\u547D\u4EE4\u952E", "\u5148\u5220\u540E\u505A", "\u79DF\u7EA6", "lease"] },
    { id: "keyspace", title: "cap.kv \u952E\u7A7A\u95F4\u7EAA\u5F8B", summary: "list \u8FD4\u56DE\u5168\u5C40\u6240\u6709\u952E\uFF08\u8DE8\u63D2\u4EF6\u5171\u4EAB\uFF09\uFF1A\u524D\u7F00\u5FC5\u52A0\u3001\u952E\u6570\u8981\u7701\u3001\u5927\u5217\u8868\u5206\u5757\u3001README \u5199\u6743\u5A01\u952E\u8868\u3002", tags: ["cap.kv", "\u952E\u7A7A\u95F4", "\u524D\u7F00", "list", "\u5206\u5757", "chunk", "sqlite", "kv"] },
    { id: "mcp", title: "MCP server \u6700\u5C0F\u5B9E\u73B0\u4E0E\u5DE5\u5177\u8BBE\u8BA1", summary: "stdio JSON-RPC \u9AA8\u67B6\u3001\u5DE5\u5177 description \u5199\u6CD5\uFF08\u51B3\u5B9A AI \u4F1A\u4E0D\u4F1A\u7528\uFF09\u3001\u5371\u9669\u64CD\u4F5C confirm \u95E8\u3002", tags: ["mcp", "stdio", "jsonrpc", "\u5DE5\u5177", "tools", "description", "confirm", "AI"] },
    { id: "caps", title: "\u63D2\u4EF6\u53EF\u7528 cap \u901F\u67E5", summary: "cap.kv / cap.pluginServiceManager / cap.pluginDiscovery / cap.http \u56DB\u4E2A\u63D2\u4EF6\u5B9E\u9645\u53EF\u7528\u7684\u80FD\u529B\u4E0E payload \u5F62\u6001\u3002", tags: ["cap", "\u80FD\u529B", "router", "bus", "payload", "action", "\u901F\u67E5"] },
    { id: "testing", title: "\u4E09\u5C42\u9A8C\u8BC1\u4E0E\u771F\u5B9E\u6865\u5192\u70DF\u914D\u65B9", summary: "\u79BB\u7EBF\u5355\u6D4B\uFF08\u7EAF\u51FD\u6570\uFF09+ tsc/esbuild + \u771F\u5B9E\u6865\u5192\u70DF\uFF1A\u8D77\u771F\u670D\u52A1\u771F MCP\u3001\u5199\u771F kv\u3001\u8DD1\u5B8C\u81EA\u6E05\u7406\u3002\u542B\u9632\u8BEF\u4F24\u751F\u4EA7\u6570\u636E\u7684\u62A4\u680F\u3002", tags: ["\u6D4B\u8BD5", "\u5355\u6D4B", "\u5192\u70DF", "smoke", "\u771F\u5B9E\u6865", "\u9A8C\u8BC1", "typecheck", "esbuild"] },
    { id: "publishing", title: "\u6253\u5305\u53D1\u5E03\u4E0E index.json \u4E09\u5751", summary: "pack.js \u7528\u6CD5\u3001\u65B0\u63D2\u4EF6\u5FC5\u987B\u624B\u52A8\u52A0 index \u6761\u76EE\u3001@tag URL \u4F1A 404\u3001zip \u6BCF\u6B21\u91CD\u6253 sha \u90FD\u53D8\u3001index.json \u5E76\u53D1\u8986\u76D6\u5B9E\u5F55\u3002", tags: ["\u53D1\u5E03", "pack", "publish", "index.json", "sha256", "update.json", "jsdelivr", "tag", "\u5751"] },
    { id: "ui-ux", title: "\u9762\u677F UI \u7EA6\u5B9A\u4E0E\u79FB\u52A8\u7AEF\u5751", summary: "Tab \u7ED3\u6784\u60EF\u4F8B\u3001clipboard \u975E\u5B89\u5168\u4E0A\u4E0B\u6587\u56DE\u9000\u3001\u5185\u8054 SVG \u56FE\u8868\u3001\u4E3B\u9898 token\u3001\u624B\u673A\u54CD\u5E94\u5F0F\u3002", tags: ["UI", "\u9762\u677F", "clipboard", "\u79FB\u52A8\u7AEF", "\u624B\u673A", "\u56FE\u8868", "SVG", "tab", "\u56DE\u9000"] },
    { id: "production-checklist", title: "\u751F\u4EA7\u7EA7\u6E05\u5355\uFF08data-ark \u6807\u51C6\uFF09", summary: "\u539F\u5B50\u5199\u3001\u8BDA\u5B9E\u964D\u7EA7\u3001\u65E5\u5FD7\u8F6E\u8F6C\u3001\u4E0D\u63A9\u76D6\u540C\u6B65\u95EE\u9898\u3001SSRF \u5B88\u536B\u3001\u5371\u9669\u64CD\u4F5C confirm\u3001\u5192\u70DF\u81EA\u6E05\u7406\u2014\u2014\u9010\u6761\u6253\u52FE\u624D\u7B97\u751F\u4EA7\u7EA7\u3002", tags: ["\u751F\u4EA7\u7EA7", "\u6E05\u5355", "checklist", "\u539F\u5B50\u5199", "\u964D\u7EA7", "SSRF", "\u5B88\u536B", "confirm", "\u8F6E\u8F6C"] },
    { id: "pitfalls", title: "\u5B9E\u6D4B\u5751\u603B\u8868\uFF08\u6587\u6863\u6CA1\u5199\u7684\u90FD\u5728\u8FD9\uFF09", summary: "fetch body \u65E0 .on\u3001Promise executor \u4E0D\u80FD await\u3001\u9650\u9891\u952E\u542B\u7EF4\u5EA6\u3001GBK \u89E3\u7801\u3001env \u6CE8\u5165\u4E0D\u5B58\u5728\u3001plugin_service_* \u5DF2\u5220\u2026\u2026\u4E00\u6761\u4E00\u4E2A\u5B9E\u6218\u6545\u4E8B\u3002", tags: ["\u5751", "pitfall", "\u5B9E\u6D4B", "ReadableStream", "GBK", "env", "HMR", "\u591A\u5B9E\u4F8B"] },
    { id: "workflow", title: "AI \u5EFA\u63D2\u4EF6\u63A8\u8350\u6D41\u7A0B\uFF08\u5148\u8BFB\u6211\uFF09", summary: "\u6536\u5230\u300C\u5E2E\u6211\u521B\u5EFA\u63D2\u4EF6\u300D\u7C7B\u8BF7\u6C42\u65F6\u7684\u6807\u51C6\u4F5C\u4E1A\u7A0B\u5E8F\uFF1A\u62C9\u77E5\u8BC6 \u2192 \u5B9A\u5951\u7EA6 \u2192 shared core \u2192 \u4E09\u8FDB\u7A0B \u2192 \u5192\u70DF \u2192 \u53D1\u5E03\uFF0C\u6BCF\u6B65\u5F15\u7528\u5BF9\u5E94\u4E3B\u9898\u3002", tags: ["\u6D41\u7A0B", "workflow", "SOP", "AI", "\u521B\u5EFA\u63D2\u4EF6", "\u811A\u624B\u67B6", "\u6B65\u9AA4"] }
  ]
};

// src/model.ts
var KB_META = {
  version: kb_index_default.version,
  updatedAt: kb_index_default.updatedAt,
  topics: kb_index_default.topics
};
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
function normalizeForgeSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    scaffoldDir: typeof r.scaffoldDir === "string" ? r.scaffoldDir : "",
    defaultIcon: typeof r.defaultIcon === "string" ? r.defaultIcon : "Beaker",
    defaultOrder: typeof r.defaultOrder === "number" ? r.defaultOrder : 80
  };
}
var FORGE_SETTINGS_KEY = "forge.settings";
async function loadForgeSettings() {
  const r = await capDispatch("cap.kv", { action: "get", key: FORGE_SETTINGS_KEY }).catch(() => null);
  return normalizeForgeSettings(r && r.value);
}
async function saveForgeSettings(s) {
  await capDispatch("cap.kv", { action: "set", key: FORGE_SETTINGS_KEY, value: s });
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch (_) {
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (_) {
    ok = false;
  }
  document.body.removeChild(ta);
  if (ok) return "copied";
  window.prompt("\u624B\u673A\u7AEF\u81EA\u52A8\u590D\u5236\u4E0D\u53EF\u7528\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\uFF1A", text);
  return "manual";
}

// shared/kb/overview.md
var overview_default = "# \u5E73\u53F0\u603B\u89C8\uFF1A\u4E09\u7C7B\u8FDB\u7A0B\u4E0E\u4E24\u6761\u901A\u9053\n\nPolaris \u63D2\u4EF6 = \u4E00\u4EFD `plugin.json` \u6E05\u5355 + \u6700\u591A\u4E09\u7C7B\u8FDB\u7A0B\u3002\u5EFA\u63D2\u4EF6\u524D\u5148\u8BA4\u6E05\u8C01\u5728\u54EA\u8DD1\u3001\u6D88\u606F\u600E\u4E48\u8D70\u2014\u2014\u6240\u6709\u5751\u90FD\u6E90\u4E8E\u628A\u8FD9\u4E09\u7C7B\u8FDB\u7A0B\u7684\u8FB9\u754C\u641E\u6DF7\u3002\n\n## \u4E09\u7C7B\u8FDB\u7A0B\n\n| \u8FDB\u7A0B | \u8DD1\u5728\u54EA | \u58F0\u660E\u65B9\u5F0F | \u7528\u9014 |\n|---|---|---|---|\n| **\u9762\u677F**\uFF08panel\uFF09 | \u5BBF\u4E3B webview \u91CC\uFF08React bundle\uFF0C\u7ECF blob URL \u6CE8\u5165\uFF09 | `contributes.panel.entry` + `contributes.views[]` | \u7528\u6237 UI\uFF1B**\u6CA1\u6709\u4EFB\u4F55 Node \u80FD\u529B\uFF0C\u7EDD\u4E0D\u76F4\u63A5 fetch \u5916\u7F51** |\n| **\u540E\u53F0\u670D\u52A1**\uFF08service\uFF09 | \u5BBF\u4E3B\u62C9\u8D77\u7684\u72EC\u7ACB node \u8FDB\u7A0B | `contributes.services[]`\uFF08type=http \u5E26 `{{port}}` \u5065\u5EB7\u7AEF\u70B9\uFF09 | \u5B9A\u65F6\u4EFB\u52A1\u3001\u539F\u751F fetch\uFF08\u8DE8\u57DF\u6839\u6CBB\u70B9\uFF09\u3001\u6587\u4EF6\u64CD\u4F5C |\n| **MCP server** | \u5BBF\u4E3B\u62C9\u8D77\u7684\u72EC\u7ACB node \u8FDB\u7A0B\uFF08stdio\uFF09 | `contributes.mcpServers[]` | AI \u5DE5\u5177\u5C42\uFF1BAI \u7ECF tools/call \u64CD\u4F5C\u63D2\u4EF6 |\n\n\u4E09\u7C7B\u8FDB\u7A0B\u90FD\u53EF\u9009\uFF0C\u7EC4\u5408\u89C1\u771F\u5B9E\u63D2\u4EF6\uFF1Apocket-ledger \u7EAF\u9762\u677F+MCP\uFF08\u96F6\u670D\u52A1\uFF09\uFF1Bclip-relay \u4E09\u7C7B\u9F50\u5168\uFF1Bdata-ark \u670D\u52A1\u505A\u91CD\u6D3B\u3001MCP \u4E03\u5DE5\u5177\u3002\n\n## \u4E24\u6761\u901A\u4FE1\u901A\u9053\n\n```\n\u9762\u677F \u2500\u2500window.__POLARIS_HOST_INVOKE__('router_dispatch', {req:{target,payload}})\u2500\u2500\u25B6 RouterBus(cap.*)\n\u670D\u52A1/MCP \u2500\u2500HTTP POST /api/router-dispatch {req:{target,payload}} + Bearer md5(token)\u2500\u2500\u25B6 \u540C\u4E00\u4E2A RouterBus\n```\n\n- **\u540C\u4E00\u4E2A cap \u603B\u7EBF**\uFF0C\u4E24\u79CD\u8FDB\u5165\u65B9\u5F0F\u3002\u9762\u677F\u8D70\u5BBF\u4E3B\u6CE8\u5165\u7684 invoke \u901A\u9053\uFF08\u684C\u9762\u76F4\u8FDE IPC\uFF0CWeb/\u624B\u673A\u81EA\u52A8\u5E26 token\uFF09\uFF1B\u670D\u52A1/MCP \u8FDB\u7A0B\u8D70 HTTP bridge\u2014\u2014**\u7AEF\u70B9\u4E0D\u6CE8\u5165\uFF0C\u987B\u81EA\u53D1\u73B0**\uFF08\u89C1 `service` \u4E3B\u9898\uFF09\u3002\n- \u6570\u636E\u5171\u4EAB\u8D70 **cap.kv**\uFF08SqliteStorage domain=kv\uFF09\uFF1A\u4E09\u65B9\u8BFB\u5199\u540C\u4E00\u4E2A\u952E\u7A7A\u95F4\uFF0C\u952E\u7A7A\u95F4\u7EAA\u5F8B\u89C1 `keyspace` \u4E3B\u9898\u3002\n- RouterBus \u7684 target \u5C31\u662F cap \u540D\uFF08`cap.kv`\u3001`cap.pluginServiceManager`\u2026\uFF09\uFF0Cpayload \u7B2C\u4E00\u5B57\u6BB5\u662F `action`\u3002\n\n## \u5EFA\u63D2\u4EF6\u7684\u6700\u5C0F\u95ED\u73AF\n\n1. \u5199 `plugin.json`\uFF08\u89C1 `manifest`\uFF09\n2. \u9762\u677F\uFF1A`src/index.tsx` \u9ED8\u8BA4\u5BFC\u51FA\u7EC4\u4EF6 \u2192 esbuild \u51FA `dist/panel.js`\uFF08\u89C1 `panel`\uFF09\n3. \u9700\u8981\u8054\u7F51/\u5B9A\u65F6 \u2192 \u670D\u52A1\u8FDB\u7A0B\uFF08\u89C1 `service`\uFF09\uFF1B\u9700\u8981 AI \u64CD\u4F5C \u2192 MCP server\uFF08\u89C1 `mcp`\uFF09\n4. \u4E09\u65B9\u901A\u8FC7 cap.kv \u952E\u7A7A\u95F4\u534F\u4F5C\uFF08\u5951\u7EA6\u5199\u8FDB README\uFF0C\u89C1 `keyspace`\uFF09\n5. \u9A8C\u8BC1\uFF1A\u5355\u6D4B \u2192 esbuild/tsc \u2192 \u771F\u5B9E\u6865\u5192\u70DF\uFF08\u89C1 `testing`\uFF09\n6. \u6253\u5305\u53D1\u5E03\uFF08\u89C1 `publishing`\uFF09\n\nAI \u5EFA\u63D2\u4EF6\u7684\u5B8C\u6574 SOP \u89C1 `workflow`\u3002\n";

// shared/kb/manifest.md
var manifest_default = '# plugin.json \u6743\u5A01\u89C4\u8303\n\n> \u6838\u5B9E\u57FA\u51C6\uFF1A\u4E3B\u4ED3 `src/plugin-system/schema.ts`\uFF08zod strict\uFF09+ Rust `plugin_service.rs` VALID_PLUGIN_ICONS + \u516D\u4E2A\u5DF2\u4EA4\u4ED8\u63D2\u4EF6\u5B9E\u88C5\u3002**\u4E0E docs/plugin-development-guide.md \u51B2\u7A81\u5904\u4EE5\u672C\u6587\u4E3A\u51C6**\u3002\n\n## \u9876\u5C42\u5B57\u6BB5\n\n| \u5B57\u6BB5 | \u5FC5\u586B | \u8BF4\u660E |\n|---|---|---|\n| `id` | \u2705 | kebab-case\uFF08`/^[a-z][a-z0-9-]*$/`\uFF09\uFF0C\u5168\u5C40\u552F\u4E00\uFF0C\u4E5F\u662F kv \u524D\u7F00\u5EFA\u8BAE\u6765\u6E90 |\n| `name` | \u2705 | \u4E2D\u6587\u77ED\u540D\uFF0C\u5546\u57CE\u5C55\u793A |\n| `version` | \u2705 | semver \u4E09\u6BB5\u5F0F |\n| `description` | \u26A0\uFE0F | \u5546\u57CE\u4E0E AI \u9760\u5B83\u7406\u89E3\u63D2\u4EF6\uFF1B\u5199\u300C\u662F\u4EC0\u4E48 + \u6740\u624B\u950F + \u6570\u636E\u9762\u300D |\n| `enabledByDefault` | \u26A0\uFE0F | \u6CE8\u610F\u4E24\u5C42\u95E8\uFF1A\u9759\u6001\u5F00\u5173 \u2260 \u9762\u677F\u4E00\u5B9A\u53EF\u89C1\uFF0C\u7528\u6237\u8BBE\u7F6E\u91CC\u8FD8\u8981\u5F00 |\n| `contributes` | \u2705 | views / panel / services / mcpServers |\n| `permissions` | \u26A0\uFE0F | **\u5DF2\u77E5\u96C6\u53EA\u6709\u4E24\u4E2A\u952E**\uFF1A`appConfigRead`\u3001`aiToolAccess`\u3002\u5199\u4E86\u522B\u7684\u952E\u4F1A\u88AB\u5FFD\u7565\uFF0C\u522B\u6307\u671B\u751F\u6548 |\n| `origin` | \u26A0\uFE0F | repository / homepage / updateUrl / downloadUrl\uFF08\u53D1\u5E03\u7528\uFF09 |\n\n## contributes.views\uFF08ActivityBar \u5165\u53E3\uFF09\n\n```json\n{\n  "id": "<\u63D2\u4EF6id>.panel",\n  "area": "activityBar",          // \u767D\u540D\u5355\u53EA\u6709\u8FD9\u4E00\u4E2A\u503C\n  "panelType": "<camelCase>",     // \u5BBF\u4E3B\u8DEF\u7531\u7528\n  "icon": "Beaker",               // \u5FC5\u987B\u5728 18 \u503C\u767D\u540D\u5355\u5185\uFF0C\u5426\u5219\u88AB\u62D2\n  "labelKey": "plugins.<camel>",\n  "labelDefault": "\u4E2D\u6587\u540D",\n  "order": 76                     // \u5DF2\u5360\uFF1A15/20/40/50/68/72/73/74/75/76/77/80/85/90\n}\n```\n\n**\u56FE\u6807\u767D\u540D\u5355 18 \u503C**\uFF08\u9010\u5B57\u5BF9\u9F50\uFF0C\u52FF\u81EA\u521B\uFF09\uFF1A\n`Files, GitPullRequest, CheckSquare, Languages, Clock, Target, ClipboardList, Terminal, SquareTerminal, Code2, Bot, BookOpen, AlertCircle, Film, Globe2, Activity, Users, Beaker`\n\n## contributes.panel\n\n```json\n{ "entry": "./dist/panel.js", "supportsFullscreen": true }\n```\n\n## contributes.services\uFF08\u53EF\u9009\uFF09\n\n```json\n{\n  "id": "<id>-service",\n  "type": "http",                       // http | std | worker\n  "command": "node",\n  "argsTemplate": ["{{pluginDir}}/service/main.js", "{{port}}", "{{appConfigDir}}"],\n  "healthCheck": "/__health",           // http \u578B\uFF1A\u4EFB\u610F 2xx \u5224\u6D3B\uFF0C3s \u8D85\u65F6/30s \u5468\u671F/3 \u6B21\u5224\u6B7B\n  "healthCheckTimeout": 5000,\n  "autoStart": true,\n  "restartOnFailure": true,\n  "maxRestarts": 10,\n  "description": "\u2026\u2026\uFF08\u539F\u751F fetch\uFF0C\u65E0\u8DE8\u57DF\u9650\u5236\uFF09"\n}\n```\n\n\u4E09\u4E2A\u5360\u4F4D\u7B26\uFF1A`{{pluginDir}}`\uFF08\u5B89\u88C5\u76EE\u5F55\uFF0C**\u7981\u6B62\u786C\u7F16\u7801\u8DEF\u5F84**\uFF09\u3001`{{port}}`\uFF08\u5BBF\u4E3B\u5206\u914D\u7684\u5065\u5EB7\u7AEF\u70B9\u7AEF\u53E3\uFF09\u3001`{{appConfigDir}}`\uFF08\u5E94\u7528\u914D\u7F6E\u76EE\u5F55\uFF0C\u65E5\u5FD7/\u81EA\u53D1\u73B0\u515C\u5E95\u7528\uFF09\u3002std/worker \u578B\u53EA\u770B\u8FDB\u7A0B\u9000\u51FA\uFF0C\u4E0D\u9700\u8981 `{{port}}`\u3002\n\n## contributes.mcpServers\uFF08\u53EF\u9009\uFF09\n\n```json\n{ "id": "<id>", "transport": "stdio", "command": "node", "argsTemplate": ["{{pluginDir}}/mcp/server.js", "{{appConfigDir}}"] }\n```\n\n\u6709 mcpServers \u5C31\u8981 `permissions.aiToolAccess: true`\u3002\n\n## origin\uFF08\u53D1\u5E03\u7528\uFF09\n\n```json\n{\n  "repository": "https://github.com/<user>/Polaris-plugin",\n  "homepage": "https://github.com/<user>/Polaris-plugin/tree/main/plugins/<id>",\n  "updateUrl": "https://cdn.jsdelivr.net/gh/<user>/Polaris-plugin@main/plugins/<id>/update.json",\n  "downloadUrl": "https://cdn.jsdelivr.net/gh/<user>/Polaris-plugin@main/plugins/<id>/<id>.zip"\n}\n```\n\n**\u5751**\uFF1AURL \u4E00\u5F8B `@main`\u3002publish \u811A\u672C\u4F1A\u628A\u5DF2\u6709\u6761\u76EE\u6539\u5199\u6210 `@<tag>` \u9489\u5B9A\u5730\u5740\uFF0Ctag \u4E0D\u5B58\u5728\u5C31 404\u2014\u2014\u89C1 `publishing`\u3002\n\n\u7528\u63D2\u4EF6\u5DE5\u574A\u7684\u300C\u4F53\u68C0\u300DTab \u6216 MCP `forge_lint` \u5DE5\u5177\u53EF\u5BF9\u4EFB\u610F\u6E05\u5355\u8DD1 20+ \u6761\u5B9E\u6D4B\u89C4\u5219\u3002\n';

// shared/kb/panel.md
var panel_default = "# \u9762\u677F\uFF1A\u6784\u5EFA / \u5165\u53E3 / \u5BBF\u4E3B\u901A\u9053 / capDispatch\n\n## \u6784\u5EFA\uFF08esbuild\uFF0C\u53C2\u6570\u662F\u786C\u7EA6\u675F\uFF09\n\n```bash\nesbuild src/index.tsx --bundle --format=esm --outfile=dist/panel.js \\\n  --jsx=automatic --external:react --external:react/jsx-runtime \\\n  --loader:.md=text --loader:.txt=text   # \u540E\u4E24\u4E2A\u4EC5\u5F53\u5185\u8054\u6587\u672C\u8D44\u6E90\u65F6\u9700\u8981\n```\n\n- **React \u5FC5\u987B external**\u3002\u6587\u6863\u53E6\u4E00\u5904\u8BF4\u300CReact \u6253\u8FDB\u53BB\u300D\u662F**\u9519\u7684**\u2014\u2014\u5BBF\u4E3B\u7ECF blob URL + `__POLARIS_HOST_REACT__` shim \u91CD\u5199 import\uFF0CReact \u6253\u8FDB\u53BB\u4F1A\u76F4\u63A5 Invalid hook call \u767D\u5C4F\u3002\n- `format=esm` \u56FA\u5B9A\u3002\u4EA7\u7269\u8DEF\u5F84\u4E0E manifest `contributes.panel.entry` \u5BF9\u9F50\u3002\n- \u5F00\u53D1\u4F9D\u8D56\u53EA\u9700\uFF1A`esbuild`\u3001`typescript`\u3001`@types/react`\uFF08\u9762\u677F\u96F6\u8FD0\u884C\u65F6\u4F9D\u8D56\uFF09\u3002\n\n## \u5165\u53E3\u7B7E\u540D\n\n```tsx\n// src/index.tsx \u2014\u2014 \u5BBF\u4E3B\u6309 mod.default \u52A0\u8F7D\nexport default function MyPanelEntry(props: {\n  pluginId: string\n  onSendToChat?: (message: string) => void | Promise<void>\n}) {\n  return <MyPanel {...props} />\n}\n```\n\nTab \u7ED3\u6784\u60EF\u4F8B\u89C1 `ui-ux`\u3002\n\n## \u5BBF\u4E3B\u901A\u9053\uFF08\u552F\u4E00\u6570\u636E\u5165\u53E3\uFF09\n\n```ts\ntype HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>\nconst invoke = (window as any).__POLARIS_HOST_INVOKE__   // \u7F3A\u5931 = \u5BBF\u4E3B\u592A\u65E7\uFF0C\u7ED9\u7528\u6237\u660E\u786E\u62A5\u9519\n```\n\n\u684C\u9762 Tauri \u76F4\u8FDE\u540E\u7AEF IPC\uFF1B\u624B\u673A/Web \u81EA\u52A8\u53D6\u6B63\u786E\u670D\u52A1\u5730\u5740\u5E76\u5E26 Bearer token\uFF08Remote \u6E90\uFF09\u3002\u9762\u677F\u81EA\u8EAB**\u7EDD\u4E0D\u76F4\u63A5 fetch \u4EFB\u4F55\u5730\u5740**\u2014\u2014\u89C1 `cross-origin`\u3002\n\n## capDispatch\uFF08\u4E0E\u4E3B\u4ED3 router_dispatch \u5BF9\u9F50\uFF09\n\n```ts\nasync function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {\n  const res = await invoke<{ ok: boolean; result?: T; error?: string }>(\n    'router_dispatch', { req: { target, payload } },\n  )\n  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`)\n  return (res.result ?? {}) as T\n}\n\n// cap.kv \u56DB\u52A8\u4F5C\nconst v  = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })      // r.value ?? null\nawait capDispatch('cap.kv', { action: 'set', key, value })\nawait capDispatch('cap.kv', { action: 'delete', key })\nconst { keys } = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })     // \u5168\u5C40\u6240\u6709\u952E\uFF01\n```\n\n\u670D\u52A1\u7BA1\u7406\uFF1A`cap.pluginServiceManager`\uFF08\u89C1 `service-start`\uFF09\u3001\u63D2\u4EF6\u53D1\u73B0\uFF1A`cap.pluginDiscovery`\u3001HTTP \u8F6C\u53D1\uFF1A`cap.http`\uFF08\u89C1 `cross-origin`\uFF09\u3002\u5B8C\u6574 payload \u901F\u67E5\u89C1 `caps`\u3002\n\n## \u5E38\u89C1\u6B7B\u6CD5\n\n| \u75C7\u72B6 | \u6839\u56E0 |\n|---|---|\n| Invalid hook call \u767D\u5C4F | React \u6CA1\u52A0 `--external` |\n| \u9762\u677F\u8BF7\u6C42\u6D4F\u89C8\u5668\u62A5 CORS / Mixed Content | \u9762\u677F\u76F4\u63A5 fetch \u4E86\u5916\u7F51\uFF08\u5E94\u8D70\u670D\u52A1\u6216 cap.http\uFF09 |\n| invoke is not a function | \u72EC\u7ACB\u6D4F\u89C8\u5668\u8C03\u8BD5\u65E0\u5BBF\u4E3B\u901A\u9053\uFF1B\u505A\u73AF\u5883\u63A2\u6D4B + \u56DE\u9000 UI |\n| \u684C\u9762\u597D\u7684\u624B\u673A\u4E0D\u884C | \u7528\u4E86\u684C\u9762\u4E13\u5C5E\u901A\u9053\uFF08\u5982 cap.http \u9ED8\u8BA4\u5BF9 Remote \u6E90 deny\uFF09\uFF1B\u6570\u636E\u9762\u6539\u8D70 cap.kv |\n";

// shared/kb/cross-origin.md
var cross_origin_default = "# \u8DE8\u57DF\u6CBB\u7406\u4E09\u5C42\u65B9\u6848\uFF08\u6700\u91CD\u8981\u7684\u4E00\u8BFE\uFF09\n\n\u6D4F\u89C8\u5668\u540C\u6E90\u7B56\u7565\uFF08CORS/\u6DF7\u5408\u5185\u5BB9/\u7981\u53D1\u5934\uFF09\u662F\u63D2\u4EF6\u5E73\u53F0\u7684\u7B2C\u4E00\u6740\u624B\u3002**\u9762\u677F\u662F\u6D4F\u89C8\u5668\u73AF\u5883\uFF0C\u6C38\u8FDC\u4E0D\u8981\u8BA9\u5B83\u76F4\u63A5 fetch \u5916\u7F51\u3002** \u5B9E\u6218\u91CC\u9A8C\u8BC1\u8FC7\u7684\u4E09\u5C42\u89E3\u6CD5\uFF0C\u6309\u4F18\u5148\u7EA7\uFF1A\n\n## \u7B2C 1 \u5C42\uFF1A\u6570\u636E\u9762 \u2192 cap.kv\uFF08\u8DE8\u7AEF\u901A\u7528\uFF0C\u96F6\u6210\u672C\uFF09\n\n\u9762\u677F/MCP/\u670D\u52A1\u4E09\u65B9\u5171\u4EAB\u7684\u952E\u503C\u5E93\uFF0C\u5BBF\u4E3B\u4EE3\u7406\u8F6C\u53D1\uFF0C\u5929\u7136\u65E0\u8DE8\u57DF\u3002**\u4E00\u5207\u72B6\u6001\u3001\u914D\u7F6E\u3001\u6761\u76EE\u3001\u7ED3\u679C\u90FD\u653E kv**\uFF0C\u8DE8\u7AEF\uFF08\u684C\u9762/\u624B\u673A/Web\uFF09\u81EA\u52A8\u4E00\u81F4\u3002\n\n## \u7B2C 2 \u5C42\uFF1A\u6293\u53D6\u9762\u4E0B\u6C89\u670D\u52A1\u539F\u751F fetch\uFF08\u8DE8\u7AEF\u901A\u7528\u7684\u6839\u6CBB\u70B9\uFF09\n\n\u670D\u52A1\u662F node \u8FDB\u7A0B\uFF0C`fetch` \u4E0D\u53D7\u6D4F\u89C8\u5668\u540C\u6E90\u7B56\u7565\u7BA1\u3002\u6A21\u5F0F\uFF08clip-relay/page-sentinel \u9A8C\u8BC1\uFF09\uFF1A\n\n```\n\u9762\u677F\u5199\u547D\u4EE4\u952E/\u6761\u76EE(kv) \u2192 \u670D\u52A1 tick \u626B\u63CF \u2192 \u539F\u751F fetch \u5916\u7F51 \u2192 \u7ED3\u679C\u56DE\u5199 kv \u2192 \u9762\u677F\u8F6E\u8BE2\u8BFB\n```\n\n\u670D\u52A1 fetch \u5FC5\u5E26 SSRF \u5B88\u536B\uFF1A\u53EA\u6293\u516C\u7F51 http(s)\uFF0C\u62D2 `127.*`/`10.*`/`172.16-31.*`/`192.168.*`/`169.254.*`\uFF08\u4E91\u5143\u6570\u636E\uFF09/`0.0.0.0`/localhost/`.local`/`file:`/`javascript:`\u2014\u2014\u6761\u76EE\u5185\u5BB9\u4EFB\u4F55\u7AEF\u90FD\u53EF\u5199\uFF0C\u4E0D\u80FD\u8BA9\u300C\u63A8\u4E00\u6761\u94FE\u63A5\u300D\u53D8\u6210\u5BF9 localhost \u7684\u63A2\u6D4B\u3002\u5B8C\u6574\u5B88\u536B\u53C2\u8003 clip-relay `service/lib.js` \u7684 `isFetchableUrl`\uFF08**\u6539\u52A8\u5FC5\u987B\u4FDD\u7559**\uFF09\u3002\n\nNode 18+ fetch \u5751\uFF1A`res.body` \u662F web ReadableStream **\u6CA1\u6709 `.on`**\uFF0C\u987B `getReader()` \u5FAA\u73AF\u8BFB\uFF0C\u8D85\u9650 `reader.cancel()`\uFF08\u89C1 `pitfalls`\uFF09\u3002\n\n## \u7B2C 3 \u5C42\uFF1A\u9762\u677F\u8D70 cap.http \u8F6C\u53D1\uFF08\u684C\u9762\u4E13\u7528\uFF0C\u6709 Remote \u9677\u9631\uFF09\n\n\u5BBF\u4E3B RouterBus \u7684 `cap.http` \u7531\u540E\u7AEF reqwest \u8F6C\u53D1\uFF0C\u540C\u6837\u7ED5\u5F00 CORS/\u6DF7\u5408\u5185\u5BB9/\u7981\u53D1\u5934\uFF1A\n\n```ts\n// relay-devkit src/core/cap-http.js \u9A8C\u8BC1\u8FC7\u7684\u5951\u7EA6\nawait invoke('router_dispatch', { req: { target: 'cap.http', payload: {\n  action: 'request', method, url, headers, body, bodyType: 'text', timeoutMs: 20000,\n}}})\n// \u2192 { status, statusText, ok, contentType, headers, body, isBase64, url, timeMs }\n```\n\n**\u81F4\u547D\u9677\u9631**\uFF1Acap.http \u5BF9 **Remote \u6E90\uFF08Web/\u624B\u673A\u6D4F\u89C8\u5668\uFF09\u9ED8\u8BA4 deny**\uFF0C\u684C\u9762 Bootstrap \u653E\u884C\uFF08\u5B9E\u6D4B\u8BB0\u5F55\uFF09\u3002\u6240\u4EE5 cap.http \u53EA\u80FD\u5F53\u684C\u9762\u52A0\u901F\u8DEF\u5F84\uFF0C**\u8DE8\u7AEF\u63D2\u4EF6\u4E0D\u80FD\u4F9D\u8D56\u5B83**\u2014\u2014\u4E3B\u8DEF\u5F84\u6C38\u8FDC\u662F\u7B2C 1/2 \u5C42\u3002image-recognition/agnes/mimo-tts \u7684\u300C\u9762\u677F API \u6539\u9053 cap.http\u300D\u5373\u6B64\u6A21\u5F0F\u7684\u6279\u91CF\u5E94\u7528\u3002\n\n## \u51B3\u7B56\u8868\n\n| \u9700\u6C42 | \u65B9\u6848 |\n|---|---|\n| \u8BFB\u5199\u72B6\u6001/\u6761\u76EE/\u7ED3\u679C | cap.kv\uFF08\u4E09\u5C42\u901A\u7528\uFF09 |\n| \u6293\u7F51\u9875/\u8C03\u5916\u90E8 API\uFF08\u8DE8\u7AEF\uFF09 | \u670D\u52A1\u539F\u751F fetch + SSRF \u5B88\u536B |\n| \u6293\u7F51\u9875/\u8C03\u5916\u90E8 API\uFF08\u4EC5\u684C\u9762\u53EF\u63A5\u53D7\uFF09 | \u9762\u677F cap.http \u8F6C\u53D1 |\n| \u672C\u5730\u6587\u4EF6\u8BFB\u53D6 | \u9762\u677F `<input type=file>` FileReader\uFF08\u672C\u5730\u6587\u4EF6\u4E0D\u7ECF CORS\uFF09\uFF1B\u6216\u670D\u52A1/MCP \u8FDB\u7A0B\u6309\u8DEF\u5F84 fs \u8BFB |\n";

// shared/kb/service.md
var service_default = "# \u670D\u52A1\u8FDB\u7A0B\uFF1A\u6865\u81EA\u53D1\u73B0 + \u751F\u547D\u5468\u671F + \u65E5\u5FD7\n\n## \u7AEF\u70B9\u81EA\u53D1\u73B0\uFF08\u5E73\u53F0\u4E0D\u6CE8\u5165\u4EFB\u4F55\u73AF\u5883\u53D8\u91CF\uFF01\uFF09\n\n\u5B98\u65B9\u6587\u6863\u8BF4\u7684 `POLARIS_HOST/PORT/TOKEN` \u73AF\u5883\u53D8\u91CF**\u4E0D\u5B58\u5728**\uFF08\u5B9E\u6D4B\uFF09\u3002\u670D\u52A1/MCP \u8FDB\u7A0B\u81EA\u5DF1\u5B9A\u4F4D\u5BBF\u4E3B HTTP bridge\uFF08\u5DF2\u9A8C\u8BC1\u6837\u677F\uFF1Apage-sentinel/clip-relay/pocket-host \u7684 `service/kvclient.js`\uFF0C\u63D2\u4EF6\u5DE5\u574A\u811A\u624B\u67B6\u81EA\u5E26\u5168\u6587\uFF09\uFF1A\n\n```\n1. env POLARIS_HOST/PORT/TOKEN\uFF08\u82E5\u672A\u6765\u5BBF\u4E3B\u6CE8\u5165\u5219\u4F18\u5148\u751F\u6548\u2014\u2014\u7559\u8FD9\u4E2A\u5206\u652F\uFF09\n2. anchor.json \u2192 dataRoot/config.json \u53D6 web.port/token\n   anchor \u5019\u9009\uFF1A%APPDATA%/Polaris/anchor.json\u3001~/.config/Polaris/anchor.json\u3001~/.polaris/anchor.json\n   config \u515C\u5E95\uFF1AappConfigDir/config.json\u3001%APPDATA%/Polaris/config.json\u2026\u2026\n3. \u4ECE config \u7AEF\u53E3\u5411\u4E0A\u626B 25 \u4E2A\uFF1AGET /api/health 200 \u5373\u547D\u4E2D\n\u9274\u6743\uFF1AAuthorization: Bearer md5(web.token)\n```\n\n\u8C03\u7528\uFF1A`POST /api/router-dispatch`\uFF0Cbody `{ req: { target, payload } }`\uFF0C\u8FD4\u56DE `{ ok, result, error }`\u3002\u5199\u64CD\u4F5C\u91CD\u8BD5 \u22642 \u6B21\u6307\u6570\u9000\u907F\u662F\u5B89\u5168\u7684\uFF08\u5BBF\u4E3B\u4FA7\u5355\u547D\u4EE4\u539F\u5B50\uFF09\uFF1B\u8BFB\u64CD\u4F5C\u4EFB\u610F\u91CD\u8BD5\u3002\n\n**\u964D\u7EA7\u8BED\u4E49**\uFF1Abridge \u4E0D\u53EF\u8FBE\u65F6 tick \u8FDB\u964D\u7EA7\uFF08\u5065\u5EB7\u7AEF\u70B9\u4ECD 200\uFF0Cmeta \u91CC\u6807 degraded\uFF09\uFF0C\u6BCF 60s \u5237\u65B0\u4E00\u6B21\u7AEF\u70B9\uFF0C\u522B\u628A\u81EA\u5DF1\u997F\u6B7B\u2014\u2014\u5BBF\u4E3B 3 \u6B21\u5065\u5EB7\u68C0\u67E5\u5224\u6B7B\u540E\u4F1A\u91CD\u542F\u4F60\uFF08\u89C1\u4E0B\uFF09\u3002\n\n## \u5065\u5EB7\u68C0\u67E5\u8BED\u4E49\uFF08type=http\uFF0C\u5B9E\u6D4B\uFF09\n\n- \u5224\u6D3B\uFF1A\u4EFB\u610F 2xx\uFF1B\u9ED8\u8BA4\u8D85\u65F6 3s\uFF1B\u68C0\u67E5\u5468\u671F 30s\uFF1B**\u8FDE\u7EED 3 \u6B21\u5931\u8D25\u5224\u6B7B** \u2192 \u6309 `restartOnFailure`/`maxRestarts` \u91CD\u542F\u3002\n- `process.send({type:'ready'})` **\u65E0\u6D88\u8D39\u8005**\uFF08\u6587\u6863\u9A97\u4EBA\uFF09\uFF0C\u4E0D\u7528\u5B9E\u73B0\u3002\n- \u670D\u52A1\u4EE3\u7801\u9AA8\u67B6\uFF1A`/__health` \u6052 200\uFF08\u54EA\u6015 bridge \u6302\u4E86\uFF09\uFF0C\u771F\u5B9E\u5065\u5EB7\u5EA6\u5199 `meta` \u5FC3\u8DF3\u952E\u7ED9\u9762\u677F\u5C55\u793A\u3002\n- std/worker \u578B\uFF1A\u53EA\u770B\u8FDB\u7A0B\u9000\u51FA\uFF0C\u522B\u7ED9\u5B83\u914D http \u5065\u5EB7\u68C0\u67E5\u3002\n\n## tick \u4E3B\u5FAA\u73AF\u6A21\u5F0F\uFF08clip-relay \u9A8C\u8BC1\uFF09\n\n```\nsetInterval(tick, 4000)\uFF1A\n  1. \u6BCF 30s \u91CD\u8BFB settings \u952E\uFF08\u70ED\u66F4\u65B0\u914D\u7F6E\uFF09\n  2. kvKeys() \u626B\u81EA\u5DF1\u7684\u524D\u7F00 \u2192 \u53D1\u73B0\u65B0\u5DE5\u4F5C + \u5224\u5B9A\u662F\u5426\u9700\u8981\u7ACB\u5373\u6E05\u626B\uFF0815s \u8282\u6D41\uFF09\n  3. \u6D88\u8D39\u547D\u4EE4\u952E\uFF08\u5148\u5220\u540E\u505A\uFF0C\u89C1 single-writer\uFF09\n  4. \u6BCF\u5468\u671F\u505A\u5468\u671F\u6027\u5DE5\u4F5C\uFF08enrich/\u68C0\u67E5/\u6E05\u7406\uFF0C\u793C\u8C8C\u9650\u901F\uFF09\n  5. \u6BCF 60s \u5199 meta \u5FC3\u8DF3 { version, pid, startedAt, lastTickAt, bridge, degraded, settings }\n```\n\n## \u65E5\u5FD7\uFF1A\u5BBF\u4E3B\u4E0D\u6536\u96C6 stdout/stderr\uFF01\n\n\u5BBF\u4E3B**\u6CA1\u6709**\u63D2\u4EF6\u670D\u52A1\u65E5\u5FD7 API\uFF08\u6587\u6863\u7684 `__POLARIS_PLUGIN_SERVICES__` \u672A\u5B9E\u73B0\uFF09\u3002\u81EA\u843D\u76D8\uFF1A\n\n```js\n// <appConfigDir>/<id>.log\uFF0C\u8D85 512KB \u8F6E\u8F6C\u6210 .old\uFF1Bdebug \u7EA7\u4E0D\u843D\u76D8\nfs.appendFileSync(logFile, `[<id>:${level}] ${new Date().toISOString()} ${msg}\\n`)\n```\n\n\u65E5\u5FD7\u662F\u6392\u969C\u552F\u4E00\u624B\u6BB5\u2014\u2014\u628A\u300C\u81EA\u53D1\u73B0\u547D\u4E2D\u7AEF\u53E3 via scan/env\u300D\u300C\u6BCF\u6B21\u5224\u6B7B\u7684\u9519\u8BEF\u300D\u90FD\u5199\u8FDB\u53BB\u3002\n";

// shared/kb/service-start.md
var service_start_default = "# \u9762\u677F\u81EA\u4E3E\u670D\u52A1 start\uFF08discover + contribution\uFF09\n\n\u670D\u52A1\u4E00\u822C\u9760 `autoStart:true` \u81EA\u52A8\u62C9\u8D77\u3002\u4F46\u9700\u8981\u9762\u677F\u624B\u52A8 start/restart\uFF08\u6BD4\u5982\u88C5\u5B8C\u63D2\u4EF6\u3001\u6216\u670D\u52A1\u88AB\u5224\u6B7B\u540E\uFF09\u65F6\u6709\u4E2A\u5927\u5751\uFF1A\n\n**`cap.pluginServiceManager` \u7684 `start` \u52A8\u4F5C\u5FC5\u987B\u5E26 `installPath` + `contribution`**\uFF0C\u53EA\u4F20 pluginId/serviceId \u4F1A\u5931\u8D25\uFF08stop/restart \u53EA\u9700\u540E\u8005\uFF09\u3002\u9762\u677F\u4E0D\u77E5\u9053\u81EA\u5DF1\u88C5\u5728\u54EA\uFF0C\u6240\u4EE5\u8981\u7ECF\u63D2\u4EF6\u53D1\u73B0\u81EA\u4E3E\uFF08page-sentinel `src/model.ts` \u9A8C\u8BC1\u8FC7\u7684\u5B8C\u6574\u4EE3\u7801\uFF09\uFF1A\n\n```ts\n// \u2460 \u5217\u72B6\u6001\uFF08\u6CE8\u610F\uFF1Alist_status \u65E0\u53C2\uFF0C\u8FD4\u56DE\u88F8\u6570\u7EC4\uFF09\nconst st = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })\n\n// \u2461 \u4ECE\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u81EA\u5DF1\uFF1A\u62FF installPath \u4E0E\u670D\u52A1\u8D21\u732E\nconst r = await capDispatch<{ plugins?: Array<{\n  id: string; installPath: string\n  contributes?: { services?: Record<string, unknown>[] }\n}> }>('cap.pluginDiscovery', { action: 'discover' })\nconst self = (r.plugins ?? []).find((p) => p.id === PLUGIN_ID)\nconst svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID)\n\n// \u2462 start \u5FC5\u987B\u6309\u540E\u7AEF toBackendContribution \u5F62\u6001\u4F20\u8D21\u732E\uFF08\u7F3A\u5B57\u6BB5=\u542F\u52A8\u5931\u8D25\uFF09\nawait capDispatch('cap.pluginServiceManager', {\n  action: 'start', pluginId: PLUGIN_ID,\n  installPath: self.installPath,\n  contribution: {\n    id: svc.id,\n    type: svc.type ?? svc.serviceType,\n    command: svc.command,\n    argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],\n    port: svc.port ?? null,\n    healthCheck: svc.healthCheck ?? null,\n    healthCheckTimeout: svc.healthCheckTimeout ?? null,\n    autoStart: svc.autoStart ?? true,\n    restartOnFailure: svc.restartOnFailure ?? true,\n    maxRestarts: svc.maxRestarts ?? 3,\n    description: svc.description ?? null,\n  },\n})\n\n// stop / restart \u53EA\u9700\uFF1A\nawait capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })\n```\n\n**\u5386\u53F2\u5751**\uFF1A\u8001\u6587\u6863\u6559\u7684 `plugin_service_*` Tauri \u547D\u4EE4**\u5DF2\u5220\u9664**\uFF08\u4E3B\u4ED3 main.tsx \u7684 HOST_INVOKE_ALLOWLIST \u91CC\u8FD8\u6709\u6B8B\u7559\u6761\u76EE\uFF0C\u522B\u88AB\u8BEF\u5BFC\uFF09\u3002\u9762\u677F\u4E00\u5F8B\u8D70 `router_dispatch \u2192 cap.pluginServiceManager`\u3002\n\n\u9762\u677F\u8BBE\u7F6E\u9875\u7684\u670D\u52A1\u7BA1\u7406\u5361\uFF1A\u663E\u793A list_status \u91CC\u81EA\u5DF1\u670D\u52A1\u7684 running/stopped\u3001\u6700\u8FD1\u9519\u8BEF\uFF0C\u7ED9 start/stop/restart \u4E09\u94AE\uFF08start \u8D70\u4E0A\u9762\u4E09\u6B65\uFF09\u3002\n";

// shared/kb/single-writer.md
var single_writer_default = '# \u5355\u5199\u8005\u4E0E\u5E42\u7B49\u7EAA\u5F8B\n\n\u63D2\u4EF6\u5E73\u53F0\u4E09\u7AEF\u5E76\u53D1\u5199\u540C\u4E00\u4E2A cap.kv\uFF08\u9762\u677F + \u670D\u52A1 + MCP + \u591A\u8BBE\u5907\u540C\u8D26\u53F7\uFF09\uFF0C\u6CA1\u6709\u4E8B\u52A1\u3001\u6CA1\u6709 CAS\u3002**\u6240\u6709\u7ADE\u6001\u5FC5\u987B\u9760\u952E\u7A7A\u95F4\u5951\u7EA6\u6D88\u706D\uFF0C\u800C\u4E0D\u662F\u9760\u8FD0\u6C14\u3002** \u5DF2\u9A8C\u8BC1\u7684\u4E24\u5957\u6A21\u5F0F\uFF1A\n\n## \u6A21\u5F0F\u4E00\uFF1A\u5355\u5199\u8005 + \u547D\u4EE4\u901A\u9053\uFF08\u63A8\u8350\uFF0Cpage-sentinel/clip-relay/data-ark \u9A8C\u8BC1\uFF09\n\n\u6BCF\u4E2A\u952E\u7A7A\u95F4\u6307\u5B9A**\u552F\u4E00\u5199\u8005**\uFF08\u901A\u5E38\u662F\u670D\u52A1\u8FDB\u7A0B\uFF09\uFF0C\u5176\u4ED6\u7AEF\u53EA\u80FD\uFF1A\n\n- \u5199\u300C\u547D\u4EE4\u952E\u300D\u8868\u8FBE\u610F\u56FE\uFF1A`<prefix>.cmd.<op>.<nonce> = { op, ..., at }`\n- \u8BFB\u300C\u7ED3\u679C\u952E\u300D\u62FF\u4EA7\u51FA\uFF1A`<prefix>.result.<nonce>`\n\n```\n\u9762\u677F/MCP                     \u670D\u52A1\uFF08\u552F\u4E00\u5199\u8005\uFF09\n   \u2502 \u5199 cmd.check.<id>          \u2502\n   \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u25B6\u2502 tick \u626B\u5230\u547D\u4EE4\u952E\n   \u2502                            \u2502 \u2460 \u5148\u5220\u547D\u4EE4\u952E\uFF08\u5148\u5220\u540E\u505A\uFF01\u9632\u91CD\u590D\u6D88\u8D39\uFF09\n   \u2502                            \u2502 \u2461 \u6267\u884C\n   \u2502  \u8F6E\u8BE2\u8BFB state/result        \u2502 \u2462 \u5199\u7ED3\u679C/\u72B6\u6001\u952E\n   \u2502\u25C0\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524\n```\n\n**\u300C\u5148\u5220\u540E\u505A\u300D\u662F\u5E42\u7B49\u6838\u5FC3**\uFF1A\u5148 `kvDel` \u6210\u529F\u540E\u624D\u6267\u884C\u3002\u4E24\u4E2A\u6D88\u8D39\u8005\u540C\u65F6\u626B\u5230\u540C\u4E00\u547D\u4EE4\u952E\u65F6\uFF0Ckv delete \u5929\u7136\u4E92\u65A5\uFF08\u540E\u5220\u8005\u5931\u8D25\uFF09\uFF0C\u6267\u884C\u81F3\u591A\u4E00\u6B21\u3002\n\n**\u9762\u677F\u8F6E\u8BE2\u6CE8\u610F**\uFF1A1200ms \u95F4\u9694 + 30s deadline + \u8D85\u65F6\u7ED9\u660E\u786E\u6307\u5F15\uFF08\u300C\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF0C\u53BB\u8BBE\u7F6E\u9875\u770B\u300D\uFF09\u3002\u7EDD\u4E0D\u5EFA\u8BAE\u9762\u677F\u957F\u8F6E\u8BE2\u9AD8\u9891\u952E\u2014\u2014\u6BCF\u79D2\u5168\u91CF `list` \u4F1A\u62D6\u57AE\u5168\u5C40\u3002\n\n## \u6A21\u5F0F\u4E8C\uFF1A\u591A\u65B9\u5199\u4E0D\u540C\u952E + id \u5E42\u7B49\uFF08pocket-ledger \u9A8C\u8BC1\uFF09\n\n\u6CA1\u6709\u670D\u52A1\u8FDB\u7A0B\u65F6\uFF08\u7EAF\u9762\u677F+MCP\uFF09\uFF0C\u5141\u8BB8\u591A\u65B9\u5199**\u5404\u81EA\u72EC\u7ACB**\u7684\u952E\uFF1B\u540C\u4E00\u5B9E\u4F53\u952E\uFF08\u5982\u8D26\u5355\uFF09\u4EE5\u5185\u5BB9 id \u4E3A\u4E3B\u952E\uFF0C\u53CC\u7AEF\u5E76\u53D1\u5199\u540C id \u4EA7\u751F\u76F8\u540C\u5185\u5BB9\uFF08\u5E42\u7B49\uFF09\uFF0C\u51B2\u7A81\u65E0\u5BB3\u3002\u9002\u7528\u300C\u5199\u64CD\u4F5C\u5929\u7136\u5E26\u552F\u4E00 id\u300D\u7684\u573A\u666F\u3002\n\n## \u5927\u53D8\u66F4\uFF1A\u79DF\u7EA6 + \u539F\u5B50\u843D\u76D8\uFF08data-ark \u9A8C\u8BC1\uFF0C\u91CD\u6D3B\u5FC5\u7528\uFF09\n\n- **kv \u79DF\u7EA6**\uFF1A`{ holder, expiresAt }`\uFF0CTTL 90s / 30s \u7EED\u79DF\u3002\u6301\u79DF\u8005\u624D\u80FD\u505A\u91CD\u6D3B\uFF1B\u79DF\u7EA6\u8FC7\u671F\u522B\u7684\u8FDB\u7A0B\u53EF\u62A2\u3002\u89E3\u51B3\u300C\u4E24\u4E2A\u670D\u52A1\u5B9E\u4F8B\u540C\u65F6\u8DD1\u5927\u4EFB\u52A1\u300D\u3002\n- **\u7ED3\u679C\u6587\u4EF6\u539F\u5B50\u5199**\uFF1A\u5148\u5199 `<file>.tmp` \u518D `fs.renameSync`\uFF08\u540C\u76D8 rename \u539F\u5B50\uFF09\uFF0Cmanifest \u7C7B"\u7D22\u5F15"\u6700\u540E\u5199\u2014\u2014\u5D29\u6E83\u540E\u8981\u4E48\u5B8C\u6574\u8981\u4E48\u6CA1\u6709\u3002\n- **\u9519\u8FC7\u8C03\u5EA6\u53EA\u8865\u4E00\u6B21**\uFF1A\u670D\u52A1\u91CD\u542F\u540E\u53D1\u73B0\u9519\u8FC7\u5468\u671F\u4EFB\u52A1\uFF0C\u53EA\u8865\u6700\u8FD1\u4E00\u6B21\uFF0C\u4E0D\u56DE\u653E\u5386\u53F2\uFF08\u9632\u6B62\u8865\u98CE\u66B4\uFF09\u3002\n\n## \u7981\u6B62\u6E05\u5355\n\n- \u274C \u7528 setTimeout/\u8D85\u65F6"\u89E3\u51B3"\u540C\u6B65\u95EE\u9898\u2014\u2014\u8D85\u65F6\u63A9\u76D6\u7ADE\u6001\uFF0C\u7ADE\u6001\u8FD8\u5728\n- \u274C \u9762\u677F\u548C\u670D\u52A1\u540C\u65F6\u5199\u540C\u4E00\u4E2A\u952E\uFF08\u6CA1\u6709 CAS\uFF0C\u540E\u5199\u8986\u76D6\u5148\u5199\uFF09\n- \u274C \u547D\u4EE4\u952E\u300C\u8BFB\u5B8C\u518D\u5220\u300D\u2014\u2014\u4E24\u4E2A\u6D88\u8D39\u8005\u90FD\u8BFB\u5230\uFF0C\u53CC\u6267\u884C\n- \u274C \u5047\u8BBE kv list \u548C get \u4E4B\u95F4\u6570\u636E\u6CA1\u53D8\u2014\u2014\u8BFB\u5230\u7684\u952E\u53EF\u80FD\u5DF2\u88AB\u5220\uFF0C**\u6240\u6709 get \u90FD\u8981 `.catch(() => null)` \u5E76\u5BB9\u5FCD null**\n';

// shared/kb/keyspace.md
var keyspace_default = "# cap.kv \u952E\u7A7A\u95F4\u7EAA\u5F8B\n\ncap.kv \u662F SqliteStorage \u7684 kv domain\uFF0C**\u6240\u6709\u63D2\u4EF6\u5171\u4EAB\u4E00\u4E2A\u952E\u7A7A\u95F4**\uFF1A`list` \u52A8\u4F5C\u8FD4\u56DE\u5168\u90E8\u952E\uFF08\u4E0D\u5206\u63D2\u4EF6\u3001\u65E0\u524D\u7F00\u8FC7\u6EE4\u53C2\u6570\uFF09\u3002\u8FD9\u662F\u8BBE\u8BA1\u4E5F\u662F\u7EA6\u675F\u3002\n\n## \u4E09\u6761\u94C1\u5F8B\n\n1. **\u952E\u5FC5\u5E26\u524D\u7F00**\uFF1A`<prefix>.<\u8BED\u4E49>`\u3002\u524D\u7F00\u5EFA\u8BAE = \u63D2\u4EF6 id \u53BB\u8FDE\u5B57\u7B26\uFF08`pocket-host` \u2192 `hostmon.` \u4E5F\u53EF\u81EA\u5B9A\u77ED\u524D\u7F00\uFF09\u3002\u65E0\u524D\u7F00 = \u6C61\u67D3\u4ED6\u4EBA + \u88AB\u4ED6\u4EBA\u6C61\u67D3 + \u4F60\u81EA\u5DF1\u7684\u6E05\u626B\u903B\u8F91\u8BEF\u5220\u522B\u4EBA\u3002\n2. **\u952E\u6570\u8981\u7701**\uFF1A`list` \u662F\u5168\u5C40\u7684\uFF0C\u952E\u8D8A\u591A\u6240\u6709\u63D2\u4EF6\u90FD\u53D8\u6162\u3002**\u4E00\u952E\u4E00\u5B9E\u4F53\u662F\u53CD\u6A21\u5F0F**\u2014\u20141000 \u4E2A\u4E66\u7B7E\u5199 1000 \u4E2A\u952E\u4F1A\u628A\u5168\u5C40 list \u62D6\u57AE\u3002\u5206\u5757\uFF1A`bmd.rec.0..N` \u6BCF\u5757 200 \u6761\u6570\u7EC4 + `bmd.idx` \u7D22\u5F15\u3002\n3. **README \u5199\u6743\u5A01\u952E\u8868**\uFF1A\u952E\u7A7A\u95F4\u5951\u7EA6\u662F\u4E09\u65B9\uFF08\u9762\u677F/\u670D\u52A1/MCP\uFF09\u534F\u4F5C\u7684\u552F\u4E00\u4F9D\u636E\uFF0C\u6837\u4F8B\uFF1A\n\n```markdown\n## \u952E\u7A7A\u95F4\u5951\u7EA6\uFF08\u6743\u5A01\uFF09\n<id>.settings        \u5168\u5C40\u8BBE\u7F6E\uFF08\u9762\u677F/MCP \u5199\uFF0C\u670D\u52A1\u8BFB\uFF09\n<id>.meta            \u670D\u52A1\u5FC3\u8DF3\uFF08\u670D\u52A1\u5199\uFF09\n<id>.cmd.<op>.<nonce> \u547D\u4EE4\u952E\uFF08\u9762\u677F/MCP \u5199\uFF0C\u670D\u52A1\u6D88\u8D39=\u5148\u5220\u540E\u505A\uFF09\n<id>.rec.<n>         \u8BB0\u5F55\u5206\u5757\u6570\u7EC4\uFF08\u670D\u52A1\u5355\u5199\u8005\uFF09\n```\n\n## \u8BFB\u5199\u7EC6\u8282\uFF08\u5168\u90E8\u5B9E\u6D4B\uFF09\n\n- `get` \u4E0D\u5B58\u5728\u7684\u952E\uFF1A`{ ok: true, result: {} }`\uFF0C`value` \u5B57\u6BB5\u7F3A\u7701 \u2192 \u4E1A\u52A1\u5C42\u5F52\u4E00\u4E3A `null`\u3002\n- **\u6240\u6709 get \u90FD\u5305 `.catch(() => null)`**\u2014\u2014\u8BFB\u5230\u7684 key \u53EF\u80FD\u521A\u88AB\u5E76\u53D1\u5220\u6389\u3002\n- `set` \u7684 value \u76F4\u63A5\u662F JSON \u5BF9\u8C61\uFF08\u5BBF\u4E3B\u5E8F\u5217\u5316\uFF09\uFF0C\u5355\u503C\u5EFA\u8BAE \u2264256KB\uFF08\u5206\u5757\u9608\u503C\u6309\u6B64\u4F30\uFF09\u3002\n- \u6CA1\u6709 TTL\u3001\u6CA1\u6709 CAS\u3001\u6CA1\u6709\u6279\u91CF\u63A5\u53E3\u3002TTL \u8BED\u4E49\u81EA\u5DF1\u505A\uFF08\u503C\u91CC\u5B58 `expiresAt`\uFF0C\u8BFB\u65F6\u5224\uFF09\u3002\n\n## \u6E05\u626B\u4E0E\u9632\u8BEF\u4F24\n\n- \u81EA\u5DF1\u524D\u7F00\u7684\u952E\u624D\u53EF\u5220\u3002\u6279\u91CF\u5220\u9664\u524D\u518D filter \u4E00\u6B21\u524D\u7F00\uFF08`keys.filter(k => k.startsWith(PREFIX))`\uFF09\uFF0C\u5192\u70DF\u811A\u672C\u6E05\u573A\u540C\u89C4\u5219\u3002\n- \u5192\u70DF\u62A4\u680F\uFF1A**\u771F\u5B9E\u73AF\u5883 kv \u91CC\u5DF2\u6709\u672C\u63D2\u4EF6\u4E1A\u52A1\u952E\u65F6\u62D2\u8DD1**\uFF08\u5982 `bmd.rec.*` \u5B58\u5728\u5373\u4E2D\u6B62\uFF09\uFF0C\u9632\u5192\u70DF\u6BC1\u751F\u4EA7\u6570\u636E\uFF08memoryforge \u5148\u4F8B\uFF09\u3002\u6D4B\u8BD5\u6570\u636E\u7528\u72EC\u7ACB\u5B50\u524D\u7F00\uFF08`<prefix>.smoke.*`\uFF09\u5E76 100% \u6E05\u7406\u3002\n";

// shared/kb/mcp.md
var mcp_default = "# MCP server \u6700\u5C0F\u5B9E\u73B0\u4E0E\u5DE5\u5177\u8BBE\u8BA1\n\nMCP server \u662F\u72EC\u7ACB node \u8FDB\u7A0B\uFF08stdio JSON-RPC\uFF09\uFF0C\u628A AI \u7684 tools/call \u7FFB\u8BD1\u6210\u5BF9 cap.kv / \u672C\u5730\u8D44\u6E90\u7684\u64CD\u4F5C\u3002\u5BBF\u4E3B\u7ECF manifest \u7684 `contributes.mcpServers` \u62C9\u8D77\uFF0CAI \u4FA7\u8981\u91CD\u8FDE/\u91CD\u542F\u5E94\u7528\u540E\u624D\u80FD\u770B\u5230\u65B0\u5DE5\u5177\u3002\n\n## \u534F\u8BAE\u6700\u5C0F\u5B9E\u73B0\uFF082024-11-05\uFF0C\u96F6\u4F9D\u8D56\uFF0C\u5168\u90E8\u5DF2\u9A8C\u8BC1\uFF09\n\n```js\n// stdin \u6309\u884C\u8BFB JSON-RPC\uFF0Cstdout \u5199\u54CD\u5E94\uFF08\u534F\u8BAE\u6570\u636E\u53EA\u8D70 stdout\uFF0C\u65E5\u5FD7\u5168\u8D70 stderr\uFF09\n// \u5FC5\u987B\u5904\u7406\u4E09\u4E2A method\uFF1A\ninitialize            \u2192 { protocolVersion, capabilities:{tools:{}}, serverInfo:{name, version} }\nnotifications/initialized \u2192 \u65E0\u54CD\u5E94\ntools/list            \u2192 { tools: [{ name, description, inputSchema }] }\ntools/call            \u2192 { content: [{ type:'text', text }], isError }   // ok/err \u4E24\u5305\u88C5\n// \u672A\u77E5 method\uFF08\u5E26 id\uFF09\u2192 error { code: -32601 }\n```\n\n\u8FDB\u7A0B\u53C2\u6570\uFF1A`node mcp/server.js {{appConfigDir}}`\uFF08arg[2] \u662F appConfigDir\uFF0C\u81EA\u53D1\u73B0\u6865/\u65E5\u5FD7\u515C\u5E95\u90FD\u8981\u5B83\uFF09\u3002\n\n## \u5DE5\u5177\u8BBE\u8BA1\uFF08\u51B3\u5B9A AI \u7528\u4E0D\u7528\u4F60\u7684\u5DE5\u5177\u7684\u662F description\uFF09\n\n1. **description \u5199\u300C\u9002\u7528\u53E5\u5F0F\u300D**\uFF1A\u7528\u6237\u4F1A\u8BF4\u4EC0\u4E48 \u2192 \u7528\u54EA\u4E2A\u5DE5\u5177\u3002clip-relay \u8303\u4F8B\uFF1A\u300C\u9002\u7528\uFF1A\u628A\u8FD9\u4E2A\u94FE\u63A5\u53D1\u5230\u6211\u624B\u673A\u4E0A\u300D\u300C\u8BB0\u4E2A\u53E3\u4EE4\u5230\u63A5\u529B\u677F\u300D\u3002AI \u9760\u8FD9\u4E2A\u5339\u914D\u7528\u6237\u610F\u56FE\u3002\n2. **\u4E2D\u6587\u5199\u5DE5\u5177\u63CF\u8FF0**\uFF08\u5BBF\u4E3B\u7528\u6237\u662F\u4E2D\u6587\uFF09\uFF0CinputSchema \u5C5E\u6027\u9010\u4E2A\u52A0\u4E2D\u6587 description\u3002\n3. **\u5371\u9669\u64CD\u4F5C\u5F3A\u5236 confirm**\uFF1A\u5165\u53C2\u52A0 `confirm: { type:'boolean' }` + `required`\uFF0C`args.confirm !== true` \u76F4\u63A5\u8FD4\u56DE isError \u63D0\u793A\u300C\u5371\u9669\u64CD\u4F5C\uFF0C\u8BF7\u5148\u4E0E\u7528\u6237\u786E\u8BA4\u300D\uFF08clip-relay relay_clear / pocket-host kill \u56DB\u5C42\u62A4\u680F\u540C\u6B3E\uFF09\u3002\n4. **\u8FD4\u56DE\u6587\u672C\u9762\u5411 AI**\uFF1A\u7ED9\u7ED3\u6784\u5316\u3001\u53EF\u7EE7\u7EED\u63A8\u7406\u7684\u4E2D\u6587\u6587\u672C\uFF08\u5217\u8868\u5E26 id \u65B9\u4FBF\u540E\u7EED\u6309 id \u64CD\u4F5C\uFF09\uFF1B\u5355\u884C\u622A\u65AD\uFF08`oneLine(s, 120)`\uFF09\u9632\u6491\u7206\u4E0A\u4E0B\u6587\uFF0Cread \u7C7B\u5DE5\u5177\u7ED9\u5168\u6587\u3002\n5. **\u5DE5\u5177\u6570\u91CF 4~7 \u4E2A**\u4E3A\u4F73\uFF0C\u6309\u52A8\u8BCD\u547D\u540D\uFF1A`<\u524D\u7F00>_<\u52A8\u4F5C>`\uFF08`relay_push`\u3001`dig_import`\uFF09\u3002\n6. \u9519\u8BEF\u5206\u7C7B\uFF1A`isError:true` \u7684\u4E1A\u52A1\u5931\u8D25 vs \u629B\u5F02\u5E38\u7684\u8FDB\u7A0B\u9519\u8BEF\u2014\u2014\u524D\u8005 AI \u80FD\u8BFB\u5E76\u81EA\u7EA0\uFF0C\u540E\u8005\u53EA\u4F1A\u770B\u5230 -32603\u3002\n7. MCP \u8FDB\u7A0B\u540C\u6837\u8981\u8D70 kvclient \u81EA\u53D1\u73B0\u6865\uFF08\u590D\u7528 service/kvclient.js\uFF09\uFF0C\u65E5\u5FD7\u8D70 stderr \u4E14**\u7EDD\u4E0D\u6C61\u67D3 stdout**\u3002\n\n## \u4E3B\u4ED3\u4FA7\u6CE8\u610F\n\n\u6539\u7684\u662F\u4E3B\u4ED3\u5185\u5EFA MCP\uFF08ask_mcp_server \u7B49\uFF09schema \u65F6\u624D\u9700\u8981 `cargo build --bin polaris-mcp` \u91CD\u7F16 bin\u2014\u2014\u63D2\u4EF6\u81EA\u5E26 MCP server \u4E0D\u9700\u8981\uFF1B\u4F46\u63D2\u4EF6\u5DE5\u5177\u5217\u8868\u66F4\u65B0\u540E AI \u4FA7\u8981\u91CD\u8FDE MCP \u624D\u53EF\u89C1\u3002\n";

// shared/kb/caps.md
var caps_default = "# \u63D2\u4EF6\u53EF\u7528 cap \u901F\u67E5\n\nRouterBus \u4E0A\u6CE8\u518C\u4E86 26 \u4E2A cap\uFF08\u4E3B\u4ED3 `router/` \u76EE\u5F55\uFF0C2026-10-25 \u5BF9\u9F50\uFF09\uFF0C\u4F46**\u63D2\u4EF6\u5B9E\u9645\u53EF\u9760\u4F7F\u7528\u7684\u662F\u4E0B\u9762\u56DB\u4E2A**\uFF08\u90FD\u7ECF `/api/router-dispatch` \u6216\u9762\u677F invoke \u8C03\u7528\uFF0Cpayload \u7B2C\u4E00\u5B57\u6BB5\u662F action\uFF09\u3002\n\n## cap.kv \u2014\u2014 \u6570\u636E\u9762\uFF08\u8DE8\u7AEF\u901A\u7528\uFF0C\u4E3B\u529B\uFF09\n\n| action | payload | \u8FD4\u56DE |\n|---|---|---|\n| `get` | `{ key }` | `{ value }`\uFF08\u4E0D\u5B58\u5728\u65F6 value \u7F3A\u7701\uFF09 |\n| `set` | `{ key, value }` | `{}` |\n| `delete` | `{ key }` | `{}` |\n| `list` | `{}` | `{ keys: string[] }` \u2014\u2014 **\u5168\u5C40\u6240\u6709\u952E\uFF0C\u89C1 keyspace \u4E3B\u9898** |\n\n\u684C\u9762/Remote \u4E24\u7AEF\u90FD\u653E\u884C\uFF08\u5B9E\u6D4B\uFF09\u2014\u2014\u8DE8\u7AEF\u63D2\u4EF6\u7684\u552F\u4E00\u53EF\u9760\u6570\u636E\u9762\u3002\n\n## cap.pluginServiceManager \u2014\u2014 \u670D\u52A1\u7BA1\u7406\n\n| action | payload | \u8BF4\u660E |\n|---|---|---|\n| `list_status` | `{}` | **\u8FD4\u56DE\u88F8\u6570\u7EC4**\uFF08\u4E0D\u662F `{services:[]}`\uFF09\uFF1A`[{ pluginId, serviceId, status, ... }]` |\n| `start` | `{ pluginId, serviceId, installPath, contribution }` | **\u5FC5\u987B\u5E26 installPath+contribution**\uFF08\u89C1 service-start \u4E3B\u9898\uFF09 |\n| `stop` / `restart` | `{ pluginId, serviceId }` | \u2014 |\n\n## cap.pluginDiscovery \u2014\u2014 \u63D2\u4EF6\u53D1\u73B0\n\n| action | payload | \u8FD4\u56DE |\n|---|---|---|\n| `discover` | `{}` | `{ plugins: [{ id, installPath, contributes: { services? } }] }` |\n\n\u4E24\u4E2A\u7528\u9014\uFF1A\u81EA\u4E3E start\uFF08\u62FF installPath\uFF09\uFF1B\u9762\u677F\u679A\u4E3E\u5DF2\u88C5\u63D2\u4EF6\u3002\n\n## cap.http \u2014\u2014 HTTP \u8F6C\u53D1\uFF08\u684C\u9762\u4E13\u7528\u9677\u9631\uFF09\n\n```js\n{ action: 'request', method, url, headers, body, bodyType: 'text'|'base64', timeoutMs }\n// \u2192 { status, statusText, ok, contentType, headers, body, isBase64, url, timeMs }\n```\n\n\u5BBF\u4E3B reqwest \u8F6C\u53D1\uFF1A\u7ED5 CORS/\u6DF7\u5408\u5185\u5BB9/\u7981\u53D1\u5934\u3002**Remote \u6E90\uFF08Web/\u624B\u673A\uFF09\u9ED8\u8BA4 deny\uFF0C\u684C\u9762\u653E\u884C**\u2014\u2014\u8DE8\u7AEF\u63D2\u4EF6\u4E0D\u80FD\u4F9D\u8D56\u5B83\uFF0C\u4E3B\u8DEF\u5F84\u7528\u670D\u52A1\u539F\u751F fetch\uFF08\u89C1 cross-origin \u4E3B\u9898\uFF09\u3002\n\n## \u5176\u4F59 cap \u4E3A\u4EC0\u4E48\u6CA1\u5217\n\n`cap.ai.chat`\u3001`cap.git`\u3001`cap.fs`\u3001`cap.history` \u7B49\u662F\u4E3B\u4ED3 AI \u5F15\u64CE/\u5185\u90E8\u670D\u52A1\u7684\u901A\u9053\uFF0C\u63D2\u4EF6\u4FA7\u672A\u5F00\u653E\u6216\u65E0\u6743\u9650\u6620\u5C04\uFF1B\u63D2\u4EF6\u9700\u8981\u7B49\u4EF7\u80FD\u529B\u65F6\uFF1A\u6587\u4EF6\u64CD\u4F5C\u4E0B\u6C89\u670D\u52A1\u8FDB\u7A0B\uFF08node \u539F\u751F fs\uFF09\u3001AI \u80FD\u529B\u7ECF MCP \u5DE5\u5177\u53CD\u5411\u66B4\u9732\uFF08AI \u672C\u6765\u5C31\u4F1A\u8C03\u4F60\u7684 MCP \u5DE5\u5177\uFF09\u3002\n";

// shared/kb/testing.md
var testing_default = "# \u4E09\u5C42\u9A8C\u8BC1\u4E0E\u771F\u5B9E\u6865\u5192\u70DF\u914D\u65B9\n\n\u300C\u80FD\u8DD1\u300D\u4E0D\u7B97\u5B8C\u6210\uFF0C\u751F\u4EA7\u7EA7 = \u4E09\u5C42\u5168\u7EFF\u3002\n\n## \u7B2C 1 \u5C42\uFF1A\u79BB\u7EBF\u5355\u6D4B\uFF08\u7EAF\u51FD\u6570\u6838\u5FC3\uFF09\n\n\u628A\u6240\u6709\u53EF\u6D4B\u903B\u8F91\u62BD\u5230 `shared/<x>-core.js`\uFF08\u89E3\u6790/\u89C4\u8303\u5316/\u5408\u5E76/\u8BC4\u5206/\u6E05\u626B\u8BA1\u5212/\u544A\u8B66\u673A\u2026\u2026\uFF09\uFF0C`test/run-tests.mjs` \u7528 node:assert \u76F4\u6D4B\uFF0C**\u96F6\u4F9D\u8D56\u96F6 mock**\uFF1A\n\n```js\n// test/run-tests.mjs \u2014\u2014 node test/run-tests.mjs\nimport assert from 'node:assert'\nconst results = []\nconst t = (name, fn) => { try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) } }\n// ... \u6BCF\u4E2A\u884C\u4E3A\u4E00\u6761 t(...)\nconst bad = results.filter(r => !r.pass)\nconsole.log(results.map(r => `${r.pass ? '\u2713' : '\u2717'} ${r.name}`) .join('\\n'))\nprocess.exit(bad.length ? 1 : 0)\n```\n\n\u516D\u4E2A\u5DF2\u4EA4\u4ED8\u63D2\u4EF6\u7684\u5355\u6D4B\u7ECF\u9A8C\uFF1A**\u5751\u90FD\u5148\u5728\u7EAF\u51FD\u6570\u5C42\u66B4\u9732**\uFF08\u9650\u9891\u952E\u7EF4\u5EA6\u3001GBK \u89E3\u7801\u3001chunk \u8FB9\u754C\uFF09\u3002\u6539 shared core \u5FC5\u8DD1\u3002\n\n## \u7B2C 2 \u5C42\uFF1A\u6784\u5EFA\u95E8\n\n```bash\ncd plugins/<id>\nnpm install          # esbuild + typescript + @types/react\nnpm run typecheck    # tsc --noEmit\nnpm run build        # esbuild \u2192 dist/panel.js\n```\n\n## \u7B2C 3 \u5C42\uFF1A\u771F\u5B9E\u6865\u5192\u70DF\uFF08test/smoke-real.mjs\uFF09\n\n**\u5BF9\u8FD0\u884C\u4E2D\u7684\u751F\u4EA7 Polaris \u505A\u5168\u94FE\u8DEF\u9A8C\u8BC1**\uFF08page-sentinel 11/11\u3001pocket-host 11/11\u3001clip-relay 11/11\u3001data-ark 11/11 \u90FD\u8FD9\u4E48\u8DD1\u7684\uFF09\uFF1A\n\n```\n\u524D\u63D0\uFF1A\u672C\u673A Polaris \u6B63\u5728\u8FD0\u884C\uFF08anchor.json \u2192 config.json web.port \u53EF\u8FBE\uFF09\n\u6D41\u7A0B\u6A21\u677F\uFF1A\n 1. \u81EA\u53D1\u73B0\u771F\u5B9E\u6865\u7AEF\u70B9\uFF08\u4E0E\u670D\u52A1\u540C\u89C4\u5219\uFF09\n 2. \u9632\u8BEF\u4F24\u62A4\u680F\uFF1A\u771F\u5B9E kv \u5DF2\u6709\u672C\u63D2\u4EF6\u4E1A\u52A1\u952E \u2192 \u62D2\u8DD1\n 3. \u8D77\u672C\u5730 mock \u7AEF\u70B9\uFF08\u9700\u8981 HTTP \u4EA4\u4E92\u65F6\uFF09\u2014\u2014\u6CE8\u610F SSRF \u5B88\u536B\u4F1A\u62D2 127.0.0.1\uFF0C\u5916\u90E8\u6293\u53D6\u7528\u771F\u5B9E\u5916\u7F51\n 4. \u7ECF\u771F\u5B9E\u6865\u5199\u6D4B\u8BD5\u6570\u636E\uFF08\u771F\u5B9E cap.kv\uFF09\n 5. spawn \u771F\u5B9E\u670D\u52A1\u8FDB\u7A0B\uFF08\u65E0 env \u6CE8\u5165\uFF0C\u4F20 '19870' \u4E4B\u7C7B\u7A7A\u95F2\u7AEF\u53E3 + appConfigDir\uFF09\u2192 waitFor \u5FC3\u8DF3\u952E\n 6. \u9A8C\u8BC1\u670D\u52A1\u4EA7\u51FA\uFF08\u5199\u56DE\u7684\u72B6\u6001/\u7ED3\u679C\u952E\uFF09\n 7. spawn \u771F\u5B9E mcp/server.js\uFF08stdio JSON-RPC \u76F4\u8FDE\uFF09\u2192 initialize \u2192 tools/list \u2192 tools/call \u5168\u95ED\u73AF\n 8. finally\uFF1A\u6740\u8FDB\u7A0B + \u5220\u5149\u672C\u63D2\u4EF6\u524D\u7F00\u5168\u90E8\u952E + \u62A5\u544A N/N \u901A\u8FC7\n```\n\nwaitFor \u6A21\u677F\uFF1A\n\n```js\nasync function waitFor(fn, ms, step = 500, label = '') {\n  const t0 = Date.now()\n  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, step)) }\n  throw new Error(`\u5192\u70DF\u8D85\u65F6\uFF1A${label}`)\n}\n```\n\n\u5192\u70DF\u811A\u672C\u7684\u5751\uFF08clip-relay \u5B9E\u5F55\uFF09\uFF1A\u4ECE\u5DE5\u5177\u8FD4\u56DE\u6587\u672C\u91CC\u6B63\u5219\u63D0\u53D6 id \u65F6 slice \u8FB9\u754C\u9519\u4F4D \u2192 \u5047\u8D85\u65F6\uFF1B\u62FF\u4E0D\u51C6\u5C31\u7ED3\u6784\u5316\u65AD\u8A00\uFF08\u5148 kvGet \u518D\u6BD4\u5185\u5BB9\uFF09\u3002\n\n## \u4E3B\u4ED3\u4FA7\uFF08\u6D89\u53CA\u65F6\uFF09\n\n\u52A8\u7684\u662F\u4E3B\u4ED3\u800C\u975E\u63D2\u4EF6\u65F6\uFF1A`cargo check`\uFF08\u5728 `src-tauri/` \u4E0B\u8DD1\uFF0C\u4ED3\u5E93\u6839\u6CA1\u6709 Cargo.toml\uFF09\u3001\u6539\u547D\u4EE4\u5C42/\u534F\u8BAE\u52A0 `cargo check --no-default-features --bin polaris-web --bin polaris-mcp`\u3001\u524D\u7AEF `pnpm exec tsc --noEmit`\u3002\u672C\u673A `cargo test --lib` \u4E0D\u53EF\u7528\uFF08Tauri DLL \u9650\u5236\uFF09\u3002\n";

// shared/kb/publishing.md
var publishing_default = "# \u6253\u5305\u53D1\u5E03\u4E0E index.json \u4E09\u5751\n\n## \u6253\u5305\n\n```bash\nnode scripts/pack.js plugins/<id>\n# \u8BFB plugin.json \u6821\u9A8C id/version \u2192 \u6309 .pluginignore \u6392\u9664 \u2192 \u4E34\u65F6\u76EE\u5F55\u91CD\u7EC4 \u2192 \u6839\u76EE\u5F55\u76F4\u63A5\u542B plugin.json \u2192 <id>.zip + sha256\n```\n\n`.pluginignore` \u60EF\u4F8B\uFF08\u6392\u9664\u6E90\u7801\u4E0E\u5F00\u53D1\u6587\u4EF6\uFF0C**\u4FDD\u7559 dist/shared/mcp/service**\uFF09\uFF1A\n\n```\nnode_modules/\npackage.json\npackage-lock.json\nsrc/\ntsconfig.json\ntest/\nREADME.md\n*.zip\n.git/\n```\n\n## index.json \u4E09\u5751\uFF08\u6BCF\u4E2A\u90FD\u771F\u5B9E\u6D6A\u8D39\u8FC7\u4E00\u8F6E\u6392\u67E5\uFF09\n\n1. **publish-plugin.mjs \u53EA\u66F4\u65B0\u4E0D\u65B0\u589E**\uFF1Aindex \u91CC\u6CA1\u6709\u8BE5\u63D2\u4EF6 id \u65F6\uFF0C\u811A\u672C\u7B97\u5B8C sha \u4F1A\u63D0\u793A\u300C\u672A\u627E\u5230\u63D2\u4EF6\uFF0C\u8DF3\u8FC7\u300D\u2014\u2014**\u65B0\u63D2\u4EF6\u5FC5\u987B\u5148\u624B\u52A8\u5F80 `index.json` \u7684 plugins[] \u8FFD\u52A0\u6761\u76EE**\uFF08\u6284 pocket-ledger \u5B57\u6BB5\u5F62\u6001\uFF1Aid/name/version/description/author/category/tags/icon/homepage/repository/manifestUrl/downloadUrl/updateUrl/sha256/tier/permissions/screenshots/readme/versions\uFF09\uFF0C\u518D\u8DD1\u811A\u672C\u540C\u6B65 version/sha256\u3002\n2. **\u91CD\u53D1\u6539 URL**\uFF1A\u5BF9\u5DF2\u6709\u6761\u76EE\u91CD\u8DD1\u811A\u672C\u4F1A\u628A downloadUrl/versions \u6539\u5199\u6210 `@<tag>` \u9489\u5B9A\u5730\u5740\uFF08\u5982 `@my-plugin-v0.1.0`\uFF09\uFF0C\u4E0D push tag \u5C31 404\u2014\u2014\u624B\u52A8\u6539\u56DE `@main` \u98CE\u683C\u5E76\u91CD\u7B97 sha \u5199\u56DE\u3002\n3. **zip \u6BCF\u6B21\u91CD\u6253 sha \u90FD\u53D8**\uFF08Compress-Archive \u5E26\u65F6\u95F4\u6233\uFF09\uFF1A\u4EE5\u6700\u540E\u4E00\u6B21\u4E3A\u51C6\u3002\n\n## index.json \u5E76\u53D1\u8986\u76D6\uFF08\u591A\u4F1A\u8BDD/\u591A\u4EBA\u5171\u7528\u6B64\u4ED3\u7684\u8840\u6CEA\uFF09\n\nindex.json \u662F\u5171\u4EAB\u53EF\u53D8\u72B6\u6001\uFF1A\u6709\u4F1A\u8BDD\u7528\u65E7\u57FA\u5EA7\u6574\u6587\u4EF6\u91CD\u5199\uFF0C\u62B9\u6389\u4E86\u522B\u4EBA\u672A\u63D0\u4EA4\u7684\u6761\u76EE\uFF08\u771F\u5B9E\u4E8B\u6545\uFF0C\u9760\u5404\u63D2\u4EF6 plugin.json+zip sha \u6062\u590D\uFF09\u3002**\u7EAA\u5F8B\uFF1A\u63D0\u4EA4 index.json \u6539\u52A8\u524D\u5148\u91CD\u8BFB\u73B0\u6587\u4EF6\uFF1B\u53D1\u73B0\u522B\u4EBA\u7684\u65B0\u6761\u76EE\u8981\u4FDD\u7559\uFF0C\u53EA\u8FFD\u52A0/\u4FEE\u6539\u81EA\u5DF1\u7684\u90A3\u51E0\u6761\uFF0C\u7EDD\u4E0D\u6574\u6587\u4EF6\u8986\u76D6\u3002**\n\n## update.json\n\n\u6BCF\u4E2A\u63D2\u4EF6\u76EE\u5F55\u653E\u4E00\u4EFD update.json\u2014\u2014\u5185\u5BB9 = plugin.json \u5168\u91CF\u526F\u672C\uFF08\u542B\u6700\u65B0 version\uFF09\uFF0C\u5546\u57CE\u66F4\u65B0\u68C0\u67E5\u8BFB\u5B83\u3002version \u53D8\u4E86\u8BB0\u5F97\u540C\u6B65\u3002\n\n## \u6821\u9A8C\n\n```bash\nnode scripts/validate.js   # \u6E05\u5355\u4E0E index \u4E00\u81F4\u6027\uFF1B\u5B58\u91CF multichat \u62A5\u9519\u662F\u5386\u53F2\u9057\u7559\uFF0C\u975E\u4F60\u7684\u95EE\u9898\n```\n\n## \u53D1\u5E03\u68C0\u67E5\u5355\n\n- [ ] version \u4E09\u5904\u4E00\u81F4\uFF1Aplugin.json / update.json / index.json\n- [ ] zip \u91CD\u6253\u540E sha256 \u5DF2\u5199\u56DE index.json\n- [ ] downloadUrl/updateUrl \u662F @main \u4E0D\u662F @tag\n- [ ] README \u7684\u952E\u7A7A\u95F4\u5951\u7EA6\u8868\u5DF2\u66F4\u65B0\n- [ ] \u65B0\u589E\u6761\u76EE\u65F6\u6CA1\u6709\u8986\u76D6\u522B\u4EBA\u7684\uFF08\u5148\u91CD\u8BFB index.json\uFF09\n";

// shared/kb/ui-ux.md
var ui_ux_default = "# \u9762\u677F UI \u7EA6\u5B9A\u4E0E\u79FB\u52A8\u7AEF\u5751\n\n## \u7ED3\u6784\u60EF\u4F8B\uFF08\u516D\u4E2A\u5DF2\u4EA4\u4ED8\u63D2\u4EF6\u6536\u655B\u51FA\u7684\u5F62\u6001\uFF09\n\n- \u9ED8\u8BA4\u5BFC\u51FA\u7EC4\u4EF6\u6536 `{ pluginId, onSendToChat? }`\uFF1B`onSendToChat` \u53EF\u628A\u5185\u5BB9\u9001\u8FDB\u804A\u5929\u8F93\u5165\u3002\n- ActivityBar \u56FE\u6807 \u2192 \u6253\u5F00\u9762\u677F\uFF1B\u9762\u677F\u5185 **Tab \u5207\u6362**\uFF08\u6BCF\u4E2A Tab \u4E00\u4E2A\u6587\u4EF6\uFF1A`Panel.tsx` \u7EC4\u88C5 + `XxxTab.tsx` \u5B9E\u73B0\uFF09\u3002\n- \u8BBE\u7F6E Tab \u60EF\u4F8B\uFF1A\u670D\u52A1\u7BA1\u7406\u5361\uFF08\u6709\u670D\u52A1\u65F6\uFF09+ \u5168\u5C40\u8BBE\u7F6E + \u6570\u636E\u7BA1\u7406\uFF08\u5BFC\u51FA/\u6E05\u7406\uFF09\u3002\n- \u9762\u677F\u662F\u666E\u901A React 18\uFF08react-jsx automatic\uFF09\uFF1B**\u6CA1\u6709\u8DEF\u7531\u3001\u6CA1\u6709\u5168\u5C40\u72B6\u6001\u5E93**\uFF0C`useState/useEffect` + \u81EA\u5199 model.ts \u591F\u7528\u3002\n- \u6837\u5F0F\uFF1A\u5185\u8054 style + \u5C11\u91CF CSS\uFF1B\u989C\u8272/\u5B57\u53F7\u9075\u5B88\u4E3B\u9898 token\uFF08\u4E3B\u4ED3 DESIGN \u7EA6\u5B9A\uFF09\uFF0C\u522B\u786C\u7F16\u7801\u3002\n- \u56FE\u8868**\u4E0D\u5F15\u7B2C\u4E09\u65B9\u5E93**\uFF1A\u5185\u8054 SVG \u67F1\u72B6/\u70ED\u529B\u56FE\uFF08pocket-ledger \u9010\u65E5\u67F1\u72B6\u56FE\u5148\u4F8B\uFF09\uFF0C\u51E0\u5341\u884C\u4EE3\u7801\u96F6\u4F9D\u8D56\u3002\n\n## \u79FB\u52A8\u7AEF/Remote \u5751\uFF08\u624B\u673A\u6D4F\u89C8\u5668 = \u975E\u5B89\u5168\u4E0A\u4E0B\u6587\uFF09\n\n| \u5751 | \u8868\u73B0 | \u89E3\u6CD5 |\n|---|---|---|\n| `navigator.clipboard` \u4E0D\u53EF\u7528 | \u624B\u673A\u7ECF `http://<LAN-IP>` \u8BBF\u95EE\uFF0C\u975E HTTPS \u975E\u5B89\u5168\u4E0A\u4E0B\u6587\uFF0Ccopy API \u76F4\u63A5\u6CA1\u6709 | \u53CC\u8DEF\u5F84\uFF1A\u8BD5 clipboard API\uFF0C\u5931\u8D25\u56DE\u9000\u300C\u624B\u52A8\u590D\u5236\u300D\u5168\u9009\u5F39\u7A97\uFF08clip-relay \u5148\u4F8B\uFF0CREADME \u5982\u5B9E\u5199\u660E\uFF09 |\n| \u5E03\u5C40\u6324\u538B | \u684C\u9762 380px \u4FA7\u680F vs \u624B\u673A\u5168\u5C4F | `supportsFullscreen: true` + \u54CD\u5E94\u5F0F\uFF08max-width \u5BB9\u5668\u3001Tab \u6A2A\u5411\u53EF\u6EDA\uFF09 |\n| \u89E6\u63A7\u76EE\u6807 | hover \u4F9D\u8D56 | \u6700\u5C0F\u53EF\u70B9 40px\uFF0C\u64CD\u4F5C\u7528\u70B9\u51FB\u4E0D\u7528 hover |\n| \u957F\u5217\u8868 | \u6570\u5343\u6761\u5361\u6B7B | \u5206\u9875/\u865A\u62DF\u5316 + \u641C\u7D22\u8FC7\u6EE4\u5728\u524D |\n\n## \u52A0\u8F7D\u4E0E\u7A7A\u6001\n\n- \u6570\u636E\u7ECF invoke \u5F02\u6B65\u6765\uFF1A\u7ED9 loading \u6001\uFF1Bkv \u7A7A\u7ED9\u300C\u9996\u6B21\u4F7F\u7528\u300D\u5F15\u5BFC\uFF08\u544A\u8BC9\u7528\u6237\u53BB\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u54EA\u53E5\u8BDD\u80FD\u5E72\u6D3B\u2014\u2014MCP \u578B\u63D2\u4EF6\u7684\u83B7\u5BA2\u8BDD\u672F\uFF09\u3002\n- \u670D\u52A1\u578B\u63D2\u4EF6\u7ED9\u300C\u670D\u52A1\u672A\u8FD0\u884C\u300D\u53EF\u89C1\u72B6\u6001\uFF08list_status \u8BFB\u4E0D\u5230/\u5FC3\u8DF3\u8FC7\u671F\uFF09+ \u81EA\u4E3E start \u6309\u94AE\uFF08\u89C1 service-start\uFF09\u3002\n\n## \u6587\u6848\n\n- \u5168\u4E2D\u6587\u3001\u8BF4\u4EBA\u8BDD\uFF1B\u62A5\u9519\u5FC5\u987B\u542B\u4E0B\u4E00\u6B65\u52A8\u4F5C\uFF08\u300C\u53BB \u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192xxx \u770B\u670D\u52A1\u72B6\u6001\u300D\uFF09\u3002\n- \u5371\u9669\u6309\u94AE\u7EA2\u8272 + \u4E8C\u6B21\u786E\u8BA4\uFF1B\u4E0D\u53EF\u9006\u64CD\u4F5C\u5199\u660E\u540E\u679C\u3002\n";

// shared/kb/production-checklist.md
var production_checklist_default = "# \u751F\u4EA7\u7EA7\u6E05\u5355\uFF08data-ark \u6807\u51C6\uFF09\n\n\u300C\u6F14\u793A\u80FD\u8DD1\u300D\u548C\u300C\u751F\u4EA7\u7EA7\u300D\u7684\u5DEE\u8DDD\u5C31\u662F\u8FD9\u5F20\u6E05\u5355\u3002data-ark\uFF08\u5907\u4EFD\u5F15\u64CE\uFF09\u786E\u7ACB\u7684\u6807\u51C6\uFF0C\u540E\u7EED\u63D2\u4EF6\u7167\u6B64\u9A8C\u6536\u3002\n\n## \u6570\u636E\u5B89\u5168\n\n- [ ] **\u539F\u5B50\u5199**\uFF1A\u5148\u5199 `.tmp` \u518D `fs.renameSync`\uFF0C\u7D22\u5F15/manifest \u6700\u540E\u5199\u2014\u2014\u5D29\u6E83\u540E\u8981\u4E48\u5B8C\u6574\u8981\u4E48\u6CA1\u6709\n- [ ] **\u5355\u5199\u8005**\uFF1A\u6BCF\u4E2A\u952E\u7A7A\u95F4\u4E00\u4E2A\u5199\u8005\uFF1B\u591A\u65B9\u534F\u4F5C\u8D70\u547D\u4EE4\u952E\uFF08\u5148\u5220\u540E\u505A\uFF09\u2014\u2014\u89C1 single-writer\n- [ ] **\u5E42\u7B49**\uFF1A\u540C id \u91CD\u653E\u65E0\u526F\u4F5C\u7528\uFF1B\u300C\u9519\u8FC7\u8C03\u5EA6\u53EA\u8865\u4E00\u6B21\u300D\uFF1B\u91CD\u8BD5\u4E0D\u53CC\u5199\n- [ ] **\u6E05\u626B\u62A4\u680F**\uFF1A\u6279\u91CF\u5220\u53EA\u52A8\u81EA\u5DF1\u524D\u7F00\uFF1B\u5192\u70DF\u524D\u68C0\u6D4B\u4E1A\u52A1\u952E\u5B58\u5728\u5219\u62D2\u8DD1\n- [ ] **\u6062\u590D/\u5BFC\u51FA\u53EA\u8FDB\u6682\u5B58\u533A**\uFF1A\u5F15\u64CE\u6CA1\u6709\u76F4\u63A5\u8986\u76D6\u7528\u6237\u6570\u636E\u7684\u4EE3\u7801\u8DEF\u5F84\uFF08data-ark \u6062\u590D\u53EA\u5199 restored/\uFF09\n\n## \u7F51\u7EDC\u5B89\u5168\n\n- [ ] **SSRF \u5B88\u536B**\uFF1A\u670D\u52A1\u6293\u53D6\u53EA\u653E\u516C\u7F51 http(s)\uFF0C\u62D2\u73AF\u56DE/\u5185\u7F51/\u94FE\u8DEF\u672C\u5730/\u4E91\u5143\u6570\u636E/file:/javascript:\uFF08isFetchableUrl \u6837\u677F\uFF0C\u6539\u52A8\u5FC5\u987B\u4FDD\u7559\uFF09\n- [ ] \u6293\u53D6\u5E26 UA/Accept\u3001\u8D85\u65F6\u5FC5\u8BBE\uFF08AbortController\uFF09\u3001\u54CD\u5E94\u4F53\u9650\u957F\uFF08\u8BFB\u6D41 reader \u5FAA\u73AF + \u8D85\u9650 cancel\uFF09\n- [ ] \u4E0D\u628A\u654F\u611F\u6570\u636E\u5199\u65E5\u5FD7\uFF1Bkv \u91CC\u7684\u654F\u611F\u5B57\u6BB5\u660E\u786E\u6807\u6CE8\uFF08README \u8BF4\u660E\u6570\u636E\u51FA\u4E0D\u51FA\u8BBE\u5907\uFF09\n\n## \u53EF\u9760\u6027\n\n- [ ] **\u8BDA\u5B9E\u964D\u7EA7**\uFF1Abridge \u4E0D\u53EF\u8FBE \u2192 \u964D\u7EA7\u8DD1\uFF08\u5065\u5EB7\u7AEF\u70B9\u4ECD 200\uFF09\uFF0Cmeta \u6807 degraded\uFF0C60s \u5237\u7AEF\u70B9\uFF1B\u4E0D\u81EA\u6108\u5931\u8D25\u5C31\u660E\u8BF4\n- [ ] **\u65E5\u5FD7\u81EA\u843D\u76D8 + \u8F6E\u8F6C**\uFF08\u5BBF\u4E3B\u4E0D\u6536\u96C6 stdout\uFF09\uFF1B\u9519\u8BEF\u5E26\u4E0A\u4E0B\u6587\uFF08\u54EA\u4E2A URL/\u54EA\u4E2A\u9636\u6BB5\uFF09\n- [ ] \u670D\u52A1\u91CD\u542F\u5B89\u5168\uFF1A\u72B6\u6001\u5168\u5728 kv\uFF0C\u8FDB\u7A0B\u65E0\u8BB0\u5FC6\u4F9D\u8D56\uFF1B\u542F\u52A8\u626B\u63CF\u80FD\u63A5\u4E0A\u4E2D\u65AD\u7684\u5DE5\u4F5C\uFF08\u22643 \u6B21\u91CD\u8BD5\u540E\u8BDA\u5B9E\u6807\u8BB0\u653E\u5F03\uFF0C\u4E0D\u5835\u961F\u5217\uFF09\n- [ ] \u9650\u9891/\u544A\u8B66\u952E**\u5FC5\u987B\u542B\u533A\u5206\u7EF4\u5EA6**\uFF08pocket-host \u6559\u8BAD\uFF1A\u9650\u9891\u952E\u4E0D\u542B mount\uFF0C\u53CC\u76D8\u544A\u8B66\u4E92\u541E\uFF09\n- [ ] \u5E76\u53D1\u793C\u8C8C\uFF1A\u5916\u7F51\u6293\u53D6\u9650\u5E76\u53D1\u6570\uFF086~8\uFF09+ \u6392\u961F\uFF0C\u4E0D\u8F70\u70B8\u76EE\u6807\n\n## \u4EA4\u4E92\u8BDA\u5B9E\n\n- [ ] \u5931\u8D25\u539F\u56E0\u5199\u7ED9\u4EBA\u770B + \u4E0B\u4E00\u6B65\u52A8\u4F5C\uFF1B\u4E0D\u505A\u5047\u8FDB\u5EA6\u6761\n- [ ] \u5371\u9669\u64CD\u4F5C\uFF08\u5220\u5E93/\u6E05\u7A7A/\u6740\u8FDB\u7A0B\uFF09confirm \u95E8\uFF08MCP \u4FA7 + \u9762\u677F\u4FA7\u53CC\u786E\u8BA4\uFF09\n- [ ] \u6027\u80FD\u8FB9\u754C\u5982\u5B9E\u5199 README\uFF08\u4E0D\u91C7\u96C6\u7684\u6307\u6807\u3001\u4E0D\u652F\u6301\u7684\u683C\u5F0F\uFF0C\u660E\u8BF4\uFF09\n\n## \u9A8C\u8BC1\u95ED\u73AF\n\n- [ ] shared core \u79BB\u7EBF\u5355\u6D4B\u5168\u7EFF\uFF08\u884C\u4E3A\u7EA7\uFF0C\u4E0D\u53EA happy path\uFF09\n- [ ] `tsc --noEmit` + esbuild \u6784\u5EFA\u901A\u8FC7\n- [ ] \u771F\u5B9E\u6865\u5192\u70DF N/N\uFF08\u542B\u771F\u5B9E\u5916\u7F51\u7528\u4F8B + \u81EA\u6E05\u7406\uFF09\uFF0C\u771F\u5B9E\u751F\u4EA7\u6570\u636E\u672A\u88AB\u7834\u574F\n- [ ] README \u952E\u7A7A\u95F4\u5951\u7EA6\u8868 + \u6743\u5A01\u8BF4\u660E\uFF08\u51FA\u9519\u7684\u6392\u67E5\u5165\u53E3\uFF1A\u65E5\u5FD7\u8DEF\u5F84\uFF09\n\n## \u5206\u5BF8\uFF08\u540C\u7B49\u91CD\u8981\uFF09\n\n- \u62C6\u5206\u514B\u5236\uFF1A\u80FD\u4E00\u4E2A\u6587\u4EF6\u8BF4\u6E05\u4E0D\u62C6\u4E09\u4E2A\uFF1B>1800 \u884C\u518D\u8003\u8651\u62C6\n- \u4E0D\u52A0\u300C\u4EE5\u9632\u4E07\u4E00\u300D\u7684\u515C\u5E95\u5206\u652F\u63A9\u76D6\u8BBE\u8BA1\u95EE\u9898\u2014\u2014\u53D1\u73B0\u8BBE\u8BA1\u7F3A\u9677\u5148\u6539\u8BBE\u8BA1\n- \u515C\u5E95\u5FC5\u987B\u8BDA\u5B9E\u6807\u8BB0\uFF08skipped/degraded\uFF09\uFF0C\u4E0D\u9759\u9ED8\u541E\u9519\n";

// shared/kb/pitfalls.md
var pitfalls_default = "# \u5B9E\u6D4B\u5751\u603B\u8868\uFF08\u6587\u6863\u6CA1\u5199\u7684\u90FD\u5728\u8FD9\uFF09\n\n\u4E00\u6761\u4E00\u4E2A\u771F\u5B9E\u6545\u4E8B\uFF0C\u5168\u90E8 2026-10 \u5B9E\u6D4B\u3002\u5199\u65B0\u63D2\u4EF6\u524D\u626B\u4E00\u904D\u80FD\u7701\u4E00\u6574\u5929\u3002\n\n## \u73AF\u5883\u4E0E\u901A\u9053\n\n| \u5751 | \u771F\u76F8 | \u5BF9\u7B56 |\n|---|---|---|\n| \u670D\u52A1\u8FDB\u7A0B\u96F6\u73AF\u5883\u53D8\u91CF\u6CE8\u5165 | \u6587\u6863\u8BF4\u6709 `POLARIS_HOST/PORT/TOKEN`\uFF0C\u5B9E\u6D4B\u4E0D\u5B58\u5728 | kvclient \u81EA\u53D1\u73B0\uFF08anchor\u2192config\u2192\u626B 25 \u7AEF\u53E3\uFF09 |\n| `plugin_service_*` \u547D\u4EE4\u5DF2\u5220 | main.tsx HOST_INVOKE_ALLOWLIST \u8FD8\u6709\u6B8B\u7559\u6761\u76EE\uFF0C\u4F1A\u88AB\u8BEF\u5BFC | \u9762\u677F\u8D70 `router_dispatch \u2192 cap.pluginServiceManager` |\n| \u5BBF\u4E3B\u4E0D\u6536\u96C6\u670D\u52A1 stdout/stderr | \u6587\u6863\u7684 `__POLARIS_PLUGIN_SERVICES__` \u65E5\u5FD7 API \u672A\u5B9E\u73B0 | \u81EA\u843D\u76D8 `<appConfigDir>/<id>.log` + 512KB \u8F6E\u8F6C |\n| `process.send({type:'ready'})` \u65E0\u6D88\u8D39\u8005 | \u6587\u6863\u5EFA\u8BAE\u7684 ready \u4FE1\u4EE4\u6CA1\u4EBA\u542C | http \u578B\u9760\u5065\u5EB7\u7AEF\u70B9\uFF1B\u542F\u52A8\u5B8C\u6210\u5199 meta \u5FC3\u8DF3 |\n| cap.http \u5BF9 Remote \u6E90\u9ED8\u8BA4 deny | \u684C\u9762 Bootstrap \u653E\u884C\uFF0CWeb/\u624B\u673A\u62D2\u2014\u2014\u300C\u684C\u9762\u597D\u7684\u624B\u673A\u4E0D\u884C\u300D\u7684\u7ECF\u5178\u6839\u56E0 | \u6570\u636E\u9762 cap.kv\uFF0C\u6293\u53D6\u9762\u4E0B\u6C89\u670D\u52A1 |\n| \u9762\u677F React \u5FC5\u987B external | \u6587\u6863\u53E6\u4E00\u5904\u8BF4\u300CReact \u6253\u8FDB\u53BB\u300D\u2014\u2014\u9519\uFF0C\u767D\u5C4F Invalid hook call | `--external:react --external:react/jsx-runtime` |\n\n## Node \u670D\u52A1\u5C42\n\n| \u5751 | \u771F\u76F8 | \u5BF9\u7B56 |\n|---|---|---|\n| Node 18+ fetch body \u6CA1\u6709 `.on` | \u662F web ReadableStream\uFF0C\u4E0D\u662F stream | `getReader()` \u5FAA\u73AF\u8BFB\uFF1B\u8D85\u9650 `reader.cancel()` |\n| Promise executor \u91CC\u4E0D\u80FD await | `new Promise(async (resolve) => ...)` \u541E\u5F02\u5E38 | fetchPage \u6574\u4F53 async\uFF0Cexecutor \u53EA\u505A\u540C\u6B65\u5305\u88C5 |\n| \u6E05\u626B\u53EA\u9760\u5468\u671F\u4F1A\u5931\u5B88 | \u9AD8\u538B\u573A\u666F 60s \u5185\u65E0\u54CD\u5E94 | tick \u91CC\u68C0\u6D4B\u8D85\u9650**\u7ACB\u5373\u89E6\u53D1**\u6E05\u626B\uFF0815s \u8282\u6D41\u9632\u7A7A\u8F6C\uFF09 |\n| \u9650\u9891\u952E\u4E0D\u542B\u533A\u5206\u7EF4\u5EA6 | pocket-host\uFF1A\u9650\u9891\u952E\u6CA1\u542B mount\uFF0C\u540C tick \u53CC\u76D8\u544A\u8B66\u4E92\u541E | \u9650\u9891/\u544A\u8B66\u952E = `<\u7EF4\u5EA6\u5168\u91CF\u7EC4\u5408>`\uFF0C\u5355\u6D4B\u8986\u76D6\u6B64\u5751 |\n| Windows GBK \u8F93\u51FA | tasklist/netstat \u4E2D\u6587\u7CFB\u7EDF\u8F93\u51FA GBK | `TextDecoder('gbk')` \u89E3\u7801 |\n| \u5192\u70DF\u63D0\u53D6 id \u7684 slice \u8FB9\u754C | \u4ECE\u6587\u672C\u6B63\u5219\u63D0\u53D6\u518D slice \u9519\u4F4D \u2192 \u5047\u8D85\u65F6 | \u7ED3\u6784\u5316\u65AD\u8A00\uFF08kvGet \u56DE\u8BFB\u6BD4\u5BF9\uFF09 |\n\n## \u6570\u636E\u5C42\n\n| \u5751 | \u771F\u76F8 | \u5BF9\u7B56 |\n|---|---|---|\n| cap.kv list \u8FD4\u56DE\u5168\u5C40\u6240\u6709\u952E | \u65E0\u524D\u7F00\u8FC7\u6EE4\u53C2\u6570\uFF0C\u8DE8\u63D2\u4EF6\u5171\u4EAB | \u524D\u7F00\u94C1\u5F8B + \u952E\u6570\u7EAA\u5F8B\uFF08\u5206\u5757\uFF09 |\n| kv \u65E0 CAS | \u540E\u5199\u8986\u76D6\u5148\u5199 | \u5355\u5199\u8005 + \u547D\u4EE4\u952E\u5148\u5220\u540E\u505A |\n| get \u53EF\u80FD\u649E\u5DF2\u5220\u952E | list \u4E0E get \u4E4B\u95F4\u6570\u636E\u53EF\u53D8 | \u6240\u6709 get `.catch(() => null)` \u5BB9\u5FCD null |\n| \u5927\u5BF9\u8C61\u6574\u5199\u653E\u5927 | \u6BCF\u6539\u4E00\u6761\u91CD\u5199\u5168\u91CF | \u5206\u5757 + \u810F\u7F13\u51B2\u5408\u5E76\u5237\u76D8\uFF08bookmark-dig \u6A21\u5F0F\uFF09 |\n\n## \u53D1\u5E03\u5C42\n\n| \u5751 | \u771F\u76F8 | \u5BF9\u7B56 |\n|---|---|---|\n| publish \u811A\u672C\u4E0D\u65B0\u589E\u6761\u76EE | index.json \u6CA1\u6709\u8BE5 id \u65F6\u300C\u8DF3\u8FC7 sha \u66F4\u65B0\u300D | \u5148\u624B\u52A8\u52A0\u6761\u76EE\u518D\u8DD1\u811A\u672C |\n| \u91CD\u53D1\u6539\u6210 @tag URL | \u811A\u672C\u628A downloadUrl \u6539 `@<tag>`\uFF0C\u4E0D\u63A8 tag \u5C31 404 | \u6539\u56DE @main + \u91CD\u7B97 sha |\n| zip \u6BCF\u6B21\u91CD\u6253 sha \u53D8 | Compress-Archive \u5E26\u65F6\u95F4\u6233 | \u4EE5\u6700\u540E\u4E00\u6B21\u4E3A\u51C6 |\n| index.json \u5E76\u53D1\u8986\u76D6 | \u53E6\u4E00\u4F1A\u8BDD\u7528\u65E7\u57FA\u5EA7\u6574\u6587\u4EF6\u91CD\u5199\uFF0C\u62B9\u6389\u522B\u4EBA\u672A\u63D0\u4EA4\u6761\u76EE | \u6539\u524D\u91CD\u8BFB\u73B0\u6587\u4EF6\uFF0C\u53EA\u52A8\u81EA\u5DF1\u7684\u6761\u76EE |\n| MCP schema \u66F4\u65B0\u4E0D\u751F\u6548 | AI \u4FA7\u7F13\u5B58\u7684\u5DE5\u5177\u5217\u8868 | \u91CD\u542F\u5E94\u7528/\u91CD\u8FDE MCP |\n\n## \u4E3B\u4ED3\u4FA7\uFF08\u6D89\u53CA\u65F6\uFF09\n\n| \u5751 | \u771F\u76F8 | \u5BF9\u7B56 |\n|---|---|---|\n| `cargo test --lib` \u4E0D\u53EF\u7528 | Tauri DLL \u542F\u52A8\u9650\u5236 | `cargo check` + \u524D\u7AEF vitest \u4EE3\u66FF |\n| cargo check \u627E\u4E0D\u5230 Cargo.toml | \u4ED3\u5E93\u6839\u6CA1\u6709\uFF0C\u5728 `src-tauri/` \u4E0B\u8DD1 | `cd src-tauri && cargo check` |\n| \u547D\u4EE4\u95E8\u63A7\u53CC\u65B9\u5411 | \u6F0F gate \u6216\u8F85\u52A9\u51FD\u6570\u5F15\u7528\u88AB\u95E8\u63A7\u5BFC\u5165\u90FD\u4F1A\u6302 | \u6539\u547D\u4EE4\u5C42\u5FC5\u8DD1 `cargo check --no-default-features --bin polaris-web --bin polaris-mcp` |\n";

// shared/kb/workflow.md
var workflow_default = "# AI \u5EFA\u63D2\u4EF6\u63A8\u8350\u6D41\u7A0B\uFF08\u5148\u8BFB\u6211\uFF09\n\n**\u7ED9 AI \u7684 SOP**\uFF1A\u7528\u6237\u8BF4\u300C\u5E2E\u6211\u521B\u5EFA\u4E00\u4E2A\u63D2\u4EF6\u300D\u300C\u7ED9 Polaris \u5199\u4E2A xxx\u300D\u65F6\uFF0C\u6309\u8FD9\u4E2A\u6D41\u7A0B\u8D70\uFF0C\u6BCF\u6B65\u5F15\u7528\u5BF9\u5E94\u4E3B\u9898\u62FF\u7EC6\u8282\u3002\u76EE\u6807\u662F\u4E00\u6B21\u4EA4\u4ED8\u751F\u4EA7\u7EA7\uFF0C\u4E0D\u8FD4\u5DE5\u3002\n\n## 0. \u62C9\u77E5\u8BC6\uFF081 \u6B21\u5DE5\u5177\u8C03\u7528\uFF0C\u522B\u91CD\u65B0\u8003\u53E4\u9879\u76EE\uFF09\n\n```\nforge_overview \u2192 \u5E73\u53F0\u901F\u89C8 + \u5168\u90E8\u4E3B\u9898\u76EE\u5F55\n```\n\n\u6709\u5177\u4F53\u7591\u70B9\u518D `forge_search`/`forge_topic`\uFF08\u5982\u300C\u670D\u52A1\u600E\u4E48\u81EA\u4E3E start\u300D\u2192 forge_topic service-start\uFF09\u3002**\u4E0D\u8981\u518D\u901A\u8BFB\u4E3B\u4ED3/\u6837\u677F\u63D2\u4EF6\u6E90\u7801**\u2014\u2014\u672C\u5E93\u5DF2\u9010\u6761\u6838\u5B9E\u5E76\u6807\u6CE8\u4E0E\u5B98\u65B9\u6587\u6863\u7684\u51B2\u7A81\u5904\u3002\n\n## 1. \u5B9A\u6848\uFF08\u8DDF\u7528\u6237\u5BF9\u9F50\uFF0C30 \u79D2\uFF09\n\n- \u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\u3001\u6570\u636E\u653E\u54EA\uFF08kv \u952E\u7A7A\u95F4\u524D\u7F00\uFF09\u3001\u8981\u4E0D\u8981\u670D\u52A1\uFF08\u8981\u5916\u7F51/\u5B9A\u65F6\u2192\u8981\uFF09\u3001\u8981\u4E0D\u8981 MCP\uFF08AI \u64CD\u4F5C\u2192\u8981\uFF09\n- \u7528 `forge_scaffold`\uFF08MCP \u5DE5\u5177\uFF09\u751F\u6210\u9AA8\u67B6\u5E76\u843D\u76D8\uFF1A`{ id, name, prefix, icon, withService, withMcp, dir, confirm: true }`\n\n## 2. \u5B9A\u5951\u7EA6\uFF08\u5199\u4EE3\u7801\u524D\uFF0C\u9632\u8FD4\u5DE5\uFF09\n\n- \u952E\u7A7A\u95F4\u5951\u7EA6\u8868\uFF08keyspace \u4E3B\u9898\u6A21\u677F\uFF09\u2192 \u76F4\u63A5\u5199\u8FDB README\n- \u6570\u636E\u6A21\u578B\u4E0E\u5355\u5199\u8005\u8FB9\u754C\uFF08\u8C01\u5199\u54EA\u4E9B\u952E\uFF0C\u5176\u4ED6\u4EBA\u600E\u4E48\u53D1\u4EE4\uFF09\u2192 single-writer\n- \u8DE8\u57DF\u8DEF\u5F84\uFF1A\u9762\u677F\u7EDD\u4E0D fetch\uFF1B\u6293\u53D6\u4E0B\u6C89\u670D\u52A1\uFF1Bcap.http \u53EA\u5F53\u684C\u9762\u52A0\u901F \u2192 cross-origin\n\n## 3. \u5B9E\u73B0\uFF08\u63A8\u8350\u987A\u5E8F\uFF09\n\n1. `shared/<x>-core.js` \u7EAF\u51FD\u6570\u6838\u5FC3\uFF08\u89E3\u6790/\u89C4\u8303\u5316/\u4E1A\u52A1\u89C4\u5219\uFF09\u2014\u2014**\u5148\u5199\u5B83\u5E76\u914D\u5355\u6D4B**\uFF0C\u5751\u5728\u8FD9\u91CC\u66B4\u9732\u6700\u4FBF\u5B9C\n2. \u670D\u52A1\u8FDB\u7A0B\uFF08kvclient \u6284\u811A\u624B\u67B6\uFF0Ctick \u5FAA\u73AF + \u547D\u4EE4\u6D88\u8D39 + \u5FC3\u8DF3\uFF09\u2192 `service`\n3. \u9762\u677F\uFF08Panel + Tabs\uFF1B\u670D\u52A1\u7BA1\u7406\u5361\u8981\u81EA\u4E3E start \u2192 service-start\uFF1BUI \u5751 \u2192 ui-ux\uFF09\n4. MCP server\uFF08\u5DE5\u5177 description \u5199\u300C\u9002\u7528\u53E5\u5F0F\u300D\u2192 mcp\uFF09\n\n## 4. \u9A8C\u8BC1\uFF08\u4E09\u5C42\u5168\u7EFF\u624D\u7B97\u5B8C\u6210\uFF09\u2192 testing\n\n- `node test/run-tests.mjs`\uFF08\u79BB\u7EBF\u5355\u6D4B\uFF09\n- `npm run typecheck && npm run build`\n- `node test/smoke-real.mjs`\uFF08\u771F\u5B9E\u6865\u5192\u70DF\uFF1A\u62A4\u680F\u68C0\u67E5 \u2192 \u8D77\u771F\u670D\u52A1\u771F MCP \u2192 \u771F\u5B9E\u5916\u7F51\u7528\u4F8B \u2192 \u81EA\u6E05\u7406 \u2192 N/N \u62A5\u544A\uFF09\n- \u751F\u4EA7\u7EA7\u5BF9\u7167 \u2192 production-checklist\uFF08\u9010\u6761\u8FC7\uFF09\n\n## 5. \u53D1\u5E03\uFF08\u4E09\u5751\u5728\u524D\u9762\u7B49\u4F60\uFF09\u2192 publishing\n\n\u624B\u52A8\u52A0 index.json \u6761\u76EE\uFF08\u5148\u91CD\u8BFB\u73B0\u6587\u4EF6\uFF01\u5E76\u53D1\u8986\u76D6\u4E8B\u6545\u4E24\u6B21\u5B9E\u5F55\uFF09\u2192 pack \u2192 sha \u5199\u56DE \u2192 update.json \u540C\u6B65 \u2192 validate.js\n\n## \u5E38\u89C1\u8DD1\u504F\n\n- \u274C \u4E00\u4E0A\u6765\u901A\u8BFB\u4E3B\u4ED3\u6E90\u7801\u534A\u5929 \u2192 \u5E93\u91CC\u5DF2\u6709\u7ED3\u8BBA\uFF0Cforge_topic \u79D2\u62FF\n- \u274C \u9762\u677F\u76F4\u63A5 fetch \u5916\u7F51\u300C\u5148\u8DD1\u901A\u518D\u8BF4\u300D\u2192 CORS \u767D\u5C4F\uFF0C\u56DE\u5934\u91CD\u505A\n- \u274C \u4E00\u952E\u4E00\u5B9E\u4F53\u5199 kv \u2192 list \u5168\u5C40\u53D8\u6162\uFF0C\u8FD4\u5DE5\u5206\u5757\n- \u274C \u5148\u5199 UI \u540E\u5199\u6838\u5FC3 \u2192 \u5355\u6D4B\u6CA1\u5904\u6302\uFF0C\u5751\u5168\u5728\u8054\u8C03\u671F\u7206\n- \u274C \u6CA1\u8DD1\u5192\u70DF\u5C31\u8BF4\u300C\u5DF2\u5B8C\u6210\u300D\u2192 \u7528\u6237\u6309 AGENTS.md \u8981\u6C42\u5982\u5B9E\u62A5\u544A\u9A8C\u8BC1\u7ED3\u679C\n";

// src/kbBodies.ts
var KB_BODIES = {
  overview: overview_default,
  manifest: manifest_default,
  panel: panel_default,
  "cross-origin": cross_origin_default,
  service: service_default,
  "service-start": service_start_default,
  "single-writer": single_writer_default,
  keyspace: keyspace_default,
  mcp: mcp_default,
  caps: caps_default,
  testing: testing_default,
  publishing: publishing_default,
  "ui-ux": ui_ux_default,
  "production-checklist": production_checklist_default,
  pitfalls: pitfalls_default,
  workflow: workflow_default
};

// src/KbTab.tsx
var import_forge_core = __toESM(require_forge_core());
import { jsx, jsxs } from "react/jsx-runtime";
var S = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, height: "100%" },
  search: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit",
    fontSize: 13
  },
  list: { display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" },
  card: {
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    background: "var(--p-panel, rgba(128,128,128,.08))"
  },
  title: { fontWeight: 600, fontSize: 13 },
  summary: { fontSize: 12, color: "var(--p-text-dim, #999)", marginTop: 2, lineHeight: 1.5 },
  body: {
    padding: 14,
    borderRadius: 10,
    background: "var(--p-panel, rgba(128,128,128,.08))",
    whiteSpace: "pre-wrap",
    fontSize: 12.5,
    lineHeight: 1.75,
    overflowY: "auto"
  },
  tag: {
    display: "inline-block",
    margin: "4px 6px 0 0",
    padding: "1px 8px",
    borderRadius: 999,
    fontSize: 11,
    background: "var(--p-chip, rgba(128,128,128,.15))"
  }
};
function KbTab() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const results = useMemo(() => {
    if (!query.trim()) return null;
    return (0, import_forge_core.searchTopics)(KB_META.topics, KB_BODIES, query);
  }, [query]);
  const openBody = openId ? KB_BODIES[openId] || "" : "";
  if (openId) {
    const meta = KB_META.topics.find((t) => t.id === openId);
    return /* @__PURE__ */ jsxs("div", { style: S.wrap, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setOpenId(null),
            style: { background: "transparent", border: "none", color: "var(--p-accent, #4a7dff)", cursor: "pointer", padding: 0, fontSize: 13 },
            children: "\u2190 \u8FD4\u56DE\u5217\u8868"
          }
        ),
        /* @__PURE__ */ jsx("strong", { style: { marginLeft: 10 }, children: meta?.title })
      ] }),
      /* @__PURE__ */ jsx("div", { style: S.body, children: openBody })
    ] });
  }
  const list = results ? results.map((r) => ({ meta: r.meta, snippet: (0, import_forge_core.snippetFor)(KB_BODIES[r.meta.id] || "", query) })) : KB_META.topics.map((t) => ({ meta: t }));
  return /* @__PURE__ */ jsxs("div", { style: S.wrap, children: [
    /* @__PURE__ */ jsx(
      "input",
      {
        style: S.search,
        placeholder: "\u641C\u7D22\u5E73\u53F0\u77E5\u8BC6\uFF08\u5982\uFF1A\u8DE8\u57DF / \u5355\u5199\u8005 / \u5192\u70DF / \u56FE\u6807\u767D\u540D\u5355 / \u53D1\u5E03\uFF09\u2026",
        value: query,
        onChange: (e) => setQuery(e.target.value)
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)" }, children: [
      KB_META.topics.length,
      " \u4E2A\u4E3B\u9898 \xB7 \u6570\u636E\u7248\u672C ",
      KB_META.updatedAt,
      " \xB7 \u5168\u90E8\u7ED3\u8BBA\u4EE3\u7801\u7EA7\u6838\u5B9E\uFF0C\u4E0E\u5B98\u65B9\u6587\u6863\u51B2\u7A81\u5904\u5DF2\u6807\u6CE8"
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.list, children: [
      list.map(({ meta, snippet }) => /* @__PURE__ */ jsxs("div", { style: S.card, onClick: () => setOpenId(meta.id), children: [
        /* @__PURE__ */ jsx("div", { style: S.title, children: meta.title }),
        /* @__PURE__ */ jsx("div", { style: S.summary, children: snippet || meta.summary }),
        /* @__PURE__ */ jsx("div", { children: meta.tags.slice(0, 6).map((t) => /* @__PURE__ */ jsx("span", { style: S.tag, children: t }, t)) })
      ] }, meta.id)),
      list.length === 0 && /* @__PURE__ */ jsxs("div", { style: { color: "var(--p-text-dim, #999)", padding: 12 }, children: [
        "\u6CA1\u6709\u5339\u914D\u300C",
        query,
        "\u300D\u7684\u4E3B\u9898\u3002\u8BD5\u8BD5\uFF1A\u8DE8\u57DF\u3001\u5192\u70DF\u3001\u53D1\u5E03\u3001\u5355\u5199\u8005\u3002"
      ] })
    ] })
  ] });
}

// src/LintTab.tsx
var import_forge_core2 = __toESM(require_forge_core());
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var S2 = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  area: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 180,
    padding: 10,
    borderRadius: 8,
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit",
    fontSize: 12,
    fontFamily: "monospace"
  },
  btn: {
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: "var(--p-accent, #4a7dff)",
    color: "#fff",
    alignSelf: "flex-start"
  },
  group: { padding: "10px 12px", borderRadius: 8 },
  issueRule: { fontFamily: "monospace", fontSize: 11, opacity: 0.75 }
};
function IssueList({ kind, issues }) {
  if (!issues.length) return null;
  const bg = kind === "error" ? "rgba(220,70,70,.12)" : kind === "warn" ? "rgba(230,170,40,.12)" : "var(--p-panel, rgba(128,128,128,.08))";
  const icon = kind === "error" ? "\u2717" : kind === "warn" ? "\u26A0" : "\u2139";
  const label = kind === "error" ? "\u9519\u8BEF\uFF08\u4F1A\u88AB\u62D2/\u5FC5\u70B8\uFF09" : kind === "warn" ? "\u8B66\u544A\uFF08\u8E29\u8FC7\u5751\u7684\uFF09" : "\u63D0\u793A";
  return /* @__PURE__ */ jsxs2("div", { style: { ...S2.group, background: bg }, children: [
    /* @__PURE__ */ jsxs2("div", { style: { fontWeight: 600, marginBottom: 6 }, children: [
      icon,
      " ",
      label,
      "\uFF08",
      issues.length,
      "\uFF09"
    ] }),
    issues.map((it, i) => /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 8, lineHeight: 1.6 }, children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsxs2("span", { style: S2.issueRule, children: [
          "[",
          it.rule,
          "]"
        ] }),
        " ",
        it.msg
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)" }, children: [
        "\u2192 ",
        it.fix
      ] })
    ] }, i))
  ] });
}
function LintTab() {
  const [text, setText] = useState2("");
  const [ran, setRan] = useState2(false);
  const report = useMemo2(() => ran ? (0, import_forge_core2.lintManifest)(text) : null, [ran, text]);
  const onFile = async (f) => {
    if (!f) return;
    setText(await f.text());
    setRan(true);
  };
  return /* @__PURE__ */ jsxs2("div", { style: S2.wrap, children: [
    /* @__PURE__ */ jsx2("div", { style: { fontSize: 12, color: "var(--p-text-dim, #999)" }, children: "\u7C98\u8D34 plugin.json \u5185\u5BB9\uFF08\u6216\u9009\u6587\u4EF6\uFF09\u2192 \u6309 20+ \u6761\u5B9E\u6D4B\u89C4\u5219\u4F53\u68C0\uFF1A\u5FC5\u586B\u9879\u3001\u56FE\u6807 18 \u767D\u540D\u5355\u3001\u670D\u52A1\u5065\u5EB7\u68C0\u67E5\u3001MCP \u58F0\u660E\u3001\u53D1\u5E03 URL @tag \u9677\u9631\u2026\u2026" }),
    /* @__PURE__ */ jsx2("input", { type: "file", accept: ".json,application/json", onChange: (e) => onFile(e.target.files?.[0]) }),
    /* @__PURE__ */ jsx2(
      "textarea",
      {
        style: S2.area,
        placeholder: '{\n  "id": "my-plugin",\n  "name": "\u6211\u7684\u63D2\u4EF6",\n  "version": "0.1.0",\n  ...\n}',
        value: text,
        onChange: (e) => {
          setText(e.target.value);
          setRan(false);
        }
      }
    ),
    /* @__PURE__ */ jsx2("button", { style: S2.btn, onClick: () => setRan(true), disabled: !text.trim(), children: "\u5F00\u59CB\u4F53\u68C0" }),
    report && /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { style: { fontWeight: 600, margin: "4px 0 8px" }, children: [
        report.ok ? "\u2705 \u901A\u8FC7\uFF08\u65E0\u9519\u8BEF\uFF09" : "\u274C \u6709\u9519\u8BEF\uFF0C\u4FEE\u5B8C\u518D\u53D1",
        " \xB7 \u5171\u68C0\u67E5 ",
        report.checked,
        " \u9879 \xB7 \u9519\u8BEF ",
        report.errors.length,
        " / \u8B66\u544A ",
        report.warns.length,
        " / \u63D0\u793A ",
        report.infos.length
      ] }),
      /* @__PURE__ */ jsx2(IssueList, { kind: "error", issues: report.errors }),
      /* @__PURE__ */ jsx2(IssueList, { kind: "warn", issues: report.warns }),
      /* @__PURE__ */ jsx2(IssueList, { kind: "info", issues: report.infos })
    ] })
  ] });
}

// src/ScaffoldTab.tsx
var import_forge_core3 = __toESM(require_forge_core());
import { useEffect, useMemo as useMemo3, useState as useState3 } from "react";

// shared/scaffold/manifest.json
var manifest_default2 = {
  comment: "\u811A\u624B\u67B6\u6A21\u677F\u6E05\u5355\uFF1A\u6A21\u677F\u6587\u4EF6\u540D \u2192 \u751F\u6210\u76EE\u6807\u76F8\u5BF9\u8DEF\u5F84\u3002\u6A21\u677F\u6587\u4EF6\u4E00\u5F8B .txt\uFF08esbuild text loader \u5185\u8054 / node fs \u8BFB\u53D6\uFF09\uFF0C\u5185\u5BB9\u91CC\u7684 {{TOKEN}} \u7531 forge-core.buildScaffold \u66FF\u6362\u3002",
  map: {
    "package.json.txt": "package.json",
    "tsconfig.json.txt": "tsconfig.json",
    "pluginignore.txt": ".pluginignore",
    "src_host.ts.txt": "src/host.ts",
    "src_index.tsx.txt": "src/index.tsx",
    "src_model.ts.txt": "src/model.ts",
    "src_Panel.tsx.txt": "src/Panel.tsx",
    "shared_core.js.txt": "shared/core.js",
    "service_kvclient.js.txt": "service/kvclient.js",
    "service_main.js.txt": "service/main.js",
    "mcp_server.js.txt": "mcp/server.js",
    "test_run-tests.mjs.txt": "test/run-tests.mjs",
    "test_smoke-real.mjs.txt": "test/smoke-real.mjs",
    "README.md.txt": "README.md"
  }
};

// shared/scaffold/package.json.txt
var package_json_default = '{\n  "name": "{{PLUGIN_ID}}-panel",\n  "version": "0.1.0",\n  "private": true,\n  "description": "{{PLUGIN_ID}} \u63D2\u4EF6\u9762\u677F\uFF08\u6253\u5305\u7528\uFF09\uFF1A{{PLUGIN_NAME}}",\n  "scripts": {\n    "build": "esbuild src/index.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic --external:react --external:react/jsx-runtime",\n    "typecheck": "tsc --noEmit"\n  },\n  "devDependencies": {\n    "@types/react": "^18.3.31",\n    "esbuild": "^0.23.0",\n    "typescript": "^5.5.0"\n  }\n}\n';

// shared/scaffold/tsconfig.json.txt
var tsconfig_json_default = '{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "ESNext",\n    "moduleResolution": "Bundler",\n    "jsx": "react-jsx",\n    "strict": true,\n    "esModuleInterop": true,\n    "skipLibCheck": true,\n    "noEmit": true,\n    "lib": ["ES2020", "DOM", "DOM.Iterable"]\n  },\n  "include": ["src"]\n}\n';

// shared/scaffold/pluginignore.txt
var pluginignore_default = "# \u7248\u672C\u63A7\u5236 / IDE\n.git/\n.gitignore\n\n# \u4F9D\u8D56\u4E0E\u6784\u5EFA\u8F93\u5165\uFF08\u9762\u677F bundle \u5DF2\u542B\u4EA7\u7269\uFF1B\u670D\u52A1\u4E0E MCP \u96F6\u4F9D\u8D56\uFF0C\u4E0D\u9700\u8981 node_modules\uFF09\nnode_modules/\npackage.json\npackage-lock.json\n\n# \u9762\u677F\u6E90\u7801\uFF08dist/panel.js \u5DF2\u662F\u6784\u5EFA\u4EA7\u7269\uFF09\nsrc/\ntsconfig.json\n\n# \u6D4B\u8BD5\uFF08\u4ED3\u5E93\u5185\u8FD0\u884C\uFF0C\u4E0D\u8FDB\u5B89\u88C5\u5305\uFF09\ntest/\n\n# \u6587\u6863\nREADME.md\n\n# \u6253\u5305\u4EA7\u7269\u81EA\u8EAB\n*.zip\n";

// shared/scaffold/src_host.ts.txt
var src_host_ts_default = "/**\n * \u5BBF\u4E3B API \u8BBF\u95EE\u5C42\uFF08\u4E0E page-sentinel / clip-relay / pocket-host \u540C\u4E00\u9A8C\u8BC1\u8FC7\u7684\u6A21\u5F0F\uFF09\n *\n * \u9762\u677F\u6570\u636E\u5168\u90E8\u8D70\u5BBF\u4E3B\u66B4\u9732\u7684 invoke \u901A\u9053\uFF08window.__POLARIS_HOST_INVOKE__\uFF09\uFF1A\n *   - \u684C\u9762 Tauri\uFF1A\u76F4\u8FDE\u540E\u7AEF IPC\uFF08Bootstrap\uFF09\n *   - \u624B\u673A\u6D4F\u89C8\u5668 / Web\uFF1A\u81EA\u52A8\u53D6\u6B63\u786E\u670D\u52A1\u5730\u5740\u5E76\u643A\u5E26 Bearer token\uFF08Remote\uFF09\n *\n * \u9762\u677F\u81EA\u8EAB\u7EDD\u4E0D\u76F4\u63A5 fetch \u4EFB\u4F55\u5730\u5740\u2014\u2014\u5916\u7F51\u6293\u53D6\u7531\u540E\u53F0\u670D\u52A1\u539F\u751F\u6267\u884C\n * \uFF08\u6D4F\u89C8\u5668\u540C\u6E90\u7B56\u7565\u7BA1\u4E0D\u5230\u670D\u52A1\u8FDB\u7A0B\uFF09\uFF0C\u8FD9\u662F\u8DE8\u57DF\u95EE\u9898\u7684\u6839\u6CBB\u70B9\u3002\n */\nexport type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>\n\ninterface HostGlobals {\n  __POLARIS_HOST_INVOKE__?: HostInvoke\n}\n\nfunction hostWindow(): HostGlobals & typeof globalThis {\n  return window as unknown as HostGlobals & typeof globalThis\n}\n\n/** \u83B7\u53D6\u5BBF\u4E3B invoke \u901A\u9053\uFF1B\u7F3A\u5931\u65F6\u629B\u6E05\u6670\u9519\u8BEF\uFF08\u63D0\u793A\u9700\u66F4\u65B0\u4E3B\u5E94\u7528\uFF09 */\nexport function getHostInvoke(): HostInvoke {\n  const invoke = hostWindow().__POLARIS_HOST_INVOKE__\n  if (!invoke) {\n    throw new Error('\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09')\n  }\n  return invoke\n}\n";

// shared/scaffold/src_index.tsx.txt
var src_index_tsx_default = "/**\n * \u5165\u53E3\uFF1A{{PLUGIN_NAME}}\u9762\u677F\uFF08dist/panel.js\uFF0C\u5BBF\u4E3B\u6309 mod.default \u52A0\u8F7D\uFF09\n */\nimport {{PANEL_TYPE}}Panel from './Panel'\n\nexport default function {{PANEL_TYPE}}Entry(props: {\n  pluginId: string\n  onSendToChat?: (message: string) => void | Promise<void>\n}) {\n  return <{{PANEL_TYPE}}Panel {...props} />\n}\n";

// shared/scaffold/src_model.ts.txt
var src_model_ts_default = "/**\n * \u901A\u4FE1\u5C42 + \u6570\u636E\u8BBF\u95EE\uFF08{{PLUGIN_NAME}}\u9762\u677F\uFF09\n *\n * \u7EDF\u4E00\u7ECF\u5BBF\u4E3B invoke \u901A\u9053\u8C03 router_dispatch\uFF1B\u9762\u677F\u4E0E\u540E\u53F0\u670D\u52A1\u3001MCP server\n * \u8BFB\u5199\u540C\u4E00\u4E2A cap.kv \u7684 {{PREFIX}}.* \u952E\u7A7A\u95F4\uFF08\u5951\u7EA6\u89C1 README \u6743\u5A01\u8868\uFF09\u3002\n */\nimport { getHostInvoke } from './host'\n\nexport interface Settings {\n  // TODO: \u6309\u4E1A\u52A1\u8865\u9F50\u8BBE\u7F6E\u5B57\u6BB5\uFF08\u670D\u52A1\u6BCF 30s \u70ED\u8BFB\u4E00\u6B21\uFF09\n  example: boolean\n}\n\nexport function normalizeSettings(raw: unknown): Settings {\n  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>\n  return {\n    example: r.example === true,\n  }\n}\n\n// \u2500\u2500 cap \u901A\u9053 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nasync function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {\n  const res = await getHostInvoke()<{ ok: boolean; result?: T; error?: string }>('router_dispatch', { req: { target, payload } })\n  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`)\n  return (res.result ?? {}) as T\n}\n\nexport async function kvGet<T = unknown>(key: string): Promise<T | null> {\n  // \u8BFB\u53EF\u80FD\u649E\u5E76\u53D1\u5220\u9664\uFF1A\u5BB9\u5FCD\u4EFB\u4F55\u5931\u8D25\u8FD4\u56DE null\n  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key }).catch(() => null)\n  return ((r && r.value) ?? null) as T | null\n}\n\nexport async function kvSet(key: string, value: unknown): Promise<void> {\n  await capDispatch('cap.kv', { action: 'set', key, value })\n}\n\nexport async function kvDel(key: string): Promise<void> {\n  await capDispatch('cap.kv', { action: 'delete', key }).catch(() => {})\n}\n\nexport async function kvKeys(): Promise<string[]> {\n  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' }).catch(() => null)\n  return (r && Array.isArray(r.keys)) ? r.keys : []\n}\n\n// \u2500\u2500 \u952E\u7A7A\u95F4\uFF08\u4E0E service/main.js\u3001mcp/server.js \u4E09\u65B9\u4E00\u81F4\uFF0CREADME \u4E3A\u6743\u5A01\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\nexport const K = {\n  settings: '{{PREFIX}}.settings',\n  meta: '{{PREFIX}}.meta',\n}\n\nexport async function loadSettings(): Promise<Settings> {\n  return normalizeSettings(await kvGet(K.settings))\n}\n\nexport async function saveSettings(s: Settings): Promise<void> {\n  await kvSet(K.settings, s)\n}\n\nexport interface Meta {\n  version?: string\n  pid?: number\n  startedAt?: number\n  lastTickAt?: number\n  degraded?: boolean\n  bridge?: string\n}\n\nexport async function loadMeta(): Promise<Meta | null> {\n  return kvGet<Meta>(K.meta)\n}\n";

// shared/scaffold/src_Panel.tsx.txt
var src_Panel_tsx_default = "/**\n * {{PLUGIN_NAME}}\u9762\u677F\uFF08Tab \u7EC4\u88C5 + \u72B6\u6001\u6982\u89C8\uFF09\n *\n * \u60EF\u4F8B\uFF1APanel.tsx \u7EC4\u88C5 Tab \u4E0E\u5168\u5C40\u72B6\u6001\uFF1B\u6BCF\u4E2A Tab \u4E00\u4E2A\u6587\u4EF6\uFF08\u6B64\u5904\u7CBE\u7B80\u4E3A\u5355\u6587\u4EF6\uFF0C\n * \u4E1A\u52A1\u957F\u5927\u540E\u6309 XxxTab.tsx \u62C6\u5206\uFF09\u3002\u6837\u5F0F\u5185\u8054\uFF0C\u989C\u8272/\u5B57\u53F7\u9075\u5B88\u4E3B\u9898 token\u3002\n */\nimport React, { useEffect, useState } from 'react'\nimport { K, loadMeta, loadSettings, saveSettings, type Meta, type Settings } from './model'\n\ntype Tab = 'home' | 'settings'\n\nconst tabBtn = (active: boolean): React.CSSProperties => ({\n  padding: '6px 14px',\n  borderRadius: 8,\n  border: 'none',\n  cursor: 'pointer',\n  background: active ? 'var(--p-accent, #4a7dff)' : 'transparent',\n  color: active ? '#fff' : 'inherit',\n})\n\nexport default function {{PANEL_TYPE}}Panel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {\n  const [tab, setTab] = useState<Tab>('home')\n  const [meta, setMeta] = useState<Meta | null>(null)\n  const [settings, setSettings] = useState<Settings | null>(null)\n  const [err, setErr] = useState('')\n\n  useEffect(() => {\n    let alive = true\n    const load = async () => {\n      try {\n        const [m, s] = await Promise.all([loadMeta(), loadSettings()])\n        if (!alive) return\n        setMeta(m)\n        setSettings(s)\n        setErr('')\n      } catch (e) {\n        if (alive) setErr(String((e as Error).message || e))\n      }\n    }\n    load()\n    const timer = setInterval(load, 15000)\n    return () => { alive = false; clearInterval(timer) }\n  }, [])\n\n  const svcAlive = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1000)\n\n  return (\n    <div style={{ padding: 16, fontFamily: 'inherit', fontSize: 13, color: 'var(--p-text, inherit)', maxWidth: 860, margin: '0 auto' }}>\n      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>\n        <strong style={{ fontSize: 15 }}>{{PLUGIN_NAME}}</strong>\n        <span style={{ flex: 1 }} />\n        <button style={tabBtn(tab === 'home')} onClick={() => setTab('home')}>\u6982\u89C8</button>\n        <button style={tabBtn(tab === 'settings')} onClick={() => setTab('settings')}>\u8BBE\u7F6E</button>\n      </div>\n\n      {err && (\n        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(220,80,80,.12)', marginBottom: 12 }}>\n          \u52A0\u8F7D\u5931\u8D25\uFF1A{err}\n        </div>\n      )}\n\n      {tab === 'home' && (\n        <div>\n          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--p-panel, rgba(128,128,128,.08))', marginBottom: 12 }}>\n            \u670D\u52A1\u72B6\u6001\uFF1A{meta\n              ? (svcAlive ? '\u2705 \u8FD0\u884C\u4E2D' : '\u26A0\uFE0F \u5FC3\u8DF3\u8FC7\u671F\uFF08\u670D\u52A1\u53EF\u80FD\u5DF2\u505C\u6B62\uFF09')\n              : '\u2014 \u5C1A\u65E0\u5FC3\u8DF3\uFF08\u670D\u52A1\u672A\u8FD0\u884C\u6216\u5C1A\u672A\u542F\u52A8\uFF09'}\n            {meta?.bridge ? `\uFF08\u6865 ${meta.bridge}\uFF09` : ''}\n            {meta?.degraded ? ' \xB7 \u964D\u7EA7\u4E2D' : ''}\n          </div>\n          <div style={{ lineHeight: 1.9, color: 'var(--p-text-dim, #999)' }}>\n            <div>\u8FD9\u91CC\u66FF\u6362\u4E3A\u4E1A\u52A1\u6982\u89C8\uFF1A\u6838\u5FC3\u6307\u6807\u3001\u5FEB\u901F\u5165\u53E3\u3001\u7A7A\u6001\u5F15\u5BFC\u3002</div>\n            <div>\u6709 MCP \u5DE5\u5177\u65F6\uFF0C\u5728\u6B64\u544A\u8BC9\u7528\u6237\u53EF\u4EE5\u5BF9 AI \u8BF4\u4EC0\u4E48\uFF08\u4F8B\uFF1A\u300C\u5E2E\u6211\u628A\u8FD9\u6761\u2026\u300D\uFF09\u3002</div>\n          </div>\n        </div>\n      )}\n\n      {tab === 'settings' && settings && (\n        <div>\n          <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>\n            <input\n              type=\"checkbox\"\n              checked={settings.example}\n              onChange={(e) => {\n                const next = { ...settings, example: e.target.checked }\n                setSettings(next)\n                saveSettings(next).catch((ex) => setErr(String((ex as Error).message || ex)))\n              }}\n            />\n            \u793A\u4F8B\u8BBE\u7F6E\uFF08\u670D\u52A1\u7EA6 30 \u79D2\u5185\u70ED\u751F\u6548\uFF09\n          </label>\n          <div style={{ color: 'var(--p-text-dim, #999)', marginTop: 8 }}>\n            \u6570\u636E\u4FDD\u5B58\u5728 cap.kv \u7684 <code>{K.settings}</code>\uFF1B\u6E05\u9664\u6570\u636E = \u5220\u9664\u5168\u90E8 <code>{{PREFIX_DOT}}*</code> \u952E\u3002\n          </div>\n        </div>\n      )}\n    </div>\n  )\n}\n";

// shared/scaffold/shared_core.js.txt
var shared_core_js_default = "'use strict';\n/**\n * core.js \u2014\u2014 {{PLUGIN_NAME}}\u7EAF\u51FD\u6570\u6838\u5FC3\uFF08\u96F6\u4F9D\u8D56\uFF0CCommonJS\uFF09\n *\n * \u9762\u677F\uFF08esbuild bundle\uFF09\u4E0E MCP / \u670D\u52A1\uFF08node require\uFF09\u5171\u7528\u540C\u4E00\u4EFD\u4E1A\u52A1\u8BA1\u7B97\uFF0C\n * \u4FDD\u8BC1\u4E09\u7AEF\u53E3\u5F84\u4E00\u81F4\uFF08pocket-ledger/data-ark \u9A8C\u8BC1\u8FC7\u7684 shared core \u6A21\u5F0F\uFF09\u3002\n * \u53EF\u6D4B\u903B\u8F91\u5168\u90E8\u653E\u8FD9\u91CC\uFF0Ctest/run-tests.mjs \u76F4\u6D4B\u672C\u6587\u4EF6\u3002\n */\n\n/** \u793A\u4F8B\uFF1A\u8BBE\u7F6E\u89C4\u8303\u5316\uFF08\u975E\u6CD5\u8F93\u5165\u56DE\u843D\u9ED8\u8BA4\u503C\uFF0C\u7EDD\u4E0D\u629B\u9519\uFF09 */\nfunction normalizeSettings(raw) {\n  const r = (raw && typeof raw === 'object') ? raw : {};\n  return { example: r.example === true };\n}\n\n/** \u793A\u4F8B\uFF1A\u628A\u4E1A\u52A1\u89C4\u5219\u5199\u6210\u7EAF\u51FD\u6570 \u2014\u2014 \u8F93\u5165\u2192\u8F93\u51FA\uFF0C\u4E0D\u78B0 kv/fetch/fs */\nfunction planSomething(items, settings, now) {\n  if (!Array.isArray(items)) return [];\n  return items.filter((it) => it && it.enabled !== false);\n}\n\nmodule.exports = { normalizeSettings, planSomething };\n";

// shared/scaffold/service_kvclient.js.txt
var service_kvclient_js_default = "'use strict';\n/**\n * kvclient.js \u2014\u2014 Polaris IPC Bridge \u5BA2\u6237\u7AEF\uFF08\u96F6\u4F9D\u8D56\uFF1B\u4E0E page-sentinel / clip-relay /\n * pocket-host \u540C\u4E00\u5957\u9A8C\u8BC1\u8FC7\u7684\u6837\u677F\uFF0C\u52FF\u6539\u534F\u8BAE\uFF09\n *\n * \u5168\u90E8\u6570\u636E\u8BFB\u5199\u7ECF POST /api/router-dispatch\uFF08target=cap.*\uFF09\u900F\u4F20\u5230\u5BBF\u4E3B RouterBus\uFF0C\n * \u4E0E\u9762\u677F / MCP server \u5171\u4EAB\u540C\u4E00\u4EFD\u4E8B\u5B9E\u5E93\uFF08cap.kv domain=kv\uFF09\u3002\n *\n * \u7AEF\u70B9\u81EA\u53D1\u73B0\uFF08Polaris \u4E0D\u5411\u63D2\u4EF6\u670D\u52A1\u6CE8\u5165\u73AF\u5883\u53D8\u91CF\uFF0C\u987B\u81EA\u884C\u5B9A\u4F4D\uFF09\uFF1A\n *   1. env POLARIS_HOST + POLARIS_PORT + POLARIS_TOKEN\uFF08\u82E5\u672A\u6765\u5BBF\u4E3B\u6CE8\u5165\u5219\u4F18\u5148\u751F\u6548\uFF09\n *   2. anchor.json \u2192 dataRoot/config.json\uFF08web.port/token\uFF09\n *      \u515C\u5E95\u5019\u9009\uFF1AAPP_CONFIG_DIR/config.json\u3001%APPDATA%/Polaris/config.json \u7B49\n *   3. \u4ECE config \u7AEF\u53E3\u5411\u4E0A\u626B\u63CF 25 \u4E2A\u7AEF\u53E3\uFF0C/api/health 200 \u5373\u547D\u4E2D\n *\n * \u9274\u6743\uFF1AAuthorization: Bearer md5(web.token)\uFF0C\u4E0E\u5BBF\u4E3B web middleware \u5BF9\u9F50\u3002\n */\nconst http = require('http');\nconst fs = require('fs');\nconst path = require('path');\nconst os = require('os');\nconst crypto = require('crypto');\n\nconst SCAN_PORTS = 25;\nconst HEALTH_TIMEOUT_MS = 1200;\nconst REQUEST_TIMEOUT_MS = 30000;\n\nfunction md5(s) {\n  return crypto.createHash('md5').update(String(s)).digest('hex');\n}\n\nfunction configCandidates(appConfigDir) {\n  const cands = [];\n  for (const anchor of [\n    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',\n    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),\n    path.join(os.homedir(), '.polaris', 'anchor.json'),\n  ]) {\n    try {\n      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));\n      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {\n        cands.push(path.join(a.dataRoot, 'config.json'));\n      }\n    } catch (_) { /* \u8DF3\u8FC7\u4E0D\u53EF\u8BFB\u5019\u9009 */ }\n  }\n  if (appConfigDir) cands.push(path.join(appConfigDir, 'config.json'));\n  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));\n  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));\n  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));\n  return cands;\n}\n\nfunction loadWebConfig(appConfigDir) {\n  for (const p of configCandidates(appConfigDir)) {\n    try {\n      const root = JSON.parse(fs.readFileSync(p, 'utf8'));\n      const web = root.web || {};\n      if (typeof web.port === 'number' && web.port > 0) {\n        return { host: web.host || '', port: web.port, token: web.token || '' };\n      }\n    } catch (_) { /* \u8DF3\u8FC7 */ }\n  }\n  return null;\n}\n\nfunction healthOnce(host, port) {\n  return new Promise((resolve) => {\n    const req = http.get(\n      { hostname: host, port, path: '/api/health', timeout: HEALTH_TIMEOUT_MS },\n      (res) => { res.resume(); resolve(res.statusCode === 200); },\n    );\n    req.on('error', () => resolve(false));\n    req.on('timeout', () => { req.destroy(); resolve(false); });\n  });\n}\n\nasync function resolveEndpoint(appConfigDir) {\n  const envHost = process.env.POLARIS_HOST || '';\n  const envPort = parseInt(process.env.POLARIS_PORT || '', 10);\n  if (envHost && Number.isFinite(envPort)) {\n    return { host: envHost, port: envPort, token: process.env.POLARIS_TOKEN || '', via: 'env' };\n  }\n  const cfg = loadWebConfig(appConfigDir);\n  const cfgHost = (cfg && cfg.host) || '';\n  const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';\n  const basePort = cfg ? cfg.port : 3000;\n  const token = cfg ? cfg.token : '';\n  for (let i = 0; i < SCAN_PORTS; i++) {\n    // eslint-disable-next-line no-await-in-loop\n    if (await healthOnce(host, basePort + i)) {\n      return { host, port: basePort + i, token, via: 'scan' };\n    }\n  }\n  return { host, port: basePort, token, via: 'fallback' };\n}\n\n/**\n * @param opts {{appConfigDir?: string, log?: (level:string,msg:string)=>void}}\n */\nfunction createKvClient(opts) {\n  const log = (opts && opts.log) || (() => {});\n  const appConfigDir = (opts && opts.appConfigDir) || '';\n  let endpointPromise = null;\n  let endpoint = null;\n\n  function getEndpoint(force) {\n    if (!endpointPromise || force) {\n      endpointPromise = resolveEndpoint(appConfigDir).then((ep) => {\n        endpoint = ep;\n        log('info', `bridge endpoint: ${ep.host}:${ep.port} (via ${ep.via}${ep.token ? ', authed' : ', noauth'})`);\n        return ep;\n      });\n    }\n    return endpointPromise;\n  }\n\n  /**\n   * POST /api/router-dispatch\u3002\u91CD\u8BD5 2 \u6B21\u6307\u6570\u9000\u907F\uFF08\u5E42\u7B49\u8BFB\u5B89\u5168\uFF1B\u5BBF\u4E3B\u4FA7\u5199\u5165\u4E3A\n   * \u5355\u547D\u4EE4\u539F\u5B50\u64CD\u4F5C\uFF0C\u91CD\u8BD5\u4E0D\u4EA7\u751F\u53CC\u5199\uFF09\u3002\n   */\n  function dispatch(target, payload, { retries = 2, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {\n    const attempt = (n) => getEndpoint().then((ep) => new Promise((resolve, reject) => {\n      const data = JSON.stringify({ req: { target, payload } });\n      const headers = {\n        'Content-Type': 'application/json',\n        'Content-Length': Buffer.byteLength(data),\n      };\n      if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;\n      const req = http.request(\n        {\n          hostname: ep.host, port: ep.port, path: '/api/router-dispatch',\n          method: 'POST', headers, timeout: timeoutMs,\n        },\n        (res) => {\n          let body = '';\n          res.on('data', (c) => { body += c; });\n          res.on('end', () => {\n            try {\n              const parsed = JSON.parse(body);\n              resolve(parsed);\n            } catch (_) {\n              reject(new Error(`bridge \u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.statusCode}\uFF09`));\n            }\n          });\n        },\n      );\n      req.on('timeout', () => { req.destroy(new Error('bridge timeout')); });\n      req.on('error', (e) => {\n        if (n < retries) {\n          log('warn', `dispatch \u91CD\u8BD5 ${n + 1}/${retries}: ${e.message}`);\n          setTimeout(() => attempt(n + 1).then(resolve, reject), 300 * Math.pow(2, n));\n        } else reject(e);\n      });\n      req.write(data);\n      req.end();\n    }));\n    return attempt(0);\n  }\n\n  /** \u5931\u8D25\u629B\u9519\u7684 dispatch \u5305\u88C5\uFF08\u533A\u5206\u80FD\u529B\u5931\u8D25\u4E0E\u4F20\u8F93\u5931\u8D25\uFF09 */\n  async function dispatchOk(target, payload, opt) {\n    const res = await dispatch(target, payload, opt);\n    if (!res || res.ok !== true) {\n      throw new Error((res && res.error) || `${target} dispatch \u5931\u8D25`);\n    }\n    return res.result;\n  }\n\n  async function kvGet(key) {\n    const r = await dispatchOk('cap.kv', { action: 'get', key });\n    return r && r.value !== undefined ? r.value : null;\n  }\n  async function kvSet(key, value) {\n    await dispatchOk('cap.kv', { action: 'set', key, value: value === undefined ? null : value });\n    return true;\n  }\n  async function kvDel(key) {\n    await dispatchOk('cap.kv', { action: 'delete', key });\n    return true;\n  }\n  async function kvKeys() {\n    const r = await dispatchOk('cap.kv', { action: 'list' });\n    return r && Array.isArray(r.keys) ? r.keys : [];\n  }\n\n  return {\n    dispatch, dispatchOk, kvGet, kvSet, kvDel, kvKeys,\n    endpoint: () => endpoint,\n    refreshEndpoint: () => getEndpoint(true),\n  };\n}\n\nmodule.exports = { createKvClient, resolveEndpoint, loadWebConfig, md5 };\n";

// shared/scaffold/service_main.js.txt
var service_main_js_default = "#!/usr/bin/env node\n'use strict';\n/**\n * main.js \u2014\u2014 {{PLUGIN_NAME}}\u540E\u53F0\u670D\u52A1\uFF08\u96F6\u4F9D\u8D56\uFF0Cnode >= 18\uFF0C\u9700\u5168\u5C40 fetch\uFF09\n *\n * \u9AA8\u67B6\u804C\u8D23\uFF08\u6309\u4E1A\u52A1\u589E\u5220\uFF0C\u4FDD\u6301\u5DF2\u9A8C\u8BC1\u7684\u9AA8\u67B6\u8BED\u4E49\uFF09\uFF1A\n *   - tick \u4E3B\u5FAA\u73AF\uFF084s\uFF09\uFF1A\u8BFB\u8BBE\u7F6E(30s \u70ED\u66F4) \u2192 \u626B\u524D\u7F00\u53D1\u73B0\u5DE5\u4F5C \u2192 \u6D88\u8D39\u547D\u4EE4\u952E(\u5148\u5220\u540E\u505A)\n *     \u2192 \u5468\u671F\u6027\u5DE5\u4F5C(\u793C\u8C8C\u9650\u901F) \u2192 meta \u5FC3\u8DF3(60s)\n *   - /__health \u6052 200\uFF1Abridge \u4E0D\u53EF\u8FBE\u4E5F\u6D3B\u7740\uFF08\u964D\u7EA7\u8BED\u4E49\u89C1 meta.degraded\uFF09\uFF0C\n *     \u907F\u514D\u88AB\u5BBF\u4E3B\u5065\u5EB7\u68C0\u67E5\u8BEF\u6740\u8FDB\u91CD\u542F\u5FAA\u73AF\n *   - \u65E5\u5FD7\u81EA\u843D\u76D8 <appConfigDir>/{{PLUGIN_ID}}.log\uFF08\u5BBF\u4E3B\u4E0D\u6536\u96C6 stdout\uFF09\n *\n * \u751F\u547D\u5468\u671F\u7531\u5BBF\u4E3B PluginServiceManager \u7BA1\u7406\u3002\n * \u542F\u52A8\u53C2\u6570\uFF1Anode main.js {{port}} {{appConfigDir}}\n */\nconst http = require('http');\nconst fs = require('fs');\nconst os = require('os');\nconst path = require('path');\n\nconst core = require('../shared/core');\nconst { createKvClient } = require('./kvclient');\n\nconst VERSION = '0.1.0';\nconst TICK_MS = 4000;\nconst META_BEAT_MS = 60 * 1000;\nconst SETTINGS_REREAD_MS = 30 * 1000;\n\nconst K = {\n  settings: '{{PREFIX}}.settings',\n  meta: '{{PREFIX}}.meta',\n};\nconst CMD_PREFIX = '{{PREFIX}}.cmd.';\n\n// \u2500\u2500 \u6587\u4EF6\u65E5\u5FD7\uFF08\u5BBF\u4E3B\u4E0D\u6536\u96C6\u63D2\u4EF6\u670D\u52A1 stdout\uFF0C\u81EA\u884C\u843D\u76D8 + 512KB \u8F6E\u8F6C\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nlet logFile = null;\nfunction initLog(appConfigDir) {\n  const dir = appConfigDir || os.tmpdir();\n  try {\n    fs.mkdirSync(dir, { recursive: true });\n    logFile = path.join(dir, '{{PLUGIN_ID}}.log');\n    try {\n      const st = fs.statSync(logFile);\n      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);\n    } catch (_) { /* \u4E0D\u5B58\u5728\u5373\u9996\u8F6E */ }\n  } catch (_) { logFile = null; }\n}\nconst DEBUG = process.env.{{PREFIX_UPPER}}_DEBUG === '1';\nfunction log(level, msg) {\n  const line = `[{{PLUGIN_ID}}:${level}] ${new Date().toISOString()} ${msg}`;\n  if (level === 'debug' && !DEBUG) return;\n  process.stderr.write(line + '\\n');\n  if (logFile) {\n    try { fs.appendFileSync(logFile, line + '\\n'); } catch (_) { /* \u78C1\u76D8\u95EE\u9898\u4E0D\u6253\u65AD\u4E3B\u6D41\u7A0B */ }\n  }\n}\n\n// \u2500\u2500 \u4E3B\u6D41\u7A0B \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nconst PORT = parseInt(process.argv[2], 10) || 0;\nconst APP_CONFIG_DIR = process.argv[3] || '';\n\ninitLog(APP_CONFIG_DIR);\n\nconst kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });\n\nlet settings = core.normalizeSettings(null);\nlet settingsReadAt = 0;\nlet degraded = false;\nlet lastEndpointRefreshAt = 0;\nconst startedAt = Date.now();\nlet lastMetaAt = 0;\n\n/** \u547D\u4EE4\u952E\u6D88\u8D39\uFF1A\u5148\u5220\u540E\u505A\uFF08\u5E42\u7B49\u6838\u5FC3\u2014\u2014\u4E24\u4E2A\u6D88\u8D39\u8005\u5E76\u53D1\u65F6 delete \u5929\u7136\u4E92\u65A5\uFF09 */\nasync function consumeCommands() {\n  const keys = await kv.kvKeys();\n  const cmdKeys = keys.filter((k) => k.startsWith(CMD_PREFIX));\n  for (const k of cmdKeys) {\n    const cmd = await kv.kvGet(k).catch(() => null);\n    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);\n    if (!delOk) continue; // \u522B\u4EBA\u62A2\u5230\u4E86\uFF0C\u8DF3\u8FC7\n    if (!cmd || typeof cmd !== 'object') continue;\n    log('info', `\u6D88\u8D39\u547D\u4EE4 ${k}`);\n    try {\n      // TODO: \u6309\u547D\u4EE4\u7C7B\u578B\u6267\u884C\uFF1B\u7ED3\u679C\u5199\u7ED3\u679C\u952E <PREFIX>.result.<nonce>\n    } catch (e) {\n      log('warn', `\u547D\u4EE4 ${k} \u6267\u884C\u5931\u8D25: ${e.message}`);\n      await kv.kvSet('{{PREFIX}}.result.' + String(cmd.nonce || 'unknown'), { ok: false, error: e.message, at: Date.now() }).catch(() => {});\n    }\n  }\n}\n\nasync function tick() {\n  try {\n    if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS) {\n      const raw = await kv.kvGet(K.settings).catch(() => null);\n      if (raw && typeof raw === 'object') settings = core.normalizeSettings(raw);\n      settingsReadAt = Date.now();\n    }\n\n    await consumeCommands();\n\n    // TODO: \u5468\u671F\u6027\u4E1A\u52A1\u5DE5\u4F5C\uFF08\u793C\u8C8C\u9650\u901F\uFF1A\u5E76\u53D1 \u22646\uFF0C\u8D85\u65F6\u5FC5\u8BBE\uFF0C\u5931\u8D25\u91CD\u8BD5 \u22643 \u540E\u8BDA\u5B9E\u6807\u8BB0\uFF09\n\n    if (Date.now() - lastMetaAt > META_BEAT_MS) {\n      lastMetaAt = Date.now();\n      await kv.kvSet(K.meta, {\n        version: VERSION,\n        pid: process.pid,\n        startedAt,\n        lastTickAt: Date.now(),\n        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),\n        degraded,\n        settings,\n      }).catch(() => {});\n    }\n\n    if (degraded) {\n      degraded = false;\n      log('info', 'bridge \u5DF2\u6062\u590D');\n    }\n  } catch (e) {\n    const wasDown = degraded;\n    degraded = true;\n    log('warn', `tick \u964D\u7EA7: ${e.message}`);\n    if (!wasDown || Date.now() - lastEndpointRefreshAt > 60 * 1000) {\n      if (!wasDown) log('info', 'bridge \u4E0D\u53EF\u8FBE\uFF0C\u8FDB\u5165\u964D\u7EA7\uFF08\u5065\u5EB7\u7AEF\u70B9\u4FDD\u6301 200\uFF09');\n      lastEndpointRefreshAt = Date.now();\n      kv.refreshEndpoint(true).catch(() => {});\n    }\n  }\n}\n\n// \u2500\u2500 \u5065\u5EB7\u7AEF\u70B9\uFF08\u5BBF\u4E3B\u4EC5\u770B 2xx\uFF1Bbridge \u4E0D\u53EF\u8FBE\u4E5F\u8FD4\u56DE 200\uFF0C\u964D\u7EA7\u89C1 meta\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nconst server = http.createServer((req, res) => {\n  if (req.url === '/__health') {\n    res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) }));\n    return;\n  }\n  res.writeHead(404, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ ok: false, error: 'not found' }));\n});\n\nif (PORT > 0) {\n  server.listen(PORT, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${PORT}`));\n  server.on('error', (e) => log('error', `health endpoint: ${e.message}`));\n}\n\nprocess.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));\nprocess.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });\nprocess.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });\n\nlog('info', `{{PLUGIN_ID}} service v${VERSION} start (pid=${process.pid})`);\nsetInterval(tick, TICK_MS);\n";

// shared/scaffold/mcp_server.js.txt
var mcp_server_js_default = "#!/usr/bin/env node\n'use strict';\n/**\n * {{PLUGIN_NAME}} MCP Server \u2014\u2014 AI \u5DE5\u5177\u5C42\uFF08\u96F6\u4F9D\u8D56 stdio\uFF0CJSON-RPC 2024-11-05\uFF09\n *\n * \u804C\u8D23\uFF1A\u628A AI \u7684 tools/call \u7FFB\u8BD1\u4E3A\u5BF9 cap.kv\uFF08\u7ECF\u81EA\u53D1\u73B0\u6865\uFF09\u4E2D {{PREFIX}}.* \u952E\u7A7A\u95F4\n * \u7684\u8BFB\u5199\u3002\u534F\u8BAE\u6570\u636E\u53EA\u8D70 stdout\uFF0C\u65E5\u5FD7\u8D70 stderr\u3002\u53C2\u6570\uFF1Anode server.js {{appConfigDir}}\n *\n * \u5DE5\u5177\u8BBE\u8BA1\u7EAA\u5F8B\uFF08\u8BE6\u89C1\u63D2\u4EF6\u5DE5\u574A\u77E5\u8BC6\u5E93 mcp \u4E3B\u9898\uFF09\uFF1A\n *   - description \u5199\u300C\u9002\u7528\u53E5\u5F0F\u300D\uFF08\u7528\u6237\u4F1A\u8BF4\u4EC0\u4E48 \u2192 \u7528\u54EA\u4E2A\u5DE5\u5177\uFF09\n *   - \u5371\u9669\u64CD\u4F5C\u5F3A\u5236 confirm:true\n *   - \u8FD4\u56DE\u7ED3\u6784\u5316\u4E2D\u6587\u6587\u672C\uFF0C\u5217\u8868\u5E26 id \u4FBF\u4E8E\u540E\u7EED\u6309 id \u64CD\u4F5C\n */\nconst { createKvClient } = require('../service/kvclient');\nconst core = require('../shared/core');\n\nconst SERVER_NAME = '{{PLUGIN_ID}}';\nconst SERVER_VERSION = '0.1.0';\nconst PROTOCOL_VERSION = '2024-11-05';\n\nconst APP_CONFIG_DIR = process.argv[2] || '';\nconst K = {\n  settings: '{{PREFIX}}.settings',\n  meta: '{{PREFIX}}.meta',\n};\n\nfunction log(level, msg) {\n  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\\n`);\n}\n\nconst kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => log(l, m) });\n\nfunction ok(text) { return { content: [{ type: 'text', text }], isError: false }; }\nfunction err(text) { return { content: [{ type: 'text', text }], isError: true }; }\n\nconst tools = [\n  {\n    name: '{{PLUGIN_ID_NODASH}}_status',\n    description: '\u67E5\u770B{{PLUGIN_NAME}}\u7684\u8FD0\u884C\u72B6\u6001\uFF08\u670D\u52A1\u5FC3\u8DF3/\u6865\u8FDE\u63A5/\u8BBE\u7F6E\uFF09\u3002\u9002\u7528\uFF1A\u300C{{PLUGIN_NAME}}\u73B0\u5728\u4EC0\u4E48\u72B6\u6001\u300D\u300C\u670D\u52A1\u8FD8\u6D3B\u7740\u5417\u300D\u3002',\n    inputSchema: { type: 'object', properties: {} },\n    async call() {\n      const meta = await kv.kvGet(K.meta).catch(() => null);\n      if (!meta || typeof meta !== 'object') return ok('\u670D\u52A1\u5C1A\u65E0\u5FC3\u8DF3\uFF08\u672A\u8FD0\u884C\u6216\u521A\u5B89\u88C5\uFF09\u3002\u53EF\u5728\u9762\u677F\u300C\u8BBE\u7F6E \u2192 \u670D\u52A1\u7BA1\u7406\u300D\u91CC\u542F\u52A8\u3002');\n      const alive = meta.lastTickAt && (Date.now() - meta.lastTickAt < 90 * 1000);\n      return ok(`{{PLUGIN_NAME}}\u670D\u52A1${alive ? '\u8FD0\u884C\u4E2D' : '\u5FC3\u8DF3\u8FC7\u671F\uFF08\u53EF\u80FD\u5DF2\u505C\u6B62\uFF09'}\\n\u7248\u672C: ${meta.version} \xB7 \u6865: ${meta.bridge || '?'}${meta.degraded ? ' \xB7 \u964D\u7EA7\u4E2D' : ''}\\n\u8BBE\u7F6E: ${JSON.stringify(meta.settings || {})}`);\n    },\n  },\n  {\n    name: '{{PLUGIN_ID_NODASH}}_set_settings',\n    description: '\u4FEE\u6539{{PLUGIN_NAME}}\u8BBE\u7F6E\u3002\u9002\u7528\uFF1A\u300C\u5E2E\u6211\u8C03\u6574{{PLUGIN_NAME}}\u7684\u8BBE\u7F6E\u300D\u3002\u670D\u52A1\u7EA6 30 \u79D2\u5185\u70ED\u751F\u6548\u3002',\n    inputSchema: {\n      type: 'object',\n      properties: { example: { type: 'boolean', description: '\u793A\u4F8B\u8BBE\u7F6E\u9879' } },\n    },\n    async call(args) {\n      const cur = core.normalizeSettings(await kv.kvGet(K.settings).catch(() => null));\n      const next = core.normalizeSettings({ ...cur, ...args });\n      await kv.kvSet(K.settings, next);\n      return ok(`\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u7EA6 30 \u79D2\u5185\u70ED\u751F\u6548\uFF09\uFF1A${JSON.stringify(next)}`);\n    },\n  },\n];\n\n// \u2500\u2500 JSON-RPC 2.0 over stdio \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nfunction send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }\n\nlet buf = '';\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', (chunk) => {\n  buf += chunk;\n  while (true) {\n    const i = buf.indexOf('\\n');\n    if (i === -1) break;\n    const line = buf.slice(0, i).trim();\n    buf = buf.slice(i + 1);\n    if (!line) continue;\n    let msg;\n    try { msg = JSON.parse(line); } catch (_) { continue; }\n    handleMessage(msg).catch((e) => {\n      log('error', `handleMessage: ${e.message}`);\n      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });\n    });\n  }\n});\n\nasync function handleMessage(msg) {\n  if (msg.method === 'initialize') {\n    send({\n      jsonrpc: '2.0', id: msg.id,\n      result: {\n        protocolVersion: PROTOCOL_VERSION,\n        capabilities: { tools: {} },\n        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },\n      },\n    });\n    return;\n  }\n  if (msg.method === 'notifications/initialized') return;\n  if (msg.method === 'tools/list') {\n    send({\n      jsonrpc: '2.0', id: msg.id,\n      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },\n    });\n    return;\n  }\n  if (msg.method === 'tools/call') {\n    const name = msg.params && msg.params.name;\n    const args = (msg.params && msg.params.arguments) || {};\n    const tool = tools.find((t) => t.name === name);\n    if (!tool) {\n      send({ jsonrpc: '2.0', id: msg.id, result: err(`\u672A\u77E5\u5DE5\u5177\uFF1A${name}`) });\n      return;\n    }\n    try {\n      const result = await tool.call(args);\n      send({ jsonrpc: '2.0', id: msg.id, result });\n    } catch (e) {\n      log('error', `tool ${name}: ${e.message}`);\n      send({ jsonrpc: '2.0', id: msg.id, result: err(`\u6267\u884C\u5931\u8D25\uFF1A${e.message}`) });\n    }\n    return;\n  }\n  if (msg.id !== undefined) {\n    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });\n  }\n}\n\nprocess.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));\nlog('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);\n";

// shared/scaffold/test_run-tests.mjs.txt
var test_run_tests_mjs_default = "/**\n * \u79BB\u7EBF\u5355\u6D4B\uFF08node test/run-tests.mjs\uFF09\u2014\u2014 \u7EAF\u51FD\u6570\u6838\u5FC3\u76F4\u6D4B\uFF0C\u96F6\u4F9D\u8D56\u96F6 mock\u3002\n * \u6240\u6709\u53EF\u6D4B\u903B\u8F91\u90FD\u5728 shared/core.js\uFF1B\u5751\u5728\u8FD9\u91CC\u66B4\u9732\u6700\u4FBF\u5B9C\u3002\n */\nimport assert from 'node:assert';\nimport { createRequire } from 'node:module';\n\nconst require = createRequire(import.meta.url);\nconst core = require('../shared/core.js');\n\nconst results = [];\nconst t = (name, fn) => {\n  try { fn(); results.push({ name, pass: true }); }\n  catch (e) { results.push({ name, pass: false, detail: e.message }); }\n};\n\n// \u2500\u2500 normalizeSettings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nt('normalizeSettings: null \u56DE\u843D\u9ED8\u8BA4', () => {\n  assert.deepStrictEqual(core.normalizeSettings(null), { example: false });\n});\nt('normalizeSettings: \u975E\u5BF9\u8C61\u8F93\u5165\u56DE\u843D\u9ED8\u8BA4', () => {\n  assert.deepStrictEqual(core.normalizeSettings('x'), { example: false });\n});\nt('normalizeSettings: \u5408\u6CD5\u8F93\u5165\u4FDD\u7559', () => {\n  assert.deepStrictEqual(core.normalizeSettings({ example: true }), { example: true });\n});\n\n// TODO: \u6309 shared/core.js \u7684\u4E1A\u52A1\u51FD\u6570\u9010\u4E2A\u8865\u884C\u4E3A\u7EA7\u7528\u4F8B\uFF08\u4E0D\u53EA happy path\uFF09\n\nconst bad = results.filter((r) => !r.pass);\nfor (const r of results) console.log(`${r.pass ? '\u2713' : '\u2717'} ${r.name}${r.pass ? '' : ' \u2014 ' + r.detail}`);\nconsole.log(`\\n${results.length - bad.length}/${results.length} \u901A\u8FC7`);\nprocess.exit(bad.length ? 1 : 0);\n";

// shared/scaffold/test_smoke-real.mjs.txt
var test_smoke_real_mjs_default = "/**\n * \u771F\u5B9E\u73AF\u5883\u5168\u94FE\u8DEF\u5192\u70DF\uFF08node test/smoke-real.mjs\uFF09\n *\n * \u524D\u63D0\uFF1A\u672C\u673A Polaris \u6B63\u5728\u8FD0\u884C\uFF08anchor.json \u2192 config.json web.port \u53EF\u8FBE\uFF09\u3002\n * \u62A4\u680F\uFF1A\u771F\u5B9E kv \u4E2D\u5DF2\u5B58\u5728\u672C\u63D2\u4EF6\u4E1A\u52A1\u952E\uFF08\u9664\u5192\u70DF\u5B50\u524D\u7F00\uFF09\u65F6\u62D2\u8DD1\uFF0C\u9632\u8BEF\u4F24\u751F\u4EA7\u6570\u636E\u3002\n * \u6D41\u7A0B\uFF1A\n *   1. \u81EA\u53D1\u73B0\u771F\u5B9E\u6865\u7AEF\u70B9\uFF08\u4E0E\u670D\u52A1\u540C\u89C4\u5219\uFF1Aanchor \u2192 config\uFF09\n *   2. \u62A4\u680F\u68C0\u67E5\n *   3. \u7ECF\u771F\u5B9E\u6865\u5199\u6D4B\u8BD5\u6570\u636E + \u5199\u547D\u4EE4\u952E\n *   4. spawn \u771F\u5B9E\u670D\u52A1\u8FDB\u7A0B\uFF08\u65E0 env \u6CE8\u5165\uFF0C\u81EA\u53D1\u73B0\u771F\u5B9E\u6865\uFF09\u2192 waitFor \u5FC3\u8DF3\n *   5. \u9A8C\u8BC1\u670D\u52A1\u4EA7\u51FA\uFF08\u7ED3\u679C\u952E/\u72B6\u6001\u952E\uFF09\n *   6. spawn \u771F\u5B9E mcp/server.js \u2192 initialize \u2192 tools/list \u2192 tools/call \u5168\u95ED\u73AF\n *   7. finally\uFF1A\u6740\u8FDB\u7A0B + \u5220\u5149\u672C\u63D2\u4EF6\u524D\u7F00\u5168\u90E8\u952E + N/N \u62A5\u544A\n */\nimport { spawn } from 'node:child_process';\nimport http from 'node:http';\nimport crypto from 'node:crypto';\nimport fs from 'node:fs';\nimport path from 'node:path';\n\nconst APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\\/([A-Za-z]:)/, '$1');\nconst PLUGIN_ID = '{{PLUGIN_ID}}';\nconst PREFIX = '{{PREFIX}}.';\n\n// \u2500\u2500 \u771F\u5B9E\u6865\u7AEF\u70B9\uFF08\u4E0E\u670D\u52A1\u540C\u89C4\u5219\uFF1Aanchor \u2192 config\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nfunction loadEndpoint() {\n  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');\n  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));\n  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));\n  return { host: '127.0.0.1', base: cfg.web.port, token: cfg.web.token || '' };\n}\nconst EP = loadEndpoint();\n\nfunction md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }\n\nfunction bridgeDispatch(target, payload, timeoutMs = 30000) {\n  return new Promise((resolve, reject) => {\n    const data = JSON.stringify({ req: { target, payload } });\n    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };\n    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;\n    const req = http.request({ hostname: EP.host, port: EP.base, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {\n      let b = '';\n      res.on('data', (c) => { b += c; });\n      res.on('end', () => resolve(JSON.parse(b)));\n    });\n    req.on('error', reject);\n    req.on('timeout', () => req.destroy(new Error('bridge timeout')));\n    req.write(data);\n    req.end();\n  });\n}\nasync function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }\nasync function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }\nasync function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }\nasync function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }\n\nasync function waitFor(fn, ms, step = 500, label = '') {\n  const t0 = Date.now();\n  while (Date.now() - t0 < ms) {\n    const v = await fn();\n    if (v) return v;\n    await new Promise((r) => setTimeout(r, step));\n  }\n  throw new Error(`\u5192\u70DF\u8D85\u65F6\uFF1A${label || fn.toString().slice(0, 60)}`);\n}\n\nconst results = [];\nconst record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '\u2713' : '\u2717'} ${name}${detail ? ' \u2014 ' + detail : ''}`); };\n\n// \u2500\u2500 \u62A4\u680F\uFF1A\u4E1A\u52A1\u952E\u5B58\u5728\u5219\u62D2\u8DD1\uFF08\u5192\u70DF\u6570\u636E\u8D70 smoke \u5B50\u524D\u7F00\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nconst preKeys = (await kvKeys()).filter((k) => k.startsWith(PREFIX));\nconst businessKeys = preKeys.filter((k) => !k.startsWith(`${PREFIX}smoke.`));\nif (businessKeys.length > 0) {\n  console.error(`[smoke] \u68C0\u6D4B\u5230 ${businessKeys.length} \u4E2A\u751F\u4EA7\u4E1A\u52A1\u952E\uFF08\u5982 ${businessKeys[0]}\uFF09\uFF0C\u62D2\u7EDD\u8FD0\u884C\u4EE5\u9632\u8BEF\u4F24\u3002`);\n  process.exit(2);\n}\n\n// \u2500\u2500 \u62C9\u8D77\u771F\u5B9E\u670D\u52A1\uFF08\u65E0 env \u6CE8\u5165\uFF0C\u8D70 anchor\u2192config \u81EA\u53D1\u73B0\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nconst appdata = process.env.APPDATA || '';\nconst svcPort = 19870 + Math.floor(Math.random() * 500);\nconst svc = spawn(process.execPath, [path.join(APP_ROOT, 'service/main.js'), String(svcPort), path.join(appdata, 'Polaris')], {\n  cwd: APP_ROOT,\n  stdio: ['ignore', 'pipe', 'pipe'],\n});\nconst svcErr = [];\nsvc.stderr.on('data', (c) => svcErr.push(String(c)));\n\ntry {\n  // 1. \u670D\u52A1\u81EA\u53D1\u73B0\u771F\u5B9E\u6865 + \u5FC3\u8DF3\n  await waitFor(async () => (await kvGet(`${PREFIX}meta`))?.lastTickAt, 20000, 500, '\u670D\u52A1\u5FC3\u8DF3\uFF08\u771F\u5B9E\u6865\uFF09');\n  const meta = await kvGet(`${PREFIX}meta`);\n  record('\u670D\u52A1\u81EA\u53D1\u73B0\u771F\u5B9E\u6865\u5E76\u5199\u5165\u5FC3\u8DF3', true, `\u6865=${meta.bridge}`);\n\n  // 2. \u547D\u4EE4\u952E\u95ED\u73AF\uFF1A\u5199\u547D\u4EE4 \u2192 \u670D\u52A1\u5148\u5220\u540E\u505A \u2192 \u7ED3\u679C\u952E\n  const nonce = 'smoke' + crypto.randomUUID().slice(0, 6);\n  await kvSet(`${PREFIX}cmd.ping.${nonce}`, { op: 'ping', nonce, at: Date.now() });\n  // TODO: \u5728 service/main.js \u7684 consumeCommands \u91CC\u5904\u7406 ping \u2192 \u5199 result\n  const result = await waitFor(async () => kvGet(`${PREFIX}result.${nonce}`), 15000, 500, '\u547D\u4EE4\u95ED\u73AF');\n  record('\u547D\u4EE4\u952E\u5148\u5220\u540E\u505A + \u7ED3\u679C\u952E\u56DE\u5199', !!result, JSON.stringify(result || {}).slice(0, 80));\n\n  // 3. \u771F\u5B9E MCP \u5168\u95ED\u73AF\n  const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), path.join(appdata, 'Polaris')], {\n    cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],\n  });\n  let buf = '';\n  const pending = new Map();\n  let nextId = 1;\n  mcp.stdout.setEncoding('utf8');\n  mcp.stdout.on('data', (c) => {\n    buf += c;\n    while (true) {\n      const i = buf.indexOf('\\n');\n      if (i === -1) break;\n      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);\n      if (!line) continue;\n      const msg = JSON.parse(line);\n      const p = pending.get(msg.id);\n      if (p) { pending.delete(msg.id); p(msg); }\n    }\n  });\n  const rpc = (method, params) => new Promise((resolve, reject) => {\n    const id = nextId++;\n    const t = setTimeout(() => reject(new Error('mcp rpc \u8D85\u65F6: ' + method)), 60000);\n    pending.set(id, (m) => { clearTimeout(t); resolve(m); });\n    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n');\n  });\n  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });\n  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\\n');\n  const lst = await rpc('tools/list', {});\n  record('MCP \u8FDE\u63A5\u771F\u5B9E\u6865\uFF0Ctools/list', Array.isArray(lst.result.tools) && lst.result.tools.length >= 2, `${lst.result.tools.map((t) => t.name).join(', ')}`);\n  const st = await rpc('tools/call', { name: '{{PLUGIN_ID_NODASH}}_status', arguments: {} });\n  record('MCP \u5DE5\u5177\u771F\u5B9E\u95ED\u73AF\uFF08\u8BFB\u5FC3\u8DF3\uFF09', /\u8FD0\u884C\u4E2D|\u5FC3\u8DF3/.test(st.result.content[0].text), st.result.content[0].text.split('\\n')[0]);\n  mcp.kill();\n\n  console.log('[smoke] \u5192\u70DF\u9879\u5168\u90E8\u6267\u884C\u5B8C\u6BD5\uFF0C\u5F00\u59CB\u6E05\u7406\u2026');\n} catch (e) {\n  record('\u6D41\u7A0B', false, e.message);\n  console.error('\u670D\u52A1\u65E5\u5FD7\u5C3E\u90E8\uFF1A', svcErr.join('').slice(-1200));\n} finally {\n  svc.kill();\n  await new Promise((r) => setTimeout(r, 800));\n  const keys = await kvKeys();\n  const mine = keys.filter((k) => k.startsWith(PREFIX));\n  await Promise.all(mine.map((k) => kvDel(k)));\n  console.log(`[smoke] \u5DF2\u6E05\u7406 ${mine.length} \u4E2A ${PREFIX}* \u952E\uFF0C\u771F\u5B9E kv \u6062\u590D\u539F\u72B6`);\n  const bad = results.filter((r) => !r.pass);\n  console.log(`[smoke] \u7ED3\u679C\uFF1A${results.length - bad.length}/${results.length} \u901A\u8FC7`);\n  process.exit(bad.length ? 1 : 0);\n}\n";

// shared/scaffold/README.md.txt
var README_md_default = "# {{PLUGIN_NAME}}\uFF08{{PLUGIN_ID}}\uFF09\n\n> \u4E00\u53E5\u8BDD\uFF1ATODO\uFF08\u662F\u4EC0\u4E48 + \u6740\u624B\u950F + \u6570\u636E\u9762\uFF09\u3002\n\n## \u529F\u80FD\n\n- TODO\n\n## \u67B6\u6784\n\n```\n\u9762\u677F\uFF08React bundle\uFF0C\u5BBF\u4E3B invoke \u901A\u9053\uFF09\n  \u2514\u2500 cap.kv {{PREFIX}}.* \u952E\u7A7A\u95F4 \u2190\u2192 \u540E\u53F0\u670D\u52A1\uFF08tick \u5FAA\u73AF\uFF0C\u539F\u751F fetch\uFF0C\u65E0\u8DE8\u57DF\u9650\u5236\uFF09\n                                  \u2514\u2500 MCP server\uFF08AI \u5DE5\u5177\u5C42\uFF0Cstdio\uFF09\n```\n\n## \u952E\u7A7A\u95F4\u5951\u7EA6\uFF08\u6743\u5A01\u8868\u2014\u2014\u4E09\u65B9\u4E00\u81F4\uFF0C\u6539\u52A8\u987B\u540C\u6B65\uFF09\n\n| \u952E | \u5199\u8005 | \u8BFB\u8005 | \u8BF4\u660E |\n|---|---|---|---|\n| `{{PREFIX}}.settings` | \u9762\u677F/MCP | \u670D\u52A1 | \u5168\u5C40\u8BBE\u7F6E\uFF08\u670D\u52A1 30s \u70ED\u8BFB\uFF09 |\n| `{{PREFIX}}.meta` | \u670D\u52A1 | \u9762\u677F/MCP | \u670D\u52A1\u5FC3\u8DF3\uFF0860s\uFF09 |\n| `{{PREFIX}}.cmd.<op>.<nonce>` | \u9762\u677F/MCP | \u670D\u52A1\uFF08\u6D88\u8D39\uFF09 | \u547D\u4EE4\u952E\uFF1A\u670D\u52A1\u5148\u5220\u540E\u505A\uFF08\u5E42\u7B49\uFF09 |\n| `{{PREFIX}}.result.<nonce>` | \u670D\u52A1 | \u9762\u677F/MCP | \u547D\u4EE4\u7ED3\u679C |\n| TODO | | | |\n\n## \u6570\u636E\u4E0E\u9690\u79C1\n\n- \u6570\u636E\u5168\u90E8\u5728\u672C\u5730 cap.kv\uFF08Polaris \u6570\u636E\u6839\uFF09\uFF0C\u4E0D\u51FA\u8BBE\u5907\u3002\n- TODO\uFF1A\u6D89\u53CA\u5916\u7F51\u6293\u53D6/\u4E0A\u4F20\u7684\u5982\u5B9E\u8BF4\u660E\u3002\n\n## \u5F00\u53D1\n\n```bash\nnpm install\nnpm run typecheck\nnpm run build          # esbuild \u2192 dist/panel.js\nnode test/run-tests.mjs        # \u79BB\u7EBF\u5355\u6D4B\uFF08shared/core.js\uFF09\nnode test/smoke-real.mjs       # \u771F\u5B9E\u6865\u5192\u70DF\uFF08\u9700\u672C\u673A Polaris \u8FD0\u884C\u4E2D\uFF1B\u81EA\u6E05\u7406\uFF09\n```\n\n## \u670D\u52A1\u65E5\u5FD7\uFF08\u6392\u969C\u5165\u53E3\uFF09\n\n`<appConfigDir>/{{PLUGIN_ID}}.log`\uFF08Windows \u4E00\u822C\u4E3A `%APPDATA%/Polaris/`\uFF1B512KB \u8F6E\u8F6C `.old`\uFF09\u3002\n\n## \u5DF2\u77E5\u8FB9\u754C\n\n- TODO\uFF08\u4E0D\u91C7\u96C6\u4EC0\u4E48/\u4E0D\u652F\u6301\u4EC0\u4E48\uFF0C\u5982\u5B9E\u5199\uFF09\n";

// src/scaffoldTpls.ts
var TPL_MAP = manifest_default2.map;
var TEMPLATES = {
  "package.json.txt": package_json_default,
  "tsconfig.json.txt": tsconfig_json_default,
  "pluginignore.txt": pluginignore_default,
  "src_host.ts.txt": src_host_ts_default,
  "src_index.tsx.txt": src_index_tsx_default,
  "src_model.ts.txt": src_model_ts_default,
  "src_Panel.tsx.txt": src_Panel_tsx_default,
  "shared_core.js.txt": shared_core_js_default,
  "service_kvclient.js.txt": service_kvclient_js_default,
  "service_main.js.txt": service_main_js_default,
  "mcp_server.js.txt": mcp_server_js_default,
  "test_run-tests.mjs.txt": test_run_tests_mjs_default,
  "test_smoke-real.mjs.txt": test_smoke_real_mjs_default,
  "README.md.txt": README_md_default
};

// src/ScaffoldTab.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var S3 = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit",
    fontSize: 13
  },
  btn: {
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: "var(--p-accent, #4a7dff)",
    color: "#fff"
  },
  btnGhost: {
    padding: "5px 12px",
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--p-border, rgba(128,128,128,.3))",
    background: "transparent",
    color: "inherit"
  },
  fileList: { display: "flex", flexWrap: "wrap", gap: 6 },
  fileChip: {
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    cursor: "pointer",
    background: "var(--p-chip, rgba(128,128,128,.15))",
    fontFamily: "monospace"
  },
  fileChipActive: {
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    cursor: "pointer",
    background: "var(--p-accent, #4a7dff)",
    color: "#fff",
    fontFamily: "monospace"
  },
  content: {
    padding: 12,
    borderRadius: 8,
    background: "var(--p-panel, rgba(128,128,128,.08))",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 320,
    overflowY: "auto"
  },
  label: { fontSize: 12, color: "var(--p-text-dim, #999)" }
};
function buildScaffoldFiles(spec) {
  const camel = spec.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const manifest = (0, import_forge_core3.buildManifest)({ ...spec, panelType: camel, labelKey: `plugins.${camel}` });
  const templates = { ...TEMPLATES };
  const { files, warnings } = (0, import_forge_core3.buildScaffold)(
    { ...templates, "plugin.json": JSON.stringify(manifest, null, 2) },
    {
      id: spec.id,
      name: spec.name,
      prefix: spec.prefix,
      icon: spec.icon,
      order: spec.order,
      withService: spec.withService,
      withMcp: spec.withMcp,
      panelType: camel,
      labelKey: `plugins.${camel}`
    }
  );
  return {
    files: files.map((f) => f.path === "plugin.json" ? { path: "plugin.json", content: f.content } : { path: TPL_MAP[f.path] || f.path, content: f.content }),
    warnings,
    manifest
  };
}
function ScaffoldTab({ onSendToChat }) {
  const [spec, setSpec] = useState3({
    id: "",
    name: "",
    prefix: "",
    icon: "Beaker",
    order: 80,
    withService: true,
    withMcp: true,
    description: ""
  });
  const [dir, setDir] = useState3("");
  const [sel, setSel] = useState3("");
  const [copied, setCopied] = useState3("");
  const [settingsLoaded, setSettingsLoaded] = useState3(false);
  useEffect(() => {
    loadForgeSettings().then((s) => {
      setDir(s.scaffoldDir);
      setSpec((p) => ({ ...p, icon: s.defaultIcon || p.icon, order: s.defaultOrder || p.order }));
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);
  const idOk = /^[a-z][a-z0-9-]*$/.test(spec.id);
  const built = useMemo3(() => idOk && spec.id ? buildScaffoldFiles(spec) : null, [spec, idOk]);
  const persist = async (next) => {
    try {
      const cur = await loadForgeSettings();
      await saveForgeSettings({ ...cur, ...next });
    } catch (_) {
    }
  };
  const files = built?.files ?? [];
  const selFile = files.find((f) => f.path === sel) || files[0];
  const dirLine = dir ? dir.replace(/[\\/]+$/, "") + "\\" + spec.id : `<\u4ED3\u5E93\u6839>\\plugins\\${spec.id || "<id>"}`;
  const aiMsg = `\u8BF7\u7528 forge_scaffold \u5DE5\u5177\u751F\u6210\u63D2\u4EF6\u9AA8\u67B6\u5E76\u843D\u76D8\uFF1Aid=${spec.id || "<id>"}\uFF0Cname=${spec.name || "<\u540D>"}\uFF0Cicon=${spec.icon}\uFF0CwithService=${spec.withService}\uFF0CwithMcp=${spec.withMcp}\uFF0Cdir=${dirLine}\uFF0Cconfirm=true\u3002\u751F\u6210\u540E\u6309\u63D2\u4EF6\u5DE5\u574A\u77E5\u8BC6\u5E93 workflow \u4E3B\u9898\u7EE7\u7EED\u5B9E\u73B0\u4E1A\u52A1\u3002`;
  return /* @__PURE__ */ jsxs3("div", { style: S3.wrap, children: [
    /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
      /* @__PURE__ */ jsx3("span", { style: S3.label, children: "\u63D2\u4EF6 id" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          style: { ...S3.input, width: 150, fontFamily: "monospace" },
          placeholder: "my-plugin",
          value: spec.id,
          onChange: (e) => setSpec({ ...spec, id: e.target.value.trim().toLowerCase() })
        }
      ),
      /* @__PURE__ */ jsx3("span", { style: S3.label, children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          style: { ...S3.input, width: 110 },
          placeholder: "\u4E2D\u6587\u540D",
          value: spec.name,
          onChange: (e) => setSpec({ ...spec, name: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx3("span", { style: S3.label, children: "kv \u524D\u7F00" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          style: { ...S3.input, width: 110, fontFamily: "monospace" },
          placeholder: "\u9ED8\u8BA4\u53D6 id",
          value: spec.prefix,
          onChange: (e) => setSpec({ ...spec, prefix: e.target.value.trim() })
        }
      ),
      /* @__PURE__ */ jsx3("span", { style: S3.label, children: "\u56FE\u6807" }),
      /* @__PURE__ */ jsx3("select", { style: S3.input, value: spec.icon, onChange: (e) => {
        setSpec({ ...spec, icon: e.target.value });
        persist({ defaultIcon: e.target.value });
      }, children: import_forge_core3.VALID_PLUGIN_ICONS.map((ic) => /* @__PURE__ */ jsx3("option", { value: ic, children: ic }, ic)) }),
      /* @__PURE__ */ jsxs3("label", { style: { display: "flex", gap: 4, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: spec.withService, onChange: (e) => setSpec({ ...spec, withService: e.target.checked }) }),
        /* @__PURE__ */ jsx3("span", { style: S3.label, children: "\u540E\u53F0\u670D\u52A1" })
      ] }),
      /* @__PURE__ */ jsxs3("label", { style: { display: "flex", gap: 4, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: spec.withMcp, onChange: (e) => setSpec({ ...spec, withMcp: e.target.checked }) }),
        /* @__PURE__ */ jsx3("span", { style: S3.label, children: "MCP" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
      /* @__PURE__ */ jsx3("span", { style: S3.label, children: "\u76EE\u6807\u76EE\u5F55\uFF08\u843D\u76D8\u7528\uFF0C\u9762\u677F\u53EA\u9884\u89C8\uFF09" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          style: { ...S3.input, flex: 1, minWidth: 220, fontFamily: "monospace" },
          placeholder: "D:\\space\\base\\Polaris-plugin\\plugins",
          value: dir,
          onChange: (e) => {
            setDir(e.target.value);
            persist({ scaffoldDir: e.target.value });
          }
        }
      )
    ] }),
    !idOk && spec.id && /* @__PURE__ */ jsx3("div", { style: { color: "rgba(220,80,80,.9)", fontSize: 12 }, children: "id \u5FC5\u987B\u662F\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934\uFF0C\u4EC5\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26" }),
    built && /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsxs3("span", { style: S3.label, children: [
          files.length,
          " \u4E2A\u6587\u4EF6"
        ] }),
        built.warnings.map((w, i) => /* @__PURE__ */ jsxs3("span", { style: { color: "rgba(230,170,40,.9)", fontSize: 12 }, children: [
          "\u26A0 ",
          w
        ] }, i))
      ] }),
      /* @__PURE__ */ jsx3("div", { style: S3.fileList, children: files.map((f) => /* @__PURE__ */ jsx3(
        "span",
        {
          style: f.path === selFile?.path ? S3.fileChipActive : S3.fileChip,
          onClick: () => setSel(f.path),
          children: f.path
        },
        f.path
      )) }),
      /* @__PURE__ */ jsx3("div", { style: S3.content, children: selFile?.content }),
      /* @__PURE__ */ jsxs3("div", { style: S3.row, children: [
        /* @__PURE__ */ jsx3("button", { style: S3.btnGhost, onClick: async () => {
          if (!selFile) return;
          const r = await copyText(selFile.content);
          setCopied(r === "copied" ? `\u5DF2\u590D\u5236 ${selFile.path}` : "\u5F39\u7A97\u590D\u5236");
        }, children: "\u590D\u5236\u5F53\u524D\u6587\u4EF6" }),
        copied && /* @__PURE__ */ jsx3("span", { style: S3.label, children: copied }),
        onSendToChat && /* @__PURE__ */ jsx3("button", { style: S3.btn, onClick: () => onSendToChat(aiMsg), children: "\u53D1\u7ED9 AI \u843D\u76D8\u751F\u6210" })
      ] }),
      onSendToChat && settingsLoaded && /* @__PURE__ */ jsxs3("div", { style: { ...S3.label, lineHeight: 1.6 }, children: [
        "\u843D\u76D8\u6307\u4EE4\uFF08\u4E5F\u53EF\u5728\u804A\u5929\u91CC\u76F4\u63A5\u8BF4\uFF09\uFF1A\u300C",
        aiMsg.length > 90 ? aiMsg.slice(0, 90) + "\u2026" : aiMsg,
        "\u300D"
      ] })
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var tabBtn = (active) => ({
  padding: "6px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: active ? "var(--p-accent, #4a7dff)" : "transparent",
  color: active ? "#fff" : "inherit"
});
function PluginForgePanel(props) {
  const [tab, setTab] = useState4("kb");
  return /* @__PURE__ */ jsxs4("div", { style: { padding: 16, fontFamily: "inherit", fontSize: 13, color: "var(--p-text, inherit)", maxWidth: 860, margin: "0 auto" }, children: [
    /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }, children: [
      /* @__PURE__ */ jsx4("strong", { style: { fontSize: 15 }, children: "\u63D2\u4EF6\u5DE5\u574A" }),
      /* @__PURE__ */ jsx4("span", { style: { fontSize: 11, color: "var(--p-text-dim, #999)" }, children: "\u5E73\u53F0\u77E5\u8BC6 \xB7 \u6E05\u5355\u4F53\u68C0 \xB7 \u751F\u4EA7\u7EA7\u811A\u624B\u67B6" }),
      /* @__PURE__ */ jsx4("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx4("button", { style: tabBtn(tab === "kb"), onClick: () => setTab("kb"), children: "\u77E5\u8BC6\u5E93" }),
      /* @__PURE__ */ jsx4("button", { style: tabBtn(tab === "lint"), onClick: () => setTab("lint"), children: "\u4F53\u68C0" }),
      /* @__PURE__ */ jsx4("button", { style: tabBtn(tab === "scaffold"), onClick: () => setTab("scaffold"), children: "\u811A\u624B\u67B6" })
    ] }),
    tab === "kb" && /* @__PURE__ */ jsx4(KbTab, {}),
    tab === "lint" && /* @__PURE__ */ jsx4(LintTab, {}),
    tab === "scaffold" && /* @__PURE__ */ jsx4(ScaffoldTab, { onSendToChat: props.onSendToChat })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function PluginForgeEntry(props) {
  return /* @__PURE__ */ jsx5(PluginForgePanel, { ...props });
}
export {
  PluginForgeEntry as default
};
