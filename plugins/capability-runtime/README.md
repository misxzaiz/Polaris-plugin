# capability-runtime — AI 能力自拓展运行时

让 AI 在**运行时**自行扩展能力，无需重启宿主或客户端：

1. **热插拔功能模组**：AI 自写 JS 模块，`cap_module_install` 装完立即生效（触发 `tools/list_changed`），持久化落盘，重启自动恢复；也可随时停用/卸载。
2. **桌面输入悬浮窗**：AI 即时创建可置顶的真实系统级浮窗（Edge/Chrome `--app` 模式），收集用户输入或展示信息，`cap_overlay_input` 一行调用等待提交结果。

形态：Polaris 插件（MCP stdio server，零依赖，Node ≥ 18）。仅 Windows 有顶层窗口置顶/精确定位（其余平台浮窗仍可用，仅无置顶）。

## 工具一览

| 工具 | 作用 |
| --- | --- |
| `cap_status` | 运行时状态（home、模块数、浮窗数、pid），排查问题先调它 |
| `cap_docs` | 模块编写/能力使用/安全模型文档（`section: overview \| authoring \| security`） |
| `cap_module_list` | 已装模块与工具清单（含每个工具的 `invokeHint`） |
| `cap_module_install` | 安装模块（id + code，装完立即生效并注册进 tools/list） |
| `cap_module_invoke` | 【万能入口】`{module, tool, args}` 直调模块工具 —— 客户端工具表未刷新时恒定可用 |
| `cap_module_set_enabled` | 启停模块（连续 3 次故障被熔断的模块用它恢复） |
| `cap_module_remove` | 卸载模块（进程杀 + 目录入 `.trash`） |
| `cap_overlay_input` | 创建输入浮窗并等待用户提交（`{status: submitted\|closed\|timeout, value}`） |
| `cap_overlay_show` | 创建展示浮窗（纯文本或受控 html，只读渲染防 XSS） |
| `cap_overlay_update` | 更新浮窗内容/标题 |
| `cap_overlay_close` | 关闭浮窗 |
| `cap_overlay_list` | 列出活动浮窗 |
| `cap_overlay_wait` | 对已有输入浮窗继续等待下一次提交（keepOpen 模式） |

客户端 `tools/call` 也可直接调模块工具（发布名 = `<模块id>_<工具名>`）。

## 快速上手（AI 视角）

```text
1. cap_docs { section: "authoring" }           # 写码前先读契约
2. cap_module_install {
     id: "dice",
     code: `api.tools([{
       name: 'roll',
       description: '掷骰子',
       inputSchema: { type: 'object', properties: { sides: { type: 'number' } } },
       async handler(args, ctx) {
         const n = ((await ctx.store.get('count')) || 0) + 1;
         await ctx.store.set('count', n);
         return { roll: Math.floor(Math.random() * (args.sides || 6)) + 1, calls: n };
       }
     }])`
   }
   # → 返回值内含可直接抄的 cap_module_invoke 示例
3. cap_module_invoke { module: "dice", tool: "roll", args: { sides: 12 } }
```

模块内可用能力（`ctx`）：

- `ctx.fetch(url, opts)` —— 带内网 SSRF 防御的 fetch（模块需求 `network: true`）
- `ctx.store.get/set/del/keys` —— 每模块 8MB 持久化 KV（重启恢复）
- `ctx.overlay.input/show/update/close/list` —— 浮窗（模块需求 `overlay: true`）
- `ctx.log(...)` —— 进入运行时日志（stderr）

## 架构

```
宿主（Polaris / MCP 客户端）
  ↕ JSON-RPC over stdio（stdout 单一纯净协议通道；日志全走 stderr）
capability-runtime server（多文件单进程，零 npm 依赖）
  ├─ registry      模块注册中心：安装/锁/子进程池/状态持久化/审计
  │    └─ 每模块一个 fork 子进程（module-child.js）
  │         └─ vm 沙箱执行模块 code，唯一注入 __capCall/__capReady 桥
  ├─ overlayHost   浮窗宿主：HTTP(仅 127.0.0.1) + Edge/Chrome spawn + PS 窗口控制器
  │    └─ 每浮窗独立临时 profile（capov-*），PS1 常驻窗口控制器管理（win/overlay-host.ps1）
  └─ audit.ndjson  结构化审计追加（含模块 code sha256）
```

关键设计决策：

- **子进程而非 worker_threads**：worker 与宿主同 PID，Windows 上没有独立可 kill 的进程树。fork 保证 `taskkill /PID <pid> /T /F` 一步干净击杀（应对模块内死循环）。
- **vm 沙箱**：模块 code 只拿到 `api` / `__capCall` / `__capReady` 三个全局，ctx（fetch/store/overlay/log）全部在 vm 内经由同一个桥组合而成，模块代码不会有 `require` / `process` 实面。
- **单实例锁**：具名 pipe 探活（进程真实存活证明）→ `.lock` 文件 pid 存活性双重确认（修复 pipe 未就绪窗口的 TOC 竞态）→ `.lock.takeover` 以 `wx` 排他接管 → 陈旧 takeover（>5s）清理。第二个实例自动切后缀 home（`home.i1…i8`），多会话互不干扰。

## 安全模型（如实声明）

- **这是「故障隔离 + 防手滑」，不是恶意代码边界**。`vm` 沙箱 + fork 进程提供隔离与清理，但一个恶意模块可沿 `__capCall` 桥逃逸到子进程权限。能装模块的人 = 接近宿主权限的人，模块的可信度由此层级（用户授权 AI 安装）承担。
- 安装面收敛：
  - 模块上限 12、每模块 ≤16 工具、code ≤ 256KB、id 正则 `^[a-z0-9][a-z0-9-]{0,31}$`。
  - 安装前置引导：一次性 probe 子进程真实加载 code 并回报 tool defs，形状不合规（重名/名字非法/schema 非对象/>16）直接拒收，不落盘。
  - install 走 `staging → rename` 原子落地，中途断电不留半死模块。
- 运行期收敛：
  - 模块调用默认 60s（≤300s 硬上限），超时 `taskkill` 整树；连续 3 次故障 → 自动停用（状态保留，可手动恢复）。
  - `ctx.fetch`：逐 IP 解析 DNS、拒绝环回/私网/链路本地/组播段、8MB 响应上限 —— 模块网络只出不进管理口。
  - `cap_overlay_*` 的 HTTP 仅绑 `127.0.0.1`；页面首次 GET 用一次性 bootstrap code（60s TTL）换取 session token，之后所有 POST 带自定义 `Authorization: Bearer`（no-cors 简单请求伪造不了）；`Origin`/`Host` 双校验；CSP。
  - 浮窗上限 3、wait ≤ 300s、浮窗内容 `textContent` 渲染（`html` 模式同样经 `textContent` 中转，脚本不执行）。
- 落盘审计：`<home>/audit/audit.ndjson` 追加（install/fault/overlay 等事件 + code sha256）。

## 数据位置

默认 home（按优先级）：

1. `--home <dir>` 启动参数
2. env `CAP_RUNTIME_HOME`
3. Polaris 场景：`<appConfigDir>/capability-runtime/<workspaceHash10>`（appConfigDir 作首参且存在；无工作区时为 `global`）
4. 兜底 `<cwd>/.capability-runtime`

home 内：`modules/`（安装）、`state/`（`<id>.json` + `.bak`）、`audit/audit.ndjson`、`.trash/`、`.quarantine/`（scan 恢复发现损坏时隔离）、`.lock`（单实例）。删除 home = 全部清除，无外部副作用。

浮窗临时 profile 在 `%TEMP%/capov-<id>`，关闭即删；启动时另清扫 >3h 的陈旧目录。

## Windows 说明

- 窗口控制器为常驻 PowerShell（`win/overlay-host.ps1`），stdin/stdout 自管 UTF-8 字节（规避 PS 5.1 GBK 代码页陷阱），Per-Monitor DPI Aware V2。
- 窗口定位走「spawn 出的进程树 + 标题前缀 `PolarisOV#`」双校验，绝不按进程名全局搜索夹带用户自己的 Edge 窗口。
- PS 5.1 已知坑（已规避）：WQL `ParentProcessId IN (...)` 抛 0x80041017 → 逐 pid 查询；PowerShell 输入自动化（SendKeys）在 CI/无人值守桌面环境不可靠，属环境限制非产品缺陷（真人场景直接键盘提交）。

## 测试

```bash
node plugins/capability-runtime/test/run-tests.mjs      # E2E 17 用例（需本机 Edge/Chrome 的 T11 可降级通过）
node plugins/capability-runtime/test/overlay-http.mjs   # 浮窗 HTTP 通路级驱动（bootstrap/单次 cb/Bearer/Origin/submit 语义）
```

## 威胁边界内未覆盖（本版本放开范围）

- 恶意代码逃逸（声明为不可达边界）与跨用户/特权提升。
- 浮窗视觉上只通过用户系统的默认浏览器窗口实现（`--app` 模式无地址栏），未做进程级嵌入；浏览器自身行为（后台保活等）已通过启动参数尽量收敛，残留行为归浏览器。

## 版本

- 1.0.0：meta 工具 + 模块热插拔 + 浮窗 + 审计 + 熔断 + 单实例锁 + Windows 窗口控制器。
