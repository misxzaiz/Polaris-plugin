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

// shared/pond-core.js
var require_pond_core = __commonJS({
  "shared/pond-core.js"(exports, module) {
    "use strict";
    var K2 = {
      idea: (id) => `lingxi.idea.${id}`,
      ideaPrefix: "lingxi.idea.",
      settings: "lingxi.settings"
    };
    var KINDS3 = [
      { key: "idea", label: "\u70B9\u5B50", desc: "\u60F3\u505A\u7684\u4E1C\u897F / \u529F\u80FD / \u9879\u76EE" },
      { key: "problem", label: "\u95EE\u9898", desc: "\u5F85\u89E3\u51B3\u7684\u7591\u95EE / \u75DB\u70B9" },
      { key: "resource", label: "\u7D20\u6750", desc: "\u503C\u5F97\u7559\u7528\u7684\u7EBF\u7D22 / \u5F15\u7528 / \u94FE\u63A5" },
      { key: "observation", label: "\u89C2\u5BDF", desc: "\u73B0\u8C61 / \u6D1E\u5BDF / \u968F\u60F3" }
    ];
    var MATURITIES3 = [
      { key: "seed", label: "\u79CD\u5B50", desc: "\u53EA\u662F\u4E00\u4E2A\u5FF5\u5934" },
      { key: "sprout", label: "\u5AE9\u82BD", desc: "\u6709\u8FC7\u4E00\u6B21\u6DF1\u5316\uFF0C\u77E5\u9053\u5B83\u5728\u56DE\u7B54\u4EC0\u4E48" },
      { key: "sketch", label: "\u8F6E\u5ED3", desc: "\u6709\u4E86\u5F62\u6001\uFF1A\u5927\u81F4\u600E\u4E48\u505A\u3001\u505A\u7ED9\u8C01" },
      { key: "plan", label: "\u84DD\u56FE", desc: "\u53EF\u6267\u884C\uFF1A\u6B65\u9AA4/\u6210\u672C/\u9A8C\u6536\u6E05\u695A" },
      { key: "done", label: "\u843D\u5730", desc: "\u5DF2\u52A8\u624B\u6216\u5DF2\u5B9E\u73B0" }
    ];
    var REVISIT_BASE_DAYS3 = 3;
    var REVISIT_MAX_DAYS = 60;
    var LIMITS = { title: 60, raw: 2e3, tags: 6, tagLen: 16, timeline: 40, revisitHistory: 30, links: 20 };
    var DEFAULT_SETTINGS = { schemaVersion: 1 };
    function makeId(now) {
      const t = typeof now === "number" ? now : Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return "i" + t.toString(36) + rand;
    }
    var DAY_MS = 24 * 3600 * 1e3;
    function fmtDay3(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function fmtDateTime3(ts) {
      const d = new Date(ts);
      return `${fmtDay3(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    function fmtDueRelative3(dueAt, now) {
      const diff = dueAt - now;
      const days = Math.round(diff / DAY_MS);
      if (days >= 1) return `${days} \u5929\u540E`;
      if (days <= -1) return `\u903E\u671F ${Math.abs(days)} \u5929`;
      return diff >= 0 ? "\u4ECA\u5929\u665A\u4E9B" : "\u4ECA\u5929\uFF08\u5DF2\u5230\u671F\uFF09";
    }
    function hashStr(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    function cleanTags(raw) {
      const out = [];
      for (const t of Array.isArray(raw) ? raw : []) {
        const s = String(t || "").trim().slice(0, LIMITS.tagLen);
        if (s && !out.includes(s)) out.push(s);
        if (out.length >= LIMITS.tags) break;
      }
      return out;
    }
    function normalizeIdea2(input) {
      if (!input || typeof input !== "object") return { error: "\u7F3A\u5C11\u60F3\u6CD5\u6570\u636E" };
      const title = String(input.title || "").trim().slice(0, LIMITS.title);
      if (!title) return { error: "\u60F3\u6CD5\u9700\u8981\u4E00\u4E2A\u6807\u9898\uFF08\u4E00\u53E5\u8BDD\u6982\u62EC\u5373\u53EF\uFF09" };
      const now = Number.isFinite(Number(input.now)) && Number(input.now) > 0 ? Number(input.now) : Date.now();
      const kind = KINDS3.some((k) => k.key === input.kind) ? input.kind : "idea";
      const raw = String(input.raw || "").trim().slice(0, LIMITS.raw);
      const url = typeof input.url === "string" && /^https?:\/\//.test(input.url) ? input.url.slice(0, 500) : void 0;
      const idea = {
        id: typeof input.id === "string" && input.id ? input.id.slice(0, 40) : makeId(now),
        title,
        raw,
        kind,
        tags: cleanTags(input.tags),
        maturity: 0,
        status: "active",
        origin: input.origin === "panel" || input.origin === "import" ? input.origin : "ai",
        url,
        links: [],
        createdAt: now,
        updatedAt: now,
        revisit: {
          dueAt: now + REVISIT_BASE_DAYS3 * DAY_MS,
          interval: REVISIT_BASE_DAYS3,
          history: []
        },
        timeline: [{ at: now, kind: "catch", text: raw ? "\u6355\u83B7\u5165\u6C60" : "\u6355\u83B7\u5165\u6C60\uFF08\u6682\u65E0\u6B63\u6587\uFF09" }]
      };
      return { idea };
    }
    function pushEvent(idea, kind, text, now) {
      idea.timeline = [{ at: now, kind, text: String(text || "").slice(0, 400) }, ...idea.timeline || []].slice(0, LIMITS.timeline);
      idea.updatedAt = now;
    }
    function deepenIdea3(idea, text, now) {
      const t = String(text || "").trim().slice(0, LIMITS.raw);
      if (!t) return { error: "\u6DF1\u5316\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" };
      if (!idea || idea.status !== "active") return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728\u6216\u4E0D\u5728\u6C60\u4E2D\uFF08active\uFF09" };
      pushEvent(idea, "deepen", t, now);
      idea.revisit.interval = Math.min(idea.revisit.interval * 2, REVISIT_MAX_DAYS);
      idea.revisit.dueAt = now + idea.revisit.interval * DAY_MS;
      idea.revisit.history = [{ at: now, outcome: "deepen" }, ...idea.revisit.history || []].slice(0, LIMITS.revisitHistory);
      return { idea };
    }
    function promoteIdea3(idea, now, note) {
      if (!idea) return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728" };
      if (idea.maturity >= 4) return { error: "\u5DF2\u5728\u300C\u843D\u5730\u300D\uFF0C\u65E0\u6CD5\u518D\u63A8\u8FDB" };
      if (idea.status !== "active") return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728\u6216\u4E0D\u5728\u6C60\u4E2D\uFF08active\uFF09" };
      idea.maturity += 1;
      if (idea.maturity >= 4) {
        idea.status = "done";
        idea.revisit = { dueAt: 0, interval: 0, history: idea.revisit.history || [] };
      } else {
        idea.revisit.interval = REVISIT_BASE_DAYS3;
        idea.revisit.dueAt = now + REVISIT_BASE_DAYS3 * DAY_MS;
      }
      pushEvent(idea, "promote", note ? `\u63A8\u8FDB\u81F3\u300C${MATURITIES3[idea.maturity].label}\u300D\uFF1A${note}` : `\u63A8\u8FDB\u81F3\u300C${MATURITIES3[idea.maturity].label}\u300D`, now);
      idea.revisit.history = [{ at: now, outcome: "promote" }, ...idea.revisit.history || []].slice(0, LIMITS.revisitHistory);
      return { idea };
    }
    function applyRevisitOutcome3(idea, outcome, now, note) {
      if (!idea) return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728" };
      if (idea.status !== "active") return { error: "\u8BE5\u60F3\u6CD5\u4E0D\u5728\u6C60\u4E2D\uFF08active\uFF09\uFF0C\u65E0\u9700\u56DE\u8BBF" };
      if (outcome === "deepen") return deepenIdea3(idea, note || "\uFF08\u56DE\u8BBF\u65F6\u6DF1\u5316\uFF0C\u672A\u7559\u5185\u5BB9\uFF09", now);
      if (outcome === "promote") return promoteIdea3(idea, now, note);
      if (outcome === "snooze") {
        idea.revisit.interval = Math.min(Math.max(idea.revisit.interval, REVISIT_BASE_DAYS3) * 2, REVISIT_MAX_DAYS);
        idea.revisit.dueAt = now + idea.revisit.interval * DAY_MS;
        idea.revisit.history = [{ at: now, outcome: "snooze" }, ...idea.revisit.history || []].slice(0, LIMITS.revisitHistory);
        pushEvent(idea, "revisit", note ? `\u518D\u7B49\u7B49\uFF1A${note}` : "\u56DE\u8BBF\uFF1A\u518D\u7B49\u7B49", now);
        return { idea };
      }
      if (outcome === "archive") return archiveIdea3(idea, now, note || "\u56DE\u8BBF\u65F6\u5F52\u6863");
      return { error: "\u672A\u77E5\u56DE\u8BBF\u7ED3\u679C\uFF08deepen / promote / snooze / archive\uFF09" };
    }
    function archiveIdea3(idea, now, note) {
      if (!idea) return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728" };
      if (idea.status === "archived") return { error: "\u5DF2\u5728\u5F52\u6863\u4E2D" };
      const wasActive = idea.status === "active";
      idea.status = "archived";
      if (wasActive) {
        idea.revisit = { dueAt: 0, interval: 0, history: idea.revisit.history || [] };
      }
      pushEvent(idea, "archive", note || "\u5F52\u6863\u6C89\u5BC2", now);
      return { idea };
    }
    function restoreIdea3(idea, now) {
      if (!idea) return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728" };
      if (idea.status !== "archived") return { error: "\u4EC5\u5F52\u6863\u4E2D\u7684\u60F3\u6CD5\u53EF\u6062\u590D" };
      idea.status = "active";
      if (idea.maturity < 4) {
        idea.revisit = { dueAt: now + REVISIT_BASE_DAYS3 * DAY_MS, interval: REVISIT_BASE_DAYS3, history: idea.revisit.history || [] };
      }
      pushEvent(idea, "restore", "\u4ECE\u5F52\u6863\u6062\u590D\u5165\u6C60", now);
      return { idea };
    }
    function retitleIdea3(idea, title, now) {
      const t = String(title || "").trim().slice(0, LIMITS.title);
      if (!t) return { error: "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A" };
      if (!idea) return { error: "\u60F3\u6CD5\u4E0D\u5B58\u5728" };
      idea.title = t;
      pushEvent(idea, "edit", `\u6539\u9898\uFF1A${t}`, now);
      return { idea };
    }
    function tokenize(text) {
      const map = /* @__PURE__ */ new Map();
      const add = (t) => map.set(t, (map.get(t) || 0) + 1);
      const s = String(text || "");
      const re = /[\u4e00-\u9fff]+|[a-zA-Z0-9][a-zA-Z0-9_+#.-]*/g;
      let m;
      while (m = re.exec(s)) {
        const seg = m[0];
        if (/^[\u4e00-\u9fff]/.test(seg)) {
          if (seg.length === 1) add(seg);
          else for (let i = 0; i < seg.length - 1; i++) add(seg.slice(i, i + 2));
        } else {
          add(seg.toLowerCase());
        }
      }
      return map;
    }
    function ideaTokens(idea) {
      const acc = /* @__PURE__ */ new Map();
      const bump = (text, w) => {
        for (const [t, tf] of tokenize(text)) acc.set(t, (acc.get(t) || 0) + tf * w);
      };
      bump(idea.title, 3);
      bump((idea.tags || []).join(" "), 2);
      bump(idea.raw, 1);
      bump(idea.url || "", 0.5);
      return acc;
    }
    function findRelated2(target, corpus, n = 3) {
      if (!target || !Array.isArray(corpus) || corpus.length < 1) return [];
      const q = ideaTokens(target);
      if (!q.size) return [];
      const docs = corpus.map((idea) => ({ idea, toks: ideaTokens(idea) }));
      const N = docs.length;
      const df = /* @__PURE__ */ new Map();
      for (const d of docs) for (const t of d.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
      const scored = [];
      for (const d of docs) {
        let score = 0;
        let hits = 0;
        for (const [t, qtf] of q) {
          const dtf = d.toks.get(t);
          if (!dtf) continue;
          hits += 1;
          const idf = Math.log(1 + N / (df.get(t) || 1));
          score += idf * (dtf * (1.2 + 1) / (dtf + 1.2 * (0.25 + 0.75))) * Math.min(qtf, 3);
        }
        if (score > 0 && hits >= 2) scored.push({ idea: d.idea, score });
      }
      scored.sort((a, b) => b.score - a.score);
      if (!scored.length) return [];
      const top = scored[0].score;
      return scored.filter((s) => s.score >= Math.max(top * 0.35, 0.6)).slice(0, n);
    }
    function searchIdeas3(ideas, { keyword, tag, kind, status, minMaturity, maxMaturity } = {}) {
      const kw = keyword ? tokenize(String(keyword)) : null;
      return (ideas || []).filter((idea) => {
        if (status && idea.status !== status) return false;
        if (!status && kw === null && idea.status === "archived") return false;
        if (tag && !(idea.tags || []).includes(tag)) return false;
        if (kind && idea.kind !== kind) return false;
        if (Number.isFinite(Number(minMaturity)) && idea.maturity < Number(minMaturity)) return false;
        if (Number.isFinite(Number(maxMaturity)) && idea.maturity > Number(maxMaturity)) return false;
        if (kw && kw.size) {
          const toks = ideaTokens(idea);
          let hit = 0;
          for (const t of kw.keys()) if (toks.has(t)) hit += 1;
          if (!hit) return false;
        }
        return true;
      });
    }
    function dueRevisits3(ideas, now) {
      return (ideas || []).filter((i) => i && i.status === "active" && i.revisit && i.revisit.dueAt > 0 && i.revisit.dueAt <= now).sort((a, b) => a.revisit.dueAt - b.revisit.dueAt);
    }
    function nextRevisitAt3(ideas) {
      let min = null;
      for (const i of ideas || []) {
        if (i && i.status === "active" && i.revisit && i.revisit.dueAt > 0) {
          if (min === null || i.revisit.dueAt < min) min = i.revisit.dueAt;
        }
      }
      return min;
    }
    function primaryTagOf2(idea) {
      return idea.tags && idea.tags[0] || "\u672A\u5206\u57DF";
    }
    function clusterConstellations2(ideas, now) {
      const clusters = /* @__PURE__ */ new Map();
      for (const idea of ideas || []) {
        if (!idea) continue;
        if (idea.status === "archived") continue;
        const tag = primaryTagOf2(idea);
        let c = clusters.get(tag);
        if (!c) {
          c = { tag, ideas: [], byMaturity: [0, 0, 0, 0, 0], oldestAt: idea.createdAt, newestAt: idea.createdAt };
          clusters.set(tag, c);
        }
        c.ideas.push(idea);
        c.byMaturity[idea.maturity] += 1;
        if (idea.createdAt < c.oldestAt) c.oldestAt = idea.createdAt;
        if (idea.createdAt > c.newestAt) c.newestAt = idea.createdAt;
      }
      const list = [...clusters.values()].map((c) => ({
        tag: c.tag,
        count: c.ideas.length,
        byMaturity: c.byMaturity,
        matureCount: c.byMaturity.slice(2).reduce((s, x) => s + x, 0),
        oldestDays: Math.floor((now - c.oldestAt) / DAY_MS),
        ideaIds: c.ideas.map((i) => i.id)
      }));
      list.sort((a, b) => b.count - a.count || b.matureCount - a.matureCount);
      const mergeCandidates = list.filter((c) => c.count >= 3 && c.matureCount >= 2);
      return { clusters: list, mergeCandidates };
    }
    var TECHNIQUES2 = [
      { key: "force-join", name: "\u5F3A\u5236\u5AC1\u63A5", hint: "\u628A\u62BD\u4E2D\u7684\u60F3\u6CD5\u4E24\u4E24\u62E7\u5728\u4E00\u8D77\uFF1A\u5B83\u4EEC\u7684\u4EA4\u96C6\u80FD\u89E3\u51B3\u4EC0\u4E48\u5355\u72EC\u89E3\u51B3\u4E0D\u4E86\u7684\u95EE\u9898\uFF1F" },
      { key: "invert", name: "\u53CD\u8F6C\u5047\u8BBE", hint: "\u628A\u6BCF\u4E2A\u60F3\u6CD5\u7684\u6838\u5FC3\u524D\u63D0\u53CD\u8FC7\u6765\u770B\uFF1A\u5982\u679C\u4E8B\u5B9E\u5B8C\u5168\u76F8\u53CD\uFF0C\u5269\u4E0B\u7684\u8FD8\u662F\u4E0D\u662F\u4E00\u4E2A\u6709\u610F\u601D\u7684\u4E1C\u897F\uFF1F" },
      { key: "scale", name: "\u7F29\u653E\u5341\u5E74", hint: "\u628A\u6BCF\u4E2A\u60F3\u6CD5\u5206\u522B\u7F29\u5C0F 10 \u500D\uFF08\u53EA\u505A\u6700\u5C0F\u5185\u6838\uFF09\u4E0E\u653E\u5927 10 \u500D\uFF08\u5047\u8BBE\u65E0\u8D44\u6E90\u7EA6\u675F\uFF09\uFF0C\u54EA\u4E2A\u7248\u672C\u66F4\u503C\u5F97\u505A\uFF1F" },
      { key: "constraint", name: "\u51CF\u534A\u6311\u6218", hint: "\u5047\u8BBE\u65F6\u95F4\u4E0E\u8D44\u6E90\u53EA\u5269\u4E00\u534A\uFF1A\u6BCF\u4E2A\u60F3\u6CD5\u5FC5\u987B\u780D\u6389\u4EC0\u4E48\u624D\u80FD\u6D3B\u4E0B\u6765\uFF1F\u88AB\u780D\u6389\u7684\u90E8\u5206\u91CC\u6709\u6CA1\u6709\u91D1\u5B50\uFF1F" },
      { key: "other-use", name: "\u8FC1\u5730\u4ED6\u7528", hint: "\u628A\u6BCF\u4E2A\u60F3\u6CD5\u642C\u5230\u5B8C\u5168\u4E0D\u540C\u7684\u573A\u666F/\u4EBA\u7FA4/\u4ECB\u8D28\u91CC\uFF1A\u8FD8\u80FD\u7528\u5728\u54EA\uFF1F\u8C01\u4F1A\u4E3A\u5B83\u4ED8\u94B1\u6216\u82B1\u65F6\u95F4\uFF1F" },
      { key: "user-shift", name: "\u6362\u4EBA\u53D1\u95EE", hint: "\u5206\u522B\u7528\u300C\u9886\u57DF\u4E13\u5BB6\u300D\u548C\u300C\u5B8C\u5168\u7684\u5916\u884C\u300D\u7684\u53E3\u543B\u5411\u6BCF\u4E2A\u60F3\u6CD5\u63D0\u95EE\uFF0C\u4E24\u79CD\u89C6\u89D2\u5404\u4F1A\u95EE\u51FA\u4EC0\u4E48\uFF1F" },
      { key: "combine", name: "\u65E7\u914D\u65B0", hint: "\u628A\u62BD\u4E2D\u7684\u60F3\u6CD5\u5206\u522B\u4E0E\u6C60\u4E2D\u4E00\u4E2A\u66F4\u65E7\u7684\u672A\u63A8\u8FDB\u60F3\u6CD5\u914D\u5BF9\uFF1A\u65E7\u60F3\u6CD5\u80FD\u4E3A\u5B83\u8865\u4E0A\u4EC0\u4E48\uFF1F" },
      { key: "future", name: "\u65F6\u95F4\u65C5\u884C", hint: "\u4E94\u5E74\u540E\u56DE\u5934\u770B\u8FD9\u4E9B\u60F3\u6CD5\uFF1A\u5B83\u4EEC\u4F1A\u5206\u522B\u56E0\u4E3A\u4EC0\u4E48\u800C\u663E\u5F97\u5E7C\u7A1A\uFF1F\u53C8\u53EF\u80FD\u56E0\u4E3A\u4EC0\u4E48\u88AB\u8BC1\u660E\u8D85\u524D\uFF1F" }
    ];
    function pickCollisions(ideas, { count = 3, scope = "active", rand = Math.random } = {}) {
      let pool = (ideas || []).filter((i) => i && i.status !== "archived");
      if (scope === "active") pool = pool.filter((i) => i.status === "active");
      if (scope === "mature") pool = pool.filter((i) => i.status === "active" && i.maturity >= 2);
      if (pool.length < 2) return { error: "\u6C60\u5B50\u91CC\u7684\u53EF\u7528\u60F3\u6CD5\u5C11\u4E8E 2 \u4E2A\uFF0C\u5148\u591A\u635E\u51E0\u6761\u518D\u6765\u78B0\u649E" };
      const shuffled = pool.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const n = Math.min(Math.max(2, Number(count) || 3), 5, shuffled.length);
      const picks = shuffled.slice(0, n);
      const technique = TECHNIQUES2[Math.floor(rand() * TECHNIQUES2.length) % TECHNIQUES2.length];
      return { picks, technique };
    }
    function computeStarLayout3(ideas, width, height) {
      const W = Math.max(280, Number(width) || 320);
      const H = Math.max(240, Number(height) || 380);
      const margin = 34;
      const items = (ideas || []).filter((i) => i && i.id);
      const now = Date.now();
      const { clusters } = clusterConstellations2(items, now);
      const byPrimary = /* @__PURE__ */ new Map();
      for (const idea of items) {
        const tag = primaryTagOf2(idea);
        if (!byPrimary.has(tag)) byPrimary.set(tag, []);
        byPrimary.get(tag).push(idea);
      }
      const ordered = clusters.slice().sort((a, b) => b.count - a.count);
      const cx0 = W / 2;
      const cy0 = H / 2;
      const rx = (W - margin * 2) / 2;
      const ry = (H - margin * 2) / 2;
      const centers = /* @__PURE__ */ new Map();
      ordered.forEach((c, idx) => {
        if (idx === 0) {
          centers.set(c.tag, { x: cx0, y: cy0 });
          return;
        }
        const ang = idx * 2.399963;
        const rr = Math.min(1, Math.sqrt(idx / Math.max(3, ordered.length)) + 0.18);
        centers.set(c.tag, { x: cx0 + Math.cos(ang) * rx * rr * 0.78, y: cy0 + Math.sin(ang) * ry * rr * 0.78 });
      });
      const stars = [];
      const clusterOut = [];
      for (const c of ordered) {
        const members = byPrimary.get(c.tag) || [];
        const center = centers.get(c.tag) || { x: cx0, y: cy0 };
        const cr = 18 + Math.sqrt(members.length) * 16;
        clusterOut.push({ tag: c.tag, cx: center.x, cy: center.y, r: cr, count: c.count });
        members.forEach((idea, i) => {
          const h = hashStr(idea.id);
          const ring = i === 0 ? 0 : 1 + i % 2;
          const rad = ring === 0 ? 0 : (cr - 10) * (0.42 + 0.28 * ring * 0.5);
          const baseAng = h % 360 * (Math.PI / 180);
          const ang = ring === 0 ? 0 : baseAng + i * 2.399963;
          const jitter = (h >>> 8) % 100 / 100 * 6 - 3;
          const x = Math.min(W - 12, Math.max(12, center.x + Math.cos(ang) * rad + jitter));
          const y = Math.min(H - 12, Math.max(12, center.y + Math.sin(ang) * rad + jitter));
          const due = idea.status === "active" && idea.revisit && idea.revisit.dueAt > 0 && idea.revisit.dueAt <= now;
          stars.push({
            id: idea.id,
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            r: 3 + idea.maturity * 1.7 + (h >>> 12) % 10 / 10,
            hue: Math.round(hashStr(c.tag) % 360),
            alpha: idea.status === "active" ? 0.95 : idea.status === "done" ? 0.62 : 0.22,
            due,
            title: idea.title,
            maturity: idea.maturity,
            status: idea.status
          });
        });
      }
      return { stars, clusters: clusterOut, width: W, height: H };
    }
    function computePondStats3(ideas, now) {
      const all = (ideas || []).filter(Boolean);
      const active = all.filter((i) => i.status === "active");
      const byMaturity = [0, 0, 0, 0, 0];
      for (const i of all) byMaturity[i.maturity] += 1;
      const byKind = {};
      for (const k of KINDS3) byKind[k.key] = 0;
      for (const i of active) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
      const tagCount = /* @__PURE__ */ new Map();
      for (const i of active) for (const t of i.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
      const topTags = [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 8);
      const weekStart = (ts) => {
        const d = new Date(ts);
        const day = (d.getDay() + 6) % 7;
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
        return start.getTime();
      };
      const cur = weekStart(now);
      const weeks = [];
      const byWeek = /* @__PURE__ */ new Map();
      for (let w = 7; w >= 0; w--) {
        const s = cur - w * 7 * DAY_MS;
        weeks.push(s);
        byWeek.set(s, 0);
      }
      for (const i of all) {
        const s = weekStart(i.createdAt);
        if (byWeek.has(s)) byWeek.set(s, byWeek.get(s) + 1);
      }
      const oldest = active.length ? Math.min(...active.map((i) => i.createdAt)) : null;
      return {
        total: all.length,
        active: active.length,
        archived: all.filter((i) => i.status === "archived").length,
        done: all.filter((i) => i.status === "done").length,
        byMaturity,
        byKind,
        topTags,
        captures8w: weeks.map((s) => ({ weekStart: s, count: byWeek.get(s) })),
        dueNow: dueRevisits3(active, now).length,
        matureShare: active.length ? active.filter((i) => i.maturity >= 2).length / active.length : 0,
        oldestActiveDays: oldest != null ? Math.floor((now - oldest) / DAY_MS) : null
      };
    }
    function fmtIdeaLine3(idea, now) {
      const mat = MATURITIES3[idea.maturity] || MATURITIES3[0];
      const kind = (KINDS3.find((k) => k.key === idea.kind) || KINDS3[0]).label;
      const dueTxt = idea.status === "active" && idea.revisit && idea.revisit.dueAt > 0 ? ` \xB7 \u56DE\u8BBF${fmtDueRelative3(idea.revisit.dueAt, now)}` : "";
      const tagTxt = (idea.tags || []).length ? ` #${idea.tags.join(" #")}` : "";
      return `[${idea.id}] ${kind}\xB7${mat.label} ${idea.title}${tagTxt}${dueTxt}`;
    }
    module.exports = {
      K: K2,
      KINDS: KINDS3,
      MATURITIES: MATURITIES3,
      TECHNIQUES: TECHNIQUES2,
      DEFAULT_SETTINGS,
      REVISIT_BASE_DAYS: REVISIT_BASE_DAYS3,
      REVISIT_MAX_DAYS,
      LIMITS,
      DAY_MS,
      makeId,
      hashStr,
      fmtDay: fmtDay3,
      fmtDateTime: fmtDateTime3,
      fmtDueRelative: fmtDueRelative3,
      normalizeIdea: normalizeIdea2,
      deepenIdea: deepenIdea3,
      promoteIdea: promoteIdea3,
      applyRevisitOutcome: applyRevisitOutcome3,
      archiveIdea: archiveIdea3,
      restoreIdea: restoreIdea3,
      retitleIdea: retitleIdea3,
      pushEvent,
      tokenize,
      ideaTokens,
      findRelated: findRelated2,
      searchIdeas: searchIdeas3,
      dueRevisits: dueRevisits3,
      nextRevisitAt: nextRevisitAt3,
      primaryTagOf: primaryTagOf2,
      clusterConstellations: clusterConstellations2,
      pickCollisions,
      computeStarLayout: computeStarLayout3,
      computePondStats: computePondStats3,
      fmtIdeaLine: fmtIdeaLine3
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect3, useRef as useRef2, useState as useState5 } from "react";

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
var core = __toESM(require_pond_core());
var KINDS2 = core.KINDS;
var MATURITIES2 = core.MATURITIES;
var REVISIT_BASE_DAYS2 = core.REVISIT_BASE_DAYS;
var fmtDay2 = core.fmtDay;
var fmtDateTime2 = core.fmtDateTime;
var fmtDueRelative2 = core.fmtDueRelative;
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r.value ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
async function loadAllIdeas() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(core.K.ideaPrefix)).map((k) => k.slice(core.K.ideaPrefix.length));
  const arrs = await Promise.all(ids.map((id) => kvGet(core.K.idea(id))));
  const ideas = [];
  for (const v of arrs) {
    if (v && typeof v === "object" && typeof v.id === "string") ideas.push(v);
  }
  return ideas;
}
async function getIdea(id) {
  const v = await kvGet(core.K.idea(id));
  return v && typeof v === "object" && typeof v.id === "string" ? v : null;
}
async function saveIdea(idea) {
  await kvSet(core.K.idea(idea.id), idea);
}
async function captureIdea(input) {
  const norm = core.normalizeIdea({ ...input, origin: "panel" });
  if (norm.error || !norm.idea) return { ok: false, error: norm.error || "\u60F3\u6CD5\u4E0D\u5408\u6CD5" };
  const idea = norm.idea;
  const all = await loadAllIdeas();
  const related = core.findRelated(idea, all.filter((i) => i.status !== "archived"), 3);
  await saveIdea(idea);
  return { ok: true, idea, related };
}
async function mutate(id, fn) {
  const idea = await getIdea(id);
  if (!idea) return { ok: false, error: "\u60F3\u6CD5\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5728\u522B\u7684\u7AEF\u88AB\u5220\u9664\uFF09" };
  const res = fn(idea, Date.now());
  if (res.error || !res.idea) return { ok: false, error: res.error || "\u64CD\u4F5C\u5931\u8D25" };
  await saveIdea(res.idea);
  return { ok: true, idea: res.idea };
}
var deepenIdea2 = (id, text) => mutate(id, (idea, now) => core.deepenIdea(idea, text, now));
var promoteIdea2 = (id, note) => mutate(id, (idea, now) => core.promoteIdea(idea, now, note));
var applyRevisitOutcome2 = (id, outcome, note) => mutate(id, (idea, now) => core.applyRevisitOutcome(idea, outcome, now, note));
var archiveIdea2 = (id) => mutate(id, (idea, now) => core.archiveIdea(idea, now));
var restoreIdea2 = (id) => mutate(id, (idea, now) => core.restoreIdea(idea, now));
var retitleIdea2 = (id, title) => mutate(id, (idea, now) => core.retitleIdea(idea, title, now));
var dueRevisits2 = (ideas, now) => core.dueRevisits(ideas, now);
var nextRevisitAt2 = (ideas) => core.nextRevisitAt(ideas);
var searchIdeas2 = (ideas, f) => core.searchIdeas(ideas, f);
var computeStarLayout2 = (ideas, w, h) => core.computeStarLayout(ideas, w, h);
var computePondStats2 = (ideas, now) => core.computePondStats(ideas, now);
var fmtIdeaLine2 = (idea, now) => core.fmtIdeaLine(idea, now);
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60 * 1e3) return "\u521A\u521A";
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
var kindLabel = (k) => (KINDS2.find((x) => x.key === k) || KINDS2[0]).label;
var matLabel = (m) => (MATURITIES2[m] || MATURITIES2[0]).label;

// src/StarMapTab.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function StarMapTab(props) {
  const { ideas, onOpenIdea } = props;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(260, el.clientWidth - 2);
      const h = clamp(Math.round(w * 1.02), 300, 470);
      setSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(
    () => size.w > 0 ? computeStarLayout2(ideas, size.w, size.h) : null,
    [ideas, size]
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = layout.width * dpr;
    canvas.height = layout.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const x = i * 137.51 % layout.width;
      const y = i * 61.8 % layout.height;
      ctx.globalAlpha = 0.1 + i * 7 % 10 / 60;
      ctx.fillStyle = "#9FB0D8";
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
    for (const c of layout.clusters) {
      ctx.save();
      ctx.strokeStyle = `hsla(${c.tag === "\u672A\u5206\u57DF" ? 220 : c.tag.length * 37 % 360}, 60%, 62%, 0.22)`;
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "10px -apple-system,Segoe UI,PingFang SC,sans-serif";
      ctx.fillStyle = "rgba(160,170,196,0.75)";
      ctx.textAlign = "center";
      ctx.fillText(`#${c.tag}\xB7${c.count}`, c.cx, Math.max(10, c.cy - c.r - 4));
      ctx.restore();
    }
    for (const s of layout.stars) {
      ctx.save();
      const color = `hsla(${s.hue}, 66%, 64%, ${s.alpha})`;
      if (s.status === "active") {
        ctx.shadowColor = color;
        ctx.shadowBlur = 9;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (s.due) {
        ctx.strokeStyle = "rgba(240,111,100,0.9)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 3.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (s.status === "done") {
        ctx.strokeStyle = "rgba(126,226,160,0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    const hv = hover ? layout.stars.find((s) => s.id === hover) : null;
    if (hv) {
      ctx.save();
      ctx.font = "11px -apple-system,Segoe UI,PingFang SC,sans-serif";
      const label = hv.title.length > 18 ? `${hv.title.slice(0, 17)}\u2026` : hv.title;
      const tw = ctx.measureText(label).width + 14;
      const bx = clamp(hv.x - tw / 2, 4, layout.width - tw - 4);
      const by = clamp(hv.y - 30, 4, layout.height - 22);
      ctx.fillStyle = "rgba(10,13,22,0.92)";
      ctx.strokeStyle = "rgba(139,124,246,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, tw, 18, 6);
      else ctx.rect(bx, by, tw, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#E6E9F2";
      ctx.textAlign = "left";
      ctx.fillText(label, bx + 7, by + 13);
      ctx.restore();
    }
  }, [layout, hover]);
  const pickStar = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (const s of layout.stars) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      const hit = Math.max(13, s.r + 7);
      if (d < hit * hit && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  };
  if (!ideas.length) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "lx-empty", children: [
        "\u661F\u7A7A\u8FD8\u662F\u7A7A\u7684\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "\u53BB\u5BF9\u8BDD\u91CC\u8BF4\u300C\u8BB0\u4E2A\u60F3\u6CD5\uFF1A\u2026\u300D\uFF0C\u6216\u5728\u300C\u6C60\u5B50\u300D\u9875\u5FEB\u6355\u4E00\u6761\u2014\u2014",
        /* @__PURE__ */ jsx("br", {}),
        "\u6BCF\u4E2A\u5FF5\u5934\u90FD\u4F1A\u5316\u4F5C\u4E00\u9897\u661F\uFF0C\u5230\u671F\u81EA\u52A8\u56DE\u6765\u89C1\u4F60\u3002"
      ] }),
      /* @__PURE__ */ jsx(Legend, {})
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "lx-mapwrap", ref: wrapRef, children: /* @__PURE__ */ jsx(
      "canvas",
      {
        ref: canvasRef,
        style: size.h ? { height: size.h } : void 0,
        onMouseMove: (e) => {
          const s = pickStar(e.clientX, e.clientY);
          setHover(s ? s.id : null);
        },
        onMouseLeave: () => setHover(null),
        onClick: (e) => {
          const s = pickStar(e.clientX, e.clientY);
          if (s) onOpenIdea(s.id);
        }
      }
    ) }),
    /* @__PURE__ */ jsx(Legend, {})
  ] });
}
function Legend() {
  return /* @__PURE__ */ jsxs("div", { className: "lx-legend", children: [
    MATURITIES2.map((m, i) => /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("i", { style: { width: 4 + i * 2.4, height: 4 + i * 2.4, background: "#8B7CF6", opacity: 0.9 } }),
      m.label
    ] }, m.key)),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("i", { style: { width: 8, height: 8, background: "transparent", border: "1.4px solid #F06F64" } }),
      "\u5230\u671F"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("i", { style: { width: 8, height: 8, background: "transparent", border: "1px solid #7EE2A0" } }),
      "\u5DF2\u843D\u5730"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("i", { style: { width: 7, height: 7, background: "#3a4152" } }),
      "\u5F52\u6863"
    ] }),
    /* @__PURE__ */ jsx("span", { style: { marginLeft: "auto" }, children: "\u661F\u7CFB = \u4E3B\u6807\u7B7E" })
  ] });
}

// src/RevisitTab.tsx
import { useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function RevisitTab({ ideas, reload, showToast, onOpenIdea, onGotoCapture }) {
  const now = Date.now();
  const due = dueRevisits2(ideas, now);
  const next = nextRevisitAt2(ideas);
  const [noteFor, setNoteFor] = useState2(null);
  const [note, setNote] = useState2("");
  const [busy, setBusy] = useState2(false);
  const act = async (idea, outcome, withNote) => {
    setBusy(true);
    try {
      const res = await applyRevisitOutcome2(idea.id, outcome, withNote);
      if (!res.ok) {
        showToast(res.error || "\u64CD\u4F5C\u5931\u8D25", "bad");
        return;
      }
      const verb = outcome === "promote" ? "\u5DF2\u63A8\u8FDB" : outcome === "deepen" ? "\u5DF2\u6DF1\u5316" : outcome === "archive" ? "\u5DF2\u5F52\u6863" : "\u518D\u7B49\u7B49";
      showToast(`\u300C${idea.title}\u300D${verb}`);
      setNoteFor(null);
      setNote("");
      await reload();
    } finally {
      setBusy(false);
    }
  };
  if (!ideas.length) {
    return /* @__PURE__ */ jsxs2("div", { className: "lx-empty", children: [
      "\u56DE\u8BBF\u961F\u5217\u5E72\u51C0\uFF0C\u6C60\u5B50\u4E5F\u7A7A\u7740\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u6355\u83B7\u7B2C\u4E00\u4E2A\u5FF5\u5934\uFF0C",
      REVISIT_BASE_DAYS2,
      " \u5929\u540E\u5B83\u4F1A\u56DE\u6765\u89C1\u4F60\u3002"
    ] });
  }
  if (!due.length) {
    return /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "lx-empty", children: [
        "\u4ECA\u5929\u6CA1\u6709\u5230\u671F\u7684\u60F3\u6CD5\uFF0C\u961F\u5217\u5E72\u51C0\u3002",
        /* @__PURE__ */ jsx2("br", {}),
        next ? `\u4E0B\u4E00\u6B21\u56DE\u8BBF\uFF1A${fmtDay2(next)}\uFF08${fmtDueRelative2(next, now)}\uFF09` : ""
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "lx-card", children: /* @__PURE__ */ jsxs2("div", { className: "lx-card-b lx-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx2("span", { className: "lx-sub", children: "\u624B\u75D2\u60F3\u73B0\u5728\u7FFB\u724C\uFF1F\u53BB\u6C60\u5B50\u91CC\u968F\u4FBF\u70B9\u5F00\u4E00\u9897\u661F\u3002" }),
        /* @__PURE__ */ jsx2("button", { className: "lx-btn ghost sm", onClick: onGotoCapture, children: "\u53BB\u6C60\u5B50" })
      ] }) })
    ] });
  }
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "lx-bar" }),
      "\u4ECA\u65E5\u56DE\u8BBF ",
      due.length,
      " \u6761",
      /* @__PURE__ */ jsx2("span", { className: "lx-hint", children: "\u63A8\u8FDB\u21923\u5929\u8282\u594F \xB7 \u6DF1\u5316/\u518D\u7B49\u7B49\u2192\u95F4\u9694\u7FFB\u500D" })
    ] }),
    due.map((idea) => {
      const q = (idea.timeline || []).find((e) => e.kind === "question");
      const overdueDays = Math.max(0, Math.floor((now - idea.revisit.dueAt) / 864e5));
      return /* @__PURE__ */ jsxs2("div", { className: "lx-card", children: [
        /* @__PURE__ */ jsxs2("div", { className: "lx-due-head", children: [
          /* @__PURE__ */ jsx2(
            "span",
            {
              className: "lx-dot",
              style: { background: idea.status === "active" ? "#8B7CF6" : "#3a4152" }
            }
          ),
          /* @__PURE__ */ jsx2("b", { onClick: () => onOpenIdea(idea.id), style: { cursor: "pointer" }, children: idea.title }),
          /* @__PURE__ */ jsxs2("span", { className: "lx-badge mat", children: [
            kindLabel(idea.kind),
            "\xB7",
            matLabel(idea.maturity)
          ] }),
          /* @__PURE__ */ jsx2("span", { className: `lx-badge ${overdueDays > 0 ? "over" : ""}`, children: overdueDays > 0 ? `\u903E\u671F ${overdueDays} \u5929` : "\u4ECA\u65E5\u5230\u671F" })
        ] }),
        q && /* @__PURE__ */ jsxs2("div", { className: "lx-due-q", children: [
          "\u8FFD\u95EE\uFF1A",
          q.text
        ] }),
        idea.raw && /* @__PURE__ */ jsxs2("div", { className: "lx-due-raw", children: [
          idea.raw.slice(0, 110),
          idea.raw.length > 110 ? "\u2026" : "",
          /* @__PURE__ */ jsxs2("span", { className: "lx-hint", style: { marginLeft: 6 }, children: [
            "\u6355\u83B7\u4E8E ",
            timeAgo(idea.createdAt)
          ] })
        ] }),
        noteFor === idea.id && /* @__PURE__ */ jsxs2("div", { className: "lx-note", children: [
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              className: "lx-inp lx-ta",
              placeholder: "\u6DF1\u5316\uFF1A\u8FD9\u6BB5\u65F6\u95F4\u53C8\u60F3\u5230\u4E86\u4EC0\u4E48\uFF1F\uFF08\u4F1A\u6C89\u6DC0\u8FDB\u65F6\u95F4\u7EBF\uFF0C\u56DE\u8BBF\u95F4\u9694\u7FFB\u500D\uFF09",
              value: note,
              onChange: (e) => setNote(e.target.value)
            }
          ),
          /* @__PURE__ */ jsxs2("div", { className: "lx-editrow", children: [
            /* @__PURE__ */ jsx2(
              "button",
              {
                className: "lx-btn sm",
                disabled: busy || !note.trim(),
                onClick: () => act(idea, "deepen", note.trim()),
                children: "\u6C89\u6DC0\u5E76\u7FFB\u7BC7"
              }
            ),
            /* @__PURE__ */ jsx2("button", { className: "lx-btn ghost sm", onClick: () => {
              setNoteFor(null);
              setNote("");
            }, children: "\u53D6\u6D88" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "lx-due-actions", children: [
          /* @__PURE__ */ jsx2("button", { className: "lx-btn sm", disabled: busy, onClick: () => act(idea, "promote"), children: "\u63A8\u8FDB" }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "lx-btn ghost sm",
              disabled: busy,
              onClick: () => {
                setNoteFor(noteFor === idea.id ? null : idea.id);
                setNote("");
              },
              children: "\u6DF1\u5316"
            }
          ),
          /* @__PURE__ */ jsx2("button", { className: "lx-btn ghost sm", disabled: busy, onClick: () => act(idea, "snooze"), children: "\u518D\u7B49\u7B49" }),
          /* @__PURE__ */ jsx2("button", { className: "lx-btn danger sm", disabled: busy, onClick: () => act(idea, "archive"), children: "\u5F52\u6863" })
        ] })
      ] }, idea.id);
    })
  ] });
}

// src/PondTab.tsx
import { useMemo as useMemo2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function PondTab({ ideas, reload, showToast, onOpenIdea, onSendToChat }) {
  const [title, setTitle] = useState3("");
  const [raw, setRaw] = useState3("");
  const [tagsInp, setTagsInp] = useState3("");
  const [kind, setKind] = useState3("idea");
  const [url, setUrl] = useState3("");
  const [capBusy, setCapBusy] = useState3(false);
  const [capResult, setCapResult] = useState3(null);
  const [keyword, setKeyword] = useState3("");
  const [tag, setTag] = useState3("");
  const [kindF, setKindF] = useState3("");
  const [statusF, setStatusF] = useState3("active");
  const tagPool = useMemo2(() => {
    const m = /* @__PURE__ */ new Map();
    for (const i of ideas) for (const t of i.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
  }, [ideas]);
  const found = useMemo2(() => {
    const f = { status: statusF };
    if (keyword.trim()) f.keyword = keyword.trim();
    if (tag) f.tag = tag;
    if (kindF) f.kind = kindF;
    return searchIdeas2(ideas, f).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [ideas, keyword, tag, kindF, statusF]);
  const doCapture = async () => {
    if (!title.trim() || capBusy) return;
    setCapBusy(true);
    try {
      const tags = tagsInp.split(/[,，#]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
      const res = await captureIdea({
        title: title.trim(),
        raw: raw.trim() || void 0,
        kind,
        tags: tags.length ? tags : void 0,
        url: url.trim() || void 0
      });
      if (!res.ok || !res.idea) {
        showToast(res.error || "\u5165\u6C60\u5931\u8D25", "bad");
        return;
      }
      setCapResult({ title: res.idea.title, related: (res.related || []).map((r) => r.idea) });
      setTitle("");
      setRaw("");
      setTagsInp("");
      setUrl("");
      showToast("\u5DF2\u5165\u6C60\uFF0C3 \u5929\u540E\u9996\u8BBF");
      await reload();
    } finally {
      setCapBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "lx-bar" }),
      "\u5FEB\u6355\u5165\u6C60",
      /* @__PURE__ */ jsx3("span", { className: "lx-hint", children: "\u4E00\u53E5\u8BDD\u5373\u53EF\uFF0C\u522B\u7BA1\u683C\u5F0F" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "lx-card", children: /* @__PURE__ */ jsxs3("div", { className: "lx-card-b", children: [
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "lx-inp",
          placeholder: "\u4E00\u53E5\u8BDD\u6982\u62EC\u8FD9\u4E2A\u5FF5\u5934\uFF08\u5FC5\u586B\uFF09",
          value: title,
          maxLength: 60,
          onChange: (e) => setTitle(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) doCapture();
          }
        }
      ),
      /* @__PURE__ */ jsx3(
        "textarea",
        {
          className: "lx-inp lx-ta",
          style: { marginTop: 8 },
          placeholder: "\u5C55\u5F00\u8BF4\u8BF4\uFF08\u53EF\u7A7A\uFF09\uFF1A\u5B83\u60F3\u89E3\u51B3\u4EC0\u4E48\uFF1F\u4E3A\u4EC0\u4E48\u73B0\u5728\u60F3\u5230\uFF1F",
          value: raw,
          maxLength: 2e3,
          onChange: (e) => setRaw(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "lx-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3("select", { className: "lx-sel", value: kind, onChange: (e) => setKind(e.target.value), children: KINDS2.map((k) => /* @__PURE__ */ jsx3("option", { value: k.key, children: k.label }, k.key)) }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "lx-inp",
            style: { flex: 1, minWidth: 0 },
            placeholder: "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\uFF0C\u51B3\u5B9A\u661F\u7CFB\u5F52\u5C5E\uFF09",
            value: tagsInp,
            onChange: (e) => setTagsInp(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "lx-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "lx-inp",
            style: { flex: 1, minWidth: 0 },
            placeholder: "\u6765\u6E90\u94FE\u63A5\uFF08\u53EF\u9009\uFF0C\u53EA\u5B58\u7EBF\u7D22\u4E0D\u505A\u6293\u53D6\uFF09",
            value: url,
            onChange: (e) => setUrl(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx3("button", { className: "lx-btn", disabled: capBusy || !title.trim(), onClick: doCapture, children: "\u5165\u6C60" })
      ] }),
      capResult && /* @__PURE__ */ jsxs3("div", { style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "lx-sub", children: [
          "\u5DF2\u5165\u6C60\u300C",
          capResult.title,
          "\u300D\uFF0C3 \u5929\u540E\u56DE\u8BBF\u89C1\u3002"
        ] }),
        capResult.related.length > 0 && /* @__PURE__ */ jsx3("div", { className: "lx-card", style: { margin: "8px 0 0" }, children: /* @__PURE__ */ jsxs3("div", { className: "lx-card-b", children: [
          /* @__PURE__ */ jsx3("div", { className: "lx-sub", style: { color: "#F0B47A" }, children: "\u26A0\uFE0F \u6C60\u4E2D\u5DF2\u6709\u76F8\u5173\u60F3\u6CD5\uFF08\u53EF\u80FD\u91CD\u590D/\u53EF\u5408\u5E76\uFF09\uFF1A" }),
          capResult.related.map((r) => /* @__PURE__ */ jsxs3("div", { className: "lx-relrow", onClick: () => onOpenIdea(r.id), children: [
            matLabel(r.maturity),
            " \xB7 ",
            r.title
          ] }, r.id)),
          /* @__PURE__ */ jsx3("div", { className: "lx-editrow", children: /* @__PURE__ */ jsx3(
            "button",
            {
              className: "lx-btn ghost sm",
              onClick: () => onSendToChat(
                `\u7075\u611F\u6C60\uFF0C\u6211\u521A\u5165\u6C60\u4E86\u300C${capResult.title}\u300D\uFF0C\u6C60\u91CC\u8BF4\u6709\u51E0\u4E2A\u76F8\u5173\u65E7\u60F3\u6CD5\uFF0C\u5E2E\u6211\u4E00\u8D77\u76D8\u4E00\u76D8\uFF1A\u5B83\u4EEC\u662F\u91CD\u590D\u3001\u53EF\u5408\u5E76\uFF0C\u8FD8\u662F\u8BE5\u4E92\u76F8\u94FE\u63A5\uFF1F`
              ),
              children: "\u53BB\u5BF9\u8BDD\u91CC\u76D8\u4E00\u76D8"
            }
          ) })
        ] }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "lx-bar" }),
      "\u6C60\u4E2D\u60F3\u6CD5 ",
      found.length,
      /* @__PURE__ */ jsx3("span", { className: "lx-hint", children: "\u70B9\u5F00\u770B\u65F6\u95F4\u7EBF\u4E0E\u52A8\u4F5C" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "lx-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "lx-card-b", children: [
        /* @__PURE__ */ jsxs3("div", { className: "lx-row", children: [
          /* @__PURE__ */ jsx3(
            "input",
            {
              className: "lx-inp",
              style: { flex: 1, minWidth: 120 },
              placeholder: "\u641C\u5173\u952E\u8BCD\u2026",
              value: keyword,
              onChange: (e) => setKeyword(e.target.value)
            }
          ),
          /* @__PURE__ */ jsxs3("select", { className: "lx-sel", value: statusF, onChange: (e) => setStatusF(e.target.value), children: [
            /* @__PURE__ */ jsx3("option", { value: "active", children: "\u5728\u6C60" }),
            /* @__PURE__ */ jsx3("option", { value: "archived", children: "\u5F52\u6863" }),
            /* @__PURE__ */ jsx3("option", { value: "done", children: "\u5DF2\u843D\u5730" })
          ] }),
          /* @__PURE__ */ jsxs3("select", { className: "lx-sel", value: kindF, onChange: (e) => setKindF(e.target.value), children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\u5168\u90E8\u7C7B\u578B" }),
            KINDS2.map((k) => /* @__PURE__ */ jsx3("option", { value: k.key, children: k.label }, k.key))
          ] })
        ] }),
        tagPool.length > 0 && /* @__PURE__ */ jsxs3("div", { className: "lx-row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx3("span", { className: `lx-chip ${tag === "" ? "on" : ""}`, onClick: () => setTag(""), children: "\u5168\u90E8" }),
          tagPool.map((t) => /* @__PURE__ */ jsxs3("span", { className: `lx-chip ${tag === t ? "on" : ""}`, onClick: () => setTag(tag === t ? "" : t), children: [
            "#",
            t
          ] }, t))
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: { padding: "2px 13px 10px" }, children: [
        found.length === 0 && /* @__PURE__ */ jsx3("div", { className: "lx-empty", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u60F3\u6CD5\u3002" }),
        found.map((idea) => {
          const dueBadge = idea.status === "active" && idea.revisit.dueAt > 0 && idea.revisit.dueAt <= Date.now();
          const dueTxt = idea.status === "active" && idea.revisit.dueAt > 0 ? ` \xB7 \u56DE\u8BBF${fmtDueRelative2(idea.revisit.dueAt, Date.now())}` : "";
          return /* @__PURE__ */ jsxs3("div", { className: "lx-idea", onClick: () => onOpenIdea(idea.id), children: [
            /* @__PURE__ */ jsx3(
              "span",
              {
                className: "lx-dot",
                style: {
                  background: idea.status === "active" ? "#8B7CF6" : idea.status === "done" ? "#7EE2A0" : "#3a4152",
                  opacity: idea.status === "archived" ? 0.6 : 1
                }
              }
            ),
            /* @__PURE__ */ jsxs3("div", { className: "lx-idea-main", children: [
              /* @__PURE__ */ jsx3("b", { children: idea.title }),
              /* @__PURE__ */ jsxs3("small", { children: [
                kindLabel(idea.kind),
                "\xB7",
                matLabel(idea.maturity),
                (idea.tags || []).length ? ` \xB7 #${idea.tags.join(" #")}` : "",
                dueTxt,
                " \xB7 ",
                timeAgo(idea.createdAt)
              ] })
            ] }),
            dueBadge && /* @__PURE__ */ jsx3("span", { className: "lx-badge over", children: "\u5230\u671F" })
          ] }, idea.id);
        })
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "lx-legend", children: MATURITIES2.map((m) => /* @__PURE__ */ jsxs3("span", { children: [
      m.label,
      "\uFF1A",
      m.desc
    ] }, m.key)) })
  ] });
}

// src/StatsTab.tsx
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function StatsTab({ ideas }) {
  const now = Date.now();
  const s = computePondStats2(ideas, now);
  const maxMat = Math.max(1, ...s.byMaturity);
  const maxWeek = Math.max(1, ...s.captures8w.map((w) => w.count));
  if (!ideas.length) {
    return /* @__PURE__ */ jsx4("div", { className: "lx-empty", children: "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u60F3\u6CD5\uFF0C\u7EDF\u8BA1\u65E0\u4ECE\u8C08\u8D77\u2014\u2014\u5148\u53BB\u6355\u4E00\u6761\u3002" });
  }
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lx-bar" }),
      "\u6C60\u5B50\u901F\u89C8"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "lx-card", children: /* @__PURE__ */ jsxs4("div", { className: "lx-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "lx-statgrid", children: [
        /* @__PURE__ */ jsxs4("div", { className: "lx-statcell", children: [
          /* @__PURE__ */ jsx4("b", { children: s.active }),
          /* @__PURE__ */ jsx4("small", { children: "\u5728\u6C60" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "lx-statcell", children: [
          /* @__PURE__ */ jsx4("b", { style: { color: s.dueNow ? "#F0B47A" : void 0 }, children: s.dueNow }),
          /* @__PURE__ */ jsx4("small", { children: "\u4ECA\u65E5\u56DE\u8BBF" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "lx-statcell", children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#7EE2A0" }, children: s.done }),
          /* @__PURE__ */ jsx4("small", { children: "\u5DF2\u843D\u5730" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "lx-statcell", children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#6E7686" }, children: s.archived }),
          /* @__PURE__ */ jsx4("small", { children: "\u5F52\u6863" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "lx-sub", style: { marginTop: 8 }, children: [
        "\u6355\u83B7 ",
        s.total,
        " \u6761 \xB7 \u5B75\u5316\u5230\u8F6E\u5ED3\u4EE5\u4E0A\u5360\u5728\u6C60 ",
        Math.round(s.matureShare * 100),
        "%",
        s.oldestActiveDays != null ? ` \xB7 \u6700\u8001\u60F3\u6CD5\u5DF2 ${s.oldestActiveDays} \u5929` : ""
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lx-bar" }),
      "\u6210\u719F\u5EA6\u6F0F\u6597"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "lx-card", children: /* @__PURE__ */ jsx4("div", { className: "lx-card-b", children: MATURITIES2.map((m, i) => /* @__PURE__ */ jsxs4("div", { className: "lx-funnel-row", children: [
      /* @__PURE__ */ jsx4("span", { className: "nm", children: m.label }),
      /* @__PURE__ */ jsx4("span", { className: "tr", children: /* @__PURE__ */ jsx4("i", { style: { width: `${s.byMaturity[i] / maxMat * 100}%` } }) }),
      /* @__PURE__ */ jsx4("span", { className: "ct", children: s.byMaturity[i] })
    ] }, m.key)) }) }),
    /* @__PURE__ */ jsxs4("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lx-bar" }),
      "\u8FD1 8 \u5468\u6355\u83B7"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "lx-card", children: /* @__PURE__ */ jsx4("div", { className: "lx-card-b", children: /* @__PURE__ */ jsx4("div", { className: "lx-weeks", children: s.captures8w.map((w) => /* @__PURE__ */ jsxs4("div", { className: "lx-weekcol", children: [
      /* @__PURE__ */ jsx4("i", { style: { height: `${Math.max(3, w.count / maxWeek * 52)}px` }, title: `${w.count} \u6761` }),
      /* @__PURE__ */ jsx4("small", { children: fmtDay2(w.weekStart).slice(5).replace("-", "/") })
    ] }, w.weekStart)) }) }) }),
    /* @__PURE__ */ jsxs4("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lx-bar" }),
      "\u5728\u6C60\u7C7B\u578B\u4E0E\u9AD8\u9891\u6807\u7B7E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "lx-card", children: /* @__PURE__ */ jsxs4("div", { className: "lx-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "lx-sub", children: KINDS2.map((k) => `${k.label} ${s.byKind[k.key] || 0}`).join(" \xB7 ") }),
      /* @__PURE__ */ jsx4("div", { className: "lx-row", style: { marginTop: 8 }, children: s.topTags.length ? s.topTags.map((t) => /* @__PURE__ */ jsxs4("span", { className: "lx-chip", children: [
        "#",
        t.tag,
        " \xD7",
        t.count
      ] }, t.tag)) : /* @__PURE__ */ jsx4("span", { className: "lx-sub", children: "\u8FD8\u6CA1\u6253\u8FC7\u6807\u7B7E\u2014\u2014\u6807\u7B7E\u51B3\u5B9A\u661F\u7CFB\u5F52\u5C5E\uFF0C\u6355\u7684\u65F6\u5019\u987A\u624B\u5E26\u4E00\u4E2A\u3002" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "lx-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "lx-bar" }),
      "\u8FD9\u5957\u673A\u5236\u600E\u4E48\u7528"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "lx-card", children: /* @__PURE__ */ jsxs4("div", { className: "lx-card-b lx-sub", children: [
      "\u60F3\u6CD5\u5165\u6C60 3 \u5929\u540E\u9996\u6B21\u56DE\u8BBF\uFF1B\u6DF1\u5316/\u518D\u7B49\u7B49\u95F4\u9694\u7FFB\u500D\uFF08\u6700\u957F 60 \u5929\uFF09\uFF0C\u63A8\u8FDB\u5219\u56DE\u5230 3 \u5929\u6D3B\u8DC3\u8282\u594F\uFF0C\u843D\u5730\u5373\u6536\u53E3\u3002 \u5F52\u6863\u4E0D\u662F\u5220\u9664\u2014\u2014\u6C89\u5BC2\u7684\u60F3\u6CD5\u4ECD\u53EF\u68C0\u7D22\u3001\u53EF\u6062\u590D\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u5728\u5BF9\u8BDD\u91CC\u8BF4\u300C\u7FFB\u7FFB\u65E7\u60F3\u6CD5\u300D\u89E6\u53D1\u56DE\u8BBF\uFF0C\u300C\u6765\u4E00\u573A\u78B0\u649E\u300D\u968F\u673A\u62BD\u60F3\u6CD5\u5934\u8111\u98CE\u66B4\uFF0C\u300C\u661F\u7CFB\u62A5\u544A\u300D\u770B\u54EA\u4E9B\u60F3\u6CD5\u5DF2\u6210\u7C07\u53EF\u5408\u6D41\u3002"
    ] }) })
  ] });
}

// src/DetailDrawer.tsx
import { useEffect as useEffect2, useState as useState4 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var MATURITIES_DESC = Object.fromEntries(
  MATURITIES2.map((m, i) => [i, m.desc])
);
var EVENT_LABELS = {
  catch: "\u6355\u83B7",
  question: "\u8FFD\u95EE",
  deepen: "\u6DF1\u5316",
  promote: "\u63A8\u8FDB",
  revisit: "\u56DE\u8BBF",
  archive: "\u5F52\u6863",
  restore: "\u6062\u590D",
  edit: "\u6539\u9898",
  collide: "\u78B0\u649E"
};
function DetailDrawer({ id, reload, showToast, onClose, onSendToChat }) {
  const [idea, setIdea] = useState4(null);
  const [err, setErr] = useState4("");
  const [deepenText, setDeepenText] = useState4("");
  const [promoteNote, setPromoteNote] = useState4("");
  const [editing, setEditing] = useState4(false);
  const [titleDraft, setTitleDraft] = useState4("");
  const [busy, setBusy] = useState4(false);
  useEffect2(() => {
    let alive = true;
    getIdea(id).then((v) => {
      if (alive) setIdea(v);
    }).catch((e) => {
      if (alive) setErr(e.message);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        showToast(res.error || "\u64CD\u4F5C\u5931\u8D25", "bad");
        return;
      }
      showToast(okMsg);
      const next = await reload();
      setIdea(next.find((i) => i.id === id) || null);
      setDeepenText("");
      setPromoteNote("");
    } finally {
      setBusy(false);
    }
  };
  if (err) {
    return /* @__PURE__ */ jsx5("div", { className: "lx-drawer", onClick: onClose, children: /* @__PURE__ */ jsx5("div", { className: "lx-drawer-box", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsx5("div", { className: "lx-drawer-body", children: /* @__PURE__ */ jsxs5("div", { className: "lx-empty", children: [
      "\u52A0\u8F7D\u5931\u8D25\uFF1A",
      err
    ] }) }) }) });
  }
  if (!idea) {
    return /* @__PURE__ */ jsx5("div", { className: "lx-drawer", onClick: onClose, children: /* @__PURE__ */ jsx5("div", { className: "lx-drawer-box", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsx5("div", { className: "lx-drawer-body", children: /* @__PURE__ */ jsx5("div", { className: "lx-empty", children: "\u8F7D\u5165\u4E2D\u2026" }) }) }) });
  }
  const matDesc = MATURITIES_DESC[idea.maturity] || "";
  return /* @__PURE__ */ jsx5("div", { className: "lx-drawer", onClick: onClose, children: /* @__PURE__ */ jsxs5("div", { className: "lx-drawer-box", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs5("div", { className: "lx-drawer-head", children: [
      /* @__PURE__ */ jsxs5("div", { style: { flex: 1, minWidth: 0 }, children: [
        editing ? /* @__PURE__ */ jsxs5("div", { className: "lx-editrow", style: { marginTop: 0 }, children: [
          /* @__PURE__ */ jsx5(
            "input",
            {
              className: "lx-inp",
              value: titleDraft,
              maxLength: 60,
              onChange: (e) => setTitleDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && titleDraft.trim()) {
                  run(() => retitleIdea2(idea.id, titleDraft.trim()), "\u5DF2\u6539\u9898");
                  setEditing(false);
                }
              }
            }
          ),
          /* @__PURE__ */ jsx5(
            "button",
            {
              className: "lx-btn sm",
              disabled: busy || !titleDraft.trim(),
              onClick: () => {
                run(() => retitleIdea2(idea.id, titleDraft.trim()), "\u5DF2\u6539\u9898");
                setEditing(false);
              },
              children: "\u5B58"
            }
          ),
          /* @__PURE__ */ jsx5("button", { className: "lx-btn ghost sm", onClick: () => setEditing(false), children: "\u53D6\u6D88" })
        ] }) : /* @__PURE__ */ jsx5("b", { onClick: () => {
          setEditing(true);
          setTitleDraft(idea.title);
        }, style: { cursor: "text" }, title: "\u70B9\u51FB\u6539\u9898", children: idea.title }),
        /* @__PURE__ */ jsxs5("div", { className: "lx-sub", style: { marginTop: 2 }, children: [
          kindLabel(idea.kind),
          " \xB7 ",
          matLabel(idea.maturity),
          matDesc ? `\uFF08${matDesc}\uFF09` : "",
          idea.status !== "active" ? ` \xB7 ${idea.status === "done" ? "\u5DF2\u843D\u5730" : "\u5F52\u6863\u4E2D"}` : "",
          idea.status === "active" && idea.revisit.dueAt > 0 ? ` \xB7 \u56DE\u8BBF${fmtDueRelative2(idea.revisit.dueAt, Date.now())}\uFF08\u95F4\u9694 ${idea.revisit.interval} \u5929\uFF09` : "",
          " \xB7 ",
          timeAgo(idea.createdAt),
          "\u6355\u83B7"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("button", { className: "lx-x", onClick: onClose, children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "lx-drawer-body", children: [
      idea.raw && /* @__PURE__ */ jsx5("div", { style: { fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }, children: idea.raw }),
      idea.url && /* @__PURE__ */ jsxs5("div", { className: "lx-sub", style: { marginTop: 6, wordBreak: "break-all" }, children: [
        "\u6765\u6E90\uFF1A",
        /* @__PURE__ */ jsx5("a", { href: idea.url, target: "_blank", rel: "noreferrer", style: { color: "#9FB6DD" }, children: idea.url })
      ] }),
      (idea.tags || []).length > 0 && /* @__PURE__ */ jsx5("div", { className: "lx-row", style: { marginTop: 8 }, children: idea.tags.map((t) => /* @__PURE__ */ jsxs5("span", { className: "lx-chip", children: [
        "#",
        t
      ] }, t)) }),
      /* @__PURE__ */ jsx5("div", { className: "lx-lbl", children: "\u52A8\u4F5C" }),
      /* @__PURE__ */ jsx5(
        "textarea",
        {
          className: "lx-inp lx-ta",
          placeholder: "\u6DF1\u5316\uFF1A\u5199\u4E0B\u65B0\u7684\u7406\u89E3/\u65B9\u6848/\u53CD\u9A73\uFF08\u6C89\u6DC0\u8FDB\u65F6\u95F4\u7EBF\uFF0C\u56DE\u8BBF\u95F4\u9694\u7FFB\u500D\uFF09",
          value: deepenText,
          onChange: (e) => setDeepenText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs5("div", { className: "lx-editrow", children: [
        /* @__PURE__ */ jsx5(
          "button",
          {
            className: "lx-btn sm",
            disabled: busy || idea.status !== "active" || !deepenText.trim(),
            onClick: () => run(() => deepenIdea2(idea.id, deepenText.trim()), "\u5DF2\u6C89\u6DC0"),
            children: "\u6C89\u6DC0"
          }
        ),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "lx-inp",
            style: { flex: 1, minWidth: 0 },
            placeholder: "\u63A8\u8FDB\u4F9D\u636E\uFF08\u53EF\u7A7A\uFF09",
            value: promoteNote,
            onChange: (e) => setPromoteNote(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx5(
          "button",
          {
            className: "lx-btn gold sm",
            disabled: busy || idea.status !== "active" || idea.maturity >= 4,
            onClick: () => run(() => promoteIdea2(idea.id, promoteNote.trim() || void 0), "\u5DF2\u63A8\u8FDB"),
            children: "\u63A8\u8FDB \u2192"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "lx-editrow", children: [
        /* @__PURE__ */ jsx5(
          "button",
          {
            className: "lx-btn ghost sm",
            disabled: busy || idea.status !== "active",
            onClick: () => run(() => applyRevisitOutcome2(idea.id, "snooze"), "\u518D\u7B49\u7B49\uFF1A\u95F4\u9694\u5DF2\u7FFB\u500D"),
            children: "\u518D\u7B49\u7B49"
          }
        ),
        idea.status === "archived" ? /* @__PURE__ */ jsx5("button", { className: "lx-btn ghost sm", disabled: busy, onClick: () => run(() => restoreIdea2(idea.id), "\u5DF2\u6062\u590D\u5165\u6C60"), children: "\u6062\u590D\u5165\u6C60" }) : /* @__PURE__ */ jsx5("button", { className: "lx-btn danger sm", disabled: busy || idea.status !== "active", onClick: () => run(() => archiveIdea2(idea.id), "\u5DF2\u5F52\u6863"), children: "\u5F52\u6863" }),
        /* @__PURE__ */ jsx5(
          "button",
          {
            className: "lx-btn ghost sm",
            onClick: () => onSendToChat(`\u7075\u611F\u6C60\uFF0C\u5E2E\u6211\u6DF1\u5316\u8FD9\u4E2A\u60F3\u6CD5\uFF1A${fmtIdeaLine2(idea, Date.now())}\u3002\u5148\u7ED9\u6211\u4E09\u4E2A\u8FFD\u95EE\uFF0C\u518D\u4E00\u8D77\u628A\u8F6E\u5ED3\u804A\u51FA\u6765\u3002`),
            children: "\u8BA9 AI \u6DF1\u5316"
          }
        )
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "lx-lbl", children: "\u65F6\u95F4\u7EBF" }),
      /* @__PURE__ */ jsx5("div", { className: "lx-timeline", children: (idea.timeline || []).map((e, idx) => /* @__PURE__ */ jsxs5("div", { className: "lx-tl-item", children: [
        /* @__PURE__ */ jsx5("span", { className: "k", children: EVENT_LABELS[e.kind] || e.kind }),
        /* @__PURE__ */ jsx5("span", { className: "t", style: { whiteSpace: "pre-wrap" }, children: e.text }),
        /* @__PURE__ */ jsx5("span", { className: "d", children: fmtDateTime2(e.at) })
      ] }, `${e.at}-${idx}`)) })
    ] })
  ] }) });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.lx-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6E9F2;height:100%;display:flex;flex-direction:column;background:transparent}
.lx-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.lx-body{flex:1;overflow-y:auto;padding:0 0 24px}
.lx-body::-webkit-scrollbar{width:9px;height:9px}
.lx-body::-webkit-scrollbar-track{background:transparent}
.lx-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.lx-page{max-width:560px;margin:0 auto}
.lx-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E1220 75%,rgba(14,18,32,0))}
.lx-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3B3270,#171E38 60%,#0E1220);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid #2E3A5C}
.lx-tt{flex:1;min-width:0}
.lx-tt b{font-size:15px;display:block}
.lx-tt small{color:#8B94A9;font-size:10.5px;display:block;margin-top:1px;cursor:pointer}
.lx-tt small.due{color:#F0B47A}
.lx-tabs{display:flex;gap:4px}
.lx-tab{background:transparent;border:none;color:#8B94A9;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.lx-tab:hover{color:#E6E9F2}
.lx-tab.on{background:#1D2436;color:#E6E9F2;font-weight:600}
.lx-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.lx-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8B7CF6,#5A4FB0);flex-shrink:0}
.lx-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.lx-card{background:#141927;border:1px solid #232B40;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.lx-card-b{padding:11px 13px}
.lx-sub{font-size:10.5px;color:#8B94A9;line-height:1.6}
.lx-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lx-btn{background:#5A4FB0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.lx-btn:hover{filter:brightness(1.12)}
.lx-btn:disabled{opacity:.45;cursor:not-allowed}
.lx-btn.ghost{background:#20263A;color:#E6E9F2;border:1px solid #2a3145}
.lx-btn.danger{background:#3a2030;color:#F08AA8;border:1px solid #542c3e}
.lx-btn.gold{background:#8a6d2f;color:#F7E3B0}
.lx-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.lx-inp{background:#10141f;border:1px solid #2a3145;border-radius:8px;color:#E6E9F2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.lx-inp:focus{outline:none;border-color:#8B7CF6}
.lx-inp::placeholder{color:#4d5566}
.lx-ta{resize:vertical;min-height:56px;font:inherit}
.lx-lbl{font-size:11px;color:#8B94A9;margin:8px 0 4px;display:block}
.lx-sel{background:#10141f;border:1px solid #2a3145;border-radius:8px;color:#E6E9F2;padding:7px 8px;font-size:12px}
.lx-empty{color:#8B94A9;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.lx-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(18,22,34,.96);border:1px solid #232B40;color:#E6E9F2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:220;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.lx-toast.bad{border-color:#542c3e;color:#F08AA8}
.lx-toast.good{border-color:#2b4a35;color:#7EE2A0}
.lx-chip{background:#1D2436;border:1px solid #2a3145;border-radius:999px;color:#B4B8C4;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.lx-chip:hover{border-color:#3a4356}
.lx-chip.on{background:#2b2650;border-color:#8B7CF6;color:#C9C0FA;font-weight:600}
.lx-mapwrap{position:relative;margin:0 16px 8px;border:1px solid #232B40;border-radius:13px;background:radial-gradient(ellipse at 50% 42%,#171E33 0%,#0E1220 70%);overflow:hidden}
.lx-mapwrap canvas{display:block;width:100%;cursor:crosshair}
.lx-legend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:6px 18px 2px;font-size:10px;color:#8B94A9}
.lx-legend i{display:inline-block;vertical-align:-2px;margin-right:3px;border-radius:50%}
.lx-badge{display:inline-block;font-size:10px;padding:1px 7px;border-radius:999px;background:#223047;color:#9FB6DD;white-space:nowrap}
.lx-badge.over{background:#3a2b1c;color:#F0B47A;font-weight:700}
.lx-badge.mat{background:#2b2650;color:#C9C0FA}
.lx-badge.done{background:#1e3a2b;color:#7EE2A0}
.lx-badge.arch{background:#252a36;color:#6E7686}
.lx-due-head{display:flex;align-items:center;gap:8px;padding:9px 13px 2px}
.lx-due-head b{font-size:12.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lx-due-q{margin:4px 13px 0;padding:7px 10px;border-left:2px solid #8B7CF6;background:#191E30;border-radius:0 8px 8px 0;font-size:11.5px;color:#C9C0FA;line-height:1.6}
.lx-due-raw{margin:6px 13px 0;font-size:11.5px;color:#8B94A9;line-height:1.6}
.lx-due-actions{display:flex;gap:6px;padding:9px 13px 12px;flex-wrap:wrap}
.lx-note{margin:8px 13px 0}
.lx-idea{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1c2333;cursor:pointer}
.lx-idea:first-child{border-top:none}
.lx-idea:hover{background:#171d2e}
.lx-idea-main{flex:1;min-width:0}
.lx-idea-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lx-idea-main small{color:#5C6678;font-size:10px}
.lx-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.lx-funnel-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11.5px}
.lx-funnel-row .nm{width:52px;color:#8B94A9;flex-shrink:0}
.lx-funnel-row .tr{flex:1;height:12px;background:#10141f;border-radius:6px;overflow:hidden}
.lx-funnel-row .tr i{display:block;height:100%;background:linear-gradient(90deg,#5A4FB0,#8B7CF6);border-radius:6px}
.lx-funnel-row .ct{width:40px;text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0}
.lx-statgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:2px 0}
.lx-statcell{background:#10141f;border:1px solid #1f2740;border-radius:10px;padding:8px 6px;text-align:center}
.lx-statcell b{font-size:16px;display:block;font-variant-numeric:tabular-nums}
.lx-statcell small{font-size:9.5px;color:#8B94A9}
.lx-weeks{display:flex;align-items:flex-end;gap:4px;height:64px;padding:6px 2px 0}
.lx-weekcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.lx-weekcol i{display:block;width:100%;max-width:18px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#8B7CF6,#5A4FB0);min-height:2px}
.lx-weekcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.lx-drawer{position:fixed;inset:0;background:rgba(6,8,14,.66);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:16px}
.lx-drawer-box{background:#141927;border:1px solid #2a3450;border-radius:14px;width:100%;max-width:560px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden}
.lx-drawer-head{display:flex;align-items:flex-start;gap:10px;padding:12px 14px 8px;border-bottom:1px solid #1c2333}
.lx-drawer-head b{flex:1;min-width:0;font-size:13.5px;line-height:1.45;word-break:break-all}
.lx-drawer-body{overflow:auto;padding:10px 14px 16px}
.lx-drawer-body::-webkit-scrollbar{width:8px}
.lx-drawer-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:4px}
.lx-x{background:#20263A;border:1px solid #2a3145;color:#8B94A9;border-radius:8px;width:26px;height:26px;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0}
.lx-timeline{margin-top:6px}
.lx-tl-item{display:flex;gap:8px;padding:5px 0;border-top:1px dashed #202840;font-size:11px;line-height:1.55}
.lx-tl-item:first-child{border-top:none}
.lx-tl-item .k{flex-shrink:0;width:52px;color:#8B7CF6;font-size:10px;padding-top:1px}
.lx-tl-item .t{color:#AEB4C4;word-break:break-all}
.lx-tl-item .d{color:#5C6678;font-size:9.5px;flex-shrink:0;padding-top:1px}
.lx-relrow{padding:6px 0;border-top:1px dashed #202840;font-size:11.5px;cursor:pointer;line-height:1.5}
.lx-relrow:first-child{border-top:none}
.lx-relrow:hover{color:#C9C0FA}
.lx-editrow{display:flex;gap:6px;margin-top:6px}
`;
function LingxiPanel(props) {
  const { onSendToChat } = props;
  const [tab, setTab] = useState5("map");
  const [ideas, setIdeas] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const [openId, setOpenId] = useState5(null);
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const list2 = await loadAllIdeas();
      setIdeas(list2);
      setLoadErr("");
      return list2;
    } catch (e) {
      setLoadErr(e.message);
      return [];
    }
  }, []);
  useEffect3(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 1e4);
    const onVis = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const now = Date.now();
  const list = ideas || [];
  const dueCount = dueRevisits2(list, now).length;
  const activeCount = list.filter((i) => i.status === "active").length;
  const subtitleCls = dueCount > 0 ? "due" : "";
  const subtitle = ideas === null ? "\u8F7D\u5165\u4E2D\u2026" : `\u5728\u6C60 ${activeCount} \xB7 \u4ECA\u65E5\u56DE\u8BBF ${dueCount}${dueCount > 0 ? " \xB7 \u70B9\u6B64\u7FFB\u724C" : ""}`;
  const sendToChat = useCallback((msg) => {
    if (onSendToChat) return onSendToChat(msg);
    showToast("\u8BE5\u5165\u53E3\u4E0D\u652F\u6301\u5524\u8D77\u5BF9\u8BDD\uFF0C\u8BF7\u5728\u5BF9\u8BDD\u91CC\u76F4\u63A5 @\u7075\u611F\u6C60", "bad");
    return void 0;
  }, [onSendToChat, showToast]);
  const openIdea = useCallback((id) => setOpenId(id), []);
  return /* @__PURE__ */ jsxs6("div", { className: "lx-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "lx-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "lx-logo", children: "\u{1F30C}" }),
      /* @__PURE__ */ jsxs6("div", { className: "lx-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u7075\u611F\u6C60" }),
        /* @__PURE__ */ jsx6("small", { className: subtitleCls, onClick: () => setTab("revisit"), children: subtitle })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "lx-tabs", children: [
        ["map", "\u661F\u56FE"],
        ["revisit", "\u56DE\u8BBF"],
        ["pond", "\u6C60\u5B50"],
        ["stats", "\u7EDF\u8BA1"]
      ].map(([k, label]) => /* @__PURE__ */ jsx6("button", { className: `lx-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "lx-body", children: /* @__PURE__ */ jsxs6("div", { className: "lx-page", children: [
      loadErr && /* @__PURE__ */ jsxs6("div", { className: "lx-sub", style: { color: "#F08AA8", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "map" && /* @__PURE__ */ jsx6(StarMapTab, { ideas: list, onOpenIdea: openIdea }),
      tab === "revisit" && /* @__PURE__ */ jsx6(RevisitTab, { ideas: list, reload, showToast, onOpenIdea: openIdea, onGotoCapture: () => setTab("pond") }),
      tab === "pond" && /* @__PURE__ */ jsx6(PondTab, { ideas: list, reload, showToast, onOpenIdea: openIdea, onSendToChat: sendToChat }),
      tab === "stats" && /* @__PURE__ */ jsx6(StatsTab, { ideas: list })
    ] }) }),
    openId && /* @__PURE__ */ jsx6(
      DetailDrawer,
      {
        id: openId,
        reload,
        showToast,
        onClose: () => setOpenId(null),
        onSendToChat: sendToChat
      }
    ),
    toast && /* @__PURE__ */ jsx6("div", { className: `lx-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function LingxiEntry(props) {
  return /* @__PURE__ */ jsx7(LingxiPanel, { ...props });
}
export {
  LingxiEntry as default
};
