#!/usr/bin/env node
'use strict';
/**
 * cron-lens MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。解析引擎 shared/cron-core.js（单一权威）。
 * 纯本地零外联零 kv，无宿主时工具照常可用。
 *
 * 三工具（前缀 cron_lens_）：
 *   explain  解析 + 中文逐字段解释 + 坑警示（OR 语义/永不触发/缩写歧义）
 *   next     未来 N 次触发时刻预报（固定偏移墙钟，支持 epoch/墙钟/ISO 三种 from）
 *   match    给定时刻逐字段命中诊断（为什么没触发：首因字段 + 期望值）
 */
const core = require('../shared/cron-core');

const SERVER_NAME = 'cron-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const TZ_DESC = '时区偏移分钟数，东正西负（UTC+8=480，UTC=0）。缺省 0；无时区字样的墙钟时间按此偏移解释';

const tools = [
  {
    name: 'cron_lens_explain',
    description: '解析 cron 表达式并中文逐字段解释：每个字段的语义、展开值、等价别名，并做坑检测——日与周同时受限的「或」语义警示（vixie 与 Quartz 相反）、永不触发（如 2 月 30 日）、仅闰年触发、*/n 起点漂移、秒字段误粘（6 字段）、? 归一、7=0 归一。写定时任务（task-runner/crontab/CI）前先用它校验。',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'cron 表达式（5 字段标准，或 6 字段含秒；支持 @hourly 等别名）' } },
      required: ['expression'],
    },
    async call(args) {
      const parsed = core.parseCron(args && args.expression);
      if (!parsed.ok) return err(parsed.error);
      return ok(core.renderExplain(parsed));
    },
  },
  {
    name: 'cron_lens_next',
    description: '计算 cron 表达式未来 N 次触发时刻（含星期与 epoch 毫秒），用于回答「这个表达式下次什么时候跑」「间隔是不是 15 分钟」。vixie 语义（日/周同时受限按或匹配），月长/闰年敏感（2 月 29 自动落闰年）。',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'cron 表达式' },
        from: { type: 'string', description: '起点：epoch 毫秒/秒、YYYY-MM-DD HH:mm(:ss)（按 tzOffsetMinutes 墙钟解释）、或带 Z/±HH:MM 的 ISO 8601。缺省=现在' },
        count: { type: 'number', description: '次数，缺省 5，上限 50' },
        tzOffsetMinutes: { type: 'number', description: TZ_DESC },
      },
      required: ['expression'],
    },
    async call(args) {
      const parsed = core.parseCron(args && args.expression);
      if (!parsed.ok) return err(parsed.error);
      const tz = Number.isFinite(args && args.tzOffsetMinutes) ? args.tzOffsetMinutes : 0;
      const from = core.parseFromInput(args && args.from, tz);
      if (from.error) return err(from.error);
      const r = core.renderNext(parsed, from.ms, args && args.count, tz);
      if (!r.ok) return err(r.error || '计算失败');
      const warns = parsed.warnings.filter((w) => w.level === 'warn');
      let head = '';
      if (warns.length) head = `⚠ 该表达式有 ${warns.length} 条语义警示（explain 工具看全量）：${warns[0].msg}\n\n`;
      return ok(head + r.text);
    },
  },
  {
    name: 'cron_lens_match',
    description: '诊断给定时刻是否命中 cron 表达式：逐字段列出「实际值 vs 期望集合」，未命中时给出首因字段。排查「为什么这个时间没触发/多触发了」类问题。',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'cron 表达式' },
        at: { type: 'array', description: '待诊断时刻数组（1-20 个），格式同 from：epoch、YYYY-MM-DD HH:mm(:ss) 或 ISO', items: { type: 'string' } },
        tzOffsetMinutes: { type: 'number', description: TZ_DESC },
      },
      required: ['expression', 'at'],
    },
    async call(args) {
      const parsed = core.parseCron(args && args.expression);
      if (!parsed.ok) return err(parsed.error);
      const at = args && args.at;
      if (!Array.isArray(at) || at.length === 0) return err('at 须为非空数组（1-20 个时刻）');
      if (at.length > 20) return err('at 一次最多 20 个时刻');
      const tz = Number.isFinite(args && args.tzOffsetMinutes) ? args.tzOffsetMinutes : 0;
      const lines = [`表达式：${parsed.normalized}（${core.tzTag(tz)}）`];
      let anyMiss = false;
      for (const item of at) {
        const t = core.parseFromInput(item, tz);
        if (t.error) return err(t.error);
        const m = core.matchesAt(parsed, t.ms, tz);
        if (!m.match) anyMiss = true;
        const bad = m.checks.filter((c) => !c.ok);
        const reason = m.match ? '命中' : `未命中：首因「${m.firstMismatch}」——${bad.map((c) => `${c.label}实际 ${c.value}，期望 ${c.expect}`).join('；')}`;
        lines.push(`  ${m.wallText}（${core.weekdayCn(t.ms + tz * 60000)}）→ ${reason}`);
      }
      if (anyMiss) {
        const bothR = parsed.domRestricted && parsed.dowRestricted;
        lines.push(`注：判定按 vixie 语义${bothR ? '（日与周同时受限=「或」：任一命中即触发）' : ''}；未命中的时刻可对照期望集合修正表达式。`);
      }
      return ok(lines.join('\n'));
    },
  },
];

// ── stdio JSON-RPC 接线 ────────────────────────────────────────────────────

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地解析，无宿主依赖）`);
