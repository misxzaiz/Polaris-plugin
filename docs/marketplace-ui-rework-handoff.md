# 插件市场 UI 重构 · 交接文档

> 生成时间：2026-11-04
> 状态：**方案已定稿，待实施**（由下一个 agent 按《实施提示词》落地）
> 范围：`plugins/marketplace`（面板单文件 `src/Panel.tsx`，当前 1332 行）
> 需求条目：`needs/032-marketplace-ui-rework.md`（high/idea，含二期启停/端口管理说明）

---

## 1. 任务一句话

把插件商城面板从「商城/已装 双 Tab + 底部详情」重构为「**单 Tab 插件市场 + 已装筛选 + 详情 push 覆盖导航**」：已装不再是平行 Tab，而是列表的一种筛选状态；详情层在面板内从右滑入覆盖，未装显示安装操作、已装显示更新/卸载操作；列表项按安装状态显示徽标。

## 2. 已确认的设计决策（务必遵守，勿回退）

| # | 决策 | 说明 |
|---|---|---|
| D1 | **去 Tab** | 删除 `tab = 'market' \| 'installed'` 双 Tab 结构，面板单一入口 |
| D2 | **已装 = 筛选** | 「已装」化为状态筛选 chip（全部 / 已装），与等级、分类筛选、搜索**叠加** |
| D3 | **详情 push 覆盖** | 详情是面板内全屏覆盖层（从右滑入/淡入均可，含返回按钮）；**不是**侧栏、**不是**底部面板。桌面与手机同一交互 |
| D4 | **详情按安装状态分流** | 未装 → 版本选择 + 安装到 User/Project；已装 → 当前版本/来源 + 检查更新 / 应用更新（有更新时）/ 卸载 |
| D5 | **列表徽标** | 未装显示 tier 徽标（生产/测试/演示）；已装显示「✓ 已装 vX」或「↑ 可更新至 vX（金色高亮）」 |
| D6 | **排序** | 默认保持「tier 分组 + 组内排序」，但新增「**平铺（不分组）**」视图选项；排序增加 `usage` 评分档（用法见 §5） |
| D7 | **零数据层改动** | `usageTier`（1-10）已入 index.json，不新增存储字段 |
| D8 | **零第三方依赖** | 仅用 React + 内联样式，不引 UI 库；esbuild 打包（external react） |
| D9 | **集中单文件** | 所有改动收敛在 `plugins/marketplace/src/Panel.tsx`，可整体回滚 |
| D10 | **二期预留** | 详情操作区为「启用/停用插件、端口管理」预留扩展位（不在本期实现宿主侧逻辑，UI 仅留空位/注释） |

## 3. 交互原型（可直接参照）

可点击交互原型（html，本地直接开浏览器即可操作）：

- **v5 单Tab方案（最终版）**：`.polaris/previews/99170a18-bc2b-4553-95c8-f6d34aa1215f/index.html`
  - 单 Tab「插件市场」，顶部一条状态筛选（全部 / 已装 N），接下来等级、分类筛选 chips、排序行
  - 点列表项 → 详情从右滑入覆盖整个面板；‹ 返回回到列表（筛选态保持）
  - 未装详情：版本选择 + 安装到 User / 安装到 Project
  - 已装详情：当前版本/来源 + 检查更新 / 应用更新 / 卸载；列表项看「已装 vX」或「↑ 可更新」徽标
- 参考（反转对照）：`.polaris/previews/1b1b57fd-cfce-4aa0-b3d0-f2f6c3858874/index.html`（v3 侧栏方案，已否决只做参考）、`895c5623-a0cd-4555-bd8f-580fe65951e7/index.html`（v4 双Tab方案，已否决）

> 实施优先级：**结构先行**（单Tab + push 覆盖 + 状态筛选）→ **徽标/详情分流** → **视觉细节**。不要先做视觉再改结构。

## 4. Panel.tsx 关键结构（已核实的锚点）

文件：`plugins/marketplace/src/Panel.tsx`（1332 行）

| 位置 | 内容 | 重构动作 |
|---|---|---|
| L20 | `type PluginTier = 'production'\|'beta'\|'demo'` | 保留 |
| L22-47 | `interface MarketPlugin`（含 `tier`、`createdAt/updatedAt`、`versions`） | **需新增** `usageTier?: number`（1-10）字段映射 |
| L55-65 | `interface InstalledPlugin`（`builtin`/`installPath`/`source`/`origin`） | 保留，作已装筛���依据 |
| L80-83 | `resolveTier(p)` | 保留（未标 tier 默认 demo） |
| L423 | `type SortKey = 'default'\|'updated-desc'\|...` | **扩展**：加 `usage-desc'\|'usage-asc'` |
| L426-432 | `SORT_OPTIONS` 下拉配置 | 加「评分最高/评分最低」项 |
| L438-456 | `sortWithinTier(list, sort)` 组内排序 | **需要**：评分排序分支（`usageTier ?? 0`），仍归「未知」末尾 |
| L468 | `MarketplacePanel`（主组件）L468 起 | **改双 Tab** 为单视图；卸载/更新 handlers 保留复用 |
| L469 | `const [tab, setTab] = useState<'market'\|'installed'>` | **删** tab state，换为 `installedFilter: boolean` |
| L478 | `const [sort, setSort]` | 保留 |
| L575-580 | `loadInstalled()`（`discoverInstalled()`） | 保留——**已装数据仍要加载**（供徽标+筛选+详情分流） |
| L637-669 | 主组件渲染：TabBtn 双 Tab + 条件渲染 `MarketView`/`InstalledView` | **重写**为单视图 + 顶栏(源/刷新) + push 详情层 |
| L676-708 | `MarketViewProps` 接口 | 加 `installed`、`updates`、`onCheckUpdate/onApplyUpdate/onUninstall` 等贯通 |
| L719-747 | `filtered` / `grouped` useMemo（tier 分组） | **加「平铺」分支**：`grouped` → 平铺数组；分组视图保留 |
| L778-877 | MarketView 渲染：搜索栏 + SourceBar + 过滤 chips + 排序 + 提示条 + 分组列表 | 重排为「搜索+视图切换一行 / chips 横滑一行 / 排序行 / 列表」 |
| L984-1060 | `MarketItem`（列表项） | 加已装徽标/更新徽标、评分星标、点击→打开 push 详情 |
| L1064-1170 | `DetailPanel`（**当前是底部面板**，重构核心） | 改为 push 覆盖层；按已装分流操作区；信息行表格化 |
| L1176-1287 | `InstalledView`/`InstalledCard`（独立已装视图） | **删除或降级**为「已装筛选态下的列表渲染 + 详情复用」，操作 handlers 保留 |
| L1290+ | `TabBtn`/`FilterChip`/`SourceBar`/`TierBadge` 等小组件 | `TabBtn` 废弃或改顶栏；`FilterChip` 复用为状态筛；`SourceBar` 保留 |

### 既有行为事实（实现时别踩坑）

1. **宿主调用通道**：一律 `window.__POLARIS_HOST_INVOKE__`（环境感知，桌面 Tauri IPC / 手机 HTTP 桥），旧回退 `__TAURI_INTERNALS__.invoke`。插件管理面走 `router_dispatch → cap.pluginDiscovery`（旧 `plugin_*` 命令已删除）。参见 Panel.tsx L11-15 注释。
2. **可用 API**（Panel.tsx 已封装，直接复用）：
   - `discoverInstalled()` → `InstalledPlugin[]`
   - `installPlugin(p, scope: 'user'|'project', version?)` → `{success, message?, error?}`
   - `uninstallPlugin(installPath)` / `checkUpdate(installPath)` → `UpdateCheck` / `applyUpdate(installPath)`（返回 `UpdateResult`）
3. **已装视图现有 handlers**（L598-635）：`handleUninstall / handleCheckUpdate / handleApplyUpdate / handleCheckAll`，全部保留，迁移给新详情层用。
4. **state 贯通**：`updates: Record<string, UpdateResult>`、`opLoading`、`opMsg` 是已装视图状态，重构后需上提到主组件或同层复用（现已在 MarketplacePanel，天然可用）。
5. **样式约束**：全内联样式、深色主题 `#1A1A1F` 底；手机端注意 chips 横滑（overflow-x）、触控区 ≥40px；detail 层需 `position:absolute; inset:0` 覆盖整面板，父容器需 `position:relative; overflow:hidden`（MarketView 根容器当前是 `display:flex; height:100%`，需补 relative）。
6. **组内排序缺字段兜底**：`updatedAt` 缺失回退 `createdAt`，再缺归「未知」末尾（升降序都末尾）。
7. **「已装」判定**：已装 `<->` 商城列表项用 `id` 匹配：`installed.some(i => i.id === p.id)`。
8. **安装态联动**：安装成功后刷新 `loadInstalled()`，列表徽标即时更新（现 `handleInstall` 未刷已装，重构时补上 `await loadInstalled()` 或轻量刷新）。

## 5. 评分（usageTier）排序落地要点

- `MarketPlugin` 加 `usageTier?: number`。
- `SortKey` 扩展 `'usage-desc' | 'usage-asc'`；`SORT_OPTIONS` 加「⭐ 评分最高」「评分最低」（`usage-desc` 可作默认的可选项）。
- `sortWithinTier` 加分支：`usageTier` 缺失按 0 处理，排「未知」区末尾；同分按名称或保持原序均可（建议名称）。
- **列表项展示**：⭐ 徽标 `⭐N`（N=usageTier），颜色分档（≥8 绿 / ≥5 黄 / 其余灰）。
- **平铺视图**：取消 tier 分组后，`grouped` → 单一数组，仍走 `sortWithinTier`；「默认」排序在平铺下 = 原始 index 顺序。
- 注意 `timeField`（L755）逻辑只服务于时间排序，评分排序时不显示时间行——`showTime = sort.startsWith('updated') || sort.startsWith('created')`。

## 6. 验证方式（构建 + 冒烟）

```bash
cd plugins/marketplace
npm run build          # esbuild 打包 → dist/panel.js（external react，约 52KB）
```

- 构建通过是硬性门槛（TypeScript 语法/引用完整）。
- 宿主内冒烟：打开面板 → ① 只有单一「插件市场」入口，无「已装」Tab；② 点「已装」chip 只过滤列表，徽标显示「已装 vX」；③ 点列表项→详情 push 覆盖、返回保留筛选态；④ 未装详情有安装按钮、已装详情有检查更新/应用更新/卸载；⑤ 排序切换「评分最高」看 ⭐ 排序生效；⑥ 手机宽度核验 chips 横滑、触控区。
- 无法直连宿主时：临时起一个简单 http 服务把 `dist/panel.js` + 假 index.json 喂给浏览器验证逻辑（panel 是纯组件，可 stub `__POLARIS_HOST_INVOKE__` 打桩）。

## 7. 发布（供参考，实施可不做）

- 仓库根 `pack-and-push.bat` 打包 `scripts/pack.js plugins/dsh-engine` 是旧示例；marketplace 面板发布 = `plugins/marketplace` 内 `npm run build` 产出 `dist/panel.js` 提交。
- 提交注意只看 `plugins/marketplace/dist/panel.js` 与 `src/Panel.tsx` 两处（避免误提交其他插件产物）。

## 8. 二期范围（本期不实现，交接给未来）

已在 `needs/032` 记录：

- **启用/停用插件**：详情操作区预留「启用/停用」开关位；列表已装徽标旁可显示运行状态（运行中/已停用）。宿主侧需停=从总线摘除、不删文件；潜在联动 `cap.pluginServiceManager.stop_for_plugin / autostart`（cap_dispatch 高危动作审批流可复用）。
- **插件端口管理**：详情新增「端口」区，展示插件占用端口（执行沙箱、行情 MCP 等内置服务端口），支持查看/修改/释放、冲突提醒。UI 预留展示区与编辑控件，数据待宿主暴露端口映射。