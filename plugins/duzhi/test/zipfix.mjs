/**
 * zipfix.mjs —— 测试专用 zip 写手（仅测试用，不进打包）
 *
 * 与 shared/core.js 的解密侧互为对偶：加密用同一 PKWARE ZipCrypto 密钥流算法。
 * 注意：加密器复用 core.crc32Of 计算 CRC——但 crc32 的正确性已由标准向量
 * （crc32('123456789')=0xCBF43926）独立锚定，不存在「错表自洽」风险。
 */
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function zipCryptoKeys(password) {
  const keys = [0x12345678, 0x23456789, 0x34567890];
  const upd = (b) => {
    keys[0] = (keys[0] >>> 8) ^ CRC_TABLE[(keys[0] ^ b) & 0xff];
    keys[1] = (keys[1] + (keys[0] & 0xff)) >>> 0;
    keys[1] = (Math.imul(keys[1], 134775813) + 1) >>> 0;
    keys[2] = (keys[2] >>> 8) ^ CRC_TABLE[(keys[2] ^ (keys[1] >>> 24)) & 0xff];
  };
  const streamByte = () => {
    const t = (keys[2] | 2) & 0xffff;
    return ((t * (t ^ 1)) >>> 8) & 0xff;
  };
  const pw = Buffer.from(String(password), 'utf8');
  for (const b of pw) upd(b);
  return { upd, streamByte };
}

/** ZipCrypto 加密（12 字节头 + 密文；校验字节 = crc 高位） */
function zipCryptoEncrypt(plain, password, crc) {
  const { upd, streamByte } = zipCryptoKeys(password);
  const header = Buffer.alloc(12);
  for (let i = 0; i < 11; i++) header[i] = Math.floor(Math.random() * 256);
  header[11] = (crc >>> 24) & 0xff;
  const out = Buffer.alloc(plain.length + 12);
  for (let i = 0; i < out.length; i++) {
    const p = i < 12 ? header[i] : plain[i - 12];
    const c = p ^ streamByte();
    upd(p);
    out[i] = c;
  }
  return out;
}

function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
function u32(v) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

/**
 * entries: [{name, data:Uint8Array, method?:0|8|99, encrypt?:bool, password?:string, crcOverride?:number}]
 * 返回 Uint8Array 的 zip。
 */
export function makeZip(entries) {
  const chunks = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = Buffer.from(e.name, 'utf8');
    const crc = e.crcOverride !== undefined ? e.crcOverride : core.crc32Of(e.data);
    let method = e.method !== undefined ? e.method : 8;
    let comp;
    if (method === 8) comp = Buffer.from(zlib.deflateRawSync(Buffer.from(e.data)));
    else if (method === 0) comp = Buffer.from(e.data);
    else comp = Buffer.concat([Buffer.from(e.data.slice(0, 4))]); // method 99：假数据，只测拒绝
    if (method !== 99 && e.encrypt) comp = zipCryptoEncrypt(comp, e.password || '', crc);
    const flags = e.encrypt ? 0x1 : 0;
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(method),
      ...u16(0), ...u16(0x2100), // time/date 随意固定
      ...u32(crc), ...u32(comp.length), ...u32(e.data.length),
      ...u16(nameBytes.length), ...u16(0),
    ];
    const localBuf = Buffer.concat([Buffer.from(local), nameBytes, comp]);
    chunks.push(localBuf);
    const central = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(method),
      ...u16(0), ...u16(0x2100),
      ...u32(crc), ...u32(comp.length), ...u32(e.data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ];
    centrals.push(Buffer.concat([Buffer.from(central), nameBytes]));
    offset += localBuf.length;
  }
  const cdStart = offset;
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(cd.length), ...u32(cdStart), ...u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...chunks, cd, eocd]));
}
