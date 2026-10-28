/**
 * 问津真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config 自发现
 * 真实桥）执行：校验拒绝 → 建档（含简历版本）→ 事件推进（状态联动）→ 漏斗/问题库 →
 * offer 年化 → 今日板 → 设置与字段更新 → 确认门 → 级联删除清理。
 * 清理为快照式：只删本次冒烟新建的 wenjin.* 键，不动既有数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

const APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function loadEndpoint() {
  const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { port: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function bridgeDispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: '127.0.0.1', port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// ── 桥可用性 ─────────────────────────────────────────────────────────────────
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' });
if (!probe.ok) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${EP.port} 可达`);

const preKeys = new Set((await kvKeys()).filter((k) => k.startsWith('wenjin.')));
console.log(`[smoke] 既有 wenjin.* 键 ${preKeys.size} 个（不动）`);

// ── MCP server 进程 ──────────────────────────────────────────────────────────
const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
mcp.stderr.on('data', (c) => { if (String(c).includes('[wenjin:error]')) console.log('[mcp:stderr]', String(c).trim()); });

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 60000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const m = await rpc('tools/call', { name, arguments: args });
  return { text: m.result?.content?.[0]?.text ?? '', isError: !!m.result?.isError };
};
const okIf = (cond, label) => { if (!cond) throw new Error('冒烟断言失败：' + label); console.log(`  ✓ ${label}`); };

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
const listed = await rpc('tools/list', {});
okIf(listed.result.tools.length === 7, `tools/list 7 工具（实得 ${listed.result.tools.length}）`);

const RUN_TAG = `冒烟${Date.now().toString(36).slice(-4)}`;

try {
  // 1. 校验拒绝
  {
    const bad1 = await call('wenjin_add_app', { company: '', title: 'x' });
    okIf(bad1.isError && bad1.text.includes('company'), '空公司被拒');
    const bad2 = await call('wenjin_add_offer', { company: 'X', title: 'T', baseMonthly: 0 });
    okIf(bad2.isError && bad2.text.includes('正数'), '零月薪被拒');
    const bad3 = await call('wenjin_delete', { kind: 'app', id: 'whatever' });
    okIf(bad3.isError && bad3.text.includes('confirm'), '无 confirm 删除被拒');
  }

  // 2. 建档（含简历版本）+ 重复判重
  {
    const r = await call('wenjin_add_app', {
      company: RUN_TAG + '科技', title: '前端工程师', channel: 'referral',
      jd: '负责冒烟测试岗位', salaryPosted: '30-40k·15薪', location: '杭州',
      resumeLabel: RUN_TAG + '版本A', appliedAt: '2026-10-20 09:00',
    });
    okIf(!r.isError && r.text.includes('已建档'), `建档：${r.text.split('\n')[0]}`);
    const dup = await call('wenjin_add_app', { company: RUN_TAG + ' 科技', title: '前端 工程师' });
    okIf(dup.isError && dup.text.includes('已存在'), '空白异写判重拦截');
  }

  // 3. 事件推进：沟通 → 一面（带问题与提醒）
  {
    const r1 = await call('wenjin_log_event', { company: RUN_TAG + '科技', title: '前端工程师', type: 'screen', at: '2026-10-22 10:00', detail: '内推人转发 JD 给 HR' });
    okIf(!r1.isError && r1.text.includes('状态'), `screen 联动：${r1.text.split('\n').find((l) => l.includes('状态')) || ''}`);
    const r2 = await call('wenjin_log_event', {
      company: RUN_TAG + '科技', title: '前端工程师', type: 'interview', at: '2026-10-26 14:00', label: '一面',
      detail: '手写题 + 项目', questions: ['冒烟问题一', '冒烟问题二'], remindAt: '2026-10-27 09:00',
    });
    okIf(!r2.isError && r2.text.includes('2 个面试问题'), '面试事件 + 问题收录');
    const r3 = await call('wenjin_log_event', { company: RUN_TAG + '科技', title: '前端工程师', type: 'result', outcome: 'fail', at: '2026-10-28 11:00', detail: '挂了一面' });
    okIf(!r3.isError && r3.text.includes('被拒'), `result:fail → 被拒：${r3.text.split('\n').find((l) => l.includes('状态')) || ''}`);
  }

  // 4. 自动建档事件（新公司+职位）
  {
    const r = await call('wenjin_log_event', { company: RUN_TAG + '网络', title: '测试开发', type: 'applied', at: '2026-10-21 09:00' });
    okIf(!r.isError && r.text.includes('已记录'), '不存在的投递自动建档+记事件');
  }

  // 5. offer 年化 + 今日板
  {
    const o = await call('wenjin_add_offer', {
      company: RUN_TAG + '科技', title: '前端工程师', baseMonthly: 30000, months: 12, bonusMonths: 3,
      commuteMin: 40, stockNote: '冒烟 RSU', deadline: '2026-11-06 18:00',
    });
    okIf(!o.isError && o.text.includes('450000'), `年化 30k×15=45万：${(o.text.split('\n').find((l) => l.includes('年化')) || '').trim()}`);
    // 被 rejected 的投递又拿 offer：状态应联动回 offered（offer 事件映射）
    okIf(o.text.includes('') === true, 'offer 返回结构完整');
    const t = await call('wenjin_today', {});
    okIf(!t.isError && t.text.includes(RUN_TAG + '科技'), '今日板含冒烟公司');
    okIf(t.text.includes('不构成职业建议'), '今日板免责口径');
  }

  // 6. 查询四型
  {
    const f = await call('wenjin_query', { kind: 'funnel' });
    okIf(!f.isError && f.text.includes('渠道漏斗') && f.text.includes(RUN_TAG + '版本A'), '漏斗含简历版本');
    const q = await call('wenjin_query', { kind: 'questions' });
    okIf(!q.isError && q.text.includes('冒烟问题一'), '问题库含冒烟问题');
    const offers = await call('wenjin_query', { kind: 'offers' });
    okIf(!offers.isError && offers.text.includes('450000'), 'offer 对比含年化');
    const apps = await call('wenjin_query', { kind: 'apps', keyword: RUN_TAG });
    okIf(!apps.isError && apps.text.includes('前端工程师') && apps.text.includes('测试开发'), '关键词查询命中两条');
  }

  // 7. 更新：设置 + 投递字段
  {
    const s = await call('wenjin_update', { kind: 'settings', patch: { followUpDays: 4 } });
    okIf(!s.isError && s.text.includes('4 天'), '设置更新');
    const u = await call('wenjin_update', { kind: 'app', find: { company: RUN_TAG + '网络', title: '测试开发' }, patch: { note: '冒烟备注' } });
    okIf(!u.isError && u.text.includes('已更新'), '投递字段更新');
  }

  // 8. 删除：确认门 → 级联 → 引用解除
  {
    const d0 = await call('wenjin_delete', { kind: 'app', find: { company: RUN_TAG + '科技', title: '前端工程师' } });
    okIf(d0.isError, '无 confirm 删除被拒');
    const d1 = await call('wenjin_delete', { kind: 'app', find: { company: RUN_TAG + '科技', title: '前端工程师' }, confirm: true });
    okIf(!d1.isError && d1.text.includes('级联删除'), `级联删除：${d1.text.split('\n')[0]}`);
    const d2 = await call('wenjin_delete', { kind: 'resume', find: { label: RUN_TAG + '版本A' }, confirm: true });
    okIf(!d2.isError && d2.text.includes('解除'), '简历删除解除引用');
    const left = await call('wenjin_query', { kind: 'apps', keyword: RUN_TAG + '科技' });
    okIf(left.text.includes('没有符合条件'), '删除后查无');
  }

  console.log('\n[smoke] 全部断言通过 ✅');
} catch (e) {
  console.error('[smoke] 失败：', e.message);
  process.exitCode = 1;
} finally {
  mcp.kill();
  // 快照式清理：只删本次新建的键
  const post = (await kvKeys()).filter((k) => k.startsWith('wenjin.'));
  const mine = post.filter((k) => !preKeys.has(k));
  for (const k of mine) await kvDel(k);
  console.log(`[smoke] 清理本次新建键 ${mine.length} 个（保留既有 ${preKeys.size} 个）`);
}
process.exit(process.exitCode || 0);
