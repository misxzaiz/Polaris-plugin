/**
 * 语音 Tab：日报各章节播报列表（真实 TTS 播放）
 *
 * 工作流：
 *  - AI 已合成的章节：音频缓存在 cap.kv news.voice.<date>.<section>（dataUrl 或 url），
 *    面板读缓存后用真实 <audio> 播放（进度条来自 timeupdate 真实进度）。
 *  - 未合成的章节：点「生成」→ sendToChat（主应用 onSendToChat 桥）让 AI 用
 *    news_brief + mimo_tts_synthesize 合成，并调 news_save_voice 回写缓存；
 *    面板轮询缓存直到出现，自动开始播放。
 */
import { useState, useEffect, useRef } from 'react'
import { loadDaily, today, sendToChat, loadDateKey, loadVoice, VoiceClip, Daily, DailySection } from './model'
import { Skeleton, ErrorState, EmptyState } from './Panel'

export default function Voice() {
  const [daily, setDaily] = useState<Daily | null>(null)
  const [voices, setVoices] = useState<Record<string, VoiceClip | null>>({})
  const [playing, setPlaying] = useState<string | null>(null)   // 当前播放章节
  const [progress, setProgress] = useState<Record<string, { cur: number; dur: number }>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null) // 正在等待合成的章节
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const date = today()

  /** 加载日报 + 该日期所有已合成语音 */
  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const [d, voiceKeys] = await Promise.all([loadDaily(date), loadDateKey(date)])
      setDaily(d)
      // 逐个章节读缓存视频（只读该日期下有缓存的章节）
      const secs = (d?.sections || []).map((s) => s.type)
      const all = [...new Set(['summary', 'fund', 'tech', 'news', 'creative', 'learn', ...secs])]
      const map: Record<string, VoiceClip | null> = {}
      const present = new Set(voiceKeys.map((k) => k.slice(`news.voice.${date}.`.length)))
      for (const st of all) {
        if (!present.has(st)) continue
        const v = await loadVoice(date, st).catch(() => null)
        if (v) map[st] = v
      }
      setVoices(map)
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  const sections = daily?.sections || []
  const secs: DailySection[] = sections.length ? sections : [
    { type: 'summary', title: '今日速览', items: [] },
    { type: 'fund', title: '基金研判', items: [] },
    { type: 'tech', title: '技术讲解', items: [] },
    { type: 'news', title: '时事摘要', items: [] },
    { type: 'learn', title: '学习课程', items: [] },
  ]
  const SEC_ICON: Record<string, string> = { summary: '▶', fund: '📈', tech: '🧠', news: '🔥', creative: '💡', learn: '🎓' }

  const toastMsg = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  /** 轮询某章节语音缓存直到出现（AI 合成中） */
  const pollVoice = (section: string, dateStr: string, tries = 0) => {
    if (pollRef.current) clearTimeout(pollRef.current)
    if (tries > 40) { setGenerating(null); toastMsg('合成超时，可稍后点 ▶ 重试'); return }
    pollRef.current = setTimeout(async () => {
      const v = await loadVoice(dateStr, section).catch(() => null)
      if (v) {
        setVoices((prev) => ({ ...prev, [section]: v }))
        setGenerating(null)
        toastMsg('语音已生成，开始播放')
        playSection(section, v)
      } else {
        pollVoice(section, dateStr, tries + 1)
      }
    }, 2500)
  }

  const askVoice = (section: string, title: string) => {
    setGenerating(section)
    const msg = `帮我把今天日报的「${title}」章节生成语音播报：先用 news_brief 拿播报稿，再用 mimo_tts_synthesize 合成音频（用偏好里的音色；音频较大的话用 outputMode=file 拿托管 url），最后用 news_save_voice 把 dataUrl/url 存到缓存`
    sendToChat(msg)
    toastMsg('已请求 AI 合成语音…')
    pollVoice(section, date)
  }

  /** 真实播放一个音频（dataUrl 或托管 url） */
  const playSection = (section: string, clip: VoiceClip) => {
    if (!clip) return
    const src = clip.dataUrl || clip.url
    if (!src) { toastMsg('该章节音频缺失'); return }
    if (playing === section) {
      // 同一章节点击：暂停/继续
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause()
      else audioRef.current?.play()
      return
    }
    // 切到新章节：换 src 播放
    setPlaying(section)
    setTimeout(() => {
      const a = audioRef.current
      if (!a) return
      a.src = src
      a.onerror = () => { setPlaying(null); toastMsg('音频加载失败，可能是托管地址失效，可重新生成') }
      a.onended = () => { setPlaying(null); setProgress((p) => ({ ...p, [section]: { cur: 0, dur: 0 } })) }
      a.ontimeupdate = () => {
        if (a.duration) setProgress((p) => ({ ...p, [section]: { cur: a.currentTime, dur: a.duration } }))
      }
      void a.play().catch(() => { setPlaying(null); toastMsg('播放失败：音频不可用（可重新生成）') })
    }, 50)
  }

  const toggle = (section: string, clip: VoiceClip | null) => {
    if (!clip) return
    playSection(section, clip)
  }

  const fmt = (s: number | undefined) => {
    if (s == null || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60); const ss = Math.floor(s % 60)
    return `${m}:${String(ss).padStart(2, '0')}`
  }

  if (loading) return <Skeleton lines={5} />

  return (
    <div className="nc-page">
      <div className="nc-top">
        <div className="nc-logo" style={{ background: 'linear-gradient(135deg,#1F6FEB,#BC8CFF)' }}>🎙️</div>
        <div className="nc-tt"><b>今日语音播报</b><small>{daily?.totalMinutes ? `总时长约 ${Math.max(8, Math.round(daily.totalMinutes / 4))} 分钟 · 边走边听` : '选择章节生成语音'}</small></div>
        <button className="nc-play" style={{ width: 30, height: 30, fontSize: 13, boxShadow: 'none' }} onClick={load} title="刷新">⟳</button>
      </div>

      {err && <ErrorState msg={err} onRetry={load} />}

      {!err && !daily && (
        <EmptyState
          icon="🎙️"
          title="今天还没有日报"
          desc="先生成日报，再回来生成语音播报。"
          action={<button className="nc-btn" style={{ marginTop: 10 }} onClick={() => sendToChat('帮我生成今天的 AI 每日刊物日报')}>✦ 生成日报</button>}
        />
      )}

      {!err && daily && (
        <div className="nc-feed">
          {secs.map((s) => {
            const clip = voices[s.type] || null
            const pg = progress[s.type]
            const pct = pg && pg.dur ? Math.min(100, (pg.cur / pg.dur) * 100) : 0
            const hasAudio = !!clip
            return (
              <div key={s.type} className={`nc-voice ${playing === s.type ? 'playing' : ''}`}>
                <div className="nc-voice-h" onClick={() => hasAudio && toggle(s.type, clip)}>
                  <span className="nc-vic">{playing === s.type ? '❚❚' : hasAudio ? '▶' : SEC_ICON[s.type] || '▶'}</span>
                  <div className="nc-voice-t"><b>{s.title}</b><small>
                    {hasAudio ? `已合成${clip?.durationSec ? ` · ${fmt(clip.durationSec)}` : ''}${clip?.store === 'hosted' ? ' · 托管' : ''}`
                      : s.type === 'learn' ? '双线课程' : s.type === 'fund' ? '自选基金' : (s.items || []).length + ' 条'}
                  </small></div>
                  <span className="nc-voice-dur">{hasAudio ? (clip?.durationSec ? `⏱ ${fmt(clip.durationSec)}` : '可播放') : '未合成'}</span>
                  {!hasAudio && (
                    <button className="nc-btn sm ghost" disabled={generating === s.type} onClick={(e) => { e.stopPropagation(); askVoice(s.type, s.title) }}>
                      {generating === s.type ? '合成中…' : '✦ 生成'}
                    </button>
                  )}
                  {hasAudio && playing === s.type && <span className="nc-voice-dur">{fmt(pg?.cur)} / {fmt(pg?.dur)}</span>}
                </div>
                <div className="nc-voice-prog"><i style={{ width: `${playing === s.type ? pct : hasAudio ? 100 : 0}%` }} /></div>
              </div>
            )
          })}
        </div>
      )}

      {/* 真实音频播放器（隐藏，进度/播放状态由 UI 反映） */}
      <audio ref={audioRef} preload="none" />

      <div className="nc-tip" style={{ padding: '4px 16px', fontSize: 11, color: '#5C6678' }}>
        💡 点有音频的章节即可播放；未合成的点「✦ 生成」，AI 会用 mimo_tts 合成并缓存（大音频托管、小音频内联，桌面/手机都能播）。
      </div>

      {toast && <div className="nc-toast">{toast}</div>}
    </div>
  )
}