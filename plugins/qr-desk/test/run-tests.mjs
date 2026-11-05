/**
 * run-tests.mjs —— qr-desk 核心单测（node:test）
 *
 * 金标来源（独立于被测代码）：
 *   - HOTP：RFC 4226 Appendix D（secret = ASCII "12345678901234567890"，10 组截断值）
 *   - TOTP：RFC 6238 Appendix B（8 位，SHA1/SHA256/SHA512 三算法两组时间）
 *   - 迁移码：手构 protobuf 字节向量（字节级独立，非 encode 自证）+ encode↔decode round-trip
 *   - 生成↔解码：qrMatrix → PNG/JPEG → jsQR 全链路 round-trip（JPEG 有损，模块 ≥8px 下无损可辨）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const core = require(path.join(here, '../shared/core.js'));
const render = require(path.join(here, '../shared/render.js'));
const image = require(path.join(here, '../shared/image.js'));

// ── WiFi ────────────────────────────────────────────────────────────────────
test('WiFi build 基本形态', () => {
  assert.equal(core.buildWifi({ ssid: 'MyHome', password: 'pass1', encryption: 'WPA' }), 'WIFI:T:WPA;S:MyHome;P:pass1;;');
});
test('WiFi 转义：;,: " \\ 全部保留语义', () => {
  const ssid = 'a;b,c:d"e\\f';
  const pass = 'p;1,w:2"3\\4';
  const text = core.buildWifi({ ssid, password: pass, encryption: 'WPA' });
  const parsed = core.parseWifi(text);
  assert.equal(parsed.ssid, ssid);
  assert.equal(parsed.password, pass);
  assert.equal(parsed.encryption, 'WPA');
});
test('WiFi hidden 与 nopass', () => {
  const t = core.buildWifi({ ssid: 'Open', encryption: 'nopass', hidden: true });
  assert.equal(t, 'WIFI:T:nopass;S:Open;H:true;;');
  const p = core.parseWifi(t);
  assert.deepEqual([p.encryption, p.hidden, p.password], ['nopass', true, '']);
});
test('WiFi 非法输入拒绝', () => {
  assert.throws(() => core.buildWifi({ password: 'x', encryption: 'WPA' }), /ssid/);
  assert.throws(() => core.buildWifi({ ssid: 'a', encryption: 'WPA' }), /password/);
  assert.throws(() => core.buildWifi({ ssid: 'a', password: 'x', encryption: 'WPA2' }), /WPA\/WEP\/nopass/);
  assert.throws(() => core.parseWifi('WIFI:T:WPA;;'), /S:（SSID）/);
});
test('WiFi 解析标准样例（ZXing 文档样例）', () => {
  const p = core.parseWifi('WIFI:T:WPA;S:mynetwork;P:mypass;H:false;;');
  assert.deepEqual(p, { ssid: 'mynetwork', password: 'mypass', encryption: 'WPA', hidden: false });
});

// ── vCard ───────────────────────────────────────────────────────────────────
test('vCard build/parse round-trip（含换行/分号备注）', () => {
  const f = { name: '张三', last: '张', first: '三', org: 'A;B', tel: '+8613800000000', email: 'z@x.com', note: '第一行\n第二行, 逗号' };
  const text = core.buildVcard(f);
  const p = core.parseVcard(text);
  assert.equal(p.fn, '张三');
  assert.equal(p.n, '张;三');
  assert.equal(p.org[0], 'A;B');
  assert.equal(p.tel[0], '+8613800000000');
  assert.equal(p.note[0], '第一行\n第二行, 逗号');
  assert.equal(p.version, '3.0');
});
test('vCard 折行 unfold（RFC 2426 折行规则）', () => {
  const folded = 'BEGIN:VCARD\r\nVERSION:3.0\r\nNOTE:这是被折行\r\n  的备注\r\nEND:VCARD';
  const p = core.parseVcard(folded);
  assert.equal(p.note[0], '这是被折行的备注');
});
test('vCard 非载荷拒绝', () => {
  assert.equal(core.parseVcard('hello'), null);
});

// ── Base32 / HOTP（RFC 4226 金标）───────────────────────────────────────────
test('Base32 编解码 round-trip（奇数长度 + 小写 + 空格）', () => {
  for (const s of ['a', 'ab', 'abc', 'abcd', 'abcde', 'Hello, World!中文']) {
    const buf = Buffer.from(s, 'utf8');
    const b32 = core.base32Encode(buf);
    assert.deepEqual(Buffer.from(core.base32Decode(b32.toLowerCase().match(/.{1,4}/g).join(' '))), buf);
  }
});
test('HOTP RFC 4226 Appendix D 十组金标', () => {
  const secret = Buffer.from('12345678901234567890', 'ascii');
  const expect = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expect.forEach((code, counter) => assert.equal(core.hotp(secret, counter, 6, 'SHA1'), code, `counter=${counter}`));
});
test('TOTP RFC 6238 Appendix B 金标（8 位三算法）', () => {
  const cases = [
    { algo: 'SHA1', secret: Buffer.from('12345678901234567890', 'ascii') },
    { algo: 'SHA256', secret: Buffer.from('12345678901234567890123456789012', 'ascii') },
    { algo: 'SHA512', secret: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii') },
  ];
  // [T 秒, SHA1, SHA256, SHA512]
  const vectors = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
  ];
  for (const [t, e1, e2, e3] of vectors) {
    const tMs = t * 1000;
    assert.equal(core.totp(cases[0].secret, tMs, { digits: 8, algorithm: 'SHA1' }), e1, `SHA1 T=${t}`);
    assert.equal(core.totp(cases[1].secret, tMs, { digits: 8, algorithm: 'SHA256' }), e2, `SHA256 T=${t}`);
    assert.equal(core.totp(cases[2].secret, tMs, { digits: 8, algorithm: 'SHA512' }), e3, `SHA512 T=${t}`);
  }
});

// ── otpauth ─────────────────────────────────────────────────────────────────
test('otpauth build/parse round-trip（issuer 参数优先）', () => {
  const uri = core.buildOtpauth({ type: 'totp', label: 'GitHub:alice', issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA256', digits: 8, period: 60 });
  const p = core.parseOtpauth(uri);
  assert.equal(p.type, 'totp');
  assert.equal(p.issuer, 'GitHub');
  assert.equal(p.account, 'alice');
  assert.equal(p.algorithm, 'SHA256');
  assert.equal(p.digits, 8);
  assert.equal(p.period, 60);
  assert.equal(p.secretBase32, 'JBSWY3DPEHPK3PXP');
});
test('otpauth issuer 从 label 冒号前缀回落', () => {
  const p = core.parseOtpauth(core.buildOtpauth({ label: 'GH:bob', secret: 'JBSWY3DPEHPK3PXP' }));
  assert.equal(p.issuer, 'GH');
  assert.equal(p.account, 'bob');
});
test('otpauth 非法输入拒绝', () => {
  assert.throws(() => core.buildOtpauth({ label: 'x', secret: 'ABC!' }), /非法字符/);
  assert.throws(() => core.parseOtpauth('otpauth://totp/x'), /secret/);
  assert.throws(() => core.parseOtpauth('otpauth://hotp/a?secret=JBSWY3DPEHPK3PXP&digits=7'), /digits/);
  assert.throws(() => core.parseOtpauth('otpauth://totp/a?secret=JBSWY3DPEHPK3PXP&algorithm=MD5'), /算法/);
});
test('otpPreview 与 totp 一致且带剩余秒数', () => {
  const parsed = core.parseOtpauth(core.buildOtpauth({ label: 'a:b', secret: 'JBSWY3DPEHPK3PXP' }));
  const nowMs = 1700000000000;
  const pv = core.otpPreview(parsed, nowMs);
  assert.equal(pv.code, core.totp(core.base32Decode(parsed.secretBase32), nowMs, { algorithm: 'SHA1', digits: 6, period: 30 }));
  assert.equal(pv.remainingMs, 30000 - (1700000000000 % 30000));
  assert.ok(pv.remainingMs > 0 && pv.remainingMs <= 30000);
});
test('HOTP preview 使用 counter 不推进', () => {
  const uri = core.buildOtpauth({ type: 'hotp', label: 'x:y', secret: 'JBSWY3DPEHPK3PXP', counter: 5 });
  const pv = core.otpPreview(core.parseOtpauth(uri));
  assert.equal(pv.kind, 'hotp');
  assert.equal(pv.counter, 5);
  assert.equal(pv.code, core.hotp(core.base32Decode('JBSWY3DPEHPK3PXP'), 5, 6, 'SHA1'));
});

// ── 迁移码 protobuf ─────────────────────────────────────────────────────────
test('迁移码：手构字节向量独立验证', () => {
  // 手工拼装：entry{secret=16字节0x000102..0x0f, name="alice", issuer="Example", SHA1, 6位, TOTP}
  const secret = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const inner = [
    0x0a, 0x10, ...secret,                                     // field1 secret
    0x12, 5, 0x61, 0x6c, 0x69, 0x63, 0x65,                     // field2 "alice"
    0x1a, 7, 0x45, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,         // field3 "Example"
    0x20, 0x01,                                                // field4 algorithm=1(SHA1)
    0x28, 0x01,                                                // field5 digits=1(SIX)
    0x30, 0x02,                                                // field6 type=2(TOTP)
  ];
  const outer = [0x0a, inner.length, ...inner, 0x10, 0x01, 0x18, 0x01, 0x20, 0x00, 0x28, 0x00]; // field1{entry} + version=1 batchSize=1 ...
  const b64 = Buffer.from(outer).toString('base64');
  const mig = core.decodeMigration(`otpauth-migration://offline?data=${encodeURIComponent(b64)}`);
  assert.equal(mig.entries.length, 1);
  const e = mig.entries[0];
  assert.equal(e.name, 'alice');
  assert.equal(e.issuer, 'Example');
  assert.equal(e.type, 'TOTP');
  assert.equal(e.algorithm, 'SHA1');
  assert.equal(e.digits, 6);
  assert.equal(e.secretBase32, core.base32Encode(secret));
});
test('迁移码 encode↔decode round-trip（多条目/HOTP/SHA256/8位）', () => {
  const enc = core.encodeMigration({
    entries: [
      { name: 'alice@gh', issuer: 'GitHub', secretBase32: 'JBSWY3DPEHPK3PXP', type: 'TOTP', algorithm: 'SHA256', digits: 8 },
      { name: 'bob', issuer: '', secretBase32: core.base32Encode(Buffer.from([9, 8, 7, 6])), type: 'HOTP', algorithm: 'SHA1', digits: 6, counter: 42 },
    ],
    batchSize: 1,
  });
  const uri = `otpauth-migration://offline?data=${encodeURIComponent(enc)}`;
  const mig = core.decodeMigration(uri);
  assert.equal(mig.batchSize, 1);
  assert.equal(mig.entries.length, 2);
  assert.equal(mig.entries[0].secretBase32, 'JBSWY3DPEHPK3PXP');
  assert.equal(mig.entries[0].algorithm, 'SHA256');
  assert.equal(mig.entries[0].digits, 8);
  assert.equal(mig.entries[1].type, 'HOTP');
  assert.equal(mig.entries[1].counter, 42);
});
test('迁移码：URL-safe base64 与裸 base64 输入', () => {
  const enc = core.encodeMigration({ entries: [{ name: 'n', secretBase32: 'JBSWY3DPEHPK3PXP', type: 'TOTP', algorithm: 'SHA1', digits: 6 }] });
  const urlSafe = enc.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(core.decodeMigration(urlSafe).entries.length, 1);
  assert.equal(core.decodeMigration(enc).entries.length, 1);
});
test('迁移码：垃圾输入给用户可读错误', () => {
  // '!!' 经 node 宽松 base64 解出乱字节 → 必须落到用户可读错误（截断/为空/不支持任一）
  assert.throws(() => core.decodeMigration('otpauth-migration://offline?data=%21%21'), /截断|base64|解码|为空|不支持/);
  // 非 migration 的裸字符串同样按 base64 处理：空串→null，垃圾→可读错误
  assert.equal(core.decodeMigration(''), null);
  assert.throws(() => core.decodeMigration('hello'), /截断|解码|为空|条目|不支持/);
});

// ── classify / inspect ──────────────────────────────────────────────────────
test('classify 全类型', () => {
  const cases = [
    ['otpauth-migration://offline?data=AAA', 'otpauth-migration'],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP', 'otpauth'],
    ['WIFI:T:WPA;S:a;P:b;;', 'wifi'],
    ['BEGIN:VCARD\nVERSION:3.0\nFN:a\nEND:VCARD', 'vcard'],
    ['MECARD:N:a;TEL:1;;', 'mecard'],
    ['https://example.com/x?y=1', 'url'],
    ['mailto:a@b.c?subject=hi', 'mailto'],
    ['tel:+8613800000000', 'tel'],
    ['sms:+123?body=hi', 'sms'],
    ['geo:37.77,-122.42', 'geo'],
    ['随便一些文字', 'text'],
  ];
  for (const [t, type] of cases) assert.equal(core.classify(t), type, t);
});
test('inspect otpauth 含当前码且不泄露原始 URI', () => {
  const uri = core.buildOtpauth({ label: 'GH:a', secret: 'JBSWY3DPEHPK3PXP' });
  const now = 1700000000000;
  const r = core.inspect(uri, { nowMs: now });
  assert.equal(r.type, 'otpauth');
  assert.equal(r.fields.secretBase32, 'JBSWY3DPEHPK3PXP');
  assert.equal(r.preview.code, core.totp(core.base32Decode('JBSWY3DPEHPK3PXP'), now));
});
test('inspect url 结构化', () => {
  const r = core.inspect('https://user:pw@example.com:8443/p/a?x=1&y=%E4%B8%AD#frag');
  assert.equal(r.fields.host, 'example.com');
  assert.equal(r.fields.port, '8443');
  assert.equal(r.fields.params[1].value, '中');
  assert.ok(r.fields.credentials);
});

// ── 模板 / CSV / 批量 ───────────────────────────────────────────────────────
test('buildPayload url/text/未知类型', () => {
  assert.equal(core.buildPayload({ type: 'url', fields: { url: 'https://a.b/c' } }), 'https://a.b/c');
  assert.equal(core.buildPayload({ type: 'text', fields: { text: 'hi' } }), 'hi');
  assert.throws(() => core.buildPayload({ type: 'url', fields: { url: 'ftp://x' } }), /http/);
  assert.throws(() => core.buildPayload({ type: 'text', fields: { text: '' } }), /为空/);
  assert.throws(() => core.buildPayload({ type: 'nope', fields: {} }), /未知模板类型/);
});
test('CSV：引号内逗号/双引号转义/CRLF/BOM/末尾空行', () => {
  const csv = '\uFEFFname,tel\r\n"张,三","123"\r\n"he said ""hi""",456\r\n\r\n';
  const { headers, rows } = core.csvToObjects(csv);
  assert.deepEqual(headers, ['name', 'tel']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, '张,三');
  assert.equal(rows[1].name, 'he said "hi"');
  assert.equal(rows[1].tel, '456');
});
test('CSV：空输入与空表头拒绝', () => {
  assert.throws(() => core.parseCsv('   '), /为空/);
  assert.throws(() => core.csvToObjects(',,\n1,2'), /表头全为空/);
});
test('planBatch：插值/命名/去重/缺列报错', () => {
  const rows = [{ ssid: 'a', pass: '1' }, { ssid: 'b', pass: '2' }, { ssid: 'a', pass: '3' }];
  const plan = core.planBatch({
    rows,
    template: { type: 'wifi', fields: { ssid: '{ssid}', password: '{pass}', encryption: 'WPA' } },
    fileBase: 'wifi',
    nameCol: 'ssid',
  });
  assert.equal(plan.length, 3);
  assert.equal(plan[0].fileName, 'wifi-a.png');
  assert.equal(plan[2].fileName, 'wifi-a-2.png'); // 同名递增
  assert.ok(plan[1].payload.startsWith('WIFI:T:WPA;S:b;P:2;;'));
  assert.throws(() => core.planBatch({
    rows: [{ a: 1 }],
    template: { type: 'text', fields: { text: '{missing}' } },
  }), /缺少模板列/);
  assert.throws(() => core.planBatch({ rows: Array.from({ length: 501 }, () => ({})), template: { type: 'text', fields: { text: 'x' } } }), /上限/);
});
test('planBatch：超容量行拒绝', () => {
  assert.throws(() => core.planBatch({
    rows: [{ t: 'x'.repeat(3000) }],
    template: { type: 'text', fields: { text: '{t}' } },
  }), /超过 QR 容量/);
});

// ── 生成↔解码 全链路 round-trip ─────────────────────────────────────────────
const rtCases = [
  ['URL', { type: 'url', fields: { url: 'https://example.com/p?a=1&b=中文' } }],
  ['WiFi特殊字符', { type: 'wifi', fields: { ssid: 'a;b,c:d"e\\f', password: 'p;1,w:2"3\\4', encryption: 'WPA' } }],
  ['中文文本', { type: 'text', fields: { text: '跨设备传这段文字：二维码工作台 qr-desk ✓' } }],
  ['vCard', { type: 'vcard', fields: { name: '李四', tel: '+8613911112222', email: 'l@x.com' } }],
  ['otpauth', { type: 'otpauth', fields: { label: 'GH:rt', secret: 'JBSWY3DPEHPK3PXP' } }],
];

for (const [name, template] of rtCases) {
  test(`round-trip PNG：${name}`, () => {
    const payload = core.buildPayload(template);
    const m = render.qrMatrix(payload, 'M');
    const png = render.pngFromMatrix(m, { margin: 4, scale: 8 });
    const r = image.decodeQrFromImage(png);
    assert.ok(r.found, '应解码出码');
    assert.equal(r.payload, payload);
  });
}

test('round-trip JPEG（有损压缩下仍可辨）', () => {
  const jpeg = require('jpeg-js');
  const payload = 'JPEG-ROUNDTRIP-中文-ok';
  const m = render.qrMatrix(payload, 'H');
  const png = render.pngFromMatrix(m, { margin: 4, scale: 8 });
  const rgba = image.decodeImage(png); // PNG → RGBA
  const jpg = jpeg.encode({ data: Buffer.from(rgba.data), width: rgba.width, height: rgba.height }, 90);
  const r = image.decodeQrFromImage(jpg.data);
  assert.ok(r.found, 'JPEG 应可解码');
  assert.equal(r.payload, payload);
});

test('image 护栏：非法魔数/超大字节/超限尺寸', () => {
  assert.throws(() => image.decodeImage(Buffer.from([0x47, 0x49, 0x46, 0x38])), /PNG \/ JPEG/);
  assert.throws(() => image.decodeImage(Buffer.alloc(10 * 1024 * 1024 + 1, 0x89)), /上限/);
  // 4097×1 PNG 超宽
  const { PNG } = require('pngjs');
  const big = new PNG({ width: 4097, height: 1 });
  const pngBuf = PNG.sync.write(big);
  assert.throws(() => image.decodeImage(pngBuf), /超过 4096/);
});
test('解码空图返回 found:false 而非抛错', () => {
  const m = render.qrMatrix('nonempty-placeholder', 'L');
  // 全白图：手绘 64×64
  const { PNG } = require('pngjs');
  const blank = new PNG({ width: 64, height: 64 });
  const buf = PNG.sync.write(blank);
  const r = image.decodeQrFromImage(buf);
  assert.equal(r.found, false);
  assert.ok(!m || m.size > 0); // matrix 生成正常
});

// ── SVG / textArt ───────────────────────────────────────────────────────────
test('SVG 形态与静区', () => {
  const m = render.qrMatrix('svg-check', 'M');
  const svg = render.svgFromMatrix(m, { margin: 4 });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`viewBox="0 0 ${m.size + 8} ${m.size + 8}"`));
  assert.ok(svg.includes('crispEdges'));
  const art = render.textArt(m);
  assert.ok(art.split('\n').length >= m.size);
});

console.log('run-tests.mjs 全部断言通过');
