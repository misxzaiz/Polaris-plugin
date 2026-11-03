// 面板 SSR 渲染断言：esbuild JS API 现场构建 CJS 测试包（--external:react 防双实例，
// trace-lens 坑；产物写插件目录内 .ssr-tmp 防解析到主目录杂散 react，regex-desk 坑）
// 运行：node test/ssr-verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const tmpDir = path.join(pluginRoot, '.ssr-tmp');
let pass = 0;
let fail = 0;
const failures = [];
const assert = (cond, label) => {
  if (cond) { pass += 1; console.log(`  ✔ ${label}`); }
  else { fail += 1; failures.push(label); console.log(`  ✘ ${label}`); }
};

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(pluginRoot, 'src', 'index.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(tmpDir, 'panel.cjs'),
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    logLevel: 'silent',
  });
  // 清 require 缓存（重复跑时避免旧产物）
  delete require.cache[require(path.join(tmpDir, 'panel.cjs'))];
  const Panel = require(path.join(tmpDir, 'panel.cjs')).default;
  const html = renderToStaticMarkup(React.createElement(Panel, { pluginId: 'data-query' }));

  assert(html.includes('数据查询台'), '标题渲染');
  assert(html.includes('导入数据文件'), '导入卡片渲染');
  assert(html.includes('三步开始'), '空状态引导渲染');
  assert(html.includes('SELECT'), '示例 SQL 占位渲染');
  assert(html.includes('dq-root'), '根容器 class 渲染');
  assert(!html.includes('undefined'), '无 undefined 渗漏');
  console.log(`panel SSR html length: ${html.length}`);
} catch (e) {
  fail += 1;
  failures.push(`异常: ${e.message}`);
  console.log(`  ✘ 异常: ${e.message}`);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exitCode = fail > 0 ? 1 : 0;
