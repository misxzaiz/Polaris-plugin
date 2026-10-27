#!/usr/bin/env node
'use strict';
/**
 * 琥珀真实桥冒烟（需本机 Polaris 在跑 + 有外网）：node test/smoke-real.mjs
 *
 * 模式：未安装插件的服务冒烟——服务 CLI 独立跑（port=0 不绑健康端点），
 * 冒烟脚本经同一套自发现桥（service/kvclient）读写真实 cap.kv 的 amber.*
 * 键空间：下发封存命令 → 轮询条目/正文 → 检索 → 状态/摘录 → 删除联动 →
 * 全量清理。跑完自清理，不给宿主留数据。
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const assert = require('node:assert');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const { createKvClient } = require(path.join(ROOT, 'service/kvclient'));
const lib = require(path.join(ROOT, 'service/lib'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nonce = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let pass = 0;
let fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  ok', name); }
  else { fail++; console.error('  FAIL', name, detail !== undefined ? `\n     ${JSON.stringify(detail).slice(0, 300)}` : ''); }
}

const kv = createKvClient({ appConfigDir: '', log: () => {} });

async function kvKeys() {
  const r = await kv.dispatchOk('cap.kv', { action: 'list' });
  return Array.isArray(r.keys) ? r.keys : [];
}
async function kvGet(key) {
  const r = await kv.dispatchOk('cap.kv', { action: 'get', key });
  return r && r.value !== undefined ? r.value : null;
}
async function kvSet(key, value) {
  await kv.dispatchOk('cap.kv', { action: 'set', key, value });
}
async function kvDel(key) {
  await kv.dispatchOk('cap.kv', { action: 'delete', key });
}

const ITEM = (id) => `amber.item.${id}`;
const BODY = (id) => `amber.body.${id}`;

async function waitItem(id, pred, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const it = await kvGet(ITEM(id)).catch(() => null);
    if (it && pred(it)) return it;
    await sleep(1500);
  }
  return null;
}

async function cleanupAll() {
  const keys = await kvKeys();
  for (const k of keys.filter((k2) => k2.startsWith('amber.'))) await kvDel(k).catch(() => {});
}

async function main() {
  console.log('[smoke] 桥探测…');
  const ep = await kv.refreshEndpoint();
  console.log(`[smoke] 桥 = ${ep.host}:${ep.port} (via ${ep.via}${ep.token ? ', authed' : ', noauth'})`);
  const health = await kv.dispatchOk('cap.kv', { action: 'get', key: 'amber.__smoke_probe__' }).then(() => true).catch((e) => { throw new Error(`桥不可用：${e.message}`); });
  t('桥可达（cap.kv 探针读写通道）', health);
  await kvDel('amber.__smoke_probe__').catch(() => {});

  await cleanupAll();

  // ── 启动服务（CLI 独立跑，port=0 不绑健康端点）────────────────────────────
  const child = spawn(process.execPath, [path.join(ROOT, 'service/amber.js'), '0', ''], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const svcLogs = [];
  child.stderr.on('data', (c) => { svcLogs.push(String(c)); });
  child.on('exit', (code) => { if (code) svcLogs.push(`[exit ${code}]`); });

  const SEAL_URL = 'https://example.com/';
  const ID = lib.itemIdFor(SEAL_URL);
  try {
    // ── A. 真实外网封存 ────────────────────────────────────────────────────
    console.log('[smoke] A. 封存 example.com …');
    await kvSet(`amber.cmd.amberize.${nonce()}`, { op: 'amberize', url: SEAL_URL, tags: ['smoke'], at: Date.now() });
    const item = await waitItem(ID, (it) => it.status !== 'pending', 45000);
    t('A1 条目入库且非 pending', !!item && item.status === 'ok', item);
    t('A2 标题抽取（<title>）', item && item.title === 'Example Domain', item && item.title);
    t('A3 字数 > 20', !!item && item.wordCount > 20, item && item.wordCount);
    t('A4 sealCount=1、firstSealedAt 已立', !!item && item.sealCount === 1 && item.firstSealedAt > 0, item && [item.sealCount, item.firstSealedAt]);
    t('A5 host 归一', item && item.host === 'example.com', item && item.host);
    const body = await kvGet(BODY(ID));
    t('A6 正文快照入库且含实质文本', !!body && body.ok && body.text.length >= 20 && /examples/i.test(body.text), body && body.text && body.text.slice(0, 120));
    t('A7 正文为 Markdown-lite 且带 sealNo', !!body && body.sealNo === 1 && typeof body.charset === 'string');

    // ── B. 重复封存 = 层积 ────────────────────────────────────────────────
    console.log('[smoke] B. 重复封存（层积语义）…');
    const firstSealedAt = item.firstSealedAt;
    const revBefore = item.rev;
    await kvSet(`amber.cmd.amberize.${nonce()}`, { op: 'amberize', url: SEAL_URL, tags: ['smoke', 'again'], at: Date.now() });
    const item2 = await waitItem(ID, (it) => it.sealCount >= 2, 45000);
    t('B1 sealCount 层积到 2', !!item2 && item2.sealCount === 2, item2 && item2.sealCount);
    t('B2 firstSealedAt 永留', !!item2 && item2.firstSealedAt === firstSealedAt);
    t('B3 rev 递增', !!item2 && item2.rev > revBefore, item2 && [revBefore, item2.rev]);
    const body2 = await kvGet(BODY(ID));
    t('B4 快照更新（sealNo=2）', !!body2 && body2.sealNo === 2);

    // ── C. 全文检索（命令信箱 → 结果槽）───────────────────────────────────
    console.log('[smoke] C. 全文检索…');
    const n = nonce();
    await kvSet(`amber.cmd.search.${n}`, { op: 'search', q: 'documentation examples', limit: 5, at: Date.now() });
    let result = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      result = await kvGet(`amber.search.${n}`).catch(() => null);
      if (result && (result.doneAt || result.error)) break;
      await sleep(1500);
    }
    t('C1 检索结果槽落库', !!result && !result.error, result);
    t('C2 命中且语料计数 ≥1', !!result && Array.isArray(result.hits) && result.hits.length >= 1 && result.total >= 1, result && { total: result.total, hits: result.hits && result.hits.length });
    t('C3 命中 id 指向刚封存的条目', !!result && result.hits.length && result.hits[0].id === ID, result && result.hits[0]);
    await kvDel(`amber.search.${n}`).catch(() => {});

    // ── D. SSRF 守卫：内网地址拒封 ────────────────────────────────────────
    console.log('[smoke] D. SSRF 守卫…');
    await kvSet(`amber.cmd.amberize.${nonce()}`, { op: 'amberize', url: 'http://169.254.169.254/latest/meta-data', at: Date.now() });
    await sleep(11000); // 跨一个 tick，确认服务没有为内网 URL 建条目
    const ssrfItem = await kvGet(ITEM(lib.itemIdFor('http://169.254.169.254/latest/meta-data')));
    t('D1 内网/云元数据 URL 未建条目', ssrfItem === null || ssrfItem === undefined, ssrfItem);

    // ── E. 面板侧写路径：状态/摘录（跨写者同键）────────────────────────────
    console.log('[smoke] E. 面板写路径…');
    const cur = await kvGet(ITEM(ID));
    await kvSet(ITEM(ID), { ...cur, read: true, star: true, rev: (cur.rev || 1) + 1 });
    const marked = await kvGet(ITEM(ID));
    t('E1 read/star 面板可写（rev bump）', marked.read === true && marked.star === true && marked.rev === (cur.rev || 1) + 1);
    const qid = 'q' + require(path.join(ROOT, 'shared/sha256')).sha256Hex(ID + '|' + '琥珀冒烟金句').slice(0, 10);
    await kvSet(`amber.quote.${qid}`, { qid, itemId: ID, itemTitle: marked.title, itemHost: marked.host, text: '琥珀冒烟金句', note: '', createdAt: Date.now() });
    const q = await kvGet(`amber.quote.${qid}`);
    t('E2 摘录入库', !!q && q.itemId === ID);

    // ── F. 删除联动（forget 信箱）─────────────────────────────────────────
    console.log('[smoke] F. 删除联动…');
    await kvSet(`amber.cmd.forget.${ID}`, { op: 'forget', id: ID, at: Date.now() });
    let gone = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 20000) {
      const it = await kvGet(ITEM(ID)).catch(() => null);
      const b = await kvGet(BODY(ID)).catch(() => null);
      const qq = await kvGet(`amber.quote.${qid}`).catch(() => null);
      if (!it && !b && !qq) { gone = true; break; }
      await sleep(1500);
    }
    t('F1 条目/正文/摘录全部联动清理', gone);

    // ── G. MCP 工具层直连（tools/list + amber_list 语义）──────────────────
    console.log('[smoke] G. MCP 层 stdio…');
    const mcp = spawn(process.execPath, [path.join(ROOT, 'mcp/server.js'), ''], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    const mcpOut = [];
    mcp.stdout.on('data', (c) => mcpOut.push(String(c)));
    const rpc = (msg) => new Promise((resolve) => {
      mcp.stdout.once('data', () => {});
      const handler = (c) => {
        for (const line of String(c).split('\n')) {
          if (!line.trim()) continue;
          try { const m = JSON.parse(line); if (m.id === msg.id) { mcp.stdout.off('data', handler); resolve(m); } } catch (_) { /* 忽略半行 */ }
        }
      };
      mcp.stdout.on('data', handler);
      mcp.stdin.write(JSON.stringify(msg) + '\n');
    });
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    t('G1 MCP initialize', init && init.result && init.result.serverInfo.name === 'amber', init && init.result && init.result.serverInfo);
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolNames = (list.result && list.result.tools || []).map((x) => x.name);
    t('G2 七工具齐备', ['amber_save', 'amber_list', 'amber_search', 'amber_read', 'amber_mark', 'amber_quote', 'amber_delete'].every((x) => toolNames.includes(x)), toolNames);
    const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'amber_list', arguments: { limit: 5 } } });
    t('G3 amber_list 空库提示（冒烟数据已清）', call && call.result && !call.result.isError && /没有匹配的收藏/.test(call.result.content[0].text), call && call.result && call.result.content && call.result.content[0] && call.result.content[0].text && call.result.content[0].text.slice(0, 60));
    mcp.kill();
  } finally {
    child.kill();
    await sleep(500);
    if (child.exitCode === null) child.kill('SIGKILL');
    await cleanupAll();
    const left = (await kvKeys()).filter((k) => k.startsWith('amber.'));
    t('Z 收尾自清理（amber.* 键归零）', left.length === 0, left);
    if (fail && svcLogs.length) {
      console.error('── 服务日志（末 30 行）──');
      console.error(svcLogs.join('').split('\n').slice(-30).join('\n'));
    }
  }

  console.log(`\n[smoke] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('[smoke] 致命错误：', e.message);
  process.exit(1);
});
