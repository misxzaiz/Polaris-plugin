'use strict';
/**
 * claim-lens MCP server 源码（esbuild bundle → mcp/server.js，发布 zip 零 node_modules）。
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 四工具：claim_extract / claim_verify / claim_verify_batch / claim_selftest
 * 引擎与面板/服务同一权威：shared/claim-core.js + server/verify-prims.js（直接 require，不经 HTTP）。
 *
 * 用途定位：宿主 AI 在「宣布完成」前自证——把回答里的文件/符号/依赖/CLI/配置声明
 * 对照用户本地仓库实证。裁决四态，证据永远随行；refuted 只在有硬证据时给出。
 */
const path = require('path');
const core = require('../shared/claim-core.js');
const prims = require('../server/verify-prims.js');
const { runSelftest } = require('../server/selftest.js');

const SERVER_INFO = { name: 'claim-lens', version: '0.1.0' };

const ROOT_DESC = '仓库根绝对路径（要核验声明的项目目录）';

const TOOLS = [
  {
    name: 'claim_extract',
    description:
      '从 AI 回答文本提取可证伪声明清单（不访问文件系统）。五类：file（文件路径）/ symbol（函数/类等标识符，自动挂同句文件）/' +
      'package（import/require/安装行；node 内置与相对路径自动排除）/ cli（命令行与 flag）/ config（点路径配置键，自动挂同句配置文件）/' +
      'version（如 Node >= 18）。适合先看「AI 到底声明了什么」再决定是否核验。纯文本分析，零外联。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'AI 回答原文（markdown 代码块与反引号都会被识别）' },
      },
      required: ['text'],
    },
  },
  {
    name: 'claim_verify',
    description:
      '一站式核验：把 text 中的可证伪声明提取出来，对照 root 仓库逐条实证，返回「裁决+证据」报告。' +
      '裁决四态：verified（证据随行）/ refuted（硬证据：文件存在但无符号、依赖无声明、--help 无此 flag…）/' +
      'partial（大小写失配、仅有引用无定义、幽灵依赖）/ unverifiable（白名单外命令、全局 API 等，绝不误证伪）。' +
      '文件类声明自动交叉 git status（在 git 仓库时）。核验 AI 自己刚写的回答时，text 传你的完整结论。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要核验的 AI 回答/结论原文' },
        root: { type: 'string', description: ROOT_DESC },
      },
      required: ['text', 'root'],
    },
  },
  {
    name: 'claim_verify_batch',
    description:
      '精确核验显式声明的批量接口（AI 自构声明，绕过提取启发式）。claims 数组，每条：' +
      '{type: file|symbol|package|cli|config|version, target, file?, subcmd?, flags?, constraint?, quote?}。' +
      '例：{type:"symbol",target:"parseConfig",file:"src/config.ts"}；{type:"cli",target:"git",subcmd:["switch"],flags:["--orphan"]}；' +
      '{type:"package",target:"zod"}；{type:"config",target:"server.port",file:"config/app.json"}；' +
      '{type:"version",target:"node",constraint:"18.0.0"}。≤300 条/次。',
    inputSchema: {
      type: 'object',
      properties: {
        claims: { type: 'array', description: '声明数组（type+target 必填）', items: { type: 'object' } },
        root: { type: 'string', description: ROOT_DESC },
      },
      required: ['claims', 'root'],
    },
  },
  {
    name: 'claim_selftest',
    description:
      '试金石自检：临时 fixture 仓上跑约 30 条断言（五类核验原语、git 交叉、大小写 partial、幽灵依赖、' +
      '注入拒绝、提取引擎去重/上下文挂载），逐一报告通过与否。纯本地计算，结束自动清理。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── 工具实现 ────────────────────────────────────────────────────────────────

function toolExtract(args) {
  const r = core.extractClaims(String(args.text == null ? '' : args.text));
  if (!r.claims.length) return { text: '未提取到可证伪声明（代码块/反引号/路径/导入语句均为空，或文本过短）。' };
  const lines = [`提取到 ${r.claims.length} 条声明（代码块 ${r.stats.codeBlocks} 个）：`];
  for (const c of r.claims) {
    const loc = c.file ? ` @${c.file}` : '';
    const flags = (c.flags || []).length ? ` ${c.flags.join(' ')}` : '';
    const cons = c.constraint ? ` (>= ${c.constraint})` : '';
    lines.push(`#${c.id} [${c.type}] ${c.target}${loc}${flags}${cons}${c.quote ? `  —「${c.quote.slice(0, 60)}」` : ''}`);
  }
  return { text: lines.join('\n') };
}

async function toolVerify(args) {
  const root = String(args.root || '').trim();
  if (!root) return { isError: true, text: '需要 root（仓库根绝对路径）' };
  if (!prims.isDir(root)) return { isError: true, text: `root 不是目录: ${root}` };
  const claims = core.extractClaims(String(args.text == null ? '' : args.text)).claims;
  if (!claims.length) return { text: `未从文本提取到可证伪声明。可直接用 claim_verify_batch 显式声明核验。root: ${root}` };
  const report = await prims.verifyClaims(root, claims);
  return { text: core.formatReport(report) };
}

async function toolVerifyBatch(args) {
  const root = String(args.root || '').trim();
  if (!root) return { isError: true, text: '需要 root（仓库根绝对路径）' };
  if (!prims.isDir(root)) return { isError: true, text: `root 不是目录: ${root}` };
  const claims = core.normalizeClaims(args.claims);
  const report = await prims.verifyClaims(root, claims);
  return { text: core.formatReport(report) };
}

async function toolSelftest() {
  const r = await runSelftest();
  const lines = r.items.map((i) => `${i.ok ? '✓' : '✗'} ${i.name}${i.ok ? '' : ` —— ${i.detail}`}`);
  return { text: `自检 ${r.pass}/${r.items.length} 通过\n${lines.join('\n')}`, isError: r.fail > 0 };
}

const HANDLERS = {
  claim_extract: (args) => toolExtract(args || {}),
  claim_verify: (args) => toolVerify(args || {}),
  claim_verify_batch: (args) => toolVerifyBatch(args || {}),
  claim_selftest: () => toolSelftest(),
};

// ── JSON-RPC over stdio（newline-delimited，house 框架；通知无回包——cron-lens 坑）──
function write(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
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
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    write({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return;
  if (method === 'tools/list') {
    write({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const handler = HANDLERS[name];
    if (!handler) {
      write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `未知工具:${name}。可用:${TOOLS.map((t) => t.name).join(', ')}` }] } });
      return;
    }
    Promise.resolve()
      .then(() => handler((params && params.arguments) || {}))
      .then((r) => {
        write({ jsonrpc: '2.0', id, result: { isError: !!r.isError, content: [{ type: 'text', text: r.text }] } });
      })
      .catch((e) => {
        process.stderr.write(`[claim-lens] tool ${name} 异常: ${e && e.stack ? e.stack : e}\n`);
        const msgText = e && e.user ? e.message : `工具内部错误:${e && e.message ? e.message : String(e)}`;
        write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: msgText }] } });
      });
    return;
  }
  if (method === 'ping') { write({ jsonrpc: '2.0', id, result: {} }); return; }
  write({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stderr.write(`[claim-lens] MCP server ${SERVER_INFO.version} ready (stdio)\n`);
