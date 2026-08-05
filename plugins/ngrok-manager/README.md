# ngrok Manager

按端口启动/管理多个 ngrok HTTP 隧道:Polaris 插件。

## 功能

- **多隧道同时管理**:单进程内多条隧道共享 session,各自独立公网 URL(free 计划支持)
- 每条隧道可选**随机域名**或**固定保留域名**
- 公网 URL 一键复制 / 打开浏览器
- 隧道状态、JSON 日志实时可见
- AI 可经 MCP 工具调用(`ngrok_start` / `ngrok_stop` / `ngrok_list` / `ngrok_stop_all`)
- 响应式面板,适配桌面与手机

## ⚠ 前置条件

本插件**不自带 ngrok**,需电脑预装并配置 authtoken:

1. **安装 ngrok**:从 https://ngrok.com/download 下载,解压到任意目录,加入 PATH(或在插件设置中填 `ngrok.exe` 绝对路径)
2. **配置 authtoken**:从 https://dashboard.ngrok.com/get-started/your-authtoken 获取 token,在终端运行:
   ```sh
   ngrok config add-authtoken <your-token>
   ```
   这会写入 `C:\Users\<user>\AppData\Local\ngrok\ngrok.yml`(Windows)或 `~/.config/ngrok/ngrok.yml`(Unix)。

插件启动后会自检这两项,未就绪时面板顶部显示红色引导横幅,禁用启动按钮。

## 多隧道原理

ngrok free 计划限制的是 **session 数=1**,不是隧道数。本插件用**单进程 + 配置文件 `tunnels:` 段**模型,一个 ngrok 进程内启动多条隧道共享一个 session,每条独立 endpoint URL。

**代价**:增删隧道需重启 ngrok 进程,期间所有隧道短暂中断 ~2-3s。面板采用"批量编辑 + 一次应用"模式,把重启次数降到最低。

## 架构

```
ngrok-manager/
├── plugin.json            # manifest
├── server.js              # 管理器 HTTP 服务(services.http, autoStart)
├── mcp/server.js          # stdio MCP 薄壳
├── src/Panel.tsx          # 面板源码
├── dist/panel.js          # esbuild 打包产物
└── README.md
```

| 进程 | 职责 |
|------|------|
| 管理器 server.js | 隧道注册表 + 配置文件生成 + ngrok 进程生命周期 + `:4040` 轮询 + REST API |
| mcp/server.js | stdio JSON-RPC,4 工具,fetch 管理器 |
| dist/panel.js | ActivityBar 面板,fetch 管理器 |

## 开发

```sh
cd plugins/ngrok-manager
npm install
npm run build      # 打包面板到 dist/panel.js
# 或 npm run watch
```

打包插件 zip(在仓库根目录):
```sh
node scripts/pack.js plugins/ngrok-manager
```

## REST API(管理器,127.0.0.1:9870)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/__health` | 健康检查 + ngrok/authtoken 就绪状态 |
| GET/PUT | `/config` | ngrok 路径、默认域名、管理端口 |
| GET | `/tunnels` | 隧道列表 |
| POST | `/tunnels` | `{port,domain?}` 启动隧道 |
| DELETE | `/tunnels/:id` | 停止隧道 |
| DELETE | `/tunnels` | 停止全部 |
| GET | `/logs?limit=N` | 日志 |

## MCP 工具

| 工具 | 参数 | 返回 |
|------|------|------|
| `ngrok_start` | `port`(必), `domain?`, `name?` | 公网 URL |
| `ngrok_stop` | `target`(id 或 port) | ok |
| `ngrok_list` | 无 | 隧道数组 |
| `ngrok_stop_all` | 无 | ok |
