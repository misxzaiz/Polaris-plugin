---
id: "056"
title: K8s 清单体检台（k8s-lens）：离线静态体检 + 弃用API + 安全基线 + 跨资源一致性
status: delivered
priority: high
tags: [kubernetes, devtools, linter, security, mcp]
origin: zcode
created: 2026-11-06
updated: 2026-11-06
spec: ""
delivered: k8s-lens v0.1.0 已交付：51 条规则三层验证全绿（离线单测 128 断言 13 组/typecheck+esbuild 双 bundle/真桥冒烟 19 断言），真实锚点=k8s 官方文档 nginx 示例 5.9/10 行级 8 缺口与 kube-score 对齐；五步发布链 pack(099f57be)/update.json/index @main/commit/push 完成
---
## 一句话

（待补）

## 目标（做什么）

- 粘贴/传入 k8s YAML 多文档清单 → 离线结构校验（apiVersion/kind 映射、弃用 API 识别）→ 30+ 条安全与最佳实践规则行级体检（privileged、hostPath、latest 镜像、缺资源限制、缺探针、明文密钥等）→ 跨资源一致性检查（selector 匹配、ConfigMap/Secret 引用完整性）→ 严重度分级 + 修复建议。MCP 四工具供 AI 校验生成的清单。

## 边界（明确不做什么）

- 不做集群连接/实时 API 查询、不做 Helm chart 解析、不做 kustomize、不做策略引擎 OPA、不联网拉取 schema——全部离线确定性规则。

## 验收（怎么算完成）

- 1) node 离线单测全绿：多文档分割/结构校验（kind-apiVersion 映射/弃用API/RFC1123名）/安全规则（privileged/runAsNonRoot/hostPath/latest/明文密钥）/可靠性规则（probes/resources/replicas）/跨资源检查（selector匹配/ConfigMap/Secret引用）/定位（docIndex+path+行号）；2) typecheck + esbuild 构建（panel+service+mcp bundle）；3) 真实桥冒烟：真服务 /api/lint 全流程 + 真 MCP initialize/tools/k8s_lint→k8s_explain 闭环，夹具自造自清理；4) 五步发布链：pack→update.json→index 条目@main→commit→push→CDN 三 200。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-06 由 zcode 记录。
