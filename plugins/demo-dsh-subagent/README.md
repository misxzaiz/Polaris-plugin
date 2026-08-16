# Demo DSH SubAgent

> 验证 toolProviders 覆盖 subagent 能力（DSH 接入）。

## 功能

覆盖内置 `dispatch_agent` 工具，模拟 DSH（DeepSeek Harness）子代理派发：
- 模拟 DSH spawn/fork provider 模式选择
- 返回 DSH 会话 ID + 派发模式
- 不真正调用 DSH CLI（需单独安装）

## 与 DSH 的关系

deepseek-harness 的 subagent provider 支持：
- **spawn**：全新子代理，独立会话上下文
- **fork**：复用历史分支，继承前缀历史

此 demo 声明将 `dispatch_agent` 转发到 DSH provider。真实接入需安装 DSH：
```bash
npm install -g @deepseek-ai/dsh
```

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| dispatch_agent 被覆盖 | AI 派发子代理 → 返回 DSH 模拟响应 |
| spawn/fork 模式 | 响应包含模式说明 |
| 卸载回退 | 卸载后恢复内置 dispatch_agent |
