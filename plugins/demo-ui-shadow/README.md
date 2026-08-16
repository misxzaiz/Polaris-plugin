# Demo UI Shadow

> 验证 Polaris **UI Slot shadow 覆盖** 的 demo 插件。

## 功能

通过 `slotMode: "shadow"` 覆盖内置文件面板（`slot: "files"`）。安装启用后，点击活动栏 Files 图标，显示此插件的自定义面板而非内置文件面板。

## 覆盖机制

```
插件声明:
  contributes.views: [{
    panelType: "demoUiShadow",
    slot: "files",           ← 目标内置 slot
    slotMode: "shadow"       ← 覆盖模式
  }]

Polaris 渲染 (LeftPanel):
  1. 查询 getShadowedSlot("files")
  2. 找到 → 隐藏内置 files 面板
  3. 加载插件 demoUiShadow 面板替代显示
```

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| shadow 生效 | 点击 Files → 显示 [demo-shadow] 面板 |
| 内置隐藏 | 原 File Explorer 面板不显示 |
| 卸载回退 | 卸载后恢复内置文件面板 |
