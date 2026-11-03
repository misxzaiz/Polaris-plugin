/**
 * yaml-lens 面板 SSR 渲染断言（node test/ssr-verify.mjs）
 * 纪律（platform-constraints 实证坑）：
 *  - esbuild JS API 现场构建 CJS 测试包；--external:react 防 react 双实例
 *  - 测试 bundle 输出到插件内 .ssr-tmp/（tmpdir 解析会命中杂散 react）
 *  - 退出码在 finally 之外收集后 exit；固定目录名 + 重试清理
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

  // 1) 默认（Norway 样例 + 解析预览视图）
  const h1 = renderToStaticMarkup(React.createElement(Entry, {}));
  check('渲染: 根节点 yl-root', h1.includes('yl-root'));
  check('渲染: 标题', h1.includes('YAML 调试台'));
  check('渲染: 三视图 chips', h1.includes('解析预览') && h1.includes('坑检测') && h1.includes('转换'));
  check('渲染: 样例 chips', h1.includes('Norway problem') && h1.includes('数字形态') && h1.includes('书写陷阱'));
  check('渲染: 解析成功 1 文档', h1.includes('解析成功') && h1.includes('1</b> 个文档') || (h1.includes('解析成功') && h1.includes('个文档')));
  check('渲染: JSON 预览含数据', h1.includes('&quot;replicas&quot;: 3') || h1.includes('"replicas": 3'));
  check('渲染: textarea 携带输入', h1.includes('enabled: no'));

  // 2) 坑检测视图（Norway）
  const h2 = renderToStaticMarkup(React.createElement(Entry, { initialView: 'lint' }));
  check('渲染: issue 卡 bool-lookalike', h2.includes('bool-lookalike'));
  check('渲染: 跨实现文案', h2.includes('PyYAML'));
  check('渲染: 严重度徽章', h2.includes('警告') && h2.includes('提示'));
  check('渲染: 修复 hint', h2.includes('加引号'));

  // 3) 数字形态样例的坑检测
  const NUMS = 'zip: 02134\nv: 1.10\nt: 12:34:56\nbig: 9007199254740993\n';
  const h3 = renderToStaticMarkup(React.createElement(Entry, { initialText: NUMS, initialView: 'lint' }));
  check('渲染: 前导零/尾零/六十进制/大整数四条', h3.includes('leading-zero') && h3.includes('float-form') && h3.includes('sexagesimal') && h3.includes('big-int'));
  check('渲染: 八进制对照值', h3.includes('1116'));
  check('渲染: 错误计数展示', h3.includes('错误 0'));

  // 4) 转换视图 YAML→JSON
  const h4 = renderToStaticMarkup(React.createElement(Entry, { initialView: 'convert' }));
  check('渲染: 转换标题', h4.includes('JSON 输出'));
  check('渲染: 方向 chips', h4.includes('YAML → JSON') && h4.includes('JSON → YAML'));
  check('渲染: 转换产物', h4.includes('replicas'));

  // 5) 转换视图 JSON→YAML
  const h5 = renderToStaticMarkup(React.createElement(Entry, { initialText: '{"a":1,"名":"值"}', initialView: 'convert', initialDir: 'j2y' }));
  check('渲染: YAML 产物含中文键', h5.includes('名: 值'));
  check('渲染: 按键排序选项出现', h5.includes('按键排序'));

  // 6) 解析失败渲染（重复键）
  const h6 = renderToStaticMarkup(React.createElement(Entry, { initialText: 'a: 1\na: 2', initialView: 'parse' }));
  check('渲染: 解析失败卡带行列', h6.includes('解析失败') && h6.includes('第 2 行'));

  // 7) 锚点样例解析失败（未定义别名）
  const h7 = renderToStaticMarkup(React.createElement(Entry, { initialText: 'x: *gone\n', initialView: 'parse' }));
  check('渲染: 未定义别名报错', h7.includes('解析失败'));

  // 8) 空文本
  const h8 = renderToStaticMarkup(React.createElement(Entry, { initialText: '', initialView: 'parse' }));
  check('渲染: 空文本说明', h8.includes('空文本'));
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
