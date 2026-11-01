/**
 * 站点体检台面板渲染断言（node test/render-verify.mjs）
 * esbuild 打包 render-entry.tsx → Node SSR（react-dom/server）
 * 断言三 Tab 关键 UI、护栏文案、报告卡与问题分组，不依赖浏览器。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 内存 cap.kv（SSR 的 effect 不执行，这里只为防御性兜底）
const store = new Map();
globalThis.__POLARIS_HOST_INVOKE__ = async (cmd, args) => {
  if (cmd !== 'router_dispatch') throw new Error('unexpected cmd ' + cmd);
  const { target, payload } = args.req;
  if (target !== 'cap.kv') throw new Error('unexpected target ' + target);
  if (payload.action === 'get') return { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } };
  if (payload.action === 'set') { store.set(payload.key, payload.value); return { ok: true, result: {} }; }
  if (payload.action === 'delete') { store.delete(payload.key); return { ok: true, result: {} }; }
  if (payload.action === 'list') return { ok: true, result: { keys: [...store.keys()] } };
  throw new Error('unexpected action');
};

// 打包 SSR 入口
const esbuild = require('esbuild');
const outfile = path.join(APP_ROOT, 'test', '.render-bundle.cjs');
esbuild.buildSync({
  entryPoints: [path.join(APP_ROOT, 'test', 'render-entry.tsx')],
  bundle: true,
  format: 'cjs',
  outfile,
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'silent',
});
require(outfile);
const { __siteAuditRender } = globalThis;

const META = { ts: new Date().toISOString(), version: '0.1.0', port: 34567, token: 'smoke-token', degraded: false };
const SETTINGS = {
  maxPages: 300, delayMs: 250, timeoutS: 12, concurrency: 8, slowMs: 1500,
  auditTimeoutS: 600, externalCap: 500, respectRobots: true, checkExternal: true, checkAssets: true,
};
const REPORT = {
  auditId: 'abc-123',
  at: '2026-11-02T01:02:03.000Z',
  version: '0.1.0',
  aborted: false,
  seed: { url: 'https://example.com/', scopeHosts: ['example.com'] },
  options: SETTINGS,
  robots: { fetched: true, crawlDelayMs: null, disallowCount: 2, sitemaps: ['https://example.com/sitemap.xml'] },
  sitemap: { fetched: true, url: 'https://example.com/sitemap.xml', urlCount: 42 },
  stats: {
    pagesCrawled: 42, assetsChecked: 120, externalChecked: 30, externalSkipped: 0, robotsBlocked: 1,
    durationMs: 21000, statusDist: { 200: 39, 404: 2, error: 1 }, avgPageMs: 320, spaSuspect: false,
  },
  issues: [
    {
      type: 'broken_page', severity: 'error', label: '站内页面打不开', hint: '4xx/5xx——用户与搜索引擎都会碰壁',
      count: 2, truncated: false,
      items: [
        { url: 'https://example.com/old', detail: 'HTTP 404', source: 'https://example.com/' },
        { url: 'https://example.com/gone', detail: 'HTTP 500' },
      ],
    },
    {
      type: 'missing_alt', severity: 'warn', label: '图片缺 alt', hint: '可访问性双输',
      count: 3, truncated: false,
      items: [{ url: 'https://example.com/blog', detail: '2 张图片缺 alt 属性' }],
    },
    {
      type: 'slow_page', severity: 'warn', label: '慢页面', hint: '超过阈值',
      count: 1, truncated: false,
      items: [{ url: 'https://example.com/heavy', detail: '响应 3400ms（阈值 1500ms）' }],
    },
  ],
  slowest: [{ url: 'https://example.com/heavy', ms: 3400, bytes: 120000 }],
  externalByDomain: { 'old-partner.com': ['https://old-partner.com/x'] },
  score: {
    value: 78,
    verdict: {
      oneLine: '78/100 · 42 页 · 错误 2 / 警告 4 / 提示 0',
      notes: ['站内页面打不开 2 处（错误）——4xx/5xx——用户与搜索引擎都会碰壁'],
    },
  },
};
const HISTORY = [
  { auditId: 'abc-123', at: '2026-11-02T01:02:03Z', seed: 'https://example.com/', scopeHosts: ['example.com'], pagesCrawled: 42, assetsChecked: 120, externalChecked: 30, durationMs: 21000, score: 78, errors: 2, warns: 4, aborted: false, fatal: null, verdictOne: '78/100 · 42 页' },
  { auditId: 'def-456', at: '2026-11-01T09:00:00Z', seed: 'http://127.0.0.1:4173/', scopeHosts: ['127.0.0.1:4173'], pagesCrawled: 3, assetsChecked: 2, externalChecked: 1, durationMs: 3000, score: 0, errors: 1, warns: 0, aborted: true, fatal: null, verdictOne: '0/100（中止）' },
];
const LIVE = {
  auditId: 'live-1', source: 'panel', seed: 'https://example.com/', phase: 'crawl',
  pagesDone: 12, queueLen: 8, assetsDone: 20, externalDone: 0, externalTotal: 0, errors: 2,
  current: ['example.com×2'], elapsedS: 15.5, scopeHosts: ['example.com'], maxPages: 300,
  recentEvents: [{ type: 'broken_page', url: 'https://example.com/old', detail: 'HTTP 404' }],
};

const html = __siteAuditRender({ meta: META, settings: SETTINGS, lastReport: REPORT, history: HISTORY, live: LIVE });
// React SSR 会在相邻文本表达式间插 <!-- --> 注释，断言前剥掉
const clean = (s) => String(s || '').replace(/<!-- -->/g, '');
let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✔', name);
  else { failed++; console.log('  ✖', name); }
}

console.log('site-audit render-verify（SSR）');
check('外壳：标题「站点体检台」', clean(html.panel).includes('站点体检台'));
check('外壳：三 Tab（体检/报告/历史）', ['体检', '报告', '历史'].every((x) => clean(html.panel).includes(x)));
check('外壳：SSR 初始为未连接副标题（数据由 effect 加载）', clean(html.panel).includes('服务未连接'));
check('体检：种子 URL 占位（示例含本机开发站）', clean(html.work).includes('placeholder') && clean(html.work).includes('4173'));
check('体检：开始按钮 + 试金石预设按钮', clean(html.work).includes('开始体检') && clean(html.work).includes('填入内置试金石站'));
check('体检：默认参数来自设置（300 页 / 250ms / 8 并发）', ['300', '250', '8'].every((x) => clean(html.work).includes(x)));
check('体检：三个检查开关（robots/外链/资源）', ['遵守 robots.txt', '核查外链', '核查图片/样式/脚本'].every((x) => clean(html.work).includes(x)));
check('体检：护栏声明（5~5000 / 1~12）', ['5000', '12'].every((x) => clean(html.work).includes(x)));
check('最近体检：健康分徽标 + 查看完整报告入口', clean(html.work).includes('78/100') && clean(html.work).includes('查看完整报告'));
check('实时进度：阶段标签 + 已爬/队列/外链/异常计数', ['爬取页面', '12', '8', '2'].every((x) => clean(html.live).includes(x)));
check('实时进度：最近发现事件（404）', clean(html.live).includes('HTTP 404'));
check('实时进度：中止按钮 + 部分结果说明', clean(html.live).includes('中止体检') && clean(html.live).includes('保留成报告'));
check('报告：健康分环 SVG + 一句话评语', (html.report.match(/<circle/g) || []).length >= 2 && clean(html.report).includes('78/100 · 42 页'));
check('报告：种子与范围 host', clean(html.report).includes('example.com'));
check('报告：问题分组（错误/警告徽标）', clean(html.report).includes('错误') && clean(html.report).includes('警告'));
check('报告：断链明细带状态与来源页', clean(html.report).includes('HTTP 404') && clean(html.report).includes('来源页'));
check('报告：缺 alt 明细', clean(html.report).includes('2 张图片缺 alt 属性'));
check('报告：慢页 TOP 表格（3400ms）', clean(html.report).includes('3400ms'));
check('报告：状态码分布芯片（200×39 / 404×2）', clean(html.report).includes('200 × 39') && clean(html.report).includes('404 × 2'));
check('报告：外链失效按域聚合', clean(html.report).includes('old-partner.com'));
check('报告：robots/sitemap 覆盖区', clean(html.report).includes('robots.txt') && clean(html.report).includes('42 个地址'));
check('报告：导出 JSON/CSV/AI 解读按钮', ['导出 JSON', '导出 CSV', '发给 AI 解读'].every((x) => clean(html.report).includes(x)));
check('历史：两条记录（健康分/页数/错误警告口径）', ['78/100', '42 页', '错误 2', '警告 4'].every((x) => clean(html.history).includes(x)));
check('历史：中止标记 + 查看报告按钮', clean(html.history).includes('中止') && clean(html.history).includes('查看报告'));
check('历史：报告保留策略说明', clean(html.history).includes('最近 20 份'));

// 离线态
const off = __siteAuditRender({ meta: null, settings: null, lastReport: null, history: [], live: null });
check('离线：外壳未连接提示（含启用指引）', clean(off.panel).includes('服务未连接') && clean(off.panel).includes('插件已启用'));
check('离线：体检空态引导', clean(off.work).includes('服务未连接'));
check('离线：报告空态引导（试金石）', clean(off.report).includes('内置试金石站'));
check('离线：历史空态引导', clean(off.history).includes('还没有体检历史'));

try { fs.rmSync(outfile, { force: true }); } catch (_) { /* 清理失败不影响结果 */ }

if (failed) {
  console.log(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n全部通过');
