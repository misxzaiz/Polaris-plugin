# 插件 #11 调研分析：template-vault（消息/邮件模板库）

> 10 轮分析。来源：上班族重复沟通痛点。

## 轮 1：痛点验证
- 上班族：重复写类似邮件（拒绝/催办/通知/感谢），每次从头组织语言
- 销售/客服：话术模板重复使用
- 学生：申请邮件/请假条模板
- 现有：Gmail 模板、文本扩展器（aText/PhraseExpress）

## 轮 2：差异化检查
- 已有：Gmail canned responses、aText、PhraseExpress、TextExpander
- Polaris 差异化：**本地模板库+变量填充**——存模板（{{name}}/{{date}}），AI 可调用渲染，Panel 管理。
- 与 prompt-vault 区别：prompt-vault 是 prompt 版本管理（开发用），本插件是消息/邮件模板（办公用，变量填充+分类）。
- 扩展点：MCP + Panel（无 ChatCard），轮换组合。

## 轮 3：Polaris 扩展点组合
- MCP：`save_template(name, content, category)` 存、`render_template(name, vars)` 变量填充、`list_templates(category?)`、`list_categories()`
- Panel：模板库浏览+编辑+变量填充预览
- 无 ChatCard（轮换）

## 轮 4：技术可行性
- {{var}} 替换，纯字符串
- JSON 持久化
- 可行

## 轮 5：竞品对比
| 方案 | 本地 | 变量 | 分类 | AI 渲染 | 跨场景 |
|------|------|------|------|---------|--------|
| Gmail 模板 | ✗ | ✗ | ✗ | ✗ | 仅邮件 |
| aText | ✓ | ✓ | ✓ | ✗ | 全局 |
| **本插件** | ✓ | ✓ | ✓ | ✓ | 邮件+消息 |

## 轮 6：目标用户价值
- 上班族：⭐⭐⭐⭐⭐ 邮件/消息模板
- 学生：⭐⭐⭐ 申请/请假模板
- 开发者：⭐⭐⭐ 回复模板
- 综合：高价值上班族。

## 轮 7：实现复杂度
- MCP：低
- Panel：中
- 总体：2 轮。

## 轮 8：MVP
- MCP：save_template / render_template / list_templates / list_categories / delete_template
- 字段：id/name/content/category/vars
- Panel：分类侧栏+模板列表+编辑+变量预览
- 内置种子：拒绝/催办/通知/感谢/请假

## 轮 9：风险
- 与 prompt-vault 重叠 → 场景不同（消息模板 vs prompt），分类与种子明确区分

## 轮 10：决策
✅ 通过。开发 `polaris.template`（消息模板库）。
- 扩展点：MCP + Panel（无 ChatCard）
