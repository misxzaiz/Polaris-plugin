/**
 * mimo-tts 聊天卡片 — MCP 合成结果播放器
 *
 * result 模式：data 来自 MCP 工具返回的 JSON（mimo_tts_synthesize /
 * mimo_tts_voice_design / mimo_tts_voice_clone），shape：
 *   { success, model, voice, text, format, file, url, sizeBytes, transcript, note }
 * 防御处理：data 可能被解析成对象，也可能是原始字符串（解析失败时兜底）。
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

interface TtsResultData {
  success?: boolean
  model?: string
  voice?: string
  text?: string
  transcript?: string
  format?: string
  file?: string
  url?: string
  sizeBytes?: number
  playbackUrl?: string
  note?: string
  error?: string
}

function normalizeData(raw: unknown): TtsResultData {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? (parsed as TtsResultData) : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw as TtsResultData
  return {}
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function ToolLabel({ toolName }: { toolName: string }) {
  const map: Record<string, string> = {
    mimo_tts_synthesize: '预置音色合成',
    mimo_tts_voice_design: '文本设计音色',
    mimo_tts_voice_clone: '音色克隆',
  }
  const short = toolName.replace(/^mcp__[^_]+__/, '')
  return map[short] || toolName
}

export default function MimoTtsChatCard({ data, status, toolName }: ChatCardProps) {
  const [expanded, setExpanded] = useState(false)
  const d = normalizeData(data)

  const audioUrl = d.url || d.playbackUrl
  const error = d.error || (status === 'error' ? '合成失败' : '')

  if (error) {
    return (
      <section className="my-2 w-full overflow-hidden rounded-lg border border-error/30 bg-error-faint/50">
        <header className="flex min-w-0 items-center gap-2 px-3 py-2">
          <span className="text-sm">🔴</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-error">MiMo 语音合成失败</div>
            <div className="mt-0.5 truncate text-xs text-text-secondary" title={error}>{error}</div>
          </div>
        </header>
      </section>
    )
  }

  const showText = d.text && d.text.length > 0
  const longText = (d.text || '').length > 90

  return (
    <section className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated">
      {/* header */}
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs">
          🔊
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">
            <ToolLabel toolName={toolName} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-[11px] text-text-tertiary">
            {d.model && <span className="truncate font-mono">{d.model}</span>}
            {d.voice && (
              <>
                <span className="shrink-0">·</span>
                <span className="shrink-0">音色 {d.voice}</span>
              </>
            )}
          </div>
        </div>
        {d.success === false ? (
          <span className="shrink-0 rounded bg-error/10 px-1.5 py-0.5 text-[11px] text-error">失败</span>
        ) : (
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">已完成</span>
        )}
      </header>

      {/* 合成文本 */}
      {showText && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mx-3 mt-2 block max-w-full text-left text-xs leading-relaxed text-text-secondary transition-colors hover:text-text-primary"
          style={{ WebkitLineClamp: 'unset' }}
        >
          <span
            className={longText && !expanded ? 'block overflow-hidden' : ''}
            style={
              longText && !expanded
                ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
                : undefined
            }
          >
            {d.text}
          </span>
        </button>
      )}

      {/* 播放器 */}
      <div className="px-3 py-2.5">
        {audioUrl ? (
          <audio controls preload="none" src={audioUrl} className="h-9 w-full max-w-full" />
        ) : (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="text-base">⏳</span>
            音频地址缺失
          </div>
        )}
      </div>

      {/* footer */}
      <footer className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background-surface px-3 py-1.5 text-[11px] text-text-tertiary">
        {audioUrl && (
          <a
            href={audioUrl}
            target="_blank"
            rel="noreferrer"
            className="text-text-secondary transition-colors hover:text-primary"
          >
            ⬇ 下载
          </a>
        )}
        {d.transcript && <span className="truncate" title={`识别文本: ${d.transcript}`}>📝 {d.transcript}</span>}
        {formatSize(d.sizeBytes) && <span>{formatSize(d.sizeBytes)}</span>}
        {d.format && <span>.{d.format}</span>}
        {d.file && <span className="truncate" title={d.file}>{d.file.replace(/^.*[\\/]/, '')}</span>}
      </footer>
    </section>
  )
}