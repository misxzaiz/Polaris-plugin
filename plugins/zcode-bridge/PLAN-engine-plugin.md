# zcode-bridge 生产级规划：从独立面板 → Polaris AI 引擎插件

> 状态基准：2026-10-26。面板「好用版」已落地（工作区 / 模型 chip / 权限完全访问 / guarded 修复 / 多轮连续可见，能力已验证）。
> 本文档只做**架构分析 + 可行性规划**，不实施。
> 用户的诉求：当前可用但不是生产级，规划如何把 ZCode 从独立面板升级为 Polaris 的 AI 引擎插件、集成进主对话。

---

## 0. 一句话结论

Polaris 的引擎体系**原生支持「插件即引擎」**：插件声明 `contributes.engines` + `adapter`，后端用 `PluginProcessEngine`（engine-v1 协议）包一层适配器进程，引擎就**零核心改动**地出现在主对话引擎下拉里。ZCode 已具备全部接入要素（会话协议已打通、事件流已有、游标增量已有）。**方案可行，工作量集中在一个 adapter 进程 + 会话模型映射，预期 3-5 天。**

关键实证（已确认源码）：
- `engine-bootstrap.ts` 只给 `claude-code` 注册前端工厂；**其余引擎（含插件引擎）AI 调用全由后端处理**，引擎本身只消费后端 `get_engine_metadata_list` 下发的元数据。→ 插件引擎不需要任何前端引擎实现。
- `PluginProcessEngine` 的协议注释明确写着「加新 AI 引擎只需写一个插件包（含适配器进程），无需修改 Polaris 核心」。
- 前端引擎下拉纯粹读后端元数据列表 → 插件注册引擎后自动出现，无需改 UI。

---

## 1. 现在的形态 vs 生产级的差距

| 维度 | 现在（独立面板） | 生产级（引擎插件） |
|---|---|---|
| 入口 | 侧边栏 ZCode 图标 → 独立 Panel | 主对话引擎下拉选「ZCode」；对话走统一会话列表 |
| 会话存储 | 只读 ZCode db.sqlite（`~/.zcode/cli/db/`） | Polaris JSONL 会话（+ 后端兜底归档），主对话统一渲染 |
| 事件流 | Panel 轮询 `/api/chat/events`（cap.http 一次性请求） | PluginProcessEngine 直接把 ZCode 事件映射为 AIEvent 推送 |
| 工具调用可视化 | 未做（PLAN-next-step-v2 P0） | engine-v1 自带 `tool_call_start/end` 帧，Polaris 主对话原生渲染 |
| 中断 | 无（只能停轮询） | `interrupt` 请求帧 + 引擎能力声明 |
| 续聊 | 面板内 resume | Polaris 会话续聊自动走 `continue_session` + resume_token |
| 权限 | 插件级全放 + ZCode mode | 引擎 permission_mode 映射 + Polaris PolicyPermission |
| 模型 | 只展示（misc 帧读 modelId） | `providerConfig` + 模型覆盖（需实测 ZCode 支持度） |

---

## 2. 核心技术路径：adapter → PluginProcessEngine

### 2.1 怎么声明（plugin.json，向 `contributes.engines` 加一段）

```jsonc
"engines": [
  {
    "id": "zcode",
    "name": "ZCode (本地桌面)",
    "description": "桥接已安装 ZCode 桌面版会话",
    "protocol": "json-rpc",
    "sessionFlags": "",                // 不需要 'omp'/'pi' 特判
    "capabilities": {
      "tools": true,                   // ZCode 会执行工具
      "streaming": true,               // 事件流已打通
      "interrupt": true,               // 见 §5 需实测
      "resume": true
    },
    "adapter": {
      "entry": "./mcp/engine-adapter.js",   // 新写的适配器进程
      "runtime": "node",
      "protocol": "engine-v1"
    }
  }
]
```

### 2.2 引擎协议映射（核心，adapter 要做的）

**入站请求**（Polaris → adapter，JSONL）：

| 请求 | 语义 | adapter 转成 ZCode 动作 |
|---|---|---|
| `start_session {session_id, message, work_dir, model, system_prompt, permission_mode}` | 新会话首条消息 | `session/create{workspace, mode}` → `subscribe` → `send(message)` |
| `continue_session {session_id, message, resume_token}` | 续聊 | `session/resume` → `subscribe` → `send(message)` |
| `interrupt {}` | 中断当前轮 | 实测 ZCode 是否有会话级 cancel；无则断开 app-server 子进程重连 |
| 响应 `{session_id, resume_token}` | 建/续成功 | resume_token 复用现有 `resume_tokens.json` 持久化机制 |

**出站事件帧**（adapter → Polaris，AIEvent 语义）：

| ZCode 原始事件 | 归一化 AIEvent 帧 |
|---|---|
| `session/event payload.delta` | `assistant_message {content, is_delta:true}` |
| `payload.content + stopReason` | `assistant_message`（尽收）+ `session_end` |
| `tool part`（db 落盘 / 事件内含 tool 字段）| `tool_call_start {tool, args}` → `tool_call_end {success, result}` |
| `misc {modelId, providerId}` | `usage / meta`（可选） |
| 错误 | `error {error}` |

这个归一化层**就在 adapter 里做**：Polaris 只认 engine-v1 帧，不知道 ZCode 内部 payload 形状（正好回应 PLAN-next-step-v2 §3.1 的「事件归一化」——从 Panel 下沉到引擎适配器）。

### 2.3 会话模型映射（最需要厘清的一块）

Polaris 会话 = JSONL（`src/services/dialogStorage`）+ Reconcile 对账（`session-v2`，日志即真相）。ZCode 会话 = db.sqlite（message/part 表）。

两条路：

- **A. 不侵入**：Polaris 会话的正文 = ZCode 会话的**镜像投影**。Polaris 侧每轮结束把 docs 落 JSONL（同时保留 ZCode sessionId 关联）；ZCode 桌面端看到的始终是它自己的 db.sqlite。两边各自独立、语义对齐，不互迁数据。
  - 优点：不动 ZCode 数据、桌面/面板/Polaris 三端会话一致，改动面小。
  - 关键动作：adapter 在 `continue_session` 收到 resume_token 时能定位 ZCode sessionId；**Polaris 会话元数据（session_v2）挂 `external_session_id`**（需要核心一个字段，见 §4）。
- **B. 双向写**：Polaris 成为 ZCode 会话的又一个完全写者。复杂度高（写入顺序、幂等、对账冲突），**不推荐**。

**推荐 A**：Polaris 主对话是「读 ZCode 的真实输出」，ZCode 桌面是「权威落盘」，两者以 sessionId 关联。这保留了 ZCode 桌面端完整能力（它的模型/工具/工作区），又让主对话获得统一的会话体验。

---

## 3. 与现有面板的关系（决策点）

| 选项 | 说明 | 建议 |
|---|---|---|
| **A. 并存（推荐）** | 引擎加入主对话；面板保留为「ZCode 专属工作台」| 面板的「工作区浏览 / 会话管理 / 工具过程可视化」仍是 ZCode 场景最顺手入口；两者读写同一批 ZCode 会话 |
| B. 引擎取代面板 | 面板退役，一切走主对话 | 要等主对话工具可视化/会话管理追平；短期会退化 |
| C. 面板降级为只读 | 面板只展示，对话全走引擎 | 增量小，收益不明确 |

推荐 A 的理由：引擎解决「进主对话」、面板保留「垂直深度」，互不抢位；且面板的 `/api/sessions` `/api/chat/*` 已经是成熟的读写通道，可被 adapter 复用（adapter 不必重写 ZCodeClient 的客户端逻辑——**直接 import 现有 `mcp/zcode-core.js` 的 ZCodeClient**）。

---

## 4. 需要的核心改动（极小型，建议当面核对）

目标：**零核心改动**或**一处最小改动**。

- ✅ 引擎注册：纯插件声明，核心零改动（§2.1）。
- ⚠️ **Polaris 会话 ↔ ZCode sessionId 关联**：若走方案 A（投影），需要 Polaris 会话能记住 `external_session_id`。取决于 session-v2 是否已支持未知字段透传 / 附件映射 —— **需读 `src/session-v2/` 与 dialogStorage schema 确认**。若支持，则零核心改动；若必须新字段，则是一个小 PR（后端 model + 前端类型双向同步，遵循 AGENTS.md §4.1）。
- ⚠️ **中断**：engine-v1 有 `interrupt` 帧，但要实测 ZCode `session/send` 的中断语义（第 6 节决策点 4）。若 ZCode 无法中途取消单轮，退路是「断开 app-server 子进程并重建」——这是 adapter 内部实现，仍零核心改动。
- ❌ 权限：ZCode 工具执行权限走它自己的 mode（guarded/yolo）+ Polaris PolicyPermission `permission_mode` 映射，两者都要在 adapter 里翻译，核心不动。

**「零核心改动」是真实目标，但规划中要留一个「若挂一个 external_session_id 字段」的最小核心 PR 备选。**

---

## 5. 落地阶段

### 阶段 1：adapter 适配器（2-3 天）— 核心工作量
- `mcp/engine-adapter.js`：stdin/stdout JSONL 协议；复用 `zcode-core.js` 的 ZCodeClient；
  实现 start_session / continue_session / interrupt；
  把 ZCode 事件归一化为 engine-v1 AIEvent 帧（§2.2 映射表）。
- 本地直联自测：用裸 JSONL（echo 帧）模拟 Polaris 端，验证 start→流→end→续聊全链路。
- **此阶段完成标志**：把 adapter 单独跑起来，能完成一轮「新会话发消息→收流式文本→断流」，事件帧解析通过 `parse_event_frame` 的回归测试语义（已有测试在 `plugin_process_engine.rs` ~750 行）。

### 阶段 2：入库主对话（0.5-1 天）
- plugin.json 加 `contributes.engines`（§2.1）；同步到已安装目录；重启宿主。
- 验证：主对话引擎下拉出现「ZCode」；选它建会话、发消息、看流式回到主对话。

### 阶段 3：会话关联 + 续聊（1 天）
- 确认/实现 `external_session_id` 关联（§4 决策点）。
- 验证续聊：Polaris 会话里第二次发消息走 `continue_session`，ZCode 侧同一 sessionId 累积。

### 阶段 4：工具可视化 + 模型 + 权限（1-2 天，可并到面板路线）
- adapter 多发 `tool_call_start/end` 帧 → 主对话原生渲染工具卡。
  **状态（2026-10-26）**：已实现——engine.js 把 ZCode 工具生命周期（misc 事件的
  scheduled/started/result）映射为 PiRpc `toolcall_start/end` 帧，pi_parser.rs 解析为
  `AIEvent::ToolCallStart/End` 透传前端。帧契约回归测试：`test/engine-replay.cjs`
  （真实事件回放，12/12 通过）；协议细节见 Polaris `plans/zcode-engine-tool-stream.md`。
  遗留：真实模型在场的 UI 面板复验（当晚模型网关上游限流，帧层已覆盖）。
- 模型：实测 `session/send` 是否接受 model 覆盖；能则 providerConfig 映射，不能则只展示。（未做）
- 权限：ZCode 权限模式。**现状（2026-10-27）**：桥默认 `yolo`（完全访问，桌面端标签）——
  桥接会话无人值守、zcode-core 没有 `permissionRequested` 应答方，guarded（自主模式）的
  高风险询问会永远「等待确认」挂死 turn；mode 决定权收敛在桥 `ZBRIDGE_DEFAULT_MODE`
  env（server.js 单一权威），engine.js 不再传 mode。遗留：Polaris 侧按会话可配置 +
  zcode-core 对高风险询问自动拒绝（把挂死变成显式失败）。

**总计 3-5 天，核心投入在 adapter 的协议归一化。面板会话通道可复用，不重写。**

---

## 6. 决策点（实施前需用户拍板）

1. **面板去留**：并存（推荐）还是引擎取代？——决定 §5 阶段 3/4 是否还要在面板做。
2. **会话模型 A（投影镜像）vs B（双向写）**：推荐 A，需确认 ZCode 桌面端允许 Polaris「并行持有同一会话的镜像」的业务预期。
3. **核心改动**：接受「若需 external_session_id 的最小核心 PR」还是「零核心、把关联映射塞进 adapter（Polaris 侧只当普通 JSONL 会话，自建 sessionId→ZCodeId 表）」。后者更彻底但丢失「Polaris 会话与 ZCode 会话一一对应」的强语义。
4. **中断语义**：是否值得先实测 ZCode `session/send` 的中断能力，还是直接按「断连重进」实现（简单、稳、但中断有延迟）。
5. **默认引擎**：ZCode 是否要当默认引擎（默认 claude-code，选配 ZCode）。

---

## 7. 明确不做（防过度设计）

- ❌ 不反向把 Polaris 会话推成 ZCode db 的写者（方案 B 排除）。
- ❌ 不做 Polaris provider 开发者适配塞进 ZCode（ZCode 继续用它自己的账号/provider 体系）。
- ❌ 不在引擎内重造事件表/权限系统（全复用 Polaris 现成拍板）。
- ❌ 不为主体工作加「引擎切换 UI」——引擎下拉已由后端元数据自动驱动。

---

## 8. 相互引用

- 服务端通道基础：`server.js`（现读/写接口）+ `mcp/zcode-core.js`（ZCodeClient，adapter 直接复用）
- 面板迭代方向：`PLAN-next-step-v2.md`（工具可视化 P0 / reasoning 折叠，可平移给主对话渲染）
- 近期修复经验：`PLAN-easy-to-use.md`（工作区/模型/权限全访问）、guarded 模式修复（ZCode mode 决定工具权限，engine adapter 必须默认 guarded）
- 约束：AGENTS.md §2 改动前先读源码；§3.4 命令门控；`plugin_process_engine.rs` 协议注释即权威契约。