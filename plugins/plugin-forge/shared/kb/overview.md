# 平台总览：三类进程与两条通道

Polaris 插件 = 一份 `plugin.json` 清单 + 最多三类进程。建插件前先认清谁在哪跑、消息怎么走——所有坑都源于把这三类进程的边界搞混。

## 三类进程

| 进程 | 跑在哪 | 声明方式 | 用途 |
|---|---|---|---|
| **面板**（panel） | 宿主 webview 里（React bundle，经 blob URL 注入） | `contributes.panel.entry` + `contributes.views[]` | 用户 UI；**没有任何 Node 能力，绝不直接 fetch 外网** |
| **后台服务**（service） | 宿主拉起的独立 node 进程 | `contributes.services[]`（type=http 带 `{{port}}` 健康端点） | 定时任务、原生 fetch（跨域根治点）、文件操作 |
| **MCP server** | 宿主拉起的独立 node 进程（stdio） | `contributes.mcpServers[]` | AI 工具层；AI 经 tools/call 操作插件 |

三类进程都可选，组合见真实插件：pocket-ledger 纯面板+MCP（零服务）；clip-relay 三类齐全；data-ark 服务做重活、MCP 七工具。

## 两条通信通道

```
面板 ──window.__POLARIS_HOST_INVOKE__('router_dispatch', {req:{target,payload}})──▶ RouterBus(cap.*)
服务/MCP ──HTTP POST /api/router-dispatch {req:{target,payload}} + Bearer md5(token)──▶ 同一个 RouterBus
```

- **同一个 cap 总线**，两种进入方式。面板走宿主注入的 invoke 通道（桌面直连 IPC，Web/手机自动带 token）；服务/MCP 进程走 HTTP bridge——**端点不注入，须自发现**（见 `service` 主题）。
- 数据共享走 **cap.kv**（SqliteStorage domain=kv）：三方读写同一个键空间，键空间纪律见 `keyspace` 主题。
- RouterBus 的 target 就是 cap 名（`cap.kv`、`cap.pluginServiceManager`…），payload 第一字段是 `action`。

## 建插件的最小闭环

1. 写 `plugin.json`（见 `manifest`）
2. 面板：`src/index.tsx` 默认导出组件 → esbuild 出 `dist/panel.js`（见 `panel`）
3. 需要联网/定时 → 服务进程（见 `service`）；需要 AI 操作 → MCP server（见 `mcp`）
4. 三方通过 cap.kv 键空间协作（契约写进 README，见 `keyspace`）
5. 验证：单测 → esbuild/tsc → 真实桥冒烟（见 `testing`）
6. 打包发布（见 `publishing`）

AI 建插件的完整 SOP 见 `workflow`。
