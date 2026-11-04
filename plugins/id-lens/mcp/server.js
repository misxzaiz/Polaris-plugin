"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/id-core.js
var require_id_core = __commonJS({
  "shared/id-core.js"(exports2, module2) {
    "use strict";
    var UUID_RE_CANON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var UUID_RE_BRACES = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i;
    var UUID_RE_URN = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var UUID_RE_HYPHENLESS = /^[0-9a-f]{32}$/i;
    var ULID_RE = /^[0-9A-HJ-NP-TV-Z]{26}$/i;
    var SNOWFLAKE_RE = /^\d{1,20}$/;
    var GREGORIAN_100NS_OFFSET = 122192928000000000n;
    var EPOCHS = {
      twitter: { label: "Twitter", epochMs: 1288834974657n, note: "2010-11-04T01:42:54.657Z" },
      discord: { label: "Discord", epochMs: 1420070400000n, note: "2015-01-01T00:00:00Z" }
    };
    var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    var CROCKFORD_DECODE = (() => {
      const m = /* @__PURE__ */ new Map();
      for (let i = 0; i < CROCKFORD.length; i++) m.set(CROCKFORD[i], BigInt(i));
      m.set("O", 0n);
      m.set("I", 1n);
      m.set("L", 1n);
      return m;
    })();
    var DOW_LABELS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
    function pad2(n) {
      return String(n).padStart(2, "0");
    }
    function isoFromEpochMs(epochMs) {
      if (epochMs < -62135596800000n || epochMs > 253402300799999n) return null;
      const days = epochMs >= 0n ? epochMs / 86400000n : -((-epochMs + 86399999n) / 86400000n);
      const rem = epochMs - days * 86400000n;
      let z = Number(days) + 719468;
      const era = Math.floor(z / 146097);
      const doe = z - era * 146097;
      const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
      let y = yoe + era * 400;
      const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
      const mp = Math.floor((5 * doy + 2) / 153);
      const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
      const mo = mp + (mp < 10 ? 3 : -9);
      if (mo <= 2) y += 1;
      const h = rem / 3600000n;
      const mi = rem % 3600000n / 60000n;
      const s = rem % 60000n / 1000n;
      const ms = rem % 1000n;
      return `${String(y).padStart(4, "0")}-${pad2(mo)}-${pad2(d)}T${pad2(Number(h))}:${pad2(Number(mi))}:${pad2(Number(s))}.${String(Number(ms)).padStart(3, "0")}Z`;
    }
    function dowFromEpochMs(epochMs) {
      const days = epochMs >= 0n ? epochMs / 86400000n : -((-epochMs + 86399999n) / 86400000n);
      return Number((days % 7n + 11n) % 7n);
    }
    function stripUuidShell(s) {
      if (UUID_RE_CANON.test(s)) return { canon: s.toLowerCase(), shape: "canonical" };
      if (UUID_RE_BRACES.test(s)) return { canon: s.slice(1, -1).toLowerCase(), shape: "braces" };
      if (UUID_RE_URN.test(s)) return { canon: s.slice(9).toLowerCase(), shape: "urn" };
      if (UUID_RE_HYPHENLESS.test(s)) {
        const c = s.toLowerCase();
        return { canon: `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`, shape: "hyphenless" };
      }
      return null;
    }
    function uuidNearMiss(s) {
      const body = s.replace(/^\{|\}$/g, "").replace(/^urn:uuid:/i, "");
      const badHex = [];
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (/[0-9a-fA-F]/.test(ch) || ch === "-") continue;
        badHex.push({ pos: i + 1, ch });
      }
      if (badHex.length) {
        return `\u542B\u975E\u5341\u516D\u8FDB\u5236\u5B57\u7B26:${badHex.slice(0, 4).map((b) => `\u7B2C ${b.pos} \u4F4D\u300C${b.ch}\u300D`).join("\u3001")}\u3002\u6CE8\u610F Crockford \u98CE\u683C\u7684 I/L/O \u5728 UUID \u4E2D\u975E\u6CD5\u3002`;
      }
      if (body.length !== 36) return `\u957F\u5EA6 ${body.length},canonical \u987B 36(32 hex + 4 \u8FDE\u5B57\u7B26);\u65E0\u8FDE\u5B57\u7B26\u5F62\u6001\u987B 32\u3002`;
      const parts = body.split("-");
      if (parts.length !== 5) return `\u8FDE\u5B57\u7B26\u5206\u7EC4 ${parts.length} \u6BB5,\u987B 5 \u6BB5(8-4-4-4-12)\u3002`;
      const lens = parts.map((p) => p.length).join("-");
      if (lens !== "8-4-4-4-12") return `\u6BB5\u957F ${lens},\u987B 8-4-4-4-12\u3002`;
      return "\u5F62\u6001\u63A5\u8FD1 canonical UUID,\u8BF7\u68C0\u67E5\u5404\u6BB5\u957F\u5EA6\u3002";
    }
    function detectFamily(input, opts) {
      const s = String(input == null ? "" : input).trim();
      if (!s) return { family: "unknown", error: { code: "EMPTY", message: "\u7A7A\u8F93\u5165" } };
      const stripped = stripUuidShell(s);
      if (stripped) return { family: "uuid", canon: stripped.canon, shape: stripped.shape };
      if (ULID_RE.test(s)) return { family: "ulid", canon: s.toUpperCase(), shape: /[a-z]/.test(s) ? "lowercase" : "canonical" };
      if (/^[0-9a-zA-Z]{26}$/.test(s) && /[ILOU]/.test(s.toUpperCase()) && [...s.toUpperCase()].every((ch) => "ILOU".includes(ch) || CROCKFORD.includes(ch))) {
        return { family: "ulid", canon: s.toUpperCase(), shape: /[a-z]/.test(s) ? "lowercase" : "canonical" };
      }
      if (SNOWFLAKE_RE.test(s)) return { family: "snowflake", canon: s.replace(/^0+(?=\d)/, ""), shape: "decimal" };
      const hexy = /[0-9a-fA-F]/.test(s) && /-/.test(s);
      if (hexy) return { family: "unknown", error: { code: "UNRECOGNIZED", message: "\u50CF UUID \u4F46\u5F62\u6001\u4E0D\u5408\u89C4", hint: uuidNearMiss(s) } };
      if (/^[0-9a-zA-Z]+$/.test(s) && s.length >= 20 && s.length <= 30) {
        return { family: "unknown", error: { code: "ULID_BADCHAR", message: `26 \u5B57\u7B26 Base32 \u5F62\u6001\u987B\u5339\u914D ULID(\u5B9E\u9645 ${s.length} \u5B57\u7B26),\u6216\u542B Crockford \u6392\u9664\u5B57\u6BCD(I/L/O/U)`, hint: "ULID \u5B57\u6BCD\u8868:0-9 \u4E0E A-Z \u53BB\u6389 I\u3001L\u3001O\u3001U;\u68C0\u67E5\u8FD9\u56DB\u4E2A\u6DF7\u6DC6\u5B57\u6BCD\u3002" } };
      }
      if (/^\d+$/.test(s)) return { family: "unknown", error: { code: "SNOWFLAKE_RANGE", message: `${s.length} \u4F4D\u6570\u5B57\u8D85\u51FA 64 \u4F4D\u65E0\u7B26\u53F7\u57DF(\u226420 \u4F4D)`, hint: "Snowflake \u662F 64 \u4F4D\u6574\u6570,\u5341\u8FDB\u5236 \u226420 \u4F4D\u3002" } };
      return { family: "unknown", error: { code: "UNRECOGNIZED", message: `\u65E0\u6CD5\u8BC6\u522B\u7684\u6807\u8BC6\u7B26:${s.length > 60 ? s.slice(0, 60) + "\u2026" : s}`, hint: "\u652F\u6301:UUID(canonical/urn/braces/\u65E0\u8FDE\u5B57\u7B26)\u3001ULID(26 \u5B57\u7B26 Crockford Base32)\u3001Snowflake(\u7EAF\u6570\u5B57 \u226420 \u4F4D)\u3002" } };
    }
    var UUID_VERSIONS = {
      1: "v1:\u65F6\u95F4\u6233\u4F18\u5148(Gregorian \u7EAA\u5143 100ns + clock seq + node/MAC)",
      2: "v2:DCE \u5B89\u5168(\u5C40\u90E8\u6807\u8BC6\u7B26 + \u57DF;\u6781\u5C11\u7528,\u65F6\u95F4\u5B57\u6BB5\u88AB\u5360\u7528)",
      3: "v3:MD5 \u540D\u5B57\u7A7A\u95F4\u6563\u5217(\u5185\u5BB9\u4E0D\u53EF\u9006)",
      4: "v4:\u968F\u673A(122 \u4F4D\u968F\u673A)",
      5: "v5:SHA-1 \u540D\u5B57\u7A7A\u95F4\u6563\u5217(\u5185\u5BB9\u4E0D\u53EF\u9006)",
      6: "v6:v1 \u91CD\u6392\u7248(\u65F6\u95F4\u9AD8\u4F4D\u5728\u524D,\u53EF\u6309\u5B57\u5178\u5E8F\u6392\u5E8F;RFC 9562 \u65B0\u589E)",
      7: "v7:Unix \u6BEB\u79D2\u65F6\u95F4\u6233 + \u6709\u5E8F\u968F\u673A(RFC 9562 \u65B0\u589E,\u63A8\u8350)",
      8: "v8:\u5382\u5546\u81EA\u5B9A\u4E49(\u53EA\u4FDD\u8BC1\u7248\u672C/\u53D8\u4F53\u4F4D)"
    };
    var VARIANT_NAMES = {
      0: "NCS(\u9057\u7559 Apollo \u7F51\u7EDC\u8BA1\u7B97\u7CFB\u7EDF\u2014\u2014\u8001\u53E4\u8463,\u73B0\u4EE3\u751F\u6210\u5668\u4E0D\u8BE5\u51FA\u73B0)",
      1: "NCS(\u9057\u7559,bit63=0)",
      2: "RFC 9562 / RFC 4122(\u6807\u51C6,10xx)",
      3: "Microsoft GUID \u6216\u4FDD\u7559(110x/111x,\u7531 bit61 \u7EC6\u5206)"
    };
    function variantName(var2, v) {
      if (var2 !== 3) return VARIANT_NAMES[var2];
      return (v >> 61n & 1n) === 0n ? "Microsoft GUID(\u5411\u540E\u517C\u5BB9,110x)" : "\u4FDD\u7559(\u672A\u6765\u5B9A\u4E49,111x)";
    }
    function parseUuid(canon, shape, opts) {
      const hex = canon.replace(/-/g, "");
      const v = BigInt("0x" + hex);
      const ver = Number(v >> 76n & 0xfn);
      const variantBits = Number(v >> 62n & 0x3n);
      const out = {
        family: "uuid",
        shape,
        canonical: canon,
        version: ver,
        versionNote: UUID_VERSIONS[ver] || `\u7248\u672C ${ver}:RFC 9562 \u672A\u5B9A\u4E49`,
        variant: variantBits,
        variantNote: variantName(variantBits, v),
        hex128: hex,
        decimal: v.toString(),
        segments: [],
        fields: {},
        notes: []
      };
      const seg = (name, hi, lo, val, note) => out.segments.push({ name, hi, lo, value: String(val), note: note || "" });
      if (ver === 1 || ver === 2 || ver === 6) {
        let ts100;
        let seqLow;
        if (ver === 6) {
          const tHigh = v >> 96n & 0xffffffffn;
          const tMid = v >> 80n & 0xffffn;
          const tLow = v >> 64n & 0xfffn;
          ts100 = tHigh << 28n | tMid << 12n | tLow;
          seqLow = v >> 48n & 0x3fffn;
          seg("time_high", 127, 96, tHigh, "\u65F6\u95F4\u6233\u9AD8 32 \u4F4D(v6 \u91CD\u6392:\u9AD8\u4F4D\u5728\u524D,\u53EF\u5B57\u5178\u5E8F\u6392\u5E8F)");
          seg("time_mid", 95, 80, tMid, "\u65F6\u95F4\u6233\u4E2D 16 \u4F4D");
          seg("ver", 79, 76, ver, "\u7248\u672C\u4F4D(4)");
          seg("time_low", 75, 64, tLow, "\u65F6\u95F4\u6233\u4F4E 12 \u4F4D");
          seg("var", 63, 62, variantBits, "\u53D8\u4F53\u4F4D(2)");
          seg("clock_seq", 61, 48, seqLow, "\u65F6\u949F\u5E8F\u5217(14)");
          seg("node", 47, 0, v & 0xffffffffffffn, "48 \u4F4D\u8282\u70B9(MAC/\u968F\u673A)");
        } else {
          const tLow = v >> 96n & 0xffffffffn;
          const tMid = v >> 80n & 0xffffn;
          const tHi = v >> 64n & 0xfffn;
          ts100 = tHi << 48n | tMid << 32n | tLow;
          seqLow = v >> 48n & 0x3fffn;
          seg(ver === 1 ? "time_low" : "local_id", 127, 96, tLow, ver === 1 ? "\u65F6\u95F4\u6233\u4F4E 32 \u4F4D(100ns)" : "v2:\u5C40\u90E8\u6807\u8BC6\u7B26(\u5360\u7528\u65F6\u95F4\u5B57\u6BB5)");
          seg("time_mid", 95, 80, tMid, "\u65F6\u95F4\u6233\u4E2D 16 \u4F4D");
          seg("ver", 79, 76, ver, "\u7248\u672C\u4F4D(4)");
          seg("time_hi", 75, 64, tHi, "\u65F6\u95F4\u6233\u9AD8 12 \u4F4D");
          seg("var", 63, 62, variantBits, "\u53D8\u4F53\u4F4D(2)");
          seg("clock_seq", 61, 48, seqLow, "\u65F6\u949F\u5E8F\u5217(14)");
          seg("node", 47, 0, v & 0xffffffffffffn, "48 \u4F4D\u8282\u70B9(MAC/\u968F\u673A)");
        }
        const unix100 = ts100 - GREGORIAN_100NS_OFFSET;
        if (unix100 >= 0n) {
          const ms = unix100 / 10000n;
          out.fields.timestamp100ns = ts100.toString();
          out.fields.epochMs = ms.toString();
          out.fields.time = isoFromEpochMs(ms) || null;
        } else {
          out.fields.timestamp100ns = ts100.toString();
          out.fields.time = null;
          out.notes.push("\u65F6\u95F4\u6233\u65E9\u4E8E Gregorian \u7EAA\u5143\u57FA\u51C6(\u6362\u7B97\u4E3A\u8D1F),\u901A\u5E38\u662F\u4F4D\u57DF\u88AB\u632A\u7528\u6216\u624B\u5DE5\u6784\u9020\u3002");
        }
        if (ver === 2) out.notes.push("v2 \u7684 time_low \u5B57\u6BB5\u88AB\u5C40\u90E8\u6807\u8BC6\u7B26\u5360\u7528,\u4E0A\u9762\u7684\u65F6\u95F4\u8FD8\u539F\u5BF9 v2 \u65E0\u610F\u4E49(\u7ED3\u6784\u4FDD\u7559\u4EC5\u4F9B\u4F4D\u57DF\u6838\u5BF9)\u3002");
        const node = v & 0xffffffffffffn;
        if (ver === 1) {
          out.fields.nodeHex = node.toString(16).padStart(12, "0");
          out.fields.multicastBit = (node >> 40n & 1n) === 1n;
          if (out.fields.multicastBit) out.notes.push("\u8282\u70B9\u5B57\u6BB5 multicast \u4F4D\u7F6E 1:\u968F\u673A\u751F\u6210(\u9690\u79C1\u4FDD\u62A4),\u4E0D\u662F\u771F\u5B9E MAC \u5730\u5740\u3002");
          else out.notes.push("\u8282\u70B9\u5B57\u6BB5 multicast \u4F4D\u4E3A 0:\u6309\u89C4\u8303\u5E94\u662F\u751F\u6210\u4E3B\u673A\u7684 MAC \u5730\u5740(\u9690\u79C1\u98CE\u9669,\u73B0\u4EE3\u5B9E\u73B0\u5DF2\u5F03\u7528)\u3002");
        }
      } else if (ver === 7) {
        const ts = v >> 80n & 0xffffffffffffn;
        const randA = v >> 64n & 0xfffn;
        const randB = v & 0x3fffffffffffffn;
        seg("unix_ts_ms", 127, 80, ts, "48 \u4F4D Unix \u6BEB\u79D2");
        seg("ver", 79, 76, ver, "\u7248\u672C\u4F4D(4)");
        seg("rand_a", 75, 64, randA, "12 \u4F4D\u968F\u673A(\u53EF\u4F5C\u5355\u8C03\u8BA1\u6570\u5668)");
        seg("var", 63, 62, variantBits, "\u53D8\u4F53\u4F4D(2)");
        seg("rand_b", 61, 0, randB, "62 \u4F4D\u968F\u673A");
        out.fields.epochMs = ts.toString();
        out.fields.time = isoFromEpochMs(ts) || null;
        out.fields.dow = DOW_LABELS[dowFromEpochMs(ts)];
      } else if (ver === 4) {
        seg("random", 127, 80, v >> 80n & 0xffffffffffffn, "\u968F\u673A(\u9AD8 48 \u4F4D)");
        seg("ver", 79, 76, ver, "\u7248\u672C\u4F4D(4)");
        seg("random", 75, 64, v >> 64n & 0xfffn, "\u968F\u673A(\u4E2D 12 \u4F4D)");
        seg("var", 63, 62, variantBits, "\u53D8\u4F53\u4F4D(2)");
        seg("random", 61, 0, v & 0x3fffffffffffffn, "\u968F\u673A(\u4F4E 62 \u4F4D;\u53D8\u4F53\u4F4D\u5DF2\u5D4C\u5176\u4E2D)");
        out.fields.randomBits = "122 \u4F4D\u968F\u673A,\u65E0\u65F6\u95F4\u4FE1\u606F";
      } else {
        seg("a", 127, 96, v >> 96n & 0xffffffffn, ver === 3 || ver === 5 ? "\u540D\u5B57\u6563\u5217\u9AD8 32 \u4F4D(\u4E0D\u53EF\u9006)" : "\u81EA\u5B9A\u4E49/\u5360\u4F4D");
        seg("b", 95, 80, v >> 80n & 0xffffn, ver === 3 || ver === 5 ? "\u6563\u5217\u4E2D 16 \u4F4D" : "\u81EA\u5B9A\u4E49/\u5360\u4F4D");
        seg("ver", 79, 76, ver, "\u7248\u672C\u4F4D(4)");
        seg("c", 75, 64, v >> 64n & 0xfffn, ver === 3 || ver === 5 ? "\u6563\u5217\u6B21 12 \u4F4D" : "\u81EA\u5B9A\u4E49/\u5360\u4F4D");
        seg("var", 63, 62, variantBits, "\u53D8\u4F53\u4F4D(2)");
        seg("d", 61, 0, v & 0x3fffffffffffffn, ver === 3 || ver === 5 ? "\u6563\u5217\u4F4E 62 \u4F4D" : "\u81EA\u5B9A\u4E49/\u5360\u4F4D");
        if (ver === 3 || ver === 5) out.notes.push("\u540D\u5B57\u7A7A\u95F4\u6563\u5217\u7248\u672C:\u5185\u5BB9 = Hash(namespace, name),\u4E0D\u53EF\u8FD8\u539F;\u91CD\u7B97\u9700\u8981\u539F namespace \u4E0E name(\u672C\u5DE5\u5177\u4E0D\u505A)\u3002");
      }
      return out;
    }
    function ulidDecode(s) {
      const bad = [];
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if ("ILOU".includes(ch)) bad.push({ pos: i + 1, ch });
      }
      if (bad.length) {
        return { ok: false, error: { code: "ULID_CONFUSABLE", message: `ULID \u542B Crockford \u6392\u9664\u5B57\u6BCD:${bad.slice(0, 5).map((b) => `\u7B2C ${b.pos} \u4F4D\u300C${b.ch}\u300D`).join("\u3001")}`, hint: "ULID \u5B57\u6BCD\u8868\u662F 0-9 + A-Z \u53BB\u6389 I\u3001L\u3001O\u3001U(\u9632\u624B\u6284\u6DF7\u6DC6)\u3002O\u21920\u3001I/L\u21921 \u662F\u5E38\u89C1\u624B\u6284\u9519;\u82E5\u786E\u8BA4\u662F\u6284\u5199\u8BEF\u5DEE\u53EF\u624B\u52A8\u66FF\u6362\u540E\u91CD\u8BD5\u3002" } };
      }
      let v = 0n;
      for (const ch of s) v = v << 5n | CROCKFORD_DECODE.get(ch);
      const overflow = v >> 128n;
      v &= (1n << 128n) - 1n;
      return { ok: true, v, overflow, ts: v >> 80n, rand: v & (1n << 80n) - 1n };
    }
    function ulidEncode(v) {
      let rest = v & (1n << 128n) - 1n;
      const chars = new Array(26);
      for (let i = 25; i >= 0; i--) {
        chars[i] = CROCKFORD[Number(rest & 31n)];
        rest >>= 5n;
      }
      return chars.join("");
    }
    function parseUlid(canon, shape, opts) {
      const dec = ulidDecode(canon);
      if (!dec.ok) return { ...dec, family: "ulid" };
      const v = dec.v;
      const ts = v >> 80n;
      const rand = v & (1n << 80n) - 1n;
      const out = {
        family: "ulid",
        shape,
        canonical: canon,
        hex128: v.toString(16).padStart(32, "0"),
        decimal: v.toString(),
        segments: [],
        fields: {},
        notes: []
      };
      out.segments.push({ name: "unix_ts_ms", hi: 127, lo: 80, value: ts.toString(), note: "48 \u4F4D Unix \u6BEB\u79D2(\u53EF\u6392\u5E8F)" });
      out.segments.push({ name: "randomness", hi: 79, lo: 0, value: rand.toString(), note: "80 \u4F4D\u968F\u673A" });
      out.fields.epochMs = ts.toString();
      out.fields.time = isoFromEpochMs(ts) || null;
      out.fields.dow = DOW_LABELS[dowFromEpochMs(ts)];
      out.fields.randomnessHex = rand.toString(16).padStart(20, "0");
      if (shape === "lowercase") out.notes.push("ULID \u89C4\u8303\u4EC5\u5927\u5199;\u5C0F\u5199\u53EF\u89E3\u7801(\u591A\u6570\u5B9E\u73B0\u5BBD\u5BB9)\u4F46\u975E\u89C4\u8303\u5F62\u6001,\u90E8\u5206\u4E25\u683C\u5B9E\u73B0\u4F1A\u62D2\u6536\u3002");
      if (dec.overflow !== 0n) out.notes.push("\u7F16\u7801\u503C\u8D85\u51FA 128 \u4F4D(\u524D 2 \u4F4D\u975E 0):\u7F16\u7801\u5668\u4E0D\u5408\u89C4,\u5DF2\u6309 128 \u4F4D\u622A\u65AD\u89E3\u8BFB\u3002");
      return out;
    }
    function parseSnowflake(canon, shape, opts) {
      const layout = opts && opts.layout === "discord" ? "discord" : "twitter";
      const ep = EPOCHS[layout];
      let v;
      try {
        v = BigInt(canon);
      } catch (_) {
        return { family: "snowflake", ok: false, error: { code: "SNOWFLAKE_RANGE", message: "\u6570\u5B57\u8D85\u51FA BigInt \u53EF\u89E3\u6790\u57DF" } };
      }
      if (v < 0n || v >> 64n !== 0n) {
        return { family: "snowflake", ok: false, error: { code: "SNOWFLAKE_RANGE", message: `${canon} \u4E0D\u5728 64 \u4F4D\u65E0\u7B26\u53F7\u57DF\u5185`, hint: "Snowflake \u5E03\u5C40 1+41+10+12=64 \u4F4D\u3002" } };
      }
      const sign = v >> 63n & 1n;
      const ts = v >> 22n & 0x1ffffffffffn;
      const machine = v >> 12n & 0x3ffn;
      const seq = v & 0xfffn;
      const epochMs = ep.epochMs + ts;
      const out = {
        family: "snowflake",
        shape,
        canonical: canon,
        layout,
        epochLabel: `${ep.label}(epoch=${ep.epochMs},\u5373 ${ep.note})`,
        decimal: v.toString(),
        hex64: v.toString(16).padStart(16, "0"),
        segments: [],
        fields: {},
        notes: []
      };
      out.segments.push({ name: "sign", hi: 63, lo: 63, value: sign.toString(), note: "\u7B26\u53F7\u4F4D(\u89C4\u8303\u6052 0)" });
      out.segments.push({ name: "delta_ms", hi: 62, lo: 22, value: ts.toString(), note: `41 \u4F4D\u6BEB\u79D2,\u81EA ${ep.label} \u7EAA\u5143\u8D77` });
      out.segments.push({ name: "machine", hi: 21, lo: 12, value: machine.toString(), note: "10 \u4F4D\u673A\u5668(worker+datacenter;Twitter \u60EF\u4F8B 5+5 \u62C6\u5206\u662F\u90E8\u7F72\u7EA6\u5B9A)" });
      out.segments.push({ name: "seq", hi: 11, lo: 0, value: seq.toString(), note: "12 \u4F4D\u540C\u6BEB\u79D2\u5E8F\u5217(\u5355\u673A\u6BCF\u6BEB\u79D2 \u22644096)" });
      out.fields.epochMs = epochMs.toString();
      out.fields.time = isoFromEpochMs(epochMs) || null;
      out.fields.dow = DOW_LABELS[dowFromEpochMs(epochMs)];
      out.fields.machine = machine.toString();
      out.fields.seq = seq.toString();
      if (sign !== 0n) {
        return { family: "snowflake", ok: false, error: { code: "SNOWFLAKE_SIGN", message: `${canon} \u7684\u7B26\u53F7\u4F4D\u4E3A 1:\u4E0D\u5728\u6807\u51C6 Snowflake \u503C\u57DF\u5185(\u5408\u6CD5\u503C\u6700\u9AD8\u4F4D\u6052 0,2^63 \u4EE5\u4E0A\u5373\u8D8A\u754C)`, hint: "\u82E5\u6765\u6E90\u7CFB\u7EDF\u786E\u5B9E\u4EA7\u751F\u6B64\u7C7B\u503C,\u8BF4\u660E\u5176\u4F4D\u5E03\u5C40\u4E0E\u672C\u5DE5\u5177\u5047\u8BBE\u7684 1+41+10+12 \u4E0D\u540C,\u987B\u6309\u5176\u5B9E\u9645\u5E03\u5C40\u89E3\u8BFB\u3002" } };
      }
      const maxTs = (1n << 41n) - 1n;
      out.fields.epochExhaustAt = isoFromEpochMs(ep.epochMs + maxTs);
      if (ts === maxTs) out.notes.push(`\u65F6\u95F4\u6233\u5DF2\u5230 41 \u4F4D\u4E0A\u9650(${out.fields.epochExhaustAt}):\u4E34\u8FD1\u8017\u5C3D\u3002`);
      else if (ts > maxTs - 90n * 24n * 3600000n) out.notes.push("\u65F6\u95F4\u6233\u8DDD 41 \u4F4D\u4E0A\u9650\u4E0D\u8DB3 90 \u5929\u3002");
      return out;
    }
    function parseId(input, opts) {
      const det = detectFamily(input, opts);
      if (det.family === "unknown") return { ok: false, error: det.error };
      let r;
      if (det.family === "uuid") r = parseUuid(det.canon, det.shape, opts);
      else if (det.family === "ulid") r = parseUlid(det.canon, det.shape, opts);
      else r = parseSnowflake(det.canon, det.shape, opts);
      if (r.ok === false) return r;
      return { ok: true, ...r, notes: r.notes || [] };
    }
    function nowMs() {
      return Date.now();
    }
    function validateId(input, opts) {
      const items = [];
      const push = (level, rule, message, hint) => items.push({ level, rule, message, hint: hint || "" });
      const p = parseId(input, opts);
      if (!p.ok) return { ok: false, items: [{ level: "error", rule: "unparseable", message: p.error.message, hint: p.error.hint || "" }] };
      const s = String(input).trim();
      if (p.family === "uuid") {
        if (p.shape === "braces") push("info", "shape-braces", "\u5E26\u5927\u62EC\u53F7\u5F62\u6001:\u5408\u6CD5(Windows/COM \u751F\u6001\u5E38\u7528),\u975E canonical\u3002");
        if (p.shape === "urn") push("info", "shape-urn", "URN \u5F62\u6001:\u5408\u6CD5(RFC 8141),\u975E canonical\u3002");
        if (p.shape === "hyphenless") push("info", "shape-hyphenless", "\u65E0\u8FDE\u5B57\u7B26\u5F62\u6001:\u591A\u6570\u89E3\u6790\u5668\u53EF\u8BFB,\u975E canonical \u5C55\u793A\u5F62\u6001\u3002");
        if (/[A-F]/.test(s.replace(/^\{|\}$/g, "").replace(/^urn:uuid:/i, ""))) push("info", "case-upper", "\u542B\u5927\u5199 hex:\u89E3\u6790\u5927\u5C0F\u5199\u4E0D\u654F\u611F,\u4F46\u89C4\u8303\u8F93\u51FA\u5E94\u4E3A\u5C0F\u5199(RFC 9562 \u5EFA\u8BAE)\u3002");
        if (p.variant !== 2) push("warn", "variant-nonrfc", `\u53D8\u4F53\u4F4D\u4E3A ${p.variant}(${p.variantNote}):\u975E RFC 9562 \u6807\u51C6\u53D8\u4F53(10xx),\u73B0\u4EE3\u5DE5\u5177\u94FE\u53EF\u80FD\u62D2\u6536\u3002`);
        if (!(p.version in UUID_VERSIONS)) push("warn", "version-undefined", `\u7248\u672C\u4F4D ${p.version}:RFC 9562 \u53EA\u5B9A\u4E49 1-8,\u8BE5\u503C\u4E3A\u672A\u5B9A\u4E49(\u624B\u5DE5\u6784\u9020\u6216\u672A\u6765\u7248\u672C)\u3002`);
        if (p.version === 0) push("warn", "version-zero", "\u7248\u672C\u4F4D 0:RFC 9562 \u672A\u5B9A\u4E49\u7248\u672C 0(\u5168\u96F6 nil \u9664\u5916)\u3002");
        if (p.fields.time && p.version >= 1 && p.version <= 8 && p.version !== 2 && p.version !== 3 && p.version !== 4 && p.version !== 5 && p.version !== 8) {
          const t = BigInt(p.fields.epochMs);
          if (t > BigInt(nowMs()) + 315360000000n) push("info", "time-future", `\u89E3\u6790\u65F6\u95F4 ${p.fields.time} \u5728 10 \u5E74\u540E:\u591A\u534A\u4E0D\u662F\u771F\u65F6\u95F4\u6233(\u4F4D\u57DF\u88AB\u632A\u7528)\u3002`);
        }
        if (p.version === 4 && p.variant === 1) {
        }
      } else if (p.family === "ulid") {
        if (p.shape === "lowercase") push("warn", "case-lower", "\u542B\u5C0F\u5199:ULID \u89C4\u8303\u4EC5\u5927\u5199,\u4E25\u683C\u5B9E\u73B0(\u90E8\u5206\u5E93\u7684\u4E25\u683C\u6A21\u5F0F)\u4F1A\u62D2\u6536\u3002");
        const ts = BigInt(p.fields.epochMs);
        if (ts > BigInt(nowMs()) + 315360000000n) push("info", "time-future", `\u65F6\u95F4\u6233 ${p.fields.time} \u5728 10 \u5E74\u540E:\u53EF\u80FD\u4E0D\u662F\u5408\u6CD5\u751F\u6210\u65F6\u95F4\u3002`);
        if (ts === 0n) push("info", "time-zero", "\u65F6\u95F4\u6233\u4E3A 0(1970-01-01):\u624B\u5DE5\u6784\u9020\u6216\u6D4B\u8BD5\u5411\u91CF\u3002");
      } else if (p.family === "snowflake") {
        if (p.canonical !== s) push("info", "leading-zeros", "\u542B\u524D\u5BFC\u96F6:\u6570\u503C\u7B49\u4EF7,\u975E\u89C4\u8303\u5341\u8FDB\u5236\u5F62\u6001\u3002");
        const ts = BigInt(p.fields.epochMs);
        if (ts > BigInt(nowMs()) + 315360000000n) push("info", "time-future", `\u65F6\u95F4\u6233 ${p.fields.time} \u5728 10 \u5E74\u540E:\u8BF7\u786E\u8BA4\u7EAA\u5143\u9009\u62E9\u662F\u5426\u6B63\u786E(Twitter \u4E0E Discord \u7EAA\u5143\u5DEE\u7EA6 4 \u5E74)\u3002`);
        const tw = parseSnowflake(p.canonical, p.shape, { layout: "twitter" });
        const dc = parseSnowflake(p.canonical, p.shape, { layout: "discord" });
        if (tw.fields && dc.fields && tw.fields.time !== dc.fields.time) {
          push("info", "epoch-ambiguous", `\u540C\u4E00\u6570\u5B57\u5728 Twitter \u7EAA\u5143\u4E0B\u662F ${tw.fields.time},\u5728 Discord \u7EAA\u5143\u4E0B\u662F ${dc.fields.time}\u2014\u2014Snowflake \u65F6\u95F4\u8FD8\u539F\u5F3A\u4F9D\u8D56\u7EAA\u5143\u5047\u8BBE,\u62FF\u9519\u7EAA\u5143\u7ED3\u8BBA\u5DEE ${Number((EPOCHS.discord.epochMs - EPOCHS.twitter.epochMs) / 60000n)} \u5206\u949F\xD7(1/60)\u5C0F\u65F6\u7EA7\u504F\u5DEE\u3002`);
        }
      }
      if (p.family === "uuid" || p.family === "ulid") {
        const v = BigInt("0x" + p.hex128);
        if (v === 0n) push("info", "nil-id", "\u5168\u96F6\u6807\u8BC6\u7B26:UUID \u5BB6\u65CF\u662F\u4FDD\u7559\u7684 nil UUID;ULID \u5BB6\u65CF\u662F\u65F6\u95F4\u6233 0 \u7684\u5408\u6CD5\u5F62\u6001\u3002");
        if (p.family === "uuid" && v === (1n << 128n) - 1n) push("info", "max-uuid", "\u5168 F:RFC 9562 \u4FDD\u7559\u7684 max UUID(\u6392\u5E8F\u54E8\u5175\u7528)\u3002");
      }
      return { ok: true, items, parsed: p };
    }
    var CONVERT_TARGETS = ["canonical", "uppercase", "urn", "braces", "hyphenless", "decimal", "bitstring", "hex128", "ulid", "snowflake-decimal"];
    function convertId(input, to, opts) {
      const target = String(to || "").trim();
      if (CONVERT_TARGETS.indexOf(target) === -1) {
        return { ok: false, error: { code: "BAD_TARGET", message: `\u672A\u77E5\u76EE\u6807\u5F62\u6001 ${target}`, hint: `\u652F\u6301:${CONVERT_TARGETS.join(" / ")}` } };
      }
      const p = parseId(input, opts);
      if (!p.ok) return p;
      const is128 = p.family !== "snowflake";
      if ((target === "ulid" || target === "canonical" || target === "uppercase" || target === "urn" || target === "braces" || target === "hyphenless") && !is128) {
        return { ok: false, error: { code: "WIDTH", message: `Snowflake \u53EA\u6709 64 \u4F4D,\u4E0D\u80FD\u8F6C\u4E3A ${target}(ULID/UUID \u5BB6\u65CF\u5F62\u6001\u9700\u8981 128 \u4F4D)`, hint: "Snowflake \u53EF\u8F6C:decimal / bitstring / hex64\u3002" } };
      }
      const v = is128 ? BigInt("0x" + p.hex128) : BigInt(p.canonical);
      const out = { ok: true, family: p.family, from: p.shape, to: target, value: null, notes: [] };
      const hex = v.toString(16).padStart(32, "0");
      const canon = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      switch (target) {
        case "canonical":
          out.value = canon;
          break;
        case "uppercase":
          out.value = canon.toUpperCase();
          break;
        case "urn":
          out.value = "urn:uuid:" + canon;
          break;
        case "braces":
          out.value = "{" + canon + "}";
          break;
        case "hyphenless":
          out.value = hex;
          break;
        case "decimal":
          out.value = v.toString();
          break;
        case "bitstring":
          out.value = v.toString(2).padStart(is128 ? 128 : 64, "0");
          break;
        case "hex128":
          out.value = is128 ? hex : v.toString(16).padStart(16, "0");
          break;
        case "ulid":
          out.value = ulidEncode(v);
          if (p.family === "uuid") out.notes.push("\u7F16\u7801\u5C42\u4E92\u8F6C:\u4F4D\u76F8\u540C\u3001\u7F16\u7801\u4E0D\u540C;\u539F UUID \u7684\u7248\u672C/\u53D8\u4F53\u4F4D\u5728 ULID \u8BED\u5883\u4E0B\u4F1A\u88AB\u89E3\u8BFB\u4E3A\u300C\u65F6\u95F4\u6233(\u9AD8 48 \u4F4D)\u300D,\u8BED\u4E49\u4E0D\u4FDD\u8BC1\u3002");
          break;
        case "snowflake-decimal":
          if (!is128) out.value = p.canonical;
          else {
            if (v >> 64n !== 0n) return { ok: false, error: { code: "WIDTH", message: "\u8BE5 128 \u4F4D\u6807\u8BC6\u7B26\u9AD8 64 \u4F4D\u975E\u96F6,\u65E0\u6CD5\u65E0\u635F\u88C5\u5165 Snowflake(64 \u4F4D)", hint: "\u7528 decimal/bitstring \u8F93\u51FA\u5168\u503C\u3002" } };
            out.value = v.toString();
            out.notes.push("\u53D6\u4F4E 64 \u4F4D\u91CD\u89E3\u91CA\u4E3A Snowflake:\u65F6\u95F4/\u673A\u5668\u5B57\u6BB5\u8BED\u4E49\u4E0D\u4FDD\u8BC1\u3002");
          }
          break;
        default:
          return { ok: false, error: { code: "BAD_TARGET", message: `\u76EE\u6807 ${target} \u672A\u5B9E\u73B0` } };
      }
      out.roundTrip = null;
      if (target === "bitstring" || target === "decimal" || target === "hex128") out.roundTrip = true;
      return out;
    }
    module2.exports = {
      detectFamily,
      parseId,
      parseUuid,
      parseUlid,
      parseSnowflake,
      validateId,
      convertId,
      ulidEncode,
      ulidDecode,
      isoFromEpochMs,
      dowFromEpochMs,
      stripUuidShell,
      uuidNearMiss,
      EPOCHS,
      UUID_VERSIONS,
      VARIANT_NAMES,
      CONVERT_TARGETS,
      GREGORIAN_100NS_OFFSET
    };
  }
});

// mcp/server-src.js
var core = require_id_core();
var SERVER_INFO = { name: "id-lens", version: "0.1.0" };
var LAYOUT_DESC = "layout \u53EF\u9009 twitter(\u7EAA\u5143 2010-11-04T01:42:54.657Z)\u6216 discord(\u7EAA\u5143 2015-01-01),\u7F3A\u7701 twitter\u3002Snowflake \u65F6\u95F4\u8FD8\u539F\u5F3A\u4F9D\u8D56\u7EAA\u5143\u5047\u8BBE\u3002";
var TOOLS = [
  {
    name: "id_lens_parse",
    description: "\u89E3\u6790\u6807\u8BC6\u7B26:\u81EA\u52A8\u8BC6\u522B UUID(v1-v8,\u652F\u6301 canonical/urn/braces/\u65E0\u8FDE\u5B57\u7B26\u5F62\u6001)/ULID(26 \u5B57\u7B26 Crockford Base32)/Snowflake \u96EA\u82B1 ID(\u7EAF\u6570\u5B57 \u226420 \u4F4D),\u8FD4\u56DE\u5BB6\u65CF\u3001\u7248\u672C/\u53D8\u4F53\u3001\u4F4D\u57DF\u9010\u6BB5\u89E3\u8BFB\u4E0E\u65F6\u95F4\u8FD8\u539F\u3002\u6240\u6709\u8D85\u8FC7 2^53 \u7684\u6570\u503C\u4EE5\u5B57\u7B26\u4E32\u8F93\u51FA(\u9632\u7CBE\u5EA6\u4E22\u5931)\u3002" + LAYOUT_DESC,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "\u6807\u8BC6\u7B26(UUID/ULID/Snowflake \u4EFB\u4E00\u5F62\u6001)" },
        layout: { type: "string", enum: ["twitter", "discord"], description: "Snowflake \u7EAA\u5143\u5E03\u5C40,\u7F3A\u7701 twitter" }
      },
      required: ["id"]
    }
  },
  {
    name: "id_lens_bits",
    description: "\u4F4D\u57DF\u5206\u89E3:\u7ED9\u51FA\u6807\u8BC6\u7B26\u7684\u9AD8\u4F4E\u4F4D\u5206\u6BB5\u8868(\u4F4D\u6BB5\u540D/\u4F4D\u53F7\u8303\u56F4/\u503C/\u542B\u4E49)\u4E0E\u4E8C\u8FDB\u5236\u4F4D\u56FE,\u7528\u4E8E\u6838\u5BF9\u534F\u8BAE\u5E03\u5C40\u6216\u6392\u67E5\u4F4D\u632A\u7528\u3002",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "\u6807\u8BC6\u7B26" },
        layout: { type: "string", enum: ["twitter", "discord"], description: "Snowflake \u7EAA\u5143\u5E03\u5C40,\u7F3A\u7701 twitter" }
      },
      required: ["id"]
    }
  },
  {
    name: "id_lens_validate",
    description: "\u89C4\u8303\u6027\u6821\u9A8C:\u7248\u672C\u4F4D/\u53D8\u4F53\u4F4D\u662F\u5426\u5728 RFC 9562 \u5B9A\u4E49\u5185\u3001\u5927\u5C0F\u5199\u4E0E\u5F62\u6001\u5408\u89C4\u6027\u3001ULID Crockford \u6392\u9664\u5B57\u6BCD(I/L/O/U)\u5B9A\u4F4D\u3001Snowflake \u524D\u5BFC\u96F6/\u7EAA\u5143\u6B67\u4E49(Twitter vs Discord \u5BF9\u7167)/41 \u4F4D\u8017\u5C3D\u65F6\u95F4\u3001\u65F6\u95F4\u6233\u5408\u7406\u6027(\u8FDC\u672A\u6765\u63D0\u793A)\u3002\u9010\u6761\u7ED9\u7EA7\u522B(error/warn/info)+ \u89C4\u5219\u540D + \u4FEE\u590D\u5EFA\u8BAE\u3002",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "\u6807\u8BC6\u7B26" },
        layout: { type: "string", enum: ["twitter", "discord"], description: "Snowflake \u7EAA\u5143\u5E03\u5C40,\u7F3A\u7701 twitter" }
      },
      required: ["id"]
    }
  },
  {
    name: "id_lens_convert",
    description: "\u5F62\u6001\u4E92\u8F6C:canonical / uppercase / urn / braces / hyphenless(\u65E0\u8FDE\u5B57\u7B26)/ decimal(\u5341\u8FDB\u5236)/ bitstring(\u4E8C\u8FDB\u5236)/ hex128 / ulid(128 \u4F4D\u5BB6\u65CF\u2194ULID \u7F16\u7801,\u8BED\u4E49\u4E0D\u4FDD\u8BC1\u4F1A\u5982\u5B9E\u6807\u6CE8)\u3002Snowflake(64 \u4F4D)\u4E0D\u80FD\u8F6C 128 \u4F4D\u5BB6\u65CF\u5F62\u6001(\u4F4D\u5BBD\u4E0D\u8DB3,\u5982\u5B9E\u62A5\u9519)\u3002",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "\u6807\u8BC6\u7B26" },
        to: { type: "string", description: "\u76EE\u6807\u5F62\u6001:" + core.CONVERT_TARGETS.join(" / ") },
        layout: { type: "string", enum: ["twitter", "discord"], description: "Snowflake \u7EAA\u5143\u5E03\u5C40,\u7F3A\u7701 twitter" }
      },
      required: ["id", "to"]
    }
  }
];
function argLayout(args) {
  return args && args.layout === "discord" ? { layout: "discord" } : void 0;
}
function toolParse(args) {
  const p = core.parseId(args.id, argLayout(args));
  if (!p.ok) {
    const e = p.error;
    return { isError: true, text: `\u89E3\u6790\u5931\u8D25:${e.message}${e.hint ? `

${e.hint}` : ""}` };
  }
  const out = [];
  out.push(`\u8BC6\u522B:${labelOf(p.family)} \xB7 ${p.shape === "canonical" ? "\u89C4\u8303\u5F62\u6001" : `\u5F62\u6001 ${p.shape}`}`);
  if (p.version !== void 0) out.push(`\u7248\u672C ${p.version} \u2014\u2014 ${p.versionNote} | \u53D8\u4F53 ${p.variant}(${p.variantNote})`);
  if (p.layout) out.push(`Snowflake \u5E03\u5C40:${p.epochLabel}`);
  if (p.fields.time) out.push(`\u65F6\u95F4\u8FD8\u539F:${p.fields.time}${p.fields.dow ? "(" + p.fields.dow + ")" : ""}`);
  if (p.fields.epochMs) out.push(`Unix \u6BEB\u79D2:${p.fields.epochMs}`);
  if (p.fields.randomBits) out.push(`\u968F\u673A\u6027:${p.fields.randomBits}`);
  for (const n of p.notes) out.push(`- ${n}`);
  return { isError: false, text: out.join("\n") };
}
function labelOf(f) {
  if (f === "uuid") return "UUID";
  if (f === "ulid") return "ULID";
  if (f === "snowflake") return "Snowflake";
  return f;
}
function toolBits(args) {
  const p = core.parseId(args.id, argLayout(args));
  if (!p.ok) {
    const e = p.error;
    return { isError: true, text: `\u89E3\u6790\u5931\u8D25:${e.message}${e.hint ? `

${e.hint}` : ""}` };
  }
  const width = p.family === "snowflake" ? 64 : 128;
  const bits = p.family === "snowflake" ? p.hex64 : p.hex128;
  const bin = BigInt("0x" + bits).toString(2).padStart(width, "0");
  const out = [];
  out.push(`${labelOf(p.family)} \xB7 ${width} \u4F4D\u4F4D\u56FE(\u9AD8\u2192\u4F4E):`);
  out.push("```");
  for (let i = 0; i < bin.length; i += 64) out.push(bin.slice(i, i + 64));
  out.push("```");
  out.push("| \u4F4D\u6BB5 | \u4F4D\u53F7 | \u503C | \u542B\u4E49 |", "|---|---|---|---|");
  for (const s of p.segments) {
    out.push(`| ${s.name} | ${s.hi}..${s.lo} | \`${s.value}\` | ${s.note.replace(/\|/g, "\\|")} |`);
  }
  return { isError: false, text: out.join("\n") };
}
var LEVEL_LABEL = { error: "\u274C\u9519\u8BEF", warn: "\u26A0\uFE0F\u8B66\u544A", info: "\u2139\uFE0F\u63D0\u793A" };
function toolValidate(args) {
  const r = core.validateId(args.id, argLayout(args));
  if (!r.ok) {
    return { isError: true, text: r.items.map((i) => `${LEVEL_LABEL[i.level]} [${i.rule}] ${i.message}${i.hint ? `
  ${i.hint}` : ""}`).join("\n") };
  }
  if (r.items.length === 0) return { isError: false, text: "\u6821\u9A8C\u901A\u8FC7:\u672A\u53D1\u73B0\u89C4\u8303\u6027\u95EE\u9898(\u7248\u672C/\u53D8\u4F53\u5728 RFC 9562 \u5B9A\u4E49\u5185,\u5F62\u6001\u4E3A canonical,\u65F6\u95F4\u5408\u7406)\u3002" };
  const out = [`\u6821\u9A8C\u5B8C\u6210:${r.items.length} \u6761\u63D0\u793A`, ""];
  for (const i of r.items) out.push(`- ${LEVEL_LABEL[i.level]} \`${i.rule}\` ${i.message}${i.hint ? ` \u2014\u2014 ${i.hint}` : ""}`);
  return { isError: false, text: out.join("\n") };
}
function toolConvert(args) {
  const r = core.convertId(args.id, args.to, argLayout(args));
  if (!r.ok) {
    const e = r.error;
    return { isError: true, text: `\u8F6C\u6362\u5931\u8D25:${e.message}${e.hint ? `

${e.hint}` : ""}` };
  }
  const out = [`\u8F6C\u6362\u6210\u529F(${r.from} \u2192 ${r.to}):`, "", "```", String(r.value), "```"];
  for (const n of r.notes) out.push(`- ${n}`);
  return { isError: false, text: out.join("\n") };
}
var HANDLERS = {
  id_lens_parse: toolParse,
  id_lens_bits: toolBits,
  id_lens_validate: toolValidate,
  id_lens_convert: toolConvert
};
function write(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
var buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  buf += c;
  for (; ; ) {
    const i = buf.indexOf("\n");
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on("end", () => process.exit(0));
function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    write({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === "notifications/initialized" || (method || "").startsWith("notifications/")) return;
  if (method === "tools/list") {
    write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }
  if (method === "tools/call") {
    const name = params && params.name;
    const handler = HANDLERS[name];
    if (!handler) {
      write({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `\u672A\u77E5\u5DE5\u5177:${name}\u3002\u53EF\u7528:${TOOLS.map((t) => t.name).join(", ")}` }] } });
      return;
    }
    try {
      const r = handler(params && params.arguments || {});
      write({ jsonrpc: "2.0", id, result: { isError: !!r.isError, content: [{ type: "text", text: r.text }] } });
    } catch (e) {
      process.stderr.write(`[id-lens] tool ${name} \u5F02\u5E38: ${e && e.stack ? e.stack : e}
`);
      write({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `\u5DE5\u5177\u5185\u90E8\u9519\u8BEF:${e && e.message ? e.message : String(e)}` }] } });
    }
    return;
  }
  if (method === "ping") {
    write({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  write({ jsonrpc: "2.0", id: id === void 0 ? null : id, error: { code: -32601, message: `Method not found: ${method}` } });
}
process.stderr.write(`[id-lens] MCP server ${SERVER_INFO.version} ready (stdio)
`);
