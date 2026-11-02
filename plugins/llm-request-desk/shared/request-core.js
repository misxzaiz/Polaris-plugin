'use strict';
/**
 * request-core.js —— LLM 请求调试台核心纯函数库（零依赖）
 *
 * 职责：双协议（OpenAI Chat Completions / Anthropic Messages）请求构造、
 * URL 归一、SSE 流解析、错误体解析、诊断知识库、变异器。
 * 全部为纯函数/状态机，不触网不落盘——service 负责执行，这里负责「懂协议」。
 *
 * 设计依据：真实故障案例（docs/llm-request-desk-selection.md §三）——
 * 商汤「inference request is invalid」（messages 以 assistant 结尾）、
 * OpenAI 兼容端点参数漂移（unsupported parameters）、/v1 重复拼接等。
 */

const VERSION = '0.1.0';
const WIRE_OPENAI = 'openai-chat-completions';
const WIRE_ANTHROPIC = 'anthropic-messages';

// ── 掩码 ───────────────────────────────────────────────────────────────────
function maskKey(key) {
  const k = String(key || '');
  if (!k) return '（无）';
  if (k.length <= 6) return '****';
  return `****${k.slice(-4)}`;
}

/** 脱敏 headers（authorization / x-api-key / cookie 全掩码） */
function maskHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase();
    if (lk === 'authorization' || lk === 'x-api-key' || lk === 'cookie' || lk === 'proxy-authorization') {
      out[k] = maskKey(String(v).replace(/^(Bearer|Api-Key)\s+/i, ''));
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── URL 归一 ───────────────────────────────────────────────────────────────
/**
 * 端点 URL 拼接。规则：
 *   - 去尾斜杠；忽略 baseUrl 里的 query/hash
 *   - baseUrl 已含 /v1 段则不再补（「/v1 重复拼接」是 404/400 高发根因）
 *   - OpenAI: <base>[/v1]/chat/completions；Anthropic: <base>[/v1]/messages
 *   - pathOverride 可覆盖路径尾部（如 /v1/messages?beta=true 这类网关变体）
 */
function resolveUrl(baseUrl, wire, pathOverride) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('baseUrl 为空');
  if (!/^https?:\/\//i.test(base)) throw new Error(`baseUrl 必须以 http(s):// 开头（当前：${base.slice(0, 40)}）`);
  const hasV1 = /\/v1$/.test(base);
  if (pathOverride && typeof pathOverride === 'string') {
    const p = pathOverride.startsWith('/') ? pathOverride : `/${pathOverride}`;
    return base + p;
  }
  if (wire === WIRE_ANTHROPIC) return `${base}${hasV1 ? '' : '/v1'}/messages`;
  return `${base}${hasV1 ? '' : '/v1'}/chat/completions`;
}

/** 模型列表 URL（OpenAI 语义；Anthropic 协议端点也普遍兼容 /v1/models 或忽略之） */
function resolveModelsUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('baseUrl 为空');
  const hasV1 = /\/v1$/.test(base);
  return `${base}${hasV1 ? '' : '/v1'}/models`;
}

// ── 协议预检 ───────────────────────────────────────────────────────────────
const OPENAI_TOP_FIELDS = new Set([
  'model', 'messages', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p',
  'n', 'stream', 'stream_options', 'stop', 'presence_penalty', 'frequency_penalty',
  'logit_bias', 'logprobs', 'top_logprobs', 'user', 'seed', 'response_format',
  'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning_effort', 'modalities', 'metadata',
]);
const ANTHROPIC_TOP_FIELDS = new Set([
  'model', 'messages', 'system', 'max_tokens', 'temperature', 'top_p', 'top_k',
  'stream', 'stop_sequences', 'tools', 'tool_choice', 'metadata',
  'thinking', 'context_management', 'output_config', 'service_tier',
]);

/**
 * 发送前预检：结构问题直接拦截（不花一次 400）。
 * 返回 { ok, errors: string[], warnings: string[] }
 */
function validatePayload(wire, payload) {
  const errors = [];
  const warnings = [];
  const p = payload || {};
  if (!String(p.model || '').trim()) errors.push('model 为空——绝大多数端点会直接 400/404');
  const msgs = Array.isArray(p.messages) ? p.messages : [];
  if (!msgs.length) errors.push('messages 为空——没有可发送的对话内容');
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      errors.push(`messages 含非法角色「${(m && m.role) || JSON.stringify(m).slice(0, 30)}」（仅支持 user/assistant）`);
      break;
    }
  }
  if (wire === WIRE_ANTHROPIC) {
    // 兼容构造体（camelCase maxTokens）与原始发送体（snake_case max_tokens）两种形态
    if (p.maxTokens == null && p.max_tokens == null) {
      errors.push('Anthropic 协议 max_tokens 为必填字段，缺失会被官方与多数网关直接 400');
    }
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      warnings.push('messages 以 assistant 结尾——Anthropic 协议要求以 user 结尾，部分严格端点（如商汤 Sensenova）会返回 400「inference request is invalid」');
    }
    if (Array.isArray(p.tools) && p.tools.length) {
      const bad = p.tools.find((t) => t && !t.input_schema && t.parameters);
      if (bad) warnings.push('tools 使用了 OpenAI 形态（parameters）——Anthropic 协议要求 input_schema，请用「按协议转换」');
    }
  } else {
    if (p.system && !p.extra) warnings.push('OpenAI 协议无独立 system 字段——system 将并入 messages[0]（role=system）');
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ── 请求构造 ───────────────────────────────────────────────────────────────
/**
 * 统一 payload → { url, headers, body, maskedHeaders }
 * payload: { model, system?, messages[{role,content}], maxTokens?, temperature?,
 *            topP?, topK?, stream?, stop?, tools?, toolChoice?, extra? , rawBody? }
 * rawBody 存在时直接透传（高级模式：完全手写请求体），仅补充 model 兜底。
 */
function buildRequest(endpoint, payload) {
  const wire = endpoint.wire === WIRE_ANTHROPIC ? WIRE_ANTHROPIC : WIRE_OPENAI;
  const url = resolveUrl(endpoint.baseUrl, wire, endpoint.pathOverride);
  const headers = { 'Content-Type': 'application/json' };
  const p = payload || {};
  let body;

  if (p.rawBody && typeof p.rawBody === 'object') {
    body = p.rawBody;
    if (wire === WIRE_ANTHROPIC) {
      headers['x-api-key'] = endpoint.apiKey || '';
      headers['anthropic-version'] = endpoint.anthropicVersion || '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${endpoint.apiKey || ''}`;
    }
    return { url, wire, headers, body, maskedHeaders: maskHeaders(headers) };
  }

  const messages = (Array.isArray(p.messages) ? p.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.content == null ? '' : String(m.content) }));

  if (wire === WIRE_ANTHROPIC) {
    body = { model: p.model, max_tokens: (p.maxTokens != null ? p.maxTokens : (p.extra && p.extra.max_tokens) != null ? p.extra.max_tokens : 1024), messages };
    if (p.system) body.system = String(p.system);
    if (p.temperature != null) body.temperature = clampNum(p.temperature, 0, 2);
    if (p.topP != null) body.top_p = clampNum(p.topP, 0, 1);
    if (p.topK != null) body.top_k = Math.round(Number(p.topK));
    if (p.stream) body.stream = true;
    if (p.stop) body.stop_sequences = Array.isArray(p.stop) ? p.stop : [p.stop];
    if (Array.isArray(p.tools) && p.tools.length) body.tools = p.tools;
    if (p.toolChoice) body.tool_choice = p.toolChoice;
    mergeExtra(body, p.extra, ANTHROPIC_TOP_FIELDS);
    headers['x-api-key'] = endpoint.apiKey || '';
    headers['anthropic-version'] = endpoint.anthropicVersion || '2023-06-01';
  } else {
    const msgs = [];
    if (p.system) msgs.push({ role: 'system', content: String(p.system) });
    msgs.push(...messages);
    body = { model: p.model, messages: msgs };
    if (p.maxTokens != null) body.max_tokens = Math.round(Number(p.maxTokens));
    if (p.temperature != null) body.temperature = clampNum(p.temperature, 0, 2);
    if (p.topP != null) body.top_p = clampNum(p.topP, 0, 1);
    if (p.stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    if (p.stop) body.stop = Array.isArray(p.stop) ? p.stop : [p.stop];
    if (Array.isArray(p.tools) && p.tools.length) body.tools = p.tools;
    if (p.toolChoice) body.tool_choice = p.toolChoice;
    mergeExtra(body, p.extra, OPENAI_TOP_FIELDS);
    headers['Authorization'] = `Bearer ${endpoint.apiKey || ''}`;
  }
  return { url, wire, headers, body, maskedHeaders: maskHeaders(headers) };
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

/** extra 字段合并：白名单内直接覆盖，白名单外原样带上（调试台要允许非标字段做实验） */
function mergeExtra(body, extra) {
  if (!extra || typeof extra !== 'object') return;
  for (const [k, v] of Object.entries(extra)) {
    if (k === 'model' || k === 'messages') continue; // 核心字段不允许 extra 覆盖
    body[k] = v;
  }
}

// ── SSE 解析 ───────────────────────────────────────────────────────────────
/**
 * 增量 SSE 解析器：feed(chunk) → 归一事件数组。
 * 归一事件：{ kind: 'delta'|'reasoning'|'usage'|'finish'|'error'|'meta'|'raw', text?, reason?, finish?, usage?, err?, event?, raw? }
 */
function createSSEParser(wire) {
  let buf = '';
  let curEvent = '';
  let curData = [];
  const isAnthropic = wire === WIRE_ANTHROPIC;

  function dispatch() {
    if (!curData.length && !curEvent) return null;
    const dataStr = curData.join('\n');
    const evtName = curEvent;
    curEvent = '';
    curData = [];
    if (!dataStr) return null;
    if (!isAnthropic) {
      if (dataStr.trim() === '[DONE]') return { kind: 'finish', finish: 'stop', note: '[DONE]' };
      return normalizeOpenAIDelta(dataStr);
    }
    return normalizeAnthropicEvent(evtName, dataStr);
  }

  return {
    feed(chunk) {
      buf += chunk;
      const out = [];
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line === '') {
          const e = dispatch();
          if (e) out.push(e);
          continue;
        }
        if (line.startsWith('event:')) curEvent = line.slice(6).trim();
        else if (line.startsWith('data:')) curData.push(line.slice(5).trimStart());
        else if (line.startsWith(':')) { /* 注释行，忽略 */ }
        // 其他字段（id:/retry:）忽略
      }
      return out;
    },
    flush() {
      const e = dispatch();
      return e ? [e] : [];
    },
  };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function normalizeOpenAIDelta(dataStr) {
  const j = safeJson(dataStr);
  if (!j) return { kind: 'raw', raw: dataStr.slice(0, 200) };
  if (j.error) return { kind: 'error', err: { message: j.error.message || JSON.stringify(j.error).slice(0, 200), code: j.error.code || j.error.type } };
  const choice = Array.isArray(j.choices) && j.choices[0];
  const out = [];
  if (choice && choice.delta) {
    if (typeof choice.delta.content === 'string' && choice.delta.content) out.push({ kind: 'delta', text: choice.delta.content });
    if (typeof choice.delta.reasoning_content === 'string' && choice.delta.reasoning_content) out.push({ kind: 'reasoning', text: choice.delta.reasoning_content });
    if (choice.delta.reasoning && typeof choice.delta.reasoning === 'object' && typeof choice.delta.reasoning.text === 'string') {
      out.push({ kind: 'reasoning', text: choice.delta.reasoning.text });
    }
  }
  if (choice && choice.finish_reason) out.push({ kind: 'finish', finish: choice.finish_reason });
  if (j.usage) out.push({ kind: 'usage', usage: { prompt: j.usage.prompt_tokens, completion: j.usage.completion_tokens, total: j.usage.total_tokens, exact: true } });
  return out.length === 1 ? out[0] : out.length > 1 ? out : { kind: 'meta', event: 'noop' };
}

function normalizeAnthropicEvent(evtName, dataStr) {
  const j = safeJson(dataStr);
  if (!j) return { kind: 'raw', raw: dataStr.slice(0, 200) };
  if (j.type === 'error' || (j.error && !j.type)) {
    const e = j.error || {};
    return { kind: 'error', err: { message: e.message || JSON.stringify(j).slice(0, 200), code: e.type } };
  }
  switch (j.type) {
    case 'message_start':
      return { kind: 'usage', usage: { prompt: j.message && j.message.usage && j.message.usage.input_tokens, completion: 0, exact: true } };
    case 'content_block_delta': {
      const d = j.delta || {};
      if (d.type === 'thinking_delta' && d.thinking) return { kind: 'reasoning', text: d.thinking };
      if (typeof d.text === 'string' && d.text) return { kind: 'delta', text: d.text };
      return { kind: 'meta', event: j.type };
    }
    case 'message_delta':
      return { kind: 'finish', finish: (j.delta && j.delta.stop_reason) || null, usage: j.usage ? { prompt: null, completion: j.usage.output_tokens, exact: true } : undefined };
    case 'message_stop':
      return { kind: 'meta', event: 'message_stop' };
    case 'ping':
      return { kind: 'meta', event: 'ping' };
    default:
      return { kind: 'meta', event: j.type || evtName || 'unknown' };
  }
}

// ── 流式聚合器 ─────────────────────────────────────────────────────────────
/** 消费归一事件，产出 StreamSummary：{ text, reasoning, ttftMs, chunkCount, bytes, finishReason, usage, doneMarker, sawError } */
function createStreamAggregator() {
  const s = { text: '', reasoning: '', ttftMs: null, chunkCount: 0, bytes: 0, finishReason: null, usage: null, doneMarker: false, sawError: null, startedAt: Date.now(), endAt: null };
  return {
    summary: s,
    add(ev, bytes) {
      s.chunkCount += 1;
      s.bytes += bytes || 0;
      if (s.ttftMs == null) s.ttftMs = Date.now() - s.startedAt;
      const list = Array.isArray(ev) ? ev : [ev];
      for (const e of list) {
        if (!e) continue;
        if (e.kind === 'delta') s.text += e.text || '';
        else if (e.kind === 'reasoning') s.reasoning += e.text || '';
        else if (e.kind === 'finish') { s.finishReason = e.finish || s.finishReason; if (e.note === '[DONE]') s.doneMarker = true; if (e.usage && e.usage.completion != null) s.usage = mergeUsage(s.usage, e.usage); }
        else if (e.kind === 'usage') s.usage = mergeUsage(s.usage, e.usage);
        else if (e.kind === 'error') s.sawError = e.err;
      }
    },
    end() { s.endAt = Date.now(); s.totalMs = s.endAt - s.startedAt; s.tps = s.totalMs > 0 ? Math.round((approxTokens(s.text) / (s.totalMs / 1000)) * 10) / 10 : 0; },
  };
}

function mergeUsage(a, b) {
  if (!a) return { ...b };
  return {
    prompt: b.prompt != null ? b.prompt : a.prompt,
    completion: b.completion != null ? b.completion : a.completion,
    total: b.total != null ? b.total : (a.total != null ? a.total : (b.prompt || 0) + (b.completion || 0)),
    exact: !!(a.exact && b.exact !== false),
  };
}

/** 无 tokenizer 的近似 token 估算（中文≈1.6字符/token，英文≈4字符/token 混合取 2.6） */
function approxTokens(text) {
  const t = String(text || '');
  if (!t) return 0;
  const cjk = (t.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const other = t.length - cjk;
  return Math.max(1, Math.round(cjk / 1.6 + other / 4));
}

// ── 错误体解析 ─────────────────────────────────────────────────────────────
/** 解析非 2xx 响应体 → { providerCode, message, retryAfterMs, raw(截断) } */
function parseErrorBody(status, text, headers) {
  let providerCode = '';
  let message = '';
  let retryAfterMs = null;
  const ra = headers && (headers['retry-after'] || headers['Retry-After']);
  if (ra) {
    const n = Number(ra);
    retryAfterMs = Number.isFinite(n) ? n * 1000 : null;
  }
  const j = safeJson(String(text || ''));
  if (j) {
    const e = j.error || j;
    // type（错误类别，如 invalid_request_error）比 code（具体代码）更稳定，优先取
    providerCode = e.type || e.code || j.type || j.code || '';
    message = e.message || j.message || '';
    if (!retryAfterMs && j.error && j.error.type === 'rate_limit_error') {
      // Anthropic 风格：error.message 里可能有 retry info，尽力而为
    }
  } else {
    message = String(text || '').slice(0, 300);
  }
  if (!message) message = `HTTP ${status}（无响应体或非 JSON）`;
  return { providerCode: String(providerCode), message: String(message), retryAfterMs, raw: String(text || '').slice(0, 2000) };
}

// ── 诊断知识库 ─────────────────────────────────────────────────────────────
/**
 * 诊断：输入请求/响应上下文，输出 findings[]。
 * finding: { id, severity: 'error'|'warn'|'info', title, detail, fix }
 * 规则来源见选型文档 §三；每条规则都有真实案例背书。
 */
function diagnose(ctx) {
  const out = [];
  const wire = ctx.wire;
  const isAnthropic = wire === WIRE_ANTHROPIC;
  const body = ctx.reqBody || {};
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const status = ctx.status;
  const respText = String(ctx.respText || '');
  const lower = respText.toLowerCase();
  const streamInfo = ctx.streamInfo;

  // R1 trailing assistant（Anthropic 协议；真实案例：商汤 Sensenova 400）
  if (isAnthropic && msgs.length) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      const hasToolUse = Array.isArray(last.content) && last.content.some((b) => b && b.type === 'tool_use');
      if (!hasToolUse) {
        out.push({
          id: 'trailing-assistant', severity: 'warn',
          title: 'messages 以 assistant(text) 结尾',
          detail: 'Anthropic 协议要求 messages 必须以 user 角色结尾。部分端点宽容，但商汤 Sensenova 等严格校验端点会返回 400「inference request is invalid」（2026-11-02 实锤案例：同请求 user/tool_use 结尾 200，assistant(text) 结尾 400）。',
          fix: '点「变异 → 补空 user 结尾」后重放；或在客户端侧保证请求以 user 消息收尾。',
        });
      }
    }
  }

  // R2 tool_use / tool_result 配对（Anthropic）
  if (isAnthropic) {
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === 'user' && Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b && b.type === 'tool_result') {
            const prev = msgs[i - 1];
            const prevBlocks = prev && Array.isArray(prev.content) ? prev.content : [];
            const matched = prevBlocks.some((pb) => pb && pb.type === 'tool_use' && pb.id === b.tool_use_id);
            if (!matched) {
              out.push({
                id: 'orphan-tool-result', severity: 'error',
                title: `tool_result 无对应前置 tool_use（messages[${i}]）`,
                detail: `tool_use_id「${b.tool_use_id || '(空)'}」在前一条 assistant 消息中找不到配对。Claude Code SDK turn 交错时常见（anthropics/claude-code #7380/#10693 同源）。`,
                fix: '删除孤儿 tool_result 块，或补全前置 tool_use。点「变异 → 裁剪非标字段」可先排除其他变量。',
              });
              break;
            }
          }
        }
      }
    }
  }

  // R3 连续同角色（Anthropic 多数实现要求交替）
  if (isAnthropic && msgs.length > 1) {
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].role === msgs[i - 1].role && typeof msgs[i].content === 'string' && typeof msgs[i - 1].content === 'string') {
        out.push({
          id: 'same-role-adjacent', severity: 'info',
          title: `messages[${i - 1}] 与 [${i}] 角色相同（${msgs[i].role}）`,
          detail: 'Anthropic 官方语义要求 user/assistant 交替；部分端点不自动合并连续同角色消息，可能 400 或行为异常。',
          fix: '合并相邻同角色消息后重试。',
        });
        break;
      }
    }
  }

  // R4 model 缺失
  if (!String(body.model || '').trim()) {
    out.push({
      id: 'model-missing', severity: 'error', title: '请求体缺少 model 字段',
      detail: 'model 为空时绝大多数端点直接 400（invalid_request_error）或 404（model not found）。',
      fix: '在构造器填入模型名；可先拉模型表（端点页「拉取模型」）确认可用名称。',
    });
  }

  // R5 Anthropic max_tokens 必填
  if (isAnthropic && body.max_tokens == null) {
    out.push({
      id: 'max-tokens-missing', severity: 'error', title: 'Anthropic 协议 max_tokens 必填但缺失',
      detail: 'Anthropic Messages 协议中 max_tokens 是必填字段（OpenAI 是可选），缺失会被官方端点与多数网关 400。',
      fix: '构造器填 max_tokens（如 1024）。',
    });
  }

  // R6 URL /v1 重复（如 /v1/v1/messages：baseUrl 已带 /v1 又叠一层）
  if (ctx.url && /\/v1\/v1(\/|$|\?)/.test(ctx.url)) {
    out.push({
      id: 'url-dup-v1', severity: 'error', title: 'URL 中 /v1 重复拼接',
      detail: `最终请求 URL：${ctx.url}。baseUrl 已带 /v1 又叠加了 /v1 路径，会 404 或被网关拒收。`,
      fix: '端点 baseUrl 去掉或补上 /v1（本插件已自动防重，多出现在 rawBody+手改 URL 场景）。',
    });
  }

  // 状态码相关
  if (status === 401 || status === 403) {
    out.push({
      id: 'auth-fail', severity: 'error', title: `HTTP ${status} 鉴权失败`,
      detail: lower.includes('incorrect api key') || lower.includes('invalid api key')
        ? '端点明确报告 API key 无效。'
        : `端点拒绝了本次鉴权。${respText ? `响应：${respText.slice(0, 160)}` : ''}`,
      fix: '检查 key 是否复制完整、是否属于该端点、是否有余额/权限；经网关时确认网关侧 key 映射。',
    });
  } else if (status === 404) {
    if (/model/i.test(respText) || lower.includes('no such model')) {
      out.push({
        id: 'model-not-found', severity: 'error', title: 'HTTP 404 模型不存在',
        detail: `端点不认识模型「${body.model}」。OpenAI 兼容生态模型命名差异大（deepseek-chat vs deepseek-v3、gpt-4o vs gpt-4o-2024-xx 等）。`,
        fix: '到端点页「拉取模型」核对可用名称，注意大小写与冒号 tag（ollama 需要 :latest 等 tag）。',
      });
    } else {
      out.push({
        id: 'url-404', severity: 'error', title: 'HTTP 404 路径不存在',
        detail: `请求路径端点不认识：${ctx.url}。常见根因：baseUrl 少/多 /v1、网关路径变体、把 chat 端点当 messages 用。`,
        fix: '检查 baseUrl 拼接规则；网关类端点可用 pathOverride 覆盖路径。',
      });
    }
  } else if (status === 400) {
    const m = (safeJson(respText) || {}).error || {};
    const msg = String(m.message || respText).toLowerCase();
    if (/max_tokens/.test(msg)) {
      out.push({
        id: 'max-tokens-400', severity: 'error', title: '400：max_tokens 相关校验失败',
        detail: `端点响应：${String(m.message || respText).slice(0, 200)}。可能是超过模型上限、或小于最小值、或字段名漂移（部分端点要 max_completion_tokens）。`,
        fix: '调小 max_tokens 重放；仍失败则试 max_completion_tokens（OpenAI 新端点）。',
      });
    } else if (/context length|too long|maximum context|token limit|input.*length/.test(msg)) {
      out.push({
        id: 'context-overflow', severity: 'error', title: '400：上下文超长',
        detail: 'messages 总 token 超过模型上下文窗口。多轮调试会话最容易踩。',
        fix: '点「变异 → 减半 messages」或「最小请求」重放定位。',
      });
    } else if (/temperature/.test(msg)) {
      out.push({
        id: 'temperature-400', severity: 'error', title: '400：temperature 取值被拒',
        detail: `端点响应：${String(m.message || respText).slice(0, 200)}。部分推理模型（o1/deepseek-r1 类）不支持非默认 temperature。`,
        fix: '删除 temperature 参数后重放。',
      });
    } else if (/tool|function/.test(msg)) {
      out.push({
        id: 'tools-400', severity: 'error', title: '400：tools 定义被拒',
        detail: `端点响应：${String(m.message || respText).slice(0, 200)}。常见：工具 schema 不合规范、OpenAI/Anthropic 工具格式混用、端点不支持 function calling。`,
        fix: '去掉 tools 重放验证是否工具引发；检查 tools 是否按当前协议格式书写。',
      });
    } else if (/unrecognized|unknown|unexpected|not supported|invalid parameter|additional property|unsupported/.test(msg)) {
      out.push({
        id: 'param-unsupported', severity: 'error', title: '400：疑似参数不被该端点支持（参数漂移）',
        detail: `端点响应：${String(m.message || respText).slice(0, 240)}。「OpenAI 兼容」端点对各参数支持度不一（reasoning_effort/response_format/logprobs/stream_options 等最常翻车）。`,
        fix: '点「变异 → 裁剪为标准字段」重放：只保留 model/messages/max_tokens/temperature/top_p/stream。若恢复，再二分加回参数定位元凶。',
      });
    } else if (/inference request is invalid|invalid request/.test(msg)) {
      out.push({
        id: 'generic-invalid', severity: 'error', title: '400：端点报「请求无效」但未说明字段',
        detail: `端点响应：${String(m.message || respText).slice(0, 240)}。这是最难排查的一类——端点拒绝了请求体但不指明原因（商汤 Sensenova 案例即此形态）。`,
        fix: '按序变异重放定位：①补空 user 结尾 ②裁剪为标准字段 ③最小请求（1条user）④减半 messages。每步对比结果即可二分出违规字段。',
      });
    } else if (respText) {
      out.push({
        id: 'bad-request-400', severity: 'error', title: 'HTTP 400 请求被拒',
        detail: `端点响应：${respText.slice(0, 300)}`,
        fix: '若为 JSON 响应请看 error.message 定位字段；无法定位时用变异重放二分。',
      });
    }
  } else if (status === 429) {
    out.push({
      id: 'rate-limit', severity: 'warn', title: 'HTTP 429 触发限流',
      detail: `限流是配额问题（tpm/rpm），与请求体内容无关。${ctx.parsedError && ctx.parsedError.retryAfterMs ? `端点建议 ${Math.round(ctx.parsedError.retryAfterMs / 1000)}s 后重试。` : '未携带 Retry-After。'}`,
      fix: '等待后重放；连续 429 检查 key 配额档位或换 key。',
    });
  } else if (status >= 500) {
    out.push({
      id: 'upstream-5xx', severity: 'warn', title: `HTTP ${status} 上游故障`,
      detail: '5xx 是端点/网关侧问题，请求体本身大概率无责。',
      fix: '稍后重放；持续 5xx 检查端点状态页或换端点。',
    });
  }

  // 流式相关
  if (streamInfo) {
    if (streamInfo.sawError) {
      out.push({
        id: 'stream-error-event', severity: 'error', title: '流式过程中收到 error 事件',
        detail: `HTTP 已 2xx 但流内报错：${streamInfo.sawError.message || JSON.stringify(streamInfo.sawError).slice(0, 200)}（网关常见：鉴权透传成功但上游拒绝）。`,
        fix: '按流内 error.message 处理；经网关时注意网关可能已 200 化上游错误。',
      });
    }
    if (streamInfo.chunkCount > 0 && !streamInfo.finishReason && !streamInfo.doneMarker) {
      out.push({
        id: 'stream-aborted', severity: 'warn', title: '流式提前中断（无 finish 亦无 [DONE]）',
        detail: `收到 ${streamInfo.chunkCount} 个 chunk 后连接结束，但没有终止标记——输出可能被截断。常见：网关/代理超时断流、上游中断、响应缓冲吃掉尾帧。`,
        fix: '增大超时重放；经网关时关闭其响应缓冲（如 nginx proxy_buffering off）对照。',
      });
    }
    if (streamInfo.chunkCount > 0 && !streamInfo.usage) {
      out.push({
        id: 'stream-usage-missing', severity: 'info', title: '流式响应未携带 usage',
        detail: 'OpenAI 语义需 stream_options.include_usage=true 才返回用量（本插件构造器已默认带上）；若仍无，说明端点不支持该参数（参数漂移信号之一）。',
        fix: '可忽略；如端点因 stream_options 报 400，请用「裁剪为标准字段」变异验证。',
      });
    }
    if (streamInfo.ttftMs != null && streamInfo.ttftMs > 10000) {
      out.push({
        id: 'slow-ttft', severity: 'info', title: `首 token 延迟 ${Math.round(streamInfo.ttftMs / 100) / 10}s`,
        detail: 'TTFT 偏高：推理型模型（r1/o1 类思考期不吐字）或端点排队。非错误，供性能判断。',
        fix: '对照 llm-probe 体检的 TTFT 基线判断是否异常。',
      });
    }
  }

  // 非流式但请求了 stream（HTTP 2xx 且 body 是完整 JSON 而非 SSE）
  if (ctx.requestedStream && status >= 200 && status < 300 && respText && !respText.startsWith('data:') && !ctx.streamInfo) {
    try { JSON.parse(respText); out.push({
      id: 'stream-downgraded', severity: 'info', title: '请求了 stream 但端点返回了完整 JSON',
      detail: '该端点忽略了 stream=true（参数漂移信号），或网关做了整包缓冲。',
      fix: '若需要真流式，确认端点支持；网关场景检查缓冲配置。',
    }); } catch (_) { /* 不是 JSON，可能真是 SSE 由执行器处理 */ }
  }

  if (!out.length && status >= 200 && status < 300) {
    out.push({ id: 'all-clear', severity: 'info', title: '未发现协议层异常', detail: '请求与响应结构均符合当前协议预期。', fix: '' });
  }
  return out;
}

// ── 变异器 ─────────────────────────────────────────────────────────────────
/**
 * 预置变异：把「手工 curl 改请求体重放」产品化。每个变异 { id, label, note, apply(body) → newBody|null }。
 * apply 返回 null 表示该变异不适用当前请求体。
 */
function mutators(wire) {
  const isAnthropic = wire === WIRE_ANTHROPIC;
  const list = [];
  const clone = (b) => JSON.parse(JSON.stringify(b));

  list.push({
    id: 'minimal', label: '最小请求（1 条 user）',
    note: '排除消息内容本身的问题：只留最后一条 user。',
    apply(body) {
      if (!Array.isArray(body.messages) || !body.messages.length) return null;
      const b = clone(body);
      const lastUser = [...b.messages].reverse().find((m) => m.role === 'user');
      b.messages = [{ role: 'user', content: typeof (lastUser && lastUser.content) === 'string' && lastUser.content ? lastUser.content.slice(0, 500) : 'ping' }];
      return b;
    },
  });
  list.push({
    id: 'halve-messages', label: '减半 messages',
    note: '定位上下文超长 / 消息内容触发的问题。',
    apply(body) {
      if (!Array.isArray(body.messages) || body.messages.length < 2) return null;
      const b = clone(body);
      b.messages = b.messages.slice(Math.floor(b.messages.length / 2));
      return b;
    },
  });
  list.push({
    id: 'standard-fields', label: '裁剪为标准字段',
    note: '定位参数漂移：只留 model/messages/max_tokens/temperature/top_p/stream。',
    apply(body) {
      const b = clone(body);
      const keep = ['model', 'messages', 'max_tokens', 'temperature', 'top_p', 'stream'];
      for (const k of Object.keys(b)) if (!keep.includes(k)) delete b[k];
      if (isAnthropic && b.max_tokens == null) b.max_tokens = 1024;
      return b;
    },
  });
  if (isAnthropic) {
    list.push({
      id: 'append-empty-user', label: '补空 user 结尾',
      note: '修复「messages 以 assistant 结尾」（商汤 400 实锤案例的标准修复）。',
      apply(body) {
        if (!Array.isArray(body.messages) || !body.messages.length) return null;
        const b = clone(body);
        if (b.messages[b.messages.length - 1].role !== 'assistant') return null;
        b.messages.push({ role: 'user', content: [{ type: 'text', text: '' }] });
        return b;
      },
    });
    list.push({
      id: 'drop-trailing-assistant', label: '移除末尾 assistant',
      note: '同上另一解法：直接删掉末尾 assistant 消息。',
      apply(body) {
        if (!Array.isArray(body.messages) || !body.messages.length) return null;
        const b = clone(body);
        if (b.messages[b.messages.length - 1].role !== 'assistant') return null;
        b.messages.pop();
        if (!b.messages.length) return null;
        return b;
      },
    });
  }
  list.push({
    id: 'lower-max-tokens', label: 'max_tokens 降到 256',
    note: '定位 max_tokens 超上限/超余额档位问题。',
    apply(body) {
      if (body.max_tokens == null || body.max_tokens <= 256) return null;
      const b = clone(body);
      b.max_tokens = 256;
      return b;
    },
  });
  list.push({
    id: 'no-stream', label: '关闭 stream',
    note: '定位流式链路问题：排除网关缓冲/断流。',
    apply(body) {
      if (!body.stream) return null;
      const b = clone(body);
      delete b.stream;
      delete b.stream_options;
      return b;
    },
  });
  list.push({
    id: 'no-tools', label: '去掉 tools',
    note: '定位工具定义引发的问题。',
    apply(body) {
      if (!body.tools) return null;
      const b = clone(body);
      delete b.tools;
      delete b.tool_choice;
      delete b.parallel_tool_calls;
      return b;
    },
  });
  list.push({
    id: 'convert-system', label: isAnthropic ? 'system 并入 user 首条' : 'system 改为独立字段',
    note: '定位 system 传递方式差异（有的网关只认其一）。',
    apply(body) {
      const b = clone(body);
      if (isAnthropic) {
        if (!b.system) return null;
        const sys = b.system; delete b.system;
        b.messages = [{ role: 'user', content: String(sys) }, ...(b.messages || [])];
      } else {
        const first = (b.messages || [])[0];
        if (!first || first.role !== 'system') return null;
        const sys = first.content;
        b.messages = b.messages.slice(1);
        b.system = sys;
      }
      return b;
    },
  });
  return list;
}

module.exports = {
  VERSION,
  WIRE_OPENAI,
  WIRE_ANTHROPIC,
  maskKey,
  maskHeaders,
  resolveUrl,
  resolveModelsUrl,
  validatePayload,
  buildRequest,
  createSSEParser,
  createStreamAggregator,
  approxTokens,
  parseErrorBody,
  diagnose,
  mutators,
};
