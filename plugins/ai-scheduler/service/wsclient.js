'use strict';
/**
 * wsclient.js —— 宿主 WS 事件订阅（终态感知通道）
 *
 * 契约（金标 = 主仓 src/services/transport/httpTransport.ts + web/api/ws.rs）：
 *   - URL: ws://<host>:<port>/api/ws?token=<md5(web.token)>
 *   - 心跳: 每 30s 发 {"type":"ping"}
 *   - 订阅: {"type":"subscribe","events":["chat-event"]}
 *   - 事件帧: {"event":"chat-event","payload":{AIEvent}}
 *     AIEvent serde tag="type" snake_case：{"type":"session_end"|"error",...}
 *
 * 消费语义（金标 schedulerStore.runTask 订阅回调）：contextId 以 scheduler- 开头的
 * session_end → Success；error → Failed。断线指数退避重连（1s→30s 封顶）。
 *
 * Node ≥ 22 自带全局 WebSocket；不可用时如实降级（无终态感知，Running 卡死
 * 由 30min 自愈兜底），服务主体功能不受影响。
 */
const { md5 } = require('./kvclient');

const CLIENT_HEARTBEAT_MS = 30 * 1000;
const RECONNECT_MAX_MS = 30 * 1000;

function createWsClient({ kv, log, onSchedulerEvent }) {
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
    try { ep = await kv.getEndpoint(); } catch (e) { log('warn', `ws endpoint: ${e.message}`); scheduleReconnect(); return; }
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
      const payload = msg.payload;
      if (!payload || typeof payload.type !== 'string') return;
      const ctx = typeof payload.contextId === 'string' ? payload.contextId : '';
      if (!ctx.startsWith('scheduler-')) return;
      const taskId = ctx.slice('scheduler-'.length);
      if (payload.type === 'session_end') {
        onSchedulerEvent({ kind: 'session_end', taskId, payload });
      } else if (payload.type === 'error') {
        onSchedulerEvent({ kind: 'error', taskId, payload });
      }
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

  return { connect, stop, isUp: () => !!(ws && ws.readyState === 1) };
}

module.exports = { createWsClient };
