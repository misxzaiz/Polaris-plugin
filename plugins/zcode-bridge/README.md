# zcode-bridge — ZCode 会话桥接插件

桥接**已安装的 ZCode 桌面版**（`D:\app\ZCode`）会话：让 Polaris 的 AI 能新建 / 续接 / 查看 ZCode 会话，且新会话落盘到 `~/.zcode/cli/db/db.sqlite` 后，**桌面 ZCode 端可见**。

不走截图 UI 操作，直接走官方 `app-server --stdio` 协议（与桌面端同款）。

## 工具

| 工具 | 输入 | 行为 |
|---|---|---|
| `zcode_list_sessions` | `limit` | 读 db.sqlite，列最近会话（含 workspaceId/directory/更新时间） |
| `zcode_create_session` | `workspacePath?` `mode?` | 经 app-server 协议创建会话，返回 sessionId |
| `zcode_send_message` | `sessionId?` `content` | 向会话发消息（传 sessionId 即续接，等价 `zcode --resume`） |

## 架构

```
Polaris AI ── MCP stdio ──▶ zcode-bridge/mcp/server.js       (JSON-RPC 2.0)
                                 │   spawn（独立管道）
                                 ▼
                    zcode.cjs app-server --stdio              (ZCode 官方协议 NDJSON)
                                      │   session/create · session/send · session/list
                                      ▼
                        ~/.zcode/cli/db/db.sqlite  ──▶ 桌面 ZCode 可见
```

- MCP server 自身 stdin/stdout 与宿主通信；zcode 子进程用独立管道，互不冲突。
- create 后子进程**常驻**复用；send 到其它 sessionId 即弃旧启新（等价换会话）。
- `node:sqlite` 只读查询 db.sqlite，用于 list + 落盘可见性验证。

## 关键契约（桌面可见性闭环，实测验证）

1. spawn `zcode.cjs app-server --stdio --surface desktop`，`cwd` = 工作区路径。
2. `session/create` **不传 workspaceIdentity** → 落盘时 `workspace_id=null`。
3. create 必须应答 server 反向 request `session/requestRuntimePreferences`（15s 内，否则创建失败）。
4. `session/send` 触发真实模型轮 → 落盘 db.sqlite（`directory`=路径、`workspace_id` 空）。
5. 桌面 Host 下次订阅 sessions-index 冷启动时以 db.sqlite 为种子收编 → **桌面列表可见**。插件无需写 tasks-index。

## 配置

| 环境变量 | 默认 |
|---|---|
| `ZCODE_CJS` | `D:/app/ZCode/resources/glm/zcode.cjs` |
| `ZCODE_PROVIDER_CONFIG` | 自动探测 `~/.zcode/v2/runtime/provider/windows-x86_64/<ver>/endpoint-*/zcode-builtin.json`（取最新） |
| `ZCODE_WORKSPACE_PATH` | 工作区路径（MCP 由 `{{workspacePath}}` 注入） |

无 provider 配置时自动探测，剥离对具体版本的硬依赖。

## 测试

```bash
node plugins/zcode-bridge/test/smoke.cjs
# 6/6 passed：initialize / tools/list / list_sessions / create / send / 落盘验证
```

## 边界 / 后续

- **与 ZCode 冲突**：app-server 直连 db.sqlite，若桌面端正独占写同库，宽限读写（`node:sqlite` 只读 + ZCode 自带锁），实测多进程并存无冲突。
- **cap.http 的角色**：ZCode 协议不走 HTTP（stdio NDJSON）。cap.http 是**协作通路**——将来做远程 ZCode 托管、面板 IPC、配置下发时经宿主桥；核心桥接仍为本地子进程。
- 面板（`zcode-bridge.panel`）本期占位，后续可接会话列表可视化。