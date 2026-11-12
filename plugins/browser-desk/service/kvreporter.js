'use strict';
/**
 * kvreporter.js —— 服务端经宿主 cap.kv 上报状态（零依赖）
 *
 * 端点自发现与 ai-scheduler kvclient 同款三级策略（env > anchor/config > 扫描）。
 * 上报内容：browser-desk/service-port 等（MCP 端口自发现第二级数据源）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function configCandidates(appConfigDir) {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris-dev', 'anchor.json') : '',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* skip */ }
  }
  if (appConfigDir) cands.push(path.join(appConfigDir, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  return cands;
}

function resolveEndpoint(appConfigDir) {
  const envHost = process.env.POLARIS_HOST || '';
  const envPort = parseInt(process.env.POLARIS_PORT || '', 10);
  if (envHost && Number.isFinite(envPort)) {
    return { host: envHost, port: envPort, token: process.env.POLARIS_TOKEN || '' };
  }
  for (const p of configCandidates(appConfigDir)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = cfg.web || {};
      if (typeof web.port === 'number' && web.port > 0) {
        return { host: web.host || '127.0.0.1', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* skip */ }
  }
  return null;
}

function createKvReporter(appConfigDir) {
  function report(key, value) {
    const ep = resolveEndpoint(appConfigDir);
    if (!ep) return;
    const data = JSON.stringify({ req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
    const req = http.request({
      hostname: ep.host || '127.0.0.1', port: ep.port, path: '/api/router-dispatch',
      method: 'POST', headers, timeout: 5000,
    }, (res) => { res.resume(); });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(data);
    req.end();
  }
  return { report };
}

module.exports = { createKvReporter };
