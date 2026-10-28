/**
 * 观止 MCP 验证（node test/mcp-verify.mjs，离线）
 * 内存 IPC bridge（cap.kv）+ 子进程 mcp/server.js，走 JSON-RPC stdio 全流程：
 * 校验拒绝 → 记账（done/wish/active 状态机）→ 判重更新 → 检索 → 问账（含年报）
 * → 推荐（先收尾+心愿轮换+口味）→ 更新/清评分 → 删除确认门 → 批量导入 → 未知工具。
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
const extractId = (text) => (text.match(/\[(gw_[0-9a-z]+)\]/) || [])[1] || null;

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'v', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'guanzhi');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // tools/list：7 个工具
  const tl = await rpc('tools/list', {});
  const names = tl.result.tools.map((t) => t.name);
  assert.equal(names.length, 7, `工具数：${names.join(',')}`);
  for (const n of ['guanzhi_log', 'guanzhi_search', 'guanzhi_stats', 'guanzhi_recommend', 'guanzhi_update', 'guanzhi_delete', 'guanzhi_import']) {
    assert.ok(names.includes(n), `缺工具 ${n}`);
  }

  // 参数校验
  const bad1 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: 'X' } });
  assert.ok(textOf(bad1).includes('kind'), `缺 kind：${textOf(bad1)}`);
  const bad2 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: 'X', kind: 'movie', rating: 11 } });
  assert.ok(textOf(bad2).includes('rating'), `评分越界：${textOf(bad2)}`);
  const bad3 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: 'X', kind: 'drama' } });
  assert.ok(textOf(bad3).includes('kind'), `体裁非法：${textOf(bad3)}`);
  const bad4 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: 'X', kind: 'movie', finishDate: '2026/01/01' } });
  assert.ok(textOf(bad4).includes('finishDate'), `日期格式：${textOf(bad4)}`);
  const bad5 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: 'X', kind: 'movie', link: 'ftp://x' } });
  assert.ok(textOf(bad5).includes('link'), `链接协议：${textOf(bad5)}`);

  // 记账 1：看完电影打 9 分（AI 补全年份/导演）
  const a1 = await rpc('tools/call', {
    name: 'guanzhi_log',
    arguments: { title: '流浪地球2', kind: 'movie', status: 'done', rating: 9, year: 2023, creator: '郭帆', genre: '科幻', note: '太空电梯封神' },
  });
  assert.ok(!a1.result.isError, `记账1：${textOf(a1)}`);
  assert.ok(textOf(a1).includes('已记账'), `记账回显：${textOf(a1)}`);
  assert.ok(textOf(a1).includes('第 1 部'), `今年第几部：${textOf(a1)}`);
  const id1 = extractId(textOf(a1));
  assert.ok(id1, `提取 id1：${textOf(a1)}`);

  // 记账 2：想看（清单）
  const a2 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: '沙丘3', kind: 'movie', status: 'wish' } });
  assert.ok(!a2.result.isError, `记账2（想看）：${textOf(a2)}`);
  assert.ok(textOf(a2).includes('心愿清单现有 1 部'), `清单计数：${textOf(a2)}`);
  const id2 = extractId(textOf(a2));

  // 记账 3：开始读书（active）
  const a3 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: '三体', kind: 'book', status: 'active' } });
  assert.ok(!a3.result.isError, `记账3（在读）：${textOf(a3)}`);
  const id3 = extractId(textOf(a3));

  // 判重：再记「流浪地球 2」（带空格）打 10 分 → 更新已有记录而非新建
  const a4 = await rpc('tools/call', {
    name: 'guanzhi_log',
    arguments: { title: '流浪地球 2', kind: 'movie', rating: 10 },
  });
  assert.ok(!a4.result.isError, `判重更新：${textOf(a4)}`);
  assert.ok(textOf(a4).includes('已更新已有记录'), `判重回显：${textOf(a4)}`);
  assert.ok(textOf(a4).includes(id1), `同一 id：${textOf(a4)}`);
  const kv1 = bridge.store.get(`guanzhi.work.${id1}`);
  assert.equal(kv1.rating, 10, '评分已更新');
  assert.equal(kv1.title, '流浪地球2', '原标题保留（title 不随判重改写）');
  const workKeys = [...bridge.store.keys()].filter((k) => k.startsWith('guanzhi.work.'));
  assert.equal(workKeys.length, 3, `落库键数：${workKeys.length}`);

  // 检索：关键词 / 状态 / 心头好
  const s1 = await rpc('tools/call', { name: 'guanzhi_search', arguments: { query: '流浪' } });
  assert.ok(textOf(s1).includes('流浪地球2') && textOf(s1).includes('9 分') || textOf(s1).includes('10 分'), `检索1：${textOf(s1)}`);
  const s2 = await rpc('tools/call', { name: 'guanzhi_search', arguments: { status: 'wish' } });
  assert.ok(textOf(s2).includes('沙丘3'), `想看过滤：${textOf(s2)}`);
  const s3 = await rpc('tools/call', { name: 'guanzhi_search', arguments: { kind: 'book' } });
  assert.ok(textOf(s3).includes('三体'), `体裁过滤：${textOf(s3)}`);

  // 问账：透视 + 年报
  const st = await rpc('tools/call', { name: 'guanzhi_stats', arguments: {} });
  assert.ok(!st.result.isError, `问账：${textOf(st)}`);
  assert.ok(textOf(st).includes('账本共 3 条'), `总数：${textOf(st)}`);
  assert.ok(textOf(st).includes('想看 1'), `想看计数：${textOf(st)}`);
  assert.ok(textOf(st).includes('在进行 1'), `进行中计数：${textOf(st)}`);
  assert.ok(textOf(st).includes('年报'), `年报段：${textOf(st)}`);

  // 推荐：先收尾（三体在读）+ 心愿轮换（沙丘3）+ 口味画像
  const rec = await rpc('tools/call', { name: 'guanzhi_recommend', arguments: {} });
  assert.ok(!rec.result.isError, `推荐：${textOf(rec)}`);
  assert.ok(textOf(rec).includes('先收尾') && textOf(rec).includes('三体'), `收尾段：${textOf(rec)}`);
  assert.ok(textOf(rec).includes('沙丘3'), `心愿段：${textOf(rec)}`);
  assert.ok(textOf(rec).includes('口味参考'), `口味段：${textOf(rec)}`);
  const rec2 = await rpc('tools/call', { name: 'guanzhi_recommend', arguments: { kind: 'book' } });
  assert.ok(textOf(rec2).includes('三体') && !textOf(rec2).includes('沙丘3'), `体裁定向：${textOf(rec2)}`);

  // 更新：补心头好 + 清评分（rating null）
  const u1 = await rpc('tools/call', { name: 'guanzhi_update', arguments: { id: id1, favorite: true } });
  assert.ok(!u1.result.isError, `更新收藏：${textOf(u1)}`);
  assert.ok(textOf(u1).includes('★心头好'), `收藏回显：${textOf(u1)}`);
  const u2 = await rpc('tools/call', { name: 'guanzhi_update', arguments: { id: id1, rating: null } });
  assert.ok(!u2.result.isError, `清评分：${textOf(u2)}`);
  const kv1b = bridge.store.get(`guanzhi.work.${id1}`);
  assert.equal(kv1b.rating, undefined, '评分已清除');
  assert.equal(kv1b.favorite, true, '心头好保留');

  // 删除确认门
  const d0 = await rpc('tools/call', { name: 'guanzhi_delete', arguments: { id: id2, confirm: false } });
  assert.ok(d0.result.isError, `无确认删除应拒：${textOf(d0)}`);
  const d1 = await rpc('tools/call', { name: 'guanzhi_delete', arguments: { id: id2, confirm: true } });
  assert.ok(!d1.result.isError, `确认删除：${textOf(d1)}`);
  assert.ok(textOf(d1).includes('已删除'), `删除回显：${textOf(d1)}`);
  assert.equal(bridge.store.has(`guanzhi.work.${id2}`), false, '删除后键清理');

  // 批量导入：2 有效 + 1 判重 + 1 非法
  const imp = await rpc('tools/call', {
    name: 'guanzhi_import',
    arguments: {
      works: [
        { title: '繁花', kind: 'tv', status: 'done', rating: 8, finishDate: '2026-02-01' },
        { title: '塞尔达·王国之泪', kind: 'game', status: 'done', rating: 9.5, finishDate: '2026-05-01' },
        { title: '三体', kind: 'book' },
        { title: '', kind: 'book' },
      ],
    },
  });
  assert.ok(!imp.result.isError, `导入：${textOf(imp)}`);
  assert.ok(textOf(imp).includes('导入 2 条'), `导入计数：${textOf(imp)}`);
  assert.ok(textOf(imp).includes('判重跳过 1'), `判重跳过：${textOf(imp)}`);
  assert.ok(textOf(imp).includes('拒绝 1'), `拒绝计数：${textOf(imp)}`);

  // 未知工具
  const unk = await rpc('tools/call', { name: 'guanzhi_nope', arguments: {} });
  assert.ok(unk.result.isError && textOf(unk).includes('未知工具'), `未知工具：${textOf(unk)}`);

  console.log('✓ 观止 MCP 全流程验证通过（校验/记账状态机/判重更新/检索/问账/推荐/更新/删除确认门/导入/未知工具）');
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
