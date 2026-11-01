/**
 * render-harness.mjs —— 面板无头渲染 harness（jsdom）
 *
 * 目的：抓白屏 / Invalid hook call / Tab 切换崩溃（chexia 先例）。
 * 做法：esbuild 把 src/index.tsx 连同 React 一起打进 ESM bundle（不走宿主 shim），
 * jsdom 里 mock 宿主桥与 fetch，ReactDOM 渲染后断言关键 DOM。
 *
 * 运行：node test/render-harness.mjs（需 devDependencies：esbuild react react-dom jsdom）
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, '..');

// 1) 打 harness bundle（react 保持 external——bundle 与渲染端必须共用同一 React 副本，
//    否则双副本 Invalid hook call / useState of null，正是宿主 loader 的同款铁律）
const bundlePath = path.join(__dirname, 'panel.harness-bundle.js');
execFileSync(process.execPath, [
  path.join(PLUGIN_ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  path.join(PLUGIN_ROOT, 'src', 'index.tsx'),
  '--bundle', '--format=esm', '--jsx=automatic',
  '--external:react', '--external:react/jsx-runtime',
  `--outfile=${bundlePath}`,
], { stdio: 'pipe' });

// 2) jsdom 环境先行（bundle 加载前就位）
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:9827/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
// Node ≥21 的 global.navigator 只有 getter，用 defineProperty 覆盖
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.CustomEvent = dom.window.CustomEvent;
global.MouseEvent = dom.window.MouseEvent;
global.confirm = () => true;

// 3) mock 宿主桥：probe.meta 指向假端口
const META = { port: 59999, token: 'harness-token', pid: 1, version: '0.1.0', startedAt: new Date().toISOString() };
dom.window.__POLARIS_HOST_INVOKE__ = async (cmd, args) => {
  if (cmd === 'router_dispatch') {
    const req = args && args.req ? args.req : {};
    if (req.target === 'cap.kv' && req.payload && req.payload.action === 'get' && req.payload.key === 'probe.meta') {
      return { ok: true, result: { value: META } };
    }
    if (req.target === 'cap.pluginServiceManager') return { ok: true, result: {} };
  }
  return { ok: false, error: `harness 未模拟 ${cmd}` };
};
dom.window.__POLARIS_HOST_WORKSPACE__ = { path: '' };
dom.window.addEventListener = dom.window.addEventListener.bind(dom.window);

// 4) mock 服务 fetch（面板对 127.0.0.1:59999 的全部请求）
const stateResp = {
  ok: true, version: '0.1.0', startedAt: META.startedAt, degraded: false,
  settings: { initTimeoutMs: 15000, callTimeoutMs: 30000 },
  profiles: [{
    id: 'srv-x', name: '样例档案', transport: 'stdio', command: 'node', args: ['srv.js'],
    env: {}, url: '', headers: {}, timeoutMs: 30000, origin: 'manual', sourceScope: '',
    sourcePath: '', legacy: false, note: '', createdAt: META.startedAt, updatedAt: META.startedAt,
  }],
  pool: [{
    serverId: 'srv-x', status: 'ready', serverInfo: { name: 'demo' }, protocolVersion: '2025-06-18',
    toolCount: 2, connectedAt: Date.now(), lastUsedAt: Date.now(), poisoned: false, lastError: '',
  }],
  counts: { history: 1, snapshots: 0, reports: 0 },
};
const hostToolsResp = {
  ok: true,
  servers: [{
    pluginId: 'demo-plugin', server: 'demo-server', injected: 'injected', toolGates: null,
    tools: [{ name: 'demo_tool', description: '演示工具。适用：渲染 harness。', inputSchema: { type: 'object', properties: {} } }],
  }],
};
global.fetch = async (url) => {
  const u = String(url);
  const json = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
  if (u.includes('/api/state')) return json(stateResp);
  if (u.includes('/api/host/tools')) return json(hostToolsResp);
  if (u.includes('/api/reports')) return json({ ok: true, reports: [] });
  if (u.includes('/api/snapshots')) return json({ ok: true, snapshots: [] });
  if (u.includes('/api/history')) return json({ ok: true, calls: [], total: 0 });
  if (u.includes('/api/connect')) {
    return json({ ok: true, source: 'host', serverId: 'host:demo-server', tools: hostToolsResp.servers[0].tools, toolGates: null, injected: 'injected' });
  }
  return json({ ok: true });
};

// 5) 加载并挂载
const React = require('react');
const ReactDOMClient = require(path.join(PLUGIN_ROOT, 'node_modules', 'react-dom', 'client.js'));
const mod = await import(`file:///${bundlePath.replace(/\\/g, '/')}`);
assert.ok(typeof mod.default === 'function', '面板默认导出必须是组件');
const root = ReactDOMClient.createRoot(document.getElementById('root'));
root.render(React.createElement(mod.default));

// 6) 断言
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
const fail = [];
function t(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); } else { fail.push(`${name}${detail ? `: ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

let sawService = false;
for (let i = 0; i < 30 && !sawService; i++) {
  await sleep(200);
  sawService = !!document.querySelector('.mp-root') && document.body.textContent.includes('服务 v0.1.0');
}
t('面板挂载无白屏（.mp-root 存在）', !!document.querySelector('.mp-root'));
t('自举完成：头部显示服务版本', sawService, document.body.textContent.slice(0, 200));
t('宿主插件区块渲染', document.body.textContent.includes('demo-server'));
t('外部档案区块渲染', document.body.textContent.includes('样例档案'));

// 7) Tab 轮巡切换不崩
const tabButtons = Array.from(document.querySelectorAll('.mp-tab'));
t('四个 Tab 存在', tabButtons.length === 4, String(tabButtons.length));
for (const btn of tabButtons) {
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  t(`Tab「${btn.textContent}」切换后仍渲染`, !!document.querySelector('.mp-root'), document.body.textContent.slice(0, 150));
}

// 8) 调试 Tab：源选择器存在（connect→调用链路由 mcp-bridge 全链路覆盖）
t('调试 Tab 服务器选择器存在', !!document.querySelector('select.mp-inp'));

console.log(`\njsdom 渲染 harness: ${pass} 通过, ${fail.length} 失败`);
if (fail.length) {
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
