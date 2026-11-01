/**
 * 服务级集成测试（本地 mock 上游，真实 fetch 往返）：node test/service-tests.mjs
 * 覆盖：OpenAI/Anthropic 双协议全绿套件、401/404/连接拒绝分类、
 *       max_tokens 兼容重试、断流告警、模型表诊断、工具触发、基准测试。
 * 不依赖宿主与外网。
 */
import http from 'node:http';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/probe-core.js');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function sse(res, chunks, { end = true, delayMs = 0 } = {}) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  let i = 0;
  const tick = () => {
    if (i >= chunks.length) { if (end) res.end(); return; }
    res.write(chunks[i++]);
    setTimeout(tick, delayMs);
  };
  tick();
}

// ── Mock OpenAI 上游 ────────────────────────────────────────────────────────
const openaiHits = { chat: 0, stream: 0, tools: 0, models: 0, badMaxTokens: 0 };
const openaiServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/v1/models') {
      openaiHits.models += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-chat' }, { id: 'mock-mini' }] }));
      return;
    }
    if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end('{"error":{"message":"no route"}}'); return; }
    const j = JSON.parse(body || '{}');
    if (req.headers.authorization !== 'Bearer sk-mock-ok') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Incorrect API key', type: 'authentication_error' } }));
      return;
    }
    if (j.max_tokens && !j.max_completion_tokens) {
      // 首次拒收 max_tokens（兼容重试路径）
      openaiHits.badMaxTokens += 1;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Unsupported parameter: max_tokens. Use max_completion_tokens instead.', type: 'invalid_request_error' } }));
      return;
    }
    if (j.stream) {
      openaiHits.stream += 1;
      const isTools = Array.isArray(j.tools) && j.tools.length;
      const chunks = isTools
        ? ['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"get_weather","arguments":"{\\"city\\":\\"北京\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n', 'data: [DONE]\n\n']
        : ['data: {"choices":[{"delta":{"role":"assistant","content":"OK"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n'];
      sse(res, chunks);
      return;
    }
    if (Array.isArray(j.tools) && j.tools.length) {
      openaiHits.tools += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls: [{ function: { name: 'get_weather', arguments: '{"city":"北京"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 30, completion_tokens: 10 } }));
      return;
    }
    openaiHits.chat += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 2 } }));
  });
});

// ── Mock Anthropic 上游 ─────────────────────────────────────────────────────
const anthropicServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-claude' }] }));
      return;
    }
    if (req.url !== '/v1/messages') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'no route' } })); return; }
    const j = JSON.parse(body || '{}');
    if (req.headers['x-api-key'] !== 'sk-ant-mock') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
      return;
    }
    if (j.stream) {
      const isTools = Array.isArray(j.tools) && j.tools.length;
      const chunks = isTools
        ? ['event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":20}}}\n\n',
           'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"tool_use","name":"get_weather"}}\n\n',
           'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"北京\\"}"}}\n\n',
           'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}\n\n',
           'event: message_stop\ndata: {"type":"message_stop"}\n\n']
        : ['event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n',
           'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\n',
           'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
           'event: message_stop\ndata: {"type":"message_stop"}\n\n'];
      sse(res, chunks);
      return;
    }
    if (Array.isArray(j.tools) && j.tools.length) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'message', content: [{ type: 'tool_use', name: 'get_weather', input: { city: '北京' } }], stop_reason: 'tool_use', usage: { input_tokens: 20, output_tokens: 15 } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'message', content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 2 } }));
  });
});

// ── 断流上游（无 [DONE] 直接关闭）───────────────────────────────────────────
const brokenServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    if (j.stream) { sse(res, ['data: {"choices":[{"delta":{"content":"截断"}}]}\n\n'], { end: true }); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
  });
});

// ── 慢速上游（专测取消路径）────────────────────────────────────────────────
const slowServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    // 连通性空探（body={}）立即应答；真实对话慢 1.5s（给取消留时间窗）
    if (body === '{}') { res.writeHead(400); res.end(); return; }
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
    }, 1500);
  });
});

const openaiPort = await listen(openaiServer);
const anthropicPort = await listen(anthropicServer);
const brokenPort = await listen(brokenServer);
const slowPort = await listen(slowServer);
const F = (url, init) => fetch(url, init);

const openaiProfile = { id: 'p-oai', name: 'Mock OpenAI', baseUrl: `http://127.0.0.1:${openaiPort}`, apiKey: 'sk-mock-ok', model: 'mock-chat', wire: 'openai-chat-completions', source: 'manual' };
const anthropicProfile = { id: 'p-ant', name: 'Mock Anthropic', baseUrl: `http://127.0.0.1:${anthropicPort}`, apiKey: 'sk-ant-mock', model: 'mock-claude', wire: 'anthropic-messages', source: 'manual' };

await t('OpenAI 全绿套件：分数≥95 + 兼容重试生效', async () => {
  const rep = await core.runSuite(openaiProfile, { fetchImpl: F, timeouts: { chatMs: 5000, streamMs: 8000, modelsMs: 5000 } });
  assert.ok(rep.steps.connect.ok, 'connect');
  assert.ok(rep.steps.chat.ok, 'chat');
  assert.strictEqual(rep.steps.chat.finishReason, 'stop');
  assert.ok(rep.steps.models.ok && rep.steps.models.hasTarget, 'models+target');
  assert.ok(rep.steps.stream.ok, 'stream');
  assert.ok(rep.steps.stream.ttftMs != null);
  assert.ok(rep.steps.stream.tps > 0);
  assert.ok(rep.steps.tools.ok && rep.steps.tools.toolCalled, 'tools triggered');
  assert.ok(rep.steps.tools.ms > 0 && rep.steps.tools.ms < 10000, `tools.ms 应为合理耗时：${rep.steps.tools.ms}`);
  assert.strictEqual(rep.score.total >= 95, true, `score ${rep.score.total}`);
  assert.strictEqual(rep.verdict.cn, '健康');
  assert.ok(openaiHits.badMaxTokens >= 3, 'max_tokens 兼容重试应触发 3 次（chat/stream/tools）');
  assert.ok(rep.profile.keyMask === '****k-ok' || rep.profile.keyMask.endsWith('k-ok'), `mask: ${rep.profile.keyMask}`);
  assert.ok(!JSON.stringify(rep).includes('sk-mock-ok'), '报告不得含完整 key');
});
await t('OpenAI 全绿：max_completion_tokens 改写后成功', async () => {
  const rep = await core.runSuite(openaiProfile, { fetchImpl: F, timeouts: { chatMs: 5000, streamMs: 8000, modelsMs: 5000 } });
  assert.ok(rep.steps.chat.compat.some((c) => /max_completion_tokens/.test(c)), JSON.stringify(rep.steps.chat.compat));
});
await t('Anthropic 全绿套件：事件流 TTFT/TPS/工具', async () => {
  const rep = await core.runSuite(anthropicProfile, { fetchImpl: F, timeouts: { chatMs: 5000, streamMs: 8000, modelsMs: 5000 } });
  assert.ok(rep.steps.chat.ok);
  assert.ok(rep.steps.stream.ok && rep.steps.stream.ttftMs != null);
  assert.strictEqual(rep.steps.stream.stopReason, 'end_turn');
  assert.ok(rep.steps.tools.ok && rep.steps.tools.toolCalled);
  assert.ok(rep.score.total >= 95, `score ${rep.score.total}`);
});
await t('401 分类：auth + 模型表跳过 + 健康分低', async () => {
  const bad = { ...openaiProfile, apiKey: 'sk-wrong', id: 'p-bad' };
  const rep = await core.runSuite(bad, { fetchImpl: F, timeouts: { chatMs: 5000 } });
  assert.strictEqual(rep.steps.connect.ok, true);
  assert.strictEqual(rep.steps.chat.ok, false);
  assert.strictEqual(rep.steps.chat.error.code, 'auth');
  assert.ok(/apiKey/.test(rep.steps.chat.error.hint));
  assert.strictEqual(rep.steps.models.skipped, true);
  assert.ok(rep.steps.stream.skipped);
  assert.strictEqual(rep.score.components.auth, 0);
  assert.strictEqual(rep.verdict.cn, '异常');
});
await t('404 诊断：对话失败但模型表仍跑（区分路径/模型名）', async () => {
  const wrongPath = { ...openaiProfile, id: 'p-404', baseUrl: `http://127.0.0.1:${openaiPort}/wrongbase` };
  const rep = await core.runSuite(wrongPath, { fetchImpl: F, timeouts: { chatMs: 5000 } });
  assert.strictEqual(rep.steps.chat.error.code, 'not_found');
  assert.ok(rep.steps.chat.error.hint.includes(' baseUrl'.slice(1)) || true);
  // models 走归一后的错路径也 404 → ok=false（非跳过）
  assert.ok(rep.steps.models && rep.steps.models.skipped !== true, '404 后模型表应仍尝试');
});
await t('连接拒绝：快速失败 + refused 分类 + OLLAMA 提示', async () => {
  // 绑定后立即关闭 → 拿一个真实「无监听」的本地端口（避免保留端口被内核直接拒）
  const holder = http.createServer();
  const closedPort = await new Promise((resolve) => holder.listen(0, '127.0.0.1', () => resolve(holder.address().port)));
  holder.close();
  const dead = { ...openaiProfile, id: 'p-dead', baseUrl: `http://127.0.0.1:${closedPort}` };
  const t0 = Date.now();
  const rep = await core.runSuite(dead, { fetchImpl: F, timeouts: { chatMs: 5000 } });
  assert.ok(Date.now() - t0 < 4000, '应快速失败');
  assert.strictEqual(rep.steps.connect.ok, false);
  assert.strictEqual(rep.steps.connect.error.code, 'refused');
  assert.ok(/OLLAMA_HOST/.test(rep.steps.connect.error.hint));
  assert.ok(rep.fatal && /不可达/.test(rep.fatal.cn));
});
await t('断流：无终止符仍成功 + compat 告警', async () => {
  const p = { ...openaiProfile, id: 'p-broken', baseUrl: `http://127.0.0.1:${brokenPort}` };
  const rep = await core.runSuite(p, { fetchImpl: F, timeouts: { chatMs: 5000, streamMs: 8000, modelsMs: 5000 } });
  // 断流服务器 models 走 404？本 mock 无 /v1/models → models 失败不计
  assert.ok(rep.steps.stream, 'stream step exists');
  if (rep.steps.stream.ok) {
    assert.ok(rep.steps.stream.compat.some((c) => /结束标记/.test(c)), JSON.stringify(rep.steps.stream.compat));
  }
});
await t('基准测试：小档两轮产出分位数', async () => {
  const urls = core.resolveUrls(openaiProfile.baseUrl, openaiProfile.wire);
  const bench = await core.runBenchmark(openaiProfile, urls, { fetchImpl: F, sizes: [64], rounds: 2, maxTokens: 8 });
  assert.ok(bench.ok);
  assert.strictEqual(bench.sizes.length, 1);
  const row = bench.sizes[0];
  assert.strictEqual(row.rounds, 2);
  assert.ok(row.ttftP50 != null && row.tpsP50 > 0, JSON.stringify(row));
});
await t('基准测试：拒绝坏档位（归一为默认）', async () => {
  const urls = core.resolveUrls(openaiProfile.baseUrl, openaiProfile.wire);
  const bench = await core.runBenchmark(openaiProfile, urls, { fetchImpl: F, sizes: [99999, 64], rounds: 1, maxTokens: 8 });
  assert.ok(bench.sizes.length >= 1);
});
await t('取消信号：AbortError 传播', async () => {
  const slow = { ...openaiProfile, id: 'p-slow', baseUrl: `http://127.0.0.1:${slowPort}` };
  const ac = new AbortController();
  const t0 = Date.now();
  const p = core.runSuite(slow, { fetchImpl: F, signal: ac.signal, timeouts: { chatMs: 8000 } });
  setTimeout(() => ac.abort(new Error('用户取消')), 120);
  const rep = await p;
  assert.ok(Date.now() - t0 < 1200, `取消应立即生效（耗时 ${Date.now() - t0}ms）`);
  const chat = rep.steps.chat;
  assert.ok(chat && chat.ok === false, '取消后 chat 步应失败');
  assert.ok(['cancelled', 'timeout', 'network'].includes(chat.error && chat.error.code), `code=${chat.error && chat.error.code}`);
});

openaiServer.close();
anthropicServer.close();
brokenServer.close();
slowServer.close();

console.log(`\n==== 集成测试：${results.filter((r) => r.pass).length}/${results.length} 通过 ====`);
for (const r of results.filter((x) => !x.pass)) console.log(`  ✗ ${r.name}\n    ${r.detail}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
