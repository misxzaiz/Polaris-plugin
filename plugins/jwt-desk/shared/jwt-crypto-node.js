'use strict';
/**
 * JWT 调试台 node 侧密码学适配层（shared/jwt-crypto-node.js）
 *
 * 与 jwt-crypto-web.js 实现同一接口（hmacVerify/hmacSign/asymVerify/asymSign），
 * 供 mcp/server.js 与测试 harness 使用。MCP 进程是 node，直接用 node:crypto；
 * 测试里两个适配层互为交叉验证（node 签 → WebCrypto 验，反之亦然）。
 *
 * PS*（RSA-PSS）saltLength 按 RFC 7518 钉死为哈希长度；
 * ES* node 侧签名是 DER，经 core.joseRawToDer/derToJoseRaw 与 JOSE r||s 互转。
 */
const crypto = require('crypto');
const core = require('./jwt-core');

const HASH_NODE = { 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' };

/** 统一取公/私钥对象：PEM 字符串或 JWK 对象都收 */
function toKeyObject(keyInput, isPrivate) {
  if (keyInput && typeof keyInput.pem === 'string') {
    const der = core.pemBodyToDer(keyInput.pem);
    return isPrivate
      ? crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
      : crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  }
  if (keyInput && keyInput.jwk && typeof keyInput.jwk === 'object') {
    return isPrivate
      ? crypto.createPrivateKey({ key: keyInput.jwk, format: 'jwk' })
      : crypto.createPublicKey({ key: keyInput.jwk, format: 'jwk' });
  }
  throw new Error('缺少 PEM 或 JWK 密钥材料');
}

function pssOptions(key, hashLen) {
  return {
    key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: hashLen, // RFC 7518 §3.5：salt 长度 = 哈希输出长度
  };
}

async function hmacVerify(alg, secret, data, sig) {
  const spec = core.ALGS[alg];
  const mac = crypto.createHmac(HASH_NODE[spec.hash], secret).update(data).digest();
  if (mac.length !== sig.length) return false;
  return crypto.timingSafeEqual(mac, sig);
}

async function hmacSign(alg, secret, data) {
  const spec = core.ALGS[alg];
  return new Uint8Array(crypto.createHmac(HASH_NODE[spec.hash], secret).update(data).digest());
}

async function asymVerify(alg, keyInput, data, sig) {
  const spec = core.ALGS[alg];
  const key = toKeyObject(keyInput, false);
  const bufData = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const bufSig = Buffer.from(sig.buffer, sig.byteOffset, sig.byteLength);
  if (spec.family === 'rsa') {
    return crypto.verify(HASH_NODE[spec.hash], bufData, key, bufSig);
  }
  if (spec.family === 'pss') {
    return crypto.verify(HASH_NODE[spec.hash], bufData, pssOptions(key, spec.hashLen), bufSig);
  }
  // EC：node 期望 DER，先从 JOSE r||s 转换
  const der = core.joseRawToDer(sig);
  return crypto.verify(HASH_NODE[spec.hash], bufData, key, Buffer.from(der));
}

async function asymSign(alg, keyInput, data) {
  const spec = core.ALGS[alg];
  const key = toKeyObject(keyInput, true);
  const bufData = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let sigBuf;
  if (spec.family === 'rsa') {
    sigBuf = crypto.sign(HASH_NODE[spec.hash], bufData, key);
  } else if (spec.family === 'pss') {
    sigBuf = crypto.sign(HASH_NODE[spec.hash], bufData, pssOptions(key, spec.hashLen));
  } else {
    sigBuf = crypto.sign(HASH_NODE[spec.hash], bufData, key);
    // node 输出 DER，JOSE 需要 r||s
    return new Uint8Array(core.derToJoseRaw(new Uint8Array(sigBuf), spec.coord));
  }
  return new Uint8Array(sigBuf);
}

module.exports = { hmacVerify, hmacSign, asymVerify, asymSign };
