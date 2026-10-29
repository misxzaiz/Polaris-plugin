/**
 * 心图 MCP 验证（node test/mcp-verify.mjs）
 * 内存 IPC bridge（cap.kv Map store）+ 子进程 mcp/server.js，走 JSON-RPC stdio 全流程：
 * 工具清单 → create → edit 批量落板（同批建点连边）→ read 对账 → 非法 op 整批拒 →
 * relayout → export → 超限/超长拒绝 → delete confirm 双向 → 删除后不可读。
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
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`rpc ${method} 超时`)); }, 60000);
    pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const textOf = (m) => m.result.content[0].text;

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'v', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'xintu');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. 工具清单：恰好 6 个
  const tl = await rpc('tools/list', {});
  const names = tl.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['xintu_create', 'xintu_delete', 'xintu_edit', 'xintu_export', 'xintu_list', 'xintu_read'], `工具清单：${names}`);

  // 2. 空列表提示
  const l0 = await rpc('tools/call', { name: 'xintu_list', arguments: {} });
  assert.ok(textOf(l0).includes('暂无画布'), `空列表：${textOf(l0)}`);

  // 3. create（默认标题）
  const c1 = await rpc('tools/call', { name: 'xintu_create', arguments: {} });
  assert.ok(!c1.result.isError, `create：${textOf(c1)}`);
  const boardId = (textOf(c1).match(/id=([A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(boardId, `提取板 id：${textOf(c1)}`);

  // 4. edit：一批落 10 节点 + 8 边（星型 + 链式），同批 add 即可连边
  const nodeIds = ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const ops = [
    ...nodeIds.map((id, i) => ({ op: 'add_card', args: { id, x: 200 + i * 240, y: i % 2 ? 320 : 0, title: `节点${id}`, text: `${id} 的说明`, color: i === 0 ? 'blue' : 'default' } })),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ op: 'add_edge', args: { from: 'hub', to: id, label: `hub→${id}` } })),
  ];
  const e1 = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops } });
  assert.ok(!e1.result.isError, `edit 18 ops：${textOf(e1)}`);
  assert.ok(textOf(e1).includes('已应用 18 个 op'), `edit 计数：${textOf(e1)}`);
  assert.ok(textOf(e1).includes('rev → 2'), `rev 递增：${textOf(e1)}`);

  // 5. read 对账：逐字段
  const r1 = await rpc('tools/call', { name: 'xintu_read', arguments: { id: boardId } });
  const doc = JSON.parse(textOf(r1));
  assert.equal(doc.nodes.length, 10);
  assert.equal(doc.edges.length, 8);
  assert.equal(doc.rev, 2);
  const hub = doc.nodes.find((n) => n.id === 'hub');
  assert.equal(hub.color, 'blue');
  assert.equal(hub.x % 40, 0, '坐标吸附 40px 网格');
  assert.equal(doc.edges.every((e) => e.from === 'hub'), true);

  // 6. kv 直查：板键与索引条目都落了（面板同源可读）
  assert.ok(bridge.store.has(`xt.board.${boardId}`), '板键已落 kv');
  const indexEntry = bridge.store.get('xt.boards').find((e) => e.id === boardId);
  assert.equal(indexEntry.nodeCount, 10, '索引 nodeCount 已同步');

  // 7. 非法 op 整批拒绝：第 2 个 op 端点不存在，rev 不动
  const bad = await rpc('tools/call', {
    name: 'xintu_edit',
    arguments: { id: boardId, ops: [{ op: 'add_note', args: { id: 'ok1', x: 0, y: 0 } }, { op: 'add_edge', args: { from: 'ok1', to: 'ghost' } }] },
  });
  assert.ok(bad.result.isError, '非法 op 应 isError');
  assert.ok(textOf(bad).includes('ghost') && textOf(bad).includes('整批'), `拒绝文案：${textOf(bad)}`);
  const r2 = JSON.parse(textOf(await rpc('tools/call', { name: 'xintu_read', arguments: { id: boardId } })));
  assert.equal(r2.rev, 2, '整批拒绝后 rev 不变');
  assert.equal(r2.nodes.length, 10, '整批拒绝后节点数不变');

  // 8. relayout LR：hub 在左列、子节点同列纵向排
  const rl = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops: [{ op: 'relayout', args: { direction: 'LR' } }] } });
  assert.ok(!rl.result.isError, `relayout：${textOf(rl)}`);
  const r3 = JSON.parse(textOf(await rpc('tools/call', { name: 'xintu_read', arguments: { id: boardId } })));
  const byId = new Map(r3.nodes.map((n) => [n.id, n]));
  assert.ok(byId.get('hub').x < byId.get('a').x, 'hub 在子节点左侧');
  assert.equal(byId.get('a').x, byId.get('b').x, '同层同列');

  // 9. export：大纲含标题与关联行
  const ex = await rpc('tools/call', { name: 'xintu_export', arguments: { id: boardId } });
  assert.ok(!ex.result.isError, `export：${textOf(ex)}`);
  assert.ok(textOf(ex).includes('# 未命名画布'), `导出标题：${textOf(ex).split('\n')[0]}`);
  assert.ok(/→ 节点a（hub→a）/.test(textOf(ex)), `关联行：${textOf(ex).split('\n').find((l) => l.includes('→'))}`);
  const exBad = await rpc('tools/call', { name: 'xintu_export', arguments: { id: boardId, format: 'png' } });
  assert.ok(exBad.result.isError, '未知 format 拒绝');

  // 10. 容量/长度防线：单批 201 op 超限；set_title 超长
  const many = Array.from({ length: 201 }, () => ({ op: 'set_title', args: { title: 't' } }));
  const many1 = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops: many } });
  assert.ok(many1.result.isError && textOf(many1).includes('超限'), `op 数超限：${textOf(many1)}`);
  const longT = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops: [{ op: 'set_title', args: { title: '长'.repeat(121) } }] } });
  assert.ok(longT.result.isError && textOf(longT).includes('超长'), `标题超长：${textOf(longT)}`);

  // 11. list 看得到板
  const l1 = await rpc('tools/call', { name: 'xintu_list', arguments: {} });
  assert.ok(textOf(l1).includes(boardId) && textOf(l1).includes('节点 10'), `list：${textOf(l1).split('\n')[1]}`);

  // 12. delete：无 confirm 拒绝、带 confirm 成功
  const d0 = await rpc('tools/call', { name: 'xintu_delete', arguments: { id: boardId } });
  assert.ok(d0.result.isError && textOf(d0).includes('confirm'), `无 confirm：${textOf(d0)}`);
  const d1 = await rpc('tools/call', { name: 'xintu_delete', arguments: { id: boardId, confirm: boardId } });
  assert.ok(!d1.result.isError, `带 confirm：${textOf(d1)}`);
  assert.equal(bridge.store.has(`xt.board.${boardId}`), false, '板键已删');
  assert.equal(bridge.store.get('xt.boards').some((e) => e.id === boardId), false, '索引条目已清');

  // 13. 删除后 read 报不存在
  const r4 = await rpc('tools/call', { name: 'xintu_read', arguments: { id: boardId } });
  assert.ok(r4.result.isError && textOf(r4).includes('不存在'), `删除后 read：${textOf(r4)}`);

  console.log('✓ 心图 MCP 全流程验证通过（6 工具/批量原子/对账/relayout/export/防线/confirm 删除）');
  process.exitCode = 0;
} catch (e) {
  console.error('✗ 验证失败：', e.message);
  console.error('stderr:', stderrChunks.join('').slice(-1200));
  process.exitCode = 1;
} finally {
  child.kill();
  await bridge.close();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
}
