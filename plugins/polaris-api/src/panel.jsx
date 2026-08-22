// panel.jsx — Polaris 面板包装组件
// 将 Polaris API 嵌入 Polaris 侧栏面板，透传 onSendToChat 协同宿主 AI

import { useEffect, useRef } from 'react'
import mainCss from './styles/main.css'
import MainPanel from './components/MainPanel.jsx'

const STYLE_ID = 'polaris-api-plugin-style'

export default function PolarisApiPanel({ pluginId, onSendToChat }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      style.setAttribute('data-polaris-api', '')
      style.textContent = mainCss
      document.head.appendChild(style)
    }
    return () => {
      const el = document.getElementById(STYLE_ID)
      if (el && !document.querySelector('.polaris-api-panel')) el.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="polaris-api-panel"
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg, #16181e)', color: 'var(--ink, #d8dae2)',
        fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: 13, lineHeight: 1.5,
      }}
    >
      <MainPanel onSendToChat={onSendToChat} />
    </div>
  )
}