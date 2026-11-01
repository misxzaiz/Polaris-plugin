# Mock 接口台（mock-server）

把本机 `http://127.0.0.1:9868` 变成一套**随编随用的假接口**：后端没就绪前端先开工、联调造不出边界数据、演示需要可控响应——表单或对话建路由，`{{模板}}` 造真实感数据，延迟/错误率注入造边界，请求全留痕。

## 它解决什么

- **并行开发**：后端接口没好，前端不用等——把 baseURL 指到 9868，路由 3 秒热更。
- **边界造数**：慢接口（延迟注入）、坏接口（错误率注入）、分页参数、空列表——一键模拟。
- **联调取证**：前端到底发了什么？请求历史全留痕（敏感头自动脱敏），404 返回诊断体提示最接近的路由。
- **AI 对话式管理**：在对话里说「帮我造一个 GET /api/users 返回 3 个用户的 mock」即可，MCP 八工具覆盖建/改/删/试发/看历史/自检/导入。

## 快速开始

1. 安装插件（服务自动启动，监听 `127.0.0.1:9868`，仅本机可达）
2. 打开面板 → **自检** → 点「运行自检」——7 项检查全部打**真实 HTTP 请求**验证，全绿即工具链可用
3. 把前端 dev server 的 proxy / 测试 baseURL 指向 `http://127.0.0.1:9868`
4. 「路由」页新建路由，或直接在对话里让 AI 建；未匹配路径会返回带提示的 404 诊断体

## 路由模型

| 字段 | 说明 |
|---|---|
| method | GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS / ANY |
| path | `/api/users/:id`（路径参数）、`/files/*`（尾部通配，可命中空尾）；静态段大小写不敏感 |
| status | 100-599 |
| bodyType / body | json / text / empty；body 支持 `{{模板}}` |
| headers | 自定义响应头（≤10 个，`Content-Type` 由 bodyType 决定不可覆盖） |
| delayMs | 延迟注入 0-60000ms |
| errorRate / errorStatus | 故障注入：按百分比返回指定错误码 |

匹配评分：静态段(3) > 参数段(2) > 通配段(1)，同分按创建序——确定且可解释。

## 模板速查

```
数据     {{int 1,99}} {{float 0,1,2}} {{bool}} {{uuid}} {{counter}} {{pick a|b|c}}
中文真实感 {{cname}} {{city}} {{phone}} {{ctitle 12}} {{csentence 10,20}} {{cparagraph 3}}
英文     {{name}} {{email}} {{word}} {{sentence 6,14}} {{paragraph 3}}
时间     {{date}} {{datetime}} {{timestamp}} {{dateRange -30,0}}
请求回显  {{req.path.id}} {{req.query.tag}} {{req.header.X-Token}} {{req.body.a.b}}
字面输出  \{{ → {{
```

未识别的表达式**按字面返回**——响应里看到 `{{noSuchGen}}` 就知道拼错了。

## 架构（两平面，webhook-station 同款）

```
面板(React) ──cap.kv(mck.*)──┐
AI(MCP stdio) ──cap.kv───────┤   控制面：mck.settings / mck.cmd(单槽信箱) / mck.result
                             │          mck.hist.<n> 分块 / mck.idx / mck.meta / mck.selftest
被测应用 ──HTTP 9868─────────┘   数据面：mock 匹配 → 模板渲染 → 延迟/故障 → 响应（+/__health）
```

- 服务**无管理 HTTP API**——控制面全走 cap.kv，服务端口只暴露 mock 数据面，无新增鉴权面。
- 面板不直接 fetch mock 地址（规避混合内容/跨域）；「试一发」经 cmd 信箱由服务侧自发自收。
- 服务每 tick 重读 settings（路由 3s 内热更）；命令「先删后做」+ nonce 防重放。

## 护栏与边界（如实告知）

- 仅监听 **127.0.0.1**，局域网/手机不可达。
- 路由 ≤100 条 · 响应体 ≤16KB · 延迟注入 ≤60s · 请求体接收 ≤2MB（超出 413）。
- 历史只保留最近 **500 条且服务重启清空**（内存权威，kv 只镜像最近 240 条供跨端/AI 查看）。
- `/__` 开头的路径是系统保留（健康检查），不能注册。
- 请求历史里的敏感请求头（authorization/cookie/token/secret/…）自动脱敏后入库。
- HTTPS/录制回放/gRPC 不在 v0.1 范围。

## MCP 工具（8 个）

| 工具 | 用途 |
|---|---|
| mock_overview | 服务状态 + 入口地址 + 路由摘要 |
| mock_routes | 全部路由清单（拿 id） |
| mock_upsert | 新建/修改路由（模板引擎全量可用） |
| mock_delete | 删除路由 |
| mock_history | 请求历史（关键词/状态类过滤） |
| mock_test | 按路由配置真实试发一次（参数自动实例化） |
| mock_selftest | 跑内置试金石自检（7 项打真请求） |
| mock_import_openapi | OpenAPI 3.x JSON → 路由（先预览后 apply） |

## 验证口径（四层 + 真桥）

- core 单测 29：路径评分/模板确定性（种子 rng）/归一化/CORS/历史分块/OpenAPI
- 服务集成 21（内存假 kv 桥 + 真实 HTTP 打真服务）
- MCP 全链路 13（stdio 子进程 + 假桥 + 真服务同跑）
- SSR 渲染 14（react-dom/server，四 Tab/空态/护栏文案）
- 真桥冒烟（真实宿主 kv + 真实 HTTP，见 test/smoke-real.mjs）

选型依据见 `docs/mock-server-plan.md`。
