/**
 * 语音 Tab：日报各章节播报列表
 * 每段 = news_brief 生成的播报稿 → mimo_tts_synthesize 合成的音频（data URL 内联 <audio>）
 * P0：展示章节列表 + 播放控制；音频由 AI 生成时写入 daily.voice 缓存。
 */
import { useState, useEffect } from 'react'
import { loadDaily, today, sendToChat, Daily } from './model'

export default function Voice() {
  const [daily, setDaily] = useState<Daily | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    loadDaily(today()).then(setDaily).catch(() => {})
  }, [])

  const sections = daily?.sections || []
  const secs = sections.length ? sections : [
    { type: 'summary', title: '今日速览' },
    { type: 'fund', title: '基金研判' },
    { type: 'tech', title: '技术讲解' },
    { type: 'news', title: '时事摘要' },
    { type: 'learn', title: '学习课程' },
  ]
  const SEC_ICON: Record<string, string> = { summary: '▶', fund: '📈', tech: '🧠', news: '🔥', creative: '💡', learn: '🎓' }

  const askVoice = (t: string) => {
    setToast(`已请求播报「${t}」…（AI 合成中）`)
    sendToChat(`帮我把今天日报的「${t}」章节生成语音播报（用 news_brief + mimo_tts）`)
    setTimeout(() => setToast(null), 2200)
  }

  const toggle = (key: string) => setPlaying(playing === key ? null : key)

  return (
    <div className="nc-page">
      <div className="nc-top">
        <div className="nc-logo" style={{ background: 'linear-gradient(135deg,#1F6FEB,#BC8CFF)' }}>🎙️</div>
        <div className="nc-tt"><b>今日语音播报</b><small>{daily?.totalMinutes ? `总时长约 ${Math.max(8, Math.round(daily.totalMinutes / 4))} 分钟 · 边走边听` : '选择章节生成语音'}</small></div>
      </div>

      {!daily && <div className="nc-empty">今天还没有日报。先点「今日」页右上 ✦ 生成日报，再回来生成语音。</div>}

      <div className="nc-feed">
        {secs.map((s) => (
          <div key={s.type} className="nc-voice">
            <div className="nc-voice-h" onClick={() => toggle(s.type)}>
              <span className="nc-vic">{playing === s.type ? '❚❚' : SEC_ICON[s.type] || '▶'}</span>
              <div className="nc-voice-t"><b>{s.title}</b><small>{s.type === 'learn' ? '双线课程' : s.type === 'fund' ? '自选基金' : (s.items || []).length + ' 条'}</small></div>
              <span className="nc-voice-dur">{(s.items || []).length ? `${Math.max(1, Math.round((s.items.length * 1.2)))}:00` : '未合成'}</span>
              <button className="nc-btn sm ghost" onClick={(e) => { e.stopPropagation(); askVoice(s.title) }}>✦ 生成</button>
            </div>
            <div className="nc-voice-prog"><i style={{ width: playing === s.type ? '55%' : '0' }} /></div>
          </div>
        ))}
      </div>

      {/* 播放条（P0 占位：真实音频由 AI 合成后以 <audio> data URL 内联） */}
      {playing && (
        <div className="nc-player">
          <div className="nc-player-info"><b>{secs.find((s) => s.type === playing)?.title} · 播放中</b><div className="nc-player-bar"><i /></div></div>
          <span className="nc-player-ctrl" onClick={() => toggle(playing)}>⏸</span>
        </div>
      )}

      <div className="nc-tip" style={{ padding: '4px 16px', fontSize: 11, color: '#5C6678' }}>
        💡 P0 语音为「单章播报」：在对话里说"生成语音日报"或点章节 ✦，AI 会用 news_brief 转播报稿 + mimo_tts 合成（数据 URL 内联，不落盘）。
      </div>

      {toast && <div className="nc-toast">{toast}</div>}
    </div>
  )
}
