'use strict';
/**
 * fetcher.js —— SSRF 围栏内的受控 HTTP 抓取（零依赖，node http/https + dns）。
 *
 * 围栏纪律（diff_urls 唯一出口，测试逐项断言）：
 *   1. 仅 http/https；拒绝 URL 内嵌凭据（user:pass@）。
 *   2. IP 字面量主机：私网/回环/链路本地/CGNAT/保留段直接拒绝。
 *   3. 域名主机：DNS 全地址逐 IP 复检，任何一个私网地址即拒绝（防 rebinding）。
 *   4. 连接用 lookup 钉死到已核验地址（DNS 结果不二次漂移）。
 *   5. 重定向手动逐跳跟随（≤4）：每一跳重新过围栏；跨 host 剥 authorization/cookie；
 *      301/302/303 降级为 GET（丢 body）。
 *   6. 响应 ≤ maxBytes（超限截断并如实标注）、总时限 timeoutMs。
 *   7. 响应体按 content-type charset 解码，失败回退 utf-8→GBK→latin1。
 */
const http = require('http');
const https = require('https');
const tls = require('tls');
const dns = require('dns');
const net = require('net');
const { spawnSync } = require('child_process');
const { decodeBuffer } = require('./files');

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding', 'keep-alive']);
const MAX_REDIRECTS = 4;

/* ---------------- IP 判定 ---------------- */

function parseV4(s) {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const nums = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = parseInt(p, 10);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isPrivateV4(nums) {
  const [a, b, c] = nums;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 链路本地/云元数据
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // 192.0.0/24 + 192.0.2/24
    (a === 198 && (b === 18 || b === 19)) || // 基准测试段
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // 组播 + 保留
  );
}

/** 展开IPv6 为 8 组 16 位（支持 :: 缩写与 v4 尾部） */
function expandV6(host) {
  let s = host.toLowerCase().replace(/^\[|\]$/g, '');
  // v4-mapped 尾部
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  const v4 = parseV4(tail);
  if (v4) {
    s = s.slice(0, lastColon + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const dbl = s.indexOf('::');
  let head = [];
  let mid = [];
  let rear = [];
  if (dbl >= 0) {
    const left = s.slice(0, dbl);
    const right = s.slice(dbl + 2);
    head = left ? left.split(':') : [];
    rear = right ? right.split(':') : [];
    const fill = 8 - head.length - rear.length;
    if (fill < 0) return null;
    mid = new Array(fill).fill('0');
  } else {
    head = s.split(':');
    if (head.length !== 8) return null;
  }
  const groups = head.concat(mid, rear).map((g) => parseInt(g, 16));
  if (groups.some((g) => Number.isNaN(g))) return null;
  return groups;
}

function isPrivateV6(host) {
  const g = expandV6(host);
  if (!g) return true; // 解析不了的一律当私有处理（宁可错杀）
  if (g.every((x) => x === 0)) return true; // :: 未指定地址
  if (g[0] === 0 && g[7] === 1 && g.slice(1, 7).every((x) => x === 0)) return true; // ::1 回环
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    // ::ffff:a.b.c.d 映射地址
    return isPrivateV4([(g[6] >> 8) & 0xff, g[6] & 0xff, (g[7] >> 8) & 0xff, g[7] & 0xff]);
  }
  if (((g[0] >> 8) & 0xfe) === 0xfc) return true; // fc00::/7 ULA（按首字节判）
  if (g[0] >= 0xfe80 && g[0] <= 0xfebf) return true; // 链路本地
  if ((g[0] >> 8) === 0xff) return true; // 组播 ff00::/8
  if (g[0] === 0x2002) return true; // Teredo（内嵌 v4，保守拒绝）
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true; // NAT64 前缀
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // 文档段
  return false;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(parseV4(ip) || [0, 0, 0, 0]);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true;
}

/* ---------------- 围栏 ---------------- */

/** 静态围栏：协议/凭据/IP 字面量主机。返回 {ok:true, url:URL} 或 {ok:false, error} */
function fenceUrl(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch (_) {
    return { ok: false, error: `URL 无法解析：${String(urlStr).slice(0, 120)}` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `仅允许 http/https，收到 ${u.protocol}` };
  }
  if (u.username || u.password) {
    return { ok: false, error: '拒绝 URL 内嵌凭据（请改用请求头）' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, error: '主机名为空' };
  if (/\.?localhost$/.test(host)) {
    return { ok: false, error: '拒绝访问 localhost（对比台不做本机回调）' };
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    return { ok: false, error: `拒绝私网/保留地址：${host}` };
  }
  return { ok: true, url: u };
}

/** DNS 全地址复检：任何一个私网地址即拒绝。返回钉死地址 {address, family} */
async function vetHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`拒绝私网/保留地址：${hostname}`);
    return { address: hostname, family: net.isIPv4(hostname) ? 4 : 6 };
  }
  let addrs;
  try {
    addrs = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(`DNS 解析失败：${hostname}（${e.code || e.message}）`);
  }
  if (!addrs || !addrs.length) throw new Error(`DNS 无结果：${hostname}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`域名 ${hostname} 解析到私网/保留地址 ${a.address}，已拒绝（防 DNS rebinding）`);
    }
  }
  // 优先 IPv4（兼容性最好），否则第一个
  const v4 = addrs.find((a) => a.family === 4);
  return v4 || addrs[0];
}

function makePinnedLookup(pinned) {
  // Node 20+ 默认 autoSelectFamily（Happy Eyeballs）会以 {all:true} 调 lookup 并期待
  // 地址数组；旧路径期待 (address, family) 单值——两种约定都兼容，且地址已过围栏复检。
  return (hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    const result = options && options.all
      ? [{ address: pinned.address, family: pinned.family }]
      : [pinned.address, pinned.family];
    process.nextTick(() => callback(null, ...result));
  };
}

/* ---------------- 出网代理（CN 开发环境常态：出网须过系统代理） ---------------- */

let proxyResolver = null; // main.js 注入：async () => 用户配置字符串（''=未配置）
let systemProxyCache = { at: 0, value: null };

/** 用户显式代理配置解析：'127.0.0.1:7890' / 'http://127.0.0.1:7890' → {host,port} | null */
function parseProxyConfig(s) {
  if (!s || typeof s !== 'string') return null;
  let t = s.trim();
  if (!t || t === 'direct' || t === 'off' || t === 'none') return null;
  t = t.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const m = /^([\w.-]+):(\d{1,5})$/.exec(t);
  if (!m) return null;
  const port = parseInt(m[2], 10);
  if (port <= 0 || port > 65535) return null;
  return { host: m[1], port };
}

/** Windows 系统代理（WinINET 注册表）探测，缓存 60s。非 win32 / 未启用 → null */
function readSystemProxyWindows() {
  if (process.platform !== 'win32') return null;
  const now = Date.now();
  if (now - systemProxyCache.at < 60000) return systemProxyCache.value;
  let value = null;
  try {
    const out = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'], { encoding: 'utf8', timeout: 3000 });
    const m = /ProxyServer\s+REG_SZ\s+(\S+)/.exec(out.stdout || '');
    if (m) {
      // 格式可能是 'host:port' 或 'http=...;https=...;ftp=...'——取 https/http 段
      let raw = m[1];
      if (raw.includes('=')) {
        const seg = /(?:^|;)(?:https?|http)=(hos[^;]+)/i.exec(raw) || /(?:^|;)(?:https?|http)=([^;]+)/i.exec(raw);
        raw = seg ? seg[1] : '';
      }
      const parsed = parseProxyConfig(raw);
      const enableOut = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'], { encoding: 'utf8', timeout: 3000 });
      const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/.test(enableOut.stdout || '');
      if (parsed && enabled) value = parsed;
    }
  } catch (_) { value = null; }
  systemProxyCache = { at: now, value };
  return value;
}

function setProxyResolver(fn) {
  proxyResolver = typeof fn === 'function' ? fn : null;
  systemProxyCache = { at: 0, value: null }; // 注入即失效缓存
}

/** 解析本次出网用的代理：用户配置/env → 系统代理 → null（直连） */
async function resolveProxy() {
  if (proxyResolver) {
    try {
      const user = parseProxyConfig(await proxyResolver());
      if (user) return user;
    } catch (_) { /* 注入器失败继续走系统探测 */ }
  }
  const envP = parseProxyConfig(process.env.DIFFDESK_PROXY || '');
  if (envP) return envP;
  return readSystemProxyWindows();
}

/** CONNECT 隧道：经代理建立到 target 的原始 socket（后续按需包 TLS） */
function connectTunnel(proxy, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port, timeout: timeoutMs });
    let buf = '';
    const onFail = (msg) => {
      socket.destroy();
      reject(new Error(`代理 ${proxy.host}:${proxy.port} CONNECT 失败：${msg}`));
    };
    socket.on('connect', () => {
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: keep-alive\r\n\r\n`);
    });
    socket.on('data', function onData(c) {
      buf += c.toString('latin1');
      if (buf.includes('\r\n\r\n')) {
        socket.removeListener('data', onData);
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(buf);
        if (!m) return onFail('响应格式异常');
        if (m[1] !== '200') return onFail(`HTTP ${m[1]}`);
        socket.setTimeout(0);
        resolve(socket);
      }
    });
    socket.on('timeout', () => onFail('超时'));
    socket.on('error', (e) => onFail(e.message));
  });
}

function decodeByCharset(buf, charsetLabel) {
  if (charsetLabel) {
    try {
      return { text: new TextDecoder(charsetLabel, { fatal: true }).decode(stripBom(buf)), charset: charsetLabel };
    } catch (_) { /* 回退自动探测 */ }
  }
  return decodeBuffer(buf);
}

function stripBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3);
  return buf;
}

function charsetFromContentType(ct) {
  if (!ct) return '';
  const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(ct);
  return m ? m[1].toLowerCase() : '';
}

/**
 * 围栏内抓取（手动跟随重定向）。
 * @param opts {{method?:string, headers?:Object, body?:string, timeoutMs?:number,
 *               maxBytes?:number, maxRedirects?:number}}
 * @returns {{status, contentType, finalUrl, bodyText, charset, byteLength, truncated,
 *            redirects, elapsedMs}}
 */
async function fencedFetch(urlStr, opts) {
  const o = opts || {};
  const timeoutMs = o.timeoutMs || 15000;
  const maxBytes = o.maxBytes || 5 * 1024 * 1024;
  const maxRedirects = o.maxRedirects == null ? MAX_REDIRECTS : o.maxRedirects;
  const started = Date.now();
  let proxy = null;
  let method = (o.method || 'GET').toUpperCase();
  let headers = sanitizeHeaders(o.headers);
  let body = o.body || '';
  let currentUrl = urlStr;
  const redirects = [];

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`抓取总时限超时（${timeoutMs}ms，含重定向 ${redirects.length} 跳）`);
    }
    const fence = fenceUrl(currentUrl);
    if (!fence.ok) {
      const err = new Error(fence.error);
      err.stage = 'fence';
      throw err;
    }
    const u = fence.url;
    const pinned = await vetHost(u.hostname);
    if (hop === 0) proxy = await resolveProxy(); // 每次调用解析一次（重定向共用）
    const res = await requestOnce({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers,
      body,
      pinned,
      proxy,
      timeoutMs,
      maxBytes,
    });
    if (REDIRECT_STATUSES.has(res.status) && res.headers.location && hop < maxRedirects) {
      const next = new URL(res.headers.location, u).toString();
      const prevHost = u.host;
      const nextFence = fenceUrl(next);
      if (!nextFence.ok) {
        const err = new Error(`重定向目标被围栏拒绝：${nextFence.error}`);
        err.stage = 'fence';
        throw err;
      }
      if (nextFence.url.host !== prevHost) {
        delete headers.authorization;
        delete headers.cookie;
      }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'HEAD')) {
        method = 'GET';
        body = '';
      }
      headers = stripHopHeaders(headers);
      redirects.push({ status: res.status, location: res.headers.location.slice(0, 300) });
      currentUrl = next;
      continue;
    }
    const elapsedMs = Date.now() - started;
    const { text, charset } = decodeByCharset(res.body, charsetFromContentType(res.headers['content-type']));
    return {
      status: res.status,
      contentType: res.headers['content-type'] || '',
      finalUrl: currentUrl,
      bodyText: text,
      charset,
      byteLength: res.bodyLen,
      truncated: res.truncated,
      redirects,
      elapsedMs,
    };
  }
  throw new Error(`重定向超过 ${maxRedirects} 跳上限`);
}

function stripHopHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (BLOCKED_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function sanitizeHeaders(input) {
  const out = { accept: '*/*', 'user-agent': 'diff-desk/0.1.0 (Polaris plugin; local diff tool)' };
  if (!input) return out;
  const entries = Array.isArray(input) ? input : Object.entries(input);
  let count = 0;
  for (const [rawName, rawValue] of entries) {
    if (count >= 8) break;
    const name = String(rawName || '').trim();
    const value = String(rawValue == null ? '' : rawValue);
    if (!name || !/^[A-Za-z0-9-]+$/.test(name)) continue;
    if (BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    out[name] = value.slice(0, 4096);
    count++;
  }
  return out;
}

function requestOnce(opts) {
  const { protocol, hostname, port, path: reqPath, method, headers, body, pinned, proxy, timeoutMs, maxBytes } = opts;
  const portNum = Number(port) || (protocol === 'https:' ? 443 : 80);
  return new Promise((resolve, reject) => {
    const transport = protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname,
      port: portNum,
      path: reqPath,
      method,
      headers: {
        ...headers,
        host: headers.host || hostname + (portNum !== (protocol === 'https:' ? 443 : 80) ? `:${portNum}` : ''),
      },
      timeout: timeoutMs,
      servername: protocol === 'https:' ? hostname : undefined,
    };
    if (proxy) {
      // 代理只改传输通道（CONNECT 隧道）；围栏已在 vetHost 完成，TLS SNI/校验保持原 hostname
      reqOpts.createConnection = (connOpts, cb) => {
        connectTunnel(proxy, hostname, portNum, timeoutMs)
          .then((sock) => {
            if (protocol === 'https:') cb(null, tls.connect({ socket: sock, servername: hostname }));
            else cb(null, sock);
          })
          .catch((e) => cb(e instanceof Error ? e : new Error(String(e))));
      };
    } else {
      reqOpts.lookup = makePinnedLookup(pinned);
    }
    const req = transport.request(reqOpts,
      (res) => {
        const chunks = [];
        let total = 0;
        let truncated = false;
        res.on('data', (c) => {
          total += c.length;
          if (total <= maxBytes) {
            chunks.push(c);
          } else if (!truncated) {
            const remain = maxBytes - (total - c.length);
            if (remain > 0) chunks.push(c.subarray(0, remain));
            truncated = true;
            req.destroy(); // 超限即断流，已收部分仍可用
          }
        });
        res.on('end', () => finalize());
        res.on('close', () => finalize());
        res.on('error', (e) => {
          // 超限截断后的流错误视为正常收尾（已收部分仍可用）；其余按失败处理
          if (truncated) finalize();
          else reject(new Error(`读取响应失败：${e.message}`));
        });
        let done = false;
        function finalize() {
          if (done) return;
          done = true;
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode || 0,
            headers: {
              'content-type': String(res.headers['content-type'] || ''),
              'content-length': String(res.headers['content-length'] || ''),
              location: res.headers.location ? String(res.headers.location) : '',
            },
            body: buf,
            bodyLen: buf.length,
            truncated,
          });
        }
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error(`请求超时（${timeoutMs}ms）`));
    });
    req.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))));
    if (body && method !== 'GET' && method !== 'HEAD') req.write(body);
    req.end();
  });
}

module.exports = {
  fenceUrl, vetHost, isPrivateIp, fencedFetch, sanitizeHeaders, isPrivateV4, isPrivateV6,
  parseProxyConfig, readSystemProxyWindows, resolveProxy, setProxyResolver, connectTunnel,
};
