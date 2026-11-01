/**
 * 离线单测（零依赖零网络）：node test/run-tests.mjs
 * 覆盖：模板插值（未知变量/类型转换）、数据集解析（三形态/注释行/上限/行级容错）、
 *       检查器 7 种（含非法定义拒绝）、字级 diff（前后缀/超限）、聚合统计、
 *       judge 消息构造与容错解析、掩码不变量、结果投影、双协议请求体（temperature/
 *       system 归位/[1m] 后缀/max_completion_tokens 重试判定）、可重试判定。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/matrix-core.js');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── 模板插值 ────────────────────────────────────────────────────────────────
await t('插值：基础替换', () => {
  const r = core.renderTemplate('把 {{text}} 翻译成 {{lang}}', { text: '你好', lang: '英语' });
  assert.strictEqual(r.text, '把 你好 翻译成 英语');
  assert.strictEqual(r.warnings.length, 0);
});
await t('插值：未知变量保留原样并告警', () => {
  const r = core.renderTemplate('hello {{name}} and {{missing}}', { name: 'x' });
  assert.ok(r.text.includes('{{missing}}'));
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('missing'));
});
await t('插值：带空格形态与对象 JSON 化', () => {
  const r = core.renderTemplate('{{ a }}|{{obj}}', { a: 5, obj: { k: 1 } });
  assert.strictEqual(r.text, '5|{"k":1}');
});
await t('插值：null → 空串；数组 JSON 化', () => {
  const r = core.renderTemplate('[{{a}}]{{b}}', { a: null, b: [1, 2] });
  assert.strictEqual(r.text, '[][1,2]');
});
await t('extractVars：去重保序', () => {
  assert.deepStrictEqual(core.extractVars('{{b}} {{a}} {{b}} {{c-d}} {{ e }}'), ['b', 'a', 'c-d', 'e']);
});

// ── 数据集解析 ──────────────────────────────────────────────────────────────
await t('数据集：三形态+注释行+空行', () => {
  const j = [
    '# 注释',
    '',
    '{"vars": {"text": "a"}, "expect": [{"type": "json_valid"}]}',
    '{"text": "b", "lang": "en"}',
    '{"vars": {"x": 1}}',
  ].join('\n');
  const r = core.parseDataset(j);
  assert.strictEqual(r.samples.length, 3);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(r.samples[0].checks.length, 1);
  assert.deepStrictEqual(r.samples[1].vars, { text: 'b', lang: 'en' });
});
await t('数据集：坏行报告不中断', () => {
  const r = core.parseDataset('{"vars":{"a":1}}\nnot json\n{"vars":"bad"}\n{"vars":{"b":2}}');
  assert.strictEqual(r.samples.length, 2);
  assert.strictEqual(r.errors.length, 2);
  assert.strictEqual(r.errors[0].line, 2);
});
await t('数据集：变量超限拒绝该行', () => {
  const big = 'x'.repeat(65 * 1024);
  const r = core.parseDataset(`{"vars":{"big":"${big}"},"vars2":1}`);
  // 该行 vars.big 超限 → 整行拒绝（errors 里报变量超限）
  assert.strictEqual(r.samples.length, 0);
});
await t('数据集：样本数上限截断', () => {
  const lines = Array.from({ length: 260 }, (_, i) => `{"vars":{"i":${i}}}`).join('\n');
  const r = core.parseDataset(lines);
  assert.strictEqual(r.samples.length, core.MAX_SAMPLES);
  assert.ok(r.errors.some((e) => e.msg.includes('截断')));
});
await t('数据集：非法 expect 拒绝该行并报错', () => {
  const r = core.parseDataset('{"vars":{"a":1},"expect":[{"type":"nope"}]}');
  assert.strictEqual(r.samples.length, 0);
  assert.ok(r.errors[0].msg.includes('未知检查器'));
});
await t('数据集：超大文本整体拒绝', () => {
  const r = core.parseDataset('# ' + 'x'.repeat(300 * 1024));
  assert.strictEqual(r.samples.length, 0);
  assert.ok(r.errors[0].msg.includes('上限'));
});
await t('serializeDataset 往返', () => {
  const j = '{"vars":{"a":1},"expect":[{"type":"equals","value":"2"}]}\n{"vars":{"b":2}}\n';
  const r = core.parseDataset(j);
  const s = core.serializeDataset(r.samples);
  const r2 = core.parseDataset(s);
  assert.strictEqual(r2.samples.length, 2);
  assert.deepStrictEqual(r2.samples[0].checks, r.samples[0].checks);
});

// ── 检查器 ──────────────────────────────────────────────────────────────────
await t('检查器：contains 全部命中语义', () => {
  const checks = core.normalizeChecks([{ type: 'contains', value: ['a', 'b'] }]);
  assert.ok(core.runChecks('abc b', checks)[0].pass === true);
  assert.ok(core.runChecks('a only', checks)[0].pass === false);
  assert.ok(core.runChecks('a b c', checks)[0].pass === true);
  assert.ok(core.runChecks('a only', checks)[0].detail.includes('缺少'));
});
await t('检查器：not_contains / equals / 长度', () => {
  const nc = core.normalizeChecks([{ type: 'not_contains', value: '抱歉' }]);
  assert.strictEqual(core.runChecks('好的，结果如下', nc)[0].pass, true);
  assert.strictEqual(core.runChecks('抱歉失败', nc)[0].pass, false);
  const eq = core.normalizeChecks([{ type: 'equals', value: '2' }]);
  assert.strictEqual(core.runChecks(' 2\n', eq)[0].pass, true);
  const mn = core.normalizeChecks([{ type: 'min_length', value: 5 }]);
  assert.strictEqual(core.runChecks('abc', mn)[0].pass, false);
  const mx = core.normalizeChecks([{ type: 'max_length', value: 3 }]);
  assert.strictEqual(core.runChecks('abc', mx)[0].pass, true);
});
await t('检查器：regex 命中与非法模式拒绝', () => {
  const re = core.normalizeChecks([{ type: 'regex', value: '^\\d+$' }]);
  assert.strictEqual(core.runChecks('123', re)[0].pass, true);
  assert.strictEqual(core.runChecks('12a', re)[0].pass, false);
  assert.strictEqual(core.normalizeChecks([{ type: 'regex', value: '[unclosed' }], () => {}), null);
  assert.strictEqual(core.normalizeChecks([{ type: 'regex', value: 'x'.repeat(600) }], () => {}), null);
});
await t('检查器：json_valid 含代码块提取', () => {
  const jv = core.normalizeChecks([{ type: 'json_valid' }]);
  assert.strictEqual(core.runChecks('{"a":1}', jv)[0].pass, true);
  assert.strictEqual(core.runChecks('{"a":}', jv)[0].pass, false);
  const jx = core.normalizeChecks([{ type: 'json_valid', value: { extract: true } }]);
  assert.strictEqual(core.runChecks('答案如下：\n```json\n{"city":"北京"}\n```', jx)[0].pass, true);
});
await t('检查器：检查器异常不炸（pass=false + detail）', () => {
  const out = core.runChecks('x', [{ type: 'regex', value: { pattern: '(a', flags: '' } }]);
  // normalizeChecks 已挡非法模式，这里直接构造绕过归一的场景
  assert.strictEqual(out[0].pass, false);
  assert.ok(out[0].detail.includes('异常'));
});
await t('检查器：关键词数超限拒绝', () => {
  const many = Array.from({ length: 21 }, (_, i) => `k${i}`);
  assert.strictEqual(core.normalizeChecks([{ type: 'contains', value: many }], () => {}), null);
});

// ── 字级 diff ───────────────────────────────────────────────────────────────
await t('diff：相同文本单段', () => {
  const segs = core.textDiff('abc', 'abc');
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].t, 'same');
});
await t('diff：前后缀保留+中段标记', () => {
  const segs = core.textDiff('The quick fox', 'The slow fox');
  // same 段拼接 = 公共前后缀；del/add 段各自成段
  assert.strictEqual(segs.filter((s) => s.t === 'same').map((s) => s.s).join(''), 'The  fox');
  assert.ok(segs.some((s) => s.t === 'del' && s.s === 'quick'));
  assert.ok(segs.some((s) => s.t === 'add' && s.s === 'slow'));
});
await t('diff：纯增/纯删', () => {
  assert.deepStrictEqual(core.textDiff('', 'abc').map((s) => s.t), ['add']);
  assert.deepStrictEqual(core.textDiff('abc', '').map((s) => s.t), ['del']);
});
await t('diff：中文句子', () => {
  const segs = core.textDiff('北京是中国的首都', '北京是中国的重要城市');
  assert.ok(segs.some((s) => s.t === 'add' && s.s.includes('要')));
});
await t('diff：超限截断不炸', () => {
  // 中段 3500 字符 > DIFF_MAX_MID(3000)：截断 + 插省略标注
  const a = 'p' + 'x'.repeat(3500) + 'q';
  const b = 'p' + 'y'.repeat(3500) + 'q';
  const segs = core.textDiff(a, b);
  assert.ok(segs.some((s) => s.s.includes('省略')));
  assert.ok(segs.some((s) => s.t === 'del' && s.s.length === 3000));
  // 首尾公共字符仍在
  assert.strictEqual(segs[0].s, 'p');
  assert.strictEqual(segs[segs.length - 1].s, 'q');
});

// ── 聚合 ────────────────────────────────────────────────────────────────────
await t('聚合：per-variant 成功/检查/judge/耗时', () => {
  const cells = [
    { variantIdx: 0, ok: true, ms: 100, usage: { prompt_tokens: 10, completion_tokens: 20 }, checks: [{ pass: true }], judge: { score: 8 } },
    { variantIdx: 0, ok: true, ms: 300, usage: { prompt_tokens: 12, completion_tokens: 22 }, checks: [{ pass: false }], judge: { score: 6 } },
    { variantIdx: 0, ok: false, ms: 5, error: { code: 'auth' } },
    { variantIdx: 1, ok: true, ms: 200, usage: { prompt_tokens: 5, completion_tokens: 7 }, checks: [{ pass: true }, { pass: true }], judge: { score: 9 } },
  ];
  const agg = core.aggregateRuns(cells, 2);
  assert.strictEqual(agg.totals.cells, 4);
  assert.strictEqual(agg.totals.ok, 3);
  assert.strictEqual(agg.totals.tokIn, 27);
  const v0 = agg.variants[0];
  assert.strictEqual(v0.ok, 2);
  assert.strictEqual(v0.failed, 1);
  assert.strictEqual(v0.checkAllPass, 1);
  assert.strictEqual(v0.avgMs, 200);
  assert.strictEqual(v0.judgeAvg, 7);
  assert.strictEqual(agg.variants[1].judgeAvg, 9);
});

// ── judge ───────────────────────────────────────────────────────────────────
await t('judge：默认消息构造', () => {
  const msgs = core.buildJudgeMessages({ vars: { text: 'hi' }, userTemplate: '翻译 {{text}}', output: '你好' });
  assert.strictEqual(msgs.length, 2);
  assert.ok(msgs[0].content.includes('评测员'));
  assert.ok(msgs[1].content.includes('翻译 {{text}}'.replace('{{text}}', 'hi')) === false);
  assert.ok(msgs[1].content.includes('text = hi'));
  assert.ok(msgs[1].content.includes('你好'));
});
await t('judge：自定义模板插值 {{output}}', () => {
  const msgs = core.buildJudgeMessages({ vars: {}, userTemplate: 'T', output: 'OUT-VAL' }, '给这个输出打分：{{output}}');
  assert.ok(msgs[1].content.includes('OUT-VAL'));
});
await t('judge：输出解析（干净/围栏/前后噪声/非法/clamp）', () => {
  assert.deepStrictEqual(core.parseJudgeOutput('{"score":8,"reason":"不错"}'), { score: 8, reason: '不错' });
  assert.strictEqual(core.parseJudgeOutput('好：```json\n{"score": 9, "reason": "r"}\n```').score, 9);
  assert.strictEqual(core.parseJudgeOutput('前缀噪声 {"score":3,"reason":"x"} 后缀').reason, 'x');
  assert.strictEqual(core.parseJudgeOutput('{"score":"bad"}'), null);
  assert.strictEqual(core.parseJudgeOutput('{"score":99,"reason":"r"}').score, 10);
  assert.strictEqual(core.parseJudgeOutput('{"score":0,"reason":"r"}').score, 1);
  assert.strictEqual(core.parseJudgeOutput('{"score":-2,"reason":"r"}').score, 1);
  assert.strictEqual(core.parseJudgeOutput('{"score":7.4,"reason":"r"}').score, 7);
  assert.strictEqual(core.parseJudgeOutput('no json at all'), null);
});
await t('judge：解析容忍字符串内花括号', () => {
  const r = core.parseJudgeOutput('{"score":5,"reason":"输出含 { 和 } 符号"}');
  assert.strictEqual(r.score, 5);
  assert.ok(r.reason.includes('}'));
});

// ── 掩码与投影 ──────────────────────────────────────────────────────────────
await t('掩码不变量', () => {
  assert.strictEqual(core.maskKey('sk-1234567890abcdef'), '****cdef');
  assert.strictEqual(core.maskKey('abc'), '****');
  assert.strictEqual(core.maskKey('${MY_KEY}'), 'env:MY_KEY');
  assert.strictEqual(core.maskKey(''), '');
});
await t('投影：超长截断+错误 hint 截断', () => {
  const c = { cellId: 'r0c0', ok: true, content: 'x'.repeat(2000), error: null };
  const p = core.makeCellProjection(c);
  assert.ok(p.content.length <= core.CELL_PROJECT_BYTES);
  assert.strictEqual(p.truncated, true);
  const c2 = { cellId: 'r0c1', ok: false, content: '', error: { code: 'x', cn: 'x', hint: 'h'.repeat(500) } };
  const p2 = core.makeCellProjection(c2);
  assert.ok(p2.error.hint.length <= 200);
});

// ── 双协议请求体 ────────────────────────────────────────────────────────────
const openaiProfile = { baseUrl: 'https://api.x.com/v1', apiKey: 'sk-k', model: 'm1', wire: 'openai-chat-completions' };
const anthropicProfile = { baseUrl: 'https://api.x.com', apiKey: 'ak-k', model: 'm2', wire: 'anthropic-messages' };
await t('请求体：openai 直透 messages+temperature', () => {
  const b = core.chatBody(openaiProfile, { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }], maxTokens: 500, temperature: 0.7 });
  assert.strictEqual(b.model, 'm1');
  assert.deepStrictEqual(b.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
  assert.strictEqual(b.temperature, 0.7);
  assert.strictEqual(b.max_tokens, 500);
});
await t('请求体：anthropic system 归位', () => {
  const b = core.chatBody(anthropicProfile, { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }], maxTokens: 300 });
  assert.strictEqual(b.system, 'S');
  assert.deepStrictEqual(b.messages, [{ role: 'user', content: 'U' }]);
  assert.strictEqual(b.max_tokens, 300);
  assert.strictEqual(b.temperature, undefined);
});
await t('请求体：temperature clamp 与缺省', () => {
  assert.strictEqual(core.chatBody(openaiProfile, { prompt: 'x', temperature: 5 }).temperature, 2);
  assert.strictEqual(core.chatBody(openaiProfile, { prompt: 'x' }).temperature, undefined);
  assert.strictEqual(core.chatBody(openaiProfile, { prompt: 'x', maxTokens: 999999 }).max_tokens, 32768);
});
await t('模型名 [1m] 后缀剥离 + anthropic beta 头', () => {
  const p = { ...anthropicProfile, model: 'claude-4[1m]' };
  const h = core.buildHeaders(p);
  assert.strictEqual(core.upstreamModel(p), 'claude-4');
  assert.ok(h['anthropic-beta'].includes('context-1m'));
  const urls = core.resolveUrls(p.baseUrl, 'anthropic-messages');
  assert.ok(core.chatUrlOf(p, urls).includes('beta=true'));
});
await t('URL 归一：裸域/带版本/# 逃生舱', () => {
  assert.strictEqual(core.resolveUrls('https://a.com', 'openai-chat-completions').chat, 'https://a.com/v1/chat/completions');
  assert.strictEqual(core.resolveUrls('https://a.com/v1', 'openai-chat-completions').chat, 'https://a.com/v1/chat/completions');
  assert.strictEqual(core.resolveUrls('https://a.com/api/chat#', 'openai-chat-completions').chat, 'https://a.com/api/chat');
  assert.strictEqual(core.resolveUrls('https://a.com', 'anthropic-messages').chat, 'https://a.com/v1/messages');
  assert.throws(() => core.resolveUrls('  ', 'openai-chat-completions'));
});
await t('max_completion_tokens 重试判定', () => {
  assert.strictEqual(core.maxTokensRetryHint('Unsupported parameter: max_tokens. Use max_completion_tokens instead.'), true);
  assert.strictEqual(core.maxTokensRetryHint('other error'), false);
});
await t('可重试判定', () => {
  assert.strictEqual(core.isRetryable({ ok: false, error: { code: 'rate_limit' } }), true);
  assert.strictEqual(core.isRetryable({ ok: false, error: { code: 'server' } }), true);
  assert.strictEqual(core.isRetryable({ ok: false, error: { code: 'timeout' } }), true);
  assert.strictEqual(core.isRetryable({ ok: false, error: { code: 'auth' } }), false);
  assert.strictEqual(core.isRetryable({ ok: false, error: { code: 'bad_request' } }), false);
  assert.strictEqual(core.isRetryable({ ok: true }), false);
});
await t('HTTP 错误分类', () => {
  assert.strictEqual(core.classifyHttp(401, '{}').code, 'auth');
  assert.strictEqual(core.classifyHttp(429, '{"error":{"message":"Too many requests"}}').code, 'rate_limit');
  assert.strictEqual(core.classifyHttp(503, '').code, 'server');
  assert.strictEqual(core.classifyHttp(400, '{"error":{"message":"model not found"}}').code, 'bad_request');
});

// ── chatOnce：mock fetch 端到端 ─────────────────────────────────────────────
await t('chatOnce：成功路径（openai）', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, body: null, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ choices: [{ message: { content: 'HELLO' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) };
  };
  const r = await core.chatOnce(openaiProfile, { prompt: 'P', maxTokens: 50, temperature: 0.5, timeoutMs: 5000, fetchImpl });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'HELLO');
  assert.strictEqual(r.usage.completion_tokens, 2);
  assert.ok(calls[0].url.includes('/v1/chat/completions'));
  assert.strictEqual(calls[0].body.temperature, 0.5);
});
await t('chatOnce：max_tokens 400 自动改写重试', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) {
      return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Unsupported parameter: max_tokens. Use max_completion_tokens instead.' } }), body: null, headers: { get: () => '' }, clone() { return this; } };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), body: null, headers: { get: () => 'application/json' } };
  };
  const r = await core.chatOnce(openaiProfile, { prompt: 'P', maxTokens: 16, timeoutMs: 5000, fetchImpl });
  assert.strictEqual(n, 2);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.retried, true);
});
await t('chatOnce：401 分类与 200 非 JSON', async () => {
  const fetch401 = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"bad key"}}', body: null, headers: { get: () => 'application/json' } });
  const r1 = await core.chatOnce(openaiProfile, { prompt: 'P', timeoutMs: 5000, fetchImpl: fetch401 });
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.error.code, 'auth');
  const fetchHtml = async () => ({ ok: true, status: 200, text: async () => '<html>login</html>', body: null, headers: { get: () => 'text/html' } });
  const r2 = await core.chatOnce(openaiProfile, { prompt: 'P', timeoutMs: 5000, fetchImpl: fetchHtml });
  assert.strictEqual(r2.error.code, 'schema');
});
await t('chatOnce：anthropic 成功路径', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ type: 'message', content: [{ type: 'text', text: 'BONJOUR' }], stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 3 } }), body: null, headers: { get: () => 'application/json' } };
  };
  const r = await core.chatOnce(anthropicProfile, { prompt: 'salut', maxTokens: 40, timeoutMs: 5000, fetchImpl });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'BONJOUR');
  assert.ok(seen[0].url.includes('/v1/messages'));
  assert.strictEqual(seen[0].body.system, undefined);
  assert.strictEqual(seen[0].body.max_tokens, 40);
});
await t('chatOnce：网络异常分类（ECONNREFUSED）', async () => {
  const fetchImpl = async () => { const e = new Error('connect ECONNREFUSED'); e.code = 'ECONNREFUSED'; throw e; };
  const r = await core.chatOnce(openaiProfile, { prompt: 'P', timeoutMs: 5000, fetchImpl });
  assert.strictEqual(r.error.code, 'refused');
});
await t('chatOnce：外部中止立即取消', async () => {
  const ac = new AbortController();
  ac.abort();
  const fetchImpl = async () => { throw new Error('should not be called'); };
  const r = await core.chatOnce(openaiProfile, { prompt: 'P', timeoutMs: 5000, fetchImpl, signal: ac.signal });
  assert.strictEqual(r.error.code, 'cancelled');
});

// ── 汇总 ────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
