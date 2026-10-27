/**
 * 服务级集成测试（node --test，零外部依赖）：真实跑 service/abacus.js 进程
 *
 * 链路：mock IPC 桥（内存 cap.kv）+ ABACUS_SMOKE_ROOT 合成三源（zcode sqlite /
 * claude JSONL / polaris dialogs）→ 服务自发现端点（POLARIS_HOST/PORT/TOKEN env）
 * → 全量扫描 → 归一聚合 → 发布 abacus.* 聚合键 → 命令信箱（cmd → 先删后做 → result）。
 * 这同时是信箱协议与「服务必须让出事件循环（健康检查不被扫描饿死）」的回归。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PLUGIN_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

// ── mock IPC 桥：内存 cap.kv + router_dispatch 协议 ────────────────────────

function startMockBridge() {
  const store = new Map(); // key → value（与宿主 cap.kv 同语义：全局共享 domain）
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !(req.url || '').startsWith('/api/router-dispatch')) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { req: { target, payload } } = JSON.parse(body);
        if (target !== 'cap.kv') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: `mock 桥只实现 cap.kv，收到 ${target}` })); return; }
        const act = payload.action;
        if (act === 'get') res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } }));
        else if (act === 'set') { store.set(payload.key, payload.value === undefined ? null : payload.value); res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result: {} })); }
        else if (act === 'delete') { store.delete(payload.key); res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result: {} })); }
        else if (act === 'list') res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result: { keys: [...store.keys()] } }));
        else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: `未知 action ${act}` }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, store })));
}

// ── 合成三源 fixture ────────────────────────────────────────────────────────

function buildFixture(root) {
  const now = Date.now();
  // zcode sqlite
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = path.join(root, 'zcode', 'db.sqlite');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT, time_deleted INTEGER);
    CREATE TABLE model_usage (
      id INTEGER PRIMARY KEY, session_id TEXT, turn_id TEXT, assistant_message_id TEXT,
      attempt_index INTEGER DEFAULT 0, model_id TEXT, provider_id TEXT, agent TEXT, mode TEXT,
      input_tokens INTEGER DEFAULT 0, cache_read_input_tokens INTEGER DEFAULT 0,
      cache_creation_input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      started_at INTEGER DEFAULT 0, error_type TEXT, retry_count INTEGER DEFAULT 0,
      time_to_first_token_ms INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0
    );
    CREATE TABLE tool_usage (tool_name TEXT, destructive INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0);
  `);
  db.prepare('INSERT INTO session VALUES (?,?,?,?)').run('sz1', '重构账房服务', 'D:\\work\\Polaris', 0);
  const ins = db.prepare(`INSERT INTO model_usage (session_id, turn_id, assistant_message_id, attempt_index, model_id, provider_id, agent, mode,
    input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens, started_at, error_type, retry_count, time_to_first_token_ms, duration_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('sz1', 't1', 'm1', 0, 'GLM-5.3-Flash', 'zhipu', 'main', 'ask', 73451, 70464, 0, 241, now - 3600e3, null, 1, 812, 5200);
  ins.run('sz1', 't2', 'm2', 0, 'mystery-model', 'x', 'main', 'ask', 500, 0, 0, 100, now - 7200e3, 'rate_limited', 0, 0, 0);
  const ti = db.prepare('INSERT INTO tool_usage (tool_name, destructive, duration_ms) VALUES (?,?,?)');
  ti.run('Read', 0, 120); ti.run('Bash', 1, 3000);
  db.close();
  // claude JSONL
  const cdir = path.join(root, 'claude', 'p1');
  fs.mkdirSync(cdir, { recursive: true });
  const ts = new Date(now - 1800e3).toISOString();
  fs.writeFileSync(path.join(cdir, 'a.jsonl'), [
    JSON.stringify({ type: 'user', sessionId: 'sc1', cwd: 'D:\\work\\projA', message: { content: '修复宽度计算' } }),
    JSON.stringify({ type: 'summary', summary: '修宽度' }),
    JSON.stringify({ type: 'assistant', uuid: 'u1', sessionId: 'sc1', cwd: 'D:\\work\\projA', timestamp: ts, message: { model: 'claude-sonnet-4', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 } } }),
    JSON.stringify({ type: 'assistant', uuid: 'u2', sessionId: 'sc1', isSidechain: true, timestamp: ts, message: { model: 'claude-haiku-4', usage: { input_tokens: 200, output_tokens: 30 } } }),
    '{bad json line',
  ].join('\n'));
  // polaris dialogs
  const droot = path.join(root, 'dialogs');
  fs.mkdirSync(droot, { recursive: true });
  fs.writeFileSync(path.join(droot, 'd1.jsonl'), JSON.stringify({
    type: 'meta', externalId: 'p1', title: '记账会话', engineId: 'zcode', workspacePath: 'D:\\work\\projB',
    updatedAt: new Date(now - 600e3).toISOString(),
    tokenUsage: { input: 200, output: 80, cacheRead: 50, cacheCreation: 10, costUsd: 0.0123 },
  }) + '\n');
  fs.writeFileSync(path.join(droot, 'd2.jsonl'), JSON.stringify({ type: 'meta', externalId: 'p2', title: '无用量', tokenUsage: null }) + '\n');
  return { zcodeRows: 2, claudeRows: 2, polarisRows: 1 };
}

// ── HTTP 小工具 ─────────────────────────────────────────────────────────────

function healthOnce(port, pathName) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathName, timeout: 1500 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ code: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function waitFor(fn, ms, step = 400, label = '') {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`等待超时: ${label}`);
    await new Promise((r) => setTimeout(r, step));
  }
}

test('服务端到端：合成三源 → 扫描 → 聚合发布 → 信箱命令闭环', { skip: !require('../service/sources.js').sqliteAvailable() && 'node:sqlite 不可用' }, async (t) => {
  const bridge = await startMockBridge();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'abacus-it-'));
  const fixtureRoot = path.join(work, 'fixture');
  const appConfig = path.join(work, 'appconfig');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.mkdirSync(appConfig, { recursive: true });
  const expect = buildFixture(fixtureRoot);

  const child = spawn(process.execPath, [
    path.join(PLUGIN_ROOT, 'service', 'abacus.js'),
    '0', // port=0：健康端口自选（真实宿主注入 {{port}} 的等价形态）
    appConfig,
  ], {
    env: {
      ...process.env,
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: String(bridge.port),
      POLARIS_TOKEN: 'ittest-token',
      ABACUS_SMOKE_ROOT: fixtureRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let healthPort = 0;
  let stderrTail = '';
  child.stderr.on('data', (c) => {
    stderrTail = (stderrTail + c).slice(-4000);
    if (!healthPort) {
      const m = /http:\/\/127\.0\.0\.1:(\d+)\/__health/.exec(String(c));
      if (m) healthPort = Number(m[1]);
    }
  });

  try {
    // 1. 健康检查就绪且不被首扫饿死（claude+zcode 解析在合成数据上毫秒级，但
    //    仍验证 /__health 200 JSON 契约）
    const h = await waitFor(async () => {
      if (!healthPort) return null;
      const r = await healthOnce(healthPort, '/__health');
      return r && r.code === 200 ? JSON.parse(r.body) : null;
    }, 30000, 300, '服务健康端口');
    assert.equal(h.ok, true);
    assert.equal(h.smoke, true);

    // 2. 聚合发布到 mock 桥（kv）
    const kvGet = async (key) => (await waitFor(async () => bridge.store.get(key) ?? null, 30000, 300, `kv ${key}`));
    const summary = await kvGet('abacus.summary');
    assert.equal(summary.all.req, expect.zcodeRows + expect.claudeRows + expect.polarisRows);

    // 3. 口径断言：全价输入 = z(2987+500) + c(100+200) + p(200) = 3987
    assert.equal(summary.all.fin, 2987 + 500 + 100 + 200 + 200);
    // 缓存节省 > 0（GLM + claude 行都有 cacheRead 且价差为正）
    assert.ok(summary.all.cacheSavings > 0);
    // polaris hostCost 权威
    assert.equal(summary.bySrc.polaris.costUsd, 0.0123);
    assert.equal(summary.bySrc.polaris.req, 1);

    const quality = await kvGet('abacus.quality');
    assert.equal(quality.errorsByType.rate_limited, 1);
    assert.equal(quality.retriedRows, 1);
    assert.equal(quality.tools.total, 2);
    assert.equal(quality.tools.destructive, 1);
    const codes = quality.insights.map((i) => i.code);
    assert.ok(codes.includes('rate_limited'));
    assert.ok(codes.includes('unpriced')); // mystery-model 未计价

    const models = await kvGet('abacus.models');
    const mm = models.find((m) => m.model.toLowerCase() === 'glm-5.3-flash');
    assert.ok(mm && mm.cacheHit === 95.9); // 70464/(2987+70464)=95.93%
    assert.ok(models.some((m) => m.model === 'mystery-model' && m.priced === 0));

    const projects = await kvGet('abacus.projects');
    assert.ok(projects.some((p) => p.proj === 'Polaris' && p.src === 'zcode'));
    assert.ok(projects.some((p) => p.proj === 'projA' && p.src === 'claude'));
    assert.ok(projects.some((p) => p.proj === 'projB' && p.src === 'polaris'));

    const meta = await kvGet('abacus.meta');
    assert.equal(meta.smoke, true);
    assert.equal(meta.entries, expect.zcodeRows + expect.claudeRows + expect.polarisRows);
    assert.equal(meta.sources.zcode.ok, true);
    assert.equal(meta.sources.claude.ok, true);
    assert.equal(meta.sources.polaris.ok, true);
    assert.ok(meta.caliber && meta.caliber.zcode.includes('含'));

    // 4. 命令信箱：cmd 先落键 → 服务删除并执行 → result 落键
    bridge.store.set('abacus.cmd.itn1', { op: 'rescan' });
    const result = await kvGet('abacus.result.itn1');
    assert.equal(result.ok, true);
    assert.equal(typeof result.entries, 'number');
    assert.ok(!bridge.store.has('abacus.cmd.itn1'), 'cmd 必须被服务删除（先删后做，防重复消费）');

    // 5. 台账缓存落盘（appConfigDir/abacus/entries.jsonl）
    const entriesFile = path.join(appConfig, 'abacus', 'entries.jsonl');
    const lines = fs.readFileSync(entriesFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, expect.zcodeRows + expect.claudeRows + expect.polarisRows);
    const e1 = JSON.parse(lines[0]);
    assert.ok(e1.k && typeof e1.fin === 'number');
  } catch (e) {
    throw new Error(`${e.message}\n---- 服务 stderr 尾部 ----\n${stderrTail}`);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    bridge.server.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
});
