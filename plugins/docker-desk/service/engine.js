'use strict';
/**
 * engine.js —— Docker Engine API 客户端（零依赖）
 *
 * 通道（resolveEndpoint 优先级）：
 *   1. 显式 --engine=tcp://host:port / unix:///path / npipe:path（测试与高级用户）
 *   2. env DOCKER_DESK_ENGINE（同上格式；测试钩子）
 *   3. env DOCKER_HOST（docker 官方约定，尊重用户既有配置）
 *   4. 平台默认：win32 → named pipe \\.\pipe\docker_engine；其他 → /var/run/docker.sock
 *
 * 实现要点：
 *  - Engine API 是 HTTP/1.1 over IPC：用 http.request + createConnection 自定义 socket。
 *    Unix socket 原生支持 socketPath，但 Windows named pipe 必须走 net.connect(path)，
 *    统一走 createConnection 一条路（少一个分支少一类 bug）。
 *  - API 版本钉死 /v1.41（Docker 20.10, 2020-12）：本插件用到的端点全部存在于 1.41，
 *    且 Engine 保证向后兼容旧版本路径；比 dockerode 的协商简单且足够稳。
 *  - 日志/事件是长流式响应：返回 res 对象由调用方消费，超时只作用于「连接+响应头」。
 */

const http = require('http');
const net = require('net');
const os = require('os');
const core = require('../shared/core');

const API_VERSION = 'v1.41';
const HDR_TIMEOUT_MS = 8000; // 连接+响应头超时（流式响应体不受此限）

/** 解析 endpoint 字符串 → {kind, path?, host?, port?}；非法返回 null */
function parseEndpoint(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  if (v.startsWith('npipe:')) {
    // npipe:////./pipe/docker_engine 或 npipe:\\.\pipe\docker_engine
    const raw = v.slice('npipe:'.length).replace(/^\/\//, '');
    const p = raw.startsWith('//./pipe/') ? `\\\\.\\pipe\\${raw.slice('//./pipe/'.length)}` : raw;
    return { kind: 'npipe', path: p };
  }
  if (v.startsWith('unix://')) return { kind: 'unix', path: v.slice('unix://'.length) || '/var/run/docker.sock' };
  if (v.startsWith('tcp://') || v.startsWith('http://')) {
    const u = new URL(v.replace(/^http:\/\//, 'tcp://'));
    const port = parseInt(u.port || '2375', 10);
    if (!u.hostname || !Number.isFinite(port) || port <= 0) return null;
    return { kind: 'tcp', host: u.hostname, port };
  }
  return null;
}

/** 端点解析（优先级见文件头）；envAccessor 注入便于测试 */
function resolveEndpoint({ engineArg, env } = {}) {
  const e = env || process.env;
  const candidates = [engineArg, e.DOCKER_DESK_ENGINE, e.DOCKER_HOST];
  for (const c of candidates) {
    const ep = parseEndpoint(c);
    if (ep) return ep;
  }
  if (process.platform === 'win32') return { kind: 'npipe', path: '\\\\.\\pipe\\docker_engine' };
  return { kind: 'unix', path: '/var/run/docker.sock' };
}

/** 建立 IPC socket；回调风格以便交给 http.request 的 createConnection */
function createConnection(ep, onReady, onError) {
  if (ep.kind === 'tcp') {
    const s = net.connect(ep.port, ep.host);
    s.once('connect', () => onReady(s));
    s.once('error', onError);
    return s;
  }
  const s = net.connect({ path: ep.path });
  s.once('connect', () => onReady(s));
  s.once('error', onError);
  return s;
}

class DockerClient {
  /**
   * @param opts {{endpoint?: object, env?: object}} endpoint 缺省自动解析
   */
  constructor(opts = {}) {
    this.endpoint = opts.endpoint || resolveEndpoint({ engineArg: opts.engineArg, env: opts.env });
    this.lastError = null;
  }

  /** 单次请求。stream=false 时聚合完整 body 返回 {status, headers, body(Buffer)}；
   *  stream=true 时返回 {status, headers, res(IncomingMessage)} 由调用方消费流。 */
  request(method, urlPath, { query = {}, body = null, stream = false, hdrTimeoutMs = HDR_TIMEOUT_MS } = {}) {
    const ep = this.endpoint;
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const path = `/${API_VERSION}${urlPath}${qs ? `?${qs}` : ''}`;
    const headers = { Host: 'docker' };
    let data = null;
    if (body !== null && body !== undefined) {
      data = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = data.length;
    }
    return new Promise((resolve, reject) => {
      const req = http.request({
        method,
        path,
        headers,
        createConnection: (opt, cb) => createConnection(ep, (s) => cb(null, s), (e) => cb(e)),
      }, (res) => {
        if (stream) { resolve({ status: res.statusCode, headers: res.headers, res }); return; }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 64 * 1024 * 1024) { req.destroy(new Error('Engine 响应超过 64MB 上限')); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.setTimeout(hdrTimeoutMs, () => req.destroy(new Error(`Engine 响应头超时（${hdrTimeoutMs}ms）`)));
      req.on('error', reject);
      req.end(data || undefined);
    });
  }

  /** 引擎 JSON 端点封装：非 2xx 抛携带 Engine error.message 的错 */
  async json(method, urlPath, opts = {}) {
    let r;
    try {
      r = await this.request(method, urlPath, opts);
    } catch (e) {
      const n = core.normEngineError(e);
      const err = new Error(n.readable);
      err.engineCode = n.code;
      this.lastError = err;
      throw err;
    }
    if (r.status >= 400) {
      let msg = `HTTP ${r.status}`;
      try { msg = JSON.parse(r.body.toString('utf8')).message || msg; } catch (_) { /* 保留状态码 */ }
      const err = new Error(msg.slice(0, 300));
      err.status = r.status;
      this.lastError = err;
      throw err;
    }
    if (!r.body || !r.body.length) return null;
    try { return JSON.parse(r.body.toString('utf8')); } catch (_) {
      throw new Error('Engine 返回非 JSON（版本不兼容？）');
    }
  }

  /** 探活：/_ping 无需 API 版本前缀；顺带捕获 daemon 报告的 Api-Version/OS 类型（展示用） */
  async ping() {
    const r = await this.request('GET', '/_ping');
    if (r.status !== 200) throw new Error(`Engine /_ping HTTP ${r.status}`);
    return { apiVersion: r.headers['api-version'] || '', ostype: r.headers.ostype || '' };
  }

  async version() { return this.json('GET', '/version'); }

  async listContainers(all) {
    const items = await this.json('GET', '/containers/json', { query: { all: all ? 1 : '' } });
    const now = Date.now();
    return (Array.isArray(items) ? items : []).slice(0, core.LIMITS.CONTAINERS_MAX)
      .map((c) => core.normalizeContainer(c, now)).filter(Boolean);
  }

  async inspect(id) { return this.json('GET', `/containers/${encodeURIComponent(id)}/json`); }

  async startContainer(id) { await this.json('POST', `/containers/${encodeURIComponent(id)}/start`); return true; }

  async stopContainer(id, timeoutSec) {
    await this.json('POST', `/containers/${encodeURIComponent(id)}/stop`, { query: { t: timeoutSec != null ? timeoutSec : '' } });
    return true;
  }

  async restartContainer(id, timeoutSec) {
    await this.json('POST', `/containers/${encodeURIComponent(id)}/restart`, { query: { t: timeoutSec != null ? timeoutSec : '' } });
    return true;
  }

  async removeContainer(id, force) {
    await this.json('DELETE', `/containers/${encodeURIComponent(id)}`, { query: { v: 1, force: force ? 1 : '' } });
    return true;
  }

  /**
   * 日志流。stdout/stderr 显式开启（Engine 默认全关！）。
   * follow=true 时返回 res 流（服务端边 demux 边转发）；否则聚合后返回 {status, body}。
   */
  logs(id, { tail = 200, follow = false, since = '' } = {}) {
    return this.request('GET', `/containers/${encodeURIComponent(id)}/logs`, {
      query: {
        stdout: 1, stderr: 1,
        tail: Math.min(Math.max(parseInt(tail, 10) || 200, 0), core.LIMITS.LOG_LINES_MAX),
        follow: follow ? 1 : '',
        since,
        timestamps: '',
      },
      stream: !!follow,
    });
  }

  /** 一次性聚合日志（已 demux 成行） */
  async logsOnce(id, { tail = 200 } = {}) {
    const r = await this.logs(id, { tail, follow: false });
    if (r.status >= 400) {
      let msg = `HTTP ${r.status}`;
      try { msg = JSON.parse(r.body.toString('utf8')).message || msg; } catch (_) { /* keep */ }
      throw new Error(msg.slice(0, 300));
    }
    return core.demuxAll(r.body);
  }

  async stats(id) {
    return this.json('GET', `/containers/${encodeURIComponent(id)}/stats`, { query: { stream: 'false' } });
  }

  async listImages() {
    const items = await this.json('GET', '/images/json');
    return (Array.isArray(items) ? items : []).map((i) => core.normalizeImage(i)).filter(Boolean);
  }

  async removeImage(id) { return this.json('DELETE', `/images/${encodeURIComponent(id)}`); }

  async df() { return this.json('GET', '/system/df'); }

  /** 事件流（stream res；调用方负责按行解析与 abort） */
  events({ since, filters } = {}) {
    const f = filters ? JSON.stringify(filters) : '';
    return this.request('GET', '/events', { query: { since: since || '', filters: f }, stream: true });
  }
}

module.exports = { DockerClient, resolveEndpoint, parseEndpoint, API_VERSION, createConnection };
