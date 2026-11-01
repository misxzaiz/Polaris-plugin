/**
 * 对比 Tab：多选档案 → 各自最近一次体检报告横向矩阵
 * （分数/TTFT/TPS/对话延迟/模型表/工具），历史分均值辅助。
 */
import { useMemo, useState } from 'react'
import {
  scoreColor, fmtMs, fmtTps, normalizeHistory,
  type MaskedProfile, type SuiteReport, type HistoryEntry,
} from './model'

interface Props {
  profiles: MaskedProfile[]
  latest: SuiteReport | null
  history: HistoryEntry[]
  onRefresh: () => Promise<void>
}

export default function CompareTab({ profiles, latest, history }: Props) {
  const [selected, setSelected] = useState<string[]>([])

  const latestByProfile = useMemo(() => {
    const m = new Map<string, SuiteReport>()
    if (latest && latest.profile) m.set(latest.profile.id, latest)
    return m
  }, [latest])

  const avgScore = useMemo(() => {
    const h = normalizeHistory(history)
    const m = new Map<string, { avg: number; n: number; last: number | null }>()
    const acc = new Map<string, number[]>()
    for (const x of h) {
      if (x.kind !== 'suite' || x.score == null) continue
      const arr = acc.get(x.profileId) || []
      arr.push(x.score)
      acc.set(x.profileId, arr)
    }
    for (const [id, arr] of acc) {
      m.set(id, { avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), n: arr.length, last: arr[0] })
    }
    return m
  }, [history])

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const rows = profiles.filter((p) => selected.includes(p.id))
  const hasData = rows.some((p) => latestByProfile.has(p.id))

  const cell = (rep: SuiteReport | undefined, fn: (r: SuiteReport) => string, okOnly: boolean) => {
    if (!rep) return '—'
    return fn(rep)
  }

  return (
    <>
      <div className="lp-sec"><span className="lp-bar" />选择档案<span className="lp-hint">横向对比各自最近一次体检</span></div>
      <div className="lp-card"><div className="lp-card-b" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {profiles.length === 0 && <span className="lp-sub">暂无档案</span>}
        {profiles.map((p) => (
          <label key={p.id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11.5, color: '#C9D1D9', background: selected.includes(p.id) ? '#1C2330' : 'transparent', border: '1px solid #242C3A', borderRadius: 8, padding: '4px 9px', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.name}
            {avgScore.has(p.id) && <span className="lp-num lp-muted">均{avgScore.get(p.id)!.avg}</span>}
          </label>
        ))}
        {selected.length > 0 && <button className="lp-btn ghost sm" onClick={() => setSelected([])}>清空</button>}
      </div></div>

      {!hasData && selected.length > 0 && <div className="lp-empty">所选档案还没有体检报告——先到「体检」页逐个体检（报告中会保存快照供对比）。</div>}
      {selected.length === 0 && <div className="lp-empty">勾选要对比的档案（建议 2-4 个）。<br />对比基于各自「最近一次体检」的快照。</div>}

      {hasData && (
        <>
          <div className="lp-sec"><span className="lp-bar" />对比矩阵</div>
          <div className="lp-card" style={{ overflowX: 'auto' }}>
            <table className="lp-tb">
              <thead>
                <tr>
                  <th>指标</th>
                  {rows.map((p) => <th key={p.id} className="wrap">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="lp-muted">健康分</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const sc = rep && rep.score ? rep.score.total : null
                    return <td key={p.id}><b style={{ color: scoreColor(sc) }} className="lp-num">{sc != null ? sc : '—'}</b>{rep && rep.verdict ? <span className="lp-muted"> {rep.verdict.cn}</span> : null}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">TTFT（流式）</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const s = rep && rep.steps.stream
                    return <td key={p.id} className="lp-num">{s && s.ok ? fmtMs(s.ttftMs) : '—'}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">生成速度</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const s = rep && rep.steps.stream
                    return <td key={p.id} className="lp-num">{s && s.ok ? fmtTps(s.tps) : '—'}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">对话延迟</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const s = rep && rep.steps.chat
                    return <td key={p.id} className="lp-num">{s && s.ok ? fmtMs(s.ms) : '—'}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">模型表</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const s = rep && rep.steps.models
                    if (!s || s.skipped) return <td key={p.id} className="lp-muted">—</td>
                    if (!s.ok) return <td key={p.id} style={{ color: '#F85149' }}>失败</td>
                    return <td key={p.id} className="lp-num">{s.count}{s.hasTarget ? ' ✓' : s.hasTarget === false ? ' ⚠' : ''}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">工具调用</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const s = rep && rep.steps.tools
                    if (!s || s.skipped) return <td key={p.id} className="lp-muted">—</td>
                    if (!s.ok) return <td key={p.id} style={{ color: '#F85149' }}>失败</td>
                    return <td key={p.id}>{s.toolCalled ? '✓ 支持' : '⚠ 未触发'}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">流式中断</td>
                  {rows.map((p) => {
                    const rep = latestByProfile.get(p.id)
                    const s = rep && rep.steps.stream
                    if (!s || s.skipped) return <td key={p.id} className="lp-muted">—</td>
                    if (s.ok) return <td key={p.id} className="lp-ok">✓ 完整</td>
                    return <td key={p.id} style={{ color: '#F85149' }} className="wrap">{s.error ? s.error.cn : '失败'}</td>
                  })}
                </tr>
                <tr>
                  <td className="lp-muted">历史均分</td>
                  {rows.map((p) => {
                    const a = avgScore.get(p.id)
                    return <td key={p.id} className="lp-num">{a ? `${a.avg}（${a.n} 次）` : '—'}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="lp-sub" style={{ margin: '0 18px 10px' }}>
            对比取各自最近一次体检快照，非同刻并发测量——供应商负载随时段波动，重要结论建议间隔复测。
          </div>
        </>
      )}
    </>
  )
}
