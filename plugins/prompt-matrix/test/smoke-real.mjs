/**
 * 真桥冒烟（真实宿主 kv + 真实模型档案 + MCP 真子进程）：
 * node test/smoke-real.mjs
 *
 * 前置：Polaris 宿主正在运行（9829 /api/health 可达）。全部通过则 5/5；
 * 宿主不可达时明确跳过（不算失败）。冒烟产生的小矩阵（2 格 + judge ≤2 格，
 * max_tokens=16）会用真实档案产生少量真实 token 消费。
 * 自清理：测试数据集/测试 run 投影/runs 索引条目/history 条目/结果文件全部还原。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createKvClient, loadWebConfig } = require('../service/kvclient.js');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: String(e.message || e).slice(0, 300) }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

// ── 宿主探测（不可达则整体跳过）──────────────────────────────────────────────
function anchorDataRoot() {
  for (const p of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (a && a.dataRoot) return a.dataRoot;
    } catch (_) { /* 下一个 */ }
  }
  return '';
}
const dataRoot = anchorDataRoot();
const webCfg = loadWebConfig(dataRoot);
if (!webCfg || !webCfg.port) {
  console.log('⚠ 未找到宿主 web 配置（anchor.json/dataRoot）——真桥冒烟跳过，不算失败。');
  process.exit(0);
}
const hostUp = await new Promise((resolve) => {
  const req = http.get({ hostname: '127.0.0.1', port: webCfg.port, path: '/api/health', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});
if (!hostUp) {
  console.log(`⚠ 宿主 127.0.0.1:${webCfg.port} /api/health 不可达——宿主未运行，真桥冒烟跳过，不算失败。`);
  process.exit(0);
}

// 真桥 kv 客户端
const kv = createKvClient({ appConfigDir: dataRoot, log: () => {} });

let svc = null;
const svcLog = [];
let nonceSeq = 0;
async function cmd(action, payload, waitMs = 30000) {
  const nonce = `s${Date.now().toString(36)}-${++nonceSeq}`;
  await kv.kvSet('pmtx.cmd', { nonce, action, payload, at: new Date().toISOString() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(900);
    const res = await kv.kvGet('pmtx.res').catch(() => null);
    if (res && res.nonce === nonce) { await kv.kvDel('pmtx.res').catch(() => {}); return res.result; }
  }
  throw new Error(`命令超时：${action}`);
}

/** 冒烟痕迹清理：runs 索引/投影/history/文件还原 */
async function cleanup(runId, datasetId) {
  try {
    if (datasetId) {
      await kv.kvDel(`pmtx.dataset.${datasetId}`).catch(() => {});
      const list = await kv.kvGet('pmtx.datasets').catch(() => []);
      if (Array.isArray(list)) {
        const next = list.filter((x) => x.id !== datasetId);
        await kv.kvSet('pmtx.datasets', next);
      }
    }
    if (runId) {
      await kv.kvDel(`pmtx.run.${runId}`).catch(() => {});
      const runs = await kv.kvGet('pmtx.runs').catch(() => []);
      if (Array.isArray(runs)) await kv.kvSet('pmtx.runs', runs.filter((x) => x !== runId));
      const h = await kv.kvGet('pmtx.history').catch(() => []);
      if (Array.isArray(h)) await kv.kvSet('pmtx.history', h.filter((x) => x.runId !== runId));
      try { fs.unlinkSync(path.join(dataRoot, 'prompt-matrix', 'runs', `${runId}.json`)); } catch (_) { /* 忽略 */ }
    }
  } catch (_) { /* 尽力清理 */ }
}

try {
  // ── 1. 服务子进程连真桥 ────────────────────────────────────────────────────
  await t('真桥冒烟 1/5：服务子进程经真实 kv 心跳就绪', async () => {
    svc = spawn(process.execPath, [path.join('service', 'main.js'), '0', dataRoot], {
      cwd: path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')) + '/..',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    svc.stderr.on('data', (c) => svcLog.push(String(c)));
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const m = await kv.kvGet('pmtx.meta').catch(() => null);
      if (m && m.version && m.degraded === false) return;
      await sleep(800);
    }
    throw new Error(`30s 心跳未就绪：${svcLog.slice(-6).join('')}`);
  });

  // ── 2. 真实宿主档案 ───────────────────────────────────────────────────────
  let profile = null;
  await t('真桥冒烟 2/5：宿主真实供应商档案导入（掩码形态）', async () => {
    const r = await cmd('import_host', {}, 30000);
    if (!r.ok) throw new Error(r.error || 'import_host 失败');
    const st = await cmd('get_state', {}, 20000);
    const items = st.profiles || [];
    if (!items.length) throw new Error('宿主没有可用的模型档案（先在宿主配置模型供应商）');
    profile = items.find((p) => p.model) || items[0];
    if (!/^\*\*\*/.test(profile.keyMask) && !profile.keyMask.startsWith('env:')) {
      throw new Error(`key 未按掩码返回：${profile.keyMask}`);
    }
    const raw = JSON.stringify(items);
    // 宿主档案完整 key 形态不可在状态里出现（掩码后必为 ****xxx / env:NAME）
    if (/sk-[A-Za-z0-9]{20,}/.test(raw)) throw new Error('疑似完整 key 泄漏到 kv');
  });

  // ── 3. 小矩阵真实执行（2 变体 × 1 样本，max_tokens=16）────────────────────
  let runId = '';
  await t('真桥冒烟 3/5：小矩阵真实 LLM 执行（1×2 格 + judge）', async () => {
    const r = await cmd('run_start', {
      jsonl: '{"q": "1+1等于几？只回答一个数字"}',
      variants: [
        { name: '冒烟A', profileId: profile.id, userTemplate: '{{q}}', maxTokens: 16, temperature: 0 },
        { name: '冒烟B', profileId: profile.id, userTemplate: '只输出数字。{{q}}', maxTokens: 16, temperature: 0 },
      ],
      concurrency: 2,
      retries: 1,
      judge: { profileId: profile.id },
    }, 30000);
    if (!r.ok) throw new Error(r.error || 'run_start 失败');
    if (r.cells !== 2) throw new Error(`预期 2 格，实际 ${r.cells}`);
    runId = r.runId;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const prog = await kv.kvGet('pmtx.progress').catch(() => null);
      if (!prog) break;
      await sleep(1500);
    }
    const run = await cmd('get_run', { runId }, 20000);
    if (!run.ok) throw new Error(run.error || 'get_run 失败');
    const rp = run.run;
    if (rp.status !== 'done') throw new Error(`status=${rp.status}（${rp.error || ''}）`);
    const okCells = rp.cells.filter((c) => c.ok).length;
    if (okCells < 1) throw new Error(`0/2 格成功：${JSON.stringify(rp.cells.map((c) => c.error)).slice(0, 200)}`);
    const c0 = rp.cells[0];
    if (!/\d/.test(c0.content)) throw new Error(`输出不含数字：${c0.content.slice(0, 60)}`);
    if (rp.aggregates.variants.every((v) => v.judgeN === 0)) throw new Error('judge 未生效');
  });

  // ── 4. get_cell 全文 + annotate ───────────────────────────────────────────
  await t('真桥冒烟 4/5：get_cell 全文读取 + annotate 回写', async () => {
    const cell = await cmd('get_cell', { runId, cellId: 'r0c0' }, 20000);
    if (!cell.ok) throw new Error(cell.error || 'get_cell 失败');
    if (!cell.cell || typeof cell.cell.content !== 'string') throw new Error('格子全文缺失');
    const a = await cmd('annotate', { runId, cellId: 'r0c0', verdict: 'up' }, 15000);
    if (!a.ok) throw new Error(a.error || 'annotate 失败');
    const proj = await kv.kvGet(`pmtx.run.${runId}`);
    if (!proj || !proj.cells.find((c) => c.cellId === 'r0c0').annotated === undefined) {
      // 投影必须反映标注（annotate applied=file 路径）
    }
    if (!proj) throw new Error('投影读取失败');
    const marked = proj.cells.find((c) => c.cellId === 'r0c0');
    if (!marked || marked.annotated !== 'up') throw new Error('投影未反映标注');
  });

  // ── 5. MCP 真子进程：六工具 + pmtx_profiles 真调用 ─────────────────────────
  await t('真桥冒烟 5/5：MCP stdio 真子进程（tools/list + pmtx_profiles）', async () => {
    const mcp = spawn(process.execPath, [path.join('mcp', 'server.js'), dataRoot], {
      cwd: path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')) + '/..',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = [];
    mcp.stdout.on('data', (c) => out.push(String(c)));
    let idSeq = 0;
    const rpc = (method, params, waitMs = 25000) => new Promise((resolve, reject) => {
      const id = ++idSeq;
      const mark = out.length;
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      const deadline = Date.now() + waitMs;
      const tick = () => {
        const joined = out.slice(mark).join('');
        for (const line of joined.split('\n')) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id === id) return resolve(msg.result || msg.error);
          } catch (_) { /* 半行 */ }
        }
        if (Date.now() > deadline) return reject(new Error(`MCP ${method} 超时`));
        setTimeout(tick, 400);
      };
      tick();
    });
    try {
      await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const list = await rpc('tools/list', {});
      const names = (list.tools || []).map((x) => x.name);
      for (const want of ['pmtx_profiles', 'pmtx_datasets', 'pmtx_run', 'pmtx_status', 'pmtx_result', 'pmtx_history']) {
        if (!names.includes(want)) throw new Error(`缺工具 ${want}：${names.join(',')}`);
      }
      const call = await rpc('tools/call', { name: 'pmtx_profiles', arguments: {} });
      const text = call && call.content && call.content[0] && call.content[0].text || '';
      if (!text.includes('档案') && !text.includes('暂无')) throw new Error(`pmtx_profiles 输出异常：${text.slice(0, 120)}`);
      if (/sk-[A-Za-z0-9]{20,}/.test(text)) throw new Error('MCP 输出疑似泄漏完整 key');
    } finally {
      mcp.kill();
    }
  });
} finally {
  if (svc) svc.kill();
  // 自清理在拿得到 runId 时执行
}

// 冒烟 run 数据集清理：从 history/runs 里移除本次痕迹
const smokeRuns = results.length ? null : null;
// （runId/datasetId 在闭包里——重新定位：读 pmtx.runs 最近一条 def.datasetName 匹配冒烟特征）
await (async () => {
  try {
    const runs = await kv.kvGet('pmtx.runs').catch(() => []) || [];
    for (const id of runs) {
      const proj = await kv.kvGet(`pmtx.run.${id}`).catch(() => null);
      if (proj && proj.def && proj.def.datasetName === '（临时 JSONL）' && Array.isArray(proj.def.variants) && proj.def.variants.some((v) => String(v.name || '').startsWith('冒烟'))) {
        await cleanup(id, null);
      }
    }
    const dsList = await kv.kvGet('pmtx.datasets').catch(() => []) || [];
    for (const d of dsList) {
      if (String(d.name || '').includes('冒烟')) await cleanup(null, d.id);
    }
  } catch (_) { /* 尽力 */ }
})();

console.log(`\n==== 真桥冒烟：${results.filter((r) => r.pass).length}/${results.length} 通过 ====`);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
