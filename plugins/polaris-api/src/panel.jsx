// panel.jsx — Polaris 面板包装组件
// 将 Polaris API 嵌入 Polaris 侧栏面板

import { useEffect, useRef } from 'react'
import mainCss from './styles/main.css'
import MainPanel from './components/MainPanel.jsx'

export default function PolarisApiPanel({ pluginId, onSendToChat }) {
  const containerRef = useRef(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initializedRef.current) return

    // 注入 CSS
    try {
      const style = document.createElement('style')
      style.setAttribute('data-polaris-api', '')
      style.textContent = mainCss
      container.prepend(style)
    } catch (e) {
      // CSS 注入失败不阻塞功能
    }

    initializedRef.current = true

    return () => {
      container.innerHTML = ''
      initializedRef.current = false
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="polaris-api-panel"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg, #16181e)',
        color: 'var(--ink, #d8dae2)',
        fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <MainPanel />
    </div>
  )
}