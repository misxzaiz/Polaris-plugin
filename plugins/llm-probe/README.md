# 模型体检台（llm-probe）

把「这个 LLM 接口到底通不通、快不快、支持什么」变成一次 **30 秒的自动化体检**。

## 它解决什么

配 LLM 端点（DeepSeek/智谱/本地 Ollama/OneAPI 网关…）后的经典黑洞：连不上不知道是 DNS、端口、防火墙还是 key 失效；能通但不知道流式多快、工具调用支不支持；多家居面不知道该用谁。传统手段是 curl 一发一发试——本插件五步逐项过、每步失败都给**中文诊断 + 修复建议**（含 OLLAMA_HOST=0.0.0.0 坑、模型 tag 不匹配、max_tokens→max_completion_tokens 新语义等真实高频坑）。

## 五步体检（健康分 0-100）

| 步骤 | 内容 | 计分 |
|---|---|---:|
| 🔌 连通性 | 无鉴权裸探（零 token 成本证明 DNS/TCP/TLS/HTTP 通） | 15 |
| 💬 对话 | 非流式生成 + 鉴权/错误分类（401/404/429/5xx/schema 不符） | 30（鉴权15+对话20*0.75…见下） |
| 📋 模型表 | GET /models + 目标模型在列检查 | 10 |
| 🌊 流式 | SSE 逐块测 **TTFT**（首字）与 **TPS**（生成速度） | 25 |
| 🛠 工具调用 | 真实 tool 定义触发（OpenAI tool_calls / Anthropic tool_use） | 15 |

> 对话步含鉴权 15 + 生成 20；工具未触发给半分 7（模型可能直接文本回答）。

## 关键能力

- **宿主档案零重录**：自动读取 Polaris 已配置的模型供应商（config.json modelProfiles），一键导入；也支持手动添加任意 OpenAI / Anthropic 兼容端点。
- **双协议**：`openai-chat-completions`（Bearer）与 `anthropic-messages`（x-api-key + anthropic-version）。
- **对齐宿主真实行为**：模型名的 CLI 私有后缀（如 `deepseek-flash[1m]`）按宿主同款规则剥离后再发上游；`[1m]` 在 Anthropic 线路注入 `anthropic-beta` 头与 `?beta=true`（与 Polaris 引擎行为一致，不对宿主档案误报）。
- **URL 归一可视化**：报告展示 baseUrl 的解析终点（裸域自动补 /v1 等）；`#` 结尾 = 逐字使用逃生舱。
- **基准测试（显式 opt-in）**：≈64/512/2048 token 三档提示词 × 1-5 轮，TTFT/TPS 分位数（P50/min/max）。
- **三端同看**：报告/历史落 cap.kv（全掩码），手机/Web 打开同一面板可看；AI 经 MCP 五工具一句话驱动体检。

## 成本护栏

体检每步 ≤16 token（一次完整体检 <100 token，几分钱级）；基准测试在面板明示请求次数后才发送；**无任何定时任务**，一切花费由用户显式发起。

## 安全设计

- 完整 apiKey 只存在于服务内存与手动档案本地文件（`<appConfigDir>/llm-probe/profiles.json`，与宿主 config.json 同信任域）；
- 落 kv 的一切（档案列表/报告/历史/AI 返回）只含 `****后4位` 掩码；服务日志不落 key；
- AI（MCP）只见 profileId 与掩码形态，永不接触完整 key；
- 零 shell、零宿主配置写入；探针只访问用户显式登记的档案 URL。

## 使用

1. 面板「档案」页 → **导入宿主档案**（或手动添加）；
2. 「体检」页 → 选档案 → **开始体检**（约 10-40s）；
3. 看健康分与分项诊断；「对比」页横向比多家；「历史」页看趋势；
4. 对 AI 说「帮我体检 DeepSeek 和智谱谁快」→ AI 经 `llmprobe_run` 执行并把报告读进对话。

### MCP 工具（5 个）

`llmprobe_profiles` 列档案（掩码）· `llmprobe_run` 发起体检 · `llmprobe_report` 读报告 · `llmprobe_history` 趋势 · `llmprobe_bench` 基准（要求先向用户确认花费）

## 架构

```
panel ─┐ (llmprobe.cmd 单槽信箱 / llmprobe.res 回执)
mcp ───┴→ service/main.js（零依赖 Node）
          ├─ 档案权威：内存 + 手动档案本地文件；宿主导入=只读 config.json
          └─ shared/probe-core.js：双协议探针/SSE 状态机/错误分类/健康分
          ↓ 掩码形态
       cap.kv（meta/profiles/latest/report.*/history）→ 面板 / MCP / 三端
```

单槽信箱刻意避开 `kv list` 全量扫描（历史上有打死宿主前科）；服务为唯一写者。

## 验证

| 层 | 命令 | 覆盖 |
|---|---|---|
| 离线单测 | `node test/run-tests.mjs` | URL 归一矩阵 / 双协议 SSE 解析（跨块/中断/usage/工具）/ 错误分类 / 健康分边界 / 掩码不变量 / CLI 后缀剥离 |
| 集成测试 | `node test/service-tests.mjs` | 本地 mock OpenAI+Anthropic 上游真实 fetch 全绿套件、401/404/拒绝/断流/慢流分类、兼容重试、基准、取消 |
| 真桥冒烟 | `node test/smoke-real.mjs` | 宿主在线时全链路（真服务→真桥→真 kv→MCP stdio 闭环→掩码不变量→自清理）；宿主不在线明确跳过 |
| 构建 | `tsc --noEmit` + esbuild | 面板类型与产物 |

## 已知限制

- 未做并发压测（避免 DoS 面）、定时自动体检（无人值守花费）、vision/embedding/上下文窗口实测；
- TPS 在上游不回 usage 时按「增量字符 ÷ 4」估算（报告会注明）；
- 模型表端点若隐藏 /models（部分网关）只影响 10 分项，不影响其余诊断；
- 手机/Web 端可看报告与历史、可发起体检（命令经桌面服务执行），但「手动添加档案」的表单 key 输入建议在桌面端完成。
