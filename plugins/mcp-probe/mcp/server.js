'use strict';
/**
 * server.js —— MCP 调试台 AI 工具层（stdio JSON-RPC，零依赖）
 *
 * 与 yizhou/feed-radar 的 MCP server 同套路：零依赖手写 JSON-RPC 2.0，
 * stdout 只出协议数据，日志一律 stderr。
 *
 * 所有工具委托后台服务（service/probe.js，127.0.0.1）执行——本进程绝不 spawn MCP 服务器、
 * 绝不直连目标（单一所有者纪律）。服务地址经 cap.kv 的 probe.meta（port+token）自发现。
 *
 * 安全约定：AI 只能引用已注册档案的 serverId（外部档案 id 或 host:<mcpServerId>），
 * 不提供任何按裸命令行 spawn 的工具。
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({
  appConfigDir,
  log: (level, msg) => process.stderr.write(`[mcp-probe][kvclient][${level}] ${msg}\n`),
});

const okText = (t) => ({ content: [{ type: 'text', text: t }], isError: false });
const errText = (t) => ({ content: [{ type: 'text', text: `【失败】${t}` }], isError: true });

/* ------------------------------ 服务 HTTP 客户端 ------------------------------ */

async function serviceFetch(method, route, body) {
  const meta = await kv.kvGet('probe.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('调试台服务未就绪（probe.meta 缺失）——请打开「MCP 调试台」面板一次，或确认插件服务的自动启动已开启');
  }
  const data = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: meta.port,
        path: route,
        method,
        headers: {
          Authorization: `Bearer ${meta.token}`,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: 120000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(buf);
            if (res.statusCode !== 200 || parsed.ok !== true) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            } else resolve(parsed);
          } catch (_) {
            reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('服务请求超时（120s）')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ------------------------------ 工具实现 ------------------------------ */

function j(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (_) { return String(obj); }
}

function formatTool(t) {
  const desc = (t.description || '').replace(/\s+/g, ' ').slice(0, 160);
  return `- ${t.name}${desc ? `：${desc}` : '（无描述）'}`;
}

async function toolListServers() {
  const [host, state] = await Promise.all([
    serviceFetch('GET', '/api/host/tools'),
    serviceFetch('GET', '/api/state'),
  ]);
  const hostLines = [];
  for (const s of host.servers || []) {
    const tools = Array.isArray(s.tools) ? s.tools : [];
    hostLines.push(`## host:${s.server || s.pluginId}（插件 ${s.pluginId}，${tools.length} 工具，注入=${s.injected || '?'}）`);
    hostLines.push(...tools.map(formatTool));
  }
  const extLines = [];
  for (const p of state.profiles || []) {
    const pool = (state.pool || []).find((x) => x.serverId === p.id);
    const status = pool ? pool.status : '未连接';
    extLines.push(`## ${p.id}（${p.name}，${p.transport}${p.legacy ? '/legacy-sse' : ''}，状态=${status}）`);
    if (p.transport === 'stdio') extLines.push(`- 命令: ${p.command} ${(p.args || []).join(' ')}`.slice(0, 300));
    else extLines.push(`- URL: ${p.url}`);
  }
  const degraded = state.degraded ? '\n【注意】宿主 kv 暂不可达，档案为内存态（本进程启动时加载的副本）。' : '';
  return okText(
    `=== 宿主插件 MCP（cap.mcp 注册表，调用需 user 确认后用 probe_call_tool）===\n${hostLines.join('\n') || '（无）'}`
    + `\n\n=== 外部服务器档案 ===\n${extLines.join('\n') || '（无。可让用户在面板添加，或用 probe_scan_claude_configs 扫描 Claude 式配置）'}${degraded}`,
  );
}

async function toolConnect(args) {
  if (!args.serverId) return errText('需要 serverId（host:<mcpServerId> 或外部档案 id，见 probe_list_servers）');
  const r = await serviceFetch('POST', '/api/connect', { serverId: args.serverId });
  if (r.source === 'host') {
    const tools = r.tools || [];
    return okText(
      `宿主 MCP "${r.serverId}"：${tools.length} 个工具（注入=${r.injected || '?'}）。清单：\n${tools.map(formatTool).join('\n') || '（无工具）'}\n调用示例：probe_call_tool { serverId, tool, arguments }`,
    );
  }
  const info = r.info || {};
  return okText(
    `已连接外部服务器 "${r.profile.name}"（${r.reused ? '复用现有连接' : '新建连接'}）\n`
    + `协议版本: ${info.protocolVersion || '?'}  握手耗时: ${info.initLatencyMs ?? '?'}ms  serverInfo: ${j(info.serverInfo)}\n`
    + `工具 ${info.tools.length} 个:\n${(info.tools || []).map(formatTool).join('\n') || '（无工具）'}`
    + `\nresources=${info.resources.length} prompts=${info.prompts.length}`,
  );
}

async function toolCall(args) {
  if (!args.serverId || !args.tool) return errText('需要 serverId 与 tool');
  const r = await serviceFetch('POST', '/api/call', {
    serverId: args.serverId, tool: args.tool, arguments: args.arguments || {}, via: 'ai',
  });
  const head = r.source === undefined && r.resultJson !== undefined
    ? `宿主 MCP 调用（cap.mcp 聚合文本，${r.durationMs}ms）`
    : `外部服务器调用（${r.durationMs}ms，isError=${r.isError}）`;
  const body = r.resultJson !== undefined && r.result === undefined ? String(r.resultJson) : j(r.result);
  return okText(`${head}\n${body.length > 24000 ? `${body.slice(0, 24000)}\n…[截断]` : body}`);
}

async function toolHealth(args) {
  const r = await serviceFetch('POST', '/api/health-check', args.serverId ? { serverId: args.serverId } : {});
  const lines = (r.reports || []).map((rep) => {
    const head = `## ${rep.serverName}（${rep.kind}）—— ${rep.ok ? '✓ 通过' : '✗ 未通过'}`;
    const parts = [head];
    if (rep.error) parts.push(`连接失败: ${rep.error}`);
    if (rep.initLatencyMs != null) parts.push(`握手 ${rep.initLatencyMs}ms / tools/list ${rep.listLatencyMs ?? '?'}ms / 协议 ${rep.protocolVersion || '?'}`);
    if (rep.roundtripMs != null) parts.push(`cap.mcp 往返 ${rep.roundtripMs}ms`);
    parts.push(`工具 ${rep.toolCount} 个`);
    for (const i of rep.issues || []) parts.push(`  [${i.level}] ${i.tool}: ${i.msg}`);
    if (rep.note) parts.push(rep.note);
    return parts.join('\n');
  });
  return okText(lines.join('\n\n') || '没有可体检的服务器（先添加档案或确认宿主插件已启用）');
}

async function toolDiff(args) {
  if (!args.serverId) return errText('需要 serverId');
  const r = await serviceFetch('POST', '/api/diff', { serverId: args.serverId, snapshotId: args.snapshotId || '', via: 'ai' });
  const lines = [];
  if (r.baseAt) lines.push(`基准快照: ${r.baseSnapshotId}（${r.baseAt}）`);
  lines.push(`当前快照: ${r.currentSnapshotId}`);
  lines.push(`新增 ${r.added.length} / 移除 ${r.removed.length} / 变更 ${r.changed.length} / 不变 ${r.unchangedCount}`);
  if (r.added.length) lines.push(`新增工具:\n${r.added.map((n) => `+ ${n}`).join('\n')}`);
  if (r.removed.length) lines.push(`移除工具:\n${r.removed.map((n) => `- ${n}`).join('\n')}`);
  for (const c of r.changed || []) lines.push(`变更: ${c.name}（${c.fields.join('+')}）`);
  if (r.note) lines.push(r.note);
  return okText(lines.join('\n'));
}

async function toolRecent(args) {
  const qs = new URLSearchParams();
  if (args.serverId) qs.set('serverId', args.serverId);
  if (args.tool) qs.set('tool', args.tool);
  if (args.limit) qs.set('limit', String(args.limit));
  const r = await serviceFetch('GET', `/api/history?${qs.toString()}`);
  const lines = (r.calls || []).map((c) => {
    const flag = c.isError ? '✗' : '✓';
    return `${flag} ${c.at} ${c.serverName} :: ${c.tool}（${c.durationMs}ms，via=${c.via}）\n  args: ${c.argsText.slice(0, 200)}\n  result: ${c.resultText.slice(0, 400)}`;
  });
  return okText(`最近调用 ${r.calls.length}/${r.total} 条:\n${lines.join('\n---\n') || '（无记录）'}`);
}

async function toolScanConfigs(args) {
  const body = { scopes: args.scopes || undefined, workspace: args.workspace || '', apply: !!args.apply, keys: args.keys || undefined };
  const r = await serviceFetch('POST', '/api/profiles/import-claude', body);
  if (!r.applied) {
    const found = (r.found || []).map((c) => `- [${c.scope}] ${c.name}（${c.transport}${c.legacy ? '/legacy-sse' : ''}）key=${c.key}`);
    const fileNotes = (r.files || []).filter((f) => f.error).map((f) => `  ! ${f.path}: ${f.error}`);
    return okText(`扫描到 ${r.found.length} 个候选服务器:\n${found.join('\n') || '（无）'}\n${fileNotes.join('\n')}\n确认后用 apply:true + keys 导入为档案（不执行任何命令）。`);
  }
  return okText(`已导入 ${r.applied} 个档案（${(r.importedIds || []).join(', ')}）。档案只是登记，不会自动连接或执行。`);
}

/* ------------------------------ 协议层 ------------------------------ */

const TOOLS = [
  {
    name: 'probe_list_servers',
    description: '列出当前可调试的全部 MCP 服务器与工具清单。适用：用户说「有哪些 MCP 服务器/工具」「列出宿主插件的 MCP 工具」「我要调试某个 MCP server，先看看有什么」。返回宿主插件 MCP（host: 前缀）与外部服务器档案两组。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'probe_connect',
    description: '连接一个 MCP 服务器并返回其工具清单（含描述与参数 schema 摘要）。适用：用户说「连上 xxx」「看看 xxx 有哪些工具」。外部服务器由后台服务 spawn/建连；宿主插件直接读注册表。',
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string', description: 'host:<mcpServerId> 或外部档案 id（见 probe_list_servers）' } },
      required: ['serverId'],
    },
  },
  {
    name: 'probe_call_tool',
    description: '调用一个 MCP 工具并返回完整结果（JSON）与耗时。适用：用户说「帮我调一下 xxx 工具」「测试这个工具返回什么」。注意：工具可能有副作用，调用前应向用户确认；调试台会把每次调用记入历史。',
    inputSchema: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: 'host:<mcpServerId> 或外部档案 id' },
        tool: { type: 'string', description: '工具名' },
        arguments: { type: 'object', description: '工具参数（按其 inputSchema）' },
      },
      required: ['serverId', 'tool'],
    },
  },
  {
    name: 'probe_health_check',
    description: '体检：握手延迟、协议版本、tools/list 延迟、schema 卫生检查（缺描述/重名/非法 inputSchema）。绝不执行工具调用，零副作用。适用：用户说「体检一下」「这个 server 哪里不合规」「发布前检查」。serverId 缺省 = 体检全部外部档案。',
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string', description: '缺省体检全部外部档案；也可指定 host: 前缀做清单级体检' } },
    },
  },
  {
    name: 'probe_diff_tools',
    description: '对比某服务器当前工具清单与上次快照：新增/移除/描述或 schema 变更。用于抓「AI 看到的 schema 是旧的」类漂移。首次调用会自动拍基准快照。',
    inputSchema: {
      type: 'object',
      properties: {
        serverId: { type: 'string' },
        snapshotId: { type: 'string', description: '缺省用该服务器最近一次快照' },
      },
      required: ['serverId'],
    },
  },
  {
    name: 'probe_recent_calls',
    description: '查询最近的工具调用历史（参数/结果摘要/耗时/来源）。适用：用户说「刚才调了什么」「上次那个报错的调用」。',
    inputSchema: {
      type: 'object',
      properties: {
        serverId: { type: 'string' },
        tool: { type: 'string' },
        limit: { type: 'number', description: '缺省 50，上限 200' },
      },
    },
  },
  {
    name: 'probe_scan_claude_configs',
    description: '扫描 Claude 式 MCP 配置（~/.claude/settings.json、~/.claude.json、<workspace>/.mcp.json、.claude/settings*.json）并列出可导入的服务器；apply:true 时把候选登记为调试台档案（仅登记，不执行不连接）。适用：用户说「把我 claude 配置里的 MCP 导入调试台」。',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: '工作区路径（找 .mcp.json 用），缺省只扫全局' },
        scopes: { type: 'array', items: { type: 'string', enum: ['global', 'user', 'project', 'local'] } },
        apply: { type: 'boolean', description: 'true = 导入为档案' },
        keys: { type: 'array', items: { type: 'string' }, description: '只导入这些 key（来自上次扫描结果）' },
      },
    },
  },
];

async function callTool(name, args) {
  switch (name) {
    case 'probe_list_servers': return toolListServers(args || {});
    case 'probe_connect': return toolConnect(args || {});
    case 'probe_call_tool': return toolCall(args || {});
    case 'probe_health_check': return toolHealth(args || {});
    case 'probe_diff_tools': return toolDiff(args || {});
    case 'probe_recent_calls': return toolRecent(args || {});
    case 'probe_scan_claude_configs': return toolScanConfigs(args || {});
    default: return errText(`未知工具 ${name}`);
  }
}

let buffered = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffered += chunk;
  let idx;
  // eslint-disable-next-line no-cond-assign
  while ((idx = buffered.indexOf('\n')) >= 0) {
    const line = buffered.slice(0, idx).trim();
    buffered = buffered.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) {
      process.stderr.write(`[mcp-probe] 非 JSON 输入行丢弃: ${line.slice(0, 120)}\n`);
      continue;
    }
    handle(msg);
  }
});

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function handle(msg) {
  if (!msg || msg.id === undefined || msg.id === null) return; // 通知静默
  const id = msg.id;
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'polaris-mcp-probe', version: '0.1.0' },
      },
    });
    return;
  }
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === 'tools/call') {
    const params = msg.params || {};
    const name = params.name || '';
    const args = params.arguments || {};
    callTool(name, args).then(
      (out) => send({ jsonrpc: '2.0', id, result: out }),
      (e) => send({ jsonrpc: '2.0', id, result: errText(e.message) }),
    );
    return;
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法 ${msg.method}` } });
}

process.on('uncaughtException', (e) => process.stderr.write(`[mcp-probe][server] uncaughtException: ${e.stack || e.message}\n`));
process.stderr.write('[mcp-probe][server] MCP 工具层就绪（7 工具，委托后台服务执行）\n');
