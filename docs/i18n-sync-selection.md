# i18n-sync 选型记录（第 15 轮热点发现，2026-11-06）

> 任务：为 Polaris 插件生态发现一个有真实市场需求的生产级插件。方向硬闸：禁台账/记录/CRUD/家庭生活类；主攻工具/技术/调试/变换/自动化。判断口诀：核心动作是「记录发生了什么」→ 淘汰；「变换了/诊断了/自动化了什么」→ 合格。

## 一、候选池（12 个，全部先过方向硬闸 + 撞车 grep）

撞车 grep 方法：`ls plugins/` + `index.json` 关键词 + 可疑插件读 plugin.json 描述逐个排除。

| # | 候选 | 核心动作 | 结论 |
|---|---|---|---|
| 1 | Redis 调试台 | 诊断 | **淘汰（撞车）**：db-workbench 描述已含「Redis 键浏览（SCAN 分页/TTL/类型/值预览）+ 白名单命令行」，独立 Redis 台差异化不足 |
| 2 | secrets 扫描器 | 诊断 | **淘汰（撞车）**：keyscan 已交付（20 类凭据规则+香农熵+增量基线+脱敏报告） |
| 3 | Mock 接口台 | 变换 | **淘汰（撞车）**：mock-server（127.0.0.1:9868 假接口+OpenAPI 导入）与 schema-mock 已覆盖 |
| 4 | 循环依赖/依赖图透视 | 诊断 | **淘汰（撞车）**：deadcode-lens 已含循环依赖（Tarjan SCC）+ import 图 |
| 5 | PII 脱敏台 | 变换 | **淘汰（占坑）**：仓库已有 `data-mask-selection.md` 选型占位（半成品目录），且 text-triage/unicode-lens 相邻 |
| 6 | gRPC 调试台 | 诊断 | 保留评分：痛点强（BloomRPC 失修）但工程量 2-3 倍、冒烟需自建 gRPC server、HTTP/2 反射边界多 |
| 7 | GraphQL 工作台 | 诊断 | **淘汰**：GraphiQL/Altair/Postman 免费充分 + graphql-inspector 做 diff 已是标准答案，差异化弱 |
| 8 | Nginx 配置体检台 | 诊断 | 保留评分：但调研实锤「不跑真 nginx 无法完全模拟 rewrite/return 语义」（jvns playground 直接跑容器），静态模拟器保真是硬伤；gixy fork（gixy-ng/Gixy-Next/GetPageSpeed+IDE 插件）活跃 |
| 9 | TS API 破坏性差分台 | 诊断 | 保留评分：api-diff(Shopify) 2022 年归档=缺口真实，但受众仅库维护者、compiler API 边界风险 |
| 10 | HTTP 缓存行为台 | 诊断 | 保留评分：redbot.org 免费且权威覆盖大半价值，纯逻辑核好测但天花板低 |
| 11 | 依赖许可证审计 | 诊断 | **淘汰**：dep-probe 相邻（同 lockfile 解析基座），合规受众窄、频率低 |
| 12 | SSH 工作台 | 自动化 | **淘汰**：termius/xshell 免费强竞品、凭据存储安全面重、与 pocket-host 相邻 |
| 13 | **多语言键同步台（i18n-sync）** | **变换** | ✅ **入选** |

## 二、入选方向的市场证据（外部调研，可追溯）

- **痛点定性**：better-i18n《JSON Translation Best Practices》：「目标语言缺键（英文有、语言文件无）是**最常见的生产 i18n bug**」。
- **多方进场验证**：微软 VS Code 官方讨论区有 LocaleSync 扩展专治多语言文件同步；lingual.dev 出 i18n-check；i18nagent 出 AI 翻译文件同步（付费 SaaS）；Medium 有 AI 补齐 i18n 键的 VS Code 扩展教程；Reddit r/localization 有自扫代码库查缺键的讨论——同一问题被不同人群反复解决=真实高频。
- **付费意愿**：BabelEdit（€35 买断）、Crowdin/Lokalise/LinguiNode SaaS（$/$$$ 月费）——个人开发者愿意为键同步付钱，但 SaaS 对小项目/隐私敏感项目过重。
- **现方案缺口**：VS Code 扩展锁编辑器；SaaS 要传源文案上云；CLI 脚本（i18next-parser 等）只报告不落盘；**「离线确定性体检 + AI 补齐 + 审阅落盘 + 可撤销」一体的本地免费方案缺位**。
- **宿主适配红利**：Polaris 的 AI 供应商已配置好（零额外 API key），对话 AI 经 MCP 工具直接驱动「读缺失清单→翻译→confirm 落盘」，这是独立工具做不到的差异化。

## 三、评分（权重制，满分 100）

| 维度 | 权重 | 得分 | 证据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.5 | 最常见生产 i18n bug（better-i18n 定性）；发版漏键=线上 raw key 直接裸奔给用户 |
| 频率与覆盖 | 15% | 4.5 | 每次发版都碰；出海浪潮下 zh→en/ja/ko 多语言应用是主流形态 |
| 现有方案缺口 | 15% | 4.0 | 方案多但割裂：编辑器扩展/付费 SaaS/只报告脚本；离线一体缺位。竞品比 nginx 方向活跃，故非满分 |
| 可验证差异化 | 15% | 4.5 | 宿主 AI 零密钥翻译 + MCP 全程驱动 + 占位符一致性校验拦机器翻译典型错误 + 审阅门/撤销；SaaS 全都要钱或上云 |
| 收益 | 15% | 4.0 | 每版省 10-30 分钟手工比对 + 拦截缺键/占位符错配两类线上事故 |
| 平台适配 | 10% | 5.0 | cap.fs 文件读取 + cap.kv 设置/术语表 + MCP 五工具 + 面板矩阵；env-drift（键漂移）/yaml-lens（js-yaml bundle）双先例 |
| 技术可行性 | 5% | 5.0 | 纯 JS 引擎零原生依赖；js-yaml 走 yaml-lens 已验证的 bundle 模式；三层验证全部 hermetic |
| 开发维护成本 | 5% | 4.0 | 规模中等；长期维护面=布局兼容与 YAML 序列化差异 |
| **加权总分** | | **88.0** | 对比：gRPC 80.5 / Nginx 78.0 / SSH 77.5 / TS-diff 76.0 / Cache 74.0 / License 69.0 |

## 四、定案理由与风险管理

- **为什么是它**：分数最高 + 平台适配红利最大（AI 已在对话里）+ 三层验证可完全 hermetic（同轮候选中工程风险最低）。
- **最大不确定性**：用户是否满足于手工 grep（个人小项目频率低）。MVP 验证：先做单层 `locales/*.json` 主流布局的完整闭环，README 给 30 秒上手；若无人使用则止损（成本低，无外部依赖欠债）。
- **与 env-drift 的边界**：env-drift 对比 `.env.example` vs `.env`（同文件双侧、值脱敏）；i18n-sync 对比 N 个语言文件的键奇偶 + 翻译补齐 + 落盘。键漂移思想同源，域不重叠。
- **假设不成立的止损**：若「AI 补齐」工作流验证失败，奇偶体检+手工编辑落盘仍是完整可用的独立价值，无沉没依赖。

## 五、参考来源

- [better-i18n: JSON Translation Files](https://better-i18n.com/en/blog/json-translation-files)（最常见生产 bug 定性）
- [VS Code Discussions #3064 LocaleSync](https://github.com/microsoft/vscode-discussions/discussions/3064)
- [lingual.dev: Introducing i18n-check](https://lingual.dev/blog/introducing-i18n-check)
- [i18nagent: Translation File Sync](https://i18nagent.ai/en/guides/translation-file-sync)
- [Dev.to: Finding missing and unused i18next keys](https://dev.to/ibrahimdans/finding-missing-and-unused-i18next-keys-in-a-react-project-4k0a)
- [locize: Missing Translations in i18next](https://www.locize.com/blog/missing-translations)
- [Medium: Automating i18n key translations with AI VS Code extension](https://medium.com/@rkganeshan2010/automating-i18n-key-translations-with-a-vs-code-extension-powered-by-ai-d2eea220769b)
- Nginx 方向淘汰依据：[jvns: Nginx Playground](https://jvns.ca/blog/2021/09/24/new-tool--an-nginx-playground)（「在线工具无法完全模拟 rewrite 语义」）、[gixy-ng](https://pypi.org/project/gixy-ng)、[Gixy-Next 维护故事](https://joshua.hu/gixy-ng-ai-slop-gixy-next-maintained)
