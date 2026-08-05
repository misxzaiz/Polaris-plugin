# 插件 #16 调研分析：sql-craft（SQL 构建与格式化）

> 10 轮分析。来源：开发者 SQL 痛点。

## 轮 1：痛点验证
- 开发者：手写复杂 SQL 易错，格式混乱，难读
- 学生：学 SQL 需练习与格式化
- 现有：SQL Formatter online、各种 ORM（重）

## 轮 2：差异化检查
- 已有：sql-formatter、poor man's formatter、DBeaver
- Polaris 差异化：**纯 MCP**——AI 生成 SQL 骨架+格式化+基本语法校验，对话内闭环。

## 轮 3：Polaris 扩展点组合
- 仅 MCP：`build_sql(intent)` 意图→SQL 骨架、`format_sql(sql)` 格式化、`validate_sql(sql)` 基本校验

## 轮 4：技术可行性
- 格式化：关键字换行缩进
- 生成：模板（SELECT/INSERT/UPDATE/DELETE/JOIN）
- 校验：括号配对+关键字检查
- 可行

## 轮 5：竞品对比
| 方案 | 离开 IDE | 格式化 | AI 生成 | 本地 |
|------|----------|--------|---------|------|
| sql-formatter | ✓ | ✓ | ✗ | ✗ |
| **本插件** | ✗ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- 开发者：⭐⭐⭐⭐⭐ SQL 编写
- 学生：⭐⭐⭐⭐ 学 SQL
- 综合：高价值。

## 轮 7：实现复杂度
- MCP：中（格式化器）
- 总体：2 轮。

## 轮 8：MVP
- build_sql(intent, type) → 骨架
- format_sql(sql) → 格式化
- validate_sql(sql) → 校验

## 轮 9：风险
- 格式化不完美 → MVP 基本关键字缩进

## 轮 10：决策
✅ 通过。开发 `polaris.sql`（SQL 工具）。
- 扩展点：仅 MCP
