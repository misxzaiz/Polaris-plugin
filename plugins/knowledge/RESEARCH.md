# 插件 #7 调研分析：knowledge-base（本地知识库与语义检索）

> 10 轮分析。来源：前期调研（2500 hours CodeMind 库模式 + Mem0 OpenMemory + 学生笔记痛点）。

## 轮 1：痛点验证
- 学生：笔记散落多处，考前找不到"那个知识点讲过没"
- 上班族：项目文档/规范/会议纪要分散，找历史决策难
- agent 开发者：代码片段/命令/API 用法记不住，反复搜索
- 现有：Notion/Obsidian/Roam（重）、Mem0（SaaS）、CodeMind（私有）

## 轮 2：差异化检查
- 已有：Notion、Obsidian、Mem0、CodeMind、Recall（本仓库 recall 插件已做卡片复习）
- Polaris 差异化：**轻量本地知识库**——笔记/片段存入，按标签/全文检索，AI 可调用查询工具注入上下文。
- 与 recall 区别：recall 是间隔复习卡（FSRS），本插件是知识条目存储+检索（无复习调度，按需查）。

## 轮 3：Polaris 扩展点组合
- MCP：`add_note(text, tags)` 存、`search_notes(query, tag?)` 检索、`get_note(id)`、`list_tags()`
- Panel：知识条目浏览+搜索+编辑
- ChatCard：result 渲染搜索结果

## 轮 4：技术可行性
- 存储：JSON（notes 数组，每条含 id/tags/content/ts）
- 检索：全文 substring 匹配 + 标签过滤（MVP 无向量，纯字符串）
- 可行，轻量

## 轮 5：竞品对比
| 方案 | 本地 | 轻量 | 标签 | AI 查询 | 免账号 |
|------|------|------|------|---------|--------|
| Notion | ✗ | ✗ | ✓ | ✓ | ✗ |
| Obsidian | ✓ | 中 | ✓ | ✗ | ✓ |
| Mem0 | ✗ | 中 | ✓ | ✓ | ✗ |
| **本插件** | ✓ | ✓ | ✓ | ✓(MCP) | ✓ |

## 轮 6：目标用户价值
- 学生：⭐⭐⭐⭐⭐ 笔记知识库存档+考前检索
- agent 开发者：⭐⭐⭐⭐ 命令/片段/AI 可注入上下文
- 上班族：⭐⭐⭐⭐ 项目文档/决策检索
- 综合：高价值，三人群通用。

## 轮 7：实现复杂度
- MCP：低（CRUD+检索）
- Panel：中（列表+搜索+编辑）
- ChatCard：低
- 总体：2 轮。

## 轮 8：MVP
- MCP：add_note / search_notes / get_note / list_tags / delete_note
- 字段：id / content / tags[] / ts / source
- Panel：搜索框 + 标签筛选 + 条目列表 + 编辑
- ChatCard：result 渲染搜索结果

## 轮 9：风险
- 检索无语义 → MVP 全文匹配，AI 可调用后理解语义
- 与 recall 存储冲突 → 独立子目录 polaris-knowledge

## 轮 10：决策
✅ 通过。开发 `polaris.knowledge`（本地知识库）。
- 扩展点：MCP（CRUD+检索）+ Panel（浏览编辑）+ ChatCard（result）
