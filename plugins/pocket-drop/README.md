# 口袋快传（pocket-drop）

> 局域网文件互传：手机扫码 ↔ 运行 Polaris 的电脑，无需装任何 App。电脑上的文件让 AI 一句话投给手机；手机里的照片拍完直接落到电脑。零云、零账号、零外网请求。

- **手机端**：浏览器扫面板二维码 → 上传（多选 / 拍照即传）/ 下载 / 预览 / 删除，同源直连自家服务，零跨域
- **面板**（ActivityBar → 📁 口袋快传）：扫码入口 + 双向清单 + 手动上传下载 + 设置 + 服务管理
- **AI 工具**（MCP 5 个 `drop_*`）：「把 D:\reports\报表.xlsx 传到我手机」「我手机传了什么」「把刚传的照片存到工作区」
- **自动清理**：TTL（默认 72h）+ 条目数/总容量双上限，过渡文件不堆积

## 为什么是它

| 场景 | 没有它 | 有了它 |
|---|---|---|
| 手机照片进电脑 | 微信文件传输助手 / 数据线 / 网盘中转 | 扫码拍照即传，落地在电脑存储目录，AI 还能直接接手处理 |
| 电脑文件给手机 | 同上，还要登录账号 | 对 AI 说「把 xx 传到我手机」，或面板拖上传 |
| 手机拍的白板/发票要给 AI 看 | 先传微信再下载再上传 | 拍照 → 电脑投递区 → `drop_save` 落盘 → AI 直接读路径 |
| 临时给同网设备发大文件 | 网盘限速 / U盘 | 局域网直传，上限可调到 8GB |

## 跨域 / 数据面架构（读这个再改代码）

浏览器同源策略是插件平台第一杀手，本插件三路数据面各走各的合规通道（详见 `docs/SPEC.md`）：

```
手机浏览器 ──同源 HTTP──► 服务进程 (node, 0.0.0.0:9867, PIN 门禁)
                            ├─ GET /            手机页（服务直出单文件 HTML）
                            ├─ POST /u          上传（流式落盘 + 限长）
                            ├─ GET /f/<id>      下载 / inline 预览
                            └─ DELETE /f/<id>   删除
桌面面板 ── __POLARIS_HOST_INVOKE__ ──► router_dispatch ──► cap.kv (pdrop.*)
                                                            ▲ 投影/心跳唯一写者=服务
MCP server.js ── 127.0.0.1 bridge (md5 token, 自发现) ──────┘（命令键 先删后做）
桌面大文件直传 ── XHR http://127.0.0.1:9867（localhost 免混合内容，CORS 由自家服务放行）
AI 投递本地文件 ── 服务直接 fs 读路径（零桥上字节）
```

- **手机路径完全没有跨域问题**：手机访问的是服务自己直出的页面，同源。
- **面板清单/状态走 cap.kv 投影**（宿主 invoke 通道），桌面/Web/手机三端一致；
- **桌面大文件直传是唯一例外**：GB 级字节扛不进 kv / cap.http（base64 会爆），只能 XHR 打到
  自家 `127.0.0.1` 服务——localhost 被 Chromium 认定为安全上下文（免混合内容），CORS 头由
  自家服务显式放行。失败时面板诚实给替代路径：让 AI 走 `drop_send`；
- 服务对宿主的访问走 127.0.0.1 bridge + `Bearer md5(web.token)`，端点自发现
  （env → anchor.json → config.json → 端口上扫 25 个），Polaris 不向插件服务注入环境变量。

### 键空间契约（`pdrop.*`，三方一致：service / mcp / panel）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `pdrop.settings` | 面板 / MCP（服务仅在键缺失时引导写默认+随机 PIN） | 服务（30s 热更） | `{ pin, ttlHours, maxSizeMb, totalCapMb }` |
| `pdrop.meta` | **服务**（60s） | 面板 / MCP | 心跳：version/pid/port/lanUrl/lanUrls/dropDir/itemCount/storeBytes/degraded |
| `pdrop.items` | **服务**（单写投影） | 面板 / MCP | `{ at, items[] }`；**权威在本地 meta.json**（原子写），kv 只是跨端只读投影 |
| `pdrop.cmd.send/save/clear.<nonce>` | 面板 / MCP | **服务**（消费=先删后做） | 命令键 |
| `pdrop.result.<nonce>` | **服务** | 面板 / MCP（取后删） | 命令结果 |
| `pdrop.event.<13位ts>-<hex>` | **服务** | 面板 / MCP | 事件流，保留 50 条滚动清理 |

**单写者原则**：投递条目的增删只发生在服务（含手机/面板/AI 三种入口）；MCP 与面板只写
settings 与命令键。服务重启后从 meta.json 恢复，再镜像回 kv——文件永远不会因 kv 不可用变孤儿。

### 存储位置

`anchor.json → dataRoot` 的**兄弟目录** `polaris-drop/`（data-ark 同款约定：过渡文件不进
dataRoot，不污染备份源）。结构：`polaris-drop/store/<id>.bin` + `polaris-drop/meta.json`。
兜底（无 anchor 时）：`<appConfigDir>/pocket-drop/`。

## 安全设计

1. **PIN 门禁**：所有业务端点（`/__health` 除外）必须带 `?pin=`；常量时间比较
   （sha256 后 timingSafeEqual）；面板可一键重新生成（手机端需重输）。
2. **限频**：PIN 连错 5 次/分/IP → 429 锁 60s（限频键=IP 维度；锁定事件写入动态流）。
3. **文件名清洗**：展示名剥离路径成分/控制字符/Windows 保留名/尾随点，限长 180；
   **存储名 = 12 位随机 hex**，服务端不存在任何用户可控路径（`/f/<id>` 只接受 hex id）。
4. **双上限**：单文件 `maxSizeMb`（流式边写边数，超限即断流删残片）；投递区总容量
   `totalCapMb` + 条目数 200，超了诚实拒收（507）不静默挤掉旧文件。
5. **TTL 自动清理**：默认 72h，tick（4s）内清扫，过期即删文件+元数据。
6. **MCP 危险操作 confirm 门**：`drop_clear` 必须显式 `confirm:true`；`drop_save` 覆盖
   已存在文件必须 `confirm:true`。
7. **零外网请求**：服务只监听本机局域网，不主动外联；服务日志在
   `<appConfigDir>/pocket-drop.log`（512KB 轮转），不含文件内容。

## MCP 工具

| 工具 | 作用 | 适用句式 |
|---|---|---|
| `drop_send(path, note?)` | 本地文件 → 投递区（手机立即可见） | 「把 D:\xx\报表.xlsx 传到我手机」 |
| `drop_list()` | 列出投递区（含手机刚传的） | 「我手机传了什么」「快传区有什么」 |
| `drop_save(id, dest, confirm?)` | 投递文件 → 电脑绝对路径 | 「把我手机传的照片存到 D:\pics」 |
| `drop_clear(confirm)` | 清空投递区（confirm 门） | 「清空快传」 |
| `drop_status()` | 服务状态/局域网入口/存储占用 | 「快传服务在跑吗」「手机怎么访问」 |

## 验证记录（v0.1.0）

- 离线单测 **33/33**（`node test/run-tests.mjs`）：文件名清洗/路径注入、准入判定、TTL 边界、
  LAN 优选、PIN 限频（IP 维度）、设置夹紧、手机页与 QR 健全性
- 真实桥冒烟 **18/18**（`node test/smoke-real.mjs`，需本机 Polaris 运行中）：护栏拒跑 →
  spawn 真实服务 → 门禁 401 → 上传下载字节一致 → 路径穿越清洗 → 来源标记 → 投影镜像 →
  MCP initialize/tools/list/drop_send/drop_list/drop_save/drop_clear 全闭环 → 事件流 →
  meta 心跳 → 100% 清场（含删光测试键）

## 已知边界（如实说明）

- **仅限同一局域网**：离开家用/办公 Wi-Fi 不可用（无公网穿透——这是安全特性）；
- **首次监听**：Windows 会弹防火墙提示，允许「专用网络」即可；面板「设置」里有服务管理卡；
- **端口固定 9867**：被占用时服务诚实退出（日志明示），不静默换端口（健康检查会跟着漂移）；
- **桌面面板直传依赖 webview 放行 `127.0.0.1`**：WebView2/Chromium 系默认可用；若被环境
  拦截，上传/下载给替代路径（AI `drop_send` / 手机端直接访问），手机路径不受任何影响；
- **PIN 变更立即生效**：已打开的手机页面下次请求 401 后需重输（localStorage 里的旧值失效）；
- **不做**：断点续传、多接收端同步、文本接力（clip-relay 已覆盖）、公网访问。

## 排障

| 症状 | 排查 |
|---|---|
| 面板显示「服务离线」 | 设置 Tab 服务管理卡看状态 → 启动；日志 `<appConfigDir>/pocket-drop.log` |
| 手机打不开链接 | 确认同 Wi-Fi；防火墙放行 node（专用网络）；面板「备用地址」换一个网卡 IP |
| 手机提示 PIN 不正确 | 面板设置里核对/重新生成 PIN（5 次错会锁 60 秒） |
| 上传 413/507 | 单文件超限或投递区满——调高设置或清理投递区 |
| AI 说服务未响应 | 服务可能被停；设置→插件→口袋快传 或面板设置卡启动 |
