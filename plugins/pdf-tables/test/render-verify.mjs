/**
 * 表格提取台面板渲染断言（node test/render-verify.mjs）
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
const { __pdfTablesRender } = globalThis;

const META = { token: 'smoke-token', port: 34567, version: '0.1.0', bridge: 'ok', lastTickAt: '2026-11-02T01:02:03Z' };
const SETTINGS = { outDir: 'C:\\Users\\demo\\Desktop', maxUploadMB: 128, historyCap: 200, format: 'xlsx', mergePages: true };
const HISTORY = [
  { id: '1', at: '2026-11-02T01:02:03Z', op: 'extract', source: 'mcp', inputs: ['流水.pdf'], outputs: [{ name: '流水-表格.xlsx', path: 'C:\\out\\流水-表格.xlsx', size: 7148 }], tables: 1, rows: 13, ms: 820, ok: true },
  { id: '2', at: '2026-11-01T09:00:00Z', op: 'detect', source: 'panel', inputs: ['scan.pdf'], outputs: [], tables: 0, rows: 0, ms: 90, ok: false, error: 'scan.pdf 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）' },
  { id: '3', at: '2026-10-31T09:00:00Z', op: 'read', source: 'panel', inputs: ['report.pdf'], outputs: [], tables: 2, rows: 40, ms: 80, ok: true },
];

const html = __pdfTablesRender({ meta: META, settings: SETTINGS, history: HISTORY });
let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✔', name);
  else { failed++; console.log('  ✖', name); }
}

console.log('pdf-tables render-verify（SSR）');
check('外壳：标题「表格提取台」', html.panel.includes('表格提取台'));
check('外壳：副标题「PDF 表格 → Excel/CSV」', html.panel.includes('Excel/CSV'));
check('外壳：三 Tab（工作台/历史/设置）', ['工作台', '历史', '设置'].every((t) => html.panel.includes(t)));
check('外壳：SSR 初始渲染为离线副标题（数据由 effect 加载）', html.panel.includes('服务未在线') && html.panel.includes('设置 → 插件服务'));
check('工作台：拖拽区文案', html.work.includes('拖拽 PDF 到这里'));
check('工作台：输出目录提示（设置值生效）', html.work.includes(SETTINGS.outDir));
check('工作台：上限提示 128 MB', html.work.includes('128 MB'));
check('工作台：扫描件/加密不支持声明', html.work.includes('扫描件/加密 PDF 不支持'));
check('工作台：无文件时不出提取按钮态（格式芯片不出现）', !html.work.includes('跨页续表合并'));
check('历史：提取条目 + AI 来源徽标', html.history.includes('提取落盘') && html.history.includes('AI'));
check('历史：1 张表 / 13 行 口径', html.history.includes('1 张表 / 13 行'));
check('历史：失败条目展示原因（OCR 口径）', html.history.includes('需要 OCR（本工具不做 OCR）'));
check('历史：输出路径与大小', html.history.includes('流水-表格.xlsx') && html.history.includes('7.0 KB'));
check('历史：清空按钮存在', html.history.includes('清空历史'));
check('设置：输出目录输入框回显', html.settings.includes('C:\\Users\\demo\\Desktop'));
check('设置：默认格式芯片 xlsx 选中', html.settings.includes('Excel') && html.settings.includes('CSV') && html.settings.includes('JSON'));
check('设置：跨页合并默认开关', html.settings.includes('默认开启跨页续表合并'));
check('设置：安全底线声明（零外网/永不修改/永不覆盖）', html.settings.includes('零外网请求') && html.settings.includes('输入永不修改') && html.settings.includes('输出永不覆盖'));
check('设置：能力边界声明（OCR/破解）', html.settings.includes('不做 OCR') && html.settings.includes('不破解'));
check('设置：服务状态在线卡片（端口）', html.settings.includes('34567'));

// 离线态
const off = __pdfTablesRender({ meta: null, settings: SETTINGS, history: [] });
check('离线：工作台显示服务未在线提示', off.work.includes('服务未在线'));
check('离线：外壳副标题提示启动路径', off.panel.includes('服务未在线'));
check('离线：历史空态引导（AI 工具提示）', off.history.includes('还没有任务记录') && off.history.includes('pdf_tables_'));
check('离线：设置未在线说明', off.settings.includes('离线'));

try { fs.rmSync(outfile, { force: true }); } catch (_) { /* 清理失败不影响结果 */ }

if (failed) {
  console.log(`\nrender-verify: ${failed} 项失败`);
  process.exit(1);
}
console.log('\nrender-verify: 全部通过');
