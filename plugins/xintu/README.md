# 心图画布（XinTu）

一块**持久的无限画布**：AI 在对话里把想法画上去（脑暴图 / 架构图 / 思维导图 / 对比板），人继续拖拽共编。画布跨轮次、跨设备长存，是"这个主题的空间资产"，而不是单轮回复的渲染物。

## 与聊天图表卡的划界

| | cap.ui.render 图表卡 | 心图 |
|---|---|---|
| 生命周期 | 单轮回复的渲染物 | 跨轮次持久的用户资产 |
| 空间 | 聊天流内嵌、纵向 | 无限画布、二维自由布局 |
| 编辑 | 只读 | 人机共同编辑 |

## 用法

**AI 侧（对话里直接说）**
- "把刚才聊的这几个创意整理到画布上" → AI `xintu_create` + `xintu_edit` 批量落卡连线
- "把这块板重排成架构图" → `xintu_edit` 的 `relayout {direction:'LR'}`
- "把画布内容发回来" → `xintu_export` 导出 markdown 大纲

**人侧（面板）**
- 活动栏「心图画布」→ 新建 / 打开
- 空白拖拽 = 平移；`Ctrl/⌘+滚轮` = 光标锚缩放（触控板捏合同理）；双指捏合（触屏）
- 双击节点 = 编辑标题/正文；节点右下圆点拖到另一节点 = 建连线
- 选中多节点（Shift 点选）→ 浮条：6 档语义色 / 成组 / 删除
- `Ctrl+Z` / `Ctrl+Shift+Z` 撤销重做；「⌗ 重排」确定性布局（radial 环形 / LR、TB 分层）
- 「发到对话」把当前板大纲发给 AI 继续讨论

## MCP 工具（6 个）

| 工具 | 说明 |
|---|---|
| `xintu_list` | 列出全部画布（索引驱动） |
| `xintu_create` | 新建空画布，返回 id |
| `xintu_read` | 读整板 JSON（编辑前必读） |
| `xintu_edit` | 批量 op 整批原子应用：`add_note/add_card/add_group/add_edge/update_node/move_node/delete_node/delete_edge/set_title/relayout`；任一 op 非法整批拒绝 |
| `xintu_delete` | 删除画布（`confirm` 必须传画布 id 防误删） |
| `xintu_export` | 导出 markdown 大纲 |

op 纪律（工具描述里也写了）：坐标吸附 40px 网格，|值| ≤ 100000；`color ∈ default/blue/green/amber/rose/violet`；title ≤120 字、text ≤2000 字、label ≤80 字；单批 ≤200 op；容量 50 板 / 500 节点 / 1000 边。同批内先 `add` 再 `add_edge` 可直接互相引用（id 可自定）。

## 架构

```
对话 AI ──MCP(stdio)── mcp/server.js ──HTTP(md5 token,自发现)── cap.kv（xt.* 键空间）
                                            ▲
面板(activityBar) ── router_dispatch ───────┘  5s 轮询 rev + focus 即刷
共用权威：shared/canvas-core.js（op 校验/试算/布局/导出，纯函数零依赖）
```

- 存储：`xt.board.<id>` 整板单键（原子粒度=板）+ `xt.boards` 索引。**全程不调用 cap.kv 的 list 动作**（实测大数据根上会拖垮宿主进程，2026-10-30 实证——这是本插件的一条硬纪律）。
- 布局是确定性函数（BFS 环形 / Kahn 分层忽略回边），不是 AI 自由发挥。
- group 只是 z 序靠后的视觉容器，不携带子节点关系。

## 已知限制（如实）

- 无推送：面板靠 5s 轮询，AI 画完到面板可见最多滞后一个周期。
- 双端同时编辑同一块板 = 板级 last-write-wins，后写覆盖先写（单人场景窗口极小）；P2 前不做合并。
- 撤销栈仅本地面板会话内（跨端/重启不保留）。
- 移动端：可看、平移、缩放、双击编辑；节点拖移与连线待 P2。

## 测试

```bash
npm run typecheck            # tsc --noEmit
npm run build                # esbuild → dist/panel.js（external react）
node --test test/run-tests.mjs   # core 单测（op 试算/回滚/校验矩阵/三布局/容量/导出）
node test/mcp-verify.mjs         # mock bridge + 子进程 MCP 全流程
node test/smoke-real.mjs         # 真宿主九步冒烟（需实例运行中；测 dev 实例时
                                 # POLARIS_SMOKE_CONFIG=<Polaris-dev>/config.json）
```

smoke-real 带安全闸：目标实例索引里已有画布数据时拒绝执行，防误删真实数据。

## 版本

- 0.1.0：P0+P1 —— MCP 六工具 / 面板只读+编辑全套 / 撤销重做 / 轮询同步 / 三布局 / 导出大纲发对话。
