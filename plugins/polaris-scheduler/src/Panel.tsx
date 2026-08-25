/**
 * polaris-scheduler 面板 — 无状态薄层
 *
 * 定时任务调度器面板：任务列表 / 创建 / 编辑 / 启用禁用 / 手动执行。
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入。
 * 零服务、零状态：所有数据操作直接调用 Polaris IPC bridge。
 *
 * 通信模式：
 *   - Web 模式：fetch `POST /api/<command>` 调用 Polaris IPC bridge
 *   - 桌面模式：window.__TAURI_INTERNALS__.invoke
 *   - 执行任务：POST /api/chat/execute 调用 Polaris AI 引擎
 */

import { useEffect, useState, useCallback } from 'react'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

type TriggerType = 'once' | 'cron' | 'interval' | 'after_completion'
type TaskStatus = 'running' | 'success' | 'failed'

interface ScheduledTask {
  id: string
  name: string
  enabled: boolean
  triggerType: TriggerType
  triggerValue: string
  engineId: string
  prompt: string
  workDir: string | null
  description: string | null
  lastRunAt: number | null
  lastRunStatus: TaskStatus | null
  nextRunAt: number | null
  createdAt: number
  updatedAt: number
  mode: string
  category: string
  [key: string]: unknown
}

// ── 通信层 ────────────────────────────────────────────────────────────────────

/** 获取 Polaris HTTP 基础地址 */
const POLARIS_URL: string = (window as any).__POLARIS_WEB_URL__ || 'http://127.0.0.1:3000'

/** 调用 Tauri 命令（桌面环境） */
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> }
  }).__TAURI_INTERNALS__
  if (internals?.invoke) return internals.invoke(cmd, args)
  throw new Error('需在 Polaris 桌面环境运行')
}

/** 调用 Polaris IPC bridge（Web 模式） */
async function ipcCall<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const path = `/api/${command.replace(/_/g, '-')}`
  const res = await fetch(`${POLARIS_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json()
}

/** 列出任务（先 Web IPC，回退 Tauri） */
async function listTasksApi(): Promise<ScheduledTask[]> {
  try { return await ipcCall<ScheduledTask[]>('scheduler_list_tasks', {}) }
  catch (_) { return tauriInvoke<ScheduledTask[]>('scheduler_list_tasks', {}) }
}

/** 创建任务 */
async function createTaskApi(params: Record<string, unknown>): Promise<void> {
  try { await ipcCall('scheduler_create_task', { params }) }
  catch (_) { await tauriInvoke('scheduler_create_task', { params }) }
}

/** 更新任务 */
async function updateTaskApi(task: ScheduledTask): Promise<void> {
  try { await ipcCall('scheduler_update_task', { task }) }
  catch (_) { await tauriInvoke('scheduler_update_task', { task }) }
}

/** 删除任务 */
async function deleteTaskApi(id: string): Promise<void> {
  try { await ipcCall('scheduler_delete_task', { id }) }
  catch (_) { await tauriInvoke('scheduler_delete_task', { id }) }
}

/** 切换任务启用状态 */
async function toggleTaskApi(id: string, enabled: boolean): Promise<void> {
  try { await ipcCall('scheduler_toggle_task', { id, enabled }) }
  catch (_) { await tauriInvoke('scheduler_toggle_task', { id, enabled }) }
}

/** 获取调度器状态 */
async function getStatusApi(): Promise<{ isRunning?: boolean } | null> {
  try { return await ipcCall<{ isRunning?: boolean }>('scheduler_get_status', {}) }
  catch (_) {
    try { return await tauriInvoke<{ isRunning?: boolean }>('scheduler_get_status', {}) }
    catch (_) { return null }
  }
}

/** 执行 AI 任务 */
async function executeTask(task: ScheduledTask): Promise<void> {
  await fetch(`${POLARIS_URL}/api/chat/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: task.prompt,
      workDir: task.workDir || undefined,
      engineId: task.engineId || undefined,
      contextId: `scheduler-${task.id}`,
      enableMcpTools: true,
    }),
  })
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function formatTime(ts: number | null): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function triggerTypeLabel(t: TriggerType): string {
  return { once: '一次性', cron: 'Cron', interval: '间隔', after_completion: '完成后' }[t] || t
}

// ── 主面板 ────────────────────────────────────────────────────────────────────

export default function SchedulerPanel({ pluginId }: { pluginId?: string }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [daemonStatus, setDaemonStatus] = useState<{ isRunning?: boolean } | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)

  // 编辑表单
  const [formName, setFormName] = useState('')
  const [formTriggerType, setFormTriggerType] = useState<TriggerType>('interval')
  const [formTriggerValue, setFormTriggerValue] = useState('1h')
  const [formEngineId, setFormEngineId] = useState('claude-code')
  const [formPrompt, setFormPrompt] = useState('')
  const [formWorkDir, setFormWorkDir] = useState('')
  const [formDescription, setFormDescription] = useState('')

  const loadTasks = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const list = await listTasksApi()
      setTasks(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
    setLoading(false)
  }, [])

  const loadStatus = useCallback(async () => {
    const s = await getStatusApi()
    if (s) setDaemonStatus(s)
  }, [])

  useEffect(() => {
    loadTasks()
    loadStatus()
    const interval = setInterval(loadStatus, 10000)
    return () => clearInterval(interval)
  }, [loadTasks, loadStatus])

  const openCreateEditor = () => {
    setEditingTask(null)
    setFormName(''); setFormTriggerType('interval'); setFormTriggerValue('1h')
    setFormEngineId('claude-code'); setFormPrompt(''); setFormWorkDir(''); setFormDescription('')
    setShowEditor(true)
  }

  const openEditEditor = (task: ScheduledTask) => {
    setEditingTask(task)
    setFormName(task.name); setFormTriggerType(task.triggerType); setFormTriggerValue(task.triggerValue)
    setFormEngineId(task.engineId); setFormPrompt(task.prompt)
    setFormWorkDir(task.workDir || ''); setFormDescription(task.description || '')
    setShowEditor(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setError(null)
    try {
      const body = {
        id: editingTask?.id,
        name: formName.trim(), enabled: true,
        triggerType: formTriggerType, triggerValue: formTriggerValue.trim(),
        engineId: formEngineId.trim(), prompt: formPrompt.trim(),
        workDir: formWorkDir.trim() || null, description: formDescription.trim() || null,
        mode: editingTask?.mode || 'simple', category: editingTask?.category || 'development',
        currentRuns: editingTask?.currentRuns || 0, retryCount: editingTask?.retryCount || 0,
        notifyOnComplete: editingTask?.notifyOnComplete ?? true,
      }
      if (editingTask) {
        await updateTaskApi({ ...editingTask, ...body })
      } else {
        await createTaskApi(body)
      }
      setShowEditor(false)
      loadTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleDelete = async (id: string) => {
    try { await deleteTaskApi(id); loadTasks() }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败') }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try { await toggleTaskApi(id, enabled); loadTasks() }
    catch (e) { setError(e instanceof Error ? e.message : '切换失败') }
  }

  const handleRun = async (task: ScheduledTask) => {
    try {
      await executeTask(task)
      loadTasks()
    } catch (e) {
      setError('执行失败')
    }
  }

  return (
    <div style={{
      padding: '16px', height: '100%', overflow: 'auto',
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#e1e4e8',
      background: '#1c2128',
    }}>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>定时任务</h2>
          <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '4px' }}>
            调度器: {daemonStatus
              ? (daemonStatus.isRunning ? '🟢 运行中' : '🔴 已停止')
              : '⏳ 加载中'} · 共 {tasks.length} 任务
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={loadTasks} style={btnStyle} title="刷新">🔄</button>
          <button onClick={openCreateEditor} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>+ 新建</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: '#3d1f1f', border: '1px solid #f85149', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#f85149', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 编辑器弹窗 */}
      {showEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1c2128', borderRadius: '8px', padding: '24px', width: '520px', maxHeight: '80vh', overflow: 'auto', border: '1px solid #373e47' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>{editingTask ? '编辑任务' : '新建任务'}</h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>任务名称 *</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} placeholder="输入任务名称" />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>触发类型</label>
              <select value={formTriggerType} onChange={e => setFormTriggerType(e.target.value as TriggerType)} style={inputStyle}>
                <option value="interval">间隔 (interval)</option>
                <option value="cron">Cron 表达式</option>
                <option value="once">一次性</option>
                <option value="after_completion">完成后间隔</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>触发值 *</label>
              <input value={formTriggerValue} onChange={e => setFormTriggerValue(e.target.value)} style={inputStyle}
                placeholder={formTriggerType === 'interval' ? '1h, 30m, 1d' : formTriggerType === 'cron' ? '0 9 * * 1-5' : '2024-12-31T23:59:00Z'} />
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>
                {formTriggerType === 'interval' ? '支持: s(秒), m(分), h(时), d(天)' : ''}
                {formTriggerType === 'cron' ? '5字段 cron 表达式: 分 时 日 月 周' : ''}
                {formTriggerType === 'once' ? 'ISO 8601 时间戳' : ''}
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>引擎 ID *</label>
              <input value={formEngineId} onChange={e => setFormEngineId(e.target.value)} style={inputStyle} placeholder="claude-code" />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>提示词 *</label>
              <textarea value={formPrompt} onChange={e => setFormPrompt(e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="AI 执行任务时的提示词内容" />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>工作目录</label>
              <input value={formWorkDir} onChange={e => setFormWorkDir(e.target.value)} style={inputStyle} placeholder="可选，默认当前工作区" />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>描述</label>
              <input value={formDescription} onChange={e => setFormDescription(e.target.value)} style={inputStyle} placeholder="可选，任务描述" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setShowEditor(false)} style={{ ...btnStyle, background: '#373e47' }}>取消</button>
              <button onClick={handleSave} style={{ ...btnStyle, background: '#238636', color: '#fff' }} disabled={!formName.trim()}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 任务列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>加载中...</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏰</div>
          <div>暂无定时任务</div>
          <button onClick={openCreateEditor} style={{ ...btnStyle, marginTop: '12px', background: '#238636', color: '#fff' }}>创建第一个任务</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tasks.map(task => (
            <div key={task.id} style={{
              padding: '12px', background: '#22272e', border: '1px solid #373e47', borderRadius: '6px',
              opacity: task.enabled ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
                    {task.name}
                    {task.lastRunStatus === 'running' && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#58a6ff' }}>⚡ 执行中</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8b949e', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{triggerTypeLabel(task.triggerType)}: {task.triggerValue}</span>
                    <span>引擎: {task.engineId}</span>
                    <span>上次: {formatTime(task.lastRunAt)}</span>
                    <span>下次: {formatTime(task.nextRunAt)}</span>
                    {task.lastRunStatus && task.lastRunStatus !== 'running' && (
                      <span style={{ color: task.lastRunStatus === 'success' ? '#3fb950' : '#f85149' }}>
                        {task.lastRunStatus === 'success' ? '✓ 成功' : '✗ 失败'}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <div style={{ fontSize: '12px', color: '#6e7681', marginTop: '4px' }}>{task.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => handleRun(task)} style={iconBtnStyle} title="手动执行" disabled={task.lastRunStatus === 'running'}>▶</button>
                  <button onClick={() => handleToggle(task.id, !task.enabled)} style={iconBtnStyle} title={task.enabled ? '禁用' : '启用'}>
                    {task.enabled ? '⏸' : '▶'}
                  </button>
                  <button onClick={() => openEditEditor(task)} style={iconBtnStyle} title="编辑">✏</button>
                  <button onClick={() => handleDelete(task.id)} style={iconBtnStyle} title="删除">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 样式 ──────────────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '13px', fontWeight: 500, background: '#373e47', color: '#e1e4e8',
}

const iconBtnStyle: React.CSSProperties = {
  width: '30px', height: '30px', padding: 0, border: '1px solid #373e47',
  borderRadius: '4px', cursor: 'pointer', fontSize: '14px',
  background: '#2d333b', color: '#e1e4e8',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const fieldStyle: React.CSSProperties = { marginBottom: '12px' }

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#8b949e',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #373e47', borderRadius: '6px',
  fontSize: '13px', background: '#2d333b', color: '#e1e4e8', boxSizing: 'border-box', outline: 'none',
}