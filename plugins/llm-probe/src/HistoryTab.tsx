/**
 * 历史 Tab：按档案分组的趋势迷你柱图 + 明细表。
 * 数据来自 llmprobe.history 环形队列（服务侧维护，最多 80 条）。
 */
import { useMemo, useState } from 'react'
import { scoreColor, fmtMs, fmtTps, fmtTime, normalizeHistory, type MaskedProfile, type HistoryEntry } from './model'

interface Props {
  profiles: MaskedProfile[]
  history: HistoryEntry[]
  onRefresh: () => Promise<void>
}

export default function HistoryTab({ history }: Props) {
  const [filter, setFilter] = useState('')
  const items = useMemo(() => {
    const h = normalizeHistory(history)
    return filter ? h.filter((x) => x.profileId === filter) : h
  }, [history, filter])

  const byProfile = useMemo(() => {
    const h = normalizeHistory(history)
    const m = new Map<string, HistoryEntry[]>()
    for (const x of h) {
      if (x.kind !== 'suite') continue
      const arr = m.get(x.profileId) || []
      arr.push(x)
      m.set(x.profileId, arr)
    }
    return [...m.entries()].slice(0, 8)
  }, [history])

  if (!normalizeHistory(history).length) {
    return <div className="lp-empty">暂无历史。每次「开始体检」后自动记录（分数/TTFT/TPS 快照）。</div>
  }

  return (
    <>
      <div className="lp-sec"><span className="lp-bar" />趋势<span className="lp-hint">每次体检快照 · 最近 {normalizeHistory(history).length} 条</span></div>
      {byProfile.map(([pid, entries]) => {
        const scores = entries.map((e) => e.score ?? 0).reverse() // 时间正序
        const max = Math.max(100, ...scores)
        return (
          <div className="lp-card" key={pid}>
            <div className="lp-card-b">
              <div className="lp-row-h" style={{ borderTop: 'none', paddingTop: 0 }}>
                <b style={{ fontSize: 12.5 }}>{entries[0].profileName}</b>
                <span className="lp-sub">{entries.length} 次体检</span>
                {scores.length > 1 && (
                  <span className="lp-sub" style={{ marginLeft: 'auto' }}>
                    {scores[scores.length - 1] >= scores[0] ? '↗' : '↘'}
                    {' '}首 {scores[0]} → 现 {scores[scores.length - 1]}
                  </span>
                )}
              </div>
              <div className="lp-hb">
                {scores.map((s, i) => (
                  <i key={i} style={{ height: `${Math.max(6, (s / max) * 100)}%`, background: scoreColor(s) }} title={`第 ${i + 1} 次：${s} 分`} />
                ))}
                {!scores.length && <span className="lp-sub">无分数记录</span>}
              </div>
            </div>
          </div>
        )
      })}

      <div className="lp-sec">
        <span className="lp-bar" />明细
        <select className="lp-sel" style={{ marginLeft: 10 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">全部档案</option>
          {byProfile.map(([pid, entries]) => <option key={pid} value={pid}>{entries[0].profileName}</option>)}
        </select>
      </div>
      <div className="lp-card" style={{ overflowX: 'auto' }}>
        <table className="lp-tb">
          <thead>
            <tr><th>时间</th><th>档案</th><th>类型</th><th>结果</th><th>TTFT</th><th>TPS</th></tr>
          </thead>
          <tbody>
            {items.slice(0, 40).map((x) => (
              <tr key={`${x.runId}-${x.at}`}>
                <td className="lp-num lp-muted">{fmtTime(x.at)}</td>
                <td>{x.profileName}</td>
                <td className="lp-muted">{x.kind === 'bench' ? '基准' : '体检'}</td>
                <td>
                  {x.kind === 'bench'
                    ? <span className={x.ok ? 'lp-ok' : ''}>{x.ok ? '✓ ' : '❌ '}{x.verdict}</span>
                    : <span style={{ color: scoreColor(x.score) }} className="lp-num">{x.score != null ? x.score : '—'}</span>}
                  {x.kind !== 'bench' && x.verdict ? <span className="lp-muted"> {x.verdict}</span> : null}
                </td>
                <td className="lp-num">{fmtMs(x.ttftMs)}</td>
                <td className="lp-num">{fmtTps(x.tps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
