# dep-probe（依赖体检台）选型与设计文档

> 2026-11-02 · 生产级插件交付选型记录。选型方法：先过方向硬闸（禁台账/记录/生活类，用户 2026-11-01 定案），再做生态空白校验（79 插件全量盘点），最后以可追溯的市场证据评分。

## 一、需求证据（可追溯）

### 1.1 问题定义

开发者的项目依赖（npm / pnpm / Cargo / pip / go）随时可能带着已知漏洞跑在生产上。现有工具链**碎片化**：npm 生态有内置 `npm audit`/`pnpm audit`，Rust 要另装 `cargo-audit`，Python 要 `pip-audit`，Go 要 `govulncheck`——每个生态一个 CLI、各自安装、输出格式各异；多仓库开发者（本机现状：Polaris 主仓 300+ crates 的 Cargo.lock + 77 个插件各自的 package-lock/pnpm-lock）没有一个「一次跑完所有仓库、统一报告」的入口。

### 1.2 外部证据

- **OSV.dev**（https://osv.dev）：Google 运营的开源漏洞数据库，聚合 GitHub Advisory Database（GHSA）、RustSec、PyPI Advisory、Go 漏洞库等，**免费 API、无需密钥**（`POST /v1/querybatch` 批量查询，文档 google.github.io/osv.dev/api/）。数据源权威且持续更新——查询端不需要自己维护漏洞规则库。
- **google/osv-scanner**（GitHub，最新 v2.3.3）：Google 官方 CLI 扫描器，被 Wolfi 等发行版纳入安全管线（wolfi-dev/os 仓库的 osv-scanner.yaml）——**官方下场证明这是真实高频需求**；但它是一个需要单独安装的 Go 二进制，输出是 CLI 文本，无历史、无忽略管理、无 AI 联动。
- **供应链事件持续发生**：event-stream（2018）、ua-parser-js（2021）、node-ipc（2022）、xz-backdoor（2024）……每次事件后开发者都要回答「我的项目里有没有这个包/这个版本」——这是一个反复出现的批量自查场景。
- **本机 dogfood 证据**：① 2026-10-30 精简优化时实测 `audit-ci` 存在假阴性（CI 全绿但依赖问题真实存在）；② 用户维护 Polaris（Cargo）+ Polaris-plugin（77 插件 × npm/pnpm）两类生态的仓库群，「升级一个依赖后所有仓库受影响面」目前只能靠手工逐仓排查。

### 1.3 竞品格局

| 方案 | 缺口 |
|---|---|
| npm/pnpm audit | 只覆盖 npm 生态；需要进入每个仓库目录执行；输出一次即逝无历史 |
| cargo-audit / pip-audit / govulncheck | 每生态一个独立 CLI，各装各的；无 GUI、无跨仓批量 |
| google/osv-scanner CLI | 最接近的理想内核，但：需安装 Go 二进制、无 GUI 报告、无多仓历史对比、无忽略管理、无 AI 对话式解读 |
| SaaS（Snyk/Dependabot 等） | 需要把仓库托管到平台/授权读取，本地私有仓与离线场景不适用 |

**生态空白校验**：对 Polaris-plugin 全部 79 个插件 id/名称/描述全量盘点 + 全仓 grep `osv|vulnerab|lockfile|依赖体检|cargo audit|npm audit`：**零命中**。context-pack（打包依赖给 LLM 读）、keyscan（源码里扫密钥字符串）与「依赖版本漏洞查询」无语义重叠。

## 二、候选池与评分（满分 100，全部先过硬闸）

| 候选 | 痛点20% | 频率15% | 缺口15% | 差异化15% | 收益15% | 适配10% | 可行5% | 成本5% | 总分 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **依赖体检台（选定）** | 3.5 | 3.5 | 3 | 3.5 | 3.5 | 4.5 | 4 | 3.5 | **71.0** |
| 工作区保险台（git 快照防丢） | 4.5 | 3.5 | 3.5 | 4 | 4.5 | 4.5 | 4 | 3.5 | 82.5* |
| 令牌与签名台（JWT/HMAC/哈希） | 3.5 | 3 | 3.5 | 4 | 3.5 | 4.5 | 4.5 | 3.5 | 73.0 |
| 正则表达式调试台 | 3.5 | 3 | 2.5 | 3.5 | 3 | 5 | 5 | 4.5 | 69.5 |
| MD→公众号排版变换台 | 4 | 2.5 | 2.5 | 3 | 3.5 | 5 | 4.5 | 4 | 69.0 |
| 端口占用排查台 | 3.5 | 3 | 3 | 3 | 3 | 4 | 4.5 | 4 | 66.5 |

\* 工作区保险台按原始分最高，但被三项生产可靠性理由否决：

1. **index.lock 竞争风险**：该插件的动机场景（多 agent 并发改同一仓库）恰恰是它最容易出事的场景——快照写 git 对象需要短暂持锁，与用户已建立的「多 agent 并行会话」工作流正面冲突。保险工具自己成为事故源不可接受。
2. **相邻感知**：data-ark（数据备份引擎）已交付，快照保险与备份的形态距离解释成本高。
3. **保险型留存曲线**：价值事件罕见但剧烈，平时无打开理由，与「用户持续使用」目标相悖。

依赖体检台胜出理由：安全/性能属主攻方向；外部证据最硬（Google 官方 scanner 证明需求、OSV 免费 API 消除数据维护成本）；本机 dogfood 价值直接（30+ 仓库两生态）；工程边界清晰可测（纯解析 + 固定主机 HTTPS，无系统命令、无端口写、无锁竞争）。

## 三、产品设计

- **一句话**：把「我的依赖有没有已知漏洞、升到哪一版能修掉」变成一次 30 秒的本机体检：选路径 → 递归发现 lockfile（package-lock / pnpm-lock / Cargo.lock / requirements*.txt / go.mod）→ OSV.dev 批量查询 → 按仓库出报告 + 最小修复版本方案；AI 经 MCP 七工具对话式扫描与解读。
- **核心动作**：诊断 + 变换（依赖清单 → 漏洞报告 → 修复方案）。不是记录。
- **边界（v0.1 明确不做）**：不做 outdated 版本对比（registry 全量 packument 拉取成本高，修复方案已含「升到哪版」）；不做自动升级写盘（只报告，改动留给用户/git）；不做 SBOM 导出（后续扩展）；不做 Go/PyPI 的 latest 检查（OSV 漏洞查询全生态支持，registry 补充仅 npm/cargo 生态，v0.1 统一不做）。
- **安全模型**：网络只出站到 `api.osv.dev`（固定主机，不接受用户传 URL）；文件只读；唯一写盘 = 漏洞详情磁盘缓存（appConfigDir 内）+ cap.kv 投影；无系统命令执行。

## 四、架构（stream-desk 已验证范式）

两平面 + 三端共享：
- `shared/core.js`（纯函数，CJS 同构）：5 种 lockfile 解析器、OSV 请求分块、发现归并、忽略规则、修复方案、severity 分级、semver-lite 比较、自检 fixture。
- `service/main.js`（node 零依赖）：REST（127.0.0.1:9876，Bearer token，CORS）+ 扫描编排（发现→解析→querybatch→详情并发 5→磁盘缓存→kv 投影）+ meta 心跳。
- `mcp/server.js`（stdio JSON-RPC 零依赖）：7 工具，经 kv meta → 127.0.0.1 直连。
- `dist/panel.js`（React，esbuild）：扫描/报告/历史/设置四 Tab。

kv 键空间（`depprobe.` 前缀）：`depprobe.meta`（心跳 60s）、`depprobe.settings`（忽略规则+最近路径）、`depprobe.runs`（cap 20）、`depprobe.latest`、`depprobe.report.<runId>`（findings cap 800 逐条截断）。

## 五、验证口径（四层，2026-11-02 实测全绿）

1. core 单测 **19/19**（node --test，零依赖）：5 种解析器（真实格式 fixture + 边界：pnpm v6/v9、scope 包、peer 后缀、Cargo workspace、PyPI 规范化、go indirect）+ 忽略归并 + 修复方案 + 分块 + 版本比较。
2. 服务集成 **6/6**（mock bridge + mock OSV + 真实子进程）：真实发现路径 meta 落 kv、扫描编排全链路、node_modules 干扰项剔除、忽略规则重扫生效、409/401/400 护栏、单包查询。
3. MCP 全链路 **5/5**：spawn 真实 MCP + 真实服务 + mock OSV/bridge，七工具逐个调用（完整 kv→meta→直连生产发现链）。
4. 真桥冒烟 **PASS**：真实宿主 cap.kv（9820 生产实例）+ 真实 api.osv.dev——lodash@4.17.15 命中真实 GHSA/CVE 且详情全补全、报告落真实 kv、清扫无残留。全套件 31 项 30 过 1 跳（真桥 env 门控）0 挂；typecheck + esbuild 通过（dist/panel.js 37.4kb）。
