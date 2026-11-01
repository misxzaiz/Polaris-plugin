# MCP 调试台（mcp-probe）

在 Polaris 里连接、枚举、调用、体检任意 MCP 服务器。宿主已装插件的 MCP 工具零成本直查（`cap.mcp` 代理，零重复 spawn），外部 stdio / streamable HTTP 服务器一键接入并常驻档案，AI 可代劳全程调试。

## 解决什么问题

- 「这个 MCP 工具到底返回什么？」——调试台选源 → 连接 → 点工具 → 看原始 JSON 与耗时，10 秒内完成。
- 「AI 看到的工具 schema 是不是旧的？」——快照 + 漂移对比（新增/移除/描述或 schema 变更）。
- 「发布前工具写法合不合规？」——体检：握手/清单延迟、协议版本、schema 卫生（缺描述、重名、非法 inputSchema），**绝不自动调用工具，零副作用**。
- 「我 Claude 配置里的 MCP 服务器想在 Polaris 里试」——一键扫描导入 `~/.claude/settings.json`、`~/.claude.json`、`<workspace>/.mcp.json`、`<workspace>/.claude/settings*.json`。

## 使用

### 面板（四个 Tab）

| Tab | 能力 |
|---|---|
| 服务器 | 宿主插件 MCP 清单（只读直查）；外部档案增删改查、连接/断开；Claude 配置扫描导入 |
| 调试 | 选源 → 工具搜索 → inputSchema 自动表单 / JSON 编辑 → 调用 → 结果 JSON + 耗时 + isError |
| 体检 | 全量/单个体检 + 报告留档 + 拍快照 + 漂移对比 |
| 历史 | 调用记录（参数/结果全文、耗时、来源面板/AI），可重放进调试台、可清空（上限 200 条） |

### AI 工具（对 Polaris 助手说）

| 工具 | 触发话术示例 |
|---|---|
| `probe_list_servers` | 「列出宿主所有插件的 MCP 工具」 |
| `probe_connect` | 「连上 xxx 看看有哪些工具」 |
| `probe_call_tool` | 「帮我调一下 xxx 工具，参数 …」（有副作用前请让 AI 先确认） |
| `probe_health_check` | 「给所有 MCP 服务器做个体检」 |
| `probe_diff_tools` | 「对比一下 xxx 的工具有没有漂移」 |
| `probe_recent_calls` | 「刚才都调了什么」 |
| `probe_scan_claude_configs` | 「把我 Claude 配置里的 MCP 导入调试台」 |

## 架构

```
面板 React ──HTTP(127.0.0.1+token)──► 后台服务 probe.js（唯一 spawn 所有者）
    │                                    ├─ mcpclient.js（stdio 换行 JSON-RPC / streamable HTTP+SSE）
    │(降级只读)                           ├─ imports.js（Claude 配置扫描）
    └──router_dispatch cap.kv◄──────────┴─ kvclient.js（宿主桥，yizhou 样板）
mcp/server.js（7 个 AI 工具）──HTTP──► 同一后台服务
```

- 数据面：`cap.kv` 的 `probe.*` 键空间，**唯一写者是后台服务**（面板/AI 工具只经服务读写）。
- 宿主插件 MCP：经 `cap.mcp`（`list_plugin_tools` / `call`）代理，本插件**绝不重复 spawn** 宿主已注册的服务器。
- 外部服务器：服务进程统一 spawn/建连；调用超时的 stdio 连接判为不可信并杀死子进程（幂等边界：超时不产生双写）。
- 空闲 15 分钟的 stdio 连接自动断开；服务 SIGTERM 逐一关子进程，不留孤儿。

## 安全

- 服务仅绑 `127.0.0.1`；除 `/__health` 探针外全部要求 `Bearer token`（首启生成，存 `probe.meta`，仅宿主桥可读）。CORS 回显 origin 只为过浏览器预检，安全门是 token。
- AI 工具只能引用已注册档案的 `serverId`，不提供按裸命令行 spawn 的工具。
- 档案的 env/headers 中疑似密钥键（token/key/secret/password/authorization…）在清单展示时脱敏为 `******`；调试结果全文保真（仅存本机数据根，不出网）。
- 体检绝不执行工具调用；调用行为只发生在用户或 AI 明确发起时。

## 验证

```
npm run typecheck          # tsc --noEmit
node test/run-tests.mjs    # 纯函数单测 34 断言
node test/mcp-bridge.mjs   # 内存桥全链路 27 断言（stub 宿主 + 真服务 + 真工具层 + 假 stdio/HTTP MCP 服务器）
node test/render-harness.mjs # jsdom 渲染 10 断言（白屏/Invalid hook/Tab 切换）
node test/smoke-real.mjs   # 真桥冒烟 13 断言（需本机 Polaris 在跑；自清理 probe.* 键）
```

## 已知限制

- 不做 OAuth 授权流调试（streamable HTTP 仅支持静态 header 鉴权，如 `Authorization=Bearer xxx`）。
- resources / prompts 仅枚举不调用；不做旧版 SSE-only transport（legacy 条目会标注 legacy-sse，按 streamable 尝试）。
- 宿主插件的「调用」走 `cap.mcp call`，返回的是宿主聚合文本（content[0].text），与面板里外部服务器的原始结果相比保真度略低。
- 历史单条结果截断 64KB / 参数 16KB；快照超 512KB 时丢弃 inputSchema 保名字与描述（界面标注）。
- Windows 下 npx/npm/pnpm/yarn/uvx 等 .cmd shim 经 `cmd.exe /d /s /c` 引命令（参数含特殊字符时按 win32 引号规则转义）；node/python 等直接 spawn。
