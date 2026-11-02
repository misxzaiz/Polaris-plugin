# bundle-lens（包体积透视台）选型与需求验证文档

> 2026-11-03 · 第 N 轮插件选型 · 遵循任务书硬约束（禁台账/记录/生活类，主攻工具/技术/诊断/变换类）

## 1. 方向硬约束过滤

候选池生成前先过闸（用户 2026-11-01 定案）：

- **淘汰动作是「记录发生了什么」的方向一律不进池**：记账/台账/打卡/收藏/履历类零候选。
- 主攻：诊断/观测/变换/自动化/开发者工具。

## 2. 生态查重（84 插件实测盘点）

对 `index.json` 全量 84 条 + 工作区在途插件逐一核对后，**以下候选方向被占用，淘汰**：

| 候选方向 | 占用者 | 结论 |
|---|---|---|
| 密钥/secret 扫描（git 历史或目录） | `keyscan` 密钥扫描台（已上架） | 淘汰 |
| Git 大对象/历史考古 | `repo-lens` 八维含「历史大对象」「提交卫生」「巴士因子」 | 淘汰 |
| Mock 接口/假数据路由 | `mock-server` Mock 接口台（已上架） | 淘汰 |
| 文本/JSON/目录/URL diff | `diff-desk`（工作区在途，他人并行会话） | 淘汰并避让 |
| CSV/Parquet SQL 查询 | `data-query`（工作区在途） | 避让 |
| 端口/进程/主机监控 | `pocket-host`（采样监听端口+按端口杀） | 淘汰 |
| 日志/HAR/网络/域名诊断 | log-lens / har-lens / stream-desk / domain-probe / net-sentinel | 淘汰 |
| 依赖漏洞/许可证 | `dep-probe` | 淘汰 |
| 网页变化监控/封存 | page-sentinel / amber / watchtower | 淘汰 |
| 文件整理/去重回收 | file-flow / disk-radar | 淘汰 |

## 3. 候选池与外部证据（真实来源可追溯）

进入终选的 4 个候选（均为「做成了/诊断了/变换了什么」类）：

### C1 包体积透视台（bundle-lens）★ 选中
- **用户与场景**：所有前端开发者，每次发版前/每次性能治理/每次「加了依赖后包突然变大」。
- **外部证据**：
  - 工具生态巨大且碎片化：webpack-bundle-analyzer（webpack 专属、需装 plugin 改配置）；vite 生态要另装 rollup-plugin-visualizer / vite-bundle-analyzer（[npm](https://www.npmjs.com/package/vite-bundle-analyzer)、[SO: Is there any bundle analyzer for vite?](https://stackoverflow.com/questions/75746767/is-there-any-bundle-analyzer-for-vite)）。
  - source-map-explorer 离线但 CLI 输出简陋、无重复包检测、无历史对比（[angular.love](https://angular.love/how-to-optimize-your-angular-bundle-size)、[Medium](https://medium.com/netscape/analysing-and-minimising-the-size-of-client-side-bundle-with-webpack-and-source-map-explorer-41096559beca)）。
  - bundlephobia 只能查 npm 公网包，私有代码必须上传=隐私不可行。
  - **重复包检测是公认弱点**：WBA issue/discussion 里反复要求突出显示重复模块（[webpack-bundle-analyzer#570](https://github.com/webpack/webpack-bundle-analyzer/discussions/570)、[#161](https://github.com/webpack/webpack-bundle-analyzer/issues/161)、[SO: lodash bundled more than once](https://stackoverflow.com/questions/73222347/why-webpack-bundle-analyzer-show-lodash-bundled-more-than-once)）——即「知道包大，不知道同一包被打了几份」。
  - 社区长期高频困惑：[Reddit: 25MB bundle 怎么管](https://www.reddit.com/r/node/comments/1di1od6/how_tf_does_a_project_manage_to_be_25mb_bundle)、[dev.to: 2MB→200KB 实战](https://dev.to/_d7eb1c1703183e3ce1782/javascript-bundle-size-optimization-from-2mb-to-200kb-a-practical-guide-blb)。
- **本地 dogfooding 证据（最强）**：Polaris 主仓自身连续多轮性能治理（mermaid 3.4MB 泄漏、CodeMirror 1MB 懒载、Chat barrel 切边 -17~21%）全靠手搓脚本量包——宿主自己的用户就是本插件的第一用户。
- **差异化**：零配置（指向任意 dist 目录即可，不装 plugin 不改构建）+ 全离线（sourcemap 含源码，不出本机）+ 重复包/版本冲突检测 + 扫描历史 diff（优化前后对比）+ MCP 让 AI 直接读真实字节而不是幻觉 + 桌面/手机三端看同一份报告。
- **平台适配**：本地文件只读 + 纯计算，无网络依赖，无跨域面；与 repo-lens/dep-probe 同构（path → 报告 → kv 投影）。

### C2 翻译键体检台（i18n-lens）— 落选
- 证据：i18n-ally（VS Code 数百万安装）证明需求真实；宿主自身有 src/locales 双语。
- 落选主因：AI IDE 时代「AI 填翻译」差异化被快速侵蚀；动态键误报治理重；宿主工作流对 i18n 的敏感度远低于性能。

### C3 接口契约体检台（openapi-lens）— 落选
- 证据：oasdiff/openapi-diff 证明 breaking-change 检测需求真实。
- 落选主因：oasdiff CLI 已把核心问题解决得够好，GUI 增量有限；使用频率绑定 API 团队发版节奏，覆盖人群窄。

### C4 测试数据锻造台（data-forge）— 落选
- 证据：mockaroo 付费墙/faker 无 UI/关系一致性缺口真实。
- 落选主因：与 mock-server（模板造数据）、gezhi（Excel 工厂）三向相邻，生态感知重复风险高。

## 4. 加权评分（每维 0-5，满分 100）

| 维度（权重） | C1 bundle-lens | C2 i18n | C3 openapi | C4 data-forge |
|---|---:|---:|---:|---:|
| 痛点强度（20%） | 4.5 | 4 | 4 | 3 |
| 频率×覆盖（15%） | 4 | 3.5 | 3 | 3 |
| 现有方案缺口（15%） | 4.5 | 4 | 3.5 | 4 |
| 可验证差异化（15%） | 4.5 | 4 | 3.5 | 3.5 |
| 用户收益（15%） | 4.5 | 4 | 3.5 | 3.5 |
| 平台适配（10%） | 5 | 4 | 4 | 4 |
| 技术可行性（5%） | 4.5 | 4 | 4 | 3.5 |
| 开发维护成本（5%） | 4 | 4 | 4 | 3.5 |
| **加权总分** | **88.5** | **78.5** | **76.0** | **69.5** |

## 5. 定案

**bundle-lens（包体积透视台）**，id `bundle-lens`，显示名直白：包体积透视台。

- 最重要的竞争优势：零配置 + 全离线 + 重复包检测 + 历史 diff + MCP/AI 读真实字节。
- 最大不确定性：sourcemap 归因精度依赖构建开启 sourcemap（vite 默认关）——对策：报告明示 unmapped 占比 + 提示一行开启命令；无 map 的 chunk 如实降级为「仅文件级体积」。
- MVP 止损线：若真实 sourcemap（esbuild/vite 产物）归因误差 >2%，收缩为「仅 chunk/包级统计」仍可用。
- 明确不做：不修改任何构建配置、不上传任何字节、不做打包器（只分析）、不做时序火焰图。

## 6. 验收标准（生产级）

1. 离线单测：VLQ 解码、字节归因（含非 ASCII/多字节）、包解析（npm/pnpm/.pnpm@version/嵌套 node_modules/webpack://）、重复检测、treemap 布局、建议规则——合成 sourcemap fixture 全绿。
2. typecheck + esbuild 构建通过。
3. 真桥冒烟：服务起 → 扫真实目录（含本仓 vite 产物或自造 dist）→ 报告落 kv → 面板/MCP 均可读。
4. selftest（内置）：运行时自造临时 dist + 已知归因答案 → 断言误差 ≤ 容差。
