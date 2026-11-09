/**
 * 交互面板共享层（card / panel 共用；插件自有，不依赖宿主桥）
 *
 * 宿主只提供 react shim（见 pluginModuleLoader）。插件不得 import 宿主内部
 * 模块；card 与 panel 之间用 window 上的插件自有全局交换「本次会话渲染过的
 * 应用」，不触碰宿主 store / IPC。
 */

export interface InteractiveArtifactData {
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
  /** 内容来源：AI 直接产出 / 由闪造 ff_source 读取后传入（可选增强，非依赖） */
  source?: 'inline' | 'flashforge'
}

const APPS_KEY = '__POLARIS_INTERACTIVE_APPS__'
export const APPS_CHANGED_EVENT = 'polaris:interactive-apps-changed'

type GlobalWindow = Window & Record<string, unknown>

/** 记录一次渲染（按 previewId 去重），并通知面板刷新 */
export function rememberApp(data: InteractiveArtifactData): void {
  try {
    const w = window as unknown as GlobalWindow
    const list: InteractiveArtifactData[] = Array.isArray(w[APPS_KEY])
      ? (w[APPS_KEY] as InteractiveArtifactData[]).slice()
      : []
    if (data.previewId) {
      const idx = list.findIndex((x) => x.previewId === data.previewId)
      if (idx >= 0) list[idx] = data
      else list.unshift(data)
    } else if (typeof data.html === 'string' && data.html) {
      list.unshift(data)
    }
    w[APPS_KEY] = list.slice(0, 60)
    window.dispatchEvent(new CustomEvent(APPS_CHANGED_EVENT))
  } catch {
    /* 全局存储不可用时忽略，不影响卡片渲染 */
  }
}

export function readApps(): InteractiveArtifactData[] {
  try {
    const w = window as unknown as GlobalWindow
    return Array.isArray(w[APPS_KEY]) ? (w[APPS_KEY] as InteractiveArtifactData[]) : []
  } catch {
    return []
  }
}

/** 收集宿主主题变量，注入 srcdoc，让 AI 的 HTML 底色/文字跟随主题 */
export function themeBase(): string {
  try {
    const cs = getComputedStyle(document.documentElement)
    const names = [
      '--background', '--foreground', '--card', '--card-foreground',
      '--muted', '--muted-foreground', '--primary', '--primary-foreground',
      '--border', '--accent',
    ]
    const pairs = names
      .map((n) => {
        const v = cs.getPropertyValue(n).trim()
        return v ? `${n}:${v}` : ''
      })
      .filter(Boolean)
    const dark =
      document.documentElement.dataset.theme?.includes('dark') ||
      document.body.classList.contains('dark')
    pairs.push(`color-scheme:${dark ? 'dark' : 'light'}`)
    return `<style>:root{${pairs.join(';')}}html,body{background:transparent;color:var(--foreground,#e8e8ea)}</style>`
  } catch {
    return ''
  }
}

/** 片段补齐为完整文档；完整文档原样返回。withTheme 时注入主题底座 */
export function buildSrcDoc(html: string, withTheme: boolean): string {
  const trimmed = html.trim()
  const doc = /<html[\s>]/i.test(trimmed)
    ? trimmed
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${trimmed}</body></html>`
  if (!withTheme) return doc
  const base = themeBase()
  if (!base) return doc
  return /<head[^>]*>/i.test(doc)
    ? doc.replace(/<head([^>]*)>/i, `<head$1>${base}`)
    : base + doc
}

/**
 * 按来源给出 iframe 权限档位（可选增强，不是硬依赖）：
 * - inline：AI 直接产出的组件，允许表单/弹窗/模态 + pointer-lock + autoplay
 * - flashforge：由闪造 ff_source 读取的应用，沿用闪造安全口径
 *   （allow-scripts allow-pointer-lock，无弹窗/顶层导航）+ autoplay
 *
 * allow="autoplay" 是 Permissions Policy：srcdoc + 无 allow-same-origin 的
 * iframe 是不透明 origin，autoplay 默认禁用，必须显式声明才能播放音效。
 */
export function framePolicy(source?: string): { sandbox: string; allow: string; withTheme: boolean } {
  if (source === 'flashforge') {
    return { sandbox: 'allow-scripts allow-pointer-lock', allow: 'autoplay', withTheme: false }
  }
  return {
    sandbox: 'allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock',
    allow: 'autoplay',
    withTheme: true,
  }
}
