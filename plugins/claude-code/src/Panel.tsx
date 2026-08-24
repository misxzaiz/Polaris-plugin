/**
 * Claude Code 管理面板
 *
 * 零服务进程：全部操作通过 window.__POLARIS_HOST_INVOKE__ 调用后端命令。
 * 无 MCP server、无 HTTP 服务、无持久化子进程。
 */

import { useState, useEffect, useCallback } from 'react'

// ===== 后端调用封装（通过宿主暴露的 invoke） =====
const invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> =
  (window as any).__POLARIS_HOST_INVOKE__

interface ClaudeSettings {
  autoMode?: { allow: string[]; softDeny: string[] }
  permissions?: { allow?: string[]; deny?: string[]; ask?: string[]; [key: string]: unknown }
  model?: string
  env?: Record<string, string>
  [key: string]: unknown
}

async function readSettings(): Promise<ClaudeSettings> {
  return invoke<ClaudeSettings>('read_claude_settings')
}

async function writeSettings(settings: ClaudeSettings): Promise<void> {
  return invoke('write_claude_settings', { settings })
}

async function getSettingsPath(): Promise<string> {
  return invoke<string>('get_claude_settings_path')
}

// ===== 样式 =====
const styles = `
.claude-code-panel {
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  font-size: 13px;
  color: var(--text-primary, #e4e4e7);
}
.claude-code-panel h2 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
}
.claude-code-panel .subtitle {
  margin: 0 0 16px 0;
  font-size: 11px;
  color: var(--text-tertiary, #8e8e93);
}
.claude-code-panel .section {
  margin-bottom: 16px;
  border: 1px solid var(--border-subtle, #3f3f46);
  border-radius: 8px;
  overflow: hidden;
}
.claude-code-panel .section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface, #25252b);
  border-bottom: 1px solid var(--border-subtle, #3f3f46);
  font-size: 12px;
  font-weight: 500;
}
.claude-code-panel .section-body {
  padding: 8px 12px;
  background: var(--background-elevated, #1c1c1e);
}
.claude-code-panel .rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-subtle, #3f3f46);
  font-size: 12px;
}
.claude-code-panel .rule-row:last-child {
  border-bottom: none;
}
.claude-code-panel .rule-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.claude-code-panel .rule-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.claude-code-panel .rule-dot.allow { background: #22c55e; }
.claude-code-panel .rule-dot.deny { background: #eab308; }
.claude-code-panel .btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle, #3f3f46);
  background: var(--surface, #25252b);
  color: var(--text-secondary, #b4b4b8);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}
.claude-code-panel .btn:hover {
  background: var(--background-hover, #2d2d33);
}
.claude-code-panel .btn-danger {
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.claude-code-panel .btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}
.claude-code-panel .btn-sm {
  padding: 2px 6px;
  font-size: 10px;
}
.claude-code-panel .empty-hint {
  text-align: center;
  padding: 12px 0;
  font-size: 11px;
  color: var(--text-muted, #636366);
}
.claude-code-panel .path-info {
  font-size: 10px;
  color: var(--text-muted, #636366);
  margin-bottom: 12px;
  word-break: break-all;
}
.claude-code-panel .path-info code {
  color: var(--primary, #3b82f6);
}
.claude-code-panel input[type="text"] {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-subtle, #3f3f46);
  border-radius: 6px;
  background: var(--background-surface, #25252b);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  box-sizing: border-box;
}
.claude-code-panel input[type="text"]:focus {
  outline: none;
  border-color: var(--primary, #3b82f6);
}
.claude-code-panel .add-area {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.claude-code-panel .add-area input {
  flex: 1;
}
.claude-code-panel .tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle, #3f3f46);
  padding-bottom: 8px;
}
.claude-code-panel .tab {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, #b4b4b8);
  transition: background 0.15s;
}
.claude-code-panel .tab:hover {
  background: var(--background-hover, #2d2d33);
}
.claude-code-panel .tab.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--primary, #3b82f6);
}
.claude-code-panel .json-editor {
  width: 100%;
  min-height: 200px;
  padding: 8px;
  border: 1px solid var(--border-subtle, #3f3f46);
  border-radius: 6px;
  background: var(--background-surface, #25252b);
  color: var(--text-primary, #e4e4e7);
  font-family: monospace;
  font-size: 11px;
  resize: vertical;
  box-sizing: border-box;
}
.claude-code-panel .json-editor:focus {
  outline: none;
  border-color: var(--primary, #3b82f6);
}
.claude-code-panel .action-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
`

// ===== 主面板组件 =====
export default function ClaudeCodePanel() {
  const [tab, setTab] = useState<'rules' | 'json'>('rules')
  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  const [settingsPath, setSettingsPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jsonEdit, setJsonEdit] = useState('')
  const [newAllow, setNewAllow] = useState('')
  const [newDeny, setNewDeny] = useState('')
  const [showAddAllow, setShowAddAllow] = useState(false)
  const [showAddDeny, setShowAddDeny] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, p] = await Promise.all([readSettings(), getSettingsPath()])
      setSettings(s)
      setSettingsPath(p)
      setJsonEdit(JSON.stringify(s, null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 切换 tab 时同步 JSON 内容
  useEffect(() => {
    if (tab === 'json' && settings) {
      setJsonEdit(JSON.stringify(settings, null, 2))
    }
  }, [tab, settings])

  const handleSaveJson = async () => {
    setSaving(true)
    setError(null)
    try {
      const parsed = JSON.parse(jsonEdit) as ClaudeSettings
      await writeSettings(parsed)
      setSettings(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const addRule = async (type: 'allow' | 'softDeny', value: string) => {
    if (!value.trim() || !settings) return
    setSaving(true)
    setError(null)
    try {
      const autoMode = settings.autoMode ?? { allow: [], softDeny: [] }
      const key = type === 'allow' ? 'allow' : 'softDeny'
      const list = [...autoMode[key]]
      if (!list.includes(value.trim())) {
        list.push(value.trim())
      }
      const newSettings = { ...settings, autoMode: { ...autoMode, [key]: list } }
      await writeSettings(newSettings)
      setSettings(newSettings)
      if (type === 'allow') { setNewAllow(''); setShowAddAllow(false) }
      else { setNewDeny(''); setShowAddDeny(false) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const removeRule = async (type: 'allow' | 'softDeny', index: number) => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const autoMode = settings.autoMode ?? { allow: [], softDeny: [] }
      const key = type === 'allow' ? 'allow' : 'softDeny'
      const list = [...autoMode[key]]
      list.splice(index, 1)
      const newSettings = { ...settings, autoMode: { ...autoMode, [key]: list } }
      await writeSettings(newSettings)
      setSettings(newSettings)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="claude-code-panel">
        <div className="empty-hint">加载中...</div>
      </div>
    )
  }

  const allowRules = settings?.autoMode?.allow ?? []
  const denyRules = settings?.autoMode?.softDeny ?? []

  return (
    <div className="claude-code-panel">
      <style>{styles}</style>

      <h2>Claude Code</h2>
      <p className="subtitle">管理 ~/.claude/settings.json 配置</p>

      {settingsPath && (
        <p className="path-info">
          路径: <code>{settingsPath}</code>
        </p>
      )}

      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="tab-bar">
        <div className={`tab${tab === 'rules' ? ' active' : ''}`} onClick={() => setTab('rules')}>
          规则列表
        </div>
        <div className={`tab${tab === 'json' ? ' active' : ''}`} onClick={() => setTab('json')}>
          高级编辑
        </div>
      </div>

      {tab === 'rules' ? (
        <>
          {/* Allow 规则 */}
          <div className="section">
            <div className="section-header">
              <span>允许规则（Allow）</span>
              <button className="btn btn-sm" onClick={() => setShowAddAllow(!showAddAllow)}>
                {showAddAllow ? '取消' : '+ 添加'}
              </button>
            </div>
            <div className="section-body">
              {showAddAllow && (
                <div className="add-area">
                  <input
                    type="text"
                    value={newAllow}
                    onChange={(e) => setNewAllow(e.target.value)}
                    placeholder="输入规则名称"
                    onKeyDown={(e) => e.key === 'Enter' && addRule('allow', newAllow)}
                  />
                  <button className="btn" onClick={() => addRule('allow', newAllow)} disabled={saving || !newAllow.trim()}>
                    添加
                  </button>
                </div>
              )}
              {allowRules.length === 0 ? (
                <div className="empty-hint">暂无自定义允许规则</div>
              ) : (
                allowRules.map((rule: string, i: number) => (
                  <div className="rule-row" key={i}>
                    <span className="rule-label">
                      <span className="rule-dot allow" />
                      {rule}
                    </span>
                    <button className="btn btn-sm btn-danger" onClick={() => removeRule('allow', i)} disabled={saving}>
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Soft Deny 规则 */}
          <div className="section">
            <div className="section-header">
              <span>需确认规则（Soft Deny）</span>
              <button className="btn btn-sm" onClick={() => setShowAddDeny(!showAddDeny)}>
                {showAddDeny ? '取消' : '+ 添加'}
              </button>
            </div>
            <div className="section-body">
              {showAddDeny && (
                <div className="add-area">
                  <input
                    type="text"
                    value={newDeny}
                    onChange={(e) => setNewDeny(e.target.value)}
                    placeholder="输入规则名称"
                    onKeyDown={(e) => e.key === 'Enter' && addRule('softDeny', newDeny)}
                  />
                  <button className="btn" onClick={() => addRule('softDeny', newDeny)} disabled={saving || !newDeny.trim()}>
                    添加
                  </button>
                </div>
              )}
              {denyRules.length === 0 ? (
                <div className="empty-hint">暂无自定义需确认规则</div>
              ) : (
                denyRules.map((rule: string, i: number) => (
                  <div className="rule-row" key={i}>
                    <span className="rule-label">
                      <span className="rule-dot deny" />
                      {rule}
                    </span>
                    <button className="btn btn-sm btn-danger" onClick={() => removeRule('softDeny', i)} disabled={saving}>
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        /* JSON 高级编辑 */
        <div className="section">
          <div className="section-header">
            <span>settings.json 编辑</span>
          </div>
          <div className="section-body">
            <textarea
              className="json-editor"
              value={jsonEdit}
              onChange={(e) => setJsonEdit(e.target.value)}
              spellCheck={false}
            />
            <div className="action-row">
              <button className="btn" onClick={handleSaveJson} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button className="btn" onClick={() => settings && setJsonEdit(JSON.stringify(settings, null, 2))}>
                重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}