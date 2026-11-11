// 搬迁改造自主仓 src/components/Scheduler/SchedulerPanel.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：数据层改 useAiSchedulerData()（cap.kv 5s 轮询）；调度器启停按钮移除
// （生命周期归宿主 PluginServiceManager），服务状态只读展示（meta 心跳）；
// 手动执行改命令信箱（aisched.cmd.run.*）；runTask 事件订阅/协议 prompt 构建下沉服务进程。
import { useMemo, useState } from 'react'
import { Clock, Pause, Play, Plus, RefreshCw, History, FileText } from 'lucide-react'
import { useAiSchedulerData, runTask, toggleTask, deleteTask, metaAlive } from './store'
import { t } from './i18n'
import { toast, ToastHost } from './toast'
import { TaskCard } from './TaskCard'
import { TaskEditor } from './TaskEditor'
import { ExecutionLogDrawer } from './ExecutionLogDrawer'
import { TemplateManager } from './TemplateManager'
import { ProtocolTemplateManager } from './ProtocolTemplateManager'
import type { ScheduledTask } from './types'

type FilterStatus = 'all' | 'enabled' | 'disabled' | 'running' | 'success' | 'failed'
type SortKey = 'created' | 'name' | 'nextRun' | 'lastRun'

export function Panel() {
  const data = useAiSchedulerData()
  const { tasks, hist, meta, loading, error } = data

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [showEditor, setShowEditor] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showProtocolTemplates, setShowProtocolTemplates] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTask, setDrawerTask] = useState<ScheduledTask | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  const serviceState = metaAlive(meta)

  const filtered = useMemo(() => {
    let list = tasks
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (x) => x.name.toLowerCase().includes(q) || (x.description || '').toLowerCase().includes(q),
      )
    }
    switch (filterStatus) {
      case 'enabled': list = list.filter((x) => x.enabled); break
      case 'disabled': list = list.filter((x) => !x.enabled); break
      case 'running': list = list.filter((x) => x.lastRunStatus === 'running'); break
      case 'success': list = list.filter((x) => x.lastRunStatus === 'success'); break
      case 'failed': list = list.filter((x) => x.lastRunStatus === 'failed'); break
    }
    const sorted = [...list]
    switch (sortKey) {
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'nextRun':
        sorted.sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity)); break
      case 'lastRun':
        sorted.sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0)); break
      default: sorted.sort((a, b) => b.createdAt - a.createdAt)
    }
    return sorted
  }, [tasks, filterStatus, search, sortKey])

  const handleRun = async (task: ScheduledTask) => {
    if (task.unsupportedExecutor) {
      toast.error(t('editor.executorUnsupported', '该执行器类型随主仓出仓，本插件 v1 不支持'))
      return
    }
    setRunning(task.id)
    try {
      const r = await runTask(task.id)
      if (r.ok) toast.success(t('toast.runQueued', '已提交执行（服务进程将触发）'))
      else toast.error(t('toast.runFailed', '执行失败'), r.error || '')
    } catch (e) {
      toast.error(t('toast.runFailed', '执行失败'), e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(null)
    }
  }

  const handleToggle = async (task: ScheduledTask) => {
    try {
      await toggleTask(task.id, !task.enabled)
      toast.success(task.enabled ? t('toast.disabled', '已禁用') : t('toast.enabled', '已启用'))
    } catch (e) {
      toast.error(t('toast.toggleFailed', '操作失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (task: ScheduledTask) => {
    if (!window.confirm(t('confirmDelete', `确定删除任务「${task.name}」？此操作不可恢复。`, { name: task.name }))) return
    try {
      await deleteTask(task.id)
      toast.success(t('toast.deleted', '已删除'))
    } catch (e) {
      toast.error(t('toast.deleteFailed', '删除失败'), e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部：标题 + 服务状态 + 动作 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Clock size={15} className="text-text-tertiary shrink-0" />
        <span className="text-sm font-medium text-text-primary">{t('title', '定时任务')}</span>
        {/* 服务状态只读徽标（生命周期归宿主 Supervisor，无启停按钮） */}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
            serviceState === 'ok'
              ? 'bg-success/15 text-success'
              : serviceState === 'stale'
                ? 'bg-warning/15 text-warning'
                : 'bg-danger/15 text-danger'
          }`}
          title={
            serviceState === 'ok'
              ? t('service.ok', '调度服务运行中')
              : serviceState === 'stale'
                ? t('service.stale', '调度服务心跳超时')
                : t('service.down', '调度服务未运行')
          }
        >
          {serviceState === 'ok' ? t('service.okBadge', '运行中') : t('service.downBadge', '离线')}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowProtocolTemplates(true)}
          className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary"
          title={t('protocolTemplates', '协议模板管理')}
        >
          <FileText size={14} />
        </button>
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary"
          title={t('templates', '提示词模板管理')}
        >
          <History size={14} />
        </button>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary"
          title={t('history', '执行日志')}
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          onClick={() => { setEditingTask(null); setShowEditor(true) }}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90"
        >
          <Plus size={13} />
          {t('newTask', '新建任务')}
        </button>
      </div>

      {/* 筛选行 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border text-xs shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search', '搜索任务...')}
          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="px-1.5 py-1 rounded-md bg-background-base border border-border text-xs"
        >
          <option value="all">{t('filter.all', '全部')}</option>
          <option value="enabled">{t('filter.enabled', '已启用')}</option>
          <option value="disabled">{t('filter.disabled', '已禁用')}</option>
          <option value="running">{t('status.running', '执行中')}</option>
          <option value="success">{t('status.success', '成功')}</option>
          <option value="failed">{t('status.failed', '失败')}</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-1.5 py-1 rounded-md bg-background-base border border-border text-xs"
        >
          <option value="created">{t('sort.created', '创建时间')}</option>
          <option value="name">{t('sort.name', '名称')}</option>
          <option value="nextRun">{t('sort.nextRun', '下次执行')}</option>
          <option value="lastRun">{t('sort.lastRun', '上次执行')}</option>
        </select>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-xs text-text-tertiary">{t('loading', '加载中...')}</div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-xs text-danger">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-text-tertiary">
            {tasks.length === 0 ? t('empty', '暂无定时任务') : t('noMatch', '没有匹配的任务')}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 px-2 py-2">
            {filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                running={running === task.id}
                onRun={() => handleRun(task)}
                onToggle={() => handleToggle(task)}
                onEdit={() => { setEditingTask(task); setShowEditor(true) }}
                onDelete={() => handleDelete(task)}
                onShowLog={() => { setDrawerTask(task); setDrawerOpen(true) }}
              />
            ))}
          </div>
        )}
      </div>

      {showEditor && (
        <TaskEditor
          task={editingTask}
          templates={data.templates}
          protocolTemplates={data.protocolTemplates}
          onClose={() => setShowEditor(false)}
        />
      )}
      {showTemplates && <TemplateManager templates={data.templates} onClose={() => setShowTemplates(false)} />}
      {showProtocolTemplates && (
        <ProtocolTemplateManager
          templates={data.protocolTemplates}
          onClose={() => setShowProtocolTemplates(false)}
        />
      )}
      <ExecutionLogDrawer
        open={drawerOpen}
        task={drawerTask}
        hist={hist}
        onClose={() => { setDrawerOpen(false); setDrawerTask(null) }}
      />
      <ToastHost />
    </div>
  )
}
