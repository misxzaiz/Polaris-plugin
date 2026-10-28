/**
 * 提醒 Tab：规则管理（增/启停/删）+ 触发历史（未读高亮）
 */
import { useState } from 'react'
import {
  ALERT_TYPE_OPTIONS, describeAlert, fmtNum, removeAlert, saveAlert, uid,
  type AlertRule, type AlertType, type Snapshot,
} from './model'

export default function AlertsTab({ snap, reload, showToast }: {
  snap: Snapshot | null
  reload: () => Promise<void>
  showToast: (t: string, bad?: boolean) => void
}) {
  const [code, setCode] = useState('')
  const [type, setType] = useState<AlertType>('price_above')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')

  const watches = snap?.rows ?? []
  const alerts = snap?.alerts ?? []
  const feed = snap?.feed ?? []
  const nameOf = (id: string) => watches.find((w) => w.def.id === id)?.state?.name
    || watches.find((w) => w.def.id === id)?.def.name || id

  async function addRule() {
    const norm = code.trim()
    if (!norm) {
      showToast('请先在行情页添加自选，再为其建提醒', true)
      return
    }
    const v = Number(value)
    if (!Number.isFinite(v) || v === 0) {
      showToast('请填写有效阈值', true)
      return
    }
    if ((type === 'pct_above' && v < 0) || (type === 'pct_below' && v > 0)) {
      showToast('涨幅阈值应为正数，跌幅阈值应为负数（如 -3）', true)
      return
    }
    try {
      const existing = alerts.find((a) => a.code === norm && a.type === type)
      const id = existing ? existing.id : uid()
      const rule: AlertRule = {
        id, code: norm, type, value: +v.toFixed(4), enabled: true,
        createdAt: existing?.createdAt || Date.now(),
      }
      if (note.trim()) rule.note = note.trim().slice(0, 120)
      await saveAlert(rule)
      setValue('')
      setNote('')
      await reload()
      showToast(existing ? '同类型提醒已更新' : '提醒已创建')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function toggle(a: AlertRule) {
    try {
      await saveAlert({ ...a, enabled: a.enabled === false })
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function del(a: AlertRule) {
    try {
      await removeAlert(a.id)
      await reload()
      showToast('已删除')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div>
      <div className="qs-sec"><span className="qs-bar" />新建提醒<span className="qs-hint">盘中自动评估，每交易日单次触发</span></div>
      <div className="qs-card">
        <div style={{ padding: '10px 13px' }}>
          <label className="qs-lbl">标的（自选代码）</label>
          {watches.length ? (
            <select className="qs-sel" style={{ width: '100%' }} value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">选择自选…</option>
              {watches.map((w) => (
                <option key={w.def.id} value={w.def.id}>{w.def.id} {w.state?.name || w.def.name}</option>
              ))}
            </select>
          ) : (
            <div className="qs-sub">还没有自选标的——先到「行情」页添加，再回来建提醒。</div>
          )}
          <div className="qs-formrow">
            <select className="qs-sel" value={type} onChange={(e) => setType(e.target.value as AlertType)}>
              {ALERT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input
              className="qs-inp sm" placeholder={ALERT_TYPE_OPTIONS.find((o) => o.value === type)?.ph}
              value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal"
            />
          </div>
          <div className="qs-formrow">
            <input className="qs-inp" placeholder="备注（可选，如「减仓位」「关注突破」）" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="qs-btn" style={{ flexShrink: 0 }} onClick={() => void addRule()}>创建</button>
          </div>
        </div>
      </div>

      <div className="qs-sec"><span className="qs-bar" />规则 {alerts.length}</div>
      {!alerts.length && <div className="qs-empty">暂无提醒规则。<br />示例：贵州茅台 价格升到 1350 → 减仓提醒。</div>}
      {alerts.map((a) => (
        <div key={a.id} className="qs-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                <span style={{ color: a.enabled === false ? '#5C6678' : undefined }}>
                  {nameOf(a.code)} {describeAlert(a)}
                </span>
                {a.enabled === false && <span className="qs-tag" style={{ marginLeft: 6 }}>已暂停</span>}
              </div>
              <div className="qs-sub">
                {a.code}
                {a.note ? ` · ${a.note}` : ''}
                {a.lastFiredDate ? ` · 上次触发 ${a.lastFiredDate.slice(4, 6)}-${a.lastFiredDate.slice(6, 8)}` : ' · 从未触发'}
              </div>
            </div>
            <button className="qs-btn ghost sm" onClick={() => void toggle(a)}>{a.enabled === false ? '启用' : '暂停'}</button>
            <button className="qs-btn danger sm" onClick={() => void del(a)}>删除</button>
          </div>
        </div>
      ))}

      <div className="qs-sec"><span className="qs-bar" />触发历史 {feed.length}<span className="qs-hint">最多保留 100 条</span></div>
      {!feed.length && <div className="qs-empty">还没有触发记录。</div>}
      {feed.slice(0, 30).map((f, i) => (
        <div key={`${f.at}-${f.alertId}-${i}`} style={{
          borderLeft: `2px solid ${f.price != null && f.pct != null && f.pct >= 0 ? '#F85149' : '#3FB950'}`,
          padding: '7px 12px', margin: '0 16px 7px', background: '#141821', borderRadius: '0 10px 10px 0',
        }}>
          <div style={{ fontSize: 12.5, color: '#C9D1D9' }}>{f.msg || `${f.code} 提醒触发`}</div>
          <div className="qs-sub">
            {new Date(f.at).toLocaleString('zh-CN', { hour12: false })}
            {f.price != null ? ` · 触发时价 ${fmtNum(f.price)}` : ''}
            {f.alertId ? ` · [${f.alertId}]` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
