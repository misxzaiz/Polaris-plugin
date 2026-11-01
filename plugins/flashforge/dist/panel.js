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
    var LIMITS = {
      MAX_APPS: 60,
      // 应用总数上限（超限拒绝并引导整理）
      MAX_SOURCE_BYTES: 200 * 1024,
      // 单版源码 UTF-8 字节上限
      MIN_SOURCE_BYTES: 30,
      // 低于此值视为空壳拒绝
      MAX_TITLE: 60,
      MAX_CHANGELOG: 500,
      MAX_TAGS: 5,
      MAX_TAG_LEN: 12,
      MAX_SCORES: 200,
      // 每应用成绩保留条数（新者胜截尾）
      CHUNK_CHARS: 24 * 1024,
      // 源码分块大小（JS 字符）
      MAX_SCORE_ABS: 1e15
      // 成绩数值绝对值上限（防 NaN/Infinity/溢出脏数据）
    };
    var KINDS = ["game", "tool", "teach"];
    var KIND_LABELS2 = { game: "\u6E38\u620F", tool: "\u5DE5\u5177", teach: "\u6559\u5177" };
    var K = {
      PREFIX: "ff.",
      INDEX: "ff.apps",
      SETTINGS: "ff.settings",
      verPart: (id, v, i) => `ff.ver.${id}.${v}.p.${i}`,
      verPartPrefix: (id, v) => `ff.ver.${id}.${v}.p.`,
      score: (id) => `ff.score.${id}`
    };
    var encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
    function byteLength(str) {
      if (encoder) return encoder.encode(str).length;
      let n = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 128) n += 1;
        else if (c < 2048) n += 2;
        else if (c >= 55296 && c <= 56319) {
          n += 4;
          i++;
        } else n += 3;
      }
      return n;
    }
    function validId(id) {
      return typeof id === "string" && /^f[a-z0-9]{1,15}$/.test(id);
    }
    function genId(rand) {
      const rnd = rand || Math.random;
      let s = "";
      for (let i = 0; i < 10; i++) s += Math.floor(rnd() * 36).toString(36);
      return `f${s}`;
    }
    var SCAN_RULES = [
      // BLOCK：联网/逃逸面（合作作者不允许出现；沙箱兜底）
      { rule: "fetch\u8C03\u7528", severity: "block", re: /\bfetch\s*\(/, hint: "\u7981\u6B62 fetch()\u2014\u2014\u5E94\u7528\u5FC5\u987B\u5B8C\u5168\u79BB\u7EBF\u3002" },
      { rule: "XMLHttpRequest", severity: "block", re: /\bXMLHttpRequest\b/, hint: "\u7981\u6B62 XMLHttpRequest\u2014\u2014\u5E94\u7528\u5FC5\u987B\u5B8C\u5168\u79BB\u7EBF\u3002" },
      { rule: "WebSocket", severity: "block", re: /\bnew\s+WebSocket\b/, hint: "\u7981\u6B62 WebSocket\u2014\u2014\u5E94\u7528\u5FC5\u987B\u5B8C\u5168\u79BB\u7EBF\u3002" },
      { rule: "EventSource", severity: "block", re: /\bEventSource\b/, hint: "\u7981\u6B62 EventSource\u2014\u2014\u5E94\u7528\u5FC5\u987B\u5B8C\u5168\u79BB\u7EBF\u3002" },
      { rule: "sendBeacon", severity: "block", re: /\bsendBeacon\s*\(/, hint: "\u7981\u6B62 sendBeacon\u2014\u2014\u5E94\u7528\u5FC5\u987B\u5B8C\u5168\u79BB\u7EBF\u3002" },
      { rule: "serviceWorker", severity: "block", re: /\bserviceWorker\b|\bnavigator\.serviceWorker\b/, hint: "\u7981\u6B62 serviceWorker\uFF08\u4E0D\u900F\u660E origin \u4E0B\u4E0D\u53EF\u7528\uFF09\u3002" },
      { rule: "\u52A8\u6001import", severity: "block", re: /\bimport\s*\(/, hint: "\u7981\u6B62\u52A8\u6001 import()\u2014\u2014\u903B\u8F91\u5168\u90E8\u5185\u8054\u3002" },
      { rule: "importScripts", severity: "block", re: /\bimportScripts\b/, hint: "\u7981\u6B62 importScripts\u2014\u2014\u903B\u8F91\u5168\u90E8\u5185\u8054\u3002" },
      { rule: "\u5916\u94FE\u8D44\u6E90", severity: "block", re: /\b(?:src|href|action|poster|data)\s*=\s*["']\s*(?:https?:)?\/\//i, hint: "\u7981\u6B62\u5916\u94FE src/href/action\u2014\u2014\u6837\u5F0F\u4E0E\u8D44\u6E90\u5168\u90E8\u5185\u8054\uFF08data: \u6216\u76F8\u5BF9\u5F15\u7528\u4EA6\u4E0D\u53EF\u51FA\u7F51\uFF09\u3002" },
      { rule: "CSS\u5916\u94FE", severity: "block", re: /url\(\s*["']?\s*(?:https?:)?\/\/|@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//i, hint: "\u7981\u6B62 CSS url()/@import \u6307\u5411\u5916\u90E8\u2014\u2014\u8D44\u6E90\u5185\u8054\u4E3A data:\u3002" },
      { rule: "\u52A8\u6001\u5916\u94FE\u8D4B\u503C", severity: "block", re: /\.\s*(?:src|href|action)\s*=\s*["'`]\s*(?:https?:)?\/\//i, hint: "\u7981\u6B62\u8FD0\u884C\u65F6\u628A .src/.href/.action \u6307\u5411\u5916\u90E8\u5730\u5740\u3002" },
      { rule: "window.open", severity: "block", re: /\bwindow\.open\s*\(/, hint: "\u7981\u6B62 window.open\u2014\u2014\u6C99\u7BB1\u65E0 allow-popups\u3002" },
      { rule: "document.domain", severity: "block", re: /\bdocument\.domain\b/, hint: "\u7981\u6B62 document.domain\u3002" },
      { rule: "\u9876\u5C42\u5BFC\u822A", severity: "block", re: /\b(?:top|parent)\.location\b/, hint: "\u7981\u6B62\u8BBF\u95EE top/parent.location\u2014\u2014\u6C99\u7BB1\u65E0\u9876\u5C42\u5BFC\u822A\u6743\u3002" },
      { rule: "http\u8DF3\u8F6C", severity: "block", re: /\blocation(?:\.(?:href|assign|replace))?\s*(?:=\s*|\(\s*)["'`]?\s*(?:https?:)?\/\//i, hint: "\u7981\u6B62\u628A location \u6307\u5411\u5916\u90E8\u5730\u5740\uFF08\u5E94\u7528\u5185\u8DF3\u8F6C\u8BF7\u7528\u5185\u90E8\u72B6\u6001\uFF09\u3002" },
      // WARN：不透明 origin 下必然失效/被静默拦截的用法（引导作者修正）
      { rule: "localStorage", severity: "warn", re: /\blocalStorage\b/, hint: "\u6C99\u7BB1\u4E3A\u4E0D\u900F\u660E origin\uFF0ClocalStorage \u4F1A\u629B SecurityError\u2014\u2014\u8BF7\u6539\u7528\u5185\u5B58\u53D8\u91CF\u3002" },
      { rule: "sessionStorage", severity: "warn", re: /\bsessionStorage\b/, hint: "\u6C99\u7BB1\u4E3A\u4E0D\u900F\u660E origin\uFF0CsessionStorage \u4F1A\u629B SecurityError\u2014\u2014\u8BF7\u6539\u7528\u5185\u5B58\u53D8\u91CF\u3002" },
      { rule: "indexedDB", severity: "warn", re: /\bindexedDB\b/i, hint: "\u4E0D\u900F\u660E origin \u4E0B indexedDB \u4E0D\u53EF\u7528\u2014\u2014\u8BF7\u6539\u7528\u5185\u5B58\u53D8\u91CF\u3002" },
      { rule: "document.cookie", severity: "warn", re: /\bdocument\.cookie\b/, hint: "\u4E0D\u900F\u660E origin \u4E0B cookie \u4E0D\u53EF\u7528\u2014\u2014\u8BF7\u79FB\u9664\u3002" },
      { rule: "\u6A21\u6001\u5BF9\u8BDD\u6846", severity: "warn", re: /\b(?:alert|confirm|prompt)\s*\(/, hint: "\u6C99\u7BB1\u5185 alert/confirm/prompt \u88AB\u9759\u9ED8\u62E6\u622A\u2014\u2014\u8BF7\u7528\u9875\u9762\u5185\u63D0\u793A\u66FF\u4EE3\u3002" },
      // WARN：创作契约（手机可玩性）
      { rule: "\u7F3ADOCTYPE", severity: "warn", re: /<!doctype\s+html/i, want: true, hint: "\u7F3A\u5C11 <!DOCTYPE html>\u2014\u2014\u8BF7\u8865\u4E0A\u4EE5\u4FDD\u8BC1\u4E00\u81F4\u6E32\u67D3\u3002" },
      { rule: "\u7F3Aviewport", severity: "warn", re: /name\s*=\s*["']viewport["']/i, want: true, hint: '\u7F3A\u5C11 <meta name="viewport">\u2014\u2014\u624B\u673A\u7AEF\u4F1A\u6309 980px \u684C\u9762\u5BBD\u5EA6\u6E32\u67D3\uFF0C\u52A1\u5FC5\u8865\u4E0A\u3002' }
    ];
    function scanSource(html) {
      if (typeof html !== "string" || !html.includes("<")) {
        return { ok: false, blocked: [{ rule: "\u975EHTML", hint: "\u6E90\u7801\u5FC5\u987B\u662F\u5305\u542B\u6807\u7B7E\u7684 HTML \u5B57\u7B26\u4E32\u3002" }], warnings: [], sizeBytes: typeof html === "string" ? byteLength(html) : 0 };
      }
      const sizeBytes = byteLength(html);
      if (sizeBytes > LIMITS.MAX_SOURCE_BYTES) {
        return { ok: false, blocked: [{ rule: "\u8D85\u4F53\u79EF", hint: `\u6E90\u7801 ${sizeBytes} \u5B57\u8282\u8D85\u8FC7\u4E0A\u9650 ${LIMITS.MAX_SOURCE_BYTES}\uFF08200KB\uFF09\u2014\u2014\u8BF7\u7CBE\u7B80\u6216\u62C6\u5206\u529F\u80FD\u3002` }], warnings: [], sizeBytes };
      }
      if (sizeBytes < LIMITS.MIN_SOURCE_BYTES) {
        return { ok: false, blocked: [{ rule: "\u7A7A\u58F3", hint: `\u6E90\u7801\u4EC5 ${sizeBytes} \u5B57\u8282\uFF0C\u4F4E\u4E8E\u6700\u5C0F\u53EF\u8FD0\u884C\u4F53\u79EF\u3002` }], warnings: [], sizeBytes };
      }
      const blocked = [];
      const warnings = [];
      for (const r of SCAN_RULES) {
        const hit = r.re.test(html);
        const flagged = r.want ? !hit : hit;
        if (!flagged) continue;
        const item = { rule: r.rule, hint: r.hint };
        if (r.severity === "block") blocked.push(item);
        else warnings.push(item);
      }
      return { ok: blocked.length === 0, blocked, warnings, sizeBytes };
    }
    function scanReportText(report) {
      const lines = [`\u4F53\u79EF ${report.sizeBytes} \u5B57\u8282`];
      for (const b of report.blocked) lines.push(`[\u62D2\u7EDD] ${b.rule}\uFF1A${b.hint}`);
      for (const w of report.warnings) lines.push(`[\u63D0\u9192] ${w.rule}\uFF1A${w.hint}`);
      return lines.join("\n");
    }
    function chunkSource(html) {
      const parts = [];
      for (let i = 0; i < html.length; i += LIMITS.CHUNK_CHARS) {
        parts.push(html.slice(i, i + LIMITS.CHUNK_CHARS));
      }
      return parts.length ? parts : [""];
    }
    function assembleParts(parts) {
      if (!Array.isArray(parts)) return null;
      let out = "";
      for (const p of parts) {
        if (typeof p !== "string") return null;
        out += p;
      }
      return out;
    }
    function validSha(s) {
      return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
    }
    function cleanTags(tags) {
      if (!Array.isArray(tags)) return [];
      const out = [];
      for (const t of tags) {
        if (typeof t !== "string") continue;
        const v = t.trim().slice(0, LIMITS.MAX_TAG_LEN);
        if (v && !out.includes(v)) out.push(v);
        if (out.length >= LIMITS.MAX_TAGS) break;
      }
      return out;
    }
    function cleanTitle(title) {
      if (typeof title !== "string") return "";
      return title.trim().replace(/\s+/g, " ");
    }
    function cleanChangelog(text, fallback) {
      if (typeof text !== "string" || !text.trim()) return fallback;
      return text.trim().slice(0, LIMITS.MAX_CHANGELOG);
    }
    function newApp(input, ctx) {
      const now = ctx && ctx.now || Date.now();
      const rand = ctx && ctx.rand;
      const title = cleanTitle(input && input.title);
      if (!title) return { error: "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A\u3002" };
      if (title.length > LIMITS.MAX_TITLE) return { error: `\u6807\u9898\u8D85\u957F\uFF08> ${LIMITS.MAX_TITLE} \u5B57\uFF09\u3002` };
      const kind = input && input.kind;
      if (!KINDS.includes(kind)) return { error: `kind \u5FC5\u987B\u662F ${KINDS.join("/")} \u4E4B\u4E00\u3002` };
      const html = input && input.html;
      if (typeof html !== "string") return { error: "html \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002" };
      const sha = input && input.sha256;
      if (!validSha(sha)) return { error: "sha256 \u7F3A\u5931\u6216\u5F62\u72B6\u975E\u6CD5\uFF0864 \u4F4D\u5C0F\u5199\u5341\u516D\u8FDB\u5236\uFF09\u3002" };
      const id = genId(rand);
      const report = scanSource(html);
      if (!report.ok) return { error: `\u626B\u63CF\u672A\u901A\u8FC7\uFF0C\u672A\u5165\u5E93\uFF1A
${scanReportText(report)}` };
      const version = {
        v: 1,
        changelog: cleanChangelog(input.changelog, "\u521D\u7248"),
        createdAt: now,
        size: report.sizeBytes,
        sha256: sha,
        warns: report.warnings.length
      };
      const app = {
        id,
        title,
        kind,
        tags: cleanTags(input.tags),
        createdAt: now,
        updatedAt: now,
        head: 1,
        size: report.sizeBytes,
        pushedAt: null,
        versions: [version]
      };
      return { app, version, parts: chunkSource(html) };
    }
    function appendVersion(app, input) {
      if (!app || !Array.isArray(app.versions)) return { error: "\u5E94\u7528\u6570\u636E\u635F\u574F\u3002" };
      if (app.versions.length >= LIMITS.MAX_APPS * 4) return { error: `\u7248\u672C\u6570\u5DF2\u8FBE\u4E0A\u9650 ${app.versions.length}\uFF0C\u8BF7\u56DE\u9000\u6574\u7406\u3002` };
      const html = input && input.html;
      if (typeof html !== "string") return { error: "html \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002" };
      const sha = input && input.sha256;
      if (!validSha(sha)) return { error: "sha256 \u7F3A\u5931\u6216\u5F62\u72B6\u975E\u6CD5\u3002" };
      const now = input && input.now || Date.now();
      const prev = app.versions[app.versions.length - 1];
      const version = {
        v: prev.v + 1,
        changelog: cleanChangelog(input.changelog, `\u8FED\u4EE3\u81EA v${prev.v}`),
        createdAt: now,
        size: byteLength(html),
        sha256: sha,
        warns: input.warnCount != null ? input.warnCount : 0
      };
      const next = {
        ...app,
        updatedAt: now,
        head: version.v,
        size: version.size,
        versions: [...app.versions, version]
      };
      return { app: next, version, parts: chunkSource(html) };
    }
    function rollbackVersion(app, vOld, now) {
      if (!app || !Array.isArray(app.versions)) return { error: "\u5E94\u7528\u6570\u636E\u635F\u574F\u3002" };
      const src = app.versions.find((x) => x && x.v === vOld);
      if (!src) return { error: `\u7248\u672C v${vOld} \u4E0D\u5B58\u5728\u3002` };
      const prev = app.versions[app.versions.length - 1];
      const version = {
        v: prev.v + 1,
        changelog: `\u56DE\u9000\u81EA v${vOld}\uFF08${src.changelog}\uFF09`,
        createdAt: now,
        size: src.size,
        sha256: src.sha256,
        warns: src.warns || 0
      };
      const next = {
        ...app,
        updatedAt: now,
        head: version.v,
        size: src.size,
        versions: [...app.versions, version]
      };
      return { app: next, version, reuseFrom: vOld };
    }
    function sanitizeVersion(raw) {
      if (!raw || typeof raw !== "object") return null;
      const v = Number(raw.v);
      if (!Number.isInteger(v) || v < 1 || v > 1e6) return null;
      if (!validSha(raw.sha256)) return null;
      const size = Number(raw.size);
      return {
        v,
        changelog: typeof raw.changelog === "string" ? raw.changelog.slice(0, LIMITS.MAX_CHANGELOG) : "",
        createdAt: Number(raw.createdAt) || 0,
        size: Number.isFinite(size) ? size : 0,
        sha256: raw.sha256,
        warns: Number(raw.warns) || 0
      };
    }
    function sanitizeIndex(raw) {
      if (!Array.isArray(raw)) return [];
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const it of raw) {
        if (!it || typeof it !== "object") continue;
        if (!validId(it.id) || seen.has(it.id)) continue;
        const title = cleanTitle(it.title);
        if (!title) continue;
        const versions = Array.isArray(it.versions) ? it.versions.map(sanitizeVersion).filter(Boolean).sort((a, b) => a.v - b.v) : [];
        if (!versions.length) continue;
        seen.add(it.id);
        out.push({
          id: it.id,
          title,
          kind: KINDS.includes(it.kind) ? it.kind : "tool",
          tags: cleanTags(it.tags),
          createdAt: Number(it.createdAt) || 0,
          updatedAt: Number(it.updatedAt) || versions[versions.length - 1].createdAt,
          head: Number(it.head) || versions[versions.length - 1].v,
          size: Number(it.size) || versions[versions.length - 1].size,
          pushedAt: Number(it.pushedAt) || null,
          versions
        });
      }
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    function upsertIndex(index, entry) {
      const rest = index.filter((x) => x.id !== entry.id);
      return [entry, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    function removeIndex(index, id) {
      return index.filter((x) => x.id !== id);
    }
    function mergeIndex(local, remote) {
      const a = sanitizeIndex(local);
      const b = sanitizeIndex(remote);
      const map = /* @__PURE__ */ new Map();
      for (const it of b) map.set(it.id, it);
      for (const it of a) {
        const cur = map.get(it.id);
        if (!cur || it.updatedAt > cur.updatedAt) map.set(it.id, it);
      }
      return [...map.values()].sort((x, y) => y.updatedAt - x.updatedAt);
    }
    function sanitizeScores(raw) {
      if (!Array.isArray(raw)) return [];
      const out = [];
      for (const s of raw) {
        if (!s || typeof s !== "object") continue;
        const score = Number(s.score);
        if (!Number.isFinite(score) || Math.abs(score) > LIMITS.MAX_SCORE_ABS) continue;
        out.push({
          score,
          player: typeof s.player === "string" ? s.player.slice(0, 24) : "\u533F\u540D",
          device: typeof s.device === "string" ? s.device.slice(0, 24) : "",
          ts: Number(s.ts) || 0
        });
      }
      return out.slice(-LIMITS.MAX_SCORES);
    }
    function addScore2(list, entry) {
      const score = Number(entry && entry.score);
      if (!Number.isFinite(score) || Math.abs(score) > LIMITS.MAX_SCORE_ABS) {
        return { error: "\u6210\u7EE9\u5FC5\u987B\u662F\u6709\u9650\u6570\u503C\u3002" };
      }
      const next = sanitizeScores([...list || [], {
        score,
        player: entry.player,
        device: entry.device,
        ts: entry && entry.ts || Date.now()
      }]);
      return { scores: next };
    }
    function topScores(list, limit) {
      const n = Number(limit) || 10;
      return [...list || []].sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, Math.max(1, Math.min(n, LIMITS.MAX_SCORES)));
    }
    function sanitizeSettings(raw) {
      const s = raw && typeof raw === "object" ? raw : {};
      return {
        nickname: typeof s.nickname === "string" ? s.nickname.trim().slice(0, 24) : "",
        deviceName: typeof s.deviceName === "string" ? s.deviceName.trim().slice(0, 24) : ""
      };
    }
    module.exports = {
      LIMITS,
      KINDS,
      KIND_LABELS: KIND_LABELS2,
      K,
      SCAN_RULES,
      byteLength,
      validId,
      genId,
      scanSource,
      scanReportText,
      chunkSource,
      assembleParts,
      validSha,
      cleanTitle,
      cleanTags,
      cleanChangelog,
      newApp,
      appendVersion,
      rollbackVersion,
      sanitizeIndex,
      upsertIndex,
      removeIndex,
      mergeIndex,
      sanitizeVersion,
      sanitizeScores,
      addScore: addScore2,
      topScores,
      sanitizeSettings
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect4, useRef as useRef2, useState as useState5 } from "react";

// src/AppGrid.tsx
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var KIND_ICONS = { game: "\u{1F3AE}", tool: "\u{1F6E0}\uFE0F", teach: "\u{1F393}" };
var KIND_LABELS = { game: "\u6E38\u620F", tool: "\u5DE5\u5177", teach: "\u6559\u5177" };
var NEW_MS = 48 * 3600 * 1e3;
function fmtTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 6e4) return "\u521A\u521A";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} \u5206\u949F\u524D`;
  if (diff < 24 * 36e5) return `${Math.floor(diff / 36e5)} \u5C0F\u65F6\u524D`;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtSize(n) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;
}
function AppGrid(props) {
  const { apps, bestScores, onOpen, onQuickPrompt } = props;
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (!kw) return true;
      return a.title.toLowerCase().includes(kw) || a.tags.some((t) => t.toLowerCase().includes(kw));
    });
  }, [apps, q, kind]);
  const isNew = (a) => !!a.pushedAt && Date.now() - a.pushedAt < NEW_MS;
  return /* @__PURE__ */ jsx("div", { className: "ff-grid-wrap", children: apps.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "ff-empty", children: [
    /* @__PURE__ */ jsx("div", { className: "ff-empty-icon", children: "\u2692\uFE0F" }),
    /* @__PURE__ */ jsx("div", { className: "ff-empty-title", children: "\u5E94\u7528\u67B6\u8FD8\u662F\u7A7A\u7684" }),
    /* @__PURE__ */ jsx("div", { className: "ff-empty-sub", children: "\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u4E00\u53E5\u8BDD\uFF0C\u5B83\u5C31\u4F1A\u73B0\u573A\u9020\u4E00\u4E2A\u80FD\u73A9\u7684\u5C0F\u5E94\u7528\u653E\u8FDB\u8FD9\u91CC\u3002" }),
    /* @__PURE__ */ jsx("div", { className: "ff-empty-prompts", children: [
      "\u5E2E\u6211\u9020\u4E00\u4E2A\u9713\u8679\u8D2A\u5403\u86C7\u6E38\u620F\uFF0C\u8981\u80FD\u8BB0\u5206",
      "\u505A\u4E2A\u756A\u8304\u949F\u5C0F\u5DE5\u5177\uFF0C25 \u5206\u949F\u4E00\u8F6E\u5E26\u63D0\u793A\u97F3",
      "\u9020\u4E00\u4E2A\u4E58\u6CD5\u53E3\u8BC0\u7EC3\u4E60\u6559\u5177\uFF0C\u7B54\u5BF9\u52A0\u5206"
    ].map((p) => /* @__PURE__ */ jsxs("button", { type: "button", className: "ff-btn ff-btn-ghost ff-prompt", onClick: () => onQuickPrompt(p), children: [
      "\u300C",
      p,
      "\u300D"
    ] }, p)) }),
    /* @__PURE__ */ jsx("div", { className: "ff-empty-sub", children: "\u9020\u597D\u540E\u9762\u677F\u4E0E\u624B\u673A\u7AEF\u7ACB\u5373\u53EF\u73A9\uFF0C\u7248\u672C\u53EF\u56DE\u9000\uFF0C\u5BB6\u4EBA\u540C\u73A9\u4E00\u5F20\u9AD8\u5206\u699C\u3002" })
  ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "ff-toolbar", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "ff-search",
          placeholder: "\u641C\u7D22\u5E94\u7528/\u6807\u7B7E\u2026",
          value: q,
          onChange: (e) => setQ(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "ff-kinds", children: ["all", "game", "tool", "teach"].map((k) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `ff-chip${kind === k ? " ff-chip-on" : ""}`,
          onClick: () => setKind(k),
          children: k === "all" ? "\u5168\u90E8" : KIND_LABELS[k]
        },
        k
      )) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ff-grid", children: [
      list.map((a) => {
        const best = bestScores[a.id];
        return /* @__PURE__ */ jsxs("button", { type: "button", className: "ff-card", onClick: () => onOpen(a.id), children: [
          /* @__PURE__ */ jsxs("div", { className: "ff-card-top", children: [
            /* @__PURE__ */ jsx("span", { className: "ff-card-icon", children: KIND_ICONS[a.kind] || "\u{1F4E6}" }),
            isNew(a) && /* @__PURE__ */ jsx("span", { className: "ff-badge-new", children: "\u65B0\u9020\u597D" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "ff-card-title", children: a.title }),
          /* @__PURE__ */ jsxs("div", { className: "ff-card-meta", children: [
            KIND_LABELS[a.kind],
            " \xB7 v",
            a.head,
            "\uFF08",
            a.versions.length,
            "\u7248\uFF09 \xB7 ",
            fmtSize(a.size)
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "ff-card-meta ff-card-dim", children: [
            "\u66F4\u65B0 ",
            fmtTime(a.updatedAt),
            best !== void 0 && best !== null ? ` \xB7 \u{1F3C6} ${best}` : ""
          ] }),
          a.tags.length > 0 && /* @__PURE__ */ jsx("div", { className: "ff-card-tags", children: a.tags.map((t) => /* @__PURE__ */ jsx("span", { className: "ff-tag", children: t }, t)) })
        ] }, a.id);
      }),
      list.length === 0 && /* @__PURE__ */ jsx("div", { className: "ff-nomatch", children: "\u6CA1\u6709\u5339\u914D\u7684\u5E94\u7528\u3002" })
    ] })
  ] }) });
}

// src/AppDetail.tsx
import { useEffect, useState as useState2 } from "react";

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
var import_forge_core = __toESM(require_forge_core());
var fcore = import_forge_core.default;
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res?.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r.value ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function loadApps() {
  const raw = await kvGet(fcore.K.INDEX);
  return fcore.sanitizeIndex(raw);
}
async function commitApp(entry, id) {
  const remote = await loadApps();
  const merged = entry ? fcore.upsertIndex(remote, entry) : fcore.removeIndex(remote, id);
  await kvSet(fcore.K.INDEX, merged);
}
async function loadSettings() {
  const raw = await kvGet(fcore.K.SETTINGS);
  return fcore.sanitizeSettings(raw);
}
async function saveSettings(s) {
  await kvSet(fcore.K.SETTINGS, fcore.sanitizeSettings(s));
}
async function markPushed(app) {
  await commitApp({ ...app, pushedAt: Date.now() }, app.id);
}
async function loadVersionSource(app, v) {
  const ver = app.versions.find((x) => x.v === v);
  if (!ver) return { error: `\u7248\u672C v${v} \u4E0D\u5B58\u5728\u3002` };
  const parts = [];
  const maxParts = Math.ceil(fcore.LIMITS.MAX_SOURCE_BYTES / fcore.LIMITS.CHUNK_CHARS) + 2;
  for (let i = 0; i < maxParts; i++) {
    const p = await kvGet(fcore.K.verPart(app.id, v, i));
    if (p === null || p === void 0) break;
    parts.push(p);
  }
  const html = fcore.assembleParts(parts);
  if (html === null) return { error: `\u7248\u672C v${v} \u6E90\u7801\u5757\u635F\u574F\u3002` };
  const actual = await sha256Hex(html);
  if (actual !== ver.sha256) return { error: `\u7248\u672C v${v} \u5B8C\u6574\u6027\u6821\u9A8C\u5931\u8D25\uFF08sha256 \u4E0D\u7B26\uFF09\uFF0C\u6570\u636E\u53EF\u80FD\u88AB\u5916\u90E8\u6539\u52A8\u3002` };
  return { html, ver };
}
async function loadScores(appId) {
  const raw = await kvGet(fcore.K.score(appId));
  return fcore.sanitizeScores(raw);
}
async function addScore(appId, entry) {
  const list = await loadScores(appId);
  const next = fcore.sanitizeScores([...list, { score: entry.score, player: entry.player, device: entry.device, ts: entry.ts || Date.now() }]);
  await kvSet(fcore.K.score(appId), next);
}
async function clearScores(appId) {
  await kvDel(fcore.K.score(appId));
}
async function rollbackApp(app, vOld) {
  const built = fcore.rollbackVersion(app, vOld, Date.now());
  if ("error" in built) throw new Error(built.error);
  const vNew = built.version.v;
  const maxParts = Math.ceil(fcore.LIMITS.MAX_SOURCE_BYTES / fcore.LIMITS.CHUNK_CHARS) + 2;
  for (let i = 0; i < maxParts; i++) {
    const p = await kvGet(fcore.K.verPart(app.id, vOld, i));
    if (p === null || p === void 0) break;
    await kvSet(fcore.K.verPart(app.id, vNew, i), p);
  }
  await commitApp(built.app, app.id);
  return { app: built.app, version: built.version };
}
async function deleteApp(app) {
  const maxParts = Math.ceil(fcore.LIMITS.MAX_SOURCE_BYTES / fcore.LIMITS.CHUNK_CHARS) + 2;
  for (const ver of app.versions) {
    for (let i = 0; i < maxParts; i++) {
      const p = await kvGet(fcore.K.verPart(app.id, ver.v, i));
      if (p === null || p === void 0) break;
      await kvDel(fcore.K.verPart(app.id, ver.v, i));
    }
  }
  await kvDel(fcore.K.score(app.id));
  await commitApp(null, app.id);
}

// src/AppDetail.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function fmtTime2(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtSize2(n) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;
}
function AppDetail(props) {
  const { app, scores, busy, notify, onChanged, onRun, onClose } = props;
  const [source, setSource] = useState2(null);
  const [srcLoading, setSrcLoading] = useState2(false);
  const [confirmDel, setConfirmDel] = useState2(false);
  const [confirmClear, setConfirmClear] = useState2(false);
  const [rbVer, setRbVer] = useState2(null);
  useEffect(() => {
    setSource(null);
    setConfirmDel(false);
    setConfirmClear(false);
    setRbVer(null);
  }, [app.id, app.head]);
  const toggleSource = async (v) => {
    if (source && source.v === v) {
      setSource(null);
      return;
    }
    setSrcLoading(true);
    try {
      const r = await loadVersionSource(app, v);
      if ("error" in r) notify({ text: r.error, bad: true });
      else setSource({ v, html: r.html });
    } catch (e) {
      notify({ text: `\u6E90\u7801\u8BFB\u53D6\u5931\u8D25\uFF1A${e.message}`, bad: true });
    } finally {
      setSrcLoading(false);
    }
  };
  const exportHtml = async (v) => {
    try {
      const r = await loadVersionSource(app, v);
      if ("error" in r) {
        notify({ text: r.error, bad: true });
        return;
      }
      const blob = new Blob([r.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${app.title.replace(/[\\/:*?"<>|]/g, "_")}-v${v}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4e3);
      notify({ text: `\u5DF2\u5BFC\u51FA v${v} \u5355\u6587\u4EF6 HTML\uFF08\u53CC\u51FB\u5373\u53EF\u5728\u6D4F\u89C8\u5668\u6253\u5F00\uFF09` });
    } catch (e) {
      notify({ text: `\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  };
  const doRollback = async (v) => {
    try {
      const r = await rollbackApp(app, v);
      await onChanged();
      notify({ text: `\u5DF2\u56DE\u9000\uFF1Av${v} \u590D\u5236\u4E3A\u65B0\u7248\u672C v${r.version.v}\uFF08\u5386\u53F2\u539F\u6837\u4FDD\u7559\uFF09` });
    } catch (e) {
      notify({ text: `\u56DE\u9000\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  };
  const doDelete = async () => {
    try {
      await deleteApp(app);
      await onChanged();
      notify({ text: `\u300A${app.title}\u300B\u5DF2\u5220\u9664\uFF08\u5168\u90E8\u7248\u672C\u4E0E\u6210\u7EE9\uFF09` });
      onClose();
    } catch (e) {
      notify({ text: `\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  };
  const doClear = async () => {
    try {
      await clearScores(app.id);
      await onChanged();
      notify({ text: "\u6210\u7EE9\u5DF2\u6E05\u7A7A" });
    } catch (e) {
      notify({ text: `\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  };
  const doPush = async () => {
    try {
      await markPushed(app);
      await onChanged();
      notify({ text: "\u5DF2\u63A8\u9001\u5230\u624B\u673A\uFF1A\u624B\u673A\u7AEF\u5E94\u7528\u67B6\u9876\u90E8\u300C\u65B0\u9020\u597D\u300D\u6253\u5F00\u5373\u73A9" });
    } catch (e) {
      notify({ text: `\u63A8\u9001\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  };
  const head = app.versions[app.versions.length - 1];
  return /* @__PURE__ */ jsxs2("div", { className: "ff-detail", children: [
    /* @__PURE__ */ jsxs2("div", { className: "ff-detail-head", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("div", { className: "ff-detail-title", children: app.title }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-detail-meta", children: [
          app.kind === "game" ? "\u{1F3AE} \u6E38\u620F" : app.kind === "tool" ? "\u{1F6E0}\uFE0F \u5DE5\u5177" : "\u{1F393} \u6559\u5177",
          " \xB7 ",
          "v",
          app.head,
          "\uFF08\u5171 ",
          app.versions.length,
          " \u7248\uFF09 \xB7 ",
          fmtSize2(app.size),
          " \xB7 ",
          "\u521B\u5EFA ",
          fmtTime2(app.createdAt)
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ff-detail-actions", children: [
        /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-primary", disabled: busy, onClick: onRun, children: "\u25B6 \u8FD0\u884C" }),
        /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn", disabled: busy, onClick: doPush, children: "\u{1F4F1} \u63A8\u9001\u5230\u624B\u673A" }),
        /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-ghost", onClick: onClose, children: "\u5173\u95ED" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ff-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "ff-section-title", children: "\u7248\u672C\u65F6\u95F4\u7EBF\uFF08\u53EA\u589E\u4E0D\u6539\uFF1B\u56DE\u9000=\u590D\u5236\u4E3A\u65B0\u7248\u672C\uFF09" }),
      /* @__PURE__ */ jsx2("div", { className: "ff-versions", children: [...app.versions].reverse().map((v) => /* @__PURE__ */ jsxs2("div", { className: `ff-ver${v.v === app.head ? " ff-ver-head" : ""}`, children: [
        /* @__PURE__ */ jsxs2("div", { className: "ff-ver-line", children: [
          /* @__PURE__ */ jsxs2("span", { className: "ff-ver-no", children: [
            "v",
            v.v
          ] }),
          v.v === app.head && /* @__PURE__ */ jsx2("span", { className: "ff-badge-cur", children: "\u5F53\u524D" }),
          v.warns > 0 && /* @__PURE__ */ jsxs2("span", { className: "ff-badge-warn", children: [
            "\u626B\u63CF\u63D0\u9192\xD7",
            v.warns
          ] }),
          /* @__PURE__ */ jsxs2("span", { className: "ff-ver-meta", children: [
            fmtSize2(v.size),
            " \xB7 ",
            fmtTime2(v.createdAt)
          ] })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "ff-ver-log", children: v.changelog || "\uFF08\u65E0\u8BF4\u660E\uFF09" }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-ver-ops", children: [
          /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm", onClick: () => void toggleSource(v.v), children: source && source.v === v.v ? "\u6536\u8D77\u6E90\u7801" : "\u67E5\u770B\u6E90\u7801" }),
          /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm", onClick: () => void exportHtml(v.v), children: "\u5BFC\u51FA .html" }),
          v.v !== app.head && (rbVer === v.v ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
            /* @__PURE__ */ jsxs2("button", { type: "button", className: "ff-btn ff-btn-sm ff-btn-danger", disabled: busy, onClick: () => void doRollback(v.v), children: [
              "\u786E\u8BA4\u56DE\u9000\u5230 v",
              v.v
            ] }),
            /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm ff-btn-ghost", onClick: () => setRbVer(null), children: "\u53D6\u6D88" })
          ] }) : /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm", disabled: busy, onClick: () => setRbVer(v.v), children: "\u56DE\u9000\u5230\u6B64\u7248" }))
        ] }),
        source && source.v === v.v && (srcLoading ? /* @__PURE__ */ jsx2("div", { className: "ff-src-loading", children: "\u88C5\u8F7D\u4E2D\u2026" }) : /* @__PURE__ */ jsxs2("div", { className: "ff-src-wrap", children: [
          /* @__PURE__ */ jsx2("pre", { className: "ff-src", children: source.html }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              className: "ff-btn ff-btn-sm",
              onClick: () => {
                void navigator.clipboard?.writeText(source.html);
                notify({ text: "\u6E90\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F" });
              },
              children: "\u590D\u5236\u5168\u90E8"
            }
          )
        ] }))
      ] }, v.v)) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ff-section", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ff-section-title", children: [
        "\u9AD8\u5206\u699C",
        confirmClear ? /* @__PURE__ */ jsxs2("span", { className: "ff-confirm-inline", children: [
          "\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u6210\u7EE9\uFF1F",
          /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm ff-btn-danger", disabled: busy, onClick: () => void doClear(), children: "\u786E\u8BA4\u6E05\u7A7A" }),
          /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm ff-btn-ghost", onClick: () => setConfirmClear(false), children: "\u53D6\u6D88" })
        ] }) : scores.length > 0 && /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-sm ff-btn-ghost", onClick: () => setConfirmClear(true), children: "\u6E05\u7A7A\u6210\u7EE9" })
      ] }),
      scores.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "ff-dim", children: "\u8FD8\u6CA1\u6709\u6210\u7EE9\u2014\u2014\u8FD0\u884C\u5E94\u7528\u73A9\u4E00\u5C40\uFF08\u6E38\u620F\u7ED3\u675F\u65F6\u81EA\u52A8\u4E0A\u62A5\uFF09\u3002" }) : /* @__PURE__ */ jsx2("ol", { className: "ff-scores", children: [...scores].sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, 20).map((s, i) => /* @__PURE__ */ jsxs2("li", { children: [
        /* @__PURE__ */ jsx2("span", { className: "ff-score-rank", children: i + 1 }),
        /* @__PURE__ */ jsx2("span", { className: "ff-score-val", children: s.score }),
        /* @__PURE__ */ jsxs2("span", { className: "ff-score-player", children: [
          s.player || "\u533F\u540D",
          s.device ? `\uFF08${s.device}\uFF09` : ""
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "ff-score-time", children: fmtTime2(s.ts) })
      ] }, `${s.ts}-${i}`)) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "ff-section ff-danger-zone", children: [
      /* @__PURE__ */ jsx2("div", { className: "ff-section-title", children: "\u5371\u9669\u533A" }),
      head && /* @__PURE__ */ jsxs2("div", { className: "ff-dim", children: [
        "\u5220\u9664\u300A",
        app.title,
        "\u300B\u5C06\u79FB\u9664\u5168\u90E8 ",
        app.versions.length,
        " \u4E2A\u7248\u672C\u4E0E\u6210\u7EE9\uFF0C\u4E0D\u53EF\u6062\u590D\u3002\u53EF\u5148\u5BFC\u51FA .html \u7559\u5E95\u3002"
      ] }),
      confirmDel ? /* @__PURE__ */ jsxs2("div", { className: "ff-confirm-row", children: [
        /* @__PURE__ */ jsxs2("button", { type: "button", className: "ff-btn ff-btn-danger", disabled: busy, onClick: () => void doDelete(), children: [
          "\u786E\u8BA4\u5220\u9664\u300A",
          app.title,
          "\u300B"
        ] }),
        /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-ghost", onClick: () => setConfirmDel(false), children: "\u53D6\u6D88" })
      ] }) : /* @__PURE__ */ jsx2("button", { type: "button", className: "ff-btn ff-btn-danger", onClick: () => setConfirmDel(true), children: "\u5220\u9664\u5E94\u7528" })
    ] })
  ] });
}

// src/AppRunner.tsx
import { useEffect as useEffect2, useMemo as useMemo2, useRef, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function AppRunner(props) {
  const { app, html, best, onClose, onScore } = props;
  const frameRef = useRef(null);
  const [record, setRecord] = useState3(null);
  const srcdoc = useMemo2(() => html, [html]);
  useEffect2(() => {
    function onMessage(ev) {
      const frame = frameRef.current;
      if (!frame || ev.source !== frame.contentWindow) return;
      const d = ev.data;
      if (!d || d.__ff !== 1 || d.type !== "score") return;
      const score = Number(d.score);
      if (!Number.isFinite(score)) return;
      onScore(score);
      if (best === null || score > best) setRecord(score);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [best, onScore]);
  useEffect2(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ jsxs3("div", { className: "ff-runner", children: [
    /* @__PURE__ */ jsxs3("div", { className: "ff-runner-bar", children: [
      /* @__PURE__ */ jsx3("span", { className: "ff-runner-title", children: app.title }),
      /* @__PURE__ */ jsxs3("span", { className: "ff-runner-meta", children: [
        "v",
        app.head,
        " \xB7 \u6C99\u7BB1\u8FD0\u884C \xB7 \u6210\u7EE9\u81EA\u52A8\u4E0A\u699C"
      ] }),
      record !== null && /* @__PURE__ */ jsxs3("span", { className: "ff-record", children: [
        "\u{1F389} \u65B0\u7EAA\u5F55 ",
        record
      ] }),
      best !== null && record === null && /* @__PURE__ */ jsxs3("span", { className: "ff-runner-best", children: [
        "\u5F53\u524D\u6700\u9AD8 ",
        best
      ] }),
      /* @__PURE__ */ jsx3("button", { type: "button", className: "ff-btn ff-btn-ghost", onClick: onClose, children: "\u5173\u95ED \u2715" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ff-runner-stage", children: /* @__PURE__ */ jsx3(
      "iframe",
      {
        ref: frameRef,
        title: `flashforge-app-${app.id}`,
        className: "ff-runner-frame",
        sandbox: "allow-scripts allow-pointer-lock",
        srcDoc: srcdoc,
        allow: "autoplay"
      }
    ) })
  ] });
}

// src/Settings.tsx
import { useEffect as useEffect3, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsView(props) {
  const { settings, onSaved, notify } = props;
  const [nickname, setNickname] = useState4(settings.nickname);
  const [deviceName, setDeviceName] = useState4(settings.deviceName);
  useEffect3(() => {
    setNickname(settings.nickname);
    setDeviceName(settings.deviceName);
  }, [settings.nickname, settings.deviceName]);
  const save = async () => {
    const next = { nickname: nickname.trim().slice(0, 24), deviceName: deviceName.trim().slice(0, 24) };
    try {
      await saveSettings(next);
      onSaved(next);
      notify({ text: "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u8DE8\u7AEF\u540C\u6B65\uFF09" });
    } catch (e) {
      notify({ text: `\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "ff-settings", children: [
    /* @__PURE__ */ jsxs4("label", { className: "ff-field", children: [
      /* @__PURE__ */ jsx4("span", { className: "ff-field-label", children: "\u4E0A\u699C\u6635\u79F0" }),
      /* @__PURE__ */ jsx4(
        "input",
        {
          className: "ff-input",
          value: nickname,
          maxLength: 24,
          placeholder: "\u5982\uFF1A\u8001\u7238 / \u5C0F\u660E\uFF08\u7559\u7A7A=\u533F\u540D\uFF09",
          onChange: (e) => setNickname(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("label", { className: "ff-field", children: [
      /* @__PURE__ */ jsx4("span", { className: "ff-field-label", children: "\u8BBE\u5907\u540D" }),
      /* @__PURE__ */ jsx4(
        "input",
        {
          className: "ff-input",
          value: deviceName,
          maxLength: 24,
          placeholder: "\u5982\uFF1A\u4E66\u623F\u7535\u8111 / iPad\uFF08\u7559\u7A7A=\u81EA\u52A8\uFF1A\u684C\u9762/\u624B\u673A\uFF09",
          onChange: (e) => setDeviceName(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsx4("button", { type: "button", className: "ff-btn ff-btn-primary", onClick: () => void save(), children: "\u4FDD\u5B58\u8BBE\u7F6E" }),
    /* @__PURE__ */ jsx4("div", { className: "ff-dim ff-settings-note", children: "\u6210\u7EE9\u534F\u8BAE\uFF1A\u6C99\u7BB1\u5185\u5E94\u7528\u5728\u6E38\u620F\u7ED3\u675F\u65F6\u7ECF postMessage \u4E0A\u62A5\uFF0C\u9762\u677F\u6821\u9A8C\u6765\u6E90\u540E\u5199\u5165\u672C\u673A\u6570\u636E\u6839\uFF1B \u684C\u9762\u4E0E\u624B\u673A\u6253\u5F00\u7684\u662F\u540C\u4E00\u672C\u5E94\u7528\u82B1\u56ED\uFF08cap.kv\uFF09\uFF0C\u9AD8\u5206\u699C\u81EA\u7136\u540C\u699C\u3002" })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var IS_MOBILE = /Android|iPhone|iPad|Mobile/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
function FlashForgePanel(props) {
  const { onSendToChat } = props;
  const [tab, setTab] = useState5("grid");
  const [apps, setApps] = useState5([]);
  const [scores, setScores] = useState5({});
  const [settings, setSettings] = useState5({ nickname: "", deviceName: "" });
  const [detailId, setDetailId] = useState5(null);
  const [runner, setRunner] = useState5(null);
  const [busy, setBusy] = useState5(false);
  const [bootError, setBootError] = useState5(null);
  const [toasts, setToasts] = useState5([]);
  const toastSeq = useRef2(1);
  const notify = useCallback((n) => {
    const id = toastSeq.current++;
    setToasts((t) => [...t.slice(-2), { id, text: n.text, bad: n.bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), n.bad ? 4200 : 2800);
  }, []);
  const refreshApps = useCallback(async () => {
    try {
      const list = await loadApps();
      setApps(list);
      setBootError(null);
    } catch (e) {
      setBootError(e.message);
    }
  }, []);
  const refreshScores = useCallback(async () => {
    try {
      const list = await loadApps();
      const next = {};
      for (const a of list) {
        next[a.id] = await loadScores(a.id);
      }
      setScores(next);
    } catch {
    }
  }, []);
  useEffect4(() => {
    void refreshApps();
    void loadSettings().then(setSettings).catch(() => {
    });
    void refreshScores();
    const t1 = setInterval(() => {
      if (document.visibilityState === "visible") void refreshApps();
    }, 6e3);
    const t2 = setInterval(() => {
      if (document.visibilityState === "visible") void refreshScores();
    }, 3e4);
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void refreshApps();
      void refreshScores();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshApps, refreshScores]);
  const detailApp = detailId ? apps.find((a) => a.id === detailId) || null : null;
  const openRunner = useCallback(async (app) => {
    setBusy(true);
    try {
      const r = await loadVersionSource(app, app.head);
      if ("error" in r) notify({ text: r.error, bad: true });
      else {
        setRunner({ app, html: r.html });
        setDetailId(null);
      }
    } catch (e) {
      notify({ text: `\u88C5\u8F7D\u5931\u8D25\uFF1A${e.message}`, bad: true });
    } finally {
      setBusy(false);
    }
  }, [notify]);
  const handleScore = useCallback(async (score) => {
    if (!runner) return;
    const device = settings.deviceName || (IS_MOBILE ? "\u624B\u673A" : "\u684C\u9762");
    const player = settings.nickname || "\u533F\u540D";
    try {
      await addScore(runner.app.id, { score, player, device });
      setScores((s) => ({
        ...s,
        [runner.app.id]: [...s[runner.app.id] || [], { score, player, device, ts: Date.now() }]
      }));
      notify({ text: `\u6210\u7EE9 ${score} \u5DF2\u4E0A\u699C\uFF08${player} \xB7 ${device}\uFF09` });
    } catch (e) {
      notify({ text: `\u6210\u7EE9\u4E0A\u62A5\u5931\u8D25\uFF1A${e.message}`, bad: true });
    }
  }, [runner, settings, notify]);
  const onChanged = useCallback(async () => {
    await refreshApps();
    void refreshScores();
  }, [refreshApps, refreshScores]);
  const bestOf = useCallback((id) => {
    const list = scores[id];
    if (!list || !list.length) return null;
    return list.reduce((m, s) => s.score > m ? s.score : m, list[0].score);
  }, [scores]);
  const quickPrompt = useCallback((text) => {
    if (onSendToChat) void onSendToChat(text);
    else notify({ text: "\u8BF7\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\uFF1A" + text });
  }, [onSendToChat, notify]);
  return /* @__PURE__ */ jsxs5("div", { className: "ff-root", children: [
    /* @__PURE__ */ jsx5("style", { children: CSS }),
    /* @__PURE__ */ jsxs5("div", { className: "ff-header", children: [
      /* @__PURE__ */ jsx5("div", { className: "ff-header-title", children: "\u2692\uFE0F \u95EA\u9020\u5E94\u7528\u4F5C\u574A" }),
      /* @__PURE__ */ jsxs5("div", { className: "ff-header-tabs", children: [
        /* @__PURE__ */ jsx5("button", { type: "button", className: `ff-tab${tab === "grid" ? " ff-tab-on" : ""}`, onClick: () => setTab("grid"), children: "\u5E94\u7528\u67B6" }),
        /* @__PURE__ */ jsx5("button", { type: "button", className: `ff-tab${tab === "settings" ? " ff-tab-on" : ""}`, onClick: () => setTab("settings"), children: "\u8BBE\u7F6E" })
      ] })
    ] }),
    bootError && /* @__PURE__ */ jsxs5("div", { className: "ff-boot-error", children: [
      "\u6570\u636E\u9762\u4E0D\u53EF\u7528\uFF1A",
      bootError,
      "\uFF08\u8BF7\u786E\u8BA4 Polaris \u4E3B\u5E94\u7528\u5728\u8FD0\u884C\u4E14\u4E3A\u8F83\u65B0\u7248\u672C\uFF09"
    ] }),
    tab === "grid" && /* @__PURE__ */ jsx5(AppGrid, { apps, bestScores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.length ? v.reduce((m, s) => s.score > m ? s.score : m, v[0].score) : null])), onOpen: setDetailId, onQuickPrompt: quickPrompt }),
    tab === "settings" && /* @__PURE__ */ jsx5(SettingsView, { settings, onSaved: setSettings, notify }),
    detailApp && /* @__PURE__ */ jsx5(
      AppDetail,
      {
        app: detailApp,
        scores: scores[detailApp.id] || [],
        busy,
        notify,
        onChanged,
        onRun: () => void openRunner(detailApp),
        onClose: () => setDetailId(null)
      }
    ),
    runner && /* @__PURE__ */ jsx5(
      AppRunner,
      {
        app: runner.app,
        html: runner.html,
        best: bestOf(runner.app.id),
        onClose: () => setRunner(null),
        onScore: (s) => void handleScore(s)
      }
    ),
    /* @__PURE__ */ jsx5("div", { className: "ff-toasts", children: toasts.map((t) => /* @__PURE__ */ jsx5("div", { className: `ff-toast${t.bad ? " ff-toast-bad" : ""}`, children: t.text }, t.id)) })
  ] });
}
var CSS = `
.ff-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: #10141c; color: #e6eaf2; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 13px; overflow: hidden; }
.ff-root * { box-sizing: border-box; }
.ff-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #232a38; flex: 0 0 auto; }
.ff-header-title { font-weight: 700; font-size: 14px; }
.ff-header-tabs { display: flex; gap: 4px; }
.ff-tab { background: transparent; border: 1px solid transparent; color: #93a0b4; padding: 4px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; }
.ff-tab-on { color: #e6eaf2; background: #1c2432; border-color: #2c3648; }
.ff-boot-error { margin: 10px 14px; padding: 8px 12px; border: 1px solid #5b2a2e; background: #2a1618; color: #f0b6ba; border-radius: 8px; }
.ff-grid-wrap { flex: 1; overflow: auto; padding: 12px 14px 24px; }
.ff-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.ff-search { flex: 1 1 160px; max-width: 280px; background: #171d29; border: 1px solid #2c3648; color: #e6eaf2; border-radius: 8px; padding: 6px 10px; outline: none; }
.ff-search:focus { border-color: #3d5a8a; }
.ff-kinds { display: flex; gap: 6px; }
.ff-chip { background: #171d29; border: 1px solid #2c3648; color: #93a0b4; border-radius: 999px; padding: 4px 12px; cursor: pointer; font-size: 12px; }
.ff-chip-on { color: #10141c; background: #7fb2ff; border-color: #7fb2ff; font-weight: 600; }
.ff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.ff-card { text-align: left; background: #171d29; border: 1px solid #242e40; border-radius: 12px; padding: 12px; cursor: pointer; color: #e6eaf2; transition: border-color .15s, transform .15s; display: flex; flex-direction: column; gap: 6px; }
.ff-card:hover { border-color: #3d5a8a; transform: translateY(-1px); }
.ff-card-top { display: flex; align-items: center; justify-content: space-between; }
.ff-card-icon { font-size: 20px; }
.ff-badge-new { background: #274a2d; color: #9fe0a9; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
.ff-card-title { font-weight: 600; font-size: 13px; }
.ff-card-meta { color: #93a0b4; font-size: 11px; }
.ff-card-dim { color: #5d6b80; }
.ff-card-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.ff-tag { background: #1f2836; border-radius: 999px; padding: 1px 8px; font-size: 10px; color: #93a0b4; }
.ff-nomatch { color: #5d6b80; padding: 20px 0; }
.ff-empty { max-width: 520px; margin: 8vh auto 0; text-align: center; display: flex; flex-direction: column; gap: 12px; padding: 0 16px; }
.ff-empty-icon { font-size: 40px; }
.ff-empty-title { font-size: 16px; font-weight: 700; }
.ff-empty-sub { color: #93a0b4; line-height: 1.6; }
.ff-empty-prompts { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.ff-prompt { text-align: left; }
.ff-btn { background: #1c2432; border: 1px solid #2c3648; color: #e6eaf2; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.ff-btn:hover { border-color: #3d5a8a; }
.ff-btn:disabled { opacity: .5; cursor: default; }
.ff-btn-primary { background: #2f66c4; border-color: #2f66c4; color: #fff; font-weight: 600; }
.ff-btn-danger { background: #5b2a2e; border-color: #7c3a40; color: #f0b6ba; }
.ff-btn-ghost { background: transparent; }
.ff-btn-sm { padding: 3px 9px; font-size: 11px; }
.ff-detail { position: absolute; inset: 0; background: #10141c; overflow: auto; padding: 14px 16px 30px; }
.ff-detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 14px; }
.ff-detail-title { font-size: 17px; font-weight: 700; }
.ff-detail-meta { color: #93a0b4; margin-top: 4px; }
.ff-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ff-section { margin-bottom: 18px; }
.ff-section-title { font-weight: 700; font-size: 12px; color: #93a0b4; letter-spacing: .4px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
.ff-confirm-inline { display: inline-flex; gap: 8px; align-items: center; color: #f0b6ba; font-weight: 400; }
.ff-versions { display: flex; flex-direction: column; gap: 8px; }
.ff-ver { border: 1px solid #242e40; border-radius: 10px; padding: 10px 12px; background: #141a25; }
.ff-ver-head { border-color: #2f66c4; }
.ff-ver-line { display: flex; align-items: center; gap: 8px; }
.ff-ver-no { font-weight: 700; color: #7fb2ff; }
.ff-badge-cur { background: #1d3a68; color: #9cc3ff; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.ff-badge-warn { background: #4a3a1d; color: #e8c983; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.ff-ver-meta { color: #5d6b80; font-size: 11px; margin-left: auto; }
.ff-ver-log { color: #b9c3d4; margin: 6px 0; }
.ff-ver-ops { display: flex; gap: 6px; flex-wrap: wrap; }
.ff-src-wrap { margin-top: 8px; }
.ff-src { max-height: 260px; overflow: auto; background: #0c1017; border: 1px solid #232a38; border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; color: #b9c3d4; margin: 0 0 6px; }
.ff-src-loading { color: #5d6b80; padding: 8px 0; }
.ff-scores { margin: 0; padding: 0 0 0 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ff-scores li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #141a25; border: 1px solid #202939; border-radius: 8px; }
.ff-score-rank { width: 20px; color: #5d6b80; font-weight: 700; }
.ff-score-val { font-weight: 700; color: #ffd479; min-width: 56px; }
.ff-score-player { flex: 1; }
.ff-score-time { color: #5d6b80; font-size: 11px; }
.ff-danger-zone { border-top: 1px dashed #3a2a2d; padding-top: 12px; }
.ff-confirm-row { display: flex; gap: 8px; margin-top: 8px; }
.ff-dim { color: #5d6b80; }
.ff-settings { max-width: 420px; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; }
.ff-field { display: flex; flex-direction: column; gap: 6px; }
.ff-field-label { color: #93a0b4; font-size: 12px; }
.ff-input { background: #171d29; border: 1px solid #2c3648; color: #e6eaf2; border-radius: 8px; padding: 7px 10px; outline: none; }
.ff-input:focus { border-color: #3d5a8a; }
.ff-settings-note { line-height: 1.7; border-top: 1px solid #232a38; padding-top: 10px; }
.ff-runner { position: absolute; inset: 0; background: #0b0e14; display: flex; flex-direction: column; z-index: 30; }
.ff-runner-bar { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid #232a38; flex: 0 0 auto; }
.ff-runner-title { font-weight: 700; }
.ff-runner-meta { color: #5d6b80; font-size: 11px; }
.ff-runner-best, .ff-record { font-size: 12px; color: #ffd479; margin-left: auto; }
.ff-record { color: #9fe0a9; font-weight: 700; }
.ff-runner-bar .ff-btn-ghost { margin-left: 8px; }
.ff-runner-stage { flex: 1; position: relative; }
.ff-runner-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }
.ff-toasts { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 50; align-items: center; }
.ff-toast { background: #1c2432; border: 1px solid #2c3648; padding: 7px 14px; border-radius: 10px; font-size: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.4); max-width: 80vw; }
.ff-toast-bad { background: #2a1618; border-color: #5b2a2e; color: #f0b6ba; }
@media (max-width: 640px) {
  .ff-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .ff-detail-actions { width: 100%; }
  .ff-runner-bar { flex-wrap: wrap; }
}
`;

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function FlashForgeEntry(props) {
  return /* @__PURE__ */ jsx6(FlashForgePanel, { ...props });
}
export {
  FlashForgeEntry as default
};
