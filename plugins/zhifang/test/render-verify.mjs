/**
 * 纸坊面板渲染断言（node test/render-verify.mjs）
 * esbuild 打包 render-entry.tsx → Node SSR（react-dom/server，宿主 invoke 用内存 kv mock）
 * 断言三 Tab 关键 UI 与状态文案，不依赖浏览器。
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
const { __zhifangRender } = globalThis;

const META = { token: 'smoke-token', port: 34567, version: '0.1.0', bridge: 'ok', lastTickAt: '2026-10-29T01:02:03Z' };
const SETTINGS = { outDir: 'C:\\Users\\demo\\Desktop', maxUploadMB: 128, historyCap: 200 };
const HISTORY = [
  { id: '1', at: '2026-10-29T01:02:03Z', op: 'merge', source: 'mcp', inputs: ['合同A.pdf', '合同B.pdf'], outputs: [{ name: '合同A-合并.pdf', path: 'C:\\out\\合同A-合并.pdf', size: 847 }], pages: 4, ms: 120, ok: true },
  { id: '2', at: '2026-10-28T09:00:00Z', op: 'text', source: 'panel', inputs: ['scan.pdf'], outputs: [], pages: 3, ms: 90, ok: false, error: 'scan.pdf 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）' },
  { id: '3', at: '2026-10-27T09:00:00Z', op: 'extract', source: 'panel', inputs: ['book.pdf'], outputs: [{ name: 'book-p1-3.pdf', path: 'C:\\out\\book-p1-3.pdf', size: 1200 }], pages: 3, ms: 80, ok: true },
];

const html = __zhifangRender({ meta: META, settings: SETTINGS, history: HISTORY });
let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✔', name);
  else { failed++; console.log('  ✖', name); }
}

console.log('zhifang render-verify（SSR）');
check('外壳：标题「纸坊 · 本地 PDF 工坊」', html.panel.includes('纸坊 · 本地 PDF 工坊'));
check('外壳：三 Tab（工作台/历史/设置）', ['工作台', '历史', '设置'].every((t) => html.panel.includes(t)));
check('外壳：SSR 初始渲染为离线副标题（数据由 effect 加载）', html.panel.includes('服务未在线') && html.panel.includes('设置 → 插件服务'));
check('工作台：拖拽区文案', html.work.includes('拖拽 PDF / JPG / PNG'));
check('工作台：输出目录提示（设置值生效）', html.work.includes(SETTINGS.outDir));
check('工作台：上限提示 128 MB', html.work.includes('128 MB'));
check('工作台：无文件时不出操作芯片', !html.work.includes('zf-chip on'));
check('历史：合并条目 + AI 来源徽标', html.history.includes('合并') && html.history.includes('AI'));
check('历史：失败条目展示原因（OCR 口径）', html.history.includes('需要 OCR（本工具不做 OCR）'));
check('历史：输出路径与大小', html.history.includes('合同A-合并.pdf') && html.history.includes('847 B'));
check('历史：清空按钮 + 不删文件提示', html.history.includes('清空历史') && html.history.includes('只删记录不删文件'));
check('设置：输出目录输入框回显', html.settings.includes('C:\\Users\\demo\\Desktop'));
check('设置：安全面声明（永不覆盖/不破解）', html.settings.includes('输出永不覆盖') && html.settings.includes('不破解'));
check('设置：明确不做声明（压缩/OCR/密码去除）', html.settings.includes('明确不做：压缩') && html.settings.includes('OCR'));
check('设置：服务状态在线卡片（端口/心跳）', html.settings.includes('34567') && html.settings.includes('心跳'));

// 离线态
const off = __zhifangRender({ meta: null, settings: SETTINGS, history: [] });
check('离线：工作台显示服务未在线提示', off.work.includes('服务未在线'));
check('离线：外壳副标题提示启动路径', off.panel.includes('服务未在线'));
check('离线：历史空态引导', off.history.includes('还没有任务记录'));
check('离线：设置未在线说明', off.settings.includes('未在线'));

try { fs.rmSync(outfile, { force: true }); } catch (_) { /* 清理失败不影响结果 */ }

if (failed) {
  console.log(`\nrender-verify: ${failed} 项失败`);
  process.exit(1);
}
console.log('\nrender-verify: 全部通过');
