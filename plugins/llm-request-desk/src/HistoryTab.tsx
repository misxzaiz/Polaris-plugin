/**
 * HistoryTab.tsx —— 请求历史：列表 / 详情回读 / 双请求对比
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { HistoryEntry, ReqRecord } from './model'
import { loadReq, normalizeHistory, fmtTime, fmtMs, sendCommand } from './model'
import ResponseView, { statusColor } from './ResponseView'

const S: Record<string, CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th: { textAlign: 'left', color: '#8B949E', fontWeight: 500, padding: '4px 8px', borderBottom: '1px solid #30363D' },
  td: { padding: '5px 8px', borderBottom: '1px solid #21262D', color: '#C9D1D9' },
  btn: {
    background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6,
    padding: '4px 10px', fontSize: 12, cursor: 'pointer',
  },
  muted: { color: '#8B949E', fontSize: 12 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  title: { fontWeight: 600, fontSize: 13, margin: '14px 0 8px' },
  cellBox: { flex: 1, minWidth: 280, border: '1px solid #30363D', borderRadius: 8, padding: 10, background: 'rgba(110,118,129,0.08)' },
}

interface Props {
  history: HistoryEntry[]
  onOpenRequest: (record: ReqRecord) => void
}

export default function HistoryTab({ history, onOpenRequest }: Props) {
  const rows = normalizeHistory(history)
  const [detail, setDetail] = useState<ReqRecord | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  async function open(reqId: string) {
    setBusy(reqId); setErr('')
    try {
      const r = await loadReq(reqId)
      if (r) setDetail(r)
      else setErr(`记录 ${reqId} 已被清理（保留最近 30 条完整记录）`)
    } finally { setBusy('') }
  }

  function toggleCompare(reqId: string) {
    setCompare((c) => (c.includes(reqId) ? c.filter((x) => x !== reqId) : [...c.slice(-1), reqId]))
  }

  const [left, right] = compare

  return (
    <div>
      {rows.length === 0 ? <div style={S.muted}>暂无请求历史。到「请求」页发一次。</div> : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}></th>
              <th style={S.th}>时间</th>
              <th style={S.th}>端点</th>
              <th style={S.th}>模型</th>
              <th style={S.th}>状态</th>
              <th style={S.th}>耗时</th>
              <th style={S.th}>TTFT</th>
              <th style={S.th}>首条诊断</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.reqId} style={{ cursor: 'pointer' }} onClick={() => open(x.reqId)}>
                <td style={S.td}>
                  <input
                    type="checkbox"
                    checked={compare.includes(x.reqId)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleCompare(x.reqId)}
                    title="勾选两条做对比"
                  />
                </td>
                <td style={S.td}>{fmtTime(x.at)}</td>
                <td style={S.td}>{x.endpointName}</td>
                <td style={S.td}>{x.model || '—'}</td>
                <td style={{ ...S.td, color: x.ok ? '#3FB950' : '#F85149', fontWeight: 600 }}>
                  {x.status || 'ERR'}
                </td>
                <td style={S.td}>{fmtMs(x.ms)}</td>
                <td style={S.td}>{x.ttftMs != null ? fmtMs(x.ttftMs) : '—'}</td>
                <td style={S.td}>{x.firstFinding || '—'}</td>
                <td style={S.td}>
                  <button onClick={(e) => { e.stopPropagation(); open(x.reqId) }} style={S.btn}>
                    {busy === x.reqId ? '…' : '详情'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {err ? <div style={{ color: '#FFA198', fontSize: 12, marginTop: 8 }}>{err}</div> : null}
      {compare.length === 1 ? <div style={{ ...S.muted, marginTop: 8 }}>已选 1 条，再勾 1 条即可对比。</div> : null}

      {left && right ? <CompareView key={`${left}|${right}`} leftId={left} rightId={right} onClose={() => setCompare([])} /> : null}

      {detail ? (
        <div>
          <div style={S.title}>请求详情（{detail.reqId}）</div>
          <div style={S.row} >
            <button
              onClick={() => onOpenRequest(detail)}
              style={S.btn}
              title="把该请求体载入到「请求」页的原始 JSON 模式继续调试"
            >
              ↥ 载入请求页继续调试
            </button>
            <button onClick={async () => { await sendCommand('cancel', {}, 5000).catch(() => undefined); }} style={{ ...S.btn, display: 'none' }}>x</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <ResponseView record={detail} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 双请求对比：并排渲染两条记录的关键差异行 */
function CompareView({ leftId, rightId, onClose }: { leftId: string; rightId: string; onClose: () => void }) {
  const [pair, setPair] = useState<{ l: ReqRecord | null; r: ReqRecord | null } | null>(null)
  const [err, setErr] = useState('')
  if (!pair && !err) {
    // 首次渲染触发加载（对比是低频操作，不做复杂 effect 状态机）
    Promise.all([loadReq(leftId), loadReq(rightId)])
      .then(([l, r]) => setPair({ l, r }))
      .catch((e) => setErr(String((e as Error).message)))
  }
  if (err) return <div style={{ color: '#FFA198', fontSize: 12, marginTop: 8 }}>对比加载失败：{err}</div>
  if (!pair || !pair.l || !pair.r) return <div style={{ ...S.muted, marginTop: 8 }}>对比加载中…</div>
  const { l, r } = pair

  const diffRows: [string, string, string][] = [
    ['HTTP', String(l.status || (l.error ? 'ERR' : '?')), String(r.status || (r.error ? 'ERR' : '?'))],
    ['耗时', fmtMs(l.ms), fmtMs(r.ms)],
    ['TTFT', l.streamInfo ? fmtMs(l.streamInfo.ttftMs) : '—', r.streamInfo ? fmtMs(r.streamInfo.ttftMs) : '—'],
    ['终止', l.streamInfo ? String(l.streamInfo.finishReason || '无') : '—', r.streamInfo ? String(r.streamInfo.finishReason || '无') : '—'],
    ['正文', (l.streamInfo ? l.streamInfo.text : l.content || l.parsedError?.message || l.error || '').slice(0, 120) || '—',
      (r.streamInfo ? r.streamInfo.text : r.content || r.parsedError?.message || r.error || '').slice(0, 120) || '—'],
    ['请求体', JSON.stringify(l.body), JSON.stringify(r.body)],
  ]

  return (
    <div style={{ marginTop: 14 }}>
      <div style={S.row}>
        <div style={S.title}>对比</div>
        <button onClick={onClose} style={S.btn}>关闭对比</button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[l, r].map((rec, i) => (
          <div key={i} style={S.cellBox}>
            <div style={{ fontWeight: 600, color: statusColor(rec), fontSize: 13 }}>
              {i === 0 ? 'A' : 'B'} · {rec.endpoint.name} · HTTP {rec.status || 'ERR'}
            </div>
            <div style={{ ...S.muted, marginTop: 4 }}>{rec.at.replace('T', ' ').slice(5, 19)} · {fmtMs(rec.ms)}</div>
          </div>
        ))}
      </div>
      <table style={{ ...S.table, marginTop: 8 }}>
        <tbody>
          {diffRows.map(([k, a, b]) => (
            <tr key={k}>
              <td style={{ ...S.td, color: '#8B949E', width: 70 }}>{k}</td>
              <td style={{ ...S.td, fontFamily: k === '请求体' ? 'Consolas, monospace' : undefined, wordBreak: 'break-all', background: a !== b ? 'rgba(210,153,34,0.08)' : undefined }}>{a}</td>
              <td style={{ ...S.td, fontFamily: k === '请求体' ? 'Consolas, monospace' : undefined, wordBreak: 'break-all', background: a !== b ? 'rgba(210,153,34,0.08)' : undefined }}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        <div style={{ ...S.muted, marginBottom: 4 }}>A 诊断</div>
        <ResponseView record={{ ...l, body: {}, maskedHeaders: {}, timeline: [] }} showBody={false} />
        <div style={{ ...S.muted, margin: '8px 0 4px' }}>B 诊断</div>
        <ResponseView record={{ ...r, body: {}, maskedHeaders: {}, timeline: [] }} showBody={false} />
      </div>
    </div>
  )
}
