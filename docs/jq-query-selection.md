# jq-query 选型文档（第 17 轮 · 热点发现）

> 2026-11-06。需求库 049–056 已全部消化（第 12 轮起连续热点发现模式），本轮自主选型。

## 一、方向硬闸自查

核心动作 = **变换/查询/诊断**（把 JSON 变换为查询结果），不是记录。非台账/非 CRUD/非生活类。合格。

## 二、候选池（开放缺口 × 外部证据初筛）

| # | 候选 | 生态现状 | 初判 |
|---|---|---|---|
| A | **jq 查询台**（真实 jq 引擎 + 文件/NDJSON + MCP） | 全生态无覆盖；dev-toolbox 的 JSON 面板仅格式化/校验/键排序 | **当选** |
| B | Terraform Plan 透视台（plan JSON→影响报告） | 无覆盖 | 受众偏窄（IaC 用户），评分 79 |
| C | RAG 切片预演台 | 无覆盖 | 想象力分高但频率存疑，评分 78.5 |
| D | 本地 X.509/PEM 证书透视台 | domain-probe 已做远程证书过期（tls.connect 活体） | 差异化弱（openssl/网页工具多），~70 |
| E | .http 文件运行台 | 无覆盖，但 Bruno/VS Code REST Client 竞争强，且 openapi-desk 已占"结构化发请求"生态位 | 76 |

撞车 grep（plugins/ + index.json）：`jq|jmespath|jsonpath|terraform|chunk|x509|\.http` 均无实现命中；
`mock`（mock-server/schema-mock）、`secret/pii`（keyscan/data-mask 占坑）、`graphql`（i18n-sync-selection 已明确否决：对 GraphiQL/Altair 低差异化）为**已占域**，回避。

## 三、外部需求证据（可追溯）

1. **jq 官方 playground（play.jqlang.org）**、devtoolsdaily jq playground、jq.port.io（AI 辅助）、
   VS Code「jq Playground」扩展（带自动补全 + AI explain）、awesome-jq 精选列表——一个查询语言养活
   一整圈工具生态，需求真实性无需再证。
2. **CLI 迭代摩擦**：Stack Overflow「PowerShell 里 jq 变量不展开」（67636275）、Reddit r/PowerShell
   「为什么必须转义双引号」（Windows 引号地狱高赞帖）、`-r` 标志困惑（44656515）、`ijq` 交互式包装器的
   存在本身 = 用户在 CLI 里迭代 jq 查询很痛苦。
3. **网页 playground 的真实缺口**：浏览器内存限制（几十 MB JSON 卡死）、本地文件不可读、敏感 JSON
   不敢贴给网页、NDJSON/日志文件工作流缺失、AI 无法使用。

## 四、竞争格局

| 对手 | 强 | 弱（=本插件差异化） |
|---|---|---|
| jq CLI | 语义金标 | Windows 引号地狱、无即时反馈、需安装 |
| play.jqlang.org / jqplay | 即时反馈、可分享 | 无本地文件、大 JSON 卡死、隐私上云、AI 不可用 |
| jq.port.io | AI 辅助写查询 | 网页版同样以上全部；AI 是生成器不是执行器 |
| VS Code jq 扩展 | 编辑器集成 | 需 VS Code；无 MCP；Polaris 内不可用 |
| dev-toolbox JSON 面板 | 已装即有 | 只有格式化/校验/键排序，**无任何查询能力** |

本插件 = **真实 jq 引擎（WASM，jq 1.7 语义）+ 本地大文件 + NDJSON 流 + AI 经 MCP 确定性查询**。
AI 角度是关键差异：LLM 手算 10MB JSON 必错，经 `jq_query` 工具查询是**确定性的**——这是 Polaris
「AI 增强工作台」定位的直接体现，网页 playground 与 CLI 都给不了。

## 五、评分（加权 /100）

| 维度 | 权重 | 得分 | 理由 |
|---|---|---:|---|
| 用户痛点强度 | 20% | 4.5 | 引号地狱 + 学习曲线 + 大文件三重实证 |
| 频率与覆盖 | 15% | 5 | 触 JSON 的开发者每天都查（API 响应/日志/配置/HAR/LLM 输出） |
| 现有方案缺口 | 15% | 4.5 | 生态内零覆盖；dev-toolbox 明确不做查询 |
| 可验证差异化 | 15% | 4 | 保真 WASM 引擎 + 文件/NDJSON + MCP 三点组合无对手 |
| 用户收益 | 15% | 4.5 | 秒级查询替代手工扫描/写脚本；AI 获得确定性 JSON 能力 |
| 平台适配 | 10% | 5 | 面板 + service + MCP 三件套全用 house 现成模式 |
| 技术可行性 | 5% | 4 | spike 全绿（40+ 保真用例/worker 超时隔离/2.7MB 输入 ~440ms） |
| 开发维护成本 | 5% | 4 | 引擎外包给 jq-web（jq 官方语义），自研面窄 |
| **合计** | | **90** | |

## 六、关键假设与止损

- **假设 1**：jq-web 0.6.2 的 WASM 构建语义保真。→ 已 spike 验证（语法错误 exit 3、运行错误 exit 5、
  `-r/-c/--slurp/-n/--arg/--argjson`、`$ENV`、正则 match/capture/scan/gsub、时间函数、@csv/@tsv 全对）。
- **假设 2**：死查询（`[repeat(.+1)]`）不会挂死服务。→ worker 线程隔离，超时杀+重生成，主进程存活已证。
- **假设 3**：用户在 Polaris 内查 JSON 的频率足以留装。→ MVP 后看 usageTier；若面板月活近零但 MCP
  工具被 AI 高频调用，同样算成功（AI 工具位是第一价值）。
- **止损**：若 jq-web 在真宿主出现不可修的 wasm 加载问题，降级方案 = service 内嵌 jq 二进制调用
  （放弃零依赖）；再不行则停在该轮交付并如实报告。

## 七、MVP 边界

**做**：真实 jq 引擎（raw 通道全 flags）；输入=粘贴/文件（cap.fs）/NDJSON 自动多文档；输出=pretty/
compact/raw/JSON 数值解析；查询历史（kv）；速查表（内置函数离线参考）；超时护栏（默认 5s）；
MCP 四工具（jq_query / jq_check / jq_reference / json_outline）。
**不做**：JSONPath/JMESPath 双方言（保真单一语言 > 面面俱到）；查询可视化编辑器；jq 脚本文件工程化
（include/import）；大结果分页虚拟滚动（结果上限 8MB 截断提示）。

## 八、平台事实（勘探结论）

- 端口 9883 空闲（9860–9881 已占，9862 已双占是教训）。
- 面板→服务：直连 fetch（qr-desk 生产验证模式）+ token（cap.kv `<id>.meta`）；服务补 CORS/OPTIONS
  作 web 构建加固。
- 面板读文件：`cap.fs` action=`get_file_content`（hex-lens 模式）。
- MCP：手搓 stdio JSON-RPC（qr-desk 模式），与 service 共用 `service/vendor/jqweb/` 引擎。
- jq-web 以 vendor 形态进 zip（esbuild 不打包 wasm；`require` 绝对定位）。
