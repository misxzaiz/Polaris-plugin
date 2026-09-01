// relay_server/proxy.js — /__proxy 跨域代理（替代 proxy.py）。
// 前端开「代理」后请求发到同源 /__proxy，用 X-Relay-Target 头携带真实目标；本模块服务端转发，
// 把目标响应原样回传，绕过浏览器 CORS 与混合内容限制。用 node:http/https 底层 client（比 fetch 更忠实）。
//
// 禁发头注入：浏览器 fetch 无法发送 Cookie/User-Agent/Referer 等 forbidden headers，
// 前端把它们改道为 X-Relay-H-<原名>；本模块在此还原为真实头转发，实现原生客户端等效的发送能力。
import http from 'node:http';
import https from 'node:https';

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade']);
const DROP_REQ = new Set(['host', 'content-length', 'origin', 'x-relay-target']);
// X-Relay-H-<原名> 还原后落到的真实头（小写）；不允许通过该通道伪造 hop-by-hop / Host 头
const X_RELAY_H = /^x-relay-h-(.+)$/i;
const INJECT_DENY = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'te', 'trailer', 'proxy-authorization', 'proxy-authenticate', 'content-length']);
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); // 调试代理：放过自签/内网证书

function readBody(req) {
  return new Promise((resolve) => {
    const ch = []; req.on('data', c => ch.push(c));
    req.on('end', () => resolve(Buffer.concat(ch)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function sendErr(res, code, msg, target) {
  const payload = Buffer.from(JSON.stringify({ error: msg, target: target ?? null, relayProxy: true }), 'utf-8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(payload.length),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

// 从请求头集合中提取 X-Relay-H-* 并还原为真实头。
// 同名冲突时注入值覆盖普通值（前端改道是唯一权威来源，普通头到达浏览器侧本就不可信）。
function extractInjectable(headers) {
  const inject = {};
  for (const [k, v] of Object.entries(headers)) {
    const m = X_RELAY_H.exec(k);
    if (!m) continue;
    const real = m[1].toLowerCase();
    if (INJECT_DENY.has(real)) continue;
    inject[real] = v;
  }
  return inject;
}

// 单次转发；返回 {statusCode, headers, body:Buffer}。3xx 是否跟随由调用方决定。
function once(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const h = { ...headers };
    const hasBody = body && body.length && method !== 'GET' && method !== 'HEAD';
    if (hasBody) h['content-length'] = String(body.length);
    const opts = { method, headers: h };
    if (u.protocol === 'https:') opts.agent = httpsAgent;
    const r = lib.request(u, opts, (resp) => {
      const ch = []; resp.on('data', c => ch.push(c));
      resp.on('end', () => resolve({ statusCode: resp.statusCode, headers: resp.headers, body: Buffer.concat(ch) }));
    });
    r.on('error', reject);
    if (hasBody) r.write(body);
    r.end();
  });
}

export async function proxyHandler(req, res) {
  // 目标：优先 X-Relay-Target 头，其次 ?url=
  let target = req.headers['x-relay-target'];
  if (!target) target = new URL(req.url, 'http://x').searchParams.get('url');
  if (!target) return sendErr(res, 400, 'missing X-Relay-Target header or ?url=');

  const body = await readBody(req);
  // 先提取 X-Relay-H-* 注入头（改道禁发头还原通道）
  const inject = extractInjectable(req.headers);
  const out = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (DROP_REQ.has(lk) || HOP.has(lk) || X_RELAY_H.test(k)) continue;
    out[k] = v;
  }
  // 注入还原：覆盖可能残存的同名普通头（如浏览器自动带的 cookie）
  Object.assign(out, inject);

  let method = req.method, url = target, sendBody = body, result;
  try {
    for (let hop = 0; hop <= 5; hop++) {
      result = await once(url, method, out, sendBody);
      const sc = result.statusCode, loc = result.headers.location;
      if ([301, 302, 303, 307, 308].includes(sc) && loc && hop < 5) {
        url = new URL(loc, url).toString();
        // 301/302/303 对 POST 改写为 GET 并丢 body（对齐 urllib 默认）；307/308 保持方法与 body
        if (sc === 303 || ((sc === 301 || sc === 302) && method !== 'GET' && method !== 'HEAD')) {
          method = 'GET'; sendBody = null; delete out['content-type']; delete out['Content-Type'];
        }
        continue;
      }
      break;
    }
  } catch (e) {
    return sendErr(res, 502, 'proxy fetch failed: ' + (e && e.message || e), target);
  }

  const headers = {};
  for (const [k, v] of Object.entries(result.headers)) {
    const lk = k.toLowerCase();
    if (HOP.has(lk) || lk === 'content-length' || lk === 'set-cookie') continue;
    headers[k] = v;
  }
  headers['Content-Length'] = String(result.body.length);
  headers['Access-Control-Allow-Origin'] = '*';
  headers['X-Relay-Proxy'] = '1';
  res.writeHead(result.statusCode, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(result.body);
}
