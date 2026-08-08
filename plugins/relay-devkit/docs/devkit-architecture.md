# RELAY DevKit — 架构与模块化设计

> 状态：**ESM 重构 R1–R4 已完成（e2e 42/42 绿）；数据库工具 D0–D4 已实现；Node 桥接 `mysql2` 占位符（`%s`→`?`）已修复，后端契约测试 `relay-verify-backend.mjs` 覆盖 /__db 整链路**
> 最后更新：2026-06-09

零依赖、零构建、纯前端 + 一个标准库 Python 服务。本文件记录**模块边界**与**依赖规则**，是后续加工具的地图。

---

## 1. 原则

- **零构建**：原生 ES 模块（`<script type="module">` + `import/export`），浏览器直接加载，`server.py` 当静态文件发。不引入打包器 / npm。
- **单向依赖**：`main → tools → core`。**core 永不 import tools 或任何具体工具/应用代码**；工具之间不互相 import（共享逻辑下沉到 core）。
- **状态本地化**：每个工具自己管自己的状态与 `localStorage` 命名空间（`store(ns)`）。core 无隐式全局状态。
- **行为不变**：重构每一步都以 `relay-verify.js`（42 项 e2e）为回归门禁，绿了才提交。

---

## 2. 目标目录结构

```
index.html              ← 薄壳：静态骨架 + <link styles> + <script type=module src=src/main.js>
styles/
  main.css              ← 设计系统 + 全部组件样式（从 index.html 抽出）
src/
  main.js               ← 组装：注册视图、initApi()、startRouter()
  core/
    dom.js              ← $ $$ el esc uid bytes ms methodColor METHODS / setStatus toast copy / store / fmtDate
    http.js             ← BINARY tryJSON（响应类型/JSON 探测；后续 DB fetch 复用）
    json-view.js        ← getByPath collectPaths / viewRaw hlJSON / viewObject jsonNode hlText
                          richValue tsInfo isImgUrl / viewTable tableCandidates addColResize
                          + configureViewHost({persist, rerender})  ← 反转控制，见 §4
    router.js           ← registerView getViews currentView goView startRouter（hash 路由 + 顶栏 + 首页卡片）
  tools/
    api.js              ← API 请求客户端（send/集合/环境/cURL/tab/响应渲染编排）；import 时绑定 #viewApi 事件
    json.js             ← JSON 工具（initJsonTool + pathDropdown）
    sql.js              ← SQL 模板填充（? + 参数 / MyBatis 日志；hlSQL 分词高亮）
    time.js             ← 时间戳转换（epoch ↔ 时间，秒/毫秒/微秒/纳秒识别）
    db.js               ← 【D 阶段】统一数据库工具（mysql | supabase 双驱动）
server.py               ← 入口：解析端口、启动 ThreadingHTTPServer
relay_server/
  __init__.py
  handler.py            ← Handler（静态 + 方法分发）
  proxy.py              ← /__proxy 跨域转发
  db.py                 ← 【D 阶段】/__db/* MySQL 桥接（loopback-only）
```

---

## 3. 路由：视图注册表

`router.js` 用注册表替代硬编码视图清单，从而**不依赖任何具体工具**：

```js
registerView({ id, label, icon, card?:{name,accent,desc}, init?:fn })
```

- `main.js` import 各工具后逐个 `registerView`，再 `startRouter()`。
- `applyRoute()`：解析 `#/<id>` → 切换 `.view.on` → `renderNav()` → 命中工具首次访问时跑一次 `init()`（懒初始化）→ `home` 时 `renderHome()`（用各视图 `card` 元数据生成卡片）。
- `api` 视图常驻 DOM、`init:null`（其事件在 `api.js` import 时即绑定）。
- 导出 `currentView()` 供 `api.js` 的快捷键守卫（`Ctrl/⌘+Enter`、`+S` 仅在 api 视图生效）。

---

## 4. 关键解耦：JSON-view 的 view-host 钩子

`viewTable` / `addColResize` 原先直接调用 API 的 `persist()` 与 `renderRespBody()`——这是 core→app 的反向依赖。改为**控制反转**：

```js
// json-view.js
let _persist = ()=>{}, _rerender = ()=>{};
export function configureViewHost({persist, rerender}){ if(persist)_persist=persist; if(rerender)_rerender=rerender; }
// 列宽拖拽 mouseup → _persist()
// 多表格切换 chip  → _persist(); (t.rerender || _rerender)();
```

- `main.js`：`configureViewHost({ persist, rerender: renderRespBody })`（API 的）。
- API tab 对象不带 `rerender` → 走 `_rerender`（= renderRespBody，渲染当前 tab）——**与现状字节级等价**。
- JSON 工具的 `jstate.rerender = jsonRenderBody` → 走自身。列宽拖拽时仍触发 `_persist`（= API persist），与现状一致（无行为变化）。

> 这是整个重构唯一需要改逻辑的点；其余均为**机械搬迁 + 加 import/export**。

---

## 5. 服务端拆包

`server.py` 仅保留入口（端口解析 + 启动）。`relay_server/`：
- `handler.py`：`Handler(SimpleHTTPRequestHandler)`，`do_*` 分发；非代理/非 `/__db` 路径走静态。
- `proxy.py`：`/__proxy` 转发（X-Relay-Target / ?url=、剥离逐跳头、注入 CORS）。逻辑不变。
- `db.py`【D 阶段】：`/__db/*`，仅监听 loopback 来源，见 §6。

绑定从 `0.0.0.0` 收紧的讨论留到 D 阶段（静态/代理保持现状，DB 端点单独 gate）。

---

## 6. 数据库工具设计（D 阶段 · 已批准方向）

统一一个「数据库」工具视图 `#/db`，顶部切换 **驱动**：

### 6.1 MySQL 驱动 —— 经后端桥接（浏览器无法直连 3306）
- 后端新增 `/__db/test`、`/__db/query`、`/__db/exec`（POST，JSON）。
- 优先用 `pymysql`（纯 Python，可 `pip install` 也可缺省降级提示）；无则返回明确「未安装」提示，不崩。
- **Node 端口（`relay_server/db.js` + `mysql2`）**：缺省走 Node 后端（`server.js`），`mysql2` 惰性加载、未装则降级提示。前端沿用 Python 时代的 `%s` 占位契约，桥接层在带参数时把 `%s`→`?`、`%%`→`%`（跳过字符串/标识符/注释内部，比 pymysql 朴素 `%` 格式化更安全），并以文本协议 `query()` 执行以保证 `TYPE_CAST` 的日期 ISO 格式化生效。**这是 mysql2 vs pymysql 的关键差异**——未翻译时所有参数化写（CRUD）会失败。
- **安全红线**：
  - 访问控制：设环境变量 `RELAY_DB_TOKEN` 后 `/__db` 需带匹配的 `X-Relay-DB-Token` 头；未设则**开放**（与已开放的 `/__proxy` 一致）。⚠️ 因本工具常部署在公网（0.0.0.0:9860）供远程浏览器访问，loopback 限制会让远程不可用，故改为令牌制；**务必用防火墙/安全组保护端口，或设置令牌**。`/__proxy` 与 `/__db` 都是 SSRF 面，公网暴露需自担风险。
  - 连接信息只在内存缓存（会话级 token → 连接），不落盘；前端密码/令牌也只在内存。
  - 参数化查询：SQL 与参数分离传递，禁止前端拼接后直传。
  - `maxRows` 上限（默认 500），防止巨结果撑爆。

### 6.2 Supabase 驱动 —— 浏览器原生 REST（PostgREST）
- 直接 `fetch` Supabase REST：`apikey` + `Authorization: Bearer` 头。
- 表发现：读 OpenAPI（`/rest/v1/`）枚举表与列。
- 读：`select=*`、`?col=eq.x` 过滤、`Range` 分页。
- 写：`POST`（INSERT）、`PATCH`（UPDATE）、`DELETE`，带 `Prefer: return=representation` 回读结果。
- 跨域受限时复用 `/__proxy`。

### 6.3 统一交互
- 左侧表/schema 浏览，右侧复用 `json-view` 的表格渲染。
- 全 CRUD：读直接执行；**写走「预览 → 确认 → 执行」**三步，展示将执行的语句/请求体。
- UPDATE / DELETE **强制要求主键条件**，否则拒绝并提示，防误伤全表。

### 6.4 阶段
`D0` 后端 `/__db` 骨架（loopback gate + 连接缓存）→ `D1` 工具壳 + 连接管理 UI → `D2` Supabase 读 → `D3` MySQL 读 → `D4` 全 CRUD（预览-确认-执行）→ `D5` e2e（用 mock/本地）。

---

## 7. 迁移顺序与门禁

| 步 | 内容 | 门禁 | 状态 |
|----|------|------|------|
| R1 | 抽 CSS → `styles/main.css`，index.html 改 `<link>` | e2e 42/42 | ✅ `e8cbc1b` |
| R2 | 抽 `core/{dom,http,json-view,router}.js`（含 §4 解耦） | 与 R3 合并验证 | ✅ `68b8f84` |
| R3 | 抽 `tools/{api,json,sql,time}.js` + `main.js`，index.html 变薄壳 + `<script type=module>` | e2e 42/42（最关键） | ✅ `68b8f84` |
| R4 | `server.py` 拆 `relay_server/{handler,proxy}.py` | e2e 代理用例 | ✅ `d5a336e` |
| D0 | `relay_server/db.py`（loopback gate + pymysql 可选 + token 会话 + 参数化 + maxRows）+ handler 分发 | `/__db` smoke | 已实现，待实测 |
| D1–D4 | `tools/db.js`：壳 + 连接管理 + Supabase 读 + MySQL 读 + 全 CRUD（预览-确认-执行） | e2e DB 用例 | 已实现，待实测 |
| D5 | e2e（4 项 DB 用例）+ 后端契约测试 | 后端契约 + e2e 全绿 | 后端契约已补（`relay-verify-backend.mjs` 注入假驱动验 /__db 整链路 + 占位符翻译）；浏览器 e2e DB 用例待补 |

> 实测命令：`npm run verify:backend`（无需浏览器/真库——注入假 mysql2 驱动，验 /__db 整链路 + `%s`→`?` 翻译）→ `npm start` 起 Node 后端 → `node relay-verify.js` 跑 e2e。MySQL 连真库需后端 `npm i mysql2` + 可达的 MySQL（连接表单填 host/port/账号密码）；Supabase 需项目 URL+key。

> R2/R3 是把全局脚本转 ESM，模块作用域与全局作用域不能混用，因此**作为一次原子变换**完成、整体过 e2e，而非半模块半内联的中间态。
