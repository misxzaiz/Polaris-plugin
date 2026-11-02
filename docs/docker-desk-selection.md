# 选型文档：容器工作台（docker-desk）

> 2026-11-03 · 第 61 号插件选型记录。方向硬约束（2026-11-01 用户定案）：台账/记录/家庭生活类一律不进候选池；主攻工具/技术/调试诊断/自动化执行/内容变换。本选型核心动作是「诊断了/操作了容器」，合格。

## 一、生态饱和度盘点（先内后外）

Polaris-plugin 现 89 个已上架条目（index.json 实测），另有 4 个并行在建（data-query / flow-pipeline / process-desk / stack-lens，均为纯 docs 状态）。与本选型相关的既有覆盖：

| 既有插件/能力 | 覆盖 | 与本选型关系 |
|---|---|---|
| pocket-host 口袋主机 | **远程**主机 SSH 监控/按端口杀进程 | 不碰本机 Docker/容器 |
| net-sentinel 网哨 | TCP 探测/测速/断网事件 | 不碰容器 |
| process-desk（在建） | 本机进程×端口×文件锁诊断 | 容器在其"端口占用"视图里只是一串数字，无容器语义 |
| db-workbench | 数据库连接查询 | 无容器概念 |
| stack-lens（在建）/ log-lens / har-lens / stream-desk / webhook-station / api-bench | 各类调试面 | 均不接 Docker Engine |
| 宿主 GitPanel / Terminal / ExecutionConsole | Git 与终端 | 无容器运维面（`grep -ri docker src-tauri/src` 仅 2 处无关命中） |
| **89 插件全量 grep docker** | **零覆盖**（仅 node_modules 噪音） | **空白确认** |

## 二、候选池（≥10，全部过方向硬闸；历史否决不再翻案）

历史会话已否决项不重复论证（i18n/TOTP/whisper/ffmpeg/ReDoS/.env/OpenAPI diff/Schema diff/license/字体/二维码/TLS哨兵/归档乱码/像素对比/重复文件/JSON转代码/正则台/mock台/API客户端台/本地SQL/进程医生/日志台/密钥扫描/文件整理/Git体检）。

本轮新池：

| # | 候选 | 简评 | 处置 |
|---|---|---|---|
| 1 | **容器工作台 docker-desk**（Docker Engine 管理+日志+AI 诊断+MCP） | 见下 | ✅ **定案 88.0** |
| 2 | 本地知识库 RAG 问答台 | AnythingLLM/Cherry Studio 验证需求，但 weibian(BM25)/amber(网页抽取)/context-pack(打包) 三面贴边；embedding 成本模型复杂；检索质量=产品命门 | 73.0 落选 |
| 3 | 依赖升级智能台（outdated→changelog→AI 破坏性变更摘要→升级清单） | npm-check-updates/renovate 存在；dep-probe 占「依赖」心智（漏洞向）；触发频率=发版周期 | 69.0 落选 |
| 4 | SSH 隧道管理台 | niche，pocket-host 贴边 | 61 落选 |
| 5 | MQTT/IoT 调试台 | MQTT Explorer 免费成熟 | 58 落选 |
| 6 | Windows 事件日志诊断台 | 受众窄，process-desk 贴边 | 63 落选 |
| 7 | AI 长文精炼台（map-reduce） | 宿主 AI 会话贴边，质量风险 | 64 落选 |
| 8 | 代码库文档生成台 | AI 会话+context-pack 贴边 | 62 落选 |
| 9 | 实时抓包台 | TLS 拦截=证书安装=安全责任过重 | 60 落选 |
| 10 | 数据合成台（schema→测试数据） | 在线工具泛滥，差异化弱 | 55 落选 |
| 11 | Mermaid 图表台 | 宿主已带 mermaid 渲染；excalidraw 强 | 59 落选 |
| 12 | 终端增强台 | **宿主已有完整 xterm Terminal 组件**（src/components/Terminal 实证） | 直接淘汰 |

## 三、市场证据（外部，可追溯）

### 3.1 Docker Desktop 的痛是真实、重复、多源的

- 内存泄漏与限额失效：[Channels 社区实测帖](https://community.getchannels.com/t/docker-desktop-windows-memory-leak/39009)、[Docker 官方论坛「eats memory despite limit」](https://forums.docker.com/t/docker-desktop-eats-memory-despite-limit/139981/2)
- 需要每 30–60 分钟重启一次才能维持性能：[r/docker 用户帖](https://www.reddit.com/r/docker/comments/1p8thgb/docker_desktop_windows_memory_help)
- WSL2/Hyper-V 虚拟化分层导致容器操作 30 秒级：[docker/for-win#14020](https://github.com/docker/for-win/issues/14020)、[官方论坛 slow on linux and windows](https://forums.docker.com/t/docker-extremely-slow-on-linux-and-windows/129752/2)
- 2025 年轻量替代盘点（Podman Desktop/Rancher/Colima）本身就是需求存在的证明：[Medium: Docker Desktop Alternatives](https://medium.com/digio-australia/exploring-the-options-docker-desktop-alternatives-for-developers-6c6bee7ec0db)

### 3.2 轻量容器 UI 有被验证过的大众需求

- [lazydocker](https://www.devtoolsdaily.com/directory/devtoolsdaily) 约 **15K GitHub stars**、ctop 约 8.6K——「不开 Docker Desktop 就能看容器/日志/资源」是独立被验证的产品形态（HN 专帖讨论）。
- Portainer 定位是服务器/团队部署的 Web 控制台，本地开发场景下嫌重；且其日志能力是传统查看/过滤（[Portainer 官方博客 2026 监控盘点](https://portainer.io) 无 AI 诊断）。

### 3.3 AI 容器诊断的竞品格局（诚实评估）

- Docker Desktop 内置 **Ask Gordon**（beta）：能读容器/日志并提议修复——是最近的竞品。但①绑定在用户正在抱怨的 Docker Desktop 本体内；②beta 且 2026 年初被 Noma Labs 披露过 AI 执行链漏洞（DockerDash，已修补）；③环境数据交给 Docker 云端，隐私敏感用户介意。
- **差异化落点**：本插件的 AI 走宿主 AI（用户自有 provider/会话），且以 **MCP 工具**形态让主会话 AI 主动查容器（dk_ps/dk_logs/dk_inspect…）——「AI 看得见我的容器」是独立应用给不了的平台特性；日志/inspect 数据不出本机（只进用户已配置的 AI 会话）。

## 四、加权评分（痛点20/频率15/缺口15/差异15/收益15/适配10/可行5/成本5 → ×20 归一百分）

| 维度 | docker-desk | RAG 台 | 依赖升级台 |
|---|---:|---:|---:|
| 痛点强度 20% | 4.5（Docker Desktop 慢/泄漏/重启是高频卡点；容器排障 EADDRINUSE/崩溃循环高焦虑） | 4.0 | 3.5 |
| 频率×人群 15% | 4.0（用容器的开发者每天碰） | 3.0 | 3.0 |
| 缺口 15% | 5.0（89 插件+宿主零覆盖） | 3.5（三插件贴边） | 3.0 |
| 差异化 15% | 4.0（MCP+本地 AI 诊断；Gordon 绑重客户端） | 4.0 | 3.5 |
| 收益 15% | 4.0（秒级答「谁占了端口/为何崩/能否删」） | 4.0 | 3.5 |
| 适配 10% | 5.0（本机 CLI/IPC 驱动、零外网、house 成熟范式全覆盖） | 3.5（embedding 外部依赖+成本） | 4.0 |
| 可行 5% | 4.5（Engine API 文档稳定；mock 引擎可测） | 3.5 | 4.0 |
| 成本 5% | 4.5（零外部成本、零重型依赖） | 3.0 | 4.0 |
| **加权总分** | **88.0** | 73.0 | 69.0 |

## 五、决策记录

1. **选 docker-desk**：唯一一个「89 插件+宿主」双零覆盖且日常高频的方向；痛点证据多源且具体；平台适配（本机服务+MCP+面板）全部踩在 house 已验证的范式上。
2. **不选 RAG 台**：与 weibian/amber/context-pack 三个已交付插件能力贴边，检索质量风险高、外部 embedding 成本模型复杂，MVP 面太大。
3. **不选依赖升级台**：触发频率受限于发版周期，且 dep-probe 已占「依赖体检」心智。
4. **最有力的需求证据**：lazydocker 15K stars + Docker Desktop 多源抱怨 + 生态零覆盖三者交叉。
5. **最大不确定性**：本机未装 Docker（已实测 `docker --version` 不存在），真机容器操作只能靠「本地 TCP mock Engine（按官方 Engine API 文档构造响应）全链路验证」+ 真桥冒烟（验证宿主集成/服务发现/docker 缺席的诚实降级路径）。真机 Docker Desktop 实测列为交付后待用户验证项，**如实报告不虚报**。
6. **止损线**：若 mock 全链路中发现 Engine API 协议层有无法在离线条件下验证的关键行为（如 named pipe 鉴权细节），在 README 与交付报告明示「实现完成，真机 Docker 验证待补」，不谎报通过。

## 六、产品规格（简）

- **名称**：容器工作台（id: docker-desk，显示名直白功能名；kv 前缀 `dkd.`；service 兜底端口 9895）
- **一句话**：不开 Docker Desktop，在 Polaris 里看容器/查日志/盯资源/删垃圾，AI 经 MCP 工具直接「看见」你的容器并解释报错——数据不出本机。
- **目标用户**：本机跑 Docker（Desktop/Engine）的开发者；被 Docker Desktop 卡顿折磨、只想轻量看一眼容器状态/日志的人；想让主会话 AI 具备容器上下文的人。
- **MVP**：引擎探测（named pipe/unix socket/TCP/DOCKER_HOST）、容器列表（含 compose 项目 label 分组）、启停重启（面板确认）、日志 tail+follow 流式、单容器 stats（CPU%/内存/网络）、镜像列表与删除、磁盘占用（system df + 可回收）、事件流水（环形缓冲）、AI 只读 MCP 八工具、docker 缺席诚实降级。
- **暂不做**：compose 编排命令（up/down，需 CLI）、镜像构建、多引擎/远程 TLS、swarm/k8s、容器终端 exec（安全面大，后续评估）、日志持久化（内存环形缓冲，不落盘）。
- **成功标准**：官方 API 响应结构夹具下解析 100%；fake-bridge+fake-engine 全链路集成绿；MCP stdio 子进程全链路绿；typecheck+esbuild 绿；真桥冒烟（宿主集成+服务发现+docker 缺席降级）绿。
