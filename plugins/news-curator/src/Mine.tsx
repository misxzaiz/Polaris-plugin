/**
 * 我的 Tab：用户写入区
 *  - 关注方向开关 / 基金自选池增删 / 学习计划
 *  - AI 改动日志（news_set_prefs 记录）+ 撤销
 * 全部经 cap.kv（news.prefs / news.prefsLog）持久化，与 AI 共享。
 */
import { useState, useEffect } from 'react'
import {
  loadPrefs, savePrefs, loadPrefsLog, loadProgress, loadReviews, today,
  saveProgress, Prefs, PrefsLogEntry, Progress, DEFAULT_WATCHLIST,
} from './model'

const DIRECTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'creative', label: '创意项目', icon: '💡' },
  { key: 'fund', label: '基金投资', icon: '📈' },
  { key: 'tech', label: 'AI 技术', icon: '🧠' },
  { key: 'news', label: '时事', icon: '🔥' },
  { key: 'learn', label: '学习（专业+通识）', icon: '🎓' },
]

export default function Mine() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [log, setLog] = useState<PrefsLogEntry[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [addCode, setAddCode] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const reload = async () => {
    try {
      const [p, l, prog] = await Promise.all([loadPrefs(), loadPrefsLog(), loadProgress()])
      setPrefs(p)
      setLog(l.filter((e) => !e.undone).slice(-8).reverse())
      setProgress(prog)
    } catch (e: any) {
      setToast(`加载失败：${e.message}`)
    }
  }
  useEffect(() => { reload() }, [])

  const toastMsg = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200) }

  const toggleDir = async (key: string) => {
    if (!prefs) return
    const next = { ...prefs, directions: { ...prefs.directions, [key]: !prefs.directions[key] } }
    setPrefs(next)
    await savePrefs(next)
    toastMsg(`已${next.directions[key] ? '开启' : '关闭'}「${DIRECTIONS.find((d) => d.key === key)?.label}」`)
  }

  const addFund = async () => {
    if (!prefs) return
    const c = addCode.trim()
    if (!/^\d{6}$/.test(c)) return toastMsg('请输入 6 位基金代码')
    if (prefs.watchlist.includes(c)) return toastMsg('已在自选池')
    const next = { ...prefs, watchlist: [...prefs.watchlist, c] }
    setPrefs(next)
    setAddCode('')
    await savePrefs(next)
    toastMsg(`已添加 ${c}`)
  }
  const removeFund = async (c: string) => {
    if (!prefs) return
    const next = { ...prefs, watchlist: prefs.watchlist.filter((x) => x !== c) }
    setPrefs(next)
    await savePrefs(next)
    toastMsg(`已移除 ${c}`)
  }
  const resetWatchlist = async () => {
    if (!prefs) return
    const next = { ...prefs, watchlist: DEFAULT_WATCHLIST }
    setPrefs(next)
    await savePrefs(next)
    toastMsg('已恢复默认 6 只实测池')
  }

  const setTarget = async (v: number) => {
    if (!prefs) return
    const next = { ...prefs, dailyTarget: v }
    setPrefs(next)
    await savePrefs(next)
    toastMsg(`每日目标 ${v} 分钟`)
  }

  const setVoice = async (voice: string) => {
    if (!prefs) return
    const next = { ...prefs, voice: { ...prefs.voice, voice } }
    setPrefs(next)
    await savePrefs(next)
    toastMsg(`音色：${voice}`)
  }

  const undo = async (ts: string) => {
    // 面板撤销：恢复默认后重放未被撤销的日志（AI 侧 news_undo_prefs 做同样的反相）
    try {
      // 简化：面板调用 MCP 语义不可行（面板无 MCP），直接重放逻辑
      // 这里用"删除该条并对方向做反相"的近似：重读全量日志 + 当前偏好反相该条
      const full = await loadPrefsLog()
      const entry = full.find((e) => e.ts === ts)
      if (!entry) return toastMsg('找不到该条改动')
      if (!prefs) return
      let what: Record<string, any> = {}
      try { what = JSON.parse(entry.what) } catch (_) { what = {} }
      const next = { ...prefs }
      for (const k of Object.keys(what)) {
        if (k === 'directions' && what.directions) {
          const dirs = { ...(prefs.directions || {}) }
          for (const dk of Object.keys(what.directions)) {
            if (dk in dirs) dirs[dk] = !what.directions[dk]
          }
          next.directions = dirs
        } else {
          delete next[k as keyof Prefs]
        }
      }
      setPrefs(next)
      await savePrefs(next)
      entry.undone = true
      await kvSetLog(full)
      toastMsg('已撤销该条 AI 改动')
      reload()
    } catch (e: any) {
      toastMsg(`撤销失败：${e.message}`)
    }
  }

  return (
    <div className="nc-page">
      <div className="nc-top">
        <div className="nc-logo" style={{ background: 'linear-gradient(135deg,#3FB950,#58A6FF)' }}>👤</div>
        <div className="nc-tt"><b>我的</b><small>偏好 · 基金池 · AI 改动日志</small></div>
      </div>

      {!prefs && <div className="nc-empty">加载中…</div>}
      {prefs && (
        <div className="nc-feed">
          {/* 关注方向 */}
          <div className="nc-card" style={{ padding: 13 }}>
            <div className="nc-card-h"><b>关注方向</b><span className="nc-hint">日报各板块权重</span></div>
            <div className="nc-dir-list">
              {DIRECTIONS.map((d) => (
                <button key={d.key} className={`nc-dir ${prefs.directions[d.key] ? 'on' : ''}`} onClick={() => toggleDir(d.key)}>
                  <span>{d.icon}</span>{d.label}
                  <span className="nc-dir-sw">{prefs.directions[d.key] ? '✓' : '✕'}</span>
                </button>
              ))}
            </div>
            <div className="nc-row" style={{ marginTop: 10 }}>
              <span className="nc-lbl">每日目标</span>
              {[60, 90, 120].map((v) => (
                <button key={v} className={`nc-btn sm ${prefs.dailyTarget === v ? '' : 'ghost'}`} onClick={() => setTarget(v)}>{v} 分</button>
              ))}
            </div>
            <div className="nc-row" style={{ marginTop: 8 }}>
              <span className="nc-lbl">语音音色</span>
              {['冰糖', '茉莉', '苏打', '白桦'].map((v) => (
                <button key={v} className={`nc-btn sm ${prefs.voice?.voice === v ? '' : 'ghost'}`} onClick={() => setVoice(v)}>{v}</button>
              ))}
            </div>
          </div>

          {/* 基金自选池 */}
          <div className="nc-card" style={{ padding: 13 }}>
            <div className="nc-card-h"><b>基金自选池</b><span className="nc-hint">AI 每日研判这些基金</span></div>
            <div className="nc-fund-list">
              {prefs.watchlist.map((c) => (
                <span key={c} className="nc-fund-chip">{c}<b onClick={() => removeFund(c)}>✕</b></span>
              ))}
              {!prefs.watchlist.length && <span className="nc-sub">空池：AI 将只按排行推送</span>}
            </div>
            <div className="nc-row" style={{ marginTop: 10 }}>
              <input className="nc-inp" placeholder="6 位基金代码" value={addCode} onChange={(e) => setAddCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFund()} />
              <button className="nc-btn ghost" onClick={addFund}>+ 添加</button>
              <button className="nc-btn ghost sm" onClick={resetWatchlist}>默认池</button>
            </div>
          </div>

          {/* 学习计划 */}
          <div className="nc-card" style={{ padding: 13 }}>
            <div className="nc-card-h"><b>学习计划</b><span className="nc-hint">双线骨架</span></div>
            <div className="nc-row" style={{ marginTop: 6 }}>
              <span className="nc-lbl">专业线</span>
              {['L1', 'L2', 'L3', 'L4'].map((v) => (
                <button key={v} className={`nc-btn sm ${prefs.learn?.proStage === v ? '' : 'ghost'}`} onClick={() => { if (prefs) { const n = { ...prefs, learn: { ...prefs.learn, proStage: v } }; setPrefs(n); savePrefs(n); toastMsg(`专业线阶段 ${v}`) } }}>{v}</button>
              ))}
            </div>
            <div className="nc-sub" style={{ marginTop: 6 }}>
              通识漫游：24 主题轮换 · 每周 {prefs.learn?.weeklyDays || 5} 天 · 已完成 {progress?.learned?.gen?.length || 0} 主题
            </div>
          </div>

          {/* AI 改动日志 + 撤销 */}
          <div className="nc-card" style={{ padding: 13 }}>
            <div className="nc-card-h"><b>AI 改动日志</b><span className="nc-hint">AI 回写偏好记录（可撤销）</span></div>
            {log.length === 0 ? (
              <div className="nc-sub">暂无 AI 改动。AI 发现你的阅读习惯变化时，会带 reason 回写并记在这里。</div>
            ) : (
              <div className="nc-log-list">
                {log.map((e) => (
                  <div key={e.ts} className="nc-log-item">
                    <div className="nc-log-main">
                      <b>{e.reason}</b>
                      <small>{new Date(e.ts).toLocaleString()} · {e.what}</small>
                    </div>
                    <button className="nc-btn sm ghost" onClick={() => undo(e.ts)}>撤销</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 学习档案 */}
          <div className="nc-card" style={{ padding: 13 }}>
            <div className="nc-card-h"><b>学习档案</b><span className="nc-hint">连续打卡 {progress?.streak || 0} 天</span></div>
            <div className="nc-sub">收藏 {progress?.favorites?.length || 0} 条 · 最近阅读 {progress?.lastRead || '—'} · 今日已读 {progress?.minutesToday || 0} 分钟</div>
          </div>
        </div>
      )}

      {toast && <div className="nc-toast">{toast}</div>}
    </div>
  )
}

/** 写回 prefsLog（撤销标记）——面板侧直接 kvSet */
async function kvSetLog(full: any[]) {
  const { kvSet } = await import('./model')
  await kvSet('news.prefsLog', full)
}
