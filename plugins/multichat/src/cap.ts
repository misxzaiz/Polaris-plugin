/**
 * MultiChat 能力访问层
 *
 * - cap.ai.chat（router_dispatch_stream / router_dispatch）：start/continue/interrupt
 * - cap.kv（router_dispatch）：本端消息体存储（append-only，纯缓存）
 * - plugin_get_config / plugin_set_config：跨设备会话清单（config.json plugins['multichat']）
 * - 引擎/供应商/模型数据源（Phase 2）：
 *   - get_engine_metadata_list：引擎列表
 *   - cap.config get → modelProfiles：供应商(Profile)列表 + model_options
 *   - get_opencode_models：opencode 模型列表
 */

import { invokeHost } from './host'
import {
  KV_PREFIX,
  type CapAiAck,
  type ChatEnvelope,
  type EngineMeta,
  type McMsg,
  type McSessionMeta,
  type McStoreData,
  type OpencodeModel,
  type ProfileInfo,
  type RouterDispatchResponse,
} from './types'

const TARGET = 'cap.ai.chat'
const KV_TARGET = 'cap.kv'
const PLUGIN_ID = 'multichat'

/** 统一 router_dispatch（同步动作；cap.ai.chat start/continue 走 stream，此仅 interrupt） */
async function capDispatch<T = unknown>(
  target: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await invokeHost<RouterDispatchResponse>('router_dispatch', {
    req: { target, payload },
  })
  if (!res?.ok) {
    throw new Error(res?.error || `${target} 调用失败`)
  }
  return res.result as T
}

/**
 * 发消息（start 新建 / continue 续聊）。
 * 关键：options.contextId = `mc-<pluginSessionId>` → 后端 chat-event 原样带回该前缀，
 * 插件按前缀过滤（见 stream.ts），与现有会话零冲突。
 */
export async function sendChat(req: {
  pluginSessionId: string
  text: string
  engineId?: string
  workspaceId?: string | null
  modelProfileId?: string | null
  model?: string | null
  // 续聊：同一插件会话已有引擎会话 id 时传，否则走 start
  engineSessionId?: string | null
}): Promise<{ ok: true; engineSessionId?: string } | { ok: false; reason: string }> {
  try {
    const options = {
      workDir: req.workspaceId || null,
      contextId: `mc-${req.pluginSessionId}`,
    } as Record<string, unknown>
    if (req.engineId) options.engineId = req.engineId
    if (req.modelProfileId) options.modelProfileId = req.modelProfileId
    if (req.model) options.model = req.model

    const payload: Record<string, unknown> = {
      action: req.engineSessionId ? 'continue' : 'start',
      message: req.text,
      options,
    }
    if (req.engineSessionId) payload.sessionId = req.engineSessionId

    const ack = await invokeHost<CapAiAck>('router_dispatch_stream', {
      req: { target: TARGET, payload },
    })

    // stream ack：start 返回 engines 会话 id，continue 无（沿用 engineSessionId）
    const engineSessionId = ack?.sessionId || req.engineSessionId || undefined
    return { ok: true, engineSessionId }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** 中断某会话（Phase 1 可选能力） */
export async function interrupt(sessionId: string, engineId?: string): Promise<unknown> {
  return capDispatch(TARGET, { action: 'interrupt', sessionId, engineId })
}

// ───────────────────────── 引擎 / 供应商 / 模型数据源（Phase 2） ─────────────────────────

/** 拉取引擎列表（主应用 get_engine_metadata_list）。失败降级为空数组。 */
export async function listEngines(): Promise<EngineMeta[]> {
  try {
    const metas = await invokeHost<EngineMeta[]>('get_engine_metadata_list')
    return Array.isArray(metas) ? metas : []
  } catch {
    return []
  }
}

/**
 * 拉取供应商(Profile)列表。
 * 经 cap.config get full 读取 config.modelProfiles（脱敏后含 model_options / target_engines）。
 */
export async function listProfiles(): Promise<ProfileInfo[]> {
  try {
    const config = await capDispatch<{ modelProfiles?: ProfileInfo[] }>('cap.config', {
      action: 'get',
      section: 'full',
    })
    const profiles = config?.modelProfiles
    if (!Array.isArray(profiles)) return []
    // 过滤掉缺 id 的脏数据，保留脱敏后的公开字段
    return profiles.filter((p) => p && typeof p.id === 'string' && p.id)
  } catch {
    return []
  }
}

/** 拉取 opencode 模型列表（get_opencode_models）。失败降级为空数组。 */
export async function listOpencodeModels(): Promise<OpencodeModel[]> {
  try {
    const models = await invokeHost<OpencodeModel[]>('get_opencode_models')
    return Array.isArray(models) ? models : []
  } catch {
    return []
  }
}

// ───────────────────────── cap.kv：本端消息体 ─────────────────────────

function kvKey(sessionId: string): string {
  return `${KV_PREFIX}${sessionId}`
}

/** 读取本端 kv 中会话消息（未命中返回空数组） */
export async function kvGetMessages(sessionId: string): Promise<McMsg[]> {
  try {
    const res = await capDispatch<{ value: McMsg[] | null }>(KV_TARGET, {
      action: 'get',
      key: kvKey(sessionId),
    })
    return res?.value ?? []
  } catch {
    return []
  }
}

/** 覆盖写本端会话消息（append 时读取→合并→写回，单实例内自串行） */
export async function kvSaveMessages(sessionId: string, msgs: McMsg[]): Promise<void> {
  await capDispatch(KV_TARGET, { action: 'set', key: kvKey(sessionId), value: msgs })
}

/** 追加一条消息（读改写，丢失时兜底为空） */
export async function kvAppendMessage(sessionId: string, msg: McMsg): Promise<McMsg[]> {
  const cur = await kvGetMessages(sessionId)
  const next = [...cur, msg]
  await kvSaveMessages(sessionId, next)
  return next
}

/** 删除会话本端消息缓存 */
export async function kvDeleteSession(sessionId: string): Promise<void> {
  await capDispatch(KV_TARGET, { action: 'delete', key: kvKey(sessionId) })
}

// ───────────────────── config：跨设备会话清单 ─────────────────────

/** 读插件配置（config.json plugins['multichat']） */
export async function loadStore(): Promise<McStoreData> {
  try {
    const raw = await invokeHost<Partial<McStoreData> | null>('plugin_get_config', {
      pluginId: PLUGIN_ID,
    })
    return {
      sessions: Array.isArray(raw?.sessions) ? raw!.sessions! : [],
      defaults: {
        engineId: raw?.defaults?.engineId || 'simple-ai',
        workspaceId: raw?.defaults?.workspaceId || null,
        modelProfileId: raw?.defaults?.modelProfileId || null,
        model: raw?.defaults?.model ?? null,
      },
    }
  } catch {
    return {
      sessions: [],
      defaults: {
        engineId: 'simple-ai',
        workspaceId: null,
        modelProfileId: null,
        model: null,
      },
    }
  }
}

/** 写透插件配置 */
export async function saveStore(store: McStoreData): Promise<void> {
  await invokeHost('plugin_set_config', { pluginId: PLUGIN_ID, patch: store })
}

/**
 * 跨设备并发锁：更新会话清单（读改写）。
 * status=running 时拒绝再次发送（Phase 1 单写者纪律）。
 */
export async function updateStore(
  fn: (store: McStoreData) => McStoreData,
): Promise<McStoreData> {
  const cur = await loadStore()
  const next = fn(cur)
  await saveStore(next)
  return next
}

/** 标记会话 running（发送前置校验 + 写入归属） */
export async function tryLockSession(
  sessionId: string,
  engineId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await updateStore((store) => {
      const s = store.sessions.find((x) => x.id === sessionId)
      if (s) {
        if (s.status === 'running') {
          throw new Error('会话正在运行（另一设备可能正在发消息），请等待完成')
        }
        s.status = 'running'
        s.engineId = engineId
        s.updatedAt = Date.now()
      }
      return store
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** 标记会话 idle + 更新 preview/messageCount */
export async function unlockSession(
  sessionId: string,
  delta: { preview?: string; messageCount?: number },
): Promise<void> {
  await updateStore((store) => {
    const s = store.sessions.find((x) => x.id === sessionId)
    if (s) {
      s.status = 'idle'
      s.updatedAt = Date.now()
      if (delta.preview) s.lastMessagePreview = delta.preview
      if (delta.messageCount) s.messageCount = delta.messageCount
    }
    return store
  })
}

export type { ChatEnvelope }
