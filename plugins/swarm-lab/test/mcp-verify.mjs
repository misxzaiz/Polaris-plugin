/**
 * 蜂群实验台 MCP 协议验证（node test/mcp-verify.mjs）
 *
 * 真 spawn mcp/server.js 喂 JSON-RPC stdin。本插件零宿主依赖——无 Polaris
 * 运行也全绿，且没有连真宿主的污染风险（纯计算，无 kv 无网络）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, SWARM_LAB_TEST: '1' },
});
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const textOf = (m) => m.result.content[0].text;
const jsonOf = (m) => JSON.parse(textOf(m));

// ── 断言工具 ───────────────────────────────────────────────────────────────
let failed = 0;
const okCount = { n: 0 };
function ok(name) { okCount.n++; console.log(`  ✓ ${name}`); }
function bad(name, detail) { failed++; console.error(`  ✗ ${name}${detail ? '\n    ' + detail : ''}`); }
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name); else bad(name, `期望 ${e}，实得 ${a}`);
}

const run = async () => {
  // 0) initialize
  const init = await rpc('initialize', {});
  eq('initialize 协议版本', init.result?.protocolVersion?.slice(0, 4), '2024');
  eq('initialize capabilities', init.result?.capabilities, { tools: {} });
  eq('initialize serverInfo.name', init.result?.serverInfo?.name, 'swarm-lab');
  ok('initialize serverInfo.version: ' + (init.result?.serverInfo?.version || ''));

  // 1) tools/list
  const list = await rpc('tools/list', {});
  const tools = list.result?.tools || [];
  const names = tools.map((t) => t.name);
  eq('tools/list 工具清单', names, [
    'swarmlab_scenarios',
    'swarmlab_run',
    'swarmlab_compare',
    'swarmlab_snapshot',
    'swarmlab_metrics',
  ]);
  for (const t of tools) {
    if (typeof t.description === 'string' && t.description.length > 10) ok(`描述: ${t.name}`);
    else bad(`描述过短: ${t.name}`, String(t.description).slice(0, 40));
    if (t.inputSchema && typeof t.inputSchema === 'object') ok(`schema: ${t.name}`);
    else bad(`缺 inputSchema: ${t.name}`);
  }

  // 2) 未知工具 → isError
  const unknown = await rpc('tools/call', { name: 'nope_xyz', arguments: {} });
  eq('未知工具 isError', unknown.result?.isError, true);
  if (textOf(unknown).includes('未知工具')) ok('未知工具错误文案'); else bad('未知工具错误文案', textOf(unknown));

  // 3) swarmlab_scenarios：参数字典
  const scen = jsonOf(await rpc('tools/call', { name: 'swarmlab_scenarios', arguments: {} }));
  eq('场景数', scen.scenarios?.length, 2);
  eq('场景 id', scen.scenarios?.map((s) => s.id), ['boids', 'ants']);
  if (scen.scenarios?.[0]?.params?.length >= 5) ok('boids 参数字典齐全'); else bad('boids 参数字典', JSON.stringify(scen.scenarios?.[0]?.params)?.slice(0, 80));

  // 4) swarmlab_run boids 默认参数真算
  const runB = jsonOf(await rpc('tools/call', { name: 'swarmlab_run', arguments: { scenario: 'boids' } }));
  const pol = runB.summary?.polarization;
  if (typeof pol?.last === 'number' && pol.last >= 0 && pol.last <= 1) ok(`boids 极化末值在域内: ${pol.last.toFixed(3)}`);
  else bad('boids 极化末值', JSON.stringify(pol));
  if (runB.seriesPoints >= 2 && runB.seriesTail?.length <= 8) ok('采样曲线（尾部截断 ≤8 点）');
  else bad('采样曲线', JSON.stringify({ points: runB.seriesPoints, tail: runB.seriesTail?.length }));
  if (typeof runB.seed === 'number' && typeof runB.repro === 'string' && runB.repro.includes('swarmlab_run')) ok('种子回显+复现命令');
  else bad('种子回显', JSON.stringify(runB.repro));

  // 5) swarmlab_run ants 真算：采食>0（涌现真的发生了）
  const runA = jsonOf(await rpc('tools/call', { name: 'swarmlab_run', arguments: { scenario: 'ants' } }));
  if (runA.summary?.food?.last > 0) ok(`ants 采食末值>0: ${runA.summary.food.last}`);
  else bad('ants 采食', JSON.stringify(runA.summary?.food));
  if (runA.summary?.coverage?.last > runA.summary?.coverage?.first) ok('覆盖率上升');
  else bad('覆盖率', JSON.stringify(runA.summary?.coverage));

  // 6) 参数校验错误被包为 isError（不崩进程）
  const badRun = await rpc('tools/call', { name: 'swarmlab_run', arguments: { scenario: 'boids', params: { count: 999 } } });
  eq('越界参数 isError', badRun.result?.isError, true);
  if (textOf(badRun).includes('越界')) ok('越界错误文案'); else bad('越界错误文案', textOf(badRun));
  const guardRun = await rpc('tools/call', { name: 'swarmlab_run', arguments: { scenario: 'boids', params: { count: 400 }, ticks: 3000 } });
  eq('算力护栏 isError', guardRun.result?.isError, true);
  if (textOf(guardRun).includes('算力护栏')) ok('护栏文案'); else bad('护栏文案', textOf(guardRun));
  const badScen = await rpc('tools/call', { name: 'swarmlab_run', arguments: { scenario: 'nope' } });
  if (textOf(badScen).includes('未知场景')) ok('未知场景文案'); else bad('未知场景文案', textOf(badScen));

  // 7) swarmlab_compare：同种子对照
  const cmp = jsonOf(await rpc('tools/call', {
    name: 'swarmlab_compare',
    arguments: {
      scenario: 'boids', seed: 42, ticks: 300,
      groups: [{ label: '低对齐', params: { alignment: 0.1 } }, { label: '高对齐', params: { alignment: 3.0 } }],
    },
  }));
  eq('对照组数', cmp.rows?.length, 2);
  eq('同种子', cmp.seed, 42);
  if (cmp.rows?.[0]?.last?.polarization !== undefined && cmp.rows?.[1]?.last?.polarization !== undefined) ok('逐组末值齐');
  else bad('逐组末值', JSON.stringify(cmp.rows?.map((r) => r.last)));
  if (cmp.deltas?.length === 4 && cmp.deltas[0].metric === 'polarization') ok('差值表含极化');
  else bad('差值表', JSON.stringify(cmp.deltas?.map((d) => d.metric)));
  // 用 mean 断言区分度（last 在长 tick 下会饱和收敛，mean 才反映全程差异）
  if (cmp.rows[1].mean.polarization > cmp.rows[0].mean.polarization + 0.3) ok('高对齐均值极化 > 低对齐+0.3（对照有区分度）');
  else bad('对照区分度', `${cmp.rows[1].mean.polarization} vs ${cmp.rows[0].mean.polarization}`);

  // 8) swarmlab_snapshot：密度字符图
  const snap = jsonOf(await rpc('tools/call', { name: 'swarmlab_snapshot', arguments: { scenario: 'boids', ticks: 200, seed: 42 } }));
  eq('快照行数(默认24)', snap.rows?.length, 24);
  if (snap.rows?.every((r) => r.length === 24)) ok('快照每行 24 字符');
  else bad('快照行宽', JSON.stringify(snap.rows?.map((r) => r.length)));
  if (typeof snap.map === 'string' && snap.map.includes('\n')) ok('字符图 map 可读');
  if (typeof snap.spread === 'number' && snap.spread >= 0) ok(`spread: ${snap.spread.toFixed(1)}`);
  else bad('spread', String(snap.spread));

  // 9) swarmlab_metrics：口径表
  const met = jsonOf(await rpc('tools/call', { name: 'swarmlab_metrics', arguments: {} }));
  if (met.byScenario?.boids?.polarization?.desc && met.byScenario?.ants?.food?.desc) ok('指标口径表');
  else bad('指标口径表', JSON.stringify(Object.keys(met.byScenario || {})));

  // 收尾
  mcp.kill();
  console.log(`\n结果：${okCount.n} 通过，${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('测试运行失败：', e);
  process.stderr.write(stderr.join(''));
  mcp.kill();
  process.exit(1);
});
