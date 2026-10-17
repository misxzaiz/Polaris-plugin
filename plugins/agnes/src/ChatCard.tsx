/**
 * Agnes 聊天卡片 — MCP 生图/生视频结果渲染
 *
 * result 模式：data 来自 MCP 工具返回的 structuredContent（与 agnes_mcp_server.rs / mcp/server.js 对齐）：
 *   图片 url 模式：  { type:'image', url, model?, size?, prompt?, revisedPrompt? }
 *   图片 base64 模式：{ type:'image', base64, mimeType?, model?, size?, prompt?, revisedPrompt? }
 *   视频完成：      { type:'video', url, videoId?, status:'completed', seconds?, size?, model?, prompt? }
 *   视频进行中：    { type:'video', videoId, status, progress?, waiting:true }
 *
 * 渲染环境：宿主聊天 webview（Tailwind 类来自宿主主题），React 由宿主注入。
 */

import { useState } from 'react'

// 本地声明 Props（与宿主 PluginChatCardProps 结构一致，避免构建期依赖宿主源码）
interface ChatCardProps {
  pluginId: string
  cardId: string
  toolName: string
  mode: 'result' | 'interaction'
  status: string
  data: unknown
  onSendToChat?: (message: string) => void | Promise<void>
}

interface MediaData {
  type?: string
  // image
  url?: string
  base64?: string
  mimeType?: string
  // video
  videoId?: string
  status?: string
  progress?: number
  seconds?: string
  size?: string
  waiting?: boolean
  // common
  model?: string
  prompt?: string
  revisedPrompt?: string
  error?: string
}

function isMediaData(data: unknown): data is MediaData {
  if (typeof data !== 'object' || data === null) return false
  const d = data as MediaData
  if (d.type !== 'image' && d.type !== 'video') return false
  if (d.type === 'image') return typeof d.url === 'string' || typeof d.base64 === 'string'
  return true
}

function normalizeData(raw: unknown): MediaData | null {
  let data = raw
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed === 'object' && parsed !== null) data = parsed
    } catch {
      return null
    }
  }
  return isMediaData(data) ? data : null
}

function buildImageSrc(d: MediaData): string | null {
  if (d.url) return d.url
  if (d.base64) {
    const mime = d.mimeType || 'image/png'
    return `data:${mime};base64,${d.base64}`
  }
  return null
}

async function download(url: string, filename: string) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

function ToolLabel({ toolName }: { toolName: string }) {
  const short = toolName.replace(/^mcp__[^_]+__/, '')
  return short.includes('video') ? 'Agnes 视频' : 'Agnes 图片'
}

export default function AgnesChatCard({ data, status, toolName }: ChatCardProps) {
  const [expanded, setExpanded] = useState(false)
  const d = normalizeData(data)

  if (!d) {
    return (
      <section className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated px-3 py-2">
        <header className="flex min-w-0 items-center gap-2">
          <span className="text-sm">🎨</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-primary">Agnes 媒体</div>
            <div className="mt-0.5 truncate text-xs text-text-secondary">
              数据解析失败（{toolName}）· 状态 {status}
            </div>
          </div>
        </header>
      </section>
    )
  }

  if (d.type === 'image') {
    return <ImageCard d={d} />
  }
  return <VideoCard d={d} onToggle={() => setExpanded((v) => !v)} expanded={expanded} />
}

// ============================================================================
// 图片
// ============================================================================

function ImageCard({ d }: { d: MediaData }) {
  const src = buildImageSrc(d)
  if (!src) {
    return (
      <section className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary">
        图片数据缺失
      </section>
    )
  }

  const meta = [d.model, d.size].filter(Boolean).join(' · ')
  const onDownload = () => {
    const ext = d.mimeType?.includes('jpeg') ? 'jpg' : 'png'
    download(src, `agnes-${Date.now()}.${ext}`)
  }

  return (
    <section className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated">
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-400">
          <span className="text-sm">🖼️</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">Agnes 图片</div>
          {meta && <div className="mt-0.5 truncate text-[11px] text-text-tertiary">{meta}</div>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary"
            title="新窗口打开"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary"
            title="下载"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </header>
      <div className="flex items-center justify-center bg-background-surface p-2">
        <img
          src={src}
          alt={d.prompt || d.revisedPrompt || 'Agnes 生成图片'}
          className="max-h-[420px] w-auto max-w-full rounded-md object-contain"
          loading="lazy"
        />
      </div>
      {(d.prompt || d.revisedPrompt) && (
        <div className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
          {d.revisedPrompt || d.prompt}
        </div>
      )}
    </section>
  )
}

// ============================================================================
// 视频
// ============================================================================

function VideoCard({ d, onToggle, expanded }: { d: MediaData; onToggle: () => void; expanded: boolean }) {
  const completed = d.status === 'completed' && !!d.url
  const meta = [d.model, d.seconds && `${d.seconds}s`, d.size].filter(Boolean).join(' · ')

  const onDownload = () => {
    if (d.url) download(d.url, `agnes-${d.videoId || Date.now()}.mp4`)
  }

  return (
    <section className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated">
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-400">
          <span className="text-sm">🎬</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">Agnes 视频</div>
          {meta && <div className="mt-0.5 truncate text-[11px] text-text-tertiary">{meta}</div>}
        </div>
        {completed && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary"
              title="新窗口打开"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary"
              title="下载"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        )}
      </header>

      {completed ? (
        <div className="bg-black p-2">
          <video
            src={d.url}
            controls
            className="max-h-[460px] w-full rounded-md"
            preload="metadata"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-background-surface px-3 py-6">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-text-primary">
              {d.status === 'failed' ? '视频生成失败' : '视频生成中...'}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-text-tertiary">
              {d.error
                ? d.error
                : d.videoId
                  ? `videoId: ${d.videoId}${typeof d.progress === 'number' ? ` · 进度 ${d.progress}%` : ''}`
                  : '等待任务创建'}
            </div>
          </div>
        </div>
      )}

      {d.prompt && (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-1 border-t border-border px-3 py-2 text-left text-[11px] leading-relaxed text-text-secondary hover:bg-background-hover"
        >
          <span className="flex-1 truncate">{expanded ? d.prompt : (d.prompt.length > 90 ? `${d.prompt.slice(0, 90)}…` : d.prompt)}</span>
          <span className="shrink-0 text-text-tertiary">{expanded ? '收起' : '展开'}</span>
        </button>
      )}
    </section>
  )
}