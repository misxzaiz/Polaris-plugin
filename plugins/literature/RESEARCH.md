# 插件 #5 调研分析：literature-matrix（文献笔记结构化与对比矩阵）

> 10 轮分析。来源：Google AI 概览（Elicit/SciSpace/Scite.ai 痛点）。

## 轮 1：痛点验证
- 信息过载：术语密集 PDF 难读，找方法/结论费时
- 文献综合：几周搜索关键词、手动建对比矩阵
- 引用管理：追踪真实引用、判断被引是否被反驳
- 学生写综述最痛：对比多篇文章的结构化表格

## 轮 2：差异化检查
- 已有：Elicit、SciSpace、Scite.ai、Paperguide、ResearchRabbit
- Polaris 差异化：本地文献库（无账号）+ AI 结构化提取（贴摘要→作者/方法/结论/变量）+ 对比矩阵 + 多格式引用导出
- 与 recall 区别：recall 是间隔复习卡，本插件是文献对比矩阵（一次性结构化导出）

## 轮 3：Polaris 扩展点组合
- MCP：`extract_paper(text)` 结构化提取、`compare_papers(ids)` 对比矩阵、`format_citation(id, style)` 引用导出
- Panel：文献库 + 矩阵表格 + 引用导出
- ChatCard：result 渲染提取结果

## 轮 4：技术可行性
- 提取：启发式（作者/年份/方法/结论关键词），纯字符串
- 对比：表格化 JSON
- 引用：APA/IEEE/GB-T7714 模板
- 可行，无重型依赖

## 轮 5：竞品对比
| 方案 | 本地 | 结构化提取 | 对比矩阵 | 引用导出 | 免账号 |
|------|------|-----------|----------|----------|--------|
| Elicit | ✗ | ✓ | ✓ | 部分 | ✗ |
| Scite.ai | ✗ | 部分 | ✗ | ✓ | ✗ |
| **本插件** | ✓ | ✓ | ✓ | ✓(3 格式) | ✓ |

## 轮 6：目标用户价值
- 学生：⭐⭐⭐⭐⭐ 文献综述/开题报告
- agent 开发者：⭐⭐ 技术调研对比
- 上班族：⭐⭐⭐ 竞品分析
- 综合：高价值，学生核心痛点。

## 轮 7：实现复杂度
- MCP：中（提取+对比+引用模板）
- Panel：中（矩阵表格 UI）
- ChatCard：低
- 总体：2-3 轮。

## 轮 8：MVP
- MCP：extract_paper / compare_papers / format_citation
- 提取字段：标题/作者/年份/方法/样本/结论/局限
- 对比：选多篇 → 表格
- 引用格式：APA / IEEE / GB-T 7714

## 轮 9：风险
- 提取启发式有限 → AI 对话侧精炼，MCP 出骨架
- 存储与其它插件冲突 → 独立子目录 polaris-literature

## 轮 10：决策
✅ 通过。开发 `polaris.literature`（文献矩阵）。
- 扩展点：MCP（提取/对比/引用）+ Panel（库+矩阵）+ ChatCard（result）
