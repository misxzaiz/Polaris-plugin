# Demo UI Chain

> 验证 Polaris **UI Slot chain 增强** 的 demo 插件。

## 功能

通过 `slotMode: "chain"` 增强内置文件面板（`slot: "files"`）。不替换原面板，而是叠加显示 Git blame 信息。

## 覆盖机制

```
插件声明:
  contributes.views: [{
    panelType: "demoUiChain",
    slot: "files",           ← 目标内置 slot
    slotMode: "chain"        ← 增强模式（不替换，叠加）
  }]

Polaris 渲染 (LeftPanel):
  1. 查询 getChainedSlots("files")
  2. 找到 → 在内置文件面板旁/下注入插件内容
  3. 原面板保持显示（与 shadow 不同）
```

## 与 shadow 的区别

| 模式 | 行为 |
|---|---|
| shadow | 替换原面板，原面板隐藏 |
| chain | 增强原面板，两者并存 |

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| chain 生效 | 文件面板旁显示 [demo-chain] Git Blame |
| 原面板保留 | 内置 File Explorer 仍显示 |
| 卸载回退 | 卸载后只剩内置文件面板 |
