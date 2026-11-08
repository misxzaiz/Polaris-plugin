/**
 * polaris-host/* 桥 stub（SSR 渲染冒烟用）
 *
 * 三个桥（artifact/form/cap）alias 到本文件：SSR 只走渲染路径，useEffect
 * 不执行，桥函数永远不会被调——存在且类型正确即可。真桥行为由宿主侧
 * hostBridge.test.ts 覆盖。
 */

export function readArtifactHtml(_sourcePath: string): Promise<string> {
  return Promise.resolve('')
}

export function openArtifactSource(_sourcePath: string): void {
  /* no-op */
}

export function registerComponent(_decl: unknown): Promise<unknown> {
  return Promise.resolve({})
}

export function submitForm(_formId: string, _values: unknown, _opts?: unknown): Promise<unknown> {
  return Promise.resolve({})
}

export function forwardCap(_data: unknown, _caps?: readonly string[]): Promise<unknown> {
  return Promise.resolve({ __polarisCap: 1 as const, id: 'x', ok: false, result: null, error: 'stub' })
}
