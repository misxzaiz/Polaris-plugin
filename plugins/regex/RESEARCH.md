# 插件 #10 调研分析：regex-builder（正则构建与测试器）

> 10 轮分析。来源：开发者正则痛点。

## 轮 1：痛点验证
- 开发者：正则语法难记，写一个匹配邮箱/URL/手机号的正则要反复试
- 学生：学正则时需在线测试工具
- 现有：regex101.com、regexr（web，离开 IDE）
- AI 可生成但无验证闭环

## 轮 2：差异化检查
- 已有：regex101、regexr、各种在线工具
- Polaris 差异化：**纯 MCP 工具**——AI 调用 build_regex 生成+test_regex 验证，在对话内闭环，无切换。
- 与 cheatsheet 区别：cheatsheet 是命令速查库，本插件是正则构建+测试执行器（有测试逻辑）。
- 展示**纯 MCP 最轻量插件**（无 Panel/ChatCard）。

## 轮 3：Polaris 扩展点组合
- 仅 `contributes.mcpServers[]`
- 工具：`build_regex(intent, flags)` AI 描述意图→生成正则骨架、`test_regex(pattern, text)` 执行匹配返回结果、`explain_regex(pattern)` 解释语法

## 轮 4：技术可行性
- 正则执行：Node RegExp 原生
- 生成：模板库（邮箱/URL/手机号/IP/日期 等）+启发式
- 可行，无依赖

## 轮 5：竞品对比
| 方案 | 离开 IDE | 执行测试 | AI 生成 | 本地 |
|------|----------|----------|---------|------|
| regex101 | ✓ | ✓ | ✗ | ✗ |
| ChatGPT | ✗ | ✗ | ✓ | ✗ |
| **本插件** | ✗ | ✓ | ✓(模板) | ✓ |

## 轮 6：目标用户价值
- 开发者：⭐⭐⭐⭐⭐ 正则构建测试
- 学生：⭐⭐⭐⭐ 学正则
- 上班族：⭐⭐ 数据清洗
- 综合：高价值开发者工具。

## 轮 7：实现复杂度
- MCP：低（模板+RegExp）
- 无 Panel/ChatCard
- 总体：1-2 轮。

## 轮 8：MVP
- build_regex(intent) 模板匹配→正则+说明
- test_regex(pattern, text, flags) → matches 数组
- explain_regex(pattern) 逐段解释
- 模板：email/url/phone/ip/date/number/uuid

## 轮 9：风险
- 模板有限 → AI 可调用后修改，test_regex 验证
- 正则语法错误 → test_regex 捕获异常返回

## 轮 10：决策
✅ 通过。开发 `polaris.regex`（正则构建器）。
- 扩展点：仅 MCP（最轻量插件展示）
- 无 Panel/ChatCard
