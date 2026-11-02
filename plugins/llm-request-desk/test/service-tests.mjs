/**
 * 服务级集成测试（真 service 进程 + 假桥 + mock LLM 上游）：node test/service-tests.mjs
 *
 * 与 core-tests 的差别：本文件把 service/main.js 当真进程跑起来——
 * 假桥（内存 kv 的 /api/router-dispatch）经 POLARIS_HOST/PORT env 注入，
 * 连「单槽命令信箱 → tick 消费 → res 回执」的完整链路一起覆盖。
 * 不依赖宿主与外网（mock 上游全在 127.0.0.1 随机端口）。
 */
import http from 'node:http';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/request-core.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假桥：内存 kv 的 router-dispatch ────────────────────────────────────────
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200); res.end('{"ok":true}'); return; }
  if (req.url === '/api/router-dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { req: r } = JSON.parse(body);
        const { target, payload } = r || {};
        if (target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown target' })); return; }
        const a = payload || {};
        if (a.action === 'get') {
          const v = kvStore.get(a.key);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { value: v === undefined ? null : v } }));
        } else if (a.action === 'set') {
          kvStore.set(a.key, a.value === undefined ? null : a.value);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
        } else if (a.action === 'delete') {
          kvStore.delete(a.key);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
        } else if (a.action === 'list') {
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { keys: [...kvStore.keys()] } }));
        } else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown kv action' })); }
      } catch (e) { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message })); }
    });
    return;
  }
  res.writeHead(404); res.end();
});

// ── 假 LLM 上游 ─────────────────────────────────────────────────────────────
// 路由语义由 baseUrl 路径区分：
//   /ok/v1/chat/completions   OpenAI 流式全绿（含 usage）
//   /plain/v1/chat/completions OpenAI 非流式
//   /badkey/v1/chat/completions 401
//   /drift/v1/chat/completions  400 参数漂移（Unrecognized request argument）
//   /sensenova/v1/messages      Anthropic 400 inference request is invalid
//   <any>/v1/models             模型表
function mockLLM() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url.endsWith('/v1/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'mock-chat' }, { id: 'mock-r1' }] }));
        return;
      }
      const j = (() => { try { return JSON.parse(body || '{}'); } catch (_) { return {}; } })();
      if (req.url.includes('/badkey')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Incorrect API key provided', type: 'authentication_error' } }));
        return;
      }
      if (req.url.includes('/drift')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Unrecognized request argument supplied: reasoning_effort', type: 'invalid_request_error' } }));
        return;
      }
      if (req.url.includes('/sensenova')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'inference request is invalid' } }));
        return;
      }
      if (req.url.includes('/plain')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: ' PlainOK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }));
        return;
      }
      // OpenAI 流式全绿
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"role":"assistant","content":"你好"}}]}\n\n');
      setTimeout(() => {
        res.write('data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":11,"completion_tokens":4,"total_tokens":15}}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      }, 40);
    });
  });
}

// ── 信箱命令助手 ────────────────────────────────────────────────────────────
let nonceSeq = 0;
async function cmd(action, payload, waitMs = 15000) {
  const nonce = `t${Date.now().toString(36)}-${++nonceSeq}`;
  kvStore.set('llmdesk.cmd', { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(300);
    const r = kvStore.get('llmdesk.res');
    if (r && r.nonce === nonce) {
      kvStore.delete('llmdesk.res');
      return r.result;
    }
  }
  throw new Error(`命令 ${action} 超时无回执`);
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const bridgePort = await listen(bridge);
  const llm = mockLLM();
  const llmPort = await listen(llm);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmdesk-test-'));
  const svcPort = 19871 + Math.floor(Math.random() * 500);

  const child = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), String(svcPort), tmpDir], {
    env: {
      // 假 APPDATA：隔离测试进程与真宿主配置（anchor/config 候选全部落空），防测试污染
      ...process.env, APPDATA: tmpDir, HOME: tmpDir,
      POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let svcLog = '';
  child.stderr.on('data', (c) => { svcLog += c; });
  child.stdout.on('data', () => { /* 协议通道，本服务无 stdout */ });

  try {
    // 等 service 起来
    let healthy = false;
    for (let i = 0; i < 40 && !healthy; i++) {
      await sleep(250);
      healthy = await new Promise((resolve) => {
        const rq = http.get({ hostname: '127.0.0.1', port: svcPort, path: '/__health', timeout: 800 }, (r) => { r.resume(); resolve(r.statusCode === 200); });
        rq.on('error', () => resolve(false));
        rq.on('timeout', () => { rq.destroy(); resolve(false); });
      });
    }
    await t('service 启动 + 假桥发现（meta 心跳可见）', async () => {
      assert.ok(healthy, '健康端点未就绪');
      const meta = kvStore.get('llmdesk.meta');
      assert.ok(meta && meta.version, `meta 未写：${svcLog.slice(-300)}`);
      assert.equal(meta.degraded, false);
    });

    await t('endpoint_upsert：手动添加端点（掩码落 kv）', async () => {
      const r = await cmd('endpoint_upsert', { endpoint: { id: 'mock-openai', name: 'Mock OpenAI', baseUrl: `http://127.0.0.1:${llmPort}/ok`, apiKey: 'sk-mock-1234567890', wire: core.WIRE_OPENAI } });
      assert.ok(r.ok, r.error);
      const pub = kvStore.get('llmdesk.endpoints');
      const item = pub.items.find((x) => x.id === 'mock-openai');
      assert.ok(item);
      assert.equal(item.keyMask, '****7890');
      assert.ok(!JSON.stringify(pub).includes('sk-mock-1234567890'), 'kv 里不得出现完整 key');
    });

    await t('send：OpenAI 流式全绿——text 聚合/finish/usage/timeline', async () => {
      const r = await cmd('send', { endpointId: 'mock-openai', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], maxTokens: 64, stream: true } });
      assert.ok(r.ok, r.error);
      const rec = r.record;
      assert.equal(rec.ok, true);
      assert.equal(rec.status, 200);
      assert.equal(rec.streamInfo.text, '你好，世界');
      assert.equal(rec.streamInfo.finishReason, 'stop');
      assert.equal(rec.streamInfo.usage.prompt, 11);
      assert.equal(rec.streamInfo.usage.completion, 4);
      assert.ok(rec.streamInfo.doneMarker, '应有 [DONE] 标记');
      assert.ok(rec.timeline.length >= 2, `timeline 过少：${JSON.stringify(rec.timeline)}`);
      assert.ok(rec.streamInfo.ttftMs != null && rec.ms > 0);
      assert.ok(!rec.findings.some((f) => f.severity === 'error'), `不应有 error 级诊断：${JSON.stringify(rec.findings)}`);
      assert.ok(!JSON.stringify(rec.body).includes('sk-mock'), '请求体不含 key');
    });

    await t('send：非流式——content 提取 + all-clear', async () => {
      const r = await cmd('endpoint_upsert', { endpoint: { id: 'mock-plain', name: 'Mock Plain', baseUrl: `http://127.0.0.1:${llmPort}/plain`, apiKey: 'sk-mock-1234567890', wire: core.WIRE_OPENAI } });
      assert.ok(r.ok);
      const s = await cmd('send', { endpointId: 'mock-plain', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }] } });
      assert.ok(s.ok, s.error);
      assert.equal(s.record.content, ' PlainOK');
      assert.equal(s.record.streamInfo, null);
      assert.ok(s.record.findings.some((f) => f.id === 'all-clear'));
    });

    await t('send：401 → auth-fail 诊断', async () => {
      await cmd('endpoint_upsert', { endpoint: { id: 'mock-bad', name: 'Bad Key', baseUrl: `http://127.0.0.1:${llmPort}/badkey`, apiKey: 'sk-wrong-0000000000', wire: core.WIRE_OPENAI } });
      const r = await cmd('send', { endpointId: 'mock-bad', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }] } });
      assert.ok(r.ok);
      assert.equal(r.record.status, 401);
      const f = r.record.findings.find((x) => x.id === 'auth-fail');
      assert.ok(f && f.severity === 'error');
      assert.equal(r.record.ok, false);
    });

    await t('send：400 参数漂移 → param-unsupported 诊断', async () => {
      await cmd('endpoint_upsert', { endpoint: { id: 'mock-drift', name: 'Drift', baseUrl: `http://127.0.0.1:${llmPort}/drift`, apiKey: 'sk-mock-1234567890', wire: core.WIRE_OPENAI } });
      const r = await cmd('send', {
        endpointId: 'mock-drift',
        draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], extra: { reasoning_effort: 'high' } },
      });
      assert.ok(r.ok);
      assert.ok(r.record.findings.find((x) => x.id === 'param-unsupported'), JSON.stringify(r.record.findings));
    });

    await t('send：商汤形态 400（Anthropic + assistant 结尾）→ 双诊断', async () => {
      await cmd('endpoint_upsert', { endpoint: { id: 'mock-sensenova', name: 'Sensenova', baseUrl: `http://127.0.0.1:${llmPort}/sensenova`, apiKey: 'sk-ant-1234567890', wire: core.WIRE_ANTHROPIC } });
      const r = await cmd('send', {
        endpointId: 'mock-sensenova',
        draft: { model: 'sn-6.8', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], maxTokens: 128 },
      });
      assert.ok(r.ok);
      const ids = r.record.findings.map((f) => f.id);
      assert.ok(ids.includes('trailing-assistant'), ids.join(','));
      assert.ok(ids.includes('generic-invalid'), ids.join(','));
    });

    await t('预检拦截：空 model 不发请求直接报错', async () => {
      const r = await cmd('send', { endpointId: 'mock-openai', draft: { model: '', messages: [{ role: 'user', content: 'x' }] } });
      assert.equal(r.ok, false);
      assert.ok(r.precheck);
      assert.ok(r.precheck.errors.some((e) => e.includes('model')));
    });

    await t('cap 护栏：maxTokens 被 cap 到上限', async () => {
      const r = await cmd('send', {
        endpointId: 'mock-plain', cap: { maxTokensMax: 256 },
        draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], maxTokens: 99999 },
      });
      assert.ok(r.ok);
      assert.equal(r.record.body.max_tokens, 256);
    });

    await t('mutate：从请求记录做「补空 user 结尾」并回读', async () => {
      // 先拿到商汤那条的 reqId（history 第一条匹配 sensenova 的 ok=false 记录）
      const hist = kvStore.get('llmdesk.history');
      const entry = hist.find((x) => x.endpointId === 'mock-sensenova');
      assert.ok(entry, '历史里应有 sensenova 记录');
      const r = await cmd('mutate', { reqId: entry.reqId, mutatorId: 'append-empty-user' });
      assert.ok(r.ok, r.error);
      const last = r.body.messages[r.body.messages.length - 1];
      assert.equal(last.role, 'user');
      assert.deepEqual(last.content, [{ type: 'text', text: '' }]);
      // 变异后用同一端点重放（此时端点仍 400，但 trailing-assistant 诊断应消失）
      const rr = await cmd('send', { endpointId: 'mock-sensenova', draft: { model: 'sn-6.8', messages: r.body.messages, maxTokens: 128 } });
      assert.ok(rr.ok);
      assert.ok(!rr.record.findings.find((f) => f.id === 'trailing-assistant'), '变异后 trailing-assistant 应消失');
    });

    await t('mutators：列变异器', async () => {
      const r = await cmd('mutators', { wire: core.WIRE_ANTHROPIC });
      assert.ok(r.ok && r.items.length >= 7);
    });

    await t('models：拉模型表', async () => {
      const r = await cmd('models', { endpointId: 'mock-openai' });
      assert.ok(r.ok, r.error);
      assert.equal(r.count, 2);
      assert.deepEqual(r.models, ['mock-chat', 'mock-r1']);
    });

    await t('get_state：latest 与 history 已落库', async () => {
      const r = await cmd('get_state', {});
      assert.ok(r.ok);
      assert.ok(r.latest && r.latest.reqId);
      assert.ok(r.history.length >= 5);
      assert.ok(r.endpoints.length >= 4);
    });

    await t('get_req：按 reqId 回读完整记录', async () => {
      const hist = kvStore.get('llmdesk.history');
      const r = await cmd('get_req', { reqId: hist[0].reqId });
      assert.ok(r.ok && r.record.body);
    });

    await t('settings_set：超时更新生效', async () => {
      const r = await cmd('settings_set', { timeoutMs: 45000 });
      assert.ok(r.ok);
      assert.equal(r.settings.timeoutMs, 45000);
    });

    await t('端点删除：force 删除宿主形态', async () => {
      const d = await cmd('endpoint_delete', { id: 'mock-bad', force: true });
      assert.ok(d.ok, d.error);
      const st = await cmd('get_state', {});
      assert.ok(!st.endpoints.some((e) => e.id === 'mock-bad'));
    });
  } finally {
    child.kill();
    bridge.close();
    llm.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟 */ }
  }

  const pass = results.filter((x) => x.pass).length;
  for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
  console.log(`\n${pass}/${results.length} passed`);
  if (pass !== results.length) {
    console.error('--- service log tail ---\n' + svcLog.slice(-2000));
    process.exit(1);
  }
  // 子进程在 Windows 上可能不受 SIGTERM 影响，显式退出避免悬挂句柄拖住测试进程
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
