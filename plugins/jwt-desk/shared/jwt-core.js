'use strict';
/**
 * JWT 调试台纯函数核（shared/jwt-core.js）
 *
 * 单一权威：token 拆解/解析、claims 安全审计、验签与签发的流程控制、
 * JOSE r||s ↔ ASN.1 DER 转换、中文报告渲染。
 * 零 require / 零平台 API（不碰 Buffer / process / atob）——同一份文件被：
 *   - mcp/server.js（node 侧，配 shared/jwt-crypto-node.js 适配层）
 *   - 面板 esbuild bundle（浏览器侧，配 shared/jwt-crypto-web.js 适配层）
 *   打进浏览器 bundle 的 shared/* 禁止 require 任何模块（exec-sandbox 实证坑）。
 *
 * 密码学原语全部经适配层注入（async：hmacVerify/hmacSign/asymVerify/asymSign），
 * 本文件只做流程与数据变换，使验签逻辑可以在两个运行时上交叉验证。
 */

const MAX_TOKEN_LEN = 262144; // 256KB，正常 JWT 远小于此；防超长输入
const SKEW_MS = 60 * 1000; // 时钟偏移容忍（iat 未来时判定用）
const SOON_MS = 5 * 60 * 1000; // 5 分钟内过期视为「即将过期」
const DEFAULT_MAX_LIFETIME_MS = 365 * 24 * 3600 * 1000; // 有效期超过 1 年提示

// ── base64url / base64std（严格实现，不依赖 atob/Buffer） ────────────────────

const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64S = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function makeDecoder(alphabet, name) {
  const map = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) map[alphabet.charCodeAt(i)] = i;
  return function decode(input) {
    if (typeof input !== 'string') throw new Error(`${name} 输入必须是字符串`);
    // 容忍 PEM 换行与空白；base64url 段容忍末尾 padding（严格 JWT 应无 padding，如实收下）
    let s = input.replace(/[\r\n\t ]+/g, '').replace(/=+$/, '');
    if (s === '') throw new Error(`${name} 输入为空`);
    if (s.length % 4 === 1) throw new Error(`${name} 长度非法（余 1 无编码含义）`);
    const out = new Uint8Array(Math.floor(s.length * 3 / 4));
    let o = 0, buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const v = map[s.charCodeAt(i) & 0x7f];
      if (v < 0 || (s.charCodeAt(i) & 0xff80) !== 0) throw new Error(`${name} 含非法字符「${s[i]}」`);
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = (buf >> bits) & 0xff;
      }
    }
    return out.subarray(0, o);
  };
}

const b64uDecode = makeDecoder(B64U, 'base64url');
const b64sDecode = makeDecoder(B64S, 'base64');

function b64uEncode(bytes) {
  let out = '';
  let buf = 0, bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buf = (buf << 8) | bytes[i];
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64U[(buf >> bits) & 63];
    }
  }
  if (bits > 0) out += B64U[(buf << (6 - bits)) & 63];
  return out;
}

// ── 字节/文本工具（TextEncoder/TextDecoder：node≥18 与浏览器全局都有） ───────

const TE = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const TD = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function utf8Encode(str) {
  if (!TE) throw new Error('运行时缺 TextEncoder');
  return TE.encode(str);
}
function utf8Decode(bytes) {
  if (!TD) throw new Error('运行时缺 TextDecoder');
  return TD.decode(bytes);
}

function bytesToHex(bytes, limit) {
  const n = limit ? Math.min(bytes.length, limit) : bytes.length;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(bytes[i].toString(16).padStart(2, '0'));
  return parts.join(bytes.length > n ? '…' : '');
}

// ── 算法表（RFC 7518 §3 子集；大小写敏感） ───────────────────────────────────

const ALGS = {
  HS256: { family: 'hmac', hash: 'SHA-256', hashLen: 32 },
  HS384: { family: 'hmac', hash: 'SHA-384', hashLen: 48 },
  HS512: { family: 'hmac', hash: 'SHA-512', hashLen: 64 },
  RS256: { family: 'rsa', hash: 'SHA-256', hashLen: 32 },
  RS384: { family: 'rsa', hash: 'SHA-384', hashLen: 48 },
  RS512: { family: 'rsa', hash: 'SHA-512', hashLen: 64 },
  PS256: { family: 'pss', hash: 'SHA-256', hashLen: 32 },
  PS384: { family: 'pss', hash: 'SHA-384', hashLen: 48 },
  PS512: { family: 'pss', hash: 'SHA-512', hashLen: 64 },
  ES256: { family: 'ec', curve: 'P-256', hash: 'SHA-256', hashLen: 32, coord: 32 },
  ES384: { family: 'ec', curve: 'P-384', hash: 'SHA-384', hashLen: 48, coord: 48 },
  ES512: { family: 'ec', curve: 'P-521', hash: 'SHA-512', hashLen: 64, coord: 66 },
};

// ── token 拆解与解析 ────────────────────────────────────────────────────────

/**
 * 拆 JWS compact 三段。JWE（五段）与残段给出可解释的中文错误。
 * 返回 { headerB64, payloadB64, signatureB64, signingInput }
 */
function splitToken(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.trim() === '') throw new Error('token 为空');
  const token = rawToken.trim();
  if (token.length > MAX_TOKEN_LEN) throw new Error(`token 过大（>${MAX_TOKEN_LEN} 字节），疑似非 JWT`);
  const segs = token.split('.');
  if (segs.length === 5) {
    throw new Error('五段结构疑似 JWE（加密型 token，header.ek.iv.ciphertext.tag）——本台只解析 JWS 明文三段 token');
  }
  if (segs.length !== 3) {
    throw new Error(`JWT compact 应为三段 header.payload.signature（两个点），实际 ${segs.length} 段`);
  }
  const [headerB64, payloadB64, signatureB64] = segs;
  if (headerB64 === '') throw new Error('header 段为空');
  if (payloadB64 === '') throw new Error('payload 段为空');
  return {
    headerB64,
    payloadB64,
    signatureB64,
    signingInput: headerB64 + '.' + payloadB64,
  };
}

/**
 * 解析三段为对象。任何一段损坏都给出中文定位。
 * 返回 { ok:true, header, payload, headerB64, payloadB64, signatureB64,
 *        signature: Uint8Array, signingInput }
 * 或   { ok:false, error }
 */
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
    return { ok: false, error: `header 段不是合法 base64url+JSON：${e.message}` };
  }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    return { ok: false, error: 'header 段解析结果不是 JSON 对象' };
  }
  try {
    payload = JSON.parse(utf8Decode(b64uDecode(parts.payloadB64)));
  } catch (e) {
    return { ok: false, error: `payload 段不是合法 base64url+JSON：${e.message}` };
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'payload 段解析结果不是 JSON 对象' };
  }
  try {
    sigBytes = parts.signatureB64 === '' ? new Uint8Array(0) : b64uDecode(parts.signatureB64);
  } catch (e) {
    return { ok: false, error: `signature 段不是合法 base64url：${e.message}` };
  }
  return {
    ok: true,
    header,
    payload,
    headerB64: parts.headerB64,
    payloadB64: parts.payloadB64,
    signatureB64: parts.signatureB64,
    signature: sigBytes,
    signingInput: parts.signingInput,
  };
}

// ── JOSE r||s（IEEE P1363）↔ ASN.1 DER（ECDSA 签名两种世界格式） ────────────

function asn1LenBytes(n) {
  if (n < 128) return [n];
  if (n < 256) return [0x81, n];
  return [0x82, (n >> 8) & 0xff, n & 0xff];
}

/** 大端无符号整数 → 完整 ASN.1 INTEGER（0x02 + len + 内容；内容去前导零，高位为 1 补 0x00） */
function intToAsn1(raw) {
  let i = 0;
  while (i < raw.length - 1 && raw[i] === 0) i++;
  const v = raw.slice(i);
  const needsPad = (v[0] & 0x80) !== 0;
  const body = new Uint8Array(v.length + (needsPad ? 1 : 0));
  if (needsPad) body[0] = 0x00;
  body.set(v, needsPad ? 1 : 0);
  const head = asn1LenBytes(body.length);
  const out = new Uint8Array(1 + head.length + body.length);
  out[0] = 0x02;
  out.set(head, 1);
  out.set(body, 1 + head.length);
  return out;
}

function intFromAsn1(der, pos) {
  if (der[pos] !== 0x02) throw new Error('DER 结构非法：期望 INTEGER(0x02)');
  const len = der[pos + 1];
  let vlen = len, hlen = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 2) throw new Error('DER 结构非法：INTEGER 长度头异常');
    vlen = 0;
    for (let i = 0; i < n; i++) vlen = vlen * 256 + der[pos + 2 + i];
    hlen = 2 + n;
  }
  const v = der.slice(pos + hlen, pos + hlen + vlen);
  return { value: v, next: pos + hlen + vlen };
}

/** JOSE 原始 r||s → DER SEQUENCE（node crypto 的 ECDSA 签名格式） */
function joseRawToDer(raw) {
  if (!raw || raw.length === 0 || raw.length % 2 !== 0) {
    throw new Error('ECDSA 原始签名长度非法（应为偶数长 r||s）');
  }
  const mid = raw.length / 2;
  const r = intToAsn1(raw.slice(0, mid));
  const s = intToAsn1(raw.slice(mid));
  const content = new Uint8Array(r.length + s.length);
  content.set(r, 0);
  content.set(s, r.length);
  const head = new Uint8Array(1 + asn1LenBytes(content.length).length);
  head[0] = 0x30;
  head.set(asn1LenBytes(content.length), 1);
  const out = new Uint8Array(head.length + content.length);
  out.set(head, 0);
  out.set(content, head.length);
  return out;
}

/** DER SEQUENCE → JOSE r||s（补零到 coordLen） */
function derToJoseRaw(der, coordLen) {
  if (!der || der.length < 6 || der[0] !== 0x30) throw new Error('DER 结构非法：期望 SEQUENCE(0x30)');
  let len = der[1], headLen = 2;
  if (len & 0x80) {
    // ES512（P-521）签名 r/s INTEGER 各可达 68 字节，SEQUENCE 内容超 127 必走多字节长度头
    const n = len & 0x7f;
    if (n === 0 || n > 2) throw new Error('DER 结构非法：SEQUENCE 长度头异常');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + der[2 + i];
    headLen = 2 + n;
  }
  if (der.length < headLen + len) throw new Error('DER 结构非法：长度声明超出实际');
  const r = intFromAsn1(der, headLen);
  // 根因记录：此处曾漏传 der —— intFromAsn1(r.next) 把游标当成了 der、pos 变 undefined，
  // 症状是「期望 INTEGER(0x02)」且真实 DER 必炸；单参调用是本文件唯一这样的调用点
  const s = intFromAsn1(der, r.next);
  const pad = (v) => {
    let start = 0;
    while (start < v.length - 1 && v[start] === 0) start++;
    const body = v.slice(start);
    if (body.length > coordLen) throw new Error('DER INTEGER 超出坐标长度');
    const out = new Uint8Array(coordLen);
    out.set(body, coordLen - body.length);
    return out;
  };
  const out = new Uint8Array(coordLen * 2);
  out.set(pad(r.value), 0);
  out.set(pad(s.value), coordLen);
  return out;
}

// ── 验签流程（适配层注入） ───────────────────────────────────────────────────

/**
 * verifyToken(token, material, adapter)
 *   material: { secret?: string, publicKeyPem?: string, publicKeyJwk?: object }
 *   adapter:  { hmacVerify(alg, secret, data:Uint8Array, sig:Uint8Array) => Promise<boolean>,
 *               asymVerify(alg, keyInput, data, sig) => Promise<boolean> }
 *     keyInput: { pem } 或 { jwk }
 * 返回 { ok:true, verified:boolean, reason?, alg, header, payload, parsed }
 * 或   { ok:false, error }（token 本身解析失败）
 */
async function verifyToken(rawToken, material, adapter) {
  const p = parseToken(rawToken);
  if (!p.ok) return p;
  const m = material || {};
  const alg = p.header.alg;
  if (typeof alg !== 'string' || alg === '' || alg === 'none') {
    return {
      ok: true, verified: false, alg: alg || null, parsed: p,
      reason: alg === 'none'
        ? 'header.alg = none（未签名 token）——伪造零成本，任何库都应拒绝，本台同样拒绝'
        : 'header 缺少 alg 字段——无算法即无签名可验',
    };
  }
  const spec = ALGS[alg];
  if (!spec) {
    return {
      ok: true, verified: false, alg, parsed: p,
      reason: `不支持的算法「${alg}」——支持：HS256/384/512、RS256/384/512、PS256/384/512、ES256/384/512`,
    };
  }
  if (p.signature.length === 0) {
    return { ok: true, verified: false, alg, parsed: p, reason: 'signature 段为空——签名缺失' };
  }
  if (spec.family === 'ec' && p.signature.length !== spec.coord * 2) {
    return {
      ok: true, verified: false, alg, parsed: p,
      reason: `${alg} 签名应为 ${spec.coord * 2} 字节 r||s，实际 ${p.signature.length} 字节`,
    };
  }
  const data = utf8Encode(p.signingInput);
  let verified = false;
  try {
    if (spec.family === 'hmac') {
      // secret 接受字符串（UTF-8 编码）或原始字节（KAT 向量等已知字节密钥场景）
      const hasSecret = (typeof m.secret === 'string' && m.secret !== '') ||
        (m.secret instanceof Uint8Array && m.secret.length > 0);
      if (!hasSecret) {
        return { ok: true, verified: false, alg, parsed: p, reason: `${alg} 需要 secret（字符串密钥）——未提供` };
      }
      verified = await adapter.hmacVerify(alg, m.secret, data, p.signature);
    } else {
      const keyInput = m.publicKeyPem ? { pem: m.publicKeyPem }
        : m.publicKeyJwk ? { jwk: m.publicKeyJwk } : null;
      if (!keyInput) {
        return { ok: true, verified: false, alg, parsed: p, reason: `${alg} 需要 PEM 或 JWK 公钥——未提供` };
      }
      verified = await adapter.asymVerify(alg, keyInput, data, p.signature);
    }
  } catch (e) {
    return { ok: true, verified: false, alg, parsed: p, reason: `验签执行失败：${e.message}` };
  }
  return { ok: true, verified, alg, parsed: p };
}

// ── 签发流程（适配层注入） ───────────────────────────────────────────────────

/**
 * signToken(alg, material, payloadObj, opts, adapter)
 *   opts: { nowMs?, expiresInSeconds?, headerExtra? }
 *   adapter: { hmacSign(alg, secret, data) => Promise<Uint8Array>,
 *              asymSign(alg, keyInput, data) => Promise<Uint8Array> }（ES 返回 JOSE r||s）
 * 返回 { ok:true, token, header, payload, signatureB64 } 或 { ok:false, error }
 */
async function signToken(alg, material, payloadObj, opts, adapter) {
  const spec = ALGS[alg];
  if (!spec) {
    return { ok: false, error: `不支持的签发算法「${alg}」——支持：${Object.keys(ALGS).join('/')}` };
  }
  const o = opts || {};
  const m = material || {};
  if (payloadObj === null || typeof payloadObj !== 'object' || Array.isArray(payloadObj)) {
    return { ok: false, error: 'payload 必须是 JSON 对象' };
  }
  const header = Object.assign({ alg, typ: 'JWT' }, o.headerExtra || {});
  const nowMs = typeof o.nowMs === 'number' ? o.nowMs : Date.now();
  const payload = Object.assign({}, payloadObj);
  if (typeof o.expiresInSeconds === 'number') {
    payload.exp = Math.floor(nowMs / 1000) + o.expiresInSeconds;
  }
  if (payload.iat === undefined) payload.iat = Math.floor(nowMs / 1000);
  const headerB64 = b64uEncode(utf8Encode(JSON.stringify(header)));
  const payloadB64 = b64uEncode(utf8Encode(JSON.stringify(payload)));
  const signingInput = headerB64 + '.' + payloadB64;
  const data = utf8Encode(signingInput);
  let sig;
  try {
    if (spec.family === 'hmac') {
      const hasSecret = (typeof m.secret === 'string' && m.secret !== '') ||
        (m.secret instanceof Uint8Array && m.secret.length > 0);
      if (!hasSecret) return { ok: false, error: `${alg} 签发需要 secret（字符串）` };
      sig = await adapter.hmacSign(alg, m.secret, data);
    } else {
      const keyInput = m.privateKeyPem ? { pem: m.privateKeyPem } : m.privateKeyJwk ? { jwk: m.privateKeyJwk } : null;
      if (!keyInput) return { ok: false, error: `${alg} 签发需要 PEM 或 JWK 私钥` };
      sig = await adapter.asymSign(alg, keyInput, data);
    }
  } catch (e) {
    return { ok: false, error: `签发执行失败：${e.message}` };
  }
  return { ok: true, token: signingInput + '.' + b64uEncode(sig), header, payload, signatureB64: b64uEncode(sig) };
}

// ── PEM 拆装（取第一个 BEGIN..END 块的 base64 主体） ─────────────────────────

function pemBodyToDer(pem) {
  if (typeof pem !== 'string') throw new Error('PEM 必须是字符串');
  const m = pem.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/);
  const body = (m ? m[1] : pem).replace(/[\r\n\t ]+/g, '');
  return b64sDecode(body);
}

// ── claims 审计 ─────────────────────────────────────────────────────────────

const LEVEL_LABELS = { high: '高危', caution: '需注意', info: '提示' };
const LEVEL_ORDER = { high: 0, caution: 1, info: 2 };

const CLAIM_ZH = {
  iss: '签发者', sub: '主题（通常是用户标识）', aud: '受众',
  exp: '过期时间（NumericDate 秒）', nbf: '生效时间', iat: '签发时间',
  jti: '令牌唯一 ID', scope: '权限范围', roles: '角色', email: '邮箱',
  name: '名称', preferred_username: '用户名',
};

const SENSITIVE_KEY_RE = /(passw(or)?d|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|credential|authorization|session)/i;

function fmtEpoch(sec) {
  const ms = sec * 1000;
  // Date 有效范围 ±8.64e15 ms——超大 exp（如 MAX_SAFE_INTEGER）会产出 Invalid Date，如实退回原值
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return String(sec);
  return new Date(ms).toISOString();
}

function humanizeMs(ms) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  let t = '';
  if (d) t += `${d} 天 `;
  if (h || d) t += `${h} 小时 `;
  if (m || h || d) t += `${m} 分钟 `;
  t += `${s} 秒`;
  return t.trim();
}

/**
 * analyzeClaims(header, payload, nowMs, opts)
 *   opts: { maxLifetimeMs? }
 * 返回 { ok:true, findings:[{id,level,title,detail}], counts:{high,caution,info} }
 * nowMs 必传（调用方注入，测试可定格时钟——watchtower summarize 纪律）。
 */
function analyzeClaims(header, payload, nowMs, opts) {
  const o = opts || {};
  const maxLifetimeMs = typeof o.maxLifetimeMs === 'number' ? o.maxLifetimeMs : DEFAULT_MAX_LIFETIME_MS;
  const F = [];
  const add = (id, level, title, detail) => F.push({ id, level, title, detail });

  if (header && (header.alg === 'none' || header.alg === undefined)) {
    add('alg_none', 'high', '算法为 none（未签名）',
      header.alg === 'none' ? 'alg=none 表示无签名，伪造零成本；RFC 7518 要求实现显式拒绝' : 'header 缺少 alg 字段');
  }
  if (header && typeof header.jku === 'string' && /^https?:\/\//i.test(header.jku)) {
    add('jku_external', 'caution', 'header.jku 指向外部 URL',
      `jku=${header.jku}——验签方若按此拉取密钥会引入 SSRF 与密钥替换风险，应固定信任的密钥源`);
  }
  if (header && typeof header.x5u === 'string' && /^https?:\/\//i.test(header.x5u)) {
    add('x5u_external', 'caution', 'header.x5u 指向外部 URL',
      `x5u=${header.x5u}——同 jku，外部证书链 URL 是验签方 SSRF / 替换攻击面`);
  }
  if (header && Array.isArray(header.crit) && header.crit.length > 0) {
    add('crit_header', 'caution', 'header.crit 声明了关键扩展',
      `crit=${JSON.stringify(header.crit)}——验签方必须理解这些扩展否则必须拒绝，确认对端实现确实支持`);
  }
  if (header && header.typ !== undefined && header.typ !== 'JWT') {
    add('typ_unusual', 'info', `header.typ = ${JSON.stringify(header.typ)}`,
      '不是常规的 "JWT"，确认是业务约定而非笔误');
  }
  if (header && typeof header.kid === 'string') {
    add('kid_present', 'info', `header.kid = ${JSON.stringify(header.kid)}`,
      '验签方按 kid 选密钥；kid 通常不敏感，但注意别把「选不到就跳过验签」当成兜底');
  }

  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const exp = payload ? payload.exp : undefined;
  const iat = payload ? payload.iat : undefined;
  const nbf = payload ? payload.nbf : undefined;

  if (exp === undefined) {
    add('exp_missing', 'caution', 'payload 缺少 exp（过期时间）',
      '无过期时间的 token 一旦泄漏长期有效；确属永久凭证需有轮换机制兜底');
  } else if (!num(exp)) {
    add('claim_type', 'high', 'exp 不是数字（NumericDate 违约）',
      `exp=${JSON.stringify(exp)}——RFC 7519 要求 NumericDate 为秒数，字符串日期是常见事故源`);
  } else {
    if (nowMs > exp * 1000) {
      add('exp_expired', 'high', 'token 已过期',
        `exp=${fmtEpoch(exp)}，距今 ${humanizeMs(nowMs - exp * 1000)}；过期即失效，勿放宽验签放行`);
    } else if (exp * 1000 - nowMs < SOON_MS) {
      add('exp_soon', 'info', 'token 即将过期',
        `exp=${fmtEpoch(exp)}，剩余 ${humanizeMs(exp * 1000 - nowMs)}（< 5 分钟）`);
    }
    if (num(iat) && (exp - iat) * 1000 > maxLifetimeMs) {
      add('lifetime_long', 'caution', 'token 有效期超长',
        `iat→exp 跨度 ${humanizeMs((exp - iat) * 1000)}（> ${humanizeMs(maxLifetimeMs)}）；长寿命 token 泄漏代价高，优先改用短 token + 刷新`);
    }
  }
  if (iat !== undefined && !num(iat)) {
    add('claim_type', 'high', 'iat 不是数字（NumericDate 违约）', `iat=${JSON.stringify(iat)}`);
  } else if (num(iat) && iat * 1000 > nowMs + SKEW_MS) {
    add('iat_future', 'caution', 'iat 在未来',
      `iat=${fmtEpoch(iat)}，超前 ${humanizeMs(iat * 1000 - nowMs)}（容忍 ${SKEW_MS / 1000} 秒时钟偏移）；常见于双端时钟漂移或手工构造`);
  }
  if (nbf !== undefined) {
    if (!num(nbf)) {
      add('claim_type', 'high', 'nbf 不是数字（NumericDate 违约）', `nbf=${JSON.stringify(nbf)}`);
    } else {
      if (nbf * 1000 > nowMs) add('nbf_not_yet', 'info', 'token 尚未生效（nbf 在未来）', `nbf=${fmtEpoch(nbf)}，还需 ${humanizeMs(nbf * 1000 - nowMs)}`);
      if (num(exp) && nbf > exp) add('nbf_after_exp', 'high', 'nbf 晚于 exp（逻辑矛盾）', `nbf=${fmtEpoch(nbf)} > exp=${fmtEpoch(exp)}——该 token 永远不可能处于有效窗口`);
    }
  }

  if (payload) {
    const hits = Object.keys(payload).filter((k) => SENSITIVE_KEY_RE.test(k));
    if (hits.length > 0) {
      add('credential_in_payload', 'caution', 'payload 携带疑似凭证字段',
        `字段：${hits.join('、')}——payload 仅 base64 编码并非加密，任何拿到 token 的一方都能直接读出`);
    }
  }

  F.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const counts = { high: 0, caution: 0, info: 0 };
  for (const f of F) counts[f.level]++;
  return { ok: true, findings: F, counts };
}

/** 时钟视角：过期/剩余时间/生效状态（nowMs 注入） */
function tokenClock(payload, nowMs) {
  const exp = payload ? payload.exp : undefined;
  const nbf = payload ? payload.nbf : undefined;
  const r = { expired: null, notYet: null, remainingMs: null, expIso: null, nbfIso: null, iatIso: null };
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    r.expIso = fmtEpoch(exp);
    r.remainingMs = exp * 1000 - nowMs;
    r.expired = nowMs > exp * 1000;
  }
  if (typeof nbf === 'number' && Number.isFinite(nbf)) {
    r.nbfIso = fmtEpoch(nbf);
    r.notYet = nbf * 1000 > nowMs;
  }
  if (typeof payload.iat === 'number' && Number.isFinite(payload.iat)) r.iatIso = fmtEpoch(payload.iat);
  return r;
}

// ── 中文报告渲染（MCP 侧；面板用结构化数据自行渲染） ─────────────────────────

function renderFindings(findings, counts) {
  if (!findings || findings.length === 0) return '审计发现：0 条——未命中已知风险模式（不代表绝对安全）';
  const lines = findings.map((f, i) =>
    `${i + 1}. [${LEVEL_LABELS[f.level]}] ${f.title} —— ${f.detail}`);
  return `审计发现 ${findings.length} 条（高危 ${counts.high} / 需注意 ${counts.caution} / 提示 ${counts.info}）：\n` + lines.join('\n');
}

function renderDecodeReport(p) {
  const lines = [];
  lines.push('JWT 三段拆解（JWS compact serialization）');
  lines.push('');
  lines.push(`① Header（${p.headerB64.length} 字符 → ${Object.keys(p.header).length} 个字段）`);
  lines.push(JSON.stringify(p.header, null, 2));
  lines.push('');
  lines.push(`② Payload（${p.payloadB64.length} 字符 → ${Object.keys(p.payload).length} 个 claim）`);
  lines.push(JSON.stringify(p.payload, null, 2));
  lines.push('');
  const hex = bytesToHex(p.signature, 16);
  lines.push(`③ Signature（${p.signature.length} 字节，base64url ${p.signatureB64.length} 字符）`);
  lines.push(`  前 16 字节 hex：${hex}${p.signature.length > 16 ? '…' : ''}`);
  return lines.join('\n');
}

function renderClaimsTable(payload, nowMs) {
  const keys = Object.keys(payload || {});
  if (keys.length === 0) return '（payload 为空对象）';
  const rows = keys.map((k) => {
    const zh = CLAIM_ZH[k] || '';
    let v = JSON.stringify(payload[k]);
    if ((k === 'exp' || k === 'iat' || k === 'nbf') && typeof payload[k] === 'number') {
      v += `（${fmtEpoch(payload[k])}）`;
    }
    return zh ? `  ${k}（${zh}）：${v}` : `  ${k}：${v}`;
  });
  return rows.join('\n');
}

function renderVerifyReport(r, nowMs) {
  const lines = [];
  if (!r.ok) return `token 解析失败：${r.error}`;
  const verdict = r.verified ? '✔ 验签通过' : '✖ 验签不通过';
  lines.push(`${verdict}（alg=${r.alg}）`);
  if (r.reason) lines.push(`原因：${r.reason}`);
  const clock = tokenClock(r.parsed.payload, nowMs);
  const clockBits = [];
  if (clock.expired === true) clockBits.push(`已过期（exp=${clock.expIso}，超时 ${humanizeMs(-clock.remainingMs)}）`);
  else if (clock.expired === false) clockBits.push(`未过期（exp=${clock.expIso}，剩余 ${humanizeMs(clock.remainingMs)}）`);
  if (clock.notYet === true) clockBits.push(`尚未生效（nbf=${clock.nbfIso}）`);
  if (clock.iatIso) clockBits.push(`签发于 ${clock.iatIso}`);
  if (clockBits.length) {
    lines.push(`时钟视角：${clockBits.join('；')}`);
  }
  const audit = analyzeClaims(r.parsed.header, r.parsed.payload, nowMs);
  lines.push('');
  lines.push(renderFindings(audit.findings, audit.counts));
  return lines.join('\n');
}

function renderAuditReport(a, nowMs) {
  void nowMs;
  return renderFindings(a.findings, a.counts);
}

function renderSignReport(r) {
  if (!r.ok) return `签发失败：${r.error}`;
  return [
    '已签发（仅用于联调测试，勿将测试密钥用于生产）:',
    '',
    r.token,
    '',
    `alg=${r.header.alg}，exp=${r.payload.exp !== undefined ? fmtEpoch(r.payload.exp) : '（未设置）'}，iat=${fmtEpoch(r.payload.iat)}`,
  ].join('\n');
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
  renderClaimsTable,
};
