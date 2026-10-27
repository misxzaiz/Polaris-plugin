/**
 * 记账 Tab：大额输入 + 分类 chips + 备注/日期 + 附件（小票/截图）+ 今日列表（即时小计）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addBill, deleteBill, loadDay, dayKeyOf, billTime, timeAgo, fmtMoney,
  saveAttachment, getAttachment, isImageMime, MAX_ATTACHMENT_BYTES,
  type Bill, type PanelData, type Attachment,
} from './model'

type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function QuickTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState('today')
  const [customDate, setCustomDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [today, setToday] = useState<Bill[] | null>(null)
  const [attachment, setAttachment] = useState<{ name: string; mime: string; data: string; size: number } | null>(null)
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const settings = data?.settings
  const categories = useMemo(() => {
    if (!settings) return []
    return type === 'income' ? (settings.incomeCategories || []) : (settings.categories || [])
  }, [settings, type])

  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0])
  }, [categories, category])

  const todayKey = dayKeyOf(Date.now())
  const reloadToday = async () => {
    setToday(await loadDay(todayKey))
  }

  useEffect(() => {
    reloadToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, data?.month])

  /** 选中附件：校验大小/类型，读为 base64 */
  const pickAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_ATTACHMENT_BYTES) { showToast(`附件过大（${Math.round(f.size / 1024)}KB），上限 ${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB`, 'bad'); return }
    if (!f.type.startsWith('image/') && !/\.(pdf|txt|md)$/i.test(f.name)) { showToast('支持图片 / PDF / 文本，其他类型暂不支持', 'bad'); return }
    try {
      const buf = await f.arrayBuffer()
      let bin = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      setAttachment({ name: f.name, mime: f.type || 'application/octet-stream', data: btoa(bin), size: f.size })
      showToast(`已选择附件 ${f.name}`)
    } catch (err) {
      showToast(`读取附件失败：${(err as Error).message}`, 'bad')
    }
  }

  const save = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) { showToast('请输入大于 0 的金额', 'bad'); return }
    setSaving(true)
    const ts = date === 'custom' && customDate
      ? new Date(`${customDate}T${new Date().toTimeString().slice(0, 8)}`).getTime() || Date.now()
      : date === 'yesterday' ? Date.now() - 24 * 3600 * 1000 : Date.now()
    try {
      let attachmentId: string | undefined
      if (attachment) {
        const r = await saveAttachment(attachment)
        if (!r.ok) { showToast(r.error || '附件保存失败', 'bad'); return }
        attachmentId = r.att!.id
      }
      const r = await addBill({ amount: amt, type, category, note: note.trim(), ts, attachmentId })
      if (!r.ok) {
        if (attachmentId) await deleteAttachmentLocal(attachmentId)
        showToast(r.error || '记账失败', 'bad'); return
      }
      setAmount('')
      setNote('')
      setAttachment(null)
      await Promise.all([reloadToday(), reload()])
      const sym = settings?.currencySymbol || '¥'
      showToast(`已记${type === 'income' ? '收入' : '支出'} ${fmtMoney(amt, sym)}`, 'good')
    } catch (e) {
      showToast(`记账失败：${(e as Error).message}`, 'bad')
    }
    setSaving(false)
  }

  /** 兜底删附件键（入账失败回滚用） */
  const deleteAttachmentLocal = async (id: string) => {
    try { const m = await import('./model'); await m.deleteAttachment(id) } catch { /* 忽略 */ }
  }

  const del = async (b: Bill) => {
    try {
      await deleteBill(b.id, data?.month || '')
      await Promise.all([reloadToday(), reload()])
      showToast('已删除')
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, 'bad')
    }
  }

  const viewAtt = async (b: Bill) => {
    if (!b.attachmentId) return
    try {
      const a = await getAttachment(b.attachmentId)
      if (!a) { showToast('附件不存在或已清理', 'bad'); return }
      setViewing(a)
    } catch (e) {
      showToast(`读取附件失败：${(e as Error).message}`, 'bad')
    }
  }

  const expSum = (today || []).filter((b) => b.type === 'expense').reduce((s, b) => s + b.amount, 0)
  const incSum = (today || []).filter((b) => b.type === 'income').reduce((s, b) => s + b.amount, 0)
  const sym = settings?.currencySymbol || '¥'
  const chipOf = (c: string) => {
    const excluded = settings?.excludeFromStats?.includes(c)
    return (
      <button key={c} className={`pl-chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)} title={excluded ? '已设为不参与汇总（统计排除，明细仍见）' : undefined}>
        {c}{excluded ? ' ⊘' : ''}
      </button>
    )
  }

  return (
    <div>
      <div className="pl-sec"><i className="pl-bar" />记一笔<span className="pl-hint">AI 聊天里也能记</span></div>
      <div className="pl-card">
        <div className="pl-card-b">
          <div className="pl-row" style={{ justifyContent: 'center' }}>
            <div className="pl-toggle">
              <button className={type === 'expense' ? 'on-exp' : ''} onClick={() => setType('expense')}>支出</button>
              <button className={type === 'income' ? 'on-inc' : ''} onClick={() => setType('income')}>收入</button>
            </div>
          </div>
          <input
            className="pl-amount-inp" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value) }}
          />
          <label className="pl-lbl">分类</label>
          <div className="pl-row">{categories.map(chipOf)}</div>
          {settings?.excludeFromStats?.includes(category) && (
            <div className="pl-sub" style={{ marginTop: 6 }}>⊘ 该分类已设为"不参与汇总"：账单照记、明细照见，但统计/结余/排行不计入。</div>
          )}
          <label className="pl-lbl">备注</label>
          <input className="pl-inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="午饭 / 打车 / 猫粮…" />
          <label className="pl-lbl">附件（小票/截图，可选）</label>
          <div className="pl-row">
            <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.txt,.md" onChange={pickAttachment} />
            <button className="pl-btn sm ghost" onClick={() => fileRef.current?.click()}>
              {attachment ? `已选：${attachment.name}` : '选择附件'}
            </button>
            {attachment && <button className="pl-btn sm danger" onClick={() => setAttachment(null)}>清除</button>}
          </div>
          {attachment && <div className="pl-sub" style={{ marginTop: 6 }}>{Math.round(attachment.size / 1024)}KB · 随这笔账一起保存</div>}
          <label className="pl-lbl">日期</label>
          <div className="pl-row">
            {[['today', '今天'], ['yesterday', '昨天'], ['custom', '选日期']].map(([v, label]) => (
              <button key={v} className={`pl-chip ${date === v ? 'on' : ''}`} onClick={() => setDate(v)}>{label}</button>
            ))}
            {date === 'custom' && (
              <input type="date" className="pl-sel" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
            )}
          </div>
          <div className="pl-row" style={{ marginTop: 12 }}>
            <button className="pl-btn" style={{ flex: 1 }} disabled={saving} onClick={save}>
              {saving ? '保存中…' : `记一笔${date !== 'today' ? '（补记）' : ''}`}
            </button>
          </div>
        </div>
      </div>

      <div className="pl-sec"><i className="pl-bar" />今日<span className="pl-hint">支出 {fmtMoney(expSum, sym)} · 收入 {fmtMoney(incSum, sym)}</span></div>
      <div className="pl-card">
        <div className="pl-card-b">
          {!today || !today.length
            ? <div className="pl-empty" style={{ padding: '14px 0' }}>今天还没有账单。</div>
            : today.slice().sort((a, b) => b.ts - a.ts).map((b) => (
              <div className="pl-bill" key={b.id}>
                <div className="pl-bill-main">
                  <b>{b.category}{b.note ? ` · ${b.note}` : ''}</b>
                  <small>
                    {billTime(b.ts)} · {timeAgo(b.ts)}{b.source === 'ai' ? ' · AI 记' : ''}
                    {b.attachmentId && (
                      <button className="pl-attlink" onClick={() => viewAtt(b)}> · 📎 查看附件</button>
                    )}
                  </small>
                </div>
                <span className={`pl-bill-amt ${b.type === 'income' ? 'pl-amt-inc' : 'pl-amt-exp'}`}>
                  {b.type === 'income' ? '+' : '-'}{fmtMoney(b.amount, sym)}
                </span>
                <button className="pl-btn sm danger" onClick={() => del(b)}>删</button>
              </div>
            ))}
        </div>
      </div>

      {viewing && (
        <div className="pl-attmodal" onClick={() => setViewing(null)}>
          <div className="pl-attmodal-box" onClick={(e) => e.stopPropagation()}>
            <div className="pl-attmodal-head">
              <b>{viewing.name}</b>
              <button className="pl-btn sm ghost" onClick={() => setViewing(null)}>关闭</button>
            </div>
            <div className="pl-attmodal-body">
              {isImageMime(viewing.mime)
                ? <img src={`data:${viewing.mime};base64,${viewing.data}`} alt={viewing.name} />
                : <a className="pl-btn sm ghost" href={`data:${viewing.mime};base64,${viewing.data}`} download={viewing.name}>下载 {viewing.name}</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
