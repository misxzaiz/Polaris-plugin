# MultiChat —— 多设备会话插件

> Phase 2：新建会话 + 继续对话 + 实时流式跨设备广播 + **引擎/供应商/模型选择** + 手机响应式。**不改造现有 AI 对话架构**。

## 这是什么

在任何设备（桌面 / Web 浏览器 / 手机 APK）打开 MultiChat 插件面板，都能看到并操作**同一组会话**：
- 发消息 → 复用 `cap.ai.chat` 现有引擎（claude-code / simple-ai / open-code / 插件引擎…）
- **引擎/供应商/模型选择**（默认 simple-ai，面板顶部选择器；数据源：`get_engine_metadata_list` + `cap.config modelProfiles` + `get_opencode_models`）
- 实时流式回复 → `chat-event` 全员广播（所有在线设备同时收到增量）
- 续聊 → `continue` 传引擎会话 id，后端权威恢复上下文（无需自带历史）
- 会话清单 → `config.json plugins['multichat']`（各端连同一后端天然一致）

## 架构

```text
┌─ 设备 A（桌面） ────┐   ┌─ 设备 B（Web） ──────┐
│ MultiChat 面板 (React)│   │ MultiChat 面板 (React) │
│  ├ 会话列表（config）  │   │  ├ 会话列表（config）   │
│  ├ 消息流（chat-event）│   │  ├ 消息流（chat-event） │
│  └ 发送（cap.ai.chat） │   │  └ 发送（cap.ai.chat）  │
└─────────┬─────────────┘   └─────────┬───────────────┘
          └──────────┬────────────────┘
                     ▼
        ┌────────────────────────────┐
        │  Polaris 核心（宿主）        │
        │  cap.ai.chat → AI 引擎      │
        │  chat-event → event_broadcast│
        │  config plugins[multichat]  │
        └────────────────────────────┘
```

### 关键设计

| 机制 | 说明 |
|---|---|
| 事件路由 | `start`/`continue` 的 `options.contextId = "mc-<id>"`，后端原样带回 → 插件按前缀过滤，**零侵入**现有 `session-` 路由 |
| 并发纪律 | 单一写者锁：`status=running` 时第二端发送被拒（reason 可见） |
| 消息持久化 | 会话清单在 config（跨端共享）；每条消息体在本端 cap.kv（谁打开谁加载，实时流走广播） |
| 引擎会话 id | `start` 返回 → 存 `engineSessionId`；续聊直接 `continue` |
| 引擎/供应商/模型 | 默认 `simple-ai`；引擎切 `open-code` 时模型列表并入 `get_opencode_models`（免费优先） |
| 手机响应式 | ≤640px 侧栏→顶部横向会话条，输入区适配 safe-area |

### 宿主桥（主仓库最小注入）

插件面板需要两个宿主通道（主应用 `main.tsx` 已暴露）：
- `__POLARIS_HOST_INVOKE__` → `router_dispatch` / `cap.kv` / `plugin_get_config`（已有）
- `__POLARIS_HOST_LISTEN__` → `chat-event` 订阅（**本次新增，共 1 行**）

## 本地开发

```bash
cd plugins/multichat
npm install          # esbuild
npm run build        # → dist/panel.js
```

## 安装

1. 主应用保证 `__POLARIS_HOST_LISTEN__` 已暴露（需收取本插件对应版本的主应用，或已含该注入的版本）
2. 设置 → 插件 → Install from directory → 选择 `plugins/multichat`
3. ActivityBar 出现 **MultiChat** 图标 → 打开面板即可用

## Phase 3 规划（未实施）

- 会话历史搜索 / 归档 / 列表排序
- `contributes.hooks` 发送前注入上下文
- 与现有 dialog_index 桥接
- 双端 UI 会话操作并发 CAS（当前 Phase 1 单写者锁容忍）

## 已知边界

- 跨设备**实时**流式依赖各端在同一后端（桌面连 9829 / Web 连同一 server），不在同一后端的两端不互通
- 会话清单多端同时写 = 最后写者赢；Phase 1 用"发消息端独占锁"规避，双端 UI 会话操作并发未做 CAS
- 掉线重连时 WS resume 补齐最近事件（transport 内建）