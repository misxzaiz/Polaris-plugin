/**
 * 面板 SSR 渲染冒烟（node test/panel-ssr.mjs）
 *
 * esbuild JS API 现场构建 CJS 测试包（--external:react 防双 react 实例毁 hooks，
 * trace-lens 实证坑），renderToStaticMarkup 渲染断言。产物即用即清。
 *
 * 坑：测试包不能写到系统 tmpdir——external:react 的 require('react') 会从
 * tmpdir 逐级向上解析，命中用户主目录杂散 node_modules 的旧版 react，
 * 与插件 node_modules 的 react 形成双实例（hooks 全废）。产物必须放插件目录内，
 * 让解析收敛到插件的 node_modules。
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);

const outdir = path.join(APP_ROOT, '.ssr-tmp');
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
};

try {
  mkdirSync(outdir, { recursive: true });
  const outfile = path.join(outdir, 'panel-test.cjs');
  await build({
    entryPoints: [path.join(APP_ROOT, 'src', 'Panel.tsx')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
  });

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Panel = require(outfile).default;

  const html = renderToStaticMarkup(React.createElement(Panel, {}));

  check('SSR 含面板标题「正则调试台」', html.includes('正则调试台'));
  check('SSR 含执行按钮', html.includes('执行'));
  check('SSR 含 JS RegExp 真实语义说明', html.includes('JS RegExp 真实语义'));
  check('SSR 含 ReDoS tab', html.includes('ReDoS'));
  check('SSR 含替换 tab', html.includes('替换'));
  check('SSR 含安全边界说明（纯本地）', html.includes('文本不出本机'));
  check('SSR 无 undefined 泄漏', !/undefined|NaN/.test(html), html.slice(0, 200));
} finally {
  rmSync(outdir, { recursive: true, force: true });
}

const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
