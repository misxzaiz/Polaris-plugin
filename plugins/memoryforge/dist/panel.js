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

// shared/srs-core.js
var require_srs_core = __commonJS({
  "shared/srs-core.js"(exports, module) {
    "use strict";
    var K2 = {
      PREFIX: "memoryforge.",
      settings: "memoryforge.settings",
      deck: (id) => `memoryforge.deck.${id}`,
      deckPrefix: "memoryforge.deck.",
      card: (id) => `memoryforge.card.${id}`,
      cardPrefix: "memoryforge.card.",
      meta: "memoryforge.meta"
    };
    var DEFAULT_DECK_ID3 = "default";
    var DEFAULT_DECK_NAME3 = "\u9ED8\u8BA4";
    var DEFAULT_SETTINGS3 = {
      schemaVersion: 1,
      /** 每日新卡上限（0 = 不学新卡） */
      dailyNewLimit: 20,
      /** 每日复习上限（0 = 不设上限，按到期全出） */
      dailyReviewLimit: 200
    };
    var LEARNING_STEPS = [10, 1440];
    var MAX_INTERVAL_MIN = 365 * 24 * 60;
    var HISTORY_CAP = 200;
    var MIN_EASE = 1.3;
    var GRADE_LABELS3 = ["\u91CD\u6765", "\u56F0\u96BE", "\u826F\u597D", "\u8F7B\u677E"];
    var pad2 = (n) => String(n).padStart(2, "0");
    function dayKeyOf2(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function fmtIvl3(min) {
      if (!Number.isFinite(min) || min <= 0) return "\u73B0\u5728";
      if (min < 60) return `${Math.round(min)} \u5206\u949F`;
      if (min < 1440) return `${Math.round(min / 60 * 10) / 10} \u5C0F\u65F6`;
      const days = min / 1440;
      return days < 10 ? `${Math.round(days * 10) / 10} \u5929` : `${Math.round(days)} \u5929`;
    }
    function shortDay(ts) {
      const d = new Date(ts);
      return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function makeId(now) {
      const t = typeof now === "number" ? now : Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return "c" + t.toString(36) + rand;
    }
    function clipTags(rawTags) {
      if (!Array.isArray(rawTags)) return [];
      return [...new Set(rawTags.map((t) => String(t || "").trim().slice(0, 20)).filter(Boolean))].slice(0, 8);
    }
    function normalizeCard2(raw) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u5361\u7247\u6570\u636E" };
      const front = String(raw.front || "").trim();
      const back = String(raw.back || "").trim();
      if (!front) return { error: "front\uFF08\u95EE\u9898\u9762\uFF09\u4E0D\u80FD\u4E3A\u7A7A" };
      if (!back) return { error: "back\uFF08\u7B54\u6848\u9762\uFF09\u4E0D\u80FD\u4E3A\u7A7A" };
      if (front.length > 500) return { error: `front \u8FC7\u957F\uFF08${front.length}/500\uFF09\uFF0C\u4E00\u5361\u4E00\u539F\u5B50\u77E5\u8BC6\u70B9` };
      if (back.length > 2e3) return { error: `back \u8FC7\u957F\uFF08${back.length}/2000\uFF09\uFF0C\u7B54\u6848\u8981\u7CBE\u70BC` };
      const deckId = String(raw.deckId || DEFAULT_DECK_ID3).slice(0, 60);
      const now = Number.isFinite(Number(raw.now)) && Number(raw.now) > 0 ? Number(raw.now) : Date.now();
      const card = {
        id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : makeId(now),
        deckId,
        front,
        back,
        tags: clipTags(raw.tags),
        source: String(raw.source || "").slice(0, 100),
        status: "new",
        learningStep: 0,
        /** 调度间隔，单位分钟 */
        intervalMin: 0,
        due: now,
        ease: 2.5,
        reps: 0,
        lapses: 0,
        createdAt: now,
        updatedAt: now,
        history: []
      };
      return { card };
    }
    function editCard2(card, patch) {
      if (!card || typeof card !== "object") return { error: "\u5361\u7247\u4E0D\u5B58\u5728" };
      const next = { ...card };
      if (patch.front !== void 0) {
        const front = String(patch.front || "").trim();
        if (!front) return { error: "front \u4E0D\u80FD\u4E3A\u7A7A" };
        if (front.length > 500) return { error: `front \u8FC7\u957F\uFF08${front.length}/500\uFF09` };
        next.front = front;
      }
      if (patch.back !== void 0) {
        const back = String(patch.back || "").trim();
        if (!back) return { error: "back \u4E0D\u80FD\u4E3A\u7A7A" };
        if (back.length > 2e3) return { error: `back \u8FC7\u957F\uFF08${back.length}/2000\uFF09` };
        next.back = back;
      }
      if (patch.tags !== void 0) next.tags = clipTags(patch.tags);
      next.updatedAt = Date.now();
      return { card: next };
    }
    function pruneHistory(hist) {
      const arr = Array.isArray(hist) ? hist.filter((h) => h && Number.isFinite(h.t)) : [];
      return arr.length > HISTORY_CAP ? arr.slice(arr.length - HISTORY_CAP) : arr;
    }
    var clampIvl = (min) => Math.min(MAX_INTERVAL_MIN, Math.max(1, Math.round(min)));
    var clampEase = (e) => Math.max(MIN_EASE, Math.round(e * 1e3) / 1e3);
    function gradeCard4(card, grade, now) {
      if (!card || typeof card !== "object") return { error: "\u5361\u7247\u4E0D\u5B58\u5728" };
      const g = Math.round(Number(grade));
      if (!(g >= 0 && g <= 3)) return { error: "\u8BC4\u5206\u5FC5\u987B\u662F 0-3\uFF080=\u91CD\u6765 1=\u56F0\u96BE 2=\u826F\u597D 3=\u8F7B\u677E\uFF09" };
      const t = Number.isFinite(Number(now)) && Number(now) > 0 ? Number(now) : Date.now();
      const c = {
        ...card,
        tags: clipTags(card.tags),
        history: pruneHistory(card.history),
        learningStep: Number(card.learningStep) || 0,
        intervalMin: Number(card.intervalMin) || 0,
        ease: Number.isFinite(Number(card.ease)) ? Number(card.ease) : 2.5
      };
      let ease = c.ease;
      let step = c.learningStep;
      let ivl = c.intervalMin;
      let status = c.status === "new" || c.status === "learning" ? c.reps > 0 ? "learning" : "new" : "review";
      if (g === 0) {
        if (status === "review") c.lapses = (Number(c.lapses) || 0) + 1;
        ease = clampEase(ease - 0.2);
        status = "learning";
        step = 0;
        ivl = LEARNING_STEPS[0];
      } else if (g === 1) {
        if (status === "review") {
          ease = clampEase(ease - 0.15);
          ivl = clampIvl(ivl * 1.2);
        } else {
          status = "learning";
          ivl = LEARNING_STEPS[Math.min(step, LEARNING_STEPS.length - 1)];
        }
      } else if (g === 2) {
        if (status === "review") {
          ivl = clampIvl(ivl * ease);
        } else {
          step += 1;
          if (step >= LEARNING_STEPS.length) {
            status = "review";
            step = 0;
            ivl = LEARNING_STEPS[LEARNING_STEPS.length - 1];
          } else {
            status = "learning";
            ivl = LEARNING_STEPS[step];
          }
        }
      } else {
        if (status === "review") {
          ivl = clampIvl(ivl * ease * 1.3);
          ease = clampEase(ease + 0.15);
        } else {
          ease = clampEase(ease + 0.15);
          status = "review";
          step = 0;
          ivl = 4 * 1440;
        }
      }
      c.ease = ease;
      c.learningStep = step;
      c.intervalMin = ivl;
      c.status = status;
      c.reps = (Number(c.reps) || 0) + 1;
      c.due = t + ivl * 6e4;
      c.updatedAt = t;
      c.history = [...c.history, { t, g, iv: ivl }].slice(-HISTORY_CAP);
      return { card: c };
    }
    function isDue(card, now) {
      if (!card || card.status === "suspended") return false;
      if (card.status === "new") return false;
      return (Number(card.due) || 0) <= now;
    }
    function countToday(cards, now) {
      const today = dayKeyOf2(now);
      let reviews = 0;
      let correct = 0;
      let newCards = 0;
      for (const c of cards || []) {
        if (!c || typeof c !== "object") continue;
        if (dayKeyOf2(c.createdAt) === today) newCards += 1;
        for (const h of pruneHistory(c.history)) {
          if (dayKeyOf2(h.t) === today) {
            reviews += 1;
            if (h.g >= 1) correct += 1;
          }
        }
      }
      return { today, reviews, correct, newCards };
    }
    function computeQueue2(cards, settings, now) {
      const s = { ...DEFAULT_SETTINGS3, ...settings && typeof settings === "object" ? settings : {} };
      const today = countToday(cards, now);
      const reviewLimit = Number.isFinite(Number(s.dailyReviewLimit)) ? Number(s.dailyReviewLimit) : DEFAULT_SETTINGS3.dailyReviewLimit;
      const newLimit = Number.isFinite(Number(s.dailyNewLimit)) ? Number(s.dailyNewLimit) : DEFAULT_SETTINGS3.dailyNewLimit;
      const due = [];
      const fresh = [];
      for (const c of cards || []) {
        if (!c || typeof c !== "object") continue;
        if (c.status === "suspended") continue;
        if (isDue(c, now)) due.push(c);
        else if (c.status === "new") fresh.push(c);
      }
      due.sort((a, b) => (Number(a.due) || 0) - (Number(b.due) || 0));
      fresh.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      const reviewRemaining = reviewLimit > 0 ? Math.max(0, reviewLimit - today.reviews) : due.length;
      const newRemaining = newLimit > 0 ? Math.max(0, newLimit - today.newCards) : 0;
      const queue = [...due.slice(0, reviewRemaining), ...fresh.slice(0, newRemaining)];
      return { queue, today, reviewRemaining, newRemaining, dueTotal: due.length, newTotal: fresh.length };
    }
    function updateStreak2(meta, now) {
      const m = meta && typeof meta === "object" ? meta : {};
      const st = m.streak && typeof m.streak === "object" ? m.streak : { count: 0, lastDay: "", best: 0 };
      const today = dayKeyOf2(now);
      if (st.lastDay === today) return { streak: st, changed: false };
      const yesterday = dayKeyOf2(now - 864e5);
      const count = st.lastDay === yesterday ? (Number(st.count) || 0) + 1 : 1;
      const next = { count, lastDay: today, best: Math.max(Number(st.best) || 0, count) };
      return { streak: next, changed: true };
    }
    function displayStreak(meta, now) {
      const st = meta && meta.streak ? meta.streak : { count: 0, lastDay: "" };
      const today = dayKeyOf2(now);
      if (st.lastDay === today) return Number(st.count) || 0;
      const yesterday = dayKeyOf2(now - 864e5);
      if (st.lastDay === yesterday) return Number(st.count) || 0;
      return 0;
    }
    function computeStats2(cards, decks, meta, now) {
      const list = (cards || []).filter((c) => c && typeof c === "object");
      const byStatus = { new: 0, learning: 0, review: 0, suspended: 0 };
      for (const c of list) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      const today = countToday(list, now);
      const dueNow = list.filter((c) => isDue(c, now)).length;
      const since = now - 30 * 864e5;
      let rTotal = 0;
      let rCorrect = 0;
      for (const c of list) {
        for (const h of pruneHistory(c.history)) {
          if (h.t >= since) {
            rTotal += 1;
            if (h.g >= 1) rCorrect += 1;
          }
        }
      }
      const retention30 = rTotal > 0 ? Math.round(rCorrect / rTotal * 100) : null;
      const forecast = [];
      for (let d = 0; d < 7; d++) {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const from = dayStart.getTime() + d * 864e5;
        const to = from + 864e5;
        let count = 0;
        for (const c of list) {
          if (c.status === "suspended" || c.status === "new") continue;
          const due = Number(c.due) || 0;
          if (d === 0 ? due <= to : due >= from && due < to) count += 1;
        }
        forecast.push({ date: shortDay(from), count });
      }
      const activityMap = /* @__PURE__ */ new Map();
      for (let d = 29; d >= 0; d--) activityMap.set(dayKeyOf2(now - d * 864e5), 0);
      for (const c of list) {
        for (const h of pruneHistory(c.history)) {
          const k = dayKeyOf2(h.t);
          if (activityMap.has(k)) activityMap.set(k, activityMap.get(k) + 1);
        }
      }
      const activity30 = [...activityMap.entries()].map(([date, count]) => ({ date, count }));
      const deckList = (decks || []).filter((d) => d && typeof d === "object");
      const byDeck = deckList.map((d) => {
        const dc = list.filter((c) => c.deckId === d.id);
        return {
          id: d.id,
          name: d.name,
          total: dc.length,
          due: dc.filter((c) => isDue(c, now)).length,
          fresh: dc.filter((c) => c.status === "new").length,
          mature: dc.filter((c) => c.status === "review" && (Number(c.intervalMin) || 0) >= 21 * 1440).length
        };
      });
      const knownDeckIds = new Set(deckList.map((d) => d.id));
      const orphanCards = list.filter((c) => !knownDeckIds.has(c.deckId));
      if (orphanCards.length) {
        byDeck.push({
          id: "__orphan",
          name: "\u672A\u5F52\u5C5E",
          total: orphanCards.length,
          due: orphanCards.filter((c) => isDue(c, now)).length,
          fresh: orphanCards.filter((c) => c.status === "new").length,
          mature: 0
        });
      }
      return {
        total: list.length,
        byStatus,
        dueNow,
        today,
        retention30,
        streak: displayStreak(meta, now),
        bestStreak: meta && meta.streak && Number(meta.streak.best) || 0,
        forecast,
        activity30,
        byDeck
      };
    }
    function searchCards3(cards, { query, deckId, tag, status } = {}) {
      const kw = query ? String(query).toLowerCase() : "";
      return (cards || []).filter((c) => {
        if (!c || typeof c !== "object") return false;
        if (deckId && c.deckId !== deckId) return false;
        if (status && c.status !== status) return false;
        if (tag && !(c.tags || []).includes(tag)) return false;
        if (kw) {
          const hay = `${c.front}
${c.back}
${(c.tags || []).join(" ")}
${c.source || ""}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
    }
    function toCsv3(cards, decks) {
      const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const deckName = (id) => {
        const d = (decks || []).find((x) => x && x.id === id);
        return d ? d.name : id;
      };
      const head = "\u724C\u7EC4,\u95EE\u9898,\u7B54\u6848,\u6807\u7B7E,\u72B6\u6001,\u95F4\u9694,\u5230\u671F,\u521B\u5EFA\u65F6\u95F4,\u6765\u6E90,ID";
      const statusLabel = { new: "\u65B0\u5361", learning: "\u5B66\u4E60\u4E2D", review: "\u590D\u4E60\u4E2D", suspended: "\u5DF2\u6682\u505C" };
      const rows = (cards || []).slice().sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)).map((c) => [
        deckName(c.deckId),
        c.front,
        c.back,
        (c.tags || []).join(" "),
        statusLabel[c.status] || c.status,
        fmtIvl3(c.intervalMin),
        c.status === "new" ? "-" : new Date(Number(c.due) || 0).toLocaleString("zh-CN", { hour12: false }),
        new Date(Number(c.createdAt) || 0).toLocaleString("zh-CN", { hour12: false }),
        c.source || "",
        c.id
      ].map(esc).join(","));
      return [head, ...rows].join("\n");
    }
    function toJsonExport3(cards, decks, settings, meta) {
      return {
        app: "memoryforge",
        schemaVersion: 1,
        exportedAt: Date.now(),
        settings: settings || DEFAULT_SETTINGS3,
        meta: meta || {},
        decks: decks || [],
        cards: cards || []
      };
    }
    function parseImportJson3(text) {
      let data;
      try {
        data = JSON.parse(String(text || ""));
      } catch (_) {
        return { error: "\u4E0D\u662F\u5408\u6CD5 JSON" };
      }
      const rawCards = Array.isArray(data) ? data : Array.isArray(data.cards) ? data.cards : null;
      if (!rawCards) return { error: "JSON \u91CC\u627E\u4E0D\u5230 cards \u6570\u7EC4" };
      const deckNames = /* @__PURE__ */ new Map();
      if (Array.isArray(data.decks)) {
        for (const d of data.decks) if (d && d.id && d.name) deckNames.set(d.id, d.name);
      }
      const cards = [];
      for (const rc of rawCards) {
        if (!rc || typeof rc !== "object") continue;
        const deckName = rc.deckName || deckNames.get(rc.deckId) || "";
        cards.push({
          id: rc.id,
          front: rc.front,
          back: rc.back,
          tags: rc.tags,
          deckName,
          source: rc.source || "import"
        });
      }
      if (!cards.length) return { error: "cards \u6570\u7EC4\u4E3A\u7A7A" };
      return { cards, settings: data.settings && typeof data.settings === "object" ? data.settings : void 0 };
    }
    module.exports = {
      K: K2,
      DEFAULT_DECK_ID: DEFAULT_DECK_ID3,
      DEFAULT_DECK_NAME: DEFAULT_DECK_NAME3,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      LEARNING_STEPS,
      MAX_INTERVAL_MIN,
      HISTORY_CAP,
      MIN_EASE,
      GRADE_LABELS: GRADE_LABELS3,
      dayKeyOf: dayKeyOf2,
      fmtIvl: fmtIvl3,
      shortDay,
      makeId,
      normalizeCard: normalizeCard2,
      editCard: editCard2,
      gradeCard: gradeCard4,
      isDue,
      countToday,
      computeQueue: computeQueue2,
      updateStreak: updateStreak2,
      displayStreak,
      computeStats: computeStats2,
      searchCards: searchCards3,
      toCsv: toCsv3,
      toJsonExport: toJsonExport3,
      parseImportJson: parseImportJson3
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef, useState as useState4 } from "react";

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
var core = __toESM(require_srs_core());
var DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
var DEFAULT_DECK_ID2 = core.DEFAULT_DECK_ID;
var DEFAULT_DECK_NAME2 = core.DEFAULT_DECK_NAME;
var GRADE_LABELS2 = core.GRADE_LABELS;
var fmtIvl2 = core.fmtIvl;
var searchCards2 = core.searchCards;
var toJsonExport2 = core.toJsonExport;
var toCsv2 = core.toCsv;
var parseImportJson2 = core.parseImportJson;
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
async function loadSnapshot() {
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith(core.K.PREFIX));
  const [cardKeys, deckKeys] = [mine.filter((k) => k.startsWith(core.K.cardPrefix)), mine.filter((k) => k.startsWith(core.K.deckPrefix))];
  const [cardVals, deckVals, settingsRaw, metaRaw] = await Promise.all([
    Promise.all(cardKeys.map((k) => kvGet(k).catch(() => null))),
    Promise.all(deckKeys.map((k) => kvGet(k).catch(() => null))),
    kvGet(core.K.settings).catch(() => null),
    kvGet(core.K.meta).catch(() => null)
  ]);
  const cards = cardVals.filter((c) => !!c && typeof c === "object" && typeof c.front === "string");
  const decks = deckVals.filter((d) => !!d && typeof d === "object" && typeof d.name === "string");
  const settings = { ...DEFAULT_SETTINGS2, ...settingsRaw && typeof settingsRaw === "object" ? settingsRaw : {} };
  const meta = metaRaw && typeof metaRaw === "object" ? metaRaw : {};
  const now = Date.now();
  return {
    settings,
    decks,
    cards,
    meta,
    stats: core.computeStats(cards, decks, meta, now),
    queue: core.computeQueue(cards, settings, now)
  };
}
async function loadSettingsRaw() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...DEFAULT_SETTINGS2, ...s && typeof s === "object" ? s : {} };
}
async function saveSettings(s) {
  await kvSet(core.K.settings, s);
}
async function ensureDeck(name) {
  const wanted = String(name || "").trim() || DEFAULT_DECK_NAME2;
  const keys = await kvKeys();
  const deckKeys = keys.filter((k) => k.startsWith(core.K.deckPrefix));
  const vals = await Promise.all(deckKeys.map((k) => kvGet(k).catch(() => null)));
  const found = vals.find((d) => !!d && d.name === wanted);
  if (found) return found;
  const id = wanted === DEFAULT_DECK_NAME2 ? DEFAULT_DECK_ID2 : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const deck = { id, name: wanted.slice(0, 30), createdAt: Date.now() };
  await kvSet(core.K.deck(id), deck);
  return deck;
}
async function deleteDeck(id) {
  if (id === DEFAULT_DECK_ID2) return { ok: false, error: "\u9ED8\u8BA4\u724C\u7EC4\u4E0D\u53EF\u5220\u9664" };
  const cards = await loadAllCards();
  if (cards.some((c) => c.deckId === id)) return { ok: false, error: "\u724C\u7EC4\u8FD8\u6709\u5361\u7247\uFF0C\u5148\u628A\u5361\u79FB\u8D70\u6216\u5220\u9664" };
  await kvDel(core.K.deck(id));
  return { ok: true };
}
async function addCard(input) {
  const norm = core.normalizeCard({ ...input, deckId: input.deckId || DEFAULT_DECK_ID2, source: input.source || "panel" });
  if (norm.error || !norm.card) return { ok: false, error: norm.error || "\u5361\u7247\u4E0D\u5408\u6CD5" };
  await kvSet(core.K.card(norm.card.id), norm.card);
  return { ok: true };
}
async function gradeCard2(cardId, grade) {
  const key = core.K.card(cardId);
  const card = await kvGet(key);
  if (!card) throw new Error("\u5361\u7247\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u5728\u522B\u7AEF\u5220\u9664\uFF09");
  const now = Date.now();
  const g = core.gradeCard(card, grade, now);
  if (g.error || !g.card) throw new Error(g.error || "\u8BC4\u5206\u5931\u8D25");
  await kvSet(key, g.card);
  const metaRaw = await kvGet(core.K.meta).catch(() => null);
  const meta = metaRaw && typeof metaRaw === "object" ? metaRaw : {};
  const st = core.updateStreak(meta, now);
  if (st.changed) await kvSet(core.K.meta, { ...meta, streak: st.streak });
  return g.card;
}
async function updateCardContent(cardId, patch) {
  const card = await kvGet(core.K.card(cardId));
  if (!card) return { ok: false, error: "\u5361\u7247\u4E0D\u5B58\u5728" };
  const e = core.editCard(card, patch);
  if (e.error || !e.card) return { ok: false, error: e.error || "\u4FEE\u6539\u4E0D\u5408\u6CD5" };
  await kvSet(core.K.card(cardId), e.card);
  return { ok: true };
}
async function setSuspended(cardId, suspended) {
  const card = await kvGet(core.K.card(cardId));
  if (!card) throw new Error("\u5361\u7247\u4E0D\u5B58\u5728");
  await kvSet(core.K.card(cardId), { ...card, status: suspended ? "suspended" : "new", updatedAt: Date.now() });
}
async function deleteCards(ids) {
  await Promise.all(ids.map((id) => kvDel(core.K.card(id))));
}
async function importFromJson(text) {
  const parsed = parseImportJson2(text);
  if (parsed.error || !parsed.cards) throw new Error(parsed.error || "\u5BFC\u5165\u5185\u5BB9\u4E0D\u5408\u6CD5");
  const existing = await loadAllCards();
  const takenIds = new Set(existing.map((c) => c.id));
  const deckCache = /* @__PURE__ */ new Map();
  const problems = [];
  let imported = 0;
  const now = Date.now();
  const validSettings = parsed.settings;
  for (const raw of parsed.cards) {
    let deckId = DEFAULT_DECK_ID2;
    const dn = (raw.deckName || "").trim();
    if (dn) {
      let deck = deckCache.get(dn);
      if (!deck) {
        deck = await ensureDeck(dn);
        deckCache.set(dn, deck);
      }
      deckId = deck.id;
    }
    const id = raw.id && !takenIds.has(raw.id) ? raw.id : void 0;
    if (raw.id) takenIds.add(raw.id || "");
    const norm = core.normalizeCard({ id, deckId, front: raw.front, back: raw.back, tags: raw.tags, source: raw.source || "import", now });
    if (norm.error || !norm.card) {
      problems.push(`\u300C${String(raw.front || "").slice(0, 24) || "(\u65E0 front)"}\u300D\uFF1A${norm.error}`);
      continue;
    }
    takenIds.add(norm.card.id);
    await kvSet(core.K.card(norm.card.id), norm.card);
    imported += 1;
  }
  if (validSettings && Number.isFinite(Number(validSettings.dailyNewLimit))) {
    const cur = await loadSettingsRaw();
    await saveSettings({ ...cur, dailyNewLimit: Number(validSettings.dailyNewLimit), dailyReviewLimit: Number.isFinite(Number(validSettings.dailyReviewLimit)) ? Number(validSettings.dailyReviewLimit) : cur.dailyReviewLimit });
  }
  return { imported, failed: problems.length, problems };
}
async function loadAllCards() {
  const keys = await kvKeys();
  const cardKeys = keys.filter((k) => k.startsWith(core.K.cardPrefix));
  const vals = await Promise.all(cardKeys.map((k) => kvGet(k).catch(() => null)));
  return vals.filter((c) => !!c && typeof c === "object" && typeof c.front === "string");
}
async function wipeAll() {
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith(core.K.PREFIX));
  await Promise.all(mine.map((k) => kvDel(k)));
  return mine.length;
}
function deckNameOf(decks, id) {
  const d = decks.find((x) => x.id === id);
  return d ? d.name : "\u672A\u5F52\u5C5E";
}
var STATUS_LABEL = {
  new: "\u65B0\u5361",
  learning: "\u5B66\u4E60\u4E2D",
  review: "\u590D\u4E60\u4E2D",
  suspended: "\u5DF2\u6682\u505C"
};
function fmtDue(card, now = Date.now()) {
  if (card.status === "new") return "\u672A\u5F00\u59CB";
  const diff = card.due - now;
  if (diff <= 0) return `\u5230\u671F ${core.fmtIvl(-diff / 6e4)}\u524D`;
  return `${core.fmtIvl(diff / 6e4)}\u540E`;
}
function librarySort(a, b) {
  const rank = (c) => c.status === "suspended" ? 3 : c.status === "new" ? 2 : 1;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (rank(a) === 2) return (a.createdAt || 0) - (b.createdAt || 0);
  return (a.due || 0) - (b.due || 0);
}
async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

// src/ReviewTab.tsx
var core2 = __toESM(require_srs_core());
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function ReviewTab({ snap, reload, showToast, loadedAt }) {
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  useEffect(() => {
    if (!snap) return;
    setQueue(snap.queue.queue);
    setIdx(0);
    setRevealed(false);
    setSessionDone(0);
  }, [snap, loadedAt]);
  const current = queue[idx] || null;
  const predict = useCallback((card, g) => {
    if (!card) return "";
    const r = core2.gradeCard(card, g, Date.now());
    return r.card ? fmtIvl2(r.card.intervalMin) : "";
  }, []);
  const doGrade = useCallback(async (g) => {
    const card = queue[idx];
    if (!card || busy) return;
    setBusy(true);
    try {
      const updated = await gradeCard2(card.id, g);
      setQueue((q) => {
        const next = q.filter((c) => c.id !== card.id);
        if (g === 0) next.push(updated);
        return next;
      });
      setRevealed(false);
      setSessionDone((n) => n + 1);
      showToast(`${GRADE_LABELS2[g]} \u2192 ${fmtIvl2(updated.intervalMin)}\u540E\u518D\u89C1`, "good");
    } catch (e) {
      showToast(`\u8BC4\u5206\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  }, [queue, idx, busy, showToast]);
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!current) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else void doGrade(2);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void doGrade(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, doGrade]);
  const queueInfo = useMemo(() => {
    if (!snap) return null;
    const q = snap.queue;
    return { dueTotal: q.dueTotal, newTotal: q.newTotal, today: q.today, newRemaining: q.newRemaining, reviewRemaining: q.reviewRemaining };
  }, [snap]);
  if (!snap) return /* @__PURE__ */ jsx("div", { className: "mf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const nextDueAt = snap.cards.filter((c) => c.status !== "new" && c.status !== "suspended").map((c) => c.due).sort((a, b) => a - b).find((d) => d > Date.now());
  if (!current) {
    const doneAll = (queueInfo?.dueTotal || 0) + Math.max(0, queueInfo?.newRemaining || 0) === 0;
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "mf-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "mf-bar" }),
        "\u4ECA\u65E5\u961F\u5217",
        /* @__PURE__ */ jsxs("span", { className: "mf-hint", children: [
          "\u672C\u7EC4\u5DF2\u5B8C\u6210 ",
          sessionDone,
          " \u5F20"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mf-card", children: /* @__PURE__ */ jsxs("div", { className: "mf-card-b mf-empty", children: [
        doneAll ? "\u{1F389} \u4ECA\u65E5\u961F\u5217\u5DF2\u5B8C\u6210" : "\u23F3 \u9650\u989D\u6216\u5230\u671F\u6682\u65E0\u5F85\u5B66\u5361\u7247",
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsxs("span", { className: "mf-sub", children: [
          "\u5230\u671F ",
          queueInfo?.dueTotal ?? 0,
          " \xB7 \u65B0\u5361\u5F85\u5B66 ",
          queueInfo?.newRemaining ?? 0,
          nextDueAt ? `\uFF1B\u4E0B\u4E00\u5F20 ${fmtIvl2((nextDueAt - Date.now()) / 6e4)}\u540E\u5230\u671F` : "",
          /* @__PURE__ */ jsx("br", {}),
          "\u60F3\u52A0\u65B0\u5361\uFF1A\u5728\u804A\u5929\u91CC\u628A\u8981\u8BB0\u7684\u5185\u5BB9\u53D1\u7ED9 AI\uFF08\u5982\u300C\u628A\u8FD9\u6BB5\u505A\u6210\u5361\u7247\u300D\uFF09\uFF0C",
          /* @__PURE__ */ jsx("br", {}),
          "\u6216\u5230\u300C\u5361\u5E93\u300D\u9875\u624B\u52A8\u6DFB\u52A0\u3002"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(SessionRecap, { snap, sessionDone, onRefresh: () => void reload() })
    ] });
  }
  const overdue = current.status !== "new" && current.due <= Date.now();
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "mf-bar" }),
      "\u590D\u4E60",
      /* @__PURE__ */ jsx("span", { className: "mf-hint", children: current.status === "new" ? "\u65B0\u5361" : "\u5230\u671F\u5361" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mf-stage", children: [
      /* @__PURE__ */ jsxs("div", { className: "mf-progress", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "\u672C\u7EC4\u5269 ",
          queue.length - idx
        ] }),
        /* @__PURE__ */ jsx("span", { className: "track", children: /* @__PURE__ */ jsx("i", { style: { width: `${queue.length ? (queue.length - idx) / queue.length * 100 : 0}%` } }) }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5DF2\u8FC7 ",
          sessionDone
        ] })
      ] }),
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "mf-flash",
          onClick: () => setRevealed(true),
          role: "button",
          tabIndex: 0,
          onKeyDown: () => {
          },
          children: [
            /* @__PURE__ */ jsxs("div", { className: "meta", children: [
              /* @__PURE__ */ jsx("span", { className: "mf-badge", children: deckNameOf(snap.decks, current.deckId) }),
              current.status === "new" && /* @__PURE__ */ jsx("span", { className: "mf-badge warn", children: "\u65B0\u5361" }),
              current.status !== "new" && /* @__PURE__ */ jsxs("span", { className: `mf-badge ${overdue ? "over" : ""}`, children: [
                overdue ? "\u5DF2\u5230\u671F" : "\u5230\u671F\u5361",
                " \xB7 \u95F4\u9694 ",
                fmtIvl2(current.intervalMin)
              ] }),
              current.tags.map((t) => /* @__PURE__ */ jsxs("span", { className: "mf-badge", children: [
                "#",
                t
              ] }, t)),
              current.lapses > 0 && /* @__PURE__ */ jsxs("span", { className: "mf-badge", children: [
                "\u5FD8\u8FC7 ",
                current.lapses,
                " \u6B21"
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "front", children: current.front }),
            revealed && /* @__PURE__ */ jsx("div", { className: "back", children: current.back }),
            /* @__PURE__ */ jsx("div", { className: "tap", children: revealed ? "\u51ED\u56DE\u5FC6\u8D28\u91CF\u8BC4\u5206\uFF081 \u91CD\u6765 \xB7 2 \u56F0\u96BE \xB7 3 \u826F\u597D \xB7 4 \u8F7B\u677E\uFF09" : "\u70B9\u51FB / \u7A7A\u683C \u663E\u793A\u7B54\u6848" })
          ]
        }
      ),
      revealed && /* @__PURE__ */ jsx("div", { className: "mf-grades", children: [0, 1, 2, 3].map((g) => /* @__PURE__ */ jsxs(
        "button",
        {
          className: `mf-grade ${g === 0 ? "again" : ""} ${g === 3 ? "easy" : ""}`,
          disabled: busy,
          onClick: () => void doGrade(g),
          children: [
            /* @__PURE__ */ jsxs("b", { children: [
              g + 1,
              " ",
              GRADE_LABELS2[g]
            ] }),
            /* @__PURE__ */ jsx("small", { children: predict(current, g) })
          ]
        },
        g
      )) })
    ] })
  ] });
}
function SessionRecap({ snap, sessionDone, onRefresh }) {
  const s = snap.stats;
  return /* @__PURE__ */ jsx("div", { className: "mf-card", children: /* @__PURE__ */ jsxs("div", { className: "mf-card-b", children: [
    /* @__PURE__ */ jsxs("div", { className: "mf-row", style: { justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsxs("span", { className: "mf-sub", children: [
        "\u5361\u5E93 ",
        s.total,
        " \u5F20\uFF08\u65B0 ",
        s.byStatus.new,
        " \xB7 \u5B66 ",
        s.byStatus.learning,
        " \xB7 \u590D ",
        s.byStatus.review,
        s.byStatus.suspended ? ` \xB7 \u505C ${s.byStatus.suspended}` : "",
        "\uFF09",
        s.retention30 != null ? ` \xB7 30 \u5929\u7559\u5B58 ${s.retention30}%` : ""
      ] }),
      /* @__PURE__ */ jsx("button", { className: "mf-btn sm ghost", onClick: onRefresh, children: "\u21BB \u540C\u6B65\u5361\u5E93" })
    ] }),
    sessionDone > 0 && /* @__PURE__ */ jsxs("div", { className: "mf-sub", style: { marginTop: 6 }, children: [
      "\u672C\u6B21\u4F1A\u8BDD\u8FC7\u4E86 ",
      sessionDone,
      " \u5F20\u3002\u8BC4\u5206\u5DF2\u5B9E\u65F6\u5165\u8D26\uFF0C\u8FDE\u51FB ",
      s.streak,
      " \u5929\u3002"
    ] })
  ] }) });
}

// src/LibraryTab.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function LibraryTab({ snap, reload, showToast }) {
  const [query, setQuery] = useState2("");
  const [deckFilter, setDeckFilter] = useState2("");
  const [tagFilter, setTagFilter] = useState2("");
  const [statusFilter, setStatusFilter] = useState2("");
  const [expanded, setExpanded] = useState2("");
  const [addOpen, setAddOpen] = useState2(false);
  if (!snap) return /* @__PURE__ */ jsx2("div", { className: "mf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const allTags = (() => {
    const set = /* @__PURE__ */ new Set();
    for (const c of snap.cards) for (const t of c.tags || []) set.add(t);
    return [...set].sort();
  })();
  const list = (() => {
    const filtered = searchCards2(snap.cards, {
      query: query || void 0,
      deckId: deckFilter || void 0,
      tag: tagFilter || void 0,
      status: statusFilter || void 0
    });
    return filtered.sort(librarySort);
  })();
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "mf-bar" }),
      "\u5361\u5E93",
      /* @__PURE__ */ jsxs2("span", { className: "mf-hint", children: [
        snap.cards.length,
        " \u5F20 \xB7 \u547D\u4E2D ",
        list.length
      ] })
    ] }),
    /* @__PURE__ */ jsx2(AddForm, { snap, open: addOpen, setOpen: setAddOpen, reload, showToast }),
    /* @__PURE__ */ jsxs2("div", { style: { padding: "0 16px 8px" }, children: [
      /* @__PURE__ */ jsx2("input", { className: "mf-inp", value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u641C\u7D22\u95EE\u9898 / \u7B54\u6848 / \u6807\u7B7E / \u6765\u6E90\u2026" }),
      /* @__PURE__ */ jsxs2("div", { className: "mf-row", style: { marginTop: 7 }, children: [
        /* @__PURE__ */ jsxs2("select", { className: "mf-sel", value: deckFilter, onChange: (e) => setDeckFilter(e.target.value), children: [
          /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u724C\u7EC4" }),
          snap.decks.map((d) => /* @__PURE__ */ jsx2("option", { value: d.id, children: d.name }, d.id))
        ] }),
        /* @__PURE__ */ jsxs2("select", { className: "mf-sel", value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), children: [
          /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u72B6\u6001" }),
          ["new", "learning", "review", "suspended"].map((s) => /* @__PURE__ */ jsx2("option", { value: s, children: STATUS_LABEL[s] }, s))
        ] }),
        (query || deckFilter || tagFilter || statusFilter) && /* @__PURE__ */ jsx2("button", { className: "mf-chip", onClick: () => {
          setQuery("");
          setDeckFilter("");
          setTagFilter("");
          setStatusFilter("");
        }, children: "\u6E05\u7A7A\u8FC7\u6EE4" })
      ] }),
      allTags.length > 0 && /* @__PURE__ */ jsx2("div", { className: "mf-row", style: { marginTop: 7 }, children: allTags.slice(0, 12).map((t) => /* @__PURE__ */ jsxs2("button", { className: `mf-chip ${tagFilter === t ? "on" : ""}`, onClick: () => setTagFilter(tagFilter === t ? "" : t), children: [
        "#",
        t
      ] }, t)) })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "mf-card", children: /* @__PURE__ */ jsxs2("div", { className: "mf-card-b", children: [
      list.length === 0 && /* @__PURE__ */ jsxs2("div", { className: "mf-empty", children: [
        "\u6CA1\u6709\u5339\u914D\u7684\u5361\u7247\u3002",
        /* @__PURE__ */ jsx2("br", {}),
        "\u5728\u804A\u5929\u91CC\u8BA9 AI \u5236\u5361\uFF0C\u6216\u70B9\u4E0A\u65B9\u300C\uFF0B \u65B0\u5361\u300D\u624B\u52A8\u6DFB\u52A0\u3002"
      ] }),
      list.slice(0, 200).map((c) => /* @__PURE__ */ jsx2(
        CardRow,
        {
          card: c,
          snap,
          expanded: expanded === c.id,
          onToggle: () => setExpanded(expanded === c.id ? "" : c.id),
          reload,
          showToast
        },
        c.id
      )),
      list.length > 200 && /* @__PURE__ */ jsx2("div", { className: "mf-sub", style: { padding: "8px 2px" }, children: "\u4EC5\u663E\u793A\u524D 200 \u5F20\uFF0C\u8BF7\u7528\u8FC7\u6EE4\u7F29\u5C0F\u8303\u56F4\u3002" })
    ] }) })
  ] });
}
function CardRow({ card, snap, expanded, onToggle, reload, showToast }) {
  const [front, setFront] = useState2(card.front);
  const [back, setBack] = useState2(card.back);
  const [tags, setTags] = useState2((card.tags || []).join(", "));
  const [saving, setSaving] = useState2(false);
  const overdue = card.status !== "new" && card.due <= Date.now();
  const dirty = front !== card.front || back !== card.back || tags !== (card.tags || []).join(", ");
  const save = async () => {
    setSaving(true);
    try {
      const r = await updateCardContent(card.id, {
        front,
        back,
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      });
      if (!r.ok) {
        showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", "bad");
        return;
      }
      showToast("\u5DF2\u4FDD\u5B58", "good");
      await reload();
    } finally {
      setSaving(false);
    }
  };
  const toggleSuspend = async () => {
    const toSusp = card.status !== "suspended";
    await setSuspended(card.id, toSusp);
    showToast(toSusp ? "\u5DF2\u6682\u505C\uFF08\u4E0D\u8FDB\u590D\u4E60\u961F\u5217\uFF09" : "\u5DF2\u6062\u590D\uFF08\u6309\u65B0\u5361\u91CD\u65B0\u8FDB\u5165\u961F\u5217\uFF09", "good");
    await reload();
  };
  const remove = async () => {
    if (!window.confirm(`\u6C38\u4E45\u5220\u9664\u5361\u7247\u300C${card.front.slice(0, 30)}\u300D\uFF1F\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    await deleteCards([card.id]);
    showToast("\u5DF2\u5220\u9664", "good");
    await reload();
  };
  return /* @__PURE__ */ jsxs2("div", { className: "mf-crow", children: [
    /* @__PURE__ */ jsxs2("div", { className: "head", onClick: onToggle, children: [
      /* @__PURE__ */ jsxs2("div", { className: "main", children: [
        /* @__PURE__ */ jsx2("b", { children: card.front }),
        /* @__PURE__ */ jsxs2("small", { children: [
          card.back.slice(0, 60),
          card.back.length > 60 ? "\u2026" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("span", { className: `due ${overdue ? "over" : ""}`, children: [
        STATUS_LABEL[card.status],
        " \xB7 ",
        fmtDue(card)
      ] })
    ] }),
    expanded && /* @__PURE__ */ jsxs2("div", { className: "detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "mf-lbl", style: { margin: "0 0 3px" }, children: "\u95EE\u9898\u9762" }),
      /* @__PURE__ */ jsx2("textarea", { className: "mf-txa", value: front, onChange: (e) => setFront(e.target.value), maxLength: 500 }),
      /* @__PURE__ */ jsx2("span", { className: "mf-lbl", children: "\u7B54\u6848\u9762" }),
      /* @__PURE__ */ jsx2("textarea", { className: "mf-txa", value: back, onChange: (e) => setBack(e.target.value), maxLength: 2e3 }),
      /* @__PURE__ */ jsx2("span", { className: "mf-lbl", children: "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF09" }),
      /* @__PURE__ */ jsx2("input", { className: "mf-inp", value: tags, onChange: (e) => setTags(e.target.value), placeholder: "\u5982\uFF1A\u7B97\u6CD5, \u8BB0\u5FC6" }),
      /* @__PURE__ */ jsxs2("div", { className: "stats-line", children: [
        "\u724C\u7EC4 ",
        deckNameOf(snap.decks, card.deckId),
        " \xB7 ease ",
        card.ease?.toFixed?.(2) ?? card.ease,
        " \xB7 \u590D\u8FC7 ",
        card.reps,
        " \u6B21 \xB7 \u5FD8 ",
        card.lapses,
        " \u6B21",
        card.source ? ` \xB7 \u6765\u6E90\uFF1A${card.source}` : "",
        /* @__PURE__ */ jsx2("br", {}),
        "\u5EFA\u4E8E ",
        new Date(card.createdAt).toLocaleString("zh-CN", { hour12: false }),
        card.status !== "new" ? ` \xB7 \u5230\u671F ${new Date(card.due).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "mf-actions", children: [
        dirty && /* @__PURE__ */ jsx2("button", { className: "mf-btn sm", disabled: saving, onClick: () => void save(), children: "\u4FDD\u5B58\u4FEE\u6539" }),
        /* @__PURE__ */ jsx2("button", { className: "mf-btn sm ghost", onClick: () => void toggleSuspend(), children: card.status === "suspended" ? "\u6062\u590D" : "\u6682\u505C" }),
        /* @__PURE__ */ jsx2("button", { className: "mf-btn sm danger", onClick: () => void remove(), children: "\u5220\u9664" })
      ] })
    ] })
  ] });
}
function AddForm({ snap, open, setOpen, reload, showToast }) {
  const [front, setFront] = useState2("");
  const [back, setBack] = useState2("");
  const [deckId, setDeckId] = useState2("");
  const [newDeck, setNewDeck] = useState2("");
  const [tags, setTags] = useState2("");
  const [busy, setBusy] = useState2(false);
  if (!open) {
    return /* @__PURE__ */ jsx2("div", { style: { padding: "0 16px 8px" }, children: /* @__PURE__ */ jsx2("button", { className: "mf-btn sm", onClick: () => setOpen(true), children: "\uFF0B \u65B0\u5361" }) });
  }
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let targetDeck = deckId;
      const nd = newDeck.trim();
      if (nd) {
        const d = await ensureDeck(nd);
        targetDeck = d.id;
      }
      const r = await addCard({
        front,
        back,
        deckId: targetDeck || void 0,
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      });
      if (!r.ok) {
        showToast(r.error || "\u6DFB\u52A0\u5931\u8D25", "bad");
        return;
      }
      setFront("");
      setBack("");
      setTags("");
      setNewDeck("");
      showToast("\u5DF2\u6DFB\u52A0\uFF08\u6309\u65B0\u5361\u8FDB\u5165\u961F\u5217\uFF09", "good");
      await reload();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx2("div", { style: { padding: "0 16px 8px" }, children: /* @__PURE__ */ jsx2("div", { className: "mf-card", style: { margin: 0 }, children: /* @__PURE__ */ jsxs2("div", { className: "mf-card-b", children: [
    /* @__PURE__ */ jsx2("textarea", { className: "mf-txa", value: front, onChange: (e) => setFront(e.target.value), placeholder: "\u95EE\u9898\u9762\uFF08\u4E00\u5361\u4E00\u539F\u5B50\u77E5\u8BC6\u70B9\uFF0C\u2264500 \u5B57\uFF09", maxLength: 500 }),
    /* @__PURE__ */ jsx2("div", { style: { height: 7 } }),
    /* @__PURE__ */ jsx2("textarea", { className: "mf-txa", value: back, onChange: (e) => setBack(e.target.value), placeholder: "\u7B54\u6848\u9762\uFF08\u7CBE\u70BC\uFF0C\u22642000 \u5B57\uFF09", maxLength: 2e3 }),
    /* @__PURE__ */ jsxs2("div", { className: "mf-row", style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsxs2("select", { className: "mf-sel", value: deckId, onChange: (e) => setDeckId(e.target.value), style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u9ED8\u8BA4\u724C\u7EC4" }),
        snap.decks.map((d) => /* @__PURE__ */ jsx2("option", { value: d.id, children: d.name }, d.id))
      ] }),
      /* @__PURE__ */ jsx2("input", { className: "mf-inp", style: { flex: 1, minWidth: 0 }, value: newDeck, onChange: (e) => setNewDeck(e.target.value), placeholder: "\u6216\u65B0\u5EFA\u724C\u7EC4\u540D" })
    ] }),
    /* @__PURE__ */ jsx2("input", { className: "mf-inp", style: { marginTop: 8 }, value: tags, onChange: (e) => setTags(e.target.value), placeholder: "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u53EF\u7A7A\uFF09" }),
    /* @__PURE__ */ jsxs2("div", { className: "mf-actions", children: [
      /* @__PURE__ */ jsx2("button", { className: "mf-btn sm", disabled: !front.trim() || !back.trim() || busy, onClick: () => void submit(), children: "\u6DFB\u52A0" }),
      /* @__PURE__ */ jsx2("button", { className: "mf-btn sm ghost", onClick: () => setOpen(false), children: "\u6536\u8D77" })
    ] })
  ] }) }) });
}

// src/StatsTab.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function StatsTab({ snap }) {
  if (!snap) return /* @__PURE__ */ jsx3("div", { className: "mf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = snap.stats;
  const activityMax = Math.max(1, ...s.activity30.map((a) => a.count));
  const forecastMax = Math.max(1, ...s.forecast.map((f) => f.count));
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "mf-bar" }),
      "\u603B\u89C8"
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "mf-grid", children: [
      /* @__PURE__ */ jsxs3("div", { className: "mf-stat", children: [
        /* @__PURE__ */ jsx3("b", { children: s.total }),
        /* @__PURE__ */ jsx3("small", { children: "\u5361\u7247" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "mf-stat", children: [
        /* @__PURE__ */ jsx3("b", { className: "hot", children: s.dueNow }),
        /* @__PURE__ */ jsx3("small", { children: "\u73B0\u5728\u5230\u671F" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "mf-stat", children: [
        /* @__PURE__ */ jsx3("b", { children: s.today.reviews }),
        /* @__PURE__ */ jsx3("small", { children: "\u4ECA\u65E5\u590D\u4E60" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "mf-stat", children: [
        /* @__PURE__ */ jsxs3("b", { className: "hot", children: [
          "\u{1F525}",
          s.streak
        ] }),
        /* @__PURE__ */ jsx3("small", { children: "\u8FDE\u51FB\u5929\u6570" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "mf-stat", children: [
        /* @__PURE__ */ jsx3("b", { children: s.retention30 != null ? `${s.retention30}%` : "\u2014" }),
        /* @__PURE__ */ jsx3("small", { children: "30\u5929\u7559\u5B58" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "mf-bar" }),
      "7 \u5929\u5230\u671F\u9884\u62A5",
      /* @__PURE__ */ jsxs3("span", { className: "mf-hint", children: [
        "\u5171 ",
        s.forecast.reduce((a, b) => a + b.count, 0),
        " \u5F20"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "mf-card", children: /* @__PURE__ */ jsx3("div", { className: "mf-card-b", children: /* @__PURE__ */ jsx3("div", { className: "mf-bars", children: s.forecast.map((f) => /* @__PURE__ */ jsxs3("div", { className: `mf-barcol ${f.count ? "" : "ghost"}`, children: [
      /* @__PURE__ */ jsx3("em", { children: f.count || "" }),
      /* @__PURE__ */ jsx3("i", { style: { height: `${Math.max(3, f.count / forecastMax * 100)}%` } }),
      /* @__PURE__ */ jsx3("small", { children: f.date })
    ] }, f.date)) }) }) }),
    /* @__PURE__ */ jsxs3("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "mf-bar" }),
      "30 \u5929\u590D\u4E60\u6D3B\u52A8",
      /* @__PURE__ */ jsxs3("span", { className: "mf-hint", children: [
        "\u65E5\u5747 ",
        (s.activity30.reduce((a, b) => a + b.count, 0) / 30).toFixed(1),
        " \u6B21"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "mf-card", children: /* @__PURE__ */ jsxs3("div", { className: "mf-card-b", children: [
      /* @__PURE__ */ jsx3("div", { className: "mf-bars", children: s.activity30.map((a) => /* @__PURE__ */ jsxs3("div", { className: `mf-barcol ${a.count ? "" : "ghost"}`, title: `${a.date}\uFF1A${a.count} \u6B21`, children: [
        /* @__PURE__ */ jsx3("i", { style: { height: `${Math.max(2, a.count / activityMax * 100)}%` } }),
        a.date.endsWith("-01") && /* @__PURE__ */ jsx3("small", { children: a.date.slice(5) })
      ] }, a.date)) }),
      /* @__PURE__ */ jsxs3("div", { className: "mf-sub", style: { marginTop: 6 }, children: [
        "\u4ECA\u65E5 ",
        s.today.reviews,
        " \u6B21\uFF08\u7B54\u5BF9 ",
        s.today.correct,
        "\uFF09\xB7 \u65B0\u5B66 ",
        s.today.newCards,
        " \u5F20 \xB7 \u6700\u4F73\u8FDE\u51FB ",
        s.bestStreak,
        " \u5929"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "mf-bar" }),
      "\u724C\u7EC4"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "mf-card", children: /* @__PURE__ */ jsxs3("div", { className: "mf-card-b", children: [
      s.byDeck.filter((d) => d.total > 0).length === 0 && /* @__PURE__ */ jsx3("div", { className: "mf-empty", children: "\u8FD8\u6CA1\u6709\u724C\u7EC4" }),
      s.byDeck.filter((d) => d.total > 0).map((d) => {
        const done = d.total - d.due - d.fresh;
        const pct = d.total ? Math.round(done / d.total * 100) : 0;
        return /* @__PURE__ */ jsxs3("div", { className: "mf-deckline", children: [
          /* @__PURE__ */ jsx3("span", { className: "nm", children: d.name }),
          /* @__PURE__ */ jsxs3("span", { className: "ct", children: [
            "\u5230\u671F ",
            d.due,
            " \xB7 \u65B0 ",
            d.fresh
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "mf-prog", children: /* @__PURE__ */ jsx3("i", { style: { width: `${pct}%` } }) }),
          /* @__PURE__ */ jsxs3("span", { className: "ct", children: [
            d.total,
            " \u5F20"
          ] })
        ] }, d.id);
      }),
      /* @__PURE__ */ jsxs3("div", { className: "mf-sub", style: { marginTop: 8 }, children: [
        "\u72B6\u6001\u5206\u5E03\uFF1A\u65B0 ",
        s.byStatus.new,
        " \xB7 \u5B66\u4E60\u4E2D ",
        s.byStatus.learning,
        " \xB7 \u590D\u4E60\u4E2D ",
        s.byStatus.review,
        s.byStatus.suspended ? ` \xB7 \u5DF2\u6682\u505C ${s.byStatus.suspended}` : "",
        ` \xB7 \u95F4\u9694 \u226521 \u5929\u7684\u6210\u719F\u5361 ${s.byDeck.reduce((a, b) => a + b.mature, 0)} \u5F20`
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "mf-bar" }),
      "\u8282\u594F\u8BF4\u660E"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "mf-card", children: /* @__PURE__ */ jsxs3("div", { className: "mf-card-b mf-sub", children: [
      "\u6BCF\u65E5\u9650\u989D\u5728\u300C\u8BBE\u7F6E\u300D\u91CC\u8C03\uFF08\u5F53\u524D\uFF1A\u65B0\u5361 ",
      snap.settings.dailyNewLimit,
      "/\u5929\uFF0C\u590D\u4E60 ",
      snap.settings.dailyReviewLimit,
      "/\u5929\uFF09\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u300C\u91CD\u6765\u300D\u7684\u5361 10 \u5206\u949F\u540E\u56DE\u961F\uFF1B\u8BC4\u5206\u8D8A\u7A33\uFF0C\u95F4\u9694\u6309 ease \u8D8A\u62C9\u8D8A\u957F\u2014\u2014",
      s.today.reviews === 0 ? "\u4ECA\u5929\u8FD8\u6CA1\u5F00\u59CB\uFF0C\u53BB\u300C\u590D\u4E60\u300D\u9875\u8FC7\u4E00\u904D\u5427\u3002" : `\u4ECA\u5929\u5DF2\u590D\u4E60 ${s.today.reviews} \u6B21\uFF0C\u6309\u8282\u594F\u7EE7\u7EED\u5C31\u597D\u3002`,
      nextDueHint(s)
    ] }) })
  ] });
}
function nextDueHint(s) {
  if (s.dueNow > 0) return `\u73B0\u5728\u5C31\u6709 ${s.dueNow} \u5F20\u5230\u671F\u3002`;
  const next = s.forecast.find((f) => f.count > 0);
  return next ? `\u4E0B\u4E00\u6CE2\u5230\u671F\u5728 ${next.date}\uFF08${next.count} \u5F20\uFF09\u3002` : "";
}

// src/SettingsTab.tsx
import { useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var AI_GUIDE = [
  "\u5728 Polaris \u804A\u5929\u91CC\u5BF9 AI \u8BF4\u4E00\u53E5\u8BDD\u5373\u53EF\u5236\u5361/\u590D\u4E60\uFF0C\u5E38\u7528\u53E5\u5F0F\uFF1A",
  "\xB7 \u300C\u628A\u8FD9\u6BB5\u5185\u5BB9\u505A\u6210\u5361\u7247\uFF0C\u653E\u8FDB\u300CRust \u6240\u6709\u6743\u300D\u724C\u7EC4\u300D",
  "\xB7 \u300Chttps://\u2026 \u8FD9\u7BC7\u6587\u7AE0\u63D0\u70BC 15 \u5F20\u5361\u300D\uFF08AI \u4F1A\u5148\u6293\u6B63\u6587\u518D\u5236\u5361\uFF09",
  "\xB7 \u300C\u51FA 10 \u5F20\u82F1\u8BED\u8BCD\u6C47\u5361\uFF1Aabandon / terse / pragmatic \u2026\u300D",
  "\xB7 \u300C\u4ECA\u5929\u8BE5\u590D\u4E60\u4EC0\u4E48\uFF1F\u300D\u2192 AI \u51FA\u9898\uFF0C\u4F60\u53E3\u5934\u4F5C\u7B54\uFF0CAI \u5E2E\u4F60\u8BC4\u5206",
  "\xB7 \u300C\u8BB0\u5FC6\u7194\u7089\u73B0\u5728\u4EC0\u4E48\u60C5\u51B5\uFF1F\u300D\u2192 \u5230\u671F/\u7559\u5B58/\u8FDE\u51FB\u4E00\u89C8"
].join("\n");
function SettingsTab({ snap, reload, showToast }) {
  const [draftNew, setDraftNew] = useState3(null);
  const [draftReview, setDraftReview] = useState3(null);
  const [newDeckName, setNewDeckName] = useState3("");
  const [importText, setImportText] = useState3("");
  const [importOpen, setImportOpen] = useState3(false);
  const [busy, setBusy] = useState3(false);
  if (!snap) return /* @__PURE__ */ jsx4("div", { className: "mf-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = snap.settings;
  const draftNewVal = draftNew ?? String(s.dailyNewLimit);
  const draftReviewVal = draftReview ?? String(s.dailyReviewLimit);
  const saveLimits = async () => {
    const n = Math.max(0, Math.round(Number(draftNewVal) || 0));
    const r = Math.max(0, Math.round(Number(draftReviewVal) || 0));
    await saveSettings({ ...s, dailyNewLimit: n, dailyReviewLimit: r });
    await reload();
    showToast("\u6BCF\u65E5\u9650\u989D\u5DF2\u4FDD\u5B58", "good");
  };
  const addDeck = async () => {
    const name = newDeckName.trim();
    if (!name) return;
    await ensureDeck(name);
    setNewDeckName("");
    await reload();
    showToast(`\u724C\u7EC4\u300C${name}\u300D\u5DF2\u5C31\u7EEA`, "good");
  };
  const removeDeck = async (id, name) => {
    if (!window.confirm(`\u5220\u9664\u724C\u7EC4\u300C${name}\u300D\uFF1F\uFF08\u4EC5\u5141\u8BB8\u5220\u9664\u7A7A\u724C\u7EC4\uFF09`)) return;
    const r = await deleteDeck(id);
    if (!r.ok) {
      showToast(r.error || "\u5220\u9664\u5931\u8D25", "bad");
      return;
    }
    await reload();
    showToast("\u724C\u7EC4\u5DF2\u5220\u9664", "good");
  };
  const exportJson = async () => {
    try {
      await copyText(JSON.stringify(toJsonExport2(snap.cards, snap.decks, snap.settings, snap.meta), null, 2));
      showToast(`\u5DF2\u590D\u5236 ${snap.cards.length} \u5F20\u5361 JSON \u5230\u526A\u8D34\u677F`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const exportCsv = async () => {
    try {
      await copyText(toCsv2(snap.cards, snap.decks));
      showToast(`\u5DF2\u590D\u5236 ${snap.cards.length} \u5F20\u5361 CSV \u5230\u526A\u8D34\u677F`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const doImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await importFromJson(importText);
      setImportText("");
      setImportOpen(false);
      await reload();
      showToast(`\u5BFC\u5165 ${r.imported} \u5F20${r.failed ? `\uFF0C\u5931\u8D25 ${r.failed} \u5F20\uFF08${r.problems[0] || ""}\uFF09` : ""}`, r.failed ? "bad" : "good");
    } catch (e) {
      showToast(`\u5BFC\u5165\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy(false);
    }
  };
  const clearAll = async () => {
    if (!window.confirm("\u6E05\u7A7A\u8BB0\u5FC6\u7194\u7089\u5168\u90E8\u6570\u636E\uFF08\u5361\u7247+\u724C\u7EC4+\u8BBE\u7F6E+\u8FDE\u51FB\uFF09\uFF1F\u4E0D\u53EF\u6062\u590D\uFF0C\u5EFA\u8BAE\u5148\u5BFC\u51FA\u3002")) return;
    try {
      const n = await wipeAll();
      await reload();
      showToast(`\u5DF2\u6E05\u7A7A ${n} \u4E2A\u6570\u636E\u952E`);
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "mf-bar" }),
      "\u6BCF\u65E5\u9650\u989D",
      /* @__PURE__ */ jsx4("span", { className: "mf-hint", children: "AI \u5236\u5361\u4E0E\u9762\u677F\u5171\u7528" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "mf-card", children: /* @__PURE__ */ jsxs4("div", { className: "mf-card-b", style: { padding: 0 }, children: [
      /* @__PURE__ */ jsxs4("div", { className: "mf-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "mf-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u65B0\u5361\u4E0A\u9650" }),
          /* @__PURE__ */ jsx4("small", { children: "\u6BCF\u5929\u6700\u591A\u5B66\u51E0\u5F20\u65B0\u5361\uFF080 = \u505C\u53D1\u65B0\u5361\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4("input", { className: "mf-num", inputMode: "numeric", value: draftNewVal, onChange: (e) => setDraftNew(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "mf-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "mf-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u590D\u4E60\u4E0A\u9650" }),
          /* @__PURE__ */ jsx4("small", { children: "\u6BCF\u5929\u6700\u591A\u590D\u4E60\u51E0\u5F20\uFF080 = \u4E0D\u8BBE\u4E0A\u9650\uFF0C\u5230\u671F\u5168\u51FA\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4("input", { className: "mf-num", inputMode: "numeric", value: draftReviewVal, onChange: (e) => setDraftReview(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "mf-actions", style: { padding: "10px 13px" }, children: [
        /* @__PURE__ */ jsx4("button", { className: "mf-btn sm", onClick: () => void saveLimits(), children: "\u4FDD\u5B58\u9650\u989D" }),
        /* @__PURE__ */ jsxs4("span", { className: "mf-sub", children: [
          "\u4ECA\u65E5\u5DF2\uFF1A\u65B0 ",
          snap.stats.today.newCards,
          " / \u590D\u4E60 ",
          snap.stats.today.reviews
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "mf-bar" }),
      "\u724C\u7EC4",
      /* @__PURE__ */ jsxs4("span", { className: "mf-hint", children: [
        snap.decks.length,
        " \u4E2A"
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "mf-card", children: /* @__PURE__ */ jsxs4("div", { className: "mf-card-b", style: { padding: 0 }, children: [
      snap.stats.byDeck.filter((d) => d.total > 0).map((d) => /* @__PURE__ */ jsxs4("div", { className: "mf-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "mf-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: d.name }),
          /* @__PURE__ */ jsxs4("small", { children: [
            d.total,
            " \u5F20 \xB7 \u5230\u671F ",
            d.due,
            " \xB7 \u65B0 ",
            d.fresh
          ] })
        ] }),
        d.id !== "default" && /* @__PURE__ */ jsx4("button", { className: "mf-btn sm danger", onClick: () => void removeDeck(d.id, d.name), children: "\u5220\u9664" })
      ] }, d.id)),
      snap.decks.length === 0 && /* @__PURE__ */ jsx4("div", { className: "mf-field", children: /* @__PURE__ */ jsx4("span", { className: "mf-sub", children: "\u8FD8\u6CA1\u6709\u724C\u7EC4\uFF08\u5BFC\u5165\u5361\u7247\u65F6\u5199\u724C\u7EC4\u540D\u4F1A\u81EA\u52A8\u521B\u5EFA\uFF09" }) }),
      /* @__PURE__ */ jsxs4("div", { className: "mf-actions", style: { padding: "10px 13px" }, children: [
        /* @__PURE__ */ jsx4("input", { className: "mf-inp", style: { maxWidth: 160 }, value: newDeckName, onChange: (e) => setNewDeckName(e.target.value), placeholder: "\u65B0\u724C\u7EC4\u540D" }),
        /* @__PURE__ */ jsx4("button", { className: "mf-btn sm", disabled: !newDeckName.trim(), onClick: () => void addDeck(), children: "\u521B\u5EFA" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "mf-bar" }),
      "\u6570\u636E",
      /* @__PURE__ */ jsx4("span", { className: "mf-hint", children: "\u53EA\u5B58\u672C\u673A cap.kv\uFF0C\u4E0D\u51FA\u8BBE\u5907" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "mf-card", children: /* @__PURE__ */ jsxs4("div", { className: "mf-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "mf-actions", children: [
        /* @__PURE__ */ jsx4("button", { className: "mf-btn sm ghost", onClick: () => void exportJson(), children: "\u5BFC\u51FA JSON\uFF08\u526A\u8D34\u677F\uFF09" }),
        /* @__PURE__ */ jsx4("button", { className: "mf-btn sm ghost", onClick: () => void exportCsv(), children: "\u5BFC\u51FA CSV\uFF08\u526A\u8D34\u677F\uFF09" }),
        /* @__PURE__ */ jsx4("button", { className: "mf-btn sm ghost", onClick: () => setImportOpen(!importOpen), children: "\u5BFC\u5165 JSON" }),
        /* @__PURE__ */ jsx4("button", { className: "mf-btn sm danger", onClick: () => void clearAll(), children: "\u6E05\u7A7A\u5168\u90E8" })
      ] }),
      importOpen && /* @__PURE__ */ jsxs4("div", { style: { marginTop: 9 }, children: [
        /* @__PURE__ */ jsx4(
          "textarea",
          {
            className: "mf-txa",
            style: { minHeight: 90 },
            value: importText,
            onChange: (e) => setImportText(e.target.value),
            placeholder: "\u7C98\u8D34\u5BFC\u51FA\u7684 JSON\uFF08\u542B cards \u6570\u7EC4\uFF09\uFF1B\u4E5F\u652F\u6301 {cards:[{front,back,deckName?,tags?}]} \u7B80\u5F0F"
          }
        ),
        /* @__PURE__ */ jsx4("div", { className: "mf-actions", children: /* @__PURE__ */ jsx4("button", { className: "mf-btn sm", disabled: !importText.trim() || busy, onClick: () => void doImport(), children: "\u5BFC\u5165" }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "mf-bar" }),
      "AI \u5236\u5361\u6307\u5357"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "mf-card", children: /* @__PURE__ */ jsx4("div", { className: "mf-card-b mf-sub", style: { whiteSpace: "pre-wrap" }, children: AI_GUIDE }) }),
    /* @__PURE__ */ jsxs4("div", { className: "mf-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "mf-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "mf-card", children: /* @__PURE__ */ jsxs4("div", { className: "mf-card-b mf-sub", children: [
      "\u8BB0\u5FC6\u7194\u7089 memoryforge v0.1.0 \u2014\u2014 \u628A\u8BFB\u8FC7\u7684\u3001\u804A\u8FC7\u7684\u3001\u5B66\u8FC7\u7684\uFF0C\u70BC\u6210\u8BB0\u5F97\u4F4F\u7684\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 AI \u5BF9\u8BDD\u5F0F\u5236\u5361\uFF08MCP \u5DE5\u5177\uFF09+ \u9762\u677F SM-2 \u95F4\u9694\u91CD\u590D\u590D\u4E60\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u9762\u677F\u4E0E AI \u8D70\u540C\u4E00\u8BA1\u7B97\u6838\u5FC3\uFF08shared/srs-core\uFF09\uFF0C\u8C03\u5EA6\u53E3\u5F84\u6C38\u8FDC\u4E00\u81F4\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u7F51\u9875\u6293\u53D6\u7531 MCP \u8FDB\u7A0B\u539F\u751F\u6267\u884C\uFF0C\u7ED5\u5F00\u6D4F\u89C8\u5668\u540C\u6E90\u9650\u5236\uFF08\u9762\u677F\u96F6\u8DE8\u57DF\u8BF7\u6C42\uFF09\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u6570\u636E\u5728 cap.kv memoryforge.*\uFF0C\u684C\u9762\u4E0E\u624B\u673A Web \u540C\u6B65\u540C\u4E00\u526F\u724C\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { Fragment, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.mf-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.mf-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mf-body{flex:1;overflow-y:auto;padding:0 0 24px}
.mf-body::-webkit-scrollbar{width:9px;height:9px}
.mf-body::-webkit-scrollbar-track{background:transparent}
.mf-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.mf-page{max-width:520px;margin:0 auto}
.mf-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#141017 75%,rgba(20,16,23,0))}
.mf-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E45858,#C0392B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.mf-tt{flex:1;min-width:0}
.mf-tt b{font-size:15px;display:block}
.mf-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.mf-tt small b{display:inline;font-size:10.5px;color:#F2A063}
.mf-tabs{display:flex;gap:4px}
.mf-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.mf-tab:hover{color:#E6EAF2}
.mf-tab.on{background:#2A1E22;color:#E6EAF2;font-weight:600}
.mf-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.mf-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E45858,#C0392B);flex-shrink:0}
.mf-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.mf-card{background:#1A1520;border:1px solid #2C2433;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.mf-card-b{padding:11px 13px}
.mf-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.mf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mf-btn{background:#C0392B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.mf-btn:hover{filter:brightness(1.12)}
.mf-btn:disabled{opacity:.45;cursor:not-allowed}
.mf-btn.ghost{background:#241C2E;color:#E6EAF2;border:1px solid #322841}
.mf-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.mf-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.mf-inp,.mf-txa{background:#120E1A;border:1px solid #322841;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;font-family:inherit}
.mf-txa{resize:vertical;min-height:52px;line-height:1.5}
.mf-inp:focus,.mf-txa:focus{outline:none;border-color:#C0392B}
.mf-inp::placeholder,.mf-txa::placeholder{color:#4d4556}
.mf-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.mf-sel{background:#120E1A;border:1px solid #322841;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;max-width:100%}
.mf-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.mf-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(26,21,32,.96);border:1px solid #2C2433;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.mf-toast.bad{border-color:#54262c;color:#FF8A9A}
.mf-toast.good{border-color:#4a3520;color:#F2C063}
.mf-chip{background:#241C2E;border:1px solid #322841;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.mf-chip:hover{border-color:#453757}
.mf-chip.on{background:#3d1f22;border-color:#C0392B;color:#F2A063;font-weight:600}
.mf-num{width:86px;background:#120E1A;border:1px solid #322841;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.mf-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #241C2E}
.mf-field:first-child{border-top:none}
.mf-field-l{flex:1;min-width:0}
.mf-field-l b{font-size:12.5px;display:block}
.mf-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.mf-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 16px 10px}
.mf-stat{background:#1A1520;border:1px solid #2C2433;border-radius:11px;padding:9px 6px;text-align:center;min-width:0}
.mf-stat b{display:block;font-size:17px;font-variant-numeric:tabular-nums}
.mf-stat small{font-size:9.5px;color:#8B95A7;display:block;margin-top:2px}
.mf-stat .hot{color:#F2A063}
.mf-bars{display:flex;align-items:flex-end;gap:3px;height:88px;padding:6px 2px 0}
.mf-bars.tall{height:110px}
.mf-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.mf-barcol i{display:block;width:100%;max-width:16px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#E45858,#C0392B);min-height:2px}
.mf-barcol.ghost i{background:#332841}
.mf-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.mf-barcol em{font-size:9px;color:#8B95A7;font-style:normal;font-variant-numeric:tabular-nums}
.mf-deckline{display:flex;align-items:center;gap:9px;padding:8px 2px;border-top:1px solid #241C2E}
.mf-deckline:first-child{border-top:none}
.mf-deckline .nm{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-deckline .ct{font-variant-numeric:tabular-nums;color:#8B95A7;font-size:11px;flex-shrink:0}
.mf-prog{height:6px;border-radius:4px;background:#241C2E;overflow:hidden;width:64px;flex-shrink:0}
.mf-prog i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#E45858,#F2A063)}
/* \u590D\u4E60\u5361\u7247 */
.mf-stage{margin:0 16px 10px}
.mf-flash{background:linear-gradient(160deg,#221A2B,#1A1520);border:1px solid #322841;border-radius:16px;padding:22px 18px;min-height:190px;display:flex;flex-direction:column;cursor:pointer;position:relative;overflow:hidden}
.mf-flash::before{content:'';position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,#E45858,#F2A063)}
.mf-flash .meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.mf-badge{font-size:9.5px;padding:2px 8px;border-radius:999px;background:#241C2E;color:#8B95A7;border:1px solid #322841;white-space:nowrap}
.mf-badge.warn{color:#F2A063;border-color:#4a3520}
.mf-badge.over{color:#FF8A9A;border-color:#54262c}
.mf-flash .front{font-size:16px;font-weight:700;line-height:1.65;word-break:break-word;white-space:pre-wrap}
.mf-flash .back{margin-top:14px;padding-top:14px;border-top:1px dashed #322841;font-size:13.5px;line-height:1.75;color:#C9CFDC;word-break:break-word;white-space:pre-wrap}
.mf-flash .tap{margin-top:auto;padding-top:14px;font-size:10.5px;color:#5C6678;text-align:center}
.mf-grades{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}
.mf-grade{border:1px solid #322841;background:#1E1728;color:#C9CFDC;border-radius:10px;padding:9px 2px 7px;font-size:12px;cursor:pointer;text-align:center;min-width:0}
.mf-grade:hover{border-color:#C0392B;color:#fff}
.mf-grade b{display:block;font-size:12.5px}
.mf-grade small{display:block;font-size:9px;color:#8B95A7;margin-top:2px}
.mf-grade.again:hover{border-color:#F85149;color:#FF8A9A}
.mf-grade.easy:hover{border-color:#3FB950;color:#7EE2A0}
.mf-progress{display:flex;align-items:center;gap:8px;padding:2px 2px 8px;font-size:10.5px;color:#8B95A7}
.mf-progress .track{flex:1;height:5px;border-radius:3px;background:#241C2E;overflow:hidden}
.mf-progress .track i{display:block;height:100%;background:linear-gradient(90deg,#E45858,#F2A063);border-radius:3px}
/* \u5361\u5E93\u884C */
.mf-crow{border-top:1px solid #241C2E;padding:9px 2px}
.mf-crow:first-child{border-top:none}
.mf-crow .head{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.mf-crow .main{flex:1;min-width:0}
.mf-crow .main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-crow .main small{color:#5C6678;font-size:10.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.mf-crow .due{font-size:10px;color:#8B95A7;flex-shrink:0;font-variant-numeric:tabular-nums}
.mf-crow .due.over{color:#FF8A9A}
.mf-crow .detail{margin-top:9px;padding-top:9px;border-top:1px dashed #2C2433}
.mf-crow .full{font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.mf-crow .full.ans{color:#C9CFDC;margin-top:6px}
.mf-crow .stats-line{font-size:10px;color:#5C6678;margin-top:7px;line-height:1.6}
.mf-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
@media (max-width:430px){.mf-grid{grid-template-columns:repeat(3,1fr)}.mf-tabs .mf-tab{padding:6px 7px}}
`;
function ForgePanel(_props) {
  const [tab, setTab] = useState4("review");
  const [snap, setSnap] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [loadedAt, setLoadedAt] = useState4(0);
  const [toast, setToast] = useState4(null);
  const toastTimer = useRef(null);
  const showToast = useCallback2((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback2(async () => {
    try {
      const s = await loadSnapshot();
      setSnap(s);
      setLoadErr("");
      setLoadedAt(Date.now());
      return s;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect2(() => {
    let alive = true;
    void reload();
    const onVis = () => {
      if (document.visibilityState === "visible" && alive) void reload();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const head = (() => {
    if (!snap) return "\u8F7D\u5165\u4E2D\u2026";
    const st = snap.stats.streak;
    const t = snap.stats.today;
    return /* @__PURE__ */ jsxs5(Fragment, { children: [
      "\u{1F525} \u8FDE\u51FB ",
      /* @__PURE__ */ jsx5("b", { children: st }),
      " \u5929 \xB7 \u4ECA\u65E5\u590D\u4E60 ",
      t.reviews,
      "/\u65B0\u5B66 ",
      t.newCards,
      " \xB7 \u5230\u671F ",
      /* @__PURE__ */ jsx5("b", { children: snap.stats.dueNow })
    ] });
  })();
  return /* @__PURE__ */ jsxs5("div", { className: "mf-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "mf-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "mf-logo", children: "\u{1F525}" }),
      /* @__PURE__ */ jsxs5("div", { className: "mf-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u8BB0\u5FC6\u7194\u7089" }),
        /* @__PURE__ */ jsx5("small", { children: head })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "mf-tabs", children: [
        ["review", "\u590D\u4E60"],
        ["library", "\u5361\u5E93"],
        ["stats", "\u7EDF\u8BA1"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `mf-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "mf-body", children: /* @__PURE__ */ jsxs5("div", { className: "mf-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "mf-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "review" && /* @__PURE__ */ jsx5(ReviewTab, { snap, reload, showToast, loadedAt }),
      tab === "library" && /* @__PURE__ */ jsx5(LibraryTab, { snap, reload, showToast }),
      tab === "stats" && /* @__PURE__ */ jsx5(StatsTab, { snap }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { snap, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `mf-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function MemoryForgeEntry(props) {
  return /* @__PURE__ */ jsx6(ForgePanel, { ...props });
}
export {
  MemoryForgeEntry as default
};
