/**
 * render-verify.mjs —— 面板 SSR 渲染验证（防 Invalid hook call / 缺宿主桥崩溃）
 * 与 ai-scheduler 同款纪律：renderToString 面板根组件，宿主桥缺失时须走
 * 「报错提示」分支而非白屏/崩溃。需先 npm run build 产 dist/panel.js。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { renderToString } = await import('react-dom/server');
const React = await import('react');

const dist = path.resolve('dist/panel.js');
assert.ok(fs.existsSync(dist), 'dist/panel.js 不存在——先 npm run build');

const mod = await import(pathToFileURL(dist).href);
assert.strictEqual(typeof mod.default, 'function', 'default export 必须是组件函数');

let threw = null;
try {
  const html = renderToString(React.createElement(mod.default));
  assert.ok(typeof html === 'string' && html.length > 0, '渲染输出非空');
  assert.ok(html.includes('宿主桥不可用'), '宿主桥缺失时应渲染明确报错文案而非空壳');
  console.log(`  ✓ SSR 渲染成功（${html.length} chars，含降级提示）`);
} catch (e) {
  threw = e;
}
if (threw && /Invalid hook call/.test(threw.message || '')) {
  console.error('  ✗ Invalid hook call——面板违反 React 规则（双 React 实例或非组件内调用 hook）');
  process.exit(1);
}
if (threw) {
  console.error(`  ✗ 渲染抛非预期错误: ${threw.message}`);
  process.exit(1);
}
console.log('  ✓ render-verify 通过');
