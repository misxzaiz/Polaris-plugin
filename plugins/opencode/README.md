# OpenCode Engine for Polaris

OpenCode 开源 AI 编程 CLI 引擎适配器（engine-v1 协议），多 provider / 免费模型（GLM/DeepSeek 等）。

> v0.1.0：**迁移自宿主内置引擎**（`src-tauri/src/ai/engine/opencode.rs` 已删除，见主仓
> `plans/opencode-plugin-migration.md`）。引擎 id 从 `EngineId::OpenCode`（`open-code`）
> 变为 `Custom("opencode")`，存量会话经主仓 `EngineId::parse_any` 别名映射兼容。

## 前置要求

1. **Node.js** >= 18
2. **OpenCode CLI**：`npm install -g opencode`
3. **登录/配置 provider**：`opencode auth login`（免费模型如 `opencode/glm-5.3-flash-free` 免登录）

## 安装（开发联调）

本插件随 Polaris-plugin 仓库分发，开发态以 junction 链接到宿主插件目录：

```cmd
mklink /J "%APPDATA%\Polaris-dev\plugins\opencode" "D:\space\base\Polaris-plugin\plugins\opencode"
```

或在 Polaris 设置 → 插件 → 从 zip 安装。

## 模型

manifest `contributes.engines[].models` 声明模型目录（免费优先，对齐宿主原默认）：

| 模型 ID | 说明 |
|---------|------|
| `opencode/glm-5.3-flash-free` | GLM 5.3 Flash 免费（默认） |
| `opencode/glm-5.3-flash` | GLM 5.3 Flash |
| `opencode/glm-5.3` | GLM 5.3 |
| `opencode/deepseek-v4.1-flash` | DeepSeek V4.1 Flash |
| `opencode/space-bunny` | Space Bunny |
| `opencode/minimax-m3.1-flash` | MiniMax M3.1 Flash |
| `opencode/kimi-k3.1-pro` | Kimi K3.1 Pro |

不设置模型时 adapter 回落到 `opencode/glm-5.3-flash-free`。

> 注：宿主原 `get_opencode_models` 动态拉取 476 个模型（免费优先排序），迁移后模型目录
> 由 manifest 静态声明（插件引擎无模型查询 RPC）。完整模型清单可通过 `opencode models`
> 手动获取后补录 manifest；若需完整动态能力，另行立项插件引擎模型查询协议。

## 协议要点

- `opencode run <msg> --format json --model <m> --auto --standalone [--session <id>]`
- prompt 经 stdin 传入（规避 Windows ~32k 命令行上限）
- JSONL 事件：`step_start` / `text` / `tool_use` / `step_finish` / `error`，**完成信号 = stdout EOF**
- `tool_use` 是完整快照（pending/running→start；completed/error→start+end）
- MCP：宿主 `mcp_servers` → 工作区项目级 `opencode.json` 注入（会话结束删除，恢复工作区原状）
- interrupt：`taskkill /T /F` 树杀，无孤儿 CLI

## 架构

```
Polaris PluginProcessEngine
  ↓ stdin (JSONL)
adapter.js (Node.js)
  ↓ spawn (cmd.exe /c opencode)
opencode run --format json --auto --standalone
  ↓ prompt 经 stdin 传入
adapter.js → AIEvent 转换（step_start/text/tool_use/step_finish/error → engine-v1 帧）
  ↓ stdout (JSONL)
Polaris EventRouter → 前端
```

## 测试

```bash
node tests/adapter-smoke.mjs   # 25 项契约断言（假 CLI 注入，覆盖正常轮/interrupt/error/无产出）
```
