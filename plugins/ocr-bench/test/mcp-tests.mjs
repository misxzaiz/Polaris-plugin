#!/usr/bin/env node
/**
 * 第 4 层：MCP 协议测试（stdio JSON-RPC 全链路）
 *  A. 协议面：initialize / tools/list / 未知工具 / 信箱无服务时的可操作报错
 *  B. 全链路：假桥 + 真实 service 子进程 + MCP 子进程 → ocr_scan 真识别 →
 *     ocr_result full 取全文 → ocr_history → ocr_langs
 * 运行：node test/mcp-tests.mjs（约 40~90s）
 */
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { startFakeKvBridge, waitHealth } from './helpers/fake-kv.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const core = require('../shared/core.js');

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { failed += 1; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}: ${e.message}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** MCP stdio 客户端（行分隔 JSON-RPC） */
function startMcp(env) {
  const child = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), env.APP_CONFIG_DIR || ''], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => {
    buf += c;
    for (;;) {
      const i = buf.indexOf('\n');
      if (i === -1) break;
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const w = waiters.find((x) => x.filter(msg));
        if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
      } catch { /* 非协议行忽略 */ }
    }
  });
  const errChunks = [];
  child.stderr.on('data', (c) => errChunks.push(String(c)));
  const call = (method, params, filter) => new Promise((resolve) => {
    const id = rpcId; // 先固化本次 id（filter 是闭包，引用变量会拿到自增后的值）
    const w = { filter: filter || ((m) => m.id === id), resolve };
    waiters.push(w);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    rpcId += 1;
  });
  let rpcId = 1;
  return { child, call, stderr: () => errChunks.join('') };
}

async function toolCallText(mcp, name, args, timeoutMs = 120000) {
  const msg = await Promise.race([
    mcp.call('tools/call', { name, arguments: args || {} }),
    sleep(timeoutMs).then(() => { throw new Error(`tools/call ${name} ${timeoutMs}ms 超时`); }),
  ]);
  const result = msg.result;
  assert.ok(result, `tools/call ${name} 无 result：${JSON.stringify(msg).slice(0, 200)}`);
  const text = (result.content || []).map((c) => c.text || '').join('\n');
  return { text, isError: !!result.isError };
}

// ── 环境A：仅假桥（无 service）──────────────────────────────────────────────
const bridgeA = await startFakeKvBridge({ token: 'mcp-a-token' });
const appDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-bench-mcpa-'));
const mcpA = startMcp({ POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgeA.port), POLARIS_TOKEN: bridgeA.token, APP_CONFIG_DIR: appDirA });

await test('initialize：协议版本与 serverInfo', async () => {
  const msg = await mcpA.call('initialize', { protocolVersion: '2024-11-05' });
  assert.equal(msg.result.protocolVersion, '2024-11-05');
  assert.equal(msg.result.serverInfo.name, 'ocr-bench');
  assert.equal(msg.result.serverInfo.version, core.VERSION);
});

await test('tools/list：恰好 6 个工具且命名正确', async () => {
  const msg = await mcpA.call('tools/list', {});
  const names = (msg.result.tools || []).map((t) => t.name);
  assert.deepEqual(names.sort(), ['ocr_history', 'ocr_langs', 'ocr_result', 'ocr_scan', 'ocr_status', 'ocr_stop']);
  for (const t of msg.result.tools) {
    assert.ok(t.description && t.description.length > 20, `${t.name} 描述过短`);
    assert.ok(t.inputSchema && t.inputSchema.type === 'object', `${t.name} schema 缺失`);
  }
  // 安全语义须写进描述：仅本地、不外发
  const scan = msg.result.tools.find((t) => t.name === 'ocr_scan');
  assert.match(scan.description, /本机|不出本机|不外发/);
});

await test('无服务时工具调用给出可操作中文指引（不挂死）', async () => {
  const r = await toolCallText(mcpA, 'ocr_langs', {}, 40000);
  assert.equal(r.isError, true);
  assert.match(r.text, /服务无响应|自举|面板/);
  const r2 = await toolCallText(mcpA, 'ocr_status', {}, 40000);
  assert.match(r2.text, /服务无响应|自举|面板/);
});

await test('未知工具：isError + 可用清单', async () => {
  const r = await toolCallText(mcpA, 'no_such_tool', {});
  assert.equal(r.isError, true);
  assert.match(r.text, /未知工具/);
  assert.match(r.text, /ocr_scan/);
});

mcpA.child.kill();
await bridgeA.close();

// ── 环境B：假桥 + 真实 service → 全链路 ─────────────────────────────────────
const bridgeB = await startFakeKvBridge({ token: 'mcp-b-token' });
const appDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-bench-mcpb-'));
const servicePort = 29710 + Math.floor(Math.random() * 300);
const svc = spawn(process.execPath, [
  path.join(ROOT, 'service', 'main.js'),
  String(servicePort),
  appDirB,
], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgeB.port), POLARIS_TOKEN: bridgeB.token },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const mcpB = startMcp({ POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgeB.port), POLARIS_TOKEN: bridgeB.token, APP_CONFIG_DIR: appDirB });

try {
  await waitHealth(servicePort);

  await test('ocr_langs：经信箱读到真实语言清单', async () => {
    const r = await toolCallText(mcpB, 'ocr_langs', {}, 40000);
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /chi_sim/);
    assert.match(r.text, /内置/);
  });

  await test('ocr_scan：真识别 fixture 并返回报告（native + ocr 混合）', async () => {
    const r = await toolCallText(mcpB, 'ocr_scan', {
      paths: [path.join(FIX, 'native-text.pdf'), path.join(FIX, 'fixture-zh.png')],
    }, 150000);
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /识别完成/);
    assert.match(r.text, /HelloNativeTextLayer|Hello Native Text Layer/);
    assert.match(r.text, /检验报告单/);
    assert.match(r.text, /runId=([a-z0-9-]+)/);
    globalThis.__mcpRunId = (r.text.match(/runId=([a-z0-9-]+)/) || [])[1];
  });

  await test('ocr_result：不带 full 得摘要；full=true 得全文', async () => {
    assert.ok(globalThis.__mcpRunId, '前置 ocr_scan 未取得 runId');
    const r1 = await toolCallText(mcpB, 'ocr_result', { runId: globalThis.__mcpRunId }, 30000);
    assert.equal(r1.isError, false, r1.text);
    assert.match(r1.text, /文件清单/);
    const r2 = await toolCallText(mcpB, 'ocr_result', { runId: globalThis.__mcpRunId, fileIndex: 1, full: true }, 30000);
    assert.equal(r2.isError, false, r2.text);
    assert.match(r2.text, /检验报告单/);
    assert.match(r2.text, /全文/);
  });

  await test('ocr_result：越界 fileIndex 给出可操作错误', async () => {
    const r = await toolCallText(mcpB, 'ocr_result', { runId: globalThis.__mcpRunId, fileIndex: 99, full: true }, 30000);
    assert.equal(r.isError, true);
    assert.match(r.text, /越界/);
  });

  await test('ocr_history：包含刚完成的任务（runId 对齐）', async () => {
    const r = await toolCallText(mcpB, 'ocr_history', { limit: 5 }, 30000);
    assert.equal(r.isError, false, r.text);
    assert.ok(r.text.includes(globalThis.__mcpRunId));
    assert.match(r.text, /识别历史/);
  });

  await test('ocr_status：空闲态 + 最近报告摘要', async () => {
    const r = await toolCallText(mcpB, 'ocr_status', {}, 30000);
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /没有进行中|最近报告/);
  });

  await test('ocr_scan：非法路径直接报错不受理', async () => {
    const r = await toolCallText(mcpB, 'ocr_scan', { paths: ['Z:\\definitely\\missing\\path'] }, 30000);
    assert.equal(r.isError, true);
    assert.match(r.text, /不存在或不可读/);
  });

  await test('ocr_stop：空闲时给明确错误', async () => {
    const r = await toolCallText(mcpB, 'ocr_stop', {}, 30000);
    assert.equal(r.isError, true);
    assert.match(r.text, /没有运行中的识别任务/);
  });
} catch (e) {
  failed += 1;
  failures.push(`fatal: ${e.message}`);
  console.log(`  ✗ fatal: ${e.message}`);
} finally {
  mcpB.child.kill();
  svc.kill();
  await bridgeB.close();
}

console.log(`\n第 4 层 MCP 协议测试：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
