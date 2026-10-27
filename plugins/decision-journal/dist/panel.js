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

// shared/decision-core.js
var require_decision_core = __commonJS({
  "shared/decision-core.js"(exports, module) {
    "use strict";
    var K2 = {
      settings: "decision.settings",
      d: (id) => `decision.d.${id}`,
      dPrefix: "decision.d."
    };
    var DEFAULT_SETTINGS3 = {
      schemaVersion: 1,
      /** decided 时未显式给 reviewInDays 的默认复盘期限（天） */
      reviewDefaultDays: 90
    };
    var DAY_MS3 = 24 * 3600 * 1e3;
    var OUTCOME_META3 = {
      hit: { score: 1, label: "\u5151\u73B0", cls: "good" },
      partial: { score: 0.5, label: "\u90E8\u5206\u5151\u73B0", cls: "warn" },
      miss: { score: 0, label: "\u843D\u7A7A", cls: "bad" },
      void: { score: null, label: "\u4F5C\u5E9F", cls: "muted" }
    };
    var STATUS_META3 = {
      open: { label: "\u7EA0\u7ED3\u4E2D", cls: "open" },
      decided: { label: "\u5B58\u7167\u4E2D", cls: "live" },
      resolved: { label: "\u5DF2\u590D\u76D8", cls: "done" },
      shelved: { label: "\u5DF2\u6401\u7F6E", cls: "muted" }
    };
    var BUCKETS = [
      { key: "<50", label: "<50%", min: 0, max: 49 },
      { key: "50-69", label: "50-69%", min: 50, max: 69 },
      { key: "70-84", label: "70-84%", min: 70, max: 84 },
      { key: "85-100", label: "85-100%", min: 85, max: 100 }
    ];
    var CALIBRATION_MIN_SAMPLE = 5;
    var pad2 = (n) => String(n).padStart(2, "0");
    function dayKeyOf2(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function monthKeyOf(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    }
    function makeId(now) {
      const t = typeof now === "number" ? now : Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return "d" + t.toString(36) + rand;
    }
    var clampInt = (v, lo, hi, fallback) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return fallback;
      return Math.min(hi, Math.max(lo, n));
    };
    var cut = (v, max) => String(v ?? "").slice(0, max);
    function normalizeOptions(raw) {
      if (raw == null) return { options: [] };
      const arr = Array.isArray(raw) ? raw : [raw];
      if (arr.length > 6) return { error: "\u9009\u9879\u6700\u591A 6 \u4E2A" };
      const options = [];
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        const name = cut(typeof it === "string" ? it : it && it.name, 40).trim();
        if (!name) return { error: `\u7B2C ${i + 1} \u4E2A\u9009\u9879\u540D\u4E3A\u7A7A` };
        const note = typeof it === "object" && it ? cut(it.note, 200) : "";
        options.push({ id: `o${i + 1}`, name, note });
      }
      return { options };
    }
    function resolveChosen(chosen, options) {
      if (chosen == null || chosen === "") return { chosenId: null };
      const s = String(chosen).trim();
      if (!options.length) return { error: "\u8BB0\u5F55\u4E86 chosen \u4F46\u8BE5\u51B3\u7B56\u6CA1\u6709\u9009\u9879\uFF0C\u8BF7\u5148\u8865 options" };
      const byId = options.find((o) => o.id === s);
      if (byId) return { chosenId: byId.id };
      const byName = options.find((o) => o.name === s);
      if (byName) return { chosenId: byName.id };
      const idx = /^\d+$/.test(s) ? Number(s) : 0;
      if (idx >= 1 && idx <= options.length) return { chosenId: options[idx - 1].id };
      return { error: `chosen\u300C${s}\u300D\u4E0D\u5339\u914D\u4EFB\u4F55\u9009\u9879\uFF08\u53EF\u9009\uFF1A${options.map((o) => o.name).join("/")}\uFF09` };
    }
    function normalizeExpected(raw) {
      if (raw == null) return { expected: null };
      const text = cut(typeof raw === "string" ? raw : raw.text, 300).trim();
      const confidence = clampInt(typeof raw === "object" && raw ? raw.confidence : void 0, 0, 100, NaN);
      if (!text && !Number.isFinite(confidence)) return { expected: null };
      if (text && !Number.isFinite(confidence)) return { error: "\u9884\u671F\u7F3A confidence\uFF080-100 \u7684\u771F\u5B9E\u628A\u63E1\uFF0C\u65B9\u6CD5\u8BBA\u5FC5\u586B\uFF09" };
      if (!text && Number.isFinite(confidence)) return { error: "\u9884\u671F\u7F3A text\uFF08\u5FC5\u987B\u662F\u53EF\u68C0\u9A8C\u7684\u5177\u4F53\u9648\u8FF0\uFF0C\u5982\u300CX \u5728 N \u5929\u5185\u53D1\u751F\u300D\uFF09" };
      return { expected: { text, confidence } };
    }
    function normalizeDecision(raw, { now = Date.now(), defaultReviewDays = 90 } = {}) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u51B3\u7B56\u6570\u636E" };
      const title = cut(raw.title, 80).trim();
      if (!title) return { error: "title \u5FC5\u586B\uFF08\u4E00\u53E5\u77ED\u8BED\u6982\u62EC\u8FD9\u4E2A\u51B3\u5B9A\uFF0C\u5982\u300C\u8FC1\u79FB RouterBus\u300D\uFF09" };
      const normOpt = normalizeOptions(raw.options);
      if (normOpt.error) return normOpt;
      const options = normOpt.options;
      const chosenRes = resolveChosen(raw.chosen, options);
      if (chosenRes.error) return { error: chosenRes.error };
      const chosenId = chosenRes.chosenId;
      const normExp = normalizeExpected(raw.expected);
      if (normExp.error) return normExp;
      const expected = normExp.expected;
      let status = raw.status;
      if (!["open", "decided"].includes(status)) status = chosenId ? "decided" : "open";
      if (status === "decided" && !chosenId && options.length) {
        return { error: "decided \u6001\u9700\u8981 chosen\uFF08\u9009\u4E86\u54EA\u4E2A\u9009\u9879\uFF09" };
      }
      if (status === "decided" && !expected) {
        return { error: "\u7ACB\u6B64\u5B58\u7167\u9700\u8981\u53EF\u68C0\u9A8C\u7684\u9884\u671F\uFF08expected.text\uFF09\u4E0E\u628A\u63E1\uFF08expected.confidence 0-100\uFF09\u2014\u2014\u6CA1\u6709\u9884\u671F\u5C31\u65E0\u6CD5\u590D\u76D8\u4E0E\u6821\u51C6\u3002\u8BF7\u4E0E\u7528\u6237\u786E\u8BA4\uFF1A\u300C\u8FD9\u4E2A\u51B3\u5B9A\u4F60\u9884\u671F\u7684\u5177\u4F53\u7ED3\u679C\u662F\u4EC0\u4E48\uFF1F\u51E0\u6210\u628A\u63E1\uFF1F\u300D" };
      }
      if (status === "open" && !cut(raw.question, 500).trim() && !options.length) {
        return { error: "open \u6001\u9700\u8981 question\uFF08\u5728\u7EA0\u7ED3\u4EC0\u4E48\uFF09\u6216 options" };
      }
      let reviewAt = null;
      if (Number.isFinite(Number(raw.reviewAt)) && Number(raw.reviewAt) > 0) {
        reviewAt = Number(raw.reviewAt);
      } else if (raw.reviewInDays !== void 0) {
        const days = Number(raw.reviewInDays);
        if (!Number.isFinite(days) || days < 0) return { error: "reviewInDays \u5E94\u4E3A\u975E\u8D1F\u6570\u5B57\uFF080 = \u4E0D\u5B9A\u671F\uFF09" };
        reviewAt = days > 0 ? now + days * DAY_MS3 : null;
      } else if (status === "decided") {
        reviewAt = now + (Number.isFinite(defaultReviewDays) && defaultReviewDays > 0 ? defaultReviewDays : 90) * DAY_MS3;
      }
      const tags = (Array.isArray(raw.tags) ? raw.tags : []).map((t) => cut(t, 20).trim()).filter(Boolean).slice(0, 8);
      const links = (Array.isArray(raw.links) ? raw.links : []).map((t) => cut(t, 40).trim()).filter(Boolean).slice(0, 12);
      const id = typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : makeId(now);
      const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : now;
      const decision = {
        id,
        schemaVersion: 1,
        createdAt,
        updatedAt: now,
        title,
        question: cut(raw.question, 500),
        context: cut(raw.context, 2e3),
        options,
        chosenId: status === "open" ? null : chosenId,
        rationale: cut(raw.rationale, 1e3),
        expected: status === "decided" ? expected : null,
        tags,
        links,
        source: raw.source === "panel" || raw.source === "import" ? raw.source : "ai",
        status,
        decidedAt: status === "decided" ? now : null,
        reviewAt: status === "decided" ? reviewAt : null,
        shelvedReason: "",
        resolution: null
      };
      return { decision };
    }
    function settleDecision(existing, patch, { now = Date.now(), defaultReviewDays = 90 } = {}) {
      if (!existing || typeof existing !== "object") return { error: "\u51B3\u7B56\u4E0D\u5B58\u5728" };
      if (existing.status !== "open") return { error: `\u53EA\u6709\u7EA0\u7ED3\u4E2D\uFF08open\uFF09\u7684\u51B3\u7B56\u80FD\u5B9A\u6848\uFF0C\u5F53\u524D\uFF1A${STATUS_META3[existing.status].label}` };
      const normOpt = normalizeOptions(existing.options);
      const chosenRes = resolveChosen(patch && patch.chosen, normOpt.options || []);
      if (chosenRes.error) return { error: chosenRes.error };
      if (!chosenRes.chosenId) return { error: "\u5B9A\u6848\u9700\u8981 chosen\uFF08\u9009\u4E86\u54EA\u4E2A\u9009\u9879\uFF09" };
      const normExp = normalizeExpected(patch && patch.expected);
      if (normExp.error) return normExp;
      if (!normExp.expected) {
        return { error: "\u5B9A\u6848\u9700\u8981\u53EF\u68C0\u9A8C\u7684\u9884\u671F\uFF08expected.text + confidence 0-100\uFF09\u2014\u2014\u6CA1\u6709\u9884\u671F\u5C31\u65E0\u6CD5\u590D\u76D8\u4E0E\u6821\u51C6\u3002\u8BF7\u4E0E\u7528\u6237\u786E\u8BA4\u3002" };
      }
      const base = { ...existing, options: normOpt.options };
      const rn = normalizeDecision(
        {
          ...base,
          status: "decided",
          chosen: chosenRes.chosenId,
          expected: normExp.expected,
          createdAt: existing.createdAt,
          // settle 允许显式改复盘期限（0 = 不定期）
          ...patch && patch.reviewInDays !== void 0 ? { reviewInDays: patch.reviewInDays } : {},
          ...patch && patch.reviewAt !== void 0 ? { reviewAt: patch.reviewAt } : {}
        },
        { now, defaultReviewDays }
      );
      if (rn.error) return rn;
      const d = rn.decision;
      if (patch && patch.rationale != null) d.rationale = cut(patch.rationale, 1e3);
      if (patch && patch.question != null) d.question = cut(patch.question, 500);
      return { decision: d };
    }
    function outcomeScore(outcome) {
      const m = OUTCOME_META3[outcome];
      return m ? m.score : void 0;
    }
    function resolveDecision(existing, patch, { now = Date.now() } = {}) {
      if (!existing || typeof existing !== "object") return { error: "\u51B3\u7B56\u4E0D\u5B58\u5728" };
      if (!["decided", "resolved"].includes(existing.status)) {
        return { error: existing.status === "open" ? "\u8BE5\u51B3\u7B56\u8FD8\u6CA1\u5B9A\u6848\uFF08open\uFF09\uFF0C\u5148 settle \u7ACB\u6B64\u5B58\u7167\u518D\u590D\u76D8" : `\u5DF2\u6401\u7F6E\u7684\u51B3\u7B56\u4E0D\u590D\u76D8\uFF08\u5982\u9700\u7EE7\u7EED\u8BF7\u5148\u66F4\u65B0\uFF09` };
      }
      const outcome = patch && patch.outcome;
      if (!OUTCOME_META3[outcome]) {
        return { error: "outcome \u5FC5\u987B\u662F hit\uFF08\u5151\u73B0\uFF09/ partial\uFF08\u90E8\u5206\u5151\u73B0\uFF09/ miss\uFF08\u843D\u7A7A\uFF09/ void\uFF08\u4F5C\u5E9F\uFF0C\u4E0D\u8BA1\u5206\uFF09\u4E4B\u4E00" };
      }
      const score = outcomeScore(outcome);
      return {
        decision: {
          ...existing,
          status: "resolved",
          updatedAt: now,
          resolution: {
            outcome,
            score,
            note: cut(patch.note, 1e3),
            surprise: cut(patch.surprise, 500),
            lesson: cut(patch.lesson, 500),
            resolvedAt: now
          }
        }
      };
    }
    function shelveDecision(existing, reason, { now = Date.now() } = {}) {
      if (!existing || typeof existing !== "object") return { error: "\u51B3\u7B56\u4E0D\u5B58\u5728" };
      if (!["open", "decided"].includes(existing.status)) {
        return { error: `\u5DF2\u590D\u76D8\u7684\u51B3\u7B56\u4E0D\u6401\u7F6E\uFF08\u5982\u9700\u53EF\u5220\u9664\u91CD\u5F55\uFF09\uFF0C\u5F53\u524D\uFF1A${STATUS_META3[existing.status].label}` };
      }
      return {
        decision: {
          ...existing,
          status: "shelved",
          shelvedReason: cut(reason, 200),
          updatedAt: now
        }
      };
    }
    function updateDecision(existing, patch, { now = Date.now(), defaultReviewDays = 90 } = {}) {
      if (!existing || typeof existing !== "object") return { error: "\u51B3\u7B56\u4E0D\u5B58\u5728" };
      if (existing.status === "resolved" || existing.status === "shelved") {
        return { error: `${STATUS_META3[existing.status].label}\u7684\u51B3\u7B56\u7528 resolve/delete \u5904\u7406\uFF0C\u4E0D\u505A\u5B57\u6BB5\u7F16\u8F91` };
      }
      const next = { ...existing, updatedAt: now };
      if (patch.title != null) {
        const t = cut(patch.title, 80).trim();
        if (!t) return { error: "title \u4E0D\u80FD\u4E3A\u7A7A" };
        next.title = t;
      }
      if (patch.question != null) next.question = cut(patch.question, 500);
      if (patch.context != null) next.context = cut(patch.context, 2e3);
      if (patch.rationale != null) next.rationale = cut(patch.rationale, 1e3);
      if (patch.options != null) {
        const normOpt = normalizeOptions(patch.options);
        if (normOpt.error) return normOpt;
        next.options = normOpt.options;
        if (next.chosenId && !next.options.some((o) => o.id === next.chosenId)) {
          return { error: "\u66F4\u65B0\u540E\u7684 options \u4E0D\u542B\u5F53\u524D chosenId\uFF0C\u8BF7\u4E00\u5E76\u66F4\u65B0 chosen \u6216\u4FDD\u7559\u539F\u9009\u9879" };
        }
      }
      if (patch.expected !== void 0) {
        if (patch.expected === null || patch.expected === "") {
          if (next.status === "decided") return { error: "decided \u6001\u4E0D\u80FD\u6E05\u7A7A\u9884\u671F\uFF08\u53EF\u6539\u4E3A shelve \u6401\u7F6E\uFF09" };
          next.expected = null;
        } else {
          const normExp = normalizeExpected(patch.expected);
          if (normExp.error) return normExp;
          if (next.status === "decided" && !normExp.expected) return { error: "decided \u6001\u4E0D\u80FD\u6E05\u7A7A\u9884\u671F" };
          next.expected = normExp.expected;
        }
      }
      if (patch.reviewAt !== void 0) {
        if (patch.reviewAt === null) next.reviewAt = null;
        else {
          const t = Number(patch.reviewAt);
          if (!Number.isFinite(t) || t <= 0) return { error: "reviewAt \u5E94\u4E3A\u6B63\u6574\u6570 epoch ms \u6216 null" };
          next.reviewAt = t;
        }
      } else if (patch.reviewInDays !== void 0) {
        const days = Number(patch.reviewInDays);
        if (!Number.isFinite(days) || days < 0) return { error: "reviewInDays \u5E94\u4E3A\u975E\u8D1F\u6570\u5B57\uFF080 = \u4E0D\u5B9A\u671F\uFF09" };
        next.reviewAt = days > 0 ? now + days * DAY_MS3 : null;
      }
      if (patch.tags != null) {
        if (!Array.isArray(patch.tags)) return { error: "tags \u5E94\u4E3A\u5B57\u7B26\u4E32\u6570\u7EC4" };
        next.tags = patch.tags.map((t) => cut(t, 20).trim()).filter(Boolean).slice(0, 8);
      }
      if (patch.links != null) {
        if (!Array.isArray(patch.links)) return { error: "links \u5E94\u4E3A\u51B3\u7B56 id \u6570\u7EC4" };
        next.links = patch.links.map((t) => cut(t, 40).trim()).filter(Boolean).slice(0, 12);
      }
      if (next.status === "open") {
        next.chosenId = null;
        next.expected = null;
        next.reviewAt = null;
        next.decidedAt = null;
      }
      return { decision: next };
    }
    function isDue3(d, now = Date.now()) {
      return !!d && d.status === "decided" && d.reviewAt != null && d.reviewAt <= now;
    }
    function overdueDays2(d, now = Date.now()) {
      if (!isDue3(d, now)) return 0;
      return Math.floor((now - d.reviewAt) / DAY_MS3);
    }
    function buildOverview3(decisions, now = Date.now()) {
      const list = (decisions || []).filter((d) => d && typeof d === "object" && d.id);
      const counts = { open: 0, decided: 0, resolved: 0, shelved: 0 };
      for (const d of list) if (counts[d.status] !== void 0) counts[d.status] += 1;
      const due = list.filter((d) => isDue3(d, now)).sort((a, b) => a.reviewAt - b.reviewAt);
      const upcoming = list.filter((d) => d.status === "decided" && d.reviewAt != null && d.reviewAt > now && d.reviewAt <= now + 7 * DAY_MS3).sort((a, b) => a.reviewAt - b.reviewAt);
      const byStatus = (s) => list.filter((d) => d.status === s).sort((a, b) => b.updatedAt - a.updatedAt);
      return { counts, due, upcoming, byStatus, all: list.slice().sort((a, b) => b.updatedAt - a.updatedAt) };
    }
    function summarize2(d, now = Date.now()) {
      const chosen = d.chosenId && d.options ? (d.options.find((o) => o.id === d.chosenId) || {}).name : "";
      const due = isDue3(d, now);
      return [
        `[${d.id}] ${d.title}`,
        `  \u72B6\u6001\uFF1A${STATUS_META3[d.status].label}${d.status === "decided" && d.expected ? `\uFF08\u628A\u63E1 ${d.expected.confidence}%\uFF09` : ""}${d.status === "resolved" && d.resolution ? `\uFF08${OUTCOME_META3[d.resolution.outcome].label}\uFF09` : ""}`,
        chosen ? `  \u5DF2\u9009\uFF1A${chosen}${d.expected ? ` \xB7 \u9884\u671F\uFF1A${d.expected.text}` : ""}` : d.question ? `  \u95EE\u9898\uFF1A${d.question}` : "",
        d.reviewAt && d.status === "decided" ? `  \u590D\u76D8\u671F\u9650\uFF1A${dayKeyOf2(d.reviewAt)}${due ? ` \u26A0\uFE0F \u5DF2\u5230\u671F${overdueDays2(d, now) ? ` ${overdueDays2(d, now)} \u5929` : ""}` : ""}` : "",
        d.tags.length ? `  \u6807\u7B7E\uFF1A${d.tags.join("/")}` : ""
      ].filter(Boolean).join("\n");
    }
    function computeCalibration4(decisions) {
      const list = (decisions || []).filter(
        (d) => d && d.status === "resolved" && d.resolution && typeof d.resolution === "object"
      );
      const scored = list.filter((d) => d.resolution.outcome !== "void" && d.expected);
      const nVoid = list.length - scored.length;
      let confSum = 0, scoreSum = 0, brierSum = 0;
      const bucketAcc = new Map(BUCKETS.map((b) => [b.key, { n: 0, confSum: 0, scoreSum: 0, brierSum: 0 }]));
      const monthAcc = /* @__PURE__ */ new Map();
      for (const d of scored) {
        const p = d.expected.confidence / 100;
        const s = d.resolution.score;
        confSum += p;
        scoreSum += s;
        brierSum += (p - s) * (p - s);
        const bk = BUCKETS.find((b) => d.expected.confidence >= b.min && d.expected.confidence <= b.max);
        if (bk) {
          const a = bucketAcc.get(bk.key);
          a.n += 1;
          a.confSum += p;
          a.scoreSum += s;
          a.brierSum += (p - s) * (p - s);
        }
        const mk = monthKeyOf(d.resolution.resolvedAt);
        const m = monthAcc.get(mk) || { month: mk, n: 0, scoreSum: 0, confSum: 0 };
        m.n += 1;
        m.scoreSum += s;
        m.confSum += p;
        monthAcc.set(mk, m);
      }
      const r1 = (x) => Math.round(x * 1e3) / 1e3;
      const n = scored.length;
      const avgConf = n ? confSum / n : 0;
      const hitRate = n ? scoreSum / n : 0;
      const brier = n ? brierSum / n : 0;
      const bias = n ? hitRate - avgConf : 0;
      let verdict;
      if (n === 0) verdict = "\u8FD8\u6CA1\u6709\u5DF2\u590D\u76D8\u7684\u53EF\u8BA1\u5206\u51B3\u7B56\u2014\u2014\u5148\u7ACB\u7167\uFF0C\u518D\u590D\u76D8\uFF0C\u66F2\u7EBF\u81EA\u7136\u957F\u51FA\u6765\u3002";
      else if (n < CALIBRATION_MIN_SAMPLE) verdict = `\u6837\u672C\u8FD8\u5C11\uFF08${n} < ${CALIBRATION_MIN_SAMPLE}\uFF09\uFF0C\u66F2\u7EBF\u4EC5\u4F9B\u53C2\u8003\uFF0C\u7EE7\u7EED\u6512\u3002`;
      else if (bias <= -0.1) verdict = "\u7CFB\u7EDF\u6027\u8FC7\u5EA6\u81EA\u4FE1\uFF1A\u81EA\u79F0\u7684\u628A\u63E1\u9AD8\u4E8E\u5B9E\u9645\u5151\u73B0\u7387\uFF0C\u91CD\u5927\u51B3\u5B9A\u5EFA\u8BAE\u628A\u628A\u63E1\u5F80\u4E0B\u4FEE\u4E00\u6863\u3002";
      else if (bias >= 0.1) verdict = "\u7CFB\u7EDF\u6027\u4FDD\u5B88\uFF1A\u5B9E\u9645\u5151\u73B0\u7387\u9AD8\u4E8E\u81EA\u79F0\u628A\u63E1\uFF0C\u4F60\u6BD4\u4F60\u4EE5\u4E3A\u7684\u66F4\u51C6\u3002";
      else verdict = "\u6821\u51C6\u826F\u597D\uFF1A\u81EA\u79F0\u628A\u63E1\u4E0E\u5B9E\u9645\u5151\u73B0\u7387\u57FA\u672C\u543B\u5408\u3002";
      return {
        nScored: n,
        nVoid,
        avgConf: r1(avgConf),
        hitRate: r1(hitRate),
        brier: r1(brier),
        bias: r1(bias),
        verdict,
        buckets: BUCKETS.map((b) => {
          const a = bucketAcc.get(b.key);
          const bn = a.n;
          return {
            key: b.key,
            label: b.label,
            n: bn,
            avgConf: bn ? r1(a.confSum / bn) : 0,
            hitRate: bn ? r1(a.scoreSum / bn) : 0,
            brier: bn ? r1(a.brierSum / bn) : 0
          };
        }),
        byMonth: [...monthAcc.values()].map((m) => ({ month: m.month, n: m.n, avgScore: r1(m.scoreSum / m.n), avgConf: r1(m.confSum / m.n) })).sort((a, b) => a.month < b.month ? -1 : 1)
      };
    }
    function recentLessons3(decisions, limit = 5) {
      return (decisions || []).filter((d) => d && d.status === "resolved" && d.resolution && cut(d.resolution.lesson, 1)).sort((a, b) => b.resolution.resolvedAt - a.resolution.resolvedAt).slice(0, limit).map((d) => ({
        id: d.id,
        title: d.title,
        lesson: d.resolution.lesson,
        outcome: d.resolution.outcome,
        confidence: d.expected ? d.expected.confidence : null,
        resolvedAt: d.resolution.resolvedAt
      }));
    }
    function exportJson3(decisions, settings) {
      return JSON.stringify({
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        app: "decision-journal",
        schemaVersion: 1,
        settings: settings || DEFAULT_SETTINGS3,
        decisions: (decisions || []).slice().sort((a, b) => a.createdAt - b.createdAt)
      }, null, 2);
    }
    module.exports = {
      K: K2,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      DAY_MS: DAY_MS3,
      OUTCOME_META: OUTCOME_META3,
      STATUS_META: STATUS_META3,
      BUCKETS,
      CALIBRATION_MIN_SAMPLE,
      dayKeyOf: dayKeyOf2,
      monthKeyOf,
      makeId,
      clampInt,
      normalizeOptions,
      resolveChosen,
      normalizeExpected,
      normalizeDecision,
      settleDecision,
      resolveDecision,
      shelveDecision,
      updateDecision,
      outcomeScore,
      isDue: isDue3,
      overdueDays: overdueDays2,
      buildOverview: buildOverview3,
      summarize: summarize2,
      computeCalibration: computeCalibration4,
      recentLessons: recentLessons3,
      exportJson: exportJson3
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useRef, useState as useState3 } from "react";

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
var core = __toESM(require_decision_core());
var OUTCOME_META2 = core.OUTCOME_META;
var STATUS_META2 = core.STATUS_META;
var DAY_MS2 = core.DAY_MS;
var DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
var isDue2 = core.isDue;
var computeCalibration2 = core.computeCalibration;
var buildOverview2 = core.buildOverview;
var recentLessons2 = core.recentLessons;
var exportJson2 = core.exportJson;
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
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...DEFAULT_SETTINGS2, ...s && typeof s === "object" ? s : {} };
}
async function saveSettings(s) {
  await kvSet(core.K.settings, s);
}
async function loadAllDecisions() {
  const keys = await kvKeys();
  const dKeys = keys.filter((k) => typeof k === "string" && k.startsWith(core.K.dPrefix)).sort();
  const arrs = await Promise.all(dKeys.map((dk) => kvGet(dk)));
  const list = [];
  for (const v of arrs) {
    if (v && typeof v === "object" && typeof v.id === "string" && typeof v.status === "string") list.push(v);
  }
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
async function saveDecision(d) {
  await kvSet(core.K.d(d.id), d);
}
async function deleteDecision(id) {
  await kvDel(core.K.d(id));
}
function fmtDate(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60 * 1e3) return "\u521A\u521A";
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function reviewLabel(d, now = Date.now()) {
  if (d.status !== "decided") return "";
  if (d.reviewAt == null) return "\u4E0D\u5B9A\u671F";
  const days = Math.ceil((d.reviewAt - now) / DAY_MS2);
  if (days < 0) return `\u903E\u671F ${-days} \u5929`;
  if (days === 0) return "\u4ECA\u5929\u5230\u671F";
  return `${days} \u5929\u540E`;
}
function confidenceWord(c) {
  if (c >= 95) return "\u57FA\u672C\u786E\u5B9A";
  if (c >= 85) return "\u5F88\u6709\u628A\u63E1";
  if (c >= 70) return "\u5927\u6982\u7387";
  if (c >= 50) return "\u8FC7\u534A\u6570";
  return "\u7EAF\u8D4C";
}

// src/HomeTab.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var SAMPLE_PROMPTS = [
  "\u5E2E\u6211\u7ACB\u6B64\u5B58\u7167\uFF1A\u6211\u5728\u7EA0\u7ED3\u8981\u4E0D\u8981\u628A X \u8FC1\u5230 RouterBus\uFF08\u5E2E\u6211\u628A\u8FD9\u4E2A\u4E24\u96BE\u8BB0\u8FDB\u8C0B\u5B9A\uFF09",
  "\u8C0B\u5B9A\u91CC\u6709\u4EC0\u4E48\u51B3\u5B9A\u5FEB\u5230\u671F\u8BE5\u590D\u76D8\u4E86\uFF1F",
  "\u6211\u6700\u8FD1\u7684\u5224\u65AD\u51C6\u4E0D\u51C6\uFF1F\u770B\u770B\u6211\u7684\u51B3\u7B56\u6821\u51C6\u62A5\u544A"
];
function HomeTab({ ctx }) {
  const { overview, cal, decisions, openDetail, showToast, onSendToChat } = ctx;
  const send = async (msg) => {
    if (!onSendToChat) {
      showToast("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u9001\u5165\u804A\u5929", "bad");
      return;
    }
    await onSendToChat(msg);
    showToast("\u5DF2\u9001\u5165\u804A\u5929\u8F93\u5165\u6846", "good");
  };
  const recent = overview.all.slice(0, 5);
  const brierTxt = cal.nScored ? cal.brier.toFixed(2) : "\u2014";
  const hitPct = cal.nScored ? Math.round(cal.hitRate * 100) : null;
  const confPct = cal.nScored ? Math.round(cal.avgConf * 100) : null;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "dj-statrow", style: { padding: "2px 16px 10px" }, children: [
      /* @__PURE__ */ jsxs("div", { className: "dj-stat", children: [
        /* @__PURE__ */ jsx("b", { className: overview.due.length ? "red" : "", children: overview.due.length }),
        /* @__PURE__ */ jsx("small", { children: "\u5230\u671F\u5F85\u590D\u76D8" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dj-stat", children: [
        /* @__PURE__ */ jsx("b", { className: overview.counts.open ? "amber" : "", children: overview.counts.open }),
        /* @__PURE__ */ jsx("small", { children: "\u7EA0\u7ED3\u4E2D" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dj-stat", children: [
        /* @__PURE__ */ jsx("b", { className: "blue", children: overview.counts.decided }),
        /* @__PURE__ */ jsx("small", { children: "\u5B58\u7167\u4E2D" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dj-stat", children: [
        /* @__PURE__ */ jsx("b", { className: "green", children: cal.nScored ? `${hitPct}%` : "\u2014" }),
        /* @__PURE__ */ jsxs("small", { children: [
          "\u547D\u4E2D\u7387",
          confPct != null ? ` / \u628A\u63E1 ${confPct}%` : ""
        ] })
      ] })
    ] }),
    overview.due.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "dj-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "dj-bar" }),
        "\u5230\u671F\u590D\u76D8",
        /* @__PURE__ */ jsx("small", { className: "dj-hint", children: "\u5230\u671F\u5373\u590D\u76D8\uFF0C\u66F2\u7EBF\u624D\u957F\u5F97\u8D77\u6765" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dj-card", children: /* @__PURE__ */ jsx("div", { className: "dj-card-b", style: { paddingTop: 2, paddingBottom: 2 }, children: overview.due.slice(0, 8).map((d) => /* @__PURE__ */ jsxs("div", { className: "dj-item", onClick: () => openDetail(d.id), children: [
        /* @__PURE__ */ jsx("span", { className: "dj-dot live" }),
        /* @__PURE__ */ jsxs("div", { className: "dj-item-main", children: [
          /* @__PURE__ */ jsx("b", { children: d.title }),
          /* @__PURE__ */ jsxs("small", { children: [
            "\u628A\u63E1 ",
            d.expected ? `${d.expected.confidence}%\uFF08${confidenceWord(d.expected.confidence)}\uFF09` : "\u2014",
            " \xB7 ",
            reviewLabel(d)
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { className: "dj-btn sm", onClick: (e) => {
          e.stopPropagation();
          openDetail(d.id);
        }, children: "\u53BB\u590D\u76D8" })
      ] }, d.id)) }) })
    ] }) : null,
    overview.upcoming.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "dj-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "dj-bar" }),
        "\u4E03\u5929\u5185\u5230\u671F"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dj-card", children: /* @__PURE__ */ jsx("div", { className: "dj-card-b", style: { paddingTop: 2, paddingBottom: 2 }, children: overview.upcoming.map((d) => /* @__PURE__ */ jsxs("div", { className: "dj-item", onClick: () => openDetail(d.id), children: [
        /* @__PURE__ */ jsx("span", { className: "dj-dot live" }),
        /* @__PURE__ */ jsxs("div", { className: "dj-item-main", children: [
          /* @__PURE__ */ jsx("b", { children: d.title }),
          /* @__PURE__ */ jsxs("small", { children: [
            fmtDate(d.reviewAt),
            " \xB7 ",
            reviewLabel(d)
          ] })
        ] })
      ] }, d.id)) }) })
    ] }) : null,
    cal.nScored ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "dj-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "dj-bar" }),
        "\u6821\u51C6\u901F\u89C8",
        /* @__PURE__ */ jsxs("small", { className: "dj-hint", children: [
          "Brier ",
          brierTxt,
          "\uFF08\u8D8A\u4F4E\u8D8A\u51C6\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dj-card", children: /* @__PURE__ */ jsx("div", { className: "dj-card-b", children: /* @__PURE__ */ jsx("div", { className: "dj-sub", children: cal.verdict }) }) })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "dj-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "dj-bar" }),
      "\u6700\u8FD1\u52A8\u6001"
    ] }),
    recent.length ? /* @__PURE__ */ jsx("div", { className: "dj-card", children: /* @__PURE__ */ jsx("div", { className: "dj-card-b", style: { paddingTop: 2, paddingBottom: 2 }, children: recent.map((d) => /* @__PURE__ */ jsxs("div", { className: "dj-item", onClick: () => openDetail(d.id), children: [
      /* @__PURE__ */ jsx("span", { className: `dj-dot ${STATUS_META2[d.status].cls}` }),
      /* @__PURE__ */ jsxs("div", { className: "dj-item-main", children: [
        /* @__PURE__ */ jsx("b", { children: d.title }),
        /* @__PURE__ */ jsxs("small", { children: [
          STATUS_META2[d.status].label,
          d.status === "resolved" && d.resolution ? ` \xB7 ${OUTCOME_META2[d.resolution.outcome].label}` : "",
          d.expected && d.status !== "open" ? ` \xB7 \u628A\u63E1 ${d.expected.confidence}%` : "",
          ` \xB7 ${timeAgo(d.updatedAt)}`
        ] })
      ] })
    ] }, d.id)) }) }) : /* @__PURE__ */ jsx("div", { className: "dj-card", children: /* @__PURE__ */ jsxs("div", { className: "dj-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "dj-sub", style: { marginBottom: 8 }, children: [
        "\u8FD8\u6CA1\u6709\u51B3\u7B56\u8BB0\u5F55\u3002\u5F00\u5DE5\u65B9\u5F0F\u4EFB\u9009\uFF1A",
        /* @__PURE__ */ jsx("br", {}),
        "\xB7 \u5728\u804A\u5929\u91CC\u8BF4\u300C\u5E2E\u6211\u7ACB\u6B64\u5B58\u7167\uFF1A\u2026\u2026\u300D\uFF0CAI \u4F1A\u95EE\u4F60\u9884\u671F\u548C\u628A\u63E1",
        /* @__PURE__ */ jsx("br", {}),
        "\xB7 \u6216\u70B9\u53F3\u4E0B\u89D2\u300C\u51B3\u7B56\u300DTab \u624B\u52A8\u65B0\u5EFA"
      ] }),
      SAMPLE_PROMPTS.map((p) => /* @__PURE__ */ jsx("button", { className: "dj-prompt", style: { marginBottom: 7 }, onClick: () => void send(p), children: p }, p))
    ] }) }),
    /* @__PURE__ */ jsx("div", { style: { height: 4 } }),
    decisions && decisions.length > 0 && overview.due.length === 0 && overview.counts.open === 0 ? /* @__PURE__ */ jsx("div", { className: "dj-card", children: /* @__PURE__ */ jsx("div", { className: "dj-card-b", children: /* @__PURE__ */ jsx("div", { className: "dj-sub", children: "\u53F0\u8D26\u5E72\u51C0\uFF1A\u6CA1\u6709\u5230\u671F\u590D\u76D8\uFF0C\u4E5F\u6CA1\u6709\u60AC\u800C\u672A\u51B3\u7684\u4E8B\u3002\u65B0\u7684\u51B3\u5B9A\u505A\u51FA\u6765\u65F6\uFF0C\u968F\u65F6\u56DE\u6765\u7ACB\u6B64\u5B58\u7167\u3002" }) }) }) : null
  ] });
}

// src/ListTab.tsx
import { useEffect, useMemo, useState } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var FILTERS = [
  ["all", "\u5168\u90E8"],
  ["due", "\u5230\u671F"],
  ["open", "\u7EA0\u7ED3\u4E2D"],
  ["decided", "\u5B58\u7167\u4E2D"],
  ["resolved", "\u5DF2\u590D\u76D8"],
  ["shelved", "\u5DF2\u6401\u7F6E"]
];
var HORIZONS = [
  ["30", "30 \u5929"],
  ["90", "90 \u5929"],
  ["180", "\u534A\u5E74"],
  ["365", "\u4E00\u5E74"],
  ["0", "\u4E0D\u5B9A\u671F"]
];
function emptyDraft() {
  return {
    id: "",
    title: "",
    question: "",
    context: "",
    options: [{ name: "", note: "" }, { name: "", note: "" }],
    chosenIdx: 0,
    rationale: "",
    expectedText: "",
    confidence: 70,
    horizon: "90",
    tags: ""
  };
}
function draftOf(d) {
  const days = d.reviewAt ? Math.round((d.reviewAt - (d.decidedAt || d.createdAt)) / 864e5) : 0;
  return {
    id: d.id,
    title: d.title,
    question: d.question,
    context: d.context,
    options: d.options.length ? d.options.map((o) => ({ name: o.name, note: o.note })) : emptyDraft().options,
    chosenIdx: Math.max(0, d.options.findIndex((o) => o.id === d.chosenId)),
    rationale: d.rationale,
    expectedText: d.expected ? d.expected.text : "",
    confidence: d.expected ? d.expected.confidence : 70,
    horizon: String(days > 0 ? days : 0),
    tags: d.tags.join(" ")
  };
}
function ListTab({ ctx, focusId, onFocusConsumed }) {
  const { overview, refresh, showToast, onSendToChat } = ctx;
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("all");
  const [kw, setKw] = useState("");
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [resolveOutcome, setResolveOutcome] = useState("hit");
  const [resolveNote, setResolveNote] = useState("");
  const [resolveSurprise, setResolveSurprise] = useState("");
  const [resolveLesson, setResolveLesson] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (focusId) {
      setActiveId(focusId);
      setView("detail");
      onFocusConsumed();
    }
  }, [focusId, onFocusConsumed]);
  const active = useMemo(
    () => overview.all.find((d) => d.id === activeId) || null,
    [overview.all, activeId]
  );
  const list = useMemo(() => {
    const now = Date.now();
    let arr = overview.all;
    if (filter === "due") arr = arr.filter((d) => isDue2(d, now));
    else if (filter !== "all") arr = arr.filter((d) => d.status === filter);
    if (kw.trim()) {
      const k = kw.trim().toLowerCase();
      arr = arr.filter((d) => `${d.title} ${d.question} ${d.context} ${d.expected ? d.expected.text : ""} ${d.tags.join(" ")}`.toLowerCase().includes(k));
    }
    return arr;
  }, [overview.all, filter, kw]);
  const startCreate = () => {
    setDraft(emptyDraft());
    setView("create");
  };
  const startEdit = (d) => {
    setDraft(draftOf(d));
    setView("edit");
  };
  const startResolve = (d) => {
    setResolveOutcome(d.status === "resolved" && d.resolution ? d.resolution.outcome : "hit");
    setResolveNote(d.resolution ? d.resolution.note : "");
    setResolveSurprise(d.resolution ? d.resolution.surprise : "");
    setResolveLesson(d.resolution ? d.resolution.lesson : "");
    setActiveId(d.id);
    setView("resolve");
  };
  const saveForm = async () => {
    if (busy) return;
    if (!draft.title.trim()) {
      showToast("\u6807\u9898\u5FC5\u586B", "bad");
      return;
    }
    const options = draft.options.map((o, i) => ({ id: `o${i + 1}`, name: o.name.trim(), note: o.note.trim() })).filter((o) => o.name);
    const chosen = options[draft.chosenIdx] ? options[draft.chosenIdx].name : "";
    const expected = draft.expectedText.trim() || draft.confidence != null ? { text: draft.expectedText.trim(), confidence: draft.confidence } : null;
    const tags = draft.tags.split(/\s+/).filter(Boolean);
    const payload = {
      title: draft.title.trim(),
      question: draft.question.trim(),
      context: draft.context.trim(),
      options,
      chosen,
      rationale: draft.rationale.trim(),
      expected,
      tags,
      reviewInDays: Number(draft.horizon)
    };
    setBusy(true);
    try {
      if (view === "edit") {
        const existing = overview.all.find((d) => d.id === draft.id);
        if (!existing) throw new Error("\u539F\u51B3\u7B56\u4E0D\u5B58\u5728");
        const next = { ...existing, updatedAt: Date.now(), ...payload, expected: expected || existing.expected };
        if (payload.chosen && existing.options.length) {
          const match = options.find((o) => o.name === payload.chosen);
          next.chosenId = match ? match.id : existing.chosenId;
        }
        next.reviewAt = Number(draft.horizon) > 0 ? Date.now() + Number(draft.horizon) * 864e5 : null;
        await saveDecision(next);
        showToast("\u5DF2\u4FDD\u5B58", "good");
      } else {
        const existingTitles = new Set(overview.all.map((d2) => d2.title));
        if (existingTitles.has(payload.title) && !window.confirm("\u5DF2\u6709\u540C\u540D\u51B3\u7B56\uFF0C\u4ECD\u8981\u65B0\u5EFA\u5417\uFF1F")) {
          setBusy(false);
          return;
        }
        const now = Date.now();
        const id = `d${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const status = chosen && expected && expected.text ? "decided" : "open";
        if (chosen && (!expected || !expected.text)) {
          showToast("\u5DF2\u9009\u4E86\u65B9\u6848\u4F46\u6CA1\u6709\u9884\u671F\uFF1A\u8BF7\u8865\u4E00\u6761\u53EF\u68C0\u9A8C\u7684\u9884\u671F\uFF08\u6CA1\u6709\u9884\u671F\u5C31\u65E0\u6CD5\u590D\u76D8\uFF09", "bad");
          setBusy(false);
          return;
        }
        const d = {
          id,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          title: payload.title,
          question: payload.question,
          context: payload.context,
          options,
          chosenId: status === "decided" ? options.find((o) => o.name === chosen)?.id ?? null : null,
          rationale: payload.rationale,
          expected: status === "decided" ? expected : null,
          tags,
          links: [],
          source: "panel",
          status,
          decidedAt: status === "decided" ? now : null,
          reviewAt: status === "decided" && Number(draft.horizon) > 0 ? now + Number(draft.horizon) * 864e5 : null,
          shelvedReason: "",
          resolution: null
        };
        await saveDecision(d);
        showToast(status === "decided" ? `\u5DF2\u7ACB\u6B64\u5B58\u7167\uFF0C${draft.horizon === "0" ? "\u4E0D\u5B9A\u671F" : `${draft.horizon} \u5929\u540E`}\u590D\u76D8` : "\u5DF2\u8BB0\u4E0B\u7EA0\u7ED3", "good");
      }
      await refresh();
      setView("list");
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const doResolve = async () => {
    if (busy || !active) return;
    setBusy(true);
    try {
      const next = {
        ...active,
        status: "resolved",
        updatedAt: Date.now(),
        resolution: {
          outcome: resolveOutcome,
          score: OUTCOME_META2[resolveOutcome].score,
          note: resolveNote.trim(),
          surprise: resolveSurprise.trim(),
          lesson: resolveLesson.trim(),
          resolvedAt: Date.now()
        }
      };
      await saveDecision(next);
      showToast(`\u5DF2\u590D\u76D8\uFF1A${OUTCOME_META2[resolveOutcome].label}`, "good");
      await refresh();
      setView("detail");
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const doShelve = async (d) => {
    if (!window.confirm(`\u6401\u7F6E\u300C${d.title}\u300D\uFF1F\uFF08\u4E0D\u8BA1\u5165\u6821\u51C6\uFF0C\u53EF\u968F\u65F6\u5220\u9664\uFF09`)) return;
    await saveDecision({ ...d, status: "shelved", shelvedReason: "\u9762\u677F\u6401\u7F6E", updatedAt: Date.now() });
    showToast("\u5DF2\u6401\u7F6E", "good");
    await refresh();
    setView("list");
  };
  const doDelete = async (d) => {
    if (!window.confirm(`\u5220\u9664\u300C${d.title}\u300D\uFF1F\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    await deleteDecision(d.id);
    showToast("\u5DF2\u5220\u9664", "good");
    await refresh();
    setView("list");
  };
  const askAi = (d) => {
    if (!onSendToChat) {
      showToast("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u9001\u5165\u804A\u5929", "bad");
      return;
    }
    const exp = d.expected ? `\u539F\u9884\u671F\uFF08\u628A\u63E1 ${d.expected.confidence}%\uFF09\uFF1A${d.expected.text}` : "";
    void onSendToChat(`\u5E2E\u6211\u590D\u76D8\u8C0B\u5B9A\u91CC\u7684\u8FD9\u6761\u51B3\u7B56\uFF08id=${d.id}\uFF09\uFF1A${d.title}\u3002${exp}\u5BF9\u7167\u73B0\u5B9E\u5E2E\u6211\u6253\u5206\uFF08\u5151\u73B0/\u90E8\u5206/\u843D\u7A7A/\u4F5C\u5E9F\uFF09\uFF0C\u627E\u504F\u5DEE\u6765\u6E90\uFF0C\u6C89\u6DC0\u4E00\u53E5\u6559\u8BAD\u3002`);
    showToast("\u5DF2\u9001\u5165\u804A\u5929\u8F93\u5165\u6846", "good");
  };
  if (view === "detail" && active) {
    const chosen = active.options.find((o) => o.id === active.chosenId);
    return /* @__PURE__ */ jsxs2("div", { style: { padding: "0 16px" }, children: [
      /* @__PURE__ */ jsx2("button", { className: "dj-back", onClick: () => setView("list"), children: "\u2190 \u8FD4\u56DE\u5217\u8868" }),
      /* @__PURE__ */ jsx2("div", { className: "dj-card", style: { marginTop: 8 }, children: /* @__PURE__ */ jsxs2("div", { className: "dj-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "dj-row", style: { marginBottom: 4 }, children: [
          /* @__PURE__ */ jsx2("span", { className: `dj-dot ${STATUS_META2[active.status].cls}` }),
          /* @__PURE__ */ jsx2("b", { style: { fontSize: 14, flex: 1 }, children: active.title }),
          /* @__PURE__ */ jsx2("small", { style: { color: "#5C6678" }, children: timeAgo(active.updatedAt) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "dj-sub", children: [
          STATUS_META2[active.status].label,
          active.expected ? ` \xB7 \u628A\u63E1 ${active.expected.confidence}%\uFF08${confidenceWord(active.expected.confidence)}\uFF09` : "",
          active.status === "resolved" && active.resolution ? ` \xB7 ${OUTCOME_META2[active.resolution.outcome].label}` : "",
          active.tags.length ? ` \xB7 ${active.tags.join(" / ")}` : ""
        ] }),
        active.context ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u80CC\u666F" }),
          /* @__PURE__ */ jsx2("div", { className: "dj-quote", children: active.context })
        ] }) : null,
        active.question ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u95EE\u9898" }),
          /* @__PURE__ */ jsx2("div", { className: "dj-sub", style: { color: "#C9D4E8" }, children: active.question })
        ] }) : null,
        active.options.length ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u9009\u9879" }),
          active.options.map((o) => /* @__PURE__ */ jsxs2("div", { className: `dj-opt${o.id === active.chosenId ? " chosen" : ""}`, children: [
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 11 }, children: o.id === active.chosenId ? "\u2713" : "\xB7" }),
            /* @__PURE__ */ jsxs2("div", { style: { flex: 1, minWidth: 0 }, children: [
              /* @__PURE__ */ jsx2("div", { style: { fontSize: 12 }, children: o.name }),
              o.note ? /* @__PURE__ */ jsx2("div", { style: { fontSize: 10.5, color: "#5C6678" }, children: o.note }) : null
            ] })
          ] }, o.id))
        ] }) : null,
        active.rationale ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u7406\u7531" }),
          /* @__PURE__ */ jsx2("div", { className: "dj-sub", style: { color: "#C9D4E8" }, children: active.rationale })
        ] }) : null,
        active.expected ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsxs2("div", { className: "dj-lbl", children: [
            "\u9884\u671F\uFF08\u628A\u63E1 ",
            active.expected.confidence,
            "%\uFF09"
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "dj-quote", children: active.expected.text })
        ] }) : null,
        active.status === "decided" ? /* @__PURE__ */ jsxs2("div", { className: "dj-sub", style: { marginTop: 6 }, children: [
          "\u590D\u76D8\u671F\u9650\uFF1A",
          fmtDate(active.reviewAt),
          "\uFF08",
          reviewLabel(active),
          "\uFF09"
        ] }) : null,
        active.resolution ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsxs2("div", { className: "dj-lbl", children: [
            "\u590D\u76D8\uFF08",
            fmtDate(active.resolution.resolvedAt),
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "dj-quote res", children: OUTCOME_META2[active.resolution.outcome].label }),
          active.resolution.note ? /* @__PURE__ */ jsxs2("div", { className: "dj-sub", style: { color: "#C9D4E8", whiteSpace: "pre-wrap" }, children: [
            "\u7ECF\u8FC7\uFF1A",
            active.resolution.note
          ] }) : null,
          active.resolution.surprise ? /* @__PURE__ */ jsxs2("div", { className: "dj-sub", style: { color: "#C9D4E8" }, children: [
            "\u610F\u5916\uFF1A",
            active.resolution.surprise
          ] }) : null,
          active.resolution.lesson ? /* @__PURE__ */ jsxs2("div", { className: "dj-lesson", style: { marginTop: 6 }, children: [
            /* @__PURE__ */ jsx2("b", { children: "\u6559\u8BAD" }),
            /* @__PURE__ */ jsx2("small", { children: active.resolution.lesson })
          ] }) : null
        ] }) : null,
        active.status === "shelved" && active.shelvedReason ? /* @__PURE__ */ jsxs2("div", { className: "dj-sub", style: { marginTop: 6 }, children: [
          "\u6401\u7F6E\u539F\u56E0\uFF1A",
          active.shelvedReason
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs2("div", { className: "dj-row", style: { padding: "2px 2px 14px" }, children: [
        active.status === "decided" || active.status === "resolved" ? /* @__PURE__ */ jsx2("button", { className: "dj-btn", onClick: () => startResolve(active), children: "\u590D\u76D8\u6253\u5206" }) : null,
        active.status === "open" || active.status === "decided" ? /* @__PURE__ */ jsx2("button", { className: "dj-btn ghost", onClick: () => startEdit(active), children: "\u7F16\u8F91" }) : null,
        /* @__PURE__ */ jsx2("button", { className: "dj-btn ghost", onClick: () => askAi(active), children: "\u8BA9 AI \u590D\u76D8" }),
        active.status === "open" || active.status === "decided" ? /* @__PURE__ */ jsx2("button", { className: "dj-btn ghost", onClick: () => void doShelve(active), children: "\u6401\u7F6E" }) : null,
        /* @__PURE__ */ jsx2("button", { className: "dj-btn danger", onClick: () => void doDelete(active), children: "\u5220\u9664" })
      ] })
    ] });
  }
  if (view === "resolve" && active) {
    return /* @__PURE__ */ jsxs2("div", { style: { padding: "0 16px" }, children: [
      /* @__PURE__ */ jsx2("button", { className: "dj-back", onClick: () => setView(active.status === "resolved" ? "detail" : "list"), children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ jsx2("div", { className: "dj-card", style: { marginTop: 8 }, children: /* @__PURE__ */ jsxs2("div", { className: "dj-card-b", children: [
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 13.5 }, children: active.title }),
        active.expected ? /* @__PURE__ */ jsxs2("div", { className: "dj-quote", children: [
          "\u539F\u9884\u671F\uFF08\u628A\u63E1 ",
          active.expected.confidence,
          "%\uFF09\uFF1A",
          active.expected.text
        ] }) : null,
        /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u7ED3\u679C\u5BF9\u7167\u9884\u671F" }),
        /* @__PURE__ */ jsx2("div", { className: "dj-outcomes", children: ["hit", "partial", "miss", "void"].map((o) => /* @__PURE__ */ jsx2("button", { className: resolveOutcome === o ? `on-${o}` : "", onClick: () => setResolveOutcome(o), children: OUTCOME_META2[o].label }, o)) }),
        /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u5B9E\u9645\u53D1\u751F\u4E86\u4EC0\u4E48" }),
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            className: "dj-inp",
            rows: 3,
            value: resolveNote,
            onChange: (e) => setResolveNote(e.target.value),
            placeholder: "\u5BF9\u7167\u9884\u671F\u9010\u6761\u8BF4\uFF1A\u54EA\u4E9B\u53D1\u751F\u4E86\u3001\u54EA\u4E9B\u6CA1\u6709"
          }
        ),
        /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u610F\u6599\u4E4B\u5916\uFF08\u53EF\u9009\uFF09" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dj-inp",
            value: resolveSurprise,
            onChange: (e) => setResolveSurprise(e.target.value),
            placeholder: "\u6709\u4EC0\u4E48\u5F53\u65F6\u6CA1\u60F3\u5230\u7684"
          }
        ),
        /* @__PURE__ */ jsx2("div", { className: "dj-lbl", children: "\u4E00\u53E5\u6559\u8BAD\uFF08\u5F3A\u70C8\u5EFA\u8BAE\uFF09" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dj-inp",
            value: resolveLesson,
            onChange: (e) => setResolveLesson(e.target.value),
            placeholder: "\u6C89\u6DC0\u6210\u53EF\u590D\u7528\u7684\u4E00\u53E5\u8BDD\uFF0C\u4F1A\u8FDB\u7ECF\u9A8C\u5361"
          }
        ),
        resolveOutcome === "void" ? /* @__PURE__ */ jsx2("div", { className: "dj-sub", style: { marginTop: 6 }, children: "\u4F5C\u5E9F\u4E0D\u8BA1\u5165\u6821\u51C6\uFF08\u524D\u63D0\u6D88\u5931/\u51B3\u5B9A\u88AB\u63A8\u7FFB\u65F6\u7528\uFF09\u3002" }) : null
      ] }) }),
      /* @__PURE__ */ jsxs2("div", { className: "dj-row", style: { padding: "2px 2px 14px" }, children: [
        /* @__PURE__ */ jsx2("button", { className: "dj-btn", disabled: busy, onClick: () => void doResolve(), children: "\u63D0\u4EA4\u590D\u76D8" }),
        /* @__PURE__ */ jsx2("button", { className: "dj-btn ghost", onClick: () => setView(active.status === "resolved" ? "detail" : "list"), children: "\u53D6\u6D88" })
      ] })
    ] });
  }
  if (view === "create" || view === "edit") {
    return /* @__PURE__ */ jsxs2("div", { style: { padding: "0 16px" }, children: [
      /* @__PURE__ */ jsx2("button", { className: "dj-back", onClick: () => setView("list"), children: "\u2190 \u8FD4\u56DE\u5217\u8868" }),
      /* @__PURE__ */ jsx2("div", { className: "dj-card", style: { marginTop: 8 }, children: /* @__PURE__ */ jsxs2("div", { className: "dj-card-b", children: [
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u6807\u9898\uFF08\u4E00\u53E5\u77ED\u8BED\u6982\u62EC\u8FD9\u4E2A\u51B3\u5B9A\uFF09" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dj-inp",
            value: draft.title,
            onChange: (e) => setDraft({ ...draft, title: e.target.value }),
            placeholder: "\u5982\uFF1A\u8FC1\u79FB RouterBus"
          }
        ),
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u80CC\u666F\u4E0E\u7EA6\u675F\uFF08\u53EF\u9009\uFF09" }),
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            className: "dj-inp",
            rows: 2,
            value: draft.context,
            onChange: (e) => setDraft({ ...draft, context: e.target.value }),
            placeholder: "\u4E3A\u4EC0\u4E48\u73B0\u5728\u8981\u51B3\u5B9A\u3001\u6709\u4EC0\u4E48\u9650\u5236"
          }
        ),
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u9009\u9879\uFF08\u7559\u7A7A\u9879\u5FFD\u7565\uFF0C\u22646 \u4E2A\uFF09" }),
        draft.options.map((o, i) => /* @__PURE__ */ jsxs2("div", { className: `dj-opt${draft.chosenIdx === i ? " chosen" : ""}`, children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "radio",
              name: "dj-chosen",
              checked: draft.chosenIdx === i,
              onChange: () => setDraft({ ...draft, chosenIdx: i })
            }
          ),
          /* @__PURE__ */ jsx2("input", { value: o.name, onChange: (e) => {
            const options = draft.options.slice();
            options[i] = { ...o, name: e.target.value };
            setDraft({ ...draft, options });
          }, placeholder: `\u9009\u9879 ${i + 1}` }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "dj-btn sm ghost",
              style: { flexShrink: 0 },
              onClick: () => {
                const options = draft.options.filter((_, j) => j !== i);
                setDraft({ ...draft, options: options.length ? options : [{ name: "", note: "" }], chosenIdx: 0 });
              },
              children: "\xD7"
            }
          )
        ] }, i)),
        /* @__PURE__ */ jsxs2("div", { className: "dj-row", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "dj-btn sm ghost",
              disabled: draft.options.length >= 6,
              onClick: () => setDraft({ ...draft, options: [...draft.options, { name: "", note: "" }] }),
              children: "+ \u52A0\u9009\u9879"
            }
          ),
          draft.chosenIdx >= 0 && draft.options[draft.chosenIdx] && draft.options[draft.chosenIdx].name ? /* @__PURE__ */ jsxs2("small", { style: { color: "#9EC4FF" }, children: [
            "\u5DF2\u9009\uFF1A",
            draft.options[draft.chosenIdx].name
          ] }) : /* @__PURE__ */ jsx2("small", { style: { color: "#5C6678" }, children: "\u70B9\u5706\u5708\u6807\u8BB0\u6240\u9009\u65B9\u6848" })
        ] }),
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u7406\u7531\uFF08\u53EF\u9009\uFF09" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dj-inp",
            value: draft.rationale,
            onChange: (e) => setDraft({ ...draft, rationale: e.target.value }),
            placeholder: "\u4E3A\u4EC0\u4E48\u9009\u5B83"
          }
        ),
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u53EF\u68C0\u9A8C\u7684\u9884\u671F\uFF08\u7ACB\u6B64\u5B58\u7167\u7684\u94A5\u5319\uFF09" }),
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            className: "dj-inp",
            rows: 2,
            value: draft.expectedText,
            onChange: (e) => setDraft({ ...draft, expectedText: e.target.value }),
            placeholder: "\u5982\uFF1A\u4E09\u4E2A\u6708\u5185\u5B8C\u6210\u8FC1\u79FB\u4E14\u96F6\u6570\u636E\u4E22\u5931\uFF08\u8981\u542B\u65F6\u95F4\u8303\u56F4\u4E0E\u53EF\u89C2\u5BDF\u5224\u636E\uFF09"
          }
        ),
        /* @__PURE__ */ jsxs2("label", { className: "dj-lbl", children: [
          "\u628A\u63E1 ",
          /* @__PURE__ */ jsxs2("span", { className: "dj-conf-num", children: [
            draft.confidence,
            "%"
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "dj-conf-word", children: confidenceWord(draft.confidence) })
        ] }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "range",
            min: 0,
            max: 100,
            step: 5,
            className: "dj-range",
            value: draft.confidence,
            onChange: (e) => setDraft({ ...draft, confidence: Number(e.target.value) })
          }
        ),
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u590D\u76D8\u671F\u9650" }),
        /* @__PURE__ */ jsx2("div", { className: "dj-row", children: HORIZONS.map(([v, label]) => /* @__PURE__ */ jsx2(
          "button",
          {
            className: `dj-chip${draft.horizon === v ? " on" : ""}`,
            onClick: () => setDraft({ ...draft, horizon: v }),
            children: label
          },
          v
        )) }),
        /* @__PURE__ */ jsx2("label", { className: "dj-lbl", children: "\u6807\u7B7E\uFF08\u7A7A\u683C\u5206\u9694\uFF0C\u53EF\u9009\uFF09" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dj-inp",
            value: draft.tags,
            onChange: (e) => setDraft({ ...draft, tags: e.target.value }),
            placeholder: "\u5982\uFF1A\u67B6\u6784 \u8FC1\u79FB"
          }
        )
      ] }) }),
      /* @__PURE__ */ jsxs2("div", { className: "dj-row", style: { padding: "2px 2px 14px" }, children: [
        /* @__PURE__ */ jsx2("button", { className: "dj-btn", disabled: busy, onClick: () => void saveForm(), children: view === "edit" ? "\u4FDD\u5B58" : "\u7ACB\u6B64\u5B58\u7167" }),
        /* @__PURE__ */ jsx2("button", { className: "dj-btn ghost", onClick: () => setView("list"), children: "\u53D6\u6D88" })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 6, padding: "2px 16px 8px", flexWrap: "wrap" }, children: FILTERS.map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `dj-chip${filter === k ? " on" : ""}`, onClick: () => setFilter(k), children: label }, k)) }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, padding: "0 16px 10px" }, children: [
      /* @__PURE__ */ jsx2("input", { className: "dj-inp", value: kw, onChange: (e) => setKw(e.target.value), placeholder: "\u641C\u7D22\u6807\u9898/\u80CC\u666F/\u9884\u671F/\u6807\u7B7E" }),
      /* @__PURE__ */ jsx2("button", { className: "dj-btn", style: { flexShrink: 0 }, onClick: startCreate, children: "\u65B0\u5EFA" })
    ] }),
    list.length ? /* @__PURE__ */ jsx2("div", { className: "dj-card", children: /* @__PURE__ */ jsx2("div", { className: "dj-card-b", style: { paddingTop: 2, paddingBottom: 2 }, children: list.map((d) => {
      const dueNow = isDue2(d);
      return /* @__PURE__ */ jsxs2("div", { className: "dj-item", onClick: () => {
        setActiveId(d.id);
        setView("detail");
      }, children: [
        /* @__PURE__ */ jsx2("span", { className: `dj-dot ${dueNow ? "bad" : STATUS_META2[d.status].cls}` }),
        /* @__PURE__ */ jsxs2("div", { className: "dj-item-main", children: [
          /* @__PURE__ */ jsx2("b", { children: d.title }),
          /* @__PURE__ */ jsxs2("small", { children: [
            STATUS_META2[d.status].label,
            d.expected && d.status !== "open" ? ` \xB7 \u628A\u63E1 ${d.expected.confidence}%` : "",
            d.status === "resolved" && d.resolution ? ` \xB7 ${OUTCOME_META2[d.resolution.outcome].label}` : "",
            d.status === "decided" && d.reviewAt ? ` \xB7 ${reviewLabel(d)}` : "",
            d.tags.length ? ` \xB7 ${d.tags.join("/")}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsx2("small", { style: { color: "#5C6678", flexShrink: 0 }, children: timeAgo(d.updatedAt) })
      ] }, d.id);
    }) }) }) : /* @__PURE__ */ jsx2("div", { className: "dj-empty", children: kw || filter !== "all" ? "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u51B3\u7B56\u3002" : "\u8FD8\u6CA1\u6709\u51B3\u7B56\u3002\u70B9\u300C\u65B0\u5EFA\u300D\uFF0C\u6216\u5728\u804A\u5929\u91CC\u8BF4\u300C\u5E2E\u6211\u7ACB\u6B64\u5B58\u7167\uFF1A\u2026\u2026\u300D\u3002" })
  ] });
}

// src/StatsTab.tsx
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var W = 320;
var H = 200;
var PAD_L = 36;
var PAD_R = 14;
var PAD_T = 14;
var PAD_B = 34;
var xOf = (conf) => PAD_L + (W - PAD_L - PAD_R) * conf / 100;
var yOf = (rate) => PAD_T + (H - PAD_T - PAD_B) * (1 - rate);
var BUCKET_MID = { "<50": 25, "50-69": 60, "70-84": 77, "85-100": 93 };
function StatsTab({ ctx, openDetail }) {
  const { decisions, cal } = ctx;
  const lessons = recentLessons2(decisions, 8);
  const scored = cal.buckets.filter((b) => b.n > 0);
  const months = [];
  if (cal.byMonth.length) {
    const last = cal.byMonth[cal.byMonth.length - 1].month;
    const [ly, lm] = last.split("-").map(Number);
    for (let i = 7; i >= 0; i--) {
      const d = new Date(ly, lm - 1 - i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const hit = cal.byMonth.find((m) => m.month === mk);
      months.push({ month: mk, n: hit ? hit.n : 0, avgScore: hit ? hit.avgScore : 0 });
    }
  }
  const maxN = Math.max(1, ...months.map((m) => m.n));
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "dj-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "dj-bar" }),
      "\u6821\u51C6\u66F2\u7EBF",
      /* @__PURE__ */ jsx3("small", { className: "dj-hint", children: "\u70B9\u5728\u5BF9\u89D2\u7EBF\u4E0A=\u628A\u63E1\u4E0E\u7ED3\u679C\u76F8\u7B26" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "dj-card", children: /* @__PURE__ */ jsx3("div", { className: "dj-card-b dj-cal-wrap", children: cal.nScored ? /* @__PURE__ */ jsxs3("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", display: "block" }, children: [
      [0, 0.25, 0.5, 0.75, 1].map((r) => /* @__PURE__ */ jsxs3("g", { children: [
        /* @__PURE__ */ jsx3("line", { x1: PAD_L, y1: yOf(r), x2: W - PAD_R, y2: yOf(r), stroke: "#222936", strokeWidth: "1" }),
        /* @__PURE__ */ jsxs3("text", { x: PAD_L - 5, y: yOf(r) + 3, fill: "#5C6678", fontSize: "8.5", textAnchor: "end", children: [
          r * 100,
          "%"
        ] })
      ] }, r)),
      [0, 25, 50, 75, 100].map((c) => /* @__PURE__ */ jsx3("text", { x: xOf(c), y: H - PAD_B + 12, fill: "#5C6678", fontSize: "8.5", textAnchor: "middle", children: c }, c)),
      /* @__PURE__ */ jsx3("text", { x: (W + PAD_L) / 2, y: H - 4, fill: "#5C6678", fontSize: "9", textAnchor: "middle", children: "\u81EA\u79F0\u628A\u63E1 \u2192" }),
      /* @__PURE__ */ jsx3("line", { x1: xOf(0), y1: yOf(0), x2: xOf(100), y2: yOf(1), stroke: "#3a4356", strokeWidth: "1", strokeDasharray: "4 3" }),
      scored.map((b) => {
        const x = xOf(BUCKET_MID[b.key] ?? 50);
        const y = yOf(b.hitRate);
        return /* @__PURE__ */ jsxs3("g", { children: [
          /* @__PURE__ */ jsx3("circle", { cx: x, cy: y, r: 5 + Math.min(4, b.n), fill: b.hitRate >= (BUCKET_MID[b.key] ?? 50) / 100 ? "#3FB950" : "#F85149", opacity: "0.9" }),
          /* @__PURE__ */ jsxs3("text", { x, y: y - 10, fill: "#C9D4E8", fontSize: "9", textAnchor: "middle", children: [
            Math.round(b.hitRate * 100),
            "%"
          ] }),
          /* @__PURE__ */ jsx3("text", { x, y: y + 3.5, fill: "#0e1116", fontSize: "7.5", fontWeight: "700", textAnchor: "middle", children: b.n })
        ] }, b.key);
      })
    ] }) : /* @__PURE__ */ jsx3("div", { className: "dj-empty", children: "\u8FD8\u6CA1\u6709\u53EF\u8BA1\u5206\u7684\u590D\u76D8\u3002\u5148\u7ACB\u6B64\u5B58\u7167\uFF0C\u5230\u671F\u590D\u76D8\uFF0C\u66F2\u7EBF\u81EA\u7136\u957F\u51FA\u6765\u3002" }) }) }),
    cal.nScored ? /* @__PURE__ */ jsx3("div", { className: "dj-card", children: /* @__PURE__ */ jsxs3("div", { className: "dj-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "dj-row", style: { alignItems: "baseline", gap: 14 }, children: [
        /* @__PURE__ */ jsxs3("span", { children: [
          /* @__PURE__ */ jsx3("span", { className: "dj-big", style: { color: "#9EC4FF" }, children: cal.brier.toFixed(2) }),
          /* @__PURE__ */ jsx3("br", {}),
          /* @__PURE__ */ jsx3("small", { style: { color: "#5C6678", fontSize: 10 }, children: "Brier\uFF080 \u5B8C\u7F8E \xB7 0.25 \u778E\u731C\uFF09" })
        ] }),
        /* @__PURE__ */ jsxs3("span", { children: [
          /* @__PURE__ */ jsxs3("span", { className: "dj-big", style: { color: "#7EE2A0" }, children: [
            Math.round(cal.hitRate * 100),
            "%"
          ] }),
          /* @__PURE__ */ jsx3("br", {}),
          /* @__PURE__ */ jsx3("small", { style: { color: "#5C6678", fontSize: 10 }, children: "\u5B9E\u9645\u547D\u4E2D\u7387" })
        ] }),
        /* @__PURE__ */ jsxs3("span", { children: [
          /* @__PURE__ */ jsxs3("span", { className: "dj-big", style: { color: "#F2C063" }, children: [
            Math.round(cal.avgConf * 100),
            "%"
          ] }),
          /* @__PURE__ */ jsx3("br", {}),
          /* @__PURE__ */ jsx3("small", { style: { color: "#5C6678", fontSize: 10 }, children: "\u5E73\u5747\u81EA\u79F0\u628A\u63E1" })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "dj-sub", style: { marginTop: 8 }, children: cal.verdict }),
      cal.nVoid ? /* @__PURE__ */ jsxs3("div", { className: "dj-sub", children: [
        "\u53E6\u6709 ",
        cal.nVoid,
        " \u6761\u590D\u76D8\u4E3A\u300C\u4F5C\u5E9F\u300D\uFF0C\u4E0D\u8BA1\u5206\u3002"
      ] }) : null,
      /* @__PURE__ */ jsxs3("table", { className: "dj-table", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("th", { children: "\u628A\u63E1\u533A\u95F4" }),
          /* @__PURE__ */ jsx3("th", { children: "\u6837\u672C" }),
          /* @__PURE__ */ jsx3("th", { children: "\u547D\u4E2D\u7387" }),
          /* @__PURE__ */ jsx3("th", { children: "\u5E73\u5747\u628A\u63E1" }),
          /* @__PURE__ */ jsx3("th", { children: "Brier" })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: cal.buckets.map((b) => /* @__PURE__ */ jsxs3("tr", { style: { opacity: b.n ? 1 : 0.4 }, children: [
          /* @__PURE__ */ jsx3("td", { children: b.label }),
          /* @__PURE__ */ jsx3("td", { children: b.n }),
          /* @__PURE__ */ jsx3("td", { children: b.n ? `${Math.round(b.hitRate * 100)}%` : "\u2014" }),
          /* @__PURE__ */ jsx3("td", { children: b.n ? `${Math.round(b.avgConf * 100)}%` : "\u2014" }),
          /* @__PURE__ */ jsx3("td", { children: b.n ? b.brier.toFixed(2) : "\u2014" })
        ] }, b.key)) })
      ] })
    ] }) }) : null,
    months.length && cal.nScored ? /* @__PURE__ */ jsxs3(Fragment3, { children: [
      /* @__PURE__ */ jsxs3("div", { className: "dj-sec", children: [
        /* @__PURE__ */ jsx3("i", { className: "dj-bar" }),
        "\u590D\u76D8\u8282\u594F",
        /* @__PURE__ */ jsx3("small", { className: "dj-hint", children: "\u67F1\u9AD8=\u590D\u76D8\u6570\uFF0C\u989C\u8272\u6DF1\u6D45=\u5E73\u5747\u5206" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "dj-card", children: /* @__PURE__ */ jsx3("div", { className: "dj-card-b", children: /* @__PURE__ */ jsx3("div", { className: "dj-monthbar", children: months.map((m) => /* @__PURE__ */ jsxs3("div", { className: "dj-monthcol", children: [
        /* @__PURE__ */ jsx3("i", { style: { height: `${Math.max(3, m.n / maxN * 100)}%`, opacity: m.n ? 0.35 + m.avgScore * 0.65 : 0.15 } }),
        /* @__PURE__ */ jsx3("small", { children: m.month.slice(5) })
      ] }, m.month)) }) }) })
    ] }) : null,
    /* @__PURE__ */ jsxs3("div", { className: "dj-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "dj-bar" }),
      "\u7ECF\u9A8C\u5361",
      /* @__PURE__ */ jsx3("small", { className: "dj-hint", children: "\u590D\u76D8\u6C89\u6DC0\u7684\u6559\u8BAD\uFF0CAI \u51B3\u7B56\u65F6\u53EF\u5F15\u7528" })
    ] }),
    lessons.length ? /* @__PURE__ */ jsx3("div", { className: "dj-card", children: /* @__PURE__ */ jsx3("div", { className: "dj-card-b", children: lessons.map((l) => /* @__PURE__ */ jsxs3("div", { className: "dj-lesson", style: { cursor: "pointer" }, onClick: () => openDetail(l.id), children: [
      /* @__PURE__ */ jsxs3("b", { children: [
        l.title,
        " ",
        /* @__PURE__ */ jsx3("span", { style: { color: "#5C6678", fontWeight: 400, fontSize: 10 }, children: fmtDate(l.resolvedAt) })
      ] }),
      /* @__PURE__ */ jsx3("small", { children: l.lesson })
    ] }, l.id)) }) }) : /* @__PURE__ */ jsx3("div", { className: "dj-card", children: /* @__PURE__ */ jsx3("div", { className: "dj-card-b", children: /* @__PURE__ */ jsx3("div", { className: "dj-sub", children: "\u8FD8\u6CA1\u6709\u6559\u8BAD\u6C89\u6DC0\u3002\u590D\u76D8\u65F6\u5199\u4E00\u53E5\u300C\u4E0B\u6B21\u600E\u4E48\u529E\u300D\uFF0C\u5B83\u4EEC\u4F1A\u53D8\u6210\u4F60\u51B3\u7B56\u65F6\u6700\u503C\u94B1\u7684\u53C2\u8003\u3002" }) }) })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState2 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ ctx }) {
  const { settings, refresh, showToast, decisions } = ctx;
  const [days, setDays] = useState2(String(settings.reviewDefaultDays));
  const [confirmWipe, setConfirmWipe] = useState2(false);
  const [busy, setBusy] = useState2(false);
  const saveDays = async () => {
    const n = Math.round(Number(days));
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      showToast("\u671F\u9650\u5E94\u4E3A 1-3650 \u7684\u5929\u6570", "bad");
      return;
    }
    setBusy(true);
    try {
      await saveSettings({ ...settings, reviewDefaultDays: n });
      await refresh();
      showToast("\u5DF2\u4FDD\u5B58", "good");
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const doExport = async () => {
    try {
      const ds = decisions && decisions.length ? decisions : await loadAllDecisions();
      const json = exportJson2(ds, settings);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decision-journal-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4e3);
      showToast(`\u5DF2\u5BFC\u51FA ${ds.length} \u6761`, "good");
    } catch (e) {
      showToast(e.message, "bad");
    }
  };
  const doWipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    setBusy(true);
    try {
      for (const d of decisions || []) {
        await deleteDecision(d.id);
      }
      setConfirmWipe(false);
      await refresh();
      showToast("\u53F0\u8D26\u5DF2\u6E05\u7A7A", "good");
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "dj-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "dj-bar" }),
      "\u590D\u76D8\u8282\u594F"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dj-card", children: /* @__PURE__ */ jsxs4("div", { className: "dj-card-b", children: [
      /* @__PURE__ */ jsx4("label", { className: "dj-lbl", style: { marginTop: 0 }, children: "\u9ED8\u8BA4\u590D\u76D8\u671F\u9650\uFF08\u5929\uFF09" }),
      /* @__PURE__ */ jsxs4("div", { className: "dj-row", children: [
        /* @__PURE__ */ jsx4("input", { className: "dj-inp", style: { width: 110 }, value: days, onChange: (e) => setDays(e.target.value), inputMode: "numeric" }),
        /* @__PURE__ */ jsx4("button", { className: "dj-btn", disabled: busy, onClick: () => void saveDays(), children: "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "dj-sub", style: { marginTop: 6 }, children: [
        "\u7ACB\u6B64\u5B58\u7167\u65F6\u672A\u663E\u5F0F\u6307\u5B9A\u671F\u9650\u7684\u51B3\u7B56\uFF0C\u6309\u6B64\u5929\u6570\u8BBE\u7F6E\u590D\u76D8\u5230\u671F\u65E5\uFF08\u5F53\u524D ",
        settings.reviewDefaultDays,
        " \u5929\uFF1B\u63D2\u4EF6\u7F3A\u7701 ",
        DEFAULT_SETTINGS2.reviewDefaultDays,
        " \u5929\uFF09\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "dj-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "dj-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dj-card", children: /* @__PURE__ */ jsxs4("div", { className: "dj-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "dj-row", children: [
        /* @__PURE__ */ jsx4("button", { className: "dj-btn ghost", onClick: () => void doExport(), children: "\u5BFC\u51FA JSON" }),
        /* @__PURE__ */ jsx4("button", { className: `dj-btn ${confirmWipe ? "danger" : "ghost"}`, disabled: busy, onClick: () => void doWipe(), children: confirmWipe ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A" : "\u6E05\u7A7A\u53F0\u8D26" }),
        confirmWipe ? /* @__PURE__ */ jsx4("button", { className: "dj-btn ghost", onClick: () => setConfirmWipe(false), children: "\u53D6\u6D88" }) : null
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "dj-sub", style: { marginTop: 6 }, children: [
        "\u53F0\u8D26\u5171 ",
        decisions ? decisions.length : 0,
        " \u6761\uFF0C\u5B58\u4E8E Polaris \u6570\u636E\u6839\uFF08cap.kv\uFF0Cdecision.* \u952E\u7A7A\u95F4\uFF09\uFF0C\u968F\u4E3B\u5E94\u7528\u5907\u4EFD\u7B56\u7565\u8D70\u3002\u6570\u636E\u4E0D\u51FA\u8BBE\u5907\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "dj-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "dj-bar" }),
      "\u65B9\u6CD5\u8BBA\u5907\u5FD8"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dj-card", children: /* @__PURE__ */ jsx4("div", { className: "dj-card-b", children: /* @__PURE__ */ jsxs4("div", { className: "dj-sub", children: [
      "\xB7 \u9884\u671F\u5FC5\u987B\u53EF\u68C0\u9A8C\uFF1A\u65F6\u95F4\u8303\u56F4 + \u53EF\u89C2\u5BDF\u5224\u636E\uFF0C\u62D2\u7EDD\u300C\u4F1A\u66F4\u597D\u300D\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u628A\u63E1\u662F\u771F\u5B9E\u6982\u7387\u4E0D\u662F\u613F\u671B\uFF1A\u8BF4\u300C\u516B\u6210\u300D\u5C31\u586B 80\uFF0C\u6821\u51C6\u66F2\u7EBF\u624D\u4F1A\u5BF9\u4F60\u8BDA\u5B9E\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5230\u671F\u5C31\u590D\u76D8\uFF1A\u5151\u73B0 / \u90E8\u5206\u5151\u73B0 / \u843D\u7A7A\u6253\u5206\u6821\u51C6\uFF0C\u4F5C\u5E9F\uFF08\u524D\u63D0\u6D88\u5931\uFF09\u4E0D\u8BA1\u5206\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u590D\u76D8\u5199\u4E00\u53E5\u6559\u8BAD\uFF1A\u7ECF\u9A8C\u5361\u4F1A\u5728\u4F60\u4E0B\u6B21\u505A\u7C7B\u4F3C\u51B3\u5B9A\u65F6\u88AB AI \u5F15\u7528\u3002"
    ] }) }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.dj-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dj-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dj-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dj-body::-webkit-scrollbar{width:9px;height:9px}
.dj-body::-webkit-scrollbar-track{background:transparent}
.dj-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dj-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dj-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5EA8FF,#3B6FE0);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dj-tt{flex:1;min-width:0}
.dj-tt b{font-size:15px;display:block}
.dj-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.dj-tabs{display:flex;gap:4px}
.dj-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.dj-tab:hover{color:#E6EAF2}
.dj-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.dj-tab .dj-badge{display:inline-block;min-width:15px;padding:0 4px;margin-left:3px;border-radius:8px;background:#54262c;color:#FF8A9A;font-size:9.5px;font-weight:700;line-height:15px;text-align:center;vertical-align:1px}
.dj-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dj-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#5EA8FF,#3B6FE0);flex-shrink:0}
.dj-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dj-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dj-card-b{padding:11px 13px}
.dj-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dj-btn{background:#2E5FC0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.dj-btn:hover{filter:brightness(1.12)}
.dj-btn:disabled{opacity:.45;cursor:not-allowed}
.dj-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dj-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dj-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dj-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dj-inp:focus{outline:none;border-color:#2E5FC0}
.dj-inp::placeholder{color:#4d5566}
.dj-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.dj-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.dj-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dj-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.dj-toast.bad{border-color:#54262c;color:#FF8A9A}
.dj-toast.good{border-color:#2b4a35;color:#7EE2A0}
.dj-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.dj-chip:hover{border-color:#3a4356}
.dj-chip.on{background:#1a2c48;border-color:#2E5FC0;color:#9EC4FF;font-weight:600}
.dj-statrow{display:flex;gap:8px}
.dj-stat{flex:1;background:#12151c;border:1px solid #222936;border-radius:10px;padding:9px 6px;text-align:center;min-width:0}
.dj-stat b{display:block;font-size:17px;font-variant-numeric:tabular-nums}
.dj-stat small{color:#5C6678;font-size:9.5px;display:block;margin-top:1px}
.dj-stat .red{color:#FF8A9A}
.dj-stat .amber{color:#F2C063}
.dj-stat .green{color:#7EE2A0}
.dj-stat .blue{color:#9EC4FF}
.dj-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dj-item{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1d2330;cursor:pointer}
.dj-item:first-child{border-top:none}
.dj-item:hover{background:rgba(94,168,255,.04)}
.dj-item-main{flex:1;min-width:0}
.dj-item-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dj-item-main small{color:#5C6678;font-size:10px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dj-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dj-dot.open{background:#D29922}
.dj-dot.live{background:#4C8DFF}
.dj-dot.done{background:#3FB950}
.dj-dot.muted{background:#4d5566}
.dj-dot.bad{background:#F85149}
.dj-tag{display:inline-block;background:#1C2330;border-radius:5px;color:#8B95A7;font-size:9.5px;padding:1px 6px;margin-right:4px}
.dj-back{background:none;border:none;color:#8B95A7;font-size:12px;cursor:pointer;padding:2px 0}
.dj-back:hover{color:#E6EAF2}
.dj-field{display:flex;align-items:flex-start;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.dj-field:first-child{border-top:none}
.dj-field-l{flex:1;min-width:0}
.dj-field-l b{font-size:12.5px;display:block}
.dj-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5;white-space:pre-wrap}
.dj-opt{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #2a2f3a;border-radius:9px;margin-bottom:6px;background:#12151c}
.dj-opt.chosen{border-color:#2E5FC0;background:#1a2c48}
.dj-opt input{flex:1;background:transparent;border:none;color:#E6EAF2;font-size:12px;min-width:0;outline:none}
.dj-range{width:100%;accent-color:#4C8DFF}
.dj-conf-num{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:#9EC4FF}
.dj-conf-word{font-size:10.5px;color:#8B95A7;margin-left:6px}
.dj-outcomes{display:flex;gap:6px}
.dj-outcomes button{flex:1;border:1px solid #2a2f3a;background:#12151c;color:#8B95A7;border-radius:9px;padding:8px 2px;font-size:11.5px;cursor:pointer}
.dj-outcomes button.on-hit{background:#16301f;border-color:#2b4a35;color:#7EE2A0;font-weight:700}
.dj-outcomes button.on-partial{background:#33270f;border-color:#5c4a1c;color:#F2C063;font-weight:700}
.dj-outcomes button.on-miss{background:#3a1d22;border-color:#54262c;color:#FF8A9A;font-weight:700}
.dj-outcomes button.on-void{background:#232834;border-color:#3a4356;color:#B4B4B8;font-weight:700}
.dj-quote{border-left:3px solid #2E5FC0;background:#12151c;border-radius:0 9px 9px 0;padding:8px 11px;margin:6px 0;font-size:11.5px;color:#C9D4E8;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.dj-quote.res{border-left-color:#3FB950}
.dj-prompt{display:block;width:100%;text-align:left;background:#12151c;border:1px dashed #2a2f3a;border-radius:9px;color:#9EC4FF;font-size:11.5px;padding:8px 11px;cursor:pointer;line-height:1.5}
.dj-prompt:hover{border-color:#2E5FC0;background:#1a2c48}
.dj-cal-wrap{padding:6px 2px 0}
.dj-big{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.dj-table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.dj-table th{color:#5C6678;font-weight:600;text-align:right;padding:4px 6px;border-bottom:1px solid #1d2330}
.dj-table th:first-child,.dj-table td:first-child{text-align:left}
.dj-table td{padding:5px 6px;text-align:right;border-bottom:1px solid #171c26;color:#C9D4E8}
.dj-lesson{border-left:3px solid #D29922;background:#12151c;border-radius:0 9px 9px 0;padding:7px 10px;margin-bottom:7px}
.dj-lesson b{font-size:11.5px;display:block;color:#E6EAF2}
.dj-lesson small{font-size:10.5px;color:#B4B4B8;line-height:1.6;display:block;margin-top:2px;white-space:pre-wrap}
.dj-monthbar{display:flex;align-items:flex-end;gap:3px;height:64px;padding:6px 2px 0}
.dj-monthcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.dj-monthcol i{display:block;width:100%;max-width:18px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#5EA8FF,#2E5FC0);min-height:2px}
.dj-monthcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
`;
function DecisionPanel(props) {
  const [tab, setTab] = useState3("home");
  const [settings, setSettings] = useState3(null);
  const [decisions, setDecisions] = useState3(null);
  const [loadErr, setLoadErr] = useState3("");
  const [toast, setToast] = useState3(null);
  const [focusId, setFocusId] = useState3("");
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [s, ds] = await Promise.all([loadSettings(), loadAllDecisions()]);
      setSettings(s);
      setDecisions(ds);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message || String(e));
    }
  }, []);
  useEffect2(() => {
    void refresh();
  }, [refresh]);
  const openDetail = useCallback((id) => {
    setFocusId(id);
    setTab("list");
  }, []);
  const overview = buildOverview2(decisions || []);
  const cal = computeCalibration2(decisions || []);
  const ctx = settings && decisions ? {
    settings,
    decisions,
    overview,
    cal,
    refresh,
    showToast,
    onSendToChat: props.onSendToChat,
    openDetail
  } : null;
  return /* @__PURE__ */ jsxs5("div", { className: "dj-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "dj-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "dj-logo", children: "\u{1F3AF}" }),
      /* @__PURE__ */ jsxs5("div", { className: "dj-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u8C0B\u5B9A" }),
        /* @__PURE__ */ jsx5("small", { children: decisions ? `\u5230\u671F\u590D\u76D8 ${overview.due.length} \xB7 \u7EA0\u7ED3\u4E2D ${overview.counts.open} \xB7 \u5DF2\u590D\u76D8 ${overview.counts.resolved}` : "\u8C0B\u5B9A\u800C\u540E\u52A8\uFF0C\u77E5\u6B62\u800C\u6709\u5F97" })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "dj-tabs", children: [["home", "\u603B\u89C8"], ["list", "\u51B3\u7B56"], ["stats", "\u6821\u51C6"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `dj-tab${tab === k ? " on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "home" && overview.due.length > 0 ? /* @__PURE__ */ jsx5("span", { className: "dj-badge", children: overview.due.length }) : null
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "dj-body", children: loadErr ? /* @__PURE__ */ jsxs5("div", { className: "dj-empty", children: [
      "\u52A0\u8F7D\u5931\u8D25\uFF1A",
      loadErr
    ] }) : !ctx ? /* @__PURE__ */ jsx5("div", { className: "dj-empty", children: "\u6B63\u5728\u8BFB\u53D6\u53F0\u8D26\u2026" }) : tab === "home" ? /* @__PURE__ */ jsx5(HomeTab, { ctx }) : tab === "list" ? /* @__PURE__ */ jsx5(ListTab, { ctx, focusId, onFocusConsumed: () => setFocusId("") }) : tab === "stats" ? /* @__PURE__ */ jsx5(StatsTab, { ctx, openDetail }) : /* @__PURE__ */ jsx5(SettingsTab, { ctx }) }),
    toast ? /* @__PURE__ */ jsx5("div", { className: `dj-toast ${toast.kind || ""}`, children: toast.msg }) : null
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function DecisionJournalEntry(props) {
  return /* @__PURE__ */ jsx6(DecisionPanel, { ...props });
}
export {
  DecisionJournalEntry as default
};
