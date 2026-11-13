#!/usr/bin/env node
'use strict';
/**
 * main.js —— IM 机器人后台服务（零依赖，node ≥ 22）
 *
 * 职责（金标 = 主仓 integrations/manager.rs + ai-scheduler 服务骨架）：
 *   - 维护三平台长连接（QQ Bot WS / 飞书 pbbp2 / 钉钉 Stream）
 *   - 收到 IM 消息 → 命令解析（commands.js）→ AI 会话（cap.ai.chat）→ 回复
 *   - 实例/会话状态经 cap.kv 持久化（跨重启恢复）
 *   - HTTP：/__health（Supervisor 健康检查）+ /dispatch（面板控制通道）
 *
 * 面板 /dispatch 动作：
 *   status / instances.add|remove|update|switch|disconnect / platform.start|stop
 *   send {platform, target, content} / sessions
 *
 * 生命周期由宿主 PluginServiceManager（Supervisor）管理。
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { createKvClient } = require('./kvclient');
const { createWsClient } = require('./wsclient');
const { StateManager } = require('./state');
const { AiBridge } = require('./ai');
const { parseCommand, helpText } = require('./commands');
const { QQBotAdapter } = require('./platforms/qqbot');
const { FeishuAdapter } = require('./platforms/feishu');
const { DingTalkAdapter } = require('./platforms/dingtalk');

const VERSION = '0.1.0';
const PORT = parseInt(process.argv[2] || '0', 10);
const APP_CONFIG_DIR = process.argv[3] || '';
const SAVE_DEBOUNCE_MS = 1500;

let degraded = false;
const startedAt = Date.now();
const startedHold = [];

function log(level, msg) {
  const line = `[im-bridge][${new Date().toISOString()}][${level}] ${msg}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  try {
    if (APP_CONFIG_DIR) {
      const dir = path.join(APP_CONFIG_DIR, 'plugins');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'im-bridge.log'), line + '\n');
    }
  } catch (_) {}
}

// ── 宿主通道 ────────────────────────────────────────────────────────────────

const kv = createKvClient({ log: (l, m) => log(l, m), appConfigDir: APP_CONFIG_DIR });
const state = new StateManager(kv, log);
const wsc = createWsClient({ kv, log: (l, m) => log(l, m), onImEvent: () => {} });
const ai = new AiBridge(kv, wsc, log);

// ── 适配器管理 ──────────────────────────────────────────────────────────────

/** platform -> adapter 实例（运行态） */
const adapters = new Map();

function makeAdapter(inst) {
  const hooks = {
    onMessage: (msg) => onImMessage(inst, msg),
    onState: () => {},
    isDup: (id) => state.isDup(id),
    log,
  };
  if (inst.platform === 'qqbot') return new QQBotAdapter(inst.config || {}, hooks);
  if (inst.platform === 'feishu') return new FeishuAdapter(inst.config || {}, hooks);
  if (inst.platform === 'dingtalk') return new DingTalkAdapter(inst.config || {}, hooks);
  throw new Error(`未知平台: ${inst.platform}`);
}

async function startPlatform(platform) {
  const inst = state.getActiveInstance(platform);
  if (!inst) throw new Error(`平台 ${platform} 无激活实例`);
  if (!inst.enabled) throw new Error(`实例 ${inst.name} 未启用`);
  if (adapters.has(platform)) {
    const existing = adapters.get(platform);
    if (existing.adapter && existing.adapter.status().connected) {
      log('info', `[${platform}] 已连接，跳过重复 connect`);
      return;
    }
  }
  const adapter = makeAdapter(inst);
  adapters.set(platform, { adapter, instanceId: inst.id });
  await adapter.connect();
  log('info', `[${platform}] 已连接（实例 ${inst.name}）`);
}

async function stopPlatform(platform) {
  const entry = adapters.get(platform);
  if (entry) {
    await entry.adapter.disconnect();
    adapters.delete(platform);
    log('info', `[${platform}] 已断开`);
  }
}

async function restartAdapter(platform) {
  await stopPlatform(platform);
  const inst = state.getActiveInstance(platform);
  if (inst && inst.enabled) await startPlatform(platform);
}

// ── 消息处理主链路 ──────────────────────────────────────────────────────────

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await state.saveConvs();
      await state.saveDedup();
    } catch (e) { log('warn', `save state: ${e.message}`); }
  }, SAVE_DEBOUNCE_MS);
}

/** IM 消息入口（命令分流 + AI 回复，对照 manager.rs handle_message） */
async function onImMessage(inst, msg) {
  const convId = msg.conversationId;
  if (!convId) return;

  // 媒体下载（有媒体时）
  let text = '';
  const content = msg.content || {};
  if (content.type !== 'text' && content.type !== 'mixed') {
    const entry = adapters.get(msg.platform);
    if (entry) {
      const mediaDir = (convState(msg).workDir)
        ? path.join(convState(msg).workDir, '.media')
        : path.join(APP_CONFIG_DIR || '.', 'media');
      try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (_) {}
      const results = await entry.adapter.downloadMedia(msg, mediaDir).catch(() => []);
      for (const r of results) {
        text += r.localPath ? `[${r.label}] 已保存到: ${r.localPath}\n` : `[${r.label}] 下载失败\n`;
      }
    }
    if (content.type === 'mixed') {
      for (const it of content.items || []) {
        if (it.type === 'text' && it.text) text += (text ? '\n' : '') + it.text;
      }
    }
  } else {
    text = content.text || '';
  }
  if (!text || !text.trim()) { log('debug', '空消息，跳过'); return; }

  // 命令解析
  const cmd = parseCommand(text, { engineAliases: engineAliases });
  if (cmd) {
    const reply = await handleCommand(msg.platform, convId, cmd).catch((e) => `❌ 命令执行失败: ${e.message}`);
    if (reply) await sendReply(msg.platform, convId, reply);
    return;
  }

  // AI 回复（per-conversation 串行：同一会话上一条没跑完先排队）
  await enqueueAi(msg.platform, convId, text);
}

/** per-conversation 串行队列 */
const convQueues = new Map();
const convRunning = new Set();

async function enqueueAi(platform, convId, text) {
  if (convRunning.has(convId)) {
    await sendReply(platform, convId, '⏳ 上一条消息还在处理中，请稍候…');
    return;
  }
  convRunning.add(convId);
  try {
    await processAi(platform, convId, text);
  } finally {
    convRunning.delete(convId);
  }
}

async function processAi(platform, convId, text) {
  const s = convState(convId);
  s.lastActivity = Date.now();
  s.messageCount += 1;

  const t0 = Date.now();
  try {
    const { text: reply } = await ai.chat(s, text);
    if (reply && reply.trim()) {
      await sendReply(platform, convId, reply);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      await sendReply(platform, convId, `✅ 处理完成（⏰ ${secs}s）`);
    } else {
      await sendReply(platform, convId, '⚠️ AI 未生成回复内容。可能原因：模型调用超时、API Key 无效或 provider 配置有误。请检查设置后重试。');
    }
  } catch (e) {
    log('error', `AI 回复失败 conv=${convId}: ${e.message}`);
    await sendReply(platform, convId, `❌ AI 调用失败: ${e.message}`).catch(() => {});
  } finally {
    scheduleSave();
  }
}

function convState(convId) {
  return state.getOrCreateConv(convId);
}

async function sendReply(platform, convId, text) {
  const entry = adapters.get(platform);
  if (!entry) return;
  try {
    await entry.adapter.send({ type: 'conversation', value: convId }, { type: 'text', text });
  } catch (e) {
    log('error', `发送回复失败 conv=${convId}: ${e.message}`);
  }
}

// ── 命令处理（对照 manager.rs handle_command）──────────────────────────────

let engineAliases = ['claude', 'claude-code', 'simple-ai', 'simpleai', 'pi', 'opencode'];

async function refreshEngineAliases() {
  try {
    const r = await kv.dispatchOk('cap.ai.chat', { action: 'describe' }, { timeoutMs: 10000 }).catch(() => null);
    // describe 不提供引擎清单；改走 get_engine_metadata_list 的 IPC 桥
    const metas = await kv.dispatchOk('cap.self.inspect', { action: 'engines' }, { timeoutMs: 10000 }).catch(() => null);
    if (metas && Array.isArray(metas.engines)) {
      const names = [];
      for (const e of metas.engines) {
        if (e.id) names.push(e.id);
        if (Array.isArray(e.aliases)) names.push(...e.aliases);
      }
      if (names.length) engineAliases = names;
    }
  } catch (_) { /* 保持默认别名 */ }
}

async function handleCommand(platform, convId, cmd) {
  const s = convState(convId);
  switch (cmd.kind) {
    case 'switch_engine': {
      s.engineId = cmd.engine;
      s.customPrompt = cmd.customPrompt;
      s.promptMode = cmd.customPrompt ? 'append' : 'append';
      scheduleSave();
      const preview = cmd.customPrompt ? `（提示词: ${cmd.customPrompt.slice(0, 20)}${cmd.customPrompt.length > 20 ? '…' : ''}）` : '';
      return `✅ 已切换到 ${cmd.engine} 模型${preview}`;
    }
    case 'engine_info': {
      const lines = ['🤖 **引擎信息**\n'];
      for (const a of engineAliases) lines.push(`• ${a}`);
      lines.push('\n💡 使用 `/claude [提示词]` 或 `/simple-ai [提示词]` 切换引擎');
      return lines.join('\n');
    }
    case 'interrupt': {
      const ok = await ai.interrupt(s);
      return ok ? '✅ 已中断当前对话' : '⚠️ 当前没有进行中的对话';
    }
    case 'status': {
      const lines = ['📊 **当前状态**\n'];
      lines.push(`🤖 模型: ${s.engineId}`);
      lines.push(`📁 工作目录: ${s.workDir || '默认'}`);
      if (s.aiSessionId) lines.push(`🔗 会话: ${s.aiSessionId.slice(0, 8)}…`);
      lines.push(`💬 消息数: ${s.messageCount}`);
      return lines.join('\n');
    }
    case 'set_path':
      s.workDir = cmd.path;
      scheduleSave();
      return `✅ 工作目录已设置: ${cmd.path}`;
    case 'get_path':
      return `📁 当前工作目录: ${s.workDir || '默认（未设置）'}`;
    case 'workspace': {
      if (!s.workDir) return '📁 未设置工作目录（使用 /path <目录> 设置）';
      const name = path.basename(s.workDir);
      return `📂 工作区: ${name}\n📁 路径: ${s.workDir}`;
    }
    case 'resume': {
      if (s.aiSessionId) {
        s.pendingResume = true;
        scheduleSave();
        return `🔄 将在下一条消息时恢复会话 ${s.aiSessionId.slice(0, 8)}…`;
      }
      return '⚠️ 没有可恢复的会话';
    }
    case 'restart':
      s.aiSessionId = null;
      s.pendingResume = false;
      scheduleSave();
      return '🔄 会话已重启（下一条消息将创建新会话）';
    case 'clear':
      s.aiSessionId = null;
      s.pendingResume = false;
      scheduleSave();
      return '✅ 已清除 AI 上下文';
    case 'list_presets': {
      try {
        const r = await kv.dispatchOk('cap.prompt_snippet', { action: 'list' }, { timeoutMs: 10000 });
        const items = (r && r.items) || r || [];
        if (!Array.isArray(items) || items.length === 0) return '📋 暂无可用预设';
        const lines = ['📋 **可用预设**\n'];
        for (const it of items) lines.push(`• ${it.id || it.name}`);
        return lines.join('\n');
      } catch (e) {
        return `⚠️ 获取预设失败: ${e.message}`;
      }
    }
    case 'switch_preset': {
      s.promptPresetId = cmd.presetId || null;
      scheduleSave();
      return cmd.presetId ? `✅ 已切换预设: ${cmd.presetId}` : '✅ 已恢复默认提示词';
    }
    case 'help':
    default:
      return helpText();
  }
}

// ── HTTP 服务（健康检查 + 面板控制通道）────────────────────────────────────

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

const server = http.createServer((req, res) => {
  if (req.url === '/__health' || req.url === '/__health/') {
    json(res, 200, {
      ok: true,
      version: VERSION,
      degraded,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      wsUp: wsc.isUp(),
      platforms: Object.fromEntries([...adapters.entries()].map(([p, e]) => [p, e.adapter.status()])),
    });
    return;
  }
  if (req.url === '/dispatch' || req.url === '/dispatch/') {
    readBody(req).then((body) => handleDispatch(body)).then(
      (result) => json(res, 200, { ok: true, result }),
      (e) => json(res, 200, { ok: false, error: e.message }),
    );
    return;
  }
  json(res, 404, { ok: false, error: 'not found' });
});
if (PORT > 0) server.listen(PORT, '127.0.0.1', () => log('info', `HTTP on 127.0.0.1:${PORT}`));

/** 面板 /dispatch 动作路由 */
async function handleDispatch(body) {
  const action = body.action || '';
  switch (action) {
    case 'status': {
      const out = {};
      for (const p of ['qqbot', 'feishu', 'dingtalk']) {
        const e = adapters.get(p);
        out[p] = e ? e.adapter.status() : { platform: p, connected: false, connectionState: 'disconnected', stats: { received: 0, sent: 0, errors: 0 } };
      }
      return { platforms: out, sessions: [...state.convs.values()].map((s) => ({ conversationId: s.conversationId, engineId: s.engineId, lastActivity: s.lastActivity, messageCount: s.messageCount })) };
    }
    case 'instances.list':
      return { instances: state.listInstances(body.platform || null), activeByPlatform: state.activeByPlatform };
    case 'instances.add': {
      const inst = body.instance;
      if (!inst || !inst.platform || !inst.id) throw new Error('instance 参数不完整');
      state.addInstance(inst);
      await state.saveInstances();
      return { instanceId: inst.id };
    }
    case 'instances.remove': {
      const removed = state.removeInstance(body.instanceId);
      await state.saveInstances();
      // 若删的是运行中实例，断开
      for (const [p, e] of adapters.entries()) {
        if (removed && e.instanceId === removed.id) await stopPlatform(p);
      }
      return { instance: removed };
    }
    case 'instances.update': {
      const ok = state.updateInstance(body.instance);
      if (!ok) throw new Error(`实例不存在: ${body.instance && body.instance.id}`);
      await state.saveInstances();
      await restartAdapter(body.instance.platform).catch(() => {});
      return {};
    }
    case 'instances.switch': {
      if (!state.activateInstance(body.instanceId)) throw new Error(`实例不存在: ${body.instanceId}`);
      await state.saveInstances();
      const inst = state.getInstance(body.instanceId);
      if (inst) await restartAdapter(inst.platform).catch(() => {});
      return {};
    }
    case 'platform.start':
      await startPlatform(body.platform);
      return {};
    case 'platform.stop':
      await stopPlatform(body.platform);
      return {};
    case 'platform.disconnect': {
      const inst = state.getActiveInstance(body.platform);
      if (inst) { inst.enabled = false; await state.saveInstances(); }
      await stopPlatform(body.platform);
      return {};
    }
    case 'send': {
      const entry = adapters.get(body.platform);
      if (!entry) throw new Error(`平台 ${body.platform} 未连接`);
      await entry.adapter.send(body.target, body.content);
      return {};
    }
    case 'ai.delta.subscribe': {
      // 面板流式预览：HTTP 轮询场景下返回最近累积文本（简化；WS 直连面板可后续增强）
      return {};
    }
    default:
      throw new Error(`未知 action: ${action}`);
  }
}

// ── 启动 ───────────────────────────────────────────────────────────────────

/** 从宿主 config.json 一次性导入实例（spec D3：迁移后不留兼容垫层） */
async function importFromHostConfig() {
  if (state.instances.length > 0) return; // 已有数据则跳过
  try {
    const cfgPath = path.join(APP_CONFIG_DIR || '.', 'config.json');
    if (!fs.existsSync(cfgPath)) return;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    let imported = 0;
    const map = [
      ['qqbot', 'qqbot', (i) => ({ appId: i.appId, clientSecret: i.clientSecret, sandbox: !!i.sandbox, workDir: i.workDir || null })],
      ['feishu', 'feishu', (i) => ({ appId: i.appId, appSecret: i.appSecret, workDir: i.workDir || null })],
      ['dingtalk', 'dingtalk', (i) => ({ appId: i.appKey || i.appId, appSecret: i.appSecret, webhookUrl: i.webhookUrl || null, workDir: i.workDir || null })],
    ];
    for (const [cfgKey, platform, mapFn] of map) {
      const section = cfg[cfgKey];
      if (!section || !Array.isArray(section.instances)) continue;
      for (const i of section.instances) {
        if (!i.id) continue;
        if (state.getInstance(i.id)) continue;
        state.addInstance({
          id: i.id,
          name: i.name || cfgKey,
          platform,
          enabled: i.enabled !== false,
          config: mapFn(i),
          createdAt: i.createdAt || new Date().toISOString(),
          lastActive: i.lastActive || null,
        });
        if (section.activeInstanceId && section.activeInstanceId === i.id) {
          state.activateInstance(i.id);
        }
        imported += 1;
      }
    }
    if (imported > 0) {
      await state.saveInstances();
      log('info', `已从宿主 config.json 导入 ${imported} 个实例（spec D3 一次性迁移）`);
    }
  } catch (e) {
    log('warn', `导入宿主配置失败: ${e.message}`);
  }
}

async function autoStart() {
  for (const p of ['qqbot', 'feishu', 'dingtalk']) {
    const inst = state.getActiveInstance(p);
    if (inst && inst.enabled && inst.config && (inst.config.autoConnect !== false)) {
      try {
        await startPlatform(p);
      } catch (e) {
        log('warn', `自动连接 ${p} 失败: ${e.message}（将重试）`);
      }
    }
  }
}

async function main() {
  log('info', `im-bridge service v${VERSION} starting (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
  await state.load();
  await importFromHostConfig();
  await refreshEngineAliases();
  await autoStart();
  // 去重表定期落盘
  setInterval(() => { scheduleSave(); }, 30 * 1000);
  // MCP 发送信箱消费（先删后做；MCP im_send 写入，此处消费发送）
  setInterval(() => { consumeSendMailbox().catch((e) => log('warn', `send-mailbox: ${e.message}`)); }, 5 * 1000);
  // 状态快照（MCP im_status / 面板轮询共用；30s 心跳）
  setInterval(() => { publishStatus().catch((e) => log('warn', `publish-status: ${e.message}`)); }, 30 * 1000);
  log('info', `im-bridge service started (instances=${state.instances.length}, ws=${wsc.isUp()})`);
}

/** 消费 MCP 的发送信箱：key = im-bridge:send-mailbox，值为 {id, platform, target, content} 数组 */
async function consumeSendMailbox() {
  const KEY = 'im-bridge:send-mailbox';
  let items = null;
  try {
    items = await kv.kvGet(KEY);
  } catch (_) { return; }
  if (!Array.isArray(items) || items.length === 0) return;
  // 先删后做（防重复消费：清空后再逐条处理）
  await kv.kvSet(KEY, []);
  for (const item of items) {
    try {
      const entry = adapters.get(item.platform);
      if (!entry) throw new Error(`平台 ${item.platform} 未连接`);
      await entry.adapter.send(item.target, item.content);
      log('info', `[mcp-mailbox] 已发送到 ${item.platform}`);
    } catch (e) {
      log('error', `[mcp-mailbox] 发送失败: ${e.message}`);
    }
  }
}

/** 把各平台状态快照写 cap.kv（MCP im_status 消费） */
async function publishStatus() {
  const out = {};
  for (const p of ['qqbot', 'feishu', 'dingtalk']) {
    const e = adapters.get(p);
    out[p] = e ? e.adapter.status() : { platform: p, connected: false, connectionState: 'disconnected' };
  }
  await kv.kvSet('im-bridge:status', out);
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`));

main().catch((e) => {
  log('error', `main 启动失败: ${e.message}`);
  process.exitCode = 1;
});
