#!/usr/bin/env node
// 探针 v4（终验）：ZCODE_PERSONAL_PROVIDER_CONFIG_FILE 私有 personal 配置方案。
// 私有配置 = 用户真实 provider_config.json 深合并 + 套餐 provider（zhipu-coding-plan-api-key，
// key 取自 credentials.json，全程掩码）。验证三轮真实模型轮：
//   1. polaris-plan / GLM-5.3-Flash
//   2. polaris-plan / GLM-5.3（若报 reasoning-level-missing 则自动以 high 重试）
//   3. new-provider / deepseek-v4-flash + high（自建供应商回归）
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ZCodeClient } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const WORKSPACE = process.env.ZCODE_PROBE_WS || 'D:/space/base/Polaris';
const V2_DIR = path.join(os.homedir(), '.zcode', 'v2');
const PLAN_PROVIDER_ID = 'polaris-plan';
const PLAN_MODELS = ['GLM-5.3-Flash', 'GLM-5.3'];
const BIGMODEL_ANTHROPIC = 'https://open.bigmodel.cn/api/anthropic';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findPlanApiKey() {
  const d = JSON.parse(fs.readFileSync(path.join(V2_DIR, 'credentials.json'), 'utf8'));
  const entry = Object.entries(d).find(([k, v]) => k.startsWith('account-provider:coding-plan:') && typeof v === 'string' && v.length > 40);
  return entry ? entry[1] : null;
}

function buildPrivatePersonalConfig() {
  const real = JSON.parse(fs.readFileSync(path.join(V2_DIR, 'provider_config.json'), 'utf8'));
  const cfg = real.config || {};
  const rules = (cfg.providerConfigRules = cfg.providerConfigRules || {});
  rules.providerRules = rules.providerRules || [];
  // 去重后追加套餐 provider
  const filtered = rules.providerRules.filter((r) => r.providerId !== PLAN_PROVIDER_ID);
  filtered.push({
    providerId: PLAN_PROVIDER_ID,
    providerName: 'BigModel 套餐 (zcode-bridge)',
    config: {
      group: 'standard-personal',
      access: { type: 'zhipu-coding-plan-api-key', apiKey: findPlanApiKey() },
      api: { type: 'anthropic-messages', baseUrl: BIGMODEL_ANTHROPIC },
      personalModelIds: PLAN_MODELS,
      modelOrder: PLAN_MODELS,
    },
  });
  rules.providerRules = filtered;
  const order = (cfg.providerOrder = cfg.providerOrder || []).filter((id) => id !== PLAN_PROVIDER_ID);
  cfg.providerOrder = order; // 不抢默认位：默认仍是用户的自建供应商
  return real;
}

async function modelTurn(client, label, providerId, modelId, level) {
  const out = { label, ok: false, stage: '', reply: '', error: '' };
  let sessionId = null;
  try {
    const cr = await client.request('session/create', { workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE }, mode: 'yolo' });
    sessionId = cr.result.sessionId || (cr.result.session && cr.result.session.sessionId);
    await client.request('session/resume', { sessionId, workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE } });
    await client.subscribe(sessionId);
    const model = { providerId, modelId };
    if (level) model.options = { reasoningLevel: level };
    const sm = await client.request('session/setModel', { sessionId, model, persistAsWorkspaceLastUsed: false });
    if (sm.error) { out.stage = 'setModel'; out.error = `${sm.error.code}: ${String(sm.error.message).slice(0, 160)}`; return out; }
    await client.request('session/send', { sessionId, content: `探针${label}，请只回复两个字：收到` });
    const deadline = Date.now() + 120000;
    let cursor = -1;
    while (Date.now() < deadline) {
      const { events } = client.drainEvents(cursor);
      cursor = client._eventSeq;
      for (const e of events) {
        const p = e.payload || {};
        if (e.kind === 'text-delta' && typeof p.delta === 'string') out.reply += p.delta;
        if (e.kind === 'turn-complete' && p.stopReason !== 'tool-calls' && typeof p.content === 'string' && p.content.trim()) {
          out.reply = out.reply || p.content;
          out.ok = true;
        }
        if (/unauthorized|forbidden|401|403|invalid/i.test(JSON.stringify(p).slice(0, 300))) out.error = out.error || JSON.stringify(p).slice(0, 200);
      }
      if (out.ok) break;
      await sleep(500);
    }
    if (!out.ok && !out.error) { out.stage = 'drain'; out.error = '超时'; }
  } catch (e) {
    out.stage = out.stage || 'exception'; out.error = String(e.message || e).slice(0, 200);
  } finally {
    if (sessionId) { try { await client.request('session/close', { sessionId }); } catch { /* ignore */ } }
  }
  return out;
}

(async () => {
  // 1. 生成私有 personal 配置
  const privateCfg = buildPrivatePersonalConfig();
  const privatePath = path.join(os.tmpdir(), `zcode-bridge-probe-personal-${Date.now()}.json`);
  fs.writeFileSync(privatePath, JSON.stringify(privateCfg, null, 2));
  console.log(`私有 personal 配置: ${privatePath} (含密钥,已写入磁盘不回显)`);

  // 2. 注入 env 并 spawn
  process.env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE = privatePath;
  const client = new ZCodeClient({ workspacePath: WORKSPACE });
  await sleep(1200);

  const results = [];
  const run = async (label, pid, mid, level) => {
    const r = await modelTurn(client, label, pid, mid, level);
    results.push(r);
    console.log(`${r.ok ? '✅' : '❌'} ${label} [${r.stage || 'ok'}] ${r.reply.slice(0, 60).replace(/\n/g, ' ')} ${r.error || ''}`);
    return r;
  };

  // 3. 套餐 Flash（无 level 直试）
  const r1 = await run('套餐Flash', PLAN_PROVIDER_ID, 'GLM-5.3-Flash', null);
  // 4. 套餐 5.3（thinking 模型，missing 则 high 重试）
  let r2 = await run('套餐5.3', PLAN_PROVIDER_ID, 'GLM-5.3', null);
  if (!r2.ok && /reasoning level/i.test(r2.error)) r2 = await run('套餐5.3+high', PLAN_PROVIDER_ID, 'GLM-5.3', 'high');
  // 5. 自建回归
  await run('自建deepseek+high', 'new-provider', 'deepseek-v4-flash', 'high');

  fs.unlinkSync(privatePath);
  await client.dispose();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n=== ${ok}/${results.length} 通过 ===`);
  process.exit(ok === results.length ? 0 : 1);
})();
