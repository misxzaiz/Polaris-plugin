/**
 * text-triage 面板 SSR 渲染断言（node test/ssr-verify.mjs）
 *
 * unicode-lens/regex-desk 实证配方：
 *  - esbuild JS API 现场构建 CJS 测试包（同入口、platform=node、--external:react）
 *  - 产物必须写到插件目录内（.ssr-tmp/，跑完即删）——写系统 tmpdir 会让
 *    require('react') 向上解析命中用户主目录杂散 react 形成双实例
 *  - 退出码收集移到 finally 之外（try 内 process.exit 跳过清理）
 *
 * 清理纪律：用固定目录名（.ssr-tmp）而非 mkdtemp 随机后缀——随机后缀目录一旦
 * rm 失败（Windows EPERM 窗口）就永久泄漏且下次跑也清不到；固定名 + 顶部级
 * await 重试 rm，本次跑先清陈旧残留、退出前重试到删净为止。
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const TMP = path.join(APP_ROOT, '.ssr-tmp');
let harnessError = false;
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

try {
  mkdirSync(TMP, { recursive: true });
  const outfile = path.join(TMP, 'panel-test.cjs');
  await build({
    entryPoints: [path.join(APP_ROOT, 'src', 'index.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    logLevel: 'silent',
  });

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Entry = require(outfile).default;

  const html = renderToStaticMarkup(React.createElement(Entry, {}));

  check('渲染出根节点', html.includes('tt-root'));
  check('标题「文本分流台」', html.includes('文本分流台'));
  check('副标题含三段语义', html.includes('分类') && html.includes('抽取') && html.includes('决策'));
  check('三个内置预设 chip', ['log-triage', 'latency-triage', 'disk-triage'].every((n) => html.includes(n)));
  check('模板 JSON 预填 log-triage（受控初值渲染）', html.includes('log-triage') && html.includes('FATAL'));
  check('运行按钮存在', html.includes('运行分流'));
  check('空状态无结论横幅（未运行无 tt-verdict 元素）', !html.includes('class="tt-verdict'));

  // 引擎渲染一致性：SSR 只断言初始渲染；运行路径由 run-tests + mcp-verify 覆盖
  const core = require(path.join(APP_ROOT, 'shared', 'triage-core.js'));
  const { BUILTIN_PIPELINES } = require(path.join(APP_ROOT, 'shared', 'presets.js'));
  const r = core.runPipeline(BUILTIN_PIPELINES[0].pipeline, '2026-11-04 10:00:00 ERROR [api] boom');
  const rendered = core.renderRun(r);
  check('引擎渲染含结论与证据链（与面板同源）', rendered.includes('分流结果') && rendered.includes('证据链 trace'));
} catch (e) {
  harnessError = true;
  console.error('  ✖ harness 异常:', e.message);
}

// 退出前重试清理：刚写入的 .cjs 句柄释放有秒级延迟，立即 rm 可能 EPERM
for (let i = 0; i < 5; i++) {
  try { rmSync(TMP, { recursive: true, force: true }); break; } catch (_) { await new Promise((r) => setTimeout(r, 200)); }
}
const failed = results.filter((r) => !r.pass).length + (harnessError ? 1 : 0);
const total = results.length + (harnessError ? 1 : 0);
console.log(`\nSSR 冒烟: ${total - failed}/${total} 通过`);
process.exitCode = failed ? 1 : 0;
