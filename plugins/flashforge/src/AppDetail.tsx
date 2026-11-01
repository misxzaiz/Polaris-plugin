/**
 * 应用详情抽屉：版本时间线（只增不改）、运行、源码查看/导出、回退、
 * 高分榜、删除与清成绩（全部两步确认）。
 */
import { useEffect, useState } from 'react'
import {
  clearScores, deleteApp, loadScores, loadVersionSource, markPushed, rollbackApp,
  type AppEntry, type ScoreEntry,
} from './model'

type Notice = { text: string; bad?: boolean }

function fmtTime(ts: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtSize(n: number) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`
}

export function AppDetail(props: {
  app: AppEntry
  scores: ScoreEntry[]
  busy: boolean
  notify: (n: Notice) => void
  onChanged: () => Promise<void>
  onRun: () => void
  onClose: () => void
}) {
  const { app, scores, busy, notify, onChanged, onRun, onClose } = props
  const [source, setSource] = useState<{ v: number; html: string } | null>(null)
  const [srcLoading, setSrcLoading] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [rbVer, setRbVer] = useState<number | null>(null)

  useEffect(() => {
    setSource(null)
    setConfirmDel(false)
    setConfirmClear(false)
    setRbVer(null)
  }, [app.id, app.head])

  const toggleSource = async (v: number) => {
    if (source && source.v === v) { setSource(null); return }
    setSrcLoading(true)
    try {
      const r = await loadVersionSource(app, v)
      if ('error' in r) notify({ text: r.error, bad: true })
      else setSource({ v, html: r.html })
    } catch (e) {
      notify({ text: `源码读取失败：${(e as Error).message}`, bad: true })
    } finally {
      setSrcLoading(false)
    }
  }

  const exportHtml = async (v: number) => {
    try {
      const r = await loadVersionSource(app, v)
      if ('error' in r) { notify({ text: r.error, bad: true }); return }
      const blob = new Blob([r.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${app.title.replace(/[\\/:*?"<>|]/g, '_')}-v${v}.html`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      notify({ text: `已导出 v${v} 单文件 HTML（双击即可在浏览器打开）` })
    } catch (e) {
      notify({ text: `导出失败：${(e as Error).message}`, bad: true })
    }
  }

  const doRollback = async (v: number) => {
    try {
      const r = await rollbackApp(app, v)
      await onChanged()
      notify({ text: `已回退：v${v} 复制为新版本 v${r.version.v}（历史原样保留）` })
    } catch (e) {
      notify({ text: `回退失败：${(e as Error).message}`, bad: true })
    }
  }

  const doDelete = async () => {
    try {
      await deleteApp(app)
      await onChanged()
      notify({ text: `《${app.title}》已删除（全部版本与成绩）` })
      onClose()
    } catch (e) {
      notify({ text: `删除失败：${(e as Error).message}`, bad: true })
    }
  }

  const doClear = async () => {
    try {
      await clearScores(app.id)
      await onChanged()
      notify({ text: '成绩已清空' })
    } catch (e) {
      notify({ text: `清空失败：${(e as Error).message}`, bad: true })
    }
  }

  const doPush = async () => {
    try {
      await markPushed(app)
      await onChanged()
      notify({ text: '已推送到手机：手机端应用架顶部「新造好」打开即玩' })
    } catch (e) {
      notify({ text: `推送失败：${(e as Error).message}`, bad: true })
    }
  }

  const head = app.versions[app.versions.length - 1]

  return (
    <div className="ff-detail">
      <div className="ff-detail-head">
        <div>
          <div className="ff-detail-title">{app.title}</div>
          <div className="ff-detail-meta">
            {app.kind === 'game' ? '🎮 游戏' : app.kind === 'tool' ? '🛠️ 工具' : '🎓 教具'}
            {' · '}v{app.head}（共 {app.versions.length} 版） · {fmtSize(app.size)}
            {' · '}创建 {fmtTime(app.createdAt)}
          </div>
        </div>
        <div className="ff-detail-actions">
          <button type="button" className="ff-btn ff-btn-primary" disabled={busy} onClick={onRun}>▶ 运行</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={doPush}>📱 推送到手机</button>
          <button type="button" className="ff-btn ff-btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>

      <div className="ff-section">
        <div className="ff-section-title">版本时间线（只增不改；回退=复制为新版本）</div>
        <div className="ff-versions">
          {[...app.versions].reverse().map((v) => (
            <div key={v.v} className={`ff-ver${v.v === app.head ? ' ff-ver-head' : ''}`}>
              <div className="ff-ver-line">
                <span className="ff-ver-no">v{v.v}</span>
                {v.v === app.head && <span className="ff-badge-cur">当前</span>}
                {v.warns > 0 && <span className="ff-badge-warn">扫描提醒×{v.warns}</span>}
                <span className="ff-ver-meta">{fmtSize(v.size)} · {fmtTime(v.createdAt)}</span>
              </div>
              <div className="ff-ver-log">{v.changelog || '（无说明）'}</div>
              <div className="ff-ver-ops">
                <button type="button" className="ff-btn ff-btn-sm" onClick={() => void toggleSource(v.v)}>
                  {source && source.v === v.v ? '收起源码' : '查看源码'}
                </button>
                <button type="button" className="ff-btn ff-btn-sm" onClick={() => void exportHtml(v.v)}>导出 .html</button>
                {v.v !== app.head && (
                  rbVer === v.v
                    ? (
                      <>
                        <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" disabled={busy} onClick={() => void doRollback(v.v)}>确认回退到 v{v.v}</button>
                        <button type="button" className="ff-btn ff-btn-sm ff-btn-ghost" onClick={() => setRbVer(null)}>取消</button>
                      </>
                    )
                    : <button type="button" className="ff-btn ff-btn-sm" disabled={busy} onClick={() => setRbVer(v.v)}>回退到此版</button>
                )}
              </div>
              {source && source.v === v.v && (
                srcLoading
                  ? <div className="ff-src-loading">装载中…</div>
                  : (
                    <div className="ff-src-wrap">
                      <pre className="ff-src">{source.html}</pre>
                      <button
                        type="button"
                        className="ff-btn ff-btn-sm"
                        onClick={() => { void navigator.clipboard?.writeText(source.html); notify({ text: '源码已复制到剪贴板' }) }}
                      >复制全部</button>
                    </div>
                  )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="ff-section">
        <div className="ff-section-title">
          高分榜
          {confirmClear
            ? (
              <span className="ff-confirm-inline">
                确认清空全部成绩？
                <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" disabled={busy} onClick={() => void doClear()}>确认清空</button>
                <button type="button" className="ff-btn ff-btn-sm ff-btn-ghost" onClick={() => setConfirmClear(false)}>取消</button>
              </span>
            )
            : scores.length > 0 && (
              <button type="button" className="ff-btn ff-btn-sm ff-btn-ghost" onClick={() => setConfirmClear(true)}>清空成绩</button>
            )}
        </div>
        {scores.length === 0
          ? <div className="ff-dim">还没有成绩——运行应用玩一局（游戏结束时自动上报）。</div>
          : (
            <ol className="ff-scores">
              {[...scores].sort((a, b) => (b.score - a.score) || (a.ts - b.ts)).slice(0, 20).map((s, i) => (
                <li key={`${s.ts}-${i}`}>
                  <span className="ff-score-rank">{i + 1}</span>
                  <span className="ff-score-val">{s.score}</span>
                  <span className="ff-score-player">{s.player || '匿名'}{s.device ? `（${s.device}）` : ''}</span>
                  <span className="ff-score-time">{fmtTime(s.ts)}</span>
                </li>
              ))}
            </ol>
          )}
      </div>

      <div className="ff-section ff-danger-zone">
        <div className="ff-section-title">危险区</div>
        {head && <div className="ff-dim">删除《{app.title}》将移除全部 {app.versions.length} 个版本与成绩，不可恢复。可先导出 .html 留底。</div>}
        {confirmDel
          ? (
            <div className="ff-confirm-row">
              <button type="button" className="ff-btn ff-btn-danger" disabled={busy} onClick={() => void doDelete()}>确认删除《{app.title}》</button>
              <button type="button" className="ff-btn ff-btn-ghost" onClick={() => setConfirmDel(false)}>取消</button>
            </div>
          )
          : <button type="button" className="ff-btn ff-btn-danger" onClick={() => setConfirmDel(true)}>删除应用</button>}
      </div>
    </div>
  )
}
