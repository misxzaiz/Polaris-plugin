/**
 * 灵犀真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：捕获（含相关匹配）→ 直读 kv 验证 → 检索/详情 → 深化
 * → 推进 → 强制到期后回访记录 → 星系报告 → 碰撞 → 归档/恢复，
 * 最后按「快照恢复」清理本次新建的 lingxi.idea.* 键（不动既有数据）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

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
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }
async function kvSet(k, v) { return bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// 先确认真实桥可用
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

// 快照既有 lingxi 数据（冒烟只新建键，结束后恢复原状）
const IDEA_PREFIX = 'lingxi.idea.';
const snapshot = new Map();
for (const k of (await kvKeys()).filter((k) => k.startsWith(IDEA_PREFIX))) {
  snapshot.set(k, await kvGet(k));
}
console.log(`[smoke] 既有 lingxi.idea.* ${snapshot.size} 键已快照`);

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
const textOf = (m) => m.result.content[0].text;
const idIn = (text) => { const m = text.match(/\[(i[0-9a-z]+)\]/); return m ? m[1] : null; };

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const createdIds = [];

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. 捕获第一条（带 AI 追问）
  const c1 = await rpc('tools/call', {
    name: 'lingxi_catch',
    arguments: { title: '灵犀冒烟：做一张星空屏保', raw: '深蓝紫渐变、暖色星点，安静不闪', tags: ['冒烟', '星空'], question: '最小的内核是纯色渐变还是先有星轨？' },
  });
  const id1 = idIn(textOf(c1));
  createdIds.push(id1);
  record('捕获入池（含追问与回访日期）',
    !c1.result.isError && textOf(c1).includes('已入池') && textOf(c1).includes('下次回访') && !!id1,
    textOf(c1).split('\n')[0]);

  // 2. 捕获相关想法 → 应报相关
  const c2 = await rpc('tools/call', {
    name: 'lingxi_catch',
    arguments: { title: '灵犀冒烟：星空屏保的暖夜色板', tags: ['冒烟'] },
  });
  const id2 = idIn(textOf(c2));
  createdIds.push(id2);
  record('第二条捕获自动报相关旧想法',
    !c2.result.isError && textOf(c2).includes('可能相关') && textOf(c2).includes(id1),
    textOf(c2).split('\n').find((l) => l.includes('相关')) || '');

  // 3. 直读真实 kv：一想法一键、回访 3 天、origin=ai
  const raw1 = await kvGet(IDEA_PREFIX + id1);
  const dueOk = raw1 && Math.abs(raw1.revisit.dueAt - (Date.now() + 3 * 86400000)) < 60000;
  record('cap.kv 落库（面板可读同一份）',
    raw1 && raw1.title.includes('星空屏保') && dueOk && raw1.origin === 'ai',
    `dueAt 偏差 ${raw1 ? Math.round((raw1.revisit.dueAt - Date.now()) / 86400000 * 10) / 10 : '?'} 天`);

  // 4. 检索
  const s1 = await rpc('tools/call', { name: 'lingxi_search', arguments: { keyword: '星空' } });
  record('关键词检索命中 2 条', textOf(s1).includes('命中 2 条'), textOf(s1).split('\n')[0]);

  // 5. 详情（时间线 + 追问）
  const g1 = await rpc('tools/call', { name: 'lingxi_get', arguments: { id: id1 } });
  record('详情卡（时间线含追问）', textOf(g1).includes('时间线') && textOf(g1).includes('追问'), '');

  // 6. 深化 → 间隔翻倍 6
  const d1 = await rpc('tools/call', { name: 'lingxi_deepen', arguments: { id: id1, text: '冒烟：先做纯色渐变内核' } });
  record('深化沉淀（间隔翻倍至 6 天）', textOf(d1).includes('6 天'), textOf(d1).split('\n')[1] || '');

  // 7. 推进 → 嫩芽
  const p1 = await rpc('tools/call', { name: 'lingxi_promote', arguments: { id: id1, note: '冒烟推进' } });
  record('推进成熟度（→ 嫩芽）', textOf(p1).includes('嫩芽'), textOf(p1).split('\n')[0]);

  // 8. 强制到期 → 回访列表 → 记录 snooze（先重读最新状态，避免陈旧快照写回踩掉深化/推进）
  const cur1 = await kvGet(IDEA_PREFIX + id1);
  cur1.revisit.dueAt = Date.now() - 86400000;
  await kvSet(IDEA_PREFIX + id1, cur1);
  const rl = await rpc('tools/call', { name: 'lingxi_revisit', arguments: { action: 'list' } });
  record('回访队列列出到期想法', textOf(rl).includes(id1) || textOf(rl).includes('星空屏保'), textOf(rl).split('\n')[0]);
  const rr = await rpc('tools/call', { name: 'lingxi_revisit', arguments: { action: 'record', id: id1, outcome: 'snooze', note: '冒烟再等等' } });
  record('记录回访（snooze 翻倍 3→6）', !rr.result.isError && textOf(rr).includes('snooze') && textOf(rr).includes('间隔 6 天'), textOf(rr));

  // 9. 星系报告
  const cst = await rpc('tools/call', { name: 'lingxi_constellation', arguments: {} });
  record('星系报告（#冒烟 成簇）', textOf(cst).includes('#冒烟'), textOf(cst).split('\n').find((l) => l.includes('#冒烟')) || '');

  // 10. 随机碰撞
  const col = await rpc('tools/call', { name: 'lingxi_collide', arguments: { count: 2 } });
  record('随机碰撞（视角卡 + 抽样）',
    !col.result.isError && textOf(col).includes('视角卡') && textOf(col).includes('星空屏保'),
    textOf(col).split('\n')[0]);

  // 11. 归档 → 归档检索 → 恢复
  const a1 = await rpc('tools/call', { name: 'lingxi_archive', arguments: { id: id2 } });
  record('归档沉寂', textOf(a1).includes('已归档'), '');
  const s2 = await rpc('tools/call', { name: 'lingxi_search', arguments: { status: 'archived' } });
  record('归档可检索', textOf(s2).includes('暖夜色板'), '');
  const a2 = await rpc('tools/call', { name: 'lingxi_archive', arguments: { id: id2, restore: true } });
  record('恢复入池（回访重置）', textOf(a2).includes('已恢复入池'), '');

  record('真实桥冒烟全部通过', true);
} catch (e) {
  record('流程', false, e.message);
  console.error('mcp stderr:', stderrChunks.join('').slice(-800));
} finally {
  mcp.kill();
  await new Promise((r) => setTimeout(r, 500));
  // 快照式清理：删除本次新建键；若既有键被动过则恢复快照值
  let cleaned = 0;
  for (const id of createdIds.filter(Boolean)) {
    await kvDel(IDEA_PREFIX + id);
    cleaned++;
  }
  let restored = 0;
  for (const [k, v] of snapshot) {
    const cur = await kvGet(k);
    if (JSON.stringify(cur) !== JSON.stringify(v)) {
      await kvSet(k, v);
      restored++;
    }
  }
  console.log(`[smoke] 已清理 ${cleaned} 个新建键，恢复 ${restored} 个被动过的既有键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
