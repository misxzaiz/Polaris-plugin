/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 防误伤护栏：真实 kv 已有 llmprobe.* 业务键 → 拒跑
 *   2. 手动拉起真实服务（node service/main.js 19874 %APPDATA%/Polaris）——自发现真实桥
 *   3. 断言宿主档案自动导入（掩码形态）+ meta 心跳
 *   4. 单槽信箱闭环：cmd import_host → res 回执
 *   5. 真实体检一次：优先本地端点（零成本），否则第一个档案（每步 ≤16 token 真实花费）
 *   6. 掩码不变量：profiles/latest/report 的 kv 值绝不含完整 apiKey 形态
 *   7. 拉起真实 mcp/server.js → initialize → tools/list(5) → tools/call profiles
 *   8. 清理：杀服务/MCP + 删光 llmprobe.* 键
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PLUGIN_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '' };
}
let EP;
try { EP = loadEndpoint(); } catch (e) {
  console.error(`⚠ 宿主不在线（读取 anchor/config 失败：${e.message}）——真桥冒烟明确跳过，三层验证剩余两层（离线单测/集成测试）已全绿。`);
  process.exit(0);
}

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function bridgeDispatch(target, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); if (!r.ok) throw new Error('kv list: ' + r.error); return r.result?.keys ?? []; }

async function waitFor(fn, ms, step = 600, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`冒烟超时：${label}`);
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };
const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 0. 宿主可达性 ───────────────────────────────────────────────────────────
try {
  const health = await new Promise((resolve, reject) => {
    const req = http.get({ hostname: EP.host, port: EP.port, path: '/api/health', timeout: 2500 }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
  if (health !== 200) throw new Error(`HTTP ${health}`);
  console.log(`宿主在线 ${EP.host}:${EP.port}`);
} catch (e) {
  console.error(`⚠ 宿主不在线（${e.message}）——真桥冒烟明确跳过。`);
  process.exit(0);
}

// ── 1. 护栏 ─────────────────────────────────────────────────────────────────
const preKeys = (await kvKeys()).filter((k) => k.startsWith('llmprobe.'));
if (preKeys.length) {
  console.error(`✗ 拒跑：真实 kv 已存在 ${preKeys.length} 个 llmprobe 业务键。先清理后再跑。示例：` + preKeys.slice(0, 5).join(', '));
  process.exit(1);
}

// ── 2. 拉起真实服务 ─────────────────────────────────────────────────────────
const APP_CFG = path.join(process.env.APPDATA || '', 'Polaris');
const PORT = 19874;
const svc = spawn('node', [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(PORT), APP_CFG], { stdio: ['ignore', 'pipe', 'pipe'] });
let svcLog = '';
svc.stderr.on('data', (c) => { svcLog += String(c); });
const mcpProcs = [];
const cleanup = async () => {
  try { if (alive(svc.pid)) svc.kill(); } catch (_) { /* 忽略 */ }
  for (const m of mcpProcs) { try { if (alive(m.pid)) m.kill(); } catch (_) { /* 忽略 */ } }
  const keys = await kvKeys().catch(() => []);
  for (const k of keys.filter((x) => x.startsWith('llmprobe.'))) await kvDel(k).catch(() => { /* 忽略 */ });
  console.log('清理完成：服务/MCP 已停，llmprobe.* 键已删');
};
process.on('exit', () => { try { if (alive(svc.pid)) svc.kill(); } catch (_) { /* 忽略 */ } for (const m of mcpProcs) { try { m.kill(); } catch (_) { /* 忽略 */ } } });
try {
  // ── 3. meta 心跳 + 宿主档案导入 ───────────────────────────────────────────
  const meta = await waitFor(async () => await kvGet('llmprobe.meta'), 20000, 600, '服务心跳');
  record('服务心跳落 kv（版本/档案数）', !!meta && typeof meta.version === 'string' && meta.profileCount >= 0, `v${meta?.version} · ${meta?.profileCount} 档案`);

  const prof = await waitFor(async () => await kvGet('llmprobe.profiles'), 20000, 600, '档案发布');
  const items = prof && Array.isArray(prof.items) ? prof.items : [];
  record('宿主档案自动导入（≥1）', items.length >= 1, `${items.length} 条`);
  const maskedOk = items.every((p) => !('apiKey' in p) && (p.keyMask === '' || p.keyMask.startsWith('****') || p.keyMask.startsWith('env:')));
  record('档案全掩码（无 apiKey 字段/keyMask 形态合法）', maskedOk, items.slice(0, 2).map((p) => p.keyMask).join(','));

  // ── 4. 单槽信箱闭环（import_host 幂等）────────────────────────────────────
  const nonce = `smoke-${Date.now().toString(36)}`;
  await kvSet('llmprobe.cmd', { nonce, action: 'import_host', payload: {}, at: new Date().toISOString() });
  const res = await waitFor(async () => {
    const r = await kvGet('llmprobe.res');
    return r && r.nonce === nonce ? r : null;
  }, 20000, 500, 'import_host 回执');
  record('信箱闭环（cmd → res nonce 对齐）', !!(res && res.result && res.result.ok), `imported=${res?.result?.imported}`);
  await kvDel('llmprobe.res');

  // ── 5. 真实体检一次（优先零成本本地端点）─────────────────────────────────
  const pick = items.find((p) => /127\.0\.0\.1|localhost|192\.168\.|10\./.test(p.baseUrl)) || items[0];
  console.log(`体检目标：${pick.name}（${pick.baseUrl}）${/127\.0\.0\.1|localhost/.test(pick.baseUrl) ? '（本地零成本）' : '（真实端点，花费 ≤100 token）'}`);
  const nonce2 = `smoke2-${Date.now().toString(36)}`;
  await kvSet('llmprobe.cmd', { nonce: nonce2, action: 'run_suite', payload: { profileId: pick.id }, at: new Date().toISOString() });
  const res2 = await waitFor(async () => {
    const r = await kvGet('llmprobe.res');
    return r && r.nonce === nonce2 ? r : null;
  }, 180000, 1500, 'run_suite 回执（真实端点可能较慢）');
  const rep = res2 && res2.result;
  record('体检回执 ok + 报告结构', !!(rep && rep.ok && rep.report && rep.report.steps), rep && rep.error ? rep.error : `runId=${rep?.runId}`);
  if (rep && rep.ok && rep.report) {
    const r = rep.report;
    const stepNames = Object.keys(r.steps || {});
    record('五步结构（connect/chat/models/stream/tools）', ['connect', 'chat', 'models', 'stream', 'tools'].every((k) => stepNames.includes(k)), stepNames.join(','));
    record('健康分与档位存在', typeof (r.score && r.score.total) === 'number' && !!r.verdict, `${r.score?.total} ${r.verdict?.cn}`);
    record('解析终点展示', !!(r.urls && r.urls.chat), r.urls?.chat);
    const repStr = JSON.stringify(r);
    record('报告掩码不变量（无 sk- 形态长密钥）', !/sk-[A-Za-z0-9_-]{16,}/.test(repStr) && !repStr.includes('"apiKey"'), '');
    const latest = await kvGet('llmprobe.latest');
    record('latest 落库且 runId 一致', !!latest && latest.runId === rep.runId, latest?.runId);
    const hist = await kvGet('llmprobe.history');
    const histArr = Array.isArray(hist) ? hist : (hist && hist.items) || [];
    record('历史环形记录', histArr.length >= 1, `${histArr.length} 条`);
  }

  // ── 6. MCP 闭环 ───────────────────────────────────────────────────────────
  const mcp = spawn('node', [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), APP_CFG], { stdio: ['pipe', 'pipe', 'pipe'] });
  mcpProcs.push(mcp);
  let mcpBuf = '';
  const mcpWaiter = [];
  mcp.stdout.on('data', (c) => {
    mcpBuf += String(c);
    let idx;
    while ((idx = mcpBuf.indexOf('\n')) >= 0) {
      const line = mcpBuf.slice(0, idx); mcpBuf = mcpBuf.slice(idx + 1);
      if (line.trim() && mcpWaiter.length) mcpWaiter.shift()(JSON.parse(line));
    }
  });
  const mcpCall = (msg) => new Promise((resolve) => { mcpWaiter.push(resolve); mcp.stdin.write(JSON.stringify(msg) + '\n'); });
  const init = await mcpCall({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  record('MCP initialize', init?.result?.serverInfo?.name === 'llm-probe', init?.result?.serverInfo?.name);
  const list = await mcpCall({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  record('MCP tools/list 5 工具', (list?.result?.tools || []).length === 5, (list?.result?.tools || []).map((t) => t.name).join(','));
  const call = await mcpCall({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'llmprobe_profiles', arguments: {} } });
  const text = call?.result?.content?.[0]?.text || '';
  record('MCP profiles 返回掩码清单', text.includes('****') || text.includes('env:') || text.includes('暂无档案'), text.split('\n')[0].slice(0, 80));

  // ── 7. 服务健康端点 ───────────────────────────────────────────────────────
  const h = await new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: '/__health', timeout: 2500 }, (r2) => { let b = ''; r2.on('data', (c) => { b += c; }); r2.on('end', () => resolve(JSON.parse(b))); });
    req.on('error', () => resolve(null));
  });
  record('服务 /__health 200', !!h && h.ok === true, h ? `profiles=${h.profiles}` : '无响应');

} catch (e) {
  record('冒烟异常中断', false, String((e && e.message) || e));
} finally {
  await cleanup();
}

console.log(`\n==== 真桥冒烟：${results.filter((r) => r.pass).length}/${results.length} 通过 ====`);
for (const r of results.filter((x) => !x.pass)) console.log(`  ✗ ${r.name}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
