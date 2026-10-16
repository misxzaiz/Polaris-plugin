# relay-devkit DB 功能 cap 化改造（对齐 relay-devkit-api 的 cap.http 范式）

> 状态：已实施（v1.3.3）
> 日期：2026-10-16
> 涉及插件：`plugins/relay-devkit`
> 涉及主项目：`Polaris`（`src-tauri/src/services/router/http_capability.rs`）

## 1. 目标

relay-devkit-api 已示范「插件面板 → 宿主 RouterBus → cap.http → 目标」的零服务调用链。
relay-devkit 的 DB 工具目前仍依赖浏览器直连 `http://127.0.0.1:9860`（面板 iframe 内受
混合内容 / CORS 限制）与手动 `npm i mysql2`。本次目标是：

1. **面板内 DB 请求改走 cap.http 转发**（MySQL 桥接 + Supabase 均受益）；
2. **Supabase 面板零服务**：PostgREST 本就是 HTTP，经 cap.http 直连，去掉「本地代理」依赖；
3. **MySQL 仍需本地桥接进程**（二进制协议，浏览器无法直连），但把 mysql2 依赖**打进插件包**，
   装完即用，不再要求用户手动 `npm i mysql2`。

## 2. 现状（已核实源码）

### 2.1 前端 `src/tools/db.js`
- `dbReq(route,payload)`：`fetch(_dbBase + '/__db/' + route)`，面板模式 `_dbBase='http://127.0.0.1:9860'`（line 13-14, 74-82）
- `sbFetch(pathQuery)`：Supabase 直连 PostgREST；勾选「本地代理」时 `fetch(_dbBase + '/__proxy')`（line 83-89）
- MySQL 会话：`connect/test/query/exec/schema/databases/use/disconnect` 8 个 route，token 会话
- 面板模式由 `panel.jsx:197 setDbPanelMode(true)` 开启

### 2.2 后端 `relay_server/db.js` + `server.js`
- MySQL 桥接：懒惰加载 `mysql2/promise`；token 会话（内存）；`%s→?` 占位符翻译；maxRows 上限
- `server.js` 监听 9860：静态文件 + `/__proxy` + `/__db`
- **mysql2 不在 zip 内**（`.pluginignore` 排除 `node_modules/`），装完插件需手动 `npm i mysql2`

### 2.3 主项目能力（无 cap.db，cap.http 支持）
- RouterBus 无任何 DB 直连能力（Cargo 仅内部 rusqlite）
- `http_capability.rs:4-5`：**插件面板（Source::Bootstrap）与 AI（Source::Plugin）都经 RouterBus 统一 dispatch 触达 cap.http** —— 面板调 cap.http 是设计支持路径
- `http_capability.rs:343-346`：放行 localhost/127.0.0.1/内网目标
- `relay-devkit-api/src/core/cap-http.js`：现成范式（`tauriInvoke('router_dispatch')` → `capHttpRequest`）

## 3. 方案

### 3.1 面板 DB 请求走 cap.http（前端改造）

新增 `src/core/cap-http.js`（从 relay-devkit-api 移植，面板模式专用）：

```
调用链：面板 → invoke('router_dispatch')
          → payload { target:'cap.http', payload:{ action:'request', method:'POST',
                    url:'http://127.0.0.1:9860/__db/<route>', headers, body:JSON.stringify(payload) } }
          → 宿主 reqwest 转发 → 本地桥接服务（或 Supabase API）
```

- `dbReq()`：面板模式改用 `capHttpRequest`；独立窗口模式保留直连 `_dbBase`
- `sbFetch()`：面板模式改走 cap.http 直连 PostgREST，**「本地代理」选项对面板模式发废**
  （cap.http 无 CORS/混合内容/禁发头限制，直连即可）；独立模式保留
- 面板启动（`panel.jsx` / `main.js`）透传宿主可用探测 `hostCapHttpAvailable()`

### 3.2 mysql2 离线进包（去掉手动 npm i）

- 将 `mysql2`（纯 JS 依赖树，v3.22.5，含 aws-ssl-profiles/denque/generate-function/iconv-lite/
  long/lru.min/named-placeholders/sql-escaper/safer-buffer）拷贝进插件包目录
  `relay_server/vendor/`，并在 `package.json` 式元数据中声明
- `relay_server/db.js` 的 `getMysql()` 优先从 `vendor` 加载，失败再退回全局 node_modules
- **体积控制**：mysql2 全量 ~13MB；裁剪为仅运行时必需文件（跳过测试/文档），目标 ≤2MB
  （用 `npm pack` 产出的 tarball 只含 `lib/` + package.json，实测最小化）
- `.pluginignore`：放开 `relay_server/vendor/`，仍排除 `node_modules/`

### 3.3 服务声明不变

`plugin.json contributes.services[].relay-server`（type http, port 9860, autoStart）保留——MySQL
桥接仍需本地进程；Polaris 自动管理生命周期。

### 3.4 不做的事（明确边界）

- ❌ 不改 Supabase「直连 + 代理」双模式交互：面板模式代理选项保留 UI 但提示「cap.http 直连已生效」
- ❌ 不迁移 MySQL 到主项目 Rust（无 cap.db 能力、无 mysql 驱动、改动跨主项目 release）
- ❌ 不动 api.js / AI 工具 / JSON / SQL / 时间戳工具（本次仅 DB 请求路径）

## 4. 同步文件清单

| 文件 | 改动 |
|---|---|
| `src/core/cap-http.js` | 新增（移植 relay-devkit-api 范式） |
| `src/tools/db.js` | `dbReq`/`sbFetch` 面板模式走 cap.http |
| `src/panel.jsx` / `src/main.js` | 探测宿主 cap.http 可用性，传给 db 模块 |
| `relay_server/db.js` | `getMysql()` 支持 vendor 加载 |
| `relay_server/vendor/mysql2/` | 新增（打包含 mysql2 运行时） |
| `.pluginignore` | 放开 vendor/ |
| `plugin.json` / `update.json` | 版本 bump（1.3.2 → 1.3.3）+ description 更新 |
| `docs/relay-db-cap-migration.md` | 本 spec |

## 5. 验收

1. `node scripts/validate.js` 通过
2. relay-devkit.zip 含 `relay_server/vendor/mysql2/`（可离线加载），解压后 `node server.js` 在
   **无全局 node_modules** 时 mysql2 可用
3. 面板 MySQL 连接/查询/CRUD 经 cap.http 转发到 `127.0.0.1:9860/__db/*` 全程成功
4. 面板 Supabase 直连（不勾代理）成功，且无 CORS 报错
5. 独立窗口模式（纯浏览器，无宿主）DB 功能回归不变
6. 与 relay-devkit / relay-devkit-api 共存无面板注册冲突

## 6. 风险与回滚

- **cap.http 对 localhost 目标**：主项目已放行（测试断言），但线上环境如有额外策略需复核
- **mysql2 裁剪遗漏**：若 vendor 缺传递依赖，`getMysql()` 回退全局 node_modules，不影响面板
- **回滚**：git revert 即可；zip 恢复到 1.3.2