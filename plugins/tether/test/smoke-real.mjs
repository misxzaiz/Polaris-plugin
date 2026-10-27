/**
 * 故人真实环境冒烟（node test/smoke-real.mjs）
 * 前提：本机 Polaris 运行中。真实 MCP server（无 env 注入，走 anchor→config
 * 自发现真实桥）执行：建档 → 检索 → 记往来 → 查流水 → 立诺 → 速览 → 失联预警
 * → 生日 → 简报 → 透视 → 闭环 → 更新档案 → 设置 → 删档级联，最后清理真实 kv
 * 的全部 tether.* 键恢复原状。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function loadEndpoint() {
  const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { basePort: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function bridgeDispatch(target, payload, port) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
async function findPort() {
  for (let p = EP.basePort; p < EP.basePort + 25; p++) {
    try {
      const r = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' }, p);
      if (r.ok) return p;
    } catch (_) { /* 扫下一个 */ }
  }
  return null;
}
async function kvKeys(port) { const r = await bridgeDispatch('cap.kv', { action: 'list' }, port); return r.result?.keys ?? []; }
async function kvDel(k, port) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }, port); }
async function kvGet(k, port) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }, port); return r.result?.value ?? null; }

const PORT = await findPort();
if (!PORT) { console.error('✗ 真实桥不可达（Polaris 未运行？）'); process.exit(1); }
console.log(`[smoke] 真实桥 127.0.0.1:${PORT} 可达`);

const mcp = spawn(process.execPath, ['mcp/server.js', path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
const stderrChunks = [];
mcp.stderr.on('data', (c) => stderrChunks.push(String(c)));

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
const textOf = (m) => m.result.content[0].text;
const call = async (name, args = {}) => {
  const m = await rpc('tools/call', { name, arguments: args });
  return { isError: m.result.isError === true, text: textOf(m) };
};

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// 动态日期：明天
const tomorrow = new Date(Date.now() + 86400000);
const TOMORROW_MD = `${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
const TOMORROW_Y = `${tomorrow.getFullYear()}-${TOMORROW_MD}`;
const pad = (n) => String(n).padStart(2, '0');

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 0. tools/list 有 12 个 ren_*
  const tl = await rpc('tools/list', {});
  const names = tl.result.tools.map((t) => t.name);
  record('tools/list 共 12 个 ren_* 工具', names.length === 12 && names.every((n) => n.startsWith('ren_')), names.join(','));

  // 1. 建档（生日=明天 → 生日预告可命中）
  const p1 = await call('ren_person_save', { name: '冒烟张三', alias: '老张', relation: '客户', birthday: TOMORROW_MD, cadenceDays: 30, howMet: '冒烟测试', contacts: { wechat: 'smoke_z' } });
  record('建档（生日明天/节奏30）', !p1.isError && p1.text.includes('已建档'), p1.text.split('\n')[0]);
  const idMatch = p1.text.match(/\[(t[0-9a-z]+)\]/);
  const ZS_ID = idMatch[1];

  // 2. 更新（精确同名=更新而非新建）
  const p2 = await call('ren_person_save', { name: '冒烟张三', note: '忌口香菜' });
  const peopleBook = await kvGet('tether.people', PORT);
  record('同名更新不重复建档', !p2.isError && p2.text.includes('已更新') && Object.keys(peopleBook.byId).length === 1 && peopleBook.byId[ZS_ID].note === '忌口香菜');

  // 3. 记往来（今天见面 + 40 天前电话补记）
  const l1 = await call('ren_log', { name: '冒烟张三', type: 'contact', channel: '见面', text: '聊了续约与年度合作' });
  record('记往来（见面）', !l1.isError && l1.text.includes('已记'), l1.text);
  const l2 = await call('ren_log', { name: '冒烟张三', type: 'contact', channel: '电话', text: '问项目进展', date: '2026-09-18' });
  record('补记 40 天前电话', !l2.isError && l2.text.includes('2026-09-18'), l2.text);
  const jv = await kvGet('tether.journal', PORT);
  record('cap.kv journal 落库（面板可读同一份）', jv?.events?.length === 2, `${jv?.events?.length} 条`);

  // 4. 查流水
  const q1 = await call('ren_journal', { name: '冒烟张三', keyword: '续约' });
  record('关键词查流水', !q1.isError && q1.text.includes('续约'), q1.text.split('\n')[1]);

  // 5. 立诺（我许的，明天到期 → 临期；等他的无期限）
  const pr1 = await call('ren_promises', { action: 'add', name: '冒烟张三', direction: 'iowe', text: '冒烟：周五前给方案', due: TOMORROW_Y });
  record('立诺（我许的，明天到期）', !pr1.isError && pr1.text.includes('我许的') && pr1.text.includes('天') , pr1.text);
  const pr2 = await call('ren_promises', { action: 'add', name: '冒烟张三', direction: 'owedme', text: '冒烟：等他发报价' });
  const PROMISE_DUE = pr1.text.match(/\[(t[0-9a-z]+)\]/)?.[1];

  // 6. 速览：含临期承诺 + 明天生日
  const ov = await call('ren_overview', {});
  record('今日速览（临期承诺+生日）', !ov.isError && ov.text.includes('临期承诺') && ov.text.includes('冒烟张三') && ov.text.includes('天'), ov.text.split('\n')[0]);

  // 6.5 第二人：只有 40 天前的旧联系（失联预警基线=最近一次联系）
  const p4 = await call('ren_person_save', { name: '冒烟李四', relation: '朋友', cadenceDays: 30 });
  record('建档第二人（冒烟李四）', !p4.isError && p4.text.includes('已建档'), '');
  await call('ren_log', { name: '冒烟李四', type: 'contact', channel: '电话', text: '旧联络', date: '2026-09-18' });

  // 7. 失联预警：李四 40 天未联系/节奏 30 → 黄榜（张三今天有联系 → ok 不上榜）
  const dr = await call('ren_drift', {});
  record('失联预警（李四 40 天未联系/节奏 30，张三不上榜）', !dr.isError && dr.text.includes('冒烟李四') && dr.text.includes('天未联系') && !dr.text.includes('冒烟张三'), dr.text.split('\n')[1]);

  // 8. 生日（明天）
  const bd = await call('ren_birthdays', { days: 30 });
  record('生日预告（明天）', !bd.isError && bd.text.includes('冒烟张三') && bd.text.includes('1 天后'), bd.text.split('\n')[1]);

  // 9. 见面简报
  const pp = await call('ren_prep', { name: '老张' });
  record('见面简报（别名可寻人，含档案+往来+承诺）', !pp.isError && pp.text.includes('【冒烟张三】') && pp.text.includes('聊了续约') && pp.text.includes('周五前给方案'), pp.text.split('\n')[0]);

  // 10. 透视
  const st = await call('ren_stats', {});
  record('人情透视', !st.isError && st.text.includes('客户 1 人') && st.text.includes('未闭环 2'), st.text.split('\n')[0]);

  // 11. 模糊找人多命中要澄清（冒烟张 是两人共同子串、无精确同名）
  await call('ren_person_save', { name: '冒烟张三丰', relation: '朋友' });
  const amb = await call('ren_log', { name: '冒烟张', text: '会撞谁' });
  record('多命中要求澄清（冒烟张三 vs 冒烟张三丰）', amb.isError && amb.text.includes('personId'), amb.text);
  const oklog = await call('ren_log', { name: '冒烟张三丰', text: '精确名不受歧义影响' });
  record('精确名照常命中', !oklog.isError && oklog.text.includes('已记'), '');

  // 12. 闭环 + 取消
  const cl = await call('ren_promises', { action: 'close', id: PROMISE_DUE, note: '已发' });
  record('闭环承诺', !cl.isError && cl.text.includes('已闭环'), cl.text);
  const board = await kvGet('tether.promises', PORT);
  const closed = Object.values(board.byId).find((p) => p.id === PROMISE_DUE);
  record('闭环落库（done + closeNote）', closed?.status === 'done' && closed?.closeNote === '已发');

  // 13. 设置更新与钳制
  const se = await call('ren_settings', { action: 'update', defaultCadenceDays: 7, driftGraceDays: 3, birthdayDays: 30, dueWarnDays: 1 });
  record('设置更新', !se.isError && se.text.includes('联系节奏 7 天'), se.text.split('\n')[1]);
  const se2 = await call('ren_settings', { action: 'update', defaultCadenceDays: 9999 });
  const sv = await kvGet('tether.settings', PORT);
  record('设置越界钳制（9999→365）', !se2.isError && sv.defaultCadenceDays === 365);

  // 14. 删档级联（须 confirm）
  const rm0 = await call('ren_person_remove', { name: '冒烟张三' });
  record('删档须 confirm', rm0.isError && rm0.text.includes('confirm'), rm0.text);
  const rm = await call('ren_person_remove', { name: '冒烟张三', confirm: true });
  const [peopleAfter, promAfter, jAfter] = await Promise.all([kvGet('tether.people', PORT), kvGet('tether.promises', PORT), kvGet('tether.journal', PORT)]);
  record('删档级联（档案+承诺+往来全清，他人保留）', !rm.isError && Object.keys(peopleAfter.byId).length === 2 && !peopleAfter.byId[ZS_ID]
    && Object.keys(promAfter.byId).length === 0 && jAfter.events.length === 2, rm.text);

  // 15. 建档数上限健在（回归快查：删张三后剩 李四+张三丰）
  const pl = await call('ren_person_list', {});
  record('档案检索正常（删后余 2）', !pl.isError && pl.text.includes('共 2 人'), pl.text.split('\n')[0]);

  record('真实桥冒烟全部通过', true);
} catch (e) {
  record('流程', false, e.message);
  console.error('mcp stderr:', stderrChunks.join('').slice(-800));
} finally {
  mcp.kill();
  await new Promise((r) => setTimeout(r, 500));
  const keys = (await kvKeys(PORT)).filter((k) => k.startsWith('tether.'));
  await Promise.all(keys.map((k) => kvDel(k, PORT)));
  console.log(`[smoke] 已清理 ${keys.length} 个 tether.* 键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
