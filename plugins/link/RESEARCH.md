# 插件 #15 调研分析：link-vault（书签管理器）

> 10 轮分析。来源：链接管理痛点。

## 轮 1：痛点验证
- 学生：学习资料链接散落浏览器书签/聊天记录/便签，找不到
- 上班族：项目参考/文档链接多，无统一管理
- 开发者：工具/库/文档链接记不住
- 现有：浏览器书签（弱搜索）、Pocket、Notion（重）

## 轮 2：差异化检查
- 已有：浏览器书签、Pocket、Raindrop.io、Notion
- Polaris 差异化：**本地书签库+AI 查询**——存 URL+标题+标签+描述，AI 调用搜索注入对话。
- 与 knowledge 区别：knowledge 是通用笔记，本插件专注 URL（结构化 url/title/tags/desc）。

## 轮 3：Polaris 扩展点组合
- MCP：`add_link(url, title, tags, desc)` 添加、`search_links(query, tag?)` 搜索、`list_tags()`、`delete_link(id)`
- Panel：书签浏览+搜索+编辑
- 无 ChatCard（轮换）

## 轮 4：技术可行性
- JSON 持久化，纯字符串
- 可行

## 轮 5：竞品对比
| 方案 | 本地 | 标签 | AI 查询 | 轻量 |
|------|------|------|---------|------|
| 浏览器书签 | ✓ | 弱 | ✗ | ✓ |
| Pocket | ✗ | ✓ | ✗ | ✗ |
| Raindrop | ✗ | ✓ | ✗ | 中 |
| **本插件** | ✓ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- 学生：⭐⭐⭐⭐ 学习资料链接
- 上班族：⭐⭐⭐⭐ 项目参考
- 开发者：⭐⭐⭐⭐ 工具文档
- 综合：高价值通用。

## 轮 7：实现复杂度
- MCP：低
- Panel：中
- 总体：2 轮。

## 轮 8：MVP
- add_link / search_links / list_tags / delete_link / update_link
- 字段：id/url/title/tags/desc/createdAt
- Panel：搜索+标签+列表+编辑

## 轮 9：风险
- 与 knowledge 重叠 → 专注 URL 结构化字段

## 轮 10：决策
✅ 通过。开发 `polaris.link`（书签管理器）。
- 扩展点：MCP + Panel
