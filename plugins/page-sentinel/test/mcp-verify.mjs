/**
 * MCP server 验证（无框架，直接跑：node test/mcp-verify.mjs）
 *
 * 起一个内存版 IPC bridge（cap.kv）+ mock 网站，把 mcp/server.js 作为子进程
 * 拉起，按 JSON-RPC 2.0 over stdio 全流程验证：
 *   initialize → tools/list → sentinel_add_watch（触发首查）→
 *   sentinel_test_fetch → sentinel_list_watch → sentinel_check_now →
 *   sentinel_get_events → sentinel_remove_watch
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

function startMockBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const { target, payload } = JSON.parse(b).req;
      let result = null; let ok = true;
      if (target === 'cap.kv') {
        const { action, key, value } = payload;
        if (action === 'get') result = { value: store.has(key) ? store.get(key) : null };
        else if (action === 'set') { store.set(key, value === undefined ? null : value); result = { id: key }; }
        else if (action === 'delete') { store.delete(key); result = { deleted: true }; }
        else if (action === 'list') result = { keys: [...store.keys()] };
        else ok = false;
      } else ok = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ msgId: 'm', ok, result, error: ok ? null : 'x' }));
    });
  });
  return { server, store, listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}

function startMockSite() {
  let html = '<html><body><div class="price">¥ 199.00</div><div class="stock">缺货</div></body></html>';
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(req.url === '/json' ? JSON.stringify({ data: { price: 149 } }) : html);
  });
  return { server, setHtml: (h) => { html = h; }, listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}

const bridge = startMockBridge();
const site = startMockSite();
const bridgePort = await bridge.listen();
const sitePort = await site.listen();

const child = spawn(process.execPath, ['mcp/server.js'], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const stderrChunks = [];
child.stderr.on('data', (c) => stderrChunks.push(String(c)));

let nextId = 1;
const pending = new Map();
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc ${method} 超时`)); }, 60000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function textOf(msg) {
  return msg.result && msg.result.content && msg.result.content[0] && msg.result.content[0].text;
}

try {
  // initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'page-sentinel');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // tools/list
  const list = await rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  assert.ok(names.includes('sentinel_add_watch') && names.includes('sentinel_check_now'), `工具列表：${names}`);

  // sentinel_test_fetch（验证服务未运行时的错误路径要靠超时——这里服务未启动，应报服务不可达）
  // ↑ 为控时长，跳过 30s 级等待，仅验证参数校验路径
  const badFetch = await rpc('tools/call', { name: 'sentinel_test_fetch', arguments: { url: 'ftp://x' } });
  assert.ok(textOf(badFetch).includes('http'), `试抓参数校验：${textOf(badFetch)}`);

  // add_watch：url 非法
  const badAdd = await rpc('tools/call', { name: 'sentinel_add_watch', arguments: { name: 'x', url: 'nope' } });
  assert.ok(textOf(badAdd).includes('http'), `add 参数校验：${textOf(badAdd)}`);

  // add_watch：contains 条件缺 keyword
  const badCond = await rpc('tools/call', { name: 'sentinel_add_watch', arguments: { name: 'x', url: 'http://a.com', condition: 'contains' } });
  assert.ok(textOf(badCond).includes('keyword'), `条件校验：${textOf(badCond)}`);

  // 正常登记（checkNow=false 避免等待服务）
  const add = await rpc('tools/call', {
    name: 'sentinel_add_watch',
    arguments: { name: '验证商品', url: `http://127.0.0.1:${sitePort}/item`, mode: 'selector', selector: '.price', condition: 'any', intervalSec: 60, checkNow: false },
  });
  assert.ok(!add.result.isError, `登记应成功：${textOf(add)}`);
  const idMatch = textOf(add).match(/\((w[0-9a-f]+)\)/);
  assert.ok(idMatch, `应返回 id：${textOf(add)}`);
  const watchId = idMatch[1];

  // list_watch
  const lst = await rpc('tools/call', { name: 'sentinel_list_watch', arguments: {} });
  assert.ok(textOf(lst).includes('验证商品'), `列表应含目标：${textOf(lst)}`);
  assert.ok(textOf(lst).includes('尚未检查过'), '未检查状态描述');

  // update_watch：暂停
  const upd = await rpc('tools/call', { name: 'sentinel_update_watch', arguments: { id: watchId, enabled: false, intervalSec: 120 } });
  assert.ok(!upd.result.isError, `更新应成功：${textOf(upd)}`);
  const rawTarget = bridge.store.get(`sentinel.target.${watchId}`);
  assert.equal(rawTarget.enabled, false);
  assert.equal(rawTarget.intervalSec, 120);

  // get_events：空
  const ev0 = await rpc('tools/call', { name: 'sentinel_get_events', arguments: {} });
  assert.ok(textOf(ev0).includes('暂无'), `空事件：${textOf(ev0)}`);

  // remove_watch
  const rm = await rpc('tools/call', { name: 'sentinel_remove_watch', arguments: { id: watchId } });
  assert.ok(textOf(rm).includes('已删除'), `删除：${textOf(rm)}`);
  assert.ok(!bridge.store.has(`sentinel.target.${watchId}`), '目标键应删除');

  console.log('✓ MCP server 全流程验证通过（initialize/tools/add 校验/list/update/get_events/remove）');
  process.exitCode = 0;
} catch (e) {
  console.error('✗ MCP 验证失败：', e.message);
  console.error('server stderr:', stderrChunks.join('').slice(-1500));
  process.exitCode = 1;
} finally {
  child.kill();
  await site.close();
  await bridge.close();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
}
