#!/usr/bin/env node
'use strict';
/**
 * server.js —— 会话记忆 MCP server（stdio JSON-RPC，零依赖）
 *
 * 把 AI 的 tools/call 翻译成对会话记忆数据面的操作：
 *   sift_search / sift_open_session → 命令信箱（cmd 键先写后等服务结果，服务持有索引）
 *   sift_timeline / sift_stats      → 直读 cap.kv（目录/统计键，服务离线也能用）
 *   sift_reindex                    → 命令信箱（异步触发，confirm 护栏，不等待完成）
 *
 * 协议纪律：stdout 只走 JSON-RPC，日志全走 stderr。
 * 启动参数（宿主注入）：node server.js {{appConfigDir}}（arg[2]）
 */

const core = require('../shared/sift-core.js');
const { createKvClient } = require('../shared/kvclient.js');

const VERSION = '0.1.0';
const PREFIX = 'sift';

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log: (level, msg) => process.stderr.write(`[time-sift:mcp:${level}] ${msg}\n`) });

// ── 工具定义（description 写「适用句式」，AI 靠它匹配用户意图）─────────────

const TOOLS = [
  {
    name: 'sift_search',
    description:
      '全文检索用户的历史 AI 会话（Polaris 对话 / session-v2 / Claude Code 原生 / ZCode）。' +
      '适用：「我之前是不是解决过 xxx」「找找我聊过 xx 的会话」「上次那个报错怎么修的来着」。' +
      '返回命中会话标题、时间与上下文片段；需要看完整上下文时用 sift_open_session。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词（支持中文分词与英文单词，可多词组合）' },
        source: { type: 'string', enum: ['polaris', 'v2', 'claude', 'zcode'], description: '限定来源（可选）' },
        days: { type: 'number', description: '只搜最近 N 天（可选）' },
        limit: { type: 'number', description: '返回条数上限，默认 12，最大 30' },
      },
      required: ['query'],
    },
  },
  {
    name: 'sift_open_session',
    description:
      '按 sid 打开一条历史会话，读取其对话内容（分页或围绕命中消息）。' +
      '适用：sift_search 结果里看到感兴趣会话后深入阅读；返回 user/assistant 交替的对话文本。',
    inputSchema: {
      type: 'object',
      properties: {
        sid: { type: 'string', description: '会话 id（来自 sift_search / sift_timeline 结果）' },
        around: { type: 'number', description: '围绕第几条消息展示（来自搜索结果 snippet.msgIndex，可选）' },
        offset: { type: 'number', description: '从头开始的偏移（不填 around 时生效）' },
        limit: { type: 'number', description: '读取消息条数，默认 30，最大 60' },
      },
      required: ['sid'],
    },
  },
  {
    name: 'sift_timeline',
    description:
      '按天列出历史会话（标题 + 时间 + 消息数）。' +
      '适用：「上周三我干了啥」「列一下这几天的会话」「我哪天折腾过 xxx」。直读本地索引键，服务离线也可用。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '具体日期 YYYY-MM-DD（可选，给了就只看这天）' },
        days: { type: 'number', description: '最近 N 天，默认 7（date 缺省时生效）' },
        source: { type: 'string', enum: ['polaris', 'v2', 'claude', 'zcode'], description: '限定来源（可选）' },
      },
    },
  },
  {
    name: 'sift_stats',
    description:
      '读会话记忆足迹统计：总会话/消息/散文量、活跃天数、各来源分布、token 覆盖口径、索引状态。' +
      '适用：「我和 AI 聊了多少」「会话记忆索引好了没」。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sift_reindex',
    description:
      '触发会话记忆全量重建索引（重活：重读全部数据源）。适用：索引状态异常/新装插件首次建索引失败后手动重建。' +
      '异步执行不等待完成，重建进度看 sift_stats 的 indexing 字段。危险度低但耗资源，需 confirm。',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: '确认为 true 才执行' },
      },
      required: ['confirm'],
    },
  },
];

// ── 信箱等待 ────────────────────────────────────────────────────────────────

function newNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function mailboxCall(op, payload, { deadlineMs = 20000 } = {}) {
  const nonce = newNonce();
  await kv.kvSet(`${PREFIX}.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const resultKey = `${PREFIX}.result.${nonce}`;
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    await sleep(800);
    const res = await kv.kvGet(resultKey);
    if (res && typeof res === 'object' && res.ok !== undefined) {
      kv.kvDel(resultKey).catch(() => {}); // 读后即清（读方自己的结果键）
      return res;
    }
  }
  return {
    ok: false,
    error: `等待服务响应超时（${deadlineMs}ms）。后台服务可能未运行或索引未就绪——去「会话记忆」面板的设置页看服务状态，或稍后重试。`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 直读路径（服务离线可用）────────────────────────────────────────────────

async function readCatalog() {
  const head = await kv.kvGet(`${PREFIX}.cat.head`);
  if (!head || !head.chunks) return [];
  const chunksByKey = {};
  await Promise.all(
    Array.from({ length: Math.min(Number(head.chunks) || 0, 40) }, async (_, i) => {
      chunksByKey[`${PREFIX}.cat.${i}`] = await kv.kvGet(`${PREFIX}.cat.${i}`);
    }),
  );
  return core.mergeCatalogChunks(head, chunksByKey);
}

function fmtSession(e) {
  const d = new Date(e.updatedAt || 0);
  const time = Number.isFinite(d.getTime()) && d.getTime() > 0 ? d.toISOString().slice(0, 16).replace('T', ' ') : '未知时间';
  return `- [${e.sid}] ${core.SOURCES.includes(e.source) ? e.source : '?'}｜${e.title}（${e.msgCount} 条消息，${time}）`;
}

async function runTimeline(args) {
  const entries = await readCatalog();
  if (!entries.length) return '索引还没有目录数据（服务可能还没完成首次扫描）。稍后再试，或看 sift_stats 的 indexing 状态。';
  let list = entries;
  if (args.source && core.SOURCES.includes(args.source)) list = list.filter((e) => e.source === args.source);
  if (args.date) {
    const at = Date.parse(String(args.date));
    if (!Number.isFinite(at)) return `日期无法解析：${args.date}（需要 YYYY-MM-DD）`;
    const dayKey = core.localDayKey(at);
    list = list.filter((e) => core.localDayKey(e.updatedAt) === dayKey);
  } else {
    const days = Number(args.days) > 0 ? Number(args.days) : 7;
    list = list.filter((e) => e.updatedAt >= Date.now() - days * 86400000);
  }
  if (!list.length) return '该时间范围内没有会话。';
  const groups = core.groupTimeline(list).slice(0, 21);
  const lines = [];
  for (const g of groups) {
    lines.push(`\n【${g.day}】`);
    for (const e of g.sessions.slice(0, 20)) lines.push(fmtSession(e));
    if (g.sessions.length > 20) lines.push(`… 当天还有 ${g.sessions.length - 20} 条（用 sift_search 缩小范围）`);
  }
  return `共 ${list.length} 条会话：\n${lines.join('\n')}`;
}

async function runStats() {
  const total = await kv.kvGet(`${PREFIX}.stats.total`);
  const meta = await kv.kvGet(`${PREFIX}.meta`);
  if (!total) {
    return meta
      ? `统计还没生成。索引状态：${JSON.stringify(meta.indexing || {})}；桥：${meta.degraded ? '不可达' : meta.bridge || '?'}。`
      : '统计还没生成：后台服务可能未运行（首次扫描由服务完成）。去面板设置页检查服务状态。';
  }
  const srcLines = Object.entries(total.bySource || {})
    .map(([s, v]) => `  - ${s}：${v.sessions} 会话 / ${v.messages} 消息`)
    .join('\n');
  const tk = total.tokens || {};
  const idx = meta && meta.indexing ? meta.indexing : {};
  return [
    `会话 ${total.sessions} 条｜消息 ${total.messages} 条｜散文 ${total.proseChars} 字符`,
    `活跃 ${total.activeDays} 天（${total.firstDay || '?'} ~ ${total.lastDay || '?'}）`,
    `来源分布：\n${srcLines}`,
    `token 口径（仅能取到的 ${tk.sessionsCovered || 0} 条会话）：输入 ${tk.input || 0} / 输出 ${tk.output || 0} / 缓存读 ${tk.cacheRead || 0}`,
    `索引：${idx.phase || 'idle'}（${idx.done || 0}/${idx.total || 4} 源）${idx.error ? `｜最近错误：${idx.error}` : ''}`,
  ].join('\n');
}

// ── 工具执行 ────────────────────────────────────────────────────────────────

function oneLine(s, n = 120) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

async function callTool(name, args) {
  if (name === 'sift_search') {
    if (!args.query || !String(args.query).trim()) return '需要 query 参数：要检索的关键词。';
    const res = await mailboxCall('search', {
      query: String(args.query),
      source: args.source,
      days: args.days,
      limit: args.limit,
    });
    if (!res.ok) return `检索失败：${res.error || (res.data && res.data.error) || '未知错误'}`;
    const d = res.data;
    if (d.error) return `检索失败：${d.error}`;
    if (!d.hits || !d.hits.length) {
      return `没有命中「${d.query}」。${d.relaxed ? '（已放宽为单条件匹配）' : ''}试试换关键词，或去掉 source/days 过滤。`;
    }
    const lines = d.hits.map((h) => {
      const t = new Date(h.updatedAt || 0);
      const time = Number.isFinite(t.getTime()) && t.getTime() > 0 ? t.toISOString().slice(0, 10) : '?';
      return `- [${h.sid}] ${h.source}｜${h.title}（${time}，命中 ${h.hitCount} 处）\n  ${oneLine(h.snippet && h.snippet.text, 200)}`;
    });
    return (
      `「${d.query}」命中 ${d.total} 个会话（扫描 ${d.scanned} 条候选），前 ${d.hits.length}：\n${lines.join('\n')}\n` +
      '用 sift_open_session 传 sid 深入某条；snippet.msgIndex 可作 around 参数定位上下文。'
    );
  }
  if (name === 'sift_open_session') {
    if (!args.sid) return '需要 sid 参数（来自 sift_search / sift_timeline 的结果）。';
    const res = await mailboxCall('open', {
      sid: String(args.sid),
      around: args.around,
      offset: args.offset,
      limit: args.limit,
      maxChars: 1200, // MCP 面向 AI，单消息收紧防上下文爆炸
    }, { deadlineMs: 25000 });
    if (!res.ok) return `打开失败：${res.error || '未知错误'}`;
    const d = res.data;
    if (d.error) return `打开失败：${d.error}`;
    const lines = d.messages.map((m) => `#${m.i} ${m.role === 'user' ? '用户' : 'AI'}：${m.text}`);
    return (
      `《${d.entry.title}》（${d.entry.source}，共 ${d.total} 条消息${d.truncated ? '，本次已按预算截断' : ''}）：\n\n${lines.join('\n\n')}`
    );
  }
  if (name === 'sift_timeline') return runTimeline(args);
  if (name === 'sift_stats') return runStats();
  if (name === 'sift_reindex') {
    if (args.confirm !== true) return 'reindex 需要显式 confirm:true（会重读全部数据源，耗时数分钟）。请先与用户确认。';
    const nonce = newNonce();
    await kv.kvSet(`${PREFIX}.cmd.reindex.${nonce}`, { op: 'reindex', nonce, confirm: true, at: Date.now() });
    return '重建已触发（异步执行，不阻塞）。重建期间搜索结果可能不全，进度看 sift_stats 的 indexing 字段（phase 回到 idle 即完成）。';
  }
  return { isError: true, text: `未知工具 ${name}` };
}

// ── JSON-RPC 骨架（2024-11-05 最小实现）────────────────────────────────────

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function errText(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  // eslint-disable-next-line no-cond-assign
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) handleLine(line).catch((e) => process.stderr.write(`[time-sift:mcp] handleLine 异常: ${e.message}\n`));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    return; // 非 JSON 行忽略
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'time-sift', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) {
    return; // 通知无响应
  }
  if (method === 'tools/list') {
    write({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      const out = await callTool(name, args);
      if (out && typeof out === 'object' && out.isError) write({ jsonrpc: '2.0', id, result: out });
      else write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(out) }], isError: false } });
    } catch (e) {
      write({ jsonrpc: '2.0', id, result: errText(`工具执行异常：${e.message}`) });
    }
    return;
  }
  if (id !== undefined) {
    write({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

process.stderr.write(`[time-sift:mcp] server v${VERSION} 启动（appConfigDir=${appConfigDir || '无'}）\n`);
