# 插件可用 cap 速查

RouterBus 上注册了 26 个 cap（主仓 `router/` 目录，2026-10-25 对齐），但**插件实际可靠使用的是下面四个**（都经 `/api/router-dispatch` 或面板 invoke 调用，payload 第一字段是 action）。

## cap.kv —— 数据面（跨端通用，主力）

| action | payload | 返回 |
|---|---|---|
| `get` | `{ key }` | `{ value }`（不存在时 value 缺省） |
| `set` | `{ key, value }` | `{}` |
| `delete` | `{ key }` | `{}` |
| `list` | `{}` | `{ keys: string[] }` —— **全局所有键，见 keyspace 主题** |

桌面/Remote 两端都放行（实测）——跨端插件的唯一可靠数据面。

## cap.pluginServiceManager —— 服务管理

| action | payload | 说明 |
|---|---|---|
| `list_status` | `{}` | **返回裸数组**（不是 `{services:[]}`）：`[{ pluginId, serviceId, status, ... }]` |
| `start` | `{ pluginId, serviceId, installPath, contribution }` | **必须带 installPath+contribution**（见 service-start 主题） |
| `stop` / `restart` | `{ pluginId, serviceId }` | — |

## cap.pluginDiscovery —— 插件发现

| action | payload | 返回 |
|---|---|---|
| `discover` | `{}` | `{ plugins: [{ id, installPath, contributes: { services? } }] }` |

两个用途：自举 start（拿 installPath）；面板枚举已装插件。

## cap.http —— HTTP 转发（桌面专用陷阱）

```js
{ action: 'request', method, url, headers, body, bodyType: 'text'|'base64', timeoutMs }
// → { status, statusText, ok, contentType, headers, body, isBase64, url, timeMs }
```

宿主 reqwest 转发：绕 CORS/混合内容/禁发头。**Remote 源（Web/手机）默认 deny，桌面放行**——跨端插件不能依赖它，主路径用服务原生 fetch（见 cross-origin 主题）。

## 其余 cap 为什么没列

`cap.ai.chat`、`cap.git`、`cap.fs`、`cap.history` 等是主仓 AI 引擎/内部服务的通道，插件侧未开放或无权限映射；插件需要等价能力时：文件操作下沉服务进程（node 原生 fs）、AI 能力经 MCP 工具反向暴露（AI 本来就会调你的 MCP 工具）。
