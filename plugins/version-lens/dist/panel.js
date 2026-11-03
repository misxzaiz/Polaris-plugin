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

// shared/version-core.js
var require_version_core = __commonJS({
  "shared/version-core.js"(exports, module) {
    "use strict";
    var VERSION_RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    var PRERELEASE_ID_RE = /^(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)$/;
    function parseVersion(input) {
      const raw = String(input == null ? "" : input).trim();
      if (raw === "") return { ok: false, error: "\u7248\u672C\u53F7\u4E3A\u7A7A", raw };
      const m = VERSION_RE.exec(raw);
      if (!m) return { ok: false, error: `\u4E0D\u662F\u5408\u6CD5\u7684 semver \u7248\u672C\uFF08\u5E94\u4E3A major.minor.patch[-prerelease][+build]\uFF09\uFF1A\u300C${raw}\u300D`, raw };
      const major = Number(m[1]);
      const minor = Number(m[2]);
      const patch = Number(m[3]);
      const preRaw = m[4];
      let prerelease = [];
      if (preRaw !== void 0) {
        prerelease = preRaw.split(".");
        const bad = prerelease.find((id) => !PRERELEASE_ID_RE.test(id));
        if (bad !== void 0) return { ok: false, error: `prerelease \u6807\u8BC6\u7B26\u300C${bad}\u300D\u4E0D\u5408\u6CD5\uFF08\u6570\u5B57\u6807\u8BC6\u7B26\u4E0D\u80FD\u6709\u524D\u5BFC\u96F6\uFF09`, raw };
      }
      return {
        ok: true,
        version: { major, minor, patch, prerelease, build: m[5] !== void 0 ? m[5] : null, raw: raw.replace(/^v/, "") }
      };
    }
    function isNumericId(id) {
      return /^\d+$/.test(id);
    }
    function compareParsed(a, b) {
      if (a.major !== b.major) return a.major < b.major ? -1 : 1;
      if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
      if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
      const ap = a.prerelease;
      const bp = b.prerelease;
      if (ap.length === 0 && bp.length === 0) return 0;
      if (ap.length === 0) return 1;
      if (bp.length === 0) return -1;
      const n = Math.min(ap.length, bp.length);
      for (let i = 0; i < n; i++) {
        const x = ap[i];
        const y = bp[i];
        if (x === y) continue;
        const xn = isNumericId(x);
        const yn = isNumericId(y);
        if (xn && yn) {
          if (x.length !== y.length) return x.length < y.length ? -1 : 1;
          return x < y ? -1 : 1;
        }
        if (xn) return -1;
        if (yn) return 1;
        return x < y ? -1 : 1;
      }
      if (ap.length === bp.length) return 0;
      return ap.length < bp.length ? -1 : 1;
    }
    function cmpOk(v, c) {
      const d = compareParsed(v, c.version);
      switch (c.op) {
        case "=":
          return d === 0;
        case ">":
          return d > 0;
        case ">=":
          return d >= 0;
        case "<":
          return d < 0;
        case "<=":
          return d <= 0;
        default:
          return d === 0;
      }
    }
    var NUM = "(?:0|[1-9]\\d*)";
    var XR = `(?:${NUM}|x|X|\\*)`;
    var PARTIAL_RE = new RegExp(
      `^v?(${XR})(?:\\.(${XR})(?:\\.(${XR})(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?)?)?$`
    );
    function isX(t) {
      return t === void 0 || t === "x" || t === "X" || t === "*";
    }
    function expandAtom(opRaw, verText, out, pitfalls, rawAtom) {
      const op = opRaw === "" || opRaw === "=" ? "=" : opRaw;
      if (isX(verText.trim())) {
        if (op === ">" || op === "<") {
          pitfalls.push({ type: "any-with-cmp", message: `\u300C${rawAtom}\u300D\u5BF9\u4EFB\u610F\u7248\u672C\u505A ${op} \u6BD4\u8F83\u6052\u4E3A\u5047\uFF08npm \u7F16\u8BD1\u4E3A <0.0.0-0\uFF09\uFF0C\u8BE5\u6BD4\u8F83\u5668\u6C38\u4E0D\u5339\u914D` });
          out.push({ op: "<", version: { major: 0, minor: 0, patch: 0, prerelease: ["0"], raw: "0.0.0-0" }, raw: rawAtom });
          return;
        }
        return;
      }
      const m = PARTIAL_RE.exec(verText);
      if (!m) throw new Error(`\u65E0\u6CD5\u89E3\u6790\u7248\u672C/\u901A\u914D\u300C${verText}\u300D`);
      const M = m[1];
      const mi = m[2];
      const pa = m[3];
      const pre = m[4];
      const build = m[5];
      if (isX(M)) {
        if (!isX(mi) || !isX(pa)) {
          pitfalls.push({ type: "wildcard-major", message: `\u300C${verText}\u300D\u9AD8\u4F4D\u901A\u914D\u4F4E\u4F4D\u5177\u4F53\uFF0Cnpm \u89C6\u540C\u4EFB\u610F\u7248\u672C\uFF08*\uFF09` });
        }
        return;
      }
      if (build !== void 0 && op !== "") {
        pitfalls.push({ type: "build-ignored", message: `\u6784\u5EFA\u5143\u6570\u636E\uFF08+${build}\uFF09\u5728\u6BD4\u8F83\u4E2D\u88AB\u5FFD\u7565` });
      }
      const fullM = Number(M);
      if (isX(mi)) {
        applyPartial(op, fullM, null, null, null, out, pitfalls, rawAtom);
        return;
      }
      if (isX(pa)) {
        applyPartial(op, fullM, Number(mi), null, null, out, pitfalls, rawAtom);
        return;
      }
      const v = { major: fullM, minor: Number(mi), patch: Number(pa), prerelease: pre ? pre.split(".") : [], build: build !== void 0 ? build : null, raw: `${fullM}.${Number(mi)}.${Number(pa)}${pre ? "-" + pre : ""}` };
      applyFull(op, v, out, rawAtom, pitfalls);
    }
    function mk(op, major, minor, patch, prerelease, raw, synthetic) {
      return { op, version: { major, minor, patch, prerelease: prerelease || [], raw }, raw, synthetic: !!synthetic };
    }
    function applyFull(op, v, out, rawAtom, pitfalls) {
      if (op === "~" || op === "^") {
        out.push(mk(">=", v.major, v.minor, v.patch, v.prerelease, `>=${v.raw}`));
        if (op === "~") {
          out.push(mk("<", v.major, v.minor + 1, 0, ["0"], `<${v.major}.${v.minor + 1}.0-0`, true));
        } else {
          let hi;
          if (v.major > 0) hi = { major: v.major + 1, minor: 0, patch: 0 };
          else if (v.minor > 0) hi = { major: 0, minor: v.minor + 1, patch: 0 };
          else hi = { major: 0, minor: 0, patch: v.patch + 1 };
          out.push(mk("<", hi.major, hi.minor, hi.patch, ["0"], `<${hi.major}.${hi.minor}.${hi.patch}-0`, true));
          if (v.major === 0 && v.minor === 0) {
            pitfalls.push({ type: "zero-zero-caret", message: `\u300C${rawAtom}\u300D\u7684\u63D2\u5165\u7B26\u53EA\u5141\u8BB8 0.0.z \u8865\u4E01\u7EA7\u53D8\u5316\uFF08\u4E0A\u9650 <0.${0}.${v.patch + 1}\uFF09\uFF0C\u4E0D\u662F <1.0.0` });
          } else if (v.major === 0) {
            pitfalls.push({ type: "zero-major-caret", message: `\u300C${rawAtom}\u300D\u7684\u63D2\u5165\u7B26\u9501\u5B9A\u6B21\u7248\u672C\uFF1A\u53EA\u5141\u8BB8\u8865\u4E01\u7EA7\u53D8\u5316\uFF08\u4E0A\u9650 <0.${v.minor + 1}.0\uFF09\uFF0C\u4E0D\u662F <1.0.0\u2014\u20140.x \u9636\u6BB5\u5C0F\u7248\u672C\u53EF\u80FD\u5305\u542B\u7834\u574F\u6027\u53D8\u66F4` });
          }
        }
        return;
      }
      out.push(mk(op === "" ? "=" : op, v.major, v.minor, v.patch, v.prerelease, `${op === "" ? "" : op}${v.raw}`));
    }
    function applyPartial(op, M, m, p, pre, out, pitfalls, rawAtom) {
      const hasMinor = m !== null;
      switch (op) {
        case "=":
        case "":
          if (hasMinor) {
            out.push(mk(">=", M, m, 0, null, `>=${M}.${m}.0`));
            out.push(mk("<", M, m + 1, 0, ["0"], `<${M}.${m + 1}.0-0`, true));
            pitfalls.push({ type: "eq-partial", message: `\u300C${rawAtom}\u300D\u4E0D\u662F\u7CBE\u786E\u7B49\u4E8E ${M}.${m}.0\uFF0C\u800C\u662F\u6574\u4E2A ${M}.${m}.x \u6BB5\uFF08>=${M}.${m}.0 \u4E14 <${M}.${m + 1}.0\uFF09` });
          } else {
            out.push(mk(">=", M, 0, 0, null, `>=${M}.0.0`));
            out.push(mk("<", M + 1, 0, 0, ["0"], `<${M + 1}.0.0-0`, true));
            pitfalls.push({ type: "eq-partial", message: `\u300C${rawAtom}\u300D\u4E0D\u662F\u7CBE\u786E\u7B49\u4E8E ${M}.0.0\uFF0C\u800C\u662F\u6574\u4E2A ${M}.x \u6BB5\uFF08>=${M}.0.0 \u4E14 <${M + 1}.0.0\uFF09` });
          }
          return;
        case ">":
          if (hasMinor) {
            out.push(mk(">=", M, m + 1, 0, null, `>=${M}.${m + 1}.0`));
            pitfalls.push({ type: "gt-partial", message: `\u300C> ${M}.${m}\u300D\u6309 npm \u8BED\u4E49\u8DF3\u8FC7\u6574\u4E2A ${M}.${m}.x \u6BB5\uFF0C\u7B49\u4EF7\u4E8E >=${M}.${m + 1}.0` });
          } else {
            out.push(mk(">=", M + 1, 0, 0, null, `>=${M + 1}.0.0`));
            pitfalls.push({ type: "gt-partial", message: `\u300C> ${M}\u300D\u8DF3\u8FC7\u6574\u4E2A ${M}.x.x \u6BB5\uFF0C\u7B49\u4EF7\u4E8E >=${M + 1}.0.0` });
          }
          return;
        case ">=":
          if (hasMinor) out.push(mk(">=", M, m, 0, null, `>=${M}.${m}.0`));
          else out.push(mk(">=", M, 0, 0, null, `>=${M}.0.0`));
          return;
        case "<":
          if (hasMinor) out.push(mk("<", M, m, 0, ["0"], `<${M}.${m}.0-0`, true));
          else out.push(mk("<", M, 0, 0, ["0"], `<${M}.0.0-0`, true));
          return;
        case "<=":
          if (hasMinor) out.push(mk("<", M, m + 1, 0, ["0"], `<${M}.${m + 1}.0-0`, true));
          else out.push(mk("<", M + 1, 0, 0, ["0"], `<${M + 1}.0.0-0`, true));
          return;
        case "~": {
          const upMinor = hasMinor ? m + 1 : 0;
          const upMajor = hasMinor ? M : M + 1;
          out.push(mk(">=", M, hasMinor ? m : 0, 0, null, `>=${M}.${hasMinor ? m : 0}.0`));
          out.push(mk("<", upMajor, upMinor, 0, ["0"], `<${upMajor}.${upMinor}.0-0`, true));
          return;
        }
        case "^": {
          let hi;
          if (M > 0) hi = { M: M + 1, m: 0, p: 0 };
          else if (!hasMinor) hi = { M: 1, m: 0, p: 0 };
          else if (m > 0) hi = { M: 0, m: m + 1, p: 0 };
          else hi = { M: 0, m: 1, p: 0 };
          out.push(mk(">=", M, hasMinor ? m : 0, 0, null, `>=${M}.${hasMinor ? m : 0}.0`));
          out.push(mk("<", hi.M, hi.m, hi.p, ["0"], `<${hi.M}.${hi.m}.${hi.p}-0`, true));
          if (M === 0) {
            if (hasMinor && m === 0) {
              pitfalls.push({ type: "zero-zero-caret", message: `\u300C^0.0.x\u300D\u7684\u63D2\u5165\u7B26\u53EA\u5141\u8BB8 0.0.z \u7684\u8865\u4E01\u7EA7\u53D8\u5316\uFF08\u4E0A\u9650 <0.1.0\uFF09\uFF0C\u4E0D\u662F <1.0.0` });
            } else if (hasMinor) {
              pitfalls.push({ type: "zero-major-caret", message: `\u300C^0.${m}.x\u300D\u7684\u63D2\u5165\u7B26\u9501\u5B9A\u6B21\u7248\u672C\uFF1A\u53EA\u5141\u8BB8\u8865\u4E01\u7EA7\u53D8\u5316\uFF08\u4E0A\u9650 <0.${m + 1}.0\uFF09\uFF0C\u4E0D\u662F <1.0.0\u2014\u20140.x \u9636\u6BB5\u5C0F\u7248\u672C\u53EF\u80FD\u5305\u542B\u7834\u574F\u6027\u53D8\u66F4` });
            } else {
              pitfalls.push({ type: "zero-major-caret", message: `\u300C^0.x\u300D\u7684\u63D2\u5165\u7B26\u4E0A\u9650\u662F <1.0.0\uFF080 \u9636\u6BB5\u5141\u8BB8\u5168\u90E8 0.y.z\uFF09\uFF0C\u8FD9\u662F\u63D2\u5165\u7B26\u5728 0 \u6BB5\u7684\u552F\u4E00\u5BBD\u5F62\u6001` });
            }
          }
          return;
        }
        default:
          throw new Error(`\u672A\u77E5\u64CD\u4F5C\u7B26\u300C${op}\u300D`);
      }
    }
    function parseSet(text, rangeRaw) {
      const trimmed = text.trim();
      if (trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "X") {
        return { raw: rangeRaw, comparators: [], any: true };
      }
      const comparators = [];
      const pitfalls = [];
      const hyphen = /(^|\s)([^\s]+)\s+-\s+([^\s]+)(\s|$)/.exec(trimmed);
      if (hyphen) {
        const loText = hyphen[2];
        const hiText = hyphen[3];
        const rest = (trimmed.slice(0, hyphen.index) + " " + trimmed.slice(hyphen.index + hyphen[0].length)).replace(/\s+/g, " ").trim();
        if (rest !== "") throw new Error(`\u8FDE\u5B57\u7B26\u533A\u95F4\u300C${loText} - ${hiText}\u300D\u5FC5\u987B\u662F\u8BE5\u4EA4\u96C6\u7EC4\u7684\u552F\u4E00\u5185\u5BB9\uFF08\u5176\u4F59\u6BD4\u8F83\u5668\u8BF7\u7528\u7A7A\u683C AND \u5206\u5F00\u6216\u5206\u7EC4\uFF09`);
        expandHyphen(loText, hiText, comparators, pitfalls);
        return { raw: rangeRaw, comparators, any: false, pitfalls };
      }
      const norm = trimmed.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1");
      const atoms = norm.split(/\s+/);
      for (const atom of atoms) {
        const am = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(atom);
        if (!am || am[2] === "") throw new Error(`\u65E0\u6CD5\u89E3\u6790\u6BD4\u8F83\u5668\u300C${atom}\u300D`);
        expandAtom(am[1] || "", am[2], comparators, pitfalls, atom);
      }
      return { raw: rangeRaw, comparators, any: false, pitfalls };
    }
    function expandHyphen(loText, hiText, out, pitfalls) {
      const lo = PARTIAL_RE.exec(loText);
      const hi = PARTIAL_RE.exec(hiText);
      if (!lo) throw new Error(`\u533A\u95F4\u4E0B\u754C\u300C${loText}\u300D\u65E0\u6CD5\u89E3\u6790`);
      if (!hi) throw new Error(`\u533A\u95F4\u4E0A\u754C\u300C${hiText}\u300D\u65E0\u6CD5\u89E3\u6790`);
      if (isX(lo[1])) throw new Error(`\u533A\u95F4\u4E0B\u754C\u300C${loText}\u300D\u4E0D\u80FD\u662F\u901A\u914D`);
      const loM = Number(lo[1]);
      if (isX(lo[2])) out.push(mk(">=", loM, 0, 0, null, `>=${loM}.0.0`));
      else if (isX(lo[3])) out.push(mk(">=", loM, Number(lo[2]), 0, null, `>=${loM}.${Number(lo[2])}.0`));
      else {
        const pre = lo[4] ? lo[4].split(".") : [];
        out.push(mk(">=", loM, Number(lo[2]), Number(lo[3]), pre, `>=${loM}.${Number(lo[2])}.${Number(lo[3])}${lo[4] ? "-" + lo[4] : ""}`));
      }
      if (isX(hi[1])) {
        pitfalls.push({ type: "wildcard-hyphen-hi", message: `\u533A\u95F4\u4E0A\u754C\u300C${hiText}\u300D\u662F\u901A\u914D\uFF0C\u89C6\u540C\u65E0\u4E0A\u754C` });
        return;
      }
      const hiM = Number(hi[1]);
      if (isX(hi[2])) out.push(mk("<", hiM + 1, 0, 0, ["0"], `<${hiM + 1}.0.0-0`, true));
      else if (isX(hi[3])) out.push(mk("<", hiM, Number(hi[2]) + 1, 0, ["0"], `<${hiM}.${Number(hi[2]) + 1}.0-0`, true));
      else out.push(mk("<=", hiM, Number(hi[2]), Number(hi[3]), hi[4] ? hi[4].split(".") : [], `<=${hiM}.${Number(hi[2])}.${Number(hi[3])}${hi[4] ? "-" + hi[4] : ""}`));
    }
    function parseRange2(text) {
      const raw = String(text == null ? "" : text).trim();
      const sets = [];
      const parts = raw.split("||");
      for (const part of parts) {
        try {
          sets.push(parseSet(part, part.trim()));
        } catch (e) {
          return { ok: false, error: e.message, raw };
        }
      }
      const pitfalls = [];
      for (const s of sets) for (const p of s.pitfalls || []) pitfalls.push(p);
      for (const s of sets) {
        if (s.any || s.comparators.length === 0) continue;
        if (isEmptySet(s.comparators)) {
          pitfalls.push({ type: "empty-set", message: `\u4EA4\u96C6\u7EC4\u300C${s.raw}\u300D\u4E3A\u7A7A\uFF08\u4E0B\u754C\u4E0D\u4F4E\u4E8E\u4E0A\u754C\uFF09\uFF0C\u8BE5\u7EC4\u6C38\u8FDC\u4E0D\u4F1A\u5339\u914D\u4EFB\u4F55\u7248\u672C` });
        }
      }
      const anyPre = sets.some((s) => (s.comparators || []).some((c) => !c.synthetic && c.version.prerelease && c.version.prerelease.length > 0));
      if (!anyPre) {
        pitfalls.push({ type: "prerelease-gate", message: "\u8BE5\u8303\u56F4\u6CA1\u6709\u663E\u5F0F\u5305\u542B\u9884\u53D1\u5E03\uFF08\u5982 1.2.3-beta.2\uFF09\u7684\u6BD4\u8F83\u5668\uFF1A\u4E00\u5207\u5E26\u9884\u53D1\u5E03\u540E\u7F00\u7684\u7248\u672C\uFF08beta/rc/next\uFF09\u90FD\u4E0D\u4F1A\u88AB\u5339\u914D\uFF0C\u5373\u4F7F\u7248\u672C\u53F7\u843D\u5728\u533A\u95F4\u5185\u2014\u2014\u8FD9\u662F\u300C\u4E3A\u4EC0\u4E48\u88C5\u4E0D\u4E0A beta\u300D\u7684\u6700\u9AD8\u9891\u6839\u56E0\uFF08npm \u9ED8\u8BA4\u884C\u4E3A\uFF09" });
      }
      return { ok: true, raw, sets, pitfalls };
    }
    function isEmptySet(comparators) {
      let lo = null;
      let hi = null;
      for (const c of comparators) {
        const vv = c.version;
        if (c.op === "=" || c.op === "") {
          if (lo && (compareParsed(vv, lo.v) < 0 || compareParsed(vv, lo.v) === 0 && lo.exclusive)) return true;
          if (hi && (compareParsed(vv, hi.v) > 0 || compareParsed(vv, hi.v) === 0 && hi.exclusive)) return true;
          lo = { v: vv, exclusive: false };
          hi = { v: vv, exclusive: false };
          continue;
        }
        if (c.op === ">=" || c.op === ">") {
          const d2 = lo ? compareParsed(vv, lo.v) : 1;
          if (d2 > 0 || d2 === 0 && c.op === ">" && !lo.exclusive) lo = { v: vv, exclusive: c.op === ">" };
        } else if (c.op === "<=" || c.op === "<") {
          const d2 = hi ? compareParsed(vv, hi.v) : -1;
          if (d2 < 0 || d2 === 0 && c.op === "<" && !hi.exclusive) hi = { v: vv, exclusive: c.op === "<" };
        }
      }
      if (!lo || !hi) return false;
      const d = compareParsed(lo.v, hi.v);
      if (d > 0) return true;
      if (d === 0 && (lo.exclusive || hi.exclusive)) return true;
      return false;
    }
    function satisfiesRange(v, range) {
      let rejectedBy = null;
      let gateBlocked = null;
      for (const s of range.sets) {
        let ok = true;
        for (const c of s.comparators) {
          if (!cmpOk(v, c)) {
            ok = false;
            rejectedBy = { set: s.raw, comparator: c.raw, line: null };
            break;
          }
        }
        if (!ok) continue;
        if (v.prerelease.length > 0) {
          const allows = s.comparators.some((c) => c.version.prerelease.length > 0 && c.version.major === v.major && c.version.minor === v.minor && c.version.patch === v.patch);
          if (!allows) {
            gateBlocked = { set: s.raw };
            continue;
          }
        }
        return { match: true, viaSet: s.raw, rejectedBy: null, gateBlocked: null };
      }
      return { match: false, viaSet: null, rejectedBy, gateBlocked };
    }
    function explainRange2(range) {
      const sets = range.sets.map((s) => ({
        raw: s.raw,
        any: !!s.any,
        comparators: (s.comparators || []).map((c) => ({
          raw: c.raw,
          op: c.op,
          version: c.version.raw,
          text: describeComparator(c)
        })),
        empty: !s.any && s.comparators.length > 0 && isEmptySet(s.comparators)
      }));
      return { sets, pitfalls: range.pitfalls };
    }
    function describeComparator(c) {
      const v = c.version.raw;
      const isCeil = c.version.prerelease.length === 1 && c.version.prerelease[0] === "0" && c.op === "<";
      switch (c.op) {
        case ">=":
          return `\u5927\u4E8E\u7B49\u4E8E ${v}`;
        case ">":
          return `\u5927\u4E8E ${v}`;
        case "<=":
          return `\u5C0F\u4E8E\u7B49\u4E8E ${v}`;
        case "<":
          return isCeil ? `\u5C0F\u4E8E ${v}\uFF08\u7CBE\u786E\u4E0A\u754C\uFF1A\u6392\u9664 ${v.major}.${v.minor}.${v.patch} \u53CA\u5176\u4E00\u5207\u9884\u53D1\u5E03\uFF09` : `\u5C0F\u4E8E ${v}`;
        case "=":
          return `\u7B49\u4E8E ${v}`;
        default:
          return v;
      }
    }
    function sortVersions2(list) {
      const items = [];
      const invalid = [];
      (Array.isArray(list) ? list : []).forEach((s, i) => {
        const r = parseVersion(s);
        if (r.ok) items.push({ raw: r.version.raw, input: String(s).trim(), parsed: r.version, index: i });
        else invalid.push({ raw: String(s), error: r.error });
      });
      const sorted = items.slice().sort((a, b) => {
        const d = compareParsed(a.parsed, b.parsed);
        return d !== 0 ? d : a.index - b.index;
      });
      return { sorted, invalid };
    }
    function buildCheckRows2(rangeInput, versionList) {
      const parsed = parseRange2(rangeInput);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const rows = [];
      for (const v of Array.isArray(versionList) ? versionList : []) {
        const vp = parseVersion(String(v).trim());
        if (!vp.ok) {
          rows.push({ input: String(v), valid: false, error: vp.error });
          continue;
        }
        const r = satisfiesRange(vp.version, parsed);
        let kind;
        let reason;
        if (r.match) {
          kind = "match";
          reason = `\u653E\u884C\u4EA4\u96C6\u7EC4\uFF1A${r.viaSet}`;
          if (vp.version.prerelease.length > 0) reason += "\uFF1B\u8303\u56F4\u542B\u540C\u53F7\u9884\u53D1\u5E03\u6BD4\u8F83\u5668\uFF0C\u672A\u88AB\u95E8\u63A7\u62E6\u622A";
        } else if (r.gateBlocked) {
          kind = "gate";
          reason = "\u7248\u672C\u53F7\u843D\u5728\u533A\u95F4\u5185\uFF0C\u4F46\u88AB\u9884\u53D1\u5E03\u95E8\u63A7\u62E6\u622A\uFF1A\u8303\u56F4\u672A\u663E\u5F0F\u5305\u542B\u540C M.m.p \u7684\u9884\u53D1\u5E03\u6BD4\u8F83\u5668\uFF08\u5982 >=1.2.3-beta\uFF09";
        } else if (r.rejectedBy) {
          kind = "reject";
          reason = `\u9996\u4E2A\u62D2\u7EDD\u6BD4\u8F83\u5668\uFF1A${r.rejectedBy.comparator}\uFF08\u4EA4\u96C6\u7EC4 ${r.rejectedBy.set}\uFF09`;
          if (vp.version.prerelease.length > 0 && (r.rejectedBy.comparator.startsWith(">=") || r.rejectedBy.comparator.startsWith(">"))) {
            reason += "\uFF1B\u9884\u53D1\u5E03\u7248\u672C\u4F4E\u4E8E\u540C\u53F7\u6B63\u5F0F\u7248\uFF081.2.3-beta.4 < 1.2.3\uFF09";
          }
        } else {
          kind = "reject";
          reason = "\u4E0D\u5339\u914D";
        }
        rows.push({ input: String(v), valid: true, version: vp.version, match: r.match, kind, reason });
      }
      return { ok: true, rows, pitfalls: parsed.pitfalls };
    }
    module.exports = {
      parseVersion,
      compareParsed,
      parseRange: parseRange2,
      satisfiesRange,
      explainRange: explainRange2,
      sortVersions: sortVersions2,
      buildCheckRows: buildCheckRows2,
      cmpOk
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_version_core());
import { useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.vl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.vl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vl-head b{font-size:13px}
.vl-head .sub{color:#5C6678;font-size:11px}
.vl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.vl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none}
.vl-input:focus{border-color:#4fd1a0}
.vl-area{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.7 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none;resize:vertical}
.vl-area:focus{border-color:#4fd1a0}
.vl-chips{display:flex;gap:6px;flex-wrap:wrap}
.vl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.vl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.vl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.vl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.vl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.vl-set{padding:6px 0}
.vl-set .setraw{padding:2px 12px;color:#4fd1a0;font:12px ui-monospace,Consolas,monospace}
.vl-cmp{display:flex;gap:10px;padding:2px 12px;font:12px/1.8 ui-monospace,Consolas,monospace}
.vl-cmp .raw{color:#c9cede;min-width:150px;flex-shrink:0}
.vl-cmp .desc{color:#8B94A9}
.vl-warnitem{padding:4px 12px;font-size:11.5px;color:#f3b377}
.vl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.vl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.vl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.vl-tbl td.why{font-family:-apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#8B94A9}
.vl-ok{color:#4fd1a0}
.vl-bad{color:#f1a0a0}
.vl-gate{color:#f3b377}
.vl-note{color:#5C6678;font-size:11px;line-height:1.6;padding:2px 12px 8px}
.vl-sortline{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px}
.vl-sortchip{border:1px solid #2b3348;border-radius:6px;color:#c9cede;font:11px ui-monospace,Consolas,monospace;padding:2px 8px}
.vl-sortchip.pre{color:#f3b377}
.vl-sortchip.bad{color:#f1a0a0;border-style:dashed}
`;
var RANGE_PRESETS = ["^1.2.3", "~0.2.3", "^0.0.3", ">=1.2.0 <1.3.0", "1.2.3 - 2.3", "^1.2.3-beta.2", ">=2.0.0 <2.0.0", "^1.2.3 || ^2.0.0", ">1.2"];
var VERSION_PRESETS = ["1.2.2\n1.2.3\n1.9.9\n2.0.0\n2.0.0-alpha\n1.2.3-beta.4\n1.2.4-beta.1"];
function judgeMark(row) {
  if (row.kind === "match") return /* @__PURE__ */ jsx("span", { className: "vl-ok", children: "\u2705 \u5339\u914D" });
  if (row.kind === "gate") return /* @__PURE__ */ jsx("span", { className: "vl-gate", children: "\u{1F6AA} \u95E8\u63A7\u62E6\u622A" });
  return /* @__PURE__ */ jsx("span", { className: "vl-bad", children: "\u274C \u4E0D\u5339\u914D" });
}
function VersionLensPanel(_props) {
  const [rangeText, setRangeText] = useState(_props && _props.initialRange || "^1.2.3");
  const [versionsText, setVersionsText] = useState(VERSION_PRESETS[0]);
  const view = useMemo(() => {
    const parsed = core.parseRange(rangeText);
    if (!parsed.ok) return { parseError: parsed.error };
    const ex = core.explainRange(parsed);
    const versionList = versionsText.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
    const check = versionList.length > 0 ? core.buildCheckRows(rangeText, versionList) : null;
    const sort = versionList.length > 0 ? core.sortVersions(versionList) : null;
    return { parsed, ex, check, sort };
  }, [rangeText, versionsText]);
  const hasCheck = "check" in view && view.check && view.check.ok;
  const checkRows = hasCheck ? view.check.rows : [];
  const sortData = "sort" in view ? view.sort : null;
  return /* @__PURE__ */ jsxs("div", { className: "vl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "vl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "semver \u7248\u672C\u8303\u56F4\u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u89E3\u91CA npm \u8303\u56F4 \xB7 \u9010\u7248\u672C\u5224\u5B9A \xB7 \u5751\u68C0\u6D4B \xB7 \u5224\u5B9A\u5F15\u64CE\u4E0E node-semver \u5DEE\u5206\u5BF9\u62CD\u5168\u7B49" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "vl-body", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "vl-chips", style: { marginBottom: 6 }, children: RANGE_PRESETS.map((p) => /* @__PURE__ */ jsx("span", { className: "vl-chip", onClick: () => setRangeText(p), children: p }, p)) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "vl-input",
            value: rangeText,
            placeholder: "npm semver \u8303\u56F4\uFF0C\u5982 ^1.2.3 / ~0.2.x / 1.2.3 - 2 || >=3 <4",
            onChange: (e) => setRangeText(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "vl-area",
          rows: 5,
          value: versionsText,
          placeholder: "\u5019\u9009\u7248\u672C\u6E05\u5355\uFF0C\u6BCF\u884C\u4E00\u4E2A\uFF0C\u5982\uFF1A\n1.2.3\n1.2.3-beta.4\n2.0.0",
          onChange: (e) => setVersionsText(e.target.value)
        }
      ) }),
      "parseError" in view && /* @__PURE__ */ jsxs("div", { className: "vl-err", children: [
        "\u65E0\u6CD5\u89E3\u6790\u8303\u56F4\uFF1A",
        view.parseError
      ] }),
      "ex" in view && view.ex && /* @__PURE__ */ jsxs("div", { className: "vl-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u8303\u56F4\u89E3\u91CA\uFF08\u6BD4\u8F83\u5668\u5C55\u5F00\uFF09" }),
        /* @__PURE__ */ jsx("div", { className: "vl-set", children: view.ex.sets.map((s, i) => /* @__PURE__ */ jsxs("div", { style: { paddingBottom: i + 1 < view.ex.sets.length ? 8 : 0 }, children: [
          /* @__PURE__ */ jsx("div", { className: "setraw", children: view.ex.sets.length > 1 ? `\u4EA4\u96C6\u7EC4 ${i + 1}\uFF1A${s.raw}` : s.raw }),
          s.any && /* @__PURE__ */ jsx("div", { className: "vl-cmp", children: /* @__PURE__ */ jsx("span", { className: "desc", children: "\u4EFB\u610F\u7248\u672C\uFF08\u65E0\u4E0A\u4E0B\u754C\uFF09" }) }),
          s.comparators.map((c, j) => /* @__PURE__ */ jsxs("div", { className: "vl-cmp", children: [
            /* @__PURE__ */ jsx("span", { className: "raw", children: c.raw }),
            /* @__PURE__ */ jsx("span", { className: "desc", children: c.text })
          ] }, j)),
          s.empty && /* @__PURE__ */ jsx("div", { className: "vl-warnitem", children: "\u274C \u8BE5\u7EC4\u533A\u95F4\u4E3A\u7A7A\uFF08\u4E0B\u754C\u4E0D\u4F4E\u4E8E\u4E0A\u754C\uFF09\uFF0C\u6C38\u8FDC\u4E0D\u4F1A\u5339\u914D" })
        ] }, i)) })
      ] }),
      "ex" in view && view.ex && view.ex.pitfalls.length > 0 && /* @__PURE__ */ jsxs("div", { className: "vl-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u5751\u68C0\u6D4B" }),
        view.ex.pitfalls.map((p, i) => /* @__PURE__ */ jsxs("div", { className: "vl-warnitem", children: [
          "\u26A0\uFE0F ",
          p.message
        ] }, i))
      ] }),
      hasCheck && /* @__PURE__ */ jsxs("div", { className: "vl-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u9010\u7248\u672C\u5224\u5B9A" }),
        /* @__PURE__ */ jsxs("table", { className: "vl-tbl", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { children: "\u7248\u672C" }),
            /* @__PURE__ */ jsx("th", { children: "\u5224\u5B9A" }),
            /* @__PURE__ */ jsx("th", { children: "\u8BF4\u660E" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: checkRows.map((row, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { style: { color: row.valid ? "#c9cede" : "#f1a0a0" }, children: row.valid ? row.version.raw : row.input }),
            /* @__PURE__ */ jsx("td", { children: row.valid ? judgeMark(row) : /* @__PURE__ */ jsx("span", { className: "vl-bad", children: "\u2753 \u65E0\u6548" }) }),
            /* @__PURE__ */ jsx("td", { className: "why", children: row.valid ? row.reason : row.error })
          ] }, i)) })
        ] })
      ] }),
      sortData && sortData.sorted.length > 0 && /* @__PURE__ */ jsxs("div", { className: "vl-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u6392\u5E8F\u89C6\u56FE\uFF08\u5347\u5E8F\uFF1B\u9884\u53D1\u5E03\u5148\u4E8E\u540C\u53F7\u6B63\u5F0F\u7248\uFF09" }),
        /* @__PURE__ */ jsxs("div", { className: "vl-sortline", children: [
          sortData.sorted.map((it) => /* @__PURE__ */ jsx("span", { className: `vl-sortchip${it.parsed.prerelease.length > 0 ? " pre" : ""}`, children: it.raw }, it.index)),
          sortData.invalid.map((iv, i) => /* @__PURE__ */ jsx("span", { className: "vl-sortchip bad", title: iv.error, children: iv.raw }, `bad${i}`))
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "vl-note", children: "\u8BED\u4E49\u4EE5 npm\uFF08node-semver 7\uFF09\u5B9E\u9645\u884C\u4E3A\u4E3A\u51C6\uFF1A\u9884\u53D1\u5E03\u4F4E\u4E8E\u540C\u53F7\u6B63\u5F0F\u7248\uFF1B\u5E26\u9884\u53D1\u5E03\u7684\u7248\u672C\u53EA\u6709\u8303\u56F4\u663E\u5F0F\u5305\u542B\u540C\u7248\u672C\u53F7\u9884\u53D1\u5E03\u6BD4\u8F83\u5668\u65F6\u624D\u88AB\u5339\u914D\uFF08\u95E8\u63A7\uFF09\uFF1B\u4E0A\u754C\u4EE5\u300C-0\u300D\u7CBE\u786E\u6392\u4ED6\u3002\u8FB9\u754C\uFF1A\u4E0D\u505A registry \u7F51\u7EDC\u67E5\u8BE2\u3001\u4E0D\u505A loose \u5BBD\u677E\u89E3\u6790\uFF08\u524D\u5BFC\u96F6\u7B49\u4E25\u683C\u62A5\u9519\uFF09\u3001\u4E0D\u652F\u6301 includePrerelease \u53D8\u4F53\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function VersionLensEntry(props) {
  return /* @__PURE__ */ jsx2(VersionLensPanel, { ...props });
}
export {
  VersionLensEntry as default
};
