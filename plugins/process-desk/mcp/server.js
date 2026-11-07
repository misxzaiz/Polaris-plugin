#!/usr/bin/env node
'use strict';
/**
 * server.js —— 进程透视台 MCP server（stdio JSON-RPC，零依赖）
 *
 * 与 pocket-drop 的「kv 命令中继」不同，本插件 MCP 直连服务 HTTP：
 *   - 进程诊断/kill 需要秒级同步响应与两阶段令牌时序，中继轮询会引入失败模式
 *   - 服务端口发现仍走共享事实库 cap.kv（`pdesk.meta` 心跳，30s 刷新），
 *     心跳超过 90s 视为离线并给出诚实指引
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';
const META_FRESH_MS = 90 * 1000;

function slog(msg) { process.stderr.write(`[process-desk:mcp] ${msg}\n`); }
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 服务直连（端口来自 kv 心跳）────────────────────────────────────────────
async function serviceBase() {
  const meta = await kv.kvGet('pdesk.meta').catch(() => null);
  if (!meta || typeof meta !== 'object' || !Number.isInteger(meta.port) || meta.port <= 0) {
    return null;
  }
  const age = Date.now() - (meta.lastTickAt || 0);
  if (age > META_FRESH_MS) {
    return { stale: true, meta };
  }
  return { stale: false, meta };
}

function servicePost(base, pathname, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload || {});
    const req = http.request(
      {
        hostname: '127.0.0.1', port: base, path: pathname, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-pdesk-client': 'polaris',
          Host: `127.0.0.1:${base}`,
        },
        timeout: timeoutMs || 45000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(body) }); } catch (_) {
            reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(new Error('服务响应超时')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** 调服务端点的统一入口；把「服务不可达」翻译成诚实指引 */
async function callService(pathname, payload, timeoutMs) {
  const sb = await serviceBase();
  if (!sb) {
    return { ok: false, error: '服务未上线（没有心跳）：打开「进程透视台」面板或到 设置→插件 查看服务状态后重试' };
  }
  if (sb.stale) {
    return { ok: false, error: `服务心跳已过期（${Math.round((Date.now() - sb.meta.lastTickAt) / 1000)} 秒前），服务可能刚停止：到 设置→插件 重启后重试` };
  }
  if (sb.meta.platform !== 'win32') {
    return { ok: false, error: '进程透视台仅支持 Windows 平台' };
  }
  try {
    const r = await servicePost(sb.meta.port, pathname, payload, timeoutMs);
    return r.json && typeof r.json === 'object' ? r.json : { ok: false, error: `服务返回异常（HTTP ${r.status}）` };
  } catch (e) {
    return { ok: false, error: `服务不可达（${e.message}）：打开「进程透视台」面板确认服务状态后重试` };
  }
}

// ── 工具实现 ───────────────────────────────────────────────────────────────

async function toolFindByPort(args) {
  const r = await callService('/api/port', { port: args.port });
  if (!r.ok) return { text: `查询失败：${r.error}`, isError: true };
  if (!r.entries || !r.entries.length) {
    return { text: `端口 ${r.port} 当前没有任何 TCP/UDP 连接记录（包括 TIME_WAIT），端口是空的——若你的服务仍报 EADDRINUSE，多半是刚发生的连接还在收尾，等几秒再试，或确认监听的网卡地址。` };
  }
  const lines = r.entries.map((e) => {
    const row = e.row;
    const proc = e.proc;
    const pbits = proc
      ? `${proc.name} | 内存 ${core.formatBytes(proc.ws)}${proc.path ? ` | ${core.oneLine(proc.path, 100)}` : ''}`
      : '（进程详情获取失败，可能权限不足）';
    return `- [${row.proto}${row.state ? ` ${row.state}` : ''}] ${row.local.addr}:${row.local.port} ← ${row.foreign.addr}:${row.foreign.port} | pid=${row.pid} | ${pbits}`;
  });
  const listener = r.entries.find((e) => e.row.state === 'LISTENING');
  const head = listener && listener.proc
    ? `端口 ${r.port} 的监听者是 ${listener.proc.name}（pid=${listener.proc.pid})：`
    : `端口 ${r.port} 共 ${r.entries.length} 条连接（无 LISTENING 状态，可能是出站连接或收尾中的套接字）：`;
  return { text: `${head}\n${lines.join('\n')}\n\n要结束监听进程：先 proc_detail 确认再 proc_kill（AI 调用必须传 confirm:true，并与用户确认过）。` };
}

async function toolListening() {
  const r = await callService('/api/listening', {});
  if (!r.ok) return { text: `查询失败：${r.error}`, isError: true };
  const lines = r.entries.slice(0, 120).map((e) => {
    const row = e.row;
    const pname = e.proc ? e.proc.name : '?';
    return `- ${String(row.local.port).padEnd(6)} ${String(row.proto + (row.state ? ` ${row.state}` : '')).padEnd(14)} ${row.local.addr} | pid=${row.pid} ${pname}`;
  });
  return { text: `本机监听共 ${r.entries.length} 项（端口 | 协议/状态 | 地址 | 进程）：\n${lines.join('\n')}${r.entries.length > 120 ? '\n…(已截断 120 条)' : ''}` };
}

async function toolProcList(args) {
  const r = await callService('/api/proc/list', {
    filter: args.filter, sort: args.sort, top: args.top,
  });
  if (!r.ok) return { text: `查询失败：${r.error}`, isError: true };
  if (!r.rows.length) return { text: `没有匹配「${args.filter || ''}」的进程（系统共 ${r.total} 个进程）。` };
  const lines = r.rows.map((p) => {
    const multi = p.instances > 1 ? ` | ×${p.instances} 个同名实例` : '';
    const flag = p.polaris ? ' | [Polaris 自家进程]' : '';
    return `${core.procLine(p)}${multi}${flag}`;
  });
  return { text: `进程清单（按${args.sort === 'cpu' ? 'CPU' : args.sort === 'pid' ? 'PID' : args.sort === 'name' ? '名称' : '内存'}序，匹配 ${r.matched}/${r.total}，展示前 ${r.rows.length}）：\n${lines.join('\n')}` };
}

async function toolProcDetail(args) {
  const r = await callService('/api/proc/detail', { pid: args.pid });
  if (!r.ok) return { text: `查询失败：${r.error}`, isError: true };
  if (!r.found) return { text: `进程 ${args.pid} 不存在（可能已退出）。` };
  const p = r.proc;
  const lines = [
    `pid=${p.pid} | ${p.name}${p.instances > 1 ? ` | 另有 ${p.instances - 1} 个同名实例` : ''}`,
    `路径: ${p.path || '(不可见，可能权限不足或系统进程)'}`,
    `命令行: ${p.cmd || '(不可见)'}`,
    `启动时间: ${p.started || '未知'} | CPU 累计 ${p.cpu == null ? '—' : `${p.cpu}s`} | 内存 ${core.formatBytes(p.ws)}`,
  ];
  if (p.polaris) lines.push('注意: 这是 Polaris 自家进程——结束前确认它不是正在使用的实例（kill 时需 allowProtected:true）。');
  return { text: lines.join('\n') };
}

async function toolFileLock(args) {
  const r = await callService('/api/filelock', { path: args.path }, 45000);
  if (!r.ok) return { text: `查询失败：${r.error}`, isError: true };
  if (r.error) return { text: `Restart Manager 报告异常：${r.error}\n（系统级占用如驱动/杀软内核句柄列不全，可用资源监视器核实）`, isError: true };
  if (!r.locked || !r.lockers.length) {
    return { text: `${r.path} 当前没有被任何用户态进程占用（可正常删除/移动）。若资源管理器仍报占用，可能是 Explorer 预览句柄——关掉预览窗格或稍等几秒。` };
  }
  const lines = r.lockers.map((l) => {
    const p = l.proc;
    const bits = p
      ? `${p.name} | ${core.oneLine(p.path || p.cmd || '', 100)}`
      : `${l.app || '(未知应用)'}${l.type ? ` (${l.type})` : ''}`;
    return `- pid=${l.pid} | ${bits}`;
  });
  return { text: `${r.path} 被以下进程占用：\n${lines.join('\n')}\n\n结束占用者可解锁文件：proc_detail 确认后 proc_kill（必须 confirm:true，且与用户确认过）。` };
}

async function toolProcKill(args) {
  if (args.confirm !== true) {
    return {
      text: '结束进程是破坏性动作（未保存数据会丢）。请先 proc_detail 看清楚这是什么进程、与用户确认后，再带 confirm:true 重试。树杀(treeKill)还会连带子进程。',
      isError: true,
    };
  }
  const arm = await callService('/api/kill/arm', { pid: args.pid });
  if (!arm.ok) {
    const tip = arm.needAllowProtected ? '\n（这是 Polaris 自家进程：确认是僵尸实例后，带 allowProtected:true + confirm:true 重试）' : '';
    return { text: `无法发起结束：${arm.error}${tip}`, isError: true };
  }
  const p = arm.proc || {};
  const fire = await callService('/api/kill/fire', {
    pid: args.pid,
    token: arm.token,
    treeKill: args.treeKill === true,
    allowProtected: args.allowProtected === true,
  });
  if (!fire.ok) {
    const tip = fire.needAllowProtected ? '\n（Polaris 自家进程需二次确认：带 allowProtected:true 重试）' : '';
    return { text: `结束失败：${fire.error}${tip}`, isError: true };
  }
  return { text: `已结束 ${fire.killed.name}（pid=${fire.killed.pid}）${fire.treeKill ? '，含子进程树' : ''}。动作已记入面板「审计」页。` };
}

async function toolAudit() {
  const r = await callService('/api/audit', null).catch(() => ({ ok: false, error: '审计读取失败' }));
  if (!r.ok) return { text: `读取失败：${r.error}`, isError: true };
  if (!r.items.length) return { text: '审计环为空（还没有 arm/fire/refusal 类动作）。' };
  const lines = r.items.slice(0, 30).map((e) => `- ${new Date(e.at).toLocaleString()} | ${e.op} | ${core.oneLine(JSON.stringify(e.detail), 90)} | ${core.oneLine(e.outcome, 90)}`);
  return { text: `审计环 ${r.items.length} 条（新在前，展示 30）：\n${lines.join('\n')}` };
}

async function toolSelftest() {
  const sb = await serviceBase();
  if (!sb || sb.stale) return { text: `服务离线或心跳过期${sb ? `（${Math.round((Date.now() - sb.meta.lastTickAt) / 1000)} 秒前）` : ''}，自检无法进行。`, isError: true };
  const port = sb.meta.port;
  const steps = [];
  // 1) 找到自己（端口归属链路）
  const q = await callService('/api/port', { port });
  steps.push(q.ok && q.entries.some((e) => e.row.pid === sb.meta.pid)
    ? '✓ 端口归属：服务能在 netstat 里找到自己'
    : `✗ 端口归属异常: ${q.error || '未命中自身'}`);
  // 2) 进程清单
  const l = await callService('/api/proc/list', { top: 5 });
  steps.push(l.ok && l.total > 0 ? `✓ 进程清单：共 ${l.total} 个进程` : `✗ 进程清单失败: ${l.error}`);
  // 3) 护栏拒绝（杀自己必须被拒）
  const k = await callService('/api/kill/arm', { pid: sb.meta.pid });
  steps.push(!k.ok ? '✓ 护栏：服务拒绝 arm 自身' : '✗ 护栏失效：服务竟允许 arm 自身');
  return { text: `自检（服务 v${sb.meta.version}，pid=${sb.meta.pid}，端口 ${port}）：\n${steps.join('\n')}` };
}

// ── 工具声明（description 写「适用句式」，AI 靠它匹配意图）─────────────────
const TOOLS = [
  {
    name: 'proc_find_by_port',
    description: '查一个端口被哪个进程占用（EADDRINUSE/端口冲突的第一诊断工具）。适用：「谁占了我的 9829」「端口 3000 被什么占了」「服务起不来报端口被占用」。返回监听者/连接与所属进程详情。',
    inputSchema: {
      type: 'object',
      properties: { port: { type: 'integer', description: '1-65535 的端口号' } },
      required: ['port'],
    },
    run: toolFindByPort,
  },
  {
    name: 'proc_listening',
    description: '列出本机当前全部监听端口及归属进程（端口全景）。适用：「本机都开了哪些端口」「看看有什么服务在监听」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolListening,
  },
  {
    name: 'proc_list',
    description: '列系统进程（按内存/CPU/PID/名称排序，可按名称或命令行过滤，同名多实例会标注 ×N）。适用：「有没有多余的 node 进程」「内存占用前 10」「Polaris 是不是开了好几个实例」。filter 匹配进程名/命令行/PID。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '可选：按名称/命令行/PID 过滤' },
        sort: { type: 'string', description: '可选：mem（默认）/cpu/pid/name' },
        top: { type: 'integer', description: '可选：返回条数上限，默认 200，最大 500' },
      },
    },
    run: toolProcList,
  },
  {
    name: 'proc_detail',
    description: '看一个进程的详情（路径/命令行/启动时间/内存/CPU/同名实例数）。适用：「pid 4321 是什么」「这个进程是干嘛的」。杀进程前务必先用它确认。',
    inputSchema: {
      type: 'object',
      properties: { pid: { type: 'integer', description: '进程 ID' } },
      required: ['pid'],
    },
    run: toolProcDetail,
  },
  {
    name: 'proc_find_file_lock',
    description: '查一个文件或文件夹被哪些进程占用/锁定（「文件正在被另一进程使用，无法删除」的唯一诊断工具）。适用：「这个文件删不掉谁占着」「文件夹被什么锁了」。用 Windows Restart Manager，无需管理员。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '本机绝对路径（文件或文件夹）' } },
      required: ['path'],
    },
    run: toolFileLock,
  },
  {
    name: 'proc_kill',
    description: '结束一个进程（危险动作，护栏拦截：系统关键进程/服务自身/宿主祖先链一律拒绝；Polaris 自家僵尸实例需 allowProtected:true 二次确认）。适用：「把占用 9829 的进程杀掉」「结束这个僵尸 node」。必须先 proc_detail 确认并征得用户同意，再传 confirm:true。',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'integer', description: '要结束的进程 ID' },
        confirm: { type: 'boolean', description: '必须显式传 true 才会执行' },
        treeKill: { type: 'boolean', description: '可选：连子进程树一起结束（taskkill /T /F）' },
        allowProtected: { type: 'boolean', description: 'Polaris 自家进程的二次确认位' },
      },
      required: ['pid', 'confirm'],
    },
    run: toolProcKill,
  },
  {
    name: 'proc_audit',
    description: '查看进程透视台的审计环（arm/fire/拒绝记录，新在前）。适用：「刚才杀了什么」「有没有误杀记录」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolAudit,
  },
  {
    name: 'proc_selftest',
    description: '运行进程透视台自检（端口归属链路/进程清单/护栏拒绝三段断言）。适用：「进程透视台正常吗」「自检一下」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolSelftest,
  },
];

// ── JSON-RPC stdio 主循环 ──────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

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
    handle(msg).catch((e) => {
      slog(`handle error: ${e.stack || e.message}`);
      if (msg && msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: '内部错误' } });
    });
  }
});

async function handle(msg) {
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'process-desk', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    try {
      const r = await tool.run(args);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: oneLine(r.text, 4000) }], isError: r.isError === true },
      });
    } catch (e) {
      slog(`tool ${name} 抛错: ${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `执行异常：${e.message}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

slog(`process-desk mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
