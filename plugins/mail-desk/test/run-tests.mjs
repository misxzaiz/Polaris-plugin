#!/usr/bin/env node
'use strict';
/**
 * run-tests.mjs —— shared/core.js 纯函数单测(零依赖,快速反馈)
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('▶ mailMatches 搜索');
t('空查询恒真', () => {
  assert.equal(core.mailMatches({ subject: 'x' }, ''), true);
  assert.equal(core.mailMatches({ subject: 'x' }, '  '), true);
});
t('中文主题命中', () => {
  assert.equal(core.mailMatches({ subject: '重置密码通知', fromText: 'a@b.c', toText: '', textPreview: '' }, '重置'), true);
});
t('大小写不敏感', () => {
  assert.equal(core.mailMatches({ subject: 'Order CONFIRMED', fromText: '', toText: '', textPreview: '' }, 'confirmed'), true);
});
t('正文字段参与匹配', () => {
  assert.equal(core.mailMatches({ subject: '', fromText: '', toText: '', textPreview: '您的验证码 481203' }, '481203'), true);
});
t('不匹配返回 false', () => {
  assert.equal(core.mailMatches({ subject: 'a', fromText: 'b', toText: 'c', textPreview: 'd' }, 'zzz'), false);
});

console.log('▶ pageArgs');
t('默认 50/0', () => assert.deepEqual(core.pageArgs('', undefined, undefined), { query: '', offset: 0, limit: 50 }));
t('负数钳制', () => assert.equal(core.pageArgs('', '-5', '-3').limit, 1));
t('上限 200', () => assert.equal(core.pageArgs('', '1', '9999').limit, 200));
t('offset 非法归 0', () => assert.equal(core.pageArgs('', 'abc', '10').offset, 0));

console.log('▶ filterRemoteResources');
t('远程 img 被阻断且留原值', () => {
  const { html, blocked } = core.filterRemoteResources('<img src="https://x.com/p.gif" alt="a">', false);
  assert.equal(blocked, 1);
  assert.ok(html.includes('data:image/svg+xml'), '换占位');
  assert.ok(html.includes('data-mdk-remote="https://x.com/p.gif"'), '留原值');
  assert.ok(!html.includes('<img src="https://x.com/p.gif"'), '原 src 不存在');
});
t('data:/cid:/相对路径 保留', () => {
  const { blocked } = core.filterRemoteResources(
    '<img src="data:image/png;base64,AA"><img src="cid:logo"><img src="assets/a.png">', false,
  );
  assert.equal(blocked, 0);
});
t('SVG image href 与 video src', () => {
  const { blocked } = core.filterRemoteResources(
    '<image href="https://a.com/i.svg"/><video src="https://b.com/v.mp4"></video>', false,
  );
  assert.equal(blocked, 2);
});
t('无引号属性', () => {
  const { blocked } = core.filterRemoteResources('<img src=https://x.com/p.gif>', false);
  assert.equal(blocked, 1);
});
t('CSS url() 阻断', () => {
  const { blocked } = core.filterRemoteResources('<style>body{background:url(https://x.com/bg.png)}</style>', false);
  assert.equal(blocked, 1);
});
t('单引号属性', () => {
  const { blocked } = core.filterRemoteResources("<img src='https://x.com/p.gif'>", false);
  assert.equal(blocked, 1);
});
t('allowRemote=true 原样返回', () => {
  const raw = '<img src="https://x.com/p.gif">';
  const { html, blocked } = core.filterRemoteResources(raw, true);
  assert.equal(blocked, 0);
  assert.equal(html, raw);
});
t('URL 含特殊字符不破坏 HTML', () => {
  const { html } = core.filterRemoteResources('<img src="https://x.com/a?b=1&c=2">', false);
  assert.ok(html.includes('data-mdk-remote="https://x.com/a?b=1&c=2"'));
});

console.log('▶ extractCodes');
t('6 位数字验证码', () => {
  assert.deepEqual(core.extractCodes('您的验证码是 481203,5 分钟内有效。'), ['481203']);
});
t('关键词加权排序', () => {
  const codes = core.extractCodes('工单号 778899\n您的验证码 112233');
  assert.equal(codes[0], '112233');
});
t('字母数字混合验证码', () => {
  assert.deepEqual(core.extractCodes('Your code: AB12CD'), ['AB12CD']);
});
t('无码返回空', () => {
  assert.deepEqual(core.extractCodes('这是一封没有验证码的信'), []);
});
t('普通单词不误报', () => {
  assert.deepEqual(core.extractCodes('Visit https://example.com for HTML email'), []);
});

console.log('▶ evictPlan 环形淘汰');
t('数量超限淘汰最旧', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, sizeBytes: 10 }));
  const drop = core.evictPlan(items, 3, 1000);
  assert.deepEqual(drop, ['m0', 'm1']);
});
t('字节超限淘汰最旧', () => {
  const items = [{ id: 'a', sizeBytes: 60 }, { id: 'b', sizeBytes: 60 }, { id: 'c', sizeBytes: 10 }];
  const drop = core.evictPlan(items, 10, 100);
  assert.deepEqual(drop, ['a']);
});
t('至少保留 1 封', () => {
  const drop = core.evictPlan([{ id: 'a', sizeBytes: 1000 }], 1, 10);
  assert.deepEqual(drop, []);
});
t('未超限不动', () => {
  const items = [{ id: 'a', sizeBytes: 10 }, { id: 'b', sizeBytes: 10 }];
  assert.deepEqual(core.evictPlan(items, 5, 100), []);
});

console.log('▶ isLocalUrl');
t('识别判定', () => {
  assert.equal(core.isLocalUrl('data:image/png;base64,AA'), true);
  assert.equal(core.isLocalUrl('cid:img1'), true);
  assert.equal(core.isLocalUrl('assets/a.png'), true);
  assert.equal(core.isLocalUrl('https://x.com/a'), false);
  assert.equal(core.isLocalUrl('http://x.com/a'), false);
});

console.log(`\n结果:${passed} 通过,${failed} 失败`);
process.exit(failed ? 1 : 0);
