#!/usr/bin/env node
/**
 * MCP stdio 全流程验证（零依赖，无需本机 Polaris）
 *
 * 方案：起一个本地 mock 桥（/api/health + /api/router-dispatch，内存 cap.kv，
 * 并模拟后台服务消费 qsent.cmd.* 命令键），以 POLARIS_HOST/PORT 环境变量注入
 * MCP server 的自发现路径 → 子进程拉起 mcp/server.js → 逐工具走 JSON-RPC。
 *
 * 运行：node test/mcp-verify.mjs
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = path.join(here, '..', 'mcp', 'server.js');

// ── 内存 kv + 命令消费模拟 ─────────────────────────────────────────────────
const store = new Map();
const TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const FAKE_QUOTE = {
  id: 'sh600519', name: '贵州茅台', price: 1330.75, prevClose: 1355.9, open: 1354.98,
  high: 1354.98, low: 1322.6, chg: -25.15, pct: -1.85, volume: 38805, amount: 518732,
  turnover: 0.31, time: TODAY + '150000', mktcap: 16635.46, source: 'tencent',
};
const FAKE_INDEX = {
  id: 'sh000001', name: '上证指数', price: 3681.47, prevClose: 3648.3, open: 3676.92,
  high: 3684.49, low: 3652.37, chg: 33.17, pct: 0.91, volume: 433622829, amount: 751019235.6,
  turnover: 0.89, time: TODAY + '150000', mktcap: null, source: 'tencent',
};
const FAKE_SEARCH = [{ market: 'sh', code: '600519', id: 'sh600519', name: '贵州茅台', type: 'GP-A', tradable: true }];

function consumeCommands() {
  for (const [k, v] of [...store]) {
    if (k.startsWith('qsent.cmd.search.')) {
      const nonce = k.slice('qsent.cmd.search.'.length);
      store.delete(k);
      store.set(`qsent.search.${nonce}`, { ok: true, at: Date.now(), results: v.q === '300' ? FAKE_SEARCH.concat([{ market: 'jj', code: '000300', id: 'jj000300', name: '某场外基金', type: 'KJ-HB', tradable: false }]) : FAKE_SEARCH });
    } else if (k.startsWith('qsent.cmd.quote.')) {
      const nonce = k.slice('qsent.cmd.quote.'.length);
      store.delete(k);
      const codes = Array.isArray(v.codes) ? v.codes : [];
      const quotes = codes.map((id) => (id === 'sh000001' ? FAKE_INDEX : FAKE_QUOTE));
      store.set(`qsent.quote.${nonce}`, { ok: true, at: Date.now(), quotes, source: 'tencent', missing: [] });
    } else if (k.startsWith('qsent.cmd.minute.')) {
      const id = k.slice('qsent.cmd.minute.'.length);
      store.delete(k);
      store.set(`qsent.minute.${id}`, { ok: true, fetchedAt: Date.now(), date: TODAY, prevClose: 1355.9, points: [{ t: '0930', p: 1354.98, vol: 1, amt: 1 }, { t: '0931', p: 1353, vol: 2, amt: 2 }] });
    }
  }
}

const bridge = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'POST' && url === '/api/router-dispatch') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let ok = true, result = null, error = null;
      try {
        const { req: r } = JSON.parse(body);
        if (r.target !== 'cap.kv') throw new Error('mock 只支持 cap.kv');
        const p = r.payload || {};
        if (p.action === 'get') result = { value: store.has(p.key) ? store.get(p.key) : null };
        else if (p.action === 'set') { store.set(p.key, p.value === undefined ? null : p.value); result = {}; }
        else if (p.action === 'delete') { store.delete(p.key); result = {}; }
        else if (p.action === 'list') result = { keys: [...store.keys()] };
        else throw new Error('未知 action ' + p.action);
        consumeCommands(); // 模拟服务消费命令键
      } catch (e) {
        ok = false;
        error = e.message;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ msgId: 'm', ok, result, error }));
    });
    return;
  }
  res.writeHead(404).end();
});

// ── stdio JSON-RPC 客户端 ──────────────────────────────────────────────────
class Rpc {
  constructor(proc) {
    this.proc = proc;
    this.buf = '';
    this.nextId = 1;
    this.pending = new Map();
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      this.buf += chunk;
      for (;;) {
        const i = this.buf.indexOf('\n');
        if (i === -1) break;
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            this.pending.get(msg.id)(msg);
            this.pending.delete(msg.id);
          }
        } catch (_) { /* 忽略非 JSON 行 */ }
      }
    });
  }
  call(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    const p = new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`rpc 超时: ${method}`));
        }
      }, timeoutMs);
    });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return p;
  }
}

// ── 断言辅助 ───────────────────────────────────────────────────────────────
let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fails.push(name); console.error(`  ✖ ${name} ${detail}`); }
}
const textOf = (res) => res?.result?.content?.[0]?.text || '';
const isErr = (res) => res?.result?.isError === true;

async function main() {
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
  const port = bridge.address().port;
  console.log(`mock 桥: 127.0.0.1:${port}`);

  const proc = spawn('node', [SERVER_JS, ''], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(port), POLARIS_TOKEN: 'x' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (c) => { stderr += c; });
  const rpc = new Rpc(proc);

  try {
    // 1. initialize
    const init = await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
    check('initialize 返回协议版本', init.result?.protocolVersion === '2024-11-05');
    // 2. tools/list
    const list = await rpc.call('tools/list', {});
    const names = (list.result?.tools || []).map((t) => t.name);
    check(`tools/list 返回 10 个工具（实际 ${names.length}）`, names.length === 10, names.join(','));
    check('含核心工具 qs_overview/qs_quote_query/qs_alert_set', ['qs_overview', 'qs_quote_query', 'qs_alert_set'].every((n) => names.includes(n)));

    // 3. qs_search
    const sr = await rpc.call('tools/call', { name: 'qs_search', arguments: { query: '茅台' } });
    check('qs_search 命中贵州茅台', !isErr(sr) && textOf(sr).includes('sh600519') && textOf(sr).includes('贵州茅台'), textOf(sr));

    // 4. qs_watchlist_add（名称解析走命令通道）
    const ar = await rpc.call('tools/call', { name: 'qs_watchlist_add', arguments: { code: '600519' } });
    check('qs_watchlist_add 成功且解析出名称', !isErr(ar) && textOf(ar).includes('贵州茅台'), textOf(ar));
    check('watch 定义已落 kv', store.get('qsent.watch.sh600519')?.name === '贵州茅台');

    // 5. 非法代码
    const bad = await rpc.call('tools/call', { name: 'qs_watchlist_add', arguments: { code: '茅台' } });
    check('qs_watchlist_add 拒绝非代码输入', isErr(bad) && textOf(bad).includes('无法识别'));

    // 6. 港股/场外基金拒绝
    const hk = await rpc.call('tools/call', { name: 'qs_watchlist_add', arguments: { code: 'hk00700' } });
    check('qs_watchlist_add 拒绝港股', isErr(hk), textOf(hk));

    // 7. qs_quote_query
    const qr = await rpc.call('tools/call', { name: 'qs_quote_query', arguments: { codes: ['600519', 'sh000001'] } });
    const qrText = textOf(qr);
    check('qs_quote_query 返回两只行情', !isErr(qr) && qrText.includes('贵州茅台') && qrText.includes('上证指数'), qrText);
    check('行情含免责声明', qrText.includes('非投资建议'));

    // 8. qs_position_set + overview
    const pr = await rpc.call('tools/call', { name: 'qs_position_set', arguments: { code: '600519', cost: 1200, shares: 100 } });
    check('qs_position_set 成功', !isErr(pr), textOf(pr));
    // 预置指数/自选 state + meta（模拟服务已轮询过）
    store.set('qsent.state.sh000001', FAKE_INDEX);
    store.set('qsent.state.sh600519', FAKE_QUOTE);
    store.set('qsent.meta', { version: '0.1.0', lastPollAt: Date.now(), lastSource: 'tencent', pollSec: 20, inSession: true, watches: 1, alerts: 0 });
    const ov = await rpc.call('tools/call', { name: 'qs_overview', arguments: {} });
    const ovText = textOf(ov);
    check('qs_overview 含指数与自选', !isErr(ov) && ovText.includes('上证指数') && ovText.includes('贵州茅台'), ovText);
    check('qs_overview 计算持仓盈亏', ovText.includes('13075'), ovText);

    // 9. qs_alert_set / list / remove
    const al = await rpc.call('tools/call', { name: 'qs_alert_set', arguments: { code: '600519', type: 'price_above', value: 1400, note: '减仓线' } });
    check('qs_alert_set 创建', !isErr(al) && textOf(al).includes('价格 ≥ 1400'), textOf(al));
    const alId = (textOf(al).match(/a[a-z0-9]{10}/) || [])[0];
    check('返回提醒 id', Boolean(alId), textOf(al));
    const dup = await rpc.call('tools/call', { name: 'qs_alert_set', arguments: { code: '600519', type: 'price_above', value: 1450 } });
    check('同标同类型为更新而非新建', !isErr(dup) && textOf(dup).includes('已更新'), textOf(dup));
    check('kv 中只有一条该规则', [...store.keys()].filter((k) => k.startsWith('qsent.alert.')).length === 1);
    const badPct = await rpc.call('tools/call', { name: 'qs_alert_set', arguments: { code: '600519', type: 'pct_below', value: 3 } });
    check('pct_below 正数被拒绝', isErr(badPct), textOf(badPct));
    const ll = await rpc.call('tools/call', { name: 'qs_alert_list', arguments: {} });
    check('qs_alert_list 列出规则与现价', !isErr(ll) && textOf(ll).includes('价格 ≥ 1450') && textOf(ll).includes('现价'), textOf(ll));
    const rm = await rpc.call('tools/call', { name: 'qs_alert_remove', arguments: { id: alId } });
    check('qs_alert_remove 删除', !isErr(rm), textOf(rm));

    // 10. qs_watchlist_list / remove
    const wl = await rpc.call('tools/call', { name: 'qs_watchlist_list', arguments: {} });
    check('qs_watchlist_list 含自选', !isErr(wl) && textOf(wl).includes('sh600519'), textOf(wl));
    const wr = await rpc.call('tools/call', { name: 'qs_watchlist_remove', arguments: { code: '600519' } });
    check('qs_watchlist_remove 成功', !isErr(wr), textOf(wr));
    check('watch 键已清理', !store.has('qsent.watch.sh600519'));
  } finally {
    proc.kill();
    bridge.close();
  }

  console.log(`\nMCP 验证: ${pass} 通过, ${fails.length} 失败${stderr && fails.length ? '\nstderr:\n' + stderr : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('验证崩溃:', e); process.exit(1); });
