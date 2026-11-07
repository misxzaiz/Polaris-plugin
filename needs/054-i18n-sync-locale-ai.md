---
id: "054"
title: 多语言键同步台（i18n-sync）：locale 奇偶体检 + AI 翻译补齐审阅落盘
status: delivered
priority: high
tags: [i18n, devtools, transformation, mcp, files]
origin: manual
created: 2026-11-06
updated: 2026-11-06
spec: ""
delivered: i18n-sync v0.1.0 已交付已 push 商城可见（8e18ea8，CDN manifest/zip/index 三 200，zip sha e88ac7a3 与 index 一致）。三层验证全绿：离线单测 78/78、MCP stdio 真子进程闭环 16/16（env 死端口隔离防真 kv 污染）、真实桥冒烟 14/14。选型记录 docs/i18n-sync-selection.md（88.0 分）。
---
## 一句话

把「改了 zh.json 忘了 en.json」从 grep 手工排查变成 30 秒本地体检：扫描 locale 目录（JSON/JSONC/YAML）→ 键奇偶矩阵（缺失/多余/空值/疑似未翻译/占位符不一致）→ AI 按术语表翻译缺失键 → 审阅确认后保序落盘，全程可撤销。给做多语言应用（出海 zh→en/ja）的开发者，替代付费 SaaS 与只报告不落盘的脚本。

## 目标（做什么）

- 确定性引擎（布局识别/扁平化/奇偶比对/占位符抽取/保序序列化/undo 快照）+ MCP 五工具（scan/missing/apply/undo/glossary）+ 面板（扫描/矩阵/审阅/设置）。AI 翻译由宿主对话 AI 完成（零额外密钥），落盘强制 confirm + 占位符一致性校验 + 写前快照。

## 边界（明确不做什么）

- 不做源码 t() 键提取（二期）、不做 xlsx 导入导出、不做协作平台/TM 记忆库、不直连机器翻译 API（走宿主 AI）、ICU 复杂复数语法只抽取变量名不做求值。

## 验收（怎么算完成）

- （待补）

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-06 由 manual 记录。

2026-11-06 03:42 撞车定案：夜班 automation 与本会话并行领走 054（03:32 覆写了 plugins/i18n-sync 的 package.json/plugin.json/tsconfig 并 install/build；本会话源码完好且为主实现方）。状态置 building 由本会话收尾交付，夜班后续轮次跳过 054，避免再次覆写。

2026-11-06 03:56 交付定案：i18n-sync v0.1.0 已 push（commit 8e18ea8）+CDN 三 200，商城可见。三层验证：离线单测 78/78 + MCP 协议闭环 16/16 + 真实桥冒烟 14/14。撞车处置：夜班 03:32 覆写三个配置文件，本会话恢复自有版本 + 置 building + 快速 commit 护盘。实测坑：测试 spawn 的 MCP 子进程 kvclient 自发现会写生产 kv（env 指死端口隔离）；占位符 ICU 嵌套括号需深度感知且嵌套闭合不清空外层 head；force 语义必须打通到 planApply。顺带修复 opts.zcode-bridge versions 存量不一致。

## 验收

1) node 离线单测全绿：布局识别（file-per-locale/dir-per-locale/嵌套 ns）、扁平化（含点号字面键冲突）、奇偶矩阵（缺失/多余/空值/疑似未翻译）、占位符抽取（{{name}}/{name}/{0}/%s/%1$s/%d）与一致性校验、JSONC 剥注释状态机（字符串内 // 不误剥）、保序序列化（缩进探测/尾换行/mirror 与 preserve 双模式）、undo 快照模型、glossary 操作；2) typecheck + esbuild 构建通过（panel + service bundle + mcp bundle，js-yaml 走 yaml-lens 同款 bundle）；3) 真实桥冒烟：spawn 真服务（/api/scan→apply→undo）+ spawn 真 MCP（initialize/tools list/i18n_status→i18n_missing→i18n_apply(confirm 门与占位符校验)→i18n_undo）全闭环，夹具自造自清理；4) 五步发布链：pack→update.json→index 条目随 commit→push→CDN manifest/zip/index 三 200。
