# Demo Style Input

> 验证 Polaris **样式覆盖扩展点** 的 demo 插件。

## 功能

通过 `contributes.styles` 注入 CSS，改造聊天输入框样式：
- `input-glow`：圆角 + 渐变背景 + 聚焦光晕（紫色主题）
- `input-typography`：字体排版微调（字号/行高/字间距/placeholder 斜体）

**纯 CSS，无 MCP server，无面板**。安装启用后立即生效，输入框样式改变。

## 覆盖机制

```
插件声明:
  contributes.styles: [{
    id: "input-glow",
    css: ".chat-input-root { ... }"
  }]

Polaris 应用启动 (useAppInit):
  1. discoverInstalledPlugins → 加载插件清单
  2. applyPluginStyles() → 注入 CSS 到 <style id="plugin-css-demo.style-input-input-glow">

插件状态变化 (usePluginServiceSync):
  1. pluginStates 变化 → applyPluginStyles() 重新注入
  2. 禁用插件 → 移除对应 <style> 标签
```

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| 输入框圆角 | 顶部圆角 16px |
| 渐变背景 | 输入框顶部有淡紫色渐变 |
| 聚焦光晕 | 点击输入框时紫色光晕 |
| 字体微调 | 文字 14px + 行高 1.6 + placeholder 斜体 |
| 卸载回退 | 卸载后输入框恢复默认样式 |

## 扩展性

此机制不限于输入框，插件可注入任意 CSS 改造整个 UI：
- 改面板布局（`.left-panel`、`.activity-bar`）
- 改聊天消息样式（`.message-item`）
- 改主题配色（覆盖 CSS 变量 `--background`、`--primary`）
- 改任意组件（只要知道 DOM 类名/属性）
