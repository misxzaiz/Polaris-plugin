#!/usr/bin/env node
/**
 * 无头渲染冒烟（node test/harness-run.mjs）：jsdom + 真实 esbuild bundle。
 * 验证面板在「有种子数据」时四个 Tab 实际渲染不崩、分带标签与今日清单出现、
 * 快速记录表单点击后写 cap.kv（stub 内存库回读）、就诊小结文本生成、
 * 编辑弹窗打开。零 mock 业务逻辑——stub 只是宿主 invoke 通道，业务口径全部
 * 走 shared/core 真实现。
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
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
const store = dom.window.__HARNESS_STORE__;

console.log('[harness] 记录 Tab');
okIf(!!$('.mn-root'), '面板根渲染');
okIf($$('.mn-tab').length === 4, `四 Tab 存在（${$$('.mn-tab').length}）`);
okIf($('.mn-body').textContent.includes('妈妈'), '成员「妈妈」出现');
okIf($('.mn-body').textContent.includes('152/95'), '今日血压记录出现');
okIf(!!$('.mn-tag.red'), '红分带标签出现（152/95）');
okIf($('.mn-body').textContent.includes('118/76'), '爸爸绿档记录出现');
okIf($('.mn-body').textContent.includes('血糖 6.5'), '血糖记录出现');
okIf($('.mn-body').textContent.includes('请遵医嘱') || $('.mn-body').textContent.includes('遵医嘱'), '免责口径出现');

// 快速记录：默认成员=妈妈、kind=bp；填 130/85 → 保存 → 校验写库与分带
const sysInp = $$('input[placeholder="收缩压"]')[0];
const diaInp = $$('input[placeholder="舒张压"]')[0];
if (sysInp && diaInp) {
  setVal(sysInp, '130');
  setVal(diaInp, '85');
  const dayKeyBefore = [...store.keys()].filter((k) => k.startsWith('maian.day.')).length;
  const saveBtn = $$('.mn-btn').find((b) => b.textContent === '记录');
  click(saveBtn);
  await new Promise((r) => setTimeout(r, 800));
  const todayKey = [...store.keys()].find((k) => k.startsWith('maian.day.'));
  const todayArr = store.get(todayKey) || [];
  const added = todayArr.find((r) => r.sys === 130 && r.dia === 85);
  okIf(!!added, '快速记录 → cap.kv maian.day.* 新增 130/85 一笔');
  okIf([...store.keys()].filter((k) => k.startsWith('maian.day.')).length >= dayKeyBefore, '日键数不减少');
  okIf(added && added.src === 'panel', '面板来源标记 src=panel');
} else {
  okIf(false, '快速记录表单存在（收缩压/舒张压输入框）');
}

console.log('[harness] 趋势 Tab');
click($$('.mn-tab')[1]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.mn-body').textContent.includes('区间统计'), '统计区渲染');
okIf($('.mn-body').textContent.includes('收缩压 均'), '收缩压均值卡渲染');
okIf(!!$('svg[role="img"]'), '趋势 SVG 图渲染');
const genBtn = $$('.mn-btn').find((b) => b.textContent === '生成小结');
click(genBtn);
await new Promise((r) => setTimeout(r, 400));
const summaryTa = $$('textarea').find((t) => t.value.includes('体征记录小结'));
okIf(!!summaryTa, '就诊小结文本生成');
okIf(summaryTa && summaryTa.value.includes('妈妈'), '小结含成员名');
okIf(summaryTa && summaryTa.value.includes('遵医嘱'), '小结含免责');
okIf(summaryTa && summaryTa.value.includes('152/95'), '小结含明细行');
okIf(summaryTa && summaryTa.value.includes('|'), '小结为 markdown 表');

console.log('[harness] 台账 Tab');
click($$('.mn-tab')[2]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.mn-body').textContent.includes('筛选'), '筛选区渲染');
const editBtn = $$('.mn-btn').find((b) => b.textContent === '改');
okIf(!!editBtn, '「改」按钮存在');
if (editBtn) {
  click(editBtn);
  await new Promise((r) => setTimeout(r, 300));
  okIf($('.mn-body').textContent.includes('修改记录'), '编辑弹窗打开');
  okIf($$('.mn-modal input[type="date"]').length >= 1, '编辑弹窗含日期控件');
  const cancelBtn = $$('.mn-modal .mn-btn').find((b) => b.textContent === '取消');
  click(cancelBtn);
  await new Promise((r) => setTimeout(r, 200));
}

console.log('[harness] 设置 Tab');
click($$('.mn-tab')[3]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.mn-body').textContent.includes('家庭成员'), '成员管理渲染');
okIf($('.mn-body').textContent.includes('身高'), '身高字段渲染（BMI 分带）');
okIf($('.mn-body').textContent.includes('不构成医疗建议') || $('.mn-body').textContent.includes('不提供医疗建议'), '免责声明渲染');
const expBtn = $$('.mn-btn').find((b) => b.textContent === '生成导出文本');
click(expBtn);
await new Promise((r) => setTimeout(r, 300));
const expTa = $$('textarea').find((t) => t.value.includes('"app": "maian"'));
okIf(!!expTa, '导出 JSON 生成');

console.log('[harness] 切回记录 Tab（状态保持）');
click($$('.mn-tab')[0]);
await new Promise((r) => setTimeout(r, 300));
okIf($('.mn-body').textContent.includes('今日全家'), '切回后正常渲染');

console.log('');
if (failures.length) {
  console.error(`❌ harness ${failures.length} 项失败`);
  process.exit(1);
}
console.log('✅ 无头渲染冒烟通过（四 Tab 渲染 + 快速记录写库 + 小结/导出/编辑弹窗）');
process.exit(0);
