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
    var K3 = [
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
          const t1 = h + S1 + ch + K3[i] + w[i] | 0;
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
    var DAY_MS = 864e5;
    var NAME_CAP = 30;
    var NOTE_CAP = 300;
    var VENDOR_CAP = 40;
    var DESC_CAP = 120;
    var MAX_BATCH_HINT = 3e3;
    var RATE_WINDOW_DAYS = 30;
    var CONS_WINDOW_DAYS2 = 90;
    var MIN_SPAN_KM = 30;
    var CAR_KINDS = ["fuel", "ev", "phev"];
    var CAR_KIND_LABELS3 = { fuel: "\u71C3\u6CB9", ev: "\u7EAF\u7535", phev: "\u63D2\u6DF7" };
    var CAR_KIND_UNITS = { fuel: "L", ev: "kWh", phev: "L" };
    var ENERGY_KINDS = ["fuel", "charge"];
    var SVC_TYPES2 = ["maintenance", "repair", "inspection", "insurance", "other"];
    var SVC_TYPE_LABELS2 = { maintenance: "\u4FDD\u517B", repair: "\u7EF4\u4FEE", inspection: "\u5E74\u68C0", insurance: "\u4FDD\u9669", other: "\u5176\u4ED6" };
    var DOC_TYPES2 = ["\u4EA4\u5F3A\u9669", "\u5546\u4E1A\u9669", "\u5E74\u68C0", "\u9A7E\u9A76\u8BC1", "\u884C\u9A76\u8BC1", "\u5176\u4ED6"];
    function clip(s, cap) {
      return String(s == null ? "" : s).trim().slice(0, cap);
    }
    function idFor(seed) {
      return "c" + sha256Hex(String(seed)).slice(0, 12);
    }
    function randTag() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function dayKey4(ts) {
      const d = new Date(typeof ts === "number" ? ts : Date.now());
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function parseDayKey(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
      if (!m) return null;
      const ts = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      const d = new Date(ts);
      return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? ts : null;
    }
    function dayDiff2(a, b) {
      const ta = parseDayKey(a), tb = parseDayKey(b);
      if (ta == null || tb == null) return NaN;
      return Math.round((tb - ta) / DAY_MS);
    }
    function addDaysStr2(dateStr, n) {
      const ts = parseDayKey(dateStr);
      if (ts == null) return null;
      return dayKey4(ts + n * DAY_MS);
    }
    function addMonthsStr(dateStr, n) {
      const ts = parseDayKey(dateStr);
      if (ts == null) return null;
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = d.getMonth() + Number(n);
      const target = new Date(y, m, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(d.getDate(), lastDay));
      return dayKey4(target.getTime());
    }
    function r22(x) {
      return Math.round(Number(x) * 100) / 100;
    }
    function r1(x) {
      return Math.round(Number(x) * 10) / 10;
    }
    function fmtNum5(x) {
      if (!Number.isFinite(x)) return "";
      return Number.isInteger(x) ? String(x) : String(r22(x));
    }
    function normalizeCar2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const name = clip(raw.name !== void 0 ? raw.name : prev ? prev.name : "", NAME_CAP);
      if (!name) return { error: "\u8F66\u8F86\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\uFF08\u5982\u300C\u5BB6\u91CC\u7684\u767D\u8272 SUV\u300D\u300C\u8001\u7238\u7684\u5361\u7F57\u62C9\u300D\uFF09" };
      const kindRaw = String(raw.kind !== void 0 ? raw.kind : prev ? prev.kind : "fuel");
      const kind = CAR_KINDS.includes(kindRaw) ? kindRaw : "fuel";
      let odo = raw.initialOdometer !== void 0 ? Number(raw.initialOdometer) : prev ? prev.initialOdometer : 0;
      if (!Number.isFinite(odo) || odo < 0) odo = prev ? prev.initialOdometer || 0 : 0;
      if (odo > 3e6) return { error: "initialOdometer \u4E0D\u5408\u7406\uFF08>300 \u4E07 km\uFF09" };
      return { car: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("car|" + name),
        name,
        kind,
        plate: clip(raw.plate !== void 0 ? raw.plate : prev ? prev.plate : "", 12),
        initialOdometer: r1(odo),
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        // createdAt 尊重显式传入（测试合成时间 / 导入保真）；未传才取当下
        createdAt: prev ? prev.createdAt || Date.now() : Number(raw.createdAt) || Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function unitOf2(car) {
      return CAR_KIND_UNITS[car && car.kind] || "L";
    }
    function normalizeEnergy2(raw, existing, car) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const carId = clip(raw.carId !== void 0 ? raw.carId : prev ? prev.carId : "", 40);
      if (!carId) return { error: "\u8865\u80FD\u8BB0\u5F55\u5FC5\u987B\u6302\u5728\u4E00\u8F86\u8F66\u4E0B" };
      let kind = String(raw.kind !== void 0 ? raw.kind : prev ? prev.kind : "");
      if (!kind) kind = car && car.kind === "ev" ? "charge" : "fuel";
      if (!ENERGY_KINDS.includes(kind)) return { error: `kind \u4E0D\u5408\u6CD5\uFF08fuel/charge\uFF09: ${kind}` };
      const date = clip(raw.date !== void 0 ? raw.date : prev ? prev.date : dayKey4(Date.now()), 10);
      if (parseDayKey(date) == null) return { error: `\u65E5\u671F\u4E0D\u5408\u6CD5\uFF1A${date}\uFF08\u9700 YYYY-MM-DD\uFF09` };
      let odo = raw.odometer !== void 0 ? Number(raw.odometer) : prev ? prev.odometer : NaN;
      if (!Number.isFinite(odo) || odo < 0) return { error: "odometer \u5FC5\u586B\uFF08\u91CC\u7A0B\u8868\u8BFB\u6570 km\uFF0C\u6CB9\u8017/\u517B\u62A4\u5012\u8BA1\u65F6\u90FD\u9760\u5B83\uFF09" };
      odo = r1(odo);
      if (car && odo < (Number(car.initialOdometer) || 0)) {
        return { error: `odometer(${odo}) \u4E0D\u80FD\u5C0F\u4E8E\u5EFA\u6863\u91CC\u7A0B(${car.initialOdometer})` };
      }
      let amount = raw.amount !== void 0 ? Number(raw.amount) : prev ? prev.amount : NaN;
      if (!Number.isFinite(amount) || amount <= 0) return { error: "amount \u5FC5\u586B\u4E14\u4E3A\u6B63\u6570\uFF08L \u6216 kWh\uFF09" };
      if (amount > 1e4) return { error: "amount \u4E0D\u5408\u7406\uFF08>10000\uFF09" };
      amount = r22(amount);
      let cost = raw.cost !== void 0 ? Number(raw.cost) : prev ? prev.cost : NaN;
      if (!Number.isFinite(cost) || cost < 0) return { error: "cost \u5FC5\u586B\u4E14 \u22650\uFF08\u672C\u6B21\u82B1\u8D39\uFF0C\u5143\uFF09" };
      cost = r22(Math.min(cost, 1e6));
      const filled = raw.filled === void 0 ? prev ? prev.filled === true : true : raw.filled === true;
      return { energy: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("energy|" + carId + "|" + date + "|" + odo + "|" + randTag()),
        carId,
        kind,
        date,
        odometer: odo,
        amount,
        cost,
        filled,
        station: clip(raw.station !== void 0 ? raw.station : prev ? prev.station : "", VENDOR_CAP),
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function normalizeItem2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const carId = clip(raw.carId !== void 0 ? raw.carId : prev ? prev.carId : "", 40);
      if (!carId) return { error: "\u517B\u62A4\u9879\u5FC5\u987B\u6302\u5728\u4E00\u8F86\u8F66\u4E0B" };
      const name = clip(raw.name !== void 0 ? raw.name : prev ? prev.name : "", NAME_CAP);
      if (!name) return { error: "\u517B\u62A4\u9879\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\uFF08\u5982\u300C\u673A\u6CB9\u673A\u6EE4\u300D\u300C\u7A7A\u8C03\u6EE4\u82AF\u300D\u300C\u8F6E\u80CE\u6362\u4F4D\u300D\uFF09" };
      const c = raw.cycle !== void 0 ? raw.cycle : prev ? prev.cycle : null;
      const cyc = c && typeof c === "object" ? c : {};
      let km = cyc.kmInterval !== void 0 ? Math.floor(Number(cyc.kmInterval)) : prev && prev.cycle ? prev.cycle.kmInterval : void 0;
      if (km !== void 0 && (!Number.isFinite(km) || km !== 0 && km < 500)) {
        if (!(km === 0 && cyc.kmInterval === 0)) return { error: `cycle.kmInterval \u9700 \u2265500 km \u6216\u663E\u5F0F 0 \u8868\u793A\u5173\u95ED: ${cyc.kmInterval}` };
      }
      if (km === 0) km = void 0;
      let mo = cyc.monthInterval !== void 0 ? Math.floor(Number(cyc.monthInterval)) : prev && prev.cycle ? prev.cycle.monthInterval : void 0;
      if (mo !== void 0 && (!Number.isFinite(mo) || mo < 0 || mo > 0 && mo < 1)) {
        if (!(mo === 0 && cyc.monthInterval === 0)) return { error: `cycle.monthInterval \u9700 \u22651 \u6708\u6216\u663E\u5F0F 0: ${cyc.monthInterval}` };
      }
      if (mo === 0) mo = void 0;
      if (km === void 0 && mo === void 0) return { error: "cycle \u81F3\u5C11\u8981\u6709 kmInterval \u6216 monthInterval \u4E4B\u4E00" };
      let lastOdometer = raw.lastOdometer !== void 0 ? Number(raw.lastOdometer) : prev ? prev.lastOdometer : void 0;
      if (lastOdometer !== void 0) {
        if (!Number.isFinite(lastOdometer) || lastOdometer < 0) return { error: `lastOdometer \u975E\u6CD5: ${raw.lastOdometer}` };
        lastOdometer = r1(lastOdometer);
      }
      let lastDate = raw.lastDate !== void 0 ? clip(raw.lastDate, 10) : prev ? prev.lastDate : void 0;
      if (lastDate !== void 0 && parseDayKey(lastDate) == null) return { error: `lastDate \u4E0D\u5408\u6CD5\uFF1A${lastDate}` };
      if (kmIntervalIsSet(km) && lastOdometer === void 0) return { error: "km \u5468\u671F\u9700\u8981 lastOdometer\uFF08\u4E0A\u6B21\u4FDD\u517B\u65F6\u7684\u91CC\u7A0B\u8868\u8BFB\u6570\uFF09\u4F5C\u4E3A\u951A\u70B9" };
      if (mo !== void 0 && lastDate === void 0) return { error: "\u6708\u5468\u671F\u9700\u8981 lastDate\uFF08\u4E0A\u6B21\u4FDD\u517B\u65E5\u671F\uFF09\u4F5C\u4E3A\u951A\u70B9" };
      const active = raw.active === void 0 ? prev ? prev.active !== false : true : raw.active === true;
      return { item: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("item|" + carId + "|" + name),
        carId,
        name,
        cycle: { ...km !== void 0 ? { kmInterval: km } : {}, ...mo !== void 0 ? { monthInterval: mo } : {} },
        lastOdometer,
        lastDate,
        active,
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function kmIntervalIsSet(km) {
      return km !== void 0 && km !== null;
    }
    function normalizeSvc2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const carId = clip(raw.carId !== void 0 ? raw.carId : prev ? prev.carId : "", 40);
      if (!carId) return { error: "\u7EF4\u4FDD\u8BB0\u5F55\u5FC5\u987B\u6302\u5728\u4E00\u8F86\u8F66\u4E0B" };
      const type = String(raw.type !== void 0 ? raw.type : prev ? prev.type : "maintenance");
      if (!SVC_TYPES2.includes(type)) return { error: `type \u4E0D\u5408\u6CD5\uFF08${SVC_TYPES2.join("/")}\uFF09: ${type}` };
      const date = clip(raw.date !== void 0 ? raw.date : prev ? prev.date : dayKey4(Date.now()), 10);
      if (parseDayKey(date) == null) return { error: `\u65E5\u671F\u4E0D\u5408\u6CD5\uFF1A${date}` };
      let odometer = raw.odometer !== void 0 ? Number(raw.odometer) : prev ? prev.odometer : void 0;
      if (odometer !== void 0) {
        if (!Number.isFinite(odometer) || odometer < 0) return { error: `odometer \u975E\u6CD5: ${raw.odometer}` };
        odometer = r1(odometer);
      }
      let cost = raw.cost !== void 0 ? Number(raw.cost) : prev ? prev.cost : void 0;
      if (cost !== void 0) {
        if (!Number.isFinite(cost) || cost < 0) return { error: `cost \u975E\u6CD5: ${raw.cost}` };
        cost = r22(Math.min(cost, 1e6));
      }
      return { svc: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("svc|" + carId + "|" + date + "|" + randTag()),
        carId,
        type,
        date,
        odometer,
        desc: clip(raw.desc !== void 0 ? raw.desc : prev ? prev.desc : "", DESC_CAP) || SVC_TYPE_LABELS2[type],
        cost,
        vendor: clip(raw.vendor !== void 0 ? raw.vendor : prev ? prev.vendor : "", VENDOR_CAP),
        itemName: clip(raw.itemName !== void 0 ? raw.itemName : prev ? prev.itemName : "", NAME_CAP),
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    function normalizeDoc2(raw, existing) {
      if (!raw || typeof raw !== "object") return { error: "\u8F7D\u8377\u7F3A\u5931" };
      const prev = existing && typeof existing === "object" ? existing : null;
      const carId = raw.carId !== void 0 ? clip(raw.carId, 40) : prev ? prev.carId : "";
      let type = clip(raw.type !== void 0 ? raw.type : prev ? prev.type : "", 20);
      if (!type) return { error: "type \u5FC5\u586B\uFF08\u4EA4\u5F3A\u9669/\u5546\u4E1A\u9669/\u5E74\u68C0/\u9A7E\u9A76\u8BC1/\u884C\u9A76\u8BC1/\u5176\u4ED6\uFF09" };
      const expiry = clip(raw.expiry !== void 0 ? raw.expiry : prev ? prev.expiry : "", 10);
      if (parseDayKey(expiry) == null) return { error: `expiry \u5FC5\u586B\u4E14\u9700 YYYY-MM-DD\uFF1A${expiry}` };
      let remindDays = raw.remindDays !== void 0 ? Math.floor(Number(raw.remindDays)) : prev ? prev.remindDays : void 0;
      if (remindDays !== void 0 && (!Number.isFinite(remindDays) || remindDays < 0 || remindDays > 365)) {
        return { error: `remindDays \u9700 0-365: ${raw.remindDays}` };
      }
      return { doc: {
        id: prev && prev.id ? String(prev.id) : raw.id ? String(raw.id).slice(0, 40) : idFor("doc|" + (carId || "personal") + "|" + type + "|" + expiry),
        carId: carId || "",
        type,
        expiry,
        remindDays,
        note: clip(raw.note !== void 0 ? raw.note : prev ? prev.note : "", NOTE_CAP),
        createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        rev: prev ? (Number(prev.rev) || 1) + 1 : 1
      } };
    }
    var SETTING_LIMITS = { docWarnDays: [7, 365, 30], itemWatchKm: [100, 5e3, 500], itemWatchDays: [1, 120, 14], costWindowDays: [30, 365, 90] };
    function normalizeSettings2(raw) {
      const out = {};
      for (const [k, lim] of Object.entries(SETTING_LIMITS)) {
        const v = Number(raw && typeof raw === "object" ? raw[k] : void 0);
        out[k] = Number.isFinite(v) ? Math.min(lim[1], Math.max(lim[0], Math.floor(v))) : lim[2];
      }
      return out;
    }
    function latestOdometer2(energies, svcs, car) {
      let odo = Number(car && car.initialOdometer) || 0;
      for (const e of energies || []) {
        const v = Number(e && e.odometer);
        if (Number.isFinite(v) && v > odo) odo = v;
      }
      for (const s of svcs || []) {
        const v = Number(s && s.odometer);
        if (Number.isFinite(v) && v > odo) odo = v;
      }
      return r1(odo);
    }
    function mileageRate(energies, svcs, car, nowTs) {
      const now = typeof nowTs === "number" ? nowTs : Date.now();
      const rows = [];
      for (const e of energies || []) if (e && Number.isFinite(Number(e.odometer))) rows.push({ odo: Number(e.odometer), at: parseDayKey(e.date) || Number(e.createdAt) || now });
      for (const s of svcs || []) if (s && Number.isFinite(Number(s.odometer))) rows.push({ odo: Number(s.odometer), at: parseDayKey(s.date) || Number(s.createdAt) || now });
      rows.sort((a, b) => a.at - b.at);
      if (rows.length >= 2) {
        const since = now - RATE_WINDOW_DAYS * DAY_MS;
        const window2 = rows.filter((r) => r.at >= since);
        const use = window2.length >= 2 ? window2 : rows.slice(-2);
        const first = use[0];
        const last = use[use.length - 1];
        const days2 = Math.max(1, Math.round((last.at - first.at) / DAY_MS));
        const km = last.odo - first.odo;
        if (km > 0) return { rate: km / days2, source: window2.length >= 2 ? "window" : "span", days: days2, km };
      }
      const init = Number(car && car.initialOdometer) || 0;
      const cur = latestOdometer2(energies, svcs, car);
      const created = Number(car && car.createdAt) || now;
      const days = Math.round((now - created) / DAY_MS);
      if (cur > init && days >= 1) return { rate: (cur - init) / days, source: "lifetime", days, km: cur - init };
      return { rate: null, source: "none" };
    }
    function periodConsumption2(energies, car, today, sinceDate) {
      const unit = unitOf2(car);
      const rows = (energies || []).filter((e) => e && e.carId === car.id && Number.isFinite(Number(e.odometer))).filter((e) => !sinceDate || dayDiff2(sinceDate, e.date) >= 0).sort((a, b) => dayDiff2(b.date, a.date) || Number(a.createdAt) - Number(b.createdAt));
      if (rows.length < 2) return { ok: false, reason: "\u6837\u672C\u4E0D\u8DB3\uFF08\u81F3\u5C11\u4E24\u6761\u8865\u80FD\u8BB0\u5F55\uFF09", unit };
      const idxOf = new Map(rows.map((e, i) => [e.id, i]));
      let A = null;
      let B = null;
      let estimated = false;
      const filled = rows.filter((e) => e.filled === true);
      if (filled.length >= 2) {
        A = filled[0];
        B = filled[filled.length - 1];
      } else {
        A = rows[0];
        B = rows[rows.length - 1];
        estimated = true;
      }
      const kmSpan = r1(B.odometer - A.odometer);
      if (kmSpan < MIN_SPAN_KM) return { ok: false, reason: `\u91CC\u7A0B\u8DE8\u5EA6\u8FC7\u5C0F\uFF08${kmSpan}km < ${MIN_SPAN_KM}km\uFF09`, unit };
      const aIdx = idxOf.get(A.id);
      const bIdx = idxOf.get(B.id);
      let amount = 0;
      let cost = 0;
      for (let i = aIdx + 1; i <= bIdx; i++) {
        amount += Number(rows[i].amount) || 0;
        cost += Number(rows[i].cost) || 0;
      }
      if (amount <= 0) return { ok: false, reason: "\u951A\u5B9A\u7A97\u53E3\u5185\u65E0\u6709\u6548\u8865\u80FD\u91CF", unit };
      return {
        ok: true,
        unit,
        estimated,
        per100: r22(amount / kmSpan * 100),
        costPerKm: cost > 0 ? r22(cost / kmSpan) : null,
        kmSpan,
        days: Math.max(1, dayDiff2(A.date, B.date)),
        amount: r22(amount),
        cost: r22(cost),
        since: A.date,
        until: B.date
      };
    }
    function itemProjection2(item, car, energies, svcs, nowTs, settings) {
      const st = settings && typeof settings === "object" ? normalizeSettings2(settings) : normalizeSettings2(null);
      const now = typeof nowTs === "number" ? nowTs : Date.now();
      const today = dayKey4(now);
      const cyc = item.cycle || {};
      const cur = latestOdometer2(energies, svcs, car);
      const rate = mileageRate(energies, svcs, car, now).rate;
      let byKm = null;
      if (cyc.kmInterval && item.lastOdometer !== void 0) {
        const dueKm = r1(Number(item.lastOdometer) + Number(cyc.kmInterval));
        const kmLeft = r1(dueKm - cur);
        const daysLeft = rate && rate > 0 && kmLeft > 0 ? Math.ceil(kmLeft / rate) : kmLeft <= 0 ? 0 : null;
        byKm = { dueKm, kmLeft, daysLeft };
      }
      let byTime = null;
      if (cyc.monthInterval && item.lastDate) {
        const dueDate = addMonthsStr(item.lastDate, Number(cyc.monthInterval));
        const daysLeft = dayDiff2(today, dueDate);
        byTime = { dueDate, daysLeft };
      }
      let pick = null;
      if (byKm && byTime) {
        const kd = byKm.kmLeft <= 0 ? -1 : byKm.daysLeft == null ? Number.MAX_SAFE_INTEGER : byKm.daysLeft;
        const td = byTime.daysLeft;
        pick = kd <= td ? "km" : "time";
      } else if (byKm) pick = "km";
      else if (byTime) pick = "time";
      const worst = (a, b) => {
        if (a === "overdue" || b === "overdue") return "overdue";
        const w = { overdue: 0, due: 1, watch: 2, ok: 3 };
        return w[a] <= w[b] ? a : b;
      };
      let state = "ok";
      let axis = null;
      if (byKm) {
        const s = byKm.kmLeft <= 0 ? "overdue" : byKm.kmLeft <= st.itemWatchKm ? "due" : byKm.daysLeft != null && byKm.daysLeft <= st.itemWatchDays ? "watch" : "ok";
        if (s !== "ok") {
          axis = axis || "km";
        }
        state = worst(state, s);
      }
      if (byTime) {
        const d = byTime.daysLeft;
        const s = d <= 0 ? "overdue" : d <= st.itemWatchDays ? "due" : d <= st.itemWatchDays * 2 ? "watch" : "ok";
        if (s !== "ok") axis = axis || "time";
        state = worst(state, s);
      }
      if (state === "ok") axis = null;
      const out = { state, axis };
      if (byKm) {
        out.dueKm = byKm.dueKm;
        out.kmLeft = byKm.kmLeft;
        out.daysLeftByKm = byKm.daysLeft;
      }
      if (byTime) {
        out.dueDate = byTime.dueDate;
        out.daysLeftByTime = byTime.daysLeft;
      }
      if (pick) out._pick = pick;
      return out;
    }
    function describeItem2(item) {
      const c = item.cycle || {};
      const parts = [];
      if (c.kmInterval) parts.push(`\u6BCF ${fmtNum5(c.kmInterval)} km`);
      if (c.monthInterval) parts.push(`\u6BCF ${c.monthInterval} \u4E2A\u6708`);
      const anchors = [];
      if (item.lastOdometer !== void 0) anchors.push(`\u4E0A\u6B21 ${fmtNum5(item.lastOdometer)} km`);
      if (item.lastDate) anchors.push(`\u4E0A\u6B21 ${item.lastDate}`);
      return `${item.name}\uFF08${parts.join(" + ")}${anchors.length ? "\uFF1B" + anchors.join("\uFF0C") : ""}\uFF09`;
    }
    function docBands2(docs, cars, nowTs, settings) {
      const st = settings && typeof settings === "object" ? normalizeSettings2(settings) : normalizeSettings2(null);
      const today = dayKey4(typeof nowTs === "number" ? nowTs : Date.now());
      const carById = new Map((cars || []).map((c) => [c.id, c]));
      const rows = [];
      for (const d of docs || []) {
        if (!d || !d.expiry) continue;
        const days = dayDiff2(today, d.expiry);
        if (Number.isNaN(days)) continue;
        const warn = Number.isFinite(Number(d.remindDays)) ? Number(d.remindDays) : st.docWarnDays;
        const car = d.carId ? carById.get(d.carId) : null;
        rows.push({
          docId: d.id,
          type: d.type,
          expiry: d.expiry,
          days,
          band: days < 0 ? "expired" : days <= warn ? "soon" : "ok",
          carName: car ? car.name : d.carId ? "\u672A\u77E5\u8F66\u8F86" : "\u4E2A\u4EBA",
          note: d.note || ""
        });
      }
      const order = { expired: 0, soon: 1, ok: 2 };
      rows.sort((a, b) => order[a.band] - order[b.band] || (a.expiry < b.expiry ? -1 : 1));
      return rows;
    }
    function costBreakdown(energies, svcs, car, today, windowDays) {
      const days = Math.max(30, Math.floor(Number(windowDays) || 90));
      const since = addDaysStr2(today, -days);
      const months = /* @__PURE__ */ new Map();
      const add = (date, key, v) => {
        const m = String(date).slice(0, 7);
        const b = months.get(m) || { energy: 0, maintenance: 0, repair: 0, inspection: 0, insurance: 0, other: 0 };
        b[key] = r22((b[key] || 0) + (Number(v) || 0));
        months.set(m, b);
      };
      let eCost = 0;
      let sCost = 0;
      for (const e of energies || []) {
        if (!e || e.carId !== car.id) continue;
        if (dayDiff2(since, e.date) < 0) continue;
        eCost += Number(e.cost) || 0;
        add(e.date, "energy", e.cost);
      }
      for (const s of svcs || []) {
        if (!s || s.carId !== car.id) continue;
        if (dayDiff2(since, s.date) < 0) continue;
        const key = SVC_TYPES2.includes(s.type) ? s.type : "other";
        sCost += Number(s.cost) || 0;
        add(s.date, key, s.cost);
      }
      const perMonth = [...months.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([month, b]) => ({ month, ...b, total: r22(Object.values(b).reduce((x, y) => x + (Number(y) || 0), 0)) }));
      const odoRows = [];
      for (const e of energies || []) if (e && e.carId === car.id && dayDiff2(since, e.date) >= 0) odoRows.push({ odo: Number(e.odometer), at: parseDayKey(e.date) || 0 });
      odoRows.sort((a, b) => a.at - b.at);
      let kmSpan = 0;
      if (odoRows.length >= 2) kmSpan = r1(odoRows[odoRows.length - 1].odo - odoRows[0].odo);
      const total = r22(eCost + sCost);
      return {
        windowDays: days,
        energyCost: r22(eCost),
        serviceCost: r22(sCost),
        total,
        costPerKm: kmSpan >= MIN_SPAN_KM ? r22(total / kmSpan) : null,
        perMonth
      };
    }
    function carSnapshot(car, energies, items, svcs, docs, nowTs, settings) {
      const now = typeof nowTs === "number" ? nowTs : Date.now();
      const today = dayKey4(now);
      const ownE = (energies || []).filter((e) => e && e.carId === car.id).slice(0, MAX_BATCH_HINT);
      const ownS = (svcs || []).filter((s) => s && s.carId === car.id).slice(0, MAX_BATCH_HINT);
      const ownI = (items || []).filter((i) => i && i.carId === car.id && i.active !== false);
      const ownD = (docs || []).filter((d) => d && d.carId === car.id);
      const odo = latestOdometer2(ownE, ownS, car);
      const rate = mileageRate(ownE, ownS, car, now);
      const cons = periodConsumption2(ownE, car, today, addDaysStr2(today, -CONS_WINDOW_DAYS2));
      const itemsProj = ownI.map((it) => ({ itemId: it.id, name: it.name, describe: describeItem2(it), projection: itemProjection2(it, car, ownE, ownS, now, settings) })).sort((a, b) => {
        const w = { overdue: 0, due: 1, watch: 2, ok: 3 };
        return w[a.projection.state] - w[b.projection.state];
      });
      const docRows = docBands2(ownD, [car], now, settings).filter((r) => r.band !== "ok");
      const cost = costBreakdown(ownE, ownS, car, today, normalizeSettings2(settings).costWindowDays);
      return {
        carId: car.id,
        name: car.name,
        kind: car.kind,
        plate: car.plate || "",
        unit: unitOf2(car),
        odometer: odo,
        kmPerDay: rate.rate != null ? r1(rate.rate) : null,
        rateSource: rate.source,
        consumption: cons.ok ? { per100: cons.per100, costPerKm: cons.costPerKm, unit: cons.unit, since: cons.since, until: cons.until, kmSpan: cons.kmSpan, estimated: cons.estimated === true } : null,
        consumptionNote: cons.ok ? "" : cons.reason,
        items: itemsProj,
        docsDue: docRows,
        cost
      };
    }
    function familySnapshot2(cars, energies, items, svcs, docs, nowTs, settings) {
      const now = typeof nowTs === "number" ? nowTs : Date.now();
      const list = (cars || []).filter((c) => c && c.id).map((car) => carSnapshot(car, energies, items, svcs, docs, now, settings));
      const personalDocs = docBands2((docs || []).filter((d) => d && !d.carId), [], now, settings).filter((r) => r.band !== "ok");
      return { at: now, cars: list, personalDocs };
    }
    function exportAll3(data) {
      const strip = (arr, drop) => (Array.isArray(arr) ? arr : []).map((x) => {
        const o = {};
        for (const k of Object.keys(x || {})) if (!drop.includes(k)) o[k] = x[k];
        return o;
      });
      return JSON.stringify({
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        kind: "polaris-chexia",
        disclaimer: "\u5BB6\u5EAD\u8F66\u52A1\u8BB0\u5F55\uFF0C\u975E\u7EF4\u4FEE/\u4FDD\u9669\u5EFA\u8BAE\u3002",
        cars: strip(data.cars, ["rev"]),
        energies: strip(data.energies, ["rev"]),
        items: strip(data.items, ["rev"]),
        svcs: strip(data.svcs, ["rev"]),
        docs: strip(data.docs, ["rev"]),
        settings: normalizeSettings2(data.settings)
      }, null, 2);
    }
    module.exports = {
      DAY_MS,
      NAME_CAP,
      NOTE_CAP,
      RATE_WINDOW_DAYS,
      CONS_WINDOW_DAYS: CONS_WINDOW_DAYS2,
      MIN_SPAN_KM,
      CAR_KINDS,
      CAR_KIND_LABELS: CAR_KIND_LABELS3,
      CAR_KIND_UNITS,
      ENERGY_KINDS,
      SVC_TYPES: SVC_TYPES2,
      SVC_TYPE_LABELS: SVC_TYPE_LABELS2,
      DOC_TYPES: DOC_TYPES2,
      clip,
      idFor,
      randTag,
      dayKey: dayKey4,
      parseDayKey,
      dayDiff: dayDiff2,
      addDaysStr: addDaysStr2,
      addMonthsStr,
      r1,
      r2: r22,
      fmtNum: fmtNum5,
      normalizeCar: normalizeCar2,
      normalizeEnergy: normalizeEnergy2,
      normalizeItem: normalizeItem2,
      normalizeSvc: normalizeSvc2,
      normalizeDoc: normalizeDoc2,
      normalizeSettings: normalizeSettings2,
      unitOf: unitOf2,
      latestOdometer: latestOdometer2,
      mileageRate,
      periodConsumption: periodConsumption2,
      itemProjection: itemProjection2,
      describeItem: describeItem2,
      docBands: docBands2,
      costBreakdown,
      carSnapshot,
      familySnapshot: familySnapshot2,
      exportAll: exportAll3
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useRef, useState as useState4 } from "react";

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
var PREFIX = "chexia.";
var K = {
  car: (id) => `${PREFIX}car.${id}`,
  carPrefix: `${PREFIX}car.`,
  energy: (id) => `${PREFIX}energy.${id}`,
  energyPrefix: `${PREFIX}energy.`,
  item: (id) => `${PREFIX}item.${id}`,
  itemPrefix: `${PREFIX}item.`,
  svc: (id) => `${PREFIX}svc.${id}`,
  svcPrefix: `${PREFIX}svc.`,
  doc: (id) => `${PREFIX}doc.${id}`,
  docPrefix: `${PREFIX}doc.`,
  settings: `${PREFIX}settings`,
  snapshot: `${PREFIX}snapshot`,
  meta: `${PREFIX}meta`
};
function newCache() {
  return { knownKeys: null, fullAt: 0, entities: /* @__PURE__ */ new Map() };
}
var FULL_REFRESH_MS = 90 * 1e3;
var SNAPSHOT_STALE_MS = 5 * 60 * 1e3;
var ENTITY_PREFIXES = [K.carPrefix, K.energyPrefix, K.itemPrefix, K.svcPrefix, K.docPrefix];
async function loadChexia(cache) {
  const keys = await kvKeys();
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.entities.clear();
    cache.fullAt = now;
  }
  const keySet = new Set(keys);
  for (const k of [...cache.entities.keys()]) {
    if (!keySet.has(k)) cache.entities.delete(k);
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)));
  const todo = entityKeys.filter((k) => full || !cache.entities.has(k));
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet(k).catch(() => null);
      return { k, v };
    }));
    for (const { k, v } of fetched) {
      if (v && typeof v === "object" && typeof v.id === "string") cache.entities.set(k, v);
      else if (!v) cache.entities.delete(k);
    }
  }
  cache.knownKeys = keySet;
  const collect = (prefix) => [...cache.entities.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  const cars = collect(K.carPrefix);
  const energies = collect(K.energyPrefix);
  const items = collect(K.itemPrefix);
  const svcs = collect(K.svcPrefix);
  const docs = collect(K.docPrefix);
  const [snapRaw, settingsRaw, meta] = await Promise.all([
    kvGet(K.snapshot).catch(() => null),
    kvGet(K.settings).catch(() => null),
    kvGet(K.meta).catch(() => null)
  ]);
  return {
    cars,
    energies,
    items,
    svcs,
    docs,
    settings: core.normalizeSettings(settingsRaw),
    snap: snapRaw && typeof snapRaw === "object" && Array.isArray(snapRaw.cars) ? snapRaw : null,
    meta: meta && typeof meta === "object" ? meta : null
  };
}
async function saveCar(input, existing) {
  const r = core.normalizeCar(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const c = r.car;
  await kvSet(K.car(c.id), c);
  return c;
}
async function saveEnergy(input, existing, car) {
  const r = core.normalizeEnergy(input, existing, car);
  if ("error" in r && r.error) throw new Error(r.error);
  const e = r.energy;
  await kvSet(K.energy(e.id), e);
  return e;
}
async function saveItem(input, existing) {
  const r = core.normalizeItem(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const it = r.item;
  await kvSet(K.item(it.id), it);
  return it;
}
async function saveSvc(input, existing) {
  const r = core.normalizeSvc(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const s = r.svc;
  await kvSet(K.svc(s.id), s);
  return s;
}
async function saveDoc(input, existing) {
  const r = core.normalizeDoc(input, existing);
  if ("error" in r && r.error) throw new Error(r.error);
  const d = r.doc;
  await kvSet(K.doc(d.id), d);
  return d;
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function deleteEnergy(id) {
  await kvDel(K.energy(id));
}
async function deleteSvc(id) {
  await kvDel(K.svc(id));
}
async function deleteItem(id) {
  await kvDel(K.item(id));
}
async function deleteDoc(id) {
  await kvDel(K.doc(id));
}
async function deleteCar(id, purge, data) {
  const own = {
    energies: data.energies.filter((e) => e.carId === id),
    items: data.items.filter((it) => it.carId === id),
    svcs: data.svcs.filter((s) => s.carId === id),
    docs: data.docs.filter((d) => d.carId === id)
  };
  const total = own.energies.length + own.items.length + own.svcs.length + own.docs.length;
  if (total > 0 && !purge) throw new Error(`\u8BE5\u8F66\u540D\u4E0B\u8FD8\u6709 ${total} \u6761\u8BB0\u5F55\uFF08\u8865\u80FD ${own.energies.length} / \u517B\u62A4\u9879 ${own.items.length} / \u7EF4\u4FDD ${own.svcs.length} / \u8BC1\u4EF6 ${own.docs.length}\uFF09\uFF0C\u8BF7\u9009\u62E9\u4E00\u5E76\u5220\u9664`);
  for (const e of own.energies) await kvDel(K.energy(e.id));
  for (const it of own.items) await kvDel(K.item(it.id));
  for (const s of own.svcs) await kvDel(K.svc(s.id));
  for (const d of own.docs) await kvDel(K.doc(d.id));
  await kvDel(K.car(id));
  return total;
}
async function serviceStatus(pluginId, serviceId) {
  const st = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  const arr = Array.isArray(st) ? st : [];
  const mine = arr.find((s) => s.pluginId === pluginId && s.serviceId === serviceId);
  if (!mine) return null;
  return { running: mine.status === "running" || mine.status === "starting", lastError: typeof mine.lastError === "string" ? mine.lastError : void 0 };
}
async function serviceStart(pluginId, serviceId) {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const plugins = r.plugins || [];
  const self = plugins.find((p) => p.id === pluginId);
  if (!self) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230\u81EA\u5DF1\uFF08\u91CD\u8BD5\u4E00\u6B21\uFF1B\u4ECD\u5931\u8D25\u8BF7\u91CD\u542F\u5E94\u7528\uFF09");
  const contributes = self.contributes || {};
  const svc = (contributes.services || []).find((s) => s.id === serviceId);
  if (!svc) throw new Error("\u6E05\u5355\u91CC\u627E\u4E0D\u5230\u670D\u52A1\u8D21\u732E\uFF08\u8BF7\u91CD\u88C5\u63D2\u4EF6\uFF09");
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType,
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 3,
      description: svc.description ?? null
    }
  });
}
function snapUsable(snap) {
  return !!snap && Date.now() - snap.at < SNAPSHOT_STALE_MS;
}
function computeSnap(data, nowTs) {
  return core.familySnapshot(data.cars, data.energies, data.items, data.svcs, data.docs, nowTs, data.settings);
}
function exportAll2(data) {
  return core.exportAll(data);
}

// src/OverviewTab.tsx
var core2 = __toESM(require_core());
var import_core = __toESM(require_core());
import { jsx, jsxs } from "react/jsx-runtime";
var css = `
.ov-car{padding:11px 13px}
.ov-head{display:flex;align-items:center;gap:8px}
.ov-name{font-weight:700;font-size:13.5px}
.ov-kind{font-size:10px;color:#8B95A7;background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 6px}
.ov-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0 8px}
.ov-cell{background:#0d1117;border-radius:9px;padding:7px 6px;text-align:center}
.ov-cell b{display:block;font-size:13px;font-variant-numeric:tabular-nums}
.ov-cell small{font-size:9.5px;color:#8B95A7}
.ov-item{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #1c222e;font-size:11.5px}
.ov-item:first-of-type{border-top:none}
.ov-item .nm{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ov-doc{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #1c222e;font-size:11.5px}
.ov-doc:first-of-type{border-top:none}
.ov-state{font-size:10px;padding:1px 7px;border-radius:5px;white-space:nowrap}
.ov-state.overdue,.ov-state.expired{background:#3a1d22;color:#FF8A9A;border:1px solid #54262c}
.ov-state.due,.ov-state.soon{background:#332a12;color:#E3B341;border:1px solid #5a4a1e}
.ov-state.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.ov-alert{margin:0 16px 10px;background:#332a12;border:1px solid #5a4a1e;border-radius:11px;padding:9px 12px;font-size:11.5px;color:#E3B341;line-height:1.7}
.ov-alert.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
`;
function bandCls(s) {
  return s === "overdue" || s === "expired" ? s : s === "due" || s === "soon" ? s : "ok";
}
function stateText(s) {
  return { overdue: "\u5DF2\u8D85\u671F", due: "\u5C06\u5230", watch: "\u7559\u610F", ok: "\u6B63\u5E38", expired: "\u5DF2\u8FC7\u671F", soon: "\u4E34\u8FD1" }[s] || s;
}
function itemDueText(p) {
  if (p.state === "overdue") {
    if (p.axis === "time") return `\u5DF2\u4E8E ${p.dueDate} \u5230\u671F`;
    return `\u5DF2\u8D85 ${(0, import_core.fmtNum)(-(p.kmLeft || 0))} km`;
  }
  if (p.axis === "time" && p.dueDate) return `${p.dueDate} \u5230\u671F${p.daysLeftByTime != null ? `\uFF08${Math.abs(p.daysLeftByTime)} \u5929${p.daysLeftByTime <= 0 ? "\u524D" : "\u540E"}\uFF09` : ""}`;
  const km = p.kmLeft != null ? `\u5269 ${(0, import_core.fmtNum)(p.kmLeft)} km` : "";
  const days = p.daysLeftByKm != null ? `\uFF08\u7EA6 ${p.daysLeftByKm} \u5929\uFF09` : "";
  return `${km}${days}`;
}
function docRow(d, carLabel) {
  const when = d.days < 0 ? `${-d.days} \u5929\u524D\u5DF2\u8FC7\u671F` : `${d.days} \u5929\u540E\u5230\u671F`;
  return /* @__PURE__ */ jsxs("div", { className: "ov-doc", children: [
    /* @__PURE__ */ jsx("span", { className: `ov-state ${bandCls(d.band)}`, children: stateText(d.band) }),
    /* @__PURE__ */ jsxs("span", { className: "ov-item nm", style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
      carLabel && d.carName !== "\u4E2A\u4EBA" ? `${d.carName} \xB7 ` : "",
      d.type
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "cx-sub", children: [
      d.expiry,
      " \xB7 ",
      when
    ] })
  ] }, d.docId);
}
function OverviewTab({ data, snap }) {
  if (!data) return /* @__PURE__ */ jsx("div", { className: "cx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  if (!data.cars.length) {
    return /* @__PURE__ */ jsxs("div", { className: "cx-empty", children: [
      "\u8FD8\u6CA1\u6709\u8F66\u8F86\u6863\u6848\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u53BB\u300C\u8BBE\u7F6E\u300D\u6DFB\u52A0\u8F66\u8F86\uFF0C\u6216\u76F4\u63A5\u5BF9 AI \u8BF4\uFF1A",
      /* @__PURE__ */ jsx("br", {}),
      /* @__PURE__ */ jsx("span", { style: { color: "#79B8FF" }, children: "\u300C\u8BB0\u4E00\u4E0B\u6211\u7684\u8F66\uFF1A\u767DSUV\uFF0C\u6CB9\u8F66\uFF0C\u73B0\u57284\u4E075\u5343\u516C\u91CC\u300D" }),
      /* @__PURE__ */ jsx("br", {}),
      "\u4E4B\u540E\u6BCF\u6B21\u52A0\u5B8C\u6CB9\u62A5\u4E00\u53E5\u300C\u52A0\u6CB9350\u575742.3\u5347\uFF0C\u91CC\u7A0B45230\u300D\u5C31\u80FD\u81EA\u52A8\u7B97\u6CB9\u8017\u3002"
    ] });
  }
  const snapOf = (carId) => snap?.cars.find((c) => c.carId === carId);
  const urgentDocs = snap ? [...snap.cars.flatMap((c) => c.docsDue), ...snap.personalDocs].filter((d) => d.band !== "ok") : [];
  const redDocs = urgentDocs.filter((d) => d.band === "expired");
  const yellowDocs = urgentDocs.filter((d) => d.band === "soon");
  return /* @__PURE__ */ jsxs("div", { className: "cx-root", style: { display: "block" }, children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    redDocs.length > 0 && /* @__PURE__ */ jsxs("div", { className: "ov-alert red", children: [
      "\u{1F534} ",
      redDocs.length,
      " \u9879\u8BC1\u4EF6\u5DF2\u8FC7\u671F\uFF1A",
      redDocs.map((d) => `${d.carName === "\u4E2A\u4EBA" ? "" : d.carName + "\xB7"}${d.type}`).join("\u3001"),
      "\u2014\u2014\u8BF7\u5C3D\u5FEB\u5904\u7406"
    ] }),
    yellowDocs.length > 0 && /* @__PURE__ */ jsxs("div", { className: "ov-alert", children: [
      "\u{1F7E1} ",
      yellowDocs.length,
      " \u9879\u8BC1\u4EF6\u4E34\u8FD1\u5230\u671F\uFF1A",
      yellowDocs.map((d) => `${d.carName === "\u4E2A\u4EBA" ? "" : d.carName + "\xB7"}${d.type} ${d.expiry}`).join("\u3001")
    ] }),
    snap?.cars.map((s) => {
      const car = data.cars.find((c) => c.id === s.carId);
      const cons = s.consumption;
      return /* @__PURE__ */ jsx("div", { className: "cx-card", children: /* @__PURE__ */ jsxs("div", { className: "ov-car", children: [
        /* @__PURE__ */ jsxs("div", { className: "ov-head", children: [
          /* @__PURE__ */ jsx("span", { className: "ov-name", children: s.name }),
          /* @__PURE__ */ jsxs("span", { className: "ov-kind", children: [
            core2.CAR_KIND_LABELS[s.kind] || s.kind,
            s.plate ? ` \xB7 ${s.plate}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ov-grid", children: [
          /* @__PURE__ */ jsxs("div", { className: "ov-cell", children: [
            /* @__PURE__ */ jsxs("b", { children: [
              (0, import_core.fmtNum)(s.odometer),
              /* @__PURE__ */ jsx("small", { children: "km" })
            ] }),
            /* @__PURE__ */ jsx("small", { children: "\u91CC\u7A0B\u8868" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "ov-cell", children: [
            /* @__PURE__ */ jsxs("b", { children: [
              s.kmPerDay != null ? (0, import_core.fmtNum)(s.kmPerDay) : "\u2014",
              /* @__PURE__ */ jsx("small", { children: "km/\u5929" })
            ] }),
            /* @__PURE__ */ jsx("small", { children: "\u65E5\u5747\u91CC\u7A0B" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "ov-cell", children: [
            /* @__PURE__ */ jsxs("b", { children: [
              cons ? `${cons.per100}` : "\u2014",
              /* @__PURE__ */ jsx("small", { children: cons ? `${cons.unit}/100km` : "" })
            ] }),
            /* @__PURE__ */ jsxs("small", { children: [
              "\u671F\u95F4\u80FD\u8017",
              cons?.estimated ? "*" : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "ov-cell", children: [
            /* @__PURE__ */ jsxs("b", { children: [
              cons?.costPerKm != null ? `${cons.costPerKm}` : s.cost.costPerKm != null ? `${s.cost.costPerKm}` : "\u2014",
              /* @__PURE__ */ jsx("small", { children: "\u5143/km" })
            ] }),
            /* @__PURE__ */ jsx("small", { children: "\u6BCF\u516C\u91CC\u6210\u672C" })
          ] })
        ] }),
        s.items.length > 0 && s.items.map((it) => {
          const p = it.projection;
          const frac = p.kmLeft != null && p.dueKm != null && p.dueKm > 0 ? Math.max(0, Math.min(1, 1 - p.kmLeft / (p.dueKm - (car ? car.initialOdometer : 0) || 1))) : p.state === "overdue" ? 1 : 0;
          const color = p.state === "overdue" ? "#F85149" : p.state === "due" ? "#D29922" : p.state === "watch" ? "#58A6FF" : "#3FB950";
          return /* @__PURE__ */ jsxs("div", { className: "ov-item", children: [
            /* @__PURE__ */ jsx("span", { className: "nm", children: it.name }),
            /* @__PURE__ */ jsx("div", { className: "cx-prog", style: { width: 90, flexShrink: 0 }, children: /* @__PURE__ */ jsx("i", { style: { width: `${Math.round(frac * 100)}%`, background: color } }) }),
            /* @__PURE__ */ jsx("span", { className: `ov-state ${bandCls(p.state)}`, children: stateText(p.state) }),
            /* @__PURE__ */ jsx("span", { className: "cx-sub", style: { minWidth: 86, textAlign: "right" }, children: itemDueText(p) })
          ] }, it.itemId);
        }),
        s.items.length === 0 && /* @__PURE__ */ jsx("div", { className: "cx-sub", style: { paddingTop: 6 }, children: "\u672A\u767B\u8BB0\u517B\u62A4\u9879\u2014\u2014\u300C\u8F66\u52A1\u300D\u9875\u53EF\u7ACB\u673A\u6CB9/\u6EE4\u82AF\u7B49\u5468\u671F\u9879" }),
        s.docsDue.length > 0 && s.docsDue.map((d) => docRow(d, false))
      ] }) }, s.carId);
    }),
    snap && snap.personalDocs.length > 0 && /* @__PURE__ */ jsxs("div", { className: "cx-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "cx-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "cx-bar" }),
        "\u4E2A\u4EBA\u8BC1\u4EF6"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "cx-card-b", children: snap.personalDocs.map((d) => docRow(d, false)) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "cx-sub", style: { margin: "2px 18px 0", color: "#5C6678" }, children: "*\u671F\u95F4\u80FD\u8017 = \u8FD190\u5929\u8865\u80FD\u91CF \xF7 \u91CC\u7A0B\u5DEE\uFF08\u4E0D\u8981\u6C42\u52A0\u6EE1\uFF1B\u5C1A\u65E0\u4E24\u6B21\u52A0\u6EE1\u65F6\u4E3A\u6BDB\u4F30\uFF09\u3002\u5143/km \u4E0E\u80FD\u8017\u540C\u7A97\u53E3\u3002" })
  ] });
}

// src/EnergyTab.tsx
var core3 = __toESM(require_core());
import { useMemo, useState } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var css2 = `
.en-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.en-form .full{grid-column:1/-1}
.en-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#8B95A7;margin-top:8px}
.en-check input{accent-color:#2b6cb0}
.en-rec{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #1c222e;font-size:11.5px;min-width:0}
.en-rec:first-child{border-top:none}
.en-rec .dt{color:#8B95A7;width:74px;flex-shrink:0;font-variant-numeric:tabular-nums}
.en-rec .odo{font-variant-numeric:tabular-nums}
.en-full{font-size:9px;color:#3FB950;border:1px solid #2b4a37;border-radius:4px;padding:0 4px}
.en-part{font-size:9px;color:#D29922;border:1px solid #5a4a1e;border-radius:4px;padding:0 4px}
.en-del{background:transparent;border:none;color:#5C6678;cursor:pointer;font-size:13px;padding:2px 5px;flex-shrink:0}
.en-del:hover{color:#F85149}
.en-cons{margin-top:8px;background:#0d1117;border-radius:9px;padding:8px 10px;font-size:11.5px;line-height:1.8}
`;
function EnergyTab({ data, reload, showToast, pluginId }) {
  const [carId, setCarId] = useState("");
  const [date, setDate] = useState(() => core3.dayKey(Date.now()));
  const [odometer, setOdometer] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [filled, setFilled] = useState(true);
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCons, setLastCons] = useState("");
  const [filterCar, setFilterCar] = useState("");
  const cars = data?.cars || [];
  const effCarId = carId || (cars[0] ? cars[0].id : "");
  const car = cars.find((c) => c.id === effCarId) || null;
  const records = useMemo(() => {
    const list = (data?.energies || []).filter((e) => !filterCar || e.carId === filterCar);
    return list.sort((a, b) => a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);
  }, [data, filterCar]);
  const stats = useMemo(() => {
    if (!data) return [];
    const today = core3.dayKey(Date.now());
    const since90 = core3.addDaysStr(today, -90);
    return data.cars.map((c) => {
      const own = data.energies.filter((e) => e.carId === c.id);
      const cons = core3.periodConsumption(own, c, today, core3.addDaysStr(today, -core3.CONS_WINDOW_DAYS));
      const total90 = since90 ? own.filter((e) => core3.dayDiff(since90, e.date) >= 0).reduce((n, e) => n + (Number(e.cost) || 0), 0) : 0;
      return { car: c, cons, total90: core3.r2(total90) };
    });
  }, [data]);
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "cx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  if (!cars.length) {
    return /* @__PURE__ */ jsx2("div", { className: "cx-empty", children: "\u5148\u53BB\u300C\u8BBE\u7F6E\u300D\u6DFB\u52A0\u8F66\u8F86\uFF0C\u6216\u5BF9 AI \u8BF4\u300C\u8BB0\u4E00\u4E0B\u6211\u7684\u8F66\u300D\u3002" });
  }
  const submit = async () => {
    if (!car) return;
    if (!odometer.trim()) {
      showToast("\u91CC\u7A0B\u8868\u8BFB\u6570\u5FC5\u586B\u2014\u2014\u5B83\u662F\u6CB9\u8017\u548C\u517B\u62A4\u5012\u8BA1\u65F6\u7684\u751F\u547D\u7EBF", true);
      return;
    }
    if (!amount.trim() || !(Number(amount) > 0)) {
      showToast("\u8BF7\u586B\u5199\u672C\u6B21\u8865\u80FD\u91CF\uFF08\u5347\u6216 kWh\uFF09", true);
      return;
    }
    setBusy(true);
    try {
      const e = await saveEnergy({
        carId: car.id,
        date,
        odometer: Number(odometer),
        amount: Number(amount),
        cost: cost.trim() ? Number(cost) : 0,
        filled,
        station
      }, null, car);
      setOdometer("");
      setAmount("");
      setCost("");
      setStation("");
      const own = [...data.energies.filter((x) => x.carId === car.id).filter((x) => x.id !== e.id), e];
      const cons = core3.periodConsumption(own, car, core3.dayKey(Date.now()), core3.addDaysStr(core3.dayKey(Date.now()), -core3.CONS_WINDOW_DAYS));
      setLastCons(cons.ok ? `\u8FD190\u5929\uFF1A${cons.per100} ${cons.unit}/100km${cons.estimated ? "\uFF08\u6BDB\u4F30\uFF09" : ""}${cons.costPerKm != null ? ` \xB7 ${cons.costPerKm} \u5143/km` : ""}\uFF08\u7A97\u53E3 ${cons.since}\u2192${cons.until}\uFF09` : `\u80FD\u8017\u6682\u65E0\u6CD5\u51FA\u6570\uFF1A${cons.reason}`);
      await reload();
      showToast(`\u5DF2\u8BB0\u8865\u80FD ${e.amount}${core3.unitOf(car)} / ${e.cost} \u5143`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const carName = (id) => cars.find((c) => c.id === id)?.name || "?";
  return /* @__PURE__ */ jsxs2("div", { className: "cx-root", style: { display: "block" }, children: [
    /* @__PURE__ */ jsx2("style", { children: css2 }),
    /* @__PURE__ */ jsxs2("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "cx-bar" }),
      "\u8BB0\u4E00\u7B14\u8865\u80FD",
      /* @__PURE__ */ jsx2("span", { className: "cx-hint", children: "\u91CC\u7A0B\u8868\u8BFB\u6570\u5FC5\u586B" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cx-card", children: /* @__PURE__ */ jsxs2("div", { className: "cx-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "en-form", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "cx-lbl", children: "\u8F66\u8F86" }),
          /* @__PURE__ */ jsx2("select", { className: "cx-sel", value: effCarId, onChange: (e) => setCarId(e.target.value), children: cars.map((c) => /* @__PURE__ */ jsx2("option", { value: c.id, children: c.name }, c.id)) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "cx-lbl", children: "\u65E5\u671F" }),
          /* @__PURE__ */ jsx2("input", { className: "cx-inp", type: "date", value: date, onChange: (e) => setDate(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "cx-lbl", children: "\u91CC\u7A0B\u8868\u8BFB\u6570\uFF08km\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "cx-inp", inputMode: "decimal", placeholder: `${car ? core3.fmtNum(car.initialOdometer) : 0} \u4EE5\u4E0A`, value: odometer, onChange: (e) => setOdometer(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "cx-lbl", children: "\u91D1\u989D\uFF08\u5143\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "cx-inp", inputMode: "decimal", placeholder: "350", value: cost, onChange: (e) => setCost(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("label", { className: "cx-lbl", children: [
            "\u8865\u80FD\u91CF\uFF08",
            car ? core3.unitOf(car) : "L/kWh",
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx2("input", { className: "cx-inp", inputMode: "decimal", placeholder: car?.kind === "ev" ? "32.5" : "42.3", value: amount, onChange: (e) => setAmount(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("label", { className: "cx-lbl", children: "\u52A0\u6CB9\u7AD9/\u5145\u7535\u7AD9\uFF08\u53EF\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx2("input", { className: "cx-inp", placeholder: "\u4E2D\u77F3\u5316 / \u7279\u6765\u7535", value: station, onChange: (e) => setStation(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "en-check full", children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: filled, onChange: (e) => setFilled(e.target.checked) }),
          "\u52A0\u6EE1/\u5145\u6EE1\uFF08\u4E24\u6B21\u52A0\u6EE1\u4E4B\u95F4\u53EF\u7CBE\u786E\u7B97\u6CB9\u8017\uFF1B\u52A0\u534A\u7BB1\u4E5F\u80FD\u8BB0\uFF0C\u671F\u95F4\u53E3\u5F84\u515C\u5E95\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx2("button", { className: "cx-btn", onClick: submit, disabled: busy, children: busy ? "\u8BB0\u5F55\u4E2D\u2026" : "\u8BB0\u4E00\u7B14" }) }),
      lastCons && /* @__PURE__ */ jsx2("div", { className: "en-cons", children: lastCons })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "cx-bar" }),
      "\u5206\u8F66\u7EDF\u8BA1",
      /* @__PURE__ */ jsx2("span", { className: "cx-hint", children: "\u8FD190\u5929" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cx-card", children: /* @__PURE__ */ jsx2("div", { className: "cx-card-b", children: stats.map(({ car: c, cons, total90 }) => /* @__PURE__ */ jsxs2("div", { style: { padding: "5px 0", fontSize: 11.5 }, children: [
      /* @__PURE__ */ jsx2("b", { children: c.name }),
      /* @__PURE__ */ jsxs2("span", { className: "cx-sub", children: [
        "\uFF1A",
        cons.ok ? `${cons.per100} ${cons.unit}/100km${cons.estimated ? "\uFF08\u6BDB\u4F30\uFF09" : ""}` : cons.reason,
        total90 > 0 ? ` \xB7 \u8865\u80FD ${core3.fmtNum(total90)} \u5143` : ""
      ] })
    ] }, c.id)) }) }),
    /* @__PURE__ */ jsxs2("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "cx-bar" }),
      "\u8865\u80FD\u6D41\u6C34",
      /* @__PURE__ */ jsxs2("select", { className: "cx-sel", style: { width: "auto", marginLeft: "auto", padding: "3px 6px", fontSize: 11 }, value: filterCar, onChange: (e) => setFilterCar(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u8F66\u8F86" }),
        cars.map((c) => /* @__PURE__ */ jsx2("option", { value: c.id, children: c.name }, c.id))
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cx-card", children: /* @__PURE__ */ jsxs2("div", { className: "cx-card-b", children: [
      records.length === 0 && /* @__PURE__ */ jsx2("div", { className: "cx-empty", style: { padding: 14 }, children: "\u8BE5\u8303\u56F4\u8FD8\u6CA1\u6709\u8865\u80FD\u8BB0\u5F55\u3002" }),
      records.slice(0, 60).map((e) => /* @__PURE__ */ jsxs2("div", { className: "en-rec", children: [
        /* @__PURE__ */ jsx2("span", { className: "dt", children: e.date }),
        /* @__PURE__ */ jsx2("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: carName(e.carId) }),
        /* @__PURE__ */ jsxs2("span", { className: "odo", children: [
          core3.fmtNum(e.odometer),
          "km"
        ] }),
        /* @__PURE__ */ jsxs2("span", { children: [
          e.amount,
          e.kind === "charge" ? "kWh" : "L"
        ] }),
        /* @__PURE__ */ jsxs2("span", { children: [
          e.cost,
          "\u5143"
        ] }),
        e.filled ? /* @__PURE__ */ jsx2("span", { className: "en-full", children: "\u6EE1" }) : /* @__PURE__ */ jsx2("span", { className: "en-part", children: "\u672A\u6EE1" }),
        e.station && /* @__PURE__ */ jsx2("span", { className: "cx-sub", style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.station }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            className: "en-del",
            title: "\u5220\u9664\u8FD9\u6761\u8BB0\u5F55",
            onClick: async () => {
              if (!window.confirm(`\u5220\u9664 ${e.date} \u8FD9\u6761\u8865\u80FD\u8BB0\u5F55\uFF1F`)) return;
              try {
                await deleteEnergy(e.id);
                await reload();
                showToast("\u5DF2\u5220\u9664");
              } catch (err) {
                showToast(err.message, true);
              }
            },
            children: "\u2715"
          }
        )
      ] }, e.id)),
      records.length > 60 && /* @__PURE__ */ jsxs2("div", { className: "cx-sub", style: { paddingTop: 6 }, children: [
        "\uFF08\u4EC5\u663E\u793A\u6700\u8FD1 60 \u6761\uFF0C\u5171 ",
        records.length,
        " \u6761\uFF09"
      ] })
    ] }) })
  ] });
}

// src/ServiceTab.tsx
var core4 = __toESM(require_core());
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var css3 = `
.sv-fold{background:transparent;border:none;color:#79B8FF;font-size:11px;cursor:pointer;padding:2px 6px}
.sv-form{border-top:1px solid #1c222e;padding-top:9px;margin-top:8px}
.sv-it{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #1c222e;font-size:11.5px;min-width:0}
.sv-it:first-child{border-top:none}
.sv-st{font-size:10px;padding:1px 7px;border-radius:5px;white-space:nowrap;flex-shrink:0}
.sv-st.overdue{background:#3a1d22;color:#FF8A9A;border:1px solid #54262c}
.sv-st.due{background:#332a12;color:#E3B341;border:1px solid #5a4a1e}
.sv-st.watch{background:#16283e;color:#79B8FF;border:1px solid #1f4a74}
.sv-st.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.sv-del{background:transparent;border:none;color:#5C6678;cursor:pointer;font-size:13px;padding:2px 5px;flex-shrink:0}
.sv-del:hover{color:#F85149}
.sv-adv{background:#16283e;border:1px solid #1f4a74;color:#79B8FF;border-radius:6px;font-size:10px;padding:2px 7px;cursor:pointer;flex-shrink:0}
.sv-adv:hover{filter:brightness(1.2)}
.sv-hint2{font-size:10px;color:#5C6678;margin-top:4px;line-height:1.6}
`;
function ServiceTab({ data, reload, showToast }) {
  const [fold, setFold] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [itCar, setItCar] = useState2("");
  const [itName, setItName] = useState2("");
  const [itKm, setItKm] = useState2("");
  const [itMonths, setItMonths] = useState2("");
  const [itLastOdo, setItLastOdo] = useState2("");
  const [itLastDate, setItLastDate] = useState2("");
  const [svCar, setSvCar] = useState2("");
  const [svType, setSvType] = useState2("maintenance");
  const [svDate, setSvDate] = useState2(() => core4.dayKey(Date.now()));
  const [svOdo, setSvOdo] = useState2("");
  const [svCost, setSvCost] = useState2("");
  const [svDesc, setSvDesc] = useState2("");
  const [svVendor, setSvVendor] = useState2("");
  const [svItemName, setSvItemName] = useState2("");
  const [dcCar, setDcCar] = useState2("");
  const [dcType, setDcType] = useState2("\u4EA4\u5F3A\u9669");
  const [dcExpiry, setDcExpiry] = useState2("");
  const [dcRemind, setDcRemind] = useState2("");
  const cars = data?.cars || [];
  const carName = (id) => cars.find((c) => c.id === id)?.name || "\u4E2A\u4EBA/\u672A\u77E5";
  const itemsProj = useMemo2(() => {
    if (!data) return [];
    const now = Date.now();
    return data.items.map((it) => {
      const car = data.cars.find((c) => c.id === it.carId) || null;
      const p = it.active === false ? null : core4.itemProjection(it, car, data.energies, data.svcs, now, data.settings);
      return { it, car, p };
    }).sort((a, b) => {
      if (!a.p && !b.p) return 0;
      if (!a.p) return 1;
      if (!b.p) return -1;
      const w = { overdue: 0, due: 1, watch: 2, ok: 3 };
      return w[a.p.state] - w[b.p.state];
    });
  }, [data]);
  const svcRows = useMemo2(() => {
    return [...data?.svcs || []].sort((a, b) => a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);
  }, [data]);
  const docRows = useMemo2(() => {
    if (!data) return [];
    return core4.docBands(data.docs, data.cars, Date.now(), data.settings);
  }, [data]);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "cx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  if (!cars.length) return /* @__PURE__ */ jsx3("div", { className: "cx-empty", children: "\u5148\u53BB\u300C\u8BBE\u7F6E\u300D\u6DFB\u52A0\u8F66\u8F86\u3002" });
  const submitItem = async () => {
    const carId = itCar || cars[0].id;
    const cycle = {};
    if (itKm.trim()) cycle.kmInterval = Number(itKm);
    if (itMonths.trim()) cycle.monthInterval = Number(itMonths);
    try {
      await saveItem({ carId, name: itName, cycle, lastOdometer: itLastOdo.trim() ? Number(itLastOdo) : void 0, lastDate: itLastDate || void 0 });
      setItName("");
      setItKm("");
      setItMonths("");
      setItLastOdo("");
      setItLastDate("");
      setFold("");
      await reload();
      showToast("\u5DF2\u7ACB\u517B\u62A4\u9879");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const submitSvc = async () => {
    const car = cars.find((c) => c.id === (svCar || cars[0].id));
    if (!car) return;
    setBusy(true);
    try {
      const s = await saveSvc({
        carId: car.id,
        type: svType,
        date: svDate,
        odometer: svOdo.trim() ? Number(svOdo) : void 0,
        cost: svCost.trim() ? Number(svCost) : void 0,
        desc: svDesc,
        vendor: svVendor,
        itemName: svItemName
      });
      let anchorMsg = "";
      if (s.type === "maintenance" && s.itemName) {
        const target = data.items.find((it) => it.carId === car.id && it.name === s.itemName);
        if (target) {
          const patch = {};
          if (s.odometer != null && (target.lastOdometer === void 0 || s.odometer >= target.lastOdometer)) patch.lastOdometer = s.odometer;
          if (!target.lastDate || s.date >= target.lastDate) patch.lastDate = s.date;
          if (patch.lastOdometer !== void 0 || patch.lastDate !== void 0) {
            await saveItem(patch, target);
            anchorMsg = `\uFF1B\u5DF2\u63A8\u8FDB\u300C${target.name}\u300D\u951A\u70B9`;
          }
        }
      }
      setSvOdo("");
      setSvCost("");
      setSvDesc("");
      setSvItemName("");
      setFold("");
      await reload();
      showToast(`\u5DF2\u8BB0\u7EF4\u4FDD${anchorMsg}`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const submitDoc = async () => {
    try {
      await saveDoc({
        carId: dcCar,
        type: dcType,
        expiry: dcExpiry,
        remindDays: dcRemind.trim() ? Number(dcRemind) : void 0
      });
      setDcExpiry("");
      setDcRemind("");
      setFold("");
      await reload();
      showToast("\u5DF2\u767B\u8BB0\u8BC1\u4EF6");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const advanceItem = async (it) => {
    const car = cars.find((c) => c.id === it.carId);
    if (!car) return;
    const today = core4.dayKey(Date.now());
    const curOdo = core4.latestOdometer(
      data.energies.filter((e) => e.carId === car.id),
      data.svcs.filter((s) => s.carId === car.id),
      car
    );
    if (!window.confirm(`\u628A\u300C${it.name}\u300D\u8BB0\u4E3A\u4ECA\u5929\uFF08${today}\uFF09\u5DF2\u505A${curOdo > 0 ? `\uFF0C\u91CC\u7A0B\u6309\u5F53\u524D ${core4.fmtNum(curOdo)} km` : ""}\uFF1F`)) return;
    try {
      await saveSvc({ carId: car.id, type: "maintenance", date: today, odometer: curOdo > 0 ? curOdo : void 0, desc: `${it.name}\uFF08\u9762\u677F\u5FEB\u6377\u6253\u5361\uFF09`, itemName: it.name });
      const target = it;
      const patch = { lastDate: today };
      if (curOdo > 0 && (target.lastOdometer === void 0 || curOdo >= target.lastOdometer)) patch.lastOdometer = curOdo;
      await saveItem(patch, target);
      await reload();
      showToast(`\u300C${it.name}\u300D\u5DF2\u63A8\u8FDB\u951A\u70B9\uFF0C\u8FDB\u5165\u4E0B\u4E00\u5468\u671F`);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const stTag = (s) => /* @__PURE__ */ jsx3("span", { className: `sv-st ${s}`, children: { overdue: "\u5DF2\u8D85\u671F", due: "\u5C06\u5230", watch: "\u7559\u610F", ok: "\u6B63\u5E38" }[s] || s });
  return /* @__PURE__ */ jsxs3("div", { className: "cx-root", style: { display: "block" }, children: [
    /* @__PURE__ */ jsx3("style", { children: css3 }),
    /* @__PURE__ */ jsxs3("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "cx-bar" }),
      "\u517B\u62A4\u9879",
      /* @__PURE__ */ jsx3("button", { className: "sv-fold", style: { marginLeft: "auto" }, onClick: () => setFold(fold === "item" ? "" : "item"), children: fold === "item" ? "\u6536\u8D77" : "+ \u65B0\u5EFA" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cx-card", children: /* @__PURE__ */ jsxs3("div", { className: "cx-card-b", children: [
      fold === "item" && /* @__PURE__ */ jsxs3("div", { className: "sv-form", children: [
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u8F66\u8F86" }),
            /* @__PURE__ */ jsx3("select", { className: "cx-sel", value: itCar || cars[0].id, onChange: (e) => setItCar(e.target.value), children: cars.map((c) => /* @__PURE__ */ jsx3("option", { value: c.id, children: c.name }, c.id)) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u9879\u76EE\u540D" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", placeholder: "\u673A\u6CB9\u673A\u6EE4", value: itName, onChange: (e) => setItName(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u91CC\u7A0B\u5468\u671F\uFF08km\uFF0C\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", inputMode: "numeric", placeholder: "5000", value: itKm, onChange: (e) => setItKm(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u65F6\u95F4\u5468\u671F\uFF08\u6708\uFF0C\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", inputMode: "numeric", placeholder: "6", value: itMonths, onChange: (e) => setItMonths(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u4E0A\u6B21\u4FDD\u517B\u91CC\u7A0B\uFF08km \u5468\u671F\u5FC5\u586B\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", inputMode: "decimal", placeholder: "46000", value: itLastOdo, onChange: (e) => setItLastOdo(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u4E0A\u6B21\u4FDD\u517B\u65E5\u671F\uFF08\u6708\u5468\u671F\u5FC5\u586B\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", type: "date", value: itLastDate, onChange: (e) => setItLastDate(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx3("button", { className: "cx-btn", onClick: submitItem, disabled: busy, children: "\u7ACB\u517B\u62A4\u9879" }) }),
        /* @__PURE__ */ jsx3("div", { className: "sv-hint2", children: "\u53CC\u5468\u671F\u540C\u65F6\u586B = \u54EA\u4E2A\u5148\u5230\u6309\u54EA\u4E2A\u63D0\u9192\u3002\u91CC\u7A0B\u5468\u671F\u6309\u65E5\u5747\u91CC\u7A0B\u6362\u7B97\u5929\u6570\u3002" })
      ] }),
      itemsProj.length === 0 && /* @__PURE__ */ jsx3("div", { className: "cx-empty", style: { padding: 14 }, children: "\u8FD8\u6CA1\u6709\u517B\u62A4\u9879\u3002\u5EFA\u8BAE\u5148\u7ACB\u300C\u673A\u6CB9\u673A\u6EE4\u300D\u300C\u7A7A\u8C03\u6EE4\u82AF\u300D\u300C\u8F6E\u80CE\u6362\u4F4D\u300D\u3002" }),
      itemsProj.map(({ it, p }) => /* @__PURE__ */ jsxs3("div", { className: "sv-it", children: [
        /* @__PURE__ */ jsxs3("span", { style: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
          carName(it.carId),
          " \xB7 ",
          it.name,
          /* @__PURE__ */ jsxs3("span", { className: "cx-sub", children: [
            " ",
            core4.describeItem(it).replace(it.name, "").trim()
          ] })
        ] }),
        p && stTag(p.state),
        /* @__PURE__ */ jsx3("span", { className: "cx-sub", style: { minWidth: 96, textAlign: "right" }, children: p ? p.state === "overdue" ? p.axis === "time" ? `${p.dueDate} \u5230\u671F` : `\u8D85 ${core4.fmtNum(-(p.kmLeft || 0))}km` : p.axis === "time" && p.dueDate ? `${p.dueDate}` : p.kmLeft != null ? `\u5269 ${core4.fmtNum(p.kmLeft)}km` : "" : "\u5DF2\u505C\u7528" }),
        p && /* @__PURE__ */ jsx3("button", { className: "sv-adv", onClick: () => advanceItem(it), children: "\u505A\u5230\u4ECA\u5929" }),
        /* @__PURE__ */ jsx3(
          "button",
          {
            className: "sv-del",
            title: "\u5220\u9664\u517B\u62A4\u9879",
            onClick: async () => {
              if (!window.confirm(`\u5220\u9664\u517B\u62A4\u9879\u300C${it.name}\u300D\uFF1F\u5386\u53F2\u7EF4\u4FDD\u8BB0\u5F55\u4FDD\u7559\u3002`)) return;
              try {
                await deleteItem(it.id);
                await reload();
                showToast("\u5DF2\u5220\u9664");
              } catch (e) {
                showToast(e.message, true);
              }
            },
            children: "\u2715"
          }
        )
      ] }, it.id))
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "cx-bar" }),
      "\u7EF4\u4FDD\u8BB0\u5F55",
      /* @__PURE__ */ jsx3("button", { className: "sv-fold", style: { marginLeft: "auto" }, onClick: () => setFold(fold === "svc" ? "" : "svc"), children: fold === "svc" ? "\u6536\u8D77" : "+ \u8BB0\u4E00\u7B14" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cx-card", children: /* @__PURE__ */ jsxs3("div", { className: "cx-card-b", children: [
      fold === "svc" && /* @__PURE__ */ jsxs3("div", { className: "sv-form", children: [
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u8F66\u8F86" }),
            /* @__PURE__ */ jsx3("select", { className: "cx-sel", value: svCar || cars[0].id, onChange: (e) => setSvCar(e.target.value), children: cars.map((c) => /* @__PURE__ */ jsx3("option", { value: c.id, children: c.name }, c.id)) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u7C7B\u578B" }),
            /* @__PURE__ */ jsx3("select", { className: "cx-sel", value: svType, onChange: (e) => setSvType(e.target.value), children: core4.SVC_TYPES.map((t) => /* @__PURE__ */ jsx3("option", { value: t, children: core4.SVC_TYPE_LABELS[t] }, t)) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u65E5\u671F" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", type: "date", value: svDate, onChange: (e) => setSvDate(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u91CC\u7A0B\uFF08\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", inputMode: "decimal", value: svOdo, onChange: (e) => setSvOdo(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u8D39\u7528\uFF08\u5143\uFF0C\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", inputMode: "decimal", value: svCost, onChange: (e) => setSvCost(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u5546\u5BB6\uFF08\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", value: svVendor, onChange: (e) => setSvVendor(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u505A\u4E86\u4EC0\u4E48" }),
        /* @__PURE__ */ jsx3("input", { className: "cx-inp", placeholder: "\u5C0F\u4FDD\u517B \u6362\u673A\u6CB9\u673A\u6EE4", value: svDesc, onChange: (e) => setSvDesc(e.target.value) }),
        /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u5BF9\u5E94\u517B\u62A4\u9879\u540D\uFF08\u7C7B\u578B=\u4FDD\u517B\u65F6\u586B\u5199\u53EF\u81EA\u52A8\u63A8\u8FDB\u5176\u5468\u671F\u951A\u70B9\uFF09" }),
        /* @__PURE__ */ jsx3("input", { className: "cx-inp", placeholder: "\u673A\u6CB9\u673A\u6EE4", value: svItemName, onChange: (e) => setSvItemName(e.target.value) }),
        /* @__PURE__ */ jsx3("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx3("button", { className: "cx-btn", onClick: submitSvc, disabled: busy, children: "\u8BB0\u7EF4\u4FDD" }) })
      ] }),
      svcRows.length === 0 && /* @__PURE__ */ jsx3("div", { className: "cx-empty", style: { padding: 14 }, children: "\u8FD8\u6CA1\u6709\u7EF4\u4FDD\u8BB0\u5F55\u3002" }),
      svcRows.slice(0, 40).map((s) => /* @__PURE__ */ jsxs3("div", { className: "sv-it", children: [
        /* @__PURE__ */ jsx3("span", { className: "cx-sub", style: { width: 74, flexShrink: 0 }, children: s.date }),
        /* @__PURE__ */ jsxs3("span", { style: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
          carName(s.carId),
          " \xB7 ",
          s.desc,
          s.odometer != null && /* @__PURE__ */ jsxs3("span", { className: "cx-sub", children: [
            " ",
            core4.fmtNum(s.odometer),
            "km"
          ] }),
          s.vendor && /* @__PURE__ */ jsxs3("span", { className: "cx-sub", children: [
            " @",
            s.vendor
          ] })
        ] }),
        s.cost != null && /* @__PURE__ */ jsxs3("span", { children: [
          core4.fmtNum(s.cost),
          "\u5143"
        ] }),
        /* @__PURE__ */ jsx3(
          "button",
          {
            className: "sv-del",
            title: "\u5220\u9664\u8FD9\u6761\u7EF4\u4FDD\u8BB0\u5F55",
            onClick: async () => {
              if (!window.confirm(`\u5220\u9664 ${s.date}\u300C${s.desc}\u300D\uFF1F`)) return;
              try {
                await deleteSvc(s.id);
                await reload();
                showToast("\u5DF2\u5220\u9664\uFF08\u82E5\u66FE\u63A8\u8FDB\u951A\u70B9\uFF0C\u8BF7\u624B\u52A8\u8C03\u6574\u517B\u62A4\u9879\uFF09");
              } catch (e) {
                showToast(e.message, true);
              }
            },
            children: "\u2715"
          }
        )
      ] }, s.id)),
      svcRows.length > 40 && /* @__PURE__ */ jsxs3("div", { className: "cx-sub", style: { paddingTop: 6 }, children: [
        "\uFF08\u4EC5\u663E\u793A\u6700\u8FD1 40 \u6761\uFF0C\u5171 ",
        svcRows.length,
        " \u6761\uFF09"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "cx-bar" }),
      "\u8BC1\u4EF6 / \u4FDD\u9669 / \u5E74\u68C0",
      /* @__PURE__ */ jsx3("button", { className: "sv-fold", style: { marginLeft: "auto" }, onClick: () => setFold(fold === "doc" ? "" : "doc"), children: fold === "doc" ? "\u6536\u8D77" : "+ \u767B\u8BB0" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cx-card", children: /* @__PURE__ */ jsxs3("div", { className: "cx-card-b", children: [
      fold === "doc" && /* @__PURE__ */ jsxs3("div", { className: "sv-form", children: [
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u8F66\u8F86\uFF08\u53EF\u9009\u300C\u4E2A\u4EBA\u8BC1\u4EF6\u300D\uFF09" }),
            /* @__PURE__ */ jsxs3("select", { className: "cx-sel", value: dcCar, onChange: (e) => setDcCar(e.target.value), children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: "\u4E2A\u4EBA\u8BC1\u4EF6\uFF08\u5982\u9A7E\u9A76\u8BC1\uFF09" }),
              cars.map((c) => /* @__PURE__ */ jsx3("option", { value: c.id, children: c.name }, c.id))
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u7C7B\u578B" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", list: "cx-doc-types", placeholder: "\u4EA4\u5F3A\u9669", value: dcType, onChange: (e) => setDcType(e.target.value) }),
            /* @__PURE__ */ jsx3("datalist", { id: "cx-doc-types", children: core4.DOC_TYPES.map((t) => /* @__PURE__ */ jsx3("option", { value: t }, t)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "cx-row", style: { gap: 8 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u5230\u671F\u65E5" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", type: "date", value: dcExpiry, onChange: (e) => setDcExpiry(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "cx-grow", children: [
            /* @__PURE__ */ jsx3("label", { className: "cx-lbl", children: "\u63D0\u524D\u63D0\u9192\u5929\u6570\uFF08\u53EF\u7A7A\uFF09" }),
            /* @__PURE__ */ jsx3("input", { className: "cx-inp", inputMode: "numeric", placeholder: "30", value: dcRemind, onChange: (e) => setDcRemind(e.target.value) })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx3("button", { className: "cx-btn", onClick: submitDoc, disabled: busy, children: "\u767B\u8BB0" }) })
      ] }),
      docRows.length === 0 && /* @__PURE__ */ jsx3("div", { className: "cx-empty", style: { padding: 14 }, children: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u8BC1\u4EF6\u3002\u4EA4\u5F3A\u9669/\u5E74\u68C0\u5230\u671F\u662F\u6CD5\u5B9A\u786C\u89E6\u70B9\uFF0C\u5EFA\u8BAE\u5148\u767B\u8BB0\u3002" }),
      docRows.map((d) => /* @__PURE__ */ jsxs3("div", { className: "sv-it", children: [
        /* @__PURE__ */ jsx3("span", { className: `sv-st ${d.band === "expired" ? "overdue" : d.band === "soon" ? "due" : "ok"}`, children: d.band === "expired" ? "\u5DF2\u8FC7\u671F" : d.band === "soon" ? `\u5269 ${d.days} \u5929` : "\u6B63\u5E38" }),
        /* @__PURE__ */ jsxs3("span", { style: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
          d.carName === "\u4E2A\u4EBA" ? "" : `${d.carName} \xB7 `,
          d.type
        ] }),
        /* @__PURE__ */ jsx3("span", { className: "cx-sub", children: d.expiry }),
        /* @__PURE__ */ jsx3(
          "button",
          {
            className: "sv-del",
            title: "\u5220\u9664\u8BC1\u4EF6",
            onClick: async () => {
              if (!window.confirm(`\u5220\u9664${d.carName === "\u4E2A\u4EBA" ? "" : d.carName + "\u7684"}\u300C${d.type}\u300D\u767B\u8BB0\uFF1F`)) return;
              try {
                await deleteDoc(d.docId);
                await reload();
                showToast("\u5DF2\u5220\u9664");
              } catch (e) {
                showToast(e.message, true);
              }
            },
            children: "\u2715"
          }
        )
      ] }, d.docId)),
      /* @__PURE__ */ jsx3("div", { className: "sv-hint2", children: "\u7EED\u4FDD/\u5E74\u68C0\u5B8C\u6210\u540E\uFF0C\u628A\u5230\u671F\u65E5\u6539\u6210\u65B0\u65E5\u671F\u5373\u53EF\uFF08AI \u4FA7\u8BF4\u300C\u4EA4\u5F3A\u9669\u7EED\u5230\u660E\u5E745\u67081\u65E5\u300D\u4E5F\u884C\uFF09\u3002" })
    ] }) })
  ] });
}

// src/SettingsTab.tsx
var core5 = __toESM(require_core());
import { useState as useState3 } from "react";
import { Fragment, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var css4 = `
.st-car{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #1c222e;font-size:12px;min-width:0}
.st-car:first-child{border-top:none}
.st-del{background:transparent;border:none;color:#5C6678;cursor:pointer;font-size:13px;padding:2px 5px;flex-shrink:0}
.st-del:hover{color:#F85149}
.st-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.st-note{font-size:10.5px;color:#5C6678;line-height:1.7;margin-top:6px}
`;
var SERVICE_ID = "chexia-service";
function SettingsTab({ data, reload, showToast, pluginId }) {
  const [name, setName] = useState3("");
  const [kind, setKind] = useState3("fuel");
  const [odo, setOdo] = useState3("");
  const [plate, setPlate] = useState3("");
  const [busy, setBusy] = useState3(false);
  const [editing, setEditing] = useState3(null);
  const [editName, setEditName] = useState3("");
  const [editOdo, setEditOdo] = useState3("");
  const [docWarnDays, setDocWarnDays] = useState3("");
  const [itemWatchKm, setItemWatchKm] = useState3("");
  const [itemWatchDays, setItemWatchDays] = useState3("");
  const [costWindowDays, setCostWindowDays] = useState3("");
  const [svcRunning, setSvcRunning] = useState3(null);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "cx-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const cars = data.cars;
  const s = data.settings;
  const addCar = async () => {
    setBusy(true);
    try {
      const c = await saveCar({ name, kind, initialOdometer: odo.trim() ? Number(odo) : 0, plate });
      setName("");
      setOdo("");
      setPlate("");
      await reload();
      showToast(`\u5DF2\u5EFA\u6863\u300C${c.name}\u300D`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const saveCarEdit = async (id) => {
    const prev = cars.find((c) => c.id === id);
    if (!prev) return;
    try {
      await saveCar({ name: editName, initialOdometer: editOdo.trim() ? Number(editOdo) : void 0 }, prev);
      setEditing(null);
      await reload();
      showToast("\u5DF2\u4FDD\u5B58");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const removeCar = async (id, cname) => {
    const own = {
      energies: data.energies.filter((e) => e.carId === id).length,
      items: data.items.filter((it) => it.carId === id).length,
      svcs: data.svcs.filter((x) => x.carId === id).length,
      docs: data.docs.filter((d) => d.carId === id).length
    };
    const total = own.energies + own.items + own.svcs + own.docs;
    const detail = total ? `\uFF08\u8865\u80FD ${own.energies} / \u517B\u62A4\u9879 ${own.items} / \u7EF4\u4FDD ${own.svcs} / \u8BC1\u4EF6 ${own.docs}\uFF09` : "";
    if (!window.confirm(`\u5220\u9664\u8F66\u8F86\u300C${cname}\u300D${detail}\uFF1F${total ? "\n\u8FD9\u4E9B\u8BB0\u5F55\u5C06\u4E00\u5E76\u5220\u9664\uFF0C\u4E0D\u53EF\u6062\u590D\uFF01" : ""}`)) return;
    try {
      const n = await deleteCar(id, true, data);
      await reload();
      showToast(`\u5DF2\u5220\u9664\u300C${cname}\u300D${n ? `\u53CA ${n} \u6761\u8BB0\u5F55` : ""}`);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const applySettings = async () => {
    try {
      await saveSettings({
        docWarnDays: docWarnDays.trim() ? Number(docWarnDays) : s.docWarnDays,
        itemWatchKm: itemWatchKm.trim() ? Number(itemWatchKm) : s.itemWatchKm,
        itemWatchDays: itemWatchDays.trim() ? Number(itemWatchDays) : s.itemWatchDays,
        costWindowDays: costWindowDays.trim() ? Number(costWindowDays) : s.costWindowDays
      });
      setDocWarnDays("");
      setItemWatchKm("");
      setItemWatchDays("");
      setCostWindowDays("");
      await reload();
      showToast("\u5DF2\u4FDD\u5B58\u53C2\u6570");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const doExport = () => {
    const text = exportAll2(data);
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chexia-export-${core5.dayKey(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3e3);
    } catch (_) {
      void navigator.clipboard?.writeText(text).then(() => showToast("\u5BFC\u51FA JSON \u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"));
      return;
    }
    showToast("\u5DF2\u5BFC\u51FA JSON\uFF08\u6D4F\u89C8\u5668\u4E0B\u8F7D\uFF09");
  };
  const checkSvc = async () => {
    try {
      const st = await serviceStatus(pluginId, SERVICE_ID);
      setSvcRunning(st ? st.running : null);
      showToast(st ? st.running ? "\u670D\u52A1\u8FD0\u884C\u4E2D" : `\u670D\u52A1\u672A\u8FD0\u884C${st.lastError ? `\uFF1A${st.lastError}` : ""}` : "\u670D\u52A1\u672A\u6CE8\u518C\uFF08\u91CD\u88C5\u63D2\u4EF6\u6216\u91CD\u542F\u5E94\u7528\uFF09");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const startSvc = async () => {
    try {
      await serviceStart(pluginId, SERVICE_ID);
      showToast("\u5DF2\u8BF7\u6C42\u542F\u52A8\u670D\u52A1\uFF0C\u51E0\u79D2\u540E\u5FC3\u8DF3\u53EF\u89C1");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "cx-root", style: { display: "block" }, children: [
    /* @__PURE__ */ jsx4("style", { children: css4 }),
    /* @__PURE__ */ jsxs4("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "cx-bar" }),
      "\u8F66\u8F86\u6863\u6848"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "cx-card", children: /* @__PURE__ */ jsxs4("div", { className: "cx-card-b", children: [
      cars.length === 0 && /* @__PURE__ */ jsx4("div", { className: "cx-empty", style: { padding: 12 }, children: "\u8FD8\u6CA1\u6709\u8F66\u8F86\u3002" }),
      cars.map((c) => /* @__PURE__ */ jsx4("div", { className: "st-car", children: editing === c.id ? /* @__PURE__ */ jsxs4(Fragment, { children: [
        /* @__PURE__ */ jsx4("input", { className: "cx-inp", style: { width: 110 }, value: editName, onChange: (e) => setEditName(e.target.value) }),
        /* @__PURE__ */ jsx4("input", { className: "cx-inp", style: { width: 84 }, inputMode: "decimal", value: editOdo, onChange: (e) => setEditOdo(e.target.value), placeholder: "\u5EFA\u6863\u91CC\u7A0B" }),
        /* @__PURE__ */ jsx4("button", { className: "cx-btn sm", onClick: () => saveCarEdit(c.id), children: "\u5B58" }),
        /* @__PURE__ */ jsx4("button", { className: "cx-btn sm ghost", onClick: () => setEditing(null), children: "\u53D6\u6D88" })
      ] }) : /* @__PURE__ */ jsxs4(Fragment, { children: [
        /* @__PURE__ */ jsxs4("span", { style: { minWidth: 0, flex: 1 }, children: [
          /* @__PURE__ */ jsx4("b", { children: c.name }),
          /* @__PURE__ */ jsxs4("span", { className: "cx-sub", children: [
            " ",
            core5.CAR_KIND_LABELS[c.kind],
            c.plate ? ` \xB7 ${c.plate}` : "",
            " \xB7 \u5EFA\u6863 ",
            core5.fmtNum(c.initialOdometer),
            " km"
          ] })
        ] }),
        /* @__PURE__ */ jsx4("button", { className: "cx-btn sm ghost", onClick: () => {
          setEditing(c.id);
          setEditName(c.name);
          setEditOdo(String(c.initialOdometer));
        }, children: "\u6539" }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            className: "st-del",
            title: "\u5220\u9664\u8F66\u8F86",
            onClick: () => removeCar(c.id, c.name),
            children: "\u2715"
          }
        )
      ] }) }, c.id)),
      /* @__PURE__ */ jsxs4("div", { className: "st-grid", style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u8F66\u8F86\u540D\u79F0" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", placeholder: "\u5BB6\u91CC\u7684\u767DSUV", value: name, onChange: (e) => setName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u7C7B\u578B" }),
          /* @__PURE__ */ jsxs4("select", { className: "cx-sel", value: kind, onChange: (e) => setKind(e.target.value), children: [
            /* @__PURE__ */ jsx4("option", { value: "fuel", children: "\u71C3\u6CB9" }),
            /* @__PURE__ */ jsx4("option", { value: "ev", children: "\u7EAF\u7535" }),
            /* @__PURE__ */ jsx4("option", { value: "phev", children: "\u63D2\u6DF7" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u5EFA\u6863\u91CC\u7A0B\uFF08km\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", inputMode: "decimal", placeholder: "45000", value: odo, onChange: (e) => setOdo(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u8F66\u724C\uFF08\u53EF\u7A7A\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", placeholder: "\u6D59A\xB712345", value: plate, onChange: (e) => setPlate(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx4("button", { className: "cx-btn", onClick: addCar, disabled: busy || !name.trim(), children: "\u6DFB\u52A0\u8F66\u8F86" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "cx-bar" }),
      "\u63D0\u9192\u4E0E\u7EDF\u8BA1\u53C2\u6570"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "cx-card", children: /* @__PURE__ */ jsxs4("div", { className: "cx-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "st-grid", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u8BC1\u4EF6\u63D0\u524D\u63D0\u9192\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", inputMode: "numeric", placeholder: String(s.docWarnDays), value: docWarnDays, onChange: (e) => setDocWarnDays(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u517B\u62A4\u300C\u5C06\u5230\u300D\u9608\u503C\uFF08km\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", inputMode: "numeric", placeholder: String(s.itemWatchKm), value: itemWatchKm, onChange: (e) => setItemWatchKm(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u517B\u62A4\u300C\u7559\u610F\u300D\u7A97\u53E3\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", inputMode: "numeric", placeholder: String(s.itemWatchDays), value: itemWatchDays, onChange: (e) => setItemWatchDays(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("label", { className: "cx-lbl", children: "\u8D39\u7528\u900F\u89C6\u7A97\u53E3\uFF08\u5929\uFF09" }),
          /* @__PURE__ */ jsx4("input", { className: "cx-inp", inputMode: "numeric", placeholder: String(s.costWindowDays), value: costWindowDays, onChange: (e) => setCostWindowDays(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx4("button", { className: "cx-btn", onClick: applySettings, children: "\u4FDD\u5B58\u53C2\u6570" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "cx-bar" }),
      "\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "cx-card", children: /* @__PURE__ */ jsxs4("div", { className: "cx-card-b", children: [
      /* @__PURE__ */ jsx4("button", { className: "cx-btn ghost", onClick: doExport, children: "\u5BFC\u51FA\u5168\u90E8\u6570\u636E\uFF08JSON\uFF09" }),
      /* @__PURE__ */ jsx4("div", { className: "st-note", children: "\u6570\u636E\u5168\u90E8\u5B58\u4E8E\u672C\u673A cap.kv\uFF08chexia.* \u952E\u7A7A\u95F4\uFF09\uFF0C\u96F6\u5916\u7F51\u8BF7\u6C42\u3001\u96F6\u8D26\u53F7\u3002\u5BFC\u51FA\u542B\u8F66\u8F86/\u8865\u80FD/\u517B\u62A4\u9879/\u7EF4\u4FDD/\u8BC1\u4EF6\u4E0E\u8BBE\u7F6E\uFF0C\u53EF\u5728\u4EFB\u610F\u7AEF\u5BFC\u5165\u67E5\u770B\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "cx-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "cx-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "cx-card", children: /* @__PURE__ */ jsxs4("div", { className: "cx-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "cx-row", children: /* @__PURE__ */ jsx4("span", { className: "cx-grow cx-sub", children: "\u670D\u52A1\u6BCF 15 \u79D2\u91CD\u7B97\u5168\u5BB6\u5FEB\u7167\uFF08chexia.snapshot\uFF09\uFF0C\u4E09\u7AEF\u9762\u677F\u4E0E AI \u8BFB\u4E00\u4E2A\u952E\u5373\u5F97\u3002\u670D\u52A1\u4E0D\u5728\u7EBF\u65F6\u9762\u677F\u81EA\u52A8\u672C\u5730\u73B0\u7B97\uFF0C\u529F\u80FD\u4E0D\u53D7\u5F71\u54CD\u3002" }) }),
      /* @__PURE__ */ jsxs4("div", { className: "cx-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("button", { className: "cx-btn sm ghost", onClick: checkSvc, children: "\u67E5\u72B6\u6001" }),
        /* @__PURE__ */ jsx4("button", { className: "cx-btn sm", onClick: startSvc, children: "\u542F\u52A8\u670D\u52A1" }),
        svcRunning != null && /* @__PURE__ */ jsx4("span", { className: `cx-tag ${svcRunning ? "green" : "yellow"}`, children: svcRunning ? "\u8FD0\u884C\u4E2D" : "\u672A\u8FD0\u884C" }),
        data.meta?.bridge && /* @__PURE__ */ jsxs4("span", { className: "cx-tag", children: [
          "\u6865 ",
          data.meta.bridge
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "st-note", style: { margin: "0 18px" }, children: [
      "\u63D2\u4EF6 id\uFF1A",
      pluginId,
      " \xB7 \u53EA\u505A\u8F66\u52A1\u8BB0\u5F55\u4E0E\u63D0\u9192\uFF0C\u4E0D\u6784\u6210\u7EF4\u4FEE/\u4FDD\u9669\u5EFA\u8BAE\u3002"
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css5 = `
.cx-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cx-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cx-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cx-body::-webkit-scrollbar{width:9px;height:9px}
.cx-body::-webkit-scrollbar-track{background:transparent}
.cx-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cx-page{max-width:560px;margin:0 auto}

/* \u5934\u90E8 */
.cx-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cx-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#F0883E,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.cx-tt{flex:1;min-width:0}
.cx-tt b{font-size:15px;display:block}
.cx-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.cx-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.cx-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.cx-dot.stale{background:#D29922}
.cx-dot.down{background:#F85149}
.cx-tabs{display:flex;gap:4px}
.cx-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.cx-tab:hover{color:#E6EAF2}
.cx-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cx-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.cx-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.cx-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F0883E,#58A6FF);flex-shrink:0}
.cx-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.cx-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.cx-card-b{padding:11px 13px}
.cx-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cx-btn:hover{filter:brightness(1.1)}
.cx-btn:disabled{opacity:.45;cursor:not-allowed}
.cx-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.cx-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.cx-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.cx-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.cx-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.cx-inp:focus{outline:none;border-color:#2b6cb0}
.cx-inp::placeholder{color:#4d5566}
.cx-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.cx-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.cx-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.cx-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.cx-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.cx-toast.bad{border-color:#54262c;color:#FF8A9A}
.cx-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.cx-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.cx-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.cx-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.cx-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.cx-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.cx-row{display:flex;align-items:center;gap:8px;min-width:0}
.cx-grow{flex:1;min-width:0}
.cx-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.cx-prog{height:6px;border-radius:3px;background:#0d1117;overflow:hidden;position:relative}
.cx-prog>i{display:block;height:100%;border-radius:3px}
.cx-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cx-num{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.cx-num small{font-size:10px;color:#8B95A7;font-weight:400;margin-left:2px}
`;
function ChexiaPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("overview");
  const [data, setData] = useState4(null);
  const [loadErr, setLoadErr] = useState4("");
  const [toast, setToast] = useState4(null);
  const cacheRef = useRef(newCache());
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadChexia(cacheRef.current);
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
  const heartbeat = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = data.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u542F\u52A8\u670D\u52A1\uFF09" };
    const age = Date.now() - last;
    if (age < 180 * 1e3) {
      const c = data.meta?.counts;
      return { cls: "ok", text: `\u8F66\u8F96\u5728\u7EBF \xB7 ${c ? `${c.cars}\u8F66 ${c.items}\u517B\u62A4\u9879 ${c.energies}\u8865\u80FD` : ""} \xB7 \u6865 ${data.meta?.bridge || "?"}` };
    }
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  const snap = data ? snapUsable(data.snap) ? data.snap : data.cars.length ? computeSnap(data, Date.now()) : null : null;
  const alertCount = snap ? snap.cars.reduce((n, c) => n + c.items.filter((i) => i.projection.state === "overdue" || i.projection.state === "due").length + c.docsDue.filter((d) => d.band === "expired").length, 0) + snap.personalDocs.filter((d) => d.band === "expired").length : 0;
  return /* @__PURE__ */ jsxs5("div", { className: "cx-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css5 }),
    /* @__PURE__ */ jsxs5("div", { className: "cx-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "cx-logo", children: "\u{1F697}" }),
      /* @__PURE__ */ jsxs5("div", { className: "cx-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u8F66\u8F96 \xB7 \u5BB6\u5EAD\u8F66\u8F86\u53F0\u8D26" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("i", { className: `cx-dot ${heartbeat.cls}` }),
          heartbeat.text
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "cx-tabs", children: [
        ["overview", "\u6982\u89C8"],
        ["energy", "\u8865\u80FD"],
        ["service", "\u8F66\u52A1"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs5("button", { className: `cx-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "overview" && alertCount > 0 && /* @__PURE__ */ jsx5("span", { className: "cx-badge", children: alertCount > 9 ? "9+" : alertCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "cx-body", children: /* @__PURE__ */ jsxs5("div", { className: "cx-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "cx-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx5(OverviewTab, { data, snap, reload, showToast, pluginId, onSendToChat }),
      tab === "energy" && /* @__PURE__ */ jsx5(EnergyTab, { data, reload, showToast, pluginId }),
      tab === "service" && /* @__PURE__ */ jsx5(ServiceTab, { data, reload, showToast, pluginId }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, reload, showToast, pluginId }),
      /* @__PURE__ */ jsx5("div", { className: "cx-foot", children: "\u8F66\u8F96\u662F\u5BB6\u5EAD\u8F66\u52A1\u8BB0\u5F55\u5DE5\u5177\uFF0C\u53EA\u505A\u8BB0\u5F55\u4E0E\u63D0\u9192\uFF0C\u4E0D\u6784\u6210\u7EF4\u4FEE/\u4FDD\u9669\u5EFA\u8BAE\uFF0C\u4E0D\u63A8\u8350\u4EFB\u4F55\u5546\u5BB6\u3002\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002" })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `cx-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
var src_default = ChexiaPanel;
export {
  src_default as default
};
