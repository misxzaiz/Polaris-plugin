# 选型文档：AI 声明核验台（claim-lens）

> 2026-11-06 · 第 17 轮热点发现（需求库 049–058 已消化/被认领，自主选型）。
> 方向硬约束（2026-11-01 用户定案）：台账/记录/家庭生活类一律不进候选池。
> 核心动作判定：本插件的动作是「**核验/诊断**」——把 AI 声明对照本地实证给出裁决与证据，是变换（声明→裁决），不是「记录发生了什么」——过闸。

## 一、生态饱和度盘点（先内后外）

index.json 118+ 条目，另有并行 WIP：jq-query（058，已被本日会话认领）、data-mask、process-desk、file-flow、office-lens。与本选型相关的既有覆盖：

| 既有插件 | 覆盖 | 与本选型关系 |
|---|---|---|
| json-repair / schema-check / schema-mock | AI **输出数据**的修复/校验/造数 | 只管「结构化输出」；本插件核验 AI **关于世界的声明**（文件/符号/依赖/命令/配置） |
| prompt-guard | 提示词注入检测 | 输入侧安全，与输出侧核验互补 |
| prompt-matrix | 提示词批量评测 | 评「回答质量」，不核「声明真伪」 |
| watchtower | 工具调用次数观测 | 计量，不核验 |
| keyscan / data-mask | 凭据扫描 / PII 脱敏 | 扫描对象是密钥/个人信息，不是 AI 声明 |
| deadcode-lens | 死代码发现 | 方向相反（找没用的代码 vs 验证「说存在的代码」） |
| repo-lens / diff-desk | 仓库体检 / 文本对比 | 不做「声明↔实际」的逐条对账 |
| exec-sandbox | 隔离执行代码 | 执行验证的一环；本插件是事实性核验（存在性/一致性），不执行 AI 代码 |

**结论：「AI 声明 ↔ 本地实证」的逐条对账在 118 个条目里零覆盖。** 且前轮选型从未评估过本方向（grep 全部 docs/：无核验/claim/幻觉案底；唯一相关记录是 dev-toolbox 的「LLM 手算会幻觉」哲学，但那是给 AI 确定性计算器，不是核验器）。

## 二、外部证据（2025–2026 顶格痛点）

- [Stack Overflow 2025 开发者调查](https://survey.stackoverflow.co/2025/ai)：**66% 开发者最大挫败 = 「AI 方案差一点就对」**；45% 说调试 AI 生成的代码更耗时；**46% 主动不信任 AI 输出**（仅 3% 高度信任）。
- InfoQ 调查报道：**35% 的 AI 生成代码在团队理解之前就进了生产**。
- [Digital Applied 2026 Q1 调查](https://www.digitalapplied.com/blog/ai-coding-tool-adoption-2026-developer-survey)：token 成本波动（42%）与注入风险（31%）成为 2026 年初最大痛点——工具缺口被明确点名：**核验/调试 AI 输出的工具生态没跟上**。
- [arXiv 2510.25423](https://arxiv.org/html/2510.25423v1)：AI agent 系统开发挑战 7 大域 77 项，含运行时集成失败与调试困难。
- 本生态内部证据：AGENTS.md 核心原则 #1「改动前先确认现状…不臆造接口」、platform-constraints 坑清单本身就是历轮「AI 声明被源码证伪」的沉淀（027 条目被源码证伪、探活推论≠源码、统计口径漂移……）。每个夜班轮次都在手工做本插件要自动化的事。

## 三、竞品格局

| 竞品 | 状态 | 缺口 |
|---|---|---|
| 手工 grep / 自己读源码 | 普遍 | 无结构化：AI 一段话里 8 条声明漏验 5 条是常态 |
| IDE typecheck（tsc 等） | 成熟 | 只覆盖仓内编译型语言；AI **回答文本**（markdown 代码块/叙述）核不了；不出「声明清单」 |
| FacTool / factuality 研究 | 论文阶段 | 无本地可用形态；面向世界知识非代码工程 |
| 通用 RAG 幻觉检测 SaaS | 云端 | 代码工程场景弱、数据要出本机、收费 |
| dev-toolbox 思路（给 AI 确定性计算器） | 本生态已有 | 是「让 AI 算对」，不是「验证 AI 说的对不对」 |

差异化：①本地实证零外联（声明与代码不出机）②提取→核验→证据的**完整链路**而非单点 ③MCP 工具化——宿主 AI 可在宣布完成前**自证**（这是把「核验」从人肉步骤变成 agent 循环内步骤的关键形态，竞品均无）。

## 四、评分（权重合计 100%）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4.5 | 66% 头号挫败（SO 2025）+46% 不信任；本生态每轮夜班实证 |
| 频率与覆盖 | 15% | 4.5 | 84% 开发者用 AI；每次 AI 编码会话都以声明结束 |
| 现有方案缺口 | 15% | 4.0 | 无本地工具；typecheck 只覆盖仓内编译型；SaaS 出云 |
| 可验证差异化 | 15% | 4.5 | 提取→核验→证据链路 + MCP 自证形态独有；纯本地 |
| 收益与价值 | 15% | 4.0 | 人工核验一条 AI 回答 2–5 分钟 → 秒级；幻觉 API 在进入调试前被拦 |
| 平台适配 | 10% | 4.5 | 服务型插件成熟范式（qr-desk 模板）；fs 直读 + allowlist exec + MCP stdio 全有先例 |
| 技术可行性 | 5% | 4.5 | 提取启发式 + fs/exec 原语全部确定性可测 |
| 开发维护成本 | 5% | 5.0 | 零外部服务、零密钥、零持续成本 |
| **加权总分** | | **88.0** | 过线（近三轮门槛 ~85；对比被否决的 Terraform 79 / gRPC 80.5 / .http 76） |

## 五、MVP 定界

**五类声明**：file（路径，含 git status 交叉核对）/ symbol（函数/类/常量定义，file 定位或全库 grep）/ package（package.json + node_modules 实测）/ cli（allowlist `cmd [subcmd] --help` 探测）/ config（JSON/JSONC 点路径精确，YAML/TOML 行式弱证据并如实标注）。

**裁决四态**：verified（证据）/ refuted（证据）/ partial（如大小写不一致、只有引用未见定义、已装未入清单）/ unverifiable（allowlist 外/无 ground truth，附原因）。**证据永远展示，不打哑分。**

**MCP 四工具**：claim_extract（纯提取）/ claim_verify（text+root 全链路）/ claim_verify_batch（AI 自构 typed claims 批量核验，绕开提取精度）/ claim_selftest（试金石）。

**明确不做**：语义正确性核验（「逻辑对不对」归执行/测试）、HTTP/网络声明、世界知识 fact-check、自动修复、多仓库、git 历史考古（只看 status 现状）。

**安全红线**：exec 只允许 {git,node,npm,pnpm,cargo,rustc,go,python,python3,pip,docker,kubectl,deno,bun} 的 `--help/-h/--version` 探测形态与 `git status --porcelain` 精确形态；spawn shell:false + token 正则校验 + 8s 超时 + 256KB 输出上限；fs 只读；服务 127.0.0.1 + token；日志只记类型与数量不记内容。

**关键假设与止损**：假设 = 「提取启发式的精度足以让核验结果可信」。若实测提取噪声过大，MCP 工具 `claim_verify_batch`（AI 自构声明）仍独立成立——价值不随提取质量塌方。若两类都无效，止损于本地 commit 不发布。
