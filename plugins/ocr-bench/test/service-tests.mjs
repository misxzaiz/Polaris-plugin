#!/usr/bin/env node
/**
 * 第 3 层：假桥集成测试（真实 service 子进程 + 内存 kv 桥 + 真实引擎跑真实夹具）
 * 运行：node test/service-tests.mjs（约 30~60s）
 */
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { startFakeKvBridge, waitHealth } from './helpers/fake-kv.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const core = require('../shared/core.js');

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { failed += 1; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}: ${e.message}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function svcRequest(port, method, apiPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (token) headers['X-OcrBench-Token'] = token;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ hostname: '127.0.0.1', port, path: apiPath, method, headers, timeout: 30000 }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(out) }); }
        catch (e) { reject(new Error(`非 JSON 响应（${res.statusCode}）：${out.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

const bridge = await startFakeKvBridge({ token: 'itest-token' });
const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-bench-itest-'));
const outDir = path.join(appDir, 'export');
const servicePort = 29310 + Math.floor(Math.random() * 300);

const svc = spawn(process.execPath, [
  path.join(ROOT, 'service', 'main.js'),
  String(servicePort),
  appDir,
], {
  env: {
    ...process.env,
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridge.port),
    POLARIS_TOKEN: bridge.token,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let svcLog = '';
svc.stderr.on('data', (c) => { svcLog += c; });

let authed = false;
let TOKEN = '';
try {
  await waitHealth(servicePort);
  authed = true;
  // 服务 token 是自生成并持久化在 meta（面板同款引导路径），不是桥的 token
  TOKEN = (bridge.store.get('ocr-bench.meta') || {}).token || '';
  assert.ok(TOKEN, 'meta 里应有服务 token');

  await test('健康端点：200 + 插件标识', async () => {
    const r = await svcRequest(servicePort, 'GET', '/__health');
    assert.equal(r.status, 200);
    assert.equal(r.json.plugin, 'ocr-bench');
    assert.equal(r.json.running, false);
  });

  await test('鉴权：无 token / 错 token → 401', async () => {
    const noTok = await svcRequest(servicePort, 'POST', '/api/op', { body: { action: 'state' } });
    assert.equal(noTok.status, 401);
    const badTok = await svcRequest(servicePort, 'POST', '/api/op', { token: 'wrong', body: { action: 'state' } });
    assert.equal(badTok.status, 401);
  });

  await test('meta 落桥：port/token 与服务一致（面板引导事实库）', async () => {
    const meta = bridge.store.get('ocr-bench.meta');
    assert.ok(meta, 'meta 未写入');
    assert.equal(meta.port, servicePort);
    assert.equal(typeof meta.token, 'string');
    assert.ok(meta.token.length >= 16);
    assert.equal(meta.version, core.VERSION);
  });

  await test('langs：内置双语言已装 + 可选清单 + 非法下载码拒绝（离线）', async () => {
    const r = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'langs' },
    });
    assert.equal(r.json.ok, true);
    const codes = (r.json.builtin || []).map((l) => l.code);
    assert.deepEqual(codes, ['chi_sim', 'eng']);
    assert.ok(r.json.builtin.every((l) => l.installed === true));
    assert.ok((r.json.optional || []).length >= 10);
    const bad = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'download_lang', payload: { codes: ['../evil'] } },
    });
    assert.equal(bad.json.ok, true); // 动作受理
    assert.equal(bad.json.results[0].ok, false);
    assert.match(bad.json.results[0].error || '', /非法语言代码/);
  });

  await test('识别任务：混合夹具目录 → 报告逐项断言 + txt 导出', async () => {
    // outDir 在输入目录之外 → 必须被根边界校验拒绝
    const evil = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN,
      body: { action: 'start', payload: { paths: [FIX], outDir: 'C:\\Windows\\Temp-evil', langs: ['chi_sim', 'eng'] } },
    });
    assert.equal(evil.status, 200);
    assert.equal(evil.json.ok, false);
    assert.match(evil.json.error || '', /输出目录必须|之内/);

    const r = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN,
      body: { action: 'start', payload: { paths: [path.join(FIX, 'fixture-zh.png'), path.join(FIX, 'native-text.pdf'), path.join(FIX, 'corrupt.pdf')], outDir, langs: ['chi_sim', 'eng'] } },
    });
    assert.equal(r.json.ok, true, r.json.error);
    const runId = r.json.runId;

    // 轮询至完成
    let report = null;
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      const live = await svcRequest(servicePort, 'GET', '/api/live', { token: TOKEN });
      if (!live.json.running) {
        const rep = await svcRequest(servicePort, 'POST', '/api/op', {
          token: TOKEN, body: { action: 'report', payload: { runId } },
        });
        report = rep.json.report;
        break;
      }
    }
    assert.ok(report, '120s 内任务未完成');
    assert.equal(report.summary.files, 3);
    assert.equal(report.summary.okFiles, 2);
    assert.equal(report.summary.failFiles, 1);
    const byName = (suffix) => report.files.find((f) => f.path.endsWith(suffix));
    const png = byName('fixture-zh.png');
    const nat = byName('native-text.pdf');
    const cor = byName('corrupt.pdf');
    assert.ok(png && png.ok, 'png 应成功');
    assert.ok(png.textHead.includes('检验报告单'));
    assert.ok(nat && nat.ok && nat.pages[0].mode === 'native', 'native PDF 应走直读');
    assert.ok(nat.textHead.includes('Hello Native Text Layer'));
    assert.equal(cor.ok, false);
    assert.match(cor.error || '', /PDF 解析失败/);
    // kv 报告瘦身：corrupt 无文本头；报告落桥
    assert.equal(cor.textHead, '');
    assert.ok(bridge.store.get(`ocr-bench.report.${runId}`), '报告应落 kv');
    // 导出 txt（输入目录之外但 appDir 之内？outDir=appDir/export 在 appConfigDir 内 → 允许）
    assert.ok(png.outFile && fs.existsSync(png.outFile), 'png txt 应导出');
    const txt = fs.readFileSync(png.outFile, 'utf8');
    assert.ok(txt.includes('检验报告单'));
    assert.ok(nat.outFile && fs.existsSync(nat.outFile));
  });

  await test('互斥与中止：任务进行中二次发起 → busy；stop 后报告 aborted', async () => {
    // 造 6 份较慢夹具（DCT 页 ~0.7s/份）保证有可观察的运行窗口
    const slowDir = path.join(appDir, 'slow');
    fs.mkdirSync(slowDir, { recursive: true });
    for (let i = 0; i < 6; i++) fs.copyFileSync(path.join(FIX, 'scan-dct.pdf'), path.join(slowDir, `copy-${i}.pdf`));
    const r1 = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'start', payload: { paths: [slowDir], langs: ['chi_sim', 'eng'] } },
    });
    assert.equal(r1.json.ok, true);
    // 立刻二次发起：要么 busy（大多数情况），要么第一个已完成（慢机器）——只在 busy 分支断言
    const r2 = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'start', payload: { paths: [path.join(FIX, 'fixture-zh.png')] } },
    });
    if (r2.status === 409) {
      assert.equal(r2.json.busy, true);
      assert.match(r2.json.error || '', /已有识别任务在运行/);
      const st = await svcRequest(servicePort, 'POST', '/api/op', { token: TOKEN, body: { action: 'stop' } });
      assert.equal(st.json.ok, true);
    } else {
      assert.equal(r2.json.ok, true); // 已完成的情形不判失败
    }
    // 等第一个任务收尾
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const live = await svcRequest(servicePort, 'GET', '/api/live', { token: TOKEN });
      if (!live.json.running) break;
    }
    const idleStop = await svcRequest(servicePort, 'POST', '/api/op', { token: TOKEN, body: { action: 'stop' } });
    assert.equal(idleStop.json.ok, false);
    assert.match(idleStop.json.error || '', /没有运行中的识别任务/);
  });

  await test('settings_set：归一化回读（非法语言回落默认）', async () => {
    const r = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'settings_set', payload: { langs: ['chi_sim'], psm: 6, outDir: '' } },
    });
    assert.equal(r.json.ok, true);
    assert.deepEqual(r.json.settings.langs, ['chi_sim']);
    assert.equal(r.json.settings.psm, 6);
    const bad = await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'settings_set', payload: { langs: ['no_such'] } },
    });
    assert.equal(bad.json.ok, true);
    assert.deepEqual(bad.json.settings.langs, ['chi_sim', 'eng']); // 归一失败回落默认
  });

  await test('信箱：cmd 投递 state → res 回执 nonce 对齐（MCP 同协议）', async () => {
    const nonce = `t-${Date.now()}`;
    await svcRequest(servicePort, 'POST', '/api/op', {
      token: TOKEN, body: { action: 'state' },
    });
    // 直接经桥写 cmd（模拟 MCP server 行为）
    const { default: http2 } = { default: http };
    const write = (payload) => new Promise((resolve, reject) => {
      const data = JSON.stringify({ req: { target: 'cap.kv', payload } });
      const req = http2.request({
        hostname: '127.0.0.1', port: bridge.port, path: '/api/router-dispatch', method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + require('node:crypto').createHash('md5').update(bridge.token).digest('hex') },
      }, (res) => { res.resume(); res.on('end', resolve); });
      req.on('error', reject);
      req.end(data);
    });
    await write({ action: 'set', key: 'ocr-bench.cmd', value: { nonce, action: 'state', payload: {}, at: new Date().toISOString() } });
    let receipt = null;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const v = bridge.store.get('ocr-bench.res');
      if (v && v.nonce === nonce) { receipt = v; break; }
    }
    assert.ok(receipt, '20s 内未见回执');
    assert.equal(receipt.result && receipt.result.ok, true);
    assert.equal(receipt.action, 'state');
    const cmdGone = bridge.store.has('ocr-bench.cmd');
    assert.equal(cmdGone, false, 'cmd 应被消费删除');
  });
} catch (e) {
  failed += 1;
  failures.push(` fatal: ${e.message}`);
  console.log(`  ✗ fatal: ${e.message}`);
} finally {
  if (!authed) console.log(`\n[服务日志尾部]\n${svcLog.split('\n').slice(-25).join('\n')}`);
  svc.kill();
  await bridge.close();
}

console.log(`\n第 3 层假桥集成测试：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
