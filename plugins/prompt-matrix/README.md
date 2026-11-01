# 提示词矩阵台（prompt-matrix）

把「这套提示词 / 这几个模型到底谁答得好」变成**一张矩阵**：数据集（JSONL 样本）× 变体（模型 + 提示词模板 + 参数）批量执行真实 LLM 请求，逐格结果、确定性检查器、可选 LLM 评判（LLM-as-judge）、同行字级 diff，AI 经 MCP 一句话驱动评测。**数据不出本机。**

## 它解决什么

调提示词、选模型的日常是：开 N 个聊天窗、手改手跑、肉眼对比、凭印象下结论。本插件把这件事变成一次可复现的矩阵运行：

- **模型对比**：同一份模板 + 数据集，多个 `profileId` 并排跑
- **提示词 A/B**：同一模型，不同 system/user 模板并排跑
- **回归测试**：换模型/改提示词后重跑老数据集，检查器逐格自动验证
- **批量处理 + 验收**：20 条翻译/摘要/抽取样本一次跑完，JSON 有效、关键词命中自动判

## 快速上手

1. **档案**页 → 「导入宿主已配置的供应商」（零重录；也可手动添加任意 OpenAI/Anthropic 兼容端点）
2. **数据集**页 → 粘贴 JSONL（每行一个 `{"vars": {...}}`，模板里 `{{变量名}}` 插值；可带 `expect` 检查器）
3. **运行**页 → 加变体（名称/档案/系统词/用户词/max_tokens/温度）→ 预估格子数 → 确认花费 → 发起
4. **结果**页 → 矩阵视图逐格看全文/检查/judge，同行格子字级 diff，👍👎 人工标注，导出 Markdown

### 数据集格式（JSONL）

```jsonc
// 形态一：显式 vars + 期望检查器
{"vars": {"text": "1+1等于几？只回答数字"}, "expect": [{"type": "equals", "value": "2"}]}
// 形态二：顶层键直接作为变量
{"text": "今天天气怎么样？", "lang": "英语"}
// 检查器 7 种：contains / not_contains / regex / json_valid / equals / min_length / max_length
{"vars": {"text": "输出一个 JSON"}, "expect": [{"type": "json_valid", "extract": true}]}
```

`json_valid` 的 `extract: true` 会先从 ```` ```json ```` 代码块提取再校验——适合「要求模型输出 JSON」类任务。

### LLM 评判（可选）

运行时勾选评判档案，每个输出由 judge 模型按 1-10 打分并给理由（pointwise，`{"score": n, "reason"}`，容错解析）。judge 提示词可自定义（`{{output}}` 与样本变量可用）。**judge 是额外调用，显式配置才跑。**

## AI 驱动（MCP 六工具）

| 工具 | 用途 |
|---|---|
| `pmtx_profiles` | 列可评测模型档案（key 掩码） |
| `pmtx_datasets` | 列数据集 |
| `pmtx_run` | 发起矩阵（variants + datasetId/jsonl；调用前须向用户确认花费） |
| `pmtx_status` | 运行进度（完成格数/评判进度/耗时） |
| `pmtx_result` | 读结果（聚合 + 矩阵总览；`cell: "r0c1"` 取单格全文与检查明细） |
| `pmtx_history` | 历史运行列表 |

对话里可以直接说：「用我的测试集对比这两个模型」「把这段 JSONL 的 10 句话批量翻译并检查 JSON 有效」「跑一遍新提示词，judge 打分」。

## 架构

```
shared/matrix-core.js   纯逻辑零依赖：插值/数据集解析/检查器/字级diff/聚合/judge/双协议调用
service/main.js         单权威执行器：单槽信箱(pmtx.cmd→pmtx.res)/并发池(1-8)/重试/中止/落盘
service/kvclient.js     桥客户端（端点自发现，与家规样板同款）
mcp/server.js           stdio MCP：六工具，只投递命令并读 kv，不携带 key
src/                    面板六 Tab：运行/数据集/结果/档案/历史/设置（esbuild 打包）
```

- **结果分层**：全文落 `{appConfigDir}/prompt-matrix/runs/{runId}.json`（原子写，保留最近 10 份）；kv 只存瘦身投影（单格文本按规模 200B~1.2KB）——历史可复现，kv 不爆。
- **档案安全**：完整 apiKey 只在服务内存 + `{appConfigDir}/prompt-matrix/profiles.json`（与宿主 config.json 同信任域）；kv/面板/MCP 一切形态全掩码（`****last4` / `env:NAME`）。
- **双 wire API**：OpenAI Chat Completions（Bearer）与 Anthropic Messages（x-api-key），`[1m]` 等 CLI 后缀自动剥离，`max_completion_tokens` 兼容重试。

## 护栏与隐私

- 成本：发起前显式预估「样本 × 变体 = 格子数」并确认；MCP 工具描述要求 AI 先征得同意；无任何定时任务。
- 重试：仅限流 429 / 5xx / 网络层错误退避重试（0-2 次可配）；401/400 等语义错误不重试。
- 中止：AbortController 全链生效，中止后已完格保留、未跑格标「已取消」。
- 并发：1-8 可配（默认 3），对供应商友好。
- 隐私：数据集与结果不出本机；日志不落 key。

## 开发

```bash
npm install
npm run typecheck          # tsc --noEmit（strict）
npm run build              # esbuild → dist/panel.js
node test/run-tests.mjs    # 离线单测（零网络）
node test/service-tests.mjs # 假桥 + 真实子进程集成（零外网）
node test/smoke-real.mjs   # 真桥冒烟（需宿主运行中；产生少量真实 token 消费）
```

## 已知边界

- 非流式执行（不测 TTFT/TPS——那是模型体检台 llm-probe 的域）。
- 检查器的 `regex` 有 500 字符模式上限（防灾难回溯的轻护栏）；`contains` 关键词 ≤20 个。
- 数据集 ≤200 样本 / 256KB；单格输出存储 ≤64KB（超出截断并标注）。
- 大规模运行（>200 格）kv 投影逐格文本收敛到 200-400B，全文以落盘文件为准。
- 结果保留最近 10 份（更早的投影与文件随索引清理）。
