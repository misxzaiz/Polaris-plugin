/**
 * 概览 Tab：考古统计 + 「今天挖出」+ 死链域名聚合 + 服务状态。
 */
import React from 'react'
import type { DigRecord, Meta } from './model'
import { core, fmtTime, statusColor, statusLabel, type Settings } from './model'

interface Props {
  records: DigRecord[]
  meta: Meta | null
  settings: Settings | null
  onResurface: (r: DigRecord) => void
  lastResurfaced: DigRecord | null
  onStartRecheckDead: () => void
  busy: boolean
}

const S = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  card: { padding: '12px 14px', borderRadius: 10, background: 'var(--p-panel, rgba(128,128,128,.08))' },
  num: { fontSize: 24, fontWeight: 700 },
  label: { fontSize: 12, color: 'var(--p-text-dim, #999)', marginTop: 2 },
  panel: { padding: '12px 14px', borderRadius: 10, background: 'var(--p-panel, rgba(128,128,128,.08))', marginBottom: 10 },
  bar: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', margin: '6px 0' },
  chip: { padding: '2px 10px', borderRadius: 999, fontSize: 11, background: 'var(--p-chip, rgba(128,128,128,.15))', marginRight: 6, display: 'inline-block', marginBottom: 4 },
  btn: { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 },
  btnAccent: { padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--p-accent, #4a7dff)', color: '#fff', cursor: 'pointer', fontSize: 13 },
  link: { color: 'var(--p-accent, #4a7dff)', textDecoration: 'none' },
}

export default function OverviewTab({ records, meta, settings, onResurface, lastResurfaced, onStartRecheckDead, busy }: Props) {
  const roll = React.useMemo(() => core.rollup(records), [records])
  const svcAlive = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1000)
  const total = Math.max(1, roll.total)
  const seg = (n: number) => `${(n / total) * 100}%`

  return (
    <div>
      <div style={S.cards}>
        <div style={S.card}><div style={S.num}>{roll.total}</div><div style={S.label}>书签总数</div></div>
        <div style={S.card}><div style={{ ...S.num, color: '#3aa76d' }}>{roll.alive}</div><div style={S.label}>存活</div></div>
        <div style={S.card}><div style={{ ...S.num, color: '#d9564a' }}>{roll.dead}</div><div style={S.label}>死链</div></div>
        <div style={S.card}><div style={{ ...S.num, color: '#9aa0a6' }}>{roll.pending}</div><div style={S.label}>待检查</div></div>
        <div style={S.card}><div style={{ ...S.num, color: roll.duplicates ? '#d9a13b' : '#9aa0a6' }}>{roll.duplicates}</div><div style={S.label}>重复</div></div>
      </div>

      <div style={{ height: 10 }} />
      <div style={S.panel}>
        <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)' }}>状态分布</div>
        <div style={S.bar}>
          {Object.entries(roll.byStatus).map(([s, n]) => (
            <div key={s} style={{ width: seg(n), background: statusColor(s) }} title={`${statusLabel(s)}: ${n}`} />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {Object.entries(roll.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <span key={s} style={{ ...S.chip, borderLeft: `3px solid ${statusColor(s)}` }}>{statusLabel(s)} {n}</span>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--p-text-dim, #999)' }}>分类 Top</div>
        <div>
          {roll.categories.slice(0, 8).map((c) => (
            <span key={c.name} style={S.chip}>{c.name} {c.count}</span>
          ))}
        </div>
      </div>

      <div style={S.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <strong>🎲 今天挖出</strong>
          <span style={{ flex: 1 }} />
          <button style={S.btnAccent} disabled={busy || !records.length} onClick={() => {
            const r = core.pickResurface(records, { avoidIds: lastResurfaced ? [lastResurfaced.id] : [] })
            if (r) onResurface(r)
          }}>挖一条</button>
        </div>
        {lastResurfaced ? (
          <div style={{ lineHeight: 1.8 }}>
            <div style={{ fontWeight: 600 }}>{lastResurfaced.title || lastResurfaced.host}</div>
            <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)' }}>
              {lastResurfaced.folder ? `${lastResurfaced.folder} · ` : ''}存于 {fmtTime(lastResurfaced.addedAt)} · 分类 {core.classifyUrl(lastResurfaced.url)}
            </div>
            <a href={lastResurfaced.url} target="_blank" rel="noreferrer" style={S.link}>{lastResurfaced.url}</a>
            <div style={{ marginTop: 4 }}><span style={S.chip}>已记录本次重访</span></div>
          </div>
        ) : (
          <div style={{ color: 'var(--p-text-dim, #999)', fontSize: 12 }}>
            从「活着的书签」按沉睡时长 × 书龄加权随机捞一条老书签重访——考古的意义不是清单，是重逢。
          </div>
        )}
      </div>

      {roll.topDeadDomains.length > 0 && (
        <div style={S.panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <strong>💀 死链重灾区</strong>
            <span style={{ flex: 1 }} />
            <button style={S.btn} disabled={busy} onClick={onStartRecheckDead}>重查死链（可能是暂时抽风）</button>
          </div>
          {roll.topDeadDomains.map((d) => (
            <div key={d.host} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12.5 }}>
              <span style={{ fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.host}</span>
              <span style={{ color: '#d9564a' }}>{d.count} 条</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)', padding: '4px 2px' }}>
        服务：{meta ? (svcAlive ? `运行中（桥 ${meta.bridge || '?'}${meta.degraded ? ' · 降级中' : ''}，库内 ${meta.records ?? '—'} 条）` : '心跳过期（可能已停止，去设置页启动）') : '尚无心跳'}
        {settings ? ` · 并发 ${settings.concurrency} / 超时 ${Math.round(settings.timeoutMs / 1000)}s / 批量 ${settings.batchSize}` : ''}
      </div>
    </div>
  )
}
