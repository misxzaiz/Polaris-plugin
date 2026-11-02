# 死代码透视台（deadcode-lens）

把「这个仓里哪些文件、导出、依赖其实没人用」变成 Polaris 里的一次点击或 AI 的一句话：选根目录 → 从入口追踪 import 图 → 出死文件 / 未使用导出 / 未使用依赖 / 悬空导入 / 循环依赖五类发现，每条都带**证据**（谁引用它、我们在哪找过）。引擎完全离线：零外部网络、文件只读、零系统命令，数据不出本机。

## 解决什么问题

- **AI 高产码仓的死代码是增量问题**：agent 只加不减；改名/搬家后旧文件与旧导出永远留在仓里，还会持续污染 AI 上下文。
- **TS 编译器管不到**：`noUnusedLocals` 只覆盖模块内局部变量，「导出了但全仓没人 import」在编辑器里无告警（knip/ts-prune 的存在就是这个缺口的证明）。
- **测试文件是盲区**：主流 tsconfig 常把 `*.test.*` 排除出 typecheck，测试文件里的悬空导入没有任何工具会报——本插件照抓（对 Polaris 主仓实测抓到 3 处真断链）。
- **CLI 好但要装、无 GUI 无历史无 AI**：knip/madge 是好工具，但要 node/npx 环境与配置；本插件零安装、报告落 kv 三端可看、AI 经 MCP 对话式清理。

## 使用

1. 活动栏打开「死代码透视台」；
2. 「扫描」Tab 填项目根（如 `D:\space\base\Polaris`，扫描 `src` 子目录也可以——自动向上找 tsconfig/package.json）→ 开始体检；
3. 「报告」Tab 按类别看发现：死文件（零引用 / 仅被死文件引用）、未使用导出（**可删** vs **去 export** vs 需确认）、依赖（工具链类如实标注，不建议盲删）、悬空导入（解析失败=真 bug）、循环依赖；每条可点「为什么」看单文件完整证据；
4. 「复制 MD 报告」一键导出，喂给 AI 或贴进 issue；
5. 「历史」Tab 回看最近 20 次扫描对比治理效果。

支持的入口识别：package.json main/module/exports/bin、index.html script、`*.config.*`、测试文件与 `test/` 目录、`*.d.ts` 环境声明、package.json scripts 引用的文件（如 `node build.mjs`）、插件契约路径（`service/main.js`、`mcp/server.js`）、常见 app 入口（src/main.* 等）+ 手动补充入口。

解析器支持：ESM 静态/动态 import、`import type`、`export *` 与命名转发链、`export * as`、`import.meta.glob`（保守全标记）、tsconfig paths 别名（含扫描根上层）、目录→index 解析、TS 风格 `.js→.ts` 映射、`?raw` 等查询后缀、`.cjs` require。

## AI（MCP 六工具）

`dl_scan`（同步扫完返回摘要）/ `dl_findings`（按类别/关键词过滤）/ `dl_why`（单文件完整证据：谁引用它/它引用谁/导出消费情况/判定结论）/ `dl_report` / `dl_runs` / `dl_selftest`

对 AI 说：
- 「体检一下 D:\space\base\Polaris\src 的死代码」
- 「把未使用导出里 suggestion=delete 的列出来，逐个 dl_why 复核后删掉」
- 「src/utils/legacy.ts 为什么被判死？」

**推荐清理流程**：dl_scan → dl_findings(kind=files) → 对每个文件 dl_why 复核 → 删除/去 export → 重扫验证归零。

## 安全边界

- 引擎完全离线：零外部网络请求、零系统命令
- 文件只读；唯一写入 = kv 投影（本机数据根，`deadlens.` 前缀）
- 服务仅监听 127.0.0.1；除 `/__health` 外全部要求 Bearer token（timingSafe 比对）；token 持久化于 kv `deadlens.meta`
- 插件**永不自动删除任何文件**——报告只是报告，删除是 AI/用户自己的动作

## 架构

两平面（dep-probe / stream-desk 已验证范式）：

- `shared/core.js`（纯函数引擎，CJS 同构）：自研四态状态机解析器（code/行注释/块注释/字符串+模板，正则字面量启发式+换行自愈）——**不用 es-module-lexer 是因为它遇到裸 JSX 即抛错，而 React 仓恰是主场景**；vfs 抽象（虚拟/磁盘同口径）+ 解析器 + 可达性 BFS + re-export 消费链 + Tarjan SCC；service/MCP/测试三方共用
- `service/main.js`（node ≥18 零依赖）：REST（127.0.0.1:9884，Bearer + CORS）+ 扫描编排 + 进度 + kv 投影 + 心跳 60s
- `mcp/server.js`：stdio JSON-RPC 六工具，经 kv `deadlens.meta` → 127.0.0.1 直连
- `dist/panel.js`：React 面板（扫描/报告/历史/设置四 Tab，进度轮询，MD 导出）

kv 键空间（`deadlens.` 前缀）：`meta`（心跳）/ `settings`（最近根+忽略前缀）/ `runs`（cap 20）/ `latest` / `report.<runId>`。

保守性原则（发现会驱动 AI 删代码，宁漏报不误报）：namespace 导入/动态 import/glob 命中 → 全部导出视为已用；测试文件算入口（knip 同款默认）；`export *` 歧义全标记；自文件内使用的死导出建议「去 export」而非「删除」；工具链依赖单独标注不建议盲删。

选型依据与市场证据见仓库 `docs/deadcode-lens-plan.md`。

## 验证口径（四层，2026-11-03 实测）

core 单测 **15/15**（含 Polaris 主仓口径回归）· 服务集成（mock bridge + 真子进程全 HTTP 链）**1/1** · MCP 全链路（stdio + 真服务 + 六工具 + 错误路径）**1/1** · 真桥冒烟（真实宿主自发现 + kv 往返 + 投影 + **零残留清扫验证**）**PASS**——typecheck + esbuild 构建通过。

实战验证：Polaris 主仓 src/ 917 文件 1.2s 扫完——38 死文件（10 例全词 grep 抽查全对）、541 未使用导出（4 例抽查判定精确）、3 悬空导入（tsc 盲区的真 bug）、6 循环依赖（边实证）；dev-toolbox 插件 0 误报。

## 已知限制

- Vue SFC 不解析（JS/TS 生态为主）；CSS `@import` 图不做
- monorepo 跨包引用按 workspace 包名跳过（不做跨包图）；子目录扫描时只校验根 package.json 的依赖
- `import(...)` 非字面量参数（模板串/变量）保守跳过；`import.meta.glob` 花括号等高级模式不展开并如实警告
- namespace 导入（`import * as ns`）会把目标模块全部导出标记为已用（保守，可能漏报该模块的死导出）
- Web(https) 部署模式下浏览器会拦 `http://127.0.0.1` 混合内容（桌面/手机 WebView 正常，house 面板直连面同款边界）
- 单次扫描上限：8000 文件 / 单文件 2MB / 死文件 400 / 导出 800 / 悬空 400 / 循环 60（超出截断并在警告中明示，不静默）
