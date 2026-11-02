# ds 大肥鱼 / 多宠物框架整体方案

> 范围：whale-pet 插件从"单宠物硬编码"演进为"统一宠物框架"，支持多宠物接入、AI 双向交互、桌面悬浮、移动端可达。
> 来源：2026-11-02 落地 whale-pet v0.3.2（dsh-pet 形象复刻）后，用户提出的扩展需求与 APK 端问题分析。
> 状态：方案定稿，待分阶段实施。实施前先补 `plans/` spec（AGENTS.md §二.4）。

---

## 一、背景与现状

### 已落地（whale-pet v0.3.2）
- 活动栏面板内一只 dsh 同款蓝鲸：109 个 webm 逐帧动画 + video 双缓冲状态机
- 资源经插件自带 HTTP 服务（`server.js`，127.0.0.1 + localhost 双栈）加载
- 走 `plugin_service_list`（白名单内）查端口 + `fetch` 拉资源
- 动画链：idle 循环 → 点击回应（5 种）→ 拖拽 → 80 类随机动作 → 自动接续
- 发布拆分：主 zip 8.8KB（代码）+ 独立 tag `whale-pet-assets-vX.Y.Z`（webm，单文件 <2MB，规避 jsdelivr 50MB 单包上限）

### 已知缺口（本方案解决）
1. **APK 端不可用**：手机是远程壳，`fetch localhost:9863` 连的是手机本机，不是桌面
2. **硬编码**：动画池、状态机、资源路径全写死在 Panel.tsx，无法接入其他宠物
3. **无 AI 交互**：大肥鱼只是被动播放，不能被 AI 触发动作，状态也不回传
4. **无桌面悬浮**：只在活动栏面板内，不能在桌面自由游走
5. **无多宠物/宠物团**：只能一只，无交流机制

---

## 二、目标（分层）

| 层 | 目标 | 形态 |
|---|---|---|
| L0 | APK 端可达 | 纯插件，复用 cap.http |
| L1 | 统一宠物框架 | 抽 `pet-host` 渲染器 + `pet.json` 契约 |
| L2 | 多宠物接入 | 每宠物一个插件，复用渲染器 |
| L3 | AI 双向交互 | MCP 工具触发动作 + 状态回传 |
| L4 | 桌面悬浮 | 动宿主，新增 cap.window.overlay |
| L5 | 宠物团交流 | 多宠物共享服务 + 事件广播 |

---

## 三、架构设计

### 3.1 分层与所有者

```
┌─────────────────────────────────────────────────────┐
│  宠物插件层（每宠物一个插件）                          │
│  whale-pet / cat-pet / dog-pet / ...                │
│  只提供：pet.json（动画池+权重+资源 URL）+ assets    │
│  不含渲染逻辑（复用 pet-host）                        │
└───────────────┬─────────────────────────────────────┘
                │ 声明 contributes.pets[]
┌───────────────▼─────────────────────────────────────┐
│  pet-host 渲染框架（独立插件 pet-host）                │
│  通用：video 双缓冲 + 状态机 + 资源代理 + AI 桥        │
│  所有者：动画状态机、Blob URL 生命周期、播放队列        │
└───────────────┬─────────────────────────────────────┘
                │ 经 cap.* 总线
┌───────────────▼─────────────────────────────────────┐
│  宿主能力层（Polaris 主仓，L4 才动）                   │
│  cap.http（资源转发，已装）                           │
│  cap.window.overlay（L4 新增，透明置顶窗口）           │
│  cap.kv（状态持久化，已装）                           │
└─────────────────────────────────────────────────────┘
```

### 3.2 时序（资源加载，桌面 + 移动统一）

```
面板打开
  → pet-host 读 pet.json（本插件 manifest declares.pets[0]）
  → 查资源来源：
      桌面：plugin_service_list → localhost:<port>（本地 server.js）
      移动：cap.http 转发 → 桌面 server.js（cap.http 在桌面执行）
  → 状态机启动：idle 循环
  → 事件触发：
      用户点击 → clicks 动画池随机
      AI 经 MCP 工具 → 指定动作（L3）
      定时掷骰 → categories 随机动作
  → 播完 → 回 idle 或下一动作（rollNext）
```

### 3.3 幂等与边界
- **动画状态机单一所有者**：pet-host 持有 `currentAnimRef` + `loadingGenRef`（世代号丢弃迟到加载），同一时刻只有一个 pending 换源
- **Blob URL 生命周期**：换源时 revoke 旧 URL，组件卸载时清理全部
- **资源代理缓存**：server.js / cap.http 拉过的 webm 落盘 `.asset-cache/`，后续直读
- **状态持久化**：互动次数、当前心情走 `cap.kv`（domain=`pet-host`），单宠物隔离 key 前缀

---

## 四、pet.json 契约（统一规范核心）

```jsonc
{
  "pets": [
    {
      "id": "whale-pet",
      "name": "ds大肥鱼",
      "assetSource": {
        "type": "plugin-service",          // plugin-service | cdn-tag | cap-http
        "serviceId": "whale-pet-assets",
        "cdnTag": "whale-pet-assets-v0.3.2" // cdn-tag 形态用
      },
      "animations": {
        "idle": ["待机呼吸休闲"],
        "turn": ["东张西望"],
        "drag": ["被鼠标拖拽悬空反馈"],
        "clicks": ["点击回应-开心跃动", "..."],
        "categories": [
          { "id": "小动作", "weight": 20, "actions": ["..."] },
          { "id": "玩耍", "weight": 20, "actions": ["..."] }
        ],
        "events": {
          "balance": ["余额-钱袋满溢", "..."],   // L3：AI 触发
          "workStatus": ["工作状态-思考冒泡", "..."]
        },
        "sleep": { "start": ["睡觉-开始"], "loop": ["睡觉-循环"], "end": ["睡觉-起来"] }
      },
      "weights": { "idle": 10, "turn": 5, "move": 5 },
      "ext": ".webm"
    }
  ]
}
```

**manifest 声明**：
```jsonc
"contributes": {
  "pets": [{ "id": "whale-pet", "config": "./pet.json" }]
}
```

pet-host 读 `contributes.pets[]` 注册所有宠物，面板按 `petId` 渲染对应宠物。

---

## 五、分阶段实施

### Phase 0：APK 端修复（L0，纯插件，优先）✅ v0.3.3 已发布
**问题**：手机 `fetch localhost` 连手机本机，不是桌面。
**实际落地**（2026-11-02，commit `a4e0a3f` + 发布 `198d690`）：
- **通道自动探测**替代 `isMobileTauriRuntime()` 判断：先试 direct（桌面直连 localhost 流式），失败再试 viaCap（宿主 cap.http 转发）——任何环境自动选命中通道，更鲁棒
- viaCap 实际动作是 `cap.http` `action:"request"`（非 `fetch`），`url` 指向 `http://127.0.0.1:<port>/asset/webm/<anim>.webm`；`video/webm` MIME → 响应 `isBase64:true` → base64 转 Blob URL
- **权限层已确认**（policy_permission.rs）：`cap.http` 对 Remote 内置 deny，但生产数据根 config 已有 `cap.http source=remote allow`（精确规则特异性 2 > 内置通配 deny）+ `web.token` 鉴权 → 手机已鉴权连接可调
- **性能**：viaCap 结果按 anim 缓存（Map），同动画复用，避免高频切换反复下载 base64；组件卸载统一 revoke blob URL
- **验证**：server.js 实测 `__health` 200 + `video/webm` 441KB + webm 魔数 `1a45dfa3`；base64 往返还原一致

**改动**：仅 Panel.tsx 资源加载层 + server.js 无需改（cap.http 转发到同一个 localhost 服务）。
**验收**：协议层已验证（health/webm/base64 往返）；手机端真机验收待用户确认（APK 需重装或插件更新触达）。

### Phase 1：统一宠物框架（L1 + L2）
**方案**：抽 `pet-host` 插件——
- 通用渲染器：video 双缓冲 + 状态机 + 资源代理（桌面 fetch / 移动 cap.http）
- 读 `contributes.pets[]` 注册所有宠物
- whale-pet 改为只提供 `pet.json` + assets，删掉自己的 Panel.tsx 渲染逻辑
- 新宠物（cat-pet 等）只需 `pet.json` + assets 即可接入

**改动**：新建 `pet-host` 插件；whale-pet 瘦身为"资源 + pet.json"。
**验收**：whale-pet 经 pet-host 渲染效果与 v0.3.2 一致；新建一个 demo 宠物（如用 whale 的少量动画做"小鲸鱼"）验证多宠物。

### Phase 2：AI 双向交互（L3）
**方案**：
- **AI → 宠物**：pet-host 提供 MCP 工具 `pet.trigger(petId, animName)` —— AI 可指定播放某动作（如"让大肥鱼表演写代码"）
- **宠物 → AI**：pet-host 经 `cap.ui.chat` 或 chat-event 推送宠物状态（如"大肥鱼现在在睡觉"），AI 可据此回应
- **事件联动**：AI 对话轮次开始/结束 → 触发 `workStatus` 动画；余额变化 → 触发 `balance` 动画（接 Polaris `context-cost-meter`）

**改动**：pet-host 加 MCP server（`mcp/server.js`，声明 `pet.trigger` / `pet.state` 工具）。
**验收**：对 AI 说"让大肥鱼写代码"，大肥鱼播放"写代码"动画；AI 轮次结束大肥鱼播放"雀跃庆祝"。

### Phase 3：桌面悬浮（L4，动宿主）
**方案**：Polaris 主仓新增 `cap.window.overlay` capability——
- 透明、无边框、置顶、skipTaskbar 的独立窗口
- pet-host 在悬浮窗口里渲染宠物（webm 播放）
- 拖拽改变位置（记忆位置走 cap.kv）
- AGENTS.md §三.2 cap 清单同步（28 → 29）

**改动**：主仓 `src-tauri/src/services/router/` 新增 `window_overlay_capability.rs` + `tauri.conf.json` capabilities 放行；pet-host 加悬浮窗口入口。
**门槛**：`cargo check` + `cargo check --no-default-features --bin polaris-web --bin polaris-mcp` + clippy。
**验收**：桌面任意位置出现悬浮大肥鱼，可拖拽，不挡任务栏。
**注**：动宿主需先在 `plans/` 补 spec 说明插件形态不可行的原因（悬浮窗口是 Tauri window 能力，插件进程无法创建）。

### Phase 4：宠物团交流（L5）
**方案**：
- 多宠物共享一个 pet-host 服务进程
- 宠物间事件：经 `cap.kv` pub/sub 或 chat-event `mc-pet-` 前缀广播
- 场景：A 宠物打招呼 → B 宠物回应；多宠物协同动作

**改动**：pet-host 加事件总线层。
**验收**：两只宠物能互相触发动作（如大肥鱼挥手 → 小猫回应）。

---

## 六、APK 端问题详细分析（Phase 0 展开）

### 根因
手机 APK 是**远程壳**：WebView 经 WebSocket 连桌面后端（`getServerUrl()` 指向桌面机）。面板 `fetch('http://localhost:9863')` 在手机上连的是**手机本机**，而 server.js 跑在桌面 → 必然失败。

### 修复（Phase 0）
资源加载层抽象为 `loadAsset(name)`：
```ts
async function loadAsset(name: string): Promise<string> {
  if (isMobileTauriRuntime()) {
    // 移动：cap.http 转发到桌面 server.js
    const r = await capDispatch('cap.http', {
      action: 'fetch',
      url: `${DESKTOP_BASE}/asset/${encodeURIComponent(name)}`
    })
    return b64ToBlobUrl(r.body, r.contentType)  // base64 → Blob URL
  }
  // 桌面：直连本地 server.js
  return `${LOCAL_BASE}/asset/${encodeURIComponent(name)}`
}
```

**依赖**：`cap.http` 已装（记忆 `cap-http-capability` 验证可用）；`isMobileTauriRuntime` 已有。

---

## 七、非目标（明确不做）
- **不重写动画为矢量**：webm 逐帧动画是 dsh 原版机制，复刻形象必须用原素材
- **不做 OCR/语音宠物交互**（L3 只做动作触发 + 状态回传，不做多模态识别）
- **不做宠物商城**（多宠物靠插件市场现有机制分发，不单独建宠物市场）

---

## 八、风险与边界
- **资源体积**：每宠物 60MB webm，多宠物累计大——靠独立 assets tag + CDN 单文件 + 本地缓存控制
- **移动端流量**：手机经 cap.http 拉 webm 走桌面网络——建议移动端默认只加载 idle + 少量动作（`pet.json` 声明 `mobileSubset`）
- **悬浮窗口性能**：多悬浮 webm 同时播可能吃 CPU——L4 限制同时悬浮数 ≤ 2
- **协议无 schema 校验**（AGENTS.md §九）：pet.json 改动保守，保持关键字段不漂移

---

## 九、里程碑
- M0（Phase 0）：APK 端可达 —— ✅ 已发布 v0.3.3（协议层验证通过，真机待确认）
- M1（Phase 1）：pet-host 框架 + whale-pet 迁移 —— 2 天
- M2（Phase 2）：AI 双向交互 —— 1.5 天
- M3（Phase 3）：桌面悬浮（动宿主）—— 3 天（含 spec + cargo 门槛）
- M4（Phase 4）：宠物团交流 —— 2 天

---

## 十、继续实施方案（2026-11-02 规划复核）

> 基于 v0.3.3 发布后的代码事实复核，修正第四节契约设计，给出继续顺序与闸门。

### 10.1 契约修正：pet.json 不能走 `contributes.pets[]`
实测（主仓 `models/plugin.rs:150`）：`PluginManifestContributes` 是封闭结构
（views / mcp_servers / services / panel / engines / chat_cards / tool_providers /
capabilities / skills），manifest 里自定义 `pets` 字段会被 serde 静默丢弃，
`cap.pluginDiscovery:discover` 回传里拿不到。

**修正**：pet.json 由各宠物插件自己的 server.js 提供（`GET /pet.json`），
pet-host 经 `plugin_service_list` 发现全部宠物服务端口后逐个拉取。
`plugin_service_list` 返回形状已验证（whale-pet `Panel.tsx:77` 生产在用）：
`{ services: [{ pluginId, serviceId, port, state }] }`——含全量插件服务表，
pet-host 可据此发现任意宠物插件。纯插件，零宿主改动。
宿主侧 `contributes.pets` 字段留待 L4 动宿主时顺手加（可选，非依赖）。

### 10.2 Step 0 闸门：APK 真机验证 v0.3.3（先于 Phase 1）
M0 唯一未闭环验收项。Phase 1 会整体迁移资源加载路径，
基线未验证就迁移会混淆归因（"到底是通道坏了还是迁移坏了"）。
验收：插件市场更新 ds大肥鱼 → 0.3.3 → 打开面板蓝鲸播放。
失败时面板有可见错误文案（v0.3.2+ 失败可见化），原样回传即可定位。

### 10.3 Phase 1 开工前 spec 三决策（写入 spec 后动工）
1. **pet.json 分发**：server.js `/pet.json`（10.1 已定）。
2. **面板归属**：pet-host 独立 activityBar 入口（宠物选择器 + 通用渲染器）；
   whale-pet 保留自身入口一个版本周期显示「已迁移至宠物框架」引导，之后删除。
   附带验证点：`validate_manifest_fields` 是否允许「只有 services 无 views」的
   纯资源插件——决定 whale-pet 最终形态能否彻底去面板。
3. **代码搬迁**：通道探测 / video 双缓冲 / 状态机 / blob 缓存整体迁 pet-host；
   whale-pet 瘦身为 server.js（+pet.json）+ assets + MIT 声明。

### 10.4 Phase 2 通道定案
走 daw-studio v0.1.2 已验证先例（AI 经 MCP 写 → 面板轮询服务）：
MCP 工具 `pet.trigger` / `pet.state` / `pet.list` → 写 pet-host 服务
（HTTP POST localhost，MCP 与服务同在桌面侧）→ 面板 2~5s 轮询 `/commands` 执行。
MVP 只做 pull 状态 + trigger 动作；对话轮次联动（workStatus / balance 动画）
为 stretch，依赖 chat-event 通道可行性验证后另立项。

### 10.5 Phase 3 设计要点：悬浮窗自包含（新增）
悬浮窗**不加载宿主前端路由**（blob 形态 panel.js 无法在独立窗口复用），改由
`cap.window.overlay` 直接开 webview 指向 pet-host 服务自包含页：
`http://127.0.0.1:<port>/overlay.html?pet=<id>`（server.js 提供，播放自身 assets webm）。
拖拽 / 位置记忆经 Tauri IPC + cap.kv。宿主 spec 须写明插件形态不可行原因
（悬浮窗是 Tauri window 能力，插件进程无法创建，AGENTS.md §五）。
可与 Phase 2 并行启动 spec 撰写（spec 不依赖 Phase 1 代码）。

### 10.6 执行顺序与并行度
```
Step 0 真机验证（用户） ──┐
                          ├→ Phase 1 pet-host 框架 → Phase 2 AI 交互 → Phase 4 宠物团
Phase 3 宿主 spec 撰写 ───┘（并行，spec 先行不依赖 Phase 1）
```
移动流量护栏（`pet.json` 声明 `mobileSubset`）随 Phase 1 顺手落地。

---

## 十一、方案 v2：需求调研修订版（2026-11-02 定稿，**以此为准**，第十节排序作废）

> 依据桌宠品类外部需求调研 + 主仓能力勘探复核。第十节的契约结论（10.1 pet.json 走
> server.js、10.2 真机闸门、10.5 悬浮自包含页）继续有效；阶段顺序与重心重排。

### 11.1 调研结论（需求信号）
桌宠品类的核心价值收敛为四件事：
1. **真桌面栖居**：悬浮桌面上自由活动（贴边/游走/置顶可关）——用户第一诉求，
   也是 r/Windows11 高赞桌宠的差异点；"困在面板里"价值减半
2. **与你正在做的事联动**：Bongo Cat 靠键鼠联动爆红；AI 桌宠新趋势是连
   编程 agent（PetGen 连 Claude Code/Codex 完成任务主动通知、dsh-token-pet /
   dsh-companion 状态联动、像素守护者按 App 切状态）——**这是 Polaris 桌宠的
   天然差异化**，通用桌宠做不到
3. **轻养成**：摸头亲密度、喂食、番茄钟结算奖励（DyberPet 200 级养成 +
   番茄钟挂头顶）、《萌宠不摸鱼》掉落装扮
4. **碎碎念情绪价值**：「陪你摸鱼」是核心情绪产品（LoFi 貓）；dsh-pet 的
   余额气泡/窗口失焦系统通知同属此类

**dsh-pet 本体功能清单**（素材同源，即我们的对标基线）：会话活动→9 态轨道、
摸头亲密度 +1（10s 冷却）、拖拽悬空挣扎、自主游走朝向自适应、碎碎念气泡、
多开同屏多只。

**要避的坑**：性能（隐藏/遮挡时暂停渲染、全屏应用让路）、置顶要可关
（"仅桌面模式"是 shimeji 社区高频诉求）、透明渲染兼容。

### 11.2 重定位
**ds大肥鱼 = 接在 AI 工作台上的桌宠**，不是 Shimeji 克隆。三支柱：
桌面栖居（R1）+ AI 联动（R2，王牌）+ 轻养成（R4）。素材侧 109 个 webm 已
自带 余额/工作状态/睡觉/碎碎念 动作——AI 联动等于把 dsh-pet 缺宿主通道
做不了的部分补齐，素材利用率直接翻倍。

### 11.3 阶段重排

| 阶段 | 内容 | 对比 v1 |
|---|---|---|
| **Step 0** | APK 真机验证 v0.3.3（闸门不变） | 同 |
| **R1 悬浮栖居** | 桌面悬浮窗 + 拖拽/位置记忆/点击回应/夜间睡觉。**先 1 天 spike** | 原 Phase 3 提前，勘探后工作量大降 |
| **R2 AI 联动** | AIEvent→动画轨道（思考/工具执行/完成庆祝）、余额气泡、碎碎念、摸头亲密度 | 原 Phase 2 升级为王牌并扩容 |
| **R3 pet-host 框架** | 抽象 pet.json + 通用渲染器（10.1 契约有效） | 原 Phase 1 后置 |
| **R4 效率+养成** | 番茄钟/喝水提醒（service 定时+气泡）、cap.todo 联动（完成待办→庆祝） | 新增（调研产物） |
| **R5 多宠/宠物团** | 多开同屏 + 宠物互动 | 原 Phase 4 |

### 11.4 R1 关键勘探（2026-11-02 实测，改写工作量预估）
主仓 `src-tauri/capabilities/default.json` **已**给 webviews `["main","floating"]`
放行全套窗口操作权限：`set-always-on-top / set-skip-taskbar / set-decorations /
start-dragging / set-position / set-size / webview:create`（描述即
"Capability for the main window and floating window"，宿主悬浮岛已在用）。
**缺的只有「新建窗口」一个口子**（无 `core:window:allow-create`，且面板受
`__POLARIS_HOST_INVOKE__` 16 命令白名单限制）。两条路径，spike 后定：
- **路径 A（最小宿主改动，推荐起点）**：Rust 加一个建窗命令
  （transparent + alwaysOnTop + decorations:false + skipTaskbar，指向
  server.js 的 `overlay.html?pet=<id>` 自包含页）+ `default.json` webviews
  加 `"pet-overlay"` 一行 + 面板白名单加一项。约 1 个命令 + 2 行配置。
- **路径 B（治理完整）**：cap.bus 正式 `cap.window.overlay` capability
  （AGENTS.md 清单 28→29）。作为 R1 后续治理化演进，不阻塞首发。

悬浮页 AI 联动通道：overlay.html（server.js 同源页）**直连后端 WS**
（9820/9821，web.token 鉴权）订阅 AIEvent 流——spike 验证第三客户端
鉴权与事件过滤；面板形态则复用 app 内事件或轮询。

### 11.5 R1 spike 验收清单（1 天，决定 A/B 路径与 R2 通道）
- [ ] 透明无边框置顶窗口显示待机 webm，肉眼无黑底/白框
- [ ] start-dragging 拖拽顺滑，位置记忆（cap.kv）重启还原
- [ ] 点击/拖拽动画回应在悬浮窗内正常
- [ ] 隐藏/最小化 Polaris 主窗后悬浮窗独立存活；CPU 占用可接受（待机 <1%）
- [ ] 全屏应用前台时自动隐藏或让路（可选，spike 评估）
- [ ] overlay.html 连后端 WS 收到 AIEvent（R2 通道预研）

### 11.6 v1→v2 重排理由
v1 把框架（原 Phase 1）放在最前是"为多宠物优化"；调研显示**单宠物的
栖居+联动价值密度远高于第二只宠物**（品类第一诉求是桌面栖居，AI 联动是
差异化红利窗口）。先抽框架会把抽象押在"面板形态"上——悬浮形态定型后再
抽 pet-host 才不返工。真机闸门与 pet.json 契约结论不受影响。
