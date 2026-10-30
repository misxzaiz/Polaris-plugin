#!/usr/bin/env node
'use strict';
/**
 * needs-service —— 需求库面板的数据面（127.0.0.1 + token，零依赖）
 *
 * 职责：把面板的看板/详情/拍板/设置操作翻译为 shared/core.js 的条目读写。
 * 与 MCP server（../mcp/server.js）共用同一逻辑核；真相只有需求库根目录的 md 文件。
 * token 持久在 cap.kv `needs.meta`（经 IPC bridge；面板经宿主 invoke 读同一键），
 * 服务重启不换 token；bridge 不可用时降级为临时 token（面板同样读不到 kv，会提示重试）。
 * 零外网请求；只绑回环（面板经宿主 cap.http 转发访问，跨端免跨域）。
 *
 * 启动参数：node needs-service.js {{port}} {{appConfigDir}}
 * API（POST JSON，鉴权头 X-Needs-Token）：
 *   /api/list    {status?,tag?,q?} → {ok, rows}
 *   /api/show    {id} → {ok, file,title,raw,mtimeMs}
 *   /api/add     {title,...} → {ok, id,file,mtimeMs}
 *   /api/update  {id,fields?,append?,expectedMtimeMs} → {ok,file,done,mtimeMs}
 *   /api/handoff {id,stage} → {ok,file,stage,text}
 *   /api/config  {root?} → {ok,root,source,entryCount,...}
 *   /api/probe   {path} → {ok,path,exists,isDir}
 *   /__health    GET，无鉴权（宿主健康检查）
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { createCore } = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.2.0';
const PLUGIN_ID = 'needs';
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

function log(level, msg) {
  process.stderr.write(`[${PLUGIN_ID}-service:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const core = createCore({ rootArg: '', appConfigDir: APP_CONFIG_DIR });
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const KEY_META = PLUGIN_ID + '.meta';

// ── token（kv 持久；bridge 挂了用临时 token 并如实标注）──────────────────────
let tokenCache = '';
let bridgeDegraded = false;

async function initToken() {
  try {
    const meta = await kv.kvGet(KEY_META);
    tokenCache = (meta && typeof meta.token === 'string' && meta.token) || crypto.randomBytes(16).toString('hex');
    await kv.kvSet(KEY_META, {
      token: tokenCache,
      port: PORT,
      version: VERSION,
      startedAt: meta && meta.startedAt ? meta.startedAt : new Date().toISOString(),
    });
  } catch (e) {
    bridgeDegraded = true;
    tokenCache = crypto.randomBytes(16).toString('hex');
    log('warn', `bridge 不可用（${e.message}），使用临时 token（面板将无法经 kv 发现本服务，恢复后重启插件服务）`);
    log('warn', `ephemeral token=${tokenCache}（仅降级模式输出，供本机诊断/冒烟）`);
  }
}

function authorized(req) {
  if (!tokenCache) return false;
  return String(req.headers['x-needs-token'] || '') === tokenCache;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Needs-Token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  });
  res.end(body);
}

function readBody(req, capBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > capBytes) { reject(new Error(`请求体超限（>${capBytes} 字节）`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── API 路由（core 异常 → {ok:false,error}；乐观锁冲突带 code=NEEDS_CONFLICT）─
const routes = {
  list: (args) => {
    const { root, rows } = core.list(args || {});
    return { root, rows };
  },
  show: (args) => {
    if (!args || !args.id) throw new Error('缺少 id');
    return core.show(args.id);
  },
  add: (args) => core.add(args || {}),
  update: (args) => {
    if (!args || !args.id) throw new Error('缺少 id');
    return core.update(args.id, args);
  },
  handoff: (args) => {
    if (!args || !args.id || !args.stage) throw new Error('缺少 id 或 stage');
    return core.handoff(args.id, args.stage);
  },
  config: (args) => (args && args.root ? { ...core.configSet(args.root), saved: true } : core.configGet()),
  probe: (args) => core.probeDir(args && args.path),
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/__health') {
    const boot = core.rootInfo();
    sendJson(res, 200, { ok: true, version: VERSION, root: boot.root, source: boot.source, degraded: bridgeDegraded });
    return;
  }
  if (req.method !== 'POST' || !url.startsWith('/api/')) {
    sendJson(res, 404, { ok: false, error: '未知路径' });
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv needs.meta 读取）' });
    return;
  }
  const name = url.slice('/api/'.length);
  const fn = routes[name];
  if (!fn) { sendJson(res, 404, { ok: false, error: `未知 API：${name}` }); return; }
  readBody(req, 1024 * 1024)
    .then((raw) => {
      let args = {};
      if (raw) { try { args = JSON.parse(raw); } catch (_) { throw new Error('请求体不是合法 JSON'); } }
      try {
        sendJson(res, 200, { ok: true, ...fn(args) });
      } catch (e) {
        const out = { ok: false, error: e.message };
        if (e.code) out.code = e.code;
        if (e.actualMtimeMs != null) out.actualMtimeMs = e.actualMtimeMs;
        sendJson(res, 200, out);
      }
    })
    .catch((e) => sendJson(res, 200, { ok: false, error: e.message }));
});

initToken().finally(() => {
  // 绑定 127.0.0.1：面板一律经宿主 cap.http 转发访问（请求由 PC 宿主进程发出，跨端免跨域；
  // agnes/image-recognition 已验证范式），服务端口无需暴露局域网，更安全。
  server.listen(PORT, '127.0.0.1', () => {
    const boot = core.rootInfo();
    log('info', `needs service v${VERSION} listening on 127.0.0.1:${server.address().port} (root=${boot.root} source=${boot.source}${bridgeDegraded ? ', bridge degraded' : ''})`);
  });
});
