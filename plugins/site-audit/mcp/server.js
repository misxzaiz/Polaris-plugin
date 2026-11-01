#!/usr/bin/env node
'use strict';
/**
 * site-audit MCP Server —— 站点体检台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 site-audit.* 键空间命令投递。
 * 爬取执行与报告写入的唯一权威是后台服务（service/main.js）——MCP 只投递
 * 命令并等待回执，与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量（工具描述明示）：
 *   - 只对拥有授权的目标体检（自己的站/本机开发站/内网测试站）；
 *   - 服务端护栏（页数/时长/并发/单页体积上限、单任务互斥、可中止）兜底；
 *   - 默认遵守 robots.txt；无定时体检、无自动重爬：每次都是显式调用。
 *
 * 工具一览（6 个）：
 *   site_audit_run      发起一次整站体检并等待报告（默认 ≤150s；更长指引轮询）
 *   site_audit_status   实时进度 / 最近一次报告摘要
 *   site_audit_stop     中止当前体检（保留部分结果）
 *   site_audit_report   读取某次体检完整报告（缺省=最近一次）
 *   site_audit_issues   按类型/级别检索问题明细（分页）
 *   site_audit_history  体检历史列表
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/audit-core');

const SERVER_NAME = 'site-audit';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'site-audit.meta',
  cmd: 'site-audit.cmd',
  res: 'site-audit.res',
  latest: 'site-audit.latest',
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const MCP_RUN_WAIT_DEFAULT_MS = 150 * 1000;

// ── 命令投递（单槽信箱：写 cmd → 轮询 res 按 nonce 对齐）─────────────────────
let nonceCounter = 0;
async function sendCommand(action, payload, waitMs) {
  const nonce = `m${Date.now().toString(36)}-${++nonceCounter}`;
  await kv.kvSet(K.cmd, { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + (waitMs || 30000);
  let sawStale = false;
  while (Date.now() < deadline) {
    await sleep(1200);
    let res;
    try { res = await kv.kvGet(K.res); } catch (_) { continue; }
    if (res && res.nonce === nonce) {
      await kv.kvDel(K.res).catch(() => { /* 消费失败不影响结果读取 */ });
      return res.result || { ok: false, error: '回执为空' };
    }
    if (res && res.nonce) sawStale = true;
  }
  return {
    ok: false,
    pending: true,
    error: sawStale
      ? `命令已投递但 ${Math.round((waitMs || 30000) / 1000)}s 内未见回执（体检仍在后台进行）。用 site_audit_status 轮询。`
      : '命令已投递但服务无响应（服务可能未启动）。打开一次站点体检台面板可触发服务自举，稍后重试。',
  };
}

// ── 状态渲染 ────────────────────────────────────────────────────────────────
function renderLive(v) {
  const lines = [];
  lines.push(`体检进行中（auditId=${v.auditId}，来源 ${v.source}）：`);
  lines.push(`种子：${v.seed}`);
  lines.push(`范围：${(v.scopeHosts || []).join(' + ') || '锚定中'}`);
  lines.push(`阶段：${v.phase} · 已爬 ${v.pagesDone}/${v.maxPages} 页 · 队列 ${v.queueLen} · 资源 ${v.assetsDone} · 外链 ${v.externalDone}/${v.externalTotal || '?'} · 异常 ${v.errors} · ${v.elapsedS}s`);
  if (v.recentEvents && v.recentEvents.length) {
    lines.push('最近发现：');
    for (const e of v.recentEvents.slice(-5)) lines.push(`  · ${e.type} ${e.url}${e.detail ? `（${e.detail}）` : ''}`);
  }
  return lines.join('\n');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolRun(args) {
  const waitMs = Math.min(Math.max(Number(args.waitMs) || MCP_RUN_WAIT_DEFAULT_MS, 10000), 480000);
  const r = await sendCommand('run', {
    url: args.url,
    maxPages: args.maxPages,
    delayMs: args.delayMs,
    timeoutS: args.timeoutS,
    concurrency: args.concurrency,
    slowMs: args.slowMs,
    respectRobots: args.respectRobots,
    checkExternal: args.checkExternal,
    checkAssets: args.checkAssets,
  }, waitMs);
  if (r.ok && r.report) {
    if (r.fatal) {
      return err(`体检启动失败：${r.fatal}\n（目标不可达时报告仍会落库，可用 site_audit_report 查看）`);
    }
    return ok(`体检完成（auditId=${r.report.auditId}）：\n${core.renderReportText(r.report)}\n\n提示：需要某类问题的完整明细用 site_audit_issues；需要让用户看图形界面请提示打开「站点体检台」面板。`);
  }
  if (r.pending) {
    return ok(`${r.error}\n\n体检时长超过等待窗口属正常（页多/限速礼貌等待）。`);
  }
  if (r.busy) return err(`${r.error}\n\n可先用 site_audit_status 查看进度，或 site_audit_stop 中止后重试。`);
  return err(r.error || '体检失败');
}

async function toolStatus() {
  const r = await sendCommand('state', {}, 20000);
  if (!r.ok) return err(r.error || '状态读取失败');
  if (r.running) return ok(renderLive(r.running));
  if (r.latest) return ok(`当前空闲。最近一次报告：\n${core.renderReportText(r.latest)}`);
  return ok('当前空闲，且没有任何历史报告。用 site_audit_run 发起第一次体检（可先对内置试金石 http://127.0.0.1:<服务端口>/demo/ 验证工具链——端口见 site_audit_status 或体检台面板）。');
}

async function toolStop() {
  const r = await sendCommand('stop', {}, 20000);
  if (r.ok) return ok(`已发送中止指令（auditId=${r.auditId}），报告会以部分结果落库。`);
  return err(r.error || '中止失败');
}

async function toolHistory(args) {
  const r = await sendCommand('history', { limit: args.limit }, 20000);
  if (!r.ok) return err(r.error || '历史读取失败');
  const items = r.items || [];
  if (!items.length) return ok('暂无体检历史。用 site_audit_run 发起第一次体检。');
  const lines = items.map((x, i) => {
    const mark = x.aborted ? '⏹' : '✓';
    return `${i + 1}. ${mark} ${String(x.at || '').replace('T', ' ').slice(0, 16)} [auditId=${x.auditId}] ${x.seed} · ${x.pagesCrawled}页·${x.assetsChecked}资源·${x.externalChecked}外链 · ${x.durationMs}ms · 健康分 ${x.score} · 错误 ${x.errors}/警告 ${x.warns}`;
  });
  return ok(`最近 ${items.length} 次体检（新→旧）：\n${lines.join('\n')}\n\n用 site_audit_report {auditId} 看详情，site_audit_issues 检索问题明细。`);
}

async function toolReport(args) {
  const auditId = String(args.auditId || '');
  if (!auditId) {
    let latest = null;
    try { latest = await kv.kvGet(K.latest); } catch (_) { /* 桥不可达 */ }
    if (!latest) return ok('尚无报告。用 site_audit_run 发起一次体检，或指定 auditId。');
    return ok(`（最近一次报告，auditId=${latest.auditId}）\n${core.renderReportText(latest)}`);
  }
  const r = await sendCommand('report', { auditId }, 20000);
  if (r.ok && r.report) return ok(core.renderReportText(r.report));
  return err(r.error || `报告读取失败：${auditId}`);
}

async function toolIssues(args) {
  const r = await sendCommand('issues', {
    auditId: args.auditId,
    type: args.type,
    severity: args.severity,
    limit: args.limit,
  }, 20000);
  if (!r.ok) return err(r.error || '问题检索失败');
  const rows = r.items || [];
  if (!rows.length) {
    return ok(`没有匹配的问题（auditId=${r.auditId}，type=${args.type || '全部'}, severity=${args.severity || '全部'}）。报告问题总数 ${r.total}。可用 site_audit_report 看全貌。`);
  }
  const lines = rows.map((x, i) => `${i + 1}. [${x.severity === 'error' ? '错误' : x.severity === 'warn' ? '警告' : '提示'}] ${x.label} · ${x.url}${x.detail ? ` · ${x.detail}` : ''}${x.source && x.source !== x.url ? ` · 来源页 ${x.source}` : ''}`);
  const knownTypes = Object.keys(core.ISSUE_TYPES).join('/');
  return ok(`共 ${r.total} 个问题，以下是匹配的前 ${rows.length} 条：\n${lines.join('\n')}\n\n可用 type 过滤（${knownTypes}），severity 过滤（error/warn/info）。`);
}

// ── 工具注册（description 写「适用句式」）───────────────────────────────────
const tools = [
  {
    name: 'site_audit_run',
    description: '对指定网站发起一次整站体检（断链/重定向链/缺标题描述/重复标题/图片缺alt/混合内容/慢页面/robots与sitemap覆盖），返回 0-100 健康分与中文报告。适用于「帮我体检一下我的网站」「查查博客有没有死链」「发布前做个整站检查」。只对拥有授权的目标使用（自己的站点、本机/内网开发站）。不执行 JS、不支持登录后页面（SPA 站点结果可能只覆盖 shell，报告会注明）。默认遵守 robots.txt。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '种子 URL（http/https，整站从这页开始顺链接爬）' },
        maxPages: { type: 'integer', description: '最多爬取页数 5-5000，默认 500' },
        delayMs: { type: 'integer', description: '同 host 请求最小间隔毫秒 0-3000，默认 300（礼貌爬取）' },
        timeoutS: { type: 'integer', description: '单页超时秒数 2-30，默认 15' },
        concurrency: { type: 'integer', description: '并发数 1-12，默认 6' },
        slowMs: { type: 'integer', description: '慢页面阈值毫秒 200-20000，默认 2000' },
        respectRobots: { type: 'boolean', description: '是否遵守 robots.txt，默认 true' },
        checkExternal: { type: 'boolean', description: '是否核查外链存活（不深爬），默认 true' },
        checkAssets: { type: 'boolean', description: '是否核查图片/样式/脚本资源，默认 true' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 150000；大站超过该时长则提示轮询 site_audit_status）' },
      },
      required: ['url'],
    },
    call: toolRun,
  },
  {
    name: 'site_audit_status',
    description: '查看体检台当前状态：正在运行的体检实时进度（阶段/已爬页数/队列/最近发现的问题），或最近一次报告摘要。适用于「体检跑得怎么样了」「上次体检结果」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStatus,
  },
  {
    name: 'site_audit_stop',
    description: '中止当前正在进行的整站体检（已爬到的部分会保留成报告）。适用于「别爬了」「停下来」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStop,
  },
  {
    name: 'site_audit_report',
    description: '读取某次体检的完整报告（健康分/问题分组/最慢页面/外链失效域名/robots与sitemap覆盖）。缺省返回最近一次。适用于「那次体检的详情」「报告再给我看一遍」。',
    inputSchema: {
      type: 'object',
      properties: { auditId: { type: 'string', description: '体检 auditId（缺省=最近一次）' } },
    },
    call: toolReport,
  },
  {
    name: 'site_audit_issues',
    description: '按类型或级别检索某次体检的问题明细（如全部 404 页、所有缺 alt 的页面、所有慢页），带来源页与说明。适用于「把所有断链列出来」「哪些页面没有描述」「慢页面都有谁」。',
    inputSchema: {
      type: 'object',
      properties: {
        auditId: { type: 'string', description: '体检 auditId（缺省=最近一次）' },
        type: { type: 'string', description: '问题类型过滤（broken_page/broken_asset/broken_external/redirect_chain/redirect_loop/missing_title/title_length/missing_description/description_length/duplicate_title/duplicate_description/missing_alt/mixed_content/meta_refresh/noindex/canonical_multiple/canonical_offsite/missing_lang/h1_issues/slow_page/robots_blocked/sitemap_gap）' },
        severity: { type: 'string', description: '级别过滤：error/warn/info' },
        limit: { type: 'integer', description: '返回条数（默认 20，上限 100）' },
      },
    },
    call: toolIssues,
  },
  {
    name: 'site_audit_history',
    description: '列出最近体检历史（时间/种子/页数/健康分/错误警告数）。适用于「体检过哪些站」「改版前后对比是哪两次」。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '返回条数（默认 20，上限 30）' } },
    },
    call: toolHistory,
  },
];

// ── stdio JSON-RPC 骨架（协议数据只走 stdout，日志全走 stderr）────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function respondErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { respondErr(msg.id, -32602, `未知工具：${name}`); return; }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => respond(msg.id, err(`工具执行异常：${(e && e.message) || e}`)));
    return;
  }
  if (msg.method === 'ping') { respond(msg.id, {}); return; }
  // 未知请求忽略（保持骨架与宿主兼容）
}

log('info', `site-audit MCP server 启动（${SERVER_VERSION}）`);
