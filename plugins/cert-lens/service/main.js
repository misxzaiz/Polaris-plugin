"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/engine-api.js
var require_engine_api = __commonJS({
  "shared/engine-api.js"(exports2, module2) {
    "use strict";
    var LIMITS = {
      /** 单次粘贴/文件 PEM 输入上限：链 + 私钥通常 <50KB，2MB 已极宽松 */
      PEM_MAX_BYTES: 2 * 1024 * 1024,
      /** 探测超时缺省/上限（毫秒） */
      PROBE_TIMEOUT_DEFAULT_MS: 8e3,
      PROBE_TIMEOUT_MAX_MS: 15e3,
      /** 盯守端点数量上限（每次全检并发探测，控制总量） */
      WATCH_MAX_ENDPOINTS: 64,
      /** 单条诊断修复建议条数上限 */
      FIXES_MAX: 6,
      /** 到期分色阈值（天） */
      EXPIRY: { CRIT_DAYS: 7, WARN_DAYS: 30, INFO_DAYS: 90 },
      /** CA/B Forum SC-081：2026-03-15 起新签公网证书有效期上限 200 天 */
      MAX_VALIDITY_DAYS_PUBLIC: 200
    };
    function clampTimeoutMs(v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return LIMITS.PROBE_TIMEOUT_DEFAULT_MS;
      return Math.min(Math.max(Math.round(n), 1e3), LIMITS.PROBE_TIMEOUT_MAX_MS);
    }
    function normalizeTarget(raw) {
      if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "\u76EE\u6807\u4E3A\u7A7A\uFF08\u9700\u8981 host \u6216 host:port\uFF09" };
      let s = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0].trim();
      if (!s) return { ok: false, error: "\u76EE\u6807\u4E3A\u7A7A" };
      let host = s;
      let port = 443;
      if (s.startsWith("[")) {
        const m = s.match(/^\[([^\]]+)\](?::(\d+))?$/);
        if (!m) return { ok: false, error: `IPv6 \u76EE\u6807\u683C\u5F0F\u975E\u6CD5\uFF1A${s}\uFF08\u5E94\u4E3A [::1]:443\uFF09` };
        host = m[1];
        if (m[2]) port = Number(m[2]);
      } else {
        const i = s.lastIndexOf(":");
        if (i !== -1) {
          const p = s.slice(i + 1);
          if (!/^\d+$/.test(p)) return { ok: false, error: `\u7AEF\u53E3\u4E0D\u662F\u6570\u5B57\uFF1A${p}` };
          host = s.slice(0, i);
          port = Number(p);
        }
      }
      if (!/^\d+$/.test(String(port)) || port < 1 || port > 65535) {
        return { ok: false, error: `\u7AEF\u53E3\u8D85\u51FA\u8303\u56F4 1-65535\uFF1A${port}` };
      }
      host = host.trim().toLowerCase().replace(/\.$/, "");
      if (!host) return { ok: false, error: "\u4E3B\u673A\u540D\u4E3A\u7A7A" };
      return { ok: true, host, port };
    }
    var PEM_LABELS = [
      "CERTIFICATE",
      "TRUSTED CERTIFICATE",
      "PUBLIC KEY",
      "RSA PUBLIC KEY",
      "PRIVATE KEY",
      "ENCRYPTED PRIVATE KEY",
      "RSA PRIVATE KEY",
      "EC PRIVATE KEY",
      "CERTIFICATE REQUEST",
      "NEW CERTIFICATE REQUEST",
      "X509 CRL"
    ];
    function splitPemBlocks(text) {
      if (typeof text !== "string") return [];
      const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
      const blocks = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        blocks.push({ label: m[1].trim(), body: m[0] });
      }
      return blocks;
    }
    function expirySeverity(daysLeft) {
      if (daysLeft < 0) return "expired";
      if (daysLeft <= LIMITS.EXPIRY.CRIT_DAYS) return "crit";
      if (daysLeft <= LIMITS.EXPIRY.WARN_DAYS) return "warn";
      if (daysLeft <= LIMITS.EXPIRY.INFO_DAYS) return "info";
      return "ok";
    }
    function humanDays(daysLeft) {
      const d = Math.round(daysLeft);
      if (d < 0) return `\u5DF2\u8FC7\u671F ${-d} \u5929`;
      if (d === 0) return "\u4ECA\u5929\u5230\u671F";
      return `\u5269\u4F59 ${d} \u5929`;
    }
    module2.exports = {
      LIMITS,
      clampTimeoutMs,
      normalizeTarget,
      splitPemBlocks,
      PEM_LABELS,
      expirySeverity,
      humanDays
    };
  }
});

// shared/certmodel.js
var require_certmodel = __commonJS({
  "shared/certmodel.js"(exports2, module2) {
    "use strict";
    var crypto2 = require("crypto");
    var { X509Certificate } = crypto2;
    var { splitPemBlocks } = require_engine_api();
    function derTlv(buf, pos) {
      if (pos >= buf.length) throw new Error("DER \u8D8A\u754C");
      const tag = buf[pos];
      let p = pos + 1;
      let len = buf[p++];
      if (len & 128) {
        const n = len & 127;
        if (n === 0 || n > 4) throw new Error("DER \u957F\u5EA6\u5B57\u6BB5\u5F02\u5E38");
        len = 0;
        for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
      }
      return { tag, contentStart: p, contentEnd: p + len, next: p + len };
    }
    function derChildren(buf, start, end) {
      const kids = [];
      let pos = start;
      while (pos < end) {
        const t = derTlv(buf, pos);
        kids.push(t);
        pos = t.next;
      }
      return kids;
    }
    function derOid(buf, tlv) {
      const c = buf.subarray(tlv.contentStart, tlv.contentEnd);
      const parts = [Math.floor(c[0] / 40), c[0] % 40];
      let val = 0;
      for (let i = 1; i < c.length; i++) {
        val = val * 128 + (c[i] & 127);
        if (!(c[i] & 128)) {
          parts.push(val);
          val = 0;
        }
      }
      return parts.join(".");
    }
    var SIG_ALG_OIDS = {
      "1.2.840.113549.1.1.4": "md5WithRSAEncryption",
      "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
      "1.2.840.113549.1.1.10": "RSASSA-PSS",
      "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
      "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
      "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
      "1.2.840.10045.4.1": "ecdsa-with-SHA1",
      "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
      "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
      "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
      "1.3.101.112": "Ed25519",
      "1.3.101.113": "Ed448"
    };
    function sigAlgOf(rawDer) {
      try {
        const top = derTlv(rawDer, 0);
        const kids = derChildren(rawDer, top.contentStart, top.contentEnd);
        if (kids.length < 2 || kids[1].tag !== 48) return { oid: null, name: null };
        const algKids = derChildren(rawDer, kids[1].contentStart, kids[1].contentEnd);
        if (!algKids.length || algKids[0].tag !== 6) return { oid: null, name: null };
        const oid = derOid(rawDer, algKids[0]);
        return { oid, name: SIG_ALG_OIDS[oid] || oid };
      } catch (_) {
        return { oid: null, name: null };
      }
    }
    function keyInfoOf(publicKey) {
      try {
        const jwk = publicKey.export({ format: "jwk" });
        if (jwk.kty === "RSA") {
          const b = Buffer.from(jwk.n, "base64url");
          return { algo: "RSA", bits: b.length * 8 };
        }
        if (jwk.kty === "EC") {
          const bits = { "P-256": 256, "P-384": 384, "P-521": 521, "secp256k1": 256 }[jwk.crv] || null;
          return { algo: "EC", bits, curve: jwk.crv };
        }
        if (jwk.kty === "OKP") {
          return { algo: jwk.crv || "EdDSA", bits: { "Ed25519": 256, "Ed448": 448, "X25519": 256, "X448": 448 }[jwk.crv] || null, curve: jwk.crv };
        }
        return { algo: jwk.kty || "unknown", bits: null };
      } catch (_) {
        return { algo: "unknown", bits: null };
      }
    }
    function dnToObj(text) {
      const out = {};
      if (typeof text !== "string") return out;
      for (const part of text.split(/[\n,]\s*/)) {
        const i = part.indexOf("=");
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
      }
      return out;
    }
    function parseSan(text) {
      const san = { dns: [], ips: [], emails: [], uris: [], others: [] };
      if (!text) return san;
      for (const raw of String(text).split(",")) {
        const item = raw.trim();
        if (!item) continue;
        const i = item.indexOf(":");
        if (i === -1) {
          san.others.push(item);
          continue;
        }
        const type = item.slice(0, i).trim().toLowerCase();
        const val = item.slice(i + 1).trim();
        if (type === "dns") san.dns.push(val);
        else if (type === "ip address") san.ips.push(val);
        else if (type === "email") san.emails.push(val);
        else if (type === "uri") san.uris.push(val);
        else san.others.push(item);
      }
      return san;
    }
    function parseInfoAccess(text) {
      const aia = { ocsp: [], caIssuers: [] };
      if (!text) return aia;
      for (const part of String(text).split(";")) {
        const m = part.trim().match(/^(OCSP|CA Issuers)\s*-\s*URI:(.+)$/i);
        if (!m) continue;
        (m[1].toLowerCase() === "ocsp" ? aia.ocsp : aia.caIssuers).push(m[2].trim());
      }
      return aia;
    }
    function parseCertificate(body, index, now) {
      const certObj = new X509Certificate(body);
      const san = parseSan(certObj.subjectAltName);
      const sig = sigAlgOf(certObj.raw);
      const keyInfo = keyInfoOf(certObj.publicKey);
      const subjectObj = dnToObj(certObj.subject);
      const selfIssued = certObj.subject === certObj.issuer;
      let selfSigned = false;
      if (selfIssued) {
        try {
          selfSigned = certObj.verify(certObj.publicKey) === true;
        } catch (_) {
          selfSigned = false;
        }
      }
      const notBefore = certObj.validFromDate;
      const notAfter = certObj.validToDate;
      const daysLeft = Math.floor((notAfter.getTime() - now) / 864e5);
      const validityDays = Math.round((notAfter.getTime() - notBefore.getTime()) / 864e5);
      return {
        index,
        kind: "certificate",
        subjectText: certObj.subject,
        issuerText: certObj.issuer,
        subject: subjectObj,
        cn: subjectObj.CN || null,
        notBefore: notBefore.toISOString(),
        notAfter: notAfter.toISOString(),
        daysLeft,
        validityDays,
        serial: certObj.serialNumber,
        version: certObj.version,
        san,
        hasSan: san.dns.length + san.ips.length + san.emails.length + san.uris.length > 0,
        keyInfo,
        sigAlg: sig.name,
        sigAlgOid: sig.oid,
        sha256Fp: certObj.fingerprint256,
        sha1Fp: certObj.fingerprint,
        isCA: certObj.ca === true,
        keyUsage: Array.isArray(certObj.keyUsage) ? certObj.keyUsage : [],
        extKeyUsage: Array.isArray(certObj.extKeyUsage) ? certObj.extKeyUsage : [],
        selfIssued,
        selfSigned,
        aia: parseInfoAccess(certObj.infoAccess),
        pem: body.trim(),
        certObj
        // 内存对象：对外 JSON 前必须 strip（见 toOutput）
      };
    }
    function stripCertObj(v) {
      return JSON.parse(JSON.stringify(v, (k, val) => k === "certObj" ? void 0 : val));
    }
    function parseInput(text, now) {
      const blocks = splitPemBlocks(text);
      const r = { certs: [], pubkeys: [], privkeys: 0, csrBlocks: 0, crlBlocks: 0, encryptedKeys: 0, errors: [] };
      if (!blocks.length) {
        r.errors.push({ index: 0, label: null, error: "\u8F93\u5165\u4E2D\u6CA1\u6709\u627E\u5230 PEM \u5757\uFF08\u9700\u8981 -----BEGIN CERTIFICATE----- \u7B49\uFF09" });
        return r;
      }
      blocks.forEach((b, i) => {
        try {
          if (b.label === "CERTIFICATE" || b.label === "TRUSTED CERTIFICATE") {
            r.certs.push(parseCertificate(b.body, r.certs.length, now));
          } else if (b.label === "PUBLIC KEY" || b.label === "RSA PUBLIC KEY") {
            const pub = crypto2.createPublicKey(b.body);
            r.pubkeys.push({ index: r.pubkeys.length, label: b.label, keyInfo: keyInfoOf(pub), pem: b.body });
          } else if (b.label === "ENCRYPTED PRIVATE KEY") {
            r.encryptedKeys += 1;
          } else if (b.label === "PRIVATE KEY" || b.label === "RSA PRIVATE KEY" || b.label === "EC PRIVATE KEY") {
            r.privkeys += 1;
          } else if (b.label === "CERTIFICATE REQUEST" || b.label === "NEW CERTIFICATE REQUEST") {
            r.csrBlocks += 1;
          } else if (b.label === "X509 CRL") {
            r.crlBlocks += 1;
          } else {
            r.errors.push({ index: i, label: b.label, error: `\u672A\u652F\u6301\u7684 PEM \u7C7B\u578B\uFF1A${b.label}` });
          }
        } catch (e) {
          r.errors.push({ index: i, label: b.label, error: `\u89E3\u6790\u5931\u8D25\uFF1A${e && e.message || e}`.slice(0, 300) });
        }
      });
      return r;
    }
    function assembleChain(certModels) {
      const n = certModels.length;
      const issues = [];
      if (n === 0) return { leafIndex: null, ordered: [], issues, rootFound: false, verifiedPairs: [] };
      const seen = /* @__PURE__ */ new Map();
      certModels.forEach((c, i) => {
        if (seen.has(c.sha256Fp)) {
          issues.push({ kind: "duplicate", index: i, detail: `\u4E0E\u7B2C ${seen.get(c.sha256Fp) + 1} \u5F20\u8BC1\u4E66\u91CD\u590D\uFF08\u76F8\u540C\u6307\u7EB9\uFF09` });
        } else seen.set(c.sha256Fp, i);
      });
      const issuerOf = new Array(n).fill(null);
      const verifiedPairs = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          let issued = false;
          try {
            issued = certModels[i].certObj.checkIssued(certModels[j].certObj);
          } catch (_) {
            issued = false;
          }
          if (!issued) continue;
          let verified = false;
          try {
            verified = certModels[i].certObj.verify(certModels[j].certObj.publicKey) === true;
          } catch (_) {
            verified = false;
          }
          if (verified) {
            if (issuerOf[i] === null) issuerOf[i] = j;
            verifiedPairs.push({ child: i, issuer: j });
          }
        }
      }
      const isIssuer = new Set(verifiedPairs.map((p) => p.issuer));
      let leafIndex = null;
      for (let i = 0; i < n; i++) if (!isIssuer.has(i)) {
        leafIndex = i;
        break;
      }
      if (leafIndex === null) leafIndex = 0;
      const ordered = [];
      const visited = /* @__PURE__ */ new Set();
      let cur = leafIndex;
      let rootFound = false;
      while (cur !== null && !visited.has(cur)) {
        visited.add(cur);
        ordered.push(cur);
        const parent = issuerOf[cur];
        if (parent === null) {
          const last = certModels[cur];
          rootFound = last.selfSigned && last.isCA;
          if (!rootFound && certModels[cur].selfIssued && certModels[cur].isCA) rootFound = true;
          break;
        }
        cur = parent;
      }
      for (let i = 0; i < n; i++) {
        if (!visited.has(i) && !issues.some((x) => x.kind === "duplicate" && x.index === i)) {
          issues.push({ kind: "unlinked", index: i, detail: `\u7B2C ${i + 1} \u5F20\u8BC1\u4E66\u672A\u63A5\u5165\u94FE\uFF08\u5B64\u7ACB\u8BC1\u4E66\uFF1A\u65E2\u4E0D\u662F\u94FE\u4E0A\u4EFB\u4F55\u8BC1\u4E66\u7684\u7B7E\u53D1\u8005\uFF0C\u4E5F\u65E0\u7B7E\u53D1\u8005\uFF09` });
        }
      }
      const lastIdx = ordered[ordered.length - 1];
      if (lastIdx !== void 0) {
        const last = certModels[lastIdx];
        if (!last.selfIssued) {
          issues.push({
            kind: "missing-issuer",
            index: lastIdx,
            detail: `\u94FE\u5230\u300C${last.cn || last.subjectText}\u300D\u540E\u7F3A\u5C11\u5176\u7B7E\u53D1\u8005\uFF08${last.issuerText}\uFF09\u2014\u2014\u7F3A\u4E2D\u95F4\u8BC1\u4E66\u6216\u6839${last.aia.caIssuers.length ? `\uFF1B\u8BE5\u8BC1\u4E66 AIA \u63D0\u4F9B\u7B7E\u53D1\u8005\u4E0B\u8F7D\uFF1A${last.aia.caIssuers[0]}` : ""}`
          });
        }
      }
      if (verifiedPairs.length === 0 && n > 1) {
        issues.push({ kind: "unverified", index: null, detail: "\u94FE\u4E0A\u4EFB\u610F\u76F8\u90BB\u4E24\u5F20\u8BC1\u4E66\u90FD\u65E0\u6CD5\u76F8\u4E92\u9A8C\u7B7E\u2014\u2014\u94FE\u65E0\u6548\u6216\u8BC1\u4E66\u88AB\u7BE1\u6539" });
      }
      const expected = [...ordered].sort((a, b) => a - b).join(",");
      const actual = ordered.join(",");
      const pasteOrderWrong = ordered.length === n && expected === actual && ordered[0] !== 0 && n > 1;
      if (pasteOrderWrong) {
        issues.push({ kind: "order", index: null, detail: `\u7C98\u8D34\u987A\u5E8F\u4E0E\u94FE\u5E8F\u4E0D\u540C\uFF1A\u94FE\u5E94\u4E3A\u53F6\u2192\u4E2D\u95F4\u2192\u6839\uFF0C\u5F53\u524D\u7B2C 1 \u5F20\u662F\u300C${certModels[ordered[0]].cn || certModels[ordered[0]].subjectText}\u300D\uFF08\u5DF2\u81EA\u52A8\u6392\u5E8F\u5C55\u793A\uFF0C\u4E0B\u65B9\u6309\u94FE\u5E8F\uFF09` });
      }
      return { leafIndex, ordered, issues, rootFound, verifiedPairs };
    }
    function matchKey(certModel, keyPem) {
      let priv;
      try {
        priv = crypto2.createPrivateKey(keyPem);
      } catch (e) {
        const msg = String(e && e.message || e);
        const hint = /encrypted|decrypt/i.test(msg) ? "\u52A0\u5BC6\u79C1\u94A5\u9700\u8981\u53E3\u4EE4\uFF0C\u4E0D\u652F\u6301\u76F4\u63A5\u914D\u5BF9\u2014\u2014\u8BF7\u5148\u5BFC\u51FA\u65E0\u53E3\u4EE4\u7248\u672C" : `\u79C1\u94A5\u65E0\u6CD5\u89E3\u6790\uFF1A${msg.slice(0, 160)}`;
        return { matched: false, keyInfo: null, error: hint };
      }
      try {
        const pub = crypto2.createPublicKey(priv);
        const a = certModel.certObj.publicKey.export({ type: "spki", format: "der" });
        const b = pub.export({ type: "spki", format: "der" });
        const matched = a.length === b.length && crypto2.timingSafeEqual(a, b);
        return { matched, keyInfo: keyInfoOf(pub), error: matched ? null : "\u79C1\u94A5\u4E0E\u8BC1\u4E66\u4E0D\u914D\u5BF9\uFF08\u516C\u94A5\u4E0D\u4E00\u81F4\uFF09" };
      } catch (e) {
        return { matched: false, keyInfo: null, error: `\u6BD4\u8F83\u5931\u8D25\uFF1A${e && e.message || e}`.slice(0, 200) };
      }
    }
    function hostnameMatches(certModel, host) {
      if (!host || typeof host !== "string") return false;
      const h = String(host).trim().toLowerCase().replace(/\.$/, "");
      const isIp = /^[0-9.]+$/.test(h) && h.split(".").every((x) => x === "" || Number(x) <= 255) ? h.includes(".") ? 4 : 0 : /^[0-9a-f:]+:[0-9a-f:]*$/i.test(h) ? 6 : 0;
      if (isIp === 4 || isIp === 6) return certModel.san.ips.includes(h);
      for (const d of certModel.san.dns) {
        const dd = d.toLowerCase();
        if (dd === h) return true;
        if (dd.startsWith("*.")) {
          const rest = dd.slice(1);
          const head = h.slice(0, h.length - rest.length);
          if (h.endsWith(rest) && head.length > 0 && !head.includes(".")) return true;
        }
      }
      return false;
    }
    function daysLeftOf(certModel, now) {
      return Math.floor((new Date(certModel.notAfter).getTime() - now) / 864e5);
    }
    module2.exports = {
      parseCertificate,
      parseInput,
      stripCertObj,
      assembleChain,
      matchKey,
      hostnameMatches,
      keyInfoOf,
      sigAlgOf,
      daysLeftOf,
      SIG_ALG_OIDS
    };
  }
});

// shared/audit.js
var require_audit = __commonJS({
  "shared/audit.js"(exports2, module2) {
    "use strict";
    var { LIMITS } = require_engine_api();
    var VALIDITY_TIMELINE = [
      { since: "2026-03-15", maxDays: 200 },
      { since: "2027-03-15", maxDays: 100 },
      { since: "2029-03-15", maxDays: 47 }
    ];
    function currentMaxValidityDays(now) {
      let cur = { maxDays: 398, since: "2020-09-01" };
      for (const row of VALIDITY_TIMELINE) {
        if (now >= (/* @__PURE__ */ new Date(`${row.since}T00:00:00Z`)).getTime()) cur = row;
      }
      return cur;
    }
    function daysUntil(dateIso, now) {
      return Math.floor((new Date(dateIso).getTime() - now) / 864e5);
    }
    function auditCert(cm, { now, host = null, selfSignedOk = false, isLeafInChain = false } = {}) {
      const F = [];
      const daysLeft = daysUntil(cm.notAfter, now);
      const sev = daysLeft < 0 ? "expired" : daysLeft <= LIMITS.EXPIRY.CRIT_DAYS ? "crit" : daysLeft <= LIMITS.EXPIRY.WARN_DAYS ? "warn" : daysLeft <= LIMITS.EXPIRY.INFO_DAYS ? "info" : "ok";
      if (sev === "expired") {
        F.push({ id: "expiry.expired", severity: "crit", title: `\u8BC1\u4E66\u5DF2\u8FC7\u671F\uFF08${cm.notAfter.slice(0, 10)}\uFF09`, detail: `notAfter=${cm.notAfter}\uFF0C\u5DF2\u8FC7\u671F ${-daysLeft} \u5929\u3002TLS \u5BA2\u6237\u7AEF\u4F1A\u76F4\u63A5\u62D2\u7EDD\u3002`, fix: "\u7ACB\u5373\u66F4\u6362\u65B0\u8BC1\u4E66\uFF1B\u82E5\u5728\u76D1\u63A7\u91CC\uFF0C\u786E\u8BA4\u7EED\u671F\u6D41\u6C34\u7EBF\u4E3A\u4F55\u6CA1\u6709\u6267\u884C\u3002" });
      } else if (sev === "crit" || sev === "warn" || sev === "info") {
        const label = sev === "crit" ? `${daysLeft} \u5929\u5185\u5230\u671F` : `\u5269\u4F59 ${daysLeft} \u5929`;
        F.push({ id: "expiry.soon", severity: sev, title: `\u8BC1\u4E66\u5373\u5C06\u5230\u671F\uFF08${label}\uFF09`, detail: `notAfter=${cm.notAfter}`, fix: "\u786E\u8BA4\u81EA\u52A8\u7EED\u671F\u5728\u8DD1\uFF08ACME/\u5185\u90E8 CA \u8F6E\u6362\uFF09\uFF1B\u4E34\u671F\u8BC1\u4E66\u662F\u505C\u673A\u5934\u53F7\u6765\u6E90\u3002" });
      } else {
        F.push({ id: "expiry.ok", severity: "ok", title: `\u6709\u6548\u671F\u5145\u8DB3\uFF08\u5269\u4F59 ${daysLeft} \u5929\uFF09`, detail: `notAfter=${cm.notAfter}` });
      }
      const maxV = currentMaxValidityDays(now);
      if (!cm.selfSigned && cm.validityDays > maxV.maxDays) {
        F.push({ id: "validity.too-long", severity: "info", title: `\u6709\u6548\u671F ${cm.validityDays} \u5929\u8D85\u8FC7\u5F53\u524D\u4E0A\u9650 ${maxV.maxDays} \u5929`, detail: `CA/B Forum \u81EA ${maxV.since} \u8D77\u8981\u6C42\u516C\u7F51\u4FE1\u4EFB\u8BC1\u4E66 \u2264${maxV.maxDays} \u5929\uFF082027-03 \u2192 100 \u5929\uFF0C2029-03 \u2192 47 \u5929\uFF09\u3002\u957F\u6709\u6548\u671F\u8BC1\u4E66\u5728 2026-03-15 \u540E\u65B0\u7B7E\u7684\u516C\u7F51\u4F53\u7CFB\u91CC\u4F1A\u4E0D\u88AB\u4FE1\u4EFB\uFF1B\u5B58\u91CF\u8BC1\u4E66\u6682\u4E0D\u53D7\u5F71\u54CD\u3002`, fix: "\u7EED\u671F\u5468\u671F\u8DDF\u4E0A\u65B0\u89C4\uFF0C\u7F29\u77ED\u5230 \u2264200 \u5929\u5E76\u914D\u81EA\u52A8\u7EED\u671F\u3002" });
      }
      const ki = cm.keyInfo;
      if (ki.algo === "RSA") {
        if (ki.bits && ki.bits < 2048) {
          F.push({ id: "key.rsa-weak", severity: "crit", title: `RSA \u5BC6\u94A5 ${ki.bits} \u4F4D\u8FC7\u5F31`, detail: "RSA-1024 \u5DF2\u88AB\u4E3B\u6D41\u5BA2\u6237\u7AEF\u62D2\u7EDD\uFF08\u5B89\u5168\u5F3A\u5EA6 80 bit\uFF0C2013 \u5E74\u540E\u4E0D\u5408\u89C4\uFF09\u3002", fix: "\u6362 RSA \u22652048 \u6216 EC P-256 \u91CD\u65B0\u7B7E\u53D1\u3002" });
        } else if (ki.bits && ki.bits < 3072) {
          F.push({ id: "key.rsa-2048", severity: "ok", title: `RSA-${ki.bits}\uFF08\u53EF\u63A5\u53D7\uFF09`, detail: "\u22653072 \u4F4D\u6216 EC P-256 \u4EE5\u4E0A\u53EF\u5EF6\u957F\u5B89\u5168\u4F59\u91CF\u3002" });
        } else {
          F.push({ id: "key.rsa-strong", severity: "ok", title: `RSA-${ki.bits}`, detail: "" });
        }
      } else if (ki.algo === "EC") {
        if (ki.bits && ki.bits < 256) {
          F.push({ id: "key.ec-weak", severity: "warn", title: `EC \u66F2\u7EBF ${ki.curve}\uFF08${ki.bits} \u4F4D\uFF09\u504F\u5F31`, detail: "P-256 \u53CA\u4EE5\u4E0A\u662F\u5F53\u524D\u57FA\u7EBF\u3002", fix: "\u4F18\u5148 P-256/P-384\u3002" });
        } else {
          F.push({ id: "key.ec-ok", severity: "ok", title: `EC ${ki.curve}\uFF08${ki.bits} \u4F4D\uFF09`, detail: "" });
        }
      } else if (ki.algo === "Ed25519" || ki.algo === "Ed448") {
        F.push({ id: "key.ed-ok", severity: "ok", title: `${ki.algo}`, detail: "\u73B0\u4EE3\u7B7E\u540D\u7B97\u6CD5\u3002" });
      }
      const sa = (cm.sigAlg || "").toLowerCase();
      if (sa.includes("md5")) {
        F.push({ id: "sig.md5", severity: "crit", title: "MD5 \u7B7E\u540D\u7B97\u6CD5", detail: "MD5 \u65E9\u5DF2\u53EF\u78B0\u649E\uFF0C\u4EFB\u4F55\u73B0\u4EE3\u5BA2\u6237\u7AEF\u76F4\u63A5\u62D2\u7EDD\u3002", fix: "\u91CD\u65B0\u7B7E\u53D1\uFF08SHA-256 \u4EE5\u4E0A\uFF09\u3002" });
      } else if (sa.includes("sha1")) {
        F.push({ id: "sig.sha1", severity: "crit", title: "SHA-1 \u7B7E\u540D\u7B97\u6CD5", detail: "SHA-1 \u81EA 2016 \u5E74\u8D77\u4E0D\u88AB\u6D4F\u89C8\u5668\u4FE1\u4EFB\uFF08chosen-prefix \u78B0\u649E\u5DF2\u5B9E\u7528\u5316\uFF09\u3002", fix: "\u91CD\u65B0\u7B7E\u53D1\uFF08SHA-256 \u4EE5\u4E0A\uFF09\u3002" });
      } else if (sa) {
        F.push({ id: "sig.ok", severity: "ok", title: `\u7B7E\u540D\u7B97\u6CD5 ${cm.sigAlg}`, detail: "" });
      } else {
        F.push({ id: "sig.unknown", severity: "warn", title: "\u7B7E\u540D\u7B97\u6CD5\u672A\u80FD\u8BC6\u522B", detail: "DER \u89E3\u6790\u5F02\u5E38\u6216\u975E\u5E38\u89C4\u7ED3\u6784\u3002" });
      }
      if (!cm.hasSan) {
        F.push({ id: "san.missing", severity: "warn", title: "\u8BC1\u4E66\u6CA1\u6709 SAN\uFF08subjectAltName\uFF09\u6269\u5C55", detail: "\u73B0\u4EE3\u5BA2\u6237\u7AEF\uFF08Chrome/Node \u226512/Java \u65B0\u7248\uFF09\u53EA\u770B SAN\uFF0CCN \u5DF2\u88AB\u5FFD\u7565\u2014\u2014\u5373\u4F7F CN \u6B63\u786E\u4E5F\u4F1A\u62A5 HOSTNAME_MISMATCH\u3002", fix: "\u91CD\u65B0\u7B7E\u53D1\u5E76\u5E26\u4E0A SAN\u3002" });
      }
      if (cm.hasSan && cm.san.dns.some((d) => d.startsWith("*.")) && cm.san.dns.some((d) => d.split(".").length > 3 && d.startsWith("*.*"))) {
        F.push({ id: "san.multi-wildcard", severity: "info", title: "\u5B58\u5728\u591A\u7EA7\u901A\u914D\u7B26", detail: "\u591A\u6570\u5BA2\u6237\u7AEF\u53EA\u63A5\u53D7\u6700\u5DE6\u4E00\u4E2A *\uFF08RFC 6125\uFF09\uFF0C*.*.example.com \u5F62\u6001\u517C\u5BB9\u6027\u5DEE\u3002" });
      }
      if (host && cm.hasSan) {
        const { hostnameMatches } = require_certmodel();
        if (!hostnameMatches(cm, host)) {
          F.push({ id: "san.host-mismatch", severity: "crit", title: `SAN \u4E0D\u5305\u542B\u300C${host}\u300D`, detail: `SAN \u5217\u8868\uFF1A${[...cm.san.dns, ...cm.san.ips].join(", ") || "\uFF08\u7A7A\uFF09"}\u3002\u8FD9\u4F1A\u76F4\u63A5\u89E6\u53D1 ERR_TLS_CERT_ALTNAME_INVALID / NET::ERR_CERT_COMMON_NAME_INVALID\u3002`, fix: "\u7B7E\u53D1\u8BC1\u4E66\u65F6\u628A\u8BE5\u4E3B\u673A\u540D/IP \u52A0\u8FDB SAN\u3002" });
        } else {
          F.push({ id: "san.host-match", severity: "ok", title: `SAN \u5339\u914D ${host}`, detail: "" });
        }
      }
      if (cm.isCA && isLeafInChain) {
        F.push({ id: "ca.as-leaf", severity: "warn", title: "\u53F6\u8BC1\u4E66\u4F4D\u7F6E\u4E0A\u662F\u4E00\u5F20 CA \u8BC1\u4E66\uFF08basicConstraints CA:TRUE\uFF09", detail: "\u7AEF\u70B9\u5E94\u4F7F\u7528\u53F6\u8BC1\u4E66\uFF1BCA \u8BC1\u4E66\u5F53\u670D\u52A1\u5668\u8BC1\u4E66\u662F\u5E38\u89C1\u8BEF\u914D\uFF08\u591A\u89C1\u4E8E\u628A\u6839\u8BC1\u4E66\u76F4\u63A5\u6302\u4E0A\u670D\u52A1\uFF09\u3002", fix: "\u4E3A\u8BE5\u670D\u52A1\u7B7E\u53D1\u4E13\u7528\u53F6\u8BC1\u4E66\u3002" });
      }
      if (!cm.isCA && cm.keyUsage.length > 0 && !cm.keyUsage.some((k) => /keyencipher|digitalSignature|keyagree/i.test(k.replace(/\s/g, "")))) {
        F.push({ id: "ku.leaf", severity: "warn", title: "keyUsage \u4E0E\u670D\u52A1\u5668\u8BC1\u4E66\u4E0D\u5339\u914D", detail: `keyUsage=${cm.keyUsage.join(", ")}\uFF1BTLS \u670D\u52A1\u5668\u8BC1\u4E66\u901A\u5E38\u9700\u8981 digitalSignature\uFF08RSA \u8FD8\u9700 keyEncipherment\uFF09\u3002` });
      }
      if (cm.isCA && cm.keyUsage.length > 0 && !cm.keyUsage.some((k) => /keycertsign/i.test(k.replace(/\s/g, "")))) {
        F.push({ id: "ku.ca", severity: "warn", title: "CA \u8BC1\u4E66\u7F3A\u5C11 keyCertSign \u7528\u9014\u4F4D", detail: `keyUsage=${cm.keyUsage.join(", ")}\uFF1B\u4E25\u683C\u5BA2\u6237\u7AEF\u4F1A\u62D2\u7EDD\u7528\u5B83\u7B7E\u53D1\u8BC1\u4E66\u3002` });
      }
      if (cm.version < 3) {
        F.push({ id: "cert.v1", severity: "warn", title: `X.509 v${cm.version} \u8BC1\u4E66`, detail: "v1/v2 \u65E0\u6269\u5C55\u5B57\u6BB5\uFF0C\u73B0\u4EE3 PKI \u57FA\u7EBF\u8981\u6C42 v3\u3002" });
      }
      if (cm.serial && cm.serial.replace(/^0+/, "").length < 16) {
        F.push({ id: "cert.serial-entropy", severity: "info", title: "\u5E8F\u5217\u53F7\u71B5\u4E0D\u8DB3\uFF08<64 \u4F4D\uFF09", detail: "CA/B Forum \u8981\u6C42\u5E8F\u5217\u53F7 \u226564 bits \u71B5\uFF1B\u5C0F\u6574\u6570\u5E8F\u5217\u53F7\u591A\u89C1\u4E8E\u624B\u5DE5/\u73A9\u5177\u7B7E\u53D1\u6D41\u7A0B\u3002" });
      }
      if (cm.selfSigned && !selfSignedOk) {
        F.push({ id: "cert.self-signed", severity: "info", title: "\u81EA\u7B7E\u8BC1\u4E66", detail: "\u7B7E\u53D1\u8005=\u4F7F\u7528\u8005\u3002\u516C\u7F51\u5BA2\u6237\u7AEF\u9ED8\u8BA4\u62D2\u7EDD\uFF1B\u5185\u7F51/\u5F00\u53D1\u73AF\u5883\u9700\u663E\u5F0F\u4FE1\u4EFB\uFF08\u5BFC\u5165\u7CFB\u7EDF/\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93\uFF0C\u6216 NODE_EXTRA_CA_CERTS\uFF09\u3002" });
      }
      return F;
    }
    function auditChain(chain, cms, { now } = {}) {
      const F = [];
      for (const iss of chain.issues) {
        if (iss.kind === "duplicate") {
          F.push({ id: "chain.duplicate", severity: "warn", title: "\u94FE\u4E2D\u5B58\u5728\u91CD\u590D\u8BC1\u4E66", detail: iss.detail, fix: "\u53BB\u6389\u91CD\u590D\u5757\uFF08\u591A\u89C1\u4E8E\u6839\u8BC1\u4E66\u88AB\u91CD\u590D\u7C98\u8D34\uFF09\u3002" });
        } else if (iss.kind === "missing-issuer") {
          F.push({ id: "chain.missing-issuer", severity: "warn", title: "\u94FE\u4E0D\u5B8C\u6574\uFF1A\u7F3A\u5C11\u7B7E\u53D1\u8005\u8BC1\u4E66", detail: `${iss.detail}\u3002\u6D4F\u89C8\u5668\u53EF\u7ECF AIA \u81EA\u52A8\u8865\u94FE\u6240\u4EE5\u300C\u7F51\u9875\u80FD\u5F00\u300D\uFF0C\u4F46 openssl/\u591A\u6570\u7A0B\u5E8F\u8BED\u8A00/\u722C\u866B\u4E0D\u4F1A\u8865\u2014\u2014\u8FD9\u6B63\u662F\u300C\u6D4F\u89C8\u5668\u6B63\u5E38\u3001curl \u62A5\u9519\u300D\u7684\u7ECF\u5178\u6839\u56E0\u3002`, fix: "\u670D\u52A1\u7AEF\u53D1\u9001\u5B8C\u6574\u94FE\uFF08\u53F6\u2192\u4E2D\u95F4\u2192\u6839\uFF09\uFF0C\u6216\u628A\u4E2D\u95F4\u8BC1\u4E66\u5E76\u5165\u8BC1\u4E66\u6587\u4EF6\u540E\u91CD\u8F7D\u670D\u52A1\u3002" });
        } else if (iss.kind === "unverified") {
          F.push({ id: "chain.unverified", severity: "info", title: "\u94FE\u4E0A\u8BC1\u4E66\u95F4\u65E0\u6CD5\u76F8\u4E92\u9A8C\u7B7E", detail: `${iss.detail}\uFF08\u82E5\u8865\u5168\u4E2D\u95F4\u8BC1\u4E66\u540E\u4ECD\u5982\u6B64\uFF0C\u624D\u53EF\u80FD\u662F\u94FE\u65E0\u6548/\u88AB\u7BE1\u6539\uFF09`, fix: "\u5148\u8865\u5168\u94FE\u518D\u590D\u68C0\u3002" });
        } else if (iss.kind === "unlinked") {
          F.push({ id: "chain.unlinked", severity: "warn", title: "\u5B58\u5728\u672A\u5165\u94FE\u8BC1\u4E66", detail: iss.detail });
        } else if (iss.kind === "order") {
          F.push({ id: "chain.order", severity: "info", title: "\u94FE\u5E8F\u5DF2\u81EA\u52A8\u4FEE\u6B63", detail: iss.detail, fix: "\u5EFA\u8BAE\u6E90\u6587\u4EF6\u4E5F\u6309 \u53F6\u2192\u4E2D\u95F4\u2192\u6839 \u987A\u5E8F\u4FDD\u5B58\u3002" });
        }
      }
      if (chain.ordered.length && cms.length > 1) {
        const rootIdx = chain.ordered[chain.ordered.length - 1];
        const root = cms[rootIdx];
        if (root && root.selfSigned && root.isCA) {
          F.push({ id: "chain.root-self-signed", severity: "info", title: "\u6839\u4E3A\u81EA\u7B7E CA", detail: "\u516C\u7F51\u4FE1\u4EFB\u9700\u8981\u6839\u5728\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93\u91CC\uFF1B\u79C1\u6709 CA \u573A\u666F\u5C5E\u6B63\u5E38\u3002" });
        }
      }
      return F;
    }
    function worstSeverity(findings) {
      if (findings.some((f) => f.severity === "crit")) return "crit";
      if (findings.some((f) => f.severity === "warn")) return "warn";
      if (findings.some((f) => f.severity === "info")) return "info";
      return "ok";
    }
    module2.exports = { auditCert, auditChain, worstSeverity, currentMaxValidityDays, VALIDITY_TIMELINE };
  }
});

// shared/diagnose.js
var require_diagnose = __commonJS({
  "shared/diagnose.js"(exports2, module2) {
    "use strict";
    var RULES = [
      {
        id: "self-signed-leaf",
        codes: ["DEPTH_ZERO_SELF_SIGNED_CERT"],
        re: /self[- ]signed certificate/i,
        title: "\u7AEF\u70B9\u4F7F\u7528\u81EA\u7B7E\u8BC1\u4E66\uFF0C\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93\u4E2D\u6CA1\u6709\u5B83",
        cause: "\u670D\u52A1\u5668\u76F4\u63A5\u628A\u4E00\u5F20\u300C\u7B7E\u53D1\u8005=\u81EA\u5DF1\u300D\u7684\u8BC1\u4E66\u53D1\u7ED9\u4E86\u5BA2\u6237\u7AEF\uFF1B\u8BE5\u8BC1\u4E66\u4E0D\u5728\u5BA2\u6237\u7AEF\u7684\u4FE1\u4EFB\u5217\u8868\u91CC\u3002",
        fixes: [
          "\u5185\u7F51/\u5F00\u53D1\u573A\u666F\u5C5E\u9884\u671F\uFF1A\u628A\u8BE5\u8BC1\u4E66\uFF08\u6216\u5176 CA \u6839\uFF09\u5BFC\u5165\u7CFB\u7EDF/\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93",
          "Node \u8FDB\u7A0B\uFF1ANODE_EXTRA_CA_CERTS=/path/to/root.pem \u6307\u5411\u8BE5\u6839\u8BC1\u4E66",
          "curl\uFF1A--cacert root.pem\uFF1B\u6D4F\u89C8\u5668\uFF1A\u5BFC\u5165\u300C\u53D7\u4FE1\u4EFB\u7684\u6839\u8BC1\u4E66\u9881\u53D1\u673A\u6784\u300D",
          "\u82E5\u8FD9\u662F\u516C\u7F51\u751F\u4EA7\u7AEF\u70B9\uFF1A\u6539\u4E3A\u6B63\u89C4 CA \u7B7E\u53D1\uFF08Let's Encrypt \u7B49\uFF09\uFF0C\u4E0D\u8981\u7528\u81EA\u7B7E"
        ]
      },
      {
        id: "self-signed-in-chain",
        codes: ["SELF_SIGNED_CERT_IN_CHAIN"],
        re: /self[- ]signed certificate in (the )?certificate chain/i,
        title: "\u8BC1\u4E66\u94FE\u4E2D\u5305\u542B\u672A\u53D7\u4FE1\u7684\u81EA\u7B7E\u8BC1\u4E66",
        cause: "\u670D\u52A1\u5668\u53D1\u9001\u7684\u94FE\u91CC\u6709\u4E00\u7EA7\u7B7E\u53D1\u8005\uFF08\u901A\u5E38\u662F\u6839\u6216\u4E2D\u95F4\uFF09\u662F\u81EA\u7B7E\u7684\uFF0C\u4E14\u4E0D\u5728\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93\u4E2D\u2014\u2014\u5178\u578B\u4E8E\u79C1\u6709 CA \u7B7E\u53D1\u7684\u94FE\u3002",
        fixes: [
          "\u628A\u79C1\u6709 CA \u7684\u6839\u8BC1\u4E66\u5BFC\u5165\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93\uFF08\u800C\u4E0D\u662F\u53EA\u4FE1\u53F6\u8BC1\u4E66\uFF09",
          "Node\uFF1ANODE_EXTRA_CA_CERTS \u6307\u5411\u79C1\u6709\u6839\uFF1BJava\uFF1Akeytool -importcert \u5230 cacerts",
          "\u786E\u8BA4\u670D\u52A1\u5668\u53D1\u9001\u7684\u94FE\u987A\u5E8F\u6B63\u786E\uFF08\u53F6\u2192\u4E2D\u95F4\u2192\u6839\uFF09\uFF0C\u522B\u628A\u6839\u53D1\u4E24\u6B21"
        ]
      },
      {
        id: "untrusted-leaf",
        codes: ["UNABLE_TO_VERIFY_LEAF_SIGNATURE"],
        re: /unable to verify (the )?first certificate|unable to verify leaf/i,
        title: "\u53F6\u8BC1\u4E66\u65E0\u6CD5\u9A8C\u8BC1\u5230\u53D7\u4FE1\u6839\uFF08\u6700\u5E38\u89C1\uFF1A\u670D\u52A1\u7AEF\u5C11\u53D1\u4E86\u4E2D\u95F4\u8BC1\u4E66\uFF09",
        cause: "\u5BA2\u6237\u7AEF\u62FF\u5230\u53F6\u8BC1\u4E66\u540E\uFF0C\u672C\u5730\u548C\u670D\u52A1\u5668\u90FD\u6CA1\u63D0\u4F9B\u901A\u5411\u53D7\u4FE1\u6839\u7684\u8DEF\u5F84\u3002\u6D4F\u89C8\u5668\u4F1A\u7ECF AIA \u81EA\u52A8\u8865\u4E2D\u95F4\u8BC1\u4E66\uFF0C\u6240\u4EE5\u300C\u7F51\u9875\u80FD\u5F00\u3001curl/Node/Java \u62A5\u9519\u300D\u3002",
        fixes: [
          "\u628A\u4E2D\u95F4\u8BC1\u4E66\u5E76\u5165\u670D\u52A1\u5668\u8BC1\u4E66\u6587\u4EF6\uFF08\u53F6\u2192\u4E2D\u95F4\u2192\u6839 \u987A\u5E8F\uFF09\uFF0C\u91CD\u8F7D Web \u670D\u52A1",
          "\u7528\u672C\u63D2\u4EF6\u300C\u89E3\u6790\u300D\u9875\u7C98\u8D34\u4F60\u7684\u94FE\uFF0C\u770B\u300C\u7F3A\u4E2D\u95F4\u8BC1\u4E66\u300D\u63D0\u793A\u548C AIA \u4E0B\u8F7D\u5730\u5740",
          "Nginx\uFF1Assl_certificate \u4F7F\u7528 fullchain.pem \u800C\u975E cert.pem",
          "\u786E\u8BA4\u6CA1\u6709\u6F0F\u6389\u4EA4\u53C9\u7B7E\u540D\u7684\u65E7\u4E2D\u95F4\u8BC1\u4E66\uFF08\u8001\u5BA2\u6237\u7AEF\u9700\u8981\uFF09"
        ]
      },
      {
        id: "issuer-not-found-locally",
        codes: ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY"],
        re: /unable to get (local )?issuer certificate/i,
        title: "\u5BA2\u6237\u7AEF\u627E\u4E0D\u5230\u7B7E\u53D1\u8005\u8BC1\u4E66\uFF08\u4FE1\u4EFB\u5E93\u7F3A\u6839\u6216 CA \u73AF\u5883\uFF09",
        cause: "\u94FE\u7684\u4E0A\u5C42\u7B7E\u53D1\u8005\u65E2\u4E0D\u5728\u670D\u52A1\u5668\u53D1\u9001\u7684\u94FE\u91CC\uFF0C\u4E5F\u4E0D\u5728\u5BA2\u6237\u7AEF\u4FE1\u4EFB\u5E93\u4E2D\u3002\u4F01\u4E1A\u4EE3\u7406\uFF08Zscaler/Fortinet \u7B49 TLS \u62E6\u622A\uFF09\u573A\u666F\u9AD8\u53D1\u3002",
        fixes: [
          "\u516C\u53F8\u4EE3\u7406\u73AF\u5883\uFF1A\u5BFC\u5165\u4F01\u4E1A\u6839\u8BC1\u4E66\u5230\u7CFB\u7EDF\u4E0E\u8FD0\u884C\u65F6\u4FE1\u4EFB\u5E93\uFF08NODE_EXTRA_CA_CERTS \u7B49\uFF09",
          "\u81EA\u5EFA CA\uFF1A\u628A\u6839\u8BC1\u4E66\u52A0\u5165\u4FE1\u4EFB\u5E93",
          "Node\uFF1A\u786E\u8BA4 NODE_EXTRA_CA_CERTS \u8DEF\u5F84\u5B58\u5728\u4E14\u8FDB\u7A0B\u91CD\u542F\u8FC7",
          "\u68C0\u67E5\u670D\u52A1\u5668\u662F\u5426\u53D1\u9001\u5B8C\u6574\u94FE\uFF08\u672C\u63D2\u4EF6\u300C\u8BCA\u65AD\u300D\u9875\u770B\u5B9E\u9645\u6536\u5230\u7684\u94FE\uFF09"
        ]
      },
      {
        id: "issuer-not-found",
        codes: ["UNABLE_TO_GET_ISSUER_CERT"],
        re: /unable to get issuer certificate(?! locally)/i,
        title: "\u94FE\u5185\u90E8\u7F3A\u5C11\u7B7E\u53D1\u8005\uFF08\u670D\u52A1\u7AEF\u6CA1\u53D1\u5168\u94FE\uFF09",
        cause: "\u4E0E UNABLE_TO_GET_ISSUER_CERT_LOCALLY \u76F8\u5BF9\uFF1A\u94FE\u91CC\u67D0\u4E00\u7EA7\u7684\u7B7E\u53D1\u8005\u4E0D\u5728\u300C\u5DF2\u6536\u5230\u7684\u94FE\u300D\u5185\uFF0C\u4E14\u4E0D\u5728\u672C\u5730\u4FE1\u4EFB\u5E93\u3002",
        fixes: ["\u8865\u5168\u670D\u52A1\u5668\u7AEF\u8BC1\u4E66\u94FE\uFF08\u53F6\u2192\u4E2D\u95F4\u2192\u6839\uFF09", "\u7528\u672C\u63D2\u4EF6\u300C\u89E3\u6790\u300D\u9875\u6838\u5BF9\u94FE\u4E0A\u7F3A\u54EA\u4E00\u7EA7"]
      },
      {
        id: "cert-expired",
        codes: ["CERT_HAS_EXPIRED", "ERR_TLS_CERT_DATE_INVALID", "ERR_CERT_DATE_INVALID"],
        re: /certificate has expired|cert(ificate)? (is )?expired|certificate (is )?not yet valid/i,
        title: "\u8BC1\u4E66\u8FC7\u671F\u6216\u5C1A\u672A\u751F\u6548",
        cause: "notAfter \u5DF2\u8FC7\uFF08\u6216\u5BA2\u6237\u7AEF\u65F6\u949F\u9519\u4E71\u5BFC\u81F4 notBefore \u672A\u5230\uFF09\u3002",
        fixes: [
          "\u7EED\u671F\u5E76\u91CD\u8F7D\u8BC1\u4E66\uFF1B\u7528\u672C\u63D2\u4EF6\u300C\u76EF\u5B88\u300D\u9875\u628A\u8BE5\u7AEF\u70B9\u52A0\u5165\u5230\u671F\u76EF\u5B88",
          "\u82E5\u8BC1\u4E66\u660E\u660E\u6CA1\u8FC7\u671F\uFF1A\u68C0\u67E5\u672C\u673A\u65F6\u949F\uFF08NTP\uFF09\u2014\u2014\u65F6\u949F\u504F\u5DEE\u4F1A\u89E6\u53D1\u65E5\u671F\u6821\u9A8C\u5931\u8D25",
          "\u521A\u7EED\u671F\u4ECD\u62A5\u9519\uFF1A\u786E\u8BA4\u670D\u52A1\u5668\u771F\u7684\u91CD\u8F7D\u4E86\u65B0\u8BC1\u4E66\uFF08\u672C\u63D2\u4EF6\u8BCA\u65AD\u9875\u770B\u5B9E\u9645 notAfter\uFF09"
        ]
      },
      {
        id: "hostname-mismatch",
        codes: ["ERR_TLS_CERT_ALTNAME_INVALID", "ERR_CERT_COMMON_NAME_INVALID", "HOSTNAME_MISMATCH"],
        re: /hostname\/IP (does not match|mismatch)|doesn'?t match (the )?certificate|altname/i,
        title: "\u8BC1\u4E66 SAN \u4E0D\u5305\u542B\u6240\u8BBF\u95EE\u7684\u4E3B\u673A\u540D/IP",
        cause: "\u73B0\u4EE3\u5BA2\u6237\u7AEF\u53EA\u770B subjectAltName\uFF1ASAN \u91CC\u6CA1\u6709\u76EE\u6807\u4E3B\u673A\u540D\uFF08\u6216 IP \u6CA1\u6709\u4EE5 IP \u5F62\u5F0F\u8FDB SAN\uFF09\u3002",
        fixes: [
          "\u91CD\u65B0\u7B7E\u53D1\uFF1A\u628A\u6B63\u786E\u4E3B\u673A\u540D/IP \u5199\u8FDB SAN\uFF08IP \u5FC5\u987B\u7528 IP \u6761\u76EE\uFF0C\u4E0D\u80FD\u5199 CN\uFF09",
          "\u8BBF\u95EE\u8DEF\u5F84\u4E0E\u8BC1\u4E66\u4E0D\u4E00\u81F4\uFF1A\u7528 https://<\u8BC1\u4E66\u91CC\u7684\u540D\u5B57>/ \u800C\u4E0D\u662F\u88F8 IP",
          "\u901A\u914D\u7B26\u8BC1\u4E66 *.example.com \u4E0D\u5339\u914D example.com \u672C\u8EAB\uFF0C\u4E5F\u4E0D\u5339\u914D\u4E8C\u7EA7\u5B50\u57DF",
          "\u7528\u672C\u63D2\u4EF6\u300C\u89E3\u6790\u300D\u9875\u6838\u5BF9 SAN \u5217\u8868"
        ]
      },
      {
        id: "wrong-version-number",
        codes: ["ERR_SSL_WRONG_VERSION_NUMBER"],
        re: /wrong version number/i,
        title: "\u8BE5\u7AEF\u53E3\u4E0A\u4E0D\u662F TLS\uFF08\u6216\u7248\u672C\u6781\u8001\uFF09",
        cause: "\u5BF9\u7AEF\u4E0D\u662F SSL/TLS \u670D\u52A1\uFF1A\u6700\u5E38\u89C1\u662F\u660E\u6587 HTTP \u7AEF\u53E3\u3001SMTP 25/587\uFF08\u9700 STARTTLS\uFF09\u3001\u6216\u628A HTTPS \u914D\u5230\u4E86\u9519\u8BEF\u7AEF\u53E3\u3002",
        fixes: [
          "\u786E\u8BA4\u7AEF\u53E3\u53F7\uFF1AHTTPS=443\uFF1BSMTP \u7528 465(\u9690\u5F0FTLS) \u6216 25/587(\u660E\u6587+STARTTLS)",
          "\u628A\u76EE\u6807\u6362\u6210\u771F\u5B9E TLS \u7AEF\u53E3\u518D\u63A2\u6D4B",
          "\u81EA\u7814\u670D\u52A1\uFF1A\u786E\u8BA4\u786E\u5B9E\u8C03\u7528\u4E86 TLS accept\uFF08\u660E\u6587\u7AEF\u53E3\u6536\u5230 TLS ClientHello \u4F1A\u56DE\u8FD9\u4E2A\u9519\uFF09"
        ]
      },
      {
        id: "unsupported-protocol",
        codes: ["ERR_SSL_UNSUPPORTED_PROTOCOL", "ERR_SSL_VERSION_OR_CIPHER_MISMATCH"],
        re: /unsupported protocol|version or cipher mismatch|no protocols available|protocol version/i,
        title: "\u5BA2\u6237\u7AEF\u4E0E\u670D\u52A1\u5668\u65E0\u5171\u540C\u534F\u8BAE\u7248\u672C\u6216\u5BC6\u7801\u5957\u4EF6",
        cause: "\u8981\u4E48\u670D\u52A1\u5668\u53EA\u5F00\u8001\u534F\u8BAE\uFF08TLS 1.0/1.1 \u5DF2\u88AB\u73B0\u4EE3\u5BA2\u6237\u7AEF\u7981\u7528\uFF09\uFF0C\u8981\u4E48\u5BA2\u6237\u7AEF\u53EA\u5F00\u65B0\u534F\u8BAE\u800C\u670D\u52A1\u5668\u592A\u8001\uFF0C\u8981\u4E48\u5957\u4EF6\u96C6\u5408\u5B8C\u5168\u9519\u5F00\uFF08\u5982\u4EC5\u56FD\u5BC6/\u4EC5 ChaCha20\uFF09\u3002",
        fixes: [
          "\u670D\u52A1\u5668\u592A\u8001\uFF1A\u542F\u7528 TLS 1.2+\uFF08TLS 1.3 \u66F4\u4F73\uFF09\uFF0C\u8001\u534F\u8BAE\u5E94\u5173\u505C\u800C\u975E\u517C\u5BB9",
          "\u5BA2\u6237\u7AEF\u592A\u8001\uFF1A\u5347\u7EA7\u8FD0\u884C\u65F6\uFF08\u8001 JDK/\u8001 OpenSSL \u4EC5\u652F\u6301\u88AB\u6DD8\u6C70\u7684\u534F\u8BAE\uFF09",
          "\u786E\u8BA4\u4E2D\u95F4\u8BBE\u5907\uFF08WAF/\u53CD\u4EE3\uFF09\u6CA1\u6709\u5265\u6389 TLS 1.2+ \u5957\u4EF6"
        ]
      },
      {
        id: "no-cipher-match",
        codes: ["ERR_SSL_NO_CIPHER_MATCH"],
        re: /no cipher match|no shared cipher/i,
        title: "\u6CA1\u6709\u5171\u540C\u5BC6\u7801\u5957\u4EF6",
        cause: "\u53CC\u65B9\u652F\u6301\u7684\u5BC6\u7801\u5957\u4EF6\u96C6\u5408\u65E0\u4EA4\u96C6\uFF08\u5E38\u89C1\uFF1A\u670D\u52A1\u5668\u53EA\u914D\u4E86\u5F31\u5957\u4EF6\u88AB\u5BA2\u6237\u7AEF\u5B89\u5168\u7EA7\u522B\u62D2\u7EDD\uFF0C\u6216\u4EC5\u56FD\u5BC6\u5355\u8F68\uFF09\u3002",
        fixes: ["\u670D\u52A1\u5668 cipher \u914D\u7F6E\u6062\u590D\u4E3B\u6D41\u96C6\u5408\uFF08ECDHE+AESGCM/CHACHA20\uFF09", "\u68C0\u67E5 OpenSSL security level \u4E0E 1024 \u4F4D DH \u53C2\u6570"]
      },
      {
        id: "dh-too-small",
        codes: ["ERR_SSL_DH_KEY_TOO_SMALL"],
        re: /dh key too small|dh (server )?key/i,
        title: "\u670D\u52A1\u5668 DH \u53C2\u6570\u8FC7\u5F31\uFF08<2048 \u4F4D\uFF09",
        cause: "Logjam \u540E\u73B0\u4EE3\u5BA2\u6237\u7AEF\u62D2\u7EDD 1024 \u4F4D DHE \u5957\u4EF6\u3002",
        fixes: ["\u670D\u52A1\u5668\u751F\u6210 2048+ \u4F4D dhparam \u5E76\u914D\u7F6E", "\u6216\u7981\u7528 DHE \u4EC5\u7528 ECDHE"]
      },
      {
        id: "max-depth",
        codes: ["ERR_TLS_MAX_DEPTH_EXCEEDED"],
        re: /max depth exceeded/i,
        title: "\u8BC1\u4E66\u94FE\u8D85\u8FC7\u6700\u5927\u6DF1\u5EA6\uFF08>9 \u7EA7\uFF09",
        cause: "\u94FE\u5F02\u5E38\u5197\u957F\uFF0C\u51E0\u4E4E\u603B\u662F\u914D\u9519\uFF08\u628A\u6839\u5E93\u6574\u4E32\u53D1\u8FC7\u6765\u4E86\uFF09\u3002",
        fixes: ["\u53EA\u53D1\u9001 \u53F6\u2192\u4E2D\u95F4\u2192\u6839 \u7684\u6700\u77ED\u94FE", "\u6392\u67E5\u662F\u5426\u628A truststore \u6574\u5305\u8D34\u8FDB\u4E86\u8BC1\u4E66\u6587\u4EF6"]
      },
      {
        id: "econnrefused",
        codes: ["ECONNREFUSED"],
        re: /ECONNREFUSED/i,
        title: "\u8FDE\u63A5\u88AB\u62D2\u7EDD\uFF08\u7AEF\u53E3\u6CA1\u6709\u670D\u52A1\u5728\u542C\uFF09",
        cause: "TCP \u5C42\u5373\u5931\u8D25\uFF0C\u4E0E TLS \u65E0\u5173\u3002",
        fixes: ["\u786E\u8BA4 host:port \u6B63\u786E\u3001\u670D\u52A1\u5DF2\u542F\u52A8", "\u68C0\u67E5\u9632\u706B\u5899/\u5B89\u5168\u7EC4", "\u672C\u673A\u670D\u52A1\u786E\u8BA4\u76D1\u542C\u5730\u5740\uFF08127.0.0.1 vs 0.0.0.0\uFF09"]
      },
      {
        id: "etimedout",
        codes: ["ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"],
        re: /ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i,
        title: "\u8FDE\u63A5\u8D85\u65F6/\u4E0D\u53EF\u8FBE\uFF08\u7F51\u7EDC\u5C42\uFF09",
        cause: "TCP \u5C42\u5931\u8D25\uFF1A\u8DEF\u7531\u4E0D\u901A\u3001\u9632\u706B\u5899\u4E22\u5305\u3001VPN \u672A\u8FDE\u3002",
        fixes: ["\u5148 ping/telnet \u8BE5\u7AEF\u53E3", "\u68C0\u67E5 VPN/\u9632\u706B\u5899", "\u4E91\u4E3B\u673A\u67E5\u5B89\u5168\u7EC4\u5165\u7AD9\u89C4\u5219"]
      },
      {
        id: "enotfound",
        codes: ["ENOTFOUND"],
        re: /ENOTFOUND|getaddrinfo/i,
        title: "\u57DF\u540D\u89E3\u6790\u5931\u8D25",
        cause: "DNS \u67E5\u4E0D\u5230\u8BE5\u4E3B\u673A\u540D\u3002",
        fixes: ["\u68C0\u67E5\u62FC\u5199\u4E0E hosts \u914D\u7F6E", "\u5185\u7F51\u57DF\u540D\u9700\u8981\u5185\u7F51 DNS\uFF08\u6216\u5199 hosts\uFF09", "\u7CFB\u7EDF DNS \u670D\u52A1\u5668\u53EF\u7528\u6027"]
      },
      {
        id: "econnreset",
        codes: ["ECONNRESET", "EPIPE"],
        re: /ECONNRESET|EPIPE/i,
        title: "\u8FDE\u63A5\u88AB\u5BF9\u7AEF\u91CD\u7F6E",
        cause: "\u63E1\u624B\u65E9\u671F\u88AB\u5207\u65AD\uFF1A\u5E38\u89C1\u4E8E\u4E2D\u95F4\u8BBE\u5907\u62E6\u622A\u3001\u670D\u52A1\u5D29\u6E83\u3001\u6216\u5BF9\u660E\u6587\u7AEF\u53E3\u53D1 TLS \u88AB\u7ACB\u5373\u5173\u95ED\u3002",
        fixes: ["\u6362\u7AEF\u53E3/\u534F\u8BAE\u91CD\u8BD5", "\u6392\u67E5\u900F\u660E\u4EE3\u7406/WAF", "\u770B\u670D\u52A1\u5668\u7AEF\u9519\u8BEF\u65E5\u5FD7\u5BF9\u5E94\u65F6\u95F4\u70B9"]
      },
      {
        id: "eproto",
        codes: ["EPROTO"],
        re: /EPROTO|wrong version|packet length|record layer/i,
        title: "\u534F\u8BAE\u9519\u8BEF\uFF08\u5BF9\u7AEF\u53EF\u80FD\u4E0D\u662F TLS\uFF0C\u6216\u4E2D\u95F4\u8BBE\u5907\u7BE1\u6539\uFF09",
        cause: "TLS \u8BB0\u5F55\u5C42\u8BFB\u5230\u4E86\u4E0D\u7B26\u5408\u534F\u8BAE\u7684\u6570\u636E\uFF1A\u660E\u6587\u7AEF\u53E3\u3001HTTP \u4EE3\u7406\u8FD4\u56DE\u4E86 HTML\u3001\u6216\u8BBE\u5907\u505A\u4E86\u62E6\u622A\u3002",
        fixes: ["\u786E\u8BA4\u7AEF\u53E3\u4E0A\u771F\u7684\u662F TLS \u670D\u52A1", "\u516C\u53F8\u7F51\u7EDC\u91CC\u786E\u8BA4\u4EE3\u7406\u89C4\u5219\uFF08curl -v \u770B\u8FD4\u56DE\u4F53\uFF09", "\u8BD5\u76F4\u8FDE/\u6362\u7F51\u7EDC\u6392\u9664\u4E2D\u95F4\u8BBE\u5907"]
      },
      {
        id: "cert-revoked",
        codes: ["ERR_TLS_CERT_REVOKED", "ERR_CERT_REVOKED"],
        re: /revoked/i,
        title: "\u8BC1\u4E66\u5DF2\u88AB\u540A\u9500",
        cause: "CRL/OCSP \u62A5\u544A\u8BE5\u5E8F\u5217\u53F7\u5DF2\u88AB\u7B7E\u53D1 CA \u540A\u9500\u3002",
        fixes: ["\u91CD\u65B0\u7B7E\u53D1\u5E76\u90E8\u7F72", "\u786E\u8BA4\u4E0D\u662F\u8BEF\u62A5\uFF08CA \u540A\u9500\u9519\u5355\uFF09"]
      },
      {
        id: "generic-cert-verify",
        codes: ["ERR_CERT_AUTHORITY_INVALID", "ERR_SSL_CA_MD_TOO_WEAK", "ERR_SSL_INVALID_CA"],
        re: /CERT_AUTHORITY_INVALID|ca md too weak|invalid ca/i,
        title: "\u8BC1\u4E66\u9881\u53D1\u673A\u6784\u65E0\u6548\u6216\u4E0D\u53D7\u4FE1\u4EFB",
        cause: "\u9A8C\u8BC1\u94FE\u8DEF\u65AD\u5728 CA \u4FA7\uFF1A\u6839\u4E0D\u53D7\u4FE1\u3001CA \u7B7E\u540D\u7B97\u6CD5\u88AB\u7981\u3001\u6216 CA \u6269\u5C55\u4E0D\u5408\u6CD5\u3002",
        fixes: ["\u5BFC\u5165\u6B63\u786E\u7684\u6839\u8BC1\u4E66\u5230\u4FE1\u4EFB\u5E93", "CA \u7528 SHA-256 \u4EE5\u4E0A\u91CD\u65B0\u7B7E\u53D1", "\u4F01\u4E1A\u4EE3\u7406\u62E6\u622A\u573A\u666F\u5BFC\u5165\u4F01\u4E1A\u6839\uFF08NODE_EXTRA_CA_CERTS / \u7CFB\u7EDF\u94A5\u5319\u4E32\uFF09"]
      }
    ];
    var FALLBACK = {
      id: "fallback",
      title: "\u672A\u80FD\u7CBE\u786E\u8BC6\u522B\u7684 TLS/\u8BC1\u4E66\u9519\u8BEF",
      cause: null,
      fixes: [
        "\u7528\u672C\u63D2\u4EF6\u300C\u8BCA\u65AD\u300D\u9875\u5BF9\u540C\u4E00\u7AEF\u70B9\u505A\u771F\u5B9E\u63E1\u624B\u63A2\u6D4B\uFF0C\u62FF\u5230\u7ED3\u6784\u5316\u9519\u8BEF\u7801\u4E0E\u5B8C\u6574\u94FE",
        "\u628A\u5B8C\u6574\u9519\u8BEF\u6587\u672C\uFF08\u542B error code\uFF09\u62FF\u5230 AI \u5BF9\u8BDD\u91CC\u8BA9 AI \u7ED3\u5408\u672C\u63D2\u4EF6\u5DE5\u5177\u6392\u67E5"
      ]
    };
    var SEVERITY = {
      "self-signed-leaf": "warn",
      "self-signed-in-chain": "warn",
      "untrusted-leaf": "crit",
      "issuer-not-found-locally": "warn",
      "issuer-not-found": "crit",
      "cert-expired": "crit",
      "hostname-mismatch": "crit",
      "wrong-version-number": "warn",
      "unsupported-protocol": "warn",
      "no-cipher-match": "warn",
      "dh-too-small": "warn",
      "max-depth": "warn",
      "econnrefused": "warn",
      "etimedout": "warn",
      "enotfound": "warn",
      "econnreset": "warn",
      "eproto": "warn",
      "cert-revoked": "crit",
      "generic-cert-verify": "warn",
      fallback: "warn"
    };
    function diagnoseError(input) {
      let code = "";
      let message = "";
      if (typeof input === "string") {
        message = input.replace(/_/g, " ");
        const m = input.match(/\b([A-Z0-9_]*(?:CERT|SSL|TLS|SOCKET|CONN)[A-Z0-9_]*)\b/);
        if (m) code = m[1];
      } else if (input && typeof input === "object") {
        code = String(input.code || "");
        message = String(input.message || input.error || "");
      }
      if (code) {
        const byCode = RULES.find((r) => r.codes.includes(code));
        if (byCode) return { ...byCode, severity: SEVERITY[byCode.id] || "warn", matched: "code", input: { code, message } };
      }
      if (message) {
        const byRe = RULES.find((r) => r.re && r.re.test(message));
        if (byRe) return { ...byRe, severity: SEVERITY[byRe.id] || "warn", matched: "pattern", input: { code, message } };
      }
      return { ...FALLBACK, severity: SEVERITY.fallback, matched: "fallback", input: { code, message }, fixes: FALLBACK.fixes.slice(0, 6) };
    }
    function renderDiagnosis(d) {
      const lines = [`\u6839\u56E0\uFF1A${d.title}`, d.cause ? `\u89E3\u91CA\uFF1A${d.cause}` : null, "\u5EFA\u8BAE\uFF1A", ...d.fixes.map((f, i) => `  ${i + 1}. ${f}`)].filter(Boolean);
      return lines.join("\n");
    }
    module2.exports = { RULES, diagnoseError, renderDiagnosis, FALLBACK };
  }
});

// service/probe.js
var require_probe = __commonJS({
  "service/probe.js"(exports2, module2) {
    "use strict";
    var tls = require("tls");
    var net = require("net");
    var { X509Certificate } = require("crypto");
    var { parseCertificate } = require_certmodel();
    function rawHandshake({ host, port, servername, rejectUnauthorized, timeoutMs, alpn }) {
      return new Promise((resolve) => {
        let settled = false;
        let socket;
        const done = (r) => {
          if (settled) return;
          settled = true;
          try {
            socket.destroy();
          } catch (_) {
          }
          resolve(r);
        };
        const opts = {
          host,
          port,
          rejectUnauthorized,
          timeout: Math.max(500, timeoutMs),
          ALPNProtocols: alpn,
          // IP 直连时不自动设 servername（SNI 不允许 IP；显式 serverName 由调用方传入）
          ...servername ? { servername } : {}
        };
        socket = tls.connect(opts);
        socket.once("secureConnect", () => {
          const chainRaw = [];
          const seenFp = /* @__PURE__ */ new Set();
          let c = null;
          try {
            c = socket.getPeerCertificate(true);
          } catch (_) {
            c = null;
          }
          while (c && c.raw) {
            let fp = "";
            try {
              fp = new X509Certificate(c.raw).fingerprint256;
            } catch (_) {
              fp = `raw${chainRaw.length}`;
            }
            if (seenFp.has(fp)) break;
            seenFp.add(fp);
            chainRaw.push(c.raw);
            c = c.issuerCertificate;
            if (c && !c.raw) break;
          }
          const info = {
            ok: true,
            authorized: socket.authorized === true,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            protocol: socket.getProtocol(),
            cipher: socket.getCipher() ? { name: socket.getCipher().name, version: socket.getCipher().version } : null,
            alpn: socket.alpnProtocol || null,
            ephemeral: socket.getEphemeralKeyInfo ? socket.getEphemeralKeyInfo() : null,
            chainRaw
          };
          done(info);
        });
        socket.once("error", (err) => {
          done({ ok: false, error: { code: err && err.code ? err.code : "ERR_TLS", message: String(err && err.message || err) } });
        });
        socket.once("timeout", () => {
          done({ ok: false, error: { code: "ETIMEDOUT", message: `TLS \u63E1\u624B\u8D85\u65F6\uFF08${Math.round(timeoutMs / 1e3)}s\uFF09\u2014\u2014\u7F51\u7EDC\u4E0D\u901A\u3001\u9632\u706B\u5899\u4E22\u5305\u6216\u670D\u52A1\u4E0D\u54CD\u5E94` } });
        });
      });
    }
    async function tlsProbe({ host, port, serverName = "", timeoutMs = 8e3, now = Date.now() }) {
      const t0 = Date.now();
      const isIp = net.isIP(host) !== 0;
      const sni = serverName || (isIp ? "" : host);
      const alpn = ["h2", "http/1.1"];
      const strict = await rawHandshake({ host, port, servername: sni || void 0, rejectUnauthorized: true, timeoutMs, alpn });
      let relaxed = null;
      if (!strict.ok) {
        relaxed = await rawHandshake({ host, port, servername: sni || void 0, rejectUnauthorized: false, timeoutMs, alpn });
      } else {
        relaxed = strict;
      }
      const chain = [];
      for (const raw of relaxed && relaxed.chainRaw || []) {
        try {
          const body = `-----BEGIN CERTIFICATE-----
${raw.toString("base64").replace(/(.{64})/g, "$1\n")}
-----END CERTIFICATE-----
`;
          chain.push(parseCertificate(body, chain.length, now));
        } catch (_) {
        }
      }
      const { assembleChain } = require_certmodel();
      const chainAudit = chain.length ? assembleChain(chain) : { leafIndex: null, ordered: [], issues: [], rootFound: false, verifiedPairs: [] };
      let hostMatch = { host, matched: null, reason: "\u65E0\u94FE\u53EF\u6838\u5BF9" };
      if (chain.length) {
        const { hostnameMatches } = require_certmodel();
        const leaf = chain[chainAudit.leafIndex != null ? chainAudit.leafIndex : 0];
        const matched = hostnameMatches(leaf, host) || (sni && sni !== host ? hostnameMatches(leaf, sni) : false);
        hostMatch = {
          host,
          matched,
          reason: matched ? "SAN \u5305\u542B\u76EE\u6807\u4E3B\u673A" : "SAN \u4E0D\u5305\u542B\u76EE\u6807\u4E3B\u673A\uFF08IP \u9700\u8981\u663E\u5F0F IP SAN\uFF09"
        };
      }
      const ok = strict.ok === true;
      return {
        /** verified = 系统信任库校验通过（探测本身成功与否看 connected；防与 API 外层 ok 撞名） */
        verified: ok,
        target: { host, port, serverName: sni || null },
        ms: Date.now() - t0,
        strict: strict.ok ? { ok: true, authorized: strict.authorized } : { ok: false, error: strict.error },
        connected: Boolean(relaxed && relaxed.ok),
        relaxed: relaxed && relaxed.ok ? {
          protocol: relaxed.protocol,
          cipher: relaxed.cipher,
          alpn: relaxed.alpn,
          ephemeral: relaxed.ephemeral,
          authorized: relaxed.authorized,
          authorizationError: relaxed.authorizationError
        } : null,
        chain,
        chainAudit,
        hostMatch,
        error: strict.ok ? null : strict.error || relaxed && relaxed.error || null
      };
    }
    module2.exports = { tlsProbe, rawHandshake };
  }
});

// service/logic.js
var require_logic = __commonJS({
  "service/logic.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var api2 = require_engine_api();
    var certmodel2 = require_certmodel();
    var audit2 = require_audit();
    var { diagnoseError, renderDiagnosis } = require_diagnose();
    var { tlsProbe } = require_probe();
    function userErr(msg) {
      return Object.assign(new Error(msg), { user: true });
    }
    function readPemInput(body, field = "pem") {
      const v = body[field];
      if (v == null || v === "") throw userErr(`\u9700\u8981 ${field}\uFF08PEM \u6587\u672C\uFF09\u6216 ${field}File\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09`);
      if (typeof v !== "string") throw userErr(`${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
      if (Buffer.byteLength(v, "utf8") > api2.LIMITS.PEM_MAX_BYTES) throw userErr("PEM \u8F93\u5165\u8D85\u8FC7\u4E0A\u9650 2MB");
      return v;
    }
    function readPemFile(fp, field) {
      if (!fp || typeof fp !== "string") throw userErr(`\u9700\u8981 ${field}\uFF08PEM \u6587\u672C\uFF09\u6216 ${field}File\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09`);
      if (!path2.isAbsolute(fp)) throw userErr(`${field}File \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84`);
      if (fp.includes("\0")) throw userErr(`${field}File \u542B\u975E\u6CD5\u5B57\u7B26`);
      let st;
      try {
        st = fs2.statSync(fp);
      } catch (_) {
        throw userErr(`\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB\uFF1A${fp}`);
      }
      if (st.size > api2.LIMITS.PEM_MAX_BYTES) throw userErr("\u6587\u4EF6\u8D85\u8FC7 2MB \u4E0A\u9650");
      return fs2.readFileSync(fp, "utf8");
    }
    function doParse(body, now) {
      const pem = body.pem != null ? readPemInput(body, "pem") : readPemFile(body.pemFile, "pem");
      const parsed = certmodel2.parseInput(pem, now);
      const host = typeof body.host === "string" && body.host.trim() ? body.host.trim().toLowerCase() : null;
      const certs = parsed.certs.map((cm) => ({
        ...certmodel2.stripCertObj(cm),
        findings: audit2.auditCert(cm, { now, host, isLeafInChain: parsed.certs.length > 0 })
      }));
      for (const c of certs) c.findingsSeverity = audit2.worstSeverity(c.findings);
      const chain = parsed.certs.length > 1 ? certmodel2.assembleChain(parsed.certs) : null;
      const chainFindings = chain ? audit2.auditChain(chain, parsed.certs, { now }) : [];
      let keyMatch = null;
      const keyPem = body.key != null ? readPemInput(body, "key") : body.keyFile ? readPemFile(body.keyFile, "key") : null;
      if (keyPem && parsed.certs.length) {
        keyMatch = certmodel2.matchKey(parsed.certs[0], keyPem);
      } else if (keyPem && !parsed.certs.length) {
        keyMatch = { matched: false, keyInfo: null, error: "\u6CA1\u6709\u53EF\u914D\u5BF9\u7684\u8BC1\u4E66\uFF08\u8F93\u5165\u91CC\u6CA1\u6709 CERTIFICATE \u5757\uFF09" };
      }
      if (parsed.certs.length === 0 && parsed.pubkeys.length === 0) {
        const first = parsed.errors[0];
        throw userErr(`\u6CA1\u6709\u89E3\u6790\u51FA\u8BC1\u4E66\u6216\u516C\u94A5\uFF1A${first ? first.error : "\u8F93\u5165\u4E2D\u6CA1\u6709 PEM \u5757\uFF08\u9700\u8981 -----BEGIN CERTIFICATE----- \u7B49\uFF09"}`);
      }
      return {
        kind: {
          certs: parsed.certs.length,
          pubkeys: parsed.pubkeys.length,
          privkeys: parsed.privkeys,
          encryptedKeys: parsed.encryptedKeys,
          csrBlocks: parsed.csrBlocks,
          crlBlocks: parsed.crlBlocks
        },
        pubkeys: parsed.pubkeys,
        csrNote: parsed.csrBlocks ? `\u68C0\u6D4B\u5230 ${parsed.csrBlocks} \u4E2A CSR\uFF08\u8BC1\u4E66\u8BF7\u6C42\uFF09\uFF1A\u5F53\u524D\u7248\u672C\u4E0D\u89E3\u6790 CSR \u5185\u5BB9\uFF0C\u7B7E\u53D1\u540E\u628A\u8BC1\u4E66\u7C98\u8FDB\u6765\u5373\u53EF\u4F53\u68C0` : null,
        crlNote: parsed.crlBlocks ? `\u68C0\u6D4B\u5230 ${parsed.crlBlocks} \u4E2A CRL\uFF08\u540A\u9500\u6E05\u5355\uFF09\uFF1A\u5F53\u524D\u7248\u672C\u4E0D\u89E3\u6790` : null,
        encryptedKeyNote: parsed.encryptedKeys ? `\u68C0\u6D4B\u5230 ${parsed.encryptedKeys} \u4E2A\u52A0\u5BC6\u79C1\u94A5\uFF1A\u4E0D\u652F\u6301\u5E26\u53E3\u4EE4\u914D\u5BF9\uFF0C\u8BF7\u5148\u89E3\u5BC6` : null,
        privkeyNote: parsed.privkeys && !keyPem ? `\u68C0\u6D4B\u5230 ${parsed.privkeys} \u4E2A\u79C1\u94A5\u5757\uFF1A\u586B key/keyFile \u53EF\u505A\u8BC1\u4E66\u2194\u79C1\u94A5\u914D\u5BF9\u68C0\u67E5\uFF1B\u79C1\u94A5\u53EA\u5728\u5185\u5B58\u6BD4\u5BF9\u540E\u5373\u5F03` : null,
        certs,
        chain: chain ? { leafIndex: chain.leafIndex, ordered: chain.ordered, issues: chain.issues, verifiedPairs: chain.verifiedPairs, rootFound: chain.rootFound } : null,
        chainFindings,
        chainSeverity: chainFindings.length ? audit2.worstSeverity(chainFindings) : null,
        keyMatch,
        errors: parsed.errors
      };
    }
    function resolveTarget(body) {
      let host;
      let port;
      if (body.target != null) {
        const nt = api2.normalizeTarget(body.target);
        if (!nt.ok) throw userErr(nt.error);
        host = nt.host;
        port = nt.port;
      } else if (typeof body.host === "string" && body.host.trim()) {
        const nt = api2.normalizeTarget(`${body.host.trim()}:${body.port || 443}`);
        if (!nt.ok) throw userErr(nt.error);
        host = nt.host;
        port = nt.port;
      } else {
        throw userErr('\u9700\u8981 target\uFF08"host:port"\uFF09\u6216 host\uFF08+port \u7F3A\u7701 443\uFF09');
      }
      return { host, port };
    }
    async function doProbe(body, now) {
      const { host, port } = resolveTarget(body);
      if (body.serverName != null && typeof body.serverName !== "string") throw userErr("serverName \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
      const timeoutMs = api2.clampTimeoutMs(body.timeoutMs);
      const r = await tlsProbe({ host, port, serverName: body.serverName || "", timeoutMs, now });
      const diagnosis = [];
      if (r.error) {
        const d = diagnoseError(r.error);
        diagnosis.push({ from: "error", id: d.id, severity: d.severity, title: d.title, cause: d.cause, fixes: d.fixes.slice(0, api2.LIMITS.FIXES_MAX), matched: d.matched });
      }
      for (const f of audit2.auditChain(r.chainAudit, r.chain, { now })) {
        if (f.severity !== "ok") diagnosis.push({ from: "chain", id: f.id, severity: f.severity, title: f.title, cause: f.detail, fixes: f.fix ? [f.fix] : [] });
      }
      if (r.hostMatch.matched === false) {
        const leaf = r.chain[r.chainAudit.leafIndex != null ? r.chainAudit.leafIndex : 0];
        const f = audit2.auditCert(leaf, { now, host }).find((x) => x.id === "san.host-mismatch");
        if (f) diagnosis.push({ from: "host", id: f.id, severity: f.severity, title: f.title, cause: f.detail, fixes: f.fix ? [f.fix] : [] });
      }
      const expiries = r.chain.map((c) => ({ cn: c.cn, notAfter: c.notAfter, daysLeft: c.daysLeft, severity: api2.expirySeverity(c.daysLeft) }));
      return {
        ...certmodel2.stripCertObj(r),
        chain: r.chain.map((c) => ({ ...certmodel2.stripCertObj(c), findings: audit2.auditCert(c, { now, host, isLeafInChain: true }) })),
        diagnosis,
        expiries,
        severity: diagnosis.length ? audit2.worstSeverity(diagnosis) : "ok"
      };
    }
    function doDiagnose(body) {
      let input;
      if (typeof body.code === "string" && body.code.trim() && !body.text && !body.message && !body.error) {
        input = { code: body.code.trim() };
      } else {
        input = body.text || body.message || body.error || body.code;
      }
      if (!input || typeof input === "object" && !Object.keys(input).length) {
        throw userErr("\u9700\u8981 code\uFF08Node \u9519\u8BEF\u7801\uFF09\u3001message/text\uFF08\u9519\u8BEF\u6587\u672C\uFF09\u6216 error \u5BF9\u8C61");
      }
      const d = diagnoseError(input);
      return { rule: d.id, matched: d.matched, severity: d.severity, title: d.title, cause: d.cause, fixes: d.fixes.slice(0, api2.LIMITS.FIXES_MAX), rendered: renderDiagnosis(d), input: d.input };
    }
    module2.exports = { doParse, doProbe, doDiagnose, resolveTarget, userErr };
  }
});

// service/selftest.js
var require_selftest = __commonJS({
  "service/selftest.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var https = require("https");
    var certmodel2 = require_certmodel();
    var audit2 = require_audit();
    var { diagnoseError } = require_diagnose();
    var { tlsProbe } = require_probe();
    function fixturePem(name) {
      return fs2.readFileSync(path2.join(__dirname, "fixtures", name), "utf8");
    }
    async function doSelftest2() {
      const results = [];
      const ok = (name, cond, detail) => results.push({ name, pass: Boolean(cond), detail: String(detail || "").slice(0, 160) });
      const now = Date.now();
      const cm = certmodel2;
      try {
        const good = cm.parseCertificate(fixturePem("good-leaf.pem"), 0, now);
        ok("good-leaf \u89E3\u6790 CN/SAN", good.cn === "good.test" && good.san.dns.includes("good.test") && good.san.ips.includes("127.0.0.1"), `${good.cn} ${good.san.dns.join(",")}`);
        ok("good-leaf \u5269\u4F59\u5929\u6570\u5408\u7406", good.daysLeft > 100 && good.daysLeft < 160, `daysLeft=${good.daysLeft}`);
        ok("good-leaf \u5BC6\u94A5 RSA-2048", good.keyInfo.algo === "RSA" && good.keyInfo.bits === 2048, JSON.stringify(good.keyInfo));
        ok("good-leaf \u7B7E\u540D SHA-256", /sha256/i.test(good.sigAlg || ""), good.sigAlg);
      } catch (e) {
        ok("good-leaf \u89E3\u6790", false, e.message);
      }
      try {
        const exp = cm.parseCertificate(fixturePem("expired.pem"), 0, now);
        ok("expired \u5224\u5B9A\u8FC7\u671F", exp.daysLeft < 0, `daysLeft=${exp.daysLeft}`);
        const f = audit2.auditCert(exp, { now }).find((x) => x.id === "expiry.expired");
        ok("expired \u4F53\u68C0 crit", f && f.severity === "crit", f && f.title);
      } catch (e) {
        ok("expired \u5224\u5B9A", false, e.message);
      }
      try {
        const full = cm.parseInput(fixturePem("chain-full.pem"), now);
        const ch = cm.assembleChain(full.certs);
        ok("\u94FE\u62FC\u88C5 3 \u5F20\u6709\u5E8F", ch.ordered.length === 3 && ch.issues.filter((x) => x.kind !== "order").length === 0, JSON.stringify(ch.ordered));
        ok("\u94FE\u627E\u5230\u81EA\u7B7E\u6839", ch.rootFound === true, `rootFound=${ch.rootFound}`);
      } catch (e) {
        ok("\u94FE\u62FC\u88C5", false, e.message);
      }
      try {
        const mixed = cm.parseInput(fixturePem("chain-full-mixed.pem"), now);
        const ch2 = cm.assembleChain(mixed.certs);
        ok("\u4E71\u5E8F\u94FE\u81EA\u52A8\u6392\u5E8F", ch2.ordered.length === 3 && mixed.certs[ch2.ordered[0]].cn === "localhost", JSON.stringify(ch2.ordered));
      } catch (e) {
        ok("\u4E71\u5E8F\u94FE", false, e.message);
      }
      try {
        const good = cm.parseCertificate(fixturePem("good-leaf.pem"), 0, now);
        const m1 = cm.matchKey(good, fixturePem("unmatched-key.pem"));
        ok("\u4E0D\u914D\u5BF9\u79C1\u94A5\u88AB\u62D2", m1.matched === false, m1.error || "");
      } catch (e) {
        ok("\u914D\u5BF9(\u4E0D\u5339\u914D)", false, e.message);
      }
      const d1 = diagnoseError({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
      ok("\u9519\u8BEF\u6620\u5C04: \u7F3A\u4E2D\u95F4\u8BC1\u4E66", d1.id === "untrusted-leaf", d1.id);
      const d2 = diagnoseError("NET::ERR_CERT_COMMON_NAME_INVALID");
      ok("\u9519\u8BEF\u6620\u5C04: \u6D4F\u89C8\u5668 SAN \u62A5\u9519", d2.id === "hostname-mismatch", d2.id);
      const d3 = diagnoseError("ECONNREFUSED 127.0.0.1:443");
      ok("\u9519\u8BEF\u6620\u5C04: \u8FDE\u63A5\u62D2\u7EDD", d3.id === "econnrefused", d3.id);
      let server2 = null;
      try {
        const fullChain = fixturePem("chain-full.pem");
        const key = fixturePem("chain-leaf.key");
        await new Promise((resolve, reject) => {
          server2 = https.createServer({ key, cert: fullChain }, (req, res) => {
            res.writeHead(200);
            res.end("ok");
          });
          server2.on("error", reject);
          server2.listen(0, "127.0.0.1", resolve);
        });
        const port = server2.address().port;
        const probe2 = await tlsProbe({ host: "127.0.0.1", port, timeoutMs: 5e3, now });
        ok("hermetic \u63E1\u624B\u8FDE\u901A", probe2.connected === true, JSON.stringify(probe2.error));
        ok("hermetic \u94FE 3 \u5F20", probe2.chain.length === 3, `chain=${probe2.chain.length}`);
        ok("hermetic \u4E25\u683C\u6821\u9A8C\u5931\u8D25(\u81EA\u7B7E\u94FE)", probe2.verified === false && probe2.strict.error && /SELF_SIGNED|UNABLE_TO/.test(probe2.strict.error.code), JSON.stringify(probe2.strict.error));
        ok("hermetic \u534F\u8BAE\u8BC6\u522B", /TLS/.test(String(probe2.relaxed && probe2.relaxed.protocol)), String(probe2.relaxed && probe2.relaxed.protocol));
        const dm = diagnoseError(probe2.strict.error);
        ok("hermetic \u9519\u8BEF\u53EF\u8BCA\u65AD", dm.id !== "fallback", dm.id);
      } catch (e) {
        ok("hermetic \u670D\u52A1\u5668", false, e.message);
      } finally {
        if (server2) {
          try {
            server2.close();
          } catch (_) {
          }
        }
      }
      try {
        const leaf = cm.parseCertificate(fixturePem("chain-leaf.pem"), 0, now);
        ok("host \u5339\u914D localhost", cm.hostnameMatches(leaf, "localhost") === true);
        ok("host \u5339\u914D 127.0.0.1", cm.hostnameMatches(leaf, "127.0.0.1") === true);
        ok("host \u4E0D\u5339\u914D other", cm.hostnameMatches(leaf, "other.test") === false);
        ok("\u901A\u914D\u7B26\u5339\u914D", cm.hostnameMatches({ san: { dns: ["*.example.com"], ips: [], emails: [], uris: [], others: [] } }, "a.example.com") === true);
        ok("\u901A\u914D\u7B26\u4E0D\u8DE8\u7EA7", cm.hostnameMatches({ san: { dns: ["*.example.com"], ips: [], emails: [], uris: [], others: [] } }, "a.b.example.com") === false);
      } catch (e) {
        ok("host \u5339\u914D", false, e.message);
      }
      const pass = results.filter((r) => r.pass).length;
      const fail2 = results.length - pass;
      return { pass, fail: fail2, total: results.length, results };
    }
    module2.exports = { doSelftest: doSelftest2, fixturePem };
  }
});

// service/kvclient.js
var require_kvclient = __commonJS({
  "service/kvclient.js"(exports2, module2) {
    "use strict";
    var http2 = require("http");
    var fs2 = require("fs");
    var path2 = require("path");
    var os = require("os");
    var crypto2 = require("crypto");
    var SCAN_PORTS = 25;
    var HEALTH_TIMEOUT_MS = 1200;
    var REQUEST_TIMEOUT_MS = 3e4;
    function md5(s) {
      return crypto2.createHash("md5").update(String(s)).digest("hex");
    }
    function configCandidates(appConfigDir) {
      const cands = [];
      for (const anchor of [
        process.env.APPDATA ? path2.join(process.env.APPDATA, "Polaris", "anchor.json") : "",
        path2.join(os.homedir(), ".config", "Polaris", "anchor.json"),
        path2.join(os.homedir(), ".polaris", "anchor.json")
      ]) {
        try {
          const a = JSON.parse(fs2.readFileSync(anchor, "utf8"));
          if (a && typeof a.dataRoot === "string" && a.dataRoot) {
            cands.push(path2.join(a.dataRoot, "config.json"));
          }
        } catch (_) {
        }
      }
      if (appConfigDir) cands.push(path2.join(appConfigDir, "config.json"));
      if (process.env.APPDATA) cands.push(path2.join(process.env.APPDATA, "Polaris", "config.json"));
      cands.push(path2.join(os.homedir(), ".config", "Polaris", "config.json"));
      cands.push(path2.join(os.homedir(), ".polaris", "config.json"));
      return cands;
    }
    function loadWebConfig(appConfigDir) {
      for (const p of configCandidates(appConfigDir)) {
        try {
          const root = JSON.parse(fs2.readFileSync(p, "utf8"));
          const web = root.web || {};
          if (typeof web.port === "number" && web.port > 0) {
            return { host: web.host || "", port: web.port, token: web.token || "" };
          }
        } catch (_) {
        }
      }
      return null;
    }
    function healthOnce(host, port) {
      return new Promise((resolve) => {
        const req = http2.get(
          { hostname: host, port, path: "/api/health", timeout: HEALTH_TIMEOUT_MS },
          (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          }
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
    }
    async function resolveEndpoint(appConfigDir) {
      const envHost = process.env.POLARIS_HOST || "";
      const envPort = parseInt(process.env.POLARIS_PORT || "", 10);
      if (envHost && Number.isFinite(envPort)) {
        return { host: envHost, port: envPort, token: process.env.POLARIS_TOKEN || "", via: "env" };
      }
      const cfg = loadWebConfig(appConfigDir);
      const cfgHost = cfg && cfg.host || "";
      const host = cfgHost && cfgHost !== "0.0.0.0" ? cfgHost : "127.0.0.1";
      const basePort = cfg ? cfg.port : 3e3;
      const token2 = cfg ? cfg.token : "";
      for (let i = 0; i < SCAN_PORTS; i++) {
        if (await healthOnce(host, basePort + i)) {
          return { host, port: basePort + i, token: token2, via: "scan" };
        }
      }
      return { host, port: basePort, token: token2, via: "fallback" };
    }
    function createKvClient2(opts) {
      const log2 = opts && opts.log || (() => {
      });
      const appConfigDir = opts && opts.appConfigDir || "";
      let endpointPromise = null;
      let endpoint = null;
      function getEndpoint(force) {
        if (!endpointPromise || force) {
          endpointPromise = resolveEndpoint(appConfigDir).then((ep) => {
            endpoint = ep;
            log2("info", `bridge endpoint: ${ep.host}:${ep.port} (via ${ep.via}${ep.token ? ", authed" : ", noauth"})`);
            return ep;
          });
        }
        return endpointPromise;
      }
      function dispatch(target, payload, { retries = 2, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
        const attempt = (n) => getEndpoint().then((ep) => new Promise((resolve, reject) => {
          const data = JSON.stringify({ req: { target, payload } });
          const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          };
          if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
          const req = http2.request(
            {
              hostname: ep.host,
              port: ep.port,
              path: "/api/router-dispatch",
              method: "POST",
              headers,
              timeout: timeoutMs
            },
            (res) => {
              let body = "";
              res.on("data", (c) => {
                body += c;
              });
              res.on("end", () => {
                try {
                  const parsed = JSON.parse(body);
                  resolve(parsed);
                } catch (_) {
                  reject(new Error(`bridge \u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.statusCode}\uFF09`));
                }
              });
            }
          );
          req.on("timeout", () => {
            req.destroy(new Error("bridge timeout"));
          });
          req.on("error", (e) => {
            if (n < retries) {
              log2("warn", `dispatch \u91CD\u8BD5 ${n + 1}/${retries}: ${e.message}`);
              setTimeout(() => attempt(n + 1).then(resolve, reject), 300 * Math.pow(2, n));
            } else reject(e);
          });
          req.write(data);
          req.end();
        }));
        return attempt(0);
      }
      async function dispatchOk(target, payload, opt) {
        const res = await dispatch(target, payload, opt);
        if (!res || res.ok !== true) {
          throw new Error(res && res.error || `${target} dispatch \u5931\u8D25`);
        }
        return res.result;
      }
      async function kvGet(key) {
        const r = await dispatchOk("cap.kv", { action: "get", key });
        return r && r.value !== void 0 ? r.value : null;
      }
      async function kvSet(key, value) {
        await dispatchOk("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
        return true;
      }
      async function kvDel(key) {
        await dispatchOk("cap.kv", { action: "delete", key });
        return true;
      }
      async function kvKeys() {
        const r = await dispatchOk("cap.kv", { action: "list" });
        return r && Array.isArray(r.keys) ? r.keys : [];
      }
      return {
        dispatch,
        dispatchOk,
        kvGet,
        kvSet,
        kvDel,
        kvKeys,
        endpoint: () => endpoint,
        refreshEndpoint: () => getEndpoint(true)
      };
    }
    module2.exports = { createKvClient: createKvClient2, resolveEndpoint, loadWebConfig, md5 };
  }
});

// service/main-src.js
var http = require("http");
var path = require("path");
var crypto = require("crypto");
var fs = require("fs");
var api = require_engine_api();
var certmodel = require_certmodel();
var audit = require_audit();
var logic = require_logic();
var probe = require_probe();
var { doSelftest } = require_selftest();
var { createKvClient } = require_kvclient();
var PLUGIN_ID = "cert-lens";
var VERSION = "0.1.0";
var LOG_MAX = 512 * 1024;
var BODY_LIMIT = 4 * 1024 * 1024 + 1024 * 1024;
var PORT = parseInt(process.argv[2] || "", 10) || 0;
var APP_CONFIG_DIR = process.argv[3] || "";
var logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + ".log") : "";
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${(/* @__PURE__ */ new Date()).toISOString()} ${msg}`;
  if (level === "debug") return;
  process.stderr.write(line + "\n");
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > LOG_MAX) fs.renameSync(logFile, logFile + ".old");
    } catch (_) {
    }
    fs.appendFileSync(logFile, line + "\n");
  } catch (_) {
  }
}
var kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
var KEY_META = PLUGIN_ID + ".meta";
var KEY_ENDPOINTS = PLUGIN_ID + ".endpoints";
var KEY_STATE = PLUGIN_ID + ".watch.state";
var token = process.env.CERT_LENS_TEST_TOKEN || crypto.randomBytes(16).toString("hex");
async function watchList() {
  const endpoints = await kv.kvGet(KEY_ENDPOINTS) || [];
  const state = await kv.kvGet(KEY_STATE) || null;
  return { endpoints: Array.isArray(endpoints) ? endpoints : [], state };
}
async function watchAdd(body) {
  const nt = api.normalizeTarget(body.target != null ? body.target : `${body.host || ""}:${body.port || 443}`);
  if (!nt.ok) throw logic.userErr(nt.error);
  const list = await watchList();
  const item = {
    host: nt.host,
    port: nt.port,
    serverName: typeof body.serverName === "string" ? body.serverName : "",
    label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : `${nt.host}:${nt.port}`,
    addedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const dup = list.endpoints.find((e) => e.host === item.host && e.port === item.port && (e.serverName || "") === (item.serverName || ""));
  if (dup) return { ...list, added: false, note: "\u7AEF\u70B9\u5DF2\u5B58\u5728" };
  if (list.endpoints.length >= api.LIMITS.WATCH_MAX_ENDPOINTS) throw logic.userErr(`\u76EF\u5B88\u7AEF\u70B9\u5DF2\u8FBE\u4E0A\u9650 ${api.LIMITS.WATCH_MAX_ENDPOINTS}`);
  list.endpoints.push(item);
  await kv.kvSet(KEY_ENDPOINTS, list.endpoints);
  return { ...list, added: true };
}
async function watchRemove(body) {
  const nt = api.normalizeTarget(body.target != null ? body.target : `${body.host || ""}:${body.port || 443}`);
  if (!nt.ok) throw logic.userErr(nt.error);
  const list = await watchList();
  const before = list.endpoints.length;
  list.endpoints = list.endpoints.filter((e) => !(e.host === nt.host && e.port === nt.port));
  const removed = before - list.endpoints.length;
  if (removed) await kv.kvSet(KEY_ENDPOINTS, list.endpoints);
  return { ...list, removed };
}
async function watchCheck(now) {
  const list = await watchList();
  const eps = list.endpoints;
  const results = new Array(eps.length);
  const CONCURRENCY = 4;
  let i = 0;
  async function worker() {
    while (i < eps.length) {
      const idx = i++;
      const ep = eps[idx];
      try {
        const r = await probe.tlsProbe({ host: ep.host, port: ep.port, serverName: ep.serverName || "", timeoutMs: api.clampTimeoutMs(ep.timeoutMs), now });
        const leaf = r.chain.length ? r.chain[r.chainAudit.leafIndex != null ? r.chainAudit.leafIndex : 0] : null;
        results[idx] = {
          host: ep.host,
          port: ep.port,
          label: ep.label,
          serverName: ep.serverName || "",
          ok: r.verified,
          connected: r.connected,
          daysLeft: leaf ? leaf.daysLeft : null,
          notAfter: leaf ? leaf.notAfter : null,
          cn: leaf ? leaf.cn : null,
          severity: leaf ? api.expirySeverity(leaf.daysLeft) : "crit",
          errorCode: r.error ? r.error.code : null,
          checkedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      } catch (e) {
        results[idx] = { host: ep.host, port: ep.port, label: ep.label, ok: false, severity: "crit", errorCode: "INTERNAL", errorDetail: String(e && e.message || e).slice(0, 200), checkedAt: (/* @__PURE__ */ new Date()).toISOString() };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, eps.length)) }, worker));
  const state = { checkedAt: (/* @__PURE__ */ new Date()).toISOString(), results };
  await kv.kvSet(KEY_STATE, state);
  return { endpoints: eps, state };
}
function sendJson(res, code, obj, extraHeaders) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    ...extraHeaders || {}
  });
  res.end(data);
}
function fail(res, code, msg) {
  sendJson(res, code, { ok: false, error: msg });
}
function authed(req) {
  return String(req.headers["x-cert-lens-token"] || "") === token;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on("data", (c) => {
      if (exceeded) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        exceeded = true;
        chunks.length = 0;
        req.removeAllListeners("data");
        req.resume();
        reject(logic.userErr("\u8BF7\u6C42\u4F53\u8D85\u9650\uFF08PEM \u4E0A\u9650 2MB\uFF09"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (exceeded) return;
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (_) {
        reject(logic.userErr("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON"));
      }
    });
    req.on("error", reject);
  });
}
var server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-cert-lens-token",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return;
  }
  try {
    if (url === "/__health") {
      sendJson(res, 200, { ok: true, version: VERSION, uptimeMs: Math.round(process.uptime() * 1e3) });
      return;
    }
    if (!url.startsWith("/api/")) {
      fail(res, 404, "\u672A\u77E5\u8DEF\u5F84");
      return;
    }
    if (!authed(req)) {
      fail(res, 401, "\u7F3A\u5C11\u6216\u9519\u8BEF\u7684 token\uFF08\u9762\u677F\u5E94\u4ECE cap.kv cert-lens.meta \u8BFB\u53D6\uFF09");
      return;
    }
    const body = await readBody(req);
    switch (url) {
      case "/api/parse": {
        const r = logic.doParse(body, Date.now());
        log("info", `parse certs=${r.kind.certs} errors=${r.errors.length}${r.keyMatch ? " keyMatch=" + r.keyMatch.matched : ""}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/probe": {
        const r = await logic.doProbe(body, Date.now());
        log("info", `probe ${r.target.host}:${r.target.port} ok=${r.ok} chain=${r.chain.length} ms=${r.ms}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/diagnose": {
        const r = logic.doDiagnose(body);
        log("info", `diagnose rule=${r.rule}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/watch/list": {
        sendJson(res, 200, { ok: true, ...await watchList() });
        return;
      }
      case "/api/watch/add": {
        sendJson(res, 200, { ok: true, ...await watchAdd(body) });
        return;
      }
      case "/api/watch/remove": {
        sendJson(res, 200, { ok: true, ...await watchRemove(body) });
        return;
      }
      case "/api/watch/check": {
        const r = await watchCheck(Date.now());
        log("info", `watch check n=${r.endpoints.length}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case "/api/selftest": {
        const r = await doSelftest();
        log("info", `selftest pass=${r.pass}/${r.total}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      default:
        fail(res, 404, `\u672A\u77E5 API ${url}`);
    }
  } catch (err) {
    const isUser = err && err.user;
    log(isUser ? "info" : "error", `${url} ${isUser ? "\u62D2\u7EDD" : "\u5185\u90E8\u9519\u8BEF"}: ${err && err.message}`);
    fail(res, isUser ? 400 : 500, err && err.message || "\u5185\u90E8\u9519\u8BEF");
  }
});
server.listen(PORT, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  log("info", `service listening on 127.0.0.1:${port} (version ${VERSION})`);
  kv.kvSet(KEY_META, {
    token,
    port,
    version: VERSION,
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).then(() => log("info", "meta \u5199\u5165 cap.kv \u6210\u529F")).catch((e) => log("warn", `meta \u5199 cap.kv \u5931\u8D25\uFF08\u6865\u964D\u7EA7\uFF0C\u9762\u677F\u5C06\u663E\u793A\u79BB\u7EBF\uFF09: ${e && e.message}`));
});
process.on("uncaughtException", (e) => log("error", `uncaught: ${e && e.stack ? e.stack : e}`));
process.on("unhandledRejection", (e) => log("error", `unhandledRejection: ${e && e.stack ? e.stack : e}`));
function shutdown() {
  log("info", "\u6536\u5230\u9000\u51FA\u4FE1\u53F7\uFF0C\u5173\u95ED\u670D\u52A1");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
