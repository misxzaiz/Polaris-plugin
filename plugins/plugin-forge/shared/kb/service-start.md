# 面板自举服务 start（discover + contribution）

服务一般靠 `autoStart:true` 自动拉起。但需要面板手动 start/restart（比如装完插件、或服务被判死后）时有个大坑：

**`cap.pluginServiceManager` 的 `start` 动作必须带 `installPath` + `contribution`**，只传 pluginId/serviceId 会失败（stop/restart 只需后者）。面板不知道自己装在哪，所以要经插件发现自举（page-sentinel `src/model.ts` 验证过的完整代码）：

```ts
// ① 列状态（注意：list_status 无参，返回裸数组）
const st = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })

// ② 从发现结果里找自己：拿 installPath 与服务贡献
const r = await capDispatch<{ plugins?: Array<{
  id: string; installPath: string
  contributes?: { services?: Record<string, unknown>[] }
}> }>('cap.pluginDiscovery', { action: 'discover' })
const self = (r.plugins ?? []).find((p) => p.id === PLUGIN_ID)
const svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID)

// ③ start 必须按后端 toBackendContribution 形态传贡献（缺字段=启动失败）
await capDispatch('cap.pluginServiceManager', {
  action: 'start', pluginId: PLUGIN_ID,
  installPath: self.installPath,
  contribution: {
    id: svc.id,
    type: svc.type ?? svc.serviceType,
    command: svc.command,
    argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
    port: svc.port ?? null,
    healthCheck: svc.healthCheck ?? null,
    healthCheckTimeout: svc.healthCheckTimeout ?? null,
    autoStart: svc.autoStart ?? true,
    restartOnFailure: svc.restartOnFailure ?? true,
    maxRestarts: svc.maxRestarts ?? 3,
    description: svc.description ?? null,
  },
})

// stop / restart 只需：
await capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
```

**历史坑**：老文档教的 `plugin_service_*` Tauri 命令**已删除**（主仓 main.tsx 的 HOST_INVOKE_ALLOWLIST 里还有残留条目，别被误导）。面板一律走 `router_dispatch → cap.pluginServiceManager`。

面板设置页的服务管理卡：显示 list_status 里自己服务的 running/stopped、最近错误，给 start/stop/restart 三钮（start 走上面三步）。
