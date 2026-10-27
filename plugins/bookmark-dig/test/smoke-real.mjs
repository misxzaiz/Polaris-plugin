/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor → config web.port 可达）+ 有外网。
 * 护栏：真实 kv 已有 bmd.rec.* / bmd.run / bmd.report.* 生产数据时拒跑。
 * 流程：
 *   1. 自发现真实桥；护栏检查
 *   2. spawn 真实服务（无 env 注入）→ 心跳
 *   3. 经真实桥写 import 命令（真实外网 example.com + .invalid DNS 死链 +
 *      127.0.0.1 SSRF 拒检 + 同 normKey 重复），服务自动合并并起体检运行
 *   4. 等运行完成 → 校验状态分布（ok/redirect、dns、blocked）
 *   5. spawn 真实 MCP → tools/list(8) → dig_stats/dig_search/dig_resurface
 *      → dig_remove 守卫（无 confirm 拒）→ dig_remove 真删 → dig_tag
 *   6. finally：杀进程 + 清光全部 bmd.* 键 + N/N 报告
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PREFIX = 'bmd.';

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
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
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

async function readRecords() {
  const keys = await kvKeys();
  const nums = keys.filter((k) => k.startsWith('bmd.rec.')).map((k) => Number(k.slice(8))).sort((a, b) => a - b);
  const out = [];
  for (const n of nums) {
    const arr = await kvGet(`bmd.rec.${n}`);
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 护栏 ────────────────────────────────────────────────────────────────────
const preKeys = await kvKeys();
const business = preKeys.filter((k) => k.startsWith(PREFIX) && !k.startsWith('bmd.smoke.'));
if (business.length > 0) {
  console.error(`[smoke] 检测到 ${business.length} 个生产业务键（如 ${business[0]}），拒绝运行以防误伤。`);
  process.exit(2);
}

// ── spawn 真实服务 ──────────────────────────────────────────────────────────
const appdata = process.env.APPDATA || '';
const svcPort = 20870 + Math.floor(Math.random() * 400);
const svc = spawn(process.execPath, [path.join(APP_ROOT, 'service/dig.js'), String(svcPort), path.join(appdata, 'Polaris')], {
  cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
});
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));

try {
  await waitFor(async () => (await kvGet('bmd.meta'))?.lastTickAt, 20000, 500, '服务心跳（真实桥）');
  const meta = await kvGet('bmd.meta');
  record('服务自发现真实桥并写入心跳', true, `桥=${meta.bridge}`);

  // ── 经真实桥导入（import 分批命令 → 服务合并 → 自动体检）──────────────────
  await kvSet('bmd.cmd.import.0', {
    records: [
      { url: 'https://example.com/', title: '冒烟-存活', folder: '冒烟', addedAt: 1600000000000 },
      { url: 'https://example.com/?utm_source=smoke&fbclid=x', title: '冒烟-重复（规范化后同 normKey）', folder: '冒烟', addedAt: 1500000000000 },
      { url: 'https://nonexistent-bmd-smoke.invalid/', title: '冒烟-DNS死链', folder: '冒烟', addedAt: 1600000000000 },
      { url: 'http://127.0.0.1:9/private', title: '冒烟-内网拒检', folder: '冒烟', addedAt: 1600000000000 },
    ],
    totalBatches: 1, at: Date.now(),
  });
  record('import 命令已写入真实 kv（含同 normKey 重复 1 条）', true);

  // 等合并：重复归并后应为 3 条
  await waitFor(async () => (await readRecords()).length >= 3, 20000, 500, '服务合并导入');
  const merged = await readRecords();
  const dupMerged = merged.filter((r) => r.normKey === 'https://example.com/');
  record('URL 规范化去重（utm 参数归并）', merged.length === 3 && dupMerged.length === 1,
    `3 条实际=${merged.length}；example 重复归并=${dupMerged.length}`);
  const example = dupMerged[0];
  record('幂等合并保最早 addedAt + 长标题', example && example.addedAt === 1500000000000 && example.title.includes('重复'), `addedAt=${example?.addedAt} title=${example?.title}`);

  // 等自动体检运行完成（bmd.run 消失 + 报告存在）
  await waitFor(async () => {
    const run = await kvGet('bmd.run');
    return !run && (await kvKeys()).some((k) => k.startsWith('bmd.report.'));
  }, 90000, 1000, '自动体检运行完成');

  const checked = await readRecords();
  const byNorm = new Map(checked.map((r) => [r.normKey, r]));
  const stOk = byNorm.get('https://example.com/');
  const stDns = byNorm.get('https://nonexistent-bmd-smoke.invalid/');
  const stBlocked = byNorm.get('http://127.0.0.1:9/private');
  record('真实外网体检 example.com 存活', stOk && (stOk.status === 'ok' || stOk.status === 'redirect'),
    `status=${stOk?.status} http=${stOk?.httpStatus} ${stOk?.latencyMs}ms`);
  record('DNS 失效判定（.invalid）', stDns && stDns.status === 'dns', `status=${stDns?.status} ${stDns?.failReason}`);
  record('SSRF 守卫拒内网（127.0.0.1）', stBlocked && stBlocked.status === 'blocked', `status=${stBlocked?.status}`);

  const report = await kvGet((await kvKeys()).find((k) => k.startsWith('bmd.report.')));
  record('运行报告落盘', !!report && report.checked === 3, `checked=${report?.checked} byStatus=${JSON.stringify(report?.byStatus || {})}`);

  // ── 真实 MCP 全闭环 ──────────────────────────────────────────────────────
  const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), path.join(appdata, 'Polaris')], {
    cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
  });
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
  const call = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args });
    return { text: r.result?.content?.[0]?.text ?? '', isError: r.result?.isError === true };
  };

  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lst = await rpc('tools/list', {});
  const names = (lst.result.tools || []).map((t) => t.name);
  record('MCP tools/list（8 工具）', names.length === 8, names.join(', '));

  const stats = await call('dig_stats', {});
  record('dig_stats 读到真实库', !stats.isError && /共 3 条/.test(stats.text), stats.text.split('\n')[0]);

  const dead = await call('dig_dead', {});
  record('dig_dead 列出死链（dns+blocked）', !dead.isError && /nonexistent-bmd-smoke\.invalid/.test(dead.text), dead.text.split('\n')[0]);

  const resurface = await call('dig_resurface', {});
  record('dig_resurface 捞活书签', !resurface.isError && /今天挖出/.test(resurface.text), resurface.text.split('\n')[0]);

  const noConfirm = await call('dig_remove', { ids: ['x'] });
  record('dig_remove 守卫：无 confirm 拒绝', noConfirm.isError && /confirm/.test(noConfirm.text));

  const dnsRec = checked.find((r) => r.normKey === 'https://nonexistent-bmd-smoke.invalid/');
  const removed = await call('dig_remove', { ids: [dnsRec.id], confirm: true });
  record('dig_remove 真删（confirm:true）', !removed.isError && /已删除 1 条/.test(removed.text), removed.text);
  const afterRemove = await readRecords();
  record('删除生效（3→2）', afterRemove.length === 2, `now=${afterRemove.length}`);

  const tagged = await call('dig_tag', { ids: [afterRemove[0].id], tags: ['冒烟', 'AI整理'] });
  record('dig_tag 打标签', !tagged.isError && /已给 1 条/.test(tagged.text), tagged.text);
  mcp.kill();

  console.log('[smoke] 冒烟项全部执行完毕，开始清理…');
} catch (e) {
  record('流程', false, e.message);
  console.error('服务日志尾部：', svcErr.join('').slice(-1500));
} finally {
  svc.kill();
  await new Promise((r) => setTimeout(r, 1000));
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith(PREFIX));
  await Promise.all(mine.map((k) => kvDel(k)));
  console.log(`[smoke] 已清理 ${mine.length} 个 bmd.* 键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
