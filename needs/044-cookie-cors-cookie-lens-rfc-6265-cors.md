---
id: "044"
title: Cookie & CORS 调试台（cookie-lens）：RFC 6265 解析 + 语义诊断 + CORS 判定
status: delivered
priority: high
tags: [debug, http, security, web]
origin: polaris-chat
created: 2026-11-04
updated: 2026-11-04
spec: ""
delivered: 38ad293
---
## 一句话

给开发者/AI 用的 Cookie 与 CORS 确定性诊断台：解析 Set-Cookie 与请求 Cookie 头、逐项属性诊断（SameSite/Secure/__Host- 前缀/Domain/Path）、按 RFC 6265 domain-match/path-match 判定 cookie 会被发往哪些 URL、按 Fetch 标准判定 CORS 场景（简单请求/预检/credentials 与通配符冲突），纯本地零外联。

## 目标（做什么）

- 给 cookie-lens 一段 Set-Cookie 头或一段 CORS 请求/响应头，得到结构化解析 + 每项属性的红绿灯诊断 + 浏览器真实行为判定（会拒收吗？会发送到这个 URL 吗？预检会过吗？），并给出修复建议。

## 边界（明确不做什么）

- 不做网络请求（纯本地解析与判定，不发真实 HTTP）；不做浏览器 Cookie 存储管理（不是 cookie 管理器）；不做 Cookie 加密解密（session 签名类）；不做反向代理配置生成；面板不做持久化存储。

## 验收（怎么算完成）

- 1. shared/core 单测断言矩阵全绿：Set-Cookie 各属性解析、SameSite=None 无 Secure 判「浏览器将拒收」、__Host-/__Secure- 前缀校验、domain-match/path-match 匹配判定、CORS credentials 下 ACAO=* 判失败、预检 method/header 逐项核对、round-trip 生成→重解析结构相等。2. MCP harness（JSON-RPC stdin 喂包）initialize/tools/list/四工具各至少 1 次真实调用断言。3. 面板 SSR 渲染断言通过（--external:react + .ssr-tmp 固定目录）。4. 独立真实样本：GitHub/Stripe 真实 Set-Cookie 样式头、典型 CORS 失败响应头。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-04 由 polaris-chat 记录。

- 2026-11-04 夜班实施（降级热点发现：整库可用条目全落禁区——002~008 总线类/014~031 主仓功能与调研类/028 台账类，按第六节热点发现登记本条并就地实施）。选型依据：cookie/CORS 调试是 2026 持续热点（chrome-devtools-mcp 爆火主因之一），生态无同类插件（grep 撞车检查：仅 har-lens 描述文本提及 cookie）。
- 关键技术决策：①纯本地零外联零 kv（解析/判定全确定性引擎，CJS 双 core 单一权威 MCP+面板共用）；②拒收级判定按「现代浏览器强制语义」而非仅 RFC 文本（SameSite=None 无 Secure、__Host-/__Secure- 前缀、Domain 父域校验、名称 token 非法→rejected）；③生成器铁律：generateSetCookie 产物强制 round-trip 重解析自检，SameSite=None 缺省自动补 Secure 防手滑；④CORS 判定按 Fetch Standard 逐项核对（credentials 下 * 失效、重复 ACAO 失败不合并、Authorization 预检特例+网关 OPTIONS 提示）。
- 冒烟：core 断言矩阵 39/39（含 SSR 渲染）+ MCP 真实喂包 15/15 + zip 根 plugin.json 验证；typecheck 过；bundle 54.2kb；zip 49KB（.pluginignore 排 node_modules 后，原 10.6MB）。
- 偏差说明：验收第 4 条「真实样本」以 GitHub 风格 __Host- 头与典型 CORS 失败头样本覆盖于测试矩阵中；打包新增 .pluginignore 为实施中发现 pack.js 不读根 .gitignore 的必要补充（新坑已回写 platform-constraints）。
