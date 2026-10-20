/**
 * 今日 Tab：阅读进度 + 各板块卡片（基金/技术/时事/创意/学习入口）
 * 数据来自 cap.kv news.daily.<date>（AI 经 news_publish_daily 写入，面板只读）
 *
 * 生产级（v0.3.0）：
 *  - 骨架屏（加载）/ 错误态+重试 / 空态引导
 *  - 打卡幂等（同一天只计一次，不重复叠加）
 *  - 收藏按钮（写 news.progress.favorites，供 AI 学偏好回流）
 *  - 完读回流（读完一条 → recordReadComplete，进度条真实推进）
 *  - 响应式卡片（宽面板双列）
 */
import { useState, useEffect } from 'react'
import {
  loadDaily, loadProgress, checkinOnce, recordReadComplete, toggleFavorite,
  today, yesterday, fmtCnDate, fmtMin, sendToChat, Daily, Progress,
} from './model'
import { Skeleton, ErrorState, EmptyState } from './Panel'

const DIR_ICON: Record<string, string> = {
  fund: '📈', tech: '🧠', news: '🔥', creative: '💡', learn: '🎓',
}
const DIR_LABEL: Record<string, string> = {
  fund: '基金', tech: '技术', news: '时事', creative: '创意', learn: '学习',
}

export default function Today({ goTab }: { goTab: (i: number) => void }) {
  const [daily, setDaily] = useState<Daily | null>(null)
  const [dateLabel, setDateLabel] = useState('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // 加载：今天 → 回退昨天
  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      let d: Daily | null = await loadDaily(today())
      let label = fmtCnDate(today())
      if (!d) {
        d = await loadDaily(yesterday())
        label = `${fmtCnDate(yesterday())}（昨日）`
      }
      setDaily(d)
      setDateLabel(label)
      const p = await loadProgress()
      setProgress(p)
      if (!d) setErr(null) // 空态由 EmptyState 处理，不阻塞页面
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const toastMsg = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200) }

  const checkin = async () => {
    try {
      const r = await checkinOnce()
      const p = await loadProgress()
      setProgress(p)
      toastMsg(r.already ? `✅ 今天已打过卡，连续 ${r.streak} 天` : `✅ 打卡成功，连续 ${r.streak} 天`)
    } catch (e: any) {
      toastMsg(`打卡失败：${e.message}`)
    }
  }

  /** 完读回流：进度条 +1 分钟锚点，同时打卡（幂等） */
  const markRead = async (sec: string) => {
    try {
      const p = await recordReadComplete(today())
      setProgress(p)
      toastMsg(`已读 ${p.minutesToday} 分钟，AI 已记录你的阅读`)
    } catch (e: any) {
      toastMsg(`记录失败：${e.message}`)
    }
  }

  /** 收藏一条（幂等切换） */
  const favItem = async (id: string) => {
    if (!id) return
    try {
      const r = await toggleFavorite(id, today())
      toastMsg(r.fav ? '⭐ 已收藏（AI 会学习你的偏好）' : '已取消收藏')
    } catch (e: any) {
      toastMsg(`收藏失败：${e.message}`)
    }
  }

  const askGenerate = () => {
    sendToChat('帮我生成今天的 AI 每日刊物日报（基金/技术/时事/创意，按我的偏好来）')
  }

  const sections = daily?.sections || []
  const sec = (t: string) => sections.find((s) => s.type === t)

  const favSet = new Set(progress?.favorites || [])
  const totalMin = daily?.totalMinutes || 90
  const pct = progress?.minutesToday != null && totalMin > 0
    ? Math.min(100, Math.round((progress.minutesToday / totalMin) * 100))
    : 0

  // 骨架屏
  if (loading) return <Skeleton lines={5} />

  return (
    <div className="nc-page">
      <div className="nc-top">
        <div className="nc-logo">📰</div>
        <div className="nc-tt">
          <b>AI 每日刊物</b>
          <small>{dateLabel || fmtCnDate(today())}{daily?.totalMinutes ? ` · 约 ${daily.totalMinutes} 分钟` : ''}</small>
        </div>
        <button className="nc-play" onClick={askGenerate} title="生成今天的日报">✦</button>
        <button className="nc-play" style={{ width: 30, height: 30, fontSize: 13, boxShadow: 'none' }} onClick={load} title="刷新">⟳</button>
      </div>

      {/* 空态引导 */}
      {!daily && !err && (
        <EmptyState
          icon="📰"
          title="今天还没有日报"
          desc="AI 会用内置浏览器抓取基金/技术/时事/创意，按你的偏好生成。"
          action={<button className="nc-btn" onClick={askGenerate}>✦ 生成今天的日报</button>}
        />
      )}

      {/* 错误态 */}
      {err && <ErrorState msg={err} onRetry={load} hint="检查宿主是否在运行，或稍后重试" />}

      {daily && !err && (
        <>
          {/* 阅读进度 */}
          <div className="nc-prog">
            <div className="nc-prog-h">
              <b>今日阅读进度</b>
              <span className="nc-pct">{progress?.minutesToday ? `${pct}%` : '未开始'}</span>
            </div>
            <div className="nc-track"><i style={{ width: progress?.minutesToday ? `${pct}%` : '4%' }} /></div>
            <div className="nc-labels">
              <span>{progress?.minutesToday ? `已读 ${progress.minutesToday} 分钟` : '今日未读'}</span>
              <span>目标 {fmtMin(daily?.totalMinutes)}</span>
              <span>剩 {Math.max(0, (daily?.totalMinutes || 90) - (progress?.minutesToday || 0))} 分钟</span>
            </div>
            <div className="nc-row" style={{ marginTop: 8, gap: 8 }}>
              <button className="nc-btn ghost" onClick={checkin} disabled={(progress?.checkinDates || []).includes(today())}>
                {(progress?.checkinDates || []).includes(today()) ? '✅ 今日已打卡' : `🔥 打卡（连 ${progress?.streak || 0} 天）`}
              </button>
              <button className="nc-btn ghost" onClick={() => markRead('all')}>✅ 读完今天</button>
              <button className="nc-btn ghost" onClick={() => goTab(2)}>🎙️ 语音</button>
              <button className="nc-btn ghost" onClick={() => goTab(1)}>🎓 学习</button>
            </div>
          </div>

          {sections.map((s) => (
            <div key={s.type}>
              <div className="nc-sec">
                <span className="nc-bar" />
                {DIR_ICON[s.type] || '📄'} {s.title || DIR_LABEL[s.type] || s.type}
                <span className="nc-hint">{s.meta?.minutes ? `${s.meta.minutes} 分钟` : `${(s.items || []).length} 条`}</span>
              </div>
              <div className="nc-feed">
                {(s.items || []).slice(0, s.type === 'fund' ? 3 : s.type === 'news' ? 3 : 4).map((it, i) => {
                  const id = it.id || `${s.type}-${i}-${it.title || it.name || i}`
                  return (
                    <div key={id} className="nc-card">
                      <div className="nc-card-b">
                        <button
                          className={`nc-fav ${favSet.has(id) ? 'on' : ''}`}
                          onClick={() => favItem(id)}
                          title={favSet.has(id) ? '取消收藏' : '收藏（AI 会学你的偏好）'}
                          style={{ float: 'right' }}
                        >
                          {favSet.has(id) ? '★' : '☆'}
                        </button>
                        <b>{it.title || it.name || ''}</b>
                        {it.meta?.badge && <span className="nc-badge" style={{ float: 'right', marginRight: 4 }}>{it.meta.badge}</span>}
                        {it.meta?.chg != null && (
                          <span className={it.meta.chg >= 0 ? 'nc-up' : 'nc-down'} style={{ float: 'right', marginRight: 4 }}>
                            {it.meta.chg >= 0 ? '+' : ''}{it.meta.chg}%
                          </span>
                        )}
                      </div>
                      {it.brief && <div className="nc-sub">{it.brief}</div>}
                      {it.meta?.src && <div className="nc-src"><span className="nc-badge">{it.meta.src}</span>{it.meta?.sub && <span>{it.meta.sub}</span>}</div>}
                    </div>
                  )
                })}
                {(s.items || []).length > 3 && (
                  <div className="nc-card"><div className="nc-sub">… 共 {(s.items || []).length} 条</div></div>
                )}
              </div>
            </div>
          ))}

          {/* 学习双线入口 */}
          <div className="nc-sec"><span className="nc-bar" style={{ background: 'linear-gradient(180deg,#BC8CFF,#58A6FF)' }} />🎓 今日学习 <span className="nc-hint">双线并行</span></div>
          <div className="nc-feed">
            <div className="nc-line" onClick={() => goTab(1)}>
              <div className="nc-line-h">
                <span className="nc-lic" style={{ background: 'linear-gradient(135deg,#1F6FEB,#3F8CFF)' }}>☕</span>
                <div className="nc-line-t"><b>专业成长 · Java + AI</b><small>第 2 阶段「Java 并发进阶」</small></div>
                <span className="nc-pct">L1→L2</span>
              </div>
              <div className="nc-line-track"><i style={{ width: '44%' }} /></div>
              <div className="nc-tags"><span>☕ JVM/并发</span><span>🛠 微服务</span><span>🤖 AI 工程: MCP/Agent</span><span>🧠 AI 教练</span></div>
            </div>
            <div className="nc-line" style={{ borderColor: 'rgba(188,140,255,.35)' }} onClick={() => goTab(1)}>
              <div className="nc-line-h">
                <span className="nc-lic" style={{ background: 'linear-gradient(135deg,#BC8CFF,#9B6CFF)' }}>🌍</span>
                <div className="nc-line-t"><b>通识漫游 · 广面知识</b><small>24 主题轮换 · 与今日时事强关联</small></div>
                <span className="nc-pct" style={{ color: '#BC8CFF' }}>7/24</span>
              </div>
              <div className="nc-line-track"><i style={{ width: '62%', background: 'linear-gradient(90deg,#BC8CFF,#58A6FF)' }} /></div>
              <div className="nc-tags"><span>📜 历史</span><span>💰 经济</span><span>🔬 科技</span><span>🧠 心理</span><span>❤️ 健康</span></div>
            </div>
          </div>
        </>
      )}

      {toast && <div className="nc-toast">{toast}</div>}
    </div>
  )
}