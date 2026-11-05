---
id: "058"
title: jq 查询台（jq-query）：真实 jq 引擎的 JSON 查询/变换调试台
status: delivered
priority: high
tags: [dev, json, jq, 查询, 调试, ai-tools]
origin: zcode
created: 2026-11-06
updated: 2026-11-06
spec: ""
delivered: jq-query v0.1.0 已交付：真实 jq 引擎三栏调试台 + MCP 五工具，三层验证全绿+真桥冒烟通过，index.json 已收录
---
## 一句话

给开发者与 AI 一个本地确定性 JSON 查询能力：真实 jq 引擎（WASM，jq 1.7 语义）+ 本地大文件/NDJSON 查询 + 超时隔离 + MCP 四工具（jq_query/jq_check/jq_reference/json_outline），把「迭代 jq 查询」从 Windows 引号地狱与网页粘贴泄漏中解放出来。

## 目标（做什么）

- 面板三栏（输入/查询/输出）即时迭代 jq 查询：粘贴或经 cap.fs 打开本地 JSON/NDJSON（≤64MB），支持 -r/-c/-s/-n/--arg/--argjson 全 flags、多文档流、输出 pretty/compact/raw，查询历史入 kv，内置函数速查表离线可搜；服务端 worker 隔离引擎防死查询挂死；AI 经 MCP 确定性查询 JSON 文件。

## 边界（明确不做什么）

- 不做 JSONPath/JMESPath 双方言；不做可视化查询编辑器；不做 jq 模块工程化（include/import）；结果 >8MB 截断提示不做虚拟滚动。

## 验收（怎么算完成）

- 1) node --test 单测全绿（引擎保真 40+ 用例含错误语义金标/NDJSON/flags/超时杀+重生成）；2) typecheck + esbuild 构建 service/mcp/panel 全过；3) service-verify：health/401/query/NDJSON/超时 400 全过；4) mcp-verify：spawn 真进程 initialize/tools/list=4/四工具实调全过；5) 真桥冒烟（若宿主在线）；6) 发布链五步走完，CDN 双 200。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-06 由 zcode 记录。

2026-11-06 第17轮热点发现定案：候选池 A=jq查询台(90分)/B=Terraform Plan(79)/C=RAG切片预演(78.5)/D=本地X509(70)/E=.http运行台(76)，A 当选。撞车 grep 确认 jq/jmespath/jsonpath 全生态零覆盖（dev-toolbox JSON 仅格式化）。技术 spike 全绿：jq-web 0.6.2 WASM（jq 1.7 语义 40+ 用例保真，含错误 exit code/flags/正则/时间函数），worker 线程超时隔离（死查询 1.5s 杀+重生成），2.7MB 输入 ~440ms。选型文档 docs/jq-query-selection.md。端口 9883。

2026-11-06 交付：三层验证全绿（离线单测 31/31 含引擎保真金标与超时击杀回归 / typecheck+esbuild 三端构建 / MCP 真进程 + 服务真进程 + 真桥冒烟：kvclient 经真宿主 9820 自发现鉴权、meta 入真 cap.kv、真实查询闭环）。工程亮点：实锤 jq-web 0.6.2 存在跨调用 flags 粘连（-r 双向污染，粘连点在同进程共享状态，重建 WASM 实例亦无效），以 worker-per-flags组合 池化根治——每个 worker 终身只跑一种 flags 组合。发布链：pack sha256=bcc4a8ee894c42a1a8fba3ce9cbf3c2ef2ecc55a527137ff967922191e0e7fc1，index.json 条目 124 条（@main URL），待 commit+push。
