'use strict';
/**
 * certmodel.js —— cert-lens 证书解析核心（service / MCP / 测试同一权威）
 *
 * 只依赖 node:crypto 内置能力（X509Certificate / createPrivateKey），零外部依赖：
 *   - 解析：PEM → 字段全模型（SAN/密钥/签名算法/指纹/扩展/AIA/自签判定）
 *   - 签名算法：Node 不直接暴露 sigAlg，用 ~40 行 mini-DER 解析器从 DER 取 OID
 *   - 链拼装：对粘贴的多证书做「名字匹配 + 验签」双确认的签发关系拓扑，给出
 *     排序修复 / 缺中间 / 验签失败三类问题（对照 openssl verify 不吃 AIA 的真实行为）
 *   - 配对：证书公钥 vs 私钥 SPKI DER 时序安全比较
 *   - 主机匹配：RFC 6125 简化实现（通配符仅最左标签；IP 走 SAN ip 精确匹配）
 *
 * 隐私：所有解析在内存完成；不落盘、不落日志。私钥只用于配对比较后即弃。
 */
const crypto = require('crypto');
const { X509Certificate } = crypto;
const { splitPemBlocks } = require('./engine-api.js');

// ── mini-DER：只为读「外层签名算法 OID」这一件事 ────────────────────────────
function derTlv(buf, pos) {
  if (pos >= buf.length) throw new Error('DER 越界');
  const tag = buf[pos];
  let p = pos + 1;
  let len = buf[p++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('DER 长度字段异常');
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
    val = val * 128 + (c[i] & 0x7f);
    if (!(c[i] & 0x80)) { parts.push(val); val = 0; }
  }
  return parts.join('.');
}

const SIG_ALG_OIDS = {
  '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

/** 从 DER 取外层签名算法 OID → 名称（未知 OID 原样返回）
 * 结构：Certificate ::= SEQ { tbs SEQ, sigAlg SEQ { OID, ... }, sigValue BITSTRING } */
function sigAlgOf(rawDer) {
  try {
    const top = derTlv(rawDer, 0);
    const kids = derChildren(rawDer, top.contentStart, top.contentEnd);
    if (kids.length < 2 || kids[1].tag !== 0x30) return { oid: null, name: null };
    // kids[1] 本身就是签名算法 SEQ 的 TLV，直接读它的孩子们取 OID
    const algKids = derChildren(rawDer, kids[1].contentStart, kids[1].contentEnd);
    if (!algKids.length || algKids[0].tag !== 0x06) return { oid: null, name: null };
    const oid = derOid(rawDer, algKids[0]);
    return { oid, name: SIG_ALG_OIDS[oid] || oid };
  } catch (_) {
    return { oid: null, name: null };
  }
}

/** 公钥信息（JWK export 全类型通吃：RSA n 长度→位数，EC/OKP 用 crv） */
function keyInfoOf(publicKey) {
  try {
    const jwk = publicKey.export({ format: 'jwk' });
    if (jwk.kty === 'RSA') {
      const b = Buffer.from(jwk.n, 'base64url');
      return { algo: 'RSA', bits: b.length * 8 };
    }
    if (jwk.kty === 'EC') {
      const bits = { 'P-256': 256, 'P-384': 384, 'P-521': 521, 'secp256k1': 256 }[jwk.crv] || null;
      return { algo: 'EC', bits, curve: jwk.crv };
    }
    if (jwk.kty === 'OKP') {
      return { algo: jwk.crv || 'EdDSA', bits: { 'Ed25519': 256, 'Ed448': 448, 'X25519': 256, 'X448': 448 }[jwk.crv] || null, curve: jwk.crv };
    }
    return { algo: jwk.kty || 'unknown', bits: null };
  } catch (_) {
    return { algo: 'unknown', bits: null };
  }
}

/** 主体/签发者文本 → 简单键值对象（够展示用）。
 * Node v24 格式为换行分隔（'CN=localhost\nO=Foo'），旧版本为 RFC2253 逗号（'CN=localhost,O=Foo'）——两种都兼容。 */
function dnToObj(text) {
  const out = {};
  if (typeof text !== 'string') return out;
  for (const part of text.split(/[\n,]\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** subjectAltName 字符串 → 分类数组（'DNS:good.test, IP Address:127.0.0.1'） */
function parseSan(text) {
  const san = { dns: [], ips: [], emails: [], uris: [], others: [] };
  if (!text) return san;
  for (const raw of String(text).split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const i = item.indexOf(':');
    if (i === -1) { san.others.push(item); continue; }
    const type = item.slice(0, i).trim().toLowerCase();
    const val = item.slice(i + 1).trim();
    if (type === 'dns') san.dns.push(val);
    else if (type === 'ip address') san.ips.push(val);
    else if (type === 'email') san.emails.push(val);
    else if (type === 'uri') san.uris.push(val);
    else san.others.push(item);
  }
  return san;
}

function parseInfoAccess(text) {
  const aia = { ocsp: [], caIssuers: [] };
  if (!text) return aia;
  for (const part of String(text).split(';')) {
    const m = part.trim().match(/^(OCSP|CA Issuers)\s*-\s*URI:(.+)$/i);
    if (!m) continue;
    (m[1].toLowerCase() === 'ocsp' ? aia.ocsp : aia.caIssuers).push(m[2].trim());
  }
  return aia;
}

/** 单张证书 → 全模型（now 注入以定 daysLeft） */
function parseCertificate(body, index, now) {
  const certObj = new X509Certificate(body);
  const san = parseSan(certObj.subjectAltName);
  const sig = sigAlgOf(certObj.raw);
  const keyInfo = keyInfoOf(certObj.publicKey);
  const subjectObj = dnToObj(certObj.subject);
  const selfIssued = certObj.subject === certObj.issuer;
  let selfSigned = false;
  if (selfIssued) {
    try { selfSigned = certObj.verify(certObj.publicKey) === true; } catch (_) { selfSigned = false; }
  }
  const notBefore = certObj.validFromDate;
  const notAfter = certObj.validToDate;
  const daysLeft = Math.floor((notAfter.getTime() - now) / 86400000);
  const validityDays = Math.round((notAfter.getTime() - notBefore.getTime()) / 86400000);
  return {
    index,
    kind: 'certificate',
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
    certObj, // 内存对象：对外 JSON 前必须 strip（见 toOutput）
  };
}

/** 输出前剥离非序列化对象（X509Certificate） */
function stripCertObj(v) {
  return JSON.parse(JSON.stringify(v, (k, val) => (k === 'certObj' ? undefined : val)));
}

/**
 * 解析任意粘贴文本：拆 PEM 块分类处理。
 * 返回 { certs, pubkeys, privkeys: n, csrBlocks, crlBlocks, encryptedKeys: n, errors }
 * 单块损坏不拖垮整体（errors 带块序号与原因）。
 */
function parseInput(text, now) {
  const blocks = splitPemBlocks(text);
  const r = { certs: [], pubkeys: [], privkeys: 0, csrBlocks: 0, crlBlocks: 0, encryptedKeys: 0, errors: [] };
  if (!blocks.length) {
    r.errors.push({ index: 0, label: null, error: '输入中没有找到 PEM 块（需要 -----BEGIN CERTIFICATE----- 等）' });
    return r;
  }
  blocks.forEach((b, i) => {
    try {
      if (b.label === 'CERTIFICATE' || b.label === 'TRUSTED CERTIFICATE') {
        r.certs.push(parseCertificate(b.body, r.certs.length, now));
      } else if (b.label === 'PUBLIC KEY' || b.label === 'RSA PUBLIC KEY') {
        const pub = crypto.createPublicKey(b.body);
        r.pubkeys.push({ index: r.pubkeys.length, label: b.label, keyInfo: keyInfoOf(pub), pem: b.body });
      } else if (b.label === 'ENCRYPTED PRIVATE KEY') {
        r.encryptedKeys += 1;
      } else if (b.label === 'PRIVATE KEY' || b.label === 'RSA PRIVATE KEY' || b.label === 'EC PRIVATE KEY') {
        r.privkeys += 1;
      } else if (b.label === 'CERTIFICATE REQUEST' || b.label === 'NEW CERTIFICATE REQUEST') {
        r.csrBlocks += 1;
      } else if (b.label === 'X509 CRL') {
        r.crlBlocks += 1;
      } else {
        r.errors.push({ index: i, label: b.label, error: `未支持的 PEM 类型：${b.label}` });
      }
    } catch (e) {
      r.errors.push({ index: i, label: b.label, error: `解析失败：${(e && e.message) || e}`.slice(0, 300) });
    }
  });
  return r;
}

/**
 * 链拼装：对解析出的证书数组做签发关系拓扑。
 * 签发关系 = 名字匹配（checkIssued）+ 验签通过（verify(issuer.publicKey)）双确认。
 * 返回 { leafIndex, ordered(索引，叶在前), issues, rootFound, verifiedPairs }
 * issues: {kind:'missing-issuer'|'unverified'|'duplicate', index|at, detail}
 */
function assembleChain(certModels) {
  const n = certModels.length;
  const issues = [];
  if (n === 0) return { leafIndex: null, ordered: [], issues, rootFound: false, verifiedPairs: [] };
  // 重复指纹拒绝（重复块会毒化拓扑）
  const seen = new Map();
  certModels.forEach((c, i) => {
    if (seen.has(c.sha256Fp)) {
      issues.push({ kind: 'duplicate', index: i, detail: `与第 ${seen.get(c.sha256Fp) + 1} 张证书重复（相同指纹）` });
    } else seen.set(c.sha256Fp, i);
  });
  // issuerOf[i] = j 表示 j 签发 i
  const issuerOf = new Array(n).fill(null);
  const verifiedPairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let issued = false;
      try { issued = certModels[i].certObj.checkIssued(certModels[j].certObj); } catch (_) { issued = false; }
      if (!issued) continue;
      let verified = false;
      try { verified = certModels[i].certObj.verify(certModels[j].certObj.publicKey) === true; } catch (_) { verified = false; }
      if (verified) {
        if (issuerOf[i] === null) issuerOf[i] = j;
        verifiedPairs.push({ child: i, issuer: j });
      }
    }
  }
  // leaf = 不作为任何签发者出现的证书（签发关系 child→issuer：leaf 无人签发链下级）
  const isIssuer = new Set(verifiedPairs.map((p) => p.issuer));
  let leafIndex = null;
  for (let i = 0; i < n; i++) if (!isIssuer.has(i)) { leafIndex = i; break; }
  if (leafIndex === null) leafIndex = 0; // 全互指（异常）兜底，交给 issues
  const ordered = [];
  const visited = new Set();
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
  // 未入链的证书
  for (let i = 0; i < n; i++) {
    if (!visited.has(i) && !issues.some((x) => x.kind === 'duplicate' && x.index === i)) {
      issues.push({ kind: 'unlinked', index: i, detail: `第 ${i + 1} 张证书未接入链（孤立证书：既不是链上任何证书的签发者，也无签发者）` });
    }
  }
  // 缺签发者 = 缺中间或根（叶之后的最后一张非自签）
  const lastIdx = ordered[ordered.length - 1];
  if (lastIdx !== undefined) {
    const last = certModels[lastIdx];
    if (!last.selfIssued) {
      issues.push({
        kind: 'missing-issuer',
        index: lastIdx,
        detail: `链到「${last.cn || last.subjectText}」后缺少其签发者（${last.issuerText}）——缺中间证书或根${last.aia.caIssuers.length ? `；该证书 AIA 提供签发者下载：${last.aia.caIssuers[0]}` : ''}`,
      });
    }
  }
  // 验签失败对（名字匹配但验签不过 = 假链/篡改）
  if (verifiedPairs.length === 0 && n > 1) {
    issues.push({ kind: 'unverified', index: null, detail: '链上任意相邻两张证书都无法相互验签——链无效或证书被篡改' });
  }
  // 粘贴顺序 != 链序提示
  const expected = [...ordered].sort((a, b) => a - b).join(',');
  const actual = ordered.join(',');
  const pasteOrderWrong = ordered.length === n && expected === actual && ordered[0] !== 0 && n > 1;
  if (pasteOrderWrong) {
    issues.push({ kind: 'order', index: null, detail: `粘贴顺序与链序不同：链应为叶→中间→根，当前第 1 张是「${certModels[ordered[0]].cn || certModels[ordered[0]].subjectText}」（已自动排序展示，下方按链序）` });
  }
  return { leafIndex, ordered, issues, rootFound, verifiedPairs };
}

/** 私钥与证书配对（SPKI DER 时序安全比较；加密私钥明确报不支持） */
function matchKey(certModel, keyPem) {
  let priv;
  try {
    priv = crypto.createPrivateKey(keyPem);
  } catch (e) {
    const msg = String((e && e.message) || e);
    const hint = /encrypted|decrypt/i.test(msg)
      ? '加密私钥需要口令，不支持直接配对——请先导出无口令版本'
      : `私钥无法解析：${msg.slice(0, 160)}`;
    return { matched: false, keyInfo: null, error: hint };
  }
  try {
    const pub = crypto.createPublicKey(priv);
    const a = certModel.certObj.publicKey.export({ type: 'spki', format: 'der' });
    const b = pub.export({ type: 'spki', format: 'der' });
    const matched = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { matched, keyInfo: keyInfoOf(pub), error: matched ? null : '私钥与证书不配对（公钥不一致）' };
  } catch (e) {
    return { matched: false, keyInfo: null, error: `比较失败：${(e && e.message) || e}`.slice(0, 200) };
  }
}

/** RFC 6125 简化主机匹配：DNS 通配符仅最左一个标签；IP 走 SAN ip 精确匹配 */
function hostnameMatches(certModel, host) {
  if (!host || typeof host !== 'string') return false;
  const h = String(host).trim().toLowerCase().replace(/\.$/, '');
  const isIp = /^[0-9.]+$/.test(h) && h.split('.').every((x) => x === '' || Number(x) <= 255)
    ? (h.includes('.') ? 4 : 0)
    : (/^[0-9a-f:]+:[0-9a-f:]*$/i.test(h) ? 6 : 0);
  if (isIp === 4 || isIp === 6) return certModel.san.ips.includes(h);
  for (const d of certModel.san.dns) {
    const dd = d.toLowerCase();
    if (dd === h) return true;
    if (dd.startsWith('*.')) {
      const rest = dd.slice(1); // '.example.com'
      const head = h.slice(0, h.length - rest.length);
      if (h.endsWith(rest) && head.length > 0 && !head.includes('.')) return true;
    }
  }
  return false;
}

/** 到期天数（now 注入） */
function daysLeftOf(certModel, now) {
  return Math.floor((new Date(certModel.notAfter).getTime() - now) / 86400000);
}

module.exports = {
  parseCertificate, parseInput, stripCertObj, assembleChain, matchKey,
  hostnameMatches, keyInfoOf, sigAlgOf, daysLeftOf,
  SIG_ALG_OIDS,
};
