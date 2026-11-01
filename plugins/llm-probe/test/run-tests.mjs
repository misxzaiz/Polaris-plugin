/**
 * 离线单测（零依赖零网络）：node test/run-tests.mjs
 * 覆盖：URL 归一矩阵、双协议 SSE 解析（跨块/中断/usage/工具块）、
 *       错误分类映射、健康分与档位、掩码不变量、buildPrompt 规模、分位数。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/probe-core.js');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── URL 归一 ────────────────────────────────────────────────────────────────
await t('URL：裸域自动补 /v1（openai）', () => {
  const u = core.resolveUrls('https://api.deepseek.com', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'https://api.deepseek.com/v1/chat/completions');
  assert.strictEqual(u.models, 'https://api.deepseek.com/v1/models');
});
await t('URL：带 /v1 直接拼（openai）', () => {
  const u = core.resolveUrls('https://api.openai.com/v1', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(u.models, 'https://api.openai.com/v1/models');
});
await t('URL：尾部斜杠裁剪', () => {
  const u = core.resolveUrls('https://x.com/v1/', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'https://x.com/v1/chat/completions');
});
await t('URL：已是完整终点不重复拼', () => {
  const u = core.resolveUrls('https://x.com/v1/chat/completions', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'https://x.com/v1/chat/completions');
});
await t('URL：网关路径含 openai 段', () => {
  const u = core.resolveUrls('https://gate.example.com/openai', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'https://gate.example.com/openai/chat/completions');
});
await t('URL：# 逃生舱逐字使用', () => {
  const u = core.resolveUrls('https://x.com/weird/path/chat#', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'https://x.com/weird/path/chat');
});
await t('URL：anthropic 裸域补 /v1/messages', () => {
  const u = core.resolveUrls('https://api.anthropic.com', 'anthropic-messages');
  assert.strictEqual(u.chat, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(u.models, 'https://api.anthropic.com/v1/models');
});
await t('URL：anthropic 带 /v1 直接拼 /messages', () => {
  const u = core.resolveUrls('https://proxy.lan/anthropic/v1', 'anthropic-messages');
  assert.strictEqual(u.chat, 'https://proxy.lan/anthropic/v1/messages');
});
await t('URL：空串报错', () => {
  assert.throws(() => core.resolveUrls('  ', 'openai-chat-completions'));
});
await t('URL：1155 本地端点带端口', () => {
  const u = core.resolveUrls('http://127.0.0.1:11434', 'openai-chat-completions');
  assert.strictEqual(u.chat, 'http://127.0.0.1:11434/v1/chat/completions');
});

// ── 掩码不变量 ──────────────────────────────────────────────────────────────
await t('掩码：长 key 只露后4', () => {
  const m = core.maskKey('sk-1234567890abcdef');
  assert.strictEqual(m, '****cdef');
  assert.ok(!m.includes('1234567890'));
});
await t('掩码：短 key 全星', () => {
  assert.strictEqual(core.maskKey('abc'), '****');
  assert.strictEqual(core.maskKey('ab'), '****');
});
await t('掩码：env 引用形态', () => {
  assert.strictEqual(core.maskKey('${DEEPSEEK_KEY}'), 'env:DEEPSEEK_KEY');
});
await t('掩码：空值空串', () => {
  assert.strictEqual(core.maskKey(''), '');
  assert.strictEqual(core.maskKey(null), '');
});

// ── OpenAI SSE 解析 ─────────────────────────────────────────────────────────
function feedAll(parser, chunks) {
  const events = [];
  for (const c of chunks) parser.feed(c, (e) => events.push(e));
  return events;
}
await t('OpenAI SSE：跨块断行 + [DONE]', () => {
  const p = core.openaiStreamParser();
  const ev = feedAll(p, [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"choices":[{"delta":{"content":"你"}}]}',
    '\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
  ]);
  const deltas = ev.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  assert.strictEqual(deltas, '你好');
  assert.ok(ev.some((e) => e.type === 'finish' && e.reason === 'stop'));
  const usage = ev.find((e) => e.type === 'usage');
  assert.strictEqual(usage.usage.completion_tokens, 2);
  assert.ok(ev.some((e) => e.type === 'done'));
});
await t('OpenAI SSE：注释行与空行忽略、坏 JSON 记 warn', () => {
  const p = core.openaiStreamParser();
  const ev = feedAll(p, ': keep-alive\ndata: {bad json}\ndata: {"choices":[{"delta":{"content":"A"}}]}\n\n');
  assert.ok(ev.some((e) => e.type === 'parse_warn'));
  assert.ok(ev.some((e) => e.type === 'delta' && e.text === 'A'));
});
await t('OpenAI SSE：tool_calls 增量', () => {
  const p = core.openaiStreamParser();
  const ev = feedAll(p, 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"get_weather","arguments":"{\\"ci"}}]}}]}\n\n');
  assert.ok(ev.some((e) => e.type === 'tool'));
});
await t('OpenAI SSE：reasoning_content 不计入文本', () => {
  const p = core.openaiStreamParser();
  const ev = feedAll(p, 'data: {"choices":[{"delta":{"reasoning_content":"思考..."}}]}\n\ndata: {"choices":[{"delta":{"content":"答"}}]}\n\n');
  assert.ok(ev.some((e) => e.type === 'reasoning'));
  const deltas = ev.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  assert.strictEqual(deltas, '答');
});

// ── Anthropic SSE 解析 ──────────────────────────────────────────────────────
await t('Anthropic SSE：事件对解析 + usage 双向', () => {
  const p = core.anthropicStreamParser();
  const ev = feedAll(p, [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
    'event: ping\ndata: {"type":"ping"}\n\n',
    'event: content_block_delta',
    '\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"!"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
  ]);
  const deltas = ev.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  assert.strictEqual(deltas, 'Hi!');
  assert.ok(ev.some((e) => e.type === 'usage_in' && e.n === 12));
  assert.ok(ev.some((e) => e.type === 'usage_out' && e.n === 3));
  assert.ok(ev.some((e) => e.type === 'finish' && e.reason === 'end_turn'));
  assert.ok(ev.some((e) => e.type === 'done'));
});
await t('Anthropic SSE：tool_use 块', () => {
  const p = core.anthropicStreamParser();
  const ev = feedAll(p, 'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"tool_use","name":"get_weather"}}\n\n');
  assert.ok(ev.some((e) => e.type === 'tool'));
});
await t('Anthropic SSE：流中 error 事件', () => {
  const p = core.anthropicStreamParser();
  const ev = feedAll(p, 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n');
  assert.ok(ev.some((e) => e.type === 'error' && /Overloaded/.test(e.msg)));
});

// ── 错误分类 ────────────────────────────────────────────────────────────────
await t('网络错误：DNS/拒绝/证书/超时/重置', () => {
  assert.strictEqual(core.classifyNetworkErr({ code: 'ENOTFOUND' }).code, 'dns');
  assert.strictEqual(core.classifyNetworkErr({ code: 'ECONNREFUSED' }).code, 'refused');
  assert.ok(/TLS 证书/.test(core.classifyNetworkErr({ code: 'CERT_HAS_EXPIRED' }).cn));
  assert.strictEqual(core.classifyNetworkErr({ code: 'ETIMEDOUT' }).code, 'timeout');
  assert.strictEqual(core.classifyNetworkErr({ code: 'ECONNRESET' }).code, 'reset');
  assert.strictEqual(core.classifyNetworkErr(new Error('AbortError: This operation was aborted')).code, 'timeout');
});
await t('HTTP 分类：401/404/429/5xx + 上游消息抽取', () => {
  const a = core.classifyHttp(401, '{"error":{"message":"Incorrect API key","type":"authentication_error"}}');
  assert.strictEqual(a.code, 'auth');
  assert.ok(/Incorrect API key/.test(a.upstream));
  assert.strictEqual(core.classifyHttp(404, '{"error":{"message":"model not found"}}').code, 'not_found');
  assert.strictEqual(core.classifyHttp(429, '{"error":{"message":"rate limited"}}').code, 'rate_limit');
  assert.strictEqual(core.classifyHttp(503, 'upstream exploded').code, 'server');
});
await t('HTTP 分类：401 中文诊断含修复指引', () => {
  const a = core.classifyHttp(401, '{}');
  assert.ok(/apiKey/.test(a.hint));
});

// ── max_tokens 兼容探测 ─────────────────────────────────────────────────────
await t('maxTokensRetryHint：识别 max_completion_tokens 提示', () => {
  assert.ok(core.maxTokensRetryHint('', 'Unsupported parameter: max_tokens. Use max_completion_tokens instead.'));
  assert.ok(!core.maxTokensRetryHint('', 'model not found'));
});

// ── 健康分 ──────────────────────────────────────────────────────────────────
await t('健康分：全绿≈满分且 TTFT/TPS 越快越高', () => {
  const good = core.computeScore({
    connect: { ok: true }, chat: { ok: true },
    models: { ok: true, hasTarget: true },
    stream: { ok: true, ttftMs: 300, tps: 80 },
    tools: { ok: true, toolCalled: true },
  });
  assert.ok(good.total >= 95, `expect >=95 got ${good.total}`);
  const slow = core.computeScore({
    connect: { ok: true }, chat: { ok: true },
    models: { ok: true, hasTarget: true },
    stream: { ok: true, ttftMs: 3800, tps: 3 },
    tools: { ok: true, toolCalled: true },
  });
  assert.ok(slow.total < good.total - 8, `slow ${slow.total} should be much less than good ${good.total}`);
});
await t('健康分：401 时 auth=0 但 404 时 auth=15', () => {
  const auth = core.computeScore({ connect: { ok: true }, chat: { ok: false, error: { code: 'auth' } } });
  assert.strictEqual(auth.components.auth, 0);
  const nf = core.computeScore({ connect: { ok: true }, chat: { ok: false, error: { code: 'not_found' } } });
  assert.strictEqual(nf.components.auth, 15);
  assert.strictEqual(nf.components.chat, 0);
});
await t('健康分：模型表在列 10 分/不在列 6 分', () => {
  const a = core.computeScore({ connect: { ok: true }, chat: { ok: true }, models: { ok: true, hasTarget: true } });
  const b = core.computeScore({ connect: { ok: true }, chat: { ok: true }, models: { ok: true, hasTarget: false } });
  assert.strictEqual(a.components.models, 10);
  assert.strictEqual(b.components.models, 6);
});
await t('健康分：工具未触发 7 分（半credit）', () => {
  const s = core.computeScore({ connect: { ok: true }, chat: { ok: true }, tools: { ok: true, toolCalled: false } });
  assert.strictEqual(s.components.tools, 7);
});
await t('档位：85/60 分界', () => {
  assert.strictEqual(core.verdictOf(90).cn, '健康');
  assert.strictEqual(core.verdictOf(70).cn, '亚健康');
  assert.strictEqual(core.verdictOf(30).cn, '异常');
});

// ── buildPrompt / 分位数 ────────────────────────────────────────────────────
await t('健康分上限：极快 TTFT/TPS 不得超 100', () => {
  const s = core.computeScore({
    connect: { ok: true }, chat: { ok: true },
    models: { ok: true, hasTarget: true },
    stream: { ok: true, ttftMs: 100, tps: 999 },
    tools: { ok: true, toolCalled: true },
  });
  assert.ok(s.total <= 100 && s.total >= 99, `total=${s.total}`);
  assert.strictEqual(s.components.stream, 25);
});
await t('buildPrompt：规模单调递增且含指令尾', () => {
  const s = core.buildPrompt(64).length;
  const m = core.buildPrompt(512).length;
  const l = core.buildPrompt(2048).length;
  assert.ok(s < m && m < l);
  assert.ok(core.buildPrompt(512).includes('OK'));
  assert.ok(l > 2048, `2048 tok prompt 应明显长：${l}`);
});
await t('percentile：P50/P100 边界', () => {
  assert.strictEqual(core.percentile([1, 2, 3, 4], 50), 2);
  assert.strictEqual(core.percentile([5], 50), 5);
  assert.strictEqual(core.percentile([], 50), null);
});

// ── 工具 payload 双协议 ─────────────────────────────────────────────────────
await t('toolsPayload：anthropic 用 input_schema / openai 用 function.parameters', () => {
  const a = core.toolsPayload('anthropic-messages');
  assert.strictEqual(a[0].name, 'get_weather');
  assert.ok(a[0].input_schema);
  const o = core.toolsPayload('openai');
  assert.strictEqual(o[0].type, 'function');
  assert.ok(o[0].function.parameters);
});

// ── CLI 后缀剥离（对齐宿主 strip_cli_model_suffix）──────────────────────────
await t('后缀：[1m] 剥离 + anthropic beta 头 + query', () => {
  const s = core.stripCliModelSuffix('deepseek-flash[1m]');
  assert.strictEqual(s.base, 'deepseek-flash');
  assert.ok(/context-1m-2025-08-07/.test(s.beta));
  assert.strictEqual(s.query, 'beta=true');
  const h = core.buildHeaders({ wire: 'anthropic-messages', apiKey: 'k', model: 'glm-5.2[1m]' });
  assert.ok(h['anthropic-beta']);
  assert.strictEqual(core.upstreamModel({ model: 'deepseek-flash[1m]' }), 'deepseek-flash');
});
await t('后缀：数值窗口后缀无 beta / 未知后缀静默剥离', () => {
  const a = core.stripCliModelSuffix('claude-4[200k]');
  assert.strictEqual(a.base, 'claude-4');
  assert.strictEqual(a.beta, null);
  assert.strictEqual(core.stripCliModelSuffix('gpt-4o[thinking]').base, 'gpt-4o');
  assert.strictEqual(core.stripCliModelSuffix('deepseek-v3').base, 'deepseek-v3');
  assert.strictEqual(core.stripCliModelSuffix('[1m]').base, '[1m]'); // 畸形输入保守原样
});
await t('后缀：chatBody 发纯模型名', () => {
  const b = core.chatBody({ model: 'deepseek-flash[1m]', wire: 'openai-chat-completions' }, {});
  assert.strictEqual(b.model, 'deepseek-flash');
});
await t('后缀：anthropic 1m 追加 ?beta=true（chatUrlOf）', () => {
  const urls = { chat: 'https://x.com/v1/messages', models: 'https://x.com/v1/models' };
  assert.strictEqual(core.chatUrlOf({ wire: 'anthropic-messages', model: 'm[1m]' }, urls), 'https://x.com/v1/messages?beta=true');
  assert.strictEqual(core.chatUrlOf({ wire: 'anthropic-messages', model: 'm[200k]' }, urls), 'https://x.com/v1/messages');
  assert.strictEqual(core.chatUrlOf({ wire: 'openai-chat-completions', model: 'm[1m]' }, urls), 'https://x.com/v1/messages');
});

console.log(`\n==== 离线单测：${results.filter((r) => r.pass).length}/${results.length} 通过 ====`);
for (const r of results.filter((x) => !x.pass)) console.log(`  ✗ ${r.name}\n    ${r.detail}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
