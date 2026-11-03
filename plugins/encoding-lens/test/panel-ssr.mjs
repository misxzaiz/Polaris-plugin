/**
 * encoding-lens 面板 SSR 渲染断言（node test/panel-ssr.mjs）
 *
 * 坑清单对照：
 * - esbuild 必须 --external:react（bundle 内 react 双实例会让 hooks 全废，trace-lens 实证）
 * - 测试 bundle 输出到插件目录内 .ssr-tmp/（系统 tmpdir 会逐级解析命中用户目录杂散
 *   react 旧版，regex-desk 实证）；跑完即删
 * - 固定目录名 + 顶部清陈旧 + 退出前重试 rm（mkdtemp 随机后缀泄漏无法二次清，text-triage 实证）
 * - 退出码在 finally 之外 exit（try 内 process.exit 跳过清理，text-triage 实证）
 */
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const TMP = path.join(APP_ROOT, '.ssr-tmp');
const OUT = path.join(TMP, 'panel-ssr.cjs');

let exitCode = 0;
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
};

// 顶部清陈旧残留（上次泄漏的 .cjs 会让本次 require 拿到旧产物）
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

try {
  await build({
    entryPoints: [path.join(APP_ROOT, 'src/index.tsx')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: OUT,
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
  });

  const mod = await import(pathToFileURL(OUT).href);
  // esbuild CJS 产物经 import() 后是双层 default（wrapper.default = Entry），取到函数为止
  const Entry = typeof mod.default === 'function' ? mod.default : mod.default?.default;
  assertOk(typeof Entry === 'function', '入口 default export 存在');

  const html = renderToStaticMarkup(React.createElement(Entry, {}));
  assertOk(typeof html === 'string' && html.length > 200, '渲染出非空 HTML');
  assertOk(html.includes('乱码修复'), '渲染出页签「乱码修复」');
  assertOk(html.includes('文件体检'), '渲染出页签「文件体检」');
  assertOk(html.includes('编码转换'), '渲染出页签「编码转换」');
  assertOk(html.includes('textarea'), '渲染出输入区');
  assertOk(html.includes('分析并修复'), '渲染出主操作按钮');
  assertOk(!html.includes('undefined') && !html.includes('NaN'), '无 undefined/NaN 泄漏');

  function assertOk(cond, name) {
    check(name, cond);
  }
} catch (e) {
  exitCode = 1;
  console.error('panel-ssr 异常:', e);
} finally {
  // 固定目录 + 重试删除（Windows 刚写入的 .cjs 句柄秒级释放延迟，rm 一次可能 EPERM）
  let removed = false;
  for (let i = 0; i < 5 && !removed; i++) {
    try { fs.rmSync(TMP, { recursive: true, force: true }); removed = true; } catch (_) { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!removed) console.error('⚠ .ssr-tmp 清理失败（残留不影响正确性，下次开跑会先清）');
}

const passed = results.filter((r) => r.pass).length;
console.log(`\npanel-ssr: ${passed}/${results.length} 通过`);
process.exit(exitCode || (passed === results.length ? 0 : 1));
