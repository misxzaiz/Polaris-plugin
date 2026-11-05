# 多语言键同步台（i18n-sync）

把「改了 zh.json 忘了 en.json」从 grep 手工排查变成 30 秒本地体检，翻译缺失键由宿主对话 AI 完成（零额外密钥），审阅确认后落盘、全程可撤销。

## 解决什么问题

- 多语言应用的键漂移：基准语言（如 zh-CN）加了键，其他语言文件没跟上 → 线上直接显示 raw key。
- 人工比对的痛苦：`diff <(jq keys zh.json) <(jq keys en.json)` 这类手工命令易错难维护。
- 现有方案缺口：VS Code 扩展锁编辑器、SaaS（Babeledit/Crowdin/Lokalise）要钱或上云、CLI 脚本只报告不落盘。
- 机器翻译事故：`{name}`/`{{name}}`/`%s`/`%1$s` 占位符被吞或数量错 → 运行时渲染崩坏。本插件在写入前硬校验占位符一致性，不一致全部拒绝。

## 功能

- **扫描**：locale 目录体检。布局自动识别（`zh-CN.json` 文件一语言 / `zh-CN/common.json` 目录一语言）、JSON/JSONC/YAML、node_modules 等自动跳过、文件数/大小上限防呆、解析错误逐文件报告不炸全局。
- **奇偶矩阵**：缺失 / 多余 / 空值 / 疑似未翻译（与基准逐字相同）/ 占位符不一致 / 结构冲突（嵌套路径与字面键相撞）六类，按 ns × 语言分组。
- **AI 补齐**：`i18n_missing` 产出待翻译工作表（键 + 基准源文案 + 术语表），对话 AI 翻译后 `i18n_apply` 落盘。
- **审阅落盘**：占位符/幻觉键/跨 ns 冲突三道校验门（要么全过要么不写）；写前快照 → `i18n_undo` 一键撤销；应用后被人工改过的文件拒绝盲目恢复。
- **术语表**：`源词 = 译词` 逐行维护，自动注入翻译约束，保证用词一致。
- **面板手工通道**：矩阵 Tab 直接填写译文 → 应用 → 重扫验证闭环。

## 使用

**面板**：ActivityBar 🌐 → 输入 locale 根目录绝对路径 → 扫描 → 看矩阵 / 把体检任务发到对话。

**对话 AI**：
```
用 i18n_status 体检 D:\myapp\src\locales
把 en 缺的键列出来（i18n_missing）
（AI 翻译后）确认没问题就写入（i18n_apply confirm=true）
```

## 架构

```
面板（React bundle；cap.kv + 127.0.0.1 直连自家服务）
  └─ 扫描/应用走 service：shared/scan-engine + apply-engine
MCP server（stdio bundle；js-yaml + 同一套 shared 引擎 → 与面板结论永远一致）
shared/i18n-core.js —— 零依赖纯引擎（解析/扁平化/奇偶/占位符/计划/序列化），单一权威
```

- 解析基座：JSON/JSONC 内置状态机（字符串内 `//` 不误剥、行号不漂移）；YAML 由 js-yaml 提供（esbuild bundle 进 service/mcp，与 yaml-lens 同款模式）。
- 键名永不拆分：`{"a.b": 1}` 字面键与嵌套 `{a:{b:1}}` 推导路径相撞时双方剔除并报告「结构冲突」，不静默。

## 键空间契约（权威）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `i18n.meta` | 服务 | 面板 | 服务心跳 {token, port, version, pid, startedAt, lastTickAt, appConfigDir}；token 重启不换 |
| `i18n.settings` | 面板 | 面板/服务/MCP | {baseLocale?, recentDirs[]} |
| `i18n.glossary` | 面板/MCP | MCP | {terms: {源词: 译词}, updatedAt}，≤200 条 |
| `i18n.undo.index` | 服务/MCP | 面板/MCP | [{batchId, at, root, locale, mode, files[]}]，≤20 条 |

undo 快照本体存 `<appConfigDir>/i18n-sync-undo/<batchId>.json`（文件系统，非 kv；内容含 beforeText/afterText 用于恢复与冲突检测），保留最近 20 批。

## 安全

- 只绑 127.0.0.1 + token（`x-i18n-sync-token`，token 在 kv `i18n.meta`，与面板共享）。
- 应用只写「本次扫描发现的 locale 文件」；`translations` 里的键必须是基准语言文件中存在的键（幻觉键拒绝）；跨 ns 同名键要求显式 `ns` 消歧。
- 校验失败全部拒绝（不写半套翻译）；`force:true` 是显式逃生口。
- 含注释文件默认拒绝序列化（会丢注释），`stripComments:true` 显式接受。
- 纯本地零外联；翻译由宿主对话 AI 完成，插件自身不发任何网络请求。

## 已知边界

- 不扫源代码里的 `t('key')` 调用（不做「代码用了但文件没有」方向的检查——二期候选）。
- YAML 序列化经 js-yaml dump：注释与锚点会丢（有 stripComments 同款门）。
- ICU 复杂复数/select 语法只抽取顶层变量名做一致性比对，不做求值。
- 数组值整体视为叶值，不逐项翻译。
- 文件上限 200 个/单文件 2MB/总量 20MB（防呆截断会显式警告）。

## 开发

```bash
npm install
npm run typecheck
npm run build        # panel + service + mcp 三个 bundle
node test/run-tests.mjs   # 离线单测（core/scan/apply 全行为）
node test/mcp-verify.mjs  # MCP stdio 协议全闭环（临时夹具，自清理）
node test/smoke-real.mjs  # 真实桥冒烟（需本机 Polaris 运行中）
```
