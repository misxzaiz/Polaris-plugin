# 仓库体检台（repo-lens）

把「这个仓库哪里最该重构、哪里最危险、AI 改哪里容易翻车」从手搓 git 命令变成 Polaris 里的一次点击或 AI 的一句话：填仓库路径 → 读 git 历史与工作区 → 60 秒内产出**八维体检报告**与综合健康分。git 子命令全只读白名单，零网络出站，零系统写入，数据不出本机。

## 解决什么问题

- **热点分析没有趁手的零配置工具**：code-maat 要装 Clojure 且只出 CSV、CodeCharta 要多工具管线、CodeScene 商业收费；开发者普遍退化为「读码前手搓 `git log` 统计最常改动的文件」（r/softwarecrafters 专帖、Stack Overflow 同问法），每次重写管道、无沉淀无钻取。
- **变更频率≠风险**：只看 churn 会把活跃但简单的文件当雷区。本插件按 Tornhill 的 churn × complexity 方法论合并评分——两高才热。
- **隐藏依赖不可见**：两个文件如果过去一年总是被一起改，它们就不是独立的——时间耦合维度把这种「假装独立」点名（竞品管线最常忽略的维度）。
- **AI 写码时代的风险基线**：AI 高频改动的复杂文件是回归重灾区；改之前先体检，知道哪些文件要加测试、哪些可以放手。

## 八个维度

1. **热点**：变更频率 × 近似复杂度（0-100 分，重构优先级）；气泡图 x=频率 y=复杂度 点大小=代码行
2. **时间耦合**：同窗内共变文件对（≥3 次同提交且占比 ≥0.5）
3. **重复代码**：归一化行 6 行窗口哈希，跨文件/同文件远距 ≥2 处
4. **历史大对象**：`rev-list --objects --all` + `cat-file --batch-check`，.git 体积大户（二进制资产不过滤）
5. **提交卫生**：conventional commits 遵循率、草率消息（wip/tmp/过短）、巨提交（≥20 文件）
6. **巴士因子**：贡献 50% 提交的最少作者数；热点文件的作者集中度
7. **陈旧分支**：>30 天未动的本地分支
8. **语言构成与综合健康分**：热点集中度 25% + 重复率 20% + 提交卫生 25% + 巴士因子 15% + 历史大对象 15%

## 使用

1. 活动栏打开「仓库体检台」；
2. 「扫描」Tab 填仓库路径（仓库根或其中任意子目录；本机需已安装 git）→ 开始体检，进度条实时显示阶段；
3. 「总览」Tab 看健康分构成、热点气泡图、语言构成；「热点」Tab 表格下钻（点击文件看 52 周变更时间线、作者分布、共变伙伴）；「体检」Tab 看时间耦合/重复块/大对象/卫生/分支；
4. 「历史/设置」Tab 回看最近 20 次扫描、改默认参数、跑离线自检、重启服务；
5. 任意报告页点「发到聊天」把摘要发给 AI 继续追问。

## AI（MCP 八工具）

`repo_scan`（同步扫完返回摘要+解读）/ `repo_report` / `repo_hotspots` / `repo_file`（单文件下钻）/ `repo_couples` / `repo_hygiene` / `repo_runs` / `repo_selftest`

对 AI 说：

- 「体检一下 D:\space\base\Polaris，哪里最该重构？」
- 「src/stores/conversationStore/createConversationStore.ts 的变更历史和共变文件」
- 「这个仓库的提交规范执行得怎么样？有没有单点风险？」

## 安全边界

- git 子命令白名单且全只读（log / ls-files / rev-parse / rev-list / cat-file --batch-check / for-each-ref / --version），不接受任何传入 git 参数；spawn 无 shell、windowsHide
- 服务仅监听 127.0.0.1；除 `/__health` 外全部要求 Bearer token（timingSafe 比对）；token 持久化于 kv `repolens.meta`
- 零网络出站；唯一写盘 = 经宿主的 kv 投影；不写仓库任何文件
- 扫描上限：文件 3000 / 单文件 1MB / 内容 30MB / 提交 2 万 / git log 输出 64MB，超出即截断并在警告中明示（不静默装作完整）

## 口径声明（诚实标注）

- **复杂度是启发式近似**：分支关键词计数 + 嵌套深度（花括号语言按 `{}`、缩进语言按文件内最小正缩进自适应单位），非精确圈复杂度；用于相对排序与热点合并，不用于绝对断言
- **rename 归因语义**：rename 提交计入新路径；改名前的历史留在旧路径名下（时间耦合按历史路径统计）
- **merge 提交**不产生 numstat（git 默认），计入提交总数与卫生统计但不贡献 churn
- 健康分公式与权重在报告内全量展示，可自行复核

## 架构

两平面（stream-desk / webhook-station / dep-probe 已验证范式）：

- `shared/core.js`（纯函数，CJS 同构）：numstat 解析（rename 三种语法/二进制/坏行兜底）、近似复杂度、churn 归并、热点评分、时间耦合、重复检测、卫生、巴士因子、健康分、kv 投影裁剪、离线自检 fixture；service/MCP/面板/测试四方共用
- `service/main.js`（node ≥18 零依赖）：REST（127.0.0.1:9879，Bearer + CORS）+ 扫描编排（单飞行，进度阶段回报）+ meta 心跳 60s + kv 投影；宿主 kv 桥不可达时进入降级（服务照常，报告不投影）
- `mcp/server.js`：stdio JSON-RPC 八工具，经 kv `repolens.meta` → 127.0.0.1 直连；env `REPOLENS_SERVICE_URL/TOKEN` 测试钩子
- `dist/panel.js`：React 面板（扫描/总览/热点/体检/历史五 Tab，SVG 气泡图与时间线，1s 进度轮询）

kv 键空间（`repolens.` 前缀）：`meta`（心跳）/ `settings`（默认参数+最近路径）/ `runs`（cap 20）/ `latest`（最近一次成功 runId）/ `report.<runId>`（投影封顶：热点 300、耦合 100、重复 100、大对象 30、分支 100）。

选型依据与市场证据见仓库 `docs/repo-lens-plan.md`。

## 验证口径（四层，2026-11-03 实测）

- **core 单测 24/24**（node --test：解析器全语法/复杂度启发式/热点公式手算对账/耦合双闸/重复归一化/卫生/巴士/健康分边界/投影封顶）
- **服务集成 9/9**（mock bridge + 真实 git 夹具仓 + 真实子进程：夹具含 co=3 共变对、10 行重复块、rename、2MB 大对象、40 天陈旧分支、wip 草率消息、巨提交，逐项断言；401/409/非仓库存活/defaults 夹取）
- **MCP 全链路 7/7**（stdio JSON-RPC + env 钩子 + 真实服务 + 真实夹具仓：八工具全部实调，repo_scan 同步等待真实扫描）
- **typecheck + esbuild** 通过（panel.js 54.8KB）
- **真桥冒烟 PASS**（真实宿主 9820 cap.kv + Polaris 主仓实测：3561 提交 / 1813 文件，**24 秒**完成，健康分 70，Top3 热点 `createConversationStore.ts(71)` / `lib.rs(52)` / `browser.rs(45)` 与人工认知一致；投影落真实 kv；`repolens.*` 清扫零残留）
- 全套件 `npm test` **43 项：41 过 0 挂 2 跳**（真桥门控默认跳，`REPOLENS_REAL=1` 开启）

## 已知限制

- 复杂度近似：字符串/注释中的花括号与关键词不区分（工程上够用于相对排序）；`case` 贯穿计 1 次而非逐分支
- 时间耦合与重复在大仓有统计上限（top 150 文件内配对、12 万窗口预算），超出在警告中明示
- 单文件下钻依赖服务内存（服务重启后需重扫；kv 投影仍可看报告概况）
- 仅分析 git 仓库；不分析多仓聚合（一次一个路径）；不含 blame 行级归因（v0.1 范围外）
- Web(https) 部署模式下浏览器会拦 `http://127.0.0.1` 混合内容（桌面/手机 WebView 正常，与 dep-probe/stream-desk/api-bench 面板直连面同款边界）
- 历史大对象遍历超 40 万对象截断（超大型仓的 `.git` 考古不完整，警告中明示）
