# relay-devkit · HTTP 请求超时移除与手动中断 · 规划文档

> 状态：**仅规划，未实施** · 起草日期：2026-10-26 · 基于 v1.4.1
> 目标：HTTP 工具发送链路不再受 30s 硬编码限制；等待期间支持用户手动中断（真实终止优先，降级态明示）。

---

## 1. 背景与现状

### 1.1 "30 秒"的来源

`src/tools/api.js:329` —— HTTP 工具面板模式发送路径，**硬编码**：

```js
const r = await capHttpRequest({ method, url, headers, body: body||'', bodyType: t.bodyType||'text', timeoutMs: 30000 });
```

请求链路与超时执行点（插件自身**不执行**任何 HTTP 超时，`timeoutMs` 只随 payload 传给宿主）：

```
面板 UI (api.js)
  → tauriInvoke('router_dispatch')      (src/core/cap-http.js)
    → 宿主 RouterBus → cap.http → 宿主 reqwest   ← timeoutMs 在这里被真正执行
      → 目标服务器
```

### 1.2 插件内完整超时矩阵

| 路径 | 超时值 | 位置 |
|---|---|---|
| HTTP 工具 · 面板 cap.http 直发 | **30s（硬编码）** | `src/tools/api.js:329` |
| DB 工具 · `/__db` 请求 | 25s | `src/tools/db.js:88` |
| DB 工具 · Supabase 请求 | 未传 → 默认 20s | `src/tools/db.js:104` 走 `cap-http.js:44` 的 `timeoutMs \|\| 20000` |
| 独立窗口 · 浏览器 fetch 直连 | 浏览器默认（约 300s） | `api.js:351` |
| 独立窗口/面板 · `/__proxy` 中继转发 | **无任何超时** | `relay_server/proxy.js` 的 `once()`：`lib.request` 无 `timeout`、无 `req.setTimeout`，上游永不响应则**永久挂起** |

其他相关超时（本次不动）：`plugin.json` `healthCheckTimeout: 3000`；`relay_server/db.js` MySQL `connectTimeout: 8000`。

### 1.3 现有问题清单

1. 30s 硬编码，UI 无超时设置项，无每请求覆盖能力。
2. 三处数值不一致（30s / 25s / 20s），无统一常量。
3. 30s 是"全请求"时长（连接 + 服务端处理 + 下载完整体）。cap.http 为**缓冲式响应**（body 全量返回），慢接口/大下载超 30s 即被掐断。
4. 用户无法取消：发送中 `sendBtn.disabled=true`，前端未接 AbortController，只能干等 30s。
5. `/__proxy` 中继链路反而是唯一完全无保护的路径（无超时、无取消联动）。
6. 超时错误提示依赖宿主返回体：`cap-http.js:48` `res.ok===false` 时抛 `(res && res.error) || 'cap.http 请求失败'`，宿主若不带 `error` 字段，用户只能看到笼统"请求失败"，无法区分超时/网络错误。

---

## 2. 目标

1. **移除时间限制**：HTTP 工具发送不再有前端强加的 30s 上限，等待多久由目标服务器/用户决定。
2. **手动中断**：发送中可随时停止（按钮 / 快捷键），中断后 UI 立即回到空闲态。
3. **尽量真实终止**：中断意味着底层连接被销毁，而不是只把 UI 假装修复、后台连接继续挂着；无法真实终止的场景（cap.http 面板直发）必须明示降级语义。

**范围界定（明确不做）**

- 不做可选超时配置 UI（另立需求）。
- 不改 DB 工具超时（25s / 20s）与 MySQL `connectTimeout`。
- 不动宿主 reqwest 自身行为（超出本仓库，见 §3 前置验证）。

---

## 3. 关键前置验证（宿主行为，落地前必做）

宿主 reqwest / cap.http 在 Polaris 主程序仓库，本仓库无法直接确认。需要验证两点：

| # | 验证点 | 为什么重要 | 验证方法 |
|---|---|---|---|
| V1 | `timeoutMs` **不传或传 `0`** 时宿主行为：无限制？还是回退到宿主自己的默认超时？ | 若回退默认值，只删前端 30000 根本不生效 | 本地起一个 accept 后不回数据的挂起源，分别传 `0` / 不传 / 传大值，实测多久返回错误 |
| V2 | cap.http 是否支持取消动作（如 `{'action':'cancel', requestId}`） | 决定面板直发模式能否做到**真实终止**（设计档位见 §4 B-3/T1 vs T2） | 查主程序 cap.http 能力注册代码。先例：`cap.ai.chat` 已有 `action:'interrupt'`（见 `plugins/multichat/src/cap.ts:89`），证明总线协议支持"事后取消"场景 |

验证### 3.1 验证结论（2026-10-26 宿主检查回填，宿主 v10.9.5）

> 宿主实现：`D:\space\base\Polaris\src-tauri\src\services\router\http_capability.rs`（cap.http）、
> `commands/router.rs` + `services/router/mod.rs`（dispatch 层）、`bash_capability.rs`（取消范式先例）。

**V1 结论：`timeoutMs=0` 不等于"无限制"，会瞬间失败；插件传 30000 的原因已查明**

- 无传时宿主默认超时仅 **15s**（`DEFAULT_TIMEOUT_MS = 15_000`，http_capability.rs:59）——插件以前传 30000 正是为了越过它。
- 宿主实现 `.timeout(Duration::from_millis(timeout_ms))` **无条件生效**；reqwest 0.12.28（Polaris 钉版）全源码**没有 is_zero 特判**（已查 vendored 源码），`total_timeout = timeout.map(tokio::time::sleep)` → 传 0 则 sleep(0) 立即触发，**请求直接秒败**。
- `ClientBuilder::timeout()` 在 0.12 只收 `Duration`（收不进 None），但内部 `config.timeout` 是 `Option<Duration>`——**不调用 timeout() 即无限制**。因此"`0`=无限制"必须由宿主改一行实现：`do_request` 里 `if timeout_ms > 0` 才设 timeout。
- **新发现：dispatch 层还有一道 900s 外护栏**。`router_dispatch`（commands/router.rs）= `spawn_blocking(dispatch)` + `tokio::time::timeout(DISPATCH_SYNC_TIMEOUT=900s)`（router/mod.rs:98）。护栏只解除调用方阻塞（返回"dispatch 超时（上限 900s）"），**blocking 线程无法强取消，reqwest 请求在后台继续跑完**。
  - 推论①：面板路径无论传多大 `timeoutMs`，实际等待上限被 900s 封顶（约 15 分钟）。
  - 推论②：真正"无限等待"在同步 dispatch 通道上做不到——`0=无限制` + 接受 900s IPC 硬顶是宿主现状下的最优解（900s 本就是合理的宿主级兜底）。
  - 推论③：每次 dispatch 占一个 blocking 线程直至 HTTP 完成。无超时请求挂起 = 该线程被占最长 900s。tokio blocking 池上限（默认 512）下可接受，但要写进风险区。

**V2 结论：cap.http 无 cancel 动作，且实现为全同步阻塞，现阶段无法真实终止**

- 动作清单只有 `["ping","request"]`（HTTP_ACTIONS，http_capability.rs:62），describe 同源，无 cancel/interrupt。
- `invoke()` 是 `block_on_async` → `block_in_place` + `block_on` 的**同步阻塞**实现：从 dispatch 进入到 HTTP 完成一直持有调用线程，宿主**没有 in-flight 请求注册表**，无从外部取消。
- 先例确认：`cap.bash` 有完整"任务表 + kill"范式（`run/status/log/wait/kill/list`，bash_capability.rs:64；且支持"`timeoutMs` 0=不设超时上限"）。cap.http 要真实终止可行，但需宿主改造（见 B-3 升级路径）。

**三家竞争参数汇总**（设计决策输入）：

| 超时来源 | 值 | 说明 |
|---|---|---|
| cap.http 默认（不传） | 15s | `DEFAULT_TIMEOUT_MS` |
| 插件 HTTP 工具现状 | 30s | `api.js:329` 硬编码 |
| router_dispatch IPC 护栏 | **900s** | `DISPATCH_SYNC_TIMEOUT`，同步 dispatch 的绝对上限 |
| reqwest 段条件下限 | 可无限制 | 需宿主改 `timeout_ms > 0` 才设 |

---

## 4. 方案设计（按三条请求路径拆解）

### A. 移除时间限制（参数策略已依 V1 结论确定）

两档实施（不做宿主改造为默认档）：

- **P0（纯插件可做）**：`api.js:329` 移除 30s 硬编码 → 传防御性大值（如 `86_400_000`）。实际等待被宿主 IPC 护栏封在 **900s**（§3.1），不再受 30s 卡壳；reqwest 段的 86400s 在命中 900s 护栏前永远不生效，等于被旁路。
- **P1（宿主一行改造，可另行排期）**：`http_capability.rs` `do_request` 里 `if timeout_ms > 0` 才设 `client.timeout()`，`0` 语义 = reqwest 段无超时；插件层 `0` 透传。等待上限仍是 900s IPC 护栏（宿主统一兜底，建议保留）。
- **保留** `timeoutMs` 参数本身：少一道保险就是一道事故面，`0`（P1）或大值（P0）之外仍允许显式传任意值。

- DB 工具各超时不在本次范围。

### B. 手动中断（三路径、三机制）

> 依 V2 结论：B-3 当前**只能走 T2 降级档**；T1 需宿主改造，作为升级路径单列。

**B-1 浏览器直连（独立窗口、非代理模式）** —— 零外部依赖，现成能力：

- `api.js:351` 的 `fetch()` 接 `AbortController`；
- 请求态包一层 `t.abortCtl`（挂 tab 对象），停止按钮调 `t.abortCtl.abort()`；
- 中断后响应记为 `{ error: '已手动中断', aborted: true, timeMs }`，status 栏提示 `请求已中断 · N ms`。

**B-2 `/__proxy` 中继路径** —— 前端 + 本插件服务端，可做真实终止：

- 前端同样 AbortController：abort 会关闭前端与本地 relay-server 的 TCP 连接；
- `relay_server/proxy.js` 改造（现在的 `once()` 是纯 Promise，收不到取消信号）：
  - `once()` 暴露具备中止能力的句柄（或改为接收 onAbort 回调）；
  - `proxyHandler` 监听 `req.on('close')` / `res.on('close')`，客户端断开 → `r.destroy()` 销毁上游转发；
  - **注意**：重定向 hop 循环（`proxy.js:90` 最多 5 跳）也要能被中断——每跳结果回传前先检查"是否已断开"，断开则跳出循环并停止跟跳；
  - 该改造同时顺手修复"上游永不响应则永久挂起"的固有隐患——不再靠加超时，而是靠客户端断开联动（与"移除时间限制"的语义自洽）；
  - 回归风险：正常结束路径绝不能被提前 `r.destroy()` 丢掉响应体。

**B-3 cap.http 面板直发** —— V2 已定论：宿主无 cancel，现状只能 T2：

- **T2 降级档（当前唯一可行）——"逻辑中断"**：
  - Tauri `invoke` 的 Promise 本身**不可取消**；宿主 `invoke()` 为同步阻塞实现（`block_on_async` → `block_in_place` + `block_on`），无 in-flight 注册表——提前结束 `await` 无法通知宿主，宿主 reqwest 会继续在后台跑完该请求，blocking 线程与连接持续占用（P0 大值下最长 900s 被 IPC 护栏解除调用方阻塞，但 reqwest 段仍跑完）；
  - 前端只做：标记中断（§D）→ 停止按钮生效、UI 空闲 → 迟到的响应结果静默丢弃；
  - 影响面可控：devkit 是调试工具，后台多跑一个被遗弃请求通常无害；但代码注释与本文档必须明示这一语义差异。
- **T1 真实终止档（宿主改造，升级路径单列）**：
  - 参考范式：`cap.bash` 的"任务表 + kill"（`run/status/log/wait/kill/list`，bash_capability.rs:64；且 bash 先例证明 `timeoutMs 0=不设上限` 语义在宿主可表达）；
  - 关键设计差异：HTTP `request` 是**一次性返回、无 ack/chunk 通道**，无法像 cap.ai.chat 那样从 ack 拿 sessionId——**requestId 由调用方生成并随 request payload 上送**，宿主按可选参数接受；
  - 宿主改造内容：dispatcher 注册 `requestId → tokio JoinHandle` 句柄表 + 新增 `{'action':'cancel', requestId}` 查表 abort + `HTTP_ACTIONS`/describe/错误文案同步扩展；原 request 的 dispatch 在 abort 后以错误 resolve；cancel 作为独立 invoke 与 request 并发（Tauri IPC 天然支持）；
  - 插件侧仅加一行 cancel 调用即可从 T2 升级 T1。`src/bin/cap_http_check.rs` 已有验证通道，可扩挂起源用例佐证 cancel。

### C. UI / 交互

| 状态 | 表现 |
|---|---|
| 空闲 | `sendBtn`：`发送 <span class="k">⌘↵</span>`（现状） |
| 发送中 | `sendBtn` 变为**可点击**的「■ 停止」（现在 `btn.disabled=true` 是必须改掉的交互点）；建议附 pulse 提示引导注意（复用 `api.js:554` 已有的 pulse-hint 手法） |
| 等待计时 | 响应区显示已等待秒数（起点 `performance.now()` 的 `t0` 已存在，补 1s interval 更新） |
| 中断后 | 响应区 `{error:'已手动中断', aborted:true}`；status 栏 `请求已中断 · N ms`；按钮回"发送" |

- 多标签页天然隔离：in-flight 状态全部挂 tab 对象（`t.sendSeq` / `t.abortCtl` / `t.cancelReqId`），切走再切回，停止按钮状态跟随当前 tab 渲染。

### D. 迟到响应回收（竞态防护，必做）

无论哪条路径、哪一档中断，**被中断请求在真正返回时都不能写回 UI**。当前 `send()` 是单 await + finally 解锁按钮的结构，一旦改成"中断即结束 await"，迟到 resolve 会引入两个 bug：按钮在错误时机被 re-enable；响应被渲染到已中断的 tab。

设计：

- 每 tab 维护 `sendSeq`，每次 `send()` 自增；
- 异步回调闭包捕获发送时的 seq；
- 写回前校验 `seq === t.sendSeq && !t.aborted`，不匹配则**整段丢弃**，并 revoke 已创建的 `blobUrl` 防内存泄漏；
- finally 解锁按钮的职责转移给"中断分支 + 正常完成分支"显式处理，不再无差别解锁。

### E. 错误信息语义

- 中断与超时/网络错误区分展示：`aborted → '已手动中断'`；
- cap-http 层错误透传保持 `res.error` 优先（宿主的描述通常更准确），兜底文案注明可能原因。
- 宿主实测：reqwest 超时错误经 `cap.http 请求失败: {e}` / `cap.http 读取响应失败: {e}` 透出，reqwest::Error 的 Display 不带 source 链，**插件无法从字符串可靠区分"超时"与"网络错误"**；若后续需要精确区分，需宿主侧为超时约定专门错误码（可并入 T1 改造清单）。

---

## 5. 改动清单（文件级）

| 文件 | 改动 | 类型 |
|---|---|---|
| `src/core/cap-http.js` | ① 默认 20s 收敛为"仅显式传入生效"；P0 档 api.js 显式传防御性大值（86_400_000），P1 档透传 0 ② `cancelCapHttp` 预留（T1 升级时启用，requestId 由调用方生成）③ 注释补记超时语义与 900s IPC 护栏说明 | 前端核心 |
| `src/tools/api.js` | ① 移除 329 行硬编码 30s（P0：传大值；P1：传 0）② tab 挂 in-flight 状态（`sendSeq`/`abortCtl`）③ sendBtn 双态（发送/停止）④ 等待计时 ⑤ 迟到响应守卫（§D）⑥ 中断分支 | 前端 UI 逻辑 |
| `relay_server/proxy.js` | `once()` 支持外部中止；`proxyHandler` 监听客户端断开 → `r.destroy()` 上游转发；hop 循环可被中断 | 服务端 relay |
| `docs/devkit-architecture.md` | 补记"无超时 + 手动中断"语义与三路径机制差异 | 文档 |
| `dist/panel.js` | `build.js` 重新构建同步 | 构建产物 |

## 6. 风险与边界

1. **cap.http 缓冲式响应的内存压力**：无超时后，大响应会把 base64 全量堆进前端 + 宿主双份内存；宿主已有 `MAX_BINARY_BYTES = 32MB` 二进制上限（http_capability.rs:56），文本响应无上限——靠"停止按钮足够显眼"兜底（§C）。
2. **宿主 blocking 线程占用**：每次 cap.http dispatch 经 `spawn_blocking` 占用工作线程直至 HTTP 完成；T2 逻辑中断下被遗弃请求继续占用（最长 900s 被 IPC 护栏解除调用方阻塞，reqwest 段跑完后线程释放）。devkit 属低频调试场景，tokio blocking 池（默认 512）可承接；避免高频并发无超时请求即可。
3. **T2 降级中断的宿主残留**：后台请求会继续跑完（见 B-3），文中已明示；升级 T1 待宿主排期。
4. **900s IPC 护栏即事实等待上限**：P0/P1 下仍在；超过 900s 的响应直接返回"dispatch 超时（上限 900s）"且后台继续——UI 需文案说明该兜底的存在（可在等待 >60s 时提示）。
5. **proxy.js 中断联动的回归风险**：正常路径不得被提前 destroy 丢响应；hop 循环中断条件勿漏；测试面覆盖。
6. **竞态测试面（§D）**五个必测场景：挂起源（永不响应）· 慢下载（分批吐字节）· 5+ hop 慢重定向中途中断 · 快速"停止→立即重发" · 切换 tab 后原请求迟到返回。

## 7. 实施顺序建议（供后续参考）

1. ~~V1/V2 宿主验证~~ **已完成**（§3.1；宿主改造若启动，另在 Polaris 仓立项）；
2. B-1 浏览器直连中断（最简单、无外部依赖，先打通 UI 双态与竞态守卫框架）；
3. §D 迟到响应守卫（基础设施）；
4. B-2 proxy 中断联动 + hop 循环；
5. B-3 cap.http 走 T2 降级档（UI 与文案明示语义）；
6. A 超时参数落地（P0 即可独立发布，P1 依赖宿主一行改造另排）；
7. 全量五场景回归 → 构建 dist → 文档补记 → 版本号升级。

---

## 附·版本记录

| 日期 | 事项 |
|---|---|
| 2026-10-26 | 完成现状分析：30s 定位于 `api.js:329` 硬编码；三路径超时矩阵梳理；确立"移除限制 + 手动中断"规划与本方案。 |
| 2026-10-26 | 宿主项目检查回填：`timeoutMs=0` 瞬败非无限（reqwest 0.12 无 is_zero 特判）；宿主默认 15s；`router_dispatch` 有 900s IPC 护栏且 blocking 线程不可强取消；cap.http 无 cancel 动作、同步阻塞实现——B-3 定档 T2，T1 改造方案以 `cap.bash` 任务表 + kill 为范式单列。§4-A 落定为 P0（纯插件）/P1（宿主一行）两档。 |
