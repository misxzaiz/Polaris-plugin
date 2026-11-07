# 选型文档：进程透视台（process-desk）

> 2026-11-03 · 第 56 号插件选型记录。方向硬约束（2026-11-01 用户定案）：台账/记录/家庭生活类一律不进候选池；主攻工具/技术/调试诊断/自动化执行/内容变换。

## 一、生态饱和度盘点（先内后外）

Polaris-plugin 现 87 条目（含今日并行交付的 flow-pipeline / data-query / deadcode-lens / diff-desk）。与本选型相关的既有覆盖：

| 既有插件 | 覆盖 | 与本选型关系 |
|---|---|---|
| pocket-host 口袋主机 | **远程**主机监控/告警/**按端口杀进程**（SSH 到远端机器） | 本机进程/端口/文件锁诊断**不在其射程** |
| net-sentinel 网哨 | 网络质量探测（TCP 探测/断网事件/测速） | 不碰进程与端口占用归属 |
| disk-radar 磁盘雷达 | 空间解剖/垃圾锚定/隔离区 | 不碰「谁锁了文件」 |
| task-runner / flow-pipeline | 定时执行 / 多步流水线 | 执行器，非诊断器 |
| stream-desk / webhook-station / api-bench / har-lens | 流量侧调试 | 均不回答「端口被谁占用」 |
| mock-server / keyscan / relay-devkit / dev-toolbox | 已占位候选 | 见候选池排除记录 |

**结论：本机「进程×端口×文件锁」三视角诊断在 87 个条目里零覆盖。**

## 二、候选池（≥10，全部过方向硬闸）

1. **进程透视台（process-desk）** —— 端口占用归属（EADDRINUSE）、文件占用者定位（Restart Manager）、进程全景（同名多实例高亮）、护栏 kill、AI 对话式运维。✅ 入围
2. 压缩包工坊（zip 乱码根治/预览/批量解压）—— 需求真（Microsoft Answers 有专帖、V2EX 多帖），但 **Bandizip/NanaZip 免费成熟且自动识别 GBK**，缺口分低。❌ 竞品压分
3. 视频变换台（ffmpeg）—— 第 55 号选型已否决（~100MB 二进制顶 CDN 50MB 红线、本质 ffmpeg GUI）。本会话复核：差异化提升空间有限，维持否决。❌
4. i18n 工具台 —— 第 55 号选型已否决（Polaris 本身中文单语，受众窄）。维持。❌
5. TOTP 2FA 台 —— 第 55 号选型已否决（Ente Auth/KeePassXC 免费补位 + 安全责任过重）。维持。❌
6. 音频转写台（whisper）—— 第 55 号选型已否决（模型下载 + CPU 慢 + 免费竞品强）。维持。❌
7. 视觉像素对比台（UI 截图 diff）—— 频率低-中，diff-desk 已占「对比」心智但不含像素；可行性中。❌ 频率不足
8. 重复文件猎手 —— disk-radar 垃圾锚定 + file-flow 整理已贴边，增量窄。❌
9. JSON→代码生成台 —— relay-devkit/dev-toolbox 贴边 + 网页竞品一堆，差异化弱。❌
10. 本地 HTTPS 证书台（mkcert-lite）—— 真痛点但低频，X.509 自实现复杂度高。❌ 可作后续小插件
11. 发布台（CHANGELOG/版本三处同步）—— scripts/publish-plugin.mjs 已自动化大部分，插件增量小。❌
12. 签名调试台（第 55 号选型遗留备注）—— 极窄频。❌

## 三、市场证据（方向 1）

- **端口占用**：`EADDRINUSE` 是 Stack Overflow 长青顶级话题——[主帖及关联链](https://stackoverflow.com/questions/linked/39632667?sort=votes)数千赞，Windows 标准答案 `netstat -ano | findstr :PORT` + `taskkill` 是每个 Node/前端开发者的必经之路；[专题博文](https://dilshankelsen.com/solve-eaddrinuse-address-already-in-use)亦反复引用。**痛点高频且现有解法全靠记命令。**
- **文件占用**：「文件被另一个程序占用无法删除」是 Windows 经典投诉：[知乎专文](https://zhuanlan.zhihu.com/p/158119424)、[微软 Answers 案例](https://learn.microsoft.com/zh-cn/answers/questions/4368998/win11)。标准答案要么是 5 步深的 resmon「关联的句柄」（Win+R → CPU 页 → 展开 → 搜索 → 右键），要么另装 Unlocker/Process Explorer/火绒——**内置工具埋没、第三方工具需要额外下载与信任**。
- **竞品格局**：任务管理器无端口视角；resmon 有端口/句柄但交互笨重、无 AI 集成；Sysinternals TCPView/Handle 需单独下载+接受 EULA；`npx kill-port` 只管端口不管文件锁且要临时 npm 环境。**没有一个「已经在跑的桌面应用里顺手就有 + AI 能自然语言驱动」的形态。**
- **本人实证**：Polaris 主仓多实例连点出 3 实例、detect_claude 进程风暴 11.3 万次/天、插件端口占用迫使 mail-desk 做向后探测——端口/僵尸进程在本机是每周级事件（记忆 polaris-desktop-startup-slow-root-cause / polaris-host-dispatch-wedge-and-kv-list）。

## 四、评分（方向 1；权重×5 分制→100）

| 维度 | 权重 | 得分 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 5 | EADDRINUSE 顶级长青话题 + 文件占用经典投诉；本机有每周级实证 |
| 频率与覆盖人群 | 15% | 4 | 开发者每周级（端口）、全体 Windows 用户月度级（文件锁） |
| 现有方案缺口 | 15% | 4 | resmon 埋没 5 步深 / Sysinternals 另装 / 无任何 AI 驱动形态；生态零覆盖 |
| 可验证差异化 | 15% | 4 | 三视角合一 + 护栏 kill + MCP 自然语言运维（「谁占 9829？杀掉」）；pocket-host 只管远程 |
| 用户收益与价值 | 15% | 4 | 每次事故从「翻命令/翻菜单数分钟」到「一句话秒级定位+一键结束」 |
| 插件形态适配 | 10% | 5 | 面板+服务+MCP 三件套 house 范式；kvclient/cap.kv 心跳通路全部已验证 |
| 技术可行性 | 5% | 5 | 零外部二进制、零 CDN 风险：netstat/Win32_Process/Restart Manager 全系统内置 |
| 开发维护成本 | 5% | 4 | 服务层薄（PS 封装+解析）；kill 护栏是唯一需要克制的部分，已有一级设计 |

**加权：5×4+4×3+4×3+4×3+4×3+5×2+5×1+4×1 = 20+12+12+12+12+10+5+4 = 87/100。**

## 五、决策与止损

- **选**：process-desk 进程透视台。核心动作 = 「诊断了什么 + 结束了什么（带护栏）」，完全合规于方向硬闸。
- **最大不确定性**：用户是否习惯在 Polaris 里做进程操作而不是开任务管理器。验证方式：交付后看守望台 MCP 调用量与面板查询量。
- **止损**：若 PS 封装在真实环境不稳，先保「端口归属 + netstat 解析 + 护栏 kill」（netstat 是最稳路径）；Restart Manager 文件锁降级为「只报告不支持平台」并如实标注。
- **MVP 明确不做**：进程创建/挂起/优先级调整、开机启动项管理、服务管理（services.msc 语义）、按窗口定位进程、性能历史曲线、非 Windows 平台支持（PowerShell 依赖；非 win32 平台服务可用但接口明确返回不支持）。

## 六、安全设计要点（kill 是唯一危险动作）

1. 服务只绑 `127.0.0.1`；Host 头白名单（防 DNS rebinding）；强制 `x-pdesk-client` 头（浏览器侧必触发 CORS 预检，天然防 drive-by 表单 POST）。
2. kill 两阶段：`arm`（取令牌，60s TTL）→ `fire`（令牌 + PID 复用校验：重新查询进程名与 arm 时一致才执行）。
3. 护栏单源在 `shared/core.js::evaluateKill`：系统关键进程硬拒（csrss/lsass/svchost/explorer 等，杀之即 BSOD/断桌面）；服务自身与祖先链拒杀（结构性保护在跑的 Polaris）；Polaris 同名僵尸实例需 `allowProtected` 二次确认。
4. 全部 kill 动作入 `pdesk.audit` 审计环（单键，上限 120 条，服务单写者）。
