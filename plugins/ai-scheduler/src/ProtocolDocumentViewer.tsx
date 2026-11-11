// 搬迁改造自主仓 src/components/Scheduler/ProtocolDocumentViewer.tsx（2026-11 Scheduler 域插件化迁移）
// 差异：协议文档读写走服务命令信箱（protoCommand readAll/update*，服务进程落盘）；
// needsBackup/extractUserContent/backupDocument 走纯函数与服务命令。
import { useEffect, useState } from 'react'
import { X, RefreshCw, Archive, Eraser } from 'lucide-react'
import { readProtocolDocuments, updateProtocolDoc, updateSupplementDoc, updateMemoryIndexDoc, updateMemoryTasksDoc, clearSupplementDoc, backupDocument, protoCommand } from './store'
import { t } from './i18n'
import { toast } from './toast'
import type { ScheduledTask, ProtocolDocuments } from './types'

interface Props {
  task: ScheduledTask
  onClose: () => void
}

type Tab = 'protocol' | 'supplement' | 'memoryIndex' | 'memoryTasks'

export function ProtocolDocumentViewer({ task, onClose }: Props) {
  const [docs, setDocs] = useState<ProtocolDocuments | null>(null)
  const [tab, setTab] = useState<Tab>('protocol')
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    if (!task.workDir || !task.taskPath) return
    setLoading(true)
    try {
      const r = await readProtocolDocuments(task.taskPath, task.workDir)
      if (r) {
        setDocs(r)
        setDraft(currentOf(r, tab))
        setDirty(false)
      }
    } catch (e) {
      toast.error(t('pv.loadFailed', '文档读取失败'), e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (docs) { setDraft(currentOf(docs, tab)); setDirty(false) }
  }, [tab, docs])

  if (!task.workDir || !task.taskPath) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-xl bg-background-base border border-border shadow-xl p-5 text-center text-xs text-text-tertiary">
          {t('pv.noDoc', '该任务无协议文档（非协议模式或未设置工作目录）')}
          <div className="mt-3">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md bg-background-hover hover:bg-border text-text-secondary">{t('editor.cancel', '关闭')}</button>
          </div>
        </div>
      </div>
    )
  }

  const save = async () => {
    if (!docs) return
    try {
      const w = task.workDir!, p = task.taskPath!
      // 超 800 行自动备份（金标 needs_backup 语义）
      const needB = tab === 'protocol' ? (await protoCommand('needsBackup', { content: draft })).data === true : false;
      if (needB) {
        const b = await protoCommand('backupDocument', { workDir: w, taskPath: p, docName: 'protocol', content: draft })
        if (b.ok) toast.info(t('pv.autoBackedUp', '文档超 800 行，已自动备份'))
      }
      if (tab === 'protocol') await updateProtocolDoc(p, w, draft)
      else if (tab === 'supplement') await updateSupplementDoc(p, w, draft)
      else if (tab === 'memoryIndex') await updateMemoryIndexDoc(p, w, draft)
      else await updateMemoryTasksDoc(p, w, draft)
      setDirty(false)
      toast.success(t('toast.saved', '已保存'))
    } catch (e) {
      toast.error(t('toast.saveFailed', '保存失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const handleClearSupplement = async () => {
    if (!window.confirm(t('pv.confirmClear', '确认清空补充内容？（AI 处理后应清空，历史已备份）'))) return
    try {
      await clearSupplementDoc(task.taskPath!, task.workDir!)
      await reload()
      toast.success(t('toast.saved', '已清空'))
    } catch (e) {
      toast.error(t('toast.saveFailed', '操作失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const handleBackup = async () => {
    try {
      await backupDocument(task.taskPath!, task.workDir!, tab, draft)
      toast.success(t('pv.backedUp', '已备份'))
    } catch (e) {
      toast.error(t('pv.backupFailed', '备份失败'), e instanceof Error ? e.message : String(e))
    }
  }

  const tabs: Array<[Tab, string]> = [
    ['protocol', t('pv.protocol', '协议')],
    ['supplement', t('pv.supplement', '用户补充')],
    ['memoryIndex', t('pv.memoryIndex', '记忆索引')],
    ['memoryTasks', t('pv.memoryTasks', '任务队列')],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-[80vh] rounded-xl bg-background-base border border-border shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
          <span className="text-xs font-medium text-text-primary truncate flex-1">{t('pv.title', '协议文档')} · {task.name}</span>
          <button type="button" onClick={reload} className="p-1 rounded hover:bg-background-hover text-text-tertiary" title={t('pv.reload', '重新加载')}>
            <RefreshCw size={13} />
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background-hover text-text-tertiary">
            <X size={14} />
          </button>
        </div>
        <div className="flex gap-1 px-2 py-1.5 border-b border-border shrink-0">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-2 py-1 rounded-md text-[11px] ${tab === k ? 'bg-primary/15 text-primary font-medium' : 'text-text-tertiary hover:bg-background-hover'}`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {tab === 'supplement' && (
            <button type="button" onClick={handleClearSupplement} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary hover:bg-background-hover" title={t('pv.clearSupplement', '清空（AI 处理后）')}>
              <Eraser size={11} />
            </button>
          )}
          <button type="button" onClick={handleBackup} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary hover:bg-background-hover" title={t('pv.backup', '备份当前文档')}>
            <Archive size={11} />
          </button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary">{t('loading', '加载中...')}</div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true) }}
            spellCheck={false}
            className="flex-1 p-3 bg-transparent text-[11px] leading-relaxed font-mono outline-none resize-none"
          />
        )}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border shrink-0">
          <span className="text-[10px] text-text-tertiary flex-1 truncate">
            {task.taskPath} @ {task.workDir}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || loading}
            className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {t('editor.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  )
}

function currentOf(docs: ProtocolDocuments, tab: Tab): string {
  switch (tab) {
    case 'supplement': return docs.supplement
    case 'memoryIndex': return docs.memoryIndex
    case 'memoryTasks': return docs.memoryTasks
    default: return docs.protocol
  }
}
