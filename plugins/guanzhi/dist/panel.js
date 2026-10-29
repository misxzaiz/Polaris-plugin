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

// shared/guanzhi-core.js
var require_guanzhi_core = __commonJS({
  "shared/guanzhi-core.js"(exports, module) {
    "use strict";
    var KINDS2 = ["book", "movie", "tv", "anime", "music", "game", "podcast", "other"];
    var KIND_LABELS2 = {
      book: "\u4E66",
      movie: "\u7535\u5F71",
      tv: "\u5267\u96C6",
      anime: "\u52A8\u753B",
      music: "\u97F3\u4E50",
      game: "\u6E38\u620F",
      podcast: "\u64AD\u5BA2",
      other: "\u5176\u4ED6"
    };
    var KIND_VERBS2 = { book: "\u8BFB", movie: "\u770B", tv: "\u770B", anime: "\u770B", music: "\u542C", game: "\u73A9", podcast: "\u542C", other: "\u770B" };
    var STATUSES2 = ["wish", "active", "done", "dropped"];
    var STATUS_BASE = { wish: "\u60F3{v}", active: "\u5728{v}", done: "{v}\u5B8C", dropped: "\u5F03\u4E86" };
    function statusLabel2(kind, status) {
      const verb = KIND_VERBS2[kind] || KIND_VERBS2.other;
      const tpl = STATUS_BASE[status] || "";
      return tpl.replace("{v}", verb);
    }
    var DEFAULT_SETTINGS2 = { schemaVersion: 1 };
    var K2 = {
      workPrefix: "guanzhi.work.",
      work(id) {
        return `guanzhi.work.${id}`;
      },
      settings: "guanzhi.settings"
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
    function diffDays2(base, target) {
      const b = parseYMD(base);
      const t = parseYMD(target);
      if (!b || !t) return null;
      return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(b.y, b.m - 1, b.d)) / 864e5);
    }
    function round1(n) {
      return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
    }
    function genId(nowMs) {
      const n = nowMs == null ? Date.now() : nowMs;
      return `gw_${n.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
    }
    function normTitle(t) {
      return String(t == null ? "" : t).replace(/\s+/g, "").toLowerCase();
    }
    function applyStatusDates(status, startDate, finishDate, today) {
      if (status === "wish") return { startDate: null, finishDate: null };
      if (status === "active") return { startDate: startDate || today, finishDate: null };
      if (status === "done") return { startDate: startDate || null, finishDate: finishDate || today };
      return { startDate: startDate || null, finishDate: finishDate || null };
    }
    function normalizeWork(raw, nowMs, opts) {
      const now = nowMs == null ? Date.now() : nowMs;
      const autoDates = !(opts && opts.autoDates === false);
      if (!raw || typeof raw !== "object") return { error: "\u53C2\u6570\u7F3A\u5931" };
      const title = String(raw.title == null ? "" : raw.title).trim();
      if (!title) return { error: "\u9700\u8981 title\uFF08\u4F5C\u54C1\u540D\uFF09" };
      if (title.length > 80) return { error: "title \u8FC7\u957F\uFF08\u226480 \u5B57\uFF09" };
      const kind = String(raw.kind == null ? "" : raw.kind).trim();
      if (!KINDS2.includes(kind)) return { error: `kind \u9700\u4E3A ${KINDS2.join("/")}` };
      const status = STATUSES2.includes(raw.status) ? raw.status : "done";
      let rating = null;
      if (raw.rating != null && raw.rating !== "") {
        const r = Number(raw.rating);
        if (!Number.isFinite(r) || r < 0 || r > 10) return { error: "rating \u9700\u4E3A 0-10 \u7684\u6570\u5B57" };
        rating = round1(r);
      }
      let startDate = null;
      let finishDate = null;
      if (raw.startDate != null && raw.startDate !== "") {
        const s = String(raw.startDate).trim();
        if (!parseYMD(s)) return { error: "startDate \u683C\u5F0F\u5E94\u4E3A YYYY-MM-DD" };
        startDate = s;
      }
      if (raw.finishDate != null && raw.finishDate !== "") {
        const f = String(raw.finishDate).trim();
        if (!parseYMD(f)) return { error: "finishDate \u683C\u5F0F\u5E94\u4E3A YYYY-MM-DD" };
        finishDate = f;
      }
      const today = todayStr2(now);
      if (startDate && finishDate && diffDays2(startDate, finishDate) < 0) {
        return { error: "finishDate \u4E0D\u80FD\u65E9\u4E8E startDate" };
      }
      const dated = autoDates ? applyStatusDates(status, startDate, finishDate, today) : { startDate: startDate || null, finishDate: finishDate || null };
      let year;
      if (raw.year != null && raw.year !== "") {
        const y = Math.floor(Number(raw.year));
        if (!Number.isFinite(y) || y < 1900 || y > 2100) return { error: "year \u9700\u4E3A 1900-2100 \u7684\u6574\u6570" };
        year = y;
      }
      const creator = String(raw.creator == null ? "" : raw.creator).trim();
      if (creator.length > 60) return { error: "creator \u8FC7\u957F\uFF08\u226460 \u5B57\uFF09" };
      const genre = String(raw.genre == null ? "" : raw.genre).trim();
      if (genre.length > 30) return { error: "genre \u8FC7\u957F\uFF08\u226430 \u5B57\uFF09" };
      const note = String(raw.note == null ? "" : raw.note).trim();
      if (note.length > 500) return { error: "note \u8FC7\u957F\uFF08\u2264500 \u5B57\uFF09" };
      const link = String(raw.link == null ? "" : raw.link).trim();
      if (link && !/^https?:\/\//.test(link)) return { error: "link \u9700\u4EE5 http(s):// \u5F00\u5934" };
      if (link.length > 300) return { error: "link \u8FC7\u957F\uFF08\u2264300 \u5B57\uFF09" };
      const work = {
        id: String(raw.id || genId(now)),
        kind,
        title,
        status,
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
        // 显式传入（导入保真）则保留；新建/面板/MCP 路径由 applyPatch 或此处刷成 now
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now
      };
      if (rating != null) work.rating = rating;
      if (dated.startDate) work.startDate = dated.startDate;
      if (dated.finishDate) work.finishDate = dated.finishDate;
      if (year != null) work.year = year;
      if (creator) work.creator = creator;
      if (genre) work.genre = genre;
      if (link) work.link = link;
      if (note) work.note = note;
      if (raw.favorite === true) work.favorite = true;
      return { work };
    }
    function applyPatch(existing, patch, nowMs, opts) {
      if (!existing || typeof existing !== "object") return { error: "\u8BB0\u5F55\u4E0D\u5B58\u5728" };
      const merged = { ...existing };
      const keys = ["title", "kind", "status", "rating", "startDate", "finishDate", "year", "creator", "genre", "link", "note", "favorite"];
      const statusChanged = patch && patch.status != null && patch.status !== existing.status;
      for (const k of keys) {
        if (patch && patch[k] !== void 0) merged[k] = patch[k];
      }
      if (statusChanged) {
        const today = todayStr2(nowMs);
        const dated = applyStatusDates(merged.status, merged.startDate, merged.finishDate, today);
        if (dated.startDate) merged.startDate = dated.startDate;
        else delete merged.startDate;
        if (dated.finishDate) merged.finishDate = dated.finishDate;
        else delete merged.finishDate;
      }
      if (patch && (patch.rating === null || patch.rating === "")) delete merged.rating;
      if (patch && patch.favorite === false) delete merged.favorite;
      const out = normalizeWork(merged, nowMs, opts);
      if (!out.error && out.work) out.work.updatedAt = nowMs == null ? Date.now() : nowMs;
      return out;
    }
    function findSameWork(works, kind, title) {
      const key = normTitle(title);
      if (!key) return null;
      let hit = null;
      for (const w of Array.isArray(works) ? works : []) {
        if (!w || typeof w !== "object") continue;
        if (w.kind === kind && normTitle(w.title) === key) {
          if (!hit || (w.updatedAt || 0) > (hit.updatedAt || 0)) hit = w;
        }
      }
      return hit;
    }
    function searchWorks2(works, opts) {
      const o = opts || {};
      const q = o.query ? String(o.query).trim().toLowerCase() : "";
      let list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === "object");
      if (o.kind) list = list.filter((w) => w.kind === o.kind);
      if (o.status) list = list.filter((w) => w.status === o.status);
      if (o.favorite) list = list.filter((w) => w.favorite === true);
      if (o.year != null) list = list.filter((w) => w.year === o.year);
      if (q) {
        list = list.filter((w) => [w.title, w.creator, w.genre, w.note].some((f) => f && String(f).toLowerCase().includes(q)));
      }
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const limit = Math.min(200, Math.max(1, Math.floor(Number(o.limit) || 30)));
      return list.slice(0, limit);
    }
    function avgOf(nums) {
      if (!nums.length) return null;
      return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
    }
    function ratingBand(r) {
      if (r == null) return "\u672A\u8BC4";
      if (r >= 9) return "9-10";
      if (r >= 7) return "7-8";
      if (r >= 5) return "5-6";
      return "\u22644";
    }
    var RATING_BANDS2 = ["9-10", "7-8", "5-6", "\u22644", "\u672A\u8BC4"];
    function computeOverview2(works, today) {
      const list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === "object");
      const byStatus = { wish: 0, active: 0, done: 0, dropped: 0 };
      for (const w of list) if (byStatus[w.status] != null) byStatus[w.status] += 1;
      const activeList = list.filter((w) => w.status === "active").sort((a, b) => String(a.startDate || "9999").localeCompare(String(b.startDate || "9999")));
      const doneList = list.filter((w) => w.status === "done").sort((a, b) => String(b.finishDate || "").localeCompare(String(a.finishDate || "")));
      const wishList = list.filter((w) => w.status === "wish").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const year = today.slice(0, 4);
      const monthKey = today.slice(0, 7);
      const thisYearDone = doneList.filter((w) => (w.finishDate || "").slice(0, 4) === year);
      const thisMonthDone = doneList.filter((w) => (w.finishDate || "").slice(0, 7) === monthKey);
      const rated = list.filter((w) => typeof w.rating === "number");
      const kindMap = /* @__PURE__ */ new Map();
      for (const w of rated) {
        const cur = kindMap.get(w.kind) || { kind: w.kind, label: KIND_LABELS2[w.kind] || w.kind, count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += w.rating;
        kindMap.set(w.kind, cur);
      }
      const avgByKind = [...kindMap.values()].map((k) => ({ kind: k.kind, label: k.label, count: k.count, avg: round1(k.sum / k.count) })).sort((a, b) => b.count - a.count);
      const bands = {};
      for (const b of RATING_BANDS2) bands[b] = 0;
      for (const w of rated) bands[ratingBand(w.rating)] += 1;
      return {
        today,
        total: list.length,
        byStatus,
        activeList,
        recentDone: doneList.slice(0, 8),
        wishOldest: wishList.slice(0, 5),
        wishCount: byStatus.wish,
        thisYearDone: thisYearDone.length,
        thisMonthDone: thisMonthDone.length,
        ratedCount: rated.length,
        avgRating: avgOf(rated.map((w) => w.rating)),
        avgByKind,
        ratingBands: bands,
        favoriteCount: list.filter((w) => w.favorite === true).length
      };
    }
    function computeYearReport2(works, year) {
      const y = String(year);
      const list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === "object");
      const doneInYear = list.filter((w) => w.status === "done" && (w.finishDate || "").slice(0, 4) === y).sort((a, b) => String(b.finishDate || "").localeCompare(String(a.finishDate || "")));
      const rated = doneInYear.filter((w) => typeof w.rating === "number");
      const kindMap = /* @__PURE__ */ new Map();
      for (const w of doneInYear) {
        const cur = kindMap.get(w.kind) || { kind: w.kind, label: KIND_LABELS2[w.kind] || w.kind, count: 0, sum: 0 };
        cur.count += 1;
        if (typeof w.rating === "number") cur.sum += w.rating;
        kindMap.set(w.kind, cur);
      }
      const perKind = [...kindMap.values()].map((k) => ({ kind: k.kind, label: k.label, count: k.count, ratedCount: 0, avg: null })).map((k) => {
        const rs = doneInYear.filter((w) => w.kind === k.kind && typeof w.rating === "number").map((w) => w.rating);
        k.ratedCount = rs.length;
        k.avg = rs.length ? round1(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
        return k;
      }).sort((a, b) => b.count - a.count);
      const monthly = [];
      for (let m = 1; m <= 12; m++) {
        const mk = `${y}-${String(m).padStart(2, "0")}`;
        const inMonth = doneInYear.filter((w) => (w.finishDate || "").slice(0, 7) === mk);
        const rs = inMonth.filter((w) => typeof w.rating === "number").map((w) => w.rating);
        monthly.push({ month: m, count: inMonth.length, avg: avgOf(rs) });
      }
      const bands = {};
      for (const b of RATING_BANDS2) bands[b] = 0;
      for (const w of rated) bands[ratingBand(w.rating)] += 1;
      const top = doneInYear.filter((w) => typeof w.rating === "number").sort((a, b) => b.rating - a.rating || String(b.finishDate || "").localeCompare(String(a.finishDate || ""))).slice(0, 10);
      const favorites = doneInYear.filter((w) => w.favorite === true);
      const withNotes = doneInYear.filter((w) => w.note);
      const longestNote = withNotes.length ? withNotes.reduce((a, b) => String(b.note).length > String(a.note).length ? b : a) : null;
      const wishCarryover = list.filter((w) => w.status === "wish" && w.createdAt && new Date(w.createdAt).getFullYear() < Number(y)).length;
      return {
        year: y,
        doneCount: doneInYear.length,
        ratedCount: rated.length,
        avgRating: avgOf(rated.map((w) => w.rating)),
        perKind,
        monthly,
        ratingBands: bands,
        top,
        favorites,
        longestNote: longestNote ? { id: longestNote.id, title: longestNote.title, kind: longestNote.kind, rating: longestNote.rating ?? null, note: longestNote.note } : null,
        wishCarryover
      };
    }
    function strHash(s) {
      let h = 5381;
      const str = String(s);
      for (let i = 0; i < str.length; i++) h = (h << 5) + h + str.charCodeAt(i) >>> 0;
      return h;
    }
    function recommend(works, today, opts) {
      const o = opts || {};
      const count = Math.min(10, Math.max(1, Math.floor(Number(o.count) || 3)));
      const list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === "object");
      const activeList = list.filter((w) => w.status === "active" && (!o.kind || w.kind === o.kind)).sort((a, b) => String(a.startDate || "9999").localeCompare(String(b.startDate || "9999")));
      const continueList = activeList.slice(0, 3).map((w) => ({
        id: w.id,
        title: w.title,
        kind: w.kind,
        startDate: w.startDate || null,
        daysOpen: w.startDate ? diffDays2(w.startDate, today) : null
      }));
      const wishPool = list.filter((w) => w.status === "wish" && (!o.kind || w.kind === o.kind));
      const picks = wishPool.map((w) => {
        const ageDays = diffDays2(todayStr2(w.createdAt), today);
        const age = Math.max(0, Math.min(4, ageDays == null ? 0 : ageDays / 30));
        const kindBonus = o.kind ? 1.5 : 0;
        const jitter = strHash(`${today}|${w.id}`) % 100 / 50;
        return {
          id: w.id,
          title: w.title,
          kind: w.kind,
          year: w.year ?? null,
          creator: w.creator || "",
          score: round1(age + kindBonus + jitter),
          wishAgeDays: ageDays
        };
      }).sort((a, b) => b.score - a.score || (b.wishAgeDays || 0) - (a.wishAgeDays || 0)).slice(0, count).map((p) => ({
        ...p,
        reason: p.wishAgeDays == null ? "\u5FC3\u613F\u6E05\u5355" : p.wishAgeDays >= 60 ? `\u538B\u5728\u6E05\u5355\u91CC ${p.wishAgeDays} \u5929\u4E86\uFF0C\u8BE5\u6E05\u4E86` : p.wishAgeDays >= 14 ? `\u52A0\u8FDB\u6E05\u5355\u4E24\u5468\u4EE5\u4E0A\uFF08${p.wishAgeDays} \u5929\uFF09` : "\u5FC3\u613F\u6E05\u5355\u65B0\u6210\u5458"
      }));
      const rated = list.filter((w) => typeof w.rating === "number");
      const kindMap = /* @__PURE__ */ new Map();
      for (const w of rated) {
        const cur = kindMap.get(w.kind) || { kind: w.kind, label: KIND_LABELS2[w.kind] || w.kind, sum: 0, count: 0 };
        cur.sum += w.rating;
        cur.count += 1;
        kindMap.set(w.kind, cur);
      }
      const avgByKind = [...kindMap.values()].map((k) => ({ kind: k.kind, label: k.label, count: k.count, avg: round1(k.sum / k.count) })).sort((a, b) => b.count - a.count);
      const genreMap = /* @__PURE__ */ new Map();
      for (const w of list.filter((x) => x.status === "done" && x.genre)) {
        for (const g of String(w.genre).split(/[,，、/|]/).map((s) => s.trim()).filter(Boolean)) {
          genreMap.set(g, (genreMap.get(g) || 0) + 1);
        }
      }
      const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count2]) => ({ genre, count: count2 }));
      return {
        today,
        kind: o.kind || null,
        continueList,
        picks,
        taste: {
          totalDone: list.filter((w) => w.status === "done").length,
          avgByKind,
          topGenres
        }
      };
    }
    function toCsv2(works) {
      const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      const head = ["kind", "title", "status", "rating", "startDate", "finishDate", "year", "creator", "genre", "note", "favorite", "link", "createdAt"];
      const lines = [head.map(esc).join(",")];
      for (const w of Array.isArray(works) ? works : []) {
        if (!w || typeof w !== "object") continue;
        lines.push([
          w.kind,
          w.title,
          w.status,
          w.rating == null ? "" : w.rating,
          w.startDate == null ? "" : w.startDate,
          w.finishDate == null ? "" : w.finishDate,
          w.year == null ? "" : w.year,
          w.creator || "",
          w.genre || "",
          w.note || "",
          w.favorite === true ? "\u662F" : "",
          w.link || "",
          w.createdAt ? new Date(w.createdAt).toISOString() : ""
        ].map(esc).join(","));
      }
      return "\uFEFF" + lines.join("\r\n");
    }
    function sameImportWork(a, b) {
      if (!a || !b || a.kind !== b.kind) return false;
      if (normTitle(a.title) !== normTitle(b.title)) return false;
      const ya = a.year == null || a.year === "" ? null : Math.floor(Number(a.year));
      const yb = b.year == null || b.year === "" ? null : Math.floor(Number(b.year));
      if (ya != null && yb != null && ya !== yb) return false;
      return true;
    }
    function normalizeImport2(list, existingWorks) {
      const arr = Array.isArray(list) ? list : [];
      if (arr.length > 500) return { error: "\u5355\u6B21\u5BFC\u5165\u4E0A\u9650 500 \u6761" };
      const accepted = [];
      const rejected = [];
      const existing = (Array.isArray(existingWorks) ? existingWorks : []).filter((w) => w && typeof w === "object");
      let duplicates = 0;
      arr.forEach((raw, index) => {
        if (!raw || typeof raw !== "object") {
          rejected.push({ index, error: "\u6761\u76EE\u4E0D\u662F\u5BF9\u8C61" });
          return;
        }
        if (existing.some((w) => sameImportWork(w, raw)) || accepted.some((w) => sameImportWork(w, raw))) {
          duplicates += 1;
          return;
        }
        const norm = normalizeWork(raw, Date.now(), { autoDates: false });
        if (norm.error) {
          rejected.push({ index, error: norm.error });
          return;
        }
        accepted.push(norm.work);
      });
      return { accepted, rejected, duplicates };
    }
    function fmtWorkLine(w, today) {
      const bits = [`[${w.id}] \u300A${w.title}\u300B`, KIND_LABELS2[w.kind] || w.kind, statusLabel2(w.kind, w.status)];
      if (typeof w.rating === "number") bits.push(`${w.rating} \u5206`);
      if (w.year) bits.push(`${w.year}`);
      if (w.creator) bits.push(w.creator);
      if (w.status === "done" && w.finishDate) bits.push(w.finishDate);
      else if (w.status === "active" && w.startDate) {
        const d = diffDays2(w.startDate, today);
        bits.push(`\u5F00\u4E8E ${w.startDate}${d != null && d > 0 ? `\uFF08${d} \u5929\u524D\uFF09` : ""}`);
      } else if (w.status === "wish" && w.createdAt) {
        const d = diffDays2(todayStr2(w.createdAt), today);
        bits.push(`\u60F3${d != null && d > 0 ? `\u4E86 ${d} \u5929` : "\u4E8E\u4ECA\u5929"}`);
      }
      if (w.favorite) bits.push("\u2605\u5FC3\u5934\u597D");
      if (w.note) bits.push(w.note);
      return bits.join(" \xB7 ");
    }
    module.exports = {
      KINDS: KINDS2,
      KIND_LABELS: KIND_LABELS2,
      KIND_VERBS: KIND_VERBS2,
      STATUSES: STATUSES2,
      STATUS_BASE,
      statusLabel: statusLabel2,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS2,
      K: K2,
      RATING_BANDS: RATING_BANDS2,
      todayStr: todayStr2,
      parseYMD,
      diffDays: diffDays2,
      round1,
      genId,
      normTitle,
      applyStatusDates,
      normalizeWork,
      applyPatch,
      findSameWork,
      searchWorks: searchWorks2,
      computeOverview: computeOverview2,
      computeYearReport: computeYearReport2,
      recommend,
      toCsv: toCsv2,
      normalizeImport: normalizeImport2,
      fmtWorkLine,
      ratingBand,
      strHash
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState6 } from "react";

// src/model.ts
var coreRaw = __toESM(require_guanzhi_core());

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
var KINDS = core.KINDS;
var KIND_LABELS = core.KIND_LABELS;
var KIND_VERBS = core.KIND_VERBS;
var STATUSES = core.STATUSES;
var RATING_BANDS = core.RATING_BANDS;
var DEFAULT_SETTINGS = core.DEFAULT_SETTINGS;
var searchWorks = (works, opts) => core.searchWorks(works, opts);
var statusLabel = (kind, status) => core.statusLabel(kind, status);
var diffDays = (base, target) => core.diffDays(base, target);
var todayStr = (nowMs) => core.todayStr(nowMs);
var computeOverview = (works, today) => core.computeOverview(works, today);
var computeYearReport = (works, year) => core.computeYearReport(works, year);
var toCsv = (works) => core.toCsv(works);
var normalizeImport = (list, existing) => core.normalizeImport(list, existing);
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
async function loadWorks() {
  const keys = await kvKeys();
  const workKeys = keys.filter((k) => k.startsWith(K.workPrefix)).sort();
  const out = [];
  for (const wk of workKeys) {
    const v = await kvGet(wk);
    if (v && typeof v === "object" && typeof v.id === "string" && typeof v.kind === "string") out.push(v);
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}
async function addWork(input) {
  const existing = core.findSameWork(await loadWorks(), input.kind, input.title);
  const now = Date.now();
  if (existing) {
    const patch = { status: input.status };
    if (input.rating != null) patch.rating = input.rating;
    if (input.note) patch.note = input.note;
    if (input.favorite != null) patch.favorite = input.favorite;
    if (input.year != null) patch.year = input.year;
    if (input.creator) patch.creator = input.creator;
    if (input.genre) patch.genre = input.genre;
    if (input.startDate) patch.startDate = input.startDate;
    if (input.finishDate) patch.finishDate = input.finishDate;
    const merged = core.applyPatch(existing, patch, now);
    if (merged.error || !merged.work) return { ok: false, error: merged.error || "\u66F4\u65B0\u4E0D\u5408\u6CD5" };
    await kvSet(K.work(existing.id), merged.work);
    return { ok: true, work: merged.work, updated: true };
  }
  const norm = core.normalizeWork({ ...input, source: "panel" }, now);
  if (norm.error || !norm.work) return { ok: false, error: norm.error || "\u8BB0\u5F55\u4E0D\u5408\u6CD5" };
  await kvSet(K.work(norm.work.id), norm.work);
  return { ok: true, work: norm.work };
}
async function updateWork(id, patch) {
  const keys = await kvKeys();
  if (!keys.includes(K.work(id))) return { ok: false, error: `\u8BB0\u5F55 ${id} \u4E0D\u5B58\u5728` };
  const existing = await kvGet(K.work(id));
  if (!existing || typeof existing !== "object") return { ok: false, error: `\u8BB0\u5F55 ${id} \u4E0D\u5B58\u5728` };
  const merged = core.applyPatch(existing, patch, Date.now());
  if (merged.error || !merged.work) return { ok: false, error: merged.error || "\u66F4\u65B0\u4E0D\u5408\u6CD5" };
  await kvSet(K.work(id), merged.work);
  return { ok: true, work: merged.work };
}
async function deleteWork(id) {
  await kvDel(K.work(id));
}
async function loadPanelData() {
  const [works] = await Promise.all([loadWorks()]);
  const today = todayStr();
  const overview = computeOverview(works, today);
  return { works, today, overview };
}

// src/OverviewTab.tsx
import { useState as useState2 } from "react";

// src/kindTheme.ts
var KIND_THEME = {
  book: { emoji: "\u{1F4DA}", grad: "linear-gradient(135deg,#3D5A80,#29426B)" },
  movie: { emoji: "\u{1F3AC}", grad: "linear-gradient(135deg,#B0413E,#7A2A28)" },
  tv: { emoji: "\u{1F4FA}", grad: "linear-gradient(135deg,#2A7F7F,#1C5454)" },
  anime: { emoji: "\u{1F338}", grad: "linear-gradient(135deg,#C76B98,#8F4568)" },
  music: { emoji: "\u{1F3B5}", grad: "linear-gradient(135deg,#7B5CD6,#4F3A99)" },
  game: { emoji: "\u{1F3AE}", grad: "linear-gradient(135deg,#4E9455,#315E36)" },
  podcast: { emoji: "\u{1F399}\uFE0F", grad: "linear-gradient(135deg,#B08B3E,#77591F)" },
  other: { emoji: "\u{1F4E6}", grad: "linear-gradient(135deg,#5C6678,#3A4356)" }
};
var STATUS_CLS = {
  wish: "wish",
  active: "active",
  done: "done",
  dropped: "drop"
};

// src/WorkCard.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function WorkCard({ work, today, rank, onEdit, children }) {
  const theme = KIND_THEME[work.kind] || KIND_THEME.other;
  const metaBits = [];
  if (work.year) metaBits.push(String(work.year));
  if (work.creator) metaBits.push(work.creator);
  if (work.genre) metaBits.push(work.genre);
  let timeBit = "";
  if (work.status === "done" && work.finishDate) timeBit = work.finishDate;
  else if (work.status === "active" && work.startDate) {
    const d = diffDays(work.startDate, today);
    timeBit = `\u5F00\u4E8E ${work.startDate}${d != null && d > 0 ? ` \xB7 ${d} \u5929` : ""}`;
  } else if (work.status === "wish" && work.createdAt) {
    const d = diffDays(new Date(work.createdAt).toISOString().slice(0, 10), today);
    timeBit = d != null && d > 0 ? `\u60F3 ${d} \u5929\u4E86` : "\u4ECA\u5929\u52A0\u5165";
  } else if (work.status === "dropped" && work.updatedAt) {
    timeBit = `\u66F4\u65B0\u4E8E ${new Date(work.updatedAt).toISOString().slice(0, 10)}`;
  }
  return /* @__PURE__ */ jsxs("div", { className: "gz-item", children: [
    rank != null && /* @__PURE__ */ jsx("span", { className: "gz-rank", children: rank }),
    /* @__PURE__ */ jsx("div", { className: "gz-cover", style: { background: theme.grad }, children: theme.emoji }),
    /* @__PURE__ */ jsxs("div", { className: "gz-item-main", children: [
      /* @__PURE__ */ jsxs("div", { className: "gz-item-head", children: [
        /* @__PURE__ */ jsx("b", { children: work.title }),
        typeof work.rating === "number" && /* @__PURE__ */ jsxs("span", { className: "gz-rate", children: [
          work.rating,
          " \u5206"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gz-item-mid", children: [
        /* @__PURE__ */ jsxs("span", { className: "gz-meta", children: [
          metaBits.join(" \xB7 "),
          timeBit ? ` \xB7 ${timeBit}` : ""
        ] }),
        /* @__PURE__ */ jsx("span", { className: `gz-badge ${STATUS_CLS[work.status] || ""}`, children: statusLabel(work.kind, work.status) }),
        /* @__PURE__ */ jsx("span", { className: "gz-badge", children: KIND_LABELS[work.kind] || work.kind }),
        work.favorite && /* @__PURE__ */ jsx("span", { className: "gz-badge fav", children: "\u2605 \u5FC3\u5934\u597D" })
      ] }),
      work.note && /* @__PURE__ */ jsx("div", { className: "gz-item-foot", children: /* @__PURE__ */ jsx("span", { className: "note", children: work.note }) }),
      /* @__PURE__ */ jsxs("div", { className: "gz-item-foot", children: [
        onEdit && /* @__PURE__ */ jsx("button", { className: "gz-btn sm ghost", disabled: false, onClick: onEdit, children: "\u7F16\u8F91" }),
        children
      ] })
    ] })
  ] });
}

// src/WorkForm.tsx
import { useState } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function formFromWork(w) {
  return {
    title: w.title,
    kind: w.kind,
    status: w.status,
    rating: w.rating != null ? String(w.rating) : "",
    startDate: w.startDate || "",
    finishDate: w.finishDate || "",
    year: w.year != null ? String(w.year) : "",
    creator: w.creator || "",
    genre: w.genre || "",
    note: w.note || "",
    favorite: w.favorite === true
  };
}
function emptyForm(defaultStatus) {
  return {
    title: "",
    kind: "movie",
    status: defaultStatus,
    rating: "",
    startDate: "",
    finishDate: "",
    year: "",
    creator: "",
    genre: "",
    note: "",
    favorite: false
  };
}
function WorkForm({ initial, defaultStatus, busy, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initial ? formFromWork(initial) : emptyForm(defaultStatus || "done"));
  const [err, setErr] = useState("");
  const submit = async () => {
    const title = form.title.trim();
    if (!title) {
      setErr("\u8BF7\u586B\u5199\u4F5C\u54C1\u540D");
      return;
    }
    if (form.rating !== "" && !(Number(form.rating) >= 0 && Number(form.rating) <= 10)) {
      setErr("\u8BC4\u5206\u9700\u4E3A 0-10");
      return;
    }
    if (form.year !== "" && !(Number(form.year) >= 1900 && Number(form.year) <= 2100)) {
      setErr("\u5E74\u4EFD\u9700\u4E3A 1900-2100");
      return;
    }
    setErr("");
    const payload = {
      title,
      kind: form.kind,
      status: form.status
    };
    if (form.rating !== "") payload.rating = Math.round(Number(form.rating) * 10) / 10;
    if (form.startDate) payload.startDate = form.startDate;
    if (form.finishDate) payload.finishDate = form.finishDate;
    if (form.year !== "") payload.year = Math.floor(Number(form.year));
    if (form.creator.trim()) payload.creator = form.creator.trim();
    if (form.genre.trim()) payload.genre = form.genre.trim();
    if (form.note.trim()) payload.note = form.note.trim();
    if (form.favorite) payload.favorite = true;
    await onSubmit(payload);
  };
  return /* @__PURE__ */ jsx2("div", { className: "gz-card", children: /* @__PURE__ */ jsxs2("div", { className: "gz-card-b", children: [
    /* @__PURE__ */ jsx2("b", { style: { fontSize: 12.5 }, children: initial ? "\u7F16\u8F91\u8BB0\u5F55" : "\u8BB0\u4E00\u7B14" }),
    /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u4F5C\u54C1\u540D" }),
    /* @__PURE__ */ jsx2("input", { className: "gz-inp", value: form.title, placeholder: "\u5982\uFF1A\u6D41\u6D6A\u5730\u74032", onChange: (e) => setForm({ ...form, title: e.target.value }) }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u4F53\u88C1" }),
        /* @__PURE__ */ jsx2("select", { className: "gz-sel", style: { width: "100%" }, value: form.kind, onChange: (e) => setForm({ ...form, kind: e.target.value }), children: KINDS.map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: KIND_LABELS[k] || k }, k)) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsx2("select", { className: "gz-sel", style: { width: "100%" }, value: form.status, onChange: (e) => setForm({ ...form, status: e.target.value }), children: STATUSES.map((s) => /* @__PURE__ */ jsx2("option", { value: s, children: statusLabel(form.kind, s) }, s)) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u8BC4\u5206\uFF080-10\uFF09" }),
        /* @__PURE__ */ jsx2("input", { className: "gz-inp", type: "number", min: "0", max: "10", step: "0.5", value: form.rating, placeholder: "\u53EF\u7559\u7A7A", onChange: (e) => setForm({ ...form, rating: e.target.value }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u5F00\u59CB\u65E5" }),
        /* @__PURE__ */ jsx2("input", { className: "gz-inp", type: "date", value: form.startDate, onChange: (e) => setForm({ ...form, startDate: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u5B8C\u6210\u65E5" }),
        /* @__PURE__ */ jsx2("input", { className: "gz-inp", type: "date", value: form.finishDate, onChange: (e) => setForm({ ...form, finishDate: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u4F5C\u54C1\u5E74\u4EFD" }),
        /* @__PURE__ */ jsx2("input", { className: "gz-inp", type: "number", min: "1900", max: "2100", value: form.year, placeholder: "\u5982 2023", onChange: (e) => setForm({ ...form, year: e.target.value }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u4F5C\u8005 / \u5BFC\u6F14 / \u5F00\u53D1\u7EC4" }),
        /* @__PURE__ */ jsx2("input", { className: "gz-inp", value: form.creator, placeholder: "\u53EF\u9009", onChange: (e) => setForm({ ...form, creator: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u7C7B\u578B\u6807\u7B7E" }),
        /* @__PURE__ */ jsx2("input", { className: "gz-inp", value: form.genre, placeholder: "\u5982 \u79D1\u5E7B/\u60AC\u7591", onChange: (e) => setForm({ ...form, genre: e.target.value }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("label", { className: "gz-lbl", children: "\u77ED\u8BC4" }),
    /* @__PURE__ */ jsx2("input", { className: "gz-inp", value: form.note, placeholder: "\u53EF\u9009\uFF0C\u4E00\u53E5\u8BDD\u611F\u53D7", onChange: (e) => setForm({ ...form, note: e.target.value }) }),
    /* @__PURE__ */ jsxs2("label", { className: "gz-lbl", style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }, children: [
      /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: form.favorite, onChange: (e) => setForm({ ...form, favorite: e.target.checked }) }),
      "\u6807\u4E3A\u5FC3\u5934\u597D\uFF08\u5E74\u62A5\u91CC\u5355\u72EC\u5217\u51FA\uFF09"
    ] }),
    err && /* @__PURE__ */ jsx2("div", { className: "gz-sub", style: { color: "#F85149", marginTop: 6 }, children: err }),
    /* @__PURE__ */ jsxs2("div", { className: "gz-form-actions", children: [
      /* @__PURE__ */ jsx2("button", { className: "gz-btn", disabled: busy, onClick: submit, children: submitLabel }),
      /* @__PURE__ */ jsx2("button", { className: "gz-btn ghost", disabled: busy, onClick: onCancel, children: "\u53D6\u6D88" })
    ] })
  ] }) });
}

// src/OverviewTab.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function OverviewTab({ data, reload, showToast }) {
  const [form, setForm] = useState2(null);
  const [busy, setBusy] = useState2(false);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "gz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const ov = data.overview;
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
  const submitForm = async (payload) => {
    if (busy) return;
    setBusy(true);
    try {
      if (form?.initial) {
        const r = await updateWork(form.initial.id, payload);
        if (!r.ok) throw new Error(r.error || "\u66F4\u65B0\u5931\u8D25");
        showToast(`\u5DF2\u4FDD\u5B58\u300C${payload.title}\u300D`, "good");
      } else {
        const r = await addWork(payload);
        if (!r.ok) throw new Error(r.error || "\u8BB0\u8D26\u5931\u8D25");
        showToast(r.updated ? `\u5DF2\u6709\u8BB0\u5F55\u5DF2\u66F4\u65B0\uFF1A${payload.title}` : `\u5DF2\u8BB0\u8D26\uFF1A${payload.title}`, "good");
      }
      setForm(null);
      await reload();
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const kpi = (label, value, sub) => /* @__PURE__ */ jsxs3("div", { className: "gz-kpi", children: [
    /* @__PURE__ */ jsx3("small", { children: label }),
    /* @__PURE__ */ jsx3("b", { children: value }),
    /* @__PURE__ */ jsx3("em", { children: sub })
  ] }, label);
  const actions = (w) => {
    if (w.status === "active") {
      return /* @__PURE__ */ jsxs3(Fragment, { children: [
        /* @__PURE__ */ jsx3("button", { className: "gz-btn sm", disabled: busy, onClick: () => doAction(
          () => updateWork(w.id, { status: "done" }),
          `\u300A${w.title}\u300B\u5DF2${KIND_VERBS[w.kind] || "\u770B"}\u5B8C\uFF08\u8BB0\u4ECA\u5929\uFF09`
        ), children: "\u5B8C\u6210" }),
        /* @__PURE__ */ jsx3("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(
          () => updateWork(w.id, { status: "dropped" }),
          `\u5DF2\u6807\u8BB0\u5F03\u4E86\u300A${w.title}\u300B`
        ), children: "\u5F03" })
      ] });
    }
    if (w.status === "wish") {
      return /* @__PURE__ */ jsxs3(Fragment, { children: [
        /* @__PURE__ */ jsx3("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(
          () => updateWork(w.id, { status: "active" }),
          `\u5F00\u59CB\u300A${w.title}\u300B`
        ), children: "\u5F00\u59CB" }),
        /* @__PURE__ */ jsx3("button", { className: "gz-btn sm", disabled: busy, onClick: () => doAction(
          () => updateWork(w.id, { status: "done" }),
          `\u300A${w.title}\u300B\u5DF2${KIND_VERBS[w.kind] || "\u770B"}\u5B8C\uFF08\u8BB0\u4ECA\u5929\uFF09`
        ), children: "\u5B8C\u6210" })
      ] });
    }
    if (w.status === "done") {
      return /* @__PURE__ */ jsx3("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(
        () => updateWork(w.id, { favorite: !w.favorite }),
        w.favorite ? `\u5DF2\u53D6\u6D88\u5FC3\u5934\u597D\uFF1A${w.title}` : `\u5DF2\u6807\u4E3A\u5FC3\u5934\u597D\uFF1A${w.title}`
      ), children: w.favorite ? "\u2605 \u53D6\u5FC3\u5934\u597D" : "\u2606 \u5FC3\u5934\u597D" });
    }
    return /* @__PURE__ */ jsx3("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(
      () => updateWork(w.id, { status: "wish" }),
      `\u300A${w.title}\u300B\u56DE\u5230\u60F3\u770B`
    ), children: "\u56DE\u60F3\u770B" });
  };
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "gz-kpis", children: [
      kpi("\u4ECA\u5E74\u5B8C\u6210", String(ov.thisYearDone), `\u672C\u6708 ${ov.thisMonthDone} \u90E8`),
      kpi("\u5728\u8FDB\u884C", String(ov.byStatus.active), `\u60F3\u770B ${ov.wishCount} \u90E8\u5F85\u542F`),
      kpi("\u8BC4\u5206\u5747\u503C", ov.avgRating != null ? `${ov.avgRating}` : "\u2014", `\u5DF2\u8BC4 ${ov.ratedCount} \u6761`)
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "gz-chiprow", children: /* @__PURE__ */ jsx3("button", { className: "gz-btn sm", style: { marginLeft: "auto" }, onClick: () => setForm({ initial: null }), children: "\uFF0B \u8BB0\u4E00\u7B14" }) }),
    form && /* @__PURE__ */ jsx3(
      WorkForm,
      {
        initial: form.initial,
        busy,
        submitLabel: form.initial ? "\u4FDD\u5B58" : "\u8BB0\u8D26",
        onSubmit: submitForm,
        onCancel: () => setForm(null)
      }
    ),
    /* @__PURE__ */ jsxs3("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "gz-bar" }),
      "\u8FDB\u884C\u4E2D",
      /* @__PURE__ */ jsx3("span", { className: "gz-hint", children: "\u5F00\u5F97\u6700\u4E45\u7684\u5728\u524D\uFF0C\u5148\u6536\u5C3E" })
    ] }),
    ov.activeList.length === 0 && /* @__PURE__ */ jsx3("div", { className: "gz-empty", children: "\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u2014\u2014\u60F3\u770B\u6E05\u5355\u91CC\u6311\u4E00\u4E2A\u5F00\u59CB\u5427\u3002" }),
    ov.activeList.map((w) => /* @__PURE__ */ jsx3(WorkCard, { work: w, today: data.today, onEdit: () => setForm({ initial: w }), children: actions(w) }, w.id)),
    /* @__PURE__ */ jsxs3("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "gz-bar" }),
      "\u6700\u8FD1\u5B8C\u6210",
      /* @__PURE__ */ jsxs3("span", { className: "gz-hint", children: [
        "\u4ECA\u5E74\u5DF2\u5B8C\u6210 ",
        ov.thisYearDone
      ] })
    ] }),
    ov.recentDone.length === 0 && /* @__PURE__ */ jsx3("div", { className: "gz-empty", children: "\u8FD8\u6CA1\u6709\u5B8C\u6210\u8BB0\u5F55\u2014\u2014\u5B8C\u6210\u4E00\u9879\u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }),
    ov.recentDone.map((w) => /* @__PURE__ */ jsx3(WorkCard, { work: w, today: data.today, onEdit: () => setForm({ initial: w }), children: actions(w) }, w.id)),
    /* @__PURE__ */ jsxs3("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "gz-bar" }),
      "\u60F3\u770B\u6E05\u5355",
      /* @__PURE__ */ jsx3("span", { className: "gz-hint", children: "\u538B\u5F97\u6700\u4E45\u7684\u5728\u524D" })
    ] }),
    ov.wishOldest.length === 0 && /* @__PURE__ */ jsx3("div", { className: "gz-empty", children: "\u60F3\u770B\u6E05\u5355\u662F\u7A7A\u7684\u2014\u2014\u804A\u5929\u91CC\u8BF4\u300C\u60F3\u770B\u300A\xD7\xD7\u300B\u300D\u5373\u53EF\u52A0\u5165\u3002" }),
    ov.wishOldest.map((w) => /* @__PURE__ */ jsxs3(WorkCard, { work: w, today: data.today, onEdit: () => setForm({ initial: w }), children: [
      actions(w),
      /* @__PURE__ */ jsx3("button", { className: "gz-btn sm danger", disabled: busy, onClick: () => doAction(
        async () => {
          await deleteWork(w.id);
        },
        `\u5DF2\u5220\u9664\u300A${w.title}\u300B`
      ), children: "\u5220" })
    ] }, w.id)),
    ov.total === 0 && /* @__PURE__ */ jsxs3("div", { className: "gz-sub", style: { padding: "0 18px 10px" }, children: [
      "\u8D26\u672C\u7A7A\u7A7A\u3002\u5728 Polaris \u804A\u5929\u91CC\u8BF4\u300C\u6628\u665A\u770B\u5B8C\u300A\xD7\xD7\u300B\u62539\u5206\u300D\u300C\u60F3\u770B\u300A\xD7\xD7\u300B\u300D\u5373\u53EF\u5BF9\u8BDD\u5F0F\u8BB0\u8D26\u2014\u2014 \u6216\u70B9\u4E0A\u9762\u300C\uFF0B \u8BB0\u4E00\u7B14\u300D\u624B\u52A8\u5F55\u5165\u3002\u952E\u7A7A\u95F4\uFF1A",
      K.workPrefix,
      "*"
    ] })
  ] });
}

// src/LibraryTab.tsx
import { useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function LibraryTab({ data, reload, showToast }) {
  const [query, setQuery] = useState3("");
  const [kindF, setKindF] = useState3("");
  const [statusF, setStatusF] = useState3("");
  const [favOnly, setFavOnly] = useState3(false);
  const [form, setForm] = useState3(null);
  const [busy, setBusy] = useState3(false);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "gz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const filtered = searchWorks(data.works, {
    query,
    kind: kindF || void 0,
    status: statusF || void 0,
    favorite: favOnly || void 0,
    limit: 200
  });
  const kindCount = (k) => data.works.filter((w) => w.kind === k).length;
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
  const submitForm = async (payload) => {
    if (busy) return;
    setBusy(true);
    try {
      if (form?.initial) {
        const r = await updateWork(form.initial.id, payload);
        if (!r.ok) throw new Error(r.error || "\u66F4\u65B0\u5931\u8D25");
        showToast(`\u5DF2\u4FDD\u5B58\u300C${payload.title}\u300D`, "good");
      } else {
        const r = await addWork(payload);
        if (!r.ok) throw new Error(r.error || "\u8BB0\u8D26\u5931\u8D25");
        showToast(`\u5DF2\u8BB0\u8D26\uFF1A${payload.title}`, "good");
      }
      setForm(null);
      await reload();
    } catch (e) {
      showToast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const flowActions = (w) => {
    const done = () => doAction(() => updateWork(w.id, { status: "done" }), `\u300A${w.title}\u300B\u5DF2${KIND_VERBS[w.kind] || "\u770B"}\u5B8C\uFF08\u8BB0\u4ECA\u5929\uFF09`);
    if (w.status === "wish") {
      return /* @__PURE__ */ jsxs4(Fragment2, { children: [
        /* @__PURE__ */ jsx4("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(() => updateWork(w.id, { status: "active" }), `\u5F00\u59CB\u300A${w.title}\u300B`), children: "\u5F00\u59CB" }),
        /* @__PURE__ */ jsx4("button", { className: "gz-btn sm", disabled: busy, onClick: done, children: "\u5B8C\u6210" })
      ] });
    }
    if (w.status === "active") {
      return /* @__PURE__ */ jsxs4(Fragment2, { children: [
        /* @__PURE__ */ jsx4("button", { className: "gz-btn sm", disabled: busy, onClick: done, children: "\u5B8C\u6210" }),
        /* @__PURE__ */ jsx4("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(() => updateWork(w.id, { status: "dropped" }), `\u5DF2\u6807\u8BB0\u5F03\u4E86\u300A${w.title}\u300B`), children: "\u5F03" })
      ] });
    }
    if (w.status === "done") {
      return /* @__PURE__ */ jsx4("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(
        () => updateWork(w.id, { favorite: !w.favorite }),
        w.favorite ? `\u5DF2\u53D6\u6D88\u5FC3\u5934\u597D\uFF1A${w.title}` : `\u5DF2\u6807\u4E3A\u5FC3\u5934\u597D\uFF1A${w.title}`
      ), children: w.favorite ? "\u2605 \u53D6\u5FC3\u5934\u597D" : "\u2606 \u5FC3\u5934\u597D" });
    }
    return /* @__PURE__ */ jsx4("button", { className: "gz-btn sm ghost", disabled: busy, onClick: () => doAction(() => updateWork(w.id, { status: "wish" }), `\u300A${w.title}\u300B\u56DE\u5230\u60F3\u770B`), children: "\u56DE\u60F3\u770B" });
  };
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    /* @__PURE__ */ jsx4("div", { className: "gz-card", style: { marginLeft: 16, marginRight: 16 }, children: /* @__PURE__ */ jsxs4("div", { className: "gz-card-b", style: { display: "flex", gap: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx4("input", { className: "gz-inp", value: query, placeholder: "\u641C\u6807\u9898 / \u4F5C\u8005 / \u7C7B\u578B / \u77ED\u8BC4", onChange: (e) => setQuery(e.target.value) }),
      /* @__PURE__ */ jsx4("button", { className: "gz-btn sm", disabled: busy, onClick: () => setForm({ initial: null }), children: "\uFF0B \u8BB0\u4E00\u7B14" })
    ] }) }),
    form && /* @__PURE__ */ jsx4(
      WorkForm,
      {
        initial: form.initial,
        busy,
        submitLabel: form.initial ? "\u4FDD\u5B58" : "\u8BB0\u8D26",
        onSubmit: submitForm,
        onCancel: () => setForm(null)
      }
    ),
    /* @__PURE__ */ jsxs4("div", { className: "gz-chiprow", children: [
      /* @__PURE__ */ jsxs4("button", { className: `gz-chip ${kindF === "" ? "on" : ""}`, onClick: () => setKindF(""), children: [
        "\u5168\u90E8 ",
        data.works.length
      ] }),
      KINDS.filter((k) => kindCount(k) > 0).map((k) => /* @__PURE__ */ jsxs4("button", { className: `gz-chip ${kindF === k ? "on" : ""}`, onClick: () => setKindF(kindF === k ? "" : k), children: [
        KIND_LABELS[k],
        " ",
        kindCount(k)
      ] }, k))
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "gz-chiprow", children: [
      /* @__PURE__ */ jsx4("button", { className: `gz-chip ${statusF === "" ? "on" : ""}`, onClick: () => setStatusF(""), children: "\u5168\u90E8\u72B6\u6001" }),
      STATUSES.map((s) => /* @__PURE__ */ jsx4("button", { className: `gz-chip ${statusF === s ? "on" : ""}`, onClick: () => setStatusF(statusF === s ? "" : s), children: s === "wish" ? "\u60F3\u770B" : s === "active" ? "\u5728\u8FDB\u884C" : s === "done" ? "\u5B8C\u6210" : "\u5F03\u4E86" }, s)),
      /* @__PURE__ */ jsx4("button", { className: `gz-chip ${favOnly ? "on" : ""}`, onClick: () => setFavOnly(!favOnly), children: "\u2605 \u5FC3\u5934\u597D" })
    ] }),
    filtered.length === 0 && /* @__PURE__ */ jsx4("div", { className: "gz-empty", children: data.works.length === 0 ? "\u8D26\u672C\u8FD8\u662F\u7A7A\u7684\u2014\u2014\u53BB\u804A\u5929\u91CC\u8BF4\u300C\u770B\u5B8C\u300A\xD7\xD7\u300B\u62539\u5206\u300D\u3002\n\u6216\u70B9\u53F3\u4E0A\u300C\uFF0B \u8BB0\u4E00\u7B14\u300D\u3002" : "\u6CA1\u6709\u7B26\u5408\u8FC7\u6EE4\u6761\u4EF6\u7684\u8BB0\u5F55\u3002" }),
    filtered.map((w) => /* @__PURE__ */ jsx4("div", { children: /* @__PURE__ */ jsxs4(WorkCard, { work: w, today: data.today, onEdit: () => setForm({ initial: w }), children: [
      flowActions(w),
      /* @__PURE__ */ jsx4("button", { className: "gz-btn sm danger", disabled: busy, onClick: () => doAction(
        async () => {
          await deleteWork(w.id);
        },
        `\u5DF2\u5220\u9664\u300A${w.title}\u300B`
      ), children: "\u5220" })
    ] }) }, w.id)),
    filtered.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "gz-sub", style: { padding: "2px 18px 10px" }, children: [
      "\u72B6\u6001\u6D41\u8F6C\uFF1A\u60F3\u770B \u2192 \u5F00\u59CB \u2192 \u5B8C\u6210\uFF1B",
      statusLabel("movie", "done"),
      "\u540E\u53EF\u968F\u65F6\u6539\u8BC4\u5206\u4E0E\u77ED\u8BC4\uFF08\u7F16\u8F91\uFF09\u3002"
    ] })
  ] });
}

// src/YearReportTab.tsx
import { useMemo, useState as useState4 } from "react";
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function YearReportTab({ data }) {
  const currentYear = todayStr().slice(0, 4);
  const [year, setYear] = useState4(currentYear);
  const years = useMemo(() => {
    if (!data) return [currentYear];
    const set = /* @__PURE__ */ new Set([currentYear]);
    for (const w of data.works) {
      if (w.finishDate && w.finishDate.length >= 4) set.add(w.finishDate.slice(0, 4));
    }
    return [...set].sort().reverse();
  }, [data, currentYear]);
  if (!data) return /* @__PURE__ */ jsx5("div", { className: "gz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const yr = computeYearReport(data.works, year);
  const maxMonth = Math.max(1, ...yr.monthly.map((m) => m.count));
  const maxKind = Math.max(1, ...yr.perKind.map((k) => k.count));
  if (yr.doneCount === 0 && yr.favorites.length === 0) {
    return /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsx5(YearChips, { years, year, onPick: setYear }),
      /* @__PURE__ */ jsx5("div", { className: "gz-empty", children: `${year} \u5E74\u8FD8\u6CA1\u6709\u5B8C\u6210\u8BB0\u5F55\u3002
\u8BB0\u4E0B\u4F60\u770B\u5B8C/\u8BFB\u5B8C/\u73A9\u5B8C\u7684\u6BCF\u4E00\u90E8\uFF0C\u5E74\u5E95\u8FD9\u91CC\u5C31\u662F\u4F60\u7684\u5E74\u5EA6\u62A5\u544A\u3002` })
    ] });
  }
  return /* @__PURE__ */ jsxs5(Fragment3, { children: [
    /* @__PURE__ */ jsx5(YearChips, { years, year, onPick: setYear }),
    /* @__PURE__ */ jsxs5("div", { className: "gz-kpis", children: [
      /* @__PURE__ */ jsxs5("div", { className: "gz-kpi", children: [
        /* @__PURE__ */ jsxs5("small", { children: [
          year,
          " \u5B8C\u6210"
        ] }),
        /* @__PURE__ */ jsx5("b", { children: yr.doneCount }),
        /* @__PURE__ */ jsx5("em", { children: yr.wishCarryover ? `\u6E05\u5355\u9057\u7559 ${yr.wishCarryover}` : "\u5168\u90E8\u6D88\u5316" })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "gz-kpi", children: [
        /* @__PURE__ */ jsx5("small", { children: "\u8BC4\u5206\u5747\u503C" }),
        /* @__PURE__ */ jsx5("b", { children: yr.avgRating != null ? yr.avgRating : "\u2014" }),
        /* @__PURE__ */ jsxs5("em", { children: [
          "\u5DF2\u8BC4 ",
          yr.ratedCount,
          " \u6761"
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "gz-kpi", children: [
        /* @__PURE__ */ jsx5("small", { children: "\u5FC3\u5934\u597D" }),
        /* @__PURE__ */ jsx5("b", { children: yr.favorites.length }),
        /* @__PURE__ */ jsx5("em", { children: "\u79C1\u5FC3\u504F\u7231" })
      ] })
    ] }),
    yr.perKind.length > 0 && /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "gz-sec", children: [
        /* @__PURE__ */ jsx5("span", { className: "gz-bar" }),
        "\u5206\u4F53\u88C1"
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "gz-card", children: /* @__PURE__ */ jsx5("div", { className: "gz-card-b", children: /* @__PURE__ */ jsx5("div", { className: "gz-bars", children: yr.perKind.map((k) => /* @__PURE__ */ jsxs5("div", { className: "gz-bar-row", children: [
        /* @__PURE__ */ jsx5("span", { className: "nm", children: k.label }),
        /* @__PURE__ */ jsx5("span", { className: "tr", children: /* @__PURE__ */ jsx5("i", { style: { width: `${Math.round(k.count / maxKind * 100)}%` } }) }),
        /* @__PURE__ */ jsxs5("span", { className: "vl", children: [
          "\xD7",
          k.count,
          k.avg != null ? ` \xB7 \u5747 ${k.avg}` : ""
        ] })
      ] }, k.kind)) }) }) })
    ] }),
    yr.doneCount > 0 && /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "gz-sec", children: [
        /* @__PURE__ */ jsx5("span", { className: "gz-bar" }),
        "\u6708\u5EA6\u8282\u594F",
        /* @__PURE__ */ jsx5("span", { className: "gz-hint", children: "\u5B8C\u6210\u7B14\u6570" })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "gz-card", children: /* @__PURE__ */ jsx5("div", { className: "gz-card-b", children: /* @__PURE__ */ jsx5("div", { className: "gz-months", children: yr.monthly.map((m) => /* @__PURE__ */ jsxs5("div", { className: "gz-month", title: `${m.month} \u6708\u5B8C\u6210 ${m.count}${m.avg != null ? `\uFF0C\u5747\u5206 ${m.avg}` : ""}`, children: [
        /* @__PURE__ */ jsx5("span", { className: "mc", children: m.count || "" }),
        /* @__PURE__ */ jsx5("i", { style: { height: `${Math.round(m.count / maxMonth * 70)}px` } }),
        /* @__PURE__ */ jsx5("small", { children: m.month })
      ] }, m.month)) }) }) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "gz-bar" }),
      "\u8BC4\u5206\u6863"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "gz-card", children: /* @__PURE__ */ jsx5("div", { className: "gz-card-b", style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: RATING_BANDS.map((b) => /* @__PURE__ */ jsx5("span", { className: `gz-chip ${b !== "\u672A\u8BC4" && yr.ratingBands[b] ? "on" : ""}`, children: b === "\u672A\u8BC4" ? `\u672A\u8BC4 \xD7${yr.doneCount - yr.ratedCount}` : `${b} \xD7${yr.ratingBands[b] || 0}` }, b)) }) }),
    yr.top.length > 0 && /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "gz-sec", children: [
        /* @__PURE__ */ jsx5("span", { className: "gz-bar" }),
        "\u5E74\u5EA6\u5341\u4F73",
        /* @__PURE__ */ jsx5("span", { className: "gz-hint", children: "\u5206\u6570 \u2192 \u5B8C\u6210\u65E5" })
      ] }),
      yr.top.map((w, i) => {
        const theme = KIND_THEME[w.kind] || KIND_THEME.other;
        return /* @__PURE__ */ jsxs5("div", { className: "gz-item", children: [
          /* @__PURE__ */ jsx5("span", { className: "gz-rank", children: i + 1 }),
          /* @__PURE__ */ jsx5("div", { className: "gz-cover", style: { background: theme.grad }, children: theme.emoji }),
          /* @__PURE__ */ jsxs5("div", { className: "gz-item-main", children: [
            /* @__PURE__ */ jsxs5("div", { className: "gz-item-head", children: [
              /* @__PURE__ */ jsx5("b", { children: w.title }),
              /* @__PURE__ */ jsxs5("span", { className: "gz-rate", children: [
                w.rating,
                " \u5206"
              ] })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "gz-item-mid", children: [
              /* @__PURE__ */ jsx5("span", { className: "gz-meta", children: [w.year, w.creator, w.finishDate].filter(Boolean).join(" \xB7 ") }),
              /* @__PURE__ */ jsx5("span", { className: "gz-badge", children: KIND_LABELS[w.kind] || w.kind })
            ] }),
            w.note && /* @__PURE__ */ jsx5("div", { className: "gz-item-foot", children: /* @__PURE__ */ jsx5("span", { className: "note", children: w.note }) })
          ] })
        ] }, w.id);
      })
    ] }),
    yr.favorites.length > 0 && /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "gz-sec", children: [
        /* @__PURE__ */ jsx5("span", { className: "gz-bar" }),
        "\u5FC3\u5934\u597D",
        /* @__PURE__ */ jsx5("span", { className: "gz-hint", children: "\u5341\u4F73\u4E4B\u5916\u7684\u79C1\u5FC3\u504F\u7231" })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "gz-card", children: /* @__PURE__ */ jsx5("div", { className: "gz-card-b", style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: yr.favorites.map((w) => /* @__PURE__ */ jsxs5("span", { className: "gz-chip on", children: [
        "\u2605 ",
        w.title
      ] }, w.id)) }) })
    ] }),
    yr.longestNote && /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "gz-sec", children: [
        /* @__PURE__ */ jsx5("span", { className: "gz-bar" }),
        "\u5E74\u5EA6\u6700\u957F\u77ED\u8BC4"
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "gz-quote", style: { margin: "0 16px 10px" }, children: [
        /* @__PURE__ */ jsxs5("b", { children: [
          "\u300A",
          yr.longestNote.title,
          "\u300B",
          yr.longestNote.rating != null ? ` \xB7 ${yr.longestNote.rating} \u5206` : ""
        ] }),
        yr.longestNote.note
      ] })
    ] })
  ] });
}
function YearChips({ years, year, onPick }) {
  return /* @__PURE__ */ jsx5("div", { className: "gz-chiprow", children: years.map((y) => /* @__PURE__ */ jsx5("button", { className: `gz-chip ${y === year ? "on" : ""}`, onClick: () => onPick(y), children: y }, y)) });
}

// src/SettingsTab.tsx
import { useState as useState5 } from "react";
import { Fragment as Fragment4, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function SettingsTab({ data, reload, showToast }) {
  const [importText, setImportText] = useState5("");
  const [busy, setBusy] = useState5(false);
  const [clearArmed, setClearArmed] = useState5(false);
  if (!data) return /* @__PURE__ */ jsx6("div", { className: "gz-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const count = data.works.length;
  const exportCsv = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(data.works));
      showToast(`\u5DF2\u590D\u5236 ${count} \u6761\u8BB0\u5F55 CSV\uFF08\u53EF\u76F4\u63A5\u7C98\u8D34\u8FDB Excel\uFF09`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const exportJson = async () => {
    try {
      const dump = JSON.stringify({ exportedAt: Date.now(), works: data.works }, null, 2);
      await navigator.clipboard.writeText(dump);
      showToast(`\u5DF2\u590D\u5236 ${count} \u6761\u8BB0\u5F55 JSON`, "good");
    } catch (e) {
      showToast(`\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const doImport = async () => {
    if (busy) return;
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      showToast(`JSON \u89E3\u6790\u5931\u8D25\uFF1A${e.message}`, "bad");
      return;
    }
    const list = Array.isArray(parsed) ? parsed : parsed?.works;
    if (!Array.isArray(list)) {
      showToast("\u5BFC\u5165\u5185\u5BB9\u9700\u4E3A\u8BB0\u5F55\u6570\u7EC4\u6216\u5BFC\u51FA dump\uFF08{works:[\u2026]}\uFF09", "bad");
      return;
    }
    setBusy(true);
    try {
      const norm = normalizeImport(list, data.works);
      if (norm.error) {
        showToast(norm.error, "bad");
        return;
      }
      for (const w of norm.accepted || []) {
        await kvSet(K.work(w.id), w);
      }
      const rej = norm.rejected || [];
      showToast(`\u5BFC\u5165 ${norm.accepted?.length || 0} \u6761${norm.duplicates ? `\uFF0C\u5224\u91CD\u8DF3\u8FC7 ${norm.duplicates}` : ""}${rej.length ? `\uFF0C\u62D2\u7EDD ${rej.length}\uFF08\u5982\uFF1A${rej[0].error}\uFF09` : ""}`, rej.length && !norm.accepted?.length ? "bad" : "good");
      setImportText("");
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const clearAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith("guanzhi."));
      for (const k of keys) {
        await kvDel(k);
      }
      await reload();
      showToast("\u5DF2\u6E05\u7A7A\u5168\u90E8\u4E66\u5F71\u97F3\u8D26\u672C\u6570\u636E");
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  return /* @__PURE__ */ jsxs6(Fragment4, { children: [
    /* @__PURE__ */ jsxs6("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "gz-bar" }),
      "\u5BFC\u51FA",
      /* @__PURE__ */ jsx6("span", { className: "gz-hint", children: "\u590D\u5236\u5230\u526A\u8D34\u677F" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "gz-card", children: /* @__PURE__ */ jsxs6("div", { className: "gz-card-b", style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsxs6("button", { className: "gz-btn sm ghost", onClick: exportCsv, children: [
        "\u590D\u5236 CSV\uFF08",
        count,
        " \u6761\uFF09"
      ] }),
      /* @__PURE__ */ jsx6("button", { className: "gz-btn sm ghost", onClick: exportJson, children: "\u590D\u5236 JSON" })
    ] }) }),
    /* @__PURE__ */ jsxs6("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "gz-bar" }),
      "\u5BFC\u5165 JSON",
      /* @__PURE__ */ jsx6("span", { className: "gz-hint", children: "\u4E66\u5F71\u97F3\u8D26\u672C\u5BFC\u51FA\u683C\u5F0F\uFF1B\u540C\u4F53\u88C1\u540C\u540D\u540C\u5E74\u5224\u91CD" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "gz-card", children: /* @__PURE__ */ jsxs6("div", { className: "gz-card-b", children: [
      /* @__PURE__ */ jsx6(
        "textarea",
        {
          className: "gz-inp gz-ta",
          value: importText,
          placeholder: '\u7C98\u8D34\u8BB0\u5F55\u6570\u7EC4\uFF0C\u5982 [{"title":"\u4E09\u4F53","kind":"book","status":"done","rating":9.5}]',
          onChange: (e) => setImportText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx6("div", { className: "gz-form-actions", children: /* @__PURE__ */ jsx6("button", { className: "gz-btn", disabled: busy || !importText.trim(), onClick: doImport, children: "\u89E3\u6790\u5E76\u5BFC\u5165" }) })
    ] }) }),
    /* @__PURE__ */ jsxs6("div", { className: "gz-sec", children: [
      /* @__PURE__ */ jsx6("span", { className: "gz-bar" }),
      "\u6570\u636E",
      /* @__PURE__ */ jsx6("span", { className: "gz-hint", children: "\u7EAF\u672C\u5730 cap.kv \xB7 \u4E0D\u51FA\u8BBE\u5907" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "gz-card", children: /* @__PURE__ */ jsxs6("div", { className: "gz-card-b", children: [
      clearArmed ? /* @__PURE__ */ jsxs6("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs6("button", { className: "gz-btn sm danger", onClick: async () => {
          if (window.confirm("\u518D\u6B21\u786E\u8BA4\uFF1A\u6E05\u7A7A\u4E66\u5F71\u97F3\u8D26\u672C\u5168\u90E8\u6570\u636E\uFF1F\u4E0D\u53EF\u6062\u590D\u3002")) {
            setClearArmed(false);
            await clearAll();
          } else setClearArmed(false);
        }, children: [
          "\u786E\u8BA4\u6E05\u7A7A\uFF08",
          count,
          " \u6761\u8BB0\u5F55\uFF09"
        ] }),
        /* @__PURE__ */ jsx6("button", { className: "gz-btn sm ghost", onClick: () => setClearArmed(false), children: "\u7B97\u4E86" })
      ] }) : /* @__PURE__ */ jsx6("button", { className: "gz-btn sm danger", onClick: () => setClearArmed(true), children: "\u6E05\u7A7A\u5168\u90E8\u6570\u636E" }),
      /* @__PURE__ */ jsxs6("small", { className: "gz-sub", style: { display: "block", marginTop: 6 }, children: [
        "\u8D26\u672C\u4E0E\u8BBE\u7F6E\u4E00\u5E76\u5220\u9664\uFF0C\u4E0D\u53EF\u6062\u590D\uFF1B\u5EFA\u8BAE\u5148\u590D\u5236 JSON \u5907\u4EFD\u3002\u952E\u7A7A\u95F4 ",
        K.workPrefix,
        "* \u4E0E ",
        K.settings,
        "\u3002"
      ] })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var css = `
.gz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.gz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.gz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.gz-body::-webkit-scrollbar{width:9px;height:9px}
.gz-body::-webkit-scrollbar-track{background:transparent}
.gz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.gz-page{max-width:560px;margin:0 auto}
.gz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#14100C 75%,rgba(20,16,12,0))}
.gz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E8944A,#C7572B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.gz-tt{flex:1;min-width:0}
.gz-tt b{font-size:15px;display:block}
.gz-tt small{color:#A8988A;font-size:10.5px;display:block;margin-top:1px;font-variant-numeric:tabular-nums}
.gz-tabs{display:flex;gap:4px}
.gz-tab{background:transparent;border:none;color:#A08F80;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.gz-tab:hover{color:#F2E8DC}
.gz-tab.on{background:#2A2119;color:#F2E8DC;font-weight:600}
.gz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.gz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E8944A,#C7572B);flex-shrink:0}
.gz-hint{margin-left:auto;font-size:10.5px;color:#6E6156;font-weight:400}
.gz-card{background:#1A1511;border:1px solid #33291F;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.gz-card-b{padding:11px 13px}
.gz-sub{font-size:10.5px;color:#A8988A;line-height:1.6}
.gz-btn{background:#C7572B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.gz-btn:hover{filter:brightness(1.12)}
.gz-btn:disabled{opacity:.45;cursor:not-allowed}
.gz-btn.ghost{background:#26201A;color:#F2E8DC;border:1px solid #33291F}
.gz-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.gz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.gz-inp{background:#14100C;border:1px solid #33291F;border-radius:8px;color:#F2E8DC;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.gz-inp:focus{outline:none;border-color:#C7572B}
.gz-inp::placeholder{color:#5C5248}
.gz-ta{resize:vertical;min-height:84px;font-family:inherit}
.gz-lbl{font-size:11px;color:#A8988A;margin:8px 0 4px;display:block}
.gz-sel{background:#14100C;border:1px solid #33291F;border-radius:8px;color:#F2E8DC;padding:7px 8px;font-size:12px}
.gz-empty{color:#A8988A;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9;white-space:pre-line}
.gz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(26,21,17,.97);border:1px solid #33291F;color:#F2E8DC;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.gz-toast.bad{border-color:#54262c;color:#FF8A9A}
.gz-toast.good{border-color:#2b4a35;color:#7EE2A0}
.gz-kpis{display:flex;gap:8px;margin:0 16px 10px}
.gz-kpi{flex:1;background:#1A1511;border:1px solid #33291F;border-radius:11px;padding:9px 11px;min-width:0}
.gz-kpi small{display:block;color:#A8988A;font-size:10px;margin-bottom:2px}
.gz-kpi b{font-size:15px;font-variant-numeric:tabular-nums;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-kpi em{font-style:normal;font-size:9.5px;color:#6E6156;display:block;margin-top:1px}
.gz-chip{background:#2A2119;border:1px solid #33291F;border-radius:999px;color:#C4B4A4;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.gz-chip:hover{border-color:#4A3A2C}
.gz-chip.on{background:#33230f;border-color:#C7572B;color:#F2B583;font-weight:600}
.gz-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.gz-item{background:#1A1511;border:1px solid #33291F;border-radius:12px;margin:0 16px 8px;padding:10px 12px;display:flex;gap:10px}
.gz-cover{width:40px;height:54px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
.gz-item-main{flex:1;min-width:0}
.gz-item-head{display:flex;align-items:center;gap:7px}
.gz-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-badge{flex-shrink:0;font-size:9.5px;color:#A8988A;background:#26201A;border:1px solid #33291F;border-radius:6px;padding:1px 6px;white-space:nowrap}
.gz-badge.wish{color:#9FB6D9;border-color:#2e3d54;background:rgba(90,130,190,.08)}
.gz-badge.active{color:#F2B263;border-color:#5a3d1a;background:rgba(232,145,45,.08)}
.gz-badge.done{color:#7EE2A0;border-color:#2b4a35;background:rgba(80,200,120,.07)}
.gz-badge.drop{color:#8B8178;border-color:#3a332c;background:rgba(120,110,100,.08)}
.gz-badge.fav{color:#F2D063;border-color:#5a4a1a;background:rgba(232,200,60,.07)}
.gz-rate{flex-shrink:0;font-size:11.5px;color:#F2B263;font-weight:700;font-variant-numeric:tabular-nums}
.gz-item-mid{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.gz-meta{font-size:10.5px;color:#8A7A6A;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-item-foot{display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap}
.gz-item-foot .note{flex:1 1 100%;min-width:0;color:#8A7A6A;font-size:10.5px;line-height:1.5;white-space:normal}
.gz-form-actions{display:flex;gap:8px;margin-top:12px}
.gz-bars{display:flex;flex-direction:column;gap:7px;padding:4px 2px}
.gz-bar-row{display:flex;align-items:center;gap:8px}
.gz-bar-row .nm{width:64px;font-size:11px;color:#C4B4A4;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-bar-row .tr{flex:1;height:14px;background:#14100C;border-radius:4px;overflow:hidden}
.gz-bar-row .tr i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#E8944A,#C7572B)}
.gz-bar-row .vl{width:96px;font-size:10.5px;color:#A8988A;font-variant-numeric:tabular-nums;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-months{display:flex;align-items:flex-end;gap:5px;height:92px;padding:6px 4px 0}
.gz-month{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end}
.gz-month i{display:block;width:100%;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#E8944A,#C7572B);min-height:2px}
.gz-month small{font-size:9px;color:#6E6156}
.gz-month .mc{font-size:9.5px;color:#F2B263;font-variant-numeric:tabular-nums}
.gz-quote{margin-top:8px;background:#14100C;border:1px solid #33291F;border-radius:8px;padding:9px 11px;font-size:11.5px;color:#D8C8B4;line-height:1.7}
.gz-quote b{color:#F2E8DC;font-size:11.5px;display:block;margin-bottom:3px}
.gz-rank{width:20px;flex-shrink:0;text-align:center;font-size:11px;color:#F2B263;font-weight:700;font-variant-numeric:tabular-nums;padding-top:1px}
.gz-confirm-inline{display:flex;gap:6px;align-items:center}
`;
function GuanzhiPanel(_props) {
  const [tab, setTab] = useState6("overview");
  const [data, setData] = useState6(null);
  const [loadErr, setLoadErr] = useState6("");
  const [toast, setToast] = useState6(null);
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
    if (!data) return { text: "\u8F7D\u5165\u4E2D\u2026" };
    const ov = data.overview;
    return {
      text: `\u4ECA\u5E74\u5B8C\u6210 ${ov.thisYearDone} \xB7 \u8D26\u672C ${ov.total} \u6761 \xB7 \u60F3\u770B ${ov.wishCount}`
    };
  })();
  return /* @__PURE__ */ jsxs7("div", { className: "gz-root", children: [
    /* @__PURE__ */ jsx7("style", { children: css }),
    /* @__PURE__ */ jsxs7("div", { className: "gz-top", children: [
      /* @__PURE__ */ jsx7("div", { className: "gz-logo", children: "\u{1F39E}\uFE0F" }),
      /* @__PURE__ */ jsxs7("div", { className: "gz-tt", children: [
        /* @__PURE__ */ jsx7("b", { children: "\u4E66\u5F71\u97F3\u8D26\u672C" }),
        /* @__PURE__ */ jsx7("small", { children: headInfo.text })
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "gz-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["library", "\u85CF\u5377"],
        ["report", "\u5E74\u62A5"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx7("button", { className: `gz-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx7("div", { className: "gz-body", children: /* @__PURE__ */ jsxs7("div", { className: "gz-page", children: [
      loadErr && /* @__PURE__ */ jsxs7("div", { className: "gz-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx7(OverviewTab, { data, reload, showToast }),
      tab === "library" && /* @__PURE__ */ jsx7(LibraryTab, { data, reload, showToast }),
      tab === "report" && /* @__PURE__ */ jsx7(YearReportTab, { data }),
      tab === "settings" && /* @__PURE__ */ jsx7(SettingsTab, { data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx7("div", { className: `gz-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function GuanzhiEntry(props) {
  return /* @__PURE__ */ jsx8(GuanzhiPanel, { ...props });
}
export {
  GuanzhiEntry as default
};
