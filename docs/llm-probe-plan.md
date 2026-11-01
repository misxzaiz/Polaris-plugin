# 模型体检台（llm-probe）选型与设计

> 2026-11-02。方向硬约束对齐：工具/技术/诊断类（非台账非记录）。核心动作 = 「诊断了/量化了什么」。

## 1. 候选池与筛选（外部证据见 §2）

| 候选 | 结论 | 原因 |
|---|---|---|
| 开发者工具箱/API 客户端 | ❌ 已占用 | relay-devkit v1.5.1（API 客户端/JSON/SQL/时间戳） |
| 密钥扫描 | ❌ 已占用 | keyscan 昨日交付（606dc38） |
| 日志分析台 | ❌ 并行会话 WIP | log-lens 未提交，避撞 |
| repo→LLM 上下文打包 | ❌ 并行会话 WIP | context-pack 未提交，避撞 |
| MCP 调试 / Webhook 调试 / 网络探测 / 页面监测 | ❌ 已占用 | mcp-probe / webhook-station / net-sentinel / page-sentinel |
| Mock 服务器 | ❌ 淘汰（72.5） | 需求真实（Mockoon 90 万下载）但竞争极度拥挤：MSW/WireMock/Beeceptor/Apidog/Postman Mock；差异化薄、服务生命周期复杂 |
| WebSocket 调试台 | ❌ 淘汰（62.5） | 痛点强度/频率不足，wscat+Postman 覆盖 |
| 依赖体检（lockfile+OSV） | ❌ 淘汰（62.5） | 场景低频（npm audit/OSV 免费覆盖），差异化薄 |
| TLS 证书哨兵 | ❌ 淘汰（63） | 疼痛 episodic，net-sentinel 相邻 |
| **LLM 接口体检台** | ✅ **选定（88）** | 见下 |

## 2. 需求证据（可追溯）

1. **LiteLLM 项目自建体检**：`litellm --test` / `--health` / `/health` 端点源自用户 feature request（github.com/BerriAI/litellm/issues/919）——供应商连通性验证是基础设施级需求。
2. **终端用户高频配置故障**：r/LocalLLaMA / r/ollama 反复出现 connection refused（OLLAMA_HOST=0.0.0.0 坑）/ model not found（tag 不匹配）求助帖（1rh0akj、1dack04、1g7zz69 等）。
3. **性能量化方法论已成标准**：TTFT/TPS 是 Artificial Analysis、Anyscale、Azure、NVIDIA NIM 文档齐备的标准指标；存在碎片化 CLI 工具（Yoosu-L/llmapibenchmark、davlgd/openai-api-tester——后者仅 OpenAI 协议、Web 服务形态）。
4. **Polaris 生态强适配**：宿主 config.json 的 `modelProfiles[]`（id/name/baseUrl/apiKey/model/wireApi）就是「OpenAI/Anthropic 兼容端点档案」——每个 Polaris 用户都在维护它；宿主自身只有配置形状校验（config-validator），零联网体检能力。

## 3. 评分（权重×20 → 满分 100）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.5 | key 失效/网关断/配置错 = 直接阻塞所有 AI 使用；排障动辄数十分钟 |
| 频率/覆盖 | 15% | 4 | 每次改供应商/换 key/选型均触发；Polaris 全体用户+本地模型用户 |
| 现有方案缺口 | 15% | 4 | LiteLLM 需跑其代理；CLI 碎片；无 GUI 工作台形态 |
| 差异化优势 | 15% | 4.5 | 宿主档案零重录导入 + 双 wire API（Anthropic/OpenAI）+ AI 对话驱动 + 三端报告 + 趋势 |
| 收益 | 15% | 4.5 | 排障分钟级；量化选型；key 失效早知道 |
| 平台适配 | 10% | 5 | 服务原生 fetch（page-sentinel 先例）/ kv 事实库 / MCP stdio / 图标 Activity 在白名单 |
| 可行性 | 5% | 5 | 零依赖 Node fetch+SSE 解析即可，全离线可测（本地 mock 上游） |
| 成本 | 5% | 4 | 范围有界；维护低；探针自带成本护栏 |

## 4. 产品定义

- **名称**：模型体检台（id `llm-probe`；直白功能名，无典故）
- **一句话**：把「这个接口到底通不通、快不快、支持什么」变成一次 30 秒的自动化体检——连通/鉴权/模型表/对话/流式 TTFT-TPS/工具调用逐项过，报告三端可看，AI 一句话驱动。
- **目标用户**：Polaris 用户（配置多供应商）、本地模型用户（Ollama/vLLM/LM Studio）、API 网关使用者（OneAPI/NewAPI）。
- **MVP 范围**：档案管理（宿主导入+手动）、五步体检套件、报告+健康分、对比矩阵、历史趋势、AI 五工具、成本护栏。
- **暂不做**：定时自动体检（涉及无人值守花费）、并发压测（DoS 面）、vision/embedding 探针、上下文窗口实测、JSON mode 评分（兼容动物园太吵，仅作 compat 信息展示）。
- **成功指标**：体检套件对真实端点 <40s 完成；错误分类命中率（每个失败步骤给出可行动的中文诊断）；探针默认花费 <100 token。

## 5. 架构（复用家规模式）

```
panel(TSX→esbuild) ──┐                     ┌─ cap.kv（掩码事实库，三端同读）
                     ├─ llmprobe.cmd 单槽信箱 ──→ service/main.js（零依赖 Node）
mcp/server(stdio) ───┘   + res.<nonce> 回执    │  ├─ 档案权威：内存 + 手动档案落 appConfigDir/llm-probe/profiles.json
                                              │  ├─ 宿主导入：只读 config.json modelProfiles（服务与后端同机同信任域）
                                              │  └─ probe-core：双 wire API 探针（错误分类/TTFT/TPS/工具）
```

- **单槽命令信箱**：`llmprobe.cmd = {nonce, action, payload}`，服务轮询 get→delete 消费（单消费者无竞态，避开 kv list 全量扫描——历史上有 list 打死宿主前科）。结果 `llmprobe.res = {nonce,...}` + 持久态 `llmprobe.latest/report.<runId>/history/meta`。
- **探针套件**（shared/probe-core.js，服务与测试共用）：
  1. `connect` 端点可达（DNS/TCP/TLS/HTTP 错误分类）
  2. `models` 模型表（OpenAI GET /models；Anthropic GET /v1/models）+ 目标模型在列检查
  3. `chat` 非流式对话（max_tokens 16）+ 错误分类（401/403/404/429/5xx/超时/schema 不符）
  4. `stream` 流式对话：SSE 解析（OpenAI data: 行 + [DONE]；Anthropic 事件流），TTFT=首个文本增量、TPS、usage 抽取
  5. `tools` 工具调用（OpenAI tool_calls / Anthropic tool_use）
  - 健康分 0-100：连通15/鉴权15/模型表10/对话20/流式25/工具15；JSON mode 仅 compat 信息
- **URL 归一**：baseUrl 尾斜杠裁剪；含版本段（/v1 等）直接拼 /chat/completions 或 /v1/messages，否则补 /v1；`#` 后缀=逐字使用（逃生舱）；报告展示最终解析 URL。
- **双协议**：wireApi `openai-chat-completions`（Bearer）与 `anthropic-messages`（x-api-key + anthropic-version）。

## 6. 安全设计

- **密钥不进 kv**：完整 apiKey 只存在于服务内存与手动档案本地文件（与宿主 config.json 同信任域）；落 kv 的档案/报告/历史/AI 返回一律掩码（`****<last4>`，复用 keyscan 形态）；服务日志不落 key。
- **AI 不接触 key**：MCP 工具只收 profileId；AI 可见输出全部掩码形态。
- **成本护栏**：默认体检 max_tokens≤16/步；基准测试显式 opt-in 且标注预估请求次数；无定时任务，一切花费用户显式发起。
- **无破坏面**：零 shell、零宿主配置写入、零文件写入（除自身档案文件）；探针目标仅限用户显式登记的档案。

## 7. 验证计划（三层）

1. **离线单测**（node test/run-tests.mjs 零依赖）：SSE 解析（双协议/跨块/中断/usage）、URL 归一矩阵、错误分类映射、健康分、掩码不变量、信箱协议。
2. **mock 上游集成**：本地起 mock OpenAI + mock Anthropic 服务器（含坏 case：401/404/慢流/断流/schema 不符），服务级跑完整套件断言分类与指标。
3. **真桥冒烟**：宿主在线时全链路（cmd→service→kv→报告）+ 真实探针一个可公开端点（如不依赖 key 的错误分类路径），宿主不在线明确跳过。
4. 构建：tsc --noEmit + esbuild；pack 出 zip。
