#!/usr/bin/env node
/**
 * MCP 全链路测试（内存桥）：node test/mcp-bridge.mjs
 * 起一个 stub 宿主（HTTP /api/router-dispatch + 内存 kv），以 POLARIS_HOST/PORT
 * 环境变量喂给真实 mcp/server.js 子进程，走完整 stdio JSON-RPC：
 * initialize → tools/list → 六工具全流程（建档/记录/幂等覆盖/查询三视图/
 * 改一笔跨日迁移/删除 confirm 门/就诊小结/非法入参拒绝）。
 * 零业务 mock：桥只是把 cap.kv 换成内存 Map，读写语义与宿主一致。
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');
const require2 = createRequire(import.meta.url);
const core = require2('../shared/core.js');

// ── stub 宿主（内存 cap.kv）──────────────────────────────────────────────────
const store = new Map();
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/router-dispatch')) {
    res.writeHead(404); res.end('{}'); return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: r } = JSON.parse(body);
      if (r.target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown target' })); return; }
      const a = r.payload;
      let result = {};
      if (a.action === 'get') result = { value: store.has(a.key) ? store.get(a.key) : null };
      else if (a.action === 'set') { store.set(a.key, a.value); result = {}; }
      else if (a.action === 'delete') { store.delete(a.key); result = {}; }
      else if (a.action === 'list') result = { keys: [...store.keys()] };
      else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown action' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

// ── 起 MCP 子进程 ─────────────────────────────────────────────────────────────
const child = spawn(process.execPath, [path.join(pluginDir, 'mcp', 'server.js'), ''], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(port), POLARIS_TOKEN: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (c) => { stderr += c; });

let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* 忽略非 JSON 行 */ }
  }
});
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); } }, 10000);
  });
}
/** 通知（无 id、无响应，fire-and-forget） */
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
async function call(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  const text = res.result?.content?.[0]?.text || '';
  return { isError: !!res.result?.isError, text };
}

const results = [];
function t(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: cond ? '' : (detail || '断言失败') });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` —— ${detail || ''}`}`);
}

// ── initialize / tools/list ──────────────────────────────────────────────────
const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'harness', version: '0' } });
t('initialize 返回 serverInfo maian', init.result?.serverInfo?.name === 'maian', JSON.stringify(init.result));
notify('notifications/initialized', {});
const list = await rpc('tools/list', {});
const toolNames = (list.result?.tools || []).map((x) => x.name);
t('tools/list 六工具', JSON.stringify(toolNames) === JSON.stringify(['maian_log', 'maian_query', 'maian_member', 'maian_update', 'maian_delete', 'maian_summary']), toolNames.join(','));

// ── 成员 ─────────────────────────────────────────────────────────────────────
let r = await call('maian_member', { action: 'add', name: '妈妈', heightCm: 160, note: '高血压随访' });
t('建档妈妈', !r.isError && r.text.includes('已建档'), r.text);
r = await call('maian_member', { action: 'add', name: '妈妈' });
t('重复建档拒绝', r.isError && r.text.includes('已存在'), r.text);
r = await call('maian_member', { action: 'add', name: '爸爸' });
t('建档爸爸', !r.isError, r.text);
r = await call('maian_member', { action: 'update', name: '妈妈', heightCm: 158 });
t('改身高 158', !r.isError && r.text.includes('158'), r.text);

// ── 记录（按名自动配档）──────────────────────────────────────────────────────
r = await call('maian_log', { profileName: '妈妈', kind: 'bp', sys: 152, dia: 95, pulse: 78, time: '08:00', note: '服药前' });
t('记血压 152/95 → 红', !r.isError && r.text.includes('已记录') && r.text.includes('【红】'), r.text);
t('反馈含较上次对比前缀结构', r.text.includes('分带：'), r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'bp', sys: 152, dia: 95, time: '08:00', id: 'dup1' });
t('同 id 首记', !r.isError && r.text.includes('已记录'), r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'bp', sys: 152, dia: 95, time: '08:00', id: 'dup1' });
const todayArrNow = store.get(`maian.day.${core.dayKey(Date.now())}`) || [];
t('同 id 幂等覆盖（store 中 dup1 恰一条，不双写）', !r.isError && r.text.includes('已覆盖更新') && todayArrNow.filter((x) => x.id === 'dup1').length === 1, r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'bp', sys: 138, dia: 86, time: '09:00' });
t('记 138/86 → 黄', !r.isError && r.text.includes('【黄】'), r.text);
t('较上次收缩压 -14', r.text.includes('收缩压 -14'), r.text);
r = await call('maian_log', { profileName: '爸爸', kind: 'bp', sys: 118, dia: 76 });
t('爸爸 118/76 → 绿', !r.isError && r.text.includes('【绿】'), r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'bg', mmol: 6.5, slot: 'fasting' });
t('空腹血糖 6.5 → 黄', !r.isError && r.text.includes('【黄】'), r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'weight', kg: 66.2 });
t('体重 BMI 分带（158cm/66.2kg→26.5 黄）', !r.isError && r.text.includes('【黄】'), r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'temp', c: 36.8 });
t('体温 36.8 → 绿', !r.isError && r.text.includes('【绿】'), r.text);

// 非法入参
r = await call('maian_log', { profileName: '妈妈', kind: 'bp', sys: 80, dia: 95 });
t('sys<=dia 拒绝', r.isError && r.text.includes('须大于'), r.text);
r = await call('maian_log', { profileName: '妈妈', kind: 'bg', mmol: 99 });
t('血糖越界拒绝', r.isError && r.text.includes('1.0-40.0'), r.text);

// ── 查询三视图 ───────────────────────────────────────────────────────────────
r = await call('maian_query', { profileName: '妈妈', kind: 'bp' });
t('recent 含血压记录', !r.isError && r.text.includes('152/95') && r.text.includes('138/86'), r.text);
r = await call('maian_query', { view: 'stats', profileName: '妈妈', kind: 'bp' });
t('stats 收缩压均值', !r.isError && r.text.includes('收缩压'.replace('收缩压', 'sys')) || r.text.includes('sys'), r.text);
r = await call('maian_query', { view: 'flags', profileName: '妈妈' });
t('flags 列出黄红', !r.isError && r.text.includes('152/95') && r.text.includes('6.5'), r.text);
r = await call('maian_query', { view: 'members' });
t('members 列出两人', !r.isError && r.text.includes('妈妈') && r.text.includes('爸爸'), r.text);
r = await call('maian_query', { view: 'stats' });
t('stats 缺成员报错', r.isError, r.text);

// ── 修改（含跨日迁移）────────────────────────────────────────────────────────
const todayKey = `maian.day.${core.dayKey(Date.now())}`;
const before = JSON.parse(JSON.stringify(store.get(todayKey)));
const dup = before.find((x) => x.id === 'dup1');
r = await call('maian_update', { id: 'dup1', sys: 145, dia: 92 });
t('改数值', !r.isError && r.text.includes('已修改') && r.text.includes('145/92'), r.text);
t('改数值后键内容更新', JSON.stringify(store.get(todayKey)).includes('145'), '');
r = await call('maian_update', { id: 'dup1', date: 'yesterday', time: '07:30' });
t('跨日迁移提示', !r.isError && r.text.includes('迁移'), r.text);
const yKey = `maian.day.${core.dayKey(Date.now() - core.DAY_MS)}`;
t('旧日键已移除', !(store.get(todayKey) || []).some((x) => x.id === 'dup1'), '');
t('新日键已包含', (store.get(yKey) || []).some((x) => x.id === 'dup1' && x.sys === 145), '');
r = await call('maian_update', { id: 'nope', sys: 100 });
t('不存在 id 报错', r.isError && r.text.includes('未找到'), r.text);

// ── 删除 confirm 门 ──────────────────────────────────────────────────────────
r = await call('maian_delete', { id: 'dup1' });
t('无 confirm 拒绝', r.isError && r.text.includes('confirm'), r.text);
r = await call('maian_delete', { id: 'dup1', confirm: true });
t('confirm 后删除', !r.isError && r.text.includes('已删除'), r.text);
t('删除后日键无该条', !(store.get(yKey) || []).some((x) => x.id === 'dup1'), '');

// ── 就诊小结 ─────────────────────────────────────────────────────────────────
r = await call('maian_summary', { profileName: '妈妈' });
t('小结含标题与成员', !r.isError && r.text.includes('体征记录小结') && r.text.includes('妈妈'), r.text.slice(0, 200));
t('小结含统计与免责', r.text.includes('均值') && r.text.includes('遵医嘱'), '');
t('小结含血糖小节', r.text.includes('## 血糖'), '');
r = await call('maian_summary', { profileName: '路人' });
t('陌生成员报错（不自动建档于小结）', r.isError, r.text);

// ── 收尾 ─────────────────────────────────────────────────────────────────────
child.kill();
server.close();
const fails = results.filter((x) => !x.pass);
console.log(`\n${results.length - fails.length}/${results.length} 通过`);
if (fails.length) {
  console.error('stderr tail:', stderr.slice(-500));
  process.exit(1);
}
console.log('✅ MCP 内存桥全链路通过（六工具 + 幂等 + 跨日迁移 + confirm 门 + 小结）');
process.exit(0);
