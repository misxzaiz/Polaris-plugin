/**
 * 纸坊 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：页码规格解析（all/区间/end/重排/重复/越界/0/负/空/全角）、紧凑页码、
 *       输出命名冲突链、stem 消毒（路径成分/Windows 保留名/非法字符）、
 *       魔数识别（PDF/JPG/PNG）、输入校验（上限/类型/空单）、设置归一化、角度归一。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

// ── parsePageSpec ───────────────────────────────────────────────────────────

test('parsePageSpec：单页/多段区间/all/end', () => {
  assert.deepEqual(core.parsePageSpec('5', 10), [5]);
  assert.deepEqual(core.parsePageSpec('1-3,7', 10), [1, 2, 3, 7]);
  assert.deepEqual(core.parsePageSpec('1 - 3 , 7', 10), [1, 2, 3, 7], '空格容忍');
  assert.deepEqual(core.parsePageSpec('all', 4), [1, 2, 3, 4]);
  assert.deepEqual(core.parsePageSpec('全部', 3), [1, 2, 3]);
  assert.deepEqual(core.parsePageSpec('3-end', 6), [3, 4, 5, 6]);
  assert.deepEqual(core.parsePageSpec('3-END', 6), [3, 4, 5, 6], '大小写不敏感');
  assert.deepEqual(core.parsePageSpec('3-末尾', 6), [3, 4, 5, 6]);
  assert.deepEqual(core.parsePageSpec(4, 6), [4]);
  assert.deepEqual(core.parsePageSpec('10', 10), [10], '边界=恰好最后一页');
});

test('parsePageSpec：set 模式排序去重，ordered 模式保序且禁重复', () => {
  assert.deepEqual(core.parsePageSpec('7,1-3', 10), [1, 2, 3, 7], 'set 默认排序');
  assert.deepEqual(core.parsePageSpec('1,1,2', 10, { mode: 'set' }), [1, 2]);
  assert.deepEqual(core.parsePageSpec([1, 1], 10), [1], '数组形态 set 模式同样去重（rotate/delete 语义）');
  assert.deepEqual(core.parsePageSpec('3,1,2', 10, { mode: 'ordered' }), [3, 1, 2], 'ordered 保序=重排');
  assert.deepEqual(core.parsePageSpec([3, 1, 2], 10, { mode: 'ordered' }), [3, 1, 2], '数组形态');
  assert.throws(() => core.parsePageSpec('1,1', 10, { mode: 'ordered' }), /重复/);
  assert.throws(() => core.parsePageSpec([1, 1], 10, { mode: 'ordered' }), /重复/);
});

test('parsePageSpec：非法输入逐一中文报错', () => {
  assert.throws(() => core.parsePageSpec('', 10), /为空/);
  assert.throws(() => core.parsePageSpec('   ', 10), /为空/);
  assert.throws(() => core.parsePageSpec('1,,3', 10), /空段|多余逗号/);
  assert.throws(() => core.parsePageSpec('1,3,', 10), /空段/);
  assert.throws(() => core.parsePageSpec('abc', 10), /无法识别/);
  assert.throws(() => core.parsePageSpec('1-3-5', 10), /无法识别/);
  assert.throws(() => core.parsePageSpec('-3', 10), /无法识别|缺少起始页/);
  assert.throws(() => core.parsePageSpec('3-', 10), /无法识别/, '残缺区间不猜语义');
  assert.throws(() => core.parsePageSpec('0', 10), /从 1 开始/);
  assert.throws(() => core.parsePageSpec('-1', 10), /无法识别|从 1 开始/);
  assert.throws(() => core.parsePageSpec('2-1', 10), /起始页大于结束页/);
  assert.throws(() => core.parsePageSpec('1-11', 10), /超过文档总页数/);
  assert.throws(() => core.parsePageSpec('11', 10), /超过文档总页数/);
  assert.throws(() => core.parsePageSpec('11-12', 10), /超出|超过/);
  assert.throws(() => core.parsePageSpec('1-10', 0), /页数必须是正整数/);
  assert.throws(() => core.parsePageSpec('1-10', -3), /页数必须是正整数/);
  assert.throws(() => core.parsePageSpec('1-10', 2.5), /页数必须是正整数/);
  assert.throws(() => core.parsePageSpec(null, 10), /类型不支持/);
  assert.throws(() => core.parsePageSpec([0, 1], 10), /从 1 开始/);
  assert.throws(() => core.parsePageSpec([1.5], 10), /非法项/);
});

test('parsePageSpec：end 关键字与显式越界的差别', () => {
  // '6-end' 在 10 页文档上等于 6-10 合法；显式 6-11 报错
  assert.deepEqual(core.parsePageSpec('6-end', 10), [6, 7, 8, 9, 10]);
  assert.throws(() => core.parsePageSpec('6-11', 10), /超过文档总页数/);
});

// ── compactRanges ───────────────────────────────────────────────────────────

test('compactRanges：压缩连续页', () => {
  assert.equal(core.compactRanges([1, 2, 3, 7]), '1-3,7');
  assert.equal(core.compactRanges([5]), '5');
  assert.equal(core.compactRanges([1, 2, 3]), '1-3');
  assert.equal(core.compactRanges([3, 1, 2]), '1-3', '乱序输入先归一');
  assert.equal(core.compactRanges([1, 3, 5, 7]), '1,3,5,7');
  assert.equal(core.compactRanges([]), '');
});

// ── 输出命名 ────────────────────────────────────────────────────────────────

test('pickOutputName：冲突自动 -2/-3 递增（永不覆盖）', () => {
  const existing = new Set(['D:\\out\\a.pdf']);
  const exists = (p) => existing.has(p);
  const first = core.pickOutputName('D:\\out', 'a', '.pdf', exists);
  assert.equal(first, 'D:\\out\\a-2.pdf');
  existing.add(first);
  assert.equal(core.pickOutputName('D:\\out', 'a', '.pdf', exists), 'D:\\out\\a-3.pdf');
  assert.equal(core.pickOutputName('D:\\out', 'b', '.pdf', exists), 'D:\\out\\b.pdf', '无冲突直接用');
});

test('pickOutputName：目录尾斜杠与正斜杠兼容', () => {
  assert.equal(core.pickOutputName('D:\\out\\', 'x', '.pdf', () => false), 'D:\\out\\x.pdf');
  assert.equal(core.pickOutputName('/tmp/out', 'x', '.pdf', () => false), '/tmp/out/x.pdf');
});

test('sanitizeStem：路径成分/非法字符/Windows 保留名/空名', () => {
  assert.equal(core.sanitizeStem('a b.pdf'), 'a b');
  assert.equal(core.sanitizeStem('C:\\evil\\path\\name.pdf'), 'name', '取最后一段');
  assert.equal(core.sanitizeStem('..\\..\\boot.ini'), 'boot', '目录穿越成分剥离');
  assert.equal(core.sanitizeStem('a<b>:c?.pdf'), 'a_b__c_');
  assert.equal(core.sanitizeStem('CON.pdf'), '_CON', 'Windows 保留设备名');
  assert.equal(core.sanitizeStem('com1.txt'), '_com1');
  assert.equal(core.sanitizeStem(''), 'output');
  assert.equal(core.sanitizeStem('   '), 'output');
  assert.equal(core.sanitizeStem('noext'), 'noext');
  assert.equal(core.sanitizeStem('中文 名.pdf'), '中文 名', '中文保留');
});

// ── 魔数与校验 ──────────────────────────────────────────────────────────────

test('isPdfBytes：容忍前导垃圾、拒绝非 PDF', () => {
  assert.ok(core.isPdfBytes(Buffer.from('%PDF-1.7 rest')));
  assert.ok(core.isPdfBytes(Buffer.concat([Buffer.from('\ufeffjunk...'), Buffer.from('%PDF-1.4')])));
  // %PDF- 只出现在 1024 字节之后：仍判非 PDF（防止深扫误判）
  const late = Buffer.concat([Buffer.alloc(1100, 0x41), Buffer.from('%PDF-1.4')]);
  assert.ok(!core.isPdfBytes(late));
  assert.ok(!core.isPdfBytes(Buffer.from('plain text')));
  assert.ok(!core.isPdfBytes(Buffer.alloc(0)));
});

test('imageKind：JPG/PNG 魔数', () => {
  assert.equal(core.imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(core.imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'png');
  assert.equal(core.imageKind(Buffer.from([0x00, 0x00, 0x01, 0x00])), null, 'ICO 拒绝');
  assert.equal(core.imageKind(Buffer.alloc(2)), null);
});

test('validateInputs：总量上限/类型过滤/空单拒绝', () => {
  assert.throws(() => core.validateInputs([], { maxBytes: 100, kind: 'pdf' }), /没有收到任何输入/);
  assert.throws(() => core.validateInputs([{ name: 'a.pdf', size: 10 }], { maxBytes: 5, kind: 'pdf' }), /超过上限/);
  assert.throws(() => core.validateInputs([{ name: 'a.txt', size: 1 }], { maxBytes: 100, kind: 'pdf' }), /不是 PDF/);
  assert.throws(() => core.validateInputs([{ name: 'a.heic', size: 1 }], { maxBytes: 100, kind: 'image' }), /不是支持的图片/);
  assert.throws(() => core.validateInputs([{ name: '', size: 1 }], { maxBytes: 100, kind: 'pdf' }), /缺少文件名/);
  const ok = core.validateInputs([{ name: 'a.PDF', size: 1 }, { name: 'b.pdf', size: 2 }], { maxBytes: 100, kind: 'pdf' });
  assert.equal(ok.length, 2);
  assert.equal(ok[0].stem, 'a', '扩展名大小写不敏感');
  const tooMany = Array.from({ length: 201 }, (_, i) => ({ name: 'f' + i + '.pdf', size: 0 }));
  assert.throws(() => core.validateInputs(tooMany, { maxBytes: 1e9, kind: 'pdf' }), /最多处理 200/);
});

// ── 设置/角度/格式化 ────────────────────────────────────────────────────────

test('normalizeSettings：钳制与默认', () => {
  assert.deepEqual(core.normalizeSettings(null), { outDir: '', maxUploadMB: 128, historyCap: 200 });
  assert.deepEqual(core.normalizeSettings({ outDir: ' D:\\x ', maxUploadMB: 99999, historyCap: 0 }),
    { outDir: 'D:\\x', maxUploadMB: 1024, historyCap: 10 });
  assert.deepEqual(core.normalizeSettings({ maxUploadMB: 0.4 }), { outDir: '', maxUploadMB: 1, historyCap: 200 });
  assert.deepEqual(core.normalizeSettings({ outDir: 42, maxUploadMB: '64' }), { outDir: '', maxUploadMB: 64, historyCap: 200 });
});

test('normalizeAngle：90 的倍数归一，其余报错', () => {
  assert.equal(core.normalizeAngle(90), 90);
  assert.equal(core.normalizeAngle(-90), 270);
  assert.equal(core.normalizeAngle(450), 90);
  assert.equal(core.normalizeAngle(180), 180);
  assert.throws(() => core.normalizeAngle(0), /旋转角度/);
  assert.throws(() => core.normalizeAngle(45), /旋转角度/);
  assert.throws(() => core.normalizeAngle('90'), /旋转角度/, '字符串拒绝（schema 层已保证 number，这里双保险）');
});

test('formatBytes：人类可读', () => {
  assert.equal(core.formatBytes(512), '512 B');
  assert.equal(core.formatBytes(2048), '2.0 KB');
  assert.equal(core.formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(core.formatBytes(1.5 * 1024 * 1024 * 1024), '1.50 GB');
  assert.equal(core.formatBytes(-1), '?');
});
