/**
 * 宿主 API 访问层（CodeBuddy 面板专用，decision-journal 同模式）
 *
 * 经 window.__POLARIS_HOST_INVOKE__（主应用 main.tsx 挂载）调用宿主命令：
 *   - router_dispatch → cap.ai.chat / cap.kv（面板配置持久化 + 对话）
 * 面板组件在宿主内渲染（PluginPanelHost），同时可直读全局 zustand store——
 * 本文件只封装 invoke 通道，store 访问在 panel.tsx 内直接 import。
 */
export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}

export interface DispatchResponse {
  ok: boolean
  result?: unknown
  error?: string
  msgId?: string
}

/** cap.\* 能力调用（经宿主 router_dispatch） */
export async function capDispatch<T = Record<string, unknown>>(
  target: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

// ── 面板配置持久化（cap.kv codebuddy.panel.*）─────────────────────────────

export interface PanelConfig {
  /** 面板对话使用的模型（空 = 引擎默认） */
  model: string
  /** 努力级别（--effort） */
  effort: string
  /** 权限模式（--permission-mode） */
  permissionMode: string
  /** 最大轮数（--max-turns，空 = 不限） */
  maxTurns: string
  /** 自动压缩窗口（--autocompact：auto/400k/1m） */
  autocompact: string
  /** 备用模型（--fallback-model，主模型过载自动切换） */
  fallbackModel: string
  /** daemon 常驻模式开关 */
  daemonEnabled: boolean
}

export const DEFAULT_PANEL_CONFIG: PanelConfig = {
  model: '',
  effort: '',
  permissionMode: 'bypassPermissions',
  maxTurns: '',
  autocompact: '',
  fallbackModel: '',
  daemonEnabled: false,
}

const CFG_KEY = 'codebuddy.panel.cfg'

export async function loadPanelConfig(): Promise<PanelConfig> {
  try {
    const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key: CFG_KEY })
    const raw = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
    return { ...DEFAULT_PANEL_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch {
    return { ...DEFAULT_PANEL_CONFIG }
  }
}

export async function savePanelConfig(cfg: PanelConfig): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key: CFG_KEY, value: cfg })
}
