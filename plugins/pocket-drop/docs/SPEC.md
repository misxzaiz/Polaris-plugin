# 口袋快传（pocket-drop）SPEC

> 局域网文件互传：手机扫码 ↔ 运行 Polaris 的电脑。桌面还能经 AI（MCP）把任意本地文件一键投到手机。
> 定位补齐 clip-relay（只做文本接力）之后的文件维度；零云、零账号、零外网请求。

## 1. 目标与非目标

**目标**
- 手机浏览器扫码 → 上传（含拍照即传）/ 下载 / 删除，无需安装任何 App。
- 桌面面板：展示扫码入口（QR）、双向清单、手动上传下载、TTL/上限设置、服务管理。
- AI：`drop_send <路径>` 把电脑文件投给手机；`drop_save` 把手机传来的文件落盘到指定路径。
- 跨域治理：手机页面由自家服务**同源**提供（无 CORS）；桌面面板数据走宿主 invoke（cap.kv）；
  大文件直传走 `http://127.0.0.1:<port>`（localhost 免混合内容，CORS 由自家服务显式放行）。

**非目标（如实交代）**
- 不做公网穿透（离开同一局域网不可用——这是特性不是缺陷）。
- 不做断点续传、不做多接收端同步。
- 不做文本接力（clip-relay 已覆盖）。
- 手机端不要求装 Polaris——纯浏览器页面。

## 2. 架构（三类进程 + 数据面）

```
手机浏览器 ──同源 HTTP──▶ 服务进程（node，0.0.0.0:9867，PIN 门禁）
                            ├─ GET /          手机页面（内联 HTML，零依赖）
                            ├─ POST /u        上传（流式落盘 + 进度 + 限长）
                            ├─ GET /f/<id>    下载/预览（attachment / inline）
                            └─ DELETE /f/<id> 删除
桌面面板 ──__POLARIS_HOST_INVOKE__──▶ RouterBus cap.kv ◀──单写投影/心跳── 服务
桌面面板大文件直传 ──XHR http://127.0.0.1:9867（localhost 混合内容豁免 + 自家 CORS）
AI(MCP) ──cap.kv 命令键──▶ 服务（先删后做）──▶ 本地 fs 拷贝（零桥上字节）
```

- **元数据权威在本地**：`<dirname(dataRoot)>/polaris-drop/meta.json`（原子写）。
  kv 的 `pdrop.items` 是服务单写者的**只读投影**，崩溃/重启后由 meta.json 恢复再镜像——
  文件永远不会因 kv 不可用变孤儿。
- **存储位置**：dataRoot 的**兄弟目录** `polaris-drop/`（data-ark 同款约定——不污染备份源，
  TTL 过渡文件不进 data-ark 备份）。兜底 `appConfigDir/pocket-drop/`。
- **跨端一致性**：桌面/手机/Web 三端面板读同一 kv 投影；手机浏览器不装 Polaris 也能用。

## 3. 服务 HTTP API（除 /__health 外全部要求 `?pin=`）

| 端点 | 说明 |
|---|---|
| `GET /__health` | 宿主健康检查，恒 200（bridge 挂了也活着，降级见 meta） |
| `GET /` | 手机页面 |
| `GET /api/info` | `{ hostname, version, items, ttlHours, maxSizeMb, lanUrl }` |
| `POST /u?name=` | 原始字节流上传 → item；错误码 401/413(超单文件限)/507(超总容量)/429(限频) |
| `GET /f/<id>[?dl=1]` | 文件输出；图片/文本默认 inline 预览，`dl=1` 强制下载 |
| `DELETE /f/<id>` | 删除条目 |

安全：
- PIN 常量时间比较（timingSafeEqual on sha256）；失败 5 次/分/IP → 429 锁 60s（内存表，限频键=IP 维度）。
- 文件名清洗（去路径分隔符/控制字符/保留名，≤180 字符）；存储名 = 随机 id，**无任何用户可控路径**。
- 上传流式落盘边写边计数，超限即毁流删残片；条目数 ≥200 或总字节超 `totalCapMb` 拒收（507）。
- CORS：`Access-Control-Allow-Origin: *`（服务是自家数据面，桌面面板直连必需；PIN 仍是门禁）。
- Windows 首次 0.0.0.0 监听会触发防火墙提示（README 明示）。

## 4. 键空间契约（前缀 `pdrop.`，权威）

| 键 | 写者 | 内容 |
|---|---|---|
| `pdrop.settings` | 面板/MCP（服务仅在键缺失时引导写默认+随机 PIN） | `{ pin, ttlHours, maxSizeMb, totalCapMb }` |
| `pdrop.meta` | 服务（60s） | 心跳：version/pid/startedAt/lastTickAt/bridge/degraded/port/lanUrls/lanUrl/dropDir/itemCount/storeBytes |
| `pdrop.items` | 服务（单写投影） | `{ at, items: Item[] }`；Item=`{ id, name, size, at, expiresAt, from: 'phone'\|'desktop'\|'ai', note? }` |
| `pdrop.cmd.send.<nonce>` | MCP/面板 → 服务消费 | `{ op:'send', path, note? }` |
| `pdrop.cmd.save.<nonce>` | MCP/面板 → 服务消费 | `{ op:'save', id, dest, confirm? }`（覆盖已存在文件需 confirm） |
| `pdrop.cmd.clear.<nonce>` | MCP/面板 → 服务消费 | `{ op:'clear', confirm:true }`（必须显式 confirm） |
| `pdrop.result.<nonce>` | 服务 | `{ ok, error?, itemId?/dest?, at }`（消费方读后删） |
| `pdrop.event.<13位ts>` | 服务 | `{ type, at, summary }`，保留 50 条 |

命令消费**先删后做**（两个消费者并发时 delete 天然互斥，执行至多一次）。

## 5. 设置规范化（core.normalizeSettings，非法回落）

| 字段 | 默认 | 范围 |
|---|---|---|
| `pin` | 首次随机 6 位数字 | `/^\d{4,8}$/` |
| `ttlHours` | 72 | 1–720 |
| `maxSizeMb` | 2048 | 1–8192 |
| `totalCapMb` | 10240 | 256–65536 |

## 6. MCP 工具（5 个，中文描述带适用句式）

| 工具 | 说明 |
|---|---|
| `drop_send(path, note?)` | 把电脑本地文件投给手机（复制进投递区，零桥上字节）。适用：「把 xxx.xlsx 传到我手机」 |
| `drop_list()` | 当前投递清单（方向/大小/剩余时间） |
| `drop_save(id, dest, confirm?)` | 把手机传来的文件保存到绝对路径；覆盖已存在文件需 `confirm:true` |
| `drop_clear(confirm)` | 清空投递区（危险，confirm 门） |
| `drop_status()` | 服务状态/局域网地址/存储目录/统计 |

## 7. 面板（3 Tab）

- **快传**：服务状态徽章（心跳/降级/端口）、QR（面板本地渲染，shared/qr.js）、链接+复制、
  手动上传（XHR 127.0.0.1 直传带进度；失败诚实给替代路径「让 AI 用 drop_send」）、
  双向清单（方向徽章/大小/剩余 TTL/下载/删除）。
- **动态**：事件流（收/发/清理/PIN 变更/降级恢复）。
- **设置**：TTL/单文件上限/总容量/重新生成 PIN、服务管理卡（discover 自举 start/stop/restart）、
  存储目录与占用、清空全部（红色二次确认）。

## 8. 验证

1. `node test/run-tests.mjs` —— shared/core.js 纯函数行为级单测（文件名清洗/设置规范化/
   TTL 清扫计划/容量判定/LAN 地址优选/限频器/事件修剪/同名列冲突）。
2. `tsc --noEmit` + esbuild 构建面板。
3. `node test/smoke-real.mjs` —— 真实桥全链路：发现桥 → 业务键护栏 → spawn 服务 →
   /__health → PIN 门禁 401 → 上传/下载字节一致 → TTL 清扫 → MCP initialize/tools/list/
   drop_send/drop_list 闭环 → 清场（杀进程/删 store/删全部 pdrop.* 键）→ N/N 报告。

## 9. 已知边界

- 桌面面板直传依赖 webview 允许 fetch `127.0.0.1`（Chromium 系豁免混合内容；实测 WebView2 可用）。
  若被 CSP/环境拦截，面板给出替代路径：AI `drop_send`。手机路径不受影响。
- 服务端口固定 9867；被占用时服务诚实失败退出（log 明示），不静默换端口（健康检查会跟着漂移）。
- 局域网可见性 = 特性：同一 Wi-Fi 下任何设备凭 PIN 可访问；改 PIN 立即生效（手机端需重输）。
