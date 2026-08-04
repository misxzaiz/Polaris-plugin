# 插件 #9 调研分析：cheatsheet（命令速查库）

> 10 轮分析。来源：学生/开发者/上班族记命令痛点。

## 轮 1：痛点验证
- 开发者：CLI/快捷键记不住，反复 Google（git、vim、docker 命令）
- 学生：软件操作/快捷键/公式记不住
- 上班族：Excel/PPT/系统操作忘
- 现有：cheat.sh、Devhints、各软件文档（分散）

## 轮 2：差异化检查
- 已有：cheat.sh（CLI）、Devhints（web）、Notion 模板
- Polaris 差异化：**本地速查库**——存命令+分类+全文搜索，AI 可调用查询工具直接回答"怎么用 X"。
- 与 knowledge 区别：knowledge 通用笔记，本插件专注命令/快捷键速查（结构化：命令+说明+分类+示例）。

## 轮 3：Polaris 扩展点组合
- MCP：`add_command(cmd, desc, category, example)` 添加、`search_commands(query, category?)` 搜索、`list_categories()` 分类
- Panel：速查浏览+搜索+编辑
- ChatCard：result 渲染搜索结果

## 轮 4：技术可行性
- 纯 MCP+JSON，无依赖
- 可行

## 轮 5：竞品对比
| 方案 | 本地 | 分类 | 全文 | AI 查询 | 示例 |
|------|------|------|------|---------|------|
| cheat.sh | ✗ | ✓ | ✓ | ✗ | 部分 |
| Devhints | ✗ | ✓ | ✓ | ✗ | ✓ |
| **本插件** | ✓ | ✓ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- 开发者：⭐⭐⭐⭐⭐ git/vim/docker 速查
- 学生：⭐⭐⭐⭐ 软件快捷键
- 上班族：⭐⭐⭐ Excel/PPT
- 综合：高价值，三人群通用。

## 轮 7：实现复杂度
- MCP：低
- Panel：中
- ChatCard：低
- 总体：2 轮。

## 轮 8：MVP
- MCP：add_command / search_commands / list_categories / get_command
- 字段：id/cmd/desc/category/example
- Panel：搜索+分类侧栏+列表+编辑
- ChatCard：result 渲染命令列表

## 轮 9：风险
- 与 knowledge 重叠 → 专注命令速查，结构化字段不同（cmd/desc/example）

## 轮 10：决策
✅ 通过。开发 `polaris.cheatsheet`（命令速查库）。
- 扩展点：MCP（CRUD+搜索）+ Panel（浏览编辑）+ ChatCard（result）
- 无 Service，纯轻量
