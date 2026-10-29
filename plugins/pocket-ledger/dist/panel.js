var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// shared/ledger-core.js
var require_ledger_core = __commonJS({
  "shared/ledger-core.js"(exports, module) {
    "use strict";
    var K3 = {
      day: (dateStr) => `ledger.day.${dateStr}`,
      // YYYY-MM-DD
      dayPrefix: "ledger.day.",
      dayPrefixOf: (month) => `ledger.day.${month}-`,
      // YYYY-MM
      settings: "ledger.settings",
      /** 附件独立键空间：ledger.att.<id> → { id, name, mime, size, data(base64), ts }
       *  账单只存 attachmentId 引用，查询列表不拉 base64（默认不查询图片，点开才取）。 */
      att: (id) => `ledger.att.${id}`,
      attPrefix: "ledger.att."
    };
    var DEFAULT_CATEGORIES = ["\u9910\u996E", "\u4EA4\u901A", "\u8D2D\u7269", "\u5C45\u4F4F", "\u5A31\u4E50", "\u533B\u7597", "\u5B66\u4E60", "\u4EBA\u60C5", "\u5176\u4ED6"];
    var INCOME_CATEGORIES = ["\u5DE5\u8D44", "\u7406\u8D22", "\u7EA2\u5305", "\u9000\u6B3E", "\u5176\u4ED6\u6536\u5165"];
    var DEFAULT_SETTINGS3 = {
      schemaVersion: 2,
      currency: "CNY",
      currencySymbol: "\xA5",
      categories: [...DEFAULT_CATEGORIES],
      incomeCategories: [...INCOME_CATEGORIES],
      /** 每类月预算（仅支出类），如 { 餐饮: 2000 }；缺省该类不控预算 */
      budgets: {},
      /** 月度总预算（支出合计），null = 不启用 */
      monthlyTotalBudget: null,
      /** 不参与汇总的分类（如工资）：账单照记、明细照见，但统计/结余/排行/逐日排除。
       *  语义为"隐藏出汇总"，并非删除账单。 */
      excludeFromStats: []
    };
    var MAX_ATTACHMENT_BYTES3 = 2 * 1024 * 1024;
    function isExcludedFromStats(category, settings) {
      const ex = settings && settings.excludeFromStats || [];
      return Array.isArray(ex) && ex.includes(category);
    }
    var pad2 = (n) => String(n).padStart(2, "0");
    function dayKeyOf3(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function monthOf3(input) {
      if (typeof input === "string") return input.slice(0, 7);
      const d = typeof input === "number" ? new Date(input) : input;
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    }
    function shiftMonth3(month, delta) {
      const [y, m] = month.split("-").map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    }
    function currentMonth3(now) {
      return monthOf3(typeof now === "number" ? now : Date.now());
    }
    function makeId(now) {
      const t = typeof now === "number" ? now : Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return "b" + t.toString(36) + rand;
    }
    function normalizeBill2(raw, validCategories) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u8D26\u5355\u6570\u636E" };
      const amount = Number(raw.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: `\u91D1\u989D\u5FC5\u987B\u662F\u6B63\u6570\uFF08\u6536\u5230\uFF1A${raw.amount}\uFF09` };
      if (amount > 1e9) return { error: "\u91D1\u989D\u8FC7\u5927\uFF0C\u7591\u4F3C\u8F93\u5165\u9519\u8BEF" };
      const type = raw.type === "income" ? "income" : "expense";
      const ts = Number.isFinite(Number(raw.ts)) && Number(raw.ts) > 0 ? Number(raw.ts) : Date.now();
      const bill = {
        id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : makeId(ts),
        ts,
        type,
        amount: Math.round(amount * 100) / 100,
        category: String(raw.category || (type === "income" ? "\u5176\u4ED6\u6536\u5165" : "\u5176\u4ED6")).slice(0, 20),
        note: String(raw.note || "").slice(0, 200),
        source: raw.source === "panel" || raw.source === "ai" || raw.source === "import" ? raw.source : "ai",
        /** 附件引用（ledger.att.<id>）；未附图为 undefined，避免写入空串。 */
        attachmentId: typeof raw.attachmentId === "string" && raw.attachmentId ? raw.attachmentId.slice(0, 60) : void 0
      };
      if (Array.isArray(validCategories) && validCategories.length && !validCategories.includes(bill.category)) {
        return { error: `\u672A\u77E5\u5206\u7C7B\u300C${bill.category}\u300D\uFF0C\u53EF\u7528\uFF1A${validCategories.join("/")}\uFF08\u53EF\u5148\u5728\u8BBE\u7F6E\u91CC\u6DFB\u52A0\u81EA\u5B9A\u4E49\u5206\u7C7B\uFF09` };
      }
      return { bill };
    }
    function appendBills2(existing, bills) {
      const map = /* @__PURE__ */ new Map();
      for (const b of existing || []) {
        if (b && typeof b === "object" && typeof b.id === "string") map.set(b.id, b);
      }
      for (const b of bills) map.set(b.id, b);
      return [...map.values()].sort((a, b) => a.ts - b.ts);
    }
    function removeBill2(existing, id) {
      const arr = (existing || []).filter((b) => b && b.id !== id);
      return { arr, removed: arr.length !== (existing || []).length };
    }
    function filterBills(bills, { category, type, keyword, minAmount, maxAmount } = {}) {
      return (bills || []).filter((b) => {
        if (category && b.category !== category) return false;
        if (type && b.type !== type) return false;
        if (minAmount !== void 0 && b.amount < Number(minAmount)) return false;
        if (maxAmount !== void 0 && b.amount > Number(maxAmount)) return false;
        if (keyword) {
          const kw = String(keyword).toLowerCase();
          if (!(b.note || "").toLowerCase().includes(kw) && !b.category.toLowerCase().includes(kw)) return false;
        }
        return true;
      });
    }
    function computeStats3(bills, settings, month) {
      const exclude = settings && settings.excludeFromStats || [];
      let income = 0;
      let expense = 0;
      let excludedSum = 0;
      const byCategoryMap = /* @__PURE__ */ new Map();
      const byDayMap = /* @__PURE__ */ new Map();
      for (const b of bills || []) {
        const isExcluded = Array.isArray(exclude) && exclude.includes(b.category);
        if (isExcluded) {
          excludedSum += b.amount;
        } else if (b.type === "income") {
          income += b.amount;
        } else {
          expense += b.amount;
        }
        const c = byCategoryMap.get(b.category) || { category: b.category, type: b.type, sum: 0, count: 0, excluded: isExcluded };
        c.sum += b.amount;
        c.count += 1;
        if (!isExcluded) {
          if (b.type === "income") c.incomeSum = (c.incomeSum || 0) + b.amount;
          else c.expenseSum = (c.expenseSum || 0) + b.amount;
        }
        byCategoryMap.set(b.category, c);
        if (!isExcluded && b.type === "expense") {
          const day = dayKeyOf3(b.ts);
          byDayMap.set(day, (byDayMap.get(day) || 0) + b.amount);
        }
      }
      const round2 = (n) => Math.round(n * 100) / 100;
      const budgets = settings && settings.budgets || {};
      const totalBudget = settings && settings.monthlyTotalBudget != null ? Number(settings.monthlyTotalBudget) : null;
      const byCategory = [...byCategoryMap.values()].map((c) => ({
        ...c,
        sum: round2(c.sum),
        incomeSum: c.incomeSum != null ? round2(c.incomeSum) : void 0,
        expenseSum: c.expenseSum != null ? round2(c.expenseSum) : void 0,
        budget: budgets[c.category] != null ? Number(budgets[c.category]) : null
      })).sort((a, b) => b.sum - a.sum);
      const [y, m] = month.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const byDay = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${month}-${pad2(d)}`;
        byDay.push({ date: key, expense: round2(byDayMap.get(key) || 0) });
      }
      const usedCount = {};
      for (const c of byCategory) {
        if (c.budget != null && c.budget > 0) {
          usedCount[c.category] = c.sum / c.budget;
        }
      }
      return {
        month,
        income: round2(income),
        expense: round2(expense),
        balance: round2(income - expense),
        count: (bills || []).length,
        /** 被排除分类的合计（如工资），供面板展示"另有 X 不计入" */
        excludedSum: round2(excludedSum),
        byCategory,
        byDay,
        totalBudget,
        totalBudgetUsed: totalBudget && totalBudget > 0 ? round2(expense / totalBudget) : null,
        categoryBudgetUsed: usedCount,
        currencySymbol: settings && settings.currencySymbol || "\xA5"
      };
    }
    function budgetHint(stats) {
      const lines = [];
      if (stats.totalBudgetUsed != null) {
        const pct = Math.round(stats.totalBudgetUsed * 100);
        if (pct >= 100) lines.push(`\u26A0\uFE0F \u672C\u6708\u603B\u9884\u7B97\u5DF2\u8D85\u652F\uFF08${pct}%\uFF0C\u652F\u51FA ${stats.expense} / \u9884\u7B97 ${stats.totalBudget}\uFF09`);
        else if (pct >= 90) lines.push(`\u672C\u6708\u603B\u9884\u7B97\u5DF2\u7528 ${pct}%\uFF08\u652F\u51FA ${stats.expense} / \u9884\u7B97 ${stats.totalBudget}\uFF09\uFF0C\u6CE8\u610F\u63A7\u5236`);
      }
      return lines.join("\uFF1B");
    }
    function toCsv3(bills, symbol) {
      const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const head = "\u65E5\u671F\u65F6\u95F4,\u7C7B\u578B,\u5206\u7C7B,\u91D1\u989D(" + (symbol || "\xA5") + "),\u5907\u6CE8,\u6765\u6E90,ID";
      const rows = (bills || []).slice().sort((a, b) => a.ts - b.ts).map((b) => [
        new Date(b.ts).toLocaleString("zh-CN", { hour12: false }),
        b.type === "income" ? "\u6536\u5165" : "\u652F\u51FA",
        b.category,
        b.amount.toFixed(2),
        b.note,
        b.source || "",
        b.id
      ].map(esc).join(","));
      return [head, ...rows].join("\n");
    }
    function fmtMoney3(n, symbol) {
      return `${symbol || "\xA5"}${(Math.round(n * 100) / 100).toFixed(2)}`;
    }
    function normalizeAttachment3(raw) {
      if (!raw || typeof raw !== "object") return { error: "\u7F3A\u5C11\u9644\u4EF6\u6570\u636E" };
      const id = typeof raw.id === "string" && raw.id ? raw.id.slice(0, 60) : makeId(Date.now());
      const size = Number(raw.size);
      if (!Number.isFinite(size) || size <= 0) return { error: "\u9644\u4EF6\u5927\u5C0F\u4E0D\u5408\u6CD5" };
      if (size > MAX_ATTACHMENT_BYTES3) {
        return { error: `\u9644\u4EF6\u8FC7\u5927\uFF08${Math.round(size / 1024)}KB\uFF09\uFF0C\u5355\u5F20\u4E0A\u9650 ${Math.round(MAX_ATTACHMENT_BYTES3 / 1024)}KB` };
      }
      const name = String(raw.name || "attachment").slice(0, 120);
      const mime = String(raw.mime || (name.toLowerCase().endsWith(".png") ? "image/png" : "application/octet-stream")).slice(0, 80);
      return {
        att: {
          id,
          name,
          mime,
          size: Math.round(size),
          ts: Number.isFinite(Number(raw.ts)) && Number(raw.ts) > 0 ? Number(raw.ts) : Date.now()
        }
      };
    }
    function isImageMime3(mime) {
      return /^image\//.test(String(mime || ""));
    }
    module.exports = {
      K: K3,
      DEFAULT_CATEGORIES,
      INCOME_CATEGORIES,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      MAX_ATTACHMENT_BYTES: MAX_ATTACHMENT_BYTES3,
      dayKeyOf: dayKeyOf3,
      monthOf: monthOf3,
      shiftMonth: shiftMonth3,
      currentMonth: currentMonth3,
      makeId,
      normalizeBill: normalizeBill2,
      appendBills: appendBills2,
      removeBill: removeBill2,
      filterBills,
      computeStats: computeStats3,
      budgetHint,
      toCsv: toCsv3,
      fmtMoney: fmtMoney3,
      isExcludedFromStats,
      normalizeAttachment: normalizeAttachment3,
      isImageMime: isImageMime3
    };
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS2,
  K: () => K2,
  MAX_ATTACHMENT_BYTES: () => MAX_ATTACHMENT_BYTES2,
  addBill: () => addBill,
  billTime: () => billTime,
  computeStats: () => computeStats2,
  currentMonth: () => currentMonth2,
  dayKeyOf: () => dayKeyOf2,
  deleteAttachment: () => deleteAttachment,
  deleteBill: () => deleteBill,
  fmtMoney: () => fmtMoney2,
  fmtMonthTitle: () => fmtMonthTitle,
  getAttachment: () => getAttachment,
  isImageMime: () => isImageMime2,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet,
  loadDay: () => loadDay,
  loadMonth: () => loadMonth,
  loadSettings: () => loadSettings,
  monthOf: () => monthOf2,
  normalizeAttachment: () => normalizeAttachment2,
  saveAttachment: () => saveAttachment,
  saveSettings: () => saveSettings,
  shiftMonth: () => shiftMonth2,
  timeAgo: () => timeAgo,
  toCsv: () => toCsv2
});
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
async function loadMonth(month) {
  const keys = await kvKeys();
  const prefix = K2.dayPrefixOf(month);
  const dayKeys = keys.filter((k) => k.startsWith(prefix)).sort();
  const arrs = await Promise.all(dayKeys.map((dk) => kvGet(dk)));
  const bills = [];
  for (const arr of arrs) {
    if (Array.isArray(arr)) {
      for (const b of arr) if (b && typeof b === "object" && typeof b.amount === "number") bills.push(b);
    }
  }
  bills.sort((a, b) => a.ts - b.ts);
  return { bills, dayKeys };
}
async function loadDay(dayKey) {
  const arr = await kvGet(K2.day(dayKey));
  return Array.isArray(arr) ? arr : [];
}
async function addBill(input) {
  const settings = await loadSettings();
  const valid = [.../* @__PURE__ */ new Set([...settings.categories || [], ...settings.incomeCategories || []])];
  const norm = core.normalizeBill({ ...input, source: "panel" }, valid);
  if (norm.error || !norm.bill) return { ok: false, error: norm.error || "\u8D26\u5355\u4E0D\u5408\u6CD5" };
  const bill = norm.bill;
  const dk = K2.day(core.dayKeyOf(bill.ts));
  const existing = await kvGet(dk);
  const merged = core.appendBills(Array.isArray(existing) ? existing : [], [bill]);
  await kvSet(dk, merged);
  return {
    ok: true,
    bill,
    todayExpense: merged.filter((b) => b.type === "expense").reduce((s, b) => s + b.amount, 0),
    todayIncome: merged.filter((b) => b.type === "income").reduce((s, b) => s + b.amount, 0)
  };
}
async function deleteBill(id, month) {
  const { dayKeys } = await loadMonth(month);
  for (const dk of dayKeys) {
    const arr = await kvGet(dk);
    if (!Array.isArray(arr)) continue;
    const target = arr.find((b) => b && b.id === id);
    const { arr: next, removed } = core.removeBill(arr, id);
    if (removed) {
      await kvSet(dk, next);
      if (target && target.attachmentId) await kvDel(K2.att(target.attachmentId));
      return true;
    }
  }
  return false;
}
async function saveAttachment(raw) {
  const norm = core.normalizeAttachment({ name: raw.name, mime: raw.mime, size: raw.size });
  if (norm.error || !norm.att) return { ok: false, error: norm.error || "\u9644\u4EF6\u4E0D\u5408\u6CD5" };
  const att = norm.att;
  await kvSet(K2.att(att.id), { ...att, data: raw.data });
  return { ok: true, att };
}
async function getAttachment(id) {
  const v = await kvGet(K2.att(id));
  return v && typeof v === "object" && typeof v.data === "string" ? v : null;
}
async function deleteAttachment(id) {
  await kvDel(K2.att(id));
}
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60 * 1e3) return "\u521A\u521A";
  if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
  if (d < 24 * 3600 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(d / 864e5)} \u5929\u524D`;
}
function billTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtMonthTitle(month) {
  const [y, m] = month.split("-");
  return `${y} \u5E74 ${Number(m)} \u6708`;
}
var core, K2, DEFAULT_SETTINGS2, fmtMoney2, monthOf2, currentMonth2, shiftMonth2, computeStats2, toCsv2, dayKeyOf2, normalizeAttachment2, isImageMime2, MAX_ATTACHMENT_BYTES2;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    core = __toESM(require_ledger_core());
    K2 = core.K;
    DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
    fmtMoney2 = (n, symbol) => core.fmtMoney(n, symbol);
    monthOf2 = core.monthOf;
    currentMonth2 = core.currentMonth;
    shiftMonth2 = core.shiftMonth;
    computeStats2 = core.computeStats;
    toCsv2 = core.toCsv;
    dayKeyOf2 = core.dayKeyOf;
    normalizeAttachment2 = core.normalizeAttachment;
    isImageMime2 = core.isImageMime;
    MAX_ATTACHMENT_BYTES2 = core.MAX_ATTACHMENT_BYTES;
  }
});

// src/Panel.tsx
init_model();
import { useCallback, useEffect as useEffect2, useRef as useRef2, useState as useState4 } from "react";

// src/QuickTab.tsx
init_model();
import { useEffect, useMemo, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function QuickTab({ data, reload, showToast }) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("today");
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [today, setToday] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef(null);
  const settings = data?.settings;
  const categories = useMemo(() => {
    if (!settings) return [];
    return type === "income" ? settings.incomeCategories || [] : settings.categories || [];
  }, [settings, type]);
  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [categories, category]);
  const todayKey = dayKeyOf2(Date.now());
  const reloadToday = async () => {
    setToday(await loadDay(todayKey));
  };
  useEffect(() => {
    reloadToday();
  }, [todayKey, data?.month]);
  const pickAttachment = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES2) {
      showToast(`\u9644\u4EF6\u8FC7\u5927\uFF08${Math.round(f.size / 1024)}KB\uFF09\uFF0C\u4E0A\u9650 ${Math.round(MAX_ATTACHMENT_BYTES2 / 1024)}KB`, "bad");
      return;
    }
    if (!f.type.startsWith("image/") && !/\.(pdf|txt|md)$/i.test(f.name)) {
      showToast("\u652F\u6301\u56FE\u7247 / PDF / \u6587\u672C\uFF0C\u5176\u4ED6\u7C7B\u578B\u6682\u4E0D\u652F\u6301", "bad");
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      setAttachment({ name: f.name, mime: f.type || "application/octet-stream", data: btoa(bin), size: f.size });
      showToast(`\u5DF2\u9009\u62E9\u9644\u4EF6 ${f.name}`);
    } catch (err) {
      showToast(`\u8BFB\u53D6\u9644\u4EF6\u5931\u8D25\uFF1A${err.message}`, "bad");
    }
  };
  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast("\u8BF7\u8F93\u5165\u5927\u4E8E 0 \u7684\u91D1\u989D", "bad");
      return;
    }
    setSaving(true);
    const ts = date === "custom" && customDate ? (/* @__PURE__ */ new Date(`${customDate}T${(/* @__PURE__ */ new Date()).toTimeString().slice(0, 8)}`)).getTime() || Date.now() : date === "yesterday" ? Date.now() - 24 * 3600 * 1e3 : Date.now();
    try {
      let attachmentId;
      if (attachment) {
        const r2 = await saveAttachment(attachment);
        if (!r2.ok) {
          showToast(r2.error || "\u9644\u4EF6\u4FDD\u5B58\u5931\u8D25", "bad");
          return;
        }
        attachmentId = r2.att.id;
      }
      const r = await addBill({ amount: amt, type, category, note: note.trim(), ts, attachmentId });
      if (!r.ok) {
        if (attachmentId) await deleteAttachmentLocal(attachmentId);
        showToast(r.error || "\u8BB0\u8D26\u5931\u8D25", "bad");
        return;
      }
      setAmount("");
      setNote("");
      setAttachment(null);
      await Promise.all([reloadToday(), reload()]);
      const sym2 = settings?.currencySymbol || "\xA5";
      showToast(`\u5DF2\u8BB0${type === "income" ? "\u6536\u5165" : "\u652F\u51FA"} ${fmtMoney2(amt, sym2)}`, "good");
    } catch (e) {
      showToast(`\u8BB0\u8D26\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
    setSaving(false);
  };
  const deleteAttachmentLocal = async (id) => {
    try {
      const m = await Promise.resolve().then(() => (init_model(), model_exports));
      await m.deleteAttachment(id);
    } catch {
    }
  };
  const del = async (b) => {
    try {
      await deleteBill(b.id, data?.month || "");
      await Promise.all([reloadToday(), reload()]);
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const viewAtt = async (b) => {
    if (!b.attachmentId) return;
    try {
      const a = await getAttachment(b.attachmentId);
      if (!a) {
        showToast("\u9644\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u6E05\u7406", "bad");
        return;
      }
      setViewing(a);
    } catch (e) {
      showToast(`\u8BFB\u53D6\u9644\u4EF6\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const expSum = (today || []).filter((b) => b.type === "expense").reduce((s, b) => s + b.amount, 0);
  const incSum = (today || []).filter((b) => b.type === "income").reduce((s, b) => s + b.amount, 0);
  const sym = settings?.currencySymbol || "\xA5";
  const chipOf = (c) => {
    const excluded = settings?.excludeFromStats?.includes(c);
    return /* @__PURE__ */ jsxs("button", { className: `pl-chip ${category === c ? "on" : ""}`, onClick: () => setCategory(c), title: excluded ? "\u5DF2\u8BBE\u4E3A\u4E0D\u53C2\u4E0E\u6C47\u603B\uFF08\u7EDF\u8BA1\u6392\u9664\uFF0C\u660E\u7EC6\u4ECD\u89C1\uFF09" : void 0, children: [
      c,
      excluded ? " \u2298" : ""
    ] }, c);
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "pl-bar" }),
      "\u8BB0\u4E00\u7B14",
      /* @__PURE__ */ jsx("span", { className: "pl-hint", children: "AI \u804A\u5929\u91CC\u4E5F\u80FD\u8BB0" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "pl-card", children: /* @__PURE__ */ jsxs("div", { className: "pl-card-b", children: [
      /* @__PURE__ */ jsx("div", { className: "pl-row", style: { justifyContent: "center" }, children: /* @__PURE__ */ jsxs("div", { className: "pl-toggle", children: [
        /* @__PURE__ */ jsx("button", { className: type === "expense" ? "on-exp" : "", onClick: () => setType("expense"), children: "\u652F\u51FA" }),
        /* @__PURE__ */ jsx("button", { className: type === "income" ? "on-inc" : "", onClick: () => setType("income"), children: "\u6536\u5165" })
      ] }) }),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "pl-amount-inp",
          inputMode: "decimal",
          placeholder: "0.00",
          value: amount,
          onChange: (e) => {
            if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value);
          }
        }
      ),
      /* @__PURE__ */ jsx("label", { className: "pl-lbl", children: "\u5206\u7C7B" }),
      /* @__PURE__ */ jsx("div", { className: "pl-row", children: categories.map(chipOf) }),
      settings?.excludeFromStats?.includes(category) && /* @__PURE__ */ jsx("div", { className: "pl-sub", style: { marginTop: 6 }, children: '\u2298 \u8BE5\u5206\u7C7B\u5DF2\u8BBE\u4E3A"\u4E0D\u53C2\u4E0E\u6C47\u603B"\uFF1A\u8D26\u5355\u7167\u8BB0\u3001\u660E\u7EC6\u7167\u89C1\uFF0C\u4F46\u7EDF\u8BA1/\u7ED3\u4F59/\u6392\u884C\u4E0D\u8BA1\u5165\u3002' }),
      /* @__PURE__ */ jsx("label", { className: "pl-lbl", children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx("input", { className: "pl-inp", value: note, onChange: (e) => setNote(e.target.value), placeholder: "\u5348\u996D / \u6253\u8F66 / \u732B\u7CAE\u2026" }),
      /* @__PURE__ */ jsx("label", { className: "pl-lbl", children: "\u9644\u4EF6\uFF08\u5C0F\u7968/\u622A\u56FE\uFF0C\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ jsxs("div", { className: "pl-row", children: [
        /* @__PURE__ */ jsx("input", { ref: fileRef, type: "file", hidden: true, accept: "image/*,.pdf,.txt,.md", onChange: pickAttachment }),
        /* @__PURE__ */ jsx("button", { className: "pl-btn sm ghost", onClick: () => fileRef.current?.click(), children: attachment ? `\u5DF2\u9009\uFF1A${attachment.name}` : "\u9009\u62E9\u9644\u4EF6" }),
        attachment && /* @__PURE__ */ jsx("button", { className: "pl-btn sm danger", onClick: () => setAttachment(null), children: "\u6E05\u9664" })
      ] }),
      attachment && /* @__PURE__ */ jsxs("div", { className: "pl-sub", style: { marginTop: 6 }, children: [
        Math.round(attachment.size / 1024),
        "KB \xB7 \u968F\u8FD9\u7B14\u8D26\u4E00\u8D77\u4FDD\u5B58"
      ] }),
      /* @__PURE__ */ jsx("label", { className: "pl-lbl", children: "\u65E5\u671F" }),
      /* @__PURE__ */ jsxs("div", { className: "pl-row", children: [
        [["today", "\u4ECA\u5929"], ["yesterday", "\u6628\u5929"], ["custom", "\u9009\u65E5\u671F"]].map(([v, label]) => /* @__PURE__ */ jsx("button", { className: `pl-chip ${date === v ? "on" : ""}`, onClick: () => setDate(v), children: label }, v)),
        date === "custom" && /* @__PURE__ */ jsx("input", { type: "date", className: "pl-sel", value: customDate, onChange: (e) => setCustomDate(e.target.value) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "pl-row", style: { marginTop: 12 }, children: /* @__PURE__ */ jsx("button", { className: "pl-btn", style: { flex: 1 }, disabled: saving, onClick: save, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : `\u8BB0\u4E00\u7B14${date !== "today" ? "\uFF08\u8865\u8BB0\uFF09" : ""}` }) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "pl-bar" }),
      "\u4ECA\u65E5",
      /* @__PURE__ */ jsxs("span", { className: "pl-hint", children: [
        "\u652F\u51FA ",
        fmtMoney2(expSum, sym),
        " \xB7 \u6536\u5165 ",
        fmtMoney2(incSum, sym)
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "pl-card", children: /* @__PURE__ */ jsx("div", { className: "pl-card-b", children: !today || !today.length ? /* @__PURE__ */ jsx("div", { className: "pl-empty", style: { padding: "14px 0" }, children: "\u4ECA\u5929\u8FD8\u6CA1\u6709\u8D26\u5355\u3002" }) : today.slice().sort((a, b) => b.ts - a.ts).map((b) => /* @__PURE__ */ jsxs("div", { className: "pl-bill", children: [
      /* @__PURE__ */ jsxs("div", { className: "pl-bill-main", children: [
        /* @__PURE__ */ jsxs("b", { children: [
          b.category,
          b.note ? ` \xB7 ${b.note}` : ""
        ] }),
        /* @__PURE__ */ jsxs("small", { children: [
          billTime(b.ts),
          " \xB7 ",
          timeAgo(b.ts),
          b.source === "ai" ? " \xB7 AI \u8BB0" : "",
          b.attachmentId && /* @__PURE__ */ jsx("button", { className: "pl-attlink", onClick: () => viewAtt(b), children: " \xB7 \u{1F4CE} \u67E5\u770B\u9644\u4EF6" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: `pl-bill-amt ${b.type === "income" ? "pl-amt-inc" : "pl-amt-exp"}`, children: [
        b.type === "income" ? "+" : "-",
        fmtMoney2(b.amount, sym)
      ] }),
      /* @__PURE__ */ jsx("button", { className: "pl-btn sm danger", onClick: () => del(b), children: "\u5220" })
    ] }, b.id)) }) }),
    viewing && /* @__PURE__ */ jsx("div", { className: "pl-attmodal", onClick: () => setViewing(null), children: /* @__PURE__ */ jsxs("div", { className: "pl-attmodal-box", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "pl-attmodal-head", children: [
        /* @__PURE__ */ jsx("b", { children: viewing.name }),
        /* @__PURE__ */ jsx("button", { className: "pl-btn sm ghost", onClick: () => setViewing(null), children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "pl-attmodal-body", children: isImageMime2(viewing.mime) ? /* @__PURE__ */ jsx("img", { src: `data:${viewing.mime};base64,${viewing.data}`, alt: viewing.name }) : /* @__PURE__ */ jsxs("a", { className: "pl-btn sm ghost", href: `data:${viewing.mime};base64,${viewing.data}`, download: viewing.name, children: [
        "\u4E0B\u8F7D ",
        viewing.name
      ] }) })
    ] }) })
  ] });
}

// src/ListTab.tsx
init_model();
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ListTab({ data, month, switchMonth, reload, showToast }) {
  const [catFilter, setCatFilter] = useState2("");
  const [typeFilter, setTypeFilter] = useState2("");
  const [viewing, setViewing] = useState2(null);
  const sym = data?.settings.currencySymbol || "\xA5";
  const categories = useMemo2(() => {
    const set = /* @__PURE__ */ new Set();
    for (const b of data?.bills || []) set.add(b.category);
    return [...set];
  }, [data?.bills]);
  const shown = (data?.bills || []).filter((b) => (!catFilter || b.category === catFilter) && (!typeFilter || b.type === typeFilter)).sort((a, b) => b.ts - a.ts);
  const groups = useMemo2(() => {
    const map = /* @__PURE__ */ new Map();
    for (const b of shown) {
      const d = new Date(b.ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    }
    return [...map.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [shown]);
  const net = shown.reduce((s, b) => s + (b.type === "income" ? b.amount : -b.amount), 0);
  const del = async (b) => {
    if (!window.confirm(`\u5220\u9664\u300C${b.category} ${fmtMoney2(b.amount, sym)}\u300D\u8FD9\u7B14\u8D26\uFF1F${b.attachmentId ? "\uFF08\u542B\u9644\u4EF6\u4E00\u5E76\u5220\u9664\uFF09" : ""}`)) return;
    try {
      const ok = await deleteBill(b.id, month);
      if (ok) {
        await reload(month);
        showToast("\u5DF2\u5220\u9664");
      } else showToast("\u672A\u627E\u5230\u8BE5\u8D26\u5355", "bad");
    } catch (e) {
      showToast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const viewAtt = async (b) => {
    if (!b.attachmentId) return;
    try {
      const a = await getAttachment(b.attachmentId);
      if (!a) {
        showToast("\u9644\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u6E05\u7406", "bad");
        return;
      }
      setViewing(a);
    } catch (e) {
      showToast(`\u8BFB\u53D6\u9644\u4EF6\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const copyCsv = async () => {
    const csv = toCsv2(shown, sym);
    try {
      await navigator.clipboard.writeText(csv);
      showToast(`\u5DF2\u590D\u5236 ${shown.length} \u7B14 CSV \u5230\u526A\u8D34\u677F`, "good");
    } catch {
      showToast("\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF08HTTPS/\u6743\u9650\u53D7\u9650\uFF09", "bad");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "pl-monthnav", children: [
      /* @__PURE__ */ jsx2("button", { className: "pl-navbtn", onClick: () => switchMonth(-1), children: "\u2039" }),
      /* @__PURE__ */ jsx2("b", { children: fmtMonthTitle(month) }),
      /* @__PURE__ */ jsx2("button", { className: "pl-navbtn", onClick: () => switchMonth(1), children: "\u203A" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "pl-row", style: { padding: "0 18px 8px" }, children: [
      /* @__PURE__ */ jsxs2("select", { className: "pl-sel", value: catFilter, onChange: (e) => setCatFilter(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u5206\u7C7B" }),
        categories.map((c) => /* @__PURE__ */ jsx2("option", { value: c, children: c }, c))
      ] }),
      /* @__PURE__ */ jsxs2("select", { className: "pl-sel", value: typeFilter, onChange: (e) => setTypeFilter(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u652F\u51FA+\u6536\u5165" }),
        /* @__PURE__ */ jsx2("option", { value: "expense", children: "\u4EC5\u652F\u51FA" }),
        /* @__PURE__ */ jsx2("option", { value: "income", children: "\u4EC5\u6536\u5165" })
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "pl-btn sm ghost", onClick: copyCsv, children: "\u5BFC\u51FA CSV" })
    ] }),
    !groups.length && /* @__PURE__ */ jsx2("div", { className: "pl-empty", children: "\u672C\u6708\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8D26\u5355\u3002" }),
    groups.map(([day, bills]) => {
      const dayNet = bills.reduce((s, b) => s + (b.type === "income" ? b.amount : -b.amount), 0);
      return /* @__PURE__ */ jsx2("div", { className: "pl-card", children: /* @__PURE__ */ jsxs2("div", { className: "pl-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "pl-dayhead", children: [
          /* @__PURE__ */ jsx2("b", { children: day.slice(5).replace("-", "/") }),
          /* @__PURE__ */ jsx2("span", { children: (/* @__PURE__ */ new Date(day + "T12:00:00")).toLocaleDateString("zh-CN", { weekday: "short" }) }),
          /* @__PURE__ */ jsxs2("span", { className: "sum", children: [
            "\u51C0 ",
            dayNet >= 0 ? "+" : "",
            fmtMoney2(dayNet, sym)
          ] })
        ] }),
        bills.slice().sort((a, b) => b.ts - a.ts).map((b) => /* @__PURE__ */ jsxs2("div", { className: "pl-bill", children: [
          /* @__PURE__ */ jsxs2("div", { className: "pl-bill-main", children: [
            /* @__PURE__ */ jsxs2("b", { children: [
              b.category,
              b.note ? ` \xB7 ${b.note}` : ""
            ] }),
            /* @__PURE__ */ jsxs2("small", { children: [
              billTime(b.ts),
              b.source === "ai" ? " \xB7 AI \u8BB0" : "",
              b.source === "panel" ? " \xB7 \u9762\u677F\u8BB0" : "",
              b.attachmentId && /* @__PURE__ */ jsx2("button", { className: "pl-attlink", onClick: () => viewAtt(b), children: " \xB7 \u{1F4CE} \u67E5\u770B\u9644\u4EF6" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("span", { className: `pl-bill-amt ${b.type === "income" ? "pl-amt-inc" : "pl-amt-exp"}`, children: [
            b.type === "income" ? "+" : "-",
            fmtMoney2(b.amount, sym)
          ] }),
          /* @__PURE__ */ jsx2("button", { className: "pl-btn sm danger", onClick: () => del(b), children: "\u5220" })
        ] }, b.id))
      ] }) }, day);
    }),
    !!shown.length && /* @__PURE__ */ jsxs2("div", { className: "pl-sub", style: { textAlign: "center", padding: "4px 0 12px" }, children: [
      "\u5171 ",
      shown.length,
      " \u7B14 \xB7 \u51C0\u989D ",
      net >= 0 ? "+" : "",
      fmtMoney2(net, sym)
    ] }),
    viewing && /* @__PURE__ */ jsx2("div", { className: "pl-attmodal", onClick: () => setViewing(null), children: /* @__PURE__ */ jsxs2("div", { className: "pl-attmodal-box", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs2("div", { className: "pl-attmodal-head", children: [
        /* @__PURE__ */ jsx2("b", { children: viewing.name }),
        /* @__PURE__ */ jsx2("button", { className: "pl-btn sm ghost", onClick: () => setViewing(null), children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "pl-attmodal-body", children: isImageMime2(viewing.mime) ? /* @__PURE__ */ jsx2("img", { src: `data:${viewing.mime};base64,${viewing.data}`, alt: viewing.name }) : /* @__PURE__ */ jsxs2("a", { className: "pl-btn sm ghost", href: `data:${viewing.mime};base64,${viewing.data}`, download: viewing.name, children: [
        "\u4E0B\u8F7D ",
        viewing.name
      ] }) })
    ] }) })
  ] });
}

// src/StatsTab.tsx
init_model();
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function StatsTab({ data, month, switchMonth }) {
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "pl-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.stats;
  const sym = s.currencySymbol;
  const maxDay = Math.max(...s.byDay.map((d) => d.expense), 1);
  const peakDay = s.byDay.slice().sort((a, b) => b.expense - a.expense)[0];
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "pl-monthnav", children: [
      /* @__PURE__ */ jsx3("button", { className: "pl-navbtn", onClick: () => switchMonth(-1), children: "\u2039" }),
      /* @__PURE__ */ jsx3("b", { children: fmtMonthTitle(month) }),
      /* @__PURE__ */ jsx3("button", { className: "pl-navbtn", onClick: () => switchMonth(1), children: "\u203A" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "pl-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "pl-card-b", style: { display: "flex", textAlign: "center" }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx3("div", { className: "pl-sub", children: "\u652F\u51FA" }),
          /* @__PURE__ */ jsx3("b", { className: "pl-amt-exp", style: { fontSize: 16 }, children: fmtMoney2(s.expense, sym) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, borderLeft: "1px solid #1d2330" }, children: [
          /* @__PURE__ */ jsx3("div", { className: "pl-sub", children: "\u6536\u5165" }),
          /* @__PURE__ */ jsx3("b", { className: "pl-amt-inc", style: { fontSize: 16 }, children: fmtMoney2(s.income, sym) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, borderLeft: "1px solid #1d2330" }, children: [
          /* @__PURE__ */ jsx3("div", { className: "pl-sub", children: "\u7ED3\u4F59" }),
          /* @__PURE__ */ jsx3("b", { style: { fontSize: 16 }, className: s.balance < 0 ? "pl-amt-exp" : "pl-amt-inc", children: fmtMoney2(s.balance, sym) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { style: { flex: 0.8, borderLeft: "1px solid #1d2330" }, children: [
          /* @__PURE__ */ jsx3("div", { className: "pl-sub", children: "\u7B14\u6570" }),
          /* @__PURE__ */ jsx3("b", { style: { fontSize: 16 }, children: s.count })
        ] })
      ] }),
      !!s.excludedSum && /* @__PURE__ */ jsxs3("div", { className: "pl-sub", style: { textAlign: "center", padding: "6px 0 2px", borderTop: "1px solid #1d2330" }, children: [
        "\u53E6\u6709 ",
        fmtMoney2(s.excludedSum, sym),
        " \u4E0D\u53C2\u4E0E\u6C47\u603B\uFF08\u5DF2\u6392\u9664\u5206\u7C7B\uFF0C\u5982\u5DE5\u8D44\uFF09\uFF0C\u672A\u8BA1\u5165\u4E0A\u65B9\u7ED3\u4F59"
      ] })
    ] }),
    s.totalBudget != null && s.totalBudget > 0 && /* @__PURE__ */ jsx3("div", { className: "pl-card", children: /* @__PURE__ */ jsxs3("div", { className: "pl-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "pl-row", children: [
        /* @__PURE__ */ jsx3("b", { style: { fontSize: 12.5 }, children: "\u6708\u5EA6\u603B\u9884\u7B97" }),
        /* @__PURE__ */ jsxs3("span", { className: "pl-hint", children: [
          fmtMoney2(s.expense, sym),
          " / ",
          fmtMoney2(s.totalBudget, sym),
          " \xB7 ",
          Math.round((s.totalBudgetUsed || 0) * 100),
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "pl-budget", children: /* @__PURE__ */ jsx3("i", { className: (s.totalBudgetUsed || 0) > 1 ? "over" : (s.totalBudgetUsed || 0) > 0.9 ? "warn" : "", style: { width: `${Math.min(100, (s.totalBudgetUsed || 0) * 100)}%` } }) })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "pl-bar" }),
      "\u5206\u7C7B\u6392\u884C",
      /* @__PURE__ */ jsx3("span", { className: "pl-hint", children: "\u6309\u652F\u51FA\u91D1\u989D" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "pl-card", children: /* @__PURE__ */ jsxs3("div", { className: "pl-card-b", children: [
      s.byCategory.filter((c) => c.type === "expense").length === 0 && /* @__PURE__ */ jsx3("div", { className: "pl-empty", style: { padding: "10px 0" }, children: "\u672C\u6708\u8FD8\u6CA1\u6709\u652F\u51FA\u3002" }),
      s.byCategory.filter((c) => c.type === "expense").map((c) => {
        const used = c.budget != null && c.budget > 0 ? c.sum / c.budget : null;
        return /* @__PURE__ */ jsxs3("div", { style: { padding: "7px 0", borderTop: "1px solid #1d2330" }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "pl-row", children: [
            /* @__PURE__ */ jsxs3("b", { style: { fontSize: 12.5, flex: 1 }, children: [
              c.category,
              " ",
              c.excluded && /* @__PURE__ */ jsx3("span", { className: "pl-sub", children: "\u2298 \u4E0D\u53C2\u4E0E\u6C47\u603B" }),
              " ",
              /* @__PURE__ */ jsxs3("span", { className: "pl-sub", children: [
                "\xD7",
                c.count
              ] })
            ] }),
            /* @__PURE__ */ jsx3("span", { style: { fontVariantNumeric: "tabular-nums", fontWeight: 700 }, children: fmtMoney2(c.sum, sym) }),
            c.budget != null && /* @__PURE__ */ jsxs3("span", { className: "pl-sub", children: [
              Math.round((used || 0) * 100),
              "% \u9884\u7B97"
            ] })
          ] }),
          used != null && /* @__PURE__ */ jsx3("div", { className: "pl-budget", children: /* @__PURE__ */ jsx3("i", { className: used > 1 ? "over" : used > 0.9 ? "warn" : "", style: { width: `${Math.min(100, used * 100)}%` } }) })
        ] }, c.category);
      })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "pl-bar" }),
      "\u6BCF\u65E5\u652F\u51FA",
      /* @__PURE__ */ jsx3("span", { className: "pl-hint", children: peakDay && peakDay.expense > 0 ? `\u5CF0\u503C ${peakDay.date.slice(5)} ${fmtMoney2(peakDay.expense, sym)}` : "" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "pl-card", children: /* @__PURE__ */ jsxs3("div", { className: "pl-card-b", children: [
      /* @__PURE__ */ jsx3("div", { className: "pl-bars", children: s.byDay.map((d) => /* @__PURE__ */ jsx3("div", { className: "pl-barcol", title: `${d.date}\uFF1A${fmtMoney2(d.expense, sym)}`, children: /* @__PURE__ */ jsx3("i", { style: { height: `${Math.max(2, d.expense / maxDay * 100)}%`, opacity: d.expense > 0 ? 1 : 0.25 } }) }, d.date)) }),
      /* @__PURE__ */ jsxs3("div", { className: "pl-row", style: { justifyContent: "space-between", marginTop: 4 }, children: [
        /* @__PURE__ */ jsx3("small", { className: "pl-sub", children: "1" }),
        /* @__PURE__ */ jsx3("small", { className: "pl-sub", children: s.byDay.length })
      ] })
    ] }) })
  ] });
}

// src/SettingsTab.tsx
init_model();
import { useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [newCat, setNewCat] = useState3("");
  const [newCatType, setNewCatType] = useState3("expense");
  const [draftBudgets, setDraftBudgets] = useState3(null);
  const [draftTotal, setDraftTotal] = useState3(null);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "pl-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.settings;
  const sym = s.currencySymbol;
  const budgets = draftBudgets ?? Object.fromEntries(
    Object.entries(s.budgets || {}).map(([k, v]) => [k, String(v)])
  );
  const total = draftTotal ?? (s.monthlyTotalBudget != null ? String(s.monthlyTotalBudget) : "");
  const persistBudgets = async (nextBudgets, nextTotal) => {
    await saveSettings({ ...s, budgets: nextBudgets, monthlyTotalBudget: nextTotal });
    await reload();
    showToast("\u9884\u7B97\u5DF2\u4FDD\u5B58\uFF08AI \u8BB0\u8D26\u4E5F\u4F1A\u5373\u65F6\u751F\u6548\uFF09", "good");
  };
  const commitBudgets = () => {
    const next = {};
    for (const [k, v] of Object.entries(budgets)) {
      const n = Number(v);
      if (v !== "" && Number.isFinite(n) && n > 0) next[k] = n;
    }
    const t = total.trim() === "" ? null : Number(total);
    void persistBudgets(next, t != null && Number.isFinite(t) && t > 0 ? t : null);
  };
  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    if (newCatType === "expense") {
      if (s.categories.includes(name)) {
        showToast("\u5206\u7C7B\u5DF2\u5B58\u5728", "bad");
        return;
      }
      await saveSettings({ ...s, categories: [...s.categories, name] });
    } else {
      if (s.incomeCategories.includes(name)) {
        showToast("\u5206\u7C7B\u5DF2\u5B58\u5728", "bad");
        return;
      }
      await saveSettings({ ...s, incomeCategories: [...s.incomeCategories, name] });
    }
    setNewCat("");
    await reload();
    showToast(`\u5DF2\u6DFB\u52A0\u5206\u7C7B\u300C${name}\u300D`, "good");
  };
  const removeCategory = async (name, isIncome) => {
    const builtin = [...isIncome ? ["\u5DE5\u8D44", "\u7406\u8D22", "\u7EA2\u5305", "\u9000\u6B3E", "\u5176\u4ED6\u6536\u5165"] : ["\u9910\u996E", "\u4EA4\u901A", "\u8D2D\u7269", "\u5C45\u4F4F", "\u5A31\u4E50", "\u533B\u7597", "\u5B66\u4E60", "\u4EBA\u60C5", "\u5176\u4ED6"]];
    if (builtin.includes(name)) {
      showToast("\u5185\u7F6E\u5206\u7C7B\u4E0D\u53EF\u5220\u9664", "bad");
      return;
    }
    const exclude = (s.excludeFromStats || []).filter((c) => c !== name);
    if (isIncome) await saveSettings({ ...s, incomeCategories: s.incomeCategories.filter((c) => c !== name), excludeFromStats: exclude });
    else {
      const budgets2 = { ...s.budgets || {} };
      delete budgets2[name];
      await saveSettings({ ...s, categories: s.categories.filter((c) => c !== name), budgets: budgets2, excludeFromStats: exclude });
    }
    await reload();
    showToast(`\u5DF2\u5220\u9664\u5206\u7C7B\u300C${name}\u300D`);
  };
  const toggleExclude = async (name) => {
    const cur = s.excludeFromStats || [];
    const next = cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name];
    await saveSettings({ ...s, excludeFromStats: next });
    await reload();
    showToast(next.includes(name) ? `\u300C${name}\u300D\u5DF2\u8BBE\u4E3A\u4E0D\u53C2\u4E0E\u6C47\u603B\uFF08\u8D26\u5355\u7167\u8BB0\uFF0C\u7EDF\u8BA1\u6392\u9664\uFF09` : `\u300C${name}\u300D\u5DF2\u6062\u590D\u53C2\u4E0E\u6C47\u603B`, "good");
  };
  const exportAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith(K2.dayPrefix)).sort();
      const dump = {
        exportedAt: Date.now(),
        settings: s,
        days: {}
      };
      for (const k of keys) {
        dump.days[k.slice(K2.dayPrefix.length)] = await kvGet(k);
      }
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      showToast(`\u5DF2\u590D\u5236 ${keys.length} \u5929\u8D26\u76EE JSON \u5230\u526A\u8D34\u677F`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const clearAll = async () => {
    if (!window.confirm("\u6E05\u7A7A\u65E5\u5E38\u8BB0\u8D26\u5168\u90E8\u6570\u636E\uFF08\u8D26\u5355+\u8BBE\u7F6E+\u9644\u4EF6\uFF09\uFF1F\u4E0D\u53EF\u6062\u590D\uFF0C\u5EFA\u8BAE\u5148\u5BFC\u51FA\u3002")) return;
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("ledger."));
      await Promise.all(keys.map((k) => kvDel(k)));
      await reload();
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u8D26\u672C\u6570\u636E");
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const excluded = s.excludeFromStats || [];
  const excludeChip = (c, isIncome) => /* @__PURE__ */ jsxs4("span", { className: `pl-chip ${excluded.includes(c) ? "on" : ""}`, onClick: () => toggleExclude(c), title: "\u70B9\u51FB\u5207\u6362\uFF1A\u8D26\u5355\u7167\u8BB0\u3001\u660E\u7EC6\u7167\u89C1\uFF0C\u4F46\u7EDF\u8BA1/\u7ED3\u4F59/\u6392\u884C\u4E0D\u8BA1\u5165", children: [
    excluded.includes(c) ? "\u2298 " : "",
    c
  ] }, c);
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "pl-bar" }),
      "\u652F\u51FA\u5206\u7C7B",
      /* @__PURE__ */ jsxs4("span", { className: "pl-hint", children: [
        s.categories.length,
        " \u4E2A"
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "pl-card", children: /* @__PURE__ */ jsxs4("div", { className: "pl-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "pl-row", children: s.categories.map((c) => /* @__PURE__ */ jsxs4("span", { className: "pl-chip", style: { paddingRight: 6 }, children: [
        c,
        /* @__PURE__ */ jsx4(
          "button",
          {
            onClick: () => removeCategory(c, false),
            style: { background: "none", border: "none", color: "#5C6678", cursor: "pointer", padding: "0 2px", fontSize: 11 },
            children: "\xD7"
          }
        )
      ] }, c)) }),
      /* @__PURE__ */ jsxs4("div", { className: "pl-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "pl-inp", style: { maxWidth: 140 }, value: newCat, onChange: (e) => setNewCat(e.target.value), placeholder: "\u65B0\u5206\u7C7B\u540D" }),
        /* @__PURE__ */ jsxs4("button", { className: "pl-btn sm", onClick: addCategory, children: [
          "\u6DFB\u52A0",
          newCatType === "income" ? "\u6536\u5165\u7C7B" : "\u652F\u51FA\u7C7B"
        ] }),
        /* @__PURE__ */ jsx4("button", { className: `pl-chip ${newCatType === "income" ? "on" : ""}`, onClick: () => setNewCatType(newCatType === "income" ? "expense" : "income"), children: newCatType === "income" ? "\u6536 \u2192 \u652F" : "\u652F \u2192 \u6536" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "pl-sub", style: { marginTop: 8 }, children: [
        "\u6536\u5165\u5206\u7C7B\uFF1A",
        s.incomeCategories.join(" / ")
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "pl-bar" }),
      "\u4E0D\u53C2\u4E0E\u6C47\u603B",
      /* @__PURE__ */ jsx4("span", { className: "pl-hint", children: "\u70B9\u51FB\u5207\u6362\uFF0C\u5982\u5DE5\u8D44" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "pl-card", children: /* @__PURE__ */ jsxs4("div", { className: "pl-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "pl-sub", style: { marginBottom: 8 }, children: '\u8BBE\u4E3A"\u4E0D\u53C2\u4E0E\u6C47\u603B"\u7684\u5206\u7C7B\uFF0C\u8D26\u5355\u7167\u8BB0\u3001\u660E\u7EC6\u7167\u89C1\uFF0C\u4F46\u7EDF\u8BA1/\u7ED3\u4F59/\u5206\u7C7B\u6392\u884C/\u9010\u65E5\u8D8B\u52BF\u5168\u90E8\u4E0D\u8BA1\u5165\uFF08\u907F\u514D\u5DE5\u8D44\u865A\u9AD8\u7ED3\u4F59\uFF09\u3002' }),
      /* @__PURE__ */ jsxs4("div", { className: "pl-row", children: [
        s.categories.map((c) => excludeChip(c, false)),
        s.incomeCategories.map((c) => excludeChip(c, true))
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "pl-bar" }),
      "\u6708\u9884\u7B97",
      /* @__PURE__ */ jsx4("span", { className: "pl-hint", children: "AI \u8BB0\u8D26\u4F1A\u5373\u65F6\u63D0\u9192" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "pl-card", children: /* @__PURE__ */ jsxs4("div", { className: "pl-card-b", style: { padding: 0 }, children: [
      s.categories.map((c) => /* @__PURE__ */ jsxs4("div", { className: "pl-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "pl-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: c }),
          /* @__PURE__ */ jsx4("small", { children: "\u6708\u9884\u7B97\uFF08\u7559\u7A7A\u4E0D\u9650\u5236\uFF09" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "pl-num",
            inputMode: "decimal",
            placeholder: "\u4E0D\u9650",
            value: budgets[c] ?? "",
            onChange: (e) => setDraftBudgets({ ...budgets, [c]: e.target.value })
          }
        )
      ] }, c)),
      /* @__PURE__ */ jsxs4("div", { className: "pl-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "pl-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: "\u6708\u5EA6\u603B\u9884\u7B97" }),
          /* @__PURE__ */ jsx4("small", { children: "\u6240\u6709\u652F\u51FA\u5408\u8BA1\u7684\u4E0A\u9650" })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "pl-num",
            inputMode: "decimal",
            placeholder: "\u4E0D\u9650",
            value: total,
            onChange: (e) => setDraftTotal(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "pl-actions", style: { padding: "10px 13px" }, children: [
        /* @__PURE__ */ jsx4("button", { className: "pl-btn sm", onClick: commitBudgets, children: "\u4FDD\u5B58\u9884\u7B97" }),
        /* @__PURE__ */ jsxs4("span", { className: "pl-sub", children: [
          "\u793A\u4F8B\uFF1A\u9910\u996E 2000 = \u6BCF\u6708\u9910\u996E\u5230 ",
          fmtMoney2(2e3, sym),
          " \u63D0\u9192"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "pl-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "pl-card", children: /* @__PURE__ */ jsxs4("div", { className: "pl-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "pl-state pl-sub", children: "\u8D26\u672C\u5B8C\u5168\u5B58\u4E8E\u672C\u673A\uFF08cap.kv ledger.*\uFF09\uFF0C\u4E0D\u51FA\u8BBE\u5907\uFF1BAI \u4E0E\u9762\u677F\u8BFB\u5199\u540C\u4E00\u4EFD\u3002" }),
      /* @__PURE__ */ jsxs4("div", { className: "pl-actions", children: [
        /* @__PURE__ */ jsx4("button", { className: "pl-btn sm ghost", onClick: exportAll, children: "\u5BFC\u51FA\u5168\u90E8 JSON" }),
        /* @__PURE__ */ jsx4("button", { className: "pl-btn sm danger", onClick: clearAll, children: "\u6E05\u7A7A\u8D26\u672C" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "pl-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "pl-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "pl-card", children: /* @__PURE__ */ jsxs4("div", { className: "pl-card-b pl-sub", children: [
      '\u65E5\u5E38\u8BB0\u8D26 pocket-ledger v0.2.0 \u2014\u2014 \u5BF9\u8BDD\u5F0F\u8BB0\u8D26\uFF1A\u804A\u5929\u91CC\u8BF4"\u5348\u996D 35"\u5C31\u5165\u8D26\uFF0C"\u4E0A\u6708\u5496\u5561\u82B1\u4E86\u591A\u5C11"\u5C31\u80FD\u67E5\u3002',
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u96F6\u540E\u53F0\u670D\u52A1\u3001\u96F6\u7F51\u7EDC\u8BF7\u6C42\uFF0C\u7EAF\u672C\u5730\u8D26\u672C\uFF08\u63D2\u4EF6\u89C4\u8303\u63A8\u8350\u7684\u65E0\u72B6\u6001\u6A21\u5F0F\uFF09\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      '\xB7 \u652F\u6301"\u4E0D\u53C2\u4E0E\u6C47\u603B"\u5206\u7C7B\uFF08\u5982\u5DE5\u8D44\uFF09\u4E0E\u9644\u4EF6\uFF08\u5C0F\u7968/\u622A\u56FE\uFF0C\u70B9\u5F00\u624D\u53D6\uFF0C\u9ED8\u8BA4\u4E0D\u62C9\u56FE\uFF09\uFF1B',
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u9762\u677F\u4E0E AI\uFF08MCP\uFF09\u8D70\u540C\u4E00\u5957\u8BA1\u7B97\u6838\u5FC3\uFF0C\u53E3\u5F84\u6C38\u8FDC\u4E00\u81F4\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u684C\u9762\u4E0E\u624B\u673A Web \u7ECF cap.kv \u770B\u5230\u540C\u4E00\u672C\u8D26\uFF1B\u53CC\u7AEF\u540C\u65F6\u8BB0\u8D26\u7684\u5408\u5E76\u6309\u8D26\u5355 id \u5E42\u7B49\u53BB\u91CD\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.pl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pl-body::-webkit-scrollbar{width:9px;height:9px}
.pl-body::-webkit-scrollbar-track{background:transparent}
.pl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pl-page{max-width:520px;margin:0 auto}
.pl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.pl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E8A33D,#D2691E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.pl-tt{flex:1;min-width:0}
.pl-tt b{font-size:15px;display:block}
.pl-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.pl-balance{font-variant-numeric:tabular-nums}
.pl-balance b{color:#E6EAF2}
.pl-balance .neg{color:#F85149}
.pl-balance .pos{color:#3FB950}
.pl-tabs{display:flex;gap:4px}
.pl-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.pl-tab:hover{color:#E6EAF2}
.pl-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pl-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.pl-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E8A33D,#D2691E);flex-shrink:0}
.pl-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.pl-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pl-card-b{padding:11px 13px}
.pl-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.pl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pl-btn{background:#b0731f;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.pl-btn:hover{filter:brightness(1.1)}
.pl-btn:disabled{opacity:.45;cursor:not-allowed}
.pl-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pl-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.pl-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.pl-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pl-inp:focus{outline:none;border-color:#b0731f}
.pl-inp::placeholder{color:#4d5566}
.pl-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.pl-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.pl-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.pl-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pl-toast.bad{border-color:#54262c;color:#FF8A9A}
.pl-toast.good{border-color:#2b4a35;color:#7EE2A0}
.pl-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.pl-chip:hover{border-color:#3a4356}
.pl-chip.on{background:#3a2b14;border-color:#b0731f;color:#F2C063;font-weight:600}
.pl-toggle{display:flex;border:1px solid #2a2f3a;border-radius:9px;overflow:hidden;flex-shrink:0}
.pl-toggle button{border:none;background:#12151c;color:#8B95A7;font-size:12px;padding:7px 16px;cursor:pointer}
.pl-toggle button.on-exp{background:#3a1d22;color:#FF8A9A;font-weight:700}
.pl-toggle button.on-inc{background:#16301f;color:#7EE2A0;font-weight:700}
.pl-amount-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:10px;color:#E6EAF2;font-size:26px;font-weight:700;padding:9px 12px;width:100%;text-align:center;font-variant-numeric:tabular-nums}
.pl-amount-inp:focus{outline:none;border-color:#b0731f}
.pl-bill{display:flex;align-items:center;gap:9px;padding:8px 2px;border-top:1px solid #1d2330}
.pl-bill:first-child{border-top:none}
.pl-bill-main{flex:1;min-width:0}
.pl-bill-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-bill-main small{color:#5C6678;font-size:10px}
.pl-bill-amt{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;flex-shrink:0}
.pl-amt-exp{color:#FF8A9A}
.pl-amt-inc{color:#7EE2A0}
.pl-dayhead{display:flex;align-items:center;gap:8px;padding:10px 2px 4px;font-size:10.5px;color:#5C6678}
.pl-dayhead b{color:#8B95A7}
.pl-dayhead .sum{margin-left:auto;font-variant-numeric:tabular-nums}
.pl-budget{height:7px;border-radius:4px;background:#1C2330;overflow:hidden;margin-top:4px}
.pl-budget i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3FB950,#7EE2A0)}
.pl-budget i.warn{background:#D29922}
.pl-budget i.over{background:#F85149}
.pl-bars{display:flex;align-items:flex-end;gap:3px;height:88px;padding:6px 2px 0}
.pl-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.pl-barcol i{display:block;width:100%;max-width:16px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#E8A33D,#b0731f);min-height:2px}
.pl-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.pl-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.pl-field:first-child{border-top:none}
.pl-field-l{flex:1;min-width:0}
.pl-field-l b{font-size:12.5px;display:block}
.pl-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.pl-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.pl-monthnav{display:flex;align-items:center;gap:10px;padding:2px 18px 8px}
.pl-monthnav b{font-size:13px;flex:1;text-align:center}
.pl-navbtn{background:#232834;border:1px solid #2a2f3a;color:#E6EAF2;border-radius:8px;width:30px;height:26px;cursor:pointer;font-size:13px;line-height:1}
.pl-attlink{background:none;border:none;color:#7BA7E0;font-size:10px;cursor:pointer;padding:0;margin-left:2px}
.pl-attlink:hover{text-decoration:underline}
.pl-attmodal{position:fixed;inset:0;background:rgba(8,10,14,.72);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
.pl-attmodal-box{background:#161B22;border:1px solid #242C3A;border-radius:13px;max-width:min(92vw,560px);max-height:86vh;display:flex;flex-direction:column;overflow:hidden}
.pl-attmodal-head{display:flex;align-items:center;gap:10px;padding:10px 13px;border-bottom:1px solid #1d2330}
.pl-attmodal-head b{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-attmodal-body{overflow:auto;padding:12px;display:flex;align-items:center;justify-content:center;min-height:60px}
.pl-attmodal-body img{max-width:100%;max-height:70vh;border-radius:8px;display:block}
`;
function LedgerPanel(_props) {
  const [tab, setTab] = useState4("quick");
  const [month, setMonth] = useState4(currentMonth2());
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  const reload = useCallback(async (m = month) => {
    try {
      const settings = await loadSettings();
      const { bills } = await loadMonth(m);
      const stats = computeStats2(bills, settings, m);
      const d = { settings, month: m, bills, stats };
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, [month]);
  useEffect2(() => {
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
  const switchMonth = (delta) => {
    const m = shiftMonth2(month, delta);
    setMonth(m);
    reload(m);
  };
  const todayBalance = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const b = data.stats.balance;
    return { cls: b < 0 ? "neg" : "pos", text: `\u672C\u6708\u7ED3\u4F59 ${fmtMoney2(Math.abs(b), data.settings.currencySymbol)}${b < 0 ? " \u8D85\u652F" : ""}` };
  })();
  return /* @__PURE__ */ jsxs5("div", { className: "pl-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "pl-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "pl-logo", children: "\u{1F4D2}" }),
      /* @__PURE__ */ jsxs5("div", { className: "pl-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u65E5\u5E38\u8BB0\u8D26" }),
        /* @__PURE__ */ jsx5("small", { className: `pl-balance ${todayBalance.cls}`, children: todayBalance.text })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "pl-tabs", children: [
        ["quick", "\u8BB0\u8D26"],
        ["list", "\u660E\u7EC6"],
        ["stats", "\u7EDF\u8BA1"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `pl-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "pl-body", children: /* @__PURE__ */ jsxs5("div", { className: "pl-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "pl-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "quick" && /* @__PURE__ */ jsx5(QuickTab, { data, reload, showToast }),
      tab === "list" && /* @__PURE__ */ jsx5(ListTab, { data, month, switchMonth, reload, showToast }),
      tab === "stats" && /* @__PURE__ */ jsx5(StatsTab, { data, month, switchMonth }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `pl-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function PocketLedgerEntry(props) {
  return /* @__PURE__ */ jsx6(LedgerPanel, { ...props });
}
export {
  PocketLedgerEntry as default
};
