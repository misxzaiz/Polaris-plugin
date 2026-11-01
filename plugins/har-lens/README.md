# HAR 分析台（har-lens）

把浏览器导出的 HAR 抓包文件变成**不出本机**的诊断资产：瀑布图透视、敏感信息审计、一键脱敏导出、双 HAR 对比，AI 经 MCP 对话式分析。零依赖、零外联、数据永不离开本机。

## 解决什么问题

- **HAR 文件里有密钥/Cookie/Token，发给别人前要手工清洗**——Cloudflare/PingIdentity/Auth0/Sitecore 都为此自建工具或写支持文档（"never upload HAR files to public tools"）。本插件一键审计 + 一键脱敏导出，全程本机。
- **HAR 是巨型 JSON，肉眼看不出哪里慢**——瀑布图 + 七段时相分解（排队/DNS/连接/TLS/发送/等待/下载）+ p50/p95 + 慢请求 TOP。
- **优化前后要对比有没有回归**——选两份 HAR：新增/消失请求、状态翻转、变慢/变快 TOP。
- **AI 看不懂本地文件**——MCP 八工具让对话里的 AI 直接分析（投影与摘要均脱敏）。

## 使用

1. 浏览器 DevTools → Network → 操作页面 → 右键 → **Save all as HAR**（Firefox：齿轮 → Save All As HAR）
2. 打开「HAR 分析台」面板，把 .har 文件路径贴进「分析」页 → 打开
3. 「分析」看瀑布图与诊断清单（点击行看单条详情，敏感值已掩码）
4. 「审计」看敏感信息命中 → 需要分享时点「预检」确认后「导出脱敏版」（默认源文件同目录 `*.sanitized.har`，返回 sha256 与复核审计）
5. 「对比」选第二份 HAR 找回归；「自检」跑试金石（内存 fixture 全链路，零网络）

## AI（MCP 八工具）

`har_open` / `har_overview` / `har_requests`（filter=all|errors|slow|large|dup） / `har_entry` / `har_audit` / `har_sanitize`（先预检后 confirm）/ `har_compare` / `har_selftest`

对 AI 说：「分析一下 trace.har 为什么慢」「这个 HAR 里有敏感信息吗」「把它脱敏后发支持」「对比优化前后的 HAR」。

## 安全边界

- 全程无网络请求：解析/审计/脱敏/导出全在本机；服务无数据面 API（仅 /__health），控制面走 cap.kv
- 三处脱敏：kv 投影（rows/report/audit/diff）、单条详情、AI 摘要——明文密钥不落 kv
- 脱敏导出六开关（鉴权头/Cookie/Set-Cookie/URL 敏感参数/体内容/URL 凭据），默认全开；写盘前先预检，覆盖需显式 overwrite；导出后自动复核（结构合法性 + 再审计）
- 护栏：文件 ≤150MB、条目 ≤2 万（超出截断并明示）、路径仅接受存在的 .har/.json 文件

## 架构

两平面（webhook-station/mock-server 同款已验证范式）：
- `service/main.js`（node 零依赖）：解析分析引擎 + kv 投影写者 + 单槽命令信箱（先删后做 + nonce 防重放）
- `shared/core.js`：纯函数引擎（校验/分析/审计/脱敏/对比/详情/试金石 fixture），三端共用
- `mcp/server.js`：stdio JSON-RPC 八工具
- `dist/panel.js`：React 面板（分析/审计/对比/自检四 Tab，瀑布图虚拟渲染）

选型依据与市场证据见仓库 `docs/har-lens-plan.md`。

## 验证口径（五层，2026-11-02 实测全绿）

core 单测 32/32 · 服务集成（假桥+真实子进程）18/18 · MCP 全链路（stdio+真服务）17/17 · SSR 渲染 10/10 · 真桥冒烟（真实宿主 kv+真实解析+MCP 真子进程+自清理）7/7

## 已知限制

- 审计只覆盖已知敏感特征（8 类规则），零命中≠绝对安全——分享前仍建议跑全量脱敏
- 不解密 HTTPS 原始流量（HAR 由浏览器导出时已含解密内容）；不做实时抓包（用 Webhook 调试台）
- `code`/`key` 等宽泛参数名可能误报（审计宁可错杀）；时相 `ssl` 按 HAR 规范是 `connect` 子集，瀑布图做覆盖渲染
- 大文件（>50MB）解析阻塞服务进程数秒，属预期（面板会显示解析中）
