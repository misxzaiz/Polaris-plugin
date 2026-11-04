/**
 * datetime-lens 面板 SSR 渲染断言（node test/ssr-verify.mjs）
 *
 * 纪律（platform-constraints 实证坑）：
 *  - esbuild JS API 现场构建 CJS 测试包（ESM bundle + CJS package 组合下 node 直 import dist/panel.js 会按 CJS 解析报错）
 *  - --external:react 避免 react 双实例（hooks 全废）
 *  - 测试 bundle 输出到插件内 .ssr-tmp/（系统 tmpdir 的 require 解析会命中用户目录杂散 react）
 *  - 退出码收集后在 finally 之外 exit；固定目录名 + 重试清理（mkdtemp 随机后缀泄漏坑）
 */
import { build } from 'esbuild';
import { rmSync, mkdirSync } from 'node:fs';
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

  // 1) 默认输入渲染
  const html1 = renderToStaticMarkup(React.createElement(Entry, {}));
  check('渲染: 根节点 dtl-root', html1.includes('dtl-root'));
  check('渲染: 标题', html1.includes('时间与时区调试台'));
  check('渲染: 解读卡权威瞬间', html1.includes('权威瞬间'));
  check('渲染: 全格式输出卡', html1.includes('全格式输出') && html1.includes('RFC 2822'));
  check('渲染: 多时区投影表', html1.includes('多时区投影') && html1.includes('Asia/Shanghai'));
  check('渲染: 墙钟消解卡（默认空洞样本）', html1.includes('墙钟消解') && html1.includes('不存在'));
  check('渲染: 算术卡（默认 +1 天）', html1.includes('日历口径') && html1.includes('精确口径'));
  check('渲染: 解读时区下拉', html1.includes('解读时区'));

  // 2) DST 空洞样本（纽约解读）→ 空洞坑 + 切换瞬间
  const html2 = renderToStaticMarkup(React.createElement(Entry, { initialText: '2026-03-08T02:30:00', initialZone: 'America/New_York' }));
  check('渲染: floating DST 空洞坑', html2.includes('DST 空洞'));
  check('渲染: zoneless-floating 坑', html2.includes('无偏移的 date-time'));

  // 3) date-only 样本 → UTC 坑
  const html3 = renderToStaticMarkup(React.createElement(Entry, { initialText: '2026-11-04', initialZone: 'Asia/Shanghai' }));
  check('渲染: date-only UTC 坑', html3.includes('UTC 零点'));

  // 4) unix 毫秒样本 → 单位判定
  const html4 = renderToStaticMarkup(React.createElement(Entry, { initialText: '1762212000123' }));
  check('渲染: unix 毫秒单位判定', html4.includes('毫秒'));

  // 5) 非法输入如实报错
  const html5 = renderToStaticMarkup(React.createElement(Entry, { initialText: 'nonsense input' }));
  check('渲染: 非法输入报错', html5.includes('无法解析'));

  // 6) 歧义样本
  const html6 = renderToStaticMarkup(React.createElement(Entry, { initialText: '2026-11-01T01:30:00', initialZone: 'America/New_York' }));
  check('渲染: DST 歧义坑', html6.includes('出现两次'));
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
