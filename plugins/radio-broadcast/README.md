# radio-broadcast · AI 连续播报（core-slimdown B2-1 L1 骨架）

> **状态：步骤 1 完成，未上架、勿用于生产**（占位面板）
> 方案：主仓 `plans/radio-broadcast-extraction-spec.md`；执行清单 `plans/radio-broadcast-l1-implementation-spec.md`
> 阶段：只做 **L1 前端外移**。`cap.voice`（`voice_capability.rs` 1229 行）保留在宿主，插件经 RouterBus 调用；不改播报 / 合成 / 打断语义。

## 1. 本步骤交付

| 文件 | 作用 |
|---|---|
| `plugin.json` / `update.json` | 活动栏 view（`radio-broadcast.panel`）+ panel 入口；契约与主仓 `builtinPlugins.ts` 原 view 一致（id / icon / labelKey / order=96） |
| `package.json` / `tsconfig.json` | esbuild + React shim 配方（与 `ai-scheduler` 同构） |
| `.pluginignore` / `.gitignore` | 打包白名单 + 分发 zip 放行（B1-6 教训） |
| `src/host.ts` | 宿主桥 `getHostInvoke()` + `dispatchCap()`（RouterBus 统一权限 gate / 审计） |
| `src/index.tsx` | 占位面板，`health_check` 探针验证桥可用 |
| `dist/panel.js` | ESM 产物，`react` / `react/jsx-runtime` 保持 external，由宿主 `pluginModuleLoader` 重写为 React shim |
| `test/contract.test.mjs` | 4 组零依赖契约自检，含 B1-6 四个发布坑回归 |

骨架阶段**不声明** `services` / `mcpServers` / `configSchema`，避免安装时指向尚不存在的文件；`enabledByDefault: false`，防止占位面板被默认启用。步骤 2 迁入真实实现后调整。

## 2. 构建与验证

```bash
npm install
npm run build        # → dist/panel.js
npm run typecheck    # tsc --noEmit
npm test             # node --test test/*.test.mjs
node scripts/validate.js   # 在插件仓根目录跑（含全量 manifest 顶层字段门禁）
```

## 3. 宿主交界实测（2026-11-11，步骤 2 的输入）

扫描主仓待迁 **31 个 `.ts/.tsx` 文件**：

- **宿主命令只有 `router_dispatch` 一个**，且在 `main.tsx` 的 `HOST_INVOKE_ALLOWLIST`（14 条）内 → L1 通道可行，**无需新增白名单命令**。
- **宿主别名依赖 41 种 / 95 处 `@/` 引用** —— 这是步骤 2 的主要工作量，并非简单复制。
- 第三方依赖：`react`×5、`zustand`×4（+middleware）、`lucide-react`×3、`clsx`×3、`react-i18next`×1、`edge-tts-universal`×2、测试侧 `vitest`×4。

### 需要设计替代方案的硬交界（不能原样搬）

| 主仓依赖 | 处置方向 |
|---|---|
| `@/services/tauri/fileService`（`buildFilePreviewUrl`） | 音频播放 URL 构造（Tauri asset / Web `/api/files?token=`），需宿主薄通道或插件侧等价实现 |
| `@/stores/conversationStore/*`、`@/session-v2/hooks/useKernelSessionState` | 会话状态改走公共通道；`kind:'radio-broadcast'` 枚举**保留宿主** |
| `@/components/Chat/session/SessionConfigSelector` | 宿主组件，改插件自带最小选择器或宿主 slot |
| `@/stores/configStore` / `toastStore` / `workspaceStore` / `engineMetadataStore` | → `cap.kv` 与插件自有 store |
| `@/hooks/useTtsVolume`、`@/services/transport` | 宿主专有，需薄通道或插件内实现 |
| `@/utils/logger`（15 处） | 插件自带 logger，不引入主仓别名 |
| `@/types/*`（speech / voiceCompanion / chat / sessionConfig / modelProfile，约 23 处） | 纯类型，可整包搬入 `src/types` |
| `VoiceCompanionOverlay`（`App.tsx` 根层浮层，D3） | 改 `cap.ui.render` 帧 / 面板 slot，宿主不留硬编码 |

迁移必须保留 `voiceService.ts` 的「`res.ok` + `result.error`」双重判定，以及 `voiceStopWatcher` 的 stop / interrupt 幂等语义（`AGENTS.md` §4.2）。

## 4. 发布链纪律（B1-6 踩过的四个坑，已固化进契约测试）

1. `.gitignore` 必须**放行分发 zip** —— tag 内没包，`downloadUrl` 必然 404。
2. `origin.updateUrl` 指向 **`update.json`**，不是 `plugin.json`。
3. `downloadUrl` 用**发布 tag**（`@radio-broadcast-v1.0.0`），不用 `@main`。
4. manifest 顶层字段必须严格对齐宿主 `PluginManifestFile`（`deny_unknown_fields`）：**禁止把 `author` 之类的商城元数据写进 `plugin.json` / `update.json`**，`author` 只能放 `index.json`。B1-6 首发包因此装不上，已于 v1.0.1 修复，并在 `scripts/validate.js` 加了全量顶层字段门禁（`e658e4d`）。

## 5. 步骤 2 待办

- 迁入面板 / 控制器 / 播放器 / 服务 / stores（≈10.5k 行），按 §3 逐项消除 `@/` 依赖。
- 依迁入结果决定是否在 manifest 声明 `services` / `configSchema`；TTS 复用 `mimo-tts` 约定，不新建第二个引擎（D2）。
- 迁入完成后：`enabledByDefault` 改回 `true`、`description` 去掉「骨架」字样、补 `node --test` 用例与 SSR 渲染冒烟（步骤 3）。
- 主仓摘壳 / 删码（步骤 4-5）必须在插件 zip 可安装之后，避免功能断链窗口。
