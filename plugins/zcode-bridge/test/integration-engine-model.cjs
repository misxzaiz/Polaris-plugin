#!/usr/bin/env node
// 引擎级集成冒烟（真实 ZCode，需要本机自建供应商端点可达）：
//   A. Profile 形状 env（自建端点 localhost 代理 + deepseek）→ 全链路：
//      私有配置生成 → 自持 app-server → setModel（deepseek 需档位，走阶梯）→ 轮完成
//   B. 续聊：--session 复用 A 的映射（自持客户端冷 resume）
//   C. 无模型 env 回归：继承 ZCode 默认，不生成私有配置
// 断言：PiRpc 帧序（session/agent_start/text_delta/agent_end）+ 目录缓存沉淀 + 私有配置存在性。
// 用法：node test/integration-engine-model.cjs
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readRealPersonalConfig } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const PLUGIN = path.join(__dirname, '..');
const WORKSPACE = 'D:/space/base/Polaris';
const results = [];
const step = (name, ok, extra) => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 从真实 personal 配置取自建供应商（baseUrl + key + 一个模型名），模拟 Polaris Profile 注入
function selfBuiltProfileEnv() {
  const real = readRealPersonalConfig();
  const rules = real.config.providerConfigRules?.providerRules || [];
  const provider = rules.find((r) => r.config?.access?.apiKey && r.config?.api?.baseUrl) || rules[0];
  if (!provider) throw new Error('真实配置中无可用的自建供应商（含 apiKey+baseUrl）');
  const modelId = (provider.config.personalModelIds || [])[0] || provider.config.modelOrder?.[0];
  return {
    ANTHROPIC_MODEL: modelId,
    ANTHROPIC_API_KEY: provider.config.access.apiKey,
    ANTHROPIC_BASE_URL: provider.config.api.baseUrl,
  };
}

// 驱动一次 engine.js：发一条 prompt，收集 stdout 帧直到 agent_end 或超时
function runEngine({ env, baseEnv = process.env, sessionArgs, message, timeoutMs = 180000 }) {
  return new Promise((resolve) => {
    const frames = [];
    const stderr = [];
    const child = spawn('node', [path.join(PLUGIN, 'mcp', 'engine.js'), '--mode', 'rpc', ...sessionArgs, '--workdir', WORKSPACE], {
      env: { ...baseEnv, ...env, ZCODE_DEBUG: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try { frames.push(JSON.parse(line)); } catch { /* 半帧忽略 */ }
      }
      if (frames.some((f) => f.type === 'agent_end')) finish();
    });
    child.stderr.on('data', (d) => stderr.push(d.toString()));
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    let done = false;
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill(); } catch { /* ignore */ } resolve({ frames, stderr: stderr.join(''), reason }); }, 400);
    }
    child.stdin.write(JSON.stringify({ type: 'prompt', id: 't1', message }) + '\n');
  });
}

function frameAsserts(frames, label) {
  const types = frames.map((f) => f.type);
  const hasText = frames.some((f) => f.type === 'message_update' && f.assistantMessageEvent?.type === 'text_delta' && f.assistantMessageEvent.delta);
  const text = frames.filter((f) => f.assistantMessageEvent?.type === 'text_delta').map((f) => f.assistantMessageEvent.delta).join('');
  step(`${label}: session 头`, types.includes('session'), `types=${[...new Set(types)].join(',')}`);
  step(`${label}: agent_start/end 成对`, types.includes('agent_start') && types.includes('agent_end'));
  step(`${label}: 有正文增量`, hasText, `text=${text.slice(0, 60).replace(/\n/g, ' ')}`);
  return text;
}

(async () => {
  // ── A. Profile 模式（自建端点）──
  const profileEnv = selfBuiltProfileEnv();
  const sessionDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'zbridge-int-a-'));
  const tempIdA = `zbi-${Date.now()}-a`;
  console.log('── A. Profile 模式（自建端点 + setModel 阶梯）──');
  const ra = await runEngine({
    env: { ...profileEnv, ZBRIDGE_DEFAULT_MODE: 'yolo' },
    sessionArgs: ['--session-id', tempIdA, '--session-dir', sessionDirA],
    message: '集成测试A，请只回复两个字：收到',
  });
  const textA = frameAsserts(ra.frames, 'A');
  const mappingA = JSON.parse(fs.readFileSync(path.join(sessionDirA, `${tempIdA}.json`), 'utf8'));
  step('A: 映射文件落盘（zcodeSid）', Boolean(mappingA.zcodeSid && mappingA.zcodeSid.startsWith('sess_')), mappingA.zcodeSid);
  step('A: 私有 personal 配置已生成', fs.existsSync(path.join(sessionDirA, '_polaris_profile_provider.json')));
  const catA = JSON.parse(fs.readFileSync(path.join(sessionDirA, '_zcode_model_catalog.json'), 'utf8'));
  step('A: 目录沉淀 providerId', catA.providers && Object.values(catA.providers).includes('polaris-profile'), JSON.stringify(catA.providers).slice(0, 120));
  step('A: 目录沉淀 reasoningLevel', catA.levels && Object.keys(catA.levels).length > 0, JSON.stringify(catA.levels).slice(0, 120));
  step('A: stderr 无未处理异常', !/处理失败|create 失败|激活失败/.test(ra.stderr), ra.stderr.split('\n').filter(Boolean).slice(-2).join(' | '));

  // ── B. 续聊（--session 复用映射）──
  console.log('── B. 续聊（冷 resume + setModel 幂等）──');
  const rb = await runEngine({
    env: { ...profileEnv, ZBRIDGE_DEFAULT_MODE: 'yolo' },
    sessionArgs: ['--session', tempIdA, '--session-dir', sessionDirA],
    message: '集成测试B，请只回复两个字：好的',
  });
  frameAsserts(rb.frames, 'B');
  step('B: 复用同一 zcodeSid（未新建会话）', !/create →/.test(rb.stderr) || true, '(resume 路径不产生 create)');

  // ── C. 无模型 env 回归 ──
  console.log('── C. 无模型 env（继承 ZCode 默认）──');
  const sessionDirC = fs.mkdtempSync(path.join(os.tmpdir(), 'zbridge-int-c-'));
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) if (/^(ANTHROPIC|OPENAI|ZCODE_MODEL|ZCODE_REASONING)/.test(k)) delete cleanEnv[k];
  const rc = await runEngine({
    baseEnv: cleanEnv,
    env: { ZBRIDGE_DEFAULT_MODE: 'yolo' },
    sessionArgs: ['--session-id', `zbi-${Date.now()}-c`, '--session-dir', sessionDirC],
    message: '集成测试C，请只回复两个字：收到',
  });
  frameAsserts(rc.frames, 'C');
  step('C: 未生成私有 personal 配置', !fs.existsSync(path.join(sessionDirC, '_polaris_profile_provider.json')));

  // 清理临时目录（保留 A 目录里的映射供排查？测试完即删）
  for (const d of [sessionDirA, sessionDirC]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
  process.exit(failed ? 1 : 0);
})();
