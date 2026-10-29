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
    var K2 = [
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
          const t1 = h + S1 + ch + K2[i] + w[i] | 0;
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
    var SHARD_CAP = 500;
    var MONTH_PREFIX2 = "duzhi.month.";
    var IMPORT_PREFIX2 = "duzhi.import.";
    var CAT_PREFIX2 = "duzhi.cat.";
    var RULES_KEY2 = "duzhi.rules";
    var MAX_FIELD = 120;
    var MAX_FILE_BYTES = 64 * 1024 * 1024;
    var DIRS = ["in", "out", "neutral"];
    var DIR_NAMES = { in: "\u6536\u5165", out: "\u652F\u51FA", neutral: "\u4E2D\u6027" };
    var CRC_TABLE = (() => {
      const t = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        t[n] = c;
      }
      return t;
    })();
    function crc32Update(crc, byte) {
      return crc >>> 8 ^ CRC_TABLE[(crc ^ byte) & 255];
    }
    function crc32Of(bytes) {
      let c = -1;
      for (let i = 0; i < bytes.length; i++) c = crc32Update(c, bytes[i]);
      return (c ^ -1) >>> 0;
    }
    function zipCryptoDecrypt(data, password) {
      const pw = [];
      const p = String(password || "");
      for (let i = 0; i < p.length; i++) {
        const c = p.charCodeAt(i);
        if (c < 128) pw.push(c);
        else pw.push(c & 255, c >> 8 & 255);
      }
      const keys = [305419896, 591751049, 878082192];
      const upd = (b) => {
        keys[0] = keys[0] >>> 8 ^ CRC_TABLE[(keys[0] ^ b) & 255];
        keys[1] = keys[1] + (keys[0] & 255) >>> 0;
        keys[1] = Math.imul(keys[1], 134775813) + 1 >>> 0;
        keys[2] = keys[2] >>> 8 ^ CRC_TABLE[(keys[2] ^ keys[1] >>> 24) & 255];
      };
      const dec = (c) => {
        const t = (keys[2] | 2) & 65535;
        return c ^ t * (t ^ 1) >>> 8 & 255;
      };
      for (let i = 0; i < pw.length; i++) upd(pw[i]);
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const plain = dec(data[i]) & 255;
        upd(plain);
        out[i] = plain;
      }
      return out;
    }
    var SIG_LOCAL = 67324752;
    var SIG_CD = 33639248;
    var SIG_EOCD = 101010256;
    function u16(b, i) {
      return b[i] | b[i + 1] << 8;
    }
    function u32(b, i) {
      return (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;
    }
    function decodeZipName(bytes) {
      try {
        const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (!/\uFFFD/.test(utf8)) return utf8;
      } catch (_) {
      }
      try {
        return new TextDecoder("gbk").decode(bytes);
      } catch (_) {
        return "";
      }
    }
    async function inflateRawAsync(bytes) {
      const zlib = typeof process !== "undefined" && process.getBuiltinModule ? process.getBuiltinModule("zlib") : null;
      if (zlib) {
        const out = zlib.inflateRawSync(bytes);
        return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      }
      if (typeof DecompressionStream !== "undefined") {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 deflate \u89E3\u538B\uFF1A\u8BF7\u5728\u7CFB\u7EDF\u91CC\u624B\u52A8\u89E3\u538B zip\uFF0C\u628A\u91CC\u9762\u7684 CSV \u62D6\u8FDB\u6765\u5373\u53EF");
    }
    async function unzip(bytes, { password } = {}) {
      if (bytes.length < 22) throw new Error("\u6587\u4EF6\u592A\u5C0F\uFF0C\u4E0D\u662F\u5408\u6CD5 zip");
      let eocd = -1;
      const floor = Math.max(0, bytes.length - 22 - 65535);
      for (let i = bytes.length - 22; i >= floor; i--) {
        if (u32(bytes, i) === SIG_EOCD) {
          eocd = i;
          break;
        }
      }
      if (eocd < 0) throw new Error("\u627E\u4E0D\u5230 zip \u4E2D\u592E\u76EE\u5F55\u7ED3\u5C3E\uFF08EOCD\uFF09\uFF0C\u6587\u4EF6\u53EF\u80FD\u635F\u574F\u6216\u4E0D\u662F zip");
      const totalEntries = u16(bytes, eocd + 10);
      const cdSize = u32(bytes, eocd + 12);
      const cdOffset = u32(bytes, eocd + 16);
      if (totalEntries === 65535 || cdOffset === 4294967295) {
        throw new Error("\u4E0D\u652F\u6301 zip64 \u683C\u5F0F\u7684\u538B\u7F29\u5305\uFF08\u8D26\u5355\u538B\u7F29\u5305\u4E0D\u4F1A\u51FA\u73B0\uFF1B\u8BF7\u624B\u52A8\u89E3\u538B\u540E\u62D6\u5165 CSV\uFF09");
      }
      const out = [];
      let p = cdOffset;
      const cdEnd = cdOffset + cdSize;
      for (let n = 0; n < totalEntries && p + 46 <= cdEnd; n++) {
        if (u32(bytes, p) !== SIG_CD) break;
        const flags = u16(bytes, p + 8);
        const method = u16(bytes, p + 10);
        const modTime = u16(bytes, p + 12);
        const crc = u32(bytes, p + 16);
        const compSize = u32(bytes, p + 20);
        const nameLen = u16(bytes, p + 28);
        const extraLen = u16(bytes, p + 30);
        const commentLen = u16(bytes, p + 32);
        const localOffset = u32(bytes, p + 42);
        const name = decodeZipName(bytes.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (method === 99) {
          throw new Error(`\u300C${name}\u300D\u4F7F\u7528 AES \u52A0\u5BC6\uFF0C\u672C\u63D2\u4EF6\u4E0D\u652F\u6301\uFF1A\u8BF7\u7528\u89E3\u538B\u8F6F\u4EF6\u624B\u52A8\u89E3\u538B\u540E\uFF0C\u628A CSV \u62D6\u8FDB\u6765`);
        }
        if (method !== 0 && method !== 8) {
          throw new Error(`\u300C${name}\u300D\u4F7F\u7528\u4E86\u4E0D\u652F\u6301\u7684\u538B\u7F29\u7B97\u6CD5\uFF08method=${method}\uFF09\uFF1A\u8BF7\u624B\u52A8\u89E3\u538B\u540E\u62D6\u5165 CSV`);
        }
        if (u32(bytes, localOffset) !== SIG_LOCAL) throw new Error(`\u300C${name}\u300D\u672C\u5730\u5934\u635F\u574F`);
        const lNameLen = u16(bytes, localOffset + 26);
        const lExtraLen = u16(bytes, localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        let data = bytes.slice(dataStart, dataStart + compSize);
        if (flags & 1) {
          if (!password) {
            throw new Error(`\u300C${name}\u300D\u5DF2\u52A0\u5BC6\uFF1A\u8BF7\u8F93\u5165\u5BFC\u51FA\u65F6\u5F97\u5230\u7684\u89E3\u538B\u5BC6\u7801\uFF08\u5FAE\u4FE1\u652F\u4ED8\u7684\u901A\u77E5\u6D88\u606F / \u652F\u4ED8\u5B9D\u90AE\u4EF6\u91CC\u53EF\u67E5\uFF09`);
          }
          const plain = zipCryptoDecrypt(data, password);
          const check = plain[11];
          if (check !== (crc >>> 24 & 255) && check !== (modTime >>> 8 & 255)) {
            throw new Error("\u89E3\u538B\u5BC6\u7801\u4E0D\u5BF9\uFF08\u5FAE\u4FE1\u8D26\u5355\u5BC6\u7801\u5728\u300C\u5FAE\u4FE1\u652F\u4ED8\u300D\u901A\u77E5\u6D88\u606F\u91CC\uFF1B\u652F\u4ED8\u5B9D\u5BC6\u7801\u5728\u4F60\u7533\u8BF7\u5BFC\u51FA\u65F6\u8BBE\u7F6E\uFF09");
          }
          data = plain.slice(12);
        }
        if (method === 8) data = await inflateRawAsync(data);
        out.push({ name, bytes: data, encrypted: !!(flags & 1) });
      }
      if (!out.length) throw new Error("\u538B\u7F29\u5305\u91CC\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u6761\u76EE");
      return out;
    }
    function tryDecode(bytes, enc, fatal) {
      try {
        const t = new TextDecoder(enc, { fatal }).decode(bytes);
        return fatal && /\uFFFD/.test(t) ? null : t;
      } catch (_) {
        return null;
      }
    }
    function decodeBillText(bytes) {
      const utf8 = tryDecode(bytes, "utf-8", true);
      const gbk = utf8 === null ? tryDecode(bytes, "gbk", false) : null;
      const cands = [];
      if (utf8 !== null) cands.push(utf8);
      if (gbk !== null && gbk !== utf8) cands.push(gbk);
      if (!cands.length) {
        throw new Error("\u65E0\u6CD5\u89E3\u7801\u6587\u4EF6\uFF08\u4E0D\u662F UTF-8 \u4E5F\u4E0D\u662F GBK \u6587\u672C\uFF09\uFF1A\u8BF7\u7528\u8BB0\u4E8B\u672C\u53E6\u5B58\u4E3A UTF-8 \u540E\u91CD\u8BD5");
      }
      for (const t of cands) {
        if (detectSource(t)) return t;
      }
      return cands[0];
    }
    function parseCsv(text) {
      const rows = [];
      let row = [];
      let field = "";
      let inQuotes = false;
      const s = text.replace(/^\uFEFF/, "");
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQuotes) {
          if (c === '"') {
            if (s[i + 1] === '"') {
              field += '"';
              i++;
            } else inQuotes = false;
          } else field += c;
        } else if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          row.push(field);
          field = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && s[i + 1] === "\n") i++;
          row.push(field);
          field = "";
          if (row.length > 1 || row[0] !== "") rows.push(row);
          row = [];
        } else {
          field += c;
        }
      }
      if (field !== "" || row.length) {
        row.push(field);
        if (row.length > 1 || row[0] !== "") rows.push(row);
      }
      return rows;
    }
    var normCell = (s) => String(s || "").trim().replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
    function findHeaderRow(rows, mustHave) {
      for (let i = 0; i < rows.length; i++) {
        const normed = rows[i].map(normCell);
        let hit = 0;
        for (const want of mustHave) {
          if (normed.includes(want)) hit++;
        }
        if (hit === mustHave.length) {
          const col = {};
          normed.forEach((name, at) => {
            if (name && !(name in col)) col[name] = at;
          });
          return { headerIdx: i, col };
        }
      }
      return null;
    }
    function moneyToFen(raw) {
      if (raw === null || raw === void 0) return null;
      let s = String(raw).replace(/[¥￥\s,，]/g, "").trim();
      if (!s || s.startsWith("-") || s.startsWith("+")) return null;
      const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
      if (!m) return null;
      const yuan = m[1];
      const cents = (m[2] || "").padEnd(2, "0");
      const v = Number(yuan) * 100 + Number(cents);
      if (!Number.isSafeInteger(v)) return null;
      return v;
    }
    function fenToYuan4(fen) {
      const n = Number(fen) || 0;
      const sign = n < 0 ? "-" : "";
      const abs = Math.abs(Math.round(n));
      return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
    }
    function normDate(raw) {
      if (!raw) return null;
      const s = String(raw).trim().replace("T", " ").replace(/\//g, "-");
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
      if (!m) return null;
      const pad = (x) => String(Number(x)).padStart(2, "0");
      const d = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
      if (Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return null;
      return `${d} ${pad(m[4] || 0)}:${pad(m[5] || 0)}:${pad(m[6] || 0)}`;
    }
    var monthKeyOf2 = (date) => date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "";
    var dayOf2 = (date) => date ? date.slice(0, 10) : "";
    function detectSource(text) {
      if (!text) return null;
      const head = text.slice(0, 4e3);
      if (head.includes("\u5FAE\u4FE1\u652F\u4ED8\u8D26\u5355\u660E\u7EC6") || head.includes("\u5FAE\u4FE1\u652F\u4ED8\u4EA4\u6613\u660E\u7EC6\u8BC1\u660E")) return "wechat";
      if (head.includes("\u652F\u4ED8\u5B9D") && (head.includes("\u4EA4\u6613\u8BB0\u5F55\u660E\u7EC6") || head.includes("\u4EA4\u6613\u6D41\u6C34") || head.includes("\u4EA4\u6613\u53F7"))) return "alipay";
      return null;
    }
    var WECHAT_COLS = ["\u4EA4\u6613\u65F6\u95F4", "\u4EA4\u6613\u7C7B\u578B", "\u4EA4\u6613\u5BF9\u65B9", "\u5546\u54C1", "\u6536/\u652F", "\u91D1\u989D(\u5143)", "\u4EA4\u6613\u5355\u53F7"];
    function parseWechatCsv(text) {
      const rows = parseCsv(text);
      const found = findHeaderRow(rows, WECHAT_COLS);
      if (!found) throw new Error("\u4E0D\u50CF\u5FAE\u4FE1\u8D26\u5355 CSV\uFF1A\u627E\u4E0D\u5230\u300C\u4EA4\u6613\u65F6\u95F4/\u91D1\u989D/\u4EA4\u6613\u5355\u53F7\u300D\u8868\u5934\u884C");
      const c = found.col;
      const out = [];
      for (let i = found.headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const date = normDate(r[c["\u4EA4\u6613\u65F6\u95F4"]]);
        const amountFen = moneyToFen(r[c["\u91D1\u989D(\u5143)"]]);
        if (!date || amountFen === null || amountFen <= 0) continue;
        const dirRaw = normCell(r[c["\u6536/\u652F"]]);
        const type = cut(r[c["\u4EA4\u6613\u7C7B\u578B"]]);
        let dir = "neutral";
        if (dirRaw === "\u6536\u5165") dir = "in";
        else if (dirRaw === "\u652F\u51FA") dir = "out";
        out.push({
          src: "wechat",
          date,
          dir,
          type,
          name: cut(r[c["\u4EA4\u6613\u5BF9\u65B9"]]),
          item: cut(r[c["\u5546\u54C1"]]),
          amountFen,
          refundFen: 0,
          status: cut(r[c["\u5F53\u524D\u72B6\u6001"]] || ""),
          method: cut(r[c["\u652F\u4ED8\u65B9\u5F0F"]] || ""),
          tradeNo: cut(r[c["\u4EA4\u6613\u5355\u53F7"]] || ""),
          mOrderNo: cut(r[c["\u5546\u6237\u5355\u53F7"]] || ""),
          note: cut(r[c["\u5907\u6CE8"]] || "")
        });
      }
      return out;
    }
    var ALIPAY_COLS = ["\u4EA4\u6613\u53F7", "\u4EA4\u6613\u521B\u5EFA\u65F6\u95F4", "\u4EA4\u6613\u5BF9\u65B9", "\u91D1\u989D(\u5143)", "\u6536/\u652F", "\u4EA4\u6613\u72B6\u6001"];
    function parseAlipayCsv(text) {
      let rows = parseCsv(text);
      let found = findHeaderRow(rows, ALIPAY_COLS);
      if (!found) {
        const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
        rows = lines.map((l) => l.split("|"));
        found = findHeaderRow(rows, ALIPAY_COLS);
        if (!found) throw new Error("\u4E0D\u50CF\u652F\u4ED8\u5B9D\u8D26\u5355 CSV\uFF1A\u627E\u4E0D\u5230\u300C\u4EA4\u6613\u53F7/\u91D1\u989D/\u4EA4\u6613\u72B6\u6001\u300D\u8868\u5934\u884C");
      }
      const c = found.col;
      const colAt = (name) => c[name] !== void 0 ? c[name] : -1;
      const iPay = colAt("\u4ED8\u6B3E\u65F6\u95F4");
      const iCreate = colAt("\u4EA4\u6613\u521B\u5EFA\u65F6\u95F4");
      const iType = colAt("\u7C7B\u578B");
      const iItem = colAt("\u5546\u54C1\u540D\u79F0");
      const iMethod = colAt("\u6536/\u4ED8\u6B3E\u65B9\u5F0F") >= 0 ? colAt("\u6536/\u4ED8\u6B3E\u65B9\u5F0F") : colAt("\u4ED8\u6B3E\u65B9\u5F0F") >= 0 ? colAt("\u4ED8\u6B3E\u65B9\u5F0F") : -1;
      const iRefund = colAt("\u6210\u529F\u9000\u6B3E(\u5143)");
      const iOrder = colAt("\u5546\u5BB6\u8BA2\u5355\u53F7");
      const iNote = colAt("\u5907\u6CE8");
      const out = [];
      for (let i = found.headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const date = normDate(iPay >= 0 && r[iPay] || (iCreate >= 0 ? r[iCreate] : ""));
        const amountFen = moneyToFen(c["\u91D1\u989D(\u5143)"] !== void 0 ? r[c["\u91D1\u989D(\u5143)"]] : "");
        if (!date || amountFen === null || amountFen <= 0) continue;
        const status = cut(r[c["\u4EA4\u6613\u72B6\u6001"]] || "");
        const dirRaw = normCell(r[c["\u6536/\u652F"]]);
        let dir = "neutral";
        if (dirRaw === "\u6536\u5165") dir = "in";
        else if (dirRaw === "\u652F\u51FA") dir = "out";
        if (/关闭|失败/.test(status)) dir = "neutral";
        const refundFen = iRefund >= 0 ? moneyToFen(r[iRefund]) || 0 : 0;
        out.push({
          src: "alipay",
          date,
          dir,
          type: cut(iType >= 0 ? r[iType] : ""),
          name: cut(r[c["\u4EA4\u6613\u5BF9\u65B9"]]),
          item: cut(iItem >= 0 ? r[iItem] : ""),
          amountFen,
          refundFen: Math.max(0, refundFen),
          status,
          method: cut(iMethod >= 0 ? r[iMethod] : ""),
          tradeNo: cut(r[c["\u4EA4\u6613\u53F7"]] || ""),
          mOrderNo: cut(iOrder >= 0 ? r[iOrder] : ""),
          note: cut(iNote >= 0 ? r[iNote] : "")
        });
      }
      return out;
    }
    function cut(s) {
      const t = String(s || "").trim();
      return t.length > MAX_FIELD ? t.slice(0, MAX_FIELD) : t;
    }
    function newImportId2(seed) {
      return sha256Hex(`duzhi-import|${seed || ""}|${Date.now()}|${Math.random()}`).slice(0, 12);
    }
    function isRefundRow3(t) {
      return t.src === "wechat" && /退款/.test(t.type || "");
    }
    function txnIdOf(t) {
      return sha256Hex(`${t.src}|${t.tradeNo}|${t.amountFen}|${t.date}|${t.dir}`).slice(0, 16);
    }
    function buildTxns2(rawRows, source, importId, at) {
      const txns = [];
      for (const r of rawRows) {
        const t = {
          id: "",
          src: r.src || source,
          tradeNo: r.tradeNo || "",
          mOrderNo: r.mOrderNo || "",
          date: r.date,
          name: r.name || "",
          item: r.item || "",
          type: r.type || "",
          dir: DIRS.includes(r.dir) ? r.dir : "neutral",
          amountFen: r.amountFen,
          refundFen: r.refundFen || 0,
          status: r.status || "",
          method: r.method || "",
          note: r.note || "",
          importId,
          at
        };
        if (isRefundRow3(t)) t.refundFen = t.amountFen;
        t.id = txnIdOf(t);
        txns.push(t);
      }
      return txns;
    }
    function looksZip(bytes) {
      return bytes && bytes.length > 4 && bytes[0] === 80 && bytes[1] === 75 && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
    }
    async function parseBillFile2(bytes, { password } = {}) {
      if (!bytes || !bytes.length) throw new Error("\u6587\u4EF6\u662F\u7A7A\u7684");
      if (bytes.length > MAX_FILE_BYTES) throw new Error("\u6587\u4EF6\u8D85\u8FC7 64MB \u4E0A\u9650\uFF0C\u7591\u4F3C\u62FF\u9519\u6587\u4EF6");
      let text;
      let csvName = "";
      if (looksZip(bytes)) {
        const entries = await unzip(bytes, { password });
        const csvs = entries.filter((e) => /\.(csv|txt)$/i.test(e.name));
        if (!csvs.length) {
          throw new Error(`\u538B\u7F29\u5305\u91CC\u6CA1\u6709 CSV/TXT \u8D26\u5355\uFF08\u53EA\u6709\uFF1A${entries.slice(0, 3).map((e) => e.name).join("\u3001")}\u2026\uFF09\uFF1A\u8BF7\u68C0\u67E5\u662F\u5426\u62FF\u5BF9\u4E86\u6587\u4EF6`);
        }
        csvs.sort((a, b) => b.bytes.length - a.bytes.length);
        csvName = csvs[0].name;
        text = decodeBillText(csvs[0].bytes);
      } else {
        text = decodeBillText(bytes);
      }
      const source = detectSource(text);
      if (!source) {
        throw new Error("\u8BA4\u4E0D\u51FA\u8FD9\u662F\u5FAE\u4FE1\u8FD8\u662F\u652F\u4ED8\u5B9D\u8D26\u5355\uFF08\u6CA1\u6709\u8D26\u5355\u62AC\u5934\uFF09\uFF1A\u8BF7\u786E\u8BA4\u5BFC\u51FA\u7684\u662F\u300C\u5FAE\u4FE1\u652F\u4ED8\u8D26\u5355\u660E\u7EC6\u300D\u6216\u300C\u652F\u4ED8\u5B9D\u4EA4\u6613\u8BB0\u5F55\u660E\u7EC6\u300D\u7684 CSV");
      }
      const rows = source === "wechat" ? parseWechatCsv(text) : parseAlipayCsv(text);
      if (!rows.length) {
        throw new Error(`\u8D26\u5355\u5934\u8BA4\u51FA\u6765\u4E86\uFF08${source === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D"}\uFF09\uFF0C\u4F46\u6CA1\u6709\u89E3\u6790\u51FA\u4EFB\u4F55\u4E00\u7B14\u4EA4\u6613\uFF1A\u6587\u4EF6\u53EF\u80FD\u53EA\u6709\u8BF4\u660E\u9875`);
      }
      return { source, rows, csvName };
    }
    var monthKeyBase2 = (ym) => `${MONTH_PREFIX2}${ym}`;
    var monthShardKey2 = (ym, part) => part <= 1 ? monthKeyBase2(ym) : `${MONTH_PREFIX2}${ym}#${part}`;
    function monthShardKeys2(allKeys, ym) {
      const base = monthKeyBase2(ym);
      const withPrefix = allKeys.filter((k) => k === base || k.startsWith(`${base}#`)).map((k) => {
        const n = k === base ? 1 : Number(k.slice(base.length + 1));
        return { k, part: Number.isFinite(n) ? n : 1 };
      });
      withPrefix.sort((a, b) => a.part - b.part);
      return withPrefix.map((x) => x.k);
    }
    function groupByMonth2(txns) {
      const map = /* @__PURE__ */ new Map();
      for (const t of txns) {
        const ym = monthKeyOf2(t.date);
        if (!ym) continue;
        if (!map.has(ym)) map.set(ym, []);
        map.get(ym).push(t);
      }
      return [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([ym, list]) => ({ ym, txns: list }));
    }
    function mergeTxns2(existing, incoming) {
      const seen = new Set(existing.map((t) => t.id));
      const added = [];
      for (const t of incoming) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        added.push(t);
      }
      return { all: existing.concat(added), added, dup: incoming.length - added.length };
    }
    function packShards2(txns) {
      const parts = [];
      for (let i = 0; i < txns.length; i += SHARD_CAP) {
        parts.push({ part: parts.length + 1, txns: txns.slice(i, i + SHARD_CAP) });
      }
      if (!parts.length) parts.push({ part: 1, txns: [] });
      return parts;
    }
    function removeByImport2(txns, importId) {
      const keep = txns.filter((t) => t.importId !== importId);
      return { keep, removed: txns.length - keep.length };
    }
    var DEFAULT_RULES2 = [
      { kw: "\u745E\u5E78", cat: "\u5496\u5561\u5976\u8336" },
      { kw: "\u661F\u5DF4\u514B", cat: "\u5496\u5561\u5976\u8336" },
      { kw: "\u871C\u96EA", cat: "\u5496\u5561\u5976\u8336" },
      { kw: "\u559C\u8336", cat: "\u5496\u5561\u5976\u8336" },
      { kw: "\u5E93\u8FEA", cat: "\u5496\u5561\u5976\u8336" },
      { kw: "\u5496\u5561", cat: "\u5496\u5561\u5976\u8336" },
      { kw: "\u5916\u5356", cat: "\u9910\u996E" },
      { kw: "\u7F8E\u56E2", cat: "\u9910\u996E" },
      { kw: "\u997F\u4E86\u4E48", cat: "\u9910\u996E" },
      { kw: "\u9910\u5385", cat: "\u9910\u996E" },
      { kw: "\u996D\u5E97", cat: "\u9910\u996E" },
      { kw: "\u5C0F\u5403", cat: "\u9910\u996E" },
      { kw: "\u70E7\u70E4", cat: "\u9910\u996E" },
      { kw: "\u76D2\u9A6C", cat: "\u4E70\u83DC" },
      { kw: "\u53EE\u549A", cat: "\u4E70\u83DC" },
      { kw: "\u83DC\u5E02\u573A", cat: "\u4E70\u83DC" },
      { kw: "\u751F\u9C9C", cat: "\u4E70\u83DC" },
      { kw: "\u8D85\u5E02", cat: "\u4E70\u83DC" },
      { kw: "\u6EF4\u6EF4", cat: "\u4EA4\u901A" },
      { kw: "\u6253\u8F66", cat: "\u4EA4\u901A" },
      { kw: "\u5730\u94C1", cat: "\u4EA4\u901A" },
      { kw: "\u516C\u4EA4", cat: "\u4EA4\u901A" },
      { kw: "12306", cat: "\u4EA4\u901A" },
      { kw: "\u94C1\u8DEF", cat: "\u4EA4\u901A" },
      { kw: "\u673A\u7968", cat: "\u4EA4\u901A" },
      { kw: "\u822A\u7A7A", cat: "\u4EA4\u901A" },
      { kw: "\u52A0\u6CB9", cat: "\u4EA4\u901A" },
      { kw: "\u505C\u8F66", cat: "\u4EA4\u901A" },
      { kw: "\u5355\u8F66", cat: "\u4EA4\u901A" },
      { kw: "\u6DD8\u5B9D", cat: "\u7F51\u8D2D" },
      { kw: "\u5929\u732B", cat: "\u7F51\u8D2D" },
      { kw: "\u4EAC\u4E1C", cat: "\u7F51\u8D2D" },
      { kw: "\u62FC\u591A\u591A", cat: "\u7F51\u8D2D" },
      { kw: "\u552F\u54C1\u4F1A", cat: "\u7F51\u8D2D" },
      { kw: "\u8BDD\u8D39", cat: "\u901A\u8BAF" },
      { kw: "\u5BBD\u5E26", cat: "\u901A\u8BAF" },
      { kw: "\u8054\u901A", cat: "\u901A\u8BAF" },
      { kw: "\u7535\u4FE1", cat: "\u901A\u8BAF" },
      { kw: "\u6C34\u8D39", cat: "\u5C45\u5BB6\u6C34\u7535" },
      { kw: "\u7535\u8D39", cat: "\u5C45\u5BB6\u6C34\u7535" },
      { kw: "\u71C3\u6C14", cat: "\u5C45\u5BB6\u6C34\u7535" },
      { kw: "\u7269\u4E1A", cat: "\u5C45\u5BB6\u6C34\u7535" },
      { kw: "\u623F\u79DF", cat: "\u5C45\u5BB6\u6C34\u7535" },
      { kw: "\u533B\u9662", cat: "\u533B\u7597" },
      { kw: "\u836F\u5E97", cat: "\u533B\u7597" },
      { kw: "\u836F\u623F", cat: "\u533B\u7597" },
      { kw: "\u6302\u53F7", cat: "\u533B\u7597" },
      { kw: "\u7535\u5F71", cat: "\u6587\u5A31" },
      { kw: "\u6E38\u620F", cat: "\u6587\u5A31" },
      { kw: "\u89C6\u9891\u4F1A\u5458", cat: "\u6587\u5A31" },
      { kw: "\u97F3\u4E50", cat: "\u6587\u5A31" },
      { kw: "KTV", cat: "\u6587\u5A31" },
      { kw: "\u8BFE\u7A0B", cat: "\u5B66\u4E60" },
      { kw: "\u5B66\u8D39", cat: "\u5B66\u4E60" },
      { kw: "\u57F9\u8BAD", cat: "\u5B66\u4E60" },
      { kw: "\u4E66\u5E97", cat: "\u5B66\u4E60" },
      { kw: "\u7EA2\u5305", cat: "\u4EBA\u60C5\u5F80\u6765" },
      { kw: "\u8F6C\u8D26", cat: "\u4EBA\u60C5\u5F80\u6765" },
      { kw: "\u4EB2\u5C5E\u5361", cat: "\u4EBA\u60C5\u5F80\u6765" },
      { kw: "\u4F59\u989D\u5B9D", cat: "\u7406\u8D22" },
      { kw: "\u96F6\u94B1\u901A", cat: "\u7406\u8D22" },
      { kw: "\u57FA\u91D1", cat: "\u7406\u8D22" },
      { kw: "\u7406\u8D22", cat: "\u7406\u8D22" }
    ];
    function normalizeRules2(raw) {
      const src = raw && Array.isArray(raw.rules) ? raw.rules : [];
      const seen = /* @__PURE__ */ new Set();
      const rules = [];
      for (const r of src) {
        if (!r || typeof r !== "object") continue;
        const kw = cut(r.kw);
        const cat = cut(r.cat);
        if (!kw || !cat || seen.has(kw)) continue;
        seen.add(kw);
        rules.push({ kw, cat });
      }
      return { rules: rules.slice(0, 200) };
    }
    function matchRule(t, rules) {
      const hay = `${t.name}
${t.item}
${t.type}`;
      for (const r of rules) {
        if (hay.includes(r.kw)) return r.cat;
      }
      return null;
    }
    function categorize2(t, userRules, overrides) {
      const ov = overrides && typeof overrides === "object" ? overrides[t.id] : null;
      if (ov && typeof ov.cat === "string" && ov.cat) return ov.cat;
      const u = matchRule(t, userRules || []);
      if (u) return u;
      const d = matchRule(t, DEFAULT_RULES2);
      return d || "\u5176\u4ED6";
    }
    function aggregate2(txns, { userRules, overrides, limitMerchants = 8 } = {}) {
      const monthMap = /* @__PURE__ */ new Map();
      const catMap = /* @__PURE__ */ new Map();
      const merMap = /* @__PURE__ */ new Map();
      const totals = { inFen: 0, outFen: 0, refundFen: 0, netFen: 0, count: txns.length };
      let neutralCount = 0;
      for (const t of txns) {
        const ym = monthKeyOf2(t.date);
        const refund = isRefundRow3(t) ? t.amountFen : t.refundFen || 0;
        const outPart = t.dir === "out" && !isRefundRow3(t) ? t.amountFen : 0;
        const inPart = t.dir === "in" && !isRefundRow3(t) ? t.amountFen : 0;
        if (t.dir === "neutral" && !isRefundRow3(t)) neutralCount++;
        if (ym) {
          if (!monthMap.has(ym)) monthMap.set(ym, { ym, inFen: 0, outFen: 0, refundFen: 0, netFen: 0, count: 0 });
          const m = monthMap.get(ym);
          m.inFen += inPart;
          m.outFen += outPart;
          m.refundFen += refund;
          m.netFen = m.inFen - m.outFen + m.refundFen;
          m.count++;
        }
        totals.inFen += inPart;
        totals.outFen += outPart;
        totals.refundFen += refund;
        if (outPart > 0) {
          const cat = categorize2(t, userRules, overrides);
          if (!catMap.has(cat)) catMap.set(cat, { cat, outFen: 0, count: 0 });
          const c = catMap.get(cat);
          c.outFen += outPart;
          c.count++;
          const mer = t.name || "(\u672A\u77E5\u5546\u6237)";
          if (!merMap.has(mer)) merMap.set(mer, { name: mer, outFen: 0, count: 0 });
          const m = merMap.get(mer);
          m.outFen += outPart;
          m.count++;
        }
      }
      totals.netFen = totals.inFen - totals.outFen + totals.refundFen;
      const months = [...monthMap.values()].sort((a, b) => a.ym < b.ym ? -1 : 1);
      const categories = [...catMap.values()].sort((a, b) => b.outFen - a.outFen);
      const merchants = [...merMap.values()].sort((a, b) => b.outFen - a.outFen).slice(0, limitMerchants);
      return { months, categories, merchants, totals, neutralCount };
    }
    function filterTxns2(txns, q) {
      const kw = (q.keyword || "").trim().toLowerCase();
      const min = Number.isFinite(q.minFen) ? q.minFen : null;
      const max = Number.isFinite(q.maxFen) ? q.maxFen : null;
      const from = dayOf2(q.from || "");
      const to = dayOf2(q.to || "");
      return txns.filter((t) => {
        if (q.dir && DIRS.includes(q.dir) && t.dir !== q.dir) return false;
        if (q.month && monthKeyOf2(t.date) !== q.month) return false;
        if (from && dayOf2(t.date) < from) return false;
        if (to && dayOf2(t.date) > to) return false;
        if (q.category) {
          if (categorize2(t, q.userRules, q.overrides) !== q.category) return false;
        }
        if (min !== null && t.amountFen < min) return false;
        if (max !== null && t.amountFen > max) return false;
        if (kw) {
          const hay = `${t.name}
${t.item}
${t.type}
${t.note}
${t.method}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
    }
    var CSV_COLS = ["date", "dir", "amountFen", "category", "name", "item", "type", "status", "method", "src", "tradeNo", "note"];
    function csvEscape(s) {
      const t = String(s ?? "");
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }
    function exportCsv2(txns, userRules, overrides) {
      const head = ["\u65F6\u95F4", "\u65B9\u5411", "\u91D1\u989D(\u5143)", "\u5206\u7C7B", "\u4EA4\u6613\u5BF9\u65B9", "\u5546\u54C1", "\u7C7B\u578B", "\u72B6\u6001", "\u652F\u4ED8\u65B9\u5F0F", "\u6765\u6E90", "\u5355\u53F7", "\u5907\u6CE8"];
      const lines = [head.join(",")];
      for (const t of txns) {
        const row = {
          date: t.date,
          dir: DIR_NAMES[t.dir] || t.dir,
          amountFen: fenToYuan4(t.amountFen),
          category: categorize2(t, userRules, overrides),
          name: t.name,
          item: t.item,
          type: t.type,
          status: t.status,
          method: t.method,
          src: t.src,
          tradeNo: t.tradeNo,
          note: t.note
        };
        lines.push(CSV_COLS.map((k) => csvEscape(row[k])).join(","));
      }
      return lines.join("\r\n");
    }
    module.exports = {
      SHARD_CAP,
      MONTH_PREFIX: MONTH_PREFIX2,
      IMPORT_PREFIX: IMPORT_PREFIX2,
      CAT_PREFIX: CAT_PREFIX2,
      RULES_KEY: RULES_KEY2,
      DIRS,
      DIR_NAMES,
      DEFAULT_RULES: DEFAULT_RULES2,
      MAX_FILE_BYTES,
      crc32Of,
      zipCryptoDecrypt,
      unzip,
      inflateRawAsync,
      decodeBillText,
      parseCsv,
      findHeaderRow,
      detectSource,
      moneyToFen,
      fenToYuan: fenToYuan4,
      normDate,
      monthKeyOf: monthKeyOf2,
      dayOf: dayOf2,
      newImportId: newImportId2,
      parseWechatCsv,
      parseAlipayCsv,
      parseBillFile: parseBillFile2,
      isRefundRow: isRefundRow3,
      buildTxns: buildTxns2,
      txnIdOf,
      groupByMonth: groupByMonth2,
      mergeTxns: mergeTxns2,
      packShards: packShards2,
      monthShardKeys: monthShardKeys2,
      monthKeyBase: monthKeyBase2,
      monthShardKey: monthShardKey2,
      removeByImport: removeByImport2,
      normalizeRules: normalizeRules2,
      categorize: categorize2,
      matchRule,
      aggregate: aggregate2,
      filterTxns: filterTxns2,
      exportCsv: exportCsv2,
      csvEscape
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useMemo as useMemo3, useRef as useRef2, useState as useState5 } from "react";

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
var PREFIX = "duzhi.";
var K = {
  rules: core.RULES_KEY,
  monthBase: (ym) => core.monthKeyBase(ym),
  monthShard: (ym, part) => core.monthShardKey(ym, part),
  import: (id) => `${core.IMPORT_PREFIX}${id}`,
  importPrefix: core.IMPORT_PREFIX,
  cat: (txnId) => `${core.CAT_PREFIX}${txnId}`,
  catPrefix: core.CAT_PREFIX
};
function newCache() {
  return { knownKeys: null, fullAt: 0, vals: /* @__PURE__ */ new Map() };
}
var FULL_REFRESH_MS = 90 * 1e3;
var ENTITY_PREFIXES = [core.MONTH_PREFIX, core.IMPORT_PREFIX, core.CAT_PREFIX];
async function loadDuizhi(cache) {
  const keys = await kvKeys();
  const now = Date.now();
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS;
  if (full) {
    cache.vals.clear();
    cache.fullAt = now;
  }
  const keySet = new Set(keys);
  for (const k of [...cache.vals.keys()]) {
    if (!keySet.has(k)) cache.vals.delete(k);
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)));
  const todo = entityKeys.filter((k) => full || !cache.vals.has(k));
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet(k).catch(() => null);
      return { k, v };
    }));
    for (const { k, v } of fetched) {
      if (v && typeof v === "object") cache.vals.set(k, v);
      else if (!v) cache.vals.delete(k);
    }
  }
  cache.knownKeys = keySet;
  const byYm = /* @__PURE__ */ new Map();
  for (const k of entityKeys) {
    if (!k.startsWith(core.MONTH_PREFIX)) continue;
    const v = cache.vals.get(k);
    if (!v || !Array.isArray(v.txns)) continue;
    const rest = k.slice(core.MONTH_PREFIX.length);
    const ym = rest.includes("#") ? rest.slice(0, rest.indexOf("#")) : rest;
    if (!byYm.has(ym)) byYm.set(ym, []);
    for (const t of v.txns) {
      if (t && typeof t.id === "string" && typeof t.amountFen === "number" && core.monthKeyOf(t.date) === ym) {
        byYm.get(ym).push(t);
      }
    }
  }
  const txns = [];
  for (const [, list] of byYm) {
    const seen = /* @__PURE__ */ new Set();
    for (const t of list) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      txns.push(t);
    }
  }
  txns.sort((a, b) => a.date < b.date ? -1 : 1);
  const imports = [...cache.vals.entries()].filter(([k]) => k.startsWith(K.importPrefix)).map(([, v]) => v).filter((v) => v && typeof v.id === "string").sort((a, b) => a.at < b.at ? 1 : -1);
  const overrides = {};
  for (const [k, v] of cache.vals.entries()) {
    if (k.startsWith(K.catPrefix) && v && typeof v.cat === "string") {
      overrides[k.slice(K.catPrefix.length)] = v;
    }
  }
  const rulesRaw = await kvGet(K.rules).catch(() => null);
  const rules = core.normalizeRules(rulesRaw).rules;
  return { txns, imports, rules, overrides };
}
async function fileToBytes(file) {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result));
    fr.onerror = () => reject(new Error("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25"));
    fr.readAsArrayBuffer(file);
  });
}
async function previewImport(file, password) {
  const bytes = await fileToBytes(file);
  const parsed = await core.parseBillFile(bytes, { password });
  const txns = core.buildTxns(parsed.rows, parsed.source, "preview", (/* @__PURE__ */ new Date()).toISOString());
  const sums = txns.reduce((acc, t) => {
    if (core.isRefundRow(t)) acc.refundFen += t.amountFen;
    else if (t.dir === "in") acc.inFen += t.amountFen;
    else if (t.dir === "out") acc.outFen += t.amountFen;
    return acc;
  }, { inFen: 0, outFen: 0, refundFen: 0 });
  const dates = txns.map((t) => core.dayOf(t.date)).sort();
  return {
    source: parsed.source,
    rows: txns.length,
    span: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "",
    inFen: sums.inFen,
    outFen: sums.outFen,
    refundFen: sums.refundFen,
    csvName: parsed.csvName || "",
    fileName: file.name
  };
}
async function confirmImport(cache, file, password) {
  const bytes = await fileToBytes(file);
  const parsed = await core.parseBillFile(bytes, { password });
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const importId = core.newImportId(`${file.name}|${file.size}`);
  const txns = core.buildTxns(parsed.rows, parsed.source, importId, at);
  const allKeys = await kvKeys();
  const byMonth = core.groupByMonth(txns);
  let added = 0;
  let dup = 0;
  const fresh = [];
  for (const { ym, txns: incoming } of byMonth) {
    const existing = await readMonthTxns(allKeys, ym);
    const merged = core.mergeTxns(existing, incoming);
    await writeMonthShards(allKeys, ym, merged.all);
    added += merged.added.length;
    dup += merged.dup;
    fresh.push(...merged.added);
  }
  if (added === 0) {
    throw new Error(`\u5168\u90E8 ${txns.length} \u7B14\u90FD\u4E0E\u5DF2\u6709\u8BB0\u5F55\u91CD\u590D\uFF0C\u6CA1\u6709\u5199\u5165\u4EFB\u4F55\u65B0\u6570\u636E`);
  }
  const sums = fresh.reduce((acc, t) => {
    if (core.isRefundRow(t)) acc.refundFen += t.amountFen;
    else if (t.dir === "in") acc.inFen += t.amountFen;
    else if (t.dir === "out") acc.outFen += t.amountFen;
    return acc;
  }, { inFen: 0, outFen: 0, refundFen: 0 });
  const dates = fresh.map((t) => core.dayOf(t.date)).sort();
  const batch = {
    id: importId,
    src: parsed.source,
    file: file.name,
    csvName: parsed.csvName || "",
    rows: txns.length,
    newCount: added,
    dupCount: dup,
    inFen: sums.inFen,
    outFen: sums.outFen,
    refundFen: sums.refundFen,
    span: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "",
    at
  };
  await kvSet(K.import(importId), batch);
  cache.knownKeys = null;
  return batch;
}
async function readMonthTxns(allKeys, ym) {
  const shardKeys = core.monthShardKeys(allKeys, ym);
  const txns = [];
  for (const k of shardKeys) {
    const v = await kvGet(k).catch(() => null);
    if (v && Array.isArray(v.txns)) {
      for (const t of v.txns) {
        if (t && typeof t.id === "string" && typeof t.amountFen === "number") txns.push(t);
      }
    }
  }
  return txns;
}
async function writeMonthShards(allKeys, ym, txns) {
  const shards = core.packShards(txns);
  const oldKeys = core.monthShardKeys(allKeys, ym);
  for (let i = shards.length; i < oldKeys.length; i++) await kvDel(oldKeys[i]);
  for (const s of shards) {
    await kvSet(K.monthShard(ym, s.part), { v: 1, part: s.part, txns: s.txns });
  }
}
async function forgetImport(cache, importId) {
  const allKeys = await kvKeys();
  const batchKeys = allKeys.filter((k) => k.startsWith(core.MONTH_PREFIX));
  const yms = [...new Set(batchKeys.map((k) => {
    const rest = k.slice(core.MONTH_PREFIX.length);
    return rest.includes("#") ? rest.slice(0, rest.indexOf("#")) : rest;
  }))];
  let removed = 0;
  const removedIds = [];
  for (const ym of yms) {
    const txns = await readMonthTxns(allKeys, ym);
    const gone = txns.filter((t) => t.importId === importId);
    if (gone.length) {
      const r = core.removeByImport(txns, importId);
      await writeMonthShards(allKeys, ym, r.keep);
      removed += r.removed;
      for (const t of gone) removedIds.push(t.id);
    }
  }
  await kvDel(K.import(importId));
  for (const id of removedIds) await kvDel(K.cat(id)).catch(() => {
  });
  cache.knownKeys = null;
  return removed;
}
async function saveOverride(cache, txnId, cat) {
  const c = cat.trim();
  if (!c) throw new Error("\u5206\u7C7B\u540D\u4E0D\u80FD\u4E3A\u7A7A");
  await kvSet(K.cat(txnId), { cat: c });
  cache.knownKeys = null;
}
async function saveRules(rules) {
  const norm = core.normalizeRules({ rules });
  await kvSet(K.rules, norm);
  return norm.rules;
}
function aggregateOf(data, month) {
  const scoped = month ? data.txns.filter((t) => core.monthKeyOf(t.date) === month) : data.txns;
  return core.aggregate(scoped, { userRules: data.rules, overrides: data.overrides });
}
function filterTxnsOf(data, q) {
  return core.filterTxns(data.txns, { ...q, userRules: data.rules, overrides: data.overrides });
}
function exportCsvOf(data) {
  return core.exportCsv(data.txns, data.rules, data.overrides);
}
function exportJsonOf(data) {
  return JSON.stringify({
    kind: "duzhi-export",
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    txns: data.txns,
    imports: data.imports,
    rules: data.rules,
    overrides: data.overrides
  }, null, 2);
}
function downloadText(name, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2e3);
}
async function wipeAll(cache) {
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith(PREFIX));
  for (const k of mine) await kvDel(k).catch(() => {
  });
  cache.knownKeys = null;
  return mine.length;
}

// src/ImportTab.tsx
var core2 = __toESM(require_core());
import { useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function fmtYuan(fen) {
  return core2.fenToYuan(Math.round(Number(fen) || 0));
}
function ImportTab({ data, cache, reload, showToast }) {
  const [over, setOver] = useState(false);
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState(null);
  const [parseErr, setParseErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const parse = async (file, pw) => {
    fileRef.current = file;
    setParseErr("");
    setPreview(null);
    setBusy(true);
    try {
      const p = await previewImport(file, pw || void 0);
      setPreview(p);
    } catch (e) {
      setParseErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const onFiles = (files) => {
    const f = files && files[0];
    if (!f) return;
    void parse(f, password);
  };
  const doImport = async () => {
    const file = fileRef.current;
    if (!file) return;
    setBusy(true);
    try {
      const batch = await confirmImport(cache, file, password || void 0);
      setPreview(null);
      fileRef.current = null;
      showToast(`\u5DF2\u5165\u5E93 ${batch.newCount} \u7B14${batch.dupCount ? `\uFF0C\u8DF3\u8FC7\u91CD\u590D ${batch.dupCount} \u7B14` : ""}`);
      await reload();
    } catch (e) {
      const msg = e.message;
      setParseErr(msg);
      showToast(msg, true);
    } finally {
      setBusy(false);
    }
  };
  const doForget = async (importId) => {
    if (confirmForget !== importId) {
      setConfirmForget(importId);
      setTimeout(() => setConfirmForget((cur) => cur === importId ? null : cur), 4e3);
      return;
    }
    setConfirmForget(null);
    try {
      const n = await forgetImport(cache, importId);
      showToast(`\u5DF2\u64A4\u9500\u8BE5\u6279\u6B21\uFF08\u79FB\u9664 ${n} \u7B14\uFF09`);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: `dz-drop ${over ? "over" : ""}`,
        onClick: () => inputRef.current?.click(),
        onDragOver: (e) => {
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e) => {
          e.preventDefault();
          setOver(false);
          onFiles(e.dataTransfer.files);
        },
        children: [
          "\u628A\u5FAE\u4FE1 / \u652F\u4ED8\u5B9D\u8D26\u5355\u6587\u4EF6\u62D6\u5230\u8FD9\u91CC\uFF0C\u6216\u70B9\u51FB\u9009\u62E9\u6587\u4EF6",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("span", { className: "dz-sub", children: "\u652F\u6301\u90AE\u7BB1\u4E0B\u8F7D\u7684 zip\uFF08\u52A0\u5BC6\u9700\u8F93\u89E3\u538B\u5BC6\u7801\uFF09\u6216\u5DF2\u89E3\u538B\u7684 CSV \xB7 \u89E3\u6790\u5728\u672C\u673A\u5B8C\u6210\uFF0C\u4E0D\u4E0A\u4F20\u4EFB\u4F55\u5185\u5BB9" })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref: inputRef,
        type: "file",
        accept: ".zip,.csv,.txt",
        style: { display: "none" },
        "data-testid": "dz-file-input",
        onChange: (e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "dz-card", children: /* @__PURE__ */ jsxs("div", { className: "dz-card-b", children: [
      /* @__PURE__ */ jsx("label", { className: "dz-lbl", htmlFor: "dz-pw", children: "zip \u89E3\u538B\u5BC6\u7801\uFF08\u53EF\u9009\uFF1B\u5FAE\u4FE1\u8D26\u5355\u5BC6\u7801\u5728\u300C\u5FAE\u4FE1\u652F\u4ED8\u300D\u901A\u77E5\u6D88\u606F\u91CC\uFF09" }),
      /* @__PURE__ */ jsxs("div", { className: "dz-row", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "dz-pw",
            className: "dz-inp dz-grow",
            type: "password",
            placeholder: "\u4EC5\u52A0\u5BC6 zip \u9700\u8981\uFF1B\u5BC6\u7801\u53EA\u5728\u672C\u6B21\u5BFC\u5165\u7684\u5185\u5B58\u91CC\u7528\u4E00\u6B21",
            value: password,
            onChange: (e) => setPassword(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "dz-btn ghost", disabled: !fileRef.current || busy, onClick: () => {
          if (fileRef.current) void parse(fileRef.current, password);
        }, children: "\u7528\u6B64\u5BC6\u7801\u91CD\u8BD5" })
      ] })
    ] }) }),
    parseErr && /* @__PURE__ */ jsxs("div", { className: "dz-err", children: [
      "\u89E3\u6790\u5931\u8D25\uFF1A",
      parseErr
    ] }),
    busy && /* @__PURE__ */ jsx("div", { className: "dz-empty", children: "\u89E3\u6790\u4E2D\u2026\uFF08\u5927\u6587\u4EF6\u53EF\u80FD\u8981\u51E0\u79D2\uFF09" }),
    preview && /* @__PURE__ */ jsxs("div", { className: "dz-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "dz-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "dz-bar" }),
        "\u5BFC\u5165\u9884\u89C8",
        /* @__PURE__ */ jsx("button", { className: "dz-hint", onClick: () => {
          setPreview(null);
          fileRef.current = null;
        }, children: "\u53D6\u6D88" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dz-card-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "dz-row", style: { marginBottom: 6 }, children: [
          /* @__PURE__ */ jsx("span", { className: `dz-tag ${preview.source === "wechat" ? "green" : "blue"}`, children: preview.source === "wechat" ? "\u5FAE\u4FE1\u8D26\u5355" : "\u652F\u4ED8\u5B9D\u8D26\u5355" }),
          /* @__PURE__ */ jsxs("span", { className: "dz-tag", children: [
            preview.rows,
            " \u7B14"
          ] }),
          preview.span && /* @__PURE__ */ jsx("span", { className: "dz-tag", children: preview.span }),
          preview.csvName && /* @__PURE__ */ jsx("span", { className: "dz-tag dz-grow", style: { overflow: "hidden", textOverflow: "ellipsis" }, children: preview.csvName })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "dz-grid", children: [
          /* @__PURE__ */ jsxs("div", { className: "dz-stat", children: [
            /* @__PURE__ */ jsx("small", { children: "\u6536\u5165" }),
            /* @__PURE__ */ jsx("b", { className: "dz-num", style: { color: "#3FB950" }, children: fmtYuan(preview.inFen) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dz-stat", children: [
            /* @__PURE__ */ jsx("small", { children: "\u652F\u51FA" }),
            /* @__PURE__ */ jsx("b", { className: "dz-num", style: { color: "#F85149" }, children: fmtYuan(preview.outFen) })
          ] })
        ] }),
        preview.refundFen > 0 && /* @__PURE__ */ jsxs("div", { className: "dz-sub", style: { marginTop: 6 }, children: [
          "\u9000\u6B3E ",
          fmtYuan(preview.refundFen),
          " \u5143\uFF08\u5355\u5217\u53E3\u5F84\uFF0C\u4E0D\u8BA1\u6536\u652F\uFF09"
        ] }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx("button", { className: "dz-btn gold", disabled: busy, onClick: () => void doImport(), children: "\u786E\u8BA4\u5165\u5E93" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "dz-bar" }),
      "\u5BFC\u5165\u5386\u53F2",
      /* @__PURE__ */ jsx("span", { className: "dz-hint", children: "\u5BFC\u9519\u53EF\u6574\u6279\u64A4\u9500" })
    ] }),
    !data || data.imports.length === 0 ? /* @__PURE__ */ jsx("div", { className: "dz-empty", children: "\u8FD8\u6CA1\u6709\u5BFC\u5165\u8BB0\u5F55\u3002\u7B2C\u4E00\u6B21\u7528\uFF1F\u770B\u300C\u89C4\u5219\u300DTab \u7684\u4E09\u6B65\u6307\u5F15\u3002" }) : data.imports.map((b) => /* @__PURE__ */ jsx("div", { className: "dz-card", children: /* @__PURE__ */ jsxs("div", { className: "dz-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "dz-row", children: [
        /* @__PURE__ */ jsx("span", { className: `dz-tag ${b.src === "wechat" ? "green" : "blue"}`, children: b.src === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D" }),
        /* @__PURE__ */ jsxs("span", { className: "dz-grow", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }, children: [
          b.file.split(/[\\/]/).pop(),
          b.dupCount ? `\uFF08\u8DF3\u8FC7\u91CD\u590D ${b.dupCount}\uFF09` : ""
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "dz-num", style: { fontSize: 12 }, children: [
          b.newCount,
          " \u7B14"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dz-row", style: { marginTop: 4 }, children: [
        /* @__PURE__ */ jsxs("span", { className: "dz-sub dz-grow", children: [
          b.span || "\u2014",
          " \xB7 ",
          b.at.slice(0, 16).replace("T", " ")
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: `dz-btn sm ${confirmForget === b.id ? "danger" : "ghost"}`,
            onClick: () => void doForget(b.id),
            children: confirmForget === b.id ? "\u786E\u8BA4\u64A4\u9500\uFF1F" : "\u64A4\u9500"
          }
        )
      ] })
    ] }) }, b.id))
  ] });
}

// src/OverviewTab.tsx
var core3 = __toESM(require_core());
import { useMemo, useState as useState2 } from "react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function fmtYuan2(fen) {
  const s = core3.fenToYuan(Math.round(Number(fen) || 0));
  const [i, d] = s.replace("-", "").split(".");
  const neg = (Number(fen) || 0) < 0 ? "-" : "";
  return `${neg}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${d}`;
}
function OverviewTab({ data, months }) {
  const [month, setMonth] = useState2("");
  const agg = useMemo(() => data ? aggregateOf(data, month) : null, [data, month]);
  if (!data || !agg) return /* @__PURE__ */ jsx2("div", { className: "dz-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const maxOut = Math.max(1, ...agg.categories.map((c) => c.outFen));
  const monthOut = Math.max(1, ...agg.months.map((m) => m.outFen));
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "dz-bar" }),
      "\u7EDF\u8BA1\u8303\u56F4",
      /* @__PURE__ */ jsxs2("select", { className: "dz-sel", style: { width: "auto", marginLeft: "auto" }, value: month, onChange: (e) => setMonth(e.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u5168\u90E8\u6708\u4EFD" }),
        months.map((m) => /* @__PURE__ */ jsx2("option", { value: m, children: m }, m))
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "dz-grid", style: { margin: "0 16px 10px" }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "dz-stat", children: [
        /* @__PURE__ */ jsx2("small", { children: "\u6536\u5165" }),
        /* @__PURE__ */ jsx2("b", { className: "dz-num", style: { color: "#3FB950" }, children: fmtYuan2(agg.totals.inFen) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dz-stat", children: [
        /* @__PURE__ */ jsx2("small", { children: "\u652F\u51FA" }),
        /* @__PURE__ */ jsx2("b", { className: "dz-num", style: { color: "#F85149" }, children: fmtYuan2(agg.totals.outFen) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dz-stat", children: [
        /* @__PURE__ */ jsx2("small", { children: "\u9000\u6B3E\uFF08\u4E0D\u8BA1\u6536\u652F\uFF09" }),
        /* @__PURE__ */ jsx2("b", { className: "dz-num", style: { color: "#79B8FF" }, children: fmtYuan2(agg.totals.refundFen) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dz-stat", children: [
        /* @__PURE__ */ jsx2("small", { children: "\u51C0\u6D41 = \u6536 \u2212 \u652F + \u9000" }),
        /* @__PURE__ */ jsx2("b", { className: "dz-num", style: { color: agg.totals.netFen >= 0 ? "#3FB950" : "#F85149" }, children: fmtYuan2(agg.totals.netFen) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "dz-bar" }),
      "\u652F\u51FA\u5206\u7C7B",
      /* @__PURE__ */ jsx2("span", { className: "dz-hint", children: "\u5173\u952E\u8BCD\u89C4\u5219\u53E3\u5F84 \xB7 \u4EC5\u652F\u51FA" })
    ] }),
    agg.categories.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "dz-empty", children: "\u8BE5\u8303\u56F4\u6CA1\u6709\u652F\u51FA\u8BB0\u5F55\u3002" }) : /* @__PURE__ */ jsx2("div", { className: "dz-card", children: /* @__PURE__ */ jsxs2("div", { className: "dz-card-b", children: [
      agg.categories.slice(0, 8).map((c) => /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsxs2("div", { className: "dz-row", children: [
          /* @__PURE__ */ jsx2("span", { className: "dz-grow", style: { fontSize: 12 }, children: c.cat }),
          /* @__PURE__ */ jsx2("span", { className: "dz-num", style: { fontSize: 12 }, children: fmtYuan2(c.outFen) }),
          /* @__PURE__ */ jsxs2("span", { className: "dz-sub", children: [
            agg.totals.outFen ? Math.round(c.outFen / agg.totals.outFen * 100) : 0,
            "%"
          ] })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "dz-hbar", children: /* @__PURE__ */ jsx2("i", { style: { width: `${Math.round(c.outFen / maxOut * 100)}%` } }) })
      ] }, c.cat)),
      agg.categories.length > 8 && /* @__PURE__ */ jsxs2("div", { className: "dz-sub", children: [
        "\u5176\u4F59 ",
        agg.categories.length - 8,
        " \u4E2A\u5206\u7C7B\u89C1\u300C\u660E\u7EC6\u300DTab \u7B5B\u9009\u3002"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "dz-bar" }),
      "\u5546\u6237 top",
      /* @__PURE__ */ jsx2("span", { className: "dz-hint", children: "\u6309\u652F\u51FA" })
    ] }),
    agg.merchants.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "dz-empty", children: "\u8BE5\u8303\u56F4\u6CA1\u6709\u5546\u6237\u652F\u51FA\u3002" }) : /* @__PURE__ */ jsx2("div", { className: "dz-card", children: /* @__PURE__ */ jsx2("div", { className: "dz-card-b", children: agg.merchants.map((m) => /* @__PURE__ */ jsxs2("div", { className: "dz-row", style: { padding: "3px 0" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "dz-grow", style: { fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: m.name }),
      /* @__PURE__ */ jsxs2("span", { className: "dz-sub", children: [
        m.count,
        " \u7B14"
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "dz-num", style: { fontSize: 12, width: 84, textAlign: "right" }, children: fmtYuan2(m.outFen) })
    ] }, m.name)) }) }),
    agg.months.length > 1 && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "dz-sec", children: [
        /* @__PURE__ */ jsx2("span", { className: "dz-bar" }),
        "\u6708\u5EA6\u8D8B\u52BF"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "dz-card", children: /* @__PURE__ */ jsx2("div", { className: "dz-card-b", children: [...agg.months].reverse().map((m) => /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsxs2("div", { className: "dz-row", children: [
          /* @__PURE__ */ jsx2("span", { style: { fontSize: 12, width: 74 }, children: m.ym }),
          /* @__PURE__ */ jsxs2("span", { className: "dz-sub dz-grow", children: [
            "\u652F ",
            fmtYuan2(m.outFen),
            " \xB7 \u6536 ",
            fmtYuan2(m.inFen),
            m.refundFen ? ` \xB7 \u9000 ${fmtYuan2(m.refundFen)}` : ""
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "dz-num", style: { fontSize: 12, color: m.netFen >= 0 ? "#3FB950" : "#F85149" }, children: fmtYuan2(m.netFen) })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "dz-hbar", children: /* @__PURE__ */ jsx2("i", { style: { width: `${Math.round(m.outFen / monthOut * 100)}%`, background: "linear-gradient(90deg,#8A2E2E,#C25454)" } }) })
      ] }, m.ym)) }) })
    ] }),
    agg.neutralCount > 0 && /* @__PURE__ */ jsx2("div", { className: "dz-card", children: /* @__PURE__ */ jsxs2("div", { className: "dz-card-b dz-sub", children: [
      "\u53E3\u5F84\u8BF4\u660E\uFF1A\u53E6\u6709 ",
      agg.neutralCount,
      " \u7B14\u4E2D\u6027\u4EA4\u6613\uFF08\u96F6\u94B1\u5145\u503C\u3001\u7406\u8D22\u4E92\u8F6C\u3001\u4EA4\u6613\u5173\u95ED\u7B49\u94B1\u672A\u771F\u6B63\u6D41\u52A8\u7684\u8BB0\u5F55\uFF09\u672A\u8BA1\u5165\u6536\u652F\uFF1B\u9000\u6B3E\u5355\u5217\uFF0C\u51C0\u6D41 = \u6536\u5165 \u2212 \u652F\u51FA + \u9000\u6B3E\u3002"
    ] }) })
  ] });
}

// src/DetailTab.tsx
var core4 = __toESM(require_core());
import { useMemo as useMemo2, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var DISPLAY_LIMIT = 200;
function fmtYuan3(fen) {
  return core4.fenToYuan(Math.round(Number(fen) || 0));
}
function DetailTab({ data, cache, reload, showToast, months }) {
  const [month, setMonth] = useState3("");
  const [dir, setDir] = useState3("");
  const [cat, setCat] = useState3("");
  const [kw, setKw] = useState3("");
  const [editing, setEditing] = useState3(null);
  const [editVal, setEditVal] = useState3("");
  const categories = useMemo2(() => data ? [...new Set(data.txns.map((t) => core4.categorize(t, data.rules, data.overrides)))].sort() : [], [data]);
  const hits = useMemo2(() => {
    if (!data) return [];
    return filterTxnsOf(data, { month: month || void 0, dir: dir || void 0, category: cat || void 0, keyword: kw || void 0 }).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, DISPLAY_LIMIT);
  }, [data, month, dir, cat, kw]);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "dz-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  const catOf = (t) => core4.categorize(t, data.rules, data.overrides);
  const saveCat = async (t) => {
    setEditing(null);
    const c = editVal.trim();
    if (!c || c === catOf(t)) return;
    try {
      await saveOverride(cache, t.id, c);
      showToast(`\u5DF2\u6539\u5206\u7C7B\uFF1A${c}`);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const doExport = (kind) => {
    try {
      if (kind === "csv") downloadText(`duzhi-export-${Date.now()}.csv`, exportCsvOf(data));
      else downloadText(`duzhi-export-${Date.now()}.json`, exportJsonOf(data));
      showToast("\u5DF2\u5BFC\u51FA\uFF08\u6D4F\u89C8\u5668\u4E0B\u8F7D\uFF09");
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "dz-card", style: { marginTop: 6 }, children: /* @__PURE__ */ jsxs3("div", { className: "dz-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "dz-row", children: [
        /* @__PURE__ */ jsxs3("select", { className: "dz-sel", style: { width: 120 }, value: month, onChange: (e) => setMonth(e.target.value), children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u5168\u90E8\u6708\u4EFD" }),
          months.map((m) => /* @__PURE__ */ jsx3("option", { value: m, children: m }, m))
        ] }),
        /* @__PURE__ */ jsxs3("select", { className: "dz-sel", style: { width: 96 }, value: dir, onChange: (e) => setDir(e.target.value), children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u5168\u90E8" }),
          /* @__PURE__ */ jsx3("option", { value: "out", children: "\u652F\u51FA" }),
          /* @__PURE__ */ jsx3("option", { value: "in", children: "\u6536\u5165" }),
          /* @__PURE__ */ jsx3("option", { value: "neutral", children: "\u4E2D\u6027" })
        ] }),
        /* @__PURE__ */ jsxs3("select", { className: "dz-sel", style: { width: 120 }, value: cat, onChange: (e) => setCat(e.target.value), children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u5168\u90E8\u5206\u7C7B" }),
          categories.map((c) => /* @__PURE__ */ jsx3("option", { value: c, children: c }, c))
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "dz-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "dz-inp dz-grow",
            placeholder: "\u641C\u4EA4\u6613\u5BF9\u65B9 / \u5546\u54C1 / \u5907\u6CE8\u2026",
            value: kw,
            onChange: (e) => setKw(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx3("button", { className: "dz-btn ghost", onClick: () => doExport("csv"), children: "\u5BFC\u51FA CSV" }),
        /* @__PURE__ */ jsx3("button", { className: "dz-btn ghost", onClick: () => doExport("json"), children: "JSON" })
      ] })
    ] }) }),
    hits.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "dz-empty", children: data.txns.length === 0 ? "\u8FD8\u6CA1\u6709\u8D26\u5355\uFF1A\u5148\u53BB\u300C\u5BFC\u5165\u300DTab \u62D6\u5165\u8D26\u5355\u6587\u4EF6\u3002" : "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u4EA4\u6613\u3002" }) : /* @__PURE__ */ jsxs3(Fragment2, { children: [
      data.txns.length > DISPLAY_LIMIT && /* @__PURE__ */ jsxs3("div", { className: "dz-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "dz-bar" }),
        "\u660E\u7EC6",
        /* @__PURE__ */ jsxs3("span", { className: "dz-hint", children: [
          "\u5171 ",
          hits.length,
          "+ \u7B14\uFF0C\u53EA\u663E\u793A\u6700\u8FD1 ",
          DISPLAY_LIMIT,
          " \u7B14\uFF08\u5BFC\u51FA\u542B\u5168\u90E8\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "dz-card", children: /* @__PURE__ */ jsx3("div", { className: "dz-card-b", style: { padding: "4px 10px" }, children: hits.map((t) => {
        const isRefund = core4.isRefundRow(t);
        const color = isRefund ? "#79B8FF" : t.dir === "in" ? "#3FB950" : t.dir === "out" ? "#F85149" : "#8B95A7";
        const prefix = isRefund ? "" : t.dir === "in" ? "+" : t.dir === "out" ? "-" : "\xB1";
        return /* @__PURE__ */ jsxs3("div", { style: { padding: "7px 2px", borderBottom: "1px solid #1c2230" }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "dz-row", children: [
            /* @__PURE__ */ jsx3("span", { className: "dz-sub", style: { width: 108, flexShrink: 0 }, children: t.date.slice(5, 16) }),
            /* @__PURE__ */ jsxs3("span", { className: "dz-num", style: { color, width: 86, textAlign: "right", flexShrink: 0 }, children: [
              prefix,
              fmtYuan3(t.amountFen)
            ] }),
            /* @__PURE__ */ jsxs3("span", { className: "dz-grow", style: { fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
              t.name || "(\u672A\u77E5\u5546\u6237)",
              t.item ? /* @__PURE__ */ jsxs3("span", { className: "dz-sub", children: [
                " \xB7 ",
                t.item
              ] }) : null
            ] }),
            /* @__PURE__ */ jsx3("span", { className: "dz-tag gold", children: catOf(t) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "dz-row", style: { marginTop: 2 }, children: [
            /* @__PURE__ */ jsxs3("span", { className: "dz-sub dz-grow", children: [
              isRefund ? "\u9000\u6B3E \xB7 " : "",
              t.status ? `${t.status} \xB7 ` : "",
              t.method || "",
              t.refundFen > 0 && !isRefund ? ` \xB7 \u5DF2\u9000 ${fmtYuan3(t.refundFen)}` : ""
            ] }),
            /* @__PURE__ */ jsx3("span", { className: `dz-tag ${t.src === "wechat" ? "green" : "blue"}`, children: t.src === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D" }),
            /* @__PURE__ */ jsx3(
              "button",
              {
                className: "dz-btn sm ghost",
                onClick: () => {
                  setEditing(editing === t.id ? null : t.id);
                  setEditVal(catOf(t));
                },
                children: "\u6539\u5206\u7C7B"
              }
            )
          ] }),
          editing === t.id && /* @__PURE__ */ jsxs3("div", { className: "dz-row", style: { marginTop: 6 }, children: [
            /* @__PURE__ */ jsx3(
              "input",
              {
                className: "dz-inp dz-grow",
                value: editVal,
                placeholder: "\u65B0\u5206\u7C7B\u540D\uFF0C\u5982 \u5496\u5561\u5976\u8336",
                onChange: (e) => setEditVal(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") void saveCat(t);
                }
              }
            ),
            /* @__PURE__ */ jsx3("button", { className: "dz-btn sm", onClick: () => void saveCat(t), children: "\u4FDD\u5B58" })
          ] })
        ] }, t.id);
      }) }) })
    ] })
  ] });
}

// src/RulesTab.tsx
var core5 = __toESM(require_core());
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function RulesTab({ data, cache, reload, showToast }) {
  const [kw, setKw] = useState4("");
  const [cat, setCat] = useState4("");
  const [confirmWipe, setConfirmWipe] = useState4(false);
  const rules = data?.rules || [];
  const addRule = async () => {
    if (!kw.trim() || !cat.trim()) {
      showToast("\u5173\u952E\u8BCD\u548C\u5206\u7C7B\u540D\u90FD\u8981\u586B", true);
      return;
    }
    try {
      await saveRules([{ kw: kw.trim(), cat: cat.trim() }, ...rules]);
      setKw("");
      setCat("");
      showToast("\u5DF2\u52A0\u89C4\u5219\uFF08\u5BF9\u4EE5\u540E\u5BFC\u5165\u751F\u6548\uFF1B\u6539\u5B58\u91CF\u53BB\u300C\u660E\u7EC6\u300DTab\uFF09");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const removeRule = async (target) => {
    try {
      await saveRules(rules.filter((r) => r.kw !== target));
      showToast("\u5DF2\u5220\u89C4\u5219");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const doWipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      setTimeout(() => setConfirmWipe(false), 5e3);
      return;
    }
    setConfirmWipe(false);
    try {
      const n = await wipeAll(cache);
      showToast(`\u5DF2\u6E05\u7A7A\u6D88\u8D39\u8D26\u5355\u5168\u90E8\u6570\u636E\uFF08${n} \u4E2A\u952E\uFF09`);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "dz-bar" }),
      "\u4E09\u6B65\u4E0A\u624B"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dz-card", children: /* @__PURE__ */ jsxs4("div", { className: "dz-card-b dz-sub", style: { lineHeight: 2 }, children: [
      "\u2460 \u5BFC\u51FA\u8D26\u5355\uFF1A\u5FAE\u4FE1\u300C\u670D\u52A1\u2192\u94B1\u5305\u2192\u8D26\u5355\u2192\u53F3\u4E0A\u89D2\xB7\xB7\xB7\u2192\u4E0B\u8F7D\u8D26\u5355\uFF08\u7528\u4E8E\u4E2A\u4EBA\u5BF9\u8D26\uFF09\u300D\uFF1B\u652F\u4ED8\u5B9D\u300C\u6211\u7684\u2192\u8D26\u5355\u2192\u53F3\u4E0A\u89D2\xB7\xB7\xB7\u2192\u5F00\u5177\u4EA4\u6613\u6D41\u6C34\u8BC1\u660E\u2192\u7535\u5B50\u7248\u5BF9\u8D26\u5355\u300D\u2014\u2014\u4E24\u8005\u90FD\u4F1A\u53D1 zip \u5230\u4F60\u90AE\u7BB1\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u2461 \u4E0B\u8F7D zip \u62D6\u8FDB\u300C\u5BFC\u5165\u300DTab\uFF1A\u652F\u4ED8\u5B9D\u76F4\u63A5\u53EF\u5BFC\uFF1B\u5FAE\u4FE1\u8981\u8F93\u5165\u89E3\u538B\u5BC6\u7801\uFF08\u300C\u5FAE\u4FE1\u652F\u4ED8\u300D\u516C\u4F17\u53F7\u7684\u901A\u77E5\u6D88\u606F\u91CC\u53EF\u67E5\uFF09\u3002\u4E5F\u53EF\u4EE5\u624B\u52A8\u89E3\u538B\u540E\u62D6 CSV\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u2462 \u4E4B\u540E\u5168\u662F\u5BF9\u8BDD\u4E0E\u9762\u677F\uFF1A\u95EE AI\u300C\u4E0A\u6708\u5976\u8336\u82B1\u4E86\u591A\u5C11\u300D\uFF0C\u6216\u5728\u300C\u603B\u89C8\u300D\u300C\u660E\u7EC6\u300D\u91CC\u81EA\u5DF1\u7FFB\u3002\u5BFC\u9519\u4E86\u300C\u5BFC\u5165\u300DTab \u91CC\u6574\u6279\u64A4\u9500\u3002"
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "dz-bar" }),
      "\u5206\u7C7B\u89C4\u5219",
      /* @__PURE__ */ jsx4("span", { className: "dz-hint", children: "\u5148\u547D\u4E2D\u5148\u7528 \xB7 \u81EA\u5B9A\u4E49\u4F18\u5148\u4E8E\u5185\u7F6E" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dz-card", children: /* @__PURE__ */ jsxs4("div", { className: "dz-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "dz-row", children: [
        /* @__PURE__ */ jsx4("input", { className: "dz-inp dz-grow", placeholder: "\u5173\u952E\u8BCD\uFF08\u5339\u914D\u4EA4\u6613\u5BF9\u65B9/\u5546\u54C1/\u7C7B\u578B\uFF09", value: kw, onChange: (e) => setKw(e.target.value) }),
        /* @__PURE__ */ jsx4("input", { className: "dz-inp", style: { width: 110 }, placeholder: "\u5206\u7C7B\u540D", value: cat, onChange: (e) => setCat(e.target.value) }),
        /* @__PURE__ */ jsx4("button", { className: "dz-btn gold", onClick: () => void addRule(), children: "\u52A0\u89C4\u5219" })
      ] }),
      rules.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "dz-sub", style: { marginTop: 8 }, children: "\u8FD8\u6CA1\u6709\u81EA\u5B9A\u4E49\u89C4\u5219\uFF1A\u6240\u6709\u4EA4\u6613\u5148\u8D70\u5185\u7F6E\u9ED8\u8BA4\u89C4\u5219\uFF0C\u518D\u843D\u5230\u300C\u5176\u4ED6\u300D\u3002\u4F8B\u5982\u52A0\u300C\u745E\u5E78\u2192\u5496\u5561\u5976\u8336\u300D\u8BA9\u4EE5\u540E\u5BFC\u5165\u81EA\u52A8\u5F52\u7C7B\u3002" }) : /* @__PURE__ */ jsx4("div", { style: { marginTop: 8 }, children: rules.map((r) => /* @__PURE__ */ jsxs4("div", { className: "dz-row", style: { padding: "4px 0", borderBottom: "1px solid #1c2230" }, children: [
        /* @__PURE__ */ jsxs4("span", { className: "dz-tag", children: [
          "\u300C",
          r.kw,
          "\u300D"
        ] }),
        /* @__PURE__ */ jsx4("span", { className: "dz-sub", children: "\u2192" }),
        /* @__PURE__ */ jsx4("span", { className: "dz-grow", style: { fontSize: 12 }, children: r.cat }),
        /* @__PURE__ */ jsx4("button", { className: "dz-btn sm ghost", onClick: () => void removeRule(r.kw), children: "\u5220" })
      ] }, r.kw)) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "dz-bar" }),
      "\u5185\u7F6E\u9ED8\u8BA4\u89C4\u5219",
      /* @__PURE__ */ jsxs4("span", { className: "dz-hint", children: [
        core5.DEFAULT_RULES.length,
        " \u6761 \xB7 \u53EA\u8BFB"
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dz-card", children: /* @__PURE__ */ jsx4("div", { className: "dz-card-b dz-sub", children: core5.DEFAULT_RULES.map((r) => `${r.kw}\u2192${r.cat}`).join("\u3001") }) }),
    /* @__PURE__ */ jsxs4("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "dz-bar" }),
      "\u9690\u79C1\u4E0E\u5B89\u5168"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dz-card", children: /* @__PURE__ */ jsxs4("div", { className: "dz-card-b dz-sub", style: { lineHeight: 1.9 }, children: [
      "\xB7 \u96F6\u5916\u7F51\uFF1A\u672C\u63D2\u4EF6\u6CA1\u6709\u4EFB\u4F55\u7F51\u7EDC\u6743\u9650\uFF0C\u8D26\u5355\u6587\u4EF6\u5728\u6D4F\u89C8\u5668\u672C\u673A\u89E3\u6790\uFF0C\u4E0D\u4E0A\u4F20\u4EFB\u4F55\u5185\u5BB9\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5BC6\u7801\u4E0D\u843D\u76D8\uFF1Azip \u89E3\u538B\u5BC6\u7801\u53EA\u5728\u672C\u6B21\u5BFC\u5165\u7684\u5185\u5B58\u91CC\u7528\u4E00\u6B21\uFF0C\u4E0D\u5199\u8FDB\u4EFB\u4F55\u5B58\u50A8\u548C\u65E5\u5FD7\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF1A\u5168\u90E8\u6570\u636E\u5728\u672C\u673A Polaris \u6570\u636E\u6839\uFF08cap.kv\uFF09\uFF0C\u5BB6\u5EAD\u591A\u7AEF\u540C\u770B\u8D70\u4F60\u81EA\u5DF1\u7684 Polaris\uFF0C\u4E0D\u7ECF\u7B2C\u4E09\u65B9\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u53EF\u64A4\u9500\uFF1A\u6309\u6279\u6B21\u6574\u6279\u64A4\u9500\uFF1B\u6E05\u7A7A = \u4E0B\u9762\u6309\u94AE\uFF0C\u5220\u5E72\u51C0\u4E0D\u53EF\u6062\u590D\uFF08\u5148\u5BFC\u51FA\u5907\u4EFD\uFF09\u3002"
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "dz-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "dz-bar" }),
      "\u5371\u9669\u533A"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dz-card", children: /* @__PURE__ */ jsxs4("div", { className: "dz-card-b dz-row", children: [
      /* @__PURE__ */ jsx4("span", { className: "dz-sub dz-grow", children: "\u6E05\u7A7A\u5168\u90E8\u6D88\u8D39\u8D26\u5355\u6570\u636E\uFF08\u8D26\u5355/\u6279\u6B21/\u89C4\u5219/\u5206\u7C7B\u8986\u76D6\uFF09\uFF0C\u4E0D\u53EF\u6062\u590D\u3002" }),
      /* @__PURE__ */ jsx4("button", { className: `dz-btn sm ${confirmWipe ? "danger" : "ghost"}`, onClick: () => void doWipe(), children: confirmWipe ? "\u786E\u8BA4\u6E05\u7A7A\uFF1F" : "\u6E05\u7A7A\u6570\u636E" })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.dz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dz-body::-webkit-scrollbar{width:9px;height:9px}
.dz-body::-webkit-scrollbar-track{background:transparent}
.dz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dz-page{max-width:640px;margin:0 auto}

/* \u5934\u90E8 */
.dz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7A5C1F,#9E8A2E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dz-tt{flex:1;min-width:0}
.dz-tt b{font-size:15px;display:block}
.dz-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.dz-tabs{display:flex;gap:4px}
.dz-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.dz-tab:hover{color:#E6EAF2}
.dz-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* \u901A\u7528 */
.dz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#B08A2E,#D4B45A);flex-shrink:0}
.dz-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dz-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dz-card-b{padding:11px 13px}
.dz-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dz-btn:hover{filter:brightness(1.1)}
.dz-btn:disabled{opacity:.45;cursor:not-allowed}
.dz-btn.gold{background:#5C4A1F;color:#EAD48A}
.dz-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dz-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dz-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dz-inp:focus{outline:none;border-color:#2b6cb0}
.dz-inp::placeholder{color:#4d5566}
.dz-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.dz-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.dz-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dz-err{color:#F85149;font-size:11.5px;padding:8px 16px;line-height:1.7}
.dz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.dz-toast.bad{border-color:#54262c;color:#FF8A9A}
.dz-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.dz-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.dz-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.dz-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.dz-tag.gold{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.dz-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dz-row{display:flex;align-items:center;gap:8px;min-width:0}
.dz-grow{flex:1;min-width:0}
.dz-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.dz-num{font-variant-numeric:tabular-nums}
.dz-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dz-stat{background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 11px}
.dz-stat b{display:block;font-size:15px;font-weight:700}
.dz-stat small{color:#8B95A7;font-size:10px}
.dz-hbar{height:8px;border-radius:4px;background:#12151c;overflow:hidden;margin-top:4px}
.dz-hbar>i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#B08A2E,#D4B45A)}
.dz-drop{margin:0 16px 10px;border:1.5px dashed #3a4356;border-radius:13px;padding:22px 16px;text-align:center;color:#8B95A7;font-size:12px;line-height:1.8;cursor:pointer;transition:border-color .15s,background .15s}
.dz-drop:hover,.dz-drop.over{border-color:#B08A2E;background:rgba(176,138,46,.06);color:#E6EAF2}
.dz-drop.dragging{border-color:#D4B45A}
`;
function DuizhiPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("import");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const cacheRef = useRef2(newCache());
  const toastTimer = useRef2(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3e3);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadDuizhi(cacheRef.current);
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
    const timer = setInterval(poll, 15e3);
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
  const months = useMemo3(() => {
    if (!data) return [];
    const set = /* @__PURE__ */ new Set();
    for (const t of data.txns) {
      const ym = t.date.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym);
    }
    return [...set].sort().reverse();
  }, [data]);
  const tabProps = { data, reload, cache: cacheRef.current, showToast, pluginId, onSendToChat };
  return /* @__PURE__ */ jsxs5("div", { className: "dz-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "dz-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "dz-logo", children: "\u{1F9FE}" }),
      /* @__PURE__ */ jsxs5("div", { className: "dz-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u6D88\u8D39\u8D26\u5355" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          "\u5BB6\u5EAD\u8D26\u5355\u900F\u89C6 \xB7 ",
          data ? `${data.txns.length} \u7B14\u5165\u8D26 \xB7 \u6570\u636E\u4EC5\u5B58\u672C\u673A` : "\u52A0\u8F7D\u4E2D\u2026"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "dz-tabs", children: [
        ["import", "\u5BFC\u5165"],
        ["overview", "\u603B\u89C8"],
        ["detail", "\u660E\u7EC6"],
        ["rules", "\u89C4\u5219"]
      ].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `dz-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "dz-body", children: /* @__PURE__ */ jsxs5("div", { className: "dz-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "dz-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "import" && /* @__PURE__ */ jsx5(ImportTab, { ...tabProps, months }),
      tab === "overview" && /* @__PURE__ */ jsx5(OverviewTab, { ...tabProps, months }),
      tab === "detail" && /* @__PURE__ */ jsx5(DetailTab, { ...tabProps, months }),
      tab === "rules" && /* @__PURE__ */ jsx5(RulesTab, { ...tabProps }),
      /* @__PURE__ */ jsxs5("div", { className: "dz-foot", children: [
        "\u6D88\u8D39\u8D26\u5355\u53EA\u505A\u8D26\u5355\u5BFC\u5165\u4E0E\u7EDF\u8BA1\u900F\u89C6\uFF1A\u5206\u7C7B\u4E3A\u5173\u952E\u8BCD\u89C4\u5219\u53E3\u5F84\uFF0C\u4E0E\u5B9E\u9645\u6D88\u8D39\u6027\u8D28\u53EF\u80FD\u6709\u51FA\u5165\uFF1B",
        /* @__PURE__ */ jsx5("br", {}),
        "\u4E0D\u6784\u6210\u7406\u8D22\u5EFA\u8BAE\uFF0C\u91D1\u989D\u4EE5\u5E73\u53F0\u8D26\u5355\u4E3A\u51C6\u3002\u96F6\u5916\u7F51\u96F6\u8D26\u53F7\uFF0C\u89E3\u538B\u5BC6\u7801\u53EA\u5728\u5185\u5B58\u7528\u4E00\u6B21\uFF0C\u6570\u636E\u4EC5\u5B58\u672C\u673A\uFF08cap.kv\uFF09\u3002"
      ] })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `dz-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
var src_default = DuizhiPanel;
export {
  src_default as default
};
