#!/usr/bin/env node
/**
 * 无头渲染冒烟（node test/harness-run.mjs）：jsdom + 真实 esbuild bundle。
 * 验证面板在「有种子数据」时四个 Tab 实际渲染不崩：合计卡/红黄榜/缺口速览出现、
 * 保单卡状态标注与流水出现、透视矩阵与现金流出现、设置成员出现；
 * 并验证「记一笔缴费」按钮真实写 cap.kv（stub 内存库收到 set）。
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
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.confirm = () => true;

const failures = [];
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else console.log(`  ✓ ${label}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 3) 加载 bundle（挂载 + 首轮轮询）
await import('./.harness-bundle.cjs');
await sleep(1500);

const text = () => document.body.textContent || '';
const clickAll = (matcher) => {
  const btns = [...document.querySelectorAll('button')].filter(matcher);
  for (const b of btns) b.click();
  return btns.length;
};

try {
  // 总览（默认 Tab）
  okIf(text().includes('金匮'), '面板：标题渲染');
  okIf(text().includes('家庭合计'), '总览：合计卡');
  okIf(text().includes('年缴保费'), '总览：年缴保费口径');
  okIf(text().includes('红榜') || text().includes('宽限期'), '总览：宽限期红榜出现');
  okIf(text().includes('中止期') && text().includes('出险不赔'), '总览：中止期红榜');
  okIf(text().includes('临近缴费'), '总览：黄榜区');
  okIf(text().includes('平安少儿重疾'), '总览：黄榜含临近缴费保单');
  okIf(text().includes('等待期中'), '总览：等待期区');
  okIf(text().includes('缺口速览'), '总览：缺口速览');
  okIf(text().includes('不构成投保建议'), '总览：免责口径');

  // 保单 Tab
  clickAll((b) => b.textContent === '保单');
  await sleep(120);
  okIf(text().includes('全部成员'), '保单：过滤器');
  okIf(text().includes('好医保') && text().includes('定海柱'), '保单：种子保单卡');
  // 展开好医保卡（展开开关在行 div 上，非 button）
  const rowToClick = [...document.querySelectorAll('.jk-row')].find((el) => (el.textContent || '').includes('好医保'));
  okIf(!!rowToClick, '保单：找到好医保卡行');
  if (rowToClick) rowToClick.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  okIf(text().includes('缴费进度') && text().includes('2 / 20 期'), '保单：缴费进度（首期 + pay 事件 = 2/20 期）');
  okIf(text().includes('流水（'), '保单：流水区');
  okIf(text().includes('记一笔缴费'), '保单：记缴费按钮');

  // 记一笔缴费 → 真实写 cap.kv（stub 收到 set）
  const store = globalThis.window.__HARNESS_STORE__;
  const evKeysBefore = [...store.keys()].filter((k) => k.startsWith('jinkui.ev.')).length;
  clickAll((b) => b.textContent === '记一笔缴费');
  await sleep(300);
  const evKeysAfter = [...store.keys()].filter((k) => k.startsWith('jinkui.ev.')).length;
  okIf(evKeysAfter === evKeysBefore + 1, `记缴费：真实写入 cap.kv（${evKeysBefore}→${evKeysAfter}）`);

  // 透视 Tab
  clickAll((b) => b.textContent === '透视');
  await sleep(120);
  okIf(text().includes('保障缺口矩阵'), '透视：矩阵标题');
  okIf(text().includes('缺'), '透视：缺格标注');
  okIf(text().includes('未来 12 个月保费现金流'), '透视：现金流');
  okIf(text().includes('理赔流水'), '透视：理赔流水');
  okIf(text().includes('住院医疗'), '透视：理赔备注');

  // 设置 Tab
  clickAll((b) => b.textContent === '设置');
  await sleep(120);
  okIf(text().includes('家庭成员'), '设置：成员区');
  okIf(text().includes('本人') && text().includes('妻子') && text().includes('大娃'), '设置：种子成员');
  okIf(text().includes('提醒参数'), '设置：参数区');
  okIf(text().includes('导出 JSON'), '设置：导出');
  okIf(text().includes('零账号零上传'), '设置：口径边界');
} catch (e) {
  failures.push(`异常中断：${e.message}`);
  console.error(e);
}

console.log('');
if (failures.length) {
  console.error(`❌ harness ${failures.length} 项失败`);
  process.exit(1);
}
console.log('✅ harness 渲染冒烟通过');
process.exit(0);
