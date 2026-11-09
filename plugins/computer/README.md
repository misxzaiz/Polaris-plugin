# 电脑操作（computer）

Windows 桌面自动化 MCP server，自主仓内置插件 `polaris.computer` 外移而来。

## 工具面（19 个，与主仓金标 computer_mcp_server.rs 1:1）

screenshot / cursor_position / move_mouse / click / drag / mouse_down / mouse_up /
type_text / press_key / hold_key / scroll / wait / inspect_ui / click_element /
set_text / clipboard / find_element / list_windows / activate_window

## 平台

- **仅 Windows**（enigo / uiautomation / windows-sys / xcap）。Rust 独立二进制
  `bin/polaris-computer-mcp.exe` 随 zip 分发（源码单源在主仓
  `src-tauri/src/services/computer_mcp_server.rs` + `services/computer_control/`）。
- **Web / 非 Windows**：按不可用处理——宿主拉起 server 失败即不注入该 server
  （插件 manifest 无平台声明字段，为 SPEC 现状限制）。

## 语法

```json
{ "command": "{{pluginDir}}/bin/polaris-computer-mcp.exe", "argsTemplate": ["{{appConfigDir}}", "{{workspacePath}}"] }
```

参数当前未消费（占位兼容），server 不读配置、无面板/存储语义。
