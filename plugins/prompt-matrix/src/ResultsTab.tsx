/**
 * ResultsTab —— 矩阵结果：聚合统计 + 矩阵视图（行=样本，列=变体）+ 格子详情
 * （全文/检查明细/judge/字级 diff 对比/人工标注）+ Markdown/JSONL 导出。
 * 运行中实时拉进度；完成后读 kv 投影；全文经信箱 get_cell。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as core from '../shared/matrix-core'
import {
  fetchRun, fetchCell, annotate, loadMeta, type RunProj, type CellProj,
  type MaskedProfile, type HistoryEntry, type RunProgress,
} from './model'
import type { PanelProps, TabKey } from './Panel'

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function statusPill(c: CellProj) {
  if (c.status === 'pending') return <span className="pm-pill info">待跑</span>
  if (c.status === 'running') return <span className="pm-pill info">跑中</span>
  if (c.status === 'aborted') return <span className="pm-pill warn">已中止</span>
  if (!c.ok) return <span className="pm-pill bad" title={(c.error && c.error.cn) || ''}>✗ {(c.error && c.error.cn) || '失败'}</span>
  const badChecks = (c.checks || []).filter((x) => !x.pass).length
  return (
    <span className="pm-pill ok">
      ✓{c.judge ? ` J${c.judge.score}` : ''}{badChecks ? ` 检✗${badChecks}` : (c.checks || []).length ? ' 检✓' : ''}
      {c.annotated === 'up' ? ' 👍' : c.annotated === 'down' ? ' 👎' : ''}
    </span>
  )
}

export default function ResultsTab({ running, openRunId, onChanged, goTab, onSendToChat }: PanelProps & {
  profiles: MaskedProfile[]
  history: HistoryEntry[]
  running: RunProgress | null
  openRunId: string
  onChanged: () => void
  goTab: (t: TabKey) => void
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [run, setRun] = useState<RunProj | null>(null)
  const [selRunId, setSelRunId] = useState('')
  const [err, setErr] = useState('')
  const [cellModal, setCellModal] = useState<{ cell: CellProj, vars?: Record<string, unknown>, full: boolean, diffWith?: string } | null>(null)
  const [diffTarget, setDiffTarget] = useState('')
  const [diffSegs, setDiffSegs] = useState<{ t: string, s: string }[] | null>(null)

  // 运行中：轮询进度；结束后自动拉结果
  useEffect(() => {
    let stop = false
    const tick = async () => {
      const m = await loadMeta().catch(() => null)
      if (stop) return
      if (!m || !m.running) {
        const r = await fetchRun(selRunId || 'latest').catch(() => null)
        if (!stop) {
          if (r) { setRun(r); setSelRunId(r.runId); onChanged() }
          stop = true
        }
      }
    }
    if (running) {
      const t = setInterval(tick, 2500)
      return () => { stop = true; clearInterval(t) }
    }
    return () => { stop = true }
  }, [running, selRunId, onChanged])

  const loadRun = useCallback(async (id: string) => {
    setErr('')
    const r = await fetchRun(id).catch((e) => { setErr(String((e as Error).message || e)); return null })
    if (r) { setRun(r); setSelRunId(r.runId) } else if (!r) setErr('结果读取失败（可能已被清理，仅保留最近 10 份）')
  }, [])

  useEffect(() => { if (!running && !run) loadRun('latest') }, [running, run, loadRun])
  // 历史页指定 runId 进入
  useEffect(() => { if (openRunId) loadRun(openRunId) }, [openRunId, loadRun])

  const openCell = async (c: CellProj, full: boolean) => {
    if (!run) return
    if (!full) { setCellModal({ cell: c, full: false }); setDiffTarget(''); setDiffSegs(null); return }
    const r = await fetchCell(run.runId, c.cellId)
    if (r && r.cell) setCellModal({ cell: r.cell, vars: r.vars, full: true })
    else setCellModal({ cell: c, full: false })
  }

  const doDiff = async (otherCellId: string) => {
    if (!run || !cellModal) return
    setDiffTarget(otherCellId)
    setDiffSegs(null)
    const other = run.cells.find((c) => c.cellId === otherCellId)
    if (!other) return
    // 投影内容可能截断——拉全文再 diff
    const [a, b] = await Promise.all([
      fetchCell(run.runId, cellModal.cell.cellId),
      fetchCell(run.runId, otherCellId),
    ])
    const ta = (a && a.cell ? a.cell.content : cellModal.cell.content) || ''
    const tb = (b && b.cell ? b.cell.content : other.content) || ''
    setDiffSegs(core.textDiff(ta, tb))
  }

  const doAnnotate = async (c: CellProj, verdict: 'up' | 'down') => {
    if (!run) return
    const next = c.annotated === verdict ? null : verdict
    const okRes = await annotate(run.runId, c.cellId, next)
    if (okRes) {
      setRun((r) => r ? {
        ...r,
        cells: r.cells.map((x) => (x.cellId === c.cellId ? { ...x, annotated: next } : x)),
      } : r)
    } else setErr('标注写入失败')
  }

  const exportMd = () => {
    if (!run) return
    const d = run.def
    const lines: string[] = []
    lines.push(`# 提示词矩阵报告：${d.datasetName}`)
    lines.push('')
    lines.push(`- runId: \`${run.runId}\`｜状态 ${run.status}｜${run.startedAt ? run.startedAt.replace('T', ' ').slice(0, 16) : ''} 起`)
    lines.push(`- 变体：${d.variants.map((v) => v.name).join(' / ')}${d.judge ? `｜judge：${d.judge.profileName || d.judge.profileId}` : ''}`)
    lines.push(`- tokens：in ${run.cost.tokIn} / out ${run.cost.tokOut}${run.cost.est != null ? `｜估算 $${run.cost.est}` : ''}`)
    lines.push('')
    lines.push('| 变体 | 成功 | 检查全过 | judge 均分 | 均时 | tokens(in/out) |')
    lines.push('|---|---|---|---|---|---|')
    for (const v of run.aggregates.variants) {
      const name = d.variants[v.idx]?.name || `变体${v.idx + 1}`
      lines.push(`| ${name} | ${v.ok}/${v.total} | ${v.checkAllPass}${v.ok ? `/${v.ok}` : ''} | ${v.judgeAvg != null ? `${v.judgeAvg}(${v.judgeN}格)` : '—'} | ${fmtMs(v.avgMs)} | ${v.tokIn}/${v.tokOut} |`)
    }
    lines.push('')
    lines.push('## 矩阵明细')
    run.sampleSummaries.forEach((s, si) => {
      lines.push('')
      lines.push(`### 样本 ${si + 1}：${s.label}`)
      for (const v of d.variants) {
        const c = run.cells.find((x) => x.sampleIdx === si && x.variantIdx === v.idx)
        lines.push('')
        lines.push(`**${v.name}**：${c ? (c.ok ? `✓ ${fmtMs(c.ms)}${c.judge ? `｜judge ${c.judge.score}/10` : ''}` : `✗ ${(c.error && c.error.cn) || '失败'}`) : '—'}`)
        if (c && c.ok) lines.push('', '```', c.content || '(空输出)', '```')
      }
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `prompt-matrix-${run.runId}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sendSummary = async () => {
    if (!run || !onSendToChat) return
    const d = run.def
    const t = run.aggregates.totals
    const vLines = run.aggregates.variants.map((v) => {
      const name = d.variants[v.idx]?.name || `变体${v.idx + 1}`
      return `- ${name}：${v.ok}/${v.total} 成功${v.judgeAvg != null ? `，judge 均 ${v.judgeAvg}/10` : ''}，均时 ${fmtMs(v.avgMs)}`
    })
    const msg = `【提示词矩阵台】运行 ${run.runId}（数据集：${d.datasetName}）结果汇总：${t.ok}/${t.cells} 格成功，tokens in/out ${run.cost.tokIn}/${run.cost.tokOut}。按变体：\n${vLines.join('\n')}`
    await onSendToChat(msg)
  }

  if (running) {
    const pct = running.total ? Math.round(((running.done + running.judgeDone) / (running.total + running.judgeTotal)) * 100) : 0
    return (
      <div className="pm-empty">
        矩阵执行中：{running.phase === 'judge' ? `LLM 评判 ${running.judgeDone}/${running.judgeTotal}` : `${running.done}/${running.total} 格`}
        <div className="pm-prog-bar" style={{ margin: '12px auto', maxWidth: 420 }}><div className="pm-prog-in" style={{ width: `${pct}%` }} /></div>
        数据集：{running.datasetName}｜已 {Math.round(running.elapsedMs / 1000)}s
      </div>
    )
  }

  const agg = run?.aggregates
  const variants = run?.def.variants || []

  return (
    <div>
      <div className="pm-sec"><span className="pm-bar" />运行结果{run ? <span className="pm-hint">{run.def.datasetName}｜{run.status === 'aborted' ? '已中止' : run.status === 'error' ? '出错' : '完成'}｜{String(run.startedAt || '').replace('T', ' ').slice(0, 16)}</span> : null}</div>
      {err ? <div className="pm-err">{err}</div> : null}
      {!run ? (
        <div className="pm-empty">还没有结果。去「运行」页发起一次矩阵，或从「历史」页读旧结果。</div>
      ) : (
        <>
          <div className="pm-card"><div className="pm-card-b">
            <div className="pm-row" style={{ marginBottom: 8 }}>
              <span className="pm-kv">格子 <b>{agg?.totals.ok ?? 0}</b>/{agg?.totals.cells ?? 0}{agg?.totals.failed ? <span style={{ color: '#F85149' }}>（失败 {agg.totals.failed}）</span> : null}</span>
              <span className="pm-kv">tokens <b>{run.cost.tokIn}</b>/<b>{run.cost.tokOut}</b></span>
              {run.cost.est != null ? <span className="pm-kv">估算 <b>${run.cost.est}</b></span> : null}
              {run.def.judge ? <span className="pm-tag">judge：{run.def.judge.profileName || run.def.judge.profileId}</span> : null}
              {!run.fileSaved ? <span className="pm-pill warn">结果文件未落盘（全文详情不可用）</span> : null}
              <span style={{ flex: 1 }} />
              <button className="pm-btn ghost sm" onClick={exportMd}>导出 Markdown</button>
              {onSendToChat ? <button className="pm-btn ghost sm" onClick={sendSummary}>发汇总到聊天</button> : null}
            </div>
            <table className="pm-tbl">
              <thead><tr><th>变体</th><th>成功</th><th>检查全过</th><th>judge</th><th>均时</th><th>tok in/out</th></tr></thead>
              <tbody>
                {(agg?.variants || []).map((v) => (
                  <tr key={v.idx}>
                    <td><b>{variants[v.idx]?.name || `变体${v.idx + 1}`}</b></td>
                    <td>{v.ok}/{v.total}{v.failed ? <span style={{ color: '#F85149' }}>（✗{v.failed}）</span> : null}</td>
                    <td>{v.checkAllPass}{v.ok ? `/${v.ok}` : ''}</td>
                    <td>{v.judgeAvg != null ? <b>{v.judgeAvg}</b> : '—'}</td>
                    <td>{fmtMs(v.avgMs)}</td>
                    <td>{v.tokIn}/{v.tokOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>

          <div className="pm-sec"><span className="pm-bar" />矩阵（行=样本，列=变体）<span className="pm-hint">点格子看全文/检查/judge/diff</span></div>
          <div className="pm-card"><div className="pm-card-b" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="pm-tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>样本</th>
                  {variants.map((v) => <th key={v.idx} style={{ minWidth: 180 }}>{v.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {run.sampleSummaries.map((s, si) => (
                  <tr key={si}>
                    <td className="pm-sub" style={{ maxWidth: 200, wordBreak: 'break-all' }}>{s.label}{s.checks.length ? <span className="pm-tag" style={{ marginLeft: 4 }}>检查×{s.checks.length}</span> : null}</td>
                    {variants.map((v) => {
                      const c = run.cells.find((x) => x.sampleIdx === si && x.variantIdx === v.idx)
                      if (!c) return <td key={v.idx}>—</td>
                      return (
                        <td key={v.idx}>
                          {statusPill(c)}
                          <button className="pm-cellbtn" style={{ marginTop: 4 }} title="查看详情"
                            onClick={() => openCell(c, true)}>
                            {(c.content || (c.error && c.error.hint) || '').slice(0, 90) || '（空）'}{c.truncated ? '…' : ''}
                          </button>
                          <div className="pm-sub">{c.ok ? `${fmtMs(c.ms)}${c.attempts && c.attempts > 1 ? ` · 重试${c.attempts - 1}` : ''}` : ''}</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </>
      )}

      {cellModal ? (
        <div className="pm-modal-bg" onClick={() => setCellModal(null)}>
          <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-h">
              格子 {cellModal.cell.cellId}
              {statusPill(cellModal.cell)}
              <span className="pm-sub">{fmtMs(cellModal.cell.ms)}{cellModal.cell.attempts && cellModal.cell.attempts > 1 ? ` · 重试${cellModal.cell.attempts - 1} 次` : ''}</span>
              <button className="pm-x" onClick={() => setCellModal(null)}>✕</button>
            </div>
            <div className="pm-modal-b">
              {cellModal.cell.templateWarnings && cellModal.cell.templateWarnings.length ? (
                <div className="pm-warn" style={{ padding: '0 0 8px' }}>模板警告：{cellModal.cell.templateWarnings.join('；')}</div>
              ) : null}
              {cellModal.cell.error ? (
                <div className="pm-err" style={{ padding: '0 0 8px' }}>
                  ✗ {cellModal.cell.error.cn}（{cellModal.cell.error.code}）｜{cellModal.cell.error.hint}
                </div>
              ) : null}
              {(cellModal.cell.checks || []).length ? (
                <div style={{ marginBottom: 9 }}>
                  {(cellModal.cell.checks || []).map((ck, i) => (
                    <div key={i} className="pm-sub" style={{ marginBottom: 3 }}>
                      {ck.pass ? '✅' : '❌'} <b style={{ color: '#E6EAF2' }}>{ck.label || ck.type}</b>：{ck.detail}
                    </div>
                  ))}
                </div>
              ) : null}
              {cellModal.cell.judge ? (
                <div style={{ marginBottom: 9 }}>
                  <span className="pm-pill info">judge {cellModal.cell.judge.score}/10</span>
                  <span className="pm-sub" style={{ marginLeft: 7 }}>{cellModal.cell.judge.reason}</span>
                </div>
              ) : null}
              {cellModal.cell.judgeError ? <div className="pm-warn" style={{ padding: '0 0 8px' }}>judge 失败：{cellModal.cell.judgeError}</div> : null}
              {cellModal.cell.usage ? (
                <div className="pm-sub" style={{ marginBottom: 6 }}>tokens：in {cellModal.cell.usage.prompt_tokens ?? '?'} / out {cellModal.cell.usage.completion_tokens ?? '?'}{cellModal.cell.finishReason ? `｜finish=${cellModal.cell.finishReason}` : ''}</div>
              ) : null}
              <pre className="pm-pre">{cellModal.cell.content || (cellModal.cell.ok ? '（空输出）' : '（无输出——见错误信息）')}</pre>
              {cellModal.cell.truncated ? <div className="pm-sub" style={{ padding: '5px 0' }}>（展示已截断，全文见导出/落盘文件）</div> : null}
              <div className="pm-row" style={{ marginTop: 10 }}>
                <button className={`pm-btn sm ${cellModal.cell.annotated === 'up' ? 'green' : 'ghost'}`}
                  onClick={() => doAnnotate(cellModal.cell, 'up')}>👍 好</button>
                <button className={`pm-btn sm ${cellModal.cell.annotated === 'down' ? 'danger' : 'ghost'}`}
                  onClick={() => doAnnotate(cellModal.cell, 'down')}>👎 差</button>
                {run && run.def.variants.length > 1 ? (
                  <>
                    <span className="pm-sub">对比（字级 diff）→</span>
                    <select className="pm-sel" value={diffTarget} onChange={(e) => doDiff(e.target.value)}>
                      <option value="">选同样本另一变体</option>
                      {run.def.variants.filter((v) => v.idx !== cellModal.cell.variantIdx).map((v) => (
                        <option key={v.idx} value={`r${cellModal.cell.sampleIdx}c${v.idx}`}>{v.name}</option>
                      ))}
                    </select>
                  </>
                ) : null}
              </div>
              {diffSegs ? (
                <div style={{ marginTop: 9 }}>
                  <div className="pm-sub" style={{ marginBottom: 5 }}>
                    与「{run?.def.variants.find((v) => `r${cellModal.cell.sampleIdx}c${v.idx}` === diffTarget)?.name}」对比（<span className="pm-diff-del" style={{ padding: '0 3px' }}>本格独有</span> / <span className="pm-diff-add" style={{ padding: '0 3px' }}>对方独有</span>）：
                  </div>
                  <pre className="pm-pre" style={{ maxHeight: 260 }}>
                    {diffSegs.map((seg, i) => (
                      <span key={i} className={seg.t === 'same' ? 'pm-diff-same' : seg.t === 'del' ? 'pm-diff-del' : 'pm-diff-add'}>{seg.s}</span>
                    ))}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
