'use strict';
/**
 * platforms/feishu.js —— 飞书开放平台适配器（Node ≥ 22，零 npm 依赖）
 *
 * 协议对照主仓 integrations/feishu/adapter.rs + frame.rs（金标）：
 *   - Token：POST /open-apis/auth/v3/tenant_access_token/internal/ {app_id, app_secret}
 *     → { code:0, tenant_access_token, expire }（提前 5min 刷新）
 *   - WS 端点：POST /callback/ws/endpoint {AppID, AppSecret} → data.URL（大写字段）
 *   - pbbp2 帧：Binary WebSocket 帧，protobuf 手工编解码（见 decodeFrame/encodeFrame）
 *     method 0=Control(Ping/Pong) 1=Data(事件)；type header: ping/pong/event/card
 *   - 事件：DATA 帧 payload JSON header.event_type == im.message.receive_v1
 *   - ACK：对 DATA 帧回 ACK 帧（同 seq_id/log_id/service/method）
 *   - 发送：POST /open-apis/im/v1/messages?receive_id_type=chat_id
 *   - 媒体：GET /open-apis/im/v1/messages/{message_id}/resources/{key}?type=image|file
 */

const FEISHU_API = 'https://open.feishu.cn';
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

// ── pbbp2 protobuf 帧编解码（对照 frame.rs）─────────────────────────────────

function encodeVarint(value) {
  const out = [];
  let v = value;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
  return out;
}

function decodeVarint(data, offsetRef) {
  let result = 0;
  let shift = 0;
  while (offsetRef.i < data.length) {
    const b = data[offsetRef.i];
    offsetRef.i += 1;
    result += (b & 0x7f) * Math.pow(2, shift);
    if (!(b & 0x80)) return result;
    shift += 7;
    if (shift > 63) return null;
  }
  return null;
}

function encodeFieldVarint(buf, fieldNum, value) {
  buf.push((fieldNum << 3) | 0);
  for (const b of encodeVarint(value)) buf.push(b);
}

function encodeFieldBytes(buf, fieldNum, bytes) {
  buf.push((fieldNum << 3) | 2);
  for (const b of encodeVarint(bytes.length)) buf.push(b);
  for (const b of bytes) buf.push(b);
}

function decodeFrame(data) {
  const off = { i: 0 };
  const frame = { seqId: 0, logId: 0, service: 0, method: 0, headers: [], payloadEncoding: '', payloadType: '', payload: Buffer.alloc(0), logIdNew: '' };
  while (off.i < data.length) {
    const tag = decodeVarint(data, off);
    if (tag == null) return null;
    const fieldNum = tag >> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      const v = decodeVarint(data, off);
      if (v == null) return null;
      if (fieldNum === 1) frame.seqId = v;
      else if (fieldNum === 2) frame.logId = v;
      else if (fieldNum === 3) frame.service = v | 0;
      else if (fieldNum === 4) frame.method = v | 0;
    } else if (wireType === 2) {
      const len = decodeVarint(data, off);
      if (len == null) return null;
      const bytes = data.slice(off.i, off.i + len);
      off.i += len;
      if (fieldNum === 5) {
        // headers: repeated Header { 1:key string, 2:value string }
        const hOff = { i: 0 };
        let key = '';
        let value = '';
        while (hOff.i < bytes.length) {
          const hTag = decodeVarint(bytes, hOff);
          if (hTag == null) break;
          const hField = hTag >> 3;
          const hWire = hTag & 7;
          if (hWire === 2) {
            const hLen = decodeVarint(bytes, hOff);
            if (hLen == null) break;
            const hBytes = bytes.slice(hOff.i, hOff.i + hLen);
            hOff.i += hLen;
            if (hField === 1) key = hBytes.toString('utf8');
            else if (hField === 2) value = hBytes.toString('utf8');
          } else if (hWire === 0) {
            decodeVarint(bytes, hOff);
          } else {
            break;
          }
        }
        frame.headers.push({ key, value });
      } else if (fieldNum === 6) {
        frame.payloadEncoding = bytes.toString('utf8');
      } else if (fieldNum === 7) {
        frame.payloadType = bytes.toString('utf8');
      } else if (fieldNum === 8) {
        frame.payload = bytes;
      } else if (fieldNum === 9) {
        frame.logIdNew = bytes.toString('utf8');
      }
    } else {
      return null;
    }
  }
  return frame;
}

function encodeFrame(frame) {
  const buf = [];
  if (frame.seqId) encodeFieldVarint(buf, 1, frame.seqId);
  if (frame.logId) encodeFieldVarint(buf, 2, frame.logId);
  if (frame.service) encodeFieldVarint(buf, 3, frame.service);
  encodeFieldVarint(buf, 4, frame.method);
  for (const h of frame.headers) {
    const hb = [];
    if (h.key) encodeFieldBytes(hb, 1, Buffer.from(h.key, 'utf8'));
    if (h.value) encodeFieldBytes(hb, 2, Buffer.from(h.value, 'utf8'));
    encodeFieldBytes(buf, 5, Buffer.from(hb));
  }
  if (frame.payloadEncoding) encodeFieldBytes(buf, 6, Buffer.from(frame.payloadEncoding, 'utf8'));
  if (frame.payloadType) encodeFieldBytes(buf, 7, Buffer.from(frame.payloadType, 'utf8'));
  if (frame.payload && frame.payload.length) encodeFieldBytes(buf, 8, frame.payload);
  return Buffer.from(buf);
}

function extractServiceId(wsUrl) {
  // 对照主仓 frame.rs：WS URL query 中 service_id=<i32>
  const m = String(wsUrl || '').split('service_id=')[1];
  if (!m) return 0;
  const v = parseInt(m.split('&')[0], 10);
  return Number.isFinite(v) ? v : 0;
}

class FeishuAdapter {
  constructor(instanceConfig, hooks) {
    this.cfg = instanceConfig;
    this.hooks = hooks;
    this.accessToken = null;
    this.tokenExpireAt = 0;
    this.ws = null;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.closedByUs = false;
    this.reconnectAttempt = 0;
    this.serviceId = 0;
    this.pingIntervalSec = 90;
    this.state = {
      connectionState: 'disconnected',
      error: null,
      errorDetail: null,
      lastActivity: null,
      stats: { received: 0, sent: 0, errors: 0 },
      retryCount: 0,
    };
  }

  get platform() { return 'feishu'; }

  status() {
    return {
      platform: 'feishu',
      instanceId: this.cfg.id,
      instanceName: this.cfg.name || 'Feishu',
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
    const r = await httpJson(`${FEISHU_API}/open-apis/auth/v3/tenant_access_token/internal/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { app_id: this.cfg.appId, app_secret: this.cfg.appSecret },
    });
    const j = r.json || {};
    if (r.status !== 200 || j.code !== 0 || !j.tenant_access_token) {
      throw new Error(`获取 Tenant Token 失败: code=${j.code} msg=${j.msg} HTTP ${r.status}`);
    }
    this.accessToken = j.tenant_access_token;
    const expire = Number(j.expire) || 7200;
    this.tokenExpireAt = Date.now() / 1000 + expire - 300;
    this.hooks.log('info', `[feishu] token ok, expires in ${expire}s`);
  }

  async getWsEndpoint() {
    const r = await httpJson(`${FEISHU_API}/callback/ws/endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', locale: 'zh' },
      body: { AppID: this.cfg.appId, AppSecret: this.cfg.appSecret },
    });
    const j = r.json || {};
    if (r.status !== 200 || j.code !== 0 || !(j.data && j.data.URL)) {
      const hint = j.code === 9499
        ? '（检查：启用机器人能力 / 事件订阅改长连接 / 开通 im:message / 发布版本）'
        : '';
      throw new Error(`获取 WS 端点失败: code=${j.code} msg=${j.msg} HTTP ${r.status}${hint}`);
    }
    return { url: j.data.URL, config: j.data.ClientConfig || {} };
  }

  async connect() {
    this.closedByUs = false;
    try {
      this.setState('connecting');
      await this.ensureToken();
      const ep = await this.getWsEndpoint();
      this.serviceId = extractServiceId(ep.url);
      this.pingIntervalSec = Number(ep.config.PingInterval) || 90;
      this.setState('authenticating');
      await this.openWs(ep.url);
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
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('WebSocket 连接超时（15s）')); try { ws.close(); } catch (_) {} }
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('open', () => {
        // 初始 Ping 帧（pbbp2 Control）
        const ping = encodeFrame({ seqId: 0, logId: 0, service: this.serviceId, method: 0, headers: [{ key: 'type', value: 'ping' }], payload: Buffer.alloc(0) });
        try { ws.send(ping); } catch (e) { this.hooks.log('error', `[feishu] 初始 ping 发送失败: ${e.message}`); }
        clearTimeout(timeout);
        if (!settled) { settled = true; resolve(); }
        this.startPingLoop();
        this.setState('ready');
        this.hooks.log('info', `[feishu] connected, service_id=${this.serviceId}, ping=${this.pingIntervalSec}s`);
      });

      ws.addEventListener('message', (ev) => {
        const data = typeof ev.data === 'string' ? Buffer.from(ev.data, 'utf8') : Buffer.from(ev.data);
        const frame = decodeFrame(data);
        if (!frame) { this.hooks.log('warn', `[feishu] 无法解码帧 len=${data.length}`); return; }
        const type = (frame.headers.find((h) => h.key === 'type') || {}).value || '';
        if (frame.method === 0) {
          // Control：Pong → 更新 service_id
          if (frame.service !== 0) this.serviceId = frame.service;
          return;
        }
        // Data 帧：event
        if (type === 'event') {
          this.state.lastActivity = Date.now();
          try {
            const payload = JSON.parse(frame.payload.toString('utf8'));
            const eventType = payload.header && payload.header.event_type;
            if (eventType === 'im.message.receive_v1') {
              const msg = this.parseMessage(payload);
              if (msg) {
                this.state.stats.received += 1;
                this.hooks.onMessage(msg);
              }
            }
          } catch (e) {
            this.hooks.log('error', `[feishu] 事件解析失败: ${e.message}`);
          }
          // ACK 帧（对照 Frame::new_ack）
          const ack = encodeFrame({ seqId: frame.seqId, logId: frame.logId, service: frame.service || this.serviceId, method: frame.method, headers: [{ key: 'type', value: 'ack' }], payload: Buffer.alloc(0) });
          try { ws.send(ack); } catch (_) {}
        }
      });

      ws.addEventListener('close', (ev) => {
        this.stopPing();
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

  startPingLoop() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        const ping = encodeFrame({ seqId: 0, logId: 0, service: this.serviceId, method: 0, headers: [{ key: 'type', value: 'ping' }], payload: Buffer.alloc(0) });
        try { this.ws.send(ping); } catch (_) {}
      }
    }, Math.max(10, this.pingIntervalSec - 5) * 1000);
  }

  stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  scheduleReconnect() {
    if (this.closedByUs || this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30 * 1000);
    this.reconnectAttempt += 1;
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }

  stripAtMention(text) {
    return String(text || '').replace(/@_\w+\s*/g, '').trim();
  }

  parseMessage(payload) {
    const header = payload.header || {};
    const event = payload.event || {};
    const message = event.message || {};
    const sender = event.sender || {};
    const senderIdObj = sender.sender_id || {};
    const eventId = header.event_id;
    if (!eventId) return null;
    if (this.hooks.isDup && this.hooks.isDup(eventId)) return null;

    const chatId = message.chat_id || '';
    const conversationId = `feishu_${chatId}`;
    const senderId = senderIdObj.union_id || senderIdObj.user_id || senderIdObj.open_id || '';
    const senderName = sender.nickname || `用户#${String(senderId).slice(0, 8)}`;

    const msgType = message.message_type || 'text';
    let contentStr = message.content || '{}';
    let content;
    try {
      const cj = JSON.parse(contentStr);
      if (msgType === 'text') {
        content = { type: 'text', text: this.stripAtMention(cj.text || '') };
      } else if (msgType === 'image') {
        content = { type: 'image', url: cj.image_key || '', fileName: null, localPath: null };
      } else if (msgType === 'audio') {
        content = { type: 'audio', url: cj.file_key || cj.audio_key || '', fileName: null, transcript: null };
      } else if (msgType === 'file') {
        content = { type: 'file', name: cj.file_name || 'file', url: cj.file_key || '', size: 0 };
      } else {
        content = { type: 'text', text: `[飞书 ${msgType} 消息]` };
      }
    } catch (_) {
      content = { type: 'text', text: '' };
    }

    return {
      id: eventId,
      platform: 'feishu',
      conversationId,
      senderId: String(senderId),
      senderName: String(senderName),
      content,
      timestamp: Number(header.create_time) || Date.now(),
      platformMessageId: message.message_id || null,
    };
  }

  async send(target, content) {
    await this.ensureToken();
    const text = this.extractText(content);
    if (!text) throw new Error('飞书发送仅支持文本消息');
    let chatId = null;
    if (target.type === 'conversation') chatId = target.value.startsWith('feishu_') ? target.value.slice(7) : target.value;
    else if (target.type === 'channel') chatId = target.value;
    else throw new Error(`飞书不支持目标类型: ${target.type}`);

    const r = await httpJson(`${FEISHU_API}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
    });
    const j = r.json || {};
    if (r.status !== 200 || j.code !== 0) {
      throw new Error(`发送飞书消息失败: code=${j.code} msg=${j.msg} HTTP ${r.status}`);
    }
    this.state.stats.sent += 1;
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

  async downloadMedia(msg, saveDir) {
    const fs = require('fs');
    const path = require('path');
    const items = [];
    const collect = (c) => {
      if (!c) return;
      if (c.type === 'image') items.push({ key: c.url, typeParam: 'image', name: 'image.png' });
      else if (c.type === 'audio') items.push({ key: c.url, typeParam: 'file', name: 'audio.ogg' });
      else if (c.type === 'mixed') (c.items || []).forEach(collect);
    };
    collect(msg.content);
    const messageId = msg.platformMessageId;
    const results = [];
    if (!messageId || items.length === 0) return results;
    for (const item of items) {
      try {
        const url = `${FEISHU_API}/open-apis/im/v1/messages/${messageId}/resources/${item.key}?type=${item.typeParam}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const safe = String(item.name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const file = path.join(saveDir, `${Math.floor(Date.now() / 1000)}_${safe}`);
        fs.writeFileSync(file, buf);
        results.push({ label: item.name, localPath: file });
      } catch (e) {
        this.hooks.log('error', `[feishu] 下载媒体失败: ${e.message}`);
        results.push({ label: item.name, localPath: null });
      }
    }
    return results;
  }

  async disconnect() {
    this.closedByUs = true;
    this.stopPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(1000, 'client disconnect'); } catch (_) {}
      this.ws = null;
    }
    this.setState('disconnected');
  }
}

module.exports = { FeishuAdapter, decodeFrame, encodeFrame, extractServiceId };
