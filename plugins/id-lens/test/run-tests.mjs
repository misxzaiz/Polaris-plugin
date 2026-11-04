/**
 * id-lens 核心断言(node test/run-tests.mjs)
 * 断言策略(不凭记忆写标准细节——version-lens/yaml-lens 定标纪律):
 *  - 主力:位域构造 → 编码 → 解码 round-trip(构造正向写、解析反向读,两条独立代码路径互证)
 *  - 外部锚:RFC 9562 nil/max、宽流传 Discord 文档例 175928847299117063(仅域断言)
 *  - 全部 >2^53 数值以字符串断言(防 double 丢精度)
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/id-core.js');

const results = [];
let exitCode = 0;
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  if (!cond) { exitCode = 1; console.log(`  ✖ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

// ---------- 构造辅助(测试侧独立正向编码,与 core 解析路径互证) ----------
const GREG = core.GREGORIAN_100NS_OFFSET;
function buildV1(unixMs, seq, node) {
  const ts100 = BigInt(unixMs) * 10000n + GREG;
  return ((ts100 & 0xffffffffn) << 96n)
    | ((ts100 >> 32n) & 0xffffn) << 80n
    | 0x1n << 76n
    | ((ts100 >> 48n) & 0xfffn) << 64n
    | 0x2n << 62n
    | (BigInt(seq) & 0x3fffn) << 48n
    | BigInt(node) & 0xffffffffffffn;
}
function buildV6(unixMs, seq, node) {
  const ts100 = BigInt(unixMs) * 10000n + GREG;
  return ((ts100 >> 28n) & 0xffffffffn) << 96n
    | ((ts100 >> 12n) & 0xffffn) << 80n
    | 0x6n << 76n
    | (ts100 & 0xfffn) << 64n
    | 0x2n << 62n
    | (BigInt(seq) & 0x3fffn) << 48n
    | BigInt(node) & 0xffffffffffffn;
}
function buildV7(unixMs, randA, randB) {
  return BigInt(unixMs) << 80n | 0x7n << 76n | BigInt(randA) & 0xfffn << 64n | 0x2n << 62n | BigInt(randB) & ((1n << 62n) - 1n);
}
function hex128(v) {
  const h = v.toString(16).padStart(32, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const buildUlid = (ts, rand) => core.ulidEncode((BigInt(ts) << 80n) | BigInt(rand));
const buildSnow = (delta, machine, seq) => ((BigInt(delta) << 22n) | (BigInt(machine) << 12n) | BigInt(seq)).toString();

const JAN2025 = 1735689600000; // 2025-01-01T00:00:00.000Z(独立事实:公历换算,ms 整)
const JAN2025_ISO = '2025-01-01T00:00:00.000Z';

console.log('== 家族识别 ==');
let r = core.detectFamily('a6b07d06-6dbd-11ed-9a5c-325096b39f47');
check('canonical uuid 识别', r.family === 'uuid' && r.shape === 'canonical');
r = core.detectFamily('{a6b07d06-6dbd-11ed-9a5c-325096b39f47}');
check('braces 形态识别且 canon 归一', r.family === 'uuid' && r.shape === 'braces' && r.canon === 'a6b07d06-6dbd-11ed-9a5c-325096b39f47');
r = core.detectFamily('urn:uuid:a6b07d06-6dbd-11ed-9a5c-325096b39f47');
check('urn 形态识别', r.family === 'uuid' && r.shape === 'urn');
r = core.detectFamily('a6b07d066dbd11ed9a5c325096b39f47');
check('无连字符 32 hex 识别并补连字符', r.family === 'uuid' && r.canon === 'a6b07d06-6dbd-11ed-9a5c-325096b39f47');
r = core.detectFamily('01ARZ3NDEKTSV4RRFFQ69G5FAV');
check('ULID 大写识别', r.family === 'ulid' && r.shape === 'canonical');
r = core.detectFamily('01arz3ndektsv4rrffq69g5fav');
check('ULID 小写识别且标 lowercase', r.family === 'ulid' && r.shape === 'lowercase');
r = core.detectFamily('175928847299117063');
check('纯数字识别 snowflake', r.family === 'snowflake');
check('空输入 EMPTY', core.detectFamily('  ').error.code === 'EMPTY');
check('乱串 UNRECOGNIZED', core.detectFamily('hello-world').error.code === 'UNRECOGNIZED');
const uCase = core.parseId('01ARZ3NDEKTSV4RRFFQ69G5FAU');
check('26 字符含 U → parse 层 CONFUSABLE 精确指位', !uCase.ok && uCase.error.code === 'ULID_CONFUSABLE' && uCase.error.message.includes('U'), uCase.error && uCase.error.message);
r = core.parseId('a6b07d06-6dbd-11eg-9a5c-325096b39f47');
check('非法 hex g 定位提示', !r.ok && r.error.hint.includes('g'));

console.log('== UUID 位域(round-trip:构造正向 vs 解析反向)==');
r = core.parseId(hex128(buildV1(JAN2025, 0x1234, 0x000203040506n))); // node 最高字节 0x00 → 单播位 0
check('v1 round-trip 时间还原', r.ok && r.fields.epochMs === String(JAN2025), JSON.stringify(r.fields || r.error));
check('v1 时间 ISO 字符串', r.ok && r.fields.time === JAN2025_ISO, String(r.fields && r.fields.time));
check('v1 版本/变体', r.ok && r.version === 1 && r.variant === 2);
check('v1 单播节点注记(MAC 语义)', r.ok && r.notes.some((n) => n.includes('multicast 位为 0')), r.notes.join('｜'));
const v1rand = core.parseId(hex128(buildV1(JAN2025, 1, 0x010203040507n))); // node 最高字节 0x01 → 单播位 1
check('v1 multicast 位注记(随机节点)', v1rand.ok && v1rand.notes.some((n) => n.includes('随机生成')));
r = core.parseId(hex128(buildV6(JAN2025, 0x3fff, 0x0a0b0c0d0e0fn)));
check('v6 重排 round-trip 时间还原', r.ok && r.fields.epochMs === String(JAN2025), JSON.stringify(r.fields || r.error));
check('v6 版本 6', r.ok && r.version === 6);
r = core.parseId(hex128(buildV7(JAN2025, 0xabc, 0x123456789abcdefn)));
check('v7 round-trip 时间还原', r.ok && r.fields.epochMs === String(JAN2025), JSON.stringify(r.fields || r.error));
check('v7 版本/变体位', r.ok && r.version === 7 && r.variant === 2);
check('v7 ISO 与周几', r.ok && r.fields.time === JAN2025_ISO && r.fields.dow === '周三');
const v5x = core.parseId('9f86d081-8847-5fd7-ae15-fa4e2a5a1a00');
check('v5 结构解析(散列不可逆注记)', v5x.ok && v5x.version === 5 && v5x.notes.some((n) => n.includes('不可还原')), v5x.notes && v5x.notes.join('｜'));
const v4r = core.parseId('9f86d081-8847-4fd7-ae15-fa4e2a5a1a00');
check('v4 随机声明', v4r.ok && v4r.version === 4 && v4r.fields.randomBits.includes('122 位'));
r = core.parseId('00000000-0000-0000-0000-000000000000');
check('nil UUID:版本 0 变体 0', r.ok && r.version === 0 && r.variant === 0);
const vmax = core.parseId('ffffffff-ffff-ffff-ffff-ffffffffffff');
check('max UUID:版本 15 未定义 + validate max-uuid', vmax.ok && vmax.version === 15 && !core.validateId('ffffffff-ffff-ffff-ffff-ffffffffffff').items.some((i) => i.rule === 'max-uuid') === false);
check('GREG 常量锚定(1582→1970 的 100ns)', GREG === 122192928000000000n);

console.log('== UUID 校验清单 ==');
const va = core.validateId('{a6b07d06-6dbd-11ed-9a5c-325096b39f47}');
check('braces → shape-braces info', va.items.some((i) => i.rule === 'shape-braces' && i.level === 'info'));
const vb = core.validateId('A6B07D06-6DBD-11ED-9A5C-325096B39F47');
check('大写 → case-upper info', vb.items.some((i) => i.rule === 'case-upper'));
const vcHex = hex128(buildV1(JAN2025, 1, 1n)).replace(/^(.{8}-.{4}-.{1})/, (m) => m); // 正常 v1
const vvar0 = hex128(buildV1(JAN2025, 1, 1n) & ~(3n << 62n));
check('变体 0 → variant-nonrfc warn', core.validateId(vvar0).items.some((i) => i.rule === 'variant-nonrfc' && i.level === 'warn'));
const vver9 = hex128(buildV1(JAN2025, 1, 1n) | 0x9n << 76n);
check('版本 9 → version-undefined warn', core.validateId(vver9).items.some((i) => i.rule === 'version-undefined'));
const future7 = hex128(buildV7(Date.now() + 20 * 31536000000, 0, 0));
check('v7 远未来 → time-future info', core.validateId(future7).items.some((i) => i.rule === 'time-future'));

console.log('== ULID ==');
check('ULID 全零编码 26 个 0', core.ulidEncode(0n) === '00000000000000000000000000');
check('ULID 值 1 编码尾字符 1', core.ulidEncode(1n) === '00000000000000000000000001');
r = core.parseId(buildUlid(JAN2025, 0x0123456789abcdef0123n));
check('ULID round-trip 时间', r.ok && r.fields.epochMs === String(JAN2025) && r.fields.time === JAN2025_ISO, JSON.stringify(r.fields || r.error));
check('ULID 随机域 hex', r.ok && r.fields.randomnessHex === '0123456789abcdef0123');
check('ULID 版本无版本位(区别 UUID)', r.ok && r.version === undefined);
r = core.parseId(buildUlid(0, 0));
check('ULID 时间 0 → time-zero info', core.validateId(buildUlid(0, 0)).items.some((i) => i.rule === 'time-zero'));
r = core.parseId('01ARZ3NDEKTSO4RRFFQ69G5FAV');
check('混淆 O 定位报错', !r.ok && r.error.code === 'ULID_CONFUSABLE' && r.error.message.includes('O'));
r = core.parseId('01ARZ3NDEKTSI4RRFFQ69G5FAV');
check('混淆 I 定位报错', !r.ok && r.error.code === 'ULID_CONFUSABLE' && r.error.message.includes('I'));
r = core.parseId('8' + '0'.repeat(25)); // 首字符值 8 → 二进制 01000,最高 2 位 01 落在 128 位之外
check('130 位溢出截断注记', r.ok && r.notes.some((n) => n.includes('128 位截断')));
check('小写 ULID → case-lower warn', core.validateId('01arz3ndektsv4rrffq69g5fav').items.some((i) => i.rule === 'case-lower' && i.level === 'warn'));
const u128 = core.convertId(buildUlid(JAN2025, 0xffn), 'canonical');
check('ULID→canonical 位对齐', u128.ok && u128.value === hex128((BigInt(JAN2025) << 80n) | 0xffn), JSON.stringify(u128.value || u128.error));

console.log('== Snowflake ==');
const twDelta = JAN2025 - 1288834974657;
r = core.parseId(buildSnow(twDelta, 341, 2748), undefined);
check('twitter 纪元 round-trip', r.ok && r.fields.epochMs === String(JAN2025) && r.fields.time === JAN2025_ISO, JSON.stringify(r.fields || r.error));
check('twitter 机器/序列还原', r.ok && r.fields.machine === '341' && r.fields.seq === '2748');
const dcDelta = JAN2025 - 1420070400000;
r = core.parseId(buildSnow(dcDelta, 341, 2748), { layout: 'discord' });
check('discord 纪元 round-trip', r.ok && r.fields.time === JAN2025_ISO, JSON.stringify(r.fields || r.error));
const twT = core.parseId('175928847299117063');
const dcT = core.parseId('175928847299117063', { layout: 'discord' });
check('Discord 文档例:discord 纪元视角 2016-04-30 域', dcT.ok && dcT.fields.time && dcT.fields.time.startsWith('2016-04-30T11:18:25'), dcT.fields && dcT.fields.time);
check('同 ID twitter 纪元视角前移约 4 年(2012 域)', twT.ok && twT.fields.time && twT.fields.time.startsWith('2012-'), twT.fields && twT.fields.time);
check('双纪元时间差 = 纪元差常量', dcT.ok && twT.ok && (BigInt(dcT.fields.epochMs) - BigInt(twT.fields.epochMs)) === core.EPOCHS.discord.epochMs - core.EPOCHS.twitter.epochMs);
check('同一 ID 双纪元歧义提示', core.validateId('175928847299117063').items.some((i) => i.rule === 'epoch-ambiguous'));
check('前导零 → leading-zeros info', core.validateId('0175928847299117063'.slice(0, 19)).items.some((i) => i.rule === 'leading-zeros'));
check('超 64 位拒绝', !core.parseId('18446744073709551616').ok && core.parseId('18446744073709551616').error.code === 'SNOWFLAKE_RANGE');
check('负数拒绝', !core.parseId('-123').ok);
const exhaust = core.parseId(buildSnow(Number((1n << 41n) - 1n - BigInt(JAN2025 - 1288834974657)), 0, 0)); // ts 恰为 2^41-1
check('41 位上限耗尽时刻 = 纪元+2^41-1 且 2080 域', exhaust.ok && exhaust.fields.epochExhaustAt === core.isoFromEpochMs(core.EPOCHS.twitter.epochMs + ((1n << 41n) - 1n)) && exhaust.fields.epochExhaustAt.startsWith('2080-'), exhaust.fields && exhaust.fields.epochExhaustAt);
check('64 位全 1 → 符号位越界错误', !core.parseId('18446744073709551615').ok && core.parseId('18446744073709551615').error.code === 'SNOWFLAKE_SIGN');
check('seq 4095 边界', core.parseId(buildSnow(twDelta, 0, 4095)).fields.seq === '4095');
check('machine 1023 边界', core.parseId(buildSnow(twDelta, 1023, 0)).fields.machine === '1023');
check('缺省 layout=twitter', core.parseId(buildSnow(twDelta, 1, 1)).layout === 'twitter');

console.log('== 形态转换 ==');
const u = 'a6b07d06-6dbd-11ed-9a5c-325096b39f47';
const big = BigInt('0x' + u.replace(/-/g, ''));
check('→urn', core.convertId(u, 'urn').value === 'urn:uuid:' + u);
check('→braces', core.convertId(u, 'braces').value === '{' + u + '}');
check('→hyphenless 32 位', core.convertId(u, 'hyphenless').value === u.replace(/-/g, ''));
check('→decimal 字符串保精度', core.convertId(u, 'decimal').value === big.toString());
check('→bitstring 128 位', core.convertId(u, 'bitstring').value === big.toString(2).padStart(128, '0'));
check('→hex128', core.convertId(u, 'hex128').value === u.replace(/-/g, ''));
check('→uppercase', core.convertId(u, 'uppercase').value === u.toUpperCase());
const toUlid = core.convertId(u, 'ulid');
check('→ulid 26 字符 Crockford', toUlid.ok && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(toUlid.value));
check('ULID→canonical→ULID round-trip', core.convertId(core.convertId(u, 'ulid').value, 'canonical').value === u);
check('roundTrip 标志(bitstring/decimal/hex128)', core.convertId(u, 'bitstring').roundTrip === true && core.convertId(u, 'decimal').roundTrip === true);
check('snowflake→canonical 位宽拒绝', !core.convertId('175928847299117063', 'canonical').ok && core.convertId('175928847299117063', 'canonical').error.code === 'WIDTH');
check('snowflake→bitstring 64 位', core.convertId('175928847299117063', 'bitstring').value === BigInt('175928847299117063').toString(2).padStart(64, '0'));
check('128 位高 64 非零 → snowflake-decimal 拒绝', !core.convertId(u, 'snowflake-decimal').ok);
check('未知目标 BAD_TARGET', core.convertId(u, 'nope').error.code === 'BAD_TARGET');

console.log('== isoFromEpochMs 边界 ==');
check('epoch 0 → 1970-01-01', core.isoFromEpochMs(0n) === '1970-01-01T00:00:00.000Z');
check('负毫秒 -1 → 1969-12-31', core.isoFromEpochMs(-1n) === '1969-12-31T23:59:59.999Z');
check('超范围返回 null 不抛', core.isoFromEpochMs(99999999999999999n) === null);
check('dow -1 → 周三', core.dowFromEpochMs(-1n) === 3);

// ---------- 汇总 ----------
const pass = results.filter((x) => x.pass).length;
console.log(`\n共 ${results.length} 断言:${pass} 通过 / ${results.length - pass} 失败`);
process.exitCode = exitCode;
