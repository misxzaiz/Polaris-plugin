# 插件 #4 调研分析：prompt-vault（prompt 版本管理与测试库）

> 10 轮分析。来源：Google AI 概览 + PromptLayer/Langfuse/MLflow 文章。

## 轮 1：痛点验证
- 代码库耦合：prompt 硬编码源码，改字需重新部署
- 静默回归：小改字破坏 JSON 解析/语义，无标准错误
- 跨团队摩擦：产品/领域专家想可视编辑测试，缺非技术界面
- agent 多 prompt 协同：规划/工具选择/执行 prompt 散落

## 轮 2：差异化检查
- 已有：PromptLayer、LangSmith、Langfuse、Maxim、Lilypad（SaaS/重型）
- Polaris 差异化：**本地轻量 prompt 库**——JSON 持久化、版本快照、变量模板渲染、本地试运行。
- 与 recall 区别：recall 是 FSRS 复习卡片，本插件是 prompt 版本管理与模板渲染，无调度。

## 轮 3：Polaris 扩展点组合
- `contributes.mcpServers[]`：`save_prompt(name, template, vars)` 存版本、`render_prompt(id, vars)` 渲染、`list_prompts(tag?)` 列出、`diff_versions(id, v1, v2)` 对比
- `contributes.views[]` + `contributes.panel`：prompt 库浏览/编辑/版本历史/变量测试
- `contributes.chatCards[]`：result 模式渲染 render_prompt 的输出
- 三点：MCP（CRUD+渲染）+ Panel（库管理）+ ChatCard（result）

## 轮 4：技术可行性
- MCP + 内嵌存储：JSON 文件（appConfigDir）
- 模板渲染：{{var}} 占位符替换，纯字符串
- 版本：每次保存快照，存 history 数组
- Panel：列表+编辑+变量表单+预览
- 风险：存储简单 → MVP 够用

## 轮 5：竞品对比
| 方案 | 本地 | 版本 | 变量渲染 | 可视编辑 | 轻量 |
|------|------|------|----------|----------|------|
| PromptLayer | ✗ | ✓ | ✓ | ✓ | ✗ |
| Langfuse | ✗ | ✓ | ✓ | ✓ | ✗ |
| Lilypad | ✓(git) | ✓ | ✓ | 部分 | 中 |
| **本插件** | ✓ | ✓ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- agent 开发者：⭐⭐⭐⭐⭐ prompt 版本管理、变量测试、避免回归
- 上班族：⭐⭐⭐ 保存常用 prompt 模板
- 学生：⭐⭐ 学习 prompt 工程
- 综合：高价值，agent 开发者核心痛点。

## 轮 7：实现复杂度
- MCP：中（CRUD+渲染+diff）
- Panel：中（库+编辑+变量+历史）
- ChatCard：低
- 总体：2-3 轮。

## 轮 8：MVP
- MCP：save_prompt / render_prompt / list_prompts / diff_versions
- 存储：JSON（prompts 数组，每条含 versions）
- Panel：左侧列表 + 右侧编辑（变量表单→渲染预览）+ 版本历史 diff
- 模板：{{variable}} 占位符

## 轮 9：风险
- diff 算法 → 简单逐行对比即可
- 变量类型 → MVP 全字符串
- 与 recall 存储冲突 → 不同子目录

## 轮 10：决策
✅ 通过。开发 `polaris.promptvault`（prompt 版本库）。
- 扩展点：MCP（CRUD+渲染+diff）+ Panel（库管理）+ ChatCard（result）
- 核心：本地 prompt CMS，版本快照，变量模板
