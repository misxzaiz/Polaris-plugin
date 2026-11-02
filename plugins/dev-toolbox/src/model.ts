// cap 总线访问（house 范式）：capDispatch 一层解包信封，kv 再解一层 value（双重解包缺一不可）
import { getHostInvoke } from './host'

interface DispatchEnvelope<T> {
  ok: boolean
  result?: T
  error?: string
}

export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<DispatchEnvelope<T>>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
  return r && r.value !== undefined ? r.value : null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

// 键空间契约（README 同步）：devtoolbox.favs=收藏工具 id 数组；devtoolbox.last=最后使用工具 id。
// 只存这两个非敏感键；工具输入（可能含 JWT/密钥）一律不持久化。
export const KV_FAVS = 'devtoolbox.favs'
export const KV_LAST = 'devtoolbox.last'
