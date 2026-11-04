# 执行沙箱（exec-sandbox）

AI 代码执行的一次性隔离工作区：创建 / 写文件 / 执行命令 / 列表 / 销毁五工具，文件落系统临时目录 24h 自动清理，严格根边界校验防越界，让 AI 跑代码不留痕、不污染宿主与数据根。

## 能什么

- **`execsandbox_create`**：在 `os.tmpdir()/polaris-exec-sandbox/<workspaceId>/` 下建一个一次性工作区，返回 id；list/create 时惰性扫描并销毁过期（>24h）沙箱。
- **`execsandbox_write`**：向工作区内写文件（路径 `path.resolve` 后必须位于沙箱根内，越界拒绝）。
- **`execsandbox_exec`**：在工作区 cwd 下执行命令（Windows `cmd /d /s /c`），默认超时 120s（上限同值），超时树杀；输出截尾 8KB 存历史。
- **`execsandbox_list`**：列出活跃沙箱与文件清单。
- **`execsandbox_destroy`**：销毁指定工作区（recursive rm + kv 清条目）。

面板提供活跃沙箱列表与手动销毁入口。

## 边界（如实声明）

- 隔离边界 = 目录隔离 + TTL + 根边界校验；exec 与宿主同权限级，**不做** Job Object/AppContainer 级进程沙箱。
- 不从宿主任意目录复制/读取文件作为工作区种子（防越界读）；内容由 AI 经 `write` 内联写入。
- 不做跨机/远程执行；不做执行历史持久化审计链（输出截尾存 kv 元数据即止）。
- 不替代 `cap.bash`（宿主能力走总线）；本插件是 MCP 层的独立隔离通道。

## 架构

```
AI ──MCP stdio──▶ mcp/server.js ──cap.kv(execsandbox.ws.<id>)──▶ 工作区元数据
                                            │
                                            ▼
                       os.tmpdir()/polaris-exec-sandbox/<id>/  （文件 + exec cwd）
面板 ──invoke──▶ 同一份 kv 元数据 → 列表 / 手动销毁
```

- 零依赖、零后台服务、零外联
- 元数据走 `cap.kv`（`execsandbox.ws.<id>`），不落 appConfigDir
- 仅 `aiToolAccess` 权限
