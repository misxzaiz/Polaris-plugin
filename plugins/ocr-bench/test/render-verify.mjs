/**
 * 文字识别台面板渲染断言（node test/render-verify.mjs）
 * esbuild 打包 render-entry.tsx → Node SSR（react-dom/server）
 * 断言三 Tab 关键 UI、护栏文案、报告卡、离线空态，不依赖浏览器。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 内存 cap.kv（SSR 的 effect 不执行，这里只为防御性兜底）
const store = new Map();
globalThis.__POLARIS_HOST_INVOKE__ = async (cmd, args) => {
  if (cmd !== 'router_dispatch') throw new Error('unexpected cmd ' + cmd);
  const { target, payload } = args.req;
  if (target !== 'cap.kv') throw new Error('unexpected target ' + target);
  if (payload.action === 'get') return { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } };
  if (payload.action === 'set') { store.set(payload.key, payload.value); return { ok: true, result: {} }; }
  if (payload.action === 'delete') { store.delete(payload.key); return { ok: true, result: {} }; }
  if (payload.action === 'list') return { ok: true, result: { keys: [...store.keys()] } };
  throw new Error('unexpected action');
};

// 打包 SSR 入口
const esbuild = require('esbuild');
const outfile = path.join(APP_ROOT, 'test', '.render-bundle.cjs');
esbuild.buildSync({
  entryPoints: [path.join(APP_ROOT, 'test', 'render-entry.tsx')],
  bundle: true,
  format: 'cjs',
  outfile,
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'silent',
});
require(outfile);

const render = globalThis.__ocrBenchRender;
assert.equal(typeof render, 'function', '渲染入口未注册');

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { failed += 1; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}: ${e.message}`); }
}

const now = new Date().toISOString();
const seedReport = {
  runId: 'test-run-1',
  at: now,
  version: '0.1.0',
  langs: ['chi_sim', 'eng'],
  psm: 3,
  outDir: null,
  source: 'panel',
  aborted: false,
  summary: {
    files: 2, okFiles: 1, failFiles: 1, totalChars: 42, ocrPages: 1, nativePages: 1,
    meanConfidence: 91.5, lowConfPages: 0, durationMs: 3200, aborted: false,
    oneLine: '1/2 个文件完成，提取 42 字（OCR 1 页 / 文字层直读 1 页 · 平均置信度 91.5）',
    notes: ['1 个文件识别失败（多为损坏/加密/无页面图像，详见逐项错误）'],
  },
  files: [
    { path: 'C:\\docs\\fixture-zh.png', type: 'image', ok: true, error: null, pages: [{ page: 1, chars: 42, confidence: 91.5, mode: 'ocr', error: null }], chars: 42, durationMs: 3200, outFile: 'C:\\out\\fixture-zh.txt', truncatedFile: false, textHead: '检验报告单 患者姓名: 张三' },
    { path: 'C:\\docs\\corrupt.pdf', type: 'pdf', ok: false, error: 'PDF 解析失败：bad', pages: [], chars: 0, durationMs: 5, outFile: null, truncatedFile: false, textHead: '' },
  ],
};
const seedHistory = [{
  runId: 'test-run-1', at: now, files: 2, okFiles: 1, failFiles: 1, totalChars: 42,
  ocrPages: 1, nativePages: 1, meanConfidence: 91.5, durationMs: 3200,
  langs: ['chi_sim', 'eng'], aborted: false, sample: 'C:\\docs\\fixture-zh.png',
  oneLine: '1/2 个文件完成',
}];

const raw = render({
  meta: { ts: now, version: '0.1.0', port: 29311, token: 'x'.repeat(32), degraded: false, running: null, lastReportId: 'test-run-1' },
  settings: { langs: ['chi_sim', 'eng'], psm: 3, outDir: '' },
  lastReport: seedReport,
  history: seedHistory,
});
// JSX 插值在 SSR 输出中产生 <!-- --> 注释节点：剥掉后再做文本断言
const strip = (s) => s.replace(/<!--.*?-->/g, '');
const html = { panel: strip(raw.panel), work: strip(raw.work), langs: strip(raw.langs), history: strip(raw.history) };

await test('面板外壳：标题 + 三 Tab + SSR 恒离线态（meta 经 effect 加载）', () => {
  assert.ok(html.panel.includes('文字识别台'));
  assert.ok(html.panel.includes('>识别<'));
  assert.ok(html.panel.includes('>语言包<'));
  assert.ok(html.panel.includes('>历史<'));
  assert.ok(html.panel.includes('服务未连接（等待心跳'));
});

await test('识别 Tab：输入区/语言 chips/PSM 选项/护栏文案', () => {
  assert.ok(html.work.includes('每行一个：文件或目录的绝对路径'));
  assert.ok(html.work.includes('简体中文'));
  assert.ok(html.work.includes('自动分页（默认）'));
  assert.ok(html.work.includes('单任务 ≤200 文件'));
  assert.ok(html.work.includes('PDF ≤500 页'));
  assert.ok(html.work.includes('单图 ≤50MB'));
  assert.ok(html.work.includes('开始识别'));
});

await test('报告卡：汇总六格 + 中文结论 + 逐文件状态与文本预览', () => {
  assert.ok(html.work.includes('文件成功'));
  assert.ok(html.work.includes('提取字符'));
  assert.ok(html.work.includes('平均置信度'));
  assert.ok(html.work.includes('检验报告单'));
  assert.ok(html.work.includes('PDF 解析失败'));
  assert.ok(html.work.includes('fixture-zh.png'));
  assert.ok(html.work.includes('已导出 fixture-zh.txt'));
});

await test('语言包 Tab：SSR 空态（清单经服务 effect 加载）+ 免责声明在卡内静态渲染', () => {
  assert.ok(html.langs.includes('服务未连接，无法读取语言包清单'));
  assert.ok(html.langs.includes('离线即用'));
  assert.ok(html.langs.includes('手写体不在可靠识别范围内'));
});

await test('历史 Tab：条目渲染 + 汇总行 + 样本文件名', () => {
  assert.ok(html.history.includes('识别历史'));
  assert.ok(html.history.includes('1/2 个文件完成'));
  assert.ok(html.history.includes('fixture-zh.png 等 2 个'));
});

await test('离线空态：无 meta 时识别 Tab 仍渲染（不崩）', () => {
  const off = render({ meta: null, settings: null, lastReport: null, history: [] });
  assert.ok(off.work.includes('开始识别'));
  assert.ok(off.history.includes('还没有历史记录'));
});

fs.rmSync(outfile, { force: true });
console.log(`\nSSR 渲染断言：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
