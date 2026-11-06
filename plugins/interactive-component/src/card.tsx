/**
 * 交互组件卡片（chatCards entry：dist/card.js）
 *
 * 接 PluginChatCardProps（宿主注入），渲染 MCP render_component / preview_html
 * 产物的 PreviewArtifact。相比旧 PRD 卡片新增：
 * - marker 带 form 契约 → mount 时 component_register 登记（宿主 form_core 建组件型 hold）
 * - iframe 内组件经 postMessage 提交 → polaris-host/form.submitForm（现有 form_submit
 *   管线，read 三态/secret 掩码服务端强制），回执回流下一轮上下文
 * - read 模式徽标：让用户知道提交数据是否回传 AI（spec [S-7] 透明性）
 *
 * 复用宿主通用核心经 polaris-host/artifact 桥（ArtifactPreviewRenderer 全功能：
 * iframe 沙箱/全屏/版本 pills/源码查看），不复制渲染代码（spec [A-1]）。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
// 宿主桥（加载器重写为 shim；宿主对象由 ensureBridgesReady 按需注册）
// @ts-expect-error — polaris-host/* 是宿主桥占位符，加载器重写，tsc 无类型
import { ArtifactPreviewRenderer, buildArtifactBlockFromData, useArtifactVersions, readArtifactHtml, openArtifactSource } from 'polaris-host/artifact'
// @ts-expect-error — 同上
import { registerComponent, submitForm } from 'polaris-host/form'

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
  form?: { formId: string; read: 'full' | 'none'; secretKeys?: string[]; submitLabel?: string }
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

/** 组件 → 宿主提交消息（与 mcp/server.js 工具描述中的约定一致） */
interface ComponentSubmitMessage {
  __polarisComponent?: unknown
  formId?: unknown
  values?: unknown
}

export const InteractiveComponentCard = memo(function InteractiveComponentCard(props: CardProps) {
  const data = props.data as PreviewArtifactData | null
  const form = data && typeof data === 'object' ? data.form : undefined

  const artifactBlock = useMemo(() => buildArtifactBlockFromData(data), [props.data])
  const versions = useArtifactVersions(artifactBlock?.requirementId)

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
        />
      )
    }
    return (
      <div className="my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary">
        交互组件数据解析失败（{props.toolName}）
      </div>
    )
  }

  return (
    <InteractivePreview
      artifactBlock={artifactBlock}
      versions={versions ?? undefined}
      form={form}
      sessionId={props.sessionId}
      declaredCapTargets={data.caps ? new Set(data.caps) : undefined}
    />
  )
})

/** 完整形态：渲染预览 + 表单契约接线（登记/提交/状态/徽标） */
function InteractivePreview({
  artifactBlock,
  versions,
  form,
  sessionId,
}: {
  artifactBlock: Record<string, unknown>
  versions?: Record<string, unknown>[] | null
  form?: { formId: string; read: 'full' | 'none'; secretKeys?: string[]; submitLabel?: string }
  caps?: string[]
  sessionId?: string
  declaredCapTargets?: ReadonlySet<string>
}) {
  const componentIdRef = useRef<string>('')
  if (!componentIdRef.current) {
    componentIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `comp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  const componentId = componentIdRef.current

  const [formState, setFormState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [privateSubmit, setPrivateSubmit] = useState(false)

  // mount：登记表单契约（formId 唯一 hold；提交走现有 form_submit 管线）
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
      // 登记失败：提交时会被「表单已失效」拒绝，此处静默（提交按钮置错由提交路径处理）
      if (!cancelled) setSubmitError('表单契约登记失败，提交可能不可用')
    })
    return () => {
      cancelled = true
    }
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
        .then(() => {
          setFormState('submitted')
        })
        .catch((e: unknown) => {
          setFormState('error')
          setSubmitError(e instanceof Error ? e.message : String(e))
        })
    },
    [form?.formId, form?.read, sessionId, privateSubmit],
  )

  // iframe 消息钩子：ArtifactPreviewRenderer 已做 event.source 绑定校验，
  // 此处只认本组件协议（__polarisComponent === 1 且 formId 匹配）。
  const onFrameMessage = useCallback(
    (raw: unknown) => {
      if (!form || formState === 'submitted' || formState === 'submitting') return
      const msg = raw as ComponentSubmitMessage
      if (!msg || typeof msg !== 'object') return
      if (msg.__polarisComponent !== 1) return
      if (msg.formId !== form.formId) return
      handleSubmit(msg.values ?? {})
    },
    [form?.formId, formState, handleSubmit],
  )

  return (
    <div className="relative">
      <ArtifactPreviewRenderer
        block={artifactBlock as never}
        versions={versions as never}
        onFrameMessage={onFrameMessage}
        declaredCapTargets={declaredCapTargets}
      />
      {form ? (
        <div className="my-1 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs">
          {formState === 'submitted' ? (
            <span className="flex items-center gap-1 text-green-500">
              ✅ 已提交{form.read === 'none' ? '（私密：值未回传 AI）' : '（回执将随下一条消息带给 AI）'}
            </span>
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
                {formState === 'submitting' ? '提交中…' : formState === 'error' ? submitError || '提交失败' : `等待组件内提交（${form.submitLabel || '提交'}）`}
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 投影形态自升级（与旧 PRD 卡同构）：data 缺 html 但预览已落盘 → 读回 index.html
 * 补齐。经 polaris-host/artifact.readArtifactHtml（宿主封装，插件不 import 宿主服务）。
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
}: {
  previewId?: string
  sourcePath?: string
  title?: string
  versionLabel?: string
  version?: number
  createdAt?: string
  requirementId?: string
  description?: string
  form?: { formId: string; read: 'full' | 'none'; secretKeys?: string[]; submitLabel?: string }
  caps?: string[]
  sessionId?: string
  declaredCapTargets?: ReadonlySet<string>
}) {
  const [state, setState] = useState<'checking' | 'ready' | 'notice'>('checking')
  const [block, setBlock] = useState<Record<string, unknown> | null>(null)
  const versions = useArtifactVersions(requirementId)

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
    return () => {
      cancelled = true
    }
  }, [previewId, sourcePath, title, versionLabel, version, createdAt, requirementId, description])

  if (state === 'checking') {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-muted">加载预览…</span>
      </div>
    )
  }

  if (state === 'ready' && block) {
    return <InteractivePreview artifactBlock={block} versions={versions ?? undefined} form={form} sessionId={sessionId} />
  }

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs">
      <span className="text-green-500">✅</span>
      <span className="text-text-secondary">
        预览已生成{title ? `：${title}` : ''}{versionLabel ? ` · ${versionLabel}` : ''}
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
