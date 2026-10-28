/**
 * 藏卷 Tab：搜索 + 体裁/状态/心头好过滤 + 全量记录卡（状态流转/编辑/删除）
 */
import { useState } from 'react'
import {
  addWork, searchWorks, updateWork, deleteWork, KINDS, KIND_LABELS, KIND_VERBS, STATUSES, statusLabel,
  type PanelData, type Work, type Kind, type Status,
} from './model'
import WorkCard from './WorkCard'
import WorkForm, { type WorkFormPayload } from './WorkForm'
import type { Toast } from './Panel'

export default function LibraryTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [query, setQuery] = useState('')
  const [kindF, setKindF] = useState<'' | Kind>('')
  const [statusF, setStatusF] = useState<'' | Status>('')
  const [favOnly, setFavOnly] = useState(false)
  const [form, setForm] = useState<{ initial: Work | null } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <div className="gz-empty">载入中…</div>

  const filtered = searchWorks(data.works, {
    query, kind: kindF || undefined, status: statusF || undefined,
    favorite: favOnly || undefined, limit: 200,
  })

  const kindCount = (k: Kind) => data.works.filter((w) => w.kind === k).length

  const doAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await reload()
      showToast(okMsg, 'good')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const submitForm = async (payload: WorkFormPayload) => {
    if (busy) return
    setBusy(true)
    try {
      if (form?.initial) {
        const r = await updateWork(form.initial.id, payload as unknown as Record<string, unknown>)
        if (!r.ok) throw new Error(r.error || '更新失败')
        showToast(`已保存「${payload.title}」`, 'good')
      } else {
        const r = await addWork(payload)
        if (!r.ok) throw new Error(r.error || '记账失败')
        showToast(`已记账：${payload.title}`, 'good')
      }
      setForm(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const flowActions = (w: Work) => {
    const done = () => doAction(() => updateWork(w.id, { status: 'done' }), `《${w.title}》已${KIND_VERBS[w.kind] || '看'}完（记今天）`)
    if (w.status === 'wish') {
      return (
        <>
          <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(() => updateWork(w.id, { status: 'active' }), `开始《${w.title}》`)}>开始</button>
          <button className="gz-btn sm" disabled={busy} onClick={done}>完成</button>
        </>
      )
    }
    if (w.status === 'active') {
      return (
        <>
          <button className="gz-btn sm" disabled={busy} onClick={done}>完成</button>
          <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(() => updateWork(w.id, { status: 'dropped' }), `已标记弃了《${w.title}》`)}>弃</button>
        </>
      )
    }
    if (w.status === 'done') {
      return (
        <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(
          () => updateWork(w.id, { favorite: !w.favorite }),
          w.favorite ? `已取消心头好：${w.title}` : `已标为心头好：${w.title}`,
        )}>{w.favorite ? '★ 取心头好' : '☆ 心头好'}</button>
      )
    }
    return (
      <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(() => updateWork(w.id, { status: 'wish' }), `《${w.title}》回到想看`)}>回想看</button>
    )
  }

  return (
    <>
      <div className="gz-card" style={{ marginLeft: 16, marginRight: 16 }}>
        <div className="gz-card-b" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="gz-inp" value={query} placeholder="搜标题 / 作者 / 类型 / 短评" onChange={(e) => setQuery(e.target.value)} />
          <button className="gz-btn sm" disabled={busy} onClick={() => setForm({ initial: null })}>＋ 记一笔</button>
        </div>
      </div>
      {form && (
        <WorkForm
          initial={form.initial}
          busy={busy}
          submitLabel={form.initial ? '保存' : '记账'}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      )}

      <div className="gz-chiprow">
        <button className={`gz-chip ${kindF === '' ? 'on' : ''}`} onClick={() => setKindF('')}>全部 {data.works.length}</button>
        {KINDS.filter((k) => kindCount(k) > 0).map((k) => (
          <button key={k} className={`gz-chip ${kindF === k ? 'on' : ''}`} onClick={() => setKindF(kindF === k ? '' : k)}>
            {KIND_LABELS[k]} {kindCount(k)}
          </button>
        ))}
      </div>
      <div className="gz-chiprow">
        <button className={`gz-chip ${statusF === '' ? 'on' : ''}`} onClick={() => setStatusF('')}>全部状态</button>
        {STATUSES.map((s) => (
          <button key={s} className={`gz-chip ${statusF === s ? 'on' : ''}`} onClick={() => setStatusF(statusF === s ? '' : s)}>
            {s === 'wish' ? '想看' : s === 'active' ? '在进行' : s === 'done' ? '完成' : '弃了'}
          </button>
        ))}
        <button className={`gz-chip ${favOnly ? 'on' : ''}`} onClick={() => setFavOnly(!favOnly)}>★ 心头好</button>
      </div>

      {filtered.length === 0 && (
        <div className="gz-empty">{data.works.length === 0 ? '账本还是空的——去聊天里说「看完《××》打9分」。\n或点右上「＋ 记一笔」。' : '没有符合过滤条件的记录。'}</div>
      )}
      {filtered.map((w) => (
        <div key={w.id}>
          <WorkCard work={w} today={data.today} onEdit={() => setForm({ initial: w })}>
            {flowActions(w)}
            <button className="gz-btn sm danger" disabled={busy} onClick={() => doAction(
              async () => { await deleteWork(w.id) },
              `已删除《${w.title}》`,
            )}>删</button>
          </WorkCard>
        </div>
      ))}
      {filtered.length > 0 && (
        <div className="gz-sub" style={{ padding: '2px 18px 10px' }}>
          状态流转：想看 → 开始 → 完成；{statusLabel('movie', 'done')}后可随时改评分与短评（编辑）。
        </div>
      )}
    </>
  )
}
