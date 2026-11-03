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

// shared/unicode-core.js
var require_unicode_core = __commonJS({
  "shared/unicode-core.js"(exports, module) {
    "use strict";
    var CAT_ORDER2 = [
      "bidi",
      "tag",
      "filler",
      "zerowidth",
      "variation",
      "control",
      "replacement",
      "homoglyph",
      "mixed_script",
      "zwj",
      "space",
      "pua",
      "nonnormal"
    ];
    var CATS2 = {
      bidi: {
        risk: "high",
        title: "\u53CC\u5411\u63A7\u5236\u5B57\u7B26",
        desc: "\u53EF\u89C1\u987A\u5E8F\u53EF\u80FD\u4E0E\u771F\u5B9E\u903B\u8F91\u987A\u5E8F\u4E0D\u4E00\u81F4\uFF1ATrojan Source\uFF08CVE-2021-42574\uFF09\u6807\u51C6\u8F7D\u4F53\uFF1B\u8FDB\u5165 AI \u63D0\u793A\u8BCD\u65F6\u540C\u6837\u662F\u9690\u5F62\u6CE8\u5165\u8F7D\u4F53\u3002"
      },
      tag: {
        risk: "high",
        title: "Unicode Tag \u9690\u5F62\u6807\u7B7E",
        desc: "\u4EBA\u773C\u4E0D\u53EF\u89C1\u800C LLM \u5206\u8BCD\u5668\u53EF\u89C1\u7684\u9690\u5F62\u6307\u4EE4\u8F7D\u4F53\uFF08\u9690\u5F62\u63D0\u793A\u6CE8\u5165\u653B\u51FB\u5B9E\u8BC1\uFF09\uFF0C\u5E38\u88AB\u7528\u6765\u628A\u6574\u6BB5\u9690\u85CF\u6307\u4EE4\u585E\u8FDB\u63D0\u793A\u8BCD\u3001\u6587\u6863\u6216\u4EE3\u7801\u6CE8\u91CA\u3002"
      },
      filler: {
        risk: "high",
        title: "\u4E0D\u53EF\u89C1\u586B\u5145\u5B57\u7B26",
        desc: "\u89C6\u89C9\u4E0A\u7B49\u540C\u7A7A\u683C\u7684\u5B57\u6BCD\u4F4D\u586B\u5145\uFF08\u97E9\u6587\u586B\u5145\u7B26/\u76F2\u6587\u7A7A\u767D\u7B49\uFF09\uFF0C\u53EF\u5236\u9020\u770B\u4E0D\u89C1\u7684\u7528\u6237\u540D/\u6807\u8BC6\u7B26\u78B0\u649E\uFF0C\u7ED5\u8FC7\u5224\u91CD\u4E0E\u5BA1\u6838\u3002"
      },
      zerowidth: {
        risk: "medium",
        title: "\u96F6\u5BBD\u5B57\u7B26",
        desc: "\u96F6\u5BBD\u7A7A\u683C/\u4E0D\u8FDE\u5B57/\u6587\u5B57\u8FDE\u63A5\u7B26\u7B49\uFF1A\u6B63\u5E38\u6587\u672C\u4E2D\u901A\u5E38\u4E0D\u5408\u6CD5\uFF0C\u5E38\u89C1\u4E8E\u9690\u5F62\u6C34\u5370\u3001\u9690\u85CF\u6307\u4EE4\u4E0E\u7ED5\u8FC7\u654F\u611F\u8BCD\u68C0\u6D4B\u3002"
      },
      variation: {
        risk: "medium",
        title: "\u53D8\u4F53\u9009\u62E9\u7B26/\u7EC4\u5408\u8FDE\u63A5\u7B26",
        desc: "\u6539\u53D8\u524D\u4E00\u5B57\u7B26\u5448\u73B0\u5F62\u5F0F\u7684\u4E0D\u53EF\u89C1\u5B57\u7B26\uFF1B\u6B63\u5E38\u6587\u672C\u6781\u5C11\u51FA\u73B0\uFF0C\u53EF\u7528\u4E8E\u9690\u85CF\u6807\u8BB0\u6216\u5236\u9020\u5B57\u7B26\u4E32\u5224\u91CD\u5DEE\u5F02\u3002"
      },
      control: {
        risk: "medium",
        title: "\u63A7\u5236\u5B57\u7B26",
        desc: "C0/C1 \u63A7\u5236\u5B57\u7B26\uFF08Tab/\u6362\u884C/\u56DE\u8F66\u9664\u5916\uFF09\uFF1A\u53EF\u80FD\u7834\u574F\u89E3\u6790\u5668\u3001\u7EC8\u7AEF\u5448\u73B0\u4E0E\u65E5\u5FD7\u5206\u6790\u3002"
      },
      replacement: {
        risk: "medium",
        title: "\u7F16\u7801\u635F\u574F\u66FF\u6362\u7B26 U+FFFD",
        desc: "\u51FA\u73B0\u66FF\u6362\u7B26\u8BF4\u660E\u6587\u672C\u53EF\u80FD\u4E0D\u662F UTF-8\uFF08GBK/GB18030 \u88AB\u8BEF\u8BFB\u5E38\u89C1\uFF09\u6216\u5DF2\u635F\u574F\uFF1B\u672C\u5DE5\u5177\u4E0D\u505A\u8F6C\u7801\uFF0C\u8BF7\u786E\u8BA4\u6E90\u7F16\u7801\u540E\u91CD\u65B0\u5BFC\u51FA\u3002"
      },
      homoglyph: {
        risk: "medium",
        title: "\u540C\u5F62\u5F02\u7801\u5B57",
        desc: "\u4E0E ASCII \u5B57\u6BCD/\u6570\u5B57\u89C6\u89C9\u7B49\u4EF7\u7684\u5176\u4ED6\u6587\u5B57\u5B57\u7B26\uFF08\u897F\u91CC\u5C14/\u5E0C\u814A/\u5168\u89D2/\u6570\u5B66\u53D8\u4F53\uFF09\uFF1A\u9493\u9C7C\u57DF\u540D\u4E0E\u4EE3\u7801\u6807\u8BC6\u7B26\u6DF7\u6DC6\u7684\u7ECF\u5178\u624B\u6CD5\u3002"
      },
      mixed_script: {
        risk: "medium",
        title: "\u6DF7\u5408\u6587\u5B57\u7CFB\u7EDF",
        desc: "\u540C\u4E00\u884C\u5185\u62C9\u4E01\u5B57\u6BCD\u4E0E\u897F\u91CC\u5C14/\u5E0C\u814A\u5B57\u6BCD\u6DF7\u6392\uFF1A\u540C\u5F62\u8BCD\u653B\u51FB\u7684\u5178\u578B\u7279\u5F81\uFF1B\u4E2D\u6587\u4E0E\u82F1\u6587\u7684\u6B63\u5E38\u6DF7\u6392\u4E0D\u53D7\u5F71\u54CD\u3002"
      },
      zwj: {
        risk: "low",
        title: "\u96F6\u5BBD\u8FDE\u63A5\u7B26 ZWJ",
        desc: "emoji \u5E8F\u5217\u7684\u5408\u6CD5\u6210\u5206\uFF1B\u8131\u79BB emoji \u4E0A\u4E0B\u6587\u51FA\u73B0\u5219\u53EF\u7591\uFF08\u9690\u5F62\u62FC\u63A5/\u7ED5\u8FC7\u5224\u91CD\uFF09\u3002"
      },
      space: {
        risk: "low",
        title: "\u5F02\u5E38\u7A7A\u767D\u5B57\u7B26",
        desc: "NBSP/\u7A84\u7A7A\u683C\u7B49\uFF1A\u591A\u4E3A\u6392\u7248\u6765\u6E90\uFF0C\u4F46\u4F1A\u8BA9\u5B57\u7B26\u4E32\u6BD4\u8F83\u3001\u5224\u91CD\u4E0E\u590D\u5236\u51FA\u73B0\u300C\u770B\u8D77\u6765\u4E00\u6837\u5B9E\u9645\u4E0D\u540C\u300D\u3002"
      },
      pua: {
        risk: "low",
        title: "\u79C1\u6709\u4F7F\u7528\u533A\u5B57\u7B26",
        desc: "Unicode \u672A\u5B9A\u4E49\u8BED\u4E49\u7684\u79C1\u6709\u533A\uFF08\u5B57\u4F53\u56FE\u6807\u7B49\u5408\u6CD5\u7528\u9014\u4E5F\u5B58\u5728\uFF09\uFF0C\u8DE8\u73AF\u5883\u5448\u73B0\u4E0D\u53EF\u9884\u671F\u3002"
      },
      nonnormal: {
        risk: "low",
        title: "NFC \u672A\u5F52\u4E00\u5316\u5E8F\u5217",
        desc: "\u5B58\u5728\u53EF\u5F52\u4E00\u5316\u7684\u7EC4\u5408\u5E8F\u5217\uFF1A\u5B57\u7B26\u4E32\u6BD4\u8F83/\u5224\u91CD\u53EF\u80FD\u4E0D\u4E00\u81F4\uFF0C\u5EFA\u8BAE\u7EDF\u4E00\u4E3A NFC \u5F62\u5F0F\u3002"
      }
    };
    var NAMES = {
      8203: "\u96F6\u5BBD\u7A7A\u683C ZWSP",
      8204: "\u96F6\u5BBD\u4E0D\u8FDE\u5B57 ZWNJ",
      8205: "\u96F6\u5BBD\u8FDE\u63A5\u7B26 ZWJ",
      8288: "\u6587\u5B57\u8FDE\u63A5\u7B26 WORD JOINER",
      8289: "\u51FD\u6570\u5E94\u7528\u7B26\u53F7\uFF08\u4E0D\u53EF\u89C1\uFF09",
      8290: "\u4E0D\u53EF\u89C1\u4E58\u53F7",
      8291: "\u4E0D\u53EF\u89C1\u5206\u9694\u7B26",
      8292: "\u4E0D\u53EF\u89C1\u52A0\u53F7",
      65279: "\u96F6\u5BBD\u4E0D\u6362\u884C\u7A7A\u683C\uFF08BOM\uFF09",
      8206: "\u5DE6\u5230\u53F3\u6807\u8BB0 LRM",
      8207: "\u53F3\u5230\u5DE6\u6807\u8BB0 RLM",
      1564: "\u963F\u62C9\u4F2F\u5B57\u6BCD\u6807\u8BB0 ALM",
      8234: "\u5DE6\u5230\u53F3\u5D4C\u5165 LRE",
      8235: "\u53F3\u5230\u5DE6\u5D4C\u5165 RLE",
      8236: "\u5F39\u51FA\u65B9\u5411\u683C\u5F0F PDF",
      8237: "\u5DE6\u5230\u53F3\u8986\u76D6 LRO",
      8238: "\u53F3\u5230\u5DE6\u8986\u76D6 RLO\uFF08Trojan Source \u6838\u5FC3\uFF09",
      8294: "\u5DE6\u5230\u53F3\u9694\u79BB LRI",
      8295: "\u53F3\u5230\u5DE6\u9694\u79BB RLI",
      8296: "\u7B2C\u4E00\u5F3A\u9694\u79BB FSI",
      8297: "\u5F39\u51FA\u9694\u79BB PDI",
      173: "\u8F6F\u8FDE\u5B57\u7B26",
      847: "\u7EC4\u5408\u5B57\u7D20\u8FDE\u63A5\u7B26 CGJ",
      160: "\u4E0D\u6362\u884C\u7A7A\u683C NBSP",
      12288: "\u5168\u89D2\u7A7A\u683C",
      12644: "\u97E9\u6587\u586B\u5145\u7B26\uFF08\u9690\u5F62\u7528\u6237\u540D\u653B\u51FB\u7ECF\u5178\uFF09",
      4447: "\u97E9\u6587\u58F0\u6BCD\u586B\u5145\u7B26",
      4448: "\u97E9\u6587\u97F5\u6BCD\u586B\u5145\u7B26",
      65440: "\u534A\u89D2\u97E9\u6587\u586B\u5145\u7B26",
      10240: "\u76F2\u6587\u7A7A\u767D\u56FE\u6848",
      6158: "\u8499\u53E4\u8BED\u5143\u97F3\u5206\u9694\u7B26",
      65533: "\u66FF\u6362\u5B57\u7B26\uFF08\u7F16\u7801\u635F\u574F\u6807\u5FD7\uFF09"
    };
    var CONFUSABLES = {
      // 西里尔小写
      1072: "a",
      1077: "e",
      1086: "o",
      1088: "p",
      1089: "c",
      1091: "y",
      1093: "x",
      1110: "i",
      1109: "s",
      1112: "j",
      // 西里尔大写
      1040: "A",
      1042: "B",
      1045: "E",
      1050: "K",
      1052: "M",
      1053: "H",
      1054: "O",
      1056: "P",
      1057: "C",
      1058: "T",
      1059: "Y",
      1061: "X",
      // 希腊大写
      913: "A",
      914: "B",
      917: "E",
      918: "Z",
      919: "H",
      921: "I",
      922: "K",
      924: "M",
      925: "N",
      927: "O",
      929: "P",
      932: "T",
      933: "Y",
      935: "X",
      // 希腊小写
      959: "o",
      961: "p",
      953: "i",
      957: "v",
      1013: "e"
    };
    var SCRIPT_TITLES = { latin: "\u62C9\u4E01", cyrillic: "\u897F\u91CC\u5C14", greek: "\u5E0C\u814A" };
    function cpHex(cp) {
      return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
    }
    function isCyrillic(cp) {
      return cp >= 1024 && cp <= 1279;
    }
    function isGreek(cp) {
      return cp >= 880 && cp <= 1023 || cp >= 7936 && cp <= 8191;
    }
    function isLatinLetter(cp) {
      return cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122;
    }
    function fullwidthAscii(cp) {
      if (cp >= 65296 && cp <= 65305) return String.fromCharCode(cp - 65248);
      if (cp >= 65313 && cp <= 65338 || cp >= 65345 && cp <= 65370) {
        return String.fromCharCode(cp - 65248);
      }
      return null;
    }
    function isEmojiNeighbor(cp) {
      return cp >= 126976 || cp >= 9728 && cp <= 10175 || cp >= 127462 && cp <= 127487;
    }
    function classifyBase(cp) {
      if (cp === 8206 || cp === 8207 || cp === 1564 || cp >= 8234 && cp <= 8238 || cp >= 8294 && cp <= 8297) {
        return { cat: "bidi", name: NAMES[cp] || "\u53CC\u5411\u63A7\u5236\u5B57\u7B26" };
      }
      if (cp >= 917504 && cp <= 917631) {
        let name = "Tag \u5B57\u7B26\uFF08\u9690\u5F62\u6807\u7B7E\u533A\uFF09";
        if (cp >= 917536 && cp <= 917630) name += `\uFF0C\u89E3\u7801\u4E3A "${String.fromCharCode(cp - 917504)}"`;
        if (cp === 917631) name += "\uFF08\u6807\u7B7E\u7EC8\u6B62\u7B26\uFF09";
        return { cat: "tag", name };
      }
      if (cp === 12644 || cp === 4447 || cp === 4448 || cp === 65440 || cp === 10240 || cp === 6158) {
        return { cat: "filler", name: NAMES[cp] || "\u4E0D\u53EF\u89C1\u586B\u5145\u5B57\u7B26" };
      }
      if (cp === 8205) return { cat: "zwj", name: NAMES[8205] };
      if (cp === 8203 || cp === 8204 || cp === 8288 || cp >= 8289 && cp <= 8292 || cp === 65279) {
        return { cat: "zerowidth", name: NAMES[cp] || "\u96F6\u5BBD\u5B57\u7B26" };
      }
      if (cp >= 65024 && cp <= 65039) {
        return { cat: "variation", name: `\u53D8\u4F53\u9009\u62E9\u7B26 VS${cp - 65024 + 1}` };
      }
      if (cp >= 917760 && cp <= 917999) {
        return { cat: "variation", name: `\u53D8\u4F53\u9009\u62E9\u7B26\u8865\u5145 VS${cp - 917760 + 17}` };
      }
      if (cp === 847 || cp === 173) {
        return { cat: "variation", name: NAMES[cp] };
      }
      if (cp === 9 || cp === 10 || cp === 13) return null;
      if (cp <= 31 || cp === 127) return { cat: "control", name: `C0 \u63A7\u5236\u5B57\u7B26 ${cpHex(cp)}` };
      if (cp >= 128 && cp <= 159) return { cat: "control", name: `C1 \u63A7\u5236\u5B57\u7B26 ${cpHex(cp)}` };
      if (cp === 65533) return { cat: "replacement", name: NAMES[65533] };
      if (CONFUSABLES[cp] !== void 0) {
        const sub = isCyrillic(cp) ? "cyrillic" : "greek";
        return { cat: "homoglyph", sub, suggest: CONFUSABLES[cp], name: `${String.fromCodePoint(cp)}\uFF08${SCRIPT_TITLES[sub]}\u5B57\u6BCD\uFF0C\u5F62\u4F3C "${CONFUSABLES[cp]}"\uFF09` };
      }
      const fw = fullwidthAscii(cp);
      if (fw) {
        return { cat: "homoglyph", sub: "fullwidth", suggest: fw, name: `${String.fromCodePoint(cp)}\uFF08\u5168\u89D2\u5B57\u7B26\uFF0C\u5BF9\u5E94 "${fw}"\uFF09` };
      }
      if (cp >= 119808 && cp <= 120831) {
        const nfc = String.fromCodePoint(cp).normalize("NFKC");
        const suggest = /^[\x21-\x7E]$/.test(nfc) ? nfc : null;
        return { cat: "homoglyph", sub: "math", suggest, name: `\u6570\u5B66\u5B57\u6BCD\u53D8\u4F53 ${cpHex(cp)}${suggest ? `\uFF08\u5BF9\u5E94 "${suggest}"\uFF09` : "\uFF08\u5E38\u6765\u81EA Word/\u516C\u5F0F\u7F16\u8F91\u5668\u590D\u5236\uFF09"}` };
      }
      if (cp === 12288) return { cat: "space", name: NAMES[12288] };
      if (cp >= 8192 && cp <= 8202 || cp === 8239 || cp === 8287 || cp === 160) {
        return { cat: "space", name: NAMES[cp] || "\u5F02\u5E38\u7A7A\u767D\u5B57\u7B26" };
      }
      if (cp >= 57344 && cp <= 63743 || cp >= 983040 && cp <= 1048573 || cp >= 1048576 && cp <= 1114109) {
        return { cat: "pua", name: `\u79C1\u6709\u4F7F\u7528\u533A\u5B57\u7B26 ${cpHex(cp)}` };
      }
      return null;
    }
    function riskOf(base, prevCp, nextCp) {
      if (base.cat === "zwj") {
        return isEmojiNeighbor(prevCp) || isEmojiNeighbor(nextCp) ? "low" : "medium";
      }
      return CATS2[base.cat].risk;
    }
    var MAX_CHARS = 2e6;
    var MAX_FINDINGS = 5e3;
    function scanText2(text) {
      if (typeof text !== "string") throw new TypeError("text \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
      if (text.length > MAX_CHARS) throw new Error(`\u6587\u672C\u8FC7\u957F\uFF08${text.length} \u5B57\u7B26\uFF0C\u4E0A\u9650 ${MAX_CHARS}\uFF09\uFF0C\u8BF7\u5206\u6BB5\u626B\u63CF`);
      const findings = [];
      const counts = {};
      const hiddenMessages = [];
      let truncated = false;
      let line = 1;
      let col = 1;
      let i = 0;
      let lineScripts = null;
      const resetLine = () => {
        lineScripts = { latin: 0, cyrillic: 0, greek: 0, first: {} };
      };
      resetLine();
      let totalLines = 1;
      let tagRun = null;
      const flushTagRun = () => {
        if (tagRun && tagRun.chars.length >= 2 && tagRun.findingIdx >= 0) {
          const msg = tagRun.chars.join("");
          hiddenMessages.push(msg);
          const f = findings[tagRun.findingIdx];
          if (f) f.hiddenMessage = msg;
        }
        tagRun = null;
      };
      const pushFinding = (f) => {
        counts[f.cat] = (counts[f.cat] || 0) + 1;
        if (findings.length >= MAX_FINDINGS) {
          truncated = true;
          return -1;
        }
        findings.push(f);
        return findings.length - 1;
      };
      let prevCp = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        const width = cp > 65535 ? 2 : 1;
        if (cp === 10) {
          flushTagRun();
          flushMixed();
          totalLines += 1;
          line += 1;
          col = 1;
          i += 1;
          prevCp = 0;
          resetLine();
          continue;
        }
        const base = classifyBase(cp);
        if (base) {
          const risk = riskOf(base, prevCp, text.codePointAt(i + width));
          const f = {
            index: i,
            end: i + width,
            cp: cpHex(cp),
            cat: base.cat,
            sub: base.sub,
            suggest: base.suggest,
            risk,
            name: base.name,
            line,
            col,
            context: buildContext(text, i, i + width)
          };
          const idx = pushFinding(f);
          if (base.cat === "tag") {
            if (cp >= 917536 && cp <= 917630) {
              if (!tagRun) tagRun = { findingIdx: idx, chars: [] };
              tagRun.chars.push(String.fromCharCode(cp - 917504));
            } else {
              flushTagRun();
            }
          } else {
            flushTagRun();
          }
        } else {
          flushTagRun();
          if (isLatinLetter(cp)) lineScripts.latin += 1;
          else if (isCyrillic(cp)) {
            lineScripts.cyrillic += 1;
            if (lineScripts.first.cyrillic === void 0) lineScripts.first.cyrillic = { index: i, line, col };
          } else if (isGreek(cp)) {
            lineScripts.greek += 1;
            if (lineScripts.first.greek === void 0) lineScripts.first.greek = { index: i, line, col };
          }
        }
        prevCp = cp;
        i += width;
        col += width;
      }
      flushTagRun();
      flushMixed();
      totalLines = line;
      function flushMixed() {
        const s = lineScripts;
        const present = ["latin", "cyrillic", "greek"].filter((k) => s[k] > 0);
        if (present.length < 2) {
          resetLine();
          return;
        }
        let minority = present[0];
        for (const k of present) {
          if (s[k] < s[minority] || s[k] === s[minority] && k !== "latin" && minority === "latin") minority = k;
        }
        const pos = s.first[minority] || s.first[present.find((k) => s.first[k])] || { index: i, line, col };
        const desc = present.map((k) => `${SCRIPT_TITLES[k]}\xD7${s[k]}`).join(" + ");
        const posWidth = text.codePointAt(pos.index) > 65535 ? 2 : 1;
        pushFinding({
          index: pos.index,
          end: pos.index + posWidth,
          cp: cpHex(text.codePointAt(pos.index)),
          cat: "mixed_script",
          sub: minority,
          risk: "medium",
          name: `\u6DF7\u5408\u6587\u5B57\u7CFB\u7EDF\u6DF7\u6392\uFF08${desc}\uFF09`,
          line: pos.line,
          col: pos.col,
          context: buildContext(text, pos.index, pos.index + posWidth)
        });
        resetLine();
      }
      const linesArr = text.split("\n");
      let lineStart = 0;
      for (let li = 0; li < linesArr.length; li++) {
        const ln = linesArr[li];
        if (ln.length > 0 && ln.normalize("NFC") !== ln) {
          const idx = lineStart + firstNfcDiffPos(ln);
          pushFinding({
            index: idx,
            end: idx + (text.codePointAt(idx) > 65535 ? 2 : 1),
            cp: cpHex(text.codePointAt(idx)),
            cat: "nonnormal",
            risk: "low",
            name: "NFC \u672A\u5F52\u4E00\u5316\u5E8F\u5217",
            line: li + 1,
            col: idx - lineStart + 1,
            context: buildContext(text, idx, idx + 2)
          });
        }
        lineStart += ln.length + 1;
      }
      const riskCounts = { high: 0, medium: 0, low: 0 };
      for (const f of findings) riskCounts[f.risk] += 1;
      const verdict = riskCounts.high > 0 ? "high" : riskCounts.medium > 0 ? "medium" : riskCounts.low > 0 ? "low" : "clean";
      let charCount = 0;
      for (const _ of text) charCount += 1;
      return {
        verdict,
        counts,
        riskCounts,
        findings,
        truncated,
        stats: { chars: charCount, units: text.length, lines: totalLines },
        hiddenMessages
      };
    }
    function firstNfcDiffPos(lineText) {
      const nfc = lineText.normalize("NFC");
      if (nfc === lineText) return 0;
      let k = 0;
      for (const ch of lineText) {
        const w = ch.codePointAt(0) > 65535 ? 2 : 1;
        if (nfc[k] !== lineText[k]) return k;
        k += w;
        if (k > nfc.length) return 0;
      }
      return 0;
    }
    function isInvisibleCat(cat) {
      return cat !== "homoglyph" && cat !== "mixed_script" && cat !== "nonnormal";
    }
    function buildContext(text, start, stop) {
      const from = Math.max(0, start - 24);
      const to = Math.min(text.length, stop + 24);
      let out = "";
      for (let k = from; k < to; ) {
        const cp = text.codePointAt(k);
        const w = cp > 65535 ? 2 : 1;
        const base = classifyBase(cp);
        if (base && isInvisibleCat(base.cat)) out += `{${cpHex(cp)}}`;
        else if (cp === 10 || cp === 13) out += "\u23CE";
        else if (cp === 9) out += "\\t";
        else out += String.fromCodePoint(cp);
        k += w;
      }
      return out;
    }
    function scrubText2(text, opts = {}) {
      const {
        fixHomoglyph = false,
        nfcNormalize = false,
        keepIdeographicSpace = true,
        dropPua = false
      } = opts;
      if (typeof text !== "string") throw new TypeError("text \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
      if (text.length > MAX_CHARS) throw new Error(`\u6587\u672C\u8FC7\u957F\uFF08${text.length} \u5B57\u7B26\uFF0C\u4E0A\u9650 ${MAX_CHARS}\uFF09`);
      const deleted = {};
      const replaced = {};
      let homoglyphFixed = 0;
      let out = "";
      let i = 0;
      let prevCp = 0;
      const bump = (map, key) => {
        map[key] = (map[key] || 0) + 1;
      };
      while (i < text.length) {
        const cp = text.codePointAt(i);
        const width = cp > 65535 ? 2 : 1;
        const ch = String.fromCodePoint(cp);
        const base = classifyBase(cp);
        if (!base) {
          out += ch;
          prevCp = cp;
          i += width;
          continue;
        }
        switch (base.cat) {
          case "bidi":
          case "tag":
          case "filler":
          case "zerowidth":
          case "variation":
          case "control":
            bump(deleted, base.cat);
            break;
          // 删除（不追加）
          case "zwj": {
            const nextCp = text.codePointAt(i + width);
            if (isEmojiNeighbor(prevCp) || isEmojiNeighbor(nextCp)) out += ch;
            else bump(deleted, "zwj");
            break;
          }
          case "replacement":
            out += ch;
            break;
          case "space":
            if (cp === 12288) {
              if (keepIdeographicSpace) out += ch;
              else {
                out += " ";
                bump(replaced, "space");
              }
            } else {
              out += " ";
              bump(replaced, "space");
            }
            break;
          case "pua":
            if (dropPua) bump(deleted, "pua");
            else out += ch;
            break;
          case "homoglyph":
          case "mixed_script":
          case "nonnormal":
            if (base.cat === "homoglyph" && fixHomoglyph && base.suggest) {
              out += base.suggest;
              homoglyphFixed += 1;
            } else {
              out += ch;
            }
            break;
          default:
            out += ch;
        }
        prevCp = cp;
        i += width;
      }
      let normalized = false;
      if (nfcNormalize) {
        const nfc = out.normalize("NFC");
        if (nfc !== out) {
          out = nfc;
          normalized = true;
        }
      }
      return {
        cleaned: out,
        changed: out !== text,
        deleted,
        replaced,
        homoglyphFixed,
        normalized
      };
    }
    var CHAR_INFO_LIMIT = 32;
    function charInfo(text) {
      if (typeof text !== "string") throw new TypeError("chars \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
      const items = [];
      let n = 0;
      for (const ch of text) {
        if (items.length >= CHAR_INFO_LIMIT) {
          n += 1;
          continue;
        }
        const cp = ch.codePointAt(0);
        const base = classifyBase(cp);
        if (base) {
          items.push({
            cp: cpHex(cp),
            char: ch,
            name: base.name,
            cat: base.cat,
            catTitle: CATS2[base.cat].title,
            risk: CATS2[base.cat].risk,
            desc: CATS2[base.cat].desc,
            suggest: base.suggest || null,
            scrub: scrubActionOf(base.cat)
          });
        } else if (cp === 9) {
          items.push({ cp: cpHex(cp), char: ch, name: "\u6C34\u5E73\u5236\u8868\u7B26 Tab", cat: "ok", catTitle: "\u5408\u6CD5\u5B57\u7B26", risk: "none", desc: "\u5236\u8868\u7B26\uFF0C\u5C5E\u6B63\u5E38\u63A7\u5236\u5B57\u7B26\u3002", suggest: null, scrub: "\u4FDD\u7559" });
        } else if (cp === 10) {
          items.push({ cp: cpHex(cp), char: ch, name: "\u6362\u884C LF", cat: "ok", catTitle: "\u5408\u6CD5\u5B57\u7B26", risk: "none", desc: "\u6362\u884C\u7B26\u3002", suggest: null, scrub: "\u4FDD\u7559" });
        } else {
          items.push({ cp: cpHex(cp), char: ch, name: `\u5B57\u7B26 ${ch}`, cat: "ok", catTitle: "\u5E38\u89C4\u5B57\u7B26", risk: "none", desc: "\u672A\u68C0\u51FA\u98CE\u9669\u7C7B\u522B\u3002", suggest: null, scrub: "\u4FDD\u7559" });
        }
        n += 1;
      }
      return { items, total: n, truncated: n > CHAR_INFO_LIMIT };
    }
    function scrubActionOf(cat) {
      switch (cat) {
        case "bidi":
        case "tag":
        case "filler":
        case "zerowidth":
        case "variation":
        case "control":
        case "zwj":
          return "\u6E05\u6D17\u65F6\u5220\u9664";
        case "replacement":
          return "\u65E0\u6CD5\u8FD8\u539F\uFF0C\u4FDD\u7559\u5E76\u63D0\u793A";
        case "space":
          return "\u6E05\u6D17\u65F6\u66FF\u6362\u4E3A\u666E\u901A\u7A7A\u683C\uFF08\u5168\u89D2\u7A7A\u683C\u9ED8\u8BA4\u4FDD\u7559\uFF09";
        case "pua":
          return "\u9ED8\u8BA4\u4FDD\u7559\uFF08dropPua \u9009\u9879\u5220\u9664\uFF09";
        case "homoglyph":
          return "\u9ED8\u8BA4\u4FDD\u7559\uFF08fixHomoglyph \u9009\u9879\u6620\u5C04\u56DE ASCII\uFF09";
        case "mixed_script":
        case "nonnormal":
          return "\u6309\u884C\u62A5\u544A\uFF0C\u4E0D\u505A\u5B57\u7B26\u7EA7\u5904\u7406";
        default:
          return "\u4FDD\u7559";
      }
    }
    var VERDICT_LABEL = {
      clean: "\u2705 \u5E72\u51C0",
      low: "\u{1F7E1} \u4F4E\u63D0\u793A",
      medium: "\u{1F7E0} \u4E2D\u5371",
      high: "\u{1F534} \u9AD8\u5371\uFF08\u9690\u5F62\u6CE8\u5165\u8F7D\u4F53\u68C0\u51FA\uFF09"
    };
    function renderReport2(scan) {
      const lines = [];
      lines.push(`\u5224\u5B9A\uFF1A${VERDICT_LABEL[scan.verdict]}`);
      lines.push(`\u626B\u63CF ${scan.stats.chars} \u5B57\u7B26\uFF08${scan.stats.lines} \u884C\uFF09\uFF1B\u68C0\u51FA \u9AD8\u5371 ${scan.riskCounts.high} \u9879 / \u4E2D\u5371 ${scan.riskCounts.medium} \u9879 / \u63D0\u793A ${scan.riskCounts.low} \u9879`);
      if (scan.truncated) lines.push("\u26A0\uFE0F \u660E\u7EC6\u8D85\u51FA\u4E0A\u9650\u5DF2\u622A\u65AD\uFF08\u8BA1\u6570\u4ECD\u4E3A\u5168\u91CF\uFF09");
      for (const cat of CAT_ORDER2) {
        const n = scan.counts[cat];
        if (!n) continue;
        const meta = CATS2[cat];
        lines.push("");
        lines.push(`[${meta.risk === "high" ? "\u9AD8\u5371" : meta.risk === "medium" ? "\u4E2D\u5371" : "\u63D0\u793A"}] ${meta.title} \xD7${n}`);
        lines.push(`  ${meta.desc}`);
        const sample = scan.findings.filter((f) => f.cat === cat).slice(0, 5);
        for (const f of sample) {
          lines.push(`  - \u884C${f.line} \u5217${f.col} ${f.cp}${f.name ? ` ${f.name}` : ""}\uFF5C\u4E0A\u4E0B\u6587: ${f.context}`);
          if (f.hiddenMessage) lines.push(`    \u2514 \u9690\u85CF\u5185\u5BB9\u89E3\u7801: "${f.hiddenMessage}"`);
        }
        const rest = scan.counts[cat] - sample.length;
        if (rest > 0) lines.push(`  \uFF08\u53E6 ${rest} \u5904\u7565\uFF09`);
      }
      if (scan.hiddenMessages.length) {
        lines.push("");
        lines.push(`\u{1F50D} Tag \u9690\u5F62\u6807\u7B7E\u89E3\u7801\u51FA ${scan.hiddenMessages.length} \u6BB5\u9690\u85CF\u5185\u5BB9\uFF08\u4EBA\u773C\u4E0D\u53EF\u89C1\u3001AI \u53EF\u8BFB\uFF09\u2014\u2014\u52A1\u5FC5\u5BA1\u67E5\u5176\u8BED\u4E49\uFF1A`);
        for (const m of scan.hiddenMessages.slice(0, 3)) lines.push(`  "${m}"`);
      }
      lines.push("");
      lines.push(renderAdvice(scan));
      return lines.join("\n");
    }
    function renderAdvice(scan) {
      const tips = [];
      if (scan.counts.bidi) tips.push("\u53CC\u5411\u63A7\u5236\u5B57\u7B26\uFF1A\u4EE3\u7801\u6587\u4EF6\u4E2D\u7ACB\u5373\u5220\u9664\u5E76\u5BA1\u67E5\u8BE5\u884C\u771F\u5B9E\u903B\u8F91\uFF08Trojan Source\uFF09\uFF1B\u63D0\u793A\u8BCD/\u6587\u6863\u4E2D\u4E00\u5E76\u6E05\u6D17\u3002");
      if (scan.counts.tag) tips.push("Tag \u9690\u5F62\u6807\u7B7E\uFF1A\u7528\u6E05\u6D17\uFF08scrub\uFF09\u5220\u9664\uFF1B\u82E5\u89E3\u7801\u51FA\u6307\u4EE4\u6027\u5185\u5BB9\uFF0C\u6309\u63D0\u793A\u8BCD\u6CE8\u5165\u5904\u7F6E\u3002");
      if (scan.counts.filler) tips.push("\u4E0D\u53EF\u89C1\u586B\u5145\uFF1A\u51FA\u73B0\u5728\u7528\u6237\u540D/\u6807\u8BC6\u7B26\u4E2D\u901A\u5E38\u4E3A\u523B\u610F\u6784\u9020\uFF0C\u5EFA\u8BAE\u6E05\u6D17\u540E\u6838\u5BF9\u5224\u91CD\u903B\u8F91\u3002");
      if (scan.counts.zerowidth) tips.push("\u96F6\u5BBD\u5B57\u7B26\uFF1A\u7528\u6E05\u6D17\uFF08scrub\uFF09\u5220\u9664\uFF1B\u82E5\u4E3A\u81EA\u6709\u6C34\u5370\u53EF\u4FDD\u7559\u3002");
      if (scan.counts.homoglyph) tips.push("\u540C\u5F62\u5F02\u7801\u5B57\uFF1Ascrub \u52A0 fixHomoglyph=true \u53EF\u6620\u5C04\u56DE ASCII\uFF1B\u6D89\u53CA\u57DF\u540D/\u8D26\u53F7\u65F6\u4EBA\u5DE5\u6838\u5BF9\u3002");
      if (scan.counts.mixed_script) tips.push("\u6DF7\u6392\u884C\uFF1A\u9010\u884C\u4EBA\u5DE5\u786E\u8BA4\u662F\u5426\u523B\u610F\u6DF7\u5165\u897F\u91CC\u5C14/\u5E0C\u814A\u5B57\u6BCD\u3002");
      if (scan.counts.replacement) tips.push("U+FFFD\uFF1A\u6E90\u6587\u4EF6\u53EF\u80FD\u4E0D\u662F UTF-8\uFF0C\u786E\u8BA4\u7F16\u7801\u540E\u91CD\u65B0\u5BFC\u51FA\uFF0C\u52FF\u76F4\u63A5\u5728\u66FF\u6362\u7B26\u57FA\u7840\u4E0A\u4FEE\u8865\u3002");
      if (scan.counts.nonnormal) tips.push("NFC \u672A\u5F52\u4E00\u5316\uFF1Ascrub \u52A0 nfcNormalize=true \u7EDF\u4E00\u5F62\u5F0F\u3002");
      if (!tips.length) tips.push("\u672A\u68C0\u51FA\u98CE\u9669\u7C7B\u522B\uFF0C\u6587\u672C\u53EF\u653E\u5FC3\u4F7F\u7528\u3002");
      return `\u5EFA\u8BAE\uFF1A
${tips.map((t) => `  - ${t}`).join("\n")}`;
    }
    function renderConfusablesReport(scan) {
      const h = scan.counts.homoglyph || 0;
      const m = scan.counts.mixed_script || 0;
      const nn = scan.counts.nonnormal || 0;
      const lines = [];
      const verdict = h || m ? "\u{1F7E0} \u68C0\u51FA\u540C\u5F62\u6DF7\u6DC6\u98CE\u9669" : nn ? "\u{1F7E1} \u4EC5\u5F52\u4E00\u5316\u63D0\u793A" : "\u2705 \u672A\u68C0\u51FA\u540C\u5F62\u6DF7\u6DC6";
      lines.push(`\u5224\u5B9A\uFF1A${verdict}`);
      lines.push(`\u540C\u5F62\u5F02\u7801\u5B57 ${h} \u5904 / \u6DF7\u6392\u884C ${m} \u884C / NFC \u672A\u5F52\u4E00\u5316 ${nn} \u884C`);
      const rel = scan.findings.filter((f) => f.cat === "homoglyph" || f.cat === "mixed_script" || f.cat === "nonnormal");
      for (const f of rel.slice(0, 10)) {
        lines.push(`- \u884C${f.line} \u5217${f.col} ${f.cp} ${f.name}\uFF5C\u4E0A\u4E0B\u6587: ${f.context}`);
        if (f.suggest) lines.push(`  \u2514 \u5EFA\u8BAE\u66FF\u6362\u4E3A "${f.suggest}"`);
      }
      if (rel.length > 10) lines.push(`\uFF08\u53E6 ${rel.length - 10} \u5904\u7565\uFF09`);
      if (h || m) {
        lines.push("\u5EFA\u8BAE\uFF1A\u57DF\u540D/\u7528\u6237\u540D/\u4EE3\u7801\u6807\u8BC6\u7B26\u573A\u666F\u4F18\u5148\u4EBA\u5DE5\u6838\u5BF9\uFF1Bscrub \u52A0 fixHomoglyph=true \u4E00\u952E\u6620\u5C04\u56DE ASCII\u3002");
      } else {
        lines.push("\u672A\u68C0\u51FA\u897F\u91CC\u5C14/\u5E0C\u814A/\u5168\u89D2/\u6570\u5B66\u53D8\u4F53\u6DF7\u6DC6\u3002");
      }
      return lines.join("\n");
    }
    function truncate(s, max = 60) {
      if (typeof s !== "string") return "";
      return s.length <= max ? s : s.slice(0, max) + "\u2026";
    }
    module.exports = {
      CAT_ORDER: CAT_ORDER2,
      CATS: CATS2,
      scanText: scanText2,
      scrubText: scrubText2,
      charInfo,
      renderReport: renderReport2,
      renderConfusablesReport,
      renderAdvice,
      cpHex,
      buildContext,
      truncate,
      MAX_CHARS,
      MAX_FINDINGS
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_unicode_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.ul-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ul-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ul-head b{font-size:13px}
.ul-head .sub{color:#5C6678;font-size:11px}
.ul-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ul-area{width:100%;min-height:120px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.ul-area:focus{border-color:#e8b33d}
.ul-btnrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ul-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.ul-btn.primary{background:#3d3417;border-color:#e8b33d;color:#f3d98b}
.ul-btn:disabled{opacity:.5;cursor:not-allowed}
.ul-opt{display:flex;gap:4px;align-items:center;color:#8B94A9;font-size:11px;cursor:pointer;user-select:none}
.ul-opt input{accent-color:#e8b33d}
.ul-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.ul-verdict.clean{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.ul-verdict.low{background:#14202b;border-color:#3b82a0;color:#9cc9e0}
.ul-verdict.medium{background:#2b2413;border-color:#d99a17;color:#f3d98b}
.ul-verdict.high{background:#2d1512;border-color:#e8590c;color:#f3b377}
.ul-verdict b{font-size:13px}
.ul-chips{display:flex;gap:6px;flex-wrap:wrap}
.ul-chip{border-radius:999px;padding:3px 10px;font-size:11px;border:1px solid}
.ul-chip.high{background:#2d1512;border-color:#e8590c;color:#f3b377}
.ul-chip.medium{background:#2b2413;border-color:#d99a17;color:#f3d98b}
.ul-chip.low{background:#14202b;border-color:#3b82a0;color:#9cc9e0}
.ul-hl{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.9 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede;max-height:260px;overflow:auto}
.ul-m{border-radius:4px;padding:0 2px;font-weight:600}
.ul-m.high{background:#5c1f0e;color:#ffb894}
.ul-m.medium{background:#4d3c0d;color:#ffe08a}
.ul-m.low{background:#17303f;color:#a8d8ee}
.ul-m.mk{background:transparent;color:#ff9f6e;outline:1px solid #e8590c66;font-weight:600}
.ul-sec{color:#8B94A9;font-size:11px}
.ul-report{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c9cede}
.ul-note{color:#5C6678;font-size:11px;line-height:1.6}
.ul-hidden{background:#2d1512;border:1px dashed #e8590c;border-radius:8px;padding:8px 12px;color:#ffb894;font:12px/1.6 ui-monospace,Consolas,monospace;word-break:break-all}
`;
var DISPLAY_CAP = 2e4;
function isMarkerCat(cat) {
  return cat !== "homoglyph" && cat !== "mixed_script" && cat !== "nonnormal";
}
function buildSegments(text, findings) {
  const t = text.length > DISPLAY_CAP ? text.slice(0, DISPLAY_CAP) : text;
  const segs = [];
  let pos = 0;
  for (const f of findings) {
    if (f.index >= t.length) break;
    if (f.index < pos) continue;
    if (f.index > pos) segs.push({ text: t.slice(pos, f.index) });
    const end = Math.min(f.end, t.length);
    segs.push({ text: t.slice(f.index, end), f });
    pos = end;
  }
  if (pos < t.length) segs.push({ text: t.slice(pos) });
  return { segs, truncated: text.length > DISPLAY_CAP };
}
var VERDICT_TEXT = {
  clean: "\u2705 \u5E72\u51C0\u2014\u2014\u672A\u68C0\u51FA\u98CE\u9669\u5B57\u7B26",
  low: "\u{1F7E1} \u4F4E\u63D0\u793A\u2014\u2014\u6709\u53EF\u4E86\u89E3\u7684\u4F4E\u98CE\u9669\u5B57\u7B26\uFF08\u8BE6\u89C1\u4E0B\u65B9\u5206\u7C7B\uFF09",
  medium: "\u{1F7E0} \u4E2D\u5371\u2014\u2014\u68C0\u51FA\u53EF\u7591\u5B57\u7B26\uFF0C\u5EFA\u8BAE\u6E05\u6D17\u6216\u4EBA\u5DE5\u6838\u5BF9",
  high: "\u{1F534} \u9AD8\u5371\u2014\u2014\u68C0\u51FA\u9690\u5F62\u6CE8\u5165\u8F7D\u4F53\uFF0C\u52A1\u5FC5\u6E05\u6D17\u540E\u518D\u4F7F\u7528"
};
function UnicodeLensPanel(props) {
  const [input, setInput] = useState("");
  const [scanned, setScanned] = useState("");
  const [error, setError] = useState(null);
  const [fixHomoglyph, setFixHomoglyph] = useState(false);
  const [nfcNormalize, setNfcNormalize] = useState(false);
  const [dropPua, setDropPua] = useState(false);
  const [keepIdeo, setKeepIdeo] = useState(true);
  const [scrubbed, setScrubbed] = useState(null);
  const scan = useMemo(() => {
    if (!scanned) return null;
    try {
      setError(null);
      return core.scanText(scanned);
    } catch (e) {
      setError(String(e.message || e));
      return null;
    }
  }, [scanned]);
  const runScan = () => {
    setScrubbed(null);
    setError(null);
    setScanned(input);
  };
  const runScrub = () => {
    setError(null);
    try {
      const r = core.scrubText(scanned || input, {
        fixHomoglyph,
        nfcNormalize,
        dropPua,
        keepIdeographicSpace: keepIdeo
      });
      setScrubbed(r);
      if (!scanned) setScanned(input);
    } catch (e) {
      setError(String(e.message || e));
    }
  };
  const segs = useMemo(() => {
    if (!scan) return null;
    return buildSegments(scanned, scan.findings);
  }, [scan, scanned]);
  const report = useMemo(() => {
    if (!scan) return null;
    try {
      return core.renderReport(scan);
    } catch (_) {
      return null;
    }
  }, [scan]);
  const sendReport = () => {
    if (props.onSendToChat && report) props.onSendToChat(report);
  };
  return /* @__PURE__ */ jsxs("div", { className: "ul-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "ul-head", children: [
      /* @__PURE__ */ jsx("b", { children: "Unicode \u68C0\u67E5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u9690\u5F62\u6CE8\u5165\u8F7D\u4F53 \xB7 \u540C\u5F62\u5B57 \xB7 \u6DF7\u6392 \xB7 \u7EAF\u672C\u5730" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ul-body", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "ul-area",
          placeholder: "\u7C98\u8D34\u5F85\u68C0\u6587\u672C/\u63D0\u793A\u8BCD/\u4EE3\u7801\u7247\u6BB5\n\u9690\u5F62\u5B57\u7B26\u4EBA\u773C\u4E0D\u53EF\u89C1\u2014\u2014\u626B\u63CF\u540E\u9010\u5B57\u7B26\u53EF\u89C6\u5316\u6807\u6CE8",
          value: input,
          onChange: (e) => setInput(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "ul-btnrow", children: [
        /* @__PURE__ */ jsx("button", { className: "ul-btn primary", onClick: runScan, disabled: !input.trim(), children: "\u626B\u63CF" }),
        /* @__PURE__ */ jsx("button", { className: "ul-btn", onClick: runScrub, disabled: !input.trim(), children: "\u4E00\u952E\u6E05\u6D17" }),
        /* @__PURE__ */ jsxs("label", { className: "ul-opt", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: fixHomoglyph, onChange: (e) => setFixHomoglyph(e.target.checked) }),
          "\u540C\u5F62\u5B57\u2192ASCII"
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "ul-opt", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: nfcNormalize, onChange: (e) => setNfcNormalize(e.target.checked) }),
          "NFC \u5F52\u4E00\u5316"
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "ul-opt", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: dropPua, onChange: (e) => setDropPua(e.target.checked) }),
          "\u5220\u79C1\u6709\u533A"
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "ul-opt", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: keepIdeo, onChange: (e) => setKeepIdeo(e.target.checked) }),
          "\u4FDD\u7559\u5168\u89D2\u7A7A\u683C"
        ] })
      ] }),
      error && /* @__PURE__ */ jsxs("div", { className: "ul-verdict high", children: [
        /* @__PURE__ */ jsx("b", { children: "\u51FA\u9519" }),
        "\uFF1A",
        error
      ] }),
      scan && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `ul-verdict ${scan.verdict}`, children: [
          /* @__PURE__ */ jsx("b", { children: VERDICT_TEXT[scan.verdict] }),
          ` \uFF5C \u9AD8\u5371 ${scan.riskCounts.high} / \u4E2D\u5371 ${scan.riskCounts.medium} / \u63D0\u793A ${scan.riskCounts.low}`
        ] }),
        scan.hiddenMessages.length > 0 && /* @__PURE__ */ jsxs("div", { className: "ul-hidden", children: [
          "\u{1F50D} Tag \u9690\u5F62\u6807\u7B7E\u89E3\u7801\u51FA\u9690\u85CF\u5185\u5BB9\uFF08\u4EBA\u773C\u4E0D\u53EF\u89C1\u3001AI \u53EF\u8BFB\uFF09\uFF1A",
          scan.hiddenMessages.map((m, i) => `"${m}"`).join("\uFF1B")
        ] }),
        /* @__PURE__ */ jsx("div", { className: "ul-chips", children: core.CAT_ORDER.filter((c) => scan.counts[c] > 0).map((c) => {
          const meta = core.CATS[c];
          return /* @__PURE__ */ jsxs("span", { className: `ul-chip ${meta.risk}`, children: [
            meta.title,
            " \xD7",
            scan.counts[c]
          ] }, c);
        }) }),
        segs && /* @__PURE__ */ jsxs("div", { className: "ul-hl", children: [
          segs.segs.map(
            (s, i) => s.f ? isMarkerCat(s.f.cat) ? /* @__PURE__ */ jsx("span", { className: `ul-m mk ${s.f.risk}`, title: `\u884C${s.f.line}\u5217${s.f.col} ${s.f.cp} ${s.f.name}`, children: `{${s.f.cp}}` }, i) : /* @__PURE__ */ jsx("span", { className: `ul-m ${s.f.risk}`, title: `\u884C${s.f.line}\u5217${s.f.col} ${s.f.name}${s.f.suggest ? ` \u5EFA\u8BAE"${s.f.suggest}"` : ""}`, children: s.text }, i) : /* @__PURE__ */ jsx("span", { children: s.text }, i)
          ),
          segs.truncated && /* @__PURE__ */ jsxs("div", { className: "ul-note", children: [
            "\uFF08\u4EC5\u53EF\u89C6\u5316\u524D ",
            DISPLAY_CAP,
            " \u5B57\u7B26\uFF09"
          ] })
        ] }),
        report && /* @__PURE__ */ jsx("div", { className: "ul-report", children: report }),
        props.onSendToChat && /* @__PURE__ */ jsx("div", { className: "ul-btnrow", children: /* @__PURE__ */ jsx("button", { className: "ul-btn", onClick: sendReport, children: "\u53D1\u9001\u62A5\u544A\u5230\u5BF9\u8BDD" }) })
      ] }),
      scrubbed && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "ul-sec", children: [
          "\u6E05\u6D17\u7ED3\u679C\uFF1A",
          Object.entries(scrubbed.deleted).map(([k, v]) => `\u5220 ${core.CATS[k]?.title || k}\xD7${v}`).join("\uFF0C") || "\u65E0\u5220\u9664",
          scrubbed.homoglyphFixed ? `\uFF0C\u540C\u5F62\u5B57\u6620\u5C04 ${scrubbed.homoglyphFixed} \u5904` : "",
          scrubbed.normalized ? "\uFF0C\u5DF2 NFC \u5F52\u4E00\u5316" : ""
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "ul-area",
            readOnly: true,
            value: scrubbed.cleaned,
            onFocus: (e) => e.currentTarget.select()
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "ul-btnrow", children: [
          /* @__PURE__ */ jsx("button", { className: "ul-btn", onClick: () => {
            setInput(scrubbed.cleaned);
            setScrubbed(null);
            setScanned("");
          }, children: "\u66FF\u6362\u8F93\u5165" }),
          /* @__PURE__ */ jsx("button", { className: "ul-btn", onClick: () => {
            try {
              void navigator.clipboard?.writeText(scrubbed.cleaned);
            } catch (_) {
            }
          }, children: "\u590D\u5236" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ul-note", children: "\u68C0\u6D4B\u57DF\uFF1A\u53CC\u5411\u63A7\u5236\u5B57\u7B26\uFF08Trojan Source CVE-2021-42574\uFF09\xB7 Unicode Tag \u9690\u5F62\u6807\u7B7E\uFF08\u63D0\u793A\u8BCD\u9690\u5F62\u6CE8\u5165\u8F7D\u4F53\uFF09\xB7 \u96F6\u5BBD\u5B57\u7B26 \xB7 \u4E0D\u53EF\u89C1\u586B\u5145 \xB7 \u53D8\u4F53\u9009\u62E9\u7B26 \xB7 \u63A7\u5236\u5B57\u7B26 \xB7 \u540C\u5F62\u5F02\u7801\u5B57\uFF08\u897F\u91CC\u5C14/\u5E0C\u814A/\u5168\u89D2/\u6570\u5B66\u53D8\u4F53\uFF09\xB7 \u6DF7\u5408\u6587\u5B57\u7CFB\u7EDF \xB7 NFC \u672A\u5F52\u4E00\u5316 \xB7 U+FFFD \u7F16\u7801\u635F\u574F\u3002 emoji \u5E8F\u5217\u4E2D\u7684\u96F6\u5BBD\u8FDE\u63A5\u7B26\u81EA\u52A8\u8C41\u514D\uFF1B\u5168\u89D2\u7A7A\u683C/\u5168\u89D2\u6807\u70B9\u5728\u4E2D\u6587\u8BED\u5883\u9ED8\u8BA4\u4E0D\u89C6\u4E3A\u98CE\u9669\u3002\u6E05\u6D17\u9ED8\u8BA4\u53EA\u5220\u4E0D\u6539\u8BED\u4E49\uFF08\u540C\u5F62\u5B57\u9700\u52FE\u9009\u6620\u5C04\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function UnicodeLensEntry(props) {
  return /* @__PURE__ */ jsx2(UnicodeLensPanel, { ...props });
}
export {
  UnicodeLensEntry as default
};
