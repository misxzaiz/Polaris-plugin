# 堆栈还原台（stack-lens）

把「`app.8f2a.js:1:88423`」变回「`src/api/user.ts:42:10`」：粘贴 minified 错误栈 + 指定
sourcemap 来源，逐帧还原成原始源码位置与代码帧。全程本地计算，错误栈不落盘。

## 解决什么问题

- **线上排障**：报错日志里的栈全是压缩后的 `file:1:88423`，无法下手——还原一帧往往直接
  定位根因。
- **用户上报/客服工单**：拿到一段 minified 栈，需要知道具体挂在哪个源码位置。
- **不愿把 map 传第三方**：sourcemap 含完整源码，粘贴进网页工具=泄露；本插件全离线。

**前提**：手上要有对应版本的 `.map` 文件（构建产物目录、CI 产物、或自己 dev server 的
`/assets/*.js.map`）。没有 map 的帧会显式标注原因，绝不编造位置。

## 使用

### 面板（还原 / 地图 / 服务 三个 Tab）

1. **还原**：粘贴错误栈 → 给 map 来源（四选一或组合）→ 点「还原」：
   - 构建产物目录（自动扫 `*.map` + `.js` 尾部 `sourceMappingURL` 注释并配对）
   - 拖拽 `.map` 文件 / 文件选择
   - 粘贴 map JSON
   - 从 URL 抓取（http/https，60MB/15s 上限）
2. **地图**：扫描目录看有哪些 map（file 字段/源数/是否含 sourcesContent）；体检单个
   map（映射段数/生成行数/覆盖率/警告）。
3. **服务**：服务状态/重启。

结果逐帧三态：`✓ 已还原（原始位置 + 函数原名 + 代码帧）` / `✗ 未还原（带原因）` /
`○ 运行时内部帧（跳过）`；顶部汇总还原率。

### AI（MCP 六工具）

| 工具 | 用途 |
|---|---|
| `stack_resolve` | 整条错误栈还原（stack + mapsDir/mapPaths/fetchUrls） |
| `stack_resolve_file` | 从日志/错误报告文件读栈还原 |
| `maps_scan` | 扫描构建产物目录的 sourcemap 清单 |
| `map_locate` | 单点定位：生成 行:列 → 原始 行:列 + 函数名 + 代码帧 |
| `map_source` | 取 map 里某源文件内容渲染代码帧 |
| `map_validate` | map 结构体检 |

## 架构

```
面板（src/，esbuild → dist/panel.js）
  │  127.0.0.1:{port} + Bearer token（meta 自 cap.kv 读 stacklens.meta）
  ▼
service/main.js（端口 9890，REST；map 解析结果内存缓存 mtime 失效）
  │  require ../shared/core.js        require ./kvclient.js
  ▼                                      ▼
shared/core.js（纯引擎）              宿主 cap.kv（stacklens.meta / stacklens.settings）
mcp/server.js（stdio JSON-RPC，六工具 → 127.0.0.1 服务）
```

- `shared/core.js`：VLQ 解码 / sourcemap v3 + 段式 index map / 栈解析（Chrome·Node·
  Safari·Firefox）/ map 配对（file 字段 → 同名 basename → sourceMappingURL）/ 逐帧
  `originalPositionFor` / 代码帧渲染 / map 体检。零依赖。
- 列口径：栈的列与 sourcemap 的列同为 UTF-16 code unit，直接可比；`originalPositionFor`
  取同生成行内 ≤ 查询列的最大映射段（spec 左闭右开惯例）。
- sourcesContent 缺失时回退磁盘：source 名按 map 所在目录相对解析（剥 webpack:// 前缀）。

## 安全与隐私

- 服务仅监听 `127.0.0.1`；除 `/__health` 外全部要求 Bearer token（timingSafe 比对）。
- **错误栈与 map 内容一律不落盘**：cap.kv 只存 `stacklens.meta`（心跳）与
  `stacklens.settings.recentDirs`（最近目录路径）。不使用 kv list（宿主已实测会楔死
  dispatch 通道）。
- 唯一出站网络 = 用户显式给出 map URL 的 GET（60MB/15s 上限、不带凭证）；本机
  dev server 的 localhost map 属合法场景。
- fs 只读；不写任何文件（selftest 用 `os.tmpdir()` 且 finally 清理）。

## 开发

```bash
pnpm install          # 仅 devDependencies（esbuild/tsc/types）
pnpm typecheck        # tsc --noEmit
pnpm build            # esbuild → dist/panel.js
pnpm test             # node --test test/
STACKLENS_SELFTEST=1 node service/main.js 9899   # 服务自检（离线全链路）
```

## 已知边界

- 栈格式覆盖 Chrome/Node/Safari/Firefox 主流格式；奇特自定义格式走「unparsed」保底。
- 无 sourcemap 的帧只标原因（构建时需开 sourcemap 输出）。
- Web(https) 部署模式下浏览器会拦 `http://127.0.0.1` 混合内容（桌面/手机 WebView 正常，
  与 bundle-lens/repo-lens 等直连面插件同款边界）。
- 名字还原依赖 map 的 names 段；esbuild/terser 通常提供，部分构建器可能缺失。
