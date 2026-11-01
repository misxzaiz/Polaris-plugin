# site-audit 站点体检台 —— 选型与设计（2026-11-02）

## 一、选型结论

**做「站点体检台」：输入一个网址，后台爬虫把整站爬一遍，产出一份中文体检报告**——断链、重定向链、缺 title/description、重复 title、图片缺 alt、混合内容、慢响应 TOP、状态码分布、sitemap 覆盖缺口、外链死链按域聚合。面板一键发起 + AI 六工具对话取证。

## 二、候选池与硬约束过滤（≥10 个，全部过「禁台账/记录/生活类」闸）

| 候选 | 结论 | 理由 |
|---|---|---|
| 站点体检台（全站爬取诊断） | ✅ **入选** | 市场证据最强（付费验证+免费竞品全线停更），生态 69 插件零覆盖，平台适配完美 |
| 日志分析台 | ❌ 撞车 | `log-lens` 日志透视台已交付 |
| DuckDB 数据工作台 | ❌ 暂缓 | 需求库 013 已登记但 priority=low；35MB wasm 在 blob loader+worker 路径下风险高，工程险大于收益 |
| WebSocket 调试台 | 🥈 备选 | 真需求但证据强度中等（wscat/Postman 可用），上限明显低于本选 |
| OpenAPI 工作台（spec diff） | ❌ 淘汰 | 频率中等，oasdiff CLI 已够开发者用，UI 增量有限 |
| HTTP 抓包代理台 | ❌ 不可行 | HTTPS MITM 需装信任 CA 证书，插件形态内做不到生产级安全 |
| 本地端口/进程诊断 | ❌ 撞车 | `pocket-host` 已覆盖（采样+按端口杀进程） |
| DNS/拨测 | ❌ 撞车 | `net-sentinel` 已覆盖（TCP/DNS/丢包+事件线） |
| 单页 SEO 检查器 | ❌ 差异化不足 | `bookmark-dig`（书签体检）/`page-sentinel`（盯单页变化）/`amber`（单页封存）已覆盖周边；且单页太薄 |
| 密钥/编码/JWT 工具箱 | ❌ 撞车 | `keyscan` + `relay-devkit` 覆盖大半 |
| Git 仓库体检 | ❌ 淘汰 | cap.git 门控复杂，需求证据弱 |
| mock 数据生成器 | ❌ 淘汰 | 弱需求，随手脚本可替 |

## 三、市场证据（可追溯）

1. **付费验证**：Screaming Frog SEO Spider £199/年/用户，公认桌面爬虫事实标准（官网定价页核实）。免费版 500 URL 上限。
2. **免费替代全线停更或受限**：broken-link-checker(npm) 最新版 2018 年；Xenu 1.3.8 停在 2013 年；W3C checker 大站极慢；在线 checker 3000 页上限+不执行 JS+不支持登录（来源均见调研记录）。
3. **社区反复求助跨 2013-2025**：r/SEO、r/webdev、r/selfhosted 多年重复出现「免费断链检查/替代 Screaming Frog」帖。
4. **CI 化是标准玩法**：lychee-action 等围绕断链长出整层自动化——但 CI 工具只覆盖断链一项，重定向链/重复 meta/缺 alt/混合内容/慢响应组合体检无免费本地方案。
5. **用户抱怨三集中**：内存占用（Java 堆排障教程满天飞）、UI intimidating（学习曲线陡）、价格门槛——正好是轻量本地工具反着设计的点。

**诚实边界（如实写进 README）**：不做 JS 渲染（无 headless 浏览器）——SPA 页面爬不全，但服务端渲染/静态站（博客/文档/Hugo/VitePress 自托管站）覆盖完整；可通过 sitemap.xml 补全 SPA 页清单对比。不支持登录后页面。

## 四、评分（权重制，满分 100）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.5 | 付费 £199/年验证；发布/改版/迁移必查 |
| 频率×人群 | 15% | 4.0 | 周期性高频（每次发布），站长/前端/独立开发者广覆盖 |
| 现有方案缺口 | 15% | 5.0 | 免费线全灭，付费线重+贵，CI 线单薄 |
| 可验证差异化 | 15% | 4.5 | 无 URL 上限、零安装、AI 取证、跨端看报告、报告对比；JS 渲染缺失扣分 |
| 用户收益 | 15% | 4.0 | 30 秒发起→分钟级全站报告→AI 直接解释修复 |
| 平台适配 | 10% | 5.0 | service 无沙箱 Node=爬虫理想宿主（bookmark-dig/page-sentinel 已验证原生抓取+SSRF 守卫范式）；kv 三端同读 |
| 技术可行性 | 5% | 4.5 | 零依赖 Node 爬虫+宽容 HTML 扫描器，全部有仓内先例 |
| 开发维护成本 | 5% | 4.0 | 中等体量，零外部服务成本 |
| **加权合计** | | **89.0** | |

对比：WebSocket 调试台约 72 分（证据弱一档）。

## 五、产品定义

- **名称**：站点体检台（直白功能名，id `site-audit` 不受影响）
- **一句话**：把「我的网站有没有死链、重定向链、缺 meta、图缺 alt、混合内容、慢页面」变成一次 30 秒发起、分钟级出结果的整站体检，报告中文可对话。
- **目标用户**：个人站长/博客作者、前端开发者（发布前自检）、维护自家文档站/官网的团队。
- **MVP 范围**：同站爬取（种子 URL + 重定向锚定域，默认 ≤500 页可调 ≤5000）、robots.txt 遵守（默认开）、sitemap 读取与覆盖对比、外链存活核查（默认开，≤500 条）、11 类检查项、0-100 评分、报告留档（kv，≤20 份）、导出 JSON/CSV、AI 六工具。
- **明确不做**：JS 渲染、登录后页面、定时体检、多站队列、外站深度爬取、JS/CSS 内部引用分析。

## 六、检查项与严重度

| 类型 | 级别 | 说明 |
|---|---|---|
| broken_page | 错误 | 站内页面 4xx/5xx/DNS/超时 |
| broken_asset | 警告 | 站内图片/样式/脚本资源 4xx/5xx |
| broken_external | 警告 | 外链 4xx/5xx（报告按域聚合） |
| redirect_chain | 警告 | 站内重定向链 >1 跳（给出全链）；redirect_loop 升为错误 |
| missing_title / title_length | 错误/警告 | 缺标题；<10 或 >65 字符 |
| missing_description / description_length | 警告 | 缺描述；<50 或 >160 字符 |
| duplicate_title / duplicate_description | 警告/提示 | 多页同标题/同描述 |
| missing_alt | 警告 | img 缺 alt 属性（alt="" 视为装饰性不算） |
| mixed_content | 错误 | https 页面引用 http 资源 |
| meta_refresh / noindex | 警告/提示 | meta 跳转；noindex 页面（可能误伤收录） |
| slow_page | 警告 | 响应 > 阈值（默认 2000ms，可调）；报告给 TOP10 |
| robots_blocked / sitemap_gap | 提示 | 被链接但被 robots 排除；sitemap 声明但未爬到（孤岛页） |
| canonical_multiple / canonical_offsite | 警告/提示 | 多个 canonical；canonical 指向站外 |
| missing_lang / h1 | 提示 | html 缺 lang；缺 h1 或多 h1 |

评分：100 − Σ 每类 min(条数, cap) × 权重（错误类权重大），下限 0；verdict 一句话 + 归因 notes。

## 七、架构（复用仓内范式）

```
面板(dist/panel.js) ──127.0.0.1:port+token──> service/main.js（HTTP API + 试金石站）
      │                                            │ 爬虫引擎 service/crawler.js
      ├─cap.kv(site-audit.*)─宿主 invoke→router_dispatch┘（meta 心跳/报告/历史/设置，单写者=service）
      └─react 同实例 blob 加载
AI ──MCP stdio── mcp/server.js ──kv 单槽信箱(cmd/res)──> service（与 api-bench 同款）
共享纯逻辑：shared/audit-core.js（规范化/robots/HTML 扫描/检查/评分，双端同口径）
```

- **爬取语义**：种子 URL 的一次重定向链锚定「域内范围」（≤3 个 host，如 example.com+www.example.com）；范围外链接=外链，只验存活不解析不深爬。这同时是 SSRF 围栏：公网种子不可能被引到内网继续爬；另硬拒 169.254.0.0/16（云元数据）。
- **礼貌爬取**：同 host 最小间隔（默认 300ms，可调）+ 并发池（默认 6，≤12）+ robots Crawl-delay 尊重 + 总页数/总时长/单页体积/超时护栏 + 单任务互斥可中止。
- **内置试金石站**（`/demo/*`，service 自带）：404 页、二级重定向链、无标题页、无 alt 图、慢页（2.2s）、noindex 页、robots 排除页、sitemap 孤岛页——零配置验证工具链，也是全链路测试夹具。
- **kv 报告限幅**：每类 issue 最多 100 条明细、重复组 ≤20、外链按域 ≤50×20；历史 ≤20 份（超出清 report.<id>）。

## 八、验收（生产门槛）

1. core 单测（规范化/robots 最长匹配/HTML 扫描边界/各检查项触发/评分数学/链判定/sitemap 解析）全绿。
2. 假桥集成测试：spawn service → 内置试金石站真实爬取 → 报告逐项命中（断链/重定向链/缺标题/缺 alt/慢页/robots 排除/sitemap 孤岛/外链死链）+ stop 部分报告 + settings。
3. MCP stdio 协议测试：initialize/tools/list(6)/run→report 文本//issues 过滤。
4. SSR 渲染断言：三 Tab/表单/报告卡/离线态。
5. tsc strict + esbuild 构建 + pack 打包。
6. 真桥冒烟（宿主可用时）：meta 落真实 kv → 面板直连爬试金石 → MCP 真子进程。

## 九、风险与止损

- **爬取被 WAF 拦**（403/验证码）：UA 如实自报 `PolarisSiteAudit`；报告把 403 归因为「目标防护」而非死链；尊重 robots 降误伤。
- **kv 大报告**：限幅已设计；超限截断在报告内如实标注。
- **需求假设不成立**：若发布后长期无人用（守望台计量），与 bookmark-dig 的「链接体检」边界保持（书签≠整站），必要时把外链核查能力反哺 bookmark-dig 而废弃本插件面板——核心引擎可复用，沉没成本低。
