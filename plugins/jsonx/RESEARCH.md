# 插件 #14 调研分析：json-explorer（JSON 树形浏览器）

> 10 轮分析。来源：开发者调试 API 响应痛点。

## 轮 1：痛点验证
- 开发者：API 返回巨大 JSON，找字段费眼，jq 语法难写
- 学生：学 JSON 结构时需可视化
- 现有：jq、jsonformatter.org、Postman（重）

## 轮 2：差异化检查
- 已有：jq、jsonformatter、Postman、JSON Hero
- Polaris 差异化：**对话内 JSON 浏览**——AI 调用工具提取路径/搜索，Panel 树形展开，ChatCard 渲染。
- 与 regex/cron 区别：那些是纯 MCP，本插件加 Panel 可视化。

## 轮 3：Polaris 扩展点组合
- MCP：`extract_paths(json)` 列出所有路径、`search_json(json, query)` 搜索键值、`get_path(json, path)` 取值
- Panel：粘贴 JSON → 树形展开 + 搜索 + 路径复制
- ChatCard：result 渲染搜索结果

## 轮 4：技术可行性
- JSON.parse + 递归遍历
- 树形 UI：递归组件
- 可行

## 轮 5：竞品对比
| 方案 | 离开 IDE | 路径提取 | AI 查询 | 树形 |
|------|----------|----------|---------|------|
| jq | ✓ | ✗ | ✗ | ✗ |
| jsonformatter | ✓ | ✗ | ✗ | ✓ |
| **本插件** | ✗ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- 开发者：⭐⭐⭐⭐⭐ 调试 API
- 学生：⭐⭐⭐ 学 JSON
- 综合：高价值开发者。

## 轮 7：实现复杂度
- MCP：低
- Panel：中（树形组件）
- ChatCard：低
- 总体：2 轮。

## 轮 8：MVP
- MCP：extract_paths / search_json / get_path
- Panel：输入区+树形渲染+搜索
- ChatCard：result 渲染搜索结果

## 轮 9：风险
- 大 JSON 性能 → 限制深度/大小
- 树形递归 → React 递归组件

## 轮 10：决策
✅ 通过。开发 `polaris.jsonx`（JSON 浏览器）。
- 扩展点：MCP + Panel + ChatCard(result)
