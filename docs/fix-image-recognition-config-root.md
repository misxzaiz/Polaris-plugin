# 修复：图片识别插件配置存储位置不一致

> 状态：待评审
> 日期：2026-09-07
> 涉及插件：`plugins/image-recognition`
> 涉及主项目：`Polaris`（`src-tauri/src/services`）

## 1. 问题描述

在图片识别插件面板「配置」页保存 API Key 后，通过 MCP 工具 `recognize_image` 调用仍然报
`未配置 API Key`。把 Key 手工写入另一个目录后立即生效。

**表象**：面板里已配置，MCP 端读不到。

## 2. 根因（已核实源码 + 运行时证据）

### 2.1 双目录矛盾

代码中「插件配置」的写入端与读取端解析出**不同的配置文件**：

| 环节 | 实际目录 | 证据 |
|---|---|---|
| MCP server 的 `{{appConfigDir}}` | `%APPDATA%\Roaming\com.polaris.app` | MCP 进程命令行参数 |
| 面板保存（`plugin_set_config` → `config_store`） | `%APPDATA%\Roaming\Polaris\config.json`（或 `polaris\`） | 面板保存的 Key 落入 `Roaming\polaris\config.json` |
| `data_root()` 默认值（无 anchor.json） | `%APPDATA%\Roaming\Polaris`（**大写 P**） | 源码 `services/data_root.rs::default_data_root()` |

### 2.2 两条解析路径分叉

```
Tauri 桌面模式：
  app.path().app_config_dir()  →  %APPDATA%\Roaming\com.polaris.app   ← MCP 注入用这个
                                                                        （lib.rs:667 设置 state.app_config_dir）

Web/standalone + ConfigStore：
  services::data_root::data_root().config_dir()
      →  读 %APPDATA%\Polaris\anchor.json
          ├─ 有 dataRoot  → 自定义路径
          └─ 无 anchor   →  %APPDATA%\Roaming\Polaris（大写）         ← config_store 用这个
                                                                        （config_store.rs:24 取 config_dir）
```

`ConfigStore::new()`（config_store.rs:24）**只认 `data_root()`**；MCP server 注入（mcp_config_service.rs:1009）**只认传入的 `state.app_config_dir`**。两者在桌面模式下来源不同，一旦没有 anchor.json 指向同一路径，就必然写读分流。

> 补充：本机还观察到 `Roaming\polaris`（小写）与 `Roaming\Polaris`（大写 R、小写 p 目录名差异）同时存在，说明历史上有过目录改名/版本迁移，进一步加剧了「三处各存各的」。

### 2.3 为什么「手动写 com.polaris.app 后立即生效」

- MCP server 是 **启动时读一次配置**，不热加载（server.js `loadConfig()` 只在进程被 spawn 时执行）。
- 手动把 Key 写入 `com.polaris.app\config.json` 后，恰逢 MCP server 进程因调试被 kill、下次调用时按需重建，新进程读到了正确配置 → 生效。
- 这**掩盖**了「配置不在同一处」的根因，容易误判为「重启就好了」。

## 3. 修复方案（按影响面分层）

### 方案 A（推荐）：插件端统一配置读取来源

让 MCP server 优先读「插件配置的实际落盘处」，而不是依赖 `{{appConfigDir}}` 是否与 config_store 一致。

**做法**：在 `image-recognition/mcp/server.js` 的 `loadConfig()` 中，注入**多个**候选配置目录，按优先级合并：

1. 首选 `{{appConfigDir}}/config.json` 的 `plugins["image-recognition"]`
2. 兜底 `data_root` 目录（`%APPDATA%\Polaris\config.json`）同名命名空间

同时把整个插件的配置读写收敛到「设置-通用-数据存储」所指向的那一份 `config.json`。

**优点**：不改主项目，插件自愈；对本插件立即生效。
**缺点**：只是让这一个插件兼容，不是根本统一；其他插件仍可能踩同坑。

### 方案 B（根本解决，改 Polaris 主项目）：统一 config_dir 解析

在 `mcp_config_service.rs` / `lib.rs` 中，让 `app_config_dir` 注入统一收敛到 `data_root().config_dir()`：

```rust
// 现状：MCP 注入用 state.app_config_dir（桌面=Taauri path resolver=com.polaris.app）
// 改为：统一用 data_root().config_dir()（=Roaming\Polaris，与 config_store 一致）
```

同时：
- `lib.rs:667` 的 `state.app_config_dir.set(config_dir)` 改为一律 `data_root().config_dir()`，不再用 Tauri path resolver。
- 或至少让 MCP spawn 路径从 `data_root().config_dir()` 取值。

**优点**：一次性根治所有插件「配置写读分离」；与「设置-通用-数据存储」语义完全一致（用户改数据根 = 配置跟着走）。
**缺点**：需要改主项目、重新打包；可能影响存量用户路径（`com.polaris.app` 下已存配置）。

### 方案 C（短期兜底）：配置迁移 + 一致化脚本

不改代码，做一次性数据对齐：
1. 把 `Roaming\polaris\config.json` 与 `Roaming\Polaris\config.json` 的 `plugins["image-recognition"]` 复制到 `Roaming\com.polaris.app\config.json`。
2. 之后**统一在「数据存储」指明的目录**改配置，避免再写散。

**优点**：立即解决当前问题，零代码改动。
**缺点**：治标不治本，下次存配置仍可能发散；需人工维护。

### 建议组合

**方案 B（主） + 方案 A（插件侧加固）**。B 根治目录分叉；A 让插件对已有数据根 / 非统一环境更健壮，双重保险。方案 C 作为迁移过渡。

## 4. 「设置-通用-数据存储」语义确认

- `DataRoot` 是 Polaris 统一数据根，`设置→通用→数据存储` 展示的「当前位置」就是 `data_root()` 解析出的目录（DataStorageCard.tsx + dataRootService.getDataRootInfo()）。
- **所有**插件配置、调度任务、专家、对话都应按设计落在**这一份**配置里——这正是「用户期望配置信息统一放这里」的含义。
- 当前偏差根因：桌面 Tauri 模式 MCP 注入用了 `com.polaris.app`（Tauri 默认 app config dir），未走 DataRoot。

## 5. 改动清单（方案 B）

| 文件 | 改动 |
|---|---|
| `src-tauri/src/lib.rs:667` | `state.app_config_dir` 改为 `data_root().config_dir()`，删除 Tauri path resolver 分支 |
| `src-tauri/src/lib.rs:1361` | 确认 Web 模式已用 `data_root()`（保持） |
| `src-tauri/src/services/mcp_config_service.rs:1009` | `config_dir` 传入值不变（已是 app_config_dir），但来源已统一 |
| `src-tauri/src/services/plugin_config.rs` | 无需改（已用 config_store = data_root） |
| `src-tauri/src/bin/polaris_mcp.rs` | 排查是否也硬编码了旧目录 |

## 6. 验证方案

1. 配置：面板保存 API Key → 检查 `data_root().config_dir()/config.json` 中 `plugins["image-recognition"].apiKey` 存在。
2. 读取：MCP `recognize_image` 调用成功，不再报「未配置 API Key」。
3. 一致性：断网观察无回归；重启 Polaris 后 MCP server 仍读到同一份 Key。
4. 数据根迁移：用「数据存储 → 更改位置」切换数据根，重启后配置应跟随新目录。

## 7. 风险与边界

| 风险 | 缓解 |
|---|---|
| 存量用户 `com.polaris.app\config.json` 里有历史配置 | 迁移逻辑需合并（方案 C 过渡，勿覆盖） |
| 改主项目需重新打包、双端（桌面+Web）回归 | 方案 B 改动集中在 `lib.rs` 一处，影响可控 |
| 插件 server.js 硬依赖 `{{appConfigDir}}` | 方案 A 加固为多候选目录合并 |

## 8. 待确认

- [ ] 采纳方案 A / B / A+B 中的哪个组合？
- [ ] 本机当前正式版 `D:\app\polaris\polaris.exe` 与 dev 版共存，是否统一数据根由谁管理？（建议后续整理，避免再写散）