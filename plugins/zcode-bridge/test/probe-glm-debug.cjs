#!/usr/bin/env node
// GLM 轮调试探针：polaris-plan/GLM-5.3-Flash + high 档位，全量转储事件流/stderr，
// 定位 turn 无产出的卡点（鉴权？thinking 长跑？事件形态？）。
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ZCodeClient } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const WORKSPACE = process.env.ZCODE_PROBE_WS || 'D:/space/base/Polaris';
const V2_DIR = path.join(os.homedir(), '.zcode', 'v2');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findPlanApiKey() {
  const d = JSON.parse(fs.readFileSync(path.join(V2_DIR, 'credentials.json'), 'utf8'));
  const entry = Object.entries(d).find(([k, v]) => k.startsWith('account-provider:coding-plan:') && typeof v === 'string' && v.length > 40);
  return entry ? entry[1] : null;
}

(async () => {
  const real = JSON.parse(fs.readFileSync(path.join(V2_DIR, 'provider_config.json'), 'utf8'));
  const cfg = real.config || {};
  cfg.providerConfigRules = cfg.providerConfigRules || {};
  cfg.providerConfigRules.providerRules = (cfg.providerConfigRules.providerRules || []).filter((r) => r.providerId !== 'polaris-plan');
  cfg.providerConfigRules.providerRules.push({
    providerId: 'polaris-plan',
    providerName: 'BigModel 套餐 (zcode-bridge)',
    config: {
      group: 'standard-personal',
      access: { type: 'zhipu-coding-plan-api-key', apiKey: findPlanApiKey() },
      api: { type: 'anthropic-messages', baseUrl: 'https://open.bigmodel.cn/api/anthropic' },
      personalModelIds: ['GLM-5.3-Flash', 'GLM-5.3'],
      modelOrder: ['GLM-5.3-Flash', 'GLM-5.3'],
    },
  });
  const privatePath = path.join(os.tmpdir(), `zcode-bridge-dbg-${Date.now()}.json`);
  fs.writeFileSync(privatePath, JSON.stringify(real, null, 2));
  process.env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE = privatePath;

  const client = new ZCodeClient({ workspacePath: WORKSPACE });
  await sleep(1200);

  const cr = await client.request('session/create', { workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE }, mode: 'yolo' });
  const sid = cr.result.sessionId || (cr.result.session && cr.result.session.sessionId);
  await client.request('session/resume', { sessionId: sid, workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE } });
  await client.subscribe(sid);
  const sm = await client.request('session/setModel', {
    sessionId: sid,
    model: { providerId: 'polaris-plan', modelId: 'GLM-5.3-Flash', options: { reasoningLevel: 'high' } },
    persistAsWorkspaceLastUsed: false,
  });
  console.log('setModel:', sm.error ? `ERROR ${sm.error.message}` : 'OK');
  if (sm.error) { await client.dispose(); process.exit(1); }

  const sent = await client.request('session/send', { sessionId: sid, content: '探针调试，请只回复两个字：收到' });
  console.log('send:', sent.error ? `ERROR ${sent.error.message}` : `cursor=${JSON.stringify(sent.result && sent.result.stateRevision)}`);

  // 全量事件转储
  const deadline = Date.now() + 180000;
  let cursor = -1, n = 0;
  while (Date.now() < deadline) {
    const { events } = client.drainEvents(cursor);
    cursor = client._eventSeq;
    for (const e of events) {
      n += 1;
      const p = e.payload || {};
      const brief = JSON.stringify(p).slice(0, 220);
      console.log(`  [${n}] seq=${e.seq} kind=${e.kind} ${brief}`);
    }
    if (events.some((e) => e.kind === 'turn-complete')) break;
    // stderr 透传
    for (const note of client.notifications().slice(-3)) {
      if (note.kind === 'stderr' && note.text) console.log('  [stderr]', note.text.slice(0, 160));
    }
    await sleep(700);
  }
  console.log(`\n共 ${n} 个事件`);
  try { await client.request('session/close', { sessionId: sid }); } catch { /* ignore */ }
  fs.unlinkSync(privatePath);
  await client.dispose();
})();
