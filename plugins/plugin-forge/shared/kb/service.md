# 服务进程：桥自发现 + 生命周期 + 日志

## 端点自发现（平台不注入任何环境变量！）

官方文档说的 `POLARIS_HOST/PORT/TOKEN` 环境变量**不存在**（实测）。服务/MCP 进程自己定位宿主 HTTP bridge（已验证样板：page-sentinel/clip-relay/pocket-host 的 `service/kvclient.js`，插件工坊脚手架自带全文）：

```
1. env POLARIS_HOST/PORT/TOKEN（若未来宿主注入则优先生效——留这个分支）
2. anchor.json → dataRoot/config.json 取 web.port/token
   anchor 候选：%APPDATA%/Polaris/anchor.json、~/.config/Polaris/anchor.json、~/.polaris/anchor.json
   config 兜底：appConfigDir/config.json、%APPDATA%/Polaris/config.json……
3. 从 config 端口向上扫 25 个：GET /api/health 200 即命中
鉴权：Authorization: Bearer md5(web.token)
```

调用：`POST /api/router-dispatch`，body `{ req: { target, payload } }`，返回 `{ ok, result, error }`。写操作重试 ≤2 次指数退避是安全的（宿主侧单命令原子）；读操作任意重试。

**降级语义**：bridge 不可达时 tick 进降级（健康端点仍 200，meta 里标 degraded），每 60s 刷新一次端点，别把自己饿死——宿主 3 次健康检查判死后会重启你（见下）。

## 健康检查语义（type=http，实测）

- 判活：任意 2xx；默认超时 3s；检查周期 30s；**连续 3 次失败判死** → 按 `restartOnFailure`/`maxRestarts` 重启。
- `process.send({type:'ready'})` **无消费者**（文档骗人），不用实现。
- 服务代码骨架：`/__health` 恒 200（哪怕 bridge 挂了），真实健康度写 `meta` 心跳键给面板展示。
- std/worker 型：只看进程退出，别给它配 http 健康检查。

## tick 主循环模式（clip-relay 验证）

```
setInterval(tick, 4000)：
  1. 每 30s 重读 settings 键（热更新配置）
  2. kvKeys() 扫自己的前缀 → 发现新工作 + 判定是否需要立即清扫（15s 节流）
  3. 消费命令键（先删后做，见 single-writer）
  4. 每周期做周期性工作（enrich/检查/清理，礼貌限速）
  5. 每 60s 写 meta 心跳 { version, pid, startedAt, lastTickAt, bridge, degraded, settings }
```

## 日志：宿主不收集 stdout/stderr！

宿主**没有**插件服务日志 API（文档的 `__POLARIS_PLUGIN_SERVICES__` 未实现）。自落盘：

```js
// <appConfigDir>/<id>.log，超 512KB 轮转成 .old；debug 级不落盘
fs.appendFileSync(logFile, `[<id>:${level}] ${new Date().toISOString()} ${msg}\n`)
```

日志是排障唯一手段——把「自发现命中端口 via scan/env」「每次判死的错误」都写进去。
