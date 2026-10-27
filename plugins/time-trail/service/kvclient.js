'use strict';
/**
 * kvclient.js —— Polaris IPC Bridge 客户端（刻漏服务专用，零依赖）
 *
 * 与 pocket-host / page-sentinel 的 kvclient 同一套路（实测可靠样板，勿改协议）：
 * 全部数据读写经 router_dispatch（target=cap.kv）透传到宿主 SqliteStorage
 * domain=kv，与面板 / MCP server 共享同一份事实库。
 *
 * 端点自发现（Polaris 不向插件服务注入环境变量，须自行定位）：
 *   1. env POLARIS_HOST + POLARIS_PORT + POLARIS_TOKEN（若未来宿主注入则优先生效）
 *   2. anchor.json → dataRoot/config.json（web.port/token）
 *      兜底候选：APP_CONFIG_DIR/config.json、%APPDATA%/Polaris/config.json 等
 *   3. 从 config 端口向上扫描 25 个端口，/api/health 200 即命中
 *
 * 鉴权：Authorization: Bearer md5(web.token)，与宿主 web middleware 对齐。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SCAN_PORTS = 25;
const HEALTH_TIMEOUT_MS = 1200;
const REQUEST_TIMEOUT_MS = 30000;

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex');
}

function configCandidates(appConfigDir) {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过不可读候选 */ }
  }
  if (appConfigDir) cands.push(path.join(appConfigDir, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

function loadWebConfig(appConfigDir) {
  for (const p of configCandidates(appConfigDir)) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number' && web.port > 0) {
        return { host: web.host || '', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthOnce(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/api/health', timeout: HEALTH_TIMEOUT_MS },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function resolveEndpoint(appConfigDir) {
  const envHost = process.env.POLARIS_HOST || '';
  const envPort = parseInt(process.env.POLARIS_PORT || '', 10);
  if (envHost && Number.isFinite(envPort)) {
    return { host: envHost, port: envPort, token: process.env.POLARIS_TOKEN || '', via: 'env' };
  }
  const cfg = loadWebConfig(appConfigDir);
  const cfgHost = (cfg && cfg.host) || '';
  const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
  const basePort = cfg ? cfg.port : 3000;
  const token = cfg ? cfg.token : '';
  for (let i = 0; i < SCAN_PORTS; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (await healthOnce(host, basePort + i)) {
      return { host, port: basePort + i, token, via: 'scan' };
    }
  }
  return { host, port: basePort, token, via: 'fallback' };
}

/**
 * @param opts {{appConfigDir?: string, log?: (level:string,msg:string)=>void}}
 */
function createKvClient(opts) {
  const log = (opts && opts.log) || (() => {});
  const appConfigDir = (opts && opts.appConfigDir) || '';
  let endpointPromise = null;
  let endpoint = null;

  function getEndpoint(force) {
    if (!endpointPromise || force) {
      endpointPromise = resolveEndpoint(appConfigDir).then((ep) => {
        endpoint = ep;
        log('info', `bridge endpoint: ${ep.host}:${ep.port} (via ${ep.via}${ep.token ? ', authed' : ', noauth'})`);
        return ep;
      });
    }
    return endpointPromise;
  }

  /**
   * POST /api/router-dispatch。重试 2 次指数退避（幂等读安全；宿主侧写入为
   * 单命令原子操作，重试不产生双写）。
   */
  function dispatch(target, payload, { retries = 2, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const attempt = (n) => getEndpoint().then((ep) => new Promise((resolve, reject) => {
      const data = JSON.stringify({ req: { target, payload } });
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      };
      if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
      const req = http.request(
        {
          hostname: ep.host, port: ep.port, path: '/api/router-dispatch',
          method: 'POST', headers, timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed);
            } catch (_) {
              reject(new Error(`bridge 返回非 JSON（HTTP ${res.statusCode}）`));
            }
          });
        },
      );
      req.on('timeout', () => { req.destroy(new Error('bridge timeout')); });
      req.on('error', (e) => {
        if (n < retries) {
          log('warn', `dispatch 重试 ${n + 1}/${retries}: ${e.message}`);
          setTimeout(() => attempt(n + 1).then(resolve, reject), 300 * Math.pow(2, n));
        } else reject(e);
      });
      req.write(data);
      req.end();
    }));
    return attempt(0);
  }

  /** 失败抛错的 dispatch 包装（区分能力失败与传输失败） */
  async function dispatchOk(target, payload, opt) {
    const res = await dispatch(target, payload, opt);
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || `${target} dispatch 失败`);
    }
    return res.result;
  }

  async function kvGet(key) {
    const r = await dispatchOk('cap.kv', { action: 'get', key });
    return r && r.value !== undefined ? r.value : null;
  }
  async function kvSet(key, value) {
    await dispatchOk('cap.kv', { action: 'set', key, value: value === undefined ? null : value });
    return true;
  }
  async function kvDel(key) {
    await dispatchOk('cap.kv', { action: 'delete', key });
    return true;
  }
  async function kvKeys() {
    const r = await dispatchOk('cap.kv', { action: 'list' });
    return r && Array.isArray(r.keys) ? r.keys : [];
  }

  return {
    dispatch, dispatchOk, kvGet, kvSet, kvDel, kvKeys,
    endpoint: () => endpoint,
    refreshEndpoint: () => getEndpoint(true),
  };
}

module.exports = { createKvClient, resolveEndpoint, loadWebConfig, md5 };
