/**
 * 闪造应用作坊面板外壳：应用架 ↔ 详情抽屉 ↔ 沙箱运行 + 设置页。
 * 数据纪律：ff.apps 索引轮询（6s，仅 1 次 get）；成绩表 30s 慢轮询 + 详情按需。
 * 成绩落库统一走 Panel（运行覆盖层回调），player/device 来自设置与运行端 UA。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppGrid } from './AppGrid'
import { AppDetail } from './AppDetail'
import { AppRunner } from './AppRunner'
import { SettingsView } from './Settings'
import {
  addScore, loadApps, loadScores, loadSettings, loadVersionSource,
  type AppEntry, type ScoreEntry, type Settings,
} from './model'

interface Toast { id: number; text: string; bad?: boolean }

const IS_MOBILE = /Android|iPhone|iPad|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

export default function FlashForgePanel(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const { onSendToChat } = props
  const [tab, setTab] = useState<'grid' | 'settings'>('grid')
  const [apps, setApps] = useState<AppEntry[]>([])
  const [scores, setScores] = useState<Record<string, ScoreEntry[]>>({})
  const [settings, setSettings] = useState<Settings>({ nickname: '', deviceName: '' })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [runner, setRunner] = useState<{ app: AppEntry; html: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(1)

  const notify = useCallback((n: { text: string; bad?: boolean }) => {
    const id = toastSeq.current++
    setToasts((t) => [...t.slice(-2), { id, text: n.text, bad: n.bad }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), n.bad ? 4200 : 2800)
  }, [])

  const refreshApps = useCallback(async () => {
    try {
      const list = await loadApps()
      setApps(list)
      setBootError(null)
    } catch (e) {
      setBootError((e as Error).message)
    }
  }, [])

  const refreshScores = useCallback(async () => {
    try {
      const list = await loadApps()
      const next: Record<string, ScoreEntry[]> = {}
      for (const a of list) {
        // eslint-disable-next-line no-await-in-loop
        next[a.id] = await loadScores(a.id)
      }
      setScores(next)
    } catch {
      /* 成绩是辅助信息，失败不打扰主流程 */
    }
  }, [])

  useEffect(() => {
    void refreshApps()
    void loadSettings().then(setSettings).catch(() => {})
    void refreshScores()
    const t1 = setInterval(() => { if (document.visibilityState === 'visible') void refreshApps() }, 6000)
    const t2 = setInterval(() => { if (document.visibilityState === 'visible') void refreshScores() }, 30000)
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      void refreshApps()
      void refreshScores()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t1); clearInterval(t2)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refreshApps, refreshScores])

  const detailApp = detailId ? apps.find((a) => a.id === detailId) || null : null

  const openRunner = useCallback(async (app: AppEntry) => {
    setBusy(true)
    try {
      const r = await loadVersionSource(app, app.head)
      if ('error' in r) notify({ text: r.error, bad: true })
      else { setRunner({ app, html: r.html }); setDetailId(null) }
    } catch (e) {
      notify({ text: `装载失败：${(e as Error).message}`, bad: true })
    } finally {
      setBusy(false)
    }
  }, [notify])

  const handleScore = useCallback(async (score: number) => {
    if (!runner) return
    const device = settings.deviceName || (IS_MOBILE ? '手机' : '桌面')
    const player = settings.nickname || '匿名'
    try {
      await addScore(runner.app.id, { score, player, device })
      setScores((s) => ({
        ...s,
        [runner.app.id]: [...(s[runner.app.id] || []), { score, player, device, ts: Date.now() }],
      }))
      notify({ text: `成绩 ${score} 已上榜（${player} · ${device}）` })
    } catch (e) {
      notify({ text: `成绩上报失败：${(e as Error).message}`, bad: true })
    }
  }, [runner, settings, notify])

  const onChanged = useCallback(async () => {
    await refreshApps()
    void refreshScores()
  }, [refreshApps, refreshScores])

  const bestOf = useCallback((id: string): number | null => {
    const list = scores[id]
    if (!list || !list.length) return null
    return list.reduce((m, s) => (s.score > m ? s.score : m), list[0].score)
  }, [scores])

  const quickPrompt = useCallback((text: string) => {
    if (onSendToChat) void onSendToChat(text)
    else notify({ text: '请在聊天里对 AI 说：' + text })
  }, [onSendToChat, notify])

  return (
    <div className="ff-root">
      <style>{CSS}</style>
      <div className="ff-header">
        <div className="ff-header-title">⚒️ 闪造应用作坊</div>
        <div className="ff-header-tabs">
          <button type="button" className={`ff-tab${tab === 'grid' ? ' ff-tab-on' : ''}`} onClick={() => setTab('grid')}>应用架</button>
          <button type="button" className={`ff-tab${tab === 'settings' ? ' ff-tab-on' : ''}`} onClick={() => setTab('settings')}>设置</button>
        </div>
      </div>

      {bootError && (
        <div className="ff-boot-error">数据面不可用：{bootError}（请确认 Polaris 主应用在运行且为较新版本）</div>
      )}

      {tab === 'grid' && (
        <AppGrid apps={apps} bestScores={Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.length ? v.reduce((m, s) => (s.score > m ? s.score : m), v[0].score) : null]))} onOpen={setDetailId} onQuickPrompt={quickPrompt} />
      )}
      {tab === 'settings' && (
        <SettingsView settings={settings} onSaved={setSettings} notify={notify} />
      )}

      {detailApp && (
        <AppDetail
          app={detailApp}
          scores={scores[detailApp.id] || []}
          busy={busy}
          notify={notify}
          onChanged={onChanged}
          onRun={() => void openRunner(detailApp)}
          onClose={() => setDetailId(null)}
        />
      )}

      {runner && (
        <AppRunner
          app={runner.app}
          html={runner.html}
          best={bestOf(runner.app.id)}
          onClose={() => setRunner(null)}
          onScore={(s) => void handleScore(s)}
        />
      )}

      <div className="ff-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`ff-toast${t.bad ? ' ff-toast-bad' : ''}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}

const CSS = `
.ff-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: #10141c; color: #e6eaf2; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 13px; overflow: hidden; }
.ff-root * { box-sizing: border-box; }
.ff-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #232a38; flex: 0 0 auto; }
.ff-header-title { font-weight: 700; font-size: 14px; }
.ff-header-tabs { display: flex; gap: 4px; }
.ff-tab { background: transparent; border: 1px solid transparent; color: #93a0b4; padding: 4px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; }
.ff-tab-on { color: #e6eaf2; background: #1c2432; border-color: #2c3648; }
.ff-boot-error { margin: 10px 14px; padding: 8px 12px; border: 1px solid #5b2a2e; background: #2a1618; color: #f0b6ba; border-radius: 8px; }
.ff-grid-wrap { flex: 1; overflow: auto; padding: 12px 14px 24px; }
.ff-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.ff-search { flex: 1 1 160px; max-width: 280px; background: #171d29; border: 1px solid #2c3648; color: #e6eaf2; border-radius: 8px; padding: 6px 10px; outline: none; }
.ff-search:focus { border-color: #3d5a8a; }
.ff-kinds { display: flex; gap: 6px; }
.ff-chip { background: #171d29; border: 1px solid #2c3648; color: #93a0b4; border-radius: 999px; padding: 4px 12px; cursor: pointer; font-size: 12px; }
.ff-chip-on { color: #10141c; background: #7fb2ff; border-color: #7fb2ff; font-weight: 600; }
.ff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.ff-card { text-align: left; background: #171d29; border: 1px solid #242e40; border-radius: 12px; padding: 12px; cursor: pointer; color: #e6eaf2; transition: border-color .15s, transform .15s; display: flex; flex-direction: column; gap: 6px; }
.ff-card:hover { border-color: #3d5a8a; transform: translateY(-1px); }
.ff-card-top { display: flex; align-items: center; justify-content: space-between; }
.ff-card-icon { font-size: 20px; }
.ff-badge-new { background: #274a2d; color: #9fe0a9; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
.ff-card-title { font-weight: 600; font-size: 13px; }
.ff-card-meta { color: #93a0b4; font-size: 11px; }
.ff-card-dim { color: #5d6b80; }
.ff-card-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.ff-tag { background: #1f2836; border-radius: 999px; padding: 1px 8px; font-size: 10px; color: #93a0b4; }
.ff-nomatch { color: #5d6b80; padding: 20px 0; }
.ff-empty { max-width: 520px; margin: 8vh auto 0; text-align: center; display: flex; flex-direction: column; gap: 12px; padding: 0 16px; }
.ff-empty-icon { font-size: 40px; }
.ff-empty-title { font-size: 16px; font-weight: 700; }
.ff-empty-sub { color: #93a0b4; line-height: 1.6; }
.ff-empty-prompts { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.ff-prompt { text-align: left; }
.ff-btn { background: #1c2432; border: 1px solid #2c3648; color: #e6eaf2; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.ff-btn:hover { border-color: #3d5a8a; }
.ff-btn:disabled { opacity: .5; cursor: default; }
.ff-btn-primary { background: #2f66c4; border-color: #2f66c4; color: #fff; font-weight: 600; }
.ff-btn-danger { background: #5b2a2e; border-color: #7c3a40; color: #f0b6ba; }
.ff-btn-ghost { background: transparent; }
.ff-btn-sm { padding: 3px 9px; font-size: 11px; }
.ff-detail { position: absolute; inset: 0; background: #10141c; overflow: auto; padding: 14px 16px 30px; }
.ff-detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 14px; }
.ff-detail-title { font-size: 17px; font-weight: 700; }
.ff-detail-meta { color: #93a0b4; margin-top: 4px; }
.ff-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ff-section { margin-bottom: 18px; }
.ff-section-title { font-weight: 700; font-size: 12px; color: #93a0b4; letter-spacing: .4px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
.ff-confirm-inline { display: inline-flex; gap: 8px; align-items: center; color: #f0b6ba; font-weight: 400; }
.ff-versions { display: flex; flex-direction: column; gap: 8px; }
.ff-ver { border: 1px solid #242e40; border-radius: 10px; padding: 10px 12px; background: #141a25; }
.ff-ver-head { border-color: #2f66c4; }
.ff-ver-line { display: flex; align-items: center; gap: 8px; }
.ff-ver-no { font-weight: 700; color: #7fb2ff; }
.ff-badge-cur { background: #1d3a68; color: #9cc3ff; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.ff-badge-warn { background: #4a3a1d; color: #e8c983; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.ff-ver-meta { color: #5d6b80; font-size: 11px; margin-left: auto; }
.ff-ver-log { color: #b9c3d4; margin: 6px 0; }
.ff-ver-ops { display: flex; gap: 6px; flex-wrap: wrap; }
.ff-src-wrap { margin-top: 8px; }
.ff-src { max-height: 260px; overflow: auto; background: #0c1017; border: 1px solid #232a38; border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; color: #b9c3d4; margin: 0 0 6px; }
.ff-src-loading { color: #5d6b80; padding: 8px 0; }
.ff-scores { margin: 0; padding: 0 0 0 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ff-scores li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #141a25; border: 1px solid #202939; border-radius: 8px; }
.ff-score-rank { width: 20px; color: #5d6b80; font-weight: 700; }
.ff-score-val { font-weight: 700; color: #ffd479; min-width: 56px; }
.ff-score-player { flex: 1; }
.ff-score-time { color: #5d6b80; font-size: 11px; }
.ff-danger-zone { border-top: 1px dashed #3a2a2d; padding-top: 12px; }
.ff-confirm-row { display: flex; gap: 8px; margin-top: 8px; }
.ff-dim { color: #5d6b80; }
.ff-settings { max-width: 420px; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; }
.ff-field { display: flex; flex-direction: column; gap: 6px; }
.ff-field-label { color: #93a0b4; font-size: 12px; }
.ff-input { background: #171d29; border: 1px solid #2c3648; color: #e6eaf2; border-radius: 8px; padding: 7px 10px; outline: none; }
.ff-input:focus { border-color: #3d5a8a; }
.ff-settings-note { line-height: 1.7; border-top: 1px solid #232a38; padding-top: 10px; }
.ff-runner { position: absolute; inset: 0; background: #0b0e14; display: flex; flex-direction: column; z-index: 30; }
.ff-runner-bar { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid #232a38; flex: 0 0 auto; }
.ff-runner-title { font-weight: 700; }
.ff-runner-meta { color: #5d6b80; font-size: 11px; }
.ff-runner-best, .ff-record { font-size: 12px; color: #ffd479; margin-left: auto; }
.ff-record { color: #9fe0a9; font-weight: 700; }
.ff-runner-bar .ff-btn-ghost { margin-left: 8px; }
.ff-runner-stage { flex: 1; position: relative; }
.ff-runner-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }
.ff-toasts { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 50; align-items: center; }
.ff-toast { background: #1c2432; border: 1px solid #2c3648; padding: 7px 14px; border-radius: 10px; font-size: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.4); max-width: 80vw; }
.ff-toast-bad { background: #2a1618; border-color: #5b2a2e; color: #f0b6ba; }
@media (max-width: 640px) {
  .ff-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .ff-detail-actions { width: 100%; }
  .ff-runner-bar { flex-wrap: wrap; }
}
`
