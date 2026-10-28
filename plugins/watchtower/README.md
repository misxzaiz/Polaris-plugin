# 守望台（watchtower）

> 插件运营台：用量计量（谁在被用 / 谁在浪费）+ 生命周期治理（服务启停 / 冷热分级 / 清理建议）。

- 面板（ActivityBar → 👁 守望台）：**总览**（活跃榜 / 冷门榜）/ **服务**（后台服务状态与启停）/ **治理**（冷门清理建议）/ **口径**（计量边界如实声明）
- AI 工具（MCP 9 个 `watchtower_*`）：聊天里说「看看哪个插件在用」「停掉 XX 的后台服务」「帮我清理冷门插件」即可
- **纯本地**：账本只在 cap.kv（`watchtower.*`），仅依赖宿主 `cap.kv` / `cap.pluginDiscovery` / `cap.pluginServiceManager` 三能力，零后台服务、零外网请求

## 为什么是它

插件越装越多，但**没人知道谁真的在被用**。marketplace 管「发现与安装」，守望台管「运行与健康」：
**统计是价值锚点，生命周期操作只是结果按钮**。

1. **让用量可见** —— 每个插件累计/近 1/7/30 天/末次/冷热分级
2. **让浪费被揪出** —— 冷门且后台服务仍在跑的插件 = 最高优先级清理项
3. **让治理可执行** —— 单插件服务启停 / 卸载（二次确认），不止于建议

与 marketplace 的边界：marketplace 做发现/安装/更新；本插件做统计/治理/服务启停，不做第二个商城。

## 双通道计量（核心机制）

| 通道 | 记的账 | 说明 |
|---|---|---|
| **MCP 工具调用** | 每次 `watchtower_*` 被调先自记 `source=mcp` | 经本插件触发的 AI 使用自动入账 |
| **面板打开** | 面板挂载记 `source=panel`，操作仍累计 | 用户亲手点开 = 一次使用 |
| **补记（覆盖全插件）** | `watchtower_report_usage` | AI 用别的插件时补记，扩展覆盖 |

两种来源分账（`trends[day].mcp/.panel`），聚合时可看单维或合并（工具调用加权 2 ×、面板 1 ×）。

**口径边界（如实交代）**：宿主**不广播**其它插件面板/工具事件，所以「别的插件被用」只能靠 AI 主动 `watchtower_report_usage` 补记——本面板的统计是**观测量**，不是宿主权威审计；不经本插件/面板入口的使用会被漏记。

## AI 工具（MCP）

| 工具 | 用途 |
|---|---|
| `watchtower_usage_stats` | 全插件用量总览（热冷榜/近N天/活跃分级/治理建议） |
| `watchtower_plugin` | 单个插件用量详情（累计/近N天/末次/是否在跑服务） |
| `watchtower_report_usage` | 手动补记一次插件使用（覆盖其它插件） |
| `watchtower_service_status` | 全部后台服务状态（running/exited/端口/pid/uptime/重启次数/错误） |
| `watchtower_service_start` | 启动某插件的后台服务 |
| `watchtower_service_stop` | 停止某插件的后台服务 |
| `watchtower_service_restart` | 重启某插件的后台服务 |
| `watchtower_cold_plugins` | 冷门/沉睡插件治理建议（含「冷门且服务在跑」高优项） |
| `watchtower_uninstall` | 卸载插件（仅限非内置，务必二次确认） |

## 对话示例

- 「看看哪些插件很久没用了」 → watchtower_usage_stats focus=cold
- 「XX 的后台服务还开着吗？帮我停掉」 → watchtower_service_status + watchtower_service_stop
- 「哪些插件在后台放着还占用端口」 → watchtower_cold_plugins + watchtower_service_status
- 「把刚用的那个插件也记一下账」 → watchtower_report_usage pluginId=xxx

## 数据契约（cap.kv `watchtower.*`，权威描述）

- `watchtower.usage.<pluginId>` → `UsageRecord`：
  - `{ pluginId, count, panelOpens, firstUsed, lastUsed, trends }`
  - `trends`：`{ 'YYYY-MM-DD': { mcp, panel } }`（日级分账）
- `watchtower.settings` → `{ schemaVersion: 1 }`（v1 预留）

计算核心 `shared/usage-core.js`（CJS `module.exports`，MCP `require` + 面板 esbuild 打包双端共用），一切口径一致。

## 开发

```
cd plugins/watchtower
npm install && npm run build && npm run typecheck   # 面板
node test/run-tests.mjs                             # core 离线单测
node test/mcp-verify.mjs                            # MCP 协议离线验证（无需宿主）
```

## 已知边界（如实交代）

- 统计是观测量，非宿主权威审计；不经本插件的使用会漏记（见「口径」）。
- 服务状态粒度 = 宿主 `cap.pluginServiceManager`（无 CPU/内存指标，只有 running/exited/端口/pid/uptime/重启次数/最近错误）。
- 批量停用/卸载不会做成 MCP 工具（避免越权），请走宿主插件设置。
- 卸载 = 宿主 `uninstall_local`（不触发 kill 进程清理；需要更强清理可提 issue 换 `uninstall_with_cleanup`）。