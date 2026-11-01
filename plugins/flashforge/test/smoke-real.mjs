/**
 * 闪造真实环境冒烟（node test/smoke-real.mjs）
 * 前提：目标 Polaris 实例运行中。真实 MCP server 走 anchor→config 自发现真实桥，
 * 执行 spec §八 P0 十步；最后只清理本冒烟产生的键。
 *
 * 环境变量：
 *   POLARIS_SMOKE_CONFIG  指定 config.json 路径（默认 anchor.json→dataRoot/config.json；
 *                         测 dev 实例时指向 %APPDATA%/Polaris-dev/config.json）
 *
 * ⚠️ 全程禁用 cap.kv list（实测大数据根上会拖垮宿主）：安全闸与清理走
 *    ff.apps 索引 + 已知键名。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const kvclient = require('../mcp/kvclient.js');

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function loadEndpoint() {
  if (process.env.POLARIS_SMOKE_CONFIG) {
    const cfg = JSON.parse(fs.readFileSync(process.env.POLARIS_SMOKE_CONFIG, 'utf8'));
    return { port: cfg.web.port, token: cfg.web.token || '' };
  }
  const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { port: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
console.log(`[smoke] 目标实例 127.0.0.1:${EP.port}`);

function bridgeDispatchOnce(target, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: '127.0.0.1', port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`dispatch 超时 ${timeoutMs}ms（宿主 dispatch 通道不健康？）`)); });
    req.write(data);
    req.end();
  });
}
/** 直连桥调用：dev 实例窗口初始化期偶发瞬断，重试 2 次 */
async function bridgeDispatch(target, payload, timeoutMs = 15000) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await bridgeDispatchOnce(target, payload, timeoutMs);
      if (i > 0) console.log(`[smoke] 第 ${i + 1} 次尝试成功`);
      return r;
    } catch (e) {
      lastErr = e;
      if (i < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); return r.ok ? (r.result?.value ?? null) : null; }
async function kvSet(k, v) { return bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

// 先确认真实桥可用（get 是安全操作）
const probe = await bridgeDispatch('cap.kv', { action: 'get', key: '__smoke_probe__' }).catch((e) => ({ ok: false, error: e.message }));
if (!probe.ok) { console.error(`✗ 真实桥不可达或 dispatch 不健康：${probe.error || JSON.stringify(probe).slice(0, 120)}`); process.exit(1); }
console.log('[smoke] 真实桥 dispatch 可达');

// 安全闸（无 list 版）：ff.apps 索引非空 = 可能存在用户真实应用，拒绝执行
const preIndex = await kvGet('ff.apps');
if (Array.isArray(preIndex) && preIndex.length > 0) {
  console.error(`✗ 检测到索引里已有 ${preIndex.length} 个应用（可能是真实数据），为防误删拒绝执行。`);
  process.exit(1);
}

const mcp = spawn(process.execPath, ['mcp/server.js', path.join(os.homedir(), '.polaris-smoke-does-not-exist')], {
  cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ...(process.env.POLARIS_SMOKE_CONFIG ? {
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: String(EP.port),
      POLARIS_TOKEN: EP.token,
    } : {}),
  },
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

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`); };

// 冒烟应用：真实可玩的极简弹球（含成绩协议与触屏支持）
const GAME_V1 = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0b0e14;color:#eee;font-family:sans-serif;overflow:hidden}
#s{position:fixed;top:8px;left:10px;font-size:18px}</style></head>
<body><div id="s">点击接球 · 0</div><script>
const s=document.getElementById('s');let score=0;let x=100,y=60,vx=2.2,vy=1.8,paddle=120;
function onTap(e){const t=e.touches?e.touches[0].clientX:(e.clientX||paddle);paddle=t;score++;s.textContent='点击接球 · '+score;
parent.postMessage({__ff:1,type:'score',score},'*');}
addEventListener('pointermove',onTap);addEventListener('pointerdown',onTap);
function loop(){x+=vx;y+=vy;if(x<0||x>innerWidth-8)vx=-vx;if(y<0)vy=-vy;if(y>innerHeight-20)vy=-vy;
requestAnimationFrame(loop)}loop();
</` + `script></body></html>`;
const GAME_V2 = GAME_V1.replace('vx=2.2,vy=1.8', 'vx=3.4,vy=2.6').replace('点击接球 · 0', '闪电弹球 · 0');
const shaOf = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

try {
  // ⓪ kvclient 自发现单步断言
  {
    const saved = { ...process.env };
    delete process.env.POLARIS_HOST; delete process.env.POLARIS_PORT; delete process.env.POLARIS_TOKEN;
    const viaCfg = kvclient.loadWebConfig();
    Object.assign(process.env, saved);
    record('⓪ kvclient.loadWebConfig 自发现代码路径', !!viaCfg && typeof viaCfg.port === 'number' && viaCfg.port > 0,
      viaCfg ? `port=${viaCfg.port}` : 'null');
  }
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // ⑩ tools/list = 七工具（提前到最前，失败即环境级问题）
  const tl = await rpc('tools/list', {});
  const names = (tl.result.tools || []).map((t) => t.name);
  const wantTools = ['ff_create', 'ff_iterate', 'ff_source', 'ff_list', 'ff_push', 'ff_score', 'ff_delete'];
  record('⑩ tools/list 七工具齐备', wantTools.every((t) => names.includes(t)) && names.length === 7, names.join(','));

  // ① ff_create 真实游戏
  const c1 = await rpc('tools/call', { name: 'ff_create', arguments: { title: '冒烟·闪电弹球', kind: 'game', html: GAME_V1, changelog: '初版', tags: ['冒烟'] } });
  const appId = (textOf(c1).match(/id=(f[a-z0-9]+)/) || [])[1];
  record('① ff_create 入库 v1', !c1.result.isError && !!appId, textOf(c1).split('\n')[0]);

  // ② ff_list 可见
  const l1 = await rpc('tools/call', { name: 'ff_list', arguments: {} });
  record('② ff_list 可见新应用', !l1.result.isError && textOf(l1).includes(appId), textOf(l1).split('\n')[1] || '');

  // ③ ff_source 回环一致
  const s1 = await rpc('tools/call', { name: 'ff_source', arguments: { id: appId } });
  record('③ ff_source 装配+sha 校验回环', !s1.result.isError && textOf(s1).includes(GAME_V1), textOf(s1).slice(0, 60));

  // ④ ff_iterate v2 + 版本只增不改
  const i1 = await rpc('tools/call', { name: 'ff_iterate', arguments: { id: appId, html: GAME_V2, changelog: '提速' } });
  const v2ok = !i1.result.isError && textOf(i1).includes('v2');
  const s2 = await rpc('tools/call', { name: 'ff_source', arguments: { id: appId } });
  const s1again = await rpc('tools/call', { name: 'ff_source', arguments: { id: appId, v: 1 } });
  record('④ ff_iterate v2 + v1 原样保留', v2ok && textOf(s2).includes(GAME_V2) && textOf(s1again).includes(GAME_V1), textOf(i1).split('\n')[0]);

  // ⑤ ff_push
  const p1 = await rpc('tools/call', { name: 'ff_push', arguments: { id: appId } });
  const pushedIdx = await kvGet('ff.apps');
  const pushedEntry = Array.isArray(pushedIdx) ? pushedIdx.find((x) => x && x.id === appId) : null;
  record('⑤ ff_push 标记+索引持久化', !p1.result.isError && !!pushedEntry && typeof pushedEntry.pushedAt === 'number', textOf(p1).split('。')[0]);

  // ⑥ 成绩数据面（模拟面板写入两条）→ ff_score list 排序
  const now = Date.now();
  await kvSet(`ff.score.${appId}`, [
    { score: 7, player: '冒烟甲', device: '桌面', ts: now - 1000 },
    { score: 12, player: '冒烟乙', device: '手机', ts: now },
  ]);
  const sc1 = await rpc('tools/call', { name: 'ff_score', arguments: { action: 'list', id: appId } });
  const scTxt = textOf(sc1);
  record('⑥ ff_score 跨端成绩读榜排序', !sc1.result.isError && scTxt.indexOf('12') < scTxt.indexOf('7') && scTxt.includes('冒烟乙'), scTxt.split('\n')[1] || '');

  // ⑦ 扫描闸：联网代码拒绝入库（且不产生脏条目）
  const idxBefore = (await kvGet('ff.apps')).length;
  const bad = await rpc('tools/call', { name: 'ff_create', arguments: { title: '坏应用', kind: 'tool', html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body><script>fetch('/x')</` + `script></body></html>` } });
  const idxAfter = (await kvGet('ff.apps')).length;
  record('⑦ 扫描闸拒绝联网代码且无脏条目', bad.result.isError && textOf(bad).includes('fetch') && idxBefore === idxAfter, textOf(bad).split('\n')[0]);

  // ⑦b WARN 放行：localStorage 给提醒但入库成功 → 用完即删
  const warnHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body><script>try{localStorage.setItem('k','v')}catch(e){}</` + `script></body></html>`;
  const w1 = await rpc('tools/call', { name: 'ff_create', arguments: { title: '冒烟·提醒样例', kind: 'tool', html: warnHtml } });
  const warnId = (textOf(w1).match(/id=(f[a-z0-9]+)/) || [])[1];
  record('⑦b WARN 放行并报告', !w1.result.isError && textOf(w1).includes('localStorage'), '');
  if (warnId) await rpc('tools/call', { name: 'ff_delete', arguments: { id: warnId, confirm: warnId } });

  // ⑧ 完整性校验：破坏 v1 首块 → ff_source 拒绝；恢复后可用
  const origPart = await kvGet(`ff.ver.${appId}.1.p.0`);
  if (!String(origPart).includes('点击接球')) throw new Error('冒烟内部错误：v1 首块不含预期锚点串');
  await kvSet(`ff.ver.${appId}.1.p.0`, String(origPart).replace('点击接球', '点击接球X'));
  const sBad = await rpc('tools/call', { name: 'ff_source', arguments: { id: appId, v: 1 } });
  const badRejected = sBad.result.isError && textOf(sBad).includes('完整性校验失败');
  await kvSet(`ff.ver.${appId}.1.p.0`, origPart);
  const sOk = await rpc('tools/call', { name: 'ff_source', arguments: { id: appId, v: 1 } });
  record('⑧ sha 完整性校验拦截篡改并可恢复', badRejected && !sOk.result.isError, textOf(sBad).slice(0, 80));

  // ⑨ 删除：错 confirm 拒绝、对 confirm 成功、键全部清空
  const dBad = await rpc('tools/call', { name: 'ff_delete', arguments: { id: appId, confirm: 'wrong' } });
  const dGood = await rpc('tools/call', { name: 'ff_delete', arguments: { id: appId, confirm: appId } });
  const idxEnd = await kvGet('ff.apps');
  const part0 = await kvGet(`ff.ver.${appId}.1.p.0`);
  const scoreGone = await kvGet(`ff.score.${appId}`);
  record('⑨ 删除两步确认+键全清',
    dBad.result.isError && !dGood.result.isError
    && (!Array.isArray(idxEnd) || !idxEnd.some((x) => x && x.id === appId))
    && (part0 === null || part0 === undefined) && (scoreGone === null || scoreGone === undefined),
    textOf(dGood).split('。')[0]);

  // 收尾：冒烟产生的键应为零残留（delete 已清；再补一刀以防中途失败）
  await kvDel(`ff.score.${appId}`);
  for (let v = 1; v <= 3; v++) {
    for (let i = 0; i < 12; i++) await kvDel(`ff.ver.${appId}.${v}.p.${i}`);
  }
} catch (e) {
  record('冒烟异常中断', false, e.message);
  console.error(stderrChunks.join(''));
} finally {
  mcp.kill();
}

const pass = results.filter((r) => r.pass).length;
console.log(`\n[smoke] ${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
