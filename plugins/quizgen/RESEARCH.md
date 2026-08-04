# 插件 #12 调研分析：quiz-gen（即时测验生成器）

> 10 轮分析。来源：学生考前自测痛点。

## 轮 1：痛点验证
- 学生：考前需自测，但出题费时，找题库不一定匹配
- AI 能出题但无结构化呈现与交互
- 现有：Quizlet、Khan Academy（题库固定，非自定义文本生成）

## 轮 2：差异化检查
- 已有：Quizlet、Kahoot、各种 AI 出题工具
- Polaris 差异化：**即时生成+ChatCard 交互答题**——AI 从任意文本生成选择题，ChatCard interaction 答题，即时反馈。
- 与 recall 区别：recall 是间隔复习卡（持久化+FSRS 调度），本插件是一次性即时测验（无持久化，即时生成答题）。
- 扩展点：MCP + ChatCard(interaction)（无 Panel/Service）。

## 轮 3：Polaris 扩展点组合
- MCP：`generate_quiz(text, type, count)` 生成题目、`grade_answer(quiz, answer)` 评分
- ChatCard：interaction 模式，呈现题目→用户答题→respond 回填
- 无 Panel/Service

## 轮 4：技术可行性
- 生成：启发式从文本提取关键句→生成选择题（关键名词挖空+干扰项）
- 评分：字符串匹配
- 可行

## 轮 5：竞品对比
| 方案 | 自定义文本 | 即时生成 | 交互答题 | 免账号 |
|------|-----------|----------|----------|--------|
| Quizlet | ✗ | ✗ | ✓ | ✗ |
| Kahoot | ✗ | ✗ | ✓ | ✗ |
| **本插件** | ✓ | ✓ | ✓(ChatCard) | ✓ |

## 轮 6：目标用户价值
- 学生：⭐⭐⭐⭐⭐ 考前自测
- 上班族：⭐⭐⭐ 培训材料测验
- 综合：高价值学生。

## 轮 7：实现复杂度
- MCP：中（生成+评分）
- ChatCard：中（interaction）
- 总体：2-3 轮。

## 轮 8：MVP
- generate_quiz(text, type=mc|fill, count) → 题目数组
- 题型：选择题（4 选 1）、填空题（关键名词挖空）
- grade_answer(questions, answers) → 得分与详解
- ChatCard interaction：逐题答题→提交→评分反馈

## 轮 9：风险
- 生成启发式有限 → AI 可在对话侧精炼后调用
- 干扰项质量 → 从同文本其他名词取

## 轮 10：决策
✅ 通过。开发 `polaris.quizgen`（即时测验生成器）。
- 扩展点：MCP（生成+评分）+ ChatCard(interaction)（无 Panel/Service）
