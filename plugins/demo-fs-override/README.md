# Demo FileSystem Override

> 验证 Polaris **toolProviders 覆盖 filesystem 能力** 的 demo 插件。

## 功能

覆盖 SimpleAI 内置的 7 个文件系统工具：`read_file` / `write_file` / `edit_file` / `list_directory` / `search_files` / `glob` / `apply_patch`。

安装启用后，AI 调用这些工具时走此插件的 MCP server，所有操作记录到 `audit.log`，写操作不真正落盘。

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| fs 工具被覆盖 | AI 调用 read_file → 走 demo MCP server |
| 审计日志 | `audit.log` 出现操作记录 |
| 写操作不落盘 | write_file 返回"已记录"，文件不变 |
| 卸载回退 | 卸载后 fs 工具恢复内置实现 |
