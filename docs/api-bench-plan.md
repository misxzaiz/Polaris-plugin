# api-bench 接口压测台 —— 选型与设计文档

> 2026-11-02。依据任务书五阶段流程产出：候选池 12 → 外部调研 → 加权评分 → 唯一决策。

## 〇、方向硬约束自检

核心动作 = **诊断/测了什么**（压出接口的真实吞吐与延迟分位），不是「记录发生了什么」。
非台账、非记录、非家庭生活管理。主攻方向命中：调试/诊断/观测、性能、开发者工具。

## 一、候选池（12 个，全部通过硬约束后进入调研）

| # | 方向 | 一句话 | 初筛结论 |
|---|---|---|---|
| 1 | SSH 远程运维台 | AI 驱动远程服务器管理 | 需求真实但 MCP 层已有多个成熟实现（bvisible/mcp-ssh-manager 531★ 等），宿主可直接装外部 MCP server，插件形态增益有限 → 淘汰 |
| 2 | 文件夹自动化流水线 | watch 文件夹+规则变换（Hazel 式） | Hazel 付费验证了需求，但 Windows 免费位已有 DropIt / Organize（活跃开源），AI 配置差异化不够宽 → 备选 |
| 3 | 本地 API 压测台 | autocannon 内核的轻量压测 GUI | **选定**，见下 |
| 4 | DuckDB 查询台 | CSV/Excel/JSON→SQL 分析 | 需求薄证据（需求库 013 有兴趣信号），官方 DuckDB UI 扩展已出现削弱缺口，50MB+ 原生绑定打包风险 → 备选 |
| 5 | 数据变换台 | 格式互转/代码类型生成/fake data | 单点价值浅，易被 relay-devkit 吸收 → 淘汰 |
| 6 | 本地 Mock 服务器 | Mockoon 类 | Mockoon/json-server 免费成熟，差异化弱 → 淘汰 |
| 7 | Prompt 回归测试台 | promptfoo 类 | promptfoo OSS 强势，多模型 key 配置摩擦大 → 淘汰 |
| 8 | 结构化抽取台 | 非结构化文本→JSON/Excel | 宿主 AI 聊天已能做小批量，插件增量=批处理管道，中等 → 备选 |
| 9 | PII 脱敏变换台 | 数据喂 AI 前本地脱敏 | 痛点真实但触发时机尴尬（手动粘贴流程反人性）→ 淘汰 |
| 10 | 网站死链诊断器 | 全站 404 体检 | 低频，Xenu 免费老牌 → 淘汰 |
| 11 | TLS 证书体检台 | 证书到期/链监控 | 与 net-sentinel 覆盖面过近 → 淘汰 |
| 12 | Docker AI 管理台 | 容器 AI 运维 | 依赖 docker 安装率假设未验证，Portainer 免费 → 淘汰 |

## 二、外部需求证据（可追溯）

**问题**：「我的接口/服务到底能扛多少 QPS？p95 延迟多少？这次优化有没有效果？」——每个后端/全栈开发者都会反复遇到；回答它要么装 JMeter（Java 重、GUI 古老、学习曲线陡），要么用 ab/wrk/k6（命令行门槛），要么上 SaaS（付费、目标暴露给第三方）。

1. **「JMeter alternative」是长青搜索主题**：2025 年仍有大量榜单文持续产出（testdriver.ai《Top 6 Alternatives to JMeter》2025-09、octoperf 20+ 工具横评、loadfocus 专门对比页），JMeter 主要被抱怨点 = 重 Java GUI + 学习曲线。需求持续、现有方案不满持续。
2. **autocannon（纯 JS 压测内核）**：npm 每周数十万下载，Fastify 官方 benchmark 指定工具，pkgpulse「autocannon vs k6 vs Artillery」定位即 *minimal setup, ideal for quick API load testing*——内核久经考验且零原生依赖。
3. **k6/Artillery 的 GUI 缺口**：k6 需要 Grafana Cloud 或自建看板才能看图；Gatling 是 JVM 工具。本地免费轻量 GUI 这一格是空的。
4. **SaaS 压测的天然摩擦**：目标 URL 要暴露给第三方云（内网/未发布接口根本压不了）——本地压测是开发者默认首选，前提是工具轻。

**竞品格局**：JMeter（重）/ k6+Grafana（链路长）/ wrk·ab（CLI）/ 云 SaaS（隐私+内网不可达）。缺口 = **本地、零依赖、图形化、可对比历史** 的轻量压测。

**Polaris 形态的独特增益**：
- 对话式压测：AI 一句话「用 50 并发压 localhost:8080/api 30 秒，再压一次加缓存的版本，给我对比」——MCP 工具驱动同一引擎，AI 解读分位数据并落对比结论。这是 JMeter/k6 都没有的形态。
- 面板实时图表 + 历史留档 + A/B 对比在宿主内闭环。
- 服务进程本地执行：内网/本机接口可直接压，数据不出本机。

## 三、加权评分（0-5 分 × 权重 → 100 分制）

| 维度 | 权重 | 得分 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4.5 | 「能扛多少 QPS / 这次优化有没有效」高频且高价值；无轻量工具时多数开发者干脆不测 |
| 需求频率与人群 | 15% | 3.5 | 后端/全栈/独立开发者高频；对纯生活用户低频（Polaris 现用户画像偏开发者） |
| 现有方案缺口 | 15% | 4.0 | JMeter 重、k6 需看板、ab/wrk CLI、SaaS 内网不可达——本地轻量 GUI 缺位 |
| 可验证差异化 | 15% | 4.0 | 对话式压测 + 历史对比 + 内网可达；autocannon 内核久经考验（非自造轮子） |
| 用户收益 | 15% | 4.0 | 30 秒出分位报告；优化前后对比一键完成；报告留档 |
| Polaris 形态适配 | 10% | 4.5 | node 服务进程跑 autocannon 天然契合；MCP 工具+面板图表+kv 留档全部现成模式 |
| 技术可行性 | 5% | 5.0 | 纯 JS 内核零原生依赖；pdf-tables/llm-probe 两条先例路径全复用 |
| 开发维护成本 | 5% | 5.0 | vendored 单文件内核；无外部服务；无凭据体系 |
| **加权总分** | | **83.5** | 对比：文件夹自动化 75 / DuckDB 71.5 / 结构化抽取 71 / Mock 69.5 / SSH 67 |

**淘汰高分备选理由**：文件夹自动化（75）败在免费竞品 DropIt/Organize 已占领「规则整理」心智，AI 增量是锦上添花且文件误操作风险面大；DuckDB（71.5）败在官方 UI 扩展进场+50MB 原生绑定打包风险。

## 四、产品定义

- **名称**：接口压测台（id: `api-bench`；命名纪律：直白功能名）
- **一句话**：把「我的接口能扛多少 QPS、p95 多少、这次改动有没有变快」变成一次 30 秒的本地压测——配置目标、实时图表、报告留档、A/B 对比，AI 一句话驱动并解读。
- **目标用户**：运行本地/内网服务的开发者（后端、全栈、独立开发、homelab 玩家）。
- **MVP 范围**：
  1. 目标配置：URL/方法/headers/body/并发数/时长/速率上限/超时
  2. 压测引擎：autocannon（vendored 纯 JS）——RPS、延迟分位（mean/p50/p90/p95/p99/max）、错误、吞吐、状态码分布
  3. 实时进度：每秒采样 RPS/延迟/错误，面板折线图（内联 SVG，零图表库）
  4. 报告留档：最近 20 次完整报告（kv），历史列表一键回看
  5. A/B 对比：任选两次 run 出 delta 表（RPS/分位延迟/错误率，方向语义正确标注）
  6. 内置试金石：`/demo/ok`、`/demo/slow?ms=`、`/demo/flaky?p=`、`/demo/echo` 四个内置端点，首次使用零配置即可验证工具本身
  7. AI 六工具：`api_bench_run / api_bench_status / api_bench_stop / api_bench_history / api_bench_report / api_bench_compare`
- **明确不做**：分布式压测、多机协同、脚本化场景编排（JMeter BeanShell 类）、TLS 客户端证书、WebSocket/gRPC 压测、断言 DSL、云上报。护栏内单机压测做深做稳。
- **成功指标**：从打开面板到看到第一份报告 ≤60 秒（试金石路径）；MCP 工具一句话完成「压测+解读」；历史对比零额外操作。

## 五、护栏与安全

- 服务只绑 `127.0.0.1` + 自生成 token（house 惯例），零外网监听面。
- 目标护栏：URL 仅允许 http/https；连接数 ≤1000、时长 ≤300s、速率上限可选——防止失控占用。
- 对非 127.0.0.1/私网目标给出明示提示（公网目标请确认拥有压测授权）——与 ab/wrk/JMeter 同类工具姿态一致，不阻断。
- 配置中敏感 headers（authorization/cookie/proxy-authorization）**落 kv 前掩码**（`****`后4位），完整值只在服务内存用于当次运行；含敏感头的完整目标保存在 `{{appConfigDir}}/api-bench/targets.json`（与宿主 config 同信任域，llm-probe profiles.json 先例）。
- 压测属「重活」：同一时刻只跑一个 run（与 llm-probe 相同的忙拒语义），可取消（abort）。
- 无定时任务、无自动重压。

## 六、架构

```
面板（React，blob 注入，desktop-first）
  └─ 字节面：POST/GET http://127.0.0.1:<meta.port>/api/*（token）
       ├─ /api/op     命令（start/stop/...）+ 直接返回
       ├─ /api/live   实时进度（500ms 轮询）
       └─ /__health   健康检查
MCP（stdio）：6 个 api_bench_* 工具 → kv 单槽信箱 api-bench.cmd
  → 服务消费执行 → api-bench.res（nonce 对齐）回读（llm-probe 模式）
服务（node + vendored autocannon）
  ├─ 引擎：autocannon run + 每秒采样（tick 轮询 instance 指标）
  ├─ 持久化：api-bench.latest / report.<id> / runs / history / settings（cap.kv，单写者）
  └─ 内置试金石端点 + 内网目标可达（服务进程本地出网，不经 cap.http）
移动端：面板读 kv（latest/history/report）——报告可看，发起压测 desktop-first（v0.1 明确边界）
```

- 与面板/AI 共用同一引擎与同一份报告库（pdf-tables 先例），口径不漂移。
- 命令双通道：面板走直连 HTTP（低延迟），MCP 走 kv 信箱（跨设备/零端口依赖）——llm-probe + pdf-tables 两条已验证路径，无新发明。
