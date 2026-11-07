# 插件商城排序能力 PRD

> 版本：v1.0 ｜ 状态：规划分析（未实施）｜ 日期：2026-11-01
> 范围：`plugins/marketplace`（面板 `src/Panel.tsx` + 索引 `index.json` + 发布脚本 `scripts/publish-plugin.mjs`）
> 目标读者：实施者 / 决策者

---

## 1. 背景与现状

### 1.1 当前列表呈现逻辑

商城面板（`Panel.tsx`）列表无任何排序能力，呈现流程为：

1. **过滤**：按 `tier`（等级）+ `category`（分类）+ `query`（关键词）三维过滤（`Panel.tsx:626-638`）。
2. **分组**：按 tier 固定顺序 `production → beta → demo` 分组（`Panel.tsx:641-647`）。
3. **组内顺序**：保持 `index.json` 中 `plugins` 数组的物理顺序，用户无法干预。

### 1.2 数据层现状（关键卡点）

实测 `index.json`（56 个插件）每个 plugin 对象的字段为：

```
id, name, version, description, author, category, tags, icon,
homepage, repository, manifestUrl, downloadUrl, updateUrl,
sha256, tier, permissions, screenshots, readme, versions
```

**无 `createdAt` / `updatedAt` / 任何时间字段**。索引顶层仅有 `version`（索引版本号）与 `updated`（索引整体刷新时间），对单插件排序无意义。

`versions` 数组结构：`[{ version, downloadUrl, sha256? }]`，**同样不带时间戳**，仅靠数组顺序隐含版本先后（最新版 `unshift` 到头部，见下文）。

### 1.3 时间信号源盘点

| 信号源 | 真实语义 | 可得性 | 用于列表排序的代价 |
|---|---|---|---|
| `versions` 数组顺序 | 版本序（非时间序） | ✅ 已在 index.json | 零；但只能近似"最新版本优先"，非真时间排序 |
| `index.json` 顶层 `updated` | 索引整体刷新时间 | ✅ 已有 | 不可用于插件级排序 |
| 各插件 `update.json` | **实测为 `plugin.json` 副本**（含 contributes/permissions，无时间） | ❌ 不含时间 | 此路不通 |
| git tag 创建时间 | 真实发布时间（tag 命名 `<pluginId>-v<version>`） | ⚠️ 存于远程仓库 | 高：需逐插件 `git ls-remote` / API 查询，前端不可直连；仅适合回填脚本一次性采集 |
| **给 index.json 补字段** | 显式 `createdAt` / `updatedAt` | 需改索引生成流程 | 一次性补数据后零成本；最干净 |

### 1.4 发布脚本现状

`scripts/publish-plugin.mjs` 的 `updateIndexJson()`（`:122-149`）在每次发布时执行：

- 更新 `version` / `sha256` / `downloadUrl`
- `versions` 数组去重后 `unshift` 新版本到头部（`:143-145`）
- **不写入任何时间戳**

该函数是补 `updatedAt` 的天然注入点。脚本第 5 步（`:274-310`）已含 `git tag <pluginId>-v<version>` 流程，tag 命名规范稳定，可用于一次性回填历史 `createdAt`。

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：商城列表支持按「最后更新时间」排序（默认最新优先，可切换最旧优先）。
- **G2**：商城列表支持按「创建时间」排序（默认最新优先，可切换最旧优先）。
- **G3**：排序与现有「tier 分组 + 分类过滤 + 关键词搜索」体系并存且语义清晰，不破坏等级优先的信息架构。
- **G4**：补字段方案对自定义/本地商城源兼容（缺字段时不报错、不乱序）。

### 2.2 非目标

- 不改 `index.json` 的整体 schema 版本（仅新增可选字段）。
- 不改 `update.json`（它仍是 manifest 副本，定位不变）。
- 不做"按下载量/评分排序"等需要后端计量的能力（本需求仅时间维度）。
- 不改"已装"标签页（已装列表走本地 `discover`，时间语义由本地安装时间决定，另议）。

---

## 3. 数据层方案

### 3.1 字段定义

为 `index.json` 每个 plugin 对象新增两个**可选**字段：

| 字段 | 类型 | 语义 | 缺省 |
|---|---|---|---|
| `createdAt` | string（ISO 8601，如 `2026-08-12T09:30:00Z`） | 插件首次发布到商城的时间 | 缺失时按"未知"处理 |
| `updatedAt` | string（ISO 8601） | 最近一次发布新版本的时间 | 缺失时回退到 `createdAt` |

**选型说明**：
- 用 ISO 字符串而非 ms 时间戳——可读、可直接在 JSON 中人工核对、`new Date(str)` 解析零成本。
- 不复用 `versions[].` 加 `releasedAt` 子字段——那是"单版本发布时间"，与插件级"最后更新"语义不同；插件级字段更利于列表排序，且改动面小。

### 3.2 写入时机

在 `publish-plugin.mjs` 的 `updateIndexJson()` 中追加（伪代码）：

```js
const now = new Date().toISOString()
plugin.updatedAt = now
if (!plugin.createdAt) plugin.createdAt = now   // 首次发布回填
```

- 仅当 `createdAt` 不存在时写入，避免重复发布覆盖创建时间。
- `updatedAt` 每次发布覆盖。

### 3.3 历史数据回填（一次性）

对存量 56 个插件，用 git tag 时间回填：

```
git log --format=%aI -S <pluginId> --reverse | head -1   # 首次提交
# 或按 tag：git for-each-ref --format='%(creatordate:iso-strict) %(refname)' 'refs/tags/<pluginId>-v*'
```

回填脚本输出 `{ pluginId: { createdAt, updatedAt } }` 映射，merge 进 `index.json`。`updatedAt` 取该插件最新 tag 的时间。无 tag 的插件（2 个 tier 缺失项可能未正式发布）`createdAt`/`updatedAt` 留空。

**风险**：tag 时间是 UTC，需统一格式化成 ISO。回填后人工抽查 3-5 个插件核对。

### 3.4 兼容性兜底

前端排序函数对缺字段插件统一处理：

- 排序时 `updatedAt` 缺失 → 回退 `createdAt` → 再缺失 → 视为 `1970-01-01T00:00:00Z`（最旧优先时排末尾，最新优先时排首位的"未知"区，见 §4.3）。

自定义/本地商城源的索引若无这俩字段，排序自动退化为"默认顺序"（索引原序），不报错。

---

## 4. 前端交互方案

### 4.1 排序控件位置

在现有过滤栏（`Panel.tsx:688-707`，等级 + 分类 chips 行）**右侧**追加排序区，与过滤栏同行或紧邻其下一行：

```
[等级 全部 Production Beta Demo] | [分类 全部 ai dev utility ...]   排序：[默认 ▾]
```

- 默认值「默认」= 现状（tier 分组 + 组内索引原序），保证零迁移成本。
- 下拉选项：`默认` / `最新更新` / `最早更新` / `最新创建` / `最早创建`。

### 4.2 排序与分组的交互（关键设计决策）

**推荐方案：组内排序（tier 分组保留）**

排序仅在 tier 分组**内部**生效，不打碎 `production → beta → demo` 的分组结构。理由：

1. 与现有"等级 + 分类"过滤体系一致，tier 是商城质量分级的核心信息架构，不应被时间排序掩盖。
2. 用户心智模型：先按等级筛可信度，再按时间看新旧——两维正交。

切换为非「默认」排序时，组内顺序按所选字段重排；tier 分组标题（"生产可用 · N"）保持不变。

**备选方案：全局时间流（打碎分组）**

切换到时间排序时，列表整体按时间排，tier 降级为 item 上的 badge 标识。更接近"应用商店首页"的瀑布流观感，但削弱等级引导。**本 PRD 不采纳**，除非后续决策者明确要时间流优先。

### 4.3 UI 原型（文字示意）

```
┌─────────────────────────────────────────────────────┐
│ [搜索框________________] [↻]                         │
│ 源 [官方] [本地8787×] [+添加源]                      │
│ 等级 [全部] [Production] [Beta] [Demo] │ 分类 [全部]│
│ [ai] [dev] [utility] ...              排序：[默认 ▾]│
│ 💡 未标注等级的插件默认视为 Demo                     │
│ ─────────────────────────────────────────────────── │
│ PRODUCTION · 13                                     │
│   ┌────────────────────────────────────────────┐   │
│   │ 🧩 pocket-ledger  v1.2.0  [Production]      │   │
│   │     家庭账本…   [utility] [账本]            │   │
│   │     更新于 2026-10-29                       │   │  ← 排序=最新更新时此行可见
│   └────────────────────────────────────────────┘   │
│   ...                                                │
│ BETA · 41                                            │
│   ...                                                │
└─────────────────────────────────────────────────────┘
```

排序下拉展开：

```
排序：[默认        ▾]
       默认（等级分组，索引顺序）
       ─────────────────────
       最新更新（updatedAt ↓）
       最早更新（updatedAt ↑）
       最新创建（createdAt ↓）
       最早创建（createdAt ↑）
```

### 4.4 时间展示

- 排序非「默认」时，每个 `MarketItem`（`Panel.tsx:859-915`）在版本号旁或描述下方追加一行小字：`更新于 2026-10-29`（或 `创建于 …`），让排序依据可视化、可核对。
- 格式：`YYYY-MM-DD`（去掉时分秒，列表内降噪）。
- 排序为「默认」时不展示时间行，避免信息过载。

### 4.5 状态与持久化

- 排序选择用 `useState` 持有（与现有 `category`/`tierFilter` 一致，不持久化到 localStorage）。
- 切换源 / 刷新索引时排序状态保留（与 `query` 行为一致）。
- 不引入新的 localStorage key，保持轻量。

---

## 5. 实施切片（建议顺序）

| 切片 | 内容 | 依赖 | 验收 |
|---|---|---|---|
| **S1 数据回填** | 写一次性脚本，用 git tag 时间给 index.json 56 个插件补 `createdAt`/`updatedAt` | §3.3 | 抽查 5 个插件时间与 tag 一致；`validate.js` 通过 |
| **S2 发布脚本注入** | `publish-plugin.mjs` 的 `updateIndexJson()` 追加写入逻辑（§3.2） | S1 | 模拟发布一个插件，确认 `updatedAt` 刷新、`createdAt` 不被覆盖 |
| **S3 前端排序** | `Panel.tsx` 加排序下拉 + 组内排序逻辑 + 缺字段兜底（§4） | S1 | 切换 5 档排序，列表顺序正确；缺字段插件归入"未知"区 |
| **S4 时间展示** | `MarketItem` 排序非默认时显示时间行（§4.4） | S3 | 时间格式 `YYYY-MM-DD`；默认排序时不显示 |
| **S5 自定义源验证** | 用本地商城源（无时间字段的旧索引）加载，确认排序退化为默认顺序且无报错 | S3 | 本地源下排序下拉可切但效果等同默认 |

S1 与 S2 可并行；S3-S5 串行依赖 S1。

---

## 6. 风险与边界

1. **回填精度**：git tag 时间 ≠ 真实"插件可用时间"（tag 可能在代码完成后才打）。作为排序依据足够，但不应在 UI 承诺"精确发布时刻"。已用"更新于"而非"发布于"措辞规避。
2. **多源不一致**：自定义源索引无时间字段时排序退化（§3.4），需在 S5 验证；不可在排序逻辑里抛错。
3. **`validate.js` 约束**：`scripts/validate.js` 校验 index.json schema，补字段前需确认它是否做"严格白名单"校验（若是，需同步放行新字段；若仅校验必填项，则无影响）。S1 前必查。
4. **CDN 缓存**：`index.json` 经 jsdelivr CDN 分发，发布后需按既有 SOP（`relay-devkit` 发布流程记录）purge 缓存或等 12h——这是运维事项，非代码问题，但实施时需提醒。
5. **未来扩展**：若后续要"按下载量排序"，`createdAt`/`updatedAt` 字段位与计量字段正交，不冲突。

---

## 7. 开放问题（需决策者拍板）

- **Q1**：组内排序（§4.2 推荐）vs 全局时间流（§4.2 备选）？本 PRD 默认前者，确认即实施。
- **Q2**：是否同步在"已装"标签页加"按安装时间排序"？已装列表走本地 `discover`，时间语义不同，建议本期不做、单独立项。
- **Q3**：`createdAt` 是否对齐到"首次出现在 index.json 的 git 提交时间"而非 tag 时间？tag 更接近"正式发布"，提交更接近"开始开发"。建议 tag。

---

## 附：关键文件锚点

- 面板：`plugins/marketplace/src/Panel.tsx`
  - 过滤逻辑 `:626-638`
  - 分组逻辑 `:641-647`
  - 过滤栏 UI `:688-707`
  - 列表项 `MarketItem :859-915`
- 索引：`index.json`（根目录，56 插件）
- 发布脚本：`scripts/publish-plugin.mjs` → `updateIndexJson() :122-149`
- 校验脚本：`scripts/validate.js`（S1 前需确认 schema 严格度）
