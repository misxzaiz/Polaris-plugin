# 灵感池（lingxi）

> 灵感孵化池：把「稍纵即逝的念头」变成**会被再次见到、被追问、被推进**的活资产。

- 面板（ActivityBar → ⚗️ 灵感池）：星图 / 回访 / 池子 / 统计 四 Tab
- AI 工具（MCP 9 个 `lingxi_*`）：聊天里说「记个想法」「翻翻旧想法」「来一场碰撞」即可
- **纯本地**：数据只在 cap.kv（`lingxi.*`），零后台服务、零网络请求、零跨域面

## 为什么是它

笔记/收藏工具的终点是「存下来」——琥珀封存网页、书签考古救书签，但**想法的身后事没人管**：
存进备忘录的念头 90% 再也不会被打开，想法池注定变成坟场。灵感池的全部机制围绕三件事：

1. **让想法被再次见到** —— 回访队列（SRS 思想）
2. **让想法被推进** —— 成熟度管道
3. **让想法相遇** —— 相关匹配 / 星系聚类 / 随机碰撞

与已有插件互补：**谋定**管「决定之后」的校准复盘，灵感池管「决定之前」的孵化；
**拾光机**被动检索已发生的对话，灵感池主动回访还没成形的念头。

## 核心机制

### 回访节奏（SRS for ideas）
| 事件 | 效果 |
|---|---|
| 捕获入池 | `3 天`后首访 |
| 深化 / 再等等 | 间隔翻倍（上限 60 天） |
| 推进 | 回到 3 天活跃节奏 |
| 落地 / 归档 | 离开回访队列（归档可恢复，回访重置 3 天） |

到期的想法出现在「回访」Tab 与 AI 的 `lingxi_revisit` 队列里，并带上捕获时 AI 留下的
**深化追问**——那是给未来自己的重启抓手。

### 成熟度管道
`种子 → 嫩芽 → 轮廓 → 蓝图 → 落地`（推进需给依据；到「落地」状态收口，庆祝离场）。

### 星图
面板主视图是 canvas 星图：**星系 = 主标签**（首标签，虚线圈）、**星等 = 成熟度**、
**红环 = 到期待访**、绿环 = 已落地、暗星 = 归档。布局为确定性纯函数（`computeStarLayout`）。

### 星系报告与合并候选
`lingxi_constellation` 按主标签聚类；簇内 ≥3 条且 ≥2 条到「轮廓」以上 → 标记为
**合并候选**（想法已成势，可以合流成项目了）。

### 随机碰撞
`lingxi_collide` 从池中随机抽 2-5 个想法 + 一张创意视角卡（强制嫁接 / 反转假设 /
缩放十年 / 减半挑战 / 迁地他用 / 换人发问 / 旧配新 / 时间旅行），由 AI 主持碰撞。

## AI 工具（MCP）

| 工具 | 用途 |
|---|---|
| `lingxi_catch` | 捕获入池（自动附池中相关旧想法，防重复促相遇；可留深化追问） |
| `lingxi_search` | 检索（关键词 CJK 双元 / 标签 / 类型 / 成熟度 / 状态） |
| `lingxi_get` | 完整卡片（正文 / 时间线 / 回访态） |
| `lingxi_deepen` | 深化沉淀（回访间隔翻倍） |
| `lingxi_promote` | 推进成熟度（落地即收口） |
| `lingxi_revisit` | 回访队列 list / 记录 record（deepen/promote/snooze/archive） |
| `lingxi_constellation` | 星系报告 + 合并候选 |
| `lingxi_collide` | 随机碰撞（视角卡 + 抽样） |
| `lingxi_archive` | 归档 / 恢复 |

## 对话示例

- 「记个想法：给 Polaris 做个键盘优先的命令面板」 → 自动入池、打标签、留追问、报相关旧想法
- 「翻翻旧想法」 → 列出到期队列，逐条问推进/深化/再等等/归档
- 「来一场碰撞」 → 抽 3 个想法 + 视角卡，AI 主持出 2-3 个具体碰撞产出
- 「星系报告」 → 哪些想法已成簇、哪个簇可以合流成项目
- 「把「星空屏保」那个想法捞回来」 → 从归档恢复

## 数据契约（cap.kv `lingxi.*`，权威描述）

- `lingxi.idea.<id>` → `Idea`（一想法一键；低频写，读改写幂等）：
  - `{ id, title(≤60), raw(≤2000), kind: idea|problem|resource|observation, tags(≤6),`
    ` maturity: 0-4, status: active|archived|done, origin: ai|panel|import, url?,`
    ` links[], createdAt, updatedAt,`
    ` revisit: { dueAt, interval(天), history[{at,outcome}](≤30) },`
    ` timeline[{at,kind,text}](≤40，新在前) }`
  - `timeline.kind ∈ catch|question|deepen|promote|revisit|archive|restore|edit`
- `lingxi.settings` → `{ schemaVersion: 1 }`（v1 预留）

**并发语义**：跨端并发对**同一想法**的写为毫秒级窗口、后者胜（与口袋账本同口径，已文档化）；
不同想法天然不同键，无交叉冲突。回访到期是**纯派生**（读时比较 `dueAt`），无后台定时器、无状态漂移。

**跨端与跨域**：面板数据面全走宿主通道 `__POLARIS_HOST_INVOKE__ → router_dispatch → cap.kv`
（桌面直连 IPC，手机/Web 自动取服务地址带 token）；MCP 进程仅本机 127.0.0.1 访问宿主
（anchor.json → config.json 自发现，md5 Bearer）。**无任何浏览器直连外网的请求**——URL 线索
只存元数据不抓取（那会在面板撞 CORS），要读网页请在对话里扔链接由 AI 提炼后入池，或走琥珀封存。

## 开发

```
cd plugins/lingxi
npm install && npm run build && npm run typecheck   # 面板
node test/run-tests.mjs                             # core 离线单测
node test/mcp-verify.mjs                            # MCP 协议离线验证
node test/smoke-real.mjs                            # 真桥冒烟（需本机 Polaris 运行中，跑完自清理）
```

## 已知边界（如实交代）

- 无删除语义：只有归档（防误删想法；kv 键可手工清理）。
- 碰撞产出不自动入库：由 AI 问过用户后 `lingxi_catch` 显式入池（保持「入池皆有主」）。
- 关联匹配是词面相关（CJK 双元 BM25-lite），不是语义相关——同义改写可能漏报，宁缺勿滥。
- `computeStarLayout` 为确定性布局（散列抖动），不防全部星体重叠，密集簇下可接受。
- 双端同改同一想法为毫秒级竞态窗口、后者胜（同口袋账本口径）。
