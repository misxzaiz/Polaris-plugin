/**
 * 数据方舟真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 防护：cap.kv 已存在 dataark.* 键（真实数据）时拒绝执行。
 * 安全：服务对数据根只读；备份库指向临时目录，跑完删除。
 *
 * 流程：
 *   1. 写设置（schedule=off + targetDir=临时目录）到真实 kv
 *   2. 拉起真实服务（无 env 注入，anchor→config 自发现真实桥）
 *   3. /__health：role=leader、dataRoot 正确
 *   4. cmd.backup → 等首份快照落地（kv 索引 + 磁盘 manifest + objects）
 *   5. 抽查完整性：config.json 的 sha256 与活文件一致（gunzip 对比）
 *   6. cmd.backup 第二份 → 增量（baseId 存在、复用占多数）
 *   7. 真实 MCP（无 env 自发现）：tools/list 7 个 → list_snapshots → list_files
 *      → restore 单文件 → 暂存文件与活文件逐字节比对 → settings/verify quick
 *   8. 清理：杀服务/MCP + 删全部 dataark.* 键 + 删临时备份库
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import url from 'node:url';
import { pipeline } from 'node:stream/promises';

const APP_ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));

function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '', dataRoot: anchor.dataRoot };
}
const EP = loadEndpoint();
const APPDATA_POLARIS = path.join(process.env.APPDATA || '', 'Polaris');
const TMP_LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'data-ark-smoke-'));
const TMP_CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'data-ark-cfg-'));
const SERVICE_PORT = 19871;

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function bridgeDispatch(target, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { reject(new Error(`bridge 响应非 JSON：${b.slice(0, 120)}`)); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); if (!r.ok) throw new Error('kv list: ' + r.error); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

async function waitFor(fn, ms, step = 800, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`冒烟超时：${label}`);
}

function httpGet(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: p, timeout: 3000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const gunzipTo = async (gz, dest) => { await pipeline(fs.createReadStream(gz), zlib.createGunzip(), fs.createWriteStream(dest)); };

// ── 真实 MCP ───────────────────────────────────────────────────────────────
function spawnMcp() {
  const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), TMP_CFG], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  const mcpErr = [];
  mcp.stderr.on('data', (c) => mcpErr.push(String(c)));
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
      let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p(msg); }
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 300000);
    pending.set(id, (m) => { clearTimeout(t); resolve(m); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args || {} });
    return { text: r.result?.content?.[0]?.text || '', isError: !!r.result?.isError };
  };
  return { mcp, mcpErr, rpc, call };
}

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

let svc = null;
const svcErr = [];
let mcpHandle = null;

try {
  // ── 0. 防护 ──────────────────────────────────────────────────────────────
  const preKeys = (await kvKeys()).filter((k) => k.startsWith('dataark.'));
  if (preKeys.length > 0) {
    console.error(`[smoke] 检测到 ${preKeys.length} 个 dataark.* 键（疑似真实数据），拒绝执行：\n${preKeys.slice(0, 10).join('\n')}`);
    process.exit(1);
  }

  // ── 1. 设置（临时库 + 手动模式）─────────────────────────────────────────
  await kvSet('dataark.settings', {
    schemaVersion: 1, targetDir: TMP_LIB, excludeTop: ['logs', 'cache', 'plugins'],
    extraExcludeGlobs: [], retention: { daily: 7, weekly: 5, monthly: 3 },
    schedule: { mode: 'off', intervalHours: 12, at: '03:30' }, maxStoreBytes: 8 * 1024 * 1024 * 1024,
  });
  console.log(`[smoke] 设置已写：targetDir=${TMP_LIB}（真实数据根 ${EP.dataRoot} 只读）`);

  // ── 2. 服务 ─────────────────────────────────────────────────────────────
  svc = spawn(process.execPath, [path.join(APP_ROOT, 'service/ark.js'), String(SERVICE_PORT), TMP_CFG], { cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  svc.stderr.on('data', (c) => svcErr.push(String(c)));

  // ── 3. 健康端点 ─────────────────────────────────────────────────────────
  const health = await waitFor(async () => {
    try {
      const r = await httpGet(SERVICE_PORT, '/__health');
      return r.status === 200 ? JSON.parse(r.body) : null;
    } catch (_) { return null; }
  }, 30000, 500, '服务健康端点');
  record('服务自发现真实桥并暴露健康端点', health.role === 'leader' && health.dataRoot === EP.dataRoot,
    `role=${health.role} dataRoot=${health.dataRoot}`);

  // ── 4. 首份快照 ─────────────────────────────────────────────────────────
  console.log('[smoke] 触发首份快照（真实数据根只读，gzip level 1，预计 0.5-3 分钟）…');
  await kvSet('dataark.cmd.backup', { op: 'backup', at: Date.now() });
  const snap1 = await waitFor(async () => {
    const st = await kvGet('dataark.state');
    return st?.lastResult?.ok ? st : null;
  }, 300000, 2000, '首份快照完成');
  const s1 = snap1.lastResult.summary;
  const manifestPath = path.join(TMP_LIB, 'snapshots', `${snap1.lastSnapshotId}.manifest.json`);
  const manifest1 = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  record('首份快照落地（索引+磁盘 manifest+对象）',
    manifest1.files.length === s1.totalFiles && s1.totalFiles > 100 && manifest1.baseId === null,
    `${s1.totalFiles} 文件 / 逻辑 ${s1.logicalBytes} → 新对象 ${s1.newObjects}（${s1.storedBytes}B）· ${s1.durationMs}ms`);
  const skipped1 = manifest1.skipped || [];
  if (skipped1.length) console.log(`[smoke] 热文件跳过 ${skipped1.length} 个（预期内）：${skipped1.slice(0, 3).map((x) => x.p).join('、')}`);

  // ── 5. 抽查完整性：config.json 哈希与活文件一致 ─────────────────────────
  const cfgEntry = manifest1.files.find((f) => f.p === 'config.json');
  if (cfgEntry) {
    const liveHash = sha256File(path.join(EP.dataRoot, 'config.json'));
    const tmpOut = path.join(TMP_CFG, 'spotcheck.bin');
    await gunzipTo(path.join(TMP_LIB, 'objects', cfgEntry.h.slice(0, 2), `${cfgEntry.h}.gz`), tmpOut);
    const objHash = sha256File(tmpOut);
    fs.unlinkSync(tmpOut);
    record('抽查 config.json：快照对象 gunzip 后 sha256 == 活文件', liveHash === objHash && objHash === cfgEntry.h,
      `${cfgEntry.h.slice(0, 12)}…`);
  } else {
    record('抽查 config.json：快照对象 gunzip 后 sha256 == 活文件', false, 'manifest 里没有 config.json');
  }

  // ── 6. 第二份快照 → 增量 ────────────────────────────────────────────────
  await kvSet('dataark.cmd.backup', { op: 'backup', at: Date.now() });
  const snap2 = await waitFor(async () => {
    const st = await kvGet('dataark.state');
    return st?.lastSnapshotId && st.lastSnapshotId !== snap1.lastSnapshotId && st.lastResult?.ok ? st : null;
  }, 180000, 2000, '第二份快照完成');
  const manifestPath2 = path.join(TMP_LIB, 'snapshots', `${snap2.lastSnapshotId}.manifest.json`);
  const manifest2 = JSON.parse(fs.readFileSync(manifestPath2, 'utf8'));
  const unchanged = manifest2.files.filter((f) => f.c === 0).length;
  const rehashed = manifest2.files.filter((f) => f.c === 1).length;
  record('第二份快照为增量且复用占优',
    manifest2.baseId === snap1.lastSnapshotId && unchanged > rehashed,
    `基于 ${manifest2.baseId} · 未变 ${unchanged} / 重哈希 ${rehashed} · 新对象 ${manifest2.stats.newObjects}`);

  // ── 7. 真实 MCP 全链路 ──────────────────────────────────────────────────
  mcpHandle = spawnMcp();
  await mcpHandle.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcpHandle.mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lst = await mcpHandle.rpc('tools/list', {});
  record('MCP 自发现真实桥，tools/list 7 个工具', lst.result.tools.length === 7, lst.result.tools.map((t) => t.name).join(', '));

  const ls = await mcpHandle.call('ark_list_snapshots', {});
  record('ark_list_snapshots 读到两份快照', !ls.isError && /全量/.test(ls.text) && /增量/.test(ls.text), ls.text.split('\n')[0]);

  const lf = await mcpHandle.call('ark_list_files', { query: 'config.json' });
  record('ark_list_files 检索到 config.json', !lf.isError && /config\.json/.test(lf.text), lf.text.split('\n')[0]);

  const rs = await mcpHandle.call('ark_restore', { paths: ['config.json'] });
  // MCP 返回第二行是暂存目录绝对路径（Windows 反斜杠原样输出）
  const lines = rs.text.split('\n').map((l) => l.trim());
  const stagingAbs = !rs.isError && lines.length > 1 && /[\\/]restored[\\/]/.test(lines[1]) ? lines[1] : '';
  let byteEqual = false;
  if (stagingAbs && fs.existsSync(path.join(stagingAbs, 'config.json'))) {
    byteEqual = fs.readFileSync(path.join(stagingAbs, 'config.json')).equals(fs.readFileSync(path.join(EP.dataRoot, 'config.json')));
  }
  record('ark_restore：单文件恢复到暂存目录且与活文件逐字节一致',
    !rs.isError && /已恢复 1 个文件/.test(rs.text) && byteEqual, stagingAbs || rs.text.split('\n')[0]);

  const st2 = await mcpHandle.call('ark_status', {});
  record('ark_status 汇总（上次备份/库占用）', !st2.isError && /上次备份/.test(st2.text) && /备份库/.test(st2.text), st2.text.split('\n')[0]);

  const ver = await mcpHandle.call('ark_verify', { mode: 'quick' });
  record('ark_verify quick 已触发', !ver.isError, ver.text.split('\n')[0]);
  const verResult = await waitFor(async () => {
    const st = await kvGet('dataark.state');
    return st?.lastVerify ? st.lastVerify : null;
  }, 120000, 1500, 'quick 校验结果');
  record('quick 校验通过（对象齐全）', verResult.ok === true && verResult.checked === manifest2.files.length,
    `checked=${verResult.checked} missing=${verResult.missing?.length || 0}`);

  // ── 8. 清理 ─────────────────────────────────────────────────────────────
  console.log('[smoke] 冒烟项全部执行完毕，开始清理…');
} catch (e) {
  record('流程', false, e.message);
  console.error('服务 stderr 尾部：', svcErr.join('').slice(-1500));
  if (mcpHandle) console.error('MCP stderr 尾部：', mcpHandle.mcpErr.join('').slice(-800));
} finally {
  try { svc?.kill(); } catch (_) { /* 尽力 */ }
  try { mcpHandle?.mcp.kill(); } catch (_) { /* 尽力 */ }
  await new Promise((r) => setTimeout(r, 800));
  try {
    const keys = await kvKeys();
    const mine = keys.filter((k) => k.startsWith('dataark.'));
    await Promise.all(mine.map((k) => kvDel(k)));
    console.log(`[smoke] 已清理 ${mine.length} 个 dataark.* 键`);
  } catch (e) {
    console.error('[smoke] kv 清理失败（可手动删 dataark.* 键）：', e.message);
  }
  try { fs.rmSync(TMP_LIB, { recursive: true, force: true }); fs.rmSync(TMP_CFG, { recursive: true, force: true }); } catch (_) { /* 尽力 */ }
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
