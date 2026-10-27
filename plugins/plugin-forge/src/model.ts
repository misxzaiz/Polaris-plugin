/**
 * 通信层 + 数据访问（插件工坊面板）
 *
 * 工坊零服务：知识库与脚手架模板随面板 bundle 内联（esbuild text loader），
 * 唯一落 kv 的是 forge.settings（记住脚手架默认值，跨端一致）。
 */
import { getHostInvoke } from './host'
import kbIndexJson from '../shared/kb-index.json'

export interface TopicMeta {
  id: string
  title: string
  summary: string
  tags: string[]
}

export const KB_META = {
  version: (kbIndexJson as { version: string }).version,
  updatedAt: (kbIndexJson as { updatedAt: string }).updatedAt,
  topics: (kbIndexJson as { topics: TopicMeta[] }).topics,
}

async function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<{ ok: boolean; result?: T; error?: string }>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export interface ForgeSettings {
  scaffoldDir: string
  defaultIcon: string
  defaultOrder: number
}

export function normalizeForgeSettings(raw: unknown): ForgeSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    scaffoldDir: typeof r.scaffoldDir === 'string' ? r.scaffoldDir : '',
    defaultIcon: typeof r.defaultIcon === 'string' ? r.defaultIcon : 'Beaker',
    defaultOrder: typeof r.defaultOrder === 'number' ? r.defaultOrder : 80,
  }
}

export const FORGE_SETTINGS_KEY = 'forge.settings'

export async function loadForgeSettings(): Promise<ForgeSettings> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key: FORGE_SETTINGS_KEY }).catch(() => null)
  return normalizeForgeSettings(r && r.value)
}

export async function saveForgeSettings(s: ForgeSettings): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key: FORGE_SETTINGS_KEY, value: s })
}

// ── 剪贴板（手机非安全上下文回退：手动复制弹窗）────────────────────────────
export async function copyText(text: string): Promise<'copied' | 'manual'> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch (_) { /* 回退 */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch (_) { ok = false }
  document.body.removeChild(ta)
  if (ok) return 'copied'
  window.prompt('手机端自动复制不可用，请手动复制：', text)
  return 'manual'
}
