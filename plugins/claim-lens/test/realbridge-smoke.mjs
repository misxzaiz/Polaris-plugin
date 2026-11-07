/**
 * realbridge-smoke.mjs —— 真宿主桥冒烟（CLAIM_REAL=1 门控；默认 npm test 不跑）
 * 链路：① kvclient 端点自发现 → 真宿主 ② 服务自写 claim-lens.meta 到真 cap.kv ③
 *       用 meta 的 token/port 调 /api/verify 核验真实仓库 ④ MCP claim_verify 真仓 ⑤ 清理 kv 键。
 * 不污染纪律：只写 claim-lens.* 域键（本插件自有域），结束删除。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const serviceJs = path.join(here, '../service/main.js');
const mcpJs = path.join(here, '../mcp/server.js');

const REAL_ROOT = process.env.CLAIM_REAL_ROOT || 'D:\\space\\base\\Polaris-plugin';
if (!existsSync(REAL_ROOT)) { console.error(`真仓不存在: ${REAL_ROOT}`); process.exit(1); }

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
};

// ── 发现真宿主（复刻 kvclient 发现链的简化版：anchor → config → 兜底 9829）──
function findHost() {
  const cands = [];
  const anchorPaths = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
  ].filter(Boolean);
  for (const ap of anchorPaths) {
    try {
      const a = JSON.parse(readFileSync(ap, 'utf8'));
      if (a && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* skip */ }
  }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  for (const c of cands) {
    try {
      const cfg = JSON.parse(readFileSync(c, 'utf8'));
      if (cfg.web && cfg.web.port && cfg.web.token) return { port: cfg.web.port, token: cfg.web.token };
    } catch (_) { /* skip */ }
  }
  return null;
}

const host = findHost();
check('发现真宿主配置（anchor/config）', !!host, '未找到含 web.token 的 config.json');
if (!host) process.exit(1);

async function kvDispatch(payload) {
  const res = await fetch(`http://127.0.0.1:${host.port}/api/router-dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crypto.createHash('md5').update(host.token).digest('hex')}` },
    body: JSON.stringify({ req: { target: 'cap.kv', payload } }),
  });
  return res.json();
}

const cfgDir = mkdtempSync(path.join(tmpdir(), 'claim-lens-real-'));
const child = spawn('node', [serviceJs, '0', cfgDir], { stdio: ['ignore', 'ignore', 'pipe'] });
child.stderr.on('data', (c) => { if (process.env.CLAIM_REAL_DEBUG) process.stderr.write(`[svc] ${c}`); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ① 服务起 → kvclient 自发现真宿主 → 自写 meta
  let meta = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const r = await kvDispatch({ action: 'get', key: 'claim-lens.meta' });
      const v = r && r.result && r.result.value !== undefined ? r.result.value : (r && r.result);
      if (v && typeof v === 'object' && v.port && v.token) { meta = v; break; }
    } catch (_) { /* retry */ }
  }
  check('服务自写 claim-lens.meta 到真 cap.kv（kvclient 发现链 OK）', !!meta, '10s 内 meta 未出现');

  if (meta) {
    // ② 用 meta token 走面板同款链路：HTTP /api/verify 对真实仓库
    const sample = '核验台自己刚交付：入口 `service/main-src.js` 的 `handleVerifyBatch()` 已实现；依赖 `zod` 已安装；`git switch --orphan tmp-x` 可用；config 键 `name` 在根 `package.json`。';
    const res = await fetch(`http://127.0.0.1:${meta.port}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-claim-lens-token': meta.token },
      body: JSON.stringify({ text: sample, root: REAL_ROOT }),
    });
    const data = await res.json();
    check('真桥 /api/verify 对真实仓库出报告', res.ok && data.ok && data.report && data.report.summary.total >= 3, JSON.stringify(data).slice(0, 200));
    if (data.report) {
      const byTarget = Object.fromEntries(data.report.claims.map((c) => [c.target, c.verdict]));
      check('真实仓库：main-src.js 存在性证实', byTarget['service/main-src.js'] === 'verified', JSON.stringify(byTarget));
      check('真实仓库：幽灵依赖 zod 证伪（未声明未安装）', byTarget['zod'] === 'refuted', JSON.stringify(byTarget));
      check('真实仓库：git switch --orphan 真探测证实', byTarget['git'] === 'verified', JSON.stringify(byTarget));
      console.log(`  汇总: ${JSON.stringify(data.report.summary)} @ ${data.report.root}`);
    }
  }

  // ③ MCP claim_verify 真仓
  const mc = spawn('node', [mcpJs], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const pending = new Map();
  let nextId = 1;
  mc.stdout.setEncoding('utf8');
  mc.stdout.on('data', (c) => {
    buf += c;
    for (;;) {
      const i = buf.indexOf('\n');
      if (i === -1) break;
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p(msg); }
    }
  });
  const rpc = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    mc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({}); } }, 60000);
  });
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  mc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const call = await rpc('tools/call', {
    name: 'claim_verify',
    arguments: { text: '`scripts/pack.js` 是打包脚本；依赖 `esbuild` 已在插件 devDeps；`git worktree list` 支持', root: REAL_ROOT },
  });
  const text = call.result && call.result.content && call.result.content[0] && call.result.content[0].text || '';
  check('MCP claim_verify 真仓：pack.js 证实', text.includes('pack.js') && text.includes('✓ 已证实'), text.slice(0, 200));
  mc.kill();
} catch (e) {
  failures++;
  console.error('✗ 异常:', e);
} finally {
  child.kill();
  // 清理本插件域 kv 键（正式安装后服务会重写 meta）
  try { await kvDispatch({ action: 'delete', key: 'claim-lens.meta' }); } catch (_) { /* best-effort */ }
  try { await kvDispatch({ action: 'delete', key: 'claim-lens.settings' }); } catch (_) { /* best-effort */ }
  try { rmSync(cfgDir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

console.log(failures === 0 ? '\n真桥冒烟通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
