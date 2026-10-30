# 插件平台坑清单（夜班实施前必读；复盘后回写新坑）

> 每坑一行：症状 + 修法（出处插件）。来自历次交付的真实踩坑，实施前逐条对照。

## 平台权限与桥

- cap.http 从 Remote 会话拒绝；服务直连例外是 127.0.0.1（口袋快传跨域三路解法）。
- 插件无环境变量注入：参数一律走 manifest 占位符 `{{pluginDir}}` / `{{port}}` / `{{appConfigDir}}` / `{{workspacePath}}`。
- 旧命令 `plugin_service_*` 已删，别引用；服务自启动依赖 discover 自举（首开面板/首会话触发）。
- 面板图标取白名单 17 值（`contributes.views[].icon`），FileText 等非白名单会被拒。

## cap.kv 桥

- 返回可能双层包裹：先判 `res.ok === false`，取值时 `value in m ? m.value : m` 双重解包（weibian）。
- kv 方法名以桥实现为准，写前读一份已交付插件的 kvclient（weibian/zhifang）。
- 并行会话可能撞同一 kv 域互相覆盖（changqi/shouzha 坑）：域键带插件前缀，关键状态写前重读。

## 面板

- blob loader 曾盲重写模板内 react import 导致语法错误：面板模板一律占位符化，不写内联 import 字面量。
- 面板 bundle 超 1MB 曾被宿主 get_file_content 误杀（宿主已改 50MB 二进制读取）；仍尽量控体积。
- 面板→服务用 127.0.0.1 + token（服务 meta 写 kv，面板/MCP 读同一份事实库）。

## MCP

- 宿主侧 MCP list 接口 schema 改动后须重编 `cargo build --bin polaris-mcp`，否则 AI 看到旧 schema。
- MCP 工具参数保持一义（一参一含义），两义会造成判重/口径混乱（问津坑）。
- stdio 服务日志走 stderr，stdout 只输出协议 JSON 行。

## 打包与发布

- `node scripts/pack.js plugins/<name>` 按显式参数打包，zip 根须含 plugin.json。
- publish 脚本不新增 index 条目；重发版本注意 update.json 的 tag URL 指向（memoryforge 坑）。
- 端口监听用宿主注入 `{{port}}`；自选端口时 meta 写 port=0 需节流防抖（weibian 坑）。

## 编码与路径（Windows）

- PowerShell 无 BOM 输出按 GBK 处理会碎中文：文件读写一律 Node fs + UTF-8 无 BOM。
- 路径拼接用 path.join，比较前 path.resolve；跨目录写前做根边界校验（越界拒绝，weibian 先例）。

## 宿主侧验证门槛

- 前端 `pnpm exec tsc --noEmit`；后端 `cargo check`（src-tauri 下跑）；本机 `cargo test --lib` 不可用（Tauri DLL 限制）。
- 插件侧测试：独立 CLI harness + 临时数据根/临时目录（各插件 test/ 目录有现成 harness）。
