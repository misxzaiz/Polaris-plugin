'use strict';
/**
 * server.js —— 容器工作台 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层。八工具全部只读：容器操作（启停/删除）只存在于面板通道，
 * /mcp/* 路由组在服务端就没有任何写端点——AI 通道的只读是结构保证，不是约定。
 *
 * 发现链：本进程经 cap.kv 读 `dkd.service`（{port, token}）→ 直连
 * 127.0.0.1:<port> 的 service HTTP。宿主未起或服务未起时返回可读错误。
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = core.VERSION;
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[docker-desk:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── service HTTP 客户端 ─────────────────────────────────────────────────────

let cachedSvc = null;

async function serviceInfo() {
  if (cachedSvc && Date.now() - cachedSvc.at < 30000) return cachedSvc.info;
  const info = await kv.kvGet('dkd.service').catch(() => null);
  if (!info || !Number.isFinite(info.port) || !info.token) {
    throw new Error('docker-desk 服务不可达：宿主未启动或服务未就绪（可在面板打开「容器工作台」后重试）');
  }
  // 心跳过期（service 每 30s 心跳；被强杀时 kv 残留的记录 updatedAt 会停滞）
  if (info.updatedAt && Date.now() - info.updatedAt > 120000) {
    throw new Error('docker-desk 服务记录已过期（>2 分钟无心跳，服务可能被强杀）。请重新打开「容器工作台」面板让服务重启后再试。');
  }
  cachedSvc = { info, at: Date.now() };
  return info;
}

function invalidateService() { cachedSvc = null; }

function svcRequest(method, path, timeoutMs) {
  return serviceInfo().then((svc) => new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: svc.port,
      path,
      method,
      headers: {
        Authorization: `Bearer ${svc.token}`,
        'Content-Length': 0,
      },
      timeout: timeoutMs || 20000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            reject(err);
          } else resolve(parsed);
        } catch (_) {
          reject(new Error(`service 返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('service 请求超时')));
    req.on('error', (e) => {
      invalidateService(); // 连接失败大概率是服务已重启/端口漂移，强制下次重读 kv
      reject(e);
    });
    req.end();
  }));
}

// ── 工具输出格式化 ──────────────────────────────────────────────────────────

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(e) { return { content: [{ type: 'text', text: `✗ ${e && e.message ? e.message : String(e)}` }], isError: true }; }

function fmtContainer(c) {
  const bits = [
    `${c.name} [${c.id}]`,
    c.image,
    `${c.stateText}${c.status ? ` (${oneLine(c.status, 40)})` : ''}`,
    c.ports.length ? c.ports.join(' ') : '无端口映射',
  ];
  if (c.composeProject) bits.push(`compose:${c.composeProject}/${c.composeService || '?'}`);
  return bits.join('  ');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

async function toolStatus() {
  const r = await svcRequest('GET', '/mcp/status');
  const e = r.engine || {};
  if (e.status !== 'ok') {
    return ok(`Docker 引擎未连接：${e.error || '未知原因'}\n端点：${e.endpoint ? e.endpoint.target : '—'}\n\n提示：确认 Docker Desktop/Engine 已启动；或设置 DOCKER_HOST。插件自身运行正常（service v${r.engine.version}，事件缓冲 ${r.engine.eventsBuffered} 条）。`);
  }
  return ok(`Docker 引擎已连接：
- 端点：${e.endpoint.target}
- 引擎版本：${e.daemonVersion || '?'}（API ${e.apiVersion || '?'}，${e.osType || '?'}/${e.arch || '?'})
- 容器：运行中 ${e.runningContainers != null ? e.runningContainers : '?'} / 全部 ${e.totalContainers != null ? e.totalContainers : '?'}
- 事件缓冲：${e.eventsBuffered} 条`);
}

async function toolPs(args) {
  const all = !!args.all;
  const r = await svcRequest('GET', `/mcp/ps${all ? '?all=1' : ''}`);
  const items = r.items || [];
  if (!items.length) return ok(all ? '没有任何容器（包括已停止的）。' : '没有运行中的容器。用 dk_ps {all:true} 查看含已退出的全部容器。');
  const g = r.grouped || { projects: [], loose: items };
  const parts = [];
  for (const proj of g.projects || []) {
    parts.push(`【compose 项目 ${proj.name}】${proj.running}/${proj.total} 运行中`);
    for (const c of proj.items) parts.push(`  ${fmtContainer(c)}`);
  }
  if ((g.loose || []).length) {
    parts.push('【独立容器】');
    for (const c of g.loose) parts.push(fmtContainer(c));
  }
  return ok(`共 ${items.length} 个容器${all ? '（含已停止）' : ''}：\n${parts.join('\n')}\n\n提示：dk_logs {nameOrId} 看日志；dk_inspect {nameOrId} 看详情。`);
}

async function toolLogs(args) {
  const nameOrId = String(args.nameOrId || '');
  if (!nameOrId) return err(new Error('nameOrId 必填（用 dk_ps 查容器）'));
  const tail = Math.min(parseInt(args.tail, 10) || core.LIMITS.MCP_LOG_TAIL, core.LIMITS.LOG_LINES_MAX);
  const filter = typeof args.filter === 'string' ? args.filter.trim().toLowerCase() : '';
  const r = await svcRequest('GET', `/mcp/logs?nameOrId=${encodeURIComponent(nameOrId)}&tail=${tail}`);
  let lines = r.lines || [];
  const total = lines.length;
  if (filter) lines = lines.filter((l) => l.text.toLowerCase().includes(filter));
  if (!lines.length) {
    return ok(`容器 ${r.name}（${r.image}，${r.stateText || r.state}）最近 ${total} 行里没有匹配「${filter || '任何内容'}」的日志。${total === 0 ? '（容器可能还没有输出）' : ''}`);
  }
  const body = lines.map((l) => `[${l.stream === 'stderr' ? 'ERR' : 'OUT'}] ${l.text}`).join('\n');
  const clipped = body.length > 60000 ? `${body.slice(0, 60000)}…[输出截断]` : body;
  return ok(`容器 ${r.name}（${r.image}）最后 ${lines.length}${total > lines.length ? `/${total}` : ''} 行${r.truncated ? '（已达 tail 上限）' : ''}${filter ? `，按「${filter}」过滤` : ''}：
${clipped}`);
}

async function toolInspect(args) {
  const nameOrId = String(args.nameOrId || '');
  if (!nameOrId) return err(new Error('nameOrId 必填'));
  const showEnv = !!args.showEnv;
  const r = await svcRequest('GET', `/mcp/inspect?nameOrId=${encodeURIComponent(nameOrId)}${showEnv ? '&showEnv=1' : ''}`);
  let text = r.inspect || '';
  if (text.length > core.LIMITS.MCP_INSPECT_CHARS) text = `${text.slice(0, core.LIMITS.MCP_INSPECT_CHARS)}…[截断]`;
  const notes = [];
  if (r.envMasked) notes.push('env 值已打码（防密钥进 AI 上下文；用户明确同意后可传 showEnv:true 查看）');
  if (r.truncated) notes.push('内容已截断');
  return ok(`容器 ${r.name} inspect（JSON）：
${text}${notes.length ? `\n\n注：${notes.join('；')}` : ''}`);
}

async function toolStats(args) {
  const nameOrId = args.nameOrId ? String(args.nameOrId) : '';
  const r = await svcRequest('GET', `/mcp/stats${nameOrId ? `?nameOrId=${encodeURIComponent(nameOrId)}` : ''}`);
  const items = r.items || [];
  if (!items.length) return ok('没有运行中的容器，无 stats 可报。');
  const lines = items.map((s) => `${s.name}  CPU ${s.cpuPct}%  内存 ${core.fmtBytes(s.memUsed)}/${core.fmtBytes(s.memLimit)} (${s.memPct != null ? `${s.memPct}%` : '—'})  网络 ↑${core.fmtBytes(s.netTx)} ↓${core.fmtBytes(s.netRx)}  块IO 读${core.fmtBytes(s.blkRead)} 写${core.fmtBytes(s.blkWrite)}`);
  return ok(`${items.length} 个运行中容器的资源快照（单帧，非持续监控）：\n${lines.join('\n')}`);
}

async function toolImages() {
  const r = await svcRequest('GET', '/mcp/images');
  const items = r.items || [];
  const df = r.df;
  const head = items.length
    ? `共 ${items.length} 个镜像：\n${items.slice(0, core.LIMITS.MCP_ROWS).map((i) => `${i.repo}:${i.tag}  [${i.id}]  ${core.fmtBytes(i.size)}${i.containers ? `  被 ${i.containers} 个容器使用` : '  未被使用'}`).join('\n')}`
    : '没有任何镜像。';
  const tail = df ? `\n\n磁盘占用：镜像 ${core.fmtBytes(df.imagesSize)}（含 ${df.danglingCount} 个 dangling）、容器层 ${core.fmtBytes(df.containersSize)}、卷 ${core.fmtBytes(df.volumesSize)}、构建缓存 ${core.fmtBytes(df.reclaimBuildCache)}。可回收约 ${core.fmtBytes(df.reclaimable)}（删除容器/镜像请在面板操作，AI 无删除权限）。` : '';
  return ok(`${head}${tail}`);
}

async function toolEvents(args) {
  const limit = Math.min(parseInt(args.limit, 10) || 100, core.LIMITS.EVENTS_RING);
  const r = await svcRequest('GET', `/mcp/events?limit=${limit}`);
  const items = r.items || [];
  if (!items.length) return ok(`暂无容器事件（事件泵${r.pumpRunning ? '运行中，等待事件发生' : '未运行——引擎可能未连接'}）。`);
  const lines = items.map((e) => {
    const extra = Object.entries(e.attrs || {}).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${new Date(e.time).toLocaleString('zh-CN', { hour12: false })}  ${e.type}/${e.action}  ${e.actor}${extra ? `  ${extra}` : ''}`;
  });
  return ok(`最近 ${items.length} 条容器事件（新→旧，service 内存环形缓冲）：\n${lines.join('\n')}`);
}

async function toolSelftest() {
  const r = await svcRequest('POST', '/mcp/selftest');
  const s = r.selftest || {};
  const lines = (s.checks || []).map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
  return ok(`自检 ${s.passed}/${s.total} 通过（引擎状态：${s.engineStatus === 'ok' ? '已连接' : '未连接——纯逻辑自检仍全部执行'}）：
${lines.join('\n')}`);
}

// ── MCP 协议层 ──────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'dk_status',
    description: '查看 Docker 引擎连接状态与概览（端点/版本/容器计数/事件缓冲）。排查「AI 看不到容器」先调这个。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dk_ps',
    description: '列出容器（默认只看运行中；all:true 含已退出/已创建），含 compose 项目分组、端口映射、状态。所有 dk_* 工具的入口。',
    inputSchema: {
      type: 'object',
      properties: { all: { type: 'boolean', description: '是否包含已停止的容器' } },
    },
  },
  {
    name: 'dk_logs',
    description: '取容器日志尾部（stdout/stderr 已合并标注），可按关键字过滤。排查崩溃/OOM/报错的首选工具。',
    inputSchema: {
      type: 'object',
      properties: {
        nameOrId: { type: 'string', description: '容器名或 id（前缀即可，来自 dk_ps）' },
        tail: { type: 'number', description: '行数，默认 200，上限 1000' },
        filter: { type: 'string', description: '可选关键字过滤（大小写不敏感）' },
      },
      required: ['nameOrId'],
    },
  },
  {
    name: 'dk_inspect',
    description: '容器详情（JSON）：状态/退出码/OOMKilled/端口/挂载/标签/env。env 值默认打码防密钥进上下文（用户明确同意可传 showEnv:true）。',
    inputSchema: {
      type: 'object',
      properties: {
        nameOrId: { type: 'string' },
        showEnv: { type: 'boolean', description: '仅当用户明确同意查看明文 env 时才传 true' },
      },
      required: ['nameOrId'],
    },
  },
  {
    name: 'dk_stats',
    description: '运行中容器的资源快照（单帧）：CPU%/内存/网络/块 IO。不传 nameOrId 则返回全部运行中容器。',
    inputSchema: {
      type: 'object',
      properties: { nameOrId: { type: 'string', description: '可选；不传=全部运行中容器' } },
    },
  },
  {
    name: 'dk_images',
    description: '列出镜像与磁盘占用汇总（含 dangling 数量与可回收估算）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dk_events',
    description: '最近容器事件流水（service 内存环形缓冲，新→旧）：启动/退出/OOM/健康检查等，回答「容器为什么重启了」。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '条数，默认 100，上限 500' } },
    },
  },
  {
    name: 'dk_selftest',
    description: '插件自检：纯逻辑断言（解析/demux/公式）+ 引擎连通状态。全部只读，无副作用。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const HANDLERS = {
  dk_status: toolStatus,
  dk_ps: toolPs,
  dk_logs: toolLogs,
  dk_inspect: toolInspect,
  dk_stats: toolStats,
  dk_images: toolImages,
  dk_events: toolEvents,
  dk_selftest: toolSelftest,
};

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
    try { msg = JSON.parse(line); } catch (e) { slog(`非 JSON 行: ${oneLine(line, 100)}`); continue; }
    handleMsg(msg).catch((e) => slog(`handleMsg 异常: ${e.message}`));
  }
});

async function handleMsg(msg) {
  const { id, method } = msg;
  try {
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'docker-desk', version: VERSION },
      } });
    } else if (method === 'notifications/initialized') {
      // 无需响应
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const fn = HANDLERS[name];
      if (!fn) {
        send({ jsonrpc: '2.0', id, result: err(new Error(`未知工具 ${name}`)) });
        return;
      }
      try {
        const r = await fn(args);
        send({ jsonrpc: '2.0', id, result: r });
      } catch (e) {
        send({ jsonrpc: '2.0', id, result: err(e) });
      }
    } else if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法 ${method}` } });
    }
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, result: err(e) });
  }
}
