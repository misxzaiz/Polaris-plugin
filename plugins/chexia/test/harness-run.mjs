#!/usr/bin/env node
/**
 * 无头渲染冒烟（node test/harness-run.mjs）：jsdom + 真实 esbuild bundle。
 * 验证面板在有种子数据时四个 Tab 实际渲染不崩：概览车辆卡片/证件黄榜/养护进度、
 * 补能表单点击写库、车务「做到今天」推进锚点（写 svc + 改 item）、设置建档写库。
 * 零 mock 业务逻辑——stub 只是宿主 invoke 通道，业务口径全部走 shared/core 真实现。
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
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
// 面板的删除/打卡 confirm 门：harness 一律放行
dom.window.confirm = () => true;

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
const store = dom.window.__HARNESS_STORE__;

console.log('[harness] 概览 Tab');
okIf(!!$('.cx-root'), '面板根渲染');
okIf($$('.cx-tab').length === 4, `四 Tab 存在（${$$('.cx-tab').length}）`);
okIf($('.cx-body').textContent.includes('家里的白SUV'), '车辆卡片出现');
okIf($('.cx-body').textContent.includes('里程表'), '里程表字段渲染');
okIf($('.cx-body').textContent.includes('日均里程'), '日均里程渲染');
okIf($('.cx-body').textContent.includes('机油机滤'), '养护项出现');
okIf($('.cx-body').textContent.includes('交强险'), '证件黄榜出现（12 天后到期）');
okIf($('.cx-body').textContent.includes('临近到期') || $$('.ov-alert').length > 0, '证件预警横幅渲染');
okIf($('.cx-body').textContent.includes('不构成维修/保险建议'), '免责声明渲染');

console.log('[harness] 补能 Tab（表单写库闭环）');
click($$('.cx-tab')[1]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.cx-body').textContent.includes('记一笔补能'), '补能表单渲染');
okIf($('.cx-body').textContent.includes('里程表读数（km）'), '里程字段渲染');
okIf($('.cx-body').textContent.includes('中石化'), '流水列表出现（种子站点名）');
okIf($('.cx-body').textContent.includes('分车统计'), '分车统计渲染');
// 填表单：里程 47100 / 金额 128 / 补能量 15.5（React 受控输入须用原生 setter）
const setVal = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
const inputs = $$('.cx-inp');
const odoInp = inputs.find((i) => i.placeholder && i.placeholder.includes('以上'));
const costInp = inputs.find((i) => i.placeholder === '350');
const amtInp = inputs.find((i) => i.placeholder === '42.3');
okIf(!!odoInp && !!costInp && !!amtInp, '表单三要素齐备（里程/金额/量）');
const keysBefore = new Set(store.keys());
setVal(odoInp, '47100'); setVal(costInp, '128'); setVal(amtInp, '15.5');
// 点掉「加满」复选框（覆盖 checkbox 路径，提交一条未加满记录）
const fillCheck = $('.en-check input');
if (fillCheck) click(fillCheck);
const submitBtn = $$('.cx-btn').find((b) => b.textContent === '记一笔');
click(submitBtn);
await new Promise((r) => setTimeout(r, 900));
const newEnergyKeys = [...store.keys()].filter((k) => k.startsWith('chexia.energy.') && !keysBefore.has(k));
okIf(newEnergyKeys.length === 1, `记一笔 → cap.kv 新增 energy 键（${newEnergyKeys.length}）`);
const freshE = newEnergyKeys.length ? store.get(newEnergyKeys[0]) : null;
okIf(freshE && freshE.odometer === 47100 && freshE.amount === 15.5 && freshE.filled === false, '流水字段正确（47100km / 15.5L / 未加满）');
okIf($('.cx-body').textContent.includes('近90天'), '提交后展示期间口径回执');

console.log('[harness] 车务 Tab（做到今天 → svc + item 锚点联动）');
click($$('.cx-tab')[2]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.cx-body').textContent.includes('养护项'), '养护区渲染');
okIf($('.cx-body').textContent.includes('轮胎换位'), '养护项列表出现');
okIf($('.cx-body').textContent.includes('小保养换机油机滤'), '维保记录渲染');
okIf($('.cx-body').textContent.includes('驾驶证'), '证件区渲染');
const itemKeyBefore = store.get('chexia.item.it1');
const svcKeysBefore = new Set([...store.keys()].filter((k) => k.startsWith('chexia.svc.')));
const advBtn = $$('.sv-adv').find((b) => b.textContent === '做到今天');
okIf(!!advBtn, '「做到今天」快捷按钮存在');
click(advBtn);
await new Promise((r) => setTimeout(r, 900));
const newSvcKeys = [...store.keys()].filter((k) => k.startsWith('chexia.svc.') && !svcKeysBefore.has(k));
okIf(newSvcKeys.length === 1, `做到今天 → 新增维保记录（${newSvcKeys.length}）`);
const itemKeyAfter = store.get('chexia.item.it1');
okIf(itemKeyAfter.lastDate !== itemKeyBefore.lastDate, '养护项锚点已推进（lastDate 更新）');

console.log('[harness] 设置 Tab（建档写库）');
click($$('.cx-tab')[3]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.cx-body').textContent.includes('车辆档案'), '车辆档案渲染');
okIf($('.cx-body').textContent.includes('提醒与统计参数'), '参数区渲染');
okIf($('.cx-body').textContent.includes('导出全部数据'), '导出入口渲染');
okIf($('.cx-body').textContent.includes('运行中') || $('.cx-body').textContent.includes('后台服务'), '服务信息渲染');
const nameInp = $$('.cx-inp').find((i) => i.placeholder && i.placeholder.includes('白SUV'));
if (nameInp) {
  setVal(nameInp, '冒烟面包车');
  const carKeysBefore = new Set([...store.keys()].filter((k) => k.startsWith('chexia.car.')));
  const addBtn = $$('.cx-btn').find((b) => b.textContent === '添加车辆');
  click(addBtn);
  await new Promise((r) => setTimeout(r, 900));
  const newCarKeys = [...store.keys()].filter((k) => k.startsWith('chexia.car.') && !carKeysBefore.has(k));
  okIf(newCarKeys.length === 1, `建档表单 → cap.kv 新增 car 键（${newCarKeys.length}）`);
  okIf($('.cx-body').textContent.includes('冒烟面包车'), '新车辆出现在列表');
}

console.log('[harness] 切回概览（状态保持）');
click($$('.cx-tab')[0]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.cx-body').textContent.includes('家里的白SUV'), '切回后正常渲染');

console.log('');
if (failures.length) {
  console.error(`❌ harness ${failures.length} 项失败`);
  process.exit(1);
}
console.log('✅ 无头渲染冒烟通过（四 Tab 渲染 + 补能写库 + 做到今天联动 + 建档）');
process.exit(0);
