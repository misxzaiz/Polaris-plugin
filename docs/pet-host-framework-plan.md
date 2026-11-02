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

### Phase 0：APK 端修复（L0，纯插件，优先）
**问题**：手机 `fetch localhost` 连手机本机，不是桌面。
**方案**：面板资源加载增加 `cap.http` 路径——
- 桌面：`fetch('http://localhost:<port>/asset/...')`（现状，保留）
- 移动：`capDispatch('cap.http', { action: 'fetch', url: 'http://127.0.0.1:<port>/asset/...' })`（cap.http 在桌面执行，返回 base64/body）
- 自动判断：`isMobileTauriRuntime()`（已有 `src/mobile/platform.ts`）走 cap.http，否则走 fetch

**改动**：仅 Panel.tsx 资源加载层 + server.js 无需改（cap.http 转发到同一个 localhost 服务）。
**验收**：手机端打开鲸鱼面板，蓝鲸正常播放待机动画。

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
- M0（Phase 0）：APK 端可达 —— 1 天
- M1（Phase 1）：pet-host 框架 + whale-pet 迁移 —— 2 天
- M2（Phase 2）：AI 双向交互 —— 1.5 天
- M3（Phase 3）：桌面悬浮（动宿主）—— 3 天（含 spec + cargo 门槛）
- M4（Phase 4）：宠物团交流 —— 2 天
