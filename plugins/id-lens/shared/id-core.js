'use strict';
/**
 * id-core.js —— 标识符调试台共享核心(单一权威,运行时零依赖、零 node 内置模块)。
 * 被 MCP server(esbuild bundle)与面板(browser bundle)共用。
 * 依赖纪律:只允许全局 BigInt / Map / Set(双端内置);禁止 require 任何模块。
 *
 * 职责:
 *  1. detectFamily     家族自动识别:UUID(canonical/urn/braces/无连字符)→ ULID → 纯数字(Snowflake)
 *  2. parseId          位域逐段解读(BigInt 全程精确;>2^53 数值一律字符串输出,防 double 丢精度)
 *  3. validateId       规范性校验(版本/变体/大小写/形态/Crockford 混淆字符/时间合理性/纪元耗尽)
 *  4. convertId        形态互转(canonical/urn/braces/hyphenless/decimal/bitstring/ULID↔UUID128)
 *
 * 位布局依据(RFC 9562 / ULID spec / Twitter Snowflake,全部已知向量实测定标见 test/run-tests.mjs):
 *  - UUID v1:60 位 Gregorian 纪元(1582-10-15)100ns 计数;换算 Unix 加常量 122192928000000000(单位 100ns)
 *  - UUID v6:同 60 位时间戳按高位在前重排(RFC 9562 新增,供排序)
 *  - UUID v7:48 位 Unix 毫秒 + rand_a(12) + rand_b(62)
 *  - ULID:26 字符 Crockford Base32 = 130 位(前 2 位丢弃)= 48 位 Unix 毫秒 + 80 位随机
 *  - Snowflake:1 符号 + 41 位毫秒时间戳(自定义纪元)+ 10 位机器 + 12 位序列;
 *    Twitter 纪元 1288834974657(2010-11-04T01:42:54.657Z),Discord 纪元 1420070400000(2015-01-01)
 *
 * 边界(如实声明):纯解码器——不做 ID 生成(随机性),不做 v3/v5 名字散列重算(散列不可逆),
 * 不做溯源查询;v2/v8 只解析结构;ULID↔UUID 互转是编码层(位相同),语义字段不保证。
 */

const UUID_RE_CANON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_RE_BRACES = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i;
const UUID_RE_URN = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_RE_HYPHENLESS = /^[0-9a-f]{32}$/i;
// Crockford Base32:排除 I/L/O/U(规范字母表 0-9 A-Z 去四字母);输入大小写均收,小写非规范
const ULID_RE = /^[0-9A-HJ-NP-TV-Z]{26}$/i;
const SNOWFLAKE_RE = /^\d{1,20}$/;

const GREGORIAN_100NS_OFFSET = 122192928000000000n; // 1582-10-15 → 1970-01-01 的 100ns 数(RFC 9562 依据)
const EPOCHS = {
  twitter: { label: 'Twitter', epochMs: 1288834974657n, note: '2010-11-04T01:42:54.657Z' },
  discord: { label: 'Discord', epochMs: 1420070400000n, note: '2015-01-01T00:00:00Z' },
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_DECODE = (() => {
  const m = new Map();
  for (let i = 0; i < CROCKFORD.length; i++) m.set(CROCKFORD[i], BigInt(i));
  // 宽容别名:O→0,I/L→1(仅用于「疑似混淆」定位;规范解码遇 I/L/O/U 直接报错并指位)
  m.set('O', 0n); m.set('I', 1n); m.set('L', 1n);
  return m;
})();

const DOW_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n) { return String(n).padStart(2, '0'); }

/** Unix 毫秒(BigInt)→ ISO 字符串(毫秒精度);范围异常返回 null 而非抛错 */
function isoFromEpochMs(epochMs) {
  if (epochMs < -62135596800000n || epochMs > 253402300799999n) return null; // 0001-9999 年域
  // 整日拆分必须 floor(向负无穷):-1ms 是 1969-12-31 的 86399999ms,不是「-0 日的 -1ms」
  const days = epochMs >= 0n ? epochMs / 86400000n : -((-epochMs + 86399999n) / 86400000n);
  const rem = epochMs - days * 86400000n; // 恒非负 [0, 86400000)
  // civil_from_days(纯 Number 版,±2^53 天内精确,远超 0001-9999 域)
  let z = Number(days) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mo = mp + (mp < 10 ? 3 : -9);
  if (mo <= 2) y += 1;
  const h = rem / 3600000n;
  const mi = (rem % 3600000n) / 60000n;
  const s = (rem % 60000n) / 1000n;
  const ms = rem % 1000n;
  return `${String(y).padStart(4, '0')}-${pad2(mo)}-${pad2(d)}T${pad2(Number(h))}:${pad2(Number(mi))}:${pad2(Number(s))}.${String(Number(ms)).padStart(3, '0')}Z`;
}

function dowFromEpochMs(epochMs) {
  // 1970-01-01 是周四;BigInt 模运算按数学余数处理负值
  const days = epochMs >= 0n ? epochMs / 86400000n : -((-epochMs + 86399999n) / 86400000n);
  return Number(((days % 7n) + 11n) % 7n); // 0=周日
}

// ---------- 家族识别 ----------

/** 剥形态外壳:{…} / urn:uuid: → canonical 串;返回 null 表示外壳非法 */
function stripUuidShell(s) {
  if (UUID_RE_CANON.test(s)) return { canon: s.toLowerCase(), shape: 'canonical' };
  if (UUID_RE_BRACES.test(s)) return { canon: s.slice(1, -1).toLowerCase(), shape: 'braces' };
  if (UUID_RE_URN.test(s)) return { canon: s.slice(9).toLowerCase(), shape: 'urn' };
  if (UUID_RE_HYPHENLESS.test(s)) {
    const c = s.toLowerCase();
    return { canon: `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`, shape: 'hyphenless' };
  }
  return null;
}

/** UUID 串常见破绽定位(用于识别失败时给最近原因):非法 hex 字符 / 段长错 / 分隔符错 */
function uuidNearMiss(s) {
  const body = s.replace(/^\{|\}$/g, '').replace(/^urn:uuid:/i, '');
  const badHex = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (/[0-9a-fA-F]/.test(ch) || ch === '-') continue;
    badHex.push({ pos: i + 1, ch });
  }
  if (badHex.length) {
    return `含非十六进制字符:${badHex.slice(0, 4).map((b) => `第 ${b.pos} 位「${b.ch}」`).join('、')}。注意 Crockford 风格的 I/L/O 在 UUID 中非法。`;
  }
  if (body.length !== 36) return `长度 ${body.length},canonical 须 36(32 hex + 4 连字符);无连字符形态须 32。`;
  const parts = body.split('-');
  if (parts.length !== 5) return `连字符分组 ${parts.length} 段,须 5 段(8-4-4-4-12)。`;
  const lens = parts.map((p) => p.length).join('-');
  if (lens !== '8-4-4-4-12') return `段长 ${lens},须 8-4-4-4-12。`;
  return '形态接近 canonical UUID,请检查各段长度。';
}

/** 家族识别。返回 { family, canon, shape } 或 { family:'unknown', error } */
function detectFamily(input, opts) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return { family: 'unknown', error: { code: 'EMPTY', message: '空输入' } };
  const stripped = stripUuidShell(s);
  if (stripped) return { family: 'uuid', canon: stripped.canon, shape: stripped.shape };
  if (ULID_RE.test(s)) return { family: 'ulid', canon: s.toUpperCase(), shape: /[a-z]/.test(s) ? 'lowercase' : 'canonical' };
  // 26 位字母数字但含 Crockford 排除字母(I/L/O/U):不拦在识别层,转交 parseUlid 做精确指位报错
  if (/^[0-9a-zA-Z]{26}$/.test(s) && /[ILOU]/.test(s.toUpperCase()) && [...s.toUpperCase()].every((ch) => 'ILOU'.includes(ch) || CROCKFORD.includes(ch))) {
    return { family: 'ulid', canon: s.toUpperCase(), shape: /[a-z]/.test(s) ? 'lowercase' : 'canonical' };
  }
  if (SNOWFLAKE_RE.test(s)) return { family: 'snowflake', canon: s.replace(/^0+(?=\d)/, ''), shape: 'decimal' };
  // 全不识别:按「最像谁」给最近原因
  const hexy = /[0-9a-fA-F]/.test(s) && /-/.test(s);
  if (hexy) return { family: 'unknown', error: { code: 'UNRECOGNIZED', message: '像 UUID 但形态不合规', hint: uuidNearMiss(s) } };
  if (/^[0-9a-zA-Z]+$/.test(s) && s.length >= 20 && s.length <= 30) {
    return { family: 'unknown', error: { code: 'ULID_BADCHAR', message: `26 字符 Base32 形态须匹配 ULID(实际 ${s.length} 字符),或含 Crockford 排除字母(I/L/O/U)`, hint: 'ULID 字母表:0-9 与 A-Z 去掉 I、L、O、U;检查这四个混淆字母。' } };
  }
  if (/^\d+$/.test(s)) return { family: 'unknown', error: { code: 'SNOWFLAKE_RANGE', message: `${s.length} 位数字超出 64 位无符号域(≤20 位)`, hint: 'Snowflake 是 64 位整数,十进制 ≤20 位。' } };
  return { family: 'unknown', error: { code: 'UNRECOGNIZED', message: `无法识别的标识符:${s.length > 60 ? s.slice(0, 60) + '…' : s}`, hint: '支持:UUID(canonical/urn/braces/无连字符)、ULID(26 字符 Crockford Base32)、Snowflake(纯数字 ≤20 位)。' } };
}

// ---------- UUID 解析 ----------

const UUID_VERSIONS = {
  1: 'v1:时间戳优先(Gregorian 纪元 100ns + clock seq + node/MAC)',
  2: 'v2:DCE 安全(局部标识符 + 域;极少用,时间字段被占用)',
  3: 'v3:MD5 名字空间散列(内容不可逆)',
  4: 'v4:随机(122 位随机)',
  5: 'v5:SHA-1 名字空间散列(内容不可逆)',
  6: 'v6:v1 重排版(时间高位在前,可按字典序排序;RFC 9562 新增)',
  7: 'v7:Unix 毫秒时间戳 + 有序随机(RFC 9562 新增,推荐)',
  8: 'v8:厂商自定义(只保证版本/变体位)',
};

const VARIANT_NAMES = {
  0: 'NCS(遗留 Apollo 网络计算系统——老古董,现代生成器不该出现)',
  1: 'NCS(遗留,bit63=0)',
  2: 'RFC 9562 / RFC 4122(标准,10xx)',
  3: 'Microsoft GUID 或保留(110x/111x,由 bit61 细分)',
};
/** 变体注记:var2=3 时用 bit61 细分 Microsoft(0)与保留(1) */
function variantName(var2, v) {
  if (var2 !== 3) return VARIANT_NAMES[var2];
  return ((v >> 61n) & 1n) === 0n ? 'Microsoft GUID(向后兼容,110x)' : '保留(未来定义,111x)';
}

/** UUID 位域解读。canon 为 36 位 canonical 形态 */
function parseUuid(canon, shape, opts) {
  const hex = canon.replace(/-/g, '');
  const v = BigInt('0x' + hex);
  const ver = Number((v >> 76n) & 0xfn);
  // 变体两位(bit63 高位在前)取整:10b=2 才是 RFC 9562 的 10xx(实测真实 v7 样本第四段 bcbe/bcce 掊穿过 1 值映射)
  const variantBits = Number((v >> 62n) & 0x3n);
  const out = {
    family: 'uuid',
    shape,
    canonical: canon,
    version: ver,
    versionNote: UUID_VERSIONS[ver] || `版本 ${ver}:RFC 9562 未定义`,
    variant: variantBits,
    variantNote: variantName(variantBits, v),
    hex128: hex,
    decimal: v.toString(),
    segments: [],
    fields: {},
    notes: [],
  };

  // 位段表(高→低,位号按 128 位 MSB=127 计)
  const seg = (name, hi, lo, val, note) => out.segments.push({ name, hi, lo, value: String(val), note: note || '' });
  if (ver === 1 || ver === 2 || ver === 6) {
    // 60 位 Gregorian 100ns:v1 低位在前(time_low/time_mid/time_hi),v6 高位在前(time_high/time_mid/time_low)
    let ts100;
    let seqLow; // clock_seq 低 12 位(v1/v6 相同位置 62-51?不——seq 在变体位之后:位 48-63 是 time_hi_and_variant?精确:v1 seq 位于 clock_seq_hi_and_reserved(含变体 2 位)+ clock_seq_low = 14 位有效)
    if (ver === 6) {
      // RFC 9562 v6 重排:time_high(32)在前 → time_mid(16) → ver → time_low(12);时间戳 60 位 = high<<28|mid<<12|low
      const tHigh = (v >> 96n) & 0xffffffffn;
      const tMid = (v >> 80n) & 0xffffn;
      const tLow = (v >> 64n) & 0xfffn;
      ts100 = (tHigh << 28n) | (tMid << 12n) | tLow;
      seqLow = (v >> 48n) & 0x3fffn; // 14 位(clock_seq_hi_and_reserved 剔除 2 变体位 + clock_seq_low)
      seg('time_high', 127, 96, tHigh, '时间戳高 32 位(v6 重排:高位在前,可字典序排序)');
      seg('time_mid', 95, 80, tMid, '时间戳中 16 位');
      seg('ver', 79, 76, ver, '版本位(4)');
      seg('time_low', 75, 64, tLow, '时间戳低 12 位');
      seg('var', 63, 62, variantBits, '变体位(2)');
      seg('clock_seq', 61, 48, seqLow, '时钟序列(14)');
      seg('node', 47, 0, v & 0xffffffffffffn, '48 位节点(MAC/随机)');
    } else {
      const tLow = (v >> 96n) & 0xffffffffn;
      const tMid = (v >> 80n) & 0xffffn;
      const tHi = (v >> 64n) & 0xfffn;
      ts100 = (tHi << 48n) | (tMid << 32n) | tLow;
      seqLow = (v >> 48n) & 0x3fffn; // 14 位,同 v6
      seg(ver === 1 ? 'time_low' : 'local_id', 127, 96, tLow, ver === 1 ? '时间戳低 32 位(100ns)' : 'v2:局部标识符(占用时间字段)');
      seg('time_mid', 95, 80, tMid, '时间戳中 16 位');
      seg('ver', 79, 76, ver, '版本位(4)');
      seg('time_hi', 75, 64, tHi, '时间戳高 12 位');
      seg('var', 63, 62, variantBits, '变体位(2)');
      seg('clock_seq', 61, 48, seqLow, '时钟序列(14)');
      seg('node', 47, 0, v & 0xffffffffffffn, '48 位节点(MAC/随机)');
    }
    const unix100 = ts100 - GREGORIAN_100NS_OFFSET;
    if (unix100 >= 0n) {
      const ms = unix100 / 10000n; // 100ns → ms(截断)
      out.fields.timestamp100ns = ts100.toString();
      out.fields.epochMs = ms.toString();
      out.fields.time = isoFromEpochMs(ms) || null;
    } else {
      out.fields.timestamp100ns = ts100.toString();
      out.fields.time = null;
      out.notes.push('时间戳早于 Gregorian 纪元基准(换算为负),通常是位域被挪用或手工构造。');
    }
    if (ver === 2) out.notes.push('v2 的 time_low 字段被局部标识符占用,上面的时间还原对 v2 无意义(结构保留仅供位域核对)。');
    const node = v & 0xffffffffffffn;
    if (ver === 1) {
      out.fields.nodeHex = node.toString(16).padStart(12, '0');
      out.fields.multicastBit = ((node >> 40n) & 1n) === 1n;
      if (out.fields.multicastBit) out.notes.push('节点字段 multicast 位置 1:随机生成(隐私保护),不是真实 MAC 地址。');
      else out.notes.push('节点字段 multicast 位为 0:按规范应是生成主机的 MAC 地址(隐私风险,现代实现已弃用)。');
    }
  } else if (ver === 7) {
    const ts = (v >> 80n) & 0xffffffffffffn; // 48 位毫秒
    const randA = (v >> 64n) & 0xfffn;
    const randB = v & 0x3fffffffffffffn; // 62 位
    seg('unix_ts_ms', 127, 80, ts, '48 位 Unix 毫秒');
    seg('ver', 79, 76, ver, '版本位(4)');
    seg('rand_a', 75, 64, randA, '12 位随机(可作单调计数器)');
    seg('var', 63, 62, variantBits, '变体位(2)');
    seg('rand_b', 61, 0, randB, '62 位随机');
    out.fields.epochMs = ts.toString();
    out.fields.time = isoFromEpochMs(ts) || null;
    out.fields.dow = DOW_LABELS[dowFromEpochMs(ts)];
  } else if (ver === 4) {
    seg('random', 127, 80, (v >> 80n) & 0xffffffffffffn, '随机(高 48 位)');
    seg('ver', 79, 76, ver, '版本位(4)');
    seg('random', 75, 64, (v >> 64n) & 0xfffn, '随机(中 12 位)');
    seg('var', 63, 62, variantBits, '变体位(2)');
    seg('random', 61, 0, v & 0x3fffffffffffffn, '随机(低 62 位;变体位已嵌其中)');
    out.fields.randomBits = '122 位随机,无时间信息';
  } else {
    // v2/v3/v5/v8/未知:只给结构段
    seg('a', 127, 96, (v >> 96n) & 0xffffffffn, ver === 3 || ver === 5 ? '名字散列高 32 位(不可逆)' : '自定义/占位');
    seg('b', 95, 80, (v >> 80n) & 0xffffn, ver === 3 || ver === 5 ? '散列中 16 位' : '自定义/占位');
    seg('ver', 79, 76, ver, '版本位(4)');
    seg('c', 75, 64, (v >> 64n) & 0xfffn, ver === 3 || ver === 5 ? '散列次 12 位' : '自定义/占位');
    seg('var', 63, 62, variantBits, '变体位(2)');
    seg('d', 61, 0, v & 0x3fffffffffffffn, ver === 3 || ver === 5 ? '散列低 62 位' : '自定义/占位');
    if (ver === 3 || ver === 5) out.notes.push('名字空间散列版本:内容 = Hash(namespace, name),不可还原;重算需要原 namespace 与 name(本工具不做)。');
  }
  return out;
}

// ---------- ULID ----------

function ulidDecode(s) {
  // 输入已过大写归一;先做混淆字符定位(规范解码遇 I/L/O/U 必须报错而非宽容换算)
  const bad = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ('ILOU'.includes(ch)) bad.push({ pos: i + 1, ch });
  }
  if (bad.length) {
    return { ok: false, error: { code: 'ULID_CONFUSABLE', message: `ULID 含 Crockford 排除字母:${bad.slice(0, 5).map((b) => `第 ${b.pos} 位「${b.ch}」`).join('、')}`, hint: 'ULID 字母表是 0-9 + A-Z 去掉 I、L、O、U(防手抄混淆)。O→0、I/L→1 是常见手抄错;若确认是抄写误差可手动替换后重试。' } };
  }
  let v = 0n;
  for (const ch of s) v = (v << 5n) | CROCKFORD_DECODE.get(ch);
  // 26×5=130 位,前 2 位规范恒 0(ULID 编码器丢弃);非 0 说明编码器不合规
  const overflow = v >> 128n;
  v &= (1n << 128n) - 1n;
  return { ok: true, v, overflow, ts: v >> 80n, rand: v & ((1n << 80n) - 1n) };
}

function ulidEncode(v) {
  let rest = v & ((1n << 128n) - 1n);
  const chars = new Array(26);
  for (let i = 25; i >= 0; i--) {
    chars[i] = CROCKFORD[Number(rest & 31n)];
    rest >>= 5n;
  }
  return chars.join('');
}

function parseUlid(canon, shape, opts) {
  const dec = ulidDecode(canon);
  if (!dec.ok) return { ...dec, family: 'ulid' };
  const v = dec.v;
  const ts = v >> 80n;
  const rand = v & ((1n << 80n) - 1n);
  const out = {
    family: 'ulid',
    shape,
    canonical: canon,
    hex128: v.toString(16).padStart(32, '0'),
    decimal: v.toString(),
    segments: [],
    fields: {},
    notes: [],
  };
  out.segments.push({ name: 'unix_ts_ms', hi: 127, lo: 80, value: ts.toString(), note: '48 位 Unix 毫秒(可排序)' });
  out.segments.push({ name: 'randomness', hi: 79, lo: 0, value: rand.toString(), note: '80 位随机' });
  out.fields.epochMs = ts.toString();
  out.fields.time = isoFromEpochMs(ts) || null;
  out.fields.dow = DOW_LABELS[dowFromEpochMs(ts)];
  out.fields.randomnessHex = rand.toString(16).padStart(20, '0');
  if (shape === 'lowercase') out.notes.push('ULID 规范仅大写;小写可解码(多数实现宽容)但非规范形态,部分严格实现会拒收。');
  if (dec.overflow !== 0n) out.notes.push('编码值超出 128 位(前 2 位非 0):编码器不合规,已按 128 位截断解读。');
  return out;
}

// ---------- Snowflake ----------

/** opts.layout: 'twitter' | 'discord'(缺省 twitter)——纪元枚举,不开放任意 epoch(MCP 参数一义) */
function parseSnowflake(canon, shape, opts) {
  const layout = opts && opts.layout === 'discord' ? 'discord' : 'twitter';
  const ep = EPOCHS[layout];
  let v;
  try { v = BigInt(canon); } catch (_) {
    return { family: 'snowflake', ok: false, error: { code: 'SNOWFLAKE_RANGE', message: '数字超出 BigInt 可解析域' } };
  }
  if (v < 0n || v >> 64n !== 0n) {
    return { family: 'snowflake', ok: false, error: { code: 'SNOWFLAKE_RANGE', message: `${canon} 不在 64 位无符号域内`, hint: 'Snowflake 布局 1+41+10+12=64 位。' } };
  }
  const sign = (v >> 63n) & 1n;
  const ts = (v >> 22n) & 0x1ffffffffffn; // 41 位
  const machine = (v >> 12n) & 0x3ffn; // 10 位(worker+datacenter 部署拆分 5+5 是 Twitter 侧约定)
  const seq = v & 0xfffn; // 12 位
  const epochMs = ep.epochMs + ts;
  const out = {
    family: 'snowflake',
    shape,
    canonical: canon,
    layout,
    epochLabel: `${ep.label}(epoch=${ep.epochMs},即 ${ep.note})`,
    decimal: v.toString(),
    hex64: v.toString(16).padStart(16, '0'),
    segments: [],
    fields: {},
    notes: [],
  };
  out.segments.push({ name: 'sign', hi: 63, lo: 63, value: sign.toString(), note: '符号位(规范恒 0)' });
  out.segments.push({ name: 'delta_ms', hi: 62, lo: 22, value: ts.toString(), note: `41 位毫秒,自 ${ep.label} 纪元起` });
  out.segments.push({ name: 'machine', hi: 21, lo: 12, value: machine.toString(), note: '10 位机器(worker+datacenter;Twitter 惯例 5+5 拆分是部署约定)' });
  out.segments.push({ name: 'seq', hi: 11, lo: 0, value: seq.toString(), note: '12 位同毫秒序列(单机每毫秒 ≤4096)' });
  out.fields.epochMs = epochMs.toString();
  out.fields.time = isoFromEpochMs(epochMs) || null;
  out.fields.dow = DOW_LABELS[dowFromEpochMs(epochMs)];
  out.fields.machine = machine.toString();
  out.fields.seq = seq.toString();
  // 布局 1+41+10+12 的合法值符号位恒 0:符号位=1 说明值在负数域/高位被占用,是「溢出」的真正承载位
  // (41 位掩码后 ts 恒 ≤ maxTs,「ts 超 41 位」在掩码后不可达——溢出语义不能放在掩码之后判)
  if (sign !== 0n) {
    return { family: 'snowflake', ok: false, error: { code: 'SNOWFLAKE_SIGN', message: `${canon} 的符号位为 1:不在标准 Snowflake 值域内(合法值最高位恒 0,2^63 以上即越界)`, hint: '若来源系统确实产生此类值,说明其位布局与本工具假设的 1+41+10+12 不同,须按其实际布局解读。' } };
  }
  // 41 位耗尽提醒:ts 达到 2^41-1 即纪元+2^41 ms(掩码后 ts 恒 ≤ maxTs,只有「耗尽/临期」两态,无「溢出」态)
  const maxTs = (1n << 41n) - 1n;
  out.fields.epochExhaustAt = isoFromEpochMs(ep.epochMs + maxTs);
  if (ts === maxTs) out.notes.push(`时间戳已到 41 位上限(${out.fields.epochExhaustAt}):临近耗尽。`);
  else if (ts > maxTs - (90n * 24n * 3600000n)) out.notes.push('时间戳距 41 位上限不足 90 天。');
  return out;
}

// ---------- 统一解析入口 ----------

function parseId(input, opts) {
  const det = detectFamily(input, opts);
  if (det.family === 'unknown') return { ok: false, error: det.error };
  let r;
  if (det.family === 'uuid') r = parseUuid(det.canon, det.shape, opts);
  else if (det.family === 'ulid') r = parseUlid(det.canon, det.shape, opts);
  else r = parseSnowflake(det.canon, det.shape, opts);
  if (r.ok === false) return r;
  return { ok: true, ...r, notes: r.notes || [] };
}

// ---------- 规范性校验 ----------

function nowMs() { return Date.now(); } // 唯一 now 注入口(测试可 mock Date.now)

/** 规范性校验清单。返回 { ok, items: [{level, rule, message, hint}] };ok=false 表示结构性错误(无法解析) */
function validateId(input, opts) {
  const items = [];
  const push = (level, rule, message, hint) => items.push({ level, rule, message, hint: hint || '' });
  const p = parseId(input, opts);
  if (!p.ok) return { ok: false, items: [{ level: 'error', rule: 'unparseable', message: p.error.message, hint: p.error.hint || '' }] };
  const s = String(input).trim();

  // 形态与大小写(全家族通用)
  if (p.family === 'uuid') {
    if (p.shape === 'braces') push('info', 'shape-braces', '带大括号形态:合法(Windows/COM 生态常用),非 canonical。');
    if (p.shape === 'urn') push('info', 'shape-urn', 'URN 形态:合法(RFC 8141),非 canonical。');
    if (p.shape === 'hyphenless') push('info', 'shape-hyphenless', '无连字符形态:多数解析器可读,非 canonical 展示形态。');
    if (/[A-F]/.test(s.replace(/^\{|\}$/g, '').replace(/^urn:uuid:/i, ''))) push('info', 'case-upper', '含大写 hex:解析大小写不敏感,但规范输出应为小写(RFC 9562 建议)。');
    if (p.variant !== 2) push('warn', 'variant-nonrfc', `变体位为 ${p.variant}(${p.variantNote}):非 RFC 9562 标准变体(10xx),现代工具链可能拒收。`);
    if (!(p.version in UUID_VERSIONS)) push('warn', 'version-undefined', `版本位 ${p.version}:RFC 9562 只定义 1-8,该值为未定义(手工构造或未来版本)。`);
    if (p.version === 0) push('warn', 'version-zero', '版本位 0:RFC 9562 未定义版本 0(全零 nil 除外)。');
    if (p.fields.time && p.version >= 1 && p.version <= 8 && p.version !== 2 && p.version !== 3 && p.version !== 4 && p.version !== 5 && p.version !== 8) {
      const t = BigInt(p.fields.epochMs);
      if (t > BigInt(nowMs()) + 315360000000n) push('info', 'time-future', `解析时间 ${p.fields.time} 在 10 年后:多半不是真时间戳(位域被挪用)。`);
    }
    if (p.version === 4 && p.variant === 1) {
      // v4 完整性:除版本/变体位外应全为随机——无法证伪,只给熵声明
    }
  } else if (p.family === 'ulid') {
    if (p.shape === 'lowercase') push('warn', 'case-lower', '含小写:ULID 规范仅大写,严格实现(部分库的严格模式)会拒收。');
    const ts = BigInt(p.fields.epochMs);
    if (ts > BigInt(nowMs()) + 315360000000n) push('info', 'time-future', `时间戳 ${p.fields.time} 在 10 年后:可能不是合法生成时间。`);
    if (ts === 0n) push('info', 'time-zero', '时间戳为 0(1970-01-01):手工构造或测试向量。');
  } else if (p.family === 'snowflake') {
    if (p.canonical !== s) push('info', 'leading-zeros', '含前导零:数值等价,非规范十进制形态。');
    const ts = BigInt(p.fields.epochMs);
    if (ts > BigInt(nowMs()) + 315360000000n) push('info', 'time-future', `时间戳 ${p.fields.time} 在 10 年后:请确认纪元选择是否正确(Twitter 与 Discord 纪元差约 4 年)。`);
    const tw = parseSnowflake(p.canonical, p.shape, { layout: 'twitter' });
    const dc = parseSnowflake(p.canonical, p.shape, { layout: 'discord' });
    if (tw.fields && dc.fields && tw.fields.time !== dc.fields.time) {
      push('info', 'epoch-ambiguous', `同一数字在 Twitter 纪元下是 ${tw.fields.time},在 Discord 纪元下是 ${dc.fields.time}——Snowflake 时间还原强依赖纪元假设,拿错纪元结论差 ${Number((EPOCHS.discord.epochMs - EPOCHS.twitter.epochMs) / 60000n)} 分钟×(1/60)小时级偏差。`);
    }
  }
  // nil / max 特例(128 位家族)
  if (p.family === 'uuid' || p.family === 'ulid') {
    const v = BigInt('0x' + p.hex128);
    if (v === 0n) push('info', 'nil-id', '全零标识符:UUID 家族是保留的 nil UUID;ULID 家族是时间戳 0 的合法形态。');
    if (p.family === 'uuid' && v === (1n << 128n) - 1n) push('info', 'max-uuid', '全 F:RFC 9562 保留的 max UUID(排序哨兵用)。');
  }
  return { ok: true, items, parsed: p };
}

// ---------- 形态互转 ----------

const CONVERT_TARGETS = ['canonical', 'uppercase', 'urn', 'braces', 'hyphenless', 'decimal', 'bitstring', 'hex128', 'ulid', 'snowflake-decimal'];

/**
 * 形态互转。128 位家族可互转 ULID(编码层:位相同,UUID 语义位变 ULID 时间戳解读时语义不保证,如实标注);
 * Snowflake(64 位)不能转 ULID(位宽不足 128,如实报错)。
 */
function convertId(input, to, opts) {
  const target = String(to || '').trim();
  if (CONVERT_TARGETS.indexOf(target) === -1) {
    return { ok: false, error: { code: 'BAD_TARGET', message: `未知目标形态 ${target}`, hint: `支持:${CONVERT_TARGETS.join(' / ')}` } };
  }
  const p = parseId(input, opts);
  if (!p.ok) return p;
  const is128 = p.family !== 'snowflake';
  if ((target === 'ulid' || target === 'canonical' || target === 'uppercase' || target === 'urn' || target === 'braces' || target === 'hyphenless') && !is128) {
    return { ok: false, error: { code: 'WIDTH', message: `Snowflake 只有 64 位,不能转为 ${target}(ULID/UUID 家族形态需要 128 位)`, hint: 'Snowflake 可转:decimal / bitstring / hex64。' } };
  }
  const v = is128 ? BigInt('0x' + p.hex128) : BigInt(p.canonical);
  const out = { ok: true, family: p.family, from: p.shape, to: target, value: null, notes: [] };
  const hex = v.toString(16).padStart(32, '0');
  const canon = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  switch (target) {
    case 'canonical': out.value = canon; break;
    case 'uppercase': out.value = canon.toUpperCase(); break;
    case 'urn': out.value = 'urn:uuid:' + canon; break;
    case 'braces': out.value = '{' + canon + '}'; break;
    case 'hyphenless': out.value = hex; break;
    case 'decimal': out.value = v.toString(); break;
    case 'bitstring': out.value = v.toString(2).padStart(is128 ? 128 : 64, '0'); break;
    case 'hex128': out.value = is128 ? hex : v.toString(16).padStart(16, '0'); break;
    case 'ulid':
      out.value = ulidEncode(v);
      if (p.family === 'uuid') out.notes.push('编码层互转:位相同、编码不同;原 UUID 的版本/变体位在 ULID 语境下会被解读为「时间戳(高 48 位)」,语义不保证。');
      break;
    case 'snowflake-decimal':
      if (!is128) out.value = p.canonical;
      else {
        if (v >> 64n !== 0n) return { ok: false, error: { code: 'WIDTH', message: '该 128 位标识符高 64 位非零,无法无损装入 Snowflake(64 位)', hint: '用 decimal/bitstring 输出全值。' } };
        out.value = v.toString();
        out.notes.push('取低 64 位重解释为 Snowflake:时间/机器字段语义不保证。');
      }
      break;
    default:
      return { ok: false, error: { code: 'BAD_TARGET', message: `目标 ${target} 未实现` } };
  }
  // round-trip 自证:每种产物的可逆性不同——bitstring/decimal/hex128/canonical 家族可精确回读,ULID 编码层可回读到 128 位
  out.roundTrip = null;
  if (target === 'bitstring' || target === 'decimal' || target === 'hex128') out.roundTrip = true;
  return out;
}

module.exports = {
  detectFamily, parseId, parseUuid, parseUlid, parseSnowflake,
  validateId, convertId,
  ulidEncode, ulidDecode, isoFromEpochMs, dowFromEpochMs,
  stripUuidShell, uuidNearMiss,
  EPOCHS, UUID_VERSIONS, VARIANT_NAMES, CONVERT_TARGETS,
  GREGORIAN_100NS_OFFSET,
};
