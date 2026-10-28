/**
 * 记录表单（总览「＋记一笔」与藏卷「编辑」共用）
 * 日期字段用 date 输入；评分 0-10；year/creator/genre 可留空（AI 对话补全更方便）
 */
import { useState } from 'react'
import { KINDS, KIND_LABELS, STATUSES, statusLabel, type Work, type Kind, type Status } from './model'

export interface WorkFormPayload {
  title: string
  kind: Kind
  status: Status
  rating?: number
  startDate?: string
  finishDate?: string
  year?: number
  creator?: string
  genre?: string
  note?: string
  favorite?: boolean
}

interface FormState {
  title: string
  kind: Kind
  status: Status
  rating: string
  startDate: string
  finishDate: string
  year: string
  creator: string
  genre: string
  note: string
  favorite: boolean
}

function formFromWork(w: Work): FormState {
  return {
    title: w.title,
    kind: w.kind,
    status: w.status,
    rating: w.rating != null ? String(w.rating) : '',
    startDate: w.startDate || '',
    finishDate: w.finishDate || '',
    year: w.year != null ? String(w.year) : '',
    creator: w.creator || '',
    genre: w.genre || '',
    note: w.note || '',
    favorite: w.favorite === true,
  }
}

function emptyForm(defaultStatus: Status): FormState {
  return {
    title: '', kind: 'movie', status: defaultStatus, rating: '',
    startDate: '', finishDate: '', year: '', creator: '', genre: '', note: '', favorite: false,
  }
}

/** 新建时缺省日期留空（core 会按状态补今天）；编辑时保留原值可清 */
export default function WorkForm({ initial, defaultStatus, busy, submitLabel, onSubmit, onCancel }: {
  initial: Work | null
  defaultStatus?: Status
  busy: boolean
  submitLabel: string
  onSubmit: (payload: WorkFormPayload) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(() => (initial ? formFromWork(initial) : emptyForm(defaultStatus || 'done')))
  const [err, setErr] = useState('')

  const submit = async () => {
    const title = form.title.trim()
    if (!title) { setErr('请填写作品名'); return }
    if (form.rating !== '' && !(Number(form.rating) >= 0 && Number(form.rating) <= 10)) { setErr('评分需为 0-10'); return }
    if (form.year !== '' && !(Number(form.year) >= 1900 && Number(form.year) <= 2100)) { setErr('年份需为 1900-2100'); return }
    setErr('')
    const payload: WorkFormPayload = {
      title,
      kind: form.kind,
      status: form.status,
    }
    if (form.rating !== '') payload.rating = Math.round(Number(form.rating) * 10) / 10
    if (form.startDate) payload.startDate = form.startDate
    if (form.finishDate) payload.finishDate = form.finishDate
    if (form.year !== '') payload.year = Math.floor(Number(form.year))
    if (form.creator.trim()) payload.creator = form.creator.trim()
    if (form.genre.trim()) payload.genre = form.genre.trim()
    if (form.note.trim()) payload.note = form.note.trim()
    if (form.favorite) payload.favorite = true
    await onSubmit(payload)
  }

  return (
    <div className="gz-card">
      <div className="gz-card-b">
        <b style={{ fontSize: 12.5 }}>{initial ? '编辑记录' : '记一笔'}</b>
        <label className="gz-lbl">作品名</label>
        <input className="gz-inp" value={form.title} placeholder="如：流浪地球2" onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">体裁</label>
            <select className="gz-sel" style={{ width: '100%' }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k] || k}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">状态</label>
            <select className="gz-sel" style={{ width: '100%' }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(form.kind, s)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">评分（0-10）</label>
            <input className="gz-inp" type="number" min="0" max="10" step="0.5" value={form.rating} placeholder="可留空" onChange={(e) => setForm({ ...form, rating: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">开始日</label>
            <input className="gz-inp" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">完成日</label>
            <input className="gz-inp" type="date" value={form.finishDate} onChange={(e) => setForm({ ...form, finishDate: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">作品年份</label>
            <input className="gz-inp" type="number" min="1900" max="2100" value={form.year} placeholder="如 2023" onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">作者 / 导演 / 开发组</label>
            <input className="gz-inp" value={form.creator} placeholder="可选" onChange={(e) => setForm({ ...form, creator: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="gz-lbl">类型标签</label>
            <input className="gz-inp" value={form.genre} placeholder="如 科幻/悬疑" onChange={(e) => setForm({ ...form, genre: e.target.value })} />
          </div>
        </div>
        <label className="gz-lbl">短评</label>
        <input className="gz-inp" value={form.note} placeholder="可选，一句话感受" onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <label className="gz-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} />
          标为心头好（年报里单独列出）
        </label>
        {err && <div className="gz-sub" style={{ color: '#F85149', marginTop: 6 }}>{err}</div>}
        <div className="gz-form-actions">
          <button className="gz-btn" disabled={busy} onClick={submit}>{submitLabel}</button>
          <button className="gz-btn ghost" disabled={busy} onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  )
}
