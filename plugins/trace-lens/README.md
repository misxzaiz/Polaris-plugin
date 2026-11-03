# 链路追踪台（trace-lens）

把本机变成 **OpenTelemetry 兼容**的链路（trace）接收与排查工作站：任意 OTel SDK / 智能体运行时把 trace 经 **OTLP/HTTP-JSON** 发到本机接收器，全量留痕落盘；面板瀑布图看慢在哪错在哪；AI 经 MCP 五工具读树诊断。数据不出本机。

## 接入方法

OTel SDK 设两个环境变量（或对应初始化参数）：

```
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:9871
```

- Node：`@opentelemetry/exporter-trace-otlp-http`（JSON 模式）
- Python：`opentelemetry-exporter-otlp-proto-http` + 同上 env（JSON 模式）
- 任何能发 `POST /v1/traces`、`Content-Type: application/json`（ExportTraceServiceRequest JSON）的客户端都能接

> 只支持 JSON 编码（protobuf 请求会得到 415 与提示）；接收器只绑 127.0.0.1，跨机采集不是本插件场景。

## 组成

| 部件 | 说明 |
|---|---|
| 服务 | OTLP 接收器（`POST /v1/traces`），归一化落 `spans.jsonl`（8MB 轮转），tick 镜像 kv 投影 |
| 面板 | trace 列表（错误标红/耗时琥珀）+ 瀑布图（树形缩进、分段耗时、属性/事件展开）|
| MCP | `trace_lens_overview / recent / get / search / clear` 五工具 |

## 数据流（单一权威）

```
OTel SDK ──POST /v1/traces──▶ 服务（唯一写者）
                                ├─ spans.jsonl（权威全量，dataRoot 兄弟目录 polaris-trace/）
                                └─ cap.kv 投影：tl.meta（心跳+端点）/ tl.idx / tl.rec.*（概览分块）
                                               tl.trace.<id>（最近 12 条全文，面板跨端读）
面板 ──宿主 invoke──▶ cap.kv 投影；MCP ──直读──▶ spans.jsonl（全量保真）+ kv
```

- 归一化容忍 OTel JSON 方言：traceId/spanId hex（兼容 base64 bytes）、int64 字符串、kind/status 双枚举、AnyValue 全型；UnixNano→ms 用 BigInt 精确换算。
- 孤儿 span（父缺失）当根挂树，不丢数据。
- 清空/删除是危险操作：MCP 需 `confirm:true`；面板二次确认。

## 隐私与安全

- 只绑 127.0.0.1；无外发路径；不提供开放 CORS 的读 API。
- span 属性可能含 prompt / 密钥等敏感数据：日志不落 span 内容；MCP 工具描述提示 AI 转述时脱敏。

## 本地开发

```
cd plugins/trace-lens
npm install            # 面板构建依赖（服务/MCP 零依赖）
npm run build          # dist/panel.js
npm run typecheck      # tsc --noEmit
npm test               # core 单测 + 服务端到端 + MCP 冒烟
```

需求来源：Polaris 需求库 #017（智能体实时可观测性标准——OpenTelemetry for Agents，插件化落地为「接收器+瀑布面板+AI 查询」）。
