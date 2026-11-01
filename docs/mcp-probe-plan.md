# MCP 调试台（mcp-probe）产品与技术方案

> 2026-11-01 立项。方向硬约束自查：核心动作是「连接 / 枚举 / 调用 / 体检 / 对比 / 诊断」——变换与诊断类，非记录台账类，合规。
> 命名纪律自查：显示名「MCP 调试台」为直白功能名（对齐 webhook-station「Webhook 调试台」），id `mcp-probe`。

## 一、产品定位

**一句话**：在 Polaris 里连接、枚举、调用、体检任意 MCP 服务器——宿主已装插件的 MCP 工具零成本直查，外部 stdio/HTTP 服务器一键接入，AI 可代劳全程调试。

**目标用户**：
1. Polaris 插件开发者（生态内 61 个插件每个都带 MCP 工具，联调是刚需）；
2. 在 Polaris 里配置了外部 MCP 服务器的用户（排查「AI 看到的 schema 是不是旧的」「这个工具到底返回什么」）；
3. 给 AI 配工具的人——想在「交给 agent 用」之前先人工验证工具行为。

**现有解决方式与缺口**：
- 官方 `@modelcontextprotocol/inspector`：npx 临时起 Web UI，无档案持久化、无调用历史、无快照 diff、每次重新配置；且不认识 Polaris 的插件 MCP 注册表。
- MCPJam / Manufact Inspector 等第三方：Docker 或独立部署，面向 CI/评测，不进个人工作台。
- 宿主内：PluginTab 只有 per-tool 门（管理面），没有「调用-看结果-量延迟-比差异」的调试面；AI 能调工具但没有结构化体检报告。
- 本仓自身开发史反复踩 MCP 坑（schema 陈旧导致 AI 看旧工具、方法名笔误、双重解包），每个坑都要临时写脚本排查——需要一个常驻调试台。

**证据（外部）**：
- MCPJam、Manufact Inspector 等多个调试工具在 2025-2026 涌现并融资/迭代，赛道被验证（reddit r/modelcontextprotocol 多帖讨论 Inspector 不足）；
- 社区反复抱怨「工具在 Inspector 里测试通过、agent 实际仍选错/用错」，指向需要超越单次调用的结构化检查（描述质量、schema 规范性体检）；
- Braintrust 等把「MCP 测试工具」单列成文（best-mcp-testing-tools-2026），属公认品类。

**证据（内部，本仓可查）**：
- `cap.mcp` 已有 `list_plugin_tools`/`call`（`Polaris/src-tauri/src/services/router/mcp_capability.rs`）——宿主已具备插件 MCP 的统一代理面，插件可直接复用，这是竞品做不到的生态位；
- AGENTS.md「MCP list 接口 schema 改动后须重新构建独立 bin，否则 AI 看到旧 schema」——快照 diff 直接命中此痛点。

## 二、候选池与评分（0-5 分 × 权重，满分 100）

| # | 候选 | 痛点20% | 频率15% | 缺口15% | 差异15% | 收益15% | 适配10% | 可行5% | 成本5% | 加权 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **MCP 调试台** | 5 | 4 | 5 | 5 | 4 | 5 | 5 | 4 | **93.0** |
| 2 | HTTP Mock 服务台（假接口，AI 生成） | 4 | 4 | 4 | 3 | 4 | 5 | 4 | 4 | 79.0 |
| 3 | 日志哨兵（多文件 tail+规则+AI 摘要） | 4 | 4 | 3 | 3 | 4 | 4 | 4 | 4 | 75.0 |
| 4 | 仓库体检（大文件/TODO 密度/依赖过期） | 3 | 3 | 4 | 3 | 3 | 4 | 4 | 4 | 68.0 |
| 5 | 域名/证书哨兵（RDAP+DoH+crt.sh 纯 HTTP） | 3 | 2 | 4 | 3 | 3 | 4 | 4 | 4 | 65.5 |
| 6 | Prompt 评测台（promptfoo 型矩阵） | 4 | 2 | 3 | 2 | 3 | 3 | 3 | 2 | 60.5 |
| 7 | 正则工坊 | 3 | 3 | 3 | 2 | 3 | 4 | 5 | 5 | 59.5 |
| 8 | OpenAPI 契约哨兵（breaking diff） | 4 | 2 | 3 | 3 | 3 | 3 | 3 | 2 | 60.0 |
| 9 | 文件监视自动化台 | 3 | 3 | 3 | 2 | 3 | 4 | 3 | 3 | 60.0 |
| 10 | 图片批处理工坊 | 3 | 3 | 2 | 2 | 3 | 4 | 4 | 3 | 58.0 |

已占域剔除（不做）：API 调试台/JSON/SQL 工具箱（relay-devkit v1.5.1）、Webhook 调试台（webhook-station）、图片变换（imgforge）、PDF（纸坊）、Excel（格致）、全文检索（韦编）、磁盘分析（磁盘雷达）、局域网传输（口袋快传）。

**选 #1 的理由**：唯一同时满足「生态内零占位 + 竞品验证赛道 + 平台独占差异化（cap.mcp 生态位）+ 三件套架构完全命中」的候选。最大不确定性：外部用户是否满足于官方 Inspector——用「宿主插件直查 + AI 代劳 + 档案/历史/快照持久化」三个官方没有的点对冲；若无人用，止损点为零外部依赖、代码可整体当调试脚本用。

## 三、MVP 范围

**做**：
1. 三个来源统一工作台：宿主插件 MCP（cap.mcp 代理，零重复 spawn）、外部 stdio 服务器（自研客户端 spawn）、外部 streamable HTTP 服务器（自研客户端 fetch）。
2. 调试台：工具清单（搜索）→ inputSchema 自动表单 + 原始 JSON 双模式 → 调用 → 结果/耗时/isError；重放。
3. 体检：连接延迟、握手协议版本、tools/list 延迟、schema 卫生检查（缺描述/重名/非法 schema）、绝不自动调用工具（无副作用）。
4. 快照与 diff：tools 清单快照，检测工具增删与 description/schema 漂移。
5. 历史：调用记录（按档案+工具过滤、上限 200 条、可清空、可重放进调试台）。
6. Claude 式配置一键导入：`~/.claude/settings.json`、`<workspace>/.mcp.json`、`<workspace>/.claude/settings*.json`（与宿主 mcp_manager_service 同路径口径）。
7. AI 七工具：probe_list_servers / probe_connect / probe_call_tool / probe_health_check / probe_diff_tools / probe_recent_calls / probe_scan_claude_configs。

**不做（明确出界）**：OAuth 授权流调试（MCPJam 赛道）、resources/prompts 的深度调用（仅枚举）、SSE 旧版 transport、远程云端 MCP 网关、性能压测、toolProvider/capability 覆盖链调试。

**成功指标**（可验证口径）：联调一个新插件 MCP 工具从「改代码→重构建 bin→重启宿主→chat 试」约 3-5 分钟，压缩到「面板连接→调用→看 JSON」约 10 秒；体检能在 5 秒内指出缺描述/非法 schema 的工具；AI 一句话完成「连上→列工具→试调→报告」。

## 四、架构

```
面板 React (src/)                    后台服务 (service/probe.js, 127.0.0.1:{{port}})
  │  XHR 直连（pocket-drop 先例）        │  唯一写者：probe.* 全部 kv 键
  │  ────────────────────────────────►  │
  │  降级只读：router_dispatch cap.kv    ├─ mcpclient.js（stdio 换行 JSON-RPC + streamable HTTP）
  │                                     ├─ imports.js（Claude 配置扫描）
  └─ host.ts: 取 probe.meta 端口+token   └─ kvclient.js（宿主桥，yizhou 样板）
mcp/server.js（AI 工具层，stdio JSON-RPC）
  └─ 全部委托服务 HTTP；服务不在则明确报错
共享纯函数 shared/probe-core.js（表单推导/diff/体检评分/SSE 解析/win32 引命令/脱敏/配置解析）
```

**事件顺序与所有权**：外部服务器连接的唯一所有者是服务进程（面板与 AI 工具都不 spawn）；宿主插件 MCP 的唯一所有者是宿主 McpClientRegistry（本插件绝不重复 spawn，走 cap.mcp）；kv 键 `probe.*` 唯一写者是服务；面板对 kv 只读（降级视图）。

**安全**：服务仅绑 127.0.0.1 + Bearer token（首启生成，存 probe.meta）；CORS 仅对本地 origin 回显；AI 工具只能引用已注册档案 serverId，不接受裸命令行（spawn 仅限面板/导入产生的档案）；stdio 子进程超时后杀死（状态不可信）；env/headers 中疑似密钥键在列表展示时脱敏（调试结果全文保真，仅存本地数据根）；服务退出 SIGTERM 逐一杀子进程，防孤儿。

## 五、验收

- `tsc --noEmit` 通过；esbuild 面板构建通过。
- `node test/run-tests.mjs`：纯函数 + 配置解析 + win32 引命令 + SSE 解析 + diff + 体检评分，≥40 断言。
- `node test/mcp-bridge.mjs`：stub 宿主桥 + 真服务 + 真 MCP 工具进程 + 假 stdio/HTTP MCP 服务器全链路，≥45 断言（含超时/未知工具/未注册 serverId 拒绝）。
- `node test/smoke-real.mjs`：真宿主上建临时档案→连接假服务器→调用→历史→体检→快照 diff→清理，全绿自清理。
- jsdom 渲染 harness 无白屏、四 Tab 可达。
- `node scripts/pack.js plugins/mcp-probe` 产 zip；index.json 条目过 `scripts/validate.js`。
