#!/usr/bin/env node
// 注册表探针 v2：判定桥 app-server 上账号 provider 的可用通道 + 收割 reasoningLevel。
//   1. provider/refreshRegistry 是否配置（-32601=方法不存在, -32019=dep 缺失, refreshed=可用）
//   2. provider/updateAccountConfig 是否配置（-32018=dep 缺失）
//   3. 刻意错误 reasoningLevel → 从 reasoning-level-not-supported 错误收割 supportedLevels
//   4. refresh 后重试套餐 setModel
'use strict';

const path = require('node:path');
const { ZCodeClient } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const WORKSPACE = process.env.ZCODE_PROBE_WS || 'D:/space/base/Polaris';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function show(label, resp) {
  const body = resp.error ? `ERROR ${resp.error.code}: ${resp.error.message}` : JSON.stringify(resp.result).slice(0, 400);
  console.log(`${label}: ${body}`);
  if (resp.error && resp.error.data) console.log(`   data: ${JSON.stringify(resp.error.data).slice(0, 400)}`);
  return resp;
}

(async () => {
  const client = new ZCodeClient({ workspacePath: WORKSPACE });
  await sleep(1000);

  // 1. refreshRegistry 试探
  console.log('── 1. provider/refreshRegistry ──');
  const rr = show('refreshRegistry', await client.request('provider/refreshRegistry', { reason: 'zcode-bridge-probe' }).catch((e) => ({ error: { code: -1, message: e.message } })));

  // 2. updateAccountConfig 试探（最小载荷，只为判定 dep 是否存在）
  console.log('── 2. provider/updateAccountConfig ──');
  show('updateAccountConfig', await client.request('provider/updateAccountConfig', {
    revision: 'probe-r1',
    basedOnZCodeBuiltinRevision: 'probe-b1',
    providers: {},
    states: {},
  }).catch((e) => ({ error: { code: -1, message: e.message } })));

  // 3. reasoningLevel 收割（错误法）
  console.log('── 3. reasoningLevel 收割 ──');
  const cr = await client.request('session/create', {
    workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE },
    mode: 'yolo',
  });
  const sid = cr.result.sessionId || (cr.result.session && cr.result.session.sessionId);
  await client.request('session/resume', { sessionId: sid, workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE } });
  await client.subscribe(sid);
  show('deepseek+伪level', await client.request('session/setModel', {
    sessionId: sid,
    model: { providerId: 'new-provider', modelId: 'deepseek-v4-flash', options: { reasoningLevel: '__probe__' } },
    persistAsWorkspaceLastUsed: false,
  }).catch((e) => ({ error: { code: -1, message: e.message } })));
  show('deepseek+high', await client.request('session/setModel', {
    sessionId: sid,
    model: { providerId: 'new-provider', modelId: 'deepseek-v4-flash', options: { reasoningLevel: 'high' } },
    persistAsWorkspaceLastUsed: false,
  }).catch((e) => ({ error: { code: -1, message: e.message } })));

  // 4. 套餐 setModel 重试（refresh 后）
  console.log('── 4. 套餐 setModel（refresh 后）──');
  show('套餐无level', await client.request('session/setModel', {
    sessionId: sid,
    model: { providerId: 'account:bigmodel-start-plan', modelId: 'GLM-5.3-Flash' },
    persistAsWorkspaceLastUsed: false,
  }).catch((e) => ({ error: { code: -1, message: e.message } })));
  show('套餐+伪level', await client.request('session/setModel', {
    sessionId: sid,
    model: { providerId: 'account:bigmodel-start-plan', modelId: 'GLM-5.3-Flash', options: { reasoningLevel: '__probe__' } },
    persistAsWorkspaceLastUsed: false,
  }).catch((e) => ({ error: { code: -1, message: e.message } })));
  show('套餐5.3+伪level', await client.request('session/setModel', {
    sessionId: sid,
    model: { providerId: 'account:bigmodel-start-plan', modelId: 'GLM-5.3', options: { reasoningLevel: '__probe__' } },
    persistAsWorkspaceLastUsed: false,
  }).catch((e) => ({ error: { code: -1, message: e.message } })));

  try { await client.request('session/close', { sessionId: sid }); } catch { /* ignore */ }
  await client.dispose();
  process.exit(0);
})();
