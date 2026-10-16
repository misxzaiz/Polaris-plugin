# 重命名 relay-devkit-api 面板标识，消除与 relay-devkit 的注册冲突

> 状态：待评审
> 日期：2026-10-16
> 涉及插件：`plugins/relay-devkit-api`
> 涉及主项目：`Polaris`（`src/plugin-system/panelRegistry.ts`、`src/components/Layout/ActivityBar.tsx`）

## 1. 问题描述

同时安装 `relay-devkit` 与 `relay-devkit-api` 后，ActivityBar 出现两个无法区分的「DevKit」按钮（同图标 `Terminal`、同显示名），且点其中一个可能打开的是另一个的面板——视觉与行为都重复。

## 2. 根因（已核实源码）

### 2.1 两个插件声明了完全相同的面板注册标识

`relay-devkit/plugin.json` 与 `relay-devkit-api/plugin.json` 的 `contributes.views[0]` 五个字段逐字相同：

| 字段 | relay-devkit | relay-devkit-api |
|---|---|---|
| `views[0].id` | `relay-devkit.panel` | `relay-devkit.panel` ← 相同 |
| `views[0].panelType` | `relayDevkit` | `relayDevkit` ← 相同 |
| `views[0].labelKey` | `plugins.relayDevkit` | `plugins.relayDevkit` ← 相同 |
| `views[0].labelDefault` | `DevKit` | `DevKit` ← 相同 |
| `views[0].icon` | `Terminal` | `Terminal` ← 相同 |

### 2.2 主应用按 `panelType` 全局唯一注册

- `src/plugin-system/panelRegistry.ts:16-20`：`register(panelType, ...)` 若已存在会 `log.warn` 并**后注册覆盖先注册**（`overriding with ...`）。
- `src/components/Layout/ActivityBar.tsx:82,124-126`：按钮按 `panelType` 去重/激活，同 `panelType` 只会渲染一个，另一个插件的入口直接消失。

结论：两个插件同 `panelType` → 注册互相覆盖 → 视觉重复 + 行为不确定，属**注册标识冲突**，不是显示名问题。

## 3. 方案：只改 relay-devkit-api 的标识，relay-devkit 保持不动

`relay-devkit-api` 是后出的精简版（仅 API 客户端），它来避让。

| 字段 | 现值 | 新值 |
|---|---|---|
| `id` | `relay-devkit-api` | `relay-devkit-api`（保留：目录名 / manifestUrl / zip 名一致，不构成冲突） |
| `views[0].id` | `relay-devkit.panel` | `relay-api.panel` |
| `views[0].panelType` | `relayDevkit` | `relayApi` |
| `views[0].labelKey` | `plugins.relayDevkit` | `plugins.relayApi` |
| `views[0].labelDefault` | `DevKit` | `API Client` |
| `views[0].icon` | `Terminal` | `Beaker`（白名单 17 值之一，见 Polaris `iconWhitelist`） |

`version` 保持 `1.0.0` 不变（本改动不改行为，仅换面板注册标识；若发布流程要求可后续升 patch）。

## 4. 同步文件清单

- `plugins/relay-devkit-api/plugin.json`：改 views 标识
- `plugins/relay-devkit-api/update.json`：与 plugin.json 保持一致（更新清单）
- `index.json`：`relay-devkit-api` 条目改 views 相关字段（name 不变、icon 改为 Beaker）
- 重新打包 `relay-devkit-api.zip`（zip 内含 plugin.json），更新 `index.json.sha256`
- 源码 `src/`：内部 `registerView({ id: 'api', ... })` 是面板**内部**视图注册表，与主应用注册键无关，**不改**

## 5. 验收

- [ ] `node scripts/validate.js` 通过（index ↔ plugin.json ↔ update.json id/version 一致）
- [ ] `relay-devkit-api.zip` 解压后 `plugin.json` 含新 views 标识
- [ ] 与 `relay-devkit` 的 `panelType`/`labelKey`/`icon` 不再相同
- [ ] Polaris 安装两者后 ActivityBar 出现「DevKit」+「API Client」两个可区分入口，互不覆盖

## 6. 影响与回滚

- 已安装 `relay-devkit-api` 的用户：面板注册键变化，旧安装不会被新安装自动迁移（主应用无 view 迁移机制），需重新安装新 zip 后生效；`relay-devkit` 用户不受影响。
- 回滚：将五个字段还原 + 重新打包 + 更新 sha256 即可。
