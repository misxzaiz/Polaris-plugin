# 文本接力（clip-relay）

> 跨设备文本接力：桌面复制的东西（链接 / 报错栈 / 口令 / 片段），手机上打开 Polaris 一键取用；反过来手机打字也能送到桌面。聊天里对 AI 说「把这个链接发到我手机上」，它直接推到所有设备。

- **面板**（ActivityBar → 📋 文本接力）：输入即推、筛选（全部/链接/文本/置顶）、一键复制、置顶常用片段、未读角标
- **URL 条目自动补标题**：推送纯链接时后台服务抓取网页标题与摘要——条目墙显示「GitHub: misxzaiz/Polaris…」而非一排裸 URL
- **MCP 工具**（4 个 `relay_*`）：AI 主动推送 / 查看板子 / 读全文 / 清空
- **跨端**：桌面 / Web / 手机打开同一面板看到同一块板子——数据只有 cap.kv 这一个事实库

## 日常场景

| 场景 | 没有它 | 有了它 |
|---|---|---|
| 桌面 → 手机 | 微信文件传输助手 / 重新搜索 | 推送 → 手机面板一键复制 |
| 手机 → 桌面 | 手打 / 邮件自发 | 手机输入推送 → 桌面 3s 内出现 |
| AI 产物转移 | 复制 AI 回复后自己想办法传 | 「把这段配置推到我手机上」→ relay_push |
| 常用片段 | 到处找备忘录 | 置顶区钉住 WiFi 密码 / 服务器地址 / 口令 |

## 跨域 / 数据面架构（读这个再改代码）

- 面板**从不直接 fetch 任何地址**（本地或外网）——全部经宿主 invoke 通道（`window.__POLARIS_HOST_INVOKE__`）走 router_dispatch 读写 cap.kv，桌面（Bootstrap）/ 手机（Remote）同一条路，天然无 CORS；
- 唯一的外网访问是 **URL 标题抓取**，下沉到后台服务原生 fetch 执行（浏览器同源策略管不到服务进程）——与 page-sentinel 同一根治思路；
- 服务对宿主的访问走 127.0.0.1 + `Bearer md5(web.token)`，端点自发现（env → anchor.json → config.json → 端口上扫 25 个）。

```
面板(桌面/Web/手机) ── __POLARIS_HOST_INVOKE__ ──► router_dispatch ──► cap.kv (relay.*)
                                                                        ▲          │
MCP server.js ────── 同通道（relay_push/list 直写直读）──────────────────┘          │ enrich 回写
后台服务 relay.js ── 127.0.0.1 bridge ──► cap.kv（enrich/清扫）──► 原生 fetch 外网（唯一出口，带 SSRF 守卫）
```

### 键空间契约（`relay.*`，三方一致：service / mcp / panel）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `relay.item.<id>` | 面板 / MCP（创建）；服务（仅 enrich 字段回写） | 三方 | 条目 {id, text, kind, url?, title?, desc?, from, createdAt, pinned, enriched, enrichTries?, enrichFail?} |
| `relay.settings` | 面板 / MCP | 服务（30s 轮读） | {maxItems, retentionDays, sweepMs, urlEnrich} |
| `relay.meta` | **服务**（60s） | 面板 | 心跳 + bridge + 生效中的设置 |
| `relay.readAt` | 面板 | 面板 | 未读水位（全局，与 page-sentinel 同策略） |

**写路径分工**：条目创建 = 面板/MCP（normalizeItem 同规则各自实现）；enrich 回写 = 服务唯一；清扫删除 = 服务唯一。面板对条目的修改只有 pinned 与删除。

## 安全设计

1. **SSRF 守卫**（`isFetchableUrl`）：服务只对**公网** http(s) 地址做抓取——环回/内网段（127/10/172.16-31/192.168/0.0.0.0）/链路本地（169.254，含云元数据端口）/file、javascript 等协议一律拒绝。板子内容任何端都可写，不能让「推一条链接」变成对 localhost 的探测。
2. **抓取礼貌**：每 tick 最多 1 条待补全（串行不并发）；12s 超时；只读前 2MB；非 HTML content-type 跳过；失败重试 ≤3 次后标记 `enrichFail` 不再堵队列。
3. **单条上限**：8000 字符（normalizeItem 三方同规则），防 kv 膨胀。
4. **清空确认**：面板两段确认；MCP 必须显式 `confirm: true`。

## 保留策略

- 超过 `maxItems`（默认 100，可设 20-500）删最旧的未置顶条目——**置顶永留且不占名额**；
- 超过 `retentionDays`（默认 14 天）的未置顶条目清理；
- 触发时机：周期清扫（sweepMs，默认 10 分钟）+ 每 tick 发现超限立即清扫（15s 节流）；
- 清扫是纯函数 `planRetention`，离线单测覆盖（条数/天数/置顶永留三维度）。

## 手机端复制说明（如实交代）

手机浏览器经 `http://局域网IP:端口` 访问时页面不是安全上下文，浏览器禁止程序直接写剪贴板——面板会自动弹出**手动复制**弹窗（文本已全选，长按/Ctrl+C 复制）。桌面与 localhost 访问走 `navigator.clipboard` 一键复制。这是浏览器安全模型的约束，不是缺陷。

## 采集明细（零外部依赖，Node ≥ 18）

| 动作 | 手段 | 节奏 |
|---|---|---|
| URL enrich | 原生 fetch（og:title → `<title>`；og:description → meta description） | 每 tick 最多 1 条 |
| 清扫 | `planRetention`（纯函数） | 周期 + 超限立即 |
| 心跳 | `relay.meta` | 60s |

限制（如实说明）：只抓标题/摘要不存正文（阅读全文请打开链接）；需要登采的页面抓到的是未登录态标题；未读水位是全局的（一台设备看了即全端已读）。

## MCP 工具

| 工具 | 作用 |
|---|---|
| `relay_push` | 推送文本/链接到所有设备（单条 ≤8000 字符） |
| `relay_list` | 列条目（置顶优先，可过滤/限条数） |
| `relay_read` | 按 id 读全文（含原始 URL） |
| `relay_clear` | 清空整块板子（必须 confirm:true） |

## 排障

- **链接条目一直显示「抓取标题中…」**：看 `relay.meta` 心跳是否停滞（服务挂了 → 设置里重启）；若条目最终带「标题抓取失败」角标，鼠标悬停看原因（多为 404/超时/非网页）。
- **内网地址推上去不抓标题**：SSRF 守卫设计如此，属预期行为。
- **手机上复制没反应**：见上节「手动复制」弹窗说明。

## 开发

```bash
cd plugins/clip-relay
npm install
npm run build        # esbuild → dist/panel.js（external react，宿主 blob shim 提供）
npm run typecheck    # tsc --noEmit
node test/run-tests.mjs    # 离线单测（URL 识别/SSRF/保留策略/元数据抽取）
node test/smoke-real.mjs   # 真实桥冒烟（需本机 Polaris 在跑 + 有外网，跑完自清理）
node ../../scripts/pack.js plugins/clip-relay   # 打包 zip + sha256
```
