---
id: "041"
title: 编码透视台（encoding-lens）：编码识别 + 乱码修复 + 转换
status: idea
priority: high
tags: [encoding, mojibake, debug, text, converter]
origin: polaris-chat
created: 2026-11-04
updated: 2026-11-04
spec: ""
delivered: ""
---
## 一句话

给开发者的文本编码诊断台：粘贴文本或选文件，识别真实编码（GBK/Big5/Shift_JIS/EUC-KR/UTF-8/16/Latin1 等），修复 mojibake 乱码（UTF-8 被误按 Latin1/GBK 解码的双层编码），扫描乱码指纹（锟斤拷/烫烫烫/屯屯屯/â€œ 类），并提供编码转换与 BOM 检测——解决 Windows 中文环境下「文件打开全是乱码但不知道是哪层错了」的日常痛点。

## 目标（做什么）

- 零依赖 shared core（双端 TextDecoder）：1) detect——BOM 检测 + 多候选编码 fatal 解码 + 可读性评分排序；2) fix——double-encoding 误读链探测（re-encode→re-decode）+ 修复产物终验不过不输出半成品；3) fingerprint——已知乱码模式指纹库；4) convert——text↔bytes 编码转换。MCP 四工具（encoding_lens_ 前缀，text/filePath 双入口）+ 纯前端零服务面板。

## 边界（明确不做什么）

- 不做字体/字形层面问题（归 unicode-lens 隐形字符域）；不做批量目录递归转码（单文件/单文本片段为单位）；不修改用户文件（只读诊断，转换结果落剪贴板/预览，不就地覆写）；不做图片/二进制格式分析。

## 验收（怎么算完成）

- 1) 「ä¸­æ–‡」类 UTF-8→Latin1 误读样本修复回「中文」，round-trip 断言通过；2) GBK 编码的中文文本字节流被正确识别为 GBK 而非 UTF-8（严格解码区分）；3) 锟斤拷/烫烫烫指纹命中并给出根因解释；4) MCP harness 真实参数名 text/filePath 双入口全绿；5) 面板 renderToStaticMarkup 渲染断言通过。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-04 由 polaris-chat 记录。
