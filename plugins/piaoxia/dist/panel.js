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

// shared/sha256.js
var require_sha256 = __commonJS({
  "shared/sha256.js"(exports, module) {
    "use strict";
    var K = [
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ];
    function utf8Bytes(str) {
      const out = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 55296 && c <= 56319 && i + 1 < str.length) {
          const c2 = str.charCodeAt(i + 1);
          if (c2 >= 56320 && c2 <= 57343) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            i++;
          }
        }
        if (c < 128) out.push(c);
        else if (c < 2048) out.push(192 | c >> 6, 128 | c & 63);
        else if (c < 65536) out.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
        else out.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
      }
      return new Uint8Array(out);
    }
    function rotr(x, n) {
      return x >>> n | x << 32 - n;
    }
    function sha256Hex(input) {
      const bytes = utf8Bytes(String(input));
      const bitLen = bytes.length * 8;
      const padded = bytes.length + 9 + 63 & ~63;
      const m = new Uint8Array(padded);
      m.set(bytes);
      m[bytes.length] = 128;
      const dv = new DataView(m.buffer);
      dv.setUint32(padded - 8, Math.floor(bitLen / 4294967296), false);
      dv.setUint32(padded - 4, bitLen >>> 0, false);
      let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
      let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
      const w = new Int32Array(64);
      for (let off = 0; off < padded; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
          w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = e & f ^ ~e & g;
          const t1 = h + S1 + ch + K[i] + w[i] | 0;
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = a & b ^ a & c ^ b & c;
          const t2 = S0 + maj | 0;
          h = g;
          g = f;
          f = e;
          e = d + t1 | 0;
          d = c;
          c = b;
          b = a;
          a = t1 + t2 | 0;
        }
        h0 = h0 + a | 0;
        h1 = h1 + b | 0;
        h2 = h2 + c | 0;
        h3 = h3 + d | 0;
        h4 = h4 + e | 0;
        h5 = h5 + f | 0;
        h6 = h6 + g | 0;
        h7 = h7 + h | 0;
      }
      const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
      return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
    }
    module.exports = { sha256Hex };
  }
});

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var { sha256Hex } = require_sha256();
    var K = {
      INVOICE: "piaoxia.invoice.",
      TITLE: "piaoxia.title.",
      META: "piaoxia.meta"
    };
    var KINDS2 = {
      dpt_special: "\u6570\u7535\u4E13\u7968",
      dpt_common: "\u6570\u7535\u666E\u7968",
      e_special: "\u7535\u5B50\u4E13\u7968",
      e_common: "\u7535\u5B50\u666E\u7968",
      rail: "\u94C1\u8DEF\u5BA2\u7968",
      air: "\u822A\u7A7A\u884C\u7A0B\u5355",
      toll: "\u901A\u884C\u8D39\u53D1\u7968",
      taxi: "\u51FA\u79DF\u8F66\u7968",
      other: "\u5176\u4ED6"
    };
    var KIND_KEYWORDS = [
      ["dpt_special", ["\u7535\u5B50\u53D1\u7968\uFF08\u589E\u503C\u7A0E\u4E13\u7528\u53D1\u7968\uFF09", "\u7535\u5B50\u53D1\u7968(\u589E\u503C\u7A0E\u4E13\u7528\u53D1\u7968)"]],
      ["dpt_common", ["\u7535\u5B50\u53D1\u7968\uFF08\u666E\u901A\u53D1\u7968\uFF09", "\u7535\u5B50\u53D1\u7968(\u666E\u901A\u53D1\u7968)"]],
      ["e_special", ["\u589E\u503C\u7A0E\u7535\u5B50\u4E13\u7528\u53D1\u7968"]],
      ["e_common", ["\u589E\u503C\u7A0E\u7535\u5B50\u666E\u901A\u53D1\u7968"]],
      ["toll", ["\u6536\u8D39\u516C\u8DEF\u901A\u884C\u8D39", "\u901A\u884C\u8D39\u7535\u5B50\u7968\u636E"]],
      ["rail", ["\u94C1\u8DEF\u7535\u5B50\u5BA2\u7968", "\u94C1\u8DEF\u7535\u5B50\u53D1\u7968", "\u7535\u5B50\u5BA2\u7968\uFF08\u94C1\u8DEF"]],
      ["air", ["\u822A\u7A7A\u8FD0\u8F93\u7535\u5B50\u5BA2\u7968\u884C\u7A0B\u5355", "\u822A\u7A7A\u8FD0\u8F93\u7535\u5B50\u5BA2\u7968"]],
      ["taxi", ["\u51FA\u79DF\u6C7D\u8F66", "\u51FA\u79DF\u8F66\u53D1\u7968", "\u51FA\u79DF\u8F66"]]
    ];
    var STATUSES4 = {
      pending: "\u5F85\u62A5\u9500",
      submitted: "\u5DF2\u63D0\u4EA4",
      settled: "\u5DF2\u5230\u8D26",
      rejected: "\u5DF2\u9000\u56DE",
      excluded: "\u4E0D\u62A5\u9500"
    };
    var TRANSITIONS2 = {
      pending: ["submitted", "excluded"],
      submitted: ["settled", "rejected", "excluded", "pending"],
      settled: ["submitted"],
      rejected: ["submitted", "pending", "excluded"],
      excluded: ["pending"]
    };
    var PURPOSES2 = {
      expense: "\u62A5\u9500",
      warranty: "\u4FDD\u4FEE",
      rights: "\u7EF4\u6743",
      archive: "\u5B58\u6863"
    };
    var CATEGORIES3 = {
      meal: "\u9910\u996E",
      transport: "\u4EA4\u901A",
      hotel: "\u4F4F\u5BBF",
      telecom: "\u901A\u8BAF",
      event: "\u4F1A\u52A1\u57F9\u8BAD",
      logistics: "\u5FEB\u9012\u7269\u6D41",
      office: "\u529E\u516C\u670D\u52A1",
      purchase: "\u91C7\u8D2D",
      other: "\u5176\u4ED6"
    };
    var CATEGORY_KEYWORDS = [
      ["meal", ["\u9910\u996E", "\u996D\u5E97", "\u9910\u5385", "\u98DF\u54C1", "\u5C0F\u5403", "\u706B\u9505", "\u5496\u5561", "\u8336\u996E", "\u5976\u8336", "\u9762\u9986", "\u70E7\u70E4", "\u5FEB\u9910", "\u5916\u5356", "\u996E\u98DF", "\u9762\u5305", "\u70D8\u7119", "\u9152\u697C", "\u83DC\u9986"]],
      ["transport", ["\u51FA\u79DF", "\u7F51\u7EA6\u8F66", "\u51FA\u884C", "\u5BA2\u8FD0", "\u94C1\u8DEF", "\u706B\u8F66", "\u9AD8\u94C1", "\u822A\u7A7A", "\u673A\u7968", "\u6253\u8F66", "\u5730\u94C1", "\u516C\u4EA4", "\u5BA2\u8FD0\u670D\u52A1", "\u8FD0\u8F93", "\u4EA4\u901A"]],
      ["hotel", ["\u9152\u5E97", "\u5BBE\u9986", "\u4F4F\u5BBF", "\u65C5\u9986", "\u6C11\u5BBF", "\u516C\u5BD3\u7BA1\u7406"]],
      ["telecom", ["\u901A\u8BAF", "\u901A\u4FE1", "\u7535\u4FE1", "\u79FB\u52A8\u901A\u4FE1", "\u8054\u901A", "\u7F51\u7EDC\u670D\u52A1", "\u5BBD\u5E26"]],
      ["event", ["\u4F1A\u8BAE", "\u4F1A\u52A1", "\u4F1A\u5C55", "\u57F9\u8BAD", "\u8BBA\u575B", "\u95E8\u7968"]],
      ["logistics", ["\u5FEB\u9012", "\u7269\u6D41", "\u90AE\u653F", "\u8D27\u8FD0", "\u901F\u8FD0", "\u8FD0\u8F93\u4EE3\u7406"]],
      ["office", ["\u529E\u516C", "\u6587\u5177", "\u6253\u5370", "\u590D\u5370", "\u8017\u6750", "\u8F6F\u4EF6", "\u4FE1\u606F\u6280\u672F", "\u6280\u672F\u670D\u52A1", "\u54A8\u8BE2", "\u8BBE\u8BA1", "\u5F00\u53D1", "\u670D\u52A1\u8D39", "\u63A8\u5E7F", "\u5E7F\u544A"]],
      ["purchase", ["\u767E\u8D27", "\u8D85\u5E02", "\u5546\u573A", "\u7535\u5668", "\u7535\u5B50", "\u4E94\u91D1", "\u5EFA\u6750", "\u8D38\u6613", "\u5546\u5E97", "\u5BB6\u5C45", "\u5668\u68B0", "\u8BBE\u5907"]]
    ];
    function clip(s, n) {
      if (s === null || s === void 0) return "";
      return String(s).slice(0, n);
    }
    function normName2(s) {
      return clip(s, 400).replace(/\s+/g, "").toLowerCase();
    }
    function displayName(s) {
      return clip(s, 400).trim();
    }
    function idFor(seed) {
      return "p" + sha256Hex(String(seed)).slice(0, 12);
    }
    function invoiceId(inv) {
      const num = digitsOnly(inv.number);
      if (num) return idFor("inv|" + num);
      return idFor("inv-manual|" + dateKeyOf(inv.date) + "|" + normName2(inv.seller && inv.seller.name) + "|" + num2(inv.total) + "|" + normName2(firstItemName(inv)));
    }
    function digitsOnly(s) {
      if (s === null || s === void 0) return "";
      const d = String(s).replace(/\D+/g, "");
      return d;
    }
    function num2(v) {
      const n = Number(v);
      if (!isFinite(n)) return "0.00";
      return (Math.round(n * 100) / 100).toFixed(2);
    }
    function firstItemName(inv) {
      const items = inv && Array.isArray(inv.items) ? inv.items : [];
      const first = items[0];
      return first && first.name ? first.name : "";
    }
    function parseTs(v) {
      if (v === null || v === void 0 || v === "") return null;
      if (typeof v === "number" && isFinite(v)) {
        const n = v > 1e12 ? v : v * 1e3;
        const d2 = new Date(n);
        return isNaN(d2.getTime()) ? null : d2.getTime();
      }
      const s = String(v).trim();
      if (!s) return null;
      let m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日T\s](\d{1,2}):(\d{1,2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    function dateKeyOf(v) {
      const ts = parseTs(v);
      if (ts === null) return "";
      const d = new Date(ts);
      const p = (x) => String(x).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    }
    function monthKeyOf(v) {
      const dk = dateKeyOf(v);
      return dk ? dk.slice(0, 7) : "";
    }
    function todayKey4(nowMs) {
      return dateKeyOf(new Date(nowMs === void 0 ? Date.now() : nowMs));
    }
    function addMonths(dateKey, months) {
      const m = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return "";
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const day = d.getDate();
      d.setMonth(d.getMonth() + Number(months || 0));
      if (d.getDate() < day) d.setDate(0);
      const p = (x) => String(x).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    }
    function daysBetween(fromKey, toKey) {
      const a = parseTs(fromKey);
      const b = parseTs(toKey);
      if (a === null || b === null) return null;
      return Math.round((b - a) / 864e5);
    }
    var KIND_CATEGORY_HINT = {
      rail: "transport",
      air: "transport",
      toll: "transport",
      taxi: "transport"
    };
    function classifyCategory(sellerName, itemNames, kindHint) {
      if (kindHint && KIND_CATEGORY_HINT[kindHint]) {
        const cat = CATEGORIES3[KIND_CATEGORY_HINT[kindHint]] ? KIND_CATEGORY_HINT[kindHint] : null;
        if (cat) return cat;
      }
      const hay = normName2([sellerName].concat(Array.isArray(itemNames) ? itemNames : []).join("|"));
      if (!hay) return "other";
      for (const [key, words] of CATEGORY_KEYWORDS) {
        for (const w of words) {
          if (hay.indexOf(normName2(w)) !== -1) return key;
        }
      }
      return "other";
    }
    function normParty(raw) {
      const p = raw && typeof raw === "object" ? raw : {};
      return {
        name: displayName(p.name),
        taxId: clip(String(p.taxId || "")).replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 32)
      };
    }
    function normalizeItems(raw, prev) {
      const arr = Array.isArray(raw) ? raw : raw === void 0 && prev ? prev : [];
      const out = [];
      for (const it of arr.slice(0, 30)) {
        if (!it || typeof it !== "object") continue;
        const name = displayName(it.name);
        if (!name) continue;
        const item = { name: clip(name, 120) };
        const amount = Number(it.amount);
        if (isFinite(amount) && amount >= 0) item.amount = Math.round(amount * 100) / 100;
        const qty = Number(it.qty);
        if (isFinite(qty) && qty > 0) item.qty = qty;
        out.push(item);
      }
      return out;
    }
    function normalizeInvoice2(raw, prev) {
      const r = raw && typeof raw === "object" ? raw : {};
      const p = prev && typeof prev === "object" ? prev : {};
      const pick = (v, pv) => v === void 0 ? pv : v;
      const total = roundMoney(pick(r.total, p.total));
      if (total === null || total <= 0 || total > 1e12) {
        throw new Error("\u4EF7\u7A0E\u5408\u8BA1\u5FC5\u987B\u662F\u6B63\u6570\uFF08\u6CA1\u6709\u91D1\u989D\u7684\u4E0D\u6210\u7968\uFF09");
      }
      const number = digitsOnly(pick(r.number, p.number)).slice(0, 30);
      const code = digitsOnly(pick(r.code, p.code)).slice(0, 20);
      const kindRaw = pick(r.kind, p.kind);
      const kind = KINDS2[kindRaw] ? kindRaw : "other";
      const statusRaw = pick(r.status, p.status);
      const status = STATUSES4[statusRaw] ? statusRaw : "pending";
      const purposeRaw = pick(r.purpose, p.purpose);
      const purpose = PURPOSES2[purposeRaw] ? purposeRaw : "expense";
      const categoryRaw = pick(r.category, p.category);
      const category = CATEGORIES3[categoryRaw] ? categoryRaw : null;
      const date = pick(r.date, p.date);
      const dateKey = dateKeyOf(date);
      const warrantyMonthsRaw = pick(r.warrantyMonths, p.warrantyMonths);
      let warrantyMonths = null;
      if (warrantyMonthsRaw !== null && warrantyMonthsRaw !== void 0 && warrantyMonthsRaw !== "") {
        const n = Math.round(Number(warrantyMonthsRaw));
        if (isFinite(n) && n >= 0 && n <= 120) warrantyMonths = n;
      }
      const inv = {
        id: "",
        number,
        code,
        kind,
        title: clip(pick(r.title, p.title), 60),
        date: dateKey,
        buyer: normParty(pick(r.buyer, p.buyer)),
        seller: normParty(pick(r.seller, p.seller)),
        items: normalizeItems(pick(r.items, p.items), p.items),
        amount: roundMoney(pick(r.amount, p.amount)),
        tax: roundMoney(pick(r.tax, p.tax)),
        total: Math.round(total * 100) / 100,
        category,
        purpose,
        status,
        reimburseId: clip(pick(r.reimburseId, p.reimburseId), 40).trim(),
        submittedAt: clip(pick(r.submittedAt, p.submittedAt), 20),
        settledAt: clip(pick(r.settledAt, p.settledAt), 20),
        rejectNote: clip(pick(r.rejectNote, p.rejectNote), 300),
        warrantyMonths,
        source: pick(r.source, p.source) === "manual" ? "manual" : "collect",
        srcPath: clip(pick(r.srcPath, p.srcPath), 500),
        fileName: clip(pick(r.fileName, p.fileName), 200),
        fileSha256: clip(pick(r.fileSha256, p.fileSha256), 64).toLowerCase(),
        archivedPath: clip(pick(r.archivedPath, p.archivedPath), 500),
        note: clip(pick(r.note, p.note), 500),
        createdAt: pick(r.createdAt, p.createdAt) || "",
        updatedAt: ""
      };
      if (!inv.category) {
        inv.category = classifyCategory(inv.seller.name, inv.items.map((x) => x.name), inv.kind);
      }
      inv.warrantyUntil = inv.warrantyMonths !== null && inv.date ? addMonths(inv.date, inv.warrantyMonths) : "";
      inv.id = invoiceId(inv);
      return inv;
    }
    function roundMoney(v) {
      if (v === null || v === void 0 || v === "") return null;
      const n = Number(String(v).replace(/[,¥￥\s]/g, ""));
      if (!isFinite(n) || n < 0) return null;
      return Math.round(n * 100) / 100;
    }
    function canTransition(from, to) {
      if (!STATUSES4[from] || !STATUSES4[to]) return { ok: false, message: "\u672A\u77E5\u72B6\u6001" };
      if (from === to) return { ok: true, message: "\u72B6\u6001\u672A\u53D8\u5316" };
      if ((TRANSITIONS2[from] || []).indexOf(to) !== -1) return { ok: true, message: "" };
      return {
        ok: false,
        message: "\u4E0D\u5141\u8BB8 " + STATUSES4[from] + " \u2192 " + STATUSES4[to] + "\uFF08\u5141\u8BB8\uFF1A" + (TRANSITIONS2[from] || []).map((s) => STATUSES4[s]).join("\u3001") + "\uFF09"
      };
    }
    function applyTransition2(inv, to, opts) {
      const o = opts || {};
      const gate = canTransition(inv.status, to);
      if (!gate.ok) throw new Error(gate.message);
      const next = Object.assign({}, inv, { updatedAt: o.nowIso || "" });
      if (inv.status === to) return next;
      next.status = to;
      if (to === "submitted") {
        next.submittedAt = dateKeyOf(o.nowMs || Date.now()) || next.submittedAt;
        if (o.reimburseId !== void 0) next.reimburseId = clip(o.reimburseId, 40).trim();
      }
      if (to === "settled") {
        next.settledAt = dateKeyOf(o.nowMs || Date.now()) || next.settledAt;
        if (!next.submittedAt) next.submittedAt = next.settledAt;
      }
      if (to === "rejected") {
        if (o.rejectNote !== void 0) next.rejectNote = clip(o.rejectNote, 300);
      }
      if (to === "pending" || to === "excluded") {
        if (to === "excluded") {
          next.submittedAt = "";
          next.settledAt = "";
        }
      }
      return next;
    }
    function titleId(t) {
      return idFor("title|" + normName2(t.name) + "|" + normName2(t.taxId));
    }
    function normalizeTitle3(raw, prev) {
      const r = raw && typeof raw === "object" ? raw : {};
      const p = prev && typeof prev === "object" ? prev : {};
      const pick = (v, pv) => v === void 0 ? pv : v;
      const name = displayName(pick(r.name, p.name));
      if (!name) throw new Error("\u62AC\u5934\u540D\u79F0\u5FC5\u586B");
      const t = {
        id: "",
        name: clip(name, 120),
        taxId: clip(String(pick(r.taxId, p.taxId) || "")).replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 32),
        bank: clip(pick(r.bank, p.bank), 120),
        account: clip(pick(r.account, p.account), 40).replace(/\s+/g, ""),
        address: clip(pick(r.address, p.address), 200),
        phone: clip(pick(r.phone, p.phone), 30).replace(/\s+/g, ""),
        isDefault: !!pick(r.isDefault, p.isDefault),
        note: clip(pick(r.note, p.note), 200),
        createdAt: pick(r.createdAt, p.createdAt) || "",
        updatedAt: ""
      };
      t.id = titleId(t);
      return t;
    }
    function titleCopyText2(t) {
      if (!t) return "";
      const lines = ["\u540D\u79F0\uFF1A" + t.name];
      if (t.taxId) lines.push("\u7A0E\u53F7\uFF1A" + t.taxId);
      if (t.address) lines.push("\u5730\u5740\uFF1A" + t.address);
      if (t.phone) lines.push("\u7535\u8BDD\uFF1A" + t.phone);
      if (t.bank) lines.push("\u5F00\u6237\u884C\uFF1A" + t.bank);
      if (t.account) lines.push("\u8D26\u53F7\uFF1A" + t.account);
      return lines.join("\n");
    }
    var MIN_SAMPLE = 5;
    function buildView2(invoices, titles, nowMs) {
      const now = nowMs === void 0 ? Date.now() : nowMs;
      const today = todayKey4(now);
      const thisMonth = today.slice(0, 7);
      const thisYear = today.slice(0, 4);
      const byStatus = {};
      for (const s of Object.keys(STATUSES4)) byStatus[s] = { count: 0, total: 0 };
      const byCategory = {};
      const byMonth = {};
      const sellerMap = /* @__PURE__ */ new Map();
      const reimburseMap = /* @__PURE__ */ new Map();
      let pendingList = [];
      let warrantyRows = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(now);
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const p = (x) => String(x).padStart(2, "0");
        byMonth[d.getFullYear() + "-" + p(d.getMonth() + 1)] = { count: 0, total: 0 };
      }
      let openedThisMonth = { count: 0, total: 0 };
      let settledThisMonth = { count: 0, total: 0 };
      let submittedThisMonth = { count: 0, total: 0 };
      let yearTotal = 0;
      let yearCount = 0;
      let neverFiled = [];
      for (const inv of invoices) {
        const st = byStatus[inv.status];
        if (st) {
          st.count += 1;
          st.total += inv.total;
        }
        if (inv.status !== "excluded") {
          const cat = CATEGORIES3[inv.category] ? inv.category : "other";
          if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
          byCategory[cat].count += 1;
          byCategory[cat].total += inv.total;
          const mk = inv.date ? inv.date.slice(0, 7) : "";
          if (byMonth[mk]) {
            byMonth[mk].count += 1;
            byMonth[mk].total += inv.total;
          }
          if (inv.date && inv.date.slice(0, 4) === thisYear) {
            yearTotal += inv.total;
            yearCount += 1;
          }
          if (mk === thisMonth) {
            openedThisMonth.count += 1;
            openedThisMonth.total += inv.total;
          }
        }
        if (inv.status === "settled" && inv.settledAt && inv.settledAt.slice(0, 7) === thisMonth) {
          settledThisMonth.count += 1;
          settledThisMonth.total += inv.total;
        }
        if (inv.status === "submitted" && inv.submittedAt && inv.submittedAt.slice(0, 7) === thisMonth) {
          submittedThisMonth.count += 1;
          submittedThisMonth.total += inv.total;
        }
        if (inv.status === "pending") {
          pendingList.push(inv);
          if (inv.date && daysBetween(inv.date, today) >= 60) neverFiled.push(inv);
        }
        const sellerKey = normName2(inv.seller.name);
        if (sellerKey) {
          if (!sellerMap.has(sellerKey)) {
            sellerMap.set(sellerKey, { name: displayName(inv.seller.name), count: 0, total: 0 });
          }
          const s = sellerMap.get(sellerKey);
          s.count += 1;
          s.total += inv.total;
        }
        if (inv.reimburseId) {
          if (!reimburseMap.has(inv.reimburseId)) {
            reimburseMap.set(inv.reimburseId, { id: inv.reimburseId, count: 0, total: 0, statuses: {}, latest: "" });
          }
          const g = reimburseMap.get(inv.reimburseId);
          g.count += 1;
          g.total += inv.total;
          g.statuses[inv.status] = (g.statuses[inv.status] || 0) + 1;
          const activity = [inv.settledAt, inv.submittedAt, inv.date].filter(Boolean).sort().pop() || "";
          if (activity > g.latest) g.latest = activity;
        }
        if (inv.warrantyUntil) {
          warrantyRows.push(inv);
        }
      }
      pendingList.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
      warrantyRows.sort((a, b) => String(a.warrantyUntil).localeCompare(String(b.warrantyUntil)));
      const warrantyUpcoming = warrantyRows.map((inv) => {
        const d = daysBetween(today, inv.warrantyUntil);
        return { inv, daysLeft: d };
      }).filter((x) => x.daysLeft !== null && x.daysLeft <= 90).slice(0, 20);
      const sellers = Array.from(sellerMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
      const reimburseGroups = Array.from(reimburseMap.values()).sort((a, b) => String(b.latest).localeCompare(String(a.latest)));
      const catRows = Object.keys(CATEGORIES3).filter((k) => byCategory[k]).map((k) => ({ key: k, label: CATEGORIES3[k], count: byCategory[k].count, total: byCategory[k].total })).sort((a, b) => b.total - a.total);
      return {
        today,
        thisMonth,
        counts: {
          all: invoices.length,
          byStatus: mapTotal(byStatus)
        },
        pending: {
          count: byStatus.pending.count,
          total: byStatus.pending.total,
          list: pendingList.slice(0, 100),
          stale: neverFiled.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 10)
        },
        inFlight: { count: byStatus.submitted.count, total: byStatus.submitted.total },
        month: {
          opened: openedThisMonth,
          settled: settledThisMonth,
          submitted: submittedThisMonth
        },
        year: { key: thisYear, total: yearTotal, count: yearCount },
        byCategory: catRows,
        byMonth: Object.keys(byMonth).sort().map((k) => ({ key: k, count: byMonth[k].count, total: byMonth[k].total })),
        sellers,
        reimburseGroups,
        warrantyUpcoming,
        minSample: MIN_SAMPLE
      };
    }
    function mapTotal(m) {
      const out = {};
      for (const k of Object.keys(m)) out[k] = { count: m[k].count, total: Math.round(m[k].total * 100) / 100 };
      return out;
    }
    var CSV_COLUMNS = [
      "number",
      "code",
      "kind",
      "date",
      "seller",
      "sellerTaxId",
      "buyer",
      "total",
      "amount",
      "tax",
      "category",
      "purpose",
      "status",
      "reimburseId",
      "submittedAt",
      "settledAt",
      "warrantyMonths",
      "warrantyUntil",
      "fileName",
      "note"
    ];
    function csvEscape(v) {
      const s = v === null || v === void 0 ? "" : String(v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    function invoiceRow(inv) {
      return [
        inv.number,
        inv.code,
        KINDS2[inv.kind] || inv.kind,
        inv.date,
        inv.seller.name,
        inv.seller.taxId,
        inv.buyer.name,
        num2(inv.total),
        inv.amount === null ? "" : num2(inv.amount),
        inv.tax === null ? "" : num2(inv.tax),
        CATEGORIES3[inv.category] || inv.category,
        PURPOSES2[inv.purpose] || inv.purpose,
        STATUSES4[inv.status] || inv.status,
        inv.reimburseId,
        inv.submittedAt,
        inv.settledAt,
        inv.warrantyMonths === null ? "" : String(inv.warrantyMonths),
        inv.warrantyUntil,
        inv.fileName,
        inv.note
      ].map(csvEscape).join(",");
    }
    function exportCSV2(invoices) {
      return "\uFEFF" + CSV_COLUMNS.join(",") + "\n" + invoices.map(invoiceRow).join("\n") + "\n";
    }
    function parseCSV(text) {
      const s = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const rows = [];
      let row = [];
      let cell = "";
      let inQ = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQ) {
          if (c === '"') {
            if (s[i + 1] === '"') {
              cell += '"';
              i++;
            } else {
              inQ = false;
            }
          } else {
            cell += c;
          }
        } else if (c === '"') {
          inQ = true;
        } else if (c === ",") {
          row.push(cell);
          cell = "";
        } else if (c === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else {
          cell += c;
        }
      }
      if (cell !== "" || row.length) {
        row.push(cell);
        rows.push(row);
      }
      return rows;
    }
    function importCSV2(text) {
      const rows = parseCSV(text);
      if (rows.length < 2) return { drafts: [], warns: ["CSV \u4E3A\u7A7A\u6216\u53EA\u6709\u8868\u5934"] };
      const header = rows[0].map((h) => h.trim());
      const idx = {};
      CSV_COLUMNS.forEach((c) => {
        idx[c] = header.indexOf(c);
      });
      const drafts = [];
      const warns = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.length === 1 && !r[0].trim()) continue;
        const get = (c) => idx[c] >= 0 ? r[idx[c]] : "";
        const rowWarns = [];
        const kindKey = labelToKey(KINDS2, get("kind"));
        if (get("kind") && !kindKey) rowWarns.push("\u7B2C" + (i + 1) + "\u884C\u672A\u77E5\u79CD\u7C7B\u300C" + get("kind") + "\u300D\u6309\u5176\u4ED6\u5904\u7406");
        const statusKey = labelToKey(STATUSES4, get("status")) || "pending";
        if (get("status") && !labelToKey(STATUSES4, get("status"))) rowWarns.push("\u7B2C" + (i + 1) + "\u884C\u672A\u77E5\u72B6\u6001\u300C" + get("status") + "\u300D\u6309\u5F85\u62A5\u9500\u5904\u7406");
        const catKey = labelToKey(CATEGORIES3, get("category"));
        if (get("category") && !catKey) rowWarns.push("\u7B2C" + (i + 1) + "\u884C\u672A\u77E5\u5206\u7C7B\u300C" + get("category") + "\u300D\u6309\u5176\u4ED6\u5904\u7406");
        const purposeKey = labelToKey(PURPOSES2, get("purpose")) || "expense";
        if (get("purpose") && !labelToKey(PURPOSES2, get("purpose"))) rowWarns.push("\u7B2C" + (i + 1) + "\u884C\u672A\u77E5\u7528\u9014\u300C" + get("purpose") + "\u300D\u6309\u62A5\u9500\u5904\u7406");
        try {
          const draft = normalizeInvoice2({
            number: get("number"),
            code: get("code"),
            kind: kindKey || "other",
            date: get("date"),
            seller: { name: get("seller"), taxId: get("sellerTaxId") },
            buyer: { name: get("buyer") },
            total: Number(String(get("total")).replace(/[,¥￥\s]/g, "")) || 0,
            amount: Number(String(get("amount")).replace(/[,¥￥\s]/g, "")) || null,
            tax: Number(String(get("tax")).replace(/[,¥￥\s]/g, "")) || null,
            category: catKey || void 0,
            purpose: purposeKey,
            status: statusKey,
            reimburseId: get("reimburseId"),
            submittedAt: get("submittedAt"),
            settledAt: get("settledAt"),
            warrantyMonths: get("warrantyMonths") === "" ? null : Number(get("warrantyMonths")),
            fileName: get("fileName"),
            note: get("note"),
            source: "manual"
          }, null);
          drafts.push(draft);
        } catch (e) {
          warns.push("\u7B2C" + (i + 1) + "\u884C\u8DF3\u8FC7\uFF1A" + e.message);
        }
        warns.push(...rowWarns);
      }
      return { drafts, warns };
    }
    function labelToKey(dict, label) {
      const l = clip(label, 40).trim();
      if (!l) return null;
      if (dict[l]) return l;
      for (const k of Object.keys(dict)) {
        if (dict[k] === l) return k;
      }
      return null;
    }
    module.exports = {
      K,
      KINDS: KINDS2,
      KIND_KEYWORDS,
      STATUSES: STATUSES4,
      TRANSITIONS: TRANSITIONS2,
      PURPOSES: PURPOSES2,
      CATEGORIES: CATEGORIES3,
      CATEGORY_KEYWORDS,
      clip,
      normName: normName2,
      displayName,
      idFor,
      invoiceId,
      digitsOnly,
      num2,
      firstItemName,
      parseTs,
      dateKeyOf,
      monthKeyOf,
      todayKey: todayKey4,
      addMonths,
      daysBetween,
      classifyCategory,
      normalizeInvoice: normalizeInvoice2,
      normalizeItems,
      canTransition,
      applyTransition: applyTransition2,
      normalizeTitle: normalizeTitle3,
      titleId,
      titleCopyText: titleCopyText2,
      buildView: buildView2,
      MIN_SAMPLE,
      CSV_COLUMNS,
      csvEscape,
      invoiceRow,
      exportCSV: exportCSV2,
      parseCSV,
      importCSV: importCSV2,
      labelToKey
    };
  }
});

// src/Panel.tsx
var core6 = __toESM(require_core());
import { useCallback as useCallback2, useEffect, useMemo as useMemo2, useState as useState5 } from "react";

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

// src/model.ts
async function kvReq(payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target: "cap.kv", payload } });
  if (!res || res.ok === false) throw new Error(String(res && res.error || "cap.kv \u8C03\u7528\u5931\u8D25"));
  return res;
}
async function kvGet(key) {
  const res = await kvReq({ action: "get", key });
  return res.result && res.result.value !== void 0 ? res.result.value : null;
}
async function kvSet(key, value) {
  await kvReq({ action: "set", key, value });
}
async function kvDelete(key) {
  await kvReq({ action: "delete", key });
}
async function kvKeys() {
  const res = await kvReq({ action: "list" });
  return res.result && Array.isArray(res.result.keys) ? res.result.keys : [];
}
var KEY_META = "piaoxia.meta";
var KEY_INVOICE = "piaoxia.invoice.";
var KEY_TITLE = "piaoxia.title.";
var FULL_REFRESH_MS = 90 * 1e3;
var lastFull = 0;
var invoiceCache = /* @__PURE__ */ new Map();
var titleCache = /* @__PURE__ */ new Map();
var knownKeys = /* @__PURE__ */ new Set();
function asInvoice(v) {
  if (v && typeof v === "object" && typeof v.id === "string") return v;
  return null;
}
async function loadPiaoxia(cache = true) {
  const now = Date.now();
  const full = !cache || now - lastFull > FULL_REFRESH_MS;
  const keys = (await kvKeys()).filter((k) => k.startsWith(KEY_INVOICE) || k.startsWith(KEY_TITLE));
  const nextKeys = new Set(keys);
  const gone = Array.from(knownKeys).filter((k) => !nextKeys.has(k));
  for (const k of gone) {
    invoiceCache.delete(k.slice(KEY_INVOICE.length));
    titleCache.delete(k.slice(KEY_TITLE.length));
  }
  const fresh = keys.filter((k) => !knownKeys.has(k));
  const all = full || fresh.length ? keys : fresh;
  await Promise.all(all.map(async (k) => {
    try {
      const v = await kvGet(k);
      if (k.startsWith(KEY_INVOICE)) {
        const inv = asInvoice(v);
        if (inv) invoiceCache.set(inv.id, inv);
        else invoiceCache.delete(k.slice(KEY_INVOICE.length));
      } else {
        const t = v && typeof v === "object" && typeof v.id === "string" ? v : null;
        if (t) titleCache.set(t.id, t);
        else titleCache.delete(k.slice(KEY_TITLE.length));
      }
    } catch (_) {
    }
  }));
  knownKeys = nextKeys;
  if (full) lastFull = now;
  let meta = null;
  try {
    const raw = await kvGet(KEY_META);
    if (raw && typeof raw === "object") {
      const m = raw;
      if (typeof m.port === "number" && m.port > 0 && typeof m.token === "string" && m.token) meta = m;
    }
  } catch (_) {
  }
  return { invoices: new Map(invoiceCache), titles: new Map(titleCache), meta };
}
function touchLocalInvoice(inv) {
  invoiceCache.set(inv.id, inv);
  lastFull = 0;
}
async function saveInvoiceRaw(inv) {
  await kvSet(KEY_INVOICE + inv.id, inv);
  touchLocalInvoice(inv);
}
async function deleteInvoice(id) {
  await kvDelete(KEY_INVOICE + id);
  invoiceCache.delete(id);
  lastFull = 0;
}
async function saveTitle(t) {
  await kvSet(KEY_TITLE + t.id, t);
  titleCache.set(t.id, t);
  lastFull = 0;
}
async function deleteTitle(id) {
  await kvDelete(KEY_TITLE + id);
  titleCache.delete(id);
  lastFull = 0;
}
async function addManualInvoice(raw) {
  const inv = core.normalizeInvoice({ ...raw, source: "manual" }, null);
  await saveInvoiceRaw(inv);
  return inv;
}
async function patchInvoice(prev, patch) {
  const next = core.normalizeInvoice(patch, prev);
  if (next.id !== prev.id) {
    await kvDelete(KEY_INVOICE + prev.id);
    invoiceCache.delete(prev.id);
  }
  await saveInvoiceRaw(next);
  return next;
}
async function transitionInvoice(prev, to, opts) {
  const next = core.applyTransition(prev, to, { nowMs: Date.now(), nowIso: (/* @__PURE__ */ new Date()).toISOString(), reimburseId: opts?.reimburseId, rejectNote: opts?.rejectNote });
  await saveInvoiceRaw(next);
  return next;
}
async function servicePost(meta, path, body) {
  const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${meta.token}` },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error("\u670D\u52A1\u8FD4\u56DE\u975E JSON\uFF08HTTP " + res.status + "\uFF09");
  return json;
}
async function probeService(meta) {
  const res = await fetch(`http://127.0.0.1:${meta.port}/api/probe`, {
    headers: { Authorization: `Bearer ${meta.token}` }
  });
  if (!res.ok) throw new Error("\u670D\u52A1\u63A2\u6D4B\u5931\u8D25\uFF08HTTP " + res.status + "\uFF09");
  return await res.json();
}
function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      const bytes = new Uint8Array(buf);
      let bin = "";
      const CHUNK = 32768;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      resolve(btoa(bin));
    };
    reader.onerror = () => reject(new Error("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25\uFF1A" + file.name));
    reader.readAsArrayBuffer(file);
  });
}
async function collectFiles(meta, files, dir, existing, onProgress) {
  const outcomes = [];
  if (files.length) {
    const payload = [];
    for (const f of files) {
      payload.push({ name: f.name, b64: await fileToB64(f) });
      onProgress?.(payload.length, files.length);
    }
    const r = await servicePost(meta, "/api/collect", { files: payload });
    if (!r.ok) throw new Error(r.error || "\u670D\u52A1\u6536\u7968\u5931\u8D25");
    outcomes.push(...judge(r.results || [], existing));
  }
  if (dir.trim()) {
    const r = await servicePost(meta, "/api/collect", { dir: dir.trim(), recursive: true });
    if (!r.ok) throw new Error(r.error || "\u76EE\u5F55\u626B\u63CF\u5931\u8D25");
    outcomes.push(...judge(r.results || [], existing));
  }
  return outcomes;
}
function judge(results, existing) {
  return results.map((r) => {
    if (!r.ok || !r.invoice) return { kind: "fail", result: r };
    const hit = existing.get(r.invoice.id);
    if (hit) return { kind: "dup", result: r, existing: hit };
    return { kind: "added", result: r };
  });
}
async function commitCollect(outcomes) {
  let saved = 0;
  for (const o of outcomes) {
    if (o.kind === "added" && o.result.invoice) {
      const inv = core.normalizeInvoice({ ...o.result.invoice, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: "" }, null);
      await saveInvoiceRaw(inv);
      saved++;
    } else if (o.kind === "dup" && o.existing && o.result.invoice) {
      const patch = {};
      if (!o.existing.archivedPath && o.result.archivedPath) patch.archivedPath = o.result.archivedPath;
      if (!o.existing.fileSha256 && o.result.sha256) patch.fileSha256 = o.result.sha256;
      if (Object.keys(patch).length) await patchInvoice(o.existing, patch);
    }
  }
  return saved;
}
function downloadText(name, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
async function exportAllJSON(data) {
  const payload = {
    kind: "piaoxia-export",
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    invoices: Array.from(data.invoices.values()),
    titles: Array.from(data.titles.values())
  };
  downloadText("piaoxia-backup-" + core.todayKey() + ".json", JSON.stringify(payload, null, 2), "application/json");
}
async function importAllJSON(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    throw new Error("\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (!payload || payload.kind !== "piaoxia-export") throw new Error("\u4E0D\u662F\u53D1\u7968\u4FDD\u9669\u5E93\u5BFC\u51FA\u7684\u5907\u4EFD\u6587\u4EF6\uFF08\u7F3A kind \u6807\u8BC6\uFF09");
  let nInv = 0;
  let nTitle = 0;
  const warns = [];
  for (const raw of payload.invoices || []) {
    try {
      const inv = core.normalizeInvoice(raw, null);
      await saveInvoiceRaw(inv);
      nInv++;
    } catch (e) {
      warns.push("\u7968\u8DF3\u8FC7\uFF1A" + String(e.message));
    }
  }
  for (const raw of payload.titles || []) {
    try {
      const t = core.normalizeTitle(raw, null);
      await saveTitle(t);
      nTitle++;
    } catch (e) {
      warns.push("\u62AC\u5934\u8DF3\u8FC7\uFF1A" + String(e.message));
    }
  }
  return { invoices: nInv, titles: nTitle, warns };
}
async function importInvoicesCSV(text, existing) {
  const { drafts, warns } = core.importCSV(text);
  let added = 0;
  let skipped = 0;
  for (const d of drafts) {
    if (existing.has(d.id)) {
      skipped++;
      continue;
    }
    await saveInvoiceRaw({ ...d, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: "" });
    added++;
  }
  return { added, skipped, warns };
}

// src/InboxTab.tsx
var core2 = __toESM(require_core());
import { useCallback, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function InboxTab({ ctx }) {
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dir, setDir] = useState("");
  const [outcomes, setOutcomes] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);
  const run = useCallback(async (files, dirPath) => {
    if (!ctx.data.meta) {
      ctx.toast("\u89E3\u6790\u670D\u52A1\u672A\u5C31\u7EEA\uFF08\u7B49\u5F85\u5BBF\u4E3B\u62C9\u8D77 piaoxia \u670D\u52A1\uFF09\uFF0C\u7A0D\u5019\u518D\u8BD5\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5BF9 AI \u8BF4\u300C\u628A XX \u76EE\u5F55\u7684\u53D1\u7968\u6536\u8FDB\u6765\u300D", true);
      return;
    }
    const bad = files.filter((f) => /\.(ofd|zip|rar|7z|jpg|jpeg|png)$/i.test(f.name));
    if (bad.length) {
      ctx.toast("\u4E0D\u652F\u6301 " + bad.map((f) => f.name).join("\u3001") + "\uFF1AOFD/\u56FE\u7247/\u538B\u7F29\u5305\u6682\u4E0D\u89E3\u6790\uFF08\u53D1\u7968\u4FDD\u9669\u5E93\u4E0D\u505A OCR\uFF09\uFF0C\u8BF7\u4ECE\u7A0E\u52A1\u5C40\u4E0B\u8F7D PDF \u6216 XML \u7248\u5F0F", true);
    }
    const good = files.filter((f) => /\.(pdf|xml)$/i.test(f.name));
    if (!good.length && !dirPath.trim()) return;
    setPhase(good.length && !dirPath.trim() ? "reading" : "parsing");
    setErrorMsg("");
    setOutcomes(null);
    try {
      let serviceHint = "";
      try {
        serviceHint = (await probeService(ctx.data.meta)).archiveDir || "";
      } catch (_) {
      }
      const outs = await collectFiles(ctx.data.meta, good, dirPath, ctx.data.invoices, (done, total) => {
        setProgress({ done, total });
        setPhase(total > 1 ? "reading" : "parsing");
      });
      setPhase("parsing");
      const saved = await commitCollect(outs);
      setOutcomes(outs);
      setPhase("done");
      await ctx.reload();
      const fails2 = outs.filter((o) => o.kind === "fail").length;
      ctx.toast(`\u6536\u7968\u5B8C\u6210\uFF1A\u5165\u8D26 ${saved} \u5F20\uFF0C\u91CD\u590D ${outs.filter((o) => o.kind === "dup").length} \u4E2A\uFF0C\u5931\u8D25 ${fails2} \u4E2A`);
    } catch (e) {
      setPhase("error");
      setErrorMsg(String(e.message));
    }
  }, [ctx]);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void run(files, "");
  }, [run]);
  const busy = phase === "reading" || phase === "parsing";
  const added = (outcomes || []).filter((o) => o.kind === "added");
  const dups = (outcomes || []).filter((o) => o.kind === "dup");
  const fails = (outcomes || []).filter((o) => o.kind === "fail");
  return /* @__PURE__ */ jsxs("div", { children: [
    !ctx.data.meta && /* @__PURE__ */ jsx("div", { className: "px-infobox", children: "\u89E3\u6790\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA\uFF08\u542F\u7528\u63D2\u4EF6\u540E\u5BBF\u4E3B\u4F1A\u81EA\u52A8\u62C9\u8D77\uFF0C\u4E00\u822C\u51E0\u79D2\u5185\u5B8C\u6210\uFF09\u3002\u7B49\u5F85\u671F\u95F4\u4F60\u53EF\u4EE5\u76F4\u63A5\u5728 AI \u5BF9\u8BDD\u91CC\u8BF4 \u300C\u628A C:\\Users\\\u6211\\Downloads \u91CC\u7684\u53D1\u7968\u6536\u8FDB\u6765\u300D\u2014\u2014AI \u8D70 MCP \u901A\u9053\uFF0C\u4E0D\u4F9D\u8D56\u672C\u9762\u677F\u3002" }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "px-drop" + (over ? " over" : ""),
        onDragOver: (e) => {
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop,
        onClick: () => fileRef.current?.click(),
        children: [
          /* @__PURE__ */ jsx("div", { className: "big", children: busy ? "\u89E3\u6790\u4E2D\u2026" : "\u628A\u7535\u5B50\u53D1\u7968\u62D6\u5230\u8FD9\u91CC" }),
          /* @__PURE__ */ jsx("div", { children: "\u652F\u6301 \u6570\u7535\u7968 PDF / \u6570\u7535\u7968 XML\uFF08\u81EA\u52A8\u89E3\u6790 20 \u4F4D\u53D1\u7968\u53F7\u7801\u5E76\u5224\u91CD\uFF09\xB7 \u70B9\u51FB\u9009\u62E9\u6587\u4EF6" }),
          /* @__PURE__ */ jsx("div", { className: "px-dim", style: { marginTop: 4 }, children: "\u626B\u63CF\u4EF6/\u7EB8\u8D28\u7968\u4E0D\u505A OCR \u2192 \u8BF7\u5230\u300C\u7968\u518C\u300D\u624B\u52A8\u5F55\u5165\uFF1BOFD \u6682\u4E0D\u652F\u6301" })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref: fileRef,
        type: "file",
        multiple: true,
        accept: ".pdf,.xml",
        style: { display: "none" },
        onChange: (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) void run(files, "");
        }
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "px-card", style: { marginTop: 12 }, children: [
      /* @__PURE__ */ jsxs("h3", { children: [
        "\u76EE\u5F55\u626B\u63CF ",
        /* @__PURE__ */ jsx("span", { className: "px-hint", children: "\u6574\u4E2A\u6587\u4EF6\u5939\u4E00\u952E\u6536\u7968\uFF08\u9012\u5F52\u5B50\u76EE\u5F55\uFF0C\u8DF3\u8FC7\u9690\u85CF\u76EE\u5F55\uFF09" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "px-row", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "px-input",
            style: { flex: 1, minWidth: 240 },
            placeholder: "\u4F8B\u5982 C:\\Users\\\u4F60\\Downloads",
            value: dir,
            onChange: (e) => setDir(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && dir.trim()) void run([], dir);
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "px-btn primary", disabled: busy || !dir.trim(), onClick: () => void run([], dir), children: "\u626B\u63CF\u5E76\u6536\u7968" })
      ] }),
      busy && progress.total > 0 && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx("div", { className: "px-bar", children: /* @__PURE__ */ jsx("i", { style: { width: Math.round(progress.done / Math.max(1, progress.total) * 100) + "%" } }) }),
        /* @__PURE__ */ jsxs("div", { className: "px-dim", style: { marginTop: 4, fontSize: 11 }, children: [
          progress.done,
          "/",
          progress.total,
          " \u5DF2\u8BFB\u53D6"
        ] })
      ] }),
      phase === "error" && /* @__PURE__ */ jsx("div", { className: "px-warnbox", style: { marginTop: 10 }, children: errorMsg })
    ] }),
    outcomes && /* @__PURE__ */ jsxs("div", { className: "px-card", children: [
      /* @__PURE__ */ jsx("h3", { children: "\u672C\u6B21\u6536\u7968\u7ED3\u679C" }),
      added.length > 0 && /* @__PURE__ */ jsxs("table", { className: "px-table", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "\u65B0\u589E\u5165\u8D26" }),
          /* @__PURE__ */ jsx("th", { children: "\u53F7\u7801" }),
          /* @__PURE__ */ jsx("th", { children: "\u9500\u65B9" }),
          /* @__PURE__ */ jsx("th", { children: "\u91D1\u989D" }),
          /* @__PURE__ */ jsx("th", { children: "\u5206\u7C7B" }),
          /* @__PURE__ */ jsx("th", { children: "\u63D0\u793A" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: added.map((o, i) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { className: "px-ok", children: o.result.invoice?.number || "\uFF08\u65E0\u53F7\u7801\uFF09" }),
          /* @__PURE__ */ jsx("td", { children: o.result.invoice?.date }),
          /* @__PURE__ */ jsx("td", { children: o.result.invoice?.seller.name || /* @__PURE__ */ jsx("span", { className: "px-dim", children: "\u672A\u8BC6\u522B" }) }),
          /* @__PURE__ */ jsxs("td", { children: [
            "\xA5",
            o.result.invoice?.total.toFixed(2)
          ] }),
          /* @__PURE__ */ jsx("td", { children: o.result.invoice && core2.CATEGORIES[o.result.invoice.category] }),
          /* @__PURE__ */ jsx("td", { className: "px-warn", children: o.result.warnings.join("\uFF1B") })
        ] }, i)) })
      ] }),
      dups.length > 0 && /* @__PURE__ */ jsxs("table", { className: "px-table", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "\u91CD\u590D\u8DF3\u8FC7" }),
          /* @__PURE__ */ jsx("th", { children: "\u5DF2\u5728\u8D26\u72B6\u6001" }),
          /* @__PURE__ */ jsx("th", { children: "\u8BF4\u660E" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: dups.map((o, i) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { children: o.result.name }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: "px-tag " + (o.existing?.status || "pending"), children: o.existing && core2.STATUSES[o.existing.status] }) }),
          /* @__PURE__ */ jsxs("td", { className: "px-dim", children: [
            "\u53D1\u7968\u53F7\u7801 ",
            o.existing?.number || "\uFF1F",
            " \u5DF2\u5728\u8D26\uFF08\xA5",
            o.existing?.total.toFixed(2),
            "\uFF09\uFF0C\u8D26\u9762\u672A\u6539\u52A8",
            o.result.archivedPath ? "\uFF0C\u672C\u6B21\u539F\u4EF6\u5DF2\u8865\u6302\u5F52\u6863" : ""
          ] })
        ] }, i)) })
      ] }),
      fails.length > 0 && /* @__PURE__ */ jsxs("table", { className: "px-table", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "\u5931\u8D25" }),
          /* @__PURE__ */ jsx("th", { children: "\u539F\u56E0" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: fails.map((o, i) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { children: o.result.name }),
          /* @__PURE__ */ jsx("td", { className: "px-err", children: o.result.error })
        ] }, i)) })
      ] })
    ] })
  ] });
}

// src/LedgerTab.tsx
var core3 = __toESM(require_core());
import { useMemo, useState as useState2 } from "react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function LedgerTab({ ctx }) {
  const [statusF, setStatusF] = useState2("");
  const [catF, setCatF] = useState2("");
  const [monthF, setMonthF] = useState2("");
  const [kw, setKw] = useState2("");
  const [openId, setOpenId] = useState2("");
  const [manualOpen, setManualOpen] = useState2(false);
  const list = useMemo(() => {
    const kwN = core3.normName(kw);
    return Array.from(ctx.data.invoices.values()).filter((inv) => {
      if (statusF && inv.status !== statusF) return false;
      if (catF && inv.category !== catF) return false;
      if (monthF && (!inv.date || inv.date.slice(0, 7) !== monthF)) return false;
      if (kwN) {
        const hay = core3.normName([inv.number, inv.seller.name, inv.buyer.name, inv.note, inv.fileName, inv.reimburseId].concat(inv.items.map((x) => x.name)).join("|"));
        if (hay.indexOf(kwN) === -1) return false;
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [ctx.data.invoices, statusF, catF, monthF, kw]);
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { className: "px-card", children: /* @__PURE__ */ jsxs2("div", { className: "px-row", children: [
      /* @__PURE__ */ jsxs2("select", { className: "px-select", value: statusF, onChange: (e) => setStatusF(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u72B6\u6001" }),
        Object.keys(core3.STATUSES).map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: core3.STATUSES[k] }, k))
      ] }),
      /* @__PURE__ */ jsxs2("select", { className: "px-select", value: catF, onChange: (e) => setCatF(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u5206\u7C7B" }),
        Object.keys(core3.CATEGORIES).map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: core3.CATEGORIES[k] }, k))
      ] }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", type: "month", value: monthF, onChange: (e) => setMonthF(e.target.value) }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", style: { flex: 1, minWidth: 140 }, placeholder: "\u641C\u53F7\u7801/\u9500\u65B9/\u54C1\u540D/\u5907\u6CE8", value: kw, onChange: (e) => setKw(e.target.value) }),
      /* @__PURE__ */ jsx2("button", { className: "px-btn primary", onClick: () => setManualOpen(!manualOpen), children: "\uFF0B\u624B\u52A8\u5F55\u5165" })
    ] }) }),
    manualOpen && /* @__PURE__ */ jsx2(ManualForm, { ctx, onDone: () => {
      setManualOpen(false);
      void ctx.reload();
    } }),
    ctx.view.pending.stale.length > 0 && !statusF && !catF && !monthF && !kw && /* @__PURE__ */ jsxs2("div", { className: "px-warnbox", children: [
      "\u26A0 ",
      ctx.view.pending.stale.length,
      " \u5F20\u5F85\u62A5\u9500\u7968\u5F00\u7968\u5DF2\u8D85 60 \u5929\uFF08\u6700\u65E9 ",
      ctx.view.pending.stale[0].date,
      "\uFF09\uFF0C\u5C0F\u5FC3\u62A5\u9500\u8FC7\u671F\u3002"
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "px-card", children: list.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "px-dim", style: { textAlign: "center", padding: "26px 0" }, children: ctx.data.invoices.size === 0 ? "\u53D1\u7968\u4FDD\u9669\u5E93\u8FD8\u662F\u7A7A\u7684\uFF1A\u53BB\u300C\u6536\u7968\u53F0\u300D\u62D6\u5165\u53D1\u7968\uFF0C\u6216\u70B9\u53F3\u4E0A\u300C\uFF0B\u624B\u52A8\u5F55\u5165\u300D" : "\u6CA1\u6709\u5339\u914D\u8FC7\u6EE4\u6761\u4EF6\u7684\u7968" }) : /* @__PURE__ */ jsxs2("table", { className: "px-table", children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("th", { children: "\u53F7\u7801" }),
        /* @__PURE__ */ jsx2("th", { children: "\u65E5\u671F" }),
        /* @__PURE__ */ jsx2("th", { children: "\u9500\u65B9" }),
        /* @__PURE__ */ jsx2("th", { children: "\u91D1\u989D" }),
        /* @__PURE__ */ jsx2("th", { children: "\u5206\u7C7B" }),
        /* @__PURE__ */ jsx2("th", { children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsx2("th", {})
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: list.map((inv) => /* @__PURE__ */ jsx2(
        InvoiceRow,
        {
          ctx,
          inv,
          open: openId === inv.id,
          onToggle: () => setOpenId(openId === inv.id ? "" : inv.id)
        },
        inv.id
      )) })
    ] }) })
  ] });
}
function InvoiceRow({ ctx, inv, open, onToggle }) {
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsxs2("tr", { className: "click", onClick: onToggle, children: [
      /* @__PURE__ */ jsx2("td", { className: "px-mono", children: inv.number || /* @__PURE__ */ jsx2("span", { className: "px-dim", children: "\uFF08\u65E0\u53F7\u7801\uFF09" }) }),
      /* @__PURE__ */ jsx2("td", { children: inv.date || /* @__PURE__ */ jsx2("span", { className: "px-dim", children: "?" }) }),
      /* @__PURE__ */ jsx2("td", { children: inv.seller.name || /* @__PURE__ */ jsx2("span", { className: "px-dim", children: "\u672A\u8BC6\u522B" }) }),
      /* @__PURE__ */ jsxs2("td", { children: [
        "\xA5",
        inv.total.toFixed(2)
      ] }),
      /* @__PURE__ */ jsx2("td", { children: core3.CATEGORIES[inv.category] }),
      /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsx2("span", { className: "px-tag " + inv.status, children: core3.STATUSES[inv.status] }) }),
      /* @__PURE__ */ jsx2("td", { className: "px-dim", children: open ? "\u6536\u8D77 \u25B2" : "\u8BE6\u60C5 \u25BC" })
    ] }),
    open && /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsx2("td", { colSpan: 7, style: { padding: 0 }, children: /* @__PURE__ */ jsx2(InvoiceDetail, { ctx, inv }) }) })
  ] });
}
function InvoiceDetail({ ctx, inv }) {
  const [reimburseId, setReimburseId] = useState2(inv.reimburseId);
  const [rejectNote, setRejectNote] = useState2("");
  const [warranty, setWarranty] = useState2(inv.warrantyMonths === null ? "" : String(inv.warrantyMonths));
  const [note, setNote] = useState2(inv.note);
  const [confirmDel, setConfirmDel] = useState2(0);
  const [busy, setBusy] = useState2(false);
  const allowed = (to) => inv.status === to || (core3.TRANSITIONS[inv.status] || []).indexOf(to) !== -1;
  const doTransition = async (to) => {
    setBusy(true);
    try {
      await transitionInvoice(inv, to, { reimburseId: to === "submitted" ? reimburseId : void 0, rejectNote: to === "rejected" ? rejectNote : void 0 });
      ctx.toast(`\u5DF2\u6D41\u8F6C\u4E3A\u300C${core3.STATUSES[to]}\u300D`);
      await ctx.reload();
    } catch (e) {
      ctx.toast(String(e.message), true);
    } finally {
      setBusy(false);
    }
  };
  const doPatch = async (patch) => {
    setBusy(true);
    try {
      await patchInvoice(inv, patch);
      ctx.toast("\u5DF2\u66F4\u65B0");
      await ctx.reload();
    } catch (e) {
      ctx.toast(String(e.message), true);
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async () => {
    if (confirmDel !== 1) {
      setConfirmDel(1);
      setTimeout(() => setConfirmDel(0), 4e3);
      return;
    }
    setBusy(true);
    try {
      await deleteInvoice(inv.id);
      ctx.toast("\u5DF2\u5220\u9664" + (inv.archivedPath ? "\uFF08\u5F52\u6863\u539F\u4EF6\u4ECD\u5728 " + inv.archivedPath + "\uFF09" : ""));
      await ctx.reload();
    } catch (e) {
      ctx.toast(String(e.message), true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "px-detail", children: [
    /* @__PURE__ */ jsxs2("div", { className: "px-kv", children: [
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u79CD\u7C7B/\u6807\u9898" }),
      /* @__PURE__ */ jsxs2("span", { children: [
        core3.KINDS[inv.kind],
        inv.title ? " \xB7 " + inv.title : ""
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u53F7\u7801/\u4EE3\u7801" }),
      /* @__PURE__ */ jsxs2("span", { className: "px-mono", children: [
        inv.number || "\u2014",
        inv.code ? " / " + inv.code : ""
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u9500\u65B9" }),
      /* @__PURE__ */ jsxs2("span", { children: [
        inv.seller.name || "\u2014",
        inv.seller.taxId ? /* @__PURE__ */ jsxs2("span", { className: "px-dim px-mono", children: [
          "\uFF08",
          inv.seller.taxId,
          "\uFF09"
        ] }) : ""
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u8D2D\u65B9" }),
      /* @__PURE__ */ jsx2("span", { children: inv.buyer.name || "\u2014" }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u91D1\u989D\u6784\u6210" }),
      /* @__PURE__ */ jsxs2("span", { children: [
        "\xA5",
        inv.total.toFixed(2),
        inv.amount !== null ? /* @__PURE__ */ jsxs2("span", { className: "px-dim", children: [
          "\uFF08\u4E0D\u542B\u7A0E ",
          inv.amount.toFixed(2),
          " + \u7A0E ",
          inv.tax !== null ? inv.tax.toFixed(2) : "?",
          "\uFF09"
        ] }) : ""
      ] }),
      inv.items.length > 0 && /* @__PURE__ */ jsxs2(Fragment, { children: [
        /* @__PURE__ */ jsx2("span", { className: "k", children: "\u54C1\u540D" }),
        /* @__PURE__ */ jsx2("span", { children: inv.items.map((x) => x.name).join("\uFF1B") })
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u62A5\u9500\u5355" }),
      /* @__PURE__ */ jsxs2("span", { className: "px-mono", children: [
        inv.reimburseId || "\u2014",
        inv.submittedAt ? /* @__PURE__ */ jsxs2("span", { className: "px-dim", children: [
          "\uFF08\u63D0\u4EA4 ",
          inv.submittedAt,
          inv.settledAt ? "\uFF0C\u5230\u8D26 " + inv.settledAt : "",
          "\uFF09"
        ] }) : ""
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u4FDD\u4FEE" }),
      /* @__PURE__ */ jsx2("span", { children: inv.warrantyMonths !== null ? `\u5F00\u7968\u8D77 ${inv.warrantyMonths} \u4E2A\u6708 \u2192 ${inv.warrantyUntil || "\uFF08\u7F3A\u5F00\u7968\u65E5\u671F\u65E0\u6CD5\u63A8\u7B97\uFF09"}` : "\u672A\u767B\u8BB0" }),
      /* @__PURE__ */ jsx2("span", { className: "k", children: "\u6765\u6E90" }),
      /* @__PURE__ */ jsxs2("span", { className: "px-dim px-mono", style: { wordBreak: "break-all" }, children: [
        inv.source === "manual" ? "\u624B\u52A8\u5F55\u5165" : inv.srcPath || inv.fileName || "\u6536\u7968",
        inv.archivedPath ? /* @__PURE__ */ jsxs2("span", { children: [
          " \xB7 \u5F52\u6863 ",
          inv.archivedPath
        ] }) : ""
      ] }),
      inv.note && /* @__PURE__ */ jsxs2(Fragment, { children: [
        /* @__PURE__ */ jsx2("span", { className: "k", children: "\u5907\u6CE8" }),
        /* @__PURE__ */ jsx2("span", { children: inv.note })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "px-row", style: { marginTop: 10 }, children: ["submitted", "settled", "rejected", "pending", "excluded"].map((to) => allowed(to) && to !== inv.status ? /* @__PURE__ */ jsx2("button", { className: "px-btn sm", disabled: busy, onClick: () => void doTransition(to), children: to === "submitted" ? "\u5DF2\u63D0\u4EA4" : to === "settled" ? "\u5DF2\u5230\u8D26" : to === "rejected" ? "\u5DF2\u9000\u56DE" : to === "pending" ? "\u653E\u56DE\u5F85\u62A5\u9500" : "\u4E0D\u62A5\u9500" }, to) : null) }),
    (allowed("submitted") || allowed("rejected")) && /* @__PURE__ */ jsxs2("div", { className: "px-row", style: { marginTop: 6 }, children: [
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u62A5\u9500\u5355\u53F7\uFF08\u63D0\u4EA4\u65F6\u53EF\u767B\u8BB0\uFF09", value: reimburseId, onChange: (e) => setReimburseId(e.target.value), style: { width: 180 } }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u9000\u56DE\u539F\u56E0\uFF08\u9000\u56DE\u65F6\u53EF\u767B\u8BB0\uFF09", value: rejectNote, onChange: (e) => setRejectNote(e.target.value), style: { width: 220 } })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "px-row", style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #242c3a" }, children: [
      /* @__PURE__ */ jsx2(
        "select",
        {
          className: "px-select",
          value: inv.category,
          disabled: busy,
          onChange: (e) => void doPatch({ category: e.target.value }),
          children: Object.keys(core3.CATEGORIES).map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: core3.CATEGORIES[k] }, k))
        }
      ),
      /* @__PURE__ */ jsx2(
        "select",
        {
          className: "px-select",
          value: inv.purpose,
          disabled: busy,
          onChange: (e) => void doPatch({ purpose: e.target.value }),
          children: Object.keys(core3.PURPOSES).map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: core3.PURPOSES[k] }, k))
        }
      ),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "px-input",
          type: "number",
          min: 0,
          max: 120,
          placeholder: "\u4FDD\u4FEE\u6708\u6570",
          style: { width: 96 },
          value: warranty,
          onChange: (e) => setWarranty(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx2("button", { className: "px-btn sm", disabled: busy, onClick: () => void doPatch({ warrantyMonths: warranty === "" ? null : Number(warranty) }), children: "\u5B58\u4FDD\u4FEE" }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u5907\u6CE8", style: { flex: 1, minWidth: 120 }, value: note, onChange: (e) => setNote(e.target.value) }),
      /* @__PURE__ */ jsx2("button", { className: "px-btn sm", disabled: busy, onClick: () => void doPatch({ note }), children: "\u5B58\u5907\u6CE8" }),
      /* @__PURE__ */ jsx2("button", { className: "px-btn sm danger", disabled: busy, onClick: () => void doDelete(), children: confirmDel === 1 ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u5220\u9664" : "\u5220\u9664" })
    ] })
  ] });
}
function ManualForm({ ctx, onDone }) {
  const [f, setF] = useState2({ number: "", date: core3.todayKey(), sellerName: "", itemName: "", total: "", category: "", purpose: "expense", warrantyMonths: "", note: "" });
  const [busy, setBusy] = useState2(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!Number(f.total)) {
      ctx.toast("\u91D1\u989D\uFF08\u4EF7\u7A0E\u5408\u8BA1\uFF09\u5FC5\u586B", true);
      return;
    }
    setBusy(true);
    try {
      await addManualInvoice({
        total: Number(f.total),
        number: f.number || void 0,
        date: f.date || void 0,
        seller: { name: f.sellerName, taxId: "" },
        items: f.itemName ? [{ name: f.itemName }] : [],
        category: f.category || void 0,
        purpose: f.purpose,
        warrantyMonths: f.warrantyMonths === "" ? void 0 : Number(f.warrantyMonths),
        note: f.note
      });
      ctx.toast("\u5DF2\u5165\u8D26");
      onDone();
    } catch (e) {
      ctx.toast(String(e.message), true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "px-card", children: [
    /* @__PURE__ */ jsxs2("h3", { children: [
      "\u624B\u52A8\u5F55\u5165 ",
      /* @__PURE__ */ jsx2("span", { className: "px-hint", children: "\u7EB8\u8D28\u7968/\u626B\u63CF\u4EF6\u8D70\u8FD9\u91CC\uFF08\u53D1\u7968\u4FDD\u9669\u5E93\u4E0D\u505A OCR\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "px-row", children: [
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u53D1\u7968\u53F7\u7801\uFF08\u7EB8\u8D28\u7968\u53EF\u7A7A\uFF09", value: f.number, onChange: (e) => set("number", e.target.value), style: { width: 200 } }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", type: "date", value: f.date, onChange: (e) => set("date", e.target.value) }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u9500\u65B9\u540D\u79F0", value: f.sellerName, onChange: (e) => set("sellerName", e.target.value), style: { width: 180 } }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u54C1\u540D", value: f.itemName, onChange: (e) => set("itemName", e.target.value), style: { width: 150 } }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u4EF7\u7A0E\u5408\u8BA1*", value: f.total, onChange: (e) => set("total", e.target.value), style: { width: 100 } }),
      /* @__PURE__ */ jsxs2("select", { className: "px-select", value: f.category, onChange: (e) => set("category", e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u81EA\u52A8\u5206\u7C7B" }),
        Object.keys(core3.CATEGORIES).map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: core3.CATEGORIES[k] }, k))
      ] }),
      /* @__PURE__ */ jsx2("select", { className: "px-select", value: f.purpose, onChange: (e) => set("purpose", e.target.value), children: Object.keys(core3.PURPOSES).map((k) => /* @__PURE__ */ jsx2("option", { value: k, children: core3.PURPOSES[k] }, k)) }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", type: "number", min: 0, placeholder: "\u4FDD\u4FEE\u6708\u6570", value: f.warrantyMonths, onChange: (e) => set("warrantyMonths", e.target.value), style: { width: 96 } }),
      /* @__PURE__ */ jsx2("input", { className: "px-input", placeholder: "\u5907\u6CE8", value: f.note, onChange: (e) => set("note", e.target.value), style: { width: 120 } }),
      /* @__PURE__ */ jsx2("button", { className: "px-btn primary", disabled: busy, onClick: () => void submit(), children: "\u5165\u8D26" })
    ] })
  ] });
}

// src/InsightTab.tsx
var core4 = __toESM(require_core());
import { useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function InsightTab({ ctx }) {
  const view = ctx.view;
  const [confirmExport, setConfirmExport] = useState3(0);
  const maxMonth = Math.max(1, ...view.byMonth.map((m) => m.total));
  const maxCat = Math.max(1, ...view.byCategory.map((c) => c.total));
  const doExportCSV = () => {
    const list = Array.from(ctx.data.invoices.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    downloadText("piaoxia-" + core4.todayKey() + ".csv", core4.exportCSV(list));
    ctx.toast("\u5DF2\u5BFC\u51FA CSV\uFF08Excel \u53EF\u76F4\u63A5\u6253\u5F00\uFF09");
  };
  const doExportJSON = () => {
    if (confirmExport !== 1) {
      setConfirmExport(1);
      setTimeout(() => setConfirmExport(0), 4e3);
      return;
    }
    void exportAllJSON(ctx.data);
    setConfirmExport(0);
    ctx.toast("\u5DF2\u5BFC\u51FA JSON \u5907\u4EFD\uFF08\u542B\u5168\u90E8\u7968\u636E\u4E0E\u62AC\u5934\uFF09");
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    view.pending.stale.length > 0 && /* @__PURE__ */ jsxs3("div", { className: "px-warnbox", children: [
      "\u26A0 ",
      view.pending.stale.length,
      " \u5F20\u5F85\u62A5\u9500\u7968\u5F00\u7968\u5DF2\u8D85 60 \u5929\uFF0C\u5408\u8BA1 \xA5",
      view.pending.stale.reduce((s, x) => s + x.total, 0).toFixed(2),
      "\u3002\u9010\u5F20\u5904\u7406\u53BB\u300C\u7968\u518C\u300D\u7B5B\u9009\u300C\u5F85\u62A5\u9500\u300D\u3002"
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-grid", style: { marginBottom: 12 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "px-stat money", children: [
        /* @__PURE__ */ jsxs3("div", { className: "n", children: [
          "\xA5",
          view.pending.total.toFixed(2)
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "l", children: [
          "\u5F85\u62A5\u9500\uFF08",
          view.pending.count,
          " \u5F20\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "px-stat", children: [
        /* @__PURE__ */ jsxs3("div", { className: "n", children: [
          "\xA5",
          view.inFlight.total.toFixed(2)
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "l", children: [
          "\u5728\u9014\u5DF2\u63D0\u4EA4\uFF08",
          view.inFlight.count,
          " \u5F20\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "px-stat", children: [
        /* @__PURE__ */ jsxs3("div", { className: "n", children: [
          "\xA5",
          view.month.settled.total.toFixed(2)
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "l", children: [
          view.thisMonth,
          " \u5DF2\u5230\u8D26\uFF08",
          view.month.settled.count,
          " \u5F20\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "px-stat", children: [
        /* @__PURE__ */ jsxs3("div", { className: "n", children: [
          "\xA5",
          view.month.opened.total.toFixed(2)
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "l", children: [
          view.thisMonth,
          " \u5F00\u7968\uFF08",
          view.month.opened.count,
          " \u5F20\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "px-stat", children: [
        /* @__PURE__ */ jsxs3("div", { className: "n", children: [
          "\xA5",
          view.year.total.toFixed(2)
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "l", children: [
          view.year.key,
          " \u5E74\u7D2F\u8BA1\uFF08",
          view.year.count,
          " \u5F20\uFF09"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-card", children: [
      /* @__PURE__ */ jsxs3("h3", { children: [
        "\u8FD1 12 \u4E2A\u6708\u5F00\u7968\u8282\u594F ",
        /* @__PURE__ */ jsx3("span", { className: "px-hint", children: "\u6309\u5F00\u7968\u65E5\uFF0C\u4E0D\u542B\u300C\u4E0D\u62A5\u9500\u300D" })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { display: "flex", alignItems: "flex-end", gap: 4, height: 110 }, children: view.byMonth.map((m) => /* @__PURE__ */ jsxs3("div", { style: { flex: 1, textAlign: "center" }, title: m.key + "\uFF1A" + m.count + " \u5F20 / \xA5" + m.total.toFixed(2), children: [
        /* @__PURE__ */ jsx3("div", { style: { fontSize: 9, color: "#7d8590", marginBottom: 2 }, children: m.total ? Math.round(m.total) : "" }),
        /* @__PURE__ */ jsx3("div", { className: "px-bar", style: { height: Math.max(3, m.total / maxMonth * 76) }, children: /* @__PURE__ */ jsx3("i", {}) }),
        /* @__PURE__ */ jsx3("div", { style: { fontSize: 9, color: "#7d8590", marginTop: 3 }, children: m.key.slice(5) })
      ] }, m.key)) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-card", children: [
      /* @__PURE__ */ jsx3("h3", { children: "\u5206\u7C7B\u6784\u6210" }),
      /* @__PURE__ */ jsx3("table", { className: "px-table", children: /* @__PURE__ */ jsxs3("tbody", { children: [
        view.byCategory.map((c) => /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("td", { style: { width: 90 }, children: c.label }),
          /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("div", { className: "px-bar", children: /* @__PURE__ */ jsx3("i", { style: { width: Math.round(c.total / maxCat * 100) + "%" } }) }) }),
          /* @__PURE__ */ jsxs3("td", { style: { width: 110, textAlign: "right" }, children: [
            "\xA5",
            c.total.toFixed(2),
            /* @__PURE__ */ jsxs3("span", { className: "px-dim", children: [
              "\uFF08",
              c.count,
              "\u5F20\uFF09"
            ] })
          ] })
        ] }, c.key)),
        view.byCategory.length === 0 && /* @__PURE__ */ jsx3("tr", { children: /* @__PURE__ */ jsx3("td", { className: "px-dim", children: "\u8FD8\u6CA1\u6709\u7968" }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-card", children: [
      /* @__PURE__ */ jsxs3("h3", { children: [
        "\u62A5\u9500\u5355 ",
        /* @__PURE__ */ jsx3("span", { className: "px-hint", children: "\u63D0\u4EA4\u65F6\u767B\u8BB0\u7684 reimburseId \u5206\u7EC4" })
      ] }),
      view.reimburseGroups.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "px-dim", children: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u8FC7\u62A5\u9500\u5355\u53F7\u3002\u63D0\u4EA4\u62A5\u9500\u65F6\u5728\u7968\u518C\u8BE6\u60C5\u91CC\u586B\u5355\u53F7\uFF0C\u6216\u5BF9 AI \u8BF4\u300C\u8FD9\u6279\u53D1\u4E0A\u53BB\u4E86\uFF0C\u5355\u53F7 XX\u300D\u3002" }) : /* @__PURE__ */ jsxs3("table", { className: "px-table", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("th", { children: "\u62A5\u9500\u5355\u53F7" }),
          /* @__PURE__ */ jsx3("th", { children: "\u7968\u6570" }),
          /* @__PURE__ */ jsx3("th", { children: "\u91D1\u989D" }),
          /* @__PURE__ */ jsx3("th", { children: "\u6784\u6210" }),
          /* @__PURE__ */ jsx3("th", { children: "\u6700\u8FD1\u6D3B\u52A8" })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: view.reimburseGroups.map((g) => /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("td", { className: "px-mono", children: g.id }),
          /* @__PURE__ */ jsx3("td", { children: g.count }),
          /* @__PURE__ */ jsxs3("td", { children: [
            "\xA5",
            g.total.toFixed(2)
          ] }),
          /* @__PURE__ */ jsx3("td", { children: Object.keys(g.statuses).map((k) => /* @__PURE__ */ jsxs3("span", { className: "px-tag " + k, style: { marginRight: 4 }, children: [
            core4.STATUSES[k],
            "\xD7",
            g.statuses[k]
          ] }, k)) }),
          /* @__PURE__ */ jsx3("td", { className: "px-dim", children: g.latest })
        ] }, g.id)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-card", children: [
      /* @__PURE__ */ jsxs3("h3", { children: [
        "\u4FDD\u4FEE\u5230\u671F\u699C ",
        /* @__PURE__ */ jsx3("span", { className: "px-hint", children: "90 \u5929\u5185\u5230\u671F\u6216\u5DF2\u8FC7\u671F" })
      ] }),
      view.warrantyUpcoming.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "px-dim", children: "\u6CA1\u6709 90 \u5929\u5185\u5230\u671F\u7684\u4FDD\u4FEE\u3002\u7ED9\u7968\u8865\u4FDD\u4FEE\u671F\uFF1A\u7968\u518C\u8BE6\u60C5 \u2192 \u4FDD\u4FEE\u6708\u6570\u3002" }) : /* @__PURE__ */ jsxs3("table", { className: "px-table", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("th", { children: "\u7968" }),
          /* @__PURE__ */ jsx3("th", { children: "\u9500\u65B9" }),
          /* @__PURE__ */ jsx3("th", { children: "\u91D1\u989D" }),
          /* @__PURE__ */ jsx3("th", { children: "\u4FDD\u4FEE\u81F3" }),
          /* @__PURE__ */ jsx3("th", { children: "\u72B6\u6001" })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: view.warrantyUpcoming.map((x) => /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("td", { className: "px-mono", children: x.inv.number || "\uFF08\u65E0\u53F7\u7801\uFF09" }),
          /* @__PURE__ */ jsx3("td", { children: x.inv.seller.name || "\u2014" }),
          /* @__PURE__ */ jsxs3("td", { children: [
            "\xA5",
            x.inv.total.toFixed(2)
          ] }),
          /* @__PURE__ */ jsx3("td", { children: x.inv.warrantyUntil }),
          /* @__PURE__ */ jsx3("td", { children: x.daysLeft < 0 ? /* @__PURE__ */ jsxs3("span", { className: "px-err", children: [
            "\u5DF2\u8FC7\u671F ",
            -x.daysLeft,
            " \u5929"
          ] }) : x.daysLeft <= 30 ? /* @__PURE__ */ jsxs3("span", { className: "px-warn", children: [
            "\u8FD8\u5269 ",
            x.daysLeft,
            " \u5929"
          ] }) : /* @__PURE__ */ jsxs3("span", { className: "px-dim", children: [
            "\u8FD8\u5269 ",
            x.daysLeft,
            " \u5929"
          ] }) })
        ] }, x.inv.id)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-card", children: [
      /* @__PURE__ */ jsxs3("h3", { children: [
        "\u9500\u65B9 TOP10 ",
        /* @__PURE__ */ jsx3("span", { className: "px-hint", children: "\u5168\u5E74\u7D2F\u8BA1\uFF08\u542B\u4E0D\u62A5\u9500\u7968\uFF09" })
      ] }),
      view.sellers.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "px-dim", children: "\u8FD8\u6CA1\u6709\u6570\u636E" }) : /* @__PURE__ */ jsx3("table", { className: "px-table", children: /* @__PURE__ */ jsx3("tbody", { children: view.sellers.map((s, i) => /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("td", { style: { width: 24, color: "#7d8590" }, children: i + 1 }),
        /* @__PURE__ */ jsx3("td", { children: s.name }),
        /* @__PURE__ */ jsxs3("td", { style: { textAlign: "right" }, children: [
          "\xA5",
          s.total.toFixed(2),
          /* @__PURE__ */ jsxs3("span", { className: "px-dim", children: [
            "\uFF08",
            s.count,
            "\u5F20\uFF09"
          ] })
        ] })
      ] }, i)) }) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "px-card", children: [
      /* @__PURE__ */ jsx3("h3", { children: "\u5BFC\u51FA" }),
      /* @__PURE__ */ jsxs3("div", { className: "px-row", children: [
        /* @__PURE__ */ jsx3("button", { className: "px-btn", onClick: doExportCSV, children: "\u5BFC\u51FA CSV\uFF08Excel\uFF09" }),
        /* @__PURE__ */ jsx3("button", { className: "px-btn", onClick: doExportJSON, children: confirmExport === 1 ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u5BFC\u51FA\u5168\u90E8\u6570\u636E" : "\u5BFC\u51FA JSON \u5907\u4EFD" }),
        /* @__PURE__ */ jsx3("span", { className: "px-dim", children: "CSV \u7ED9\u8D22\u52A1/\u4E2A\u7A0E\u6C47\u7B97\uFF1BJSON \u5907\u4EFD\u53EF\u5728\u300C\u62AC\u5934\u4E0E\u8BBE\u7F6E\u300D\u5BFC\u5165\u6062\u590D\u3002" })
      ] })
    ] })
  ] });
}

// src/SettingsTab.tsx
var core5 = __toESM(require_core());
import { useRef as useRef2, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ ctx }) {
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4(TitlesCard, { ctx }),
    /* @__PURE__ */ jsx4(ImportCard, { ctx }),
    /* @__PURE__ */ jsx4(ServiceCard, { ctx }),
    /* @__PURE__ */ jsxs4("div", { className: "px-card", children: [
      /* @__PURE__ */ jsx4("h3", { children: "\u53E3\u5F84\u4E0E\u8FB9\u754C\uFF08\u52A1\u5FC5\u4E86\u89E3\uFF09" }),
      /* @__PURE__ */ jsxs4("ul", { style: { margin: 0, paddingLeft: 18, color: "#7d8590", fontSize: 12, lineHeight: 1.9 }, children: [
        /* @__PURE__ */ jsxs4("li", { children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#d7dde6" }, children: "\u7EAF\u672C\u5730" }),
          "\uFF1A\u7968\u636E\u6570\u636E\u5B58\u5BBF\u4E3B cap.kv\uFF0C\u539F\u4EF6\u5F52\u6863\u5230\u6570\u636E\u6839 piaoxia/ \u76EE\u5F55\uFF0C\u5168\u7A0B\u96F6\u5916\u7F51\u8BF7\u6C42\u3002"
        ] }),
        /* @__PURE__ */ jsxs4("li", { children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#d7dde6" }, children: "\u5224\u91CD\u53E3\u5F84" }),
          "\uFF1A\u53D1\u7968\u53F7\u7801\uFF08\u6570\u7535\u7968 20 \u4F4D / \u65E7\u7968 8 \u4F4D+12 \u4F4D\u4EE3\u7801\uFF09\u5168\u5C40\u552F\u4E00\uFF1B\u624B\u5F55\u65E0\u53F7\u7801\u7684\u7968\u6309\u300C\u65E5\u671F+\u9500\u65B9+\u91D1\u989D+\u54C1\u540D\u300D\u5185\u5BB9\u5BFB\u5740\u3002"
        ] }),
        /* @__PURE__ */ jsxs4("li", { children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#d7dde6" }, children: "\u4E0D\u505A OCR" }),
          "\uFF1A\u626B\u63CF\u4EF6/\u56FE\u7247\u578B PDF/\u7EB8\u8D28\u7968\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u624B\u52A8\u5F55\u5165\uFF1BOFD \u7248\u5F0F\u6682\u4E0D\u652F\u6301\uFF08\u8BF7\u4ECE\u7535\u5B50\u7A0E\u52A1\u5C40\u4E0B\u8F7D PDF \u6216 XML\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsxs4("li", { children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#d7dde6" }, children: "\u4E0D\u505A\u53D1\u7968\u67E5\u9A8C" }),
          "\uFF1A\u4E0D\u5BF9\u63A5\u7A0E\u52A1\u67E5\u9A8C\u63A5\u53E3\uFF1B\u771F\u4F2A\u8BF7\u8D70\u5B98\u65B9\u67E5\u9A8C\u5E73\u53F0\uFF0C\u53D1\u7968\u4FDD\u9669\u5E93\u53EA\u505A\u672C\u5730\u53F0\u8D26\u3002"
        ] }),
        /* @__PURE__ */ jsxs4("li", { children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#d7dde6" }, children: "\u89E3\u6790\u4E0D\u786E\u5B9A\u65F6\u4F1A\u660E\u8BF4" }),
          "\uFF1A\u5E26 \u26A0 \u63D0\u793A\u7684\u7968\u8BF7\u4EBA\u5DE5\u6838\u5BF9\u91D1\u989D\u4E0E\u53F7\u7801\uFF1B\u89E3\u6790\u5931\u8D25\u7684\u7968\u4E0D\u4F1A\u88AB\u9759\u9ED8\u4E22\u5F03\u3002"
        ] }),
        /* @__PURE__ */ jsxs4("li", { children: [
          /* @__PURE__ */ jsx4("b", { style: { color: "#d7dde6" }, children: "\u5220\u9664\u53CC\u4FDD\u9669" }),
          "\uFF1A\u9762\u677F\u4E24\u51FB\u786E\u8BA4\uFF1BAI \u5220\u9664\u5FC5\u987B\u5148\u5411\u4F60\u786E\u8BA4\u3002\u5F52\u6863\u539F\u4EF6\u4E0D\u968F\u53F0\u8D26\u5220\u9664\u3002"
        ] })
      ] })
    ] })
  ] });
}
function TitlesCard({ ctx }) {
  const [form, setForm] = useState4({ name: "", taxId: "", bank: "", account: "", address: "", phone: "", isDefault: false });
  const [busy, setBusy] = useState4(false);
  const titles = Array.from(ctx.data.titles.values()).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const add = async () => {
    setBusy(true);
    try {
      const t = core5.normalizeTitle(form, null);
      if (ctx.data.titles.has(t.id)) {
        ctx.toast("\u8FD9\u4E2A\u62AC\u5934\uFF08\u540D\u79F0+\u7A0E\u53F7\uFF09\u5DF2\u7ECF\u5B58\u5728", true);
        return;
      }
      if (t.isDefault) {
        for (const other of ctx.data.titles.values()) {
          if (other.isDefault) await saveTitle({ ...other, isDefault: false });
        }
      }
      await saveTitle({ ...t, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      ctx.toast("\u62AC\u5934\u5DF2\u4FDD\u5B58");
      setForm({ name: "", taxId: "", bank: "", account: "", address: "", phone: "", isDefault: false });
      await ctx.reload();
    } catch (e) {
      ctx.toast(String(e.message), true);
    } finally {
      setBusy(false);
    }
  };
  const del = async (t) => {
    if (!window.confirm?.("\u5220\u9664\u62AC\u5934\u300C" + t.name + "\u300D\uFF1F")) return;
    await deleteTitle(t.id);
    ctx.toast("\u5DF2\u5220\u9664\u62AC\u5934");
    await ctx.reload();
  };
  const copy = async (t) => {
    try {
      await navigator.clipboard.writeText(core5.titleCopyText(t));
      ctx.toast("\u5F00\u7968\u4FE1\u606F\u5DF2\u590D\u5236");
    } catch (_) {
      ctx.toast(core5.titleCopyText(t).split("\n")[0] + "\u2026\uFF08\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u5B8C\u6574\u6587\u672C\u89C1\u4E0B\u65B9\uFF09", true);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "px-card", children: [
    /* @__PURE__ */ jsxs4("h3", { children: [
      "\u5F00\u7968\u62AC\u5934 ",
      /* @__PURE__ */ jsx4("span", { className: "px-hint", children: "\u5F00\u53D1\u7968\u65F6\u4E00\u952E\u590D\u5236\u8D2D\u65B9\u4FE1\u606F" })
    ] }),
    titles.length > 0 && /* @__PURE__ */ jsxs4("table", { className: "px-table", style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("th", { children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx4("th", { children: "\u7A0E\u53F7" }),
        /* @__PURE__ */ jsx4("th", {})
      ] }) }),
      /* @__PURE__ */ jsx4("tbody", { children: titles.map((t) => /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsxs4("td", { children: [
          t.name,
          t.isDefault ? /* @__PURE__ */ jsx4("span", { className: "px-tag settled", style: { marginLeft: 6 }, children: "\u9ED8\u8BA4" }) : ""
        ] }),
        /* @__PURE__ */ jsx4("td", { className: "px-mono", children: t.taxId || "\u2014" }),
        /* @__PURE__ */ jsxs4("td", { style: { whiteSpace: "nowrap" }, children: [
          /* @__PURE__ */ jsx4("button", { className: "px-btn sm", onClick: () => void copy(t), children: "\u590D\u5236" }),
          " ",
          /* @__PURE__ */ jsx4("button", { className: "px-btn sm", onClick: () => {
            void saveTitle({ ...t, isDefault: !t.isDefault }).then(() => ctx.reload());
          }, children: t.isDefault ? "\u53D6\u6D88\u9ED8\u8BA4" : "\u8BBE\u9ED8\u8BA4" }),
          " ",
          /* @__PURE__ */ jsx4("button", { className: "px-btn sm danger", onClick: () => void del(t), children: "\u5220" })
        ] })
      ] }, t.id)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "px-row", children: [
      /* @__PURE__ */ jsx4("input", { className: "px-input", placeholder: "\u62AC\u5934\u540D\u79F0*", value: form.name, onChange: (e) => set("name", e.target.value), style: { width: 200 } }),
      /* @__PURE__ */ jsx4("input", { className: "px-input", placeholder: "\u7EDF\u4E00\u793E\u4F1A\u4FE1\u7528\u4EE3\u7801", value: form.taxId, onChange: (e) => set("taxId", e.target.value), style: { width: 190 } }),
      /* @__PURE__ */ jsx4("input", { className: "px-input", placeholder: "\u5F00\u6237\u884C", value: form.bank, onChange: (e) => set("bank", e.target.value), style: { width: 130 } }),
      /* @__PURE__ */ jsx4("input", { className: "px-input", placeholder: "\u8D26\u53F7", value: form.account, onChange: (e) => set("account", e.target.value), style: { width: 130 } }),
      /* @__PURE__ */ jsx4("input", { className: "px-input", placeholder: "\u5730\u5740", value: form.address, onChange: (e) => set("address", e.target.value), style: { width: 120 } }),
      /* @__PURE__ */ jsx4("input", { className: "px-input", placeholder: "\u7535\u8BDD", value: form.phone, onChange: (e) => set("phone", e.target.value), style: { width: 110 } }),
      /* @__PURE__ */ jsxs4("label", { className: "px-dim", style: { fontSize: 12 }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: form.isDefault, onChange: (e) => set("isDefault", e.target.checked) }),
        " \u8BBE\u4E3A\u9ED8\u8BA4"
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "px-btn primary", disabled: busy || !form.name.trim(), onClick: () => void add(), children: "\u6DFB\u52A0\u62AC\u5934" })
    ] })
  ] });
}
function ImportCard({ ctx }) {
  const fileRef = useRef2(null);
  const [busy, setBusy] = useState4(false);
  const onFile = async (file) => {
    setBusy(true);
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        const r = await importAllJSON(text);
        ctx.toast(`\u6062\u590D\u5B8C\u6210\uFF1A\u7968\u636E ${r.invoices} \u6761\u3001\u62AC\u5934 ${r.titles} \u6761${r.warns.length ? "\uFF0C\u8DF3\u8FC7 " + r.warns.length + " \u6761" : ""}${r.warns.length ? "\uFF08\u9996\u6761\uFF1A" + r.warns[0] + "\uFF09" : ""}`, r.warns.length > 0);
        await ctx.reload();
      } else {
        const r = await importInvoicesCSV(text, ctx.data.invoices);
        ctx.toast(`CSV \u5BFC\u5165\uFF1A\u65B0\u589E ${r.added}\uFF0C\u8DF3\u8FC7\u5DF2\u6709 ${r.skipped}${r.warns.length ? "\uFF0C\u63D0\u793A " + r.warns.length + " \u6761\uFF08\u9996\u6761\uFF1A" + r.warns[0] + "\uFF09" : ""}`, r.warns.length > 0);
        await ctx.reload();
      }
    } catch (e) {
      ctx.toast(String(e.message), true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "px-card", children: [
    /* @__PURE__ */ jsxs4("h3", { children: [
      "\u5BFC\u5165 ",
      /* @__PURE__ */ jsx4("span", { className: "px-hint", children: "JSON = \u53D1\u7968\u4FDD\u9669\u5E93\u5907\u4EFD\u6062\u590D\uFF1BCSV = \u4ECE\u5176\u4ED6\u53F0\u8D26\u8FC1\u79FB\uFF08\u8868\u5934\u987B\u5339\u914D\u53D1\u7968\u4FDD\u9669\u5E93\u5BFC\u51FA\u683C\u5F0F\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "px-row", children: [
      /* @__PURE__ */ jsx4("button", { className: "px-btn", disabled: busy, onClick: () => fileRef.current?.click(), children: "\u9009\u62E9 .json / .csv \u6587\u4EF6" }),
      /* @__PURE__ */ jsx4("span", { className: "px-dim", children: "\u5BFC\u5165\u6309\u53D1\u7968\u53F7\u7801\u81EA\u52A8\u5224\u91CD\uFF0C\u5DF2\u6709\u7968\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002" })
    ] }),
    /* @__PURE__ */ jsx4(
      "input",
      {
        ref: fileRef,
        type: "file",
        accept: ".json,.csv",
        style: { display: "none" },
        onChange: (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = "";
          if (f) void onFile(f);
        }
      }
    )
  ] });
}
function ServiceCard({ ctx }) {
  const [probe, setProbe] = useState4("");
  const meta = ctx.data.meta;
  const doProbe = async () => {
    if (!meta) {
      setProbe("\u670D\u52A1 meta \u4E0D\u5B58\u5728\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u6709\u62C9\u8D77 piaoxia \u670D\u52A1");
      return;
    }
    try {
      const r = await probeService(meta);
      setProbe(`\u5728\u7EBF \xB7 \u5F15\u64CE v${r.version || "?"} \xB7 \u5F52\u6863\u76EE\u5F55 ${r.archiveDir || "\u672A\u5B9A\u4F4D\uFF08\u539F\u4EF6\u4E0D\u5F52\u6863\uFF09"}`);
    } catch (e) {
      setProbe("\u63A2\u6D4B\u5931\u8D25\uFF1A" + String(e.message));
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "px-card", children: [
    /* @__PURE__ */ jsx4("h3", { children: "\u89E3\u6790\u670D\u52A1" }),
    /* @__PURE__ */ jsxs4("div", { className: "px-row", style: { fontSize: 12 }, children: [
      meta ? /* @__PURE__ */ jsxs4("span", { className: "px-ok", children: [
        /* @__PURE__ */ jsx4("span", { className: "px-dot ok" }),
        "meta \u5728\u6863 \xB7 \u7AEF\u53E3 ",
        meta.port,
        " \xB7 v",
        meta.version || "?"
      ] }) : /* @__PURE__ */ jsxs4("span", { className: "px-warn", children: [
        /* @__PURE__ */ jsx4("span", { className: "px-dot warn" }),
        "meta \u4E0D\u5728\u6863\uFF08\u670D\u52A1\u672A\u542F\u52A8\u6216\u5BBF\u4E3B\u6865\u672A\u5C31\u7EEA\uFF09"
      ] }),
      /* @__PURE__ */ jsx4("button", { className: "px-btn sm", onClick: () => void doProbe(), children: "\u63A2\u6D4B" }),
      probe && /* @__PURE__ */ jsx4("span", { className: "px-dim", children: probe })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "px-dim", style: { marginTop: 6, fontSize: 11 }, children: "\u670D\u52A1\u53EA\u7ED1 127.0.0.1 + token\uFF1B\u9762\u677F\u62D6\u62FD\u4E0E\u76EE\u5F55\u626B\u63CF\u7ECF\u5B83\u89E3\u6790\uFF08PDF \u6587\u672C\u5C42 + \u6570\u7535\u7968 XML\uFF09\uFF0CAI \u6536\u7968\u8D70 MCP \u901A\u9053\uFF08\u540C\u4E00\u5F15\u64CE\uFF09\u3002" })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var CSS = `
.px-root { font: 13px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: #d7dde6;
  background: #0d1117; min-height: 100%; box-sizing: border-box; padding: 14px 16px 40px; }
.px-root * { box-sizing: border-box; }
.px-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.px-logo { font-size: 17px; font-weight: 700; color: #e6edf3; letter-spacing: .5px; }
.px-logo .px-accent { color: #f2a33c; }
.px-sub { color: #7d8590; font-size: 12px; }
.px-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; vertical-align: 1px; }
.px-dot.ok { background: #3fb950; box-shadow: 0 0 6px #3fb95088; }
.px-dot.warn { background: #d29922; }
.px-dot.off { background: #6e7681; }
.px-tabs { display: flex; gap: 4px; margin: 10px 0 14px; border-bottom: 1px solid #21262d; flex-wrap: wrap; }
.px-tab { padding: 7px 14px; cursor: pointer; color: #7d8590; border-bottom: 2px solid transparent; user-select: none; font-size: 13px; }
.px-tab:hover { color: #d7dde6; }
.px-tab.on { color: #f2a33c; border-bottom-color: #f2a33c; font-weight: 600; }
.px-badge { background: #da3633; color: #fff; border-radius: 8px; font-size: 10px; padding: 1px 6px; margin-left: 5px; vertical-align: 2px; }
.px-card { background: #161b22; border: 1px solid #242c3a; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
.px-card h3 { margin: 0 0 10px; font-size: 13px; color: #e6edf3; }
.px-card h3 .px-hint { font-weight: 400; color: #7d8590; font-size: 11px; margin-left: 8px; }
.px-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.px-stat { background: #0d1117; border: 1px solid #242c3a; border-radius: 8px; padding: 10px 12px; }
.px-stat .n { font-size: 19px; font-weight: 700; color: #e6edf3; }
.px-stat .l { font-size: 11px; color: #7d8590; margin-top: 2px; }
.px-stat.money .n { color: #f2a33c; }
.px-btn { display: inline-block; padding: 6px 14px; border-radius: 6px; border: 1px solid #30363d; background: #21262d;
  color: #d7dde6; cursor: pointer; font-size: 12px; user-select: none; }
.px-btn:hover { border-color: #8b949e; }
.px-btn:disabled { opacity: .45; cursor: not-allowed; }
.px-btn.primary { background: #bb5c14; border-color: #bb5c14; color: #fff; }
.px-btn.primary:hover { background: #d46d1a; }
.px-btn.danger { background: transparent; border-color: #b62324; color: #f85149; }
.px-btn.danger:hover { background: #da36331f; }
.px-btn.sm { padding: 3px 9px; font-size: 11px; }
.px-input, .px-select, .px-textarea { background: #0d1117; border: 1px solid #30363d; color: #d7dde6;
  border-radius: 6px; padding: 6px 9px; font-size: 12px; font-family: inherit; }
.px-input:focus, .px-select:focus, .px-textarea:focus { outline: none; border-color: #f2a33c; }
.px-textarea { width: 100%; resize: vertical; }
.px-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.px-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.px-table th { text-align: left; color: #7d8590; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #242c3a; white-space: nowrap; }
.px-table td { padding: 7px 8px; border-bottom: 1px solid #1a212b; vertical-align: top; }
.px-table tr.click { cursor: pointer; }
.px-table tr.click:hover td { background: #161b2280; }
.px-tag { display: inline-block; padding: 1px 8px; border-radius: 9px; font-size: 11px; border: 1px solid; white-space: nowrap; }
.px-tag.pending { color: #f2a33c; border-color: #f2a33c55; }
.px-tag.submitted { color: #58a6ff; border-color: #58a6ff55; }
.px-tag.settled { color: #3fb950; border-color: #3fb95055; }
.px-tag.rejected { color: #f85149; border-color: #f8514955; }
.px-tag.excluded { color: #7d8590; border-color: #7d859055; }
.px-drop { border: 2px dashed #30363d; border-radius: 12px; padding: 30px 16px; text-align: center; color: #7d8590;
  transition: all .15s; cursor: pointer; }
.px-drop.over { border-color: #f2a33c; background: #f2a33c10; color: #f2a33c; }
.px-drop .big { font-size: 15px; color: #d7dde6; margin-bottom: 4px; }
.px-ok { color: #3fb950; } .px-warn { color: #d29922; } .px-err { color: #f85149; } .px-dim { color: #7d8590; }
.px-bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; }
.px-bar i { display: block; height: 100%; background: linear-gradient(90deg, #bb5c14, #f2a33c); }
.px-toast { position: fixed; right: 18px; bottom: 18px; background: #1f2630; border: 1px solid #30363d;
  color: #d7dde6; padding: 9px 14px; border-radius: 8px; font-size: 12px; max-width: 420px; z-index: 99;
  box-shadow: 0 6px 24px #00000066; }
.px-toast.err { border-color: #b62324; color: #ffb0ab; }
.px-mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.px-detail { background: #0d1117; border: 1px solid #242c3a; border-radius: 8px; padding: 12px; margin-top: 10px; }
.px-kv { display: grid; grid-template-columns: 92px 1fr; gap: 4px 10px; font-size: 12px; }
.px-kv .k { color: #7d8590; }
.px-chip { cursor: pointer; padding: 2px 9px; border-radius: 10px; border: 1px solid #30363d; font-size: 11px; color: #7d8590; user-select: none; }
.px-chip.on { border-color: #f2a33c; color: #f2a33c; }
.px-warnbox { background: #da363314; border: 1px solid #da363355; border-radius: 8px; padding: 9px 12px; font-size: 12px; color: #ffb0ab; margin-bottom: 10px; }
.px-infobox { background: #1f6feb14; border: 1px solid #1f6feb44; border-radius: 8px; padding: 9px 12px; font-size: 12px; color: #a5c8ff; margin-bottom: 10px; }
@media (max-width: 620px) {
  .px-kv { grid-template-columns: 78px 1fr; }
  .px-root { padding: 10px 10px 32px; }
}
`;
function PiaoxiaPanel(props) {
  const [data, setData] = useState5({ invoices: /* @__PURE__ */ new Map(), titles: /* @__PURE__ */ new Map(), meta: null });
  const [tab, setTab] = useState5("inbox");
  const [toastMsg, setToastMsg] = useState5(null);
  const [loaded, setLoaded] = useState5(false);
  const reload = useCallback2(async (cache = true) => {
    try {
      const d = await loadPiaoxia(cache);
      setData(d);
      setLoaded(true);
    } catch (e) {
      setToastMsg({ text: String(e.message), err: true, at: Date.now() });
    }
  }, []);
  useEffect(() => {
    void reload(false);
    let timer = 0;
    const tick = () => {
      if (document.visibilityState !== "hidden") void reload(true);
    };
    timer = window.setInterval(tick, 15e3);
    const onVis = () => {
      if (document.visibilityState === "visible") void reload(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const toast = useCallback2((text, err = false) => {
    setToastMsg({ text, err, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), Math.min(8e3, 2500 + toastMsg.text.length * 40));
    return () => clearTimeout(t);
  }, [toastMsg]);
  const view = useMemo2(
    () => core6.buildView(Array.from(data.invoices.values()), Array.from(data.titles.values()), Date.now()),
    [data]
  );
  const ctx = useMemo2(() => ({
    data,
    view,
    reload: () => reload(true),
    toast,
    sendToChat: props.onSendToChat
  }), [data, view, reload, toast, props.onSendToChat]);
  const metaAgeOk = data.meta && data.meta.lastTickAt && Date.now() - new Date(data.meta.lastTickAt).getTime() < 30 * 60 * 1e3;
  return /* @__PURE__ */ jsxs5("div", { className: "px-root", children: [
    /* @__PURE__ */ jsx5("style", { children: CSS }),
    /* @__PURE__ */ jsxs5("div", { className: "px-head", children: [
      /* @__PURE__ */ jsxs5("span", { className: "px-logo", children: [
        "\u7968",
        /* @__PURE__ */ jsx5("span", { className: "px-accent", children: "\u5323" })
      ] }),
      /* @__PURE__ */ jsx5("span", { className: "px-sub", children: "\u4E2A\u4EBA\u7535\u5B50\u53D1\u7968\u4FDD\u9669\u5E93" }),
      /* @__PURE__ */ jsxs5("span", { style: { marginLeft: "auto" }, className: "px-sub", children: [
        /* @__PURE__ */ jsx5("span", { className: "px-dot " + (metaAgeOk ? "ok" : loaded ? "warn" : "off") }),
        metaAgeOk ? `\u53D1\u7968\u4FDD\u9669\u5E93\u5C31\u7EEA \xB7 ${data.invoices.size} \u5F20\u7968` : loaded ? "\u7B49\u5F85\u89E3\u6790\u670D\u52A1\uFF08\u9762\u677F\u6536\u7968\u529F\u80FD\u6682\u4E0D\u53EF\u7528\uFF0CAI \u6536\u7968\u4E0D\u53D7\u5F71\u54CD\uFF09" : "\u8FDE\u63A5\u4E2D\u2026"
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "px-tabs", children: [
      /* @__PURE__ */ jsx5("div", { className: "px-tab" + (tab === "inbox" ? " on" : ""), onClick: () => setTab("inbox"), children: "\u6536\u7968\u53F0" }),
      /* @__PURE__ */ jsxs5("div", { className: "px-tab" + (tab === "ledger" ? " on" : ""), onClick: () => setTab("ledger"), children: [
        "\u7968\u518C",
        view && view.pending.count ? /* @__PURE__ */ jsxs5("span", { className: "px-badge", children: [
          view.pending.count,
          "\u5F85\u62A5"
        ] }) : null
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "px-tab" + (tab === "insight" ? " on" : ""), onClick: () => setTab("insight"), children: "\u900F\u89C6" }),
      /* @__PURE__ */ jsx5("div", { className: "px-tab" + (tab === "settings" ? " on" : ""), onClick: () => setTab("settings"), children: "\u62AC\u5934\u4E0E\u8BBE\u7F6E" })
    ] }),
    tab === "inbox" && /* @__PURE__ */ jsx5(InboxTab, { ctx }),
    tab === "ledger" && /* @__PURE__ */ jsx5(LedgerTab, { ctx }),
    tab === "insight" && /* @__PURE__ */ jsx5(InsightTab, { ctx }),
    tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { ctx }),
    toastMsg && /* @__PURE__ */ jsx5("div", { className: "px-toast" + (toastMsg.err ? " err" : ""), children: toastMsg.text })
  ] });
}

// src/index.tsx
var index_default = PiaoxiaPanel;
export {
  index_default as default
};
