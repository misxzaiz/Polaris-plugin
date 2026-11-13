'use strict';
/**
 * platforms/qqbot.js —— QQ 开放平台 Bot 适配器（Node ≥ 22，零 npm 依赖）
 *
 * 协议对照主仓 integrations/qqbot/adapter.rs（金标）：
 *   - Token：POST https://bots.qq.com/app/getAppAccessToken {appId, clientSecret}
 *     → { access_token, expires_in }（提前 5min 刷新）
 *   - Gateway：GET {api}/gateway/bot（Authorization: QQBot <token>）→ { url }
 *   - WS：url 连接后发 op=2 鉴权 {token: "QQBot <t>", intents, shard:[0,1]}
 *   - 心跳：op=1 {d: seq}，按 READY 下发的 heartbeat_interval
 *   - 事件：op=0 DISPATCH（t=事件类型，d=数据）；11=HEARTBEAT_ACK；7=服务端要求重连
 *   - 消息事件：C2C_MESSAGE_CREATE / GROUP_AT_MESSAGE_CREATE / AT_MESSAGE_CREATE
 *     / DIRECT_MESSAGE_CREATE / MESSAGE_CREATE
 *   - 发送：POST {api}/v2/users/{openid}/messages（C2C）| {api}/channels/{cid}/messages
 *
 * 状态回报经 onState(status) 回调（main 汇总后推给面板/宿主）。
 */

const crypto = require('crypto');

const QQ_API = 'https://api.sgroup.qq.com';
const QQ_API_SANDBOX = 'https://sandbox.api.sgroup.qq.com';
const QQ_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const INTENTS =
  (1 << 9) |   // GUILD_MESSAGES
  (1 << 12) |  // DIRECT_MESSAGE
  (1 << 25) |  // AT_MESSAGES
  (1 << 30);   // PUBLIC_GUILD_MESSAGES
const CONNECT_TIMEOUT_MS = 15 * 1000;

function httpJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body == null ? null : JSON.stringify(body);
    const req = require('http').request;
    const mod = u.protocol === 'https:' ? require('https') : require('http');
    const r = mod.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method, headers, timeout: timeoutMs },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(buf); } catch (_) { /* 保留原始文本 */ }
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

class QQBotAdapter {
  /**
   * @param {object} instanceConfig 实例配置（appId/clientSecret/sandbox/name/id）
   * @param {object} hooks { onMessage(msg), onState(status), log(level,msg) }
   */
  constructor(instanceConfig, hooks) {
    this.cfg = instanceConfig;
    this.hooks = hooks;
    this.accessToken = null;
    this.tokenExpireAt = 0;
    this.ws = null;
    this.seq = 0;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.closedByUs = false;
    this.reconnectAttempt = 0;
    this.state = {
      connectionState: 'disconnected', // disconnected/connecting/authenticating/ready/failed/reconnecting
      error: null,
      errorDetail: null,
      lastActivity: null,
      stats: { received: 0, sent: 0, errors: 0 },
      retryCount: 0,
    };
  }

  get platform() { return 'qqbot'; }

  apiBase() { return this.cfg.sandbox ? QQ_API_SANDBOX : QQ_API; }

  status() {
    return {
      platform: 'qqbot',
      instanceId: this.cfg.id,
      instanceName: this.cfg.name || 'QQ Bot',
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

  async ensureToken() {
    if (this.accessToken && Date.now() / 1000 < this.tokenExpireAt) return;
    const r = await httpJson(QQ_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { appId: this.cfg.appId, clientSecret: this.cfg.clientSecret },
    });
    if (r.status !== 200 || !r.json || !r.json.access_token) {
      throw new Error(`获取 Access Token 失败: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    }
    this.accessToken = r.json.access_token;
    const expiresIn = Number(r.json.expires_in) || 7200;
    this.tokenExpireAt = Date.now() / 1000 + expiresIn - 300;
    this.hooks.log('info', `[qqbot] token ok, expires in ${expiresIn}s`);
  }

  async getGatewayUrl() {
    const r = await httpJson(`${this.apiBase()}/gateway/bot`, {
      headers: { Authorization: `QQBot ${this.accessToken}`, 'User-Agent': 'Polaris-IMBridge/0.1' },
    });
    if (r.status !== 200 || !r.json || !r.json.url) {
      throw new Error(`获取 Gateway 失败: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    }
    const limit = r.json.session_start_limit;
    if (limit && Number(limit.remaining) <= 0) {
      throw new Error(`会话启动次数已用完，${limit.reset_after}ms 后重置`);
    }
    return r.json.url;
  }

  async connect() {
    this.closedByUs = false;
    try {
      this.setState('connecting');
      await this.ensureToken();
      const gateway = await this.getGatewayUrl();
      this.setState('authenticating');
      await this.openWs(gateway);
    } catch (e) {
      this.state.retryCount += 1;
      this.setState('failed', e.message, e.stack);
      this.scheduleReconnect();
      throw e;
    }
  }

  openWs(gatewayUrl) {
    return new Promise((resolve, reject) => {
      const WebSocket = global.WebSocket;
      if (!WebSocket) { reject(new Error('当前 Node 无全局 WebSocket（需 ≥ 22）')); return; }
      let settled = false;
      const ws = new WebSocket(gatewayUrl);
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('WebSocket 鉴权超时（15s）')); try { ws.close(); } catch (_) {} }
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('open', () => {
        // op=2 鉴权
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: `QQBot ${this.accessToken}`,
            intents: INTENTS,
            shard: [0, 1],
            properties: { $os: process.platform, $browser: 'polaris-im-bridge' },
          },
        }));
        this.hooks.log('info', '[qqbot] op=2 鉴权已发送');
      });

      ws.addEventListener('message', (ev) => {
        let payload;
        try { payload = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch (_) { return; }
        const op = payload.op;
        if (op === 11) return; // HEARTBEAT_ACK
        if (op === 0) {
          if (typeof payload.s === 'number') this.seq = payload.s;
          const t = payload.t || '';
          const d = payload.d || {};
          if (t === 'READY') {
            clearTimeout(timeout);
            if (!settled) { settled = true; resolve(); }
            const interval = Number(d.heartbeat_interval) || 30000;
            this.startHeartbeat(interval);
            this.setState('ready');
            this.hooks.log('info', `[qqbot] READY, session=${d.session_id}, heartbeat=${interval}ms`);
            return;
          }
          if (t.endsWith('MESSAGE_CREATE')) {
            const msg = this.parseMessage(t, d);
            if (msg) {
              this.state.stats.received += 1;
              this.state.lastActivity = Date.now();
              this.hooks.onMessage(msg);
            }
          }
          return;
        }
        if (op === 7) {
          this.hooks.log('warn', '[qqbot] 服务端要求重连（op=7）');
          try { ws.close(); } catch (_) {}
        }
      });

      ws.addEventListener('close', (ev) => {
        clearTimeout(timeout);
        this.stopHeartbeat();
        this.ws = null;
        if (this.closedByUs) { this.setState('disconnected'); return; }
        const code = ev && ev.code;
        const reason = ev && ev.reason ? String(ev.reason) : '';
        this.setState('failed', `连接关闭 (${code})`, reason);
        if (!settled) { settled = true; reject(new Error(`WebSocket 关闭: ${code} ${reason}`)); }
        this.scheduleReconnect();
      });

      ws.addEventListener('error', () => { /* close 事件会跟进 */ });
    });
  }

  startHeartbeat(intervalMs) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        try { this.ws.send(JSON.stringify({ op: 1, d: this.seq })); } catch (_) {}
      }
    }, Math.max(5, intervalMs - 1000));
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  scheduleReconnect() {
    if (this.closedByUs) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30 * 1000);
    this.reconnectAttempt += 1;
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }

  /** 事件数据 → 统一消息（对照 adapter.rs handle_message_event） */
  parseMessage(eventType, d) {
    const msgId = d.id;
    if (!msgId) return null;
    const typeMap = {
      C2C_MESSAGE_CREATE: 'c2c',
      GROUP_AT_MESSAGE_CREATE: 'group_at',
      AT_MESSAGE_CREATE: 'at',
      DIRECT_MESSAGE_CREATE: 'direct',
      MESSAGE_CREATE: 'channel',
    };
    const msgType = typeMap[eventType] || 'unknown';
    const dedupId = `${msgType}_${msgId}`;
    if (this.hooks.isDup && this.hooks.isDup(dedupId)) return null;

    let conversationId = '';
    if (eventType === 'C2C_MESSAGE_CREATE') {
      conversationId = `c2c_${(d.author && d.author.user_openid) || ''}`;
    } else if (eventType === 'GROUP_AT_MESSAGE_CREATE') {
      conversationId = `group_${d.group_id || ''}`;
    } else if (eventType === 'AT_MESSAGE_CREATE' || eventType === 'MESSAGE_CREATE') {
      conversationId = d.channel_id || '';
    } else if (eventType === 'DIRECT_MESSAGE_CREATE') {
      conversationId = d.guild_id || '';
    } else {
      conversationId = d.channel_id || '';
    }

    const author = d.author || {};
    const senderId = author.id || author.member_openid || author.user_openid || '';
    const senderName = author.username || author.nickname || senderId;

    const attachments = d.attachments || [];
    const content = this.buildContent(d.content || '', attachments);

    return {
      id: dedupId,
      platform: 'qqbot',
      conversationId,
      senderId: String(senderId),
      senderName: String(senderName),
      content,
      timestamp: Number(d.timestamp) || Date.now(),
      platformMessageId: msgId,
    };
  }

  /** 文本 + 附件 → MessageContent（对齐 types.rs MessageContent 形状） */
  buildContent(text, attachments) {
    const items = [];
    const t = String(text || '').trim();
    if (t) items.push({ type: 'text', text: t });
    for (const att of attachments) {
      const url = att.url || '';
      const ct = att.content_type || '';
      if (ct.startsWith('image') || /\.(png|jpe?g|gif|webp)$/i.test(url)) {
        items.push({ type: 'image', url, fileName: att.filename || null, localPath: null });
      } else if (ct.startsWith('audio') || /\.silk$/i.test(url)) {
        items.push({ type: 'audio', url, fileName: att.filename || null, transcript: null });
      } else if (url) {
        items.push({ type: 'file', name: att.filename || 'file', url, size: Number(att.size) || 0 });
      }
    }
    if (items.length === 0) return { type: 'text', text: '' };
    if (items.length === 1) return items[0];
    return { type: 'mixed', items };
  }

  async send(target, content) {
    await this.ensureToken();
    const text = this.extractText(content);
    if (!text) throw new Error('QQ 发送仅支持文本消息');
    let convId = null;
    if (target.type === 'conversation') convId = target.value;
    else if (target.type === 'user') convId = `c2c_${target.value}`;
    else if (target.type === 'channel') convId = target.value;
    else throw new Error(`QQ 不支持目标类型: ${target.type}`);

    if (convId.startsWith('c2c_')) {
      await this.postMessage(`${this.apiBase()}/v2/users/${convId.slice(4)}/messages`, text);
    } else if (convId.startsWith('group_')) {
      // 群消息走群 API（v2 group messages）
      await this.postMessage(`${this.apiBase()}/v2/groups/${convId.slice(6)}/messages`, text);
    } else {
      await this.postMessage(`${this.apiBase()}/channels/${convId}/messages`, text);
    }
    this.state.stats.sent += 1;
  }

  async postMessage(url, text) {
    const r = await httpJson(url, {
      method: 'POST',
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Polaris-IMBridge/0.1',
      },
      body: { content: text, msg_id: this.lastMsgId || undefined },
    });
    if (r.status !== 200) {
      const body = r.text || '';
      if (body.includes('token') || body.includes('expire')) {
        this.accessToken = null;
        await this.ensureToken();
        const retry = await httpJson(url, {
          method: 'POST',
          headers: { Authorization: `QQBot ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: { content: text },
        });
        if (retry.status !== 200) throw new Error(`发送失败(重试): HTTP ${retry.status} ${retry.text.slice(0, 200)}`);
        return;
      }
      throw new Error(`发送失败: HTTP ${r.status} ${body.slice(0, 200)}`);
    }
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

  /** 下载媒体到 saveDir（对齐 adapter.rs download_media：直接 GET url 写文件） */
  async downloadMedia(msg, saveDir) {
    const fs = require('fs');
    const path = require('path');
    const items = [];
    const collect = (c) => {
      if (!c) return;
      if (c.type === 'image' || c.type === 'audio' || c.type === 'file') items.push(c);
      if (c.type === 'mixed') (c.items || []).forEach(collect);
    };
    collect(msg.content);
    const results = [];
    for (const item of items) {
      const url = item.url || '';
      const name = item.fileName || item.name || (item.type === 'image' ? 'image.png' : item.type === 'audio' ? 'audio.silk' : 'file');
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const file = path.join(saveDir, `${Math.floor(Date.now() / 1000)}_${safe}`);
        fs.writeFileSync(file, buf);
        results.push({ label: name, localPath: file });
      } catch (e) {
        this.hooks.log('error', `[qqbot] 下载媒体失败 ${name}: ${e.message}`);
        results.push({ label: name, localPath: null });
      }
    }
    return results;
  }

  async disconnect() {
    this.closedByUs = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(1000, 'client disconnect'); } catch (_) {}
      this.ws = null;
    }
    this.setState('disconnected');
  }
}

module.exports = { QQBotAdapter, httpJson };
