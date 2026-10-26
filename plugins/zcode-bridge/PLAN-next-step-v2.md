# zcode-bridge 下一步规划 v2（结合已修复现状，暂不实施）

> 状态基准：2026-10-26，「好用版」面板已落地 —— 工作区选择 / 模型 chip / 权限完全访问 / guarded 模式修复 / 多轮连续可见。
> 本文档只做规划分析，不实施。

---

## 0. 一个新发现：ZCode 的回复其实很「厚」，我们在漏展示

侦察 db.sqlite 发现，ZCode 会话的 part 类型远不止 text：

```
{ "text": 17, "tool": 15, "step-start": 12, "step-finish": 11, "reasoning": 8 }
```

其中 **tool part** 结构完整（已落盘）：

```json
{
  "type": "tool",
  "tool": "Bash",
  "state": {
    "status": "completed",
    "input":  { "command": "cd ... && git diff --stat", "description": "..." },
    "output": "plans/router-governance-...  | 25 ++++++ ..."
  }
}
```

**当前面板只渲染 text + reasoning，tool / step 信息全部丢弃** → 用户看回复是一段没有上下文的文本，不知道 ZCode 跑过什么命令、改过什么文件。这是「好用」差距里最实在的一块。

---

## 1. 优先方向：工作过程可视化（建议 P0）

### 1.1 工具调用流水（最核心）
在 assistant 回复里，把 tool part 渲染成可折叠的「步骤卡片」：
```
┌─ [✓ Bash]  cd ... && git diff --stat     ← 折叠标题（工具名 + 命令首行）
│  plans/router... | 25 +++               ← 展开后显示输出（代码块）
└─────────────────────────────
```
- 事件流暂停时也可展示（text-delta 累积的同时，把 tool 事件也显示为「正在运行 Bash …」）。
- **关键收益**：用户一眼看到 ZCode 真正做了什么，而不是「它自己说了算」的回复 —— 建立信任 + 可审查。

### 1.2 reasoning 折叠
当前 reasoning 直接小字展示，会占大量空间。改为**可折叠**（默认收起，点开看思考过程），与 Claude 桌面版体验对齐。

### 1.3 step 边界
step-start/finish 可用于标示「正在执行第 N 步」，作为流水的时间锚点，暂不强求。

### 工作量：约 1-2 天（Panel 渲染 + readMessages 补 tool/step 解析 + 事件流 tool 展示）

---

## 2. 体验完善（P1）

### 2.1 会话改名 / 删除
- 会话标题现在由 ZCode 自动生成，面板只读。可加「重命名」本地覆盖 + 删除（从 db 删或标记）。
- 收益：管理会话更顺手。

### 2.2 模型切换（全力争取）
- 已确认 ZCode 的 provider 由账号体系管，`session/send` 当前只负责发内容。
- 下一步：**实测** `session/send` 是否接受 `model` 覆盖（计划已列，未验证）。若支持，面板加模型下拉；不支持则维持「展示 + 引导去 ZCode 切」。

### 2.3 断连自动重连
- 面板现在断连后要手动刷新。加自动重试（指数退避）+ 断连期间保留会话不丢。

---

## 3. 架构取舍（P2，单独评审）

### 3.1 事件表 → 渲染流 的规范化
当前事件 `kind` 是 ZCode 原始语义（text-delta / turn-complete / misc），面板直接消费。若要做 tool 可视化，建议在 server.js 做一次**统一归一化**（tool-started / tool-result / text-delta / turn-complete），面板只认归一化后的 kind，避免面板知道 ZCode 内部 payload 形状。

### 3.2 双向同步（ZCode 桌面 ↔ Polaris 面板）
实测 ZCode 会话落盘 db.sqlite 后，桌面端能收编。反向（面板操作推给桌面）尚未打通 —— 若要做「在 Polaris 里启动/关闭 ZCode 会话」需要协议研究。**放 P2**，MVP 不碰。

---

## 4. 明确不做（防过度设计）
- ❌ 不做代码 diff 内嵌渲染（tool output 已经是文本，够用）。
- ❌ 不做多会话并行编辑。
- ❌ 不把 Polaris provider 塞进 ZCode（路线 Y 未立项不碰）。
- ❌ 不在插件内自建权限系统（已由 Polaris PolicyPermission 覆盖）。

---

## 5. 建议落地顺序
| 阶段 | 内容 | 时长 |
|---|---|---|
| **P0** | 工具调用流水（tool 卡折叠 + 事件流展示）+ reasoning 折叠 | 1-2d |
| P1 | 会话改名/删除、模型切换实测、断连自动重连 | 1-2d |
| P2 | 事件归一化重构、桌面-面板双向同步研究 | 独立评审 |

**推荐先做 P0**：它直接解决「回复没上下文」的信任问题，且是只改面板 + server 的事件归一化，风险低、收益直观。