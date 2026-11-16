/** 宿主通道获取（与 llm-probe 等插件同款；缺失 = 宿主太旧，给明确报错） */
export function getHostInvoke(): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  const fn = (window as unknown as { __POLARIS_HOST_INVOKE__?: unknown }).__POLARIS_HOST_INVOKE__
  if (typeof fn !== 'function') {
    throw new Error('宿主通道不可用：请把 Polaris 更新到较新版本后再打开本插件。')
  }
  return fn as <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

/** cap.config 顶层 patch（modelProfiles / activeModelProfileId 保存走此通道）。
 * 桌面走 config_patch_via_bus（补热切换广播）；web 走 router_dispatch。与宿主
 * configDispatchService.configPatchTop 同协议。返回完整 Config。 */
export async function patchConfigTop<T = unknown>(patch: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  if (isTauri) {
    return invoke<T>('config_patch_via_bus', {
      req: { target: 'cap.config', payload: { action: 'patch', patch } },
    })
  }
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>('router_dispatch', {
    target: 'cap.config',
    payload: { action: 'patch', patch },
  })
  if (res && typeof res === 'object' && 'ok' in res) {
    if (!res.ok) throw new Error(res.error || 'cap.config patch 失败')
    return res.result as T
  }
  return res as T
}

/** 直连宿主命令（usage_* / test_model_profile_connection / fetch_models_for_profile） */
export async function hostInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return getHostInvoke()<T>(cmd, args)
}
