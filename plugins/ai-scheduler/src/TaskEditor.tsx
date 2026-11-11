// 搬迁改造自主仓 src/components/Scheduler/TaskEditor.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：CRUD 走本地 store（cap.kv）；executorList 远程列表 → 内置三类型常量；
// scheduler_build_prompt 等后端命令 → 服务命令信箱 / 纯函数。
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { createTask, updateTask } from './store'
import { calculateNextRun } from '../shared/engine'
import { t } from './i18n'
import { toast } from './toast'
import { TriggerConfig, type TriggerConfigValue } from './TriggerConfig'
import type { ScheduledTask, PromptTemplate, ProtocolTemplate, CreateTaskParams } from './types'

interface Props {
  task: ScheduledTask | null // null = 新建
  templates: PromptTemplate[]
  protocolTemplates: ProtocolTemplate[]
  onClose: () => void
}

const EXECUTORS = [
  { value: '', label: 'AI 会话（chat）' },
  { value: 'command', label: 'CLI 命令（command）' },
  { value: 'http', label: 'HTTP 请求（http）' },
]

export function TaskEditor({ task, templates, protocolTemplates, onClose }: Props) {
  const editing = task !== null
  const [name, setName] = useState(task?.name || '')
  const [description, setDescription] = useState(task?.description || '')
  const [enabled, setEnabled] = useState(task?.enabled !== false)
  const [mode, setMode] = useState<'simple' | 'protocol'>(task?.mode === 'protocol' ? 'protocol' : 'simple')
  const [trigger, setTrigger] = useState<TriggerConfigValue>({
    triggerType: task?.triggerType || 'interval',
    triggerValue: task?.triggerValue || '1h',
  })
  const [engineId, setEngineId] = useState(task?.engineId || 'claude-code')
  const [prompt, setPrompt] = useState(task?.prompt || '')
  const [workDir, setWorkDir] = useState(task?.workDir || '')
  const [templateId, setTemplateId] = useState(task?.templateId || '')
  const [mission, setMission] = useState(task?.mission || '')
  const [category, setCategory] = useState<ScheduledTask['category']>(task?.category || 'other')
  const [group, setGroup] = useState(task?.group || '')
  const [timeoutMinutes, setTimeoutMinutes] = useState<string>(task?.timeoutMinutes ? String(task.timeoutMinutes) : '')
  const [executorType, setExecutorType] = useState(task?.executorType || '')
  const [executorParamsJson, setExecutorParamsJson] = useState(
    task?.executorParams ? JSON.stringify(task.executorParams, null, 2) : '',
  )
  const [saving, setSaving] = useState(false)

  // 协议模式模板选择联动（新建时把模板默认值填进表单）
  const [protocolTemplateId, setProtocolTemplateId] = useState('')

  useEffect(() => {
    if (mode === 'protocol' && protocolTemplateId) {
      const tpl = protocolTemplates.find((x) => x.id === protocolTemplateId)
      if (tpl) {
        setTrigger({
          triggerType: (tpl.defaultTriggerType as TriggerConfigValue['triggerType']) || 'interval',
          triggerValue: tpl.defaultTriggerValue || '1h',
        })
        if (tpl.defaultEngineId) setEngineId(tpl.defaultEngineId)
        if (tpl.defaultTimeoutMinutes) setTimeoutMinutes(String(tpl.defaultTimeoutMinutes))
        if (tpl.category) setCategory(tpl.category)
        // mission 由参数表单生成预览，不自动填
      }
    }
  }, [protocolTemplateId, mode, protocolTemplates])

  const selectedTpl = useMemo(
    () => protocolTemplates.find((x) => x.id === protocolTemplateId) || null,
    [protocolTemplates, protocolTemplateId],
  )

  const canSave = useMemo(() => {
    if (!name.trim()) return false
    if (!engineId.trim()) return false
    if (executorType === '' && !prompt.trim() && mode === 'simple' && !templateId) return false
    if (mode === 'protocol' && !mission.trim()) return false
    return calculateNextRun(trigger.triggerType, trigger.triggerValue.trim(), Math.floor(Date.now() / 1000)) !== null
  }, [name, engineId, prompt, mode, templateId, mission, trigger])

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      let executorParams: Record<string, unknown> | null = null
      if (executorType && executorParamsJson.trim()) {
        try { executorParams = JSON.parse(executorParamsJson) } catch { throw new Error(t('editor.paramsInvalid', '执行器参数不是合法 JSON')) }
      }
      const base: Partial<ScheduledTask> = {
        name: name.trim(),
        description: description.trim() || null,
        enabled,
        mode,
        triggerType: trigger.triggerType,
        triggerValue: trigger.triggerValue.trim(),
        engineId: engineId.trim(),
        prompt: prompt,
        workDir: workDir.trim() || null,
        templateId: templateId || null,
        mission: mode === 'protocol' ? mission.trim() : null,
        category,
        group: group.trim() || null,
        timeoutMinutes: timeoutMinutes ? Number(timeoutMinutes) : null,
        executorType,
        executorParams,
      }
      if (editing && task) {
        await updateTask({ ...task, ...base } as ScheduledTask)
        toast.success(t('toast.updated', '已更新'))
      } else {
        await createTask(base as CreateTaskParams)
        toast.success(t('toast.created', '已创建'))
      }
      onClose()
    } catch (e) {
      toast.error(t('toast.saveFailed', '保存失败'), e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl bg-background-base border border-border shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center">
          <span className="text-sm font-medium text-text-primary flex-1">
            {editing ? t('editor.edit', '编辑任务') : t('editor.new', '新建任务')}
          </span>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background-hover text-text-tertiary">
            <X size={15} />
          </button>
        </div>

        {/* 基础 */}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('editor.name', '任务名称')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('editor.description', '描述（可选）')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" />

        {/* 模式 */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input type="radio" checked={mode === 'simple'} onChange={() => setMode('simple')} />
            {t('taskMode.simple', '简单模式')}
          </label>
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input type="radio" checked={mode === 'protocol'} onChange={() => setMode('protocol')} />
            {t('taskMode.protocol', '协议模式')}
          </label>
          <label className="flex items-center gap-1 text-xs text-text-secondary ml-auto">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('editor.enabled', '创建后立即启用')}
          </label>
        </div>

        {/* 触发 */}
        <div>
          <div className="text-[10px] text-text-tertiary mb-1">{t('editor.trigger', '触发配置')}</div>
          <TriggerConfig value={trigger} onChange={setTrigger} />
        </div>

        {/* 协议模式专属 */}
        {mode === 'protocol' && (
          <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-background-hover/50 border border-border">
            <select
              value={protocolTemplateId}
              onChange={(e) => setProtocolTemplateId(e.target.value)}
              className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs"
            >
              <option value="">{t('editor.noProtocolTemplate', '不使用协议模板')}</option>
              {protocolTemplates.map((x) => (
                <option key={x.id} value={x.id}>{x.name}{x.builtin ? `（${t('editor.builtin', '内置')}）` : ''}</option>
              ))}
            </select>
            <textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              rows={2}
              placeholder={t('editor.mission', '任务目标（协议模式必填，写入协议文档）')}
              className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong resize-y"
            />
            <input
              value={workDir}
              onChange={(e) => setWorkDir(e.target.value)}
              placeholder={t('editor.workDir', '工作目录（协议文档落盘位置，如 D:/projects/myapp）')}
              className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong"
            />
            {selectedTpl && selectedTpl.params.length > 0 && (
              <div className="text-[10px] text-text-tertiary">
                {t('editor.protocolParamsHint', '模板参数在执行时按当前输入渲染，任务创建后可在面板中查看协议文档')}
              </div>
            )}
          </div>
        )}

        {/* 执行器 */}
        <div className="flex flex-col gap-2">
          <select
            value={executorType}
            onChange={(e) => setExecutorType(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs"
          >
            {EXECUTORS.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
          {executorType === '' ? (
            <div className="flex flex-col gap-2">
              <input value={engineId} onChange={(e) => setEngineId(e.target.value)} placeholder={t('editor.engineId', '引擎 ID（如 claude-code）')} className="px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" />
              {mode === 'simple' && (
                <>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs"
                  >
                    <option value="">{t('editor.noTemplate', '不使用提示词模板')}</option>
                    {templates.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    placeholder={templateId ? t('editor.promptWithTemplate', '提示词（将套用模板 {{prompt}} 变量）') : t('editor.prompt', '提示词')}
                    className="px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong resize-y"
                  />
                </>
              )}
            </div>
          ) : (
            <textarea
              value={executorParamsJson}
              onChange={(e) => setExecutorParamsJson(e.target.value)}
              rows={4}
              placeholder={
                executorType === 'command'
                  ? '{ "command": "pnpm test", "cwd": "D:/repo", "timeoutSecs": 300 }'
                  : '{ "url": "https://example.com/health", "method": "GET", "timeoutSecs": 60 }'
              }
              className="px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs font-mono outline-none focus:border-border-strong resize-y"
            />
          )}
        </div>

        {/* 高级 */}
        <details className="text-xs">
          <summary className="cursor-pointer text-text-tertiary">{t('editor.advanced', '高级')}</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <select value={category} onChange={(e) => setCategory(e.target.value as ScheduledTask['category'])} className="px-2 py-1.5 rounded-md bg-background-base border border-border text-xs">
              {['development', 'review', 'news', 'monitor', 'custom', 'other'].map((c) => (
                <option key={c} value={c}>{t(`taskCategory.${c}`, c)}</option>
              ))}
            </select>
            <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder={t('editor.group', '分组（可选）')} className="px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" />
            <input value={timeoutMinutes} onChange={(e) => setTimeoutMinutes(e.target.value)} type="number" placeholder={t('editor.timeout', '超时（分钟，默认 30）')} className="px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" />
          </div>
        </details>

        {/* 动作 */}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs bg-background-hover hover:bg-border text-text-secondary">
            {t('editor.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {saving ? t('editor.saving', '保存中...') : t('editor.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  )
}
