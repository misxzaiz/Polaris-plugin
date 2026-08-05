# ngrok-manager 插件实施方案 v2(多隧道)

> 状态:已复审验证,待实施
> v1 单隧道方案已废弃,改单进程多隧道模型
> 复审见 `verification-report.md` + `verification-report-multitunnel.md`

## 1. 目标

将 `D:\app\ngrok-v3-stable-windows-amd64\ngrok.exe`(v3.39.1)接入 Polaris 插件系统,提供:

- **同时启动管理多个 HTTP 隧道**(free 计划单 session 内多隧道)
- 每条隧道独立端口、独立 URL
- 每条可选随机域名 / 固定保留域名
- 公网 URL 一键复制/打开浏览器
- 隧道状态、日志实时可见
- AI 可通过 MCP 工具调用(ngrok_start/stop/list/stop_all)

## 2. 架构(三件套,单进程模型)

```
ngrok-manager/
├── plugin.json            # manifest
├── update.json           # 更新清单
├── server.js             # 管理器 HTTP 服务(services.http, autoStart)
├── mcp/server.js         # stdio MCP 薄壳
├── src/Panel.tsx         # 面板源码
├── dist/panel.js         # esbuild 打包产物(React external)
├── README.md
└── ngrok-manager.zip     # pack 产物
```

### 进程职责

| 进程 | 类型 | 职责 |
|------|------|------|
| 管理器 server.js | services.http autoStart | 隧道注册表 + 配置文件生成 + ngrok 进程生命周期 + `:4040` 轮询 + REST API |
| mcp/server.js | stdio MCP | 给 AI 调用,fetch 本机管理器 |
| dist/panel.js | ActivityBar 面板 | UI,fetch 本机管理器 |

### 核心模型:单进程 + 配置文件驱动

**只有 1 个 ngrok 进程**,通过配置文件 `tunnels:` 段定义所有隧道。增删隧道 = 重写配置 + 重启进程。

```yaml
# {{pluginDir}}/ngrok-tunnels.yml (管理器生成,不手编)
version: "3"
agent:
    authtoken: <从全局 ngrok.yml 读取,不硬编码>
tunnels:
    <tunnel-id>:
        addr: <port>
        proto: http
        domain: <domain>   # 仅固定域名时
```

## 3. 关键设计(复审校准)

1. **单进程多隧道**:free 计划限制 session 数=1,不是隧道数。单进程内 `tunnels:` 段可启多条,共享 session 各自独立 URL。
2. **URL 获取优先 `:4040/api/tunnels`**:单进程下 inspect 端口固定 4040(不递增),API 返回完整 `tunnels[]` 数组。JSON 日志作兜底。
3. **增删=重写+重启**:更新内存注册表 → 重写 `ngrok-tunnels.yml` → `taskkill /T /F` 旧进程 → spawn 新进程 → 轮询 `:4040` 直到所有隧道拿到 URL 或 10s 超时。
4. **杀树停止**:`taskkill /PID xxx /T /F`(`/T` 杀整个进程树,实测 `kill $PID` 留僵尸)。
5. **清代理环境**:spawn env 删除 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/http_proxy/https_proxy/all_proxy`(残留致 ngrok 连不上服务器)。
6. **ngrok 路径不硬编码**:先查 PATH `ngrok`,找不到用面板配置路径(写 `{{pluginDir}}/config.json`),默认值 `D:\app\ngrok-v3-stable-windows-amd64\ngrok.exe`。
7. **authtoken 不硬编码**:从全局 `C:\Users\28409\AppData\Local\ngrok\ngrok.yml` 读取注入,或在配置里用 `--config` 多文件合并(全局 + 隧道文件)。
8. **唯一性校验**:tunnels[] 内 port 唯一、domain(若有)唯一。

## 4. REST API

管理器固定端口 `9870`(被占则 +1,实际端口写 `{{pluginDir}}/.port`)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/__health` | `{status:'ok',uptime,ngrokPath,ngrokReady}` |
| GET | `/config` | 返回 ngrok 路径、默认保留域名、管理端口 |
| PUT | `/config` | 更新配置(写 config.json) |
| GET | `/tunnels` | 返回 `[{id,port,domain,publicUrl,status,startedAt}]` |
| POST | `/tunnels` | body `{port,domain?}` → 加入注册表 + 重启 ngrok,返回新隧道 |
| DELETE | `/tunnels/:id` | 移除 + 重启 ngrok |
| DELETE | `/tunnels` | 清空 + 停止 ngrok |
| POST | `/tunnels/apply` | 批量编辑后一次应用(减少重启次数) |
| GET | `/tunnels/:id/logs?limit=N` | 返回该隧道相关日志 |
| GET | `/logs?limit=N` | 全局日志 |

### 增删流程(POST /tunnels)

```
1. 校验 port 唯一、domain 唯一(若有)
2. 加入内存注册表 tunnels[]
3. 重写 ngrok-tunnels.yml
4. 若 ngrok 进程在运行:taskkill /T /F,wait 回收
5. spawn:ngrok start --all --config=<全局ngrok.yml> --config=<隧道yml>
          --log=stdout --log-format=json
   env: 去掉代理变量
6. 状态机:所有隧道 status=starting
7. 轮询 :4040/api/tunnels(每 500ms,最多 20 次=10s):
   - 拿到 public_url 匹配 name → 该隧道 status=running, publicUrl=url
   - 全部匹配或超时
8. 超时未拿到 URL 的隧道:status=error,保留日志
```

## 5. MCP 工具

| 工具 | 参数 | 返回 |
|------|------|------|
| `ngrok_start` | `port:int`(必), `domain:string?`, `name:string?` | 公网 URL 或错误 |
| `ngrok_stop` | `target:string`(id 或 port) | ok/err |
| `ngrok_list` | 无 | 隧道数组 |
| `ngrok_stop_all` | 无 | ok |

## 6. 面板 UI(v3 响应式)

见原型 `ngrok-manager 响应式原型 v3`。**移动优先设计**(Polaris 手机端 WebView 加载,面板默认窄)。

### 响应式策略

- **断点 720px**:以下为移动布局(单列、底部操作栏、设置 bottom-sheet),以上为桌面布局(面板居中 max-width 560px、设置居中弹窗)
- **clamp() 流式**:`--sp-pad`/`--fs-base`/`--btn-h` 等用 `clamp(min, vw, max)`,窄屏自动收缩
- **安全区**:`env(safe-area-inset-bottom)` 适配 iPhone 底部 home indicator / Android 导航栏
- **100dvh**:用 dynamic viewport height 避免移动端地址栏伸缩导致布局跳动
- **触控优化**:`-webkit-tap-highlight-color: transparent`、按钮 `:active` 缩放反馈、最小触控目标 34px
- **桌面侧边面板**:≤720px 时居中限宽,两侧留深色背景,避免桌面宽屏拉伸难看

### 布局(移动)

```
┌─────────────────────────┐
│ topbar: logo+ngrok v2   │  ← 品牌徽标 + 进程状态点 + 刷新/设置
├─────────────────────────┤
│ [pending bar 内联条]    │  ← 有待应用时显示,应用/放弃
├─────────────────────────┤
│ 添加隧道卡               │  ← 端口输入 + 横滑端口 chips + 域名 seg
│ 运行中隧道卡             │  ← 隧道行(状态左条 + URL + 操作)
│ 日志卡(折叠)            │
│ hint-box                │
├─────────────────────────┤
│ bottom bar (拇指区)      │  ← 有待应用时显示:计数 + 放弃 + 应用变更
└─────────────────────────┘
```

### 关键交互细节

- **端口 chips 横滑**:`overflow-x:auto`,滚动条隐藏,常用端口 3000/8080/9820/5173/4173
- **隧道卡状态左条**:每行左侧 3px 彩条(running 绿/starting 黄/stopping 红),比徽标更直观
- **URL 点击即复制**:公网 URL 单击复制(toast 确认),减少按钮拥挤
- **底部操作栏**:有待应用时固定底部,符合拇指操作区;`env(safe-area-inset-bottom)` padding
- **设置 bottom-sheet**:移动端从底部滑入(带拖拽指示器),桌面端居中弹窗
- **toast 居中底部**:待在 bottom bar 上方,避免遮挡操作

## 7. 文件清单与工作量

| 文件 | 行数估 | 说明 |
|------|--------|------|
| plugin.json | ~45 | manifest |
| update.json | ~45 | 同 plugin.json |
| server.js | ~280 | HTTP + 注册表 + 配置生成 + ngrok 生命周期 + :4040 轮询 |
| mcp/server.js | ~120 | stdio JSON-RPC,4 工具 |
| src/Panel.tsx | ~380 | React 面板(多隧道 + 待应用) |
| dist/panel.js | 打包产物 | esbuild,React external |
| README.md | ~80 | 使用说明 |

预估 1.2 人日。

## 8. 实施阶段

### Phase 1:管理器 server.js
- HTTP 服务 + 路由 + 配置读写
- 隧道注册表 + 唯一性校验
- 配置文件生成(读全局 ngrok.yml authtoken)
- ngrok 进程 spawn/kill(taskkill /T /F)
- `:4040/api/tunnels` 轮询 + URL 匹配
- 10s 超时 + 日志累积
- AC:curl 启 2 条隧道拿到 2 个 URL;停 1 条剩 1 条仍 running;停全部无残留

### Phase 2:MCP server.js
- stdio JSON-RPC + 4 工具
- 读 `.port` 定位管理器
- AC:手动 JSON-RPC,ngrok_start(9820)+ngrok_start(9821) 返回 2 URL

### Phase 3:面板 Panel.tsx
- 启动表单 + 待应用列表 + 隧道列表 + 日志 + 设置
- 轮询 `GET /tunnels` (2s)
- 复制/打开(Tauri shell.open)
- AC:加 2 条→应用→2 URL;停 1 条→剩 1 条;停全部

### Phase 4:打包上架
- esbuild 打 panel.js(React external)
- `node scripts/pack.js plugins/ngrok-manager` 生成 zip
- 填 update.json + index.json 追加
- AC:本地安装后,面板/MCP/服务全可用

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| 增删时全部隧道短暂中断(~2-3s) | UI 提示"重启中";提供"待应用"模式批量编辑后一次应用 |
| 管理器端口 9870 被占 | +1 递增,实际端口写 `.port` |
| ngrok 不在 PATH | 面板设置强提示,`GET /__health` 返回 ngrokReady |
| 端口/域名冲突 | 启动前校验唯一 |
| 超时未拿到 URL | 10s 超时,标记 error,日志透传 |
| ngrok 僵尸进程 | `taskkill /T /F`;SIGTERM 钩子 stop_all |
| authtoken 未配 | 启动失败日志透传 |

## 10. 验收清单

- [ ] 管理器 autoStart,面板可见服务 running
- [ ] 添加 2 条隧道(9821 随机 + 9822 固定)→应用→2 个 URL
- [ ] 停 1 条→剩 1 条仍 running,公网 URL 不变
- [ ] 停全部→无 ngrok.exe 残留
- [ ] MCP `ngrok_start(9820)` + `ngrok_start(9821)` 返回 2 URL
- [ ] 面板复制/打开可用
- [ ] 端口冲突/域名冲突被拒绝
- [ ] ngrok 路径未配时,设置弹层提示并可修改生效
