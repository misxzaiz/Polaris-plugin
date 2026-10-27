# 面板：构建 / 入口 / 宿主通道 / capDispatch

## 构建（esbuild，参数是硬约束）

```bash
esbuild src/index.tsx --bundle --format=esm --outfile=dist/panel.js \
  --jsx=automatic --external:react --external:react/jsx-runtime \
  --loader:.md=text --loader:.txt=text   # 后两个仅当内联文本资源时需要
```

- **React 必须 external**。文档另一处说「React 打进去」是**错的**——宿主经 blob URL + `__POLARIS_HOST_REACT__` shim 重写 import，React 打进去会直接 Invalid hook call 白屏。
- `format=esm` 固定。产物路径与 manifest `contributes.panel.entry` 对齐。
- 开发依赖只需：`esbuild`、`typescript`、`@types/react`（面板零运行时依赖）。

## 入口签名

```tsx
// src/index.tsx —— 宿主按 mod.default 加载
export default function MyPanelEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <MyPanel {...props} />
}
```

Tab 结构惯例见 `ui-ux`。

## 宿主通道（唯一数据入口）

```ts
type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
const invoke = (window as any).__POLARIS_HOST_INVOKE__   // 缺失 = 宿主太旧，给用户明确报错
```

桌面 Tauri 直连后端 IPC；手机/Web 自动取正确服务地址并带 Bearer token（Remote 源）。面板自身**绝不直接 fetch 任何地址**——见 `cross-origin`。

## capDispatch（与主仓 router_dispatch 对齐）

```ts
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>(
    'router_dispatch', { req: { target, payload } },
  )
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

// cap.kv 四动作
const v  = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })      // r.value ?? null
await capDispatch('cap.kv', { action: 'set', key, value })
await capDispatch('cap.kv', { action: 'delete', key })
const { keys } = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })     // 全局所有键！
```

服务管理：`cap.pluginServiceManager`（见 `service-start`）、插件发现：`cap.pluginDiscovery`、HTTP 转发：`cap.http`（见 `cross-origin`）。完整 payload 速查见 `caps`。

## 常见死法

| 症状 | 根因 |
|---|---|
| Invalid hook call 白屏 | React 没加 `--external` |
| 面板请求浏览器报 CORS / Mixed Content | 面板直接 fetch 了外网（应走服务或 cap.http） |
| invoke is not a function | 独立浏览器调试无宿主通道；做环境探测 + 回退 UI |
| 桌面好的手机不行 | 用了桌面专属通道（如 cap.http 默认对 Remote 源 deny）；数据面改走 cap.kv |
