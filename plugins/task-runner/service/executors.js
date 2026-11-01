'use strict';
/**
 * executors.js —— 四类任务执行器（node 进程内，唯一接触网络/子进程的层）
 *
 *  - notify：纯记录（结果即提醒，面板/历史/AI 可见）
 *  - http：原生 fetch + SSRF 分级闸（默认拒私网，allowPrivate 显式放行）
 *  - ai：供应商直连非流式（openai-chat-completions / anthropic-messages 双协议，
 *        对齐 llm-probe 的 URL 归一口径）；apiKey 绝不进任何错误文本
 *  - command：spawn（powershell/cmd），超时击杀 + 输出截尾
 *
 * 每个执行器返回 { status:'ok'|'fail'|'timeout', summary, excerpt, detail }，
 * 网络故障/程序故障统一捕获成 fail（业务失败 AI 可读，进程异常由 main 兜底）。
 */
const { spawn } = require('child_process');
const core = require('../shared/exec-core');

const FETCH_BODY_CAP = 16 * 1024; // http 响应最多读 16KB（其余 cancel）
const OUTPUT_TAIL = 8 * 1024; // 命令输出保存尾部 8KB

// ── http ─────────────────────────────────────────────────────────────────────

async function readBodyCapped(res, cap) {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) return '';
  let received = '';
  const dec = new TextDecoder('utf-8', { stream: false });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += dec.decode(value, { stream: true });
      if (received.length >= cap) {
        try { reader.cancel(); } catch (_) { /* 已超限，cancel 失败无害 */ }
        return received.slice(0, cap);
      }
    }
  } catch (_) { /* 流中断：返回已读部分 */ }
  try { received += dec.decode(); } catch (_) { /* ignore */ }
  return received.slice(0, cap);
}

/** @returns {Promise<{status,summary,excerpt,detail}>} */
async function runHttp(payload, timeoutMs, fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  const priv = core.isPrivateUrl(payload.url);
  if (priv && !payload.allowPrivate) {
    return {
      status: 'fail',
      summary: '目标为私网/保留地址且未开启「允许私网」——为防 SSRF 默认拒绝',
      excerpt: '',
      detail: { url: payload.url },
    };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(1000, timeoutMs));
  const startedAt = Date.now();
  try {
    const res = await fetchFn(payload.url, {
      method: payload.method,
      headers: payload.headers && Object.keys(payload.headers).length ? payload.headers : undefined,
      body: payload.body || undefined,
      signal: ac.signal,
      redirect: 'follow',
    });
    const excerpt = await readBodyCapped(res, FETCH_BODY_CAP);
    const durationMs = Date.now() - startedAt;
    const ok2xx = res.status >= 200 && res.status < 300;
    return {
      status: ok2xx ? 'ok' : 'fail',
      summary: ok2xx
        ? `HTTP ${res.status} · ${durationMs}ms`
        : `HTTP ${res.status}（非 2xx）· ${durationMs}ms`,
      excerpt,
      detail: {
        url: payload.url,
        status: res.status,
        contentType: String(res.headers && res.headers.get ? res.headers.get('content-type') || '' : ''),
        durationMs,
      },
    };
  } catch (e) {
    const durationMs = Date.now() - startedAt;
    const aborted = e && (e.name === 'AbortError' || ac.signal.aborted);
    return {
      status: aborted ? 'timeout' : 'fail',
      summary: aborted ? `超时（>${timeoutMs}ms）` : `请求失败：${core.strLimit(e.message, 160)}`,
      excerpt: '',
      detail: { url: payload.url, durationMs },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── ai（供应商直连，非流式）─────────────────────────────────────────────────

/** baseUrl → 协议终点（对齐 llm-probe resolveUrls 的简化口径） */
function resolveEndpoint(baseUrl, wire) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('供应商 baseUrl 为空');
  if (wire === 'anthropic-messages') {
    if (/\/messages$/.test(raw)) return raw;
    if (/\/v\d+/.test(raw)) return raw + '/messages';
    return raw + '/v1/messages';
  }
  if (/\/(chat\/completions|completions)$/.test(raw)) return raw;
  if (/\/v\d+/.test(raw)) return raw + '/chat/completions';
  return raw + '/v1/chat/completions';
}

function extractAiText(wire, data) {
  if (!data || typeof data !== 'object') return '';
  if (wire === 'anthropic-messages') {
    const blocks = Array.isArray(data.content) ? data.content : [];
    return blocks.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('');
  }
  const ch = Array.isArray(data.choices) && data.choices[0];
  if (!ch) return '';
  const msg = ch.message || {};
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((b) => (b && b.text) || '').join('');
  return '';
}

/** @returns {Promise<{status,summary,excerpt,detail}>} */
async function runAi(payload, provider, timeoutMs, fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  if (!provider || typeof provider !== 'object') {
    return { status: 'fail', summary: '找不到任务引用的 AI 供应商（可能已删除），请在面板「设置 → AI 供应商」检查', excerpt: '', detail: {} };
  }
  const wire = provider.wire === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions';
  let endpoint;
  try {
    endpoint = resolveEndpoint(provider.baseUrl, wire);
  } catch (e) {
    return { status: 'fail', summary: `供应商配置错误：${e.message}`, excerpt: '', detail: {} };
  }
  const key = String(provider.apiKey || '');
  const headers = { 'Content-Type': 'application/json' };
  const messages = [];
  if (wire === 'anthropic-messages') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    if (payload.system) messages.push({ role: 'user', content: payload.prompt });
  } else {
    headers.Authorization = `Bearer ${key}`;
    if (payload.system) messages.push({ role: 'system', content: payload.system });
  }
  const body = wire === 'anthropic-messages'
    ? {
        model: provider.model, max_tokens: payload.maxTokens, stream: false,
        messages: [{ role: 'user', content: payload.prompt }],
        ...(payload.system ? { system: payload.system } : {}),
      }
    : {
        model: provider.model, max_tokens: payload.maxTokens, stream: false,
        messages: [...messages, { role: 'user', content: payload.prompt }],
      };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(1000, timeoutMs));
  const startedAt = Date.now();
  try {
    const res = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    const text = await readBodyCapped(res, 64 * 1024);
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      // 响应体可能回显请求片段——截断且只保留上游 message 字段，绝不透传鉴权头
      let upstream = '';
      try {
        const j = JSON.parse(text);
        upstream = String((j.error && (j.error.message || j.error.type)) || '').slice(0, 200);
      } catch (_) { /* 非 JSON 上游错误 */ }
      return {
        status: 'fail',
        summary: `供应商返回 HTTP ${res.status}（${durationMs}ms）${upstream ? '：' + upstream : ''}`,
        excerpt: '',
        detail: { endpoint, status: res.status, durationMs },
      };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return { status: 'fail', summary: '供应商返回非 JSON（检查 baseUrl 是否指向 API 根）', excerpt: '', detail: { endpoint, status: res.status, durationMs } };
    }
    const out = extractAiText(wire, data);
    const usage = data && data.usage ? { in: data.usage.input_tokens ?? data.usage.prompt_tokens, out: data.usage.output_tokens ?? data.usage.completion_tokens } : null;
    return {
      status: out ? 'ok' : 'fail',
      summary: out ? `AI 回复 ${out.length} 字 · ${durationMs}ms` : '供应商返回 200 但无文本内容',
      excerpt: out,
      detail: { endpoint, durationMs, usage },
    };
  } catch (e) {
    const durationMs = Date.now() - startedAt;
    const aborted = e && (e.name === 'AbortError' || ac.signal.aborted);
    return {
      status: aborted ? 'timeout' : 'fail',
      summary: aborted ? `超时（>${timeoutMs}ms）` : `请求失败：${core.strLimit(e.message, 160)}`,
      excerpt: '',
      detail: { endpoint, durationMs },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── command ──────────────────────────────────────────────────────────────────

/**
 * spawn 命令。powershell 用参数数组透传（无引号注入面）；cmd 用 cmd /d /s /c。
 * 超时先 kill，Windows 下再 taskkill 树杀（best-effort，不阻塞结果）。
 */
function runCommand(payload, timeoutMs) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    let child;
    if (payload.shell === 'cmd') {
      const shellExe = isWin ? 'cmd.exe' : '/bin/sh';
      const args = isWin ? ['/d', '/s', '/c', payload.command] : ['-c', payload.command];
      child = spawn(shellExe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      if (isWin) {
        child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', payload.command], {
          windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        child = spawn('/bin/sh', ['-c', payload.command], { stdio: ['ignore', 'pipe', 'pipe'] });
      }
    }
    let out = '';
    let errText = '';
    let settled = false;
    let timedOut = false;
    const startedAt = Date.now();

    const killTree = () => {
      try { child.kill(); } catch (_) { /* ignore */ }
      if (isWin && child.pid) {
        try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch (_) { /* best-effort */ }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, Math.max(1000, timeoutMs));

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const combined = (out + (errText ? `\n[stderr]\n${errText}` : '')).trim();
      const status = timedOut ? 'timeout' : exitCode === 0 ? 'ok' : 'fail';
      resolve({
        status,
        summary: timedOut
          ? `超时（>${timeoutMs}ms）已终止`
          : exitCode === 0
            ? `退出码 0 · ${Date.now() - startedAt}ms`
            : `退出码 ${exitCode == null ? '?' : exitCode}${signal ? `（signal ${signal}）` : ''}`,
        excerpt: core.tailBytes(combined, OUTPUT_TAIL),
        detail: { shell: payload.shell, exitCode, durationMs: Date.now() - startedAt },
      });
    };

    child.stdout.on('data', (c) => {
      if (out.length < OUTPUT_TAIL * 2) out += String(c);
    });
    child.stderr.on('data', (c) => {
      if (errText.length < OUTPUT_TAIL) errText += String(c);
    });
    child.on('error', (e) => {
      errText += `\n[spawn] ${e.message}`;
      finish(-1, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

// ── notify ───────────────────────────────────────────────────────────────────

const SUMMARY_LIMIT = 200;

function runNotify(payload) {
  return Promise.resolve({
    status: 'ok',
    summary: core.strLimit(payload.message, SUMMARY_LIMIT),
    excerpt: payload.message,
    detail: {},
  });
}

// ── 分发 ─────────────────────────────────────────────────────────────────────

/**
 * @param job 归一化任务
 * @param ctx {settings, providers, fetchImpl?}
 */
async function executeJob(job, ctx) {
  const s = ctx.settings;
  try {
    if (job.type === 'notify') return await runNotify(job.payload);
    if (job.type === 'http') return await runHttp(job.payload, s.timeoutHttpSec * 1000, ctx.fetchImpl);
    if (job.type === 'ai') {
      const provider = (ctx.providers || []).find((p) => p && p.id === job.payload.providerId);
      return await runAi(job.payload, provider, s.timeoutAiSec * 1000, ctx.fetchImpl);
    }
    if (job.type === 'command') return await runCommand(job.payload, s.timeoutCommandSec * 1000);
    return { status: 'fail', summary: `未知任务类型 ${job.type}`, excerpt: '', detail: {} };
  } catch (e) {
    return { status: 'fail', summary: `执行器异常：${core.strLimit(e.message, 160)}`, excerpt: '', detail: {} };
  }
}

module.exports = {
  executeJob,
  runHttp,
  runAi,
  runCommand,
  runNotify,
  resolveEndpoint,
  extractAiText,
  readBodyCapped,
  FETCH_BODY_CAP,
  OUTPUT_TAIL,
};
