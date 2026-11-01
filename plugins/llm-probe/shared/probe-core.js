'use strict';
/**
 * probe-core.js —— LLM 接口探针核心（零依赖，service 与测试共用）
 *
 * 职责（纯逻辑层，网络经注入的 fetchImpl，可离线全测）：
 *   1. URL 归一：baseUrl → chat/models 终点（`#` 逃生舱 = 逐字使用）
 *   2. 双 wire API 请求构造：openai-chat-completions（Bearer）/
 *      anthropic-messages（x-api-key + anthropic-version）
 *   3. SSE 状态机解析：OpenAI `data:` 行 + [DONE]；Anthropic event/data 事件流
 *   4. 错误分类：网络层（DNS/拒绝/证书/超时）+ HTTP 层（401/404/429/5xx/schema）
 *      → 每类给中文诊断与可行动建议
 *   5. 健康分 0-100：连通15/鉴权15/模型表10/对话20/流式25/工具15
 *
 * 安全不变量：本文件任何输出不得包含完整 apiKey（掩码函数见 maskKey）。
 */

const VERSION = '0.1.0';

// ── 掩码（与宿主 mask_value 同形态）─────────────────────────────────────────
function maskKey(key) {
  const s = String(key || '');
  if (!s) return '';
  const m = s.match(/^\$\{([^}]+)\}$/);
  if (m) return `env:${m[1]}`;
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

// ── URL 归一 ────────────────────────────────────────────────────────────────
/**
 * baseUrl → { chat, models, note }
 * 规则：
 *  - `#` 结尾 = 逃生舱：去掉 `#` 后逐字作为 chat 终点（models 同目录 /models）；
 *  - 常见 OpenAI 风格：.../v1 或含版本段 → 拼 /chat/completions；裸域补 /v1；
 *  - Anthropic 风格：拼 /v1/messages（含 /v1 则直接拼 /messages）；
 *  - 已带终点后缀（/chat/completions、/messages）则不重复拼。
 */
function resolveUrls(baseUrl, wire) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('baseUrl 为空');
  if (raw.endsWith('#')) {
    const chat = raw.slice(0, -1);
    const m = chat.match(/^(https?:\/\/[^/]+)/);
    const modelsBase = m ? m[1] : '';
    return {
      chat,
      models: wire === 'anthropic-messages' ? `${modelsBase}/v1/models` : `${modelsBase}/models`,
      note: '逐字模式（baseUrl 以 # 结尾）',
    };
  }
  const hasVersion = /\/(v1|v1beta|v2|openai|api|anthropic|compatible\/v1)(\/|$)/.test(raw);
  const endsChat = /\/(chat\/completions|messages|completions)$/.test(raw);
  if (wire === 'anthropic-messages') {
    const chat = endsChat ? raw : raw + (hasVersion ? '/messages' : '/v1/messages');
    const models = hasVersion ? raw.replace(/\/messages$/, '') + '/models'
      : raw + '/v1/models';
    return { chat, models, note: hasVersion ? '含版本段，直接拼接' : '裸域自动补 /v1' };
  }
  // openai-chat-completions
  const chat = endsChat ? raw : raw + (hasVersion ? '/chat/completions' : '/v1/chat/completions');
  const modelsRoot = raw.replace(/\/(chat\/)?completions$/, '');
  const models = hasVersion
    ? (raw.includes('/models') ? modelsRoot : modelsRoot + '/models')
    : raw + '/v1/models';
  return { chat, models, note: hasVersion ? '含版本段，直接拼接' : '裸域自动补 /v1' };
}

// ── 请求头/体构造 ───────────────────────────────────────────────────────────
/**
 * 剥离模型名中的 CLI 私有后缀（对齐宿主 simple_ai_protocol.rs strip_cli_model_suffix）：
 *   - `deepseek-flash[1m]` → base=`deepseek-flash`；Anthropic 线路需注 beta 头 + ?beta=true
 *   - `claude-4[200k]` → base=`claude-4`（仅窗口信号，无 beta）
 *   - `glm-5.2[thinking]` → base=`glm-5.2`（未知后缀静默剥离）
 * 宿主发上游用的是纯模型名——探针若不剥离会对宿主档案系统性误报。
 */
function stripCliModelSuffix(model) {
  const s = String(model || '');
  const i = s.indexOf('[');
  if (i < 0) return { base: s, beta: null, query: null };
  const base = s.slice(0, i).trimEnd();
  if (!base) return { base: s, beta: null, query: null };
  const suffix = s.slice(i + 1).replace(/\]+$/, '');
  const isOneM = suffix === '1m' || suffix === '1M';
  return {
    base,
    beta: isOneM ? 'claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14' : null,
    query: isOneM ? 'beta=true' : null,
  };
}

function buildHeaders(profile) {
  const h = { 'Content-Type': 'application/json' };
  if (profile.wire === 'anthropic-messages') {
    h['x-api-key'] = profile.apiKey;
    h['anthropic-version'] = profile.anthropicVersion || '2023-06-01';
    const sfx = stripCliModelSuffix(profile.model);
    if (sfx.beta) h['anthropic-beta'] = sfx.beta;
  } else {
    h['Authorization'] = `Bearer ${profile.apiKey}`;
  }
  return h;
}

/** profile 请求应使用的纯模型名（后缀已剥） */
function upstreamModel(profile) {
  return stripCliModelSuffix(profile.model).base || profile.model;
}


/** chat 终点（Anthropic 1m 后缀需追加 ?beta=true，对齐宿主 URL 构造） */
function chatUrlOf(profile, urls) {
  const sfx = stripCliModelSuffix(profile.model);
  if (profile.wire === 'anthropic-messages' && sfx.query && !urls.chat.includes('?')) {
    return `${urls.chat}?${sfx.query}`;
  }
  return urls.chat;
}

function chatBody(profile, opts) {
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic' : 'openai';
  const maxTokens = opts.maxTokens != null ? opts.maxTokens : 16;
  const userMsg = typeof opts.prompt === 'string' ? opts.prompt : 'Reply with exactly: OK';
  if (wire === 'anthropic') {
    const body = { model: upstreamModel(profile), max_tokens: maxTokens, messages: [{ role: 'user', content: userMsg }] };
    if (opts.stream) body.stream = true;
    if (opts.tools) body.tools = opts.tools;
    return body;
  }
  const body = { model: upstreamModel(profile), max_tokens: maxTokens, messages: [{ role: 'user', content: userMsg }] };
  if (opts.stream) {
    body.stream = true;
    if (opts.includeUsage) body.stream_options = { include_usage: true };
  }
  if (opts.tools) {
    body.tools = opts.tools;
    if (!opts.noToolChoice) body.tool_choice = 'auto';
  }
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  return body;
}

/** max_tokens 兼容：部分新端点（o 系等）拒收 max_tokens，要求 max_completion_tokens */
function maxTokensRetryHint(statusText, bodyText) {
  const t = `${statusText || ''}\n${bodyText || ''}`;
  return /max_completion_tokens/i.test(t) && /max_tokens/i.test(t) && /deprecat|unsupported|use |instead/i.test(t);
}

// ── 错误分类 ────────────────────────────────────────────────────────────────
function classifyNetworkErr(err) {
  const msg = String((err && (err.message || err.cause && err.cause.message)) || err || '');
  const code = String((err && (err.code || err.cause && err.cause.code)) || '');
  if (/ENOTFOUND|EAI_AGAIN/i.test(code + msg)) {
    return { code: 'dns', cn: '域名解析失败', hint: '检查 baseUrl 拼写与 DNS（本地 hosts/代理分流也可能劫持解析）' };
  }
  if (/ECONNREFUSED|bad port/i.test(code + msg)) {
    return { code: 'refused', cn: '连接被拒绝（端口未开）', hint: '服务未启动或只监听 127.0.0.1：本地模型需设置 OLLAMA_HOST=0.0.0.0 才能被其他设备访问；确认端口正确（保留端口如 9 会被内核直接拒绝）' };
  }
  if (/CERT|SSL|TLS|DEPTH_ZERO|SELF_SIGNED/i.test(code + msg)) {
    return { code: 'tls', cn: 'TLS 证书错误', hint: '自签名/过期证书；内网网关常见，需在系统信任该证书' };
  }
  if (/ECONNRESET|EPIPE/i.test(code + msg)) {
    return { code: 'reset', cn: '连接被重置', hint: '网络中断或代理/防火墙掐断；网关可能不支持该请求' };
  }
  if (/ETIMEDOUT|ECONNABORTED|AbortError|TIMEOUT/i.test(code + msg)) {
    return { code: 'timeout', cn: '连接/响应超时', hint: '端点无响应：检查端口转发、代理链路与上游负载' };
  }
  if (/407/i.test(code)) return { code: 'proxy', cn: '代理需要认证', hint: '本机代理要求认证' };
  return { code: 'network', cn: '网络错误', hint: msg.slice(0, 160) };
}

/** HTTP 状态 + 响应体 → 分类诊断 */
function classifyHttp(status, bodyText, wire) {
  const short = String(bodyText || '').slice(0, 400);
  let upstream = '';
  try {
    const j = JSON.parse(short || '{}');
    upstream = String((j.error && (j.error.message || j.error.type)) || j.message || j.detail || '');
  } catch (_) { upstream = short.slice(0, 160); }
  if (status === 401 || status === 403) {
    return { code: status === 401 ? 'auth' : 'forbidden', cn: '鉴权失败（密钥无效或无权限）', hint: '检查 apiKey 是否正确/过期/额度用尽；上游 detail：' + upstream.slice(0, 120), upstream };
  }
  if (status === 404) {
    return { code: 'not_found', cn: '404 路径或模型不存在', hint: `检查 baseUrl 拼接（本探针解析后的终点见报告）与模型名拼写（区分 tag/版本号）${upstream ? '；上游：' + upstream.slice(0, 120) : ''}`, upstream };
  }
  if (status === 429) {
    return { code: 'rate_limit', cn: '限流（429）', hint: 'key 触发上游速率/并发/额度限制，稍后重试或降低频率' + (upstream ? '；' + upstream.slice(0, 120) : ''), upstream };
  }
  if (status === 400) {
    return { code: 'bad_request', cn: '400 请求被拒', hint: '多为参数不兼容（模型名/wire 协议不符/参数不支持）；上游：' + upstream.slice(0, 160), upstream };
  }
  if (status === 402 || status === 403 === false && status === 402) {
    return { code: 'payment', cn: '402 需要付费', hint: '账户余额/配额不足', upstream };
  }
  if (status >= 500) {
    return { code: 'server', cn: `上游服务错误（${status}）`, hint: '供应商侧故障/过载，非本机问题' + (upstream ? '；' + upstream.slice(0, 120) : ''), upstream };
  }
  return { code: 'http_other', cn: `HTTP ${status}`, hint: upstream.slice(0, 160), upstream };
}

// ── SSE 状态机（有状态，按块 feed）──────────────────────────────────────────
/** 通用行切分器：跨块缓冲，产出完整行 */
function lineFeeder() {
  let buf = '';
  return {
    feed(text, onLine) {
      buf += text;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        onLine(line);
      }
    },
    flush(onLine) { if (buf) { onLine(buf.replace(/\r$/, '')); buf = ''; } },
  };
}

/**
 * OpenAI 流解析：data: {json} 行；data: [DONE] 结束。
 * 产出事件：{type:'delta', text} | {type:'tool'} | {type:'usage', usage} |
 *          {type:'finish', reason} | {type:'done'} | {type:'parse_warn', detail}
 */
function openaiStreamParser() {
  const f = lineFeeder();
  return {
    feed(text, emit) {
      f.feed(text, (line) => {
        const s = line.trim();
        if (!s || s.startsWith(':')) return;
        if (!s.startsWith('data:')) return;
        const data = s.slice(5).trim();
        if (data === '[DONE]') { emit({ type: 'done' }); return; }
        let j;
        try { j = JSON.parse(data); } catch (e) { emit({ type: 'parse_warn', detail: `chunk JSON 解析失败：${String(e.message).slice(0, 60)}` }); return; }
        if (j && j.usage) emit({ type: 'usage', usage: j.usage });
        const ch = j && Array.isArray(j.choices) ? j.choices[0] : null;
        if (!ch) return;
        const d = ch.delta || {};
        if (typeof d.content === 'string' && d.content.length) emit({ type: 'delta', text: d.content });
        if (Array.isArray(d.tool_calls) && d.tool_calls.length) emit({ type: 'tool' });
        if (d.reasoning_content != null || (d.reasoning && d.reasoning != null)) emit({ type: 'reasoning' });
        if (ch.finish_reason) emit({ type: 'finish', reason: ch.finish_reason });
      });
    },
    flush(emit) { f.flush((line) => this.feed(line + '\n', emit)); },
  };
}

/**
 * Anthropic 流解析：event:/data: 事件对。
 * 产出：{type:'delta', text} | {type:'usage_in', n} | {type:'usage_out', n} |
 *      {type:'finish', reason} | {type:'done'} | {type:'tool'} | {type:'error', msg}
 */
function anthropicStreamParser() {
  const f = lineFeeder();
  let event = '';
  return {
    feed(text, emit) {
      f.feed(text, (line) => {
        const s = line.trim();
        if (!s) return;
        if (s.startsWith('event:')) { event = s.slice(6).trim(); return; }
        if (!s.startsWith('data:')) return;
        const data = s.slice(5).trim();
        let j;
        try { j = JSON.parse(data); } catch (e) { emit({ type: 'parse_warn', detail: `chunk JSON 解析失败：${String(e.message).slice(0, 60)}` }); return; }
        const type = j.type || event;
        if (type === 'message_start' && j.message && j.message.usage) emit({ type: 'usage_in', n: j.message.usage.input_tokens || 0 });
        else if (type === 'content_block_delta' && j.delta) {
          if (j.delta.type === 'text_delta' && j.delta.text) emit({ type: 'delta', text: j.delta.text });
          else if (j.delta.type === 'input_json_delta') emit({ type: 'tool' });
        } else if (type === 'content_block_start' && j.content_block && j.content_block.type === 'tool_use') emit({ type: 'tool' });
        else if (type === 'message_delta') {
          if (j.delta && j.delta.stop_reason) emit({ type: 'finish', reason: j.delta.stop_reason });
          if (j.usage && j.usage.output_tokens != null) emit({ type: 'usage_out', n: j.usage.output_tokens });
        } else if (type === 'message_stop') emit({ type: 'done' });
        else if (type === 'error') emit({ type: 'error', msg: String((j.error && j.error.message) || '流中错误事件') });
        // ping / content_block_stop / message_start 其余字段忽略
      });
    },
    flush(emit) { f.flush((line) => this.feed(line + '\n', emit)); },
  };
}

function makeParser(wire) {
  return wire === 'anthropic-messages' ? anthropicStreamParser() : openaiStreamParser();
}

// ── 底层请求 ────────────────────────────────────────────────────────────────
function timeoutSignal(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timeout ${ms}ms`)), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

async function readBody(res, cap) {
  try {
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) return await res.text();
    const dec = new TextDecoder();
    let out = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
      if (out.length > cap) { try { reader.cancel(); } catch (_) { /* 忽略 */ } break; }
    }
    return out;
  } catch (_) { return ''; }
}

async function readErrBody(res) {
  const text = await readBody(res, 8192);
  return classifyHttp(res.status, text);
}

/**
 * 非流式对话探针。返回：
 * { ok, ms, status, content, finishReason, usage, compat[], error:{code,cn,hint} }
 */
async function probeChat(profile, urls, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const t0 = Date.now();
  let body = chatBody(profile, { maxTokens: 16, prompt: opts.prompt });
  let headers = buildHeaders(profile);
  const compat = [];
  let res;
  try {
    res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    if (opts.signal && opts.signal.aborted) return { ok: false, ms: Date.now() - t0, error: { code: 'cancelled', cn: '已取消', hint: '' } };
    return { ok: false, ms: Date.now() - t0, error: classifyNetworkErr(e) };
  }
  // max_tokens 兼容重试（一次）
  if (res.status === 400) {
    const et = await readBody(res.clone ? res.clone() : res, 4096);
    if (maxTokensRetryHint('', et)) {
      compat.push('端点要求 max_completion_tokens（新 OpenAI 语义），已自动改写重试');
      const body2 = JSON.parse(JSON.stringify(body));
      body2.max_completion_tokens = body2.max_tokens; delete body2.max_tokens;
      try {
        res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers, body: JSON.stringify(body2), signal: opts.signal });
      } catch (e) {
        return { ok: false, ms: Date.now() - t0, compat, error: classifyNetworkErr(e) };
      }
    }
  }
  if (!res.ok) return { ok: false, ms: Date.now() - t0, status: res.status, compat, error: await readErrBody(res) };
  const text = await readBody(res, 131072);
  const ms = Date.now() - t0;
  let j;
  try { j = JSON.parse(text); } catch (_) {
    return { ok: false, ms, status: res.status, compat, error: { code: 'schema', cn: '200 但响应非 JSON（schema 不符）', hint: '端点返回的不是 JSON——可能打到网页/网关登录页，检查 baseUrl 是否指向 API 根' } };
  }
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic' : 'openai';
  let content = '';
  let finishReason = null;
  let usage = null;
  if (wire === 'anthropic') {
    content = (Array.isArray(j.content) ? j.content : []).filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
    finishReason = j.stop_reason || null;
    usage = j.usage || null;
    if (!Array.isArray(j.content) || j.type !== 'message') {
      return { ok: false, ms, status: res.status, compat, error: { code: 'schema', cn: '200 但 Anthropic schema 不符', hint: '缺少 content[].type/message 字段——端点可能并非 Anthropic Messages 兼容' } };
    }
  } else {
    const ch = Array.isArray(j.choices) && j.choices[0];
    content = ch && ch.message && typeof ch.message.content === 'string' ? ch.message.content : '';
    finishReason = (ch && ch.finish_reason) || null;
    usage = j.usage || null;
    if (!ch) {
      return { ok: false, ms, status: res.status, compat, error: { code: 'schema', cn: '200 但 OpenAI schema 不符', hint: '缺少 choices[]——端点可能并非 OpenAI Chat Completions 兼容' } };
    }
    if (!content && ch.message && ch.message.reasoning_content != null) {
      compat.push('reasoning 模型：max_tokens=16 全部耗在思考上，content 为空（finish_reason=' + finishReason + '）');
    }
  }
  if (usage && usage.completion_tokens != null && usage.completion_tokens !== undefined && usage.prompt_tokens === undefined) {
    compat.push('usage 字段不完整（缺 prompt_tokens）');
  }
  return { ok: true, ms, status: res.status, content: content.slice(0, 120), finishReason, usage, compat };
}

/**
 * 流式对话探针（TTFT/TPS）。
 * 返回 { ok, ttftMs, totalMs, tps, tokens, tokensExact, stopReason, usage, compat[], error, partial }
 */
async function probeStream(profile, urls, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic' : 'openai';
  const body = chatBody(profile, { maxTokens: opts.maxTokens != null ? opts.maxTokens : 16, prompt: opts.prompt, stream: true });
  // 兼容优先：不主动发 stream_options（部分网关 400），usage 拿得到就用，拿不到按增量估
  const t0 = Date.now();
  let res;
  try {
    res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers: buildHeaders(profile), body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    if (opts.signal && opts.signal.aborted) return { ok: false, error: { code: 'cancelled', cn: '已取消', hint: '' } };
    return { ok: false, error: classifyNetworkErr(e) };
  }
  if (res.status === 400) {
    const et = await readBody(res.clone ? res.clone() : res, 4096);
    if (maxTokensRetryHint('', et)) {
      const body2 = JSON.parse(JSON.stringify(body));
      body2.max_completion_tokens = body2.max_tokens; delete body2.max_tokens;
      try { res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers: buildHeaders(profile), body: JSON.stringify(body2), signal: opts.signal }); } catch (e) { return { ok: false, error: classifyNetworkErr(e) }; }
    }
  }
  if (!res.ok) return { ok: false, status: res.status, error: await readErrBody(res) };
  const ctype = String(res.headers && res.headers.get ? res.headers.get('content-type') || '' : '');
  if (!/event-stream|stream/i.test(ctype) && !res.body) {
    return { ok: false, status: res.status, error: { code: 'schema', cn: '端点未返回流（content-type=' + (ctype || '空') + '）', hint: '端点可能不支持 stream:true 或网关缓冲了响应' } };
  }
  const parser = makeParser(profile.wire);
  let ttftMs = null;
  let tokens = 0;          // usage 精确值或增量计数
  let tokensExact = false;
  let deltas = 0;
  let chars = 0;
  let stopReason = null;
  let usage = null;
  let done = false;
  let streamError = null;
  let endMs = null;
  const compat = [];
  const dec = new TextDecoder();
  const reader = res.body.getReader();
  const deadline = Date.now() + (opts.totalTimeoutMs || 60000);
  try {
    for (;;) {
      if (Date.now() > deadline) { streamError = { code: 'timeout', cn: '流式总时长超时', hint: '上游生成过慢或连接悬挂' }; break; }
      const { value, done: d } = await reader.read();
      if (d) break;
      const text = dec.decode(value, { stream: true });
      parser.feed(text, (ev) => {
        if (ev.type === 'delta') {
          if (ttftMs == null) ttftMs = Date.now() - t0;
          deltas += 1; chars += ev.text.length;
        } else if (ev.type === 'usage' || ev.type === 'usage_out') {
          const n = ev.usage ? (ev.usage.completion_tokens != null ? ev.usage.completion_tokens : ev.usage.output_tokens) : ev.n;
          if (n != null) { tokens = n; tokensExact = true; usage = usage || {}; usage.output_tokens = n; }
        } else if (ev.type === 'usage_in') {
          usage = usage || {}; usage.input_tokens = ev.n;
        } else if (ev.type === 'finish') { stopReason = ev.reason; }
        else if (ev.type === 'done') { done = true; }
        else if (ev.type === 'tool') { /* 工具流块不计入文本 */ }
        else if (ev.type === 'error') { streamError = { code: 'stream_error_event', cn: '流中错误事件', hint: ev.msg || '' }; }
        else if (ev.type === 'parse_warn') { compat.push(ev.detail); }
      });
      endMs = Date.now() - t0;
      if (done || streamError) { try { reader.cancel(); } catch (_) { /* 忽略 */ } break; }
    }
  } catch (e) {
    streamError = classifyNetworkErr(e);
  }
  const totalMs = endMs != null ? endMs : Date.now() - t0;
  if (!tokensExact) {
    tokens = Math.max(1, Math.round(chars / 4)); // 4 字符≈1 token 粗估（中英混合偏低，仅展示口径）
    if (deltas > 0) compat.push('上游未回传 usage，TPS 按增量字符÷4 估算');
  }
  const genMs = Math.max(1, totalMs - (ttftMs != null ? ttftMs : 0));
  const tps = tokens > 0 ? +(tokens / (genMs / 1000)).toFixed(1) : 0;
  if (!ttftMs) return { ok: false, totalMs, error: streamError || { code: 'schema', cn: '流建立但未收到任何文本增量', hint: '端点可能吞掉流式内容（网关缓冲/协议不符）' }, partial: { deltas, tokens, stopReason, done } };
  if (streamError) return { ok: false, ttftMs, totalMs, tps, tokens, tokensExact, stopReason, error: streamError, partial: { done, deltas, chars }, compat };
  if (!done) compat.push('流正常出字但未见结束标记（[DONE]/message_stop），已按连接关闭收尾');
  return { ok: true, ttftMs, totalMs, tps, tokens, tokensExact, stopReason, usage, compat };
}

// ── 工具调用构造 ────────────────────────────────────────────────────────────
const TOOL_SPEC = {
  name: 'get_weather',
  description: '查询指定城市的当前天气',
  paramDesc: '城市名，例如：北京',
};

function toolsPayload(wire) {
  if (wire === 'anthropic-messages') {
    return [{
      name: TOOL_SPEC.name,
      description: TOOL_SPEC.description,
      input_schema: { type: 'object', properties: { city: { type: 'string', description: TOOL_SPEC.paramDesc } }, required: ['city'] },
    }];
  }
  return [{
    type: 'function',
    function: {
      name: TOOL_SPEC.name,
      description: TOOL_SPEC.description,
      parameters: { type: 'object', properties: { city: { type: 'string', description: TOOL_SPEC.paramDesc } }, required: ['city'] },
    },
  }];
}

/**
 * 工具调用探针。返回 { ok, toolCalled, ms, status, detail, compat[], error }
 * ok=HTTP/协议层成功；toolCalled=模型真的发起了工具调用。
 */
async function probeTools(profile, urls, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic' : 'openai';
  const base = { maxTokens: 64, prompt: '请用 get_weather 工具查询北京的天气', tools: toolsPayload(wire) };
  let res;
  let noToolChoice = false;
  const compat = [];
  try {
    res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers: buildHeaders(profile), body: JSON.stringify(chatBody(profile, base)), signal: opts.signal });
    // 400 分诊：max_tokens 不被支持 → 改写 max_completion_tokens 重试；tool_choice 不被支持 → 去掉重试
    if (res.status === 400) {
      const et = await readBody(res.clone ? res.clone() : res, 4096);
      let bodyNext = chatBody(profile, base);
      if (maxTokensRetryHint('', et)) {
        compat.push('端点要求 max_completion_tokens（新 OpenAI 语义），工具步已自动改写重试');
        bodyNext = JSON.parse(JSON.stringify(bodyNext));
        bodyNext.max_completion_tokens = bodyNext.max_tokens; delete bodyNext.max_tokens;
      }
      if (/tool_choice/i.test(et)) {
        noToolChoice = true;
        compat.push('端点不支持 tool_choice，已去掉重试');
        delete bodyNext.tool_choice;
      }
      if (bodyNext !== chatBody(profile, base)) {
        res = await fetchImpl(chatUrlOf(profile, urls), { method: 'POST', headers: buildHeaders(profile), body: JSON.stringify(bodyNext), signal: opts.signal });
      }
    }
  } catch (e) {
    if (opts.signal && opts.signal.aborted) return { ok: false, toolCalled: false, error: { code: 'cancelled', cn: '已取消', hint: '' } };
    return { ok: false, toolCalled: false, error: classifyNetworkErr(e) };
  }
  const t0 = Date.now();
  if (!res.ok) return { ok: false, toolCalled: false, status: res.status, ms: Date.now() - t0, error: await readErrBody(res), compat };
  const text = await readBody(res, 131072);
  let j;
  try { j = JSON.parse(text); } catch (_) {
    return { ok: false, toolCalled: false, status: res.status, error: { code: 'schema', cn: '200 但响应非 JSON', hint: '' }, compat };
  }
  let called = false;
  let detail = '';
  if (wire === 'anthropic') {
    called = (Array.isArray(j.content) ? j.content : []).some((b) => b && b.type === 'tool_use');
    const tb = (Array.isArray(j.content) ? j.content : []).find((b) => b && b.type === 'tool_use');
    detail = tb ? `tool_use: ${tb.name}(${JSON.stringify(tb.input).slice(0, 60)})` : (j.content || []).map((b) => b && b.text).filter(Boolean).join(' ').slice(0, 80);
  } else {
    const ch = Array.isArray(j.choices) && j.choices[0];
    const tc = ch && ch.message && Array.isArray(ch.message.tool_calls) ? ch.message.tool_calls : null;
    called = !!(tc && tc.length);
    detail = called ? `tool_calls: ${tc[0].function && tc[0].function.name}(${String((tc[0].function && tc[0].function.arguments) || '').slice(0, 60)})` : String((ch && ch.message && ch.message.content) || '').slice(0, 80);
  }
  return { ok: true, toolCalled: called, ms: Date.now() - t0, status: res.status, detail, compat, noToolChoice };
}

/**
 * 模型表探针。返回 { ok, status, count, hasTarget, sample[], error }
 */
async function probeModels(profile, urls, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const t0 = Date.now();
  let res;
  try {
    res = await fetchImpl(urls.models, { method: 'GET', headers: buildHeaders(profile), signal: opts.signal });
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: classifyNetworkErr(e) };
  }
  if (!res.ok) return { ok: false, ms: Date.now() - t0, status: res.status, error: await readErrBody(res) };
  const text = await readBody(res, 262144);
  let j;
  try { j = JSON.parse(text); } catch (_) {
    return { ok: false, ms: Date.now() - t0, status: res.status, error: { code: 'schema', cn: '200 但模型表非 JSON', hint: '' } };
  }
  const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : null;
  if (!arr) return { ok: true, ms: Date.now() - t0, status: res.status, count: 0, hasTarget: false, sample: [], compat: ['模型表 schema 不标准（无 data[]/models[]），已按空处理'] };
  const ids = arr.map((m) => String((m && (m.id || m.name)) || '')).filter(Boolean);
  const target = String(upstreamModel(profile) || '');
  return {
    ok: true, ms: Date.now() - t0, status: res.status, count: ids.length,
    hasTarget: !!target && ids.some((x) => x === target || x.split('/').pop() === target || target.split('/').pop() === x),
    sample: ids.slice(0, 8),
  };
}

// ── 健康分 ──────────────────────────────────────────────────────────────────
/** TTFT 打分：≤800ms 满分，≥4s 0 分（线性，钳制 [0, full]） */
function ttftScore(ms, full) {
  const s = Math.min(1, Math.max(0, (4000 - Math.min(Math.max(ms, 0), 4000)) / (4000 - 800)));
  return Math.round(s * full * 10) / 10;
}
/** TPS 打分：≥50 满分，≤2 0 分（对数线性） */
function tpsScore(tps, full) {
  const clamped = Math.min(Math.max(tps, 2), 50);
  const s = (Math.log(clamped) - Math.log(2)) / (Math.log(50) - Math.log(2));
  return Math.round(s * full * 10) / 10;
}

/**
 * 汇总健康分。components: {connect, auth, models, chat, stream, tools}
 * stream 子分 = 成功10 + TTFT 7.5 + TPS 7.5。
 */
function computeScore(steps) {
  const c = { connect: 0, auth: 0, models: 0, chat: 0, stream: 0, tools: 0 };
  if (steps.connect && steps.connect.ok) c.connect = 15;
  if (steps.chat && steps.chat.ok) { c.auth = 15; c.chat = 20; }
  else if (steps.chat && steps.chat.error && (steps.chat.error.code === 'auth' || steps.chat.error.code === 'forbidden')) { c.auth = 0; }
  else if (steps.chat && steps.chat.error && !['dns', 'refused', 'tls', 'reset', 'timeout', 'network', 'proxy', 'cancelled'].includes(steps.chat.error.code)) {
    c.auth = 15; // 到达 HTTP 层但业务失败（404/400 等）→ 鉴权本身通过
  }
  if (steps.models && steps.models.ok) c.models = steps.models.hasTarget ? 10 : 6;
  if (steps.stream) {
    if (steps.stream.ok) c.stream = 10 + ttftScore(steps.stream.ttftMs, 7.5) + tpsScore(steps.stream.tps, 7.5);
  }
  if (steps.tools) {
    if (steps.tools.ok) c.tools = steps.tools.toolCalled ? 15 : 7;
  }
  const total = Math.round((c.connect + c.auth + c.models + c.chat + c.stream + c.tools) * 10) / 10;
  return { total, components: c };
}

function verdictOf(score) {
  if (score >= 85) return { level: 'good', cn: '健康' };
  if (score >= 60) return { level: 'warn', cn: '亚健康' };
  return { level: 'bad', cn: '异常' };
}

// ── 套件编排 ────────────────────────────────────────────────────────────────
const STEP_LABELS = {
  connect: '连通性', chat: '对话', models: '模型表', stream: '流式', tools: '工具调用',
};

/**
 * 完整体检套件。profile: {id,name,baseUrl,apiKey,model,wire}
 * opts: {timeouts:{chatMs,streamMs,modelsMs}, fetchImpl, signal, maxTokens}
 * 返回 maskedReport（不含 apiKey 原文）。
 */
async function runSuite(profile, opts) {
  const o = opts || {};
  const signal = o.signal;
  const wire = profile.wire === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions';
  let urls;
  try { urls = resolveUrls(profile.baseUrl, wire); } catch (e) {
    return maskedProfileOf(profile, { runId: o.runId, fatal: { code: 'config', cn: String(e.message || e), hint: '修正 baseUrl 后重试' }, steps: {} });
  }
  const timeouts = o.timeouts || {};
  const startedAt = new Date().toISOString();
  const steps = {};
  const mk = (name, p) => ({ name, label: STEP_LABELS[name], ...p });

  // 1. 连通性：无鉴权裸 POST（预期 4xx）——零 token 成本证明 DNS/TCP/TLS/HTTP 通
  {
    const t0 = Date.now();
    let ok = false;
    let error = null;
    try {
      const res = await (o.fetchImpl || fetch)(chatUrlOf(profile, urls), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        signal,
      });
      // 任意 HTTP 状态 = 网络与 TLS 通（4xx/405 都是「服务器在说话」）
      ok = true;
      if (res.status === 407) { ok = false; error = { code: 'proxy', cn: '代理需要认证（407）', hint: '本机代理要求认证' }; }
    } catch (e) {
      error = classifyNetworkErr(e);
    }
    steps.connect = mk('connect', { ok, ms: Date.now() - t0, error, detail: ok ? `HTTP 已应答（${Date.now() - t0}ms 内）` : '' });
  }
  if (!steps.connect.ok) {
    const r = maskedProfileOf(profile, { runId: o.runId, startedAt, steps, fatal: { code: steps.connect.error && steps.connect.error.code, cn: '端点不可达，后续步骤全部跳过', hint: steps.connect.error && steps.connect.error.hint } });
    r.score = computeScore(steps);
    r.verdict = verdictOf(r.score.total);
    return r;
  }

  // 2. 对话（鉴权 + 非流式生成）
  try {
    const p = probeChat(profile, urls, { signal });
    const guard = timeoutSignal(timeouts.chatMs || 30000);
    const race = await Promise.race([
      p.then((r) => { guard.cancel(); return r; }),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: { code: 'timeout', cn: '对话超时', hint: `超过 ${(timeouts.chatMs || 30000) / 1000}s 未返回（可在设置里调）` } }), timeouts.chatMs || 30000)),
    ]);
    steps.chat = mk('chat', race);
  } catch (e) { steps.chat = mk('chat', { ok: false, error: classifyNetworkErr(e) }); }

  // 3. 模型表：对话 404/400 时最有诊断价值（区分「路径错」vs「模型名错」）；401 也跳过省时
  const chatErr = steps.chat.error && steps.chat.error.code;
  if (steps.chat.ok || chatErr === 'not_found' || chatErr === 'bad_request' || chatErr === 'rate_limit' || chatErr === 'server') {
    try {
      const guard = timeoutSignal(timeouts.modelsMs || 15000);
      const p = probeModels(profile, urls, { signal }).then((r) => { guard.cancel(); return r; });
      const race = await Promise.race([p, new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: { code: 'timeout', cn: '模型表超时', hint: '' } }), timeouts.modelsMs || 15000))]);
      steps.models = mk('models', race);
    } catch (e) { steps.models = mk('models', { ok: false, error: classifyNetworkErr(e) }); }
  } else {
    steps.models = mk('models', { ok: false, skipped: true, detail: chatErr === 'auth' || chatErr === 'forbidden' ? '鉴权失败，模型表必然同因失败，跳过' : '前置失败，跳过' });
  }

  // 4. 流式：仅对话成功后跑（省无效花费）
  if (steps.chat.ok) {
    try {
      const guard = timeoutSignal(timeouts.streamMs || 60000);
      const p = probeStream(profile, urls, { signal, maxTokens: (o.maxTokens != null ? o.maxTokens : 16) });
      const race = await Promise.race([
        p.then((r) => { guard.cancel(); return r; }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: { code: 'timeout', cn: '流式总时长超时', hint: '' } }), timeouts.streamMs || 60000)),
      ]);
      steps.stream = mk('stream', race);
    } catch (e) { steps.stream = mk('stream', { ok: false, error: classifyNetworkErr(e) }); }
  } else {
    steps.stream = mk('stream', { ok: false, skipped: true, detail: '对话未通过，跳过' });
  }

  // 5. 工具调用：仅对话成功后跑
  if (steps.chat.ok) {
    try {
      const p = probeTools(profile, urls, { signal });
      const guard = timeoutSignal(timeouts.chatMs || 30000);
      const race = await Promise.race([
        p.then((r) => { guard.cancel(); return r; }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, toolCalled: false, error: { code: 'timeout', cn: '工具调用超时', hint: '' } }), timeouts.chatMs || 30000)),
      ]);
      steps.tools = mk('tools', race);
    } catch (e) { steps.tools = mk('tools', { ok: false, toolCalled: false, error: classifyNetworkErr(e) }); }
  } else {
    steps.tools = mk('tools', { ok: false, toolCalled: false, skipped: true, detail: '对话未通过，跳过' });
  }

  const score = computeScore(steps);
  const report = maskedProfileOf(profile, { runId: o.runId, startedAt, finishedAt: new Date().toISOString(), steps, urls, durationMs: Date.now() - new Date(startedAt).getTime() });
  report.score = score;
  report.verdict = verdictOf(score.total);
  return report;
}

/** 档案掩码形态（落 kv / 面板 / AI 共用） */
function maskedProfileOf(profile, extra) {
  return {
    profile: {
      id: profile.id,
      name: profile.name,
      baseUrl: profile.baseUrl,
      model: profile.model,
      wire: profile.wire === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions',
      keyMask: maskKey(profile.apiKey),
      source: profile.source === 'host' ? 'host' : 'manual',
    },
    ...extra,
  };
}

// ── 基准测试编排 ────────────────────────────────────────────────────────────
const FILLER = 'The quick brown fox jumps over the lazy dog near the river bank while the sun sets slowly behind the distant mountains. ';
const FILLER_CN = '快速折跳过懒狗的狐狸在河岸边散步，夕阳缓缓落进远山，晚风吹动芦苇与灯火。';

/** 构造约 targetTokens 的确定性提示词（混合中英，≈4 字符/ token 口径） */
function buildPrompt(targetTokens) {
  const en = Math.floor(targetTokens * 0.7);
  const cn = Math.max(0, targetTokens - en);
  let s = '';
  while (s.length < en * 4) s += FILLER;
  let c = '';
  while (c.length < cn * 1.8) c += FILLER_CN;
  return `${s}\n${c}\n\n请忽略上文内容，只回复两个词：OK`.slice(0, targetTokens * 6 + 200);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  // nearest-rank：ceil(p/100 × N) 第几个最小值（1-based）
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * 基准测试：sizes × rounds 全部流式。sizes: [64|512|2048]（≈token）。
 * 返回 { ok, sizes:[{tokens, rounds, ttftP50, ttftMin, ttftMax, tpsP50, tpsMin, tpsMax, totalP50, errs}], compat }
 */
async function runBenchmark(profile, urls, opts) {
  const sizes = Array.isArray(opts.sizes) && opts.sizes.length ? opts.sizes : [512];
  const rounds = Math.min(Math.max(opts.rounds || 2, 1), 5);
  const out = { ok: true, sizes: [], compat: [] };
  for (const size of sizes) {
    const rows = [];
    let errs = 0;
    let lastErr = null;
    for (let i = 0; i < rounds; i++) {
      if (opts.signal && opts.signal.aborted) break;
      const prompt = buildPrompt(size);
      const r = await probeStream(profile, urls, { signal: opts.signal, maxTokens: opts.maxTokens != null ? opts.maxTokens : 64, prompt, totalTimeoutMs: opts.totalTimeoutMs || 120000 });
      if (r.ok) rows.push({ ttft: r.ttftMs, tps: r.tps, total: r.totalMs });
      else { errs += 1; lastErr = r.error; }
    }
    if (!rows.length) {
      out.ok = false;
      out.sizes.push({ tokens: size, rounds, errs, error: lastErr });
      continue;
    }
    if (errs) out.compat.push(`${size} token 档：${errs}/${rounds} 轮失败`);
    const tt = rows.map((x) => x.ttft).sort((a, b) => a - b);
    const tp = rows.map((x) => x.tps).sort((a, b) => a - b);
    const to = rows.map((x) => x.total).sort((a, b) => a - b);
    out.sizes.push({
      tokens: size, rounds, errs,
      ttftP50: percentile(tt, 50), ttftMin: tt[0], ttftMax: tt[tt.length - 1],
      tpsP50: percentile(tp, 50), tpsMin: tp[0], tpsMax: tp[tp.length - 1],
      totalP50: percentile(to, 50),
      error: lastErr,
    });
  }
  return out;
}

module.exports = {
  VERSION,
  maskKey,
  percentile,
  stripCliModelSuffix,
  upstreamModel,
  chatUrlOf,
  resolveUrls,
  buildHeaders,
  chatBody,
  classifyNetworkErr,
  classifyHttp,
  openaiStreamParser,
  anthropicStreamParser,
  probeChat,
  probeStream,
  probeTools,
  probeModels,
  computeScore,
  ttftScore,
  tpsScore,
  verdictOf,
  runSuite,
  runBenchmark,
  buildPrompt,
  maskedProfileOf,
  toolsPayload,
  maxTokensRetryHint,
  STEP_LABELS,
};
