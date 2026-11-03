#!/usr/bin/env node
'use strict';
/**
 * text-triage MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。引擎 shared/triage-core.js（单一权威）。
 * 模板持久化经宿主 cap.kv（自建索引键，绝不发 list 动作——宿主高危接口）；
 * 宿主不可达时 run/test/builtin 照常可用（引擎纯本地），持久化类工具如实报错。
 *
 * 七工具（前缀 text_triage_）：
 *   run      内联模板即跑（text + pipeline 对象）
 *   test     跑已保存模板（name + text）
 *   save     保存/覆盖模板（name + pipeline）
 *   get      读模板详情
 *   delete   删除已保存模板（内置预设不可删）
 *   list     列出全部模板（内置 + 已保存，同名以已保存为准）
 *   builtin  列出内置预设（含完整 JSON，供复制改造）
 */
const core = require('../shared/triage-core');
const { BUILTIN_PIPELINES } = require('../shared/presets');
const { createKvClient } = require('../shared/kvclient');

const SERVER_NAME = 'text-triage';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const INDEX_KEY = 'text-triage:index';
const PIPE_PREFIX = 'text-triage:pipe:';

const kv = createKvClient({ log: (lv, m) => log(lv, m) });

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const NAME_RE = /^[A-Za-z0-9_\-\u4e00-\u9fa5]{1,64}$/;

function validName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

// ── kv 模板仓（自建索引键；写模板数据成功后才写索引，索引永不指向缺失数据）──

async function readIndex() {
  const v = await kv.kvGet(INDEX_KEY);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

async function savePipeline(name, pipeline) {
  await kv.kvSet(PIPE_PREFIX + name, pipeline);
  const index = await readIndex();
  if (!index.includes(name)) {
    index.push(name);
    await kv.kvSet(INDEX_KEY, index);
  }
}

async function deletePipeline(name) {
  await kv.kvDel(PIPE_PREFIX + name);
  const index = await readIndex();
  const next = index.filter((x) => x !== name);
  if (next.length !== index.length) await kv.kvSet(INDEX_KEY, next);
}

async function getSaved(name) {
  return kv.kvGet(PIPE_PREFIX + name);
}

function builtinByName(name) {
  return BUILTIN_PIPELINES.find((b) => b.name === name) || null;
}

/** 列出全部：内置 + 已保存（同名以已保存为准） */
async function listAll() {
  const names = await readIndex();
  const saved = [];
  for (const n of names) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const p = await getSaved(n);
      if (p && typeof p === 'object') saved.push({ name: n, from: 'saved', pipeline: p });
      else { saved.push({ name: n, from: 'saved', pipeline: null }); } // 索引悬空（数据被外部删）如实标出
    } catch (e) {
      log('warn', `list 读 ${n} 失败: ${e.message}`);
      saved.push({ name: n, from: 'saved', pipeline: null });
    }
  }
  const savedNames = new Set(saved.map((s) => s.name));
  const builtins = BUILTIN_PIPELINES
    .filter((b) => !savedNames.has(b.name))
    .map((b) => ({ name: b.name, from: 'builtin', pipeline: b.pipeline }));
  return [...builtins, ...saved];
}

function kvDownMessage(e) {
  return `cap.kv 不可达：${e.message}（run/test/builtin 不依赖持久化，可继续用）`;
}

// ── 工具定义 ────────────────────────────────────────────────────────────────

const PIPELINE_DESC = '分流模板对象：{ classes:[{id,anyOf:[模式,...]}], extract:{类别id或"*":{字段:{pattern,group?,type?,required?,default?}}}, decide:{类别id或"*":[{when:{field,op,value?},then:{verdict,severity?,label?,route?,note?}}]}, fallback? }。模式 "re:<source>"=JS 正则（大小写敏感），其他=字面子串（不区分大小写）；type: string/int/float/bool/duration(→ms)/bytes(→B)/date(→ISO)；op: exists/missing/eq/ne/gt/gte/lt/lte/contains/matches/in。先用 text_triage_builtin 看现成模板再改。';

const tools = [
  {
    name: 'text_triage_run',
    description: '用内联分流模板对一段文本跑「分类→抽取→决策」三段流水：输出类别、结构化字段、处置结论（verdict/severity/route）与全程证据链（每条分类/抽取/决策判定都可回放）。适合一次性分流任务——对要复用的模板，请 save 后用 test。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待分流的非结构化文本（日志行/告警/错误报告等）' },
        pipeline: { type: 'object', description: PIPELINE_DESC },
      },
      required: ['text', 'pipeline'],
    },
    async call(args) {
      const r = core.runPipeline(args && args.pipeline, args && args.text);
      if (!r.ok) return err(`模板非法：${r.error}`);
      return ok(core.renderRun(r));
    },
  },
  {
    name: 'text_triage_test',
    description: '用已保存的分流模板（含内置预设）跑一段文本，输出同 run。适合验证模板改动效果或批量分流前先试一条。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '模板名（list/builtin 可查，如 log-triage）' },
        text: { type: 'string', description: '待分流文本' },
      },
      required: ['name', 'text'],
    },
    async call(args) {
      const name = args && args.name;
      if (!validName(name)) return err(`模板名非法（1-64 位字母/数字/_/-/中文）：${JSON.stringify(name)}`);
      let pipeline;
      const saved = await getSaved(name).catch((e) => { throw new Error(kvDownMessage(e)); });
      if (saved && typeof saved === 'object') pipeline = saved;
      else {
        const b = builtinByName(name);
        if (!b) return err(`模板不存在：${name}（list 查看全部）`);
        pipeline = b.pipeline;
      }
      const r = core.runPipeline(pipeline, args && args.text);
      if (!r.ok) return err(`模板非法：${r.error}`);
      return ok(`模板：${name}\n` + core.renderRun(r));
    },
  },
  {
    name: 'text_triage_save',
    description: '保存/覆盖分流模板到宿主 kv（三端共享：面板与 MCP 同一事实库）。同名覆盖；内置预设名也可覆盖（原预设仍可经 builtin 查看）。保存前会先校验模板。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '模板名（1-64 位字母/数字/_/-/中文）' },
        pipeline: { type: 'object', description: PIPELINE_DESC },
      },
      required: ['name', 'pipeline'],
    },
    async call(args) {
      const name = args && args.name;
      if (!validName(name)) return err(`模板名非法（1-64 位字母/数字/_/-/中文）：${JSON.stringify(name)}`);
      const v = core.validatePipeline(args && args.pipeline);
      if (!v.ok) return err(`模板非法：${v.error}`);
      try {
        await savePipeline(name, args.pipeline);
      } catch (e) {
        return err(kvDownMessage(e));
      }
      return ok(`已保存模板「${name}」：${core.describePipeline(args.pipeline)}`);
    },
  },
  {
    name: 'text_triage_get',
    description: '读取模板完整 JSON（已保存优先，其次内置预设）。用于改造模板前先取基线。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '模板名' } },
      required: ['name'],
    },
    async call(args) {
      const name = args && args.name;
      if (!validName(name)) return err(`模板名非法：${JSON.stringify(name)}`);
      let pipeline = null; let from = '';
      const saved = await getSaved(name).catch((e) => { throw new Error(kvDownMessage(e)); });
      if (saved && typeof saved === 'object') { pipeline = saved; from = 'saved'; } else {
        const b = builtinByName(name);
        if (b) { pipeline = b.pipeline; from = 'builtin'; }
      }
      if (!pipeline) return err(`模板不存在：${name}（list 查看全部）`);
      return ok(`模板「${name}」（${from}）：${core.describePipeline(pipeline)}\n${JSON.stringify(pipeline, null, 2)}`);
    },
  },
  {
    name: 'text_triage_delete',
    description: '删除已保存的分流模板（内置预设不可删、不受影响）。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '模板名' } },
      required: ['name'],
    },
    async call(args) {
      const name = args && args.name;
      if (!validName(name)) return err(`模板名非法：${JSON.stringify(name)}`);
      if (builtinByName(name) && !(await getSaved(name).catch(() => null))) {
        return err(`「${name}」是内置预设且未被覆盖保存，不可删除`);
      }
      try {
        await deletePipeline(name);
      } catch (e) {
        return err(kvDownMessage(e));
      }
      return ok(`已删除模板「${name}」`);
    },
  },
  {
    name: 'text_triage_list',
    description: '列出全部分流模板（内置预设 + 已保存，同名以已保存为准），含各类别/字段/规则数量概览。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      let all;
      try {
        all = await listAll();
      } catch (e) {
        return err(kvDownMessage(e));
      }
      const lines = [`共 ${all.length} 套模板：`];
      for (const item of all) {
        const head = `  [${item.from}] ${item.name}`;
        lines.push(item.pipeline ? `${head}——${core.describePipeline(item.pipeline)}${item.pipeline.description ? `｜${item.pipeline.description}` : ''}` : `${head}——（索引悬空：数据缺失或读取失败）`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'text_triage_builtin',
    description: '列出内置预设模板（log-triage 日志分级 / latency-triage 延迟阈值 / disk-triage 磁盘水位），含完整 JSON——改造自定义模板的起点。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const lines = [`内置 ${BUILTIN_PIPELINES.length} 套预设：`];
      for (const b of BUILTIN_PIPELINES) {
        lines.push(`\n【${b.name}】${b.description}`);
        lines.push(JSON.stringify(b.pipeline, null, 2));
      }
      return ok(lines.join('\n'));
    },
  },
];

// ── stdio JSON-RPC 接线 ────────────────────────────────────────────────────

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（引擎纯本地；持久化经 cap.kv 索引键）`);
