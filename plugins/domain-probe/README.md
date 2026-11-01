# 域名诊断台（domain-probe）

把「我的域名配置对不对、邮件为什么进垃圾箱、证书什么时候过期、刚改的解析国内外生效一致吗」变成一次 30 秒的本机体检。

- **全只读**：DNS 走公共 DoH JSON API（阿里/DNSPod/Cloudflare/Google，端点固定白名单），证书走 `tls.connect` 只读取证。不发邮件、不写任何第三方系统、不存任何密钥。
- **打分 + 人话修复建议**：每条 finding 都带「为什么重要 + 怎么修」，红只给无歧义错误（语法错/过期证书/多重 SPF/超查询上限），不知道用户意图不亮红。
- **AI 对话诊断**：MCP 六工具，聊天里说「帮我看看 example.com 为什么邮件被拒信」即可。

## 功能一览

| Tab | 做什么 |
|---|---|
| 体检 | DNS 基础（NS/SOA/A/AAAA/CAA/DNSSEC）+ 邮件身份 + 证书，0-100 分报告 |
| 邮件身份 | SPF 逐 token 解析与 RFC 7208 §4.6.4 十次 DNS 查询上限计数、DMARC 标签 lint（p/pct/rua/adkim…）、DKIM 常见 selector 探测（16 个 + 自定义补充）、MX 体检（null MX / IP 字面量 / 重复） |
| 传播 | 同一条记录在 4 个公共解析器间的答案并排对比 + 一致性判定（验证解析变更是否全球生效） |
| 历史 | 最近 60 次体检留痕，点击回看完整报告 |
| 设置 | 服务管理（自举启动）、主解析器与启用解析器、超时、DKIM selector 补充 |

## MCP 工具（AI 侧）

| 工具 | 适用句式 |
|---|---|
| `dom_diagnose` | 「帮我体检一下 example.com」「域名配置有没有问题」 |
| `dom_emailauth` | 「为什么我的邮件进垃圾箱/被拒信」「检查 SPF 有没有超限」 |
| `dom_cert` | 「我的证书什么时候过期」「证书有问题吗」 |
| `dom_lookup` | 「查下 example.com 的 MX」「刚改的解析生效了吗」（`allResolvers:true` = 跨解析器对比） |
| `dom_report` | 「刚才那次体检的完整结果」 |
| `dom_history` | 「之前体检过哪些域名」「分数最近变好还是变坏」 |

## 键空间契约（权威）

所有键前缀 `dom.`（cap.kv，SqliteStorage domain=kv，跨端共享）：

| 键 | 写者 | 内容 |
|---|---|---|
| `dom.meta` | 服务 | 心跳 `{ts, version, degraded, lastBridgeErr, running:{runId,action,domain,step,startedAt}}` |
| `dom.settings` | 服务（归一回写）/ 面板、MCP 经 `settings_set` 命令表达意图 | `{primary, timeoutMs, enabledResolvers[], dkimSelectorsExtra[]}` |
| `dom.cmd` | 面板 / MCP | 单槽命令信箱 `{nonce, action, payload, at}`，服务「先删后做」消费 |
| `dom.res` | 服务 | 最近回执 `{nonce, action, at, result}`，按 nonce 对齐 |
| `dom.latest` | 服务 | 最近一次完整报告 |
| `dom.report.<runId>` | 服务 | 报告全量（保留最近 6 份，runs 索引驱动轮换清理） |
| `dom.runs` | 服务 | 报告索引 `[runId]` |
| `dom.history` | 服务 | 紧凑历史 ≤60 条 `{runId, at, kind, domain, score, counts, ok}` |

命令 action：`full` / `email` / `cert` / `lookup`（重活，互斥可取消）、`get_state` / `get_report` / `cancel` / `settings_set`。

## 架构

```
面板（宿主 webview，零网络）──dom.cmd──▶ 服务（node，唯一写者）
   │   ▲                                  │ ① DoH JSON API ×4 解析器（白名单，逐个降级）
   │   └── dom.latest / history / meta ───┤ ② tls.connect 只读取证（双重守卫后连已核验 IP）
   ▼                                      │ ③ 报告落 kv（runs 驱动轮换）
MCP（stdio）──────dom.cmd / dom.report────┘
```

安全要点：
- DoH 端点**固定白名单**（`shared/domain-core.js` RESOLVERS），不接受任意 URL；测试钩子 `DOMPROBE_DOH_OVERRIDES` 仅接受 `http://127.0.0.1` 前缀。
- 证书探测双重守卫：`isDiagnosticsSafeHost`（拒 IP 字面量/环回/内网后缀）+ DoH 解析结果逐 IP 复核（拒私网/CGNAT/链路本地/云元数据），确认公网后才对「该 IP」连接（SNI 用原域名）。
- 单任务互斥 + AbortController 可取消；DoH 并发 ≤8；全部请求带超时与响应限长。

## 验证口径

```
node test/run-tests.mjs      # 核心纯函数单测（SPF/DMARC/DKIM/守卫/评分/diff）
npm run typecheck && npm run build
node test/service-tests.mjs  # 服务集成：内存假桥 + 本地 mock DoH（真实服务进程）
node test/render-tests.mjs   # SSR 渲染断言（五 Tab/空态/护栏文案）
node test/smoke-real.mjs     # 真实桥冒烟（真实 kv + 真实 DoH + 真实 MCP 子进程，自清理）
```

## 已知边界（如实）

- DKIM 只探测常见 selector（16 个 + 用户补充）——找不到 ≠ 没配置；知道 selector 就在设置里补充。
- SPF 是静态解析与查询计数分析，不是完整求值（求值结果依赖收件方视角，无法本机模拟）。
- 传播对比是「公共解析器视图对比」，不是全球节点抽样；Cloudflare/Google 在部分网络环境不可达，会如实标注为「不可达」而不是假结果。
- 父域（org domain）推断用「最后两段」近似，未用 Public Suffix List（co.uk 类子域会推断错，此时继承提示仅供参考）。
- 中文/非 ASCII 域名请先转 punycode（xn--…）再体检。
- PTR/黑名单/邮件发送测试不做（v0.2 候选）；证书到期盯防请配合「定时任务台」定时触发 `dom_cert`。

## 服务日志

`<appConfigDir>/domain-probe/service.log`（512KB 轮转）。排障先看这里：自发现命中端口、每次判死原因、诊断任务异常栈都在里面。
