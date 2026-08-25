# Polaris 插件开发指南

本指南面向使用 Claude Code、Codex 等 AI 工具开发 Polaris 插件的开发者。

## 快速开始

### 最简插件（仅 MCP 工具）

```bash
mkdir my-plugin && cd my-plugin
```

**plugin.json**

```json
{
  "id": "my-tool-name",
  "name": "My Tool",
  "version": "1.0.0",
  "description": "插件描述",
  "enabledByDefault": true,
  "contributes": {
    "mcpServers": [
      {
        "id": "my-server",
        "transport": "stdio",
        "command": "node",
        "argsTemplate": ["{{pluginDir}}/mcp/server.js"]
      }
    ]
  },
  "permissions": {
    "aiToolAccess": true
  }
}
```

**mcp/server.js**

```javascript
#!/usr/bin/env node
// 最小 MCP Server：JSON-RPC 2.0 over stdin/stdout
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const tools = [{
  name: 'my_tool',
  description: '工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '输入参数' }
    },
    required: ['text']
  }
}]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    const msg = JSON.parse(line)
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'my-tool', version: '1.0.0' }
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const args = msg.params?.arguments || {}
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: `处理结果: ${args.text}` }]
      }})
    }
  }
})
```

安装方式：设置 → 插件 → Install from directory → 选择目录。

---

## plugin.json 规范

### 完整字段

```jsonc
{
  // === 必填 ===
  "id": "my-plugin",               // 全局唯一 ID，小写字母+连字符
  "name": "My Plugin",             // 显示名称
  "version": "1.0.0",              // 语义化版本

  // === 可选 ===
  "description": "插件描述",
  "enabledByDefault": true,        // 默认是否启用

  // === 功能贡献 ===
  "contributes": {
    "views": [...],                 // ActivityBar 视图入口
    "mcpServers": [...],            // MCP 工具服务器
    "panel": { "entry": "..." },    // 可视化面板入口
    "services": [...]               // 后台服务声明（见下方"插件服务管理"章节）
  },

  // === 权限声明 ===
  "permissions": {
    "workspaceRead": true,          // 读取工作区文件
    "workspaceWrite": false,        // 写入工作区文件
    "appConfigRead": false,         // 读取应用配置
    "appConfigWrite": false,        // 写入应用配置
    "network": false,               // 网络访问
    "aiToolAccess": true            // AI 工具调用
  },

  // === 来源元数据（远程安装/更新必填） ===
  "origin": {
    "repository": "https://github.com/user/repo",
    "homepage": "https://example.com",
    "updateUrl": "https://example.com/update.json",
    "downloadUrl": "https://example.com/plugin.zip"
  }
}
```

### 字段约束

| 字段 | 类型 | 约束 |
|------|------|------|
| `id` | string | 必填，全局唯一，建议 `namespace.tool-name` 格式 |
| `name` | string | 必填，非空 |
| `version` | string | 必填，语义化版本 `x.y.z` |
| `contributes.views[].panelType` | string | 必填，全局唯一，对应 LeftPanelType |
| `contributes.views[].icon` | string | 必填，见下方图标列表 |
| `contributes.views[].area` | string | 固定 `"activityBar"` |
| `contributes.mcpServers[].transport` | string | 固定 `"stdio"` |
| `contributes.panel.entry` | string | 面板 JS bundle 的相对路径 |

### 支持的图标

`Files` | `GitPullRequest` | `CheckSquare` | `Languages` | `Clock` | `Target` | `ClipboardList` | `Terminal` | `Code2` | `Bot` | `BookOpen` | `AlertCircle` | `Film` | `Activity`

### 更新机制说明

插件支持远程更新，流程如下：

1. **Polaris 客户端**读取已安装插件 `plugin.json` 中的 `origin.updateUrl`
2. GET 请求该 URL 获取最新 manifest（即 `update.json`）
3. 比较 `update.json` 中的 `version` 与本地版本
4. 若有新版，用 `update.json` 中的 `origin.downloadUrl` 下载新 zip 并替换

因此：
- **`update.json` 内容必须与最新 `plugin.json` 一致**，且版本号必须高于已安装版本才会提示更新
- `plugin.json` 与 `update.json` 必须同步更新版本号
- 每次发布新版本后，需重新打包 zip 并更新 `index.json` 中的 `version` 与 `sha256`

> 详见 [`SPEC.md`](./SPEC.md) 和 [`PUBLISHING.md`](./PUBLISHING.md)。

---

## MCP Server 开发

MCP Server 是一个独立进程，通过 stdin/stdout 与 Polaris 通信，协议为 JSON-RPC 2.0。

### 必须处理的方法

| 方法 | 说明 |
|------|------|
| `initialize` | 返回协议版本和能力声明 |
| `tools/list` | 返回工具列表 |
| `tools/call` | 执行工具调用，返回结果 |

### 模板占位符

在 `argsTemplate` 中使用：

| 占位符 | 说明 |
|--------|------|
| `{{pluginDir}}` | 插件安装目录的绝对路径 |
| `{{workspacePath}}` | 当前打开的工作区路径 |
| `{{appConfigDir}}` | Polaris 应用配置目录 |

### 返回格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "返回内容" }
    ]
  }
}
```

错误时加 `"isError": true`：

```json
{
  "content": [{ "type": "text", "text": "错误信息" }],
  "isError": true
}
```

---

## 可视化面板开发

外部插件可以提供自定义 React 面板，在 ActivityBar 点击后显示在左侧面板中。

### 文件结构

```
my-plugin/
├── plugin.json            # 插件清单
├── src/
│   └── Panel.tsx          # 面板 React 组件（源码）
├── dist/
│   └── panel.js           # 打包后的 bundle（自包含，含 React）
└── mcp/
    └── server.js          # MCP Server
```

### 面板组件规范

面板组件必须：

1. 导出一个默认的 React 函数组件
2. 接收以下 props：

```typescript
interface PluginPanelProps {
  pluginId: string           // 当前插件 ID
  onSendToChat?: (message: string) => void | Promise<void>  // 发送消息到聊天
}
```

### 源码示例

**src/Panel.tsx**

```tsx
import { useState } from 'react'

export default function MyPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>My Panel</h3>
      <div style={{ fontSize: 11, color: '#8E8E93' }}>Plugin: {pluginId}</div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        style={{ flex: 1, minHeight: 80, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontFamily: 'monospace', fontSize: 12 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOutput(input)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#B4B4B8', fontSize: 12 }}>
          处理
        </button>
        {onSendToChat && (
          <button onClick={() => onSendToChat(`处理: ${input}`)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#3B82F6', color: '#fff', fontSize: 12 }}>
            发送到聊天
          </button>
        )}
      </div>
      {output && (
        <pre style={{ padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#B4B4B8', fontFamily: 'monospace', fontSize: 12, margin: 0, overflow: 'auto' }}>
          {output}
        </pre>
      )}
    </div>
  )
}
```

### 打包

使用 esbuild 将面板打包为自包含 bundle（必须包含 React）：

```bash
npx esbuild src/Panel.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic --nodePaths=/path/to/polaris/node_modules
```

或使用 vite library mode：

```bash
npx vite build --mode plugin
```

关键要求：
- `--bundle`：所有依赖打包进一个文件
- `--format=esm`：ES Module 格式
- React 必须包含在 bundle 中（不能 external）
- 打包后文件需自包含，无外部 import

### plugin.json 面板声明

```jsonc
{
  "contributes": {
    "views": [{
      "id": "my-plugin.panel",
      "area": "activityBar",
      "panelType": "myPanelType",    // 全局唯一，注册为 LeftPanelType
      "icon": "Code2",
      "labelKey": "plugins.myPanel",
      "labelDefault": "My Panel",
      "order": 85
    }],
    "panel": {
      "entry": "./dist/panel.js"     // 面板 bundle 相对路径
    }
  }
}
```

---

## 安装与调试

### 安装方式

| 方式 | 操作 |
|------|------|
| 本地目录 | 设置 → 插件 → Install from directory → 选择目录 |
| 包文件 | 设置 → 插件 → Install package → 选择 .zip/.json |
| 远程 URL | 设置 → 插件 → 输入 URL → Install remote |

### 安装路径

| 作用域 | 路径 |
|--------|------|
| User | `~/.config/polaris/plugins/` (Linux/Mac) 或 `%APPDATA%/com.polaris.app/plugins/` (Windows) |
| Project | 当前工作区 `.polaris/plugins/` |

### 调试技巧

1. **MCP Server 调试**：直接在终端运行 `node mcp/server.js`，手动输入 JSON-RPC 消息测试
2. **面板调试**：浏览器开发者工具中查看 blob URL 对应的源码
3. **日志**：插件加载失败时，设置面板的"Manifest diagnostics"会显示具体错误
4. **刷新**：修改 plugin.json 后，在设置面板点击 Refresh 刷新插件列表

---

## 内置插件开发

内置插件直接写在 `src/plugins/` 下，编译进应用。

### 目录结构

```
src/plugins/my-plugin/
└── manifest.ts
```

### manifest.ts

```typescript
import type { PolarisPluginManifest } from '@/plugin-system/types'

export const myPluginManifest: PolarisPluginManifest = {
  id: 'polaris.myPlugin',
  name: 'My Plugin',
  version: '0.1.0',
  description: '插件描述',
  builtin: true,
  enabledByDefault: true,
  contributes: {
    views: [{
      id: 'myPlugin.panel',
      area: 'activityBar',
      panelType: 'myPanelType',
      icon: 'Bot',
      labelKey: 'labels.myPanel',
      labelDefault: 'My Panel',
      order: 85,
    }],
    mcpServers: [{
      id: 'my-mcp-server',
      transport: 'stdio',
      command: 'my_mcp_command',
      argsTemplate: ['{{appConfigDir}}', '{{workspacePath}}'],
    }],
  },
  permissions: {
    workspaceRead: true,
    aiToolAccess: true,
  },
}
```

### 注册

在 `src/plugin-system/builtinPlugins.ts` 中添加：

```typescript
import { myPluginManifest } from '@/plugins/myPlugin/manifest'

export function registerBuiltinPlugins(): void {
  pluginRegistry.register(corePluginManifest)
  pluginRegistry.register(myPluginManifest)
  // ...
}
```

如需自定义面板，还需在 `src/stores/viewStore.ts` 的 `LeftPanelType` 中添加类型（当前已改为 string，无需此步），并在 `src/components/Layout/LeftPanel.tsx` 的 `LeftPanelContent` 中添加渲染分支。

---

## 完整示例

- **无状态透传插件（推荐）**：参考 [`plugins/polaris-scheduler/`](https://github.com/misxzaiz/Polaris-plugin/tree/main/plugins/polaris-scheduler) — 包含面板 + MCP 透传 + IPC bridge 通信的完整无状态插件实现
- **基础 MCP 插件**：参考 `examples/plugins/demo-mcp-plugin/` 目录中的示例插件
- **服务插件**：参考 `plugins/polaris-git/` — 需要后台 HTTP 服务的插件示例

## 插件服务管理（Services）

部分插件需要在后台运行额外服务（如 HTTP 服务器、数据库代理、WebSocket 服务等）。Polaris 通过声明式 `services` 机制管理这些服务的完整生命周期。

### 使用场景

- 插件需要提供 HTTP API 给面板或外部工具调用
- 插件需要运行数据库代理、文件服务器等后台进程
- 插件需要 WebSocket 长连接服务

### 声明服务

在 `plugin.json` 的 `contributes` 中添加 `services` 字段：

```json
{
  "id": "relay-devkit",
  "name": "RELAY DevKit",
  "version": "1.0.0",
  "contributes": {
    "views": [...],
    "panel": { "entry": "./dist/panel.js" },
    "services": [
      {
        "id": "relay-http",
        "type": "http",
        "command": "node",
        "argsTemplate": ["{{pluginDir}}/server.js", "{{port}}"],
        "port": 9860,
        "healthCheck": "/__health",
        "healthCheckTimeout": 5000,
        "autoStart": true,
        "restartOnFailure": true,
        "maxRestarts": 3,
        "description": "RELAY HTTP 代理服务"
      }
    ]
  },
  "permissions": {
    "network": true
  }
}
```

### 服务类型

| type | 说明 | 适用场景 |
|------|------|----------|
| `http` | HTTP/HTTPS 服务器 | API 代理、文件服务、Webhook 接收 |
| `stdio` | stdin/stdout 进程 | 自定义协议通信、CLI 工具封装 |
| `worker` | 后台工作进程 | 定时任务、数据同步、日志收集 |

### 服务字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 服务唯一标识，同插件内不可重复 |
| `type` | string | 是 | 服务类型：`http` / `stdio` / `worker` |
| `command` | string | 是 | 启动命令（如 `node`、`python`、`./server`） |
| `argsTemplate` | string[] | 否 | 命令参数，支持模板占位符 |
| `port` | number | 否 | 监听端口（http 类型），不填则自动分配 |
| `healthCheck` | string | 否 | 健康检查路径（http 类型）或命令 |
| `healthCheckTimeout` | number | 否 | 健康检查超时（ms），默认 5000 |
| `autoStart` | boolean | 否 | 插件启用时自动启动，默认 `true` |
| `restartOnFailure` | boolean | 否 | 服务崩溃时自动重启，默认 `true` |
| `maxRestarts` | number | 否 | 最大重启次数，默认 3 |
| `description` | string | 否 | 服务描述，用于 UI 显示 |

### 模板占位符

`argsTemplate` 支持以下占位符：

| 占位符 | 说明 |
|--------|------|
| `{{pluginDir}}` | 插件安装目录 |
| `{{workspacePath}}` | 当前工作区路径 |
| `{{appConfigDir}}` | 应用配置目录 |
| `{{port}}` | 自动分配的端口号（http 类型） |
| `{{serviceId}}` | 当前服务 ID |

### 服务生命周期

```
插件启用 → autoStart 检查 → 启动服务 → 健康检查 → 运行中
                                                      ↓
                                              崩溃 → 自动重启 → 健康检查
                                                      ↓
                                              超过 maxRestarts → 停止
                                                      ↓
插件禁用 → 停止所有服务 → 清理资源
```

### 前端 API

插件面板可以通过 `window.__POLARIS_PLUGIN_SERVICES__` 访问服务状态：

```typescript
interface PluginServiceAPI {
  /** 获取服务状态 */
  getStatus(pluginId: string, serviceId: string): Promise<ServiceStatus>
  /** 启动服务 */
  start(pluginId: string, serviceId: string): Promise<void>
  /** 停止服务 */
  stop(pluginId: string, serviceId: string): Promise<void>
  /** 重启服务 */
  restart(pluginId: string, serviceId: string): Promise<void>
  /** 获取服务日志 */
  getLogs(pluginId: string, serviceId: string, options?: LogOptions): Promise<string[]>
}

interface ServiceStatus {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  port?: number
  pid?: number
  uptime?: number
  lastError?: string
  restartCount: number
}

interface LogOptions {
  limit?: number
  since?: number
  filter?: 'stdout' | 'stderr' | 'all'
}
```

### 完整示例：RELAY DevKit 插件

以下是一个需要 HTTP 服务的插件完整示例：

**plugin.json**
```json
{
  "id": "relay-devkit",
  "name": "RELAY DevKit",
  "version": "1.0.0",
  "description": "开发者工具箱：API 客户端、JSON 格式化、SQL 工具",
  "enabledByDefault": true,
  "contributes": {
    "views": [{
      "id": "relay-devkit.panel",
      "area": "activityBar",
      "panelType": "relayDevkit",
      "icon": "Terminal",
      "labelKey": "plugins.relayDevkit",
      "labelDefault": "DevKit",
      "order": 80
    }],
    "panel": {
      "entry": "./dist/panel.js",
      "supportsFullscreen": true
    },
    "services": [
      {
        "id": "relay-server",
        "type": "http",
        "command": "node",
        "argsTemplate": ["{{pluginDir}}/server.js", "{{port}}"],
        "healthCheck": "/__health",
        "autoStart": true,
        "restartOnFailure": true,
        "description": "RELAY 本地代理服务"
      }
    ]
  },
  "permissions": {
    "workspaceRead": true,
    "network": true,
    "aiToolAccess": true
  }
}
```

**server.js**
```javascript
#!/usr/bin/env node
import http from 'node:http';

// 从命令行参数获取端口（由框架通过 {{port}} 注入）
const PORT = parseInt(process.argv[2] || '0', 10) || 9860;

const server = http.createServer((req, res) => {
  // 健康检查端点
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }

  // 业务逻辑...
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from RELAY');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`RELAY server → http://localhost:${PORT}`);
  // 通知框架服务已就绪
  process.send?.({ type: 'ready', port: PORT });
});

// 优雅关闭
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
```

**面板中使用服务**
```tsx
import { useEffect, useState } from 'react'

export default function DevKitPanel({ pluginId }) {
  const [serviceStatus, setServiceStatus] = useState(null)

  useEffect(() => {
    const api = window.__POLARIS_PLUGIN_SERVICES__
    if (!api) return

    // 轮询服务状态
    const poll = async () => {
      const status = await api.getStatus(pluginId, 'relay-server')
      setServiceStatus(status)
    }

    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [pluginId])

  return (
    <div>
      <div>服务状态: {serviceStatus?.state ?? 'loading'}</div>
      {serviceStatus?.port && <div>端口: {serviceStatus.port}</div>}
      <button onClick={() => window.__POLARIS_PLUGIN_SERVICES__?.restart(pluginId, 'relay-server')}>
        重启服务
      </button>
    </div>
  )
}
```

### 调试技巧

1. **查看服务日志**：设置 → 插件 → 选择插件 → 查看服务日志
2. **手动测试**：在终端运行 `node server.js 9860`，确认服务正常
3. **端口冲突**：不指定端口让框架自动分配，避免冲突
4. **健康检查**：实现 `/__health` 端点返回 `{"status": "ok"}`

---

## 无状态插件模式（推荐）

Polaris 提供一套「无状态透传」插件范式，适用于大部分工具型插件。核心原则：

> **插件零进程原则**：外部插件不启动 MCP 守护进程、不监听额外 HTTP 端口、不维护自有数据目录。数据与状态由 Polaris 核心统一管理，插件只做「桥接层」。

### 适用场景

- 插件功能依赖 Polaris 核心能力（任务调度、待办、需求、对话引擎等）
- 插件需要一个可视化面板 + AI 可调用的 MCP 工具
- 插件需要与主机功能实时联动

### 桥接架构

```
┌──────────────┐      stdio JSON-RPC      ┌──────────────────┐
│ 面板 Panel   │  ──────────────────────  │   MCP Server    │
│ (React)      │                          │  (Node 薄层)     │
└──────┬───────┘                          └────────┬─────────┘
       │  fetch POST /api/<command>                 │  HTTP POST
       │  (webview)                                 │  /api/<command>
       ▼                                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Polaris IPC Bridge (Web Server)            │
│              /api/scheduler-* /api/execute ...              │
└─────────────────────────────────────────────────────────────┘
```

- **面板**：直接 `fetch` Polaris IPC bridge（`POST /api/<command>`），不走 MCP。
- **MCP Server**：AI 工具调用入口，将 `tools/call` 翻译为 IPC bridge 调用，纯透传。
- **数据**：全部由 Polaris 核心持久化（如 `tasks.json`），插件不落盘。

### 模板占位符（宿主桥接参数）

除了 MCP server 的模板占位符，无状态透传层还需要知道 Polaris 宿主地址。推荐通过环境变量注入：

```json
{
  "contributes": {
    "mcpServers": [{
      "id": "my-bridge",
      "transport": "stdio",
      "command": "node",
      "argsTemplate": ["{{pluginDir}}/mcp/server.js"]
    }]
  }
}
```

在 `mcp/server.js` 中读取：

```javascript
const POLARIS_HOST = process.env.POLARIS_HOST || '127.0.0.1'
const POLARIS_PORT = parseInt(process.env.POLARIS_PORT || '3000', 10)
const POLARIS_TOKEN = process.env.POLARIS_TOKEN || ''
```

> Polaris 应用启动时会将 `POLARIS_HOST` / `POLARIS_PORT` / `POLARIS_TOKEN` 注入 MCP server 的环境变量。无状态薄层仅需透传，不感知数据。

### 面板通过 IPC bridge 通信

面板组件运行在宿主 webview（浏览器环境），直接 `fetch` Polaris IPC bridge：

```tsx
// 获取 Polaris HTTP 基础地址（宿主注入）
const POLARIS_URL = (window as any).__POLARIS_WEB_URL__ || 'http://127.0.0.1:3000'

/** 调用 Polaris IPC bridge（下划线命令名 → kebab-case HTTP 路径） */
async function ipcCall<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const path = `/api/${command.replace(/_/g, '-')}`
  const res = await fetch(`${POLARIS_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json()
}
```

桌面端（Tauri）可回退到 `window.__TAURI_INTERNALS__.invoke`：

```tsx
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as any).__TAURI_INTERNALS__?.invoke
  if (internals) return internals(cmd, args)
  throw new Error('需在 Polaris 桌面环境运行')
}

async function listItems() {
  try { return await ipcCall('scheduler_list_tasks', {}) }
  catch (_) { return tauriInvoke('scheduler_list_tasks', {}) }
}
```

### 常用 IPC 命令

| 命令 | HTTP 路径 | 说明 |
|------|-----------|------|
| `scheduler_list_tasks` | `POST /api/scheduler-list-tasks` | 列出定时任务 |
| `scheduler_create_task` | `POST /api/scheduler-create-task` | 创建定时任务 |
| `scheduler_get_status` | `POST /api/scheduler-get-status` | 调度器状态 |
| `execute` | `POST /api/execute` | 通用执行器入口（见下章） |

---

## 通用执行器 ExecutorRegistry

Polaris 核心提供**通用执行器抽象** `ExecutorRegistry`，任何插件/任何任务类型都可以声明并使用执行器，而不必启动额外进程。

### 内置执行器

| `executorType` | 说明 | 关键参数 |
|---------------|------|----------|
| `chat` | AI 对话执行（默认） | `prompt`, `engineId`, `workDir` |
| `command` | 执行 CLI 命令 | `command`, `args`, `workDir` |
| `http` | 发起 HTTP 请求 | `url`, `method`, `headers`, `body` |

### 调用 IPC `execute`

```json
POST /api/execute
{
  "executorType": "chat",
  "prompt": "分析当前项目的依赖树",
  "engineId": "claude-code",
  "workDir": "D:\\space\\base\\Polaris",
  "contextId": "scheduler-task-123"
}
```

响应：

```json
{ "sessionId": "abc-123", "status": "started" }
```

### 在定时任务中使用

`ScheduledTask` / `CreateTaskParams` 支持 `executor_type` + `executor_params`：

```json
{
  "name": "每日代码评审",
  "triggerType": "cron",
  "triggerValue": "0 9 * * *",
  "executorType": "command",
  "executorParams": { "command": "npm run lint", "workDir": "D:\\space\\base\\Polaris" }
}
```

SchedulerDaemon 到期后通过 `ExecutorRegistry::execute` 直接执行，不依赖前端。

### 插件自定义执行器

插件可在 `plugin.json` 的 `contributes.executors` 中声明自定义执行器，注册到 `ExecutorRegistry`，自定义 `executorType` 为 `plugin:<plugin_id>:<executor_id>`。

#### 声明方式

```json
{
  "contributes": {
    "executors": [
      {
        "id": "my-executor",
        "name": "自定义执行器",
        "description": "插件自定义执行器描述",
        "command": "node",
        "argsTemplate": ["{{pluginDir}}/executor.js", "{{workspacePath}}"],
        "paramsSchema": {
          "type": "object",
          "properties": {
            "customArg": { "type": "string", "description": "自定义参数" }
          }
        }
      }
    ]
  }
}
```

- `id` — 执行器 ID（插件命名空间内唯一）
- `name` — 展示名称，会在定时任务编辑器的「执行器类型」下拉菜单中显示
- `command` — 执行命令
- `argsTemplate` — 命令参数模板，支持 `{{pluginDir}}`、`{{workspacePath}}` 等占位符
- `paramsSchema` — 可选，执行器参数 JSON Schema，描述 `customParams` 的结构，供前端渲染参数表单

#### 引用方式

在定时任务中选择该执行器，或通过 `execute` IPC 直接调用：

```json
POST /api/execute
{
  "executorType": "plugin:polaris.my-plugin:my-executor",
  "customParams": { "customArg": "value" }
}
```

执行器类型标识格式为 `plugin:<plugin_id>:<executor_id>`（自动生成），在 TaskEditor 的下拉菜单中直接选择即可。

---

## 打包与发布

### 目录结构

```
my-plugin/
├── plugin.json            # 插件清单（含 origin 元数据）
├── mcp/
│   └── server.js          # 无状态 MCP server
├── src/
│   └── Panel.tsx          # 面板 React 源码
├── dist/
│   └── panel.js           # esbuild 打包产物（自包含）
├── update.json            # CDN 更新元数据（与 plugin.json origin 一致）
└── .pluginignore          # 打包排除（node_modules/src/package*.json）
```

### 打包面板

```bash
npx esbuild src/Panel.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic
```

### 打包 zip

将 `plugin.json` + `dist/` + `mcp/` 压缩为 `my-plugin.zip`（排除 `node_modules`/`src`）。

### 三处 metadata 一致性（关键）

发布新版时，以下三处必须同步：

| 位置 | 字段 |
|------|------|
| `plugin.json` | `version`、`origin.updateUrl`、`origin.downloadUrl` |
| `update.json` | `version`、`origin.downloadUrl` |
| zip 内的 `plugin.json` | `version`（与根目录一致） |

**`update.json` 内容必须与最新 `plugin.json` 一致**，且版本号必须高于已安装版本才会提示更新。每次发布新版本后，需重新打包 zip 并更新 `index.json` 中的 `version` 与 `sha256`。

---

## 常见问题

### 面板加载失败 "Invalid hook call"

原因：面板 bundle 内嵌了独立的 React 副本，与宿主冲突。

解决：打包时 React 必须 external，由宿主提供。使用 esbuild 打包时 React 不要包含在 bundle 中。

### 面板加载失败 "Failed to fetch"

原因：`import()` 使用了 `file://` URL，浏览器安全策略阻止。

解决：确保使用 Polaris 的插件加载系统（registry.ts），它通过 Tauri 后端读取文件内容。

### MCP Server 启动失败

检查：
1. `command` 是否在 PATH 中（如 `node`）
2. `argsTemplate` 路径是否正确
3. Server 脚本是否有执行权限
4. 在终端手动运行确认无报错

### 插件服务启动失败

检查：
1. `command` 是否正确（如 `node`、`python`）
2. `argsTemplate` 路径是否正确
3. 端口是否被占用
4. 查看服务日志获取详细错误信息
5. 确认 `permissions.network` 已设置为 `true`

### 服务频繁重启

可能原因：
1. 服务启动后立即崩溃 → 检查代码错误
2. 健康检查失败 → 确认实现了健康检查端点
3. 端口冲突 → 使用自动分配端口或更换端口
