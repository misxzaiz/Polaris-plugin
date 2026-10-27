#!/usr/bin/env node
'use strict';
/**
 * 订阅雷达真实桥冒烟：node test/smoke-real.mjs
 *
 * 前置：本机 Polaris 在跑（kvclient 自发现端点：anchor.json → config.json → 端口扫描）。
 * 流程：kv 读写删回路 → 写入真实订阅源 → refreshAll 命令信箱 → 轮询文章入库（≤45s）→ 自清理。
 * 跑完不留任何 radar.* 键。任一环节失败以非零码退出。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lib = require('../service/lib');
const { createKvClient } = require('../service/kvclient');

const FEED_URL = 'https://hnrss.org/frontpage';
const POLL_MS = 45000;

let pass = 0;
let fail = 0;
function step(name, ok, extra) {
  if (ok) { pass++; console.log('  ok', name, extra || ''); }
  else { fail++; console.error('  FAIL', name, extra || ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kv = createKvClient({ appConfigDir: '', log: () => {} });

// ── 1. 桥连通性 ────────────────────────────────────────────────────────────
let alive = false;
try {
  await kv.kvSet('radar.smoke.probe', { at: Date.now() });
  alive = true;
} catch (e) {
  console.error('无法连接 Polaris 桥（请确认本机 Polaris 在跑）：', e.message);
  process.exit(1);
}
step('桥连通（kv 写入探针）', alive);

// ── 2. kv 读写删回路 ──────────────────────────────────────────────────────
const probeKey = 'radar.smoke.probe.' + Date.now();
const probeVal = { hello: '雷达', n: 42 };
await kv.kvSet(probeKey, probeVal);
const back = await kv.kvGet(probeKey);
step('kv 写读一致', JSON.stringify(back) === JSON.stringify(probeVal), JSON.stringify(back));
await kv.kvDel(probeKey);
const keysAfterDel = (await kv.kvKeys()).filter((k) => k === probeKey);
step('kv 删除生效', keysAfterDel.length === 0);

// ── 3. 加真实订阅源（与面板 addFeed 同构的 def）────────────────────────────
const fid = lib.feedIdFor(FEED_URL);
const feedKey = `radar.feed.${fid}`;
const feedDef = {
  id: fid, url: FEED_URL, title: '冒烟-HN', category: 'smoke', enabled: true,
  intervalMin: 0, createdAt: Date.now(), lastFetchAt: 0, lastStatus: 'never',
  itemCount: 0, unreadCount: 0, rev: 1,
};
await kv.kvSet(feedKey, feedDef);
const defBack = await kv.kvGet(feedKey);
step('订阅源定义写入', !!defBack && defBack.id === fid, `fid=${fid}`);

// ── 4. 命令信箱触发刷新 ───────────────────────────────────────────────────
await kv.kvSet(`radar.cmd.refreshAll.${Date.now()}`, { op: 'refreshAll', at: Date.now(), via: 'smoke' });
step('refreshAll 命令已写信箱', true);

// ── 5. 轮询文章入库（服务抓取 → radar.article.<fid>.*）────────────────────
const t0 = Date.now();
let articles = [];
while (Date.now() - t0 < POLL_MS) {
  await sleep(3000);
  const keys = (await kv.kvKeys()).filter((k) => k.startsWith(`radar.article.${fid}.`));
  if (keys.length) {
    articles = await Promise.all(keys.map((k) => kv.kvGet(k)));
    break;
  }
}
step('文章入库（服务真实抓取）', articles.length > 0, `${articles.length} 篇，${Math.round((Date.now() - t0) / 1000)}s`);
const sample = articles.find((a) => a && a.title);
step('文章字段完整（title/link/excerpt）', !!sample && !!sample.title && !!sample.link, sample ? JSON.stringify(sample.title).slice(0, 60) : '');
step('摘要是纯文本（无标签/实体残留）', !sample || !/[<>]|&lt;|&amp;/.test(sample.excerpt || ''));

// ── 6. 自清理（源 + 文章 + 正文 + 命令残留）────────────────────────────────
const all = await kv.kvKeys();
const mine = all.filter((k) =>
  k === feedKey
  || k.startsWith(`radar.article.${fid}.`)
  || (k.startsWith('radar.content.') && articles.some((a) => k === `radar.content.${a.id}`))
  || k.startsWith('radar.cmd.refreshAll.')
  || k === 'radar.smoke.probe');
await Promise.all(mine.map((k) => kv.kvDel(k)));
const left = ((await kv.kvKeys()).filter((k) => mine.includes(k))).length;
step('自清理彻底', left === 0, `${mine.length} 键已删`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
