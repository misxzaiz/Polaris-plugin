/**
 * 心图画布面板外壳：板列表 ↔ 画布视图切换 + 5s 轮询 + toast。
 * 列表数据以板键为权威（listBoards 自带索引修补）；画布内部由 BoardCanvas 自管文档与轮询。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BoardList } from './BoardList'
import { BoardCanvas } from './BoardCanvas'
import { createBoard, deleteBoard, listBoards, type BoardIndexEntry } from './model'

interface Toast { id: number; text: string; bad?: boolean }

export default function XintuPanel(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [boards, setBoards] = useState<BoardIndexEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(1)

  const toast = useCallback((text: string, bad?: boolean) => {
    const id = toastSeq.current++
    setToasts((t) => [...t.slice(-2), { id, text, bad }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 4200 : 2600)
  }, [])

  const refresh = useCallback(async () => {
    try {
      setBoards(await listBoards())
    } catch (e) {
      toast(`加载画布列表失败：${(e as Error).message}`, true)
    }
  }, [toast])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  const onCreate = useCallback(async (title: string) => {
    setBusy(true)
    try {
      const id = await createBoard(title)
      await refresh()
      setActiveId(id)
      toast('已新建画布')
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }, [refresh, toast])

  const onDelete = useCallback(async (id: string) => {
    setBusy(true)
    try {
      await deleteBoard(id)
      if (activeId === id) setActiveId(null)
      await refresh()
      toast('画布已删除')
    } catch (e) {
      toast(`删除失败：${(e as Error).message}`, true)
    } finally {
      setBusy(false)
    }
  }, [activeId, refresh, toast])

  const active = boards.find((b) => b.id === activeId) || null

  return (
    <div className="x-root">
      <style>{CSS}</style>
      {activeId ? (
        <BoardCanvas
          boardId={activeId}
          title={active?.title || ''}
          onBack={() => { setActiveId(null); void refresh() }}
          toast={toast}
          onSendToChat={props.onSendToChat}
        />
      ) : (
        <BoardList
          boards={boards}
          busy={busy}
          onOpen={(id) => setActiveId(id)}
          onCreate={onCreate}
          onDelete={onDelete}
          onRefresh={() => void refresh()}
        />
      )}
      <div className="x-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`x-toast${t.bad ? ' x-toast-bad' : ''}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}

const CSS = `
.x-root { display: flex; flex-direction: column; height: 100%; min-height: 0;
  color: var(--p-text, #e6edf3); background: var(--p-panel, #10141b); font-size: 13px; }
.x-btn { border: 1px solid var(--p-border, #2b3444); background: var(--p-chip, rgba(128,128,128,.12));
  color: var(--p-text, #e6edf3); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; line-height: 1.6; }
.x-btn:hover { border-color: var(--p-accent, #4a7dff); }
.x-btn:disabled { opacity: .5; cursor: default; }
.x-btn-primary { background: var(--p-accent, #4a7dff); border-color: var(--p-accent, #4a7dff); color: #fff; }
.x-btn-danger { color: var(--p-danger, #f85149); border-color: var(--p-danger, #f85149); }
.x-toasts { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); display: flex;
  flex-direction: column; gap: 6px; z-index: 9999; pointer-events: none; }
.x-toast { background: var(--p-panel, #161B22); border: 1px solid var(--p-accent, #4a7dff); color: var(--p-text, #e6edf3);
  padding: 6px 14px; border-radius: 8px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.4); max-width: 70vw; }
.x-toast-bad { border-color: var(--p-danger, #f85149); }
`
