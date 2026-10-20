#!/usr/bin/env node
/**
 * 浮窗 HTTP 通路级驱动测试（A 部分 no-op 浏览器 — 确定性 HTTP 语义；B 部分 真实 Edge — 页面送达验证）
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const { OverlayHost } = require('../mcp/overlay-host.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(name, cond, info = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${info ? ' —— ' + info : ''}`);
  if (!cond) failed++;
}

async function main() {
  // ── A. no-op 浏览器：确定性 HTTP 语义 ──────────────────────────────────────
  const host = new OverlayHost({ onAudit: () => {} });
  await host.start();
  const port = host.getPort();
  host._launchBrowser = async () => {}; // 不开真浏览器，专注 HTTP 通路

  const createP = host.create(
    { mode: 'input', title: 'drv 输入', reason: '驱动测试', message: '请提交 hi', timeoutSec: 20, keepOpen: false },
    { owner: 'drv' }
  );
  await sleep(200);
  const ids = [...host.overlays.keys()];
  check('A1 浮窗创建', ids.length === 1);
  const id = ids[0];
  const ov = host.overlays.get(id);

  // bootstrap GET（带 Host 头）
  const page = await fetch(`http://127.0.0.1:${port}/ov/${id}?cb=${ov.cb}`, { headers: { Host: `127.0.0.1:${port}` } });
  const html = await page.text();
  check('A2 bootstrap 200 + 页面', page.status === 200 && html.includes('submitBtn'), `status=${page.status}`);
  const m = html.match(/var SESSION = "([A-Za-z0-9_-]+)"/);
  check('A3 SESSION 内嵌', !!m);
  const session = m && m[1];

  // 二次消费同一 cb 应 403（单次性）
  const dup = await fetch(`http://127.0.0.1:${port}/ov/${id}?cb=${ov.cb}`, { headers: { Host: `127.0.0.1:${port}` } });
  check('A4 cb 单次消费', dup.status === 403, `status=${dup.status}`);

  // 坏 token 提交应 403
  const bad = await fetch(`http://127.0.0.1:${port}/ov/${id}/submit`, {
    method: 'POST',
    headers: { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'evil' }),
  });
  check('A5 坏 token 拒绝', bad.status === 403, `status=${bad.status}`);

  // 跨域 Origin 拒绝
  const xOrigin = await fetch(`http://127.0.0.1:${port}/ov/${id}/submit`, {
    method: 'POST',
    headers: { Host: `127.0.0.1:${port}`, Origin: 'http://evil.example', Authorization: 'Bearer ' + session, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'evil' }),
  });
  check('A6 跨站 Origin 拒绝', xOrigin.status === 403, `status=${xOrigin.status}`);

  // 合法提交 → 等待者 resolve
  const sub = await fetch(`http://127.0.0.1:${port}/ov/${id}/submit`, {
    method: 'POST',
    headers: { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, Authorization: 'Bearer ' + session, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'hi', meta: {} }),
  });
  check('A7 合法提交 200', sub.status === 200, await sub.text());
  const res = await createP;
  check('A8 wait resolve submitted', res.status === 'submitted' && res.value === 'hi', JSON.stringify({ status: res.status, value: res.value }));
  await sleep(400);
  check('A9 提交后自动收窗（keepOpen=false）', !host.overlays.has(id));

  // show 型
  const show = await host.create({ mode: 'show', title: 'drv show', reason: 'x', text: '内容', timeoutSec: 15 }, { owner: 'drv' });
  check('B0 show 创建', show.status === 'created' && !!show.id);
  const up = await host.update(show.id, { text: '更新内容' });
  check('B1 update', up.status === 'updated');
  const ls = host.list();
  check('B2 list', ls.some((e) => e.id === show.id));
  const cl = await host.close(show.id, 'drv_done');
  check('B3 close', cl.ok === true);

  await host.stop();

  // ── C. 真实 Edge：页面送达验证（overlay_open 审计事件 == Edge 拿到 200 页面）──
  const audits = [];
  const host2 = new OverlayHost({ onAudit: (e) => audits.push(e) });
  await host2.start();
  const show2 = host2.create(
    { mode: 'input', title: 'drv-edge 验证', reason: 'edge 页面送达验证', message: '不需要输入', timeoutSec: 12 },
    { owner: 'drv' }
  ).catch((e) => ({ status: 'error', err: String(e) }));
  const deadline = Date.now() + 20000;
  let pageOpened = false;
  while (Date.now() < deadline) {
    if (audits.some((e) => e.event === 'overlay_open')) { pageOpened = true; break; }
    await sleep(300);
  }
  check('C1 Edge 启动并成功渲染页面（overlay_open）', pageOpened, audits.map((e) => e.event).join(',') || '(无审计)');
  // 断开：关掉所有浮窗（Edge 进程随之清理）
  for (const id of [...host2.overlays.keys()]) await host2.close(id, 'drv_done');
  await show2;
  await host2.stop();

  console.log(failed ? `\nFAILED ${failed}` : '\n全部通过');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('驱动失败:', e); process.exit(2); });
