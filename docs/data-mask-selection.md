# 选型文档：数据脱敏台（data-mask）

> 2026-11-03 · 第 57 号插件选型记录。方向硬约束（2026-11-01 用户定案）：台账/记录/家庭生活类一律不进候选池；主攻工具/技术/调试诊断/自动化执行/内容变换。
> 核心动作判定：本插件的动作是「**变换**数据」（把含个人信息的数据变换为可安全分享的形态），不是「记录」数据——过闸。

## 一、生态饱和度盘点（先内后外）

Polaris-plugin 现 87+ 条目（含并行会话今日立项的 flow-pipeline / data-query / process-desk）。与本选型相关的既有覆盖：

| 既有插件 | 覆盖 | 与本选型关系 |
|---|---|---|
| keyscan 密钥扫描台 | **凭据泄露检测**（API key/私钥/连接串） | 检测对象不同（机器凭据 vs 个人信息），互不替代；共享「掩码不变量」安全姿态先例 |
| dev-toolbox / relay-devkit | JWT/哈希/JSON/SQL 等小工具 | 无任何脱敏能力 |
| mock-server | 假接口服务（含模板造数） | 造数 ≠ 对真实数据脱敏；无映射、无校验位检测 |
| data-query（并行 WIP） | 本地文件 SQL 分析 | **互补**：敏感文件先经 data-mask 脱敏，再进 data-query 分析更安全；无重叠 |
| amber/yizhou | 网页抓取/翻译 | 无脱敏 |
| imgforge | 图片 EXIF 剥离 | 仅图片元数据；本插件处理**文本/JSON/CSV/SQL/日志中的 PII** |
| file-flow / data-ark | 文件整理/备份 | 无内容变换 |

**结论：「文本数据的个人信息脱敏」在 87 个条目里零覆盖。**

## 二、候选池（≥10，全部过方向硬闸，全部查重后淘汰/入围）

| # | 候选 | 判定 | 依据 |
|---|---|---|---|
| 1 | **数据脱敏台（data-mask）**——把文本/JSON/CSV/SQL/日志中的手机号/身份证/银行卡/姓名/邮箱等变换为可安全交给 AI 或同事的形态 | ✅ **入围** | LLM 时代贴数据给 AI 是日常动作，泄露恐惧真实；生态空白；证据见下 |
| 2 | 字体子集台 | 淘汰 | cn-font-split（WASM/Rust，智能分包）+ fontmin 已充分解决，缺口弱 |
| 3 | 编码/乱码诊室 | 淘汰（降为 data-mask 内子能力不单列） | 在线转换工具多；单发频率高但深度需求少；独立插件价值撑不起 |
| 4 | OpenAPI 契约守卫（breaking diff） | 淘汰 | oasdiff/spectral 成熟；受众偏 API 团队，与个人工具箱定位错位 |
| 5 | Markdown→社交图片卡 | 淘汰 | mdnice/xiumi 等免费方案饱和；装饰性大于工具性 |
| 6 | GraphQL 调试台 | 淘汰 | 国内使用面窄；relay-devkit API 客户端已覆盖大半调试场景 |
| 7 | i18n 缺漏检查台 | 淘汰 | 受众过窄（i18n 项目才有用）；keyscan 式目录扫描已教育了用法但频次低 |
| 8 | .env 漂移对比台 | 淘汰 | 范围太小撑不起独立插件；dotenv-linter 存在 |
| 9 | 音频转写台（whisper 离线） | 淘汰 | 模型文件 75MB+ 超 jsDelivr CDN 50MB zip 上限，违背零配置交付纪律；工程风险大 |
| 10 | API 签名计算器（微信/支付宝） | 淘汰 | 受众过窄；各家 SDK 自带调试工具 |
| 11 | 日志模板挖掘台 | 淘汰 | log-lens 已含错误聚类（数字/UUID/IP 归一化分组），重叠 |
| 12 | 证书深度诊断台 | 淘汰 | domain-probe 已含证书过期检查；深挖链路分析增量价值低 |

## 三、需求证据（外部，可追溯）

1. **「贴数据给 LLM 前先脱敏」是被企业级产品全线布局的真实需求**：Microsoft Presidio（事实标准 OSS SDK）、LLM Guard（基于 Presidio 的提示净化）、PrivateGPT（拦截 50+ 类 PII 进 ChatGPT）、Pangea/Treza/Radicalbit 等网关级脱敏产品——方向被反复验证为真（来源：[Radicalbit 网关级 PII 脱敏](https://radicalbit.ai/resources/blog/enforcing-data-privacy-in-your-llm-applications-pii-redaction-and-anonymization-at-the-gateway-level)、[Darkreading：PrivateGPT](https://www.darkreading.com/application-security/privategpt-tackles-sensitive-info-chatgpt-prompts)、[Nordlayer ChatGPT DLP 指南](https://nordlayer.com/blog/dlp-for-chatgpt)）。
2. **企业 DLP 厂商把「员工往 AI 里贴敏感数据」当作一级威胁场景**（SSE/NGFW/终端安全全在加 AI-DLP 功能，见 r/AskNetsec、r/mlops 多帖共识）——个人/小团队没有网关，缺一个本地工作台。
3. **中文场景工具全部是浅层单发**：[HandyToolBox 在线脱敏](https://tool.yolo813.com/security-tool/data-masking)（文本粘贴级，无文件/无映射/无确定性假名）、[身份证批量脱敏](https://ziyun.mintiny.com/safe/IDNumberMasking)（单类型）；企业级如[百度安全 AI 数据脱敏](https://anquan.baidu.com/product/datades)重量级不面向个人。**「本地、文件级、可逆、确定性假名」的个人工作台形态空缺。**
4. **PIPL/数据安全法语境**下「测试/调试用真实数据须脱敏」是开发者的合规刚需（CSDN 上「Java 脱敏工具类」类文章长盛不衰，如[这篇](https://blog.csdn.net/weixin_42555014/article/details/129244440)），但到处复制粘贴工具类代码正说明缺顺手工具。

**已找到的真实证据 vs 推断 vs 假设**：
- 证据：上述产品全线布局与社区讨论（AI 时代贴数据泄露是真问题）。
- 推断：个人开发者在「给 AI 发日志/JSON/CSV」前愿意多一步本地脱敏（Presidio 的 CLI 重、在线工具的浅，中间地带存在）。
- 假设（MVP 待验证）：校验位级检测 + 确定性假名带来的「分析可用性」是用户选择本插件而非一次性在线工具的理由。

## 四、评分（满分 100，权重按任务书）

| 维度 | 权重 | 得分 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4.5 | 贴数据给 AI 前的泄露恐惧真实且高代价（PIPL 罚则/企业红线）；企业愿意为网关产品付费证明痛感 |
| 需求频率与覆盖 | 15% | 4.0 | AI 调试贴数据近日常；测试造数/数据分享/工单附件多场景；覆盖开发者+测试+数据分析 |
| 现有方案缺口 | 15% | 4.0 | 在线工具=单发文本、无文件无映射；Presidio=Python SDK 门槛；网关=企业级；个人本地工作台缺位 |
| 可验证差异化 | 15% | 4.5 | 校验位级检测（身份证 MOD 11-2/银行卡 Luhn/手机号段表）→ 近零误报；**确定性假名**保关联性（同一人同一假名，AI 分析不散架）；**本地映射台账+会话内还原**；一键发送到 AI（onSendToChat）；MCP 五工具让 AI 自己先脱敏再分析 |
| 用户收益 | 15% | 4.5 | 风险消除型收益（可量化为：避免一次泄露=免一次事故）；把「不敢发 AI」变成「敢发」 |
| 平台适配 | 10% | 5.0 | 纯本地零外网；keyscan 同构形态已被验证（纯核+服务+MCP+面板）；onSendToChat 是 Polaris 独有集成点 |
| 技术可行性 | 5% | 5.0 | 零依赖纯 JS 核心（keyscan 已验证四方共用模式）；校验位算法确定性可测 |
| 开发维护成本 | 5% | 4.0 | 一次性核心 + 低频维护（号段/区划码表年度更新可容忍） |
| **加权总分** | | **88** | （4.5×20+4×15+4×15+4.5×15+4.5×15+5×10+5×5+4×5）/5 = 88 |

**次高候选对比**：编码诊室 ~72（缺口与差异化双弱）；OpenAPI 守卫 ~70（受众错位）；均无翻盘点。

## 五、决策与风险

- **选择**：数据脱敏台（id `data-mask`，直白功能名）。
- **最重要竞争优势**：确定性假名 + 本地可逆台账 + 校验位级精度 + AI 原生集成（MCP 工具让 AI「先脱敏、再分析」，onSendToChat 让面板一键把脱敏结果送进会话）。这四件事在线工具一个都没有。
- **最大不确定性**：用户是否愿意在「直接贴」和「先脱敏再贴」之间多一步。缓解：面板默认「粘贴→一键脱敏→发送」三键流，成本压到 5 秒。
- **MVP 验证假设的方法**：真宿主冒烟走通「粘贴→脱敏→发送 AI→AI 引用假名回答」全链路；若假名形态让 AI 无法理解数据（而非理解不了隐私），则回退默认模式为部分打码。
- **止损条件**：若真宿主冒烟发现宿主通道（onSendToChat / cap.kv）不满足台账或发送语义，降级为纯面板工具交付；核心脱敏引擎独立成立，不因集成失败废弃。
- **明确不做**：图片/人脸脱敏（OCR 边界复杂，ocr-bench 可组合）；网络传输脱敏代理（安全边界大，不进插件形态）；PDF 内容脱敏（pdf-tables/zhifang 可组合文本层导出后再脱敏）。
