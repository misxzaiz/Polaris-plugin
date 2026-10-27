/**
 * 谋定真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：decided 立照（缺预期拦截）→ open 记纠结 → settle →
 * list due → update 期限 → resolve 复盘 → stats → delete，最后只清理本次
 * 冒烟创建的 decision.d.* 键（不碰存量台账）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function loadEndpoint() {
  const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { port: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function bridgeDispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: '127.0.0.1', port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }

// 先确认真实桥可用
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
const stderrChunks = [];
mcp.stderr.on('data', (c) => stderrChunks.push(String(c)));

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
  const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 60000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
const textOf = (m) => m.content[0].text;

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const createdIds = [];
const extractId = (text) => (text.match(/id=(d[a-z0-9]+)/) || [])[1];

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  const tools = await rpc('tools/list', {});
  record('tools/list', tools.result.tools.length === 9, `${tools.result.tools.length} 工具`);

  // 1. 方法论拦截：decided 缺预期
  const blocked = await call('decision_create', { title: 'smoke 拦截测试', options: ['A'], chosen: 'A' });
  record('缺预期被拦截', blocked.isError === true && textOf(blocked).includes('可检验的预期'));

  // 2. decided 立照
  const c1 = await call('decision_create', {
    title: `smoke 立照 ${Date.now()}`, context: '冒烟测试数据', options: [{ name: '方案A' }, { name: '方案B' }],
    chosen: '方案B', rationale: 'smoke', expectedText: 'smoke 冒烟期内本条记录可被复盘工具读到', confidence: 75,
    reviewInDays: 7, tags: ['smoke'],
  });
  const id1 = extractId(textOf(c1));
  if (id1) createdIds.push(id1);
  record('decided 立照', !c1.isError && !!id1, id1);

  // 3. 真实 kv 落库校验
  const stored = id1 ? await kvGet(`decision.d.${id1}`) : null;
  record('cap.kv 落库', !!stored && stored.status === 'decided' && stored.expected.confidence === 75);

  // 4. open 记纠结 + settle
  const c2 = await call('decision_create', { title: `smoke 纠结 ${Date.now()}`, question: 'smoke：A 还是 B', options: ['A', 'B'] });
  const id2 = extractId(textOf(c2));
  if (id2) createdIds.push(id2);
  const s1 = await call('decision_settle', { id: id2, chosen: 'A', expectedText: 'smoke settle 预期', confidence: 60, reviewInDays: 7 });
  record('open→settle 定案', !c2.isError && !s1.isError, id2);

  // 5. list（tag 过滤）
  const ls = await call('decision_list', { tag: 'smoke', limit: 10 });
  record('list tag 过滤', !ls.isError && textOf(ls).includes('smoke 立照'));

  // 6. 期限改到昨天 → due
  const yesterday = Date.now() - 24 * 3600 * 1000;
  const up = await call('decision_update', { id: id1, reviewAt: yesterday });
  const due = await call('decision_list', { status: 'due' });
  record('due 到期判定', !up.isError && textOf(due).includes('smoke 立照'));

  // 7. 复盘
  const rv = await call('decision_resolve', { id: id1, outcome: 'hit', note: 'smoke 复盘', lesson: 'smoke 教训：先演练恢复' });
  const stored2 = await kvGet(`decision.d.${id1}`);
  record('复盘打分', !rv.isError && stored2?.resolution?.score === 1);

  // 8. stats 引用教训
  const st = await call('decision_stats', {});
  record('stats 含教训', !st.isError && textOf(st).includes('先演练恢复'));

  // 9. get 全文
  const got = await call('decision_get', { id: id1 });
  record('get 全文', !got.isError && textOf(got).includes('smoke 复盘'));
} catch (e) {
  record('流程中断', false, e.message);
  console.error(stderrChunks.join(''));
} finally {
  mcp.kill();
  // 清理：只删本次创建的键
  let cleaned = 0;
  for (const id of createdIds) {
    const r = await kvDel(`decision.d.${id}`);
    if (r.ok) cleaned += 1;
  }
  console.log(`[smoke] 清理 ${cleaned}/${createdIds.length} 个冒烟决策键（不碰存量台账）`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n[smoke-real] ${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
