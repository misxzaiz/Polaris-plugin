/**
 * 设置 Tab：币种符号 / 默认提前提醒天数 / CSV 导入导出 / 危险区（清空）
 * CSV 导入：本插件导出格式，逐行归一化，坏行不致命；同名同周期同金额视为重复跳过。
 */
import { useRef, useState } from 'react'
import type { TabProps } from './Panel'
import {
  saveSettings, saveSub, deleteSub, loadSubs, toCsv, fromCsv, fmtMoney, annualCost,
  type Settings, type Subscription,
} from './model'

export default function SettingsTab({ data, reload, showToast }: TabProps) {
  const [symbol, setSymbol] = useState('')
  const [remind, setRemind] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!data) return <div className="sz-empty">载入中…</div>
  const s: Settings = data.settings
  const sym = s.currencySymbol

  const save = async () => {
    setSaving(true)
    try {
      const next: Settings = {
        ...s,
        currencySymbol: (symbol || s.currencySymbol || '¥').slice(0, 4),
        defaultRemindDays: (() => {
          const n = Number(remind)
          return Number.isFinite(n) && remind !== '' ? Math.max(0, Math.min(30, Math.round(n))) : s.defaultRemindDays
        })(),
      }
      await saveSettings(next)
      await reload()
      showToast('设置已保存', 'good')
    } finally {
      setSaving(false)
      setSymbol('')
      setRemind('')
    }
  }

  const exportCsv = () => {
    const csv = toCsv(data.subs, sym)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `shouzha-subs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const importCsv = async (file: File) => {
    const text = await file.text()
    const r = fromCsv(text)
    if (r.error) { showToast(r.error, 'bad'); return }
    const existing = await loadSubs()
    const sig = (x: Subscription) => `${x.name}|${x.cycle}|${x.amount}|${x.nextRenewalDate}`
    const known = new Set(existing.map(sig))
    let added = 0
    let dup = 0
    const errors: string[] = []
    for (const item of r.items) {
      if (!item.ok || !item.sub) { if (item.error) errors.push(item.error); continue }
      if (known.has(sig(item.sub))) { dup++; continue }
      await saveSub(item.sub)
      known.add(sig(item.sub))
      added++
    }
    await reload()
    const parts = [`导入 ${added} 笔`]
    if (dup) parts.push(`跳过重复 ${dup} 笔`)
    if (errors.length) parts.push(`失败 ${errors.length} 行（${errors[0]}${errors.length > 1 ? ' 等' : ''}）`)
    showToast(parts.join('，'), errors.length ? 'bad' : 'good')
  }

  const clearAll = async () => {
    const subs = data.subs
    for (const sub of subs) await deleteSub(sub.id)
    await reload()
    showToast(`已清空 ${subs.length} 笔订阅档案`, 'good')
  }

  return (
    <>
      <div className="sz-sec"><i className="sz-bar" />显示与提醒</div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-grid2">
          <div>
            <label className="sz-lbl">币种符号（当前 {sym}）</label>
            <input className="sz-inp" value={symbol} maxLength={4} placeholder={sym} onChange={(e) => setSymbol(e.target.value)} />
          </div>
          <div>
            <label className="sz-lbl">默认提前提醒天数（当前 {s.defaultRemindDays}）</label>
            <input className="sz-inp" value={remind} inputMode="numeric" placeholder={String(s.defaultRemindDays)} onChange={(e) => setRemind(e.target.value)} />
          </div>
        </div>
        <div className="sz-row" style={{ marginTop: 10 }}>
          <button className="sz-btn" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button>
        </div>
        <div className="sz-sub" style={{ marginTop: 8 }}>
          提醒触达 = 打开面板时的横幅与提示音 + 聊天里问 AI「最近要扣哪些钱」。当前无系统推送通道（与日晷一致）。
        </div>
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />数据</div>
      <div className="sz-card"><div className="sz-card-b">
        <div className="sz-kv"><small>订阅档案</small><b>{data.subs.length} 笔（含已取消）</b></div>
        <div className="sz-kv"><small>年化在缴</small><b>{fmtMoney(data.stats.annualActive, sym)}</b></div>
        <div className="sz-row" style={{ marginTop: 10 }}>
          <button className="sz-btn ghost" onClick={exportCsv}>导出 CSV</button>
          <button className="sz-btn ghost" onClick={() => fileRef.current?.click()}>导入 CSV</button>
          <input
            ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = '' }}
          />
        </div>
        <div className="sz-sub" style={{ marginTop: 8 }}>
          CSV 可迁移到其他设备/其他记账工具；导入时同名+同周期+同金额+同扣费日视为重复自动跳过。
          数据全部在本机（cap.kv），插件自身零网络请求。
        </div>
      </div></div>

      <div className="sz-sec"><i className="sz-bar" />危险区</div>
      <div className="sz-card" style={{ borderColor: '#54262c' }}><div className="sz-card-b">
        <div className="sz-sub">清空会删除全部订阅档案（含价格史），不可恢复。建议先导出 CSV。</div>
        <button
          className="sz-btn danger" style={{ marginTop: 8 }}
          onClick={async () => {
            if (clearArmed) { setClearArmed(false); await clearAll() } else {
              setClearArmed(true)
              setTimeout(() => setClearArmed(false), 4000)
            }
          }}
        >{clearArmed ? '再点一次确认清空！' : `清空全部 ${data.subs.length} 笔`}</button>
      </div></div>
    </>
  )
}
