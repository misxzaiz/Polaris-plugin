#!/usr/bin/env node
'use strict';
/**
 * keyscan MCP Server —— 密钥扫描台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 keyscan.* 键空间操作 + 扫描命令投递。
 * 扫描执行与结果写入的唯一权威是后台服务（service/main.js）——MCP 只投递
 * 命令并等待结果，不自 行扫描，与面板共享同一事实库（cap.kv）。
 *
 * 安全设计：所有面向 AI 的返回（预览/上下文/报告）都来自服务落 kv 的
 * 掩码形态——完整密钥值对 MCP 同样不可见（掩码不变量，见 shared/scan-core.js）。
 *
 * 工具一览（5 个）：
 *   keyscan_scan     对指定目录发起扫描（等待完成或超时指引）
 *   keyscan_findings 读最近/指定扫描的发现列表（可按严重度/规则/关键字过滤）
 *   keyscan_status   服务状态 + 最近扫描摘要 + 历史
 *   keyscan_ignore   标记/取消误报（指纹级白名单）
 *   keyscan_rules    列出内置规则（能力说明）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现（env → anchor → config → 扫描）。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createKvClient } = require('../service/kvclient');
const core = require('../shared/scan-core');

const SERVER_NAME = 'keyscan';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'keyscan.meta',
  latest: 'keyscan.latest',
  history: 'keyscan.history',
  ignore: 'keyscan.ignore',
  scan: (id) => `keyscan.scan.${id}`,
  find: (id, n) => `keyscan.find.${id}.${n}`,
  cmdScan: (nonce) => `keyscan.cmd.scan.${nonce}`,
  result: (nonce) => `keyscan.result.${nonce}`,
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
function oneLine(s, n = 120) {
  const s2 = String(s || '').replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
}

const SEV_CN = { critical: '🔴严重', high: '🟠高', medium: '🟡中' };

// ── 数据装载 ────────────────────────────────────────────────────────────────
async function loadScanWithFindings(scanId) {
  const record = await kv.kvGet(K.scan(scanId)).catch(() => null);
  if (!record || typeof record !== 'object') return { error: `扫描记录 ${scanId} 不存在或已被清理（只保留最近 5 份）` };
  if (record.status === 'running') return { running: true, record };
  let findings = [];
  for (let n = 0; n < 400; n++) {
    const chunk = await kv.kvGet(K.find(scanId, n)).catch(() => null);
    if (!chunk || !Array.isArray(chunk) || !chunk.length) break;
    findings.push(...chunk);
    if (findings.length > 20000) break; // 读取保护
  }
  return { record, findings };
}

async function latestScanOrErr() {
  const latest = await kv.kvGet(K.latest).catch(() => null);
  if (!latest || !latest.id) {
    return { error: '还没有任何扫描记录：请先用 keyscan_scan 对某个目录发起扫描（或在面板「扫描」Tab 操作）。' };
  }
  return { latest };
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolScan(args) {
  const root = String(args.path || '').trim();
  if (!root) return err('缺少 path 参数：要扫描的目录绝对路径，例如 D:\\work\\my-project 或 /home/me/my-project。');
  let stat;
  try { stat = fs.statSync(root); } catch (_) { return err(`目录不存在或不可访问：${root}`); }
  if (!stat.isDirectory()) return err(`${root} 不是目录。请给一个目录路径。`);

  const meta = await kv.kvGet(K.meta).catch(() => null);
  if (meta && meta.scanning && meta.scanning.id) {
    // 心跳里 scanning 可能是僵尸态（服务异常中断没清）——核实扫描记录，done/failed 即视为空闲
    const rec = await kv.kvGet(K.scan(meta.scanning.id)).catch(() => null);
    const active = rec && rec.status === 'running';
    if (active) {
      return err(`已有扫描在进行中（${oneLine(meta.scanning.root, 60)}）。等它完成后再发起新扫描，或用 keyscan_status 查看进度。`);
    }
  }

  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await kv.kvSet(K.cmdScan(nonce), { root, at: Date.now(), from: 'mcp' });
  log('info', `已投递扫描命令 nonce=${nonce} root=${root}`);

  // 等待结果（服务消费命令→扫描→写结果键）；大目录可能超 90s，届时给指引而非报错
  const deadline = Date.now() + 90 * 1000;
  while (Date.now() < deadline) {
    await sleep(1200);
    const r = await kv.kvGet(K.result(nonce)).catch(() => null);
    if (r) {
      await kv.kvDel(K.result(nonce)).catch(() => {});
      if (!r.ok) return err(`扫描失败：${r.error || '未知错误'}`);
      const c = r.counts || {}; const nw = r.new || {};
      const lines = [
        `扫描完成：${root}`,
        `文件 ${r.files} 个，用时 ${Math.round((r.durationMs || 0) / 1000)}s${r.truncated ? '（结果被截断，未扫全）' : ''}`,
        `发现 ${r.findingCount} 处疑似密钥：${SEV_CN.critical} ${c.critical || 0} ｜ ${SEV_CN.high} ${c.high || 0} ｜ ${SEV_CN.medium} ${c.medium || 0}`,
        (r.findingCount > 0) ? `新增（相对上次基线）：${nw.newCount || 0} 处（严重 ${nw.newCritical || 0} / 高 ${nw.newHigh || 0}）` : '与上次基线相比无新增。',
        r.findingCount > 0 ? '用 keyscan_findings 查看明细（值已掩码，完整值在被扫文件里）。' : '未发现疑似密钥。',
      ];
      return ok(lines.join('\n'));
    }
  }
  return ok(`扫描已发起（root=${root}），90 秒内尚未完成——大目录属正常。稍后用 keyscan_status 或 keyscan_findings 查询进度与结果。`);
}

async function toolFindings(args) {
  const scanId = args.scanId;
  let targetId = scanId;
  if (!targetId) {
    const r = await latestScanOrErr();
    if (r.error) return err(r.error);
    targetId = r.latest.id;
  }
  const loaded = await loadScanWithFindings(String(targetId));
  if (loaded.error) return err(loaded.error);
  if (loaded.running) return ok(`扫描 ${targetId} 正在进行（已扫 ${loaded.record.progress?.files ?? 0} 文件，暂见 ${loaded.record.progress?.findings ?? 0} 候选）。稍后再查。`);

  let list = loaded.findings;
  const before = list.length;
  list = core.applyIgnores(list, await kv.kvGet(K.ignore).catch(() => null));
  const severity = args.severity && SEV_CN[args.severity] ? args.severity : null;
  if (severity) list = list.filter((f) => f.sev === severity);
  if (args.rule) list = list.filter((f) => f.rule === String(args.rule));
  if (args.search) {
    const s = String(args.search).toLowerCase();
    list = list.filter((f) => (f.file || '').toLowerCase().includes(s) || (f.ctx || '').toLowerCase().includes(s));
  }
  const limit = Math.min(Number(args.limit) > 0 ? Number(args.limit) : 20, 60);
  const shown = list.slice(0, limit);

  if (!shown.length) {
    return ok(before === 0
      ? '该扫描没有发现疑似密钥（或已被忽略表全部过滤）。'
      : `过滤后 0 条（过滤前 ${before} 条）。放宽 severity/rule/search 再试。`);
  }

  const c = core.countSeverities(list);
  const lines = [
    `扫描 ${targetId}（${loaded.record.root}）共 ${list.length} 条命中（🔴${c.critical}/🟠${c.high}/🟡${c.medium}）${before !== list.length ? `，忽略表滤掉 ${before - list.length} 条` : ''}，显示前 ${shown.length} 条：`,
    '',
    ...shown.map((f, i) => {
      const occ = f.count > 1 ? `（出现 ${f.count} 次，首见 ${f.firstFile || (f.occurrences[0] || {}).file}）` : '';
      const loc = f.occurrences && f.occurrences[0] ? `${f.occurrences[0].file}:${f.occurrences[0].line}` : `${f.file}:${f.line}`;
      return `${i + 1}. [${SEV_CN[f.sev] || f.sev}] ${f.rule} ｜ ${loc}${occ}\n   预览 ${f.preview} ｜ 上下文 ${oneLine(f.ctx, 100)}\n   指纹 ${f.fp}`;
    }),
    '',
    `注意：值已掩码（前4后2）。完整值在被扫文件中；确认后按规则说明里的建议轮换。`,
    '误报？用 keyscan_ignore 记住指纹。',
  ];
  return ok(lines.join('\n'));
}

async function toolStatus() {
  const meta = await kv.kvGet(K.meta).catch(() => null);
  const latest = await kv.kvGet(K.latest).catch(() => null);
  const history = await kv.kvGet(K.history).catch(() => null);
  const lines = [];
  if (!meta) {
    return err('密钥扫描台服务没有心跳：后台服务可能未运行。去 Polaris 设置→插件→密钥扫描台 检查服务状态，或在面板「设置」Tab 一键启动。');
  }
  const age = meta.lastTickAt ? Math.round((Date.now() - meta.lastTickAt) / 1000) : Infinity;
  lines.push(`服务 v${meta.version || '?'} 心跳 ${age}s 前${meta.degraded ? '（桥降级：' + (meta.lastBridgeErr || '未知') + '）' : ''}，内置规则 ${meta.rules || core.RULES.length} 条`);
  if (meta.scanning) lines.push(`扫描进行中：${meta.scanning.id} ← ${oneLine(meta.scanning.root, 80)}`);
  if (latest) {
    const c = latest.counts || {}; const nw = latest.new || {};
    lines.push(`最近扫描 ${latest.id}（${new Date(latest.at).toLocaleString()}）← ${oneLine(latest.root, 80)}`);
    lines.push(`  文件 ${latest.files}，发现 ${latest.findingCount}（🔴${c.critical || 0}/🟠${c.high || 0}/🟡${c.medium || 0}），新增 ${nw.newCount || 0}，用时 ${Math.round((latest.durationMs || 0) / 1000)}s`);
  } else {
    lines.push('还没有扫描记录。');
  }
  if (Array.isArray(history) && history.length) {
    lines.push(`历史 ${history.length} 次：${history.slice(0, 5).map((h) => `${new Date(h.at).toLocaleString().replace(/^\d{4}\//, '')} ${h.findingCount}条(新${(h.new && h.new.newCount) || 0})`).join('；')}`);
  }
  return ok(lines.join('\n'));
}

async function toolIgnore(args) {
  const fp = String(args.fingerprint || '').trim();
  if (!/^[0-9a-f]{16}$/.test(fp)) return err('fingerprint 必须是 findings 里给出的 16 位十六进制指纹。');
  const cur = await kv.kvGet(K.ignore).catch(() => null);
  let list = Array.isArray(cur) ? cur : [];
  if (args.remove) {
    const before = list.length;
    list = list.filter((x) => x && x.fp !== fp);
    await kv.kvSet(K.ignore, list);
    return ok(before !== list.length ? `已取消忽略 ${fp}（现有 ${list.length} 条忽略项）。` : `忽略表里没有 ${fp}。`);
  }
  if (list.some((x) => x && x.fp === fp)) return ok(`指纹 ${fp} 已在忽略表中。`);
  list.push({ fp, note: oneLine(args.note || '', 80), at: Date.now() });
  await kv.kvSet(K.ignore, list.slice(-500));
  return ok(`已忽略指纹 ${fp}${args.note ? `（备注：${oneLine(args.note, 60)}）` : ''}。之后的扫描与报告不再显示它。`);
}

function toolRules() {
  const lines = [`内置 ${core.RULES.length} 条规则（面板「设置」Tab 可逐条开关）：`, ''];
  for (const r of core.RULES) {
    const sev = SEV_CN[r.sev] || r.sev;
    lines.push(`· [${sev}] ${r.id} —— ${r.label}`);
  }
  lines.push('', '降噪策略：占位符库（xxxx/example/your-key/${VAR}…）+ 香农熵阈值 + 顺序串检测 + lockfile/二进制/大文件跳过 + 用户忽略表。');
  lines.push('所有报告中的密钥值一律掩码（前4后2），完整值只在被扫文件里。');
  return ok(lines.join('\n'));
}

// ── 工具注册（description 写「适用句式」，决定 AI 会不会用）───────────────────
const tools = [
  {
    name: 'keyscan_scan',
    description: '对本机一个目录做密钥泄露扫描（只读、零外网）：找出裸奔的 AWS/GitHub/OpenAI/Anthropic/Google/阿里云/腾讯云/智谱/数据库连接串/私钥文件等 20 类凭据。适用于「帮我查一下这个项目有没有泄露密钥」「push 前扫一遍 D:\\work\\xxx」「扫扫我的配置目录」。返回按严重度分级的摘要与新增数。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要扫描的目录绝对路径（如 D:\\work\\my-project）' },
      },
      required: ['path'],
    },
    call: toolScan,
  },
  {
    name: 'keyscan_findings',
    description: '查看密钥扫描的发现明细：每条含严重度/规则/文件行号/掩码预览。适用于「扫出了什么」「列出严重级的泄露」「有没有 GitHub token」。只读，值已掩码。',
    inputSchema: {
      type: 'object',
      properties: {
        scanId: { type: 'string', description: '扫描 id（缺省=最近一次）' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium'], description: '只看某严重度' },
        rule: { type: 'string', description: '只看某规则（如 github-token）' },
        search: { type: 'string', description: '按文件路径/上下文关键字过滤' },
        limit: { type: 'integer', description: '最多返回几条（默认 20，上限 60）' },
      },
    },
    call: toolFindings,
  },
  {
    name: 'keyscan_status',
    description: '查看密钥扫描台状态：服务心跳、最近一次扫描摘要、扫描历史与新增趋势。适用于「上次扫描结果如何」「服务在跑吗」「扫描完了吗」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStatus,
  },
  {
    name: 'keyscan_ignore',
    description: '把一条误报加入/移出忽略表（按指纹）。适用于用户确认某条是示例值/测试值后「这个不是真密钥，别再报了」。忽略后后续扫描与报告不再显示该指纹。',
    inputSchema: {
      type: 'object',
      properties: {
        fingerprint: { type: 'string', description: 'findings 里给出的 16 位指纹' },
        note: { type: 'string', description: '备注为什么忽略（如「README 示例值」）' },
        remove: { type: 'boolean', description: 'true=从忽略表移除（恢复报告）' },
      },
      required: ['fingerprint'],
    },
    call: toolIgnore,
  },
  {
    name: 'keyscan_rules',
    description: '列出内置的全部密钥检测规则与降噪策略。适用于用户问「能查出哪些密钥」「会不会误报」。',
    inputSchema: { type: 'object', properties: {} },
    call: () => toolRules(),
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
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      respond(msg.id, { content: [{ type: 'text', text: `未知工具 ${name}` }], isError: true });
      return;
    }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => {
        log('error', `tools/call ${name} 异常: ${e && (e.stack || e.message)}`);
        respond(msg.id, { content: [{ type: 'text', text: `工具内部错误：${e && e.message}` }], isError: true });
      });
    return;
  }
  if (msg.id !== undefined) {
    respond(msg.id, { error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

function respond(id, result) {
  const payload = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

log('info', `keyscan MCP server 启动 v${SERVER_VERSION}（appConfigDir=${APP_CONFIG_DIR || '未提供'}）`);
