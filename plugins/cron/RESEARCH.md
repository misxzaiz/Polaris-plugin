# 插件 #13 调研分析：cron-craft（cron 表达式构建与解释）

> 10 轮分析。来源：开发者定时任务痛点。

## 轮 1：痛点验证
- 开发者：cron 语法难记（分时日月周），写错定时任务出问题
- 运维/上班族：排程任务需验证 cron
- 现有：crontab.guru、cronmaker（web，离开 IDE）

## 轏 2：差异化检查
- 已有：crontab.guru、cronmaker、各种在线工具
- Polaris 差异化：**纯 MCP**——AI 生成 cron+解释+计算下次触发，对话内闭环。
- 与 regex 区别：regex 是正则，本插件是 cron（不同领域，但同属纯 MCP 工具类）。

## 轮 3：Polaris 扩展点组合
- 仅 MCP：`build_cron(intent)` 意图→cron、`explain_cron(expr)` 解释、`next_runs(expr, count)` 计算下次触发时间

## 轮 4：技术可行性
- 生成：模板（每日/每周/每月/每小时/每 N 分钟）
- 解释：逐字段解析
- 下次触发：手写 cron 解析器（简化 5 字段）
- 可行

## 轮 5：竞品对比
| 方案 | 离开 IDE | 下次触发 | AI 生成 | 本地 |
|------|----------|----------|---------|------|
| crontab.guru | ✓ | ✓ | ✗ | ✗ |
| **本插件** | ✗ | ✓ | ✓ | ✓ |

## 轮 6：目标用户价值
- 开发者：⭐⭐⭐⭐⭐ cron 定时任务
- 运维：⭐⭐⭐⭐ 排程验证
- 综合：高价值开发者。

## 轮 7：实现复杂度
- MCP：中（cron 解析器）
- 无 Panel/ChatCard
- 总体：2 轮。

## 轮 8：MVP
- build_cron(intent) 模板匹配
- explain_cron(expr) 逐字段解释
- next_runs(expr, count=5) 计算下次 N 次触发

## 轮 9：风险
- cron 解析复杂（L/W/# 等修饰）→ MVP 只支持标准 5 字段 + */步进

## 轮 10：决策
✅ 通过。开发 `polaris.cron`（cron 构建器）。
- 扩展点：仅 MCP
