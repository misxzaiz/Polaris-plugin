/**
 * 面板 SSR 渲染冒烟（house 配方：单 React 实例 renderToString）：
 * node test/panel-ssr.mjs
 * 面板 bundle 用真实 react（非 external）打成 CJS 后 SSR——验证无运行时崩溃、
 * 关键文案在列。useEffect 网络逻辑 SSR 不执行，属正常。
 */
import assert from 'node:assert';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 输出必须落在插件目录内：external 的 require('react') 从 outfile 向上解析，
// 与 react-dom 命中同一份 node_modules/react（否则双 React 实例 → invalid hook call）
const outDir = path.join(here, '.ssr-out');
const outfile = path.join(outDir, 'panel-ssr.cjs');

await build({
  entryPoints: [path.join(here, '..', 'src', 'index.tsx')],
  bundle: true,
  format: 'cjs',
  outfile,
  jsx: 'automatic',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});

// 缺 __POLARIS_HOST_INVOKE__ 时面板应渲染出「连接服务中…」骨架而非崩溃
const mod = require(outfile);
assert.equal(typeof mod.default, 'function', '入口应 default export 函数组件');

const React = require('react');
const { renderToString } = require('react-dom/server');
const html = renderToString(React.createElement(mod.default));

assert.ok(html.includes('合同'), '应渲染「合同」Tab');
assert.ok(html.includes('调试'), '应渲染「调试」Tab');
assert.ok(html.includes('对比'), '应渲染「对比」Tab');
assert.ok(html.includes('连接服务中…'), '服务未就绪时应显示连接中骨架');

fs.rmSync(outDir, { recursive: true, force: true });
console.log('✔ 面板 SSR 冒烟通过（骨架渲染无崩溃）');
