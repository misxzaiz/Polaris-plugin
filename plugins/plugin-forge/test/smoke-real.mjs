/**
 * 真实环境冒烟（node test/smoke-real.mjs）
 *
 * 插件工坊零服务、零 kv 依赖（面板设置除外），核心风险面在 MCP 进程的
 * fs 读取与落盘守卫。本冒烟以宿主同款方式 spawn 真实 mcp/server.js
 * （传 {{appConfigDir}}），跑五工具全闭环：
 *   1. initialize → tools/list（5 工具）
 *   2. forge_overview 返回速览 + 16 主题目录
 *   3. forge_search 命中跨域主题
 *   4. forge_topic 读全文
 *   5. forge_lint 经 path 体检本插件真实 plugin.json（0 错误）
 *   6. forge_scaffold 无 confirm 拒绝落盘（守卫①）
 *   7. forge_scaffold confirm 落盘到临时目录 → 文件齐全 + 零 {{TOKEN}} 残留
 *   8. forge_scaffold 对非空目录拒绝（守卫②）
 *   9. 清理临时目录
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), path.join(appdata, 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
const mcpErr = [];
mcp.stderr.on('data', (c) => mcpErr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? '';
  return { text, isError: r.result?.isError === true };
};

let tmpDir = '';
try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. tools/list
  const lst = await rpc('tools/list', {});
  const names = (lst.result.tools || []).map((t) => t.name);
  record('MCP tools/list（5 工具）', names.length === 5 && ['forge_overview', 'forge_search', 'forge_topic', 'forge_lint', 'forge_scaffold'].every((n) => names.includes(n)), names.join(', '));

  // 2. overview
  const ov = await call('forge_overview', {});
  record('forge_overview：速览+主题目录', !ov.isError && /平台总览|三类进程/.test(ov.text) && (ov.text.match(/｜/g) || []).length >= 14, `${(ov.text.match(/｜/g) || []).length} 主题`);

  // 3. search
  const sr = await call('forge_search', { query: '跨域 Remote' });
  record('forge_search：命中跨域主题', !sr.isError && /cross-origin/.test(sr.text), sr.text.split('\n')[0]);

  // 4. topic
  const tp = await call('forge_topic', { id: 'workflow' });
  record('forge_topic：workflow 全文', !tp.isError && /forge_overview/.test(tp.text) && tp.text.length > 800, `${tp.text.length} 字`);
  const tpBad = await call('forge_topic', { id: 'nope' });
  record('forge_topic：未知 id 报业务错（isError）', tpBad.isError, tpBad.text.slice(0, 50));

  // 5. lint 本插件真实 plugin.json（path 通道）
  const lint = await call('forge_lint', { path: path.join(APP_ROOT, 'plugin.json') });
  record('forge_lint：本插件清单 0 错误', !lint.isError && /错误 0/.test(lint.text), lint.text.split('\n')[0]);
  const lintBad = await call('forge_lint', { json: '{"id":"Bad_ID"}' });
  record('forge_lint：坏清单报错误+修复建议', !lintBad.isError && /manifest\.id/.test(lintBad.text));

  // 6/7. scaffold 守卫 + 落盘
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-smoke-'));
  const pluginDir = path.join(tmpDir, 'smoke-plugin');
  const noConfirm = await call('forge_scaffold', { id: 'smoke-plugin', name: '冒烟插件', dir: pluginDir });
  record('scaffold 守卫①：无 confirm 拒绝落盘', noConfirm.isError && /confirm/.test(noConfirm.text));
  const okWrite = await call('forge_scaffold', { id: 'smoke-plugin', name: '冒烟插件', dir: pluginDir, confirm: true, withService: true, withMcp: true });
  const wrote = !okWrite.isError && /生成 \d+ 个文件/.test(okWrite.text);
  let filesOk = false;
  let noTokens = true;
  if (wrote) {
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } };
    walk(pluginDir);
    filesOk = files.length >= 12 && files.some((f) => f.endsWith('plugin.json')) && files.some((f) => f.includes('kvclient'));
    for (const f of files) {
      if (/\{\{[A-Z_]+\}\}/.test(fs.readFileSync(f, 'utf8'))) { noTokens = false; break; }
    }
  }
  record('scaffold confirm 落盘：文件齐全', wrote && filesOk, okWrite.text.split('\n')[0]);
  record('scaffold 落盘产物零 {{TOKEN}} 残留', noTokens);
  const reWrite = await call('forge_scaffold', { id: 'smoke-plugin', name: '冒烟插件', dir: pluginDir, confirm: true });
  record('scaffold 守卫②：非空目录拒绝覆盖', reWrite.isError && /非空/.test(reWrite.text));

  // 8. lint 落盘出来的 plugin.json（程序化清单全绿）
  const lintGen = await call('forge_lint', { path: path.join(pluginDir, 'plugin.json') });
  record('自洽：落盘的 plugin.json 过体检 0 错误', !lintGen.isError && /错误 0/.test(lintGen.text), lintGen.text.split('\n')[0]);
} catch (e) {
  record('流程', false, e.message);
  console.error('MCP stderr 尾部：', mcpErr.join('').slice(-800));
} finally {
  mcp.kill();
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('[smoke] 已清理临时目录');
  }
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
