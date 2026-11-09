/**
 * 交互面板卡片 v2（chatCards entry：dist/card.js）
 *
 * 自包含实现：不依赖宿主 polaris-host/* 桥，宿主只需提供 react shim。
 * 相对 v1 补齐：主题注入、面板内全屏、音效（allow="autoplay"）、pointer-lock、
 * 静音开关、版本/来源标识；form 契约与 cap 桥按 v2 定案移除（form/ask 语义层
 * 本就在宿主，交互中继已于 2026-11-08 撤销）。
 *
 * 闪造配合是可选增强：marker.source === 'flashforge' 时切到闪造的 iframe
 * 权限档位；闪造未安装时本插件完全独立可用（无硬依赖、无能力探测代码）。
 *
 * 宿主桥约束：react shim 仅导出 useState/useEffect/useCallback/useMemo/useRef/
 * memo/createElement 等——不得使用 shim 外的 hooks（useReducer 会让 blob 模块
 * 整体加载失败，2026-11-08 实锤）。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildSrcDoc,
  framePolicy,
  rememberApp,
  type InteractiveArtifactData,
} from './shared'

interface CardProps {
  pluginId: string
  cardId: string
  toolName: string
  mode: string
  status: string
  data: unknown
  response?: unknown
  sessionId?: string
  onSendToChat?: (message: string) => void | Promise<void>
  respond?: (result: unknown) => Promise<void>
}

function Notice({ text }: { text: string }) {
  return (
    <div className="my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary">
      {text}
    </div>
  )
}

export const InteractivePanelCard = memo(function InteractivePanelCard(props: CardProps) {
  const data: InteractiveArtifactData | null =
    props.data && typeof props.data === 'object'
      ? (props.data as InteractiveArtifactData)
      : null

  useEffect(() => {
    if (data) rememberApp(data)
  }, [data])

  if (!data) return <Notice text={`交互面板数据解析失败（${props.toolName}）`} />

  // server 正常路径的 marker 总带 html；缺 html 只有历史投影形态会走到。
  // v2 无宿主桥，不再回读落盘文件，只给出可读提示。
  if (typeof data.html !== 'string' || !data.html) {
    if (data.sourcePath || data.previewId) {
      return (
        <Notice
          text={`交互面板已生成${data.title ? `：${data.title}` : ''}${
            data.versionLabel ? ` · ${data.versionLabel}` : ''
          }${data.sourcePath ? ` · ${data.sourcePath}` : ''}`}
        />
      )
    }
    return <Notice text={`交互面板数据解析失败（${props.toolName}）`} />
  }

  return <PanelFrame data={data} />
})

function PanelFrame({ data }: { data: InteractiveArtifactData }) {
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [copied, setCopied] = useState(false)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  const policy = useMemo(() => framePolicy(data.source), [data.source])
  const srcDoc = useMemo(
    () => buildSrcDoc(data.html as string, policy.withTheme),
    [data.html, policy.withTheme],
  )
  const title = String(data.title || '交互面板')

  // 全屏时 Esc 退出（不占用宿主 F11 / 面板全屏机制）
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // 静音开关：向 iframe 广播可选协议，组件未实现时不影响运行（只切 UI 状态）
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      try {
        frameRef.current?.contentWindow?.postMessage(
          { __polarisMute: 1, muted: next },
          '*',
        )
      } catch {
        /* iframe 已销毁，忽略 */
      }
      return next
    })
  }, [])

  const copySourcePath = useCallback(() => {
    if (!data.sourcePath) return
    try {
      void navigator.clipboard?.writeText(String(data.sourcePath))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }, [data.sourcePath])

  const frame = (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      sandbox={policy.sandbox}
      allow={policy.allow}
      className="h-full w-full"
      style={{ background: policy.withTheme ? 'transparent' : '#ffffff', border: 'none' }}
      referrerPolicy="no-referrer"
    />
  )

  const toolbar = (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-background-elevated px-3 py-1.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">
          交互面板
        </span>
        <span className="truncate text-xs font-medium text-text-primary">{title}</span>
        {data.versionLabel ? (
          <span className="shrink-0 text-[10px] text-text-tertiary">{String(data.versionLabel)}</span>
        ) : null}
        {data.source === 'flashforge' ? (
          <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
            闪造应用
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={toggleMute} title="静音（组件需响应 __polarisMute 协议）" className="text-[10px] text-text-tertiary hover:text-text-primary">
          {muted ? '取消静音' : '静音'}
        </button>
        {data.sourcePath ? (
          <button type="button" onClick={copySourcePath} className="text-[10px] text-text-tertiary hover:text-text-primary">
            {copied ? '已复制' : '复制源码路径'}
          </button>
        ) : null}
        <button type="button" onClick={() => setFullscreen(!fullscreen)} className="text-[10px] text-text-tertiary hover:text-text-primary">
          {fullscreen ? '退出全屏' : '全屏'}
        </button>
        {!fullscreen ? (
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-[10px] text-text-tertiary hover:text-text-primary">
            {expanded ? '收起' : '展开'}
          </button>
        ) : null}
      </span>
    </div>
  )

  if (fullscreen) {
    return (
      <div className="my-2 overflow-hidden rounded-lg border border-border">
        {toolbar}
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-background"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div className="flex-1 overflow-hidden">{frame}</div>
          <div className="border-t border-border px-3 py-1 text-[10px] text-text-tertiary">
            按 Esc 退出全屏 · 沙箱 iframe（{policy.sandbox}）
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border">
      {toolbar}
      <div
        className="overflow-hidden transition-[height] duration-200"
        style={{ height: expanded ? '70vh' : '360px' }}
      >
        {frame}
      </div>
    </div>
  )
}

export default InteractivePanelCard
