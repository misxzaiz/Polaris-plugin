'use strict';
/**
 * platforms/dingtalk.js —— 钉钉 Stream Mode 适配器（Node ≥ 22，零 npm 依赖）
 *
 * 协议对照主仓 integrations/dingtalk/adapter.rs（金标）：
 *   - 网关：POST https://api.dingtalk.com/v1.0/gateway/connections/open
 *     {clientId, clientSecret, subscriptions:[{type:EVENT,topic:*},{type:CALLBACK,topic:/v1.0/im/bot/messages/get}]}
 *     → { endpoint, ticket }
 *   - WS：endpoint?ticket=<ticket>（endpoint 可能已含端口）
 *   - 帧：JSON Text/Binary，{ type: SYSTEM|EVENT|CALLBACK, headers: {topic,messageId,...}, data }
 *   - SYSTEM topic: CONNECTED / REGISTERED / KEEPALIVE / ping（回 pong）/ disconnect
 *   - EVENT/CALLBACK：先回 ACK {code:200, headers:{contentType,messageId}, message:"OK", data:"{\"status\":\"SUCCESS\"}"}
 *   - 消息 data: {senderNick, senderId, conversationId, conversationType(1=单聊 2=群聊), msgtype, text:{content}, sessionWebhook}
 *   - 发送：POST sessionWebhook（或配置的群 webhook），{msgtype:'text', text:{content}, at:{...}}
 */

const GATEWAY_URL = 'https://api.dingtalk.com/v1.0/gateway/connections/open';
const TOPIC_ROBOT = '/v1.0/im/bot/messages/get';
const CONNECT_TIMEOUT_MS = 15 * 1000;

function httpJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body == null ? null : JSON.stringify(body);
    const mod = u.protocol === 'https:' ? require('https') : require('http');
    const r = mod.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method, headers, timeout: timeoutMs },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(buf); } catch (_) {}
          resolve({ status: res.statusCode, text: buf, json: parsed });
        });
      },
    );
    r.on('timeout', () => r.destroy(new Error('请求超时')));
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

class DingTalkAdapter {
  constructor(instanceConfig, hooks) {
    this.cfg = instanceConfig;
    this.hooks = hooks;
    this.ws = null;
    this.reconnectTimer = null;
    this.closedByUs = false;
    this.reconnectAttempt = 0;
    this.endpoint = null;
    this.ticket = null;
    /** 会话 webhook（Stream Mode 回复通道）：convId -> url */
    this.sessionWebhooks = new Map();
    this.state = {
      connectionState: 'disconnected',
      error: null,
      errorDetail: null,
      lastActivity: null,
      stats: { received: 0, sent: 0, errors: 0 },
      retryCount: 0,
    };
  }

  get platform() { return 'dingtalk'; }

  status() {
    return {
      platform: 'dingtalk',
      instanceId: this.cfg.id,
      instanceName: this.cfg.name || 'DingTalk',
      connected: this.state.connectionState === 'ready',
      connectionState: this.state.connectionState,
      error: this.state.error,
      errorDetail: this.state.errorDetail,
      lastActivity: this.state.lastActivity,
      stats: this.state.stats,
      retryCount: this.state.retryCount,
    };
  }

  setState(connectionState, error = null, errorDetail = null) {
    this.state.connectionState = connectionState;
    this.state.error = error;
    this.state.errorDetail = errorDetail;
    this.hooks.onState(this.status());
  }

  async getEndpoint() {
    const r = await httpJson(GATEWAY_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: {
        clientId: this.cfg.appId,
        clientSecret: this.cfg.appSecret,
        subscriptions: [
          { type: 'EVENT', topic: '*' },
          { type: 'CALLBACK', topic: TOPIC_ROBOT },
        ],
      },
    });
    const j = r.json || {};
    if (r.status !== 200 || !j.endpoint || !j.ticket) {
      throw new Error(`获取网关连接点失败: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    }
    this.endpoint = j.endpoint;
    this.ticket = j.ticket;
    return { endpoint: j.endpoint, ticket: j.ticket };
  }

  buildWsUrl(endpoint, ticket) {
    return `${endpoint}?ticket=${encodeURIComponent(ticket)}`;
  }

  async connect() {
    this.closedByUs = false;
    try {
      this.setState('connecting');
      const { endpoint, ticket } = await this.getEndpoint();
      this.setState('authenticating');
      await this.openWs(this.buildWsUrl(endpoint, ticket));
    } catch (e) {
      this.state.retryCount += 1;
      this.setState('failed', e.message, e.stack);
      this.scheduleReconnect();
      throw e;
    }
  }

  openWs(wsUrl) {
    return new Promise((resolve, reject) => {
      const WebSocket = global.WebSocket;
      if (!WebSocket) { reject(new Error('当前 Node 无全局 WebSocket（需 ≥ 22）')); return; }
      let settled = false;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      // 钉钉 Stream Mode：连接即 Ready（不等服务端确认）
      ws.addEventListener('open', () => {
        clearTimeout(timeout);
        this.setState('ready');
        this.hooks.log('info', '[dingtalk] WebSocket 已连接（Stream Mode）');
        if (!settled) { settled = true; resolve(); }
      });
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('WebSocket 连接超时（15s）')); try { ws.close(); } catch (_) {} }
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('message', (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
        let parsed;
        try { parsed = JSON.parse(text); } catch (_) { return; }
        const msgType = parsed.type || '';
        if (msgType === 'SYSTEM') {
          const topic = (parsed.headers || {}).topic || '';
          if (topic === 'ping') this.sendPong(parsed.headers || {});
          else if (topic === 'disconnect') {
            this.hooks.log('warn', '[dingtalk] 服务端要求断开');
            try { ws.close(); } catch (_) {}
          }
          return;
        }
        if (msgType === 'EVENT' || msgType === 'CALLBACK') {
          const messageId = (parsed.headers || {}).messageId;
          if (messageId) this.sendAck(messageId);
          const parsed2 = this.parseEvent(parsed);
          if (parsed2) {
            const { msg, webhook } = parsed2;
            if (webhook) this.sessionWebhooks.set(msg.conversationId, webhook);
            this.state.stats.received += 1;
            this.state.lastActivity = Date.now();
            this.hooks.onMessage(msg);
          }
        }
      });

      ws.addEventListener('close', (ev) => {
        clearTimeout(timeout);
        this.ws = null;
        if (this.closedByUs) { this.setState('disconnected'); return; }
        const code = ev && ev.code;
        this.setState('failed', `连接关闭 (${code})`, ev && ev.reason ? String(ev.reason) : '');
        if (!settled) { settled = true; reject(new Error(`WebSocket 关闭: ${code}`)); }
        this.scheduleReconnect();
      });

      ws.addEventListener('error', () => {});
    });
  }

  sendAck(messageId) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const ack = {
      code: 200,
      headers: { contentType: 'application/json', messageId },
      message: 'OK',
      data: JSON.stringify({ status: 'SUCCESS' }),
    };
    try { this.ws.send(JSON.stringify(ack)); } catch (_) {}
  }

  sendPong(headers) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const pong = {
      code: 200,
      headers,
      message: 'OK',
      data: '{}',
    };
    try { this.ws.send(JSON.stringify(pong)); } catch (_) {}
  }

  stripAtMention(text) {
    return String(text || '').replace(/\n?@[^\n\s]+\s*/g, '').trim();
  }

  parseEvent(payload) {
    const raw = payload.data;
    if (typeof raw !== 'string') return null;
    let data;
    try { data = JSON.parse(raw); } catch (_) { return null; }
    const messageId = (payload.headers || {}).messageId || '';
    if (this.hooks.isDup && messageId && this.hooks.isDup(messageId)) return null;

    const conversationId = data.conversationId || '';
    const senderId = data.senderId || data.senderStaffId || '';
    const senderName = data.senderNick || data.senderName || senderId;
    const msgtype = data.msgtype || 'text';

    let content;
    if (msgtype === 'text') {
      content = { type: 'text', text: this.stripAtMention((data.text && data.text.content) || '') };
    } else if (msgtype === 'markdown') {
      content = { type: 'text', text: (data.markdown && data.markdown.text) || '' };
    } else {
      content = { type: 'text', text: `[钉钉 ${msgtype} 消息]` };
    }

    const convType = Number(data.conversationType) || 0;
    const fullConvId = convType === 1 ? `dingtalk_dm_${conversationId}`
      : convType === 2 ? `dingtalk_group_${conversationId}`
        : `dingtalk_${conversationId}`;

    const msg = {
      id: messageId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      platform: 'dingtalk',
      conversationId: fullConvId,
      senderId: String(senderId),
      senderName: String(senderName),
      content,
      timestamp: Date.now(),
      platformMessageId: messageId || null,
    };
    return { msg, webhook: data.sessionWebhook || null };
  }

  async sendViaWebhook(webhook, text) {
    const r = await httpJson(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { msgtype: 'text', text: { content: text }, at: { atMobiles: [], atUserIds: [], atAll: false } },
    });
    const j = r.json || {};
    if (r.status !== 200 || (j.errcode !== undefined && Number(j.errcode) !== 0)) {
      throw new Error(`Webhook 发送失败: HTTP ${r.status} errcode=${j.errcode} errmsg=${j.errmsg}`);
    }
    this.state.stats.sent += 1;
  }

  async send(target, content) {
    const text = this.extractText(content);
    if (!text) throw new Error('钉钉发送仅支持文本消息');
    if (target.type === 'webhook') {
      if (!target.value) throw new Error('Webhook URL 为空');
      return this.sendViaWebhook(target.value, text);
    }
    let convId = null;
    if (target.type === 'conversation') convId = target.value;
    else if (target.type === 'user') convId = `dingtalk_dm_${target.value}`;
    else if (target.type === 'channel') convId = `dingtalk_group_${target.value}`;
    else throw new Error(`钉钉不支持目标类型: ${target.type}`);

    const webhook = this.sessionWebhooks.get(convId) || this.cfg.webhookUrl || '';
    if (!webhook) {
      throw new Error('未配置 Webhook URL，请在钉钉配置中填写 Webhook 地址以启用回复功能');
    }
    return this.sendViaWebhook(webhook, text);
  }

  extractText(content) {
    if (!content) return '';
    if (content.type === 'text') return content.text || '';
    if (content.type === 'mixed') {
      for (const it of content.items || []) {
        if (it.type === 'text' && it.text) return it.text;
      }
    }
    return '';
  }

  async downloadMedia() {
    // 钉钉机器人消息不携带可直接下载的媒体 URL（需企业内部 API），保持与主仓一致的空实现
    return [];
  }

  async disconnect() {
    this.closedByUs = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(1000, 'client disconnect'); } catch (_) {}
      this.ws = null;
    }
    this.setState('disconnected');
  }
}

module.exports = { DingTalkAdapter };
