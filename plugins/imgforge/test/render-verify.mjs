/**
 * 面板渲染断言（node test/render-verify.mjs）
 * esbuild 打包 render-entry.tsx → Node SSR（react-dom/server，宿主 invoke 用内存 kv mock）
 * 断言三 Tab 关键 UI、状态文案、GPS 提示与历史空态，不依赖浏览器。
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
  if (payload.action === 'get') return { ok: true, result: { value: store.get(payload.key) } };
  if (payload.action === 'set') { store.set(payload.key, payload.value); return { ok: true, result: {} }; }
  if (payload.action === 'delete') { store.delete(payload.key); return { ok: true, result: {} }; }
  if (payload.action === 'list') return { ok: true, result: { keys: [...store.keys()] } };
  throw new Error('unexpected action');
};

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
const R = globalThis.__imgforgeRender;

let passed = 0;
let failed = 0;
const fails = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✔ ' + name);
  } catch (e) {
    failed++;
    fails.push(name + ': ' + (e && e.message));
    console.log('  ✖ ' + name + ' — ' + (e && e.message));
  }
}

const noop = async () => {};
const baseCtx = (over = {}) => ({
  showToast: noop,
  meta: null,
  reloadMeta: noop,
  settings: { outDir: '', concurrency: 3, maxBatch: 300, maxFileMB: 100, historyCap: 100 },
  reloadSettings: noop,
  history: [],
  reloadHistory: noop,
  ...over,
});

// ── 面板外壳 ────────────────────────────────────────────────────────────────

check('Panel：标题与三 Tab', () => {
  const html = R.panel({ pluginId: 'imgforge' });
  assert.ok(html.includes('图片工坊'), '标题');
  assert.ok(html.includes('工作台') && html.includes('历史') && html.includes('设置'), '三 Tab');
});

check('Panel：服务离线提示（SSR 初始态）', () => {
  const html = R.panel({ pluginId: 'imgforge' });
  assert.ok(html.includes('服务未在线'), '离线提示');
});

check('Panel：服务在线副标题', () => {
  const html = R.panel({ pluginId: 'imgforge' });
  // SSR 不跑 effect，meta 恒 null；直接断言离线分支与 CSS 作用域
  assert.ok(html.includes('if-root'), 'CSS 作用域前缀');
  assert.ok(!html.includes('zf-'), '不得混入其他插件前缀');
});

check('WorkTab：三步流程骨架', () => {
  const html = R.work({ ctx: baseCtx() });
  assert.ok(html.includes('第一步 · 选目录'), '第一步');
  assert.ok(html.includes('图片目录绝对路径'), '目录占位');
  assert.ok(html.includes('含子目录'), '递归开关');
});

check('WorkTab：在线 meta 下扫描按钮可用', () => {
  const html = R.work({ ctx: baseCtx({ meta: { token: 't', port: 12345 } }) });
  assert.ok(html.includes('扫描'), '扫描按钮存在');
});

check('HistoryTab：空态文案', () => {
  const html = R.history(baseCtx());
  assert.ok(html.includes('还没有任务记录'), '空态');
});

check('HistoryTab：成功条目统计与节省', () => {
  const html = R.history(baseCtx({
    history: [{
      id: '1',
      at: '2026-11-01T10:00:00.000Z',
      source: 'mcp',
      pipeline: '转 WebP · 质量 80 · 剥 EXIF',
      total: 5,
      ok: 5,
      fail: 0,
      inBytes: 5000000,
      outBytes: 1500000,
      savedBytes: 3500000,
      outDir: 'C:\\pics\\imgforge-out',
      ms: 4200,
      okState: true,
    }],
  }));
  // React SSR 会在插值文本间插 <!-- -->，断言按词元而非连续串
  assert.ok(html.includes('mcp'), '来源标记');
  assert.ok(html.includes('转 WebP'), '管道摘要');
  assert.ok(html.includes('节省'), '节省口径');
  assert.ok(html.includes('4.8 MB'), '输入大小格式化');
});

check('HistoryTab：失败条目显错误', () => {
  const html = R.history(baseCtx({
    history: [{
      id: '2',
      at: '2026-11-01T09:00:00.000Z',
      source: 'panel',
      pipeline: '转 AVIF · 质量 50',
      total: 2,
      ok: 0,
      fail: 2,
      inBytes: 0,
      outBytes: 0,
      savedBytes: 0,
      outDir: 'C:\\x',
      ms: 30,
      okState: false,
      error: '目录不可读：C:\\x（ENOENT）',
    }],
  }));
  assert.ok(html.includes('失败'), '失败徽标');
  assert.ok(html.includes('ENOENT'), '错误信息');
});

check('SettingsTab：字段与边界如实说明', () => {
  const html = R.settings(baseCtx({ meta: { token: 't', port: 1, version: '0.1.0', bridge: 'ok' } }));
  assert.ok(html.includes('默认输出目录'), 'outDir');
  assert.ok(html.includes('并发数'), '并发');
  assert.ok(html.includes('单批上限'), 'maxBatch');
  assert.ok(html.includes('零外网请求'), '安全声明');
  assert.ok(html.includes('按首帧'), 'GIF 口径如实');
  assert.ok(html.includes('不做 OCR'), 'OCR 边界');
});

check('SettingsTab：服务离线提示', () => {
  const html = R.settings(baseCtx());
  assert.ok(html.includes('离线'), '离线态');
});

// ── 汇总 ────────────────────────────────────────────────────────────────────

fs.rmSync(outfile, { force: true });
console.log(`\nrender-verify: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
