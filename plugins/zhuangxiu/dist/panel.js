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
    var DAY_MS = 864e5;
    var MAX_AMOUNT = 1e9;
    function dayKey2(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseDayKey2(s) {
      if (typeof s !== "string") return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      const y = +m[1], mo = +m[2], d = +m[3];
      if (mo < 1 || mo > 12 || d < 1) return null;
      const dim = new Date(y, mo, 0).getDate();
      if (d > dim) return null;
      return new Date(y, mo - 1, d).getTime();
    }
    function dayMinTs(date, minutes) {
      const base = parseDayKey2(date);
      if (base === null) return null;
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return null;
      return base + minutes * 6e4;
    }
    function parseTimeHM(s) {
      if (s === void 0 || s === null || s === "") return 720;
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
      if (!m) return null;
      const h = +m[1], mi = +m[2];
      if (h > 23 || mi > 59) return null;
      return h * 60 + mi;
    }
    function fmtTime(ts) {
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    function fmtDT(ts) {
      return `${dayKey2(ts)} ${fmtTime(ts)}`;
    }
    function fmtMoney6(n) {
      const v = Math.round(n * 100) / 100;
      const [int, dec] = String(v).split(".");
      const s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return dec ? `${s}.${dec}` : s;
    }
    function round2(n) {
      return Math.round(n * 100) / 100;
    }
    function clip(s, n) {
      if (s === void 0 || s === null) return "";
      return String(s).trim().slice(0, n);
    }
    function id4(prefix) {
      return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }
    var GROUPS3 = ["\u524D\u671F", "\u62C6\u6539", "\u6C34\u7535", "\u6CE5\u74E6", "\u6728\u5DE5", "\u6CB9\u6F06", "\u4E3B\u6750", "\u5BB6\u5177\u5BB6\u7535", "\u8F6F\u88C5", "\u5176\u4ED6"];
    var TEMPLATE3 = [
      { name: "\u8BBE\u8BA1\u8D39", group: "\u524D\u671F" },
      { name: "\u76D1\u7406\u8D39", group: "\u524D\u671F" },
      { name: "\u7269\u4E1A\u62BC\u91D1\u4E0E\u7BA1\u7406\u8D39", group: "\u524D\u671F" },
      { name: "\u62C6\u9664\u6539\u9020", group: "\u62C6\u6539" },
      { name: "\u5783\u573E\u6E05\u8FD0", group: "\u62C6\u6539" },
      { name: "\u5305\u7ACB\u7BA1", group: "\u62C6\u6539" },
      { name: "\u6C34\u7535\u6539\u9020", group: "\u6C34\u7535" },
      { name: "\u5F00\u5173\u63D2\u5EA7\u9762\u677F", group: "\u6C34\u7535" },
      { name: "\u5F31\u7535\u7F51\u7EDC\u5E03\u7EBF", group: "\u6C34\u7535" },
      { name: "\u74F7\u7816", group: "\u6CE5\u74E6" },
      { name: "\u74E6\u5DE5\u4EBA\u5DE5", group: "\u6CE5\u74E6" },
      { name: "\u9632\u6C34", group: "\u6CE5\u74E6" },
      { name: "\u8FC7\u95E8\u77F3\u6321\u6C34\u6761", group: "\u6CE5\u74E6" },
      { name: "\u7F8E\u7F1D", group: "\u6CE5\u74E6" },
      { name: "\u540A\u9876", group: "\u6728\u5DE5" },
      { name: "\u5B9A\u5236\u67DC\u4F53", group: "\u6728\u5DE5" },
      { name: "\u6728\u95E8\u95E8\u5957\u7A97\u5957", group: "\u6728\u5DE5" },
      { name: "\u5899\u9762\u57FA\u5C42\u5904\u7406", group: "\u6CB9\u6F06" },
      { name: "\u4E73\u80F6\u6F06", group: "\u6CB9\u6F06" },
      { name: "\u58C1\u7EB8\u58C1\u5E03", group: "\u6CB9\u6F06" },
      { name: "\u5730\u677F", group: "\u4E3B\u6750" },
      { name: "\u536B\u6D74\u6D01\u5177", group: "\u4E3B\u6750" },
      { name: "\u6A71\u67DC", group: "\u4E3B\u6750" },
      { name: "\u706F\u5177", group: "\u4E3B\u6750" },
      { name: "\u5BB6\u5177", group: "\u5BB6\u5177\u5BB6\u7535" },
      { name: "\u5BB6\u7535", group: "\u5BB6\u5177\u5BB6\u7535" },
      { name: "\u7A97\u5E18\u5E03\u827A", group: "\u8F6F\u88C5" },
      { name: "\u8F6F\u88C5\u9970\u54C1", group: "\u8F6F\u88C5" },
      { name: "\u5F00\u8352\u4FDD\u6D01", group: "\u5176\u4ED6" },
      { name: "\u5176\u4ED6\u6742\u9879", group: "\u5176\u4ED6" }
    ];
    var COMMON_MISS = ["\u5783\u573E\u6E05\u8FD0", "\u5305\u7ACB\u7BA1", "\u9632\u6C34", "\u8FC7\u95E8\u77F3\u6321\u6C34\u6761", "\u7F8E\u7F1D", "\u7269\u4E1A\u62BC\u91D1\u4E0E\u7BA1\u7406\u8D39", "\u5F00\u8352\u4FDD\u6D01"];
    function normalizeProject2(input, existing) {
      const now = Date.now();
      const name = clip(input.name !== void 0 ? input.name : existing && existing.name || "", 40);
      if (!name) return { error: "\u9879\u76EE\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
      let totalBudget;
      if (input.totalBudget !== void 0) {
        if (input.totalBudget === null || input.totalBudget === "") totalBudget = void 0;
        else {
          const n = Number(input.totalBudget);
          if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `\u603B\u9884\u7B97\u9700\u5728 0-${fmtMoney6(MAX_AMOUNT)} \u5143\u4E4B\u95F4` };
          totalBudget = round2(n);
        }
      } else totalBudget = existing ? existing.totalBudget : void 0;
      const status = ["planning", "active", "done"].includes(input.status) ? input.status : existing && existing.status || "active";
      let startDate;
      if (input.startDate !== void 0) {
        if (input.startDate === null || input.startDate === "") startDate = void 0;
        else if (parseDayKey2(input.startDate) === null) return { error: `\u5F00\u59CB\u65E5\u671F ${JSON.stringify(input.startDate)} \u65E0\u6CD5\u8BC6\u522B\uFF08\u9700 YYYY-MM-DD\uFF09` };
        else startDate = input.startDate;
      } else startDate = existing ? existing.startDate : void 0;
      return {
        project: {
          id: existing && existing.id || id4("p"),
          name,
          house: input.house !== void 0 ? clip(input.house, 60) : existing && existing.house || "",
          totalBudget,
          status,
          startDate,
          createdAt: existing && existing.createdAt || now,
          updatedAt: now
        }
      };
    }
    function normalizeCategory2(input, existing) {
      const now = Date.now();
      const name = clip(input.name !== void 0 ? input.name : existing && existing.name || "", 40);
      if (!name) return { error: "\u79D1\u76EE\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
      let budget = existing ? existing.budget : void 0;
      if (input.budget !== void 0) {
        if (input.budget === null || input.budget === "") budget = void 0;
        else {
          const n = Number(input.budget);
          if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `\u79D1\u76EE\u9884\u7B97\u9700\u5728 0-${fmtMoney6(MAX_AMOUNT)} \u5143\u4E4B\u95F4` };
          budget = round2(n);
        }
      }
      const group = input.group !== void 0 ? clip(input.group, 10) : existing && existing.group || "\u5176\u4ED6";
      if (!GROUPS3.includes(group)) return { error: `\u79D1\u76EE\u5206\u7EC4\u987B\u4E3A ${GROUPS3.join("/")} \u4E4B\u4E00` };
      const isExtra = input.isExtra !== void 0 ? !!input.isExtra : !!(existing && existing.isExtra);
      if (isExtra && existing && !existing.isExtra) return { error: "\u666E\u901A\u79D1\u76EE\u4E0D\u80FD\u6539\u4E3A\u589E\u9879\u79D1\u76EE\uFF08\u589E\u9879\u79D1\u76EE\u53EA\u80FD\u65B0\u5EFA\uFF09" };
      const order = Number.isFinite(+input.order) ? +input.order : existing && existing.order || 999;
      return {
        cat: {
          id: existing && existing.id || id4("c"),
          name,
          group,
          budget,
          isExtra,
          order,
          note: input.note !== void 0 ? clip(input.note, 100) : existing && existing.note || "",
          createdAt: existing && existing.createdAt || now,
          updatedAt: now
        }
      };
    }
    function resolveCatName(name, cats) {
      const q = clip(name, 40);
      if (!q) return { error: "\u9700\u63D0\u4F9B\u79D1\u76EE\u540D\u79F0\uFF08categoryName\uFF09\u6216\u79D1\u76EE id\uFF08catId\uFF09" };
      const exact = cats.filter((c) => c.name === q);
      if (exact.length === 1) return { cat: exact[0] };
      if (exact.length > 1) return { error: `\u79D1\u76EE\u540D\u79F0\u300C${q}\u300D\u91CD\u590D\uFF08\u8BF7\u7528 catId \u6307\u5B9A\u6216\u5148\u5408\u5E76\u79D1\u76EE\uFF09` };
      const part = cats.filter((c) => c.name.includes(q) || q.includes(c.name));
      if (part.length === 1) return { cat: part[0] };
      if (part.length > 1) return { error: `\u79D1\u76EE\u300C${q}\u300D\u6709\u591A\u4E2A\u5019\u9009\uFF1A${part.map((c) => c.name).join("\u3001")}\u2014\u2014\u8BF7\u7528\u5168\u540D\u6216 catId` };
      return { error: `\u9884\u7B97\u5355\u91CC\u6CA1\u6709\u300C${q}\u300D\u79D1\u76EE\u3002\u82E5\u8FD9\u662F\u62A5\u4EF7\u5355\u5916\u7684\u65B0\u589E\u9879\u76EE\uFF08\u589E\u9879\uFF09\uFF0C\u5148 zx_category action=add \u5E76 isExtra:true \u5EFA\u79D1\u76EE\uFF0C\u6216\u672C\u5DE5\u5177\u76F4\u63A5 asExtra:true` };
    }
    function normalizeVendor2(input, existing) {
      const now = Date.now();
      const name = clip(input.name !== void 0 ? input.name : existing && existing.name || "", 40);
      if (!name) return { error: "\u4F9B\u5E94\u5546\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
      let contractAmount = existing ? existing.contractAmount : void 0;
      if (input.contractAmount !== void 0) {
        if (input.contractAmount === null || input.contractAmount === "") contractAmount = void 0;
        else {
          const n = Number(input.contractAmount);
          if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `\u5408\u540C\u989D\u9700\u5728 0-${fmtMoney6(MAX_AMOUNT)} \u5143\u4E4B\u95F4` };
          contractAmount = round2(n);
        }
      }
      return {
        vendor: {
          id: existing && existing.id || id4("v"),
          name,
          role: input.role !== void 0 ? clip(input.role, 30) : existing && existing.role || "",
          phone: input.phone !== void 0 ? clip(input.phone, 30) : existing && existing.phone || "",
          contractAmount,
          note: input.note !== void 0 ? clip(input.note, 200) : existing && existing.note || "",
          createdAt: existing && existing.createdAt || now,
          updatedAt: now
        }
      };
    }
    function normalizeMilestone2(input, existing) {
      const now = Date.now();
      const title = clip(input.title !== void 0 ? input.title : existing && existing.title || "", 60);
      if (!title) return { error: "\u8282\u70B9\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A" };
      const date = input.date !== void 0 ? input.date : existing && existing.date;
      if (parseDayKey2(date) === null) return { error: `\u8282\u70B9\u65E5\u671F ${JSON.stringify(date)} \u65E0\u6CD5\u8BC6\u522B\uFF08\u9700 YYYY-MM-DD\uFF09` };
      const done = input.done !== void 0 ? !!input.done : !!(existing && existing.done);
      return {
        mile: {
          id: existing && existing.id || id4("m"),
          title,
          date,
          done,
          note: input.note !== void 0 ? clip(input.note, 200) : existing && existing.note || "",
          createdAt: existing && existing.createdAt || now,
          updatedAt: now
        }
      };
    }
    function milestoneLevel4(mile, now) {
      if (mile.done) return { level: "green", daysLeft: null };
      const t = parseDayKey2(mile.date);
      if (t === null) return { level: "gray", daysLeft: null };
      const today = parseDayKey2(dayKey2(now === void 0 ? Date.now() : now));
      const daysLeft = Math.round((t - today) / DAY_MS);
      if (daysLeft < 0) return { level: "red", daysLeft };
      if (daysLeft <= 3) return { level: "yellow", daysLeft };
      return { level: "green", daysLeft };
    }
    function normalizeExpense2(input, existing) {
      const now = Date.now();
      const catId = clip(input.catId !== void 0 ? input.catId : existing && existing.catId || "", 64);
      if (!catId) return { error: "\u652F\u51FA\u5FC5\u987B\u5F52\u5C5E\u4E00\u4E2A\u79D1\u76EE\uFF08catId\uFF09" };
      let amount = existing ? existing.amount : void 0;
      if (input.amount !== void 0) {
        const n = Number(input.amount);
        if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return { error: `\u91D1\u989D\u9700\u5728 0 \u4E0E ${fmtMoney6(MAX_AMOUNT)} \u5143\u4E4B\u95F4\uFF08\u4E0D\u542B 0\uFF09` };
        amount = round2(n);
      }
      if (!Number.isFinite(amount)) return { error: "\u91D1\u989D\u7F3A\u5931\u6216\u975E\u6CD5" };
      let ts = existing ? existing.ts : void 0;
      if (input.ts !== void 0 && (input.date === void 0 && input.time === void 0)) {
        const n = Number(input.ts);
        if (!Number.isFinite(n) || n <= 0) return { error: "ts \u9700\u4E3A\u6BEB\u79D2\u65F6\u95F4\u6233" };
        ts = n;
      } else if (input.date !== void 0 || input.time !== void 0 || !existing) {
        const date = input.date !== void 0 ? input.date : existing ? dayKeyOfTs3(existing.ts) : dayKey2(now);
        const minutes = parseTimeHM(input.time !== void 0 ? input.time : existing ? fmtTime(existing.ts) : void 0);
        if (parseDayKey2(date) === null) return { error: `\u65E5\u671F ${JSON.stringify(date)} \u65E0\u6CD5\u8BC6\u522B\uFF08\u9700 YYYY-MM-DD\uFF09` };
        if (minutes === null) return { error: `\u65F6\u95F4 ${JSON.stringify(input.time)} \u65E0\u6CD5\u8BC6\u522B\uFF08\u9700 HH:MM\uFF09` };
        const t = dayMinTs(date, minutes);
        if (t === null) return { error: "\u65E5\u671F\u6216\u65F6\u95F4\u975E\u6CD5" };
        ts = t;
      }
      if (!Number.isFinite(ts)) return { error: "\u65F6\u95F4\u7F3A\u5931\u6216\u975E\u6CD5" };
      return {
        expense: {
          id: existing && existing.id || id4("e"),
          catId,
          amount,
          ts,
          vendorId: input.vendorId !== void 0 ? input.vendorId ? clip(input.vendorId, 64) : "" : existing && existing.vendorId || "",
          payMethod: input.payMethod !== void 0 ? clip(input.payMethod, 20) : existing && existing.payMethod || "",
          note: input.note !== void 0 ? clip(input.note, 200) : existing && existing.note || "",
          src: input.src === "ai" ? "ai" : "panel",
          createdAt: existing && existing.createdAt || now,
          updatedAt: now
        }
      };
    }
    function dayKeyOfTs3(ts) {
      return dayKey2(ts);
    }
    function budgetCompare4(cats, expenses, totalBudget) {
      const spentByCat = /* @__PURE__ */ new Map();
      for (const e of expenses) spentByCat.set(e.catId, (spentByCat.get(e.catId) || 0) + e.amount);
      const rows = cats.map((cat) => {
        const spent = round2(spentByCat.get(cat.id) || 0);
        const b = cat.budget;
        let level2 = "green";
        let pct = null;
        if (b === void 0 || b === null) level2 = "gray";
        else {
          pct = b > 0 ? Math.round(spent / b * 100) : spent > 0 ? null : 0;
          if (spent > b) level2 = "red";
          else if (b > 0 && spent >= b * 0.9) level2 = "yellow";
          else if (b === 0 && spent > 0) level2 = "red";
        }
        return { cat, spent, budget: b === void 0 ? null : b, level: level2, pct };
      });
      const catBudgetTotal = round2(cats.reduce((s, c) => s + (c.budget || 0), 0));
      const budgetTotal = totalBudget !== void 0 && totalBudget !== null ? totalBudget : catBudgetTotal;
      const spentTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
      const extraCats = new Set(cats.filter((c) => c.isExtra).map((c) => c.id));
      let extraSpent = 0;
      let extraCount = 0;
      for (const e of expenses) {
        if (extraCats.has(e.catId)) {
          extraSpent += e.amount;
          extraCount += 1;
        }
      }
      const level = budgetTotal > 0 && spentTotal > budgetTotal ? "red" : budgetTotal > 0 && spentTotal >= budgetTotal * 0.9 ? "yellow" : "green";
      return {
        rows,
        totals: {
          budgetTotal,
          catBudgetTotal,
          spentTotal: round2(spentTotal),
          remainTotal: round2(budgetTotal - spentTotal),
          pct: budgetTotal > 0 ? Math.round(spentTotal / budgetTotal * 100) : null,
          level
        },
        extraSpent: round2(extraSpent),
        extraCount
      };
    }
    function missingCheck2(cats) {
      const names = new Set(cats.map((c) => c.name));
      return COMMON_MISS.filter((n) => !names.has(n));
    }
    function buildSummary2({ project, cats, expenses, vendors, milestones }, now) {
      const cmp = budgetCompare4(cats, expenses, project && project.totalBudget);
      const L = [];
      L.push(`# \u88C5\u4FEE\u5BF9\u8D26\u5C0F\u7ED3\uFF08${project ? project.name : "\u672A\u547D\u540D\u9879\u76EE"}\uFF09`);
      L.push("");
      L.push(`> \u751F\u6210\u65F6\u95F4\uFF1A${fmtDT(now === void 0 ? Date.now() : now)} \xB7 \u6570\u636E\u4EC5\u5B58\u672C\u673A \xB7 \u7528\u4E8E\u5BB6\u5EAD\u81EA\u67E5\uFF0C\u4E0D\u6784\u6210\u9020\u4EF7/\u6CD5\u5F8B\u5EFA\u8BAE`);
      L.push("");
      L.push("## \u9884\u7B97\u6267\u884C\u603B\u89C8");
      L.push("");
      L.push(`- \u603B\u9884\u7B97\uFF1A${cmp.totals.budgetTotal > 0 ? `${fmtMoney6(cmp.totals.budgetTotal)} \u5143` : "\u672A\u8BBE\u5B9A"}${project && project.totalBudget !== void 0 && project.totalBudget !== null && cmp.totals.catBudgetTotal !== project.totalBudget ? `\uFF08\u79D1\u76EE\u9884\u7B97\u5408\u8BA1 ${fmtMoney6(cmp.totals.catBudgetTotal)} \u5143\uFF09` : ""}`);
      L.push(`- \u5DF2\u652F\u51FA\uFF1A${fmtMoney6(cmp.totals.spentTotal)} \u5143\uFF08${cmp.totals.pct !== null ? `${cmp.totals.pct}%` : "\u65E0\u9884\u7B97\u57FA\u6570"}\uFF09`);
      L.push(`- \u5269\u4F59\uFF1A${fmtMoney6(cmp.totals.remainTotal)} \u5143${cmp.totals.level === "red" ? " \xB7 **\u5DF2\u8D85\u652F**" : cmp.totals.level === "yellow" ? " \xB7 \u903C\u8FD1\u9884\u7B97\uFF08\u226590%\uFF09" : ""}`);
      if (cmp.extraSpent > 0) L.push(`- \u589E\u9879\u5408\u8BA1\uFF1A**${fmtMoney6(cmp.extraSpent)} \u5143**\uFF08${cmp.extraCount} \u7B14\uFF0C\u62A5\u4EF7\u5355\u5916\u65B0\u589E\uFF09`);
      L.push("");
      L.push("## \u5206\u79D1\u76EE\u660E\u7EC6");
      L.push("");
      L.push("| \u79D1\u76EE | \u7EC4 | \u9884\u7B97 | \u5DF2\u82B1 | \u8FDB\u5EA6 | \u72B6\u6001 |");
      L.push("|---|---|---:|---:|---:|---|");
      const sorted = [...cmp.rows].sort((a, b) => {
        const g = (c) => GROUPS3.indexOf(c.cat.group);
        return g(a) - g(b) || a.cat.order - b.cat.order;
      });
      for (const r of sorted) {
        const state = r.level === "red" ? "**\u8D85\u652F**" : r.level === "yellow" ? "\u4E34\u8D85(\u226590%)" : r.level === "gray" ? "\u672A\u5B9A\u9884\u7B97" : "\u6B63\u5E38";
        L.push(`| ${r.cat.name}${r.cat.isExtra ? "\uFF08\u589E\uFF09" : ""} | ${r.cat.group} | ${r.budget !== null ? fmtMoney6(r.budget) : "\u2014"} | ${fmtMoney6(r.spent)} | ${r.pct !== null ? `${r.pct}%` : "\u2014"} | ${state} |`);
      }
      const overRows = cmp.rows.filter((r) => r.level === "red");
      if (overRows.length) {
        L.push("");
        L.push("## \u8D85\u652F\u79D1\u76EE");
        L.push("");
        for (const r of overRows) L.push(`- **${r.cat.name}**\uFF1A\u9884\u7B97 ${r.budget !== null ? fmtMoney6(r.budget) : "\u672A\u5B9A"}\uFF0C\u5DF2\u82B1 ${fmtMoney6(r.spent)}${r.budget ? `\uFF08\u8D85 ${fmtMoney6(r.spent - r.budget)} \u5143\uFF09` : ""}`);
      }
      const miss = missingCheck2(cats);
      if (miss.length) {
        L.push("");
        L.push("## \u5E38\u89C1\u6F0F\u9879\u63D0\u9192");
        L.push("");
        L.push(`\u4F60\u7684\u9884\u7B97\u5355\u8FD8\u6CA1\u6709\u8FD9\u4E9B\u300C\u62A5\u4EF7\u5355\u6700\u7231\u6F0F\u6389\u300D\u7684\u79D1\u76EE\uFF1A**${miss.join("\u3001")}**\u3002\u88C5\u4FEE\u516C\u53F8\u6F0F\u62A5 = \u540E\u671F\u589E\u9879\uFF0C\u5EFA\u8BAE\u5148\u786E\u8BA4\u662F\u5426\u9700\u8981\uFF0C\u9700\u8981\u5C31\u8865\u8FDB\u9884\u7B97\u3002`);
      }
      if (vendors.length) {
        L.push("");
        L.push("## \u4F9B\u5E94\u5546\u4E0E\u4ED8\u6B3E");
        L.push("");
        L.push("| \u4F9B\u5E94\u5546 | \u89D2\u8272 | \u5408\u540C\u989D | \u5DF2\u4ED8 | \u7B14\u6570 |");
        L.push("|---|---|---:|---:|---:|");
        for (const v of vendors) {
          const mine = expenses.filter((e) => e.vendorId === v.id);
          const paid = round2(mine.reduce((s, e) => s + e.amount, 0));
          L.push(`| ${v.name}${v.phone ? `\uFF08${v.phone}\uFF09` : ""} | ${v.role || "\u2014"} | ${v.contractAmount !== void 0 ? fmtMoney6(v.contractAmount) : "\u2014"} | ${fmtMoney6(paid)} | ${mine.length} |`);
        }
      }
      if (milestones.length) {
        L.push("");
        L.push("## \u5DE5\u671F\u8282\u70B9");
        L.push("");
        for (const m of [...milestones].sort((a, b) => parseDayKey2(a.date) - parseDayKey2(b.date))) {
          const lv = milestoneLevel4(m, now);
          const tag = lv.level === "red" ? "\u5DF2\u903E\u671F" : lv.level === "yellow" ? `\u8FD8\u5269 ${lv.daysLeft} \u5929` : m.done ? "\u5DF2\u5B8C\u6210" : "\u672A\u5230";
          L.push(`- ${m.date} ${m.title}\uFF08${tag}\uFF09`);
        }
      }
      return L.join("\n");
    }
    module.exports = {
      DAY_MS,
      MAX_AMOUNT,
      GROUPS: GROUPS3,
      TEMPLATE: TEMPLATE3,
      COMMON_MISS,
      dayKey: dayKey2,
      parseDayKey: parseDayKey2,
      dayMinTs,
      parseTimeHM,
      fmtTime,
      fmtDT,
      fmtMoney: fmtMoney6,
      round2,
      clip,
      id4,
      normalizeProject: normalizeProject2,
      normalizeCategory: normalizeCategory2,
      resolveCatName,
      normalizeVendor: normalizeVendor2,
      normalizeMilestone: normalizeMilestone2,
      milestoneLevel: milestoneLevel4,
      normalizeExpense: normalizeExpense2,
      dayKeyOfTs: dayKeyOfTs3,
      budgetCompare: budgetCompare4,
      missingCheck: missingCheck2,
      buildSummary: buildSummary2
    };
  }
});

// src/Panel.tsx
var core6 = __toESM(require_core());
import { useCallback, useEffect, useRef, useState as useState5 } from "react";

// src/model.ts
var core = __toESM(require_core());

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", {
    req: { target, payload }
  });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r && r.value !== void 0 ? r.value : null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r && Array.isArray(r.keys) ? r.keys : [];
}

// src/model.ts
var PREFIX = "zhuangxiu.";
var K = {
  project: `${PREFIX}project`,
  cat: (id) => `${PREFIX}cat.${id}`,
  catPrefix: `${PREFIX}cat.`,
  exp: (id) => `${PREFIX}exp.${id}`,
  expPrefix: `${PREFIX}exp.`,
  ven: (id) => `${PREFIX}ven.${id}`,
  venPrefix: `${PREFIX}ven.`,
  mile: (id) => `${PREFIX}mile.${id}`,
  milePrefix: `${PREFIX}mile.`
};
function newCache() {
  return { knownKeys: null, fullAt: 0, val: { project: null, map: /* @__PURE__ */ new Map() } };
}
var FULL_REFRESH_MS = 90 * 1e3;
async function loadZx(cache) {
  const keys = await kvKeys();
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.val.map.clear();
    cache.val.project = null;
    cache.fullAt = now;
  }
  const keySet = new Set(keys);
  for (const k of [...cache.val.map.keys()]) if (!keySet.has(k)) cache.val.map.delete(k);
  if (cache.val.project && !keySet.has(K.project)) cache.val.project = null;
  const prefixes = [K.catPrefix, K.expPrefix, K.venPrefix, K.milePrefix];
  const todo = keys.filter((k) => prefixes.some((p) => k.startsWith(p)) && (full || !cache.val.map.has(k)));
  if (todo.length) {
    const vals = await Promise.all(todo.map(async (k) => ({ k, v: await kvGet(k).catch(() => null) })));
    for (const { k, v } of vals) {
      if (v && typeof v === "object" && v.id) cache.val.map.set(k, v);
      else cache.val.map.delete(k);
    }
  }
  if (full || cache.val.project === null) {
    if (keySet.has(K.project)) {
      const p = await kvGet(K.project).catch(() => null);
      if (p && typeof p === "object" && p.id) cache.val.project = p;
    }
  }
  cache.knownKeys = keySet;
  const cats = [];
  const exps = [];
  const vens = [];
  const miles = [];
  for (const [k, v] of cache.val.map) {
    if (k.startsWith(K.catPrefix)) cats.push(v);
    else if (k.startsWith(K.expPrefix)) exps.push(v);
    else if (k.startsWith(K.venPrefix)) vens.push(v);
    else if (k.startsWith(K.milePrefix)) miles.push(v);
  }
  cats.sort((a, b) => core.GROUPS.indexOf(a.group) - core.GROUPS.indexOf(b.group) || a.order - b.order || a.createdAt - b.createdAt);
  exps.sort((a, b) => a.ts - b.ts);
  vens.sort((a, b) => a.createdAt - b.createdAt);
  miles.sort((a, b) => (core.parseDayKey(a.date) || 0) - (core.parseDayKey(b.date) || 0));
  return { project: cache.val.project, cats, exps, vens, miles, at: now };
}
async function saveProject(input, existing) {
  const r = core.normalizeProject(input, existing);
  if (r.error || !r.project) throw new Error(r.error || "\u9879\u76EE\u6863\u6848\u975E\u6CD5");
  await kvSet(K.project, r.project);
  return r.project;
}
async function saveCategory(input, existing) {
  const r = core.normalizeCategory(input, existing);
  if (r.error || !r.cat) throw new Error(r.error || "\u79D1\u76EE\u975E\u6CD5");
  await kvSet(K.cat(r.cat.id), r.cat);
  return r.cat;
}
async function saveVendor(input, existing) {
  const r = core.normalizeVendor(input, existing);
  if (r.error || !r.vendor) throw new Error(r.error || "\u4F9B\u5E94\u5546\u975E\u6CD5");
  await kvSet(K.ven(r.vendor.id), r.vendor);
  return r.vendor;
}
async function saveMilestone(input, existing) {
  const r = core.normalizeMilestone(input, existing);
  if (r.error || !r.mile) throw new Error(r.error || "\u8282\u70B9\u975E\u6CD5");
  await kvSet(K.mile(r.mile.id), r.mile);
  return r.mile;
}
async function saveExpense(input, existing) {
  const r = core.normalizeExpense({ ...input, src: "panel" }, existing);
  if (r.error || !r.expense) throw new Error(r.error || "\u652F\u51FA\u975E\u6CD5");
  await kvSet(K.exp(r.expense.id), r.expense);
  return r.expense;
}
async function deleteKey(key) {
  await kvDel(key);
}
async function applyTemplate(existing) {
  const have = new Set(existing.map((c) => c.name));
  let created = 0;
  let order = existing.length;
  for (const item of core.TEMPLATE) {
    if (have.has(item.name)) continue;
    const r = core.normalizeCategory({ name: item.name, group: item.group, order: order++ }, null);
    if (r.error || !r.cat) continue;
    await kvSet(K.cat(r.cat.id), r.cat);
    created += 1;
  }
  return created;
}
function exportAll(data) {
  return JSON.stringify({
    app: "zhuangxiu",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    project: data.project,
    cats: data.cats,
    exps: data.exps,
    vens: data.vens,
    miles: data.miles
  }, null, 2);
}

// src/OverviewTab.tsx
var core2 = __toESM(require_core());
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function OverviewTab({ data, reload, showToast }) {
  const [fixing, setFixing] = useState(false);
  if (!data) return /* @__PURE__ */ jsx("div", { className: "zx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const cmp = core2.budgetCompare(data.cats, data.exps, data.project?.totalBudget);
  const t = cmp.totals;
  const miss = core2.missingCheck(data.cats);
  const todoMiles = data.miles.filter((m) => !m.done).map((m) => ({ m, lv: core2.milestoneLevel(m) })).filter((x) => x.lv.level === "red" || x.lv.level === "yellow").sort((a, b) => (a.lv.level === "red" ? 0 : 1) - (b.lv.level === "red" ? 0 : 1) || a.m.date.localeCompare(b.m.date)).slice(0, 4);
  const recent = [...data.exps].slice(-5).reverse();
  const catById = new Map(data.cats.map((c) => [c.id, c]));
  const pctCls = t.level === "red" ? "red" : t.level === "yellow" ? "yellow" : "green";
  const pct = t.pct !== null ? Math.min(t.pct, 100) : 0;
  async function fixMissing() {
    setFixing(true);
    try {
      let n = 0;
      for (const name of miss) {
        const tpl = core2.TEMPLATE.find((x) => x.name === name);
        await saveCategory({ name, group: tpl ? tpl.group : "\u5176\u4ED6", order: data.cats.length + n }, null);
        n += 1;
      }
      showToast(`\u5DF2\u8865 ${n} \u4E2A\u6F0F\u9879\u79D1\u76EE\uFF08\u9884\u7B97\u5F85\u5F55\uFF09`);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setFixing(false);
    }
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "zx-bar-ic" }),
      "\u9884\u7B97\u6267\u884C",
      /* @__PURE__ */ jsx("span", { className: "zx-hint", children: "\u53E3\u5F84\uFF1Acore.budgetCompare" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "zx-card", children: /* @__PURE__ */ jsxs("div", { className: "zx-hero", children: [
      /* @__PURE__ */ jsxs("div", { className: "zx-row", children: [
        /* @__PURE__ */ jsxs("span", { className: "big zx-money", children: [
          "\xA5",
          core2.fmtMoney(t.spentTotal)
        ] }),
        /* @__PURE__ */ jsx("span", { className: "zx-grow" }),
        t.pct !== null && /* @__PURE__ */ jsxs("span", { className: `zx-tag ${t.level === "red" ? "red" : t.level === "yellow" ? "yellow" : "green"}`, children: [
          t.pct,
          "%",
          t.level === "red" ? " \xB7 \u5DF2\u8D85\u652F" : t.level === "yellow" ? " \xB7 \u4E34\u8D85" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "zx-progress", style: { marginTop: 8 }, children: /* @__PURE__ */ jsx("i", { className: pctCls, style: { width: `${pct}%` } }) }),
      /* @__PURE__ */ jsxs("div", { className: "zx-kv", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "\u603B\u9884\u7B97\uFF1A",
          t.budgetTotal > 0 ? `\xA5${core2.fmtMoney(t.budgetTotal)}` : "\u672A\u8BBE\u5B9A"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5269\u4F59\uFF1A\xA5",
          core2.fmtMoney(t.remainTotal)
        ] }),
        t.budgetTotal > 0 && t.catBudgetTotal !== t.budgetTotal && /* @__PURE__ */ jsxs("span", { children: [
          "\u79D1\u76EE\u5408\u8BA1 \xA5",
          core2.fmtMoney(t.catBudgetTotal)
        ] })
      ] }),
      cmp.extraSpent > 0 && /* @__PURE__ */ jsxs("div", { className: "zx-kv", style: { color: "#E3B341" }, children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "\u589E\u9879\u5408\u8BA1\uFF08\u62A5\u4EF7\u5355\u5916\uFF09\uFF1A\xA5",
          core2.fmtMoney(cmp.extraSpent)
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          cmp.extraCount,
          " \u7B14"
        ] })
      ] })
    ] }) }),
    todoMiles.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "zx-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "zx-bar-ic" }),
        "\u8282\u70B9\u7EA2\u9EC4\u699C",
        /* @__PURE__ */ jsx("span", { className: "zx-hint", children: "\u903E\u671F\u7EA2 \xB7 3 \u5929\u5185\u9EC4" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "zx-card", children: todoMiles.map(({ m, lv }) => /* @__PURE__ */ jsx("div", { className: "zx-item", children: /* @__PURE__ */ jsxs("div", { className: "zx-item-t", children: [
        /* @__PURE__ */ jsx("span", { className: `zx-tag ${lv.level}`, children: lv.level === "red" ? `\u903E\u671F ${-(lv.daysLeft || 0)} \u5929` : `\u8FD8\u5269 ${lv.daysLeft} \u5929` }),
        /* @__PURE__ */ jsx("b", { children: m.title }),
        /* @__PURE__ */ jsx("span", { className: "zx-grow" }),
        /* @__PURE__ */ jsx("span", { className: "zx-sub", children: m.date })
      ] }) }, m.id)) })
    ] }),
    miss.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "zx-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "zx-bar-ic" }),
        "\u5E38\u89C1\u6F0F\u9879\u68C0\u67E5"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "zx-card", children: /* @__PURE__ */ jsxs("div", { className: "zx-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "zx-sub", children: [
          "\u9884\u7B97\u5355\u8FD8\u6CA1\u6709\u8FD9\u4E9B\u300C\u62A5\u4EF7\u5355\u6700\u7231\u6F0F\u6389\u300D\u7684\u79D1\u76EE\uFF1A",
          /* @__PURE__ */ jsx("b", { style: { color: "#E6EAF2" }, children: miss.join("\u3001") }),
          "\u3002 \u88C5\u4FEE\u516C\u53F8\u6F0F\u62A5 = \u540E\u671F\u589E\u9879\uFF1B\u786E\u8BA4\u9700\u8981\u5C31\u8865\u8FDB\u9884\u7B97\u3002"
        ] }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx("button", { className: "zx-btn ghost", disabled: fixing, onClick: fixMissing, children: "\u4E00\u952E\u8865\u9F50\u79D1\u76EE\uFF08\u9884\u7B97\u5F85\u5F55\uFF09" }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "zx-bar-ic" }),
      "\u6700\u8FD1\u6D41\u6C34",
      /* @__PURE__ */ jsxs("span", { className: "zx-hint", children: [
        "\u5171 ",
        data.exps.length,
        " \u7B14"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "zx-card", children: [
      recent.length === 0 && /* @__PURE__ */ jsx("div", { className: "zx-empty", children: "\u8FD8\u6CA1\u6709\u652F\u51FA\u3002\u5BF9 AI \u8BF4\u300C\u74F7\u7816\u4E70\u4E86 3200\u300D\u5373\u53EF\u8BB0\u8D26\uFF0C\u6216\u5728\u300C\u6D41\u6C34\u300D\u9875\u624B\u5DE5\u8BB0\u3002" }),
      recent.map((e) => {
        const c = catById.get(e.catId);
        const v = e.vendorId ? data.vens.find((x) => x.id === e.vendorId) : null;
        return /* @__PURE__ */ jsxs("div", { className: "zx-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "zx-item-t", children: [
            /* @__PURE__ */ jsx("span", { className: "zx-sub", children: core2.dayKeyOfTs(e.ts) }),
            /* @__PURE__ */ jsx("b", { children: c ? c.name : "\uFF08\u79D1\u76EE\u5DF2\u5220\uFF09" }),
            c && c.isExtra && /* @__PURE__ */ jsx("span", { className: "zx-tag yellow", children: "\u589E" }),
            /* @__PURE__ */ jsx("span", { className: "zx-grow" }),
            /* @__PURE__ */ jsxs("b", { className: "zx-money", children: [
              "\xA5",
              core2.fmtMoney(e.amount)
            ] })
          ] }),
          (v || e.note) && /* @__PURE__ */ jsxs("div", { className: "zx-item-s", children: [
            v ? /* @__PURE__ */ jsxs("span", { children: [
              "\xB7 ",
              v.name
            ] }) : null,
            e.note ? /* @__PURE__ */ jsxs("span", { children: [
              "\xB7 ",
              e.note
            ] }) : null
          ] })
        ] }, e.id);
      })
    ] })
  ] });
}

// src/CatsTab.tsx
var core3 = __toESM(require_core());
import { useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function CatsTab({ data, reload, showToast }) {
  const [adding, setAdding] = useState2(false);
  const [name, setName] = useState2("");
  const [group, setGroup] = useState2(core3.GROUPS[0]);
  const [budget, setBudget] = useState2("");
  const [isExtra, setIsExtra] = useState2(false);
  const [edit, setEdit] = useState2(null);
  const [editBudget, setEditBudget] = useState2("");
  const [editNote, setEditNote] = useState2("");
  const [busy, setBusy] = useState2(false);
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "zx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const cmp = core3.budgetCompare(data.cats, data.exps, data.project?.totalBudget);
  const rowById = new Map(cmp.rows.map((r) => [r.cat.id, r]));
  const expCountByCat = /* @__PURE__ */ new Map();
  for (const e of data.exps) expCountByCat.set(e.catId, (expCountByCat.get(e.catId) || 0) + 1);
  async function onTemplate() {
    setBusy(true);
    try {
      const n = await applyTemplate(data.cats);
      showToast(n > 0 ? `\u6807\u51C6\u79D1\u76EE\u6A21\u677F\uFF1A\u65B0\u5EFA ${n} \u4E2A\u79D1\u76EE\uFF08\u9884\u7B97\u5F85\u5F55\uFF09` : "\u6807\u51C6\u79D1\u76EE\u5747\u5DF2\u5B58\u5728");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function onAdd() {
    setBusy(true);
    try {
      await saveCategory({
        name,
        group,
        budget: budget.trim() === "" ? void 0 : Number(budget),
        isExtra,
        order: data.cats.length
      }, null);
      showToast(`\u5DF2\u5EFA\u79D1\u76EE\u300C${name.trim()}\u300D`);
      setName("");
      setBudget("");
      setIsExtra(false);
      setAdding(false);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function onSaveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      await saveCategory({
        budget: editBudget.trim() === "" ? null : Number(editBudget),
        note: editNote
      }, edit);
      showToast("\u79D1\u76EE\u5DF2\u66F4\u65B0");
      setEdit(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function onDeleteCat() {
    if (!edit) return;
    const used = expCountByCat.get(edit.id) || 0;
    if (used > 0) {
      showToast(`\u8BE5\u79D1\u76EE\u540D\u4E0B\u4ECD\u6709 ${used} \u7B14\u652F\u51FA\uFF0C\u8BF7\u5148\u5728\u300C\u6D41\u6C34\u300D\u8FC1\u79FB\u6216\u5220\u9664`, true, true);
      return;
    }
    try {
      await deleteKey(K.cat(edit.id));
      showToast("\u79D1\u76EE\u5DF2\u5220\u9664");
      setEdit(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  let lastGroup = "";
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "zx-bar-ic" }),
      "\u79D1\u76EE\u8868",
      /* @__PURE__ */ jsxs2("span", { className: "zx-hint", children: [
        data.cats.length,
        " \u79D1\u76EE \xB7 \u9884\u7B97 \xA5",
        core3.fmtMoney(cmp.totals.catBudgetTotal)
      ] })
    ] }),
    data.cats.length === 0 && /* @__PURE__ */ jsx2("div", { className: "zx-card", children: /* @__PURE__ */ jsxs2("div", { className: "zx-empty", children: [
      "\u8FD8\u6CA1\u6709\u79D1\u76EE\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u5EFA\u8BAE\u5148\u91C7\u7528",
      /* @__PURE__ */ jsx2("b", { children: "\u6807\u51C6\u79D1\u76EE\u6A21\u677F" }),
      "\uFF0830 \u9879\uFF0C\u5185\u5D4C\u9632\u6F0F\u9879\u6E05\u5355\uFF09\uFF0C\u518D\u6309\u62A5\u4EF7\u5355\u9010\u79D1\u76EE\u5F55\u9884\u7B97\u3002",
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2("button", { className: "zx-btn", disabled: busy, onClick: onTemplate, children: "\u4E00\u952E\u91C7\u7528\u6807\u51C6\u79D1\u76EE\u6A21\u677F" }) })
    ] }) }),
    data.cats.length > 0 && /* @__PURE__ */ jsxs2("div", { style: { padding: "0 16px 8px" }, children: [
      /* @__PURE__ */ jsx2("button", { className: "zx-btn ghost sm", disabled: busy, onClick: onTemplate, children: "\u8865\u9F50\u6807\u51C6\u79D1\u76EE" }),
      " ",
      /* @__PURE__ */ jsx2("button", { className: "zx-btn ghost sm", onClick: () => setAdding(!adding), children: adding ? "\u6536\u8D77" : "+ \u5EFA\u79D1\u76EE" })
    ] }),
    adding && /* @__PURE__ */ jsx2("div", { className: "zx-card", children: /* @__PURE__ */ jsxs2("div", { className: "zx-card-b", children: [
      /* @__PURE__ */ jsx2("label", { className: "zx-lbl", children: "\u79D1\u76EE\u540D\u79F0" }),
      /* @__PURE__ */ jsx2("input", { className: "zx-inp", value: name, placeholder: "\u5982 \u74F7\u7816 / \u589E\u9879\xB7\u7A97\u5957\u52A0\u56FA", onChange: (e) => setName(e.target.value) }),
      /* @__PURE__ */ jsxs2("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "zx-lbl", children: "\u5206\u7EC4" }),
          /* @__PURE__ */ jsx2("select", { className: "zx-sel", value: group, onChange: (e) => setGroup(e.target.value), children: core3.GROUPS.map((g) => /* @__PURE__ */ jsx2("option", { value: g, children: g }, g)) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "zx-lbl", children: "\u9884\u7B97\uFF08\u5143\uFF0C\u53EF\u7559\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "zx-inp", inputMode: "decimal", value: budget, placeholder: "\u5982 12800", onChange: (e) => setBudget(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "zx-lbl", children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: isExtra, onChange: (e) => setIsExtra(e.target.checked) }),
        " \u589E\u9879\u79D1\u76EE\uFF08\u62A5\u4EF7\u5355\u5916\u65B0\u589E\uFF0C\u8BA1\u5165\u589E\u9879\u5408\u8BA1\uFF09"
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2("button", { className: "zx-btn", disabled: busy || !name.trim(), onClick: onAdd, children: "\u5EFA\u79D1\u76EE" }) })
    ] }) }),
    /* @__PURE__ */ jsx2("div", { className: "zx-card", children: cmp.rows.map((r) => {
      const c = r.cat;
      const showGroup = c.group !== lastGroup;
      lastGroup = c.group;
      const pct = r.pct !== null ? Math.min(r.pct, 100) : 0;
      return /* @__PURE__ */ jsxs2("div", { children: [
        showGroup && /* @__PURE__ */ jsx2("div", { className: "zx-item", style: { padding: "7px 13px 3px" }, children: /* @__PURE__ */ jsxs2("span", { className: "zx-sub", style: { fontWeight: 700 }, children: [
          "[",
          c.group,
          "]"
        ] }) }),
        /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "zx-item",
            style: { width: "100%", background: "none", border: "none", borderTop: "1px solid #1d2330", color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit", display: "block" },
            onClick: () => {
              setEdit(c);
              setEditBudget(c.budget !== void 0 ? String(c.budget) : "");
              setEditNote(c.note || "");
            },
            children: [
              /* @__PURE__ */ jsxs2("div", { className: "zx-item-t", children: [
                /* @__PURE__ */ jsx2("b", { children: c.name }),
                c.isExtra && /* @__PURE__ */ jsx2("span", { className: "zx-tag yellow", children: "\u589E" }),
                r.level !== "green" && r.level !== "gray" && /* @__PURE__ */ jsx2("span", { className: `zx-tag ${r.level}`, children: r.level === "red" ? "\u8D85\u652F" : "\u4E34\u8D85" }),
                /* @__PURE__ */ jsx2("span", { className: "zx-grow" }),
                /* @__PURE__ */ jsxs2("span", { className: "zx-right", children: [
                  /* @__PURE__ */ jsxs2("b", { className: "zx-money", children: [
                    "\xA5",
                    core3.fmtMoney(r.spent)
                  ] }),
                  /* @__PURE__ */ jsxs2("span", { className: "zx-sub", children: [
                    " / ",
                    r.budget !== null ? `\xA5${core3.fmtMoney(r.budget)}` : "\u672A\u5B9A"
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "zx-row", style: { marginTop: 4 }, children: [
                /* @__PURE__ */ jsx2("div", { className: "zx-progress", children: /* @__PURE__ */ jsx2("i", { className: r.level, style: { width: `${pct}%` } }) }),
                /* @__PURE__ */ jsx2("span", { className: "zx-sub", style: { width: 34, textAlign: "right" }, children: r.pct !== null ? `${r.pct}%` : "\u2014" })
              ] })
            ]
          }
        )
      ] }, c.id);
    }) }),
    edit && /* @__PURE__ */ jsx2("div", { className: "zx-modal-bg", onClick: () => setEdit(null), children: /* @__PURE__ */ jsxs2("div", { className: "zx-modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs2("h4", { children: [
        "\u79D1\u76EE\u300C",
        edit.name,
        "\u300D",
        edit.isExtra ? "\uFF08\u589E\u9879\u79D1\u76EE\uFF09" : ""
      ] }),
      /* @__PURE__ */ jsx2("label", { className: "zx-lbl", children: "\u9884\u7B97\uFF08\u5143\uFF1B\u6E05\u7A7A=\u672A\u5B9A\u9884\u7B97\uFF09" }),
      /* @__PURE__ */ jsx2("input", { className: "zx-inp", inputMode: "decimal", value: editBudget, onChange: (e) => setEditBudget(e.target.value) }),
      /* @__PURE__ */ jsx2("label", { className: "zx-lbl", children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx2("input", { className: "zx-inp", value: editNote, placeholder: "\u5982 \u62A5\u4EF7\u5355\u7B2C 3 \u9875 / \u542B\u4EBA\u5DE5", onChange: (e) => setEditNote(e.target.value) }),
      /* @__PURE__ */ jsxs2("div", { className: "zx-sub", style: { marginTop: 6 }, children: [
        "\u5DF2\u82B1 \xA5",
        core3.fmtMoney(rowById.get(edit.id)?.spent || 0),
        expCountByCat.get(edit.id) ? ` \xB7 ${expCountByCat.get(edit.id)} \u7B14\u652F\u51FA` : " \xB7 \u65E0\u652F\u51FA"
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "zx-row", style: { marginTop: 12, gap: 6 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "zx-btn", disabled: busy, onClick: onSaveEdit, children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx2("button", { className: "zx-btn ghost", onClick: () => setEdit(null), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx2("span", { className: "zx-grow" }),
        /* @__PURE__ */ jsx2("button", { className: "zx-btn danger", onClick: onDeleteCat, children: "\u5220\u9664\u79D1\u76EE" })
      ] })
    ] }) })
  ] });
}

// src/ExpTab.tsx
var core4 = __toESM(require_core());
import { useMemo, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function todayStr() {
  return core4.dayKey(Date.now());
}
function ExpTab({ data, reload, showToast }) {
  const [amount, setAmount] = useState3("");
  const [catId, setCatId] = useState3("");
  const [date, setDate] = useState3(todayStr());
  const [vendorId, setVendorId] = useState3("");
  const [payMethod, setPayMethod] = useState3("");
  const [note, setNote] = useState3("");
  const [fCat, setFCat] = useState3("all");
  const [fVen, setFVen] = useState3("all");
  const [fMonth, setFMonth] = useState3("all");
  const [edit, setEdit] = useState3(null);
  const [eAmount, setEAmount] = useState3("");
  const [eCatId, setECatId] = useState3("");
  const [eDate, setEDate] = useState3("");
  const [eVendorId, setEVendorId] = useState3("");
  const [ePay, setEPay] = useState3("");
  const [eNote, setENote] = useState3("");
  const [confirmDel, setConfirmDel] = useState3("");
  const [busy, setBusy] = useState3(false);
  const catById = useMemo(() => new Map((data?.cats || []).map((c) => [c.id, c])), [data]);
  const venById = useMemo(() => new Map((data?.vens || []).map((v) => [v.id, v])), [data]);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "zx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const months = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    for (const e of data.exps) s.add(core4.dayKeyOfTs(e.ts).slice(0, 7));
    return [...s].sort().reverse();
  }, [data.exps]);
  const filtered = useMemo(() => {
    let rs = [...data.exps].reverse();
    if (fCat !== "all") rs = rs.filter((e) => e.catId === fCat);
    if (fVen !== "all") rs = rs.filter((e) => (e.vendorId || "") === fVen);
    if (fMonth !== "all") rs = rs.filter((e) => core4.dayKeyOfTs(e.ts).slice(0, 7) === fMonth);
    return rs;
  }, [data, fCat, fVen, fMonth]);
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  async function onAdd() {
    setBusy(true);
    try {
      const cid = catId || data.cats[0] && data.cats[0].id;
      if (!cid) {
        showToast("\u8FD8\u6CA1\u6709\u79D1\u76EE\uFF1A\u5148\u5230\u300C\u79D1\u76EE\u300D\u9875\u91C7\u7528\u6807\u51C6\u6A21\u677F", true);
        return;
      }
      await saveExpense({
        catId: cid,
        amount: Number(amount),
        date,
        vendorId: vendorId || "",
        payMethod,
        note
      }, null);
      showToast("\u5DF2\u8BB0\u4E00\u7B14");
      setAmount("");
      setNote("");
      setPayMethod("");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  function openEdit(e) {
    setEdit(e);
    setEAmount(String(e.amount));
    setECatId(e.catId);
    setEDate(core4.dayKeyOfTs(e.ts));
    setEVendorId(e.vendorId || "");
    setEPay(e.payMethod || "");
    setENote(e.note || "");
  }
  async function onSaveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      await saveExpense({
        catId: eCatId,
        amount: Number(eAmount),
        date: eDate,
        vendorId: eVendorId,
        payMethod: ePay,
        note: eNote
      }, edit);
      showToast("\u5DF2\u4FEE\u6539");
      setEdit(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function onDelete(id) {
    if (confirmDel !== id) {
      setConfirmDel(id);
      setTimeout(() => setConfirmDel((c) => c === id ? "" : c), 3e3);
      return;
    }
    try {
      await deleteKey(K.exp(id));
      showToast("\u5DF2\u5220\u9664");
      setConfirmDel("");
      setEdit(null);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "zx-bar-ic" }),
      "\u8BB0\u4E00\u7B14",
      /* @__PURE__ */ jsx3("span", { className: "zx-hint", children: "\u4E5F\u53EF\u5BF9 AI \u8BF4\u300C\u74F7\u7816\u4E70\u4E86 3200\u300D" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "zx-card", children: /* @__PURE__ */ jsxs3("div", { className: "zx-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "zx-grid3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u91D1\u989D\uFF08\u5143\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "zx-inp", inputMode: "decimal", value: amount, placeholder: "3200", onChange: (e) => setAmount(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u79D1\u76EE" }),
          /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: catId, onChange: (e) => setCatId(e.target.value), children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\uFF08\u9009\u62E9\u79D1\u76EE\uFF09" }),
            data.cats.map((c) => /* @__PURE__ */ jsxs3("option", { value: c.id, children: [
              c.name,
              c.isExtra ? "\uFF08\u589E\uFF09" : ""
            ] }, c.id))
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u65E5\u671F" }),
          /* @__PURE__ */ jsx3("input", { className: "zx-inp", type: "date", value: date, onChange: (e) => setDate(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "zx-grid2", style: { marginTop: 4 }, children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u4F9B\u5E94\u5546\uFF08\u53EF\u9009\uFF09" }),
          /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: vendorId, onChange: (e) => setVendorId(e.target.value), children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\uFF08\u4E0D\u5173\u8054\uFF09" }),
            data.vens.map((v) => /* @__PURE__ */ jsx3("option", { value: v.id, children: v.name }, v.id))
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u5907\u6CE8\uFF08\u53EF\u9009\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "zx-inp", value: note, placeholder: "\u5982 80x80 \u7070\u7816 3 \u7BB1", onChange: (e) => setNote(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx3("button", { className: "zx-btn", disabled: busy || !amount, onClick: onAdd, children: "\u8BB0\u5165\u53F0\u8D26" }) })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "zx-bar-ic" }),
      "\u6D41\u6C34",
      /* @__PURE__ */ jsxs3("span", { className: "zx-hint", children: [
        filtered.length,
        " \u7B14 \xB7 \xA5",
        core4.fmtMoney(filteredTotal)
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: { padding: "0 16px 8px" }, className: "zx-grid3", children: [
      /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: fCat, onChange: (e) => setFCat(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "all", children: "\u5168\u90E8\u79D1\u76EE" }),
        data.cats.map((c) => /* @__PURE__ */ jsx3("option", { value: c.id, children: c.name }, c.id))
      ] }),
      /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: fVen, onChange: (e) => setFVen(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "all", children: "\u5168\u90E8\u4F9B\u5E94\u5546" }),
        /* @__PURE__ */ jsx3("option", { value: "", children: "\uFF08\u65E0\u4F9B\u5E94\u5546\uFF09" }),
        data.vens.map((v) => /* @__PURE__ */ jsx3("option", { value: v.id, children: v.name }, v.id))
      ] }),
      /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: fMonth, onChange: (e) => setFMonth(e.target.value), children: [
        /* @__PURE__ */ jsx3("option", { value: "all", children: "\u5168\u90E8\u6708\u4EFD" }),
        months.map((m) => /* @__PURE__ */ jsx3("option", { value: m, children: m }, m))
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "zx-card", children: [
      filtered.length === 0 && /* @__PURE__ */ jsx3("div", { className: "zx-empty", children: "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u652F\u51FA" }),
      filtered.map((e) => {
        const c = catById.get(e.catId);
        const v = e.vendorId ? venById.get(e.vendorId) : null;
        return /* @__PURE__ */ jsxs3("div", { className: "zx-item", children: [
          /* @__PURE__ */ jsxs3("div", { className: "zx-item-t", children: [
            /* @__PURE__ */ jsx3("span", { className: "zx-sub", children: core4.dayKeyOfTs(e.ts) }),
            /* @__PURE__ */ jsx3("b", { children: c ? c.name : "\uFF08\u79D1\u76EE\u5DF2\u5220\uFF09" }),
            c && c.isExtra && /* @__PURE__ */ jsx3("span", { className: "zx-tag yellow", children: "\u589E" }),
            /* @__PURE__ */ jsx3("span", { className: "zx-grow" }),
            /* @__PURE__ */ jsxs3("b", { className: "zx-money", children: [
              "\xA5",
              core4.fmtMoney(e.amount)
            ] }),
            /* @__PURE__ */ jsx3("button", { className: "zx-link", onClick: () => openEdit(e), children: "\u6539" }),
            /* @__PURE__ */ jsx3("button", { className: "zx-link", style: { color: confirmDel === e.id ? "#F85149" : void 0 }, onClick: () => onDelete(e.id), children: confirmDel === e.id ? "\u786E\u8BA4\u5220?" : "\u5220" })
          ] }),
          (v || e.note || e.payMethod) && /* @__PURE__ */ jsxs3("div", { className: "zx-item-s", children: [
            v ? /* @__PURE__ */ jsxs3("span", { children: [
              "\xB7 ",
              v.name
            ] }) : null,
            e.payMethod ? /* @__PURE__ */ jsxs3("span", { children: [
              "\xB7 ",
              e.payMethod
            ] }) : null,
            e.note ? /* @__PURE__ */ jsxs3("span", { children: [
              "\xB7 ",
              e.note
            ] }) : null
          ] })
        ] }, e.id);
      })
    ] }),
    edit && /* @__PURE__ */ jsx3("div", { className: "zx-modal-bg", onClick: () => setEdit(null), children: /* @__PURE__ */ jsxs3("div", { className: "zx-modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx3("h4", { children: "\u4FEE\u6539\u652F\u51FA" }),
      /* @__PURE__ */ jsxs3("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u91D1\u989D\uFF08\u5143\uFF09" }),
          /* @__PURE__ */ jsx3("input", { className: "zx-inp", inputMode: "decimal", value: eAmount, onChange: (e2) => setEAmount(e2.target.value) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u79D1\u76EE" }),
          /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: eCatId, onChange: (e2) => setECatId(e2.target.value), children: [
            data.cats.map((c) => /* @__PURE__ */ jsxs3("option", { value: c.id, children: [
              c.name,
              c.isExtra ? "\uFF08\u589E\uFF09" : ""
            ] }, c.id)),
            !catById.has(eCatId) && /* @__PURE__ */ jsx3("option", { value: eCatId, children: "\uFF08\u79D1\u76EE\u5DF2\u5220\uFF09" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u65E5\u671F" }),
          /* @__PURE__ */ jsx3("input", { className: "zx-inp", type: "date", value: eDate, onChange: (e2) => setEDate(e2.target.value) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u4F9B\u5E94\u5546" }),
          /* @__PURE__ */ jsxs3("select", { className: "zx-sel", value: eVendorId, onChange: (e2) => setEVendorId(e2.target.value), children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\uFF08\u4E0D\u5173\u8054\uFF09" }),
            data.vens.map((v) => /* @__PURE__ */ jsx3("option", { value: v.id, children: v.name }, v.id))
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u652F\u4ED8\u65B9\u5F0F" }),
      /* @__PURE__ */ jsx3("input", { className: "zx-inp", value: ePay, placeholder: "\u5FAE\u4FE1/\u8F6C\u8D26/\u73B0\u91D1", onChange: (e2) => setEPay(e2.target.value) }),
      /* @__PURE__ */ jsx3("label", { className: "zx-lbl", children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx3("input", { className: "zx-inp", value: eNote, onChange: (e2) => setENote(e2.target.value) }),
      /* @__PURE__ */ jsxs3("div", { className: "zx-row", style: { marginTop: 12, gap: 6 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "zx-btn", disabled: busy, onClick: onSaveEdit, children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx3("button", { className: "zx-btn ghost", onClick: () => setEdit(null), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx3("span", { className: "zx-grow" }),
        /* @__PURE__ */ jsx3("button", { className: "zx-btn danger", onClick: () => onDelete(edit.id), children: confirmDel === edit.id ? "\u786E\u8BA4\u5220?" : "\u5220\u9664" })
      ] })
    ] }) })
  ] });
}

// src/FilesTab.tsx
var core5 = __toESM(require_core());
import { useMemo as useMemo2, useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function FilesTab({ data, reload, showToast }) {
  const [pName, setPName] = useState4("");
  const [pHouse, setPHouse] = useState4("");
  const [pBudget, setPBudget] = useState4("");
  const [pStatus, setPStatus] = useState4("active");
  const [projLoaded, setProjLoaded] = useState4(false);
  const [venEdit, setVenEdit] = useState4(null);
  const [venOpen, setVenOpen] = useState4(false);
  const [vName, setVName] = useState4("");
  const [vRole, setVRole] = useState4("");
  const [vPhone, setVPhone] = useState4("");
  const [vContract, setVContract] = useState4("");
  const [vNote, setVNote] = useState4("");
  const [mTitle, setMTitle] = useState4("");
  const [mDate, setMDate] = useState4("");
  const [mNote, setMNote] = useState4("");
  const [summary, setSummary] = useState4("");
  const [expText, setExpText] = useState4("");
  const [busy, setBusy] = useState4(false);
  const paidByVen = useMemo2(() => {
    const m = /* @__PURE__ */ new Map();
    for (const e of data?.exps || []) {
      if (!e.vendorId) continue;
      const cur = m.get(e.vendorId) || { paid: 0, n: 0 };
      cur.paid += e.amount;
      cur.n += 1;
      m.set(e.vendorId, cur);
    }
    return m;
  }, [data]);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "zx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const p = data.project;
  if (!projLoaded) {
    setPName(p?.name || "");
    setPHouse(p?.house || "");
    setPBudget(p?.totalBudget !== void 0 ? String(p.totalBudget) : "");
    setPStatus(p?.status || "active");
    setProjLoaded(true);
  }
  async function onSaveProject() {
    setBusy(true);
    try {
      await saveProject({
        name: pName,
        house: pHouse,
        status: pStatus,
        totalBudget: pBudget.trim() === "" ? null : Number(pBudget)
      }, p);
      showToast("\u9879\u76EE\u6863\u6848\u5DF2\u4FDD\u5B58");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  function openVen(v) {
    setVenEdit(v);
    setVenOpen(true);
    setVName(v?.name || "");
    setVRole(v?.role || "");
    setVPhone(v?.phone || "");
    setVContract(v?.contractAmount !== void 0 ? String(v.contractAmount) : "");
    setVNote(v?.note || "");
  }
  async function onSaveVen() {
    setBusy(true);
    try {
      const input = {
        name: vName,
        role: vRole,
        phone: vPhone,
        note: vNote,
        contractAmount: vContract.trim() === "" ? null : Number(vContract)
      };
      if (venEdit) await saveVendor(input, venEdit);
      else {
        if (data.vens.some((v) => v.name === vName.trim())) {
          showToast("\u540C\u540D\u4F9B\u5E94\u5546\u5DF2\u5B58\u5728", true);
          return;
        }
        await saveVendor(input, null);
      }
      showToast("\u4F9B\u5E94\u5546\u5DF2\u4FDD\u5B58");
      setVenOpen(false);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function onDeleteVen(v) {
    try {
      await deleteKey(K.ven(v.id));
      showToast(`\u5DF2\u5220\u9664\u4F9B\u5E94\u5546\u300C${v.name}\u300D\uFF08\u5386\u53F2\u6D41\u6C34\u4FDD\u7559\uFF09`);
      setVenOpen(false);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function onAddMile() {
    setBusy(true);
    try {
      const m = await saveMilestone({ title: mTitle, date: mDate, note: mNote }, null);
      showToast(`\u5DF2\u5EFA\u8282\u70B9\u300C${m.title}\u300D@ ${m.date}`);
      setMTitle("");
      setMDate("");
      setMNote("");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function onToggleMile(m) {
    try {
      await saveMilestone({ done: !m.done }, m);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  async function onDeleteMile(m) {
    try {
      await deleteKey(K.mile(m.id));
      showToast("\u8282\u70B9\u5DF2\u5220\u9664");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  }
  function genSummary() {
    setSummary(core5.buildSummary({
      project: data.project,
      cats: data.cats,
      expenses: data.exps,
      vendors: data.vens,
      milestones: data.miles
    }, Date.now()));
  }
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "zx-bar-ic" }),
      "\u9879\u76EE\u6863\u6848"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "zx-card", children: /* @__PURE__ */ jsxs4("div", { className: "zx-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u9879\u76EE\u540D\u79F0" }),
          /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: pName, placeholder: "\u5982 \u4E16\u7EAA\u82B1\u56ED 3-502", onChange: (e) => setPName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u603B\u9884\u7B97\uFF08\u5143\uFF0C\u4F18\u5148\u4E8E\u79D1\u76EE\u5408\u8BA1\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "zx-inp", inputMode: "decimal", value: pBudget, placeholder: "300000", onChange: (e) => setPBudget(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u72B6\u6001" }),
          /* @__PURE__ */ jsxs4("select", { className: "zx-sel", value: pStatus, onChange: (e) => setPStatus(e.target.value), children: [
            /* @__PURE__ */ jsx4("option", { value: "planning", children: "\u89C4\u5212\u4E2D" }),
            /* @__PURE__ */ jsx4("option", { value: "active", children: "\u8FDB\u884C\u4E2D" }),
            /* @__PURE__ */ jsx4("option", { value: "done", children: "\u5DF2\u5B8C\u5DE5" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u623F\u5B50/\u5C0F\u533A" }),
          /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: pHouse, onChange: (e) => setPHouse(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx4("button", { className: "zx-btn", disabled: busy || !pName.trim(), onClick: onSaveProject, children: "\u4FDD\u5B58\u9879\u76EE\u6863\u6848" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "zx-bar-ic" }),
      "\u4F9B\u5E94\u5546",
      /* @__PURE__ */ jsxs4("span", { className: "zx-hint", children: [
        data.vens.length,
        " \u5BB6"
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "zx-link", onClick: () => openVen(null), children: "+ \u5EFA\u6863" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "zx-card", children: [
      data.vens.length === 0 && /* @__PURE__ */ jsx4("div", { className: "zx-empty", children: "\u8FD8\u6CA1\u6709\u4F9B\u5E94\u5546\u6863\u6848\u3002\u8BB0\u8D26\u65F6\u5BF9 AI \u63D0\u300C\u5F20\u5E08\u5085\u88C5\u7684\u300D\u4F1A\u81EA\u52A8\u5EFA\u6863\u3002" }),
      data.vens.map((v) => {
        const st = paidByVen.get(v.id) || { paid: 0, n: 0 };
        return /* @__PURE__ */ jsxs4("div", { className: "zx-item", children: [
          /* @__PURE__ */ jsxs4("div", { className: "zx-item-t", children: [
            /* @__PURE__ */ jsx4("b", { children: v.name }),
            v.role && /* @__PURE__ */ jsx4("span", { className: "zx-tag", children: v.role }),
            /* @__PURE__ */ jsx4("span", { className: "zx-grow" }),
            /* @__PURE__ */ jsxs4("span", { className: "zx-right", children: [
              /* @__PURE__ */ jsxs4("b", { className: "zx-money", children: [
                "\xA5",
                core5.fmtMoney(st.paid)
              ] }),
              /* @__PURE__ */ jsxs4("span", { className: "zx-sub", children: [
                " / ",
                st.n,
                " \u7B14"
              ] })
            ] }),
            /* @__PURE__ */ jsx4("button", { className: "zx-link", onClick: () => openVen(v), children: "\u6539" })
          ] }),
          (v.phone || v.contractAmount !== void 0 || v.note) && /* @__PURE__ */ jsxs4("div", { className: "zx-item-s", children: [
            v.phone ? /* @__PURE__ */ jsxs4("span", { children: [
              "\xB7 \u260E ",
              v.phone
            ] }) : null,
            v.contractAmount !== void 0 ? /* @__PURE__ */ jsxs4("span", { children: [
              "\xB7 \u5408\u540C\u989D \xA5",
              core5.fmtMoney(v.contractAmount)
            ] }) : null,
            v.note ? /* @__PURE__ */ jsxs4("span", { children: [
              "\xB7 ",
              v.note
            ] }) : null
          ] })
        ] }, v.id);
      })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "zx-bar-ic" }),
      "\u5DE5\u671F\u8282\u70B9",
      /* @__PURE__ */ jsx4("span", { className: "zx-hint", children: "\u903E\u671F\u7EA2 \xB7 3 \u5929\u5185\u9EC4" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "zx-card", children: /* @__PURE__ */ jsxs4("div", { className: "zx-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: mTitle, placeholder: "\u8282\u70B9\u6807\u9898\uFF0C\u5982 \u6C34\u7535\u9A8C\u6536", onChange: (e) => setMTitle(e.target.value) }),
        /* @__PURE__ */ jsx4("input", { className: "zx-inp", type: "date", value: mDate, onChange: (e) => setMDate(e.target.value) })
      ] }),
      /* @__PURE__ */ jsx4("input", { className: "zx-inp", style: { marginTop: 8 }, value: mNote, placeholder: "\u5907\u6CE8\uFF08\u53EF\u9009\uFF09", onChange: (e) => setMNote(e.target.value) }),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx4("button", { className: "zx-btn", disabled: busy || !mTitle.trim() || !mDate, onClick: onAddMile, children: "\u5EFA\u8282\u70B9" }) })
    ] }) }),
    data.miles.length > 0 && /* @__PURE__ */ jsx4("div", { className: "zx-card", children: data.miles.map((m) => {
      const lv = core5.milestoneLevel(m);
      return /* @__PURE__ */ jsxs4("div", { className: "zx-item", children: [
        /* @__PURE__ */ jsxs4("div", { className: "zx-item-t", children: [
          /* @__PURE__ */ jsx4("span", { className: `zx-tag ${lv.level === "gray" ? "gray" : lv.level}`, children: m.done ? "\u5DF2\u5B8C\u6210" : lv.level === "red" ? `\u903E\u671F ${-(lv.daysLeft || 0)} \u5929` : lv.level === "yellow" ? `\u8FD8\u5269 ${lv.daysLeft} \u5929` : "\u672A\u5230" }),
          /* @__PURE__ */ jsx4("b", { style: { textDecoration: m.done ? "line-through" : void 0 }, children: m.title }),
          /* @__PURE__ */ jsx4("span", { className: "zx-grow" }),
          /* @__PURE__ */ jsx4("span", { className: "zx-sub", children: m.date }),
          /* @__PURE__ */ jsx4("button", { className: "zx-link", onClick: () => onToggleMile(m), children: m.done ? "\u91CD\u5F00" : "\u5B8C\u6210" }),
          /* @__PURE__ */ jsx4("button", { className: "zx-link", onClick: () => onDeleteMile(m), children: "\u5220" })
        ] }),
        m.note && /* @__PURE__ */ jsxs4("div", { className: "zx-item-s", children: [
          "\xB7 ",
          m.note
        ] })
      ] }, m.id);
    }) }),
    /* @__PURE__ */ jsxs4("div", { className: "zx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "zx-bar-ic" }),
      "\u5BF9\u8D26\u5C0F\u7ED3\u4E0E\u5BFC\u51FA"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "zx-card", children: /* @__PURE__ */ jsxs4("div", { className: "zx-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "zx-row", style: { gap: 6, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx4("button", { className: "zx-btn ghost", onClick: genSummary, children: "\u751F\u6210\u5BF9\u8D26\u5C0F\u7ED3" }),
        /* @__PURE__ */ jsx4("button", { className: "zx-btn ghost", onClick: () => setExpText(exportAll(data)), children: "\u751F\u6210\u5BFC\u51FA JSON" })
      ] }),
      summary && /* @__PURE__ */ jsx4("textarea", { className: "zx-textarea", style: { marginTop: 10 }, readOnly: true, value: summary }),
      expText && /* @__PURE__ */ jsx4("textarea", { className: "zx-textarea", style: { marginTop: 10 }, readOnly: true, value: expText })
    ] }) }),
    venOpen && /* @__PURE__ */ jsx4("div", { className: "zx-modal-bg", onClick: () => setVenOpen(false), children: /* @__PURE__ */ jsxs4("div", { className: "zx-modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx4("h4", { children: venEdit ? `\u4F9B\u5E94\u5546\u300C${venEdit.name}\u300D` : "\u65B0\u5EFA\u4F9B\u5E94\u5546" }),
      /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: vName, onChange: (e) => setVName(e.target.value) }),
      /* @__PURE__ */ jsxs4("div", { className: "zx-grid2", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u89D2\u8272" }),
          /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: vRole, placeholder: "\u74E6\u5DE5/\u5168\u5305\u516C\u53F8", onChange: (e) => setVRole(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u7535\u8BDD" }),
          /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: vPhone, onChange: (e) => setVPhone(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u5408\u540C\u989D\uFF08\u5143\uFF0C\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "zx-inp", inputMode: "decimal", value: vContract, onChange: (e) => setVContract(e.target.value) }),
      /* @__PURE__ */ jsx4("label", { className: "zx-lbl", children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx4("input", { className: "zx-inp", value: vNote, onChange: (e) => setVNote(e.target.value) }),
      /* @__PURE__ */ jsxs4("div", { className: "zx-row", style: { marginTop: 12, gap: 6 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "zx-btn", disabled: busy || !vName.trim(), onClick: onSaveVen, children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx4("button", { className: "zx-btn ghost", onClick: () => setVenOpen(false), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx4("span", { className: "zx-grow" }),
        venEdit && /* @__PURE__ */ jsx4("button", { className: "zx-btn danger", onClick: () => onDeleteVen(venEdit), children: "\u5220\u9664" })
      ] })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.zx-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.zx-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.zx-body{flex:1;overflow-y:auto;padding:0 0 24px}
.zx-body::-webkit-scrollbar{width:9px;height:9px}
.zx-body::-webkit-scrollbar-track{background:transparent}
.zx-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.zx-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.zx-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.zx-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E3B341,#F87171);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.zx-tt{flex:1;min-width:0}
.zx-tt b{font-size:15px;display:block}
.zx-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.zx-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.zx-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.zx-dot.warn{background:#E3B341;box-shadow:0 0 6px rgba(227,179,65,.7)}
.zx-dot.bad{background:#F85149;box-shadow:0 0 6px rgba(248,81,73,.7)}
.zx-dot.off{background:#5C6678}
.zx-tabs{display:flex;gap:4px}
.zx-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.zx-tab:hover{color:#E6EAF2}
.zx-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.zx-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.zx-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.zx-bar-ic{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E3B341,#F87171);flex-shrink:0}
.zx-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.zx-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.zx-card-b{padding:11px 13px}
.zx-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.zx-btn:hover{filter:brightness(1.1)}
.zx-btn:disabled{opacity:.45;cursor:not-allowed}
.zx-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.zx-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.zx-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.zx-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.zx-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.zx-inp:focus{outline:none;border-color:#2b6cb0}
.zx-inp::placeholder{color:#4d5566}
.zx-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.zx-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.zx-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.zx-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.zx-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.zx-toast.bad{border-color:#54262c;color:#FF8A9A}
.zx-toast-wrap{white-space:normal;max-height:40vh;overflow-y:auto}
.zx-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.zx-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.zx-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.zx-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.zx-tag.gray{background:#1C2330;border-color:#2a2f3a;color:#8B95A7}
.zx-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.zx-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.zx-row{display:flex;align-items:center;gap:8px;min-width:0}
.zx-grow{flex:1;min-width:0}
.zx-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.zx-modal-bg{position:absolute;inset:0;background:rgba(8,10,14,.72);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.zx-modal{background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:14px;width:100%;max-width:440px;max-height:88%;overflow-y:auto}
.zx-modal h4{margin:0 0 8px;font-size:13.5px}
.zx-progress{height:7px;border-radius:4px;background:#12151c;overflow:hidden;flex:1;min-width:40px}
.zx-progress>i{display:block;height:100%;border-radius:4px}
.zx-progress>i.red{background:#F85149}
.zx-progress>i.yellow{background:#E3B341}
.zx-progress>i.green{background:#3FB950}
.zx-progress>i.gray{background:#5C6678}
.zx-money{font-variant-numeric:tabular-nums}
.zx-hero{padding:13px}
.zx-hero .big{font-size:22px;font-weight:800;letter-spacing:.3px}
.zx-kv{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:#8B95A7;margin-top:3px}
.zx-item{padding:9px 13px;border-top:1px solid #1d2330}
.zx-item:first-child{border-top:none}
.zx-item-t{display:flex;align-items:center;gap:7px}
.zx-item-t b{font-size:12.5px}
.zx-item-s{font-size:10.5px;color:#8B95A7;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap}
.zx-right{text-align:right;font-variant-numeric:tabular-nums}
.zx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.zx-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.zx-link{background:none;border:none;color:#79B8FF;cursor:pointer;font-size:11px;padding:2px 4px}
.zx-link:hover{text-decoration:underline}
.zx-textarea{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#C9D1D9;padding:9px 10px;font-size:11px;width:100%;min-height:160px;font-family:Consolas,monospace;resize:vertical}
`;
function ZxPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("overview");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const cacheRef = useRef(newCache());
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, bad, wrap) => {
    setToast({ msg, bad, wrap });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), wrap ? 6e3 : 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadZx(cacheRef.current);
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
    const timer = setInterval(poll, 5e3);
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
  const props = { data, reload, showToast, pluginId, onSendToChat };
  const cmp = data ? core6.budgetCompare(data.cats, data.exps, data.project?.totalBudget) : null;
  const redCount = data ? cmp.rows.filter((r) => r.level === "red").length + data.miles.filter((m) => core6.milestoneLevel(m).level === "red").length : 0;
  const dotCls = !data ? "off" : cmp && cmp.totals.level === "red" ? "bad" : cmp && (cmp.totals.level === "yellow" || redCount > 0) ? "warn" : "ok";
  return /* @__PURE__ */ jsxs5("div", { className: "zx-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "zx-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "zx-logo", children: "\u{1F3E0}" }),
      /* @__PURE__ */ jsxs5("div", { className: "zx-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u88C5\u4FEE\u53F0\u8D26" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `zx-dot ${dotCls}` }),
          data && cmp ? `${data.project ? data.project.name : "\u672A\u5EFA\u9879\u76EE"} \xB7 \u5DF2\u82B1 \xA5${core6.fmtMoney(cmp.totals.spentTotal)}${cmp.totals.budgetTotal > 0 ? ` / \xA5${core6.fmtMoney(cmp.totals.budgetTotal)}` : " \xB7 \u9884\u7B97\u672A\u8BBE"}${cmp.extraSpent > 0 ? ` \xB7 \u589E\u9879 \xA5${core6.fmtMoney(cmp.extraSpent)}` : ""}` : "\u8F7D\u5165\u4E2D\u2026"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "zx-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["cats", "\u79D1\u76EE"],
        ["exp", "\u6D41\u6C34"],
        ["files", "\u6863\u6848"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `zx-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "overview" && redCount > 0 && /* @__PURE__ */ jsx5("span", { className: "zx-badge", children: redCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "zx-body", children: /* @__PURE__ */ jsxs5("div", { className: "zx-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "zx-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx5(OverviewTab, { ...props }),
      tab === "cats" && /* @__PURE__ */ jsx5(CatsTab, { ...props }),
      tab === "exp" && /* @__PURE__ */ jsx5(ExpTab, { ...props }),
      tab === "files" && /* @__PURE__ */ jsx5(FilesTab, { ...props }),
      /* @__PURE__ */ jsx5("div", { className: "zx-foot", children: "\u88C5\u4FEE\u53F0\u8D26\u662F\u5BB6\u5EAD\u5BF9\u8D26\u5DE5\u5177\uFF1A\u5BF9\u6BD4\u7ED3\u679C\u7528\u4E8E\u5BB6\u5EAD\u81EA\u67E5\uFF0C\u4E0D\u6784\u6210\u9020\u4EF7\u54A8\u8BE2\u6216\u6CD5\u5F8B\u5EFA\u8BAE\u3002\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002" })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `zx-toast ${toast.bad ? "bad" : ""} ${toast.wrap ? "zx-toast-wrap" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
var src_default = ZxPanel;
export {
  src_default as default
};
