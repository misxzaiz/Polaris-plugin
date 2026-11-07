/**
 * 离线单测（零依赖零 mock）：node test/run-tests.mjs
 * 覆盖：校验器（身份证/手机号/银行卡/信用代码/IP/车牌）、值级检测命中与漏报、
 *       三种模式（partial/fake/label）、确定性、不泄露不变量、重叠裁决、
 *       结构感知（JSON 字符串/裸数字 18 位精度陷阱/ENV/CSV）、姓名上下文模式、
 *       自定义规则、台账与还原闭环、展示预览掩码。
 * 所有身份证/银行卡/手机号均为公开标准示例值或构造值。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/mask-core.js');

const results = [];
const t = (name, fn) => {
  process.stderr.write(`· ${name}\n`); // 逐条进度（定位挂起用）
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// 公开的标准示例值（GB 11643 文档示例 / Visa 测试号）
const ID_VALID = '11010519491231002X';
const CARD_VISA = '4111111111111111';
const CARD_MC = '5555555555554444';
const PHONE = '13800138000';

// ── 校验器 ──────────────────────────────────────────────────────────────────
t('idcardValid：标准示例通过', () => {
  assert.ok(core.idcardValid(ID_VALID));
});
t('idcardValid：校验位错/省码错/日期错全拒', () => {
  assert.ok(!core.idcardValid('110105194912310020')); // 校验位改 0
  assert.ok(!core.idcardValid('99010519491231002X')); // 省码 99 不存在
  assert.ok(!core.idcardValid('11010519491331002X')); // 13 月
});
t('idcardValid：独立重算校验位再验证', () => {
  // 测试内独立实现（与 core 相同公式、不同代码路径），双重确认
  const W = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const C = '10X98765432';
  const body = '44030119850101123';
  let s = 0;
  for (let i = 0; i < 17; i++) s += (+body[i]) * W[i];
  const id = body + C[s % 11];
  assert.ok(core.idcardValid(id), `应为合法：${id}`);
  assert.ok(!core.idcardValid(body + (C[s % 11] === '0' ? '1' : '0')));
});
t('phoneValid：现网号段通过、虚拟非号段拒绝', () => {
  assert.ok(core.phoneValid(PHONE));
  assert.ok(core.phoneValid('19912345678'));
  assert.ok(!core.phoneValid('12345678901'));
  assert.ok(!core.phoneValid('14012345678'));
  assert.ok(!core.phoneValid('1380013800')); // 10 位
});
t('luhnValid：经典测试卡通过、改位拒绝', () => {
  assert.ok(core.luhnValid(CARD_VISA));
  assert.ok(core.luhnValid(CARD_MC));
  assert.ok(!core.luhnValid('4111111111111112'));
  assert.ok(!core.luhnValid('1234567890123'));
});
t('usccValid：独立重算校验位再验证', () => {
  const CH = '0123456789ABCDEFGHJKLMNPQRTUWXY';
  const W = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
  const body = '91350100M000100Y4';
  let s = 0;
  for (let i = 0; i < 17; i++) s += CH.indexOf(body[i]) * W[i];
  const uscc = body + CH[(31 - (s % 31)) % 31];
  assert.ok(core.usccValid(uscc), `应为合法：${uscc}`);
  assert.ok(!core.usccValid(uscc.slice(0, 17) + '9'));
});
t('ipv4Private：私网/保留段识别', () => {
  assert.ok(core.ipv4Private('192.168.1.1'));
  assert.ok(core.ipv4Private('10.0.0.1'));
  assert.ok(core.ipv4Private('127.0.0.1'));
  assert.ok(core.ipv4Private('172.16.0.1'));
  assert.ok(!core.ipv4Private('8.8.8.8'));
  assert.ok(!core.ipv4Private('203.0.113.5'));
});
t('plateValid：普通/新能源通过、乱串拒绝', () => {
  assert.ok(core.plateValid('京A12345'));
  assert.ok(core.plateValid('粤BD12345'));
  assert.ok(core.plateValid('京A·12345'));
  assert.ok(!core.plateValid('京A123456')); // 6 位纯数字非新能源
});

// ── 值级检测 ────────────────────────────────────────────────────────────────
t('scanText：手机号/身份证/银行卡/邮箱/IP 命中', () => {
  const text = `电话${PHONE}，证件${ID_VALID}，卡${CARD_VISA}，邮箱 zhang.san@example.com，来自 8.8.8.8`;
  const hits = core.scanText(text, {});
  const types = hits.map((h) => h.type).sort().join(',');
  assert.ok(types.includes('phone') && types.includes('idcard') && types.includes('bankcard')
    && types.includes('email') && types.includes('ipv4'), types);
});
t('scanText：手机号嵌在长数字串中不误报', () => {
  const hits = core.scanText('订单号 11380013800012345 共 17 位', {});
  assert.ok(!hits.some((h) => h.type === 'phone'));
});
t('scanText：邮箱内含手机号形态 → 邮箱胜出（重叠裁决）', () => {
  const text = 'zhangsan13800138000@163.com';
  const hits = core.scanText(text, {});
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].type, 'email');
});
t('scanText：私网 IP 默认保留、可关', () => {
  const text = '内网 192.168.1.100 外网 8.8.8.8';
  assert.ok(!core.scanText(text, {}).some((h) => h.type === 'ipv4' && h.original.startsWith('192.168')));
  const hits2 = core.scanText(text, { ipv4KeepPrivate: false });
  assert.strictEqual(hits2.filter((h) => h.type === 'ipv4').length, 2);
});
t('scanText：车牌命中且上下文无关', () => {
  const hits = core.scanText('车辆 京A12345 停在 B2', {});
  assert.ok(hits.some((h) => h.type === 'plate' && h.original === '京A12345'));
});

// ── 姓名上下文模式 ──────────────────────────────────────────────────────────
t('cname：角色词冒号命中', () => {
  const hits = core.scanText('联系人：张三丰，电话见后', {});
  assert.ok(hits.some((h) => h.type === 'cname' && h.original === '张三丰'));
});
t('cname：称谓后缀命中', () => {
  const hits = core.scanText('汇报人是李建国先生', {});
  assert.ok(hits.some((h) => h.type === 'cname' && h.original === '李建国'));
});
t('cname：非激进模式不抓独立词', () => {
  const hits = core.scanText('今天张三来了', { cnameAggressive: false });
  assert.ok(!hits.some((h) => h.type === 'cname'));
});
t('cname：激进模式只抓标点分隔词（连续叙述不做分词）', () => {
  const hits = core.scanText('参会名单：王五、张三、陈大明', { cnameAggressive: true });
  assert.ok(hits.some((h) => h.type === 'cname' && h.original === '张三'));
  assert.ok(hits.some((h) => h.type === 'cname' && h.original === '陈大明'));
  assert.ok(!core.scanText('参会名单：王五、张三、陈大明', {}).some((h) => h.type === 'cname'));
});

// ── 三模式与确定性 ──────────────────────────────────────────────────────────
t('partial：手机号 138****5678 形态', () => {
  const r = core.maskText(`电话${PHONE}`, { types: { phone: { mode: 'partial' } } });
  assert.strictEqual(r.output, `电话138****0000`.replace('0000', PHONE.slice(7)));
});
t('fake：确定性假名（同盐同输出、异盐异输出、格式合法）', () => {
  const saltA = 'aaaa1111aaaa1111';
  const saltB = 'bbbb2222bbbb2222';
  const text = `电话${PHONE} 证件${ID_VALID}`;
  const rA1 = core.maskText(text, { salt: saltA, types: { phone: { mode: 'fake' }, idcard: { mode: 'fake' } } });
  const rA2 = core.maskText(text, { salt: saltA, types: { phone: { mode: 'fake' }, idcard: { mode: 'fake' } } });
  const rB = core.maskText(text, { salt: saltB, types: { phone: { mode: 'fake' }, idcard: { mode: 'fake' } } });
  assert.strictEqual(rA1.output, rA2.output);
  assert.notStrictEqual(rA1.output, rB.output);
  // 假名保校验位
  const fakePhone = rA1.output.match(/1\d{10}/)[0];
  const fakeId = rA1.output.match(/\d{17}[0-9X]/)[0];
  assert.ok(core.phoneValid(fakePhone), fakePhone);
  assert.ok(core.idcardValid(fakeId), fakeId);
});
t('fake：同原值跨文本同假名（关联性不散架）', () => {
  const salt = 'salt1234salt1234';
  const r1 = core.maskText(`甲的电话${PHONE}`, { salt, types: { phone: { mode: 'fake' } } });
  const r2 = core.maskText(`乙的电话也打${PHONE}`, { salt, types: { phone: { mode: 'fake' } } });
  const p1 = r1.output.match(/1\d{10}/)[0];
  const p2 = r2.output.match(/1\d{10}/)[0];
  assert.strictEqual(p1, p2);
});
t('label：占位编号稳定且同值同号', () => {
  const ledger = new Map();
  const text = `联系人：张三 联系人：张三 联系人：李四`;
  const r = core.maskText(text, { salt: 's1', ledger, types: { cname: { mode: 'label' } } });
  assert.strictEqual(r.stats.cname, 3);
  const labels = [...new Set(r.output.match(/〔中文姓名\d+〕/g))];
  assert.strictEqual(labels.length, 2); // 张三一个号、李四一个号
});
t('假名碰撞回退：fake===原值时强制 label', () => {
  const ledger = new Map();
  // 原值本身已是测试号段假号形态 → fake 可能产出同值 → 必须不是原值
  const r = core.maskText('电话13000000001', { salt: 'x', ledger, types: { phone: { mode: 'fake' } } });
  assert.ok(!r.output.includes('13000000001') || r.output.includes('〔手机号'), r.output);
});

// ── 不泄露不变量（本插件的核心安全断言）────────────────────────────────────
t('不变量：输出永不含原值（partial/fake/label 三模式 × 全类型）', () => {
  const samples = [
    ['phone', PHONE, `V:${PHONE}:E`],
    ['idcard', ID_VALID, `V:${ID_VALID}:E`],
    ['bankcard', CARD_VISA, `V:${CARD_VISA}:E`],
    ['email', 'zhang.san@example.com', 'V:zhang.san@example.com:E'],
    ['ipv4', '8.8.8.8', 'V:8.8.8.8:E'],
    ['plate', '京A12345', 'V:京A12345:E'],
    ['cname', '张三丰', 'V:联系人：张三丰:E'], // 非激进模式需上下文信号
  ];
  for (const mode of ['partial', 'fake', 'label']) {
    for (const [type, orig, text] of samples) {
      const typesCfg = {};
      for (const tt of core.TYPE_ORDER) typesCfg[tt] = { on: tt === type, mode };
      const r = core.maskText(text, { salt: 'inv', types: typesCfg });
      if (r.stats[type] !== 1) throw new Error(`${type}/${mode} 未命中: ${JSON.stringify(r.stats)}`);
      if (r.output.includes(orig)) throw new Error(`${type}/${mode} 泄露原值: ${r.output}`);
      assert.notStrictEqual(r.output, text);
    }
  }
});
t('不变量：partial/label 输出复扫零命中（fake 按设计复检出假值）', () => {
  const text = `电话${PHONE} 证件${ID_VALID} 卡${CARD_VISA} 邮 zhang.san@example.com 联系人：张三`;
  for (const mode of ['partial', 'label']) {
    const typesCfg = {};
    for (const tt of core.TYPE_ORDER) typesCfg[tt] = { mode: tt === 'cname' && mode === 'partial' ? 'partial' : mode };
    const r = core.maskText(text, { salt: 'inv2', types: typesCfg });
    const re = core.scanText(r.output, { ipv4KeepPrivate: true });
    const strict = re.filter((h) => h.type !== 'cname');
    assert.strictEqual(strict.length, 0, `${mode} 复扫残留: ${JSON.stringify(re)}`);
  }
});

// ── 结构感知 ────────────────────────────────────────────────────────────────
t('JSON 字符串值：键驱动掩码', () => {
  const r = core.maskText('{"姓名": "张三", "phone": "13800138000", "name": "test-user"}', { salt: 'j1' });
  assert.ok(r.output.includes('〔中文姓名'), r.output);
  assert.ok(r.output.includes('138****'), r.output);
  assert.ok(r.output.includes('"test-user"'), '泛 name 值不像姓名 → 不应掩');
});
t('JSON 裸数字 18 位身份证：精度安全（末 4 位保真）', () => {
  const id18 = '110101199001010015'; // 独立计算校验位为合法
  const r = core.maskText(`{"idcard": ${id18}}`, { salt: 'j2' });
  assert.ok(r.output.includes('0015}'), `末4位应保真: ${r.output}`);
  assert.ok(!r.output.includes(id18), r.output);
});
t('JSON 裸数字手机号：命中（默认 partial 形态）', () => {
  const r = core.maskText(`{"mobile": ${PHONE}, "amount": 12345.67}`, { salt: 'j3' });
  assert.ok(r.output.includes('138****'), r.output);
  assert.ok(!r.output.includes(PHONE), r.output);
  assert.ok(r.output.includes('12345.67'), '普通数字不应被掩');
});
t('YAML 数字形态：命中', () => {
  const r = core.maskText('user_phone: ' + PHONE + '\nname: 测试', { salt: 'y1' });
  assert.ok(r.output.includes('〔手机号') || r.output.includes('138****'), r.output);
});
t('ENV 形态：键驱动掩码', () => {
  const r = core.maskText(`USER_NAME=张三\nDB_PHONE=${PHONE}\nAPP_MODE=prod`, { salt: 'e1' });
  assert.ok(r.output.includes('〔中文姓名'), r.output);
  assert.ok(r.output.includes('138****'), r.output);
  assert.ok(r.output.includes('APP_MODE=prod'), '无关键不掩');
});
t('CSV：表头驱动 cname + 值级 phone，引号保留', () => {
  const csv = '姓名,手机号,备注\n"张三","13800138000",ok\n李四,13912345678,hi';
  const r = core.maskText(csv, { salt: 'c1' });
  assert.ok(!r.output.includes('张三') && !r.output.includes('李四'), r.output);
  assert.ok(r.output.includes('138****'), r.output);
  assert.ok(r.output.includes('139****'), r.output);
  assert.ok(r.output.includes('"〔') || r.output.includes('〔中文姓名'), r.output);
});
t('address/birthday：仅键驱动，label 带序号掩码', () => {
  const r = core.maskText('{"address": "北京市海淀区中关村大街1号", "birthday": "1990-01-01", "text": "今天天气不错"}', { salt: 'a1' });
  assert.ok(r.output.includes('〔地址'), r.output);
  assert.ok(r.output.includes('〔出生日期'), r.output);
  assert.ok(r.output.includes('今天天气不错'), r.output);
});

// ── 台账与还原 ──────────────────────────────────────────────────────────────
t('台账：条目合并、计数累加、restore 闭环（fake+label 可逆）', () => {
  const ledger = new Map();
  const salt = 'restore12';
  const t1 = core.maskText('联系人：张三 电话13800138000', { salt, ledger, types: { cname: { mode: 'label' }, phone: { mode: 'fake' } } });
  const t2 = core.maskText('联系人：张三 电话13900139000', { salt, ledger, types: { cname: { mode: 'label' }, phone: { mode: 'fake' } } });
  assert.strictEqual(ledger.size, 3); // 张三 + 两个手机号
  const entries = [...ledger.values()].map((e) => ({ ...e }));
  const r1 = core.restoreText(t1.output, entries);
  const r2 = core.restoreText(t2.output, entries);
  assert.ok(r1.output.includes('张三') && r1.output.includes(PHONE), r1.output);
  assert.ok(r2.output.includes('张三'), r2.output);
  assert.strictEqual(r1.replaced, 2);
});
t('台账：partial 不可还原（还原跳过）', () => {
  const ledger = new Map();
  const r = core.maskText(`电话${PHONE}`, { salt: 'p', ledger, types: { phone: { mode: 'partial' } } });
  const entries = [...ledger.values()];
  const back = core.restoreText(r.output, entries);
  assert.strictEqual(back.replaced, 0);
});
t('displayPreview：任何通道只允许前2后2掩码形态', () => {
  assert.strictEqual(core.displayPreview(PHONE, 'phone'), '13***00');
  assert.ok(core.displayPreview('zhang.san@example.com', 'email').includes('@'));
  assert.strictEqual(core.displayPreview('abcd', 'cname'), '****');
});

// ── 自定义规则 ──────────────────────────────────────────────────────────────
t('自定义规则：正则替换生效', () => {
  const r = core.maskText('内部单号 SHOP-8848 与门店 SHOP-1123', {
    salt: 'cu',
    customRules: [{ name: '门店单号', pattern: 'SHOP-\\d{4}', replacement: '〔单号〕' }],
  });
  assert.ok(r.output.includes('〔单号〕') && !r.output.includes('SHOP-'), r.output);
});
t('自定义规则：非法正则不炸主流程', () => {
  const r = core.maskText(`电话${PHONE}`, {
    salt: 'cu2',
    customRules: [{ name: 'bad', pattern: '([unclosed' }],
  });
  assert.ok(r.output.includes('138****'), r.output);
});

// ── 规模与边界 ──────────────────────────────────────────────────────────────
t('maxLen 截断保护', () => {
  const big = 'x'.repeat(1024 * 1024 + 100) + PHONE;
  const r = core.maskText(big, { maxLen: 1024 * 1024 });
  assert.strictEqual(r.truncated, true);
  assert.ok(!r.output.includes(PHONE));
});
t('空输入与纯噪声安全', () => {
  assert.strictEqual(core.maskText('', { salt: 'z' }).output, '');
  assert.strictEqual(core.maskText('nothing here 123', { salt: 'z' }).output, 'nothing here 123');
});
t('1MB 日志性能 < 3s', () => {
  const line = `2026-11-03 10:00:00 INFO user=张三 phone=${PHONE} ip=8.8.8.8 mail=a@b.com 订单${'9'.repeat(16)} ok\n`;
  const big = line.repeat(Math.ceil(1024 * 1024 / line.length));
  const t0 = Date.now();
  const r = core.maskText(big, { salt: 'perf' });
  const ms = Date.now() - t0;
  assert.ok(r.stats.phone > 1000, JSON.stringify(r.stats));
  assert.ok(ms < 3000, `耗时 ${ms}ms`);
});

// ── 汇总 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`);
  if (r.pass) pass++;
}
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
