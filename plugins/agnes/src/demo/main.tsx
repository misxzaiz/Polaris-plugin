/**
 * 演示页 — 在浏览器中直接预览 Agnes 面板（无需 Polaris 宿主）
 *
 * - 模拟 hostInvoke：plugin_get_config / plugin_set_config 读写 localStorage
 * - 生图/生视频的 fetch 直连真实 API（需在页面底部填 API Key），
 *   未填 Key 时点“生成”会报错，不影响界面预览
 * - 在线 API 受 CORS 限制时，可在本地代理下测试
 */

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import AgnesPanel from '../Panel'
import AgnesChatCard from '../ChatCard'

// ── 模拟宿主 ────────────────────────────────────────────────────────────────

const CFG_KEY = 'agnes-demo-config'

function readStored(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}')
  } catch {
    return {}
  }
}

;(window as unknown as { __POLARIS_HOST_INVOKE__?: (c: string, a?: Record<string, unknown>) => Promise<unknown> }).__POLARIS_HOST_INVOKE__ =
  async (cmd: string, args: Record<string, unknown> = {}) => {
    if (cmd === 'plugin_get_config') {
      return readStored()
    }
    if (cmd === 'plugin_set_config') {
      const cur = readStored()
      const next = { ...cur, ...((args.patch as Record<string, unknown>) || {}) }
      localStorage.setItem(CFG_KEY, JSON.stringify(next))
      return next
    }
    throw new Error(`模拟宿主不支持命令: ${cmd}`)
  }

// ── 演示页 ───────────────────────────────────────────────────────────────────

function Demo() {
  const [panelId] = useState('agnes-demo')
  const [cardData, setCardData] = useState<unknown>(null)

  useEffect(() => {
    document.title = 'Agnes 面板 Demo'
  }, [])

  return (
    <div style={{ display: 'flex', gap: 16, height: '100vh', padding: 16, background: '#1A1A1F', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* 左：面板 */}
      <div style={{ flex: 1, minWidth: 0, background: '#232329', borderRadius: 12, border: '1px solid #3F3F46', overflow: 'hidden' }}>
        <AgnesPanel pluginId={panelId} onSendToChat={(msg) => setCardData(msg)} />
      </div>

      {/* 右：聊天卡片渲染测试 */}
      <div style={{ width: 380, minWidth: 380, background: '#232329', borderRadius: 12, border: '1px solid #3F3F46', padding: 12, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F8F8F8' }}>聊天卡片渲染测试</div>

        <div style={{ fontSize: 11, color: '#8E8E93' }}>Mock 图片卡片（url）</div>
        <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 6 }}>
          <AgnesChatCard
            pluginId={panelId}
            cardId="mock-1"
            toolName="mcp__agnes__generate_image"
            mode="result"
            status="completed"
            data={{
              type: 'image',
              url: 'https://picsum.photos/seed/agnes-demo/600/400',
              model: 'agnes-image-2.1-flash',
              size: '1024x1024',
              prompt: '一只在星空下奔跑的银色机械猫，电影感光线',
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#8E8E93' }}>Mock 视频卡片（进行中）</div>
        <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 6 }}>
          <AgnesChatCard
            pluginId={panelId}
            cardId="mock-2"
            toolName="mcp__agnes__generate_video"
            mode="result"
            status="running"
            data={{
              type: 'video',
              videoId: 'vg_9f0ec2d1a3b4c5d6e7f80912',
              status: 'in_progress',
              progress: 42,
              waiting: true,
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#8E8E93' }}>Mock 视频卡片（完成）</div>
        <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 6 }}>
          <AgnesChatCard
            pluginId={panelId}
            cardId="mock-3"
            toolName="mcp__agnes__generate_video"
            mode="result"
            status="completed"
            data={{
              type: 'video',
              videoId: 'vg_completed_demo',
              status: 'completed',
              url: 'https://www.w3schools.com/html/mov_bbb.mp4',
              seconds: '5.0',
              size: '8.4MB',
              prompt: '夏日午后，猫咪在窗台上打盹，微风拂过窗帘',
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#8E8E93' }}>面板“发送”测试（点击面板生图历史里的“发送”后显示卡片）</div>
        <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 6 }}>
          {cardData ? (
            <AgnesChatCard
              pluginId={panelId}
              cardId="mock-sent"
              toolName="mcp__agnes__generate_image"
              mode="result"
              status="completed"
              data={{
                type: 'image',
                url: cardData,
                model: 'agnes-image-2.1-flash',
                size: '1024x1024',
                prompt: '（来自面板发送）',
              }}
            />
          ) : (
            <div style={{ fontSize: 12, color: '#8E8E93', padding: 12, textAlign: 'center' }}>
              尚未点击发送
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<Demo />)