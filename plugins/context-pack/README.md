# 上下文打包台（context-pack）

把本地代码仓库/目录打包成 **LLM 可直接消化的文本上下文包**：树形勾选 + token 预算条 + 一键复制 / 导出 / 发给 AI（附一句任务拼在包前）；AI 可经 MCP 三工具自助打包任意目录。**全部本机完成，代码不出本机。**

## 解决什么问题

把代码喂给聊天式 LLM（Polaris 内置聊天模型、ChatGPT / Claude / DeepSeek 网页版）时，逐文件复制粘贴既慢又容易漏。repomix / gitingest 一类 CLI 已验证了这条需求，但：web 端只支持公共仓（私有代码要上传）、CLI 要反复改参数重跑、非终端用户有门槛。本插件把「选择 → 预算 → 打包 → 投喂」做成图形化闭环，且全程本地。

## 使用

**面板（ActivityBar → 📦 上下文打包台）**

1. 输入目录（或点「工作区」取当前工作区）→ **扫描**（自动遵循 `.gitignore`，`.git`/`node_modules`/构建产物恒忽略）
2. 树中勾选文件：目录可整枝勾选；二进制 / 超单文件上限的文件自动排除并标注
3. 底部预算条看已选 token（启发式估算）：超预算一键**裁剪到预算**（从最大文件裁起）
4. **打包** → 复制全文 / **发给 AI**（卡片内附一句可选任务，拼在包前直发当前 AI 会话）/ 取包文件

**AI（MCP 三工具）**

| 工具 | 用途 |
|---|---|
| `ctx_scan` | 扫描目录：统计 + 树 + token 大头分布，用于决定打包范围 |
| `ctx_estimate` | 文件级 token/大小估算（不生成内容） |
| `ctx_pack` | 打包写 bundle 文件并返回统计；≤24KB 时全文内联 |

## 产物位置

- 包文件：`<数据根>/polaris-context/bundles/<时间戳>-<id>.<txt|md>`
- 包历史：面板「包历史」页（含 AI 发起的包，最多保留 10 条；旧包与过期 bundle 文件自动清理）

## 键空间契约（cpk.*，三方一致：面板 / 服务 / MCP）

| 键 | 写者 | 内容 |
|---|---|---|
| `cpk.settings` | 面板 | 包格式 / 追加忽略 / lockfile 开关 / 单文件上限 / 包头说明 |
| `cpk.meta` | 服务(60s) | 心跳：version/pid/degraded/dataDir/packsTotal |
| `cpk.scan.<id>` + `.t.<n>` | 服务 | 扫描索引 + 树行分块（每行 `[relPath,isDir,size,tokens,flags]`） |
| `cpk.sel` | 面板 | 最近选中集（重开面板恢复） |
| `cpk.pack.<id>` + `.c.<n>` | 服务 / MCP | 打包索引 + 内容分块（256KB × ≤16 = 4MB 封顶；文件永远完整） |
| `cpk.idx` | 服务 | `cpk.pack.*` 纯投影（最近 10 条，面板只读此单键） |
| `cpk.cmd.<op>.<nonce>` / `cpk.result.<nonce>` | 面板写 / 服务消费 | scan / pack / cleanup，先删后做 |

单写者纪律：`scan.* / pack.* / meta / idx` 仅服务写（MCP 只写自己新发起的 pack 索引，id 唯一）；`settings / sel` 仅面板写。

## 架构

```
面板(React)  ──__POLARIS_HOST_INVOKE__──▶ cap.kv（cpk.* 键空间）◀── 服务(node, 单写者)
   │ cpk.cmd.* 命令键(先删后做)                ▲                    │ bundle 文件落盘
   ▼                                          │                    ▼
 服务消费命令 → 扫描/打包（shared/core.js）──进度/结果──▶ polaris-context/bundles/
MCP(stdio) ──直连 fs 复用 core──打包──写 cpk.pack.<id> 索引键（bridge 不可达时降级）
```

- 服务 `type:http` 仅暴露 `127.0.0.1 /__health`，无业务 HTTP 面；交互全走 cap.kv。
- 扫描护栏：单文件 > maxFileKb(默认512KB) 不打包内容、总文件 > 20000 截断、符号链接跳过（防环）。
- token 估算为启发式（`ascii/4 + 非ascii×0.7 + 行开销`），精度目标 ±20%，所有出口如实标注「估算」。

## 已知边界

- 不做语义压缩 / Tree-sitter 裁剪（勾选 + 预算裁剪已覆盖主痛点）；不打包 git 历史。
- `.gitignore` 支持实用子集：注释 / `!` 否定 / 尾 `/` 目录 / `*` `?` `**` / 前导 `/` 锚定；嵌套 `.gitignore` 逐目录合并；不支持「已忽略目录内再否定」（git 冷僻语义）。
- 发送到聊天 > 2MB 会弹确认（聊天输入消化能力保护）；包内容分块 4MB 封顶，超出只出文件。
- token 数为估算值，直接当作精确上下文窗口边界时请留余量。

## 开发

```bash
npm install
npm run typecheck       # 面板类型检查
npm test                # core 单测（node test/run-tests.mjs，零依赖）
npm run build           # esbuild 打包面板 → dist/panel.js（React external，宿主提供）
node scripts/../../publish-plugin.mjs context-pack   # 仓库根目录：打包 zip + 更新 index.json
```

目录：`shared/core.js`（业务核，纯函数，单测全覆盖）· `shared/kvclient.js`（宿主桥，沿用 page-sentinel/clip-relay/webhook-station 验证版）· `service/main.js`（任务执行者）· `mcp/server.js`（AI 工具）· `src/`（面板）· `test/`（单测 + 真宿主冒烟）。
