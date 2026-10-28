/**
 * 行情 Tab：搜索添加 + 指数条 + 自选列表（展开详情：分时/持仓/快捷提醒/删除）
 */
import { useState } from 'react'
import {
  K, kvGet, normalizeCode, saveWatch, removeWatch, savePosition, saveAlert,
  searchWithService, fetchQuotesNow, loadMinuteViaService, uid,
  fmtNum, fmtAmountWan, fmtVolumeHand, fmtQuoteTime,
  type SearchResult, type Snapshot, type MinuteData, type AlertType,
} from './model'
import { PctBadge, Sparkline, StatCell, colorFor } from './bits'
import { ALERT_TYPE_OPTIONS } from './model'

export default function MarketTab({ snap, busy, setBusy, reload, showToast }: {
  snap: Snapshot | null
  busy: boolean
  setBusy: (b: boolean) => void
  reload: () => Promise<void>
  showToast: (t: string, bad?: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const redUp = snap?.settings.redUp ?? true

  async function doSearch() {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setResults(null)
    try {
      const r = await searchWithService(q)
      setResults(r)
      if (!r.length) showToast('没有匹配结果')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setSearching(false)
    }
  }

  async function addResult(r: SearchResult) {
    if (!r.tradable) {
      showToast(`「${r.name}」(${r.id}) 暂不支持：${r.market === 'hk' ? '港股' : r.market === 'jj' ? '场外基金' : '该市场'}行情`, true)
      return
    }
    try {
      await saveWatch({ id: r.id, code: r.code, market: r.market, name: r.name, createdAt: Date.now() })
      setResults(null)
      setQuery('')
      await reload()
      showToast(`已添加 ${r.name}(${r.id})`)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function addDirect() {
    const r = normalizeCode(query)
    if (!r.id) {
      showToast(r.error || '无法识别', true)
      return
    }
    try {
      await saveWatch({ id: r.id, code: r.code!, market: r.market!, name: r.code!, createdAt: Date.now() })
      setQuery('')
      await reload()
      showToast(`已添加 ${r.id}（名称将随首条行情自动补全）`)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function refreshNow() {
    if (!snap) return
    const codes = [...snap.indexes.map((i) => i.id), ...snap.rows.map((r) => r.def.id)]
    if (!codes.length) return
    setBusy(true)
    try {
      const r = await fetchQuotesNow(codes)
      if (!r.ok && !r.quotes?.length) throw new Error(r.error || '刷新失败')
      showToast(r.source === 'cache' ? `实时源不可用，已显示缓存：${r.error || ''}` : `已刷新（${r.source}）`, r.source === 'cache')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ padding: '6px 16px 10px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="qs-inp"
            placeholder="代码或名称，如 600519 / 茅台 / 510300 / sh000001"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doSearch() }}
          />
          <button className="qs-btn" style={{ flexShrink: 0 }} disabled={searching} onClick={() => void doSearch()}>
            {searching ? <span className="qs-spin" /> : '搜索'}
          </button>
        </div>
        {results && results.length > 0 && (
          <div style={{ marginTop: 8, border: '1px solid #242C3A', borderRadius: 10, overflow: 'hidden' }}>
            {results.slice(0, 12).map((r) => (
              <div key={r.id + r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: '#161B22', borderBottom: '1px solid #1E2530' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name} <span style={{ color: '#5C6678', fontWeight: 400, fontSize: 10.5 }}>{r.id}</span>
                  </div>
                  <div className="qs-sub">{r.tradable ? '可行情' : r.market === 'hk' ? '港股（暂不支持）' : r.market === 'jj' ? '场外基金（暂不支持）' : '暂不支持'} · {r.type || '未知类型'}</div>
                </div>
                {r.tradable && <button className="qs-btn sm" onClick={() => void addResult(r)}>加自选</button>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="qs-btn ghost sm" disabled={busy || !snap?.rows.length} onClick={() => void refreshNow()}>
            {busy ? '刷新中…' : '立即刷新'}
          </button>
          <button className="qs-btn ghost sm" onClick={() => void addDirect()}>按代码直接添加</button>
        </div>
      </div>

      {snap && snap.indexes.length > 0 && (
        <div className="qs-idx">
          {snap.indexes.map(({ id, state }) => (
            <div key={id} className="qs-idx-chip">
              <div className="n">{state?.name || id}</div>
              <div className="v" style={{ color: colorFor(state?.pct, redUp) }}>{fmtNum(state?.price)}</div>
              <div className="p" style={{ color: colorFor(state?.pct, redUp) }}>
                {state ? `${state.pct > 0 ? '+' : ''}${state.pct.toFixed(2)}%` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="qs-sec"><span className="qs-bar" />自选{snap ? ` ${snap.rows.length}` : ''}<span className="qs-hint">点击行展开详情</span></div>
      {!snap?.rows.length && (
        <div className="qs-empty">还没有自选。<br />搜索「茅台」「510300」或输入代码添加，<br />添加后后台服务会自动开始跟踪行情。</div>
      )}
      {snap?.rows.map((row) => (
        <WatchCard
          key={row.def.id}
          row={row}
          alerts={snap.alerts}
          redUp={redUp}
          expanded={expanded === row.def.id}
          onToggle={() => setExpanded(expanded === row.def.id ? null : row.def.id)}
          reload={reload}
          showToast={showToast}
        />
      ))}
    </div>
  )
}

function WatchCard({ row, alerts, redUp, expanded, onToggle, reload, showToast }: {
  row: Snapshot['rows'][number]
  alerts: Snapshot['alerts']
  redUp: boolean
  expanded: boolean
  onToggle: () => void
  reload: () => Promise<void>
  showToast: (t: string, bad?: boolean) => void
}) {
  const { def, state } = row
  const c = colorFor(state?.pct, redUp)
  let pnl: number | null = null
  if (state && row.position && row.position.shares > 0) {
    pnl = (state.price - row.position.cost) * row.position.shares
  }
  return (
    <div className="qs-card">
      <div className="qs-row" onClick={onToggle}>
        <div className="qs-name">
          <b>{state?.name || def.name || def.id}
            {row.alertCount > 0 && <span className="qs-bell" title={`${row.alertCount} 条提醒生效中`}>🔔{row.alertCount}</span>}
          </b>
          <small>{def.id}{def.note ? ` · ${def.note}` : ''}</small>
        </div>
        <div className="qs-price">
          <b style={{ color: c }}>{fmtNum(state?.price)}</b>
          <span className="qs-chg" style={{ color: c }}>
            {state ? `${state.chg > 0 ? '+' : ''}${state.chg.toFixed(2)}  ` : ''}
          </span>
        </div>
        <PctBadge pct={state?.pct} redUp={redUp} big />
      </div>
      {expanded && (
        <Detail
          row={row}
          alerts={alerts}
          redUp={redUp}
          reload={reload}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function Detail({ row, alerts, redUp, reload, showToast }: {
  row: Snapshot['rows'][number]
  alerts: Snapshot['alerts']
  redUp: boolean
  reload: () => Promise<void>
  showToast: (t: string, bad?: boolean) => void
}) {
  const { def, state } = row
  const [minute, setMinute] = useState<MinuteData | null>(null)
  const [loadingMinute, setLoadingMinute] = useState(false)
  const [cost, setCost] = useState(row.position ? String(row.position.cost) : '')
  const [shares, setShares] = useState(row.position ? String(row.position.shares) : '')
  const [alertType, setAlertType] = useState<AlertType>('price_above')
  const [alertValue, setAlertValue] = useState('')

  async function loadMinute() {
    setLoadingMinute(true)
    try {
      const m = await loadMinuteViaService(def.id)
      setMinute(m)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setLoadingMinute(false)
    }
  }
  // 展开即拉分时（惰性）
  if (!minute && !loadingMinute) void loadMinute()

  const color = colorFor(state?.pct, redUp)
  const ph = ALERT_TYPE_OPTIONS.find((o) => o.value === alertType)?.ph || ''

  async function savePos() {
    const c = Number(cost)
    const s = Number(shares)
    try {
      await savePosition(def.id, c, s)
      await reload()
      showToast(c > 0 && s > 0 ? '持仓已保存' : '持仓已清除')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function addAlert() {
    const v = Number(alertValue)
    if (!Number.isFinite(v) || v === 0) {
      showToast('请填写有效的提醒阈值', true)
      return
    }
    if ((alertType === 'pct_above' && v < 0) || (alertType === 'pct_below' && v > 0)) {
      showToast('涨幅阈值应为正数，跌幅阈值应为负数（如 -3）', true)
      return
    }
    try {
      // 同标同类型只保留一条：复用已有规则 id（与服务/MCP 同规则）
      const existing = alerts.find((a) => a.code === def.id && a.type === alertType)
      const alertId = existing ? existing.id : uid()
      await saveAlert({ id: alertId, code: def.id, type: alertType, value: +v.toFixed(4), enabled: true, createdAt: existing?.createdAt || Date.now() })
      setAlertValue('')
      await reload()
      showToast(existing ? '同类型提醒已更新' : '提醒已创建（每个交易日最多触发一次）')
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  async function doRemove() {
    try {
      await removeWatch(def.id)
      await reload()
      showToast(`已移除 ${def.id}`)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div className="qs-detail">
      {loadingMinute && <div className="qs-sub"><span className="qs-spin" /> 分时加载中…</div>}
      {minute && !loadingMinute && (
        minute.ok === false || !minute.points?.length
          ? <div className="qs-sub">{minute.error || '暂无分时数据'}</div>
          : <Sparkline points={minute.points} prevClose={minute.prevClose ?? state?.prevClose ?? null} color={color} />
      )}
      <div className="qs-grid">
        <StatCell label="今开" value={fmtNum(state?.open)} />
        <StatCell label="昨收" value={fmtNum(state?.prevClose)} />
        <StatCell label="最高" value={fmtNum(state?.high)} color={colorFor(state?.high && state.prevClose ? state.high - state.prevClose : null, redUp)} />
        <StatCell label="最低" value={fmtNum(state?.low)} color={colorFor(state?.low && state.prevClose ? state.low - state.prevClose : null, redUp)} />
        <StatCell label="成交量" value={fmtVolumeHand(state?.volume)} />
        <StatCell label="成交额" value={fmtAmountWan(state?.amount)} />
        {state?.turnover != null && <StatCell label="换手" value={`${state.turnover}%`} />}
        {state?.mktcap != null && state.mktcap > 0 && <StatCell label="总市值" value={`${state.mktcap} 亿`} />}
      </div>
      <div className="qs-sub" style={{ marginTop: 6 }}>
        行情时间 {fmtQuoteTime(state?.time)} · 数据源 {state?.source || '—'}
      </div>
      {state && row.position && (
        <div className="qs-sub" style={{ marginTop: 4, color: pnlColor((state.price - row.position.cost), redUp) }}>
          持仓 {row.position.shares} @ 成本 {row.position.cost} · 浮动盈亏
          {' '}{((state.price - row.position.cost) * row.position.shares).toFixed(2)}
          （{(((state.price - row.position.cost) / row.position.cost) * 100).toFixed(2)}%）
        </div>
      )}

      <div className="qs-lbl">持仓成本（用于盈亏显示，留空清除）</div>
      <div className="qs-formrow">
        <input className="qs-inp sm" placeholder="成本价" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
        <input className="qs-inp sm" placeholder="数量(股)" value={shares} onChange={(e) => setShares(e.target.value)} inputMode="numeric" />
        <button className="qs-btn sm" onClick={() => void savePos()}>保存</button>
      </div>

      <div className="qs-lbl">快捷提醒（每交易日单次触发）</div>
      <div className="qs-formrow">
        <select className="qs-sel" value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)}>
          {ALERT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input className="qs-inp sm" placeholder={ph} value={alertValue} onChange={(e) => setAlertValue(e.target.value)} inputMode="decimal" />
        <button className="qs-btn sm" onClick={() => void addAlert()}>创建</button>
      </div>

      <div className="qs-formrow">
        <button className="qs-btn danger sm" onClick={() => void doRemove()}>移除自选</button>
        <span className="qs-sub">不会删除该标的的提醒规则</span>
      </div>
    </div>
  )
}

function pnlColor(diff: number, redUp: boolean): string {
  if (!Number.isFinite(diff) || diff === 0) return '#8B95A7'
  return (diff > 0) === redUp ? '#F85149' : '#3FB950'
}
