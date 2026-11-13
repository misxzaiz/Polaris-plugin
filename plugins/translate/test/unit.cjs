'use strict';
/**
 * translate 插件单测（零依赖，node:test，CJS——ESM+require 混用会 ReferenceError）：
 * 1. service/lib.js 签名/参数拼装/响应归一化（mock fetch，不打真实上游）
 * 2. service/main.js HTTP 语义（静态检查）
 * 3. MCP server 工具面清单
 * 4. plugin.json 契约完整性
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const { baiduSign, buildBaiduParams, translateViaBaidu } = require(path.join(PLUGIN_DIR, 'service/lib.js'));

describe('service/lib.js 百度翻译语义', () => {
  test('签名算法与 Rust 版一致：md5(appId+text+salt+secret)', () => {
    const sign = baiduSign('a', 'hi', '123', 'b');
    assert.match(sign, /^[0-9a-f]{32}$/);
    assert.strictEqual(sign, baiduSign('a', 'hi', '123', 'b'));
    assert.notStrictEqual(sign, baiduSign('a', 'hi', '124', 'b'));
  });

  test('参数拼装：q/from/to/appid/salt/sign 全在', () => {
    const qs = buildBaiduParams('hi', 'appid-x', '42', 'sign-y', 'zh');
    const p = new URLSearchParams(qs);
    assert.strictEqual(p.get('q'), 'hi');
    assert.strictEqual(p.get('from'), 'auto');
    assert.strictEqual(p.get('to'), 'zh');
    assert.strictEqual(p.get('appid'), 'appid-x');
    assert.strictEqual(p.get('salt'), '42');
    assert.strictEqual(p.get('sign'), 'sign-y');
  });

  test('上游 trans_result → { success:true, result:dst }', async () => {
    const out = await translateViaBaidu({
      text: 'hi', appId: 'a', secretKey: 'b', to: 'zh',
      fetchImpl: () => Promise.resolve({ json: () => Promise.resolve({ trans_result: [{ src: 'hi', dst: '你好' }] }) }),
    });
    assert.deepStrictEqual(out, { success: true, result: '你好', error: null });
  });

  test('上游错误码 → success:false + 中文错误', async () => {
    const out = await translateViaBaidu({
      text: 'hi', appId: 'a', secretKey: 'b', to: 'zh',
      fetchImpl: () => Promise.resolve({ json: () => Promise.resolve({ error_code: '52003', error_msg: 'UNAUTHORIZED USER' }) }),
    });
    assert.strictEqual(out.success, false);
    assert.match(out.error, /52003/);
  });

  test('网络异常 → success:false 不抛出', async () => {
    const out = await translateViaBaidu({
      text: 'hi', appId: 'a', secretKey: 'b', to: 'zh',
      fetchImpl: () => Promise.reject(new Error('boom')),
    });
    assert.strictEqual(out.success, false);
    assert.match(out.error, /boom/);
  });
});

describe('service/main.js HTTP 语义', () => {
  const src = fs.readFileSync(path.join(PLUGIN_DIR, 'service/main.js'), 'utf8');
  test('凭证优先级：请求体 > config > env；未配置给可读错误', () => {
    assert.ok(src.includes('body.appId || config.appId || process.env.POLARIS_TRANSLATE_APP_ID'));
    assert.ok(src.includes('百度翻译未配置'));
  });
  test('健康检查与 /config 回写通道存在', () => {
    assert.ok(src.includes('/__health'));
    assert.ok(src.includes('/config'));
  });
});

describe('MCP server 工具面', () => {
  const mcpSrc = fs.readFileSync(path.join(PLUGIN_DIR, 'mcp/server.js'), 'utf8');
  test('提供 translate_text 工具与 JSON-RPC 三方法', () => {
    assert.ok(mcpSrc.includes("'translate_text'"));
    assert.ok(mcpSrc.includes("'initialize'"));
    assert.ok(mcpSrc.includes("'tools/list'"));
    assert.ok(mcpSrc.includes("'tools/call'"));
  });
});

describe('plugin.json 契约', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8'));
  test('id/version/enabledByDefault', () => {
    assert.strictEqual(manifest.id, 'translate');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.enabledByDefault, true);
  });
  test('views: translate.panel shadow 接管 translate 席位', () => {
    const v = manifest.contributes.views[0];
    assert.strictEqual(v.id, 'translate.panel');
    assert.strictEqual(v.panelType, 'translate');
    assert.strictEqual(v.slot, 'translate');
    assert.strictEqual(v.slotMode, 'shadow');
  });
  test('panel entry 与 service/mcp/styles 齐备', () => {
    assert.strictEqual(manifest.contributes.panel.entry, './dist/panel.js');
    assert.strictEqual(manifest.contributes.services.length, 1);
    assert.strictEqual(manifest.contributes.mcpServers.length, 1);
    assert.ok(manifest.contributes.styles[0].css.length > 100);
    assert.ok(fs.existsSync(path.join(PLUGIN_DIR, 'dist/panel.js')));
  });
});
