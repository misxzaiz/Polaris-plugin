# plugin.json 权威规范

> 核实基准：主仓 `src/plugin-system/schema.ts`（zod strict）+ Rust `plugin_service.rs` VALID_PLUGIN_ICONS + 六个已交付插件实装。**与 docs/plugin-development-guide.md 冲突处以本文为准**。

## 顶层字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | kebab-case（`/^[a-z][a-z0-9-]*$/`），全局唯一，也是 kv 前缀建议来源 |
| `name` | ✅ | 中文短名，商城展示 |
| `version` | ✅ | semver 三段式 |
| `description` | ⚠️ | 商城与 AI 靠它理解插件；写「是什么 + 杀手锏 + 数据面」 |
| `enabledByDefault` | ⚠️ | 注意两层门：静态开关 ≠ 面板一定可见，用户设置里还要开 |
| `contributes` | ✅ | views / panel / services / mcpServers |
| `permissions` | ⚠️ | **已知集只有两个键**：`appConfigRead`、`aiToolAccess`。写了别的键会被忽略，别指望生效 |
| `origin` | ⚠️ | repository / homepage / updateUrl / downloadUrl（发布用） |

## contributes.views（ActivityBar 入口）

```json
{
  "id": "<插件id>.panel",
  "area": "activityBar",          // 白名单只有这一个值
  "panelType": "<camelCase>",     // 宿主路由用
  "icon": "Beaker",               // 必须在 18 值白名单内，否则被拒
  "labelKey": "plugins.<camel>",
  "labelDefault": "中文名",
  "order": 76                     // 已占：15/20/40/50/68/72/73/74/75/76/77/80/85/90
}
```

**图标白名单 18 值**（逐字对齐，勿自创）：
`Files, GitPullRequest, CheckSquare, Languages, Clock, Target, ClipboardList, Terminal, SquareTerminal, Code2, Bot, BookOpen, AlertCircle, Film, Globe2, Activity, Users, Beaker`

## contributes.panel

```json
{ "entry": "./dist/panel.js", "supportsFullscreen": true }
```

## contributes.services（可选）

```json
{
  "id": "<id>-service",
  "type": "http",                       // http | std | worker
  "command": "node",
  "argsTemplate": ["{{pluginDir}}/service/main.js", "{{port}}", "{{appConfigDir}}"],
  "healthCheck": "/__health",           // http 型：任意 2xx 判活，3s 超时/30s 周期/3 次判死
  "healthCheckTimeout": 5000,
  "autoStart": true,
  "restartOnFailure": true,
  "maxRestarts": 10,
  "description": "……（原生 fetch，无跨域限制）"
}
```

三个占位符：`{{pluginDir}}`（安装目录，**禁止硬编码路径**）、`{{port}}`（宿主分配的健康端点端口）、`{{appConfigDir}}`（应用配置目录，日志/自发现兜底用）。std/worker 型只看进程退出，不需要 `{{port}}`。

## contributes.mcpServers（可选）

```json
{ "id": "<id>", "transport": "stdio", "command": "node", "argsTemplate": ["{{pluginDir}}/mcp/server.js", "{{appConfigDir}}"] }
```

有 mcpServers 就要 `permissions.aiToolAccess: true`。

## origin（发布用）

```json
{
  "repository": "https://github.com/<user>/Polaris-plugin",
  "homepage": "https://github.com/<user>/Polaris-plugin/tree/main/plugins/<id>",
  "updateUrl": "https://cdn.jsdelivr.net/gh/<user>/Polaris-plugin@main/plugins/<id>/update.json",
  "downloadUrl": "https://cdn.jsdelivr.net/gh/<user>/Polaris-plugin@main/plugins/<id>/<id>.zip"
}
```

**坑**：URL 一律 `@main`。publish 脚本会把已有条目改写成 `@<tag>` 钉定地址，tag 不存在就 404——见 `publishing`。

用插件工坊的「体检」Tab 或 MCP `forge_lint` 工具可对任意清单跑 20+ 条实测规则。
