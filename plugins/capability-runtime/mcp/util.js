'use strict';
/**
 * capability-runtime — 共享基础工具（零依赖）
 *
 * 通用约束：
 *  - 日志只走 stderr（MCP over stdio 中 stdout 是协议通道，绝对神圣）
 *  - 所有 fs 写盘走原子写（tmp + rename），EPERM/EACCES 重试（AV/索引器短暂持锁）
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// ── 日志 ─────────────────────────────────────────────────────────────────────
function log(msg, ...rest) {
  const parts = [`[cap-runtime ${new Date().toISOString()}]`, msg, ...rest];
  let line;
  try {
    line = parts
      .map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
      .join(' ');
  } catch (_) {
    line = '[cap-runtime] <unserializable log>';
  }
  // 兜底：踩掉换行内的裸 \n，保证 stderr 也是逐行
  process.stderr.write(line.replace(/\r?\n/g, ' | ') + '\n');
}

// ── stdout 安全写出 ──────────────────────────────────────────────────────────
/**
 * 写一行 JSON-RPC 到 stdout。
 * 写之前 JSON.parse 回校验一次（永远不让坏帧出去），失败则丢弃并报警。
 */
function rpcWrite(obj) {
  let text;
  try {
    text = JSON.stringify(obj);
    JSON.parse(text); // 帧完整性自检（保证 stdout 上只有良构 JSON 行）
  } catch (e) {
    process.stderr.write(`[cap-runtime] rpcWrite 丢弃坏帧: ${e.message}\n`);
    return;
  }
  try {
    process.stdout.write(text + '\n');
  } catch (e) {
    process.stderr.write(`[cap-runtime] stdout 写入失败: ${e.message}\n`);
  }
}

// ── JSON 安全 ────────────────────────────────────────────────────────────────
/**
 * 解析 JSON（去除 __proto__ 污染键）。
 */
function safeParse(text, fallback = null) {
  try {
    const clean = (v) => {
      if (Array.isArray(v)) return v.map(clean);
      if (v && typeof v === 'object') {
        const out = Object.create(null);
        for (const k of Object.keys(v)) {
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
          out[k] = clean(v[k]);
        }
        return out;
      }
      return v;
    };
    return clean(JSON.parse(text));
  } catch (_) {
    return fallback;
  }
}

/** 序列化为可安全落盘/跨进程的纯数据（校验可 JSON 化 + 去 __proto__） */
function jdata(value) {
  return safeParse(JSON.stringify(value === undefined ? null : value));
}

// ── 原子写盘（Windows 现实：AV/索引器会短暂持有文件 → 带退避重试） ─────────────
const WRITE_RETRIES = [50, 150, 400, 900];

async function atomicWrite(file, text) {
  if (typeof text !== 'string') text = String(text);
  const tmp = `${file}.tmp-${process.pid}-${Date.now() % 100000}`;
  let lastErr;
  for (let i = 0; i <= WRITE_RETRIES.length; i++) {
    try {
      await fsp.writeFile(tmp, text, 'utf8');
      // NTFS 同卷 rename 是原子目录项替换
      try {
        await fsp.rename(tmp, file);
      } catch (e) {
        if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY') && fs.existsSync(file)) {
          // 目标被外部短暂持有：改用先删后换（仍有毫秒级窗口，可接受）
          await fsp.unlink(file);
          await fsp.rename(tmp, file);
        } else {
          throw e;
        }
      }
      return true;
    } catch (e) {
      lastErr = e;
      if (i < WRITE_RETRIES.length) {
        await new Promise((r) => setTimeout(r, WRITE_RETRIES[i]));
      }
    }
  }
  log(`atomicWrite 失败 ${file}: ${lastErr && lastErr.message}`);
  try { await fsp.unlink(tmp); } catch (_) { /* 忽略 */ }
  return false;
}

// ── 递归删除（Windows 上子进程退出时文件句柄晚释放 → 带重试） ─────────────────
async function rmrf(target, retries = 4) {
  for (let i = 0; ; i++) {
    try {
      await fsp.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
      return true;
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return true;
      if (i >= retries) {
        log(`rmrf 失败 ${target}: ${e && e.message}`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

// ── 环回/私网地址过滤（SSRF 防御） ───────────────────────────────────────────
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

/** IPv6 规范化：剥 zone id，IPv4-mapped 展开为 v4 */
function normalizeIp(ip) {
  if (typeof ip !== 'string') return null;
  let s = ip.split('%')[0].trim().toLowerCase();
  if (s === 'localhost') return '127.0.0.1';
  if (net.isIPv6(s)) {
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return m[1];
    // ::0.0.0.0 形式（hex 点分）→ 归一成纯 hex 后再判
    s = s.replace(/::ffff:0:(\d+\.\d+\.\d+\.\d+)$/, '::ffff:$1');
    const mapped = s.match(/^::ffff:(.+)$/);
    if (mapped && net.isIPv4(mapped[1])) return mapped[1];
  }
  return s;
}

function isLoopback(ip) {
  if (!ip) return false;
  if (net.isIPv4(ip)) return ip.startsWith('127.');
  return ip === '::1';
}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;              // 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;         // 192.168/16
    if (a === 169 && b === 254) return true;         // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1') return true;
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // ULA
    if (low.startsWith('fe80')) return true; // link-local v6
    if (low === '::' || low.startsWith('::ffff:127.')) return true;
    return false;
  }
  return true; // 不认识的格式一律按私网拒绝
}

/**
 * SSRF 防御 fetch：
 *  - dns.lookup 全 family 解析 → 对每个 IP 过滤
 *  - 用过滤后的 IP 发起连接（杜绝二次解析 rebinding）
 *  - 响应流式计数，超 maxBytes 即断流
 * 返回 { ok, status, headers, text } 或 throw Error(code)
 */
function guardedFetch(url, opts = {}, policy = {}) {
  const maxBytes = policy.maxBytes || 8 * 1024 * 1024;
  const timeoutMs = Math.min(Math.max(Number(policy.timeoutMs) || 30000, 1000), 60000);
  const timeout = Math.min(timeoutMs, 30000);

  let u;
  try { u = new URL(url); } catch (_) { return Promise.reject(Object.assign(new Error('invalid_url'), { code: 'invalid_url' })); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return Promise.reject(Object.assign(new Error(`不允许的协议: ${u.protocol}`), { code: 'bad_protocol' }));
  }

  const host = u.hostname;
  const allowPrivate = !!policy.allowPrivate;
  const port = u.port === '' ? (u.protocol === 'https:' ? 443 : 80) : Number(u.port);

  // 1) 解析（A/AAAA 全查）
  const resolveAll = () => new Promise((resolve, reject) => {
    dns.resolve4(host, (e, a4 = []) => {
      dns.resolve6(host, (e2, a6 = []) => {
        if ((e && a4.length === 0) && (e2 && a6.length === 0)) {
          // 解析不到：可能是纯数字 host 或 hosts 表 —— 回退 getaddrinfo
          dns.lookup(host, { all: true, verbatim: true }, (e3, all = []) => {
            if (e3 || all.length === 0) reject(Object.assign(new Error(`域名解析失败: ${host}`), { code: 'dns_fail' }));
            else resolve(all.map((x) => normalizeIp(x.address)));
          });
        } else {
          const ips = new Set();
          for (const a of a4) ips.add(normalizeIp(a));
          for (const a of a6) ips.add(normalizeIp(a));
          if (ips.size === 0) reject(Object.assign(new Error(`域名解析失败: ${host}`), { code: 'dns_fail' }));
          else resolve([...ips]);
        }
      });
    });
  });

  return resolveAll().then((ips) => {
    const picked = ips.filter((ip) => !(isLoopback(ip) || isPrivate(ip)) || allowPrivate);
    if (picked.length === 0) {
      throw Object.assign(new Error(`目标地址全部被拦截（环回/私网未放行）: ${host}`), { code: 'private_blocked' });
    }
    // 2) 以第一个合法 IP 发起（Host 头保留域名）
    return requestViaIp(u, picked[0], host, port, maxBytes, timeout);
  });
}

function requestViaIp(u, ip, host, port, maxBytes, timeout) {
  return new Promise((resolve, reject) => {
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;
    const headers = {
      host: u.port === '' ? `${host}` : `${host}:${u.port}`, // 名义 Host 不变
      accept: 'application/json, text/*, */*',
    };
    if (u.username || u.password) return reject(Object.assign(new Error('不支持带凭据的 URL'), { code: 'bad_url' }));
    if (opts.headers && typeof opts.headers === 'object') {
      for (const [k, v] of Object.entries(opts.headers)) {
        if (typeof k === 'string' && typeof v === 'string' && k.length < 200 && v.length < 8000) headers[k.toLowerCase()] = v;
      }
    }
    const req = mod.request(
      {
        host: ip, port, path: u.pathname + (u.search || ''),
        method: (String(opts.method || 'GET').toUpperCase().match(/^(GET|HEAD|POST)$/)) ? opts.method.toUpperCase() : 'GET',
        headers,
        timeout,
        rejectUnauthorized: isHttps,
        servername: isHttps ? host : undefined, // SNI 保留域名
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(Object.assign(new Error(`响应超过 ${maxBytes} 字节上限`), { code: 'response_too_large' }));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: jdata(res.headers) || Object.create(null),
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
        res.on('error', (e) => reject(e));
      }
    );
    // 绝对期限：req.timeout 是空闲超时（有流量不触发）。慢滴响应几字节一跳可以在
    // 8MB 上限内无限期钉住 socket —— 无论是否在流水，超时即硬销毁（P2-8 红队整改）。
    const deadline = setTimeout(() => {
      const e = Object.assign(new Error(`请求超过绝对期限 ${timeout}ms`), { code: 'fetch_deadline' });
      try { req.destroy(e); } catch (_) { /* 忽略 */ }
      reject(e);
    }, timeout);
    deadline.unref();
    const clearDeadline = () => clearTimeout(deadline);
    req.on('close', clearDeadline);
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('请求超时'), { code: 'fetch_timeout' }));
    });
    req.on('error', (e) => reject(Object.assign(e, { code: e.code || 'fetch_error' })));
    try { req.end(typeof opts.body === 'string' ? opts.body : undefined); } catch (e) { reject(e); }
  });
}

// ── 杂项 ─────────────────────────────────────────────────────────────────────
function sha256(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

function randomToken(bytes = 32) {
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('base64url');
}

/** 单行化错误文本（防止多行错误撑爆 RPC 帧） */
function errorMessage(e) {
  const m = e instanceof Error ? e.message : (typeof e === 'string' ? e : (e && e.message) || String(e));
  return String(m).replace(/\r?\n/g, ' | ').slice(0, 2000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  log, rpcWrite, safeParse, jdata, atomicWrite, rmrf,
  normalizeIp, isLoopback, isPrivate, guardedFetch,
  sha256, randomToken, errorMessage, sleep,
};
