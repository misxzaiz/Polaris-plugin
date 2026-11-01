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

// shared/audit-core.js
var require_audit_core = __commonJS({
  "shared/audit-core.js"(exports, module) {
    "use strict";
    var VERSION = "0.1.0";
    var PLUGIN_ID = "site-audit";
    var UA_TOKEN = "site-audit";
    var LIMITS2 = {
      maxPages: { min: 5, max: 5e3, default: 500 },
      delayMs: { min: 0, max: 3e3, default: 300 },
      timeoutS: { min: 2, max: 30, default: 15 },
      concurrency: { min: 1, max: 12, default: 6 },
      slowMs: { min: 200, max: 2e4, default: 2e3 },
      auditTimeoutS: { min: 60, max: 1800, default: 600 },
      externalCap: { min: 0, max: 2e3, default: 500 },
      maxBodyBytes: 2 * 1024 * 1024,
      maxHops: 5,
      scopeHostMax: 3,
      assetCapPerPage: 100
    };
    function normalizeUrl(input, base) {
      const raw = String(input || "").trim();
      if (!raw) return { ok: false, error: "URL \u4E3A\u7A7A" };
      if (/[\s<>]/.test(raw)) return { ok: false, error: "URL \u542B\u975E\u6CD5\u5B57\u7B26" };
      let u;
      try {
        u = new URL(raw, base || void 0);
      } catch (_) {
        return { ok: false, error: `URL \u65E0\u6CD5\u89E3\u6790\uFF1A${raw.slice(0, 120)}` };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: `\u4EC5\u652F\u6301 http/https\uFF08\u6536\u5230 ${u.protocol}\uFF09` };
      if (u.username || u.password) return { ok: false, error: "\u4E0D\u652F\u6301\u5E26\u8D26\u53F7\u5BC6\u7801\u7684 URL\uFF08\u672C\u5DE5\u5177\u4E0D\u652F\u6301\u767B\u5F55\u540E\u9875\u9762\uFF09" };
      u.hash = "";
      u.hostname = u.hostname.toLowerCase();
      if (u.protocol === "http:" && u.port === "80" || u.protocol === "https:" && u.port === "443") u.port = "";
      const out = u.toString();
      const trimmed = out.endsWith("?") ? out.slice(0, -1) : out;
      return { ok: true, url: trimmed, key: trimmed, host: u.host.toLowerCase(), scheme: u.protocol.replace(":", "") };
    }
    function isCrawlableHref(href) {
      const s = String(href || "").trim();
      if (!s) return false;
      if (/^(mailto:|tel:|javascript:|data:|blob:|about:|sms:|#)/i.test(s)) return false;
      return true;
    }
    function hostOf(url) {
      try {
        return new URL(url).host.toLowerCase();
      } catch (_) {
        return "";
      }
    }
    var METADATA_HOSTS = /* @__PURE__ */ new Set(["169.254.169.254", "metadata.google.internal", "metadata.goog", "100.100.100.200", "fd00:ec2::254"]);
    function isMetadataTarget(url) {
      const host = hostOf(url).replace(/^\[|\]$/g, "");
      if (METADATA_HOSTS.has(host)) return true;
      const m = host.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
      if (m) {
        const p = m[1].split(".").map(Number);
        if (p[0] === 169 && p[1] === 254) return true;
      }
      return false;
    }
    function robotsPatternToRe(pattern) {
      let re = "^";
      for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === "*") re += "[\\s\\S]*";
        else if (ch === "$" && i === pattern.length - 1) re += "$";
        else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      return new RegExp(re, "i");
    }
    function parseRobots(text) {
      const groups = [];
      const sitemaps = [];
      let cur = null;
      let lastWasAgent = false;
      const lines = String(text || "").split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, "").trim();
        if (!line) continue;
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const field = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (field === "user-agent") {
          if (!lastWasAgent || !cur) {
            cur = { agents: [], allow: [], disallow: [], crawlDelayMs: null };
            groups.push(cur);
          }
          if (value) cur.agents.push(value.toLowerCase());
          lastWasAgent = true;
        } else if (field === "disallow") {
          if (!cur) continue;
          if (value) cur.disallow.push(value);
          lastWasAgent = false;
        } else if (field === "allow") {
          if (!cur) continue;
          if (value) cur.allow.push(value);
          lastWasAgent = false;
        } else if (field === "crawl-delay") {
          if (!cur) continue;
          const s = parseFloat(value);
          if (Number.isFinite(s) && s >= 0) cur.crawlDelayMs = Math.min(s * 1e3, 1e4);
          lastWasAgent = false;
        } else if (field === "sitemap") {
          if (value) sitemaps.push(value);
          lastWasAgent = false;
        } else {
          lastWasAgent = false;
        }
      }
      return { groups, sitemaps, ok: true };
    }
    function pickRobotGroup(robots) {
      const groups = robots && robots.groups || [];
      const mine = groups.filter((g) => g.agents.some((a) => a === UA_TOKEN || a.includes(UA_TOKEN)));
      if (mine.length) return { group: mine[0], explicit: true };
      const star = groups.filter((g) => g.agents.includes("*"));
      if (star.length) return { group: star[0], explicit: true };
      return { group: null, explicit: false };
    }
    function robotsAllows(robots, pathUrl) {
      const { group, explicit } = pickRobotGroup(robots);
      if (!explicit || !group) return { allowed: true, rule: null, crawlDelayMs: null };
      let p;
      try {
        p = new URL(pathUrl).pathname + (new URL(pathUrl).search || "");
      } catch (_) {
        return { allowed: true, rule: null, crawlDelayMs: null };
      }
      let best = null;
      const consider = (rules, type) => {
        for (const pat of rules) {
          if (!robotsPatternToRe(pat).test(p)) continue;
          const len = pat.length;
          if (!best || len > best.len || len === best.len && type === "allow") best = { type, len, pat };
        }
      };
      consider(group.allow, "allow");
      consider(group.disallow, "disallow");
      return {
        allowed: !best || best.type === "allow",
        rule: best ? best.pat : null,
        crawlDelayMs: group.crawlDelayMs
      };
    }
    function charsetFromContentType(ct) {
      const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(String(ct || ""));
      return m ? m[1].toLowerCase() : null;
    }
    function sniffMetaCharset(buf) {
      const head = buf.slice(0, 4096).toString("latin1");
      const m1 = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);
      if (m1) return m1[1].toLowerCase();
      const m2 = /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head);
      if (m2) return m2[1].toLowerCase();
      return null;
    }
    function decodeHtml(buf, contentType) {
      let charset = charsetFromContentType(contentType) || sniffMetaCharset(buf);
      let text = null;
      if (charset && !/^(utf-?8|ascii|us-ascii)$/.test(charset)) {
        try {
          text = new TextDecoder(charset, { fatal: false }).decode(buf);
        } catch (_) {
          charset = null;
        }
      } else if (charset) {
        charset = "utf-8";
      }
      if (text === null) {
        charset = charset || "utf-8";
        text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      }
      return { text, charset };
    }
    function parseAttrs(attrStr) {
      const attrs = {};
      const re = /([a-zA-Z_:@][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let m;
      while (m = re.exec(attrStr || "")) {
        const name = m[1].toLowerCase();
        if (!(name in attrs)) attrs[name] = m[2] !== void 0 ? m[2] : m[3] !== void 0 ? m[3] : m[4] !== void 0 ? m[4] : "";
      }
      return attrs;
    }
    function scrubHtml(html) {
      return String(html || "").replace(/<!--[\s\S]*?-->/g, "").replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi, "$1$3").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<!doctype[^>]*>/gi, "");
    }
    function decodeEntities(s) {
      return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        try {
          return String.fromCodePoint(parseInt(h, 16));
        } catch (_2) {
          return "";
        }
      }).replace(/&#(\d+);/g, (_, d) => {
        try {
          return String.fromCodePoint(parseInt(d, 10));
        } catch (_2) {
          return "";
        }
      }).replace(/&amp;/g, "&");
    }
    function scanHtml(html) {
      const clean = scrubHtml(html);
      const out = {
        title: "",
        description: null,
        metaRobots: null,
        noindex: false,
        nofollowAll: false,
        metaRefreshUrl: null,
        canonical: null,
        canonicalCount: 0,
        lang: null,
        h1Count: 0,
        baseHref: null,
        charsetMeta: null,
        links: [],
        images: [],
        resources: []
      };
      const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
      if (titleM) out.title = decodeEntities(titleM[1]).replace(/\s+/g, " ").trim();
      const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
      let m;
      while (m = tagRe.exec(clean)) {
        const tag = m[1].toLowerCase();
        const attrs = parseAttrs(m[2]);
        switch (tag) {
          case "html":
            if (out.lang === null && attrs.lang) out.lang = attrs.lang.trim();
            break;
          case "base":
            if (out.baseHref === null && attrs.href) out.baseHref = attrs.href.trim();
            break;
          case "meta": {
            const name = (attrs.name || "").toLowerCase();
            const equiv = (attrs["http-equiv"] || "").toLowerCase();
            const content = attrs.content;
            if (name === "description" && content && out.description === null) out.description = decodeEntities(content).replace(/\s+/g, " ").trim();
            if (name === "robots" && content && out.metaRobots === null) {
              out.metaRobots = content.toLowerCase();
              out.noindex = /(^|[\s,])noindex([\s,]|$)/.test(out.metaRobots);
              out.nofollowAll = /(^|[\s,])nofollow([\s,]|$)/.test(out.metaRobots);
            }
            if (equiv === "refresh" && content && out.metaRefreshUrl === null) {
              const um = /url\s*=\s*(.+)$/i.exec(content);
              if (um) out.metaRefreshUrl = um[1].trim().replace(/^['"]|['"]$/g, "");
            }
            if (!attrs.charset && equiv === "content-type" && content) {
              const c = charsetFromContentType(content);
              if (c) out.charsetMeta = c;
            } else if (attrs.charset) {
              out.charsetMeta = attrs.charset.toLowerCase();
            }
            break;
          }
          case "link": {
            const rel = (attrs.rel || "").toLowerCase();
            if (rel.includes("canonical") && attrs.href) {
              out.canonicalCount += 1;
              if (out.canonical === null) out.canonical = attrs.href.trim();
            }
            if ((rel.includes("stylesheet") || rel.includes("icon")) && attrs.href) {
              out.resources.push({ url: attrs.href.trim(), kind: rel.includes("stylesheet") ? "style" : "icon" });
            }
            break;
          }
          case "script":
            if (attrs.src) out.resources.push({ url: attrs.src.trim(), kind: "script" });
            break;
          case "img":
            if (attrs.src) out.images.push({ src: attrs.src.trim(), hasAltAttr: Object.prototype.hasOwnProperty.call(attrs, "alt") });
            break;
          case "a":
            if (attrs.href) {
              const rel = (attrs.rel || "").toLowerCase();
              out.links.push({ href: attrs.href.trim(), nofollow: rel.includes("nofollow") });
            }
            break;
          case "h1":
            out.h1Count += 1;
            break;
          default:
            break;
        }
        if (out.links.length > 2e3 || out.images.length > 2e3) break;
      }
      return out;
    }
    function evalRedirectChain(hops, scopeHosts) {
      const chain = Array.isArray(hops) ? hops : [];
      const seen = /* @__PURE__ */ new Set();
      let loop = false;
      for (const h of chain) {
        const k = String(h.url || "");
        if (seen.has(k)) loop = true;
        seen.add(k);
      }
      const last = chain[chain.length - 1] || null;
      const finalUrl = last ? String(last.url || "") : "";
      const escaped = !!(finalUrl && scopeHosts && scopeHosts.length && !scopeHosts.includes(hostOf(finalUrl)));
      return { count: Math.max(chain.length - 1, 0), loop, escaped, finalUrl };
    }
    var SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };
    var ISSUE_TYPES = {
      broken_page: { severity: "error", weight: 5, cap: 10, label: "\u7AD9\u5185\u9875\u9762\u6253\u4E0D\u5F00", hint: "4xx/5xx/DNS/\u8D85\u65F6\u2014\u2014\u7528\u6237\u4E0E\u641C\u7D22\u5F15\u64CE\u90FD\u4F1A\u78B0\u58C1" },
      broken_asset: { severity: "warn", weight: 2, cap: 10, label: "\u7AD9\u5185\u8D44\u6E90\u5931\u6548", hint: "\u56FE\u7247/\u6837\u5F0F/\u811A\u672C 404\u2014\u2014\u9875\u9762\u7834\u76F8\u3001\u63A7\u5236\u53F0\u62A5\u9519" },
      broken_external: { severity: "warn", weight: 1.5, cap: 8, label: "\u5916\u94FE\u5931\u6548", hint: "\u6307\u5411\u5916\u90E8\u7AD9\u70B9\u7684\u94FE\u63A5\u6253\u4E0D\u5F00\uFF08\u62A5\u544A\u6309\u57DF\u805A\u5408\uFF09" },
      redirect_chain: { severity: "warn", weight: 1.5, cap: 8, label: "\u91CD\u5B9A\u5411\u94FE", hint: "\u591A\u8DF3\u91CD\u5B9A\u5411\u6D6A\u8D39\u6293\u53D6\u914D\u989D\u5E76\u7A00\u91CA\u6743\u91CD" },
      redirect_loop: { severity: "error", weight: 5, cap: 5, label: "\u91CD\u5B9A\u5411\u6B7B\u5FAA\u73AF", hint: "\u91CD\u5B9A\u5411\u56DE\u5230\u94FE\u4E2D\u51FA\u73B0\u8FC7\u7684 URL" },
      missing_title: { severity: "error", weight: 3, cap: 8, label: "\u9875\u9762\u7F3A\u6807\u9898", hint: "<title> \u662F\u641C\u7D22\u7ED3\u679C\u7684\u7B2C\u4E00\u884C" },
      title_length: { severity: "warn", weight: 1, cap: 8, label: "\u6807\u9898\u957F\u5EA6\u5F02\u5E38", hint: "\u5EFA\u8BAE 10~65 \u5B57\u7B26" },
      missing_description: { severity: "warn", weight: 1.5, cap: 8, label: "\u9875\u9762\u7F3A\u63CF\u8FF0", hint: "meta description \u5E38\u88AB\u641C\u7D22\u7ED3\u679C\u6458\u5F55" },
      description_length: { severity: "warn", weight: 0.5, cap: 6, label: "\u63CF\u8FF0\u957F\u5EA6\u5F02\u5E38", hint: "\u5EFA\u8BAE 50~160 \u5B57\u7B26" },
      duplicate_title: { severity: "warn", weight: 2, cap: 5, label: "\u6807\u9898\u91CD\u590D", hint: "\u591A\u9875\u540C\u6807\u9898\u5F71\u54CD\u533A\u5206\u5EA6\u4E0E\u6536\u5F55" },
      duplicate_description: { severity: "info", weight: 0.5, cap: 4, label: "\u63CF\u8FF0\u91CD\u590D", hint: "\u591A\u9875\u540C\u63CF\u8FF0\u5E38\u89C1\u4E8E\u6A21\u677F\u9875" },
      missing_alt: { severity: "warn", weight: 1, cap: 10, label: "\u56FE\u7247\u7F3A alt", hint: '\u53EF\u8BBF\u95EE\u6027\u4E0E\u56FE\u7247 SEO \u53CC\u8F93\uFF08alt="" \u662F\u5408\u6CD5\u7684\u88C5\u9970\u6027\u5199\u6CD5\uFF09' },
      mixed_content: { severity: "error", weight: 4, cap: 8, label: "\u6DF7\u5408\u5185\u5BB9", hint: "https \u9875\u9762\u5F15\u7528 http \u8D44\u6E90\u2014\u2014\u73B0\u4EE3\u6D4F\u89C8\u5668\u76F4\u63A5\u62E6\u622A" },
      meta_refresh: { severity: "warn", weight: 2, cap: 5, label: "meta \u8DF3\u8F6C", hint: "\u7528 HTTP \u91CD\u5B9A\u5411\u66FF\u4EE3 meta refresh" },
      noindex: { severity: "info", weight: 0.5, cap: 4, label: "noindex \u9875\u9762", hint: "\u6709\u610F\u4E0D\u6536\u5F55\u5219\u5FFD\u7565\uFF1B\u6574\u7AD9\u8BEF\u8BBE\u4F1A\u707E\u96BE" },
      canonical_multiple: { severity: "warn", weight: 2, cap: 5, label: "\u591A\u4E2A canonical", hint: "\u641C\u7D22\u5F15\u64CE\u4F1A\u5168\u90E8\u5FFD\u7565" },
      canonical_offsite: { severity: "info", weight: 0.5, cap: 4, label: "canonical \u6307\u5411\u7AD9\u5916", hint: "\u901A\u5E38\u662F\u6709\u610F\u7684\uFF08\u540C\u6B65\u6E90\uFF09\uFF0C\u786E\u8BA4\u5373\u53EF" },
      missing_lang: { severity: "info", weight: 0.3, cap: 3, label: "\u7F3A html lang", hint: "\u5C4F\u5E55\u9605\u8BFB\u5668\u4E0E\u641C\u7D22\u5F15\u64CE\u7684\u8BED\u8A00\u4FE1\u53F7" },
      h1_issues: { severity: "info", weight: 0.3, cap: 3, label: "h1 \u6570\u91CF\u5F02\u5E38", hint: "\u7F3A h1 \u6216\u591A h1" },
      slow_page: { severity: "warn", weight: 1.5, cap: 8, label: "\u6162\u9875\u9762", hint: "\u54CD\u5E94\u65F6\u95F4\u8D85\u8FC7\u9608\u503C" },
      robots_blocked: { severity: "info", weight: 0, cap: 0, label: "robots \u6392\u9664", hint: "\u88AB\u94FE\u63A5\u4F46 robots.txt \u4E0D\u5141\u8BB8\u722C\u2014\u2014\u53EA\u767B\u8BB0\u4E0D\u6263\u5206" },
      sitemap_gap: { severity: "info", weight: 0, cap: 0, label: "sitemap \u5B64\u5C9B", hint: "sitemap \u58F0\u660E\u4E86\u4F46\u7AD9\u5185\u94FE\u63A5\u5230\u4E0D\u4E86\uFF08\u6216robots\u6392\u9664\uFF09" }
    };
    var ISSUE_ITEMS_MAX = 100;
    function normDupText(s) {
      return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    }
    function buildIssues(p) {
      const pages = p.pages || [];
      const assets = p.assets || [];
      const externals = p.externals || [];
      const options = p.options || {};
      const slowMs = Number(options.slowMs) || LIMITS2.slowMs.default;
      const scopeHosts = options.scopeHosts || [];
      const buckets = {};
      const add = (type, item) => {
        (buckets[type] = buckets[type] || []).push(item);
      };
      const okPages = [];
      for (const pg of pages) {
        if (pg.robotsBlocked) {
          add("robots_blocked", { url: pg.url, detail: "\u88AB robots.txt \u6392\u9664\uFF0C\u672A\u6293\u53D6" });
          continue;
        }
        const bad = pg.error || pg.status && pg.status >= 400;
        if (bad) {
          add("broken_page", {
            url: pg.url,
            source: pg.source || null,
            detail: pg.error ? `\u8BF7\u6C42\u5931\u8D25\uFF1A${pg.error}` : `HTTP ${pg.status}${pg.statusText ? " " + pg.statusText : ""}${pg.redirectHops > 0 ? `\uFF08\u7ECF ${pg.redirectHops} \u8DF3\u91CD\u5B9A\u5411\uFF09` : ""}`
          });
          continue;
        }
        okPages.push(pg);
      }
      for (const a of assets) {
        if (a.error || a.status && a.status >= 400) {
          add("broken_asset", { url: a.url, source: a.source || null, detail: a.error ? `\u8BF7\u6C42\u5931\u8D25\uFF1A${a.error}` : `HTTP ${a.status}` });
        }
      }
      for (const e of externals) {
        if (e.error || e.status && e.status >= 400) {
          add("broken_external", { url: e.url, source: e.sources && e.sources[0] || null, detail: e.error ? `\u8BF7\u6C42\u5931\u8D25\uFF1A${e.error}` : `HTTP ${e.status}` });
        }
      }
      for (const pg of okPages) {
        const isHtml = /html|xml/i.test(pg.contentType || "") || !pg.contentType;
        if (!isHtml) continue;
        const chain = evalRedirectChain(pg.hops || [], scopeHosts);
        if (chain.loop) add("redirect_loop", { url: pg.url, detail: `\u91CD\u5B9A\u5411 ${chain.count} \u8DF3\u4E14\u6210\u73AF` });
        else if (chain.count >= 2) add("redirect_chain", { url: pg.url, detail: `${chain.count} \u8DF3\uFF1A${(pg.hops || []).map((h) => h.url).join(" \u2192 ")}` });
        else if (chain.escaped) add("redirect_chain", { url: pg.url, detail: `\u91CD\u5B9A\u5411\u79BB\u5F00\u672C\u7AD9\uFF1A${(pg.hops || []).map((h) => h.url).join(" \u2192 ")}` });
        if (!pg.title) add("missing_title", { url: pg.url, detail: "\u9875\u9762\u6CA1\u6709 <title> \u6216\u6807\u9898\u4E3A\u7A7A" });
        else if (pg.titleLen < 10 || pg.titleLen > 65) add("title_length", { url: pg.url, detail: `\u6807\u9898 ${pg.titleLen} \u5B57\u7B26\uFF1A${pg.title.slice(0, 50)}` });
        if (pg.description === null) add("missing_description", { url: pg.url, detail: "\u7F3A meta description" });
        else if (pg.descLen !== void 0 && (pg.descLen < 50 || pg.descLen > 160)) add("description_length", { url: pg.url, detail: `\u63CF\u8FF0 ${pg.descLen} \u5B57\u7B26\uFF1A${String(pg.description).slice(0, 50)}` });
        if (pg.noindex) add("noindex", { url: pg.url, detail: `meta robots\uFF1A${pg.metaRobots || "noindex"}` });
        if (pg.metaRefresh) add("meta_refresh", { url: pg.url, detail: `meta refresh \u2192 ${pg.metaRefresh}` });
        if (pg.canonicalCount > 1) add("canonical_multiple", { url: pg.url, detail: `${pg.canonicalCount} \u4E2A rel=canonical` });
        else if (pg.canonical && scopeHosts.length && !scopeHosts.includes(hostOf(pg.canonical))) add("canonical_offsite", { url: pg.url, detail: `canonical \u2192 ${pg.canonical}` });
        if (!pg.lang) add("missing_lang", { url: pg.url, detail: "<html> \u7F3A lang \u5C5E\u6027" });
        if (pg.h1Count === 0) add("h1_issues", { url: pg.url, detail: "\u6CA1\u6709 <h1>" });
        else if (pg.h1Count > 1) add("h1_issues", { url: pg.url, detail: `${pg.h1Count} \u4E2A <h1>` });
        if (pg.imgNoAlt > 0) add("missing_alt", { url: pg.url, detail: `${pg.imgNoAlt} \u5F20\u56FE\u7247\u7F3A alt \u5C5E\u6027` });
        if (pg.ms > slowMs) add("slow_page", { url: pg.url, detail: `\u54CD\u5E94 ${pg.ms}ms\uFF08\u9608\u503C ${slowMs}ms\uFF09` });
        for (const ref of pg.mixedRefs || []) add("mixed_content", { url: pg.url, detail: `http \u8D44\u6E90\uFF1A${ref}` });
      }
      const dup = (field, type) => {
        const map = /* @__PURE__ */ new Map();
        for (const pg of okPages) {
          const v = normDupText(field === "title" ? pg.title : pg.description);
          if (!v) continue;
          if (!map.has(v)) map.set(v, []);
          map.get(v).push(pg.url);
        }
        for (const [v, urls] of map) {
          if (urls.length > 1) add(type, { url: urls[0], detail: `${field === "title" ? "\u6807\u9898" : "\u63CF\u8FF0"}\u300C${v.slice(0, 60)}\u300D\u51FA\u73B0\u5728 ${urls.length} \u9875`, dupUrls: urls.slice(0, 20) });
        }
      };
      dup("title", "duplicate_title");
      dup("description", "duplicate_description");
      if (p.sitemap && p.sitemap.fetched && Array.isArray(p.sitemap.urls)) {
        const seen = new Set(pages.map((x) => x.url));
        for (const u of p.sitemap.urls) {
          if (!seen.has(u)) add("sitemap_gap", { url: u, detail: "sitemap \u58F0\u660E\u4F46\u672C\u6B21\u672A\u722C\u5230\uFF08\u5B64\u5C9B\u9875\u6216 robots \u6392\u9664\uFF09" });
        }
      }
      const types = Object.keys(buckets).sort((a, b) => {
        const sa = SEVERITY_ORDER[(ISSUE_TYPES[a] || {}).severity] ?? 3;
        const sb = SEVERITY_ORDER[(ISSUE_TYPES[b] || {}).severity] ?? 3;
        return sa - sb || buckets[b].length - buckets[a].length;
      });
      let deduction = 0;
      const issues = types.map((type) => {
        const meta = ISSUE_TYPES[type] || { severity: "info", weight: 0, cap: 0, label: type, hint: "" };
        const items = buckets[type].slice(0, ISSUE_ITEMS_MAX);
        deduction += Math.min(buckets[type].length, meta.cap) * meta.weight;
        return { type, severity: meta.severity, label: meta.label, hint: meta.hint, count: buckets[type].length, truncated: buckets[type].length > ISSUE_ITEMS_MAX, items };
      });
      const score = Math.max(0, Math.round(100 - deduction));
      return { issues, score };
    }
    function verdictOf(report) {
      const s = report.stats || {};
      const notes = [];
      const bySeverity = { error: 0, warn: 0, info: 0 };
      for (const i of report.issues || []) bySeverity[i.severity] += i.count;
      const oneLine = bySeverity.error + bySeverity.warn + bySeverity.info === 0 ? `\u4F53\u68C0\u6EE1\u5206 ${report.score.value}/100\uFF1A${s.pagesCrawled} \u9875\u5168\u90E8\u5065\u5EB7` : `${report.score.value}/100 \xB7 ${s.pagesCrawled} \u9875 \xB7 \u9519\u8BEF ${bySeverity.error} / \u8B66\u544A ${bySeverity.warn} / \u63D0\u793A ${bySeverity.info}`;
      for (const i of (report.issues || []).slice(0, 4)) {
        notes.push(`${i.label} ${i.count} \u5904\uFF08${i.severity === "error" ? "\u9519\u8BEF" : i.severity === "warn" ? "\u8B66\u544A" : "\u63D0\u793A"}\uFF09\u2014\u2014${i.hint}`);
      }
      if (s.spaSuspect) notes.push("\u9875\u9762\u91CC\u51E0\u4E4E\u62BD\u4E0D\u5230\u94FE\u63A5\u2014\u2014\u8BE5\u7AD9\u53EF\u80FD\u9760 JS \u6E32\u67D3\uFF0C\u672C\u5DE5\u5177\u4E0D\u6267\u884C JS\uFF0C\u7ED3\u679C\u53EF\u80FD\u53EA\u8986\u76D6 shell \u9875\uFF1B\u53EF\u7528 sitemap \u5BF9\u6BD4\u786E\u8BA4\u89C4\u6A21");
      if (report.robots && report.robots.fetched && report.robots.blockedCount > 0) notes.push(`robots.txt \u6392\u9664\u4E86 ${report.robots.blockedCount} \u4E2A\u88AB\u94FE\u63A5\u7684\u5730\u5740\uFF08\u672C\u5DE5\u5177\u9ED8\u8BA4\u9075\u5B88 robots\uFF09`);
      if (report.sitemap && report.sitemap.fetched) notes.push(`sitemap \u5171\u58F0\u660E ${report.sitemap.urlCount} \u4E2A\u5730\u5740\uFF0C\u7AD9\u5185\u94FE\u63A5\u53D1\u73B0 ${s.pagesCrawled} \u9875`);
      else notes.push("\u672A\u8BFB\u5230 sitemap.xml\uFF08robots \u4E5F\u672A\u58F0\u660E\uFF09\u2014\u2014\u65E0\u6CD5\u505A\u8986\u76D6\u5BF9\u6BD4");
      return { oneLine, notes };
    }
    function buildReport(input) {
      const { auditId, at, seed, scopeHosts, options, pages, assets, externals, robots, sitemap, aborted, durationMs } = input;
      const { issues, score } = buildIssues({ pages, assets, externals, options, robots, sitemap });
      const statusDist = {};
      for (const pg of pages) {
        const k = pg.error ? "error" : String(pg.status || "error");
        statusDist[k] = (statusDist[k] || 0) + 1;
      }
      const slowest = pages.filter((x) => !x.error && x.status >= 200 && x.status < 300).sort((a, b) => b.ms - a.ms).slice(0, 10).map((x) => ({ url: x.url, ms: x.ms, bytes: x.bytes || 0 }));
      const brokenExt = (issues.find((i) => i.type === "broken_external") || { items: [] }).items;
      const byDomain = {};
      for (const it of brokenExt) {
        let host = hostOf(it.url) || "\u672A\u77E5\u57DF";
        if (!byDomain[host]) byDomain[host] = [];
        if (byDomain[host].length < 20) byDomain[host].push(it.url);
      }
      const htmlPages = pages.filter((x) => !x.error && x.status >= 200 && x.status < 300 && /html/i.test(x.contentType || ""));
      const linkCount = htmlPages.reduce((acc, x) => acc + (x.linkCount || 0), 0);
      const spaSuspect = htmlPages.length >= 3 && linkCount / htmlPages.length < 0.5;
      const stats = {
        pagesCrawled: pages.length,
        assetsChecked: assets.length,
        externalChecked: externals.length,
        externalSkipped: input.externalSkipped || 0,
        robotsBlocked: (issues.find((i) => i.type === "robots_blocked") || { count: 0 }).count,
        durationMs: Math.round(durationMs || 0),
        statusDist,
        avgPageMs: htmlPages.length ? Math.round(htmlPages.reduce((a, x) => a + x.ms, 0) / htmlPages.length) : null,
        spaSuspect
      };
      const report = {
        auditId,
        at: at || (/* @__PURE__ */ new Date()).toISOString(),
        version: VERSION,
        aborted: !!aborted,
        seed: { url: seed, scopeHosts },
        options,
        robots: robots ? { fetched: !!robots.fetched, crawlDelayMs: robots.crawlDelayMs || null, disallowCount: robots.disallowCount || 0, sitemaps: (robots.sitemaps || []).slice(0, 5) } : { fetched: false, crawlDelayMs: null, disallowCount: 0, sitemaps: [] },
        sitemap: sitemap ? { fetched: !!sitemap.fetched, url: sitemap.url || null, urlCount: (sitemap.urls || []).length } : { fetched: false, url: null, urlCount: 0 },
        stats,
        issues,
        slowest,
        externalByDomain: byDomain,
        score: { value: score }
      };
      report.score.verdict = verdictOf(report);
      return report;
    }
    function renderReportText(rep) {
      const lines = [];
      lines.push(`\u3010\u7AD9\u70B9\u4F53\u68C0\u62A5\u544A\u3011${rep.seed.url}${rep.aborted ? "\uFF08\u5DF2\u4E2D\u6B62\uFF0C\u90E8\u5206\u7ED3\u679C\uFF09" : ""}`);
      lines.push(`\u8303\u56F4\uFF1A${(rep.seed.scopeHosts || []).join(" + ")} \xB7 ${rep.stats.pagesCrawled} \u9875 / ${rep.stats.assetsChecked} \u8D44\u6E90 / ${rep.stats.externalChecked} \u5916\u94FE \xB7 \u8017\u65F6 ${(rep.stats.durationMs / 1e3).toFixed(1)}s`);
      lines.push(`\u5065\u5EB7\u5206\uFF1A${rep.score.value}/100 \u2014\u2014 ${rep.score.verdict.oneLine}`);
      if (!rep.issues.length) {
        lines.push("\u672A\u53D1\u73B0\u4EFB\u4F55\u68C0\u67E5\u9879\u95EE\u9898\u3002");
      } else {
        for (const i of rep.issues) {
          lines.push(`\xB7 [${i.severity === "error" ? "\u9519\u8BEF" : i.severity === "warn" ? "\u8B66\u544A" : "\u63D0\u793A"}] ${i.label} \xD7${i.count}${i.truncated ? `\uFF08\u660E\u7EC6\u4EC5\u5217\u524D ${i.items.length}\uFF09` : ""} \u2014\u2014 ${i.hint}`);
          for (const it of i.items.slice(0, 8)) lines.push(`    ${it.url}${it.detail ? ` \xB7 ${it.detail}` : ""}`);
          if (i.items.length > 8) lines.push(`    \u2026\u7B49 ${i.items.length} \u6761\uFF08\u7528 site_audit_issues \u770B\u5B8C\u6574\u660E\u7EC6\uFF09`);
        }
      }
      if (rep.slowest.length) {
        lines.push(`\u6700\u6162\u9875\u9762 TOP${Math.min(rep.slowest.length, 5)}\uFF1A${rep.slowest.slice(0, 5).map((s) => `${s.ms}ms ${s.url}`).join(" \xB7 ")}`);
      }
      const extDomains = Object.keys(rep.externalByDomain || {});
      if (extDomains.length) lines.push(`\u5916\u94FE\u5931\u6548\u57DF\u540D\uFF1A${extDomains.slice(0, 8).join("\u3001")}`);
      for (const n of rep.score.verdict.notes || []) lines.push(`\u6CE8\uFF1A${n}`);
      lines.push(`\uFF08auditId=${rep.auditId}\uFF0C\u5B8C\u6574\u660E\u7EC6\u7528 site_audit_issues \u68C0\u7D22\uFF0C\u62A5\u544A\u91CD\u770B\u7528 site_audit_report {auditId}\uFF09`);
      return lines.join("\n");
    }
    function issuesToCsv(rep) {
      const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      const rows = [["\u7C7B\u578B", "\u7EA7\u522B", "URL", "\u8BF4\u660E", "\u6765\u6E90\u9875\u9762"]];
      for (const i of rep.issues || []) {
        for (const it of i.items) rows.push([i.label, i.severity === "error" ? "\u9519\u8BEF" : i.severity === "warn" ? "\u8B66\u544A" : "\u63D0\u793A", it.url, it.detail || "", it.source || ""]);
      }
      return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    }
    function clamp(v, lim, dft) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return dft;
      return Math.min(lim.max, Math.max(lim.min, n));
    }
    function sanitizeOptions(input) {
      const src = input && typeof input === "object" ? input : {};
      const seed = normalizeUrl(src.url || src.seed || "");
      if (!seed.ok) return { ok: false, error: `\u76EE\u6807\u5730\u5740\u65E0\u6548\uFF1A${seed.error}` };
      if (isMetadataTarget(seed.url)) return { ok: false, error: "\u76EE\u6807\u5730\u5740\u662F\u4E91\u5143\u6570\u636E\u7AEF\u70B9\uFF0C\u7981\u6B62\u6293\u53D6" };
      return {
        ok: true,
        value: {
          seedUrl: seed.url,
          options: {
            maxPages: clamp(src.maxPages, LIMITS2.maxPages, LIMITS2.maxPages.default),
            delayMs: clamp(src.delayMs, LIMITS2.delayMs, LIMITS2.delayMs.default),
            timeoutS: clamp(src.timeoutS, LIMITS2.timeoutS, LIMITS2.timeoutS.default),
            concurrency: clamp(src.concurrency, LIMITS2.concurrency, LIMITS2.concurrency.default),
            slowMs: clamp(src.slowMs, LIMITS2.slowMs, LIMITS2.slowMs.default),
            auditTimeoutS: clamp(src.auditTimeoutS, LIMITS2.auditTimeoutS, LIMITS2.auditTimeoutS.default),
            externalCap: clamp(src.externalCap, LIMITS2.externalCap, LIMITS2.externalCap.default),
            respectRobots: src.respectRobots !== false,
            checkExternal: src.checkExternal !== false,
            checkAssets: src.checkAssets !== false
          }
        }
      };
    }
    function parseSitemap(xml) {
      const text = String(xml || "");
      const isIndex = /<sitemapindex[\s>]/i.test(text);
      const locs = [];
      const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
      let m;
      while ((m = re.exec(text)) && locs.length < 6e3) {
        const u = decodeEntities(m[1]).trim();
        if (u && /^https?:\/\//i.test(u)) locs.push(u);
      }
      return { kind: isIndex ? "index" : locs.length ? "urlset" : "unknown", locs };
    }
    function fmtMs(v) {
      return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}ms` : "n/a";
    }
    function fmtBytes(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return "n/a";
      if (n < 1024) return `${n}B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
      return `${(n / 1024 / 1024).toFixed(2)}MB`;
    }
    module.exports = {
      VERSION,
      PLUGIN_ID,
      UA_TOKEN,
      LIMITS: LIMITS2,
      ISSUE_TYPES,
      ISSUE_ITEMS_MAX,
      SEVERITY_ORDER,
      METADATA_HOSTS,
      normalizeUrl,
      isCrawlableHref,
      hostOf,
      isMetadataTarget,
      parseRobots,
      pickRobotGroup,
      robotsAllows,
      robotsPatternToRe,
      charsetFromContentType,
      sniffMetaCharset,
      decodeHtml,
      parseAttrs,
      scrubHtml,
      decodeEntities,
      scanHtml,
      evalRedirectChain,
      normDupText,
      buildIssues,
      verdictOf,
      buildReport,
      renderReportText,
      issuesToCsv,
      sanitizeOptions,
      clamp,
      parseSitemap,
      fmtMs,
      fmtBytes
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef as useRef2, useState as useState3 } from "react";

// src/model.ts
var core = __toESM(require_audit_core());

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}

// src/model.ts
async function kvReq(payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target: "cap.kv", payload } });
  if (!res || res.ok === false) throw new Error(String(res && res.error) || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res;
}
async function kvGet(key) {
  const res = await kvReq({ action: "get", key });
  return res.result && res.result.value !== void 0 ? res.result.value : null;
}
var KEY_META = "site-audit.meta";
var KEY_HISTORY = "site-audit.history";
var KEY_REPORT = (id) => `site-audit.report.${id}`;
var KEY_SETTINGS = "site-audit.settings";
async function getMeta() {
  try {
    const raw = await kvGet(KEY_META);
    if (!raw || typeof raw !== "object") return null;
    const m = raw;
    if (typeof m.token !== "string" || !m.token || typeof m.port !== "number" || !m.port) return null;
    return m;
  } catch (_) {
    return null;
  }
}
async function loadHistory() {
  try {
    const v = await kvGet(KEY_HISTORY);
    const items = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray(v.items) ? v.items : [];
    return items;
  } catch (_) {
    return [];
  }
}
async function loadReport(auditId) {
  try {
    const v = await kvGet(KEY_REPORT(auditId));
    return v && typeof v === "object" ? v : null;
  } catch (_) {
    return null;
  }
}
async function loadSettingsKv() {
  try {
    const v = await kvGet(KEY_SETTINGS);
    return v && typeof v === "object" ? v : null;
  } catch (_) {
    return null;
  }
}
function svcBase(meta) {
  return `http://127.0.0.1:${meta.port}`;
}
async function svcFetch(meta, path, init) {
  const res = await fetch(svcBase(meta) + path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-SiteAudit-Token": meta.token, ...init?.headers || {} }
  });
  const data = await res.json();
  return data;
}
async function opStart(meta, form) {
  return svcFetch(meta, "/api/op", {
    method: "POST",
    body: JSON.stringify({
      action: "start",
      payload: {
        url: form.url,
        maxPages: form.maxPages,
        delayMs: form.delayMs,
        timeoutS: form.timeoutS,
        concurrency: form.concurrency,
        slowMs: form.slowMs,
        respectRobots: form.respectRobots,
        checkExternal: form.checkExternal,
        checkAssets: form.checkAssets
      }
    })
  });
}
async function opAction(meta, action, payload = {}) {
  return svcFetch(meta, "/api/op", { method: "POST", body: JSON.stringify({ action, payload }) });
}
async function getLive(meta) {
  return svcFetch(meta, "/api/live");
}
function formFromSettings(settings) {
  const d = core.LIMITS;
  return {
    url: "",
    maxPages: settings?.maxPages || d.maxPages.default,
    delayMs: settings?.delayMs ?? d.delayMs.default,
    timeoutS: settings?.timeoutS || d.timeoutS.default,
    concurrency: settings?.concurrency || d.concurrency.default,
    slowMs: settings?.slowMs || d.slowMs.default,
    respectRobots: settings ? settings.respectRobots !== false : true,
    checkExternal: settings ? settings.checkExternal !== false : true,
    checkAssets: settings ? settings.checkAssets !== false : true
  };
}
function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5e3);
}

// src/WorkTab.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PHASE_LABEL = {
  seed: "\u951A\u5B9A\u8303\u56F4",
  robots: "\u8BFB\u53D6 robots.txt",
  sitemap: "\u8BFB\u53D6 sitemap",
  crawl: "\u722C\u53D6\u9875\u9762",
  external: "\u5916\u94FE\u6838\u67E5",
  done: "\u751F\u6210\u62A5\u544A"
};
function eventLabel(type) {
  const meta = core.ISSUE_TYPES[type];
  return meta ? meta.label : type;
}
function WorkTab({ meta, settings, lastReport, onRefresh, onOpenReport, initialLive }) {
  const [form, setForm] = useState(() => formFromSettings(settings));
  const [live, setLive] = useState(initialLive || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wasRunningRef = useRef(false);
  useEffect(() => {
    setForm(formFromSettings(settings));
  }, [settings]);
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await getLive(meta);
        if (!alive) return;
        setLive(r.live);
        setError(r.ok === false && r.error ? r.error : "");
        if (wasRunningRef.current && !r.running) {
          wasRunningRef.current = false;
          onRefresh();
          if (r.lastReportId) onOpenReport(r.lastReportId);
        }
        wasRunningRef.current = r.running;
      } catch {
      }
    };
    tick();
    const t = setInterval(tick, 800);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [meta, onRefresh, onOpenReport]);
  const start = useCallback(async () => {
    if (!meta) return;
    setBusy(true);
    setError("");
    try {
      const r = await opStart(meta, form);
      if (!r.ok) {
        setError(r.busy ? `${r.error}\uFF08\u53EF\u5728\u4E0B\u65B9\u8FDB\u5EA6\u5361\u4E2D\u6B62\u540E\u518D\u53D1\u8D77\uFF09` : r.error || "\u53D1\u8D77\u5931\u8D25");
        return;
      }
      wasRunningRef.current = true;
    } catch (e) {
      setError(`\u670D\u52A1\u8FDE\u63A5\u5931\u8D25\uFF1A${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [meta, form]);
  const stop = useCallback(async () => {
    if (!meta) return;
    try {
      await opAction(meta, "stop");
    } catch {
    }
  }, [meta]);
  const running = !!live;
  const demoUrl = meta ? `http://127.0.0.1:${meta.port}/demo/` : "";
  const pct = live ? Math.min(100, Math.round(live.pagesDone / Math.max(live.maxPages, 1) * 100)) : 0;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "sa-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "sa-bar" }),
      "\u53D1\u8D77\u4F53\u68C0",
      /* @__PURE__ */ jsx("span", { className: "sa-hint", children: "\u9ED8\u8BA4\u9075\u5B88 robots.txt \xB7 \u540C\u7AD9\u6DF1\u722C \xB7 \u5916\u94FE\u53EA\u9A8C\u5B58\u6D3B" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sa-card", children: /* @__PURE__ */ jsxs("div", { className: "sa-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "sa-fmrow", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "sa-inp",
            placeholder: "\u79CD\u5B50 URL\uFF0C\u5982 https://example.com/ \u6216\u672C\u673A\u5F00\u53D1\u7AD9 http://127.0.0.1:4173/",
            value: form.url,
            disabled: running || busy || !meta,
            onChange: (e) => setForm((f) => ({ ...f, url: e.target.value })),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !running && !busy) start();
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "sa-btn", disabled: running || busy || !meta || !form.url.trim(), onClick: start, children: "\u5F00\u59CB\u4F53\u68C0" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sa-fmrow", children: [
        /* @__PURE__ */ jsx("span", { className: "sa-sub", children: "\u8BD5\u91D1\u77F3\uFF1A" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "sa-btn ghost sm",
            disabled: running || busy || !meta,
            onClick: () => setForm((f) => ({ ...f, url: demoUrl })),
            children: "\u586B\u5165\u5185\u7F6E\u8BD5\u91D1\u77F3\u7AD9"
          }
        ),
        meta && /* @__PURE__ */ jsxs("span", { className: "sa-sub", children: [
          "\uFF08",
          demoUrl,
          "\uFF0C\u542B 404/\u91CD\u5B9A\u5411\u94FE/\u7F3Aalt/\u6162\u9875/robots \u6392\u9664/sitemap \u5B64\u5C9B\uFF0C\u96F6\u914D\u7F6E\u9A8C\u8BC1\u5DE5\u5177\u94FE\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sa-fmgrid", children: [
        /* @__PURE__ */ jsx("label", { children: "\u6700\u591A\u9875\u6570" }),
        /* @__PURE__ */ jsxs("div", { className: "sa-unitwrap", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "sa-inp",
              type: "number",
              min: core.LIMITS.maxPages.min,
              max: core.LIMITS.maxPages.max,
              value: form.maxPages,
              disabled: running,
              onChange: (e) => setForm((f) => ({ ...f, maxPages: Number(e.target.value) || 0 }))
            }
          ),
          /* @__PURE__ */ jsxs("span", { children: [
            "5~",
            core.LIMITS.maxPages.max
          ] })
        ] }),
        /* @__PURE__ */ jsx("label", { children: "\u540C\u7AD9\u95F4\u9694" }),
        /* @__PURE__ */ jsxs("div", { className: "sa-unitwrap", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "sa-inp",
              type: "number",
              min: core.LIMITS.delayMs.min,
              max: core.LIMITS.delayMs.max,
              value: form.delayMs,
              disabled: running,
              onChange: (e) => setForm((f) => ({ ...f, delayMs: Number(e.target.value) || 0 }))
            }
          ),
          /* @__PURE__ */ jsx("span", { children: "ms\uFF08\u793C\u8C8C\u722C\u53D6\uFF0Crobots Crawl-delay \u66F4\u4E25\u65F6\u4ECE\u5176\u89C4\u5B9A\uFF09" })
        ] }),
        /* @__PURE__ */ jsx("label", { children: "\u5355\u9875\u8D85\u65F6" }),
        /* @__PURE__ */ jsxs("div", { className: "sa-unitwrap", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "sa-inp",
              type: "number",
              min: core.LIMITS.timeoutS.min,
              max: core.LIMITS.timeoutS.max,
              value: form.timeoutS,
              disabled: running,
              onChange: (e) => setForm((f) => ({ ...f, timeoutS: Number(e.target.value) || 0 }))
            }
          ),
          /* @__PURE__ */ jsx("span", { children: "\u79D2\uFF082~30\uFF09" })
        ] }),
        /* @__PURE__ */ jsx("label", { children: "\u5E76\u53D1\u6570" }),
        /* @__PURE__ */ jsxs("div", { className: "sa-unitwrap", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "sa-inp",
              type: "number",
              min: core.LIMITS.concurrency.min,
              max: core.LIMITS.concurrency.max,
              value: form.concurrency,
              disabled: running,
              onChange: (e) => setForm((f) => ({ ...f, concurrency: Number(e.target.value) || 0 }))
            }
          ),
          /* @__PURE__ */ jsx("span", { children: "1~12" })
        ] }),
        /* @__PURE__ */ jsx("label", { children: "\u6162\u9875\u9608\u503C" }),
        /* @__PURE__ */ jsxs("div", { className: "sa-unitwrap", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "sa-inp",
              type: "number",
              min: core.LIMITS.slowMs.min,
              max: core.LIMITS.slowMs.max,
              value: form.slowMs,
              disabled: running,
              onChange: (e) => setForm((f) => ({ ...f, slowMs: Number(e.target.value) || 0 }))
            }
          ),
          /* @__PURE__ */ jsx("span", { children: "ms" })
        ] }),
        /* @__PURE__ */ jsx("label", { children: "\u68C0\u67E5\u5F00\u5173" }),
        /* @__PURE__ */ jsxs("div", { className: "sa-chiprow", children: [
          /* @__PURE__ */ jsxs("label", { className: "sa-sub", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: form.respectRobots,
                disabled: running,
                onChange: (e) => setForm((f) => ({ ...f, respectRobots: e.target.checked }))
              }
            ),
            " \u9075\u5B88 robots.txt"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "sa-sub", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: form.checkExternal,
                disabled: running,
                onChange: (e) => setForm((f) => ({ ...f, checkExternal: e.target.checked }))
              }
            ),
            " \u6838\u67E5\u5916\u94FE\uFF08\u53EA\u9A8C\u5B58\u6D3B\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "sa-sub", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: form.checkAssets,
                disabled: running,
                onChange: (e) => setForm((f) => ({ ...f, checkAssets: e.target.checked }))
              }
            ),
            " \u6838\u67E5\u56FE\u7247/\u6837\u5F0F/\u811A\u672C"
          ] })
        ] })
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "sa-err", children: error }),
      !meta && /* @__PURE__ */ jsx("div", { className: "sa-sub", children: "\u670D\u52A1\u672A\u8FDE\u63A5\uFF1A\u8BF7\u786E\u8BA4\u63D2\u4EF6\u5DF2\u542F\u7528\uFF1B\u5BBF\u4E3B\u62C9\u8D77\u670D\u52A1\u540E\u5373\u53EF\u53D1\u8D77\u3002" })
    ] }) }),
    running && live && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "sa-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "sa-bar" }),
        "\u8FDB\u884C\u4E2D",
        /* @__PURE__ */ jsxs("span", { className: "sa-hint", children: [
          "auditId=",
          live.auditId,
          " \xB7 \u6765\u6E90 ",
          live.source === "mcp" ? "AI" : "\u9762\u677F"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sa-card", children: /* @__PURE__ */ jsxs("div", { className: "sa-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "sa-row-h", style: { marginBottom: 6 }, children: [
          /* @__PURE__ */ jsx("span", { className: "sa-tag", children: PHASE_LABEL[live.phase] || live.phase }),
          /* @__PURE__ */ jsx("span", { className: "sa-mono sa-sub", style: { wordBreak: "break-all" }, children: live.seed })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sa-prog", children: /* @__PURE__ */ jsx("i", { style: { width: `${pct}%` } }) }),
        /* @__PURE__ */ jsxs("div", { className: "sa-sum", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("b", { className: "sa-num", children: live.pagesDone }),
            /* @__PURE__ */ jsxs("small", { children: [
              "\u5DF2\u722C\u9875\u9762 / \u4E0A\u9650 ",
              live.maxPages
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("b", { className: "sa-num", children: live.queueLen }),
            /* @__PURE__ */ jsx("small", { children: "\u961F\u5217\u5F85\u722C" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("b", { className: "sa-num", children: live.assetsDone }),
            /* @__PURE__ */ jsx("small", { children: "\u8D44\u6E90\u6838\u67E5" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("b", { className: "sa-num", children: [
              live.externalDone,
              live.externalTotal ? `/${live.externalTotal}` : ""
            ] }),
            /* @__PURE__ */ jsx("small", { children: "\u5916\u94FE\u6838\u67E5" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("b", { className: `sa-num ${live.errors ? "sa-bad" : ""}`, style: live.errors ? { color: "#FF8A9A" } : void 0, children: live.errors }),
            /* @__PURE__ */ jsx("small", { children: "\u5F02\u5E38" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("b", { className: "sa-num", children: [
              live.elapsedS,
              "s"
            ] }),
            /* @__PURE__ */ jsx("small", { children: "\u5DF2\u7528\u65F6" })
          ] })
        ] }),
        live.scopeHosts.length > 0 && /* @__PURE__ */ jsxs("div", { className: "sa-sub", children: [
          "\u8303\u56F4 host\uFF1A",
          live.scopeHosts.join(" + ")
        ] }),
        live.current.length > 0 && /* @__PURE__ */ jsxs("div", { className: "sa-sub", children: [
          "\u8FDB\u884C\u4E2D\uFF1A",
          live.current.join(" \xB7 ")
        ] }),
        live.recentEvents.length > 0 && /* @__PURE__ */ jsx("div", { style: { marginTop: 6 }, children: live.recentEvents.slice(-6).reverse().map((e, i) => /* @__PURE__ */ jsxs("div", { className: "sa-evrow", children: [
          /* @__PURE__ */ jsx("span", { className: "sa-tag", children: eventLabel(e.type) }),
          /* @__PURE__ */ jsx("span", { className: "sa-mono", style: { wordBreak: "break-all" }, children: e.url }),
          e.detail && /* @__PURE__ */ jsx("span", { className: "sa-muted", children: e.detail })
        ] }, `${e.at}-${i}`)) }),
        /* @__PURE__ */ jsxs("div", { className: "sa-btnrow", children: [
          /* @__PURE__ */ jsx("button", { className: "sa-btn danger", onClick: stop, children: "\u4E2D\u6B62\u4F53\u68C0" }),
          /* @__PURE__ */ jsx("span", { className: "sa-sub", children: "\u4E2D\u6B62\u540E\u5DF2\u722C\u5230\u7684\u90E8\u5206\u4F1A\u4FDD\u7559\u6210\u62A5\u544A\u3002" })
        ] })
      ] }) })
    ] }),
    !running && lastReport && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "sa-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "sa-bar" }),
        "\u6700\u8FD1\u4E00\u6B21\u4F53\u68C0",
        /* @__PURE__ */ jsx("span", { className: "sa-hint", children: lastReport.at.replace("T", " ").slice(0, 16) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sa-card", children: /* @__PURE__ */ jsxs("div", { className: "sa-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "sa-row-h", style: { marginBottom: 6 }, children: [
          /* @__PURE__ */ jsxs("span", { className: `sa-badge ${lastReport.score.value >= 90 ? "good" : lastReport.score.value >= 70 ? "warn" : "bad"}`, children: [
            lastReport.score.value,
            "/100"
          ] }),
          /* @__PURE__ */ jsx("span", { className: "sa-mono sa-sub", style: { wordBreak: "break-all" }, children: lastReport.seed.url }),
          lastReport.aborted && /* @__PURE__ */ jsx("span", { className: "sa-tag", children: "\u5DF2\u4E2D\u6B62\xB7\u90E8\u5206\u7ED3\u679C" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sa-sub", children: lastReport.score.verdict.oneLine }),
        /* @__PURE__ */ jsx("div", { className: "sa-btnrow", children: /* @__PURE__ */ jsx("button", { className: "sa-btn ghost sm", onClick: () => onOpenReport(lastReport.auditId), children: "\u67E5\u770B\u5B8C\u6574\u62A5\u544A" }) })
      ] }) })
    ] })
  ] });
}

// src/ReportTab.tsx
import { useMemo } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function scoreColor(v) {
  return v >= 90 ? "#3FB950" : v >= 70 ? "#E3B341" : "#F85149";
}
function ScoreRing({ value }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, value)) / 100;
  const color = scoreColor(value);
  return /* @__PURE__ */ jsxs2("div", { className: "sa-ring", children: [
    /* @__PURE__ */ jsxs2("svg", { width: "74", height: "74", viewBox: "0 0 74 74", children: [
      /* @__PURE__ */ jsx2("circle", { cx: "37", cy: "37", r, fill: "none", stroke: "#242C3A", strokeWidth: "7" }),
      /* @__PURE__ */ jsx2(
        "circle",
        {
          cx: "37",
          cy: "37",
          r,
          fill: "none",
          stroke: color,
          strokeWidth: "7",
          strokeDasharray: `${(c * filled).toFixed(1)} ${c.toFixed(1)}`,
          strokeLinecap: "round"
        }
      )
    ] }),
    /* @__PURE__ */ jsx2("b", { style: { color }, children: value })
  ] });
}
function IssueCard({ group, defaultOpen }) {
  return /* @__PURE__ */ jsxs2("details", { className: "sa-issue", open: defaultOpen, children: [
    /* @__PURE__ */ jsxs2("summary", { className: "sa-issue-h", children: [
      /* @__PURE__ */ jsx2("span", { className: `sa-badge ${group.severity === "error" ? "bad" : group.severity === "warn" ? "warn" : "info"}`, children: group.severity === "error" ? "\u9519\u8BEF" : group.severity === "warn" ? "\u8B66\u544A" : "\u63D0\u793A" }),
      /* @__PURE__ */ jsx2("b", { children: group.label }),
      /* @__PURE__ */ jsxs2("span", { className: "sa-issue-n", children: [
        "\xD7",
        group.count,
        group.truncated ? `\uFF08\u660E\u7EC6\u622A\u53D6\u524D ${group.items.length}\uFF09` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sa-issue-items", children: [
      /* @__PURE__ */ jsx2("div", { className: "sa-detail", children: group.hint }),
      group.items.map((it, i) => /* @__PURE__ */ jsxs2("div", { className: "sa-issue-item", children: [
        /* @__PURE__ */ jsx2("div", { className: "sa-mono", children: it.url }),
        it.detail && /* @__PURE__ */ jsx2("div", { className: "sa-detail", children: it.detail }),
        it.source && it.source !== it.url && /* @__PURE__ */ jsxs2("div", { className: "sa-src", children: [
          "\u6765\u6E90\u9875\uFF1A",
          it.source
        ] }),
        it.dupUrls && it.dupUrls.length > 1 && /* @__PURE__ */ jsxs2("div", { className: "sa-src", children: [
          "\u540C\u6B3E\u9875\u9762\uFF1A",
          it.dupUrls.join(" \xB7 ")
        ] })
      ] }, `${it.url}-${i}`))
    ] })
  ] });
}
function ReportView({ report, onSendToChat }) {
  const csv = useMemo(() => report ? core.issuesToCsv(report) : "", [report]);
  if (!report) {
    return /* @__PURE__ */ jsxs2("div", { className: "sa-empty", children: [
      "\u8FD8\u6CA1\u6709\u4F53\u68C0\u62A5\u544A\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u5728\u300C\u4F53\u68C0\u300DTab \u8F93\u5165\u79CD\u5B50 URL \u53D1\u8D77\uFF0C\u6216\u5148\u70B9\u300C\u586B\u5165\u5185\u7F6E\u8BD5\u91D1\u77F3\u7AD9\u300D\u4F53\u9A8C\u5B8C\u6574\u94FE\u8DEF\u3002"
    ] });
  }
  const s = report.stats;
  const statusChips = Object.entries(s.statusDist).sort((a, b) => b[1] - a[1]);
  const extDomains = Object.entries(report.externalByDomain || {});
  const slug = report.seed.url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_").slice(0, 40) || "site-audit";
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsx2("div", { className: "sa-card", children: /* @__PURE__ */ jsxs2("div", { className: "sa-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sa-score", children: [
        /* @__PURE__ */ jsx2(ScoreRing, { value: report.score.value }),
        /* @__PURE__ */ jsxs2("div", { style: { minWidth: 0 }, children: [
          /* @__PURE__ */ jsxs2("div", { className: "sa-row-h", children: [
            /* @__PURE__ */ jsx2("b", { style: { fontSize: 13 }, children: report.score.verdict.oneLine }),
            report.aborted && /* @__PURE__ */ jsx2("span", { className: "sa-badge warn", children: "\u5DF2\u4E2D\u6B62\xB7\u90E8\u5206\u7ED3\u679C" }),
            report.fatal && /* @__PURE__ */ jsx2("span", { className: "sa-badge bad", children: "\u542F\u52A8\u5931\u8D25" })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "sa-mono sa-sub", style: { wordBreak: "break-all" }, children: report.seed.url }),
          /* @__PURE__ */ jsxs2("div", { className: "sa-sub", children: [
            "\u8303\u56F4 host\uFF1A",
            (report.seed.scopeHosts || []).join(" + ") || "\u2014",
            " \xB7 ",
            s.pagesCrawled,
            " \u9875 / ",
            s.assetsChecked,
            " \u8D44\u6E90 / ",
            s.externalChecked,
            " \u5916\u94FE \xB7 \u8017\u65F6 ",
            (s.durationMs / 1e3).toFixed(1),
            "s",
            s.avgPageMs != null ? ` \xB7 \u5E73\u5747\u9875\u54CD\u5E94 ${s.avgPageMs}ms` : ""
          ] })
        ] })
      ] }),
      report.fatal && /* @__PURE__ */ jsxs2("div", { className: "sa-err", children: [
        "\u4F53\u68C0\u672A\u80FD\u6B63\u5E38\u5F00\u59CB\uFF1A",
        report.fatal
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 8 }, children: report.score.verdict.notes.map((n, i) => /* @__PURE__ */ jsxs2("div", { className: "sa-sub", children: [
        "\xB7 ",
        n
      ] }, i)) }),
      /* @__PURE__ */ jsxs2("div", { className: "sa-btnrow", children: [
        /* @__PURE__ */ jsx2("button", { className: "sa-btn ghost sm", onClick: () => downloadText(`site-audit-${slug}-${report.auditId}.json`, JSON.stringify(report, null, 2), "application/json"), children: "\u5BFC\u51FA JSON" }),
        /* @__PURE__ */ jsx2("button", { className: "sa-btn ghost sm", onClick: () => downloadText(`site-audit-${slug}-${report.auditId}.csv`, csv, "text/csv"), children: "\u5BFC\u51FA CSV\uFF08\u95EE\u9898\u660E\u7EC6\uFF09" }),
        onSendToChat && /* @__PURE__ */ jsx2("button", { className: "sa-btn ghost sm", onClick: () => onSendToChat(`\u8BF7\u5E2E\u6211\u89E3\u8BFB\u8FD9\u4EFD\u7AD9\u70B9\u4F53\u68C0\u62A5\u544A\u5E76\u63D0\u51FA\u4FEE\u590D\u5EFA\u8BAE\uFF1A

${core.renderReportText(report)}`), children: "\u53D1\u7ED9 AI \u89E3\u8BFB" })
      ] })
    ] }) }),
    report.issues.length > 0 && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "sa-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "sa-bar" }),
        "\u95EE\u9898\u6E05\u5355",
        /* @__PURE__ */ jsxs2("span", { className: "sa-hint", children: [
          report.issues.length,
          " \u7C7B \xB7 \u70B9\u5F00\u770B\u660E\u7EC6\u4E0E\u6765\u6E90\u9875"
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "sa-card", children: /* @__PURE__ */ jsx2("div", { className: "sa-card-b", style: { padding: 0 }, children: report.issues.map((g) => /* @__PURE__ */ jsx2(IssueCard, { group: g, defaultOpen: g.severity === "error" }, g.type)) }) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sa-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "sa-bar" }),
      "\u72B6\u6001\u7801\u5206\u5E03\u4E0E\u6700\u6162\u9875\u9762",
      /* @__PURE__ */ jsxs2("span", { className: "sa-hint", children: [
        "\u5E73\u5747\u9875\u54CD\u5E94 ",
        s.avgPageMs != null ? `${s.avgPageMs}ms` : "\u2014"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "sa-card", children: /* @__PURE__ */ jsxs2("div", { className: "sa-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sa-chiprow", style: { marginBottom: 8 }, children: [
        statusChips.length === 0 && /* @__PURE__ */ jsx2("span", { className: "sa-sub", children: "\u65E0\u8BF7\u6C42\u8BB0\u5F55" }),
        statusChips.map(([code, n]) => /* @__PURE__ */ jsxs2("span", { className: `sa-badge ${code === "200" ? "good" : code.startsWith("3") ? "info" : code === "error" ? "bad" : "warn"}`, children: [
          code,
          " \xD7 ",
          n
        ] }, code))
      ] }),
      report.slowest.length > 0 && /* @__PURE__ */ jsxs2("table", { className: "sa-tb", children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx2("th", { children: "\u9875\u9762" }),
          /* @__PURE__ */ jsx2("th", { children: "\u54CD\u5E94" }),
          /* @__PURE__ */ jsx2("th", { children: "\u4F53\u79EF" })
        ] }) }),
        /* @__PURE__ */ jsx2("tbody", { children: report.slowest.map((x) => /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx2("td", { className: "sa-mono", style: { maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }, title: x.url, children: x.url }),
          /* @__PURE__ */ jsxs2("td", { className: "sa-num", children: [
            x.ms,
            "ms"
          ] }),
          /* @__PURE__ */ jsx2("td", { className: "sa-num", children: core.fmtBytes(x.bytes) })
        ] }, x.url)) })
      ] }),
      extDomains.length > 0 && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("div", { className: "sa-sub", style: { marginBottom: 4 }, children: "\u5916\u94FE\u5931\u6548\u6309\u57DF\u805A\u5408\uFF1A" }),
        extDomains.slice(0, 10).map(([d, urls]) => /* @__PURE__ */ jsxs2("div", { className: "sa-evrow", children: [
          /* @__PURE__ */ jsx2("span", { className: "sa-badge warn", children: d }),
          /* @__PURE__ */ jsxs2("span", { className: "sa-muted", children: [
            urls.length,
            " \u6761\uFF0C\u5982 ",
            urls[0]
          ] })
        ] }, d))
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "sa-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "sa-bar" }),
      "robots \u4E0E sitemap"
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "sa-card", children: /* @__PURE__ */ jsx2("div", { className: "sa-card-b", children: /* @__PURE__ */ jsxs2("dl", { className: "sa-kv", children: [
      /* @__PURE__ */ jsx2("dt", { children: "robots.txt" }),
      /* @__PURE__ */ jsxs2("dd", { children: [
        report.robots.fetched ? "\u5DF2\u8BFB\u53D6" : "\u672A\u8BFB\u5230\uFF08\u672A\u5F00\u542F\u9075\u5B88\u6216\u76EE\u6807\u65E0\u6B64\u6587\u4EF6\uFF09",
        report.robots.crawlDelayMs ? ` \xB7 Crawl-delay ${report.robots.crawlDelayMs}ms` : "",
        report.robots.disallowCount ? ` \xB7 ${report.robots.disallowCount} \u6761 Disallow \u89C4\u5219` : ""
      ] }),
      /* @__PURE__ */ jsx2("dt", { children: "\u6392\u9664\u660E\u7EC6" }),
      /* @__PURE__ */ jsx2("dd", { children: report.robots.fetched && s.robotsBlocked > 0 ? `${s.robotsBlocked} \u4E2A\u88AB\u94FE\u63A5\u5730\u5740\u88AB robots \u6392\u9664\uFF08\u89C1\u95EE\u9898\u6E05\u5355\uFF09` : "\u65E0\u88AB\u6392\u9664\u7684\u88AB\u94FE\u63A5\u5730\u5740" }),
      /* @__PURE__ */ jsx2("dt", { children: "sitemap" }),
      /* @__PURE__ */ jsx2("dd", { children: report.sitemap.fetched ? `${report.sitemap.urlCount} \u4E2A\u5730\u5740\uFF08${report.sitemap.url}\uFF09` : "\u672A\u8BFB\u5230 sitemap\uFF08robots \u4E5F\u672A\u58F0\u660E\uFF09\u2014\u2014\u65E0\u6CD5\u505A\u8986\u76D6\u5BF9\u6BD4" }),
      /* @__PURE__ */ jsx2("dt", { children: "\u672C\u6B21\u8303\u56F4" }),
      /* @__PURE__ */ jsxs2("dd", { children: [
        s.pagesCrawled,
        " \u9875 \xB7 \u5916\u94FE\u6838\u67E5 ",
        s.externalChecked,
        s.externalSkipped ? `\uFF08\u8D85\u51FA\u4E0A\u9650\u8DF3\u8FC7 ${s.externalSkipped}\uFF09` : ""
      ] })
    ] }) }) })
  ] });
}

// src/HistoryTab.tsx
import { useState as useState2 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function HistoryTab({ meta, history, onRefresh, onView }) {
  const [busy, setBusy] = useState2(false);
  const clear = async () => {
    if (!meta || busy) return;
    setBusy(true);
    try {
      await opAction(meta, "clear_history");
      onRefresh();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "sa-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "sa-bar" }),
      "\u4F53\u68C0\u5386\u53F2",
      /* @__PURE__ */ jsx3("span", { className: "sa-hint", children: "\u62A5\u544A\u4FDD\u7559\u6700\u8FD1 20 \u4EFD\uFF08\u8D85\u51FA\u81EA\u52A8\u6E05\u7406\uFF09" })
    ] }),
    history.length === 0 && /* @__PURE__ */ jsxs3("div", { className: "sa-empty", children: [
      "\u8FD8\u6CA1\u6709\u4F53\u68C0\u5386\u53F2\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u5728\u300C\u4F53\u68C0\u300DTab \u53D1\u8D77\u7B2C\u4E00\u6B21\u6574\u7AD9\u4F53\u68C0\uFF1B\u62A5\u544A\u5B8C\u6210\u540E\u4F1A\u7559\u6863\u5728\u8FD9\u91CC\uFF0C\u53EF\u968F\u65F6\u56DE\u770B\u4E0E\u5BF9\u6BD4\u3002"
    ] }),
    history.map((h) => /* @__PURE__ */ jsx3("div", { className: "sa-card", children: /* @__PURE__ */ jsxs3("div", { className: "sa-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "sa-row-h", children: [
        /* @__PURE__ */ jsx3("span", { className: `sa-badge ${h.fatal ? "bad" : h.score >= 90 ? "good" : h.score >= 70 ? "warn" : "bad"}`, children: h.fatal ? "\u5931\u8D25" : `${h.score}/100` }),
        /* @__PURE__ */ jsx3("b", { style: { fontSize: 12 }, className: "sa-mono", children: h.seed }),
        h.aborted && /* @__PURE__ */ jsx3("span", { className: "sa-tag", children: "\u4E2D\u6B62" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "sa-sub", style: { marginTop: 4 }, children: [
        String(h.at).replace("T", " ").slice(0, 16),
        " \xB7 ",
        h.pagesCrawled,
        " \u9875 / ",
        h.assetsChecked,
        " \u8D44\u6E90 / ",
        h.externalChecked,
        " \u5916\u94FE \xB7 ",
        (h.durationMs / 1e3).toFixed(1),
        "s \xB7 \u9519\u8BEF ",
        h.errors,
        " \xB7 \u8B66\u544A ",
        h.warns
      ] }),
      h.fatal && /* @__PURE__ */ jsx3("div", { className: "sa-err", children: h.fatal }),
      /* @__PURE__ */ jsx3("div", { className: "sa-sub", style: { marginTop: 2 }, children: h.verdictOne }),
      /* @__PURE__ */ jsxs3("div", { className: "sa-btnrow", children: [
        /* @__PURE__ */ jsx3("button", { className: "sa-btn ghost sm", onClick: () => onView(h.auditId), disabled: Boolean(h.fatal) && h.pagesCrawled === 0, children: "\u67E5\u770B\u62A5\u544A" }),
        /* @__PURE__ */ jsxs3("span", { className: "sa-sub sa-mono", children: [
          "auditId=",
          h.auditId
        ] })
      ] })
    ] }) }, h.auditId)),
    history.length > 0 && meta && /* @__PURE__ */ jsxs3("div", { className: "sa-btnrow", style: { padding: "0 18px" }, children: [
      /* @__PURE__ */ jsx3("button", { className: "sa-btn danger sm", onClick: clear, disabled: busy, children: "\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55" }),
      /* @__PURE__ */ jsx3("span", { className: "sa-sub", children: "\u53EA\u6E05\u5386\u53F2\u6E05\u5355\uFF0C\u5DF2\u4FDD\u7559\u7684\u62A5\u544A\u4ECD\u53EF\u7528 auditId \u8BFB\u53D6\u3002" })
    ] })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.sa-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sa-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sa-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sa-body::-webkit-scrollbar{width:9px;height:9px}
.sa-body::-webkit-scrollbar-track{background:transparent}
.sa-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sa-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.sa-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2B6CB0,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.sa-tt{flex:1;min-width:0}
.sa-tt b{font-size:15px;display:block}
.sa-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.sa-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.sa-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.sa-dot.stale{background:#D29922}
.sa-dot.down{background:#F85149}
.sa-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.sa-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.sa-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.sa-tab:hover{color:#E6EAF2}
.sa-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sa-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sa-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2B6CB0,#3FB950);flex-shrink:0}
.sa-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400;text-align:right}
.sa-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sa-card-b{padding:11px 13px}
.sa-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.sa-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.sa-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.sa-btn:hover{filter:brightness(1.1)}
.sa-btn:disabled{opacity:.45;cursor:not-allowed}
.sa-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.sa-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.sa-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.sa-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.sa-inp:focus{outline:none;border-color:#2b6cb0}
.sa-inp::placeholder{color:#4d5566}
.sa-inp:disabled{opacity:.6}
.sa-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.sa-sel:disabled{opacity:.6}
.sa-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.sa-err{color:#F85149;font-size:11.5px;padding:8px 0 0;word-break:break-all}
.sa-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.sa-ok{color:#3FB950}
.sa-mono{font-family:Consolas,Menlo,monospace}
.sa-num{font-family:Consolas,Menlo,monospace}
.sa-row{padding:9px 13px;border-top:1px solid #1d2330}
.sa-row:hover{background:#12151c}
.sa-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sa-muted{color:#5C6678}
.sa-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.sa-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.sa-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.sa-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.sa-badge.info{background:#12233b;color:#58A6FF;border:1px solid #1f3a5f}
.sa-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.sa-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.sa-sum b{font-size:19px;display:block;line-height:1.2}
.sa-sum small{color:#8B95A7;font-size:9.5px}
.sa-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:0 0 8px}
.sa-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2B6CB0,#3FB950);border-radius:3px;transition:width .5s}
.sa-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.sa-kv dt{color:#5C6678;white-space:nowrap}
.sa-kv dd{margin:0;word-break:break-all}
table.sa-tb{width:100%;border-collapse:collapse;font-size:11.5px}
table.sa-tb th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
table.sa-tb td{padding:6px 8px;border-top:1px solid #1d2330;white-space:nowrap}
.sa-fmrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.sa-fmgrid{display:grid;grid-template-columns:auto 1fr;gap:7px 10px;align-items:center;font-size:11.5px;margin:8px 0}
.sa-fmgrid label{color:#8B95A7;white-space:nowrap}
.sa-unitwrap{display:flex;align-items:center;gap:6px}
.sa-unitwrap>span{color:#5C6678;font-size:10.5px;white-space:nowrap}
.sa-btnrow{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.sa-chiprow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sa-warncard{margin:10px 16px 0;padding:8px 12px;border:1px solid #4d4316;background:#2a2410;color:#E3B341;border-radius:10px;font-size:11.5px}
.sa-score{display:flex;align-items:center;gap:14px;padding:2px 0 4px}
.sa-ring{position:relative;width:74px;height:74px;flex-shrink:0}
.sa-ring svg{transform:rotate(-90deg)}
.sa-ring b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px}
.sa-issue{border-top:1px solid #1d2330}
.sa-issue:first-child{border-top:none}
.sa-issue-h{display:flex;align-items:center;gap:8px;padding:9px 13px;cursor:pointer;user-select:none}
.sa-issue-h:hover{background:#12151c}
.sa-issue-h b{font-size:12px}
.sa-issue-n{margin-left:auto;color:#5C6678;font-size:11px;white-space:nowrap}
.sa-issue-items{padding:0 13px 10px;display:flex;flex-direction:column;gap:6px}
.sa-issue-item{background:#12151c;border:1px solid #1d2330;border-radius:8px;padding:7px 9px;font-size:11px}
.sa-issue-item .sa-mono{word-break:break-all}
.sa-detail{color:#8B95A7;margin-top:2px;word-break:break-all}
.sa-src{color:#5C6678;margin-top:2px;word-break:break-all}
.sa-evrow{display:flex;gap:8px;font-size:11px;padding:3px 0;align-items:baseline}
`;
var TABS = [
  { id: "work", label: "\u4F53\u68C0" },
  { id: "report", label: "\u62A5\u544A" },
  { id: "history", label: "\u5386\u53F2" }
];
function Panel(props) {
  const [tab, setTab] = useState3("work");
  const [meta, setMeta] = useState3(null);
  const [settings, setSettings] = useState3(null);
  const [report, setReport] = useState3(null);
  const [history, setHistory] = useState3([]);
  const [reloadTick, setReloadTick] = useState3(0);
  const visibleRef = useRef2(true);
  const refreshAll = useCallback2(async () => {
    try {
      const [m, s, h] = await Promise.all([getMeta(), loadSettingsKv(), loadHistory()]);
      setMeta(m);
      setSettings(s);
      setHistory(h);
      const rid = m?.lastReportId;
      if (rid) {
        const rep = await loadReport(rid);
        setReport(rep);
      }
    } catch {
    }
  }, []);
  useEffect2(() => {
    refreshAll();
  }, [refreshAll, reloadTick]);
  useEffect2(() => {
    const t = setInterval(async () => {
      if (!visibleRef.current) return;
      try {
        const m = await getMeta();
        setMeta((prev) => {
          if (prev && prev.running && m && !m.running) setReloadTick((x) => x + 1);
          return m;
        });
      } catch {
      }
    }, 3e3);
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const openReport = useCallback2(async (auditId) => {
    if (!auditId) return;
    try {
      const rep = await loadReport(auditId);
      if (rep) setReport(rep);
      setTab("report");
    } catch {
    }
  }, []);
  const heartbeatOk = meta && !meta.degraded && Date.now() - new Date(meta.ts).getTime() < 13e4;
  const heartbeatStale = meta && !meta.degraded && !heartbeatOk;
  const running = meta && meta.running;
  return /* @__PURE__ */ jsxs4("div", { className: "sa-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "sa-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "sa-logo", children: "\u{1F310}" }),
      /* @__PURE__ */ jsxs4("div", { className: "sa-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u7AD9\u70B9\u4F53\u68C0\u53F0" }),
        /* @__PURE__ */ jsxs4("small", { children: [
          /* @__PURE__ */ jsx4("span", { className: `sa-dot ${heartbeatOk ? "ok" : heartbeatStale ? "stale" : "down"}` }),
          meta ? meta.degraded ? `\u670D\u52A1\u964D\u7EA7\uFF1A${meta.lastBridgeErr || "\u6865\u4E0D\u53EF\u8FBE"}` : `\u670D\u52A1 ${meta.version} \xB7 127.0.0.1:${meta.port}` : "\u670D\u52A1\u672A\u8FDE\u63A5\uFF08\u7B49\u5F85\u5FC3\u8DF3\uFF1B\u9996\u6B21\u4F7F\u7528\u5148\u786E\u8BA4\u63D2\u4EF6\u5DF2\u542F\u7528\uFF09"
        ] })
      ] }),
      running && /* @__PURE__ */ jsxs4("span", { className: "sa-run", title: running.seed, children: [
        "\u23F3 ",
        running.phase,
        " ",
        running.seed.slice(0, 32)
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "sa-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx4("button", { className: `sa-tab ${tab === t.id ? "on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "sa-body", children: [
      tab === "work" && /* @__PURE__ */ jsx4(
        WorkTab,
        {
          meta,
          settings,
          lastReport: report,
          onRefresh: refreshAll,
          onOpenReport: openReport,
          onSendToChat: props.onSendToChat
        }
      ),
      tab === "report" && /* @__PURE__ */ jsxs4(Fragment4, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "sa-sec", children: [
          /* @__PURE__ */ jsx4("span", { className: "sa-bar" }),
          "\u4F53\u68C0\u62A5\u544A",
          /* @__PURE__ */ jsx4("span", { className: "sa-hint", children: report ? `auditId=${report.auditId}` : "\u5C1A\u65E0\u62A5\u544A" })
        ] }),
        /* @__PURE__ */ jsx4(ReportView, { report, onSendToChat: props.onSendToChat })
      ] }),
      tab === "history" && /* @__PURE__ */ jsx4(HistoryTab, { meta, history, onRefresh: refreshAll, onView: openReport })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function SiteAuditEntry(props) {
  return /* @__PURE__ */ jsx5(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  SiteAuditEntry as default
};
