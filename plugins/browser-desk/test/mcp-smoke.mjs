'use strict';
/**
 * mcp-smoke.mjs —— MCP 全链路冒烟（真实 service + 真实 MCP server 子进程）
 *
 * 前置：本机有 Chrome/Edge（BROWSER_DESK_CHROME 可指定）；node_modules 有 puppeteer-core
 *（若缺失会由 service 自动 npm install，首次较慢）。
 *
 * 流程：起 service(9879) → 起 MCP(BROWSER_DESK_SERVICE_PORT=9879)
 *   → desk_acquire(bing) → desk_search → desk_read → desk_status → desk_close(all)
 * 全部通过输出 ALL-PASS，退出码 0。
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 9879;

const svc = spawn('node', ['service/main.js', String(PORT), ''], { cwd: PLUGIN_DIR, stdio: ['ignore', 'ignore', 'pipe'] });
svc.stderr.on('data', () => {});
const mcp = spawn('node', ['mcp/server.js', '', '', ''], {
  cwd: PLUGIN_DIR, stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER_DESK_SERVICE_PORT: String(PORT) },
});
let buf = '';
mcp.stdout.on('data', (c) => { buf += c; });
mcp.stderr.on('data', () => {});

function send(id, name, args) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args || {} } }) + '\n');
}

const plan = [
  [1, 'desk_acquire', { url: 'https://www.bing.com', agentKey: 'smoke' }, 500],
  [2, 'desk_search', { query: 'tauri framework', limit: 3 }, 4500],
  [3, 'desk_read', { agentKey: 'smoke' }, 9500],
  [4, 'desk_status', {}, 11500],
  [5, 'desk_close', { close: 'all' }, 13000],
];
for (const [id, name, args, at] of plan) setTimeout(() => send(id, name, args), at);

const names = Object.fromEntries(plan.map(([id, name]) => [id, name]));
setTimeout(() => {
  const lines = buf.trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  let pass = 0;
  for (const [id] of plan) {
    const r = lines.find((l) => l.id === id);
    const t = r && r.result && r.result.content && r.result.content[0] ? r.result.content[0].text : 'NO RESP';
    const ok = !String(t).includes('执行失败') && t !== 'NO RESP';
    if (ok) pass += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${names[id]}: ${String(t).slice(0, 150)}`);
  }
  mcp.kill(); svc.kill();
  console.log(pass === plan.length ? 'ALL-PASS' : 'SOME-FAIL');
  setTimeout(() => process.exit(pass === plan.length ? 0 : 1), 800);
}, 16000);
