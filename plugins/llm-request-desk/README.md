# LLM 请求调试台（llm-request-desk）

把「这个 LLM 端点为什么 400、流式为什么断、两个请求差在哪」从 **grep 网关日志 + 手工 curl 变体重放** 变成可视化调试。

## 它解决什么

接「OpenAI 兼容」端点（DeepSeek / Qwen / 商汤 / 硅基流动 / Ollama / vLLM / one-api 网关……）的真实日常：参数语义漂移、协议校验差异、流式行为不一致——400 不告诉你哪个字段错，排查全靠改一个字段 curl 一次。本插件把这个手工流程产品化：

1. **构造**：双协议请求构造器（OpenAI Chat Completions / Anthropic Messages），表单或原始 JSON（非标字段 `thinking`/`reasoning_effort` 等可透传做实验）。
2. **发送**：插件服务端真实 fetch（面板零直连，天然无跨域问题），流式逐帧采集。
3. **诊断**：15+ 条中文诊断规则，每条带根因与修复动作——「messages 以 assistant 结尾」（商汤 Sensenova 400 实锤形态）、「Anthropic max_tokens 必填」、「tool_result 无配对 tool_use」、「参数漂移（Unrecognized argument）」、「/v1 重复拼接」、「流式无终止标记」等。
4. **变异重放**：8 种预置变异（补空 user 结尾 / 裁剪标准字段 / 最小请求 / 减半 messages / 降 max_tokens / 关 stream / 去 tools / system 换写法），一键变异后重发对比——二分定位违规字段。
5. **AI 协作**：MCP 四工具让 AI 代发请求带回诊断（「帮我把这个请求发到 DeepSeek 看看什么错」），护栏：只能引用已存端点、maxTokens≤256（confirm 放宽 4096）。

## 与邻居插件的分工

- **模型体检台（llm-probe）**：自动化体检打健康分（通不通/快不快）。体检发现异常 → 到这里深挖单请求。
- **提示词矩阵台（prompt-matrix）**：批量评测提示词质量。这里是单请求级协议调试。
- **AI 用量账（abacus）**：花销统计。这里单请求即发即看，不做账。

## 安全与数据边界

- 完整 apiKey 只存在于**服务内存**与 `{{appConfigDir}}/llm-request-desk/endpoints.json`（与宿主 config.json 同信任域，不进云端同步）；
- 落 cap.kv 的端点/报告/历史/日志/AI 返回**全部掩码**（`****last4`）；
- 请求体不含 key（key 只在 header），可全文落 kv 供复盘；
- AI MCP 通道不提供删除/修改端点的工具，不接受任意 URL；
- 无定时任务，只有面板/MCP 显式发起时才产生请求费用。

## 使用

1. 面板「端点」页 →「导入宿主端点」（宿主已配置供应商零重录）或手动添加（本地 Ollama 等无鉴权端点勾「允许空 key」）；
2. 「请求」页选端点 → 构造请求 → 发送 → 看诊断卡与 SSE 时间线；
3. 失败时点变异按钮 → 检查变异后请求体 → 重发，对比两次诊断差异；
4. 「历史」页回读最近 30 条完整请求，勾两条做对比，或「载入请求页继续调试」；
5. 对话里让 AI 用 `llmdesk_send` 代发（`llmdesk_endpoints` 先查端点 id）。

## 开发

```bash
# 单测（三层）
node --test test/core-tests.mjs      # 核心纯函数 39 断言
node test/service-tests.mjs          # 服务集成（假桥+mock 上游）16 用例
node test/mcp-tests.mjs              # MCP stdio 集成 12 用例

# 面板
pnpm i && pnpm typecheck && pnpm build
```

架构：`shared/request-core.js`（纯函数：双协议构造/URL 归一/SSE 解析/诊断/变异器）+ `service/main.js`（kv 单写者 + 单槽命令信箱 + fetch 执行器）+ `mcp/server.js`（信箱投递 + 掩码渲染）+ 面板（经宿主 invoke 读 kv）。选型依据见仓库 `docs/llm-request-desk-selection.md`。
