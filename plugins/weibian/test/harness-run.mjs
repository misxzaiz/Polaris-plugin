/**
 * 无头渲染冒烟（node test/harness-run.mjs）：jsdom + 真实 esbuild bundle。
 * 验证面板在「有种子数据」时三 Tab 实际渲染不崩、搜索→结果→预览抽屉全交互流、
 * 设置写入 cap.kv（stub 内存库收到 set）。零 mock 业务逻辑——stub 只是宿主
 * invoke 通道与服务 HTTP 通道，渲染与状态全部走真实组件代码。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');

// 1) 构建 harness bundle（React 打进去，无需宿主 shim）
execSync(
  'npx esbuild test/harness-entry.tsx --bundle --format=cjs --jsx=automatic --outfile=test/.harness-bundle.cjs',
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
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const failures = [];
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else console.log(`  ✓ ${label}`);
};

// 3) 加载 bundle（挂载 + 首轮加载）
await import('./.harness-bundle.cjs');
await new Promise((r) => setTimeout(r, 1200));

const $ = (sel) => dom.window.document.querySelector(sel);
const $$ = (sel) => [...dom.window.document.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const setInput = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
const store = dom.window.__HARNESS_STORE__;

console.log('[harness] 外壳与搜索 Tab');
okIf(!!$('.wb-root'), '面板根渲染');
okIf($$('.wb-tab').length === 3, `三 Tab 存在（${$$('.wb-tab').length}）`);
okIf($('.wb-root').textContent.includes('韦编'), '标题「韦编」');
okIf($('.wb-root').textContent.includes('已索引 42 文档'), '头部统计（种子 stats）');
okIf($('.wb-root').textContent.includes('最近检索'), '最近检索区');
okIf($('.wb-root').textContent.includes('缓存 假象'), '最近检索词出现');

// 搜索交互：输入 → 点检索 → 结果 + 高亮 mark
const input = $('.wb-inp');
okIf(!!input, '搜索输入框存在');
setInput(input, '缓存 假象');
click($$('.wb-btn').find((b) => b.textContent === '检索'));
await new Promise((r) => setTimeout(r, 600));
okIf($('.wb-root').textContent.includes('缓存策略笔记.md'), '搜索结果：文件名出现');
okIf($('.wb-root').textContent.includes('条命中'), '搜索结果：命中数出现');
okIf(!!$('.wb-snip mark'), '片段高亮 <mark> 渲染');

// 预览抽屉：点结果 → read 内容出现
click($('.wb-item'));
await new Promise((r) => setTimeout(r, 600));
okIf($('.wb-root').textContent.includes('HarnessReadProbe'), '预览抽屉：原文内容出现');
okIf($('.wb-root').textContent.includes('续读下一段') || $('.wb-root').textContent.includes('已到末尾'), '预览抽屉：分页口径出现');
click($$('.wb-btn').find((b) => b.textContent === '关闭'));
await new Promise((r) => setTimeout(r, 200));

console.log('[harness] 索引 Tab');
click($$('.wb-tab')[1]);
await new Promise((r) => setTimeout(r, 700));
okIf($('.wb-root').textContent.includes('索引目录'), '索引 Tab：目录管理区');
okIf($('.wb-root').textContent.includes('C:\\Users\\demo\\Documents'), '已有根目录显示');
okIf($('.wb-root').textContent.includes('已索引文档'), '统计卡出现');
okIf($('.wb-root').textContent.includes('no-text-layer'), '错误计数展示');
okIf($('.wb-root').textContent.includes('隐私'), '额外排除项回显');

// 添加根目录（点「常用」建议 chip → 写 kv）
const keysBefore = new Set(store.keys());
const chip = $$('.wb-chip').find((c) => c.textContent.includes('+ 桌面'));
okIf(!!chip, 'probe 建议出现');
if (chip) {
  click(chip);
  await new Promise((r) => setTimeout(r, 600));
  const s = store.get('weibian.settings');
  okIf(s && s.roots.includes('C:\\Users\\demo\\Desktop'), '点建议 chip → settings.roots 写入新目录');
}
// 保存参数按钮
const saveBtn = $$('.wb-btn').find((b) => b.textContent === '保存参数');
okIf(!!saveBtn, '保存参数按钮存在');
if (saveBtn) {
  click(saveBtn);
  await new Promise((r) => setTimeout(r, 500));
  okIf($('.wb-root').textContent.includes('已保存'), '保存参数成功提示');
}
// 清空重建确认门
const rebuildBtn = $$('.wb-btn').find((b) => b.textContent === '清空重建');
okIf(!!rebuildBtn, '清空重建按钮存在');
if (rebuildBtn) {
  click(rebuildBtn);
  await new Promise((r) => setTimeout(r, 300));
  okIf($('.wb-root').textContent.includes('清空重建将删除现有索引'), '两击确认门文案出现');
  const cancel = $$('.wb-btn').find((b) => b.textContent === '取消');
  if (cancel) click(cancel);
}

console.log('[harness] 指南 Tab');
click($$('.wb-tab')[2]);
await new Promise((r) => setTimeout(r, 300));
okIf($('.wb-root').textContent.includes('检索语法'), '指南：检索语法');
okIf($('.wb-root').textContent.includes('weibian_search'), '指南：AI 工具名');
okIf($('.wb-root').textContent.includes('已知限制'), '指南：已知限制（如实）');
okIf($('.wb-root').textContent.includes('零外网'), '指南：隐私口径');

console.log(`\n${failures.length === 0 ? '✅ 全部通过' : `❌ ${failures.length} 项失败`}`);
process.exit(failures.length ? 1 : 0);
