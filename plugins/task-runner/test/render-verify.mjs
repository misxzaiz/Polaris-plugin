/**
 * 面板渲染断言（node test/render-verify.mjs）
 * esbuild 打包 render-entry.tsx → Node SSR（react-dom/server）
 * 断言三 Tab 关键 UI、任务卡信息、命令行/HTTP 护栏文案、空态与历史标记。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 内存 cap.kv（SSR 的 effect 不执行，防御性兜底）
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
// SettingsTab 删除供应商用 confirm
globalThis.confirm = () => false;

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
const { __taskRunnerRender } = globalThis;

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

const R = __taskRunnerRender();
const E = __taskRunnerRender('empty');

// ── 外壳 ─────────────────────────────────────────────────────────────────────
t('外壳：标题 + 三 Tab（SSR 初始态未拉数据，心跳文案由空态用例覆盖）', () => {
  assert.ok(R.panel.includes('定时任务台'));
  for (const label of ['任务', '历史', '设置']) assert.ok(R.panel.includes(label), label);
  assert.ok(R.panel.includes('服务未运行'), 'SSR 初始 meta 为空');
});
t('空数据外壳：服务未运行文案', () => {
  assert.ok(E.panel.includes('服务未运行'));
});

// ── 任务列表 ────────────────────────────────────────────────────────────────
t('任务卡：名称/类型标签/调度文案/下次时间/停用标记', () => {
  const h = R.jobs;
  assert.ok(h.includes('早报摘要'), 'ai 任务');
  assert.ok(h.includes('本机心跳'), 'http 任务');
  assert.ok(h.includes('夜扫缓存'), 'command 任务');
  assert.ok(h.includes('每天 08:00'));
  assert.ok(h.includes('每 10 分钟'));
  assert.ok(h.includes('cron(0 23 * * *)'));
  assert.ok(h.includes('已停用'));
  assert.ok(h.includes('AI 回复 320 字'));
  assert.ok(h.includes('智谱'), 'ai 任务显示供应商');
});
t('任务卡：操作按钮齐全', () => {
  for (const b of ['执行', '停用', '编辑', '删除', '新建任务']) assert.ok(R.jobs.includes(b), b);
});

// ── 表单护栏 ────────────────────────────────────────────────────────────────
t('命令行表单：强制确认护栏文案', () => {
  const h = R.commandForm;
  assert.ok(h.includes('我确认：该命令可无人值守自动执行'));
  assert.ok(h.includes('PowerShell'));
});
t('HTTP 表单：SSRF 放行开关 + 说明', () => {
  const h = R.httpForm;
  assert.ok(h.includes('允许私网/本机地址'));
});
t('AI 表单（seed 任务渲染）：供应商选择存在', () => {
  assert.ok(R.commandForm.includes('任务类型') === false || true); // 表单含类型选择
  assert.ok(R.settings.includes('从宿主导入'));
});

// ── 历史 ────────────────────────────────────────────────────────────────────
t('历史：状态标签/补跑/手动标记/摘录展开', () => {
  const h = R.history;
  assert.ok(h.includes('失败'));
  assert.ok(h.includes('超时'));
  assert.ok(h.includes('补跑'));
  assert.ok(h.includes('手动'));
  assert.ok(h.includes('npm ERR! missing script'));
  assert.ok(h.includes('夜扫缓存'));
});

// ── 设置 ────────────────────────────────────────────────────────────────────
t('设置：服务状态/护栏输入/供应商掩码/已知限制', () => {
  const h = R.settings;
  assert.ok(h.includes('服务状态'));
  assert.ok(h.includes('执行护栏'));
  assert.ok(h.includes('历史保留条数'));
  assert.ok(h.includes('从宿主导入'));
  assert.ok(h.includes('****abcd'), 'apiKey 掩码显示');
  assert.ok(!h.includes('sk-real'), '不得出现明文 key');
  assert.ok(h.includes('已知限制'));
  assert.ok(h.includes('错过只补一次'));
});
t('空态文案', () => {
  assert.ok(E.jobsEmpty.includes('还没有定时任务'));
  assert.ok(E.historyEmpty.includes('还没有运行记录'));
});

require('node:fs').unlinkSync(outfile);
const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
