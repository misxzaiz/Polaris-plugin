/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 防误伤护栏：真实 kv 已有 ocr-bench.* 业务键 → 拒跑（避免覆盖真实数据）
 *   2. 手动拉起真实服务（node service/main.js <port> <dataRoot>）——自发现真实桥
 *   3. 断言 meta 落真实 kv（token/port/版本）
 *   4. 真实识别一次夹具（中英 PNG + 文字版 PDF）→ 报告落真实 kv → 文本断言
 *   5. MCP 全链路：真实 mcp/server.js → initialize → tools/list(6) →
 *      ocr_scan 经真实 kv 信箱 → 回执文本断言
 *   6. 瘦身不变量：kv 报告单文件 textHead ≤16KB
 *   7. 清理：杀服务/MCP + 删光 ocr-bench.* 键（全绿自清理）
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]test$/, '');
const FIX = path.join(PLUGIN_ROOT, 'test', 'fixtures');
const KPREFIX = 'ocr-bench.';

function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '', appConfigDir: anchor.dataRoot };
}
let EP;
try { EP = loadEndpoint(); } catch (e) {
  console.error(`⚠ 宿主不在线（读取 anchor/config 失败：${e.message}）——真桥冒烟明确跳过，其余四层（离线单测/引擎产物级/SSR 渲染/假桥集成/MCP 协议）已全绿。`);
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
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); if (!r.ok) throw new Error('kv list: ' + r.error); return r.result?.keys ?? []; }

async function waitFor(fn, ms, step = 600, label = '') {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (_) { /* 重试 */ }
    if (Date.now() - t0 > ms) throw new Error(`等待超时：${label}`);
    await new Promise((r) => setTimeout(r, step));
  }
}

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); console.log(`  ✗ ${name}: ${e.message}`); }
};

// 1. 防误伤：真实 kv 已有业务键 → 拒跑
const existing = (await kvKeys()).filter((k) => k.startsWith(KPREFIX));
if (existing.length) {
  console.error(`⚠ 真实 kv 已存在 ${existing.length} 个 ocr-bench.* 键（插件可能正在使用）——为不覆盖真实数据拒跑。`);
  process.exit(1);
}

const svcPort = 19883;
const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(svcPort), EP.appConfigDir], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let svcLog = '';
svc.stderr.on('data', (c) => { svcLog += String(c); });

function svcHttp(method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (token) headers['X-OcrBench-Token'] = token;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ hostname: '127.0.0.1', port: svcPort, path: apiPath, method, headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let mcp = null;
try {
  await t('meta 落真实 kv：token/port/版本一致', async () => {
    const meta = await waitFor(() => kvGet('ocr-bench.meta'), 20000, 800, 'meta 心跳');
    assert.ok(meta && meta.token && meta.port === svcPort, JSON.stringify(meta).slice(0, 120));
    assert.ok(meta.version);
  });

  const meta = await kvGet('ocr-bench.meta');

  await t('真实识别：中英 PNG + 文字版 PDF → 报告落真实 kv', async () => {
    const start = await svcHttp('POST', '/api/op', meta.token, {
      action: 'start',
      payload: { paths: [path.join(FIX, 'fixture-zh.png'), path.join(FIX, 'native-text.pdf')], langs: ['chi_sim', 'eng'] },
    });
    assert.equal(start.json.ok, true, start.json.error);
    const runId = start.json.runId;
    let report = null;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const live = await svcHttp('GET', '/api/live', meta.token);
      if (!live.json.running) {
        const rep = await svcHttp('POST', '/api/op', meta.token, { action: 'report', payload: { runId } });
        report = rep.json.report;
        break;
      }
    }
    assert.ok(report, '90s 内未完成');
    assert.equal(report.summary.okFiles, 2, report.summary.oneLine);
    const kvRep = await kvGet(`ocr-bench.report.${runId}`);
    assert.ok(kvRep, '报告应落真实 kv');
    const png = report.files.find((f) => f.path.endsWith('fixture-zh.png'));
    assert.ok(png.textHead.includes('检验报告单'), png.textHead.slice(0, 60));
    const nat = report.files.find((f) => f.path.endsWith('native-text.pdf'));
    assert.equal(nat.pages[0].mode, 'native');
    await kvDel(`ocr-bench.report.${runId}`); // 断言完即删，保持自清理纪律
  });

  await t('瘦身不变量：kv 报告单文件 textHead ≤16KB', async () => {
    const start = await svcHttp('POST', '/api/op', meta.token, {
      action: 'start',
      payload: { paths: [path.join(FIX, 'fixture-zh.png')], langs: ['chi_sim', 'eng'] },
    });
    assert.equal(start.json.ok, true);
    const runId = start.json.runId;
    await waitFor(async () => !(await svcHttp('GET', '/api/live', meta.token)).json.running, 60000, 1000, '任务完成');
    const rep = await kvGet(`ocr-bench.report.${runId}`);
    assert.ok(rep);
    for (const f of rep.files) assert.ok(f.textHead.length <= 16 * 1024, `textHead ${f.textHead.length}B 超限`);
    await kvDel(`ocr-bench.report.${runId}`);
  });

  await t('MCP 真子进程全链路：initialize → tools/list → ocr_scan 真识别', async () => {
    mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), EP.appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const nextLine = (filter, ms) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      const onData = (c) => {
        buf += c;
        for (;;) {
          const i = buf.indexOf('\n');
          if (i === -1) break;
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (!filter || filter(msg)) { mcp.stdout.off('data', onData); return resolve(msg); }
          } catch { /* 忽略 */ }
        }
      };
      mcp.stdout.setEncoding('utf8');
      mcp.stdout.on('data', onData);
      setTimeout(() => { mcp.stdout.off('data', onData); reject(new Error('MCP 响应超时')); }, ms || 20000);
    });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    const init = await nextLine((m) => m.id === 1);
    assert.equal(init.result.serverInfo.name, 'ocr-bench');
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    const list = await nextLine((m) => m.id === 2);
    assert.equal(list.result.tools.length, 6);
    // 真识别（经真实 kv 信箱）
    mcp.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'ocr_scan', arguments: { paths: [path.join(FIX, 'fixture-zh.png')] } },
    }) + '\n');
    const call = await nextLine((m) => m.id === 3, 150000);
    const text = call.result.content.map((c) => c.text || '').join('\n');
    assert.equal(call.result.isError, false, text.slice(0, 200));
    assert.ok(text.includes('检验报告单'), text.slice(0, 200));
    assert.match(text, /识别完成/);
  });
} catch (e) {
  results.push({ name: 'fatal', pass: false, detail: e.message });
  console.log(`  ✗ fatal: ${e.message}`);
} finally {
  svc.kill();
  if (mcp) mcp.kill();
}

// 清理：删光本插件前缀键（防误伤护栏保证进来时没有，全删即净）
try {
  const keys = (await kvKeys()).filter((k) => k.startsWith(KPREFIX));
  for (const k of keys) await kvDel(k);
  console.log(`清理：已删除 ${keys.length} 个 ocr-bench.* 键`);
} catch (e) {
  console.error(`清理失败（遗留键需手动删）：${e.message}`);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;
console.log(`\n真桥冒烟：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('[服务日志尾部]\n' + svcLog.split('\n').slice(-25).join('\n'));
  process.exit(1);
}
