#!/usr/bin/env node
'use strict';
/**
 * server.js —— 自动化流水线 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与已交付插件（repo-lens / mcp-probe / stream-desk）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：先经 kvclient 读 cap.kv 的 flowpipe.meta 拿 {port, token}，
 * 再 127.0.0.1 直连。测试钩子（house 先例）：env FLOWPIPE_SERVICE_URL +
 * FLOWPIPE_SERVICE_TOKEN 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 八工具（AI 建管跑闭环：列 → 看 → 建/改 → 开停 → 跑 → 查状态 → 删 → 自检）：
 *   flow_list / flow_get / flow_save / flow_toggle
 *   flow_run / flow_status / flow_delete / flow_selftest
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));

const appConfigDir = process.argv[2] || '';

// ── stderr 日志（stdout 只走协议）───────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[flow-pipeline-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.FLOWPIPE_SERVICE_URL || '';
const ENV_TOKEN = process.env.FLOWPIPE_SERVICE_TOKEN || '';
const kv = createKvClient({ appConfigDir, log });
let svcInfo = null; // {base, token, at}

async function resolveService(force) {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (!force && svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('flowpipe.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('自动化流水线服务未注册（flowpipe.meta 缺失）：请先在 Polaris 打开「自动化流水线」面板拉起服务，或检查插件是否已启用');
  }
  svcInfo = { base: `http://127.0.0.1:${meta.port}`, token: meta.token, at: Date.now() };
  return svcInfo;
}

function svcRequest(method, apiPath, body, timeoutMs) {
  return resolveService(false).then((svc) => new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: new URL(svc.base).port,
      path: apiPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${svc.token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: timeoutMs || 35_000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) reject(new Error([parsed.error, ...(parsed.errors || [])].filter(Boolean).join('；') || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        } catch (_) {
          reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('服务请求超时')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
function fmtPipelineSummary(p) {
  const tg = p.trigger || { type: 'manual' };
  const trig = tg.type === 'manual' ? '手动'
    : tg.type === 'interval' ? `每 ${tg.everyMinutes} 分钟`
    : tg.type === 'daily' ? `每天 ${tg.at}`
    : 'webhook';
  const last = p.lastRun ? `${p.lastRun.status}@${String(p.lastRun.startedAt || '').replace('T', ' ').slice(0, 16)}` : '未运行过';
  return `• ${p.name}（id=${p.id}）[${p.enabled ? '启用' : '停用'}] 触发=${trig} 步骤=${p.steps} 上次=${last}`;
}

const TOOLS = [
  {
    name: 'flow_list',
    description: '列出全部自动化流水线（名称/启用状态/触发方式/步骤数/上次运行结果）。先调这个了解现状。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'flow_get',
    description: '读取一条流水线的完整定义（步骤参数、变量、触发器；敏感变量已掩码）与最近运行记录。',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '流水线 id（flow_list 可查）' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'flow_save',
    description: '创建或更新流水线定义。steps 支持 9 类步骤：http / mcp / ai / extract / template / script / kv / file / notify；触发器 trigger.type: manual / interval(everyMinutes≥5) / daily(at HH:MM) / webhook。校验失败会逐条列出可修复错误。',
    inputSchema: {
      type: 'object',
      properties: {
        pipeline: {
          type: 'object',
          description: '流水线定义：{id?(更新时必填), name, enabled?, trigger{type,...}, vars?, secrets?(变量名数组), allowLocal?(允许本机/内网目标，默认 false), steps[{type,...}]}',
        },
      },
      required: ['pipeline'],
      additionalProperties: false,
    },
  },
  {
    name: 'flow_toggle',
    description: '启用或停用一条流水线（停用后定时/webhook 不再触发）。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'], additionalProperties: false },
  },
  {
    name: 'flow_run',
    description: '立即运行一条流水线并等待结果（默认等 30 秒，最长 120 秒；超时未完可再调 flow_status 查询）。params 会注入为 {{params.xxx}} 供步骤引用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        params: { type: 'object', description: '可选运行参数，如 {"query":{"q":"x"}}' },
        waitSec: { type: 'number', description: '等待秒数 1-120，默认 30' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'flow_status',
    description: '按 runId 查询一次运行的逐步结果（每步状态/耗时/错误/输出摘要；敏感值已掩码）。flow_run 超时未完时用它跟进。',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'], additionalProperties: false },
  },
  {
    name: 'flow_delete',
    description: '删除流水线（不可恢复）。双闸：confirmName 必须与流水线名称完全一致。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, confirmName: { type: 'string', description: '流水线名称原文，用于确认' } }, required: ['id', 'confirmName'], additionalProperties: false },
  },
  {
    name: 'flow_selftest',
    description: '服务自检：SSRF 围栏判定 / 引擎回归 / kv 桥连通 / 文件白名单根目录可写性。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function toolCall(name, args) {
  switch (name) {
    case 'flow_list': {
      const r = await svcRequest('GET', '/api/pipelines');
      if (!r.pipelines || !r.pipelines.length) return '还没有流水线。可用 flow_save 创建，或引导用户在面板里从模板新建。';
      return `共 ${r.pipelines.length} 条流水线：\n${r.pipelines.map(fmtPipelineSummary).join('\n')}`;
    }
    case 'flow_get': {
      const r = await svcRequest('GET', `/api/pipelines/${encodeURIComponent(args.id)}`);
      const runs = (r.runs || []).slice(0, 3).map((x) => `  - ${x.status} ${String(x.startedAt).replace('T', ' ').slice(0, 16)} ${x.durationMs ?? ''}ms${x.error ? ` 错误:${String(x.error).slice(0, 120)}` : ''}`);
      return `流水线「${r.pipeline.name}」（${r.pipeline.enabled ? '启用' : '停用'}）：\n${JSON.stringify(r.pipeline, null, 2)}\n最近运行：\n${runs.join('\n') || '  （无）'}`;
    }
    case 'flow_save': {
      const def = args.pipeline || {};
      if (def.id) {
        const r = await svcRequest('PUT', `/api/pipelines/${encodeURIComponent(def.id)}`, { pipeline: def });
        return `已更新流水线「${r.pipeline.name}」（id=${r.pipeline.id}）`;
      }
      const r = await svcRequest('POST', '/api/pipelines', { pipeline: def });
      const hook = r.pipeline.trigger && r.pipeline.trigger.type === 'webhook'
        ? `\nwebhook 入口：POST http://127.0.0.1:<服务端口>/hook/${r.pipeline.id}，头 X-FlowPipe-Token: ${r.pipeline.trigger.token}（面板「运行记录」页可复制完整 URL）`
        : '';
      return `已创建流水线「${r.pipeline.name}」（id=${r.pipeline.id}）${hook}`;
    }
    case 'flow_toggle': {
      const get = await svcRequest('GET', `/api/pipelines/${encodeURIComponent(args.id)}`);
      const def = { ...get.pipeline, enabled: Boolean(args.enabled) };
      await svcRequest('PUT', `/api/pipelines/${encodeURIComponent(args.id)}`, { pipeline: def });
      return `流水线「${get.pipeline.name}」已${args.enabled ? '启用' : '停用'}`;
    }
    case 'flow_run': {
      const waitMs = Math.max(1, Math.min(120, Number(args.waitSec) || 30)) * 1000;
      const started = Date.now();
      const r = await svcRequest('POST', `/api/pipelines/${encodeURIComponent(args.id)}/run`, { params: args.params || {} }, 35_000);
      const runId = r.runId;
      let run = null;
      while (Date.now() - started < waitMs) {
        await new Promise((ok) => setTimeout(ok, 800));
        try {
          const s = await svcRequest('GET', `/api/runs/${encodeURIComponent(runId)}`);
          run = s.run;
          if (run && run.status !== 'queued' && run.status !== 'running') break;
        } catch (_) { /* 单次轮询失败继续 */ }
      }
      if (!run) return `运行已入队（runId=${runId}），等待查询失败，请稍后用 flow_status 查 runId=${runId}`;
      if (run.status === 'queued' || run.status === 'running') {
        const stepsDone = (run.steps || []).filter((x) => x.status !== 'running').length;
        return `运行进行中（runId=${runId}，已完成 ${stepsDone} 步）。稍后用 flow_status 查 runId=${runId}`;
      }
      return formatRun(run);
    }
    case 'flow_status': {
      const s = await svcRequest('GET', `/api/runs/${encodeURIComponent(args.runId)}`);
      return formatRun(s.run);
    }
    case 'flow_delete': {
      await svcRequest('DELETE', `/api/pipelines/${encodeURIComponent(args.id)}?confirm=${encodeURIComponent(String(args.confirmName || ''))}`);
      return `已删除流水线（id=${args.id}）`;
    }
    case 'flow_selftest': {
      const r = await svcRequest('POST', '/api/selftest', {}, 30_000);
      const c = r.checks || {};
      return [
        `自检${r.ok ? '全部通过' : '存在失败项'}（版本 ${r.version}${r.degraded ? '，kv 桥降级' : ''}）`,
        `SSRF 围栏：${c.fencePass ? '通过' : '失败'}（${(c.fence || []).length} 判定用例）`,
        `引擎回归：${c.engineOk ? '通过' : '失败'}`,
        `kv 桥：${c.bridgeOk ? '连通' : '不可达（降级只读）'}`,
        `文件根目录：${(c.writable || []).map((w) => `${w.ok ? '✓' : '✗ ' + (w.error || '')}`).join(' ; ')}`,
        `运行器空闲：${c.runnerIdle ? '是' : '否（有任务在跑/排队）'}`,
      ].join('\n');
    }
    default:
      throw new Error(`未知工具：${name}`);
  }
}

function formatRun(run) {
  const lines = [`运行 ${run.id}「${run.plName}」：${run.status.toUpperCase()}（${run.durationMs ?? '?'}ms，触发=${run.trigger}${run.missed ? '，补跑' : ''}）`];
  for (const st of run.steps || []) {
    const icon = st.status === 'ok' ? '✓' : st.status === 'skipped' ? '↷' : st.status === 'error' ? '✗' : '…';
    lines.push(`  ${icon} [${st.type}] ${st.name} ${st.durationMs ?? ''}ms${st.error ? ` — ${st.error}` : ''}${st.excerpt ? `\n      ${st.excerpt.slice(0, 200)}` : ''}`);
  }
  if (run.error) lines.push(`  失败原因：${run.error}`);
  return lines.join('\n');
}

// ── JSON-RPC 主循环（house 同款）─────────────────────────────────────────────
function writeMsg(obj) {
  try { process.stdout.write(JSON.stringify(obj) + '\n'); } catch (_) { /* 管道关闭 */ }
}
function rpcResult(id, textOrObj) {
  // 字符串 → 标准 text content；对象（initialize/tools/list 结构）→ 原样发送
  const result = typeof textOrObj === 'string'
    ? { content: [{ type: 'text', text: textOrObj }] }
    : textOrObj;
  writeMsg({ jsonrpc: '2.0', id, result });
}
function rpcError(id, code, message) {
  writeMsg({ jsonrpc: '2.0', id, error: { code, message } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    if (!msg || msg.jsonrpc !== '2.0') continue;
    const { id, method, params } = msg;
    if (method === 'initialize') {
      rpcResult(id, {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'flow-pipeline', version: '0.1.0' },
      });
      continue;
    }
    if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) continue;
    if (method === 'tools/list') { rpcResult(id, { tools: TOOLS }); continue; }
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      toolCall(name, args)
        .then((text) => rpcResult(id, text))
        .catch((e) => rpcError(id, -32000, e.message || String(e)));
      continue;
    }
    if (id !== undefined) rpcError(id, -32601, `未知方法：${method}`);
  }
});
process.stdin.on('end', () => process.exit(0));
log('info', 'MCP server 启动（8 工具）');
