'use strict';
/**
 * main.js —— browser-desk 常驻 HTTP 服务（零框架，node ≥ 18）
 *
 * 端点：
 *   GET  /__health      → 200（含 engine 状态摘要） / 503（Chrome 缺失等）
 *   POST /dispatch      → { action, ...params }，路由到 engine 操作面
 *
 * 生命周期由宿主 PluginServiceManager（Supervisor）管理。
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 *
 * 日志走 stderr（宿主不收集插件服务 stdout；协议数据只在 HTTP 响应里）。
 */
const http = require('http');
const path = require('path');
const { createEngine } = require('./engine');
const { loadPuppeteer } = require('./puppeteer-loader');
const { VERSION } = require('../shared/core');

const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const PLUGIN_DIR = path.resolve(__dirname, '..');

function log(level, msg) {
  process.stderr.write(`[browser-desk:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const engine = createEngine({
  loadPuppeteer: () => loadPuppeteer(PLUGIN_DIR, log),
  log: { info: (m) => log('info', m), warn: (m) => log('warn', m), error: (m) => log('error', m), debug: (m) => log('debug', m) },
});

// ── action 路由表 ──────────────────────────────────────────────────────────
const ACTIONS = {
  status: () => engine.status(),
  acquire: (p) => engine.acquire(p),
  navigate: (p) => engine.navigate(p),
  search: (p) => engine.search(p),
  read: (p) => engine.read(p),
  click: (p) => engine.click(p),
  fill: (p) => engine.fill(p),
  press_key: (p) => engine.pressKey(p),
  scroll: (p) => engine.scroll(p),
  find: (p) => engine.find(p),
  screenshot: (p) => engine.screenshot(p),
  evaluate: (p) => engine.evaluate(p),
  history: (p) => engine.history(p),
  close: (p) => engine.closeTab(p),
  watch: (p) => engine.watch(p),
  wait: (p) => engine.wait(p),
};

function readBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

let lastError = null;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/__health' || req.url.startsWith('/__health?'))) {
      let engineStatus = 'stopped';
      try {
        const st = await engine.status();
        engineStatus = st.engine;
        sendJson(res, 200, {
          ok: true, status: 'ok', version: VERSION, engine: engineStatus,
          chromePath: st.chromePath, tabs: st.tabs.length,
        });
      } catch (e) {
        // 引擎异常也返回 200 + degraded（服务活着，浏览器不可用）；
        // 只有致命配置错误（如 Chrome 完全缺失）才 503，让面板给引导
        sendJson(res, 200, {
          ok: true, status: 'degraded', version: VERSION, engine: engineStatus,
          lastError: e.message,
        });
      }
      return;
    }
    if (req.method === 'POST' && (req.url === '/dispatch' || req.url.startsWith('/dispatch?'))) {
      const raw = await readBody(req);
      let payload;
      try { payload = JSON.parse(raw || '{}'); } catch (_) { payload = null; }
      if (!payload || typeof payload.action !== 'string') {
        sendJson(res, 400, { ok: false, error: 'body 需为 {action, ...params}' });
        return;
      }
      const fn = ACTIONS[payload.action];
      if (!fn) {
        sendJson(res, 400, { ok: false, error: `未知 action: ${payload.action}（可用: ${Object.keys(ACTIONS).join(', ')}）` });
        return;
      }
      const t0 = Date.now();
      try {
        const result = await fn(payload);
        sendJson(res, 200, { ok: true, result, tookMs: Date.now() - t0 });
      } catch (e) {
        lastError = e.message;
        log('warn', `action ${payload.action} 失败: ${e.message}`);
        sendJson(res, 200, { ok: false, error: e.message, tookMs: Date.now() - t0 });
      }
      return;
    }
    sendJson(res, 404, { ok: false, error: `未知道路: ${req.method} ${req.url}` });
  } catch (e) {
    lastError = e.message;
    log('error', `http 处理异常: ${e.stack || e.message}`);
    try { sendJson(res, 500, { ok: false, error: e.message }); } catch (_) { /* ignore */ }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  log('info', `browser-desk service v${VERSION} listening on 127.0.0.1:${server.address().port} (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
});

process.on('uncaughtException', (e) => {
  lastError = e.message;
  log('error', `uncaught: ${e.stack || e.message}`);
});
process.on('unhandledRejection', (e) => {
  lastError = String(e && e.message || e);
  log('error', `unhandledRejection: ${e && e.stack || e}`);
});
async function shutdown() {
  log('info', 'shutdown：关闭 Chrome...');
  try { await engine.close(); } catch (_) { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
