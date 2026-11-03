#!/usr/bin/env node
'use strict';
/**
 * JWT 调试台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 引擎见 shared/jwt-core.js（单一权威）；密码学经 jwt-crypto-node.js（node:crypto）。
 * 纯本地执行，不依赖 cap.kv/宿主——无宿主时工具照常可用，token 不出本机。
 *
 * 四工具（前缀 jwtdesk_）：
 *   decode  三段拆解：header/payload/signature 结构 + claims 中英对照
 *   verify  本地验签：HS、RS、PS、ES 全档 + 时钟视角 + 审计摘要
 *   audit   安全审计：逐条中文发现（alg=none、过期、未来时、超长有效期、外链密钥…）
 *   sign    测试 token 签发：按 claims 与密钥现场铸造，联调用
 */
const core = require('../shared/jwt-core');
const nodeCrypto = require('../shared/jwt-crypto-node');

const SERVER_NAME = 'jwt-desk';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/** 审计时间：字符串 ISO → epoch ms；数字直接当 epoch ms（一参一义：nowMs 或 ISO 串都表达「审计时刻」） */
function parseNowMs(v) {
  if (v === undefined || v === null || v === '') return Date.now();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  throw new Error('nowMs 必须是 epoch 毫秒数或 ISO 时间字符串');
}

/** 从参数收集验签/签发密钥材料（字段平铺，一参一义） */
function collectMaterial(args, forSign) {
  if (forSign) {
    const m = {};
    if (typeof args.secret === 'string' && args.secret !== '') m.secret = args.secret;
    if (typeof args.privateKeyPem === 'string' && args.privateKeyPem !== '') m.privateKeyPem = args.privateKeyPem;
    if (args.privateKeyJwk !== undefined && args.privateKeyJwk !== null) {
      if (typeof args.privateKeyJwk !== 'object') throw new Error('privateKeyJwk 必须是 JWK 对象');
      m.privateKeyJwk = args.privateKeyJwk;
    }
    return m;
  }
  const m = {};
  if (typeof args.secret === 'string' && args.secret !== '') m.secret = args.secret;
  if (typeof args.publicKeyPem === 'string' && args.publicKeyPem !== '') m.publicKeyPem = args.publicKeyPem;
  if (args.publicKeyJwk !== undefined && args.publicKeyJwk !== null) {
    if (typeof args.publicKeyJwk !== 'object') throw new Error('publicKeyJwk 必须是 JWK 对象');
    m.publicKeyJwk = args.publicKeyJwk;
  }
  return m;
}

const tools = [
  {
    name: 'jwtdesk_decode',
    description: 'JWT 三段拆解：header/payload/signature 结构 + claims 中英对照表（exp/iat/nbf 换算 ISO 时间）。纯本地 base64url+JSON，token 不出本机。给 AI：拿到不明 token 先 decode 看清结构再谈别的；JWE（五段）会如实拒绝。',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'JWT compact 三段文本（可带首尾空白）' },
      },
      required: ['token'],
    },
    async call(args) {
      const token = args && args.token;
      if (typeof token !== 'string' || token.trim() === '') return err('缺少 token');
      const p = core.parseToken(token);
      if (!p.ok) return err(p.error);
      const lines = [core.renderDecodeReport(p), '', 'claims 对照：', core.renderClaimsTable(p.payload)];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'jwtdesk_verify',
    description: 'JWT 本地验签：HS256/384/512（secret 字符串）、RS*/PS*/ES*（PEM/JWK 公钥）；node:crypto timingSafeEqual 对比。同时给时钟视角（是否过期/剩余时间）与安全审计摘要。给 AI：鉴权 401 排查先验签再看过期与算法，验签失败原因会给出中文定位。',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'JWT compact 三段文本' },
        secret: { type: 'string', description: 'HS* 算法的对称密钥（原字符串）' },
        publicKeyPem: { type: 'string', description: 'RS*/PS*/ES* 的 PEM 公钥（-----BEGIN PUBLIC KEY-----）' },
        publicKeyJwk: { type: 'object', description: 'RS*/PS*/ES* 的 JWK 公钥对象（与 publicKeyPem 二选一）' },
        nowMs: { type: ['number', 'string'], description: '审计时刻：epoch 毫秒或 ISO 字符串；缺省=当前时间' },
      },
      required: ['token'],
    },
    async call(args) {
      const token = args && args.token;
      if (typeof token !== 'string' || token.trim() === '') return err('缺少 token');
      let nowMs;
      try { nowMs = parseNowMs(args.nowMs); } catch (e) { return err(e.message); }
      let material;
      try { material = collectMaterial(args, false); } catch (e) { return err(e.message); }
      const r = await core.verifyToken(token, material, nodeCrypto);
      if (!r.ok) return err(r.error);
      return ok(core.renderVerifyReport(r, nowMs));
    },
  },
  {
    name: 'jwtdesk_audit',
    description: 'JWT 安全审计（不解密钥）：alg=none、exp 缺失/已过期/5 分钟内到期、iat 未来时、有效期超一年、nbf 晚于 exp、jku/x5u 外链密钥源、crit 扩展、payload 携带疑似凭证字段等，逐条中文发现并分级（高危/需注意/提示）。给 AI：安全评审或告警排查时先跑 audit 拿发现清单。',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'JWT compact 三段文本' },
        nowMs: { type: ['number', 'string'], description: '审计时刻：epoch 毫秒或 ISO 字符串；缺省=当前时间' },
      },
      required: ['token'],
    },
    async call(args) {
      const token = args && args.token;
      if (typeof token !== 'string' || token.trim() === '') return err('缺少 token');
      let nowMs;
      try { nowMs = parseNowMs(args.nowMs); } catch (e) { return err(e.message); }
      const p = core.parseToken(token);
      if (!p.ok) return err(p.error);
      const a = core.analyzeClaims(p.header, p.payload, nowMs);
      const clock = core.tokenClock(p.payload, nowMs);
      const lines = ['token 结构：alg=' + (p.header.alg || '（无）') + '，iss=' + JSON.stringify(p.payload.iss !== undefined ? p.payload.iss : null) + '，sub=' + JSON.stringify(p.payload.sub !== undefined ? p.payload.sub : null)];
      if (clock.expIso) {
        lines.push(clock.expired === true
          ? `时钟：已过期（exp=${clock.expIso}，超时 ${core.humanizeMs(-clock.remainingMs)}）`
          : `时钟：未过期（exp=${clock.expIso}，剩余 ${core.humanizeMs(clock.remainingMs)}）`);
      } else {
        lines.push('时钟：无 exp，无法判过期');
      }
      lines.push('');
      lines.push(core.renderAuditReport(a, nowMs));
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'jwtdesk_sign',
    description: '按 claims 现场签发测试 JWT（HS* 用 secret；RS*/PS*/ES* 用 PEM/JWK 私钥），可设 expiresInSeconds 与 headerExtra。给 AI：联调/复现鉴权行为时铸造受控 token——产出仅限测试，提醒勿用生产密钥。',
    inputSchema: {
      type: 'object',
      properties: {
        alg: { type: 'string', description: 'HS256/384/512、RS256/384/512、PS256/384/512、ES256/384/512 之一' },
        secret: { type: 'string', description: 'HS* 的对称密钥' },
        privateKeyPem: { type: 'string', description: 'RS*/PS*/ES* 的 PEM 私钥（-----BEGIN PRIVATE KEY-----）' },
        privateKeyJwk: { type: 'object', description: 'RS*/PS*/ES* 的 JWK 私钥对象（与 privateKeyPem 二选一）' },
        payload: { type: 'object', description: 'claims 对象（iat 自动补；expiresInSeconds 设了才补 exp）' },
        expiresInSeconds: { type: 'number', description: '有效期秒数（相对 nowMs；设置则写入 exp）' },
        headerExtra: { type: 'object', description: '附加 header 字段（如 kid），缺省 {alg, typ:"JWT"}' },
        nowMs: { type: 'number', description: '签发时刻 epoch 毫秒；缺省=当前时间（测试可注入定格）' },
      },
      required: ['alg', 'payload'],
    },
    async call(args) {
      const alg = args && args.alg;
      if (typeof alg !== 'string' || alg === '') return err('缺少 alg');
      if (args.payload === undefined || args.payload === null || typeof args.payload !== 'object') {
        return err('缺少 payload（JSON 对象）');
      }
      let material;
      try { material = collectMaterial(args, true); } catch (e) { return err(e.message); }
      const opts = {};
      if (args.expiresInSeconds !== undefined) {
        if (typeof args.expiresInSeconds !== 'number' || !Number.isFinite(args.expiresInSeconds) || args.expiresInSeconds < 0) {
          return err('expiresInSeconds 必须是非负数字（秒）');
        }
        opts.expiresInSeconds = args.expiresInSeconds;
      }
      if (args.headerExtra !== undefined) {
        if (typeof args.headerExtra !== 'object' || args.headerExtra === null) return err('headerExtra 必须是对象');
        opts.headerExtra = args.headerExtra;
      }
      if (args.nowMs !== undefined && (typeof args.nowMs !== 'number' || !Number.isFinite(args.nowMs))) {
        return err('nowMs 必须是 epoch 毫秒数');
      }
      if (args.nowMs !== undefined) opts.nowMs = args.nowMs;
      const r = await core.signToken(alg, material, args.payload, opts, nodeCrypto);
      if (!r.ok) return err(r.error);
      return ok(core.renderSignReport(r));
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地验签，token 不出本机）`);
