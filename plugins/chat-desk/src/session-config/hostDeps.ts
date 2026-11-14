/**
 * chat-desk session-config 依赖注入（P3.b）
 *
 * SessionConfigSelector 原依赖宿主 `@/stores`（useConfigStore）与
 * conversationStore/sessionStoreManager（activeSessionId + 会话级 Profile/Agent
 * 覆盖写回）。插件内通过本模块注入：
 * - getConfig：宿主 config（cap.config get full 经 hostInvoke）
 * - getSessionSnapshot：活跃会话元数据快照（P3 过渡期从宿主 __POLARIS_APP_CORE__
 *   读取；宿主未暴露时返回 null → 选择器走 engineOverride/默认分支）
 * - writeBackSessionOverrides：会话级 Profile/Agent 覆盖写回（P3 过渡期 no-op +
 *   toast 提示；P3.d sessionDirectory 落地后接真实现）
 */
import { getHostInvoke } from '../bridge'

export interface HostSessionMetaSnapshot {
  engineId?: string
  modelProfileId?: string
  profileMode?: 'official' | 'profile'
  model?: string
  agent?: string
  effort?: string
  permissionMode?: string
}

export interface SessionConfigHostDeps {
  getConfig: () => { defaultEngine?: string; activeModelProfileId?: string } | null
  /** 活跃会话元数据快照；sessionId 必带（写回目标） */
  getActiveSessionMeta: () => (HostSessionMetaSnapshot & { sessionId: string }) | null
  writeBackSessionOverrides: (
    sessionId: string,
    patch: { modelProfileId?: string | null; profileMode?: 'official' | 'profile'; model?: string; agent?: string | null }
  ) => void
}

let deps: SessionConfigHostDeps = {
  getConfig: () => null,
  getActiveSessionMeta: () => null,
  writeBackSessionOverrides: () => {},
}

export function setSessionConfigHostDeps(next: Partial<SessionConfigHostDeps>): void {
  deps = { ...deps, ...next }
}

export function getSessionConfigHostDeps(): SessionConfigHostDeps {
  return deps
}

/** 经 hostInvoke 读宿主 config full（cap.config；敏感字段已按源脱敏） */
export async function fetchHostConfig(): Promise<Record<string, unknown> | null> {
  try {
    const invoke = getHostInvoke()
    const res = (await invoke('router_dispatch', {
      req: { target: 'cap.config', payload: { action: 'get', section: 'full' } },
    })) as { ok?: boolean; result?: Record<string, unknown>; error?: string | null }
    if (!res?.ok) return null
    return res.result ?? null
  } catch {
    return null
  }
}
