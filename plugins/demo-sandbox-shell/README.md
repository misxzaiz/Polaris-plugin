# Demo Sandbox Shell

> 验证 toolProviders 覆盖 shell 能力（沙箱模式）。

## 功能

- 限制工作目录：所有命令在 workspacePath 下执行
- 禁止网络命令：curl/wget/nc/telnet/ssh/scp/rsync 被拦截
- 禁止提权：sudo/su/runas 被拦截

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| bash 被覆盖 | AI 调用 bash → 走沙箱 MCP server |
| 工作目录限制 | 命令在 workspacePath 下执行 |
| 网络命令拦截 | `curl http://...` 被拦截 |
| 卸载回退 | 卸载后 bash 恢复内置实现 |
