'use strict';
/**
 * core-tests.mjs —— request-core 纯函数单测
 * 跑法：node --test test/core-tests.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/request-core.js');

// ── 掩码 ──
test('maskKey：长 key 尾4可见，短 key 全掩码，空为（无）', () => {
  assert.equal(core.maskKey('sk-1234567890abcdef'), '****cdef');
  assert.equal(core.maskKey('abc'), '****');
  assert.equal(core.maskKey(''), '（无）');
  assert.equal(core.maskKey(null), '（无）');
});

test('maskHeaders：鉴权头掩码，普通头保留', () => {
  const m = core.maskHeaders({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-abcdefgh12345678',
    'x-api-key': 'ak-prefix-9999xyz',
    'anthropic-version': '2023-06-01',
  });
  assert.equal(m['Content-Type'], 'application/json');
  assert.equal(m['Authorization'], '****5678');
  assert.equal(m['x-api-key'], '****9xyz');
  assert.equal(m['anthropic-version'], '2023-06-01');
});

// ── URL 归一 ──
test('resolveUrl：OpenAI 无 /v1 自动补、有 /v1 不重复', () => {
  assert.equal(core.resolveUrl('https://api.deepseek.com', core.WIRE_OPENAI), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(core.resolveUrl('https://api.deepseek.com/v1', core.WIRE_OPENAI), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(core.resolveUrl('https://api.openai.com/', core.WIRE_OPENAI), 'https://api.openai.com/v1/chat/completions');
});

test('resolveUrl：Anthropic 路径与 pathOverride', () => {
  assert.equal(core.resolveUrl('https://gw.local', core.WIRE_ANTHROPIC), 'https://gw.local/v1/messages');
  assert.equal(core.resolveUrl('https://gw.local/v1', core.WIRE_ANTHROPIC), 'https://gw.local/v1/messages');
  assert.equal(core.resolveUrl('https://gw.local', core.WIRE_ANTHROPIC, '/v1/messages?beta=true'), 'https://gw.local/v1/messages?beta=true');
});

test('resolveUrl：非法输入抛错', () => {
  assert.throws(() => core.resolveUrl('', core.WIRE_OPENAI));
  assert.throws(() => core.resolveUrl('ftp://x', core.WIRE_OPENAI));
  assert.throws(() => core.resolveUrl('api.example.com', core.WIRE_OPENAI));
});

test('resolveModelsUrl', () => {
  assert.equal(core.resolveModelsUrl('https://api.x.com'), 'https://api.x.com/v1/models');
  assert.equal(core.resolveModelsUrl('https://api.x.com/v1/'), 'https://api.x.com/v1/models');
});

// ── 协议预检 ──
test('validatePayload：model/messages 缺失为 error', () => {
  const r = core.validatePayload(core.WIRE_OPENAI, { messages: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('model')));
  assert.ok(r.errors.some((e) => e.includes('messages')));
});

test('validatePayload：Anthropic 缺 max_tokens 为 error（协议必填）', () => {
  const r = core.validatePayload(core.WIRE_ANTHROPIC, { model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('max_tokens')));
});

test('validatePayload：trailing assistant 出 warning（不拦截）', () => {
  const r = core.validatePayload(core.WIRE_ANTHROPIC, {
    model: 'm', maxTokens: 100,
    messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
  });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('assistant 结尾')));
});

test('validatePayload：非法角色 error', () => {
  const r = core.validatePayload(core.WIRE_OPENAI, { model: 'm', messages: [{ role: 'system', content: 'x' }] });
  assert.equal(r.ok, false);
});

// ── 请求构造 ──
test('buildRequest：OpenAI——system 并入、Bearer、stream_options 默认带 usage', () => {
  const ep = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test123456', wire: core.WIRE_OPENAI };
  const r = core.buildRequest(ep, {
    model: 'deepseek-chat', system: '你是助手',
    messages: [{ role: 'user', content: 'hi' }], stream: true, temperature: 0.7,
  });
  assert.equal(r.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(r.headers.Authorization, 'Bearer sk-test123456');
  assert.equal(r.body.messages[0].role, 'system');
  assert.equal(r.body.messages[1].role, 'user');
  assert.equal(r.body.stream_options.include_usage, true);
  assert.ok(!('system' in r.body));
  assert.equal(r.maskedHeaders.Authorization, '****3456');
});

test('buildRequest：Anthropic——x-api-key、独立 system、max_tokens 兜底', () => {
  const ep = { baseUrl: 'https://gw.local', apiKey: 'ak-9999zzzz', wire: core.WIRE_ANTHROPIC };
  const r = core.buildRequest(ep, { model: 'claude-3', system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.url, 'https://gw.local/v1/messages');
  assert.equal(r.headers['x-api-key'], 'ak-9999zzzz');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.body.system, 'sys');
  assert.equal(r.body.max_tokens, 1024);
  assert.ok(!('stream_options' in r.body));
});

test('buildRequest：extra 非标字段透传（thinking 等网关实验字段）', () => {
  const ep = { baseUrl: 'https://gw.local', apiKey: 'k', wire: core.WIRE_ANTHROPIC };
  const r = core.buildRequest(ep, {
    model: 'm', messages: [{ role: 'user', content: 'x' }],
    extra: { thinking: { type: 'adaptive' }, output_config: { a: 1 } },
  });
  assert.deepEqual(r.body.thinking, { type: 'adaptive' });
  assert.deepEqual(r.body.output_config, { a: 1 });
});

test('buildRequest：extra 不允许覆盖 model/messages', () => {
  const ep = { baseUrl: 'https://api.x.com', apiKey: 'k', wire: core.WIRE_OPENAI };
  const r = core.buildRequest(ep, { model: 'real', messages: [{ role: 'user', content: 'x' }], extra: { model: 'fake', messages: [] } });
  assert.equal(r.body.model, 'real');
  assert.equal(r.body.messages.length, 1);
});

test('buildRequest：rawBody 完全透传（高级模式）', () => {
  const ep = { baseUrl: 'https://api.x.com/v1', apiKey: 'k', wire: core.WIRE_OPENAI };
  const r = core.buildRequest(ep, { rawBody: { model: 'm', messages: [{ role: 'user', content: 'raw' }], weird_field: 1 } });
  assert.equal(r.body.weird_field, 1);
  assert.equal(r.url, 'https://api.x.com/v1/chat/completions');
});

// ── SSE 解析 ──
test('SSE：OpenAI 多 chunk 跨行切割 + [DONE]', () => {
  const p = core.createSSEParser(core.WIRE_OPENAI);
  const e1 = p.feed('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"ch');
  const e2 = p.feed('oices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n');
  const all = [...e1, ...e2].flat();
  const deltas = all.filter((x) => x.kind === 'delta').map((x) => x.text).join('');
  assert.equal(deltas, '你好');
  assert.ok(all.some((x) => x.kind === 'finish' && x.note === '[DONE]'));
});

test('SSE：OpenAI finish_reason 与 usage', () => {
  const p = core.createSSEParser(core.WIRE_OPENAI);
  const evs = p.feed([
    'data: {"choices":[{"delta":{"content":"a"}}]}',
    '',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    '',
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')).flat().concat(p.flush());
  assert.ok(evs.some((x) => x.kind === 'finish' && x.finish === 'stop'));
  const usage = evs.find((x) => x.kind === 'usage');
  assert.equal(usage.usage.prompt, 10);
  assert.ok(evs.some((x) => x.kind === 'finish' && x.note === '[DONE]'));
});

test('SSE：OpenAI 流内 error 事件', () => {
  const p = core.createSSEParser(core.WIRE_OPENAI);
  const evs = p.feed('data: {"error":{"message":"upstream rejected","code":"invalid_api_key"}}\n\n').flat();
  const e = evs.find((x) => x.kind === 'error');
  assert.ok(e);
  assert.equal(e.err.code, 'invalid_api_key');
});

test('SSE：Anthropic message_start/content_block_delta/message_delta/message_stop', () => {
  const p = core.createSSEParser(core.WIRE_ANTHROPIC);
  const lines = [
    'event: message_start',
    'data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"早上"}}',
    '',
    'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"思考中"}}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
  ].join('\n');
  const evs = p.feed(lines).flat().concat(p.flush());
  const usage1 = evs.find((x) => x.kind === 'usage');
  assert.equal(usage1.usage.prompt, 25);
  const deltas = evs.filter((x) => x.kind === 'delta').map((x) => x.text).join('');
  assert.equal(deltas, '早上');
  const think = evs.find((x) => x.kind === 'reasoning');
  assert.equal(think.text, '思考中');
  const fin = evs.find((x) => x.kind === 'finish');
  assert.equal(fin.finish, 'end_turn');
  assert.equal(fin.usage.completion, 12);
  assert.ok(evs.some((x) => x.kind === 'meta' && x.event === 'message_stop'));
});

test('SSE：Anthropic 流内 error', () => {
  const p = core.createSSEParser(core.WIRE_ANTHROPIC);
  const evs = p.feed('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n').flat();
  assert.equal(evs[0].kind, 'error');
  assert.equal(evs[0].err.code, 'overloaded_error');
});

// ── 聚合器 ──
test('aggregator：text/reasoning 聚合、finish、usage 合并', () => {
  const agg = core.createStreamAggregator();
  agg.add({ kind: 'delta', text: '你' }, 10);
  agg.add([{ kind: 'delta', text: '好' }, { kind: 'finish', finish: 'stop' }], 12);
  agg.add({ kind: 'usage', usage: { prompt: 8, completion: 2, exact: true } }, 5);
  agg.end();
  const s = agg.summary;
  assert.equal(s.text, '你好');
  assert.equal(s.finishReason, 'stop');
  assert.equal(s.usage.prompt, 8);
  assert.equal(s.usage.completion, 2);
  assert.ok(s.chunkCount === 3 && s.ttftMs != null && s.totalMs >= 0);
});

// ── 错误体解析 ──
test('parseErrorBody：OpenAI 风格 error.message', () => {
  const r = core.parseErrorBody(400, '{"error":{"message":"max_tokens is too large","type":"invalid_request_error","code":"context_length_exceeded"}}');
  assert.equal(r.providerCode, 'invalid_request_error');
  assert.ok(r.message.includes('max_tokens'));
});

test('parseErrorBody：纯文本与 Retry-After', () => {
  const r = core.parseErrorBody(429, 'gateway busy', { 'retry-after': '7' });
  assert.equal(r.message, 'gateway busy');
  assert.equal(r.retryAfterMs, 7000);
});

test('parseErrorBody：空体兜底', () => {
  const r = core.parseErrorBody(502, '');
  assert.ok(r.message.includes('502'));
});

// ── 诊断 ──
function ctxOf(extra) {
  return { wire: core.WIRE_ANTHROPIC, url: 'https://gw.local/v1/messages', reqBody: {}, status: 200, respText: '', ...extra };
}

test('诊断 R1：assistant(text) 结尾触发（商汤案例形态）', () => {
  const findings = core.diagnose(ctxOf({
    reqBody: { model: 'sensenova-6.8', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] },
    status: 400, respText: '{"error":{"message":"inference request is invalid"}}',
  }));
  const f = findings.find((x) => x.id === 'trailing-assistant');
  assert.ok(f, '应触发 trailing-assistant');
  assert.ok(f.detail.includes('商汤'));
  assert.ok(findings.find((x) => x.id === 'generic-invalid'), '400 + 模糊消息应触发 generic-invalid');
});

test('诊断 R1 变体：assistant(tool_use) 结尾不触发', () => {
  const findings = core.diagnose(ctxOf({
    reqBody: { model: 'm', max_tokens: 100, messages: [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'f', input: {} }] },
    ] },
  }));
  assert.ok(!findings.find((x) => x.id === 'trailing-assistant'));
});

test('诊断 R2：孤儿 tool_result', () => {
  const findings = core.diagnose(ctxOf({
    reqBody: { model: 'm', max_tokens: 10, messages: [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'text' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'missing-id', content: 'r' }] },
    ] },
  }));
  const f = findings.find((x) => x.id === 'orphan-tool-result');
  assert.ok(f);
  assert.ok(f.detail.includes('missing-id'));
});

test('诊断 R3：连续同角色 info', () => {
  const findings = core.diagnose(ctxOf({
    reqBody: { model: 'm', max_tokens: 10, messages: [
      { role: 'user', content: 'a' }, { role: 'user', content: 'b' },
    ] },
  }));
  assert.ok(findings.find((x) => x.id === 'same-role-adjacent'));
});

test('诊断 R5：Anthropic 缺 max_tokens', () => {
  const findings = core.diagnose(ctxOf({ reqBody: { model: 'm', messages: [{ role: 'user', content: 'x' }] } }));
  assert.ok(findings.find((x) => x.id === 'max-tokens-missing'));
});

test('诊断 R6：URL /v1 重复', () => {
  const findings = core.diagnose(ctxOf({ url: 'https://gw.local/v1/v1/messages', reqBody: { model: 'm', messages: [] } }));
  assert.ok(findings.find((x) => x.id === 'url-dup-v1'));
});

test('诊断：401 / 404-model / 404-path / 429 / 5xx', () => {
  const c401 = core.diagnose(ctxOf({ status: 401, respText: '{"error":{"message":"Incorrect API key"}}' }));
  assert.ok(c401.find((x) => x.id === 'auth-fail'));
  const c404m = core.diagnose(ctxOf({ status: 404, respText: '{"error":{"message":"model not found"}}', reqBody: { model: 'gpt-x' } }));
  assert.ok(c404m.find((x) => x.id === 'model-not-found'));
  const c404p = core.diagnose(ctxOf({ status: 404, respText: 'not found', reqBody: { model: 'm' } }));
  assert.ok(c404p.find((x) => x.id === 'url-404'));
  const c429 = core.diagnose(ctxOf({ status: 429, respText: 'rate limited' }));
  assert.ok(c429.find((x) => x.id === 'rate-limit'));
  const c5xx = core.diagnose(ctxOf({ status: 503, respText: '' }));
  assert.ok(c5xx.find((x) => x.id === 'upstream-5xx'));
});

test('诊断：400 参数漂移 / max_tokens / 上下文超长', () => {
  const p1 = core.diagnose(ctxOf({
    wire: core.WIRE_OPENAI, status: 400,
    respText: '{"error":{"message":"Unrecognized request argument: reasoning_effort"}}',
    reqBody: { model: 'm', messages: [{ role: 'user', content: 'x' }] },
  }));
  assert.ok(p1.find((x) => x.id === 'param-unsupported'));
  const p2 = core.diagnose(ctxOf({
    wire: core.WIRE_OPENAI, status: 400,
    respText: '{"error":{"message":"This model supports at most 8192 max_tokens"}}',
    reqBody: { model: 'm', messages: [{ role: 'user', content: 'x' }], max_tokens: 99999 },
  }));
  assert.ok(p2.find((x) => x.id === 'max-tokens-400'));
  const p3 = core.diagnose(ctxOf({
    wire: core.WIRE_OPENAI, status: 400,
    respText: '{"error":{"message":"maximum context length is 8192 tokens"}}',
    reqBody: { model: 'm', messages: [{ role: 'user', content: 'x' }] },
  }));
  assert.ok(p3.find((x) => x.id === 'context-overflow'));
});

test('诊断：流式中断 / 流内错误 / usage 缺失 / TTFT 慢', () => {
  const a = core.diagnose(ctxOf({ streamInfo: { chunkCount: 12, ttftMs: 200, finishReason: null, doneMarker: false, sawError: null } }));
  assert.ok(a.find((x) => x.id === 'stream-aborted'));
  const b = core.diagnose(ctxOf({ streamInfo: { chunkCount: 3, ttftMs: 100, finishReason: null, doneMarker: false, sawError: { message: 'quota exceeded' } } }));
  assert.ok(b.find((x) => x.id === 'stream-error-event'));
  const c = core.diagnose(ctxOf({ streamInfo: { chunkCount: 5, ttftMs: 100, finishReason: 'stop', doneMarker: true, sawError: null } }));
  assert.ok(c.find((x) => x.id === 'stream-usage-missing'));
  const d = core.diagnose(ctxOf({ streamInfo: { chunkCount: 5, ttftMs: 12000, finishReason: 'stop', doneMarker: true, sawError: null, usage: { prompt: 1, completion: 1, exact: true } } }));
  assert.ok(d.find((x) => x.id === 'slow-ttft'));
});

test('诊断：全绿时给 all-clear；OpenAI 非 assistant 结尾不误报', () => {
  const ok1 = core.diagnose(ctxOf({ reqBody: { model: 'm', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 } }));
  assert.ok(ok1.find((x) => x.id === 'all-clear'));
  const ok2 = core.diagnose(ctxOf({
    wire: core.WIRE_OPENAI,
    reqBody: { model: 'm', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }] },
  }));
  assert.ok(!ok2.find((x) => x.id === 'trailing-assistant'));
});

test('诊断：请求了 stream 却收到完整 JSON（参数漂移信号）', () => {
  const findings = core.diagnose(ctxOf({
    wire: core.WIRE_OPENAI,
    reqBody: { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true },
    requestedStream: true, respText: '{"choices":[{"message":{"content":"full"}}]}',
  }));
  assert.ok(findings.find((x) => x.id === 'stream-downgraded'));
});

// ── 变异器 ──
test('变异：append-empty-user 只对 assistant 结尾生效且形态正确', () => {
  const mut = core.mutators(core.WIRE_ANTHROPIC).find((m) => m.id === 'append-empty-user');
  const body = { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] };
  const out = mut.apply(body);
  assert.equal(out.messages.length, 3);
  assert.equal(out.messages[2].role, 'user');
  assert.deepEqual(out.messages[2].content, [{ type: 'text', text: '' }]);
  // user 结尾不适用
  const body2 = { model: 'm', messages: [{ role: 'user', content: 'a' }] };
  assert.equal(mut.apply(body2), null);
  // 不改原对象
  assert.equal(body.messages.length, 2);
});

test('变异：drop-trailing-assistant / minimal / halve / standard / lower-max-tokens / no-stream / no-tools', () => {
  const M = core.mutators(core.WIRE_ANTHROPIC);
  const get = (id) => M.find((m) => m.id === id);
  const base = {
    model: 'm', max_tokens: 1024, stream: true, tools: [{ name: 'f', input_schema: {} }],
    thinking: { type: 'adaptive' },
    messages: [
      { role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' }, { role: 'assistant', content: 'a2' },
    ],
  };
  const dropped = get('drop-trailing-assistant').apply(base);
  assert.equal(dropped.messages.length, 3);
  assert.equal(dropped.messages[2].role, 'user');

  const minimal = get('minimal').apply(base);
  assert.equal(minimal.messages.length, 1);
  assert.equal(minimal.messages[0].role, 'user');
  assert.ok(minimal.messages[0].content.length <= 500);

  const halved = get('halve-messages').apply(base);
  assert.equal(halved.messages.length, 2);

  const std = get('standard-fields').apply(base);
  // keep 白名单：model/messages/max_tokens/temperature/top_p/stream 保留，其余（thinking/tools）删除
  assert.ok(!('thinking' in std) && !('tools' in std));
  assert.ok('stream' in std && std.max_tokens === 1024);

  const low = get('lower-max-tokens').apply(base);
  assert.equal(low.max_tokens, 256);

  const noStr = get('no-stream').apply(base);
  assert.ok(!('stream' in noStr));

  const noTools = get('no-tools').apply(base);
  assert.ok(!('tools' in noTools));
});

test('变异：convert-system 双向（Anthropic↔OpenAI）', () => {
  const a = core.mutators(core.WIRE_ANTHROPIC).find((m) => m.id === 'convert-system');
  const outA = a.apply({ model: 'm', system: 'sys', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] });
  assert.ok(!('system' in outA));
  assert.equal(outA.messages[0].role, 'user');
  assert.equal(outA.messages[0].content, 'sys');

  const o = core.mutators(core.WIRE_OPENAI).find((m) => m.id === 'convert-system');
  const outO = o.apply({ model: 'm', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'x' }] });
  assert.equal(outO.system, 'sys');
  assert.equal(outO.messages.length, 1);
  // 无 system 时 null
  assert.equal(o.apply({ model: 'm', messages: [{ role: 'user', content: 'x' }] }), null);
});

test('approxTokens：中英文混合估算为正数', () => {
  assert.ok(core.approxTokens('你好世界') >= 2);
  assert.ok(core.approxTokens('hello world') >= 2);
  assert.equal(core.approxTokens(''), 0);
});
