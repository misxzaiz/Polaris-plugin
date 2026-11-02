# Diff 对比台（diff-desk）

把「这两份文本 / 这两个 JSON / 这两个目录 / 这两个接口响应到底差在哪」变成一次 30 秒、**数据不出本机**的结构化对比。

## 它解决什么

- **行级 diff 工具对 JSON 噪音巨大**：键序、缩进、数组重排全被误报。本插件的 JSON 语义对比直接给出「哪个路径的哪个值变了」——键序无关、数组按内容对齐（纯重排只报一条顺序提示）。
- **敏感 payload 不能贴到在线 diff 工具**：带 token 的 API 响应、内网配置，贴出去即出域。本插件全流程本机执行，正文不落盘不上传。
- **staging vs prod 一键比**：双 URL 对比会替你发两次请求（带鉴权头），SSRF 围栏拒绝私网/元数据地址。
- **AI 驱动**：对话里说「比下这两个文件差在哪」，AI 经 MCP 七工具发起对比并解释差异。

## 快速上手

1. 面板 **对比** 页：粘贴两段内容（或填两个文件路径），模式选「自动 / 文本 / JSON」→ 对比
2. **目录** 页：两个目录路径 → 对比（哪些文件变了/只在 A/只在 B，点击差异文件进文件对比）
3. **接口** 页：两个 URL（可带请求头）→ 请求并对比
4. **历史** 页：最近对比的元数据（时间/对象/统计）；运行自检

### JSON 语义对比示例

```jsonc
// A
{ "meta": { "ts": 1, "v": 1 }, "list": [{ "k": "x", "v": 1 }, { "k": "y", "v": 2 }] }
// B（键序重排 + 数组重排 + y 的 v 改了 + ts 忽略）
{ "list": [{ "k": "y", "v": 3 }, { "k": "x", "v": 1 }], "meta": { "ts": 99, "v": 1 } }
// 忽略路径填 $.meta.ts → 只报一条：$.list[1].v 2 → 3
```

忽略路径语法：`$.meta.updatedAt`（精确）、`$.items[*].ts`（通配一层）、`$.**.traceId`（任意深度）。

## AI 驱动（MCP 七工具）

| 工具 | 用途 |
|---|---|
| `df_diff_text` | 两段文本/JSON 对比（≤100KB） |
| `df_diff_files` | 两个本机文件对比（只读 ≤20MB，UTF-8/GBK 自动识别） |
| `df_diff_dirs` | 两个目录对比（同大小文件 sha256 实比，默认跳过 node_modules/.git） |
| `df_diff_urls` | 发两次真实请求并对比响应（**调用前 AI 须征得用户同意**；围栏拒绝私网） |
| `df_history` | 最近对比记录（仅元数据） |
| `df_status` | 服务运行状态 |
| `df_selftest` | 内置试金石自检（零网络全链路断言） |

## 架构

```
shared/core.js     纯逻辑零依赖：Myers 行 diff/字级行内 diff/语义 JSON diff（键序无关+数组 LCS 对齐）/目录对比/摘要
service/main.js    对比编排与护栏（127.0.0.1:9877）、历史（仅元数据）、心跳 dfx.meta、自检
service/files.js   只读文件/目录（UTF-8→GBK 回退、大小/条目上限）
service/fetcher.js SSRF 围栏抓取（DNS 逐 IP 复检、重定向逐跳重围栏、跨域剥鉴权头、15s/5MB）
mcp/server.js      stdio MCP 七工具（端口经 dfx.meta 自发现，回退 9877）
src/               React 面板四 Tab（对比/目录/接口/历史），全部经宿主 cap.http 通道
```

## 护栏与隐私

- **全只读**：service/mcp 无任何写文件调用（测试静态断言守护）。
- **正文不出机**：面板↔服务走宿主 cap.http 通道；kv 历史仅存元数据（URL 只留 origin+pathname，防 query 里的 token 入库）。
- **SSRF 围栏**：仅 http/https；IP 字面量私网拒绝；域名 DNS 全地址逐 IP 复检（防 rebinding）；重定向逐跳重围栏、跨 host 剥 authorization/cookie；响应 ≤5MB、≤15s。
- **上限**：粘贴 ≤5MB、文件 ≤20MB、目录 ≤2 万条目、diff 输出 ≤400 行、MCP 摘要截断。
- 无定时任务、无密钥管理面、无外部固定依赖服务。

## 开发

```bash
npm install
npm run typecheck          # tsc --noEmit（strict）
npm run build              # esbuild → dist/panel.js
node test/run-tests.mjs    # 离线单测 + 静态安全断言（零网络）
node test/service-tests.mjs # 服务集成 + MCP stdio 全链路（真子进程，零外网）
node test/smoke-real.mjs   # 真桥冒烟（需 Polaris 宿主运行中）
```

## 已知边界

- diff_urls 的真实请求路径只在真桥冒烟中抽测（离线测试只测围栏拒绝，零外网纪律）。
- 语义 diff 的数组对齐在 n×m > 250,000 时退位置对齐（如实标注路径仍精确）。
- 不做编辑/合并/三方合并、AST 级代码 diff、office/pdf 内容 diff（明确边界）。
- 历史最多 30 条，仅元数据，清空即删。
