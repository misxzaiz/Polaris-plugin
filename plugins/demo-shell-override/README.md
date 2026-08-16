# Demo ToolProvider Override

> 验证 Polaris **toolProviders 扩展点** 的 demo 插件。

## 功能

覆盖内置 `polaris-todo` MCP server。安装并启用后，AI 调用 todo 工具（`create_todo` / `list_todos` / `update_todo` 等）时**不再走内置 todo MCP server**，而是路由到此插件的 `demo-audit-todo` MCP server。

此插件的 MCP server 行为：
- ✅ 实现与内置 todo 同名的 7 个工具（`list_todos` / `create_todo` / `update_todo` / `delete_todo` / `start_todo` / `complete_todo` / `get_workspace_breakdown`）
- ✅ 每次调用记录审计日志到 `audit.log`
- ✅ 返回占位结果（不真正操作 todo 存储）

## 验证什么

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory → 选择本目录 |
| toolProvider 生效 | 启用后 AI 调用 todo 工具 → 走 demo MCP server |
| 审计日志 | `audit.log` 出现调用记录 |
| 占位结果 | AI 收到 `[审计版]` 前缀的返回 |
| 卸载回退 | 卸载后 todo 调用恢复内置实现 |

## 覆盖机制

```
插件声明:
  contributes.toolProviders: [{
    capability: "todo",          ← 映射到内置 polaris-todo
    mcpServerId: "demo-audit-todo"
  }]

Polaris 解析 (resolved_simple_ai_servers):
  1. 收集 tool_providers: [{ capability: "todo", mcpServerId: "demo-audit-todo" }]
  2. capability_to_builtin_servers("todo") → ["polaris-todo"]
  3. 从 external_servers 找到 mcpServerId == "demo-audit-todo" 的条目
  4. 移除内置 polaris-todo server
  5. 注入替换 server（server_name 改为 "polaris-todo"）
  6. SimpleAI 的 mcp__polaris-todo__create_todo 调用 → 路由到 demo MCP server
```

## 测试

```bash
# 1. 在 Polaris 设置 → 插件 → Install from directory → 选此目录
# 2. 启用插件
# 3. 切换到 SimpleAI 引擎
# 4. 让 AI 创建一个 todo："帮我创建一个 todo：买牛奶"
# 5. 检查 audit.log 是否有 create_todo 记录
# 6. AI 收到的结果应包含 [审计版] 前缀
# 7. 卸载插件后，再次让 AI 创建 todo → 恢复内置行为
```

## 注意

此 demo 覆盖的是已 MCP 化的内置能力（todo）。Phase 1 的后续任务（P1-T1/T2 in-process MCP 化）完成后，`shell` / `filesystem` 等硬编码工具也能被覆盖。
