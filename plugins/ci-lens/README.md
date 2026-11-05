# CI 体检台 ci-lens —— Dockerfile + GitHub Actions 工作流体检

> 把「配置错误 → push → CI 红了 → 来回改」变成 **push 前一次本地体检**。
> 不需要装 hadolint / actionlint 二进制，不需要把配置贴给第三方网页——粘贴或扫目录，
> 行级发现 + 中文修复建议 + 0-10 评分，纯本地零外联。

## 为什么要有 CI 体检台

- 配置类 CI 错误（拼写错 runner、needs 引用错、`${{` 没闭合、secrets 大小写）的发现方式是
  **push 后等 CI 报错**，一次往返 5-15 分钟；这些错误 100% 可以在 push 前静态检出。
- 事实标准工具（[hadolint](https://github.com/hadolint/hadolint) 10k+ star、
  [actionlint](https://github.com/rhysd/actionlint)）是 CLI 二进制：Windows/受限环境安装有摩擦
  （HN 原帖："installing seems non-trivial"）；网页版 linter 要把配置贴给第三方、无 AI 解读、不读本地文件。
- `pull_request_target` + 检出 PR head 代码的组合是真实的仓库提权漏洞模式（GitHub 官方安全博客多次警告），
  但没有工具在 push 前本地提示。

## 核心能力

| 能力 | 说明 |
|---|---|
| Dockerfile 体检（20 条规则） | 基础镜像未钉版本/latest、apt 三规则（--no-install-recommends / 缓存未清理 / upgrade）、apt 版本未钉、apk --no-cache、sudo、curl\|sh、ADD 远程 URL/tar 豁免、全量 COPY、同阶段多 CMD/ENTRYPOINT（error）、MAINTAINER 弃用、ENV 旧语法、WORKDIR 相对路径、缺 USER、shell 形式 CMD、EXPOSE 无 HEALTHCHECK、RUN cd |
| 工作流体检（26 条规则） | YAML 语法错误优雅报告、未知顶层键/触发事件、schedule cron 校验（5 段/范围/名称/@简写）、workflow_dispatch 输入类型、permissions 取值、缺 jobs/runs-on/steps/timeout、runs-on 拼写（编辑距离 ≤2 近邻提示 + 版本格式）、needs 未知引用/自环/成环（DFS）、uses 格式/SHA 锚定、`${{ }}` 未闭合（跨行栈式配对行级定位）、secrets.github_token 大小写、steps.<id> 引用、outputs ↔ 步骤 id、needs.<job>.outputs.<k> 未声明、pull_request_target + PR head 检出（error）/单独使用（warn）、success() 冗余 if、job id 规范 |
| 评分 | 10 − error×2 − warn×0.7 − info×0.2，下限 0；优/良/中/需整改 |
| 目录扫描 | AI 一句话扫描整个仓库：自动发现 Dockerfile* 与 .github/workflows/*.yml\|yaml，逐个体检出汇总报告（只读） |
| 状态机解析 | Dockerfile 续行 `\` 合并（规则发现落在起始行）+ BuildKit heredoc 体跳过（体内 shell 不误报）+ 引号内伪标记忽略 |

## 快速开始

1. 插件中心安装「CI 体检台」→ 左侧 ActivityBar 出现 ☑ 面板。
2. 粘贴 Dockerfile 或工作流 YAML → 点「体检」；拿不准类型就留着「自动识别」。
3. 或直接对 AI 说：

```
用 CI 体检台扫描 D:\my-project，push 前给我过一遍 CI 配置
```

4. 面板「规则目录」可看全部 46 条规则与修复建议。

## 与 AI 的对话约定（MCP 工具）

| 工具 | 用途 |
|---|---|
| `cil_lint` | 体检一段文本（kind 缺省 auto 自动识别；识别不了如实报错） |
| `cil_scan` | 只读扫描目录（Dockerfile* + .github/workflows/*.yml\|yaml），逐文件评分 + 汇总 |
| `cil_rules` | 规则目录（解释某条规则、回答「你们检查什么」） |

## 架构

```
┌──────────── 面板（双模式测试场 + 规则目录）────────────────┐
│  粘贴 → core.lint（auto 识别）→ 行级发现 + 评分            │
│  workflow 解析：js-yaml（esbuild 打包进 bundle）            │
├────────────────────────────────────────────────────────────┤
│ shared/ci-core.js 纯函数核心（单一权威，运行时零依赖）       │
│  Dockerfile 行状态机（续行/heredoc）+ 20 规则               │
│  工作流 = raw 行级扫描（精确行号）+ 解析树走查（结构校验）   │
│  cron 校验器 / 表达式配对 / 编辑距离近邻 / 评分与报告        │
├────────────────────────────────────────────────────────────┤
│ mcp/server.js（esbuild bundle，stdio JSON-RPC；js-yaml 内置）│
│  AI 工具层：cil_lint / cil_scan / cil_rules                │
│  scan 只读（512KB/文件上限、跳过 .git/node_modules、文件数护栏）│
└────────────────────────────────────────────────────────────┘
```

**单一权威**：面板与 MCP 共用 `shared/ci-core.js`，同一配置两边结论永远一致。
**零 kv / 零宿主依赖**：无状态体检，MCP server 无宿主时照常可用。

## 开发与验证

```bash
npm install
npm run typecheck        # tsc --noEmit（strict）
npm run build            # esbuild → dist/panel.js + mcp/server.js（bundle）
node test/run-tests.mjs  # 离线单测 44 组（规则逐条 + 干净夹具零误报 + cron/评分/识别）
node test/mcp-verify.mjs # MCP 全链路 20 组（真实 stdio 子进程 + 临时夹具扫描）
```

实测锚点：对 Polaris 主仓真实 `ci.yml` 体检 = 3.8/10（14 处缺 timeout-minutes、17 处 action 未钉 SHA），
语义与 hadolint/actionlint 的高频规则对齐。

## 已知边界（如实声明）

- **不做 shellcheck 级 RUN 体内分析**；heredoc 体视为 shell 原文跳过（不扫规则）。
- **不校验 actions 的输入参数**（如 setup-node 的 node-version 取值）——只做结构与表达式级检查。
- 工作流行号：raw 扫描类发现行级精确；解析树类发现按 job id 缩进定位（尽力而为，js-yaml 无 span 信息）。
- rules 内置 hadolint/actionlint **高频子集**（46 条），不是完整规则集；需要完整 lint 仍可上 CLI 工具。
- `uses` SHA 锚定提示为 info 级（很多团队用 tag + Dependabot 也是合理策略），不是强约束。
- `secrets.github_token` 小写报 error 依据：GitHub 自动 token 恒为全大写，自定义 secret 命名同为大小写敏感。
