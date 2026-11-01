/**
 * 接口压测台面板渲染断言（node test/render-verify.mjs）
 * esbuild 打包 render-entry.tsx → Node SSR（react-dom/server）
 * 断言三 Tab 关键 UI、护栏文案、报告卡与图表骨架，不依赖浏览器。
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
const { __apiBenchRender } = globalThis;

const META = { ts: new Date().toISOString(), version: '0.1.0', port: 34567, token: 'smoke-token', degraded: false };
const SETTINGS = { connections: 25, durationS: 8, timeoutS: 5 };

const SAMPLES = Array.from({ length: 6 }, (_, i) => ({ t: i + 1, rps: 400 + i * 20, bytes: 9000 + i * 100, latMean: 40 - i, latP97_5: 90 - i * 2, errs: 0 }));
const REPORT = {
  runId: 'abc-123',
  at: '2026-11-02T01:02:03.000Z',
  version: '0.1.0',
  target: { url: 'http://127.0.0.1:8080/api/users', method: 'GET', headers: { Authorization: '****1234' }, bodyBytes: 0, connections: 10, pipelining: 1, durationS: 3, rate: null, timeoutS: 10, scope: 'loopback' },
  summary: {
    durationS: 3.02, totalRequests: 1200, sentRequests: 1210, rpsMean: 397.4, rpsPeak: 520,
    bytesMean: 9500, bytesTotal: 28500, errors: 0, timeouts: 1, mismatches: 0, resets: 0,
    non2xx: 2, non2xxPct: 0.2, ok2xx: 1198,
    statusDist: { 200: 1198, 500: 2 },
    latencies: { mean: 42.5, stddev: 8.1, min: 30, max: 99, p50: 40, p75: 45, p90: 52, p97_5: 61, p99: 75, p99_9: 90 },
    aborted: false,
    samples: SAMPLES,
  },
  verdict: { oneLine: '397.4/s（峰值 520/s）· 延迟 40ms / p97.5 61ms / p99 75ms · 非 2xx 2（0.2%）· 错误 1', notes: ['1 次超时——目标处理能力不足或 timeoutS（当前 10s）偏紧'] },
};
const HISTORY = [
  { runId: 'abc-123', at: '2026-11-02T01:02:03Z', url: 'http://127.0.0.1:8080/api/users', method: 'GET', connections: 10, durationS: 3, rpsMean: 397.4, p50: 40, p97_5: 61, p99: 75, errors: 1, non2xx: 2, aborted: false, verdictOne: '397.4/s · p97.5 61ms' },
  { runId: 'def-456', at: '2026-11-01T09:00:00Z', url: 'https://api.example.com/v1/orders', method: 'POST', connections: 20, durationS: 10, rpsMean: 88.2, p50: 210, p97_5: 380, p99: 420, errors: 0, non2xx: 0, aborted: true, verdictOne: '88.2/s · p97.5 380ms（中止）' },
];

const html = __apiBenchRender({ meta: META, settings: SETTINGS, lastReport: REPORT, history: HISTORY });
// React SSR 会在相邻文本表达式间插 <!-- --> 注释，断言前剥掉
const clean = (s) => String(s || '').replace(/<!-- -->/g, '');
let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✔', name);
  else { failed++; console.log('  ✖', name); }
}

console.log('api-bench render-verify（SSR）');
check('外壳：标题「接口压测台」', clean(html.panel).includes('接口压测台'));
check('外壳：三 Tab（压测/历史/设置）', ['压测', '历史', '设置'].every((x) => clean(html.panel).includes(x)));
check('外壳：SSR 初始为未连接副标题（数据由 effect 加载）', clean(html.panel).includes('服务未连接'));
check('压测：三个试金石预设按钮（文案，端口来自 meta）', ['试金石·极速', '试金石·慢端点', '试金石·抖动'].every((x) => clean(html.work).includes(x)));
check('压测：目标 URL 输入框占位', clean(html.work).includes('placeholder'));
check('压测：默认值来自设置（25 连接 / 8 秒 / 5 秒超时）', ['25', '8', '5'].every((x) => clean(html.work).includes(x)));
check('压测：高级选项入口（headers/body/限速/管道）', ['headers', '限速', '管道'].every((x) => clean(html.work).includes(x)));
check('压测：收藏目标按钮', clean(html.work).includes('收藏目标'));
check('压测：初始空态引导（先从 10 连接开始）', clean(html.form).includes('先从 10 连接'));
check('报告：方法+URL+参数徽标', clean(html.report).includes('GET') && clean(html.report).includes('/api/users') && clean(html.report).includes('10 连接 × 3'));
check('报告：摘要卡均值/峰值/p97.5/错误/非2xx', ['397.4', '520', '61', '0.2%'].every((x) => clean(html.report).includes(x)));
check('报告：RPS 与延迟图表 SVG（polyline 存在）', (html.report.match(/<polyline/g) || []).length >= 2);
check('报告：HDR 分位表 p50~p99.9 全列', ['p50', 'p75', 'p90', 'p97.5', 'p99', 'p99.9', 'max'].every((x) => clean(html.report).includes(x)));
check('报告：状态码分布芯片（200 与 500）', clean(html.report).includes('200 × 1198') && clean(html.report).includes('500 × 2'));
check('报告：结论区含归因提示（超时）', clean(html.report).includes('超时——目标处理能力不足'));
check('历史：A/B 对比区（A=基准/B=改动后）', clean(html.history).includes('A/B 对比') && clean(html.history).includes('A=基准'));
check('历史：两条记录（吞吐/p97.5/错误/非2xx 口径）', ['397.4/s', '88.2/s', '380ms'].every((x) => clean(html.history).includes(x)));
check('历史：中止标记', clean(html.history).includes('中止'));
check('设置：默认参数回显（25/8/5）', ['25', '8'].every((x) => clean(html.settings).includes(x)));
check('设置：护栏声明（并发≤1000/时长≤300s/敏感头掩码）', ['1000', '300s', '****'].every((x) => clean(html.settings).includes(x)));
check('设置：公网目标授权提示', clean(html.settings).includes('公网目标请确认'));
check('设置：不做清单（分布式/编排/WebSocket）', ['分布式', 'WebSocket'].every((x) => clean(html.settings).includes(x)));

// 离线态
const off = __apiBenchRender({ meta: null, settings: null, lastReport: null, history: [] });
check('离线：外壳未连接提示（含启用指引）', clean(off.panel).includes('服务未连接') && clean(off.panel).includes('插件已启用'));
check('离线：试金石不可用提示', clean(off.work).includes('服务未连接，试金石不可用'));
check('离线：压测空态引导', clean(off.work).includes('还没有报告'));
check('离线：历史空态引导', clean(off.history).includes('还没有压测历史'));
check('离线：设置服务状态为未连接', clean(off.settings).includes('未连接'));

try { fs.rmSync(outfile, { force: true }); } catch (_) { /* 清理失败不影响结果 */ }

if (failed) {
  console.log(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n全部通过');
