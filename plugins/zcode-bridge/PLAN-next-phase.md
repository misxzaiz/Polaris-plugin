# zcode-bridge 下一步规划（分析，尚未实施）

> 状态：2026-10-26，对话 MVP 已可用（resume/send/events 全链路，await 根因已修）。
> 本文档只做**方向分析**，不涉及实施。

---

## 0. 现状快照

| 维度 | 现状 |
|---|---|
| 面板能力 | 会话列表 / 新对话 / 续接 / 历史 / 流式对话（v0 可用） |
| 权限声明 | `workspaceRead: true`, `network: false` —— 很保守 |
| ZCode 模型 | 由 **ZCode 账号体系**管理（Z.AI / BigModel Coding Plan），插件**不持有**模型选择权 |
| 插件 ↔ ZCode | 走 app-server stdio 协议；provider 由 `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` 指向 ZCode 的 runtime provider 目录 |
| 插件 ↔ Polaris | cap.http 服务 + MCP server（zcode-bridge-mcp）+ panel |

---

## 1. 需求理解（用户提的三项 + 隐藏诉求）

用户原话：**「支持选择工作区」「支持选择模型」「支持设置权限为完全访问」**，并要求结合当前项目的 AI 引擎（指 Polaris 的 `claude-code`/`base` engines + provider 体系）。

三项本质上是三件不同的事：
1. **选择工作区** → 数据/作用域问题：ZCode 会话归属哪个工作区
2. **选择模型** → 认证/配置问题：用哪个 provider、哪个模型跑本轮
3. **完全访问权限** → Polaris 权限模型问题：插件能碰什么

> 隐藏诉求：用户在把 zcode-bridge 当 **ZCode 的「遥控器」** —— 期望 Polaris 面板成为 ZCode 的前台，能像桌面版一样选工作区、选模型、放开权限。这决定了下文的架构取向。

---

## 2. 方向一：支持选择工作区（先做，优先级最高）

### 2.1 现状局限
- `DEFAULT_WS = 'D:/space/base/Polaris'` 写死在 `server.js`，所有会话都落在这一个工作区。
- create/resume/send 传的 `workspace` 都是它。ZCode 桌面版多工作区能力完全没用上。

### 2.2 方案分级
| 级别 | 做法 | 成本 | 说明 |
|---|---|---|---|
| P0（推荐先做） | 面板加「工作区」下拉，值来自（A）ZCode 已落库会话的 `directory` 去重 + （B）用户手动输入路径 | 低 | 改动点：`server.js` 增加 `/api/workspaces` 读 `db.session.directory` DISTINCT；create/resume/send 接受 `workspacePath` 参数；panel 下拉传参 |
| P1 | 插件配置化默认工作区（plugin.json 或 config.json 段） | 低 | 给个静态默认，面板不选时用配置值 |
| P2 | 扫描磁盘常见工程目录（各盘根 `D:\projects` 等） | 中 | 用户搜索体验好，但要 fs 扫描，权限面上要放开只读目录列表 |
| P3 | 接入 Polaris 自己的工作区概念（`activeWorkspaceKey`） | 高 | 需对齐 Polaris 工作区模型 + 后端 cap，收益与成本比不高（ZCode 工作区 ≠ Polaris 工作区） |

### 2.3 推荐
**P0 + P1**。理由：
- ZCode 会话粒度天然按 `directory` 分，面板给下拉几乎是白拿的产品能力。
- 一个工作区选择 = 后面「选择模型」「权限」全部受益（模型/权限可能与工作区绑定）。

---

## 3. 方向二：支持选择模型（中等优先级，但最敏感）

### 3.1 残酷事实：模型选择权在 ZCode 手里
- `zcode-builtin.json` 只是 ZCode 自己的 **runtime provider 模板目录**（`providerConfigRules` 里是 Z.AI/BigModel 各套餐的 API 模板）。
- **实际激活的 provider/model 由 ZCode 运行时状态决定**（从会话消息 usage 看是 `providerId: new-provider, modelId: deepseek-v4-flash`）。
- ZCode app-server 协议里 session/send 是否支持按 request 指定 model **未证实**（多数闭合代码 agent 不开放）。

### 3.2 三条可行路线（务必想清楚再动）
| 路线 | 机制 | 局限 | 适合 |
|---|---|---|---|
| A. 探测 ZCode 当前 provider 并展示 | 读 `zcode-builtin.json` 的 provider 列表 / 会话 usage 推断 | 只能**展示**，不能改 | 信息层：面板显示「当前 ZCode 用 deepseek-v4-flash」 |
| B. 尝试 session/send 传 model 覆盖 | `session/send` 加 `model` 参数，看 ZCode 是否接受 | 大概率被忽略（协议未开放）；需实测 | 实验性 |
| C. 绕过 ZCode、让 Polaris 引擎直跑 | 与「结合 Polaris AI 引擎」结合，见 §5 | 那就是另一套产品了 | 若用户真想要「Polaris 选模型跑」

> **我的判断**：用户说「结合当前项目的 AI 引擎」时，真正的意图可能是 —— 「我在 Polaris 里已经配好了 provider/模型，能不能让 ZCode 的会话用我 Polaris 里选的模型引擎？」
> 这在架构上 = **把 ZCode 会话的模型调用从 ZCode provider 换成 Polaris provider**。这不是「选择模型」按钮能做到的，是**引擎替换**级别的改造（§5）。

### 3.3 阶段建议
- **先做 A（展示）**：面板顶栏显示当前 provider/model（从 ZCode 会话元数据或 usage 拿），零风险，立刻有用。
- **试一次 B**：花半小时实测 `session/send` 带 `model` 是否生效。失败就把这条路钉死（写进文档），不反复。
- **C 单独立项**，见 §5。

---

## 4. 方向三：支持权限「完全访问」（要做，但从安全面考虑）

### 4.1 现状
- `plugin.json`:`permissions.workspaceRead: true`, `network: false`。
- 实际访问链：面板 → cap.http(9862) → ZCode app-server。cap.http 的 URL/port 受 Polaris RouterBus PolicyPermission 约束（内置 cap.http* 通配 deny + config 白名单）。

### 4.2 「完全访问」的含义要拆解
| 诉求 | 实际要开的能力 | 风险 | 建议 |
|---|---|---|---|
| 读 ZCode 会话 | workspaceRead 已够 | 低 | ✅ 已具备 |
| ZCode 替用户操作其工程目录 | workspaceWrite、可能 shell | 高 | **默认不开**；需显式配置 |
| ZCode 访问网络（web fetch/API） | plugin network:true | 中 | 按需开，建议默认关 |
| 面板与后端所有 cap | config 里裸 id 放行 | 高 | 除非用户明确要，否则保持「最小放行」 |

### 4.3 关键安全点（必须写进规划）
1. **权限是 Polaris 的 PolicyPermission 模型管**，不是插件 plugin.json 单方面说了算。真正生效的是 **config.json 里的 rule**（cap.http 放行 127.0.0.1:9862 那类）。「完全访问」= config 里加宽 rule，而不是 plugin.json 打勾。
2. **ZCode app-server 是真实编程 agent**（能改文件、跑命令）。给它完全访问 = 给一个能执行任意代码的进程放开网络+磁盘。**这是安全等价物：等于开 root**。
3. 建议形态：**分级权限**而非一刀切——
   - Level 1：只读会话 + 对话（当前）
   - Level 2：+ workspaceWrite（能改 ZCode 所在工程）
   - Level 3：+ network + shell（作坊级，需用户显式确认）

---

## 5. 结合 Polaris AI 引擎：两条产品路线（重要的架构取舍）

用户特意提到「结合当前项目的 AI 引擎」。这里有**两条根本不同的路线**，必须先选型，否则后面全白做：

### 路线 X：**ZCode 会话（Polaris 面板作为遥控前台）**
- 模型运行在 ZCode 的 provider（Z.AI 等）上。
- Polaris 面板只负责交互。
- 「选择模型」天然受限于 ZCode 开放的东西。
- ≈ 现在已做成的 v0 的深化。
- **优点**：零新复杂度，ZCode 桌面端同步可见（落盘 db.sqlite）。
- **缺点**：受制于 ZCode 壳；模型列表两端不一致；Polaris 的引擎/Provider 资源用不上。

### 路线 Y：**Polaris 引擎跑的 ZCode 兼容会话**
- Polaris 用自己的 engines（claude-code/base）+ Polaris provider 跑 ZCode 会话。
- 面板 → Polaris AI 引擎 →（模拟 ZCode 协议或直接写 db.sqlite）。
- 「选择模型」= Polaris 自己的 provider 下拉（完全可控）。
- **优点**：模型选择真正归 Polaris；复用用户已配的 provider；不欠 ZCode API 约束。
- **缺点**：ZCode 桌面端可能**不再同步**（写库路径不同）；要重新实现 ZCode 会话协议或只做「伪会话」；工作量大。

### 我的建议
- **短期（1-2 周）走路线 X**：补工作区选择 + 模型展示 + 分级权限，把「遥控 ZCode」做到顺手。
- **长期（真正想整合）走路线 Y**：新增一个 Polaris 原生「ZCode 兼容引擎」，让 ZCode 会话成为 Polaris 引擎的一个 target —— 这才是「结合当前项目 AI 引擎」的完整落地。
- 两者不互斥：路线 Y 做出来后，路线 X 的面板可平滑切换数据源。

---

## 6. 落地顺序（推荐）

| 阶段 | 内容 | 里程碑 | 工作量 |
|---|---|---|---|
| P0 | 工作区选择下拉（读 db directory + 手动输入） | 面板可选工作区，新会话落到选定目录 | 0.5-1d |
| P1 | 模型展示（当前 ZCode provider/model 顶栏显示）+ 实测 session/send model 是否生效 | 用户知道自己用的模型；B 路线有结论 | 0.5d |
| P2 | 权限分级（Level 1/2/3 开关，config rule 联动） | 用户可面板自选权限档位 | 1-2d |
| P3 | （路线 Y 前置）调研 ZCode 会话落盘协议，评估「Polaris 引擎跑 ZCode 会话」 | 路线选型定稿 | 1d |
| P4 | 若选 Y：Polaris 原生 ZCode 兼容引擎 | 模型选择归 Polaris | 大，单独立项 |

---

## 7. 尚未解决的问题（需确认）
1. **路线选型**：短期 X / 长期 Y？还是只做 X？
2. **工作区范围**：ZCode 桌面版自己在管哪些工作区？可枚举吗？（影响 P0 P2 方案）
3. **权限底线**：用户是否接受「完全访问」是分级下的 Level 3（非默认）？
4. **模型**：先展示 + 试一次覆盖；若覆盖无效，用户是否接受「模型仍由 ZCode 桌面版决定」？