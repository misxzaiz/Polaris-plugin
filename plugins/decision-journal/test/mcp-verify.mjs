/**
 * 谋定 MCP 验证（node test/mcp-verify.mjs）
 * 内存 IPC bridge（cap.kv）+ 子进程 mcp/server.js，走 JSON-RPC stdio 全流程：
 * 握手 → 工具清单（9 个）→ decided 创建（缺预期被方法论拦截）→ open 创建 →
 * settle 定案 → list 过滤 → update 期限 → due 到期 → resolve 复盘 → stats 校准
 * → delete（confirm 守卫）。
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

const bridge = startMockBridge();
const bridgePort = await bridge.listen();

const here = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const child = spawn(process.execPath, ['mcp/server.js'], {
  cwd: here,
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
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 20000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
const textOf = (m) => m.content[0].text;

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  // 1. 握手
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'decision-journal');
  record('MCP 握手 initialize', true);

  // 2. 工具清单
  const list = await rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names, [
    'decision_create', 'decision_settle', 'decision_resolve', 'decision_list', 'decision_get',
    'decision_update', 'decision_shelve', 'decision_stats', 'decision_delete',
  ]);
  record('tools/list 共 9 工具', true, names.join(','));

  // 3. decided 创建：缺预期被方法论拦截
  const blocked = await call('decision_create', { title: '没有预期的决定', options: ['A'], chosen: 'A' });
  assert.equal(blocked.isError, true);
  assert.ok(textOf(blocked).includes('可检验的预期'));
  record('decision_create 缺预期被拦截（方法论接口化）', true);

  // 4. decided 创建：完整入参
  const created = await call('decision_create', {
    title: '迁移 RouterBus', context: '高频命令上总线', options: [{ name: '方案A' }, { name: '方案B', note: '成本低' }],
    chosen: '方案B', rationale: '成本低', expectedText: '3 个月内完成迁移且零数据丢失', confidence: 80,
    reviewInDays: 90, tags: ['架构'],
  });
  assert.equal(created.isError, false);
  const id1 = (textOf(created).match(/id=(d[a-z0-9]+)/) || [])[1];
  assert.ok(id1, '返回含 id');
  assert.ok(textOf(created).includes('已立此存照'));
  assert.ok(bridge.store.has(`decision.d.${id1}`));
  const stored1 = bridge.store.get(`decision.d.${id1}`);
  assert.equal(stored1.status, 'decided');
  assert.equal(stored1.expected.confidence, 80);
  record('decision_create decided 全链路', true, id1);

  // 5. open 创建（纠结中）
  const openRes = await call('decision_create', { title: '要不要换工作', question: 'A 公司还是 B 公司', options: ['A 公司', 'B 公司'] });
  const idOpen = (textOf(openRes).match(/id=(d[a-z0-9]+)/) || [])[1];
  assert.equal(bridge.store.get(`decision.d.${idOpen}`).status, 'open');
  record('decision_create open（纠结中）', true, idOpen);

  // 6. settle 定案
  const settled = await call('decision_settle', {
    id: idOpen, chosen: 'B 公司', expectedText: '半年内适应新团队并交付首个项目', confidence: 65, reviewInDays: 180,
  });
  assert.equal(settled.isError, false);
  const storedOpen = bridge.store.get(`decision.d.${idOpen}`);
  assert.equal(storedOpen.status, 'decided');
  assert.equal(storedOpen.reviewInDays, undefined);
  record('decision_settle 定案', true);

  // 7. list 过滤
  const lsOpen = await call('decision_list', { status: 'open' });
  assert.ok(textOf(lsOpen).includes('没有符合条件的决策'));
  const lsAll = await call('decision_list', { status: 'all', tag: '架构' });
  assert.ok(textOf(lsAll).includes('迁移 RouterBus'));
  record('decision_list 过滤', true);

  // 8. update 把期限改成过去 → due
  const yesterday = Date.now() - 24 * 3600 * 1000;
  const up = await call('decision_update', { id: id1, reviewAt: yesterday });
  assert.equal(up.isError, false);
  const lsDue = await call('decision_list', { status: 'due' });
  assert.ok(textOf(lsDue).includes('迁移 RouterBus'));
  assert.ok(textOf(lsDue).includes('⚠️'));
  record('decision_update 期限 + due 到期判定', true);

  // 9. resolve 复盘
  const resolved = await call('decision_resolve', {
    id: id1, outcome: 'partial', note: '完成但有一次数据迁移告警', surprise: '备份盘比预期慢', lesson: '迁移前先演练恢复',
  });
  assert.equal(resolved.isError, false);
  const storedRes = bridge.store.get(`decision.d.${id1}`);
  assert.equal(storedRes.status, 'resolved');
  assert.equal(storedRes.resolution.score, 0.5);
  record('decision_resolve 复盘打分', true);

  // 10. stats 校准
  const stats = await call('decision_stats', {});
  const st = textOf(stats);
  assert.ok(st.includes('校准（可计分样本 1'));
  assert.ok(st.includes('Brier'));
  assert.ok(st.includes('迁移前先演练恢复'));
  record('decision_stats 校准报告+教训', true);

  // 11. delete 守卫
  const noConfirm = await call('decision_delete', { id: idOpen });
  assert.equal(noConfirm.isError, true);
  const del = await call('decision_delete', { id: idOpen, confirm: true });
  assert.equal(del.isError, false);
  assert.equal(bridge.store.has(`decision.d.${idOpen}`), false);
  record('decision_delete confirm 守卫', true);

  // 12. get 全文
  const got = await call('decision_get', { id: id1 });
  assert.ok(textOf(got).includes('3 个月内完成迁移'));
  assert.ok(textOf(got).includes('部分兑现'));
  record('decision_get 全文', true);
} catch (e) {
  record('流程中断', false, e.message);
  console.error(stderrChunks.join(''));
} finally {
  child.kill();
  await bridge.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n[mcp-verify] ${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
