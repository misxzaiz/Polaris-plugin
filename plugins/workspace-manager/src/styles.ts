/**
 * workspace-manager 面板样式
 * 自包含,跟随 Polaris CSS 变量(与 emotion-ball 同范式)
 */

let injected = false

export function ensurePanelStyles() {
  if (injected) return
  injected = true
  const style = document.createElement('style')
  style.id = 'workspace-manager-styles'
  style.textContent = STYLES
  document.head.appendChild(style)
}

const STYLES = `
.wm-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

/* 头部:搜索 */
.wm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-search {
  position: relative;
  flex: 1;
}
.wm-search input {
  width: 100%;
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 6px;
  padding: 6px 10px 6px 28px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  outline: none;
}
.wm-search input:focus {
  border-color: var(--primary, #6d8eff);
  box-shadow: 0 0 0 2px rgba(109,142,255,0.15);
}
.wm-search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted, #a1a1aa);
  pointer-events: none;
  font-size: 11px;
}
.wm-count {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  flex-shrink: 0;
}

/* 主体:侧栏 + 列表 */
.wm-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.wm-sidebar {
  width: 148px;
  border-right: 1px solid var(--border, rgba(255,255,255,0.08));
  overflow-y: auto;
  padding: 6px 4px;
  flex-shrink: 0;
}
.wm-sb-label {
  font-size: 10px;
  color: var(--text-muted, #71717a);
  padding: 8px 8px 3px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.wm-sb-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-secondary, #d4d4d8);
  font-size: 12px;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}
.wm-sb-item:hover { background: var(--background-hover, rgba(255,255,255,0.05)); }
.wm-sb-item.active {
  background: rgba(109,142,255,0.12);
  color: var(--primary, #6d8eff);
}
.wm-sb-item .wm-sb-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wm-sb-item .wm-sb-count {
  font-size: 10px;
  color: var(--text-muted, #71717a);
}
.wm-sb-item.active .wm-sb-count { color: var(--primary, #6d8eff); }
.wm-sb-item .wm-sb-del {
  display: none;
  color: var(--text-muted, #71717a);
  font-size: 11px;
  padding: 0 2px;
}
.wm-sb-item:hover .wm-sb-del { display: inline; }
.wm-sb-item .wm-sb-del:hover { color: #ef4444; }

/* 列表区 */
.wm-list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wm-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-sort-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #71717a);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.wm-sort-btn.active {
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
}
.wm-toolbar-spacer { flex: 1; }
.wm-batch-btn {
  background: transparent;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  color: var(--text-secondary, #d4d4d8);
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.wm-batch-btn:hover { border-color: var(--primary, #6d8eff); }
.wm-batch-btn.danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }
.wm-batch-btn.danger:hover { border-color: #ef4444; background: rgba(239,68,68,0.08); }

.wm-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.wm-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
}
.wm-row:hover { background: var(--background-hover, rgba(255,255,255,0.04)); }
.wm-row.current {
  border-left-color: var(--primary, #6d8eff);
  background: rgba(109,142,255,0.08);
}
.wm-row.selected { background: rgba(109,142,255,0.12); }
.wm-check {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--border, rgba(255,255,255,0.15));
  border-radius: 3px;
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: transparent;
  font-size: 9px;
  padding: 0;
}
.wm-check.checked {
  background: var(--primary, #6d8eff);
  border-color: var(--primary, #6d8eff);
  color: #fff;
}
.wm-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: var(--background-secondary, #1a1a22);
}
.wm-main { flex: 1; min-width: 0; }
.wm-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e4e4e7);
  display: flex;
  align-items: center;
  gap: 5px;
}
.wm-name mark {
  background: rgba(251,191,36,0.3);
  color: #fbbf24;
  padding: 0 1px;
  border-radius: 2px;
}
.wm-pin { font-size: 10px; }
.wm-path {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.wm-path mark {
  background: rgba(251,191,36,0.3);
  color: #fbbf24;
  padding: 0 1px;
  border-radius: 2px;
}
.wm-notes {
  font-size: 10px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: italic;
}
.wm-group-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 7px;
  background: var(--background-secondary, #1a1a22);
  color: var(--text-secondary, #d4d4d8);
  flex-shrink: 0;
}
.wm-actions {
  display: flex;
  gap: 1px;
  opacity: 0;
  flex-shrink: 0;
}
.wm-row:hover .wm-actions { opacity: 1; }
.wm-act-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #71717a);
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
}
.wm-act-btn:hover {
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
}
.wm-act-btn.danger:hover { color: #ef4444; }

/* 底部 */
.wm-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-btn {
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
  padding: 5px 12px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.wm-btn:hover { border-color: var(--primary, #6d8eff); }
.wm-btn-primary {
  background: var(--primary, #6d8eff);
  border-color: var(--primary, #6d8eff);
  color: #fff;
}
.wm-footer-spacer { flex: 1; }
.wm-status {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
}
.wm-status b { color: var(--text-secondary, #d4d4d8); font-weight: 600; }

/* 弹窗(新建/重命名/分组) */
.wm-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.wm-modal {
  background: var(--background-elevated, #14141c);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 10px;
  padding: 16px;
  width: 300px;
  max-width: calc(100% - 24px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.wm-modal h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}
.wm-field { margin-bottom: 10px; }
.wm-field label {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  margin-bottom: 4px;
}
.wm-field input {
  width: 100%;
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 5px;
  padding: 6px 9px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  outline: none;
}
.wm-field input:focus { border-color: var(--primary, #6d8eff); }
.wm-emoji-row { display: flex; gap: 3px; flex-wrap: wrap; }
.wm-emoji-opt {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px;
  padding: 0;
}
.wm-emoji-opt:hover { background: var(--background-hover, rgba(255,255,255,0.06)); }
.wm-emoji-opt.selected {
  border-color: var(--primary, #6d8eff);
  background: rgba(109,142,255,0.12);
}
.wm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.wm-error { color: #ef4444; font-size: 11px; margin-top: 6px; min-height: 14px; }

.wm-empty {
  text-align: center;
  padding: 32px 12px;
  color: var(--text-muted, #71717a);
  font-size: 12px;
}

.wm-inline-input {
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--primary, #6d8eff);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  width: 100%;
}

.wm-drop-target.drag-over {
  outline: 1px dashed var(--primary, #6d8eff);
  outline-offset: -1px;
  border-radius: 5px;
}
`
