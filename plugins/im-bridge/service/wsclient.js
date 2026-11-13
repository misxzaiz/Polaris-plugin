'use strict';
/**
 * wsclient.js —— 宿主 WS 事件订阅（IM 会话事件流通道）
 *
 * 契约（金标 = 主仓 src/services/transport/httpTransport.ts + web/api/ws.rs）：
 *   - URL: ws://<host>:<port>/api/ws?token=<md5(web.token)>
 *   - 心跳: 每 30s 发 {"type":"ping"}
 *   - 订阅: {"type":"subscribe","events":["chat-event"]}
 *   - 事件帧: {"event":"chat-event","payload":{contextId, payload: AIEvent}}
 *
 * 消费语义：contextId 以 "im-bridge:" 开头的事件属于本插件会话——delta/complete/
 * error 全量回调给 ai.js 做回复聚合（对照主仓 manager.rs 的 integration:ai:delta
 * / ai:complete / ai:error 三事件语义）。断线指数退避重连（1s→30s 封顶）。
 */
const { md5 } = require('./kvclient');

const CLIENT_HEARTBEAT_MS = 30 * 1000;
const RECONNECT_MAX_MS = 30 * 1000;

function createWsClient({ kv, log, onImEvent: _onImEvent }) {
  // 回调经 handle.onImEvent 调用（允许调用方在 connect 后重新绑定）；
  // 直调构造参数仅作缺省。
  let onImEvent = _onImEvent || (() => {});
  let ws = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let closedByUs = false;
  let lastAttemptAt = 0;

  function clearTimers() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function scheduleReconnect() {
    if (closedByUs) return;
    if (typeof WebSocket === 'undefined') {
      log('warn', '当前 Node 无全局 WebSocket，终态感知降级（仅 30min 自愈兜底）');
      return;
    }
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }

  async function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return; // connecting/open
    const now = Date.now();
    if (now - lastAttemptAt < 1500) return; // 防高频重试
    lastAttemptAt = now;
    let ep;
    try { ep = await kv.refreshEndpoint(); } catch (e) { log('warn', `ws endpoint: ${e.message}`); scheduleReconnect(); return; }
    const wsBase = `ws://${ep.host}:${ep.port}`;
    const url = ep.token ? `${wsBase}/api/ws?token=${encodeURIComponent(md5(ep.token))}` : `${wsBase}/api/ws`;
    let socket;
    try { socket = new WebSocket(url); } catch (e) { log('warn', `ws 连接失败: ${e.message}`); scheduleReconnect(); return; }

    socket.addEventListener('open', () => {
      ws = socket;
      reconnectAttempt = 0;
      log('info', `ws 已连接 ${wsBase}/api/ws${ep.token ? ' (authed)' : ''}`);
      try { socket.send(JSON.stringify({ type: 'subscribe', events: ['chat-event'] })); } catch (_) { /* 忽略 */ }
      heartbeatTimer = setInterval(() => {
        try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (_) { /* 忽略 */ }
      }, CLIENT_HEARTBEAT_MS);
    });

    socket.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch (_) { return; }
      if (!msg || msg.event !== 'chat-event') return;
      // WS chat-event 帧是嵌套形状（EventBroadcaster 中继直转）：
      // {event:'chat-event', payload:{contextId, turnId?, payload: AIEvent}}——
      // AIEvent 的 type/sessionId/reason 在内层（真桥抓包实证，勿按扁平形状解析）
      const outer = msg.payload;
      if (!outer || typeof outer !== 'object') return;
      const ai = outer.payload;
      if (!ai || typeof ai.type !== 'string') return;
      const ctx = typeof outer.contextId === 'string' ? outer.contextId : '';
      if (!ctx.startsWith('im-bridge:')) return;
      const convId = ctx.slice('im-bridge:'.length);
      handle.onImEvent({ type: ai.type, conversationId: convId, payload: ai });
    });

    socket.addEventListener('error', () => { /* close 事件统一处理 */ });
    socket.addEventListener('close', () => {
      if (ws === socket) ws = null;
      clearTimers();
      scheduleReconnect();
    });
  }

  function stop() {
    closedByUs = true;
    clearTimers();
    if (ws) { try { ws.close(); } catch (_) { /* 忽略 */ } ws = null; }
  }

  const handle = {
    connect,
    stop,
    isUp: () => !!(ws && ws.readyState === 1),
    /** 运行时重绑事件回调（ai.js bindWs 用） */
    set onImEvent(fn) { onImEvent = fn; },
    get onImEvent() { return onImEvent; },
  };
  return handle;
}

module.exports = { createWsClient };
