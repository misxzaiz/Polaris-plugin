# 提示词矩阵台（prompt-matrix）选型与设计

> 2026-11-02。方向硬约束对齐：工具/技术/自动化类（非台账非记录）。核心动作 = 「批量执行了/变换了/评测了什么」，不是「记录了什么」。

## 1. 候选池与筛选（外部证据见 §2）

初始候选 12 个，先过硬约束（台账/记录/生活类一律不进池），再对照生态 76 个已发布插件撞车排除：

| 候选 | 结论 | 原因 |
|---|---|---|
| 日志分析台 | ❌ 已占用 | log-lens 今日交付（index.json 已入） |
| 密钥扫描台 | ❌ 已占用 | keyscan 已交付 |
| MySQL/PG 检查台 | ❌ 已占用 | relay-devkit v1.5.1 含「MySQL 桥接 + Supabase REST」 |
| HTTP 调试台 / curl 导入 | ❌ 已占用 | relay-devkit API 客户端 + cURL 导入；api-bench 覆盖压测 |
| Mock 服务器 | ❌ 已占用 | mock-server 已交付 |
| 证书/TLS 检查 | ❌ 已占用 | domain-probe 含 node tls 取证 |
| 端口/进程监控 | ❌ 已占用 | pocket-host 持续采样 |
| i18n 对账台 | ❌ 淘汰（64） | 痛点真实但工具碎片化饱和：i18n-ally（VSCode 装机量大）/ i18n-unused / SimpleLocalize / i18n-check 均免费；差异化薄 |
| WebSocket/SSE 调试台 | ❌ 淘汰（76→次选） | websocat ~7k★/wscat ~3k★ 证明需求，但频率限于实时功能团队；llm-probe-plan 独立评 62.5 互证；备选保留 |
| Docker 容器体检台 | ❌ 淘汰（69） | lazydocker 53k★ 需求强，但本机无 docker 即完全不可用；且 lazydocker/dozzle 成熟，差异化=对话式（可复制） |
| 压缩包安检台 / 文件二进制分析台 | ❌ 淘汰（67/66） | 场景 episodic，收益中低 |
| **LLM 提示词矩阵台（批量评测）** | ✅ **选定（86）** | 见下 |

## 2. 需求证据（可追溯）

1. **promptfoo（GitHub ~10.8k★）**：开源 LLM 评测/red-team CLI，官网自述 30 万+ 开发者、156 家 Fortune 500 使用——「提示词/模型批量横向评测」是基础设施级需求。**2026 年出现开源路线变动动荡**（社区讨论 "Promptfoo's exit" 与替代品讨论增多），用户正在寻找新家。
2. **云端方案数据外发顾虑**：LangSmith / Braintrust 是 SaaS——提示词与数据集往往含业务敏感内容，本地方案存在结构性空位。
3. **promptfoo 自身的门槛**：CLI + YAML 配置文件（prompts.yaml / promptfooconfig.yaml），非开发者与轻度用户上手成本高；GUI 是独立 web viewer。
4. **Polaris 生态强适配**：宿主 config.json 的 `modelProfiles[]` 就是现成的「被评测模型池」（llm-probe 已趟平导入）；但全生态 76 插件**零 LLM 评测占位**——llm-probe 管「接口通不通/快不快」（健康域），无任何插件管「同一任务哪个模型/哪版提示词答得好」（质量域）。
5. **dogfooding**：本仓 DeepSeek Harness 对标分析（记忆 polaris-deepseek-harness-benchmark）明确记录「agent 零评测」为待补短板——评测能力是连 Polaris 自己都缺的。

## 3. 评分（权重 → 满分 100）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.5 | 调 prompt/选模型靠「开 N 个聊天窗手改手跑肉眼比」，一次系统对比要手工跑几十次 |
| 频率/覆盖 | 15% | 4 | AI 时代调提示词是高频动作；模型发布频繁需回归测试；AI 应用开发者+重度用户 |
| 现有方案缺口 | 15% | 4 | promptfoo CLI+YAML 门槛、路线动荡；LangSmith 云端外发；无本地 GUI 工作台 |
| 差异化优势 | 15% | 4.5 | 对话式建矩阵（零 YAML）+ 宿主供应商零配置导入 + 数据不出本机 + AI 经 MCP 自主发起评测 + LLM-as-judge 链路 |
| 收益 | 15% | 4 | 一次矩阵=数十次手工跑；确定性检查器+judge 分可量化；输出可导出报告 |
| 平台适配 | 10% | 5 | 服务原生 fetch（page-sentinel 先例）/ kv 事实库 / MCP stdio / onSendToChat 全是现成家规 |
| 可行性 | 5% | 4.5 | 非流式并发调用即可（probe-core 双协议/错误分类直接复用）；mock 上游离线全测 |
| 成本 | 5% | 4 | 跑矩阵花用户 token（格子数显式预估+花费确认缓解）；无定时任务 |

**加权合计 86**（次选 WS 调试台 76）。

## 4. 产品定义

- **名称**：提示词矩阵台（id `prompt-matrix`；直白功能名，无典故；图标 Target 在白名单）
- **一句话**：把「这套提示词/这几个模型到底谁答得好」变成一张矩阵：数据集 × 变体（模型+提示词模板+参数）批量执行，逐格结果、确定性检查、可选 LLM 评判、并排 diff，AI 一句话驱动。
- **目标用户**：AI 应用开发者（调 prompt/回归测试）、多供应商用户（选型对比）、重度 AI 用户（批量处理+横向对比）。
- **核心场景**：① 换模型前跑一遍老数据集看质量退没退；② 提示词 A/B（两版系统词谁稳）；③ 批量跑 20 条翻译/摘要/抽取样本并自动检查 JSON 有效/关键词命中；④ 让聊天里的 AI 自己定义并跑评测矩阵。
- **MVP 范围**：数据集（JSONL 编辑/保存）、变体矩阵运行（并发/重试/中止/单飞）、矩阵结果视图（格子详情/字级 diff/人工 👍👎）、确定性检查器 7 种、pointwise LLM-as-judge（可选）、聚合统计、Markdown/JSONL 导出、AI 六工具、成本护栏（格子数预估+确认）。
- **暂不做**：流式格子（TTFT 是 llm-probe 的域）、pairwise judge（N² 成本）、多模态输入、定时评测（无人值守花费）、云同步/团队共享、自动定价表（只展示 token 计数，单价可配置估算）。
- **成功指标**：10 样本×3 变体矩阵真实端点 <2min 完成；检查器与 judge 结果逐格可追溯；数据集/结果重开面板可复现。
- **止损假设**：若真实用户只跑单格子（无矩阵需求），则价值退化为「批量提示词执行器」——仍高于手工，但需重新评估差异化。

## 5. 与既有插件的正交性（撞车自检）

| 插件 | 域 | 边界 |
|---|---|---|
| llm-probe | 接口**健康**（通/快/支持什么） | 本插件管输出**质量**（对/好/哪个好）；复用其档案模型与 probe-core 请求构造，不复用其体检流程 |
| task-runner | 定时执行提示词（提醒性质） | 无矩阵/无对比/无检查器；本插件无定时 |
| abacus | 已发生用量记账 | 本插件是主动评测执行，不记账 |
| context-pack | 仓库→上下文包 | 无关 |

## 6. 架构（复用家规模式，零新依赖）

```
plugins/prompt-matrix/
  plugin.json            # id=prompt-matrix, service http + mcp stdio + panel
  shared/matrix-core.js  # 纯逻辑零依赖：模板插值/检查器/字级diff/聚合/judge构造/掩码/结果投影
  service/kvclient.js    # 桥客户端（llm-probe 同款，实测样板不改协议）
  service/main.js        # 单权威执行器：单槽信箱/档案(掩码分层)/矩阵执行/单飞中止/结果落盘
  mcp/server.js          # 六工具：datasets/run/status/result/history/judge_sample
  src/                   # 面板六 Tab：运行/数据集/结果/档案/历史/设置
  test/                  # 离线单测 + mock 上游集成 + 真桥冒烟
```

关键决策：
- **结果分层存储**：全量结果写 `{{appConfigDir}}/prompt-matrix/runs/{runId}.json`（服务与档案同信任域），kv 只落瘦身投影（每格 content 截 1.2KB + 指针）——重开面板历史可复现，kv 不爆。
- **档案安全分层**（llm-probe 同款不变量）：完整 key 只在服务内存 + profiles.json；kv/面板/AI 全掩码（****last4）。
- **矩阵 = 样本 × 变体**：variant = {name, profileId, systemTemplate, userTemplate, maxTokens, temperature}，统一表达「多模型对比」与「同模型多版本提示词」。
- **并发护栏**：默认并发 3（1-8 可配），429/5xx 单次退避重试，per-cell 超时 60s，run 总闸 30min，AbortController 全链中止。
- **judge**：pointwise（逐格 1-10 分 + 理由），judge 档案与提示词可配，输出 JSON 容错解析；不自动跑，显式发起。

## 7. 验收标准

- 离线单测全绿（插值/检查器/diff/聚合/掩码不变量/judge 解析容错）。
- mock 上游集成测试全绿（双协议矩阵执行/失败分类/重试/中止/检查器端到端）。
- 真桥冒烟：真实宿主 kv + 真实档案导入 + 一次 1 样本×2 变体小矩阵 + MCP 子进程闭环，自清理。
- tsc strict + esbuild 构建通过。
- 五步发布链完成（pack→update.json→index.json→commit→push→CDN 200 验证）。
