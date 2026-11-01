#!/usr/bin/env node
'use strict';
/**
 * file-flow MCP Server —— 文件管家的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 fileflow.* 键空间的读写。扫描/规划/执行/撤销全部由后台服务单权威执行——
 * MCP 只负责「读快照/读批次 / 投递命令并等待结果」，与服务共享同一事实库。
 *
 * 工具一览（7）：
 *   flow_status   总览：各根状态 + 最近批次 + 累计统计（「我的下载文件夹怎么样了」）
 *   flow_roots    根目录管理 list/add/remove/set（auto: off|new|all）
 *   flow_rules    规则管理 list/add/update/delete/reorder/preset（预置下载夹起步包）
 *   flow_dryrun   对某根生成计划并预览（永不直接执行，先看再动手）
 *   flow_apply    执行计划（必须 confirm:true；根外目的路径仅手动模式执行）
 *   flow_undo     撤销批次（必须 confirm:true；逐文件校验 to 仍在 & from 已空）
 *   flow_history  批次列表/明细（undo 的凭据来源）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现（env → anchor → config → 扫描）。
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const lib = require('../service/lib');

const SERVER_NAME = 'file-flow';
const SERVER_VERSION = lib.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'fileflow.meta',
  snapshot: 'fileflow.snapshot',
  stats: 'fileflow.stats',
  cmd: (nonce) => `fileflow.cmd.${nonce}`,
  result: (nonce) => `fileflow.result.${nonce}`,
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 命令信箱：写 cmd 键 → 轮询 result 键（服务 tick 2s 消费）────────────────
async function callService(type, payload, { timeoutMs = 90_000 } = {}) {
  const nonce = `${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
  await kv.kvSet(K.cmd(nonce), { type, payload: payload || {}, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(500);
    const r = await kv.kvGet(K.result(nonce)).catch(() => null);
    if (r) {
      await kv.kvDel(K.result(nonce)).catch(() => {});
      if (r.ok) return r.payload;
      throw new Error(r.error || '服务执行失败');
    }
  }
  throw new Error(`服务响应超时（${timeoutMs}ms）——后台服务可能在重启或桥不可达`);
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function describeOp(op) {
  const arrow = op.action === 'rename' ? '改名' : '移动';
  const to = op.toAbs || op.toRel || '?';
  const tag = op.safe === false ? ' [根外·需手动确认]' : '';
  return `  ${arrow} ${op.fromRel} → ${to}${tag}（${op.why || op.ruleId}）`;
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolStatus() {
  const [snap, meta, stats] = await Promise.all([
    kv.kvGet(K.snapshot).catch(() => null),
    kv.kvGet(K.meta).catch(() => null),
    kv.kvGet(K.stats).catch(() => null),
  ]);
  if (!snap && !meta) {
    return ok('文件管家服务尚未就绪（无快照无心跳）：服务可能在启动中，或宿主桥不可达。稍后重试 flow_status。');
  }
  const lines = [];
  lines.push(`文件管家 v${(snap && snap.version) || (meta && meta.version) || '?'}｜桥=${(meta && meta.bridge) || '?'}｜规则 ${snap ? snap.enabledRuleCount : '?'} 条启用`);
  const st = stats || (snap && snap.stats) || {};
  lines.push(`累计：整理 ${(st.filesOrganized || 0)} 个文件，${(st.batches || 0)} 个批次，最近 ${fmtTime(st.lastBatchAt)}`);
  for (const r of (snap && snap.roots) || []) {
    lines.push(`\n【${r.label}】${r.path}`);
    lines.push(`  自动模式=${r.auto}｜监听${r.watched ? '中' : '未监听'}｜上次运行 ${fmtTime(r.lastRunAt)}${r.lastPlanOps != null ? `（${r.lastPlanOps} 个动作）` : ''}`);
  }
  if (!((snap && snap.roots) || []).length) {
    lines.push('\n（还没有根目录：用 flow_roots add 添加下载文件夹等目录，再用 flow_rules preset 载入起步包）');
  }
  return ok(lines.join('\n'));
}

async function toolRoots(args) {
  const action = String(args.action || 'list');
  if (action === 'list') {
    const snap = await kv.kvGet(K.snapshot).catch(() => null);
    const roots = (snap && snap.roots) || [];
    if (!roots.length) return ok('尚无根目录。用 flow_roots add（path=绝对路径）添加，例如下载文件夹。');
    return ok(roots.map((r) => `【${r.label}】${r.path}\n  自动模式=${r.auto}｜监听${r.watched ? '中' : '未监听'}｜上次运行 ${fmtTime(r.lastRunAt)}`).join('\n'));
  }
  if (action === 'add') {
    if (!args.path) return err('add 需要 path（绝对路径）');
    const r = await callService('roots_add', { path: args.path, label: args.label, auto: args.auto });
    return ok(`已添加根目录（共 ${r.roots.length} 个）：\n` + r.roots.map((x) => `- ${x.label}｜${x.path}｜auto=${x.auto}`).join('\n'));
  }
  if (action === 'remove') {
    if (!args.id) return err('remove 需要 id（flow_roots list 可查）');
    const r = await callService('roots_remove', { id: args.id });
    return ok(`已移除（其规则已停用，文件未动）。剩余 ${r.roots.length} 个根目录。`);
  }
  if (action === 'set') {
    if (!args.id) return err('set 需要 id');
    const r = await callService('roots_set', { id: args.id, auto: args.auto, label: args.label });
    return ok('已更新：\n' + r.roots.map((x) => `- ${x.label}｜${x.path}｜auto=${x.auto}`).join('\n'));
  }
  return err(`未知 action：${action}（list/add/remove/set）`);
}

async function toolRules(args) {
  const action = String(args.action || 'list');
  if (action === 'list') {
    const r = await callService('ping', {});
    const kvRules = await kv.kvGet('fileflow.rules').catch(() => null);
    const rules = (kvRules && kvRules.rules) || [];
    if (!rules.length) return ok('尚无规则。可用 flow_rules preset（rootId + packId=downloads）一键载入下载夹起步包。');
    const rootNames = new Map();
    const snap = await kv.kvGet(K.snapshot).catch(() => null);
    for (const x of (snap && snap.roots) || []) rootNames.set(x.id, x.label);
    return ok(`规则 ${rules.length} 条（服务在线 roots=${r.roots}）：\n` + rules.map((x) =>
      `- [${x.enabled ? '启用' : '停用'}] ${x.name}｜优先级${x.priority}｜根=${rootNames.get(x.rootId) || x.rootId || '全部'}｜${x.action.type}${x.action.dest ? `→${x.action.dest}` : ''}｜匹配${JSON.stringify(x.match)}`,
    ).join('\n'));
  }
  if (action === 'add') {
    if (!args.rule || typeof args.rule !== 'object') return err('add 需要 rule 对象（name/rootId/match/action）');
    const r = await callService('rules_add', { rule: args.rule });
    return ok(`规则已添加（共 ${r.rules.length} 条）。建议先 flow_dryrun 预览再 flow_apply。`);
  }
  if (action === 'update') {
    if (!args.id || !args.patch) return err('update 需要 id 与 patch');
    await callService('rules_update', { id: args.id, patch: args.patch });
    return ok('规则已更新。建议 flow_dryrun 验证。');
  }
  if (action === 'delete') {
    if (!args.id) return err('delete 需要 id');
    await callService('rules_delete', { id: args.id });
    return ok('规则已删除。');
  }
  if (action === 'reorder') {
    if (!Array.isArray(args.ids)) return err('reorder 需要 ids 数组（按优先顺序）');
    await callService('rules_reorder', { ids: args.ids });
    return ok('顺序已调整。');
  }
  if (action === 'preset') {
    if (!args.rootId) return err('preset 需要 rootId（flow_roots list 可查）');
    const r = await callService('rules_preset', { rootId: args.rootId, packId: args.packId || 'downloads' });
    return ok(`预置包已载入：新增 ${r.added} 条规则（同根同名自动跳过）。建议 flow_dryrun 预览后 flow_apply confirm:true。`);
  }
  return err(`未知 action：${action}（list/add/update/delete/reorder/preset）`);
}

async function toolDryrun(args) {
  if (!args.rootId) return err('需要 rootId（flow_roots list 可查）');
  const plan = await callService('dryrun', { rootId: args.rootId }, { timeoutMs: 120_000 });
  const lines = [];
  lines.push(`计划 ${plan.planId}｜共 ${plan.opTotal} 个动作（根内 ${plan.safeOps}，根外 ${plan.outsideOps}）`);
  lines.push(`扫描：${plan.counts.entries} 个文件${plan.truncated ? '（已达遍历上限，结果截断）' : ''}｜命中 ${plan.counts.matched}｜护栏拦下 ${plan.counts.guard}｜部分下载 ${plan.counts.partial}｜无规则 ${plan.counts.noRule}`);
  if (plan.opTotal === 0) {
    lines.push('\n没有可执行的动作——文件都已就位或无规则命中。');
  } else {
    lines.push('\n动作预览（最多 40 条）：');
    for (const op of plan.ops.slice(0, 40)) lines.push(describeOp(op));
    if (plan.opTotal > 40) lines.push(`  …（其余 ${plan.opTotal - 40} 条见面板/计划详情）`);
  }
  if (plan.outsideOps > 0) lines.push('\n⚠ 含根外目的路径：自动整理不会执行这些动作，需 flow_apply 手动确认。');
  if (plan.skipped && plan.skipped.length) {
    lines.push(`\n被跳过（示例 ${plan.skipped.length} 条）：`);
    for (const s of plan.skipped.slice(0, 10)) lines.push(`  ${s.rel}｜${s.reason}`);
  }
  lines.push(`\n确认无误后：flow_apply（rootId + confirm:true）。可撤销：flow_history 找 batchId → flow_undo。`);
  return ok(lines.join('\n'));
}

async function toolApply(args) {
  if (args.confirm !== true) {
    return err('执行整理需要 confirm:true。安全流程：先 flow_dryrun 审阅计划，再确认执行。所有动作都有批次日志，可 flow_undo 撤销。');
  }
  if (!args.rootId && !args.planId) return err('需要 rootId（现算现执行）或 planId（执行已有计划）');
  const r = await callService('apply', { rootId: args.rootId, planId: args.planId, confirm: true }, { timeoutMs: 150_000 });
  if (r.queued) {
    return ok(`已入执行队列（${r.opTotal} 个动作，计划 ${r.planId}）。${r.note || ''}\n稍后用 flow_history 查看批次结果。`);
  }
  const s = r.summary || {};
  return ok(`批次 ${r.batchId} 完成：成功 ${s.done}，失败 ${s.failed}，暂缓 ${s.held}（根外路径待手动确认），移动 ${fmtBytes(s.bytesMoved)}。\n撤销：flow_undo（batchId=${r.batchId} + confirm:true）。`);
}

async function toolUndo(args) {
  if (args.confirm !== true) {
    return err('撤销需要 confirm:true。撤销逐文件回移，只在「目的仍在 & 原位已空」时执行，冲突会如实报告。');
  }
  if (!args.batchId) return err('需要 batchId（flow_history 可查）');
  const r = await callService('undo', { batchId: args.batchId, confirm: true }, { timeoutMs: 150_000 });
  const lines = [`撤销完成：回移 ${r.undone} 个，未成 ${r.failed} 个（撤销凭据批次 ${r.undoBatchId}）。`];
  for (const x of (r.results || []).filter((x) => x.status !== 'done').slice(0, 15)) {
    lines.push(`  未成：${x.fromRel}｜${x.why || x.status}`);
  }
  return ok(lines.join('\n'));
}

async function toolHistory(args) {
  if (args.batchId) {
    const r = await callService('batch_detail', { batchId: args.batchId });
    const b = r.batch;
    const lines = [`批次 ${b.batchId}｜${fmtTime(b.at)}｜模式=${b.mode}${b.undoOf ? `｜撤销自 ${b.undoOf}` : ''}｜根=${b.rootPath}`];
    lines.push(`结果：成功 ${b.summary.done} / 失败 ${b.summary.failed} / 暂缓 ${b.summary.held} / 共 ${b.summary.total}，移动 ${fmtBytes(b.summary.bytesMoved)}`);
    for (const op of (b.ops || []).slice(0, 60)) {
      const mark = { done: '✓', gone: '∅', changed: '↯', locked: '🔒', error: '✗', held: '⏸', conflict: '⚠' }[op.status] || '·';
      lines.push(`  ${mark} ${op.fromRel} → ${op.toAbs || op.toRel || '?'} [${op.status}]${op.why ? ` ${op.why}` : ''}`);
    }
    if ((b.ops || []).length > 60) lines.push(`  …共 ${b.ops.length} 条`);
    return ok(lines.join('\n'));
  }
  const keys = await kv.kvKeys();
  const batchKeys = keys.filter((k) => k.startsWith('fileflow.batch.'));
  const limit = Math.min(Number(args.limit) || 8, 20);
  const items = [];
  for (const k of batchKeys) {
    const b = await kv.kvGet(k).catch(() => null);
    if (b) items.push(b);
  }
  items.sort((a, b) => b.at - a.at);
  if (!items.length) return ok('还没有批次记录。先 flow_dryrun → flow_apply。');
  return ok(items.slice(0, limit).map((b) =>
    `- ${b.batchId}｜${fmtTime(b.at)}｜${b.mode}${b.undoOf ? `（撤销自 ${b.undoOf}）` : ''}｜成功 ${b.summary.done}/${b.summary.total}${b.summary.failed ? `｜失败 ${b.summary.failed}` : ''}${b.summary.held ? `｜暂缓 ${b.summary.held}` : ''}`,
  ).join('\n') + '\n\n（flow_history 传 batchId 看明细）');
}

// ── 工具清单 ───────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'flow_status',
    description: '文件管家总览：各根目录状态、最近批次、累计整理量。回答「我的下载文件夹怎么样了」「整理了多少」。无参数。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'flow_roots',
    description: '管理受管根目录（被盯护整理的文件夹）。action=list|add|remove|set。add 需绝对路径；auto=off|new|all（new=只自动整理新到文件，推荐；all=全部自动整理；off=仅手动）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove', 'set'] },
        path: { type: 'string', description: 'add：目录绝对路径' },
        label: { type: 'string', description: '显示名（≤24字）' },
        auto: { type: 'string', enum: ['off', 'new', 'all'], description: '自动整理模式' },
        id: { type: 'string', description: 'remove/set：根目录 id' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'flow_rules',
    description: '管理整理规则。action=list|add|update|delete|reorder|preset。rule={name,rootId,priority,match:{exts[],nameRegex,minAgeDays,maxAgeDays,minSizeMB,maxSizeMB,subDir},action:{type:move|recycle|dedupe|rename,dest,pattern,allowOutsideRoot}}。preset 可一键载入「下载文件夹起步包」（packId=downloads）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'delete', 'reorder', 'preset'] },
        rule: { type: 'object', description: 'add：完整规则对象' },
        id: { type: 'string', description: 'update/delete：规则 id' },
        patch: { type: 'object', description: 'update：要改的字段' },
        ids: { type: 'array', items: { type: 'string' }, description: 'reorder：按优先顺序的规则 id' },
        rootId: { type: 'string', description: 'preset：目标根目录 id' },
        packId: { type: 'string', description: 'preset：包 id，默认 downloads' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'flow_dryrun',
    description: '对某根目录生成整理计划并预览（绝不执行）。返回命中/护栏/跳过统计与逐条动作预览。执行前必须先 dryrun。',
    inputSchema: {
      type: 'object',
      properties: { rootId: { type: 'string', description: '根目录 id' } },
      required: ['rootId'],
      additionalProperties: false,
    },
  },
  {
    name: 'flow_apply',
    description: '执行整理（需要 confirm:true，且应先 flow_dryrun 审阅）。根外目的路径的动作会被暂缓，仅手动模式执行。全程批次日志，可 flow_undo 撤销。',
    inputSchema: {
      type: 'object',
      properties: {
        rootId: { type: 'string', description: '根目录 id（现算现执行）' },
        planId: { type: 'string', description: '已有计划 id（执行 dryrun 出的计划）' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'flow_undo',
    description: '撤销一个批次（需要 confirm:true）。逐文件回移：只有「目的仍在、原位已空」才执行，冲突/丢失如实报告，绝不覆盖。',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: { type: 'string' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['batchId'],
      additionalProperties: false,
    },
  },
  {
    name: 'flow_history',
    description: '批次列表或明细（撤销凭据 batchId 的来源）。传 batchId 看逐文件明细；不传看最近批次。',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: { type: 'string', description: '批次 id（看明细）' },
        limit: { type: 'number', description: '列表条数，默认 8' },
      },
      additionalProperties: false,
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'flow_status': return toolStatus();
    case 'flow_roots': return toolRoots(args);
    case 'flow_rules': return toolRules(args);
    case 'flow_dryrun': return toolDryrun(args);
    case 'flow_apply': return toolApply(args);
    case 'flow_undo': return toolUndo(args);
    case 'flow_history': return toolHistory(args);
    default: return err(`未知工具：${name}`);
  }
}

// ── JSON-RPC stdio 主循环 ──
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleRequest(line).catch((e) => log('error', `请求处理失败: ${e.message}`));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleRequest(line) {
  let req;
  try { req = JSON.parse(line); } catch (_) { return; }
  const { id, method } = req;
  const reply = (result) => {
    if (id === undefined) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  };
  const replyErr = (code, message) => {
    if (id === undefined) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
  };

  if (method === 'initialize') {
    reply({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (method === 'notifications/initialized' || (req.method && id === undefined)) return; // 通知不回
  if (method === 'tools/list') {
    reply({ tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const name = req.params && req.params.name;
    const args = (req.params && req.params.arguments) || {};
    try {
      const res = await handleToolCall(name, args);
      reply(res);
    } catch (e) {
      log('warn', `工具 ${name} 失败: ${e.message}`);
      reply(err(String(e.message || e).slice(0, 600)));
    }
    return;
  }
  if (method === 'ping') { reply({}); return; }
  replyErr(-32601, `未知方法：${method}`);
}

log('info', `file-flow MCP server 启动（v${SERVER_VERSION}）`);
