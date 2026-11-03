---
id: "043"
title: CSV 检查台(csv-lens):RFC 4180 解析 + 方言诊断 + 转换
status: delivered
priority: high
tags: [csv, rfc4180, debug, parser, converter]
origin: polaris-chat
created: 2026-11-04
updated: 2026-11-04
spec: ""
delivered: a9647f1
---
## 一句话

给开发者的 CSV 调试台:粘贴或选文件,RFC 4180 状态机严格解析(引号内逗号/换行/转义引号),定位列数漂移行与非法引号,检测方言(Excel 分号/TSV/引号风格),逐列类型推断统计,并转 JSON/SQL/Markdown——解决「CSV 导入失败但不知道哪一行哪个字符坏了」的数据管道高频痛点

## 目标（做什么）

- 零依赖 shared core:1) parse——RFC 4180 严格状态机(引号内逗号/换行/""转义)+ 方言参数(delimiter/quote/换行风格);2) diagnose——方言诊断(引号使用/裸引号/列数漂移行定位/换行风格混杂/EOF 无换行);3) infer——逐列类型推断(数字/布尔/日期/空/混合)与统计概览;4) convert——转 JSON(数组/列对象)/SQL INSERT/Markdown 表格。MCP 四工具(csv_lens_ 前缀,text/filePath 双入口)+ 零服务面板

## 边界（明确不做什么）

- 不做 xlsx 二进制格式(归 pdf-tables/Excel 域);不做超大文件流式解析(单文本片段/单文件 ≤10MB 为单位);不做 CSV 数据清洗改写(只读诊断,转换结果落预览/复制);不做编码识别(归 encoding-lens 域,入口默认按 UTF-8 读,检出 BOM 时标注)

## 验收（怎么算完成）

- 1) RFC 4180 状态机:引号内逗号/换行/双引号转义(""嵌套)解析正确,「"a,""b"
c"」类刁钻样本 round-trip 断言通过;2) Excel 方言(单引号非标转义/分号分隔符)与 RFC 方言差异被显式检测并报告;3) 列数不齐行/裸引号/引号后尾随字符被定位到行列号;4) 类型推断(数字/布尔/日期/空)统计概览真实;5) 转 JSON/SQL INSERT/Markdown 输出 round-trip 或结构断言;6) MCP harness text/filePath 双入口用真实参数名全绿;7) 面板 renderToStaticMarkup 渲染断言通过

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-04 由 polaris-chat 记录。


- 2026-11-04 夜班交付（commit a9647f1，未 push）：
  - 选型：降级热点发现——041/042 与并行会话撞车（其已 commit 编码透视台/Mock 生成器），需求库剩余条目全落禁区（总线类/台账/主仓 UI），生态 114 插件实测无 CSV 调试域后立 043 并就地实施。
  - 容错状态机而非 fail-fast：调试台语义=「哪坏了 + 能解析出什么」；裸引号/引号后尾随字符按字面量保留并报告（与 Excel 丢弃语义不同，不丢信息），错误进 issues 分级（error/warn/info）而非中断解析。
  - round-trip 不变式贯穿：serialize→再解析字段矩阵相等（core 测试断言）；normalize 在 MCP 侧对产物自证 round-trip，有损即拦截不输出半成品（json-repair 不变式同族）。
  - RFC 4180 语义澄清（测试样本实证）："a""b" 整体是单字段 a"b（内部转义），trailing-after-quote 场景须引号闭合后隔分隔符外字符（"a"x）；空行=单空字段行跳过计数，",," 是 3 空字段行保留。
  - 分隔符检测为建议不强改：引号感知计数（引号内分隔符不计），报告给建议+计数，切换由用户显式 delimiter 参数。
  - 验收执行记录：core 20/20 + MCP harness 17/17（text/filePath 双入口真实参数名）+ 面板 SSR 8/8（空状态+initialText 完整渲染路径）= 45 断言全绿；tsc --noEmit 零错误；dist/panel.js 35KB。
