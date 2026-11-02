# 选型文档：LLM 请求调试台（llm-request-desk）

> 2026-11-03 · 插件生态第 97 个候选定稿

## 一、方向硬约束检查

- 非台账/记录/CRUD/家庭生活类——核心动作是「**调试了/定位了什么**」（构造请求→发送→解析→诊断→变异重放），属「AI 能力扩展 + 调试诊断」主攻方向。✅

## 二、候选收敛过程

96 个插件全景查重后，从 10+ 候选中收敛（出局理由）：

| 候选 | 出局/保留 | 理由 |
|---|---|---|
| OpenAPI 契约 Diff 台 | 出局 | oasdiff 已进化为平台型竞品（778 条规则+PR review 工作流+GitHub Action），可视化增量空间小；个人开发者频率低 |
| 密钥扫描台 | 已存在 | `keyscan` 已交付 |
| Mock 接口台 | 已存在 | `mock-server` 已交付（含 OpenAPI 导入） |
| 正则/Cron/JWT/哈希小工具 | 已存在 | `dev-toolbox` 13 面板全覆盖 |
| Redis 调试台 | 已存在 | `db-workbench` 已含 Redis |
| 数据查询/脱敏/流水线/进程管理 | 避让 | `data-query`/`data-mask`/`flow-pipeline`/`process-desk` 为并行会话未提交工作 |
| API 签名调试台 | 备选落选 | 真实但用户群窄，各平台签名规则模板维护成本高 |
| 环境变量体检台 | 备选落选 | 痛点真实但复杂度低，易被脚本替代 |
| **LLM 请求调试台** | **选定** | 见下 |

## 三、需求证据（可追溯）

1. **自家现场实证（最强）**：Polaris 主仓 `docs/400-inference-request-invalid-analysis.md`（2026-11-02）——排查商汤 Sensenova 端点 400 `inference request is invalid`，全流程为 grep 网关日志 → 解析会话转录 → **手工 curl 变异重放 6 次**才定位根因（messages 以 assistant 结尾违反协议校验）。这个手工「变异重放对照」流程正是本插件要产品化的核心动作。
2. **社区重复信号**：Langfuse issue #7334（OpenAI 兼容端点 400 request/payload mismatch）；OpenRouter 官方专设 [错误调试文档页](https://openrouter.ai/docs/api_reference/errors-and-debugging)（400 invalid/missing params 等）；Stack Overflow / OpenAI 社区反复出现「400 error from OpenAI API」类帖子（deprecated model、payload 格式、unsupported parameters——"endpoints differ in accepted fields"）。
3. **生态结构**：国内 LLM 开发普遍经 one-api/cli-proxy/网关聚合 DeepSeek/Qwen/商汤/硅基流动/Ollama/vLLM 等五花八门的「OpenAI 兼容」端点，参数语义漂移是常态而非例外。

## 四、竞品与空白

| 方案 | 缺口 |
|---|---|
| Langfuse/Helicone 等 observability 平台 | 需部署服务端，重量级；面向「已经跑起来」的观测，不是「调不通」时的单请求调试 |
| 各家 Playground | 绑死自家 API，不能测第三方端点；无跨端点对比 |
| Postman/Bruno | 无 LLM 语义：SSE 流式时间线弱、无参数漂移诊断、无协议校验预检 |
| curl + grep + 手工变异 | 正是现状，全手工，变量一多就失控 |
| 本仓 `llm-probe`（模型体检台） | 自动化体检（预定义探针打健康分），**不做任意请求构造与逐字段诊断**——互补而非重叠：体检发现异常 → 到调试台深挖 |

空白定位：**本地、单请求级、带 LLM 协议语义的交互式调试台**——无人覆盖。

## 五、差异化（可持续性）

1. 诊断知识库：15+ 条双协议校验规则（trailing-assistant/max_tokens 必填/tool_use 配对/参数漂移/URL 拼接/SSE 中断…），每条给中文根因+修复动作，来源是真实故障案例，可持续积累。
2. 变异重放：预置变异器（去尾 assistant/裁剪非标字段/减半 messages/最小请求…），一键变异后重发对比——把 400 文档里的手工流程变成两次点击。
3. 宿主端点零重录：直接读宿主 config.json 的 modelProfiles/providerGroups（服务同机信任域，key 不经面板）。
4. AI MCP 四工具：用户在对话里说「帮我把这个请求发到 DeepSeek 看看什么错」，AI 代发并带回诊断。
5. 生态协同：llm-probe 体检 → 本插件调试；prompt-matrix 评测；abacus 算钱。

## 六、最大不确定性与 MVP 验证

- 不确定性：用户是否愿意从 curl 迁到面板。验证方式：MVP 覆盖 400 文档完整取证流程（构造/发送/诊断/变异/重放），若自家排查实战能用上即验证成立。
- 止损：若诊断规则库与变异器在真实案例中命中率低，可收缩为「LLM 请求重放器」纯工具形态，不需要推翻架构。

## 七、安全与护栏

- 完整 apiKey 只存在于服务内存与 `{{appConfigDir}}/llm-request-desk/endpoints.json`（与宿主 config.json 同信任域）；kv/日志/AI 返回全掩码（`****last4`）。
- AI MCP 通道只能引用**已保存端点**（不可任意 URL）、maxTokens 缺省 256 上限、请求体 ≤1MB。
- 面板零直连：请求全部由服务端 fetch 执行（天然绕 CORS），面板经宿主 invoke 读 cap.kv。
- 本机端点（Ollama/vLLM/网关 127.0.0.1）是合法调试对象，不做内网封禁；风险边界=服务本身只在本机监听。
