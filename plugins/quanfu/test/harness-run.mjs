#!/usr/bin/env node
/**
 * 无头渲染冒烟（node test/harness-run.mjs）：jsdom + 真实 esbuild bundle。
 * 验证面板在「有种子数据」时四个 Tab 实际渲染不崩、贷款卡/临近徽标/合计出现、
 * 测算三方案对比卡本地现算出现、记事件写 cap.kv（stub 内存库收到 set）。
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

console.log('[harness] 总览 Tab');
okIf(!!$('.qf-root'), '面板根渲染');
okIf($$('.qf-tab').length === 4, `四 Tab 存在（${$$('.qf-tab').length}）`);
okIf($('.qf-body').textContent.includes('商贷'), '贷款「商贷」出现');
okIf($('.qf-body').textContent.includes('公积金'), '贷款「公积金」出现');
okIf($('.qf-body').textContent.includes('月供合计'), '家庭合计渲染');
okIf($('.qf-body').textContent.includes('剩余本金'), '剩余本金渲染');
okIf($('.qf-body').textContent.includes('今年已付利息'), '今年已付利息渲染');
okIf($('.qf-body').textContent.includes('下次重定价'), '重定价倒数渲染（种子贷款配置了 01-01）');
okIf($('.qf-body').textContent.includes('最近对账'), '对账漂移行渲染');

console.log('[harness] 测算 Tab');
click($$('.qf-tab')[1]);
await new Promise((r) => setTimeout(r, 400));
okIf($('.qf-body').textContent.includes('提前还款金额'), '测算表单渲染');
okIf($('.qf-body').textContent.includes('口径说明'), '口径说明渲染');
const runBtn = $$('.qf-btn').find((b) => b.textContent.includes('对比'));
okIf(!!runBtn, '对比按钮存在');
if (runBtn) {
  click(runBtn);
  await new Promise((r) => setTimeout(r, 600));
  const txt = $('.qf-body').textContent;
  okIf(txt.includes('不提前还'), '基准方案卡出现');
  okIf(txt.includes('缩期'), '缩期方案卡出现');
  okIf(txt.includes('减月供'), '减月供方案卡出现');
  okIf(txt.includes('省'), '省息数字出现');
  okIf(txt.includes('泉府不代作决定'), '非建议口径出现');
}

console.log('[harness] 贷款 Tab');
click($$('.qf-tab')[2]);
await new Promise((r) => setTimeout(r, 300));
okIf($('.qf-body').textContent.includes('新建贷款'), '新建入口渲染');
const loanCard = $$('.qf-card').find((c) => c.textContent.includes('商贷'));
okIf(!!loanCard, '贷款卡渲染');
if (loanCard) {
  click(loanCard.querySelector('.qf-card-b'));
  await new Promise((r) => setTimeout(r, 300));
  const txt = $('.qf-body').textContent;
  okIf(txt.includes('编辑参数'), '展开后操作按钮出现');
  okIf(txt.includes('年度支出构成'), '年度本息构成渲染');
  okIf(txt.includes('事件流水'), '事件流水渲染');
  okIf(txt.includes('重定价'), '利率变更事件出现');

  // 记一笔提前还款（写库断言）
  const amountInput = $$('.qf-inp').find((i) => i.placeholder === '金额（万）');
  okIf(!!amountInput, '记事件金额输入框存在');
  if (amountInput) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(amountInput, '10');
    amountInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const keysBefore = new Set(store.keys());
    const logBtn = $$('.qf-btn').find((b) => b.textContent === '记录');
    click(logBtn);
    await new Promise((r) => setTimeout(r, 700));
    const newKeys = [...store.keys()].filter((k) => !keysBefore.has(k));
    okIf(newKeys.some((k) => k.startsWith('quanfu.ev.prepay|')), `提前还款写入 cap.kv（${newKeys.join(',')}）`);
  }
}

console.log('[harness] 设置 Tab');
click($$('.qf-tab')[3]);
await new Promise((r) => setTimeout(r, 300));
okIf($('.qf-body').textContent.includes('提醒参数'), '提醒参数渲染');
okIf($('.qf-body').textContent.includes('导出 JSON'), '导出入口渲染');
okIf($('.qf-body').textContent.includes('不构成金融建议'), '免责声明渲染');

console.log('');
if (failures.length) {
  console.error(`❌ harness ${failures.length} 项失败`);
  process.exit(1);
}
console.log('✅ 无头渲染冒烟通过（四 Tab 渲染 + 测算三方案 + 记事件写库）');
process.exit(0);
