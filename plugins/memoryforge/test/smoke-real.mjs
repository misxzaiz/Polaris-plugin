/**
 * 记忆熔炉真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 防护：启动前若 cap.kv 里已存在任何 memoryforge.* 键（真实用户数据），拒绝执行。
 *
 * 流程（全部走真实桥与真实 MCP 进程，MCP 无 env 注入，验证 anchor→config 自发现）：
 *   1. MCP initialize / tools/list（7 个工具）
 *   2. memoryforge_import_cards 真实写 kv（含自动建牌组）
 *   3. 面板读路径等价验证：kv list → 前缀过滤 → get 回读卡片完整字段
 *   4. memoryforge_search_cards / memoryforge_list_due
 *   5. memoryforge_grade_card：调度落库（due/ease/history 变化）+ 连击写 meta
 *   6. memoryforge_stats
 *   7. memoryforge_extract_url 抓 example.com（真实外网，免跨域落点）
 *   8. memoryforge_remove_cards + 清理全部 memoryforge.* 键（真实 kv 恢复原状）
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const APP_ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));

// ── 真实桥端点（与 MCP 服务同规则：anchor → config）────────────────────────
function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function bridgeDispatch(target, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`bridge 响应非 JSON：${b.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); if (!r.ok) throw new Error('kv list: ' + r.error); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// ── 真实 MCP（stdio JSON-RPC）──────────────────────────────────────────────
const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), path.join(process.env.APPDATA || '', 'Polaris')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
});
const mcpErr = [];
mcp.stderr.on('data', (c) => mcpErr.push(String(c)));
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
    let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
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
  const r = await rpc('tools/call', { name, arguments: args });
  if (!r.result) throw new Error(`tool ${name} 无 result: ${JSON.stringify(r).slice(0, 200)}`);
  return { text: r.result.content?.[0]?.text || '', isError: !!r.result.isError };
};

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  // ── 0. 防护：真实卡库必须为空 ────────────────────────────────────────────
  const preKeys = (await kvKeys()).filter((k) => k.startsWith('memoryforge.'));
  if (preKeys.length > 0) {
    console.error(`[smoke] 检测到 ${preKeys.length} 个 memoryforge.* 键（疑似真实数据），拒绝执行以防污染：`);
    console.error(preKeys.slice(0, 10).join('\n'));
    process.exit(1);
  }

  // ── 1. MCP 握手 ────────────────────────────────────────────────────────
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lst = await rpc('tools/list', {});
  record('MCP 自发现真实桥（anchor→config，无 env 注入）并 tools/list',
    lst.result.tools.length === 7,
    lst.result.tools.map((t) => t.name).join(', '));

  // ── 2. 制卡（真实写 kv，自动建牌组）────────────────────────────────────
  const imp = await call('memoryforge_import_cards', {
    deck: '冒烟牌组',
    source: '冒烟测试',
    cards: [
      { front: '冒烟：SM-2 的 ease 下限是多少？', back: '1.3', tags: ['冒烟', '算法'] },
      { front: '冒烟：学习步第一歩多少分钟？', back: '10 分钟' },
      { front: '', back: '这张应被拒' },
    ],
  });
  record('memoryforge_import_cards：2 张入库 + 1 张非法被拒（自动建「冒烟牌组」）',
    !imp.isError && /已导入 2 张/.test(imp.text) && /1 张被拒/.test(imp.text), imp.text.split('\n')[0]);

  // ── 3. 面板读路径等价验证（kv list → 前缀过滤 → get 完整字段）────────────
  const keys = await kvKeys();
  const cardKeys = keys.filter((k) => k.startsWith('memoryforge.card.'));
  const deckKeys = keys.filter((k) => k.startsWith('memoryforge.deck.'));
  const cardVals = await Promise.all(cardKeys.map((k) => kvGet(k)));
  const okShape = cardVals.length === 2 && cardVals.every((c) => c && c.id && c.front && c.status === 'new' && Array.isArray(c.tags) && typeof c.due === 'number' && Array.isArray(c.history));
  const decks = await Promise.all(deckKeys.map((k) => kvGet(k)));
  record('面板读路径（loadSnapshot 等价）：2 张卡字段完整 + 牌组已建',
    okShape && decks.length === 1 && decks[0].name === '冒烟牌组',
    `cards=${cardVals.length} decks=${decks.length}`);

  // ── 4. 检索 + 出题 ──────────────────────────────────────────────────────
  const sr = await call('memoryforge_search_cards', { query: 'ease 下限' });
  record('memoryforge_search_cards 关键词命中', !sr.isError && /1\.3/.test(sr.text), sr.text.split('\n')[0]);
  const ld = await call('memoryforge_list_due', { limit: 5 });
  record('memoryforge_list_due 出题（2 张新卡在限额内）',
    !ld.isError && /\[c/.test(ld.text) && /队列 2 张/.test(ld.text), ld.text.split('\n')[0]);

  // ── 5. 评分：调度落库 + 连击 ────────────────────────────────────────────
  const targetId = cardVals[0].id;
  const gr = await call('memoryforge_grade_card', { cardId: targetId, grade: 2 });
  const after = await kvGet(`memoryforge.card.${targetId}`);
  const meta = await kvGet('memoryforge.meta');
  record('memoryforge_grade_card：状态机推进（new→learning 步1，due=+1 天）+ 连击落 meta',
    !gr.isError
    && after.status === 'learning'
    && after.intervalMin === 1440
    && Math.abs(after.due - (after.updatedAt + 1440 * 60000)) < 2000
    && after.history.length === 1 && after.history[0].g === 2
    && meta?.streak?.count >= 1,
    gr.text.split('\n')[1] || gr.text.split('\n')[0]);

  // ── 6. 统计 ─────────────────────────────────────────────────────────────
  const st = await call('memoryforge_stats', {});
  record('memoryforge_stats：总量/到期/连击/留存汇总',
    !st.isError && /卡库 2 张/.test(st.text) && /连击 1 天/.test(st.text), st.text.split('\n')[0]);

  // ── 7. 免跨域抓取（真实外网）───────────────────────────────────────────
  const ex = await call('memoryforge_extract_url', { url: 'https://example.com/' });
  record('memoryforge_extract_url：原生 fetch 抓公网页面（免跨域落点）',
    !ex.isError && /example domain/i.test(ex.text) && /HTTP 200/.test(ex.text),
    (ex.text.split('\n').find((l) => l.startsWith('URL')) || '').slice(0, 60));
  const ssrf = await call('memoryforge_extract_url', { url: 'http://127.0.0.1:9820/api/health' });
  record('memoryforge_extract_url：内网地址被 SSRF 防护拒绝', ssrf.isError, ssrf.text.split('\n')[0]);

  // ── 8. 删除 + 清理 ──────────────────────────────────────────────────────
  const rm = await call('memoryforge_remove_cards', { cardIds: cardVals.map((c) => c.id) });
  record('memoryforge_remove_cards 按 id 删除', !rm.isError && /已删除 2 张/.test(rm.text), rm.text.split('\n')[0]);
  console.log('[smoke] 冒烟项全部执行完毕，开始清理…');
} catch (e) {
  record('流程', false, e.message);
  console.error('MCP stderr 尾部：', mcpErr.join('').slice(-1200));
} finally {
  mcp.kill();
  await new Promise((r) => setTimeout(r, 600));
  try {
    const keys = await kvKeys();
    const mine = keys.filter((k) => k.startsWith('memoryforge.'));
    await Promise.all(mine.map((k) => kvDel(k)));
    console.log(`[smoke] 已清理 ${mine.length} 个 memoryforge.* 键，真实 kv 恢复原状`);
  } catch (e) {
    console.error('[smoke] 清理失败（可手动删 memoryforge.* 键）：', e.message);
  }
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
