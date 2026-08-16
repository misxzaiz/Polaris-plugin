# Demo Shell Override

> 验证 Polaris **toolProviders 扩展点覆盖硬编码工具** 的 demo 插件。

## 功能

覆盖 SimpleAI 内置的 **bash 工具**（硬编码工具覆盖）。安装并启用后，AI 调用 bash 工具时**不再走内置实现**，而是路由到此插件的 `demo-audit-shell` MCP server。

此插件的 MCP server 行为：
- ✅ 暴露 `bash` 工具（与内置同名）
- ✅ 拦截危险命令（`rm -rf /` / `format C:` / fork bomb 等）
- ✅ 安全命令执行后记录到 `audit.log`
- ✅ 返回 stdout/stderr/exit_code

## 覆盖机制（硬编码工具）

```
插件声明:
  contributes.toolProviders: [{
    capability: "shell",           ← 映射到虚拟 server "polaris-bash"
    mcpServerId: "demo-audit-shell"
  }]

Polaris 解析 (apply_tool_provider_overrides):
  1. capability_to_builtin_servers("shell") → ["polaris-bash"]（虚拟 server）
  2. 内置无 "polaris-bash" MCP server，只注入不移除
  3. 注入插件 server，server_name 改为 "polaris-bash"

SimpleAI dispatch (ToolRegistry::dispatch):
  1. 调用 bash 工具
  2. 检查 builtin_tool_virtual_server("bash") → "polaris-bash"
  3. 检查 mcp_pool 是否有 "mcp__polaris-bash__bash"
  4. 有 → 路由到插件 MCP server（覆盖生效）
  5. 无 → 走内置硬编码 bash（默认行为）
```

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| bash 被覆盖 | AI 调用 bash → 走 demo MCP server |
| 危险命令拦截 | `rm -rf /` 被拦截，返回错误 |
| 审计日志 | `audit.log` 出现命令记录 |
| 卸载回退 | 卸载后 bash 恢复内置实现 |

## 测试

```bash
# 1. 安装并启用插件
# 2. 切换到 SimpleAI 引擎
# 3. 让 AI 执行安全命令："用 bash 执行 echo hello"
#    → 应收到 [demo-override] 前缀 + exit=0
# 4. 让 AI 执行危险命令："用 bash 执行 rm -rf /"
#    → 应被拦截，返回错误
# 5. 检查 audit.log
# 6. 卸载插件后，bash 恢复内置行为
```

## 与 todo demo 的区别

- `demo.tool-provider-override`（v0.1.0）：覆盖内置 MCP 能力（polaris-todo），替换已有 MCP server
- `demo.shell-override`（v0.2.0）：覆盖硬编码工具（bash），通过虚拟 server 机制注入
