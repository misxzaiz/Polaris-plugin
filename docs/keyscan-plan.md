# 密钥扫描台（keyscan）产品与选型方案

> 2026-11-01。任务背景：为 Polaris 生态补一个「工具/技术/安全」方向、有真实市场需求证据、当前 62 个插件未覆盖的生产级插件。

## 一、方向硬约束核对

- ❌ 禁止台账/记录/复盘/CRUD/家庭生活类——本方案核心动作是「**扫描并诊断泄露风险**」，属于安全工具，合格。
- ✅ 主攻方向命中：**安全/诊断**（任务书明确列举「性能/安全」「调试/诊断/观测」）。
- ✅ 命名纪律：显示名「密钥扫描台」（直白功能名）；id `keyscan`；无古典典故。

## 二、候选池与淘汰记录（先发散再收敛）

初始候选 10 项，逐个对照「62 个既有插件版图 + 平台能力 + 外部需求证据」筛选：

| # | 候选 | 判定 | 理由（可核查） |
|---|---|---|---|
| 1 | 开发者工具箱（JSON/哈希/UUID/JWT/正则/时间戳） | **淘汰·撞车** | `relay-devkit` v1.5.1 已是全功能开发者工具箱（API 客户端/JSON/SQL/数据库/时间戳），同仓同 maintainer 家族，无生态位 |
| 2 | HTTP 接口调试台（mini-Postman） | **淘汰·撞车** | relay-devkit 已含 API 客户端 + `__proxy` 跨域代理；webhook-station 覆盖回调重放 |
| 3 | 数据库/SQL 工具 | **淘汰·撞车** | relay-devkit 已含 SQL 工具 + mysql2 数据库桥 |
| 4 | 磁盘查重（重复文件清理） | **淘汰·路线冲突** | disk-radar README 明确「不做重复文件查重（哈希成本高，留给 v2）」——属宿主自家 v2 路线图，插件抢做会两败 |
| 5 | 本地文档检索 | **淘汰·撞车** | weibian 已交付（CJK 分词 + BM25） |
| 6 | 站点体检/链接巡检 | **淘汰·赛道拥挤** | page-sentinel（盯变化）、bookmark-dig（书签体检）、net-sentinel（网络探测）已把 HTTP 巡检场景切薄 |
| 7 | AI 模型竞技场（多模型同题对比） | **淘汰·平台不可行** | `caps.md` 实测结论：`cap.ai.chat` 属主仓内部通道，插件侧未开放权限映射；multichat 能用是宿主专门给了 `__POLARIS_HOST_LISTEN__` 特殊通道。需改宿主，违背插件边界 |
| 8 | Changelog 工坊（git 历史→发布说明） | **淘汰·差异化弱** | `cap.git` 插件侧未开放；服务进程 spawn git CLI 可绕，但 conventional-changelog 生态成熟，AI 生成发布说明是通用对话能力，插件化收益薄 |
| 9 | 自启动/计划任务安全审计 | **淘汰·竞品过强** | Sysinternals Autoruns 免费+权威+系统级深度插件做不到；使用频率低（装机/排查时） |
| 10 | **密钥/凭据泄露扫描台** | **✅ 中选** | 见下 |

## 三、加权评分（中选方向 vs 次优方向）

外部需求证据（2026-11-01 经 GitHub API / npm API 实测核实，agent 调研报告全文可溯）：

- **gitleaks 30,564★**（github.com/gitleaks/gitleaks）、**trufflehog 28,814★**（github.com/trufflesecurity/trufflehog）——密钥扫描是三万人级需求品类；
- **Truffle Security 累计融资 ~$39M（含 $25M B 轮）**（Tracxn）——商业需求已被资本验证；
- **GitGuardian：在线发现 35,000+ 暴露密钥；2022 年确认有效的泄露密钥 64% 事后仍然有效**（gitguardian.com/secrets-sprawl、blog.gitguardian.com）——泄露是常态且长期不修；
- DevToys README 原话印证「不贴不可信网站」的隐私动机：*"No need to use many untrustworthy websites"*；JWT 贴在线解码器属安全事件（toolbit.app 2026-08 论述）——本地掩码扫描的正交卖点；
- 次优方向对照：it-tools 41,083★/DevToys 32,162★（612,021 GitHub release 下载）证明本地工具箱品类，但本仓 relay-devkit 已占位；Bruno 47,972★ + HN 1,538 分证明本地优先开发工具需求，但本仓 HTTP 赛道已拥挤。

| 维度 | 权重 | 密钥扫描台 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4.5 | 密钥泄露是可直接变现的安全事故（云账单/数据泄露）；30k+28k★ 与 $39M 融资实证 |
| 频率与覆盖 | 15% | 4.0 | 所有写代码/管服务器的人；push 前/接手仓库/安全自查；AI 编程时代 agent 生成代码夹带硬编码密钥已是大面积现象（GitGuardian 35k+ 暴露量级） |
| 现有方案缺口 | 15% | 4.5 | 生态内 0 覆盖；外部 gitleaks/trufflehog 是 CLI（装运行时、记命令、读终端输出），GitHub push protection 只护 GitHub 且事后拦截 |
| 可验证差异化 | 15% | 4.0 | ①零安装 UI 三端可看 ②报告全程掩码（CLI 会把完整密钥打进终端/CI 日志）③增量基线（两次扫描 diff 报「新增泄露」）④AI 经 MCP 直接驱动（「帮我查这项目有没有泄露」一句话） |
| 用户收益 | 15% | 4.5 | 泄露密钥 64% 长期不修 → 持续暴露在风险中；预防性扫描收益方向明确 |
| 平台适配 | 10% | 5.0 | 三进程完美映射：service 做扫描重活（node fs 原生遍历）、panel 三端展示、MCP 供 AI 驱动；全程只读、零外网，安全姿态最优 |
| 技术可行性 | 5% | 4.5 | 规则+熵检测为确定性纯函数，house 三层验证体系完全覆盖 |
| 开发维护成本 | 5% | 4.0 | 规则库需随新密钥形态演进（低成本追加）；无外部服务依赖 |
| **加权合计** | | **88.4** | （次优方向「日志显微镜」约 72：痛点真实但终端文化下 UI 增量收益存疑，格式异构坑深，外部流行品 lnav 免费） |

淘汰条件逐条过：目标用户明确 ✓、需求证据可溯 ✓、非低频 ✓、竞品缺口真实 ✓、不依赖不存在的 API ✓、无需改宿主 ✓、数据可得（本地文件）✓、无法律风险（只读本机）✓、无外部成本 ✓、非演示型 ✓。

## 四、产品定位

- **产品名**：密钥扫描台
- **一句话**：把「项目里有没有裸奔的密钥」变成一次 30 秒的本地安检——扫目录、分级报、掩码存、盯新增，AI 一句话就能驱动。
- **目标用户**：写代码/管配置的人；并行跑 AI 编程 agent 的重度用户（agent 生成的 .env、脚本、配置常夹带真实密钥）；push 前自查习惯养成者。
- **核心场景**：①push/发布前对项目目录做一次安检 ②接手陌生仓库先扫一遍 ③定期对常用开发目录做基线巡检，只关心「新增泄露」 ④把报告丢给 AI 问「这是哪家的 key、该怎么处理」。
- **现状痛点**：gitleaks/trufflehog 要装运行时+记命令+读终端；在线解码/检测工具不敢贴真实密钥；GitHub push protection 只在 push 那一刻兜底且只管 GitHub。
- **独特价值**：本地零外网、报告掩码化（kv 里永远不存完整密钥）、增量基线哨兵、AI 一句话驱动、三端（桌面/Web/手机）同看。
- **MVP 范围**：20 条内置规则（AWS/GitHub/OpenAI/Anthropic/Google/Stripe/Slack/SendGrid/阿里云/腾讯云/智谱/DeepSeek/微信/私钥块/数据库连接串/JWT/通用赋值+.env 文件）+ 香农熵检测 + 占位符降噪 + 目录/文件跳过策略 + 掩码存储 + 基线 diff + 扫描历史。
- **明确不做**：不修复（不改任何文件）、不上传任何字节、不做 git 感知（不解析 .git 对象）、不做 IDE 实时监控、不做密钥轮换自动化。
- **成功指标**：单测全绿（规则命中/掩码/diff/跳过）；真实桥冒烟 N/N；扫描 10k 文件目录 ≤60s；误报可控（占位符/测试值零误报）。

## 五、架构（三进程 + 键空间契约）

```
面板（ks-root React bundle）        服务（service/main.js，node）         MCP（mcp/server.js，stdio）
  扫描/发现/历史/设置 4 Tab    ──kv──▶  唯一写者：扫描引擎            keyscan_scan/findings/status/
  写 cmd.scan.<nonce>                  消费命令键（先删后做）          ignore/rules 5 工具
  轮询 result/scan/find 键             遍历→规则→熵→掩码→分块落 kv      （读经 kv，写 ignore/settings/cmd）
```

### 键空间契约（权威表，前缀 `keyscan.`）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `keyscan.settings` | 面板/MCP | 服务 | 默认根目录/忽略目录/大小上限/规则开关 |
| `keyscan.meta` | 服务 | 面板/MCP | 心跳 version/pid/bridge/degraded/scanInProgress |
| `keyscan.cmd.scan.<nonce>` | 面板/MCP | 服务（先删后做） | 扫描命令 {root, at, nonce} |
| `keyscan.result.<nonce>` | 服务 | 面板/MCP（读后删） | 命令结果 {ok, scanId, error?} |
| `keyscan.scan.<id>` | 服务 | 面板/MCP | 扫描摘要+进度 {at,root,files,done,progress,counts,newCounts,error} |
| `keyscan.find.<id>.<n>` | 服务 | 面板/MCP | 发现分块（≤150 条/块，值内全部掩码） |
| `keyscan.latest` | 服务 | 面板/MCP | 最近完成扫描 id 指针 + 汇总 |
| `keyscan.history` | 服务 | 面板/MCP | 近 20 次扫描紧凑历史 |
| `keyscan.ignore` | 面板/MCP | 服务 | 误报白名单 [{fingerprint,note,at}]（diff 与报告时过滤） |

### 安全设计（本插件自身的安全姿态）

1. **只读**：引擎代码路径无任何写文件操作（除自日志）；不碰被扫文件内容之外的东西。
2. **零外网**：不 fetch 任何地址；与宿主交互仅 127.0.0.1 bridge。
3. **掩码存储**：发现条目只存 `maskedPreview`（前 4 后 2）+ `fp`（完整匹配 sha256 指纹）+ 掩码后上下文行；**完整密钥值不落 kv、不进日志、不进 MCP 返回**。要看原文去文件里看。
4. **降噪**：占位符（`xxxx`/`{{`/`%VAR%`/`your-key`/`change-me`…）跳过；`node_modules/.git/dist/build/lockfile/二进制/超限文件` 跳过；`process.env` 引用行跳过。
5. **危险面为零**：无删除、无命令执行、无网络副作用 → 无需 confirm 门的破坏性操作；「清空本插件数据」是唯一删除面（仅动 `keyscan.*` 前缀）+ 二次确认。

## 六、验证计划（三层）

1. 离线单测：18 规则各命中/不命中用例（假密钥）、掩码不变量（掩码输出不含完整密钥）、熵阈值边界、占位符降噪、跳过策略、diff 新增/已修、忽略表过滤。
2. 构建门：`tsc --noEmit` + esbuild。
3. 真实桥冒烟：临时 fixture 目录（假密钥）→ 真服务 spawn 自发现 → cmd.scan 真闭环 → find 分块落真 kv（校验掩码不变量）→ MCP initialize/tools/list/tools/call 全闭环 → 自清理（杀进程+删光 keyscan.* 键+删 fixture）。

## 七、发布

按交付链：pack → update.json 同步 → index.json 手动追加条目（先重读现文件）→ 单主题 commit → push main → GET purge jsdelivr → 三 URL（manifest/zip/index）200 实测。
