# 依赖体检台（dep-probe）

把「我的依赖有没有已知漏洞、升到哪一版能修掉」变成 Polaris 里的一次点击或 AI 的一句话：选路径 → 递归发现 lockfile → 与 **OSV.dev**（Google 运营的开源漏洞库，聚合 GitHub Advisory Database / RustSec / PyPI Advisory 等）批量比对 → 按仓库出分级报告与最小修复版本方案。网络只出站 `api.osv.dev`，文件只读，零系统命令，数据不出本机。

## 解决什么问题

- **工具链碎片化**：npm 生态有内置 audit，Rust 要另装 cargo-audit、Python 要 pip-audit、Go 要 govulncheck——每个生态一个 CLI、各装各的、输出各异。本插件一次扫五种 lockfile，统一报告。
- **多仓库没有批量入口**：一次填多个路径（或填父目录递归发现），跨仓汇总分级；AI 可直接问「我这些仓库有没有高危漏洞」。
- **发现漏洞之后要人工查「升到哪」**：报告自带**最小修复方案**——每个有漏洞的依赖给出「升到哪一版能消除其全部已知漏洞」（取各漏洞 fixed 版本的最大值），并如实列出暂无修复版本的依赖。
- **osv-scanner CLI 好但要装、无 GUI 无历史无 AI**：本插件零安装、报告落 kv 三端可看、AI 经 MCP 对话式扫描与解读。

## 使用

1. 活动栏打开「依赖体检台」；
2. 「扫描」Tab 填路径（每行一个目录或 lockfile 文件；目录递归发现，最多 4 层深，自动跳过 node_modules/target 等）→ 开始体检；
3. 「报告」Tab 看分级统计、发现明细（点行展开详情/公告链接）、最小修复方案；对误报可点「忽略此包此漏洞」留档（锚定包名+漏洞 ID+理由，下次扫描生效）；
4. 「历史」Tab 回看最近 20 次扫描；「设置」Tab 管理忽略规则、跑离线自检、重启服务。

受支持：`package-lock.json`（v1/v2/v3）、`npm-shrinkwrap.json`、`pnpm-lock.yaml`（v5/v6/v9）、`Cargo.lock`、`requirements*.txt`（仅 `==`/`===` 锁钉行）、`go.mod`。

## AI（MCP 七工具）

`dep_scan`（同步扫完返回摘要）/ `dep_report` / `dep_findings`（按严重度/生态/包名过滤）/ `dep_fix_plan`（最小修复方案）/ `dep_check_pkg`（单包即时查——升级前验证某版本是否干净）/ `dep_runs` / `dep_selftest`

对 AI 说：
- 「帮我体检 D:\space\base\Polaris-plugin 这些仓库的依赖漏洞」
- 「lodash 4.17.15 有洞吗？升到哪个版本能修掉？」
- 「上次扫描的高危漏洞列出来，给出升级方案」

## 安全边界

- 网络只出站到 `api.osv.dev`（固定主机，不接受任何传入 URL）；漏洞详情落磁盘缓存（appConfigDir 内，TTL 7 天，仅公告元数据）
- 文件只读；唯一写入 = kv 投影 + 详情缓存；不执行任何系统命令
- 服务仅监听 127.0.0.1；除 `/__health` 外全部要求 Bearer token（timingSafe 比对）；token 持久化于 kv `depprobe.meta`
- 报告只覆盖「已知漏洞 + 已钉版本」：范围依赖（非 `==`）、未登记到 OSV 库的漏洞不在检测范围——报告 ≠ 安全保证

## 架构

两平面（stream-desk / webhook-station 已验证范式）：

- `shared/core.js`（纯函数，CJS 同构）：五种解析器 + OSV 请求分块 + 发现归并 + 忽略规则 + 修复方案 + semver-lite 比较 + 离线自检 fixture，service/MCP/面板/测试四方共用
- `service/main.js`（node ≥18 零依赖）：REST（127.0.0.1:9876，Bearer + CORS）+ 扫描编排（发现→解析→querybatch 分块 100→详情并发 5 + 磁盘缓存→kv 投影）+ meta 心跳 60s
- `mcp/server.js`：stdio JSON-RPC 七工具，经 kv `depprobe.meta` → 127.0.0.1 直连
- `dist/panel.js`：React 面板（扫描/报告/历史/设置四 Tab，进度轮询）

kv 键空间（`depprobe.` 前缀）：`meta`（心跳）/ `settings`（忽略规则+最近路径）/ `runs`（cap 20）/ `latest` / `report.<runId>`（findings cap 800 逐条截断）。

选型依据与市场证据见仓库 `docs/dep-probe-plan.md`。

## 验证口径（四层，2026-11-02 实测）

core 单测 **19/19** · 服务集成（mock bridge + mock OSV + 真实子进程）**6/6** · MCP 全链路（stdio+真服务+完整发现链）**5/5** · typecheck + esbuild 构建通过 · 真桥冒烟（真实宿主 cap.kv 全链路 + 真实 api.osv.dev，lodash@4.17.15 命中真实 GHSA/CVE 且详情全补全，报告落真实 kv，清扫无残留）**PASS**——全套件 `npm test` 31 项 30 过 1 跳（真桥 env 门控）0 挂。

## 已知限制

- 检测范围 = OSV.dev 已收录的漏洞 + lockfile 已钉死的版本；`requirements.txt` 的范围依赖（`>=` 等非精确钉版）跳过并在警告中计数
- `go.mod`/`requirements.txt` 不查「最新版本」（v0.1 不做 outdated 对比；修复方案已含「升到哪版」）
- 单次扫描上限：lockfile 300 个 / 包 8000 个 / 发现 800 条（超出截断并在警告中明示）；扫描总时长 10 分钟上限
- OSV 批次失败按「该批无漏洞」计入并在警告中明示（报告不完整如实标注，不静默装作干净）
- CVSS 纯向量（无数值分）的漏洞严重度显示为「未分级」；不以报告中的固定版本作为对 vendored 副本的检测（node_modules/target 一律跳过）
- Web(https) 部署模式下浏览器会拦 `http://127.0.0.1` 混合内容（桌面/手机 WebView 正常，与 api-bench/stream-desk 面板直连面同款边界）
