# ci-lens 选型记录（052 · 第 14 轮热点发现）

> 2026-11-06。候选空间先过方向硬闸（禁台账/记录/生活类），再撞车排查，最后市场证据评分。

## 候选池（≥10 个，全部为「做成了/变换了/诊断了」类动作）

| 候选 | 动作 | 撞车排查 | 结论 |
|---|---|---|---|
| 查询表达式调试台（jq/JMESPath/JSONata） | 变换/诊断 | 无 | 淘汰：官方 play.jqlang.org + VS Code AI 插件覆盖充分，差异化弱 |
| Redis 检查台 | 诊断 | db-workbench（SQL 三协议）之外 | 淘汰：RedisInsight 官方免费 + ARDM 免费成熟，缺口不足 |
| X.509 证书调试台 | 诊断/变换 | jwt-desk 部分相邻 | 67 分：SSLShopper/SAMLTool 类 web 解码器饱和、频次 spike 偏低 |
| SQL 格式化/方言转译台 | 变换 | query-plan-lens 相邻 | 淘汰：IDE 内置格式化充分 |
| i18n 资源体检台 | 诊断 | 无 | 备选：证据中等（发布节奏驱动，非高频） |
| XML/XPath 调试台 | 诊断 | 无 | 备选：证据弱于 ci-lens |
| GraphQL 调试台 | 诊断 | 无 | 淘汰：graphql-inspector（schema diff）等生态成熟 |
| 密钥泄露扫描台 | 诊断 | **keyscan 已交付**（20 类凭据+熵） | 淘汰（撞车） |
| 文件批量重命名台 | 变换 | **file-flow 相邻**（规则整理+dry-run+撤销） | 淘汰（撞车面大） |
| 压缩包安全内窥镜 | 诊断 | 无 | 备选：频次低 |
| Dockerfile + GH Actions 体检台 | 诊断 | **零撞车**（docker-desk 是运行时运维） | **入选 81.5 分** |
| nginx 配置检查台 / UA 解析台 / 字幕工具台 | 诊断/变换 | 无 | 备选：证据/频次均弱 |

## 评分（ci-lens，权重合计 100%）

| 维度 | 权重 | 得分 | 证据 |
|---|---|---|---|
| 痛点强度 | 20% | 4/5 | CI 往返浪费直接可感（一次坏配置 = 5-15 分钟往返）；pull_request_target 组合是真实提权漏洞模式 |
| 频率/覆盖 | 15% | 4/5 | Dockerfile + GitHub Actions 是当前最大公约数栈；每个活跃仓库周级接触 |
| 现有缺口 | 15% | 3.5/5 | hadolint/actionlint 是 CLI 二进制（HN 原帖抱怨安装摩擦）；web linter 要贴第三方、无 AI、不读本地文件；无一合并双配置 |
| 差异化 | 15% | 4/5 | 零安装本地 + 仓库级扫描（cil_scan）+ 中文修复建议 + AI 解读/重写；46 条规则单一权威 |
| 收益 | 15% | 4/5 | push 前拦截：省 CI 往返 + 供应链安全规则前置 |
| 平台适配 | 10% | 5/5 | 纯本地零外联零 kv；文件类体检天然适配面板 + MCP；三端可见 |
| 可行性 | 5% | 5/5 | 100% 确定性纯 JS（无 wasm/无二进制/无网络），离线断言可全绿 |
| 成本 | 5% | 4/5 | 规则集有界（46 条），维护成本可控 |
| **加权** | | **81.5/100** | |

## 关键证据（可追溯）

- hadolint 10k+ star / actionlint 均为事实标准；[HN: "installing seems non-trivial"](https://news.ycombinator.com/item?id=24776771)
- actionlint 语义证据：[坏表达式/坏 runner 标签浪费 CI run 或卡死 job](https://tenki.cloud/blog/lint-github-actions-workflows-actionlint)
- web 端 linter 众（Dockadvisor/DevToolLab 等）证明需求存在，但全部是粘贴型、无本地文件与 AI 集成
- 实测锚点：Polaris 主仓 ci.yml = 3.8/10（14 缺 timeout、17 未钉 SHA）——自家仓库即真实用户

## 最大不确定性与止损

- 不确定性：规则级 FP 率（干净夹具零误报已测；真实仓库大面积跑需迭代）→ 止损：error/warn/info 分级 + info 不阻断，规则目录公开可解释
- 假设「AI 解读修复」是差异化的核心增量 → 已由 MCP 三工具承载；若 AI 侧使用率低，面板+scan 仍是独立可用产品
