#!/usr/bin/env node
// 模型选择纯函数单测（无需 ZCode 实例）：
//   readRealPersonalConfig / mergeProfileProvider / resolveModelSelection
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { readRealPersonalConfig, mergeProfileProvider, resolveModelSelection, REAL_PERSONAL_PROVIDER_CONFIG } = require(path.join(__dirname, '..', 'mcp', 'zcode-core.js'));

const results = [];
const step = (name, ok, extra) => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

// ── mergeProfileProvider ──
{
  const real = {
    schemaVersion: 1,
    config: {
      providerOrder: ['new-provider'],
      providerConfigRules: {
        providerRules: [{ providerId: 'new-provider', providerName: '自建', config: { access: { type: 'api-key', apiKey: 'sk-xxx' }, api: { type: 'anthropic-messages', baseUrl: 'http://localhost:9850' }, personalModelIds: ['deepseek-v4-flash'] } }],
      },
    },
  };
  const merged = mergeProfileProvider(real, { providerId: 'polaris-profile', providerName: 'Polaris Profile', baseUrl: 'https://open.bigmodel.cn/api/anthropic', apiKey: 'id.secret', models: ['GLM-5.3-Flash'] });
  const rules = merged.config.providerConfigRules.providerRules;
  step('merge 保留真实 provider', rules.some((r) => r.providerId === 'new-provider'));
  step('merge 追加 profile provider', rules.some((r) => r.providerId === 'polaris-profile'));
  step('merge 不抢 providerOrder 默认位', JSON.stringify(merged.config.providerOrder) === '["new-provider"]');
  const pp = rules.find((r) => r.providerId === 'polaris-profile');
  step('profile 条目结构完整', pp && pp.config.access.type === 'api-key' && pp.config.api.type === 'anthropic-messages'
    && JSON.stringify(pp.config.personalModelIds) === '["GLM-5.3-Flash"]');
  // 同名覆盖（重复 merge 不堆积）
  const merged2 = mergeProfileProvider(merged, { providerId: 'polaris-profile', baseUrl: 'http://x', apiKey: 'k2', models: ['m2'] });
  const same = merged2.config.providerConfigRules.providerRules.filter((r) => r.providerId === 'polaris-profile');
  step('merge 同名去重（幂等）', same.length === 1 && same[0].config.access.apiKey === 'k2');
  // 空骨架容错
  const merged3 = mergeProfileProvider({ schemaVersion: 1, config: {} }, { providerId: 'p', baseUrl: 'http://x', apiKey: 'k', models: ['m'] });
  step('merge 对空骨架可用', merged3.config.providerConfigRules.providerRules.length === 1);
}

// ── readRealPersonalConfig ──
{
  const real = readRealPersonalConfig(REAL_PERSONAL_PROVIDER_CONFIG);
  step('真实配置可读（本机）', real && real.config && Array.isArray(real.config.providerConfigRules?.providerRules));
  const missing = readRealPersonalConfig(path.join(os.tmpdir(), `nonexistent-${Date.now()}.json`));
  step('缺失配置回退空骨架', missing.config.providerConfigRules.providerRules.length === 0);
  const badPath = path.join(os.tmpdir(), `bad-${Date.now()}.json`);
  fs.writeFileSync(badPath, 'not-json{{');
  const bad = readRealPersonalConfig(badPath);
  step('损坏配置回退空骨架', bad.config.providerConfigRules.providerRules.length === 0);
  fs.unlinkSync(badPath);
}

// ── resolveModelSelection ──
{
  step('ZCODE_MODEL 显式优先', resolveModelSelection({ ZCODE_MODEL: 'm1', ANTHROPIC_MODEL: 'm2', ZCODE_MODEL_PROVIDER: 'p1' }).modelId === 'm1');
  step('ANTHROPIC_MODEL 兜底', resolveModelSelection({ ANTHROPIC_MODEL: 'm2', ZCODE_MODEL_PROVIDER: 'p1' }).modelId === 'm2');
  step('无模型 → null', resolveModelSelection({ ZCODE_MODEL_PROVIDER: 'p1' }) === null);
  step('无 providerId 且目录无记录 → null', resolveModelSelection({ ANTHROPIC_MODEL: 'm' }, {}) === null);
  step('目录命中 providerId（catalog 为扁平 modelId→providerId 映射）', resolveModelSelection({ ANTHROPIC_MODEL: 'deepseek-v4-flash' }, { 'deepseek-v4-flash': 'new-provider' }).providerId === 'new-provider');
  step('显式 providerId 胜过目录', resolveModelSelection({ ANTHROPIC_MODEL: 'm', ZCODE_MODEL_PROVIDER: 'px' }, { m: 'pc' }).providerId === 'px');
  step('空白字符串容错', resolveModelSelection({ ANTHROPIC_MODEL: '  m  ', ZCODE_MODEL_PROVIDER: '  p ' }).providerId === 'p');
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
process.exit(failed ? 1 : 0);
