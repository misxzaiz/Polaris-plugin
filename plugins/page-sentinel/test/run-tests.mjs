/**
 * 网页哨兵服务测试（node --test，零外部依赖）
 *
 * 覆盖：
 *   1. extract.js 单元：HTML 解析 / 选择器子集 / regex / json / headers / 数值提取
 *   2. diff.js：行级 diff、折叠、超长退化
 *   3. sentinel.js：normalizeTarget 校验
 *   4. 端到端：mock 网站 + mock IPC bridge（内存 cap.kv），真实跑
 *      服务调度 → 抓取抽取 → 快照/状态落库 → 内容变化出 diff 事件 →
 *      条件命中事件 → 立即检查命令 → 试抓命令
 *
 * 运行：node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseHtml, textContent, normalizeText, querySelectorAll, extractByMode, parseNumber,
} = require('../service/extract.js');
const { diffLines } = require('../service/diff.js');
const { normalizeTarget, K } = require('../service/sentinel.js');

// ── extract 单元 ────────────────────────────────────────────────────────────

test('parseHtml：嵌套/属性/实体/脚本样式剥离', () => {
  const html = `<!doctype html><html><head><style>.p{color:red}</style></head>
  <body><div id="main" class="card  active"><span>价格 &yen;1,299</span><script>var x=1<2;</script><!-- c --><img src="a.png"><br/></div></body></html>`;
  const root = parseHtml(html);
  const text = textContent(root);
  assert.ok(text.includes('价格 ¥1,299'), `应有正文，实际：${text}`);
  assert.ok(!text.includes('color:red'), 'style 内容不应进正文');
  assert.ok(!text.includes('var x'), 'script 内容不应进正文');
  const { elements } = querySelectorAll(root, '#main');
  assert.equal(elements.length, 1);
  assert.equal(elements[0].tag, 'div');
});

test('selector：class/后代/子代/attr 运算符/@href 后缀', () => {
  const html = `<ul id="list"><li class="item"><a href="/p/1" data-id="x1">A</a></li>
  <li class="item hot"><a href="/p/2">B</a></li><li class="other"><a href="/p/3">C</a></li></ul>`;
  const root = parseHtml(html);
  const r1 = querySelectorAll(root, 'ul#list > li.item a');
  assert.equal(r1.elements.length, 2);
  const r2 = querySelectorAll(root, 'li.hot a@href');
  assert.equal(r2.attrName, 'href');
  assert.deepEqual(r2.elements.map((e) => e.attrs.href), ['/p/2']);
  const r3 = querySelectorAll(root, 'a[data-id^="x"]');
  assert.equal(r3.elements.length, 1);
  const r4 = querySelectorAll(root, 'li.item.hot, li.other a');
  assert.equal(r4.elements.length, 2);
});

test('extractByMode：text / selector / regex / json / headers', () => {
  const resp = {
    status: 200,
    headers: { 'content-type': 'text/html', etag: 'W/"abc123"', 'last-modified': 'Tue, 27 Oct 2026 00:00:00 GMT' },
    body: `<div><span class="price">¥ 1,499.00</span><span class="stock">现货</span></div>`,
  };
  const t = extractByMode({ mode: 'text' }, resp);
  assert.ok(t.ok && t.text.includes('¥ 1,499.00') && t.text.includes('现货'));

  const s = extractByMode({ mode: 'selector', selector: '.price' }, resp);
  assert.ok(s.ok && s.text === '¥ 1,499.00', `selector 结果：${s.text}`);

  const r = extractByMode({ mode: 'regex', regex: 'class="price">([^<]+)<' }, resp);
  assert.ok(r.ok && r.text === '¥ 1,499.00');

  const j = extractByMode({ mode: 'json', jsonPath: 'data.items[1].price' }, {
    status: 200, headers: {}, body: JSON.stringify({ data: { items: [{ price: 1 }, { price: 149 }] } }),
  });
  assert.ok(j.ok && j.text === '149');

  const bad = extractByMode({ mode: 'selector' }, resp);
  assert.equal(bad.ok, false);
  const h = extractByMode({ mode: 'headers' }, resp);
  assert.ok(h.ok && h.text.includes('etag: W/"abc123"'));
});

test('parseNumber 容错千分位/货币', () => {
  assert.equal(parseNumber('¥ 1,299.00'), 1299);
  assert.equal(parseNumber('剩 3 件'), 3);
  assert.ok(Number.isNaN(parseNumber('无')));
});

// ── diff 单元 ───────────────────────────────────────────────────────────────

test('diffLines：增删改 + 折叠 + 超长退化', () => {
  const a = ['价格 199', '库存 有货', '说明 x', '说明 y', '说明 z', '尾行'];
  const b = ['价格 149', '库存 有货', '说明 x', '说明 y', '说明 z', '尾行'];
  const r = diffLines(a.join('\n'), b.join('\n'));
  const kinds = r.ops.map((o) => o.kind + ':' + o.text.split('\n')[0]).join('|');
  assert.ok(kinds.includes('-:价格 199'), kinds);
  assert.ok(kinds.includes('+:价格 149'), kinds);
  assert.ok(kinds.includes('库存 有货'), '上下文应保留');

  const big1 = Array.from({ length: 1500 }, (_, i) => 'l' + i).join('\n');
  const big2 = big1.replace('l10', 'X');
  const t = diffLines(big1, big2);
  assert.equal(t.truncated, true);
  assert.ok(t.ops[0].text.includes('超长文本'));
});

// ── normalizeTarget ─────────────────────────────────────────────────────────

test('normalizeTarget：校验与兜底', () => {
  assert.equal(normalizeTarget({ id: 'a', url: 'ftp://x' }), null);
  assert.equal(normalizeTarget({ id: 'a', url: 'http://x.com', mode: 'selector' }), null, 'selector 模式缺选择器应拒');
  const ok = normalizeTarget({ id: 'a', url: 'https://x.com/p', mode: 'selector', selector: '.price', intervalSec: 5 });
  assert.ok(ok && ok.intervalSec === 30, '间隔应抬到最小 30s');
  const def = normalizeTarget({ id: 'b', url: 'https://x.com' });
  assert.equal(def.mode, 'text');
  assert.equal(def.condition, 'any');
  assert.equal(def.intervalSec, 600);
});

// ── 端到端：mock 网站 + mock IPC bridge ─────────────────────────────────────

function startMockSite() {
  let html = '<html><body><h1>商品页</h1><div class="price">¥ 199.00</div><div class="stock">缺货</div></body></html>';
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ url: req.url, inm: req.headers['if-none-match'] || '' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url === '/json' ? JSON.stringify({ price: 149, stock: '现货' }) : html);
  });
  return {
    server,
    hits,
    setHtml: (h) => { html = h; },
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise((r) => server.close(r)),
  };
}

function startMockBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url !== '/api/router-dispatch') {
        res.writeHead(404); return res.end('{}');
      }
      let reqEnv;
      try { reqEnv = JSON.parse(body).req; } catch (_) { reqEnv = null; }
      const { target, payload } = reqEnv || {};
      let result = null;
      let ok = true;
      if (target === 'cap.kv') {
        const { action, key, value } = payload || {};
        if (action === 'get') result = { value: store.has(key) ? store.get(key) : null };
        else if (action === 'set') { store.set(key, value === undefined ? null : value); result = { id: key }; }
        else if (action === 'delete') { store.delete(key); result = { deleted: true }; }
        else if (action === 'list') result = { keys: [...store.keys()] };
        else { ok = false; }
      } else { ok = false; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ msgId: crypto.randomUUID(), ok, result, error: ok ? null : 'unsupported' }));
    });
  });
  return {
    server, store,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise((r) => server.close(r)),
  };
}

async function waitFor(fn, timeoutMs = 15000, stepMs = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`waitFor 超时（${timeoutMs}ms）`);
}

test('端到端：调度→抓取→快照→变化事件→条件命中→命令', async () => {
  const site = startMockSite();
  const bridge = startMockBridge();
  const sitePort = await site.listen();
  const bridgePort = await bridge.listen();

  // 让服务的端点发现命中 mock bridge（env 优先级最高）
  process.env.POLARIS_HOST = '127.0.0.1';
  process.env.POLARIS_PORT = String(bridgePort);
  process.env.POLARIS_TOKEN = '';

  const { createSentinel } = require('../service/sentinel.js');
  const app = createSentinel({ port: 19977, appConfigDir: '' });
  await new Promise((r) => app.healthServer.listen(19977, '127.0.0.1', r));
  app.start();

  const targetId = 'e2e-' + crypto.randomUUID().slice(0, 8);
  const base = `http://127.0.0.1:${sitePort}`;
  const target = normalizeTarget({
    id: targetId, name: 'E2E 商品', url: base + '/item', mode: 'selector',
    selector: '.price', condition: 'any', intervalSec: 30, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await app.kv.kvSet(K.target(targetId), target);

  // 首查：出快照与状态，无事件
  await waitFor(() => app.targets.has(targetId), 5000);
  await app.tick();
  await waitFor(async () => {
    const st = await app.kv.kvGet(K.state(targetId));
    return st && st.lastCheckedAt && st.contentHash;
  }, 10000);
  const st1 = await app.kv.kvGet(K.state(targetId));
  assert.equal(st1.status, 'ok');
  const snap1 = await app.kv.kvGet(K.snap(targetId));
  assert.ok(snap1.text.includes('199.00'), `快照应含价格，实际：${snap1.text}`);
  const keys1 = await app.kv.kvKeys();
  assert.equal(keys1.filter((k) => k.startsWith('sentinel.event.')).length, 0, '首查不应产生事件');

  // 内容变化 → 立即检查命令 → change 事件 + diff
  site.setHtml('<html><body><h1>商品页</h1><div class="price">¥ 149.00</div><div class="stock">缺货</div></body></html>');
  await app.kv.kvSet(K.cmdCheck(targetId), { op: 'check', at: Date.now() });
  await app.tick();
  let evKey;
  try {
    evKey = await waitFor(async () => {
      const keys = await app.kv.kvKeys();
      const ev = keys.filter((k) => k.startsWith(`sentinel.event.${targetId}.`));
      if (!ev.length) return null;
      return ev;
    }, 10000);
  } catch (e) {
    console.error('DIAG store keys:', [...bridge.store.keys()]);
    console.error('DIAG state:', JSON.stringify(await app.kv.kvGet(K.state(targetId))));
    console.error('DIAG targets:', app.targets.size, 'queue/flight:', app.queue?.length ?? 'n/a');
    throw e;
  }
  assert.equal(evKey.length, 1);
  const ev = await app.kv.kvGet(evKey[0]);
  assert.equal(ev.type, 'change');
  const diffText = (ev.diff || []).map((d) => d.kind + d.text).join('\n');
  assert.ok(diffText.includes('-¥ 199.00') && diffText.includes('+¥ 149.00'), `diff 应含新旧价格：\n${diffText}`);

  // 条件命中：改用 contains 条件盯「现货」
  const condId = 'e2e-c-' + crypto.randomUUID().slice(0, 8);
  const cond = normalizeTarget({
    id: condId, name: 'E2E 条件', url: base + '/item2', mode: 'selector', selector: '.stock',
    condition: 'contains', keyword: '现货', intervalSec: 30, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await app.kv.kvSet(K.target(condId), cond);
  await app.tick();
  // 条件目标首查走周期调度，受同主机礼貌间隔（15s）约束，等待上限放宽到 20s
  await waitFor(async () => {
    const st = await app.kv.kvGet(K.state(condId));
    return st && st.lastCheckedAt;
  }, 20000);
  // 首查不报事件；内容变为现货后报 match
  site.setHtml('<html><body><div class="price">¥ 149.00</div><div class="stock">现货</div></body></html>');
  await app.kv.kvSet(K.cmdCheck(condId), { op: 'check', at: Date.now() });
  await app.tick();
  const matchKey = await waitFor(async () => {
    const keys = await app.kv.kvKeys();
    const evs = keys.filter((k) => k.startsWith(`sentinel.event.${condId}.`));
    return evs.length ? evs[0] : null;
  }, 10000);
  const matchEv = await app.kv.kvGet(matchKey);
  assert.equal(matchEv.type, 'match');
  assert.ok(matchEv.summary.includes('现货'));

  // 试抓命令（含 json 模式）
  const nonce = 'n' + Date.now();
  await app.kv.kvSet(K.cmdTest(nonce), { url: base + '/json', mode: 'json', jsonPath: 'price', at: Date.now() });
  await app.tick();
  const testRes = await waitFor(async () => {
    const r = await app.kv.kvGet(K.test(nonce));
    return r || null;
  }, 10000);
  assert.ok(testRes.ok && testRes.text === '149', `试抓应成功：${JSON.stringify(testRes)}`);
  const cmdGone = await app.kv.kvGet(K.cmdTest(nonce));
  assert.equal(cmdGone, null, '命令消费后应删除');

  // 健康端点
  const health = await fetch('http://127.0.0.1:19977/__health').then((r) => r.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.degraded, false);

  await app.stop();
  app.healthServer.close();
  await site.close();
  await bridge.close();
  delete process.env.POLARIS_HOST;
  delete process.env.POLARIS_PORT;
  delete process.env.POLARIS_TOKEN;
});
