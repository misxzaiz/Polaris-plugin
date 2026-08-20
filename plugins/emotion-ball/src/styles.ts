/**
 * Emotion Ball 插件样式
 *
 * 使用 CSS @keyframes 注入动画 + 组件样式
 * 完全自包含，不依赖外部库
 */

let injected = false

export function ensureStyles() {
  if (injected) return
  injected = true

  const style = document.createElement('style')
  style.textContent = getStyles()
  document.head.appendChild(style)
}

function getStyles() {
  return `
/* ── 动画关键帧 ────────────────────────────────────────────────────────── */

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

/* ── 面板布局 ──────────────────────────────────────────────────────────── */

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

/* ── 情绪球展示区 ──────────────────────────────────────────────────────── */

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

/* ── Tabs ────────────────────────────────────────────────────────────────── */

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

/* ── 预览 Tab ────────────────────────────────────────────────────────────── */

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

/* ── AI 对话 Tab ────────────────────────────────────────────────────────── */

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

/* ── 对话历史 ────────────────────────────────────────────────────────────── */

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

/* ── 配置 Tab ────────────────────────────────────────────────────────────── */

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
`.trim()
}