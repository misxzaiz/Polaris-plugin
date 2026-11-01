# HAR 分析台（har-lens）选型与设计文档

> 2026-11-02 · v0.1.0 立项 · 生态第 74 插件

## 一、一句话定位

把浏览器导出的 HAR 抓包文件变成**不出本机**的诊断资产：瀑布图/慢请求/错误/大小多维透视，敏感信息一键审计（Cookie/Token/密钥），带脱敏导出安全分享版，双 HAR 对比找性能回归；AI 经 MCP 七工具对话式分析。零依赖零外联，数据永不离开本机。

## 二、方向硬约束自查（2026-11-01 用户定案）

- 核心动作 = **诊断 + 变换**（解析→诊断→脱敏→导出），不是「记录发生了什么」→ ✅ 合格
- 非台账/非 CRUD/非家庭生活类 → ✅ 合格
- 技术工具类，开发者调试场景 → ✅ 合格

## 三、市场证据（2026-11-02 检索，可追溯）

1. **隐私是 HAR 工作流的刚需痛点**：
   - Cloudflare 专门造轮子：官方博客《Introducing HAR Sanitizer – secure HAR sharing》——大厂因无现成工具而自建；
   - PingIdentity 提供 HAR File Sanitization 工具；Mimecast 上线 har-sanitizer 网页；Auth0/Sitecore/Spectro Cloud/Rublon 均有「如何安全生成/清洗 HAR」支持文档；
   - Sitecore 知识库明文警告「**never upload HAR files to public tools/forums**」；
   - Reddit r/webdev 专题讨论「Do you scrub HAR files before sending them to support?」。
2. **分析需求本身被反复验证**：Google ToolBox 自带 HAR Analyzer；WebPageTest 作者 Patrick Meenan 维护 waterfall.tools；DZone/Stack Overflow 长期有「如何分析 HAR 找性能问题」「有没有 Windows 离线 standalone 工具」的高热帖。
3. **竞品格局与缺口**：
   - 在线分析器（Google ToolBox、Screendesk、OpenReplay、ToolsWalla、OpenBrowserTools）：上传即隐私风险或浏览器页面试信问题 + 大文件受限；
   - PerfCascade（Netflix 系）：单一瀑布图展示，无审计/脱敏/对比；
   - sitespeedio/compare：只做性能回归对比一个切面；
   - 0xpanadol/har-viewer：小项目，离线查看+对比，无审计/脱敏/AI；
   - 脱敏侧：Go CLI（gobeyondidentity/har-sanitize）有 CLI 门槛，各家厂商工具互不相通，最常见做法仍是文本编辑器手工删（Spectro Cloud/Rublon 文档教的就是这个）；
   - **没有任何工具把「离线解析 + 多维诊断 + 敏感审计 + 一键脱敏导出 + 双 HAR 对比 + AI 问答」合成一体。**

## 四、候选池（13 个，先过方向硬约束再评分）

| # | 候选 | 判定 |
|---|---|---|
| 1 | **HAR 分析台** | ✅ 选定，评分 87/100 |
| 2 | 日志分析台 | 淘汰：生态撞车，log-lens 已交付同能力 |
| 3 | API Mock 台 | 淘汰：mock-server 2026-11-01 刚交付 |
| 4 | SQLite 浏览台 | 淘汰：sqlite-lens 并行会话进行中 |
| 5 | 密钥扫描台 | 淘汰：keyscan 已覆盖（本项目审计模块只扫 HAR 结构，不重复造扫描器） |
| 6 | OpenAPI 检查台 | 78 分：42Crunch VS Code 扩展免费离线覆盖主力，oasdiff 覆盖 diff，缺口在「合并一体」，差异化被压薄 |
| 7 | 数据脱敏台（DB/CSV） | 74 分：Neosync/PostgreSQL Anonymizer 强开源竞品，输入面（DB dump）场景窄 |
| 8 | 正则工作台 | 69 分：regex101 免费且强，仅离线+ReDoS 检测差异 |
| 9 | i18n 键检查台 | 66 分：受众窄，eslint-plugin-i18n 覆盖多数场景 |
| 10 | Git 仓库剖析台 | 65 分：git-quick-stats/gitinspector CLI 存在，痛点中频 |
| 11 | TLS 证书检查台 | 62 分：openssl/在线工具覆盖，偶发需求 |
| 12 | 依赖体检台 | 60 分：dependabot/renovate 平台级覆盖 |
| 13 | CSV 探查台 | 58 分：与 gezhi 场景相邻 + Excel 本身是巨无霸 |

## 五、HAR 分析台评分（权重制，87/100）

| 维度 | 权重 | 得分 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4.5 | SaaS 支持流程标配工件；性能/联调排障必需；Cloudflare 等大厂为它自建工具 |
| 频率与人群 | 15% | 4.0 | 前端/全栈/测试/支持工程师全命中；抓包排障高频 |
| 现有方案缺口 | 15% | 4.0 | 在线工具隐私墙+大小限；桌面侧碎片化；脱敏靠手工 |
| 可验证差异化 | 15% | 4.5 | 六位一体 + 数据不出本机（有 Sitecore/Cloudflare 证据支撑的硬需求） |
| 用户收益 | 15% | 4.0 | 分享前一键脱敏=安全收益；AI 问答式分析降门槛 |
| 平台适配 | 10% | 5.0 | 纯本地文件变换零网络；服务进程读文件天然合规；瀑布图 UI 适配面板 |
| 技术可行性 | 5% | 5.0 | HAR=标准 JSON，零依赖可实现 |
| 成本 | 5% | 4.5 | 零外部依赖零 API 成本，维护面小 |

## 六、产品边界

**MVP 做**：打开本地 .har（≤150MB，条目≤2 万截断）→ 概览指标（条目/总时长/传输量/状态分布/域分布/时相分解/p50/p95）→ 瀑布图（虚拟滚动，时相彩色条）→ 诊断清单（慢 TOP/错误/大响应/疑似无缓存重复）→ 请求详情（头/时相/体预览，全部脱敏显示）→ 敏感审计（8 类规则，分级定位）→ 脱敏导出（6 开关 + sha256）→ 双 HAR 对比（新增/消失/变慢/变快/状态翻转）→ AI MCP 七工具 → 试金石自检（内存合成 HAR 全链路断言，零网络）。

**不做**：实时抓包（webhook-station 已覆盖入站捕获）、HAR 编辑回放（api-bench 压测域）、证书/解密 HTTPS 原始流量、远程 URL 拉取 HAR（零外联原则）、多文件批量对比（v0.2 候选）。

## 七、架构（两平面，mock-server 同款已验证范式）

- **服务进程**（node 零依赖，127.0.0.1:9873）：唯一重量级事实——读文件、解析、投影、脱敏导出。无 HTTP 管理 API（仅 /__health），控制面全走 cap.kv。
- **kv 键空间**（`har.*`）：`har.meta` 心跳/状态、`har.report` 概览、`har.rows.idx`+`har.rows.N` 请求行分块投影、`har.audit` 审计报告、`har.diff` 对比报告、`har.hist` 打开历史、`har.settings` 选项、`har.cmd`/`har.result` 单槽命令信箱（先删后做+nonce 防重放）、`har.selftest` 自检报告。
- **面板**（React，esbuild→dist/panel.js）：只读 kv 投影 + 写命令信箱；瀑布图虚拟滚动；所有投影字段过 `redactText` 敏感掩码（kv 里不落明文密钥）。
- **MCP**（stdio 七工具）：har_open / har_overview / har_requests / har_entry / har_audit / har_sanitize / har_compare。
- **安全边界**：无网络请求（导出走本地文件）；路径白名单校验（输入须存在且 .har/.json，输出须 .har，默认同目录 `*.sanitized.har`，覆盖须显式 confirm）；投影/详情/审计样例三处全量掩码；150MB/2 万条目护栏。

## 八、验收口径（四层 + 真桥）

1. core 单测：解析/投影/审计/脱敏/对比/fixture 断言（含「脱敏后结构合法且可再解析」往返断言）；
2. 服务集成（假桥+内存 kv）：open→meta/report/rows 落库、entry/sanitize/compare 命令全链路、护栏（大文件拒绝/坏 JSON/路径逃逸）；
3. MCP 协议：stdio 全链路七工具 + 假桥；
4. SSR 渲染：四 Tab/空态/护栏文案/离线态；
5. 真桥冒烟：真实宿主 kv + 真实解析 fixture HAR + MCP 真子进程 + 自清理。
