/**
 * 沙箱运行覆盖层：懒注入 iframe（打开才建 srcdoc，关即卸载省 CPU）。
 * 沙箱 = allow-scripts + allow-pointer-lock（无 allow-same-origin → 不透明 origin，
 * 无 Cookie/localStorage/同源访问；无 allow-popups / allow-top-navigation）。
 * 成绩协议：应用 parent.postMessage({__ff:1, type:'score', score}, '*')，
 * 本组件校验来源（event.source === iframe.contentWindow）与形状后交给上层落库。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppEntry } from './model'

export function AppRunner(props: {
  app: AppEntry
  html: string
  best: number | null
  onClose: () => void
  onScore: (score: number) => void
}) {
  const { app, html, best, onClose, onScore } = props
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [record, setRecord] = useState<number | null>(null)
  // srcdoc 以纯片段拼装，应用源码中的 </script> 原样保留（srcdoc 属性转义由 React 处理）
  const srcdoc = useMemo(() => html, [html])

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const frame = frameRef.current
      if (!frame || ev.source !== frame.contentWindow) return
      const d = ev.data as { __ff?: unknown; type?: unknown; score?: unknown } | null
      if (!d || d.__ff !== 1 || d.type !== 'score') return
      const score = Number(d.score)
      if (!Number.isFinite(score)) return
      onScore(score)
      if (best === null || score > best) setRecord(score)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [best, onScore])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ff-runner">
      <div className="ff-runner-bar">
        <span className="ff-runner-title">{app.title}</span>
        <span className="ff-runner-meta">v{app.head} · 沙箱运行 · 成绩自动上榜</span>
        {record !== null && <span className="ff-record">🎉 新纪录 {record}</span>}
        {best !== null && record === null && <span className="ff-runner-best">当前最高 {best}</span>}
        <button type="button" className="ff-btn ff-btn-ghost" onClick={onClose}>关闭 ✕</button>
      </div>
      <div className="ff-runner-stage">
        <iframe
          ref={frameRef}
          title={`flashforge-app-${app.id}`}
          className="ff-runner-frame"
          sandbox="allow-scripts allow-pointer-lock"
          srcDoc={srcdoc}
          allow="autoplay"
        />
      </div>
    </div>
  )
}
