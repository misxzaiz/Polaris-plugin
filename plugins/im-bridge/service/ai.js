'use strict';
/**
 * ai.js —— AI 会话驱动（cap.ai.chat）与回复聚合
 *
 * 对照主仓 integrations/manager.rs process_ai_message 语义：
 *   - start/continue：有 aiSessionId 则 continue，否则 start；contextId 规约
 *     `im-bridge:<conversationId>`（WS 事件按此前缀回流）
 *   - 回复聚合：Thinking/Token/AssistantMessage 累积；Result 不重复累积；
 *     session_end 即完成；error 记失败
 *   - 中断：cap.ai.chat interrupt {sessionId}
 *
 * 事件回流经 wsclient（im-bridge: 前缀过滤）。
 */

const IM_CONTEXT_PREFIX = 'im-bridge:';

class AiBridge {
  /**
   * @param {import('./kvclient').KvClient} kv
   * @param {object} wsClient createWsClient 实例
   * @param {(level: string, msg: string) => void} log
   */
  constructor(kv, wsClient, log) {
    this.kv = kv;
    this.ws = wsClient;
    this.log = log;
    /** convId -> { resolve, reject, timer, text, done } */
    this.pending = new Map();
    /** convId -> Set<fn(payload)> 流式监听（面板预览用） */
    this.deltaListeners = new Map();
    const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // AI 长任务上限 10min
    this.requestTimeoutMs = REQUEST_TIMEOUT_MS;

    wsClient && this.bindWs(wsClient);
  }

  bindWs(wsClient) {
    // wsclient 的 onImEvent 回调在 createWsClient({onImEvent}) 里注入；
    // 这里用猴子补丁方式挂回调（保持与 ai-scheduler 同款构造签名）。
    this.ws.onImEvent = (ev) => this.onImEvent(ev);
  }

  /** 注册/取消流式监听 */
  onDelta(conversationId, fn) {
    if (!this.deltaListeners.has(conversationId)) this.deltaListeners.set(conversationId, new Set());
    this.deltaListeners.get(conversationId).add(fn);
    return () => { this.deltaListeners.get(conversationId)?.delete(fn); };
  }

  /** wsclient 事件入口 */
  onImEvent(ev) {
    const { type, conversationId, payload } = ev;
    const entry = this.pending.get(conversationId);
    if (type === 'token' || type === 'assistant_message' || type === 'thinking') {
      const text = payload.value || payload.content || (payload.text ?? '');
      if (entry && text) entry.text += text;
      const listeners = this.deltaListeners.get(conversationId);
      if (listeners && text) {
        for (const fn of listeners) {
          try { fn({ text, accumulated: entry ? entry.text : text }); } catch (_) {}
        }
      }
      return;
    }
    if (type === 'result') {
      // Result.output 与增量正文重复，跳过（主仓同款防翻倍）
      return;
    }
    if (type === 'session_end') {
      if (entry && !entry.done) {
        entry.done = true;
        clearTimeout(entry.timer);
        this.pending.delete(conversationId);
        entry.resolve({ text: entry.text, sessionId: payload.sessionId || entry.sessionId || null });
      }
      return;
    }
    if (type === 'error') {
      if (entry && !entry.done) {
        entry.done = true;
        clearTimeout(entry.timer);
        this.pending.delete(conversationId);
        entry.reject(new Error(payload.error || payload.message || 'AI 会话错误'));
      }
    }
  }

  /**
   * 发送用户消息并等待完整回复。
   * @param {object} convState 会话状态（含 aiSessionId/workDir/engineId/customPrompt 等）
   * @param {string} message 用户消息文本
   * @returns {Promise<{text: string, sessionId: string|null}>}
   */
  async chat(convState, message) {
    const conversationId = convState.conversationId;
    const isContinue = !!convState.aiSessionId;
    const payload = isContinue
      ? { action: 'continue', sessionId: convState.aiSessionId, message }
      : {
          action: 'start',
          message,
          options: {
            contextId: IM_CONTEXT_PREFIX + conversationId,
            engineId: convState.engineId || undefined,
            workDir: convState.workDir || undefined,
            systemPrompt: this.buildSystemPrompt(convState),
            enableMcpTools: true,
          },
        };

    const startPromise = this.kv.dispatchOk('cap.ai.chat', payload, { timeoutMs: 120000 });
    const replyPromise = this.waitReply(conversationId);
    let sessionId = null;
    try {
      const r = await startPromise;
      if (isContinue) {
        sessionId = convState.aiSessionId;
      } else {
        sessionId = typeof r === 'string' ? r : String(r || '');
        if (sessionId.trim()) convState.aiSessionId = sessionId;
      }
    } catch (e) {
      // start 失败：取消等待
      const entry = this.pending.get(conversationId);
      if (entry) { entry.done = true; clearTimeout(entry.timer); this.pending.delete(conversationId); }
      throw e;
    }
    if (isContinue) sessionId = convState.aiSessionId;
    const entry = this.pending.get(conversationId);
    if (entry) entry.sessionId = sessionId;
    const reply = await replyPromise;
    return { text: reply.text, sessionId: reply.sessionId || sessionId };
  }

  waitReply(conversationId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(conversationId)) {
          this.pending.delete(conversationId);
          reject(new Error('AI 回复超时（10min）'));
        }
      }, this.requestTimeoutMs);
      this.pending.set(conversationId, { resolve, reject, timer, text: '', done: false });
    });
  }

  buildSystemPrompt(convState) {
    const parts = [];
    if (convState.promptPresetId) {
      // 预设内容由 main.js 从 cap.prompt_snippet 解析后经 presetText 注入
      if (convState.presetText) parts.push(convState.presetText);
    }
    if (convState.customPrompt) {
      if (convState.promptMode === 'replace') return convState.customPrompt;
      parts.push(convState.customPrompt);
    }
    return parts.length ? parts.join('\n\n') : undefined;
  }

  async interrupt(convState) {
    if (!convState.aiSessionId) return false;
    try {
      await this.kv.dispatchOk('cap.ai.chat', {
        action: 'interrupt',
        sessionId: convState.aiSessionId,
      }, { timeoutMs: 15000 });
      return true;
    } catch (e) {
      this.log('warn', `interrupt 失败: ${e.message}`);
      return false;
    }
  }
}

module.exports = { AiBridge, IM_CONTEXT_PREFIX };
