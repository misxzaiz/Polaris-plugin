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

// shared/stove-core.js
var require_stove_core = __commonJS({
  "shared/stove-core.js"(exports, module) {
    "use strict";
    var PLUGIN_ID2 = "ask-stove";
    var VERSION = "0.1.0";
    var K2 = {
      settings: "stove.settings",
      pantry: "stove.pantry",
      recipes: "stove.recipes",
      plan: "stove.plan",
      shopping: "stove.shopping",
      history: "stove.history",
      meta: "stove.meta",
      cmdFetchPrefix: "stove.cmd.fetch.",
      resultPrefix: "stove.result."
    };
    var LOCATIONS3 = ["fridge", "freezer", "dry", "condiment", "other"];
    var LOCATION_LABELS3 = {
      fridge: "\u51B7\u85CF",
      freezer: "\u51B7\u51BB",
      dry: "\u5E72\u71E5",
      condiment: "\u8C03\u5473",
      other: "\u5176\u4ED6"
    };
    var CATEGORIES3 = ["veg", "meat", "seafood", "staple", "condiment", "other"];
    var CATEGORY_LABELS3 = {
      veg: "\u852C\u679C",
      meat: "\u8089\u86CB",
      seafood: "\u6C34\u4EA7",
      staple: "\u4E3B\u98DF",
      condiment: "\u8C03\u5473",
      other: "\u5176\u4ED6"
    };
    var HISTORY_TYPES = ["add", "cook", "consume", "discard"];
    var HISTORY_CAP = 800;
    var RECIPE_CAP = 200;
    var RECIPE_STEP_CAP = 500;
    var PLAN_WINDOW_DAYS = 56;
    function dayKey5(ms) {
      const d = new Date(Number.isFinite(ms) ? ms : Date.now());
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    function dayShift3(key, n) {
      const [y, m, d] = String(key).split("-").map((x) => parseInt(x, 10));
      const t = new Date(y, m - 1, d + n);
      return dayKey5(t.getTime());
    }
    function isValidDayKey(s) {
      return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN((/* @__PURE__ */ new Date(`${s}T00:00:00`)).getTime());
    }
    function genId(prefix) {
      return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }
    var SYNONYM_GROUPS = [
      ["\u756A\u8304", "\u897F\u7EA2\u67FF"],
      ["\u571F\u8C46", "\u9A6C\u94C3\u85AF", "\u6D0B\u828B"],
      ["\u9E21\u86CB", "\u86CB", "\u9E21\u5375"],
      ["\u9752\u6912", "\u67FF\u5B50\u6912", "\u83DC\u6912"],
      ["\u5706\u767D\u83DC", "\u5305\u83DC", "\u5377\u5FC3\u83DC", "\u7ED3\u7403\u7518\u84DD"],
      ["\u5927\u767D\u83DC", "\u767D\u83DC"],
      ["\u6D0B\u8471", "\u8471\u5934"],
      ["\u849C\u85B9", "\u849C\u82D4"],
      ["\u83DC\u82B1", "\u82B1\u83DC", "\u82B1\u6930\u83DC"],
      ["\u897F\u846B\u82A6", "\u89D2\u74DC"],
      ["\u83E0\u841D", "\u51E4\u68A8"],
      ["\u7315\u7334\u6843", "\u5947\u5F02\u679C"],
      ["\u8F66\u5398\u5B50", "\u6A31\u6843"],
      ["\u9EC4\u6CB9", "\u725B\u6CB9"],
      ["\u4E94\u82B1\u8089", "\u4E94\u82B1"],
      ["\u91CC\u810A", "\u91CC\u810A\u8089"],
      ["\u6392\u9AA8", "\u808B\u6392"],
      ["\u9E21\u817F", "\u9E21\u5C0F\u817F"],
      ["\u9E21\u7FC5", "\u9E21\u7FC5\u8180"],
      ["\u867E", "\u9C9C\u867E"],
      ["\u4E09\u6587\u9C7C", "\u9C91\u9C7C"],
      ["\u91D1\u67AA\u9C7C", "\u541E\u62FF\u9C7C"],
      ["\u9CD5\u9C7C", "\u9CD5\u9C7C\u8089"],
      ["\u9999\u83DC", "\u82AB\u837D"],
      ["\u7389\u7C73\u6DC0\u7C89", "\u751F\u7C89", "\u6DC0\u7C89"],
      ["\u9171\u6CB9", "\u751F\u62BD"],
      ["\u9999\u6CB9", "\u829D\u9EBB\u6CB9", "\u9EBB\u6CB9"],
      ["\u6599\u9152", "\u9EC4\u9152"],
      ["\u5473\u7CBE", "\u5473\u7D20"],
      ["\u756A\u8304\u9171", "\u756A\u8304\u6C99\u53F8"],
      ["\u5C0F\u8471", "\u9999\u8471"]
    ];
    var SYN_MAP = (() => {
      const m = {};
      for (const group of SYNONYM_GROUPS) {
        for (const w of group) m[w] = group[0];
      }
      return m;
    })();
    function stripNoise(s) {
      return String(s || "").replace(/（[^（）]*）|\([^()]*\)|【[^【】]*】/g, "").replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/\u3000/g, " ").toLowerCase().replace(/[\s·・.。,，、;；::'’"“”()（）\[\]【】\-_/\\]+/g, "");
    }
    function normName4(name) {
      const n = stripNoise(name);
      if (!n) return "";
      return SYN_MAP[n] || n;
    }
    function ingredientHit(ingredientName, pantryItemName) {
      const a = normName4(ingredientName);
      const b = normName4(pantryItemName);
      if (!a || !b) return false;
      if (a === b) return true;
      if (a.length < 2 || b.length < 2) return false;
      return a.includes(b) || b.includes(a);
    }
    function findPantryHits2(pantry, ingredientName, now) {
      const out = [];
      for (const it of pantry.items || []) {
        if (it.status && it.status !== "in") continue;
        if (isExpired2(it, now)) continue;
        if (ingredientHit(ingredientName, it.name)) out.push(it);
      }
      return out;
    }
    var DEFAULT_SETTINGS2 = Object.freeze({ v: 1, expiringDays: 5, suggestCount: 3 });
    function clampInt(v, lo, hi, dflt) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return dflt;
      return Math.min(hi, Math.max(lo, n));
    }
    function normalizeSettings2(raw) {
      if (raw === null || raw === void 0) return { settings: { ...DEFAULT_SETTINGS2 } };
      if (typeof raw !== "object" || Array.isArray(raw)) return { error: "settings \u5FC5\u987B\u4E3A\u5BF9\u8C61" };
      const s = {
        v: 1,
        expiringDays: clampInt(raw.expiringDays, 1, 30, DEFAULT_SETTINGS2.expiringDays),
        suggestCount: clampInt(raw.suggestCount, 1, 10, DEFAULT_SETTINGS2.suggestCount)
      };
      return { settings: s };
    }
    var QTY_MAX = 1e5;
    function normalizePantryItem2(raw, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      if (!raw || typeof raw !== "object") return { error: "\u6761\u76EE\u5FC5\u987B\u4E3A\u5BF9\u8C61" };
      const name = String(raw.name || "").trim();
      if (!name) return { error: "name \u5FC5\u586B" };
      if (name.length > 40) return { error: "name \u8FC7\u957F\uFF08\u226440 \u5B57\uFF09" };
      let qty = null;
      if (raw.qty !== void 0 && raw.qty !== null && raw.qty !== "") {
        const q = Number(raw.qty);
        if (!Number.isFinite(q) || q < 0 || q > QTY_MAX) return { error: `qty \u975E\u6CD5\uFF1A${raw.qty}` };
        qty = Math.round(q * 100) / 100;
      }
      const unit = String(raw.unit || "").trim().slice(0, 10);
      const location = LOCATIONS3.includes(raw.location) ? raw.location : "fridge";
      let expiresAt = null;
      if (raw.expiresAt !== void 0 && raw.expiresAt !== null && raw.expiresAt !== "") {
        if (typeof raw.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.expiresAt)) {
          const ms = (/* @__PURE__ */ new Date(`${raw.expiresAt}T23:59:59`)).getTime();
          if (Number.isNaN(ms)) return { error: `expiresAt \u975E\u6CD5\uFF1A${raw.expiresAt}` };
          expiresAt = ms;
        } else {
          const ms = Number(raw.expiresAt);
          if (!Number.isFinite(ms)) return { error: `expiresAt \u975E\u6CD5\uFF1A${raw.expiresAt}` };
          expiresAt = ms;
        }
      }
      const note = String(raw.note || "").trim().slice(0, 100) || void 0;
      return {
        item: {
          id: genId("pi"),
          name,
          norm: normName4(name),
          qty,
          unit,
          location,
          expiresAt,
          addedAt: t,
          updatedAt: t,
          note
        }
      };
    }
    function normalizePantry2(raw, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const items = Array.isArray(raw && raw.items) ? raw.items : [];
      const clean = [];
      for (const it of items) {
        if (!it || typeof it !== "object" || !String(it.name || "").trim()) continue;
        const r = normalizePantryItem2(it, t);
        if (r.item) {
          if (typeof it.id === "string" && it.id) r.item.id = it.id;
          clean.push(r.item);
        }
      }
      return { v: 1, items: clean };
    }
    function isExpired2(item, now) {
      return !!(item && item.expiresAt && item.expiresAt < (Number.isFinite(now) ? now : Date.now()));
    }
    function isExpiring(item, days, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      return !!(item && item.expiresAt && item.expiresAt <= t + days * 86400 * 1e3);
    }
    function expiringItems2(pantry, days, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const list = (pantry.items || []).filter((it) => isExpiring(it, days, t));
      list.sort((a, b) => a.expiresAt - b.expiresAt);
      return list;
    }
    function normalizeRecipe2(raw, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      if (!raw || typeof raw !== "object") return { error: "\u83DC\u8C31\u5FC5\u987B\u4E3A\u5BF9\u8C61" };
      const name = String(raw.name || "").trim();
      if (!name) return { error: "\u83DC\u8C31\u540D\u5FC5\u586B" };
      if (name.length > 60) return { error: "\u83DC\u8C31\u540D\u8FC7\u957F\uFF08\u226460 \u5B57\uFF09" };
      const minutes = clampInt(raw.minutes, 1, 1440, 30);
      const tags = (Array.isArray(raw.tags) ? raw.tags : []).map((x) => String(x || "").trim().slice(0, 12)).filter(Boolean).filter((t2, i, arr) => arr.indexOf(t2) === i).slice(0, 8);
      const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : []).map((x) => {
        if (!x) return null;
        const n = typeof x === "string" ? x : String(x.name || "").trim();
        if (!n) return null;
        const qty = typeof x === "object" && Number.isFinite(Number(x.qty)) && x.qty !== "" && x.qty !== null ? Math.round(Number(x.qty) * 100) / 100 : null;
        const unit = typeof x === "object" ? String(x.unit || "").trim().slice(0, 10) : "";
        return { name: n.slice(0, 40), norm: normName4(n), qty, unit };
      }).filter(Boolean).slice(0, 40);
      if (ingredients.length === 0) return { error: "\u7528\u6599\u81F3\u5C11 1 \u9879" };
      const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s) => String(s || "").trim().slice(0, RECIPE_STEP_CAP)).filter(Boolean).slice(0, 30);
      if (steps.length === 0) return { error: "\u6B65\u9AA4\u81F3\u5C11 1 \u6761" };
      const url = String(raw.url || "").trim().slice(0, 500) || void 0;
      const source = ["manual", "import", "ai"].includes(raw.source) ? raw.source : "manual";
      return {
        recipe: {
          id: genId("rc"),
          name,
          minutes,
          tags,
          ingredients,
          steps,
          url,
          source,
          createdAt: t
        }
      };
    }
    function normalizeRecipeBook2(raw, now) {
      const byId = raw && typeof raw.byId === "object" && raw.byId || {};
      let order = Array.isArray(raw && raw.order) ? raw.order.filter((x) => typeof x === "string") : [];
      order = order.filter((id, i) => order.indexOf(id) === i && byId[id]);
      for (const id of Object.keys(byId)) if (!order.includes(id)) order.push(id);
      const clean = { v: 1, order: order.slice(-RECIPE_CAP), byId: {} };
      for (const id of clean.order) {
        const r = normalizeRecipe2(byId[id], now);
        if (r.recipe) {
          r.recipe.id = id;
          clean.byId[id] = r.recipe;
        }
      }
      return clean;
    }
    function normalizePlan2(raw, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const days = raw && typeof raw.days === "object" && raw.days || {};
      const today = dayKey5(t);
      const lo = dayShift3(today, -PLAN_WINDOW_DAYS);
      const hi = dayShift3(today, PLAN_WINDOW_DAYS);
      const out = { v: 1, days: {} };
      for (const key of Object.keys(days)) {
        if (!isValidDayKey(key) || key < lo || key > hi) continue;
        const e = days[key];
        if (!e || typeof e !== "object") continue;
        const recipeId = typeof e.recipeId === "string" && e.recipeId ? e.recipeId : null;
        const note = typeof e.note === "string" && e.note.trim() ? e.note.trim().slice(0, 60) : null;
        if (recipeId || note) out.days[key] = { recipeId, note };
      }
      return out;
    }
    var CATEGORY_RULES = [
      ["seafood", ["\u9C7C", "\u867E", "\u87F9", "\u8D1D", "\u86E4", "\u9C7F", "\u6D77\u53C2", "\u6D77\u5E26", "\u7D2B\u83DC", "\u4E09\u6587\u9C7C", "\u91D1\u67AA\u9C7C", "\u9CD5\u9C7C"]],
      ["meat", ["\u8089", "\u6392", "\u817F", "\u7FC5", "\u86CB", "\u9E21", "\u9E2D", "\u9E45", "\u725B", "\u7F8A", "\u732A", "\u57F9\u6839", "\u706B\u817F", "\u9999\u80A0", "\u814A", "\u4E38"]],
      ["staple", ["\u7C73", "\u9762", "\u7C89", "\u9992", "\u5305", "\u997A", "\u9762\u997C", "\u610F\u9762", "\u6302\u9762", "\u7C73\u7EBF", "\u9762\u5305", "\u5410\u53F8", "\u71D5\u9EA6", "\u8C46", "\u8C46\u8150"]],
      ["condiment", ["\u6CB9", "\u76D0", "\u9171", "\u918B", "\u7CD6", "\u6599\u9152", "\u80E1\u6912", "\u8FA3\u6912\u9762", "\u5B5C\u7136", "\u82B1\u6912", "\u5927\u6599", "\u9999\u6599", "\u9171\u6599", "\u869D\u6CB9", "\u5473\u7CBE", "\u9E21\u7CBE", "\u6DC0\u7C89", "\u9175\u6BCD", "\u829D\u9EBB"]],
      ["veg", ["\u83DC", "\u74DC", "\u8304", "\u6912", "\u8471", "\u849C", "\u59DC", "\u841D", "\u7B0B", "\u8C46\u82BD", "\u83C7", "\u83CC", "\u679C", "\u6843", "\u674E", "\u674F", "\u67A3", "\u6A58", "\u6A59", "\u67DA", "\u67E0", "\u8393", "\u8549", "\u68A8", "\u74DC", "\u85AF", "\u828B", "\u53F6", "\u82D4", "\u82B1"]]
    ];
    function categorize(name) {
      const n = normName4(name);
      if (!n) return "other";
      for (const [cat, words] of CATEGORY_RULES) {
        if (words.some((w) => n.includes(normName4(w)))) return cat;
      }
      return "other";
    }
    function normalizeShoppingItem2(raw, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      if (!raw || typeof raw !== "object") return { error: "\u6761\u76EE\u5FC5\u987B\u4E3A\u5BF9\u8C61" };
      const name = String(raw.name || "").trim();
      if (!name) return { error: "name \u5FC5\u586B" };
      if (name.length > 40) return { error: "name \u8FC7\u957F" };
      let qty = null;
      if (raw.qty !== void 0 && raw.qty !== null && raw.qty !== "") {
        const q = Number(raw.qty);
        if (!Number.isFinite(q) || q < 0 || q > QTY_MAX) return { error: `qty \u975E\u6CD5` };
        qty = Math.round(q * 100) / 100;
      }
      return {
        item: {
          id: genId("sh"),
          name: name.slice(0, 40),
          norm: normName4(name),
          qty,
          unit: String(raw.unit || "").trim().slice(0, 10),
          category: CATEGORIES3.includes(raw.category) ? raw.category : categorize(name),
          done: !!raw.done,
          addedAt: t,
          fromPlan: !!raw.fromPlan
        }
      };
    }
    function normalizeShopping2(raw, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const items = Array.isArray(raw && raw.items) ? raw.items : [];
      const clean = [];
      const seen = /* @__PURE__ */ new Set();
      for (const it of items) {
        if (!it || typeof it !== "object" || !String(it.name || "").trim()) continue;
        const r = normalizeShoppingItem2(it, t);
        if (!r.item) continue;
        if (typeof it.id === "string" && it.id) r.item.id = it.id;
        const dupKey = r.item.done ? `${r.item.norm}#done` : r.item.norm;
        if (!r.item.done && seen.has(dupKey)) continue;
        seen.add(dupKey);
        clean.push(r.item);
      }
      return { v: 1, items: clean.slice(-300) };
    }
    function pushHistory2(rawHistory, event, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const events = Array.isArray(rawHistory && rawHistory.events) ? rawHistory.events.slice() : [];
      const e = {
        at: Number.isFinite(event && event.at) ? event.at : t,
        type: HISTORY_TYPES.includes(event && event.type) ? event.type : "consume",
        name: String(event && event.name || "").trim().slice(0, 40)
      };
      if (!e.name) return { v: 1, events };
      if (Number.isFinite(event && event.qty)) e.qty = event.qty;
      if (event && event.unit) e.unit = String(event.unit).slice(0, 10);
      if (event && typeof event.recipeId === "string") e.recipeId = event.recipeId;
      if (event && event.location) e.location = String(event.location).slice(0, 12);
      events.push(e);
      return { v: 1, events: events.slice(-HISTORY_CAP) };
    }
    function normalizeHistory2(raw) {
      const events = Array.isArray(raw && raw.events) ? raw.events : [];
      return { v: 1, events: events.filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.at)) && HISTORY_TYPES.includes(e.type)).map((e) => ({ at: Number(e.at), type: e.type, name: String(e.name || "").slice(0, 40) })).slice(-HISTORY_CAP) };
    }
    function jitter01(dateStr, id) {
      let h = 2166136261;
      const s = `${dateStr}|${id}`;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) % 1e3 / 1e3;
    }
    function scoreRecipe(recipe, pantry, history, opts, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const days = opts && opts.expiringDays || 5;
      const dateStr = dayKey5(t);
      const hitExpiring = [];
      const hitAny = /* @__PURE__ */ new Set();
      const missing = [];
      for (const ing of recipe.ingredients || []) {
        if (hitAny.has(ing.norm)) continue;
        const hits = findPantryHits2(pantry, ing.norm, t);
        if (hits.length > 0) {
          hitAny.add(ing.norm);
          for (const h of hits) {
            if (isExpiring(h, days, t)) {
              hitExpiring.push(h.name);
              break;
            }
          }
        } else {
          missing.push(ing.name);
        }
      }
      const recentCut = t - 7 * 86400 * 1e3;
      const recent = (history.events || []).some(
        (e) => e.type === "cook" && e.recipeId === recipe.id && e.at >= recentCut
      );
      let score = 3 * Math.min(hitExpiring.length, 3) - 2 * missing.length - (recent ? 8 : 0) - (recipe.minutes > 30 ? 1 : 0) + jitter01(dateStr, recipe.id) * 2;
      score = Math.round(score * 100) / 100;
      const reasons = [];
      if (hitExpiring.length > 0) reasons.push(`\u6E05\u6389\u4E34\u671F\u7684${hitExpiring.slice(0, 2).join("\u3001")}`);
      if (missing.length === 0) reasons.push("\u6599\u5168\u9F50\uFF0C\u76F4\u63A5\u5F00\u505A");
      else if (missing.length <= 2) reasons.push(`\u53EA\u7F3A${missing.slice(0, 2).join("\u3001")}`);
      else reasons.push(`\u7F3A ${missing.length} \u6837\u6599`);
      if (recipe.minutes <= 15) reasons.push(`${recipe.minutes} \u5206\u949F\u5185\u641E\u5B9A`);
      if (recent) reasons.push("\u6700\u8FD1\u505A\u8FC7\uFF0C\u6362\u4E2A\u53E3");
      return { recipe, score, hitExpiring, missing, recent, reasons };
    }
    function suggestServing2(recipes, pantry, history, settings, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const n = settings && settings.suggestCount || 3;
      const days = settings && settings.expiringDays || 5;
      const out = [];
      for (const id of recipes.order || []) {
        const r = recipes.byId[id];
        if (!r) continue;
        const s = scoreRecipe(r, pantry, history, { expiringDays: days }, t);
        if (s.missing.length > Math.ceil(r.ingredients.length / 2)) continue;
        out.push(s);
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, n);
    }
    function fillFromPlan2(plan, recipes, pantry, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const today = dayKey5(t);
      const need = /* @__PURE__ */ new Map();
      const skipped = [];
      for (let i = 0; i < 7; i++) {
        const day = dayShift3(today, i);
        const e = plan.days[day];
        if (!e || !e.recipeId) continue;
        const r = recipes.byId[e.recipeId];
        if (!r) {
          skipped.push({ day, reason: "\u83DC\u8C31\u4E0D\u5B58\u5728" });
          continue;
        }
        for (const ing of r.ingredients || []) {
          const have = findPantryHits2(pantry, ing.norm, t);
          if (have.length > 0) continue;
          const key = ing.norm;
          if (!need.has(key)) need.set(key, { name: ing.name, qty: ing.qty, unit: ing.unit, category: categorize(ing.name) });
          else if (!need.get(key).qty && ing.qty) need.get(key).qty = ing.qty;
        }
      }
      return { items: [...need.values()].map((x) => ({ ...x, fromPlan: true })), skipped };
    }
    function mergeShopping2(list, aggItems, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const existing = new Set((list.items || []).filter((x) => !x.done).map((x) => x.norm));
      const added = [];
      for (const a of aggItems) {
        const norm = normName4(a.name);
        if (!norm || existing.has(norm)) continue;
        existing.add(norm);
        const r = normalizeShoppingItem2({ ...a, fromPlan: true }, t);
        if (r.item) added.push(r.item);
      }
      return added;
    }
    function wasteStats2(history, days, now) {
      const t = Number.isFinite(now) ? now : Date.now();
      const win = (Number.isFinite(days) ? days : 30) * 86400 * 1e3;
      const lo = t - win;
      let used = 0;
      let discarded = 0;
      const dMap = /* @__PURE__ */ new Map();
      for (const e of history && history.events || []) {
        if (e.at < lo) continue;
        if (e.type === "consume") used++;
        else if (e.type === "discard") {
          discarded++;
          dMap.set(e.name, (dMap.get(e.name) || 0) + 1);
        }
      }
      const total = used + discarded;
      const weeks = [];
      const thisMonday = (() => {
        const d = new Date(t);
        const dow = (d.getDay() + 6) % 7;
        return dayShift3(dayKey5(t), -dow);
      })();
      for (let w = 11; w >= 0; w--) {
        const monday = dayShift3(thisMonday, -7 * w);
        weeks.push({ key: monday, used: 0, discarded: 0 });
      }
      const weekIndex = (ms) => {
        const k = dayKey5(ms);
        for (let i = 0; i < weeks.length; i++) {
          const start = weeks[i].key;
          const end = i < weeks.length - 1 ? weeks[i + 1].key : dayShift3(thisMonday, 7);
          if (k >= start && k < end) return i;
        }
        return -1;
      };
      for (const e of history && history.events || []) {
        const i = weekIndex(e.at);
        if (i < 0) continue;
        if (e.type === "consume") weeks[i].used++;
        else if (e.type === "discard") weeks[i].discarded++;
      }
      return {
        used,
        discarded,
        wasteRate: total > 0 ? Math.round(discarded / total * 100) : 0,
        topDiscarded: [...dMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
        weeks
      };
    }
    module.exports = {
      PLUGIN_ID: PLUGIN_ID2,
      VERSION,
      K: K2,
      LOCATIONS: LOCATIONS3,
      LOCATION_LABELS: LOCATION_LABELS3,
      CATEGORIES: CATEGORIES3,
      CATEGORY_LABELS: CATEGORY_LABELS3,
      HISTORY_TYPES,
      HISTORY_CAP,
      RECIPE_CAP,
      RECIPE_STEP_CAP,
      PLAN_WINDOW_DAYS,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS2,
      SYNONYM_GROUPS,
      dayKey: dayKey5,
      dayShift: dayShift3,
      isValidDayKey,
      genId,
      stripNoise,
      normName: normName4,
      ingredientHit,
      findPantryHits: findPantryHits2,
      normalizeSettings: normalizeSettings2,
      normalizePantryItem: normalizePantryItem2,
      normalizePantry: normalizePantry2,
      isExpired: isExpired2,
      isExpiring,
      expiringItems: expiringItems2,
      normalizeRecipe: normalizeRecipe2,
      normalizeRecipeBook: normalizeRecipeBook2,
      normalizePlan: normalizePlan2,
      categorize,
      normalizeShoppingItem: normalizeShoppingItem2,
      normalizeShopping: normalizeShopping2,
      pushHistory: pushHistory2,
      normalizeHistory: normalizeHistory2,
      scoreRecipe,
      suggestServing: suggestServing2,
      fillFromPlan: fillFromPlan2,
      mergeShopping: mergeShopping2,
      wasteStats: wasteStats2
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState7 } from "react";

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
var core = __toESM(require_stove_core());
var LOCATIONS2 = core.LOCATIONS;
var LOCATION_LABELS2 = core.LOCATION_LABELS;
var CATEGORIES2 = core.CATEGORIES;
var CATEGORY_LABELS2 = core.CATEGORY_LABELS;
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
function capDispatchSelf(target, payload) {
  return capDispatch(target, payload);
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
async function loadOverview() {
  const [settingsRaw, pantryRaw, recipesRaw, planRaw, shoppingRaw, historyRaw, meta] = await Promise.all([
    kvGet(core.K.settings).catch(() => null),
    kvGet(core.K.pantry).catch(() => null),
    kvGet(core.K.recipes).catch(() => null),
    kvGet(core.K.plan).catch(() => null),
    kvGet(core.K.shopping).catch(() => null),
    kvGet(core.K.history).catch(() => null),
    kvGet(core.K.meta).catch(() => null)
  ]);
  const normS = core.normalizeSettings(settingsRaw && typeof settingsRaw === "object" ? settingsRaw : {});
  return {
    settings: normS.error ? { ...core.DEFAULT_SETTINGS } : normS.settings,
    pantry: core.normalizePantry(pantryRaw && typeof pantryRaw === "object" ? pantryRaw : null),
    recipes: core.normalizeRecipeBook(recipesRaw && typeof recipesRaw === "object" ? recipesRaw : null),
    plan: core.normalizePlan(planRaw && typeof planRaw === "object" ? planRaw : null),
    shopping: core.normalizeShopping(shoppingRaw && typeof shoppingRaw === "object" ? shoppingRaw : null),
    history: core.normalizeHistory(historyRaw && typeof historyRaw === "object" ? historyRaw : null),
    meta: meta && typeof meta === "object" ? meta : null
  };
}
function nonce() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
async function importUrl(url, onPoll, timeoutMs = 25e3) {
  const n = nonce();
  await kvSet(`${core.K.cmdFetchPrefix}${n}`, { action: "fetch_url", url, at: Date.now() });
  const resultKey = `${core.K.resultPrefix}${n}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, 1500));
    onPoll?.();
    const r = await kvGet(resultKey).catch(() => null);
    if (r && typeof r === "object") {
      kvDel(resultKey).catch(() => {
      });
      return r;
    }
  }
  return { ok: false, error: "\u7B49\u5F85\u6293\u53D6\u7ED3\u679C\u8D85\u65F6\u2014\u2014\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u53BB\u300C\u8BBE\u7F6E\u300D\u9875\u68C0\u67E5/\u91CD\u542F\u670D\u52A1\uFF09" };
}
function makeApi(reload) {
  const wrap = async (fn, toast) => {
    try {
      await fn();
      reload();
    } catch (e) {
      toast(e.message, true);
    }
  };
  return {
    saveSettings: (s, toast) => wrap(async () => {
      const cur = await loadSettingsRaw();
      const norm = core.normalizeSettings({ ...cur, ...s });
      if (norm.error) throw new Error(norm.error);
      await kvSet(core.K.settings, norm.settings);
      toast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
    }, toast),
    pantryAdd: (raw, toast) => wrap(async () => {
      const r = core.normalizePantryItem(raw);
      if (r.error || !r.item) throw new Error(r.error || "\u5165\u5E93\u5931\u8D25");
      const p = await loadPantryRaw();
      p.items.push(r.item);
      await kvSet(core.K.pantry, core.normalizePantry(p));
      const h = await loadHistoryRaw();
      await kvSet(core.K.history, core.pushHistory(h, { type: "add", name: r.item.name, qty: r.item.qty, unit: r.item.unit, location: r.item.location }));
      toast(`\u5DF2\u5165\u5E93\uFF1A${r.item.name}`);
    }, toast),
    /** 整份消耗（面板不做扣半份；细粒度走 AI/聊天） */
    pantryConsume: (item, action, toast) => wrap(async () => {
      const p = await loadPantryRaw();
      p.items = p.items.filter((x) => x.id !== item.id);
      await kvSet(core.K.pantry, core.normalizePantry(p));
      const h = await loadHistoryRaw();
      await kvSet(core.K.history, core.pushHistory(h, { type: action === "used" ? "consume" : "discard", name: item.name, qty: item.qty, unit: item.unit, location: item.location }));
      toast(`${item.name}\uFF1A${action === "used" ? "\u5403\u6389\u4E86" : "\u6254\u6389\u4E86"}`);
    }, toast),
    pantryRemove: (item, toast) => wrap(async () => {
      const p = await loadPantryRaw();
      p.items = p.items.filter((x) => x.id !== item.id);
      await kvSet(core.K.pantry, core.normalizePantry(p));
      toast(`\u5DF2\u79FB\u9664\uFF1A${item.name}`);
    }, toast),
    recipeSave: (raw, toast) => new Promise((resolve) => {
      wrap(async () => {
        const r = core.normalizeRecipe({ ...raw, source: raw.source || "manual" });
        if (r.error || !r.recipe) throw new Error(r.error || "\u83DC\u8C31\u4E0D\u5408\u6CD5");
        const book = await loadRecipesRaw();
        const norm = core.normName(r.recipe.name);
        const dupId = book.order.find((id) => core.normName(book.byId[id].name) === norm);
        if (dupId) r.recipe.id = dupId;
        book.byId[r.recipe.id] = r.recipe;
        if (!book.order.includes(r.recipe.id)) book.order.push(r.recipe.id);
        await kvSet(core.K.recipes, core.normalizeRecipeBook(book));
        toast(dupId ? `\u5DF2\u66F4\u65B0\u300C${r.recipe.name}\u300D` : `\u5DF2\u4FDD\u5B58\u300C${r.recipe.name}\u300D`);
        resolve(r.recipe);
      }, toast);
    }),
    recipeRemove: (id, toast) => wrap(async () => {
      const book = await loadRecipesRaw();
      if (!book.byId[id]) throw new Error("\u83DC\u8C31\u4E0D\u5B58\u5728");
      const name = book.byId[id].name;
      delete book.byId[id];
      book.order = book.order.filter((x) => x !== id);
      await kvSet(core.K.recipes, core.normalizeRecipeBook(book));
      const plan = await loadPlanRaw();
      for (const k of Object.keys(plan.days)) {
        if (plan.days[k].recipeId === id) {
          plan.days[k].recipeId = null;
          if (!plan.days[k].note) delete plan.days[k];
        }
      }
      await kvSet(core.K.plan, plan);
      toast(`\u5DF2\u5220\u9664\u300C${name}\u300D`);
    }, toast),
    planSet: (day, entry, toast) => wrap(async () => {
      const plan = await loadPlanRaw();
      const recipeId = entry.recipeId ?? null;
      const note = entry.note != null && entry.note.trim() ? entry.note.trim().slice(0, 60) : null;
      if (!recipeId && !note) {
        delete plan.days[day];
      } else {
        plan.days[day] = { recipeId, note };
      }
      await kvSet(core.K.plan, core.normalizePlan(plan));
      toast("\u8BA1\u5212\u5DF2\u66F4\u65B0");
    }, toast),
    planClear: (day, toast) => wrap(async () => {
      const plan = await loadPlanRaw();
      delete plan.days[day];
      await kvSet(core.K.plan, plan);
      toast("\u5DF2\u6E05\u6389\u8BE5\u65E5\u8BA1\u5212");
    }, toast),
    markCooked: (day, recipeId, toast) => wrap(async () => {
      const recipes = await loadRecipesRaw();
      const r = recipes.byId[recipeId];
      if (!r) throw new Error("\u83DC\u8C31\u4E0D\u5B58\u5728");
      const h = await loadHistoryRaw();
      await kvSet(core.K.history, core.pushHistory(h, { type: "cook", name: r.name, recipeId }));
      toast(`\u8BB0\u597D\u4E86\uFF1A\u505A\u4E86\u300C${r.name}\u300D`);
    }, toast),
    shoppingAdd: (raw, toast) => wrap(async () => {
      const list = await loadShoppingRaw();
      const norm = core.normName(raw.name);
      if (norm && list.items.some((x) => !x.done && x.norm === norm)) {
        toast("\u6E05\u5355\u91CC\u5DF2\u6709\u8FD9\u4EF6", true);
        return;
      }
      const r = core.normalizeShoppingItem(raw);
      if (r.error || !r.item) throw new Error(r.error || "\u6DFB\u52A0\u5931\u8D25");
      list.items.push(r.item);
      await kvSet(core.K.shopping, core.normalizeShopping(list));
      toast(`\u5DF2\u52A0\u5165\uFF1A${r.item.name}`);
    }, toast),
    shoppingToggle: (item, toast) => wrap(async () => {
      const list = await loadShoppingRaw();
      const it = list.items.find((x) => x.id === item.id);
      if (!it) throw new Error("\u6761\u76EE\u4E0D\u5B58\u5728");
      it.done = !it.done;
      await kvSet(core.K.shopping, core.normalizeShopping(list));
    }, toast),
    shoppingRemove: (item, toast) => wrap(async () => {
      const list = await loadShoppingRaw();
      list.items = list.items.filter((x) => x.id !== item.id);
      await kvSet(core.K.shopping, core.normalizeShopping(list));
    }, toast),
    shoppingClearDone: (toast) => wrap(async () => {
      const list = await loadShoppingRaw();
      const before = list.items.length;
      list.items = list.items.filter((x) => !x.done);
      await kvSet(core.K.shopping, core.normalizeShopping(list));
      toast(`\u6E05\u6389\u5DF2\u52FE ${before - list.items.length} \u9879`);
    }, toast),
    shoppingFillFromPlan: (toast) => wrap(async () => {
      const [plan, recipes, pantry, list] = await Promise.all([
        loadPlanRaw(),
        loadRecipesRaw(),
        loadPantryRaw(),
        loadShoppingRaw()
      ]);
      const agg = core.fillFromPlan(plan, recipes, pantry, Date.now());
      const added = core.mergeShopping(list, agg.items, Date.now());
      await kvSet(core.K.shopping, core.normalizeShopping({ items: [...list.items, ...added] }));
      toast(added.length ? `\u6309\u8BA1\u5212\u8865\u9F50\uFF1A\u65B0\u589E ${added.length} \u9879` : "\u8BA1\u5212\u7F3A\u6599\u90FD\u5728\u6E05\u5355\u91CC\u4E86");
    }, toast),
    clearAll: async (toast) => {
      try {
        const keys = (await kvKeys()).filter((k) => k.startsWith("stove."));
        await Promise.all(keys.map((k) => kvDel(k)));
        toast(`\u5DF2\u6E05\u7A7A ${keys.length} \u4E2A\u952E`);
        reload();
      } catch (e) {
        toast(e.message, true);
      }
    }
  };
}
function loadSettingsRaw() {
  return kvGet(core.K.settings).then((x) => x && typeof x === "object" ? x : {});
}
function loadPantryRaw() {
  return kvGet(core.K.pantry).then((x) => x && Array.isArray(x.items) ? x : { items: [] });
}
function loadRecipesRaw() {
  return kvGet(core.K.recipes).then((x) => x && typeof x === "object" && Array.isArray(x.order) && x.byId ? x : { v: 1, order: [], byId: {} });
}
function loadPlanRaw() {
  return kvGet(core.K.plan).then((x) => x && typeof x === "object" && x.days ? x : { v: 1, days: {} });
}
function loadShoppingRaw() {
  return kvGet(core.K.shopping).then((x) => x && Array.isArray(x.items) ? x : { items: [] });
}
function loadHistoryRaw() {
  return kvGet(core.K.history).then((x) => x && Array.isArray(x.events) ? x : { v: 1, events: [] });
}
function parseIngredientLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  const m = s.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*([^\d\s]{1,6})?$/);
  if (m && m[2] !== void 0) {
    const name = m[1].trim();
    if (!name) return null;
    return { name, qty: Number(m[2]), unit: (m[3] || "").trim() };
  }
  return { name: s, qty: null, unit: "" };
}
function dayLabel(day) {
  const today = core.dayKey(Date.now());
  if (day === today) return "\u4ECA\u5929";
  if (day === core.dayShift(today, 1)) return "\u660E\u5929";
  const d = /* @__PURE__ */ new Date(`${day}T00:00:00`);
  return `\u5468${"\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D"[d.getDay()]}`;
}
function expiresLabel(ms, now = Date.now()) {
  if (!ms) return { text: "", level: "none" };
  const diff = ms - now;
  if (diff < 0) return { text: `\u8FC7\u671F ${Math.ceil(-diff / 864e5)} \u5929`, level: "over" };
  const days = Math.ceil(diff / 864e5);
  return { text: days <= 1 ? "\u4ECA\u5929\u5230\u671F" : `\u5269 ${days} \u5929`, level: days <= 3 ? "soon" : "none" };
}
function timeAgo(ms) {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1e3));
  if (s < 60) return `${s} \u79D2\u524D`;
  if (s < 3600) return `${Math.floor(s / 60)} \u5206\u949F\u524D`;
  if (s < 86400) return `${Math.floor(s / 3600)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(s / 86400)} \u5929\u524D`;
}

// src/TodayTab.tsx
var core2 = __toESM(require_stove_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function TodayTab(props) {
  const { ov, api, toast, goTab } = props;
  const [pickNonce, setPickNonce] = useState(0);
  const today = core2.dayKey(Date.now());
  const serves = useMemo(
    () => core2.suggestServing(ov.recipes, ov.pantry, ov.history, ov.settings, Date.now()),
    [ov, pickNonce]
  );
  const expiring = useMemo(() => core2.expiringItems(ov.pantry, ov.settings.expiringDays, Date.now()), [ov]);
  const todayPlan = ov.plan.days[today];
  const todayLabel = todayPlan ? todayPlan.recipeId && ov.recipes.byId[todayPlan.recipeId]?.name || todayPlan.note || "\uFF08\u7A7A\uFF09" : null;
  const undoneN = ov.shopping.items.filter((x) => !x.done).length;
  const waste = useMemo(() => core2.wasteStats(ov.history, 30, Date.now()), [ov]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "as-grid", children: [
      /* @__PURE__ */ jsxs("div", { className: "as-stat", onClick: () => goTab("pantry"), children: [
        /* @__PURE__ */ jsx("b", { className: expiring.length > 0 ? "hot" : "", children: expiring.length }),
        /* @__PURE__ */ jsx("small", { children: "\u4E34\u671F\u98DF\u6750" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "as-stat", onClick: () => goTab("shopping"), children: [
        /* @__PURE__ */ jsx("b", { children: undoneN }),
        /* @__PURE__ */ jsx("small", { children: "\u5F85\u4E70" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "as-stat", onClick: () => goTab("settings"), children: [
        /* @__PURE__ */ jsxs("b", { className: waste.wasteRate >= 30 ? "hot" : "", children: [
          waste.wasteRate,
          "%"
        ] }),
        /* @__PURE__ */ jsx("small", { children: "30 \u5929\u6D6A\u8D39\u7387" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "as-bar" }),
      "\u4ECA\u65E5\u7076\u7B7E",
      /* @__PURE__ */ jsx("span", { className: "as-hint", children: "\u4E34\u671F\u4F18\u5148 \xB7 \u7F3A\u6599\u964D\u6743 \xB7 \u8FD1\u505A\u8FC7\u56DE\u907F" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "as-card", children: /* @__PURE__ */ jsxs("div", { className: "as-card-b", children: [
      serves.length === 0 && /* @__PURE__ */ jsxs("div", { className: "as-empty", children: [
        "\u8FD8\u63A8\u4E0D\u51FA\u6765\u2014\u2014\u53BB\u300C\u83DC\u8C31\u300D\u52A0\u51E0\u9053\u83DC\u5427\uFF08\u652F\u6301\u8D34 URL \u4E00\u952E\u5BFC\u5165\uFF09\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "\u5BB6\u91CC\u6709\u5565\u5148\u53BB\u300C\u5E93\u5B58\u300D\u8BB0\u4E00\u7B14\uFF0C\u7076\u7B7E\u624D\u77E5\u9053\u80FD\u505A\u4EC0\u4E48\u3002"
      ] }),
      serves.map((s, i) => {
        const planned = todayPlan?.recipeId === s.recipe.id;
        return /* @__PURE__ */ jsxs("div", { className: "as-suggest", children: [
          /* @__PURE__ */ jsx("div", { className: `as-rank${i === 0 ? " first" : ""}`, children: i + 1 }),
          /* @__PURE__ */ jsxs("div", { className: "main", children: [
            /* @__PURE__ */ jsxs("b", { children: [
              s.recipe.name,
              /* @__PURE__ */ jsxs("span", { className: "as-sub", children: [
                " \xB7 ",
                s.recipe.minutes,
                " \u5206\u949F"
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "why", children: s.reasons.join("\uFF1B") }),
            s.missing.length > 0 && /* @__PURE__ */ jsxs("div", { className: "miss", children: [
              "\u7F3A\u6599\uFF1A",
              s.missing.join("\u3001")
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: `as-btn sm${planned ? " ghost" : ""}`,
              disabled: planned,
              onClick: () => api.planSet(today, { recipeId: s.recipe.id }, toast),
              children: planned ? "\u5DF2\u6392\u4ECA\u5929" : "\u5C31\u5403\u8FD9\u4E2A"
            }
          )
        ] }, s.recipe.id);
      })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "as-bar" }),
      "\u4E34\u671F\u7EA2\u699C",
      /* @__PURE__ */ jsxs("span", { className: "as-hint", children: [
        ov.settings.expiringDays,
        " \u5929\u7A97\u53E3 \xB7 \u53BB\u8BBE\u7F6E\u53EF\u8C03"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "as-card", children: /* @__PURE__ */ jsxs("div", { className: "as-card-b", children: [
      expiring.length === 0 && /* @__PURE__ */ jsx("div", { className: "as-empty", children: "\u6CA1\u6709\u4E34\u671F\u98DF\u6750\uFF0C\u51B0\u7BB1\u72B6\u6001\u5065\u5EB7 \u2705" }),
      expiring.slice(0, 10).map((it) => {
        const ex = expiresLabel(it.expiresAt, Date.now());
        return /* @__PURE__ */ jsxs("div", { className: "as-item", children: [
          /* @__PURE__ */ jsxs("div", { className: "main", children: [
            /* @__PURE__ */ jsxs("b", { children: [
              core2.isExpired(it, Date.now()) ? "\u{1F534}" : "\u{1F7E1}",
              " ",
              it.name,
              it.qty != null ? ` ${it.qty}${it.unit || ""}` : ""
            ] }),
            /* @__PURE__ */ jsxs("small", { children: [
              LOCATION_LABELS2[it.location] || it.location,
              " \xB7 ",
              ex.text,
              it.note ? ` \xB7 ${it.note}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx("button", { className: "as-btn sm", onClick: () => api.pantryConsume(it, "used", toast), children: "\u5403\u6389\u4E86" }),
          /* @__PURE__ */ jsx("button", { className: "as-btn sm danger", onClick: () => api.pantryConsume(it, "discarded", toast), children: "\u6254\u4E86" })
        ] }, it.id);
      }),
      expiring.length > 10 && /* @__PURE__ */ jsxs("div", { className: "as-sub", style: { padding: "8px 2px 2px" }, children: [
        "\u8FD8\u6709 ",
        expiring.length - 10,
        " \u9879\uFF0C\u53BB\u300C\u5E93\u5B58\u300D\u770B\u5168\u90E8\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "as-bar" }),
      "\u4ECA\u65E5\u8BA1\u5212",
      /* @__PURE__ */ jsx("span", { className: "as-hint", children: dayLabel(today) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "as-card", children: /* @__PURE__ */ jsxs("div", { className: "as-card-b", children: [
      !todayLabel && /* @__PURE__ */ jsxs("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx("span", { className: "as-sub", style: { flex: 1 }, children: "\u8FD8\u6CA1\u5B89\u6392\u3002\u4ECE\u7076\u7B7E\u6311\u4E00\u4E2A\uFF0C\u6216\u53BB\u300C\u672C\u5468\u300D\u6392\u3002" }),
        /* @__PURE__ */ jsx("button", { className: "as-btn sm ghost", onClick: () => goTab("plan"), children: "\u53BB\u6392" })
      ] }),
      todayLabel && /* @__PURE__ */ jsxs("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx("span", { style: { flex: 1, fontSize: 13.5, fontWeight: 600 }, children: todayLabel }),
        todayPlan?.recipeId && /* @__PURE__ */ jsx("button", { className: "as-btn sm", onClick: () => api.markCooked(today, todayPlan.recipeId, toast), children: "\u505A\u4E86\u8FD9\u9053\u83DC" }),
        /* @__PURE__ */ jsx("button", { className: "as-btn sm ghost", onClick: () => api.planClear(today, toast), children: "\u6E05\u6389" })
      ] })
    ] }) })
  ] });
}

// src/PantryTab.tsx
import { useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function PantryTab(props) {
  const { ov, api, toast } = props;
  const [showForm, setShowForm] = useState2(false);
  const [collapsed, setCollapsed] = useState2({});
  const [name, setName] = useState2("");
  const [qty, setQty] = useState2("");
  const [unit, setUnit] = useState2("");
  const [location, setLocation] = useState2("fridge");
  const [expires, setExpires] = useState2("");
  const [note, setNote] = useState2("");
  const submit = () => {
    if (!name.trim()) {
      toast("\u5148\u5199\u4E2A\u98DF\u6750\u540D", true);
      return;
    }
    api.pantryAdd({
      name: name.trim(),
      qty: qty.trim() === "" ? null : Number(qty),
      unit: unit.trim(),
      location,
      expiresAt: expires || null,
      note: note.trim() || void 0
    }, toast);
    setName("");
    setQty("");
    setUnit("");
    setExpires("");
    setNote("");
    setShowForm(false);
  };
  const groups = LOCATIONS2.map((loc) => ({
    loc,
    items: ov.pantry.items.filter((x) => x.location === loc).sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity))
  }));
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "as-bar" }),
      "\u5E93\u5B58",
      /* @__PURE__ */ jsxs2("span", { className: "as-hint", children: [
        ov.pantry.items.length,
        " \u79CD"
      ] }),
      /* @__PURE__ */ jsx2("button", { className: "as-btn sm", style: { marginLeft: 8 }, onClick: () => setShowForm(!showForm), children: showForm ? "\u6536\u8D77" : "+ \u5165\u5E93" })
    ] }),
    showForm && /* @__PURE__ */ jsx2("div", { className: "as-card", children: /* @__PURE__ */ jsxs2("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx2("input", { className: "as-inp", style: { flex: 2 }, placeholder: "\u98DF\u6750\u540D\uFF08\u5982 \u6392\u9AA8\uFF09", value: name, onChange: (e) => setName(e.target.value) }),
        /* @__PURE__ */ jsx2("input", { className: "as-inp d", style: { flex: 1 }, placeholder: "\u6570\u91CF", value: qty, onChange: (e) => setQty(e.target.value), inputMode: "decimal" }),
        /* @__PURE__ */ jsx2("input", { className: "as-inp d", style: { flex: 1 }, placeholder: "\u5355\u4F4D", value: unit, onChange: (e) => setUnit(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "as-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("select", { className: "as-sel", value: location, onChange: (e) => setLocation(e.target.value), children: LOCATIONS2.map((l) => /* @__PURE__ */ jsx2("option", { value: l, children: LOCATION_LABELS2[l] }, l)) }),
        /* @__PURE__ */ jsx2("input", { className: "as-inp d", type: "date", value: expires, onChange: (e) => setExpires(e.target.value) }),
        /* @__PURE__ */ jsx2("input", { className: "as-inp", style: { flex: 1 }, placeholder: "\u5907\u6CE8\uFF08\u53EF\u9009\uFF09", value: note, onChange: (e) => setNote(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "as-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "as-btn", onClick: submit, children: "\u5165\u5E93" }),
        /* @__PURE__ */ jsx2("span", { className: "as-sub", children: "\u5230\u671F\u65E5\u53EF\u7A7A\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u4E70\u4E86\u4E24\u65A4\u6392\u9AA8\u300D\u8BA9\u5B83\u5165\u5E93\u3002" })
      ] })
    ] }) }),
    groups.map((g) => /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2(
        "div",
        {
          className: "as-sec",
          style: { cursor: "pointer" },
          onClick: () => setCollapsed((c) => ({ ...c, [g.loc]: !c[g.loc] })),
          children: [
            /* @__PURE__ */ jsx2("span", { className: "as-bar", style: { opacity: 0.6 } }),
            LOCATION_LABELS2[g.loc],
            /* @__PURE__ */ jsx2("span", { className: "as-hint", children: g.items.length })
          ]
        }
      ),
      !collapsed[g.loc] && /* @__PURE__ */ jsx2("div", { className: "as-card", children: /* @__PURE__ */ jsxs2("div", { className: "as-card-b", children: [
        g.items.length === 0 && /* @__PURE__ */ jsx2("div", { className: "as-sub", style: { padding: "4px 2px" }, children: "\u7A7A" }),
        g.items.map((it) => {
          const ex = expiresLabel(it.expiresAt, Date.now());
          return /* @__PURE__ */ jsxs2("div", { className: "as-item", children: [
            /* @__PURE__ */ jsxs2("div", { className: "main", children: [
              /* @__PURE__ */ jsxs2("b", { children: [
                it.name,
                it.qty != null ? ` ${it.qty}${it.unit || ""}` : "",
                ex.level !== "none" && /* @__PURE__ */ jsx2("span", { className: `as-badge ${ex.level === "over" ? "hot" : "soon"}`, style: { marginLeft: 8 }, children: ex.text })
              ] }),
              /* @__PURE__ */ jsxs2("small", { children: [
                "\u5165\u67DC ",
                new Date(it.addedAt).toLocaleDateString(),
                it.note ? ` \xB7 ${it.note}` : ""
              ] })
            ] }),
            /* @__PURE__ */ jsx2("button", { className: "as-btn sm", onClick: () => api.pantryConsume(it, "used", toast), children: "\u5403\u6389" }),
            /* @__PURE__ */ jsx2("button", { className: "as-btn sm danger", onClick: () => api.pantryConsume(it, "discarded", toast), children: "\u6254\u6389" }),
            /* @__PURE__ */ jsx2("button", { className: "as-btn tiny ghost", title: "\u4E0D\u8BB0\u5386\u53F2\u7684\u76F4\u63A5\u79FB\u9664", onClick: () => api.pantryRemove(it, toast), children: "\u2715" })
          ] }, it.id);
        })
      ] }) })
    ] }, g.loc))
  ] });
}

// src/RecipeTab.tsx
var core3 = __toESM(require_stove_core());
import { useMemo as useMemo2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function RecipeTab(props) {
  const { ov, api, toast, onSendToChat, goTab } = props;
  const [q, setQ] = useState3("");
  const [tag, setTag] = useState3("");
  const [maxMin, setMaxMin] = useState3("");
  const [selId, setSelId] = useState3(null);
  const [showForm, setShowForm] = useState3(false);
  const [importing, setImporting] = useState3(false);
  const [url, setUrl] = useState3("");
  const [preview, setPreview] = useState3(null);
  const [fName, setFName] = useState3("");
  const [fMinutes, setFMinutes] = useState3("30");
  const [fTags, setFTags] = useState3("");
  const [fIngredients, setFIngredients] = useState3("");
  const [fSteps, setFSteps] = useState3("");
  const [fUrl, setFUrl] = useState3("");
  const allTags = useMemo2(() => {
    const s = /* @__PURE__ */ new Set();
    for (const id of ov.recipes.order) for (const t of ov.recipes.byId[id].tags) s.add(t);
    return [...s].slice(0, 12);
  }, [ov.recipes]);
  const list = useMemo2(() => {
    const nq = core3.normName(q);
    let ids = ov.recipes.order.slice().reverse();
    if (nq) ids = ids.filter((id) => core3.normName(ov.recipes.byId[id].name).includes(nq));
    if (tag) ids = ids.filter((id) => ov.recipes.byId[id].tags.includes(tag));
    if (maxMin) ids = ids.filter((id) => ov.recipes.byId[id].minutes <= Number(maxMin));
    return ids;
  }, [ov.recipes, q, tag, maxMin]);
  const sel = selId ? ov.recipes.byId[selId] : null;
  const doImport = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      toast("\u8BF7\u8F93\u5165 http(s) \u83DC\u8C31\u94FE\u63A5", true);
      return;
    }
    setImporting(true);
    setPreview(null);
    const r = await importUrl(u, () => {
    });
    setImporting(false);
    if (!r.ok) {
      toast(r.error || "\u6293\u53D6\u5931\u8D25", true);
      return;
    }
    setPreview({ title: r.title || "", text: r.text || "", url: r.url || u });
    toast("\u6293\u597D\u4E86\uFF0C\u6B63\u6587\u5728\u4E0B\u9762");
  };
  const fillFormFromPreview = (p) => {
    setFName(p.title.replace(/[-_|·].{0,20}(菜谱|食谱|做法).*$/i, "").trim() || p.title.slice(0, 30));
    setFIngredients("");
    setFSteps("");
    setFUrl(p.url);
    setShowForm(true);
    toast("\u6807\u9898\u5DF2\u586B\uFF0C\u7528\u6599\u6B65\u9AA4\u8BF7\u7167\u6B63\u6587\u6284\u6216\u4EA4\u7ED9 AI");
  };
  const sendToAi = async (p) => {
    if (!onSendToChat) {
      toast("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u53D1\u7ED9\u804A\u5929\uFF08onSendToChat \u7F3A\u5931\uFF09", true);
      return;
    }
    const prompt = [
      `\u8BF7\u4ECE\u4E0B\u9762\u7684\u83DC\u8C31\u7F51\u9875\u6B63\u6587\u63D0\u53D6\u7ED3\u6784\u5316\u83DC\u8C31\uFF0C\u5E76\u7528 stove_recipe_save \u4FDD\u5B58\uFF1A`,
      `\u6807\u9898\uFF1A${p.title}`,
      `\u6765\u6E90\uFF1A${p.url}`,
      `\u8981\u6C42\uFF1Aminutes=\u5236\u4F5C\u5206\u949F\u6570\uFF08\u4F30\uFF09\uFF1Btags \u8D77\u4E24\u4E2A\uFF08\u5982 \u5FEB\u624B/\u4E0B\u996D/\u7D20\u98DF/\u786C\u83DC\uFF09\uFF1Bingredients \u5168\u90E8\u4E3B\u8F85\u6599\uFF08qty/unit \u80FD\u63D0\u53D6\u5C31\u63D0\u53D6\uFF09\uFF1Bsteps \u6309\u539F\u6587\u7CBE\u7B80\u4E3A\u7F16\u53F7\u6B65\u9AA4\u3002`,
      `\u6B63\u6587\uFF1A`,
      p.text.slice(0, 4e3)
    ].join("\n");
    await onSendToChat(prompt);
    toast("\u5DF2\u53D1\u7ED9 AI \u63D0\u53D6");
  };
  const submitForm = () => {
    if (!fName.trim()) {
      toast("\u83DC\u8C31\u540D\u5FC5\u586B", true);
      return;
    }
    const ingredients = fIngredients.split("\n").map(parseIngredientLine).filter(Boolean);
    const steps = fSteps.split("\n").map((s) => s.trim()).filter(Boolean);
    if (ingredients.length === 0) {
      toast("\u7528\u6599\u81F3\u5C11\u4E00\u884C\uFF08\u5982\uFF1A\u756A\u8304 2 \u4E2A\uFF09", true);
      return;
    }
    if (steps.length === 0) {
      toast("\u6B65\u9AA4\u81F3\u5C11\u4E00\u884C", true);
      return;
    }
    api.recipeSave({
      name: fName.trim(),
      minutes: Number(fMinutes) || 30,
      tags: fTags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      ingredients,
      steps,
      url: fUrl.trim() || void 0,
      source: fUrl.trim() ? "import" : "manual"
    }, toast);
    setFName("");
    setFTags("");
    setFIngredients("");
    setFSteps("");
    setFUrl("");
    setFMinutes("30");
    setShowForm(false);
    setPreview(null);
  };
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "as-bar" }),
      "\u83DC\u8C31",
      /* @__PURE__ */ jsxs3("span", { className: "as-hint", children: [
        ov.recipes.order.length,
        " \u9053"
      ] }),
      /* @__PURE__ */ jsx3("button", { className: "as-btn sm", style: { marginLeft: 8 }, onClick: () => setShowForm(!showForm), children: showForm ? "\u6536\u8D77\u8868\u5355" : "+ \u624B\u52A8/\u5BFC\u5165" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "as-card", children: /* @__PURE__ */ jsxs3("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx3("input", { className: "as-inp", style: { flex: 1 }, placeholder: "\u8D34\u83DC\u8C31 URL\uFF0C\u670D\u52A1\u7AEF\u4EE3\u6293\uFF08\u7ED5\u5F00\u8DE8\u57DF\uFF09", value: url, onChange: (e) => setUrl(e.target.value) }),
        /* @__PURE__ */ jsx3("button", { className: "as-btn", disabled: importing, onClick: doImport, children: importing ? "\u6293\u53D6\u4E2D\u2026" : "\u6293\u53D6" })
      ] }),
      preview && /* @__PURE__ */ jsxs3("div", { style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx3("div", { className: "as-sub", children: /* @__PURE__ */ jsx3("b", { style: { color: "#FFC98A" }, children: preview.title || "\uFF08\u65E0\u6807\u9898\uFF09" }) }),
        /* @__PURE__ */ jsxs3("div", { className: "as-sub", style: { maxHeight: 120, overflow: "hidden", marginTop: 4, whiteSpace: "pre-wrap" }, children: [
          preview.text.slice(0, 400),
          "\u2026"
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "as-row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "as-btn sm", onClick: () => sendToAi(preview), disabled: !onSendToChat, children: "\u53D1\u7ED9 AI \u63D0\u53D6" }),
          /* @__PURE__ */ jsx3("button", { className: "as-btn sm ghost", onClick: () => fillFormFromPreview(preview), children: "\u586B\u5165\u624B\u52A8\u8868\u5355" })
        ] })
      ] })
    ] }) }),
    showForm && /* @__PURE__ */ jsx3("div", { className: "as-card", children: /* @__PURE__ */ jsxs3("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx3("input", { className: "as-inp", style: { flex: 2 }, placeholder: "\u83DC\u8C31\u540D", value: fName, onChange: (e) => setFName(e.target.value) }),
        /* @__PURE__ */ jsx3("input", { className: "as-inp d", style: { width: 80 }, placeholder: "\u5206\u949F", value: fMinutes, onChange: (e) => setFMinutes(e.target.value), inputMode: "numeric" }),
        /* @__PURE__ */ jsx3("input", { className: "as-inp", style: { flex: 1 }, placeholder: "\u6807\u7B7E\uFF0C\u9017\u53F7\u5206\u9694", value: fTags, onChange: (e) => setFTags(e.target.value) })
      ] }),
      /* @__PURE__ */ jsx3("span", { className: "as-lbl", children: "\u7528\u6599\uFF08\u6BCF\u884C\u4E00\u6761\uFF1A\u540D \u6570\u91CF \u5355\u4F4D\uFF0C\u5982\u300C\u756A\u8304 2 \u4E2A\u300D\uFF0C\u6570\u91CF\u53EF\u7701\uFF09" }),
      /* @__PURE__ */ jsx3("textarea", { className: "as-txa", rows: 4, value: fIngredients, onChange: (e) => setFIngredients(e.target.value), placeholder: "\u756A\u8304 2 \u4E2A\n\u9E21\u86CB 3 \u4E2A\n\u76D0" }),
      /* @__PURE__ */ jsx3("span", { className: "as-lbl", children: "\u6B65\u9AA4\uFF08\u6BCF\u884C\u4E00\u6B65\uFF09" }),
      /* @__PURE__ */ jsx3("textarea", { className: "as-txa", rows: 4, value: fSteps, onChange: (e) => setFSteps(e.target.value), placeholder: "\u756A\u8304\u5207\u5757\n\u70ED\u6CB9\u4E0B\u86CB\u7092\u6563" }),
      /* @__PURE__ */ jsxs3("div", { className: "as-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx3("button", { className: "as-btn", onClick: submitForm, children: "\u4FDD\u5B58\u83DC\u8C31" }),
        fUrl && /* @__PURE__ */ jsxs3("span", { className: "as-sub", children: [
          "\u6765\u6E90\uFF1A",
          fUrl.slice(0, 40),
          "\u2026"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx3("div", { className: "as-card", children: /* @__PURE__ */ jsxs3("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx3("input", { className: "as-inp", style: { flex: 1 }, placeholder: "\u641C\u83DC\u540D/\u7528\u6599\u2026", value: q, onChange: (e) => setQ(e.target.value) }),
        /* @__PURE__ */ jsxs3("select", { className: "as-sel", value: maxMin, onChange: (e) => setMaxMin(e.target.value), children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u4EFB\u610F\u65F6\u957F" }),
          /* @__PURE__ */ jsx3("option", { value: "15", children: "\u226415 \u5206\u949F" }),
          /* @__PURE__ */ jsx3("option", { value: "30", children: "\u226430 \u5206\u949F" }),
          /* @__PURE__ */ jsx3("option", { value: "60", children: "\u226460 \u5206\u949F" })
        ] })
      ] }),
      allTags.length > 0 && /* @__PURE__ */ jsx3("div", { className: "as-row", style: { marginTop: 8 }, children: allTags.map((t) => /* @__PURE__ */ jsx3("button", { className: `as-chip${tag === t ? " on" : ""}`, onClick: () => setTag(tag === t ? "" : t), children: t }, t)) })
    ] }) }),
    sel && /* @__PURE__ */ jsx3("div", { className: "as-card", children: /* @__PURE__ */ jsxs3("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "as-row", children: [
        /* @__PURE__ */ jsx3("b", { style: { flex: 1, fontSize: 14 }, children: sel.name }),
        /* @__PURE__ */ jsx3("button", { className: "as-btn sm", onClick: () => {
          api.planSet(core3.dayKey(Date.now()), { recipeId: sel.id }, toast);
          goTab("plan");
        }, children: "\u6392\u8FDB\u4ECA\u65E5" }),
        /* @__PURE__ */ jsx3("button", { className: "as-btn sm danger", onClick: () => {
          api.recipeRemove(sel.id, toast);
          setSelId(null);
        }, children: "\u5220\u9664" }),
        /* @__PURE__ */ jsx3("button", { className: "as-btn sm ghost", onClick: () => setSelId(null), children: "\u6536\u8D77" })
      ] }),
      /* @__PURE__ */ jsx3("span", { className: "as-lbl", children: "\u7528\u6599\uFF08\u5BF9\u7167\u5E93\u5B58\uFF09" }),
      sel.ingredients.map((ing, i) => {
        const have = core3.findPantryHits(ov.pantry, ing.norm, Date.now()).length > 0;
        return /* @__PURE__ */ jsxs3("div", { className: "as-item", children: [
          /* @__PURE__ */ jsx3("span", { className: `as-badge ${have ? "ok" : ""}`, children: have ? "\u6709" : "\u7F3A" }),
          /* @__PURE__ */ jsxs3("span", { style: { fontSize: 12.5 }, children: [
            ing.name,
            ing.qty != null ? ` ${ing.qty}${ing.unit || ""}` : ""
          ] })
        ] }, i);
      }),
      /* @__PURE__ */ jsx3("span", { className: "as-lbl", children: "\u6B65\u9AA4" }),
      sel.steps.map((s, i) => /* @__PURE__ */ jsxs3("div", { className: "as-sub", style: { padding: "3px 0" }, children: [
        i + 1,
        ". ",
        s
      ] }, i)),
      /* @__PURE__ */ jsxs3("div", { className: "as-row", style: { marginTop: 8 }, children: [
        sel.tags.map((t) => /* @__PURE__ */ jsx3("span", { className: "as-badge", children: t }, t)),
        /* @__PURE__ */ jsxs3("span", { className: "as-hint", children: [
          sel.minutes,
          " \u5206\u949F",
          sel.url ? ` \xB7 \u6765\u6E90 ${sel.url.slice(0, 30)}\u2026` : ""
        ] })
      ] })
    ] }) }),
    list.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "as-empty", children: "\u6CA1\u6709\u5339\u914D\u7684\u83DC\u8C31\u3002\u624B\u52A8\u52A0\u4E00\u9053\uFF0C\u6216\u8D34\u4E2A URL \u8BA9\u670D\u52A1\u4EE3\u6293\u3002" }) : list.map((id) => {
      const r = ov.recipes.byId[id];
      const missingN = r.ingredients.filter((ing) => core3.findPantryHits(ov.pantry, ing.norm, Date.now()).length === 0).length;
      return /* @__PURE__ */ jsx3("div", { className: "as-card", style: { cursor: "pointer" }, onClick: () => setSelId(selId === id ? null : id), children: /* @__PURE__ */ jsxs3("div", { className: "as-card-b as-row", children: [
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsx3("b", { style: { fontSize: 13 }, children: r.name }),
          /* @__PURE__ */ jsxs3("div", { className: "as-sub", children: [
            r.minutes,
            " \u5206\u949F \xB7 ",
            r.ingredients.length,
            " \u79CD\u7528\u6599",
            missingN > 0 ? ` \xB7 \u7F3A ${missingN}` : " \xB7 \u6599\u5168",
            r.tags.length ? ` \xB7 ${r.tags.join("/")}` : ""
          ] })
        ] }),
        missingN === 0 && /* @__PURE__ */ jsx3("span", { className: "as-badge ok", children: "\u80FD\u505A" })
      ] }) }, id);
    })
  ] });
}

// src/PlanTab.tsx
var core4 = __toESM(require_stove_core());
import { useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function PlanTab(props) {
  const { ov, api, toast } = props;
  const [editing, setEditing] = useState4(null);
  const [pickQ, setPickQ] = useState4("");
  const [note, setNote] = useState4("");
  const today = core4.dayKey(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => core4.dayShift(today, i));
  const openEdit = (day) => {
    setEditing(editing === day ? null : day);
    setPickQ("");
    setNote("");
  };
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "as-bar" }),
      "\u672C\u5468\u8BA1\u5212",
      /* @__PURE__ */ jsx4("span", { className: "as-hint", children: "\u6392\u4E86\u83DC\u8C31\uFF0C\u300C\u91C7\u8D2D\u300D\u9875\u624D\u80FD\u4E00\u952E\u8865\u7F3A\u6599" })
    ] }),
    days.map((day) => {
      const e = ov.plan.days[day];
      const label = e ? e.recipeId && ov.recipes.byId[e.recipeId]?.name || e.note || "\uFF08\u7A7A\uFF09" : null;
      const d = /* @__PURE__ */ new Date(`${day}T00:00:00`);
      const picks = ov.recipes.order.filter((id) => !pickQ || core4.normName(ov.recipes.byId[id].name).includes(core4.normName(pickQ))).slice(0, 8);
      return /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsx4("div", { className: "as-card", style: { cursor: "pointer" }, onClick: () => openEdit(day), children: /* @__PURE__ */ jsxs4("div", { className: "as-card-b as-row", children: [
          /* @__PURE__ */ jsxs4("div", { style: { width: 62, flexShrink: 0 }, children: [
            /* @__PURE__ */ jsx4("b", { style: { fontSize: 13 }, children: dayLabel(day) }),
            /* @__PURE__ */ jsxs4("div", { className: "as-sub", children: [
              day.slice(5),
              " ",
              day === today ? "\xB7 \u4ECA" : `\u5468${"\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D"[d.getDay()]}`
            ] })
          ] }),
          /* @__PURE__ */ jsx4("div", { style: { flex: 1, minWidth: 0, fontSize: 13 }, children: label || /* @__PURE__ */ jsx4("span", { className: "as-sub", children: "\u672A\u5B89\u6392 \u2014 \u70B9\u4E00\u4E0B\u6392\u83DC" }) }),
          e?.recipeId && /* @__PURE__ */ jsx4(
            "button",
            {
              className: "as-btn tiny",
              onClick: (ev) => {
                ev.stopPropagation();
                api.markCooked(day, e.recipeId, toast);
              },
              children: "\u505A\u4E86"
            }
          ),
          label && /* @__PURE__ */ jsx4(
            "button",
            {
              className: "as-btn tiny ghost",
              onClick: (ev) => {
                ev.stopPropagation();
                api.planClear(day, toast);
              },
              children: "\u2715"
            }
          )
        ] }) }),
        editing === day && /* @__PURE__ */ jsx4("div", { className: "as-card", style: { marginTop: -6, marginBottom: 12, borderColor: "#3a4a60" }, children: /* @__PURE__ */ jsxs4("div", { className: "as-card-b", children: [
          /* @__PURE__ */ jsx4("span", { className: "as-lbl", style: { marginTop: 0 }, children: "\u6311\u83DC\u8C31\uFF08\u53EF\u641C\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "as-inp", placeholder: "\u641C\u83DC\u540D\u2026", value: pickQ, onChange: (ev) => setPickQ(ev.target.value) }),
          /* @__PURE__ */ jsxs4("div", { className: "as-row", style: { marginTop: 8 }, children: [
            picks.length === 0 && /* @__PURE__ */ jsx4("span", { className: "as-sub", children: "\u6CA1\u6709\u5339\u914D\u83DC\u8C31" }),
            picks.map((id) => /* @__PURE__ */ jsx4(
              "button",
              {
                className: `as-chip${e?.recipeId === id ? " on" : ""}`,
                onClick: () => {
                  api.planSet(day, { recipeId: id }, toast);
                  openEdit(day);
                },
                children: ov.recipes.byId[id].name
              },
              id
            ))
          ] }),
          /* @__PURE__ */ jsx4("span", { className: "as-lbl", children: "\u6216\u5199\u5907\u6CE8\uFF08\u5982\u300C\u5916\u5356\u300D\u300C\u5269\u83DC\u300D\uFF09" }),
          /* @__PURE__ */ jsxs4("div", { className: "as-row", children: [
            /* @__PURE__ */ jsx4(
              "input",
              {
                className: "as-inp",
                style: { flex: 1 },
                placeholder: "\u5907\u6CE8",
                value: note,
                onChange: (ev) => setNote(ev.target.value)
              }
            ),
            /* @__PURE__ */ jsx4("button", { className: "as-btn sm", onClick: () => {
              if (note.trim()) {
                api.planSet(day, { note }, toast);
                openEdit(day);
              }
            }, children: "\u6392\u5907\u6CE8" })
          ] })
        ] }) })
      ] }, day);
    })
  ] });
}

// src/ShoppingTab.tsx
import { useState as useState5 } from "react";
import { Fragment as Fragment5, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function ShoppingTab(props) {
  const { ov, api, toast } = props;
  const [name, setName] = useState5("");
  const [qty, setQty] = useState5("");
  const [unit, setUnit] = useState5("");
  const undone = ov.shopping.items.filter((x) => !x.done);
  const done = ov.shopping.items.filter((x) => x.done);
  const submit = () => {
    if (!name.trim()) {
      toast("\u5199\u4E2A\u8981\u4E70\u7684", true);
      return;
    }
    api.shoppingAdd({ name: name.trim(), qty: qty.trim() === "" ? null : Number(qty), unit: unit.trim() }, toast);
    setName("");
    setQty("");
    setUnit("");
  };
  const groups = CATEGORIES2.map((c) => ({ c, items: undone.filter((x) => x.category === c) })).filter((g) => g.items.length > 0);
  return /* @__PURE__ */ jsxs5(Fragment5, { children: [
    /* @__PURE__ */ jsxs5("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "as-bar" }),
      "\u91C7\u8D2D\u6E05\u5355",
      /* @__PURE__ */ jsxs5("span", { className: "as-hint", children: [
        undone.length,
        " \u5F85\u4E70",
        done.length ? ` \xB7 ${done.length} \u5DF2\u52FE` : ""
      ] }),
      /* @__PURE__ */ jsx5("button", { className: "as-btn sm ghost", style: { marginLeft: 8 }, onClick: () => api.shoppingClearDone(toast), children: "\u6E05\u7A7A\u5DF2\u52FE" }),
      /* @__PURE__ */ jsx5("button", { className: "as-btn sm", onClick: () => api.shoppingFillFromPlan(toast), children: "\u6309\u8BA1\u5212\u8865\u9F50" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "as-card", children: /* @__PURE__ */ jsx5("div", { className: "as-card-b", children: /* @__PURE__ */ jsxs5("div", { className: "as-row", children: [
      /* @__PURE__ */ jsx5(
        "input",
        {
          className: "as-inp",
          style: { flex: 2 },
          placeholder: "\u8981\u4E70\u7684\uFF08\u5982 \u6392\u9AA8\uFF09",
          value: name,
          onChange: (e) => setName(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") submit();
          }
        }
      ),
      /* @__PURE__ */ jsx5("input", { className: "as-inp d", style: { flex: 1 }, placeholder: "\u6570\u91CF", value: qty, onChange: (e) => setQty(e.target.value), inputMode: "decimal" }),
      /* @__PURE__ */ jsx5("input", { className: "as-inp d", style: { flex: 1 }, placeholder: "\u5355\u4F4D", value: unit, onChange: (e) => setUnit(e.target.value) }),
      /* @__PURE__ */ jsx5("button", { className: "as-btn", onClick: submit, children: "\u52A0\u5165" })
    ] }) }) }),
    undone.length === 0 && /* @__PURE__ */ jsx5("div", { className: "as-empty", children: "\u6E05\u5355\u662F\u7A7A\u7684\u3002\u6392\u597D\u300C\u672C\u5468\u300D\u8BA1\u5212\u540E\u70B9\u300C\u6309\u8BA1\u5212\u8865\u9F50\u300D\uFF0C\u7F3A\u7684\u6599\u81EA\u52A8\u8FDB\u6765\u3002" }),
    groups.map((g, gi) => /* @__PURE__ */ jsxs5("div", { children: [
      /* @__PURE__ */ jsxs5("div", { className: "as-sec", style: { opacity: 0.85 }, children: [
        /* @__PURE__ */ jsx5("span", { className: "as-bar", style: { opacity: 0.6 } }),
        gi + 1,
        ". ",
        CATEGORY_LABELS2[g.c],
        /* @__PURE__ */ jsx5("span", { className: "as-hint", children: g.items.length })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "as-card", children: /* @__PURE__ */ jsx5("div", { className: "as-card-b", children: g.items.map((it) => /* @__PURE__ */ jsxs5("div", { className: "as-item", children: [
        /* @__PURE__ */ jsx5(
          "input",
          {
            type: "checkbox",
            checked: false,
            onChange: () => api.shoppingToggle(it, toast),
            style: { width: 15, height: 15, accentColor: "#C0632B", flexShrink: 0 }
          }
        ),
        /* @__PURE__ */ jsx5("div", { className: "main", children: /* @__PURE__ */ jsxs5("b", { children: [
          it.name,
          it.qty != null ? ` ${it.qty}${it.unit || ""}` : "",
          it.fromPlan ? " \u{1F4CB}" : ""
        ] }) }),
        /* @__PURE__ */ jsx5("button", { className: "as-btn tiny ghost", onClick: () => api.shoppingRemove(it, toast), children: "\u2715" })
      ] }, it.id)) }) })
    ] }, g.c)),
    done.length > 0 && /* @__PURE__ */ jsxs5(Fragment5, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "as-sec", style: { opacity: 0.7 }, children: [
        /* @__PURE__ */ jsx5("span", { className: "as-bar", style: { opacity: 0.4 } }),
        "\u5DF2\u4E70\u5230"
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "as-card", style: { opacity: 0.7 }, children: /* @__PURE__ */ jsx5("div", { className: "as-card-b", children: done.map((it) => /* @__PURE__ */ jsxs5("div", { className: "as-item", children: [
        /* @__PURE__ */ jsx5(
          "input",
          {
            type: "checkbox",
            checked: true,
            onChange: () => api.shoppingToggle(it, toast),
            style: { width: 15, height: 15, accentColor: "#C0632B", flexShrink: 0 }
          }
        ),
        /* @__PURE__ */ jsx5("div", { className: "main", children: /* @__PURE__ */ jsx5("s", { style: { fontSize: 12.5 }, children: it.name }) }),
        /* @__PURE__ */ jsx5("button", { className: "as-btn tiny ghost", onClick: () => api.shoppingRemove(it, toast), children: "\u2715" })
      ] }, it.id)) }) })
    ] })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState6 } from "react";
import { Fragment as Fragment6, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function SettingsTab(props) {
  const { ov, api, toast } = props;
  const [expiringDays, setExpiringDays] = useState6(String(ov.settings.expiringDays));
  const [suggestCount, setSuggestCount] = useState6(String(ov.settings.suggestCount));
  const [confirmClear, setConfirmClear] = useState6(false);
  const [busy, setBusy] = useState6(false);
  const metaFresh = ov.meta && ov.meta.lastTickAt && Date.now() - ov.meta.lastTickAt < 5 * 6e4;
  const save = () => {
    api.saveSettings({
      expiringDays: Number(expiringDays) || 5,
      suggestCount: Number(suggestCount) || 3
    }, toast);
  };
  const exportAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("stove."));
      const dump = {};
      for (const k of keys) dump[k] = await kvGet(k);
      const blob = new Blob([JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), plugin: "ask-stove", data: dump }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ask-stove-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`\u5DF2\u5BFC\u51FA ${keys.length} \u4E2A\u952E`);
    } catch (e) {
      toast(e.message, true);
    }
  };
  const serviceAction = async (action) => {
    setBusy(true);
    try {
      await capDispatchSelf("cap.pluginServiceManager", { action, pluginId: "ask-stove", serviceId: "stove-service" });
      toast(`\u5DF2\u53D1\u9001 ${action} \u6307\u4EE4\uFF0C\u7A0D\u540E\u770B\u72B6\u6001\u706F`);
    } catch (e) {
      try {
        if (action === "start" || action === "restart") {
          const r = await capDispatchSelf("cap.pluginDiscovery", { action: "discover" });
          const self = (r.plugins || []).find((p) => p && p.id === "ask-stove");
          const svc = self?.contributes?.services?.find((s) => s && s.id === "stove-service");
          if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u4E2D\u627E\u4E0D\u5230\u672C\u63D2\u4EF6\u670D\u52A1\uFF08\u5237\u65B0\u63D2\u4EF6\u5217\u8868\u540E\u91CD\u8BD5\uFF09");
          await capDispatchSelf("cap.pluginServiceManager", {
            action: "start",
            pluginId: "ask-stove",
            installPath: self.installPath,
            contribution: svc
          });
          toast("\u5DF2\u542F\u52A8\u670D\u52A1");
        } else {
          throw e;
        }
      } catch (e2) {
        toast(e2.message, true);
      }
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs6(Fragment6, { children: [
    /* @__PURE__ */ jsxs6("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "as-bar" }),
      "\u504F\u597D"
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "as-card", children: /* @__PURE__ */ jsxs6("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsxs6("div", { className: "as-row", children: [
        /* @__PURE__ */ jsxs6("span", { style: { flex: 1 }, children: [
          "\u4E34\u671F\u7A97\u53E3\uFF08\u5929\uFF09",
          /* @__PURE__ */ jsx6("div", { className: "as-sub", children: "\u5230\u671F\u843D\u5728\u8FD9\u4E2A\u7A97\u53E3\u5185\u5C31\u4E0A\u7EA2\u699C" })
        ] }),
        /* @__PURE__ */ jsx6("input", { className: "as-inp d", style: { width: 70 }, value: expiringDays, onChange: (e) => setExpiringDays(e.target.value), inputMode: "numeric" })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "as-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsxs6("span", { style: { flex: 1 }, children: [
          "\u7076\u7B7E\u6761\u6570",
          /* @__PURE__ */ jsx6("div", { className: "as-sub", children: "\u300C\u4ECA\u65E5\u300D\u9875\u63A8\u8350\u51E0\u9053\u83DC" })
        ] }),
        /* @__PURE__ */ jsx6("input", { className: "as-inp d", style: { width: 70 }, value: suggestCount, onChange: (e) => setSuggestCount(e.target.value), inputMode: "numeric" })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "as-row", style: { marginTop: 12 }, children: /* @__PURE__ */ jsx6("button", { className: "as-btn", onClick: save, children: "\u4FDD\u5B58" }) })
    ] }) }),
    /* @__PURE__ */ jsxs6("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "as-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "as-card", children: /* @__PURE__ */ jsxs6("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsx6("div", { className: "as-row", children: /* @__PURE__ */ jsxs6("span", { style: { flex: 1 }, children: [
        "\u72B6\u6001\uFF1A",
        /* @__PURE__ */ jsx6("b", { style: { color: metaFresh ? "#7ED9A2" : "#F85149" }, children: metaFresh ? "\u5728\u7EBF" : "\u672A\u8FDE\u4E0A" }),
        ov.meta?.lastTickAt && /* @__PURE__ */ jsxs6("span", { className: "as-sub", children: [
          " \xB7 \u5FC3\u8DF3 ",
          timeAgo(ov.meta.lastTickAt),
          " \xB7 \u6865 ",
          ov.meta.bridge === "ok" ? "\u6B63\u5E38" : "\u964D\u7EA7"
        ] }),
        /* @__PURE__ */ jsx6("div", { className: "as-sub", children: "\u6293\u83DC\u8C31\u3001\u6E05\u7406\u5B64\u513F\u7ED3\u679C\u90FD\u9760\u5B83\uFF1B\u4E0D\u5728\u7EBF\u65F6\u5E93\u5B58/\u6E05\u5355\u7167\u5E38\u53EF\u7528" })
      ] }) }),
      /* @__PURE__ */ jsxs6("div", { className: "as-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx6("button", { className: "as-btn sm", disabled: busy, onClick: () => serviceAction("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx6("button", { className: "as-btn sm ghost", disabled: busy, onClick: () => serviceAction("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx6("button", { className: "as-btn sm danger", disabled: busy, onClick: () => serviceAction("stop"), children: "\u505C\u6B62" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs6("div", { className: "as-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "as-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "as-card", children: /* @__PURE__ */ jsxs6("div", { className: "as-card-b", children: [
      /* @__PURE__ */ jsx6("div", { className: "as-row", children: /* @__PURE__ */ jsxs6("span", { style: { flex: 1 }, className: "as-sub", children: [
        "\u5E93\u5B58 ",
        ov.pantry.items.length,
        " \xB7 \u83DC\u8C31 ",
        ov.recipes.order.length,
        " \xB7 \u5386\u53F2 ",
        ov.history.events.length,
        " \u6761",
        /* @__PURE__ */ jsx6("div", { children: "\u5168\u90E8\u5B58\u5728 Polaris \u6570\u636E\u6839\uFF08cap.kv\uFF09\uFF0C\u684C\u9762/\u624B\u673A\u540C\u6E90\u3002" })
      ] }) }),
      /* @__PURE__ */ jsxs6("div", { className: "as-row", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx6("button", { className: "as-btn ghost sm", onClick: exportAll, children: "\u5BFC\u51FA JSON" }),
        !confirmClear ? /* @__PURE__ */ jsx6("button", { className: "as-btn danger sm", onClick: () => setConfirmClear(true), children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E\u2026" }) : /* @__PURE__ */ jsxs6(Fragment6, { children: [
          /* @__PURE__ */ jsx6("button", { className: "as-btn danger sm", onClick: () => {
            api.clearAll(toast);
            setConfirmClear(false);
          }, children: "\u786E\u8BA4\u6E05\u7A7A\uFF08\u4E0D\u53EF\u6062\u590D\uFF09" }),
          /* @__PURE__ */ jsx6("button", { className: "as-btn ghost sm", onClick: () => setConfirmClear(false), children: "\u7B97\u4E86" })
        ] })
      ] })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var css = `
.as-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.as-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.as-body{flex:1;overflow-y:auto;padding:0 0 24px}
.as-body::-webkit-scrollbar{width:9px;height:9px}
.as-body::-webkit-scrollbar-track{background:transparent}
.as-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.as-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#101820 75%,rgba(16,24,32,0))}
.as-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#FF9F43,#C0632B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.as-tt{flex:1;min-width:0}
.as-tt b{font-size:15px;display:block}
.as-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.as-dot{width:7px;height:7px;border-radius:50%;background:#3ddc84;box-shadow:0 0 6px #3ddc8488;flex-shrink:0}
.as-dot.bad{background:#F85149;box-shadow:0 0 6px #f8514988}
.as-tabs{display:flex;gap:4px;flex-wrap:wrap}
.as-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.as-tab:hover{color:#E6EAF2}
.as-tab.on{background:#26313f;color:#E6EAF2;font-weight:600}
.as-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.as-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#FF9F43,#C0632B);flex-shrink:0}
.as-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.as-card{background:#151d28;border:1px solid #263447;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.as-card-b{padding:11px 13px}
.as-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.as-btn{background:#C0632B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.as-btn:hover{filter:brightness(1.12)}
.as-btn:disabled{opacity:.45;cursor:not-allowed}
.as-btn.ghost{background:#1c2836;color:#E6EAF2;border:1px solid #263447}
.as-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.as-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.as-btn.tiny{padding:2px 8px;font-size:10.5px;border-radius:6px}
.as-inp,.as-txa{background:#0d141e;border:1px solid #263447;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;font-family:inherit}
.as-txa{resize:vertical;min-height:52px;line-height:1.5}
.as-inp:focus,.as-txa:focus{outline:none;border-color:#C0632B}
.as-inp::placeholder,.as-txa::placeholder{color:#4d5566}
.as-inp.d{width:auto}
.as-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.as-sel{background:#0d141e;border:1px solid #263447;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;max-width:100%}
.as-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.as-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(21,29,40,.96);border:1px solid #263447;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.as-toast.bad{border-color:#54262c;color:#FF8A9A}
.as-badge{font-size:9.5px;padding:2px 8px;border-radius:999px;background:#1c2836;color:#8B95A7;border:1px solid #263447;white-space:nowrap;flex-shrink:0}
.as-badge.hot{color:#FFB4A6;border-color:#54262c;background:#2a1418}
.as-badge.soon{color:#F2C063;border-color:#54451c;background:#2a2414}
.as-badge.ok{color:#7ED9A2;border-color:#1d4433;background:#122418}
.as-item{display:flex;gap:8px;align-items:center;padding:8px 2px;border-top:1px solid #1b2735}
.as-item:first-child{border-top:none}
.as-item .main{flex:1;min-width:0}
.as-item .main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-item .main small{color:#5C6678;font-size:10.5px;display:block;margin-top:1px}
.as-suggest{display:flex;gap:10px;align-items:flex-start;padding:10px 2px;border-top:1px solid #1b2735}
.as-suggest:first-child{border-top:none}
.as-rank{width:22px;height:22px;border-radius:7px;background:#26313f;color:#FFC98A;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.as-rank.first{background:linear-gradient(135deg,#C0632B,#8a4419);color:#fff}
.as-suggest .main{flex:1;min-width:0}
.as-suggest .main b{font-size:13px;display:block}
.as-suggest .main .why{color:#8B95A7;font-size:11px;margin-top:3px;line-height:1.5}
.as-suggest .main .miss{color:#F2C063;font-size:10.5px;margin-top:2px}
.as-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.as-chip{background:#1c2836;border:1px solid #263447;border-radius:999px;color:#B4B4B8;font-size:11px;padding:4px 11px;cursor:pointer;white-space:nowrap}
.as-chip:hover{border-color:#33507a}
.as-chip.on{background:#3a2417;border-color:#C0632B;color:#FFC98A;font-weight:600}
.as-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 16px 10px}
.as-stat{background:#151d28;border:1px solid #263447;border-radius:11px;padding:9px 6px;text-align:center;min-width:0;cursor:pointer}
.as-stat b{display:block;font-size:15px;font-variant-numeric:tabular-nums}
.as-stat small{font-size:9.5px;color:#8B95A7;display:block;margin-top:2px}
.as-stat .hot{color:#FFB4A6}
`;
function AskStovePanel(props) {
  const [ov, setOv] = useState7(null);
  const [tab, setTab] = useState7("today");
  const [toast, setToast] = useState7(null);
  const toastTimer = useRef(null);
  const alive = useRef(true);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(() => {
    loadOverview().then((o) => {
      if (alive.current) setOv(o);
    }).catch((e) => showToast(e.message, true));
  }, [showToast]);
  useEffect(() => {
    alive.current = true;
    reload();
    const t = setInterval(reload, 6e4);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [reload]);
  if (!ov) {
    return /* @__PURE__ */ jsx7("div", { className: "as-root", children: /* @__PURE__ */ jsx7("div", { className: "as-empty", children: "\u7076\u623F\u70B9\u706F\u4E2D\u2026\u2026" }) });
  }
  const api = makeApi(reload);
  const metaFresh = ov.meta && ov.meta.lastTickAt && Date.now() - ov.meta.lastTickAt < 5 * 6e4;
  const expiringN = core_countExpiring(ov);
  const tabs = [
    { id: "today", label: "\u4ECA\u65E5" },
    { id: "pantry", label: `\u5E93\u5B58${expiringN > 0 ? ` ${expiringN}` : ""}` },
    { id: "recipes", label: `\u83DC\u8C31${ov.recipes.order.length ? ` ${ov.recipes.order.length}` : ""}` },
    { id: "plan", label: "\u672C\u5468" },
    { id: "shopping", label: `\u91C7\u8D2D${ov.shopping.items.filter((x) => !x.done).length ? ` ${ov.shopping.items.filter((x) => !x.done).length}` : ""}` },
    { id: "settings", label: "\u8BBE\u7F6E" }
  ];
  return /* @__PURE__ */ jsxs7("div", { className: "as-root", children: [
    /* @__PURE__ */ jsx7("style", { children: css }),
    /* @__PURE__ */ jsxs7("div", { className: "as-top", children: [
      /* @__PURE__ */ jsx7("div", { className: "as-logo", children: "\u{1F372}" }),
      /* @__PURE__ */ jsxs7("div", { className: "as-tt", children: [
        /* @__PURE__ */ jsx7("b", { children: "\u98DF\u6750\u7BA1\u5BB6" }),
        /* @__PURE__ */ jsxs7("small", { children: [
          /* @__PURE__ */ jsx7("span", { className: "as-dot", style: { display: "inline-block", marginRight: 5, ...metaFresh ? {} : { background: "#F85149", boxShadow: "none" } } }),
          metaFresh ? `\u670D\u52A1\u5728\u7EBF \xB7 ${timeAgo(ov.meta.lastTickAt)}` : "\u670D\u52A1\u672A\u8FDE\u4E0A\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u91CD\u542F\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "as-tabs", children: tabs.map((t) => /* @__PURE__ */ jsx7("button", { className: `as-tab${tab === t.id ? " on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "as-body", children: [
      tab === "today" && /* @__PURE__ */ jsx7(TodayTab, { ov, api, toast: showToast, goTab: setTab }),
      tab === "pantry" && /* @__PURE__ */ jsx7(PantryTab, { ov, api, toast: showToast }),
      tab === "recipes" && /* @__PURE__ */ jsx7(RecipeTab, { ov, api, toast: showToast, onSendToChat: props.onSendToChat, goTab: setTab }),
      tab === "plan" && /* @__PURE__ */ jsx7(PlanTab, { ov, api, toast: showToast }),
      tab === "shopping" && /* @__PURE__ */ jsx7(ShoppingTab, { ov, api, toast: showToast }),
      tab === "settings" && /* @__PURE__ */ jsx7(SettingsTab, { ov, api, toast: showToast })
    ] }),
    toast && /* @__PURE__ */ jsx7("div", { className: `as-toast${toast.bad ? " bad" : ""}`, children: toast.msg })
  ] });
}
function core_countExpiring(ov) {
  const days = ov.settings.expiringDays;
  const now = Date.now();
  return ov.pantry.items.filter((it) => it.expiresAt && it.expiresAt <= now + days * 864e5).length;
}

// src/index.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function AskStoveEntry(props) {
  return /* @__PURE__ */ jsx8(AskStovePanel, { ...props });
}
export {
  AskStoveEntry as default
};
