// relay_server/handler.js — 请求方法分发（替代 handler.py）。
// 单向依赖：handler → {static, proxy, db}。模块间不互相 import。
import { serveStatic } from './static.js';
import { proxyHandler } from './proxy.js';
import { dbHandler, isDbPath } from './db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
function isProxy(url) { return url.split('?')[0] === '/__proxy'; }
function isHealth(url) { return url.split('?')[0] === '/__health'; }
function errText(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(Buffer.byteLength(msg)) });
  res.end(msg);
}
function healthResponse(res, method) {
  // 健康检查：GET/HEAD 均支持；零依赖、不读文件，仅用于服务存活探测。
  const body = method === 'HEAD' ? '' : JSON.stringify({ ok: true, service: 'relay-server' });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(body)),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function dispatch(req, res, root) {
  const m = req.method;

  if (m === 'GET' || m === 'HEAD') {
    if (isHealth(req.url)) return healthResponse(res, m);
    if (isProxy(req.url)) return proxyHandler(req, res);
    return serveStatic(req, res, root);
  }

  // PUT/PATCH/DELETE 仅用于代理转发（对齐 Python do_PUT=do_POST）
  if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
    if (isProxy(req.url)) return proxyHandler(req, res);
    if (isDbPath(req.url)) return dbHandler(req, res);
    return errText(res, 405, 'method not allowed on static path');
  }

  if (m === 'OPTIONS') {
    // CORS 预检：直接返回允许的头，不走代理转发（预检请求不含 X-Relay-Target）
    res.writeHead(204, { ...CORS, 'Access-Control-Max-Age': '86400', 'Content-Length': '0' });
    return res.end();
  }

  return errText(res, 405, 'method not allowed');
}
