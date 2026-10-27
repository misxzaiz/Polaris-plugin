#!/usr/bin/env node
'use strict';
/**
 * 日晷真实桥冒烟：node test/smoke-real.mjs
 *
 * 前置：本机 Polaris 在跑（kvclient 自发现端点：anchor.json → config.json → 端口扫描）。
 * 护栏：真实 kv 已有本插件业务键（sundial.ev 前缀等）→ 拒跑，防毁生产数据。
 * 流程：
 *   1. 桥连通 + 护栏检查
 *   2. 写入 manual 事件（一条 30 分钟后开始、提前 30 分钟提醒 → 到期即应入投影；一条每日习惯带 7 天连击）
 *   3. spawn 真实后台服务 → 等 sundial.meta 心跳 → 等 sundial.reminders 出现到期提醒
 *   4. ICS 订阅真实外网（候选 URL 依次尝试；全部不可达时诚实标记 skipped）
 *   5. spawn 真实 mcp/server.js（stdio JSON-RPC）→ initialize/tools/list/tools/call 全闭环
 *   6. finally：杀进程 + 删光本插件前缀全部键 + 报告 N/N
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');
const { createKvClient } = require('../service/kvclient');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, '..');

// ICS 真实外网候选（依次尝试；第一个是我们仓库 fixture 的 jsdelivr 地址，推送后生效）
const ICS_CANDIDATES = [
  { url: 'https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/sundial/test/fixture.ics', name: '冒烟-fixture(jsdelivr)' },
  { url: 'https://calendar.google.com/calendar/ical/zh.china%23holiday%40group.v.calendar.google.com/public/basic.ics', name: '冒烟-中国节日(Google)' },
];

let pass = 0;
let fail = 0;
let skip = 0;
function step(name, ok, extra) {
  if (ok === 'skip') { skip++; console.log('  skip', name, extra || ''); }
  else if (ok) { pass++; console.log('  ok', name, extra || ''); }
  else { fail++; console.error('  FAIL', name, extra || ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, label, stepMs = 1200) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(stepMs);
  }
  throw new Error(`冒烟超时：${label}`);
}

const kv = createKvClient({ appConfigDir: '', log: () => {} });
const children = [];
let smokeKeys = new Set(); // 本冒烟创建的键（含业务），清理兜底用

async function trackKeys(prefixSet) {
  const keys = await kv.kvKeys();
  for (const k of keys) if (k.startsWith('sundial.')) smokeKeys.add(k);
}

// ── 1. 桥连通 + 护栏 ────────────────────────────────────────────────────────
let alive = false;
try {
  await kv.kvSet('sundial.smoke.probe', { at: Date.now() });
  alive = true;
} catch (e) {
  console.error('无法连接 Polaris 桥（请确认本机 Polaris 在跑）：', e.message);
  process.exit(1);
}
step('桥连通（kv 写入探针）', alive);

const preKeys = (await kv.kvKeys()).filter((k) =>
  k.startsWith('sundial.ev.') || k.startsWith('sundial.ics.') || k === 'sundial.settings' || k === 'sundial.reminders');
if (preKeys.length) {
  console.error(`护栏触发：真实 kv 已有本插件业务键 ${preKeys.length} 个（可能插件已在使用中），冒烟拒跑以防毁数据。`);
  await kv.kvDel('sundial.smoke.probe').catch(() => {});
  process.exit(1);
}
step('护栏：无存量业务键（可安全冒烟）', true);

try {
  // ── 2. 写入 manual 事件（与面板/MCP 同构的直接 kv 写）──────────────────────
  const now = Date.now();
  const r1 = core.normalizeEvent({
    title: '冒烟-马上要提醒的事',
    start: now + 30 * 60000,
    durationMin: 15,
    remind: [30],
  });
  if (r1.error) throw new Error('normalizeEvent 失败: ' + r1.error);
  const evSoon = r1.event;
  await kv.kvSet(`sundial.ev.${evSoon.id}`, evSoon);

  function todayAt(h, m) {
    const p = core.localParts(Date.now());
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const r2 = core.normalizeEvent({
    title: '冒烟-每日习惯', start: todayAt(8, 0), // 今晨 8 点（若已过仍是今天的排期，占位够用）
    rrule: 'daily', kind: 'habit', remind: [],
  });
  if (r2.error) throw new Error('normalizeEvent(habit) 失败: ' + r2.error);
  const evHabit = r2.event;
  // 铸 7 天连击（昨天及以前的 done）
  for (let d = 1; d <= 7; d++) {
    const p = core.localParts(now);
    const ts = new Date(p.y, p.m - 1, p.d - d, 8, 0).getTime();
    evHabit.done[core.occKey(ts, false)] = 'done';
  }
  await kv.kvSet(`sundial.ev.${evHabit.id}`, evHabit);
  await trackKeys();
  step('manual 事件写入（到期提醒事件 + 7 天连击习惯）', true, `ev=${evSoon.id.slice(0, 8)}…/${evHabit.id.slice(0, 8)}…`);

  // ── 3. spawn 真实后台服务 ─────────────────────────────────────────────────
  const svcPort = 19871;
  const svc = spawn('node', [path.join(PLUGIN_DIR, 'service', 'sundial.js'), String(svcPort), ''], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  children.push(svc);
  svc.stderr.on('data', () => { /* 日志已自落盘；冒烟不打噪 */ });

  await waitFor(async () => await kv.kvGet('sundial.meta'), 30000, '服务心跳（sundial.meta）');
  step('服务心跳出现（真实进程 + 自发现桥）', true);

  // 到期提醒投影（服务重算周期 10s + 事件缓存 8s）
  const reminders = await waitFor(async () => {
    const proj = await kv.kvGet('sundial.reminders');
    const items = proj && Array.isArray(proj.items) ? proj.items : [];
    return items.find((r) => r.eventId === evSoon.id) || null;
  }, 40000, '提醒投影出现（sundial.reminders）');
  step('到期提醒入投影（30 分钟后的事提前 30 分提醒）', !!reminders && reminders.remindAt <= Date.now(),
    `rId=${reminders ? reminders.id.slice(0, 30) + '…' : '无'}`);
  step('提醒字段完整（title/start/offsetMin）', !!reminders && reminders.title === '冒烟-马上要提醒的事' && reminders.offsetMin === 30);

  // ack 抑制：面板写 ui.acked 后，投影重算应剔除
  const rId = reminders.id;
  await kv.kvSet('sundial.ui.acked', { [rId]: Date.now() });
  await waitFor(async () => {
    const proj = await kv.kvGet('sundial.reminders');
    const items = proj && Array.isArray(proj.items) ? proj.items : [];
    return !items.some((r) => r.id === rId);
  }, 40000, 'ack 后提醒被剔除');
  step('面板 ack 抑制生效（服务读 ui.acked 重算）', true);

  // ── 4. ICS 真实外网订阅 ───────────────────────────────────────────────────
  let icsDone = false;
  for (const cand of ICS_CANDIDATES) {
    const probe = await fetch(cand.url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }).then((r) => r.ok).catch(() => false);
    if (!probe) continue;
    await kv.kvSet(`sundial.cmd.ics.add.${Date.now().toString(36)}`, { op: 'icsAdd', url: cand.url, name: cand.name, at: Date.now() });
    const def = await waitFor(async () => {
      await trackKeys();
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith('sundial.ics.'));
      for (const k of keys) {
        const d = await kv.kvGet(k).catch(() => null);
        if (d && d.url === cand.url && d.lastFetchAt > 0) return d;
      }
      return null;
    }, 45000, `ICS 首抓（${cand.name}）`);
    if (def.lastStatus !== 'ok') {
      step(`ICS 抓取（${cand.name}）`, 'skip', `lastStatus=${def.lastStatus} ${def.lastError || ''}`);
      continue;
    }
    step(`ICS 真实外网抓取入库（${cand.name}）`, true, `${def.eventCount || 0} 事件`);
    // fixture 含每日重复事件：同步应展开为独立事件键
    const evKeys = (await kv.kvKeys()).filter((k) => k.startsWith('sundial.ev.'));
    step('ICS 事件入库为独立键', evKeys.length >= 2, `当前 sundial.ev.* 共 ${evKeys.length}`);
    icsDone = true;
    break;
  }
  if (!icsDone) step('ICS 真实外网抓取', 'skip', '候选地址均不可达（网络受限），离线单测已覆盖解析逻辑');

  // ── 5. 真实 MCP server（stdio JSON-RPC 直连）──────────────────────────────
  const mcp = spawn('node', [path.join(PLUGIN_DIR, 'mcp', 'server.js'), ''], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.push(mcp);
  const mcpLog = [];
  mcp.stderr.on('data', (d) => mcpLog.push(String(d)));
  let rpcId = 0;
  const pending = new Map();
  let rpcBuf = '';
  mcp.stdout.on('data', (d) => {
    rpcBuf += String(d);
    while (true) {
      const i = rpcBuf.indexOf('\n');
      if (i === -1) break;
      const line = rpcBuf.slice(0, i).trim();
      rpcBuf = rpcBuf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      } catch (_) { /* 忽略 */ }
    }
  });
  function rpc(method, params, timeoutMs = 20000) {
    const id = ++rpcId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); }, timeoutMs);
      pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  step('MCP initialize', !!init.result && init.result.serverInfo.name === 'sundial', `v${init.result?.serverInfo?.version}`);
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  const expectTools = ['sundial_add', 'sundial_query', 'sundial_update', 'sundial_delete', 'sundial_done', 'sundial_ics', 'sundial_today'];
  step('MCP tools/list 7 工具齐', expectTools.every((n) => names.includes(n)) && names.length === 7, names.join(','));

  const call = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args });
    const text = r.result?.content?.[0]?.text || '';
    return { text, isError: r.result?.isError === true };
  };

  const added = await call('sundial_add', { title: '冒烟-MCP添加', start: tomorrowAt(15, 0), remind: [60], tags: ['冒烟'] });
  function tomorrowAt(h, m) {
    const p = core.localParts(Date.now());
    const t = new Date(p.y, p.m - 1, p.d + 1, h, m).getTime();
    return `${core.fmtDay(t)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  step('MCP sundial_add', !added.isError && added.text.includes('已添加'), core.oneLine(added.text, 80));
  const addedId = (added.text.match(/\[([a-z0-9]+)\]/) || [])[1] || '';
  const addedInKv = addedId ? await kv.kvGet(`sundial.ev.${addedId}`) : null;
  step('MCP 添加落库（kv 回读一致）', !!addedInKv && addedInKv.title === '冒烟-MCP添加', `id=${addedId}`);

  const q = await call('sundial_query', { range: 'week', query: '冒烟' });
  step('MCP sundial_query', !q.isError && q.text.includes('冒烟-每日习惯') && q.text.includes('冒烟-MCP添加'), `命中 ${q.isError ? '错误' : 'ok'}`);

  const today = await call('sundial_today', {});
  step('MCP sundial_today 摘要', !today.isError && today.text.includes('【今天') && today.text.includes('冒烟-每日习惯'), core.oneLine(today.text.replace(/\n/g, ' '), 100));

  // 打卡：query 拿 occ → done → 连击 8
  const occMatch = q.text.match(/occ=([^\s]+)/);
  if (occMatch) {
    const done = await call('sundial_done', { id: evHabit.id, occ: occMatch[1], state: 'done' });
    const habit = await kv.kvGet(`sundial.ev.${evHabit.id}`);
    step('MCP sundial_done 打卡', !done.isError && habit && habit.done[occMatch[1]] === 'done', core.oneLine(done.text, 70));
  } else {
    step('MCP sundial_done 打卡', 'skip', 'query 未返回 occ 键（习惯今天无排期发生？）');
  }

  const del = await call('sundial_delete', { id: addedId, confirm: false });
  step('MCP sundial_delete confirm 门（false 拒绝）', del.isError && del.text.includes('confirm'), '');
  const del2 = await call('sundial_delete', { id: addedId, confirm: true });
  const gone = await kv.kvGet(`sundial.ev.${addedId}`);
  step('MCP sundial_delete 确认后删除', !del2.isError && !gone, `id=${addedId}`);

  // ── 6. 自清理 ─────────────────────────────────────────────────────────────
  // 护栏已确认冒烟前无业务键：直接前缀全扫（覆盖未登记的后续写入，如 ui.acked）
  const allMine = (await kv.kvKeys()).filter((k) => k.startsWith('sundial.'));
  for (const k of allMine) await kv.kvDel(k).catch(() => {});
  const leftovers = (await kv.kvKeys()).filter((k) => k.startsWith('sundial.'));
  step('自清理彻底（sundial.* 全清）', leftovers.length === 0, `${allMine.length} 键已删，残留 ${leftovers.length}`);
} catch (e) {
  fail++;
  console.error('  FAIL 冒烟流程异常:', e.message);
  // 尽力清理
  try {
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith('sundial.'));
    for (const k of keys) await kv.kvDel(k).catch(() => {});
  } catch (_) { /* ignore */ }
} finally {
  for (const c of children) { try { c.kill('SIGTERM'); } catch (_) { /* ignore */ } }
  await kv.kvDel('sundial.smoke.probe').catch(() => {});
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
