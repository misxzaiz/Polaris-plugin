# Demo Smart SubAgent

> 验证 toolProviders 覆盖 subagent 能力（dispatch_agent 工具）。

## 功能

覆盖内置 `dispatch_agent` 工具，模拟智能子代理派发：
- 返回模拟结果 + token 计费摘要
- 不真正 spawn 子会话
- 显示输入/输出 token 估计 + 成本估算

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| dispatch_agent 被覆盖 | AI 派发子代理 → 返回模拟结果 + token 计费 |
| 不 spawn 子会话 | 无真实子代理进程 |
| 卸载回退 | 卸载后恢复真实 dispatch_agent |
