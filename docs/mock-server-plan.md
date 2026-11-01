# Mock 接口台（mock-server）选型与设计

> 2026-11-02 选型定案。方向硬约束：工具/技术类（禁台账/记录/生活类）——本插件核心动作是「**变换与仿真**」（把 HTTP 请求变成可编排的假响应），非记录。

## 一、选型依据（市场证据）

### 1.1 问题
前后端并行开发时后端接口未就绪；联调第三方接口不稳定/造不出边界数据；演示与测试需要可控响应（延迟/错误/慢速）。前端被迫写死数据或侵入代码切换环境。

### 1.2 证据（可追溯）
- **Mockoon**：桌面 GUI mock server，免费开源 + Pro 付费档（商业验证），Microsoft Store 分发，2025 年仍活跃被社区讨论（mockoon.com / github.com/mockoon/mockoon）。
- **EasyMock 死亡**：仓库多年无官方维护，在线服务经常挂，Mongo 兼容问题堆积，2024 年后用户被迫迁移（github.com/easy-mock/easy-mock/issues）。
- **Apifox** 把「Mock」作为一级功能（文档+Mock+测试一体）——国内头部 API 工具证实需求强度，但要求整套装起来、注册账号。
- **MSW / vite-plugin-mock / json-server**：2024-2025 社区最热替代，均为**代码级/CLI 级**方案——要在项目里装依赖或敲命令，没有零配置 GUI。
- 中文社区反复出现的痛点归纳：联调依赖、代码侵入、EasyMock 不稳（apifox.com/apiskills、cnblogs、juejin 讨论）。

### 1.3 竞品与差异化
| 方案 | 形态 | 缺口 |
|---|---|---|
| Mockoon | 独立桌面 App（国外） | 要另开一个应用；无 AI 对话式造数据；中文 UI 弱 |
| Apifox | 全家桶 SaaS/重 | 账号+整套文档流程，只想 mock 一个接口太重 |
| MSW | 代码级 Service Worker | 项目内集成、写 handler 代码 |
| json-server | CLI | 无 GUI、无故障注入、无 AI |
| **本插件** | Polaris 常驻面板 | **AI 对话式建路由（MCP 八工具）+ 零配置 GUI + 模板数据造数 + 故障注入 + 请求历史留痕 + 生态联动（api-bench 压它 / relay-devkit 调它）** |

生态查重（index.json 71 插件 + needs/001-027）：零 mock 服务能力；webhook-station 是「收」（捕获回调），本插件是「发」（仿真应答）——互补不重叠。

### 1.4 关键假设与止损
- 假设：Polaris 用户（含 AI agent 开发者）需要本地假接口。MVP 用内置试金石自检验证工具链；若连续使用率低，止损在 v0.1（投入 ≈1 个插件周期）。

## 二、产品定义

- **名称**：Mock 接口台（id `mock-server`，kv 前缀 `mck`，服务端口 9868，图标 Code2）
- **一句话**：把本机 127.0.0.1:9868 变成一套随编随用的假接口：对话或表单建路由，模板造真实感数据，故障注入造边界，请求全留痕。
- **MVP 范围**：路由 CRUD（method/路径参数/通配符/状态码/响应头/JSON+文本体）、模板引擎（{{uuid}}/{{int}}/{{cname}}/{{email}}/{{req.path.*}}/{{req.query.*}}/{{req.body.*}}/{{pick}} 等）、CORS（echo/star/off + 预检）、延迟+错误率注入、fallback 路由、请求历史（内存 500 条 + kv 分块镜像）、OpenAPI JSON 导入、内置试金石自检、MCP 八工具、面板四 Tab。
- **暂不做**：HTTPS/局域网监听（v0.1 仅 127.0.0.1）、录制回放代理、gRPC/GraphQL schema 感知、响应体分页器、YAML 解析（OpenAPI 只收 JSON，YAML 让 AI 转）。

## 三、架构（与 webhook-station 同款两平面）

```
面板(React) ──cap.kv(mck.*)──┐
AI(MCP stdio) ──cap.kv───────┤   控制面：mck.settings / mck.cmd(单槽信箱) / mck.result
                             │          mck.hist.<n> 分块 / mck.idx / mck.meta
被测应用 ──HTTP 9868─────────┘   数据面：mock 路由匹配 → 模板渲染 → 延迟/故障 → 响应
                                 /__health 保留；/__ 前缀路由一律拒绝注册
服务 tick(3s)：settings 热更 → 消费 cmd → 历史镜像 → meta 心跳(60s)
```
- **无服务管理 HTTP API**：控制面全走 cap.kv（webhook-station 同款），服务端口只暴露 mock 数据面 + /__health，无新增鉴权面。
- **面板不直接 fetch**（历史用 kv 镜像轮询；「试一发」走 cmd 信箱由服务侧发请求，规避混合内容/跨域）。
- 路由匹配：静态段>参数>:splat 评分，同分按创建序——确定且可解释。

## 四、护栏

| 项 | 上限 |
|---|---|
| 路由数 | ≤100（超出拒绝保存） |
| 响应体 | ≤16KB（归一化截断） |
| 请求体入历史 | 预览 ≤8KB（超截断标注），接收体 ≤2MB（超出 413） |
| 延迟注入 | ≤60s |
| 历史环 | 500 条（内存权威，重启清空——文档明示；kv 只镜像最近 ~10 块） |
| 路径 | 必须以 / 开头，禁 /__ 前缀，≤20 段 |
| 自检 | 单飞互斥（自检期间拒绝再跑），临时路由用后即删 |
| 敏感头 | 入历史/AI 可见面一律掩码（authorization/cookie/token/…） |

## 五、验证计划（四层 + 真桥）

1. core 单测：路由归一化/匹配评分/模板（可注入 rng+counter 确定性断言）/CORS 头/历史分块计划/OpenAPI 导入/掩码。
2. 服务集成（假 kv 桥 + 真实 HTTP 请求打真服务）：试金石逐项断言（模板/参数回显/延迟/错误率/404 诊断/预检/历史落镜像/cmd 信箱回执）。
3. MCP 协议：initialize/tools/list/八工具 call（stdio 子进程 + 假桥）。
4. SSR 渲染：react-dom/server 断言四 Tab 结构/护栏文案/空态。
5. 真桥冒烟：真实宿主 kv + 真实 curl 打 9868。
门槛：tsc strict + esbuild 通过，全测绿后走五步发布链。
