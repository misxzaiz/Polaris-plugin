# 密钥扫描台（keyscan）

把「项目里有没有裸奔的密钥」变成一次 30 秒的本地安检：扫目录、分级报、掩码存、盯新增，AI 一句话就能驱动。

## 为什么

- **gitleaks 30,564★ / trufflehog 28,814★**（2026-11-01 实测）——密钥扫描是三万人级需求品类；Truffle Security 累计融资 ~$39M。
- GitGuardian：在线可见 35,000+ 暴露密钥；**已确认有效的泄露密钥 64% 事后仍然有效**——泄露是常态且长期不修。
- AI 编程时代，agent 生成的 `.env`/脚本/配置常夹带真实密钥；push 前自查成为必备习惯。
- CLI（gitleaks/trufflehog）要装运行时+记命令+读终端，且**会把完整密钥打进终端/CI 日志**；GitHub push protection 只在 push 那一刻兜底且只管 GitHub。
- 密钥扫描台：装完即用、只读零外网、**报告全程掩码**（连存储和 AI 返回都看不到完整值）、增量基线只报「新增泄露」、AI 一句话驱动、三端同看。

## 能查什么（20 条内置规则）

🔴 严重：AWS Access Key（AKIA/ASIA）、AWS Secret、GitHub 令牌（ghp_/gho_/github_pat_）、OpenAI（T3BlbkFJ 特征/sk-proj-）、Anthropic（sk-ant-）、Google API（AIza）、Stripe 生产密钥（sk_live_）、SendGrid（SG.）、私钥文件块（-----BEGIN … PRIVATE KEY-----）

🟠 高危：阿里云 AccessKey（LTAI）、腾讯云（AKID）、智谱 GLM、DeepSeek（sk-+32hex）、Moonshot/Kimi（sk-+48位）、Slack 令牌（xox*）、微信 AppSecret（上下文+32hex）、带凭证的数据库连接串（postgres/mysql/mongo/redis://user:pass@）、可疑的密钥字面量赋值（高熵 password/secret/token=）

🟡 中危：JWT 凭证、.env 文件中的密钥形态值

**降噪四层**：占位符库（xxxx/example/your-key/${VAR}/%VAR%/顺序串…）+ 香农熵阈值 + 跳过清单（node_modules/.git/dist/lockfile/二进制/超限文件）+ 用户忽略表（指纹级）。

## 用法

**面板**（ActivityBar → 🔑）：「扫描」填目录 → 开始 → 摘要 + 进度；「发现」分级过滤/搜索/标误报；「历史」看趋势与新增；「设置」服务管理/参数/规则开关。

**对 AI 说**：
- 「帮我扫一下 D:\work\my-project 有没有泄露密钥」→ `keyscan_scan`
- 「扫出了什么？只看严重的」→ `keyscan_findings`（severity=critical）
- 「上次扫描结果如何」→ `keyscan_status`
- 「这条是示例值，别再报了」→ `keyscan_ignore`（记指纹）
- 「能查出哪些密钥」→ `keyscan_rules`

## 数据安全（本插件自身的安全姿态）

1. **只读**：引擎除自日志外不写任何文件、不执行命令、零外网请求（宿主交互仅 127.0.0.1 bridge）。
2. **掩码不变量**：发现条目只存掩码预览（前4后2）+ FNV-1a 64 指纹 + 掩码上下文行；**完整密钥值不落 cap.kv、不进日志、不进 MCP 返回**——要看原文去被扫文件里看。
3. **指纹**：FNV-1a 双通道 64bit（16 位 hex），仅作「同一密钥」身份对齐（diff/ignore），非密码学哈希，不承担安全职责（它哈希的对象本来就不被存储）。
4. **键数纪律**：发现分块存储（≤150 条/块），只保留最近 5 份扫描记录，结果键 10 分钟 TTL 清理。

## 键空间契约（权威表）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `keyscan.settings` | 面板/MCP | 服务 | root/maxFileKB/maxFiles/maxTotalMB/skipDirs/disabledRules |
| `keyscan.meta` | 服务 | 面板/MCP | 心跳 version/pid/bridge/degraded/scanning{nonce} |
| `keyscan.cmd.scan.<nonce>` | 面板/MCP | 服务（读载荷→删键互斥→执行） | `{root, at, from}` |
| `keyscan.result.<nonce>` | 服务 | MCP（读后删）；面板不用 | 命令结果 `{ok, scanId, counts…}` |
| `keyscan.scan.<id>` | 服务 | 面板/MCP | 扫描记录 running→done/failed（进度/统计/截断原因） |
| `keyscan.find.<id>.<n>` | 服务 | 面板/MCP | 发现分块 ≤150 条/块（全掩码） |
| `keyscan.latest` | 服务 | 面板/MCP | 最近完成扫描指针+汇总 |
| `keyscan.history` | 服务 | 面板/MCP | 近 20 次扫描紧凑历史 |
| `keyscan.ignore` | 面板/MCP | 服务 | `[{fp, note, at}]` 误报白名单 |
| `keyscan.ui.lastRoot` | 面板 | 面板 | 上次扫描路径（UI 偏好） |

## 已知边界（如实）

- 不感知 git（不知道文件是否被跟踪/已提交）——.env 里的密钥形态值按「中危·需确认未分发」报，不按「已泄露」报。
- 单文件默认 1MB 上限、单次 20 万文件/1GB/15 分钟上限，触顶如实标记 `truncated`（不是静默截断）。
- GBK 等非 UTF-8 文件按 UTF-8 容错解码——密钥是 ASCII，规则命中不受影响，中文上下文可能乱码。
- 不做修复（不改文件）、不上传任何字节、不做实时监控（哨兵式基线 diff 需要手动/对话触发扫描）。
- 规则库跟随新密钥形态演进（shared/scan-core.js 一处维护，面板/服务/MCP/单测四方同源）。

## 架构

```
面板（React bundle，零网络）      服务（node，只读扫描引擎）        MCP（stdio，5 工具）
  扫描/发现/历史/设置 4 Tab   ──cap.kv──▶  keyscan.* 单写者      keyscan_scan/findings/
  写 cmd.scan + 轮询记录                  遍历→规则→熵→掩码→分块     status/ignore/rules
```

shared core 模式：规则/熵/掩码/聚合/diff 全在 `shared/scan-core.js`，面板（esbuild 内联）、服务（require）、MCP（require）、单测四方共用，结论永远一致。

## 开发

```bash
npm install
npm run typecheck && npm run build   # 构建门
node test/run-tests.mjs              # 离线单测（规则/掩码/diff/降噪，零依赖）
node test/smoke-real.mjs             # 真实桥冒烟（需本机 Polaris 运行中；自清理）
```

## 验证记录（v0.1.0）

- 离线单测：29/29（规则命中/降噪/掩码不变量/指纹稳定性/聚合/diff/过滤/跳过策略）
- 构建门：`tsc --noEmit` + esbuild 通过
- 真实桥冒烟：见 test/smoke-real.mjs 输出（fixture 假密钥 → 真服务扫描 → 分块落真 kv → MCP 全闭环 → 自清理）
