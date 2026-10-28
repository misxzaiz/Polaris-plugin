/**
 * 作品 Tab：cap.kv 登记的作品列表（AI ppt_build 与面板本地构建同源可见）
 * 打开目录走对话（AI 的 ppt_reveal）；面板提供复制路径与删除登记（不删文件）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { TabProps } from './Panel'
import { loadWorks, kvDel, K, fmtTime, type DeckRecord } from './model'

export default function WorksTab({ settings, reload, showToast }: TabProps) {
  const [works, setWorks] = useState<DeckRecord[] | null>(null)
  const [confirmId, setConfirmId] = useState('')

  const refresh = useCallback(async () => {
    setWorks(await loadWorks())
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { void refresh() }, 10000)
    return () => clearInterval(timer)
  }, [refresh, settings])

  const copyPath = async (rec: DeckRecord) => {
    try {
      await navigator.clipboard.writeText(rec.path)
      showToast('路径已复制', 'good')
    } catch {
      showToast('复制失败（浏览器限制），路径已显示在列表中', 'bad')
    }
  }

  const forget = async (rec: DeckRecord) => {
    await kvDel(K.deck(rec.id))
    setConfirmId('')
    await refresh()
    await reload()
    showToast(`已删除登记「${rec.title}」（文件未删除）`, 'good')
  }

  return (
    <>
      <div className="qm-sec">
        <i className="qm-bar" />作品
        <span className="qm-hint">对话里说「打开它」→ AI 用 ppt_reveal 在资源管理器定位</span>
      </div>
      <div className="qm-card"><div className="qm-card-b" style={{ padding: '2px 13px' }}>
        {!works && <div className="qm-empty">载入中…</div>}
        {works && !works.length && (
          <div className="qm-empty">
            还没有作品。<br />在「创作」Tab 用大纲构建一套，或在对话里对 AI 说<br />「把这份材料做成 PPT」。
          </div>
        )}
        {works && works.map((rec) => (
          <div className="qm-work" key={rec.id}>
            <div className="qm-work-main">
              <b>{rec.title}<span style={{ color: '#5C6678', fontWeight: 400, fontSize: 10, marginLeft: 6 }}>{rec.source === 'panel' ? '面板构建' : 'AI 构建'}</span></b>
              <small>
                {rec.slideCount} 页 · {rec.theme} · {fmtTime(rec.ts)} · {rec.source === 'panel' ? '浏览器下载目录' : '落盘'}
              </small>
              <small className="qm-path" title="点击复制路径" onClick={() => void copyPath(rec)}>{rec.path}</small>
              <div className="qm-row" style={{ marginTop: 4 }}>
                <button className="qm-btn ghost sm" onClick={() => void copyPath(rec)}>复制路径</button>
                {confirmId !== rec.id && (
                  <button className="qm-btn danger sm" onClick={() => setConfirmId(rec.id)}>删除登记</button>
                )}
                {confirmId === rec.id && (
                  <>
                    <button className="qm-btn danger sm" onClick={() => void forget(rec)}>确认删除登记</button>
                    <button className="qm-btn ghost sm" onClick={() => setConfirmId('')}>算了</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div></div>
      <div className="qm-sub" style={{ padding: '0 18px' }}>
        登记只记录「做过什么、文件在哪」；删除登记不会删除 .pptx 文件本身。
      </div>
    </>
  )
}
