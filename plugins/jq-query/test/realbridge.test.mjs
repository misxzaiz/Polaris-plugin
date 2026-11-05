/**
 * realbridge.test.mjs —— 真桥冒烟（env 门控：JQ_REAL=1 才跑）
 *
 * 前置：Polaris 宿主在真机运行（config.json 的 web.port 可达）。
 * 断言（全部走真实宿主 HTTP 通道，不 mock）：
 *   1. cap.kv set/get/delete round-trip（md5 token 鉴权，与 kvclient 同协议）
 *   2. 起真实 service（测试端口 + 真实 appConfigDir）→ 等待它把 jq-query.meta 写进真 kv →
 *      从宿主读回 meta → 用 meta 直连服务 /__health → 跑一条真实查询
 *   3. 清理：删除测试 kv 键 + 关闭服务
 *
 * 用法：JQ_REAL=1 node test/realbridge.test.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';

if (process.env.JQ_REAL !== '1') {
  console.log('跳过真桥冒烟（未设 JQ_REAL=1）');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));

// ── 定位宿主（与 kvclient.js 同口径，但独立实现以避免被测代码自证）───────────
function md5(s) { return createHash('md5').update(String(s)).digest('hex'); }

function loadHostConfig() {
  const candidates = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(process.env.USERPROFILE || '', '.config', 'Polaris', 'anchor.json'),
  ].filter(Boolean);
  const dataRoots = [];
  for (const p of candidates) {
    try {
      const a = JSON.parse(readFileSync(p, 'utf8'));
      if (a && a.dataRoot) dataRoots.push(a.dataRoot);
    } catch (_) { /* skip */ }
  }
  const cfgCandidates = [
    ...dataRoots.map((r) => path.join(r, 'config.json')),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'config.json') : '',
  ].filter(Boolean);
  for (const p of cfgCandidates) {
    try {
      const root = JSON.parse(readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number' && web.port > 0) {
        return { port: web.port, token: web.token || '', appConfigDir: path.dirname(p) };
      }
    } catch (_) { /* skip */ }
  }
  throw new Error('未找到宿主 web 配置（anchor.json/config.json）');
}

const host = loadHostConfig();

function dispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const req = http.request({
      hostname: '127.0.0.1', port: host.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: `Bearer ${md5(host.token)}` },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('host timeout')); });
    req.write(data);
    req.end();
  });
}

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

const KEY_TEST = 'jq-query.realbridge-test';
const KEY_META = 'jq-query.meta';
const SVC_PORT = 39884;

const svc = spawn('node', [path.join(here, '../service/main.js'), String(SVC_PORT), host.appConfigDir], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
svc.stderr.on('data', (c) => process.stderr.write(`[svc] ${c}`));

try {
  // 1. cap.kv 真桥 round-trip
  const wr = await dispatch('cap.kv', { action: 'set', key: KEY_TEST, value: { hello: 'jq', n: 42 } });
  check('cap.kv set 经真宿主成功', wr.ok === true, JSON.stringify(wr).slice(0, 120));
  const rd = await dispatch('cap.kv', { action: 'get', key: KEY_TEST });
  const v = rd?.result?.value;
  check('cap.kv get 读回一致', v && v.hello === 'jq' && v.n === 42, JSON.stringify(rd).slice(0, 120));
  await dispatch('cap.kv', { action: 'delete', key: KEY_TEST });
  const rd2 = await dispatch('cap.kv', { action: 'get', key: KEY_TEST });
  check('cap.kv delete 生效', !rd2?.result?.value, JSON.stringify(rd2).slice(0, 120));

  // 2. 真服务起在测试端口 → meta 写真 kv → 读回 → 直连健康检查
  let meta = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const m = await dispatch('cap.kv', { action: 'get', key: KEY_META });
      const mv = m?.result?.value;
      if (mv && mv.token && mv.port === SVC_PORT) { meta = mv; break; }
    } catch (_) { /* retry */ }
  }
  check('服务把 meta 写进真 cap.kv（端口/Token 齐全）', Boolean(meta), '18s 内未见 meta');

  if (meta) {
    const health = await new Promise((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: meta.port, path: '/__health', timeout: 3000 }, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
      });
      req.on('error', () => resolve(null));
    });
    check('真服务 /__health 200', health && health.ok === true && typeof health.version === 'string', JSON.stringify(health));

    // 3. 真服务跑一条查询（token 来自真 kv meta——面板同款通道）
    const qr = await new Promise((resolve, reject) => {
      const data = JSON.stringify({ input: '{"users":[{"n":"a","age":31},{"n":"b","age":24}]}', query: '[.users[] | select(.age > 30) | .n] | join(",")', flags: ['-r'] });
      const req = http.request({
        hostname: '127.0.0.1', port: meta.port, path: '/api/query', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-jq-query-token': meta.token },
        timeout: 8000,
      }, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
    check('真服务查询闭环（select+join -r）', qr.ok === true && qr.raw?.trim() === 'a', JSON.stringify(qr).slice(0, 200));
  }
} catch (e) {
  failures++;
  console.error('✗ 异常中断:', e);
} finally {
  svc.kill();
}
console.log(failures === 0 ? '\n真桥冒烟全部通过' : `\n真桥冒烟失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
