# ngrok-manager 复审验证报告

> 实测时间:2026-08-05
> 环境:Windows 11,ngrok v3.39.1,authtoken 已配于 `C:\Users\28409\AppData\Local\ngrok\ngrok.yml`
> 保留域名:`dominant-ant-formerly.ngrok-free.app`(free 计划)

## 验证矩阵

| # | 假设 | 方法 | 结果 |
|---|------|------|------|
| 1 | `--log-format=json` 输出含公网 URL | spawn `ngrok http 9821 --log=stdout --log-format=json` 读 stdout | ✅ `started tunnel` 行带 `"url":"https://5d5f-116-25-92-210.ngrok-free.app"` |
| 2 | 固定域名用 `--url=` | spawn 带 `--url=dominant-ant-formerly.ngrok-free.app` | ✅ 输出 `url: https://dominant-ant-formerly.ngrok-free.app` |
| 3 | free 计划单隧道 | 并行起第二条 | ✅ 第二条**静默卡住**,无 URL 无错误,session 不建立 |
| 4 | 本地 `:4040/api/tunnels` 可替代日志解析 | curl 本地 API | ✅ 字段清晰 `public_url`+`config.addr`,但 inspect 端口每实例递增(4040→4041) |
| 5 | 拋留代理环境致连接失败 | 注入假代理 env `HTTP_PROXY=http://127.0.0.1:1` | ✅ 复现 `dial 127.0.0.1:1 refused` |

## 关键发现

### A. inspect 端口递增(影响设计)

每起一个 ngrok 实例,本地 web service 端口自动 +1:
- 实例 1:`"addr":"127.0.0.1:4040"`
- 实例 2:`"addr":"127.0.0.1:4041"`

**结论**:不能假设管理器固定查 `:4040`。URL 获取以 JSON **日志解析**为唯一真相源(`started tunnel` 行的 `url` 字段),inspect API 不用。

### B. 进程残留(影响停止逻辑)

`kill $PID`(Git Bash 下)留下 ngrok.exe 僵尸,实测残留 3 个:
```
ngrok.exe  40828  Console  32,448 K
ngrok.exe  42684  Console  32,704 K
ngrok.exe   4404  Console  32,568 K
```
`taskkill /F /IM ngrok.exe` 全部清除。

**结论**:插件管理器停隧道必须用 `taskkill /PID xxx /T /F`(`/T` 杀整个进程树),不能只 kill 父 PID。

### C. 代理环境必清(复刻原 bat)

残留 `HTTP_PROXY` 会让 ngrok 连不上服务器:
```
{"err":"failed to dial ngrok server ... dial tcp 127.0.0.1:1: ... refused","lvl":"eror","msg":"failed to reconnect session"}
```
原 bat 的清代理逻辑不可省,spawn 时 env 必须显式删除 6 个变量:
`HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`http_proxy`/`https_proxy`/`all_proxy`

## 日志样本参考

### 启动隧道(随机域名)
```json
{"lvl":"info","msg":"no configuration paths supplied","t":"..."}
{"lvl":"info","msg":"using configuration at default config path","path":"C:\\Users\\28409\\AppData\\Local\\ngrok\\ngrok.yml","t":"..."}
{"addr":"127.0.0.1:4040","allow_hosts":null,"lvl":"info","msg":"starting web service","obj":"web","t":"..."}
{"lvl":"info","msg":"update available","obj":"updater","t":"..."}
{"lvl":"info","msg":"client session established","obj":"tunnels.session","t":"..."}
{"lvl":"info","msg":"tunnel session started","obj":"tunnels.session","t":"..."}
{"addr":"http://localhost:9821","lvl":"info","msg":"started tunnel","name":"command_line","obj":"tunnels","t":"...","url":"https://5d5f-116-25-92-210.ngrok-free.app"}
```

### 固定域名
```json
{"addr":"http://localhost:9822","lvl":"info","msg":"started tunnel","name":"command_line","obj":"tunnels","t":"...","url":"https://dominant-ant-formerly.ngrok-free.app"}
```

### 本地 API 响应(:4040/api/tunnels)
```json
{"tunnels":[{"name":"command_line","ID":"f4f758396ce761c2180918923f4964a3","uri":"/api/tunnels/command_line","public_url":"https://5d5f-116-25-92-210.ngrok-free.app","proto":"https","config":{"addr":"http://localhost:9821","inspect":true},"metrics":{...}}]}
```
