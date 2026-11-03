#!/usr/bin/env node
'use strict';
/**
 * swarm-lab MCP Server —— 蜂群实验台（AI 实验层）
 *
 * 把「多智能体涌现行为」翻译成 AI 可做的可控实验：
 *   - 同种子可复现（mulberry32）：同 seed 同参数 → 逐 tick 一致，实验结论站得住
 *   - compare 同种子控制变量跑参数组——涌现研究的标准姿势
 *   - snapshot 密度字符图——AI 直接「看见」空间格局（成团/散沙/路径）
 *
 * 纯本地零服务零外联零宿主依赖：不连 Polaris、不读 kv、不发网络请求。
 * 全部计算走 shared/engine.js（与面板同一权威，口径不漂移）。
 *
 * 工具一览（5 个，前缀 swarmlab_）：
 *   swarmlab_scenarios  场景清单+参数 schema+默认值（实验设计的输入字典）
 *   swarmlab_run        单批次实验：场景+参数+ticks+seed → 指标摘要+采样曲线
 *   swarmlab_compare    同种子多参数组对照（≤5 组）→ 逐组末值对比，控制变量
 *   swarmlab_snapshot   跑 N tick 后的密度网格字符图+质心+散布半径
 *   swarmlab_metrics    指标口径表（每个指标什么含义/怎么解读）
 *
 * 协议纪律：stdout 只输出 JSON-RPC 行；一切日志走 stderr（platform-constraints）。
 */
const engine = require('../shared/engine.js');

const SERVER_NAME = 'swarm-lab';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── 工具定义（schema 与执行一一对应）───────────────────────────────────────
const numberSchema = (desc) => ({ type: 'number', description: desc });
const TOOLS = [
  {
    name: 'swarmlab_scenarios',
    description: '列出蜂群实验台的两个涌现场景（boids 蜂群 / ants 蚁群觅食）：每个场景的全部实验参数（键/类型/范围/默认值/中文说明）与可观测指标。设计实验前先调本工具拿参数字典。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      const scenarios = Object.values(engine.SCENARIOS).map((sc) => ({
        id: sc.id,
        name: sc.name,
        description: sc.description,
        defaultTicks: sc.defaultTicks,
        maxTicks: sc.maxTicks,
        params: sc.params,
        metrics: sc.metrics.map((m) => ({ key: m.key, desc: m.desc })),
      }));
      return { scenarios, worldSize: engine.WORLD, worldKind: '环形正方形（toroidal），坐标 [0,100)，消除边界效应', tip: '做对照实验请用 swarmlab_compare（同种子控制变量）；单次探索用 swarmlab_run；想看空间格局用 swarmlab_snapshot。' };
    },
  },
  {
    name: 'swarmlab_run',
    description: '跑一次蜂群/蚁群仿真实验（确定性引擎，同种子可复现）：返回各指标摘要（初值/末值/最小/最大/均值）与采样曲线。可用于单次探索或验证一个假设。',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', enum: ['boids', 'ants'], description: '场景 id：boids=蜂群鸟群，ants=蚁群觅食' },
        params: { type: 'object', description: '实验参数（可选，缺省用默认值；键名先用 swarmlab_scenarios 查）', additionalProperties: true },
        ticks: numberSchema('仿真步数（可选，默认 boids=600/ants=1500；有算力护栏 count²×ticks≤4e8）'),
        seed: numberSchema('随机种子（可选 0~4294967295；不传则随机生成并回显，记下它可复跑）'),
        sampleEvery: numberSchema('采样间隔 tick 数（可选，默认 ticks/30）'),
      },
      required: ['scenario'],
    },
    run(args) {
      const v = engine.validateRunArgs(args.scenario, args.params, args.ticks, args.seed, args.sampleEvery);
      if (!v.ok) throw new Error(v.error);
      const out = engine.runBatch(args.scenario, v.params, v.seed, v.ticks, v.sampleEvery);
      // 曲线只回传尾部 8 个采样点防刷屏；summary 全量回传（AI 主要读这个）
      const tail = out.series.slice(-8);
      return {
        scenario: out.scenario, seed: out.seed, ticks: out.ticks, sampleEvery: out.sampleEvery,
        summary: out.summary,
        seriesTail: tail,
        seriesPoints: out.series.length,
        repro: `复现命令：swarmlab_run {scenario:'${out.scenario}', seed:${out.seed}, ticks:${out.ticks}${Object.keys(out.params).length ? ', params:' + JSON.stringify(out.params) : ''}}`,
      };
    },
  },
  {
    name: 'swarmlab_compare',
    description: '同种子控制变量对照实验（涌现研究的核心工具）：2~5 组参数共用同一 seed 并行跑，返回逐组指标末值/均值对比表与差值。适合回答「对齐权重调大一倍对群体秩序影响多大」这类问题。',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', enum: ['boids', 'ants'], description: '场景 id' },
        seed: numberSchema('随机种子（可选；对照实验必须同种子才有可比性，建议显式传入）'),
        ticks: numberSchema('仿真步数（可选，默认场景默认值）'),
        groups: {
          type: 'array', minItems: 2, maxItems: 5,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '组名（如 alignment=2.0）' },
              params: { type: 'object', description: '该组参数（覆盖默认值）', additionalProperties: true },
            },
          },
          description: '2~5 组参数（同一 seed 各跑一遍）',
        },
      },
      required: ['scenario', 'groups'],
    },
    run(args) {
      if (!Array.isArray(args.groups) || args.groups.length < 2 || args.groups.length > 5) {
        throw new Error('groups 需要 2~5 组（对照实验至少两组才有比较意义）');
      }
      const seedArg = args.seed === undefined ? undefined : args.seed;
      const base = engine.validateRunArgs(args.scenario, undefined, args.ticks, seedArg, undefined);
      if (!base.ok) throw new Error(base.error);
      const seed = base.seed;
      const rows = [];
      for (const g of args.groups) {
        const v = engine.validateRunArgs(args.scenario, g.params, args.ticks, seed, undefined);
        if (!v.ok) throw new Error(`组 ${g.label || JSON.stringify(g.params)}: ${v.error}`);
        const out = engine.runBatch(args.scenario, v.params, seed, v.ticks, v.sampleEvery);
        rows.push({
          label: g.label || JSON.stringify(g.params),
          params: v.params,
          last: Object.fromEntries(Object.entries(out.summary).map(([k, s]) => [k, s.last])),
          mean: Object.fromEntries(Object.entries(out.summary).map(([k, s]) => [k, s.mean])),
        });
      }
      // 差值表：以第 0 组为基准，逐指标 last 的差（绝对+相对%）
      const metricKeys = Object.keys(rows[0].last);
      const deltas = metricKeys.map((k) => {
        const b = rows[0].last[k];
        return {
          metric: k,
          baseline: b,
          others: rows.slice(1).map((r, i) => ({
            vs: rows[i + 1].label,
            diff: r.last[k] - b,
            diffPct: b === 0 ? null : +(((r.last[k] - b) / Math.abs(b)) * 100).toFixed(1),
          })),
        };
      });
      return { scenario: args.scenario, seed, ticks: base.ticks, rows, deltas, note: '同种子对照：各组差异只来自参数（环境噪声被种子锁死）' };
    },
  },
  {
    name: 'swarmlab_snapshot',
    description: '跑 N tick 后输出个体分布的密度网格字符图（. 稀 → @ 密）+ 质心 + 散布半径，让 AI 直接「看见」空间格局：boids 是否成团/散沙，ants 是否分兵两路。',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', enum: ['boids', 'ants'], description: '场景 id' },
        params: { type: 'object', description: '实验参数（可选）', additionalProperties: true },
        ticks: numberSchema('跑多少步再拍快照（可选，默认 400）'),
        seed: numberSchema('随机种子（可选）'),
        cells: numberSchema('网格边长 8~48（可选，默认 24）'),
      },
      required: ['scenario'],
    },
    run(args) {
      const v = engine.validateRunArgs(args.scenario, args.params, args.ticks === undefined ? 400 : args.ticks, args.seed, undefined);
      if (!v.ok) throw new Error(v.error);
      if (args.cells !== undefined && (typeof args.cells !== 'number' || !Number.isFinite(args.cells) || args.cells < 8 || args.cells > 48)) {
        throw new Error(`cells 需为 8~48 的数字，实得 ${JSON.stringify(args.cells)}`);
      }
      const snap = engine.snapshotGrid(args.scenario, v.params, v.seed, v.ticks, args.cells);
      return { ...snap, map: snap.rows.join('\n'), readTip: '字符密度：. 最稀 → @ 最密；spread 为个体到质心的平均距离（世界单位，最大约 50=均匀散布）' };
    },
  },
  {
    name: 'swarmlab_metrics',
    description: '指标口径表：每个实验指标的含义、范围与解读方式（哪个高代表什么）。读 run/compare 结果前先对口径，避免误读。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return {
        worldSize: engine.WORLD,
        byScenario: Object.fromEntries(Object.values(engine.SCENARIOS).map((sc) => [
          sc.id,
          Object.fromEntries(sc.metrics.map((m) => [m.key, { desc: m.desc, cumulative: !!m.cumulative }])),
        ])),
        note: '采样口径：summary/曲线均在采样点（每 sampleEvery tick）计算，非逐 tick。',
      };
    },
  },
];

// ── JSON-RPC stdio 主循环 ───────────────────────────────────────────────────
function handle(method, params) {
  if (method === 'initialize') {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  }
  if (method === 'notifications/initialized') return null; // 通知无响应
  if (method === 'ping') return {};
  if (method === 'tools/list') {
    return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) throw new Error(`未知工具: ${params?.name}（可用: ${TOOLS.map((t) => t.name).join(', ')}）`);
    const result = tool.run(params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
  throw new Error(`未知方法: ${method}`);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  // eslint-disable-next-line no-cond-assign
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) {
      log('warn', `非 JSON 行已忽略: ${line.slice(0, 80)}`);
      continue;
    }
    if (msg.id === undefined || msg.id === null) continue; // 通知：无需回包
    try {
      const result = handle(msg.method, msg.params);
      if (result !== null) {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
      }
    } catch (e) {
      log('warn', `工具执行失败 ${msg.method}: ${e.message}`);
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { content: [{ type: 'text', text: `执行失败: ${e.message}` }], isError: true },
      }) + '\n');
    }
  }
});
process.stdin.on('end', () => process.exit(0));
log('info', `swarm-lab MCP ready（${TOOLS.length} 工具，纯本地零宿主依赖）`);
