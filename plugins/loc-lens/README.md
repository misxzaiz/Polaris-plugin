# 行数透视台（loc-lens）

实时查看**当前项目**各模块代码行数的 Polaris 面板插件。

## 功能

- **自动跟随当前项目**：面板订阅宿主工作区，切换项目后自动重新扫描（无需手填路径）。
- **手动指定目录**：输入任意绝对路径统计（配合最近路径 datalist）。
- **实时增量更新**：服务端 `fs.watch` 递归监听 + 防抖增量重算，改代码后约 2 秒内自动反映（面板 2s 轮询）。
- **模块行数条形图**：按根目录下一级目录分桶，行数降序，附文件数与字节量。
- **语言分布**：按扩展名聚合的 Top 12 语言 chips。
- **统计明细**：总行数 / 文本文件数 / 非空行三卡片；二进制、锁文件、超大文件跳过计数；截断与错误提示。

## 统计口径（v1）

| 项 | 口径 |
|---|---|
| 行数 | **物理行**：在 Buffer 上数 `0x0A`，末字节非 `\n` 则 +1。对 UTF-8/GBK 等任意单字节兼容编码精确，不做解码。 |
| 非空行 | 非空白字符的行 |
| 模块 | 根目录下**一级子目录**（子目录文件归入其一级祖先桶）；根下散文件入「（根文件）」 |
| 跳过目录 | node_modules / .git / dist / build / target / coverage / __pycache__ / .venv / .polaris / .workbuddy 等整树 |
| 跳过文件 | 锁文件（package-lock.json / Cargo.lock 等）、`*.min.*`、`*.chunk.*` 产物；二进制扩展名（png/exe/zip…）与首块含 NUL 的文件 |
| 超大文件 | 单文件 > 8MB 不读内容（计入 skippedLarge） |
| 上限 | 最多 30000 文件 / 256MB 内容，超出标记 truncated |

## 键空间契约（cap.kv，`loclens.` 前缀，勿与他插件撞）

| 键 | 写者 | 内容 |
|---|---|---|
| `loclens.meta` | 服务（单写者） | `{port, token, pid, version, startedAt, live, lastBeat}` 心跳 60s |
| `loclens.settings` | 面板（单写者） | `{manualRoot, recentPaths[], autoFollowWorkspace}` |

## 架构

```
面板(React) ──127.0.0.1 HTTP + Bearer token──▶ service/main.js（行数引擎）
   │ cap.kv 读 loclens.meta 拿 {port,token}        │ fs.watch 递归 + 防抖增量
   └─ cap.kv 读写 loclens.settings                 └─ kvclient → 宿主 cap.kv（仅投影 meta）
```

安全：仅监听 127.0.0.1；除 `/__health` 外全部 Bearer token（timingSafe 比对）；文件系统只读（readdir/readFile/stat/watch）；符号链接逃逸校验；零网络出站。

## 开发

```bash
pnpm install          # 或 npm install（esbuild/typescript/react 类型）
pnpm typecheck        # tsc --noEmit
pnpm test             # node --test（20 断言，含服务级冒烟）
pnpm build            # esbuild → dist/panel.js
```

调试：设置 → 插件 → dev-link 指向本目录（`D:\space\base\Polaris-plugin\plugins\loc-lens`），改 service/*.js 后重启服务进程即生效；改 src/*.tsx 后需重新 build。
