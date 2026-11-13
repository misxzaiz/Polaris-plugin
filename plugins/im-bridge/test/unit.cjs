'use strict';
/** im-bridge 单元测试（零依赖 node:test 风格断言） */
const { parseCommand, helpText } = require('../service/commands');
const { StateManager } = require('../service/state');
const { decodeFrame, encodeFrame, extractServiceId } = require('../service/platforms/feishu');
const { IM_CONTEXT_PREFIX } = require('../service/ai');

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}`); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got=${JSON.stringify(a)})`); }

// ── commands ───────────────────────────────────────────────────────────────
console.log('commands.js');
const aliases = { engineAliases: ['claude', 'claude-code', 'simple-ai', 'pi'] };
eq(parseCommand('/claude', aliases), { kind: 'switch_engine', engine: 'claude', customPrompt: null }, '/claude 切换引擎');
eq(parseCommand('/claude 帮我写代码', aliases), { kind: 'switch_engine', engine: 'claude', customPrompt: '帮我写代码' }, '/claude 带提示词');
eq(parseCommand('你好', aliases), null, '普通消息返回 null');
eq(parseCommand('/stop', aliases), { kind: 'interrupt' }, '/stop 中断');
eq(parseCommand('/停止', aliases), { kind: 'interrupt' }, '/停止 中文别名');
eq(parseCommand('/status', aliases), { kind: 'status' }, '/status');
eq(parseCommand('/path /tmp/w', aliases), { kind: 'set_path', path: '/tmp/w' }, '/path 设置');
eq(parseCommand('/path', aliases), { kind: 'get_path' }, '/path 查询');
eq(parseCommand('/resume', aliases), { kind: 'resume' }, '/resume');
eq(parseCommand('/preset list', aliases), { kind: 'list_presets' }, '/preset list');
eq(parseCommand('/nonexistent-cmd', aliases), null, '未知命令按普通消息处理');
ok(parseCommand('/help', aliases).kind === 'help', '/help');
ok(helpText().includes('/claude'), 'helpText 含 /claude');

// ── state ──────────────────────────────────────────────────────────────────
console.log('state.js');
{
  const sm = new StateManager({ kvGet: async () => null, kvSet: async () => {} }, () => {});
  ok(sm.getOrCreateConv('c1').engineId === 'claude-code', '默认引擎 claude-code');
  sm.getOrCreateConv('c1').aiSessionId = 'sid-123';
  ok(sm.getConv('c1').aiSessionId === 'sid-123', '会话状态读写');
  ok(!sm.isDup('m1'), '首条消息非重复');
  ok(sm.isDup('m1'), '二次消息判重');
  sm.addInstance({ id: 'i1', name: 'QQ', platform: 'qqbot', enabled: true, config: {}, createdAt: 'now' });
  sm.addInstance({ id: 'i2', name: 'QQ2', platform: 'qqbot', enabled: true, config: {}, createdAt: 'now' });
  ok(sm.getActiveInstance('qqbot').id === 'i1', '首个实例自动激活');
  sm.activateInstance('i2');
  ok(sm.getActiveInstance('qqbot').id === 'i2', '手动切换激活');
  sm.removeInstance('i2');
  ok(sm.getActiveInstance('qqbot').id === 'i1', '删除激活实例后回退首个');
}

// ── feishu frame codec ─────────────────────────────────────────────────────
console.log('platforms/feishu.js frame');
{
  const ping = encodeFrame({ seqId: 0, logId: 0, service: 5, method: 0, headers: [{ key: 'type', value: 'ping' }], payload: Buffer.alloc(0) });
  const dec = decodeFrame(ping);
  ok(dec && dec.method === 0 && dec.service === 5, 'ping 帧编解码 roundtrip');
  const hdr = dec.headers.find((h) => h.key === 'type');
  ok(hdr && hdr.value === 'ping', 'ping 帧头 type=ping');
  ok(extractServiceId('wss://x.feishu.cn/callback/ws/endpoint?service_id=-3&other=1') === -3, 'service_id 从 URL query 提取');
  ok(extractServiceId('wss://x.feishu.cn/callback/ws/endpoint') === 0, '无 service_id 回退 0');
  // data 帧
  const payload = Buffer.from(JSON.stringify({ header: { event_type: 'im.message.receive_v1' }, event: { message: { chat_id: 'oc1' } } }));
  const data = encodeFrame({ seqId: 7, logId: 8, service: 5, method: 1, headers: [{ key: 'type', value: 'event' }], payload });
  const dec2 = decodeFrame(data);
  ok(dec2 && dec2.seqId === 7 && dec2.method === 1, 'data 帧编解码 roundtrip');
  const parsed = JSON.parse(dec2.payload.toString('utf8'));
  ok(parsed.header.event_type === 'im.message.receive_v1', '事件 payload 完整性');
}

// ── ai contextId 规约 ──────────────────────────────────────────────────────
console.log('ai.js');
ok(IM_CONTEXT_PREFIX === 'im-bridge:', 'contextId 前缀 = im-bridge:');

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
