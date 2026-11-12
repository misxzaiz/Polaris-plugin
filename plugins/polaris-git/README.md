# polaris-git — Git 与版本管理插件

以插件形态提供完整的 Git 与版本管理能力，`slotMode: shadow` 接管主仓内置 `git.panel` 席位（禁用插件即回退占位说明）。

自 v0.1.0 架构改造起，**Git 引擎完全内置在本插件内**，宿主 Polaris 不再保留任何 Git 后端（无 `cap.git`、无 `git2` 依赖、无宿主 Git 状态层）。

## 组成

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| 面板 UI | `src/` → `dist/panel.js` | React 面板，涵盖变更 / 历史 / 分支 / 远程 / 标签 / Stash / .gitignore / 冲突 / 变基 |
| 本地服务 | `service/` | 零依赖 Node HTTP 服务，用系统 `git` CLI 实现全部 action |
| MCP 服务 | `mcp/` | stdio MCP，把 action 暴露为结构化工具给 AI |
| UI 挂载 | `src/index.tsx` | 导出 `registerUi(host, ctx)`，注入分支徽章 / diff 刷新 / 编辑器 SCM 数据源 |

## 能力范围

- **查询**：变更（status 分组 + 内联 diff）、历史（搜索 + 提交详情 + 文件 diff）、分支 / 远程 / 标签 / Stash（含 stash_show patch）/ .gitignore。
- **写路径**：暂存 / 取消暂存 / discard、提交（index 或 selectedFiles 定向）、分支与标签写操作、fetch / pull / push、Stash、reset / revert / cherry-pick、冲突合并、交互式变基。
- **安全网**：危险写操作前自动建 undo 快照，全量写操作落 `operations.jsonl` 流水。

共 **77 个 action，零 UNSUPPORTED**。

## 数据通道（唯一）

面板不直连端口，统一经宿主通用转发：

```
panel.js → __POLARIS_HOST_INVOKE__('router_dispatch', {
  req: {
    target: 'cap.pluginServiceManager',
    payload: { action: 'request', serviceId: 'polaris-git-service',
               path: '/dispatch', body: { action, params } }
  }
})
```

宿主按 `serviceId` 查本机运行端口，仅允许 `127.0.0.1`，插件侧无需感知端口。服务冷启动期由 `bridge.ts` 做 8×400ms 短重试。

## 宿主集成点

| 宿主能力 | 用途 |
| --- | --- |
| `contributes.services` | 声明 `polaris-git-service`（http，autoStart，失败重启上限 10） |
| `contributes.mcpServers` | 声明 `polaris-git-mcp`（stdio） |
| `contributes.uiSlots` | `fileExplorerToolbar` / `diffRefresh` / `editorScmProvider` |
| `cap.pluginServiceManager.request` | 通用 HTTP 转发到本机插件服务 |

面板通过 `ctx.appConfigDir` 落 undo 快照与操作流水；`get_status` 等读动作带 1.5s TTL 缓存。

## 构建 / 测试

```bash
npm install
npm run build      # dist/panel.js + 样式同步进 plugin.json/update.json
npm run typecheck  # tsc --noEmit
npm test           # diff 引擎 + 模型/格式 + SSR 渲染冒烟 + 服务层集成测试
npm run test:service
```

服务层测试在真实临时仓库上跑完整读写闭环（20 个用例）。
