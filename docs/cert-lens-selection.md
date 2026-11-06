# 选型文档：TLS 证书调试台（cert-lens）

> 2026-11-06 · 热点发现新立项（需求库 060）。方向硬约束（2026-11-01 用户定案）：台账/记录/家庭生活类一律不进候选池；主攻工具/技术/调试诊断/自动化执行/内容变换。
> 核心动作判定：本插件的动作是「**诊断/变换**」——解析证书、真实握手探测、翻译错误根因、盯守告警，不是「记录」——过闸。

## 一、生态饱和度盘点（先内后外）

Polaris-plugin 现 130 目录 / 124 商城条目（index.json 实测）。与本选型相关的既有覆盖：

| 既有插件 | 覆盖 | 与本选型关系 |
|---|---|---|
| keyscan 密钥扫描台 | 静态文件里**凭据泄露检测**（API key/私钥/连接串） | 检测对象不同（文件里的凭据 vs 运行中 TLS 端点的证书链），互不替代 |
| jwt-desk JWT 调试台 | JWT/JWS 签名族（含部分 DER 互转） | 应用层令牌 ≠ X.509/TLS 传输层证书 |
| net-sentinel 网哨 | TCP 探测/断网事件/测速（网络质量视角） | 不碰证书内容、不做握手诊断 |
| stream-desk / webhook-station / har-lens / llm-request-desk | 流量抓取/回放/分析 | HTTP 消息面，不解 TLS 握手与证书链 |
| domain-probe 域名诊断台 | DoH/DMARC/DKIM（域名邮件面） | 无证书/TLS 能力 |
| docker-desk / k8s-lens / ci-lens | 容器/清单/CI 体检 | 无 TLS 证书覆盖 |
| query-plan-lens / repo-lens / deadcode-lens 等 *-lens 家族 | 各自领域体检 | **cert-lens 是该家族首个安全传输层成员，命名/形态完全兼容** |

**结论：「TLS/证书解析+握手诊断+到期盯守」在 130 个条目里零覆盖。**

并行会话占用排除（2026-11-06 实测）：claim-lens（059 building）、data-mask、process-desk、office-lens、file-flow、flow-pipeline 均与本方向无交集；058 jq-query 刚交付不撞。

## 二、市场证据（外部，可追溯）

1. **痛面广**：Keyfactor/Ponemon 调研——**88% 公司两年内遭遇证书过期导致的非计划停机**，平均 3+ 次；45% 组织过去一年有证书相关停机（Encryption Consulting）。单次事故代价可至 $5M（Red Sift）。
2. **频率在上升**：CA/B Forum SC-081 落地，公网证书有效期 2026-03 起 ≤200 天、2027 ≤100 天、2029 ≤47 天（Sectigo）——到期风险频率将翻数倍，续期/盯守从「运维福利」变成「生存刚需」。
3. **工具缺口实锤**：证书链排障反复被求助（ServerFault 616051、SO 17742003、Security.SE 274026），2024-2025 仍有大量实践文（Duo、Xygeni）；共识是 **「没有单一银弹工具」**：openssl s_client/verify 与浏览器行为不一致（不补 AIA）、语法反直觉（netmeister.org 专文）。
4. **内网检查真空**：在线解码器（DigiCert/SSLShopper）**够不到内网/自签端点**（securew2 对比文）；企业代理（Zscaler 类）自签拦截是 SO 高频题（36506539 等）。本地桌面工具是唯一解位。
5. **监控产品形态错位**：KeyChest/Datadog/TrackSSL 等面向公网舰队 SaaS 收费（r/sysadmin 3000 服务器讨论），个人/小团队/homelab 没有轻量本地选项。

## 三、竞品格局与差异化

| 竞品 | 形态 | 缺陷 | cert-lens 差异 |
|---|---|---|---|
| openssl s_client/verify | CLI | 语法地狱；不补 AIA 与浏览器行为不一致；输出海量 | GUI 化+链自动拼装+中文根因 |
| testssl.sh / sslscan | CLI 扫描器 | Windows 不便（bash/编译）；面向渗透深扫 | 聚焦「排障+盯守」，随宿主常驻 |
| DigiCert/SSLShopper 在线解码 | Web | 够不到内网；要粘贴上传 | 本地内存解析；内网可达 |
| KeyChest/Datadog SSL 监控 | SaaS | 面向公网舰队收费 | 本地清单+MCP 巡检，零成本 |
| XCA / KeyStore Explorer | 桌面证书库管理器 | 面向证书/keystore 管理，不做连接诊断 | 诊断视角（握手实际发生了什么） |
| 浏览器证书查看器 | 内置 GUI | 只读单证书，无链验证/无自动化/无盯守 | 结构化全字段+验签+MCP 自证 |

**不可替代的差异化组合：内网可达 + 错误中文翻译（19 类规则）+ AI MCP 自证 + 到期盯守，四者合一的本地桌面工具在竞品里没有。**

## 四、评分（对照任务权重）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 5 | 88% 公司受影响、$5M/次事故、浏览器/curl 报错人人遇到过 |
| 频率/覆盖 | 15% | 4 | 所有 Web/后端/运维/homelab 用户；证书寿命缩短后频率上升 |
| 现有方案缺口 | 15% | 4 | CLI 反直觉、在线够不到内网、SaaS 错位、浏览器查看器无诊断 |
| 差异化 | 15% | 4 | 四合一组合空白；生态零覆盖 |
| 用户收益 | 15% | 4 | 排障从小时级到分钟级；临期告警直接防停机 |
| 平台适配 | 10% | 5 | service=tls.connect 天然可探测；MCP 五工具贴 AI 优先定位；与 *-lens 家族形态一致 |
| 可行性 | 5% | 5 | 零依赖 node:crypto/tls；全离线可测（fixture 矩阵+hermetic 服务器） |
| 成本 | 5% | 5 | 无外部服务、无密钥、bundle 35KB、维护面小 |
| **加权** | 100% | **4.4/5（88 分）** | |

## 五、淘汰的候选项（同轮池）

| 候选 | 判定 | 依据 |
|---|---|---|
| tf-plan-lens（Terraform plan 分析） | 备选落选 | 痛点真但受众窄（IaC 团队）；plan JSON schema 随版本漂移风险；fixture 需要真实 terraform 环境 |
| proto-lens（protobuf 无 schema 解码） | 备选落选 | 技术亮点强但受众更窄（gRPC 团队）；wire 解码工程量大，本轮不铺开 |
| xml-lens | 落选 | 在线 XPath 测试器多，缺口分低 |
| curl-desk | 落选 | HTTP 家族拥挤（har-lens/stream-desk/webhook-station/llm-request-desk/relay-devkit） |
| cidr-lens | 落选 | 免费网页计算器满地，粘性弱 |

## 六、MVP 边界与止损

- **做**：解析/链拼装验签/配对/握手诊断/错误翻译 19 类/盯守全检/MCP 五工具/试金石。
- **不做**：签发与 CSR 生成、keystore 转换、ACME 续期、CT 全网发现、后台定时巡检（面板点按+MCP 即时巡检已覆盖核心场景）。
- **验证假设的关键指标**：真宿主面板对真实公网站点（api.github.com）与内网自签 fixture 端点的诊断正确性（mcp-verify 已实证前者，后者由 hermetic 服务器实证）；AI 在 SSL 报错场景是否真的会调 tls_probe（上线后看 plugin.usage）。
- **止损**：若上线 2 周工具调用为 0 且面板无留存使用，说明用户面与判断偏差，转维护态不再加功能。

## 七、交付记录

- 实现：`plugins/cert-lens/`（shared 三引擎 + service 五件 + mcp + 面板四 Tab）
- 测试：离线 36 断言 + 真 service 20 断言 + 真 MCP 17 断言（含真实公网站点探测）全绿；typecheck 过；panel.js 35.6KB
- 市场证据来源：Keyfactor/Ponemon（keyfactor.com/blog/the-enemy-of-uptime-an-expired-ssl-certificate）、Encryption Consulting、Red Sift、Sectigo、ServerFault/SO/Security.SE 求助帖、Duo/SSLShopper/KeyChest 工具对比文
