/**
 * 编辑账单弹窗（QuickTab 与 ListTab 共用）
 * 受控表单：金额/支出·收入/分类/备注/时段/日期；保存时经 onSave 回传。
 * 分类集合由调用方按当前账单的 type 过滤传入。
 */
import { useState } from 'react'
import { TIME_SLOTS, type Bill } from './model'

export type EditFields = {
  amount: string
  type: 'expense' | 'income'
  category: string
  note: string
  date: string
  timeOfDay: string
  customDate: string
}

const EXPENSE_CATS = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '人情', '其他']

export default function EditModal({ bill, categories, onClose, onSave }: {
  bill: Bill
  categories: string[]
  onClose: () => void
  onSave: (fields: EditFields) => void
}) {
  const [amount, setAmount] = useState(String(bill.amount))
  const [type, setType] = useState<'expense' | 'income'>(bill.type)
  const [category, setCategory] = useState(bill.category)
  const [note, setNote] = useState(bill.note || '')
  const [date, setDate] = useState('today')
  const [customDate, setCustomDate] = useState('')
  const [timeOfDay, setTimeOfDay] = useState('auto')
  const cats = type === 'income' ? categories.filter((c) => !EXPENSE_CATS.includes(c)) : categories
  return (
    <div className="pl-attmodal" onClick={onClose}>
      <div className="pl-attmodal-box" onClick={(e) => e.stopPropagation()}>
        <div className="pl-attmodal-head">
          <b>编辑账单 · {bill.id.slice(0, 12)}</b>
          <button className="pl-btn sm ghost" onClick={onClose}>取消</button>
        </div>
        <div className="pl-attmodal-body" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="pl-row" style={{ marginBottom: 8 }}>
            <button className={`pl-chip ${type === 'expense' ? 'on' : ''}`} onClick={() => setType('expense')}>支出</button>
            <button className={`pl-chip ${type === 'income' ? 'on' : ''}`} onClick={() => setType('income')}>收入</button>
          </div>
          <input className="pl-inp" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value) }} />
          <label className="pl-lbl">分类</label>
          <div className="pl-row">
            {(cats.length ? cats : [category]).map((c) => (
              <button key={c} className={`pl-chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          <label className="pl-lbl">备注</label>
          <input className="pl-inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" />
          <label className="pl-lbl">时段</label>
          <div className="pl-row">
            <button className={`pl-chip ${timeOfDay === 'auto' ? 'on' : ''}`} onClick={() => setTimeOfDay('auto')}>自动</button>
            {TIME_SLOTS.map((t) => (
              <button key={t.key} className={`pl-chip ${timeOfDay === t.key ? 'on' : ''}`} onClick={() => setTimeOfDay(t.key)}>{t.label} {t.hour}</button>
            ))}
          </div>
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
            <button className="pl-btn" style={{ flex: 1 }} onClick={() => onSave({ amount, type, category, note, date, timeOfDay, customDate })}>保存修改</button>
          </div>
        </div>
      </div>
    </div>
  )
}
