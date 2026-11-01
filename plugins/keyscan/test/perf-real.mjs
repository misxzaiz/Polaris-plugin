/**
 * 性能与误报实测（node test/perf-real.mjs <目录1> [目录2 ...]）
 *
 * 用真实大目录验证：扫描吞吐（文件/秒）、规则误报构成。
 * 跑完自清理（所有 keyscan.* 键删除——包括既有的，因为本脚本假定跑在干净环境）。
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PLUGIN_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TARGETS = process.argv.slice(2);
if (!TARGETS.length) {
  console.error('用法: node test/perf-real.mjs <目录1> [目录2 ...]');
  process.exit(1);
}

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }
const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'Polaris', 'anchor.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
const EP = { host: '127.0.0.1', base: cfg.web.port, token: cfg.web.token || '' };

function dispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.base, path: '/api/router-dispatch', method: 'POST', headers, timeout: 60000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.write(data); req.end();
  });
}
const kvGet = async (k) => { const r = await dispatch('cap.kv', { action: 'get', key: k }); return r.result?.value ?? null; };
const kvSet = async (k, v) => { await dispatch('cap.kv', { action: 'set', key: k, value: v }); };
const kvKeys = async () => { const r = await dispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; };
const kvDel = async (k) => { await dispatch('cap.kv', { action: 'delete', key: k }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(500); }
  throw new Error('超时:' + label);
}
async function scanAndWait(root) {
  const n = 'perf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await kvSet(`keyscan.cmd.scan.${n}`, { root, at: Date.now(), from: 'perf' });
  const sid = await wait(async () => {
    const r = await kvGet(`keyscan.result.${n}`); if (r && r.scanId) return r.scanId;
    const m = await kvGet('keyscan.meta'); if (m && m.scanning && m.scanning.nonce === n) return m.scanning.id; return null;
  }, 20000, '接受命令');
  return wait(async () => {
    const r = await kvGet(`keyscan.scan.${sid}`);
    return r && (r.status === 'done' || r.status === 'failed') ? r : null;
  }, 600000, '扫描完成');
}

const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service/main.js'), '19875', path.join(process.env.APPDATA, 'Polaris')], { cwd: PLUGIN_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const errs = [];
svc.stderr.on('data', (c) => errs.push(String(c)));
let exitCode = 0;
try {
  await wait(async () => { const m = await kvGet('keyscan.meta'); return m && m.pid === svc.pid ? m : null; }, 20000, '服务心跳');
  console.log('服务就绪 pid=' + svc.pid);
  for (const target of TARGETS) {
    const rec = await scanAndWait(target);
    console.log(`=== ${target} ===`);
    console.log(JSON.stringify({
      files: rec.files, scanned: rec.filesScanned, durationMs: rec.durationMs,
      吞吐: Math.round((rec.files / Math.max(1, rec.durationMs)) * 1000) + ' 文件/s',
      counts: rec.counts, total: rec.findingCount, truncated: rec.truncated,
      skippedBinary: rec.skippedBinary, skippedSize: rec.skippedSize,
    }));
    let findings = [];
    for (let i = 0; i < 60; i++) {
      const c = await kvGet(`keyscan.find.${rec.id}.${i}`);
      if (!c || !c.length) break;
      findings.push(...c);
    }
    const byRule = {};
    for (const f of findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    console.log('发现按规则:', JSON.stringify(byRule));
    for (const f of findings.slice(0, 15)) console.log(' -', f.sev, f.rule, '|', `${f.occurrences[0]?.file}:${f.occurrences[0]?.line}`, '|', f.preview);
  }
} catch (e) {
  console.error('ERR', e.message);
  console.error(errs.slice(-8).join(''));
  exitCode = 1;
} finally {
  try { svc.kill(); } catch (_) { /* 已退出 */ }
  try {
    const keys = await kvKeys();
    const mine = keys.filter((k) => k.startsWith('keyscan.'));
    for (const k of mine) await kvDel(k);
    console.log('清理', mine.length, '键');
  } catch (e) { console.error('清理失败:', e.message); }
}
process.exit(exitCode);
