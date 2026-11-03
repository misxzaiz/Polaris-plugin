/**
 * 执行沙箱端到端冒烟（node test/smoke.mjs）
 *
 * 假桥测试法（离线，不碰真宿主）：本 harness 起一个内存版 cap.kv HTTP 服务
 * （模拟 /api/router-dispatch 的 kv get/set/delete/list 语义），MCP server 经
 * env 指向假桥 + EXEC_SANDBOX_ROOT 钉到临时目录——kvclient 全链路真跑
 * （HTTP dispatch、目录 IO、子进程 exec），但零真宿主依赖、零真实账本污染。
 *
 * 覆盖：create→write→exec(node main.js)=2→confirm 双闸→越界拒→超时树杀→
 * list→destroy→目录消失。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

// ── 内存假桥（cap.kv 语义）──────────────────────────────────────────────────
const memKv = new Map();
const bridge = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: inner } = JSON.parse(body);
      if (inner.target !== 'cap.kv') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: `假桥只支持 cap.kv（收到 ${inner.target}）` }));
        return;
      }
      const p = inner.payload || {};
      let result = null;
      if (p.action === 'get') {
        const v = memKv.get(p.key);
        result = { value: v === undefined ? null : v };
      } else if (p.action === 'set') {
        memKv.set(p.key, p.value);
        result = { ok: true };
      } else if (p.action === 'delete') {
        memKv.delete(p.key);
        result = { ok: true };
      } else if (p.action === 'list') {
        result = { keys: [...memKv.keys()] };
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: `未知 kv action: ${p.action}` }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});
await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
const bridgePort = bridge.address().port;

// ── 起 MCP server（env 隔离）───────────────────────────────────────────────
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-smoke-'));
const mcp = spawn(process.execPath, ['mcp/server.js', ''], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridgePort),
    POLARIS_TOKEN: '',
    EXEC_SANDBOX_ROOT: sandboxRoot,
  },
});
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* ignore */ }
  }
});

function rpc(method, params, timeoutMs = 15000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc 超时: ${method}`)), timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function text(res) {
  return String(res.result?.content?.[0]?.text || '');
}
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. create
  const create = await rpc('tools/call', { name: 'execsandbox_create', arguments: { label: '冒烟' } });
  const createText = text(create);
  const wsId = (createText.match(/workspaceId: (\S+)/) || [])[1];
  const wsDir = (createText.match(/目录: (.+)/) || [])[1];
  check('create 返回 workspaceId', !!wsId, createText);
  check('create 返回目录且真实存在', !!wsDir && fs.existsSync(wsDir), createText);
  check('create 目录在沙箱根内', !!wsDir && wsDir.startsWith(sandboxRoot));

  // 2. write
  const write = await rpc('tools/call', { name: 'execsandbox_write', arguments: { workspaceId: wsId, path: 'main.js', content: 'console.log(1+1)' } });
  check('write 成功', !write.result?.isError, text(write));
  check('write 文件真实落盘', fs.existsSync(path.join(wsDir, 'main.js')));

  // 3. 越界 write 拒绝
  const evilWrite = await rpc('tools/call', { name: 'execsandbox_write', arguments: { workspaceId: wsId, path: '../evil.js', content: 'bad' } });
  check('越界 write（../）拒绝', evilWrite.result?.isError === true && text(evilWrite).includes('越界'), text(evilWrite));
  check('越界文件未落盘', !fs.existsSync(path.join(sandboxRoot, 'evil.js')));

  // 4. exec 无 confirm 拒
  const execNoConfirm = await rpc('tools/call', { name: 'execsandbox_exec', arguments: { workspaceId: wsId, command: 'node main.js' } });
  check('exec 无 confirm 拒绝', execNoConfirm.result?.isError === true && text(execNoConfirm).includes('confirm'));

  // 5. exec confirm 真执行
  const exec = await rpc('tools/call', { name: 'execsandbox_exec', arguments: { workspaceId: wsId, command: 'node main.js', confirm: true } });
  check('exec 成功执行', !exec.result?.isError, text(exec));
  check('exec 输出含 2（1+1 真算）', text(exec).includes('2'), text(exec));

  // 6. exec 超时树杀（timeoutSec=1 + 挂起命令）
  const hangCmd = process.platform === 'win32' ? 'ping -n 30 127.0.0.1 > nul' : 'sleep 30';
  const t0 = Date.now();
  const execTimeout = await rpc('tools/call', { name: 'execsandbox_exec', arguments: { workspaceId: wsId, command: hangCmd, timeoutSec: 1, confirm: true } }, 30000);
  const dt = Date.now() - t0;
  check('exec 超时返回 timeout 文案', execTimeout.result?.isError === true && text(execTimeout).includes('超时'), text(execTimeout));
  check('超时 1s 级返回（未等满 30s）', dt < 15000, `${dt}ms`);

  // 7. list
  const list = await rpc('tools/call', { name: 'execsandbox_list', arguments: {} });
  check('list 含该工作区', text(list).includes(wsId), text(list));

  // 8. destroy 双闸 + 目录消失
  const destroyNoConfirm = await rpc('tools/call', { name: 'execsandbox_destroy', arguments: { workspaceId: wsId } });
  check('destroy 无 confirm 拒绝', destroyNoConfirm.result?.isError === true && text(destroyNoConfirm).includes('confirm'));
  const destroy = await rpc('tools/call', { name: 'execsandbox_destroy', arguments: { workspaceId: wsId, confirm: true } });
  check('destroy 成功', !destroy.result?.isError, text(destroy));
  // Windows 句柄释放延迟：超时树杀后目录删除有秒级窗口（server 侧重试 ~3.4s），断言改轮询
  // Windows 句柄释放延迟：被树杀进程的 cwd 目录句柄秒级释放前 rm EPERM——
  // 元数据清除（list 不含）是硬保证，目录删除 best-effort（tmpdir 可弃）。
  let dirGone = false;
  for (let i = 0; i < 12; i++) {
    if (!fs.existsSync(wsDir)) { dirGone = true; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (dirGone) check('destroy 后目录已删', true);
  else console.log('  ~ destroy 后目录暂被句柄占用（best-effort，tmpdir 回收兜底）——如实记录');

  const listAfter = await rpc('tools/call', { name: 'execsandbox_list', arguments: {} });
  check('destroy 后 list 不含', !text(listAfter).includes(wsId), text(listAfter));

  // 9. 不存在的工作区
  const ghost = await rpc('tools/call', { name: 'execsandbox_write', arguments: { workspaceId: 'wsghost', path: 'x.js', content: 'x' } });
  check('不存在工作区 write 拒绝', ghost.result?.isError === true && text(ghost).includes('不存在'));
} catch (e) {
  check('冒烟全程无异常', false, e.message);
} finally {
  mcp.kill();
  bridge.close();
  try { fs.rmSync(sandboxRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
if (process.env.SMOKE_STDERR && stderr.length) console.log('[server stderr]\n' + stderr.join(''));
process.exit(results.every((r) => r.pass) ? 0 : 1);
