/**
 * 药箱 Tab：预警摘要 + 补货清单（紧迫在前）+ 效期待清理 + 药品卡片（批次明细/
 * 补货/编辑/删除）+ 新增药品。
 * 库存口径：读服务端 qingnang.stocks 快照（FEFO 派生的单写权威）；快照过期时如实
 * 提示「服务离线，数据可能过期」，绝不本地假算（面板只持近 8 天日志，算不准）。
 */
import { useMemo, useState } from 'react'
import { saveBatch, saveMed, deleteEntity, SNAPSHOT_STALE_MS_CONST, type QingData, type Med } from './model'
import type { TabProps } from './PanelTypes'

const URGENCY_LABEL: Record<string, string> = { low: '🛒 需补货', watch: '🟡 留意', ok: '🟢 充裕', none: '' }
const FORM_LABEL: Record<string, string> = {
  tablet: '片剂', capsule: '胶囊', granule: '颗粒', liquid: '液体',
  injection: '注射', patch: '贴剂', other: '其他',
}

export default function CabinetTab({ data, reload, showToast, pluginId }: TabProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState('')
  const [restockFor, setRestockFor] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState('')
  void pluginId

  const stale = useMemo(() => {
    if (!data) return true
    if (!data.stocks) return true
    return Date.now() - data.stocks.at > SNAPSHOT_STALE_MS_CONST
  }, [data])

  const [form, setForm] = useState({ name: '', spec: '', unit: '片', formKind: 'tablet', batchQty: '', batchExpiry: '' })
  const [restock, setRestock] = useState({ qty: '', expiry: '' })

  async function addMed() {
    setBusy(true)
    try {
      const med = await saveMed({
        name: form.name, spec: form.spec, unit: form.unit, form: form.formKind,
      }, null)
      if (form.batchQty !== '') {
        await saveBatch({ medId: med.id, qty: Number(form.batchQty), expiry: form.batchExpiry }, null)
      }
      showToast(`已建药品「${med.name}」`)
      setForm({ name: '', spec: '', unit: '片', formKind: 'tablet', batchQty: '', batchExpiry: '' })
      setShowAdd(false)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function restockMed(med: Med) {
    setBusy(true)
    try {
      await saveBatch({ medId: med.id, qty: Number(restock.qty), expiry: restock.expiry }, null)
      showToast(`已入库 ${restock.qty}${med.unit}`)
      setRestockFor('')
      setRestock({ qty: '', expiry: '' })
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function removeExpired(batchId: string) {
    if (confirmDel !== batchId) { setConfirmDel(batchId); setTimeout(() => setConfirmDel((c) => (c === batchId ? '' : c)), 4000); return }
    setBusy(true)
    try {
      await deleteEntity('batch', batchId, false, data!)
      showToast('已清理该批次')
      setConfirmDel('')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="qn-empty">载入中…</div>
  const stocks = data.stocks
  const alerts = stocks ? stocks.alerts : null
  const expiredRows = (stocks ? stocks.expiry : []).filter((r) => r.band === 'expired')

  return (
    <div>
      <div className="qn-sec">
        <span className="qn-bar" />
        药箱总览
        <span className="qn-hint">{stale ? '服务快照缺失/过期，数据可能不准' : `快照 ${new Date(stocks!.at).toLocaleTimeString()}`}</span>
      </div>

      {alerts && (
        <div className="qn-card"><div className="qn-card-b qn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {alerts.dueNow > 0 && <span className="qn-tag yellow">现在该吃 {alerts.dueNow}</span>}
          {alerts.overdue > 0 && <span className="qn-tag red">过点未服 {alerts.overdue}</span>}
          {alerts.lowStock > 0 && <span className="qn-tag red">待补货 {alerts.lowStock}</span>}
          {alerts.expiredBatches > 0 && <span className="qn-tag red">已过期 {alerts.expiredBatches} 批</span>}
          {alerts.soonExpiry > 0 && <span className="qn-tag yellow">效期临近 {alerts.soonExpiry} 批</span>}
          {alerts.dueNow + alerts.overdue + alerts.lowStock + alerts.expiredBatches + alerts.soonExpiry === 0 && (
            <span className="qn-tag green">一切正常</span>
          )}
        </div></div>
      )}

      {/* 补货清单 */}
      {stocks && stocks.refill.length > 0 && (
        <div>
          <div className="qn-sec"><span className="qn-bar" />补货清单<span className="qn-hint">按消耗速率预测，紧的在前</span></div>
          <div className="qn-card">
            {stocks.refill.map((r) => (
              <div key={r.medId} className="qn-row" style={{ padding: '8px 13px', borderBottom: '1px solid #1d2330' }}>
                <span className="qn-grow" style={{ fontSize: 12.5 }}>
                  {r.name}{r.spec ? <span style={{ color: '#8B95A7' }}>（{r.spec}）</span> : null}
                  <div className="qn-sub">
                    剩 {r.remaining}{r.unit}
                    {r.daysLeft != null ? ` · 约够 ${r.daysLeft} 天` : ''}
                    {r.ratePerDay > 0 ? ` · 日均 ${r.ratePerDay}${r.unit}${r.estimated ? '（按方案估算）' : ''}` : ''}
                    {r.expired > 0 ? ` · 过期 ${r.expired}${r.unit}` : ''}
                  </div>
                </span>
                {URGENCY_LABEL[r.urgency] && (
                  <span className={`qn-tag ${r.urgency === 'low' ? 'red' : r.urgency === 'watch' ? 'yellow' : 'green'}`}>{URGENCY_LABEL[r.urgency]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 效期待清理 */}
      {expiredRows.length > 0 && (
        <div>
          <div className="qn-sec"><span className="qn-bar" style={{ background: '#F85149' }} />已过期待清理</div>
          <div className="qn-card">
            {expiredRows.map((r) => (
              <div key={r.batchId} className="qn-row" style={{ padding: '8px 13px', borderBottom: '1px solid #1d2330' }}>
                <span className="qn-grow" style={{ fontSize: 12.5 }}>
                  {r.medName} <span className="qn-sub">效期 {r.expiry}（过期 {-r.daysLeft!} 天）· 剩 {r.qty}{r.unit}</span>
                </span>
                <button className="qn-btn danger sm" disabled={busy} onClick={() => removeExpired(r.batchId)}>
                  {confirmDel === r.batchId ? '再点确认' : '清理'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 药品列表 */}
      <div className="qn-sec">
        <span className="qn-bar" />
        全部药品（{data.meds.length}）
        <button className="qn-hint qn-btn ghost sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '收起' : '+ 新药入库'}</button>
      </div>

      {showAdd && (
        <div className="qn-card"><div className="qn-card-b">
          <label className="qn-lbl">药品名称 *</label>
          <input className="qn-inp" value={form.name} placeholder="如 布洛芬缓释胶囊" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="qn-lbl">规格</label>
          <input className="qn-inp" value={form.spec} placeholder="如 0.3g×20粒" onChange={(e) => setForm({ ...form, spec: e.target.value })} />
          <div className="qn-row">
            <div className="qn-grow">
              <label className="qn-lbl">剂型</label>
              <select className="qn-sel" value={form.formKind} onChange={(e) => setForm({ ...form, formKind: e.target.value })}>
                {Object.entries(FORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ width: 90 }}>
              <label className="qn-lbl">单位 *</label>
              <input className="qn-inp" value={form.unit} placeholder="片/粒/袋" onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          <div className="qn-row">
            <div style={{ width: '45%' }}>
              <label className="qn-lbl">首批数量（可空）</label>
              <input className="qn-inp" value={form.batchQty} placeholder="如 24" inputMode="decimal" onChange={(e) => setForm({ ...form, batchQty: e.target.value })} />
            </div>
            <div className="qn-grow">
              <label className="qn-lbl">效期（可空）</label>
              <input className="qn-inp" value={form.batchExpiry} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, batchExpiry: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="qn-btn" disabled={busy || !form.name.trim()} onClick={addMed}>入库</button>
          </div>
        </div></div>
      )}

      {!data.meds.length && !showAdd && (
        <div className="qn-card"><div className="qn-card-b qn-empty">药箱还是空的。把家里常备药登记进来，效期和存量青囊替你盯着。</div></div>
      )}

      {data.meds.map((med) => {
        const st = stocks ? stocks.meds[med.id] : null
        const isOpen = expanded === med.id
        return (
          <div key={med.id} className="qn-card">
            <div className="qn-row" style={{ padding: '10px 13px', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? '' : med.id)}>
              <span className="qn-grow">
                <span style={{ fontSize: 13, fontWeight: 600 }}>{med.name}</span>
                {med.spec && <span className="qn-sub"> {med.spec}</span>}
                <div className="qn-sub">
                  {st ? `剩 ${st.totalUsable}${med.unit}${st.daysLeft != null ? ` · 约够 ${st.daysLeft} 天` : ''}` : '库存待服务快照'}
                  {st && st.totalExpired > 0 ? ` · 过期 ${st.totalExpired}${med.unit}` : ''}
                  {st && st.over ? ' · ⚠消耗超账面' : ''}
                </div>
              </span>
              {st && URGENCY_LABEL[st.urgency] && (
                <span className={`qn-tag ${st.urgency === 'low' ? 'red' : st.urgency === 'watch' ? 'yellow' : 'green'}`}>{URGENCY_LABEL[st.urgency]}</span>
              )}
              <span className="qn-sub">{isOpen ? '收起 ▴' : '明细 ▾'}</span>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid #1d2330', padding: '8px 13px' }}>
                {st && st.batches.map((b) => (
                  <div key={b.id} className="qn-row" style={{ padding: '4px 0', fontSize: 12 }}>
                    <span className="qn-grow">
                      批次 {b.qty}{med.unit} → 剩 <b>{b.remaining}{med.unit}</b>
                      {b.expiry ? ` · 效期 ${b.expiry}` : ' · 未登记效期'}
                      {b.note ? <span className="qn-sub"> {b.note}</span> : null}
                    </span>
                    {b.expired && <span className="qn-tag red">过期</span>}
                  </div>
                ))}
                {st && !st.batches.length && <div className="qn-sub" style={{ padding: '4px 0' }}>还没有批次登记——点「补货」录一盒。</div>}
                {restockFor === med.id ? (
                  <div className="qn-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                    <input className="qn-inp" style={{ width: 80 }} placeholder="数量" value={restock.qty} inputMode="decimal" onChange={(e) => setRestock({ ...restock, qty: e.target.value })} />
                    <input className="qn-inp" style={{ width: 120 }} placeholder="效期 YYYY-MM-DD" value={restock.expiry} onChange={(e) => setRestock({ ...restock, expiry: e.target.value })} />
                    <button className="qn-btn sm" disabled={busy || !restock.qty} onClick={() => restockMed(med)}>确认入库</button>
                    <button className="qn-btn ghost sm" onClick={() => setRestockFor('')}>取消</button>
                  </div>
                ) : (
                  <div className="qn-row" style={{ marginTop: 8, gap: 6 }}>
                    <button className="qn-btn sm" onClick={() => { setRestockFor(med.id); setRestock({ qty: '', expiry: '' }) }}>补货入库</button>
                  </div>
                )}
                {med.note && <div className="qn-sub" style={{ marginTop: 6 }}>{med.note}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
