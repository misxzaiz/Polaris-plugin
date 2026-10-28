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

## 引擎模型选择（v0.1.3，主对话 ZCode 引擎）

在 Polaris 主对话选 ZCode 引擎 + 供应商 Profile + 模型，引擎按轮 `session/setModel` 切换（会话中途换模型下一轮生效；失败自动降级 ZCode 默认，不中断轮次）：

- **套餐模型**：Profile 填 BigModel 控制台签发的**套餐 API Key**（桌面 OAuth 密钥是 `enc:v1:` 加密态不可直接用）+ `https://open.bigmodel.cn/api/anthropic` + 模型 `GLM-5.3` / `GLM-5.3-Flash`。
- **自建端点**：Profile 照常填（如 localhost 代理），引擎同路处理（V4 握手失败自动 fail-open 明发）。
- 机制：引擎把 Profile 的端点/密钥/模型生成**插件私有** personal provider 配置（真实配置深合并，不碰桌面 `provider_config.json`），经 `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` 注入自持 app-server。细节与协议实测结论见 [PLAN-model-select.md](./PLAN-model-select.md)。
- 可选 Profile custom_env：`ZCODE_REASONING_LEVEL`（档位偏好，默认阶梯 high→medium→low 自动补齐）、`ZCODE_MODEL_PROVIDER` / `ZCODE_MODEL`（显式覆盖）、`ZBRIDGE_DEFAULT_MODE`（会话权限，默认 yolo）。

## 测试

```bash
node plugins/zcode-bridge/test/smoke.cjs                    # 6/6：面板 MCP 回归
node plugins/zcode-bridge/test/unit-model-select.cjs        # 16/16：模型选择纯函数
node plugins/zcode-bridge/test/integration-engine-model.cjs # 16/16：引擎级（需自建端点可达）
```

## 边界 / 后续

- **与 ZCode 冲突**：app-server 直连 db.sqlite，若桌面端正独占写同库，宽限读写（`node:sqlite` 只读 + ZCode 自带锁），实测多进程并存无冲突。
- **cap.http 的角色**：ZCode 协议不走 HTTP（stdio NDJSON）。cap.http 是**协作通路**——将来做远程 ZCode 托管、面板 IPC、配置下发时经宿主桥；核心桥接仍为本地子进程。
- 面板（`zcode-bridge.panel`）本期占位，后续可接会话列表可视化。