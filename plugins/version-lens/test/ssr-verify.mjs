/**
 * version-lens 面板 SSR 渲染断言（node test/ssr-verify.mjs）
 *
 * 纪律（platform-constraints 实证坑）：
 *  - esbuild JS API 现场构建 CJS 测试包（ESM bundle + CJS package 组合下 node 直 import dist/panel.js 会按 CJS 解析报错）
 *  - --external:react 避免 react 双实例（hooks 全废）
 *  - 测试 bundle 输出到插件内 .ssr-tmp/（系统 tmpdir 的 require 解析会命中用户目录杂散 react）
 *  - 退出码收集后在 finally 之外 exit；固定目录名 + 重试清理（mkdtemp 随机后缀泄漏坑）
 */
import { build } from 'esbuild';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const TMP = path.join(APP_ROOT, '.ssr-tmp');

// 顶部先清陈旧残留（固定目录名）
for (let i = 0; i < 5; i++) {
  try { rmSync(TMP, { recursive: true, force: true }); break; } catch (_) { /* EPERM 窗口重试 */ }
}
mkdirSync(TMP, { recursive: true });

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

let exitCode = 0;
try {
  await build({
    entryPoints: [path.join(APP_ROOT, 'src/index.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    outfile: path.join(TMP, 'panel.cjs'),
    logLevel: 'silent',
  });

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Entry = require(path.join(TMP, 'panel.cjs')).default;

  // 1) 默认输入（^1.2.3 + 预设版本清单）渲染
  const html1 = renderToStaticMarkup(React.createElement(Entry, {}));
  check('渲染: 根节点 vl-root', html1.includes('vl-root'));
  check('渲染: 标题', html1.includes('semver 版本范围调试台'));
  check('渲染: 范围解释卡含比较器', html1.includes('&gt;=1.2.3') || html1.includes('>=1.2.3'));
  check('渲染: 上界 -0 精确排他', html1.includes('2.0.0-0'));
  check('渲染: 判定表出现', html1.includes('vl-tbl') && html1.includes('逐版本判定'));
  check('渲染: 中文说明（放行交集组）', html1.includes('放行交集组'));
  check('渲染: 门控拦截行（1.2.4-beta.1）', html1.includes('门控拦截'));
  check('渲染: 排序视图出现', html1.includes('排序视图'));

  // 2) 0.x 范围坑渲染
  const html2 = renderToStaticMarkup(React.createElement(Entry, { initialRange: '^0.2.3' }));
  check('渲染: ^0.2.3 锁次版本坑', html2.includes('锁定次版本'));

  // 3) 非法范围错误渲染
  const html3 = renderToStaticMarkup(React.createElement(Entry, { initialRange: '>>> nonsense' }));
  check('渲染: 非法范围如实报错', html3.includes('无法解析范围'));

  // 4) 空版本清单不炸
  const html4 = renderToStaticMarkup(React.createElement(Entry, { initialRange: '*', }));
  check('渲染: * 范围任意版本解释', html4.includes('任意版本'));
} catch (e) {
  console.error('SSR harness 异常:', e);
  exitCode = 1;
} finally {
  for (let i = 0; i < 5; i++) {
    try { rmSync(TMP, { recursive: true, force: true }); break; } catch (_) { /* EPERM 窗口重试 */ }
  }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n共 ${results.length} 项断言：${results.length - failed} 通过 / ${failed} 失败`);
process.exit(exitCode || (failed > 0 ? 1 : 0));
