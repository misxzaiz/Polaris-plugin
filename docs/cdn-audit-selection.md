# 选型文档：CDN 体检台（cdn-audit）

> 2026-11-03 · 第 N 轮插件选型 · 遵循任务书硬约束（2026-11-01 用户定案：禁台账/记录/生活类；主攻工具/技术/调试/诊断/安全/内容变换）。
> 核心动作判定：本插件是「**核验 + 诊断 + 变换（生成带 SRI 的标签）+ 观测（传播对账）**」——把"我引用的 CDN 资源是不是真身、从我的网络哪个镜像安全可达、CDN 边缘何时更新到最新"变成可执行可断言的体检。零记录台账属性，合格。

## 一、生态饱和度盘点（先内后外）

index.json 全量 85 条上架条目 + 4 个工作区在途（diff-desk / data-query / flow-pipeline / bundle-lens，并行会话成果，避让）逐一核对：

| 既有覆盖 | 与本选型关系 |
|---|---|
| site-audit 站点体检台 | 查外链**存活**（4xx/5xx）与页面 SEO 项；**不做内容完整性/篡改核验**（plan 明确"外链只验存活不解析不深爬"） |
| domain-probe 域名诊断台 | DNS/邮件身份/证书；含「解析传播对账」范式（本插件传播观测复用其形态，目标域不同） |
| diff-desk（在途） | 双 URL 对比是"用户给两个 URL 比"的一次性 diff；无官方哈希源、无镜像矩阵、无 SRI 生成 |
| keyscan / dep-probe / har-lens | 密钥扫描 / 依赖漏洞 / 抓包分析——供应链的另外三个侧面，均不核验 CDN 分发内容 |
| relay-devkit / dev-toolbox | API 客户端与 JSON/编码小工具，无资源完整性语义 |

grep 全 index（cdn|镜像|SRI|integrity|投毒|polyfill）→ **零命中（除 site-audit 的"外链死链"字样）**。生态空白。

## 二、候选池（12 个，全过方向硬闸）

| # | 候选 | 处置 | 关键理由 |
|---|---|---|---|
| 1 | **CDN 体检台（静态资源完整性+镜像可达性+传播观测）** | ✅ 入选 85.5 分 | 见三、四节 |
| 2 | JSON 类型/契约变换台（json→TS/Zod/JSON Schema/SQL DDL） | 74 分 | 高频但浅；transform.tools/quicktype 在线方案成熟，AI 直接生成类型正在侵蚀差异化；relay-devkit/dev-toolbox 的 JSON 工具相邻 |
| 3 | 数据脱敏台 | 65 分 | 往轮已评（mail-desk-selection）：个人低频、开源工具多、格式保真风险高 |
| 4 | grok 文本结构化提取台 | 64 分 | 运维向窄众；log-lens 覆盖日志诊断视角 |
| 5 | LLM API 录制回放台 | 63 分 | mock-server 已含 OpenAI 协议 mock 半边；测试向受众窄 |
| 6 | 字体子集化工坊 | 62 分 | CJK web 性能真痛点但受众窄（自定义字体项目）；fontmin CLI 可用 |
| 7 | 批量重命名台 | 60 分 | file-flow 相邻（组织 vs 重命名）；PowerToys 免费 |
| 8 | AI 会话审计台（读宿主审计链） | 60 分 | 依赖宿主内部数据形态，host territory 风险 |
| 9 | OpenAPI 契约台 | 74→不复评 | 往轮两轮淘汰（oasdiff CLI 已够用） |
| 10 | TLS 证书工坊（本地签发自签证书） | 58 分 | 信任库安装是 OS 级变更，插件不应承担；mkcert 成熟 |
| 11 | ENV 文件治理台 | 61 分 | 往轮已评："治理"属性偏记录、安全责任重 |
| 12 | 二维码工坊 | 57 分 | 往轮已评：单点太薄 |

## 三、市场证据（外部，可追溯）

1. **供应链投毒是已发生的大规模事故，不是假设**：
   - 2024-06 [Polyfill.io 收购方注入恶意重定向代码](https://blog.sentry.io/polyfill-io-supply-chain-attack/)，[Cloudflare 与 Fastly 直接封锁其域名](https://blog.cloudflare.com/blocking-malicious-subressource-integrity-failure-polyfill-io/)；波及站点以十万计。
   - 同期安全社区确认 [BootCDN / Bootcss / Staticfile 与 polyfill.io 指向同一运营者](https://zhuanlan.zhihu.com/p/704292854)（长亭百川云、CSDN 等多方分析），国内大量网站引用的 jQuery/bootstrap 等被替换为混淆恶意代码——**正是"CDN 分发内容 ≠ 官方内容"的实锤**。
   - [jsDelivr 2024 年另一轮域名被污染事件](https://github.com/jsdelivr/jsdelivr/issues?q=pollution)（国内 DNS 污染至恶意 IP）持续发生——**可用性事故与投毒风险长期并存**。
2. **防护手段（SRI）存在，但「事后核验」工具位空缺**：
   - SRI 机制由 [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) 与 [GitHub 官方安全加固指南](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/securing-your-buildouts-add-sri) 背书；webpack-subresource-integrity 等是**构建期**插件，管的是"我发布页面时写没写 integrity"。
   - 已有工具生态=「在线哈希生成器」（SRI Hash Generator 等，算哈希）+「构建期注入」——**没有**一个成品能回答："我今天页面上引用的这批 CDN 资源，此刻从我的网络取回来，和官方发布的内容一致吗？哪个镜像是对的？"
3. **镜像可用性因网因时而异，只有本机探测说真话**：
   - `cdn.jsdelivr.net` 大陆长期被污染/封锁，官方分流节点 [gcore.jsdelivr.net / testingcf.jsdelivr.net 可用性不一](https://kkocdko.site/blog/2023-2023120101)（2023 前端 CDN 评测），[npmmirror 成为大陆首选](https://zhuanlan.zhihu.com/p/675693014)——在线检测工具无法回答"从**你的**网络哪个镜像可达"。
4. **本生态 dogfood 证据（最强、日日发生）**：Polaris-plugin 全部 85 个插件经 jsDelivr CDN 分发；项目记忆链里「purge 静默限流 43 分钟」「CDN 双验证」「purge 39 分钟」「CDN 200 商城可见」反复出现 10+ 次——**每一次插件交付都要和"CDN 边缘什么时候真正更新"搏斗**，目前靠手工 GET + 盲等。本插件第一个用户就是本生态自己的发布链。

## 四、评分（每维 0-5 × 权重，满分 100）

| 维度 | 权重 | 得分 | 理由 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 18.0 (4.5) | 投毒事故真实且大规模；"引用的公共库是否可信"是每一次使用公共 CDN 的隐性恐惧 |
| 频率×覆盖 | 15% | 10.5 (3.5) | 前端/站长人人用 CDN 外链；事件驱动尖峰 + 发版审计 + 换源评估，中高频 |
| 现有方案缺口 | 15% | 13.5 (4.5) | 生成器/构建期插件/存活检查全都有，**完整性核验+本机镜像矩阵零成品** |
| 可验证差异化 | 15% | 13.5 (4.5) | 本机视角可达性（在线工具结构性做不到）+ 三权威哈希源双源核验 + jsDelivr 传播对账（dogfood）+ MCP 给 AI，全部 1 分钟可演示 |
| 用户收益 | 15% | 12.0 (4.0) | 事故面前 30 秒出"我的站有没有中招/哪个镜像安全"答案，替代手工 curl+openssl 流程 |
| 平台适配 | 10% | 10.0 (5.0) | service 出站 fetch + SSRF 围栏 + cap.kv 三端投影 + MCP，全是 house 已验证范式 |
| 技术可行性 | 5% | 4.5 (4.5) | npm registry dist.integrity / data.jsdelivr.com 逐文件 sha256 / api.cdnjs.com sri 三权威源实测可达（见下节）；纯 Node crypto |
| 开发维护成本 | 5% | 3.5 (3.5) | 镜像端点/路径格式映射表需随生态维护（中）；MVP 聚焦 npm 系全兼容路径族 |
| **合计** | | **85.5** | 候选池第一，次名 74，断层领先 |

## 五、技术前提实测（权威哈希源）

- npm registry：`GET registry.npmjs.org/<pkg>/<ver>` → `dist.integrity`（sha512，tarball 权威）。
- jsDelivr data API：`GET data.jsdelivr.com/v1/packages/npm/<pkg>@<ver>` → 每文件 `hash`（base64 sha256）。⚠️ 仅对 npm 包内真实文件；`.min.js` 若包内不存在则由 jsDelivr 现场生成，必须以包文件清单判定"真身文件"。
- cdnjs API：`GET api.cdnjs.com/libraries/<lib>/<ver>?fields=sri` → 逐文件 sha512 SRI。
- 上面三项已用 jQuery 3.7.1 实测拉通（见本文档 git 同期提交的端点探测记录）。
- 非 npm 系资源（自建 CDN/非库文件）→ 如实降级为「无法核对」+ 给出本机可达性与跨源一致性（多镜像交叉）参考，绝不假装权威。

## 六、定案与止损

- **选**：cdn-audit「CDN 体检台」，id `cdn-audit`，kv 前缀 `cda.*`，显示名直白。
- **最重要竞争优势**：本机视角（可达性+篡改核验合一）× 权威哈希双源 × 生态自用传播对账。
- **最大不确定性**：镜像路径格式映射（npm 系/cdnjs 系两族）覆盖面。对策：MVP 只承诺 npm 系三镜像（jsDelivr/unpkg/npmmirror 同一 tarball 同一路径族）+ cdnjs 族经官方 API；其余镜像如实标注「未核验」。
- **止损线**：若权威源 API 在真实网络下不稳定，收缩为「单镜像 SRI 生成器 + 可达性探测」仍独立可用。
- **明确不做**：不做页面爬取深扫（单页/粘贴 HTML 即可，整站属 site-audit）、不做浏览器代理/替换、不做自动改站、不内置任何"投毒名单"评分（只报事实：哈希一致/不一致/无法核对）。

## 七、验收标准（生产级）

1. 离线单测：URL 归一与 CDN 识别、npm 系路径族互转、SRI 编解码（sha384/sha512 base64）、真身文件判定（min 生成文件不误判）、SSRF 围栏、HTML 提取（script/link/img/crossowner）全绿。
2. typecheck + esbuild 构建通过。
3. spawn 集成：起 service → 试金石（内置本地 HTTP 假 CDN + 固定哈希 fixture）逐项断言：一致/篡改/不可达/无 SRI 建议。
4. MCP stdio 协议测试：initialize/tools/list/call 全通。
5. 真桥冒烟：宿主 9829 可达时，cap.kv 投影读写 + meta 心跳实证。
