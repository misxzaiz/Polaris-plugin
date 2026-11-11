# polaris-git — Git 与版本管理插件

以插件形态提供的 Git 查询与提交面板，`slotMode: shadow` 接管主仓内置 `git.panel` 席位（禁用插件即回退占位说明）。

## 能力范围（v0.1.0，按 2026-11-12 用户裁定）

- **查询**：变更（status 分组 + 内联 diff）、历史（搜索 + 提交详情 + 文件 diff）、分支 / 远程 / 标签 / Stash（含 stash_show patch）/ .gitignore —— 全部只读。
- **写路径（Phase 1 纵切）**：暂存 / 取消暂存（单文件 + 批量）→ 提交（index 或 selectedFiles 定向）。
- **不做**（后续批次待批）：discard / 分支写操作 / fetch/pull/push / 冲突合并器 / AI 提交信息（需宿主 H2）/ 编辑器 gutter（需宿主 H3）/ 中央 Tab（需宿主 H4）。

## 数据通道（唯一）

```
panel.js → __POLARIS_HOST_INVOKE__('router_dispatch', { req: { target: 'cap.git', payload } })
```

wire 类型与 `Polaris/src-tauri/src/models/git.rs` 逐字段对齐（注意 GitDiffEntry/GitRemote/GitStashEntry 为 snake_case，见 src/types.ts 头注）。

## 构建 / 测试

```bash
npm install
npm run build      # dist/panel.js + 样式同步进 plugin.json/update.json
npm run typecheck  # tsc --noEmit
npm test           # diff 引擎 + 模型/格式 + SSR 渲染冒烟
```
