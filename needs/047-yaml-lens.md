---
id: "047"
title: YAML 调试台（yaml-lens）：解析预览 + 坑检测 + JSON 互转
status: delivered
priority: high
tags: [devtools, yaml, parser, diagnostic, checker]
origin: polaris-chat
created: 2026-11-04
updated: 2026-11-04
spec: ""
delivered: 97f7cf4
---
## 一句话

yaml-lens（YAML 调试台）：粘贴 YAML → 解析为结构预览（多文档/锚点）+ 坑检测（Norway problem：unquoted no/on/off 在 YAML 1.2 core 解析为字符串但 PyYAML/Go-yaml/k8s 按布尔处理；前导零数字、sexagesimal、版本号塌陷 1.10→1.1、大整数精度丢失、重复键带行列定位、制表符缩进、智能引号、注释吞值）+ YAML↔JSON 双向转换。MCP 四工具（parse/lint/to_json/to_yaml）+ 面板双框转换视图，排查 CI workflow/k8s manifest/docker-compose「为什么字段变成字符串/布尔」类问题。

## 目标（做什么）

- 解析 YAML（多文档/锚点/合并键）→ 结构化预览 + 逐条坑检测（跨实现语义漂移提示，注明哪些实现按 1.1 处理）+ YAML↔JSON 双向转换。纯本地计算零外联。

## 边界（明确不做什么）

- 不做 YAML→其他格式（XML/TOML/properties）转换；不做 k8s/Actions 等领域 schema 校验（只做语言层诊断）；不做自定义 tag 的语义解析（如实报告存在）；不做 YAML Formatter 重排美化（dump 已有格式选项除外）；网络零外联

## 验收（怎么算完成）

- core 单测覆盖：坑检测各规则独立向量（布尔 lookalike/前导零/sexagesimal/精度丢失/重复键/制表符/智能引号/缺空格/特殊首字符/注释吞值）、js-yaml 4 行为锁（no→字符串、1.10→1.1、重复键抛错带位置）、YAML↔JSON round-trip 结构相等断言；MCP 四工具离线 JSON-RPC 端到端含错误路径；面板 SSR 渲染断言（三视图/样例/错误态）

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-04 由 polaris-chat 记录。


- 2026-11-04 夜班实施（idea 就地实施，降级热点发现）：① 需求库剩余非交付条目全部为核心总线类（002-008 cap.*，公约明确不进插件）/主仓工程项（007/009/014/022-026/029-031）/调研类（010/016/018-021）/台账禁区（028），整库无合格插件条目 → 热点发现定案 yaml-lens：CI workflow/k8s manifest/docker-compose 高频痛点，118 插件生态无 YAML 工具撞车，与 schema-check/json-repair 工具链互补。② 解析基座锁 js-yaml 4.1.0（YAML 1.2 core 语义），esbuild bundle 进 mcp/server.js 与 dist/panel.js → 发布 zip 零 node_modules（隔离目录拷贝 server.js 冒烟验证自包含）；坑检测为自研行状态机扫描器（19 规则），与解析器是两道独立闸——js-yaml 解析成功 ≠ 无跨实现漂移坑（lint 工具同时报解析状态与静态坑）。③ 全部关键行为 2026-11-04 实测锁定而非凭文档：no/on/off→字符串（1.1 实现是布尔=Norway problem 本体）、02134→2134（PyYAML 八进制 1116）、12:34:56→字符串（PyYAML 45296）、9007199254740993→…992、重复键抛错 mark 0 基、智能引号不报错而是混入字符串数据、merge/<< 在 DEFAULT_SCHEMA 生效、dump lineWidth:-1 不折行。文案对未实测的 1.1 行为只用「PyYAML/Go yaml.v2 等实现」表述并给换算值，不写「必为」。④ jsonSafe 兜住 .inf/.nan/Date 被 JSON.stringify 静默变 null 的实测陷阱（预览与 to_json 都经它）。⑤ 两处返工：esbuild --banner 在 npm script（cmd）下拆参炸构建（省略 banner）；大整数判定位数启发式误杀 2^53-1 本体（改 Number 阈值比较，double 舍入保序）；测试「干净样本」clean: yes 本身是 bool-lookalike 命中对象（假红）——三条均回写 platform-constraints.md。

## 验收


### 执行记录（2026-11-04 夜班）
- core 单测 95/95：js-yaml 4.1.0 行为锁 17 项（实测地基）、19 规则正向/反向向量、作用域/序列项/多文档反查、块标量与跨行状态机、jsonSafe、错误归一、round-trip 结构相等
- MCP 协议离线验证 31/31：四工具真实调用，含重复键/Tab 错误行列、中文保真、多文档数组、sortKeys/长行不折叠、未知工具/未知 method/indent 越界
- 面板 SSR 渲染断言 22/22：三视图、样例 chips、坑卡严重度、解析失败卡、空文本、JSON→YAML 中文键
- 自包含冒烟：mcp/server.js 拷贝到无 node_modules 隔离目录，stdio JSON-RPC 全链路通（发布 zip 形态实证）
- 冒烟全绿 148 断言，delivered=97f7cf4（未 push，发布是人的动作）
