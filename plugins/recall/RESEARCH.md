# 插件 #2 调研分析：recall-cards（AI 记忆卡 + 间隔复习）

> 10 轮分析确认选型。来源：Google AI 概览 + NoteFren/RemNote/Lexie 文章。

## 轮 1：痛点验证
- 学生：手动建卡数百张耗时数小时才能开始学习（manual card fatigue）
- Anki 学习曲线陡：界面/算法让新手困惑
- 笔记与卡片割裂：传统 app 与课堂笔记分离
- agent 开发者：记 API/命令/概念同样需要间隔重复
- 上班族：考证/培训材料记忆

## 轮 2：差异化检查
- 已有 SaaS：RemNote、Knowt、Lexie、Quizlet、Anki
- 差异化：**Polaris 内闭环**——AI 对话生成卡片 + 后台 Service 调度复习 + Panel 复习 + ChatCard 交互式答题。不离开 Polaris，且组合 Service 扩展点（diagram 没用到）。
- 与 diagram 区别：diagram 用 MCP+Panel+ChatCard(result)，本插件新增 **Service + ChatCard(interaction)**。

## 轮 3：Polaris 扩展点组合设计
- `contributes.mcpServers[]`：`generate_cards(text)` 从笔记生成 Q&A 卡片、`list_due_cards()` 列出到期卡片、`review_card(id, grade)` 记录复习结果
- `contributes.services[]`：http 后台服务，持久化卡片+调度算法（简化 FSRS），提供 REST API 给 Panel 调用，定时计算到期卡片
- `contributes.views[]` + `contributes.panel`：复习面板，展示待复习卡片、翻面、评分（再来/困难/良好/简单）
- `contributes.chatCards[]`：**interaction 模式**——AI 发起"该复习了"卡片，用户在卡片内答题提交，回填 tool_result
- 四点组合：MCP 生成 + Service 调度存储 + Panel 复习 + ChatCard 交互答题

## 轮 4：技术可行性
- Service（http）：Node http 服务，JSON 文件持久化（卡片/复习记录），FSRS 简化算法
- MCP：调用 Service 的 HTTP API（localhost:port）
- Panel：fetch 调用 Service API，翻面+评分 UI
- ChatCard interaction：提交答案 → respond() 回填
- 风险：Service 端口冲突 → 用 {{port}} 自动分配

## 轮 5：竞品对比
| 方案 | AI 生成 | 间隔重复 | 笔记一体化 | 后台调度 | Polaris 原生 |
|------|--------|---------|-----------|---------|-------------|
| Anki | ✗ | ✓ | ✗ | ✗ | ✗ |
| RemNote | 部分 | ✓ | ✓ | ✓ | ✗ |
| Lexie | ✓ | ✓(FSRS) | ✓ | ✓ | ✗ |
| **本插件** | ✓(MCP) | ✓(简化FSRS) | ✓(对话) | ✓(Service) | ✓ |

## 轮 6：目标用户价值
- 学生：⭐⭐⭐⭐⭐ 笔记变卡片，省时，复习提醒
- agent 开发者：⭐⭐⭐⭐ 记 API/命令/概念
- 上班族：⭐⭐⭐⭐ 考证培训
- 综合：高价值，深度场景。

## 轮 7：实现复杂度
- Service：中等（http+JSON 持久化+FSRS 简化）
- MCP：低（转发 Service API）
- Panel：中等（复习 UI）
- ChatCard interaction：中等（答题+respond）
- 总体：3 轮可实现 v1。

## 轮 8：MVP
- Service：POST /cards（创建）、GET /cards/due（到期）、POST /cards/:id/review（评分）
- 持久化：JSON 文件（appConfigDir）
- 简化 FSRS：4 档评分 → 间隔 1d/3d/7d/14d
- MCP：generate_cards / list_due_cards / review_card
- Panel：到期列表 + 翻面 + 评分
- ChatCard：interaction，AI 提问用户答题

## 轮 9：风险与对策
- 风险：Service 崩溃丢数据 → 对策：JSON 文件每次写入持久化
- 风险：端口冲突 → {{port}} 自动分配
- 风险：ChatCard interaction 实现复杂 → MVP 先用 result 模式，interaction 作为增强
- 风险：数据隔离 → 存 appConfigDir 下插件子目录

## 轮 10：选型决策
✅ **通过**。开发插件 `polaris.recall`（记忆卡 + 间隔复习）。
- id: `polaris.recall`
- 扩展点：MCP（生成/列出/复习）+ Service（http 持久化调度）+ Panel（复习界面）+ ChatCard（interaction 答题）
- MVP：见轮 8
- 核心：Service 扩展点展示 + ChatCard interaction 模式展示
