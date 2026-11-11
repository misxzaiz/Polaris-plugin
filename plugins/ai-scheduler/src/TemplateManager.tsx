// 搬迁改造自主仓 src/components/Scheduler/TemplateManager.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：模板 CRUD 走本地 store（cap.kv aisched.tmpl.*）；scheduler_build_prompt → applyTemplate 纯函数。
import { useMemo, useState } from 'react'
import { X, Plus, Pencil, Trash2 } from 'lucide-react'
import { createTemplate, updateTemplate, deleteTemplate } from './store'
import { applyTemplate } from '../shared/engine'
import { t } from './i18n'
import { toast } from './toast'
import type { PromptTemplate } from './types'

interface Props {
  templates: PromptTemplate[]
  onClose: () => void
}

const SAMPLE = { taskName: '示例任务', prompt: '写一份日报' }

export function TemplateManager({ templates, onClose }: Props) {
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(true)

  const startCreate = () => {
    setEditing(null)
    setCreating(true)
    setName('')
    setContent('')
  }

  const startEdit = (tpl: PromptTemplate) => {
    setCreating(false)
    setEditing(tpl)
    setName(tpl.name)
    setContent(tpl.content)
  }

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      toast.error(t('tmpl.required', '名称与内容不能为空'))
      return
    }
    try {
      if (editing) await updateTemplate({ ...editing, name: name.trim(), content })
      else await createTemplate({ name: name.trim(), content })
      toast.success(t('toast.saved', '已保存'))
      setCreating(false)
      setEditing(null)
    } catch (e) {
      toast.error(t('toast.saveFailed', '保存失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (tpl: PromptTemplate) => {
    if (!window.confirm(t('tmpl.confirmDelete', `确定删除模板「${tpl.name}」？`))) return
    try {
      await deleteTemplate(tpl.id)
      toast.success(t('toast.deleted', '已删除'))
    } catch (e) {
      toast.error(t('toast.deleteFailed', '删除失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const rendered = useMemo(
    () => (preview && content ? applyTemplate(content, SAMPLE.taskName, SAMPLE.prompt) : ''),
    [preview, content],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-background-base border border-border shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center">
          <span className="text-sm font-medium text-text-primary flex-1">{t('tmpl.title', '提示词模板')}</span>
          <button type="button" onClick={startCreate} className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 mr-2">
            <Plus size={12} />{t('tmpl.new', '新建')}
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background-hover text-text-tertiary">
            <X size={15} />
          </button>
        </div>

        {/* 列表 */}
        {!creating && !editing && (
          <div className="flex flex-col gap-1.5">
            {templates.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-tertiary">{t('tmpl.empty', '暂无模板')}</div>
            ) : (
              templates.map((tpl) => (
                <div key={tpl.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background-hover/50 border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary truncate">{tpl.name}</div>
                    <div className="text-[10px] text-text-tertiary truncate">{tpl.content}</div>
                  </div>
                  <button type="button" onClick={() => startEdit(tpl)} className="p-1 rounded hover:bg-background-hover text-text-tertiary" title={t('card.edit', '编辑')}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" onClick={() => handleDelete(tpl)} className="p-1 rounded hover:bg-background-hover text-text-tertiary hover:text-danger" title={t('card.delete', '删除')}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* 编辑/新建表单 */}
        {(creating || editing) && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-text-tertiary">
              {t('tmpl.vars', '可用变量：{{prompt}} {{taskName}} {{date}} {{time}} {{datetime}} {{weekday}}')}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('tmpl.name', '模板名称')} className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder={t('tmpl.content', '模板内容，用 {{prompt}} 引用任务提示词')}
              className="px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong resize-y font-mono"
            />
            <label className="flex items-center gap-1 text-[11px] text-text-secondary">
              <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
              {t('tmpl.preview', '渲染预览（示例变量）')}
            </label>
            {rendered && (
              <pre className="p-2 rounded-md bg-background-hover border border-border text-[10px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{rendered}</pre>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setCreating(false); setEditing(null) }} className="px-3 py-1.5 rounded-md text-xs bg-background-hover hover:bg-border text-text-secondary">
                {t('editor.cancel', '取消')}
              </button>
              <button type="button" onClick={handleSave} className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">
                {t('editor.save', '保存')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
