# terminal-desk（终端）

Polaris 终端工作台插件。PTY 由宿主 `cap.terminal` 能力提供（端口零占用、零后台服务），本插件只做 UI 与编排；输出经 `terminal:output` / `terminal:exit` 事件流推送。

> 方案：主仓 `plans/terminal-plugin-spec.md`（四阶段：共存 → 接管 → 优化 → 拆除）。
> 差距证据：`plans/terminal-desk-gap-analysis.md`；拆除规划：`plans/terminal-desk-optimization-and-removal-plan.md`。
> 视觉基线：`plans/terminal-panel-refactor-prototype.html` v4（复刻内置真实布局）。

## 功能

**布局**（v4）：QuickRunBar(36px 常驻) → 脚本中心(顶部可折叠 ≤200px) → TabBar(36px) → 终端区；200–600px 侧栏宽度自适应，明暗主题全量跟随宿主 CSS 变量。

- **多标签会话**：挂载先经 `cap.terminal list` 恢复宿主已有 PTY 会话，无会话才新建；切换 / 双击重命名（持久化到插件配置，重挂不丢）/ 关闭 / 退出码徽标 / 左右分屏
- **真 PTY 交互**：xterm.js 全保真（WebGL 渲染失败自动降级），字体/行高/光标样式对齐内置；输出批量解码、尺寸变化才下发 `resize`
- **快速运行条**：运行中优先 / 否则最近脚本，提供运行、停止、折叠脚本中心、快速运行
- **脚本中心**：项目脚本发现（package.json scripts）+ 自定义命令（新增/编辑/复制/删除）+ 隐藏项目脚本与恢复 + 搜索 + 在外部系统终端运行（`cap.terminal open_in_external`）+ 自动运行（应用启动 / 打开工作区 / 打开终端，可设运行前确认）+ 危险命令确认
- **右键菜单**：脚本行与会话标签均有完整上下文菜单（重跑/停止/复制命令/外部终端/重命名等）
- **运行命令浮层**：`Ctrl+Shift+R`（面板可见时），Enter 运行 / Ctrl+Enter 保存并运行 / ↑↓ 选择
- **会话内搜索**：`Ctrl+F` 搜索条（Enter 下一个 / Shift+Enter 上一个 / 区分大小写）
- **专注模式**：宿主 H1 真全屏落地前，全屏按钮隐藏工具栏让终端占满面板，Esc 退出；宿主提供 `__POLARIS_HOST_FULLSCREEN__` 后自动改走宿主委托
- **旧数据迁移**：脚本中心「导入」按钮可粘贴主仓 `config.json`（或 `terminalScripts` 片段），把内置终端的自定义脚本按工作区映射导入，按稳定 id 幂等去重，同时带出隐藏项
- **stdio MCP 三工具**（AI）：`terminal_list` / `terminal_run_in_new_session` / `terminal_write`

## 宿主契约

面板依赖宿主桥：`__POLARIS_HOST_INVOKE__`（白名单内 `router_dispatch` / `plugin_get_config` / `plugin_set_config`）、`__POLARIS_HOST_LISTEN__`、`__POLARIS_HOST_WORKSPACE__`、`__POLARIS_THEME_API__`、`__POLARIS_WORKSPACE_API__`。

**禁止**：直调已整域摘除的 `terminal_*` 命令、直调 `__TAURI_INTERNALS__.invoke`、在插件内另建 PTY 或第二套终端数据通道。

以下仍属主仓职责，本插件不绕过、也不假装已具备：

| 编号 | 宿主增量 | 插件侧现状 |
|---|---|---|
| H1 | 消费 `supportsFullscreen`，提供真全屏委托 | 降级为插件内专注模式（可用，但不出侧栏） |
| H2 | `cap.terminal export_saved_scripts` 自动导出旧脚本 | 提供手动粘贴导入，纯插件侧可用 |
| H3 | `cap.terminal rename` action | 重命名持久化在插件配置（重挂不丢，但不回写宿主会话名） |
| H4 | 放行 workspace / app_start 事件 | 用 `__POLARIS_WORKSPACE_API__.subscribe` + 挂载事件覆盖三种触发时机 |
| H5 | `terminal.panel` 席位空态、内置代码摘除 | 本轮不动主仓 |

## 开发

```bash
pnpm i               # 安装依赖（xterm 族 + esbuild + typescript）
npm run typecheck    # tsc --noEmit
npm test             # node --test：纯逻辑核 20 项 + MCP stdio 2 项（离线 hermetic）
npm run build        # esbuild → dist/panel.js；按 styles[].id 幂等同步 CSS 到 plugin.json / update.json
npm run check:styles # 样式门禁：变量必须存在于宿主 token 表、border 带 alpha、禁硬编码色值、排版/圆角/窗口透明度走宿主 token
npm run check        # 以上四步一次跑完，提交前门禁
```

**改 `src/styles.css` 后必须 `npm run build`**：内联样式是 manifest 的 `contributes.styles[].css`，旧版构建脚本只做一次性占位符替换，改源码不会同步（本轮已修为按 id 覆盖 + 一致性自检）。

真机冒烟：主仓 dev-link 或本地 zip 安装（插件管理页 → 本地安装）。

## 验收反馈修正（v0.2.2 第二轮）

对照内置 `src/components/Terminal/` 逐项复核后的两处修正：

1. **右键菜单「有但看不见」**：宿主 `LeftPanel` 的 wrapper 带 `contain: paint` + `data-panel-coordinate-domain`，是面板内所有 `fixed` 后代的 containing block。内置 `TerminalScriptPanel.tsx:238-249` 会把 `clientX/Y` 减去域墙原点，插件旧版直接塞视口坐标，导致菜单整体偏移；200px 窄侧栏下更会被 `contain:paint` 整块裁掉。现由 `menuPointFromEvent()` 统一换算，边界也按「域宽高」而非 `window.innerWidth/Height` 收敛。另把脚本行的「更多操作」入口从 `opacity:0` 改为 `0.55` 常驻，提升可发现性。
2. **脚本菜单对齐内置**：补回「复制命令」，运行项在脚本运行中显示「重新运行」（内置第三项语义，内置实现里与「运行」同指 `runScript`，故不新增重复按钮）。
3. **「土」的结构性原因**：上一轮修的是 token 名写错 / 纯白描边 / Unicode 图标这些**失效错误**；剩下的是**设计语言没对齐宿主**——插件自带 Consolas + 私有 sans 栈、5/6/7/10px 自由圆角、边框 alpha 全用宿主的 `border-subtle(0.08)`、背景不复合 `--window-opacity`、全表零 transition、无 focus 环、三层头部同色平铺。现统一改用 `--font-sans` / `--font-mono` / `--radius-*` / `--transition-fast`，主分隔线回到宿主 `border(0.15)`，背景复合窗口透明度，激活标签加 accent 顶线，并补 0.15s 过渡 / focus-visible / 按压反馈 / 细化滚动条。`scripts/check-styles.mjs` 增加对应门禁，防止回退。

真组件浏览器冒烟（模拟宿主坐标域 + 明暗主题 + 200/360/600px）：**31/31 通过**。

## 发布状态

本轮提交是 **UI/交互改造 + 构建产物同步**，`version` 仍为 `0.2.2`，未创建发布 tag、未改 CDN 下载地址。发布流程需将版本 bump 到 `0.3.0`、重打 zip、更新 `index.json` 的版本与 sha256 并创建 tag；在此之前，CDN 上仍是旧包，本地 dev-link 安装可直接验证本轮改造。

## 结构

```
plugin.json / update.json  # manifest（内联样式由 scripts/build.mjs 同步）
src/                       # 面板（React + xterm，宿主 React shim）
  Panel.tsx                # 主面板：布局 / 会话恢复 / 自动运行 / 确认队列
  ScriptCenter.tsx         # 脚本中心（替代旧版底部 ScriptDrawer）
  QuickRunBar.tsx          # 快速运行条
  Overlays.tsx             # 右键菜单 / 确认 / 导入对话框
  config.ts                # 插件配置单例（多组件共享快照，避免互相覆盖）
  bridge.ts / model.ts     # 宿主桥 / 类型与纯逻辑转发
  icons.tsx / styles.css   # 内联 SVG 图标 / 主题变量样式
shared/td-core.js          # 纯逻辑核（面板 / MCP / 测试三方同源）
mcp/server.js              # stdio MCP（零依赖 JSON-RPC；stdout 仅协议数据）
test/                      # node --test（离线 hermetic）
scripts/                   # build.mjs / check-styles.mjs
```
