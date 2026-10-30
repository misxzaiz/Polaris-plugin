---
id: "001"
title: Polaris 插件源码直连模式（dev-link）
status: analyzed
priority: high
tags: [platform, devtools]
origin: zcode
created: 2026-10-30
updated: 2026-10-30
spec: ""
delivered: ""
---
## 一句话

让 Polaris 插件支持「指向源码目录」的开发模式：注册一次，改 mcp/server.js 下个会话即生效，省掉 pack→zip→重装 的循环（对标 ZCode 工作区 MCP 指向源码目录的体验）。

## 目标（做什么）

- 插件安装/启用支持 dev-link 形态：MCP、后台服务、面板直接从源码目录加载（不复制、不改动源码）。
- 开发者把源码目录（如 `D:\space\base\Polaris-plugin\plugins\needs`）注册为 dev 插件后，迭代全程无需 pack/重装；改 `mcp/server.js` / `service/*.js` 后新进程即读到最新代码。

## 边界（明确不做什么）

- 不改远程安装主流程（zip + updateUrl + CDN），dev-link 只是本机开发者通道。
- 不做签名校验绕过或安全降级：dev 模式仅限本机、显式添加、可枚举可撤销，UI 有明确标识。
- 面板热更（改 dist/panel.js 即时生效）作为后续阶段，不进第一版；第一版以 MCP + 服务直连为准。

## 验收（怎么算完成）

- 将任一插件以 dev-link 注册后：修改其 mcp/server.js 中某工具的返回文案 → 新开 AI 会话调用该工具看到新文案，全程未执行 pack 与重装。
- Settings→插件 列表中 dev 插件有 dev 标识，且可正常停用、移除（移除不动源码目录）。
- dev 插件更新检查（check_update / apply_update）自动跳过或明确拒绝，不覆盖源码目录。

## 分析结论（2026-10-30 夜班勘察）

### 选型：采用 junction/符号链接指向源码目录，而非「复制 + 热更」

**决定性证据（已在生产实测）**：`%APPDATA%/Polaris-dev/plugins/mimo-tts` 是一个真实的符号链接（`lrwxrwxrwx ... mimo-tts -> /d/app/polaris-s/plugins/mimo-tts`），且已被宿主正常发现并加载。这证明：

1. **junction/symlink 方案可行且已在用**——`scan_plugin_root`（`plugin_service.rs:1138`）跟随链接：`entry.path()` 是链接路径，`plugin_dir.is_dir()` 解析到目标，`find_manifest_path` 读到源码 `plugin.json`，`into_discovered(source, plugin_dir)` 把链接路径作为 `install_path`。
2. **无需管理员权限**——Windows 目录 junction（`mklink /J` / `cmd /c mklink /J`）普通用户即可创建，无需开发者模式。
3. **改 server.js 即生效**——MCP stdio 每次新会话 spawn 新进程（`mcp_config_service.rs:654-722` 展开 `{{pluginDir}}` 为 `install_path`），天然读到最新源码，无需任何热更机制。
4. **零宿主发现逻辑改动**——只要 `install_root` 下有一个指向源码的链接，发现/加载/面板全部自动工作。

### 宿主机制落点（勘察自 `plugin_service.rs` / `plugin_discovery_capability.rs` / `mcp_config_service.rs`）

- **`install_path` 是一切加载根**：`mcp_config_service.rs:654`（`plugin.install_path`）、`executor/mod.rs:722`、面板、服务占位符均从它展开。dev-link 的本质 = 让 `install_path` 指向源码目录而非复制后的安装目录。
- **`cap.pluginDiscovery` 已有 `install_local`（sourcePath）/ `uninstall_local`（installPath）动作**（`plugin_discovery_capability.rs:307/379`），是 dev-link 最自然的接口挂点——新增 `dev_link` 动作，或在 `install_local` 上加 `linkMode: "copy"|"junction"`。
- **安装逻辑 `install_prepared_plugin_source`（`plugin_service.rs:1253`）总是复制**：源码 → `install_root/<id>`。dev-link 需绕过此复制，改为创建 junction。

### 安全边界（关键风险）

- **删除保护（现有行为即安全）**：`uninstall_local_plugin`（`plugin_service.rs:608-614`）先 `canonicalize_allowed_plugin_dir`（解析 junction 到真实源码目录），`is_allowed` 检查 `starts_with allowed_roots` 对**外部源码目录必然失败** → 抛 `PermissionDenied`，**不会误删源码**。这正是想要的保护，但意味着「移除 dev 插件」当前会被拒——需在 dev-link 中单独处理「移除 = 删 junction，不动源码」。
- **updateUrl 风险**：`apply_update`（`plugin_service.rs:461`）也会 `canonicalize` 解析到源码目录并尝试替换，同样会被 `allowed_roots` 拒绝。dev 插件应标记跳过更新检查。
- **状态持久化**：dev 插件若 `enabledByDefault: true` 且无 `state.json` 覆盖则默认启用（`is_plugin_mcp_enabled` 回退到 `enabled_by_default`）；需在 UI 上以独立标识区分，避免与正式安装混同。

## 待澄清（附推荐答案）

1. **dev 模式入口：设置页手动添加目录，还是 plugin.json 声明 `dev: true`？**
   → 推荐**设置页手动添加目录**（本机开发者通道，显式、可枚举、可撤销）。`plugin.json` 声明 `dev:true` 会随源码分发，语义模糊（谁都能把任意目录当插件），且与「仅限本机」矛盾。入口放 `cap.pluginDiscovery` 新动作 `dev_link`。

2. **Windows junction 需要开发者模式/权限，直接路径引用（插件安装表里存绝对源码路径）是否更稳？**
   → **不需要**。目录 junction（`mklink /J`）普通用户即可创建，已实测可行（mimo-tts 先例）。直接路径引用需要改 `install_path` 语义并绕过 `allowed_roots` 校验（会开安全口子），**不如 junction 干净**——junction 让「发现逻辑零改动」且天然带越界保护。

3. **updateUrl 更新检查是否需要自动跳过 dev 插件，避免误更新覆盖源码目录？**
   → **需要，且必须**。dev 插件应被 `check_update` / `apply_update` 明确拒绝或跳过（返回「dev 插件跳过更新」），否则 `apply_update` 会尝试替换指向源码的路径。实现方式：dev 插件在发现结果上带 `dev: true` 标记，更新动作据此短路。

## 决策记录

- 2026-10-30 需求库建立，本条为第 001 号，由 ZCode 会话记录（来源：需求库方案讨论，用户点名要「Polaris 像 ZCode 一样改 server.js 即生效」）。
- 2026-10-30 夜班分析：选型定为 **junction/符号链接指向源码目录**（非复制+热更）——已在生产实测可行（Polaris-dev/mimo-tts 先例），零宿主发现逻辑改动，改 server.js 即生效；接口挂 `cap.pluginDiscovery` 新增 `dev_link` 动作；删除/更新经 `allowed_roots` 天然保护，dev 插件更新检查须短路。
