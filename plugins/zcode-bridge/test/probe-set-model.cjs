#!/usr/bin/env node
// setModel 协议探针：实施前验证「桥自建 app-server 上，session/setModel 切换
// 套餐/自建供应商模型后，模型轮能否真正跑通」。
// 覆盖三个变体（各自独立会话）：
//   A 套餐   account:bigmodel-start-plan / GLM-5.3-Flash
//   B 自建   new-provider / deepseek-v4-flash
//   C 基线   不调 setModel（继承 ZCode 默认），确认探针本身无回归
// 风险点观察：reverse request（provider runtime headers）是否到达且 -32601 后
// 轮次是否仍完成 —— 决定是否需要实现 headers 应答方。
// 用法：node test/probe-set-model.cjs   （需本机 ZCode 桌面可登录态）
'use strict';

const path = require('node:path');
const { ZCodeClient } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const WORKSPACE = process.env.ZCODE_PROBE_WS || 'D:/space/base/Polaris';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 监视 reverse request：记录方法名再走原逻辑（原逻辑对未知方法回 -32601）
const seenReverse = new Map();
const origReverse = ZCodeClient.prototype._handleReverseRequest;
ZCodeClient.prototype._handleReverseRequest = function (req) {
  seenReverse.set(req.method, (seenReverse.get(req.method) || 0) + 1);
  process.stdout.write(`  [reverse-request] ${req.method}\n`);
  return origReverse.call(this, req);
};

async function runVariant(client, label, model) {
  const out = { label, ok: false, modelApplied: null, reply: '', error: '', events: 0, notes: [] };
  let sessionId = null;
  try {
    const created = await client.request('session/create', {
      workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE },
      mode: 'yolo',
    });
    if (created.error) throw new Error(`create: ${created.error.message} (${created.error.code})`);
    sessionId = created.result.sessionId || (created.result.session && created.result.session.sessionId);
    out.notes.push(`sid=${sessionId}`);

    await client.request('session/resume', {
      sessionId,
      workspace: { workspacePath: WORKSPACE, workspaceKey: WORKSPACE },
    });
    await client.subscribe(sessionId);

    if (model) {
      const sm = await client.request('session/setModel', {
        sessionId,
        model: { providerId: model.providerId, modelId: model.modelId },
        persistAsWorkspaceLastUsed: false,
      });
      if (sm.error) throw new Error(`setModel: ${sm.error.message} (${sm.error.code})`);
      out.modelApplied = `${model.providerId}/${model.modelId}`;
    }

    const marker = `探针${label}请只回复：OK-${label}`;
    const sent = await client.request('session/send', { sessionId, content: marker });
    if (sent.error) throw new Error(`send: ${sent.error.message} (${sent.error.code})`);

    // 轮询事件直到最终正文轮（stopReason=stop 带 content）或超时
    const deadline = Date.now() + 120000;
    let cursor = -1;
    while (Date.now() < deadline) {
      const { events } = client.drainEvents(cursor);
      cursor = client._eventSeq;
      for (const e of events) {
        out.events += 1;
        const p = e.payload || {};
        if (e.kind === 'turn-complete') {
          if (p.stopReason === 'tool-calls') continue;
          out.reply = String(p.content || '');
          if (out.reply) { out.ok = true; }
        } else if (e.kind === 'text-delta' && typeof p.delta === 'string') {
          out.reply += p.delta;
        }
        if (p.modelId) out.notes.push(`evt-model=${p.providerId}/${p.modelId}`);
        if (/error|fail|denied|unauthorized|401|403/i.test(JSON.stringify(p).slice(0, 500))) {
          out.error = JSON.stringify(p).slice(0, 300);
        }
      }
      if (out.ok) break;
      await sleep(500);
    }
    if (!out.ok && !out.error) out.error = '超时未见最终正文轮';
    if (sessionId) {
      try { await client.request('session/close', { sessionId }); } catch { /* 关闭失败不影响判定 */ }
    }
  } catch (e) {
    out.error = String(e.message || e);
    if (sessionId) { try { await client.request('session/close', { sessionId }); } catch { /* ignore */ } }
  }
  return out;
}

(async () => {
  const client = new ZCodeClient({ workspacePath: WORKSPACE });
  await sleep(1000); // 等 spawn 稳定

  const results = [];
  results.push(await runVariant(client, 'A-套餐', { providerId: 'account:bigmodel-start-plan', modelId: 'GLM-5.3-Flash' }));
  results.push(await runVariant(client, 'B-自建', { providerId: 'new-provider', modelId: 'deepseek-v4-flash' }));
  results.push(await runVariant(client, 'C-基线', null));

  console.log('\n=== 探针结果 ===');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.label}${r.modelApplied ? ` (setModel=${r.modelApplied})` : ' (默认模型)'} events=${r.events}`);
    console.log(`   回复: ${r.reply.slice(0, 160).replace(/\n/g, ' ') || '(空)'}`);
    if (r.error) console.log(`   错误: ${r.error}`);
    if (r.notes.length) console.log(`   备注: ${r.notes.join(' | ')}`);
  }
  console.log(`\nreverse requests: ${seenReverse.size === 0 ? '(无)' : [...seenReverse].map(([m, n]) => `${m}×${n}`).join(', ')}`);

  await client.dispose();
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed ? 1 : 0);
})();
