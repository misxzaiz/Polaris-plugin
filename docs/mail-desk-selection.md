# 选型文档:邮件调试台(mail-desk)

> 2026-11-03 立项。方向硬约束(2026-11-01 用户定案):台账/记录/家庭生活类一律不进候选池;主攻工具/技术/调试/诊断/自动化/内容变换。
> 核心动作判定:本插件是「**捕获 + 预览 + 诊断**」——把应用发出的测试邮件截在本机供开发者查看/检索/取证/AI 提取验证码,零记录台账属性,合格。

## 一、生态饱和度盘点(先内后外)

Polaris-plugin index.json 81 个上架条目 + 5 个工作区进行时(data-query / db-workbench / dev-toolbox / diff-desk / flow-pipeline,并行会话成果,已避让)逐一核对:

| 既有覆盖 | 与本选型关系 |
|---|---|
| relay-devkit(API 客户端/JSON/SQL/DB/时间戳)、dev-toolbox(进行时:JWT/哈希/UUID/编码/正则) | HTTP 工具面已密;**SMTP 协议面零覆盖** |
| mock-server(HTTP 假接口)、stream-desk(WS 客户端调试) | 协议调试相邻,但 HTTP/WS ≠ SMTP 收信 |
| har-lens(HAR 抓包)、webhook-station(回调接收) | 「截获流量看内容」形态相似,均不做 SMTP |
| grep `smtp|mailpit|mailhog`(全 index) | **零命中(插件类)**——生态空白 |

## 二、候选池(12 个,全过方向硬闸)

| # | 候选 | 处置 | 关键理由 |
|---|---|---|---|
| 1 | **邮件调试台(catch-all SMTP 收信)** | ✅ 入选 81.5 分 | 见第三节 |
| 2 | 数据脱敏台(生产 CSV→测试数据) | 65 分 | 合规痛点真实但个人用户低频;开源工具多(Faker 系/企业级 Delphix/Tonic);格式保真与外键一致性工程风险高 |
| 3 | 无代码采集台(可视化爬取) | 66 分 | cap.http 抓静态页可行,但动态渲染页/反爬不可达;受众中等 |
| 4 | WebSocket mock 服务端 | 60 分 | stream-desk(客户端)+mock-server(HTTP)夹击,受众窄 |
| 5 | TCP 转发/协议调试台(hex 双向) | 63 分 | 嵌入式/协议开发者场景偏窄;net 内核转发易做,但 UI 取证面价值有限 |
| 6 | OpenAPI 契约台 | 74 分(历次备选) | 受众较窄;mock-server 已占 mock 半边;dev-toolbox plan 亦淘汰之 |
| 7 | i18n 键值治理台 | 58 分 | 前轮已淘汰(受众窄) |
| 8 | ENV 文件治理台 | 61 分 | 「治理/管理」属性偏记录;安全责任重 |
| 9 | Docker 观测台 | 62 分 | 依赖宿主装 Docker CLI,环境前提不可控;pocket-host 半覆盖 |
| 10 | 字幕工坊(srt/vtt 变换) | 59 分 | 痛点尖锐但受众窄 |
| 11 | 二维码工坊(批量生成/解析) | 57 分 | 单点太薄,dev-toolbox 相邻 |
| 12 | 色彩对比度检查台 | 55 分 | dev-toolbox 已含颜色转换;受众窄 |

## 三、市场证据(外部,可追溯)

1. **品类被反复验证且在上位替代期**:
   - [MailHog 被公认为已停维护](https://github.com/mailhog/MailHog/issues/392)(最后发版 2020,2022-08 后无提交),社区共识迁移([chriswiegman.com 迁移文](https://chriswiegman.com/2023/03/mailpit-an-updated-alternative-to-mailhog)、[dev.to《MailHog alternatives for CI pipelines in 2025》](https://dev.to/zerodrop/mailhog-alternatives-for-ci-pipelines-in-2025-5d0c):"It's unmaintained and Mailpit does everything it does better")。
   - [Mailpit](https://github.com/axllent/mailpit) ~7k★、活跃开发(v1.33.0,2025-11)——品类需求旺盛的直接证据。
   - [smtp4dev](https://github.com/rnwood/smtp4dev)(.NET 系)、Mailtrap(SaaS 收费,数据出域)并存——多实现共存=需求分层真实。
2. **现有方案的关键缺口**:Mailpit/smtp4dev 都要**单独安装维护**(Go 二进制/Docker/.NET runtime);Windows 开发者装起来多一步;与「已经在跑的开发工作台」无集成;均无 AI agent 形态(REST API 有,但 LLM 无法自主安全封装)。
3. **AI 提验证码是刚性新场景**:E2E 测试/手动注册流程里「把刚收到的验证码给 AI」—— MailHog/Mailpit 时代不存在 agent 工具化形态,这是本插件与全部竞品的结构性差异。
4. **平台技术前提全部已验证**:插件 service 监听 127.0.0.1 端口(mock-server 9868、relay-devkit 9860 等 16 处先例);node service 出站/入站 TCP(net-sentinel TCP 探测、stream-desk WS);vendor 打包零安装(relay-devkit mysql2 内联);cap.http 宿主转发全端可达(daw-studio/needs/amber 范式)。

## 四、评分(满分 100)

| 维度 | 权重 | 得分 | 理由 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 16 | 调试邮件流程(注册/重置/通知)每次开发都会遇到;真发有风险,装 MailHog(死)/Mailpit(另装)均有摩擦 |
| 频率与覆盖 | 15% | 11.5 | 后端/全栈/测试开发者日频~周频;「取验证码」场景刚性 |
| 现有方案缺口 | 15% | 11 | Mailpit 要另装维护、Mailtrap 收费出域、smtp4dev 要 .NET;生态零覆盖 |
| 可验证差异化 | 15% | 12.5 | ①装插件即用零安装 ②AI 经 MCP 一句话读邮件/提验证码 ③手机端可达(cap.http) ④中文 UI——均可 1 分钟演示 |
| 用户收益 | 15% | 12 | 「30 秒截到测试邮件看到验证码」替代「装工具/配 Docker/上 SaaS」 |
| 平台适配 | 10% | 9.5 | service+面板+MCP 全 house 范式;纯本地零外发,隐私默认最佳 |
| 技术可行性 | 5% | 5 | smtp-server 3.21.3 / mailparser 3.14.1(nodemailer 生态)成熟,vendor 后 ~4MB |
| 开发维护成本 | 5% | 4 | 单进程单面板;MIME 解析交给 mailparser;环形落盘自淘汰 |
| **合计** | | **81.5** | 候选池第一名,次名 66 分,断层领先 |

## 五、产品定位

- **名称**:邮件调试台(id: `mail-desk`,kv 前缀 `mdk.*`,HTTP 端口 9875,SMTP 端口 1025 均可配置)
- **一句话**:把应用发往 `127.0.0.1:1025` 的任何测试邮件**截在本机**:面板看 HTML 渲染/纯文本/原始报文/附件,搜主题发件人正文,AI 经 MCP 一句话读邮件、提验证码——数据不出本机,零外发。
- **目标用户**:Polaris 用户中的后端/全栈/测试开发者,以及让 AI 代跑注册/验证流程的重度用户。
- **明确不做(v0.1.0 边界)**:不外发邮件、不做 SMTP 转发/规则路由、不做发送客户端、不做多用户/认证体系。

## 六、架构(house 范式全复用)

```
面板 dist/panel.js(React, react external)
  └─ capDispatch:cap.kv 读 mdk.service{port,smtpPort,token} → cap.http request 转发
     (请求由宿主进程发出——桌面/手机/Web 全端无跨域,daw-studio 实证范式)
service/main.js(node,绑 127.0.0.1:9875)
  ├─ SMTP catch-all(smtp-server@3.21.3,127.0.0.1:1025,只收不发,单封 5MB 上限)
  ├─ HTTP 数据面 /api/*(Bearer token;/__health)
  ├─ store:落盘 <appConfigDir>/mail-desk/*.eml 为真相 + 内存索引,环形上限(500 封/200MB)
  ├─ kvclient:mdk.settings 热更(3s)/ mdk.service 发现 / mdk.meta 心跳(60s)/ mdk.cmd+mdk.result 命令信箱
  └─ vendor.cjs(esbuild 内联 smtp-server+mailparser,安装后零 npm i)
mcp/server.js(stdio JSON-RPC,kv 读发现 → Bearer 直调 HTTP 数据面)
test/:core 单测 + spawn service 真 SMTP 发信集成 + MCP 真子进程 + 自检试金石
```

安全设计:SMTP/HTTP 均只绑 127.0.0.1;catch-all 永不转发(代码里不存在外发路径);邮件 HTML 预览用 iframe sandbox(全禁脚本)srcdoc,远程图片默认阻断防跟踪像素;token 随机生成存本机 kv;日志不落正文;环形自淘汰防膨胀。

## 七、验收口径

- 离线单测绿;spawn 真集成:node net 手写 SMTP 客户端发真信 → REST 断言收到;MCP spawn JSON-RPC 断言;typecheck 0 错误;esbuild 构建成功;真桥冒烟(宿主可达时)。
- 冒烟核心动作:应用(Nodemailer)指 SMTP 1025 发信 → 面板 1 秒内可见 → AI 经 MCP mail_get 读到正文。
