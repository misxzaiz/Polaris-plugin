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

// shared/encoding-core.js
var require_encoding_core = __commonJS({
  "shared/encoding-core.js"(exports, module) {
    "use strict";
    var U8 = (s) => new TextEncoder().encode(s);
    function strictDecode2(bytes, encoding) {
      try {
        return { ok: true, text: new TextDecoder(encoding, { fatal: true }).decode(bytes), error: "" };
      } catch (e) {
        return { ok: false, text: "", error: e && e.message ? e.message : String(e) };
      }
    }
    function bytesToHex2(bytes, sep) {
      const s = sep === void 0 ? " " : sep;
      const out = [];
      for (let i = 0; i < bytes.length; i++) out.push(bytes[i].toString(16).padStart(2, "0"));
      return s === "" ? out.join("") : out.join(s);
    }
    function hexToBytes2(hex) {
      const clean = String(hex).replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
      if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0 || clean.length === 0) return null;
      const out = new Uint8Array(clean.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function base64Encode2(bytes) {
      let out = "";
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        out += B64_CHARS[b0 >> 2];
        out += B64_CHARS[(b0 & 3) << 4 | (b1 === void 0 ? 0 : b1) >> 4];
        out += b1 === void 0 ? "=" : B64_CHARS[(b1 & 15) << 2 | (b2 === void 0 ? 0 : b2) >> 6];
        out += b2 === void 0 ? "=" : B64_CHARS[b2 & 63];
      }
      return out;
    }
    function base64Decode2(str) {
      const clean = String(str).replace(/[\s\r\n]+/g, "").replace(/-/g, "+").replace(/_/g, "/");
      const cut = clean.indexOf("=");
      const body = cut === -1 ? clean : clean.slice(0, cut);
      if (!/^[A-Za-z0-9+/]*$/.test(body) || body.length % 4 === 1) return null;
      const out = [];
      let acc = 0, bits = 0;
      for (const ch of body) {
        acc = acc << 6 | B64_CHARS.indexOf(ch);
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out.push(acc >> bits & 255);
        }
      }
      return Uint8Array.from(out);
    }
    var COMMON_HANZI = new Set(
      "\u7684\u4E00\u662F\u4E86\u6211\u4E0D\u4EBA\u5728\u4ED6\u6709\u8FD9\u4E0A\u4EEC\u6765\u5230\u65F6\u5927\u5730\u4E3A\u5B50\u4E2D\u4F60\u8BF4\u751F\u56FD\u5E74\u7740\u5C31\u90A3\u548C\u8981\u5979\u51FA\u4E5F\u5F97\u91CC\u540E\u81EA\u4EE5\u4F1A\u5BB6\u53EF\u4E0B\u800C\u8FC7\u5929\u53BB\u80FD\u5BF9\u5C0F\u591A\u7136\u4E8E\u5FC3\u5B66\u4E48\u4E4B\u90FD\u597D\u770B\u8D77\u53D1\u5F53\u6CA1\u6210\u53EA\u5982\u4E8B\u628A\u8FD8\u7528\u7B2C\u6837\u9053\u60F3\u4F5C\u79CD\u5F00\u7F8E\u603B\u4ECE\u65E0\u60C5\u5DF1\u9762\u6700\u5973\u4F46\u73B0\u524D\u4E9B\u6240\u540C\u65E5\u624B\u53C8\u884C\u610F\u52A8\u65B9\u671F\u5B83\u5934\u7ECF\u957F\u513F\u56DE\u4F4D\u5206\u7231\u8001\u56E0\u5F88\u7ED9\u540D\u6CD5\u95F4\u65AF\u77E5\u4E16\u4EC0\u4E24\u6B21\u4F7F\u8EAB\u8005\u88AB\u9AD8\u5DF2\u4EB2\u5176\u8FDB\u6B64\u8BDD\u5E38\u4E0E\u6D3B\u6B63\u7406\u4FE1\u606F New \u6587\u4EF6\u6D4B\u8BD5\u6570\u636E".replace(/[^一-鿿]/g, "").split("")
    );
    function scoreText(text, opts) {
      if (!text.length) return 0;
      const multibyteStats = !!(opts && opts.multibyteStats);
      let score = 0;
      let hanzi = 0, kana = 0, hangul = 0, latinExt = 0, c1ctrl = 0, fffd = 0, pua = 0;
      let latinRun = 0, mojibakeRuns = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === 65533) {
          fffd++;
          latinRun = 0;
          continue;
        }
        if (cp >= 128 && cp <= 159) {
          c1ctrl++;
          latinRun = 0;
          continue;
        }
        if (cp >= 57344 && cp <= 63743) {
          pua++;
          latinRun = 0;
          continue;
        }
        if (cp >= 19968 && cp <= 40959) {
          hanzi++;
          latinRun = 0;
          score += COMMON_HANZI.has(ch) ? 1 : 0.35;
        } else if (cp >= 12352 && cp <= 12543 || cp === 12540) {
          kana++;
          latinRun = 0;
          score += 0.9;
        } else if (cp >= 44032 && cp <= 55215) {
          hangul++;
          latinRun = 0;
          score += 0.2;
        } else if (cp >= 192 && cp <= 591 || cp >= 7680 && cp <= 7935) {
          latinExt++;
          latinRun++;
          if (latinRun >= 2) mojibakeRuns++;
          score += latinRun >= 2 ? -1.2 : 0;
        } else if (cp < 127) {
          latinRun = 0;
          const c = String.fromCodePoint(cp);
          score += /[A-Za-z0-9]/.test(c) ? 0.3 : /[ \t\r\n.,;:!?'"()\-_/@#=]/.test(c) ? 0.15 : 0;
        } else if (cp >= 12288 && cp <= 12351) {
          latinRun = 0;
          score += 0.4;
        } else if (cp === 160) {
          score -= 0.2;
        } else if (cp >= 9472 && cp <= 9727) {
        } else {
          score -= 0.05;
          latinRun = 0;
        }
      }
      const len = [...text].length;
      if (len > 0 && hangul / len > 0.5 && hanzi / len < 0.15) score += len * 0.8;
      score -= fffd * 4 + c1ctrl * 2 + pua * 1.5;
      if (multibyteStats && len >= 12) {
        const freq = /* @__PURE__ */ new Map();
        for (const ch of text) freq.set(ch, (freq.get(ch) || 0) + 1);
        const topShare = [...freq.values()].sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0) / len;
        const baseline = Math.min(10, len) / len;
        score += (topShare - baseline) * len * 2.5;
      }
      const norm = 50 + score / Math.max(len, 1) * 60;
      return norm;
    }
    var LEAD = { gbk: [129, 254], big5: [129, 254], shift_jis: [129, 159], "euc-kr": [129, 253], "euc-jp": [129, 143] };
    var CHARSET_ALIASES = {
      utf8: "utf-8",
      "utf-8": "utf-8",
      utf16le: "utf-16le",
      "utf-16le": "utf-16le",
      utf16be: "utf-16be",
      latin1: "latin1",
      "iso-8859-1": "latin1",
      cp1252: "windows-1252",
      "windows-1252": "windows-1252",
      gbk: "gbk",
      gb2312: "gbk",
      gb18030: "gb18030",
      big5: "big5",
      big5hkscs: "big5hkscs",
      shift_jis: "shift_jis",
      sjis: "shift_jis",
      "shift-jis": "shift_jis",
      euc_jp: "euc-jp",
      "euc-jp": "euc-jp",
      euc_kr: "euc-kr",
      "euc-kr": "euc-kr",
      utf16: "utf-16le"
    };
    function normalizeCharset(name) {
      const k = String(name || "").trim().toLowerCase().replace(/_/g, "-");
      if (CHARSET_ALIASES[k]) return CHARSET_ALIASES[k];
      return k;
    }
    var encMaps = /* @__PURE__ */ new Map();
    var SINGLE_BYTE_SPECIALS = {
      gbk: [[128, 8364]],
      shift_jis: (() => {
        const a = [];
        for (let b = 161; b <= 223; b++) a.push([b, 65377 + (b - 161)]);
        return a;
      })()
    };
    function getDoubleByteMap(charset) {
      const cs = normalizeCharset(charset);
      if (encMaps.has(cs)) return encMaps.get(cs);
      const range = LEAD[cs];
      if (!range) return null;
      const dec = new TextDecoder(cs);
      const fatalDec = new TextDecoder(cs, { fatal: true });
      const map = /* @__PURE__ */ new Map();
      const buf = new Uint8Array(2);
      for (let b1 = range[0]; b1 <= range[1]; b1++) {
        const trails = cs === "shift_jis" ? [[64, 126], [128, 252]] : [[64, 254]];
        for (const [t0, t1] of trails) {
          for (let b2 = t0; b2 <= t1; b2++) {
            if (b2 === 127) continue;
            buf[0] = b1;
            buf[1] = b2;
            let ch;
            try {
              ch = fatalDec.decode(buf);
            } catch (_) {
              try {
                ch = dec.decode(buf);
              } catch (_2) {
                continue;
              }
            }
            if (ch === "\uFFFD" || ch === "\0") continue;
            if (!map.has(ch)) map.set(ch, [b1, b2]);
          }
        }
      }
      const specials = SINGLE_BYTE_SPECIALS[cs];
      if (specials) {
        for (const [b, cp] of specials) if (!map.has(String.fromCodePoint(cp))) map.set(String.fromCodePoint(cp), [b]);
      }
      encMaps.set(cs, map);
      return map;
    }
    var CP1252_HIGH_MAP = /* @__PURE__ */ new Map([
      [128, "\u20AC"],
      [130, "\u201A"],
      [131, "\u0192"],
      [132, "\u201E"],
      [133, "\u2026"],
      [134, "\u2020"],
      [135, "\u2021"],
      [136, "\u02C6"],
      [137, "\u2030"],
      [138, "\u0160"],
      [139, "\u2039"],
      [140, "\u0152"],
      [142, "\u017D"],
      [145, "\u2018"],
      [146, "\u2019"],
      [147, "\u201C"],
      [148, "\u201D"],
      [149, "\u2022"],
      [150, "\u2013"],
      [151, "\u2014"],
      [152, "\u02DC"],
      [153, "\u2122"],
      [154, "\u0161"],
      [155, "\u203A"],
      [156, "\u0153"],
      [158, "\u017E"],
      [159, "\u0178"]
    ]);
    function cp1252CharToByte(ch) {
      for (const [b, c] of CP1252_HIGH_MAP) if (c === ch) return b;
      return null;
    }
    function decodeCp1252(bytes) {
      let out = "";
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b >= 128 && b <= 159) {
          const c = CP1252_HIGH_MAP.get(b);
          out += c !== void 0 ? c : String.fromCharCode(b);
        } else out += String.fromCharCode(b);
      }
      return out;
    }
    function encodeText2(text, charset) {
      const cs = normalizeCharset(charset);
      if (cs === "utf-8") return { bytes: U8(text), unsupported: [] };
      if (cs === "utf-16le") {
        const out = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) {
          const cp = text.charCodeAt(i);
          out[i * 2] = cp & 255;
          out[i * 2 + 1] = cp >> 8;
        }
        return { bytes: out, unsupported: [] };
      }
      const unsupported = [];
      const chunks = [];
      if (cs === "latin1") {
        for (const ch of text) {
          const cp = ch.codePointAt(0);
          if (cp > 255) {
            unsupported.push(ch);
            chunks.push(63);
          } else chunks.push(cp);
        }
        return { bytes: Uint8Array.from(chunks), unsupported };
      }
      if (cs === "windows-1252") {
        for (const ch of text) {
          const cp = ch.codePointAt(0);
          if (cp <= 127 || cp >= 160 && cp <= 255) chunks.push(cp);
          else {
            const b = cp1252CharToByte(ch);
            if (b !== null) chunks.push(b);
            else if (cp >= 128 && cp <= 159) chunks.push(cp);
            else {
              unsupported.push(ch);
              chunks.push(63);
            }
          }
        }
        return { bytes: Uint8Array.from(chunks), unsupported };
      }
      const map = getDoubleByteMap(cs);
      if (!map) return { bytes: null, unsupported: [charset] };
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp < 128) {
          chunks.push(cp);
          continue;
        }
        const pair = map.get(ch);
        if (pair) {
          for (const b of pair) chunks.push(b);
          continue;
        }
        unsupported.push(ch);
        chunks.push(63);
      }
      return { bytes: Uint8Array.from(chunks), unsupported };
    }
    function hasBom(bytes) {
      if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) return "utf-8";
      if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 254) return "utf-16le";
      if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) return "utf-16be";
      return "";
    }
    function looksLikeUtf16(bytes) {
      if (bytes.length < 8) return 0;
      let zeroEven = 0, zeroOdd = 0, slots = 0;
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        slots++;
        if (bytes[i] === 0) zeroEven++;
        if (bytes[i + 1] === 0) zeroOdd++;
      }
      const oddShare = zeroOdd / slots, evenShare = zeroEven / slots;
      if (oddShare > 0.25 && oddShare > evenShare * 3) return "utf-16le";
      if (evenShare > 0.25 && evenShare > oddShare * 3) return "utf-16be";
      return "";
    }
    var MB_CANDIDATES = [
      // prior：简中 Windows 环境先验（GBK 与 EUC-KR 码域在 GB2312 区完全重叠、
      // 字符统计难分时，简中用户文件是 GBK 的概率压倒性高；真韩文 raw 分差 >40，
      // 先验不翻盘）
      { charset: "gbk", label: "GBK / GB2312\uFF08\u7B80\u4F53\u4E2D\u6587 Windows \u5E38\u7528\uFF09", prior: 8 },
      { charset: "big5", label: "Big5\uFF08\u7E41\u4F53\u4E2D\u6587\uFF09", prior: 0 },
      { charset: "shift_jis", label: "Shift_JIS\uFF08\u65E5\u6587\uFF09", prior: 0 },
      { charset: "euc-kr", label: "EUC-KR\uFF08\u97E9\u6587\uFF09", prior: 0 },
      { charset: "euc-jp", label: "EUC-JP\uFF08\u65E5\u6587\uFF09", prior: 0 },
      { charset: "gb18030", label: "GB18030\uFF08\u56FD\u6807\u8D85\u96C6\uFF0C\u515C\u5E95\uFF09", prior: -1 }
    ];
    function detectEncoding2(bytes) {
      const candidates = [];
      const clampS2 = (v) => Math.max(0, Math.min(100, v));
      const push = (charset, label, scoreRaw, note) => {
        if (scoreRaw <= 0) return;
        const prev = candidates.find((c) => c.charset === charset);
        if (prev) {
          if (scoreRaw > prev.scoreRaw) {
            prev.scoreRaw = scoreRaw;
            prev.label = label;
            prev.note = note || prev.note;
          }
          return;
        }
        candidates.push({ charset, label, scoreRaw, note: note || "" });
      };
      let lowCjk = 0;
      for (const b of bytes) if (b >= 129 && b <= 160) lowCjk++;
      const eucPenalty = lowCjk > 0 ? -40 : 0;
      const bom = hasBom(bytes);
      if (bom) {
        push(bom, "\u5E26 BOM \u7684 " + bom, 100, "BOM \u786E\u5B9A\u6027\u5224\u5B9A");
      }
      const utf8 = strictDecode2(bytes, "utf-8");
      const allAscii = utf8.ok && !bytes.some((b) => b > 127);
      if (utf8.ok) {
        const s = allAscii ? 95 : scoreText(utf8.text);
        push("utf-8", allAscii ? "ASCII\uFF08UTF-8 \u517C\u5BB9\uFF09" : "UTF-8", s, allAscii ? "\u7EAF ASCII\uFF0C\u4EFB\u4F55\u517C\u5BB9\u7F16\u7801\u90FD\u53EF\u8BFB" : "\u4E25\u683C UTF-8 \u6821\u9A8C\u901A\u8FC7");
      }
      if (allAscii && !bom) {
        return {
          bom,
          size: bytes.length,
          best: { charset: "utf-8", label: "ASCII\uFF08UTF-8 \u517C\u5BB9\uFF09", score: 95, note: "\u7EAF ASCII\uFF0C\u4EFB\u4F55\u517C\u5BB9\u7F16\u7801\u90FD\u53EF\u8BFB", confidence: "\u786E\u5B9A" },
          candidates: [{ charset: "utf-8", label: "ASCII\uFF08UTF-8 \u517C\u5BB9\uFF09", score: 95, note: "\u7EAF ASCII\uFF0C\u4EFB\u4F55\u517C\u5BB9\u7F16\u7801\u90FD\u53EF\u8BFB" }]
        };
      }
      const u16 = looksLikeUtf16(bytes);
      if (u16 && !bom) {
        const dec = strictDecode2(bytes, u16);
        if (dec.ok) push(u16, u16 === "utf-16le" ? "UTF-16LE" : "UTF-16BE", 92, "\u96F6\u5B57\u8282\u5947\u5076\u805A\u96C6\u6A21\u5F0F");
      }
      for (const cand of MB_CANDIDATES) {
        if (bom && bom !== "utf-16le" && cand.charset === "gb18030") continue;
        const dec = strictDecode2(bytes, cand.charset);
        if (!dec.ok) continue;
        const penalty = cand.charset === "euc-kr" || cand.charset === "euc-jp" ? eucPenalty : 0;
        push(cand.charset, cand.label, scoreText(dec.text, { multibyteStats: false }) + cand.prior + penalty, penalty < 0 ? "\u7801\u57DF\u542B 0x81-0xA0 \u5B57\u8282\uFF0C\u975E EUC \u7CFB\u5408\u6CD5\u8303\u56F4" : "");
      }
      const l1 = strictDecode2(bytes, "latin1");
      if (l1.ok) push("latin1", "Latin-1 / ISO-8859-1", scoreText(l1.text), "\u6052\u53EF\u89E3\u7801\uFF0C\u4EC5\u5F53\u5176\u4ED6\u5019\u9009\u5168\u5F31\u65F6\u91C7\u4FE1");
      const w12 = strictDecode2(bytes, "latin1");
      if (w12.ok) push("windows-1252", "Windows-1252", scoreText(decodeCp1252(bytes)) + 1, "");
      candidates.sort((a, b) => b.scoreRaw - a.scoreRaw);
      const best = candidates[0] || { charset: "utf-8", label: "UTF-8", scoreRaw: 0, note: "" };
      const second = candidates[1];
      const gap = best.scoreRaw - (second ? second.scoreRaw : 0);
      const confidence = bom ? "\u786E\u5B9A" : gap >= 15 ? "\u9AD8" : gap >= 5 ? "\u4E2D" : "\u4F4E";
      const out = candidates.slice(0, 8).map((c) => ({
        charset: c.charset,
        label: c.label,
        note: c.note,
        score: Math.round(clampS2(c.scoreRaw) * 10) / 10
      }));
      const bestOut = { ...out.find((c) => c.charset === best.charset) || { charset: best.charset, label: best.label, score: Math.round(clampS2(best.scoreRaw) * 10) / 10, note: best.note }, confidence };
      return { bom, size: bytes.length, best: bestOut, candidates: out };
    }
    var FINGERPRINTS = [
      { re: /锟斤拷/, name: "\u951F\u65A4\u62F7", cause: "\u89E3\u7801\u5931\u8D25\u5360\u4F4D\u7B26 U+FFFD \u7684 UTF-8 \u5B57\u8282\u5E8F\u5217\uFF08EF BF BD\uFF09\u53C8\u88AB\u6309 GBK \u53CD\u590D\u8BFB\u51FA\u5E76\u5C42\u5C42\u6269\u6563\u7684\u4EA7\u7269", fix: "\u539F\u5B57\u8282\u5DF2\u635F\u574F\uFF08U+FFFD \u65E0\u4FE1\u606F\u91CF\uFF09\uFF0C\u53EA\u80FD\u4ECE\u6E90\u5934\u91CD\u65B0\u53D6\u6570\u636E\uFF0C\u672C\u53F0\u65E0\u6CD5\u9006\u5411\u8FD8\u539F" },
      { re: /烫烫烫|烫烫/, name: "\u70EB\u70EB\u70EB", cause: "MSVC Debug \u6A21\u5F0F\u672A\u521D\u59CB\u5316\u5806\u5185\u5B58\u586B\u5145 0xCC \u88AB\u5F53\u4F5C\u6587\u672C\u8BFB\u51FA", fix: "\u4E0D\u662F\u7F16\u7801\u95EE\u9898\u2014\u2014\u662F\u7A0B\u5E8F\u8BFB\u4E86\u672A\u521D\u59CB\u5316\u5185\u5B58\uFF0C\u53BB\u67E5\u6E90\u7801" },
      { re: /屯屯屯/, name: "\u5C6F\u5C6F\u5C6F", cause: "MSVC Debug \u6A21\u5F0F\u672A\u521D\u59CB\u5316\u5806\u5185\u5B58\u586B\u5145 0xCD \u88AB\u5F53\u4F5C\u6587\u672C\u8BFB\u51FA", fix: "\u4E0D\u662F\u7F16\u7801\u95EE\u9898\u2014\u2014\u662F\u7A0B\u5E8F\u8BFB\u4E86\u672A\u521D\u59CB\u5316\u5185\u5B58\uFF0C\u53BB\u67E5\u6E90\u7801" },
      { re: /[\u00c3\u00e2][\u0080-\u00bf\u00c0-\u00ff]/, name: "\xC3\xA2\xE2\u20AC \u578B\u897F\u6587\u4E71\u7801", cause: "UTF-8 \u5B57\u8282\u88AB\u6309 Latin-1 / Windows-1252 \u89E3\u7801\u7684\u5178\u578B\u5F62\u6001\uFF08\u6BCF 2 \u5B57\u7B26\u5BF9\u5E94\u539F 1 \u4E2A\u975E ASCII \u5B57\u7B26\uFF09", fix: "\u53EF\u81EA\u52A8\u4FEE\u590D\uFF1A\u91CD\u7F16\u7801\u56DE Latin-1/CP1252 \u5B57\u8282\u518D\u6309 UTF-8 \u89E3\u7801" },
      { re: /[\u00e4-\u00e9][\u0080-\u00bf][\u0080-\u00bf]/, name: "\xE4\xB8\xAD\xE6 \u578B\u897F\u6587\u4E71\u7801", cause: "UTF-8 \u4E2D\u6587\u5B57\u8282\uFF08E4-E9 \u5F00\u5934\u4E09\u5B57\u8282\u7EC4\uFF09\u88AB\u6309 Latin-1 \u9010\u5B57\u8282\u8BFB\u51FA", fix: "\u53EF\u81EA\u52A8\u4FEE\u590D\uFF1A\u91CD\u7F16\u7801\u56DE Latin-1 \u5B57\u8282\u518D\u6309 UTF-8 \u89E3\u7801" },
      { re: /[\u6d93-\u6d94\u6da6][\u4e00-\u9fff]/, name: "\u6D93\u6783 \u578B GBK \u4E71\u7801", cause: "UTF-8 \u4E2D\u6587\u5B57\u8282\u88AB\u6309 GBK \u53CC\u5B57\u8282\u91CD\u65B0\u914D\u5BF9\u8BFB\u51FA\uFF083 \u5B57\u8282\u7EC4\u88AB\u62C6\u6210 1.5 \u4E2A\u6C49\u5B57\uFF09", fix: "\u53EF\u81EA\u52A8\u4FEE\u590D\uFF1A\u91CD\u7F16\u7801\u56DE GBK \u5B57\u8282\u518D\u6309 UTF-8 \u89E3\u7801" },
      { re: /\u00e2\u20ac\u009c|\u00e2\u20ac\u009d|\u00e2\u20ac\u201d/, name: "\xE2\u20AC\u0153/\xE2\u20AC/\xE2\u20AC \u578B\u5F15\u53F7\u4E71\u7801", cause: "UTF-8 \u7684\u5F2F\u5F15\u53F7/\u7834\u6298\u53F7\uFF08E2 80 xx \u4E09\u5B57\u8282\uFF09\u88AB\u6309 Latin-1/CP1252 \u8BFB\u51FA", fix: "\u53EF\u81EA\u52A8\u4FEE\u590D\uFF1A\u91CD\u7F16\u7801\u56DE CP1252 \u5B57\u8282\u518D\u6309 UTF-8 \u89E3\u7801" }
    ];
    function analyzeText2(text) {
      const findings = [];
      for (const fp of FINGERPRINTS) {
        const m = text.match(new RegExp(fp.re.source, "g"));
        if (m) findings.push({ name: fp.name, count: m.length, cause: fp.cause, fix: fp.fix });
      }
      let fffd = 0, c1 = 0, latinExt = 0, hanzi = 0, ascii = 0, total = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        total++;
        if (cp === 65533) fffd++;
        else if (cp >= 128 && cp <= 159) c1++;
        else if (cp >= 192 && cp <= 591 || cp >= 7680 && cp <= 7935) latinExt++;
        else if (cp >= 19968 && cp <= 40959) hanzi++;
        else if (cp < 127) ascii++;
      }
      const stats = { total, fffd, c1ctrl: c1, latinExt, hanzi, ascii, score: Math.round(scoreText(text) * 10) / 10 };
      let verdict, suggestion;
      const hasCurable = findings.some((f) => f.fix.startsWith("\u53EF\u81EA\u52A8\u4FEE\u590D"));
      const hasDamaged = findings.some((f) => f.cause.includes("U+FFFD") || f.cause.includes("\u4E0D\u53EF\u9006") || f.fix.includes("\u65E0\u6CD5\u9006\u5411") || f.fix.includes("\u67E5\u6E90\u7801"));
      if (fffd > 0 && fffd / Math.max(total, 1) > 0.02 || hasDamaged) {
        verdict = "damaged";
        suggestion = findings.some((f) => f.name === "\u951F\u65A4\u62F7") ? "\u6587\u672C\u542B\u4E0D\u53EF\u9006\u635F\u574F\u6216\u5176\u5DF2\u77E5\u4EA7\u7269\uFF08\u5982\u951F\u65A4\u62F7\uFF09\uFF0C\u539F\u59CB\u5B57\u8282\u4FE1\u606F\u5DF2\u4E22\u5931\uFF0C\u81EA\u52A8\u4FEE\u590D\u4E0D\u53EF\u884C\u2014\u2014\u56DE\u5230\u4EA7\u751F\u6B64\u6587\u672C\u7684\u6E90\u5934\u91CD\u65B0\u5BFC\u51FA" : "\u6587\u672C\u542B\u5927\u91CF\u66FF\u6362\u5360\u4F4D\u7B26\uFF08U+FFFD\uFF09\uFF0C\u539F\u59CB\u5B57\u8282\u4FE1\u606F\u5DF2\u4E22\u5931\uFF0C\u81EA\u52A8\u4FEE\u590D\u4E0D\u53EF\u884C\u2014\u2014\u56DE\u5230\u4EA7\u751F\u6B64\u6587\u672C\u7684\u6E90\u5934\u91CD\u65B0\u5BFC\u51FA";
      } else if (hasCurable || latinExt > 3 && latinExt / Math.max(total, 1) > 0.1 || c1 > 0 && latinExt > 0) {
        verdict = "mojibake";
        suggestion = "\u68C0\u51FA\u5178\u578B mojibake \u7279\u5F81\uFF0C\u53EF\u7528 fix \u5DE5\u5177\u5C1D\u8BD5\u81EA\u52A8\u4FEE\u590D\uFF08\u5019\u9009\u94FE\u89C1 fix \u62A5\u544A\uFF09";
      } else {
        verdict = "clean";
        suggestion = "\u672A\u68C0\u51FA\u4E71\u7801\u7279\u5F81";
      }
      return { verdict, findings, stats, suggestion };
    }
    var FIX_CHAINS = [
      { reencode: "gbk", decode: "utf-8", label: "UTF-8 \u5B57\u8282\u88AB\u6309 GBK \u8BEF\u8BFB" },
      { reencode: "windows-1252", decode: "utf-8", label: "UTF-8 \u5B57\u8282\u88AB\u6309 Windows-1252 \u8BEF\u8BFB" },
      { reencode: "latin1", decode: "utf-8", label: "UTF-8 \u5B57\u8282\u88AB\u6309 Latin-1 \u8BEF\u8BFB" },
      { reencode: "big5", decode: "utf-8", label: "UTF-8 \u5B57\u8282\u88AB\u6309 Big5 \u8BEF\u8BFB" },
      { reencode: "shift_jis", decode: "utf-8", label: "UTF-8 \u5B57\u8282\u88AB\u6309 Shift_JIS \u8BEF\u8BFB" },
      { reencode: "euc-kr", decode: "utf-8", label: "UTF-8 \u5B57\u8282\u88AB\u6309 EUC-KR \u8BEF\u8BFB" }
    ];
    function fixMojibake2(text, opts) {
      const opts_ = opts || {};
      const originalScore = scoreText(text);
      const candidates = [];
      for (const chain of FIX_CHAINS) {
        let t = text;
        let tailLoss = 0;
        while (t.endsWith("\uFFFD")) {
          t = t.slice(0, -1);
          tailLoss++;
        }
        if (t.indexOf("\uFFFD") !== -1) continue;
        const enc = encodeText2(t, chain.reencode);
        if (!enc.bytes) continue;
        if (enc.unsupported.length > 0) continue;
        const dec = strictDecode2(enc.bytes, chain.decode);
        let fixed, fffd = 0, c1 = 0;
        if (dec.ok) {
          fixed = dec.text;
        } else if (tailLoss > 0) {
          const arr = [...new TextDecoder(chain.decode).decode(enc.bytes)];
          let tailF = 0, k = arr.length - 1;
          while (k >= 0 && arr[k].codePointAt(0) === 65533) {
            tailF++;
            k--;
          }
          if (tailF === 0 || tailF > tailLoss) continue;
          if (arr.slice(0, k + 1).some((ch) => ch.codePointAt(0) === 65533)) continue;
          fixed = arr.slice(0, arr.length - tailF).join("");
        } else continue;
        if (fixed === t) continue;
        for (const ch of fixed) {
          const cp = ch.codePointAt(0);
          if (cp === 65533) fffd++;
          else if (cp >= 128 && cp <= 159) c1++;
        }
        const score = scoreText(fixed);
        const gain = Math.round((score - originalScore) * 10) / 10;
        let roundtrip = false;
        const back = encodeText2(fixed, chain.decode);
        if (back.bytes && back.bytes.length <= enc.bytes.length) {
          if (tailLoss === 0) {
            if (back.bytes.length === enc.bytes.length) {
              const origin = { text: chain.reencode === "windows-1252" ? decodeCp1252(back.bytes) : new TextDecoder(chain.reencode).decode(back.bytes) };
              roundtrip = origin.text === t;
            }
          } else {
            roundtrip = true;
            for (let i = 0; i < back.bytes.length; i++) {
              if (back.bytes[i] !== enc.bytes[i]) {
                roundtrip = false;
                break;
              }
            }
          }
        }
        const passed = tailLoss === 0 && fffd === 0 && c1 === 0 && gain >= 8 && roundtrip;
        candidates.push({
          chain: chain.label,
          reencode: chain.reencode,
          decode: chain.decode,
          fixed,
          tailLoss,
          score: Math.round(score * 10) / 10,
          gain,
          fffd,
          c1ctrl: c1,
          roundtrip,
          status: passed ? "fixed" : gain > 0 ? "uncertain" : "rejected"
        });
      }
      candidates.sort((a, b) => {
        const rank = { fixed: 0, uncertain: 1, rejected: 2 };
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return b.gain - a.gain;
      });
      const best = candidates.find((c) => c.status === "fixed") || candidates.find((c) => c.status === "uncertain") || null;
      let status;
      if (best && best.status === "fixed") status = "fixed";
      else if (best && best.status === "uncertain" && !opts_.strictOnly) status = "uncertain";
      else if (!candidates.length && analyzeText2(text).verdict === "clean") status = "clean";
      else status = "unrepairable";
      return {
        status,
        originalScore: Math.round(originalScore * 10) / 10,
        best: status === "fixed" || status === "uncertain" ? best : null,
        candidates: candidates.slice(0, 6),
        note: best && best.tailLoss > 0 && (status === "fixed" || status === "uncertain") ? `\u4FEE\u590D\u94FE\u5DF2\u8FD8\u539F\u4E3B\u4F53\uFF0C\u4F46\u539F\u6587\u5C3E\u90E8 ${best.tailLoss} \u5B57\u8282\u5728\u8BEF\u8BFB\u65F6\u5DF2\u4E22\u5931\uFF08\u5947\u6570\u5B57\u8282\u6D41\u6309 GBK \u914D\u5BF9\u7684\u5B64\u7ACB\u5C3E\u90E8\uFF09\uFF0C\u7ED3\u679C\u7F3A\u5C3E\u90E8\u5185\u5BB9` : status === "unrepairable" ? analyzeText2(text).verdict === "damaged" ? "\u6587\u672C\u542B\u4E0D\u53EF\u9006\u635F\u574F\uFF08U+FFFD\uFF09\uFF0C\u65E0\u6CD5\u81EA\u52A8\u4FEE\u590D" : "\u6240\u6709\u8BEF\u8BFB\u94FE\u5C1D\u8BD5\u540E\u5747\u672A\u4EA7\u751F\u663E\u8457\u66F4\u53EF\u8BFB\u7684\u7ED3\u679C\u2014\u2014\u53EF\u80FD\u4E0D\u662F\u7F16\u7801\u95EE\u9898\uFF0C\u6216\u635F\u574F\u65B9\u5F0F\u8D85\u51FA\u672C\u53F0\u516D\u6761\u94FE" : ""
      };
    }
    function inspectBytes2(bytes) {
      const det = detectEncoding2(bytes);
      const pathCands = det.candidates.filter((c, i) => i < 3 || c.charset === "utf-8");
      const paths = [];
      for (const cand of pathCands) {
        const dec = strictDecode2(bytes, cand.charset);
        if (!dec.ok) continue;
        const fp = analyzeText2(dec.text);
        const fix = fp.verdict === "mojibake" ? fixMojibake2(dec.text) : fixMojibake2(dec.text, { strictOnly: true });
        const finalText = fix.best ? fix.best.fixed : dec.text;
        paths.push({
          charset: cand.charset,
          label: cand.label,
          decodeNote: `\u6309 ${cand.charset} \u89E3\u7801`,
          text: dec.text,
          fingerprint: fp,
          fix,
          finalScore: scoreText(finalText)
        });
      }
      paths.sort((a, b) => b.finalScore - a.finalScore);
      const best = paths[0] || {
        charset: det.best.charset,
        label: det.best.label,
        decodeNote: "\u6240\u6709\u5019\u9009\u4E25\u683C\u89E3\u7801\u5931\u8D25\uFF0C\u65E0\u6CD5\u4F53\u68C0",
        text: "",
        fingerprint: analyzeText2(""),
        fix: fixMojibake2("", { strictOnly: true }),
        finalScore: 0
      };
      return { detect: det, decodeNote: best.decodeNote, text: best.text, fingerprint: best.fingerprint, fix: best.fix, via: best.charset, paths: paths.map((p) => ({ charset: p.charset, finalScore: Math.round(p.finalScore * 10) / 10, fixStatus: p.fix.status })) };
    }
    function renderDetectReport(det) {
      const lines = [];
      lines.push(`## \u7F16\u7801\u8BC6\u522B\u62A5\u544A`);
      lines.push(`- \u5B57\u8282\u6570\uFF1A${det.size}`);
      if (det.bom) lines.push(`- BOM\uFF1A\u68C0\u51FA\uFF08${det.bom}\uFF09`);
      lines.push(`- \u6700\u4F73\u5224\u5B9A\uFF1A**${det.best.label}**\uFF08\u7F6E\u4FE1\u5EA6 ${det.best.confidence}\uFF0C\u8BC4\u5206 ${det.best.score}\uFF09`);
      if (det.best.note) lines.push(`- \u4F9D\u636E\uFF1A${det.best.note}`);
      if (det.candidates.length > 1) {
        lines.push(`- \u5019\u9009\u6392\u5E8F\uFF1A`);
        for (const c of det.candidates) {
          lines.push(`  - ${c.charset === det.best.charset ? "\u25B6" : "\xB7"} ${c.label}\u2014\u2014${c.score} \u5206${c.note ? `\uFF08${c.note}\uFF09` : ""}`);
        }
      }
      const lowConf = det.best.confidence === "\u4F4E";
      if (lowConf) lines.push(`- \u26A0\uFE0F \u5019\u9009\u533A\u5206\u5EA6\u4F4E\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u5185\u5BB9\u4EBA\u5DE5\u786E\u8BA4\uFF08\u5982\u5DF2\u77E5\u6765\u6E90\u8BED\u8A00\u53EF\u6307\u5B9A\u7F16\u7801\u7528 convert \u9A8C\u8BC1\uFF09`);
      return lines.join("\n");
    }
    function renderFingerprintReport(fp) {
      const lines = [];
      const badge = { clean: "\u2705 \u672A\u68C0\u51FA\u4E71\u7801\u7279\u5F81", mojibake: "\u{1F500} \u68C0\u51FA mojibake \u4E71\u7801\uFF08\u53EF\u5C1D\u8BD5\u81EA\u52A8\u4FEE\u590D\uFF09", damaged: "\u{1F4A5} \u6587\u672C\u5DF2\u4E0D\u53EF\u9006\u635F\u574F" }[fp.verdict] || fp.verdict;
      lines.push(`## \u4E71\u7801\u6307\u7EB9\u62A5\u544A\uFF1A${badge}`);
      lines.push(`- \u7279\u5F81\u7EDF\u8BA1\uFF1A\u5171 ${fp.stats.total} \u5B57\u7B26\u2014\u2014\u6C49\u5B57 ${fp.stats.hanzi}\u3001Latin \u6269\u5C55 ${fp.stats.latinExt}\u3001C1 \u63A7\u5236 ${fp.stats.c1ctrl}\u3001U+FFFD ${fp.stats.fffd}\uFF1B\u53EF\u8BFB\u5206 ${fp.stats.score}`);
      if (fp.findings.length) {
        lines.push(`- \u547D\u4E2D\u6307\u7EB9\uFF1A`);
        for (const f of fp.findings) lines.push(`  - **${f.name}** \xD7${f.count}\uFF1A${f.cause}\u3002\u5904\u7F6E\uFF1A${f.fix}`);
      }
      lines.push(`- \u5EFA\u8BAE\uFF1A${fp.suggestion}`);
      return lines.join("\n");
    }
    function renderFixReport(fix) {
      const lines = [];
      let badge;
      if (fix.status === "fixed") badge = `\u2705 \u4FEE\u590D\u6210\u529F\uFF08${fix.best.chain}\uFF09\uFF0C\u53EF\u8BFB\u5206 ${fix.originalScore} \u2192 ${fix.best.score}`;
      else if (fix.status === "uncertain") badge = "\u26A0\uFE0F \u627E\u5230\u7591\u4F3C\u4FEE\u590D\u94FE\u4F46\u672A\u5168\u90E8\u901A\u8FC7\u7EC8\u9A8C\uFF0C\u7ED3\u679C\u4EC5\u4F9B\u53C2\u8003";
      else if (fix.status === "clean") badge = "\u2705 \u672A\u68C0\u51FA\u4E71\u7801\u7279\u5F81\uFF0C\u65E0\u9700\u4FEE\u590D";
      else badge = "\u274C \u672A\u80FD\u81EA\u52A8\u4FEE\u590D";
      lines.push(`## \u4E71\u7801\u4FEE\u590D\u62A5\u544A\uFF1A${badge}`);
      if (fix.note) lines.push(`- ${fix.note}`);
      if (fix.best) {
        lines.push(`- \u8BEF\u8BFB\u94FE\uFF1A${fix.best.chain}`);
        lines.push(`- \u7EC8\u9A8C\uFF1AU+FFFD=${fix.best.fffd}\u3001C1 \u63A7\u5236=${fix.best.c1ctrl}\u3001\u53EF\u8BFB\u5206\u589E\u76CA +${fix.best.gain}\u3001round-trip ${fix.best.roundtrip ? "\u81EA\u6D3D" : "\u4E0D\u81EA\u6D3D"}`);
        lines.push("");
        lines.push("\u4FEE\u590D\u7ED3\u679C\uFF08\u622A\u65AD\u5230 4KB\uFF09\uFF1A");
        lines.push("```");
        lines.push(fix.best.fixed.length > 4096 ? fix.best.fixed.slice(0, 4096) + `
\u2026\uFF08\u5176\u4F59 ${fix.best.fixed.length - 4096} \u5B57\u7B26\u7701\u7565\uFF09` : fix.best.fixed);
        lines.push("```");
      }
      if (fix.candidates.length > 1) {
        lines.push(`- \u5168\u90E8\u5019\u9009\uFF1A`);
        for (const c of fix.candidates) {
          lines.push(`  - ${c === fix.best ? "\u25B6" : "\xB7"} [${c.status}] ${c.chain}\u2014\u2014\u589E\u76CA +${c.gain}\uFF0Cround-trip ${c.roundtrip ? "\u2713" : "\u2717"}`);
        }
      }
      return lines.join("\n");
    }
    function renderInspectReport(r) {
      return [
        renderDetectReport(r.detect),
        "",
        `- \u4F53\u68C0\u88C1\u51B3\uFF1A${r.decodeNote}${r.via ? `\uFF08\u7EC8\u6001\u5206\u6700\u9AD8\u7684\u8DEF\u5F84 via ${r.via}\uFF09` : ""}`,
        "",
        renderFingerprintReport(r.fingerprint),
        "",
        renderFixReport(r.fix)
      ].join("\n");
    }
    module.exports = {
      U8,
      strictDecode: strictDecode2,
      bytesToHex: bytesToHex2,
      hexToBytes: hexToBytes2,
      base64Encode: base64Encode2,
      base64Decode: base64Decode2,
      normalizeCharset,
      encodeText: encodeText2,
      getDoubleByteMap,
      decodeCp1252,
      detectEncoding: detectEncoding2,
      analyzeText: analyzeText2,
      fixMojibake: fixMojibake2,
      inspectBytes: inspectBytes2,
      scoreText,
      renderDetectReport,
      renderFingerprintReport,
      renderFixReport,
      renderInspectReport,
      COMMON_HANZI
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_encoding_core());
import { useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var clampS = (v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
var BADGE = {
  fixed: "\u2705 \u4FEE\u590D\u6210\u529F",
  uncertain: "\u26A0\uFE0F \u7591\u4F3C\u4FEE\u590D\uFF08\u672A\u5168\u8FC7\u7EC8\u9A8C\uFF09",
  clean: "\u2705 \u65E0\u4E71\u7801\u7279\u5F81",
  unrepairable: "\u274C \u672A\u80FD\u81EA\u52A8\u4FEE\u590D",
  mojibake: "\u{1F500} mojibake \u4E71\u7801",
  damaged: "\u{1F4A5} \u4E0D\u53EF\u9006\u635F\u574F"
};
function ScoreDots({ score }) {
  const s = clampS(score);
  const color = s >= 70 ? "var(--ok, #4ade80)" : s >= 40 ? "var(--warn, #fbbf24)" : "var(--err, #f87171)";
  return /* @__PURE__ */ jsx("span", { style: { color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: s });
}
function EncodingLensPanel(_props) {
  const [tab, setTab] = useState("fix");
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, padding: 12, gap: 10, boxSizing: "border-box" }, children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6 }, children: [["fix", "\u4E71\u7801\u4FEE\u590D"], ["file", "\u6587\u4EF6\u4F53\u68C0"], ["convert", "\u7F16\u7801\u8F6C\u6362"]].map(([k, label]) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setTab(k),
        style: {
          padding: "5px 14px",
          borderRadius: 8,
          border: "1px solid var(--border, #444)",
          cursor: "pointer",
          background: tab === k ? "var(--primary, #3b82f6)" : "transparent",
          color: tab === k ? "#fff" : "var(--fg, #ddd)",
          fontSize: 13
        },
        children: label
      },
      k
    )) }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, minHeight: 0, overflow: "auto" }, children: [
      tab === "fix" && /* @__PURE__ */ jsx(FixTab, {}),
      tab === "file" && /* @__PURE__ */ jsx(FileTab, {}),
      tab === "convert" && /* @__PURE__ */ jsx(ConvertTab, {})
    ] })
  ] });
}
function FixTab() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const run = () => {
    if (!input.trim()) {
      setResult(null);
      return;
    }
    try {
      setResult({ fp: core.analyzeText(input), fix: core.fixMojibake(input) });
    } catch (e) {
      setResult(null);
    }
    setCopied(false);
  };
  const copyFixed = async () => {
    if (result?.fix.best && navigator.clipboard) {
      await navigator.clipboard.writeText(result.fix.best.fixed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsx(
      "textarea",
      {
        value: input,
        onChange: (e) => setInput(e.target.value),
        placeholder: "\u7C98\u8D34\u4E71\u7801\u6587\u672C\uFF0C\u5982\uFF1A\xE4\xB8\xAD\xE6\u2013\u2021\xE6\xB5\u2039\xE8\xAF\u2022 \u6216 \u6D93\u6783\u5A34\u5B2D\u762F\n\uFF08\u9519\u8BEF\u89E3\u7801\u7684\u4EA7\u7269\u2014\u2014\u672C\u53F0\u627E\u51FA\u8BEF\u8BFB\u94FE\u5E76\u8FD8\u539F\u539F\u6587\uFF09",
        rows: 5,
        style: { width: "100%", boxSizing: "border-box", background: "var(--bg-1, #1a1a1a)", color: "var(--fg, #ddd)", border: "1px solid var(--border, #444)", borderRadius: 8, padding: 8, fontSize: 13, resize: "vertical" }
      }
    ),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { onClick: run, disabled: !input.trim(), style: { padding: "6px 18px", borderRadius: 8, border: "none", background: "var(--primary, #3b82f6)", color: "#fff", cursor: input.trim() ? "pointer" : "not-allowed", fontSize: 13 }, children: "\u5206\u6790\u5E76\u4FEE\u590D" }) }),
    result && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx(Section, { title: `\u6307\u7EB9\uFF1A${BADGE[result.fp.verdict] || result.fp.verdict}`, children: /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, opacity: 0.85, lineHeight: 1.7 }, children: [
        "\u5171 ",
        result.fp.stats.total,
        " \u5B57\u7B26\u2014\u2014\u6C49\u5B57 ",
        result.fp.stats.hanzi,
        "\u3001Latin \u6269\u5C55 ",
        result.fp.stats.latinExt,
        "\u3001C1 \u63A7\u5236 ",
        result.fp.stats.c1ctrl,
        "\u3001U+FFFD ",
        result.fp.stats.fffd,
        "\uFF1B\u53EF\u8BFB\u5206 ",
        /* @__PURE__ */ jsx(ScoreDots, { score: result.fp.stats.score }),
        result.fp.findings.map((f) => /* @__PURE__ */ jsxs("div", { style: { marginTop: 4 }, children: [
          "\xB7 ",
          /* @__PURE__ */ jsx("b", { children: f.name }),
          " \xD7",
          f.count,
          "\uFF1A",
          f.cause
        ] }, f.name)),
        /* @__PURE__ */ jsxs("div", { style: { marginTop: 4, opacity: 0.75 }, children: [
          "\u5EFA\u8BAE\uFF1A",
          result.fp.suggestion
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs(Section, { title: `\u4FEE\u590D\uFF1A${BADGE[result.fix.status] || result.fix.status}`, children: [
        result.fix.best ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, opacity: 0.85, lineHeight: 1.7 }, children: [
            "\u8BEF\u8BFB\u94FE\uFF1A",
            result.fix.best.chain,
            "\uFF1B\u53EF\u8BFB\u5206 ",
            clampS(result.fix.originalScore),
            " \u2192 ",
            /* @__PURE__ */ jsx(ScoreDots, { score: result.fix.best.score }),
            "\uFF08+",
            result.fix.best.gain,
            "\uFF09\uFF1B round-trip ",
            result.fix.best.roundtrip ? "\u81EA\u6D3D \u2713" : "\u4E0D\u81EA\u6D3D \u2717",
            result.fix.best.tailLoss > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
              "\uFF1B\u5C3E\u90E8 ",
              result.fix.best.tailLoss,
              " \u5B57\u8282\u4E0D\u53EF\u9006\u4E22\u5931"
            ] })
          ] }),
          result.fix.note && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, opacity: 0.75, marginTop: 4 }, children: result.fix.note }),
          /* @__PURE__ */ jsx("pre", { style: { whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--bg-1, #111)", border: "1px solid var(--border, #333)", borderRadius: 8, padding: 8, fontSize: 13, marginTop: 6, maxHeight: 160, overflow: "auto" }, children: result.fix.best.fixed }),
          /* @__PURE__ */ jsx("button", { onClick: copyFixed, style: { marginTop: 6, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border, #444)", background: "transparent", color: "var(--fg, #ddd)", cursor: "pointer", fontSize: 12 }, children: copied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u4FEE\u590D\u7ED3\u679C" })
        ] }) : /* @__PURE__ */ jsx("div", { style: { fontSize: 12, opacity: 0.8 }, children: result.fix.note || "\u6CA1\u6709\u53EF\u7528\u7684\u4FEE\u590D\u5019\u9009" }),
        result.fix.candidates.length > 1 && /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, opacity: 0.7, marginTop: 6 }, children: [
          "\u5168\u90E8\u5019\u9009\uFF1A",
          result.fix.candidates.map((c) => `[${c.status === "fixed" ? "\u2713" : c.status === "uncertain" ? "?" : "\xD7"}] ${c.reencode} +${c.gain}`).join("\u3000")
        ] })
      ] })
    ] })
  ] });
}
function FileTab() {
  const [fileInfo, setFileInfo] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const onFile = async (f) => {
    setError("");
    setReport(null);
    if (!f) return;
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      if (buf.length > 2 * 1024 * 1024) {
        setError(`\u6587\u4EF6\u8FC7\u5927\uFF08${buf.length} \u5B57\u8282 > 2MB\uFF09\uFF0C\u8BF7\u5206\u6BB5\u5904\u7406`);
        return;
      }
      const detect = core.detectEncoding(buf);
      const inspect = core.inspectBytes(buf);
      setFileInfo(`${f.name}\uFF08${buf.length} \u5B57\u8282\uFF09`);
      setReport({ detect, inspect, hexHead: core.bytesToHex(buf.slice(0, 32)) });
    } catch (e) {
      setError(`\u8BFB\u53D6\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsx("input", { ref: fileRef, type: "file", onChange: (e) => onFile(e.target.files?.[0]), style: { fontSize: 12, color: "var(--fg, #ddd)" } }),
    error && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--err, #f87171)" }, children: error }),
    report && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx(Section, { title: `\u8BC6\u522B\uFF1A${report.detect.best.label}\uFF08\u7F6E\u4FE1\u5EA6 ${report.detect.best.confidence}\uFF09`, children: /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, opacity: 0.85, lineHeight: 1.8 }, children: [
        fileInfo,
        report.detect.bom ? `\uFF1BBOM=${report.detect.bom}` : "",
        /* @__PURE__ */ jsxs("div", { style: { opacity: 0.7, fontFamily: "monospace", fontSize: 11, marginTop: 2 }, children: [
          "\u5934 32 \u5B57\u8282\uFF1A",
          report.hexHead
        ] }),
        report.detect.candidates.map((c) => /* @__PURE__ */ jsxs("div", { children: [
          c.charset === report.detect.best.charset ? "\u25B6" : "\xB7",
          " ",
          c.label,
          "\u2014\u2014",
          /* @__PURE__ */ jsx(ScoreDots, { score: c.score }),
          " \u5206",
          c.note ? `\uFF08${c.note}\uFF09` : ""
        ] }, c.charset))
      ] }) }),
      /* @__PURE__ */ jsx(Section, { title: `\u4F53\u68C0\uFF1A${BADGE[report.inspect.fingerprint.verdict] || report.inspect.fingerprint.verdict}\uFF08\u8DEF\u5F84 via ${report.inspect.via}\uFF09`, children: /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, opacity: 0.85, lineHeight: 1.7 }, children: [
        report.inspect.decodeNote,
        "\uFF1B",
        report.inspect.fingerprint.suggestion
      ] }) }),
      report.inspect.fix.best && /* @__PURE__ */ jsxs(Section, { title: `\u4FEE\u590D\u9884\u89C8\uFF1A${BADGE[report.inspect.fix.status] || report.inspect.fix.status}`, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, opacity: 0.85, lineHeight: 1.7 }, children: [
          report.inspect.fix.best.chain,
          "\uFF1Bround-trip ",
          report.inspect.fix.best.roundtrip ? "\u81EA\u6D3D \u2713" : "\u4E0D\u81EA\u6D3D \u2717"
        ] }),
        /* @__PURE__ */ jsx("pre", { style: { whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--bg-1, #111)", border: "1px solid var(--border, #333)", borderRadius: 8, padding: 8, fontSize: 12, marginTop: 6, maxHeight: 200, overflow: "auto" }, children: report.inspect.fix.best.fixed.slice(0, 2e3) })
      ] })
    ] })
  ] });
}
var CHARSETS = ["utf-8", "gbk", "big5", "shift_jis", "euc-kr", "gb18030", "latin1", "windows-1252", "utf-16le"];
function ConvertTab() {
  const [mode, setMode] = useState("textToBytes");
  const [text, setText] = useState("");
  const [bytesInput, setBytesInput] = useState("");
  const [bytesForm, setBytesForm] = useState("hex");
  const [charset, setCharset] = useState("gbk");
  const [out, setOut] = useState(null);
  const run = () => {
    try {
      if (mode === "textToBytes") {
        if (!text) {
          setOut({ lines: [], error: "\u8BF7\u8F93\u5165\u6587\u672C" });
          return;
        }
        const enc = core.encodeText(text, charset);
        if (!enc.bytes) {
          setOut({ lines: [], error: `\u7F16\u7801 ${charset} \u4E0D\u652F\u6301\u7F16\u7801\u65B9\u5411` });
          return;
        }
        const uniq = [...new Set(enc.unsupported)];
        setOut({
          lines: [
            `\u5B57\u8282\u6570\uFF1A${enc.bytes.length}`,
            `hex\uFF1A${core.bytesToHex(enc.bytes, "").slice(0, 1e3)}`,
            `base64\uFF1A${core.base64Encode(enc.bytes).slice(0, 1e3)}`
          ],
          unsupported: enc.unsupported.length ? uniq : void 0
        });
      } else {
        const bytes = bytesForm === "hex" ? core.hexToBytes(bytesInput) : core.base64Decode(bytesInput);
        if (!bytes) {
          setOut({ lines: [], error: "\u5B57\u8282\u6D41\u683C\u5F0F\u65E0\u6548" });
          return;
        }
        const dec = core.strictDecode(bytes, charset);
        if (!dec.ok) {
          setOut({ lines: [], error: `\u6309 ${charset} \u4E25\u683C\u89E3\u7801\u5931\u8D25\uFF08${dec.error}\uFF09\u2014\u2014\u5EFA\u8BAE\u5148\u5728\u300C\u6587\u4EF6\u4F53\u68C0\u300D\u786E\u8BA4\u7F16\u7801` });
          return;
        }
        setOut({ lines: [dec.text.slice(0, 2e3)] });
      }
    } catch (e) {
      setOut({ lines: [], error: e instanceof Error ? e.message : String(e) });
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("select", { value: mode, onChange: (e) => {
        setMode(e.target.value);
        setOut(null);
      }, style: selectStyle, children: [
        /* @__PURE__ */ jsx("option", { value: "textToBytes", children: "\u6587\u672C \u2192 \u5B57\u8282" }),
        /* @__PURE__ */ jsx("option", { value: "bytesToText", children: "\u5B57\u8282 \u2192 \u6587\u672C" })
      ] }),
      /* @__PURE__ */ jsx("select", { value: charset, onChange: (e) => setCharset(e.target.value), style: selectStyle, children: CHARSETS.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c)) }),
      mode === "bytesToText" && /* @__PURE__ */ jsxs("select", { value: bytesForm, onChange: (e) => setBytesForm(e.target.value), style: selectStyle, children: [
        /* @__PURE__ */ jsx("option", { value: "hex", children: "hex \u8F93\u5165" }),
        /* @__PURE__ */ jsx("option", { value: "base64", children: "base64 \u8F93\u5165" })
      ] })
    ] }),
    mode === "textToBytes" ? /* @__PURE__ */ jsx("textarea", { value: text, onChange: (e) => setText(e.target.value), placeholder: "\u8F93\u5165\u8981\u7F16\u7801\u7684\u6587\u672C", rows: 4, style: inputStyle }) : /* @__PURE__ */ jsx("textarea", { value: bytesInput, onChange: (e) => setBytesInput(e.target.value), placeholder: bytesForm === "hex" ? "\u8F93\u5165 hex \u5B57\u8282\u4E32\uFF08\u5982 d6 d0 ce c4\uFF09" : "\u8F93\u5165 base64 \u4E32", rows: 4, style: inputStyle }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { onClick: run, style: { padding: "6px 18px", borderRadius: 8, border: "none", background: "var(--primary, #3b82f6)", color: "#fff", cursor: "pointer", fontSize: 13 }, children: "\u8F6C\u6362" }) }),
    out?.error && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--err, #f87171)" }, children: out.error }),
    out && !out.error && /* @__PURE__ */ jsxs(Section, { title: "\u7ED3\u679C", children: [
      out.unsupported && /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--warn, #fbbf24)", marginBottom: 4 }, children: [
        "\u26A0 ",
        out.unsupported.length,
        " \u79CD\u5B57\u7B26\u65E0 ",
        charset,
        " \u7F16\u7801\uFF08\u672A\u9759\u9ED8\u66FF\u6362\uFF09\uFF1A",
        out.unsupported.slice(0, 30).join(" ")
      ] }),
      /* @__PURE__ */ jsx("pre", { style: preStyle, children: out.lines.join("\n") })
    ] })
  ] });
}
var selectStyle = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--border, #444)",
  background: "var(--bg-1, #1a1a1a)",
  color: "var(--fg, #ddd)",
  fontSize: 12
};
var inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg-1, #1a1a1a)",
  color: "var(--fg, #ddd)",
  border: "1px solid var(--border, #444)",
  borderRadius: 8,
  padding: 8,
  fontSize: 13,
  resize: "vertical"
};
var preStyle = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  background: "var(--bg-1, #111)",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
  padding: 8,
  fontSize: 12,
  margin: 0,
  maxHeight: 240,
  overflow: "auto"
};
function Section({ title, children }) {
  return /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border, #333)", borderRadius: 10, padding: 10, background: "var(--bg-2, rgba(255,255,255,0.02))" }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--fg, #eee)" }, children: title }),
    children
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function EncodingLensEntry(props) {
  return /* @__PURE__ */ jsx2(EncodingLensPanel, { ...props });
}
export {
  EncodingLensEntry as default
};
