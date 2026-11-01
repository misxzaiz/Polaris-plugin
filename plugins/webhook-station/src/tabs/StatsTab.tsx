/**
 * 排查 Tab：最近 24h 逐小时柱状图（内联 SVG 零依赖）+ 状态/桶/Top 路径聚合
 * + AI 排查话术引导（AI 经 hook_recent/hook_get 直接分析留痕全文）。
 */
import { useMemo } from 'react'
import { aggregateStats } from '../../shared/core.js'
import type { PanelData } from '../Panel'

interface Props {
  data: PanelData
  onSendToChat?: (m: string) => void
}

const STATUS_COLOR: Record<string, string> = {
  '2xx': '#3fb950', '3xx': '#58a6ff', '4xx': '#d29922', '5xx': '#f85149', 其他: '#8b949e',
}

export default function StatsTab({ data, onSendToChat }: Props) {
  const stats = useMemo(() => aggregateStats(data.captures), [data.captures])
  const maxHour = Math.max(1, ...stats.byHour)
  const W = 480
  const H = 96
  const bw = W / 24

  const aiHints = [
    '看看最近的 webhook 回调，有没有失败或异常的',
    '分析最近这条支付回调的内容，验签字段都在吗',
    '总结今天收到的回调：哪个桶最多、有没有 5xx',
  ]

  if (!stats.total) {
    return (
      <div style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.8, padding: '8px 4px' }}>
        暂无捕获数据可排查。回调进来后，这里会出现 24h 分布、应答码分布、Top 路径，
        也可以直接让 AI 读留痕全文分析（数据不出本机）。
        {onSendToChat && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aiHints.map((h) => (
              <button key={h} onClick={() => void onSendToChat(h)} style={hintBtn}>{h}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={secTitle}>最近 24 小时（共 {stats.total} 条预览范围内）</div>
        <svg width="100%" viewBox={`0 0 ${W} ${H + 14}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          {stats.byHour.map((n, i) => {
            const h = n === 0 ? 0 : Math.max(3, (n / maxHour) * (H - 8))
            const x = i * bw + 2
            return (
              <g key={i}>
                <rect x={x} y={H - h} width={bw - 4} height={h} rx={2}
                  fill={n === 0 ? '#27272a' : i === 23 ? '#3b82f6' : '#58a6ff99'} />
                {n > 0 && (
                  <text x={x + (bw - 4) / 2} y={H - h - 3} fontSize={9} fill="#a1a1aa" textAnchor="middle">{n}</text>
                )}
              </g>
            )
          })}
          <text x={0} y={H + 12} fontSize={9} fill="#52525b">-23h</text>
          <text x={W / 2} y={H + 12} fontSize={9} fill="#52525b" textAnchor="middle">-12h</text>
          <text x={W} y={H + 12} fontSize={9} fill="#52525b" textAnchor="end">现在</text>
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={secTitle}>应答分布</div>
          {Object.entries(stats.byStatus).filter(([, n]) => n > 0).map(([k, n]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: STATUS_COLOR[k] || '#8b949e', fontWeight: 700, width: 36 }}>{k}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#27272a' }}>
                <div style={{ width: `${(n / stats.total) * 100}%`, height: '100%', borderRadius: 3, background: STATUS_COLOR[k] || '#8b949e' }} />
              </div>
              <span style={{ color: '#a1a1aa', width: 28, textAlign: 'right' }}>{n}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={secTitle}>按桶</div>
          {Object.entries(stats.byBucket).map(([k, n]) => (
            <div key={k} style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>
              {data.settings?.buckets.find((b) => b.id === k)?.name || k} <b style={{ color: '#e4e4e7' }}>{n}</b>
            </div>
          ))}
          <div style={secTitle}>方法</div>
          <div style={{ fontSize: 12, color: '#a1a1aa' }}>
            {Object.entries(stats.byMethod).map(([k, n]) => `${k}×${n}`).join('　')}
          </div>
        </div>
      </div>

      {stats.topPaths.length > 0 && (
        <div>
          <div style={secTitle}>Top 路径</div>
          {stats.topPaths.map((p) => (
            <div key={p.path} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#a1a1aa', marginBottom: 2 }}>
              <code style={{ color: '#e4e4e7', wordBreak: 'break-all' }}>{p.path}</code>
              <span>×{p.count}</span>
            </div>
          ))}
        </div>
      )}

      {onSendToChat && (
        <div>
          <div style={secTitle}>让 AI 排查（MCP 直读留痕全文，含密钥脱敏）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aiHints.map((h) => (
              <button key={h} onClick={() => void onSendToChat(h)} style={hintBtn}>{h}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: '#52525b' }}>
        统计基于面板预览（最近若干条）；全量在服务端留痕文件，AI 的 hook_search 可跨全量搜索。
      </div>
    </div>
  )
}

const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#e4e4e7', marginBottom: 6 }
const hintBtn: React.CSSProperties = {
  fontSize: 12, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', minHeight: 30,
  border: '1px solid #3f3f46', background: 'transparent', color: '#93c5fd',
}
