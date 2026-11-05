'use strict';
/**
 * core.js —— 二维码工作台（qr-desk）纯函数核心（service / MCP / 测试三端同源）
 *
 * 职责：
 *   - 载荷模板构建与逐字段解析：WiFi（WIFI Alliance 转义）、vCard 3.0（含折行 unfold）、
 *     otpauth（TOTP/HOTP）、MECARD、mailto/tel/sms/geo 识别。
 *   - OTP：RFC 4226 HOTP / RFC 6238 TOTP（SHA1/SHA256/SHA512，Base32 解码），当前码预览。
 *   - Google Authenticator 迁移码：otpauth-migration:// protobuf 手工解/编码（wire format 子集）。
 *   - classify/inspect：任意文本 → 类型识别 + 结构化字段 + 人类可读摘要。
 *   - CSV（RFC 4180 子集）解析与批量出码计划（文件名冲突策略由调用方处理，这里只出计划）。
 *
 * 安全边界：
 *   - 纯计算零 IO 零外联；任何函数不写日志不落盘。
 *   - 解析输入一律视为不可信数据：只做结构化返回，绝不执行、绝不内插到代码。
 */

const crypto = require('crypto');

// ── 常量 ────────────────────────────────────────────────────────────────────
const WIFI_ENC = new Set(['WPA', 'WEP', 'nopass']);
const OTP_ALGOS = ['SHA1', 'SHA256', 'SHA512'];
const OTP_DEFAULT_PERIOD = 30;
const OTP_DEFAULT_DIGITS = 6;
// QR 码 40-L 版本字节容量上限（保守预检；精确容量由 qrcode 库按模式决定）
const MAX_QR_BYTES = 2953;
const MAX_BATCH_ROWS = 500;

// ── 小工具 ──────────────────────────────────────────────────────────────────
function isStr(v) { return typeof v === 'string'; }
function utf8Len(s) { return Buffer.byteLength(s, 'utf8'); }

function fail(msg) { const e = new Error(msg); e.user = true; throw e; }

// ── WiFi（WIFI:T:…;S:…;P:…;H:true;;）────────────────────────────────────────
function wifiEscape(v) {
  // 顺序铁律：先转义反斜杠，再转义其余（否则二次转义）
  return String(v).replace(/\\/g, '\\\\').replace(/([;,:"])/g, '\\$1');
}
function wifiUnescape(v) {
  return String(v).replace(/\\([;,:\\"\\])/g, '$1');
}

/**
 * 构建 WiFi 载荷。encryption: 'WPA' | 'WEP' | 'nopass'
 */
function buildWifi(f) {
  if (!f || !isStr(f.ssid) || !f.ssid.length) fail('WiFi 需要 ssid');
  const enc = f.encryption == null || f.encryption === '' ? 'WPA' : String(f.encryption);
  if (!WIFI_ENC.has(enc)) fail(`WiFi 加密方式仅支持 WPA/WEP/nopass，收到 ${enc}`);
  const password = f.password == null ? '' : String(f.password);
  if (enc !== 'nopass' && !password.length) fail(`加密方式为 ${enc} 时需要 password`);
  if (enc === 'nopass' && password.length) fail('nopass 时不应填 password');
  const parts = ['WIFI:T:' + enc + ';', 'S:' + wifiEscape(f.ssid) + ';'];
  if (enc !== 'nopass') parts.push('P:' + wifiEscape(password) + ';');
  if (f.hidden === true) parts.push('H:true;');
  parts.push(';');
  return parts.join('');
}

/** 解析 WiFi 载荷 → {ssid,password,encryption,hidden}；非 WIFI: 前缀返回 null */
function parseWifi(text) {
  if (!isStr(text) || !text.startsWith('WIFI:')) return null;
  const out = { ssid: '', password: '', encryption: 'nopass', hidden: false };
  // 逐字段切分：字段以 ';' 结束，值内 \; 不算结束
  const body = text.slice(5);
  let key = '', val = '', inEsc = false, sawKey = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inEsc) { val += ch; inEsc = false; continue; }
    if (ch === '\\') { inEsc = true; val += ch; continue; }
    if (ch === ':') {
      if (!sawKey) { key = val; val = ''; sawKey = true; } else val += ch;
      continue;
    }
    if (ch === ';') {
      if (sawKey) applyWifiField(out, key, val);
      key = ''; val = ''; sawKey = false;
      continue;
    }
    val += ch;
  }
  if (sawKey) applyWifiField(out, key, val); // 容错：缺结束分号
  if (!out.ssid.length) fail('WiFi 载荷缺少 S:（SSID）字段');
  return out;
}
function applyWifiField(out, key, raw) {
  const v = wifiUnescape(raw);
  if (key === 'S') out.ssid = v;
  else if (key === 'P') out.password = v;
  else if (key === 'T') out.encryption = v || 'nopass';
  else if (key === 'H') out.hidden = v === 'true' || v === 'True';
  // 其余键（极罕见私有扩展）忽略
}

// ── vCard 3.0 ───────────────────────────────────────────────────────────────
function vcardEscape(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function vcardUnescape(v) {
  return String(v).replace(/\\n/gi, '\n').replace(/\\([;,%\\])/g, '$1');
}

/**
 * 构建 vCard 3.0 载荷。f: {name(必填 FN), first?, last?, org?, title?, tel?, email?, url?, note?, adr?}
 */
function buildVcard(f) {
  if (!f || !isStr(f.name) || !f.name.length) fail('vCard 需要 name（FN）');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + vcardEscape(f.name)];
  const last = f.last == null ? '' : String(f.last);
  const first = f.first == null ? '' : String(f.first);
  if (last.length || first.length) lines.push('N:' + vcardEscape(last) + ';' + vcardEscape(first) + ';;;');
  if (f.org) lines.push('ORG:' + vcardEscape(f.org));
  if (f.title) lines.push('TITLE:' + vcardEscape(f.title));
  if (f.tel) lines.push('TEL;TYPE=CELL:' + vcardEscape(f.tel));
  if (f.email) lines.push('EMAIL:' + vcardEscape(f.email));
  if (f.url) lines.push('URL:' + vcardEscape(f.url));
  if (f.adr) lines.push('ADR;TYPE=HOME:;;' + vcardEscape(f.adr) + ';;;;');
  if (f.note) lines.push('NOTE:' + vcardEscape(f.note));
  lines.push('END:VCARD');
  return lines.join('\n');
}

/**
 * 解析 vCard（支持 =UTF-8 编码值透传、折行 unfold、重复属性聚合）。
 * 返回 { version, fn, n, org[], tel[], email[], url[], adr[], note[], title[], raw: [{key, params, value}] }
 */
function parseVcard(text) {
  if (!isStr(text)) return null;
  const norm = text.replace(/^\uFEFF/, '');
  if (!/^BEGIN:VCARD\r?\n/i.test(norm)) return null;
  // unfold：RFC 6350/2426 折行 = CRLF 后跟一个及以上空白
  const unfolded = norm.replace(/\r?\n[ \t]+/g, '');
  const lines = unfolded.split(/\r\n|\n|\r/);
  const out = { version: '', fn: '', n: '', org: [], tel: [], email: [], url: [], adr: [], note: [], title: [], raw: [] };
  for (const line of lines) {
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const headParts = head.split(';');
    const key = headParts[0].toUpperCase();
    const params = {};
    for (let i = 1; i < headParts.length; i++) {
      const eq = headParts[i].indexOf('=');
      if (eq > 0) params[headParts[i].slice(0, eq).toUpperCase()] = headParts[i].slice(eq + 1);
    }
    if (key === 'BEGIN' || key === 'END') continue;
    const decoded = (params.ENCODING && /B|BASE64/i.test(params.ENCODING))
      ? value // MVP：base64 编码值原样保留（罕见），不参与字段提取
      : vcardUnescape(value);
    out.raw.push({ key, params, value: decoded });
    const lk = key.toLowerCase();
    if (lk === 'version') out.version = value.trim();
    else if (lk === 'fn') out.fn = decoded;
    else if (lk === 'n') {
      // N = Family;Given;Middle;Prefix;Suffix——裁掉尾部空组件（生成器常补满 5 段）
      const comps = decoded.split(';');
      while (comps.length > 1 && comps[comps.length - 1] === '') comps.pop();
      out.n = comps.join(';');
    } else if (Array.isArray(out[lk])) out[lk].push(decoded);
  }
  return out;
}

// ── OTP：Base32 / HOTP / TOTP（RFC 4648 / 4226 / 6238）──────────────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const s = String(input).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) fail(`Base32 密钥含非法字符 ${JSON.stringify(ch)}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function base32Encode(buf) {
  let bits = 0, value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function hmacBuf(algo, key, msgBuf) {
  return crypto.createHmac(algo, key).update(msgBuf).digest();
}

/** RFC 4226 HOTP（counter 为 number 或 BigInt 安全范围内的 number） */
function hotp(secretBuf, counter, digits, algo) {
  if (!OTP_ALGOS.includes(algo)) fail(`OTP 算法仅支持 SHA1/SHA256/SHA512，收到 ${algo}`);
  const msg = Buffer.alloc(8);
  const c = BigInt(counter);
  msg.writeUInt32BE(Number((c >> 32n) & 0xffffffffn), 0);
  msg.writeUInt32BE(Number(c & 0xffffffffn), 4);
  const h = hmacBuf(algo, secretBuf, msg);
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % (10 ** digits)).padStart(digits, '0');
}

/** RFC 6238 TOTP；tMs 毫秒时间戳（默认当前） */
function totp(secretBuf, tMs, { digits = OTP_DEFAULT_DIGITS, period = OTP_DEFAULT_PERIOD, algorithm = 'SHA1' } = {}) {
  const t = Math.floor((tMs == null ? Date.now() : tMs) / 1000 / period);
  return hotp(secretBuf, t, digits, algorithm);
}

function totpRemainingMs(period, nowMs) {
  const p = (period || OTP_DEFAULT_PERIOD) * 1000;
  const now = nowMs == null ? Date.now() : nowMs;
  return p - (now % p);
}

// ── otpauth URI ─────────────────────────────────────────────────────────────
/**
 * 构建 otpauth:// URI。f: {type:'totp'|'hotp', label('Issuer:account' 或 'account'), issuer?, secret,
 *   algorithm?, digits?, period?, counter?}
 */
function buildOtpauth(f) {
  if (!f) fail('otpauth 需要参数');
  const type = String(f.type || 'totp').toLowerCase();
  if (type !== 'totp' && type !== 'hotp') fail('otpauth 类型仅支持 totp/hotp');
  if (!isStr(f.label) || !f.label.length) fail('otpauth 需要 label（如 GitHub:alice 或 alice）');
  if (!isStr(f.secret) || !f.secret.length) fail('otpauth 需要 secret');
  base32Decode(f.secret); // 校验可解码
  const params = new URLSearchParams();
  params.set('secret', String(f.secret).replace(/[\s-]/g, ''));
  const issuer = f.issuer == null ? '' : String(f.issuer);
  if (issuer.length) params.set('issuer', issuer);
  if (f.algorithm && f.algorithm !== 'SHA1') params.set('algorithm', String(f.algorithm));
  if (f.digits && Number(f.digits) !== OTP_DEFAULT_DIGITS) params.set('digits', String(f.digits));
  if (type === 'totp' && f.period && Number(f.period) !== OTP_DEFAULT_PERIOD) params.set('period', String(f.period));
  if (type === 'hotp') params.set('counter', String(f.counter == null ? 0 : f.counter));
  return `otpauth://${type}/${encodeURIComponent(f.label)}?${params.toString()}`;
}

/**
 * 解析 otpauth URI → {type, label, issuer, account, secret, secretBase32, algorithm, digits, period, counter}
 */
function parseOtpauth(uri) {
  if (!isStr(uri) || !uri.startsWith('otpauth://')) return null;
  const m = uri.match(/^otpauth:\/\/(totp|hotp)\/([^?]*)(?:\?(.*))?$/i);
  if (!m) fail('otpauth URI 形态非法（应为 otpauth://totp/Label?secret=…）');
  const type = m[1].toLowerCase();
  const label = decodeURIComponent(m[2] || '');
  const q = new URLSearchParams(m[3] || '');
  const secretRaw = q.get('secret') || '';
  if (!secretRaw) fail('otpauth URI 缺少 secret 参数');
  const secretBuf = base32Decode(secretRaw);
  if (!secretBuf.length) fail('otpauth secret 解码后为空');
  // issuer 取参数优先；account 始终剥离 label 的冒号前缀（RFC 6238 建议形态 Issuer:account）
  let issuer = q.get('issuer') || '';
  let account = label;
  const colon = label.indexOf(':');
  if (colon > 0) {
    if (!issuer) issuer = label.slice(0, colon).trim();
    account = label.slice(colon + 1).trim();
  }
  const algorithm = (q.get('algorithm') || 'SHA1').toUpperCase();
  if (!OTP_ALGOS.includes(algorithm)) fail(`otpauth 算法不支持：${algorithm}（仅 SHA1/SHA256/SHA512）`);
  const digits = Number(q.get('digits') || OTP_DEFAULT_DIGITS);
  if (digits !== 6 && digits !== 8) fail(`otpauth digits 仅支持 6/8，收到 ${digits}`);
  const period = Number(q.get('period') || OTP_DEFAULT_PERIOD);
  if (!(period > 0 && period <= 3600)) fail(`otpauth period 非法：${period}`);
  const counter = q.get('counter') == null ? 0 : Number(q.get('counter'));
  return {
    type, label, issuer, account,
    secretBase32: base32Encode(secretBuf),
    algorithm, digits, period, counter,
    secretBufLength: secretBuf.length,
  };
}

/** otpauth 解析结果 + 当前码预览（tMs 默认当前时间；HOTP 用 counter 不推进） */
function otpPreview(parsed, tMs) {
  const secretBuf = base32Decode(parsed.secretBase32);
  if (parsed.type === 'hotp') {
    return { kind: 'hotp', counter: parsed.counter, code: hotp(secretBuf, parsed.counter, parsed.digits, parsed.algorithm) };
  }
  const now = tMs == null ? Date.now() : tMs;
  return {
    kind: 'totp',
    code: totp(secretBuf, now, { digits: parsed.digits, period: parsed.period, algorithm: parsed.algorithm }),
    period: parsed.period,
    remainingMs: totpRemainingMs(parsed.period, now),
  };
}

// ── Google Authenticator 迁移码（otpauth-migration protobuf，wire 子集）─────
// MigrationPayload: otp_parameters=1(repeated msg) version=2 batch_size=3 batch_index=4 batch_id=5
// OtpParameters: secret=1(bytes) name=2(str) issuer=3(str) algorithm=4(enum) digits=5(enum) type=6(enum) counter=7(varint)
const MIG_ALGO = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512', 4: 'MD5' };
const MIG_DIGITS = { 0: 6, 1: 6, 2: 8 };
const MIG_TYPE = { 0: 'TOTP', 1: 'HOTP', 2: 'TOTP' }; // 0 UNSPECIFIED 按 Google 事实默认 TOTP

function readVarint(buf, pos) {
  let result = 0n, shift = 0n, p = pos;
  for (;;) {
    if (p >= buf.length) fail('迁移码 protobuf 数据被截断');
    const b = buf[p++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: result, next: p };
    shift += 7n;
    if (shift > 63n) fail('迁移码 varint 过长');
  }
}

function decodeMigrationOtpParameters(buf) {
  const out = { secret: null, name: '', issuer: '', algorithm: 'SHA1', digits: 6, type: 'TOTP', counter: 0 };
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos); pos = tag.next;
    const fieldNo = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire === 2) { // length-delimited
      const len = readVarint(buf, pos); pos = len.next;
      const l = Number(len.value);
      if (pos + l > buf.length) fail('迁移码字段长度越界');
      const chunk = buf.subarray(pos, pos + l); pos += l;
      if (fieldNo === 1) out.secret = Buffer.from(chunk);
      else if (fieldNo === 2) out.name = chunk.toString('utf8');
      else if (fieldNo === 3) out.issuer = chunk.toString('utf8');
    } else if (wire === 0) { // varint
      const v = readVarint(buf, pos); pos = v.next;
      if (fieldNo === 4) out.algorithm = MIG_ALGO[Number(v.value)] || 'SHA1';
      else if (fieldNo === 5) out.digits = MIG_DIGITS[Number(v.value)] || 6;
      else if (fieldNo === 6) out.type = MIG_TYPE[Number(v.value)] || 'TOTP';
      else if (fieldNo === 7) out.counter = Number(v.value);
      // 其余 varint 字段忽略
    } else if (wire === 5 && buf.length - pos >= 4) { pos += 4; } // fixed32 跳过
    else if (wire === 1 && buf.length - pos >= 8) { pos += 8; } // fixed64 跳过
    else fail(`迁移码出现不支持的 wire type ${wire}`);
  }
  if (!out.secret || !out.secret.length) fail('迁移码条目缺少 secret');
  return out;
}

/** 解析迁移码 URI（或裸 base64 data）→ {entries:[...], version, batchSize, batchIndex, batchId} */
function decodeMigration(text) {
  let b64 = '';
  if (isStr(text) && text.startsWith('otpauth-migration://')) {
    const qi = text.indexOf('?');
    if (qi < 0) fail('迁移码 URI 缺少查询参数');
    const q = new URLSearchParams(text.slice(qi + 1));
    b64 = q.get('data') || '';
    if (!b64) fail('迁移码 URI 缺少 data 参数');
  } else if (isStr(text) && text.length) {
    b64 = text.trim(); // 允许直接粘 base64
  } else {
    return null;
  }
  // URL-safe base64 归一
  const norm = decodeURIComponent(b64).replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(norm, 'base64');
  if (!buf.length) fail('迁移码 data 解码后为空（不是合法 base64）');
  const out = { entries: [], version: 1, batchSize: 0, batchIndex: 0, batchId: 0 };
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos); pos = tag.next;
    const fieldNo = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire !== 2) { // 顶层：字段 1 为消息，2-5 为 varint；未知 fixed 字段按 protobuf 规范跳过
      if (wire === 0) {
        const v = readVarint(buf, pos); pos = v.next;
        const n = Number(v.value);
        if (fieldNo === 2) out.version = n;
        else if (fieldNo === 3) out.batchSize = n;
        else if (fieldNo === 4) out.batchIndex = n;
        else if (fieldNo === 5) out.batchId = n;
      } else if (wire === 5) {
        if (buf.length - pos < 4) fail('迁移码数据被截断');
        pos += 4;
      } else if (wire === 1) {
        if (buf.length - pos < 8) fail('迁移码数据被截断');
        pos += 8;
      } else fail(`迁移码顶层 wire type ${wire} 不支持`);
      continue;
    }
    const len = readVarint(buf, pos); pos = len.next;
    const l = Number(len.value);
    if (pos + l > buf.length) fail('迁移码顶层字段长度越界');
    const chunk = buf.subarray(pos, pos + l); pos += l;
    if (fieldNo === 1) {
      const entry = decodeMigrationOtpParameters(chunk);
      out.entries.push({
        name: entry.name, issuer: entry.issuer,
        type: entry.type, algorithm: entry.algorithm,
        digits: entry.digits, counter: entry.counter,
        secretBase32: base32Encode(entry.secret),
      });
    }
  }
  if (!out.entries.length) fail('迁移码中没有任何账户条目');
  return out;
}

// 编码（供 round-trip 自检与测试互证；与 Google 格式对齐的最小子集）
function varintBytes(n) {
  let v = typeof n === 'bigint' ? n : BigInt(n);
  const out = [];
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return out;
}
function lenDelimited(fieldNo, payload) {
  return [...varintBytes((fieldNo << 3) | 2), ...varintBytes(payload.length), ...payload];
}
function encodeMigration({ entries, version = 1, batchSize, batchIndex = 0, batchId = 0 }) {
  const top = [];
  for (const e of entries) {
    const inner = [];
    const secret = base32Decode(e.secretBase32);
    inner.push(...lenDelimited(1, secret));
    if (e.name) inner.push(...lenDelimited(2, Buffer.from(String(e.name), 'utf8')));
    if (e.issuer) inner.push(...lenDelimited(3, Buffer.from(String(e.issuer), 'utf8')));
    const algoIdx = { SHA1: 1, SHA256: 2, SHA512: 3 }[e.algorithm] || 1;
    inner.push(...varintBytes((4 << 3) | 0), ...varintBytes(algoIdx));
    inner.push(...varintBytes((5 << 3) | 0), ...varintBytes(e.digits === 8 ? 2 : 1));
    inner.push(...varintBytes((6 << 3) | 0), ...varintBytes(e.type === 'HOTP' ? 1 : 2));
    if (e.type === 'HOTP') inner.push(...varintBytes((7 << 3) | 0), ...varintBytes(e.counter || 0));
    top.push(...lenDelimited(1, inner));
  }
  top.push(...varintBytes((2 << 3) | 0), ...varintBytes(version));
  const bs = batchSize == null ? entries.length : batchSize;
  top.push(...varintBytes((3 << 3) | 0), ...varintBytes(bs));
  top.push(...varintBytes((4 << 3) | 0), ...varintBytes(batchIndex));
  top.push(...varintBytes((5 << 3) | 0), ...varintBytes(batchId));
  return Buffer.from(top).toString('base64');
}

// ── MECARD（联系人精简格式）────────────────────────────────────────────────
function parseMecard(text) {
  if (!isStr(text) || !text.startsWith('MECARD:')) return null;
  const out = {};
  const body = text.slice(7).replace(/;;\s*$/, '');
  // MECARD 值内用 \ 转义 ; 与 ,
  const fields = [];
  let cur = '', esc = false;
  for (const ch of body) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; cur += ch; continue; }
    if (ch === ';') { fields.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) fields.push(cur);
  for (const f of fields) {
    const colon = f.indexOf(':');
    if (colon <= 0) continue;
    const k = f.slice(0, colon).toUpperCase();
    const v = f.slice(colon + 1).replace(/\\([;,:\\])/g, '$1');
    if (k === 'N') out.name = v;
    else if (k === 'TEL') out.tel = (out.tel || []).concat(v);
    else if (k === 'EMAIL') out.email = v;
    else if (k === 'URL') out.url = v;
    else if (k === 'ADR') out.adr = v;
    else if (k === 'BDAY') out.bday = v;
  }
  return out;
}

// ── classify / inspect ──────────────────────────────────────────────────────
/**
 * 识别载荷类型。返回 type ∈
 * otpauth-migration | otpauth | wifi | vcard | mecard | url | mailto | tel | sms | geo | text
 */
function classify(text) {
  if (!isStr(text) || !text.trim().length) fail('载荷为空');
  const t = text.trim();
  if (t.startsWith('otpauth-migration://')) return 'otpauth-migration';
  if (t.startsWith('otpauth://')) return 'otpauth';
  if (t.startsWith('WIFI:')) return 'wifi';
  if (/^BEGIN:VCARD\r?\n/i.test(t.replace(/^\uFEFF/, ''))) return 'vcard';
  if (t.startsWith('MECARD:')) return 'mecard';
  if (/^https?:\/\//i.test(t)) return 'url';
  if (/^mailto:/i.test(t)) return 'mailto';
  if (/^tel:/i.test(t)) return 'tel';
  if (/^(sms|smsto):/i.test(t)) return 'sms';
  if (/^geo:/i.test(t)) return 'geo';
  return 'text';
}

function safeUrlParse(u) {
  try { return new URL(u); } catch (_) { return null; }
}

function describeUrl(u) {
  const url = safeUrlParse(u);
  if (!url) return { raw: u, parseError: 'URL 解析失败' };
  const params = [];
  for (const [k, v] of url.searchParams) params.push({ key: k, value: v });
  return {
    origin: url.origin, host: url.hostname, port: url.port || '', path: url.pathname,
    params, hash: url.hash || '', credentials: url.username ? 'URL 中内嵌了用户名/密码（敏感）' : null,
  };
}

function describeMailto(t) {
  const m = t.match(/^mailto:([^?]*)\??(.*)$/i);
  if (!m) return { raw: t };
  const params = [];
  for (const [k, v] of new URLSearchParams(m[2] || '')) params.push({ key: k, value: v });
  return { to: decodeURIComponent(m[1] || ''), params };
}

function describeTel(t) {
  const m = t.match(/^tel:(.*)$/i);
  return m ? { number: m[1] } : { raw: t };
}

function describeSms(t) {
  const m = t.match(/^(?:sms|smsto):([^:?]*)(?:\?(.*))?$/i);
  if (!m) return { raw: t };
  const body = new URLSearchParams(m[2] || '').get('body') || '';
  return { number: m[1], body };
}

function describeGeo(t) {
  const m = t.match(/^geo:([^,]*)(?:,([^?]*))?(?:\?(.*))?$/i);
  if (!m) return { raw: t };
  const q = new URLSearchParams(m[3] || '');
  return { latitude: m[1], longitude: m[2] || '', zoom: q.get('z') || '' };
}

/**
 * 全量解读：type + 结构化字段 +（OTP 类）当前码预览。
 * 注意：结果含 2FA secret/密码等敏感字段——调用方负责日志脱敏。
 */
function inspect(text, { nowMs } = {}) {
  const type = classify(text);
  const base = { type, byteLength: utf8Len(text.trim()) };
  const t = text.trim();
  if (type === 'wifi') return { ...base, fields: parseWifi(t) };
  if (type === 'vcard') return { ...base, fields: parseVcard(t) };
  if (type === 'mecard') return { ...base, fields: parseMecard(t) };
  if (type === 'otpauth') {
    const parsed = parseOtpauth(t);
    return { ...base, fields: publicOtp(parsed), preview: otpPreview(parsed, nowMs) };
  }
  if (type === 'otpauth-migration') {
    const mig = decodeMigration(t);
    return {
      ...base,
      version: mig.version, batchSize: mig.batchSize, batchIndex: mig.batchIndex, batchId: mig.batchId,
      entries: mig.entries.map((e) => {
        const fields = publicOtp({ ...e, type: e.type.toLowerCase(), label: e.name, secretBase32: e.secretBase32 });
        const preview = otpPreview({ ...fields, type: e.type.toLowerCase() }, nowMs);
        return { ...fields, preview };
      }),
    };
  }
  if (type === 'url') return { ...base, fields: describeUrl(t) };
  if (type === 'mailto') return { ...base, fields: describeMailto(t) };
  if (type === 'tel') return { ...base, fields: describeTel(t) };
  if (type === 'sms') return { ...base, fields: describeSms(t) };
  if (type === 'geo') return { ...base, fields: describeGeo(t) };
  return { ...base, fields: { length: t.length, lines: t.split(/\r\n|\n|\r/).length, hasNonAscii: /[^\x00-\x7f]/.test(t) } };
}

/** OTP 字段去掉原始 secretBuf 引用（secretBase32 保留：解读迁移码/otpauth 的意义就在此） */
function publicOtp(p) {
  return {
    type: p.type, label: p.label, issuer: p.issuer, account: p.account,
    secretBase32: p.secretBase32, algorithm: p.algorithm, digits: p.digits,
    period: p.period, counter: p.counter,
  };
}

// ── 模板构建总入口 ──────────────────────────────────────────────────────────
/**
 * template: {type:'text'|'url'|'wifi'|'vcard'|'otpauth', fields}
 * 返回载荷文本；text 直接透传。
 */
function buildPayload(template) {
  if (!template || !template.type) fail('template.type 缺失');
  const type = String(template.type);
  const f = template.fields || {};
  if (type === 'text') {
    const s = isStr(f.text) ? f.text : String(f.text == null ? '' : f.text);
    if (!s.length) fail('文本内容为空');
    return s;
  }
  if (type === 'url') {
    if (!isStr(f.url) || !/^https?:\/\//i.test(f.url)) fail('URL 需以 http(s):// 开头');
    return f.url;
  }
  if (type === 'wifi') return buildWifi(f);
  if (type === 'vcard') return buildVcard(f);
  if (type === 'otpauth') return buildOtpauth({ ...f, type: f.otpType || 'totp' });
  fail(`未知模板类型 ${type}（支持 text/url/wifi/vcard/otpauth）`);
}

// ── CSV（RFC 4180 子集）────────────────────────────────────────────────────
/** 解析 CSV → string[][]；支持引号包裹、双引号转义、CRLF/LF、BOM。至少一行表头。 */
function parseCsv(text) {
  if (!isStr(text) || !text.trim().length) fail('CSV 内容为空');
  const s = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', inQ = false, i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(cell); cell = '';
      rows.push(row); row = [];
      if (ch === '\r' && s[i + 1] === '\n') i += 2; else i++;
      continue;
    }
    cell += ch; i++;
  }
  row.push(cell);
  rows.push(row);
  // 去掉末尾空行
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  if (!rows.length) fail('CSV 没有有效数据行');
  return rows;
}

/** CSV 文本 → {headers, rows(对象数组)}；列数不齐按最宽表头补空 */
function csvToObjects(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map((h) => h.trim());
  if (!headers.some(Boolean)) fail('CSV 表头全为空');
  const out = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = r[idx] == null ? '' : r[idx]; });
    return obj;
  });
  return { headers, rows: out };
}

// ── 批量计划 ───────────────────────────────────────────────────────────────
/**
 * rows: 对象数组（来自 JSON 或 csvToObjects）；template: {type, fields, nameCol?}
 * fields 值中的 {列名} 会被行值替换（载荷与文件名都可用）。
 * 返回 [{fileName, payload, rowIndex}]；不做 IO。
 */
function planBatch({ rows, template, fileBase = 'qr', nameCol = '' }) {
  if (!Array.isArray(rows) || !rows.length) fail('批量行数据为空');
  if (rows.length > MAX_BATCH_ROWS) fail(`批量行数超上限 ${MAX_BATCH_ROWS}（收到 ${rows.length}）`);
  if (!template || !template.type) fail('批量 template.type 缺失');
  const base = String(fileBase || 'qr').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'qr';
  const seen = new Map();
  const plan = [];
  rows.forEach((row, idx) => {
    if (!row || typeof row !== 'object') fail(`第 ${idx + 1} 行不是对象`);
    const fields = {};
    for (const [k, v] of Object.entries(template.fields || {})) {
      fields[k] = isStr(v) ? v.replace(/\{([^{}]+)\}/g, (_, col) => {
        if (!(col in row)) fail(`第 ${idx + 1} 行缺少模板列 {${col}}（可用列：${Object.keys(row).join(', ')}）`);
        return String(row[col]);
      }) : v;
    }
    const payload = buildPayload({ type: template.type, fields });
    if (utf8Len(payload) > MAX_QR_BYTES) fail(`第 ${idx + 1} 行载荷超过 QR 容量（${utf8Len(payload)} 字节）`);
    let nameSrc = '';
    if (nameCol && row[nameCol] != null) nameSrc = String(row[nameCol]);
    else if (fields.ssid) nameSrc = fields.ssid;
    else if (fields.name) nameSrc = fields.name;
    else if (fields.label) nameSrc = fields.label;
    const safe = (nameSrc || String(idx + 1)).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    let fileName = `${base}-${safe}.png`;
    const n = seen.get(fileName) || 0;
    seen.set(fileName, n + 1);
    if (n > 0) fileName = `${base}-${safe}-${n + 1}.png`;
    plan.push({ fileName, payload, rowIndex: idx });
  });
  return plan;
}

module.exports = {
  // 常量
  MAX_QR_BYTES, MAX_BATCH_ROWS,
  // wifi
  wifiEscape, wifiUnescape, buildWifi, parseWifi,
  // vcard
  vcardEscape, vcardUnescape, buildVcard, parseVcard,
  // otp
  base32Decode, base32Encode, hotp, totp, totpRemainingMs,
  buildOtpauth, parseOtpauth, otpPreview,
  // migration
  decodeMigration, encodeMigration,
  // mecard/classify/inspect
  parseMecard, classify, inspect,
  // template/csv/batch
  buildPayload, parseCsv, csvToObjects, planBatch,
};
