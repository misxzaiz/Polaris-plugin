#!/usr/bin/env node
/**
 * file-flow 真桥冒烟（需要 Polaris 宿主在运行；node test/smoke-real.mjs）
 *
 * 链路：本测试进程经 kvclient（真实宿主桥）读写 fileflow.* 键空间，
 * 拉起真实服务进程（service/flow.js <port> <appConfigDir>），
 * 走命令信箱完成「添加根 → 载入起步包 → dryrun → apply → 真实移动校验 →
 * undo → 还原校验 → 移除根」，全部文件操作发生在真实临时目录。
 *
 * 不 mock 任何一层：kv 是宿主 SqliteStorage，服务是生产入口，
 * 唯一隔离点是测试用的临时根目录（不碰用户真实文件夹）。
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { createKvClient } = require('../service/kvclient.js');

let passed = 0;
let failed = 0;
function t(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const K = {
  cmd: (n) => `fileflow.cmd.${n}`,
  result: (n) => `fileflow.result.${n}`,
};
let nonceSeq = 0;

async function call(kv, type, payload, timeoutMs = 90_000) {
  const nonce = `smoke${Date.now()}${nonceSeq++}`;
  await kv.kvSet(K.cmd(nonce), { type, payload: payload || {}, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(350);
    const r = await kv.kvGet(K.result(nonce)).catch(() => null);
    if (r) {
      await kv.kvDel(K.result(nonce)).catch(() => {});
      if (r.ok) return r.payload;
      throw new Error(r.error || '服务报错');
    }
  }
  throw new Error(`命令 ${type} 超时`);
}

async function waitHealth(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/__health', timeout: 1500 }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => resolve(res.statusCode === 200 ? JSON.parse(body) : null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
    if (ok) return ok;
    await sleep(400);
  }
  return null;
}

// ── 主流程 ──
console.log('file-flow 真桥冒烟');
const kv = createKvClient({ appConfigDir: '', log: () => {} });

// 桥预检
try {
  await kv.kvKeys();
  console.log('  ✓ 宿主桥可达（kv keys 探测通过）');
} catch (e) {
  console.log(`  ✗ 宿主桥不可达：${e.message}——请先启动 Polaris 宿主再跑本冒烟`);
  process.exit(2);
}

// 服务进程（独立端口，appConfigDir 留空走自发现）
const servicePort = 19900 + Math.floor(Math.random() * 500);
const serviceBin = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'service', 'flow.js');
const proc = spawn(process.execPath, [serviceBin, String(servicePort), ''], { stdio: ['ignore', 'ignore', 'pipe'] });
let serviceLog = '';
proc.stderr.on('data', (d) => { serviceLog += d; });

try {
  const health = await waitHealth(servicePort);
  t('服务进程健康端点 200', !!health, serviceLog.slice(-300));
  t('健康端点报 bridge=ok', health && health.bridge === 'ok', JSON.stringify(health));

  // 等首轮 loadState + 快照
  await sleep(1500);

  // ── 测试根目录（真实临时目录）──
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileflow-smoke-'));
  const old = Date.now() - 40 * 24 * 3600 * 1000; // 40 天前：过冷存年龄、过护栏
  for (const f of ['installer.exe', 'report.pdf', 'photo.png']) {
    fs.writeFileSync(path.join(rootDir, f), `content-of-${f}`);
    fs.utimesSync(path.join(rootDir, f), new Date(old), new Date(old));
  }
  fs.writeFileSync(path.join(rootDir, 'fresh.exe'), 'just-downloaded'); // 新文件：护栏拦下
  console.log(`  测试根：${rootDir}`);

  // ── 添加根 ──
  const addRes = await call(kv, 'roots_add', { path: rootDir, label: '冒烟下载夹', auto: 'off' }); // off：防自动模式抢先整理
  t('roots_add 成功', Array.isArray(addRes.roots) && addRes.roots.some((r) => r.label === '冒烟下载夹'));
  const myRoot = addRes.roots.find((r) => r.path.toLowerCase() === rootDir.toLowerCase());
  t('根 id 已分配', !!(myRoot && myRoot.id), JSON.stringify(addRes.roots));

  // ── 预置包 ──
  const presetRes = await call(kv, 'rules_preset', { rootId: myRoot.id, packId: 'downloads' });
  t('起步包载入 7 条', presetRes.added === 7, `added=${presetRes.added}`);
  const preset2 = await call(kv, 'rules_preset', { rootId: myRoot.id, packId: 'downloads' });
  t('起步包幂等（二次载入 added=0）', preset2.added === 0, `added=${preset2.added}`);

  // ── dryrun ──
  const plan = await call(kv, 'dryrun', { rootId: myRoot.id }, 120_000);
  t('dryrun 命中 3 个旧文件', plan.opTotal === 3, JSON.stringify(plan.counts));
  t('护栏拦下 fresh.exe', plan.counts.guard === 1, JSON.stringify(plan.counts));
  const exeOp = plan.ops.find((o) => o.fromRel === 'installer.exe');
  t('exe 计划进 安装包/年-月', exeOp && /^安装包\\\d{4}-\d{2}\\installer\.exe$/.test(exeOp.toRel), exeOp && exeOp.toRel);
  t('全部为根内 safe op', plan.outsideOps === 0 && plan.safeOps === 3);

  // ── apply（手动确认）──
  const applyRes = await call(kv, 'apply', { rootId: myRoot.id, planId: plan.planId, confirm: true }, 150_000);
  t('apply 入队返回', applyRes.queued === true && !!applyRes.planId);

  // 轮询批次落 kv
  let batch = null;
  for (let i = 0; i < 100 && !batch; i++) {
    await sleep(400);
    const keys = await kv.kvKeys();
    for (const k of keys.filter((x) => x.startsWith('fileflow.batch.'))) {
      const b = await kv.kvGet(k).catch(() => null);
      if (b && b.planId === plan.planId) { batch = b; break; }
    }
  }
  t('批次日志落 kv', !!batch);
  t('批次 3 done 0 failed', batch && batch.summary.done === 3 && batch.summary.failed === 0, batch && JSON.stringify(batch.summary));
  t('fresh.exe 未被移动（护栏）', fs.existsSync(path.join(rootDir, 'fresh.exe')));
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  t('exe 真实移动到位', fs.existsSync(path.join(rootDir, '安装包', `${year}-${month}`, 'installer.exe')));
  t('pdf 真实移动到位', fs.existsSync(path.join(rootDir, '文档', 'report.pdf')));
  t('png 真实移动到位', fs.existsSync(path.join(rootDir, '图片', 'photo.png')));

  // ── 二次 dryrun：目的子树排除，无新计划 ──
  const plan2 = await call(kv, 'dryrun', { rootId: myRoot.id }, 120_000);
  t('二次 dryrun 无动作（目的子树排除）', plan2.opTotal === 0, JSON.stringify(plan2.counts));

  // ── undo ──
  const undoRes = await call(kv, 'undo', { batchId: batch.batchId, confirm: true }, 150_000);
  t('撤销回移 3 个', undoRes.undone === 3 && undoRes.failed === 0, JSON.stringify({ undone: undoRes.undone, failed: undoRes.failed }));
  t('exe 已还原原位', fs.existsSync(path.join(rootDir, 'installer.exe')));
  t('归档位置已空', !fs.existsSync(path.join(rootDir, '安装包', `${year}-${month}`, 'installer.exe')));

  // ── apply 无 confirm 必须被拒 ──
  let rejected = false;
  try { await call(kv, 'apply', { rootId: myRoot.id }); } catch (e) { rejected = /confirm/.test(e.message); }
  t('apply 缺 confirm 被拒', rejected);

  // ── 快照与状态 ──
  const snap = await kv.kvGet('fileflow.snapshot');
  t('快照含本根且报未监听（auto=off）', !!(snap && snap.roots.some((r) => r.id === myRoot.id && r.watched === false)));

  // ── 收尾：移除根 + 规则停用 + 清理临时目录 ──
  await call(kv, 'roots_remove', { id: myRoot.id });
  const rulesAfter = await kv.kvGet('fileflow.rules');
  t('移除根后其规则全部停用', rulesAfter && rulesAfter.rules.filter((r) => r.rootId === myRoot.id && r.enabled).length === 0);
  fs.rmSync(rootDir, { recursive: true, force: true });

  console.log(`\n真桥冒烟：${passed} 通过，${failed} 失败`);
} catch (e) {
  failed++;
  console.error(`\n冒烟中断：${e.message}`);
  console.error('服务日志尾部：\n' + serviceLog.slice(-1500));
} finally {
  proc.kill();
}

process.exit(failed ? 1 : 0);
