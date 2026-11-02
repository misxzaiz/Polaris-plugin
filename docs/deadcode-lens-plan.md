# 死代码透视台（deadcode-lens）选型与设计

日期：2026-11-03 · 状态：已定案，进入实施

## 一、选型结论

**做一个 knip 式的源码级死代码/依赖图谱体检插件**：扫本地 JS/TS 项目，从入口追踪 import 图，找出
**死文件 / 未使用导出 / 未使用依赖 / 悬空导入 / 循环依赖**，每条发现都带「证据」（谁引用了它、我们在哪找过），
面板出报告，AI 经 MCP 工具读报告并动手清理（删除/去 export → 重扫闭环）。

id：`deadcode-lens` · 显示名：**死代码透视台**（直白功能名纪律）· 分类：dev

## 二、为什么是它（证据链）

### 市场证据（外部）
- **knip**（webpro-nl/knip，knip.dev）是 JS/TS 生态公认「unused files / dependencies / exports」工具，
  2025 年仍活跃维护（issue 三连到 2025-08，刚迁 oxc-resolver 提速），有企业赞助、VS Code 扩展、
  Smashing Magazine 专文（2023-08《Knip: An Automated Tool For Finding Unused Files…》）。
  它的前身谱系 depcheck / ts-prune（均已停更并指向 knip）证明该需求十年持续存在。
- TS 编译器 `noUnusedLocals` **只覆盖模块内局部变量，不覆盖导出**——「导出了但没人 import」在编辑器里无告警，
  这是 knip 存在的根本原因，也是本插件导出级检测的价值锚点。
- 竞品都是 CLI（knip/madge/dependency-cruiser），要 node/npx 环境 + 配置；**Polaris 生态 86 插件中零覆盖**。

### 本仓证据（一手）
- `AGENTS.md:41` 明确写「本地缺：`knip`/`husky` 脚本门槛——`knip` 是**后续工作项**」——治理路线图亲自挂名。
- 本仓治理战役反复发生：clippy 266→35、lint 112→89、Chat barrel 切边（main -284~-344KB）、
  mermaid 3.4MB 静态泄漏——每一次都指向「没人引用/引用不收口」类问题，收益已实测可量化。
- **AI 高产码仓的死代码是增量问题**：agent 只加不减，Polaris 主仓与 90 个插件全部由 AI 参与；
  死文件还会污染 AI 上下文（agent 每次都会读到它们）——死代码体检是 AI 仓的专属高频需求。
- MCP 闭环是生态独有优势：报告喂给 agent → agent 删除/去 export → 重扫验证，形成自清理循环。

### 撞域核查（86 插件逐一比对）
| 相邻插件 | 实际范围 | 与本插件边界 |
|---|---|---|
| dep-probe | lockfile 漏洞（OSV） | 不碰源码图；「未使用依赖」零覆盖 |
| repo-lens | git 历史 churn×复杂度/提交卫生 | 历史维度，无 import 图 |
| bundle-lens | dist 产物字节归因 | 产物层；死源码不影响产物时它看不见 |
| context-pack | 打包上下文（token 估算） | 只打包不诊断 |
| dev-toolbox | 单文件变换工具 | 无项目级分析 |

## 三、候选池与评分（淘汰记录）

方向硬约束过滤后候选池（台账/生活类一律未进池）：

| 候选 | 得分 | 淘汰/保留原因 |
|---|---:|---|
| **死代码/依赖图谱体检台** | **87.5** | ✅ 唯一同时满足：一手需求证据(AGENTS.md) + 生态零撞域 + AI 闭环价值 |
| 数据库 Schema 对比台 | 80.5 | 强付费竞品证据（Redgate $395+），但本仓栈是 kv/JSONL，用户自用频率低；DDL 正确性风险大 |
| Markdown 文档体检台 | 78.8 | site-audit（网站死链）邻接削弱差异化；lychee CLI + VS Code 内建校验挤压 |
| i18n 一致性检查台 | 73 | 仅 i18n 仓适用，受众窄 |
| OpenAPI 契约体检台 | 73 | schemathesis CLI 强；spec-first 团队才高频 |
| 文件格式透视台 | 72 | ImHex 43k★ 证品类但频率低；纯手工解析格式多 |
| 依赖许可证合规台 | 70 | dep-probe 邻近，单独成台价值薄 |
| 压缩包安检台 | 68 | 「打开陌生 zip 前安检」故事好但低频 |
| ~~密钥扫描台~~ | — | ❌ keyscan 已存在（商城 86 条实测） |
| ~~Mock 服务台~~ | — | ❌ mock-server 已存在 |
| ~~Diff 工具台~~ | — | ❌ diff-desk 为他人未提交 WIP，避撞 |
| ~~Token 计数台~~ | — | ❌ context-pack 已含估算 |

评分权重：痛点20/频率15/缺口15/差异化15/收益15/适配10/可行性5/成本5（逐项理由在最终交付报告）。

## 四、产品定义

- **一句话**：把「这个仓里哪些文件、导出、依赖其实没人用」变成一次 30 秒的本机体检，AI 还能直接照着报告清理。
- **目标用户**：AI 参与开发的 JS/TS 仓维护者（Polaris 主仓、Polaris-plugin 仓的每一个插件都是场景）。
- **核心动作**：诊断 + 变换（报告→清理），零「记录」。
- **MVP 边界**：
  - 支持：`.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts`；ESM 静态/动态 import、`export *`/命名 re-export 链、
    `import.meta.glob`（保守标记）、tsconfig paths 别名、目录→index 解析、`?raw` 等 query 后缀剥离、
    side-effect import、`import type`、package.json 依赖级检测（deps/devDeps）。
  - 不做（v0.1 明确拒绝）：Vue SFC、CSS @import 图、非 JS 语言、自动删除任何文件（AI 删除是用户自己的动作，
    本插件**只读**）、monorepo workspace 跨包图（按单根扫，workspace 包名当外部依赖处理）。
- **成功指标**：对 Polaris 主仓 src/ 全量扫描 < 30s；对带已知缺陷的 fixture 检出率 100%（离线单测锁定）；
  真仓抽查发现准确率抽查 5 例全对（0 误报才敢让 AI 动手）。

## 五、架构（两平面，dep-probe/repo-lens 同范式）

```
shared/core.js      纯函数引擎（CJS 同构，四方共用）：walker → lexer → resolver → graph → 分析器
shared/vendor/es-module-lexer.cjs  vendored 单文件（esbuild 同款 lexer，vite 依赖）
service/main.js     node≥18 零外部依赖：REST(127.0.0.1) + 扫描编排 + 进度 + kv 投影
mcp/server.js       stdio JSON-RPC 六工具，经 kv meta 直连服务
dist/panel.js       React 面板（扫描/报告/历史/设置）
```

- 端口 9884（已查 9860-9881 占用，避开）；kv 前缀 `deadlens.`。
- 鉴权/发现/kvclient/面板 invoke 全部照抄 dep-probe 实测样板（Bearer md5 timingSafe、anchor 自发现、
  POLARIS_HOST/PORT/TOKEN 测试逃生口）。
- 引擎算法：
  1. walk（跳 node_modules/dist/.git…，cap 8000 文件 / 2MB 单文件）
  2. 每文件 es-module-lexer 解析 imports/exports + `import.meta.glob` 正则补扫 + `.cjs` require 正则补扫
  3. resolver：相对/别名（tsconfig paths + 常见 @/ src/ 默认）→ 文件；裸名 → 外部依赖（含子路径归并、
     node: 内建豁免、@types 联动）
  4. 入口启发：package.json main/module/bin/scripts、index.html script、src/main.*、src/index.*、
     *.config.[jt]s、用户补充入口（UI/MCP 可传）；测试文件当入口（保守，knip 同款默认）
  5. BFS 可达性 → 死文件（分层：零引用者 vs 仅被死文件引用）；导出级：消费链解析
     （具名导入沿 re-export 链回溯、`import *`/动态 import 保守全标记、自文件他用 →「可去 export」而非「可删」）
  6. Tarjan SCC 找循环；未解析导入单列（真 bug 检测器）
- 安全：文件只读；零系统命令；零网络（离线引擎）；服务仅监听 127.0.0.1 + Bearer token。

## 六、测试计划（四层）

1. **离线单测**（node --test，temp fixture 仓，已知答案逐一断言）：
   死文件/未使用导出（含 type 导出、default、barrel 链、`export *` 消费、自用去 export 建议）/未使用依赖
   （真没用/脚本用/config 用/@types 联动）/悬空导入（含 ?raw 与别名）/循环依赖/import.meta.glob/
   动态 import/side-effect/index 目录解析/caps 截断。
2. **服务集成**：mock bridge env + HTTP API 全链路（scan→poll→report）。
3. **MCP 全链路**：假服务注入 env → 六工具逐一断言。
4. **真桥冒烟**（env 门控）：真实宿主 kv + 真仓扫描抽查。
5. **实战验证**：扫 Polaris 主仓 src/ 与 Polaris-plugin 某插件，人工抽查 5+ 条发现的真实性。

## 七、发布

按交付协议五步链执行（pack → update.json → index.json @main → commit → push + jsdelivr purge GET + 三 URL 实测）。
