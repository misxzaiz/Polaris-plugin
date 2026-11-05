# jq 查询台（jq-query）

真实 jq 引擎的 JSON 查询/变换调试台。把「对一段 JSON 提取/过滤/统计」从 Windows 引号地狱、网页粘贴泄漏与大文件卡死中解放出来。

## 它解决什么

- **CLI 痛点**：PowerShell 里 jq 的引号转义地狱（变量不展开、双引号要转义）、无即时反馈。
- **网页 playground 痛点**：大 JSON 卡死浏览器、本地文件读不了、敏感数据要贴给第三方网页、AI 用不上。
- **AI 痛点**：LLM 手算 10MB JSON 必错——经本插件的 MCP 工具查询是**确定性的**。

## 核心能力

- **真实 jq 引擎**：jq-web WASM（jq 1.7 语义），raw 通道与命令行 `jq` 完整等价。
- **全 flags**：`-r` `-c` `-s` `-n` `-R` `-S` `-j` `--tab` `--arg k v` `--argjson k v`，支持聚合式（`-rn`）。
- **NDJSON 多文档流**：逐行 JSON 天然支持，配 `-s` 汇总、`inputs` 消费剩余文档。
- **本地文件**：≤64MB，面板一键载入（cap.fs），MCP 直读绝对路径。
- **结构大纲**：写查询前先看懂形状（键集合、数组元素键并集、类型分布、样本值）。
- **查询历史**（kv 持久化 50 条）与 **90+ 条速查表**（离线可搜，点击插入）。
- **护栏**：死查询（`[repeat(.+1)]`）默认 5s 超时击杀，引擎线程自动重生成，主进程永不挂死；结果 >8MB 截断提示；输入非合法 JSON/NDJSON 给人话报错。

## 面板

三 Tab：
1. **查询**：输入（粘贴/示例/文件）→ flags 与变量注入 → 查询（Ctrl+Enter）→ 逐项输出（复制/发到对话）；语法校验与结构大纲一键直达。
2. **速查表**：按签名/语义/示例搜索内置函数，点击签名插入查询、点击示例直接跑。
3. **自检**：15 项试金石断言走真实引擎（含超时击杀+重生成），引擎异常时先跑这个。

## MCP 工具（AI 用）

| 工具 | 用途 |
|---|---|
| `jq_query` | 对内联 JSON 或文件路径执行真实 jq 查询（flags/timeout 可调） |
| `jq_check` | 查询语法校验（-n 空输入执行一次；数据相关类型错误需真实输入） |
| `jq_reference` | 内置函数速查表关键词搜索（帮 AI 写对查询） |
| `json_outline` | JSON 结构大纲（不依赖 jq；写查询前先看懂大文件形状） |
| `jq_selftest` | 引擎试金石自检（14 断言） |

## 架构与隐私

- `service/`：HTTP 服务（127.0.0.1，token 鉴权）+ worker 线程池（按 flags 组合池化，超时击杀/崩溃重生成）。
- `mcp/`：stdio JSON-RPC，与面板/服务共用同一引擎权威。
- `service/vendor/jqweb/`：jq-web 0.6.2（MIT） vendored，发布 zip 零 node_modules。
- **隐私**：输入 JSON 与查询内容不落日志、不落 kv（日志只记尺寸/耗时/错误类型）；历史只存查询文本与 flags。
- 已知修复：jq-web 0.6.2 存在跨调用 flags 粘连（`-r` 双向污染），本插件以 **worker-per-flags组合** 池化根治（见 `service/worker.js` 头注释与选型文档）。

## 本地开发

```bash
npm install
npm run build        # service + mcp + panel
npm run typecheck    # tsc --noEmit
npm test             # 离线单测 + MCP 真进程 + 服务真进程
JQ_REAL=1 node test/realbridge.test.mjs   # 真桥冒烟（需宿主在跑）
```
