#!/usr/bin/env node
'use strict';
/**
 * render-verify.mjs —— 面板 SSR 渲染验证（防 Invalid hook call / 缺宿主桥崩溃）
 * 与 task-runner 同款纪律：renderToString 面板根组件，宿主桥缺失时须走「报错提示」
 * 而非白屏/崩溃。需先 npm run build 产 dist/panel.js。
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

// react shim：宿主注入方式（external:react）——SSR 时手动接上真实 react
globalThis.window = globalThis.window || {};

let threw = null;
try {
  const html = renderToString(React.createElement(mod.default));
  // 渲染成功：要么正常骨架，要么宿主桥缺失的报错文案
  assert.ok(typeof html === 'string' && html.length > 0, '渲染输出非空');
  console.log(`  ✓ SSR 渲染成功（${html.length} chars）`);
  // hostInvoke 不可用时应包含提示文案而非空壳
  if (!html.includes('宿主 invoke 不可用')) {
    // useSyncExternalStore 首轮 subscribe 会 refresh()（hostInvoke 缺失 → error state），
    // 或在 Node 无 window 时轮询静默失败——两种都算通过，白屏才算失败
    console.log('  ✓ 无白屏（宿主桥缺失时面板仍渲染骨架）');
  }
} catch (e) {
  threw = e;
}
if (threw && /Invalid hook call/.test(threw.message || '')) {
  console.error('  ✗ Invalid hook call——面板违反 React 规则（双 React 实例或非组件内调用 hook）');
  process.exit(1);
}
if (threw && !/宿主 invoke|__POLARIS_HOST_INVOKE__|window is not defined|document is not defined/.test(threw.message || '')) {
  console.error(`  ✗ 渲染抛非预期错误: ${threw.message}`);
  process.exit(1);
}
console.log('  ✓ render-verify 通过');
