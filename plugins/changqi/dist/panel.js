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

// shared/subs-core.js
var require_subs_core = __commonJS({
  "shared/subs-core.js"(exports, module) {
    "use strict";
    var CYCLES2 = ["weekly", "monthly", "quarterly", "yearly", "custom"];
    var CYCLE_LABELS2 = { weekly: "\u6BCF\u5468", monthly: "\u6BCF\u6708", quarterly: "\u6BCF\u5B63", yearly: "\u6BCF\u5E74", custom: "\u81EA\u5B9A\u4E49" };
    var CHANNELS2 = ["alipay", "wechat", "apple", "card", "other"];
    var CHANNEL_LABELS2 = { alipay: "\u652F\u4ED8\u5B9D", wechat: "\u5FAE\u4FE1", apple: "Apple", card: "\u94F6\u884C\u5361", other: "\u5176\u4ED6" };
    var STATUSES = ["active", "trial", "cancelled"];
    var STATUS_LABELS2 = { active: "\u8FDB\u884C\u4E2D", trial: "\u8BD5\u7528\u671F", cancelled: "\u5DF2\u53D6\u6D88" };
    var DEFAULT_CATEGORIES2 = ["\u5F71\u89C6\u97F3\u4E50", "\u8F6F\u4EF6\u5DE5\u5177", "\u4E91\u5B58\u50A8", "AI \u8BA2\u9605", "\u7535\u5546\u4F1A\u5458", "\u6E38\u620F", "\u5B66\u4E60", "\u751F\u6D3B\u670D\u52A1", "\u5176\u4ED6"];
    var DEFAULT_SETTINGS2 = {
      schemaVersion: 1,
      currencySymbol: "\xA5",
      /** 续费前提醒天数（0=仅当天提醒） */
      remindDays: 3,
      /** 试用转正预警天数 */
      trialWarnDays: 3
    };
    var K3 = {
      subPrefix: "changqi.sub.",
      sub(id) {
        return `changqi.sub.${id}`;
      },
      settings: "changqi.settings"
    };
    function todayStr2(nowMs) {
      const d = new Date(nowMs == null ? Date.now() : nowMs);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseYMD(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return { y, m: mo, d };
    }
    function fmtYMD(p) {
      return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    }
    function daysInMonth(y, m) {
      return new Date(y, m, 0).getDate();
    }
    function diffDays(base, target) {
      const b = parseYMD(base);
      const t = parseYMD(target);
      if (!b || !t) return null;
      return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(b.y, b.m - 1, b.d)) / 864e5);
    }
    function cmpDate(a, b) {
      const d = diffDays(b, a);
      return d === 0 ? 0 : d > 0 ? 1 : -1;
    }
    function clampDayAtMonthIndex(idx, nominalDay) {
      const y = Math.floor(idx / 12);
      const m = idx % 12 + 1;
      return { y, m, d: Math.min(nominalDay, daysInMonth(y, m)) };
    }
    function nextChargeDateFrom(anchor, cycle, cycleDays, today, notBefore) {
      const a = parseYMD(anchor);
      const t = parseYMD(today);
      if (!a || !t) return null;
      const floorMs = notBefore && parseYMD(notBefore) ? Date.UTC(parseYMD(notBefore).y, parseYMD(notBefore).m - 1, parseYMD(notBefore).d) : null;
      if (cycle === "weekly" || cycle === "custom") {
        const step = cycle === "weekly" ? 7 : Math.max(1, Math.floor(cycleDays || 1));
        let ms = Date.UTC(a.y, a.m - 1, a.d);
        const tMs = Date.UTC(t.y, t.m - 1, t.d);
        let guard = 0;
        while (ms < tMs || floorMs != null && ms <= floorMs) {
          ms += step * 864e5;
          if (++guard > 6e3) return null;
        }
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      }
      if (cycle === "monthly" || cycle === "quarterly") {
        const stepMonths = cycle === "monthly" ? 1 : 3;
        let idx = a.y * 12 + (a.m - 1);
        let guard = 0;
        while (guard <= 3e3) {
          const cur = clampDayAtMonthIndex(idx, a.d);
          const curMs = Date.UTC(cur.y, cur.m - 1, cur.d);
          if (curMs >= Date.UTC(t.y, t.m - 1, t.d) && (floorMs == null || curMs > floorMs)) return fmtYMD(cur);
          idx += stepMonths;
          guard++;
        }
        return null;
      }
      if (cycle === "yearly") {
        let y = a.y;
        let guard = 0;
        while (guard <= 300) {
          const cur = { y, m: a.m, d: Math.min(a.d, daysInMonth(y, a.m)) };
          const curMs = Date.UTC(cur.y, cur.m - 1, cur.d);
          if (curMs >= Date.UTC(t.y, t.m - 1, t.d) && (floorMs == null || curMs > floorMs)) return fmtYMD(cur);
          y += 1;
          guard++;
        }
        return null;
      }
      return null;
    }
    function nextChargeDateOf(sub, today) {
      if (!sub || typeof sub !== "object") return null;
      if (sub.status === "cancelled") return null;
      if (sub.status === "trial") return sub.trialEndsAt || null;
      return nextChargeDateFrom(sub.anchorDate, sub.cycle, sub.cycleDays, today, sub.lastConfirmedDate);
    }
    function monthlyEquivalent2(sub) {
      const amt = Number(sub && sub.amount) || 0;
      switch (sub && sub.cycle) {
        case "weekly":
          return round2(amt * 52 / 12);
        case "monthly":
          return round2(amt);
        case "quarterly":
          return round2(amt / 3);
        case "yearly":
          return round2(amt / 12);
        case "custom": {
          const days = Math.max(1, Math.floor(Number(sub.cycleDays) || 1));
          return round2(amt * (365.25 / 12) / days);
        }
        default:
          return 0;
      }
    }
    function round2(n) {
      return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    }
    function fmtMoney2(n, symbol) {
      const sym = symbol == null ? "\xA5" : symbol;
      const num = Number(n) || 0;
      const neg = num < 0;
      const [i, f] = Math.abs(num).toFixed(2).split(".");
      const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return `${neg ? "-" : ""}${sym}${ii}.${f}`;
    }
    function urgencyOf(sub, settings, today) {
      if (!sub || sub.status === "cancelled") return null;
      const remindDays = Math.max(0, Number(settings && settings.remindDays) || 0);
      const trialWarnDays = Math.max(0, Number(settings && settings.trialWarnDays) || 0);
      if (sub.status === "trial") {
        const d2 = sub.trialEndsAt ? diffDays(today, sub.trialEndsAt) : null;
        if (d2 == null) return "calm";
        if (d2 <= trialWarnDays) return "trial";
        if (d2 <= 0) return "today";
        if (d2 <= remindDays) return "soon";
        if (d2 <= 7) return "week";
        return "calm";
      }
      const next = nextChargeDateOf(sub, today);
      if (!next) return "calm";
      const d = diffDays(today, next);
      if (d != null && d <= 0) return "today";
      if (d != null && d <= remindDays) return "soon";
      if (d != null && d <= 7) return "week";
      return "calm";
    }
    var URGENCY_LABELS2 = { today: "\u4ECA\u5929\u6263\u8D39", soon: "\u5373\u5C06\u6263\u8D39", week: "\u672C\u5468\u5185", trial: "\u8BD5\u7528\u5C06\u8F6C\u6B63", calm: "" };
    var URGENCY_ORDER = { today: 0, trial: 1, soon: 2, week: 3, calm: 4 };
    function normalizeSub(raw, nowMs) {
      const now = nowMs == null ? Date.now() : nowMs;
      if (!raw || typeof raw !== "object") return { error: "\u53C2\u6570\u7F3A\u5931" };
      const name = String(raw.name == null ? "" : raw.name).trim();
      if (!name) return { error: "\u9700\u8981 name\uFF08\u8BA2\u9605\u540D\u79F0\uFF09" };
      if (name.length > 60) return { error: "name \u8FC7\u957F\uFF08\u226460 \u5B57\uFF09" };
      const amount = Number(raw.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: "amount \u9700\u4E3A\u6B63\u6570\uFF08\u6BCF\u671F\u91D1\u989D\uFF09" };
      const amt = round2(amount);
      if (amt > 1e9) return { error: "amount \u8FC7\u5927" };
      const cycle = String(raw.cycle || "monthly");
      if (!CYCLES2.includes(cycle)) return { error: `cycle \u9700\u4E3A ${CYCLES2.join("/")}` };
      let cycleDays;
      if (cycle === "custom") {
        cycleDays = Math.floor(Number(raw.cycleDays));
        if (!Number.isFinite(cycleDays) || cycleDays < 1) return { error: "custom \u5468\u671F\u9700\u63D0\u4F9B cycleDays\uFF08\u22651 \u7684\u6574\u6570\u5929\uFF09" };
      }
      const anchor = String(raw.anchorDate || "").trim();
      if (!anchor) return { error: "\u9700\u8981 anchorDate\uFF08\u4E0A\u6B21\u6263\u8D39\u65E5\u6216\u4E0B\u6B21\u6263\u8D39\u65E5\uFF0CYYYY-MM-DD\uFF09" };
      if (!parseYMD(anchor)) return { error: "anchorDate \u683C\u5F0F\u5E94\u4E3A YYYY-MM-DD" };
      const channel = String(raw.channel || "other");
      if (!CHANNELS2.includes(channel)) return { error: `channel \u9700\u4E3A ${CHANNELS2.join("/")}` };
      const note = String(raw.note == null ? "" : raw.note).trim();
      if (note.length > 200) return { error: "note \u8FC7\u957F\uFF08\u2264200 \u5B57\uFF09" };
      let trialEndsAt;
      if (raw.trialEndsAt != null && raw.trialEndsAt !== "") {
        trialEndsAt = String(raw.trialEndsAt).trim();
        if (!parseYMD(trialEndsAt)) return { error: "trialEndsAt \u683C\u5F0F\u5E94\u4E3A YYYY-MM-DD" };
      }
      const status = STATUSES.includes(raw.status) ? raw.status : trialEndsAt ? "trial" : "active";
      if (status === "trial" && !trialEndsAt) return { error: "trial \u72B6\u6001\u9700\u8981 trialEndsAt\uFF08\u8BD5\u7528\u671F\u622A\u6B62\u65E5\uFF09" };
      const category = String(raw.category == null ? "" : raw.category).trim() || "\u5176\u4ED6";
      if (category.length > 30) return { error: "category \u8FC7\u957F\uFF08\u226430 \u5B57\uFF09" };
      const sub = {
        id: String(raw.id || genId(now)),
        name,
        amount: amt,
        currency: String(raw.currency || "CNY"),
        cycle,
        channel,
        category,
        status,
        anchorDate: anchor,
        note,
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
        updatedAt: now
      };
      if (cycleDays != null) sub.cycleDays = cycleDays;
      if (trialEndsAt) sub.trialEndsAt = trialEndsAt;
      if (raw.lastConfirmedDate && parseYMD(raw.lastConfirmedDate)) sub.lastConfirmedDate = String(raw.lastConfirmedDate);
      return { sub };
    }
    function applyPatch(existing, patch, nowMs) {
      if (!existing || typeof existing !== "object") return { error: "\u8BA2\u9605\u4E0D\u5B58\u5728" };
      const merged = { ...existing };
      const keys = ["name", "amount", "currency", "cycle", "cycleDays", "anchorDate", "channel", "category", "status", "trialEndsAt", "note", "lastConfirmedDate"];
      for (const k of keys) {
        if (patch && patch[k] !== void 0) merged[k] = patch[k];
      }
      if (patch && patch.trialEndsAt === "") {
        delete merged.trialEndsAt;
        if (merged.status === "trial") merged.status = "active";
      }
      return normalizeSub(merged, nowMs);
    }
    function genId(nowMs) {
      const n = nowMs == null ? Date.now() : nowMs;
      return `sub_${n.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
    }
    function computeOverview2(subs, settings, today, monthKey) {
      const list = (Array.isArray(subs) ? subs : []).filter((s) => s && typeof s === "object");
      const active = list.filter((s) => s.status === "active" || s.status === "trial");
      const cancelledCount = list.length - active.length;
      let monthlyTotal = 0;
      const rows = [];
      for (const s of active) {
        const me = monthlyEquivalent2(s);
        monthlyTotal += me;
        const next = nextChargeDateOf(s, today);
        const urg = urgencyOf(s, settings, today);
        rows.push({
          sub: s,
          monthlyEquiv: me,
          nextChargeDate: next,
          daysUntil: next ? diffDays(today, next) : null,
          urgency: urg
        });
      }
      rows.sort((a, b) => {
        const ua = URGENCY_ORDER[a.urgency] ?? 9;
        const ub = URGENCY_ORDER[b.urgency] ?? 9;
        if (ua !== ub) return ua - ub;
        const da = a.daysUntil == null ? 1e9 : a.daysUntil;
        const db = b.daysUntil == null ? 1e9 : b.daysUntil;
        if (da !== db) return da - db;
        return b.monthlyEquiv - a.monthlyEquiv;
      });
      let monthCount = 0;
      let monthSum = 0;
      let todayCount = 0;
      let todaySum = 0;
      for (const r of rows) {
        if (r.nextChargeDate && r.nextChargeDate.slice(0, 7) === monthKey) {
          monthCount += 1;
          monthSum += r.sub.amount;
        }
        if (r.daysUntil === 0) {
          todayCount += 1;
          todaySum += r.sub.amount;
        }
      }
      const chMap = /* @__PURE__ */ new Map();
      const catMap = /* @__PURE__ */ new Map();
      for (const r of rows) {
        const ch = chMap.get(r.sub.channel) || { channel: r.sub.channel, label: CHANNEL_LABELS2[r.sub.channel] || r.sub.channel, monthlySum: 0, count: 0 };
        ch.monthlySum = round2(ch.monthlySum + r.monthlyEquiv);
        ch.count += 1;
        chMap.set(r.sub.channel, ch);
        const cat = catMap.get(r.sub.category) || { category: r.sub.category, monthlySum: 0, count: 0 };
        cat.monthlySum = round2(cat.monthlySum + r.monthlyEquiv);
        cat.count += 1;
        catMap.set(r.sub.category, cat);
      }
      const trialRows = rows.filter((r) => r.sub.status === "trial");
      const trialExpiring = trialRows.filter((r) => r.daysUntil != null && r.daysUntil <= (Number(settings && settings.trialWarnDays) || 0)).map((r) => ({ id: r.sub.id, name: r.sub.name, trialEndsAt: r.sub.trialEndsAt, daysUntil: r.daysUntil }));
      return {
        today,
        monthKey,
        currencySymbol: settings && settings.currencySymbol || "\xA5",
        monthlyTotal: round2(monthlyTotal),
        yearlyTotal: round2(monthlyTotal * 12),
        activeCount: rows.length,
        trialCount: trialRows.length,
        cancelledCount,
        monthCharge: { count: monthCount, sum: round2(monthSum) },
        todayCharge: { count: todayCount, sum: round2(todaySum) },
        rows,
        upcoming: rows.filter((r) => r.daysUntil != null && r.daysUntil <= 7).map((r) => ({
          id: r.sub.id,
          name: r.sub.name,
          amount: r.sub.amount,
          cycle: r.sub.cycle,
          date: r.nextChargeDate,
          daysUntil: r.daysUntil,
          urgency: r.urgency,
          isTrial: r.sub.status === "trial",
          trialEndsAt: r.sub.trialEndsAt || void 0
        })),
        trialExpiring,
        byChannel: [...chMap.values()].sort((a, b) => b.monthlySum - a.monthlySum),
        byCategory: [...catMap.values()].sort((a, b) => b.monthlySum - a.monthlySum),
        top: rows.slice().sort((a, b) => b.monthlyEquiv - a.monthlyEquiv).slice(0, 3).map((r) => ({ id: r.sub.id, name: r.sub.name, monthlyEquiv: r.monthlyEquiv }))
      };
    }
    var CANCEL_GUIDES = {
      alipay: "\u652F\u4ED8\u5B9D\uFF1AApp \u2192 \u6211\u7684 \u2192 \u8BBE\u7F6E\uFF08\u53F3\u4E0A\u9F7F\u8F6E\uFF09\u2192 \u652F\u4ED8\u8BBE\u7F6E \u2192 \u514D\u5BC6\u652F\u4ED8/\u81EA\u52A8\u6263\u6B3E \u2192 \u9009\u4E2D\u8BE5\u670D\u52A1 \u2192 \u5173\u95ED\u670D\u52A1\u3002\u5173\u95ED\u540E\u5EFA\u8BAE\u5728\u5BF9\u5E94\u670D\u52A1 App \u5185\u518D\u786E\u8BA4\u8BA2\u9605\u5DF2\u9000\u8BA2\u3002",
      wechat: "\u5FAE\u4FE1\uFF1A\u6211 \u2192 \u670D\u52A1 \u2192 \u94B1\u5305 \u2192 \u652F\u4ED8\u8BBE\u7F6E \u2192 \u81EA\u52A8\u7EED\u8D39\uFF08\u6263\u8D39\u670D\u52A1\uFF09\u2192 \u9009\u4E2D\u8BE5\u670D\u52A1 \u2192 \u5173\u95ED\u6263\u8D39\u3002\u5173\u95ED\u540E\u5EFA\u8BAE\u5728\u5BF9\u5E94\u670D\u52A1 App \u5185\u518D\u786E\u8BA4\u8BA2\u9605\u5DF2\u9000\u8BA2\u3002",
      apple: "Apple\uFF1AiPhone \u8BBE\u7F6E \u2192 \u9876\u90E8\u4F60\u7684\u540D\u5B57 \u2192 \u8BA2\u9605 \u2192 \u9009\u4E2D\u8BE5\u8BA2\u9605 \u2192 \u53D6\u6D88\u8BA2\u9605\u3002\u6CE8\u610F\uFF1A\u53EA\u5728\u670D\u52A1 App \u5185\u9000\u8BA2\u4E0D\u5F7B\u5E95\uFF0C\u5FC5\u987B\u5728 Apple \u8D26\u6237\u7684\u8BA2\u9605\u9875\u53D6\u6D88\u624D\u505C\u6263\u3002",
      card: "\u94F6\u884C\u5361\u4EE3\u6263\uFF1A\u5230\u8BE5\u670D\u52A1\u7684\u5B98\u7F51/App \u7684\u4F1A\u5458\u6216\u8BA2\u9605\u8BBE\u7F6E\u91CC\u5173\u95ED\u81EA\u52A8\u7EED\u8D39\uFF1B\u82E5\u65E0\u6CD5\u53D6\u6D88\uFF0C\u53EF\u8054\u7CFB\u53D1\u5361\u884C\u5173\u95ED\u5BF9\u8BE5\u5546\u6237\u7684\u4EE3\u6263\u6388\u6743\u3002",
      other: "\u5230\u8BE5\u670D\u52A1\u7684\u5B98\u7F51/App \u7684\u4F1A\u5458\u6216\u8BA2\u9605\u8BBE\u7F6E\u91CC\u5173\u95ED\u81EA\u52A8\u7EED\u8D39\uFF1B\u5EFA\u8BAE\u518D\u786E\u8BA4\u652F\u4ED8\u6E20\u9053\uFF08\u652F\u4ED8\u5B9D/\u5FAE\u4FE1/Apple\uFF09\u4FA7\u7684\u6263\u8D39\u534F\u8BAE\u5DF2\u4E00\u5E76\u89E3\u9664\u3002"
    };
    function cancelGuide2(channel) {
      return CANCEL_GUIDES[channel] || CANCEL_GUIDES.other;
    }
    function toCsv2(subs, today) {
      const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      const head = ["name", "amount", "currency", "cycle", "cycleDays", "anchorDate", "nextChargeDate", "monthlyEquivalent", "channel", "category", "status", "trialEndsAt", "note", "createdAt"];
      const lines = [head.map(esc).join(",")];
      for (const s of Array.isArray(subs) ? subs : []) {
        if (!s || typeof s !== "object") continue;
        const next = nextChargeDateOf(s, today);
        lines.push([
          s.name,
          s.amount,
          s.currency,
          s.cycle,
          s.cycleDays == null ? "" : s.cycleDays,
          s.anchorDate,
          next == null ? "" : next,
          monthlyEquivalent2(s),
          CHANNEL_LABELS2[s.channel] || s.channel,
          s.category,
          STATUS_LABELS2[s.status] || s.status,
          s.trialEndsAt == null ? "" : s.trialEndsAt,
          s.note,
          s.createdAt ? new Date(s.createdAt).toISOString() : ""
        ].map(esc).join(","));
      }
      return "\uFEFF" + lines.join("\r\n");
    }
    function fmtSubLine(sub, settings, today) {
      const sym = settings && settings.currencySymbol || "\xA5";
      const next = nextChargeDateOf(sub, today);
      const cyc = sub.cycle === "custom" ? `\u6BCF${sub.cycleDays}\u5929` : CYCLE_LABELS2[sub.cycle] || sub.cycle;
      const bits = [
        `[${sub.id}] ${sub.name}`,
        `${fmtMoney2(sub.amount, sym)}/${cyc}\uFF08\u6708\u5747 ${fmtMoney2(monthlyEquivalent2(sub), sym)}\uFF09`,
        sub.status === "cancelled" ? "\u5DF2\u53D6\u6D88" : next ? `\u4E0B\u671F ${next}\uFF08${diffDays(today, next)} \u5929\u540E\uFF09` : "\u65E0\u4E0B\u671F",
        CHANNEL_LABELS2[sub.channel] || sub.channel,
        sub.category
      ];
      if (sub.status === "trial") bits.push(`\u8BD5\u7528\u81F3 ${sub.trialEndsAt}`);
      if (sub.note) bits.push(sub.note);
      return bits.join(" \xB7 ");
    }
    module.exports = {
      CYCLES: CYCLES2,
      CYCLE_LABELS: CYCLE_LABELS2,
      CHANNELS: CHANNELS2,
      CHANNEL_LABELS: CHANNEL_LABELS2,
      STATUSES,
      STATUS_LABELS: STATUS_LABELS2,
      DEFAULT_CATEGORIES: DEFAULT_CATEGORIES2,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS2,
      K: K3,
      URGENCY_LABELS: URGENCY_LABELS2,
      URGENCY_ORDER,
      todayStr: todayStr2,
      parseYMD,
      fmtYMD,
      daysInMonth,
      diffDays,
      cmpDate,
      nextChargeDateFrom,
      nextChargeDateOf,
      monthlyEquivalent: monthlyEquivalent2,
      urgencyOf,
      round2,
      fmtMoney: fmtMoney2,
      normalizeSub,
      applyPatch,
      genId,
      computeOverview: computeOverview2,
      CANCEL_GUIDES,
      cancelGuide: cancelGuide2,
      toCsv: toCsv2,
      fmtSubLine
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState3 } from "react";

// src/model.ts
var coreRaw = __toESM(require_subs_core());

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
var core = coreRaw;
var K = core.K;
var DEFAULT_SETTINGS = core.DEFAULT_SETTINGS;
var CYCLES = core.CYCLES;
var CYCLE_LABELS = core.CYCLE_LABELS;
var CHANNELS = core.CHANNELS;
var CHANNEL_LABELS = core.CHANNEL_LABELS;
var STATUS_LABELS = core.STATUS_LABELS;
var DEFAULT_CATEGORIES = core.DEFAULT_CATEGORIES;
var URGENCY_LABELS = core.URGENCY_LABELS;
var fmtMoney = (n, symbol) => core.fmtMoney(n, symbol);
var cancelGuide = (ch) => core.cancelGuide(ch);
var monthlyEquivalent = (s) => core.monthlyEquivalent(s);
var todayStr = (nowMs) => core.todayStr(nowMs);
var computeOverview = (subs, settings, today, monthKey) => core.computeOverview(subs, settings, today, monthKey);
var toCsv = (subs, today) => core.toCsv(subs, today);
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
  const s = await kvGet(K.settings).catch(() => null);
  return { ...DEFAULT_SETTINGS, ...s && typeof s === "object" ? s : {} };
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function loadSubs() {
  const keys = await kvKeys();
  const subKeys = keys.filter((k) => k.startsWith(K.subPrefix)).sort();
  const out = [];
  for (const sk of subKeys) {
    const v = await kvGet(sk);
    if (v && typeof v === "object" && typeof v.id === "string" && typeof v.amount === "number") out.push(v);
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}
async function addSub(input) {
  const norm = core.normalizeSub({ ...input, source: "panel" }, Date.now());
  if (norm.error || !norm.sub) return { ok: false, error: norm.error || "\u8BA2\u9605\u4E0D\u5408\u6CD5" };
  await kvSet(K.sub(norm.sub.id), norm.sub);
  return { ok: true, sub: norm.sub };
}
async function updateSub(id, patch) {
  const existing = await kvGet(K.sub(id));
  if (!existing || typeof existing !== "object") return { ok: false, error: `\u8BA2\u9605 ${id} \u4E0D\u5B58\u5728` };
  const merged = core.applyPatch(existing, patch, Date.now());
  if (merged.error || !merged.sub) return { ok: false, error: merged.error || "\u66F4\u65B0\u4E0D\u5408\u6CD5" };
  await kvSet(K.sub(id), merged.sub);
  return { ok: true, sub: merged.sub };
}
async function loadPanelData() {
  const [settings, subs] = await Promise.all([loadSettings(), loadSubs()]);
  const today = todayStr();
  const overview = computeOverview(subs, settings, today, today.slice(0, 7));
  return { settings, subs, today, monthKey: today.slice(0, 7), overview };
}

// src/OverviewTab.tsx
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function emptyForm(today) {
  return { id: null, name: "", amount: "", cycle: "monthly", cycleDays: "", anchorDate: today, channel: "other", category: "\u5176\u4ED6", trialEndsAt: "", note: "" };
}
function formFromSub(s) {
  return {
    id: s.id,
    name: s.name,
    amount: String(s.amount),
    cycle: s.cycle,
    cycleDays: s.cycleDays != null ? String(s.cycleDays) : "",
    anchorDate: s.anchorDate,
    channel: s.channel,
    category: s.category,
    trialEndsAt: s.trialEndsAt || "",
    note: s.note || ""
  };
}
var ALERT_ORDER = { today: 0, trial: 1, soon: 2, week: 3 };
function OverviewTab({ data, reload, showToast }) {
  const [filter, setFilter] = useState("active+trial");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const categories = useMemo(() => {
    const own = new Set(DEFAULT_CATEGORIES);
    if (data) {
      for (const s of data.subs) if (s.category) own.add(s.category);
    }
    return [...own];
  }, [data]);
  if (!data) return /* @__PURE__ */ jsx("div", { className: "cq-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const ov = data.overview;
  const sym = data.settings.currencySymbol;
  const alerts = ov.rows.filter((r) => r.urgency && r.urgency !== "calm").sort((a, b) => (ALERT_ORDER[a.urgency] ?? 9) - (ALERT_ORDER[b.urgency] ?? 9));
  const cancelledRows = data.subs.filter((s) => s.status === "cancelled").map((s) => ({ sub: s, monthlyEquiv: monthlyEquivalent(s), nextChargeDate: null, daysUntil: null, urgency: null }));
  const rows = filter === "cancelled" ? cancelledRows : ov.rows.filter((r) => {
    if (filter === "trial") return r.sub.status === "trial";
    return r.sub.status === "active" || r.sub.status === "trial";
  });
  const submitForm = async () => {
    if (!form || busy) return;
    const amount = Number(form.amount);
    if (!form.name.trim()) {
      showToast("\u8BF7\u586B\u5199\u8BA2\u9605\u540D\u79F0", "bad");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("\u91D1\u989D\u9700\u4E3A\u6B63\u6570", "bad");
      return;
    }
    if (form.cycle === "custom" && !(Number(form.cycleDays) >= 1)) {
      showToast("\u81EA\u5B9A\u4E49\u5468\u671F\u9700\u586B\u5929\u6570\uFF08\u22651\uFF09", "bad");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount,
        cycle: form.cycle,
        cycleDays: form.cycle === "custom" ? Math.floor(Number(form.cycleDays)) : void 0,
        anchorDate: form.anchorDate,
        channel: form.channel,
        category: form.category,
        trialEndsAt: form.trialEndsAt || void 0,
        note: form.note.trim() || void 0
      };
      if (form.id) {
        const r = await updateSub(form.id, payload);
        if (!r.ok) throw new Error(r.error || "\u66F4\u65B0\u5931\u8D25");
        showToast("\u5DF2\u4FDD\u5B58\u4FEE\u6539", "good");
      } else {
        const r = await addSub(payload);
        if (!r.ok) throw new Error(r.error || "\u5165\u518C\u5931\u8D25");
        showToast(`\u5DF2\u5165\u518C\u300C${payload.name}\u300D`, "good");
      }
      setForm(null);
      await reload();
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const doAction = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await reload();
      showToast(okMsg, "good");
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const kpi = (label, value, sub) => /* @__PURE__ */ jsxs("div", { className: "cq-kpi", children: [
    /* @__PURE__ */ jsx("small", { children: label }),
    /* @__PURE__ */ jsx("b", { children: value }),
    /* @__PURE__ */ jsx("em", { children: sub })
  ] }, label);
  const alertLine = (r) => {
    const isTrial = r.sub.status === "trial";
    const cls = r.urgency === "today" ? "today" : r.urgency === "trial" ? "trial" : r.urgency === "soon" ? "soon" : "week";
    const dayText = r.daysUntil === 0 ? "\u4ECA\u5929" : r.daysUntil != null && r.daysUntil > 0 ? `${r.daysUntil} \u5929\u540E` : "";
    const text = isTrial ? `${r.sub.name} \u8BD5\u7528\u671F\u5C06\u8F6C\u6B63` : r.urgency === "today" ? `${r.sub.name} \u4ECA\u5929\u6263\u8D39` : `${r.sub.name} \u5373\u5C06\u6263\u8D39`;
    return /* @__PURE__ */ jsxs("div", { className: `cq-alert ${cls}`, children: [
      /* @__PURE__ */ jsx("b", { children: text }),
      /* @__PURE__ */ jsx("small", { children: isTrial ? `${r.nextChargeDate} \u8F6C\u6B63\u6263 ${fmtMoney(r.sub.amount, sym)}` : `${r.nextChargeDate} \xB7 ${fmtMoney(r.sub.amount, sym)}${dayText ? ` \xB7 ${dayText}` : ""}` })
    ] }, r.sub.id);
  };
  const card = (r) => {
    const s = r.sub;
    const isTrial = s.status === "trial";
    const isCancelled = s.status === "cancelled";
    const cyc = s.cycle === "custom" ? `\u6BCF${s.cycleDays}\u5929` : CYCLE_LABELS[s.cycle] || s.cycle;
    const nextText = isCancelled ? "\u5DF2\u53D6\u6D88 \xB7 \u4E0D\u518D\u63D0\u9192" : r.nextChargeDate ? `${r.urgency === "today" ? "\u4ECA\u5929\u6263\u8D39" : r.nextChargeDate}\uFF08${r.daysUntil === 0 ? "\u4ECA\u5929" : `${r.daysUntil} \u5929\u540E`}\uFF09` : "\u65E0\u4E0B\u671F";
    return /* @__PURE__ */ jsxs("div", { className: `cq-item ${r.urgency === "today" ? "urgent" : ""}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "cq-item-head", children: [
        /* @__PURE__ */ jsx("b", { children: s.name }),
        isTrial && /* @__PURE__ */ jsx("span", { className: "cq-badge trialb", children: "\u8BD5\u7528" }),
        isCancelled && /* @__PURE__ */ jsx("span", { className: "cq-badge doneb", children: "\u5DF2\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("span", { className: "cq-badge", children: CHANNEL_LABELS[s.channel] || s.channel }),
        /* @__PURE__ */ jsx("span", { className: "cq-badge", children: s.category })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "cq-item-mid", children: [
        /* @__PURE__ */ jsx("span", { className: `cq-next ${r.urgency === "today" || r.urgency === "trial" ? "hot" : ""}`, children: nextText }),
        /* @__PURE__ */ jsxs("span", { className: "cq-amt", children: [
          /* @__PURE__ */ jsx("b", { children: fmtMoney(s.amount, sym) }),
          /* @__PURE__ */ jsxs("small", { children: [
            "/",
            cyc,
            " \xB7 \u6708\u5747 ",
            fmtMoney(monthlyEquivalent(s), sym)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "cq-item-foot", children: [
        /* @__PURE__ */ jsx("span", { className: "note", children: s.note || (isTrial ? `\u8BD5\u7528\u671F\u81F3 ${s.trialEndsAt}` : "") }),
        !isCancelled && s.status === "active" && /* @__PURE__ */ jsx("button", { className: "cq-btn sm ghost", disabled: busy, onClick: () => doAction(
          () => updateSub(s.id, { lastConfirmedDate: data.today }),
          `\u5DF2\u786E\u8BA4\u300C${s.name}\u300D\u672C\u671F\u5DF2\u6263\uFF0C\u4E0B\u671F\u987A\u5EF6`
        ), children: "\u5DF2\u6263" }),
        !isCancelled && /* @__PURE__ */ jsx("button", { className: "cq-btn sm ghost", disabled: busy, onClick: () => {
          const guide = confirmCancel(s.name);
          if (guide) doAction(() => updateSub(s.id, { status: "cancelled" }), `\u5DF2\u53D6\u6D88\u300C${s.name}\u300D\uFF0C\u53EF\u5728\u5DF2\u53D6\u6D88\u5217\u8868\u6062\u590D`);
        }, children: "\u53D6\u6D88" }),
        isCancelled && /* @__PURE__ */ jsx("button", { className: "cq-btn sm ghost", disabled: busy, onClick: () => doAction(
          () => updateSub(s.id, { status: "active" }),
          `\u5DF2\u6062\u590D\u300C${s.name}\u300D`
        ), children: "\u6062\u590D" }),
        /* @__PURE__ */ jsx("button", { className: "cq-btn sm ghost", disabled: busy, onClick: () => setForm(formFromSub(s)), children: "\u7F16\u8F91" }),
        isCancelled && /* @__PURE__ */ jsx(DeleteBtn, { busy, name: s.name, onDelete: () => doAction(
          async () => {
            await kvDel(K.sub(s.id));
          },
          `\u5DF2\u5F7B\u5E95\u5220\u9664\u300C${s.name}\u300D`
        ) })
      ] })
    ] }, s.id);
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "cq-kpis", children: [
      kpi("\u6708\u5747\u652F\u51FA", fmtMoney(ov.monthlyTotal, sym), `\u5E74\u5316 ${fmtMoney(ov.yearlyTotal, sym)}`),
      kpi("\u672C\u6708\u5C06\u6263", `${ov.monthCharge.count} \u7B14`, fmtMoney(ov.monthCharge.sum, sym)),
      kpi("\u8BD5\u7528\u671F", `${ov.trialCount} \u7B14`, ov.trialExpiring.length ? `${ov.trialExpiring.length} \u7B14\u4E34\u8FD1\u8F6C\u6B63` : "\u65E0\u4E34\u8FD1\u8F6C\u6B63")
    ] }),
    alerts.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "cq-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "cq-bar" }),
        "\u63D0\u9192",
        /* @__PURE__ */ jsxs("span", { className: "cq-hint", children: [
          "\u8DDD\u4E0B\u6B21\u6263\u8D39 ",
          data.settings.remindDays,
          " \u5929\u5185"
        ] })
      ] }),
      alerts.map(alertLine)
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cq-chiprow", children: [
      /* @__PURE__ */ jsxs("button", { className: `cq-chip ${filter === "active+trial" ? "on" : ""}`, onClick: () => setFilter("active+trial"), children: [
        "\u8FDB\u884C\u4E2D ",
        ov.rows.filter((r) => r.sub.status !== "cancelled").length
      ] }),
      /* @__PURE__ */ jsxs("button", { className: `cq-chip ${filter === "trial" ? "on" : ""}`, onClick: () => setFilter("trial"), children: [
        "\u8BD5\u7528 ",
        ov.trialCount
      ] }),
      /* @__PURE__ */ jsxs("button", { className: `cq-chip ${filter === "cancelled" ? "on" : ""}`, onClick: () => setFilter("cancelled"), children: [
        "\u5DF2\u53D6\u6D88 ",
        ov.cancelledCount
      ] }),
      /* @__PURE__ */ jsx("button", { className: "cq-btn sm", style: { marginLeft: "auto" }, onClick: () => setForm(emptyForm(data.today)), children: "\uFF0B \u5165\u518C\u8BA2\u9605" })
    ] }),
    form && /* @__PURE__ */ jsx("div", { className: "cq-card", children: /* @__PURE__ */ jsxs("div", { className: "cq-card-b", children: [
      /* @__PURE__ */ jsx("b", { style: { fontSize: 12.5 }, children: form.id ? "\u7F16\u8F91\u8BA2\u9605" : "\u5165\u518C\u8BA2\u9605" }),
      /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx("input", { className: "cq-inp", value: form.name, placeholder: "\u5982\uFF1A\u7F51\u6613\u4E91\u97F3\u4E50\u9ED1\u80F6VIP", onChange: (e) => setForm({ ...form, name: e.target.value }) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u6BCF\u671F\u91D1\u989D" }),
          /* @__PURE__ */ jsx("input", { className: "cq-inp", type: "number", min: "0", step: "0.01", value: form.amount, placeholder: "15", onChange: (e) => setForm({ ...form, amount: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u5468\u671F" }),
          /* @__PURE__ */ jsx("select", { className: "cq-sel", style: { width: "100%" }, value: form.cycle, onChange: (e) => setForm({ ...form, cycle: e.target.value }), children: CYCLES.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: CYCLE_LABELS[c] || c }, c)) })
        ] }),
        form.cycle === "custom" && /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u5929\u6570" }),
          /* @__PURE__ */ jsx("input", { className: "cq-inp", type: "number", min: "1", value: form.cycleDays, onChange: (e) => setForm({ ...form, cycleDays: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u4E0B\u6B21\u6263\u8D39\u65E5 / \u4E0A\u6B21\u6263\u8D39\u65E5" }),
          /* @__PURE__ */ jsx("input", { className: "cq-inp", type: "date", value: form.anchorDate, onChange: (e) => setForm({ ...form, anchorDate: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u6263\u8D39\u6E20\u9053" }),
          /* @__PURE__ */ jsx("select", { className: "cq-sel", style: { width: "100%" }, value: form.channel, onChange: (e) => setForm({ ...form, channel: e.target.value }), children: CHANNELS.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: CHANNEL_LABELS[c] || c }, c)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u5206\u7C7B" }),
          /* @__PURE__ */ jsx("select", { className: "cq-sel", style: { width: "100%" }, value: form.category, onChange: (e) => setForm({ ...form, category: e.target.value }), children: categories.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u8BD5\u7528\u671F\u622A\u6B62\uFF08\u7559\u7A7A=\u975E\u8BD5\u7528\uFF09" }),
          /* @__PURE__ */ jsx("input", { className: "cq-inp", type: "date", value: form.trialEndsAt, onChange: (e) => setForm({ ...form, trialEndsAt: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("label", { className: "cq-lbl", children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx("input", { className: "cq-inp", value: form.note, placeholder: "\u53EF\u9009", onChange: (e) => setForm({ ...form, note: e.target.value }) }),
      /* @__PURE__ */ jsxs("div", { className: "cq-form-actions", children: [
        /* @__PURE__ */ jsx("button", { className: "cq-btn", disabled: busy, onClick: submitForm, children: form.id ? "\u4FDD\u5B58" : "\u5165\u518C" }),
        /* @__PURE__ */ jsx("button", { className: "cq-btn ghost", disabled: busy, onClick: () => setForm(null), children: "\u53D6\u6D88" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "cq-bar" }),
      "\u53F0\u8D26",
      /* @__PURE__ */ jsxs("span", { className: "cq-hint", children: [
        "\u5171 ",
        rows.length,
        " \u7B14"
      ] })
    ] }),
    rows.length === 0 && /* @__PURE__ */ jsx("div", { className: "cq-empty", children: filter === "cancelled" ? "\u6CA1\u6709\u5DF2\u53D6\u6D88\u7684\u8BA2\u9605\u3002" : "\u53F0\u8D26\u8FD8\u662F\u7A7A\u7684\u2014\u2014\u70B9\u53F3\u4E0A\u300C\uFF0B \u5165\u518C\u8BA2\u9605\u300D\uFF0C\n\u6216\u5728\u804A\u5929\u91CC\u76F4\u63A5\u8BF4\u300C\u5E2E\u6211\u628A\u7F51\u6613\u4E91\u4F1A\u5458\u8BB0\u5165\u8BA2\u9605\u300D\u3002" }),
    rows.map(card)
  ] });
}
function confirmCancel(name) {
  return window.confirm(`\u786E\u8BA4\u53D6\u6D88\u300C${name}\u300D\uFF1F
\u53D6\u6D88\u540E\u4E0D\u518D\u63D0\u9192\uFF08\u53F0\u8D26\u7559\u6863\u53EF\u6062\u590D\uFF09\u3002
\u8BB0\u5F97\u6309\u5F15\u5BFC\u5230\u652F\u4ED8\u6E20\u9053\u5173\u95ED\u81EA\u52A8\u7EED\u8D39\uFF0C\u5426\u5219\u4ECD\u4F1A\u88AB\u6263\u6B3E\u3002`);
}
function DeleteBtn({ busy, name, onDelete }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return /* @__PURE__ */ jsx("button", { className: "cq-btn sm danger", disabled: busy, onClick: () => setArmed(true), children: "\u5220" });
  }
  return /* @__PURE__ */ jsxs("span", { className: "cq-confirm-inline", children: [
    /* @__PURE__ */ jsx("button", { className: "cq-btn sm danger", disabled: busy, onClick: async () => {
      setArmed(false);
      await onDelete();
    }, children: "\u786E\u8BA4\u5220" }),
    /* @__PURE__ */ jsx("button", { className: "cq-btn sm ghost", disabled: busy, onClick: () => setArmed(false), children: "\u5426" })
  ] });
}

// src/StatsTab.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function StatsTab({ data }) {
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "cq-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const ov = data.overview;
  const sym = data.settings.currencySymbol;
  const maxChannel = Math.max(1, ...ov.byChannel.map((c) => c.monthlySum));
  const maxCategory = Math.max(1, ...ov.byCategory.map((c) => c.monthlySum));
  if (!ov.rows.length) {
    return /* @__PURE__ */ jsx2("div", { className: "cq-empty", children: "\u8FD8\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u8BA2\u9605\u2014\u2014\u5148\u5728\u300C\u603B\u89C8\u300D\u5165\u518C\u3002" });
  }
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "cq-bar" }),
      "\u603B\u89C8",
      /* @__PURE__ */ jsx2("span", { className: "cq-hint", children: "\u6708\u5747\u53E3\u5F84" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cq-card", children: /* @__PURE__ */ jsxs2("div", { className: "cq-card-b", style: { display: "flex", gap: 14 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("small", { className: "cq-sub", children: "\u6708\u5747\u652F\u51FA" }),
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 21, fontVariantNumeric: "tabular-nums" }, children: fmtMoney(ov.monthlyTotal, sym) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("small", { className: "cq-sub", children: "\u5E74\u5316\u652F\u51FA" }),
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 21, fontVariantNumeric: "tabular-nums", color: "#8FB8F2" }, children: fmtMoney(ov.yearlyTotal, sym) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "cq-bar" }),
      "\u6309\u6E20\u9053",
      /* @__PURE__ */ jsxs2("span", { className: "cq-hint", children: [
        "\u6708\u5747 ",
        ov.byChannel.length,
        " \u6E20\u9053"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cq-card", children: /* @__PURE__ */ jsx2("div", { className: "cq-card-b", children: /* @__PURE__ */ jsx2("div", { className: "cq-bars", children: ov.byChannel.map((c) => /* @__PURE__ */ jsxs2("div", { className: "cq-bar-row", children: [
      /* @__PURE__ */ jsx2("span", { className: "nm", children: c.label }),
      /* @__PURE__ */ jsx2("span", { className: "tr", children: /* @__PURE__ */ jsx2("i", { style: { width: `${Math.max(4, Math.round(c.monthlySum / maxChannel * 100))}%` } }) }),
      /* @__PURE__ */ jsxs2("span", { className: "vl", children: [
        fmtMoney(c.monthlySum, sym),
        " \xD7",
        c.count
      ] })
    ] }, c.channel)) }) }) }),
    /* @__PURE__ */ jsxs2("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "cq-bar" }),
      "\u6309\u5206\u7C7B",
      /* @__PURE__ */ jsxs2("span", { className: "cq-hint", children: [
        "\u6708\u5747 ",
        ov.byCategory.length,
        " \u7C7B"
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cq-card", children: /* @__PURE__ */ jsx2("div", { className: "cq-card-b", children: /* @__PURE__ */ jsx2("div", { className: "cq-bars", children: ov.byCategory.map((c) => /* @__PURE__ */ jsxs2("div", { className: "cq-bar-row", children: [
      /* @__PURE__ */ jsx2("span", { className: "nm", children: c.category }),
      /* @__PURE__ */ jsx2("span", { className: "tr", children: /* @__PURE__ */ jsx2("i", { className: "mut", style: { width: `${Math.max(4, Math.round(c.monthlySum / maxCategory * 100))}%` } }) }),
      /* @__PURE__ */ jsxs2("span", { className: "vl", children: [
        fmtMoney(c.monthlySum, sym),
        " \xD7",
        c.count
      ] })
    ] }, c.category)) }) }) }),
    /* @__PURE__ */ jsxs2("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "cq-bar" }),
      "\u6700\u5927\u4E09\u7B14",
      /* @__PURE__ */ jsx2("span", { className: "cq-hint", children: "\u6708\u5747" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cq-card", children: /* @__PURE__ */ jsx2("div", { className: "cq-card-b", children: ov.top.map((t, i) => /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0" }, children: [
      /* @__PURE__ */ jsx2("b", { style: { color: i === 0 ? "#FF8A9A" : "#E6EAF2", width: 18 }, children: i + 1 }),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: t.name }),
      /* @__PURE__ */ jsx2("b", { style: { fontVariantNumeric: "tabular-nums" }, children: fmtMoney(t.monthlyEquiv, sym) })
    ] }, t.id)) }) }),
    ov.rows.some((r) => r.sub.status === "trial") && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "cq-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "cq-bar" }),
        "\u8BD5\u7528\u671F\u5360\u7528",
        /* @__PURE__ */ jsx2("span", { className: "cq-hint", children: "\u8F6C\u6B63\u540E\u8BA1\u5165\u6708\u5747" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "cq-card", children: /* @__PURE__ */ jsxs2("div", { className: "cq-card-b", children: [
        ov.rows.filter((r) => r.sub.status === "trial").map((r) => /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0" }, children: [
          /* @__PURE__ */ jsxs2("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
            r.sub.name,
            /* @__PURE__ */ jsxs2("small", { className: "cq-sub", children: [
              " \xB7 \u8BD5\u7528\u81F3 ",
              r.sub.trialEndsAt,
              "\uFF08",
              CYCLE_LABELS[r.sub.cycle],
              " ",
              fmtMoney(r.sub.amount, sym),
              "\uFF09"
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("b", { style: { fontVariantNumeric: "tabular-nums", color: "#C9A8FF" }, children: [
            fmtMoney(monthlyEquivalent(r.sub), sym),
            "/\u6708"
          ] })
        ] }, r.sub.id)),
        /* @__PURE__ */ jsx2("small", { className: "cq-sub", style: { display: "block", marginTop: 6 }, children: "\u4E0A\u65B9\u6708\u5747\u603B\u989D\u5DF2\u542B\u8BD5\u7528\u671F\u91D1\u989D\uFF1B\u8F6C\u6B63\u540E\u5982\u53D6\u6D88\uFF0C\u8BF7\u53CA\u65F6\u5728\u603B\u89C8\u5904\u7406\u3002" })
      ] }) })
    ] })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState2 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [draft, setDraft] = useState2(null);
  const [clearArmed, setClearArmed] = useState2(false);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "cq-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = { ...data.settings, ...draft || {} };
  const persist = async (next, msg) => {
    await saveSettings(next);
    setDraft(null);
    await reload();
    showToast(msg, "good");
  };
  const commitNum = (raw, min, max, fallback) => {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const exportCsv = async () => {
    try {
      const csv = toCsv(data.subs, data.today);
      await navigator.clipboard.writeText(csv);
      showToast(`\u5DF2\u590D\u5236 ${data.subs.length} \u6761\u8BA2\u9605 CSV\uFF08\u53EF\u76F4\u63A5\u7C98\u8D34\u8FDB Excel\uFF09`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const exportJson = async () => {
    try {
      const dump = { exportedAt: Date.now(), settings: data.settings, subs: data.subs };
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      showToast(`\u5DF2\u590D\u5236 ${data.subs.length} \u6761\u8BA2\u9605 JSON`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const clearAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("changqi."));
      for (const k of keys) {
        await kvDel(k);
      }
      await reload();
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u8BA2\u9605\u53F0\u8D26\u6570\u636E");
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const count = data.subs.length;
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "cq-bar" }),
      "\u63D0\u9192"
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "cq-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "cq-field", children: [
        /* @__PURE__ */ jsxs3("span", { className: "cq-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u7EED\u8D39\u63D0\u524D\u63D0\u9192\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx3("small", { children: "\u8DDD\u4E0B\u6B21\u6263\u8D39 N \u5929\u5185\u4EAE\u6A59\u6761\uFF1B\u6263\u8D39\u5F53\u5929\u6052\u4EAE\u7EA2\u6761" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "cq-num",
            type: "number",
            min: "0",
            max: "14",
            value: s.remindDays,
            onChange: (e) => setDraft({ ...draft, remindDays: commitNum(e.target.value, 0, 14, data.settings.remindDays) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "cq-field", children: [
        /* @__PURE__ */ jsxs3("span", { className: "cq-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u8BD5\u7528\u8F6C\u6B63\u9884\u8B66\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx3("small", { children: "\u8BD5\u7528\u671F\u622A\u6B62\u524D N \u5929\u4EAE\u7D2B\u6761\u2014\u2014\u8F6C\u6B63\u5373\u6263\u8D39" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "cq-num",
            type: "number",
            min: "0",
            max: "14",
            value: s.trialWarnDays,
            onChange: (e) => setDraft({ ...draft, trialWarnDays: commitNum(e.target.value, 0, 14, data.settings.trialWarnDays) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "cq-field", children: [
        /* @__PURE__ */ jsxs3("span", { className: "cq-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u8D27\u5E01\u7B26\u53F7" }),
          /* @__PURE__ */ jsx3("small", { children: "\u4EC5\u5C55\u793A\u7528\uFF08\u5982 \xA5 / $ / \u20AC\uFF09\uFF0C\u4E0D\u505A\u6C47\u7387\u6362\u7B97" })
        ] }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "cq-num",
            maxLength: 3,
            value: s.currencySymbol,
            onChange: (e) => setDraft({ ...draft, currencySymbol: e.target.value || "\xA5" })
          }
        )
      ] }),
      draft && /* @__PURE__ */ jsxs3("div", { className: "cq-field", children: [
        /* @__PURE__ */ jsx3("span", { className: "cq-field-l" }),
        /* @__PURE__ */ jsx3("button", { className: "cq-btn sm", onClick: () => persist(s, "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08AI \u67E5\u8BE2\u540C\u53E3\u5F84\u751F\u6548\uFF09"), children: "\u4FDD\u5B58\u8BBE\u7F6E" }),
        /* @__PURE__ */ jsx3("button", { className: "cq-btn sm ghost", onClick: () => setDraft(null), children: "\u8FD8\u539F" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "cq-bar" }),
      "\u5BFC\u51FA",
      /* @__PURE__ */ jsx3("span", { className: "cq-hint", children: "\u590D\u5236\u5230\u526A\u8D34\u677F" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cq-card", children: /* @__PURE__ */ jsxs3("div", { className: "cq-card-b", style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsxs3("button", { className: "cq-btn sm ghost", onClick: exportCsv, children: [
        "\u590D\u5236 CSV\uFF08",
        count,
        " \u6761\uFF09"
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "cq-btn sm ghost", onClick: exportJson, children: "\u590D\u5236 JSON" })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "cq-bar" }),
      "\u6E20\u9053\u53D6\u6D88\u8DEF\u5F84",
      /* @__PURE__ */ jsx3("span", { className: "cq-hint", children: "App \u5185\u53D6\u6D88\u5F80\u5F80\u4E0D\u5F7B\u5E95" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cq-card", children: CHANNELS.map((ch) => /* @__PURE__ */ jsxs3("div", { className: "cq-guideblock", children: [
      /* @__PURE__ */ jsx3("b", { children: CHANNEL_LABELS[ch] || ch }),
      cancelGuide(ch)
    ] }, ch)) }),
    /* @__PURE__ */ jsxs3("div", { className: "cq-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "cq-bar" }),
      "\u6570\u636E",
      /* @__PURE__ */ jsx3("span", { className: "cq-hint", children: "\u7EAF\u672C\u5730 cap.kv \xB7 \u4E0D\u51FA\u8BBE\u5907" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cq-card", children: /* @__PURE__ */ jsxs3("div", { className: "cq-card-b", children: [
      clearArmed ? /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs3("button", { className: "cq-btn sm danger", onClick: async () => {
          if (window.confirm("\u518D\u6B21\u786E\u8BA4\uFF1A\u6E05\u7A7A\u8BA2\u9605\u53F0\u8D26\u5168\u90E8\u6570\u636E\uFF1F\u4E0D\u53EF\u6062\u590D\u3002")) {
            setClearArmed(false);
            await clearAll();
          } else setClearArmed(false);
        }, children: [
          "\u786E\u8BA4\u6E05\u7A7A\uFF08",
          count,
          " \u6761\u8BA2\u9605\uFF09"
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "cq-btn sm ghost", onClick: () => setClearArmed(false), children: "\u7B97\u4E86" })
      ] }) : /* @__PURE__ */ jsx3("button", { className: "cq-btn sm danger", onClick: () => setClearArmed(true), children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" }),
      /* @__PURE__ */ jsx3("small", { className: "cq-sub", style: { display: "block", marginTop: 6 }, children: "\u53F0\u8D26\u3001\u8BBE\u7F6E\u4E00\u5E76\u5220\u9664\uFF0C\u4E0D\u53EF\u6062\u590D\uFF1B\u5EFA\u8BAE\u5148\u590D\u5236 CSV \u5907\u4EFD\u3002\u684C\u9762\u4E0E\u624B\u673A\u770B\u5230\u7684\u662F\u540C\u4E00\u4EFD\u6570\u636E\uFF08cap.kv\uFF09\u3002" })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css = `
.cq-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cq-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cq-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cq-body::-webkit-scrollbar{width:9px;height:9px}
.cq-body::-webkit-scrollbar-track{background:transparent}
.cq-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cq-page{max-width:560px;margin:0 auto}
.cq-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cq-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3D7EE8,#2B5FC7);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.cq-tt{flex:1;min-width:0}
.cq-tt b{font-size:15px;display:block}
.cq-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px;font-variant-numeric:tabular-nums}
.cq-tabs{display:flex;gap:4px}
.cq-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.cq-tab:hover{color:#E6EAF2}
.cq-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cq-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.cq-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3D7EE8,#2B5FC7);flex-shrink:0}
.cq-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.cq-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.cq-card-b{padding:11px 13px}
.cq-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.cq-btn{background:#2B5FC7;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.cq-btn:hover{filter:brightness(1.1)}
.cq-btn:disabled{opacity:.45;cursor:not-allowed}
.cq-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.cq-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.cq-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.cq-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.cq-inp:focus{outline:none;border-color:#2B5FC7}
.cq-inp::placeholder{color:#4d5566}
.cq-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.cq-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.cq-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.cq-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.cq-toast.bad{border-color:#54262c;color:#FF8A9A}
.cq-toast.good{border-color:#2b4a35;color:#7EE2A0}
.cq-kpis{display:flex;gap:8px;margin:0 16px 10px}
.cq-kpi{flex:1;background:#161B22;border:1px solid #242C3A;border-radius:11px;padding:9px 11px;min-width:0}
.cq-kpi small{display:block;color:#8B95A7;font-size:10px;margin-bottom:2px}
.cq-kpi b{font-size:15px;font-variant-numeric:tabular-nums;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-kpi em{font-style:normal;font-size:9.5px;color:#5C6678;display:block;margin-top:1px}
.cq-alert{display:flex;align-items:center;gap:8px;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:12px;border:1px solid}
.cq-alert b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-alert small{color:#8B95A7;flex-shrink:0}
.cq-alert.today{background:rgba(248,81,73,.08);border-color:#54262c}
.cq-alert.today b{color:#FF8A9A}
.cq-alert.trial{background:rgba(163,113,247,.08);border-color:#4c3a6e}
.cq-alert.trial b{color:#C9A8FF}
.cq-alert.soon{background:rgba(232,145,45,.08);border-color:#5a3d1a}
.cq-alert.soon b{color:#F2B263}
.cq-alert.week{background:rgba(210,153,34,.06);border-color:#4a3d1e}
.cq-alert.week b{color:#D9B96A}
.cq-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.cq-chip:hover{border-color:#3a4356}
.cq-chip.on{background:#16283e;border-color:#2B5FC7;color:#8FB8F2;font-weight:600}
.cq-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.cq-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.cq-item.urgent{border-color:#54262c}
.cq-item-head{display:flex;align-items:center;gap:8px}
.cq-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.cq-badge.trialb{color:#C9A8FF;border-color:#4c3a6e;background:rgba(163,113,247,.08)}
.cq-badge.doneb{color:#F85149;border-color:#54262c;background:#3a1d22}
.cq-item-mid{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.cq-next{font-size:11.5px;color:#8B95A7;flex:1;min-width:0}
.cq-next.hot{color:#FF8A9A;font-weight:600}
.cq-amt{text-align:right;flex-shrink:0}
.cq-amt b{font-size:13.5px;font-variant-numeric:tabular-nums}
.cq-amt small{display:block;color:#5C6678;font-size:9.5px;font-variant-numeric:tabular-nums}
.cq-item-foot{display:flex;gap:6px;margin-top:8px;align-items:center}
.cq-item-foot .note{flex:1;min-width:0;color:#5C6678;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-form-actions{display:flex;gap:8px;margin-top:12px}
.cq-guide{margin-top:8px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;padding:8px 10px;font-size:10.5px;color:#A8B3C7;line-height:1.7}
.cq-bars{display:flex;flex-direction:column;gap:7px;padding:4px 2px}
.cq-bar-row{display:flex;align-items:center;gap:8px}
.cq-bar-row .nm{width:74px;font-size:11px;color:#A8B3C7;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-bar-row .tr{flex:1;height:14px;background:#12151c;border-radius:4px;overflow:hidden}
.cq-bar-row .tr i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3D7EE8,#2B5FC7)}
.cq-bar-row .tr i.mut{background:linear-gradient(90deg,#5A6478,#414A5C)}
.cq-bar-row .vl{width:86px;font-size:10.5px;color:#8B95A7;font-variant-numeric:tabular-nums;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.cq-field:first-child{border-top:none}
.cq-field-l{flex:1;min-width:0}
.cq-field-l b{font-size:12.5px;display:block}
.cq-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.cq-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.cq-guideblock{padding:9px 13px;border-top:1px solid #1d2330;font-size:10.5px;color:#A8B3C7;line-height:1.7}
.cq-guideblock b{color:#E6EAF2;font-size:11.5px;display:block;margin-bottom:2px}
.cq-confirm-inline{display:flex;gap:6px;align-items:center}
`;
function ChangqiPanel(_props) {
  const [tab, setTab] = useState3("overview");
  const [data, setData] = useState3(null);
  const [loadErr, setLoadErr] = useState3("");
  const [toast, setToast] = useState3(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadPanelData();
      setData(d);
      setLoadErr("");
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
  const headInfo = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const ov = data.overview;
    return {
      cls: ov.todayCharge.count > 0 ? "cq-hot" : "",
      text: `\u6708\u5747 ${fmtMoney(ov.monthlyTotal, data.settings.currencySymbol)} \xB7 \u8FDB\u884C\u4E2D ${ov.activeCount} \u7B14`
    };
  })();
  return /* @__PURE__ */ jsxs4("div", { className: "cq-root", children: [
    /* @__PURE__ */ jsx4("style", { children: css }),
    /* @__PURE__ */ jsxs4("div", { className: "cq-top", children: [
      /* @__PURE__ */ jsx4("div", { className: "cq-logo", children: "\u{1F5D3}\uFE0F" }),
      /* @__PURE__ */ jsxs4("div", { className: "cq-tt", children: [
        /* @__PURE__ */ jsx4("b", { children: "\u8BA2\u9605\u53F0\u8D26" }),
        /* @__PURE__ */ jsx4("small", { children: headInfo.text })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "cq-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["stats", "\u7EDF\u8BA1"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: `cq-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "cq-body", children: /* @__PURE__ */ jsxs4("div", { className: "cq-page", children: [
      loadErr && /* @__PURE__ */ jsxs4("div", { className: "cq-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx4(OverviewTab, { data, reload, showToast }),
      tab === "stats" && /* @__PURE__ */ jsx4(StatsTab, { data }),
      tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx4("div", { className: `cq-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function ChangqiEntry(props) {
  return /* @__PURE__ */ jsx5(ChangqiPanel, { ...props });
}
export {
  ChangqiEntry as default
};
