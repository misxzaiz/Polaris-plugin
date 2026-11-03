#!/usr/bin/env node
'use strict';
/**
 * Cookie & CORS 调试台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 引擎见 shared/cookie-core.js 与 shared/cors-core.js（单一权威，纯本地零外联）。
 *
 * 四工具（前缀 cookielens_）：
 *   parse_set_cookie      Set-Cookie 解析 + 逐属性诊断 + 拒收判定 + 生效范围
 *   parse_request_cookie  请求 Cookie 头键值展开 + 重复键/裸片段诊断
 *   judge_cors            CORS 场景判定（简单/预检语义，红绿灯检查表）
 *   generate              Set-Cookie 生成（round-trip 自检）或 CORS 应答头建议
 */
const cookieCore = require('../shared/cookie-core');
const corsCore = require('../shared/cors-core');

const SERVER_NAME = 'cookie-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const headerListSchema = {
  type: 'array',
  description: '头列表 [{name, value}]（同头重复时重复列出——重复 ACAO 本身就是判定项）',
  items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } } },
};

const tools = [
  {
    name: 'cookielens_parse_set_cookie',
    description: '解析一条 Set-Cookie 值并按 RFC 6265 + 浏览器强制语义诊断：SameSite=None 缺 Secure（Chrome 拒收）、__Host-/__Secure- 前缀违规、Domain 不匹配拒收、Max-Age/Expires 优先级、生效范围（domain/path/secure）。排查「cookie 没种上/突然全丢/跨站不带」必用。',
    inputSchema: {
      type: 'object',
      properties: {
        setCookie: { type: 'string', description: 'Set-Cookie 的值（带不带 "Set-Cookie:" 前缀均可）' },
        requestUrl: { type: 'string', description: '收到该响应头的页面/接口 URL（判定 Domain/Path/Secure 语义必需）' },
      },
      required: ['setCookie', 'requestUrl'],
    },
    async call(args) {
      const r = cookieCore.parseSetCookie(args && args.setCookie, args && args.requestUrl);
      if (!r.ok) return err(r.error);
      return ok(cookieCore.renderSetCookieReport(r));
    },
  },
  {
    name: 'cookielens_parse_request_cookie',
    description: '解析请求侧 Cookie 头：键值全展开 + 诊断（重复键——服务端框架取值口径不一、无 = 号裸片段、空段）。排查鉴权 cookie 被覆盖/截断类问题。',
    inputSchema: {
      type: 'object',
      properties: { header: { type: 'string', description: 'Cookie 头内容（带不带 "Cookie:" 前缀均可）' } },
      required: ['header'],
    },
    async call(args) {
      const r = cookieCore.parseRequestCookie(args && args.header);
      if (!r.ok) return err(r.error);
      const lines = [`Cookie 键值 ${r.items.length} 项：`];
      for (const it of r.items) lines.push(`  ${it.name} = ${it.value === '' ? '(空值)' : it.value.length > 100 ? it.value.slice(0, 100) + '…' : it.value}`);
      if (r.findings.length) {
        lines.push('诊断：');
        for (const f of r.findings) lines.push(`  [${f.level}] ${f.code} ${f.message}`);
      } else lines.push('诊断：无异常');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'cookielens_judge_cors',
    description: 'CORS 场景确定性判定（纯本地推演，不发请求）：输入请求侧（origin/method/headers/withCredentials）与响应侧（ACAO/ACAC/ACAM/ACAH），输出红绿灯检查表——ACAO 精确匹配与通配符、credentials 下 * 失效、ACAM/ACAH 逐项核对、重复 ACAO 失败、Authorization 预检特例，附修复建议。排查 "blocked by CORS policy" 必用。',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '发起请求页面的来源，如 https://app.example.com' },
        method: { type: 'string', description: '请求方法，缺省 GET' },
        requestHeaders: headerListSchema,
        responseHeaders: headerListSchema,
        withCredentials: { type: 'boolean', description: '是否带凭证（fetch credentials:"include" / XHR withCredentials）' },
        preflight: { type: 'boolean', description: 'true 强制按预检（OPTIONS）语义判定；缺省按简单/预检自动判' },
      },
      required: ['origin', 'responseHeaders'],
    },
    async call(args) {
      const r = corsCore.judgeCors(args);
      if (!r.ok) return err(r.error);
      return ok(corsCore.renderCorsReport(r));
    },
  },
  {
    name: 'cookielens_generate',
    description: '生成方向：kind=set-cookie 按结构生成 Set-Cookie 头（生成后 round-trip 自检，防生成非法产物）；kind=cors-advice 给出该 CORS 场景服务端应答头建议（含 credentials/预检差异）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['set-cookie', 'cors-advice'], description: '生成哪种产物' },
        spec: {
          type: 'object',
          description: 'kind=set-cookie 时：{name, value, domain?, path?, maxAge?(整数秒), expires?(日期串), secure?, httpOnly?, sameSite?(Strict|Lax|None), partitioned?, requestUrl?(自检用)}；kind=cors-advice 时：{origin, method?, requestHeaders?, withCredentials?}',
          properties: {
            name: { type: 'string' }, value: { type: 'string' },
            domain: { type: 'string' }, path: { type: 'string' },
            maxAge: { type: 'number', description: '整数秒' }, expires: { type: 'string', description: '日期串，如 "Wed, 21 Oct 2026 07:28:00 GMT"' },
            secure: { type: 'boolean' }, httpOnly: { type: 'boolean' },
            sameSite: { type: 'string', enum: ['Strict', 'Lax', 'None'] }, partitioned: { type: 'boolean' },
            requestUrl: { type: 'string' },
            origin: { type: 'string' }, method: { type: 'string' }, requestHeaders: headerListSchema, withCredentials: { type: 'boolean' },
          },
        },
      },
      required: ['kind', 'spec'],
    },
    async call(args) {
      const kind = args && args.kind;
      const spec = (args && args.spec) || {};
      if (kind === 'set-cookie') {
        const r = cookieCore.generateSetCookie(spec);
        if (!r.ok) return err(r.error);
        const notes = r.findings.filter((f) => f.level === 'error' || f.level === 'warn').map((f) => `${f.code}: ${f.message}`);
        return ok(`Set-Cookie: ${r.header}\n自检：round-trip 重解析一致，${r.verdict === 'accepted' ? '会被浏览器接受' : '注意：会被拒收'}${notes.length ? '\n' + notes.join('\n') : ''}`);
      }
      if (kind === 'cors-advice') {
        const r = corsCore.generateCorsAdvice(spec);
        if (!r.ok) return err(r.error);
        return ok(r.advice);
      }
      return err(`kind 只接受 set-cookie / cors-advice，收到 ${kind}`);
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
  // notifications/initialized 是通知（无 id）服务端不回包——按 rpc 等响应会永久挂起（cron-lens 实证坑）
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
    const args = (msg.params && msg.params.arguments) || {}; // { name, arguments } 平铺，勿再包 params 层（exec-sandbox 实证坑）
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地判定，无宿主依赖）`);
