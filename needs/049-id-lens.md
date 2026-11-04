---
id: "049"
title: 标识符调试台(id-lens):UUID/ULID/雪花 ID 位域解析+时间还原+规范性校验
status: delivered
priority: high
tags: [uuid, ulid, snowflake, identifier, debug, lens]
origin: polaris-chat
created: 2026-11-04
updated: 2026-11-04
spec: ""
delivered: 173d69d
---
## 一句话

面向开发者的标识符调试台:把 UUID(v1-v8)/ULID/Snowflake 雪花 ID 粘进来即可看穿一切——位域分解(时间戳/机器号/序列/版本/变体)、时间还原(Twitter/Discord 纪元可配)、规范性校验(版本位/变体位/Crockford 混淆字符/纪元耗尽)与形态互转(canonical/urn/braces/hex/十进制/ULID↔UUID128)。分布式系统排查「这个 ID 是什么时候哪台机器生成的」的真痛点,面板+MCP 双端。

## 目标（做什么）

- 提供确定性零依赖的标识符解析:家族自动识别、位域逐段解读、时间戳还原、规范性校验(版本/变体/混淆字符/纪元合理性)、标准形态互转;面板位图可视化 + MCP 四工具(id_lens_parse/bits/validate/convert)。

## 边界（明确不做什么）

- 不做 ID 批量生成(避免随机性,纯解码器);不做 v3/v5 名字散列重算(散列不可逆,如实标注);不做数据库/溯源查询;不做签名校验;零依赖纯算术(BigInt),不引 npm 库。

## 验收（怎么算完成）

- 冒烟:CLI harness 断言 ≥60 条(RFC 9562/ULID 规范已知向量、位域构造→编码→解码 round-trip 全等、Twitter/Discord 双纪元 snowflake、形态互转双向、坑规则逐条触发、BigInt 超 2^53 字符串保精度);MCP stdio JSON-RPC 喂包四工具全通;面板 esbuild 打包成功且 SSR 渲染断言通过。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-04 由 polaris-chat 记录。

- 2026-11-04 实施交付(夜班第13轮,降级热点发现路径):048 被并行会话交付后转热点发现,WebSearch 证实时间可排序标识符(UUIDv7/ULID/Snowflake)是 2026 热点且有独立解码工具生态,生态撞车 grep(70+ 插件)无此形态。关键决策:①纯解码器不做 ID 生成(避开随机性,确定性冒烟全靠「位域构造→编码→解码 round-trip」构造正向写/解析反向读两条独立路径互证);②RFC 9562 变体位 10xx 按 MSB 优先取 2 位整数值是 2 不是 1——首版构造测试也写成 0x1n<<62n(即 01b=NCS),构造与解析一致地错,真实世界 v7 样本(第四段 bcce)当场掊穿,教训:round-trip 互证对共同系统性误解盲,必须混入真实样本;③Snowflake 溢出语义由符号位承载(41 位掩码后 ts 恒 ≤maxTs,「ts 超域」在掩码后不可达,死分支已删);④isoFromEpochMs 负毫秒整日拆分必须 floor 向负无穷(-1ms=1969-12-31 的 86399999ms),先取绝对值再拆是错的;⑤双纪元歧义(Twitter vs Discord 差 131235725343ms≈4.16 年)validate 层做同 ID 对照提示。冒烟:114 断言全绿(core 75;MCP stdio 25;SSR 14),typecheck 绿,panel 42.5KB,pack 11 文件 133KB。commit 173d69d(落在并行会话分支 batch-install-23-2026-11-04 上,该分支线性领先 main 无偏离,未 push)。
