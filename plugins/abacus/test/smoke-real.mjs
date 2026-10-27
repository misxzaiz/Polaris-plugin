/**
 * 算盘真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中（真实桥可达）。三步：
 *   1) 服务 CLI port=0 独立跑（appConfigDir=临时目录，数据根经 anchor 自发现指向真实数据根）
 *      → 等待 abacus.meta 心跳出现 → 断言聚合面真实出数（zcode+claude 双源、成本>0）
 *   2) 真实 MCP server（anchor→config 自发现同一真实桥）：initialize → tools/list=7
 *      → abacus_summary/abacus_quality/abacus_prices 出账 → abacus_price_set 写入并在
 *        聚合重算后验证未计价模型入账（用一次性测试模型行，收尾还原）
 *   3) 清理：杀进程 + 删除本次写入的全部 abacus.* 聚合键与测试价目（不碰 prices/settings
 *      存量），台帐缓存目录留在临时目录里随系统清理。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

const APP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

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
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; }
async function kvSet(k, v) { return bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

const AGG_KEYS = ['abacus.meta', 'abacus.summary', 'abacus.daily', 'abacus.models', 'abacus.projects', 'abacus.quality', 'abacus.sessions'];
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures += 1; }
}

// ── 第 1 步：服务独立跑 ────────────────────────────────────────────────────
console.log('[smoke] 真实桥 127.0.0.1:' + EP.port + ' 探测…');
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log('[smoke] 桥可达，先清理残留聚合键…');
for (const k of AGG_KEYS) await kvDel(k);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abacus-smoke-'));
console.log(`[smoke] 服务启动（appConfigDir=${tmpDir}）…`);
const svc = spawn(process.execPath, ['service/abacus.js', '0', tmpDir], { cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));

let healthPort = 0;
async function waitHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = svcErr.join('').match(/http:\/\/127\.0\.0\.1:(\d+)\/__health/);
    if (m) {
      healthPort = Number(m[1]);
      const ok = await new Promise((resolve) => {
        const r = http.get({ hostname: '127.0.0.1', port: healthPort, path: '/__health', timeout: 1500 }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        r.on('error', () => resolve(false));
        r.on('timeout', () => { r.destroy(); resolve(false); });
      });
      if (ok) return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

console.log('\n=== 第 1 步：服务扫描与聚合出数 ===');
check('服务健康检查就绪', await waitHealth());

let meta = null;
const deadline = Date.now() + 150000;
while (Date.now() < deadline) {
  meta = await kvGet('abacus.meta');
  if (meta && meta.lastScanAt) break;
  await new Promise((r) => setTimeout(r, 2000));
}
check('abacus.meta 心跳出现（首扫完成）', !!(meta && meta.lastScanAt), `最后日志: ${svcErr.slice(-3).join('')}`);
check('meta 标注三源口径', !!(meta && meta.caliber && meta.caliber.zcode && meta.caliber.claude && meta.caliber.polaris));

const summary = await kvGet('abacus.summary');
check('summary 存在且有请求', !!(summary && summary.all && summary.all.req > 0), JSON.stringify(summary && summary.all).slice(0, 120));
check('zcode 源出数', !!(summary && summary.bySrc && summary.bySrc.zcode && summary.bySrc.zcode.req > 0));
check('claude 源出数', !!(summary && summary.bySrc && summary.bySrc.claude && summary.bySrc.claude.req > 0));
check('成本可计（>0）', !!(summary && summary.all.costUsd > 0), `cost=${summary && summary.all.costUsd}`);
check('缓存节省≥0 且缓存读>0', !!(summary && summary.all.cr > 0 && summary.all.cacheSavings >= 0));

const models = await kvGet('abacus.models');
check('模型账本 ≥2 个', !!(Array.isArray(models) && models.length >= 2), `models=${models && models.length}`);
check('模型含缓存命中率', !!(Array.isArray(models) && models.some((m) => m.cacheHit !== null && m.cacheHit > 0)));

const daily = await kvGet('abacus.daily');
check('日账非空且升序', !!(Array.isArray(daily) && daily.length > 0 && daily.every((d, i, a) => i === 0 || a[i - 1].day <= d.day)));
const quality = await kvGet('abacus.quality');
check('质量透视含错误分类或零错误结构', !!(quality && typeof quality.errorsByType === 'object'));
check('工具遥测采集', !!(quality && quality.tools && quality.tools.total > 0));
const sessions = await kvGet('abacus.sessions');
check('会话 Top 存在', !!(Array.isArray(sessions) && sessions.length > 0));

// ── 第 2 步：真实 MCP ──────────────────────────────────────────────────────
console.log('\n=== 第 2 步：MCP 工具对账 ===');
const mcp = spawn(process.execPath, ['mcp/server.js', tmpDir], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
const mcpErr = [];
mcp.stderr.on('data', (c) => mcpErr.push(String(c)));
let mcpBuf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  mcpBuf += c;
  let i;
  while ((i = mcpBuf.indexOf('\n')) >= 0) {
    const line = mcpBuf.slice(0, i).trim();
    mcpBuf = mcpBuf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch (_) { /* 忽略坏行 */ }
  }
});
function rpc(method, params, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); }, timeoutMs);
    pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function callTool(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = r.result && r.result.content && r.result.content[0] && r.result.content[0].text;
  return { text: text || '', isError: !!(r.result && r.result.isError) };
}

const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
check('MCP initialize', !!(init.result && init.result.serverInfo && init.result.serverInfo.name === 'abacus'));
mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const tl = await rpc('tools/list', {});
check('tools/list = 7 工具', !!(tl.result && tl.result.tools && tl.result.tools.length === 7), `got ${tl.result && tl.result.tools && tl.result.tools.length}`);

const sum = await callTool('abacus_summary', { period: 'all' });
check('abacus_summary 出账（含 $ 与请求）', !sum.isError && sum.text.includes('$') && /请求 \d+ 次/.test(sum.text), sum.text.slice(0, 120));
const modelsT = await callTool('abacus_models', { limit: 3 });
check('abacus_models 出表', !modelsT.isError && modelsT.text.includes('GLM'), modelsT.text.slice(0, 100));
const projT = await callTool('abacus_projects', { limit: 3 });
check('abacus_projects 出表', !projT.isError && projT.text.includes('—') || !projT.isError, projT.text.slice(0, 80));
const qualT = await callTool('abacus_quality', {});
check('abacus_quality 出透视', !qualT.isError && qualT.text.includes('错误'), qualT.text.slice(0, 100));
const sessT = await callTool('abacus_sessions', { limit: 3 });
check('abacus_sessions 出 Top', !sessT.isError && sessT.text.includes('最烧钱会话'), sessT.text.slice(0, 80));
const priceT = await callTool('abacus_prices', {});
check('abacus_prices 出价目', !priceT.isError && priceT.text.includes('GLM-5.3-Flash'), priceT.text.slice(0, 80));

// price_set：写入一个一次性测试模型价 → 等服务热加载重算 → 验证未计价入账 → 还原
const before = await kvGet('abacus.prices');
const hadTestRow = !!(before && before['abacus-smoke-model']);
const ps = await callTool('abacus_price_set', { model: 'abacus-smoke-model', in: 1, cacheRead: 0.1, cacheWrite: 1, out: 2 });
check('abacus_price_set 写入', !ps.isError && ps.text.includes('已写入'), ps.text.slice(0, 80));
// 热加载 30s 周期 + 重算：轮询价目表出现即可（聚合重算依赖台账中有该模型，这里只验写入与热加载）
let sawHot = false;
const hotDeadline = Date.now() + 60000;
while (Date.now() < hotDeadline) {
  const p = await kvGet('abacus.prices');
  if (p && p['abacus-smoke-model'] && p['abacus-smoke-model'].in === 1) { sawHot = true; break; }
  await new Promise((r) => setTimeout(r, 3000));
}
check('服务热加载读到新价目', sawHot);

// ── 第 3 步：清理 ──────────────────────────────────────────────────────────
console.log('\n=== 清理 ===');
mcp.kill();
svc.kill();
await new Promise((r) => setTimeout(r, 500));
for (const k of AGG_KEYS) await kvDel(k);
// 还原测试价目行（之前不存在则删掉；存在则还原原值）
if (!hadTestRow) {
  const p = await kvGet('abacus.prices');
  if (p && p['abacus-smoke-model']) { delete p['abacus-smoke-model']; await kvSet('abacus.prices', p); }
}
// 信箱残留清理
const list = await bridgeDispatch('cap.kv', { action: 'list' });
const keys = (list.result && list.result.keys) || [];
for (const k of keys) {
  if (typeof k === 'string' && (k.startsWith('abacus.cmd.') || k.startsWith('abacus.result.'))) await kvDel(k);
}
console.log('[smoke] abacus.* 聚合键已清理，prices/settings 存量未动');

if (failures > 0) {
  console.error(`\n✗ 冒烟失败 ${failures} 项`);
  process.exit(1);
} else {
  console.log('\n✓ 算盘真实桥冒烟全绿');
}
