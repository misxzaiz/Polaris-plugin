// src/Panel.tsx
import { createElement as h2, useCallback, useEffect, useRef, useState } from "react";

// src/EmotionBall.tsx
import { createElement as h, memo } from "react";
var EMOTION_CONFIG = {
  idle: {
    primary: "#3b82f6",
    secondary: "#60a5fa",
    accent: "rgba(59,130,246,0.3)",
    glow: "rgba(59,130,246,0.15)",
    anim: "eb-pulse",
    label: "Idle"
  },
  thinking: {
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    accent: "rgba(139,92,246,0.3)",
    glow: "rgba(139,92,246,0.15)",
    anim: "eb-spin",
    label: "Thinking"
  },
  streaming: {
    primary: "#06b6d4",
    secondary: "#22d3ee",
    accent: "rgba(6,182,212,0.3)",
    glow: "rgba(6,182,212,0.15)",
    anim: "eb-wave",
    label: "Streaming"
  },
  happy: {
    primary: "#f59e0b",
    secondary: "#fbbf24",
    accent: "rgba(245,158,11,0.3)",
    glow: "rgba(245,158,11,0.15)",
    anim: "eb-bounce",
    label: "Happy"
  },
  sad: {
    primary: "#64748b",
    secondary: "#94a3b8",
    accent: "rgba(100,116,139,0.3)",
    glow: "rgba(100,116,139,0.1)",
    anim: "eb-sigh",
    label: "Sad"
  },
  excited: {
    primary: "#ec4899",
    secondary: "#f472b6",
    accent: "rgba(236,72,153,0.3)",
    glow: "rgba(236,72,153,0.15)",
    anim: "eb-excite",
    label: "Excited"
  },
  error: {
    primary: "#ef4444",
    secondary: "#f87171",
    accent: "rgba(239,68,68,0.3)",
    glow: "rgba(239,68,68,0.15)",
    anim: "eb-flash",
    label: "Error"
  },
  listening: {
    primary: "#22c55e",
    secondary: "#4ade80",
    accent: "rgba(34,197,94,0.3)",
    glow: "rgba(34,197,94,0.15)",
    anim: "eb-listen",
    label: "Listening"
  }
};
var EmotionBall = memo(function EmotionBall2({
  emotion,
  size = 48,
  compact = false
}) {
  const cfg = EMOTION_CONFIG[emotion];
  const s = compact ? Math.max(size * 0.6, 24) : size;
  const innerSize = s * 0.45;
  const innerOffset = (s - innerSize) / 2;
  return h(
    "div",
    {
      className: "eb-root",
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        minHeight: compact ? s + 16 : s + 24
      }
    },
    // 球体容器
    h(
      "div",
      {
        style: {
          position: "relative",
          width: s,
          height: s,
          flexShrink: 0
        },
        "data-emotion": emotion
      },
      // 辉光
      h("div", {
        style: {
          position: "absolute",
          inset: -s * 0.15,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)`,
          animation: `${cfg.anim} 2s ease-in-out infinite`,
          willChange: "transform, opacity"
        }
      }),
      // 外圈（主色）
      h("div", {
        style: {
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `${Math.max(2, s * 0.06)}px solid ${cfg.primary}`,
          boxShadow: `0 0 ${s * 0.15}px ${cfg.glow}, inset 0 0 ${s * 0.1}px ${cfg.glow}`,
          animation: `${cfg.anim} 2s ease-in-out infinite`,
          willChange: "transform"
        }
      }),
      // 渐变弧（secondary）
      h("div", {
        style: {
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `${Math.max(2, s * 0.06)}px solid transparent`,
          borderTopColor: cfg.secondary,
          borderRightColor: cfg.accent,
          animation: `${emotion === "thinking" || emotion === "excited" ? "eb-spin" : "eb-drift"} 1.5s ${emotion === "excited" ? "linear" : "ease-in-out"} infinite`,
          willChange: "transform"
        }
      }),
      // 内圈
      h("div", {
        style: {
          position: "absolute",
          top: innerOffset,
          left: innerOffset,
          width: innerSize,
          height: innerSize,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 35%, ${cfg.secondary} 0%, ${cfg.primary} 100%)`,
          opacity: 0.8,
          animation: `${cfg.anim} 2s ease-in-out infinite`,
          willChange: "transform, opacity"
        }
      }),
      // 中心亮点
      h("div", {
        style: {
          position: "absolute",
          top: "50%",
          left: "50%",
          width: s * 0.12,
          height: s * 0.12,
          marginTop: -s * 0.06,
          marginLeft: -s * 0.06,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.4)",
          animation: "eb-glow 1.5s ease-in-out infinite",
          willChange: "transform, opacity"
        }
      })
    )
  );
});

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/react.mjs
import React from "react";
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    React.useCallback(() => selector(api.getInitialState()), [api, selector])
  );
  React.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// src/aiChatStore.ts
var DEFAULT_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini"
};
var useAiChatStore = create((set) => ({
  aiConfig: { ...DEFAULT_CONFIG },
  setAiConfig: (patch) => set((s) => ({ aiConfig: { ...s.aiConfig, ...patch } })),
  messages: [
    {
      role: "system",
      content: "\u4F60\u662F Emotion Ball \u6D4B\u8BD5\u52A9\u624B\u3002\u8BF7\u5C3D\u91CF\u7B80\u77ED\u56DE\u590D\uFF081-2\u53E5\u8BDD\uFF09\u3002\u540C\u65F6\u6839\u636E\u4F60\u56DE\u590D\u5185\u5BB9\u7684\u60C5\u7EEA\uFF0C\u5728\u56DE\u590D\u672B\u5C3E\u7528\u4E00\u884C `[emotion:xxx]` \u6807\u8BB0\u60C5\u7EEA\uFF0C\u53EF\u9009\u503C\uFF1Ahappy/sad/excited/thinking/streaming/idle\u3002\u4F8B\u5982\uFF1A\n```\n\u597D\u7684\uFF0C\u6211\u5E2E\u4F60\u770B\u770B\uFF01\n[emotion:happy]\n```"
    }
  ],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({
    messages: [
      {
        role: "system",
        content: "\u4F60\u662F Emotion Ball \u6D4B\u8BD5\u52A9\u624B\u3002\u8BF7\u5C3D\u91CF\u7B80\u77ED\u56DE\u590D\uFF081-2\u53E5\u8BDD\uFF09\u3002\u540C\u65F6\u6839\u636E\u4F60\u56DE\u590D\u5185\u5BB9\u7684\u60C5\u7EEA\uFF0C\u5728\u56DE\u590D\u672B\u5C3E\u7528\u4E00\u884C `[emotion:xxx]` \u6807\u8BB0\u60C5\u7EEA\uFF0C\u53EF\u9009\u503C\uFF1Ahappy/sad/excited/thinking/streaming/idle\u3002\u4F8B\u5982\uFF1A\n```\n\u597D\u7684\uFF0C\u6211\u5E2E\u4F60\u770B\u770B\uFF01\n[emotion:happy]\n```"
      }
    ]
  }),
  aiStatus: "idle",
  aiError: null,
  setAiStatus: (status) => set({ aiStatus: status }),
  setAiError: (error) => set({ aiError: error }),
  emotion: "idle",
  setEmotion: (emotion) => set({ emotion }),
  streamText: "",
  setStreamText: (text) => set({ streamText: text }),
  appendStreamText: (text) => set((s) => ({ streamText: s.streamText + text })),
  autoEmotion: true,
  setAutoEmotion: (on) => set({ autoEmotion: on }),
  showHistory: false,
  setShowHistory: (show) => set({ showHistory: show })
}));
function parseEmotionFromText(text) {
  const match = text.match(/\[emotion:(\w+)\]/);
  if (!match) return null;
  const emotion = match[1];
  const valid = ["idle", "thinking", "streaming", "happy", "sad", "excited", "error", "listening"];
  return valid.includes(emotion) ? emotion : null;
}
function stripEmotionTag(text) {
  return text.replace(/\n?\[emotion:\w+\]/g, "").trim();
}
async function sendChatMessage(config, messages, onChunk, signal) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: config.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${errText}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          onChunk(content);
        }
      } catch {
      }
    }
  }
  return fullText;
}

// src/styles.ts
var injected = false;
function ensureStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = getStyles();
  document.head.appendChild(style);
}
function getStyles() {
  return `
/* \u2500\u2500 \u52A8\u753B\u5173\u952E\u5E27 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

@keyframes eb-pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
}

@keyframes eb-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes eb-wave {
  0%, 100% { transform: scale(1) rotate(0deg); }
  25% { transform: scale(1.08) rotate(5deg); }
  50% { transform: scale(1) rotate(0deg); }
  75% { transform: scale(1.08) rotate(-5deg); }
}

@keyframes eb-bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  25% { transform: translateY(-8%) scale(1.05); }
  50% { transform: translateY(0) scale(1); }
  75% { transform: translateY(-4%) scale(1.02); }
}

@keyframes eb-sigh {
  0%, 100% { transform: scale(1) translateY(0); opacity: 0.6; }
  50% { transform: scale(0.95) translateY(3%); opacity: 0.8; }
}

@keyframes eb-excite {
  0% { transform: scale(1) rotate(0deg); }
  20% { transform: scale(1.1) rotate(10deg); }
  40% { transform: scale(1.05) rotate(-10deg); }
  60% { transform: scale(1.12) rotate(5deg); }
  80% { transform: scale(1.08) rotate(-5deg); }
  100% { transform: scale(1) rotate(0deg); }
}

@keyframes eb-flash {
  0%, 100% { opacity: 1; }
  25% { opacity: 0.3; }
  50% { opacity: 1; }
  75% { opacity: 0.3; }
}

@keyframes eb-listen {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
  50% { transform: scale(1.03); box-shadow: 0 0 0 8px rgba(34,197,94,0); }
}

@keyframes eb-drift {
  0% { transform: rotate(0deg); }
  50% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
}

@keyframes eb-glow {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

/* \u2500\u2500 \u9762\u677F\u5E03\u5C40 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

.eb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}

.eb-title {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.3px;
}

.eb-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--background-hover, rgba(255,255,255,0.05));
  color: var(--text-muted, #a1a1aa);
}

.eb-badge-active {
  background: rgba(59,130,246,0.15);
  color: #60a5fa;
}

.eb-badge-error {
  background: rgba(239,68,68,0.15);
  color: #f87171;
}

/* \u2500\u2500 \u60C5\u7EEA\u7403\u5C55\u793A\u533A \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-ball-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}

.eb-ball-container {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.eb-ball-label {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #a1a1aa);
}

/* \u2500\u2500 Tabs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-tabs {
  display: flex;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}

.eb-tab-btn {
  flex: 1;
  padding: 8px 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-muted, #a1a1aa);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
}

.eb-tab-btn:hover {
  color: var(--text-primary, #e4e4e7);
  background: var(--background-hover, rgba(255,255,255,0.03));
}

.eb-tab-btn-active {
  color: #60a5fa;
  border-bottom-color: #60a5fa;
}

.eb-tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* \u2500\u2500 \u9884\u89C8 Tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-preview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.eb-preview-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  background: var(--background-elevated, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  cursor: pointer;
  transition: all 0.15s ease;
}

.eb-preview-btn:hover {
  background: var(--background-hover, rgba(255,255,255,0.06));
  border-color: var(--border, rgba(255,255,255,0.12));
}

.eb-preview-btn-active {
  border-color: #60a5fa;
  background: rgba(59,130,246,0.08);
  box-shadow: 0 0 8px rgba(59,130,246,0.15);
}

.eb-preview-label {
  font-size: 11px;
  color: var(--text-secondary, #a1a1aa);
  text-align: center;
}

/* \u2500\u2500 AI \u5BF9\u8BDD Tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-chat-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}

.eb-chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 80px;
  max-height: 400px;
}

.eb-chat-msg {
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.eb-chat-msg-user {
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.12);
  align-self: flex-end;
  max-width: 85%;
}

.eb-chat-msg-assistant {
  background: var(--background-elevated, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  align-self: flex-start;
  max-width: 85%;
}

.eb-chat-msg-streaming {
  border-color: rgba(6,182,212,0.3);
}

.eb-chat-role {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted, #a1a1aa);
  margin-bottom: 2px;
}

.eb-chat-content {
  word-break: break-word;
  white-space: pre-wrap;
}

.eb-chat-empty {
  text-align: center;
  color: var(--text-muted, #a1a1aa);
  font-size: 12px;
  padding: 24px;
  font-style: italic;
}

.eb-chat-error {
  padding: 6px 10px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 6px;
  color: #f87171;
  font-size: 11px;
}

.eb-chat-input-row {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.eb-chat-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  min-height: 36px;
  max-height: 80px;
}

.eb-chat-input:focus {
  outline: none;
  border-color: rgba(59,130,246,0.4);
}

.eb-chat-input:disabled {
  opacity: 0.5;
}

.eb-chat-actions {
  display: flex;
  gap: 4px;
}

.eb-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.eb-btn-send {
  background: #3b82f6;
  color: white;
}

.eb-btn-send:hover {
  background: #2563eb;
}

.eb-btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.eb-btn-stop {
  background: #ef4444;
  color: white;
}

.eb-btn-stop:hover {
  background: #dc2626;
}

.eb-btn-ghost {
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted, #a1a1aa);
  font-size: 11px;
  cursor: pointer;
}

.eb-btn-ghost:hover {
  background: var(--background-hover, rgba(255,255,255,0.05));
  color: var(--text-primary, #e4e4e7);
}

.eb-chat-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.06));
}

.eb-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  cursor: pointer;
}

.eb-checkbox input {
  accent-color: #3b82f6;
}

/* \u2500\u2500 \u5BF9\u8BDD\u5386\u53F2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-chat-history {
  margin-top: 8px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  background: var(--background-elevated, rgba(255,255,255,0.02));
  max-height: 200px;
  overflow-y: auto;
}

.eb-chat-history-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #a1a1aa);
  margin-bottom: 6px;
}

.eb-history-item {
  font-size: 11px;
  padding: 2px 0;
  color: var(--text-secondary, #a1a1aa);
  display: flex;
  gap: 6px;
}

.eb-history-system {
  opacity: 0.5;
  font-style: italic;
}

.eb-history-role {
  font-weight: 600;
  color: var(--text-muted, #a1a1aa);
  flex-shrink: 0;
}

.eb-history-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u2500\u2500 \u914D\u7F6E Tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.eb-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.eb-config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eb-config-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #a1a1aa);
}

.eb-config-input {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  font-family: monospace;
}

.eb-config-input:focus {
  outline: none;
  border-color: rgba(59,130,246,0.4);
}

.eb-config-hint {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  line-height: 1.4;
}

.eb-config-presets {
  padding-top: 8px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.06));
}

.eb-config-preset-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #a1a1aa);
  margin-bottom: 6px;
}

.eb-config-preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.eb-preset-btn {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--background-elevated, rgba(255,255,255,0.03));
  color: var(--text-secondary, #a1a1aa);
  font-size: 11px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;
}

.eb-preset-btn:hover {
  border-color: rgba(59,130,246,0.3);
  color: var(--text-primary, #e4e4e7);
}

.eb-preset-btn-active {
  border-color: #60a5fa;
  background: rgba(59,130,246,0.08);
  color: #60a5fa;
}

.eb-config-status {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  padding-top: 4px;
}

.eb-status-ok {
  color: #22c55e;
}

.eb-status-error {
  color: #f87171;
}
`.trim();
}

// src/Panel.tsx
ensureStyles();
var EMOTION_OPTIONS = [
  "idle",
  "thinking",
  "streaming",
  "happy",
  "sad",
  "excited",
  "error",
  "listening"
];
var EMOTION_LABELS = {
  idle: "Idle \u7A7A\u95F2",
  thinking: "Thinking \u601D\u8003",
  streaming: "Streaming \u8F93\u51FA",
  happy: "Happy \u5F00\u5FC3",
  sad: "Sad \u5FE7\u4F24",
  excited: "Excited \u5174\u594B",
  error: "Error \u9519\u8BEF",
  listening: "Listening \u8046\u542C"
};
function EmotionBallPanel() {
  const {
    aiConfig,
    setAiConfig,
    messages,
    addMessage,
    clearMessages,
    aiStatus,
    aiError,
    setAiStatus,
    setAiError,
    emotion,
    setEmotion,
    streamText,
    setStreamText,
    appendStreamText,
    autoEmotion,
    setAutoEmotion,
    showHistory,
    setShowHistory
  } = useAiChatStore();
  const [input, setInput] = useState("");
  const [tab, setTab] = useState("preview");
  const [selectedEmotion, setSelectedEmotion] = useState("idle");
  const abortRef = useRef(null);
  const chatEndRef = useRef(null);
  const streamTextRef = useRef("");
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);
  const handleManualEmotion = useCallback((e) => {
    setSelectedEmotion(e);
    setEmotion(e);
  }, [setEmotion, setSelectedEmotion]);
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || aiStatus === "connecting" || aiStatus === "streaming") return;
    if (!aiConfig.apiKey) {
      setAiError("\u8BF7\u5148\u914D\u7F6E API Key");
      setTab("config");
      return;
    }
    setInput("");
    setStreamText("");
    streamTextRef.current = "";
    const userMsg = { role: "user", content: text };
    addMessage(userMsg);
    setAiStatus("connecting");
    setAiError(null);
    if (autoEmotion) setEmotion("thinking");
    const abortController = new AbortController();
    abortRef.current = abortController;
    try {
      const fullText = await sendChatMessage(
        aiConfig,
        [...messages, userMsg],
        (chunk) => {
          if (streamTextRef.current === "") {
            setAiStatus("streaming");
            if (autoEmotion) setEmotion("streaming");
          }
          streamTextRef.current += chunk;
          appendStreamText(chunk);
        },
        abortController.signal
      );
      const cleanText = stripEmotionTag(fullText);
      const detectedEmotion = autoEmotion ? parseEmotionFromText(fullText) || "happy" : emotion;
      addMessage({ role: "assistant", content: cleanText || "(empty response)" });
      setAiStatus("idle");
      if (autoEmotion) setEmotion(detectedEmotion);
      setStreamText("");
      streamTextRef.current = "";
    } catch (err) {
      if (err.name === "AbortError") {
        setAiStatus("idle");
        if (autoEmotion) setEmotion("idle");
        return;
      }
      setAiError(err.message || "Unknown error");
      setAiStatus("error");
      if (autoEmotion) setEmotion("error");
    }
  }, [input, aiStatus, aiConfig, messages, addMessage, setStreamText, appendStreamText, setAiStatus, setAiError, autoEmotion, emotion, setEmotion]);
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiStatus("idle");
    if (autoEmotion) setEmotion("idle");
  }, [setAiStatus, setEmotion, autoEmotion]);
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);
  return h2(
    "div",
    { className: "eb-panel" },
    // ===== Header =====
    h2(
      "div",
      { className: "eb-header" },
      h2("span", { className: "eb-title" }, "Emotion Ball"),
      h2("span", {
        className: `eb-badge ${aiStatus === "error" ? "eb-badge-error" : aiStatus === "streaming" || aiStatus === "connecting" ? "eb-badge-active" : ""}`
      }, aiStatus === "idle" ? "Idle" : aiStatus === "connecting" ? "\u8FDE\u63A5\u4E2D..." : aiStatus === "streaming" ? "\u8F93\u51FA\u4E2D" : "Error")
    ),
    // ===== Emotion Ball 展示区 =====
    h2(
      "div",
      { className: "eb-ball-area" },
      h2(
        "div",
        { className: "eb-ball-container" },
        h2(EmotionBall, { emotion, size: 80, compact: false })
      ),
      h2("div", { className: "eb-ball-label" }, EMOTION_LABELS[emotion])
    ),
    // ===== Tabs =====
    h2(
      "div",
      { className: "eb-tabs" },
      h2(TabBtn, { active: tab === "preview", onClick: () => setTab("preview") }, "\u9884\u89C8"),
      h2(TabBtn, { active: tab === "chat", onClick: () => setTab("chat") }, "AI \u5BF9\u8BDD"),
      h2(TabBtn, { active: tab === "config", onClick: () => setTab("config") }, "\u914D\u7F6E")
    ),
    // ===== Tab 内容 =====
    h2(
      "div",
      { className: "eb-tab-content" },
      // ── 预览 Tab ──
      tab === "preview" && h2(
        "div",
        { className: "eb-preview-grid" },
        EMOTION_OPTIONS.map(
          (e) => h2(
            "button",
            {
              key: e,
              className: `eb-preview-btn ${emotion === e ? "eb-preview-btn-active" : ""}`,
              onClick: () => handleManualEmotion(e)
            },
            h2(EmotionBall, { emotion: e, size: 32, compact: true }),
            h2("span", { className: "eb-preview-label" }, EMOTION_LABELS[e])
          )
        )
      ),
      // ── AI 对话 Tab ──
      tab === "chat" && h2(
        "div",
        { className: "eb-chat-area" },
        // 对话消息列表
        h2(
          "div",
          { className: "eb-chat-messages" },
          messages.slice(1).map(
            (msg, i) => h2(
              "div",
              {
                key: i,
                className: `eb-chat-msg ${msg.role === "user" ? "eb-chat-msg-user" : "eb-chat-msg-assistant"}`
              },
              h2("div", { className: "eb-chat-role" }, msg.role === "user" ? "You" : "AI"),
              h2("div", { className: "eb-chat-content" }, msg.content)
            )
          ),
          // 流式输出中
          streamText && h2(
            "div",
            { className: "eb-chat-msg eb-chat-msg-assistant eb-chat-msg-streaming" },
            h2("div", { className: "eb-chat-role" }, "AI"),
            h2("div", { className: "eb-chat-content" }, streamText)
          ),
          // 空状态
          messages.length <= 1 && !streamText && h2(
            "div",
            { className: "eb-chat-empty" },
            "\u53D1\u9001\u4E00\u6761\u6D88\u606F\uFF0CAI \u56DE\u590D\u65F6\u4F1A\u81EA\u52A8\u5207\u6362\u60C5\u7EEA\u7403"
          ),
          h2("div", { ref: chatEndRef })
        ),
        // 错误提示
        aiError && h2("div", { className: "eb-chat-error" }, aiError),
        // 输入区
        h2(
          "div",
          { className: "eb-chat-input-row" },
          h2("textarea", {
            className: "eb-chat-input",
            value: input,
            onChange: (e) => setInput(e.target.value),
            onKeyDown: handleKeyDown,
            placeholder: "\u8F93\u5165\u6D88\u606F...",
            rows: 2,
            disabled: aiStatus === "connecting" || aiStatus === "streaming"
          }),
          h2(
            "div",
            { className: "eb-chat-actions" },
            aiStatus === "connecting" || aiStatus === "streaming" ? h2("button", { className: "eb-btn eb-btn-stop", onClick: handleStop }, "\u505C\u6B62") : h2("button", {
              className: "eb-btn eb-btn-send",
              onClick: handleSend,
              disabled: !input.trim()
            }, "\u53D1\u9001")
          )
        ),
        // 自动情绪开关
        h2(
          "div",
          { className: "eb-chat-footer" },
          h2(
            "label",
            { className: "eb-checkbox" },
            h2("input", {
              type: "checkbox",
              checked: autoEmotion,
              onChange: (e) => setAutoEmotion(e.target.checked)
            }),
            h2("span", null, "\u81EA\u52A8\u60C5\u7EEA\uFF08AI \u56DE\u590D\u4E2D\u89E3\u6790 [emotion:xxx] \u6807\u8BB0\uFF09")
          ),
          h2("button", {
            className: "eb-btn-ghost",
            onClick: () => setShowHistory(!showHistory)
          }, showHistory ? "\u9690\u85CF\u5386\u53F2" : "\u663E\u793A\u5386\u53F2")
        ),
        // 对话历史
        showHistory && h2(
          "div",
          { className: "eb-chat-history" },
          h2("div", { className: "eb-chat-history-title" }, "\u5BF9\u8BDD\u5386\u53F2"),
          messages.map(
            (msg, i) => h2(
              "div",
              { key: i, className: `eb-history-item ${msg.role === "system" ? "eb-history-system" : ""}` },
              h2("span", { className: "eb-history-role" }, `[${msg.role}]`),
              h2("span", { className: "eb-history-text" }, msg.content.slice(0, 80) + (msg.content.length > 80 ? "..." : ""))
            )
          ),
          h2("button", {
            className: "eb-btn-ghost",
            onClick: () => {
              clearMessages();
              setShowHistory(false);
            },
            style: { color: "var(--eb-error, #ef4444)", marginTop: 8 }
          }, "\u6E05\u7A7A\u5BF9\u8BDD")
        )
      ),
      // ── 配置 Tab ──
      tab === "config" && h2(
        "div",
        { className: "eb-config" },
        h2(
          "div",
          { className: "eb-config-field" },
          h2("label", { className: "eb-config-label" }, "API \u7AEF\u70B9"),
          h2("input", {
            className: "eb-config-input",
            value: aiConfig.baseUrl,
            onChange: (e) => setAiConfig({ baseUrl: e.target.value }),
            placeholder: "https://api.openai.com/v1"
          })
        ),
        h2(
          "div",
          { className: "eb-config-field" },
          h2("label", { className: "eb-config-label" }, "API Key"),
          h2("input", {
            className: "eb-config-input",
            type: "password",
            value: aiConfig.apiKey,
            onChange: (e) => setAiConfig({ apiKey: e.target.value }),
            placeholder: "sk-..."
          })
        ),
        h2(
          "div",
          { className: "eb-config-field" },
          h2("label", { className: "eb-config-label" }, "\u6A21\u578B"),
          h2("input", {
            className: "eb-config-input",
            value: aiConfig.model,
            onChange: (e) => setAiConfig({ model: e.target.value }),
            placeholder: "gpt-4o-mini"
          })
        ),
        h2(
          "div",
          { className: "eb-config-hint" },
          "\u652F\u6301\u4EFB\u4F55 OpenAI \u517C\u5BB9 API\uFF08DeepSeek / Groq / \u672C\u5730 ollama / \u4E2D\u8F6C\u7AD9\u7B49\uFF09"
        ),
        // 快速选择
        h2(
          "div",
          { className: "eb-config-presets" },
          h2("div", { className: "eb-config-preset-title" }, "\u5FEB\u901F\u9009\u62E9"),
          h2(
            "div",
            { className: "eb-config-preset-grid" },
            h2(PresetBtn, {
              label: "OpenAI",
              config: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
              current: aiConfig,
              onSelect: setAiConfig
            }),
            h2(PresetBtn, {
              label: "DeepSeek",
              config: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
              current: aiConfig,
              onSelect: setAiConfig
            }),
            h2(PresetBtn, {
              label: "Groq",
              config: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
              current: aiConfig,
              onSelect: setAiConfig
            }),
            h2(PresetBtn, {
              label: "Ollama",
              config: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
              current: aiConfig,
              onSelect: setAiConfig
            })
          )
        ),
        h2(
          "div",
          { className: "eb-config-status" },
          h2("span", null, "\u72B6\u6001: "),
          h2("span", {
            className: aiStatus === "error" ? "eb-status-error" : aiStatus === "streaming" ? "eb-status-ok" : ""
          }, aiStatus === "idle" ? "\u672A\u8FDE\u63A5" : aiStatus === "connecting" ? "\u8FDE\u63A5\u4E2D..." : aiStatus === "streaming" ? "\u5DF2\u8FDE\u63A5" : aiError || "\u9519\u8BEF")
        )
      )
    )
  );
}
function TabBtn({ active, onClick, children }) {
  return h2("button", {
    className: `eb-tab-btn ${active ? "eb-tab-btn-active" : ""}`,
    onClick
  }, children);
}
function PresetBtn({
  label,
  config,
  current,
  onSelect
}) {
  const isActive = current.baseUrl === config.baseUrl && current.model === config.model;
  return h2("button", {
    className: `eb-preset-btn ${isActive ? "eb-preset-btn-active" : ""}`,
    onClick: () => onSelect(config)
  }, label);
}
export {
  EmotionBallPanel as default
};
