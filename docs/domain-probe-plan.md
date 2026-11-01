# domain-probe（域名诊断台）选型与设计文档

> 2026-11-02 · 任务：为 Polaris 插件生态寻找并交付一个有真实市场需求的生产级插件。
> 本文 = 选型证据 + 评分定案 + 产品/技术设计。

## 一、方向硬约束与覆盖地图

用户 2026-11-01 定案：禁台账/记录/CRUD/生活管理类（生态已饱和 15+），主攻技术工具、调试诊断观测、自动化、AI 能力扩展、数据处理、系统/网络工具、性能安全、内容变换。

候选前先建立 73 个插件的覆盖地图（`plugins/*/plugin.json` 全量提取），确认候选不与任何现有插件重叠：

- 开发者工具已密集：mock-server（Mock 接口）、api-bench（压测）、har-lens（HAR 分析）、log-lens（日志透视）、relay-devkit（API 客户端/JSON/SQL/时间戳）、keyscan（密钥扫描）、mcp-probe、sqlitelens、llm-probe（模型体检）、context-pack、bookmark-dig（书签体检）、site-audit（整站爬取体检）。
- 网络类已有：net-sentinel（TCP 握手延迟/丢包/断网事件——测的是「网络质量」，不是「域名配置正确性」）、webhook-station（入站回调）、page-sentinel（网页变化）、pocket-host（本机资源）、feed-radar、paper-radar、quote-sentinel。

## 二、候选池与评分（满分 100，权重见任务书）

### C1 域名诊断台（domain-probe）—— DNS 记录 + 邮件身份(SPF/DMARC/DKIM) + TLS 证书 + 多解析器一致性

| 维度 | 权重 | 得分 | 证据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.5 | 邮件进垃圾箱=业务直接受损；Google/Yahoo 2024-02 起强制批量发件人 SPF+DKIM+DMARC，Microsoft 2025-05 跟进，是一纸可查的市场推力（support.google.com/mail/answer/81126；mxtoolbox.com/c/landing/gmail-and-yahoo-new-dmarc-spam-sender-requirements） |
| 频率/人群 | 15% | 4.0 | 所有拥有域名的开发者/站长/self-hoster；事件型但反复发生（配置、迁移、续期、新项目） |
| 现有方案缺口 | 15% | 4.0 | MXToolbox/DNSChecker=广告多、逐项手查、无引导诊断、无本机留存；dig/nslookup CLI 无语义分析；dnsviz 门槛高。缺「一次输入→结构化报告→人话修复建议」 |
| 差异化优势 | 15% | 4.0 | 本机零登录 + AI 对话诊断（MCP）+ **国内外解析器一致性对比**（CN 环境视角，在线工具做不到）+ 生态联动（task-runner 可定时复查证书） |
| 收益 | 15% | 4.5 | 避免邮件可达性损失/证书过期事故；解析变更验证从「翻墙开一堆网页」变 30 秒 |
| 平台适配 | 10% | 5.0 | 纯 DoH JSON API（fetch 即可，零依赖）+ node 原生 tls；数据全走 cap.kv；无需宿主改动 |
| 可行性 | 5% | 5.0 | SPF/DMARC 解析与 RFC 7208 lookup 计数是纯函数，离线可测；DoH 四端点已实测（alidns/doh.pub 200，cloudflare/google 本网络被重置=必须做成逐解析器诚实降级） |
| 成本 | 5% | 5.0 | 零运行时依赖、零外部账号、零 API 费用；只读操作无副作用 |
| **加权总分** | | **87.5** | |

### C2 AI Prompt 回归评测台

| 维度 | 权重 | 得分 | 证据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.0 | prompt 静默回归是真实痛点 |
| 频率/人群 | 15% | 3.5 | 仅 AI-native 开发者子集 |
| 缺口 | 15% | 3.0 | promptfoo ~22k★ 且有 Web UI，成熟方案已存在 |
| 差异化 | 15% | 3.5 | 宿主供应商导入零配 key（llm-probe 先例）是真优势 |
| 收益 | 15% | 4.0 | 真实但依赖跑量 |
| 平台适配 | 10% | 3.0 | cap.ai.chat 不对插件开放，须烧用户配额；judge 质量难保证 |
| 可行性 | 5% | 3.0 | 评测语义工程量大，易做出假价值 |
| 成本 | 5% | 2.0 | 构建+运行双高 |
| **加权总分** | | **69.0** | 淘汰理由：成熟竞品存在 + 插件侧跑评测必然烧用户 token 配额 + 判定不可靠时输出即假价值 |

### C3 WebSocket 调试台

| 维度 | 权重 | 得分 | 摘要 |
|---|---:|---:|---|
| 各维度 | | **67.5** | wscat CLI 痛点实证（issues: 无二进制/无历史/连接掉线），但 Postman 已内置 GUI WS 客户端；受众窄于 C1；需引入 ws 依赖 + 长连接会话语义复杂。列备选 |

### 其余候选（一轮筛掉）

- Git 仓库体检台：人群与频率弱于 C1，cap.git feature 门控不确定性 → 备选池外。
- 正则调试台 / diff 台 / JWT 台 / Cron 台：天花板低或被 relay-devkit/task-runner 部分覆盖。
- 端口扫描/指纹：涉及对第三方主机主动扫描的合规风险 → 不做。
- 批量重命名：与 file-flow 相邻，形态收益不足。

## 三、定案：C1 域名诊断台

**一句话**：把「我的域名 DNS 配置对不对、邮件为什么进垃圾箱、证书什么时候过期、刚改的解析国内外生效一致吗」变成一次 30 秒的本机体检——纯 DoH 只读查询，零安装零登录，数据不出本机。

**最大不确定性**：① 全球 DoH 端点（cloudflare/google）在 CN 网络下不可达 → 已实测确认为真，对策=alidns/doh.pub 为主力、全球端点为可选对比源且逐解析器诚实降级（不可达本身成为诊断输出）。② 用户是否需要「引导式报告」而非裸查询 → 在线工具的巨大流量证明需求存在，引导式=升级而非替代。

**止损**：若真实桥冒烟发现 DoH 在宿主服务进程内也不可达（代理未透传），则核心价值失效，停在此 commit 不发布。

## 四、产品与架构

### 用户流程
1. 商城装插件 → 面板输入域名 → 「开始体检」→ 30~60 秒出报告（评分 0-100 + 红黄绿 findings + 每条「为什么重要/怎么修」）。
2. 专项 Tab：邮件身份（SPF 逐 token + RFC 7208 lookup 计数 / DMARC 标签 lint / DKIM 常见 selector 探测 / MX 体检）、传播对比（同一记录在阿里/DNSPod/Cloudflare/Google 四解析器的答案并排 diff）。
3. AI 对话：「帮我看看 example.com 的邮件配置为什么被拒信」→ dom_diagnose/dom_emailauth 工具 → 结构化 findings 回到对话。
4. 历史：最近体检留痕，复查对比。

### 范围（v0.1.0 明确不做）
- 不做邮件发送测试（mail-tester 形态，需收件箱基础设施）；DKIM 只探测常见 selector（诚实标注）；不做 SPF 完整递归求值（静态计数分析）；不做 PTR/黑名单查询（v0.2 候选）；不做常驻监控（用 task-runner 联动定时触发 dom_cert 替代）。
- 全只读：DNS 查询 + TLS 握手读证书，无任何写操作、无密钥、无遥测。

### 护栏
- DoH 端点固定白名单（alidns/doh.pub/cloudflare/google），不接受任意 URL。
- 证书探测目标先过域名规范化 + 私网/IP/环回/元数据守卫（isDiagnosticsSafeHost），再 DoH 解析确认公网后才 tls.connect。
- 单任务互斥可取消；DoH 并发 ≤8；全部请求带超时。
- kv 前缀 `dom.`，报告保留 6 份（runs 索引驱动清理），历史 ≤60 条。

### 键空间契约（权威）
```
dom.meta                 服务心跳 {ts,version,degraded,running,lastBridgeErr}
dom.settings             设置 {primary,timeoutMs,dkimSelectorsExtra[]}（面板/MCP 写→服务读；服务也写归一值）
dom.cmd                  单槽命令信箱 {nonce,action,payload,at}（面板/MCP 写，服务先删后做）
dom.res                  最近回执 {nonce,action,at,result}（服务写）
dom.latest               最近一次报告（服务单写者）
dom.report.<runId>       完整报告（服务单写者，保留 6 份）
dom.runs                 报告索引 [runId]（服务单写者）
dom.history              紧凑历史 ≤60 条（服务单写者）
```

### 技术要点
- shared/domain-core.js 纯函数：域名规范化/守卫、DoH 响应归一、SPF 解析+lookup 计数、DMARC lint、DKIM 解析、MX 体检、证书信息整形、findings 引擎与评分、传播 diff。全部离线单测。
- service/main.js：DoH fetcher（4 端点、逐解析器失败降级、测试钩子 env DOMPROBE_DOH_OVERRIDES 仅指向 http 本地 mock）+ node tls.connect 证书探测（rejectUnauthorized:false 取证 + authorizationError 如实验证）+ 单槽信箱 + kv 持久化。
- mcp/server.js 六工具：dom_diagnose / dom_emailauth / dom_cert / dom_lookup / dom_report / dom_history。
- 面板五 Tab：体检 / 邮件身份 / 传播 / 历史 / 设置（服务卡自举 start）。
