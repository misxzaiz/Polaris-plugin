# 上下文打包台（context-pack）方案

> 2026-11-01 · 状态：spec 定稿，进入实施
> 定位：把本地代码仓库/目录打包成 LLM 可直接消化的文本上下文包。核心动作 = **变换**（目录 → 上下文包），非记录类。

## 一、产品定位

- **名称**：上下文打包台（id: `context-pack`，kv 前缀 `cpk.`）
- **一句话**：树形勾选任意本地目录的文件 → token 预算内打包成 AI 友好的单文本包 → 一键复制 / 导出 / 发送到 Polaris 聊天；AI 可经 MCP 三工具自助打包任意目录。全部本地完成，代码不出本机。
- **目标用户**：把代码喂给聊天式 LLM（Polaris 内置聊天模型、ChatGPT / Claude / DeepSeek 网页版）的开发者；需要给 AI 跨目录上下文的 Polaris 用户。
- **现有解决方式与缺口**（外部证据，2026-11-01 调研）：
  - repomix（CLI + web，类别标杆）、gitingest（web 仅公共仓）、code2prompt（CLI ~7.7k star）：需求已大规模验证。
  - 竞品公认四大痛点：① 上下文溢出（输出常超模型窗口，只能改 CLI 参数反复重跑）；② 私有仓 web 端不可用、须装 CLI；③ 全仓倾倒浪费、缺交互式挑选；④ 非 CLI 用户门槛。
  - Polaris 主仓无此能力（聊天附件仅单文件、`@path` 引用只对 CLI 引擎生效、conversationPackager 仅会话↔会话）；插件生态无同类。
- **差异化**：本地零安装 GUI（私有仓无摩擦）+ 交互式勾选与预算条（所见即所得控制 token）+ 一键进 Polaris 聊天（onSendToChat 桥）+ MCP 工具让 AI 自助打包；代码不出本机。
- **MVP 边界**：单目录扫描打包（不跨仓聚合）；不调任何外部 API；不做语义压缩/Tree-sitter 裁剪（启发式估算 + 勾选/预算裁剪已覆盖主痛点）；不做 git 历史打包。
- **成功指标**：扫描 5000 文件仓库 ≤ 3s；打包 100 文件 ≤ 2s；token 估算偏差 ±20% 内（启发式，如实标注）；冒烟全绿。

## 二、架构（无状态透传 + webhook-station 范式）

```
┌─ 面板 Panel(React, blob) ─┐  __POLARIS_HOST_INVOKE__→router_dispatch
│  树勾选/预算条/预览/发送   │──────────────┐          │
└──────────┬───────────────┘              ▼          ▼
           │ cpk.cmd.*（先删后做）    cap.kv（cpk.* 键空间）
           ▼                              ▲
┌─ service/main.js(http,node) ────────────┘
│  扫描/打包任务执行者（唯一 fs 内容读写者）
│  bundle 文件落 dataRoot 兄弟目录 polaris-context/bundles/
└─────────────────────────────────────────
┌─ mcp/server.js(stdio,node) ─┐  直连 fs（复用 shared/core.js），
│  ctx_scan/estimate/pack 三工具 │  AI 自助打包；pack 结果写索引键进面板历史
└─────────────────────────────┘
```

- **单写者纪律**：`cpk.scan.*`/`cpk.pack.*`/`cpk.meta`/`cpk.idx` 由 service 单写；`cpk.settings`/`cpk.sel.*` 由面板写（键不相交）；MCP 只写自己新发起的 `cpk.pack.<id>` 索引（id 唯一，无竞争）。
- 大内容走 kv 分块镜像（256KB/块），索引键记 chunkCount；面板只读键，不做 kv list 全扫（历史靠 `cpk.idx` 单键，服务维护最近 10 条）。
- 服务 `type: http`（框架健康检查成熟），监听 127.0.0.1，仅 `/__health`，无业务 HTTP 面；全部交互走 kv。

## 三、键空间契约（cpk.*，三方一致）

| 键 | 写者 | 内容 |
|---|---|---|
| `cpk.settings` | 面板 | `{version, ignoreExtra[], includeLockfiles, maxFileKb, format:'xml'\|'md', headerText}` |
| `cpk.meta` | service(60s) | `{version,pid,startedAt,lastTickAt,bridge,dataDir,packsTotal,degraded}` |
| `cpk.scan.<id>` | service | `{state:running\|done\|error, path, startedAt, finishedAt, error, fileCount, dirCount, totalTokens, totalBytes, treeChunks, truncated, skipCount}` |
| `cpk.scan.<id>.t.<n>` | service | 树行分块：每行紧凑 JSON `[relPath,isDir,size,tokens,flags]` |
| `cpk.sel` | 面板 | 最近选中集 `{path, selected[], updatedAt}`（单键，重开面板恢复） |
| `cpk.pack.<id>` | service / mcp | `{state, path, format, startedAt, finishedAt, error, origin:'panel'\|'mcp', stats{files,bytes,tokens,treeLines}, file, fileBytes, chunks, inlineBytes, truncatedFiles[]}` |
| `cpk.pack.<id>.c.<n>` | service | 包内容分块（≤16 块 = 4MB；超出仅文件 + 提示） |
| `cpk.idx` | service | `{packs:[<cpk.pack 元数据快照>...]}（≤10，含 mcp 发起）` |
| `cpk.cmd.<op>.<nonce>` / `cpk.result.<nonce>` | 面板写 / service 消费 | op=`scan{id,path}`、`pack{id,path,include?,exclude?,format?,header?}`、`cleanup` |

## 四、shared/core.js（纯函数，两进程复用，单测全覆盖）

1. 忽略引擎：内置默认（`.git node_modules dist build out target __pycache__ .next .nuxt coverage .venv venv .idea .gradle bin obj *.pyc .DS_Store Thumbs.db *.lock（开关）`）+ `.gitignore` 子集（注释/空行/`!` 否定/尾 `/` 目录/`*` `?` `**`/前导 `/` 锚定）+ 用户追加；嵌套 .gitignore 逐目录合并。
2. 二进制判定：扩展名表 + 前 8KB 嗅探（NUL 字节 / 控制字符占比）。
3. token 估算：`tokens ≈ ascii/4 + nonAscii×0.7 + lines×0.1`（如实标注为估算）。
4. `scanDirectory(root, opts, onProgress)`：异步流式（每 200 文件 yield），护栏：单文件 > maxFileKb 跳过内容、总文件 > maxFiles(20000) 截断、输出 compact 行。
5. 树渲染 + 包格式化：XML（repomix 风格 `<file path>`）与 Markdown 两种；头部含目录树 / 仓库元信息（读 `.git/HEAD`+refs 拿 branch/commit，不依赖 git 二进制）/ 自定义说明。
6. `chunkString/compact` 序列化、`fitToBudget(entries, budget)` 贪心裁剪（从大到小排除直到 ≤ 预算，可撤销）。

## 五、安全与边界

- 只读 fs：扫描/打包只读用户显式指定的目录；bundle 只写 `polaris-context/bundles/`（数据根兄弟目录）。
- 无网络出站（除宿主 bridge 127.0.0.1）；无 CORS 读面；服务无业务 HTTP API。
- 面板「发送到聊天」> 2MB 弹确认（聊天输入消化能力保护）；kv 内容分块 4MB 封顶。
- 保留最近 8 个 scan / 10 个 pack，过期任务键与 bundle 文件自动清理（`cleanup` 亦手动可触发）。

## 六、验收（冒烟脚本 test/smoke-real.mjs + 手工）

1. 服务健康 `/__health` 200，`cpk.meta` 心跳新鲜。
2. 发 `scan` 命令扫本仓 `plugins/webhook-station` → done，树分块可读、token 汇总 > 0。
3. 发 `pack` 命令（选 2-3 个文件）→ done，bundle 文件存在且含所选文件内容标记，索引与分块一致。
4. MCP stdio 直测三工具（initialize/tools/list/tools/call）。
5. 面板（esbuild 产物）安装进真宿主：树渲染、勾选、预算裁剪、复制、发送到聊天（人工确认项如实标注）。
