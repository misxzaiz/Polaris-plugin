/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 防误伤护栏：真实 kv 已有 keyscan.scan. / find. / latest / history 业务键 → 拒跑
 *   2. 建 fixture 目录（假密钥，形态正确内容虚构）+ 干净对照目录
 *   3. 手动拉起真实服务（node service/main.js 19873 %APPDATA%/Polaris）——服务走自发现真实桥
 *   4. 经真实桥投递扫描命令（cmd 键）→ 等扫描记录 done → 结构断言
 *   5. 掩码不变量断言：扫描相关 kv 值里绝不出现完整假密钥
 *   6. 忽略表闭环：写 ignore 指纹 → 再扫一次 → 该发现被过滤 + 新增计数
 *   7. 拉起真实 mcp/server.js → initialize → tools/list(5) →
 *      tools/call keyscan_scan(fixture) 全闭环 → keyscan_findings 读回
 *   8. 清理：杀服务/MCP + 删光冒烟期间新增的 keyscan.* 键（保留原有） + 删 fixture
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PLUGIN_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ── 真实桥端点（与服务同规则：anchor → config）────────────────────────────
function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', base: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function bridgeDispatch(target, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.base, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
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

async function waitFor(fn, ms, step = 500, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`冒烟超时：${label}`);
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

/** 投递扫描命令并等完成（双路径：快扫描走 result 键，慢扫描走 meta.scanning → 记录） */
async function scanAndWait(root) {
  const n = `smoke${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await kvSet(`keyscan.cmd.scan.${n}`, { root, at: Date.now(), from: 'smoke' });
  const sid = await waitFor(async () => {
    const r = await kvGet(`keyscan.result.${n}`);
    if (r && r.scanId) return r.scanId; // 快路径：服务秒扫完成
    const m = await kvGet('keyscan.meta');
    if (m && m.scanning && m.scanning.nonce === n) return m.scanning.id; // 慢路径
    return null;
  }, 20000, 300, '服务接受命令/拿到 scanId');
  const rec = await waitFor(async () => {
    const r = await kvGet(`keyscan.scan.${sid}`);
    return r && (r.status === 'done' || r.status === 'failed') ? r : null;
  }, 60000, 500, '扫描完成');
  return rec;
}

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 0. 护栏：已有业务键则拒跑（防冒烟毁生产数据）─────────────────────────────
const preKeys = await kvKeys();
const businessKeys = preKeys.filter((k) =>
  k.startsWith('keyscan.scan.') || k.startsWith('keyscan.find.') || k === 'keyscan.latest' || k === 'keyscan.history');
if (businessKeys.length) {
  console.error(`✗ 拒跑：真实 kv 已存在 ${businessKeys.length} 个 keyscan 业务键（生产扫描数据）。先在面板「设置→清空本插件数据」或手动清理后再跑冒烟。`);
  console.error('  键示例：' + businessKeys.slice(0, 5).join(', '));
  process.exit(1);
}
const preMine = preKeys.filter((k) => k.startsWith('keyscan.'));
console.log(`[smoke] 护栏通过：无业务键；既有 keyscan.* 键 ${preMine.length} 个（结束后保留）`);

// ── 1. fixture（假密钥：形态正确、内容虚构；对照目录应零发现）───────────────
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'keyscan-smoke-'));
const CLEAN = fs.mkdtempSync(path.join(os.tmpdir(), 'keyscan-clean-'));
const FAKE = {
  aws: 'AKIAJ7KLPQXNM2RTYB8Z',
  ghp: 'ghp_Zx9Qw3ErTy5uIoP7AzSdXcVbNmMKjHyU1234',
  ant: 'sk-ant-api03-4fJqz8KdNmWpQr2sT9vBx3yLm7Zh5Cc1VbN6MkXoPq2RstUvWx',
  pwd: 'Xk9!mP2$vQ8wZr5T',
  // 拼接构造假 fixture：防 GitHub Push Protection 把测试数据当真泄露拦截（run-tests.mjs 同因）
  ds: ['sk-', '4f1a2b3c', '4d5e6f7890a1b2c3d4e5f678'].join(''),
};
fs.writeFileSync(path.join(FIX, 'config.js'), [
  `// fixture 假密钥，仅冒烟用`,
  `export const awsKey = "${FAKE.aws}";`,
  `export const ghToken = "${FAKE.ghp}";`,
  `export const claudeKey = "${FAKE.ant}";`,
  `export const dbPassword = "${FAKE.pwd}";`,
  `export const dsKey = "${FAKE.ds}";`,
  `export const placeholder = "changeme-below-threshold";`,
  ``,
].join('\n'));
fs.writeFileSync(path.join(FIX, '.env'), `API_TOKEN=zx9Qw3ErTy5uIoP7\nDB_PASSWORD=${FAKE.pwd}9a\nNOT_A_SECRET=hello-world\n`);
fs.mkdirSync(path.join(FIX, 'node_modules'));
fs.writeFileSync(path.join(FIX, 'node_modules', 'leak.js'), `const aws = "${FAKE.aws}";\n`); // 应被跳过
fs.writeFileSync(path.join(CLEAN, 'app.js'), `const x = 1; // 无密钥\n`);

console.log(`[smoke] fixture=${FIX}`);

const appdata = process.env.APPDATA || '';
const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service/main.js'), '19873', path.join(appdata, 'Polaris')], {
  cwd: PLUGIN_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));

let mcp = null;
let mcpBuf = '';
let mcpWaiters = [];
try {
  // ── 2. 服务自发现真实桥并写心跳 ────────────────────────────────────────────
  const meta = await waitFor(async () => {
    const m = await kvGet('keyscan.meta');
    return m && m.pid ? m : null;
  }, 20000, 500, '服务心跳');
  record('服务自发现真实桥并写心跳', true, `pid=${meta.pid} bridge=${meta.bridge} rules=${meta.rules}`);
  record('心跳含规则数', meta.rules >= 20, `${meta.rules} 条`);

  // ── 3. 投递扫描命令 → 扫描记录 done ──────────────────────────────────────
  const rec = await scanAndWait(FIX);
  const scanId = rec.id;
  record('命令被服务接受并完成', rec.status === 'done', `scanId=${scanId} ${rec.error || `${rec.files} 文件 ${rec.durationMs}ms`}`);

  // ── 4. 结构与发现断言 ────────────────────────────────────────────────────
  record('fixture 命中 5+ 发现', (rec.findingCount ?? 0) >= 5, `findingCount=${rec.findingCount}`);
  record('严重度分级计数存在', !!rec.counts && rec.counts.critical >= 3, `C=${rec.counts?.critical} H=${rec.counts?.high} M=${rec.counts?.medium}`);

  let chunk0 = await kvGet(`keyscan.find.${scanId}.0`);
  record('发现分块落 kv', Array.isArray(chunk0) && chunk0.length > 0, `第 0 块 ${Array.isArray(chunk0) ? chunk0.length : 0} 条`);

  const allRules = new Set((chunk0 ?? []).map((f) => f.rule));
  for (const rid of ['aws-access-key', 'github-token', 'anthropic-key', 'env-real-value']) {
    record(`规则命中 ${rid}`, allRules.has(rid));
  }
  record('node_modules 被跳过（文件数=1 源文件+.env）', rec.files === 2, `files=${rec.files}`);

  // ── 5. 掩码不变量（最关键安全断言）：所有 keyscan 值不含完整假密钥 ──────────
  const keysNow = (await kvKeys()).filter((k) => k.startsWith('keyscan.'));
  let leak = '';
  for (const k of keysNow) {
    const raw = JSON.stringify(await kvGet(k)) ?? '';
    for (const secret of Object.values(FAKE)) {
      if (raw.includes(secret)) { leak = `${k} 泄露 ${secret.slice(0, 8)}…`; break; }
    }
    if (leak) break;
  }
  record('掩码不变量：kv 全部 keyscan.* 值不含完整假密钥', !leak, leak || `检查 ${keysNow.length} 键`);
  const previews = (chunk0 ?? []).map((f) => f.preview).join('|');
  record('掩码形态正确（前4后2/星号）', /\…/.test(previews) || /\*/.test(previews), previews.slice(0, 60));

  // ── 6. 对照目录零发现 + 忽略表闭环 ───────────────────────────────────────
  const cleanRec = await scanAndWait(CLEAN);
  record('干净目录零发现', cleanRec.findingCount === 0, `findingCount=${cleanRec.findingCount}`);

  const firstFp = chunk0[0].fp;
  const curIgnore = (await kvGet('keyscan.ignore')) ?? [];
  await kvSet('keyscan.ignore', [...curIgnore, { fp: firstFp, note: 'smoke 误报标记', at: Date.now() }]);
  const rec3 = await scanAndWait(FIX);
  record('忽略表生效（发现数 -1 且 ignoredCount=1）',
    rec3.findingCount === rec.findingCount - 1 && rec3.ignoredCount === 1,
    `${rec.findingCount}→${rec3.findingCount}, ignored=${rec3.ignoredCount}`);
  record('新增计数（复扫同目录应为 0 新增——同基线）', rec3.new?.newCount === 0, `newCount=${rec3.new?.newCount}`);
  // 恢复忽略表（冒烟标记移除）
  await kvSet('keyscan.ignore', curIgnore);

  // ── 7. 真实 MCP 全闭环 ──────────────────────────────────────────────────
  mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp/server.js'), path.join(appdata, 'Polaris')], {
    cwd: PLUGIN_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
  });
  mcp.stderr.on('data', (c) => svcErr.push('[mcp]' + String(c)));
  mcp.stdout.on('data', (c) => {
    mcpBuf += String(c);
    let idx;
    while ((idx = mcpBuf.indexOf('\n')) >= 0) {
      const line = mcpBuf.slice(0, idx).trim();
      mcpBuf = mcpBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        mcpWaiters = mcpWaiters.filter((w) => { if (w.match(msg)) { w.resolve(msg); return false; } return true; });
      } catch (_) { /* 非 JSON 忽略 */ }
    }
  });
  const mcpCall = (payload, matchFn, label, timeout = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = mcpWaiters.indexOf(entry);
      if (i >= 0) mcpWaiters.splice(i, 1);
      reject(new Error(`MCP 超时：${label}`));
    }, timeout);
    const entry = {
      match: matchFn,
      resolve: (msg) => { clearTimeout(timer); resolve(msg); },
    };
    mcpWaiters.push(entry);
    mcp.stdin.write(JSON.stringify(payload) + '\n');
  });

  const init = await mcpCall(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    (m) => m.id === 1, 'initialize', 10000);
  record('MCP initialize', !!init.result?.serverInfo?.name, init.result?.serverInfo?.name);

  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const tl = await mcpCall({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, (m) => m.id === 2, 'tools/list', 10000);
  const names = (tl.result?.tools ?? []).map((t) => t.name);
  record('MCP tools/list 5 工具',
    names.length === 5 && ['keyscan_scan', 'keyscan_findings', 'keyscan_status', 'keyscan_ignore', 'keyscan_rules'].every((n) => names.includes(n)),
    names.join(','));

  const scanCall = await mcpCall(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'keyscan_scan', arguments: { path: CLEAN } } },
    (m) => m.id === 3, 'tools/call keyscan_scan', 120000);
  const scanText = scanCall.result?.content?.[0]?.text ?? '';
  record('MCP keyscan_scan 对照目录 → 零发现文案', scanCall.result?.isError !== true && scanText.includes('0 处'), scanText.split('\n')[0]?.slice(0, 80));

  const findCall = await mcpCall(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'keyscan_findings', arguments: { scanId, severity: 'critical', limit: 5 } } },
    (m) => m.id === 4, 'tools/call keyscan_findings', 20000);
  const findText = findCall.result?.content?.[0]?.text ?? '';
  record('MCP keyscan_findings 读回发现（掩码形态）',
    findCall.result?.isError !== true && /🔴/.test(findText) && !findText.includes('该扫描没有发现'),
    findText.split('\n')[0]?.slice(0, 80));
  const mcpLeak = Object.values(FAKE).some((s) => findText.includes(s));
  record('MCP 返回不含完整假密钥', !mcpLeak);

  const stCall = await mcpCall(
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'keyscan_status', arguments: {} } },
    (m) => m.id === 5, 'tools/call keyscan_status', 15000);
  record('MCP keyscan_status 心跳+最近扫描', (stCall.result?.content?.[0]?.text ?? '').includes('最近扫描'));

  // ── 8. 清理 ─────────────────────────────────────────────────────────────
} catch (e) {
  record('冒烟流程异常', false, String(e && e.message));
  if (svcErr.length) console.error('[svc/mcp stderr 尾部]\n' + svcErr.slice(-12).join(''));
} finally {
  try { if (mcp && mcp.pid && alive(mcp.pid)) mcp.kill(); } catch (_) {}
  try { if (svc && svc.pid && alive(svc.pid)) svc.kill(); } catch (_) {}
  // 删光冒烟新增的 keyscan.* 键（保留冒烟前已存在的）
  try {
    const keysNow = await kvKeys();
    const mine = keysNow.filter((k) => k.startsWith('keyscan.') && !preMine.includes(k));
    for (const k of mine) await kvDel(k);
    console.log(`[smoke] 清理 ${mine.length} 个冒烟键；保留原有 ${preMine.length} 个`);
  } catch (e) { console.error('[smoke] 清理失败:', e.message); }
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(CLEAN, { recursive: true, force: true }); } catch (_) {}
}

const bad = results.filter((r) => !r.pass);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
