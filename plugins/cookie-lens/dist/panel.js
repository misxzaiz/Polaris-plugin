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

// shared/cookie-core.js
var require_cookie_core = __commonJS({
  "shared/cookie-core.js"(exports, module) {
    "use strict";
    var TOKEN_BAD = /[\x00-\x20\x7f()<>@,;:"/\\[\]?={}]|\x09/;
    var VALUE_BAD = /[\x00-\x20\x7f"\\]|\x09/;
    var IP_RE = /^\d{1,3}(\.\d{1,3}){3}$|^\[[0-9a-fA-F:]+\]$/;
    function isIp(host) {
      return IP_RE.test(host);
    }
    function clampStr(s, n) {
      return s.length > n ? s.slice(0, n) + "\u2026" : s;
    }
    function domainMatch(host, domain) {
      const h = String(host || "").toLowerCase();
      const d = String(domain || "").toLowerCase().replace(/^\./, "");
      if (!h || !d) return false;
      if (h === d) return true;
      if (isIp(h)) return false;
      return h.endsWith("." + d);
    }
    function pathMatch(requestPath, cookiePath) {
      const rp = requestPath || "/";
      const cp = cookiePath || "/";
      if (rp === cp) return true;
      if (rp.startsWith(cp)) {
        if (cp.endsWith("/")) return true;
        if (rp.charAt(cp.length) === "/") return true;
      }
      return false;
    }
    function defaultPath(requestPath) {
      const p = String(requestPath || "/");
      const clean = p.split("?")[0].split("#")[0];
      if (!clean.startsWith("/") || clean === "/") return "/";
      const idx = clean.lastIndexOf("/");
      return idx <= 0 ? "/" : clean.slice(0, idx);
    }
    function parseRequestUrl(raw) {
      if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "\u7F3A\u5C11 requestUrl\uFF08Set-Cookie \u7684\u63A5\u6536\u6765\u6E90\uFF0C\u5224\u5B9A Domain/Path/Secure \u8BED\u4E49\u5FC5\u9700\uFF09" };
      let u;
      try {
        u = new URL(raw.trim());
      } catch (_) {
        return { ok: false, error: `requestUrl \u4E0D\u662F\u5408\u6CD5 URL\uFF1A${clampStr(raw, 80)}` };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: `requestUrl \u534F\u8BAE\u987B\u4E3A http/https\uFF0C\u6536\u5230 ${u.protocol}` };
      }
      return { ok: true, url: u, host: u.hostname.toLowerCase(), secure: u.protocol === "https:", path: u.pathname || "/" };
    }
    function parseSetCookie2(raw, requestUrl, nowMs) {
      if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "\u7F3A\u5C11 setCookie \u503C" };
      const src = raw.trim().replace(/^set-cookie\s*:\s*/i, "");
      const ctx = parseRequestUrl(requestUrl);
      if (!ctx.ok) return { ok: false, error: ctx.error };
      const firstEq = src.indexOf("=");
      if (firstEq <= 0) return { ok: false, error: firstEq === 0 ? "cookie \u540D\u4E3A\u7A7A\uFF08= \u5F00\u5934\uFF09" : "\u6574\u4E32\u6CA1\u6709 = \u53F7\uFF0C\u4E0D\u662F\u5408\u6CD5 Set-Cookie \u7ED3\u6784" };
      const name = src.slice(0, firstEq).trim();
      const rest = src.slice(firstEq + 1);
      const semi = rest.indexOf(";");
      const value = semi === -1 ? rest.trim() : rest.slice(0, semi).trim();
      const cookie = { name, value, expires: null, maxAge: null, domain: null, path: null, secure: false, httpOnly: false, sameSite: null, partitioned: false };
      const findings = [];
      const add = (level, code, message) => findings.push({ level, code, message });
      if (!name) return { ok: false, error: "cookie \u540D\u4E3A\u7A7A" };
      let rejected = false;
      if (TOKEN_BAD.test(name)) {
        add("error", "NAME_INVALID", `\u540D\u79F0\u542B token \u975E\u6CD5\u5B57\u7B26\uFF08${[...name].filter((c) => TOKEN_BAD.test(c)).map((c) => JSON.stringify(c)).join(" ")}\uFF09\u2014\u2014\u6D4F\u89C8\u5668\u4E0E\u591A\u6570\u89E3\u6790\u5668\u62D2\u7EDD`);
        rejected = true;
      }
      if (VALUE_BAD.test(value)) add("warn", "VALUE_CHARS", "\u503C\u542B RFC 6265 \u975E\u89C4\u8303\u5B57\u7B26\uFF08\u63A7\u5236\u5B57\u7B26/\u7A7A\u683C/\u53CD\u659C\u6760/\u53CC\u5F15\u53F7\uFF09");
      if (value.includes(",")) add("warn", "VALUE_COMMA", "\u503C\u542B\u9017\u53F7\uFF1ARFC 6265 \u5408\u6CD5\uFF0C\u4F46\u4F1A\u88AB\u4E0D\u5C11\u540E\u7AEF/\u7F51\u5173\u6309\u591A cookie \u5207\u788E\u2014\u2014\u5386\u53F2\u9057\u7559\u7684\u9AD8\u9891\u5751");
      if (value === "") add("info", "VALUE_EMPTY", "\u503C\u4E3A\u7A7A\u4E32\uFF1A\u5E38\u7528\u4E8E\u300C\u5220\u9664 cookie\u300D\uFF08\u914D\u5408\u8FC7\u671F\u65F6\u95F4\uFF09");
      const seen = {};
      const parts = semi === -1 ? [] : rest.slice(semi + 1).split(";");
      for (const partRaw of parts) {
        const part = partRaw.trim();
        if (!part) continue;
        const eq = part.indexOf("=");
        const aname = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
        const aval = eq === -1 ? "" : part.slice(eq + 1).trim();
        if (seen[aname] !== void 0) {
          add("info", "ATTR_DUP", `\u5C5E\u6027 ${aname} \u91CD\u590D\u51FA\u73B0\uFF0C\u6309\u89C4\u8303\u53D6\u9996\u4E2A`);
          continue;
        }
        seen[aname] = true;
        if (aname === "expires") {
          const t = Date.parse(aval);
          if (Number.isNaN(t)) add("warn", "EXPIRES_INVALID", `Expires \u65E0\u6CD5\u89E3\u6790\u4E3A\u65E5\u671F\uFF08${clampStr(aval, 40)}\uFF09\u2014\u2014\u6309 \xA75.2.1 \u6574\u5C5E\u6027\u5FFD\u7565\uFF0C\u9000\u5316\u4E3A\u4F1A\u8BDD cookie`);
          else {
            cookie.expires = { raw: aval, time: t };
            if (t < (nowMs || Date.now())) add("info", "EXPIRED", "Expires \u5DF2\u8FC7\u671F\uFF1A\u6D4F\u89C8\u5668\u4F1A\u7ACB\u523B\u5220\u9664\uFF08\u6216\u62D2\u6536\uFF09\u8BE5 cookie\u2014\u2014\u300C\u5220\u9664 cookie\u300D\u7684\u6807\u51C6\u624B\u6CD5");
          }
        } else if (aname === "max-age") {
          if (!/^-?\d+$/.test(aval)) add("warn", "MAX_AGE_INVALID", `Max-Age \u975E\u6574\u6570\uFF08${clampStr(aval, 30)}\uFF09\u2014\u2014\u6309 \xA75.2.2 \u6574\u5C5E\u6027\u5FFD\u7565\uFF0C\u9000\u5316\u4E3A\u4F1A\u8BDD cookie`);
          else {
            cookie.maxAge = parseInt(aval, 10);
            if (cookie.maxAge <= 0) add("info", "MAX_AGE_EXPIRE", "Max-Age \u2264 0\uFF1A\u7B49\u4EF7\u4E8E\u7ACB\u523B\u5220\u9664");
          }
        } else if (aname === "domain") {
          const d = aval.toLowerCase().replace(/^\./, "");
          if (!d) add("warn", "DOMAIN_EMPTY", "Domain \u503C\u4E3A\u7A7A\u2014\u2014\u6574\u5C5E\u6027\u5FFD\u7565\uFF08\xA75.2.3\uFF09");
          else cookie.domain = d;
        } else if (aname === "path") {
          if (!aval.startsWith("/")) add("warn", "PATH_NOT_ROOTED", `Path \u4E0D\u4EE5 / \u5F00\u5934\uFF08${clampStr(aval, 30)}\uFF09\u2014\u2014\u6309 \xA75.2.4 \u6574\u5C5E\u6027\u5FFD\u7565\uFF0C\u7528\u9ED8\u8BA4\u8DEF\u5F84`);
          else cookie.path = aval;
        } else if (aname === "secure") cookie.secure = true;
        else if (aname === "httponly") cookie.httpOnly = true;
        else if (aname === "partitioned") cookie.partitioned = true;
        else if (aname === "samesite") {
          const v = aval.toLowerCase();
          if (v === "strict" || v === "lax" || v === "none") cookie.sameSite = v.charAt(0).toUpperCase() + v.slice(1);
          else add("warn", "SAMESITE_UNKNOWN", `SameSite \u503C\u975E\u6CD5\uFF08${clampStr(aval, 30)}\uFF09\u2014\u2014\u6309\u6D4F\u89C8\u5668\u9ED8\u8BA4 Lax \u5904\u7406\uFF1B\u5199\u9519\u503C\u662F\u300Ccookie \u5728\u8DE8\u7AD9\u8BF7\u6C42\u91CC\u4E0D\u5E26\u4E0A\u300D\u7684\u5E38\u89C1\u6839\u56E0`);
        } else add("info", "ATTR_UNKNOWN", `\u672A\u8BC6\u522B\u5C5E\u6027 ${clampStr(aname, 20)}\u2014\u2014\u6309\u89C4\u8303\u5FFD\u7565\uFF08\u517C\u5BB9\u5C42\u53CB\u597D\uFF09`);
      }
      const effDomain = cookie.domain || ctx.host;
      const effPath = cookie.path || defaultPath(ctx.path);
      if (cookie.domain && !domainMatch(ctx.host, cookie.domain)) {
        add("error", "DOMAIN_MISMATCH", `Domain=${cookie.domain} \u4E0D\u662F ${ctx.host} \u53CA\u5176\u7236\u57DF\u2014\u2014\u6D4F\u89C8\u5668\u6574\u6761\u62D2\u6536\uFF08\xA75.3 step 6\uFF09`);
        rejected = true;
      }
      if (cookie.sameSite === "None" && !cookie.secure) {
        add("error", "SAMESITE_NONE_NO_SECURE", "SameSite=None \u672A\u914D Secure\u2014\u2014Chrome M80 \u8D77\u6574\u6761\u62D2\u6536\u5E76\u544A\u8B66\uFF1B\u8FD9\u662F\u300Csession cookie \u7A81\u7136\u5168\u4E22\u300D\u7684\u5934\u53F7\u6839\u56E0");
        rejected = true;
      }
      if (name.startsWith("__Host-")) {
        if (!cookie.secure) {
          add("error", "HOST_PREFIX_NO_SECURE", "__Host- \u524D\u7F00\u5FC5\u987B\u5E26 Secure\u2014\u2014\u6D4F\u89C8\u5668\u62D2\u6536");
          rejected = true;
        }
        if (cookie.domain) {
          add("error", "HOST_PREFIX_HAS_DOMAIN", "__Host- \u524D\u7F00\u7981\u6B62 Domain \u5C5E\u6027\uFF08\u9501\u5B9A\u7CBE\u786E\u4E3B\u673A\uFF09\u2014\u2014\u6D4F\u89C8\u5668\u62D2\u6536");
          rejected = true;
        }
        if (cookie.path !== "/") {
          add("error", "HOST_PREFIX_PATH", `__Host- \u524D\u7F00\u5FC5\u987B Path=/\uFF08\u6536\u5230 ${cookie.path || "\u7F3A\u7701\u2192" + effPath}\uFF09\u2014\u2014\u6D4F\u89C8\u5668\u62D2\u6536`);
          rejected = true;
        }
      }
      if (name.startsWith("__Secure-") && !cookie.secure) {
        add("error", "SECURE_PREFIX_NO_SECURE", "__Secure- \u524D\u7F00\u5FC5\u987B\u5E26 Secure\u2014\u2014\u6D4F\u89C8\u5668\u62D2\u6536");
        rejected = true;
      }
      if (cookie.secure && !ctx.secure && !isLocalhost(ctx.host)) {
        add("warn", "SECURE_ON_HTTP", "\u54CD\u5E94\u7ECF http\uFF08\u975E localhost\uFF09\u8BBE\u7F6E Secure cookie\u2014\u2014\u73B0\u4EE3\u6D4F\u89C8\u5668\u6309 trustworthy \u5224\u5B9A\uFF0C\u751F\u4EA7 http \u9875\u9762\u4E0B\u4F1A\u88AB\u62D2\u6536");
      }
      if (cookie.secure && !ctx.secure && isLocalhost(ctx.host)) {
        add("info", "SECURE_ON_LOCALHOST", "http://localhost \u88AB\u89C6\u4E3A\u5B89\u5168\u6765\u6E90\uFF0C\u53EF\u8BBE\u7F6E Secure cookie\uFF08trustworthy origin \u8C41\u514D\uFF09");
      }
      if (cookie.maxAge !== null && cookie.expires) add("info", "MAX_AGE_WINS", "Max-Age \u4E0E Expires \u540C\u5B58\uFF1A\u6309 \xA75.3 \u4EE5 Max-Age \u4E3A\u51C6\uFF0CExpires \u88AB\u5FFD\u7565");
      if (cookie.maxAge === null && !cookie.expires) add("info", "SESSION_COOKIE", "\u65E0 Expires/Max-Age\uFF1A\u4F1A\u8BDD cookie\uFF0C\u6D4F\u89C8\u5668\u5173\u95ED\u5373\u5931\u6548");
      if (isIp(ctx.host) && cookie.domain) add("warn", "DOMAIN_ON_IP", "IP \u4E3B\u673A\u4E0D\u505A domain-match\uFF0CDomain \u5C5E\u6027\u901A\u5E38\u65E0\u6548");
      if (!cookie.sameSite) add("info", "SAMESITE_DEFAULT", "\u672A\u6307\u5B9A SameSite\uFF1A\u73B0\u4EE3\u6D4F\u89C8\u5668\u9ED8\u8BA4 Lax\uFF08\u8DE8\u7AD9 POST/\u5B50\u8BF7\u6C42\u4E0D\u5E26\uFF09\u2014\u2014\u5982\u679C\u8FD9\u662F\u767B\u5F55\u6001 cookie\uFF0C\u8DE8\u7AD9\u573A\u666F\u4F1A\u300C\u770B\u8D77\u6765\u6CA1\u767B\u5F55\u300D");
      const scope = { domain: effDomain, path: effPath, secure: cookie.secure, hostOnly: !cookie.domain };
      return { ok: true, cookie, scope, findings, verdict: rejected ? "rejected" : "accepted" };
    }
    function isLocalhost(host) {
      return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    }
    function cookieMatchesUrl2(cookie, url) {
      const ctx = parseRequestUrl(url);
      if (!ctx.ok) return { ok: false, error: ctx.error };
      const scope = cookie.scope || cookie;
      const reasons = [];
      if (!domainMatch(ctx.host, scope.domain) || scope.hostOnly && ctx.host !== scope.domain) reasons.push(`\u57DF\u4E0D\u5339\u914D\uFF08${ctx.host} vs ${scope.domain}${scope.hostOnly ? "\uFF0ChostOnly" : ""}\uFF09`);
      if (!pathMatch(ctx.path, scope.path)) reasons.push(`\u8DEF\u5F84\u4E0D\u5339\u914D\uFF08${ctx.path} \u4E0D\u5728 ${scope.path} \u4E0B\uFF09`);
      if (scope.secure && !ctx.secure && !isLocalhost(ctx.host)) reasons.push("Secure cookie \u4E0D\u7ECF\u660E\u6587 http \u53D1\u9001\uFF08localhost \u8C41\u514D\uFF09");
      return { ok: true, matches: reasons.length === 0, reasons, ctx: { host: ctx.host, path: ctx.path, secure: ctx.secure } };
    }
    function parseRequestCookie(raw) {
      if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "\u7F3A\u5C11 Cookie \u5934\u5185\u5BB9" };
      const src = raw.trim().replace(/^cookie\s*:\s*/i, "");
      const items = [];
      const findings = [];
      const add = (level, code, message) => findings.push({ level, code, message });
      const chunks = src.split(";");
      for (let i = 0; i < chunks.length; i++) {
        const part = chunks[i].trim();
        if (!part) {
          add("warn", "EMPTY_SEGMENT", `\u7B2C ${i + 1} \u6BB5\u4E3A\u7A7A\uFF08\u8FDE\u7EED\u5206\u53F7\u6216\u5C3E\u5206\u53F7\uFF09`);
          continue;
        }
        for (const piece of part.includes(", ") ? part.split(/,\s*(?=[^=]+(?:=|$))/) : [part]) {
          const eq = piece.indexOf("=");
          if (eq === -1) {
            add("warn", "NO_EQUALS", `\u65E0 = \u53F7\u7684\u88F8\u7247\u6BB5\u300C${clampStr(piece, 30)}\u300D\u2014\u2014RFC 6265 \u8BF7\u6C42\u4FA7\u53EA\u63A5\u53D7 name=value\uFF0C\u670D\u52A1\u7AEF\u591A\u6309\u4E22\u5F03\u5904\u7406`);
            continue;
          }
          const name = piece.slice(0, eq).trim();
          items.push({ name, value: piece.slice(eq + 1).trim() });
          if (!name) add("warn", "EMPTY_NAME", "\u5B58\u5728\u7A7A\u540D\u952E\u503C\u5BF9");
        }
      }
      const dup = {};
      for (const it of items) dup[it.name] = (dup[it.name] || 0) + 1;
      for (const n of Object.keys(dup)) if (dup[n] > 1) add("warn", "DUP_NAME", `\u91CD\u590D\u952E ${n}\xD7${dup[n]}\u2014\u2014\u670D\u52A1\u7AEF\u6846\u67B6\u53D6\u503C\u53E3\u5F84\u4E0D\u4E00\uFF08PHP \u53D6\u6700\u540E\u3001Express \u539F\u6837\u66B4\u9732\uFF09\uFF0C\u5224\u91CD/\u9274\u6743\u903B\u8F91\u6613\u88AB\u7ED5\u8FC7`);
      return { ok: true, items, findings };
    }
    function generateSetCookie(spec) {
      if (!spec || typeof spec !== "object") return { ok: false, error: "\u7F3A\u5C11 spec \u5BF9\u8C61" };
      const name = String(spec.name || "");
      if (!name) return { ok: false, error: "\u7F3A\u5C11 name" };
      if (TOKEN_BAD.test(name)) return { ok: false, error: `name \u542B\u975E\u6CD5 token \u5B57\u7B26\uFF1A${name}` };
      const value = String(spec.value ?? "");
      if (VALUE_BAD.test(value)) return { ok: false, error: "value \u542B\u63A7\u5236\u5B57\u7B26/\u7A7A\u683C/\u53CD\u659C\u6760/\u53CC\u5F15\u53F7\uFF08RFC 6265 \u975E\u6CD5\uFF09\u2014\u2014\u5148\u7F16\u7801\u518D\u653E\u503C" };
      const parts = [`${name}=${value}`];
      const sameSite = spec.sameSite ? String(spec.sameSite) : null;
      if (spec.domain) {
        const d = String(spec.domain).toLowerCase();
        if (!d) return { ok: false, error: "domain \u4E3A\u7A7A\u4E32" };
        parts.push(`Domain=${d}`);
      }
      parts.push(`Path=${spec.path ? String(spec.path) : "/"}`);
      if (spec.maxAge !== void 0 && spec.maxAge !== null) {
        if (!Number.isInteger(spec.maxAge)) return { ok: false, error: `maxAge \u987B\u4E3A\u6574\u6570\u79D2\uFF0C\u6536\u5230 ${spec.maxAge}` };
        parts.push(`Max-Age=${spec.maxAge}`);
      }
      if (typeof spec.expires === "string" && spec.expires) {
        const t = Date.parse(spec.expires);
        if (Number.isNaN(t)) return { ok: false, error: `expires \u65E0\u6CD5\u89E3\u6790\u4E3A\u65E5\u671F\uFF1A${spec.expires}` };
        parts.push(`Expires=${new Date(t).toUTCString()}`);
      }
      const secure = spec.secure === void 0 ? sameSite === "None" : !!spec.secure;
      if (secure) parts.push("Secure");
      if (spec.httpOnly) parts.push("HttpOnly");
      if (sameSite) {
        if (!["Strict", "Lax", "None"].includes(sameSite)) return { ok: false, error: `sameSite \u53EA\u63A5\u53D7 Strict/Lax/None\uFF0C\u6536\u5230 ${sameSite}` };
        parts.push(`SameSite=${sameSite}`);
      }
      if (spec.partitioned) parts.push("Partitioned");
      const header = parts.join("; ");
      const self = parseSetCookie2(header, spec.requestUrl || `https://${spec.domain || "example.com"}/`);
      if (!self.ok) return { ok: false, error: `round-trip \u81EA\u68C0\u5931\u8D25\uFF08\u89E3\u6790\u5668\u62D2\u6536\u751F\u6210\u4EA7\u7269\uFF09\uFF1A${self.error}` };
      const drift = [];
      if (self.cookie.name !== name || self.cookie.value !== value) drift.push("name/value \u6F02\u79FB");
      if ((self.cookie.domain || null) !== (spec.domain ? String(spec.domain).toLowerCase().replace(/^\./, "") : null)) drift.push("domain \u6F02\u79FB");
      if ((self.cookie.path || "/") !== (spec.path ? String(spec.path) : "/")) drift.push("path \u6F02\u79FB");
      if (drift.length) return { ok: false, error: `round-trip \u81EA\u68C0\u5931\u8D25\uFF1A${drift.join("\uFF1B")}` };
      return { ok: true, header, verdict: self.verdict, findings: self.findings, scope: self.scope };
    }
    var LEVEL_TAG = { error: "[\u62D2\u6536]", warn: "[\u8B66\u544A]", info: "[\u8BF4\u660E]" };
    function renderSetCookieReport(r) {
      if (!r.ok) return `\u89E3\u6790\u5931\u8D25\uFF1A${r.error}`;
      const c = r.cookie;
      const lines = [];
      lines.push(`\u5224\u5B9A\uFF1A${r.verdict === "rejected" ? "\u6D4F\u89C8\u5668\u5C06\u3010\u62D2\u6536\u3011\u8FD9\u6761 cookie" : "cookie \u4F1A\u88AB\u6D4F\u89C8\u5668\u63A5\u53D7"}`);
      lines.push(`  name = ${c.name}`);
      lines.push(`  value = ${c.value === "" ? "(\u7A7A)" : clampStr(c.value, 120)}`);
      const attrs = [];
      if (c.domain) attrs.push(`Domain=${c.domain}`);
      if (c.path) attrs.push(`Path=${c.path}`);
      if (c.maxAge !== null) attrs.push(`Max-Age=${c.maxAge}`);
      if (c.expires) attrs.push(`Expires=${c.expires.raw}`);
      if (c.secure) attrs.push("Secure");
      if (c.httpOnly) attrs.push("HttpOnly");
      if (c.sameSite) attrs.push(`SameSite=${c.sameSite}`);
      if (c.partitioned) attrs.push("Partitioned");
      lines.push(`  \u5C5E\u6027 = ${attrs.length ? attrs.join(" ") : "(\u65E0)"}`);
      lines.push(`  \u751F\u6548\u8303\u56F4 = domain:${r.scope.domain}${r.scope.hostOnly ? "(hostOnly)" : ""} path:${r.scope.path} secure:${r.scope.secure}`);
      if (r.findings.length) {
        lines.push("\u8BCA\u65AD\uFF1A");
        for (const f of r.findings) lines.push(`  ${LEVEL_TAG[f.level]} ${f.code} ${f.message}`);
      } else lines.push("\u8BCA\u65AD\uFF1A\u65E0\u5F02\u5E38");
      return lines.join("\n");
    }
    module.exports = {
      domainMatch,
      pathMatch,
      defaultPath,
      isLocalhost,
      parseSetCookie: parseSetCookie2,
      parseRequestUrl,
      cookieMatchesUrl: cookieMatchesUrl2,
      parseRequestCookie,
      generateSetCookie,
      renderSetCookieReport
    };
  }
});

// shared/cors-core.js
var require_cors_core = __commonJS({
  "shared/cors-core.js"(exports, module) {
    "use strict";
    var SAFELIST_METHODS = ["GET", "HEAD", "POST"];
    var SAFELIST_HEADERS = ["accept", "accept-language", "content-language"];
    var SAFELIST_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
    var PREFLIGHT_EXPOSED = ["access-control-allow-origin", "access-control-allow-credentials", "access-control-expose-headers", "access-control-max-age", "access-control-allow-methods", "access-control-allow-headers"];
    function normName(n) {
      return String(n || "").trim().toLowerCase();
    }
    function toHeaderList(input) {
      if (!input) return [];
      if (Array.isArray(input)) {
        return input.filter((h) => h && String(h.name || "").trim() !== "").map((h) => ({ name: normName(h.name), raw: String(h.name).trim(), value: String(h.value ?? "") }));
      }
      return Object.entries(input).map(([k, v]) => ({ name: normName(k), raw: String(k).trim(), value: Array.isArray(v) ? String(v.join(", ")) : String(v ?? "") }));
    }
    function getAll(list, name) {
      return list.filter((h) => h.name === normName(name)).map((h) => h.value);
    }
    function getFirst(list, name) {
      const all = getAll(list, name);
      return all.length ? all.join(", ") : null;
    }
    function isSafelistedMethod(m) {
      return SAFELIST_METHODS.includes(String(m || "").trim().toUpperCase());
    }
    function isSafelistedHeader(name, value) {
      const n = normName(name);
      if (SAFELIST_HEADERS.includes(n)) return true;
      if (n === "content-type") {
        const mime = String(value || "").split(";")[0].trim().toLowerCase();
        return SAFELIST_CONTENT_TYPES.includes(mime);
      }
      return false;
    }
    function isExposedResponseHeader(name, exposeList) {
      const n = normName(name);
      if (PREFLIGHT_EXPOSED.includes(n) || ["cache-control", "content-language", "content-length", "content-type", "expires", "last-modified", "pragma"].includes(n)) return true;
      return (exposeList || []).some((e) => normName(e) === n);
    }
    function needsPreflight(method, requestHeaders) {
      if (!isSafelistedMethod(method)) return { needed: true, reason: `\u65B9\u6CD5 ${method} \u4E0D\u5728\u5B89\u5168\u540D\u5355\uFF08GET/HEAD/POST\uFF09` };
      for (const h of requestHeaders) {
        if (!isSafelistedHeader(h.name, h.value)) return { needed: true, reason: `\u8BF7\u6C42\u5934 ${h.name} \u4E0D\u5728\u5B89\u5168\u540D\u5355${normName(h.name) === "content-type" ? "\uFF08Content-Type \u503C\u9650\u4E09\u65CF\uFF1Aurlencoded/multipart/text-plain\uFF09" : ""}` };
      }
      return { needed: false };
    }
    function judgeCors2(input) {
      if (!input || typeof input !== "object") return { ok: false, error: "\u7F3A\u5C11\u8F93\u5165\u5BF9\u8C61" };
      const origin = String(input.origin ?? "").trim();
      const method = String(input.method || "GET").trim() || "GET";
      const reqHeaders = toHeaderList(input.requestHeaders);
      const resHeaders = toHeaderList(input.responseHeaders);
      const withCreds = !!input.withCredentials;
      if (!origin) return { ok: false, error: "\u7F3A\u5C11 origin\uFF08\u53D1\u8D77\u8BF7\u6C42\u9875\u9762\u7684\u6765\u6E90\uFF0C\u5982 https://app.example.com\uFF09" };
      if (!/^https?:\/\/[^\s]+$/i.test(origin)) return { ok: false, error: `origin \u5F62\u5982 https://site.example\uFF0C\u6536\u5230\u300C${origin}\u300D` };
      const pf = input.preflight === true ? { needed: true, reason: "\u663E\u5F0F\u6307\u5B9A\u6309\u9884\u68C0\u5224\u5B9A" } : needsPreflight(method, reqHeaders);
      const kind = pf.needed ? "preflight" : "simple";
      const checks = [];
      const failReasons = [];
      const hints = [];
      const add = (item, status, detail) => checks.push({ item, status, detail });
      const acaoAll = getAll(resHeaders, "access-control-allow-origin");
      if (acaoAll.length === 0) {
        add("Access-Control-Allow-Origin", "fail", '\u54CD\u5E94\u5B8C\u5168\u6CA1\u6709 ACAO\u2014\u2014\u6D4F\u89C8\u5668\u62E6\u622A\u54CD\u5E94\uFF0C\u63A7\u5236\u53F0\u62A5 "No Access-Control-Allow-Origin header"');
        failReasons.push("\u65E0 ACAO \u5934");
        hints.push("\u670D\u52A1\u7AEF\u7ED9\u8BE5\u63A5\u53E3\u52A0 Access-Control-Allow-Origin \u54CD\u5E94\u5934");
      } else if (acaoAll.length > 1) {
        add("Access-Control-Allow-Origin", "fail", `ACAO \u51FA\u73B0 ${acaoAll.length} \u6B21\uFF08${acaoAll.map((v) => JSON.stringify(v)).join(" ")}\uFF09\u2014\u2014CORS \u68C0\u67E5\u6309\u5931\u8D25\u5904\u7406\uFF0C**\u4E0D\u4F1A**\u5408\u5E76\uFF1B\u901A\u5E38\u662F\u7F51\u5173/\u4E2D\u95F4\u4EF6+\u5E94\u7528\u5404\u5199\u4E86\u4E00\u5C42`);
        failReasons.push("ACAO \u91CD\u590D");
        hints.push("\u6392\u67E5\u91CD\u590D\u5199 ACAO \u7684\u5C42\uFF08Nginx add_header + \u5E94\u7528\u5404\u4E00\u4EFD\u662F\u7ECF\u5178\u73B0\u573A\uFF09\uFF0C\u53EA\u4FDD\u7559\u4E00\u5904");
      } else {
        const acao = acaoAll[0].trim();
        if (acao === "*") {
          if (withCreds) {
            add("Access-Control-Allow-Origin", "fail", "ACAO=* \u4E0E withCredentials \u7EC4\u5408\uFF1AFetch \u6807\u51C6\u89C4\u5B9A credentials \u6A21\u5F0F\u4E0B\u901A\u914D\u7B26\u65E0\u6548\uFF0C\u5FC5\u987B\u7CBE\u786E\u56DE\u663E origin");
            failReasons.push("credentials + \u901A\u914D\u7B26");
            hints.push("\u6539\u4E3A\u52A8\u6001\u56DE\u663E Access-Control-Allow-Origin: <\u8BF7\u6C42 Origin>\uFF0C\u5E76\u914D Vary: Origin \u9632\u7F13\u5B58\u4E32\u5473");
          } else {
            add("Access-Control-Allow-Origin", "pass", "ACAO=*\uFF08\u65E0\u51ED\u8BC1\u573A\u666F\uFF0C\u901A\u914D\u6709\u6548\uFF09");
          }
        } else if (acao.toLowerCase() === origin.toLowerCase()) {
          add("Access-Control-Allow-Origin", "pass", `ACAO \u7CBE\u786E\u5339\u914D origin\uFF08${origin}\uFF09`);
          if (acao !== origin) add("Access-Control-Allow-Origin", "info", "\u4EC5\u5927\u5C0F\u5199\u5DEE\u5F02\u547D\u4E2D\u2014\u2014scheme/host \u672C\u5C31\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF0C\u6210\u7ACB");
        } else if (acao.toLowerCase() === "null") {
          add("Access-Control-Allow-Origin", "fail", `ACAO=null \u4E0D\u5339\u914D origin ${origin}`);
          failReasons.push("ACAO=null");
          hints.push('echo "null" \u7B49\u4E8E\u5BF9 sandboxed iframe / file:// \u5168\u5F00\u95E8\uFF0C\u5C5E\u4E8E\u9AD8\u5371\u914D\u7F6E\u2014\u2014\u5E94\u7CBE\u786E\u56DE\u663E\u771F\u5B9E origin');
        } else {
          add("Access-Control-Allow-Origin", "fail", `ACAO=${acao} \u4E0E origin ${origin} \u4E0D\u5339\u914D\uFF08\u5B50\u57DF\u4E5F\u4E0D\u884C\u2014\u2014http://a.example.com \u4E0D\u8986\u76D6 http://b.example.com\uFF0C\u66F4\u4E0D\u8986\u76D6 http://example.com \u53CD\u5411\uFF09`);
          failReasons.push("origin \u4E0D\u5339\u914D");
          hints.push("CORS \u662F\u7CBE\u786E\u4E32\u5339\u914D\uFF0C\u4E0D\u662F\u300C\u57DF\u540E\u7F00\u5339\u914D\u300D\uFF1B\u628A\u8BE5 origin \u52A0\u8FDB\u767D\u540D\u5355\u6216\u52A8\u6001\u56DE\u663E + Vary: Origin");
        }
      }
      if (withCreds) {
        const acac = getFirst(resHeaders, "access-control-allow-credentials");
        if (acac === null) {
          add("Access-Control-Allow-Credentials", "fail", "\u5E26 cookie/\u51ED\u8BC1\u7684\u8BF7\u6C42\u8981\u6C42 ACAC: true\u2014\u2014\u7F3A\u5931\u5219\u6D4F\u89C8\u5668\u62E6\u622A");
          failReasons.push("\u65E0 ACAC");
          hints.push("\u670D\u52A1\u7AEF\u52A0 Access-Control-Allow-Credentials: true");
        } else if (acac.trim().toLowerCase() !== "true") {
          add("Access-Control-Allow-Credentials", "fail", `ACAC \u503C\u987B\u4E3A\u5B57\u9762\u91CF "true"\uFF0C\u6536\u5230\u300C${acac.trim()}\u300D`);
          failReasons.push("ACAC \u975E true");
        } else add("Access-Control-Allow-Credentials", "pass", "ACAC: true");
      }
      if (kind === "preflight") {
        add("\u89E6\u53D1\u9884\u68C0", "info", `\u9884\u68C0\u539F\u56E0\uFF1A${pf.reason}\u2014\u2014\u6D4F\u89C8\u5668\u5148\u53D1 OPTIONS ${"{url}"}\uFF08\u5E26 Access-Control-Request-Method/Header\uFF09\uFF0C\u672C\u5224\u5B9A\u5373\u9884\u68C0\u54CD\u5E94\u987B\u6EE1\u8DB3\u7684\u6761\u4EF6`);
        const acam = getFirst(resHeaders, "access-control-allow-methods");
        const mUp = method.toUpperCase();
        const wildcardOk = !withCreds;
        if (acam === null) {
          if (input.preflight !== true && isSafelistedMethod(method) && reqHeaders.every((h) => isSafelistedHeader(h.name, h.value))) {
            add("Access-Control-Allow-Methods", "info", "\u672A\u8FD4\u56DE ACAM\uFF1B\u65B9\u6CD5/\u5934\u7686 safelisted\uFF0C\u82E5\u4E0D\u662F\u663E\u5F0F\u8981\u6C42\u9884\u68C0\uFF0C\u5B9E\u9645\u53EF\u4EE5\u4E0D\u9884\u68C0");
          } else {
            add("Access-Control-Allow-Methods", "fail", "\u9884\u68C0\u54CD\u5E94\u7F3A ACAM\u2014\u2014\u65B9\u6CD5\u65E0\u6CD5\u653E\u884C");
            failReasons.push("\u65E0 ACAM");
            hints.push(`\u52A0 Access-Control-Allow-Methods: ${mUp}`);
          }
        } else {
          const methods = acam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
          if (methods.includes("*") && wildcardOk) add("Access-Control-Allow-Methods", "pass", "ACAM \u542B *\uFF08\u65E0\u51ED\u8BC1\uFF0C\u901A\u914D\u6709\u6548\uFF09");
          else if (methods.includes("*") && withCreds) {
            add("Access-Control-Allow-Methods", "fail", "credentials \u8BF7\u6C42\u4E0B ACAM:* \u4E0D\u518D\u662F\u901A\u914D\u7B26\u2014\u2014\u987B\u663E\u5F0F\u5217\u51FA\u65B9\u6CD5");
            failReasons.push("ACAM \u901A\u914D + credentials");
          } else if (methods.includes(mUp)) add("Access-Control-Allow-Methods", "pass", `ACAM \u542B ${mUp}`);
          else {
            add("Access-Control-Allow-Methods", "fail", `ACAM \u5217\u8868\uFF08${acam.trim()}\uFF09\u4E0D\u542B ${mUp}\u2014\u2014\u5927\u5C0F\u5199\u4E0D\u654F\u611F\u6BD4\u5BF9\u540E\u4ECD\u65E0\u547D\u4E2D`);
            failReasons.push(`\u65B9\u6CD5 ${mUp} \u672A\u653E\u884C`);
          }
        }
        const acah = getFirst(resHeaders, "access-control-allow-headers");
        const nonSafe = reqHeaders.filter((h) => !isSafelistedHeader(h.name, h.value));
        if (nonSafe.length > 0) {
          if (acah === null) {
            add("Access-Control-Allow-Headers", "fail", `\u975E\u5B89\u5168\u5934 ${nonSafe.map((h) => h.name).join(", ")} \u4F46\u9884\u68C0\u54CD\u5E94\u65E0 ACAH\u2014\u2014\u9010\u5934\u6838\u5BF9\u5931\u8D25`);
            failReasons.push("\u65E0 ACAH");
            hints.push(`\u52A0 Access-Control-Allow-Headers: ${nonSafe.map((h) => h.name).join(", ")}`);
          } else {
            const allowed = acah.split(",").map((s) => normName(s)).filter(Boolean);
            const missing = [];
            for (const h of nonSafe) {
              if (allowed.includes(h.name)) continue;
              if (allowed.includes("*") && !withCreds) continue;
              missing.push(h.raw || h.name);
            }
            if (missing.length === 0) add("Access-Control-Allow-Headers", "pass", allowed.includes("*") ? `ACAH \u8986\u76D6\uFF08${withCreds ? "\u663E\u5F0F\u5217\u8868\u542B\u5168\u90E8\u975E\u5B89\u5168\u5934" : "\u542B * \u901A\u914D"}\uFF09` : `ACAH \u542B\u5168\u90E8\u975E\u5B89\u5168\u5934\uFF08${nonSafe.map((h) => h.name).join(", ")}\uFF09`);
            else {
              add("Access-Control-Allow-Headers", "fail", `ACAH\uFF08${acah.trim()}\uFF09\u672A\u653E\u884C\uFF1A${missing.join(", ")}${allowed.includes("*") && withCreds ? "\uFF08credentials \u4E0B * \u4E0D\u662F\u901A\u914D\u7B26\uFF09" : ""}`);
              failReasons.push(`\u5934\u672A\u653E\u884C\uFF1A${missing.join(", ")}`);
            }
          }
          if (nonSafe.some((h) => h.name === "authorization")) {
            add("Authorization \u7279\u4F8B", "warn", "Authorization \u5934\u653E\u884C\u4E86\u9884\u68C0\u8FD8\u4E0D\u591F\u2014\u2014\u4E0D\u5C11\u7F51\u5173/\u6846\u67B6\u4F1A\u6821\u9A8C OPTIONS \u8BF7\u6C42\u4E0A\u7684 Authorization \u800C\u76F4\u63A5 401/403\u3002\u9884\u68C0\u8BF7\u6C42\u6309 Fetch \u6807\u51C6\u4E0D\u643A\u5E26\u51ED\u8BC1\uFF0C\u6B63\u786E\u505A\u6CD5\u662F\u7F51\u5173\u5BF9 OPTIONS \u653E\u884C");
          }
        } else if (acah !== null) {
          add("Access-Control-Allow-Headers", "info", "\u65E0\u975E\u5B89\u5168\u5934\uFF0CACAH \u5197\u4F59\uFF08\u65E0\u5BB3\uFF09");
        }
      }
      const verdict = failReasons.length === 0 ? "pass" : "fail";
      if (verdict === "pass" && withCreds && kind === "preflight") {
        hints.push("\u9884\u68C0\u901A\u8FC7\u53EA\u662F\u7B2C\u4E00\u5173\u2014\u2014\u5B9E\u9645\u8BF7\u6C42\u4ECD\u4F1A\u6309\u4E0A\u9762\u7684 ACAO/ACAC \u89C4\u5219\u518D\u6838\u5BF9\u4E00\u6B21\uFF08\u4E24\u6BB5\u90FD\u8FC7\u624D\u653E\u884C\uFF09");
      }
      return { ok: true, kind, verdict, checks, failReasons, hints, preflightNeeded: pf.needed, preflightReason: pf.needed ? pf.reason : null };
    }
    function generateCorsAdvice(input) {
      if (!input || typeof input !== "object") return { ok: false, error: "\u7F3A\u5C11\u8F93\u5165\u5BF9\u8C61" };
      const origin = String(input.origin || "").trim();
      if (!origin) return { ok: false, error: "\u7F3A\u5C11 origin" };
      const method = String(input.method || "GET").trim() || "GET";
      const reqHeaders = toHeaderList(input.requestHeaders);
      const withCreds = !!input.withCredentials;
      const pf = needsPreflight(method, reqHeaders);
      const lines = [];
      const headers = [];
      headers.push(`Access-Control-Allow-Origin: ${withCreds ? origin : origin + "\uFF08\u6216 * \uFF09"}`);
      if (withCreds) headers.push("Access-Control-Allow-Credentials: true");
      headers.push("Vary: Origin\uFF08\u591A origin \u767D\u540D\u5355/\u52A8\u6001\u56DE\u663E\u65F6\u5FC5\u914D\uFF0C\u9632 CDN \u7F13\u5B58\u4E32\u5473\uFF09");
      if (pf.needed) {
        headers.push(`Access-Control-Allow-Methods: ${method.toUpperCase()}`);
        const nonSafe = reqHeaders.filter((h) => !isSafelistedHeader(h.name, h.value));
        if (nonSafe.length) headers.push(`Access-Control-Allow-Headers: ${nonSafe.map((h) => h.raw || h.name).join(", ")}`);
        headers.push("Access-Control-Max-Age: 600\uFF08\u9884\u68C0\u7ED3\u679C\u7F13\u5B58\u79D2\u6570\uFF0C\u7701 OPTIONS\uFF09");
      }
      lines.push(`\u8BF7\u6C42\u5F62\u6001\uFF1A${pf.needed ? "\u9700\u8981\u9884\u68C0\uFF08" + pf.reason + "\uFF09" : "\u7B80\u5355\u8BF7\u6C42\uFF08\u65E0\u9700\u9884\u68C0\uFF0C\u76F4\u63A5\u6838\u5BF9\u54CD\u5E94\u5934\uFF09"}`);
      lines.push("\u670D\u52A1\u7AEF\u5E94\u7B54\u5934\u5EFA\u8BAE\uFF1A");
      for (const h of headers) lines.push(`  ${h}`);
      if (withCreds) lines.push("\u6CE8\u610F\uFF1Acredentials \u4E0B ACAO \u5FC5\u987B\u7CBE\u786E\u56DE\u663E origin\uFF0C\u4E0D\u80FD\u7528 *\uFF08Fetch \u6807\u51C6\uFF09");
      return { ok: true, advice: lines.join("\n") };
    }
    function renderCorsReport(r) {
      if (!r.ok) return `\u5224\u5B9A\u5931\u8D25\uFF1A${r.error}`;
      const mark = { pass: "[\u2713]", fail: "[\u2717]", warn: "[!]", info: "[\xB7]" };
      const lines = [];
      lines.push(`\u5224\u5B9A\uFF1A${r.verdict === "pass" ? "\u901A\u8FC7\u2014\u2014\u6D4F\u89C8\u5668\u653E\u884C" : "\u5931\u8D25\u2014\u2014\u6D4F\u89C8\u5668\u5C06\u62E6\u622A"}\uFF08${r.kind === "preflight" ? "\u6309\u9884\u68C0\u8BED\u4E49" : "\u7B80\u5355\u8BF7\u6C42\u8BED\u4E49"}\uFF09`);
      for (const c of r.checks) lines.push(`  ${mark[c.status]} ${c.item}\uFF1A${c.detail}`);
      if (r.hints && r.hints.length) {
        lines.push("\u4FEE\u590D\u5EFA\u8BAE\uFF1A");
        for (const h of r.hints) lines.push(`  \u2192 ${h}`);
      }
      return lines.join("\n");
    }
    module.exports = {
      isSafelistedMethod,
      isSafelistedHeader,
      needsPreflight,
      isExposedResponseHeader,
      judgeCors: judgeCors2,
      generateCorsAdvice,
      renderCorsReport,
      toHeaderList
    };
  }
});

// src/Panel.tsx
var cookies = __toESM(require_cookie_core());
var cors = __toESM(require_cors_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-tabs{display:flex;gap:4px;padding:8px 13px 0}
.cl-tab{background:#161c2a;border:1px solid #2b3348;border-bottom:none;border-radius:8px 8px 0 0;color:#8B94A9;font-size:12px;padding:6px 14px;cursor:pointer}
.cl-tab.on{color:#E6EAF2;background:#1a2030;border-color:#3a4358}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px;border-top:1px solid #1c2333}
.cl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:8px 10px;outline:none}
textarea.cl-input{resize:vertical;min-height:64px}
.cl-input:focus{border-color:#4fd1a0}
.cl-btn{background:#1f2940;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font-size:12px;padding:6px 18px;cursor:pointer}
.cl-btn:hover{border-color:#4fd1a0}
.cl-lbl{font-size:11px;color:#8B94A9;margin-bottom:3px;display:block}
.cl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.cl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.cl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.cl-rows{font:12px/1.9 ui-monospace,Consolas,monospace}
.cl-rows .r{display:flex;gap:10px;padding:2px 12px}
.cl-rows .k{color:#8B94A9;min-width:100px}
.cl-rows .v{color:#c9cede;word-break:break-all}
.cl-verdict{border-radius:8px;padding:9px 13px;font-size:12.5px;font-weight:600}
.cl-verdict.ok{border:1px solid #2f9e6e;background:#12271d;color:#69db7c}
.cl-verdict.bad{border:1px solid #e03131;background:#2b1215;color:#ff8787}
.cl-f{border-radius:6px;padding:6px 11px;font-size:11.5px;line-height:1.55}
.cl-f.error{border:1px solid #e03131;background:#2b1215;color:#ffa8a8}
.cl-f.warn{border:1px solid #f08c00;background:#2b1d0e;color:#ffc078}
.cl-f.info{border:1px solid #1c2333;background:#161c2a;color:#8B94A9}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-badge{display:inline-block;border-radius:4px;padding:0 6px;font-size:10.5px;font-weight:700}
`;
var TABS = [
  { id: "setcookie", label: "Set-Cookie \u89E3\u6790" },
  { id: "match", label: "Cookie\u2192URL \u5339\u914D" },
  { id: "cors", label: "CORS \u5224\u5B9A" }
];
function parseHeaderText(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i <= 0) continue;
    out.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim() });
  }
  return out;
}
function Findings({ findings }) {
  if (!findings.length) return /* @__PURE__ */ jsx("div", { className: "cl-f info", children: "\u8BCA\u65AD\uFF1A\u65E0\u5F02\u5E38" });
  return /* @__PURE__ */ jsx(Fragment, { children: findings.map((f, i) => /* @__PURE__ */ jsxs("div", { className: `cl-f ${f.level}`, children: [
    /* @__PURE__ */ jsx("b", { children: f.level === "error" ? "\u62D2\u6536" : f.level === "warn" ? "\u8B66\u544A" : "\u8BF4\u660E" }),
    " \xB7 ",
    f.code,
    " \u2014\u2014 ",
    f.message
  ] }, i)) });
}
function CookieLensPanel(_props) {
  const [tab, setTab] = useState("setcookie");
  const [scText, setScText] = useState("");
  const [scUrl, setScUrl] = useState("");
  const [scGo, setScGo] = useState(0);
  const sc = useMemo(() => {
    if (!scGo) return null;
    return cookies.parseSetCookie(scText, scUrl);
  }, [scGo]);
  const [matchUrl, setMatchUrl] = useState("");
  const [matchGo, setMatchGo] = useState(0);
  const match = useMemo(() => {
    if (!matchGo || !sc || !sc.ok || !sc.scope) return null;
    return cookies.cookieMatchesUrl({ scope: sc.scope }, matchUrl);
  }, [matchGo]);
  const [origin, setOrigin] = useState("");
  const [method, setMethod] = useState("GET");
  const [reqH, setReqH] = useState("");
  const [resH, setResH] = useState("");
  const [creds, setCreds] = useState(false);
  const [corsGo, setCorsGo] = useState(0);
  const corsResult = useMemo(() => {
    if (!corsGo) return null;
    return cors.judgeCors({
      origin,
      method,
      requestHeaders: parseHeaderText(reqH),
      responseHeaders: parseHeaderText(resH),
      withCredentials: creds
    });
  }, [corsGo]);
  return /* @__PURE__ */ jsxs("div", { className: "cl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "cl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "Cookie & CORS \u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "RFC 6265 \u8BED\u4E49 \xB7 \u62D2\u6536\u5224\u5B9A \xB7 \u7EAF\u672C\u5730\u96F6\u5916\u8054" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "cl-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx("button", { className: `cl-tab${tab === t.id ? " on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) }),
    /* @__PURE__ */ jsxs("div", { className: "cl-body", children: [
      tab === "setcookie" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: 'Set-Cookie \u503C\uFF08\u4E0D\u542B "Set-Cookie:" \u524D\u7F00\u4E5F\u884C\uFF09' }),
          /* @__PURE__ */ jsx("input", { className: "cl-input", placeholder: "sid=abc123; Path=/; Domain=.example.com; Secure; HttpOnly; SameSite=None", value: scText, onChange: (e) => setScText(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "\u63A5\u6536\u8BE5\u54CD\u5E94\u5934\u7684 URL\uFF08\u5224\u5B9A Domain/Path/Secure \u8BED\u4E49\u5FC5\u9700\uFF09" }),
          /* @__PURE__ */ jsx("input", { className: "cl-input", placeholder: "https://api.example.com/v1/login", value: scUrl, onChange: (e) => setScUrl(e.target.value), onKeyDown: (e) => {
            if (e.key === "Enter") setScGo(scGo + 1);
          } })
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => setScGo(scGo + 1), children: "\u89E3\u6790\u8BCA\u65AD" }) }),
        sc && !sc.ok && /* @__PURE__ */ jsx("div", { className: "cl-err", children: sc.error }),
        sc && sc.ok && sc.cookie && sc.scope && sc.findings && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: `cl-verdict ${sc.verdict === "accepted" ? "ok" : "bad"}`, children: sc.verdict === "accepted" ? "\u2713 \u6D4F\u89C8\u5668\u4F1A\u63A5\u53D7\u8FD9\u6761 cookie" : "\u2717 \u6D4F\u89C8\u5668\u5C06\u62D2\u6536\u8FD9\u6761 cookie" }),
          /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsx("h3", { children: "\u7ED3\u6784\u4E0E\u751F\u6548\u8303\u56F4" }),
            /* @__PURE__ */ jsxs("div", { className: "cl-rows", children: [
              /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "name / value" }),
                /* @__PURE__ */ jsxs("span", { className: "v", children: [
                  sc.cookie.name,
                  " = ",
                  sc.cookie.value === "" ? "(\u7A7A)" : sc.cookie.value
                ] })
              ] }),
              sc.cookie.domain && /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "Domain" }),
                /* @__PURE__ */ jsx("span", { className: "v", children: sc.cookie.domain })
              ] }),
              sc.cookie.path && /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "Path" }),
                /* @__PURE__ */ jsx("span", { className: "v", children: sc.cookie.path })
              ] }),
              sc.cookie.maxAge !== null && /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "Max-Age" }),
                /* @__PURE__ */ jsx("span", { className: "v", children: sc.cookie.maxAge })
              ] }),
              sc.cookie.expires && /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "Expires" }),
                /* @__PURE__ */ jsx("span", { className: "v", children: sc.cookie.expires.raw })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "\u6807\u5FD7\u4F4D" }),
                /* @__PURE__ */ jsx("span", { className: "v", children: [sc.cookie.secure && "Secure", sc.cookie.httpOnly && "HttpOnly", sc.cookie.sameSite && `SameSite=${sc.cookie.sameSite}`, sc.cookie.partitioned && "Partitioned"].filter(Boolean).join(" ") || "(\u65E0)" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "r", children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "\u751F\u6548\u8303\u56F4" }),
                /* @__PURE__ */ jsxs("span", { className: "v", children: [
                  "domain:",
                  sc.scope.domain,
                  sc.scope.hostOnly ? "(hostOnly)" : "",
                  " \xB7 path:",
                  sc.scope.path,
                  " \xB7 secure:",
                  String(sc.scope.secure)
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx(Findings, { findings: sc.findings })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u62D2\u6536\u7EA7\u5224\u5B9A\uFF1ASameSite=None \u65E0 Secure\u3001__Host-/__Secure- \u524D\u7F00\u8FDD\u89C4\u3001Domain \u975E host \u7236\u57DF\u3001\u540D\u79F0\u542B\u975E\u6CD5\u5B57\u7B26\u3002localhost \u6309 trustworthy origin \u8C41\u514D Secure \u660E\u6587\u9650\u5236\u3002\u7EAF\u672C\u5730\u5224\u5B9A\uFF0C\u4E0D\u53D1\u8BF7\u6C42\u3002" })
      ] }),
      tab === "match" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "\u5148\u5728\u300CSet-Cookie \u89E3\u6790\u300D\u9875\u7B7E\u89E3\u6790\u4E00\u6761 cookie\uFF08\u751F\u6548\u8303\u56F4\u4EE5\u6B64\u4E3A\u51C6\uFF09" }),
          !sc || !sc.ok || !sc.scope ? /* @__PURE__ */ jsx("div", { className: "cl-f warn", children: "\u5C1A\u65E0\u6709\u6548\u89E3\u6790\u7ED3\u679C\u2014\u2014\u5148\u53BB\u7B2C\u4E00\u9875\u7B7E\u89E3\u6790\u4E00\u6761 Set-Cookie" }) : /* @__PURE__ */ jsxs("div", { className: "cl-rows", children: [
            /* @__PURE__ */ jsxs("div", { className: "r", children: [
              /* @__PURE__ */ jsx("span", { className: "k", children: "cookie" }),
              /* @__PURE__ */ jsx("span", { className: "v", children: sc.cookie ? `${sc.cookie.name}=${sc.cookie.value}` : "" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "r", children: [
              /* @__PURE__ */ jsx("span", { className: "k", children: "\u751F\u6548\u8303\u56F4" }),
              /* @__PURE__ */ jsxs("span", { className: "v", children: [
                "domain:",
                sc.scope.domain,
                sc.scope.hostOnly ? "(hostOnly)" : "",
                " \xB7 path:",
                sc.scope.path,
                " \xB7 secure:",
                String(sc.scope.secure)
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "\u76EE\u6807 URL\uFF08\u8FD9\u4E2A\u8BF7\u6C42\u4F1A\u5E26\u4E0A\u8BE5 cookie \u5417\uFF1F\uFF09" }),
          /* @__PURE__ */ jsx("input", { className: "cl-input", placeholder: "https://api.example.com/v1/orders", value: matchUrl, onChange: (e) => setMatchUrl(e.target.value), onKeyDown: (e) => {
            if (e.key === "Enter") setMatchGo(matchGo + 1);
          } })
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { className: "cl-btn", disabled: !sc || !sc.ok, onClick: () => setMatchGo(matchGo + 1), children: "\u5224\u5B9A\u5339\u914D" }) }),
        match && !match.ok && /* @__PURE__ */ jsx("div", { className: "cl-err", children: match.error }),
        match && match.ok && match.reasons && /* @__PURE__ */ jsx("div", { className: `cl-verdict ${match.matches ? "ok" : "bad"}`, children: match.matches ? "\u2713 \u8BE5\u8BF7\u6C42\u4F1A\u643A\u5E26\u8FD9\u6761 cookie" : "\u2717 \u4E0D\u4F1A\u643A\u5E26\uFF1A" + match.reasons.join("\uFF1B") }),
        /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u5339\u914D = domain-match\uFF08host \u662F Domain \u53CA\u5176\u5B50\u57DF\uFF09+ path-match\uFF08\u8BF7\u6C42\u8DEF\u5F84\u5728 Path \u76EE\u5F55\u4E0B\uFF09+ Secure \u901A\u9053\u5224\u5B9A\u3002Domain=.example.com \u53EF\u53D1\u5230\u5B50\u57DF\uFF1BhostOnly\uFF08\u672A\u5199 Domain\uFF09\u53EA\u53D1\u56DE\u7CBE\u786E host\u3002" })
      ] }),
      tab === "cors" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "Origin\uFF08\u53D1\u8D77\u9875\u6765\u6E90\uFF09" }),
            /* @__PURE__ */ jsx("input", { className: "cl-input", placeholder: "https://app.example.com", value: origin, onChange: (e) => setOrigin(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { width: 120 }, children: [
            /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "Method" }),
            /* @__PURE__ */ jsx("input", { className: "cl-input", value: method, onChange: (e) => setMethod(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { width: 150 }, children: [
            /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "withCredentials" }),
            /* @__PURE__ */ jsx("button", { className: "cl-btn", style: { width: "100%" }, onClick: () => setCreds(!creds), children: creds ? "true\uFF08\u5E26\u51ED\u8BC1\uFF09" : "false" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "\u8BF7\u6C42\u5934\uFF08Name: value\uFF0C\u6BCF\u884C\u4E00\u6761\uFF09" }),
            /* @__PURE__ */ jsx("textarea", { className: "cl-input", placeholder: "Authorization: Bearer xxx\nContent-Type: application/json", value: reqH, onChange: (e) => setReqH(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ jsx("span", { className: "cl-lbl", children: "\u54CD\u5E94\u5934\uFF08\u670D\u52A1\u7AEF CORS \u76F8\u5173\u5E94\u7B54\uFF09" }),
            /* @__PURE__ */ jsx("textarea", { className: "cl-input", placeholder: "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST\r\nAccess-Control-Allow-Headers: Content-Type", value: resH, onChange: (e) => setResH(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { className: "cl-btn", onClick: () => setCorsGo(corsGo + 1), children: "\u5224\u5B9A" }) }),
        corsResult && !corsResult.ok && /* @__PURE__ */ jsx("div", { className: "cl-err", children: corsResult.error }),
        corsResult && corsResult.ok && corsResult.checks && corsResult.hints && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: `cl-verdict ${corsResult.verdict === "pass" ? "ok" : "bad"}`, children: corsResult.verdict === "pass" ? `\u2713 \u901A\u8FC7\uFF08${corsResult.kind === "preflight" ? "\u9884\u68C0\u8BED\u4E49" : "\u7B80\u5355\u8BF7\u6C42\u8BED\u4E49"}\uFF09` : "\u2717 \u5931\u8D25\u2014\u2014\u6D4F\u89C8\u5668\u5C06\u62E6\u622A" }),
          /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsx("h3", { children: "\u68C0\u67E5\u660E\u7EC6" }),
            /* @__PURE__ */ jsx("table", { className: "cl-tbl", children: /* @__PURE__ */ jsx("tbody", { children: corsResult.checks.map((c, i) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { style: { width: 40 }, children: /* @__PURE__ */ jsx("span", { className: `cl-badge`, style: c.status === "pass" ? { background: "#12271d", color: "#69db7c" } : c.status === "fail" ? { background: "#2b1215", color: "#ff8787" } : c.status === "warn" ? { background: "#2b1d0e", color: "#ffc078" } : { background: "#1a2030", color: "#8B94A9" }, children: c.status === "pass" ? "\u2713" : c.status === "fail" ? "\u2717" : c.status === "warn" ? "!" : "\xB7" }) }),
              /* @__PURE__ */ jsx("td", { style: { width: 200 }, children: c.item }),
              /* @__PURE__ */ jsx("td", { children: c.detail })
            ] }, i)) }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
            /* @__PURE__ */ jsx("h3", { children: "\u4FEE\u590D\u5EFA\u8BAE" }),
            /* @__PURE__ */ jsx("div", { style: { padding: "6px 12px" }, children: corsResult.hints.map((h, i) => /* @__PURE__ */ jsxs("div", { className: "cl-f info", style: { marginBottom: 4 }, children: [
              "\u2192 ",
              h
            ] }, i)) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "cl-note", children: "\u8BED\u4E49\u57FA\u51C6\uFF1AFetch Standard\u3002credentials \u4E0B ACAO=* \u4E0E ACAH/ACAM \u7684 * \u90FD\u4E0D\u518D\u901A\u914D\uFF1B\u91CD\u590D ACAO \u6309\u5931\u8D25\u5904\u7406\u4E0D\u5408\u5E76\uFF1BAuthorization \u975E\u5B89\u5168\u5934\u5FC5\u89E6\u53D1\u9884\u68C0\u3002\u7EAF\u672C\u5730\u63A8\u6F14\uFF0C\u4E0D\u53D1\u8BF7\u6C42\u3002" })
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function CookieLensEntry(props) {
  return /* @__PURE__ */ jsx2(CookieLensPanel, { ...props });
}
export {
  CookieLensEntry as default
};
