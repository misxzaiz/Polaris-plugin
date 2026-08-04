# 插件 #6 调研分析：agent-trace（MCP 工具调用追踪器）

> 10 轮分析。来源：Google AI 概览（MCP Inspector/mcp-probe/Langfuse 痛点）。

## 轮 1：痛点验证
- 不透明 stdio 边界：本地 stdio 通信隐藏 host↔server payload 错误
- schema 漂移：工具描述差→LLM 选错工具/传错 JSON，无明确异常
- trace 爆炸：多步 agent 循环产生海量 span，tools/call 被埋没
- 现有：MCP Inspector（交互 UI）、mcp-probe（终端）、Langfuse/Langsmith（SaaS）

## 轮 2：差异化检查
- 已有：MCP Inspector、mcp-probe、Langfuse、Maxim、Honeycomb
- Polaris 差异化：**本地追踪器**——AI agent 调用 MCP 工具时，本插件记录调用日志（工具名/入参/出参/耗时/错误），Panel 时间线可视化，可导出。无 SaaS 账号。
- 与 recall 区别：recall 是复习卡，本插件是调用追踪日志。

## 轮 3：Polaris 扩展点组合
- MCP：`log_call(tool, args, result, ms, error)` 记录一次调用、`query_traces(filter)` 查询、`export_traces(format)` 导出
- Panel：时间线列表 + 调用详情 + 过滤
- ChatCard：result 渲染某次调用详情
- 注：log_call 由 AI 在每次工具调用后主动调用（或用户手动），形成追踪闭环

## 轮 4：技术可行性
- MCP + JSON 持久化：调用记录数组
- Panel：时间线 UI
- 可行，轻量

## 轮 5：竞品对比
| 方案 | 本地 | 调用追踪 | 时间线 | 导出 | 免账号 |
|------|------|----------|--------|------|--------|
| MCP Inspector | ✓ | 部分 | ✓ | ✗ | ✓ |
| Langfuse | ✗ | ✓ | ✓ | ✓ | ✗ |
| **本插件** | ✓ | ✓ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- agent 开发者：⭐⭐⭐⭐⭐ 调试 MCP 工具调用链
- 上班族：⭐⭐ 审计 AI 操作
- 学生：⭐⭐ 理解 agent 行为
- 综合：agent 开发者核心痛点。

## 轮 7：实现复杂度
- MCP：低（记录+查询+导出）
- Panel：中（时间线+详情）
- ChatCard：低
- 总体：2 轮。

## 轮 8：MVP
- MCP：log_call / query_traces / export_traces(jsonl|csv) / clear_traces
- 字段：ts / tool / args / result(摘要) / ms / error
- Panel：时间线 + 过滤 + 详情面板 + 清空/导出

## 轮 9：风险
- AI 不主动 log_call → 对策：提示 AI 在调用其他工具后调用 log_call；或用户手动记录
- 数据量大 → 限制最大记录数（如 1000 条）

## 轮 10：决策
✅ 通过。开发 `polaris.agenttrace`（MCP 调用追踪器）。
- 扩展点：MCP（记录/查询/导出）+ Panel（时间线）+ ChatCard（result）
