/**
 * sessionStoreManager 桥转发（原 host/conversationStore 拷贝实现已移除）。
 * 单实例 = 宿主 appCore.stores.sessionStoreManager。所有导出与原拷贝模块签名一致。
 */
import { useStore } from 'zustand'
import { coreStore } from '../../shims/stores'
import type { SessionMetadata } from './types'

const PROTECTED_SESSION_KINDS: ReadonlySet<string> = new Set(['important', 'pinned'])

export function isProtectedSession(metadata: SessionMetadata | undefined): boolean {
  return !!metadata && !!metadata.kind && PROTECTED_SESSION_KINDS.has(metadata.kind)
}

export const RENDER_EVENT_TYPES: ReadonlySet<string> = new Set(['plugin_card', 'plugin_card_answered'])

export const sessionStoreManager: any = coreStore<any>('sessionStoreManager')

export function findStoreByConversationId(...args: unknown[]): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  if (typeof sm.findStoreByConversationId === 'function') return sm.findStoreByConversationId(...args)
  const ua: any = coreStore<any>('useActiveSession')
  if (typeof ua.findStoreByConversationId === 'function') return ua.findStoreByConversationId(...args)
  return undefined
}

export function useActiveConversationStore(): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  const sessionId = useStore(sm, (state: any) => state.activeSessionId)
  const stores = useStore(sm, (state: any) => state.stores)
  if (!sessionId) return undefined
  return stores.get(sessionId)?.getState()
}

export function useConversationStore(sessionId: string | null): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  const stores = useStore(sm, (state: any) => state.stores)
  if (!sessionId) return undefined
  return stores.get(sessionId)?.getState()
}

export function useSessionMetadataList(): SessionMetadata[] {
  const sm: any = coreStore<any>('sessionStoreManager')
  return useStore(sm, (state: any) => {
    const m = state.sessionMetadata
    return m ? [...m.values()] : []
  })
}

export function useActiveSessionId(): string | null {
  const sm: any = coreStore<any>('sessionStoreManager')
  return useStore(sm, (state: any) => state.activeSessionId)
}

export function useSessionManagerActions(): any {
  const sm: any = coreStore<any>('sessionStoreManager')
  const st = sm.getState()
  return {
    switchSession: (id: string) => st.switchSession(id),
    closeSession: (id: string) => st.deleteSession(id),
    createSession: st.createSession,
    createSessionFromHistory: st.createSessionFromHistory,
    renameSession: (id: string, title: string) => st.updateSessionTitle(id, title),
  }
}
