# 蜂群实验台（swarm-lab）

多智能体涌现行为实验台：把「群体智能如何从简单规则里长出来」变成可动手做实验的本机沙盘。

## 两个涌现场景

| 场景 | 规则 | 涌现 | 主指标 |
|---|---|---|---|
| **boids 蜂群鸟群** | 分离/对齐/聚合三规则 + 可选捕食者 | 群体秩序、成团 | 极化指数 \|Σv̂\|/N |
| **ants 蚁群觅食** | 信息素沉积/蒸发 + 3 探针转向 | 觅食路径收敛 | 累计采食 |

确定性引擎（mulberry32 种子化 PRNG）：同种子同参数 → 逐 tick 一致，实验可复现。
环形世界（toroidal [0,100)）消除边界效应。

## 面板

实时 canvas 沙盘：参数滑杆（连续型逐 tick 生效，结构型同种子重建）、种子控制、
播放/暂停/单步/重置、速度 1~8×、主指标迷你曲线、四指标实时读数。

## MCP 五工具（前缀 `swarmlab_`）

- `swarmlab_scenarios` — 场景清单 + 参数 schema + 默认值（实验设计的输入字典）
- `swarmlab_run` — 单批次实验 → 指标摘要（初/末/最小/最大/均值）+ 采样曲线
- `swarmlab_compare` — **同种子控制变量**跑 2~5 组对照 → 逐组末值对比 + 差值表
- `swarmlab_snapshot` — 密度网格字符图（`.` 稀 → `@` 密）+ 质心 + 散布半径
- `swarmlab_metrics` — 指标口径表

推荐问法：「用 swarmlab_compare 对照 alignment=0.1 和 3.0，看极化差多少」。

## 架构

```
shared/engine.js   纯算法核心（零依赖，双端同一权威，确定性）
mcp/server.js      stdio JSON-RPC（零宿主依赖，stdout 只出协议行）
src/Panel.tsx      React 面板（canvas 渲染 + 参数控制）
```

纯本地：无服务、无 kv、无网络、无宿主依赖——数据不出机，刷新即重置（不做实验结果持久化）。

## 算力护栏

`count²×(ticks+采样点) ≤ 4e8`（boids）/ `count×ticks ≤ 5e7`（ants），超限显式拒绝并给建议，不静默降载。

## 开发

```bash
npm install          # devDeps（esbuild/react/typescript，仅构建与测试用）
npm run build        # dist/panel.js
npm test             # core 单测（node --test）
npm run verify:mcp   # MCP 协议验证（真 spawn server 喂 JSON-RPC）
npm run verify:render# 面板 SSR 渲染冒烟
```
