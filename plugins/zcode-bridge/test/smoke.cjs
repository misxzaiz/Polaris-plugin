#!/usr/bin/env node
// zcode-bridge 冒烟测试：以 MCP JSON-RPC 2.0 over stdio 驱动 server.js，
// 验证 initialize / tools/list / zcode_list_sessions / zcode_create_session / zcode_send_message。
// 注意：create+send 会触发真实模型轮（落盘），耗时数秒~数十秒，属预期。
'use strict';

const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'mcp', 'server.js');
const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
const rl = readline.createInterface({ input: child.stdout });

let nextId = 1;
const pending = new Map();
function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, 120000);
    pending.set(id, (m) => { clearTimeout(t); resolve(m); });
    process.stdout.write(`>>> ${method}\n`);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const cb = pending.get(msg.id); if (cb) { pending.delete(msg.id); cb(msg); }
});
child.stderr.on('data', (d) => process.stderr.write('[server:err] ' + d.toString().trimEnd() + '\n'));
child.on('exit', (c, s) => console.log('=== server exit', c, s, '==='));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const results = [];
  const step = (name, ok, extra) => { results.push({ name, ok, extra }); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

  try {
    const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.1' } });
    step('initialize', init.result && init.result.serverInfo && init.result.serverInfo.name === 'zcode-bridge-mcp', `serverInfo=${JSON.stringify(init.result && init.result.serverInfo)}`);

    // 通知帧无响应（服务器静默）——直接走 next
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const list = await call('tools/list', {});
    const names = (list.result && list.result.tools || []).map((t) => t.name);
    step('tools/list', ['zcode_list_sessions', 'zcode_create_session', 'zcode_send_message'].every((n) => names.includes(n)), `tools=${names.join(',')}`);

    const sess = await call('tools/call', { name: 'zcode_list_sessions', arguments: { limit: 5 } });
    const sessText = sess.result && sess.result.content && sess.result.content[0] && sess.result.content[0].text || '';
    step('zcode_list_sessions', sessText.length > 0 && !sess.result.isError, sessText.split('\n')[0]);

    const create = await call('tools/call', { name: 'zcode_create_session', arguments: {} });
    const createText = create.result && create.result.content && create.result.content[0] && create.result.content[0].text || '';
    const sidMatch = createText.match(/sess[_\w-]+/);
    step('zcode_create_session', sidMatch != null && !create.result.isError, createText.split('\n')[0]);
    const sessionId = sidMatch ? sidMatch[0] : null;

    if (sessionId) {
      const send = await call('tools/call', { name: 'zcode_send_message', arguments: { sessionId, content: '你好，请只回复两个字：收到' } });
      const sendText = send.result && send.result.content && send.result.content[0] && send.result.content[0].text || '';
      step('zcode_send_message', !send.result.isError, sendText.split('\n')[0] || sendText.slice(0, 120));

      // 落盘验证：等一下再 list，应能看到该会话
      console.log('  [等待模型轮落盘 db.sqlite...]');
      await sleep(15000);
      const after = await call('tools/call', { name: 'zcode_list_sessions', arguments: { limit: 5 } });
      const afterText = after.result && after.result.content && after.result.content[0] && after.result.content[0].text || '';
      const persisted = afterText.includes(sessionId);
      step('落盘验证 (db.sqlite 含新会话)', persisted, afterText.split('\n').slice(0, 3).join(' | '));
    }
  } catch (e) {
    step('异常', false, String(e && e.message || e));
  }

  child.stdin.end();
  await sleep(300);
  child.kill();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
  process.exit(failed ? 1 : 0);
})();