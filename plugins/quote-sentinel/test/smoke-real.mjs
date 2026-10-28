#!/usr/bin/env node
/**
 * 真实环境冒烟（需要本机 Polaris 正在运行；跑完自清理 qsent.* 键）
 *
 * 链路：真实桥（anchor 自发现）→ 真实服务进程（真实行情接口）→ 真实 MCP server。
 * 步骤：
 *   1. 桥自发现 + 清理 qsent.* 旧键
 *   2. 预置设置（缩短轮询间隔，加速冒烟）+ 加自选 贵州茅台
 *   3. 起真实服务（含 /__health 健康端点），等待真实行情 state（腾讯/东财）
 *   4. 命令通道实弹：搜索「茅台」/ 即时查 sh000001 / 分时 sh600519
 *   5. 真实 MCP server：initialize → tools/list → qs_overview（读到真实指数）
 *   6. meta 心跳断言 + 全量清理
 *
 * 说明：提醒「实弹触发」仅在交易日盘中可测（日期门控：非今日行情不评估，
 * 单元测试已覆盖引擎逻辑），本冒烟断言提醒规则被服务加载（meta.alerts）。
 *
 * 运行：node test/smoke-real.mjs
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { createKvClient, resolveEndpoint } = require('../service/kvclient.js');

let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fails.push(name); console.error(`  ✖ ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeoutMs = 30000, every = 1200, label = '' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`等待超时: ${label}`);
    await sleep(every);
  }
}

async function main() {
  console.log('盘哨真实冒烟');
  // 1. 桥自发现
  const ep = await resolveEndpoint('');
  check(`桥自发现 ${ep.host}:${ep.port}（${ep.via}${ep.token ? ', authed' : ''}）`, ep.port > 0);
  const kv = createKvClient({ appConfigDir: '', log: () => {} });

  // 清理旧键
  const oldKeys = (await kv.kvKeys()).filter((k) => k.startsWith('qsent.'));
  for (const k of oldKeys) await kv.kvDel(k);
  if (oldKeys.length) console.log(`  （清理 ${oldKeys.length} 个旧键）`);

  // 2. 预置设置 + 自选 + 一条必真提醒（仅验证加载；实弹触发依赖盘中日期门控）
  await kv.kvSet('qsent.settings', { pollSec: 15, offHoursPollSec: 60, redUp: true, indexes: ['sh000001', 'sz399001'] });
  await kv.kvSet('qsent.watch.sh600519', { id: 'sh600519', code: '600519', market: 'sh', name: '贵州茅台', createdAt: Date.now() });
  await kv.kvSet('qsent.alert.smoke1', { id: 'smoke1', code: 'sh600519', type: 'price_above', value: 100, enabled: true, createdAt: Date.now() });

  // 3. 起真实服务（随机健康端口）
  const healthPort = 20000 + Math.floor(Math.random() * 20000);
  const svc = spawn('node', [path.join(here, '..', 'service', 'quotes.js'), String(healthPort), ''], { stdio: ['ignore', 'ignore', 'pipe'] });
  let svcErr = '';
  svc.stderr.setEncoding('utf8');
  svc.stderr.on('data', (c) => { svcErr += c; });
  try {
    const health = await waitFor(async () => {
      const code = await new Promise((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port: healthPort, path: '/__health', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode); });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
      });
      return code === 200 ? true : null;
    }, { timeoutMs: 15000, label: '健康端点' });
    check(`服务健康端点 /__health 200（端口 ${healthPort}）`, health === true);

    // 等待真实行情
    const st = await waitFor(() => kv.kvGet('qsent.state.sh600519'), { timeoutMs: 60000, label: '真实行情 state' });
    check(`真实行情到达：${st.name} 现价 ${st.price}（${st.pct}%）来源 ${st.source}`,
      st.price > 0 && (st.source === 'tencent' || st.source === 'eastmoney'),
      JSON.stringify(st).slice(0, 200));
    check('名称为中文（GBK 解码正确）', /[\u4e00-\u9fa5]/.test(st.name), st.name);
    check('行情时间为交易所时间（14 位）', /^\d{14}$/.test(st.time), st.time);

    const meta = await waitFor(() => kv.kvGet('qsent.meta'), { timeoutMs: 20000, label: 'meta 心跳' });
    check('meta 心跳：服务版本/数据源', Boolean(meta && meta.version && meta.lastSource), JSON.stringify(meta).slice(0, 160));
    check('提醒规则被服务加载（meta.alerts≥1）', (meta.alerts || 0) >= 1);

    // 4. 命令通道实弹
    await kv.kvSet('qsent.cmd.search.smokeq', { q: '茅台', at: Date.now() });
    const sr = await waitFor(() => kv.kvGet('qsent.search.smokeq'), { timeoutMs: 20000, label: '搜索命令' });
    check('搜索「茅台」命中 sh600519', sr && sr.ok && (sr.results || []).some((x) => x.id === 'sh600519'), JSON.stringify(sr).slice(0, 200));

    await kv.kvSet('qsent.cmd.quote.smokeq2', { codes: ['sh000001'], at: Date.now() });
    const qr = await waitFor(() => kv.kvGet('qsent.quote.smokeq2'), { timeoutMs: 20000, label: '即时查命令' });
    const idx = (qr && qr.quotes || []).find((q) => q.id === 'sh000001');
    check('即时查 sh000001 返回上证指数', idx && idx.price > 0 && idx.name.includes('上证'), JSON.stringify(qr).slice(0, 200));

    await kv.kvSet('qsent.cmd.minute.sh600519', { op: 'minute', at: Date.now() });
    const mr = await waitFor(() => kv.kvGet('qsent.minute.sh600519'), { timeoutMs: 20000, label: '分时命令' });
    check(`分时数据 ${mr && mr.points ? mr.points.length : 0} 点（昨收 ${mr && mr.prevClose}）`, mr && mr.ok && mr.points.length > 30, JSON.stringify(mr).slice(0, 120));

    // 5. 真实 MCP server
    const mcp = spawn('node', [path.join(here, '..', 'mcp', 'server.js'), ''], {
      env: { ...process.env, POLARIS_HOST: ep.host, POLARIS_PORT: String(ep.port), POLARIS_TOKEN: ep.token || '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let mcpBuf = '';
    const pending = new Map();
    let rpcId = 1;
    mcp.stdout.setEncoding('utf8');
    mcp.stdout.on('data', (c) => {
      mcpBuf += c;
      for (;;) {
        const i = mcpBuf.indexOf('\n');
        if (i === -1) break;
        const line = mcpBuf.slice(0, i).trim();
        mcpBuf = mcpBuf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        } catch (_) { /* 跳过 */ }
      }
    });
    const call = (method, params, timeoutMs = 30000) => new Promise((resolve, reject) => {
      const id = rpcId++;
      pending.set(id, resolve);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`rpc 超时 ${method}`)); } }, timeoutMs);
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    try {
      const init = await call('initialize', {});
      check('MCP initialize', Boolean(init.result?.serverInfo?.name === 'quote-sentinel'));
      const list = await call('tools/list', {});
      check(`MCP tools/list ${list.result?.tools?.length} 个`, list.result?.tools?.length === 10);
      const ov = await call('tools/call', { name: 'qs_overview', arguments: {} });
      const text = ov?.result?.content?.[0]?.text || '';
      check('MCP qs_overview 读到真实指数/自选', text.includes('贵州茅台') && /上证|深证/.test(text), text.slice(0, 220));
      const wl = await call('tools/call', { name: 'qs_watchlist_list', arguments: {} });
      check('MCP qs_watchlist_list 含真实行情', (wl?.result?.content?.[0]?.text || '').includes('现价'));
    } finally {
      mcp.kill();
    }
  } finally {
    svc.kill();
    // 6. 全量清理
    try {
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith('qsent.'));
      for (const k of keys) await kv.kvDel(k);
      console.log(`  （清理 ${keys.length} 个 qsent.* 键）`);
    } catch (_) { /* 尽力清理 */ }
  }

  if (svcErr && fails.length) console.error('\n服务 stderr:\n' + svcErr.slice(-800));
  console.log(`\n真实冒烟: ${pass} 通过, ${fails.length} 失败`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('冒烟崩溃:', e.message); process.exit(1); });
