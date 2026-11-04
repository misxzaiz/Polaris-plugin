# 自动化流水线（flow-pipeline）

把「抓数据 → 加工 → 调 AI → 调插件工具 → 落盘/通知」这类重复的多步操作，串成一条**会自己跑的流水线**。

- 数据全在 cap.kv，不出本机；服务仅绑 127.0.0.1。
- 零运行时依赖（node ≥ 18），装完即用。
- 面板 + 后台服务 + MCP 八工具三件套（house 标准形态）。

## 一句话场景

- 每天早八点抓接口数据 → 存成文件归档
- 每 30 分钟巡检接口 → 失败才发钉钉/企微通知
- Webhook 收到告警 → AI 分析该不该半夜叫人 → 推送结论
- 定时调用任意已装插件的 MCP 工具（域名体检/密钥扫描/依赖体检…）并把结果存档

## 九类步骤

| 步骤 | 说明 |
|---|---|
| http | 方法/头/体/超时；**SSRF 围栏**（私网/环回/元数据地址拒绝，本地联调需流水线显式开 allowLocal；重定向逐跳复检，跨源剥鉴权头） |
| mcp | 经 cap.mcp 直调宿主任意已装插件的 MCP 工具（工具即步骤） |
| ai | 供应商直连非流式（OpenAI 兼容 / Anthropic Messages 双协议；可从宿主一键导入） |
| extract | JSONPath-lite 提取（`a.b.0` / `items[*].id` / `list[?status=open]`；通配聚合数组） |
| template | `{{占位符}}` 模板渲染（整串占位保留原类型） |
| script | node:vm 沙箱 JS 片段（2s 超时、无 require/process；本机信任模型与 task-runner 命令行步骤同级，主要防误写死循环） |
| kv | cap.kv 读写删（跨运行持久化） |
| file | 白名单根目录写文件（输出目录 / 桌面 / 临时目录；相对路径默认落输出目录；目录外拒绝） |
| notify | Webhook 出站通知（钉钉/企微/飞书/Bark 都是 POST；同 http 围栏） |

每步可带：`saveAs`（输出保存名，后续 `{{名字}}` 引用）、`when`（门控表达式，如 `{{resp.ok}} == false`）、`continueOnError`。

## 四种触发

- **manual**：面板按钮 / MCP flow_run / REST
- **interval**：每 N 分钟（≥5）
- **daily**：每天 HH:MM（本地时区）
- **webhook**：`POST http://127.0.0.1:9881/hook/<plId>`，头 `X-FlowPipe-Token: <管道token>`；body→`{{params.body}}`、query→`{{params.query}}`；12 次/分钟限流

错过调度只补跑一次（missed 标记），不回放积压（task-runner/data-ark 同款语义）。

## 插值与上下文

- 根作用域：`{{vars.x}}` / `{{steps.输出名.path}}` / `{{params.x}}` / `{{env.today|now|runId|plId|plName}}`
- 简写：不带根作用域前缀时按 vars → steps → params 顺序回落（`{{apiHost}}`、`{{resp.json}}` 均可直写）
- 整串恰为一个占位符 → 保留原值类型（对象/数组直接传）

## AI 对话式使用（MCP 八工具）

在 Polaris 聊天里直接说「帮我建一条每天抓 xx 存档的流水线」：

`flow_list` / `flow_get` / `flow_save` / `flow_toggle` / `flow_run` / `flow_status` / `flow_delete`（双闸确认）/ `flow_selftest`

## 安全设计

- 敏感变量（vars 标记「敏感」）与供应商 apiKey **出口一律掩码**（前4***后2）：运行摘要、AI 返回、API 响应均不出现原文；编辑回传掩码哨兵 → 服务端保留旧值
- 服务 Bearer token（32B 随机）timingSafe 比对；webhook 管道级 token 独立
- HTTP/notify 步骤默认禁私网/元数据地址（169.254.169.254 永不放行）；跨源重定向剥 Authorization/Cookie
- script 步骤 vm 沙箱 + 2s 超时（如实说明：不防恶意本机用户，与 task-runner 命令行执行同信任级）
- file 步骤路径白名单 + 目录穿越拒绝 + 10MB 上限
- 运行历史每管道保留 30 条，记录先掩码再落 kv

## 本地开发

```bash
cd plugins/flow-pipeline
npm install          # 仅构建期依赖（esbuild/tsc）
npm test             # 离线测试 58 断言（引擎/steps/runner/service/mcp 五层）
npm run typecheck    # 面板 tsc --noEmit
npm run build        # esbuild 产出 dist/panel.js
```

测试说明：service/mcp 层用「假宿主桥」（env `POLARIS_HOST/PORT/TOKEN` 注入）全离线跑通全链路；`APPDATA` 指向临时目录隔离本机真实配置。真桥冒烟（真实 cap.kv/cap.mcp）需在 Polaris 宿主内进行。

## 已知边界（如实）

- Web(https) 部署模式下浏览器拦 `http://127.0.0.1` 混合内容——桌面/手机 WebView 正常（repo-lens/stream-desk/api-bench 同款边界）
- 调度精度分钟级；interval 首装从启用时刻起算，不立即触发
- webhook 服务绑 127.0.0.1：外部系统要打进来需本机有端口转发/隧道（本地脚本、CI agent、宿主内插件直打无碍）
- script 步骤非安全边界（见上）；不支持并行分支/循环/子管道（线性 + when 门控覆盖主场景，画布编辑器明确不做）
- mcp 步骤依赖宿主 cap.mcp 通路；若目标 server 未启用会得到可读错误
