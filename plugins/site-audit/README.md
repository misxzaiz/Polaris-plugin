# 站点体检台（site-audit）

把「我的网站有没有死链、重定向链、缺 meta、图缺 alt、混合内容、慢页面」变成一次 **30 秒发起、分钟级出结果** 的整站体检。

输入一个种子 URL → 后台爬虫顺链接把整站爬一遍（默认遵守 robots.txt，同站礼貌间隔）→ 产出 **0-100 健康分 + 中文报告**，AI 可以直接对话取证。

## 能做什么

| 检查项 | 级别 |
|---|---|
| 站内页面打不开（4xx/5xx/DNS/超时） | 错误 |
| 站内图片/样式/脚本资源失效 | 警告 |
| 外链失效（按域聚合，只验存活不深爬） | 警告 |
| 重定向链（多跳给出完整链路）/ 重定向死循环 | 警告 / 错误 |
| 页面缺标题 / 标题过长过短 | 错误 / 警告 |
| 缺 meta description / 长度异常 | 警告 |
| 标题重复 / 描述重复 | 警告 / 提示 |
| 图片缺 alt（`alt=""` 视为合法装饰性写法） | 警告 |
| 混合内容（https 页面引用 http 资源） | 错误 |
| meta 跳转 / noindex 页面 | 警告 / 提示 |
| 多个 canonical / canonical 指向站外 | 警告 / 提示 |
| 缺 html lang / h1 数量异常 | 提示 |
| 慢页面（阈值可调，默认 2000ms）+ 最慢 TOP10 | 警告 |
| robots 排除的被链接地址 / sitemap 孤岛页 | 提示 |

报告包含：健康分环、逐类问题明细（带来源页）、状态码分布、最慢页面、外链失效按域聚合、robots 与 sitemap 覆盖情况；可导出 JSON / CSV（UTF-8 BOM，Excel 直开），可一键「发给 AI 解读」。

## 快速开始

1. 启用插件（服务自动拉起，只监听 127.0.0.1）。
2. 打开「站点体检台」面板 → 点 **填入内置试金石站** → **开始体检**。
   试金石站是插件自带的小站（404 页 / 两跳重定向链 / 无标题页 / 缺 alt 图 / 慢页 / robots 排除页 / sitemap 孤岛页），零配置验证整条链路。
3. 体检真实站点：输入 `https://你的域名/` 开始。参数（最多页数 / 间隔 / 并发 / 超时 / 慢页阈值 / 三个检查开关）都在表单里。

AI 对话入口（需在插件设置里允许 AI 工具）：

```
帮我体检一下 https://example.com/，最多爬 200 页
把所有断链列出来
哪些页面缺描述？
上次体检的健康分是多少
```

六个 MCP 工具：`site_audit_run / site_audit_status / site_audit_stop / site_audit_report / site_audit_issues / site_audit_history`。

## 安全与边界（如实说明）

- **只监听 127.0.0.1 + token**；报告经 cap.kv 落库（与面板/AI/移动端同一事实库），爬取过程不经任何第三方服务。
- **SSRF 围栏**：云元数据端点（169.254.169.254 等）任何情况拒绝；目标为公网站点时，跨 host 的资源/外链核查解析到私网地址一律拦截——第三方页面无法借体检引擎探测你的内网。目标为你显式输入的本机/局域网开发站时放开私网（这是合法场景）。
- **礼貌爬取**：默认遵守 robots.txt（Google 最长匹配语义）、同 host 最小间隔 300ms（robots Crawl-delay 更严时从其规定）、页数 ≤5000、总时长 ≤30 分钟、并发 ≤12、单页体积 ≤2MB；单任务互斥、可中止、中止保留部分报告。
- **TLS 证书不校验**：这是诊断工具，自签名证书的本机/内网站点也能体检；报告不评估证书有效性（需要审证书请用专门工具）。
- **不执行 JS**：SPA 页面爬不全（报告检测到「几乎抽不到链接」会标注 SPA 疑似并建议用 sitemap 对比）；**不支持登录后页面**（URL 带账号密码会被拒绝）。
- **无定时体检、无自动重爬**：每次体检都是显式发起。

## 定位（相对现有工具）

- **Screaming Frog（免费 500 URL / 付费 £199 年）**：本插件无页数硬上限（护栏内自由）、零安装、随 Polaris 常驻、AI 可直接读报告；但无 JS 渲染、无批量导出全套 SEO 数据——是「易用免费子集」而非替代。
- **在线 checker（3000 页上限/不执行 JS）**：本插件本地执行无页数焦虑、私站可测。
- **lychee/linkinator（CI 断链）**：它们只查断链；重定向链/重复 meta/缺 alt/混合内容/sitemap 覆盖的组合体检在这里。

## 架构

```
面板(dist/panel.js) ──127.0.0.1:port+token──> service/main.js（HTTP API + 试金石站）
      │                                            │ 爬虫引擎 service/crawler.js（零依赖）
      ├─cap.kv(site-audit.*)─宿主 invoke→router_dispatch┘（meta 心跳/报告/历史/设置，单写者=service）
      └─react 同实例 blob 加载
AI ──MCP stdio── mcp/server.js ──kv 单槽信箱(cmd/res)──> service
共享纯逻辑：shared/audit-core.js（URL 规范化/robots 最长匹配/HTML 宽容扫描/检查项/评分）
```

- 爬取语义：种子重定向链锚定「域内范围」（≤3 个 host）；范围外链接只验存活。
- GBK 等老页面：Content-Type > meta 三级字符集探测（amber 同款思路），gzip/deflate/brotli 自动解压。
- 报告限幅：每类问题明细 ≤100 条、重复组 ≤20、历史 ≤30 条、报告保留最近 20 份。

## 开发

```bash
pnpm install          # 或 npm install（面板构建工具链）
pnpm build            # esbuild → dist/panel.js
pnpm typecheck        # tsc --noEmit
pnpm test             # core 单测 + SSR 渲染 + 假桥集成 + MCP 协议 四层
```

测试分层（`test/`）：
- `run-tests.mjs`：纯逻辑单测（规范化/robots/HTML 扫描/检查项/评分/选项护栏）
- `render-verify.mjs`：react-dom/server SSR 渲染断言（三 Tab UI/报告卡/离线态）
- `service-tests.mjs`：spawn 真服务 + 内存假 kv 桥 → 对内置试金石站真实体检 → 报告逐项断言 + 中止/设置/信箱全链路
- `mcp-tests.mjs`：MCP stdio 协议（initialize/tools/list/run→报告文本/issues 过滤）

已知限制与不做的：JS 渲染、登录后页面、定时体检、多站队列、外站深度爬取、JS/CSS 内部引用分析、证书有效性评估。
