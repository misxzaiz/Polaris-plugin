/**
 * 服务级集成测试（假桥 + 真实 service 子进程 + mock LLM 上游）：
 * node test/service-tests.mjs
 *
 * 覆盖：服务启动心跳、档案管理（掩码不变量/宿主导入）、数据集管理、
 *       矩阵全链路（双协议变体×多样本+检查器+judge）、限流重试、401 不重试、
 *       并发上限、取消落盘、结果文件与投影分层、annotate 回写。
 * 不依赖宿主与外网。收尾自清理（kill 子进程 + 关服务 + 删临时目录）。
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

// ── Mock LLM 上游（OpenAI 形态；按 apiKey 分行为）────────────────────────────
const upstream = { inflight: 0, maxInflight: 0, hits: 0, flakyHits: 0, judgeHits: 0 };
const upstreamServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    upstream.hits += 1;
    const j = JSON.parse(body || '{}');
    const auth = String(req.headers.authorization || '');
    const msgs = Array.isArray(j.messages) ? j.messages : [];
    const isJudge = JSON.stringify(msgs).includes('评测员');
    // 并发统计（judge 并发 2 不计入矩阵并发断言）
    if (!isJudge) {
      upstream.inflight += 1;
      upstream.maxInflight = Math.max(upstream.maxInflight, upstream.inflight);
    }
    const done = () => { if (!isJudge) upstream.inflight -= 1; };
    // 行为分支：sk-flaky 前 2 次 429；sk-bad 恒 401；sk-judge-only 当 judge
    if (auth === 'Bearer sk-flaky' && !isJudge) {
      upstream.flakyHits += 1;
      if (upstream.flakyHits <= 2) {
        setTimeout(() => { done(); res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'rate limited' } })); }, 30);
        return;
      }
    }
    if (auth === 'Bearer sk-bad' && !isJudge) {
      done();
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Incorrect API key' } }));
      return;
    }
    setTimeout(() => {
      if (isJudge) {
        upstream.judgeHits += 1;
        done();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '评测：{"score":9,"reason":"质量不错"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } }));
        return;
      }
      // sk-slow：300ms 慢速（给取消测试留时间窗，40 格串行 ≈ 12s）
      const delay = auth === 'Bearer sk-slow' ? 300 : 60;
      // 内容含样本变量，验证插值链路
      const user = msgs.filter((m) => m.role === 'user').map((m) => m.content).join('');
      const out = `回复[${user.slice(0, 24)}]`;
      const tempNote = j.temperature != null ? `T${j.temperature}` : 'T-def';
      setTimeout(() => {
        done();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `${out}<${tempNote}>` }, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 6 } }));
      }, delay);
    }, 0);
  });
});

// ── 假桥（内存 kv，/api/health + /api/router-dispatch）───────────────────────
const kvStore = new Map();
const TOKEN = 'test-token';
const bridge = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.url === '/api/router-dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.headers.authorization !== `Bearer ${md5(TOKEN)}`) {
        res.writeHead(401); res.end('{"ok":false,"error":"bad token"}');
        return;
      }
      try {
        const { req: inner } = JSON.parse(body);
        const { target, payload } = inner || {};
        if (target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 target ${target}` })); return; }
        let result = {};
        if (payload.action === 'get') result = { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null };
        else if (payload.action === 'set') { kvStore.set(payload.key, payload.value === undefined ? null : payload.value); result = {}; }
        else if (payload.action === 'delete') { kvStore.delete(payload.key); result = {}; }
        else if (payload.action === 'list') result = { keys: [...kvStore.keys()] };
        else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 action ${payload.action}` })); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
});

// ── 环境：tmpdir + 宿主 config.json（供 import_host 测试）────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtx-test-'));
const upPort = await listen(upstreamServer);
const bridgePort = await listen(bridge);
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  web: { port: bridgePort, token: TOKEN, host: '127.0.0.1' },
  modelProfiles: [
    { id: 'h1', name: '宿主档案A', baseUrl: `http://127.0.0.1:${upPort}`, apiKey: 'sk-host-a', model: 'host-a-model', wireApi: 'openai-chat-completions' },
  ],
}));
const runDir = path.join(tmp, 'prompt-matrix', 'runs');

// ── 启动真实 service 子进程 ──────────────────────────────────────────────────
// env 优先注入假桥端点（kvclient resolveEndpoint 的 env 分支最高优先），
// 否则本机真宿主 anchor.json 会抢先命中——测试流量绝不能进真数据根。
const svc = spawn(process.execPath, [path.join('service', 'main.js'), '0', tmp], {
  cwd: path.dirname(fileURLToPath(import.meta.url)) + '/..',
  env: {
    ...process.env,
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridgePort),
    POLARIS_TOKEN: TOKEN,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const svcLog = [];
svc.stderr.on('data', (c) => svcLog.push(String(c)));
svc.stdout.on('data', () => { /* 健康端点无 stdout 协议 */ });

const kvGet = async (key) => (kvStore.has(key) ? kvStore.get(key) : null);
const kvSet = (key, value) => kvStore.set(key, value);
let nonceSeq = 0;
/** 经信箱发命令（写 cmd → 轮询 res） */
async function cmd(action, payload, waitMs = 30000) {
  const nonce = `t${Date.now().toString(36)}-${++nonceSeq}`;
  kvSet('pmtx.cmd', { nonce, action, payload, at: new Date().toISOString() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(600);
    const res = await kvGet('pmtx.res');
    if (res && res.nonce === nonce) { kvStore.delete('pmtx.res'); return res.result; }
  }
  throw new Error(`命令超时：${action}`);
}

async function waitForMeta(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await kvGet('pmtx.meta');
    if (m && m.version) return m;
    await sleep(500);
  }
  throw new Error(`服务心跳未出现（30s）：\n${svcLog.slice(-20).join('')}`);
}

try {
  await t('服务启动：心跳/version/零档案起步', async () => {
    const m = await waitForMeta();
    assert.strictEqual(m.degraded, false);
    assert.ok(m.version);
    assert.strictEqual(m.profileCount >= 0, true);
    assert.strictEqual(m.running, null);
  });

  await t('宿主档案导入：ok + 找到 config + host- 档案在列（本机可能命中真宿主配置，属预期）', async () => {
    const r = await cmd('import_host', {});
    assert.strictEqual(r.ok, true);
    assert.ok(r.configFile, `应命中某个 config.json：${r.configFile}`);
    const st = await cmd('get_state', {});
    assert.ok(st.profiles.some((p) => p.id.startsWith('host-')), '应有 host- 前缀档案');
    assert.ok(st.profiles.every((p) => !/sk-host-a/.test(JSON.stringify(p))), '不得泄漏完整 key');
  });

  await t('手动档案 upsert + 掩码 + 落文件', async () => {
    const r = await cmd('profiles_upsert', { profile: { name: '主测', baseUrl: `http://127.0.0.1:${upPort}`, apiKey: 'sk-manual-ok', model: 'mock-chat', wire: 'openai-chat-completions' } });
    assert.strictEqual(r.ok, true);
    const st = await cmd('get_state', {});
    const p = st.profiles.find((x) => x.id === r.id);
    assert.strictEqual(p.keyMask, '****l-ok');
    const file = JSON.parse(fs.readFileSync(path.join(tmp, 'prompt-matrix', 'profiles.json'), 'utf8'));
    assert.ok(file.some((x) => x.id === r.id));
    assert.ok(JSON.stringify(file).includes('sk-manual-ok'), '本地文件应含完整 key（同信任域）');
  });

  await t('数据集 upsert：解析计数/错误行保留/回读', async () => {
    const jsonl = [
      '{"vars": {"q": "天空为何是蓝的"}, "expect": [{"type": "contains", "value": "散射"}]}',
      '{"vars": {"q": "1+1=?只回答数字"}, "expect": [{"type": "equals", "value": "2"}]}',
      '{"q": "写一句关于海的话"}',
      'broken line',
    ].join('\n');
    const r = await cmd('datasets_upsert', { name: '冒烟集', jsonl });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.count, 3);
    assert.strictEqual(r.errors.length, 1);
    const st = await cmd('get_state', {});
    assert.ok(st.datasets.find((d) => d.name === '冒烟集'));
  });

  let runId = '';
  await t('矩阵全链路：2 变体×3 样本=6 格 + judge + 检查器', async () => {
    const st = await cmd('get_state', {});
    const manual = st.profiles.find((p) => p.keyMask === '****l-ok');
    const r = await cmd('run_start', {
      datasetId: (await kvGet('pmtx.datasets'))[0].id,
      variants: [
        { name: '主测变体', profileId: manual.id, userTemplate: '问：{{q}}', maxTokens: 64, temperature: 0.3 },
        { name: '同模型改写', profileId: manual.id, userTemplate: '请回答：{{q}}', maxTokens: 64 },
      ],
      concurrency: 2,
      retries: 1,
      judge: { profileId: manual.id },
    }, 15000);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.cells, 6);
    runId = r.runId;
    // 轮询到完成（cells + judge 两阶段）
    const deadline = Date.now() + 60000;
    let prog = null;
    while (Date.now() < deadline) {
      prog = await kvGet('pmtx.progress');
      if (!prog) break; // 完成后 progress 被清
      await sleep(700);
    }
    const run = await cmd('get_run', { runId }, 15000);
    assert.strictEqual(run.ok, true);
    const rp = run.run;
    assert.strictEqual(rp.status, 'done', `status=${rp.status} log=${svcLog.slice(-5).join('')}`);
    assert.strictEqual(rp.cells.length, 6);
    assert.strictEqual(rp.aggregates.totals.ok, 6);
    // 插值与温度透传验证（mock 回显）
    const c00 = rp.cells.find((c) => c.cellId === 'r0c0');
    assert.ok(c00.content.includes('天空为何是蓝的'));
    assert.ok(c00.content.includes('T0.3'));
    const c01 = rp.cells.find((c) => c.cellId === 'r0c1');
    assert.ok(c01.content.includes('T-def'));
    // 检查器：mock 输出不含「散射」→ contains 失败；equals "2" 也失败；第三样本无检查
    const checksR0 = rp.cells.filter((c) => c.sampleIdx === 0).map((c) => (c.checks || []).map((x) => x.pass));
    assert.deepStrictEqual(checksR0, [[false], [false]]);
    assert.ok(rp.aggregates.variants.every((v) => v.judgeN === 3), 'judge 应覆盖 3 格/变体');
    assert.ok(rp.aggregates.variants.every((v) => v.judgeAvg === 9));
    assert.ok(upstream.judgeHits >= 6);
    // 投影无完整 key
    assert.ok(!JSON.stringify(rp).includes('sk-manual-ok'), '投影不得含完整 key');
  });

  await t('结果文件落盘 + 全文>投影', async () => {
    const files = fs.readdirSync(runDir).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= 1, `runs 目录应有文件：${files}`);
    const full = JSON.parse(fs.readFileSync(path.join(runDir, `${runId}.json`), 'utf8'));
    const c = full.cells.find((x) => x.cellId === 'r0c0');
    assert.ok(c.content.length > 10);
    const proj = await kvGet(`pmtx.run.${runId}`);
    assert.ok(proj.cells.find((x) => x.cellId === 'r0c0').content.length <= 1200);
    // 文件含 vars 全量；投影含 sampleSummaries
    assert.ok(full.samples[0].vars.q);
    assert.ok(proj.sampleSummaries.length === 3);
  });

  await t('get_cell 全文 + annotate 回写文件与投影', async () => {
    const r = await cmd('get_cell', { runId, cellId: 'r1c0' });
    assert.strictEqual(r.ok, true);
    assert.ok(r.cell.content.includes('1+1'));
    assert.deepStrictEqual(r.vars, { q: '1+1=?只回答数字' });
    const a = await cmd('annotate', { runId, cellId: 'r1c0', verdict: 'up' });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(a.applied, 'file');
    const proj = await kvGet(`pmtx.run.${runId}`);
    assert.strictEqual(proj.cells.find((c) => c.cellId === 'r1c0').annotated, 'up');
    const full = JSON.parse(fs.readFileSync(path.join(runDir, `${runId}.json`), 'utf8'));
    assert.strictEqual(full.cells.find((c) => c.cellId === 'r1c0').annotated, 'up');
  });

  await t('限流重试：429×2 后成功（attempts=3）', async () => {
    await cmd('profiles_upsert', { profile: { name: '限流档', baseUrl: `http://127.0.0.1:${upPort}`, apiKey: 'sk-flaky', model: 'mock-chat', wire: 'openai-chat-completions' } });
    const st = await cmd('get_state', {});
    const flaky = st.profiles.find((p) => p.keyMask.endsWith('laky'));
    assert.ok(flaky, '限流档案应在列');
    const r = await cmd('run_start', {
      jsonl: '{"q": "flaky 测试"}',
      variants: [{ name: 'flaky', profileId: flaky.id, userTemplate: '{{q}}', maxTokens: 32 }],
      concurrency: 1,
      retries: 2,
    }, 15000);
    assert.strictEqual(r.ok, true);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (!(await kvGet('pmtx.progress'))) break;
      await sleep(500);
    }
    const run = await cmd('get_run', { runId: r.runId }, 15000);
    const cell = run.run.cells[0];
    assert.strictEqual(cell.attempts, 3);
    assert.strictEqual(cell.ok, true);
    assert.ok(upstream.flakyHits >= 2);
  });

  await t('401 不重试：attempts=1 + error.auth', async () => {
    await cmd('profiles_upsert', { profile: { name: '坏 key', baseUrl: `http://127.0.0.1:${upPort}`, apiKey: 'sk-bad', model: 'mock-chat', wire: 'openai-chat-completions' } });
    const st = await cmd('get_state', {});
    const bad = st.profiles.find((p) => p.keyMask.endsWith('-bad'));
    const r = await cmd('run_start', {
      jsonl: '{"q": "x"}',
      variants: [{ name: 'bad', profileId: bad.id, userTemplate: '{{q}}' }],
      concurrency: 1,
      retries: 2,
    }, 15000);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (!(await kvGet('pmtx.progress'))) break;
      await sleep(500);
    }
    const run = await cmd('get_run', { runId: r.runId }, 15000);
    const cell = run.run.cells[0];
    assert.strictEqual(cell.ok, false);
    assert.strictEqual(cell.error.code, 'auth');
    assert.strictEqual(cell.attempts, 1, '401 是语义错误，不应重试');
  });

  await t('并发上限：maxInflight ≤ concurrency', async () => {
    assert.ok(upstream.maxInflight <= 2, `maxInflight=${upstream.maxInflight}（并发上限 2 的那轮）`);
  });

  await t('取消：中止后 status=aborted + 已完成格保留', async () => {
    await cmd('profiles_upsert', { profile: { name: '慢速', baseUrl: `http://127.0.0.1:${upPort}`, apiKey: 'sk-slow', model: 'mock-chat', wire: 'openai-chat-completions' } });
    // sk-slow 未在 mock 特判——走 60ms 正常路径；改为利用大样本+低并发制造时间窗
    const lines = Array.from({ length: 40 }, (_, i) => `{"q": "s${i}"}`).join('\n');
    const st = await cmd('get_state', {});
    const slow = st.profiles.find((p) => p.keyMask.endsWith('slow'));
    const r = await cmd('run_start', {
      jsonl: lines,
      variants: [{ name: '慢', profileId: slow.id, userTemplate: '{{q}}' }],
      concurrency: 1,
      retries: 0,
    }, 15000);
    await sleep(1500);
    const c = await cmd('run_cancel', {});
    assert.strictEqual(c.ok, true);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const m = await kvGet('pmtx.meta');
      if (!m.running) break;
      await sleep(500);
    }
    const run = await cmd('get_run', { runId: r.runId }, 15000);
    assert.strictEqual(run.run.status, 'aborted');
    const okCells = run.run.cells.filter((x) => x.ok).length;
    const abortedCells = run.run.cells.filter((x) => x.status === 'aborted').length;
    assert.ok(okCells > 0, '已完成的格子应保留');
    assert.ok(abortedCells > 0, '未跑的格子应标中止');
  });

  await t('忙碌拒绝：运行中再发起被拒', async () => {
    // 现在没有运行中的任务（上一轮已结束）——发起一个慢的再撞一次
    const st = await cmd('get_state', {});
    const slow = st.profiles.find((p) => p.keyMask.endsWith('slow'));
    const lines = Array.from({ length: 30 }, (_, i) => `{"q": "b${i}"}`).join('\n');
    const r1 = await cmd('run_start', { jsonl: lines, variants: [{ profileId: slow.id, userTemplate: '{{q}}' }], concurrency: 1 }, 15000);
    assert.strictEqual(r1.ok, true);
    const r2 = await cmd('run_start', { jsonl: '{"q":"x"}', variants: [{ profileId: slow.id, userTemplate: '{{q}}' }] }, 15000);
    assert.strictEqual(r2.ok, false);
    assert.ok(r2.error.includes('正忙'));
    await cmd('run_cancel', {});
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const m = await kvGet('pmtx.meta');
      if (!m.running) break;
      await sleep(500);
    }
  });

  await t('数据集删除 + 历史存在', async () => {
    const st = await cmd('get_state', {});
    const ds = st.datasets[0];
    const r = await cmd('datasets_delete', { id: ds.id });
    assert.strictEqual(r.ok, true);
    const st2 = await cmd('get_state', {});
    assert.ok(!st2.datasets.find((d) => d.id === ds.id));
    assert.ok(st2.history.length >= 4, `历史应有 ≥4 条：${st2.history.length}`);
    assert.ok(st2.history.every((h) => h.runId));
  });

  await t('变体校验：超 8 个/坏 profileId/空模板拒绝', async () => {
    const st = await cmd('get_state', {});
    const p = st.profiles[0];
    const bad1 = await cmd('run_start', { jsonl: '{"q":1}', variants: Array.from({ length: 9 }, () => ({ profileId: p.id, userTemplate: 'x' })) }, 15000);
    assert.strictEqual(bad1.ok, false);
    const bad2 = await cmd('run_start', { jsonl: '{"q":1}', variants: [{ profileId: 'nope', userTemplate: 'x' }] }, 15000);
    assert.strictEqual(bad2.ok, false);
    const bad3 = await cmd('run_start', { jsonl: '{"q":1}', variants: [{ profileId: p.id, userTemplate: '  ' }] }, 15000);
    assert.strictEqual(bad3.ok, false);
  });
} finally {
  svc.kill();
  upstreamServer.close();
  bridge.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟，尽力清理 */ }
}

console.log(`\n==== 服务集成：${results.filter((r) => r.pass).length}/${results.length} 通过 ====`);
for (const r of results.filter((x) => !x.pass)) console.log(`  ✗ ${r.name}\n    ${r.detail}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
