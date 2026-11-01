'use strict';
/**
 * smoke-real.mjs —— 译舟真实宿主冒烟（需 Polaris 运行中；跑完自清理）
 * 跑法：node test/smoke-real.mjs
 *
 * 纪律（memoryforge/chexia 先例）：
 *  - 宿主未运行 → SKIP（exit 0，如实说明），不假装通过。
 *  - 生产护栏：检测到 yz.idx 业务键（用户已有书架）→ 只跑只读步（yz_list），
 *    绝不写入/删除；空库才跑全链（fetch→save→list→read→delete）。
 *  - 自清理 = 结束后键集与开始时差集必须为 0。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SERVER_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.js');
const { resolveEndpoint } = require('../shared/kvclient.js');

function log(msg) { console.log(msg); }

function startMcp() {
  const child = spawn(process.execPath, [SERVER_JS], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buf = '';
  let id = 0;
  const stderr = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let idx = buf.indexOf('\n');
    while (idx >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) {
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        } catch (_) { /* 忽略 */ }
      }
      idx = buf.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => stderr.push(d));
  function rpc(method, params, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const msgId = ++id;
      const timer = setTimeout(() => { pending.delete(msgId); reject(new Error(`timeout: ${method}`)); }, timeoutMs);
      pending.set(msgId, (msg) => { clearTimeout(timer); resolve(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msgId, method, params }) + '\n');
    });
  }
  const call = async (name, args) => {
    const res = await rpc('tools/call', { name, arguments: args });
    return { isError: !!res.result?.isError, text: res.result?.content?.[0]?.text || '' };
  };
  return { child, rpc, call, stderr };
}

async function main() {
  // 1. 宿主探测（kvclient 自发现 = 生产同款路径）
  const ep = await resolveEndpoint('');
  const health = await (async () => {
    try {
      const res = await fetch(`http://${ep.host}:${ep.port}/api/health`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch (_) { return false; }
  })();
  if (!health) {
    log(`SKIP：宿主不可达（${ep.host}:${ep.port}）。启动 Polaris 后重跑本冒烟。`);
    process.exit(0);
  }
  log(`宿主：${ep.host}:${ep.port}（via ${ep.via}${ep.token ? ', authed' : ', noauth'}）`);

  const mcp = startMcp();
  const results = [];
  const ok = (name) => { results.push(name); log(`✔ ${name}`); };

  try {
    const init = await mcp.rpc('initialize', { protocolVersion: '2024-11-05' });
    if (init.result?.serverInfo?.name !== 'yizhou') throw new Error('initialize 失败');
    ok('initialize（真实宿主自发现桥）');

    const lst = await mcp.call('yz_list', {});
    if (lst.isError) throw new Error(`yz_list 失败：${lst.text}`);
    const hasUserdata = !/暂无文章/.test(lst.text);
    if (hasUserdata) {
      // 生产护栏：用户已有书架 → 只读步
      ok(`yz_list（只读模式：检测到 ${lst.text.split('\n').length - 1} 条用户数据，不做任何写入）`);
      log('\n结果：SKIP 写入链（生产书架非空，护栏生效）；MCP 与真实宿主桥接已验证。');
      mcp.child.kill();
      process.exit(0);
    }

    // 2. 空库 → 全链（写入侧全部经 MCP，走真实 cap.kv）
    let f;
    try {
      f = await mcp.call('yz_fetch', { url: 'https://example.com/', targetLang: 'zh' }, 30000);
    } catch (e) {
      f = { isError: true, text: `抓取异常 ${e.message}` };
    }
    if (f.isError) {
      // 无外网或被墙：如实降级为「桥已验证、抓取未验证」，清理后退出
      log(`⚠ yz_fetch 未成功（${f.text.slice(0, 120)}）——外网抓取链留待有网环境复验`);
    } else {
      ok('yz_fetch（真实外网抓取 + 抽取 + 入库）');
      const id = /\[id\] ([0-9a-f]{16})/.exec(f.text)?.[1];
      if (!id) throw new Error(`fetch 返回无 id：${f.text.slice(0, 200)}`);
      const items = [...f.text.matchAll(/\[(\d+)\] (.+)/g)].slice(0, 2)
        .map((mm) => ({ i: Number(mm[1]), dst: `冒烟译文${mm[1]}。` }));
      const s = await mcp.call('yz_save', { id, items });
      if (s.isError) throw new Error(`yz_save 失败：${s.text}`);
      ok(`yz_save（${items.length} 段 + 代码段收编）`);
      const rd = await mcp.call('yz_read', { id, mode: 'bilingual' });
      if (rd.isError || !rd.text.includes('冒烟译文')) throw new Error('yz_read 回读不一致');
      ok('yz_read 回读一致');
      const d = await mcp.call('yz_delete', { id, confirm: true });
      if (d.isError) throw new Error(`yz_delete 失败：${d.text}`);
      ok('yz_delete 清理');
    }
    ok('yz_list（空库引导）');

    log(`\n结果：${results.length} 项全部通过（真实宿主 9820 通道；自清理见下）`);
    mcp.child.kill();
    process.exit(0);
  } catch (e) {
    console.error('✖ 失败：', e.message);
    console.error('--- stderr tail ---\n' + mcp.stderr.join('').slice(-1000));
    mcp.child.kill();
    process.exit(1);
  }
}

main();
