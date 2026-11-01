/**
 * 历史 Tab：识别任务历史（新→旧）；点击加载完整报告到下方
 */
import { useCallback, useState } from 'react'
import { loadReport, fmtDuration, baseName, type HistoryEntry, type OcrReport } from './model'

interface Props {
  history: HistoryEntry[]
  onOpenReport: (r: OcrReport) => void
  onRefresh: () => Promise<void>
}

export default function HistoryTab({ history, onOpenReport, onRefresh }: Props) {
  const [openRunId, setOpenRunId] = useState('')
  const [detail, setDetail] = useState<OcrReport | null>(null)
  const [err, setErr] = useState('')

  const open = useCallback(async (h: HistoryEntry) => {
    setErr('')
    const rep = await loadReport(h.runId)
    if (!rep) { setErr('报告不存在或已被清理（保留最近 20 份完整报告）'); return }
    setDetail(rep)
    setOpenRunId(h.runId)
    onOpenReport(rep)
    onRefresh()
  }, [onOpenReport, onRefresh])

  return (
    <div>
      <div className="ob-sec"><span className="ob-bar" />识别历史
        <span className="ob-hint">报告落 kv，手机/Web 可读</span>
      </div>
      {err && <div className="ob-card"><div className="ob-card-b ob-err">✗ {err}</div></div>}
      <div className="ob-card">
        {history.length ? history.map((h) => (
          <div
            key={h.runId}
            className="ob-row"
            style={{ cursor: 'pointer', background: openRunId === h.runId ? '#12151c' : undefined }}
            onClick={() => open(h)}
          >
            <div className="ob-row-h">
              <span className={`ob-badge ${h.aborted ? 'warn' : h.failFiles ? 'warn' : 'good'}`}>{h.aborted ? '已中止' : `✓${h.okFiles} ✗${h.failFiles}`}</span>
              <b style={{ fontSize: 12 }}>{h.files} 文件 · {h.totalChars} 字</b>
              <span className="ob-tag">{h.langs ? h.langs.join('+') : ''}</span>
              <span className="ob-tag">{fmtDuration(h.durationMs)}</span>
              <span className="ob-muted" style={{ marginLeft: 'auto', fontSize: 10.5 }}>{new Date(h.at).toLocaleString('zh-CN')}</span>
            </div>
            <div className="ob-sub" style={{ marginTop: 3 }}>{h.sample ? baseName(h.sample) : ''}{h.files > 1 ? ` 等 ${h.files} 个` : ''} · {h.oneLine}</div>
          </div>
        )) : <div className="ob-empty">还没有历史记录。</div>}
      </div>
      {detail && (
        <div className="ob-card"><div className="ob-card-b">
          <div className="ob-row-h">
            <b style={{ fontSize: 12 }}>runId={detail.runId}</b>
            <span className="ob-tag">{detail.langs.join('+')}</span>
            <span className="ob-tag">psm {detail.psm}</span>
            {detail.outDir && <span className="ob-tag">导出 {baseName(detail.outDir)}/</span>}
          </div>
          {detail.files.map((f, i) => (
            <div key={i} className="ob-sub" style={{ marginTop: 4 }}>
              {f.ok ? '✓' : '✗'} <span className="ob-mono">{baseName(f.path)}</span> — {f.ok ? `${f.chars} 字${f.outFile ? ' · ' + baseName(f.outFile) : ''}` : (f.error || '失败')}
            </div>
          ))}
          <div className="ob-sub" style={{ marginTop: 6 }}>{detail.summary.oneLine}</div>
        </div></div>
      )}
    </div>
  )
}
