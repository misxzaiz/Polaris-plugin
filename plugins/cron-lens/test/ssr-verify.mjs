/**
 * cron-lens 面板 SSR 渲染断言（node test/ssr-verify.mjs）
 *
 * 坑配方（platform-constraints 实证）：
 *  - esbuild JS API 现场构建 CJS 测试包（同入口、platform:node、--external:react
 *    与 react-dom）——bundle 内打一份 react 会与测试进程双实例，hooks 全废；
 *  - 测试 bundle 产物必须输出到插件目录内（.ssr-tmp/），让 require('react') 解析
 *    收敛到插件 node_modules（写系统 tmpdir 会命中用户主目录杂散 react）；
 *  - 退出码在 finally 清理之后收集设置，不在 try 块里 process.exit（会跳过清理）。
 */
import { build } from 'esbuild';
import { rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const TMP = path.join(APP_ROOT, '.ssr-tmp');

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

let bundlePath = null;
try {
  mkdirSync(TMP, { recursive: true });
  bundlePath = path.join(TMP, 'panel.cjs');
  await build({
    entryPoints: [path.join(APP_ROOT, 'src', 'index.tsx')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    outfile: bundlePath,
    logLevel: 'silent',
  });

  const mod = require(bundlePath);
  const Entry = mod.default || mod;
  const renderWith = (expr) => renderToStaticMarkup(React.createElement(Entry, { initialExpression: expr }));

  // 无坑表达式：字段解释 + 未来触发（*/15 无任何警示，坑警示卡按设计不渲染）
  const html = renderWith('*/15 * * * *');
  check('SSR: 含标题', html.includes('Cron 表达式调试台'));
  check('SSR: 含字段解释卡（初始表达式已解析）', html.includes('字段解释'));
  check('SSR: 含「每 15 分钟」中文解释', html.includes('每 15 分钟'));
  check('SSR: 含未来触发节（固定 8 行）', html.includes('未来触发') && (html.match(/epoch=/g) || []).length >= 8);
  check('SSR: 含时刻诊断节', html.includes('时刻诊断'));
  check('SSR: 无警示表达式不渲染坑警示卡', !html.includes('坑警示'));

  // OR 语义表达式：坑警示卡 + 综合判定行
  const htmlOr = renderWith('0 0 1 * 1');
  check('SSR: OR 表达式渲染坑警示卡', htmlOr.includes('坑警示'));
  check('SSR: OR 表达式警示含「或」语义说明', htmlOr.includes('「或」'));
  check('SSR: hooks 未双实例炸（产出真实行数）', html.length > 2000, `html.length=${html.length}`);
} catch (e) {
  results.push({ name: 'SSR harness', pass: false });
  console.error('  ✖ harness 异常:', e.stack || e.message);
} finally {
  if (bundlePath) rmSync(TMP, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n面板 SSR: ${results.length - failed}/${results.length} 通过`);
process.exitCode = failed ? 1 : 0;
