'use strict';
/**
 * im-bridge MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js {{appConfigDir}}
 *
 * 工具面（中文契约）：
 *   - im_send      发送 IM 消息（经 cap.kv 信箱转 service 消费）
 *   - im_status    查询平台连接状态（读 service 心跳快照）
 *   - im_instances 列出已配置实例
 *
 * 状态/实例直接读 cap.kv（im-bridge: 键空间）；发送走信箱（service 5s 消费）。
 */
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'im-bridge';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => log(l, m) });

function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function textResult(text) { return { content: [{ type: 'text', text }], isError: false }; }

// ── 工具实现 ────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'im_send',
    description: '发送 IM 消息到指定平台会话（QQ Bot / 飞书 / 钉钉）。platform 取 qqbot|feishu|dingtalk；conversationId 为会话标识（QQ: c2c_<openid> / group_<gid> / 频道ID；飞书: feishu_<chat_id>；钉钉: dingtalk_dm_<cid> / dingtalk_group_<cid>）；text 为要发送的文本。',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: '目标平台：qqbot | feishu | dingtalk' },
        conversationId: { type: 'string', description: '会话标识' },
        text: { type: 'string', description: '要发送的文本内容' },
      },
      required: ['platform', 'conversationId', 'text'],
      additionalProperties: false,
    },
    async call(args) {
      const platform = String(args.platform || '').trim();
      const conversationId = String(args.conversationId || '').trim();
      const text = String(args.text || '');
      if (!['qqbot', 'feishu', 'dingtalk'].includes(platform)) {
        return err(`platform 必须是 qqbot | feishu | dingtalk，收到: ${platform}`);
      }
      if (!conversationId) return err('conversationId 不能为空');
      if (!text.trim()) return err('text 不能为空');
      const mailbox = (await kv.kvGet('im-bridge:send-mailbox')) || [];
      const items = Array.isArray(mailbox) ? mailbox : [];
      items.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform,
        target: { type: 'conversation', value: conversationId },
        content: { type: 'text', text },
        at: Date.now(),
      });
      await kv.kvSet('im-bridge:send-mailbox', items);
      return textResult(`✅ 已提交发送任务到 ${platform}（会话 ${conversationId}），由 im-bridge 服务异步投递`);
    },
  },
  {
    name: 'im_status',
    description: '查询 IM 机器人各平台连接状态（连接状态机 / 收发统计 / 错误信息）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async call() {
      const status = (await kv.kvGet('im-bridge:status')) || {};
      const lines = ['📡 **IM 机器人状态**\n'];
      for (const p of ['qqbot', 'feishu', 'dingtalk']) {
        const s = status[p];
        if (!s) { lines.push(`• ${p}: 未配置`); continue; }
        const icon = s.connected ? '🟢' : (s.connectionState === 'failed' ? '🔴' : '🟡');
        lines.push(`• ${p}: ${icon} ${s.connectionState || 'unknown'}${s.error ? `（${s.error}）` : ''}`);
      }
      return textResult(lines.join('\n'));
    },
  },
  {
    name: 'im_instances',
    description: '列出已配置的 IM 实例（平台 / 名称 / 启用状态 / 激活状态）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async call() {
      const data = (await kv.kvGet('im-bridge:instances')) || {};
      const instances = Array.isArray(data.instances) ? data.instances : [];
      if (instances.length === 0) return textResult('📋 暂无已配置实例');
      const active = data.activeByPlatform || {};
      const lines = ['📋 **IM 实例**\n'];
      for (const i of instances) {
        const isActive = active[i.platform] === i.id;
        lines.push(`• [${i.platform}] ${i.name}（${i.id}）— ${i.enabled ? '启用' : '停用'}${isActive ? ' · 当前激活' : ''}`);
      }
      return textResult(lines.join('\n'));
    },
  },
];

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'ping') {
    send({ jsonrpc: '2.0', id: msg.id, result: {} });
    return;
  }
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: `未知工具: ${name}` } });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`工具执行失败: ${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `未知方法: ${msg.method}` } });
  }
}

log('info', `im-bridge MCP server v${SERVER_VERSION} 启动（tools: ${TOOLS.map((t) => t.name).join(', ')}）`);
