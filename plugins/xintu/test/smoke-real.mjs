/**
 * 心图真实环境冒烟（node test/smoke-real.mjs）
 * 前提：目标 Polaris 实例运行中。真实 MCP server 走 anchor→config 自发现真实桥
 * 执行 spec §十 P0 九步；最后只清理本冒烟产生的键。
 *
 * 环境变量：
 *   POLARIS_SMOKE_CONFIG  指定 config.json 路径（默认 anchor.json→dataRoot/config.json；
 *                         测 dev 实例时指向 %APPDATA%/Polaris-dev/config.json）
 *
 * ⚠️ 全程禁用 cap.kv list（实测大数据根上会拖垮宿主）：安全闸与清理走
 *    xt.boards 索引 + 已知键名。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const kvclient = require('../mcp/kvclient.js');

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function loadEndpoint() {
  if (process.env.POLARIS_SMOKE_CONFIG) {
    const cfg = JSON.parse(fs.readFileSync(process.env.POLARIS_SMOKE_CONFIG, 'utf8'));
    return { port: cfg.web.port, token: cfg.web.token || '' };
  }
  const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { port: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
console.log(`[smoke] 目标实例 127.0.0.1:${EP.port}`);

function bridgeDispatchOnce(target, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: '127.0.0.1', port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`dispatch 超时 ${timeoutMs}ms（宿主 dispatch 通道不健康？）`)); });
    req.write(data);
    req.end();
  });
}
/** 直连桥调用：dev 实例窗口初始化期偶发瞬断，重试 2 次 */
async function bridgeDispatch(target, payload, timeoutMs = 15000) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await bridgeDispatchOnce(target, payload, timeoutMs);
      if (i > 0) console.log(`[smoke] 第 ${i + 1} 次尝试成功`);
      return r;
    } catch (e) {
      lastErr = e;
      if (i < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.ok ? (r.result?.value ?? null) : null; }
async function kvSet(k, v) { return bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// 先确认真实桥可用（get 是安全操作）
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' }).catch((e) => ({ ok: false, error: e.message }));
if (!probe.ok) { console.error(`✗ 真实桥不可达或 dispatch 不健康：${probe.error || JSON.stringify(probe).slice(0, 120)}`); process.exit(1); }
console.log('[smoke] 真实桥 dispatch 可达');

// 安全闸（无 list 版）：xt.boards 索引非空 = 可能存在用户真实画布，拒绝执行
const preIndex = await kvGet('xt.boards');
if (Array.isArray(preIndex) && preIndex.length > 0) {
  console.error(`✗ 检测到索引里已有 ${preIndex.length} 块画布（可能是真实数据），为防误删拒绝执行。`);
  process.exit(1);
}
const preIndexRaw = preIndex === null ? null : JSON.parse(JSON.stringify(preIndex));

const mcp = spawn(process.execPath, ['mcp/server.js', path.join(os.homedir(), '.polaris-smoke-does-not-exist')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
  // 测 dev 实例时经 env 传导端点（kvclient 自发现顺序里 env 最优先）；
  // 不传则 MCP 走 anchor.json 自发现（即生产实例路径）。
  env: {
    ...process.env,
    ...(process.env.POLARIS_SMOKE_CONFIG ? {
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: String(EP.port),
      POLARIS_TOKEN: EP.token,
    } : {}),
  },
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

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  // ⓪ kvclient 自发现单步断言：loadWebConfig 能读到一份有效 web 配置（本机上它
  //    按 anchor 优先级解析——生产 anchor 指向 9820 是正确行为；此步验证发现代码路径本身）
  {
    const saved = { ...process.env };
    delete process.env.POLARIS_HOST; delete process.env.POLARIS_PORT; delete process.env.POLARIS_TOKEN;
    const viaCfg = kvclient.loadWebConfig();
    Object.assign(process.env, saved);
    record('⓪ kvclient.loadWebConfig 自发现代码路径', !!viaCfg && typeof viaCfg.port === 'number' && viaCfg.port > 0,
      viaCfg ? `port=${viaCfg.port}` : 'null');
  }
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // ① create 空板（MCP 无 env 注入 → 走 anchor/config 自发现真实桥）
  const c1 = await rpc('tools/call', { name: 'xintu_create', arguments: { title: '冒烟·网关重构脑暴' } });
  const boardId = (textOf(c1).match(/id=([A-Za-z0-9_-]+)/) || [])[1];
  record('① create 新建画布', !c1.result.isError && !!boardId, textOf(c1).split('。')[0]);

  // ② edit 一批落 10 节点 8 边
  const ids = ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const ops = [
    ...ids.map((id, i) => ({ op: 'add_card', args: { id, x: 200 + (i % 5) * 280, y: Math.floor(i / 5) * 240, title: `模块${id.toUpperCase()}`, text: `${id} 模块说明`, color: i === 0 ? 'blue' : 'default' } })),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ op: 'add_edge', args: { from: 'hub', to: id, label: '调用' } })),
  ];
  const e1 = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops } });
  record('② edit 批量落 10 节点 8 边（同批连边）', !e1.result.isError && textOf(e1).includes('已应用 18 个 op'), textOf(e1).split('\n')[0]);

  // ③ read 逐字段对账（与真实 kv 同源）
  const raw = await kvGet(`xt.board.${boardId}`);
  const r1 = JSON.parse(textOf(await rpc('tools/call', { name: 'xintu_read', arguments: { id: boardId } })));
  record('③ read 对账（rev/节点/边/吸附/颜色）',
    r1.rev === 2 && r1.nodes.length === 10 && r1.edges.length === 8
    && r1.nodes.every((n) => n.x % 40 === 0)
    && r1.nodes.find((n) => n.id === 'hub').color === 'blue'
    && raw && raw.rev === 2 && raw.nodes.length === 10,
    `kv rev=${raw?.rev} nodes=${raw?.nodes?.length}`);

  // ④ 非法 op 整批拒绝，rev 不动
  const bad = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops: [
    { op: 'add_note', args: { id: 'ok1', x: 0, y: 0 } },
    { op: 'add_edge', args: { from: 'ok1', to: 'ghost' } },
  ] } });
  const rawAfterBad = await kvGet(`xt.board.${boardId}`);
  record('④ 非法 op 整批拒绝（rev 不动、无半截写入）',
    bad.result.isError && textOf(bad).includes('ghost') && textOf(bad).includes('整批')
    && rawAfterBad.rev === 2 && rawAfterBad.nodes.length === 10, '');

  // ⑤ relayout LR：hub 在左、子节点同列
  const rl = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops: [{ op: 'relayout', args: { direction: 'LR' } }] } });
  const r2 = JSON.parse(textOf(await rpc('tools/call', { name: 'xintu_read', arguments: { id: boardId } })));
  const byId = new Map(r2.nodes.map((n) => [n.id, n]));
  record('⑤ relayout LR（hub 左侧、同层同列）',
    !rl.result.isError && byId.get('hub').x < byId.get('a').x && byId.get('a').x === byId.get('b').x, '');

  // ⑥ export：大纲 + 关联行
  const ex = await rpc('tools/call', { name: 'xintu_export', arguments: { id: boardId } });
  record('⑥ export 大纲（标题 + 关联行）',
    !ex.result.isError && textOf(ex).includes('# 冒烟·网关重构脑暴') && /→ 模块A/.test(textOf(ex)), '');

  // ⑦ 容量防线：单批 201 op 明确报错
  const many = Array.from({ length: 201 }, () => ({ op: 'set_title', args: { title: 't' } }));
  const many1 = await rpc('tools/call', { name: 'xintu_edit', arguments: { id: boardId, ops: many } });
  record('⑦ 单批 201 op 超限明确报错', many1.result.isError && textOf(many1).includes('超限'), '');

  // ⑧ delete：无 confirm 拒、带 confirm 成功
  const d0 = await rpc('tools/call', { name: 'xintu_delete', arguments: { id: boardId } });
  const d1 = await rpc('tools/call', { name: 'xintu_delete', arguments: { id: boardId, confirm: boardId } });
  const rawDel = await kvGet(`xt.board.${boardId}`);
  record('⑧ delete confirm 双向（防误删 + 可删除）',
    d0.result.isError && textOf(d0).includes('confirm') && !d1.result.isError && rawDel === null, '');

  // ⑨ list 全程口径：删后回空（索引驱动，无 list 动作）
  const l1 = await rpc('tools/call', { name: 'xintu_list', arguments: {} });
  record('⑨ list 删后回空', textOf(l1).includes('暂无画布'), '');

  record('真实桥冒烟全部通过', true);
} catch (e) {
  record('流程', false, e.message);
  console.error('mcp stderr:', stderrChunks.join('').slice(-800));
} finally {
  mcp.kill();
  await new Promise((r) => setTimeout(r, 500));
  // 无 list 清理：删冒烟板键 + 恢复冒烟前索引值
  const postIndex = await kvGet('xt.boards').catch(() => null);
  if (Array.isArray(postIndex)) {
    for (const e of postIndex) {
      if (e && typeof e.id === 'string') await kvDel(`xt.board.${e.id}`).catch(() => {});
    }
  }
  if (preIndexRaw === null) await kvDel('xt.boards').catch(() => {});
  else await kvSet('xt.boards', preIndexRaw).catch(() => {});
  console.log('[smoke] 已清理冒烟板键并恢复 xt.boards 原值');
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
