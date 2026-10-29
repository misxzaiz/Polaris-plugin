/**
 * 板列表：新建（标题输入）、打开、两步确认删除、手动刷新。
 */
import { useState } from 'react'
import type { BoardIndexEntry } from './model'

const fmtTime = (ts: number) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')

export function BoardList(props: {
  boards: BoardIndexEntry[]
  busy: boolean
  onOpen: (id: string) => void
  onCreate: (title: string) => void
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  const [title, setTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const submit = () => {
    const t = title.trim()
    if (!t) return
    props.onCreate(t)
    setTitle('')
  }

  return (
    <div className="x-list-root">
      <div className="x-list-head">
        <span className="x-list-title">心图画布</span>
        <button className="x-btn" disabled={props.busy} onClick={props.onRefresh}>刷新</button>
      </div>
      <div className="x-newrow">
        <input
          className="x-input"
          placeholder="新画布标题，如「网关重构脑暴」"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button className="x-btn x-btn-primary" disabled={props.busy || !title.trim()} onClick={submit}>新建</button>
      </div>
      {props.boards.length === 0 ? (
        <div className="x-empty">
          <p>还没有画布。</p>
          <p className="x-dim">两种用法：<br />① 在对话里让 AI「把这几个创意画到画布上」；<br />② 这里新建一块，然后亲手拖出来。</p>
        </div>
      ) : (
        <div className="x-items">
          {props.boards.map((b) => (
            <div key={b.id} className="x-item" onClick={() => props.onOpen(b.id)}>
              <div className="x-item-main">
                <div className="x-item-title">{b.title}</div>
                <div className="x-item-meta">节点 {b.nodeCount} · 更新 {fmtTime(b.updatedAt)}</div>
              </div>
              {confirmId === b.id ? (
                <div className="x-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="x-btn x-btn-danger" disabled={props.busy}
                    onClick={() => { setConfirmId(null); props.onDelete(b.id) }}>确认删除</button>
                  <button className="x-btn" onClick={() => setConfirmId(null)}>取消</button>
                </div>
              ) : (
                <div className="x-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="x-btn" onClick={() => setConfirmId(b.id)}>删除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.x-list-root { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 10px 12px; gap: 10px; }
.x-list-head { display: flex; align-items: center; justify-content: space-between; }
.x-list-title { font-size: 14px; font-weight: 600; }
.x-newrow { display: flex; gap: 8px; }
.x-input { flex: 1; min-width: 0; background: var(--p-chip, rgba(128,128,128,.1)); color: var(--p-text, #e6edf3);
  border: 1px solid var(--p-border, #2b3444); border-radius: 6px; padding: 5px 10px; font-size: 12px; outline: none; }
.x-input:focus { border-color: var(--p-accent, #4a7dff); }
.x-empty { margin-top: 30px; text-align: center; line-height: 1.9; }
.x-dim { color: var(--p-text-dim, #8b949e); font-size: 12px; }
.x-items { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.x-item { display: flex; align-items: center; gap: 8px; border: 1px solid var(--p-border, #2b3444);
  border-radius: 8px; padding: 8px 10px; cursor: pointer; }
.x-item:hover { border-color: var(--p-accent, #4a7dff); }
.x-item-main { flex: 1; min-width: 0; }
.x-item-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x-item-meta { color: var(--p-text-dim, #8b949e); font-size: 11px; margin-top: 2px; }
.x-item-actions { display: flex; gap: 6px; flex-shrink: 0; }
`
