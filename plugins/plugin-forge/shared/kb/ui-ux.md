# 面板 UI 约定与移动端坑

## 结构惯例（六个已交付插件收敛出的形态）

- 默认导出组件收 `{ pluginId, onSendToChat? }`；`onSendToChat` 可把内容送进聊天输入。
- ActivityBar 图标 → 打开面板；面板内 **Tab 切换**（每个 Tab 一个文件：`Panel.tsx` 组装 + `XxxTab.tsx` 实现）。
- 设置 Tab 惯例：服务管理卡（有服务时）+ 全局设置 + 数据管理（导出/清理）。
- 面板是普通 React 18（react-jsx automatic）；**没有路由、没有全局状态库**，`useState/useEffect` + 自写 model.ts 够用。
- 样式：内联 style + 少量 CSS；颜色/字号遵守主题 token（主仓 DESIGN 约定），别硬编码。
- 图表**不引第三方库**：内联 SVG 柱状/热力图（pocket-ledger 逐日柱状图先例），几十行代码零依赖。

## 移动端/Remote 坑（手机浏览器 = 非安全上下文）

| 坑 | 表现 | 解法 |
|---|---|---|
| `navigator.clipboard` 不可用 | 手机经 `http://<LAN-IP>` 访问，非 HTTPS 非安全上下文，copy API 直接没有 | 双路径：试 clipboard API，失败回退「手动复制」全选弹窗（clip-relay 先例，README 如实写明） |
| 布局挤压 | 桌面 380px 侧栏 vs 手机全屏 | `supportsFullscreen: true` + 响应式（max-width 容器、Tab 横向可滚） |
| 触控目标 | hover 依赖 | 最小可点 40px，操作用点击不用 hover |
| 长列表 | 数千条卡死 | 分页/虚拟化 + 搜索过滤在前 |

## 加载与空态

- 数据经 invoke 异步来：给 loading 态；kv 空给「首次使用」引导（告诉用户去聊天里对 AI 说哪句话能干活——MCP 型插件的获客话术）。
- 服务型插件给「服务未运行」可见状态（list_status 读不到/心跳过期）+ 自举 start 按钮（见 service-start）。

## 文案

- 全中文、说人话；报错必须含下一步动作（「去 设置→插件→xxx 看服务状态」）。
- 危险按钮红色 + 二次确认；不可逆操作写明后果。
