/**
 * 交互组件卡片（chatCards entry：dist/card.js）
 *
 * 渲染 MCP render_component / preview_html 产物的组件预览。本版为「自绘」实现：
 * 不再依赖宿主 ArtifactPreviewRenderer（PRD 预览壳观感 + 版本 pills 对组件场景
 * 均无意义），只保留组件真正需要的三件事：
 *
 * 1. iframe 沙箱渲染（专用观感：紧凑工具条 + 展开/收起 + 打开源码）
 * 2. form 契约（marker.form 存在时）：mount 经 polaris-host/form.registerComponent
 *    登记组件型 hold；iframe 内组件 postMessage 提交 → submitForm（现有 form_submit
 *    管线，read 三态/secret 掩码服务端强制），回执回流下一轮上下文
 * 3. cap 桥（marker.caps 声明）：__polarisCap 协议转发 polaris-host/cap.forwardCap
 *    （deny 清单 + 静态白名单 + 声明白名单三重门控在宿主侧执行）
 *
 * 投影形态：data 缺 html 但预览已落盘（sourcePath）→ readArtifactHtml 读回补齐。
 *
 * 宿主桥约束：react shim 仅导出 useState/useEffect/useCallback/useMemo/useRef/
 * memo/createElement 等（pluginModuleLoader.ensureReactShim）——本文件不得使用
 * shim 外的 hooks（useReducer 等会让 blob 模块整体加载失败，2026-11-08 实锤）。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
// 宿主桥（加载器重写为 shim；宿主对象由 ensureBridgesReady 按需注册）
// @ts-expect-error — polaris-host/* 是宿主桥占位符，加载器重写，tsc 无类型
import { readArtifactHtml, openArtifactSource } from 'polaris-host/artifact'
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

/** 组件 → 卡片提交消息（与 mcp/server.js render_component 工具描述中的约定一致） */
interface ComponentSubmitMessage {
  __polarisComponent?: unknown
  formId?: unknown
  values?: unknown
}

export const InteractiveComponentCard = memo(function InteractiveComponentCard(props: CardProps) {
  const data = (props.data && typeof props.data === 'object' ? props.data : {}) as PreviewArtifactData

  // 完整形态：data 自带 html → 直接渲染；投影形态：只有 sourcePath → 读盘补齐
  if (typeof data.html === 'string' && data.html.length > 0) {
    return <InteractiveFrame data={data} sessionId={props.sessionId} />
  }
  if (data.sourcePath) {
    return <HydratingFrame data={data} sessionId={props.sessionId} />
  }
  return (
    <div className="my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary">
      交互组件数据解析失败（{props.toolName}）
    </div>
  )
})

/** 完整形态：渲染组件 + form 契约接线（登记/提交/状态/徽标）+ cap 桥 */
function InteractiveFrame({ data, sessionId }: { data: PreviewArtifactData; sessionId?: string }) {
  const form = data.form
  const caps = useMemo(() => (Array.isArray(data.caps) ? data.caps : undefined), [data.caps])

  const componentIdRef = useRef<string>('')
  if (!componentIdRef.current) {
    componentIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `comp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  const componentId = componentIdRef.current

  const [expanded, setExpanded] = useState(false)
  const [formState, setFormState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [privateSubmit, setPrivateSubmit] = useState(false)
  // listener 只挂一次（deps 不含 formState），重复提交守卫走 ref 镜像
  const formStateRef = useRef(formState)
  useEffect(() => {
    formStateRef.current = formState
  }, [formState])

  // mount：登记表单契约（formId 唯一 hold；提交走现有 form_submit 管线）。
  // 桥成员守卫：宿主桥缺失/成员名漂移时降级为无表单（徽标位置提示），不抛错——
  // useEffect 里的同步异常会被宿主 ContentBlockErrorBoundary 接住，整卡变错误块。
  useEffect(() => {
    if (!form || !sessionId) return
    if (typeof registerComponent !== 'function') {
      setSubmitError('宿主表单桥不可用，组件提交不可用')
      return
    }
    let cancelled = false
    registerComponent({
      sessionId,
      componentId,
      formId: form.formId,
      read: form.read,
      secretKeys: form.secretKeys,
    }).catch(() => {
      // 登记失败：提交时会被「表单已失效」拒绝，这里只提示（提交路径给出终态）
      if (!cancelled) setSubmitError('表单契约登记失败，提交可能不可用')
    })
    return () => {
      cancelled = true
    }
  }, [form?.formId, sessionId, componentId])

  const handleSubmit = useCallback(
    (rawValues: unknown) => {
      if (!form) return
      if (typeof submitForm !== 'function') {
        setFormState('error')
        setSubmitError('宿主表单桥不可用，提交失败')
        return
      }
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

  const html = data.html ?? ''
  const srcDoc = useMemo(() => buildSrcDoc(html), [html])

  // postMessage 管线：event.source 绑定校验（只认本卡片 iframe）+ 协议分派：
  // __polarisComponent=1 → 表单提交；__polarisCap=1 → cap 桥转发（宿主三重门控）
  const submitRef = useRef(handleSubmit)
  submitRef.current = handleSubmit
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  // iframe 引用：postMessage 管线用 event.source === frameRef.current.contentWindow
  // 做绑定校验（只认本卡片的 iframe，不吃别的窗口的消息）

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const source = event.source as Window | null
      const frameWin = frameRef.current?.contentWindow
      if (!source || !frameWin || source !== frameWin) return
      const msg = event.data
      if (!msg || typeof msg !== 'object') return
      if (msg.__polarisComponent === 1) {
        if (!form || msg.formId !== form.formId) return
        if (formStateRef.current === 'submitted' || formStateRef.current === 'submitting') return
        submitRef.current(msg.values ?? {})
        return
      }
      if (msg.__polarisCap === 1) {
        // 桥成员守卫：cap 桥缺失时静默拒绝（不弹响应，组件内调用方超时自兜底），
        // 异常若外抛会炸整卡（error boundary 接住后组件不可用）
        if (typeof forwardCap !== 'function') return
        forwardCap(msg, caps)
          .then((res: unknown) => {
            try {
              source.postMessage(res, '*')
            } catch {
              /* iframe 已销毁，忽略 */
            }
          })
          .catch(() => {
            /* 转发层异常不外抛（宿主桥已包装 error 字段） */
          })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [form?.formId, caps])

  return (
    <div className="relative">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-background-elevated px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-text-primary">
            {String(data.title || '交互组件')}
          </span>
          {form ? (
            <span
              className={clsx(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                form.read === 'none' ? 'bg-amber-500/10 text-amber-500' : 'bg-cyan-500/10 text-cyan-400',
              )}
              title={form.read === 'none' ? '提交值不进入 AI 上下文（服务端强制）' : '提交值经服务端回执回传 AI；secret 键恒定掩码'}
            >
              {form.read === 'none' ? '私密回传' : '表单回传'}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {data.sourcePath ? (
            <button
              type="button"
              onClick={() => openArtifactSource(data.sourcePath as string)}
              className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
            >
              源码
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
          >
            {expanded ? '收起' : '展开'}
          </button>
        </span>
      </div>
      <div
        className="overflow-hidden border-x border-b border-border rounded-b-lg transition-[height] duration-200"
        style={{ height: expanded ? '70vh' : '360px' }}
      >
        <iframe
          ref={frameRef}
          title={String(data.title || '交互组件')}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          className="h-full w-full"
          style={{ background: '#ffffff', border: 'none' }}
          referrerPolicy="no-referrer"
        />
      </div>
      {form ? (
        <div className="my-1 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs">
          {formState === 'submitted' ? (
            <span className="flex items-center gap-1 text-green-500">
              ✅ 已提交{form.read === 'none' ? '（私密：值未回传 AI）' : '（回执将随下一条消息带给 AI）'}
            </span>
          ) : formState === 'submitting' ? (
            <span className="text-text-secondary">提交中…</span>
          ) : formState === 'error' ? (
            <span className="text-red-500">{submitError || '提交失败'}</span>
          ) : (
            <>
              {form.read === 'full' && (
                <label className="flex cursor-pointer items-center gap-1 text-text-secondary">
                  <input type="checkbox" checked={privateSubmit} onChange={(e) => setPrivateSubmit(e.target.checked)} />
                  私密提交（本次值不回传）
                </label>
              )}
              <span className="ml-auto text-text-muted">
                等待组件内提交（{form.submitLabel || '提交'}）
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 投影形态自升级：data 缺 html 但预览已落盘 → readArtifactHtml（宿主封装，
 * 插件不 import 宿主服务）读回 index.html 补齐后进入完整形态。
 */
function HydratingFrame({ data, sessionId }: { data: PreviewArtifactData; sessionId?: string }) {
  const [state, setState] = useState<'checking' | 'ready' | 'notice'>('checking')
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState('checking')
    setHtml(null)
    if (!data.sourcePath) {
      setState('notice')
      return
    }
    readArtifactHtml(data.sourcePath)
      .then((h: unknown) => {
        if (cancelled) return
        if (typeof h === 'string' && h.length > 0 && h.includes('<')) {
          setHtml(h)
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
  }, [data.sourcePath])

  if (state === 'checking') {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-muted">加载组件…</span>
      </div>
    )
  }

  if (state === 'ready' && html !== null) {
    return <InteractiveFrame data={{ ...data, html }} sessionId={sessionId} />
  }

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs">
      <span className="text-green-500">✅</span>
      <span className="text-text-secondary">
        组件已生成{data.title ? `：${data.title}` : ''}
        {data.versionLabel ? ` · ${data.versionLabel}` : ''}
        {typeof data.previewId === 'string' && data.previewId ? `（${data.previewId.slice(0, 8)}…）` : ''}
      </span>
      {data.sourcePath ? (
        <button
          type="button"
          onClick={() => openArtifactSource(data.sourcePath as string)}
          className={clsx('ml-auto shrink-0 rounded-md border border-border px-2 py-1', 'text-text-secondary hover:text-primary hover:border-primary transition-colors')}
        >
          打开源码
        </button>
      ) : null}
    </div>
  )
}

/**
 * 组装 srcDoc：组件 HTML 自包含（AI 按工具描述产出完整文档/片段）。
 * 片段形态补齐 doctype 与 UTF-8 声明；自绘 iframe 不做主题注入——组件是
 * AI 生成的独立沙箱内容，白底画布是最中性约定（与宿主主题解耦）。
 */
function buildSrcDoc(html: string): string {
  const trimmed = html.trim()
  if (/<html[\s>]/i.test(trimmed)) return trimmed
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${trimmed}</body></html>`
}

export default InteractiveComponentCard
