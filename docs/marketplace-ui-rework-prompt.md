# 实施提示词 · 插件市场 UI 重构（单Tab + 已装筛选 + push 详情）

> 把下面【提示词全文】直接交给下一个 agent（建议作为独立会话的初始 prompt）。

---

## 提示词全文（复制此段）

你是 Polaris 前端工程师，负责将插件商城面板完全重构落地。需求、设计、锚点已在交接文档里全部核实过，**不要推翻既有设计决策，不要臆造接口；以交接文档 + 可点击原型为准**。工作目录：`D:\space\base\Polaris-plugin`。

### 必读文件（按顺序）
1. `docs/marketplace-ui-rework-handoff.md` —— 交接文档（设计决策、锚点、坑、验证方式）
2. `needs/032-marketplace-ui-rework.md` —— 需求条目（含二期范围）
3. `.polaris/previews/99170a18-bc2b-4553-95c8-f6d34aa1215f/index.html` —— **v5 可点击原型（最终方案）**，直接在浏览器打开对照
4. `plugins/marketplace/src/Panel.tsx` —— 唯一要改的源文件（1332 行）

### 任务（本期范围 — 按此顺序实施）
1. **结构**：删除 `MarketplacePanel`（L468 起）的 `tab = 'market' | 'installed'` 双 Tab 结构，改为单视图「插件市场」；「已装」化为筛选 chip（`installedFilter` state），与等级/分类筛选、搜索叠加。
2. **push 详情**：把 `DetailPanel`（L1064-1170，现在是**底部面板**）改成面板内全屏覆盖层：`position:absolute; inset:0`（父容器补 `position:relative; overflow:hidden`），右侧滑入 + 顶栏返回按钮（‹）；从列表项点击打开，返回时保留筛选/搜索态。**禁止**侧栏 / 底部抽屉方案。
3. **详情按安装状态分流**（以 `installed.some(i => i.id === plugin.id)` 判定）：
   - 未装：版本选择（复用 `selectedVersion`/`allVersions` 逻辑）+ 安装到 User / 安装到 Project（复用 `onInstall`）。
   - 已装：信息行表（ID/当前版本/最新版本/来源/分类/创建/更新/权限）+ 「检查更新 / 应用更新（有更新时）/ 卸载」操作，复用 `handleCheckUpdate/handleApplyUpdate/handleUninstall`（L598-635 已有，上提到可贯通处）。
4. **列表徽标**：未装显示 tier 徽标；已装显示「✓ 已装 vX」或金色「↑ 可更新至 vX」（用 `updates[p.id]`）。
5. **评分排序 + 平铺**：
   - `MarketPlugin` 加 `usageTier?: number`；`SortKey`（L423）加 `'usage-desc' | 'usage-asc'`；`SORT_OPTIONS`（L426）加「⭐ 评分最高 / 评分最低」；`sortWithinTier`（L438）加评分分支（缺失按 0、归末尾）。
   - 新增「平铺（不分组）」/「分组」视图切换：平铺 = 单一列表仍走 `sortWithinTier`；分组 = 沿用现有 `grouped` 逻辑。默认平铺。
   - 列表项加 ⭐N 徽标（≥8 绿 / ≥5 黄 / 其余灰）；评分排序时 `showTime` 应为 false（`showTime = sort.startsWith('updated') || sort.startsWith('created')`）。
6. **已装视图迁移**：`InstalledView`/`InstalledCard`（L1176-1287）降级/删除——「已装」不再是独立 Tab 而是筛选态；`handleUninstall/handleCheckUpdate/handleApplyUpdate/handleCheckAll` 全部保留迁入新详情层；顶栏保留「检查全部更新」按钮（在已装筛选态显示）。
7. **体验细节**：手机端 chips 横滑（overflow-x: auto）、触控区 ≥40px；详情 push 用 CSS transition 保证丝滑（≥180ms）；`opMsg` 操作结果提示条保留；安装成功后 `await loadInstalled()` 刷新徽标（现 `handleInstall` 缺此步，补上）。
8. **二期预留**：详情操作区留「启用/停用、端口管理」注释占位（D10），不实现宿主侧逻辑。

### 边界（不做）
- 不改数据层 / index.json / schema / scripts；不引第三方依赖；不重构 `SourceBar` 多源管理本身（保留其组件与 props 接口，仅位置可挪）；不实现启停/端口宿主侧逻辑。
- 保留全部既有可用 API 与调用通道（`window.__POLARIS_HOST_INVOKE__` / router_dispatch → cap.pluginDiscovery），不换协议。

### 验收（全部通过才算完成）
- [ ] `cd plugins/marketplace && npm run build` 构建通过（esbuild，external react，产出 `dist/panel.js`）。
- [ ] 面板单一入口「插件市场」，无「已装」Tab；「已装」chip 过滤与搜索/等级/分类叠加生效。
- [ ] 点列表项详情 push 覆盖（非侧栏/底部），‹ 返回保留筛选态。
- [ ] 未装详情：版本选择 + 安装到 User/Project；已装详情：检查更新/应用更新（有更新时）/卸载，操作走既有 handlers。
- [ ] 列表徽标正确：未装=等级，已装=「已装 vX」/「↑ 可更新」；(有 `usageTier` 索引时) ⭐ 评分徽标与评分排序生效。
- [ ] 平铺/分组切换、时间/评分排序各自生效，缺字段兜底不报错。
- [ ] 手机宽度（≥320px）下无横向溢出、筛选 chips 可横滑、触控区 ≥40px。
- [ ] 安装成功后列表徽标即时更新；卸载/更新成功后状态一致（复用 `refreshAfterOp` 或等效）。

### 提交
- 只提交 `plugins/marketplace/src/Panel.tsx` 与 `plugins/marketplace/dist/panel.js`；commit message 带 `feat(marketplace): single-tab rework + installed filter + push detail`。
- 若过程中发现交接锚点与实际代码不符，以代码为准并把差异写进 PR 说明。

---

_提示词结束_