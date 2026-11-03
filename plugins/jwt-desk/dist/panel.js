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

// shared/jwt-core.js
var require_jwt_core = __commonJS({
  "shared/jwt-core.js"(exports, module) {
    "use strict";
    var MAX_TOKEN_LEN = 262144;
    var SKEW_MS = 60 * 1e3;
    var SOON_MS = 5 * 60 * 1e3;
    var DEFAULT_MAX_LIFETIME_MS = 365 * 24 * 3600 * 1e3;
    var B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var B64S = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function makeDecoder(alphabet, name) {
      const map = new Int16Array(128).fill(-1);
      for (let i = 0; i < alphabet.length; i++) map[alphabet.charCodeAt(i)] = i;
      return function decode(input) {
        if (typeof input !== "string") throw new Error(`${name} \u8F93\u5165\u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
        let s = input.replace(/[\r\n\t ]+/g, "").replace(/=+$/, "");
        if (s === "") throw new Error(`${name} \u8F93\u5165\u4E3A\u7A7A`);
        if (s.length % 4 === 1) throw new Error(`${name} \u957F\u5EA6\u975E\u6CD5\uFF08\u4F59 1 \u65E0\u7F16\u7801\u542B\u4E49\uFF09`);
        const out = new Uint8Array(Math.floor(s.length * 3 / 4));
        let o = 0, buf = 0, bits = 0;
        for (let i = 0; i < s.length; i++) {
          const v = map[s.charCodeAt(i) & 127];
          if (v < 0 || (s.charCodeAt(i) & 65408) !== 0) throw new Error(`${name} \u542B\u975E\u6CD5\u5B57\u7B26\u300C${s[i]}\u300D`);
          buf = buf << 6 | v;
          bits += 6;
          if (bits >= 8) {
            bits -= 8;
            out[o++] = buf >> bits & 255;
          }
        }
        return out.subarray(0, o);
      };
    }
    var b64uDecode = makeDecoder(B64U, "base64url");
    var b64sDecode = makeDecoder(B64S, "base64");
    function b64uEncode(bytes) {
      let out = "";
      let buf = 0, bits = 0;
      for (let i = 0; i < bytes.length; i++) {
        buf = buf << 8 | bytes[i];
        bits += 8;
        while (bits >= 6) {
          bits -= 6;
          out += B64U[buf >> bits & 63];
        }
      }
      if (bits > 0) out += B64U[buf << 6 - bits & 63];
      return out;
    }
    var TE = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
    var TD = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
    function utf8Encode(str) {
      if (!TE) throw new Error("\u8FD0\u884C\u65F6\u7F3A TextEncoder");
      return TE.encode(str);
    }
    function utf8Decode(bytes) {
      if (!TD) throw new Error("\u8FD0\u884C\u65F6\u7F3A TextDecoder");
      return TD.decode(bytes);
    }
    function bytesToHex(bytes, limit) {
      const n = limit ? Math.min(bytes.length, limit) : bytes.length;
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
      return parts.join(bytes.length > n ? "\u2026" : "");
    }
    var ALGS = {
      HS256: { family: "hmac", hash: "SHA-256", hashLen: 32 },
      HS384: { family: "hmac", hash: "SHA-384", hashLen: 48 },
      HS512: { family: "hmac", hash: "SHA-512", hashLen: 64 },
      RS256: { family: "rsa", hash: "SHA-256", hashLen: 32 },
      RS384: { family: "rsa", hash: "SHA-384", hashLen: 48 },
      RS512: { family: "rsa", hash: "SHA-512", hashLen: 64 },
      PS256: { family: "pss", hash: "SHA-256", hashLen: 32 },
      PS384: { family: "pss", hash: "SHA-384", hashLen: 48 },
      PS512: { family: "pss", hash: "SHA-512", hashLen: 64 },
      ES256: { family: "ec", curve: "P-256", hash: "SHA-256", hashLen: 32, coord: 32 },
      ES384: { family: "ec", curve: "P-384", hash: "SHA-384", hashLen: 48, coord: 48 },
      ES512: { family: "ec", curve: "P-521", hash: "SHA-512", hashLen: 64, coord: 66 }
    };
    function splitToken(rawToken) {
      if (typeof rawToken !== "string" || rawToken.trim() === "") throw new Error("token \u4E3A\u7A7A");
      const token = rawToken.trim();
      if (token.length > MAX_TOKEN_LEN) throw new Error(`token \u8FC7\u5927\uFF08>${MAX_TOKEN_LEN} \u5B57\u8282\uFF09\uFF0C\u7591\u4F3C\u975E JWT`);
      const segs = token.split(".");
      if (segs.length === 5) {
        throw new Error("\u4E94\u6BB5\u7ED3\u6784\u7591\u4F3C JWE\uFF08\u52A0\u5BC6\u578B token\uFF0Cheader.ek.iv.ciphertext.tag\uFF09\u2014\u2014\u672C\u53F0\u53EA\u89E3\u6790 JWS \u660E\u6587\u4E09\u6BB5 token");
      }
      if (segs.length !== 3) {
        throw new Error(`JWT compact \u5E94\u4E3A\u4E09\u6BB5 header.payload.signature\uFF08\u4E24\u4E2A\u70B9\uFF09\uFF0C\u5B9E\u9645 ${segs.length} \u6BB5`);
      }
      const [headerB64, payloadB64, signatureB64] = segs;
      if (headerB64 === "") throw new Error("header \u6BB5\u4E3A\u7A7A");
      if (payloadB64 === "") throw new Error("payload \u6BB5\u4E3A\u7A7A");
      return {
        headerB64,
        payloadB64,
        signatureB64,
        signingInput: headerB64 + "." + payloadB64
      };
    }
    function parseToken(rawToken) {
      let parts;
      try {
        parts = splitToken(rawToken);
      } catch (e) {
        return { ok: false, error: e.message };
      }
      let header, payload, sigBytes;
      try {
        header = JSON.parse(utf8Decode(b64uDecode(parts.headerB64)));
      } catch (e) {
        return { ok: false, error: `header \u6BB5\u4E0D\u662F\u5408\u6CD5 base64url+JSON\uFF1A${e.message}` };
      }
      if (header === null || typeof header !== "object" || Array.isArray(header)) {
        return { ok: false, error: "header \u6BB5\u89E3\u6790\u7ED3\u679C\u4E0D\u662F JSON \u5BF9\u8C61" };
      }
      try {
        payload = JSON.parse(utf8Decode(b64uDecode(parts.payloadB64)));
      } catch (e) {
        return { ok: false, error: `payload \u6BB5\u4E0D\u662F\u5408\u6CD5 base64url+JSON\uFF1A${e.message}` };
      }
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, error: "payload \u6BB5\u89E3\u6790\u7ED3\u679C\u4E0D\u662F JSON \u5BF9\u8C61" };
      }
      try {
        sigBytes = parts.signatureB64 === "" ? new Uint8Array(0) : b64uDecode(parts.signatureB64);
      } catch (e) {
        return { ok: false, error: `signature \u6BB5\u4E0D\u662F\u5408\u6CD5 base64url\uFF1A${e.message}` };
      }
      return {
        ok: true,
        header,
        payload,
        headerB64: parts.headerB64,
        payloadB64: parts.payloadB64,
        signatureB64: parts.signatureB64,
        signature: sigBytes,
        signingInput: parts.signingInput
      };
    }
    function asn1LenBytes(n) {
      if (n < 128) return [n];
      if (n < 256) return [129, n];
      return [130, n >> 8 & 255, n & 255];
    }
    function intToAsn1(raw) {
      let i = 0;
      while (i < raw.length - 1 && raw[i] === 0) i++;
      const v = raw.slice(i);
      const needsPad = (v[0] & 128) !== 0;
      const body = new Uint8Array(v.length + (needsPad ? 1 : 0));
      if (needsPad) body[0] = 0;
      body.set(v, needsPad ? 1 : 0);
      const head = asn1LenBytes(body.length);
      const out = new Uint8Array(1 + head.length + body.length);
      out[0] = 2;
      out.set(head, 1);
      out.set(body, 1 + head.length);
      return out;
    }
    function intFromAsn1(der, pos) {
      if (der[pos] !== 2) throw new Error("DER \u7ED3\u6784\u975E\u6CD5\uFF1A\u671F\u671B INTEGER(0x02)");
      const len = der[pos + 1];
      let vlen = len, hlen = 2;
      if (len & 128) {
        const n = len & 127;
        if (n === 0 || n > 2) throw new Error("DER \u7ED3\u6784\u975E\u6CD5\uFF1AINTEGER \u957F\u5EA6\u5934\u5F02\u5E38");
        vlen = 0;
        for (let i = 0; i < n; i++) vlen = vlen * 256 + der[pos + 2 + i];
        hlen = 2 + n;
      }
      const v = der.slice(pos + hlen, pos + hlen + vlen);
      return { value: v, next: pos + hlen + vlen };
    }
    function joseRawToDer(raw) {
      if (!raw || raw.length === 0 || raw.length % 2 !== 0) {
        throw new Error("ECDSA \u539F\u59CB\u7B7E\u540D\u957F\u5EA6\u975E\u6CD5\uFF08\u5E94\u4E3A\u5076\u6570\u957F r||s\uFF09");
      }
      const mid = raw.length / 2;
      const r = intToAsn1(raw.slice(0, mid));
      const s = intToAsn1(raw.slice(mid));
      const content = new Uint8Array(r.length + s.length);
      content.set(r, 0);
      content.set(s, r.length);
      const head = new Uint8Array(1 + asn1LenBytes(content.length).length);
      head[0] = 48;
      head.set(asn1LenBytes(content.length), 1);
      const out = new Uint8Array(head.length + content.length);
      out.set(head, 0);
      out.set(content, head.length);
      return out;
    }
    function derToJoseRaw(der, coordLen) {
      if (!der || der.length < 6 || der[0] !== 48) throw new Error("DER \u7ED3\u6784\u975E\u6CD5\uFF1A\u671F\u671B SEQUENCE(0x30)");
      let len = der[1], headLen = 2;
      if (len & 128) {
        const n = len & 127;
        if (n === 0 || n > 2) throw new Error("DER \u7ED3\u6784\u975E\u6CD5\uFF1ASEQUENCE \u957F\u5EA6\u5934\u5F02\u5E38");
        len = 0;
        for (let i = 0; i < n; i++) len = len * 256 + der[2 + i];
        headLen = 2 + n;
      }
      if (der.length < headLen + len) throw new Error("DER \u7ED3\u6784\u975E\u6CD5\uFF1A\u957F\u5EA6\u58F0\u660E\u8D85\u51FA\u5B9E\u9645");
      const r = intFromAsn1(der, headLen);
      const s = intFromAsn1(der, r.next);
      const pad = (v) => {
        let start = 0;
        while (start < v.length - 1 && v[start] === 0) start++;
        const body = v.slice(start);
        if (body.length > coordLen) throw new Error("DER INTEGER \u8D85\u51FA\u5750\u6807\u957F\u5EA6");
        const out2 = new Uint8Array(coordLen);
        out2.set(body, coordLen - body.length);
        return out2;
      };
      const out = new Uint8Array(coordLen * 2);
      out.set(pad(r.value), 0);
      out.set(pad(s.value), coordLen);
      return out;
    }
    async function verifyToken(rawToken, material, adapter) {
      const p = parseToken(rawToken);
      if (!p.ok) return p;
      const m = material || {};
      const alg = p.header.alg;
      if (typeof alg !== "string" || alg === "" || alg === "none") {
        return {
          ok: true,
          verified: false,
          alg: alg || null,
          parsed: p,
          reason: alg === "none" ? "header.alg = none\uFF08\u672A\u7B7E\u540D token\uFF09\u2014\u2014\u4F2A\u9020\u96F6\u6210\u672C\uFF0C\u4EFB\u4F55\u5E93\u90FD\u5E94\u62D2\u7EDD\uFF0C\u672C\u53F0\u540C\u6837\u62D2\u7EDD" : "header \u7F3A\u5C11 alg \u5B57\u6BB5\u2014\u2014\u65E0\u7B97\u6CD5\u5373\u65E0\u7B7E\u540D\u53EF\u9A8C"
        };
      }
      const spec = ALGS[alg];
      if (!spec) {
        return {
          ok: true,
          verified: false,
          alg,
          parsed: p,
          reason: `\u4E0D\u652F\u6301\u7684\u7B97\u6CD5\u300C${alg}\u300D\u2014\u2014\u652F\u6301\uFF1AHS256/384/512\u3001RS256/384/512\u3001PS256/384/512\u3001ES256/384/512`
        };
      }
      if (p.signature.length === 0) {
        return { ok: true, verified: false, alg, parsed: p, reason: "signature \u6BB5\u4E3A\u7A7A\u2014\u2014\u7B7E\u540D\u7F3A\u5931" };
      }
      if (spec.family === "ec" && p.signature.length !== spec.coord * 2) {
        return {
          ok: true,
          verified: false,
          alg,
          parsed: p,
          reason: `${alg} \u7B7E\u540D\u5E94\u4E3A ${spec.coord * 2} \u5B57\u8282 r||s\uFF0C\u5B9E\u9645 ${p.signature.length} \u5B57\u8282`
        };
      }
      const data = utf8Encode(p.signingInput);
      let verified = false;
      try {
        if (spec.family === "hmac") {
          const hasSecret = typeof m.secret === "string" && m.secret !== "" || m.secret instanceof Uint8Array && m.secret.length > 0;
          if (!hasSecret) {
            return { ok: true, verified: false, alg, parsed: p, reason: `${alg} \u9700\u8981 secret\uFF08\u5B57\u7B26\u4E32\u5BC6\u94A5\uFF09\u2014\u2014\u672A\u63D0\u4F9B` };
          }
          verified = await adapter.hmacVerify(alg, m.secret, data, p.signature);
        } else {
          const keyInput = m.publicKeyPem ? { pem: m.publicKeyPem } : m.publicKeyJwk ? { jwk: m.publicKeyJwk } : null;
          if (!keyInput) {
            return { ok: true, verified: false, alg, parsed: p, reason: `${alg} \u9700\u8981 PEM \u6216 JWK \u516C\u94A5\u2014\u2014\u672A\u63D0\u4F9B` };
          }
          verified = await adapter.asymVerify(alg, keyInput, data, p.signature);
        }
      } catch (e) {
        return { ok: true, verified: false, alg, parsed: p, reason: `\u9A8C\u7B7E\u6267\u884C\u5931\u8D25\uFF1A${e.message}` };
      }
      return { ok: true, verified, alg, parsed: p };
    }
    async function signToken(alg, material, payloadObj, opts, adapter) {
      const spec = ALGS[alg];
      if (!spec) {
        return { ok: false, error: `\u4E0D\u652F\u6301\u7684\u7B7E\u53D1\u7B97\u6CD5\u300C${alg}\u300D\u2014\u2014\u652F\u6301\uFF1A${Object.keys(ALGS).join("/")}` };
      }
      const o = opts || {};
      const m = material || {};
      if (payloadObj === null || typeof payloadObj !== "object" || Array.isArray(payloadObj)) {
        return { ok: false, error: "payload \u5FC5\u987B\u662F JSON \u5BF9\u8C61" };
      }
      const header = Object.assign({ alg, typ: "JWT" }, o.headerExtra || {});
      const nowMs = typeof o.nowMs === "number" ? o.nowMs : Date.now();
      const payload = Object.assign({}, payloadObj);
      if (typeof o.expiresInSeconds === "number") {
        payload.exp = Math.floor(nowMs / 1e3) + o.expiresInSeconds;
      }
      if (payload.iat === void 0) payload.iat = Math.floor(nowMs / 1e3);
      const headerB64 = b64uEncode(utf8Encode(JSON.stringify(header)));
      const payloadB64 = b64uEncode(utf8Encode(JSON.stringify(payload)));
      const signingInput = headerB64 + "." + payloadB64;
      const data = utf8Encode(signingInput);
      let sig;
      try {
        if (spec.family === "hmac") {
          const hasSecret = typeof m.secret === "string" && m.secret !== "" || m.secret instanceof Uint8Array && m.secret.length > 0;
          if (!hasSecret) return { ok: false, error: `${alg} \u7B7E\u53D1\u9700\u8981 secret\uFF08\u5B57\u7B26\u4E32\uFF09` };
          sig = await adapter.hmacSign(alg, m.secret, data);
        } else {
          const keyInput = m.privateKeyPem ? { pem: m.privateKeyPem } : m.privateKeyJwk ? { jwk: m.privateKeyJwk } : null;
          if (!keyInput) return { ok: false, error: `${alg} \u7B7E\u53D1\u9700\u8981 PEM \u6216 JWK \u79C1\u94A5` };
          sig = await adapter.asymSign(alg, keyInput, data);
        }
      } catch (e) {
        return { ok: false, error: `\u7B7E\u53D1\u6267\u884C\u5931\u8D25\uFF1A${e.message}` };
      }
      return { ok: true, token: signingInput + "." + b64uEncode(sig), header, payload, signatureB64: b64uEncode(sig) };
    }
    function pemBodyToDer(pem) {
      if (typeof pem !== "string") throw new Error("PEM \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
      const m = pem.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/);
      const body = (m ? m[1] : pem).replace(/[\r\n\t ]+/g, "");
      return b64sDecode(body);
    }
    var LEVEL_LABELS = { high: "\u9AD8\u5371", caution: "\u9700\u6CE8\u610F", info: "\u63D0\u793A" };
    var LEVEL_ORDER = { high: 0, caution: 1, info: 2 };
    var CLAIM_ZH = {
      iss: "\u7B7E\u53D1\u8005",
      sub: "\u4E3B\u9898\uFF08\u901A\u5E38\u662F\u7528\u6237\u6807\u8BC6\uFF09",
      aud: "\u53D7\u4F17",
      exp: "\u8FC7\u671F\u65F6\u95F4\uFF08NumericDate \u79D2\uFF09",
      nbf: "\u751F\u6548\u65F6\u95F4",
      iat: "\u7B7E\u53D1\u65F6\u95F4",
      jti: "\u4EE4\u724C\u552F\u4E00 ID",
      scope: "\u6743\u9650\u8303\u56F4",
      roles: "\u89D2\u8272",
      email: "\u90AE\u7BB1",
      name: "\u540D\u79F0",
      preferred_username: "\u7528\u6237\u540D"
    };
    var SENSITIVE_KEY_RE = /(passw(or)?d|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|credential|authorization|session)/i;
    function fmtEpoch(sec) {
      const ms = sec * 1e3;
      if (!Number.isFinite(ms) || Math.abs(ms) > 864e13) return String(sec);
      return new Date(ms).toISOString();
    }
    function humanizeMs(ms) {
      const abs = Math.abs(ms);
      const d = Math.floor(abs / 864e5);
      const h = Math.floor(abs % 864e5 / 36e5);
      const m = Math.floor(abs % 36e5 / 6e4);
      const s = Math.floor(abs % 6e4 / 1e3);
      let t = "";
      if (d) t += `${d} \u5929 `;
      if (h || d) t += `${h} \u5C0F\u65F6 `;
      if (m || h || d) t += `${m} \u5206\u949F `;
      t += `${s} \u79D2`;
      return t.trim();
    }
    function analyzeClaims(header, payload, nowMs, opts) {
      const o = opts || {};
      const maxLifetimeMs = typeof o.maxLifetimeMs === "number" ? o.maxLifetimeMs : DEFAULT_MAX_LIFETIME_MS;
      const F = [];
      const add = (id, level, title, detail) => F.push({ id, level, title, detail });
      if (header && (header.alg === "none" || header.alg === void 0)) {
        add(
          "alg_none",
          "high",
          "\u7B97\u6CD5\u4E3A none\uFF08\u672A\u7B7E\u540D\uFF09",
          header.alg === "none" ? "alg=none \u8868\u793A\u65E0\u7B7E\u540D\uFF0C\u4F2A\u9020\u96F6\u6210\u672C\uFF1BRFC 7518 \u8981\u6C42\u5B9E\u73B0\u663E\u5F0F\u62D2\u7EDD" : "header \u7F3A\u5C11 alg \u5B57\u6BB5"
        );
      }
      if (header && typeof header.jku === "string" && /^https?:\/\//i.test(header.jku)) {
        add(
          "jku_external",
          "caution",
          "header.jku \u6307\u5411\u5916\u90E8 URL",
          `jku=${header.jku}\u2014\u2014\u9A8C\u7B7E\u65B9\u82E5\u6309\u6B64\u62C9\u53D6\u5BC6\u94A5\u4F1A\u5F15\u5165 SSRF \u4E0E\u5BC6\u94A5\u66FF\u6362\u98CE\u9669\uFF0C\u5E94\u56FA\u5B9A\u4FE1\u4EFB\u7684\u5BC6\u94A5\u6E90`
        );
      }
      if (header && typeof header.x5u === "string" && /^https?:\/\//i.test(header.x5u)) {
        add(
          "x5u_external",
          "caution",
          "header.x5u \u6307\u5411\u5916\u90E8 URL",
          `x5u=${header.x5u}\u2014\u2014\u540C jku\uFF0C\u5916\u90E8\u8BC1\u4E66\u94FE URL \u662F\u9A8C\u7B7E\u65B9 SSRF / \u66FF\u6362\u653B\u51FB\u9762`
        );
      }
      if (header && Array.isArray(header.crit) && header.crit.length > 0) {
        add(
          "crit_header",
          "caution",
          "header.crit \u58F0\u660E\u4E86\u5173\u952E\u6269\u5C55",
          `crit=${JSON.stringify(header.crit)}\u2014\u2014\u9A8C\u7B7E\u65B9\u5FC5\u987B\u7406\u89E3\u8FD9\u4E9B\u6269\u5C55\u5426\u5219\u5FC5\u987B\u62D2\u7EDD\uFF0C\u786E\u8BA4\u5BF9\u7AEF\u5B9E\u73B0\u786E\u5B9E\u652F\u6301`
        );
      }
      if (header && header.typ !== void 0 && header.typ !== "JWT") {
        add(
          "typ_unusual",
          "info",
          `header.typ = ${JSON.stringify(header.typ)}`,
          '\u4E0D\u662F\u5E38\u89C4\u7684 "JWT"\uFF0C\u786E\u8BA4\u662F\u4E1A\u52A1\u7EA6\u5B9A\u800C\u975E\u7B14\u8BEF'
        );
      }
      if (header && typeof header.kid === "string") {
        add(
          "kid_present",
          "info",
          `header.kid = ${JSON.stringify(header.kid)}`,
          "\u9A8C\u7B7E\u65B9\u6309 kid \u9009\u5BC6\u94A5\uFF1Bkid \u901A\u5E38\u4E0D\u654F\u611F\uFF0C\u4F46\u6CE8\u610F\u522B\u628A\u300C\u9009\u4E0D\u5230\u5C31\u8DF3\u8FC7\u9A8C\u7B7E\u300D\u5F53\u6210\u515C\u5E95"
        );
      }
      const num = (v) => typeof v === "number" && Number.isFinite(v);
      const exp = payload ? payload.exp : void 0;
      const iat = payload ? payload.iat : void 0;
      const nbf = payload ? payload.nbf : void 0;
      if (exp === void 0) {
        add(
          "exp_missing",
          "caution",
          "payload \u7F3A\u5C11 exp\uFF08\u8FC7\u671F\u65F6\u95F4\uFF09",
          "\u65E0\u8FC7\u671F\u65F6\u95F4\u7684 token \u4E00\u65E6\u6CC4\u6F0F\u957F\u671F\u6709\u6548\uFF1B\u786E\u5C5E\u6C38\u4E45\u51ED\u8BC1\u9700\u6709\u8F6E\u6362\u673A\u5236\u515C\u5E95"
        );
      } else if (!num(exp)) {
        add(
          "claim_type",
          "high",
          "exp \u4E0D\u662F\u6570\u5B57\uFF08NumericDate \u8FDD\u7EA6\uFF09",
          `exp=${JSON.stringify(exp)}\u2014\u2014RFC 7519 \u8981\u6C42 NumericDate \u4E3A\u79D2\u6570\uFF0C\u5B57\u7B26\u4E32\u65E5\u671F\u662F\u5E38\u89C1\u4E8B\u6545\u6E90`
        );
      } else {
        if (nowMs > exp * 1e3) {
          add(
            "exp_expired",
            "high",
            "token \u5DF2\u8FC7\u671F",
            `exp=${fmtEpoch(exp)}\uFF0C\u8DDD\u4ECA ${humanizeMs(nowMs - exp * 1e3)}\uFF1B\u8FC7\u671F\u5373\u5931\u6548\uFF0C\u52FF\u653E\u5BBD\u9A8C\u7B7E\u653E\u884C`
          );
        } else if (exp * 1e3 - nowMs < SOON_MS) {
          add(
            "exp_soon",
            "info",
            "token \u5373\u5C06\u8FC7\u671F",
            `exp=${fmtEpoch(exp)}\uFF0C\u5269\u4F59 ${humanizeMs(exp * 1e3 - nowMs)}\uFF08< 5 \u5206\u949F\uFF09`
          );
        }
        if (num(iat) && (exp - iat) * 1e3 > maxLifetimeMs) {
          add(
            "lifetime_long",
            "caution",
            "token \u6709\u6548\u671F\u8D85\u957F",
            `iat\u2192exp \u8DE8\u5EA6 ${humanizeMs((exp - iat) * 1e3)}\uFF08> ${humanizeMs(maxLifetimeMs)}\uFF09\uFF1B\u957F\u5BFF\u547D token \u6CC4\u6F0F\u4EE3\u4EF7\u9AD8\uFF0C\u4F18\u5148\u6539\u7528\u77ED token + \u5237\u65B0`
          );
        }
      }
      if (iat !== void 0 && !num(iat)) {
        add("claim_type", "high", "iat \u4E0D\u662F\u6570\u5B57\uFF08NumericDate \u8FDD\u7EA6\uFF09", `iat=${JSON.stringify(iat)}`);
      } else if (num(iat) && iat * 1e3 > nowMs + SKEW_MS) {
        add(
          "iat_future",
          "caution",
          "iat \u5728\u672A\u6765",
          `iat=${fmtEpoch(iat)}\uFF0C\u8D85\u524D ${humanizeMs(iat * 1e3 - nowMs)}\uFF08\u5BB9\u5FCD ${SKEW_MS / 1e3} \u79D2\u65F6\u949F\u504F\u79FB\uFF09\uFF1B\u5E38\u89C1\u4E8E\u53CC\u7AEF\u65F6\u949F\u6F02\u79FB\u6216\u624B\u5DE5\u6784\u9020`
        );
      }
      if (nbf !== void 0) {
        if (!num(nbf)) {
          add("claim_type", "high", "nbf \u4E0D\u662F\u6570\u5B57\uFF08NumericDate \u8FDD\u7EA6\uFF09", `nbf=${JSON.stringify(nbf)}`);
        } else {
          if (nbf * 1e3 > nowMs) add("nbf_not_yet", "info", "token \u5C1A\u672A\u751F\u6548\uFF08nbf \u5728\u672A\u6765\uFF09", `nbf=${fmtEpoch(nbf)}\uFF0C\u8FD8\u9700 ${humanizeMs(nbf * 1e3 - nowMs)}`);
          if (num(exp) && nbf > exp) add("nbf_after_exp", "high", "nbf \u665A\u4E8E exp\uFF08\u903B\u8F91\u77DB\u76FE\uFF09", `nbf=${fmtEpoch(nbf)} > exp=${fmtEpoch(exp)}\u2014\u2014\u8BE5 token \u6C38\u8FDC\u4E0D\u53EF\u80FD\u5904\u4E8E\u6709\u6548\u7A97\u53E3`);
        }
      }
      if (payload) {
        const hits = Object.keys(payload).filter((k) => SENSITIVE_KEY_RE.test(k));
        if (hits.length > 0) {
          add(
            "credential_in_payload",
            "caution",
            "payload \u643A\u5E26\u7591\u4F3C\u51ED\u8BC1\u5B57\u6BB5",
            `\u5B57\u6BB5\uFF1A${hits.join("\u3001")}\u2014\u2014payload \u4EC5 base64 \u7F16\u7801\u5E76\u975E\u52A0\u5BC6\uFF0C\u4EFB\u4F55\u62FF\u5230 token \u7684\u4E00\u65B9\u90FD\u80FD\u76F4\u63A5\u8BFB\u51FA`
          );
        }
      }
      F.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
      const counts = { high: 0, caution: 0, info: 0 };
      for (const f of F) counts[f.level]++;
      return { ok: true, findings: F, counts };
    }
    function tokenClock(payload, nowMs) {
      const exp = payload ? payload.exp : void 0;
      const nbf = payload ? payload.nbf : void 0;
      const r = { expired: null, notYet: null, remainingMs: null, expIso: null, nbfIso: null, iatIso: null };
      if (typeof exp === "number" && Number.isFinite(exp)) {
        r.expIso = fmtEpoch(exp);
        r.remainingMs = exp * 1e3 - nowMs;
        r.expired = nowMs > exp * 1e3;
      }
      if (typeof nbf === "number" && Number.isFinite(nbf)) {
        r.nbfIso = fmtEpoch(nbf);
        r.notYet = nbf * 1e3 > nowMs;
      }
      if (typeof payload.iat === "number" && Number.isFinite(payload.iat)) r.iatIso = fmtEpoch(payload.iat);
      return r;
    }
    function renderFindings(findings, counts) {
      if (!findings || findings.length === 0) return "\u5BA1\u8BA1\u53D1\u73B0\uFF1A0 \u6761\u2014\u2014\u672A\u547D\u4E2D\u5DF2\u77E5\u98CE\u9669\u6A21\u5F0F\uFF08\u4E0D\u4EE3\u8868\u7EDD\u5BF9\u5B89\u5168\uFF09";
      const lines = findings.map((f, i) => `${i + 1}. [${LEVEL_LABELS[f.level]}] ${f.title} \u2014\u2014 ${f.detail}`);
      return `\u5BA1\u8BA1\u53D1\u73B0 ${findings.length} \u6761\uFF08\u9AD8\u5371 ${counts.high} / \u9700\u6CE8\u610F ${counts.caution} / \u63D0\u793A ${counts.info}\uFF09\uFF1A
` + lines.join("\n");
    }
    function renderDecodeReport(p) {
      const lines = [];
      lines.push("JWT \u4E09\u6BB5\u62C6\u89E3\uFF08JWS compact serialization\uFF09");
      lines.push("");
      lines.push(`\u2460 Header\uFF08${p.headerB64.length} \u5B57\u7B26 \u2192 ${Object.keys(p.header).length} \u4E2A\u5B57\u6BB5\uFF09`);
      lines.push(JSON.stringify(p.header, null, 2));
      lines.push("");
      lines.push(`\u2461 Payload\uFF08${p.payloadB64.length} \u5B57\u7B26 \u2192 ${Object.keys(p.payload).length} \u4E2A claim\uFF09`);
      lines.push(JSON.stringify(p.payload, null, 2));
      lines.push("");
      const hex = bytesToHex(p.signature, 16);
      lines.push(`\u2462 Signature\uFF08${p.signature.length} \u5B57\u8282\uFF0Cbase64url ${p.signatureB64.length} \u5B57\u7B26\uFF09`);
      lines.push(`  \u524D 16 \u5B57\u8282 hex\uFF1A${hex}${p.signature.length > 16 ? "\u2026" : ""}`);
      return lines.join("\n");
    }
    function renderClaimsTable(payload, nowMs) {
      const keys = Object.keys(payload || {});
      if (keys.length === 0) return "\uFF08payload \u4E3A\u7A7A\u5BF9\u8C61\uFF09";
      const rows = keys.map((k) => {
        const zh = CLAIM_ZH[k] || "";
        let v = JSON.stringify(payload[k]);
        if ((k === "exp" || k === "iat" || k === "nbf") && typeof payload[k] === "number") {
          v += `\uFF08${fmtEpoch(payload[k])}\uFF09`;
        }
        return zh ? `  ${k}\uFF08${zh}\uFF09\uFF1A${v}` : `  ${k}\uFF1A${v}`;
      });
      return rows.join("\n");
    }
    function renderVerifyReport(r, nowMs) {
      const lines = [];
      if (!r.ok) return `token \u89E3\u6790\u5931\u8D25\uFF1A${r.error}`;
      const verdict = r.verified ? "\u2714 \u9A8C\u7B7E\u901A\u8FC7" : "\u2716 \u9A8C\u7B7E\u4E0D\u901A\u8FC7";
      lines.push(`${verdict}\uFF08alg=${r.alg}\uFF09`);
      if (r.reason) lines.push(`\u539F\u56E0\uFF1A${r.reason}`);
      const clock = tokenClock(r.parsed.payload, nowMs);
      const clockBits = [];
      if (clock.expired === true) clockBits.push(`\u5DF2\u8FC7\u671F\uFF08exp=${clock.expIso}\uFF0C\u8D85\u65F6 ${humanizeMs(-clock.remainingMs)}\uFF09`);
      else if (clock.expired === false) clockBits.push(`\u672A\u8FC7\u671F\uFF08exp=${clock.expIso}\uFF0C\u5269\u4F59 ${humanizeMs(clock.remainingMs)}\uFF09`);
      if (clock.notYet === true) clockBits.push(`\u5C1A\u672A\u751F\u6548\uFF08nbf=${clock.nbfIso}\uFF09`);
      if (clock.iatIso) clockBits.push(`\u7B7E\u53D1\u4E8E ${clock.iatIso}`);
      if (clockBits.length) {
        lines.push(`\u65F6\u949F\u89C6\u89D2\uFF1A${clockBits.join("\uFF1B")}`);
      }
      const audit = analyzeClaims(r.parsed.header, r.parsed.payload, nowMs);
      lines.push("");
      lines.push(renderFindings(audit.findings, audit.counts));
      return lines.join("\n");
    }
    function renderAuditReport(a, nowMs) {
      return renderFindings(a.findings, a.counts);
    }
    function renderSignReport(r) {
      if (!r.ok) return `\u7B7E\u53D1\u5931\u8D25\uFF1A${r.error}`;
      return [
        "\u5DF2\u7B7E\u53D1\uFF08\u4EC5\u7528\u4E8E\u8054\u8C03\u6D4B\u8BD5\uFF0C\u52FF\u5C06\u6D4B\u8BD5\u5BC6\u94A5\u7528\u4E8E\u751F\u4EA7\uFF09:",
        "",
        r.token,
        "",
        `alg=${r.header.alg}\uFF0Cexp=${r.payload.exp !== void 0 ? fmtEpoch(r.payload.exp) : "\uFF08\u672A\u8BBE\u7F6E\uFF09"}\uFF0Ciat=${fmtEpoch(r.payload.iat)}`
      ].join("\n");
    }
    module.exports = {
      MAX_TOKEN_LEN,
      ALGS,
      LEVEL_LABELS,
      CLAIM_ZH,
      b64uDecode,
      b64uEncode,
      b64sDecode,
      utf8Encode,
      utf8Decode,
      bytesToHex,
      splitToken,
      parseToken,
      joseRawToDer,
      derToJoseRaw,
      pemBodyToDer,
      verifyToken,
      signToken,
      analyzeClaims,
      tokenClock,
      humanizeMs,
      renderDecodeReport,
      renderVerifyReport,
      renderAuditReport,
      renderSignReport,
      renderFindings,
      renderClaimsTable
    };
  }
});

// shared/jwt-crypto-web.js
var require_jwt_crypto_web = __commonJS({
  "shared/jwt-crypto-web.js"(exports, module) {
    "use strict";
    var core2 = require_jwt_core();
    function subtle() {
      const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
      if (!c || !c.subtle) throw new Error("\u5F53\u524D\u8FD0\u884C\u65F6\u65E0 WebCrypto\uFF08crypto.subtle\uFF09");
      return c.subtle;
    }
    var HASH_WEB = { "SHA-256": "SHA-256", "SHA-384": "SHA-384", "SHA-512": "SHA-512" };
    var EC_CURVE = { "P-256": "P-256", "P-384": "P-384", "P-521": "P-521" };
    async function importKey(alg, keyInput, isPrivate, usages) {
      const spec = core2.ALGS[alg];
      const s = subtle();
      const algId = { name: "", hash: HASH_WEB[spec.hash] };
      if (spec.family === "rsa") algId.name = "RSASSA-PKCS1-v1_5";
      else if (spec.family === "pss") algId.name = "RSA-PSS";
      else algId.name = "ECDSA";
      if (keyInput && typeof keyInput.pem === "string") {
        const der = core2.pemBodyToDer(keyInput.pem);
        const format = isPrivate ? "pkcs8" : "spki";
        const id = spec.family === "ec" ? { name: "ECDSA", namedCurve: EC_CURVE[spec.curve] } : algId;
        return s.importKey(format, der, id, false, usages);
      }
      if (keyInput && keyInput.jwk && typeof keyInput.jwk === "object") {
        const jwk = keyInput.jwk;
        const id = spec.family === "ec" ? { name: "ECDSA", namedCurve: EC_CURVE[spec.curve] } : algId;
        return s.importKey("jwk", jwk, id, false, usages);
      }
      throw new Error("\u7F3A\u5C11 PEM \u6216 JWK \u5BC6\u94A5\u6750\u6599");
    }
    async function hmacKey(alg, secret, usages) {
      const spec = core2.ALGS[alg];
      const raw = typeof secret === "string" ? core2.utf8Encode(secret) : secret;
      return subtle().importKey("raw", raw, { name: "HMAC", hash: HASH_WEB[spec.hash] }, false, usages);
    }
    async function hmacVerify(alg, secret, data, sig) {
      const key = await hmacKey(alg, secret, ["verify"]);
      return subtle().verify("HMAC", key, sig, data);
    }
    async function hmacSign(alg, secret, data) {
      const key = await hmacKey(alg, secret, ["sign"]);
      return new Uint8Array(await subtle().sign("HMAC", key, data));
    }
    async function asymVerify(alg, keyInput, data, sig) {
      const spec = core2.ALGS[alg];
      const key = await importKey(alg, keyInput, false, ["verify"]);
      const s = subtle();
      if (spec.family === "rsa") return s.verify({ name: "RSASSA-PKCS1-v1_5", hash: HASH_WEB[spec.hash] }, key, sig, data);
      if (spec.family === "pss") {
        return s.verify({ name: "RSA-PSS", saltLength: spec.hashLen }, key, sig, data);
      }
      return s.verify({ name: "ECDSA", hash: HASH_WEB[spec.hash] }, key, sig, data);
    }
    async function asymSign(alg, keyInput, data) {
      const spec = core2.ALGS[alg];
      const key = await importKey(alg, keyInput, true, ["sign"]);
      const s = subtle();
      if (spec.family === "rsa") return new Uint8Array(await s.sign({ name: "RSASSA-PKCS1-v1_5", hash: HASH_WEB[spec.hash] }, key, data));
      if (spec.family === "pss") return new Uint8Array(await s.sign({ name: "RSA-PSS", saltLength: spec.hashLen }, key, data));
      return new Uint8Array(await s.sign({ name: "ECDSA", hash: HASH_WEB[spec.hash] }, key, data));
    }
    module.exports = { hmacVerify, hmacSign, asymVerify, asymSign };
  }
});

// src/Panel.tsx
var coreNs = __toESM(require_jwt_core());
var webCrypto = __toESM(require_jwt_crypto_web());
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var core = coreNs;
var CSS = `
.jd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.jd-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.jd-head b{font-size:13px}
.jd-head .sub{color:#5C6678;font-size:11px}
.jd-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.jd-tabs{display:flex;gap:6px;flex-wrap:wrap}
.jd-tab{background:#20263A;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.jd-tab.on{background:#2b3348;color:#E6EAF2;border-color:#3a4358}
.jd-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.jd-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12.5px/1.5 ui-monospace,Consolas,monospace;padding:7px 10px;outline:none}
.jd-input:focus{border-color:#4fa3f1}
.jd-grow{flex:1;min-width:200px}
.jd-narrow{width:170px}
.jd-area{width:100%;min-height:92px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.jd-area:focus{border-color:#4fa3f1}
.jd-btn{background:#2b3348;border:1px solid #3a4358;color:#E6EAF2;border-radius:6px;padding:5px 16px;font-size:12px;cursor:pointer}
.jd-btn:disabled{opacity:.45;cursor:default}
.jd-err{background:#2b1215;border:1px solid #e03131;color:#f1a0a0;border-radius:8px;padding:8px 12px;font-size:12px}
.jd-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.jd-verdict.pass{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.jd-verdict.fail{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.jd-verdict b{font-size:13px}
.jd-json{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede}
.jd-finds{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.jd-finding{padding:7px 10px;border-bottom:1px solid #161c2a;font-size:11.5px}
.jd-finding:last-child{border-bottom:none}
.jd-lv{display:inline-block;border-radius:4px;padding:0 6px;margin-right:6px;font-size:10.5px}
.jd-lv.high{background:#3d1418;color:#f1a0a0}
.jd-lv.caution{background:#332512;color:#f3b377}
.jd-lv.info{background:#1a2333;color:#9aa8c7}
.jd-finding .det{color:#8B94A9;margin-top:2px;word-break:break-all}
.jd-note{color:#5C6678;font-size:11px;line-height:1.6}
.jd-claims{border:1px solid #1c2333;border-radius:8px;overflow:hidden;font-size:11.5px}
.jd-claims .row{display:flex;gap:8px;padding:4px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.jd-claims .row:last-child{border-bottom:none}
.jd-claims .k{color:#9f9af0;min-width:150px;white-space:nowrap}
.jd-claims .zh{color:#5C6678;min-width:130px;white-space:nowrap}
.jd-claims .v{color:#c9cede;flex:1}
.jd-clock{font:11px/1.7 ui-monospace,Consolas,monospace;color:#9aa3b8}
.jd-select{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font-size:12px;padding:6px 8px;outline:none}
`;
var TAB_ZH = { decode: "\u89E3\u7801", verify: "\u9A8C\u7B7E", audit: "\u5BA1\u8BA1", sign: "\u7B7E\u53D1" };
var SIGN_ALGS = ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"];
var LV_CLS = { high: "high", caution: "caution", info: "info" };
function buildMaterial(keyInput) {
  const k = keyInput.trim();
  if (!k) return {};
  if (k.startsWith("-----BEGIN")) return { publicKeyPem: k, privateKeyPem: k };
  if (k.startsWith("{")) {
    try {
      const j = JSON.parse(k);
      return { publicKeyJwk: j, privateKeyJwk: j };
    } catch {
      return { secret: k };
    }
  }
  return { secret: k };
}
function isAsym(alg) {
  return !!core.ALGS[alg] && core.ALGS[alg].family !== "hmac";
}
function auditOf(header, payload, nowMs) {
  return core.analyzeClaims(header, payload, nowMs);
}
function nowMsFromInput(s) {
  const t = s.trim();
  if (!t) return Date.now();
  if (/^\d+$/.test(t)) return Number(t);
  const p = Date.parse(t);
  if (!Number.isFinite(p)) throw new Error("\u5BA1\u8BA1\u65F6\u523B\u65E0\u6CD5\u89E3\u6790\uFF08\u652F\u6301 epoch \u6BEB\u79D2\u6216 ISO \u5B57\u7B26\u4E32\uFF09");
  return p;
}
function JwtDeskPanel(_props) {
  const [tab, setTab] = useState("decode");
  const [token, setToken] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [nowInput, setNowInput] = useState("");
  const [payloadText, setPayloadText] = useState('{\n  "sub": "user-1",\n  "scope": "read"\n}');
  const [expiresSec, setExpiresSec] = useState("3600");
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signAlg, setSignAlg] = useState("HS256");
  async function run() {
    if (tab === "sign") {
      await runSign();
      return;
    }
    if (!token.trim()) {
      setState({ kind: "error", message: "\u7F3A\u5C11 token" });
      return;
    }
    if (tab === "decode") {
      runDecode();
      return;
    }
    if (tab === "audit") {
      runAudit();
      return;
    }
    await runVerify();
  }
  function runDecode() {
    const p = core.parseToken(token);
    if (!p.ok) {
      setState({ kind: "error", message: String(p.error) });
      return;
    }
    const claims = Object.keys(p.payload).map((k) => {
      const zh = core.CLAIM_ZH[k] || "";
      let v = JSON.stringify(p.payload[k]);
      if ((k === "exp" || k === "iat" || k === "nbf") && typeof p.payload[k] === "number") v += `\uFF08${new Date(p.payload[k] * 1e3).toISOString()}\uFF09`;
      return { k, zh, v };
    });
    setState({
      kind: "decode",
      header: JSON.stringify(p.header, null, 2),
      payload: JSON.stringify(p.payload, null, 2),
      sigInfo: `signature\uFF1A${p.signature.length} \u5B57\u8282\uFF08base64url ${p.signatureB64.length} \u5B57\u7B26\uFF09\uFF0C\u524D 16 \u5B57\u8282 hex\uFF1A${core.bytesToHex(p.signature, 16)}${p.signature.length > 16 ? "\u2026" : ""}`,
      claims
    });
  }
  function runAudit() {
    const p = core.parseToken(token);
    if (!p.ok) {
      setState({ kind: "error", message: String(p.error) });
      return;
    }
    let nowMs;
    try {
      nowMs = nowMsFromInput(nowInput);
    } catch (e) {
      setState({ kind: "error", message: e.message });
      return;
    }
    const a = auditOf(p.header, p.payload, nowMs);
    const clock = core.tokenClock(p.payload, nowMs);
    const bits = [];
    if (clock.expired === true) bits.push(`\u5DF2\u8FC7\u671F\uFF08exp=${clock.expIso}\uFF0C\u8D85\u65F6 ${core.humanizeMs(-clock.remainingMs)}\uFF09`);
    else if (clock.expired === false) bits.push(`\u672A\u8FC7\u671F\uFF08exp=${clock.expIso}\uFF0C\u5269\u4F59 ${core.humanizeMs(clock.remainingMs)}\uFF09`);
    else bits.push("\u65E0 exp\uFF0C\u65E0\u6CD5\u5224\u8FC7\u671F");
    setState({ kind: "audit", findings: a.findings, counts: a.counts, clockLine: `\u5BA1\u8BA1\u65F6\u523B ${new Date(nowMs).toISOString()} \xB7 ${bits.join("\uFF1B")}` });
  }
  async function runVerify() {
    const p = core.parseToken(token);
    if (!p.ok) {
      setState({ kind: "error", message: String(p.error) });
      return;
    }
    let nowMs;
    try {
      nowMs = nowMsFromInput(nowInput);
    } catch (e) {
      setState({ kind: "error", message: e.message });
      return;
    }
    setBusy(true);
    try {
      const material = buildMaterial(keyInput);
      const r = await core.verifyToken(token, material, webCrypto);
      if (!r.ok) {
        setState({ kind: "error", message: String(r.error) });
        return;
      }
      const a = auditOf(r.parsed.header, r.parsed.payload, nowMs);
      const clock = core.tokenClock(r.parsed.payload, nowMs);
      const bits = [];
      if (clock.expired === true) bits.push(`\u5DF2\u8FC7\u671F\uFF08exp=${clock.expIso}\uFF0C\u8D85\u65F6 ${core.humanizeMs(-clock.remainingMs)}\uFF09`);
      else if (clock.expired === false) bits.push(`\u672A\u8FC7\u671F\uFF08exp=${clock.expIso}\uFF0C\u5269\u4F59 ${core.humanizeMs(clock.remainingMs)}\uFF09`);
      if (clock.notYet === true) bits.push(`\u5C1A\u672A\u751F\u6548\uFF08nbf=${clock.nbfIso}\uFF09`);
      if (clock.iatIso) bits.push(`\u7B7E\u53D1\u4E8E ${clock.iatIso}`);
      setState({ kind: "verify", verified: !!r.verified, alg: r.alg || "?", reason: r.reason || null, clock: bits, findings: a.findings, counts: a.counts });
    } catch (e) {
      setState({ kind: "error", message: `\u9A8C\u7B7E\u6267\u884C\u5931\u8D25\uFF1A${e.message}` });
    } finally {
      setBusy(false);
    }
  }
  async function runSign() {
    const alg = signAlg;
    if (!keyInput.trim() && !isAsym(alg)) {
      setState({ kind: "error", message: "\u7F3A\u5C11\u5BC6\u94A5\uFF08HS* \u586B\u5B57\u7B26\u4E32 secret\uFF09" });
      return;
    }
    if (isAsym(alg) && !keyInput.trim()) {
      setState({ kind: "error", message: "\u7F3A\u5C11\u79C1\u94A5\uFF08RS*/PS*/ES* \u7C98\u8D34 PEM \u79C1\u94A5\u6216 JWK\uFF09" });
      return;
    }
    let payloadObj;
    try {
      payloadObj = JSON.parse(payloadText);
    } catch (e) {
      setState({ kind: "error", message: `payload \u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${e.message}` });
      return;
    }
    const material = buildMaterial(keyInput);
    const opts = {};
    const es = Number(expiresSec);
    if (expiresSec.trim() !== "" && Number.isFinite(es)) opts.expiresInSeconds = es;
    setBusy(true);
    try {
      const r = await core.signToken(alg, material, payloadObj, opts, webCrypto);
      if (!r.ok) {
        setState({ kind: "error", message: String(r.error) });
        return;
      }
      setState({ kind: "sign", token: r.token, meta: `alg=${r.header.alg} \xB7 exp=${r.payload.exp !== void 0 ? new Date(r.payload.exp * 1e3).toISOString() : "\u672A\u8BBE\u7F6E"} \xB7 iat=${new Date(r.payload.iat * 1e3).toISOString()}` });
    } catch (e) {
      setState({ kind: "error", message: `\u7B7E\u53D1\u6267\u884C\u5931\u8D25\uFF1A${e.message}` });
    } finally {
      setBusy(false);
    }
  }
  const hasToken = !!token.trim();
  const canRun = tab === "sign" ? true : hasToken;
  return /* @__PURE__ */ jsxs("div", { className: "jd-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "jd-head", children: [
      /* @__PURE__ */ jsx("b", { children: "JWT \u8C03\u8BD5\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u89E3\u7801 \xB7 \u9A8C\u7B7E \xB7 \u5BA1\u8BA1 \xB7 \u7B7E\u53D1 \xB7 HS256/RS256/PS256/ES256\uFF08384\xB7512 \u540C\u6863\uFF09\xB7 \u7EAF\u672C\u5730 \xB7 token \u4E0D\u51FA\u672C\u673A" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "jd-body", children: [
      /* @__PURE__ */ jsx("div", { className: "jd-tabs", children: ["decode", "verify", "audit", "sign"].map((t) => /* @__PURE__ */ jsx("button", { className: `jd-tab ${tab === t ? "on" : ""}`, onClick: () => {
        setTab(t);
        setState(null);
      }, children: TAB_ZH[t] }, t)) }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "jd-area",
          placeholder: "\u7C98\u8D34 JWT\uFF08header.payload.signature \u4E09\u6BB5\uFF09\u2026\u2026",
          value: token,
          onChange: (e) => setToken(e.target.value)
        }
      ),
      (tab === "verify" || tab === "sign") && /* @__PURE__ */ jsx(
        "input",
        {
          className: "jd-input jd-grow",
          placeholder: tab === "verify" ? "\u5BC6\u94A5\uFF1AHS* \u586B\u5B57\u7B26\u4E32 secret\uFF1BRS*/PS*/ES* \u7C98\u8D34 PEM/JWK \u516C\u94A5" : "\u5BC6\u94A5\uFF1AHS* \u586B\u5B57\u7B26\u4E32 secret\uFF1BRS*/PS*/ES* \u7C98\u8D34 PEM/JWK \u79C1\u94A5",
          value: keyInput,
          onChange: (e) => setKeyInput(e.target.value)
        }
      ),
      tab === "audit" && /* @__PURE__ */ jsx(
        "input",
        {
          className: "jd-input jd-narrow",
          placeholder: "\u5BA1\u8BA1\u65F6\u523B\uFF08\u7559\u7A7A=\u73B0\u5728\uFF09",
          value: nowInput,
          onChange: (e) => setNowInput(e.target.value)
        }
      ),
      tab === "sign" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "jd-row", children: [
          /* @__PURE__ */ jsx("select", { className: "jd-select", value: signAlg, onChange: (e) => setSignAlg(e.target.value), children: SIGN_ALGS.map((a) => /* @__PURE__ */ jsx("option", { value: a, children: a }, a)) }),
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "jd-input jd-narrow",
              placeholder: "\u6709\u6548\u671F\u79D2\uFF08\u7559\u7A7A\u4E0D\u8BBE exp\uFF09",
              value: expiresSec,
              onChange: (e) => setExpiresSec(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "jd-area",
            placeholder: "payload claims\uFF08JSON \u5BF9\u8C61\uFF09",
            value: payloadText,
            onChange: (e) => setPayloadText(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "jd-row", children: [
        /* @__PURE__ */ jsx("button", { className: "jd-btn", disabled: !canRun || busy, onClick: run, children: busy ? "\u6267\u884C\u4E2D\u2026" : tab === "sign" ? "\u7B7E\u53D1" : "\u6267\u884C" }),
        tab === "verify" && /* @__PURE__ */ jsx("span", { className: "jd-note", children: "HS256/384/512 \u7528\u5BF9\u79F0\u5BC6\u94A5\uFF1BRS/PS/ES \u7528 PEM \u6216 JWK \u516C\u94A5\uFF08\u81EA\u9002\u5E94\u8BC6\u522B\uFF09\u3002" }),
        tab === "sign" && /* @__PURE__ */ jsx("span", { className: "jd-note", children: "\u7B7E\u53D1\u4EC5\u7528\u4E8E\u8054\u8C03\u6D4B\u8BD5\u2014\u2014\u52FF\u5C06\u6D4B\u8BD5\u5BC6\u94A5\u7528\u4E8E\u751F\u4EA7\u3002" })
      ] }),
      state && state.kind === "error" && /* @__PURE__ */ jsxs("div", { className: "jd-err", children: [
        "\u2716 ",
        state.message
      ] }),
      state && state.kind === "decode" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "jd-json", children: [
          "\u2460 Header",
          "\n",
          state.header
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "jd-json", children: [
          "\u2461 Payload",
          "\n",
          state.payload
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "jd-json", children: [
          "\u2462 ",
          state.sigInfo
        ] }),
        /* @__PURE__ */ jsx("div", { className: "jd-claims", children: state.claims.map((c) => /* @__PURE__ */ jsxs("div", { className: "row", children: [
          /* @__PURE__ */ jsx("span", { className: "k", children: c.k }),
          /* @__PURE__ */ jsx("span", { className: "zh", children: c.zh }),
          /* @__PURE__ */ jsx("span", { className: "v", children: c.v })
        ] }, c.k)) })
      ] }),
      state && state.kind === "verify" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `jd-verdict ${state.verified ? "pass" : "fail"}`, children: [
          /* @__PURE__ */ jsx("b", { children: state.verified ? "\u2714 \u9A8C\u7B7E\u901A\u8FC7" : "\u2716 \u9A8C\u7B7E\u4E0D\u901A\u8FC7" }),
          "\uFF08alg=",
          state.alg,
          "\uFF09",
          state.reason && /* @__PURE__ */ jsx("div", { className: "jd-note", style: { color: "inherit" }, children: state.reason })
        ] }),
        state.clock.length > 0 && /* @__PURE__ */ jsxs("div", { className: "jd-clock", children: [
          "\u65F6\u949F\u89C6\u89D2\uFF1A",
          state.clock.join("\uFF1B")
        ] }),
        /* @__PURE__ */ jsx(FindingsBlock, { findings: state.findings, counts: state.counts })
      ] }),
      state && state.kind === "audit" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "jd-clock", children: state.clockLine }),
        /* @__PURE__ */ jsx(FindingsBlock, { findings: state.findings, counts: state.counts })
      ] }),
      state && state.kind === "sign" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "jd-clock", children: state.meta }),
        /* @__PURE__ */ jsx("textarea", { className: "jd-area", readOnly: true, value: state.token, onFocus: (e) => e.currentTarget.select() })
      ] }),
      tab === "audit" && !state && /* @__PURE__ */ jsx("div", { className: "jd-note", children: "\u5BA1\u8BA1 = \u5BF9 header/payload \u7684\u5DF2\u77E5\u98CE\u9669\u6A21\u5F0F\u68C0\u67E5\uFF08alg=none\u3001\u8FC7\u671F\u3001\u672A\u6765 iat\u3001\u8D85\u957F\u6709\u6548\u671F\u3001jku/x5u \u5916\u94FE\u3001payload \u5E26\u7591\u4F3C\u51ED\u8BC1\u7B49\uFF09\uFF0C\u9010\u6761\u4E2D\u6587\u8BF4\u660E\u3002\u4E0D\u9A8C\u8BC1\u7B7E\u540D\u2014\u2014\u9A8C\u7B7E\u8BF7\u5207\u300C\u9A8C\u7B7E\u300D\u9875\u3002" })
    ] })
  ] });
}
function FindingsBlock({ findings, counts }) {
  if (!findings || findings.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "jd-note", children: "\u5BA1\u8BA1\u53D1\u73B0 0 \u6761\u2014\u2014\u672A\u547D\u4E2D\u5DF2\u77E5\u98CE\u9669\u6A21\u5F0F\uFF08\u4E0D\u4EE3\u8868\u7EDD\u5BF9\u5B89\u5168\uFF09\u3002" });
  }
  return /* @__PURE__ */ jsxs("div", { className: "jd-finds", children: [
    /* @__PURE__ */ jsxs("div", { className: "jd-note", style: { padding: "6px 10px", borderBottom: "1px solid #161c2a" }, children: [
      "\u5BA1\u8BA1\u53D1\u73B0 ",
      findings.length,
      " \u6761\uFF08\u9AD8\u5371 ",
      counts.high,
      " / \u9700\u6CE8\u610F ",
      counts.caution,
      " / \u63D0\u793A ",
      counts.info,
      "\uFF09"
    ] }),
    findings.map((f, i) => /* @__PURE__ */ jsxs("div", { className: "jd-finding", children: [
      /* @__PURE__ */ jsx("span", { className: `jd-lv ${LV_CLS[f.level]}`, children: core.LEVEL_LABELS[f.level] }),
      f.title,
      /* @__PURE__ */ jsx("div", { className: "det", children: f.detail })
    ] }, i))
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function JwtDeskEntry(props) {
  return /* @__PURE__ */ jsx2(JwtDeskPanel, { ...props });
}
export {
  JwtDeskEntry as default
};
