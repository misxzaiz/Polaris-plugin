/**
 * MultiChat 面板主组件（Phase 2）
 *
 * 三栏结构（窄面板自适应）：
 * - 顶部：会话列表（跨设备共享，读 config）+ 引擎/供应商/模型选择器
 * - 中部：消息流（本端 kv 缓存 + 实时 chat-event 增量）
 * - 底部：输入框 + 发送 / 新建
 *
 * Phase 2 新增：
 * - 引擎/供应商/模型三联动下拉（默认 simple-ai；数据源：get_engine_metadata_list +
 *   cap.config modelProfiles + get_opencode_models）
 * - 手机响应式：≤640px 时侧栏变顶部横向会话条，输入区适配 safe-area
 *
 * 核心纪律：所有写操作经 store（config 单写者锁 + kv 本端缓存），
 * 实时读取走 chat-event（`mc-` 前缀），与现有会话体系零耦合。
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PluginPanelProps } from './types'
import { hasHostSupport } from './host'
import {
  initStore, getSessions, getMessages, createSession, openSession,
  closeSession, sendMessage, isRunning, subscribeStore, refreshSessions,
  getEngineId, getModelProfileId, getModel,
  loadCatalog, getCatalog, profilesForEngine, modelsForSelection,
  setDefaultEngine, setDefaultProfile, setDefaultModel,
} from './store'
import type { McSessionMeta } from './types'

/** 引擎 id → 展示名映射（主应用 metadata.name 更权威，此处仅兜底） */
const ENGINE_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  'simple-ai': 'SimpleAI',
  'open-code': 'OpenCode',
  opencode: 'OpenCode',
}

export default function Panel(props: PluginPanelProps) {
  const [, force] = useState(0)
  const rerender = useCallback(() => force((x) => x + 1), [])
  const [hostError, setHostError] = useState<string | null>(
    hasHostSupport() ? null : '主应用未提供宿主通道（需要 __POLARIS_HOST_INVOKE__ + __POLARIS_HOST_LISTEN__）'
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectorOpen, setSelectorOpen] = useState(false)

  // 初始化：加载会话 + 目录 + 订阅 store
  useEffect(() => {
    let mounted = true
    initStore()
      .then(() => {
        if (!mounted) return
        // 默认打开最近会话
        const sessions = getSessions()
        if (sessions.length > 0) {
          const latest = sessions[0]
          setActiveId(latest.id)
          void openSession(latest.id)
        }
        // 拉取引擎/供应商/模型目录（失败降级，不阻塞面板）
        void loadCatalog().then(() => {
          if (mounted) rerender()
        })
        rerender()
      })
      .catch((e) => {
        if (mounted) setHostError(e instanceof Error ? e.message : String(e))
      })

    const unsub = subscribeStore(() => {
      if (mounted) rerender()
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [rerender])

  // 切换会话
  const switchSession = useCallback((id: string) => {
    closeSession(activeId ?? '')
    setActiveId(id)
    void openSession(id)
  }, [activeId])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    setSendError(null)
    try {
      const meta = await createSession('')
      setActiveId(meta.id)
      await openSession(meta.id)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!activeId || !input.trim()) return
    const text = input.trim()
    setInput('')
    setSendError(null)
    const result = await sendMessage(activeId, text)
    if (!result.ok) {
      setSendError(result.reason)
      setInput(text) // 回滚用户输入
    }
  }, [activeId, input])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refreshSessions() } finally { setRefreshing(false) }
  }, [])

  // 选择器联动数据
  const catalog = getCatalog()
  const engineId = getEngineId()
  const modelProfileId = getModelProfileId()
  const model = getModel()

  const engines = useMemo(() => {
    // 可用引擎优先；全列表兜底（metadata 未标记 available 时按全部显示）
    const list = catalog.engines
    if (!list.length) return []
    const usable = list.filter((e) => e.available !== false)
    return usable.length > 0 ? usable : list
  }, [catalog.engines])

  const profiles = useMemo(() => profilesForEngine(engineId), [catalog.profiles, engineId])

  const models = useMemo(
    () => modelsForSelection(engineId, modelProfileId),
    [catalog.profiles, catalog.opencodeModels, engineId, modelProfileId],
  )

  const activeEngineId = engineId
  const activeProfileId = modelProfileId
  const activeModel = model

  const sessions = getSessions()
  const messages = activeId ? getMessages(activeId) : []
  const active = activeId ? sessions.find((s) => s.id === activeId) : undefined

  return (
    <div className="mc-panel">
      {/* 头部 */}
      <div className="mc-header">
        <span className="mc-title">MultiChat</span>
        <button className="mc-btn" onClick={handleRefresh} title="刷新会话清单（跨设备）">
          {refreshing ? '…' : '⟳'}
        </button>
        <button className="mc-btn mc-btn-primary" onClick={handleCreate} disabled={creating}>
          ＋ 新建
        </button>
      </div>

      {hostError && (
        <div className="mc-empty">{hostError}</div>
      )}

      {!hostError && (
        <div className="mc-body">
          {/* 会话列表 */}
          <div className="mc-sidelist">
            <div className="mc-sidelist-label">会话</div>
            {sessions.length === 0 && <div className="mc-hint">暂无会话，点击「新建」</div>}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`mc-item${s.id === activeId ? ' active' : ''}`}
                onClick={() => switchSession(s.id)}
              >
                <div className="mc-item-title">{s.title}</div>
                <div className="mc-item-sub">
                  {isRunning(s.id) && <span className="mc-dot" title="正在运行" />}
                  {s.engineId} · {s.messageCount} 条
                </div>
              </div>
            ))}
          </div>

          {/* 消息流 + 选择器 */}
          <div className="mc-main">
            {/* 引擎/供应商/模型选择器 */}
            <div className="mc-selector">
              <button
                className="mc-selector-toggle"
                onClick={() => setSelectorOpen((v) => !v)}
                title="引擎 / 供应商 / 模型"
              >
                <span className="mc-selector-label">⚙</span>
                <span className="mc-selector-value">
                  {engineLabel(activeEngineId)} {activeProfileId ? `· ${activeProfileId}` : ''}
                  {activeModel ? ` · ${activeModel}` : ''}
                </span>
                <span className={`mc-selector-arrow${selectorOpen ? ' open' : ''}`}>▾</span>
              </button>

              {selectorOpen && (
                <div className="mc-selector-dropdown">
                  {/* 引擎 */}
                  <div className="mc-selector-group">
                    <div className="mc-selector-group-label">引擎</div>
                    <div className="mc-selector-options">
                      {engines.map((e) => (
                        <button
                          key={e.id}
                          className={`mc-selector-opt${activeEngineId === e.id ? ' active' : ''}`}
                          onClick={() => void setDefaultEngine(e.id)}
                        >
                          {e.name || ENGINE_LABEL[e.id] || e.id}
                        </button>
                      ))}
                      {engines.length === 0 && <div className="mc-hint">无可选引擎</div>}
                    </div>
                  </div>

                  {/* 供应商(Profile) */}
                  <div className="mc-selector-group">
                    <div className="mc-selector-group-label">供应商</div>
                    <div className="mc-selector-options">
                      <button
                        className={`mc-selector-opt${activeProfileId === null ? ' active' : ''}`}
                        onClick={() => void setDefaultProfile(null)}
                      >
                        自动（跟随激活）
                      </button>
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          className={`mc-selector-opt${activeProfileId === p.id ? ' active' : ''}`}
                          onClick={() => void setDefaultProfile(p.id)}
                        >
                          {p.name || p.id}
                        </button>
                      ))}
                      {profiles.length === 0 && <div className="mc-hint">当前引擎无可用供应商</div>}
                    </div>
                  </div>

                  {/* 模型 */}
                  <div className="mc-selector-group">
                    <div className="mc-selector-group-label">模型</div>
                    <div className="mc-selector-options">
                      {models.length === 0 && (
                        <div className="mc-hint">未配置模型（后端将使用 Profile 默认）</div>
                      )}
                      {models.map((m) => (
                        <button
                          key={m}
                          className={`mc-selector-opt${activeModel === m ? ' active' : ''}`}
                          onClick={() => void setDefaultModel(m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!active && <div className="mc-empty">选择左侧会话，或新建一个开始</div>}
            {active && messages.length === 0 && (
              <div className="mc-empty">还没有消息，输入下方内容发起对话。</div>
            )}
            {active && messages.map((m, i) => (
              <div key={i} className={`mc-msg mc-msg-${m.role}`}>
                <div className="mc-msg-role">{m.role === 'user' ? '我' : 'AI'}</div>
                <pre className="mc-msg-text">{m.text}</pre>
              </div>
            ))}
          </div>

          {/* 输入区 */}
          {active && (
            <div className="mc-input-area">
              {sendError && <div className="mc-err">{sendError}</div>}
              <textarea
                className="mc-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRunning(active.id) ? '等待当前回复完成（单写者锁）…' : '输入消息，Enter 发送'}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                disabled={isRunning(active.id)}
              />
              <div className="mc-input-row">
                <span className="mc-engine">🚀 {engineLabel(activeEngineId)}</span>
                <button
                  className="mc-btn mc-btn-primary"
                  onClick={handleSend}
                  disabled={!active || isRunning(active.id) || !input.trim()}
                >
                  发送
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .mc-panel { display:flex; flex-direction:column; height:100%; font-size:12px; color: var(--text, #E4E4E7); background: var(--bg, transparent); overflow:hidden; }
        .mc-header { display:flex; align-items:center; gap:6px; padding:8px 10px; border-bottom:1px solid var(--border, rgba(255,255,255,0.08)); position:sticky; top:0; background:inherit; z-index:1; }
        .mc-title { font-weight:600; font-size:13px; flex:1; }
        .mc-btn { padding:4px 10px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg-elev, #25252B); color:inherit; cursor:pointer; font-size:11px; min-height:28px; }
        .mc-btn:hover { filter:brightness(1.15); }
        .mc-btn-primary { background:#3B82F6; border-color:transparent; color:#fff; }
        .mc-btn:disabled { opacity:.5; cursor:default; }
        .mc-body { display:flex; flex:1; overflow:hidden; }
        .mc-sidelist { width:180px; min-width:140px; border-right:1px solid var(--border, rgba(255,255,255,0.08)); overflow-y:auto; padding:6px 4px; }
        .mc-sidelist-label { font-size:10px; color:var(--text-muted, #8E8E93); padding:4px 6px; text-transform:uppercase; letter-spacing:.05em; }
        .mc-item { padding:6px 8px; border-radius:6px; cursor:pointer; margin-bottom:2px; }
        .mc-item:hover { background:var(--bg-elev, rgba(255,255,255,0.05)); }
        .mc-item.active { background:rgba(59,130,246,.15); }
        .mc-item-title { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mc-item-sub { font-size:10px; color:var(--text-muted, #8E8E93); margin-top:2px; display:flex; align-items:center; gap:4px; }
        .mc-dot { width:6px; height:6px; border-radius:50%; background:#FBBF24; display:inline-block; animation:mc-pulse 1s infinite; }
        @keyframes mc-pulse { 50% { opacity:.3; } }
        .mc-hint { padding:8px; color:var(--text-muted, #8E8E93); font-size:11px; }
        .mc-main { flex:1; display:flex; flex-direction:column; overflow-y:auto; padding:12px; gap:8px; }

        /* 选择器 */
        .mc-selector { position:relative; z-index:5; }
        .mc-selector-toggle { display:flex; align-items:center; gap:6px; width:100%; padding:6px 10px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg-elev, #25252B); color:inherit; cursor:pointer; font-size:11px; }
        .mc-selector-toggle:hover { border-color:#3B82F6; }
        .mc-selector-label { font-size:12px; }
        .mc-selector-value { flex:1; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text, #E4E4E7); }
        .mc-selector-arrow { color:var(--text-muted, #8E8E93); transition:transform .15s; }
        .mc-selector-arrow.open { transform:rotate(180deg); }
        .mc-selector-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:var(--bg-elev, #1E1E24); border:1px solid var(--border, rgba(255,255,255,0.12)); border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:10px; box-shadow:0 8px 24px rgba(0,0,0,.35); max-height:60vh; overflow-y:auto; }
        .mc-selector-group { display:flex; flex-direction:column; gap:4px; }
        .mc-selector-group-label { font-size:10px; color:var(--text-muted, #8E8E93); text-transform:uppercase; letter-spacing:.05em; }
        .mc-selector-options { display:flex; flex-wrap:wrap; gap:4px; }
        .mc-selector-opt { padding:4px 8px; border-radius:4px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg, transparent); color:inherit; cursor:pointer; font-size:11px; }
        .mc-selector-opt:hover { background:var(--bg-elev, rgba(255,255,255,0.05)); }
        .mc-selector-opt.active { background:rgba(59,130,246,.2); border-color:#3B82F6; color:#fff; }

        .mc-msg { display:flex; flex-direction:column; gap:2px; max-width:100%; }
        .mc-msg-role { font-size:10px; color:var(--text-muted, #8E8E93); }
        .mc-msg-text { margin:0; padding:8px 10px; border-radius:8px; background:var(--bg-elev, #25252B); border:1px solid var(--border, rgba(255,255,255,0.06)); white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:12px; }
        .mc-msg-user .mc-msg-text { background:rgba(59,130,246,.15); }
        .mc-input-area { border-top:1px solid var(--border, rgba(255,255,255,0.08)); padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
        .mc-input { flex:0 0 auto; resize:vertical; min-height:56px; padding:8px; border-radius:8px; border:1px solid var(--border, rgba(255,255,255,0.12)); background:var(--bg-elev, #1E1E24); color:inherit; font-family:inherit; font-size:12px; }
        .mc-input:focus { outline:none; border-color:#3B82F6; }
        .mc-input-row { display:flex; align-items:center; gap:8px; justify-content:space-between; }
        .mc-engine { font-size:10px; color:var(--text-muted, #8E8E93); }
        .mc-err { color:#EF4444; font-size:11px; }
        .mc-empty { flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted, #8E8E93); padding:24px; text-align:center; }

        /* 手机响应式（≤640px）：侧栏→顶部横向会话条，全宽布局 */
        @media (max-width: 640px) {
          .mc-body { flex-direction:column; }
          .mc-sidelist {
            width:100%; min-width:0; max-height:90px; border-right:none;
            border-bottom:1px solid var(--border, rgba(255,255,255,0.08));
            display:flex; flex-direction:row; gap:6px; overflow-x:auto; overflow-y:hidden;
            padding:6px 8px; align-items:stretch;
          }
          .mc-sidelist-label { display:none; }
          .mc-item {
            flex:0 0 auto; min-width:110px; max-width:150px;
            border:1px solid var(--border, rgba(255,255,255,0.08)); border-radius:6px;
            padding:6px 8px; display:flex; flex-direction:column; justify-content:center;
          }
          .mc-item.active { border-color:#3B82F6; }
          .mc-main { padding:10px; }
          .mc-input { font-size:14px; min-height:48px; }
          .mc-btn { min-height:32px; padding:6px 12px; }
          .mc-msg-text { font-size:13px; padding:10px 12px; }
          .mc-input-area { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
          .mc-header { padding-top: max(8px, env(safe-area-inset-top)); }
        }
      `}</style>
    </div>
  )
}

/** 引擎 id → 展示名（目录里有 name 用 name，否则兜底映射） */
function engineLabel(id: string): string {
  return ENGINE_LABEL[id] || id
}
