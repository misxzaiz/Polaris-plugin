// 搬迁改造自主仓 src/components/Scheduler/ProtocolTemplateManager.tsx + ProtocolTemplateSelector.tsx
// （2026-11 Scheduler 域插件化迁移，两组件合并——Selector 的参数表单并入 Manager）
// 差异：列表 = 内置 5 条（shared/builtin-templates 常量）+ kv 自定义（aisched.ptmpl.*）；
// 文档渲染走 types.ts 金标纯函数 generateProtocolDocument。
import { useMemo, useState } from 'react'
import { X, Plus, Trash2, Eye } from 'lucide-react'
import {
  createProtocolTemplate, updateProtocolTemplate, deleteProtocolTemplate,
} from './store'
import { generateProtocolDocument } from './types'
import { t } from './i18n'
import { toast } from './toast'
import type { ProtocolTemplate, ProtocolTemplateConfig, TemplateParam } from './types'

interface Props {
  templates: ProtocolTemplate[]
  onClose: () => void
}

const EMPTY_CONFIG: ProtocolTemplateConfig = {
  missionTemplate: '{mission}',
  executionRules: '### 1. 推进任务\n- 读取记忆了解进度\n- 执行下一步\n\n### 2. 更新记忆\n- 完成后更新记忆文件',
  memoryRules: '',
  customSections: undefined,
}

export function ProtocolTemplateManager({ templates, onClose }: Props) {
  const [selected, setSelected] = useState<ProtocolTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', category: 'custom' as const, mission: '',
  })
  const [config, setConfig] = useState<ProtocolTemplateConfig>(EMPTY_CONFIG)
  const [paramsDraft, setParamsDraft] = useState('')
  const [docPreview, setDocPreview] = useState('')

  const startCreate = () => {
    setSelected(null)
    setCreating(true)
    setForm({ name: '', description: '', category: 'custom', mission: '示例任务目标' })
    setConfig(EMPTY_CONFIG)
    setParamsDraft('mission|任务目标|textarea|true\nkeywords|关键词|text|false')
  }

  const startView = (tpl: ProtocolTemplate) => {
    setSelected(tpl)
    setCreating(false)
    setDocPreview(generateProtocolDocument(tpl, { mission: '示例任务目标' }))
  }

  const parseParams = (): TemplateParam[] => {
    return paramsDraft.split('\n').filter((l) => l.trim()).map((line, i) => {
      const [key = '', label = '', type = 'text', required = 'false'] = line.split('|').map((x) => x.trim())
      return { key: key || `p${i}`, label: label || key, type: (type || 'text') as TemplateParam['type'], required: required === 'true' }
    })
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !config.missionTemplate.trim()) {
      toast.error(t('ptmpl.required', '名称与任务目标模板不能为空'))
      return
    }
    try {
      await createProtocolTemplate({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        params: parseParams(),
        protocolConfig: config,
        defaultTriggerType: 'interval',
        defaultTriggerValue: '1h',
        defaultEngineId: 'claude-code',
        enabled: true,
      })
      toast.success(t('toast.created', '已创建'))
      setCreating(false)
    } catch (e) {
      toast.error(t('toast.saveFailed', '保存失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (tpl: ProtocolTemplate) => {
    if (tpl.builtin) {
      toast.error(t('ptmpl.builtinNoDelete', '内置模板不可删除'))
      return
    }
    if (!window.confirm(t('ptmpl.confirmDelete', `确定删除模板「${tpl.name}」？`))) return
    try {
      await deleteProtocolTemplate(tpl.id)
      if (selected?.id === tpl.id) setSelected(null)
      toast.success(t('toast.deleted', '已删除'))
    } catch (e) {
      toast.error(t('toast.deleteFailed', '删除失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ProtocolTemplate[]>()
    for (const tpl of templates) {
      const k = tpl.category || 'other'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(tpl)
    }
    return map
  }, [templates])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-background-base border border-border shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center">
          <span className="text-sm font-medium text-text-primary flex-1">{t('ptmpl.title', '协议模板')}</span>
          <button type="button" onClick={startCreate} className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 mr-2">
            <Plus size={12} />{t('ptmpl.new', '新建')}
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background-hover text-text-tertiary">
            <X size={15} />
          </button>
        </div>

        {/* 分组列表 */}
        {!creating && !selected && (
          <div className="flex flex-col gap-3">
            {[...grouped.entries()].map(([cat, list]) => (
              <div key={cat}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
                  {t(`taskCategory.${cat}`, cat)}
                </div>
                <div className="flex flex-col gap-1.5">
                  {list.map((tpl) => (
                    <div key={tpl.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background-hover/50 border border-border">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate">
                          {tpl.name}
                          {tpl.builtin && <span className="ml-1.5 text-[9px] px-1 rounded bg-accent/15 text-accent">{t('editor.builtin', '内置')}</span>}
                        </div>
                        {tpl.description && <div className="text-[10px] text-text-tertiary truncate">{tpl.description}</div>}
                      </div>
                      <button type="button" onClick={() => startView(tpl)} className="p-1 rounded hover:bg-background-hover text-text-tertiary" title={t('ptmpl.preview', '预览协议文档')}>
                        <Eye size={12} />
                      </button>
                      {!tpl.builtin && (
                        <button type="button" onClick={() => handleDelete(tpl)} className="p-1 rounded hover:bg-background-hover text-text-tertiary hover:text-danger" title={t('card.delete', '删除')}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="py-6 text-center text-xs text-text-tertiary">{t('ptmpl.empty', '暂无协议模板')}</div>
            )}
          </div>
        )}

        {/* 文档预览 */}
        {selected && !creating && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-primary flex-1">{selected.name}</span>
              <button type="button" onClick={() => setSelected(null)} className="px-2 py-1 rounded-md text-[11px] bg-background-hover hover:bg-border text-text-secondary">
                {t('ptmpl.back', '返回列表')}
              </button>
            </div>
            <pre className="p-2.5 rounded-md bg-background-hover border border-border text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">{docPreview}</pre>
            {selected.params.length > 0 && (
              <div className="text-[10px] text-text-tertiary">
                {t('ptmpl.params', '任务创建时按参数渲染：')}
                {selected.params.map((p) => ` ${p.label}(${p.key})`).join(' ·')}
              </div>
            )}
          </div>
        )}

        {/* 新建表单 */}
        {creating && (
          <div className="flex flex-col gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('ptmpl.name', '模板名称')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('ptmpl.description', '描述（可选）')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" />
            <textarea value={config.missionTemplate} onChange={(e) => setConfig({ ...config, missionTemplate: e.target.value })} rows={2} placeholder={t('ptmpl.mission', '任务目标模板（{mission} 引用参数）')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none resize-y font-mono" />
            <textarea value={config.executionRules || ''} onChange={(e) => setConfig({ ...config, executionRules: e.target.value })} rows={4} placeholder={t('ptmpl.executionRules', '执行规则（Markdown）')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none resize-y font-mono" />
            <textarea value={config.memoryRules || ''} onChange={(e) => setConfig({ ...config, memoryRules: e.target.value })} rows={3} placeholder={t('ptmpl.memoryRules', '记忆规则（Markdown，可选）')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none resize-y font-mono" />
            <textarea value={paramsDraft} onChange={(e) => setParamsDraft(e.target.value)} rows={3} placeholder={t('ptmpl.paramsDraft', '参数每行一条：key|标签|text/textarea/select|是否必填')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-[11px] outline-none resize-y font-mono" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 rounded-md text-xs bg-background-hover hover:bg-border text-text-secondary">
                {t('editor.cancel', '取消')}
              </button>
              <button type="button" onClick={handleCreate} className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">
                {t('editor.save', '保存')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
