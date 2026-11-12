# browser-desk

多窗口浏览器工作台插件：驱动系统 Chrome（CDP 协议），提供 AI 实时交互与面板控制台。

## 能力

- **多标签/多窗口**：一个 Chrome 实例管理多个标签与独立窗口；`newWindow` / `mode: require_new` 开新窗口。
- **AI 会话绑定**：`agentKey` 将标签与 AI 会话绑定（30 分钟无活动自动解绑），AI 的操作自动路由到自己的标签。
- **MCP 工具面（16 个 `desk_*` 工具）**：与内置浏览器 `browser_*` 工具并存避让（共存期零歧义）。
  - 状态：`desk_status`
  - 导航：`desk_acquire` / `desk_navigate` / `desk_close` / `desk_history`
  - 搜索阅读：`desk_search`（结构化结果）/ `desk_read`（正文抽取）
  - 交互：`desk_click` / `desk_fill` / `desk_press_key` / `desk_scroll` / `desk_find`
  - 感知：`desk_screenshot` / `desk_evaluate` / `desk_watch`（页面事件长轮询）/ `desk_wait`（条件挂起等待）
- **面板**：搜索框 / 标签列表 / 搜索结果 / AI 操作日志 / 引擎状态徽章；shadow 接管宿主 `browser` 席位。
- **下载跟踪**：CDP `Browser.downloadWillBegin/Progress` 事件 → `desk_wait(downloadComplete)` / `desk_watch(kinds:['download'])`。

## 架构

```
mcp/server.js   stdio JSON-RPC（AI 主通道）→ HTTP → service/main.js
service/main.js HTTP /dispatch + /__health
service/engine.js  Chrome 生命周期 / tab 池 / agentKey 绑定 / 事件环 / 等待器
src/            React 面板（esbuild → dist/panel.js，宿主经 cap.pluginServiceManager.request 转发）
```

## 引擎获取

- Chrome 定位顺序：`BROWSER_DESK_CHROME` env → `CHROME_PATH` → 常见路径（Chrome/Edge）→ 面板给安装引导。
- puppeteer-core 不打进 zip；service 启动时探测插件目录 `node_modules`，缺失则 `npm install --no-save puppeteer-core@25`（首次约 1-2 分钟，期间面板显示「启动中」）。

## 开发

```bash
npm install        # devDeps（esbuild/typescript/react）
npm run build      # dist/panel.js + plugin.json styles 同步
npm run typecheck  # tsc --noEmit
npm test           # 单测（stub puppeteer）+ MCP 冒烟（真实 Chrome）
```

## 未承接的内置浏览器能力（webview 时代语义，CDP 下由原生替代或放弃）

圈选（marquee/region-select）、AI overlay、assert 校验、storage 直读（改用 desk_evaluate）、network body 抓取（仅摘要）。
