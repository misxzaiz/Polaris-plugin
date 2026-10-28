/**
 * 观止真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：校验拒绝 → 记账（done+wish+active）→ 判重更新 → kv 落库
 * 验证 → 检索 → 问账 → 推荐 → 更新 → 删除确认门 → 导入 → 清理。
 * 清理为快照式：只删除本次冒烟新建的 guanzhi.* 键，不动既有数据。
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
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }

// 先确认真实桥可用
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

// 快照既有 guanzhi.* 键（清理时跳过，不动用户数据）
const preKeys = new Set((await kvKeys()).filter((k) => k.startsWith('guanzhi.')));
console.log(`[smoke] 既有 guanzhi.* 键 ${preKeys.size} 个（不动）`);

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
const extractId = (text) => (text.match(/\[(gw_[0-9a-z]+)\]/) || [])[1] || null;

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. 校验拒绝（评分越界）
  const bad = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: '坏数据', kind: 'movie', rating: 11 } });
  record('真实桥参数校验（评分越界拒绝）', bad.result.isError && textOf(bad).includes('rating'), '');

  // 2. 记账：看完电影打 9 分
  const a1 = await rpc('tools/call', {
    name: 'guanzhi_log',
    arguments: { title: '冒烟·流浪地球2', kind: 'movie', status: 'done', rating: 9, year: 2023, creator: '郭帆' },
  });
  record('真实桥记账（done + 评分）', !a1.result.isError && textOf(a1).includes('已记账'), textOf(a1).split('\n')[0]);
  const id1 = extractId(textOf(a1));

  // 3. 记账：想看
  const a2 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: '冒烟·沙丘3', kind: 'movie', status: 'wish' } });
  record('记账想看（清单计数）', !a2.result.isError && textOf(a2).includes('心愿清单'), '');
  const id2 = extractId(textOf(a2));

  // 4. 真实 kv 落库验证（与面板读同一份）
  const s1 = await kvGet(`guanzhi.work.${id1}`);
  record('cap.kv 一条一键落库（面板可读同一份）', s1 && s1.title === '冒烟·流浪地球2' && s1.rating === 9, '');

  // 5. 判重更新：同名（含空格差异）→ 更新已有记录
  const a3 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: '冒烟·流浪地球 2', kind: 'movie', note: '重看仍神作' } });
  record('判重更新（空格差异同名）', !a3.result.isError && textOf(a3).includes(id1), textOf(a3).split('\n')[0]);

  // 6. 记账：开始读书 → active（开始日记今天）
  const a4 = await rpc('tools/call', { name: 'guanzhi_log', arguments: { title: '冒烟·三体', kind: 'book', status: 'active' } });
  record('记账在读（开始日今天）', !a4.result.isError && textOf(a4).includes('在读'), '');
  const id4 = extractId(textOf(a4));
  const s4 = await kvGet(`guanzhi.work.${id4}`);
  record('active 自动补开始日', s4 && s4.startDate, String(s4?.startDate || ''));

  // 7. 检索
  const sea = await rpc('tools/call', { name: 'guanzhi_search', arguments: { query: '冒烟' } });
  record('检索（冒烟记录 3 条）', textOf(sea).split('《').length - 1 >= 3, '');

  // 8. 问账（透视 + 年报）
  const st = await rpc('tools/call', { name: 'guanzhi_stats', arguments: {} });
  record('问账（总数 + 年报）', !st.result.isError && textOf(st).includes('年报'), '');

  // 9. 推荐（收尾 + 心愿轮换）
  const rec = await rpc('tools/call', { name: 'guanzhi_recommend', arguments: {} });
  record('推荐（先收尾 + 心愿清单）', textOf(rec).includes('先收尾') && textOf(rec).includes('冒烟'), '');

  // 10. 更新：标心头好
  const u1 = await rpc('tools/call', { name: 'guanzhi_update', arguments: { id: id1, favorite: true } });
  record('更新（心头好落库）', !u1.result.isError && textOf(u1).includes('★心头好'), '');

  // 11. 删除确认门
  const d0 = await rpc('tools/call', { name: 'guanzhi_delete', arguments: { id: id2, confirm: false } });
  record('删除无确认被拒', d0.result.isError, '');
  const d1 = await rpc('tools/call', { name: 'guanzhi_delete', arguments: { id: id2, confirm: true } });
  record('确认后删除', !d1.result.isError && textOf(d1).includes('已删除'), '');

  // 12. 导入（2 有效 + 1 判重）
  const imp = await rpc('tools/call', {
    name: 'guanzhi_import',
    arguments: { works: [
      { title: '冒烟·繁花', kind: 'tv', status: 'done', rating: 8, finishDate: '2026-02-01' },
      { title: '冒烟·塞尔达', kind: 'game', status: 'done', rating: 9.5, finishDate: '2026-05-01' },
      { title: '冒烟·繁花', kind: 'tv' },
    ] },
  });
  record('批量导入（2 有效 + 1 判重）', !imp.result.isError && textOf(imp).includes('导入 2 条') && textOf(imp).includes('判重跳过 1'), '');
} catch (e) {
  record('流程异常', false, e.message);
} finally {
  mcp.kill();
  // 快照式清理：只删本次新建键
  let cleaned = 0;
  const nowKeys = await kvKeys();
  for (const k of nowKeys) {
    if (k.startsWith('guanzhi.') && !preKeys.has(k)) {
      // eslint-disable-next-line no-await-in-loop
      await kvDel(k);
      cleaned++;
    }
  }
  console.log(`[smoke] 清理本次新建键 ${cleaned} 个（既有 ${preKeys.size} 个未动）`);
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n[smoke] 结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
}
