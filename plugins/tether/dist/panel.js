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

// shared/tether-core.js
var require_tether_core = __commonJS({
  "shared/tether-core.js"(exports, module) {
    "use strict";
    var K3 = {
      settings: "tether.settings",
      people: "tether.people",
      promises: "tether.promises",
      journal: "tether.journal"
    };
    var RELATIONS3 = ["\u5BB6\u4EBA", "\u4F34\u4FA3", "\u670B\u53CB", "\u540C\u4E8B", "\u5BA2\u6237", "\u5BFC\u5E08", "\u540C\u5B66", "\u5176\u4ED6"];
    var CHANNELS3 = ["\u89C1\u9762", "\u7535\u8BDD", "\u5FAE\u4FE1", "\u89C6\u9891", "\u90AE\u4EF6", "\u5176\u4ED6"];
    var EVENT_TYPES2 = ["contact", "note", "favor"];
    var FAVOR_DIRECTIONS2 = ["gave", "got"];
    var PROMISE_DIRECTIONS3 = ["iowe", "owedme"];
    var PROMISE_STATUS = ["open", "done", "cancelled"];
    var ARCHIVED_FILTERS = ["no", "only", "include"];
    var MAX_PEOPLE3 = 500;
    var MAX_EVENTS = 2e3;
    var MAX_OPEN_PROMISES = 200;
    var MAX_CLOSED_PROMISES = 500;
    var DEFAULT_SETTINGS3 = {
      v: 1,
      defaultCadenceDays: 30,
      // 未单独设置节奏的人按此频率提醒联系
      driftGraceDays: 14,
      // 超出节奏多少天进红榜（之前是黄榜）
      birthdayDays: 14,
      // 生日预告窗口
      dueWarnDays: 3
      // 承诺临期窗口
    };
    var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    var DAY_MS2 = 24 * 3600 * 1e3;
    var pad2 = (n) => String(n).padStart(2, "0");
    function dayKeyOf3(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function midnightOf(ts) {
      const d = new Date(ts);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    function resolveDateInput2(input, now) {
      const n = typeof now === "number" ? now : Date.now();
      if (input == null || input === "" || input === "today" || input === "\u4ECA\u5929") return n;
      if (input === "yesterday" || input === "\u6628\u5929") return n - DAY_MS2;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input).trim());
      if (!m) return null;
      const d = new Date(n);
      const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), d.getHours(), d.getMinutes(), d.getSeconds());
      if (Number.isNaN(target.getTime()) || target.getMonth() !== Number(m[2]) - 1) return null;
      return target.getTime();
    }
    function parseBirthday(s) {
      const str = String(s || "").trim();
      let year = null;
      let mmdd = null;
      const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      if (full) {
        year = Number(full[1]);
        mmdd = `${full[2]}-${full[3]}`;
      } else if (/^(\d{2})-(\d{2})$/.test(str)) {
        mmdd = str;
      } else {
        return null;
      }
      const [mo, da] = mmdd.split("-").map(Number);
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
      const probe = new Date(2024, mo - 1, da);
      if (probe.getMonth() !== mo - 1 || probe.getDate() !== da) return null;
      if (year != null && (year < 1900 || year > 2100)) return null;
      return { month: mo, day: da, year };
    }
    function nextBirthday(birthday, now) {
      const p = parseBirthday(birthday);
      if (!p) return null;
      const nowD = new Date(now);
      const today = midnightOf(now);
      const build = (y) => {
        const probe = new Date(y, p.month - 1, p.day);
        const mo = probe.getMonth() === p.month - 1 && probe.getDate() === p.day ? p.month : p.month + 1;
        const da = probe.getMonth() === p.month - 1 && probe.getDate() === p.day ? p.day : 1;
        return new Date(y, mo - 1, da);
      };
      let cand = build(nowD.getFullYear());
      if (midnightOf(cand.getTime()) < today) cand = build(nowD.getFullYear() + 1);
      const daysUntil = Math.round((midnightOf(cand.getTime()) - today) / DAY_MS2);
      const out = {
        date: `${cand.getFullYear()}-${pad2(cand.getMonth() + 1)}-${pad2(cand.getDate())}`,
        daysUntil
      };
      if (p.year != null) out.turningAge = cand.getFullYear() - p.year;
      return out;
    }
    function makeId3(now) {
      const t = typeof now === "number" ? now : Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return "t" + t.toString(36) + rand;
    }
    var clip = (s, n) => String(s ?? "").trim().slice(0, n);
    var normText = (s) => {
      const t = String(s ?? "").trim();
      return t || void 0;
    };
    function normalizeSettings2(raw) {
      if (raw == null) return { settings: { ...DEFAULT_SETTINGS3 } };
      if (typeof raw !== "object" || Array.isArray(raw)) return { error: "\u8BBE\u7F6E\u5FC5\u987B\u662F\u5BF9\u8C61" };
      const num = (v, lo, hi, dflt) => {
        const n = Number(v);
        return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : dflt;
      };
      const settings = {
        v: 1,
        defaultCadenceDays: num(raw.defaultCadenceDays, 7, 365, DEFAULT_SETTINGS3.defaultCadenceDays),
        driftGraceDays: num(raw.driftGraceDays, 3, 90, DEFAULT_SETTINGS3.driftGraceDays),
        birthdayDays: num(raw.birthdayDays, 1, 90, DEFAULT_SETTINGS3.birthdayDays),
        dueWarnDays: num(raw.dueWarnDays, 1, 30, DEFAULT_SETTINGS3.dueWarnDays)
      };
      return { settings };
    }
    function normalizePerson3(raw) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u4EBA\u7269\u6570\u636E" };
      const name = clip(raw.name, 40);
      if (!name) return { error: "\u540D\u5B57\u4E0D\u80FD\u4E3A\u7A7A" };
      const birthday = raw.birthday == null || raw.birthday === "" ? void 0 : (() => {
        const p = parseBirthday(raw.birthday);
        if (!p) return { __invalid: true };
        return String(raw.birthday).trim();
      })();
      if (birthday && birthday.__invalid) return { error: "\u751F\u65E5\u683C\u5F0F\u5E94\u4E3A MM-DD \u6216 YYYY-MM-DD\uFF08\u771F\u5B9E\u5B58\u5728\u7684\u65E5\u671F\uFF09" };
      let cadenceDays = null;
      if (raw.cadenceDays != null) {
        const n = Number(raw.cadenceDays);
        if (!Number.isFinite(n)) return { error: `cadenceDays \u5E94\u4E3A 7..365 \u7684\u5929\u6570\uFF08\u6536\u5230\uFF1A${raw.cadenceDays}\uFF09` };
        cadenceDays = clamp(Math.round(n), 7, 365);
      }
      const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => clip(t, 12)).filter(Boolean).slice(0, 8) : void 0;
      const c = raw.contacts && typeof raw.contacts === "object" ? raw.contacts : {};
      const contacts = {};
      for (const f of ["phone", "wechat", "email", "other"]) {
        if (c[f] != null && String(c[f]).trim()) contacts[f] = clip(c[f], 80);
      }
      const person = {
        id: clip(raw.id, 60) || makeId3(),
        name,
        alias: normText(clip(raw.alias, 40)),
        relation: RELATIONS3.includes(raw.relation) ? raw.relation : "\u5176\u4ED6",
        tags,
        howMet: normText(clip(raw.howMet, 200)),
        birthday,
        contacts,
        cadenceDays,
        note: normText(clip(raw.note, 500)),
        pinned: raw.pinned === true,
        archivedAt: raw.archivedAt != null ? raw.archivedAt : void 0,
        createdAt: Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : Date.now()
      };
      return { person };
    }
    function normalizeEvent3(raw) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u5F80\u6765\u6570\u636E" };
      const personId = clip(raw.personId, 60);
      if (!personId) return { error: "\u7F3A\u5C11 personId\uFF08\u5148 ren_person_list \u627E\u4EBA\uFF09" };
      const text = clip(raw.text, 300);
      if (!text) return { error: "\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\uFF08\u53D1\u751F\u4E86\u4EC0\u4E48\u603B\u5F97\u8BB0\u4E00\u53E5\uFF09" };
      const type = EVENT_TYPES2.includes(raw.type) ? raw.type : "contact";
      const at = Number.isFinite(Number(raw.at)) && Number(raw.at) > 0 ? Number(raw.at) : Date.now();
      const ev = { id: clip(raw.id, 60) || makeId3(at), at, personId, type, text };
      if (type === "contact") {
        ev.channel = CHANNELS3.includes(raw.channel) ? raw.channel : "\u5176\u4ED6";
      } else if (type === "favor") {
        if (!FAVOR_DIRECTIONS2.includes(raw.direction)) {
          return { error: "\u4EBA\u60C5\u5F80\u6765\u987B\u6307\u660E direction\uFF1A'gave'\uFF08\u6211\u5E2E\u4E86\u4ED6\uFF09\u6216 'got'\uFF08\u4ED6\u5E2E\u4E86\u6211\uFF09" };
        }
        ev.direction = raw.direction;
      }
      return { event: ev };
    }
    function normalizePromise3(raw) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u627F\u8BFA\u6570\u636E" };
      const personId = clip(raw.personId, 60);
      if (!personId) return { error: "\u7F3A\u5C11 personId\uFF08\u627F\u8BFA\u603B\u8981\u6709\u4E2A\u5BF9\u8C61\uFF09" };
      const text = clip(raw.text, 200);
      if (!text) return { error: "\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\uFF08\u7B54\u5E94\u4E86\u4EC0\u4E48\uFF09" };
      if (!PROMISE_DIRECTIONS3.includes(raw.direction)) {
        return { error: "direction \u5FC5\u987B\u662F 'iowe'\uFF08\u6211\u8BB8\u7684\uFF09\u6216 'owedme'\uFF08\u6211\u7B49\u7684\uFF09" };
      }
      let due;
      if (raw.due != null && raw.due !== "") {
        const t = resolveDateInput2(raw.due, Date.now());
        if (t == null) return { error: "\u671F\u9650\u683C\u5F0F\u5E94\u4E3A YYYY-MM-DD" };
        due = dayKeyOf3(t);
      }
      const p = {
        id: clip(raw.id, 60) || makeId3(),
        personId,
        direction: raw.direction,
        text,
        createdAt: Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
        due,
        status: PROMISE_STATUS.includes(raw.status) ? raw.status : "open"
      };
      if (p.status !== "open") {
        p.closedAt = Number.isFinite(Number(raw.closedAt)) && Number(raw.closedAt) > 0 ? Number(raw.closedAt) : Date.now();
        p.closeNote = normText(clip(raw.closeNote, 200));
      } else {
        if (raw.closeNote != null) p.closeNote = normText(clip(raw.closeNote, 200));
      }
      return { promise: p };
    }
    function appendEvents3(existing, events, cap = MAX_EVENTS) {
      const map = /* @__PURE__ */ new Map();
      for (const e of existing || []) if (e && typeof e === "object" && e.id) map.set(e.id, e);
      for (const e of events || []) if (e && e.id) map.set(e.id, e);
      return [...map.values()].sort((a, b) => a.at - b.at).slice(-cap);
    }
    function trimClosedPromises3(byId, cap = MAX_CLOSED_PROMISES) {
      const closed = Object.values(byId || {}).filter((p) => p && p.status !== "open");
      if (closed.length <= cap) return byId;
      closed.sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));
      const drop = new Set(closed.slice(0, closed.length - cap).map((p) => p.id));
      const next = {};
      for (const [id, p] of Object.entries(byId || {})) if (!drop.has(id)) next[id] = p;
      return next;
    }
    function findPerson(name, people) {
      const q = String(name || "").trim().toLowerCase();
      if (!q) return null;
      const list = Object.values(people || {});
      const exact = list.filter((p) => p && (p.name.toLowerCase() === q || String(p.alias || "").toLowerCase() === q));
      if (exact.length === 1) return { person: exact[0] };
      if (exact.length > 1) return { ambiguous: exact.map((p) => ({ id: p.id, name: p.name, alias: p.alias })) };
      if (q.length < 2) return null;
      const partial = list.filter(
        (p) => p && (p.name.toLowerCase().includes(q) || String(p.alias || "").toLowerCase().includes(q))
      );
      if (partial.length === 1) return { person: partial[0] };
      if (partial.length > 1) return { ambiguous: partial.map((p) => ({ id: p.id, name: p.name, alias: p.alias })) };
      return null;
    }
    function lastContactAt(personId, events) {
      let last = null;
      for (const e of events || []) {
        if (e && e.personId === personId && e.type === "contact" && (last == null || e.at > last)) last = e.at;
      }
      return last;
    }
    function lastEventAt(personId, events) {
      let last = null;
      for (const e of events || []) {
        if (e && e.personId === personId && (last == null || e.at > last)) last = e.at;
      }
      return last;
    }
    function driftList3(people, events, settings, now) {
      const s = settings || DEFAULT_SETTINGS3;
      const grace = s.driftGraceDays ?? DEFAULT_SETTINGS3.driftGraceDays;
      const out = [];
      for (const p of Object.values(people || {})) {
        if (!p || p.archivedAt) continue;
        const cadence = p.cadenceDays || s.defaultCadenceDays || DEFAULT_SETTINGS3.defaultCadenceDays;
        const last = lastContactAt(p.id, events);
        const baseline = last != null ? last : p.createdAt || now;
        const daysSince = Math.max(0, Math.floor((now - baseline) / DAY_MS2));
        const overdue = daysSince - cadence;
        const level = overdue <= 0 ? "ok" : overdue <= grace ? "warn" : "lost";
        out.push({
          personId: p.id,
          name: p.name,
          alias: p.alias,
          relation: p.relation,
          daysSince,
          cadence,
          overdue,
          level,
          lastAt: last,
          neverContacted: last == null,
          text: last == null ? `\u4ECE\u672A\u8BB0\u8FC7\u5F80\u6765\uFF08\u5EFA\u6863 ${daysSince} \u5929\uFF0C\u8282\u594F ${cadence} \u5929\uFF09` : `${daysSince} \u5929\u672A\u8054\u7CFB\uFF08\u8282\u594F ${cadence} \u5929\uFF09`
        });
      }
      const rank = { lost: 0, warn: 1, ok: 2 };
      out.sort((a, b) => rank[a.level] - rank[b.level] || b.overdue - a.overdue);
      return out;
    }
    function birthdayUpcoming4(people, days, now) {
      const out = [];
      for (const p of Object.values(people || {})) {
        if (!p || p.archivedAt || !p.birthday) continue;
        const nb = nextBirthday(p.birthday, now);
        if (!nb || nb.daysUntil > days) continue;
        out.push({ personId: p.id, name: p.name, birthday: p.birthday, ...nb });
      }
      out.sort((a, b) => a.daysUntil - b.daysUntil);
      return out;
    }
    function dueState3(due, now, warnDays) {
      if (!due) return { kind: "none", label: "\u65E0\u671F\u9650" };
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
      if (!m) return { kind: "none", label: "\u65E0\u671F\u9650" };
      const dueMid = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      const days = Math.round((dueMid - midnightOf(now)) / DAY_MS2);
      if (days < 0) return { kind: "overdue", days: -days, label: `\u903E\u671F ${-days} \u5929` };
      if (days === 0) return { kind: "dueSoon", days: 0, label: "\u4ECA\u5929\u5230\u671F" };
      if (days <= warnDays) return { kind: "dueSoon", days, label: `${days} \u5929\u540E\u5230\u671F` };
      return { kind: "scheduled", days, label: `${days} \u5929\u540E\u5230\u671F` };
    }
    function promiseBoard3(promises, people, now, settings) {
      const s = settings || DEFAULT_SETTINGS3;
      const board = { overdue: [], dueSoon: [], scheduled: [], openNoDue: [], closed: [] };
      for (const p of Object.values(promises || {})) {
        if (!p) continue;
        const person = (people || {})[p.personId];
        const item = { ...p, personName: person ? person.name : "\uFF08\u5DF2\u5220\u9664\uFF09", due: p.due || void 0 };
        if (p.status === "open") {
          const st = dueState3(p.due, now, s.dueWarnDays ?? 3);
          item.dueState = st;
          if (st.kind === "overdue") board.overdue.push(item);
          else if (st.kind === "dueSoon") board.dueSoon.push(item);
          else if (st.kind === "scheduled") board.scheduled.push(item);
          else board.openNoDue.push(item);
        } else {
          board.closed.push(item);
        }
      }
      const byDue = (a, b) => (a.dueState?.days ?? 0) - (b.dueState?.days ?? 0);
      board.overdue.sort(byDue);
      board.dueSoon.sort(byDue);
      board.scheduled.sort(byDue);
      board.closed.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
      return board;
    }
    function contactTrend3(events, months, now) {
      const n = clamp(Math.round(Number(months) || 12), 1, 24);
      const base = new Date(now);
      const keys = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        keys.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
      }
      const counts = new Map(keys.map((k) => [k, 0]));
      for (const e of events || []) {
        if (!e || e.type !== "contact") continue;
        const d = new Date(e.at);
        const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
        if (counts.has(k)) counts.set(k, counts.get(k) + 1);
      }
      return keys.map((k) => ({ month: k, count: counts.get(k) }));
    }
    function favorBalance3(events) {
      const byPerson = {};
      for (const e of events || []) {
        if (!e || e.type !== "favor" || !FAVOR_DIRECTIONS2.includes(e.direction)) continue;
        const rec = byPerson[e.personId] = byPerson[e.personId] || { gave: 0, got: 0 };
        rec[e.direction] += 1;
      }
      return byPerson;
    }
    function personPack2(person, events, promises, now, settings) {
      const s = settings || DEFAULT_SETTINGS3;
      const my = (events || []).filter((e) => e && e.personId === person.id).sort((a, b) => b.at - a.at);
      const myPromises = Object.values(promises || {}).filter((p) => p && p.personId === person.id && p.status === "open");
      const lines = [];
      const rel = person.relation === "\u5176\u4ED6" ? "" : `\uFF08${person.relation}\uFF09`;
      lines.push(`\u3010${person.name}\u3011${rel}`);
      if (person.alias && person.alias !== person.name) lines.push(`\u79F0\u547C\uFF1A${person.alias}`);
      if (person.tags && person.tags.length) lines.push(`\u6807\u7B7E\uFF1A${person.tags.join("\u3001")}`);
      if (person.howMet) lines.push(`\u600E\u4E48\u8BA4\u8BC6\uFF1A${person.howMet}`);
      if (person.birthday) {
        const nb = nextBirthday(person.birthday, now);
        if (nb) {
          const ageTxt = nb.turningAge != null ? `\uFF0C\u5C06\u6EE1 ${nb.turningAge}` : "";
          lines.push(`\u751F\u65E5\uFF1A${person.birthday}\uFF08${nb.daysUntil === 0 ? "\u4ECA\u5929\uFF01" : `\u8FD8\u6709 ${nb.daysUntil} \u5929`}${ageTxt}\uFF09`);
        }
      }
      const cadence = person.cadenceDays || s.defaultCadenceDays;
      const ch = [];
      if (person.contacts) {
        for (const [f, v] of Object.entries(person.contacts)) if (v) ch.push(`${f}:${v}`);
      }
      if (ch.length) lines.push(`\u8054\u7CFB\u6E20\u9053\uFF1A${ch.join(" / ")}`);
      if (person.note) lines.push(`\u5907\u6CE8\uFF1A${person.note}`);
      if (my.length) {
        lines.push("\u6700\u8FD1\u5F80\u6765\uFF1A");
        for (const e of my.slice(0, 5)) {
          const tag = e.type === "contact" ? e.channel || "\u8054\u7CFB" : e.type === "favor" ? e.direction === "gave" ? "\u5E2E\u4E86\u4ED6" : "\u4ED6\u5E2E\u6211" : "\u4FBF\u7B7E";
          lines.push(`  ${dayKeyOf3(e.at)} ${tag} \xB7 ${e.text}`);
        }
      } else {
        lines.push("\u6700\u8FD1\u5F80\u6765\uFF1A\uFF08\u8FD8\u6CA1\u6709\u8BB0\u5F55\uFF09");
      }
      if (myPromises.length) {
        lines.push("\u672A\u95ED\u73AF\u627F\u8BFA\uFF1A");
        for (const p of myPromises) {
          const dir = p.direction === "iowe" ? "\u6211\u8BB8\u7684" : "\u6211\u7B49\u7684";
          const st = dueState3(p.due, now, s.dueWarnDays ?? 3);
          lines.push(`  [${dir}] ${p.text}\uFF08${st.label}\uFF09`);
        }
      }
      const bal = favorBalance3(events)[person.id];
      if (bal && (bal.gave || bal.got)) lines.push(`\u4EBA\u60C5\u5929\u5E73\uFF1A\u5E2E\u4E86\u4ED6 ${bal.gave} \u6B21 / \u4ED6\u5E2E\u6211 ${bal.got} \u6B21`);
      const last = lastContactAt(person.id, events);
      if (last != null) {
        const daysSince = Math.floor((now - last) / DAY_MS2);
        const overdue = daysSince - cadence;
        lines.push(overdue > 0 ? `\u72B6\u6001\uFF1A${daysSince} \u5929\u672A\u8054\u7CFB\uFF08\u8282\u594F ${cadence} \u5929\uFF09${overdue > (s.driftGraceDays ?? 14) ? "\uFF0C\u5DF2\u5728\u5931\u8054\u7EA2\u699C" : "\uFF0C\u8BE5\u8054\u7CFB\u4E86"}` : `\u72B6\u6001\uFF1A\u8054\u7CFB\u8282\u594F\u6B63\u5E38\uFF08\u6700\u8FD1 ${daysSince} \u5929\u524D\uFF09`);
      }
      return lines.join("\n");
    }
    function exportAll3(settings, people, promises, journal) {
      return {
        app: "tether",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        settings: settings || DEFAULT_SETTINGS3,
        people: people && people.byId || {},
        promises: promises && promises.byId || {},
        journal: journal && journal.events || []
      };
    }
    module.exports = {
      K: K3,
      RELATIONS: RELATIONS3,
      CHANNELS: CHANNELS3,
      EVENT_TYPES: EVENT_TYPES2,
      FAVOR_DIRECTIONS: FAVOR_DIRECTIONS2,
      PROMISE_DIRECTIONS: PROMISE_DIRECTIONS3,
      PROMISE_STATUS,
      ARCHIVED_FILTERS,
      MAX_PEOPLE: MAX_PEOPLE3,
      MAX_EVENTS,
      MAX_OPEN_PROMISES,
      MAX_CLOSED_PROMISES,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      DAY_MS: DAY_MS2,
      dayKeyOf: dayKeyOf3,
      midnightOf,
      resolveDateInput: resolveDateInput2,
      parseBirthday,
      nextBirthday,
      makeId: makeId3,
      clamp,
      normalizeSettings: normalizeSettings2,
      normalizePerson: normalizePerson3,
      normalizeEvent: normalizeEvent3,
      normalizePromise: normalizePromise3,
      appendEvents: appendEvents3,
      trimClosedPromises: trimClosedPromises3,
      findPerson,
      lastContactAt,
      lastEventAt,
      driftList: driftList3,
      birthdayUpcoming: birthdayUpcoming4,
      dueState: dueState3,
      promiseBoard: promiseBoard3,
      contactTrend: contactTrend3,
      favorBalance: favorBalance3,
      personPack: personPack2,
      exportAll: exportAll3
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState5 } from "react";

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
var core = __toESM(require_tether_core());
var K2 = core.K;
var DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
var RELATIONS2 = core.RELATIONS;
var CHANNELS2 = core.CHANNELS;
var PROMISE_DIRECTIONS2 = core.PROMISE_DIRECTIONS;
var MAX_PEOPLE2 = core.MAX_PEOPLE;
var dayKeyOf2 = core.dayKeyOf;
var normalizePerson2 = core.normalizePerson;
var normalizeEvent2 = core.normalizeEvent;
var normalizePromise2 = core.normalizePromise;
var appendEvents2 = core.appendEvents;
var trimClosedPromises2 = core.trimClosedPromises;
var driftList2 = core.driftList;
var birthdayUpcoming2 = core.birthdayUpcoming;
var promiseBoard2 = core.promiseBoard;
var contactTrend2 = core.contactTrend;
var favorBalance2 = core.favorBalance;
var dueState2 = core.dueState;
var makeId2 = core.makeId;
var exportAll2 = core.exportAll;
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
function normalizeSettingsLocal(raw) {
  const n = core.normalizeSettings(raw);
  return n.settings || { ...DEFAULT_SETTINGS2 };
}
async function loadSettings() {
  const s = await kvGet(K2.settings).catch(() => null);
  const n = core.normalizeSettings(s && typeof s === "object" ? s : null);
  return n.settings || { ...DEFAULT_SETTINGS2 };
}
async function loadPanelData() {
  const [people, promises, journal, settings] = await Promise.all([
    kvGet(K2.people).catch(() => null),
    kvGet(K2.promises).catch(() => null),
    kvGet(K2.journal).catch(() => null),
    loadSettings()
  ]);
  return {
    settings,
    peopleBook: people && people.byId && typeof people.byId === "object" ? { order: Array.isArray(people.order) ? people.order : [], byId: people.byId } : { order: [], byId: {} },
    promisesBook: promises && promises.byId && typeof promises.byId === "object" ? promises : { byId: {} },
    journalBook: journal && Array.isArray(journal.events) ? journal : { events: [] }
  };
}
async function saveSettings(s) {
  await kvSet(K2.settings, s);
}
async function savePeople(book) {
  await kvSet(K2.people, { v: 1, order: book.order, byId: book.byId });
}
async function savePromises(book) {
  await kvSet(K2.promises, { v: 1, byId: trimClosedPromises2(book.byId) });
}
async function saveJournal(book) {
  await kvSet(K2.journal, { v: 1, events: appendEvents2(book.events, []) });
}
async function upsertPerson(input, existing) {
  const now = Date.now();
  let target = null;
  if (typeof input.id === "string" && input.id) {
    target = existing.byId[input.id] || null;
    if (!target) return { ok: false, error: `personId ${input.id} \u4E0D\u5B58\u5728` };
  } else {
    const name = String(input.name || "").trim();
    const hit = Object.values(existing.byId).find((p) => p.name === name);
    if (hit) target = hit;
  }
  const norm = normalizePerson2({ ...target || {}, ...input, createdAt: target ? target.createdAt : now, updatedAt: now });
  if (norm.error || !norm.person) return { ok: false, error: norm.error || "\u6863\u6848\u4E0D\u5408\u6CD5" };
  const person = norm.person;
  if (!target && Object.values(existing.byId).filter((p) => !p.archivedAt).length >= MAX_PEOPLE2) {
    return { ok: false, error: `\u6863\u6848\u5DF2\u8FBE\u4E0A\u9650 ${MAX_PEOPLE2} \u4EBA` };
  }
  const book = { order: [...existing.order], byId: { ...existing.byId } };
  if (!book.order.includes(person.id)) book.order.push(person.id);
  book.byId[person.id] = person;
  await savePeople(book);
  return { ok: true, person };
}
async function removePersonCascade(personId, data) {
  const book = { order: data.peopleBook.order.filter((id) => id !== personId), byId: { ...data.peopleBook.byId } };
  delete book.byId[personId];
  const promById = { ...data.promisesBook.byId };
  for (const [id, p] of Object.entries(promById)) if (p.personId === personId) delete promById[id];
  const events = data.journalBook.events.filter((e) => e.personId !== personId);
  await savePeople(book);
  await savePromises({ byId: promById });
  await saveJournal({ events });
  return events.length;
}
async function appendJournalEvent(ev, existing) {
  await kvSet(K2.journal, { v: 1, events: appendEvents2(existing, [ev]) });
}
async function setPromiseStatus(id, status, closeNote) {
  const cur = await kvGet(K2.promises).catch(() => null);
  const byId = { ...cur && cur.byId || {} };
  const p = byId[id];
  if (!p) return false;
  if (status === "open") {
    delete p.closedAt;
    delete p.closeNote;
  } else {
    p.closedAt = Date.now();
    const note = String(closeNote || "").trim().slice(0, 200);
    if (note) p.closeNote = note;
  }
  p.status = status;
  await savePromises({ byId });
  return true;
}
var RELATION_COLORS = {
  \u5BB6\u4EBA: "#C2504D",
  \u4F34\u4FA3: "#D2598A",
  \u670B\u53CB: "#2A9D8F",
  \u540C\u4E8B: "#4C7DD0",
  \u5BA2\u6237: "#B8860B",
  \u5BFC\u5E08: "#8A6D3B",
  \u540C\u5B66: "#5B8C5A",
  \u5176\u4ED6: "#6B7280"
};
function contactLabel(e) {
  if (e.type === "contact") return e.channel || "\u8054\u7CFB";
  if (e.type === "favor") return e.direction === "gave" ? "\u5E2E\u4E86\u4ED6" : "\u4ED6\u5E2E\u6211";
  return "\u4FBF\u7B7E";
}

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Section({ title, hint }) {
  return /* @__PURE__ */ jsxs("div", { className: "tr-sec", children: [
    /* @__PURE__ */ jsx("i", { className: "tr-bar" }),
    title,
    hint && /* @__PURE__ */ jsx("span", { className: "tr-hint", children: hint })
  ] });
}
function Avatar({ person, size = 34 }) {
  const ch = (person.alias || person.name || "\uFF1F").trim().charAt(0).toUpperCase();
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "tr-avatar",
      style: { width: size, height: size, fontSize: size * 0.42, background: RELATION_COLORS[person.relation] || RELATION_COLORS.\u5176\u4ED6 },
      children: ch
    }
  );
}

// src/TodayTab.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function TodayTab({ data, reload, showToast, setSelectedPersonId, setTab }) {
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "tr-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const now = Date.now();
  const board = promiseBoard2(data.promisesBook.byId, data.peopleBook.byId, now, data.settings);
  const birthdays = birthdayUpcoming2(data.peopleBook.byId, data.settings.birthdayDays, now);
  const drift = driftList2(data.peopleBook.byId, data.journalBook.events, data.settings, now).filter((d) => d.level !== "ok").slice(0, 5);
  const close = async (p) => {
    const done = await setPromiseStatus(p.id, "done");
    await reload();
    showToast(done ? `\u5DF2\u95ED\u73AF\uFF1A${p.text}` : "\u627F\u8BFA\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u53E6\u4E00\u7AEF\u5904\u7406\uFF09", done ? "good" : "bad");
  };
  const jump = (personId) => {
    setSelectedPersonId(personId);
    setTab("people");
  };
  const promiseRow = (p, overdue) => /* @__PURE__ */ jsxs2("div", { className: "tr-promise", children: [
    /* @__PURE__ */ jsx2("span", { className: `tr-dir ${p.direction}`, children: p.direction === "iowe" ? "\u6211\u8BB8\u7684" : "\u6211\u7B49\u7684" }),
    /* @__PURE__ */ jsxs2("div", { className: "tr-promise-main", children: [
      /* @__PURE__ */ jsx2("b", { children: p.text }),
      /* @__PURE__ */ jsxs2("small", { children: [
        p.personName,
        " \xB7 ",
        /* @__PURE__ */ jsx2("span", { style: { color: overdue ? "#FF8A9A" : "#F2C063" }, children: p.dueState?.label })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("button", { className: "tr-btn sm", onClick: () => close(p), children: "\u95ED\u73AF \u2713" })
  ] }, p.id);
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2(Section, { title: "\u903E\u671F\u627F\u8BFA", hint: board.overdue.length ? `${board.overdue.length} \u6761` : "\u5E72\u51C0" }),
    /* @__PURE__ */ jsx2("div", { className: "tr-card", children: /* @__PURE__ */ jsx2("div", { className: "tr-card-b", style: { padding: board.overdue.length ? "4px 13px" : 0 }, children: board.overdue.length ? board.overdue.map((p) => promiseRow(p, true)) : /* @__PURE__ */ jsx2("div", { className: "tr-empty", style: { padding: "14px" }, children: "\u6CA1\u6709\u903E\u671F\u627F\u8BFA \u{1F44C}" }) }) }),
    /* @__PURE__ */ jsx2(Section, { title: "\u4E34\u671F\u627F\u8BFA", hint: `${data.settings.dueWarnDays} \u5929\u5185` }),
    /* @__PURE__ */ jsx2("div", { className: "tr-card", children: /* @__PURE__ */ jsx2("div", { className: "tr-card-b", style: { padding: board.dueSoon.length ? "4px 13px" : 0 }, children: board.dueSoon.length ? board.dueSoon.map((p) => promiseRow(p, false)) : /* @__PURE__ */ jsx2("div", { className: "tr-empty", style: { padding: "14px" }, children: "\u8FD1\u671F\u6CA1\u6709\u8981\u5151\u73B0\u7684\u627F\u8BFA" }) }) }),
    /* @__PURE__ */ jsx2(Section, { title: "\u751F\u65E5", hint: `${data.settings.birthdayDays} \u5929\u5185` }),
    /* @__PURE__ */ jsx2("div", { className: "tr-card", children: /* @__PURE__ */ jsx2("div", { className: "tr-card-b", style: { padding: birthdays.length ? "4px 13px" : 0 }, children: birthdays.length ? birthdays.map((b) => /* @__PURE__ */ jsxs2("div", { className: "tr-promise", onClick: () => jump(b.personId), children: [
      /* @__PURE__ */ jsxs2("div", { className: "tr-promise-main", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          "\u{1F382} ",
          b.name
        ] }),
        /* @__PURE__ */ jsxs2("small", { children: [
          b.date,
          b.turningAge != null ? ` \xB7 \u5C06\u6EE1 ${b.turningAge}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx2("span", { className: `tr-due ${b.daysUntil === 0 ? "overdue" : "dueSoon"}`, children: b.daysUntil === 0 ? "\u4ECA\u5929\uFF01" : `${b.daysUntil} \u5929\u540E` })
    ] }, b.personId)) : /* @__PURE__ */ jsx2("div", { className: "tr-empty", style: { padding: "14px" }, children: "\u7A97\u53E3\u671F\u5185\u6CA1\u6709\u751F\u65E5" }) }) }),
    /* @__PURE__ */ jsx2(Section, { title: "\u5931\u8054\u9884\u8B66", hint: "\u9EC4=\u8D85\u8282\u594F \u7EA2=\u8D85\u5BBD\u9650" }),
    /* @__PURE__ */ jsx2("div", { className: "tr-card", children: /* @__PURE__ */ jsx2("div", { className: "tr-card-b", style: { padding: drift.length ? "4px 13px" : 0 }, children: drift.length ? drift.map((d) => /* @__PURE__ */ jsxs2("div", { className: "tr-promise", onClick: () => jump(d.personId), children: [
      /* @__PURE__ */ jsx2("span", { className: `tr-dot ${d.level}`, style: { marginTop: 4 } }),
      /* @__PURE__ */ jsxs2("div", { className: "tr-promise-main", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          d.name,
          " ",
          /* @__PURE__ */ jsx2("span", { className: "tr-tag", children: d.relation })
        ] }),
        /* @__PURE__ */ jsx2("small", { children: d.text })
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "tr-btn sm ghost", onClick: (e) => {
        e.stopPropagation();
        jump(d.personId);
      }, children: "\u8BB0\u8054\u7CFB" })
    ] }, d.personId)) : /* @__PURE__ */ jsx2("div", { className: "tr-empty", style: { padding: "14px" }, children: "\u8054\u7CFB\u8282\u594F\u90FD\u5728\u8F68\u9053\u4E0A \u2728" }) }) })
  ] });
}

// src/PeopleTab.tsx
import { useMemo, useState } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function PersonForm({ initial, onDone, onCancel, data, showToast }) {
  const [f, setF] = useState({
    name: initial?.name || "",
    alias: initial?.alias || "",
    relation: initial?.relation || "\u5176\u4ED6",
    birthday: initial?.birthday || "",
    cadenceDays: initial?.cadenceDays != null ? String(initial.cadenceDays) : "",
    phone: initial?.contacts?.phone || "",
    wechat: initial?.contacts?.wechat || "",
    email: initial?.contacts?.email || "",
    other: initial?.contacts?.other || "",
    howMet: initial?.howMet || "",
    tags: (initial?.tags || []).join("\uFF0C"),
    note: initial?.note || ""
  });
  const set = (k, v) => setF((c) => ({ ...c, [k]: v }));
  const submit = async () => {
    const contacts = {};
    for (const k of ["phone", "wechat", "email", "other"]) {
      if (f[k].trim()) contacts[k] = f[k].trim();
    }
    const input = {
      id: initial?.id,
      name: f.name.trim(),
      alias: f.alias.trim(),
      relation: f.relation,
      birthday: f.birthday.trim() || void 0,
      cadenceDays: f.cadenceDays.trim() === "" ? null : Number(f.cadenceDays),
      contacts,
      howMet: f.howMet.trim(),
      tags: f.tags.split(/[，,、\s]+/).map((t) => t.trim()).filter(Boolean),
      note: f.note.trim()
    };
    const r = await upsertPerson(input, data.peopleBook);
    if (!r.ok) {
      showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", "bad");
      return;
    }
    showToast(`${initial ? "\u5DF2\u66F4\u65B0" : "\u5DF2\u5EFA\u6863"}\uFF1A${r.person.name}`, "good");
    onDone();
  };
  return /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsxs3("div", { className: "tr-card-b", children: [
    /* @__PURE__ */ jsxs3("div", { className: "tr-row", children: [
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 2, minWidth: 120 }, placeholder: "\u59D3\u540D\uFF08\u5FC5\u586B\uFF09", value: f.name, onChange: (e) => set("name", e.target.value) }),
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1, minWidth: 100 }, placeholder: "\u79F0\u547C\uFF08\u8001\u5F20\uFF09", value: f.alias, onChange: (e) => set("alias", e.target.value) }),
      /* @__PURE__ */ jsx3("select", { className: "tr-sel", value: f.relation, onChange: (e) => set("relation", e.target.value), children: RELATIONS2.map((r) => /* @__PURE__ */ jsx3("option", { value: r, children: r }, r)) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { marginTop: 6 }, children: [
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1, minWidth: 110 }, placeholder: "\u751F\u65E5 MM-DD \u6216 1990-06-15", value: f.birthday, onChange: (e) => set("birthday", e.target.value) }),
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { width: 110 }, placeholder: "\u8282\u594F\uFF08\u5929\uFF0C\u7A7A=\u9ED8\u8BA4\uFF09", inputMode: "numeric", value: f.cadenceDays, onChange: (e) => set("cadenceDays", e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { marginTop: 6 }, children: [
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1, minWidth: 90 }, placeholder: "\u7535\u8BDD", value: f.phone, onChange: (e) => set("phone", e.target.value) }),
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1, minWidth: 90 }, placeholder: "\u5FAE\u4FE1", value: f.wechat, onChange: (e) => set("wechat", e.target.value) }),
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1, minWidth: 90 }, placeholder: "\u90AE\u7BB1", value: f.email, onChange: (e) => set("email", e.target.value) }),
      /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1, minWidth: 90 }, placeholder: "\u5176\u4ED6", value: f.other, onChange: (e) => set("other", e.target.value) })
    ] }),
    /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { marginTop: 6 }, placeholder: "\u600E\u4E48\u8BA4\u8BC6\u7684", value: f.howMet, onChange: (e) => set("howMet", e.target.value) }),
    /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { marginTop: 6 }, placeholder: "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u5982 \u91CD\u8981\u5BA2\u6237\uFF0C\u5E74\u5EA6\u5408\u540C\uFF09", value: f.tags, onChange: (e) => set("tags", e.target.value) }),
    /* @__PURE__ */ jsx3("textarea", { className: "tr-inp", style: { marginTop: 6, resize: "vertical", minHeight: 52 }, placeholder: "\u5907\u6CE8\uFF08\u559C\u597D/\u5FCC\u8BB3/\u5BB6\u4EBA\u60C5\u51B5\u2026\uFF09", value: f.note, onChange: (e) => set("note", e.target.value) }),
    /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { marginTop: 8 }, children: [
      /* @__PURE__ */ jsx3("button", { className: "tr-btn", onClick: submit, children: initial ? "\u4FDD\u5B58" : "\u5EFA\u6863" }),
      /* @__PURE__ */ jsx3("button", { className: "tr-btn ghost", onClick: onCancel, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ jsx3("span", { className: "tr-sub", children: "\u751F\u65E5\u4EC5\u9633\u5386\uFF1B\u8282\u594F=\u60F3\u591A\u4E45\u8054\u7CFB\u4E00\u6B21" })
    ] })
  ] }) });
}
function QuickLog({ person, data, reload, showToast, kind, setKind }) {
  const [channel, setChannel] = useState("\u89C1\u9762");
  const [favorDir, setFavorDir] = useState("gave");
  const [promiseDir, setPromiseDir] = useState("iowe");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  if (!kind) return null;
  const submit = async () => {
    const t = text.trim();
    if (!t) {
      showToast("\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A", "bad");
      return;
    }
    if (kind === "promise") {
      const norm = normalizePromise2({ personId: person.id, direction: promiseDir, text: t, due: due.trim() || void 0 });
      if (norm.error || !norm.promise) {
        showToast(norm.error || "\u627F\u8BFA\u4E0D\u5408\u6CD5", "bad");
        return;
      }
      await savePromises({ byId: { ...data.promisesBook.byId, [norm.promise.id]: norm.promise } });
      showToast(`\u7ACB\u6B64\u5B58\u7167\uFF1A${promiseDir === "iowe" ? "\u6211\u8BB8\u7684" : "\u6211\u7B49\u7684"} \xB7 ${t}`, "good");
    } else {
      const norm = normalizeEvent2({
        id: makeId2(),
        at: Date.now(),
        personId: person.id,
        type: kind,
        channel: kind === "contact" ? channel : void 0,
        direction: kind === "favor" ? favorDir : void 0,
        text: t
      });
      if (norm.error || !norm.event) {
        showToast(norm.error || "\u8BB0\u5F55\u4E0D\u5408\u6CD5", "bad");
        return;
      }
      await appendJournalEvent(norm.event, data.journalBook.events);
      showToast(`\u5DF2\u8BB0\uFF1A${person.name} \xB7 ${kind === "contact" ? channel : kind === "favor" ? favorDir === "gave" ? "\u5E2E\u4E86\u4ED6" : "\u4ED6\u5E2E\u6211" : "\u4FBF\u7B7E"}`, "good");
    }
    setText("");
    setDue("");
    setKind(null);
    await reload();
  };
  return /* @__PURE__ */ jsxs3("div", { className: "tr-form", children: [
    kind === "contact" && /* @__PURE__ */ jsx3("div", { className: "tr-row", children: CHANNELS2.map((c) => /* @__PURE__ */ jsx3("button", { className: `tr-chip ${channel === c ? "on" : ""}`, onClick: () => setChannel(c), children: c }, c)) }),
    kind === "favor" && /* @__PURE__ */ jsxs3("div", { className: "tr-row", children: [
      /* @__PURE__ */ jsx3("button", { className: `tr-chip ${favorDir === "gave" ? "on" : ""}`, onClick: () => setFavorDir("gave"), children: "\u6211\u5E2E\u4E86\u4ED6" }),
      /* @__PURE__ */ jsx3("button", { className: `tr-chip ${favorDir === "got" ? "on" : ""}`, onClick: () => setFavorDir("got"), children: "\u4ED6\u5E2E\u4E86\u6211" })
    ] }),
    kind === "promise" && /* @__PURE__ */ jsxs3("div", { className: "tr-row", children: [
      /* @__PURE__ */ jsx3("button", { className: `tr-chip ${promiseDir === "iowe" ? "on" : ""}`, onClick: () => setPromiseDir("iowe"), children: "\u6211\u8BB8\u7684" }),
      /* @__PURE__ */ jsx3("button", { className: `tr-chip ${promiseDir === "owedme" ? "on" : ""}`, onClick: () => setPromiseDir("owedme"), children: "\u6211\u7B49\u7684" }),
      /* @__PURE__ */ jsx3("input", { className: "tr-inp date", type: "date", style: { width: 150 }, value: due, onChange: (e) => setDue(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "tr-row", children: [
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "tr-inp",
          style: { flex: 1 },
          placeholder: kind === "contact" ? "\u804A\u4E86\u4EC0\u4E48\uFF1F\u4E00\u53E5\u8BDD\u5373\u53EF" : kind === "favor" ? "\u5E2E\u4E86\u4EC0\u4E48\uFF1F" : kind === "promise" ? "\u7B54\u5E94\u4E86\u4EC0\u4E48\uFF1F" : "\u8BB0\u70B9\u4EC0\u4E48\uFF08\u559C\u597D/\u8981\u7D27\u4E8B\uFF09",
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") void submit();
          }
        }
      ),
      /* @__PURE__ */ jsx3("button", { className: "tr-btn sm", onClick: () => void submit(), children: "\u8BB0" }),
      /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: () => setKind(null), children: "\u6536" })
    ] })
  ] });
}
function PersonDetail({ person, data, reload, showToast, onBack, setTab }) {
  const [editing, setEditing] = useState(false);
  const [quickKind, setQuickKind] = useState(null);
  const now = Date.now();
  const drift = useMemo(
    () => driftList2(data.peopleBook.byId, data.journalBook.events, data.settings, now).find((d) => d.personId === person.id),
    [data, person.id, now]
  );
  const events = useMemo(
    () => data.journalBook.events.filter((e) => e.personId === person.id).sort((a, b) => b.at - a.at).slice(0, 10),
    [data.journalBook.events, person.id]
  );
  const mine = Object.values(data.promisesBook.byId).filter((p) => p.personId === person.id && p.status === "open").map((p) => ({ ...p, dueState: dueState2(p.due, now, data.settings.dueWarnDays) }));
  const toggleArchive = async () => {
    const r = await upsertPerson({ id: person.id, name: person.name, archivedAt: person.archivedAt ? null : now }, data.peopleBook);
    if (!r.ok) {
      showToast(r.error || "\u64CD\u4F5C\u5931\u8D25", "bad");
      return;
    }
    await reload();
    showToast(person.archivedAt ? "\u5DF2\u6062\u590D\u5230\u5728\u518C" : "\u5DF2\u5F52\u6863\uFF08\u5931\u8054/\u751F\u65E5\u4E0D\u518D\u63D0\u9192\uFF09", "good");
  };
  const togglePin = async () => {
    const r = await upsertPerson({ id: person.id, name: person.name, pinned: !person.pinned }, data.peopleBook);
    if (!r.ok) {
      showToast(r.error || "\u64CD\u4F5C\u5931\u8D25", "bad");
      return;
    }
    await reload();
  };
  const remove = async () => {
    if (!window.confirm(`\u5220\u9664\u300C${person.name}\u300D\u53CA\u5176\u5168\u90E8\u5F80\u6765\u4E0E\u627F\u8BFA\uFF1F\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    const n = await removePersonCascade(person.id, data);
    await reload();
    showToast(`\u5DF2\u5220\u9664 ${person.name}\uFF08\u8FDE\u5E26\u5F80\u6765 ${n} \u6761\uFF09`);
    onBack();
  };
  const closePromise = async (id, text) => {
    await setPromiseStatus(id, "done");
    await reload();
    showToast(`\u5DF2\u95ED\u73AF\uFF1A${text}`, "good");
  };
  const contact = person.contacts || {};
  const contactRows = ["phone", "wechat", "email", "other"].filter((k) => contact[k]).map((k) => ({ k, label: { phone: "\u7535\u8BDD", wechat: "\u5FAE\u4FE1", email: "\u90AE\u7BB1", other: "\u5176\u4ED6" }[k], v: contact[k] }));
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "tr-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "tr-detail-head", children: [
        /* @__PURE__ */ jsx3("button", { className: "tr-back", onClick: onBack, children: "\u2190" }),
        /* @__PURE__ */ jsx3(Avatar, { person, size: 40 }),
        /* @__PURE__ */ jsxs3("div", { className: "tr-tt", style: { flex: 1 }, children: [
          /* @__PURE__ */ jsxs3("b", { style: { fontSize: 14 }, children: [
            person.name,
            person.alias && person.alias !== person.name ? /* @__PURE__ */ jsxs3("span", { style: { color: "#8B95A7", fontWeight: 400 }, children: [
              "\uFF08",
              person.alias,
              "\uFF09"
            ] }) : null,
            /* @__PURE__ */ jsx3("span", { className: "tr-tag", style: { marginLeft: 6 }, children: person.relation }),
            person.pinned ? /* @__PURE__ */ jsx3("span", { style: { marginLeft: 4 }, children: "\u{1F4CC}" }) : null
          ] }),
          /* @__PURE__ */ jsx3("small", { style: { color: drift && drift.level === "lost" ? "#FF8A9A" : drift && drift.level === "warn" ? "#F2C063" : "#8B95A7" }, children: drift ? drift.text : "" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "tr-detail-grid", children: [
        person.birthday && /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { children: "\u751F\u65E5" }),
          /* @__PURE__ */ jsx3("b", { children: person.birthday })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { children: "\u8054\u7CFB\u8282\u594F" }),
          /* @__PURE__ */ jsx3("b", { children: person.cadenceDays ? `${person.cadenceDays} \u5929` : `\u9ED8\u8BA4 ${data.settings.defaultCadenceDays} \u5929` })
        ] }),
        contactRows.map((c) => /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("span", { children: c.label }),
          /* @__PURE__ */ jsx3("b", { children: c.v })
        ] }, c.k)),
        person.howMet && /* @__PURE__ */ jsxs3("div", { style: { gridColumn: "1 / -1" }, children: [
          /* @__PURE__ */ jsx3("span", { children: "\u600E\u4E48\u8BA4\u8BC6" }),
          /* @__PURE__ */ jsx3("b", { children: person.howMet })
        ] }),
        !!(person.tags && person.tags.length) && /* @__PURE__ */ jsxs3("div", { style: { gridColumn: "1 / -1" }, children: [
          /* @__PURE__ */ jsx3("span", { children: "\u6807\u7B7E" }),
          /* @__PURE__ */ jsx3("b", { children: person.tags.join("\u3001") })
        ] }),
        person.note && /* @__PURE__ */ jsxs3("div", { style: { gridColumn: "1 / -1" }, children: [
          /* @__PURE__ */ jsx3("span", { children: "\u5907\u6CE8" }),
          /* @__PURE__ */ jsx3("b", { style: { fontWeight: 400 }, children: person.note })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "tr-actions", children: [
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm", onClick: () => setQuickKind(quickKind === "contact" ? null : "contact"), children: "\u8BB0\u8054\u7CFB" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: () => setQuickKind(quickKind === "favor" ? null : "favor"), children: "\u8BB0\u4EBA\u60C5" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: () => setQuickKind(quickKind === "note" ? null : "note"), children: "\u5199\u4FBF\u7B7E" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: () => setQuickKind(quickKind === "promise" ? null : "promise"), children: "\u52A0\u627F\u8BFA" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: () => setEditing(!editing), children: editing ? "\u6536\u8D77\u7F16\u8F91" : "\u7F16\u8F91" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: togglePin, children: person.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm ghost", onClick: toggleArchive, children: person.archivedAt ? "\u6062\u590D" : "\u5F52\u6863" }),
        /* @__PURE__ */ jsx3("button", { className: "tr-btn sm danger", onClick: remove, children: "\u5220\u9664" })
      ] }),
      /* @__PURE__ */ jsx3(QuickLog, { person, data, reload, showToast, kind: quickKind, setKind: setQuickKind })
    ] }),
    editing && /* @__PURE__ */ jsx3(PersonForm, { initial: person, data, showToast, onDone: () => {
      setEditing(false);
      void reload();
    }, onCancel: () => setEditing(false) }),
    /* @__PURE__ */ jsx3(Section, { title: "\u672A\u95ED\u73AF\u627F\u8BFA", hint: `${mine.length} \u6761` }),
    /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsx3("div", { className: "tr-card-b", style: { padding: mine.length ? "4px 13px" : 0 }, children: mine.length ? mine.map((p) => /* @__PURE__ */ jsxs3("div", { className: "tr-promise", children: [
      /* @__PURE__ */ jsx3("span", { className: `tr-dir ${p.direction}`, children: p.direction === "iowe" ? "\u6211\u8BB8\u7684" : "\u6211\u7B49\u7684" }),
      /* @__PURE__ */ jsxs3("div", { className: "tr-promise-main", children: [
        /* @__PURE__ */ jsx3("b", { children: p.text }),
        /* @__PURE__ */ jsx3("small", { children: p.dueState.label })
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "tr-btn sm", onClick: () => closePromise(p.id, p.text), children: "\u95ED\u73AF \u2713" })
    ] }, p.id)) : /* @__PURE__ */ jsx3("div", { className: "tr-empty", style: { padding: "12px" }, children: "\u548C\u8FD9\u4F4D\u4E4B\u95F4\u6CA1\u6709\u60AC\u7740\u7684\u627F\u8BFA" }) }) }),
    /* @__PURE__ */ jsx3(Section, { title: "\u6700\u8FD1\u5F80\u6765", hint: "" }),
    /* @__PURE__ */ jsx3("div", { className: "tr-card", children: /* @__PURE__ */ jsx3("div", { className: "tr-card-b", style: { padding: events.length ? "4px 13px" : 0 }, children: events.length ? events.map((e) => /* @__PURE__ */ jsxs3("div", { className: "tr-event", children: [
      /* @__PURE__ */ jsx3("span", { className: `tr-kind ${e.type === "favor" ? `favor-${e.direction}` : ""}`, children: e.type === "contact" ? e.channel || "\u8054\u7CFB" : e.type === "favor" ? e.direction === "gave" ? "\u5E2E\u4E86\u4ED6" : "\u4ED6\u5E2E\u6211" : "\u4FBF\u7B7E" }),
      /* @__PURE__ */ jsxs3("div", { className: "tr-event-body", children: [
        /* @__PURE__ */ jsx3("b", { style: { fontWeight: 400 }, children: e.text }),
        /* @__PURE__ */ jsx3("small", { children: new Date(e.at).toLocaleDateString("zh-CN") })
      ] })
    ] }, e.id)) : /* @__PURE__ */ jsx3("div", { className: "tr-empty", style: { padding: "12px" }, children: "\u8FD8\u6CA1\u6709\u5F80\u6765\u8BB0\u5F55\u2014\u2014\u70B9\u4E0A\u9762\u7684\u300C\u8BB0\u8054\u7CFB\u300D\u8BB0\u7B2C\u4E00\u7B14" }) }) }),
    /* @__PURE__ */ jsx3("div", { style: { height: 8 } })
  ] });
}
function PeopleTab({ data, reload, showToast, selectedPersonId, setSelectedPersonId, setTab }) {
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "tr-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const now = Date.now();
  const selected = selectedPersonId ? data.peopleBook.byId[selectedPersonId] : null;
  if (selected) {
    return /* @__PURE__ */ jsx3(
      PersonDetail,
      {
        person: selected,
        data,
        reload,
        showToast,
        onBack: () => setSelectedPersonId(null),
        setTab
      }
    );
  }
  const drift = driftList2(data.peopleBook.byId, data.journalBook.events, data.settings, now);
  const driftById = new Map(drift.map((d) => [d.personId, d]));
  const q = query.trim().toLowerCase();
  const list = Object.values(data.peopleBook.byId).filter((p) => {
    if (!p) return false;
    if (showArchived ? !p.archivedAt : !!p.archivedAt) return false;
    if (relation && p.relation !== relation) return false;
    if (q) {
      const hay = [p.name, p.alias, p.howMet, p.note, ...p.tags || []].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name, "zh"));
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3(Section, { title: "\u6545\u4EBA", hint: `${list.length} \u4F4D` }),
    /* @__PURE__ */ jsxs3("div", { className: "tr-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "tr-card-b", children: [
        /* @__PURE__ */ jsxs3("div", { className: "tr-row", children: [
          /* @__PURE__ */ jsx3("input", { className: "tr-inp", style: { flex: 1 }, placeholder: "\u641C\u7D22\u540D\u5B57 / \u6807\u7B7E / \u5907\u6CE8", value: query, onChange: (e) => setQuery(e.target.value) }),
          /* @__PURE__ */ jsx3("button", { className: "tr-btn", onClick: () => setAdding(!adding), children: adding ? "\u6536\u8D77" : "+ \u5EFA\u6863" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "tr-row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx3("button", { className: `tr-chip ${relation === "" ? "on" : ""}`, onClick: () => setRelation(""), children: "\u5168\u90E8" }),
          RELATIONS2.map((r) => /* @__PURE__ */ jsx3("button", { className: `tr-chip ${relation === r ? "on" : ""}`, onClick: () => setRelation(relation === r ? "" : r), children: r }, r))
        ] })
      ] }),
      adding && /* @__PURE__ */ jsx3(
        PersonForm,
        {
          initial: null,
          data,
          showToast,
          onDone: () => {
            setAdding(false);
            void reload();
          },
          onCancel: () => setAdding(false)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "tr-card", children: [
      /* @__PURE__ */ jsx3("div", { className: "tr-card-b", style: { padding: list.length ? "2px 0" : 0 }, children: list.length ? list.map((p) => {
        const d = driftById.get(p.id);
        return /* @__PURE__ */ jsxs3("div", { className: "tr-person", onClick: () => setSelectedPersonId(p.id), children: [
          /* @__PURE__ */ jsx3(Avatar, { person: p }),
          /* @__PURE__ */ jsxs3("div", { className: "tr-person-main", children: [
            /* @__PURE__ */ jsxs3("b", { children: [
              p.name,
              p.alias && p.alias !== p.name ? /* @__PURE__ */ jsxs3("span", { style: { color: "#5C6678", fontWeight: 400 }, children: [
                "\uFF08",
                p.alias,
                "\uFF09"
              ] }) : null,
              p.pinned ? " \u{1F4CC}" : "",
              p.archivedAt ? /* @__PURE__ */ jsx3("span", { className: "tr-tag", children: "\u5DF2\u5F52\u6863" }) : d && d.level !== "ok" ? /* @__PURE__ */ jsx3("span", { className: `tr-dot ${d.level}`, style: { marginLeft: 4 } }) : null
            ] }),
            /* @__PURE__ */ jsx3("small", { children: d ? d.text : "" })
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "tr-tag", children: p.relation })
        ] }, p.id);
      }) : /* @__PURE__ */ jsx3("div", { className: "tr-empty", children: showArchived ? "\u6CA1\u6709\u5F52\u6863\u7684\u4EBA\u7269" : "\u8FD8\u6CA1\u6709\u4EBA\u7269\u6863\u6848\u2014\u2014\u70B9\u53F3\u4E0A\u300C+ \u5EFA\u6863\u300D\uFF0C\u6216\u76F4\u63A5\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u8BB0\u4E00\u4E0B\u5F20\u603B\u300D" }) }),
      /* @__PURE__ */ jsx3("div", { className: "tr-card-b", style: { paddingTop: 0 }, children: /* @__PURE__ */ jsx3("button", { className: `tr-chip ${showArchived ? "on" : ""}`, onClick: () => setShowArchived(!showArchived), children: showArchived ? "\u2190 \u56DE\u5230\u5728\u518C" : "\u67E5\u770B\u5DF2\u5F52\u6863" }) })
    ] })
  ] });
}

// src/PromisesTab.tsx
import { useState as useState2 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var DIR_LABEL = { iowe: "\u6211\u8BB8\u7684", owedme: "\u6211\u7B49\u7684" };
function PromisesTab({ data, reload, showToast }) {
  const [dir, setDir] = useState2("");
  const [withClosed, setWithClosed] = useState2(false);
  const [adding, setAdding] = useState2(false);
  const [personId, setPersonId] = useState2("");
  const [pDir, setPDir] = useState2("iowe");
  const [text, setText] = useState2("");
  const [due, setDue] = useState2("");
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "tr-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const now = Date.now();
  const board = promiseBoard2(data.promisesBook.byId, data.peopleBook.byId, now, data.settings);
  const pick = (arr) => arr.filter((p) => !dir || p.direction === dir);
  const add = async () => {
    const t = text.trim();
    if (!t) {
      showToast("\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A", "bad");
      return;
    }
    if (!personId) {
      showToast("\u9009\u4E00\u4E2A\u4EBA\uFF08\u5148\u53BB\u300C\u6545\u4EBA\u300D\u5EFA\u6863\uFF09", "bad");
      return;
    }
    const norm = normalizePromise2({ personId, direction: pDir, text: t, due: due.trim() || void 0 });
    if (norm.error || !norm.promise) {
      showToast(norm.error || "\u627F\u8BFA\u4E0D\u5408\u6CD5", "bad");
      return;
    }
    await savePromises({ byId: { ...data.promisesBook.byId, [norm.promise.id]: norm.promise } });
    setText("");
    setDue("");
    setAdding(false);
    await reload();
    showToast(`\u7ACB\u6B64\u5B58\u7167\uFF1A${DIR_LABEL[pDir]} \xB7 ${t}`, "good");
  };
  const act = async (p, status) => {
    const done = await setPromiseStatus(p.id, status);
    await reload();
    showToast(done ? status === "done" ? `\u5DF2\u95ED\u73AF\uFF1A${p.text}` : status === "cancelled" ? `\u5DF2\u53D6\u6D88\uFF1A${p.text}` : "\u5DF2\u91CD\u5F00" : "\u627F\u8BFA\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u53E6\u4E00\u7AEF\u5904\u7406\uFF09", done ? "good" : "bad");
  };
  const row = (p, overdue) => /* @__PURE__ */ jsxs4("div", { className: "tr-promise", children: [
    /* @__PURE__ */ jsx4("span", { className: `tr-dir ${p.direction}`, children: DIR_LABEL[p.direction] }),
    /* @__PURE__ */ jsxs4("div", { className: "tr-promise-main", children: [
      /* @__PURE__ */ jsx4("b", { children: p.text }),
      /* @__PURE__ */ jsxs4("small", { children: [
        p.personName,
        " \xB7 ",
        /* @__PURE__ */ jsx4("span", { style: { color: overdue ? "#FF8A9A" : p.dueState?.kind === "dueSoon" ? "#F2C063" : void 0 }, children: p.dueState?.label }),
        p.closeNote ? ` \xB7 ${p.closeNote}` : ""
      ] })
    ] }),
    p.status === "open" ? /* @__PURE__ */ jsxs4("span", { className: "tr-row", style: { gap: 4 }, children: [
      /* @__PURE__ */ jsx4("button", { className: "tr-btn sm", onClick: () => act(p, "done"), children: "\u2713" }),
      /* @__PURE__ */ jsx4("button", { className: "tr-btn sm ghost", onClick: () => act(p, "cancelled"), children: "\u2715" })
    ] }) : /* @__PURE__ */ jsx4("button", { className: "tr-btn sm ghost", onClick: () => act(p, "open"), children: "\u91CD\u5F00" })
  ] }, p.id);
  const activePeople = Object.values(data.peopleBook.byId).filter((p) => !p.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4(Section, { title: "\u627F\u8BFA", hint: `${board.overdue.length + board.dueSoon.length + board.scheduled.length + board.openNoDue.length} \u6761\u672A\u95ED\u73AF` }),
    /* @__PURE__ */ jsxs4("div", { className: "tr-card", children: [
      /* @__PURE__ */ jsx4("div", { className: "tr-card-b", children: /* @__PURE__ */ jsxs4("div", { className: "tr-row", children: [
        /* @__PURE__ */ jsx4("button", { className: `tr-chip ${dir === "" ? "on" : ""}`, onClick: () => setDir(""), children: "\u5168\u90E8" }),
        PROMISE_DIRECTIONS2.map((d) => /* @__PURE__ */ jsx4("button", { className: `tr-chip ${dir === d ? "on" : ""}`, onClick: () => setDir(dir === d ? "" : d), children: DIR_LABEL[d] }, d)),
        /* @__PURE__ */ jsx4("button", { className: `tr-chip ${withClosed ? "on" : ""}`, onClick: () => setWithClosed(!withClosed), children: withClosed ? "\u542B\u5DF2\u95ED\u73AF" : "\u4EC5\u672A\u95ED\u73AF" }),
        /* @__PURE__ */ jsx4("button", { className: "tr-btn sm", style: { marginLeft: "auto" }, onClick: () => setAdding(!adding), children: adding ? "\u6536\u8D77" : "+ \u7ACB\u8BFA" })
      ] }) }),
      adding && /* @__PURE__ */ jsxs4("div", { className: "tr-form", children: [
        /* @__PURE__ */ jsx4("div", { className: "tr-row", children: /* @__PURE__ */ jsxs4("select", { className: "tr-sel", style: { flex: 1 }, value: personId, onChange: (e) => setPersonId(e.target.value), children: [
          /* @__PURE__ */ jsx4("option", { value: "", children: "\u9009\u62E9\u5BF9\u8C61\u2026" }),
          activePeople.map((p) => /* @__PURE__ */ jsx4("option", { value: p.id, children: p.name }, p.id))
        ] }) }),
        /* @__PURE__ */ jsxs4("div", { className: "tr-row", children: [
          /* @__PURE__ */ jsx4("button", { className: `tr-chip ${pDir === "iowe" ? "on" : ""}`, onClick: () => setPDir("iowe"), children: "\u6211\u8BB8\u7684" }),
          /* @__PURE__ */ jsx4("button", { className: `tr-chip ${pDir === "owedme" ? "on" : ""}`, onClick: () => setPDir("owedme"), children: "\u6211\u7B49\u7684" }),
          /* @__PURE__ */ jsx4("input", { className: "tr-inp date", type: "date", style: { width: 150 }, value: due, onChange: (e) => setDue(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "tr-row", children: [
          /* @__PURE__ */ jsx4(
            "input",
            {
              className: "tr-inp",
              style: { flex: 1 },
              placeholder: "\u7B54\u5E94\u4E86\u4EC0\u4E48 / \u7B49\u5BF9\u65B9\u4EC0\u4E48",
              value: text,
              onChange: (e) => setText(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") void add();
              }
            }
          ),
          /* @__PURE__ */ jsx4("button", { className: "tr-btn sm", onClick: () => void add(), children: "\u7ACB" })
        ] })
      ] })
    ] }),
    [["\u903E\u671F", pick(board.overdue), true], ["\u4E34\u671F", pick(board.dueSoon), false], ["\u6709\u671F\u9650", pick(board.scheduled), false], ["\u65E0\u671F\u9650", pick(board.openNoDue), false]].map(([label, arr, overdue]) => arr.length ? /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsx4(Section, { title: label, hint: `${arr.length} \u6761` }),
      /* @__PURE__ */ jsx4("div", { className: "tr-card", children: /* @__PURE__ */ jsx4("div", { className: "tr-card-b", style: { padding: "4px 13px" }, children: arr.map((p) => row(p, overdue)) }) })
    ] }, label) : null),
    withClosed && board.closed.length ? /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsx4(Section, { title: "\u5DF2\u95ED\u73AF", hint: `${board.closed.length} \u6761` }),
      /* @__PURE__ */ jsx4("div", { className: "tr-card", children: /* @__PURE__ */ jsx4("div", { className: "tr-card-b", style: { padding: "4px 13px" }, children: pick(board.closed).slice(0, 30).map((p) => row(p, false)) }) })
    ] }) : null
  ] });
}

// src/JournalTab.tsx
import { useState as useState3 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function JournalTab({ data, reload, showToast }) {
  const [kind, setKind] = useState3("");
  const [kw, setKw] = useState3("");
  const [fPersonId, setFPersonId] = useState3("");
  const [nPersonId, setNPersonId] = useState3("");
  const [nType, setNType] = useState3("contact");
  const [nChannel, setNChannel] = useState3("\u89C1\u9762");
  const [nFavorDir, setNFavorDir] = useState3("gave");
  const [nText, setNText] = useState3("");
  if (!data) return /* @__PURE__ */ jsx5("div", { className: "tr-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const peopleById = data.peopleBook.byId;
  const activePeople = Object.values(peopleById).filter((p) => !p.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const submit = async () => {
    const t = nText.trim();
    if (!nPersonId) {
      showToast("\u9009\u4E00\u4E2A\u4EBA", "bad");
      return;
    }
    if (!t) {
      showToast("\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A", "bad");
      return;
    }
    const norm = normalizeEvent2({
      id: makeId2(),
      at: Date.now(),
      personId: nPersonId,
      type: nType,
      channel: nType === "contact" ? nChannel : void 0,
      direction: nType === "favor" ? nFavorDir : void 0,
      text: t
    });
    if (norm.error || !norm.event) {
      showToast(norm.error || "\u8BB0\u5F55\u4E0D\u5408\u6CD5", "bad");
      return;
    }
    await appendJournalEvent(norm.event, data.journalBook.events);
    setNText("");
    await reload();
    const who = peopleById[nPersonId]?.name || "";
    showToast(`\u5DF2\u8BB0\uFF1A${who} \xB7 ${contactLabel(norm.event)}`, "good");
  };
  const q = kw.trim().toLowerCase();
  const filtered = data.journalBook.events.filter((e) => {
    if (!e) return false;
    if (kind && e.type !== kind) return false;
    if (fPersonId && e.personId !== fPersonId) return false;
    if (q && !String(e.text).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.at - a.at).slice(0, 200);
  const byDay = /* @__PURE__ */ new Map();
  const todayKey = dayKeyOf2(Date.now());
  const yesterdayKey = dayKeyOf2(Date.now() - 864e5);
  for (const e of filtered) {
    const k = dayKeyOf2(e.at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const dayLabel = (k) => k === todayKey ? "\u4ECA\u5929" : k === yesterdayKey ? "\u6628\u5929" : k;
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsx5(Section, { title: "\u8BB0\u4E00\u7B14" }),
    /* @__PURE__ */ jsx5("div", { className: "tr-card", children: /* @__PURE__ */ jsxs5("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { className: "tr-row", children: [
        /* @__PURE__ */ jsxs5("select", { className: "tr-sel", style: { flex: 1 }, value: nPersonId, onChange: (e) => setNPersonId(e.target.value), children: [
          /* @__PURE__ */ jsx5("option", { value: "", children: "\u5BF9\u8C61\u2026" }),
          activePeople.map((p) => /* @__PURE__ */ jsx5("option", { value: p.id, children: p.name }, p.id))
        ] }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${nType === "contact" ? "on" : ""}`, onClick: () => setNType("contact"), children: "\u8054\u7CFB" }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${nType === "favor" ? "on" : ""}`, onClick: () => setNType("favor"), children: "\u4EBA\u60C5" }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${nType === "note" ? "on" : ""}`, onClick: () => setNType("note"), children: "\u4FBF\u7B7E" })
      ] }),
      nType === "contact" && /* @__PURE__ */ jsx5("div", { className: "tr-row", style: { marginTop: 6 }, children: CHANNELS2.map((c) => /* @__PURE__ */ jsx5("button", { className: `tr-chip ${nChannel === c ? "on" : ""}`, onClick: () => setNChannel(c), children: c }, c)) }),
      nType === "favor" && /* @__PURE__ */ jsxs5("div", { className: "tr-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${nFavorDir === "gave" ? "on" : ""}`, onClick: () => setNFavorDir("gave"), children: "\u6211\u5E2E\u4E86\u4ED6" }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${nFavorDir === "got" ? "on" : ""}`, onClick: () => setNFavorDir("got"), children: "\u4ED6\u5E2E\u4E86\u6211" })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "tr-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "tr-inp",
            style: { flex: 1 },
            placeholder: "\u53D1\u751F\u4E86\u4EC0\u4E48\uFF0C\u4E00\u53E5\u8BDD\u5373\u53EF",
            value: nText,
            onChange: (e) => setNText(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") void submit();
            }
          }
        ),
        /* @__PURE__ */ jsx5("button", { className: "tr-btn sm", onClick: () => void submit(), children: "\u8BB0" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx5(Section, { title: "\u6D41\u6C34", hint: `${filtered.length} \u6761` }),
    /* @__PURE__ */ jsx5("div", { className: "tr-card", children: /* @__PURE__ */ jsxs5("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { className: "tr-row", children: [
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${kind === "" ? "on" : ""}`, onClick: () => setKind(""), children: "\u5168\u90E8" }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${kind === "contact" ? "on" : ""}`, onClick: () => setKind("contact"), children: "\u8054\u7CFB" }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${kind === "favor" ? "on" : ""}`, onClick: () => setKind("favor"), children: "\u4EBA\u60C5" }),
        /* @__PURE__ */ jsx5("button", { className: `tr-chip ${kind === "note" ? "on" : ""}`, onClick: () => setKind("note"), children: "\u4FBF\u7B7E" }),
        /* @__PURE__ */ jsxs5("select", { className: "tr-sel", style: { flex: 1, minWidth: 100 }, value: fPersonId, onChange: (e) => setFPersonId(e.target.value), children: [
          /* @__PURE__ */ jsx5("option", { value: "", children: "\u6240\u6709\u4EBA" }),
          activePeople.map((p) => /* @__PURE__ */ jsx5("option", { value: p.id, children: p.name }, p.id))
        ] })
      ] }),
      /* @__PURE__ */ jsx5("input", { className: "tr-inp", style: { marginTop: 8 }, placeholder: "\u641C\u5185\u5BB9\u5173\u952E\u8BCD", value: kw, onChange: (e) => setKw(e.target.value) })
    ] }) }),
    [...byDay.entries()].map(([day, events]) => /* @__PURE__ */ jsx5("div", { children: /* @__PURE__ */ jsxs5("div", { className: "tr-card", style: { marginTop: 10 }, children: [
      /* @__PURE__ */ jsx5("div", { style: { padding: "8px 13px 0" }, children: /* @__PURE__ */ jsx5("span", { className: "tr-sub", children: /* @__PURE__ */ jsx5("b", { style: { color: "#8B95A7" }, children: dayLabel(day) }) }) }),
      /* @__PURE__ */ jsx5("div", { className: "tr-card-b", style: { padding: "4px 13px 10px" }, children: events.map((e) => {
        const who = peopleById[e.personId];
        return /* @__PURE__ */ jsxs5("div", { className: "tr-event", children: [
          who ? /* @__PURE__ */ jsx5(Avatar, { person: who, size: 26 }) : /* @__PURE__ */ jsx5("span", { className: "tr-kind", children: "\uFF1F" }),
          /* @__PURE__ */ jsxs5("div", { className: "tr-event-body", children: [
            /* @__PURE__ */ jsx5("b", { style: { fontWeight: 400 }, children: e.text }),
            /* @__PURE__ */ jsxs5("small", { children: [
              who ? who.name : "\uFF08\u5DF2\u5220\u9664\uFF09",
              " \xB7 ",
              new Date(e.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
            ] })
          ] }),
          /* @__PURE__ */ jsx5("span", { className: `tr-kind ${e.type === "favor" ? `favor-${e.direction}` : ""}`, children: contactLabel(e) })
        ] }, e.id);
      }) })
    ] }) }, day)),
    !filtered.length && /* @__PURE__ */ jsxs5("div", { className: "tr-empty", children: [
      "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5F80\u6765\u8BB0\u5F55",
      !kind && !q && !fPersonId ? "\u2014\u2014\u5BF9 AI \u8BF4\u300C\u8BB0\u4E00\u4E0B\u6211\u4ECA\u5929\u89C1\u4E86\u8C01\u300D\u4E5F\u884C" : ""
    ] })
  ] });
}

// src/StatsTab.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function StatsTab({ data }) {
  if (!data) return /* @__PURE__ */ jsx6("div", { className: "tr-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const now = Date.now();
  const drift = driftList2(data.peopleBook.byId, data.journalBook.events, data.settings, now);
  const driftById = new Map(drift.map((d) => [d.personId, d]));
  const active = Object.values(data.peopleBook.byId).filter((p) => !p.archivedAt);
  const byRelation = /* @__PURE__ */ new Map();
  for (const p of active) {
    const rec = byRelation.get(p.relation) || { count: 0, lost: 0, warn: 0, daysSum: 0, daysN: 0 };
    rec.count += 1;
    const d = driftById.get(p.id);
    if (d) {
      if (d.level === "lost") rec.lost += 1;
      else if (d.level === "warn") rec.warn += 1;
      rec.daysSum += d.daysSince;
      rec.daysN += 1;
    }
    byRelation.set(p.relation, rec);
  }
  const relRows = [...byRelation.entries()].sort((a, b) => b[1].count - a[1].count);
  const trend = contactTrend2(data.journalBook.events, 12, now);
  const maxCount = Math.max(1, ...trend.map((t) => t.count));
  const bal = favorBalance2(data.journalBook.events);
  const balRows = Object.entries(bal).map(([pid, b]) => ({ name: data.peopleBook.byId[pid]?.name || "\uFF08\u5DF2\u5220\u9664\uFF09", ...b, diff: b.gave - b.got })).filter((b) => b.gave + b.got > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const board = promiseBoard2(data.promisesBook.byId, data.peopleBook.byId, now, data.settings);
  const iowe = board.overdue.concat(board.dueSoon, board.scheduled, board.openNoDue).filter((p) => p.direction === "iowe").length;
  const owedme = board.overdue.concat(board.dueSoon, board.scheduled, board.openNoDue).length - iowe;
  return /* @__PURE__ */ jsxs6("div", { children: [
    /* @__PURE__ */ jsx6(Section, { title: "\u5173\u7CFB\u5206\u7EC4", hint: `${active.length} \u4F4D\u5728\u518C` }),
    /* @__PURE__ */ jsx6("div", { className: "tr-card", children: /* @__PURE__ */ jsx6("div", { className: "tr-card-b", style: { padding: relRows.length ? "2px 13px" : 0 }, children: relRows.length ? relRows.map(([rel, rec]) => {
      const avg = rec.daysN ? Math.round(rec.daysSum / rec.daysN) : 0;
      return /* @__PURE__ */ jsx6("div", { className: "tr-field", children: /* @__PURE__ */ jsxs6("div", { className: "tr-field-l", children: [
        /* @__PURE__ */ jsxs6("b", { children: [
          rel,
          " \xB7 ",
          rec.count,
          " \u4EBA"
        ] }),
        /* @__PURE__ */ jsxs6("small", { children: [
          "\u5E73\u5747 ",
          avg,
          " \u5929\u524D\u8054\u7CFB",
          rec.warn ? ` \xB7 \u{1F7E1} ${rec.warn}` : "",
          rec.lost ? ` \xB7 \u{1F534} ${rec.lost}` : ""
        ] })
      ] }) }, rel);
    }) : /* @__PURE__ */ jsx6("div", { className: "tr-empty", style: { padding: "12px" }, children: "\u8FD8\u6CA1\u6709\u4EBA\u7269\u6863\u6848" }) }) }),
    /* @__PURE__ */ jsx6(Section, { title: "\u8FD1 12 \u4E2A\u6708\u8054\u7CFB", hint: `${trend.reduce((s, t) => s + t.count, 0)} \u6B21` }),
    /* @__PURE__ */ jsx6("div", { className: "tr-card", children: /* @__PURE__ */ jsx6("div", { className: "tr-card-b", children: /* @__PURE__ */ jsx6("div", { className: "tr-bars", children: trend.map((t) => /* @__PURE__ */ jsxs6("div", { className: "tr-barcol", title: `${t.month}\uFF1A${t.count} \u6B21`, children: [
      /* @__PURE__ */ jsx6("i", { style: { height: `${Math.max(3, t.count / maxCount * 70)}px`, opacity: t.count ? 1 : 0.25 } }),
      /* @__PURE__ */ jsx6("small", { children: t.month.slice(5) })
    ] }, t.month)) }) }) }),
    /* @__PURE__ */ jsx6(Section, { title: "\u4EBA\u60C5\u5929\u5E73", hint: "\u4E2D\u6027\u8BB0\u5F55\uFF0C\u4E0D\u6298\u7B97\u94B1" }),
    /* @__PURE__ */ jsx6("div", { className: "tr-card", children: /* @__PURE__ */ jsx6("div", { className: "tr-card-b", style: { padding: balRows.length ? "2px 13px" : 0 }, children: balRows.length ? balRows.slice(0, 10).map((b) => /* @__PURE__ */ jsxs6("div", { className: "tr-field", children: [
      /* @__PURE__ */ jsxs6("div", { className: "tr-field-l", children: [
        /* @__PURE__ */ jsx6("b", { children: b.name }),
        /* @__PURE__ */ jsxs6("small", { children: [
          "\u5E2E\u4E86\u4ED6 ",
          b.gave,
          " \u6B21 \xB7 \u4ED6\u5E2E\u6211 ",
          b.got,
          " \u6B21"
        ] })
      ] }),
      /* @__PURE__ */ jsx6("span", { className: "tr-tag", style: { color: b.diff > 0 ? "#F2C063" : b.diff < 0 ? "#7EE2A0" : void 0 }, children: b.diff > 0 ? "\u6211\u591A\u4ED8\u51FA" : b.diff < 0 ? "\u6211\u591A\u53D7\u60E0" : "\u6301\u5E73" })
    ] }, b.name)) : /* @__PURE__ */ jsx6("div", { className: "tr-empty", style: { padding: "12px" }, children: "\u8FD8\u6CA1\u6709\u4EBA\u60C5\u5F80\u6765\u8BB0\u5F55" }) }) }),
    /* @__PURE__ */ jsx6(Section, { title: "\u627F\u8BFA\u6784\u6210" }),
    /* @__PURE__ */ jsx6("div", { className: "tr-card", children: /* @__PURE__ */ jsx6("div", { className: "tr-card-b", children: /* @__PURE__ */ jsxs6("div", { className: "tr-sub", children: [
      "\u672A\u95ED\u73AF ",
      iowe + owedme,
      " \u6761\uFF1A\u6211\u8BB8\u7684 ",
      iowe,
      " \xB7 \u6211\u7B49\u7684 ",
      owedme,
      "\uFF1B\u5DF2\u95ED\u73AF ",
      board.closed.filter((p) => p.status === "done").length,
      " \xB7 \u5DF2\u53D6\u6D88 ",
      board.closed.filter((p) => p.status === "cancelled").length
    ] }) }) })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState4 } from "react";
import { Fragment, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [draft, setDraft] = useState4(null);
  const [confirmingClear, setConfirmingClear] = useState4(false);
  if (!data) return /* @__PURE__ */ jsx7("div", { className: "tr-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.settings;
  const d = draft ?? {
    defaultCadenceDays: String(s.defaultCadenceDays),
    driftGraceDays: String(s.driftGraceDays),
    birthdayDays: String(s.birthdayDays),
    dueWarnDays: String(s.dueWarnDays)
  };
  const save = async () => {
    const n = normalizeSettingsLocal({
      defaultCadenceDays: Number(d.defaultCadenceDays),
      driftGraceDays: Number(d.driftGraceDays),
      birthdayDays: Number(d.birthdayDays),
      dueWarnDays: Number(d.dueWarnDays)
    });
    await saveSettings(n);
    setDraft(null);
    await reload();
    showToast("\u8282\u594F\u53C2\u6570\u5DF2\u4FDD\u5B58\uFF08AI \u4E0E\u9762\u677F\u540C\u65F6\u751F\u6548\uFF09", "good");
  };
  const exportJson = async () => {
    try {
      const dump = exportAll2(s, data.peopleBook, data.promisesBook, data.journalBook);
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      showToast(`\u5DF2\u590D\u5236 ${Object.keys(dump.people).length} \u4F4D\u6545\u4EBA + ${Object.keys(dump.promises).length} \u6761\u627F\u8BFA + ${dump.journal.length} \u6761\u5F80\u6765 JSON \u5230\u526A\u8D34\u677F`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const clearAll = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    try {
      for (const k of [K2.settings, K2.people, K2.promises, K2.journal]) await kvDel(k);
      await reload();
      setConfirmingClear(false);
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u6545\u4EBA\u6570\u636E");
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const field = (key, label, sub) => /* @__PURE__ */ jsxs7("div", { className: "tr-field", children: [
    /* @__PURE__ */ jsxs7("div", { className: "tr-field-l", children: [
      /* @__PURE__ */ jsx7("b", { children: label }),
      /* @__PURE__ */ jsx7("small", { children: sub })
    ] }),
    /* @__PURE__ */ jsx7(
      "input",
      {
        className: "tr-num",
        inputMode: "numeric",
        value: d[key],
        onChange: (e) => setDraft({ ...d, [key]: e.target.value })
      }
    )
  ] });
  return /* @__PURE__ */ jsxs7("div", { children: [
    /* @__PURE__ */ jsx7(Section, { title: "\u8054\u7CFB\u8282\u594F", hint: "AI \u4E0E\u9762\u677F\u5171\u7528" }),
    /* @__PURE__ */ jsx7("div", { className: "tr-card", children: /* @__PURE__ */ jsxs7("div", { className: "tr-card-b", style: { padding: 0 }, children: [
      field("defaultCadenceDays", "\u9ED8\u8BA4\u8054\u7CFB\u8282\u594F", "\u6CA1\u5355\u72EC\u8BBE\u8282\u594F\u7684\u4EBA\u6309\u8FD9\u4E2A\u9891\u7387\u63D0\u9192\uFF087..365 \u5929\uFF09"),
      field("driftGraceDays", "\u5931\u8054\u5BBD\u9650", "\u8D85\u51FA\u8282\u594F\u8FD9\u4E48\u591A\u5929\u8FDB\u7EA2\u699C\uFF083..90 \u5929\uFF09\uFF0C\u4E4B\u524D\u662F\u9EC4\u699C"),
      field("birthdayDays", "\u751F\u65E5\u9884\u544A\u7A97\u53E3", "\u63D0\u524D\u8FD9\u4E48\u591A\u5929\u63D0\u9192\u751F\u65E5\uFF081..90 \u5929\uFF09"),
      field("dueWarnDays", "\u627F\u8BFA\u4E34\u671F\u7A97\u53E3", "\u5230\u671F\u524D\u8FD9\u4E48\u591A\u5929\u6807\u9EC4\uFF081..30 \u5929\uFF09"),
      /* @__PURE__ */ jsxs7("div", { className: "tr-field", children: [
        /* @__PURE__ */ jsx7("button", { className: "tr-btn sm", onClick: () => void save(), children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx7("span", { className: "tr-sub", children: "\u751F\u65E5\u4EC5\u652F\u6301\u9633\u5386\uFF08\u519C\u5386\u6682\u4E0D\u652F\u6301\uFF09" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx7(Section, { title: "\u6570\u636E" }),
    /* @__PURE__ */ jsx7("div", { className: "tr-card", children: /* @__PURE__ */ jsxs7("div", { className: "tr-card-b", children: [
      /* @__PURE__ */ jsx7("div", { className: "tr-sub", children: "\u5168\u90E8\u6570\u636E\u5B58\u4E8E\u672C\u673A\uFF08cap.kv tether.*\uFF09\uFF0C\u4E0D\u51FA\u8BBE\u5907\uFF1BAI \u4E0E\u9762\u677F\u8BFB\u5199\u540C\u4E00\u4EFD\u3002" }),
      /* @__PURE__ */ jsxs7("div", { className: "tr-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx7("button", { className: "tr-btn sm ghost", onClick: () => void exportJson(), children: "\u5BFC\u51FA\u5168\u90E8 JSON" }),
        confirmingClear ? /* @__PURE__ */ jsxs7(Fragment, { children: [
          /* @__PURE__ */ jsx7("button", { className: "tr-btn sm danger", onClick: () => void clearAll(), children: "\u786E\u8BA4\u6E05\u7A7A\uFF08\u4E0D\u53EF\u6062\u590D\uFF09" }),
          /* @__PURE__ */ jsx7("button", { className: "tr-btn sm ghost", onClick: () => setConfirmingClear(false), children: "\u7B97\u4E86" })
        ] }) : /* @__PURE__ */ jsx7("button", { className: "tr-btn sm danger", onClick: () => void clearAll(), children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx7(Section, { title: "\u5173\u4E8E" }),
    /* @__PURE__ */ jsx7("div", { className: "tr-card", children: /* @__PURE__ */ jsxs7("div", { className: "tr-card-b tr-sub", children: [
      "\u6545\u4EBA tether v0.1.0 \u2014\u2014 \u4EBA\u8109\u4E0E\u627F\u8BFA\u8D26\u672C\uFF1A\u628A\u300C\u4EBA\u300D\u53D8\u6210\u53EF\u5BF9\u8BDD\u7684\u8D44\u4EA7\u3002",
      /* @__PURE__ */ jsx7("br", {}),
      "\xB7 \u96F6\u540E\u53F0\u670D\u52A1\u3001\u96F6\u7F51\u7EDC\u8BF7\u6C42\uFF1A\u4EBA\u8109\u662F\u6700\u79C1\u4EBA\u7684\u6570\u636E\uFF0C\u4E0D\u51FA\u8BBE\u5907\uFF1B",
      /* @__PURE__ */ jsx7("br", {}),
      "\xB7 \u53CC\u5411\u627F\u8BFA\uFF08\u6211\u8BB8\u7684/\u6211\u7B49\u7684\uFF09+ \u903E\u671F\u7EA2/\u4E34\u671F\u9EC4\uFF0C\u4EBA\u60C5 open loop \u7EC8\u4E8E\u6709\u5730\u65B9\u843D\uFF1B",
      /* @__PURE__ */ jsx7("br", {}),
      "\xB7 \u5931\u8054\u9884\u8B66\u6309\u6BCF\u4EBA\u7684\u8282\u594F\u7B97\uFF08N \u5929\u672A\u8054\u7CFB vs \u8282\u594F M \u5929\uFF09\uFF0C\u4E0D\u662F\u9ED1\u76D2\u5206\u6570\uFF1B",
      /* @__PURE__ */ jsx7("br", {}),
      "\xB7 \u5F80\u6765\u6D41\u6C34\u4E3A\u53CC\u7AEF\u8FFD\u52A0\uFF08\u5C3D\u529B\u800C\u4E3A\uFF09\uFF0C\u6863\u6848/\u627F\u8BFA/\u8BBE\u7F6E\u4E3A\u5355\u5BF9\u8C61\u539F\u5B50\u6362\u5199\uFF1B",
      /* @__PURE__ */ jsx7("br", {}),
      "\xB7 \u684C\u9762\u4E0E\u624B\u673A Web \u7ECF cap.kv \u770B\u5230\u540C\u4E00\u672C\u8D26\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var css = `
.tr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.tr-body::-webkit-scrollbar{width:9px;height:9px}
.tr-body::-webkit-scrollbar-track{background:transparent}
.tr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.tr-page{max-width:520px;margin:0 auto}
.tr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.tr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2DD4BF,#0F766E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.tr-tt{flex:1;min-width:0}
.tr-tt b{font-size:15px;display:block}
.tr-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.tr-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.tr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.tr-tab:hover{color:#E6EAF2}
.tr-tab.on{background:#13272B;color:#7EE8D8;font-weight:600}
.tr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.tr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2DD4BF,#0F766E);flex-shrink:0}
.tr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.tr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.tr-card-b{padding:11px 13px}
.tr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.tr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tr-btn{background:#0F766E;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.tr-btn:hover{filter:brightness(1.15)}
.tr-btn:disabled{opacity:.45;cursor:not-allowed}
.tr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.tr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.tr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.tr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.tr-inp:focus{outline:none;border-color:#0F766E}
.tr-inp::placeholder{color:#4d5566}
.tr-inp.date{color-scheme:dark}
.tr-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.tr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.tr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.tr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.tr-toast.bad{border-color:#54262c;color:#FF8A9A}
.tr-toast.good{border-color:#2b4a35;color:#7EE2A0}
.tr-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.tr-chip:hover{border-color:#3a4356}
.tr-chip.on{background:#13272B;border-color:#0F766E;color:#7EE8D8;font-weight:600}
.tr-avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}
.tr-person{display:flex;align-items:center;gap:10px;padding:9px 13px;border-top:1px solid #1d2330;cursor:pointer}
.tr-person:first-child{border-top:none}
.tr-person:hover{background:#1a2029}
.tr-person-main{flex:1;min-width:0}
.tr-person-main b{font-size:12.5px;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap}
.tr-person-main small{color:#5C6678;font-size:10.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;display:inline-block}
.tr-dot.warn{background:#D29922}
.tr-dot.lost{background:#F85149}
.tr-tag{background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;color:#8B95A7;font-size:10px;padding:1px 6px;flex-shrink:0}
.tr-event{display:flex;gap:9px;padding:7px 2px;border-top:1px solid #1d2330;align-items:flex-start}
.tr-event:first-child{border-top:none}
.tr-event-body{flex:1;min-width:0}
.tr-event-body b{font-size:12px;display:block}
.tr-event-body small{color:#5C6678;font-size:10px}
.tr-kind{background:#1C2330;border-radius:6px;color:#8B95A7;font-size:10px;padding:2px 7px;flex-shrink:0;margin-top:2px}
.tr-kind.favor-gave{color:#F2C063}
.tr-kind.favor-got{color:#7EE2A0}
.tr-promise{display:flex;align-items:center;gap:9px;padding:8px 2px;border-top:1px solid #1d2330}
.tr-promise:first-child{border-top:none}
.tr-promise-main{flex:1;min-width:0}
.tr-promise-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-promise-main small{color:#5C6678;font-size:10.5px}
.tr-due{font-size:10.5px;padding:2px 8px;border-radius:999px;flex-shrink:0;white-space:nowrap}
.tr-due.overdue{background:#3a1d22;color:#FF8A9A}
.tr-due.dueSoon{background:#3a2b14;color:#F2C063}
.tr-due.scheduled{background:#13272B;color:#7EE8D8}
.tr-due.none{background:#1C2330;color:#5C6678}
.tr-dir{font-size:10px;border-radius:6px;padding:1px 6px;flex-shrink:0}
.tr-dir.iowe{background:#3a1d22;color:#FF8A9A}
.tr-dir.owedme{background:#16301f;color:#7EE2A0}
.tr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.tr-field:first-child{border-top:none}
.tr-field-l{flex:1;min-width:0}
.tr-field-l b{font-size:12.5px;display:block}
.tr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.tr-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.tr-detail-head{display:flex;align-items:center;gap:11px;padding:12px 13px}
.tr-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;padding:4px 13px 10px}
.tr-detail-grid div{min-width:0}
.tr-detail-grid span{font-size:10px;color:#5C6678;display:block}
.tr-detail-grid b{font-size:12px;font-weight:600;word-break:break-all}
.tr-back{background:#232834;border:1px solid #2a2f3a;color:#E6EAF2;border-radius:8px;width:30px;height:26px;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0}
.tr-actions{display:flex;gap:6px;flex-wrap:wrap;padding:2px 13px 12px}
.tr-form{border-top:1px solid #1d2330;padding:10px 13px;background:#131820}
.tr-form .tr-row{margin-bottom:6px}
.tr-bars{display:flex;align-items:flex-end;gap:3px;height:88px;padding:6px 2px 0}
.tr-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.tr-barcol i{display:block;width:100%;max-width:16px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#2DD4BF,#0F766E);min-height:2px}
.tr-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.tr-dayhead{display:flex;align-items:center;gap:8px;padding:10px 2px 4px;font-size:10.5px;color:#5C6678}
.tr-dayhead b{color:#8B95A7}
`;
function TetherPanel(_props) {
  const [tab, setTab] = useState5("today");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const [selectedPersonId, setSelectedPersonId] = useState5(null);
  const toastTimer = useRef(null);
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
    const timer = setInterval(poll, 8e3);
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
  const summary = (() => {
    if (!data) return "\u8F7D\u5165\u4E2D\u2026";
    const now = Date.now();
    const board = promiseBoard2(data.promisesBook.byId, data.peopleBook.byId, now, data.settings);
    const drift = driftList2(data.peopleBook.byId, data.journalBook.events, data.settings, now);
    const lost = drift.filter((d) => d.level === "lost").length;
    const warn = drift.filter((d) => d.level === "warn").length;
    const openN = board.overdue.length + board.dueSoon.length + board.scheduled.length + board.openNoDue.length;
    const active = Object.values(data.peopleBook.byId).filter((p) => !p.archivedAt).length;
    return `${active} \u4F4D\u6545\u4EBA \xB7 ${openN} \u6761\u5F85\u95ED\u73AF \xB7 \u9884\u8B66 ${lost ? `${lost} \u7EA2` : ""}${lost && warn ? "+" : ""}${warn ? `${warn} \u9EC4` : ""}${!lost && !warn ? "\u65E0" : ""}`;
  })();
  const tabProps = {
    data,
    reload,
    showToast,
    selectedPersonId,
    setSelectedPersonId,
    setTab
  };
  return /* @__PURE__ */ jsxs8("div", { className: "tr-root", children: [
    /* @__PURE__ */ jsx8("style", { children: css }),
    /* @__PURE__ */ jsxs8("div", { className: "tr-top", children: [
      /* @__PURE__ */ jsx8("div", { className: "tr-logo", children: "\u{1F3EE}" }),
      /* @__PURE__ */ jsxs8("div", { className: "tr-tt", children: [
        /* @__PURE__ */ jsx8("b", { children: "\u6545\u4EBA" }),
        /* @__PURE__ */ jsx8("small", { children: summary })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "tr-tabs", children: [
        ["today", "\u4ECA\u65E5"],
        ["people", "\u6545\u4EBA"],
        ["promises", "\u627F\u8BFA"],
        ["journal", "\u5F80\u6765"],
        ["stats", "\u900F\u89C6"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx8("button", { className: `tr-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx8("div", { className: "tr-body", children: /* @__PURE__ */ jsxs8("div", { className: "tr-page", children: [
      loadErr && /* @__PURE__ */ jsxs8("div", { className: "tr-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "today" && /* @__PURE__ */ jsx8(TodayTab, { ...tabProps }),
      tab === "people" && /* @__PURE__ */ jsx8(PeopleTab, { ...tabProps }),
      tab === "promises" && /* @__PURE__ */ jsx8(PromisesTab, { ...tabProps }),
      tab === "journal" && /* @__PURE__ */ jsx8(JournalTab, { ...tabProps }),
      tab === "stats" && /* @__PURE__ */ jsx8(StatsTab, { ...tabProps }),
      tab === "settings" && /* @__PURE__ */ jsx8(SettingsTab, { ...tabProps })
    ] }) }),
    toast && /* @__PURE__ */ jsx8("div", { className: `tr-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
function TetherEntry(props) {
  return /* @__PURE__ */ jsx9(TetherPanel, { ...props });
}
export {
  TetherEntry as default
};
