import { useEffect, useState } from 'react'
import { getHostInvoke } from './host'

/**
 * B2-1 步骤 1 占位面板：只验证「插件包能被宿主加载 + 宿主桥可用」。
 * 步骤 2 迁入 RadioBroadcastPanel / VoiceCompanionOverlay 时整体替换本文件。
 *
 * 不引入任何硬编码颜色 / 字号，样式继承宿主主题（AGENTS.md §三.1）。
 */

type BridgeState = 'checking' | 'ok' | 'unavailable'

export default function RadioBroadcastPanel() {
  const [bridge, setBridge] = useState<BridgeState>('checking')

  useEffect(() => {
    let alive = true
    // health_check 在 HOST_INVOKE_ALLOWLIST 内且无副作用，用作桥连通性探针
    try {
      void getHostInvoke()<unknown>('health_check')
        .then(() => { if (alive) setBridge('ok') })
        .catch(() => { if (alive) setBridge('unavailable') })
    } catch {
      if (alive) setBridge('unavailable')
    }
    return () => { alive = false }
  }, [])

  return (
    <div>
      <h2>AI 连续播报 · 插件骨架</h2>
      <p>core-slimdown B2-1 步骤 1：插件仓骨架已就绪，面板与控制器将在步骤 2 迁入。</p>
      <p>
        宿主桥状态：
        {bridge === 'checking' ? '探测中' : bridge === 'ok' ? '可用' : '不可用'}
      </p>
      <p>当前为占位面板，未上架且不可用于生产。</p>
    </div>
  )
}
