'use strict';
/**
 * core.js —— 长连接调试台纯函数层（零依赖，同构 CJS）
 *
 * 被 service/main.js（require）、mcp/server.js（require）、
 * 面板 src/model.ts（esbuild 打包进 bundle）与 test/（node --test）四方共用，
 * 保证 SSE 解析、掩码、统计、投影的口径全端一致（改这里 = 全端生效）。
 *
 * 设计不变量：
 *  - 本文件禁止引入任何 Node 专属 API（fs/net/crypto…），必须能在浏览器跑；
 *  - 所有「可能带敏感信息的出站投影」必经 maskHeaders / projectSessionForKv；
 *  - 解析器只吞文本、永不抛错——坏输入降级为 raw 事件，调试台不允许解析器自己成为故障点。
 */

// ── SSE 增量解析器（WHATWG text/event-stream 子集，宽容模式）─────────────────

/**
 * 创建增量 SSE 解析器。用法：
 *   const p = createSseParser();
 *   const events = p.push(chunkText);   // 本次喂入产出的完整事件
 *   const tail = p.flush();             // 流结束时调用，产出悬挂中的事件（宽容：也派发）
 *
 * 事件形状：{ event, id, retry, data, raw }
 *  - data 为多行 data: 以 \n join（规范化后）；无 data 行的事件按规范跳过（返回 []），
 *    flush() 时为诊断价值派发为 data:''（标注 raw），不静默吞。
 *  - raw 保留产生该事件的原始文本（规范化换行后），供调试视图。
 *  - ':' 开头的注释行（如心跳 ": ping"）按规范忽略，但计数进 comments，
 *    供「服务器还活着但没发事件」的诊断。
 */
function createSseParser() {
  let buf = '';
  let cur = { event: null, id: null, retry: null, dataLines: [], rawLines: [] };
  let comments = 0;

  function dispatch(force) {
    const raw = cur.rawLines.join('\n');
    if (cur.dataLines.length === 0) {
      if (!force) return null; // 规范：无 data 的完整事件块不派发
      if (!raw.trim()) return null; // flush 时也纯空，跳过
      // 宽容派发：只有 event/id/retry 没有 data —— 诊断价值优先
      return { event: cur.event, id: cur.id, retry: cur.retry, data: '', raw, partial: true };
    }
    const ev = {
      event: cur.event,
      id: cur.id,
      retry: cur.retry,
      data: cur.dataLines.join('\n'),
      raw,
    };
    return ev;
  }

  function resetCur() { cur = { event: null, id: null, retry: null, dataLines: [], rawLines: [] }; }

  function processLine(line) {
    cur.rawLines.push(line);
    if (line === '') {
      const ev = dispatch(false);
      resetCur();
      return ev;
    }
    if (line.startsWith(':')) { comments += 1; return null; } // 注释/心跳
    let field = line;
    let value = '';
    const colon = line.indexOf(':');
    if (colon >= 0) {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1); // 规范：剥一个可选空格
    }
    if (field === 'data') cur.dataLines.push(value);
    else if (field === 'event') cur.event = value;
    else if (field === 'id') cur.id = value;
    else if (field === 'retry') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n >= 0) cur.retry = n;
    }
    // 未知字段按规范忽略
    return null;
  }

  return {
    /** 喂入一段文本（增量），返回本次产出的完整事件数组 */
    push(chunk) {
      if (typeof chunk !== 'string' || chunk === '') return [];
      // 规范：剥一个前导 BOM（只剥一次，但宽容起见每次 push 都剥也无害——BOM 只会出现在开头）
      if (buf === '' && chunk.charCodeAt(0) === 0xFEFF) chunk = chunk.slice(1);
      buf += chunk;
      // 规范化 \r\n 与裸 \r → \n（行缓冲按 \n 切；尾部的裸 \r 可能是 \r\n 的前半，须留到下轮）
      buf = buf.replace(/\r\n/g, '\n').replace(/\r(?!\n)/g, '\n');
      const out = [];
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const ev = processLine(line);
        if (ev) out.push(ev);
      }
      return out;
    },
    /** 流结束时调用：EOF 视为行终止（WHATWG 规范）——先处理残留行，再宽容派发悬挂块 */
    flush() {
      const out = [];
      if (buf !== '') {
        const line = buf;
        buf = '';
        const ev = processLine(line);
        if (ev) out.push(ev);
      }
      const ev2 = dispatch(true);
      if (ev2) out.push(ev2);
      resetCur();
      return out;
    },
    /** 累计的注释/心跳行数（诊断：服务器活着但没事件） */
    comments: () => comments,
    /** 未消费的缓冲（诊断） */
    pending: () => buf,
  };
}

/** content-type 是否为 event-stream */
function isEventStreamContentType(contentType) {
  return typeof contentType === 'string' && /text\/event-stream/i.test(contentType);
}

// ── 敏感信息掩码（落 kv / MCP 输出前必经；内存中的完整值永不外泄）────────────

const SENSITIVE_HEADER_EXACT = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-api-key', 'api-key', 'apikey', 'x-auth-token', 'x-csrf-token', 'x-xsrf-token',
  'x-session-token', 'x-access-token', 'x-webhook-token', 'x-amz-authorization',
]);

/** 头名是否敏感：精确表 + 兜底正则（secret/token/password/credential/auth/key…） */
function isSensitiveHeaderName(name) {
  const n = String(name || '').toLowerCase();
  if (SENSITIVE_HEADER_EXACT.has(n)) return true;
  return /(secret|token|password|passwd|credential|signature|authorization|api[-_]?key|auth)/i.test(n);
}

/** 值掩码：≤4 位全掩，其余 ****+尾4（与 api-bench/llm-probe 同款口径） */
function maskValue(v) {
  const s = String(v == null ? '' : v);
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

/**
 * 掩码一组头。enabled=false 时原样返回（浅拷贝）。
 * 未启用掩码时仍剥离天然危险的整值头（cookie/set-cookie/authorization）——
 * 调试台自己兜底，不允许「关掩码」变成「裸奔」。
 */
function maskHeaders(headers, enabled) {
  const out = {};
  const src = headers && typeof headers === 'object' ? headers : {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    const name = String(k).toLowerCase();
    if (enabled === false) {
      if (name === 'cookie' || name === 'set-cookie' || name === 'authorization') {
        out[k] = maskValue(v);
      } else {
        out[k] = v;
      }
    } else {
      out[k] = isSensitiveHeaderName(k) ? maskValue(v) : v;
    }
  }
  return out;
}

// ── 文本截断 / 统计 / 格式化 ────────────────────────────────────────────────

/** 截断文本到 cap 字符，返回 {text, truncated, size}（size=原字符串长度） */
function truncateText(s, cap) {
  const str = s == null ? '' : String(s);
  const size = str.length;
  if (size <= cap) return { text: str, truncated: false, size };
  return { text: str.slice(0, cap) + `…[截断 ${size - cap} 字符]`, truncated: true, size };
}

/** 时间间隔数组 → 统计（ms）：{count,min,median,mean,p95,max}；空数组返回 null */
function gapStats(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) return null;
  const arr = [...gaps].sort((a, b) => a - b);
  const n = arr.length;
  const sum = arr.reduce((s, v) => s + v, 0);
  const pick = (q) => arr[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  return {
    count: n,
    min: arr[0],
    median: pick(0.5),
    mean: Math.round(sum / n),
    p95: pick(0.95),
    max: arr[n - 1],
  };
}

/** 字节数格式化 */
function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(2)} MB`;
}

/** 毫秒格式化（<1s 显示 ms，否则 s） */
function formatMs(ms) {
  const v = Number(ms) || 0;
  if (v < 1000) return `${Math.round(v)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

// ── WebSocket 关闭码表（RFC 6455 + 常见私有段）──────────────────────────────

const WS_CLOSE_CODES = {
  1000: '正常关闭',
  1001: '端点离开（页面关闭/服务器下线）',
  1002: '协议错误',
  1003: '收到不支持的数据类型',
  1005: '未提供状态码（应答方未带 code）',
  1006: '异常关闭（连接未完成关闭握手——网络中断/进程被杀/代理掐断的最常见码）',
  1007: '消息载荷非合法 UTF-8',
  1008: '策略违规（常见于鉴权失败）',
  1009: '消息过大',
  1010: '客户端要求扩展但服务器未同意',
  1011: '服务器内部错误',
  1012: '服务器重启',
  1013: '稍后再试（服务器过载）',
  1014: '坏网关（上游无效）',
  1015: 'TLS 握手失败',
};

function wsCloseCodeName(code) {
  if (code == null) return '未携带状态码';
  if (WS_CLOSE_CODES[code]) return WS_CLOSE_CODES[code];
  if (code >= 3000 && code <= 4999) return '注册/私有用途码（看服务器文档）';
  if (code >= 4000 && code <= 4999) return '私有用途码（应用自定义）';
  return '未知状态码';
}

// ── 会话投影（内存会话 → kv/MCP 安全形状）────────────────────────────────────

const FRAME_PUBLIC_KEYS = [
  'seq', 'ts', 'gapMs', 'dir', 'kind', 'size', 'text', 'b64', 'truncated',
  'code', 'reason', 'latencyMs', 'rttMs', 'level', 'message', 'event', 'id', 'httpStatus',
];

/**
 * 帧出站投影：字段白名单 + 文本体截断。directionFilter 可选 'in'|'out'|'note'。
 * 本函数是「帧离开服务进程」的唯一出口（kv transcript / MCP transcript 共用）。
 */
function projectFrame(frame, bodyCap) {
  const out = {};
  for (const k of FRAME_PUBLIC_KEYS) {
    if (frame[k] !== undefined) out[k] = frame[k];
  }
  const cap = bodyCap != null ? bodyCap : 4096;
  if (typeof out.text === 'string') {
    const t = truncateText(out.text, cap);
    out.text = t.text;
    if (t.truncated) out.truncated = true;
  }
  if (typeof out.b64 === 'string' && out.b64.length > cap) {
    out.b64 = out.b64.slice(0, cap) + '…[b64 截断]';
    out.truncated = true;
  }
  return out;
}

/**
 * 会话出站投影（落 kv transcript / MCP）：
 * - 掩码请求头与握手响应头（maskHeaders 开关透传）；
 * - 帧白名单投影 + 体截断；
 * - tail 取尾部 N 帧（保留 seq 原值，方便对齐游标）。
 */
function projectSessionForKv(session, opts) {
  const o = opts || {};
  const bodyCap = o.bodyCap != null ? o.bodyCap : 2048;
  const tail = o.tail != null ? o.tail : 200;
  const frames = Array.isArray(session.frames) ? session.frames.slice(-tail) : [];
  return {
    id: session.id,
    kind: session.kind,
    url: session.url,
    title: session.title || '',
    state: session.state,
    createdAt: session.createdAt,
    openAt: session.openAt || null,
    closedAt: session.closedAt || null,
    closedReason: session.closedReason || '',
    request: {
      method: session.request && session.request.method,
      url: session.url,
      headers: maskHeaders(session.request && session.request.headers, o.maskHeaders !== false),
      subprotocols: (session.request && session.request.subprotocols) || [],
      pingIntervalSec: (session.request && session.request.pingIntervalSec) || 0,
      body: typeof (session.request && session.request.body) === 'string'
        ? truncateText(session.request.body, bodyCap).text
        : undefined,
    },
    handshake: session.handshake
      ? {
        ok: session.handshake.ok,
        httpStatus: session.handshake.httpStatus,
        statusText: session.handshake.statusText,
        latencyMs: session.handshake.latencyMs,
        headers: maskHeaders(session.handshake.headers, o.maskHeaders !== false),
        error: session.handshake.error || '',
      }
      : null,
    counters: session.counters || {},
    stats: session.stats || null,
    frameCount: session.nextSeq || 0,
    frames: frames.map((f) => projectFrame(f, bodyCap)),
  };
}

/** 会话摘要（列表/索引用，无帧无头） */
function sessionSummary(session) {
  return {
    id: session.id,
    kind: session.kind,
    url: session.url,
    title: session.title || '',
    state: session.state,
    createdAt: session.createdAt,
    openAt: session.openAt || null,
    closedAt: session.closedAt || null,
    closedReason: session.closedReason || '',
    frameCount: session.nextSeq || 0,
    counters: session.counters || {},
    stats: session.stats || null,
  };
}

/** 简短 id：时间戳36进制 + 随机段（无 crypto 依赖，纯函数层可测） */
function shortId(rand) {
  const r = typeof rand === 'function' ? rand : Math.random;
  return `${Date.now().toString(36)}${Math.floor(r() * 1296).toString(36).padStart(2, '0')}`;
}

module.exports = {
  createSseParser,
  isEventStreamContentType,
  SENSITIVE_HEADER_EXACT,
  isSensitiveHeaderName,
  maskValue,
  maskHeaders,
  truncateText,
  gapStats,
  formatBytes,
  formatMs,
  WS_CLOSE_CODES,
  wsCloseCodeName,
  FRAME_PUBLIC_KEYS,
  projectFrame,
  projectSessionForKv,
  sessionSummary,
  shortId,
};
