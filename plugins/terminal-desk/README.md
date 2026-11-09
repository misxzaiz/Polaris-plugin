# terminal-desk（终端）

Polaris 终端工作台插件。PTY 由宿主 `cap.terminal` 能力提供（端口零占用、零后台服务），本插件只做 UI 与编排；输出经 `terminal:output` / `terminal:exit` 事件流推送。

> 方案：主仓 `plans/terminal-plugin-spec.md`（终端插件化四阶段：共存 → 接管 → 优化 → 拆除）。

## 功能

- **多标签会话**：新建 / 切换 / 双击重命名 / 关闭；退出码徽标 + 开新会话引导
- **真 PTY 交互**：xterm.js 全保真（颜色/光标控制/Ctrl 键族），WebGL 渲染（失败自动降级）
- **脚本抽屉**：项目脚本发现（package.json scripts，按 lockfile 判 runner）+ 自定义命令（持久化到插件配置）+ 危险命令确认
- **运行命令浮层**：`Ctrl+Shift+R`（面板可见时），Enter 运行 / Ctrl+Enter 保存并运行
- **会话内搜索**：`Ctrl+F` 搜索条（Enter 下一个 / Shift+Enter 上一个）
- **主题跟随**：随宿主主题热切换（CSS 变量取色）
- **全屏**：面板右上角宿主全屏机制（manifest supportsFullscreen）
- **stdio MCP 三工具**（AI）：`terminal_list` / `terminal_run_in_new_session`（AI 在用户面板开可见会话跑命令，区别于 cap.bash 后台任务）/ `terminal_write`

## 宿主要求

主仓需含 `cap.terminal` 能力（2026-11-10 起，见 spec §四）。面板依赖宿主桥：`__POLARIS_HOST_INVOKE__`（router_dispatch）、`__POLARIS_HOST_LISTEN__`、`__POLARIS_HOST_WORKSPACE__`、`__POLARIS_THEME_API__`、`__POLARIS_WORKSPACE_API__`。

## 开发

```bash
pnpm i            # 安装依赖（xterm 族 + esbuild + typescript）
pnpm build        # esbuild bundle → dist/panel.js + CSS 同步进 plugin.json
pnpm typecheck    # tsc --noEmit（SSR 冒烟前置门槛）
pnpm test         # node --test：core 逻辑 + MCP stdio 全链路（假宿主 hermetic）
```

真机冒烟：主仓 dev-link 或本地 zip 安装（插件管理页 → 本地安装）。

## 结构

```
plugin.json          # manifest（样式内联清单由 scripts/build.mjs 同步）
src/                 # 面板（react + xterm，宿主 React shim）
shared/td-core.js    # 纯逻辑核（面板/MCP/测试三方同源）
mcp/server.js        # stdio MCP（零依赖 JSON-RPC；stdout 仅协议数据）
test/                # node --test（离线 hermetic）
```
