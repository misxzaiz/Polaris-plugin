# 插件 #8 调研分析：habit-tracker（习惯追踪与定时打卡）

> 10 轮分析。来源：上班族效率/习惯养成痛点（前期调研）。

## 轮 1：痛点验证
- 上班族：想养成好习惯（喝水/站立/专注/阅读），但忙起来忘，无提醒
- 学生：学习习惯坚持难
- 现有：Streaks/Habitica/Loop Habit Tracker（移动端为主，桌面少）

## 轮 2：差异化检查
- 已有：Streaks、Habitica、Loop、Done（移动 app）
- Polaris 差异化：**桌面 AI 桌面内闭环**——Service 定时检查到期习惯 → ChatCard interaction 询问打卡 → Panel 统计连续天数。
- 与 recall 区别：recall 是复习卡片（FSRS 内容调度），本插件是习惯打卡（时间调度+连续天数）。

## 轮 3：Polaris 扩展点组合
- Service（http）：存储习惯+打卡记录+定时计算到期，提供 API
- MCP：`add_habit(name, cron)` 添加、`check_due()` 检查到期、`mark_done(id)` 打卡、`stats()` 统计
- Panel：习惯列表+连续天数+打卡按钮
- ChatCard：interaction 模式，到期时询问"完成了吗？"

## 轮 4：技术可行性
- Service：复用 recall 的 http 模式，JSON 持久化
- MCP：转发 Service API
- Panel：fetch Service
- ChatCard interaction：复用 recall 模式
- 可行

## 轮 5：竞品对比
| 方案 | 桌面 | 定时提醒 | AI 询问 | 连续统计 | 免账号 |
|------|------|----------|---------|----------|--------|
| Streaks | ✗ | ✓ | ✗ | ✓ | ✗ |
| Habitica | ✗ | ✓ | ✗ | ✓ | ✗ |
| **本插件** | ✓ | ✓(Service) | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- 上班族：⭐⭐⭐⭐⭐ 喝水/站立/专注习惯提醒
- 学生：⭐⭐⭐⭐ 学习习惯
- agent 开发者：⭐⭐⭐ 休息提醒
- 综合：高价值，上班族核心。

## 轮 7：实现复杂度
- Service：中（定时+持久化）
- MCP：低
- Panel：中（列表+打卡+连续天数）
- ChatCard：中（interaction）
- 总体：3 轮。

## 轮 8：MVP
- Service：POST /habits、GET /habits/due、POST /habits/:id/done、GET /stats
- 习惯字段：id/name/频率(每日/每周X)/streak/lastDone/history
- MCP：add_habit / check_due / mark_done / stats
- Panel：习惯卡片+打卡+连续天数
- ChatCard：interaction 询问打卡

## 轮 9：风险
- 定时触发需 Polaris 主动 → MVP 由 AI 调用 check_due 触发，或 Panel 手动检查
- 数据与 recall 冲突 → 独立子目录 polaris-habit

## 轮 10：决策
✅ 通过。开发 `polaris.habit`（习惯追踪）。
- 扩展点：Service（定时存储）+ MCP（打卡/查询）+ Panel（打卡统计）+ ChatCard（interaction）
- 展示 Service + ChatCard(interaction) 组合（与 recall 同组合但场景不同）
