'use strict';
/**
 * server.js —— Diff 对比台 MCP stdio server（零依赖）。
 *
 * 协议纪律：协议数据只走 stdout，日志只走 stderr；工具内错误转
 * {content:[{type:'text'}], isError:true} 文本而非 JSON-RPC error；
 * 服务离线时抛带引导语的错误，不猜测兜底。
 *
 * 本 server 不做 diff 本体（那是 service 的单权威），只做：参数规整 →
 * HTTP 调 service（端口经 cap.kv dfx.meta 自发现，回退 manifest 9877）→
 * 文本摘要输出。
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const MANIFEST_PORT = 9877;
const KV_PREFIX = 'dfx';
const MCP_TEXT_CAP = 12000;
const MCP_PASTE_CAP = 100 * 1024; // MCP 粘贴单侧上限（更大会话里也读不动）

const kv = createKvClient({
  appConfigDir: process.argv[2] || '',
  log: (lv, msg) => console.error(`[diff-desk-mcp][${lv}] ${msg}`),
});

let cachedPort = 0;

async function resolveServicePort() {
  if (cachedPort) return cachedPort;
  // 测试钩子：仅测试进程自行注入（生产宿主不给插件注 env，不受影响）
  const testPort = parseInt(process.env.DIFFDESK_PORT || '', 10);
  if (Number.isFinite(testPort) && testPort > 0) {
    cachedPort = testPort;
    return cachedPort;
  }
  try {
    const meta = await kv.kvGet(`${KV_PREFIX}.meta`);
    if (meta && typeof meta.port === 'number' && meta.port > 0) {
      cachedPort = meta.port;
      return cachedPort;
    }
  } catch (_) { /* 落到 manifest 端口 */ }
  cachedPort = MANIFEST_PORT;
  return cachedPort;
}

function serviceRequest(method, apiPath, bodyObj, timeoutMs) {
  return resolveServicePort().then(
    (port) =>
      new Promise((resolve, reject) => {
        const data = bodyObj ? JSON.stringify(bodyObj) : '';
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: apiPath,
            method,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            },
            timeout: timeoutMs || 60000,
          },
          (res) => {
            let body = '';
            res.on('data', (c) => {
              body += c;
            });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed && parsed.ok === true) resolve(parsed.result);
                else reject(new Error((parsed && parsed.error) || `service 返回异常（HTTP ${res.statusCode}）`));
              } catch (_) {
                reject(new Error(`service 返回非 JSON（HTTP ${res.statusCode}）`));
              }
            });
          },
        );
        req.on('timeout', () => req.destroy(new Error('service 请求超时')));
        req.on('error', (e) => {
          // 端口可能漂移：清缓存让下次重新自发现
          cachedPort = 0;
          reject(new Error(
            `Diff 对比台服务不可达（${e.message}）。请到 设置→插件→Diff 对比台 检查后台服务是否运行，或在面板打开一次以自举。`,
          ));
        });
        if (data) req.write(data);
        req.end();
      }),
  );
}

function truncText(s, cap) {
  if (s.length <= cap) return s;
  return s.slice(0, cap) + `\n…（超出 ${cap} 字符上限已截断，完整结果在面板查看）`;
}

function optsFromArgs(args) {
  return {
    ignoreWhitespace: args.ignore_whitespace === true || args.ignoreWhitespace === true,
    ignoreCase: args.ignore_case === true || args.ignoreCase === true,
    ignorePaths: args.ignorePaths || args.ignore_paths,
    arrayAlign: args.arrayAlign !== false && args.array_align !== false,
  };
}

function modeFromArgs(args, fallback) {
  return args.mode === 'json' || args.mode === 'text' ? args.mode : fallback || 'auto';
}

/* ============================ 工具实现 ============================ */

async function toolDiffText(args) {
  const a = String(args.a == null ? '' : args.a);
  const b = String(args.b == null ? '' : args.b);
  if (!a && !b) throw new Error('需要 a 与 b 两段文本');
  if (a.length > MCP_PASTE_CAP || b.length > MCP_PASTE_CAP) {
    throw new Error(`MCP 粘贴对比单侧上限 ${(MCP_PASTE_CAP / 1024).toFixed(0)}KB；更大内容请用 df_diff_files 传文件路径`);
  }
  const mode = modeFromArgs(args, 'text');
  const r = await serviceRequest('POST', '/api/diff_text', {
    a,
    b,
    mode: mode === 'auto' ? undefined : mode,
    opts: optsFromArgs(args),
  });
  const head = mode === 'json' || r.kind === 'json'
    ? core.summarizeJsonDiff(r)
    : core.summarizeTextDiff(r);
  return { text: truncText(head, MCP_TEXT_CAP) };
}

async function toolDiffFiles(args) {
  if (!args.aPath || !args.bPath) throw new Error('需要 aPath 与 bPath（绝对路径）');
  const r = await serviceRequest('POST', '/api/diff_files', {
    aPath: args.aPath,
    bPath: args.bPath,
    mode: modeFromArgs(args, undefined),
    opts: optsFromArgs(args),
  });
  const metaLine = `A: ${r.aMeta.path}（${(r.aMeta.size / 1024).toFixed(1)}KB, ${r.aMeta.charset}）\nB: ${r.bMeta.path}（${(r.bMeta.size / 1024).toFixed(1)}KB, ${r.bMeta.charset}）`;
  const body = r.kind === 'json' ? core.summarizeJsonDiff(r) : core.summarizeTextDiff(r);
  return { text: truncText(`${metaLine}\n${body}`, MCP_TEXT_CAP) };
}

async function toolDiffDirs(args) {
  if (!args.aPath || !args.bPath) throw new Error('需要 aPath 与 bPath（目录绝对路径）');
  const r = await serviceRequest('POST', '/api/diff_dirs', {
    aPath: args.aPath,
    bPath: args.bPath,
    opts: {
      includeNodeModules: args.includeNodeModules === true || args.include_node_modules === true,
      maxEntries: args.maxEntries,
    },
  }, 120000);
  const meta = `A: ${r.aMeta.path}（${r.aMeta.entries} 项）\nB: ${r.bMeta.path}（${r.bMeta.entries} 项）`;
  const body = core.summarizeDirDiff(r, { maxEntries: 40 });
  return { text: truncText(`${meta}\n${body}`, MCP_TEXT_CAP) };
}

async function toolDiffUrls(args) {
  if (!args.aUrl || !args.bUrl) throw new Error('需要 aUrl 与 bUrl');
  const r = await serviceRequest('POST', '/api/diff_urls', {
    aUrl: args.aUrl,
    bUrl: args.bUrl,
    method: args.method,
    headers: args.headers,
    mode: modeFromArgs(args, undefined),
    opts: optsFromArgs(args),
  }, 60000);
  const side = (tag, s) => `${tag} ${s.url} → HTTP ${s.status}，${(s.byteLength / 1024).toFixed(1)}KB，${s.elapsedMs}ms${s.redirects ? `，重定向 ${s.redirects} 跳` : ''}${s.truncated ? '（响应超限截断）' : ''}`;
  const body = r.kind === 'json' ? core.summarizeJsonDiff(r) : core.summarizeTextDiff(r);
  return { text: truncText(`${side('A', r.aSide)}\n${side('B', r.bSide)}\n${body}`, MCP_TEXT_CAP) };
}

async function toolHistory() {
  const r = await serviceRequest('GET', '/api/history');
  if (!r.items.length) return { text: '还没有对比记录。用 df_diff_text / df_diff_files / df_diff_dirs / df_diff_urls 发起一次对比。' };
  const lines = r.items.slice(0, 20).map((it) => {
    const t = new Date(it.ts).toLocaleString();
    const s = it.stats || {};
    const statStr = it.kind === 'json'
      ? `改${s.changed || 0}/增${s.added || 0}/删${s.removed || 0}/序${s.order || 0}`
      : it.kind === 'dirs'
        ? `异${s.changed || 0}/A独${s.onlyLeft || 0}/B独${s.onlyRight || 0}`
        : `+${s.additions || 0}/-${s.deletions || 0}/~${s.modifies || 0}`;
    return `${t} [${it.kind}] ${it.label}（${statStr}）`;
  });
  return { text: `${lines.join('\n')}\n（历史仅存元数据，不存对比正文）` };
}

async function toolStatus() {
  const r = await serviceRequest('GET', '/api/status');
  return {
    text: `Diff 对比台 v${r.version} 运行中：端口 ${r.port}，pid ${r.pid}，已运行 ${(r.uptimeMs / 60000).toFixed(0)} 分钟，历史 ${r.historyCount} 条。四类对比：文本/JSON（df_diff_text、df_diff_files）、目录（df_diff_dirs）、双 URL（df_diff_urls，会发真实请求，先征得用户同意）。`,
  };
}

async function toolSelftest() {
  const r = await serviceRequest('POST', '/api/selftest', {}, 60000);
  const lines = r.items.map((it) => `${it.ok ? '✅' : '❌'} ${it.name}${it.ok ? '' : `：${it.detail || ''}`}`);
  return { text: `${lines.join('\n')}\n${r.allGreen ? '全部通过。' : '存在失败项。'}`, isError: !r.allGreen };
}

/* ============================ 工具声明 ============================ */

const TOOLS = [
  {
    name: 'df_diff_text',
    description: '对比两段文本或两个 JSON，返回差异统计与摘要（+/-/~ 行级或路径级变更清单）。适用：「比下这两段差在哪」「这两个 JSON 有什么不一样」（mode 为 json 时键序/数组顺序差异不算变更）。粘贴内容 ≤100KB；更大请用 df_diff_files。',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'string', description: 'A 侧文本/JSON 原文' },
        b: { type: 'string', description: 'B 侧文本/JSON 原文' },
        mode: { type: 'string', enum: ['text', 'json'], description: '对比模式（默认 text）' },
        ignoreWhitespace: { type: 'boolean', description: '忽略行首尾空白与连续空白' },
        ignoreCase: { type: 'boolean', description: '忽略大小写' },
        ignorePaths: { type: 'array', items: { type: 'string' }, description: 'JSON 模式：忽略的路径 glob，如 ["$.meta.updatedAt", "$.items[*].ts"]' },
        arrayAlign: { type: 'boolean', description: 'JSON 模式：数组按内容对齐（默认 true）；false 则按位置' },
      },
      required: ['a', 'b'],
    },
    run: toolDiffText,
  },
  {
    name: 'df_diff_files',
    description: '对比本机两个文件（只读，≤20MB，自动识别 UTF-8/GBK），返回差异统计与摘要。适用：「比这两个配置文件」「改前改后差在哪」。file 两侧都须给绝对路径。',
    inputSchema: {
      type: 'object',
      properties: {
        aPath: { type: 'string', description: 'A 文件绝对路径' },
        bPath: { type: 'string', description: 'B 文件绝对路径' },
        mode: { type: 'string', enum: ['text', 'json'], description: '默认 auto：两侧都能解析为 JSON 则语义对比，否则行级' },
        ignoreWhitespace: { type: 'boolean' },
        ignoreCase: { type: 'boolean' },
        ignorePaths: { type: 'array', items: { type: 'string' } },
      },
      required: ['aPath', 'bPath'],
    },
    run: toolDiffFiles,
  },
  {
    name: 'df_diff_dirs',
    description: '对比本机两个目录（只读）：哪些文件只在 A / 只在 B / 内容有差异（同大小文件做 sha256 实比）。适用:「部署前后哪些文件变了」「这两个构建产物差在哪」。默认跳过 node_modules/.git。',
    inputSchema: {
      type: 'object',
      properties: {
        aPath: { type: 'string', description: 'A 目录绝对路径' },
        bPath: { type: 'string', description: 'B 目录绝对路径' },
        includeNodeModules: { type: 'boolean', description: '是否包含 node_modules（默认不包含）' },
        maxEntries: { type: 'number', description: '每侧最多遍历条目数（默认 20000）' },
      },
      required: ['aPath', 'bPath'],
    },
    run: toolDiffDirs,
  },
  {
    name: 'df_diff_urls',
    description: '发起两次真实 HTTP 请求并对比响应（staging vs prod、发布前后同接口等）。适用：「比下这两个环境的 /api/config」。会向目标地址发出真实网络请求——调用前必须先征得用户同意；私网/元数据地址被围栏拒绝；默认自动识别 JSON 语义对比。',
    inputSchema: {
      type: 'object',
      properties: {
        aUrl: { type: 'string', description: 'A 侧完整 URL' },
        bUrl: { type: 'string', description: 'B 侧完整 URL' },
        method: { type: 'string', enum: ['GET', 'POST'], description: '默认 GET' },
        headers: { type: 'object', description: '附加请求头（如 {"Authorization": "Bearer ..."}，两侧共用，≤8 个）' },
        mode: { type: 'string', enum: ['text', 'json'], description: '默认 auto（按 content-type）' },
        ignorePaths: { type: 'array', items: { type: 'string' } },
      },
      required: ['aUrl', 'bUrl'],
    },
    run: toolDiffUrls,
  },
  {
    name: 'df_history',
    description: '最近对比记录（仅元数据：时间/类型/对象/统计，不存正文）。适用:「刚比过什么」。下一步可用对应工具重新发起同对象对比。',
    inputSchema: { type: 'object', properties: {} },
    run: toolHistory,
  },
  {
    name: 'df_status',
    description: '看 Diff 对比台服务运行状态（版本/端口/历史数）。适用:「对比台还好吗」「自检前先看下服务」。服务不可达时本工具会直接报引导错误。',
    inputSchema: { type: 'object', properties: {} },
    run: toolStatus,
  },
  {
    name: 'df_selftest',
    description: '运行内置试金石自检：行级 diff/语义 JSON/目录对比/SSRF 围栏 全链路逐项断言（零网络、不碰真实文件）。适用:「还好吗」「自检一下」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolSelftest,
  },
];

/* ============================ stdio 主循环 ============================ */

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function main() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    // eslint-disable-next-line no-cond-assign
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) void handleLine(line);
    }
  });
  process.stdin.on('end', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

async function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    console.error(`[diff-desk-mcp] 非 JSON 行已忽略：${core.oneLine(line, 100)}`);
    return;
  }
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'diff-desk', version: VERSION },
        },
      });
      return;
    }
    if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) {
      return; // 通知不回包
    }
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
      return;
    }
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
        return;
      }
      try {
        const r = await tool.run(args);
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: truncText(r.text || '', MCP_TEXT_CAP) }],
            isError: r.isError === true,
          },
        });
      } catch (e) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `执行异常：${e.message}` }], isError: true } });
      }
      return;
    }
    if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `方法不存在: ${method}` } });
    }
  } catch (e) {
    if (id !== undefined) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `内部异常：${e.message}` }], isError: true } });
    }
  }
}

main().catch((e) => {
  console.error(`[diff-desk-mcp] 启动失败：${e.message}`);
  process.exit(1);
});
