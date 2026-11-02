# 容器工作台（docker-desk）

不开 Docker Desktop，在 Polaris 里**看容器 / 查日志 / 盯资源 / 清垃圾**；AI 经 MCP 工具直接「看见」你的容器并解释报错——数据不出本机。

## 它解决什么

- **Docker Desktop 又慢又吃内存**：社区长期抱怨内存泄漏、容器操作 30 秒级、需要定期重启（见选型文档 `docs/docker-desk-selection.md` 引用）。本插件是一个只读优先、开箱即用的轻量视图：容器状态、端口映射、compose 分组、日志、资源快照，装在 Polaris 里，随主应用即开。
- **排障要来回切窗口**：容器崩了/重启了，日志、事件、inspect、stats 四个视角一屏看完；「问 AI」按钮把当前日志直接发进 AI 会话分析根因。
- **AI 看不见你的容器**：主会话 AI 装上本插件后具备 8 个只读容器工具（`dk_*`），对话里直接说「看看 web-nginx 为什么重启了」，AI 自己查事件、拉日志、看 inspect。
- **隐私**：日志与 inspect 只在内存流转（不落盘、不进 kv）；经 AI 通道的 inspect 默认把 env 值打码，防密钥进入 AI 上下文。

## 快速上手

1. 启动 Docker（Desktop 或 Engine），打开面板——状态栏变绿即连上（无需任何配置）。
2. **容器**页：按 compose 项目分组看全部容器；启/停/重启单点完成；删除需精确输入容器名。
3. **日志**页：选容器 → tail 加载；勾「live 跟随」即 `tail -f` 式流式；「问 AI」把最近日志发给会话。
4. **资源**页：运行中容器的 CPU%/内存/网络/块 IO 快照（2.5s 轮询）。
5. **镜像**页：列表 + 磁盘占用汇总（含 dangling 数量与可回收估算）；删除需精确输入镜像名。
6. **事件**页：service 启动以来的容器事件流水（die/start/oom/health…），回答「为什么重启」。
7. **诊断**页：连接详情、只读自检、Docker 未连接的分步排查指引。

### AI 工具（MCP，全部只读）

| 工具 | 用途 |
|---|---|
| `dk_status` | 引擎连接状态与概览（排查「AI 看不到容器」先调这个） |
| `dk_ps` | 容器列表（all=true 含已退出），compose 项目分组 |
| `dk_logs` | 日志尾部（可关键字过滤），排查崩溃/OOM 首选 |
| `dk_inspect` | 详情 JSON（env 默认打码；用户明确同意才可 `showEnv:true`） |
| `dk_stats` | 运行中容器资源快照 |
| `dk_images` | 镜像列表 + 磁盘可回收汇总 |
| `dk_events` | 最近事件流水（为什么重启/退出） |
| `dk_selftest` | 只读自检 |

**AI 通道只读是结构保证**：`/mcp/*` 路由组在服务端就不存在任何写端点；启停/重启只在面板，删除类操作需精确输入名称（服务端校验）。

## 架构

```
shared/core.js     纯逻辑零依赖：格式化/端口解析/compose 分组/CPU%公式/日志 demux（跨 chunk 半行半帧）/df 汇总/自检
service/engine.js  Docker Engine API 客户端（零依赖）：named pipe(Windows)/unix socket/tcp，API 钉死 v1.41（Docker 20.10+）
service/main.js    HTTP 服务（127.0.0.1，Bearer token）：/api/* 面板通道（写操作+typed confirm）、/mcp/* 只读通道、事件泵（断线退避重连+since 补缺口）、日志 follow 流式转发
service/kvclient.js 宿主 IPC Bridge 客户端（house 验证样板，env>anchor>config>扫描 四级发现）
service/store.js   kv 边界：只写 dkd.service 发现记录+心跳；日志/事件/inspect 一律不落盘
mcp/server.js      stdio JSON-RPC 八工具（发现链 kv → service /mcp/*）
src/               React 面板六 Tab（TS strict）：容器/日志/资源/镜像/事件/诊断
assets/icon.svg    面板图标（自定义相对路径值域）
```

## 开发

```bash
npm install
npm run typecheck            # tsc --noEmit（strict）
npm run build                # esbuild → dist/panel.js
node test/run-tests.mjs      # 离线单测 + 静态安全断言（22 断言，零网络）
node test/service-tests.mjs  # 假宿主 bridge + 假引擎 + 真 service 子进程 HTTP 全链路（42 断言）
node test/mcp-tests.mjs      # + 真 MCP stdio 子进程全链路（20 断言）
node test/smoke-real.mjs     # 真桥冒烟（需 Polaris 宿主运行中；本机无 Docker 时验证诚实降级路径，10 断言）
```

测试策略：`test/fake-engine.mjs` 按官方 Engine API v1.41 响应结构构造假引擎（TCP），service 以 `--engine=tcp://127.0.0.1:<port>` 指向它实现全链路离线验证；测试用 `POLARIS_HOST/PORT/TOKEN` env 直指假宿主 bridge（否则 anchor.json 会解析到本机真实 Polaris——实测踩坑）。

## 护栏与隐私

- **AI 只读**：`/mcp/*` 无写端点；`dk_*` 工具名不带任何写语义。
- **写操作护栏**：删除容器/镜像需精确输入名称（服务端 `confirm` 校验，不是前端装饰）；无 exec、无一键 prune、无 compose 编排命令。
- **不落盘**：日志（内存 FIFO 5000 行上限）、事件（环形缓冲 500 条）、inspect 均只在内存；kv 只存 `dkd.service` {port, token, pid, 心跳}。
- **env 打码**：MCP inspect 默认 `<masked>`，`showEnv:true` 是显式用户同意语义。
- **token**：service 仅绑 127.0.0.1，Bearer token 随机逐次启动，经宿主 cap.kv 分发给面板/MCP；下线时注销（stdin 关闭优雅退出；Windows 强杀场景靠心跳过期检测兜底）。

## 已知边界（如实）

- **兼容 Docker 20.10+**（Engine API ≥ v1.41）；不支持 swarm/k8s。
- **不做**：容器 exec 终端、compose 编排命令（up/down，需 CLI）、镜像构建、多引擎切换（`DOCKER_HOST` 环境变量支持远程单引擎）。
- **资源页是单帧快照**：Engine 不提供历史曲线，如实标注。
- **验证边界**：本机未装 Docker，容器操作路径经「假引擎全链路 + 真桥降级路径」验证；真机 Docker Desktop 全流程（pipe 连接、真实容器操作）待装 Docker 后复验，端点解析与协议实现以官方 API 文档为准。
- Windows 首次使用若报无权限：把当前用户加入 `docker-users` 组后注销重登。
