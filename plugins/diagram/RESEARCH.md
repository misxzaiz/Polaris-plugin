# 插件 #1 调研分析：diagram-from-text（自然语言生成图表）

> 10 轮分析确认选型。每轮一个角度。目标：确定是否做、做什么、怎么利用 Polaris 扩展点。

## 轮 1：痛点验证（来源：Firecrawl + 2500 hours 文章）

- agent 开发者：需要快速画架构图/流程图/时序图说明设计，但 Mermaid 语法门槛高，手写易错。
- 学生：笔记里需要配图辅助记忆（思维导图、流程图），但切换到外部工具打断思路。
- 上班族：周报/汇报需要流程图，但 Visio/Lucidchart 重，PPT 画图丑。
- **2500 hours 文章中 Sailor（自然语言→图表）是该作者最完整的 MCP 实现之一**，验证了需求真实。

## 轮 2：差异化检查

- 已有：Mermaid Live Editor（web）、Excalidraw、Lucidchart、ChatGPT/Claude 直接生成 Mermaid。
- Polaris 内已有 browser 插件、personal-hub 等内置插件。
- 差异化：**在 Polaris 内闭环**——AI agent 直接调用 MCP 工具生成图表 → ChatCard 渲染 → Panel 提供编辑/历史/导出。不离开 Polaris 即可"对话式画图"。
- 不只是生成器，而是"对话→图→编辑→导出"的工作流。

## 轮 3：Polaris 扩展点组合设计

- `contributes.mcpServers[]`：MCP 工具 `generate_diagram`（文本→Mermaid 语法）、`validate_mermaid`（校验语法）、`list_templates`（图表模板）。
- `contributes.views[]` + `contributes.panel`：ActivityBar 面板，Mermaid 编辑器 + 实时预览 + 历史记录 + 导出 SVG/PNG。
- `contributes.chatCards[]`：result 模式，AI 调用 `generate_diagram` 后渲染 Mermaid 图表卡片（而非纯文本）。
- 三点组合：AI 对话生成（MCP）→ 卡片渲染（ChatCard）→ 编辑面板（Panel）→ 导出。

## 轮 4：技术可行性

- Mermaid 语法生成：MCP server（Node）纯字符串处理，无重型依赖。
- 渲染：Panel 侧用 mermaid.js（CDN 或打包），浏览器环境天然支持 SVG。
- 导出 SVG/PNG：mermaid.js 直接产出 SVG，PNG 可用 canvas 序列化。
- ChatCard：result 模式渲染 Mermaid SVG，无需额外能力。
- 风险：Panel bundle 需打包 mermaid.js（体积约 2MB），可接受；或用 CDN script 注入。

## 轮 5：竞品与替代方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| Mermaid Live (web) | 完整 | 离开 Polaris、无 AI |
| Claude 直接生成 Mermaid | 已有 | 无编辑/历史/导出闭环、无卡片渲染 |
| Excalidraw | 手绘好 | 不是结构化图、无 AI |
| **本插件** | AI+编辑+导出闭环、Polaris 原生 | 需打包 mermaid.js |

## 轮 6：目标用户价值评估

- agent 开发者：⭐⭐⭐⭐ 架构图/时序图/状态机，AI 生成省时
- 学生：⭐⭐⭐⭐⭐ 思维导图/流程图辅助笔记记忆
- 上班族：⭐⭐⭐⭐ 流程图/组织结构图汇报
- 综合：高价值，覆盖三类用户。

## 轮 7：实现复杂度评估

- MCP server：中等（Mermaid 语法生成+校验逻辑）
- Panel：中等偏高（Mermaid 编辑器+预览+历史+导出，需打包 mermaid.js）
- ChatCard：低（result 模式渲染 SVG）
- 总体：可控，2-3 轮可实现 v1。

## 轮 8：最小可行版本（MVP）定义

- MCP 工具：`generate_diagram(text, type)` → Mermaid 代码
- MCP 工具：`validate_mermaid(code)` → 错误提示
- Panel：编辑器 + 实时预览 + 导出 SVG
- ChatCard：渲染 generate_diagram 的 Mermaid 输出为 SVG
- 模板：flowchart/sequence/mindmap/class/state

## 轮 9：风险与对策

- 风险：mermaid.js bundle 体积大 → 对策：Panel 用 CDN script 标签注入 mermaid.js，不打包进 bundle。
- 风险：Mermaid 语法生成错误率高 → 对策：内置模板 + 校验工具 + AI 可迭代修正。
- 风险：ChatCard 渲染 SVG 安全 → 对策：mermaid.js sanitize 模式。

## 轮 10：选型决策

✅ **通过**。确定开发插件 `polaris.diagram`（图表生成器）。

- id: `polaris.diagram`
- 方向：自然语言→图表（Mermaid）
- 扩展点：MCP（生成+校验）+ Panel（编辑+预览+导出）+ ChatCard（渲染图表）
- MVP：见轮 8
- 打包：Panel 用 mermaid.js CDN，esbuild bundle 仅含 React 组件
