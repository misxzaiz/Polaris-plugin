// panel.jsx — Polaris 面板包装组件
// 将 Polaris API 嵌入 Polaris 侧栏面板

import { useEffect, useRef } from 'react'
import mainCss from './styles/main.css'
import MainPanel from './components/MainPanel.jsx'

const STYLE_ID = 'polaris-api-plugin-style'

export default function PolarisApiPanel({ pluginId, onSendToChat }) {
  const containerRef = useRef(null)

  useEffect(() => {
    // CSS 注入到 document.head（幂等，避免重复注入/清空 React DOM）
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      style.setAttribute('data-polaris-api', '')
      style.textContent = mainCss
      document.head.appendChild(style)
    }

    return () => {
      // 仅在容器卸载时移除样式；多实例共享同一 style 标签
      const el = document.getElementById(STYLE_ID)
      if (el && !document.querySelector('.polaris-api-panel')) {
        el.remove()
      }
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