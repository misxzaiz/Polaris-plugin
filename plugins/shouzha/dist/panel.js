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

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var K3 = {
      sub: (id) => `shouzha.sub.${id}`,
      subPrefix: "shouzha.sub.",
      settings: "shouzha.settings"
    };
    var DEFAULT_SETTINGS3 = { schemaVersion: 1, currencySymbol: "\xA5", defaultRemindDays: 3 };
    var CATEGORIES3 = ["\u89C6\u9891\u5A31\u4E50", "\u97F3\u4E50", "\u4E91\u76D8\u5B58\u50A8", "\u8F6F\u4EF6\u5DE5\u5177", "\u751F\u6D3B\u670D\u52A1", "\u65B0\u95FB\u8D44\u8BAF", "\u6E38\u620F", "\u901A\u4FE1", "\u91D1\u878D\u4F1A\u5458", "\u5176\u4ED6"];
    var CYCLES = {
      month: { label: "\u6BCF\u6708", perYear: 12 },
      year: { label: "\u6BCF\u5E74", perYear: 1 },
      quarter: { label: "\u6BCF\u5B63", perYear: 4 },
      week: { label: "\u6BCF\u5468", perYear: 52 },
      custom: { label: "\u81EA\u5B9A\u4E49", perYear: null }
    };
    var STATUSES = ["active", "trial", "paused", "cancelled"];
    var STATUS_LABELS3 = { active: "\u751F\u6548\u4E2D", trial: "\u8BD5\u7528\u4E2D", paused: "\u5DF2\u6682\u505C", cancelled: "\u5DF2\u53D6\u6D88" };
    var EVENT_KINDS = ["create", "renew", "skip", "pause", "resume", "cancel", "restore", "price"];
    var LIMITS3 = {
      name: 40,
      vendor: 24,
      plan: 40,
      note: 300,
      paymentMethod: 16,
      priceHistory: 60,
      events: 120,
      manageUrl: 300,
      cancelReason: 100
    };
    var MAX_AMOUNT = 1e6;
    var pad2 = (n) => String(n).padStart(2, "0");
    var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    function dayKeyOf2(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function todayStr3(now) {
      return dayKeyOf2(typeof now === "number" ? now : Date.now());
    }
    function dateToTs(dateStr) {
      if (typeof dateStr !== "string" || !DATE_RE.test(dateStr)) return null;
      const [y, m, d] = dateStr.split("-").map(Number);
      const ts = new Date(y, m - 1, d).getTime();
      if (dayKeyOf2(ts) !== dateStr) return null;
      return ts;
    }
    function addDays(dateStr, n) {
      const ts = dateToTs(dateStr);
      if (ts === null) return null;
      return dayKeyOf2(ts + n * 864e5);
    }
    function daysBetween3(fromStr, toStr) {
      const a = dateToTs(fromStr);
      const b = dateToTs(toStr);
      if (a === null || b === null) return null;
      return Math.round((b - a) / 864e5);
    }
    function advanceDate3(dateStr, cycle, customDays) {
      const ts = dateToTs(dateStr);
      if (ts === null) return null;
      const [y, m, d] = dateStr.split("-").map(Number);
      if (cycle === "month" || cycle === "quarter" || cycle === "year") {
        const step = cycle === "month" ? 1 : cycle === "quarter" ? 3 : 12;
        const ny = y + Math.floor((m - 1 + step) / 12);
        const nm = (m - 1 + step) % 12 + 1;
        const lastDay = new Date(ny, nm, 0).getDate();
        return `${ny}-${pad2(nm)}-${pad2(Math.min(d, lastDay))}`;
      }
      if (cycle === "week") return addDays(dateStr, 7);
      if (cycle === "custom") {
        const n = Number(customDays);
        if (!Number.isInteger(n) || n < 1) return null;
        return addDays(dateStr, n);
      }
      return null;
    }
    function perYearOf(cycle, customDays) {
      const c = CYCLES[cycle];
      if (!c) return null;
      if (c.perYear !== null) return c.perYear;
      const n = Number(customDays);
      if (!Number.isFinite(n) || n < 1) return null;
      return 365 / n;
    }
    function monthlyCost2(sub) {
      if (!sub) return null;
      const perYear = perYearOf(sub.cycle, sub.customDays);
      if (perYear === null) return null;
      return Math.round(sub.amount * perYear / 12 * 100) / 100;
    }
    function annualCost4(sub) {
      if (!sub) return null;
      const perYear = perYearOf(sub.cycle, sub.customDays);
      if (perYear === null) return null;
      return Math.round(sub.amount * perYear * 100) / 100;
    }
    function cycleLabel3(sub) {
      if (!sub) return "";
      if (sub.cycle === "custom") return `\u6BCF ${sub.customDays} \u5929`;
      return (CYCLES[sub.cycle] || {}).label || sub.cycle;
    }
    function fmtMoney3(n, symbol) {
      return `${symbol || "\xA5"}${(Math.round(n * 100) / 100).toFixed(2)}`;
    }
    function makeId(now) {
      const t = typeof now === "number" ? now : Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return "s" + t.toString(36) + rand;
    }
    function cleanStr(v, max) {
      if (v === void 0 || v === null) return void 0;
      const s = String(v).trim();
      if (!s) return void 0;
      return s.slice(0, max);
    }
    function cleanUrl(v) {
      const s = cleanStr(v, LIMITS3.manageUrl);
      if (s === void 0) return void 0;
      return /^https?:\/\//i.test(s) ? s : void 0;
    }
    function normalizeSub3(raw, now) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u8BA2\u9605\u6570\u636E" };
      const ts = typeof now === "number" ? now : Date.now();
      const name = cleanStr(raw.name, LIMITS3.name);
      if (!name) return { error: "\u540D\u79F0\u5FC5\u586B\uFF08\u226440 \u5B57\uFF09" };
      const amount = Number(raw.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: `\u91D1\u989D\u5FC5\u987B\u662F\u6B63\u6570\uFF08\u6536\u5230\uFF1A${raw.amount}\uFF09` };
      if (amount > MAX_AMOUNT) return { error: `\u91D1\u989D\u8FC7\u5927\uFF08\u4E0A\u9650 ${MAX_AMOUNT}\uFF09\uFF0C\u7591\u4F3C\u8F93\u5165\u9519\u8BEF` };
      const cycle = CYCLES[raw.cycle] ? raw.cycle : null;
      if (!cycle) return { error: `\u5468\u671F\u987B\u4E3A ${Object.keys(CYCLES).join("/")}\uFF08\u6536\u5230\uFF1A${raw.cycle}\uFF09` };
      let customDays;
      if (cycle === "custom") {
        const n = Number(raw.customDays);
        if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: "\u81EA\u5B9A\u4E49\u5468\u671F\u987B\u4E3A 1..3650 \u7684\u6574\u6570\u5929" };
        customDays = n;
      }
      const status = STATUSES.includes(raw.status) ? raw.status : "active";
      const trialEndsAt = cleanStr(raw.trialEndsAt, 10);
      if (status === "trial" && dateToTs(trialEndsAt || "") === null) {
        return { error: "\u8BD5\u7528\u8BA2\u9605\u5FC5\u987B\u63D0\u4F9B trialEndsAt\uFF08\u8BD5\u7528\u5230\u671F\u65E5\uFF0CYYYY-MM-DD\uFF09\u2014\u2014\u8BD5\u7528\u65E0\u5230\u671F\u65E5\u5C31\u65E0\u6CD5\u7EA2\u699C\u63D0\u9192" };
      }
      let nextRenewalDate = cleanStr(raw.nextRenewalDate, 10);
      if (nextRenewalDate !== void 0 && dateToTs(nextRenewalDate) === null) {
        return { error: `\u4E0B\u6B21\u6263\u8D39\u65E5\u975E\u6CD5\uFF08${raw.nextRenewalDate}\uFF0C\u987B\u4E3A YYYY-MM-DD\uFF09` };
      }
      if (!nextRenewalDate) {
        const fallback = advanceDate3(todayStr3(ts), cycle, customDays);
        if (!fallback) return { error: "nextRenewalDate \u7F3A\u7701\u4E14\u65E0\u6CD5\u6309\u5468\u671F\u63A8\u7B97\u9ED8\u8BA4\u503C" };
        nextRenewalDate = fallback;
      }
      const remindDaysBefore = (() => {
        const n = Number(raw.remindDaysBefore);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.min(30, Math.round(n)));
      })();
      const created = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : ts;
      const priceHistory = Array.isArray(raw.priceHistory) ? raw.priceHistory.filter((p) => p && typeof p === "object" && Number.isFinite(Number(p.amount)) && dateToTs(String(p.date || "")) !== null).slice(0, LIMITS3.priceHistory).map((p) => ({ date: String(p.date).slice(0, 10), amount: Math.round(Number(p.amount) * 100) / 100, ...p.note ? { note: cleanStr(p.note, 60) } : {} })) : [];
      if (!priceHistory.length) priceHistory.push({ date: todayStr3(created), amount: Math.round(amount * 100) / 100 });
      const events = Array.isArray(raw.events) ? raw.events.filter((e) => e && typeof e === "object" && EVENT_KINDS.includes(e.kind)).slice(0, LIMITS3.events).map((e) => ({ ts: Number(e.ts) > 0 ? Number(e.ts) : created, kind: e.kind, ...e.note ? { note: cleanStr(e.note, 100) } : {} })) : [];
      const sub = {
        id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : makeId(ts),
        name,
        category: CATEGORIES3.includes(raw.category) ? raw.category : "\u5176\u4ED6",
        vendor: cleanStr(raw.vendor, LIMITS3.vendor),
        plan: cleanStr(raw.plan, LIMITS3.plan),
        amount: Math.round(amount * 100) / 100,
        cycle,
        ...customDays ? { customDays } : {},
        nextRenewalDate,
        autoRenew: raw.autoRenew !== false,
        status,
        ...trialEndsAt ? { trialEndsAt } : {},
        paymentMethod: cleanStr(raw.paymentMethod, LIMITS3.paymentMethod),
        manageUrl: cleanUrl(raw.manageUrl),
        note: cleanStr(raw.note, LIMITS3.note),
        remindDaysBefore,
        priceHistory,
        events,
        ...status === "cancelled" && raw.cancelledAt && dateToTs(String(raw.cancelledAt)) !== null ? { cancelledAt: String(raw.cancelledAt).slice(0, 10) } : {},
        ...raw.cancelReason ? { cancelReason: cleanStr(raw.cancelReason, LIMITS3.cancelReason) } : {},
        createdAt: created,
        updatedAt: Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : ts
      };
      return { sub };
    }
    function applyUpdate3(sub, patch, now) {
      const ts = typeof now === "number" ? now : Date.now();
      const merged = { ...sub };
      const next = { ...patch };
      if (next.amount !== void 0 && Number(next.amount) !== merged.amount) {
        const a = Number(next.amount);
        if (!Number.isFinite(a) || a <= 0 || a > MAX_AMOUNT) return { error: `\u91D1\u989D\u975E\u6CD5\uFF08${next.amount}\uFF09` };
        merged.amount = Math.round(a * 100) / 100;
        merged.priceHistory = [...merged.priceHistory || [], { date: todayStr3(ts), amount: merged.amount }].slice(-LIMITS3.priceHistory);
        merged.events = [...merged.events || [], { ts, kind: "price", note: `\u91D1\u989D\u8C03\u6574\u4E3A ${merged.amount}` }].slice(-LIMITS3.events);
        delete next.amount;
      }
      if (next.cycle !== void 0 && next.cycle !== merged.cycle) {
        if (!CYCLES[next.cycle]) return { error: `\u5468\u671F\u987B\u4E3A ${Object.keys(CYCLES).join("/")}` };
        merged.cycle = next.cycle;
        if (next.cycle !== "custom") delete merged.customDays;
      }
      if (next.customDays !== void 0 && next.customDays !== merged.customDays) {
        const n = Number(next.customDays);
        if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: "\u81EA\u5B9A\u4E49\u5468\u671F\u987B\u4E3A 1..3650 \u7684\u6574\u6570\u5929" };
        if (merged.cycle !== "custom") return { error: "customDays \u4EC5\u5728 cycle=custom \u4E0B\u53EF\u8BBE\u7F6E" };
        merged.customDays = n;
      }
      if (next.nextRenewalDate !== void 0) {
        if (dateToTs(String(next.nextRenewalDate)) === null) return { error: `\u4E0B\u6B21\u6263\u8D39\u65E5\u975E\u6CD5\uFF08${next.nextRenewalDate}\uFF09` };
        merged.nextRenewalDate = String(next.nextRenewalDate).slice(0, 10);
      }
      if (next.name !== void 0) {
        const v = cleanStr(next.name, LIMITS3.name);
        if (!v) return { error: "\u540D\u79F0\u4E0D\u53EF\u4E3A\u7A7A" };
        merged.name = v;
      }
      if (next.category !== void 0) {
        if (!CATEGORIES3.includes(next.category)) return { error: `\u672A\u77E5\u5206\u7C7B\u300C${next.category}\u300D` };
        merged.category = next.category;
      }
      if (next.vendor !== void 0) merged.vendor = cleanStr(next.vendor, LIMITS3.vendor);
      if (next.plan !== void 0) merged.plan = cleanStr(next.plan, LIMITS3.plan);
      if (next.autoRenew !== void 0) merged.autoRenew = next.autoRenew !== false;
      if (next.trialEndsAt !== void 0) {
        if (next.trialEndsAt === null || next.trialEndsAt === "") delete merged.trialEndsAt;
        else if (dateToTs(String(next.trialEndsAt)) === null) return { error: `\u8BD5\u7528\u5230\u671F\u65E5\u975E\u6CD5\uFF08${next.trialEndsAt}\uFF09` };
        else merged.trialEndsAt = String(next.trialEndsAt).slice(0, 10);
      }
      if (next.paymentMethod !== void 0) merged.paymentMethod = cleanStr(next.paymentMethod, LIMITS3.paymentMethod);
      if (next.manageUrl !== void 0) merged.manageUrl = cleanUrl(next.manageUrl);
      if (next.note !== void 0) merged.note = cleanStr(next.note, LIMITS3.note);
      if (next.remindDaysBefore !== void 0) {
        const n = Number(next.remindDaysBefore);
        merged.remindDaysBefore = Number.isFinite(n) ? Math.max(0, Math.min(30, Math.round(n))) : null;
      }
      merged.updatedAt = ts;
      return { sub: merged };
    }
    function renewState3(sub, today) {
      const t = typeof today === "string" ? today : todayStr3(today);
      if (sub.status === "active") {
        const diff = daysBetween3(t, sub.nextRenewalDate);
        if (diff !== null && diff < 0) return "overdue";
        const win = sub.remindDaysBefore != null ? sub.remindDaysBefore : DEFAULT_SETTINGS3.defaultRemindDays;
        if (diff !== null && diff <= win) return "dueSoon";
        return "ok";
      }
      if (sub.status === "trial" && sub.trialEndsAt) {
        const diff = daysBetween3(t, sub.trialEndsAt);
        if (diff === null) return "trial";
        const win = sub.remindDaysBefore != null ? sub.remindDaysBefore : DEFAULT_SETTINGS3.defaultRemindDays;
        return diff <= win ? "trialUrgent" : "trial";
      }
      return "ok";
    }
    function dueBoard3(subs, today) {
      const t = typeof today === "string" ? today : todayStr3(today);
      const overdue = [];
      const upcoming = [];
      const trials = [];
      for (const s of subs || []) {
        if (s.status === "cancelled" || s.status === "paused") continue;
        const st = renewState3(s, t);
        if (st === "overdue") overdue.push(s);
        else if (st === "dueSoon") upcoming.push(s);
        else if (st === "trialUrgent" || st === "trial") trials.push(s);
      }
      const asc = (k) => (a, b) => a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
      overdue.sort((a, b) => a.nextRenewalDate < b.nextRenewalDate ? -1 : 1);
      upcoming.sort(asc("nextRenewalDate"));
      trials.sort((a, b) => (a.trialEndsAt || "9999") <= (b.trialEndsAt || "9999") ? -1 : 1);
      return { overdue, upcoming, trials };
    }
    function pushEvent(sub, kind, note, ts) {
      return [...sub.events || [], { ts, kind, ...note ? { note: String(note).slice(0, 100) } : {} }].slice(-LIMITS3.events);
    }
    function renewSub3(sub, opts, now) {
      const ts = typeof now === "number" ? now : Date.now();
      const o = opts || {};
      if (sub.status === "cancelled") return { error: `\u300C${sub.name}\u300D\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u5148\u6062\u590D\u518D\u5BF9\u8D26` };
      if (sub.status === "paused") return { error: `\u300C${sub.name}\u300D\u5DF2\u6682\u505C\uFF0C\u8BF7\u5148\u6062\u590D\u518D\u5BF9\u8D26` };
      let s = { ...sub };
      if (o.amount !== void 0 && Number(o.amount) !== s.amount) {
        const a = Number(o.amount);
        if (!Number.isFinite(a) || a <= 0 || a > MAX_AMOUNT) return { error: `\u5B9E\u4ED8\u91D1\u989D\u975E\u6CD5\uFF08${o.amount}\uFF09` };
        s.amount = Math.round(a * 100) / 100;
        s.priceHistory = [...s.priceHistory || [], { date: todayStr3(ts), amount: s.amount }].slice(-LIMITS3.priceHistory);
        s = { ...s, events: pushEvent(s, "price", `\u5BF9\u8D26\u5B9E\u4ED8 ${s.amount}\uFF08\u539F ${sub.amount}\uFF09`, ts) };
      }
      const base = o.date && dateToTs(String(o.date)) !== null ? String(o.date).slice(0, 10) : s.nextRenewalDate;
      const next = advanceDate3(base, s.cycle, s.customDays);
      if (!next) return { error: "\u5468\u671F\u63A8\u8FDB\u5931\u8D25\uFF08\u65E5\u671F/\u5468\u671F\u975E\u6CD5\uFF09" };
      s.nextRenewalDate = next;
      if (s.status === "trial") s.status = "active";
      s.events = pushEvent(s, "renew", o.note, ts).slice(-LIMITS3.events);
      s.updatedAt = ts;
      return { sub: s };
    }
    function skipSub3(sub, opts, now) {
      const ts = typeof now === "number" ? now : Date.now();
      const o = opts || {};
      const s = {
        ...sub,
        status: "cancelled",
        autoRenew: false,
        cancelledAt: todayStr3(ts),
        ...o.reason ? { cancelReason: String(o.reason).slice(0, LIMITS3.cancelReason) } : {},
        events: pushEvent(sub, "skip", o.note, ts).slice(-LIMITS3.events),
        updatedAt: ts
      };
      return { sub: s };
    }
    function cancelSub3(sub, opts, now) {
      const ts = typeof now === "number" ? now : Date.now();
      const o = opts || {};
      const s = {
        ...sub,
        status: "cancelled",
        autoRenew: false,
        cancelledAt: todayStr3(ts),
        ...o.reason ? { cancelReason: String(o.reason).slice(0, LIMITS3.cancelReason) } : {},
        events: pushEvent(sub, "cancel", o.reason || o.note, ts).slice(-LIMITS3.events),
        updatedAt: ts
      };
      return { sub: s };
    }
    function pauseSub3(sub, opts, now) {
      const ts = typeof now === "number" ? now : Date.now();
      const s = {
        ...sub,
        status: "paused",
        events: pushEvent(sub, "pause", (opts || {}).note, ts).slice(-LIMITS3.events),
        updatedAt: ts
      };
      return { sub: s };
    }
    function resumeSub3(sub, nextRenewalDate, now) {
      const ts = typeof now === "number" ? now : Date.now();
      if (dateToTs(String(nextRenewalDate || "")) === null) {
        return { error: "\u6062\u590D\u8BA2\u9605\u5FC5\u987B\u63D0\u4F9B\u4E0B\u6B21\u6263\u8D39\u65E5\uFF08YYYY-MM-DD\uFF09\u2014\u2014\u65E7\u6263\u8D39\u65E5\u5DF2\u5931\u771F" };
      }
      const s = {
        ...sub,
        status: "active",
        autoRenew: true,
        nextRenewalDate: String(nextRenewalDate).slice(0, 10),
        events: pushEvent(sub, "restore", void 0, ts).slice(-LIMITS3.events),
        updatedAt: ts
      };
      delete s.cancelledAt;
      delete s.cancelReason;
      return { sub: s };
    }
    function filterSubs2(subs, { keyword, category, status, autoRenew } = {}) {
      return (subs || []).filter((s) => {
        if (category && s.category !== category) return false;
        if (status && s.status !== status) return false;
        if (autoRenew !== void 0 && s.autoRenew !== !!autoRenew) return false;
        if (keyword) {
          const kw = String(keyword).toLowerCase();
          const hay = [s.name, s.vendor, s.plan, s.note, s.paymentMethod].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
    }
    function stats3(subs, today, opts) {
      const t = typeof today === "string" ? today : todayStr3(today);
      const windowMonths = opts && Number.isInteger(opts.cashflowMonths) ? opts.cashflowMonths : 12;
      const counts = { active: 0, trial: 0, paused: 0, cancelled: 0 };
      let monthlyActive = 0;
      let monthlyTrial = 0;
      let savedMonthly = 0;
      const byCategory = /* @__PURE__ */ new Map();
      const rankable = [];
      const priceChanges = [];
      for (const s of subs || []) {
        counts[s.status] = (counts[s.status] || 0) + 1;
        const m = monthlyCost2(s);
        if (m === null) continue;
        if (s.status === "active") {
          monthlyActive += m;
          const c = byCategory.get(s.category) || { category: s.category, monthly: 0, count: 0 };
          c.monthly = Math.round((c.monthly + m) * 100) / 100;
          c.count += 1;
          byCategory.set(s.category, c);
          rankable.push(s);
        } else if (s.status === "trial") {
          monthlyTrial += m;
          rankable.push(s);
        } else if (s.status === "cancelled") {
          savedMonthly += m;
        }
        const ph = s.priceHistory || [];
        if (ph.length > 1 && ph[ph.length - 1].amount !== ph[0].amount) {
          priceChanges.push({ id: s.id, name: s.name, from: ph[0].amount, to: ph[ph.length - 1].amount, date: ph[ph.length - 1].date, vendor: s.vendor });
        }
      }
      const startTs = dateToTs(t);
      const windowEnd = dayKeyOf2(startTs + Math.round(365.25 * 864e5));
      const cashMap = /* @__PURE__ */ new Map();
      for (const s of rankable) {
        let cursor = s.nextRenewalDate;
        if (s.status === "trial") cursor = s.trialEndsAt || cursor;
        if (dateToTs(cursor) === null) continue;
        if (dateToTs(cursor) < startTs) cursor = t;
        for (let i = 0; i < 100; i++) {
          if (cursor > windowEnd) break;
          const mk = cursor.slice(0, 7);
          const item = { name: s.name, amount: s.amount, date: cursor };
          const cell = cashMap.get(mk) || { month: mk, amount: 0, items: [] };
          cell.amount = Math.round((cell.amount + s.amount) * 100) / 100;
          if (cell.items.length < 40) cell.items.push(item);
          cashMap.set(mk, cell);
          const next = advanceDate3(cursor, s.cycle, s.customDays);
          if (!next) break;
          cursor = next;
        }
      }
      const cashflow = [];
      {
        const [y, m] = t.split("-").map(Number);
        for (let i = 0; i < windowMonths; i++) {
          const d = new Date(y, m - 1 + i, 1);
          const mk = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
          const cell = cashMap.get(mk);
          cashflow.push({ month: mk, amount: cell ? cell.amount : 0, items: cell ? cell.items : [] });
        }
      }
      const topAnnual = rankable.map((s) => ({ id: s.id, name: s.name, vendor: s.vendor, category: s.category, status: s.status, monthly: monthlyCost2(s), annual: annualCost4(s), cycleLabel: cycleLabel3(s), amount: s.amount, nextRenewalDate: s.status === "trial" ? s.trialEndsAt : s.nextRenewalDate })).sort((a, b) => b.annual - a.annual);
      return {
        today: t,
        counts,
        monthlyActive: Math.round(monthlyActive * 100) / 100,
        annualActive: Math.round(monthlyActive * 12 * 100) / 100,
        monthlyTrial: Math.round(monthlyTrial * 100) / 100,
        monthlyAll: Math.round((monthlyActive + monthlyTrial) * 100) / 100,
        annualAll: Math.round((monthlyActive + monthlyTrial) * 12 * 100) / 100,
        byCategory: [...byCategory.values()].sort((a, b) => b.monthly - a.monthly),
        topAnnual,
        cashflow,
        savedMonthly: Math.round(savedMonthly * 100) / 100,
        savedAnnual: Math.round(savedMonthly * 12 * 100) / 100,
        priceChanges: priceChanges.sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 20)
      };
    }
    var CSV_HEADERS = ["\u540D\u79F0", "\u670D\u52A1\u5546", "\u5206\u7C7B", "\u5957\u9910", "\u91D1\u989D", "\u5468\u671F", "\u81EA\u5B9A\u4E49\u5929\u6570", "\u4E0B\u6B21\u6263\u8D39\u65E5", "\u81EA\u52A8\u7EED\u8D39", "\u72B6\u6001", "\u8BD5\u7528\u5230\u671F\u65E5", "\u652F\u4ED8\u65B9\u5F0F", "\u7BA1\u7406\u94FE\u63A5", "\u5907\u6CE8", "\u521B\u5EFA\u65F6\u95F4"];
    function toCsv3(subs, symbol) {
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const statusZh = { active: "\u751F\u6548\u4E2D", trial: "\u8BD5\u7528\u4E2D", paused: "\u5DF2\u6682\u505C", cancelled: "\u5DF2\u53D6\u6D88" };
      const head = CSV_HEADERS.join(",");
      const rows = (subs || []).slice().sort((a, b) => a.createdAt - b.createdAt).map((s) => [
        s.name,
        s.vendor || "",
        s.category,
        s.plan || "",
        s.amount.toFixed(2),
        cycleLabel3(s),
        s.cycle === "custom" ? s.customDays : "",
        s.nextRenewalDate,
        s.autoRenew ? "\u662F" : "\u5426",
        statusZh[s.status] || s.status,
        s.trialEndsAt || "",
        s.paymentMethod || "",
        s.manageUrl || "",
        s.note || "",
        new Date(s.createdAt).toLocaleString("zh-CN", { hour12: false })
      ].map(esc).join(","));
      return [head, ...rows].join("\n");
    }
    function parseCsvLine(line) {
      const out = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              cur += '"';
              i++;
            } else inQ = false;
          } else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    }
    var STATUS_ZH_MAP = { \u751F\u6548\u4E2D: "active", \u8BD5\u7528\u4E2D: "trial", \u5DF2\u6682\u505C: "paused", \u5DF2\u53D6\u6D88: "cancelled" };
    var CYCLE_ZH_MAP = { \u6BCF\u6708: "month", \u6BCF\u5E74: "year", \u6BCF\u5B63: "quarter", \u6BCF\u5468: "week" };
    function fromCsv3(text) {
      const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return { items: [], error: "CSV \u81F3\u5C11\u9700\u8981\u8868\u5934 + \u4E00\u884C\u6570\u636E" };
      const header = parseCsvLine(lines[0]);
      const idx = {};
      CSV_HEADERS.forEach((h) => {
        idx[h] = header.indexOf(h);
      });
      if (idx["\u540D\u79F0"] < 0 || idx["\u91D1\u989D"] < 0) return { items: [], error: "\u8868\u5934\u7F3A\u5C11\u300C\u540D\u79F0/\u91D1\u989D\u300D\u5217\uFF08\u987B\u4E3A\u672C\u63D2\u4EF6\u5BFC\u51FA\u7684 CSV\uFF09" };
      const items = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const get = (h) => idx[h] >= 0 ? (cells[idx[h]] || "").trim() : "";
        let cycle = CYCLE_ZH_MAP[get("\u5468\u671F")];
        let customDays = get("\u81EA\u5B9A\u4E49\u5929\u6570") ? Number(get("\u81EA\u5B9A\u4E49\u5929\u6570")) : void 0;
        if (!cycle) {
          const mCustom = /^每\s*(\d+)\s*天$/.exec(get("\u5468\u671F"));
          if (mCustom) {
            cycle = "custom";
            if (!Number.isInteger(customDays)) customDays = Number(mCustom[1]);
          }
        }
        const raw = {
          name: get("\u540D\u79F0"),
          vendor: get("\u670D\u52A1\u5546") || void 0,
          category: get("\u5206\u7C7B") || void 0,
          plan: get("\u5957\u9910") || void 0,
          amount: Number(get("\u91D1\u989D")),
          cycle,
          customDays,
          nextRenewalDate: get("\u4E0B\u6B21\u6263\u8D39\u65E5") || void 0,
          autoRenew: get("\u81EA\u52A8\u7EED\u8D39") !== "\u5426",
          status: STATUS_ZH_MAP[get("\u72B6\u6001")] || "active",
          trialEndsAt: get("\u8BD5\u7528\u5230\u671F\u65E5") || void 0,
          paymentMethod: get("\u652F\u4ED8\u65B9\u5F0F") || void 0,
          manageUrl: get("\u7BA1\u7406\u94FE\u63A5") || void 0,
          note: get("\u5907\u6CE8") || void 0
        };
        const r = normalizeSub3(raw, Date.now());
        if (r.error) items.push({ ok: false, error: `\u7B2C ${i + 1} \u884C\uFF1A${r.error}` });
        else items.push({ ok: true, sub: r.sub });
      }
      return { items };
    }
    module.exports = {
      K: K3,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      CATEGORIES: CATEGORIES3,
      CYCLES,
      STATUSES,
      STATUS_LABELS: STATUS_LABELS3,
      EVENT_KINDS,
      LIMITS: LIMITS3,
      MAX_AMOUNT,
      CSV_HEADERS,
      dayKeyOf: dayKeyOf2,
      todayStr: todayStr3,
      dateToTs,
      addDays,
      daysBetween: daysBetween3,
      advanceDate: advanceDate3,
      perYearOf,
      monthlyCost: monthlyCost2,
      annualCost: annualCost4,
      cycleLabel: cycleLabel3,
      fmtMoney: fmtMoney3,
      makeId,
      normalizeSub: normalizeSub3,
      applyUpdate: applyUpdate3,
      renewState: renewState3,
      dueBoard: dueBoard3,
      renewSub: renewSub3,
      skipSub: skipSub3,
      cancelSub: cancelSub3,
      pauseSub: pauseSub3,
      resumeSub: resumeSub3,
      filterSubs: filterSubs2,
      stats: stats3,
      toCsv: toCsv3,
      fromCsv: fromCsv3,
      parseCsvLine
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef as useRef2, useState as useState4 } from "react";

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
var core = __toESM(require_core());
var K2 = core.K;
var DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
var CATEGORIES2 = core.CATEGORIES;
var fmtMoney2 = (n, symbol) => core.fmtMoney(n, symbol);
var cycleLabel2 = (s) => core.cycleLabel(s);
var todayStr2 = core.todayStr;
var advanceDate2 = core.advanceDate;
var annualCost2 = core.annualCost;
var normalizeSub2 = core.normalizeSub;
var applyUpdate2 = core.applyUpdate;
var renewState2 = core.renewState;
var dueBoard2 = core.dueBoard;
var renewSub2 = core.renewSub;
var skipSub2 = core.skipSub;
var cancelSub2 = core.cancelSub;
var pauseSub2 = core.pauseSub;
var resumeSub2 = core.resumeSub;
var stats2 = core.stats;
var toCsv2 = core.toCsv;
var fromCsv2 = core.fromCsv;
var daysBetween2 = core.daysBetween;
var STATUS_LABELS2 = core.STATUS_LABELS;
var LIMITS2 = core.LIMITS;
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
  const s = await kvGet(K2.settings).catch(() => null);
  return { ...DEFAULT_SETTINGS2, ...s && typeof s === "object" ? s : {} };
}
async function saveSettings(s) {
  await kvSet(K2.settings, s);
}
async function loadSubs() {
  const keys = (await kvKeys()).filter((k) => k.startsWith(K2.subPrefix));
  const vals = await Promise.all(keys.map((k) => kvGet(k).catch(() => null)));
  const subs = [];
  for (const v of vals) {
    if (v && typeof v === "object" && typeof v.id === "string" && typeof v.amount === "number") subs.push(v);
  }
  subs.sort((a, b) => a.nextRenewalDate < b.nextRenewalDate ? -1 : 1);
  return subs;
}
async function loadPanelData() {
  const settings = await loadSettings();
  const subs = await loadSubs();
  const today = todayStr2();
  return { settings, subs, board: dueBoard2(subs, today), stats: stats2(subs, today) };
}
async function saveSub(sub) {
  await kvSet(K2.sub(sub.id), sub);
}
async function deleteSub(id) {
  await kvDel(K2.sub(id));
}
function fmtDate(d) {
  const [, m, day] = d.split("-");
  return `${Number(m)}\u6708${Number(day)}\u65E5`;
}
function stateBadge(s) {
  const st = renewState2(s, todayStr2());
  if (st === "overdue") return { cls: "bad", text: "\u903E\u671F\u5F85\u5BF9\u8D26" };
  if (st === "dueSoon") return { cls: "warn", text: "\u5373\u5C06\u6263\u8D39" };
  if (st === "trialUrgent") return { cls: "bad", text: "\u8BD5\u7528\u5C06\u8F6C\u6B63" };
  if (st === "trial") return { cls: "info", text: "\u8BD5\u7528\u4E2D" };
  if (s.status === "paused") return { cls: "info", text: "\u5DF2\u6682\u505C" };
  if (s.status === "cancelled") return { cls: "off", text: "\u5DF2\u53D6\u6D88" };
  return null;
}

// src/OverviewTab.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function ConfirmBtn(props) {
  const [armed, setArmed] = useState(false);
  return /* @__PURE__ */ jsx(
    "button",
    {
      className: `sz-btn sm ${props.cls || "ghost"} ${armed ? "danger" : ""}`,
      onClick: () => {
        if (armed) {
          setArmed(false);
          props.onConfirm();
        } else {
          setArmed(true);
          setTimeout(() => setArmed(false), 3e3);
        }
      },
      children: armed ? props.confirmLabel : props.label
    }
  );
}
function OverviewTab({ data, reload, showToast, goTab }) {
  const [busy, setBusy] = useState(null);
  if (!data) return /* @__PURE__ */ jsx("div", { className: "sz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const { settings, board, stats: stats3 } = data;
  const sym = settings.currencySymbol;
  const today = todayStr2();
  const act = async (s, kind) => {
    setBusy(s.id + kind);
    try {
      let r;
      if (kind === "renew") r = renewSub2(s, {});
      else if (kind === "skip") r = skipSub2(s, { reason: "\u672C\u6B21\u672A\u7EED" });
      else r = cancelSub2(s, { reason: "\u9762\u677F\u53D6\u6D88" });
      if (r.error || !r.sub) {
        showToast(r.error || "\u64CD\u4F5C\u5931\u8D25", "bad");
        return;
      }
      await saveSub(r.sub);
      const fresh = await reload();
      if (kind === "renew") showToast(`\u5DF2\u5BF9\u8D26\uFF1A${s.name}\uFF0C\u4E0B\u4E00\u671F ${fmtDate(r.sub.nextRenewalDate)}`, "good");
      else {
        const saved = fresh ? fresh.stats.savedAnnual : 0;
        showToast(`\u300C${s.name}\u300D\u5DF2\u53D6\u6D88 \xB7 \u7D2F\u8BA1\u5E74\u5316\u6B62\u635F ${fmtMoney2(saved, sym)}`, "good");
      }
    } finally {
      setBusy(null);
    }
  };
  const itemRow = (s, kind) => {
    const diff = daysBetween2(today, kind === "trial" ? s.trialEndsAt || s.nextRenewalDate : s.nextRenewalDate);
    const when = diff === null ? "" : diff === 0 ? "\u4ECA\u5929" : diff < 0 ? `\u5DF2\u8FC7 ${-diff} \u5929` : `${diff} \u5929\u540E`;
    return /* @__PURE__ */ jsxs("div", { className: "sz-item", children: [
      /* @__PURE__ */ jsxs("div", { className: "sz-item-main", children: [
        /* @__PURE__ */ jsxs("b", { children: [
          s.name,
          /* @__PURE__ */ jsx("span", { className: `sz-badge ${kind === "overdue" ? "bad" : kind === "trial" ? "bad" : "warn"}`, children: kind === "overdue" ? "\u5F85\u5BF9\u8D26" : kind === "trial" ? "\u8BD5\u7528" : s.autoRenew ? "\u81EA\u52A8\u7EED\u8D39" : "\u624B\u52A8\u7EED" })
        ] }),
        /* @__PURE__ */ jsxs("small", { children: [
          s.vendor ? `${s.vendor} \xB7 ` : "",
          kind === "trial" ? `\u8BD5\u7528\u81F3 ${fmtDate(s.trialEndsAt || s.nextRenewalDate)}\uFF08${when}\uFF09` : `${fmtDate(s.nextRenewalDate)} \u6263\u8D39\uFF08${when}\uFF09`
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sz-ops", children: [
          kind !== "trial" && /* @__PURE__ */ jsx("button", { className: "sz-btn sm", disabled: busy === s.id + "renew", onClick: () => void act(s, "renew"), children: kind === "overdue" ? "\u786E\u8BA4\u5DF2\u7EED\u8D39" : "\u786E\u8BA4\u5DF2\u6263" }),
          kind === "trial" && /* @__PURE__ */ jsx("button", { className: "sz-btn sm", disabled: busy === s.id + "renew", onClick: () => void act(s, "renew"), children: "\u5DF2\u8F6C\u6B63\u7EED\u8D39" }),
          /* @__PURE__ */ jsx(ConfirmBtn, { label: "\u4E0D\u7EED\u4E86\uFF0C\u53D6\u6D88", confirmLabel: "\u786E\u8BA4\u53D6\u6D88\uFF1F", cls: "ghost", onConfirm: () => void act(s, "skip") })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sz-item-amt", children: [
        fmtMoney2(s.amount, sym),
        /* @__PURE__ */ jsxs("small", { children: [
          "/",
          cycleLabel2(s)
        ] })
      ] })
    ] }, s.id);
  };
  const maxFlow = Math.max(...stats3.cashflow.map((c) => c.amount), 1);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    board.overdue.length > 0 && /* @__PURE__ */ jsxs("div", { className: "sz-alert red", children: [
      /* @__PURE__ */ jsxs("b", { children: [
        "\u{1F534} \u903E\u671F\u5F85\u5BF9\u8D26 ",
        board.overdue.length,
        " \u7B14"
      ] }),
      "\u6263\u8D39\u65E5\u5DF2\u8FC7\u5883\u4F46\u672A\u786E\u8BA4\u662F\u5426\u771F\u88AB\u6263\u8D39\u2014\u2014\u6C89\u9ED8\u6263\u6B3E\u5C31\u5728\u8FD9\u91CC\u53D1\u751F\u3002\u9010\u7B14\u300C\u786E\u8BA4\u5DF2\u7EED\u8D39\u300D\u6216\u300C\u8FD9\u6B21\u6CA1\u7EED\u300D\u3002",
      /* @__PURE__ */ jsx("div", { className: "sz-card", style: { margin: "8px 0 0" }, children: /* @__PURE__ */ jsx("div", { className: "sz-card-b", style: { padding: "2px 2px" }, children: board.overdue.map((s) => itemRow(s, "overdue")) }) })
    ] }),
    board.trials.length > 0 && /* @__PURE__ */ jsxs("div", { className: "sz-alert red", children: [
      /* @__PURE__ */ jsxs("b", { children: [
        "\u{1F9EA} \u8BD5\u7528\u8F6C\u6B63 ",
        board.trials.length,
        " \u7B14"
      ] }),
      "\u5230\u671F\u4E0D\u5904\u7406\u901A\u5E38\u81EA\u52A8\u8F6C\u6B63\u6263\u8D39\u2014\u2014\u8BD5\u7528\u7ED3\u675F\u524D\u51B3\u5B9A\u53BB\u7559\u3002",
      /* @__PURE__ */ jsx("div", { className: "sz-card", style: { margin: "8px 0 0" }, children: /* @__PURE__ */ jsx("div", { className: "sz-card-b", style: { padding: "2px 2px" }, children: board.trials.map((s) => itemRow(s, "trial")) }) })
    ] }),
    board.upcoming.length > 0 && /* @__PURE__ */ jsxs("div", { className: "sz-alert amber", children: [
      /* @__PURE__ */ jsxs("b", { children: [
        "\u{1F4C5} \u5373\u5C06\u6263\u8D39 ",
        board.upcoming.length,
        " \u7B14"
      ] }),
      "\u4E0D\u60F3\u7EED\u7684\u8BDD\uFF0C\u73B0\u5728\u5C31\u662F\u53D6\u6D88\u7A97\u53E3\u3002",
      /* @__PURE__ */ jsx("div", { className: "sz-card", style: { margin: "8px 0 0" }, children: /* @__PURE__ */ jsx("div", { className: "sz-card-b", style: { padding: "2px 2px" }, children: board.upcoming.map((s) => itemRow(s, "upcoming")) }) })
    ] }),
    !board.overdue.length && !board.upcoming.length && !board.trials.length && /* @__PURE__ */ jsx("div", { className: "sz-card", children: /* @__PURE__ */ jsxs("div", { className: "sz-card-b", style: { textAlign: "center", padding: "22px 13px" }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 22 }, children: "\u{1F7E2}" }),
      /* @__PURE__ */ jsx("b", { style: { display: "block", margin: "6px 0 2px" }, children: "\u5F53\u524D\u4E00\u5207\u5E72\u51C0" }),
      /* @__PURE__ */ jsxs("span", { className: "sz-sub", children: [
        "\u6CA1\u6709\u903E\u671F\u3001\u8FD1\u671F\u6263\u8D39\u6216\u8BD5\u7528\u8F6C\u6B63\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "\u5728\u300C\u8BA2\u9605\u300DTab \u767B\u8BB0\u4F60\u7684\u7B2C\u4E00\u7B14\u8BA2\u9605\uFF0C\u5B88\u95F8\u5F00\u59CB\u66FF\u4F60\u76EF\u9632\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "sz-bar" }),
      "\u6210\u672C\u901F\u89C8"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sz-card", children: /* @__PURE__ */ jsxs("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "sz-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsxs("div", { className: "sz-kv", style: { flex: 1, flexDirection: "column", alignItems: "flex-start", gap: 0 }, children: [
          /* @__PURE__ */ jsxs("small", { children: [
            "\u751F\u6548\u4E2D\u6708\u5747\uFF08",
            stats3.counts.active,
            " \u7B14\uFF09"
          ] }),
          /* @__PURE__ */ jsx("b", { style: { fontSize: 19 }, children: fmtMoney2(stats3.monthlyActive, sym) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sz-kv", style: { flex: 1, flexDirection: "column", alignItems: "flex-start", gap: 0 }, children: [
          /* @__PURE__ */ jsx("small", { children: "\u5E74\u5316" }),
          /* @__PURE__ */ jsx("b", { style: { fontSize: 19 }, children: fmtMoney2(stats3.annualActive, sym) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sz-kv", style: { flex: 1, flexDirection: "column", alignItems: "flex-start", gap: 0 }, children: [
          /* @__PURE__ */ jsx("small", { children: "\u542B\u8BD5\u7528\u8F6C\u6B63\u9884\u4F30" }),
          /* @__PURE__ */ jsxs("b", { style: { fontSize: 19 }, children: [
            fmtMoney2(stats3.monthlyAll, sym),
            /* @__PURE__ */ jsx("span", { className: "sz-sub", children: "/\u6708" })
          ] })
        ] })
      ] }),
      stats3.savedAnnual > 0 && /* @__PURE__ */ jsxs("div", { className: "sz-sub", style: { marginTop: 6 }, children: [
        "\u2702\uFE0F \u5DF2\u53D6\u6D88\u8BA2\u9605\u7D2F\u8BA1\u5E74\u5316\u6B62\u635F ",
        /* @__PURE__ */ jsx("b", { style: { color: "#7EE2A0" }, children: fmtMoney2(stats3.savedAnnual, sym) }),
        "\uFF08\u8BE6\u89C1\u900F\u89C6\uFF09"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "sz-bar" }),
      "\u672A\u6765 12 \u4E2A\u6708\u73B0\u91D1\u6D41",
      /* @__PURE__ */ jsx("span", { className: "sz-hint", children: "\u9010\u6708\u5C06\u6263\u91D1\u989D" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sz-card", children: /* @__PURE__ */ jsxs("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsx("div", { className: "sz-bars", children: stats3.cashflow.map((c) => /* @__PURE__ */ jsxs("div", { className: `sz-barcol ${c.amount > stats3.monthlyActive * 1.5 ? "hot" : ""}`, title: c.items.length ? c.items.map((i) => `${i.date} ${i.name} ${fmtMoney2(i.amount, sym)}`).join("\n") : "\u65E0\u6263\u8D39", children: [
        /* @__PURE__ */ jsx("i", { style: { height: `${Math.max(3, Math.round(c.amount / maxFlow * 74))}px` } }),
        /* @__PURE__ */ jsx("small", { children: Number(c.month.slice(5)) })
      ] }, c.month)) }),
      /* @__PURE__ */ jsxs("div", { className: "sz-sub", style: { marginTop: 6 }, children: [
        "\u672A\u6765\u4E00\u5E74\u5C06\u6263 ",
        /* @__PURE__ */ jsx("b", { style: { color: "#E6EAF2" }, children: fmtMoney2(stats3.cashflow.reduce((s2, c) => s2 + c.amount, 0), sym) }),
        "\uFF08\u9EC4\u8272\u6708\u4EFD = \u5927\u989D\u5E74\u8D39\u624E\u5806\uFF1B\u60AC\u505C\u67F1\u5B50\u770B\u660E\u7EC6\uFF09"
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "4px 0 10px" }, children: /* @__PURE__ */ jsxs("button", { className: "sz-btn ghost sm", onClick: () => goTab("subs"), children: [
      "\u7BA1\u7406\u5168\u90E8 ",
      data.subs.filter((s) => s.status !== "cancelled").length,
      " \u7B14\u8BA2\u9605 \u2192"
    ] }) })
  ] });
}

// src/SubsTab.tsx
import { useMemo, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function emptyForm(defaultRemind) {
  return {
    name: "",
    vendor: "",
    plan: "",
    amount: "",
    cycle: "month",
    customDays: "",
    nextRenewalDate: "",
    autoRenew: true,
    status: "active",
    trialEndsAt: "",
    category: "\u89C6\u9891\u5A31\u4E50",
    paymentMethod: "",
    manageUrl: "",
    note: "",
    remindDaysBefore: String(defaultRemind)
  };
}
function toForm(s) {
  return {
    id: s.id,
    name: s.name,
    vendor: s.vendor || "",
    plan: s.plan || "",
    amount: String(s.amount),
    cycle: s.cycle,
    customDays: s.customDays ? String(s.customDays) : "",
    nextRenewalDate: s.nextRenewalDate,
    autoRenew: s.autoRenew,
    status: s.status === "trial" ? "trial" : "active",
    trialEndsAt: s.trialEndsAt || "",
    category: s.category,
    paymentMethod: s.paymentMethod || "",
    manageUrl: s.manageUrl || "",
    note: s.note || "",
    remindDaysBefore: s.remindDaysBefore != null ? String(s.remindDaysBefore) : ""
  };
}
function SubForm(props) {
  const [f, setF] = useState2(props.init);
  const [saving, setSaving] = useState2(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const editing = !!f.id;
  const submit = async () => {
    setSaving(true);
    try {
      const raw = {
        name: f.name,
        vendor: f.vendor || void 0,
        plan: f.plan || void 0,
        amount: Number(f.amount),
        cycle: f.cycle,
        customDays: f.cycle === "custom" ? Number(f.customDays) : void 0,
        nextRenewalDate: f.nextRenewalDate || void 0,
        autoRenew: f.autoRenew,
        status: f.status,
        trialEndsAt: f.status === "trial" ? f.trialEndsAt : void 0,
        category: f.category,
        paymentMethod: f.paymentMethod || void 0,
        manageUrl: f.manageUrl || void 0,
        note: f.note || void 0,
        remindDaysBefore: f.remindDaysBefore === "" ? void 0 : Number(f.remindDaysBefore)
      };
      if (editing) {
        const cur = props.init.__sub;
        if (!cur) return;
        const r = applyUpdate2(cur, raw);
        if (r.error || !r.sub) {
          props.showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", "bad");
          return;
        }
        await saveSub(r.sub);
        props.onSaved(`\u5DF2\u4FDD\u5B58\u300C${r.sub.name}\u300D`);
      } else {
        const r = normalizeSub2(raw);
        if (r.error || !r.sub) {
          props.showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", "bad");
          return;
        }
        await saveSub(r.sub);
        props.onSaved(`\u5DF2\u767B\u8BB0\u300C${r.sub.name}\u300D\xB7 \u4E0B\u6B21\u6263\u8D39 ${r.sub.nextRenewalDate}`);
      }
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsx2("div", { className: "sz-modal", onClick: (e) => {
    if (e.target === e.currentTarget) props.onClose();
  }, children: /* @__PURE__ */ jsxs2("div", { className: "sz-modal-box", children: [
    /* @__PURE__ */ jsxs2("div", { className: "sz-modal-head", children: [
      /* @__PURE__ */ jsx2("b", { children: editing ? `\u7F16\u8F91\u8BA2\u9605` : "\u767B\u8BB0\u8BA2\u9605" }),
      /* @__PURE__ */ jsx2("button", { className: "sz-btn ghost sm", onClick: props.onClose, children: "\u5173\u95ED" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sz-modal-body", children: [
      /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u540D\u79F0 *" }),
      /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.name, maxLength: LIMITS2.name, placeholder: "\u5982\uFF1A\u817E\u8BAF\u89C6\u9891", onChange: (e) => set({ name: e.target.value }) }),
      /* @__PURE__ */ jsxs2("div", { className: "sz-grid2", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u670D\u52A1\u5546" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.vendor, maxLength: LIMITS2.vendor, placeholder: "\u5982\uFF1A\u817E\u8BAF", onChange: (e) => set({ vendor: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u5957\u9910" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.plan, maxLength: LIMITS2.plan, placeholder: "\u5982\uFF1A\u8FDE\u7EED\u5305\u5E74", onChange: (e) => set({ plan: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u91D1\u989D\uFF08\u6BCF\u5468\u671F\uFF09*" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.amount, inputMode: "decimal", placeholder: "\u5982\uFF1A25 \u6216 248", onChange: (e) => set({ amount: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u5468\u671F *" }),
          /* @__PURE__ */ jsxs2("select", { className: "sz-sel", style: { width: "100%" }, value: f.cycle, onChange: (e) => set({ cycle: e.target.value }), children: [
            /* @__PURE__ */ jsx2("option", { value: "month", children: "\u6BCF\u6708" }),
            /* @__PURE__ */ jsx2("option", { value: "year", children: "\u6BCF\u5E74" }),
            /* @__PURE__ */ jsx2("option", { value: "quarter", children: "\u6BCF\u5B63" }),
            /* @__PURE__ */ jsx2("option", { value: "week", children: "\u6BCF\u5468" }),
            /* @__PURE__ */ jsx2("option", { value: "custom", children: "\u81EA\u5B9A\u4E49\u5929\u6570" })
          ] })
        ] }),
        f.cycle === "custom" && /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u5468\u671F\u5929\u6570\uFF081..3650\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.customDays, inputMode: "numeric", onChange: (e) => set({ customDays: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("label", { className: "sz-lbl", children: [
            "\u4E0B\u6B21\u6263\u8D39\u65E5",
            editing ? "" : "\uFF08\u7559\u7A7A=\u4ECA\u5929\u8D77\u7B97\u4E00\u5468\u671F\uFF09"
          ] }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.nextRenewalDate, placeholder: "YYYY-MM-DD", onChange: (e) => set({ nextRenewalDate: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u72B6\u6001" }),
          /* @__PURE__ */ jsxs2("select", { className: "sz-sel", style: { width: "100%" }, value: f.status, onChange: (e) => set({ status: e.target.value }), children: [
            /* @__PURE__ */ jsx2("option", { value: "active", children: "\u751F\u6548\u4E2D" }),
            /* @__PURE__ */ jsx2("option", { value: "trial", children: "\u8BD5\u7528\u4E2D" })
          ] })
        ] }),
        f.status === "trial" && /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u8BD5\u7528\u5230\u671F\u65E5 *\uFF08\u5FC5\u586B\uFF0C\u8F6C\u6B63\u7EA2\u699C\u4F9D\u636E\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.trialEndsAt, placeholder: "YYYY-MM-DD", onChange: (e) => set({ trialEndsAt: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u5206\u7C7B" }),
          /* @__PURE__ */ jsx2("select", { className: "sz-sel", style: { width: "100%" }, value: f.category, onChange: (e) => set({ category: e.target.value }), children: CATEGORIES2.map((c) => /* @__PURE__ */ jsx2("option", { value: c, children: c }, c)) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u652F\u4ED8\u65B9\u5F0F" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.paymentMethod, maxLength: LIMITS2.paymentMethod, placeholder: "\u652F\u4ED8\u5B9D/\u5FAE\u4FE1/Apple\u2026", onChange: (e) => set({ paymentMethod: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u63D0\u524D\u63D0\u9192\u5929\u6570\uFF080..30\uFF0C\u7A7A=\u9ED8\u8BA4\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.remindDaysBefore, inputMode: "numeric", onChange: (e) => set({ remindDaysBefore: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u7BA1\u7406/\u53D6\u6D88\u5165\u53E3\uFF08http/https\uFF09" }),
      /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.manageUrl, maxLength: LIMITS2.manageUrl, placeholder: "https://\u2026\uFF08\u4F1A\u5458\u7BA1\u7406\u9875\uFF09", onChange: (e) => set({ manageUrl: e.target.value }) }),
      /* @__PURE__ */ jsx2("label", { className: "sz-lbl", children: "\u5907\u6CE8\uFF08\u52FF\u5B58\u5BC6\u7801\u7B49\u654F\u611F\u4FE1\u606F\uFF09" }),
      /* @__PURE__ */ jsx2("input", { className: "sz-inp", value: f.note, maxLength: LIMITS2.note, onChange: (e) => set({ note: e.target.value }) }),
      /* @__PURE__ */ jsxs2("label", { className: "sz-lbl", style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: f.autoRenew, onChange: (e) => set({ autoRenew: e.target.checked }) }),
        " \u81EA\u52A8\u7EED\u8D39"
      ] }),
      !editing && f.nextRenewalDate === "" && Number(f.amount) > 0 && /* @__PURE__ */ jsxs2("div", { className: "sz-sub", style: { marginTop: 6 }, children: [
        "\u9884\u89C8\uFF1A\u4E0B\u6B21\u6263\u8D39 ",
        advanceDate2(todayStr2(), f.cycle, f.cycle === "custom" ? Number(f.customDays) : void 0) || "\uFF08\u5468\u671F/\u5929\u6570\u5F85\u4FEE\u6B63\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sz-modal-foot", children: [
      /* @__PURE__ */ jsx2("button", { className: "sz-btn ghost", onClick: props.onClose, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ jsx2("button", { className: "sz-btn", disabled: saving || !f.name || !f.amount, onClick: () => void submit(), children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
    ] })
  ] }) });
}
function SubsTab({ data, reload, showToast }) {
  const [filter, setFilter] = useState2("active");
  const [kw, setKw] = useState2("");
  const [form, setForm] = useState2(null);
  const [busy, setBusy] = useState2(null);
  const [confirmId, setConfirmId] = useState2("");
  const subs = useMemo(() => {
    if (!data) return [];
    let list = data.subs;
    if (filter !== "all") list = list.filter((s) => s.status === filter);
    if (kw.trim()) {
      const q = kw.trim().toLowerCase();
      list = list.filter((s) => [s.name, s.vendor, s.plan, s.note, s.paymentMethod].filter(Boolean).join(" ").toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) => (annualCost2(b) || 0) - (annualCost2(a) || 0));
  }, [data, filter, kw]);
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "sz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const sym = data.settings.currencySymbol;
  const op = async (s, kind) => {
    setBusy(s.id + kind);
    try {
      if (kind === "renew") {
        const r = renewSub2(s, {});
        if (r.error || !r.sub) {
          showToast(r.error || "\u5931\u8D25", "bad");
          return;
        }
        await saveSub(r.sub);
        showToast(`\u5DF2\u5BF9\u8D26\uFF1A${s.name}\uFF0C\u4E0B\u4E00\u671F ${r.sub.nextRenewalDate}`, "good");
      } else if (kind === "pause") {
        await saveSub(pauseSub2(s, {}).sub);
        showToast(`\u300C${s.name}\u300D\u5DF2\u6682\u505C`, "good");
      } else if (kind === "resume") {
        const next = advanceDate2(todayStr2(), s.cycle, s.customDays);
        if (!next) {
          showToast("\u65E0\u6CD5\u63A8\u7B97\u6062\u590D\u540E\u7684\u6263\u8D39\u65E5\uFF0C\u8BF7\u7F16\u8F91\u540E\u64CD\u4F5C", "bad");
          return;
        }
        const r = resumeSub2(s, next);
        if (r.error || !r.sub) {
          showToast(r.error || "\u5931\u8D25", "bad");
          return;
        }
        await saveSub(r.sub);
        showToast(`\u300C${s.name}\u300D\u5DF2\u6062\u590D\uFF0C\u4E0B\u6B21\u6263\u8D39 ${next}\uFF08\u53EF\u5728\u7F16\u8F91\u91CC\u6539\uFF09`, "good");
      } else {
        await deleteSub(s.id);
        showToast(`\u5DF2\u5F7B\u5E95\u5220\u9664\u300C${s.name}\u300D`, "good");
      }
      await reload();
    } finally {
      setBusy(null);
    }
  };
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "sz-bar" }),
      "\u8BA2\u9605",
      /* @__PURE__ */ jsx2("button", { className: "sz-btn sm", style: { marginLeft: "auto" }, onClick: () => setForm({ ...emptyForm(data.settings.defaultRemindDays) }), children: "\uFF0B \u767B\u8BB0" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "sz-card", children: /* @__PURE__ */ jsxs2("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsx2("div", { className: "sz-row", children: [["active", "\u751F\u6548\u4E2D"], ["trial", "\u8BD5\u7528"], ["paused", "\u6682\u505C"], ["cancelled", "\u5DF2\u53D6\u6D88"], ["all", "\u5168\u90E8"]].map(([k, label]) => /* @__PURE__ */ jsxs2("button", { className: `sz-chip ${filter === k ? "on" : ""}`, onClick: () => setFilter(k), children: [
        label,
        k !== "all" && data.stats.counts[k] ? ` ${data.stats.counts[k]}` : ""
      ] }, k)) }),
      /* @__PURE__ */ jsx2("input", { className: "sz-inp", style: { marginTop: 8 }, value: kw, placeholder: "\u641C\u7D22\u540D\u79F0/\u670D\u52A1\u5546/\u5907\u6CE8\u2026", onChange: (e) => setKw(e.target.value) })
    ] }) }),
    /* @__PURE__ */ jsx2("div", { className: "sz-card", children: /* @__PURE__ */ jsxs2("div", { className: "sz-card-b", style: { padding: "2px 13px" }, children: [
      !subs.length && /* @__PURE__ */ jsxs2("div", { className: "sz-empty", children: [
        "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u8BA2\u9605\u3002",
        /* @__PURE__ */ jsx2("br", {}),
        "\u70B9\u53F3\u4E0A\u300C\uFF0B \u767B\u8BB0\u300D\uFF0C\u6216\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u6211\u8BA2\u4E86 xx \u6708\u8D39 xx\u300D\u3002"
      ] }),
      subs.map((s) => {
        const badge = stateBadge(s);
        const diff = s.status === "trial" && s.trialEndsAt ? daysBetween2(todayStr2(), s.trialEndsAt) : daysBetween2(todayStr2(), s.nextRenewalDate);
        return /* @__PURE__ */ jsxs2("div", { className: "sz-item", children: [
          /* @__PURE__ */ jsxs2("div", { className: "sz-item-main", children: [
            /* @__PURE__ */ jsxs2("b", { children: [
              s.name,
              badge && /* @__PURE__ */ jsx2("span", { className: `sz-badge ${badge.cls}`, children: badge.text })
            ] }),
            /* @__PURE__ */ jsxs2("small", { children: [
              s.vendor ? `${s.vendor} \xB7 ` : "",
              s.plan ? `${s.plan} \xB7 ` : "",
              s.category,
              " \xB7 ",
              s.paymentMethod || "\u652F\u4ED8\u65B9\u5F0F\u672A\u8BB0",
              diff !== null && (s.status === "active" || s.status === "trial") ? ` \xB7 ${diff < 0 ? `\u6263\u8D39\u65E5\u5DF2\u8FC7 ${-diff} \u5929` : diff === 0 ? "\u4ECA\u5929\u6263\u8D39" : `${diff} \u5929\u540E`} ` : "",
              s.priceHistory.length > 1 ? ` \xB7 \u5F00\u901A\u4EF7 ${fmtMoney2(s.priceHistory[0].amount, sym)}` : ""
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "sz-ops", children: [
              (s.status === "active" || s.status === "trial") && /* @__PURE__ */ jsx2("button", { className: "sz-btn sm", disabled: busy === s.id + "renew", onClick: () => void op(s, "renew"), children: "\u5BF9\u8D26\u7EED\u8D39" }),
              s.status === "paused" && /* @__PURE__ */ jsx2("button", { className: "sz-btn sm", disabled: busy === s.id + "resume", onClick: () => void op(s, "resume"), children: "\u6062\u590D" }),
              s.status === "cancelled" && /* @__PURE__ */ jsx2("button", { className: "sz-btn sm", disabled: busy === s.id + "resume", onClick: () => void op(s, "resume"), children: "\u6062\u590D\u8BA2\u9605" }),
              (s.status === "active" || s.status === "trial") && /* @__PURE__ */ jsx2("button", { className: "sz-btn ghost sm", disabled: busy === s.id + "pause", onClick: () => void op(s, "pause"), children: "\u6682\u505C" }),
              (s.status === "active" || s.status === "trial" || s.status === "paused") && /* @__PURE__ */ jsx2("button", { className: "sz-btn warn sm", disabled: busy === s.id + "cancel", onClick: async () => {
                const reason = s.status === "trial" ? "\u8BD5\u7528\u540E\u53D6\u6D88" : "\u4E0D\u518D\u7EED\u8D39";
                await saveSub(cancelSub2(s, { reason }).sub);
                showToast(`\u300C${s.name}\u300D\u5DF2\u53D6\u6D88\uFF08\u53EF\u6062\u590D\uFF09`, "good");
                await reload();
              }, children: "\u53D6\u6D88" }),
              /* @__PURE__ */ jsx2("button", { className: "sz-btn ghost sm", onClick: () => setForm({ ...toForm(s), __sub: s }), children: "\u7F16\u8F91" }),
              s.id !== confirmId && /* @__PURE__ */ jsx2("button", { className: "sz-btn danger sm", onClick: () => setConfirmId(s.id), children: "\u5220\u9664" })
            ] }),
            confirmId === s.id && /* @__PURE__ */ jsxs2("div", { className: "sz-ops", children: [
              /* @__PURE__ */ jsx2("span", { className: "sz-sub", children: "\u5F7B\u5E95\u5220\u9664\u4E0D\u53EF\u6062\u590D\uFF08\u542B\u4EF7\u683C\u53F2\uFF09\uFF1A" }),
              /* @__PURE__ */ jsx2("button", { className: "sz-btn danger sm", onClick: async () => {
                setConfirmId("");
                await op(s, "delete");
              }, children: "\u786E\u8BA4\u5220\u9664" }),
              /* @__PURE__ */ jsx2("button", { className: "sz-btn ghost sm", onClick: () => setConfirmId(""), children: "\u7B97\u4E86" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "sz-item-amt", children: [
            fmtMoney2(s.amount, sym),
            /* @__PURE__ */ jsxs2("small", { children: [
              "/",
              cycleLabel2(s)
            ] }),
            /* @__PURE__ */ jsxs2("small", { children: [
              "\u5E74\u5316 ",
              fmtMoney2(annualCost2(s) || 0, sym)
            ] })
          ] })
        ] }, s.id);
      })
    ] }) }),
    form && /* @__PURE__ */ jsx2(
      SubForm,
      {
        init: form,
        symbol: sym,
        onClose: () => setForm(null),
        showToast,
        onSaved: async (msg) => {
          setForm(null);
          showToast(msg, "good");
          await reload();
        }
      }
    )
  ] });
}

// src/StatsTab.tsx
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function StatsTab({ data }) {
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "sz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const { stats: stats3, settings } = data;
  const sym = settings.currencySymbol;
  const maxCat = Math.max(...stats3.byCategory.map((c) => c.monthly), 1);
  const maxFlow = Math.max(...stats3.cashflow.map((c) => c.amount), 1);
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sz-bar" }),
      "\u603B\u8D26"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "sz-card", children: /* @__PURE__ */ jsxs3("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsxs3("small", { children: [
          "\u751F\u6548\u4E2D\uFF08",
          stats3.counts.active,
          " \u7B14\uFF09\u6708\u5747"
        ] }),
        /* @__PURE__ */ jsx3("b", { children: fmtMoney2(stats3.monthlyActive, sym) })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsx3("small", { children: "\u751F\u6548\u4E2D\u5E74\u5316" }),
        /* @__PURE__ */ jsx3("b", { children: fmtMoney2(stats3.annualActive, sym) })
      ] }),
      stats3.counts.trial > 0 && /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsxs3("small", { children: [
          "\u8BD5\u7528 ",
          stats3.counts.trial,
          " \u7B14\u82E5\u8F6C\u6B63\uFF0C\u6708\u5747\u518D\u52A0"
        ] }),
        /* @__PURE__ */ jsxs3("b", { children: [
          "+",
          fmtMoney2(stats3.monthlyTrial, sym)
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsxs3("small", { children: [
          "\u6682\u505C\uFF08",
          stats3.counts.paused,
          " \u7B14\uFF0C\u4E0D\u8BA1\u5165\uFF09"
        ] }),
        /* @__PURE__ */ jsx3("b", { children: stats3.counts.paused })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsxs3("small", { children: [
          "\u5DF2\u53D6\u6D88\uFF08",
          stats3.counts.cancelled,
          " \u7B14\uFF09\u5E74\u5316\u6B62\u635F"
        ] }),
        /* @__PURE__ */ jsx3("b", { style: { color: "#7EE2A0" }, children: fmtMoney2(stats3.savedAnnual, sym) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sz-bar" }),
      "\u5206\u7C7B\u5360\u6BD4",
      /* @__PURE__ */ jsx3("span", { className: "sz-hint", children: "\u751F\u6548\u4E2D\uFF0C\u6309\u6708\u5747" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "sz-card", children: /* @__PURE__ */ jsxs3("div", { className: "sz-card-b", children: [
      !stats3.byCategory.length && /* @__PURE__ */ jsx3("div", { className: "sz-empty", children: "\u8FD8\u6CA1\u6709\u751F\u6548\u4E2D\u7684\u8BA2\u9605" }),
      stats3.byCategory.map((c) => /* @__PURE__ */ jsxs3("div", { style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
          /* @__PURE__ */ jsxs3("small", { children: [
            c.category,
            "\uFF08",
            c.count,
            " \u7B14\uFF09"
          ] }),
          /* @__PURE__ */ jsxs3("b", { children: [
            fmtMoney2(c.monthly, sym),
            "/\u6708"
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "sz-pct", children: /* @__PURE__ */ jsx3("i", { style: { width: `${Math.max(2, Math.round(c.monthly / maxCat * 100))}%` } }) })
      ] }, c.category))
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sz-bar" }),
      "\u5E74\u5316\u6392\u884C",
      /* @__PURE__ */ jsx3("span", { className: "sz-hint", children: "\u542B\u8BD5\u7528\u8F6C\u6B63\u9884\u4F30" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "sz-card", children: /* @__PURE__ */ jsxs3("div", { className: "sz-card-b", style: { padding: "2px 13px" }, children: [
      !stats3.topAnnual.length && /* @__PURE__ */ jsx3("div", { className: "sz-empty", children: "\u8FD8\u6CA1\u6709\u8BA2\u9605" }),
      stats3.topAnnual.map((t, i) => /* @__PURE__ */ jsxs3("div", { className: "sz-item", children: [
        /* @__PURE__ */ jsxs3("div", { className: "sz-item-main", children: [
          /* @__PURE__ */ jsxs3("b", { children: [
            i + 1,
            ". ",
            t.name,
            t.status === "trial" && /* @__PURE__ */ jsx3("span", { className: "sz-badge info", children: "\u8BD5\u7528" })
          ] }),
          /* @__PURE__ */ jsxs3("small", { children: [
            t.vendor ? `${t.vendor} \xB7 ` : "",
            t.category,
            " \xB7 ",
            fmtMoney2(t.amount, sym),
            "/",
            t.cycleLabel,
            " \xB7 \u4E0B\u6B21 ",
            t.nextRenewalDate
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "sz-item-amt", children: [
          fmtMoney2(t.annual, sym),
          /* @__PURE__ */ jsx3("small", { children: "\u5E74\u5316" })
        ] })
      ] }, t.id))
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sz-bar" }),
      "\u6DA8\u4EF7\u76D1\u63A7",
      /* @__PURE__ */ jsx3("span", { className: "sz-hint", children: "\u73B0\u4EF7 \u2260 \u5F00\u901A\u4EF7" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "sz-card", children: /* @__PURE__ */ jsxs3("div", { className: "sz-card-b", children: [
      !stats3.priceChanges.length && /* @__PURE__ */ jsxs3("div", { className: "sz-empty", children: [
        "\u6682\u65E0\u4EF7\u683C\u53D8\u52A8\u8BB0\u5F55",
        /* @__PURE__ */ jsx3("br", {}),
        /* @__PURE__ */ jsx3("span", { className: "sz-sub", children: "\u6BCF\u6B21\u5BF9\u8D26\uFF08\u786E\u8BA4\u7EED\u8D39/\u6539\u4EF7\uFF09\u90FD\u4F1A\u8BB0\u5165\u4EF7\u683C\u53F2\uFF0C\u6DA8\u4EF7\u81EA\u52A8\u6D6E\u51FA\u3002" })
      ] }),
      stats3.priceChanges.map((p) => {
        const up = p.to > p.from;
        return /* @__PURE__ */ jsxs3("div", { className: "sz-kv", children: [
          /* @__PURE__ */ jsxs3("small", { children: [
            p.name,
            p.vendor ? `\uFF08${p.vendor}\uFF09` : "",
            " \xB7 ",
            p.date
          ] }),
          /* @__PURE__ */ jsxs3("b", { children: [
            fmtMoney2(p.from, sym),
            " \u2192 ",
            fmtMoney2(p.to, sym),
            " ",
            /* @__PURE__ */ jsxs3("span", { style: { color: up ? "#FF8A9A" : "#7EE2A0" }, children: [
              up ? "\u2191" : "\u2193",
              Math.abs(Math.round((p.to - p.from) / p.from * 100)),
              "%"
            ] })
          ] })
        ] }, p.id);
      })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sz-bar" }),
      "\u5DF2\u53D6\u6D88\uFF08",
      stats3.counts.cancelled,
      "\uFF09"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "sz-card", children: /* @__PURE__ */ jsxs3("div", { className: "sz-card-b", style: { padding: "2px 13px" }, children: [
      !stats3.counts.cancelled && /* @__PURE__ */ jsx3("div", { className: "sz-empty", children: "\u8FD8\u6CA1\u6709\u53D6\u6D88\u8FC7\u8BA2\u9605" }),
      data.subs.filter((s) => s.status === "cancelled").map((s) => /* @__PURE__ */ jsxs3("div", { className: "sz-item", children: [
        /* @__PURE__ */ jsxs3("div", { className: "sz-item-main", children: [
          /* @__PURE__ */ jsxs3("b", { children: [
            s.name,
            /* @__PURE__ */ jsx3("span", { className: "sz-badge off", children: STATUS_LABELS2[s.status] })
          ] }),
          /* @__PURE__ */ jsxs3("small", { children: [
            s.cancelReason ? `\u539F\u56E0\uFF1A${s.cancelReason} \xB7 ` : "",
            s.cancelledAt ? `${s.cancelledAt} \u53D6\u6D88` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "sz-item-amt", style: { color: "#7EE2A0" }, children: [
          "\u5E74\u7701 ",
          fmtMoney2(annualCost2(s) || 0, sym)
        ] })
      ] }, s.id))
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "sz-bar" }),
      "\u6708\u5EA6\u6263\u8D39\u5206\u5E03"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "sz-card", children: /* @__PURE__ */ jsxs3("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsx3("div", { className: "sz-bars", children: stats3.cashflow.map((c) => /* @__PURE__ */ jsxs3("div", { className: `sz-barcol ${c.amount > stats3.monthlyActive * 1.5 ? "hot" : ""}`, title: c.items.map((i) => `${i.date} ${i.name} ${fmtMoney2(i.amount, sym)}`).join("\n"), children: [
        /* @__PURE__ */ jsx3("i", { style: { height: `${Math.max(3, Math.round(c.amount / maxFlow * 74))}px` } }),
        /* @__PURE__ */ jsx3("small", { children: Number(c.month.slice(5)) })
      ] }, c.month)) }),
      /* @__PURE__ */ jsx3("div", { className: "sz-sub", style: { marginTop: 6 }, children: "\u6A2A\u8F74\u4E3A\u672A\u6765 12 \u4E2A\u6708\u7684\u6708\u4EFD\uFF081..12 \u663E\u793A\u6708\u4EFD\u6570\u5B57\uFF09\uFF0C\u9EC4\u8272 = \u5927\u989D\u5E74\u8D39\u624E\u5806\u6708\u3002" })
    ] }) })
  ] });
}

// src/SettingsTab.tsx
import { useRef, useState as useState3 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [symbol, setSymbol] = useState3("");
  const [remind, setRemind] = useState3("");
  const [saving, setSaving] = useState3(false);
  const [clearArmed, setClearArmed] = useState3(false);
  const fileRef = useRef(null);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "sz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.settings;
  const sym = s.currencySymbol;
  const save = async () => {
    setSaving(true);
    try {
      const next = {
        ...s,
        currencySymbol: (symbol || s.currencySymbol || "\xA5").slice(0, 4),
        defaultRemindDays: (() => {
          const n = Number(remind);
          return Number.isFinite(n) && remind !== "" ? Math.max(0, Math.min(30, Math.round(n))) : s.defaultRemindDays;
        })()
      };
      await saveSettings(next);
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58", "good");
    } finally {
      setSaving(false);
      setSymbol("");
      setRemind("");
    }
  };
  const exportCsv = () => {
    const csv = toCsv2(data.subs, sym);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shouzha-subs-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
  };
  const importCsv = async (file) => {
    const text = await file.text();
    const r = fromCsv2(text);
    if (r.error) {
      showToast(r.error, "bad");
      return;
    }
    const existing = await loadSubs();
    const sig = (x) => `${x.name}|${x.cycle}|${x.amount}|${x.nextRenewalDate}`;
    const known = new Set(existing.map(sig));
    let added = 0;
    let dup = 0;
    const errors = [];
    for (const item of r.items) {
      if (!item.ok || !item.sub) {
        if (item.error) errors.push(item.error);
        continue;
      }
      if (known.has(sig(item.sub))) {
        dup++;
        continue;
      }
      await saveSub(item.sub);
      known.add(sig(item.sub));
      added++;
    }
    await reload();
    const parts = [`\u5BFC\u5165 ${added} \u7B14`];
    if (dup) parts.push(`\u8DF3\u8FC7\u91CD\u590D ${dup} \u7B14`);
    if (errors.length) parts.push(`\u5931\u8D25 ${errors.length} \u884C\uFF08${errors[0]}${errors.length > 1 ? " \u7B49" : ""}\uFF09`);
    showToast(parts.join("\uFF0C"), errors.length ? "bad" : "good");
  };
  const clearAll = async () => {
    const subs = data.subs;
    for (const sub of subs) await deleteSub(sub.id);
    await reload();
    showToast(`\u5DF2\u6E05\u7A7A ${subs.length} \u7B14\u8BA2\u9605\u6863\u6848`, "good");
  };
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sz-bar" }),
      "\u663E\u793A\u4E0E\u63D0\u9192"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "sz-card", children: /* @__PURE__ */ jsxs4("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "sz-grid2", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsxs4("label", { className: "sz-lbl", children: [
            "\u5E01\u79CD\u7B26\u53F7\uFF08\u5F53\u524D ",
            sym,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx4("input", { className: "sz-inp", value: symbol, maxLength: 4, placeholder: sym, onChange: (e) => setSymbol(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsxs4("label", { className: "sz-lbl", children: [
            "\u9ED8\u8BA4\u63D0\u524D\u63D0\u9192\u5929\u6570\uFF08\u5F53\u524D ",
            s.defaultRemindDays,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx4("input", { className: "sz-inp", value: remind, inputMode: "numeric", placeholder: String(s.defaultRemindDays), onChange: (e) => setRemind(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "sz-row", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx4("button", { className: "sz-btn", disabled: saving, onClick: () => void save(), children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }) }),
      /* @__PURE__ */ jsx4("div", { className: "sz-sub", style: { marginTop: 8 }, children: "\u63D0\u9192\u89E6\u8FBE = \u6253\u5F00\u9762\u677F\u65F6\u7684\u6A2A\u5E45\u4E0E\u63D0\u793A\u97F3 + \u804A\u5929\u91CC\u95EE AI\u300C\u6700\u8FD1\u8981\u6263\u54EA\u4E9B\u94B1\u300D\u3002\u5F53\u524D\u65E0\u7CFB\u7EDF\u63A8\u9001\u901A\u9053\uFF08\u4E0E\u65E5\u6677\u4E00\u81F4\uFF09\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sz-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "sz-card", children: /* @__PURE__ */ jsxs4("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsx4("small", { children: "\u8BA2\u9605\u6863\u6848" }),
        /* @__PURE__ */ jsxs4("b", { children: [
          data.subs.length,
          " \u7B14\uFF08\u542B\u5DF2\u53D6\u6D88\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sz-kv", children: [
        /* @__PURE__ */ jsx4("small", { children: "\u5E74\u5316\u5728\u7F34" }),
        /* @__PURE__ */ jsx4("b", { children: fmtMoney2(data.stats.annualActive, sym) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "sz-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "sz-btn ghost", onClick: exportCsv, children: "\u5BFC\u51FA CSV" }),
        /* @__PURE__ */ jsx4("button", { className: "sz-btn ghost", onClick: () => fileRef.current?.click(), children: "\u5BFC\u5165 CSV" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            ref: fileRef,
            type: "file",
            accept: ".csv,text/csv",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = "";
            }
          }
        )
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "sz-sub", style: { marginTop: 8 }, children: "CSV \u53EF\u8FC1\u79FB\u5230\u5176\u4ED6\u8BBE\u5907/\u5176\u4ED6\u8BB0\u8D26\u5DE5\u5177\uFF1B\u5BFC\u5165\u65F6\u540C\u540D+\u540C\u5468\u671F+\u540C\u91D1\u989D+\u540C\u6263\u8D39\u65E5\u89C6\u4E3A\u91CD\u590D\u81EA\u52A8\u8DF3\u8FC7\u3002 \u6570\u636E\u5168\u90E8\u5728\u672C\u673A\uFF08cap.kv\uFF09\uFF0C\u63D2\u4EF6\u81EA\u8EAB\u96F6\u7F51\u7EDC\u8BF7\u6C42\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "sz-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "sz-bar" }),
      "\u5371\u9669\u533A"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "sz-card", style: { borderColor: "#54262c" }, children: /* @__PURE__ */ jsxs4("div", { className: "sz-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "sz-sub", children: "\u6E05\u7A7A\u4F1A\u5220\u9664\u5168\u90E8\u8BA2\u9605\u6863\u6848\uFF08\u542B\u4EF7\u683C\u53F2\uFF09\uFF0C\u4E0D\u53EF\u6062\u590D\u3002\u5EFA\u8BAE\u5148\u5BFC\u51FA CSV\u3002" }),
      /* @__PURE__ */ jsx4(
        "button",
        {
          className: "sz-btn danger",
          style: { marginTop: 8 },
          onClick: async () => {
            if (clearArmed) {
              setClearArmed(false);
              await clearAll();
            } else {
              setClearArmed(true);
              setTimeout(() => setClearArmed(false), 4e3);
            }
          },
          children: clearArmed ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A\uFF01" : `\u6E05\u7A7A\u5168\u90E8 ${data.subs.length} \u7B14`
        }
      )
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.sz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sz-body::-webkit-scrollbar{width:9px;height:9px}
.sz-body::-webkit-scrollbar-track{background:transparent}
.sz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sz-page{max-width:560px;margin:0 auto}
.sz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.sz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3E7BFA,#1E5AD6);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.sz-tt{flex:1;min-width:0}
.sz-tt b{font-size:15px;display:block}
.sz-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.sz-cost{font-variant-numeric:tabular-nums}
.sz-cost b{color:#E6EAF2}
.sz-tabs{display:flex;gap:4px}
.sz-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.sz-tab:hover{color:#E6EAF2}
.sz-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sz-alert{margin:0 16px 10px;border-radius:12px;padding:10px 13px;font-size:12px;line-height:1.7;border:1px solid}
.sz-alert.red{background:#2A1418;border-color:#54262C;color:#FFB3BC}
.sz-alert.amber{background:#2A2114;border-color:#54401E;color:#F2C063}
.sz-alert b{display:block;margin-bottom:2px;font-size:12.5px}
.sz-alert .ops{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
.sz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3E7BFA,#1E5AD6);flex-shrink:0}
.sz-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sz-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sz-card-b{padding:11px 13px}
.sz-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.sz-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sz-btn{background:#1E5AD6;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.sz-btn:hover{filter:brightness(1.12)}
.sz-btn:disabled{opacity:.45;cursor:not-allowed}
.sz-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.sz-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.sz-btn.warn{background:#33270f;color:#F2C063;border:1px solid #54401e}
.sz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.sz-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.sz-inp:focus{outline:none;border-color:#1E5AD6}
.sz-inp::placeholder{color:#4d5566}
.sz-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.sz-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.sz-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.sz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.sz-toast.bad{border-color:#54262c;color:#FF8A9A}
.sz-toast.good{border-color:#2b4a35;color:#7EE2A0}
.sz-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.sz-chip:hover{border-color:#3a4356}
.sz-chip.on{background:#14243a;border-color:#1E5AD6;color:#79B8FF;font-weight:600}
.sz-badge{font-size:9.5px;padding:1px 6px;border-radius:6px;margin-left:6px;flex-shrink:0;font-weight:600}
.sz-badge.bad{background:#3a1d22;color:#FF8A9A}
.sz-badge.warn{background:#33270f;color:#F2C063}
.sz-badge.info{background:#16283a;color:#79B8FF}
.sz-badge.off{background:#1C2330;color:#5C6678}
.sz-item{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1d2330}
.sz-item:first-child{border-top:none}
.sz-item-main{flex:1;min-width:0}
.sz-item-main b{font-size:12.5px;display:flex;align-items:center;overflow:hidden;white-space:nowrap}
.sz-item-main small{color:#5C6678;font-size:10px;display:block;margin-top:1px}
.sz-item-amt{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;flex-shrink:0;text-align:right}
.sz-item-amt small{display:block;font-weight:400;color:#5C6678;font-size:10px}
.sz-ops{display:flex;gap:5px;flex-shrink:0;margin-top:5px;flex-wrap:wrap}
.sz-kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12px}
.sz-kv small{color:#8B95A7}
.sz-kv b{font-variant-numeric:tabular-nums}
.sz-bars{display:flex;align-items:flex-end;gap:3px;height:92px;padding:6px 2px 0}
.sz-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;cursor:default}
.sz-barcol i{display:block;width:100%;max-width:18px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#3E7BFA,#1E5AD6);min-height:2px}
.sz-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.sz-barcol.hot i{background:linear-gradient(180deg,#F2C063,#b0731f)}
.sz-pct{height:7px;border-radius:4px;background:#1C2330;overflow:hidden;margin-top:4px}
.sz-pct i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3E7BFA,#79B8FF)}
.sz-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.sz-field:first-child{border-top:none}
.sz-field-l{flex:1;min-width:0}
.sz-field-l b{font-size:12.5px;display:block}
.sz-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.sz-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.sz-modal{position:fixed;inset:0;background:rgba(8,10,14,.72);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
.sz-modal-box{background:#161B22;border:1px solid #242C3A;border-radius:13px;width:min(94vw,560px);max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
.sz-modal-head{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid #1d2330}
.sz-modal-head b{flex:1;font-size:13px}
.sz-modal-body{overflow-y:auto;padding:12px 13px}
.sz-modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 13px;border-top:1px solid #1d2330}
.sz-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
`;
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    for (const [f, t] of [[880, 0], [1174, 0.13]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      osc.type = "sine";
      gain.gain.setValueAtTime(1e-3, t0 + t);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(1e-3, t0 + t + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + t);
      osc.stop(t0 + t + 0.14);
    }
    setTimeout(() => {
      void ctx.close();
    }, 500);
  } catch (_) {
  }
}
function ShouzhaPanel(_props) {
  const [tab, setTab] = useState4("overview");
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const toastTimer = useRef2(null);
  const seenAlertKeys = useRef2(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadPanelData();
      setData(d);
      setLoadErr("");
      const keys = /* @__PURE__ */ new Set();
      for (const s of [...d.board.overdue, ...d.board.trials]) keys.add(s.id);
      if (seenAlertKeys.current === null) {
        seenAlertKeys.current = keys;
      } else {
        let hasNew = false;
        for (const k of keys) if (!seenAlertKeys.current.has(k)) {
          hasNew = true;
          break;
        }
        if (hasNew && document.visibilityState === "visible") beep();
        seenAlertKeys.current = keys;
      }
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    void poll();
    const timer = setInterval(poll, 8e3);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const headCost = (() => {
    if (!data) return "\u8F7D\u5165\u4E2D\u2026";
    const sym = data.settings.currencySymbol;
    const st = data.stats;
    const nOver = data.board.overdue.length;
    const nTrial = data.board.trials.length;
    const alertBits = [];
    if (nOver) alertBits.push(`${nOver} \u7B14\u903E\u671F\u5F85\u5BF9\u8D26`);
    if (nTrial) alertBits.push(`${nTrial} \u7B14\u8BD5\u7528\u5C06\u8F6C\u6B63`);
    return `\u6708\u5747 ${fmtMoney2(st.monthlyAll, sym)}${alertBits.length ? ` \xB7 \u26A0\uFE0F ${alertBits.join("\u3001")}` : ""}`;
  })();
  return /* @__PURE__ */ jsxs5("div", { className: "sz-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "sz-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "sz-logo", children: "\u{1F6AA}" }),
      /* @__PURE__ */ jsxs5("div", { className: "sz-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u5B88\u95F8" }),
        /* @__PURE__ */ jsx5("small", { className: "sz-cost", children: headCost })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "sz-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["subs", "\u8BA2\u9605"],
        ["stats", "\u900F\u89C6"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `sz-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "sz-body", children: /* @__PURE__ */ jsxs5("div", { className: "sz-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "sz-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx5(OverviewTab, { data, reload, showToast, goTab: setTab }),
      tab === "subs" && /* @__PURE__ */ jsx5(SubsTab, { data, reload, showToast }),
      tab === "stats" && /* @__PURE__ */ jsx5(StatsTab, { data }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `sz-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function ShouzhaEntry(props) {
  return /* @__PURE__ */ jsx6(ShouzhaPanel, { ...props });
}
export {
  ShouzhaEntry as default
};
