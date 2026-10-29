# AI 用量账（abacus）· AI 花销账房

把散落在三路本地数据里的 AI 用量算成一本账：**花了多少（token/钱）、花在哪（模型/项目/agent）、缓存帮你省了多少、哪里在漏钱（限流/重试/缓存未命中/未计价）**。

- **数据源（全部只读）**：ZCode 会话库 `~/.zcode/cli/db/db.sqlite`（model_usage 逐请求遥测 + tool_usage 工具遥测）、Claude Code 原生 `~/.claude/projects/**/*.jsonl`（逐消息 usage，**含子 agent 侧链**——成本账必须收侧链）、Polaris 聊天 `<dataRoot>/dialogs/*.jsonl` 首行 meta 的 `tokenUsage`（宿主网关结算的 `costUsd` 为该源权威成本）。
- **默认零外网**：唯一外网点是「从 LiteLLM 同步价目」，且只在服务进程发起、只针对台账中出现过的模型、只允许 https 公网 URL（SSRF 守卫）。
- **跨端同读**：聚合面经 cap.kv `abacus.*` 键空间发布，桌面 / 手机 / Web 三端面板与 MCP 看到同一份账。

## 口径地图（本插件的命门，改口径必先重测）

三种来源的 `input_tokens` 语义不同，计价前已显式归一：

| 源 | input_tokens 语义 | 全价输入 = |
|---|---|---|
| zcode model_usage | **含** cacheRead+cacheWrite（实证：input=73451, cacheRead=70464, computed=73692=input+out） | input − cacheRead − cacheWrite |
| claude JSONL | 不含（Anthropic API 惯例） | input |
| polaris tokenUsage | 不含（ai_event.rs「未命中缓存的输入 token（全价）」） | input |

- 成本 = 全价输入×in + cacheRead×cacheRead + cacheWrite×cacheWrite + out×out（USD / 百万 token）。
- **缓存节省** = Σ cacheRead × (全价 − 缓存读价)。账面外的钱，第一次可见。
- 未计价模型只记 token，成本=null 不编数；面板「设置」或 MCP `abacus_price_set` 补价即入账。
- 预设价目为 ≈公开牌价的占位值（`preset: true`），请按实际账单修正或用 LiteLLM 同步覆盖。

## 键空间契约（权威，cap.kv `abacus.*`）

| 键 | 写者 | 内容 |
|---|---|---|
| `abacus.meta` | 服务 | 心跳/版本/三源状态/口径说明（60s） |
| `abacus.summary` | 服务 | 四时段桶（today/d7/d30/all）+ 分源 |
| `abacus.daily` | 服务 | 日账（升序，≤120 天） |
| `abacus.models` | 服务 | 模型账本（成本/命中/TTFT/错误/近30天） |
| `abacus.projects` | 服务 | 项目账本（目录×源，≤60） |
| `abacus.quality` | 服务 | 错误/重试/TTFT/工具遥测/漏钱洞察 |
| `abacus.sessions` | 服务 | 最烧钱会话 Top（≤30） |
| `abacus.prices` | 面板 / MCP price_set | 价目表（USD/Mtok），服务 30s 热加载 |
| `abacus.settings` | 面板 | 数据源开关/fxRate/扫描间隔/同步 URL |
| `abacus.cmd.<n>` → `abacus.result.<n>` | 面板写 → 服务消费（先删后做） | op=rescan / sync_prices |

写者边界：聚合面**只由服务写**；prices/settings **只由面板与 MCP 显式工具写**；条目缓存落 `<appConfigDir>/abacus/entries.jsonl`（去重键，>130 天滚动裁剪）。

## MCP 工具（7 个）

`abacus_summary`（时段总账）/ `abacus_models` / `abacus_projects` / `abacus_quality` / `abacus_sessions` / `abacus_prices`（只读）/ `abacus_price_set`（唯一写入：补价目）。全部读聚合面，与面板同源同口径。

## 面板（5 Tab）

总览（四时段成本卡 + 14 天 token 堆叠柱 + 分源成本条 + 洞察）/ 模型 / 项目 / 质量（错误、TTFT、工具遥测、完整洞察）/ 设置（价目表编辑、源开关、重扫与 LiteLLM 同步、口径说明）。

## 本地验证

```bash
npm install && npm run build && npm run typecheck   # 面板
node --test test/run-tests.mjs                      # 离线单测（14 例）
node test/smoke-real.mjs                            # 真实桥冒烟（Polaris 运行中；服务独立跑 + MCP 对账 + 自清理）
```

冒烟钩子：env `ABACUS_SMOKE_ROOT=<dir>` 把三源定位限制到 `<dir>/zcode/db.sqlite`、`<dir>/claude/`、`<dir>/dialogs/`（仅测试用）。

## 已知边界（如实交代）

- Polaris 生产数据根当前 dialogs 里 tokenUsage 覆盖有限（v3 格式 2026-10 起才有；session-v2 存储无 usage、simple-ai 新会话 meta 未写 tokenUsage）——该源有则入账、无则如实显示 0，不掩盖；主仓补落盘是后续工作项。
- claude 会话标题取「自动摘要 → 首条用户消息」兜底；未压缩过的会话可能无摘要。
- zcode `cache_creation` 上游恒为 0（网关未回传），缓存写价目保留但不参与计算。
