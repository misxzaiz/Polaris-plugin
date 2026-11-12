'use strict';
/**
 * unit.mjs —— browser-desk 纯逻辑单测（零依赖，node:test）
 * 覆盖：shared/core 纯函数、engine 的解析/绑定/事件环逻辑（注入 stub puppeteer）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');
const { createEngine } = require('../service/engine.js');

// ── shared/core ────────────────────────────────────────────────────────────
test('looksLikeUrl 分类正确', () => {
  assert.equal(core.looksLikeUrl('https://example.com'), true);
  assert.equal(core.looksLikeUrl('http://localhost:3000/x'), true);
  assert.equal(core.looksLikeUrl('example.com/path'), true);
  assert.equal(core.looksLikeUrl('polaris 是什么'), false);
  assert.equal(core.looksLikeUrl(''), false);
});

test('normalizeUrl 补 scheme', () => {
  assert.equal(core.normalizeUrl('example.com'), 'https://example.com');
  assert.equal(core.normalizeUrl('http://a.b'), 'http://a.b');
});

test('buildSearchUrl 各引擎', () => {
  assert.match(core.buildSearchUrl('a b', 'bing'), /bing\.com\/search\?q=a%20b/);
  assert.match(core.buildSearchUrl('a', 'baidu'), /baidu\.com/);
  assert.match(core.buildSearchUrl('a', 'unknown'), /bing\.com/); // 兜底
});

// ── engine（stub puppeteer）────────────────────────────────────────────────
/** 构造一个可控 stub puppeteer 与引擎 */
function makeStub() {
  const listeners = {};
  const pages = [];
  const fakeBrowser = {
    connected: true,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    targets: async () => [],
    newPage: async () => {
      const page = makeStubPage();
      pages.push(page);
      // 通知 targetcreated（attachTarget 走 browser.newPage 后手动 attach，这里不需要事件）
      return page;
    },
    target: () => ({ createCDPSession: async () => ({ on() {} }) }),
    close: async () => { fakeBrowser.connected = false; },
  };
  const puppeteer = { launch: async () => fakeBrowser };
  const logs = [];
  const log = { info: (m) => logs.push(`i:${m}`), warn: (m) => logs.push(`w:${m}`), error: (m) => logs.push(`e:${m}`), debug: () => {} };
  const engine = createEngine({ loadPuppeteer: async () => puppeteer, log });
  return { engine, fakeBrowser, pages, listeners, logs };
}

let pageSeq = 0;
function makeStubPage() {
  pageSeq += 1;
  const page = {
    _targetId: `tab-${pageSeq}`,
    _url: 'about:blank',
    _title: `Page ${pageSeq}`,
    _closed: false,
    listeners: {},
    on(ev, fn) { (page.listeners[ev] = page.listeners[ev] || []).push(fn); },
    url: () => page._url,
    title: async () => page._title,
    target: () => ({ _targetId: page._targetId, type: () => 'page', page: async () => page }),
    goto: async (u) => { page._url = u; },
    evaluate: async (fn, arg) => (typeof fn === 'function' ? fn(arg) : null),
    close: async () => { page._closed = true; },
    screenshot: async () => 'Zm9v',
    keyboard: { press: async () => {} },
    $: async () => null,
    waitForSelector: async () => ({}),
    waitForNetworkIdle: async () => {},
  };
  return page;
}

test('acquire: create 模式新建标签并可导航', async () => {
  const { engine } = makeStub();
  const info = await engine.acquire({ url: 'https://example.com', mode: 'create', agentKey: 'a1' });
  assert.equal(info.url, 'https://example.com');
  assert.ok(info.tabId);
  const st = await engine.status();
  assert.equal(st.tabs.length, 1);
  assert.equal(st.tabs[0].agentKey, 'a1');
});

test('acquire: reuse 复用 agentKey 绑定标签', async () => {
  const { engine } = makeStub();
  const first = await engine.acquire({ url: 'https://a.com', mode: 'create', agentKey: 'k1' });
  const second = await engine.acquire({ agentKey: 'k1' }); // reuse
  assert.equal(second.tabId, first.tabId);
  // 不同 agentKey 不复用
  const third = await engine.acquire({ agentKey: 'k2' });
  assert.notEqual(third.tabId, first.tabId);
});

test('resolveTab: agentKey 绑定路由', async () => {
  const { engine } = makeStub();
  const a = await engine.acquire({ agentKey: 'ka', mode: 'create' });
  engine._internal.advanceClock(10); // 错开 lastUsedAt，避免同毫秒并列
  const b = await engine.acquire({ agentKey: 'kb', mode: 'create' });
  const ra = engine.resolveTab({ agentKey: 'ka' });
  engine._internal.advanceClock(1); // rb 的 touch 晚于 ra
  const rb = engine.resolveTab({ agentKey: 'kb' });
  assert.equal(ra.tabId, a.tabId);
  assert.equal(rb.tabId, b.tabId);
  // 未绑定的 agentKey 落到最近活跃（b 的 touch 最新）
  const rx = engine.resolveTab({ agentKey: 'unknown' });
  assert.equal(rx.tabId, b.tabId);
});

test('事件环：push + watch 增量拉取', async () => {
  const { engine } = makeStub();
  // 缩短长轮询挂起窗口，避免空等 25s（engine 的时间基准已被 advanceClock 抽象）
  const info = await engine.acquire({ agentKey: 'k', mode: 'create' });
  const { pushEvent } = engine._internal;
  const base = pushEvent(info.tabId, 'console', { text: 'hello' });
  pushEvent(info.tabId, 'network', { url: 'https://x' });
  // acquire 时已有一条 navigation 事件，sinceSeq 用其 seq 起算
  const w = await engine.watch({ tabId: info.tabId, sinceSeq: base.seq - 1 });
  assert.deepEqual(w.events.map((e) => e.kind), ['console', 'network']);
  const lastSeq = w.events[w.events.length - 1].seq;
  // 增量：sinceSeq=lastSeq → 无事件（长轮询挂起到超时返回空，advanceClock 不影响真实定时器）
  const w2 = await engine.watch({ tabId: info.tabId, sinceSeq: lastSeq });
  assert.equal(w2.events.length, 0);
  // push 后再拉增量
  pushEvent(info.tabId, 'dialog', { message: 'hi' });
  const w3 = await engine.watch({ tabId: info.tabId, sinceSeq: lastSeq });
  assert.equal(w3.events.length, 1);
  assert.equal(w3.events[0].kind, 'dialog');
}, { timeout: 35000 });

test('事件环容量上限', async () => {
  const { engine } = makeStub();
  const info = await engine.acquire({ mode: 'create' });
  const { pushEvent } = engine._internal;
  for (let i = 0; i < 300; i += 1) pushEvent(info.tabId, 'console', { text: `m${i}` });
  const ring = engine._internal.eventRings.get(info.tabId);
  assert.equal(ring.length, core.EVENT_RING_CAPACITY);
  assert.equal(ring[ring.length - 1].text, 'm299');
});

test('wait: urlPattern 命中既有事件立即返回', async () => {
  const { engine } = makeStub();
  const info = await engine.acquire({ mode: 'create' });
  engine._internal.pushEvent(info.tabId, 'navigation', { url: 'https://done.example/finish' });
  const r = await engine.wait({ tabId: info.tabId, urlPattern: 'finish', timeoutMs: 1000 });
  assert.ok(r.matched);
  assert.equal(r.matched.url, 'https://done.example/finish');
});

test('wait: 超时抛错', async () => {
  const { engine } = makeStub();
  const info = await engine.acquire({ mode: 'create' });
  await assert.rejects(
    () => engine.wait({ tabId: info.tabId, urlPattern: 'never-matches-xyz', timeoutMs: 500 }),
    /等待超时/,
  );
});

test('close(all) 关闭全部标签', async () => {
  const { engine, pages } = makeStub();
  await engine.acquire({ mode: 'create' });
  await engine.acquire({ mode: 'create' });
  assert.equal(pages.length, 2);
  const r = await engine.closeTab({ close: 'all' });
  assert.equal(r.closed, 2);
  assert.ok(pages.every((p) => p._closed));
});
