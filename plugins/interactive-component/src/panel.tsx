/**
 * 交互面板（activityBar panel entry：dist/panel.js）
 *
 * 会话内应用架：列出本会话中由交互面板卡片渲染过的应用，选中后运行，可全屏。
 * 数据来源是插件自有的 window 全局（shared.ts），不触碰宿主 store / IPC；
 * 因此这是「运行容器」而非持久仓库——持久化与版本树由闪造负责，本插件
 * 不依赖闪造（未安装时空态引导照常可用）。
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  APPS_CHANGED_EVENT,
  buildSrcDoc,
  framePolicy,
  readApps,
  type InteractiveArtifactData,
} from './shared'

export const InteractivePanel = memo(function InteractivePanel() {
  const [apps, setApps] = useState<InteractiveArtifactData[]>(() => readApps())
  const [selected, setSelected] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const refresh = () => setApps(readApps())
    window.addEventListener(APPS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(APPS_CHANGED_EVENT, refresh)
  }, [])

  const current = useMemo(() => {
    if (!apps.length) return null
    return apps.find((a) => a.previewId && a.previewId === selected) ?? apps[0]
  }, [apps, selected])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const policy = current ? framePolicy(current.source) : null
  const srcDoc = current && typeof current.html === 'string'
    ? buildSrcDoc(current.html, policy ? policy.withTheme : true)
    : ''
  const title = String(current?.title || '交互面板')

  const runner = (className: string) => (
    <iframe
      title={title}
      srcDoc={srcDoc}
      sandbox={policy ? policy.sandbox : 'allow-scripts allow-pointer-lock'}
      allow="autoplay"
      className={className}
      style={{ border: 'none', background: '#ffffff' }}
      referrerPolicy="no-referrer"
    />
  )

  if (!apps.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-sm font-medium text-text-primary">交互面板</div>
        <div className="max-w-xs text-xs leading-relaxed text-text-secondary">
          在对话中让 AI 用 render_component 生成一个交互组件，或先用闪造的
          ff_source 读取应用源码再交给交互面板，这里就会出现可运行的应用。
        </div>
        <div className="text-[10px] text-text-tertiary">应用仅在本会话内保留；持久化请用闪造。</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-text-primary">交互面板 · 应用架</span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary">{apps.length} 个应用</span>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="text-[10px] text-text-tertiary hover:text-text-primary"
          >
            全屏运行
          </button>
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 shrink-0 overflow-y-auto border-r border-border">
          {apps.map((a, i) => {
            const key = a.previewId || `app-${i}`
            const active = current === a
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(a.previewId || null)}
                className={
                  'block w-full truncate border-b border-border px-3 py-2 text-left text-xs ' +
                  (active ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-background-elevated')
                }
              >
                {String(a.title || '未命名应用')}
                {a.versionLabel ? ` · ${a.versionLabel}` : ''}
              </button>
            )
          })}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {current && typeof current.html === 'string' ? (
            runner('h-full w-full flex-1')
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-text-secondary">
              该应用没有可运行的 HTML
            </div>
          )}
        </div>
      </div>

      {fullscreen && current ? (
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-background"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-text-primary">{title}</span>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="text-[10px] text-text-tertiary hover:text-text-primary"
            >
              退出全屏（Esc）
            </button>
          </div>
          <div className="flex-1 overflow-hidden">{runner('h-full w-full')}</div>
        </div>
      ) : null}
    </div>
  )
})

export default InteractivePanel
