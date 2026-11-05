# Markdown 检查器 markdown-lens —— 结构体检

> 发布 README / 文档前过一遍：12 条结构规则行级体检，围栏状态感知不误报，锚点匹配对齐 GitHub slug（中文标题兼容）。

## 核心能力

| 规则 | 级别 |
|---|---|
| 标题层级跳级（h1→h3） | warn |
| 多个 h1（第二个起） | error |
| 首个标题不是 h1 | info |
| 锚点断链（`#目标` 与标题 GitHub slug 全量比对，前向引用合法，中文保留） | error |
| 图片无 alt | warn |
| 空链接 | warn |
| 裸 URL（建议语义化链接） | info |
| 表格列数不齐（定位表头行） | error |
| 代码块无语言标注 | info |
| 重复标题 | warn |
| TODO/FIXME 残留 | info |
| 粗体当标题用 | info |

**围栏状态感知**：代码块内的伪 markdown 语法（示例文档、嵌套说明）不触发任何规则。

## 快速开始

1. 插件中心安装「Markdown 检查器」→ 左侧 ActivityBar 出现面板。
2. 粘贴 markdown → 「检查」→ 行级发现表 + 标题树大纲。
3. 或对 AI 说：「用 Markdown 检查器体检这段 README」。

## 与 AI 的对话约定（MCP 工具）

| 工具 | 用途 |
|---|---|
| `mdlen_lint` | 结构体检（行级发现 + 统计） |
| `mdlen_outline` | 标题树大纲（层级缩进 + 行号） |

## 开发与验证

```bash
npm install
npm run typecheck          # tsc --noEmit（strict）
npm run build              # esbuild → dist/panel.js
node test/run-tests.mjs    # 离线单测 13 组（29 断言：逐规则 + slug + 围栏）
node test/mcp-verify.mjs   # MCP 全链路 16 组（真实 stdio 子进程）
```

## 已知边界

- 锚点匹配按 GitHub slug 规则（空格→-、去标点、中文保留）；其他渲染器（GitLab 等）slug 规则略有差异。
- 不做拼写/语法检查（交给 AI 对话）；纯结构体检。
