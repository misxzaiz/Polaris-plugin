# 插件 #3 调研分析：minutes-craft（会议纪要/周报结构化工作台）

> 10 轮分析。来源：zfcode 会议纪要工具评测 + Sana Labs 生产力工具。

## 轮 1：痛点验证
- 上班族每天泡在会议里，纪要散落在文档/便签/记忆里，"我们说过 Q2 某事…大概？"
- 现有 SaaS（Otter/Fireflies/Jamie/MeetGeek）痛点：bot 入会很尴尬、免费时长限制、摘要需手动审阅才能转发、配置复杂
- 周报：每周重复写，从零组织语言耗时
- 真正价值不是转写，而是**结构化提炼**（议题/决策/任务/负责人）

## 轮 2：差异化检查
- 已有：Otter.ai、Fireflies、Jamie、MeetGeek、Notion AI、Zoom/Teams 内置
- Polaris 差异化：**本地 AI 桌面闭环**——用户贴转写/笔记 → AI 按**结构化模板**提炼 → Panel 可编辑 → 导出 Markdown/邮件。不发 bot、不限时长、隐私本地。
- 与 recall 区别：recall 是间隔复习（FSRS+ChatCard interaction），本插件是**一次性结构化提炼+导出**（MCP+Panel+ChatCard result），无 Service 无复习调度。

## 轮 3：Polaris 扩展点组合
- `contributes.mcpServers[]`：`structure_minutes(text, type)` 按模板结构化（会议纪要/周报/standup）、`extract_actions(text)` 提取待办、`format_report(minutes, style)` 格式化输出
- `contributes.views[]` + `contributes.panel`：模板编辑器 + 结构化预览 + 导出 Markdown
- `contributes.chatCards[]`：result 模式，渲染 AI 结构化的纪要为分节卡片
- 三点：MCP（结构化）+ Panel（编辑导出）+ ChatCard（result 渲染）

## 轮 4：技术可行性
- MCP：纯字符串处理 + 模板，无依赖
- Panel：Markdown 编辑器 + 预览 + 复制/导出
- ChatCard：result 模式渲染分节
- 风险：结构化启发式有限 → 对策：AI 在对话侧精炼，MCP 提供骨架

## 轮 5：竞品对比
| 方案 | bot-free | 不限时长 | 结构化模板 | 本地隐私 | Polaris 原生 |
|------|----------|----------|-----------|----------|-------------|
| Otter | ✗ | ✗ | 部分 | ✗ | ✗ |
| Jamie | ✓ | ✗ | 部分 | ✓ | ✗ |
| Notion AI | ✓ | 部分 | ✓ | ✗ | ✗ |
| **本插件** | ✓ | ✓ | ✓(多模板) | ✓ | ✓ |

## 轮 6：目标用户价值
- 上班族：⭐⭐⭐⭐⭐ 会议纪要/周报/standup 结构化，省时
- agent 开发者：⭐⭐⭐ 技术讨论纪要
- 学生：⭐⭐⭐ 讲座/讨论整理
- 综合：高价值，聚焦上班族痛点。

## 轮 7：实现复杂度
- MCP：低（模板+字符串）
- Panel：中（Markdown 编辑+预览+导出）
- ChatCard：低（result 渲染）
- 总体：2 轮可实现。

## 轮 8：MVP
- MCP：structure_minutes(text,type)、extract_actions(text)、format_report(minutes,style)
- 模板：meeting（议题/决策/任务/下次）、weekly（本周完成/下周计划/风险）、standup（昨日/今日/阻塞）
- Panel：粘贴转写 → 选模板 → 结构化预览 → 导出 .md/复制
- ChatCard：result 渲染分节纪要

## 轮 9：风险
- 结构化启发式粗糙 → AI 对话侧精炼补足，MCP 出骨架
- 导出格式单一 → MVP 先 Markdown + 剪贴板
- 与 recall 重叠 → 本插件无 Service/复习，纯一次性提炼导出，差异明确

## 轮 10：决策
✅ 通过。开发 `polaris.minutes`（纪要/周报结构化工作台）。
- 扩展点：MCP（结构化/提取/格式化）+ Panel（编辑导出）+ ChatCard（result）
- 与 diagram 共用 MCP+Panel+ChatCard(result) 模式，但领域与模板逻辑完全不同
