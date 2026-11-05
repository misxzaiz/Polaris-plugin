'use strict';
/**
 * selftest.js —— 试金石自检套件（service / MCP 共用；面板「体检」页调用）
 *
 * 原则：每条断言独立可解释，任何一条失败都给出人类可读的原因与依据来源
 * （RFC 金标 / round-trip 互证 / 边界拒绝）。全程纯计算，零 IO。
 */

const core = require('./core.js');
const render = require('./render.js');
const image = require('./image.js');

/** @returns {{pass:number, fail:number, items:[{name, ok, detail}]}} */
function runSelftest() {
  const items = [];
  function check(name, fn) {
    try {
      const detail = fn();
      items.push({ name, ok: true, detail: typeof detail === 'string' ? detail : '' });
    } catch (err) {
      items.push({ name, ok: false, detail: (err && err.message) || String(err) });
    }
  }
  function eq(a, b) {
    if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
    return '相等';
  }

  // 1-2 OTP 金标（RFC 4226 / RFC 6238）
  const rfcSecret = Buffer.from('12345678901234567890', 'ascii');
  check('HOTP RFC 4226 金标（counter 0→755224）', () => eq(core.hotp(rfcSecret, 0, 6, 'SHA1'), '755224'));
  check('TOTP RFC 6238 金标（SHA512 T=59→90693936）', () => {
    const s64 = Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii');
    return eq(core.totp(s64, 59 * 1000, { digits: 8, algorithm: 'SHA512' }), '90693936');
  });

  // 3 WiFi 转义 round-trip（特殊字符全含）
  check('WiFi 转义 round-trip（;,: " \\ 全保留）', () => {
    const ssid = 'a;b,c:d"e\\f', pass = 'p;1,w:2"3\\4';
    const p = core.parseWifi(core.buildWifi({ ssid, password: pass, encryption: 'WPA' }));
    if (p.ssid !== ssid || p.password !== pass) throw new Error(`还原失配 ${JSON.stringify(p)}`);
    return '字段逐字还原';
  });

  // 4 vCard round-trip
  check('vCard 3.0 build/parse round-trip', () => {
    const p = core.parseVcard(core.buildVcard({ name: '测试', org: 'X;Y', note: 'a\nb' }));
    if (p.fn !== '测试' || p.org[0] !== 'X;Y' || p.note[0] !== 'a\nb') throw new Error(`还原失配 ${JSON.stringify(p)}`);
    return 'FN/ORG/NOTE 还原';
  });

  // 5 迁移码 encode↔decode（含 HOTP counter）
  check('迁移码 encode↔decode（TOTP+HOTP 双条目）', () => {
    const enc = core.encodeMigration({
      entries: [
        { name: 'a', issuer: 'I', secretBase32: 'JBSWY3DPEHPK3PXP', type: 'TOTP', algorithm: 'SHA1', digits: 6 },
        { name: 'b', secretBase32: 'JBSWY3DPEHPK3PXP', type: 'HOTP', algorithm: 'SHA1', digits: 6, counter: 42 },
      ],
    });
    const mig = core.decodeMigration(`otpauth-migration://offline?data=${encodeURIComponent(enc)}`);
    if (mig.entries.length !== 2 || mig.entries[1].counter !== 42) throw new Error('条目或 counter 失配');
    return `version=${mig.version} 条目=2`;
  });

  // 6 生成→PNG→解码 round-trip
  check('PNG 全链路 round-trip（生成→解码逐字相等）', () => {
    const payload = 'https://example.com/qr-desk-selftest?a=1';
    const m = render.qrMatrix(payload, 'M');
    const png = render.pngFromMatrix(m, { margin: 4, scale: 8 });
    const r = image.decodeQrFromImage(png);
    if (!r.found) throw new Error('未解码出码');
    return eq(r.payload, payload);
  });

  // 7 中文与特殊字符 round-trip
  check('中文载荷 round-trip', () => {
    const payload = '二维码工作台 selftest ✓ 中文';
    const m = render.qrMatrix(payload, 'H');
    const r = image.decodeQrFromImage(render.pngFromMatrix(m, { margin: 4, scale: 8 }));
    if (!r.found) throw new Error('未解码出码');
    return eq(r.payload, payload);
  });

  // 8 JPEG 解码通道
  check('JPEG 通道可解码（pngjs→jpeg-js 互证）', () => {
    const jpeg = require('jpeg-js');
    const m = render.qrMatrix('jpeg-channel-check', 'H');
    const rgba = image.decodeImage(render.pngFromMatrix(m, { margin: 4, scale: 8 }));
    const jpg = jpeg.encode({ data: Buffer.from(rgba.data), width: rgba.width, height: rgba.height }, 90);
    const r = image.decodeQrFromImage(jpg.data);
    if (!r.found) throw new Error('JPEG 未解码出码');
    return eq(r.payload, 'jpeg-channel-check');
  });

  // 9 护栏：非图像拒绝
  check('护栏：非 PNG/JPEG 魔数明确拒绝', () => {
    try {
      image.decodeImage(Buffer.from([0x47, 0x49, 0x46, 0x38]));
      throw new Error('未拒绝 GIF 魔数');
    } catch (e) {
      if (/PNG \/ JPEG/.test(e.message)) return '拒绝信息可读';
      throw e;
    }
  });

  // 10 CSV 引号边界
  check('CSV 引号边界（内嵌逗号/双引号转义）', () => {
    const { rows } = core.csvToObjects('a,b\n"x,y","s""t"');
    if (rows[0].a !== 'x,y' || rows[0].b !== 's"t') throw new Error(`解析失配 ${JSON.stringify(rows)}`);
    return '2 列 1 行还原';
  });

  // 11 批量命名冲突递增
  check('批量同名文件递增命名', () => {
    const plan = core.planBatch({
      rows: [{ s: 'a', p: '1' }, { s: 'a', p: '2' }],
      template: { type: 'wifi', fields: { ssid: '{s}', password: '{p}', encryption: 'WPA' } },
      fileBase: 'w', nameCol: 's',
    });
    if (plan[0].fileName !== 'w-a.png' || plan[1].fileName !== 'w-a-2.png') throw new Error(`命名失配 ${plan.map((x) => x.fileName)}`);
    return 'a → a-2';
  });

  // 12 otpauth 非法输入拒绝
  check('otpauth 非法 Base32 密钥拒绝', () => {
    try {
      core.parseOtpauth('otpauth://totp/x?secret=!!!');
      throw new Error('未拒绝非法密钥');
    } catch (e) {
      if (/非法字符|Base32/.test(e.message)) return '拒绝信息可读';
      throw e;
    }
  });

  const pass = items.filter((i) => i.ok).length;
  return { pass, fail: items.length - pass, items };
}

module.exports = { runSelftest };
