/**
 * 历史 Tab：回看任意一天已发布的日报
 *
 * 用 cap.kv list 枚举 news.daily.* 日期（倒序），点选日期加载当日日报展示，
 * 同「今日」的板块卡片样式。支持语音缓存标记。生产级：骨架屏 + 空态 + 错误重试。
 */
import { useState, useEffect } from 'react'
import { loadDaily, listDailyDates, loadDateKey, fmtCnDate, Daily } from './model'
import { Skeleton, ErrorState, EmptyState } from './Panel'

const DIR_ICON: Record<string, string> = {
  fund: '📈', tech: '🧠', news: '🔥', creative: '💡', learn: '🎓', summary: '📰',
}

export default function Archive() {
  const [dates, setDates] = useState<string[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [daily, setDaily] = useState<Daily | null>(null)
  const [voices, setVoices] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const loadDates = async () => {
    setLoading(true)
    setErr(null)
    try {
      const ds = await listDailyDates()
      setDates(ds)
      setSel((s) => s ?? ds[0] ?? null)
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadDates() }, [])

  useEffect(() => {
    if (!sel) { setDaily(null); return }
    setLoading(true)
    setErr(null)
    Promise.all([loadDaily(sel), loadDateKey(sel)])
      .then(([d, vk]) => {
        setDaily(d)
        setVoices(new Set(vk.map((k) => k.slice(`news.voice.${sel}.`.length))))
        setLoading(false)
      })
      .catch((e: any) => { setErr(e.message || String(e)); setLoading(false) })
  }, [sel])

  if (loading && !dates.length) return <Skeleton lines={4} />

  const sections = daily?.sections || []

  return (
    <div className="nc-page">
      <div className="nc-top">
        <div className="nc-logo" style={{ background: 'linear-gradient(135deg,#9B6CFF,#58A6FF)' }}>📚</div>
        <div className="nc-tt"><b>历史日报</b><small>{dates.length ? `已发布 ${dates.length} 天` : '还没有历史日报'}</small></div>
      </div>

      {err && <ErrorState msg={err} onRetry={sel ? () => loadDates() : undefined} />}

      {!err && !dates.length && <EmptyState icon="📚" title="暂无历史日报" desc="先在「今日」页生成日报，之后会出现在这里。" />}

      {/* 日期横向滚动选择 */}
      {!err && dates.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 12px', WebkitOverflowScrolling: 'touch' }}>
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => setSel(d)}
              className={`nc-st ${sel === d ? 'on' : ''}`}
              style={{ flexShrink: 0 }}
            >
              {d.slice(5)}
            </button>
          ))}
        </div>
      )}

      {!err && loading && sel && <Skeleton lines={3} />}

      {daily && !loading && !err && (
        <>
          <div className="nc-prog" style={{ marginTop: 2 }}>
            <div className="nc-prog-h">
              <b>{fmtCnDate(sel || '')}</b>
              <span className="nc-pct">{daily.totalMinutes ? `约 ${daily.totalMinutes} 分钟` : ''}</span>
            </div>
            {daily.summary && <div className="nc-sub" style={{ padding: 0, color: '#8B95A7' }}>{daily.summary}</div>}
          </div>

          {sections.map((s) => (
            <div key={s.type}>
              <div className="nc-sec">
                <span className="nc-bar" />
                {DIR_ICON[s.type] || '📄'} {s.title || s.type}
                <span className="nc-hint">{voices.has(s.type) ? '🎙️ 有语音' : s.items?.length ? `${s.items.length} 条` : ''}</span>
              </div>
              <div className="nc-feed">
                {(s.items || []).slice(0, 4).map((it, i) => (
                  <div key={i} className="nc-card">
                    <div className="nc-card-b">
                      <b>{it.title || it.name || ''}</b>
                      {it.meta?.badge && <span className="nc-badge" style={{ float: 'right' }}>{it.meta.badge}</span>}
                    </div>
                    {it.brief && <div className="nc-sub">{it.brief}</div>}
                    {it.meta?.src && <div className="nc-src"><span className="nc-badge">{it.meta.src}</span>{it.meta?.sub && <span>{it.meta.sub}</span>}</div>}
                  </div>
                ))}
                {(s.items || []).length > 4 && (
                  <div className="nc-card"><div className="nc-sub">… 共 {(s.items || []).length} 条</div></div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}