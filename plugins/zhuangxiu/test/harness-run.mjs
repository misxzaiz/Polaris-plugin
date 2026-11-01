#!/usr/bin/env node
/**
 * 无头渲染冒烟（node test/harness-run.mjs）：jsdom + 真实 esbuild bundle。
 * 验证面板在「有种子数据」时四个 Tab 实际渲染不崩、预算执行大卡与红黄档出现、
 * 科目行与增项标记出现、节点红黄榜出现、记一笔表单点击后写 cap.kv（stub 内存库
 * 回读）、对账小结文本生成、科目编辑弹窗打开。零 mock 业务逻辑——stub 只是宿主
 * invoke 通道，业务口径全部走 shared/core 真实现。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');

// 1) 构建 harness bundle（React 打进去，无需宿主 shim）
execSync(
  `npx esbuild test/harness-entry.tsx --bundle --format=cjs --jsx=automatic --outfile=test/.harness-bundle.cjs --loader:.css=empty`,
  { cwd: pluginDir, stdio: 'inherit' },
);

// 2) jsdom 环境前置
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch (_) { /* node 自带 navigator，保留 */ }
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const failures = [];
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else console.log(`  ✓ ${label}`);
};

// 3) 加载 bundle（挂载 + 首轮轮询）
await import('./.harness-bundle.cjs');
await new Promise((r) => setTimeout(r, 1500));

const $ = (sel) => dom.window.document.querySelector(sel);
const $$ = (sel) => [...dom.window.document.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const setVal = (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};
const store = dom.window.__HARNESS_STORE__;

console.log('[harness] 总览 Tab');
okIf(!!$('.zx-root'), '面板根渲染');
okIf($$('.zx-tab').length === 4, `四 Tab 存在（${$$('.zx-tab').length}）`);
okIf($('.zx-root').textContent.includes('世纪花园'), '项目名出现');
okIf($('.zx-body').textContent.includes('8,400'), '已花 8,400 出现（3200+4400+800）');
okIf($('.zx-body').textContent.includes('300,000'), '总预算 300,000 出现');
okIf($('.zx-body').textContent.includes('800'), '增项合计 800 出现');
okIf(!!$('.zx-tag.yellow') || !!$('.zx-tag.red'), '红/黄档标签出现');
okIf($('.zx-body').textContent.includes('水电验收'), '逾期节点（水电验收）出现');
okIf($('.zx-body').textContent.includes('常见漏项检查'), '漏项检查卡出现（种子仅 3 科目）');
okIf($('.zx-body').textContent.includes('美缝'), '漏项含美缝');
okIf($('.zx-body').textContent.includes('张师傅'), '最近流水含供应商张师傅');

console.log('[harness] 科目 Tab');
click($$('.zx-tab')[1]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.zx-body').textContent.includes('瓷砖') && $('.zx-body').textContent.includes('水电改造'), '科目行渲染');
okIf($('.zx-body').textContent.includes('窗套加固'), '增项科目出现');
okIf(!!$('.zx-tag.yellow') || !!$('.zx-tag.red'), '超支/临超标记出现');
const tileBtn = $$('.zx-item').find((el) => el.textContent.includes('瓷砖'));
okIf(!!tileBtn, '瓷砖科目行可点击');
if (tileBtn) {
  click(tileBtn);
  await new Promise((r) => setTimeout(r, 300));
  okIf($('.zx-body').textContent.includes('科目「瓷砖」'), '科目编辑弹窗打开');
  okIf($$('.zx-modal input').length >= 1, '编辑弹窗含预算输入');
  const cancel = $$('.zx-modal .zx-btn').find((b) => b.textContent === '取消');
  click(cancel);
  await new Promise((r) => setTimeout(r, 200));
}

console.log('[harness] 流水 Tab');
click($$('.zx-tab')[2]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.zx-body').textContent.includes('记一笔'), '记账表单渲染');
const amountInp = $$('input[placeholder="3200"]')[0];
const catSel = $$('.zx-sel')[0];
okIf(!!amountInp && !!catSel, '金额与科目控件存在');
const tileId = [...store.entries()].find(([k, v]) => k.startsWith('zhuangxiu.cat.') && v.name === '瓷砖')[0].slice('zhuangxiu.cat.'.length);
const expCountBefore = [...store.keys()].filter((k) => k.startsWith('zhuangxiu.exp.')).length;
if (amountInp && catSel) {
  setVal(amountInp, '128');
  setVal(catSel, tileId); // 瓷砖（真实 id）
  const saveBtn = $$('.zx-btn').find((b) => b.textContent === '记入台账');
  click(saveBtn);
  await new Promise((r) => setTimeout(r, 800));
  const expVals = [...store.entries()].filter(([k]) => k.startsWith('zhuangxiu.exp.')).map(([, v]) => v);
  const added = expVals.find((e) => e.amount === 128 && e.catId === tileId);
  okIf(!!added, '记一笔 → cap.kv zhuangxiu.exp.* 新增 128 元一笔');
  okIf(expVals.length === expCountBefore + 1, '支出键数 +1');
  okIf(added && added.src === 'panel', '面板来源标记 src=panel');
  okIf(added && added.vendorId === '', '未选供应商 → vendorId 空串');
}

console.log('[harness] 档案 Tab');
click($$('.zx-tab')[3]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.zx-body').textContent.includes('项目档案'), '项目档案渲染');
okIf($('.zx-body').textContent.includes('供应商'), '供应商区渲染');
okIf($('.zx-body').textContent.includes('13800000000'), '张师傅电话出现');
okIf($('.zx-body').textContent.includes('泥瓦验收'), '节点泥瓦验收出现');
const sumBtn = $$('.zx-btn').find((b) => b.textContent === '生成对账小结');
click(sumBtn);
await new Promise((r) => setTimeout(r, 400));
const sumTa = $$('textarea').find((t) => t.value.includes('装修对账小结'));
okIf(!!sumTa, '对账小结文本生成');
okIf(sumTa && sumTa.value.includes('世纪花园'), '小结含项目名');
okIf(sumTa && sumTa.value.includes('增项合计'), '小结含增项合计');
okIf(sumTa && sumTa.value.includes('不构成造价/法律建议'), '小结含免责');
const expBtn = $$('.zx-btn').find((b) => b.textContent === '生成导出 JSON');
click(expBtn);
await new Promise((r) => setTimeout(r, 300));
const expTa = $$('textarea').find((t) => t.value.includes('"app": "zhuangxiu"'));
okIf(!!expTa, '导出 JSON 生成');

console.log('[harness] 切回总览 Tab（状态保持）');
click($$('.zx-tab')[0]);
await new Promise((r) => setTimeout(r, 300));
okIf($('.zx-body').textContent.includes('预算执行'), '切回后正常渲染');

console.log('');
if (failures.length) {
  console.error(`❌ harness ${failures.length} 项失败`);
  process.exit(1);
}
console.log('✅ 无头渲染冒烟通过（四 Tab 渲染 + 记一笔写库 + 小结/导出/编辑弹窗）');
process.exit(0);
