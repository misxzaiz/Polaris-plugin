#!/usr/bin/env node
/**
 * MCP server 全流程验证（node test/mcp-verify.mjs）——不依赖真实宿主：
 * 起本地「内存 cap.kv」桥（/api/router-dispatch 假实现，协议与宿主一致），
 * 注入 POLARIS_HOST/PORT env（kvclient 的 env 优先路径），spawn 真实 mcp/server.js
 * 走 stdio JSON-RPC：initialize → tools/list → 建成员/建保单（自动配档/判重）→
 * today 红黄榜 → 记事件（pay/claim/reinstate 门/surrender）→ 查询六 scope →
 * 更新/删除（confirm 门/连带删/成员删保单拒）→ 清场。
 * 日期全部由「今天」动态推导，测试永不过期。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');

// ── 内存 cap.kv 桥 ───────────────────────────────────────────────────────────
const store = new Map();
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !(req.url || '').startsWith('/api/router-dispatch')) {
    res.writeHead(404); res.end(JSON.stringify({ ok: false, error: 'not found' })); return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body).req; } catch { res.writeHead(400); res.end('{}'); return; }
    if (payload.target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `unknown target ${payload.target}` })); return; }
    const a = payload.payload || {};
    try {
      if (a.action === 'list') {
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { keys: [...store.keys()] } }));
      } else if (a.action === 'get') {
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { value: store.has(a.key) ? store.get(a.key) : null } }));
      } else if (a.action === 'set') {
        store.set(a.key, a.value === undefined ? null : a.value);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} }));
      } else if (a.action === 'delete') {
        store.delete(a.key);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} }));
      } else {
        res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `unknown action ${a.action}` }));
      }
    } catch (e) {
      res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
console.log(`[mcp-verify] 内存桥 127.0.0.1:${port}`);

// ── spawn 真实 MCP server（env 注入端点）────────────────────────────────────
const child = spawn(process.execPath, ['mcp/server.js', ''], {
  cwd: pluginDir,
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(port) },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (c) => { stderr += String(c); });

let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});

const failures = [];
let passed = 0;
const okIf = (cond, label) => {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else { passed++; console.log(`  ✓ ${label}`); }
};
const call = async (name, args) => {
  const m = await rpc('tools/call', { name, arguments: args });
  const r = m.result || {};
  return { isError: !!r.isError, text: (r.content || []).map((c) => c.text).join('\n') };
};

// ── 动态日期（相对今天推导，测试永不过期）───────────────────────────────────
import { createRequire } from 'node:module';
const require2 = createRequire(import.meta.url);
const core = require2('../shared/core.js');
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const T = today();
const P_ACTIVE_START = core.addDays(core.addMonths(T, -12), 13); // nextPay = T+13d → 黄榜
const P_GRACE_START = core.addDays(core.addMonths(T, -12), -9);   // nextPay = T-9d → 宽限期红榜
const P_LAPSE_START = core.addDays(core.addMonths(T, -12), -100); // nextPay = T-100d → 中止期

try {
  // initialize + tools/list
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  okIf(init.result && init.result.serverInfo.name === 'jinkui', 'initialize：serverInfo=jinkui');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tl = await rpc('tools/list', {});
  const names = (tl.result.tools || []).map((t) => t.name);
  okIf(names.length === 6, `tools/list：6 个工具（${names.join(',')}）`);
  okIf(['jinkui_today', 'jinkui_add', 'jinkui_log', 'jinkui_query', 'jinkui_update', 'jinkui_delete'].every((n) => names.includes(n)), '工具名齐全');

  console.log('[mcp] 空台账引导');
  let r = await call('jinkui_today', {});
  okIf(!r.isError && r.text.includes('还没有保单台账'), 'today：空台账引导');
  okIf(r.text.includes('不构成投保建议'), 'today：免责口径');

  console.log('[mcp] 建档（成员 + 保单自动配档 + 判重）');
  r = await call('jinkui_add', { entity: 'member', name: '本人', relation: 'self' });
  okIf(!r.isError && r.text.includes('已建成员'), 'add member：成功');
  r = await call('jinkui_add', { entity: 'member', name: '本人', relation: 'self' });
  okIf(r.isError && r.text.includes('已存在成员'), 'add member：重复拒建');
  r = await call('jinkui_add', { name: '平安少儿重疾', kind: 'critical', insured: '大娃', relation: 'child', coverageWan: 50, premium: 4000, freq: 'yearly', payYears: 20, startDate: P_ACTIVE_START });
  okIf(!r.isError && r.text.includes('已自动建成员「大娃」'), 'add policy：insured 自动配档');
  okIf(r.text.includes('下次缴费'), 'add policy：下次缴费投影');
  okIf(r.text.includes('保额 50 万'), 'add policy：coverageWan 换算');
  const kidPolicyId = (r.text.match(/id=([0-9a-f]{12})/) || [])[1];
  okIf(!!kidPolicyId, 'add policy：返回 id');
  r = await call('jinkui_add', { name: '等待期测试险', kind: 'medical', insured: '大娃', company: '众安', premium: 99, startDate: core.addDays(T, -10), waitingDays: 90 });
  okIf(!r.isError && r.text.includes('等待期至'), 'add policy：等待期投影（新单 10 天前生效）');
  r = await call('jinkui_add', { name: '平安少儿重疾', kind: 'critical', insured: '大娃', coverageWan: 50, premium: 4000, startDate: P_ACTIVE_START });
  okIf(r.isError && r.text.includes('同名'), 'add policy：同人同司同名拒建');
  r = await call('jinkui_add', { name: '好医保', kind: 'medical', insured: '本人', company: '人保健康', coverageWan: 300, premium: 233, startDate: P_GRACE_START, payYears: 20 });
  okIf(!r.isError && r.text.includes('已入柜'), 'add policy：本人医疗（宽限期种子）');
  const graceId = (r.text.match(/id=([0-9a-f]{12})/) || [])[1];
  r = await call('jinkui_add', { name: '定海柱', kind: 'life', insured: '本人', company: '国富', coverageWan: 100, premium: 900, startDate: P_LAPSE_START, payYears: 30 });
  okIf(!r.isError, 'add policy：本人寿险（中止期种子）');
  const lapseId = (r.text.match(/id=([0-9a-f]{12})/) || [])[1];
  r = await call('jinkui_add', { name: '小蜜蜂', kind: 'accident', insured: '大娃', company: '太保', coverageWan: 20, premium: 68, startDate: P_ACTIVE_START });
  okIf(!r.isError, 'add policy：大娃意外（黄榜种子）');
  const accId = (r.text.match(/id=([0-9a-f]{12})/) || [])[1];

  console.log('[mcp] today 红黄榜 + 缺口');
  r = await call('jinkui_today', {});
  okIf(!r.isError && r.text.includes('宽限期') && r.text.includes('尽快补缴'), 'today：宽限期红榜（保障仍有效口径）');
  okIf(r.text.includes('中止期') && r.text.includes('出险不赔'), 'today：中止期红榜');
  okIf(r.text.includes('黄榜') && r.text.includes('平安少儿重疾'), 'today：黄榜含临近缴费保单');
  okIf(r.text.includes('年缴保费约'), 'today：家庭合计');
  okIf(r.text.includes('缺口速览') && r.text.includes('本人缺'), 'today：缺口速览');
  okIf(r.text.includes('等待期') === false || r.text.includes('其他'), 'today：等待期落其他段不误报');

  console.log('[mcp] 查询六 scope');
  r = await call('jinkui_query', { scope: 'policies' });
  okIf(!r.isError && r.text.split('\n').length >= 5, 'query policies：清单');
  okIf(r.text.includes('宽限期') && r.text.includes('中止期'), 'query policies：状态标注');
  r = await call('jinkui_query', { scope: 'calendar', days: 90 });
  okIf(!r.isError && r.text.includes('平安少儿重疾'), 'query calendar：90 天含黄榜单');
  okIf(r.text.includes('宽限期·保障仍有效'), 'query calendar：逾期单置顶');
  r = await call('jinkui_query', { scope: 'gap' });
  okIf(!r.isError && r.text.includes('缺口矩阵') && r.text.includes('大娃'), 'query gap：矩阵');
  okIf(r.text.includes('中止期、已退保、已满期不计入'), 'query gap：口径说明');
  r = await call('jinkui_query', { scope: 'stats' });
  okIf(!r.isError && r.text.includes('未来 12 个月应缴'), 'query stats：现金流');
  okIf(r.text.includes('状态分布'), 'query stats：状态分布');
  r = await call('jinkui_query', { scope: 'detail', policyName: '平安少儿重疾' });
  okIf(!r.isError && r.text.includes('已缴 1') && r.text.includes('下次缴费'), 'query detail：进度+下次缴费');
  okIf(r.text.includes('电子保单位置未登记'), 'query detail：补全引导');
  r = await call('jinkui_query', { scope: 'events', policyName: '平安少儿重疾' });
  okIf(!r.isError && r.text.includes('暂无事件'), 'query events：空流水');
  r = await call('jinkui_query', { scope: 'bad' });
  okIf(r.isError, 'query：scope 非法拒绝');
  r = await call('jinkui_query', { scope: 'detail', policyName: '不存在' });
  okIf(r.isError && r.text.includes('找不到'), 'query：未知保单拒绝');

  console.log('[mcp] 记事件');
  r = await call('jinkui_log', { type: 'pay', policyId: kidPolicyId, date: core.addDays(T, 13), note: '今年保费' });
  okIf(!r.isError && r.text.includes('已记缴费') && r.text.includes('已缴 2'), 'log pay：推进到第 2 期');
  okIf(r.text.includes('下次缴费'), 'log pay：下次缴费日');
  r = await call('jinkui_log', { type: 'reinstate', policyId: kidPolicyId });
  okIf(r.isError && r.text.includes('无需复效'), 'log reinstate：有效保单拒绝复效');
  r = await call('jinkui_log', { type: 'reinstate', policyId: graceId, note: '补缴复效' });
  okIf(!r.isError && r.text.includes('已记复效'), 'log reinstate：宽限期保单复效');
  r = await call('jinkui_query', { scope: 'detail', policyId: graceId });
  okIf(r.text.includes('有效'), 'log reinstate：复效后转有效');
  r = await call('jinkui_log', { type: 'claim', policyName: '平安少儿重疾', amount: 8000, note: '白血病赔付' });
  okIf(!r.isError && r.text.includes('获赔') && r.text.includes('累计理赔'), 'log claim：理赔流水');
  r = await call('jinkui_log', { type: 'endorse', policyName: '平安少儿重疾', note: '受益人改为妻子' });
  okIf(!r.isError && r.text.includes('已记批改'), 'log endorse：批改流水');
  r = await call('jinkui_log', { type: 'surrender', policyId: lapseId, date: T, amount: 3200 });
  okIf(!r.isError && r.text.includes('已记退保') && r.text.includes('现金价值'), 'log surrender：退保+提醒');
  r = await call('jinkui_today', {});
  okIf(r.text.includes('已退保') && !r.text.includes('中止期'), 'today：退保后红榜消失');
  r = await call('jinkui_log', { type: 'bad', policyName: '平安少儿重疾' });
  okIf(r.isError && r.text.includes('type 必填'), 'log：type 枚举拒绝');
  r = await call('jinkui_log', { type: 'pay', policyName: '不存在' });
  okIf(r.isError && r.text.includes('找不到'), 'log：未知保单拒绝');

  console.log('[mcp] 更新');
  r = await call('jinkui_update', { kind: 'policy', id: kidPolicyId, patch: { premium: 4200, note: '续期涨价' } });
  okIf(!r.isError && r.text.includes('已更新保单') && r.text.includes('如实重推'), 'update policy：缴费参数提示重推');
  r = await call('jinkui_update', { kind: 'policy', id: kidPolicyId, patch: { name: '改名' } });
  okIf(r.isError && r.text.includes('不支持改名'), 'update policy：改名拒绝（判重锚点）');
  r = await call('jinkui_update', { kind: 'member', id: '未知', patch: { note: 'x' } });
  okIf(r.isError, 'update member：未知 id 拒绝');
  const members = [...store.keys()].filter((k) => k.startsWith('jinkui.member.'));
  const kidMemberId = members.map((k) => store.get(k)).find((m) => m.name === '大娃').id;
  r = await call('jinkui_update', { kind: 'member', id: kidMemberId, patch: { birthYear: 2020 } });
  okIf(!r.isError && r.text.includes('2020'), 'update member：出生年');

  console.log('[mcp] 删除（confirm 门 / 连带 / 护栏）');
  r = await call('jinkui_delete', { kind: 'policy', id: accId, confirm: false });
  okIf(r.isError && r.text.includes('confirm'), 'delete：无 confirm 拒绝');
  const memberSelfId = members.map((k) => store.get(k)).find((m) => m.name === '本人').id;
  r = await call('jinkui_delete', { kind: 'member', id: memberSelfId, confirm: true });
  okIf(r.isError && r.text.includes('名下有'), 'delete member：名下有保单拒删');
  r = await call('jinkui_delete', { kind: 'event', id: `pay|${kidPolicyId}|${core.addDays(T, 13)}`, confirm: true });
  okIf(!r.isError && r.text.includes('已删除事件'), 'delete event：误记流水删除');
  r = await call('jinkui_query', { scope: 'detail', policyId: kidPolicyId });
  okIf(r.text.includes('已缴 1'), 'delete event：进度回退');
  const evBefore = [...store.keys()].filter((k) => k.startsWith('jinkui.ev.')).length;
  r = await call('jinkui_delete', { kind: 'policy', id: kidPolicyId, confirm: true });
  okIf(!r.isError && r.text.includes('已删除保单'), 'delete policy：成功');
  const evAfter = [...store.keys()].filter((k) => k.startsWith('jinkui.ev.')).length;
  okIf(evAfter === evBefore - 2, `delete policy：连带清该单事件（${evBefore}→${evAfter}，pay 已先行删除，剩 claim/endorse 两条）`);

  // 清场
  for (const k of [...store.keys()].filter((k) => k.startsWith('jinkui.'))) store.delete(k);
  okIf([...store.keys()].filter((k) => k.startsWith('jinkui.')).length === 0, '清场：jinkui.* 键全净');
} catch (e) {
  failures.push(`异常中断：${e.message}`);
  console.error(e);
}

console.log('');
child.kill();
server.close();
if (failures.length) {
  console.error(`❌ mcp-verify ${failures.length} 项失败`);
  process.exit(1);
}
console.log(`✅ mcp-verify 通过（${passed} 项：建档/红黄榜/六 scope/记事件/更新/删除 全闭环）`);
process.exit(0);
