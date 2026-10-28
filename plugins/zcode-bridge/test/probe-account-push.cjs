#!/usr/bin/env node
// 账号 provider 推送探针 v3：验证桥 app-server 能否经 provider/updateAccountConfig
// 注册套餐 provider 并真实跑通模型轮。两种形态：
//   P1 zhipu-account（OAuth 型，鉴权走 credential store）
//   P2 zhipu-coding-plan-api-key（自包含 key，取自 ~/.zcode/v2/credentials.json，输出全程掩码）
// 每形态：push → setModel(GLM-5.3-Flash) → send → 轮询事件到最终正文轮。
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ZCodeClient } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const WORKSPACE = process.env.ZCODE_PROBE_WS || 'D:/space/base/Polaris';
const PLAN_PROVIDER = 'account:bigmodel-start-plan';
const PLAN_MODELS = ['GLM-5.3-Flash', 'GLM-5.3'];
const BASE_URL = 'https://open.bigmodel.cn/api/anthropic';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 记录 reverse request（观察鉴权协商）
const seenReverse = new Map();
const origReverse = ZCodeClient.prototype._handleReverseRequest;
ZCodeClient.prototype._handleReverseRequest = function (req) {
  seenReverse.set(req.method, (seenReverse.get(req.method) || 0) + 1);
  process.stdout.write(`  [reverse] ${req.method}\n`);
  return origReverse.call(this, req);
};

// 从 credentials.json 取一个 plan api-key（绝不打印明文）
function findPlanApiKey() {
  try {
    const p = path.join(os.homedir(), '.zcode', 'v2', 'credentials.json');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const entry = Object.entries(d).find(([k, v]) => k.startsWith('account-provider:coding-plan:') && typeof v === 'string' && v.length > 40);
    if (!entry) return null;
    console.log(`  [cred] 使用凭证键: ${entry[0]} (len=${entry[1].length}, 已掩码)`);
    return entry[1];
  } catch (e) {
    console.log(`  [cred] 读取失败: ${e.message}`);
    return null;
  }
}

async function pushProvider(client, providerId, config, state) {
  const resp = await client.request('provider/updateAccountConfig', {
    revision: `zbridge-probe-${Date.now()}`,
    basedOnZCodeBuiltinRevision: '33',
    providers: { [providerId]: config },
    states: { [providerId]: state },
  });
  const brief = resp.error ? `ERROR ${resp.error.code}: ${String(resp.error.message).slice(0, 250)}` : JSON.stringify(resp.result);
  console.log(`  push(${providerId}): ${brief}`);
  return !resp.error;
}

async function tryModelTurn(client, label, providerId, modelId, withLevel) {
  const out = { label, ok: false, stage: '', reply: '', error: '' };
  let sessionId = null;
  try {
    const cr = await client.request('session/create', { workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE }, mode: 'yolo' });
    sessionId = cr.result.sessionId || (cr.result.session && cr.result.session.sessionId);
    await client.request('session/resume', { sessionId, workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE } });
    await client.subscribe(sessionId);

    const model = { providerId, modelId };
    if (withLevel) model.options = { reasoningLevel: withLevel };
    const sm = await client.request('session/setModel', { sessionId, model, persistAsWorkspaceLastUsed: false });
    if (sm.error) { out.stage = 'setModel'; out.error = `${sm.error.code}: ${sm.error.message}`; return out; }

    const sent = await client.request('session/send', { sessionId, content: `探针${label}，请只回复两个字：收到` });
    if (sent.error) { out.stage = 'send'; out.error = `${sent.error.code}: ${sent.error.message}`; return out; }

    const deadline = Date.now() + 120000;
    let cursor = -1;
    while (Date.now() < deadline) {
      const { events } = client.drainEvents(cursor);
      cursor = client._eventSeq;
      for (const e of events) {
        const p = e.payload || {};
        if (e.kind === 'text-delta' && typeof p.delta === 'string') out.reply += p.delta;
        if (e.kind === 'turn-complete' && p.stopReason !== 'tool-calls' && typeof p.content === 'string') {
          out.reply = out.reply || p.content;
          if (out.reply.trim()) { out.ok = true; }
        }
        if (/unauthorized|forbidden|401|403|invalid.*key|api key|auth/i.test(JSON.stringify(p).slice(0, 400))) {
          out.error = out.error || JSON.stringify(p).slice(0, 250);
        }
      }
      if (out.ok) break;
      await sleep(500);
    }
    if (!out.ok && !out.error) { out.stage = 'drain'; out.error = '超时未见最终正文轮'; }
  } catch (e) {
    out.stage = out.stage || 'exception';
    out.error = String(e.message || e);
  } finally {
    if (sessionId) { try { await client.request('session/close', { sessionId }); } catch { /* ignore */ } }
  }
  return out;
}

(async () => {
  const client = new ZCodeClient({ workspacePath: WORKSPACE });
  await sleep(1000);
  const results = [];

  // P1: zhipu-account 最小载荷（accountType/mode 由 providerId 解析，不可显式传）
  console.log('── P1 zhipu-account（最小） ──');
  const p1ok = await pushProvider(client, PLAN_PROVIDER, {
    access: { type: 'zhipu-account', entitled: true },
    builtinModelIds: PLAN_MODELS,
  }, { availability: 'available', entitled: true, current: true });
  if (p1ok) {
    const r = await tryModelTurn(client, 'P1-flash', PLAN_PROVIDER, 'GLM-5.3-Flash', false);
    results.push(r);
    console.log(`  → ${r.ok ? '✅' : '❌'} [${r.stage}] ${r.reply.slice(0, 80).replace(/\n/g, ' ')} ${r.error}`);
  } else {
    results.push({ label: 'P1', ok: false, error: 'push 被拒' });
  }

  // P2: zhipu-coding-plan-api-key 自包含 key（account:* 前缀强制 zhipu-account，
  // 故用非 account 前缀的自定义 providerId 承载 api-key 型）
  console.log('── P2 zhipu-coding-plan-api-key（自定义 id） ──');
  const key = findPlanApiKey();
  if (key) {
    const ALT_PROVIDER = 'zcode-bridge-plan';
    const p2ok = await pushProvider(client, ALT_PROVIDER, {
      access: { type: 'zhipu-coding-plan-api-key', apiKey: key },
      api: { type: 'anthropic-messages', baseUrl: BASE_URL },
      builtinModelIds: PLAN_MODELS,
    }, { availability: 'available', entitled: true, current: true });
    if (p2ok) {
      const r = await tryModelTurn(client, 'P2-flash', ALT_PROVIDER, 'GLM-5.3-Flash', false);
      results.push(r);
      console.log(`  → ${r.ok ? '✅' : '❌'} [${r.stage}] ${r.reply.slice(0, 80).replace(/\n/g, ' ')} ${r.error}`);
      if (!r.ok) {
        // 尝试带 reasoningLevel（GLM 模型可能要求档位）
        const r2 = await tryModelTurn(client, 'P2-flash-high', ALT_PROVIDER, 'GLM-5.3-Flash', 'high');
        results.push(r2);
        console.log(`  →(high) ${r2.ok ? '✅' : '❌'} [${r2.stage}] ${r2.reply.slice(0, 80).replace(/\n/g, ' ')} ${r2.error}`);
      }
    } else {
      results.push({ label: 'P2', ok: false, error: 'push 被拒' });
    }
  }

  console.log(`\nreverse requests: ${seenReverse.size === 0 ? '(无)' : [...seenReverse].map(([m, n]) => `${m}×${n}`).join(', ')}`);
  const anyOk = results.some((r) => r.ok);
  console.log(`\n=== 结论: ${anyOk ? '有可用通道 ✅' : '全部失败 ❌'} ===`);
  await client.dispose();
  process.exit(anyOk ? 0 : 1);
})();
