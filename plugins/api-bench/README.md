# 接口压测台 api-bench —— 本地 API 压测 / 实时图表 / A-B 对比

> 把「我的接口能扛多少 QPS、p95 多少、这次改动有没有变快」变成一次 30 秒的本地压测：autocannon 内核、实时图表、报告留档、AI 一句话驱动。

## 为什么是它

- 「压一下这个接口」是后端/全栈开发的高频动作，但现有工具都不轻：JMeter 要 Java + 古老 GUI + 学习曲线（"JMeter alternative" 是长青搜索主题）；k6/wrk/ab 是命令行；云压测 SaaS 要把目标暴露给第三方，内网/未发布接口根本压不了。
- 本地轻量 GUI + 对话式压测这一格是空的：接口压测台长在已经开着的 Polaris 里——零安装、零账号、内网/本机直接压、数据不出本机。
- 竞品没有的「对话式压测」：对 AI 说「用 50 并发压 localhost:8080/api 30 秒，再压一次加缓存的版本，给我对比」，压测→解读→A/B 对比一句话完成。
- 内核是 [autocannon](https://github.com/mcollina/autocannon)（Fastify 官方基准工具，纯 JS vendored 随包），不是自造轮子。

## 功能

| 能力 | 面板 | AI（MCP） | 说明 |
|---|---|---|---|
| 发起压测 | URL/方法/headers/body + 并发/时长/超时/限速/管道 | `api_bench_run` | 一句话即可（默认 10 连接 × 10s） |
| 实时进度 | 每秒 RPS 面积图 + 延迟（5s 滚动窗口 mean/p97.5）折线图 + 错误计数 | `api_bench_status` | 逐响应延迟采样（autocannon response 事件） |
| 报告 | 摘要卡 + HDR 延迟分位表（p50…p99.9）+ 状态码分布 + 中文结论 | `api_bench_report` | 面板与 AI 读同一份报告（kv `api-bench.*`） |
| 历史 | 最近 50 次列表，点开回看完整报告 | `api_bench_history` | 完整报告保留最近 20 份 |
| A/B 对比 | 历史页任选两次 → Δ 表 | `api_bench_compare` | 方向语义正确：吞吐升为优、延迟/错误降为优 |
| 中止 | ■ 按钮 | `api_bench_stop` | 报告以部分结果保留（标注「已中止」） |
| 试金石 | 三个预设一键填充 | — | `/demo/ok`、`/demo/slow?ms=`、`/demo/flaky?p=`、`/demo/echo` 内置端点，零配置验证工具链 |

**中文结论**（不是装饰，是解读）：超时/错误/非 2xx 逐项归因提示；公网目标提示压测授权；限速模式提示「结果不代表极限」；「高延迟低吞吐 → 目标可能阻塞在慢操作上」等模式识别。

## 安全与隐私（四条硬底线）

1. **服务只监听 `127.0.0.1` + token**（token 持久化于 `api-bench.meta`，重启不换）；零外网监听面。
2. **敏感头自动掩码**：Authorization/Cookie/x-api-key 等在报告、历史、AI 可见的任何地方都是 `****后4位`；完整值只在服务内存中用于当次请求 + 本地文件 `{{appConfigDir}}/api-bench/targets.json`（与宿主 config 同信任域）。
3. **护栏防失控**：连接数 ≤1000、时长 ≤300s、body ≤1MB、host/content-length 托管头拒绝、同一时刻只跑一个压测、随时可中止；**无定时压测、无自动重压**。
4. **公网目标明示**：判定为公网时面板与结论都提示「请确认拥有压测授权」（工具姿态与 ab/wrk/JMeter 一致）。

## 能力边界（明确不做）

- 分布式压测 / 多机协同 / 脚本化场景编排（JMeter BeanShell 类）。
- WebSocket / gRPC / TLS 客户端证书。
- 断言 DSL / CI 集成。
- 试金石端点压的是本插件服务进程自己：极高并发会让面板轮询变慢（同一 node 进程），属预期现象，不代表真实目标表现。

## 架构

```
面板（React，blob 注入，desktop-first）
  ├─ 数据面：cap.kv api-bench.*（宿主 invoke → router_dispatch）——meta 引导/历史/报告（跨端可读）
  └─ 字节面：POST/GET http://127.0.0.1:<meta.port>/api/*（token）——发起/停止/实时进度（800ms 轮询）
MCP（stdio）：6 个 api_bench_* 工具 → kv 单槽信箱 api-bench.cmd
  → 服务消费执行 → api-bench.res（nonce 对齐）回读（llm-probe 模式）
服务（node + vendored autocannon.cjs）
  ├─ 引擎：autocannon + response 事件（逐响应延迟/状态码）+ tick（每秒 RPS/字节）
  ├─ 试金石：/demo/ok /demo/slow /demo/flaky /demo/echo（鉴权豁免、参数上限护栏）
  └─ 持久化：latest / report.<id>(keep 20) / runs / history(50) / settings（单写者，全掩码）
```

面板与 AI 共用同一引擎与同一份报告库（`shared/bench-core.js` 校验/结论/对比逻辑同源），口径不漂移。移动端可看报告与历史（kv），发起压测 desktop-first（v0.1 边界，明示不做跨端发起）。

## 键空间契约（权威表）

| 键 | 写者 | 内容 |
|---|---|---|
| `api-bench.meta` | service | 心跳（15s 空闲/1s 运行中）：port/token/版本/实时快照 |
| `api-bench.latest` | service | 最近完成报告（headers 已掩码） |
| `api-bench.report.<runId>` | service | 完整报告（keep 20，runs 索引驱动清理） |
| `api-bench.runs` | service | 报告 id 索引（keep 20） |
| `api-bench.history` | service | 历史摘要（keep 50） |
| `api-bench.settings` | service | 默认参数（connections/durationS/timeoutS） |
| `api-bench.cmd` | 面板(备用)/MCP | 单槽命令信箱 {nonce, action, payload} |
| `api-bench.res` | service | 回执（nonce 对齐，MCP 消费后删） |

## 验证（三层全绿）

1. **离线单测** 42/42：`node test/run-tests.mjs`（校验矩阵/掩码/圈层/分位/摘要/结论/对比语义）。
2. **假桥集成** 19/19 + **MCP 协议** 10/10：`node test/service-tests.mjs && node test/mcp-tests.mjs`（内存假桥 + 真实引擎 + 真实子进程）。
3. **真桥冒烟** 6/6：`node test/smoke-real.mjs`（宿主在线时；meta 落真实 kv → 真实压测试金石 → MCP 真子进程 → 掩码不变量 → 全绿自清理）。
4. 工程门槛：`tsc --noEmit`（strict）+ esbuild 面板构建通过；zip 打包根含 plugin.json。

## 已知限制

- autocannon 为 HTTP/1.1 内核：HTTP/2 目标按 HTTP/1.1 语义压测（分位数仍有效，吞吐结构不同）。
- 延迟分位为 autocannon 原生档位（p2.5~p99.999，含 p97.5 无 p95）——如实呈现，不自造 p95。
- Windows 下 maxSockets 由 autocannon 连接数决定；对同机目标的高并发压测受本机 ephemeral port 限制（~1.6 万）。
