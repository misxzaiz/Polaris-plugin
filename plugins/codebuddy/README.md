# CodeBuddy Engine for Polaris

腾讯 CodeBuddy CLI 引擎适配器（engine-v1 协议），内置 hy4-preview 混元模型（免费）。

## 前置要求

1. **Node.js** >= 18
2. **CodeBuddy CLI**：`npm install -g @tencent-ai/codebuddy-code`
3. **登录 CodeBuddy**：运行 `codebuddy` 首次启动，选择「国内站点登录」→ 手机验证码

## 安装（开发联调）

本插件随 Polaris-plugin 仓库分发，开发态以 junction 链接到宿主插件目录：

```cmd
mklink /J "%APPDATA%\Polaris-dev\plugins\codebuddy" "D:\space\base\Polaris-plugin\plugins\codebuddy"
```

或在 Polaris 设置 → 插件 → 从 zip 安装。

## 模型

manifest `contributes.engines[].models` 声明模型目录，Polaris 会话配置面板直接可选：

| 模型 ID | 说明 |
|---------|------|
| `hy4-preview` | 混元 4 预览（免费，默认） |
| `hy3` | 混元 3 |
| `deepseek-v4.1-flash` | DeepSeek V4.1 Flash |

不设置模型时 adapter 回落到 `hy4-preview`。

## v0.2.0 行为要点

- **流式全可见**：token / thinking / 工具调用 / 用量事件全部透传宿主（v0.1.0 因宿主
  `parse_event_frame` serde tag 冲突 + match 表缺口被整轮丢弃，修复在主仓
  `plugin_process_engine.rs`，配 9 个单测）
- **interrupt 真实现**：`taskkill /T /F` 进程树终止，无孤儿 CLI；宿主 interrupt 后
  ~200ms 即强杀适配器，adapter 在窗口内同步完成树杀后主动退出
- **permission_mode 尊重会话配置**：Polaris 权限模式白名单映射（auto→acceptEdits、
  dontAsk→bypassPermissions），缺省 bypassPermissions 与宿主默认一致
- **prompt 走 stdin**：不受 Windows ~32k 命令行上限约束，无 cmd.exe 特殊字符展开风险
- **session_start 即刻反馈**：不等 CLI 冷启动（实测 ~73s），宿主立即收到会话开始事件
- **tool_call_end 回填工具名**：content_block_start 建立 call_id→name 映射
- **env_overrides 透传**：测试可用 PATH 注入假 CLI（见 tests/adapter-smoke.mjs）

## 架构

```
Polaris PluginProcessEngine
  ↓ stdin (JSONL)
adapter.js (Node.js)
  ↓ spawn (cmd.exe /c codebuddy)
codebuddy -p --model <model> --output-format stream-json --include-partial-messages
  ↓ prompt 经 stdin 传入
adapter.js → AIEvent 转换（手工构造，规避 serde 内部标记枚举 tag 冲突）
  ↓ stdout (JSONL)
Polaris EventRouter → 前端
```

## 测试

```bash
node tests/adapter-smoke.mjs
```

假 CLI 冒烟（22 断言）：帧契约全序 / 权限映射 / stdin prompt / 工具名回填 /
interrupt 树杀无孤儿 / 未知方法错误响应。真 CLI 验证：`echo hi | codebuddy -p ...`
已确认 stdin prompt 模式可用。
