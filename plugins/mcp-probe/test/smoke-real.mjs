/**
 * smoke-real.mjs —— 真桥冒烟：对运行中的 Polaris 宿主做真实 kv 持久化回路
 *
 * 运行条件（不满足则跳过，退出码 2）：
 *   1. 本机 Polaris 正在运行（/api/health 可达）；
 *   2. probe.meta 不存在（插件服务未在运行——避免双写者违反单一所有者纪律；
 *      插件已安装时请直接用面板/AI 验证）。
 *
 * 流程：临时拉起服务进程（真实 kvclient 自发现宿主端点）→ 建临时档案 → 连接假 stdio
 * 服务器 → 调用 → 体检 → 快照 diff → 历史 → 优雅退出 → kv 键恢复原状（自清理）。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, '..');
const { createKvClient } = require('../service/kvclient.js');

const KV_KEYS = ['probe.meta', 'probe.profiles', 'probe.history', 'probe.snapshots', 'probe.reports'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) { process.stdout.write(`${msg}\n`); }

async function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function svcRequest(port, method, route, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers, timeout: 60000 }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); } catch (e) { reject(new Error(`非 JSON: ${buf.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

const kv = createKvClient({ appConfigDir: '', log: () => {} });

let before = new Map();
let svc = null;
let pass = 0;
let fail = 0;
const failures = [];

function t(name, ok, detail) {
  if (ok) { pass += 1; log(`  ✓ ${name}`); } else {
    fail += 1;
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
    log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function cleanup() {
  // 1) 杀服务（SIGTERM → 服务自删 probe.meta 并关子进程）
  if (svc && svc.exitCode === null) {
    svc.kill('SIGTERM');
    await sleep(1200);
    if (svc.exitCode === null) { try { svc.kill('SIGKILL'); } catch (_) { /* ignore */ } }
  }
  // 2) 恢复 kv 原状：测试前不存在的键删除，存在过的键原值写回
  try {
    for (const key of KV_KEYS) {
      // eslint-disable-next-line no-await-in-loop
      if (before.has(key)) await kv.kvSet(key, before.get(key));
      // eslint-disable-next-line no-await-in-loop
      else await kv.kvDel(key);
    }
  } catch (e) {
    log(`  ! kv 清理失败（需手动检查 probe.* 键）: ${e.message}`);
  }
}

async function main() {
  // 0) 宿主可达性（真桥：cap.kv 可读即在线）
  let hostUp = false;
  try {
    await kv.dispatchOk('cap.kv', { action: 'list' });
    hostUp = true;
  } catch (_) { hostUp = false; }
  if (!hostUp) {
    log('SKIP: 未检测到运行中的 Polaris 宿主（冒烟需宿主在线）');
    process.exit(2);
  }

  // 1) 单写者检查：插件服务已在运行则不冒烟
  const existingMeta = await kv.kvGet('probe.meta').catch(() => null);
  if (existingMeta && typeof existingMeta === 'object' && existingMeta.port) {
    log(`SKIP: 检测到插件服务已在运行（port=${existingMeta.port}）——真桥冒烟避免双写者，请直接用面板或 AI 工具验证`);
    process.exit(2);
  }

  // 2) 快照既有 probe.* 状态（测试后恢复）
  for (const key of KV_KEYS) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kv.kvGet(key).catch(() => undefined);
    if (v !== null && v !== undefined) before.set(key, v);
  }
  log(`冒烟开始（宿主在线，probe.* 既有键 ${before.size} 个）`);

  try {
    const port = await freePort();
    const tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-smoke-'));
    svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'probe.js'), String(port), tmpCfg], { stdio: ['ignore', 'pipe', 'pipe'] });
    svc.stderr.on('data', () => { /* 落盘日志已含 */ });

    // 3) 服务起 + 真实 kv 注册
    let meta = null;
    for (let i = 0; i < 40; i++) {
      // eslint-disable-next-line no-await-in-loop
      meta = await kv.kvGet('probe.meta').catch(() => null);
      if (meta && meta.port) break;
      await sleep(400);
    }
    t('服务经真实 cap.kv 自注册 probe.meta', !!(meta && meta.port === port));
    if (!meta) throw new Error('probe.meta 未注册，终止冒烟');

    const token = meta.token;
    const health = await svcRequest(port, 'GET', '/__health', undefined, undefined);
    t('探针 /__health 200', health.status === 200 && health.json.ok === true);

    const unauth = await svcRequest(port, 'GET', '/api/state', undefined, undefined);
    t('无 token → 401', unauth.status === 401);

    // 4) 临时档案 + 真实连接/调用
    const saved = await svcRequest(port, 'POST', '/api/profiles/save', {
      name: `smoke-${Date.now()}`, transport: 'stdio',
      command: process.execPath, args: [path.join(__dirname, 'fake-mcp-server.js')], timeoutMs: 15000,
    }, token);
    t('建临时档案', saved.json.ok === true, JSON.stringify(saved.json).slice(0, 200));
    const pid = saved.json.profile && saved.json.profile.id;

    const conn = await svcRequest(port, 'POST', '/api/connect', { serverId: pid }, token);
    t('连接假 stdio 服务器（真实 spawn）', conn.json.ok === true && conn.json.info && conn.json.info.tools.length === 4, JSON.stringify(conn.json).slice(0, 200));

    const call = await svcRequest(port, 'POST', '/api/call', { serverId: pid, tool: 'echo', arguments: { text: '真桥冒烟' }, via: 'panel' }, token);
    t('调用 echo 往返', call.json.ok === true && JSON.stringify(call.json.result).includes('echo: 真桥冒烟'), JSON.stringify(call.json).slice(0, 200));

    // 5) 真实宿主 kv 落库验证（绕开服务直接读 kv）
    const histInKv = await kv.kvGet('probe.history');
    t('调用历史已持久化到宿主 cap.kv', !!(histInKv && histInKv.calls && histInKv.calls.some((c) => c.tool === 'echo' && c.resultText.includes('真桥冒烟'))));

    const rep = await svcRequest(port, 'POST', '/api/health-check', { serverId: pid }, token);
    t('体检通过且给出清单元数据', rep.json.ok === true && rep.json.reports[0].ok === true && rep.json.reports[0].toolCount === 4, JSON.stringify(rep.json).slice(0, 300));

    const snap = await svcRequest(port, 'POST', '/api/snapshot', { serverId: pid }, token);
    t('拍快照', snap.json.ok === true && snap.json.snapshot.toolCount === 4);
    const diff = await svcRequest(port, 'POST', '/api/diff', { serverId: pid }, token);
    t('对比漂移（基准即当前 → 无漂移）', diff.json.ok === true && diff.json.added.length === 0 && diff.json.removed.length === 0 && diff.json.changed.length === 0, JSON.stringify(diff.json).slice(0, 200));

    // 6) 宿主插件清单（真 cap.mcp）
    const host = await svcRequest(port, 'GET', '/api/host/tools', undefined, token);
    t('cap.mcp list_plugin_tools 经真实宿主返回', host.json.ok === true && Array.isArray(host.json.servers));

    // 7) 清理临时档案
    const del = await svcRequest(port, 'POST', '/api/profiles/delete', { id: pid }, token);
    t('删除临时档案', del.json.ok === true);
  } catch (e) {
    t('冒烟主流程', false, e.stack || e.message);
  } finally {
    await cleanup();
    try { fs.rmSync(path.join(os.tmpdir(), 'mcp-probe-smoke-'), { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }

  // 8) 退出后 probe.meta 应被服务自行删除（幂等收尾）
  const metaAfter = await kv.kvGet('probe.meta').catch(() => null);
  t('服务退出后自删 probe.meta', !metaAfter || !metaAfter.port);

  log(`\n真桥冒烟: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) {
    for (const f of failures) log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  log(`冒烟异常退出: ${e.stack || e.message}`);
  cleanup().then(() => process.exit(1));
});
