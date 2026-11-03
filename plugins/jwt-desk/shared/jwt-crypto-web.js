'use strict';
/**
 * JWT 调试台浏览器侧密码学适配层（shared/jwt-crypto-web.js）
 *
 * 与 jwt-crypto-node.js 同一接口（hmacVerify/hmacSign/asymVerify/asymSign，全 async）。
 * 只依赖 globalThis.crypto.subtle（浏览器与 node≥18 都内置）——顶层不碰任何平台对象，
 * 会被 esbuild 打进面板 browser bundle（shared/* 禁 require 的 exec-sandbox 坑）。
 *
 * 关键语义差异：WebCrypto 的 ECDSA 签名出入参都是 raw r||s（IEEE P1363），
 * 与 JOSE 一致——无需像 node 侧那样做 DER 互转。
 */
const core = require('./jwt-core');

function subtle() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (!c || !c.subtle) throw new Error('当前运行时无 WebCrypto（crypto.subtle）');
  return c.subtle;
}

const HASH_WEB = { 'SHA-256': 'SHA-256', 'SHA-384': 'SHA-384', 'SHA-512': 'SHA-512' };
const EC_CURVE = { 'P-256': 'P-256', 'P-384': 'P-384', 'P-521': 'P-521' };

/** PEM/JWK → WebCrypto CryptoKey */
async function importKey(alg, keyInput, isPrivate, usages) {
  const spec = core.ALGS[alg];
  const s = subtle();
  const algId = { name: '', hash: HASH_WEB[spec.hash] };
  if (spec.family === 'rsa') algId.name = 'RSASSA-PKCS1-v1_5';
  else if (spec.family === 'pss') algId.name = 'RSA-PSS';
  else algId.name = 'ECDSA';

  if (keyInput && typeof keyInput.pem === 'string') {
    const der = core.pemBodyToDer(keyInput.pem);
    const format = isPrivate ? 'pkcs8' : 'spki';
    const id = spec.family === 'ec' ? { name: 'ECDSA', namedCurve: EC_CURVE[spec.curve] } : algId;
    return s.importKey(format, der, id, false, usages);
  }
  if (keyInput && keyInput.jwk && typeof keyInput.jwk === 'object') {
    const jwk = keyInput.jwk;
    // JWK 导入：RSA 用算法名，EC 用 namedCurve（WebCrypto 按 kty 校验 use/key_ops）
    const id = spec.family === 'ec' ? { name: 'ECDSA', namedCurve: EC_CURVE[spec.curve] } : algId;
    return s.importKey('jwk', jwk, id, false, usages);
  }
  throw new Error('缺少 PEM 或 JWK 密钥材料');
}

async function hmacKey(alg, secret, usages) {
  const spec = core.ALGS[alg];
  // 字符串按 UTF-8 编码；字节密钥（KAT 向量）原样使用
  const raw = typeof secret === 'string' ? core.utf8Encode(secret) : secret;
  return subtle().importKey('raw', raw, { name: 'HMAC', hash: HASH_WEB[spec.hash] }, false, usages);
}

async function hmacVerify(alg, secret, data, sig) {
  const key = await hmacKey(alg, secret, ['verify']);
  return subtle().verify('HMAC', key, sig, data);
}

async function hmacSign(alg, secret, data) {
  const key = await hmacKey(alg, secret, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', key, data));
}

async function asymVerify(alg, keyInput, data, sig) {
  const spec = core.ALGS[alg];
  const key = await importKey(alg, keyInput, false, ['verify']);
  const s = subtle();
  if (spec.family === 'rsa') return s.verify({ name: 'RSASSA-PKCS1-v1_5', hash: HASH_WEB[spec.hash] }, key, sig, data);
  if (spec.family === 'pss') {
    // RFC 7518：saltLength = 哈希长度
    return s.verify({ name: 'RSA-PSS', saltLength: spec.hashLen }, key, sig, data);
  }
  // WebCrypto EcdsaParams 要求 hash 字段（namedCurve 在密钥导入时已定）
  return s.verify({ name: 'ECDSA', hash: HASH_WEB[spec.hash] }, key, sig, data);
}

async function asymSign(alg, keyInput, data) {
  const spec = core.ALGS[alg];
  const key = await importKey(alg, keyInput, true, ['sign']);
  const s = subtle();
  if (spec.family === 'rsa') return new Uint8Array(await s.sign({ name: 'RSASSA-PKCS1-v1_5', hash: HASH_WEB[spec.hash] }, key, data));
  if (spec.family === 'pss') return new Uint8Array(await s.sign({ name: 'RSA-PSS', saltLength: spec.hashLen }, key, data));
  // WebCrypto ECDSA 输出即 raw r||s（JOSE 一致）；EcdsaParams 同样要求 hash
  return new Uint8Array(await s.sign({ name: 'ECDSA', hash: HASH_WEB[spec.hash] }, key, data));
}

module.exports = { hmacVerify, hmacSign, asymVerify, asymSign };
