/**
 * 宿主通道层（core-slimdown B2-1 L1 骨架）
 *
 * 插件面板跑在宿主主窗口（pluginModuleLoader 以 Blob import 加载），不能直连
 * Tauri invoke；一切后端调用必须经 window.__POLARIS_HOST_INVOKE__，该桥只放行
 * 宿主白名单内的命令（src/main.tsx 的 HOST_INVOKE_ALLOWLIST，14 条）。
 *
 * 电台域实测：待迁 31 个文件里唯一的宿主命令是 router_dispatch（在白名单内），
 * 即 cap.voice / cap.ai.chat / cap.kv / cap.ui.chat 全部走 RouterBus，后端仍有
 * 统一权限 gate + 审计。详见 README.md「宿主交界实测」。
 */

export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

/** 获取宿主 invoke 通道；缺失时抛清晰错误（提示需更新主应用） */
export function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__')
  }
  return invoke
}

/** router_dispatch 统一返回（与主仓 services/voiceBroadcast/voiceService.ts 对齐） */
export interface DispatchResponse<T = unknown> {
  ok: boolean
  result?: T
  error?: string
}

/**
 * 经 RouterBus 调用宿主能力。
 *
 * 注意：res.ok=true 不代表业务成功——cap.* 会把业务错误放在 result.error，
 * 步骤 2 迁入 voiceService.ts 时须保留原有「ok + result.error」双重判定语义，
 * 不得只判 ok（AGENTS.md §4.2：不改播报 / 合成 / 打断语义）。
 */
export async function dispatchCap<T = unknown>(
  target: string,
  payload: Record<string, unknown>,
): Promise<DispatchResponse<T>> {
  try {
    const res = await getHostInvoke()<DispatchResponse<T>>('router_dispatch', {
      req: { target, payload },
    })
    if (!res?.ok) return { ok: false, error: res?.error ?? `${target} 调用失败` }
    return { ok: true, result: res.result }
  } catch (e) {
    return {
      ok: false,
      error: `${target} 调用异常: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
