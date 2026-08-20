/**
 * EmotionBall v2 面板样式
 * 自包含，跟随 Polaris CSS 变量
 */

let injected = false

export function ensurePanelStyles() {
  if (injected) return
  injected = true
  const style = document.createElement('style')
  style.id = 'emotion-ball-v2-styles'
  style.textContent = STYLES
  document.head.appendChild(style)
}

const STYLES = `
.ebv2-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

.ebv2-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ebv2-title { font-weight: 600; font-size: 14px; letter-spacing: 0.3px; }
.ebv2-header-right { display: flex; align-items: center; gap: 6px; }
.ebv2-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #71717a;
}
.ebv2-status-dot.dot-idle { background: #71717a; }
.ebv2-status-dot.dot-active { background: #3b82f6; animation: ebv2-pulse 1.2s ease-in-out infinite; }
.ebv2-status-dot.dot-error { background: #ef4444; }
.ebv2-status-text { font-size: 11px; color: var(--text-muted, #a1a1aa); }

@keyframes ebv2-pulse {
  0%,100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.ebv2-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 0 10px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ebv2-stage-info { text-align: center; max-width: 240px; }
.ebv2-stage-name { font-size: 13px; font-weight: 600; color: var(--text-primary, #e4e4e7); }
.ebv2-stage-desc { font-size: 11px; color: var(--text-muted, #a1a1aa); line-height: 1.4; margin-top: 2px; }
.ebv2-shape-switch {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.ebv2-shape-btn {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: transparent;
  color: var(--text-muted, #a1a1aa);
  cursor: pointer;
}
.ebv2-shape-btn.active {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.1);
  color: #60a5fa;
}

.ebv2-tabs {
  display: flex;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ebv2-tab-btn {
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
}
.ebv2-tab-btn:hover { color: var(--text-primary, #e4e4e7); background: var(--background-hover, rgba(255,255,255,0.03)); }
.ebv2-tab-btn.active { color: #60a5fa; border-bottom-color: #60a5fa; }

.ebv2-tab-content { flex: 1; overflow-y: auto; padding: 10px; }

/* 画廊 */
.ebv2-gallery { display: flex; flex-direction: column; gap: 12px; }
.ebv2-gallery-group-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600;
  color: var(--text-secondary, #a1a1aa);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ebv2-group-dot { width: 6px; height: 6px; border-radius: 50%; }
.ebv2-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
}
.ebv2-gallery-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  background: var(--background-elevated, rgba(255,255,255,0.03));
  cursor: pointer;
  transition: all 0.15s ease;
}
.ebv2-gallery-card:hover {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.06);
  transform: translateY(-1px);
}
.ebv2-card-id { font-size: 9px; color: var(--text-muted, #71717a); font-family: monospace; }
.ebv2-card-name { font-size: 10px; color: var(--text-secondary, #a1a1aa); text-align: center; }

/* 对话 */
.ebv2-chat { display: flex; flex-direction: column; height: 100%; gap: 8px; }
.ebv2-chat-msgs {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 80px; max-height: 320px;
}
.ebv2-chat-msg {
  padding: 6px 10px; border-radius: 8px;
  font-size: 12px; line-height: 1.5;
}
.ebv2-chat-msg.user {
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.12);
  align-self: flex-end; max-width: 85%;
}
.ebv2-chat-msg.assistant {
  background: var(--background-elevated, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  align-self: flex-start; max-width: 85%;
}
.ebv2-chat-msg.streaming { border-color: rgba(6,182,212,0.3); }
.ebv2-chat-role { font-size: 10px; font-weight: 600; color: var(--text-muted, #a1a1aa); margin-bottom: 2px; }
.ebv2-chat-content { word-break: break-word; white-space: pre-wrap; }
.ebv2-chat-empty {
  text-align: center; color: var(--text-muted, #a1a1aa);
  font-size: 12px; padding: 20px; font-style: italic;
}
.ebv2-chat-error {
  padding: 6px 10px; font-size: 11px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 6px; color: #f87171;
}
.ebv2-chat-input-row { display: flex; gap: 6px; align-items: flex-end; }
.ebv2-chat-input {
  flex: 1; padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px; font-family: inherit;
  resize: vertical; min-height: 36px; max-height: 80px;
}
.ebv2-chat-input:focus { outline: none; border-color: rgba(59,130,246,0.4); }
.ebv2-chat-input:disabled { opacity: 0.5; }
.ebv2-chat-actions { display: flex; gap: 4px; }
.ebv2-btn {
  padding: 6px 14px; border-radius: 6px; border: none;
  font-size: 12px; font-weight: 500; cursor: pointer;
  white-space: nowrap; transition: all 0.15s;
}
.ebv2-btn.send { background: #3b82f6; color: white; }
.ebv2-btn.send:hover { background: #2563eb; }
.ebv2-btn.send:disabled { opacity: 0.4; cursor: not-allowed; }
.ebv2-btn.stop { background: #ef4444; color: white; }
.ebv2-btn.stop:hover { background: #dc2626; }
.ebv2-btn-ghost {
  padding: 4px 8px; border-radius: 4px; border: none;
  background: transparent; color: var(--text-muted, #a1a1aa);
  font-size: 11px; cursor: pointer;
}
.ebv2-btn-ghost:hover { background: var(--background-hover, rgba(255,255,255,0.05)); color: var(--text-primary, #e4e4e7); }
.ebv2-chat-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 6px; border-top: 1px solid var(--border, rgba(255,255,255,0.06));
}
.ebv2-checkbox { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted, #a1a1aa); cursor: pointer; }
.ebv2-checkbox input { accent-color: #3b82f6; }

/* 配置 */
.ebv2-config { display: flex; flex-direction: column; gap: 12px; }
.ebv2-config-field { display: flex; flex-direction: column; gap: 4px; }
.ebv2-config-label { font-size: 11px; font-weight: 500; color: var(--text-secondary, #a1a1aa); }
.ebv2-config-input {
  padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px; font-family: monospace;
}
.ebv2-config-input:focus { outline: none; border-color: rgba(59,130,246,0.4); }
.ebv2-config-hint { font-size: 11px; color: var(--text-muted, #a1a1aa); line-height: 1.4; }
.ebv2-config-presets { padding-top: 8px; border-top: 1px solid var(--border, rgba(255,255,255,0.06)); }
.ebv2-config-preset-title { font-size: 11px; font-weight: 500; color: var(--text-secondary, #a1a1aa); margin-bottom: 6px; }
.ebv2-config-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ebv2-preset-btn {
  padding: 6px 8px; border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--background-elevated, rgba(255,255,255,0.03));
  color: var(--text-secondary, #a1a1aa);
  font-size: 11px; cursor: pointer;
}
.ebv2-preset-btn:hover { border-color: rgba(59,130,246,0.3); color: var(--text-primary, #e4e4e7); }
.ebv2-preset-btn.active { border-color: #60a5fa; background: rgba(59,130,246,0.08); color: #60a5fa; }
`
