/**
 * 交互组件卡片 v2（chatCards entry：dist/card.js）
 *
 * 双渲染分支（去 PRD 化，spec [A-1] 例外条款：静态原型保留预览渲染器）：
 * - render_component（含 form 契约）→ 轻量组件卡外壳：主题注入 iframe + 收起式
 *   标题条 + 回传徽标，无预览套件（版本 pills/复制输出/全屏）
 * - preview_html（兼容别名，静态原型）→ ArtifactPreviewRenderer 完整预览
 *   （版本管理/源码查看是原型场景的正当需求）
 *
 * 表单回传链路（spec [S-7]）：mount 登记 component_register → iframe postMessage
 * （event.source 绑定 + formId 校验）→ polaris-host/form.submitForm（现有
 * form_submit 管线，read 三态/secret 掩码服务端强制）→ 回执随下一条消息注入。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
// @ts-expect-error — polaris-host/* 占位符，加载器重写
import { buildArtifactBlockFromData, readArtifactHtml, openArtifactSource, ArtifactPreviewRenderer } from 'polaris-host/artifact'
// @ts-expect-error — 同上
import { registerComponent, submitForm } from 'polaris-host/form'
// @ts-expect-error — 同上
import { forwardCap } from 'polaris-host/cap'

interface PreviewArtifactData {
  artifactType?: string
  previewId?: string
  title?: string
  contentType?: string
  sourcePath?: string
  html?: string
  createdAt?: string
  version?: number
  versionLabel?: string
  requirementId?: string
  description?: string
  form?: { formId: string; read: 'full' | 'none'; secretKeys?: string[]; submitLabel?: string; wait?: boolean }
  caps?: string[]
}

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

interface ComponentSubmitMessage {
  __polarisComponent?: unknown
  formId?: unknown
  values?: unknown
}

interface CapRequestMessage {
  __polarisCap?: unknown
  id?: unknown
  target?: unknown
  payload?: unknown
}

/** 从宿主文档收集主题变量——注入组件 srcdoc，AI 的 HTML 底色/文字自动跟随主题 */
function collectThemeVars(): string {
  try {
    const cs = getComputedStyle(document.documentElement)
    const names = ['--background', '--foreground', '--card', '--card-foreground', '--muted', '--muted-foreground', '--primary', '--primary-foreground', '--border', '--accent']
    const pairs = names
      .map((n) => { const v = cs.getPropertyValue(n).trim(); return v ? n + ':' + v : '' })
      .filter(Boolean)
    const dark = document.documentElement.dataset.theme?.includes('dark') || document.body.classList.contains('dark')
    pairs.push('color-scheme:' + (dark ? 'dark' : 'light'))
    return pairs.join(';')
  } catch {
    return ''
  }
}

/** 给 AI 的 html 包主题底座：底色/文字继承宿主，页面自身透明 */
function themeWrap(html: string): string {
  const vars = collectThemeVars()
  const base = '<style>:root{' + vars + '}html,body{background:transparent;color:var(--foreground,#e8e8ea)}</style>'
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + base)
  return base + html
}

export const InteractiveComponentCard = memo(function InteractiveComponentCard(props: CardProps) {
  const data = props.data as PreviewArtifactData | null
  const form = data && typeof data === 'object' ? data.form : undefined
  const isStatic = props.toolName.endsWith('preview_html')

  const artifactBlock = useMemo(() => buildArtifactBlockFromData(data), [props.data])

  if (!artifactBlock) {
    const partial = data
    if (partial && typeof partial === 'object' && (partial.previewId || partial.sourcePath)) {
      return (
        <HydratingPreview
          previewId={partial.previewId}
          sourcePath={partial.sourcePath}
          title={partial.title}
          versionLabel={partial.versionLabel}
          version={typeof partial.version === 'number' ? partial.version : undefined}
          createdAt={partial.createdAt}
          requirementId={partial.requirementId}
          description={partial.description}
          form={form}
          sessionId={props.sessionId}
          isStatic={isStatic}
        />
      )
    }
    return (
      <div className="my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary">
        交互组件数据解析失败（{props.toolName}）
      </div>
    )
  }

  if (isStatic) {
    return <StaticArtifactPreview artifactBlock={artifactBlock} requirementId={artifactBlock.requirementId} />
  }

  return (
    <InteractivePreview
      artifactBlock={artifactBlock}
      form={form}
      sessionId={props.sessionId}
      declaredCapTargets={data.caps}
    />
  )
})

/** 静态原型分支：完整预览渲染器（宿主桥 hook 惰性引用） */
function StaticArtifactPreview({ artifactBlock, requirementId }: { artifactBlock: Record<string, unknown>; requirementId?: string }) {
  const h = (window as unknown as { __POLARIS_HOST_ARTIFACT__?: { useArtifactVersions: (r?: string) => unknown } }).__POLARIS_HOST_ARTIFACT__
  const versions = h ? h.useArtifactVersions(requirementId) : null
  return <ArtifactPreviewRenderer block={artifactBlock as never} versions={(versions ?? undefined) as never} />
}

/**
 * 轻量组件卡外壳（v2 去 PRD 化）：
 * - 主题注入 iframe（AI 的 HTML 底色/文字自动跟随宿主主题）
 * - form 契约：mount 登记 + 提交接线（event.source 绑定 + formId 校验）
 * - cap 调用转发（宿主三重门控执行）
 * - 无预览套件：静态原型走另一分支
 */
function InteractivePreview({
  artifactBlock,
  form,
  sessionId,
  declaredCapTargets,
}: {
  artifactBlock: Record<string, unknown>
  form?: { formId: string; read: 'full' | 'none'; secretKeys?: string[]; submitLabel?: string; wait?: boolean }
  sessionId?: string
  declaredCapTargets?: string[]
}) {
  const componentIdRef = useRef<string>('')
  if (!componentIdRef.current) {
    componentIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'comp-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  }
  const componentId = componentIdRef.current

  const [formState, setFormState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [privateSubmit, setPrivateSubmit] = useState(false)

  // mount：登记表单契约（wait:true 时 form_submit 唤醒挂起的工具调用——同管线）
  useEffect(() => {
    if (!form || !sessionId) return
    let cancelled = false
    registerComponent({
      sessionId,
      componentId,
      formId: form.formId,
      read: form.read,
      secretKeys: form.secretKeys,
    }).catch(() => {
      if (!cancelled) setSubmitError('表单契约登记失败，提交可能不可用')
    })
    return () => { cancelled = true }
  }, [form?.formId, sessionId, componentId])

  const handleSubmit = useCallback(
    (rawValues: unknown) => {
      if (!form) return
      setFormState('submitting')
      setSubmitError(null)
      submitForm(form.formId, rawValues, {
        sessionId,
        private: privateSubmit || undefined,
        read: form.read,
      })
        .then(() => setFormState('submitted'))
        .catch((e: unknown) => {
          setFormState('error')
          setSubmitError(e instanceof Error ? e.message : String(e))
        })
    },
    [form?.formId, form?.read, sessionId, privateSubmit],
  )

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const declaredRef = useRef(declaredCapTargets)
  declaredRef.current = declaredCapTargets
  const formRef = useRef(form)
  formRef.current = form
  const stateRef = useRef(formState)
  stateRef.current = formState
  const submitRef = useRef(handleSubmit)
  submitRef.current = handleSubmit

  // iframe 消息管线：event.source 严格绑定（伪造来源拒绝）+ 协议分派
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const source = event.source
      const frameWin = iframeRef.current?.contentWindow
      if (!source || !frameWin || source !== frameWin) return
      const data = event.data
      if (!data || typeof data !== 'object') return

      // cap 调用 → 宿主三重门控转发（deny 清单/声明白名单/allowlist）
      if (data.__polarisCap === 1) {
        Promise.resolve(forwardCap(data, declaredRef.current ?? []))
       
        return
      }
      // 表单提交 → form_submit（现有管线）；formId 不匹配 = 伪造 → 忽略
      if (data.__polarisComponent === 1 && formRef.current && data.formId === formRef.current.formId) {
        if (stateRef.current === 'submitted' || stateRef.current === 'submitting') return
        submitRef.current(data.values ?? {})
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const html = typeof artifactBlock.html === 'string' ? artifactBlock.html : ''
  const themedHtml = useMemo(() => themeWrap(html), [html])
  const title = String(artifactBlock.title || '交互组件')

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-background-elevated">
      <div className="flex items-center gap-2 border-b border-border bg-background-elevated px-3 py-1.5">
        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">交互组件</span>
        <span className="text-xs font-medium text-text-primary">{title}</span>
        {artifactBlock.versionLabel ? <span className="text-[10px] text-text-tertiary">{String(artifactBlock.versionLabel)}</span> : null}
        <span className="ml-auto text-[10px] text-text-tertiary">AI · 自定义交互</span>
      </div>
      <div className="relative">
        <iframe
          ref={iframeRef}
          title={title}
          srcDoc={themedHtml}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          className="h-full w-full"
          style={{ background: 'transparent', border: 'none', minHeight: 120 }}
          referrerPolicy="no-referrer"
        />
      </div>
      {form ? (
        <div className="flex items-center gap-2 border-t border-border bg-background-elevated px-3 py-1.5 text-xs">
          {formState === 'submitted' ? (
            <span className="text-green-500">
              ✅ 已提交{form.read === 'none' ? '（私密：值未回传 AI）' : '（回执将随下一条消息带给 AI）'}
            </span>
          ) : formState === 'error' ? (
            <span className="text-error">提交失败：{submitError}</span>
          ) : (
            <>
              <span
                className={clsx(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                  form.read === 'none' ? 'bg-amber-500/10 text-amber-500' : 'bg-cyan-500/10 text-cyan-400',
                )}
                title={form.read === 'none' ? '提交值不进入 AI 上下文（服务端强制）' : '提交值经服务端回执回传 AI；secret 键恒定掩码'}
              >
                {form.read === 'none' ? '私密回传' : '表单回传'}
              </span>
              {form.read === 'full' && (
                <label className="flex items-center gap-1 text-text-secondary">
                  <input type="checkbox" checked={privateSubmit} onChange={(e) => setPrivateSubmit(e.target.checked)} />
                  私密提交（本次值不回传）
                </label>
              )}
              <span className="ml-auto text-text-muted">
                {formState === 'submitting' ? '提交中…' : `等待组件内提交（${form.submitLabel || '提交'}）`}
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 投影形态自升级：data 缺 html 但预览已落盘 → 读回 index.html 补齐。
 * 静态分支走宿主预览渲染器；交互分支走轻量外壳。
 */
function HydratingPreview({
  previewId,
  sourcePath,
  title,
  versionLabel,
  version,
  createdAt,
  requirementId,
  description,
  form,
  sessionId,
  isStatic,
}: {
  previewId?: string
  sourcePath?: string
  title?: string
  versionLabel?: string
  version?: number
  createdAt?: string
  requirementId?: string
  description?: string
  form?: { formId: string; read: 'full' | 'none'; secretKeys?: string[]; submitLabel?: string; wait?: boolean }
  sessionId?: string
  isStatic: boolean
}) {
  const [state, setState] = useState<'checking' | 'ready' | 'notice'>('checking')
  const [block, setBlock] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let cancelled = false
    setBlock(null)
    setState('checking')
    let resolvedPreviewId = previewId
    if (!resolvedPreviewId && sourcePath) {
      const parts = sourcePath.split(/[/\\]/)
      resolvedPreviewId = parts[parts.length - 2]
    }
    if (!sourcePath || !resolvedPreviewId) {
      setState('notice')
      return
    }
    const finalPreviewId: string = resolvedPreviewId
    readArtifactHtml(sourcePath)
      .then((html: unknown) => {
        if (cancelled) return
        if (typeof html === 'string' && html.length > 0 && html.includes('<')) {
          setBlock({
            type: 'artifact_preview',
            previewId: finalPreviewId,
            title: title?.trim() ? title : 'PRD Prototype',
            contentType: 'html',
            html,
            sourcePath,
            createdAt,
            version,
            versionLabel,
            requirementId,
            description,
          })
          setState('ready')
        } else {
          setState('notice')
        }
      })
      .catch(() => {
        if (!cancelled) setState('notice')
      })
    return () => { cancelled = true }
  }, [previewId, sourcePath, title, versionLabel, version, createdAt, requirementId, description])

  if (state === 'checking') {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-muted">加载组件…</span>
      </div>
    )
  }

  if (state === 'ready' && block) {
    if (isStatic) {
      const h = (window as unknown as { __POLARIS_HOST_ARTIFACT__?: { useArtifactVersions: (r?: string) => unknown } }).__POLARIS_HOST_ARTIFACT__
      const versions = h ? h.useArtifactVersions(requirementId) : null
      return <ArtifactPreviewRenderer block={block as never} versions={(versions ?? undefined) as never} />
    }
    return <InteractivePreview artifactBlock={block} form={form} sessionId={sessionId} declaredCapTargets={undefined} />
  }

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs">
      <span className="text-green-500">✅</span>
      <span className="text-text-secondary">
        组件已生成{title ? `：${title}` : ''}{versionLabel ? ` · ${versionLabel}` : ''}
        {previewId ? `（${previewId.slice(0, 8)}…）` : ''}
      </span>
      {sourcePath ? (
        <button
          type="button"
          onClick={() => openArtifactSource(sourcePath)}
          className={clsx('ml-auto shrink-0 rounded-md border border-border px-2 py-1', 'text-text-secondary hover:text-primary hover:border-primary transition-colors')}
        >
          打开源码
        </button>
      ) : null}
    </div>
  )
}

export default InteractiveComponentCard
