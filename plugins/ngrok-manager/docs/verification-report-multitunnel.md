# ngrok-manager 多隧道复审补充

> 在 `verification-report.md` 基础上追加
> 时间:2026-08-05

## 核心发现:free 计划限制的是 session 数,不是隧道数

之前 v1 测并行第二条隧道失败(验证 #3),误判为"free 计划单隧道"。实际是**起了两个进程=两个 session**,free 仅允许 1 个 session。

**单进程内多隧道是允许的**——通过配置文件 `tunnels:` 段,一个进程内启动多条隧道共享同一 session,每条独立 endpoint URL。

## 追加验证矩阵

| # | 假设 | 方法 | 结果 |
|---|------|------|------|
| 6 | 单进程多隧道可行 | 配置 `tunnels: tunnel-a(9821)+tunnel-b(9822)` + `ngrok start --all` | ✅ 两条隧道各拿不同 URL:`https://1347-...ngrok-free.app` + `https://d550-...ngrok-free.app` |
| 7 | 固定+随机混合 | fixed-one 带 `domain` + random-one 不带 | ✅ `https://dominant-ant-formerly.ngrok-free.app` + `https://0d41-...ngrok-free.app` |
| 8 | `:4040/api/tunnels` 返回多隧道 | 单进程下 curl | ✅ `tunnels[]` 数组含全部,inspect 端口固定 4040(单进程不递增) |
| 9 | 隧道名从配置来 | `name` 字段 | ✅ `tunnel-a`/`fixed-one` 等,可作管理 ID |

## 配置文件样本

```yaml
version: "3"
agent:
    authtoken: 3D2S3wXKOZvkikm3sL3jbGn665x_7fxHaSJSktxhM3zTY654z
tunnels:
    tunnel-1:
        addr: 9821
        proto: http
    tunnel-2:
        addr: 9822
        proto: http
        domain: dominant-ant-formerly.ngrok-free.app
```

启动:`ngrok start --all --config=<path> --log=stdout --log-format=json`

## v2 架构调整

| 项 | v1(单隧道) | v2(多隧道) |
|---|---|---|
| 进程模型 | N 个 ngrok 进程 | **1 个 ngrok 进程**,配置文件驱动 |
| URL 获取 | JSON 日志解析 | **优先 `:4040/api/tunnels`**(单进程端口固定 4040),日志兜底 |
| 增删隧道 | spawn/kill 进程 | **重写配置文件 + 重启 ngrok 进程** |
| 隧道 ID | 自增 t1 | 配置 `name` 字段 |
| 单隧道门控 | 拒绝第二条 | 移除,改为"单 session 内多隧道" |
| 最大隧道数 | 1 | 软上限 4(建议 UI 提示,实际由账户计划决定) |

## 增删流程

```
用户增/删隧道
  ↓
管理器更新内存注册表 tunnels[]
  ↓
重写 ngrok-tunnels.yml(authtoken 段 + 当前 tunnels 段)
  ↓
taskkill /PID /T /F 旧进程(若有)
  ↓
spawn 新进程:ngrok start --all --config=... --log=stdout --log-format=json
  ↓
轮询 :4040/api/tunnels 直到所有期望隧道都拿到 URL 或 10s 超时
  ↓
更新注册表 publicUrl,status=running
```

**代价**:增删有 ~2-3s 进程重启间隔,期间所有隧道短暂中断(free 计划硬约束,无法避免;付费计划可走 edge API 无中断,不在本期)。

## 日志样本(单进程多隧道)

```json
{"lvl":"info","msg":"client session established","obj":"tunnels.session","t":"..."}
{"lvl":"info","msg":"tunnel session started","obj":"tunnels.session","t":"..."}
{"addr":"http://localhost:9821","lvl":"info","msg":"started tunnel","name":"tunnel-a","obj":"tunnels","t":"...","url":"https://1347-...ngrok-free.app"}
{"addr":"http://localhost:9822","lvl":"info","msg":"started tunnel","name":"tunnel-b","obj":"tunnels","t":"...","url":"https://d550-...ngrok-free.app"}
```

## :4040/api/tunnels 响应样本

```json
{
  "tunnels": [
    {"name":"tunnel-a","ID":"...","public_url":"https://4a67-...ngrok-free.app","proto":"https","config":{"addr":"http://localhost:9821","inspect":true},"metrics":{...}},
    {"name":"tunnel-b","ID":"...","public_url":"https://9f64-...ngrok-free.app","proto":"https","config":{"addr":"http://localhost:9822","inspect":true},"metrics":{...}}
  ]
}
```

## 风险与对策(追加)

| 风险 | 对策 |
|------|------|
| 增删时全部隧道短暂中断 | UI 明确提示"重启中,所有隧道短暂中断 ~2-3s";提供"批量编辑后一次应用"模式减少重启次数 |
| 端口冲突(同端口多条) | 启动前校验 tunnels[] 内 port 唯一 |
| 固定域名冲突(同域名多条) | 校验 domain 在 tunnels[] 内唯一;ngrok 启动会报错,日志透传 |
| 超时未拿到 URL | 10s 超时,标记 error,保留日志供排查 |
| ngrok 路径未配 | 启动前检查,面板标红拒绝 |
